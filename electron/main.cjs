const { app, BrowserWindow, shell, ipcMain, desktopCapturer, Tray, Menu, globalShortcut, Notification, nativeImage, protocol, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const https = require('https');
const http = require('http');
const { spawn } = require('child_process');
const { uIOhook, UiohookKey } = require('uiohook-napi');

// Reverse map for uIOhook keycodes -> String (e.g. 'Space', 'A', 'Alt')
const uiohookToKeyString = {};
for (const [keyName, code] of Object.entries(UiohookKey)) {
  uiohookToKeyString[code] = keyName;
}

const {
  Room,
  AudioSource,
  AudioFrame,
  LocalAudioTrack,
  TrackPublishOptions,
  TrackSource,
  dispose,
} = require('@livekit/rtc-node');
console.log('[main] loaded');

let livekitAppAudioConfig = {
  url: process.env.LIVEKIT_URL || null,
  token: null,
};

let livekitAudioRoom = null;
let livekitAppAudioSource = null;
let livekitAppAudioTrack = null;
let livekitAppAudioPublication = null;
let livekitAppAudioConnected = false;

const debugLogPath = path.join(app.getPath('temp'), 'drocsid-main.log');
const debugLog = (msg) => {
  try {
    fs.appendFileSync(debugLogPath, `[${new Date().toISOString()}] ${msg}\n`);
  } catch {}
};

// Force app name early
app.name = 'Drocsid';

// Register custom protocol as privileged before app is ready
protocol.registerSchemesAsPrivileged([
  { scheme: 'drocsid', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } }
]);

let mainWindow = null;
let tray = null;
let isQuitting = false;

function createWindow() {
  // Use logo.png or favicon.png
  const possibleIcons = [
    path.join(__dirname, '../public/logo.png'),
    path.join(__dirname, '../public/logo-bg.png'),
    path.join(__dirname, '../public/favicon.png'),
    path.join(__dirname, '../logo-opaque.png'),
    path.join(__dirname, '../logo.png'),
    path.join(__dirname, '../favicon.png'),
    path.join(__dirname, '../public/logo.png'),
    path.join(__dirname, 'icon.png')
  ];
  const iconPath = possibleIcons.find(p => fs.existsSync(p)) || possibleIcons[0];

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 720,
    minWidth: 800,
    minHeight: 600,
    icon: iconPath,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.cjs'),
      backgroundThrottling: false,
    },
    autoHideMenuBar: true,
    title: "Drocsid",
  });

  if (process.platform === 'win32') {
    app.setAppUserModelId("com.drocsid.app");
  }

  const startUrl = process.env.ELECTRON_START_URL || `drocsid://app/index.html`;
  
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http')) {
      shell.openExternal(url);
      return { action: 'deny' };
    }
    return { action: 'allow' };
  });

  const handleAuthRedirect = (event, url) => {
    // Catch Supabase OAuth redirects either to .run.app, .onrender.com or custom domains
    const isAuthCallback = (url.includes('#access_token=') || url.includes('?code='));
    const isKnownDomain = url.includes('.run.app') || url.includes('.onrender.com') || url.includes('localhost:3000') || url.includes('drocsid://');
    
    if (isAuthCallback && isKnownDomain) {
      event.preventDefault();
      const urlObj = new URL(url);
      const finalUrl = `${startUrl}${urlObj.search}${urlObj.hash}`;
      mainWindow.loadURL(finalUrl);
      return;
    }

    // Safety fallback: Prevent navigating mainWindow away to raw external media/archive files
    if (url.match(/\.(png|jpg|jpeg|gif|webp|svg|mp4|webm|mp3|wav|ogg|pdf|zip|exe|tar|gz)$/i)) {
      event.preventDefault();
      shell.openExternal(url);
    }
  };

  mainWindow.webContents.on('will-navigate', handleAuthRedirect);
  mainWindow.webContents.on('will-redirect', handleAuthRedirect);

  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow.hide();
      return false;
    }
  });

  mainWindow.webContents.session.setPermissionRequestHandler((webContents, permission, callback) => {
    const allowedPermissions = ['media', 'mediaKeySystem', 'microphone', 'camera'];
    if (allowedPermissions.includes(permission)) {
      callback(true);
    } else {
      callback(false);
    }
  });

  mainWindow.loadURL(startUrl);
}

function createTray() {
  const possibleIcons = [
    path.join(__dirname, '../public/logo.png'),
    path.join(__dirname, '../public/logo-bg.png'),
    path.join(__dirname, '../public/favicon.png'),
    path.join(__dirname, '../logo-opaque.png'),
    path.join(__dirname, '../logo.png'),
    path.join(__dirname, '../favicon.png'),
    path.join(__dirname, '../public/favicon.ico'),
    path.join(__dirname, 'icon.png'),
    path.join(process.resourcesPath, 'public/logo-bg.png'),
    path.join(process.resourcesPath, 'logo-opaque.png'),
    path.join(process.resourcesPath, 'logo.png'),
    path.join(process.resourcesPath, 'favicon.png'),
    path.join(process.resourcesPath, 'app/public/logo-bg.png'),
    path.join(process.resourcesPath, 'app/logo-opaque.png'),
    path.join(process.resourcesPath, 'app/logo.png'),
    path.join(process.resourcesPath, 'app/favicon.png')
  ];
  const iconPath = possibleIcons.find(p => fs.existsSync(p));
  
  if (!iconPath) {
    console.error("Could not find icon for tray. Tray might be invisible.");
    // Log available resources and current path to help debug
    console.log("Current __dirname:", __dirname);
    if (fs.existsSync(process.resourcesPath)) {
        console.log("Resources path:", process.resourcesPath);
        try {
            console.log("Resources path contents:", fs.readdirSync(process.resourcesPath));
            const appPath = path.join(process.resourcesPath, 'app');
            if (fs.existsSync(appPath)) {
                console.log("App path contents:", fs.readdirSync(appPath));
            }
        } catch (e) {
            console.log("Error reading resources path:", e);
        }
    }
    tray = new Tray(nativeImage.createEmpty());
  } else {
    console.log("Found tray icon at:", iconPath);
    let img = nativeImage.createFromPath(iconPath);
    if (img.getSize().width > 32) img = img.resize({ width: 24, height: 24 });
    tray = new Tray(img);
  }

  const contextMenu = Menu.buildFromTemplate([
    { label: 'Ouvrir Drocsid', click: () => mainWindow.show() },
    { type: 'separator' },
    { label: 'Quitter', click: () => {
        isQuitting = true;
        app.quit();
      } 
    }
  ]);
  tray.setToolTip('Drocsid');
  tray.setContextMenu(contextMenu);
  tray.on('click', () => {
    mainWindow.show();
  });
}

// ─── Tray Icons Cache ──────────────────────────────────────────────────────
function loadTrayIcons() {
  const load = (names) => {
    const bases = [
      path.join(__dirname, '../public'),
      path.join(__dirname, '../public/tray'),
      path.join(__dirname, '../dist'),
      path.join(__dirname, '../dist/tray'),
      path.join(__dirname, '..'), // For some electron builder setups
      path.join(process.resourcesPath, 'app.asar/dist'),
      path.join(process.resourcesPath, 'app.asar/public'),
      path.join(process.resourcesPath, 'app/dist'),
      path.join(process.resourcesPath, 'app/public'),
      path.join(process.resourcesPath, 'app'),
    ];
    
    for (const base of bases) {
      if (fs.existsSync(base)) {
        for (const name of names) {
          const p = path.join(base, name);
          if (fs.existsSync(p)) {
             try {
               let img = nativeImage.createFromPath(p);
               if (!img.isEmpty()) {
                 const size = img.getSize();
                 if (size.width > 64 || size.width === 0) {
                   img = img.resize({ width: 24, height: 24 });
                 }
                 return img;
               }
             } catch (e) {
               console.error("Error loading image:", e);
             }
          }
        }
      }
    }
    
    // Fallback to basic app icons if specific state icon not found
    for (const base of bases) {
      if (fs.existsSync(base)) {
        for (const name of ['favicon.ico', 'favicon.png', 'logo.png', 'logo-bg.png']) {
          const p = path.join(base, name);
          if (fs.existsSync(p)) {
             try {
               let img = nativeImage.createFromPath(p);
               if (!img.isEmpty()) {
                 const size = img.getSize();
                 if (size.width > 64 || size.width === 0) {
                   img = img.resize({ width: 24, height: 24 });
                 }
                 return img;
               }
             } catch (e) {
               console.error("Error loading fallback image:", e);
             }
          }
        }
      }
    }
    
    return nativeImage.createEmpty();
  };

  return {
    default:   load(['tray-default.png', 'favicon.png', 'logo.png']),
    muted:     load(['tray-muted.png', 'favicon.png', 'logo.png']),
    deafened:  load(['tray-deafened.png', 'favicon.png', 'logo.png']),
    speaking:  load(['tray-speaking-on.png', 'tray-speaking.png', 'favicon.png', 'logo.png']),
    silent:    load(['tray-speaking-off.png', 'tray-silent.png', 'favicon.png', 'logo.png']),
  };
}

let trayIcons = null;

// ─── IPC — mise à jour de l'icône tray ────────────────────────────────────
ipcMain.on('tray-update', (_event, state) => {
  if (!tray) return;
  if (!trayIcons) trayIcons = loadTrayIcons();

  const { inVoice, isMuted, isDeafened, isSpeaking } = state;

  if (!inVoice) {
    tray.setImage(trayIcons.default);
    tray.setToolTip('Drocsid');
  } else if (isDeafened) {
    tray.setImage(trayIcons.deafened);
    tray.setToolTip('Drocsid — Sourdine active');
  } else if (isMuted) {
    tray.setImage(trayIcons.muted);
    tray.setToolTip('Drocsid — Micro coupé');
  } else {
    tray.setImage(isSpeaking ? trayIcons.speaking : trayIcons.silent);
    tray.setToolTip(isSpeaking ? 'Drocsid — En train de parler' : 'Drocsid — En communication');
  }

  // Build context menu based on state
  const menuTemplate = [
    { label: 'Ouvrir Drocsid', click: () => { if (mainWindow) mainWindow.show(); } },
    { type: 'separator' }
  ];

  if (inVoice) {
    menuTemplate.push({
      label: isMuted ? 'Activer le micro' : 'Rendre muet',
      click: () => { if (mainWindow) mainWindow.webContents.send('toggle-mute-global'); }
    });
    menuTemplate.push({
      label: isDeafened ? 'Désactiver la sourdine' : 'Mettre en sourdine',
      click: () => { if (mainWindow) mainWindow.webContents.send('toggle-deafen-global'); }
    });
    menuTemplate.push({
      label: 'Déconnexion',
      click: () => { if (mainWindow) mainWindow.webContents.send('disconnect-voice-global'); }
    });
    menuTemplate.push({ type: 'separator' });
  }

  menuTemplate.push({
    label: 'Quitter',
    click: () => {
      isQuitting = true;
      app.quit();
    }
  });

  tray.setContextMenu(Menu.buildFromTemplate(menuTemplate));
});

let uiohookAvailable = true;

try {
  uIOhook.start();
} catch (err) {
  uiohookAvailable = false;
  console.error('uIOhook start error:', err);
}

// Global Shortcuts dynamic configuration
ipcMain.on('update-shortcuts', (event, shortcuts) => {
  globalShortcut.unregisterAll();

  if (uiohookAvailable) return;

  if (shortcuts?.mute) {
    globalShortcut.register(shortcuts.mute, () => {
      if (mainWindow) mainWindow.webContents.send('toggle-mute-global');
    });
  }

  if (shortcuts?.deafen) {
    globalShortcut.register(shortcuts.deafen, () => {
      if (mainWindow) mainWindow.webContents.send('toggle-deafen-global');
    });
  }
});

// Badges
ipcMain.on('set-badge', (event, count) => {
  if (app.setBadgeCount) {
    app.setBadgeCount(count);
  }
});

// Notifications
ipcMain.on('show-notification', (event, { title, body }) => {
  new Notification({ title, body, icon: path.join(__dirname, '../public/logo.png') }).show();
});

ipcMain.on('set-launch-at-startup', (event, enabled) => {
  app.setLoginItemSettings({
    openAtLogin: enabled,
    path: app.getPath('exe'),
  });
});

// --- File-backed localStorage sync for session resilience ---
const storageFilePath = path.join(app.getPath('userData'), 'drocsid-settings.json');
let writeTimeout = null;
let storageCache = null;

function readStorage() {
  if (storageCache) return storageCache;
  try {
    if (fs.existsSync(storageFilePath)) {
      const content = fs.readFileSync(storageFilePath, 'utf8');
      storageCache = JSON.parse(content);
      return storageCache;
    }
  } catch (err) {
    console.error('[Electron Storage] Error reading storage file:', err);
  }
  storageCache = {};
  return storageCache;
}

function writeStorageDebounced() {
  if (writeTimeout) clearTimeout(writeTimeout);
  writeTimeout = setTimeout(() => {
    try {
      const dir = path.dirname(storageFilePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(storageFilePath, JSON.stringify(storageCache, null, 2), 'utf8');
    } catch (err) {
      console.error('[Electron Storage] Error writing storage file:', err);
    }
  }, 200); // 200ms debounce
}

ipcMain.handle('get-saved-storage', () => {
  return readStorage();
});

ipcMain.on('save-storage-key', (event, { key, value }) => {
  const data = readStorage();
  data[key] = value;
  writeStorageDebounced();
});

ipcMain.on('remove-storage-key', (event, key) => {
  const data = readStorage();
  delete data[key];
  writeStorageDebounced();
});

function downloadUrl(url, filePath, redirectCount = 0) {
  return new Promise((resolve, reject) => {
    if (redirectCount > 5) {
      reject(new Error('Too many redirects'));
      return;
    }
    const protocol = url.startsWith('https') ? https : http;
    protocol.get(url, (response) => {
      if (response.statusCode && response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        let redirectUrl = response.headers.location;
        if (!redirectUrl.startsWith('http')) {
          const parsedUrl = new URL(url);
          redirectUrl = `${parsedUrl.protocol}//${parsedUrl.host}${redirectUrl}`;
        }
        downloadUrl(redirectUrl, filePath, redirectCount + 1).then(resolve).catch(reject);
        return;
      }
      if (response.statusCode !== 200) {
        reject(new Error(`Server returned status ${response.statusCode}`));
        return;
      }
      const fileStream = fs.createWriteStream(filePath);
      response.pipe(fileStream);
      fileStream.on('finish', () => {
        fileStream.close();
        resolve();
      });
      fileStream.on('error', (err) => {
        fs.unlink(filePath, () => {});
        reject(err);
      });
    }).on('error', (err) => {
      reject(err);
    });
  });
}

ipcMain.handle('download-file', async (event, { url, fileName }) => {
  try {
    const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
      defaultPath: fileName,
      title: 'Enregistrer le fichier',
    });
    if (canceled || !filePath) {
      return { ok: false, canceled: true };
    }
    
    if (url.startsWith('data:')) {
      const parts = url.split(',');
      const base64Data = parts[1];
      const buffer = Buffer.from(base64Data, 'base64');
      await fs.promises.writeFile(filePath, buffer);
      return { ok: true, filePath };
    }

    await downloadUrl(url, filePath);
    return { ok: true, filePath };
  } catch (error) {
    console.error('[Download] Failed to download file:', error);
    return { ok: false, error: error.message };
  }
});

//-------ajout livekit

ipcMain.handle('configure-livekit-app-audio', async (_event, payload) => {
  try {
    const url = payload?.url || process.env.LIVEKIT_URL || null;
    const token = payload?.token || null;

    if (!url) {
      return { ok: false, error: 'LIVEKIT_URL manquant' };
    }

    if (!token) {
      return { ok: false, error: 'Token LiveKit manquant' };
    }

    livekitAppAudioConfig = { url, token };
    debugLog('[LiveKitAppAudio] config updated');
    return { ok: true };
  } catch (error) {
    debugLog(`[LiveKitAppAudio] config error: ${error?.message || error}`);
    return { ok: false, error: error?.message || 'config error' };
  }
});

async function ensureLivekitAppAudioPublisher() {
  if (
    livekitAudioRoom &&
    livekitAppAudioConnected &&
    livekitAppAudioSource &&
    livekitAppAudioTrack
  ) {
    return;
  }

  const { url, token } = livekitAppAudioConfig || {};

  if (!url) {
    throw new Error('LIVEKIT_URL non configuré');
  }

  if (!token) {
    throw new Error('Token LiveKit non configuré');
  }

  livekitAudioRoom = new Room();

  await livekitAudioRoom.connect(url, token, {
    autoSubscribe: true,
    dynacast: true,
  });

  livekitAppAudioSource = new AudioSource(48000, 2);
  livekitAppAudioTrack = LocalAudioTrack.createAudioTrack('app-audio', livekitAppAudioSource);

  const options = new TrackPublishOptions();
  options.source = TrackSource.SOURCE_MICROPHONE;

  livekitAppAudioPublication = await livekitAudioRoom.localParticipant.publishTrack(
    livekitAppAudioTrack,
    options
  );

  livekitAppAudioConnected = true;
  debugLog('[LiveKitAppAudio] connected and track published');
}

async function pushPcmChunkToLivekit(chunk) {
  if (!livekitAppAudioSource) return;
  if (!Buffer.isBuffer(chunk)) chunk = Buffer.from(chunk);

  const aligned = chunk.length - (chunk.length % 2);
  if (aligned <= 0) return;

  const view = chunk.subarray(0, aligned);
  const pcm = new Int16Array(
    view.buffer,
    view.byteOffset,
    view.byteLength / 2
  );

  const samplesPerChannel = pcm.length / 2;
  if (!Number.isInteger(samplesPerChannel) || samplesPerChannel <= 0) return;

  const frame = new AudioFrame(pcm, 48000, 2, samplesPerChannel);
  await livekitAppAudioSource.captureFrame(frame);
}

async function teardownLivekitAppAudioPublisher() {
  try {
    if (livekitAppAudioTrack) {
      await livekitAppAudioTrack.close();
    }
  } catch {}

  try {
    if (livekitAudioRoom) {
      await livekitAudioRoom.disconnect();
    }
  } catch {}

  livekitAudioRoom = null;
  livekitAppAudioSource = null;
  livekitAppAudioTrack = null;
  livekitAppAudioPublication = null;
  livekitAppAudioConnected = false;

  debugLog('[LiveKitAppAudio] publisher disposed');
}

// ─── IPC — Capture audio applicative (Préparation) ──────────────────────────
let appAudioStatus = 'idle'; // idle | starting | running | stopping | error

ipcMain.handle('start-app-audio', async (event, pid) => {
  if (process.platform !== 'win32') {
    return { ok: false, status: appAudioStatus, error: 'App audio capture is only supported on Windows' };
  }

  if (typeof pid !== 'number' || pid <= 0 || isNaN(pid)) {
    return { ok: false, status: appAudioStatus, error: 'Invalid PID provided' };
  }

  console.log(`[AppAudio] Demande de capture pour le PID: ${pid}`);

  // Retour honnête : pas encore implémenté
  return { 
    ok: false, 
    status: appAudioStatus, 
    error: 'App audio capture not implemented yet' 
  };
});

ipcMain.handle('stop-app-audio', async (event) => {
  // Rien n'est lancé pour l'instant, on retourne donc l'état actuel (idle)
  return { ok: true, status: appAudioStatus };
});

ipcMain.handle('get-app-audio-status', async (event) => {
  return { ok: true, status: appAudioStatus };
});

// ─── IPC — Backend Externe Windows (ApplicationLoopback piloté par stop-file) ─────
let loopbackTestState = 'idle'; // idle | launching | process_running | stopping | error
let loopbackProcess = null;
let loopbackStopFilePath = null;
let loopbackOutputPath = null;
let loopbackTargetPid = null;
let loopbackPcmBytesReceived = 0;
let loopbackPcmChunksReceived = 0;

// 1. Variable d'environnement prioritaire pour les tests locaux.
// 2. Fallback resources/bin en mode packagé.
// 3. Fallback ./bin en mode développement.
const getLoopbackExePath = () => {
  if (process.env.LOOPBACK_EXE_PATH) return process.env.LOOPBACK_EXE_PATH;
  return app.isPackaged
    ? path.join(process.resourcesPath, 'bin', 'ApplicationLoopback.exe')
    : path.join(__dirname, '..', 'bin', 'ApplicationLoopback.exe');
};

const ensureParentDir = (filePath) => {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
};

const safeUnlink = (filePath) => {
  if (!filePath) return;
  try {
    if (fs.existsSync(filePath)) {
      fs.rmSync(filePath, { force: true });
    }
  } catch (err) {
    console.warn('[LoopbackTest] Impossible de supprimer le fichier:', filePath, err);
  }
};

const buildDefaultLoopbackPaths = (pid) => {
  const baseDir = path.join(app.getPath('temp'), 'Drocsid', 'loopback');
  fs.mkdirSync(baseDir, { recursive: true });

	const stamp = `${Date.now()}-${process.pid}-${pid}`;
	  return {
	  outputPath: path.join(baseDir, `loopback-${stamp}.unused`),
	  stopFilePath: path.join(baseDir, `loopback-${stamp}.stop`)
	};
};

ipcMain.handle('launch-loopback-test', async (event, pid, outputPath) => {
  if (process.platform !== 'win32') {
    return {
      ok: false,
      status: loopbackTestState,
      error: "La capture audio par application n'est supportée que sur Windows."
    };
  }

  if (typeof pid !== 'number' || pid <= 0 || Number.isNaN(pid)) {
    return {
      ok: false,
      status: loopbackTestState,
      error: 'PID invalide fourni.'
    };
  }

  if (loopbackTestState === 'process_running' || loopbackTestState === 'launching' || loopbackTestState === 'stopping') {
    return {
      ok: false,
      status: loopbackTestState,
      error: 'Une capture loopback est déjà en cours.'
    };
  }

  const exePath = getLoopbackExePath();
  if (!fs.existsSync(exePath)) {
    return {
      ok: false,
      status: loopbackTestState,
      error: `Binaire introuvable: ${exePath}. Spécifiez LOOPBACK_EXE_PATH pour forcer le chemin local.`
    };
  }

  const defaults = buildDefaultLoopbackPaths(pid);
  const finalOutputPath = (typeof outputPath === 'string' && outputPath.trim())
    ? outputPath
    : defaults.outputPath;
  const finalStopFilePath = defaults.stopFilePath;

  try {
    ensureParentDir(finalOutputPath);
    ensureParentDir(finalStopFilePath);

    safeUnlink(finalStopFilePath);

    loopbackTestState = 'launching';
    loopbackOutputPath = finalOutputPath;
    loopbackStopFilePath = finalStopFilePath;
    loopbackTargetPid = pid;

	debugLog(`[LoopbackTest] launch requested`);
	debugLog(`[LoopbackTest] exePath=${exePath}`);
	debugLog(`[LoopbackTest] pid=${pid}`);
	debugLog(`[LoopbackTest] outputPath=${loopbackOutputPath}`);
	debugLog(`[LoopbackTest] stopFilePath=${loopbackStopFilePath}`);
	debugLog(`[LoopbackTest] args=${JSON.stringify([pid.toString(), 'includetree', loopbackOutputPath, loopbackStopFilePath])}`);

    console.log(`[LoopbackTest] Lancement binaire : ${exePath}`);
    console.log(`[LoopbackTest] PID cible : ${pid}`);
    debugLog("PID cible: "+pid);
    
	console.log(`[LoopbackTest] PCM stdout activé, arg compatibilité : ${loopbackOutputPath}`);
    console.log(`[LoopbackTest] Stop file : ${loopbackStopFilePath}`);    
	

	debugLog(`[LoopbackTest] spawning process now`);
	
	loopbackPcmBytesReceived = 0;
	loopbackPcmChunksReceived = 0;
	
	await ensureLivekitAppAudioPublisher();
	
    loopbackProcess = spawn(
      exePath,
      [pid.toString(), 'includetree', loopbackOutputPath, loopbackStopFilePath],
      {
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe']
      }
    );

	loopbackProcess.stdout.on('data', async (chunk) => {
		try{
		  if (!Buffer.isBuffer(chunk)) {
			chunk = Buffer.from(chunk);
		  }

		  loopbackPcmBytesReceived += chunk.length;
		  loopbackPcmChunksReceived += 1;

		  debugLog(
			`[LoopbackTest][pcm] chunk=${chunk.length} totalBytes=${loopbackPcmBytesReceived} totalChunks=${loopbackPcmChunksReceived}`
		  );
		  await pushPcmChunkToLivekit(chunk);

		  if (mainWindow && !mainWindow.isDestroyed()) {
			mainWindow.webContents.send('loopback-pcm-chunk', {
			  byteLength: chunk.length,
			  totalBytes: loopbackPcmBytesReceived,
			  totalChunks: loopbackPcmChunksReceived,
			});
		  }
		}catch (err) {
		  console.error('[LiveKitAppAudio] push chunk failed:', err);
		  debugLog(`[LiveKitAppAudio] push chunk failed: ${err?.message || err}`);
		}
	});

    loopbackProcess.stderr.on('data', (data) => {
	  const text = data.toString().trim();
	  console.error(`[LoopbackTest][stderr] ${text}`);
	  debugLog(`[LoopbackTest][stderr] ${text}`);
	});

    loopbackProcess.on('spawn', () => {
	  loopbackTestState = 'process_running';
	  console.log('[LoopbackTest] Processus OS démarré avec succès.');
	  debugLog('[LoopbackTest] spawn event received, state=process_running');
	});

    loopbackProcess.on('error', (err) => {
	  console.error('[LoopbackTest] Erreur critique process:', err);
	  debugLog(`[LoopbackTest] process error: ${err?.message || err}`);
	  loopbackTestState = 'error';
	  loopbackProcess = null;
	});

    loopbackProcess.on('exit', async (code, signal) => {
	  console.log(`[LoopbackTest] Processus externe terminé (code: ${code}, signal: ${signal ?? 'none'}).`);
	  debugLog(`[LoopbackTest] exit event code=${code} signal=${signal ?? 'none'} state_before_cleanup=${loopbackTestState}`);

	  if (code === 0 || loopbackTestState === 'stopping') {
		loopbackTestState = 'idle';
	  } else {
		loopbackTestState = 'error';
	  }

	  debugLog(`[LoopbackTest] cleanup start`);

	  loopbackProcess = null;
	  safeUnlink(loopbackStopFilePath);
	  loopbackStopFilePath = null;
	  loopbackTargetPid = null;
	  loopbackOutputPath = null;
	  loopbackPcmBytesReceived = 0;
	  loopbackPcmChunksReceived = 0;

	  await teardownLivekitAppAudioPublisher();

	  debugLog(`[LoopbackTest] cleanup done, state=${loopbackTestState}`);
	});

	debugLog(`[LoopbackTest] handler returning ok=true status=launching`);

    return {
      ok: true,
      status: 'launching',
      outputPath: loopbackOutputPath,
      stopFilePath: loopbackStopFilePath
    };
  } catch (error) {
    loopbackTestState = 'error';
    loopbackProcess = null;
    console.error('[LoopbackTest] Exception de lancement:', error);
	debugLog(`[LoopbackTest] launch exception: ${error?.message || error}`);

    return {
      ok: false,
      status: loopbackTestState,
      error: error.message
    };
  }
  
});

ipcMain.handle('stop-loopback-test', async () => {
	debugLog(`[LoopbackTest] stop requested state=${loopbackTestState} hasProcess=${!!loopbackProcess} stopFile=${loopbackStopFilePath || 'null'}`);
  if (loopbackTestState === 'idle' || !loopbackProcess || !loopbackStopFilePath) {
	debugLog('[LoopbackTest] stop ignored because process is not running');
    loopbackTestState = 'idle';	
    return { ok: true, status: loopbackTestState };
  }

  loopbackTestState = 'stopping';
  console.log("[LoopbackTest] Création du stop-file pour arrêt propre...");

  try {
    ensureParentDir(loopbackStopFilePath);
    fs.writeFileSync(loopbackStopFilePath, 'stop', 'utf8');
	debugLog(`[LoopbackTest] stop file written: ${loopbackStopFilePath}`);
    return {
      ok: true,
      status: loopbackTestState,
      stopFilePath: loopbackStopFilePath
    };
  } catch (error) {
    console.error('[LoopbackTest] Impossible de créer le stop-file:', error);
	debugLog(`[LoopbackTest] stop failed: ${error?.message || error}`);

    return {
      ok: false,
      status: 'error',
      error: error.message
    };
  }
});

ipcMain.handle('get-loopback-test-status', async () => {
  return {
    ok: true,
    status: loopbackTestState,
    pid: loopbackTargetPid,
    outputPath: loopbackOutputPath,
    stopFilePath: loopbackStopFilePath,
    pcmBytesReceived: loopbackPcmBytesReceived,
    pcmChunksReceived: loopbackPcmChunksReceived
  };
});

ipcMain.handle('get-desktop-sources', async () => {
  debugLog('[main] get-desktop-sources invoked');	
  console.log('[main] get-desktop-sources invoked');
  const sources = await desktopCapturer.getSources({
    types: ['window', 'screen'],
    thumbnailSize: { width: 320, height: 180 }
  });

  const mapped = await Promise.all(
    sources.map(async (source) => {
      const isScreen = source.id.startsWith('screen');
      const hwnd = isScreen ? null : extractHwndFromSourceId(source.id);
      const pid = hwnd ? await resolvePidFromHwnd(hwnd) : null;

      console.log('[DesktopSource]', {
        name: source.name,
        id: source.id,
        type: isScreen ? 'screen' : 'window',
        hwnd,
        pid
      });
	  
	  debugLog(`DesktopSource pid=${pid} hwnd=${hwnd} name=${source.name} id=${source.id}`);
	  
      return {
        id: source.id,
        name: source.name,
        thumbnail: source.thumbnail.toDataURL(),
        type: isScreen ? 'screen' : 'window',
        hwnd,
        pid,
        processName: null,
        canShareAppAudio: !!pid
      };
    })
  );

  return mapped;
});

app.on('before-quit', () => {
  isQuitting = true;
});

const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', (event, commandLine, workingDirectory) => {
    // Someone tried to run a second instance, we should focus our window.
    if (mainWindow) {
      if (mainWindow.isMinimized() || !mainWindow.isVisible()) {
        mainWindow.show();
      }
      mainWindow.focus();
    }
  });

  // Handle custom protocol for serving files
  app.whenReady().then(() => {
    protocol.registerFileProtocol('drocsid', (request, callback) => {
      let filepath = request.url.replace('drocsid://app/', '');
      filepath = filepath.split('#')[0].split('?')[0]; // Strip hash and search params
      
      // Default to index.html if path is empty or just /
      if (!filepath || filepath === '/' || filepath === 'index.html') {
        filepath = 'index.html';
      }

      const fullPath = path.normalize(path.join(__dirname, '../dist', filepath));
      
      // Basic security check to stay within dist
      const distPath = path.normalize(path.join(__dirname, '../dist'));
      if (!fullPath.startsWith(distPath)) {
        return callback({ error: -10 }); // DISALLOWED
      }

      callback({ path: fullPath });
    });

    createWindow();
    createTray();

    // Start uIOhook for global low-level input
    try {
      uIOhook.on('keydown', (e) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          let keyName = uiohookToKeyString[e.keycode] || `Keycode-${e.keycode}`;
          // Normalize names to match frontend logic
          if (keyName === 'Space') keyName = 'Space';
          else if (keyName === 'Ctrl' || keyName === 'CtrlRight') keyName = 'Control';
          else if (keyName === 'Alt' || keyName === 'AltRight') keyName = 'Alt';
          else if (keyName === 'Shift' || keyName === 'ShiftRight') keyName = 'Shift';
          else if (keyName === 'Meta' || keyName === 'MetaRight') keyName = 'Meta';
          
          mainWindow.webContents.send('global-input-event', {
            type: 'keydown',
            key: keyName,
            altKey: e.altKey,
            ctrlKey: e.ctrlKey,
            metaKey: e.metaKey,
            shiftKey: e.shiftKey
          });
        }
      });
      uIOhook.on('keyup', (e) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          let keyName = uiohookToKeyString[e.keycode] || `Keycode-${e.keycode}`;
          if (keyName === 'Ctrl' || keyName === 'CtrlRight') keyName = 'Control';
          else if (keyName === 'Alt' || keyName === 'AltRight') keyName = 'Alt';
          else if (keyName === 'Shift' || keyName === 'ShiftRight') keyName = 'Shift';
          else if (keyName === 'Meta' || keyName === 'MetaRight') keyName = 'Meta';
          
          mainWindow.webContents.send('global-input-event', {
             type: 'keyup',
             key: keyName,
             altKey: e.altKey,
             ctrlKey: e.ctrlKey,
             metaKey: e.metaKey,
             shiftKey: e.shiftKey
          });
        }
      });
      uIOhook.on('mousedown', (e) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          const buttonMap = {
             1: 'Mouse Left',
             2: 'Mouse Right',
             3: 'Mouse Middle',
             4: 'Mouse Back',
             5: 'Mouse Forward'
          };
          mainWindow.webContents.send('global-input-event', {
            type: 'mousedown',
            button: buttonMap[e.button] || `Mouse ${e.button}`
          });
        }
      });
      uIOhook.on('mouseup', (e) => {
         if (mainWindow && !mainWindow.isDestroyed()) {
          const buttonMap = {
             1: 'Mouse Left',
             2: 'Mouse Right',
             3: 'Mouse Middle',
             4: 'Mouse Back',
             5: 'Mouse Forward'
          };
          mainWindow.webContents.send('global-input-event', {
            type: 'mouseup',
            button: buttonMap[e.button] || `Mouse ${e.button}`
          });
         }
      });
      uIOhook.start();
    } catch (err) {
      console.error('[uIOhook] start error:', err);
    }

    app.on('activate', function () {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
      else mainWindow.show();
    });
  });
}

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin' && isQuitting) app.quit();
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
  try { uIOhook.stop(); } catch (e) {}

  try {
    if (loopbackProcess && loopbackStopFilePath) {
      ensureParentDir(loopbackStopFilePath);
      fs.writeFileSync(loopbackStopFilePath, 'stop', 'utf8');
    }
  } catch (e) {
    console.error('[LoopbackTest] Erreur cleanup will-quit:', e);
  }

  dispose().catch((e) => {
    console.error('[LiveKitAppAudio] dispose error:', e);
  });
});

const getWindowPidResolverPath = () => {
  if (process.env.WINDOW_PID_RESOLVER_EXE_PATH) return process.env.WINDOW_PID_RESOLVER_EXE_PATH;
  return app.isPackaged
    ? path.join(process.resourcesPath, 'bin', 'WindowPidResolver.exe')
    : path.join(__dirname, '..', 'bin', 'WindowPidResolver.exe');
};

const extractHwndFromSourceId = (sourceId) => {
  if (!sourceId || typeof sourceId !== 'string') return null;
  const match = /^window:(\d+):\d+$/.exec(sourceId);
  return match ? match[1] : null;
};

const resolvePidFromHwnd = (hwndString) => {
  return new Promise((resolve) => {
    const resolverPath = getWindowPidResolverPath();

    if (!fs.existsSync(resolverPath)) {
      console.warn('[WindowPidResolver] Binaire introuvable:', resolverPath);
      return resolve(null);
    }

    const child = spawn(resolverPath, [hwndString], {
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe']
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    child.on('error', (err) => {
      console.error('[WindowPidResolver] Erreur process:', err);
      resolve(null);
    });

    child.on('exit', (code) => {
      if (code !== 0) {
        if (stderr.trim()) {
          console.warn('[WindowPidResolver] stderr:', stderr.trim());
        }
        return resolve(null);
      }

      const pid = parseInt(stdout.trim(), 10);
      resolve(Number.isFinite(pid) && pid > 0 ? pid : null);
    });
  });
};
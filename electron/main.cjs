const { app, BrowserWindow, shell, ipcMain, desktopCapturer, Tray, Menu, globalShortcut, Notification, nativeImage, protocol } = require('electron');
const path = require('path');
const fs = require('fs');

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

// Global Shortcuts dynamic configuration
ipcMain.on('update-shortcuts', (event, shortcuts) => {
  globalShortcut.unregisterAll();
  
  if (shortcuts?.mute) {
    const success = globalShortcut.register(shortcuts.mute, () => {
      if (mainWindow) {
        mainWindow.webContents.send('toggle-mute-global');
      }
    });
    if (!success) console.error(`Failed to register shortcut: ${shortcuts.mute}`);
  }

  if (shortcuts?.deafen) {
    const success = globalShortcut.register(shortcuts.deafen, () => {
      if (mainWindow) {
        mainWindow.webContents.send('toggle-deafen-global');
      }
    });
    if (!success) console.error(`Failed to register shortcut: ${shortcuts.deafen}`);
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

ipcMain.handle('get-desktop-sources', async () => {
  const sources = await desktopCapturer.getSources({ types: ['window', 'screen'], thumbnailSize: { width: 320, height: 180 } });
  return sources.map(source => ({
    id: source.id,
    name: source.name,
    thumbnail: source.thumbnail.toDataURL(),
  }));
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
});

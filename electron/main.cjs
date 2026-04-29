const { app, BrowserWindow, shell, ipcMain, desktopCapturer, Tray, Menu, globalShortcut, Notification, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');

// Force app name early
app.name = 'Drocsid';

let mainWindow = null;
let tray = null;
let isQuitting = false;

function createWindow() {
  // Use logo.png or favicon.png
  const possibleIcons = [
    path.join(__dirname, '../src/assets/logo-bg.png'),
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

  const startUrl = process.env.ELECTRON_START_URL || `file://${path.join(__dirname, '../dist/index.html')}`;
  
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http')) {
      shell.openExternal(url);
      return { action: 'deny' };
    }
    return { action: 'allow' };
  });

  const handleAuthRedirect = (event, url) => {
    if (url.includes('.run.app') && (url.includes('#access_token=') || url.includes('?code='))) {
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
    path.join(__dirname, '../src/assets/logo-bg.png'),
    path.join(__dirname, '../logo-opaque.png'),
    path.join(__dirname, '../logo.png'),
    path.join(__dirname, '../favicon.png'),
    path.join(__dirname, '../public/favicon.png'),
    path.join(__dirname, '../public/favicon.ico'),
    path.join(__dirname, 'icon.png'),
    path.join(process.resourcesPath, 'src/assets/logo-bg.png'),
    path.join(process.resourcesPath, 'logo-opaque.png'),
    path.join(process.resourcesPath, 'logo.png'),
    path.join(process.resourcesPath, 'favicon.png'),
    path.join(process.resourcesPath, 'app/src/assets/logo-bg.png'),
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
    tray = new Tray(iconPath);
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
  new Notification({ title, body, icon: path.join(__dirname, '../logo.png') }).show();
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

  app.whenReady().then(() => {
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

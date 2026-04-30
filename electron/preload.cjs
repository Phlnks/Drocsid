const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electron', {
  getDesktopSources: () => ipcRenderer.invoke('get-desktop-sources'),
  setBadge: (count) => ipcRenderer.send('set-badge', count),
  showNotification: (title, body) => ipcRenderer.send('show-notification', { title, body }),
  onToggleMute: (callback) => ipcRenderer.on('toggle-mute-global', callback),
  removeToggleMute: (callback) => ipcRenderer.removeListener('toggle-mute-global', callback),
  onToggleDeafen: (callback) => ipcRenderer.on('toggle-deafen-global', callback),
  removeToggleDeafen: (callback) => ipcRenderer.removeListener('toggle-deafen-global', callback),
  updateShortcuts: (shortcuts) => ipcRenderer.send('update-shortcuts', shortcuts),
  setLaunchAtStartup: (enabled) => ipcRenderer.send('set-launch-at-startup', enabled)
});

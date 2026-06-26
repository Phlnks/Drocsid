console.log('[preload] loaded');
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electron', {
  getDesktopSources: () => {
    console.log('[preload] getDesktopSources called');
	return ipcRenderer.invoke('get-desktop-sources');
  },
  setBadge: (count) => ipcRenderer.send('set-badge', count),
  showNotification: (title, body) => ipcRenderer.send('show-notification', { title, body }),
  onToggleMute: (callback) => ipcRenderer.on('toggle-mute-global', callback),
  removeToggleMute: (callback) => ipcRenderer.removeListener('toggle-mute-global', callback),
  onToggleDeafen: (callback) => ipcRenderer.on('toggle-deafen-global', callback),
  removeToggleDeafen: (callback) => ipcRenderer.removeListener('toggle-deafen-global', callback),
  onDisconnectVoice: (callback) => ipcRenderer.on('disconnect-voice-global', callback),
  removeDisconnectVoice: (callback) => ipcRenderer.removeListener('disconnect-voice-global', callback),
  updateShortcuts: (shortcuts) => ipcRenderer.send('update-shortcuts', shortcuts),
  updateTray: (state) => ipcRenderer.send('tray-update', state),
  setLaunchAtStartup: (enabled) => ipcRenderer.send('set-launch-at-startup', enabled),

  onGlobalInputEvent: (callback) => {
    const handler = (_event, payload) => callback(payload);
    ipcRenderer.on('global-input-event', handler);
    return () => ipcRenderer.removeListener('global-input-event', handler);
  },
  
  // App Audio Capture (Pre-implémentation)
  startAppAudioCapture: (pid) => ipcRenderer.invoke('start-app-audio', pid),
  stopAppAudioCapture: () => ipcRenderer.invoke('stop-app-audio'),
  getAppAudioCaptureStatus: () => ipcRenderer.invoke('get-app-audio-status'),


  // Backend Natif Windows (ApplicationLoopback Test)
  launchLoopbackTest: (pid, outputPath) => ipcRenderer.invoke('launch-loopback-test', pid, outputPath),
  stopLoopbackTest: () => ipcRenderer.invoke('stop-loopback-test'),
  onLoopbackPcmChunk: (callback) => ipcRenderer.on('loopback-pcm-chunk', (_event, payload) => callback(payload)),
  removeLoopbackPcmChunk: (callback) => ipcRenderer.removeListener('loopback-pcm-chunk', callback),
  getLoopbackTestStatus: () => ipcRenderer.invoke('get-loopback-test-status'),
  configureLivekitAppAudio: (payload) => ipcRenderer.invoke('configure-livekit-app-audio', payload),

  // File-backed storage helpers to survive restarts
  getSavedStorage: () => ipcRenderer.invoke('get-saved-storage'),
  saveStorageKey: (key, value) => ipcRenderer.send('save-storage-key', { key, value }),
  removeStorageKey: (key) => ipcRenderer.send('remove-storage-key', key),

  // File download helper
  downloadFile: (payload) => ipcRenderer.invoke('download-file', payload)
});

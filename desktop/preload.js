const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  // Update channels
  onUpdateAvailable: (cb) => ipcRenderer.on('update-available', (_e, info) => cb(info)),
  onUpdateDownloaded: (cb) => ipcRenderer.on('update-downloaded', (_e, info) => cb(info)),
  onUpdateError:     (cb) => ipcRenderer.on('update-error', (_e, err) => cb(err)),
  checkForUpdates:   ()   => ipcRenderer.send('check-for-updates'),
  installUpdate:     ()   => ipcRenderer.send('install-update'),
  getAppVersion:     ()   => ipcRenderer.invoke('get-app-version'),
  removeUpdateListeners: () => {
    ipcRenderer.removeAllListeners('update-available');
    ipcRenderer.removeAllListeners('update-downloaded');
    ipcRenderer.removeAllListeners('update-error');
  },
});

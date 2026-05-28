const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('api', {
  // Can expose necessary ipcRenderer bindings here
});

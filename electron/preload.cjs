const { contextBridge, ipcRenderer } = require('electron');

// Expose only the runtime marker and two scoped resource actions, never generic
// IPC or filesystem access. File paths are selected by the native dialog.
contextBridge.exposeInMainWorld('csboardDesktop', {
  isDesktop: true,
  resources: {
    status: () => ipcRenderer.invoke('resources:status'),
    importFiles: () => ipcRenderer.invoke('resources:import'),
  },
});

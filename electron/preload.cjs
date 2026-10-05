const { contextBridge, ipcRenderer } = require('electron');

// Only business operations cross the bridge. Native paths stay in the main process.
contextBridge.exposeInMainWorld('csboardDesktop', {
  isDesktop: true,
  updates: {
    status: () => ipcRenderer.invoke('desktop:update-status'),
    check: () => ipcRenderer.invoke('desktop:update-check'),
    download: () => ipcRenderer.invoke('desktop:update-download'),
    cancel: () => ipcRenderer.invoke('desktop:update-cancel'),
    install: () => ipcRenderer.invoke('desktop:update-install'),
    preferences: settings => ipcRenderer.invoke('desktop:update-preferences', settings),
    subscribe: callback => {
      const listener = (_event, state) => callback(state);
      ipcRenderer.on('desktop:update-state', listener);
      return () => ipcRenderer.removeListener('desktop:update-state', listener);
    },
  },
  ...(process.argv.includes('--csboard-ai-enabled') ? { ai: {
    config: () => ipcRenderer.invoke('ai:config'),
    save: config => ipcRenderer.invoke('ai:save', config),
    complete: (id, payload) => ipcRenderer.invoke('ai:complete', id, payload),
    cancel: id => ipcRenderer.invoke('ai:cancel', id),
    onDelta: callback => {
      const listener = (_event, value) => callback(value);
      ipcRenderer.on('ai:delta', listener);
      return () => ipcRenderer.removeListener('ai:delta', listener);
    },
  } } : {}),
  maintenance: {
    performance: () => ipcRenderer.invoke('native:performance'),
    savePerformance: settings => ipcRenderer.invoke('native:performance-save', settings),
    status: () => ipcRenderer.invoke('desktop:storage-status'),
    openFolder: () => ipcRenderer.invoke('desktop:storage-folder'),
    backup: () => ipcRenderer.invoke('desktop:backup'),
    restore: () => ipcRenderer.invoke('desktop:restore'),
    clean: maxBytes => ipcRenderer.invoke('desktop:storage-clean', maxBytes),
    tasks: () => ipcRenderer.invoke('native:tasks'),
    cancelTask: id => ipcRenderer.invoke('native:cancel-task', id),
    keepAwake: value => ipcRenderer.invoke('native:keep-awake', value),
    onTasks: callback => {
      const listener = (_event, value) => callback(value);
      ipcRenderer.on('native:tasks', listener);
      return () => ipcRenderer.removeListener('native:tasks', listener);
    },
  },
  presentation: {
    current: () => ipcRenderer.invoke('desktop:presentation'),
    subscribe: callback => {
      const listener = (_event, visible) => callback(visible);
      ipcRenderer.on('desktop:presentation', listener);
      return () => ipcRenderer.removeListener('desktop:presentation', listener);
    },
  },
  resources: {
    status: () => ipcRenderer.invoke('resources:status'),
    importFiles: () => ipcRenderer.invoke('resources:import'),
    ...(['win32', 'darwin'].includes(process.platform) ? { game: {
      detect: () => ipcRenderer.invoke('resources:game-detect'),
      choose: () => ipcRenderer.invoke('resources:game-choose'),
      estimate: selection => ipcRenderer.invoke('resources:game-estimate', selection),
      start: selection => ipcRenderer.invoke('resources:game-start', selection),
      cancel: () => ipcRenderer.invoke('resources:game-cancel'),
      status: () => ipcRenderer.invoke('resources:game-status'),
      subscribe: callback => {
        const listener = (_event, progress) => callback(progress);
        ipcRenderer.on('resources:game-progress', listener);
        return () => ipcRenderer.removeListener('resources:game-progress', listener);
      },
    } } : {}),
  },
  native: {
    readCache: (id, round) => ipcRenderer.invoke('native:cache-read', id, round),
    runCompute: (id, method, args) => ipcRenderer.invoke('data:run', id, method, args),
    cancelCompute: id => ipcRenderer.invoke('data:cancel', id),
    storage: (method, args) => ipcRenderer.invoke('native:storage', method, args),
    chooseDemos: () => ipcRenderer.invoke('native:choose-demos'),
    startDemo: request => ipcRenderer.invoke('native:start-demo', request),
    cancelDemo: id => ipcRenderer.invoke('native:cancel-demo', id),
    onDemoEvent: callback => {
      const listener = (_event, message) => callback(message);
      ipcRenderer.on('native:demo-event', listener);
      return () => ipcRenderer.removeListener('native:demo-event', listener);
    },
  },
});

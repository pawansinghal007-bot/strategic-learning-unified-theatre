const { contextBridge, ipcRenderer } = require('electron');

const wrap = (channel) => ({ invoke: (...args) => ipcRenderer.invoke(channel, ...args) });

contextBridge.exposeInMainWorld('rotator', {
  accounts: {
    list: () => ipcRenderer.invoke('accounts:list'),
    add: (a) => ipcRenderer.invoke('accounts:add', a),
    update: (id, p) => ipcRenderer.invoke('accounts:update', id, p),
    remove: (id) => ipcRenderer.invoke('accounts:remove', id),
    health: (id) => ipcRenderer.invoke('accounts:health', id)
  },
  switcher: {
    switch: (id) => ipcRenderer.invoke('switcher:switch', id)
  },
  daemon: {
    status: () => ipcRenderer.invoke('daemon:status'),
    pause: () => ipcRenderer.invoke('daemon:pause'),
    resume: () => ipcRenderer.invoke('daemon:resume'),
    onEvent: (cb) => ipcRenderer.on('daemon:event', (_, d) => cb(d)),
    offEvent: (cb) => ipcRenderer.removeListener('daemon:event', cb)
  },
  git: {
    status: (p) => ipcRenderer.invoke('git:status', p),
    watchedRepos: () => ipcRenderer.invoke('git:watchedRepos'),
    addRepo: (p) => ipcRenderer.invoke('git:addRepo', p),
    removeRepo: (p) => ipcRenderer.invoke('git:removeRepo', p),
    pickDir: () => ipcRenderer.invoke('git:pickDir')
  },
  journal: {
    tail: (n) => ipcRenderer.invoke('journal:tail', n),
    rawMd: () => ipcRenderer.invoke('journal:rawMd')
  },
  config: {
    get: () => ipcRenderer.invoke('config:get'),
    set: (p) => ipcRenderer.invoke('config:set', p)
  },
  app: {
    version: () => ipcRenderer.invoke('app:version')
  }
});

const { contextBridge, ipcRenderer } = require('electron');

const wrap = (channel) => ({ invoke: (...args) => ipcRenderer.invoke(channel, ...args) });

contextBridge.exposeInMainWorld('rotator', {
  accounts: {
    list: () => ipcRenderer.invoke('accounts:list'),
    listDetails: () => ipcRenderer.invoke('accounts:listDetails'),
    info: (id) => ipcRenderer.invoke('accounts:info', id),
    add: (a) => ipcRenderer.invoke('accounts:add', a),
    capture: (payload) => ipcRenderer.invoke('accounts:capture', payload),
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
  llm: {
    status: () => ipcRenderer.invoke('llm:status'),
    setup: (opts) => ipcRenderer.invoke('llm:setup', opts),
    ask: (opts) => ipcRenderer.invoke('llm:ask', opts)
  },
  browser: {
    send: (opts) => ipcRenderer.invoke('browser:send', opts),
    login: (opts) => ipcRenderer.invoke('browser:login', opts),
    listResponses: (opts) => ipcRenderer.invoke('browser:listResponses', opts),
    getResponse: (filename) => ipcRenderer.invoke('browser:getResponse', filename),
    clearResponses: (opts) => ipcRenderer.invoke('browser:clearResponses', opts),
    listPrompts: () => ipcRenderer.invoke('browser:listPrompts'),
    addPrompt: (prompt) => ipcRenderer.invoke('browser:addPrompt', prompt),
    updatePrompt: (id, updates) => ipcRenderer.invoke('browser:updatePrompt', id, updates),
    deletePrompt: (id) => ipcRenderer.invoke('browser:deletePrompt', id),
    runPrompt: (opts) => ipcRenderer.invoke('browser:runPrompt', opts)
  },
  robot: {
    runSuite: (opts) => ipcRenderer.invoke('robot:runSuite', opts),
    runFile: (filePath, opts) => ipcRenderer.invoke('robot:runFile', filePath, opts),
    listFiles: () => ipcRenderer.invoke('robot:listFiles'),
    readFile: (filePath) => ipcRenderer.invoke('robot:readFile', filePath),
    openFile: (filePath) => ipcRenderer.invoke('robot:openFile', filePath),
    tddCheck: (opts) => ipcRenderer.invoke('robot:tddCheck', opts),
    generateSkeleton: (filePath) => ipcRenderer.invoke('robot:generateSkeleton', filePath),
    pickSourceFile: () => ipcRenderer.invoke('robot:pickSourceFile'),
    pickRobotFile: () => ipcRenderer.invoke('robot:pickRobotFile')
  },
  app: {
    version: () => ipcRenderer.invoke('app:version'),
    openUrl: (url) => ipcRenderer.invoke('app:openUrl', url)
  }
});

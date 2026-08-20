import { contextBridge, ipcRenderer } from 'electron'

// 화면(렌더러)에서 쓸 수 있는 안전한 API만 골라 노출한다.
const api = {
  workspaces: {
    list: () => ipcRenderer.invoke('workspaces:list'),
    create: (name) => ipcRenderer.invoke('workspaces:create', name),
    update: (id, fields) => ipcRenderer.invoke('workspaces:update', id, fields),
    remove: (id) => ipcRenderer.invoke('workspaces:delete', id)
  },
  accounts: {
    list: (wsId) => ipcRenderer.invoke('accounts:list', wsId),
    create: (wsId, data) => ipcRenderer.invoke('accounts:create', wsId, data),
    update: (id, data) => ipcRenderer.invoke('accounts:update', id, data),
    setToken: (id, token) => ipcRenderer.invoke('accounts:setToken', id, token),
    test: (payload) => ipcRenderer.invoke('accounts:test', payload),
    validate: (data) => ipcRenderer.invoke('accounts:validate', data),
    remove: (id) => ipcRenderer.invoke('accounts:delete', id)
  },
  references: {
    list: (wsId) => ipcRenderer.invoke('references:list', wsId),
    create: (wsId, data) => ipcRenderer.invoke('references:create', wsId, data),
    update: (id, fields) => ipcRenderer.invoke('references:update', id, fields),
    remove: (id) => ipcRenderer.invoke('references:delete', id),
    addSource: (wsId, input, platform) => ipcRenderer.invoke('references:addSource', wsId, input, platform),
    removeSource: (wsId, sourceId) => ipcRenderer.invoke('references:removeSource', wsId, sourceId),
    collect: (wsId, sourceId, limit) => ipcRenderer.invoke('references:collect', wsId, sourceId, limit)
  },
  secrets: {
    status: () => ipcRenderer.invoke('secrets:status'),
    set: (key, value) => ipcRenderer.invoke('secrets:set', key, value),
    clear: (key) => ipcRenderer.invoke('secrets:clear', key)
  },
  tools: {
    status: () => ipcRenderer.invoke('tools:status')
  },
  jobs: {
    list: (wsId) => ipcRenderer.invoke('jobs:list', wsId),
    get: (id) => ipcRenderer.invoke('jobs:get', id),
    active: (wsId) => ipcRenderer.invoke('jobs:active', wsId),
    create: (wsId, referenceId) => ipcRenderer.invoke('jobs:create', wsId, referenceId),
    update: (id, fields) => ipcRenderer.invoke('jobs:update', id, fields),
    cancel: (id) => ipcRenderer.invoke('jobs:cancel', id),
    prepareSource: (id) => ipcRenderer.invoke('jobs:prepareSource', id),
    startEdit: (id, editOptions) => ipcRenderer.invoke('jobs:startEdit', id, editOptions),
    publish: (id, payload) => ipcRenderer.invoke('jobs:publish', id, payload),
    onProgress: (cb) => {
      const listener = (_e, job) => cb(job)
      ipcRenderer.on('jobs:progress', listener)
      return () => ipcRenderer.removeListener('jobs:progress', listener)
    }
  },
  test: {
    claude: () => ipcRenderer.invoke('test:claude'),
    youtube: () => ipcRenderer.invoke('test:youtube')
  },
  presets: {
    list: (wsId) => ipcRenderer.invoke('presets:list', wsId),
    save: (wsId, name, options) => ipcRenderer.invoke('presets:save', wsId, name, options),
    remove: (id) => ipcRenderer.invoke('presets:delete', id)
  },
  assets: {
    pickWatermark: (wsId) => ipcRenderer.invoke('assets:pickWatermark', wsId)
  },
  fonts: {
    list: () => ipcRenderer.invoke('fonts:list'),
    register: () => ipcRenderer.invoke('fonts:register'),
    remove: (id) => ipcRenderer.invoke('fonts:remove', id)
  },
  theme: {
    get: () => ipcRenderer.invoke('theme:get')
  }
}

contextBridge.exposeInMainWorld('api', api)

import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import { IPC, type PresentFlowApi } from '@shared/ipc'

function subscribe<T>(channel: string, cb: (payload: T) => void): () => void {
  const listener = (_e: IpcRendererEvent, payload: T) => cb(payload)
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}

const api: PresentFlowApi = {
  settings: {
    get: () => ipcRenderer.invoke(IPC.settingsGet),
    set: (patch) => ipcRenderer.invoke(IPC.settingsSet, patch),
    onChange: (cb) => subscribe(IPC.settingsChanged, cb)
  },
  presentations: {
    list: () => ipcRenderer.invoke(IPC.presList),
    get: (id) => ipcRenderer.invoke(IPC.presGet, id),
    save: (p) => ipcRenderer.invoke(IPC.presSave, p),
    delete: (id) => ipcRenderer.invoke(IPC.presDelete, id),
    importFile: () => ipcRenderer.invoke(IPC.presImport)
  },
  sessions: {
    get: (id) => ipcRenderer.invoke(IPC.sessionGet, id),
    save: (s) => ipcRenderer.invoke(IPC.sessionSave, s),
    clear: (id) => ipcRenderer.invoke(IPC.sessionClear, id)
  },
  secrets: {
    has: (p) => ipcRenderer.invoke(IPC.secretHas, p),
    set: (p, key) => ipcRenderer.invoke(IPC.secretSet, p, key),
    clear: (p) => ipcRenderer.invoke(IPC.secretClear, p)
  },
  cloud: {
    start: (opts) => ipcRenderer.invoke(IPC.cloudStart, opts),
    audio: (chunk) => ipcRenderer.send(IPC.cloudAudio, chunk),
    commit: () => ipcRenderer.send(IPC.cloudCommit),
    stop: () => ipcRenderer.invoke(IPC.cloudStop),
    onEvent: (cb) => subscribe(IPC.cloudEvent, cb)
  },
  onShortcut: (cb) => subscribe(IPC.shortcut, cb),
  powerpoint: {
    watch: (on) => ipcRenderer.invoke(IPC.pptWatch, on),
    onState: (cb) => subscribe(IPC.pptState, cb)
  },
  onAudioServiceFailed: (cb) => subscribe(IPC.audioServiceFailed, cb)
}

contextBridge.exposeInMainWorld('presentflow', api)

import fs from 'node:fs'
import path from 'node:path'
import { BrowserWindow, dialog, ipcMain } from 'electron'
import { IPC } from '@shared/ipc'
import type { CloudProviderId, Presentation, SessionSnapshot, Settings } from '@shared/types'
import { pptxToScript } from './pptx'
import type { Secrets } from './secrets'
import type { Store } from './store'

const PROVIDERS: CloudProviderId[] = ['openai', 'gemini']

function assertProvider(p: unknown): CloudProviderId {
  if (!PROVIDERS.includes(p as CloudProviderId)) throw new Error('invalid provider')
  return p as CloudProviderId
}

export function registerDataIpc(
  store: Store,
  secrets: Secrets,
  onSettingsChanged: (s: Settings) => void
): void {
  ipcMain.handle(IPC.settingsGet, () => store.getSettings())
  ipcMain.handle(IPC.settingsSet, (_e, patch: Partial<Settings>) => {
    const next = store.setSettings(patch)
    onSettingsChanged(next)
    for (const w of BrowserWindow.getAllWindows()) w.webContents.send(IPC.settingsChanged, next)
    return next
  })

  ipcMain.handle(IPC.presList, () => store.listPresentations())
  ipcMain.handle(IPC.presGet, (_e, id: string) => store.getPresentation(id))
  ipcMain.handle(IPC.presSave, (_e, p: Presentation) => store.savePresentation(p))
  ipcMain.handle(IPC.presDelete, (_e, id: string) => store.deletePresentation(id))
  ipcMain.handle(IPC.presImport, async (e) => {
    const win = BrowserWindow.fromWebContents(e.sender)
    const opts = {
      properties: ['openFile' as const],
      filters: [{ name: 'Script / PowerPoint', extensions: ['md', 'markdown', 'txt', 'pptx'] }]
    }
    const res = win ? await dialog.showOpenDialog(win, opts) : await dialog.showOpenDialog(opts)
    if (res.canceled || res.filePaths.length === 0) return null
    const file = res.filePaths[0]
    const title = path.basename(file, path.extname(file))
    if (path.extname(file).toLowerCase() === '.pptx') return pptxToScript(fs.readFileSync(file), title)
    const source = fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '')
    return { title, source }
  })

  ipcMain.handle(IPC.sessionGet, (_e, id: string) => store.getSession(id))
  ipcMain.handle(IPC.sessionSave, (_e, s: SessionSnapshot) => store.saveSession(s))
  ipcMain.handle(IPC.sessionClear, (_e, id: string) => store.clearSession(id))

  ipcMain.handle(IPC.secretHas, (_e, p: unknown) => secrets.has(assertProvider(p)))
  ipcMain.handle(IPC.secretSet, (_e, p: unknown, key: string) => secrets.set(assertProvider(p), String(key)))
  ipcMain.handle(IPC.secretClear, (_e, p: unknown) => secrets.clear(assertProvider(p)))
}

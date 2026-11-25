import path from 'node:path'
import { app, BrowserWindow, ipcMain, nativeTheme, session } from 'electron'
import { registerCloudIpc } from './cloud'
import { IPC } from '@shared/ipc'
import { watchAudioService } from './audioService'
import { registerDataIpc } from './ipc'
import { PowerPointWatcher } from './powerpoint'
import { APP_ORIGIN, handleAppScheme, registerAppScheme } from './protocol'
import { Secrets } from './secrets'
import { setGlobalShortcuts } from './shortcuts'
import { Store } from './store'
import { applyWindowSettings, createMainWindow } from './window'

// Isolated profile for tests / portable use.
if (process.env.PRESENTFLOW_USER_DATA) app.setPath('userData', process.env.PRESENTFLOW_USER_DATA)

// Hybrid-graphics laptops: run WebGPU (local Whisper) on the discrete NVIDIA GPU.
app.commandLine.appendSwitch('force_high_performance_gpu')
registerAppScheme()

if (!app.requestSingleInstanceLock()) app.quit()

let mainWindow: BrowserWindow | null = null

app.on('second-instance', () => {
  if (!mainWindow) return
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.focus()
})

app.whenReady().then(() => {
  const userData = app.getPath('userData')
  const store = new Store(userData)
  const secrets = new Secrets(userData)
  if (store.isFirstRun()) store.setSettings({ uiLanguage: app.getLocale().toLowerCase().startsWith('de') ? 'de' : 'en' })

  // Only the microphone is ever requested; deny everything else.
  session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => {
    callback(permission === 'media')
  })

  const win = createMainWindow(store, path.join(__dirname, '../preload/index.js'))
  mainWindow = win

  registerDataIpc(store, secrets, (settings) => {
    applyWindowSettings(win, settings)
    setGlobalShortcuts(win, settings.globalShortcuts)
  })
  registerCloudIpc(win, secrets)
  watchAudioService(() => !win.isDestroyed() && win.webContents.send(IPC.audioServiceFailed))
  const powerpoint = new PowerPointWatcher((s) => !win.isDestroyed() && win.webContents.send(IPC.pptState, s))
  // Tests feed PowerPoint states themselves; the machine's own PowerPoint joins only the opt-in live test.
  const realPowerPoint = !process.env.PRESENTFLOW_TEST || !!process.env.PF_PPT_LIVE
  ipcMain.handle(IPC.pptWatch, (_e, on: boolean) => {
    if (on && realPowerPoint) powerpoint.start()
    else powerpoint.stop()
    return powerpoint.state
  })
  app.on('before-quit', () => powerpoint.stop())
  setGlobalShortcuts(win, store.getSettings().globalShortcuts)
  nativeTheme.on('updated', () => applyWindowSettings(win, store.getSettings()))

  const query = process.env.PRESENTFLOW_TEST ? '?test=1' : ''
  const devUrl = process.env.ELECTRON_RENDERER_URL
  if (devUrl) {
    win.loadURL(devUrl + query)
  } else {
    handleAppScheme(path.join(__dirname, '../renderer'))
    win.loadURL(`${APP_ORIGIN}/index.html${query}`)
  }
  if (devUrl) {
    // Development: surface renderer errors in the terminal.
    win.webContents.on('console-message', (e) => {
      if (e.level === 'error' || e.level === 'warning') console.log(`[renderer:${e.level}] ${e.message}`)
    })
  }
  win.on('closed', () => {
    mainWindow = null
  })
})

app.on('window-all-closed', () => app.quit())

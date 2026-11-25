import { BrowserWindow, nativeTheme, screen, type Rectangle } from 'electron'
import type { Settings, WindowState } from '@shared/types'
import type { Store } from './store'

const DEFAULT_SIZE = { width: 1040, height: 640 }
const MIN_VISIBLE = 120 // px of the window that must lie on a connected display

/** Title-bar overlay colors; must match `--chrome-bg` / `--chrome-fg` in the renderer CSS. */
const CHROME = {
  light: { color: '#f4f3ef', symbolColor: '#1c1c1c' },
  dark: { color: '#15171b', symbolColor: '#e6e6e6' },
  contrastLight: { color: '#ffffff', symbolColor: '#000000' },
  contrastDark: { color: '#000000', symbolColor: '#ffffff' }
}
export const TITLEBAR_HEIGHT = 40

export function isDark(settings: Settings): boolean {
  return settings.theme === 'dark' || (settings.theme === 'system' && nativeTheme.shouldUseDarkColors)
}

function chromeColors(settings: Settings) {
  const dark = isDark(settings)
  if (settings.highContrast) return dark ? CHROME.contrastDark : CHROME.contrastLight
  return dark ? CHROME.dark : CHROME.light
}

/** True if enough of the rectangle is on some connected display (monitor may have been unplugged). */
function isVisibleOnSomeDisplay(r: Rectangle): boolean {
  return screen.getAllDisplays().some(({ workArea: a }) => {
    const w = Math.min(r.x + r.width, a.x + a.width) - Math.max(r.x, a.x)
    const h = Math.min(r.y + r.height, a.y + a.height) - Math.max(r.y, a.y)
    return w >= MIN_VISIBLE && h >= 40
  })
}

function initialBounds(saved: WindowState | null): Partial<Rectangle> {
  if (!saved) return DEFAULT_SIZE
  const size = { width: saved.width, height: saved.height }
  if (saved.x === undefined || saved.y === undefined) return size
  const rect = { x: saved.x, y: saved.y, ...size }
  return isVisibleOnSomeDisplay(rect) ? rect : size
}

export function createMainWindow(store: Store, preloadPath: string): BrowserWindow {
  const settings = store.getSettings()
  const saved = store.getWindowState()
  const chrome = chromeColors(settings)

  const win = new BrowserWindow({
    ...initialBounds(saved),
    minWidth: 460,
    minHeight: 300,
    show: false,
    title: 'PresentFlow',
    backgroundColor: chrome.color,
    titleBarStyle: 'hidden',
    titleBarOverlay: { ...chrome, height: TITLEBAR_HEIGHT },
    autoHideMenuBar: true,
    webPreferences: {
      preload: preloadPath,
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      // Tracking must keep running while PowerPoint has focus or covers the window.
      backgroundThrottling: false,
      spellcheck: false
    }
  })
  win.removeMenu()
  if (saved?.maximized) win.maximize()
  applyWindowSettings(win, settings)
  win.once('ready-to-show', () => win.show())

  let saveTimer: NodeJS.Timeout | undefined
  const persistBounds = () => {
    clearTimeout(saveTimer)
    saveTimer = setTimeout(() => {
      if (win.isDestroyed() || win.isMinimized()) return
      const b = win.getNormalBounds()
      store.setWindowState({ ...b, maximized: win.isMaximized() })
    }, 400)
  }
  win.on('resize', persistBounds)
  win.on('move', persistBounds)
  win.on('maximize', persistBounds)
  win.on('unmaximize', persistBounds)

  return win
}

export function applyWindowSettings(win: BrowserWindow, settings: Settings): void {
  // 'screen-saver' level keeps the companion above a full-screen PowerPoint slideshow.
  win.setAlwaysOnTop(settings.alwaysOnTop, 'screen-saver')
  win.setOpacity(Math.min(1, Math.max(0.5, settings.opacity)))
  win.setTitleBarOverlay({ ...chromeColors(settings), height: TITLEBAR_HEIGHT })
}

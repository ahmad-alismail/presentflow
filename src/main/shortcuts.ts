import { globalShortcut, type BrowserWindow } from 'electron'
import { IPC } from '@shared/ipc'
import type { ShortcutAction } from '@shared/types'

/**
 * Global shortcuts work while PowerPoint has focus. Ctrl+Alt+letter avoids clicker keys
 * (arrows, PageUp/Down, B, period) and Intel's Ctrl+Alt+Arrow screen-rotation hotkeys.
 */
export const GLOBAL_SHORTCUTS: Record<ShortcutAction, string> = {
  rescue: 'Control+Alt+R',
  next: 'Control+Alt+N',
  back: 'Control+Alt+B',
  focus: 'Control+Alt+F',
  pause: 'Control+Alt+P',
  undoJump: 'Control+Alt+Z'
}

export function setGlobalShortcuts(win: BrowserWindow, enabled: boolean): void {
  globalShortcut.unregisterAll()
  if (!enabled) return
  for (const [action, accelerator] of Object.entries(GLOBAL_SHORTCUTS)) {
    // register() returns false if another app owns the combination; we simply skip it.
    globalShortcut.register(accelerator, () => {
      if (!win.isDestroyed()) win.webContents.send(IPC.shortcut, action as ShortcutAction)
    })
  }
}

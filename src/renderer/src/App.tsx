import { useEffect } from 'react'
import { useApp } from './store'
import { Editor } from './views/Editor'
import { Library } from './views/Library'
import { Rehearsal } from './views/Rehearsal'
import { SettingsDrawer } from './views/Settings'
import { Summary } from './views/Summary'

/** Mirrors settings into CSS variables / data attributes on <html>. */
function useAppearance() {
  const s = useApp((st) => st.settings)
  useEffect(() => {
    const root = document.documentElement
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const apply = () => {
      root.dataset.theme = s.theme === 'system' ? (media.matches ? 'dark' : 'light') : s.theme
      root.dataset.contrast = s.highContrast ? 'high' : 'normal'
      root.style.setProperty('--fs', `${s.fontSize}px`)
      root.style.setProperty('--lh', String(s.lineHeight))
      root.style.setProperty('--sidebar', `${Math.round(s.sidebarRatio * 100)}%`)
      root.style.setProperty('--fs-nav', `${s.navFontSize}px`)
      root.lang = s.uiLanguage
    }
    apply()
    media.addEventListener('change', apply)
    return () => media.removeEventListener('change', apply)
  }, [s.theme, s.highContrast, s.fontSize, s.lineHeight, s.sidebarRatio, s.navFontSize, s.uiLanguage])
}

export function App() {
  useAppearance()
  const screen = useApp((s) => s.screen)
  const settingsOpen = useApp((s) => s.settingsOpen)
  return (
    <div className="app">
      {screen.name === 'library' && <Library />}
      {screen.name === 'editor' && <Editor id={screen.id} />}
      {screen.name === 'rehearsal' && <Rehearsal id={screen.id} />}
      {screen.name === 'summary' && <Summary id={screen.id} />}
      {settingsOpen && <SettingsDrawer />}
    </div>
  )
}

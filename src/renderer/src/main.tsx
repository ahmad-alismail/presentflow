import { createRoot } from 'react-dom/client'
import { App } from './App'
import { activeSession, applyPowerPointState } from './rehearsal/session'
import { useApp } from './store'
import './styles.css'

async function boot() {
  const settings = await window.presentflow.settings.get()
  useApp.setState({ settings })
  window.presentflow.settings.onChange((s) => useApp.setState({ settings: s }))
  window.presentflow.onAudioServiceFailed(() => useApp.setState({ audioBroken: true }))

  // E2E hook (only when launched with ?test=1): inject transcripts without a microphone.
  if (new URLSearchParams(location.search).has('test')) {
    Object.assign(window, {
      __pf: {
        hear: (utteranceId: string, text: string, final = true) =>
          activeSession()?.hear({ utteranceId, kind: final ? 'final' : 'partial', text }, false),
        state: () => useApp.getState(),
        ppt: applyPowerPointState
      }
    })
  }

  createRoot(document.getElementById('root')!).render(<App />)
}

void boot()

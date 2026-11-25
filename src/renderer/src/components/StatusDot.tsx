import { useT, type StringKey } from '../i18n'
import { useApp } from '../store'

/** Microphone problems (`detail` from the speech engine): short label, tooltip with the remedy. */
const MIC_TEXT = new Map<string, [StringKey, StringKey]>([
  ['mic-missing', ['micMissing', 'micMissingHint']],
  ['mic-blocked', ['micBlocked', 'micBlockedHint']],
  ['mic-busy', ['micBusy', 'micBusyHint']],
  ['audio-broken', ['audioBroken', 'audioBrokenHint']]
])

/** Quiet status: a dot only while listening; a short label when the presenter should know something. */
export function StatusDot() {
  const t = useT()
  const status = useApp((s) => s.status)
  const audioBroken = useApp((s) => s.audioBroken)
  let cls: string = status.state
  let label = ''
  let tooltip = ''
  switch (status.state) {
    case 'idle':
      label = t('statusIdle')
      break
    case 'loading':
      label = status.progress && status.progress > 0.01 ? `${t('statusLoading')} ${Math.round(status.progress * 100)} %` : t('statusLoading')
      break
    case 'listening':
      cls = status.hearing ? 'hearing' : 'listening'
      label = status.detail === 'fallback' ? t('statusFallback') : ''
      tooltip = status.hearing ? t('statusHearing') : t('statusListening')
      break
    case 'paused':
      label = t('statusPaused')
      break
    case 'reconnecting':
      label = t('statusReconnecting')
      break
    case 'error': {
      // A crashing audio service reaches the page only as "no device found".
      const mic = MIC_TEXT.get(audioBroken && status.detail === 'mic-missing' ? 'audio-broken' : (status.detail ?? ''))
      label = mic ? t(mic[0]) : t('statusError')
      tooltip = mic ? t(mic[1]) : status.detail ? `${label}: ${status.detail}` : label
      break
    }
  }
  return (
    <span className="status" title={tooltip || label} data-testid="status" data-state={status.state} data-detail={status.detail}>
      <span className={`dot ${cls}`} />
      {label && <span>{label}</span>}
    </span>
  )
}

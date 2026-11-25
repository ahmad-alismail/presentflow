import { useEffect, useRef, useState } from 'react'
import type { CloudProviderId, LocalModelId, ProviderId, Settings as S } from '@shared/types'
import { Icon } from '../components/Icon'
import { useT, type StringKey } from '../i18n'
import { listMicrophones, type Microphones } from '../speech/micDevices'
import { modelWorker } from '../speech/engine'
import type { WorkerOut } from '../speech/speech.worker'
import { useApp } from '../store'

type Tab = 'appearance' | 'speech' | 'powerpoint' | 'shortcuts'
const TAB_LABEL: Record<Tab, StringKey> = {
  appearance: 'settingsAppearance',
  speech: 'settingsSpeech',
  powerpoint: 'settingsPowerPoint',
  shortcuts: 'settingsShortcuts'
}
const PROVIDER_NAMES: Record<CloudProviderId, string> = { openai: 'OpenAI', gemini: 'Google Gemini' }

export function SettingsDrawer() {
  const t = useT()
  const [tab, setTab] = useState<Tab>('appearance')
  const close = () => useApp.getState().setSettingsOpen(false)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div className="backdrop" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div className="drawer" role="dialog" aria-modal="true" aria-label={t('settings')} data-testid="settings">
        <header>
          <strong style={{ flex: 1 }}>{t('settings')}</strong>
          <button className="btn ghost icon" aria-label={t('close')} title={t('close')} onClick={close}>
            <Icon name="close" />
          </button>
        </header>
        <div className="tabs" role="tablist">
          {(Object.keys(TAB_LABEL) as Tab[]).map((k) => (
            <button key={k} role="tab" className="tab" aria-selected={tab === k} onClick={() => setTab(k)}>
              {t(TAB_LABEL[k])}
            </button>
          ))}
        </div>
        <div className="body">
          {tab === 'appearance' && <Appearance />}
          {tab === 'speech' && <Speech />}
          {tab === 'powerpoint' && <PowerPointTab />}
          {tab === 'shortcuts' && <Shortcuts />}
        </div>
      </div>
    </div>
  )
}

function useSettings(): [S, (patch: Partial<S>) => void] {
  const settings = useApp((s) => s.settings)
  return [settings, (patch) => void useApp.getState().updateSettings(patch)]
}

function Seg<T extends string | number>({ value, options, onChange }: { value: T; options: [T, string][]; onChange(v: T): void }) {
  return (
    <div className="seg">
      {options.map(([v, label]) => (
        <button key={String(v)} aria-pressed={value === v} onClick={() => onChange(v)}>
          {label}
        </button>
      ))}
    </div>
  )
}

function Appearance() {
  const t = useT()
  const [s, set] = useSettings()
  return (
    <>
      <div className="field">
        <label>{t('fontSize')}</label>
        <div className="row">
          <input type="range" min={22} max={56} step={1} value={s.fontSize} onChange={(e) => set({ fontSize: +e.target.value })} />
          <span className="kbd">{s.fontSize}px</span>
        </div>
      </div>
      <div className="field">
        <label>{t('lineHeight')}</label>
        <div className="row">
          <input type="range" min={1.2} max={1.9} step={0.05} value={s.lineHeight} onChange={(e) => set({ lineHeight: +e.target.value })} />
          <span className="kbd">{s.lineHeight.toFixed(2)}</span>
        </div>
      </div>
      <div className="field">
        <div className="label">{t('theme')}</div>
        <Seg
          value={s.theme}
          options={[
            ['system', t('themeSystem')],
            ['light', t('themeLight')],
            ['dark', t('themeDark')]
          ]}
          onChange={(theme) => set({ theme })}
        />
      </div>
      <div className="field">
        <label className="check">
          <input type="checkbox" checked={s.highContrast} onChange={(e) => set({ highContrast: e.target.checked })} />
          {t('highContrast')}
        </label>
      </div>
      <div className="field">
        <label className="check">
          <input type="checkbox" checked={s.emphasizeKeywords} onChange={(e) => set({ emphasizeKeywords: e.target.checked })} />
          {t('emphasizeKeywords')}
        </label>
      </div>
      <div className="field">
        <div className="label">{t('upcomingCount')}</div>
        <Seg value={s.upcomingCount} options={[[1, '1'], [2, '2']]} onChange={(upcomingCount) => set({ upcomingCount })} />
      </div>
      <div className="field">
        <label>{t('sidebarRatio')}</label>
        <div className="row">
          <input type="range" min={0.2} max={0.45} step={0.01} value={s.sidebarRatio} onChange={(e) => set({ sidebarRatio: +e.target.value })} />
          <span className="kbd">{Math.round(s.sidebarRatio * 100)} %</span>
        </div>
      </div>
      <div className="field">
        <label>{t('navFontSize')}</label>
        <div className="row">
          <input type="range" min={16} max={40} step={1} value={s.navFontSize} onChange={(e) => set({ navFontSize: +e.target.value })} />
          <span className="kbd">{s.navFontSize}px</span>
        </div>
      </div>
      <div className="field">
        <label>{t('opacity')}</label>
        <div className="row">
          <input type="range" min={0.5} max={1} step={0.05} value={s.opacity} onChange={(e) => set({ opacity: +e.target.value })} />
          <span className="kbd">{Math.round(s.opacity * 100)} %</span>
        </div>
      </div>
      <div className="field">
        <label className="check">
          <input type="checkbox" checked={s.alwaysOnTop} onChange={(e) => set({ alwaysOnTop: e.target.checked })} />
          {t('alwaysOnTop')}
        </label>
      </div>
      <div className="field">
        <div className="label">{t('uiLanguage')}</div>
        <Seg
          value={s.uiLanguage}
          options={[
            ['de', 'Deutsch'],
            ['en', 'English']
          ]}
          onChange={(uiLanguage) => set({ uiLanguage })}
        />
      </div>
    </>
  )
}

function ModelStatus({ model }: { model: LocalModelId }) {
  const t = useT()
  const [state, setState] = useState<{ cached?: boolean; progress?: number; error?: string }>({})
  const worker = useRef<Worker | null>(null)
  useEffect(() => {
    const w = modelWorker()
    worker.current = w
    w.onmessage = (e: MessageEvent<WorkerOut>) => {
      if (e.data.type === 'cached') setState({ cached: e.data.value })
      else if (e.data.type === 'progress') setState({ progress: e.data.progress })
      else if (e.data.type === 'prefetched') setState({ cached: true })
      else if (e.data.type === 'error') setState({ error: e.data.message })
    }
    w.postMessage({ type: 'isCached', model })
    return () => w.terminate()
  }, [model])
  const download = () => {
    setState({ progress: 0 })
    worker.current?.postMessage({ type: 'prefetch', model })
  }
  if (state.progress !== undefined) {
    return (
      <div className="help">
        {t('downloading', { p: Math.round(state.progress * 100) })}
        <div className="progress" style={{ marginTop: 4 }}>
          <div style={{ width: `${state.progress * 100}%` }} />
        </div>
      </div>
    )
  }
  if (state.error) return <div className="help" style={{ color: 'var(--danger)' }}>{state.error}</div>
  if (state.cached === undefined) return null
  return state.cached ? (
    <div className="help" style={{ color: 'var(--done)' }}>✓ {t('modelReady')}</div>
  ) : (
    <div className="row help">
      <span>{t('modelNotDownloaded')}</span>
      <button className="btn" onClick={download}>
        {t('downloadModel')}
      </button>
    </div>
  )
}

function ApiKey({ provider }: { provider: CloudProviderId }) {
  const t = useT()
  const [has, setHas] = useState(false)
  const [value, setValue] = useState('')
  useEffect(() => {
    void window.presentflow.secrets.has(provider).then(setHas)
  }, [provider])
  const save = async () => {
    await window.presentflow.secrets.set(provider, value)
    setValue('')
    setHas(await window.presentflow.secrets.has(provider))
  }
  return (
    <div className="field">
      <label>{t('apiKey')}</label>
      {has ? (
        <div className="row">
          <span className="help" style={{ flex: 1, color: 'var(--done)' }}>✓ {t('apiKeySaved')}</span>
          <button
            className="btn"
            onClick={async () => {
              await window.presentflow.secrets.clear(provider)
              setHas(false)
            }}
          >
            {t('remove')}
          </button>
        </div>
      ) : (
        <div className="row">
          <input className="input" style={{ flex: 1 }} type="password" placeholder={t('apiKeyPlaceholder')} value={value} onChange={(e) => setValue(e.target.value)} />
          <button className="btn" disabled={!value.trim()} onClick={save}>
            {t('save')}
          </button>
        </div>
      )}
    </div>
  )
}

function Speech() {
  const t = useT()
  const [s, set] = useSettings()
  const [mics, setMics] = useState<Microphones | null>(null)
  const audioBroken = useApp((st) => st.audioBroken)
  const [consentFor, setConsentFor] = useState<CloudProviderId | null>(null)
  useEffect(() => {
    // Live list: headsets come and go while Settings is open.
    const refresh = () => void listMicrophones().then(setMics)
    refresh()
    navigator.mediaDevices.addEventListener('devicechange', refresh)
    return () => navigator.mediaDevices.removeEventListener('devicechange', refresh)
  }, [])

  const choose = (provider: ProviderId) => {
    if (provider !== 'local' && !s.cloudConsent[provider]) return setConsentFor(provider)
    set({ provider })
  }
  const providers: [ProviderId, StringKey][] = [
    ['local', 'providerLocal'],
    ['openai', 'providerOpenai'],
    ['gemini', 'providerGemini']
  ]

  return (
    <>
      <div className="field">
        <div className="label">{t('provider')}</div>
        {providers.map(([id, key]) => (
          <label key={id} className={`radio-card${s.provider === id ? ' selected' : ''}`}>
            <input type="radio" name="provider" checked={s.provider === id} onChange={() => choose(id)} />
            <span>{t(key)}</span>
          </label>
        ))}
        {s.provider !== 'local' && <div className="help">{t('cloudCostNote')}</div>}
      </div>

      {s.provider === 'local' && (
        <div className="field">
          <div className="label">{t('localModel')}</div>
          {(['whisper-large-v3-turbo', 'whisper-small'] as LocalModelId[]).map((m) => (
            <label key={m} className={`radio-card${s.localModel === m ? ' selected' : ''}`}>
              <input type="radio" name="model" checked={s.localModel === m} onChange={() => set({ localModel: m })} />
              <span>{t(m === 'whisper-small' ? 'modelFast' : 'modelBest')}</span>
            </label>
          ))}
          <ModelStatus model={s.localModel} />
        </div>
      )}

      {s.provider !== 'local' && (
        <>
          <ApiKey provider={s.provider} />
          <div className="field">
            <label>{t('model')}</label>
            <input
              className="input"
              style={{ width: '100%' }}
              value={s.provider === 'openai' ? s.openaiModel : s.geminiModel}
              onChange={(e) => set(s.provider === 'openai' ? { openaiModel: e.target.value } : { geminiModel: e.target.value })}
            />
          </div>
          <div className="field">
            <label className="check">
              <input type="checkbox" checked={s.fallbackToLocal} onChange={(e) => set({ fallbackToLocal: e.target.checked })} />
              {t('fallbackToLocal')}
            </label>
          </div>
        </>
      )}

      <div className="field">
        <label>{t('microphone')}</label>
        <select
          className="input"
          style={{ width: '100%' }}
          data-testid="microphone"
          value={s.microphoneId ?? ''}
          onChange={(e) => set({ microphoneId: e.target.value || null })}
        >
          <option value="">{mics?.defaultName ? t('defaultMicrophoneIs', { name: mics.defaultName }) : t('defaultMicrophone')}</option>
          {mics?.devices.map((m) => (
            <option key={m.deviceId} value={m.deviceId}>
              {m.label || m.deviceId.slice(0, 8)}
            </option>
          ))}
        </select>
        {audioBroken ? (
          <div className="help warn" data-testid="microphone-help">
            {t('audioBrokenHint')}
          </div>
        ) : (
          mics?.devices.length === 0 && (
            <div className="help warn" data-testid="microphone-help">
              {t('micNoneFound')}
            </div>
          )
        )}
      </div>

      {consentFor && (
        <div className="backdrop center" style={{ inset: 0 }}>
          <div className="dialog" role="alertdialog" aria-modal="true">
            <h2>{t('consentTitle', { provider: PROVIDER_NAMES[consentFor] })}</h2>
            <p>{t('consentBody', { provider: PROVIDER_NAMES[consentFor] })}</p>
            <div className="actions">
              <button className="btn" autoFocus onClick={() => setConsentFor(null)}>
                {t('consentDecline')}
              </button>
              <button
                className="btn primary"
                onClick={() => {
                  set({ provider: consentFor, cloudConsent: { ...s.cloudConsent, [consentFor]: true } })
                  setConsentFor(null)
                }}
              >
                {t('consentAccept')}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

function PowerPointTab() {
  const t = useT()
  const [s, set] = useSettings()
  const ppt = useApp((st) => st.ppt)
  const inRehearsal = useApp((st) => st.screen.name === 'rehearsal')
  let status = ''
  if (s.followPowerPoint) {
    if (!inRehearsal) status = t('pptStatusInactive')
    else if (!ppt) status = t('pptStatusNotRunning')
    else {
      const file = ppt.state.file ? ppt.state.file.split(/[\\/]/).pop()! : 'PowerPoint'
      status = `${t('pptStatusConnected', { file, n: ppt.state.slide ?? '–', count: ppt.state.count ?? '–' })} ${t(ppt.matched ? 'pptStatusMatched' : s.slideAdvance === 'manual' ? 'pptStatusUnmatchedHold' : 'pptStatusUnmatched')}`
    }
  }
  return (
    <>
      <div className="field">
        <label className="check">
          <input type="checkbox" checked={s.followPowerPoint} onChange={(e) => set({ followPowerPoint: e.target.checked })} />
          {t('followPowerPoint')}
        </label>
        {status && (
          <div className="help" data-testid="ppt-status">
            {status}
          </div>
        )}
      </div>
      {s.followPowerPoint && (
        <div className="field" data-testid="slide-advance">
          <div className="label">{t('slideAdvance')}</div>
          <Seg
            value={s.slideAdvance}
            options={[
              ['manual', t('slideAdvanceManual')],
              ['auto', t('slideAdvanceAuto')]
            ]}
            onChange={(slideAdvance) => set({ slideAdvance })}
          />
          <div className="help">{t(s.slideAdvance === 'manual' ? 'slideAdvanceManualHelp' : 'slideAdvanceAutoHelp')}</div>
        </div>
      )}
      <p className="help">{t('pptHelp')}</p>
    </>
  )
}

function Shortcuts() {
  const t = useT()
  const [s, set] = useSettings()
  const rows: [StringKey, string, string][] = [
    ['shortcutRescue', 'Ctrl+Alt+R', 'R'],
    ['shortcutNext', 'Ctrl+Alt+N', 'N'],
    ['shortcutBack', 'Ctrl+Alt+B', 'U'],
    ['shortcutFocus', 'Ctrl+Alt+F', 'F'],
    ['shortcutPause', 'Ctrl+Alt+P', 'P'],
    ['shortcutUndoJump', 'Ctrl+Alt+Z', 'Z']
  ]
  return (
    <>
      <div className="field">
        <label className="check">
          <input type="checkbox" checked={s.globalShortcuts} onChange={(e) => set({ globalShortcuts: e.target.checked })} />
          {t('globalShortcuts')}
        </label>
      </div>
      {rows.map(([key, global, local]) => (
        <div key={key} className="shortcut-row">
          <span>{t(key)}</span>
          <span className="row">
            <span className="kbd">{global}</span>
            <span className="kbd">{local}</span>
          </span>
        </div>
      ))}
      <p className="help" style={{ marginTop: 10 }}>{t('shortcutInWindow')}</p>
    </>
  )
}

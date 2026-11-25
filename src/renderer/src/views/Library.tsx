import { useEffect, useState } from 'react'
import { parseScript } from '@core/script/parse'
import { guessLanguage } from '@core/text/language'
import type { Presentation, PresentationMeta, SessionSnapshot, SpeechLanguage } from '@shared/types'
import sampleSource from '../../../../resources/sample-de.md?raw'
import { Icon } from '../components/Icon'
import { useT } from '../i18n'
import { openSession } from '../rehearsal/session'
import { useApp } from '../store'
import { TEMPLATES } from './Guide'

export function newPresentation(title: string, source: string, language: SpeechLanguage): Presentation {
  const now = Date.now()
  return { id: `p${now.toString(36)}${Math.random().toString(36).slice(2, 6)}`, title, language, source, cues: {}, createdAt: now, updatedAt: now }
}

/** Opens a presentation for rehearsal, asking whether to resume saved progress. */
export async function startRehearsal(
  p: Presentation,
  ask: (said: number, total: number) => Promise<boolean>
): Promise<void> {
  let snapshot: SessionSnapshot | null = await window.presentflow.sessions.get(p.id)
  if (snapshot) {
    const total = parseScript(p.source).sentences.length
    const said = Object.values(snapshot.sentences).filter((s) => s.status === 'covered' || s.status === 'manual').length
    if (said > 0 && !(await ask(said, total))) {
      await window.presentflow.sessions.clear(p.id)
      snapshot = null
    }
  }
  await openSession(p, snapshot)
  useApp.getState().setScreen({ name: 'rehearsal', id: p.id })
}

export function useResumePrompt() {
  const [prompt, setPrompt] = useState<{ said: number; total: number; resolve: (resume: boolean) => void } | null>(null)
  const ask = (said: number, total: number) => new Promise<boolean>((resolve) => setPrompt({ said, total, resolve }))
  const t = useT()
  const answer = (resume: boolean) => {
    prompt?.resolve(resume)
    setPrompt(null)
  }
  const dialog = prompt && (
    <div className="backdrop center" data-testid="resume-dialog">
      <div className="dialog" role="dialog" aria-modal="true">
        <h2>{t('resumeTitle')}</h2>
        <p>{t('resumeBody', { said: prompt.said, total: prompt.total })}</p>
        <div className="actions">
          <button className="btn" onClick={() => answer(false)}>
            {t('startFresh')}
          </button>
          <button className="btn primary" autoFocus onClick={() => answer(true)}>
            {t('resume')}
          </button>
        </div>
      </div>
    </div>
  )
  return { ask, dialog }
}

export function Library() {
  const t = useT()
  const lang = useApp((s) => s.settings.uiLanguage)
  const [items, setItems] = useState<PresentationMeta[] | null>(null)
  const [confirming, setConfirming] = useState<string | null>(null)
  const { ask, dialog } = useResumePrompt()

  const refresh = () => window.presentflow.presentations.list().then(setItems)
  useEffect(() => {
    void refresh()
  }, [])

  const create = async (title: string, source: string, language?: SpeechLanguage) => {
    const p = newPresentation(title, source, language ?? guessLanguage(source))
    await window.presentflow.presentations.save(p)
    useApp.getState().setScreen({ name: 'editor', id: p.id })
  }

  const rehearse = async (id: string) => {
    const p = await window.presentflow.presentations.get(id)
    if (p) await startRehearsal(p, ask)
  }

  const remove = async (id: string) => {
    await window.presentflow.presentations.delete(id)
    setConfirming(null)
    void refresh()
  }

  const date = (ms: number) => new Date(ms).toLocaleDateString(lang === 'de' ? 'de-DE' : 'en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

  return (
    <>
      <header className="titlebar">
        <span className="brand">{t('appName')}</span>
        <span className="grow" />
        <button className="btn ghost icon" title={t('settings')} aria-label={t('settings')} onClick={() => useApp.getState().setSettingsOpen(true)}>
          <Icon name="settings" />
        </button>
      </header>
      <main className="page">
        <div className="page-inner">
          <h1>{t('libraryTitle')}</h1>
          <div className="toolbar">
            <button className="btn primary" data-testid="new" onClick={() => create('', TEMPLATES[lang], lang)}>
              <Icon name="plus" />
              {t('newPresentation')}
            </button>
            <button
              className="btn"
              onClick={async () => {
                const file = await window.presentflow.presentations.importFile()
                if (file) await create(file.title, file.source, file.language)
              }}
            >
              <Icon name="upload" />
              {t('importFile')}
            </button>
            <button className="btn" data-testid="open-sample" onClick={() => create(t('sampleTitle'), sampleSource)}>
              <Icon name="sparkle" />
              {t('openSample')}
            </button>
          </div>
          {items && items.length === 0 && <div className="card empty">{t('libraryEmpty')}</div>}
          <div className="pres-list">
            {items?.map((p) => (
              <div key={p.id} className="card pres" data-testid="presentation">
                <div className="meta">
                  <div className="title">{p.title || t('untitled')}</div>
                  <div className="sub">
                    <span className="badge">{p.language}</span> {t('updated')} {date(p.updatedAt)}
                  </div>
                </div>
                {confirming === p.id ? (
                  <>
                    <span className="sub">{t('confirmDelete')}</span>
                    <button className="btn danger" onClick={() => remove(p.id)}>
                      {t('delete')}
                    </button>
                    <button className="btn ghost" onClick={() => setConfirming(null)}>
                      {t('cancel')}
                    </button>
                  </>
                ) : (
                  <>
                    <button className="btn ghost icon" title={t('delete')} aria-label={t('delete')} onClick={() => setConfirming(p.id)}>
                      <Icon name="trash" />
                    </button>
                    <button className="btn" onClick={() => useApp.getState().setScreen({ name: 'editor', id: p.id })}>
                      <Icon name="edit" />
                      {t('edit')}
                    </button>
                    <button className="btn primary" data-testid="rehearse" onClick={() => rehearse(p.id)}>
                      <Icon name="play" />
                      {t('rehearse')}
                    </button>
                  </>
                )}
              </div>
            ))}
          </div>
        </div>
      </main>
      {dialog}
    </>
  )
}

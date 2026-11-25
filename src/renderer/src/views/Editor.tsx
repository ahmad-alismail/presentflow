import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import { parseScript } from '@core/script/parse'
import { autoCue, computeIdf } from '@core/text/cues'
import type { Presentation, SpeechLanguage } from '@shared/types'
import { Icon } from '../components/Icon'
import { useT } from '../i18n'
import { startRehearsal, useResumePrompt } from './Library'
import { useApp } from '../store'
import { Guide, isTemplate } from './Guide'

export function Editor({ id }: { id: string }) {
  const t = useT()
  const [p, setP] = useState<Presentation | null>(null)
  const saveTimer = useRef<number | undefined>(undefined)
  const latest = useRef<Presentation | null>(null)
  const { ask, dialog } = useResumePrompt()
  const [pane, setPane] = useState<'outline' | 'guide' | null>(null)

  useEffect(() => {
    void window.presentflow.presentations.get(id).then((loaded) => {
      setP(loaded)
      latest.current = loaded
      setPane((cur) => cur ?? (loaded && isTemplate(loaded.source) ? 'guide' : 'outline'))
    })
  }, [id])

  const flush = async () => {
    window.clearTimeout(saveTimer.current)
    if (latest.current) await window.presentflow.presentations.save(latest.current)
  }
  useEffect(() => () => void flush(), [])

  const update = (patch: Partial<Presentation>) => {
    setP((prev) => {
      if (!prev) return prev
      const next = { ...prev, ...patch, updatedAt: Date.now() }
      latest.current = next
      window.clearTimeout(saveTimer.current)
      saveTimer.current = window.setTimeout(() => void window.presentflow.presentations.save(next), 500)
      return next
    })
  }

  const source = useDeferredValue(p?.source ?? '')
  const script = useMemo(() => parseScript(source), [source])
  const idf = useMemo(() => computeIdf(script.sentences.map((s) => s.text)), [script])

  if (!p) return null

  const setCue = (cueKey: string, value: string) => {
    const cues = { ...p.cues }
    if (value.trim()) cues[cueKey] = value
    else delete cues[cueKey]
    update({ cues })
  }

  const back = async () => {
    await flush()
    useApp.getState().setScreen({ name: 'library' })
  }
  const rehearse = async () => {
    await flush()
    if (latest.current) await startRehearsal(latest.current, ask)
  }

  return (
    <>
      <header className="titlebar">
        <button className="btn ghost icon" title={t('back')} aria-label={t('back')} onClick={back}>
          <Icon name="back" />
        </button>
        <span className="brand">{t('appName')}</span>
        <span className="grow" />
        <label className="status" title={t('speechLanguage')}>
          {t('speechLanguage')}
          <select className="input" value={p.language} onChange={(e) => update({ language: e.target.value as SpeechLanguage })}>
            <option value="de">Deutsch</option>
            <option value="en">English</option>
          </select>
        </label>
        <button className="btn primary" disabled={script.sentences.length === 0} data-testid="editor-rehearse" onClick={rehearse}>
          <Icon name="play" />
          {t('rehearse')}
        </button>
      </header>
      <main className="editor">
        <section className="editor-pane">
          <input
            className="title-input"
            placeholder={t('editorTitlePlaceholder')}
            value={p.title}
            onChange={(e) => update({ title: e.target.value })}
          />
          <textarea
            className="script-input"
            data-testid="script-input"
            spellCheck={false}
            placeholder={t('editorPlaceholder')}
            value={p.source}
            onChange={(e) => update({ source: e.target.value })}
          />
          <div className="hint-line">{t('editorHelp')}</div>
        </section>
        <section className="editor-pane" aria-label={pane === 'guide' ? t('guideTab') : t('outline')}>
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <div className="seg" role="tablist">
              <button role="tab" aria-pressed={pane !== 'guide'} onClick={() => setPane('outline')}>
                {t('outlineTab')}
              </button>
              <button role="tab" aria-pressed={pane === 'guide'} data-testid="guide-tab" onClick={() => setPane('guide')}>
                {t('guideTab')}
              </button>
            </div>
            <span className="status">
              {t('sectionsCount', { n: script.sections.length })} · {t('sentencesCount', { n: script.sentences.length })}
            </span>
          </div>
          {pane === 'guide' && <Guide />}
          {pane !== 'guide' && script.sentences.length === 0 && <p className="muted-note" style={{ margin: '12px 0' }}>{t('outlineEmpty')}</p>}
          {pane !== 'guide' && script.sections.map((sec, i) => {
            const slide = sec.slideId ? script.slides.find((s) => s.id === sec.slideId) : null
            const prev = script.sections[i - 1]
            return (
              <div key={sec.id}>
                {slide && prev?.slideId !== sec.slideId && <div className="outline-slide">{slide.title}</div>}
                <div className="outline-section">{sec.title}</div>
                {sec.sentenceIds.map((sid) => {
                  const s = script.sentences.find((x) => x.id === sid)!
                  const custom = p.cues[s.cueKey]
                  return (
                    <div key={sid} className="outline-sentence">
                      <div className="s">{s.text}</div>
                      <input
                        className={`cue-input${custom ? ' custom' : ''}`}
                        aria-label={t('cueLabel')}
                        title={t('cueHint')}
                        placeholder={autoCue(s.text, idf)}
                        value={custom ?? ''}
                        onChange={(e) => setCue(s.cueKey, e.target.value)}
                      />
                    </div>
                  )
                })}
              </div>
            )
          })}
        </section>
      </main>
      {dialog}
    </>
  )
}

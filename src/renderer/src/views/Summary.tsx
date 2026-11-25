import { StateIcon } from '../components/Icon'
import { THRESHOLDS } from '@core/tracking/tracker'
import { useT } from '../i18n'
import { activeSession, closeSession } from '../rehearsal/session'
import { useApp } from '../store'

/** End-of-rehearsal overview (also the history view): what was said, what is still open. No scores. */
export function Summary({ id }: { id: string }) {
  const t = useT()
  const session = activeSession()
  useApp((s) => s.view) // re-render on changes
  if (!session) return null
  const { tracker, script } = session

  const sections = script.sections.map((sec) => {
    const said: string[] = []
    const open: { id: string; partial: string | null; uncertain: boolean }[] = []
    for (const sid of sec.sentenceIds) {
      const st = tracker.sentenceState(sid)
      if (st.status === 'covered' || st.status === 'manual') said.push(sid)
      else open.push({ id: sid, partial: tracker.missingText(sid), uncertain: st.status === 'open' && st.evidence >= THRESHOLDS.medium })
    }
    return { sec, said, open }
  })
  const allSaid = sections.every((s) => s.open.length === 0)

  const toLibrary = async () => {
    await closeSession()
    useApp.getState().setScreen({ name: 'library' })
  }

  return (
    <>
      <header className="titlebar">
        <span className="brand">{t('summaryTitle')}</span>
        <span className="grow" />
      </header>
      <main className="page" data-testid="summary">
        <div className="page-inner">
          <h1>{session.presentation.title || t('untitled')}</h1>
          <div className="toolbar">
            <button className="btn primary" onClick={() => useApp.getState().setScreen({ name: 'rehearsal', id })}>
              {t('continueRehearsal')}
            </button>
            <button
              className="btn"
              onClick={() => {
                session.restart()
                useApp.getState().setScreen({ name: 'rehearsal', id })
              }}
            >
              {t('restart')}
            </button>
            <button className="btn ghost" onClick={toLibrary}>
              {t('toLibrary')}
            </button>
          </div>
          {allSaid && <div className="card" style={{ marginBottom: 16 }}>{t('summaryAllSaid')}</div>}
          {sections.map(({ sec, said, open }) => (
            <section key={sec.id} className="sum-section card">
              <h3>
                <StateIcon state={open.length === 0 ? 'done' : said.length > 0 ? 'partial' : 'open'} />
                {sec.title}
              </h3>
              {open.map((o) => (
                <div key={o.id} className="sum-line open">
                  {session.info.get(o.id)?.text}
                  {o.uncertain && <span className="tag">{t('summaryUncertain')}</span>}
                  {o.partial && (
                    <span className="miss">
                      {t('summaryMissingPart')}: … {o.partial}
                    </span>
                  )}
                </div>
              ))}
              {said.length > 0 && (
                <details>
                  <summary>
                    {t('summarySaid')} ({said.length})
                  </summary>
                  {said.map((sid) => (
                    <div key={sid} className="sum-line">
                      {session.info.get(sid)?.text}
                    </div>
                  ))}
                </details>
              )}
            </section>
          ))}
        </div>
      </main>
    </>
  )
}

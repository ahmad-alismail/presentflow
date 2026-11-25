import { useLayoutEffect, useRef, type ReactNode, type RefObject } from 'react'
import { precedingSentences } from '@core/tracking/preceding'
import type { ViewItem } from '@core/tracking/tracker'
import { useT } from '../i18n'
import type { RehearsalSession } from '../rehearsal/session'
import { useApp, useDisplayedView } from '../store'

const MIN_FONT = 18
/** Sentences kept above the current one (like song lyrics); the oldest fade out at the top. */
const PAST_LINES = 3

/** Wraps the sentence's keywords in <b> — words taken verbatim from the sentence. */
function emphasize(text: string, keywords: string[], enabled: boolean): ReactNode {
  if (!enabled || keywords.length === 0) return text
  const escaped = keywords.map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  const re = new RegExp(`(?<![\\p{L}\\p{N}])(${escaped.join('|')})(?![\\p{L}\\p{N}])`, 'gu')
  const parts = text.split(re)
  return parts.map((p, i) => (i % 2 === 1 ? <b key={i} className="kw">{p}</b> : p))
}

/**
 * Keeps the current sentence and the next one visible in any window size: drop the optional
 * second upcoming sentence first, then shrink the font (never below MIN_FONT). Only `fitRef`
 * (current + upcoming) is measured — the lines above may be clipped at the top. The size is set on
 * `boxRef` so those lines scale along. Runs only when the content or the size changes.
 */
function useAutoFit(boxRef: RefObject<HTMLDivElement | null>, fitRef: RefObject<HTMLDivElement | null>, base: number, key: string) {
  useLayoutEffect(() => {
    const box = boxRef.current
    const el = fitRef.current
    if (!box || !el) return
    const fit = () => {
      box.dataset.hideSecond = 'false'
      let fs = base
      box.style.setProperty('--fs-fit', `${fs}px`)
      const overflowing = () => el.scrollHeight > el.clientHeight + 1
      if (overflowing()) box.dataset.hideSecond = 'true'
      while (overflowing() && fs > MIN_FONT) {
        fs -= 2
        box.style.setProperty('--fs-fit', `${fs}px`)
      }
    }
    fit()
    const ro = new ResizeObserver(fit)
    ro.observe(el)
    return () => ro.disconnect()
  }, [boxRef, fitRef, base, key])
}

export function Stage({ session }: { session: RehearsalSession }) {
  const t = useT()
  const view = useDisplayedView()
  const settings = useApp((s) => s.settings)
  const rescue = useApp((s) => s.rescue)
  const locked = useApp((s) => s.frozen !== null)
  const ref = useRef<HTMLDivElement>(null)
  const aheadRef = useRef<HTMLDivElement>(null)
  const fitKey = [view?.current?.sentenceId, ...(view?.upcoming.map((u) => u.sentenceId) ?? []), rescue, settings.upcomingCount].join('|')
  useAutoFit(ref, aheadRef, settings.fontSize, fitKey)

  if (!view) return <div className="stage" ref={ref} />
  const current = view.current
  const info = current ? session.info.get(current.sentenceId) : undefined

  if (rescue > 0 && info) {
    const last = view.lastSaidId ? session.info.get(view.lastSaidId) : undefined
    return (
      <div className={`stage${locked ? ' locked' : ''}`} ref={ref} data-testid="stage">
        <div className="rescue" data-testid="rescue">
          {last && (
            <>
              <div className="label">{t('lastSaid')}</div>
              <div className="last">{last.text}</div>
            </>
          )}
          <div className="label">{t('now')}</div>
          <div className="cue" data-testid="rescue-cue">{info.cue}</div>
          {rescue === 2 && <div className="full">{info.text}</div>}
          <div className="hint">{rescue === 1 ? `${t('rescueMore')} · ` : ''}{t('rescueClose')}</div>
        </div>
      </div>
    )
  }

  if ((!current || !info) && !view.scope) {
    return (
      <div className="stage" ref={ref} data-testid="stage">
        <p className="all-done">{t('allDone')}</p>
      </div>
    )
  }

  const activeSection = view.sections.find((s) => s.active)
  const upcoming = view.upcoming.slice(0, settings.upcomingCount)
  const past = precedingSentences(session.script, view, PAST_LINES)
  // Held to the slide PowerPoint shows: its end is marked instead of showing the next slide's text.
  const nextSlide = view.scope ? session.nextSlideTitle(view.scope) : null
  const nextSlideNote = nextSlide ? t('nextSlide', { title: nextSlide }) : null
  const slideEnds = view.scope !== null && upcoming.length < settings.upcomingCount
  const activeSlide = activeSection ? session.slideTitleOf(activeSection.id) : null
  /** "Section", or "Slide · Section" when the sentence lies on another slide than the active section. */
  const where = (id: string) => {
    const i = session.info.get(id)
    if (!i) return ''
    return i.slideTitle && i.slideTitle !== activeSlide ? `${i.slideTitle} · ${i.sectionTitle}` : i.sectionTitle
  }
  const label = (item: ViewItem, prevSection: string) =>
    item.sectionId !== prevSection ? <span className="continuation">→ {where(item.sentenceId)}</span> : null
  const showSectionTag = current && (current.continuation || current.sectionId !== past.at(-1)?.sectionId)

  return (
    <div className={`stage lyrics${locked ? ' locked' : ''}`} ref={ref} data-testid="stage">
      {/* Bottom-anchored: when space runs out, the oldest text is clipped, never the sentence just left. */}
      <div className="past">
        {past.map((p, i) => {
          const newest = i === past.length - 1
          return (
            <p
              key={p.sentenceId}
              className={`line${newest ? ' newest' : ''}${p.skipped ? ' skipped' : ''}`}
              data-testid={newest ? 'prev' : 'prev-older'}
              title={p.skipped ? t('skippedHint') : undefined}
            >
              {i > 0 && p.sectionId !== past[i - 1].sectionId && <span className="continuation">{where(p.sentenceId)}</span>}
              {session.info.get(p.sentenceId)?.text}
            </p>
          )
        })}
        {showSectionTag && (
          <div className="section-tag">
            {current.continuation ? (
              <>
                {activeSection?.status === 'done' && <span className="done">✓ {t('sectionDone')}</span>}
                <span style={{ color: 'var(--accent)' }}>→ {where(current.sentenceId)}</span>
              </>
            ) : (
              <span data-testid="section-title">{info?.sectionTitle}</span>
            )}
          </div>
        )}
      </div>
      <div className="ahead" ref={aheadRef}>
        {current && info ? (
          <>
            <p className="current" key={current.sentenceId} data-testid="current">
              {emphasize(info.text, info.keywords, settings.emphasizeKeywords)}
            </p>
            <div className="upcoming">
              {upcoming.map((u, i) => {
                const prev = i === 0 ? current.sectionId : upcoming[i - 1].sectionId
                return (
                  <p
                    key={u.sentenceId}
                    className={`item${i === 1 ? ' second' : ''}`}
                    data-testid={i === 0 ? 'next' : 'next2'}
                  >
                    {label(u, prev)}
                    {session.info.get(u.sentenceId)?.text}
                  </p>
                )
              })}
              {slideEnds && (
                <p className="item slide-end" data-testid="slide-end">
                  {t('slideEnd')}
                  {nextSlideNote && ` · ${nextSlideNote}`}
                </p>
              )}
            </div>
          </>
        ) : (
          <div className={`slide-done${view.scope?.length ? '' : ' no-text'}`} data-testid="slide-done">
            <div className="title">{view.scope?.length ? `✓ ${t('slideDone')}` : t('slideNoText')}</div>
            {nextSlideNote && <div className="next">{nextSlideNote}</div>}
          </div>
        )}
      </div>
    </div>
  )
}

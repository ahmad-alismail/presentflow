import { Fragment, useEffect, useRef, type RefObject } from 'react'
import type { ScriptSection, ScriptSlide } from '@core/script/parse'
import type { SectionView } from '@core/tracking/tracker'
import { useT } from '../i18n'
import type { RehearsalSession } from '../rehearsal/session'
import { useApp } from '../store'
import { StateIcon } from './Icon'

type RowState = 'done' | 'active' | 'partial' | 'open'
type PointState = 'said' | 'current' | 'skipped' | 'open'

const POINT_ICON: Record<PointState, RowState> = { said: 'done', current: 'active', skipped: 'open', open: 'open' }

function iconState(s: SectionView): RowState {
  return s.active ? 'active' : s.status
}

/** A slide holds the active section → active; otherwise the combined status of its sections. */
function slideState(sections: SectionView[]): RowState {
  if (sections.some((s) => s.active)) return 'active'
  if (sections.length && sections.every((s) => s.status === 'done')) return 'done'
  return sections.some((s) => s.status !== 'open') ? 'partial' : 'open'
}

/** Brings the marked row into view when `key` changes — never on other updates. */
function useScrollToActive(ref: RefObject<HTMLElement | null>, key: string | null | undefined) {
  useEffect(() => {
    ref.current?.querySelector('[aria-current="true"]')?.scrollIntoView({ block: 'nearest' })
  }, [ref, key])
}

/**
 * The visual memory map, readable from a distance: every talking point of the active section in
 * large type on top (said ones ticked, nothing disappears), the slides below with the active
 * slide's sections underneath. Rows never reorder — only icons and highlights change (UI-07).
 */
export function Navigator({ session, narrow }: { session: RehearsalSession; narrow: boolean }) {
  const t = useT()
  const view = useApp((s) => s.view)
  const pointsRef = useRef<HTMLDivElement>(null)
  const slidesRef = useRef<HTMLDivElement>(null)
  useScrollToActive(pointsRef, view?.current?.sentenceId)
  useScrollToActive(slidesRef, view?.activeSectionId)
  if (!view) return <aside className="nav" />
  const { script } = session
  const byId = new Map(view.sections.map((s) => [s.id, s]))

  if (narrow) {
    return (
      <aside className="nav rail" data-testid="navigator">
        {script.sections.map((sec) => (
          <button key={sec.id} className="sec-row" title={sec.title} onClick={() => session.activateSection(sec.id)}>
            <StateIcon state={iconState(byId.get(sec.id)!)} />
          </button>
        ))}
      </aside>
    )
  }

  const sectionRow = (sec: ScriptSection, nested = false) => {
    const sv = byId.get(sec.id)!
    const cls = `sec-row${nested ? ' nested' : ''}${sv.active ? ' active' : ''}${sv.status === 'done' && !sv.active ? ' done' : ''}`
    return (
      <button
        key={sec.id}
        className={cls}
        title={sec.title}
        data-testid="section-row"
        data-state={iconState(sv)}
        aria-current={sv.active ? 'true' : undefined}
        onClick={() => session.activateSection(sec.id)}
      >
        <StateIcon state={iconState(sv)} />
        <span className="t">{sec.title}</span>
        {sv.hasSkipped && <span className="skip-dot" title={t('skippedHint')} />}
      </button>
    )
  }

  const active = view.sections.find((s) => s.active)
  const activeSec = script.sections.find((s) => s.id === active?.id)
  const remaining = new Set(active?.remaining ?? [])
  const skipped = new Set(active?.skipped ?? [])
  const pointState = (id: string): PointState =>
    !remaining.has(id) ? 'said' : id === view.current?.sentenceId ? 'current' : skipped.has(id) ? 'skipped' : 'open'

  /** Resume a slide at its first section with something left to say. */
  const openSlide = (sl: ScriptSlide) => {
    const sections = sl.sectionIds.map((id) => byId.get(id)!)
    const target = sections.find((s) => s.remaining.length > 0) ?? sections[0]
    if (target) session.activateSection(target.id)
  }

  return (
    <aside className="nav" data-testid="navigator">
      <div className="points" ref={pointsRef} data-testid="points">
        {activeSec && <h3>{activeSec.title}</h3>}
        {activeSec?.sentenceIds.map((id) => {
          const state = pointState(id)
          const info = session.info.get(id)!
          const missing = session.tracker.missingText(id)
          return (
            <button
              key={id}
              className={`point ${state}`}
              data-testid="point"
              data-state={state}
              aria-current={state === 'current' ? 'true' : undefined}
              title={`${t(state === 'said' ? 'markOpen' : 'markSaid')}: ${info.text}`}
              onClick={() => session.toggleSentence(id)}
            >
              <StateIcon state={POINT_ICON[state]} />
              <span className="t">{missing ? `… ${missing}` : info.cue}</span>
            </button>
          )
        })}
      </div>
      <div className="slides" ref={slidesRef} data-testid="slides">
        <h3>{t(script.slides.length ? 'slides' : 'outline')}</h3>
        {/* Sections before the first slide heading — in scripts without slides, all of them. */}
        {script.sections.filter((s) => s.slideId === null).map((sec) => sectionRow(sec))}
        {script.slides.map((sl) => {
          const sections = sl.sectionIds.map((id) => byId.get(id)!)
          const state = slideState(sections)
          return (
            <Fragment key={sl.id}>
              <button
                className={`sec-row slide-row${state === 'active' ? ' current' : ''}${state === 'done' ? ' done' : ''}`}
                data-testid="slide-row"
                data-state={state}
                title={sl.title}
                onClick={() => openSlide(sl)}
              >
                <StateIcon state={state} />
                <span className="t">{sl.title}</span>
                {state !== 'active' && sections.some((s) => s.hasSkipped) && <span className="skip-dot" title={t('skippedHint')} />}
              </button>
              {state === 'active' && sl.sectionIds.map((id) => sectionRow(script.sections.find((s) => s.id === id)!, true))}
            </Fragment>
          )
        })}
      </div>
    </aside>
  )
}

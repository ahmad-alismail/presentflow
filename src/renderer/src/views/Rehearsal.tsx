import { useCallback, useEffect, useState } from 'react'
import type { ShortcutAction } from '@shared/types'
import { Icon } from '../components/Icon'
import { Navigator } from '../components/Navigator'
import { Stage } from '../components/Stage'
import { StatusDot } from '../components/StatusDot'
import { useT } from '../i18n'
import { activeSession, applyPowerPointState, closeSession, type RehearsalSession } from '../rehearsal/session'
import { useApp } from '../store'

const NARROW_PX = 640

/** In-window keys: letters only — presenter clickers send arrows, PageUp/Down, B, period, F5, Esc. */
const KEYS: Record<string, ShortcutAction> = { r: 'rescue', n: 'next', u: 'back', f: 'focus', p: 'pause', z: 'undoJump' }

export function useRehearsalActions(session: RehearsalSession | null) {
  return useCallback(
    (action: ShortcutAction | 'escape') => {
      if (!session) return
      const st = useApp.getState()
      switch (action) {
        case 'rescue':
          useApp.setState({ rescue: st.rescue === 0 ? 1 : st.rescue === 1 ? 2 : 0 })
          break
        case 'escape':
          useApp.setState({ rescue: 0 })
          break
        case 'next':
          session.next()
          break
        case 'back':
          session.back()
          break
        case 'undoJump':
          session.undoJump()
          break
        case 'focus':
          useApp.setState({ frozen: st.frozen ? null : st.view })
          break
        case 'pause':
          if (st.run === 'idle') void session.start(st.settings)
          else void session.setPaused(st.run === 'running')
          break
      }
    },
    [session]
  )
}

export function Rehearsal({ id }: { id: string }) {
  const t = useT()
  const session = activeSession()
  const run = useApp((s) => s.run)
  const rescue = useApp((s) => s.rescue)
  const frozen = useApp((s) => s.frozen)
  const view = useApp((s) => s.view)
  const settingsOpen = useApp((s) => s.settingsOpen)
  const followPowerPoint = useApp((s) => s.settings.followPowerPoint)
  const slideAdvance = useApp((s) => s.settings.slideAdvance)
  const ppt = useApp((s) => s.ppt)
  const act = useRehearsalActions(session)
  const [narrow, setNarrow] = useState(window.innerWidth < NARROW_PX)

  useEffect(() => {
    const onResize = () => setNarrow(window.innerWidth < NARROW_PX)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  useEffect(() => {
    if (!session) useApp.getState().setScreen({ name: 'library' })
  }, [session])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (useApp.getState().settingsOpen || e.ctrlKey || e.altKey || e.metaKey) return
      const tag = (e.target as HTMLElement).tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      if (e.key === 'Escape') return act('escape')
      const action = KEYS[e.key.toLowerCase()]
      if (action) {
        e.preventDefault()
        act(action)
      }
    }
    window.addEventListener('keydown', onKey)
    const offGlobal = window.presentflow.onShortcut((a) => act(a))
    return () => {
      window.removeEventListener('keydown', onKey)
      offGlobal()
    }
  }, [act])

  useEffect(() => session?.setSlideMode(slideAdvance), [session, slideAdvance])

  // Follow PowerPoint while this view is open and the setting is on.
  useEffect(() => {
    if (!followPowerPoint || !session) return
    const off = window.presentflow.powerpoint.onState(applyPowerPointState)
    void window.presentflow.powerpoint.watch(true).then(applyPowerPointState)
    return () => {
      off()
      void window.presentflow.powerpoint.watch(false)
      applyPowerPointState({ connected: false })
    }
  }, [followPowerPoint, session])

  useEffect(() => {
    const flush = () => session?.saveNow()
    window.addEventListener('beforeunload', flush)
    return () => window.removeEventListener('beforeunload', flush)
  }, [session])

  if (!session) return null
  const active = view?.sections.find((s) => s.active)
  const activeSec = session.script.sections.find((s) => s.id === active?.id)
  const slide = activeSec?.slideId ? session.script.slides.find((s) => s.id === activeSec.slideId) : null

  const stop = async () => {
    await session.stop()
    useApp.getState().setScreen({ name: 'summary', id })
  }
  const leave = async () => {
    await closeSession()
    useApp.getState().setScreen({ name: 'library' })
  }

  return (
    <>
      <header className="titlebar">
        <button className="btn ghost icon" title={t('back')} aria-label={t('back')} onClick={leave}>
          <Icon name="back" />
        </button>
        <StatusDot />
        <span className="where grow" data-testid="where">
          {slide ? `${slide.title} · ` : ''}
          <strong>{activeSec?.title}</strong>
        </span>
        {ppt?.state.slide !== undefined && (
          <span
            className={`ppt-chip${ppt.matched ? '' : ' unmatched'}`}
            data-testid="ppt-chip"
            title={ppt.matched ? t('pptLinked', { n: ppt.state.slide }) : t('pptUnmatched', { n: ppt.state.slide })}
          >
            <Icon name="slides" />
            {t('pptChip', { n: ppt.state.slide })}
          </span>
        )}
        {frozen && (
          <span className="status" title={t('focusLocked')}>
            <Icon name="lock" />
          </span>
        )}
        {run === 'idle' ? (
          <button className="btn primary" data-testid="start" onClick={() => act('pause')}>
            <Icon name="play" />
            {t('start')}
          </button>
        ) : (
          <button className="btn" data-testid="pause" onClick={() => act('pause')}>
            <Icon name={run === 'running' ? 'pause' : 'play'} />
            {run === 'running' ? t('pause') : t('resumeListening')}
          </button>
        )}
        <button className="btn icon" title={t('stop')} aria-label={t('stop')} data-testid="stop" onClick={stop}>
          <Icon name="stop" />
        </button>
        <button
          className="btn icon"
          title={`${t('rescue')} (R)`}
          aria-label={t('rescue')}
          aria-pressed={rescue > 0}
          data-testid="rescue-btn"
          onClick={() => act('rescue')}
        >
          <Icon name="rescue" />
        </button>
        <button
          className="btn icon"
          title={t('settings')}
          aria-label={t('settings')}
          aria-pressed={settingsOpen}
          onClick={() => useApp.getState().setSettingsOpen(true)}
        >
          <Icon name="settings" />
        </button>
      </header>
      <main className={`rehearsal${narrow ? ' narrow' : ''}`}>
        <Stage session={session} />
        <Navigator session={session} narrow={narrow} />
      </main>
    </>
  )
}

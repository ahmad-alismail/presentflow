import { parseScript, type Script } from '@core/script/parse'
import { matchSlide, slideGroups, type SlideGroup } from '@core/script/slides'
import { StableTranscript } from '@core/tracking/stableTranscript'
import { Tracker } from '@core/tracking/tracker'
import { computeIdf, extractKeywords, scriptVocabulary } from '@core/text/cues'
import type { PowerPointState, Presentation, SessionSnapshot, Settings, SlideAdvance, SpeechStatus, TranscriptEvent } from '@shared/types'
import { Embedder } from '../speech/embedder'
import { SpeechEngine } from '../speech/engine'
import { useApp } from '../store'

export interface SentenceInfo {
  text: string
  /** Memory cue: the user's approved cue, else extractive keywords. */
  cue: string
  /** Words to emphasize in the sentence (taken verbatim from it). */
  keywords: string[]
  sectionTitle: string
  slideTitle: string | null
}

/**
 * One rehearsal of one presentation: owns the tracker, the speech engine and the embedder,
 * persists progress after every change, and publishes the view to the store.
 */
export class RehearsalSession {
  readonly script: Script
  readonly tracker: Tracker
  readonly info = new Map<string, SentenceInfo>()
  private stable = new StableTranscript()
  private engine: SpeechEngine | null = null
  private embedder: Embedder | null = null
  private saveTimer: number | undefined
  private disposed = false
  /** Slide-sized groups of sections, as PowerPoint slides are matched to the script. */
  private readonly slides: SlideGroup[]
  private slideMode: SlideAdvance = useApp.getState().settings.slideAdvance
  /** The slide PowerPoint shows and its sections in the script (`ids` null: no text for it); null = not connected. */
  private ppt: { slide: number; ids: string[] | null } | null = null

  constructor(readonly presentation: Presentation) {
    this.script = parseScript(presentation.source)
    this.tracker = new Tracker(this.script)
    this.slides = slideGroups(this.script)
    const idf = computeIdf(this.script.sentences.map((s) => s.text))
    const sections = new Map(this.script.sections.map((s) => [s.id, s]))
    const slides = new Map(this.script.slides.map((s) => [s.id, s]))
    for (const s of this.script.sentences) {
      const sec = sections.get(s.sectionId)!
      const keywords = extractKeywords(s.text, idf)
      this.info.set(s.id, {
        text: s.text,
        cue: presentation.cues[s.cueKey]?.trim() || keywords.join(' → '),
        keywords,
        sectionTitle: sec.title,
        slideTitle: sec.slideId ? (slides.get(sec.slideId)?.title ?? null) : null
      })
    }
  }

  slideTitleOf(sectionId: string): string | null {
    const slideId = this.script.sections.find((s) => s.id === sectionId)?.slideId
    return slideId ? (this.script.slides.find((s) => s.id === slideId)?.title ?? null) : null
  }

  get sentenceCount(): number {
    return this.script.sentences.length
  }

  restore(snapshot: SessionSnapshot | null): void {
    if (snapshot) this.tracker.restore(snapshot)
    this.publish(false)
  }

  /** Semantic matching becomes available once sentence embeddings are ready (lexical until then). */
  async loadEmbeddings(): Promise<void> {
    try {
      this.embedder = new Embedder()
      const vectors = await this.embedder.embedMany(this.script.sentences.map((s) => s.text))
      if (!this.disposed) this.tracker.setSentenceVectors(vectors)
    } catch {
      this.embedder?.dispose()
      this.embedder = null // lexical-only mode still works
    }
  }

  async start(settings: Settings): Promise<void> {
    if (this.engine) return
    const setStatus = (status: SpeechStatus) => useApp.setState({ status })
    this.engine = new SpeechEngine(
      {
        provider: settings.provider,
        localModel: settings.localModel,
        language: this.presentation.language,
        microphoneId: settings.microphoneId,
        vocabulary: scriptVocabulary(this.script.sentences.map((s) => s.text)),
        cloudModel: settings.provider === 'gemini' ? settings.geminiModel : settings.openaiModel,
        fallbackToLocal: settings.fallbackToLocal
      },
      { onTranscript: (e, appendOnly) => this.hear(e, appendOnly), onStatus: setStatus }
    )
    useApp.setState({ run: 'running' })
    try {
      await this.engine.start()
    } catch (err) {
      // Back to a clean "Start" state; the status dot explains what went wrong.
      await this.engine?.stop().catch(() => undefined)
      this.engine = null
      useApp.setState({ run: 'idle' })
      setStatus({ state: 'error', detail: err instanceof Error ? err.message : String(err) })
    }
  }

  async setPaused(paused: boolean): Promise<void> {
    useApp.setState({ run: paused ? 'paused' : 'running' })
    await this.engine?.setPaused(paused)
  }

  async stop(): Promise<void> {
    await this.engine?.stop()
    this.engine = null
    this.tracker.settle()
    useApp.setState({ run: 'idle', rescue: 0, frozen: null })
    this.publish()
  }

  /** Transcript from any provider → stable words → tracker. */
  hear(e: TranscriptEvent, appendOnly: boolean): void {
    const update = this.stable.push(e, appendOnly)
    if (!update) return
    if (this.tracker.ingest(update.utteranceId, update.text, update.final)) this.publish()
    this.requestSemantics()
  }

  private requestSemantics(): void {
    const req = this.tracker.semanticRequest()
    if (!req || !this.embedder) return
    void this.embedder.embedLatest(req.text).then((vec) => {
      if (vec && !this.disposed && this.tracker.applySemantic(req.key, vec)) this.publish()
      if (vec) this.requestSemantics()
    })
  }

  /**
   * PowerPoint shows a slide. Manual: only that slide is shown and followed until the slide changes
   * ("the slide decides") — a slide without text holds too, showing nothing. Automatic: move there, then
   * let speech carry on (free tracking on a slide without text). Only an actual slide change acts, so a
   * re-report (e.g. the slideshow ending) never pulls the presenter back. PowerPoint closed → free
   * tracking. Returns whether the slide has text in the script.
   */
  followSlide(state: PowerPointState): boolean {
    if (!state.connected) {
      this.ppt = null
      this.tracker.setSlideScope(null)
    } else if (state.slide !== undefined && state.slide !== this.ppt?.slide) {
      this.ppt = { slide: state.slide, ids: matchSlide(this.script, { slide: state.slide, count: state.count, title: state.title }) }
      this.applySlide()
    }
    this.publish()
    return !!this.ppt?.ids
  }

  /** Manual: hold the display to the slide PowerPoint shows. Automatic: release it where the presenter is. */
  setSlideMode(mode: SlideAdvance): void {
    if (mode === this.slideMode) return
    this.slideMode = mode
    this.tracker.setSlideScope(mode === 'manual' ? this.pptSlideScope() : null)
    this.publish()
  }

  /**
   * Title of the slide after the held one (its sections, or none for a PowerPoint slide without text),
   * or null at the end.
   */
  nextSlideTitle(sectionIds: string[]): string | null {
    if (!sectionIds.length) {
      const shown = this.ppt?.slide ?? Infinity
      return this.slides.find((g) => g.number !== null && g.number > shown)?.title ?? null
    }
    const last = sectionIds[sectionIds.length - 1]
    const at = this.slides.findIndex((g) => g.sectionIds.includes(last))
    return at < 0 ? null : (this.slides[at + 1]?.title ?? null)
  }

  /** Puts the tracker on PowerPoint's slide: held to it (manual) or just moved there (automatic). */
  private applySlide(): void {
    if (this.slideMode === 'manual') {
      this.tracker.setSlideScope(this.pptSlideScope())
    } else {
      this.tracker.setSlideScope(null)
      if (this.ppt?.ids) this.tracker.enterSlide(this.ppt.ids)
    }
  }

  /** Sections to hold to for the slide PowerPoint shows ([] = a slide without text); null = not connected. */
  private pptSlideScope(): string[] | null {
    return this.ppt ? (this.ppt.ids ?? []) : null
  }

  /** Manual mode: navigating to another slide's section in PresentFlow counts as a slide change. */
  private keepSlideScope(): void {
    if (this.slideMode !== 'manual' || !this.ppt || this.tracker.slideScoped) return
    const active = this.tracker.activeSectionId
    const group = this.slides.find((g) => active !== null && g.sectionIds.includes(active))
    if (group) this.tracker.setSlideScope(group.sectionIds)
  }

  // Manual fallbacks
  next(): void {
    this.tracker.next()
    this.publish()
  }
  back(): void {
    this.tracker.back()
    this.publish()
  }
  undoJump(): void {
    this.tracker.undoJump()
    this.keepSlideScope()
    this.publish()
  }
  activateSection(id: string): void {
    this.tracker.activateSection(id)
    this.keepSlideScope()
    this.publish()
  }
  toggleSentence(id: string): void {
    this.tracker.toggleSentence(id)
    this.publish()
  }
  restart(): void {
    this.tracker.reset()
    void window.presentflow.sessions.clear(this.presentation.id)
    this.publish(false)
  }

  private publish(save = true): void {
    if (this.disposed) return
    useApp.setState({ view: this.tracker.view() })
    if (save) this.scheduleSave()
  }

  private scheduleSave(): void {
    window.clearTimeout(this.saveTimer)
    this.saveTimer = window.setTimeout(() => this.saveNow(), 400)
  }

  saveNow(): void {
    window.clearTimeout(this.saveTimer)
    const snapshot: SessionSnapshot = { ...this.tracker.snapshot(), presentationId: this.presentation.id, savedAt: Date.now() }
    void window.presentflow.sessions.save(snapshot)
  }

  async dispose(): Promise<void> {
    if (this.disposed) return
    this.saveNow()
    this.disposed = true
    await this.engine?.stop()
    this.engine = null
    this.embedder?.dispose()
    useApp.setState({ view: null, run: 'idle', status: { state: 'idle' }, rescue: 0, frozen: null, ppt: null })
  }
}

let active: RehearsalSession | null = null

export function activeSession(): RehearsalSession | null {
  return active
}

export async function openSession(p: Presentation, snapshot: SessionSnapshot | null): Promise<RehearsalSession> {
  if (active?.presentation.id === p.id && active.presentation.updatedAt === p.updatedAt) return active
  await active?.dispose()
  active = new RehearsalSession(p)
  active.restore(snapshot)
  void active.loadEmbeddings()
  return active
}

/** Applies a PowerPoint state to the store and the active rehearsal (watcher events and the E2E hook). */
export function applyPowerPointState(state: PowerPointState): void {
  const matched = active?.followSlide(state) ?? false
  useApp.setState({ ppt: state.connected ? { state, matched } : null })
}

export async function closeSession(): Promise<void> {
  await active?.dispose()
  active = null
}

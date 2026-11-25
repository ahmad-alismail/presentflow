// The alignment engine: follows the speaker through the script, remembering coverage per section.
//
// Core idea — every heard word "explains" at most one script sentence. Words are first offered to
// what is on screen (current + next sentences), then to the sentence just covered. Only words that
// nothing on screen explains count as evidence for a jump elsewhere. This gives jump resistance,
// no double counting of repeats, and completion of the previous sentence from one mechanism.
import type { Script } from '../script/parse'
import { tokenize, isContentToken, type Token } from '../text/normalize'
import { ScriptModel, type TokenMatch } from './model'

export type SentenceState = 'open' | 'covered' | 'manual' | 'partial'

export interface TrackerSnapshot {
  activeSectionId: string | null
  cursors: Record<string, number>
  sentences: Record<string, { status: SentenceState; evidence: number; missing?: number[] }>
  jumpStack: string[]
  lastSaidId?: string | null
}

export interface ViewItem {
  sentenceId: string
  sectionId: string
  /** True when the item comes from a later section (shown with a small section label). */
  continuation: boolean
}

export type SectionStatus = 'done' | 'partial' | 'open'

export interface SectionView {
  id: string
  status: SectionStatus
  active: boolean
  /** Open sentences the speaker already passed (skipped / partial / uncertain). */
  hasSkipped: boolean
  skipped: string[]
  /** Remaining sentence ids in document order (open + partial). */
  remaining: string[]
}

export interface TrackerView {
  activeSectionId: string | null
  current: ViewItem | null
  upcoming: ViewItem[]
  lastSaidId: string | null
  sections: SectionView[]
  /** Sections of the slide the display is held to (current/upcoming never leave it); null = free tracking. */
  scope: string[] | null
  /** Monotonic counter; changes whenever anything visible may have changed. */
  version: number
}

export const THRESHOLDS = {
  /** Lexical recall that covers a displayed sentence. */
  near: 0.62,
  /** Lexical recall that suffices when the semantic score agrees. */
  nearWithSem: 0.45,
  semAgree: 0.55,
  /** Semantic score alone (paraphrase) that covers a displayed sentence… */
  semPara: 0.6,
  /** …when it beats every other on-screen candidate by this margin. */
  semMargin: 0.06,
  /** Lexical recall from unexplained words for a sentence elsewhere. */
  far: 0.62,
  farSemAgree: 0.4,
  /** Evidence regarded as "probably said" (flow rule, uncertain marker). */
  medium: 0.3,
  /** Content words considered at most (≈ two sentences). */
  windowContent: 24,
  /** Content words after which an unconfirmed jump is dropped. */
  pendingExpiry: 16
}

interface Heard {
  seq: number
  token: Token
  content: boolean
  matches: TokenMatch[]
  /** Serial of the utterance the word belongs to (key into `uttTexts`). */
  utt: number
}

interface CoverEvent {
  sentence: number
  prevStatus: SentenceState
  prevCursor: number
}

interface Pending {
  section: number
  sentence: number | null
  createdSeq: number
  matched: number
}

interface FarScore {
  lex: number
  matched: number
  maxSeq: number
  toks: number[]
}

export class Tracker {
  readonly model: ScriptModel
  private status: SentenceState[]
  private evidence: number[]
  private missing: (number[] | null)[]
  private matchedToks: Set<number>[]
  private lexicalCover: boolean[]
  private lexEvidence: number[]
  private cursor: number[]
  private active = 0
  private jumpStack: number[] = []
  private history: CoverEvent[] = []
  private recent: number[] = []
  private heard: Heard[] = []
  private utt: { id: string; start: number; serial: number } | null = null
  private uttSerial = 0
  private uttTexts = new Map<number, string>()
  private nextSeq = 0
  private windowStart = 0
  private pending: Pending | null = null
  private vectors: Float32Array[] | null = null
  private sem: { windowStart: number; key: string; scores: Float32Array } | null = null
  private lastSemKey = ''
  /** Paraphrase confirmation: the same displayed sentence must lead two consecutive semantic evaluations. */
  private semStreak: { sentence: number; count: number; key: string } | null = null
  private restoredLastSaid: string | null = null
  /** Sections of the slide PowerPoint shows ("the slide decides"); null = free tracking. */
  private scope: Set<number> | null = null
  private version = 0

  constructor(script: Script) {
    this.model = new ScriptModel(script)
    const n = this.model.sentences.length
    this.status = new Array(n).fill('open')
    this.evidence = new Array(n).fill(0)
    this.missing = new Array(n).fill(null)
    this.matchedToks = Array.from({ length: n }, () => new Set<number>())
    this.lexicalCover = new Array(n).fill(false)
    this.lexEvidence = new Array(n).fill(0)
    this.cursor = new Array(this.model.sections.length).fill(0)
  }

  // ───────────────────────────── input ─────────────────────────────

  /**
   * Feed the (stable) cumulative text of an utterance. Returns true if the view changed.
   * Silence never calls this, so silence never changes anything.
   */
  ingest(utteranceId: string, text: string, final: boolean): boolean {
    this.updateHeard(utteranceId, text)
    if (final) this.utt = null
    return this.evaluate(final)
  }

  setSentenceVectors(vectors: Float32Array[]): void {
    this.vectors = vectors.length === this.model.sentences.length ? vectors : null
  }

  /** Text of the current listening window that needs an embedding, or null if up to date. */
  semanticRequest(): { key: string; text: string } | null {
    if (!this.vectors) return null
    const win = this.windowTokens()
    if (win.filter((h) => h.content).length < 4) return null
    const key = `${this.windowStart}:${win[win.length - 1].seq}`
    if (key === this.lastSemKey) return null
    this.lastSemKey = key
    return { key, text: this.windowText(win) }
  }

  /**
   * Original wording (punctuation matters to the embedding model) from the clause where the
   * window's first content word starts — leftover function words of a previous sentence are dropped.
   */
  private windowText(win: Heard[]): string {
    const firstContent = win.findIndex((h) => h.content)
    const head = win[firstContent]
    const text = this.uttTexts.get(head.utt) ?? ''
    let start = head.token.start
    for (let k = firstContent - 1; k >= 0 && win[k].utt === head.utt; k--) {
      const between = text.slice(win[k].token.start + win[k].token.surface.length, start)
      if (/[.!?…;:]/.test(between)) break
      start = win[k].token.start
    }
    const parts = [text.slice(start)]
    const later = [...new Set(win.slice(firstContent + 1).map((h) => h.utt))].filter((u) => u !== head.utt)
    for (const u of later) parts.push(this.uttTexts.get(u) ?? '')
    return parts.join(' ').trim()
  }

  /** Apply the embedding of a window requested via `semanticRequest`. Returns true if the view changed. */
  applySemantic(key: string, vector: Float32Array): boolean {
    if (!this.vectors) return false
    const windowStart = Number(key.split(':')[0])
    if (windowStart !== this.windowStart) return false // stale: the speaker has moved on
    const scores = new Float32Array(this.vectors.length)
    this.vectors.forEach((v, i) => (scores[i] = dot(v, vector)))
    this.sem = { windowStart, key, scores }
    const near = this.nearCandidates()
    const lead = near.length ? near.reduce((a, b) => (scores[b] > scores[a] ? b : a)) : -1
    this.semStreak =
      lead < 0
        ? null
        : this.semStreak?.sentence === lead && this.semStreak.key !== key
          ? { sentence: lead, count: this.semStreak.count + 1, key }
          : { sentence: lead, count: 1, key }
    return this.evaluate(this.utt === null)
  }

  // ─────────────────────────── slide scope ───────────────────────────

  /**
   * "The slide decides": PowerPoint shows a slide → only its sections are followed and shown, until the
   * slide changes. Entering a new slide resumes its first unfinished section; content from other slides
   * is only checked off quietly. An empty list holds the display to a slide without text (nothing is shown
   * or followed); null returns to free tracking.
   */
  setSlideScope(sectionIds: string[] | null): void {
    const idx = (sectionIds ?? []).map((id) => this.model.sections.findIndex((s) => s.id === id)).filter((i) => i >= 0)
    const next = sectionIds === null ? null : new Set(idx)
    const same =
      next === null ? this.scope === null : this.scope !== null && next.size === this.scope.size && idx.every((i) => this.scope!.has(i))
    if (same) return
    this.scope = next
    this.pending = null
    if (this.ensureActiveInScope()) this.freshWindow()
    this.bump()
  }

  /**
   * PowerPoint moved to this slide, without holding the display to it: resume its first unfinished
   * section unless the speaker is already on the slide. Speech may move on from there.
   */
  enterSlide(sectionIds: string[]): void {
    const idx = sectionIds.map((id) => this.model.sections.findIndex((s) => s.id === id)).filter((i) => i >= 0)
    if (!idx.length || idx.includes(this.active)) return
    this.switchSection(this.firstUnfinished(idx), true)
    this.pending = null
    this.freshWindow()
    this.bump()
  }

  get slideScoped(): boolean {
    return this.scope !== null
  }

  get activeSectionId(): string | null {
    return this.model.sections[this.active]?.id ?? null
  }

  private inScope(sec: number): boolean {
    return this.scope === null || this.scope.has(sec)
  }

  /** Moves to the scope's first unfinished section if the active one lies outside it. */
  private ensureActiveInScope(): boolean {
    if (!this.scope || this.scope.size === 0 || this.scope.has(this.active)) return false
    this.switchSection(this.firstUnfinished([...this.scope]), true)
    return true
  }

  /** The first of these sections (in document order) with an open sentence, else the first one. */
  private firstUnfinished(secs: number[]): number {
    const ordered = [...secs].sort((a, b) => a - b)
    return ordered.find((sec) => this.model.sections[sec].sentenceIdxs.some((i) => this.status[i] === 'open')) ?? ordered[0]
  }

  // ─────────────────────────── manual control ───────────────────────────

  activateSection(sectionId: string): void {
    const sec = this.model.sections.findIndex((s) => s.id === sectionId)
    if (sec < 0) return
    if (!this.inScope(sec)) this.scope = null // presenter override until the next slide change
    if (sec !== this.active) this.switchSection(sec, true)
    else this.enterSection(sec)
    this.freshWindow()
    this.bump()
  }

  /** Mark the current sentence as said (manual "next"). */
  next(): void {
    const cur = this.nearCandidates()[0]
    if (cur === undefined) return
    this.cover(cur, 'manual')
    this.freshWindow()
    this.bump()
  }

  /** Undo the most recent coverage (manual "back"). */
  back(): void {
    const ev = this.history.pop()
    if (!ev) return
    const s = this.model.sentences[ev.sentence]
    this.status[ev.sentence] = ev.prevStatus
    this.cursor[s.sectionIdx] = ev.prevCursor
    this.recent = this.recent.filter((r) => r !== ev.sentence)
    if (s.sectionIdx !== this.active && this.inScope(s.sectionIdx)) this.active = s.sectionIdx
    this.freshWindow()
    this.bump()
  }

  /** Navigator click on a talking point: toggle said/open without moving the cursor. */
  toggleSentence(sentenceId: string): void {
    const i = this.model.sentences.findIndex((s) => s.id === sentenceId)
    if (i < 0) return
    if (this.status[i] === 'open' || this.status[i] === 'partial') {
      this.history.push({ sentence: i, prevStatus: this.status[i], prevCursor: this.cursor[this.model.sentences[i].sectionIdx] })
      this.status[i] = 'manual'
      this.missing[i] = null
    } else {
      this.status[i] = 'open'
      this.recent = this.recent.filter((r) => r !== i)
    }
    this.bump()
  }

  /** Return to the section that was active before the last section change. */
  undoJump(): void {
    const prev = this.jumpStack.pop()
    if (prev === undefined) return
    if (!this.inScope(prev)) this.scope = null // presenter override until the next slide change
    this.closeRecent()
    this.active = prev
    this.freshWindow()
    this.bump()
  }

  /** Finalize pending decisions (e.g. before showing the summary). */
  settle(): void {
    this.closeRecent()
    this.bump()
  }

  reset(): void {
    this.status.fill('open')
    this.evidence.fill(0)
    this.missing.fill(null)
    this.lexicalCover.fill(false)
    this.lexEvidence.fill(0)
    this.matchedToks.forEach((m) => m.clear())
    this.cursor.fill(0)
    this.active = 0
    this.jumpStack = []
    this.history = []
    this.recent = []
    this.pending = null
    this.restoredLastSaid = null
    this.ensureActiveInScope()
    this.jumpStack = []
    this.freshWindow()
    this.bump()
  }

  // ───────────────────────────── output ─────────────────────────────

  view(): TrackerView {
    const seq = this.viewSequence(3)
    const item = (i: number): ViewItem => {
      const s = this.model.sentences[i]
      return { sentenceId: s.id, sectionId: this.model.sections[s.sectionIdx].id, continuation: s.sectionIdx !== this.active }
    }
    const lastSaid = [...this.history].reverse().find((e) => this.isSaid(e.sentence))
    return {
      activeSectionId: this.model.sections[this.active]?.id ?? null,
      current: seq.length ? item(seq[0]) : null,
      upcoming: seq.slice(1).map(item),
      lastSaidId: lastSaid ? this.model.sentences[lastSaid.sentence].id : this.restoredLastSaid,
      sections: this.model.sections.map((sec) => {
        const states = sec.sentenceIdxs.map((i) => this.status[i])
        const said = states.filter((st) => st === 'covered' || st === 'manual').length
        const remaining = sec.sentenceIdxs.filter((i) => !this.isSaid(i))
        const skipped = remaining.filter((i) => this.model.sentences[i].index < this.cursor[sec.idx])
        return {
          id: sec.id,
          active: sec.idx === this.active,
          status: said === states.length ? 'done' : said > 0 || states.includes('partial') ? 'partial' : 'open',
          hasSkipped: skipped.length > 0,
          skipped: skipped.map((i) => this.model.sentences[i].id),
          remaining: remaining.map((i) => this.model.sentences[i].id)
        }
      }),
      scope: this.scope ? [...this.scope].sort((a, b) => a - b).map((i) => this.model.sections[i].id) : null,
      version: this.version
    }
  }

  sentenceState(sentenceId: string): { status: SentenceState; evidence: number; missing: number[] | null } {
    const i = this.model.sentences.findIndex((s) => s.id === sentenceId)
    return { status: this.status[i], evidence: this.evidence[i], missing: this.missing[i] }
  }

  /** Words of the clause(s) a partial sentence is still missing, e.g. "steuern andere Programme". */
  missingText(sentenceId: string): string | null {
    const i = this.model.sentences.findIndex((s) => s.id === sentenceId)
    const missing = this.missing[i]
    if (i < 0 || this.status[i] !== 'partial' || !missing) return null
    const s = this.model.sentences[i]
    return missing.map((ci) => s.components[ci].map((t) => s.tokens[t].surface).join(' ')).join(' … ')
  }

  snapshot(): TrackerSnapshot {
    const sentences: TrackerSnapshot['sentences'] = {}
    this.model.sentences.forEach((s, i) => {
      sentences[s.id] = { status: this.status[i], evidence: +this.evidence[i].toFixed(3), ...(this.missing[i] ? { missing: this.missing[i]! } : {}) }
    })
    const cursors: Record<string, number> = {}
    this.model.sections.forEach((s, i) => (cursors[s.id] = this.cursor[i]))
    return {
      activeSectionId: this.model.sections[this.active]?.id ?? null,
      cursors,
      sentences,
      jumpStack: this.jumpStack.map((i) => this.model.sections[i].id),
      lastSaidId: this.view().lastSaidId
    }
  }

  /** Restore saved progress; unknown ids (edited script) are ignored, new sentences start open. */
  restore(snap: TrackerSnapshot): void {
    this.reset()
    const secIdx = new Map(this.model.sections.map((s, i) => [s.id, i]))
    this.model.sentences.forEach((s, i) => {
      const saved = snap.sentences[s.id]
      if (!saved) return
      this.status[i] = saved.status
      this.evidence[i] = saved.evidence
      this.missing[i] = saved.missing ?? null
    })
    for (const [id, c] of Object.entries(snap.cursors)) {
      const i = secIdx.get(id)
      if (i !== undefined) this.cursor[i] = c
    }
    this.active = secIdx.get(snap.activeSectionId ?? '') ?? 0
    this.jumpStack = snap.jumpStack.map((id) => secIdx.get(id)).filter((i): i is number => i !== undefined)
    this.restoredLastSaid = this.model.sentences.some((s) => s.id === snap.lastSaidId) ? snap.lastSaidId! : null
    this.ensureActiveInScope()
    this.bump()
  }

  // ─────────────────────────── internals ───────────────────────────

  private bump(): void {
    this.version++
  }

  private isSaid(i: number): boolean {
    return this.status[i] === 'covered' || this.status[i] === 'manual'
  }

  private freshWindow(): void {
    this.windowStart = this.nextSeq
    this.pending = null
    this.sem = null
    this.semStreak = null
  }

  private updateHeard(utteranceId: string, text: string): void {
    if (!this.utt || this.utt.id !== utteranceId) {
      this.utt = { id: utteranceId, start: this.heard.length, serial: this.uttSerial++ }
    }
    this.uttTexts.set(this.utt.serial, text)
    const tokens = tokenize(text)
    const existing = this.heard.slice(this.utt.start)
    let keep = 0
    while (keep < existing.length && keep < tokens.length && existing[keep].token.folded === tokens[keep].folded) keep++
    this.heard.length = this.utt.start + keep
    for (const token of tokens.slice(keep)) {
      const content = isContentToken(token)
      this.heard.push({ seq: this.nextSeq++, token, content, matches: content ? this.model.match(token) : [], utt: this.utt.serial })
    }
    // Earlier words keep their spelling; refresh offsets against the latest text.
    tokens.slice(0, keep).forEach((t, k) => (this.heard[this.utt!.start + k].token = t))
    // Bound memory: forget words well before the window.
    const drop = this.heard.findIndex((h) => h.seq >= this.windowStart - 64)
    if (drop > 200) {
      this.heard.splice(0, drop)
      this.utt.start = Math.max(0, this.utt.start - drop)
      const oldest = this.heard[0]?.utt ?? this.utt.serial
      for (const u of this.uttTexts.keys()) if (u < oldest) this.uttTexts.delete(u)
    }
  }

  /** Words since the window start, limited to the last `windowContent` content words. */
  private windowTokens(): Heard[] {
    const win = this.heard.filter((h) => h.seq >= this.windowStart)
    let content = 0
    for (let i = win.length - 1; i >= 0; i--) {
      if (win[i].content && ++content > THRESHOLDS.windowContent) return win.slice(i + 1)
    }
    return win
  }

  /**
   * Open sentences in display order: rest of the active section, then later sections (wrapping).
   * With a slide scope: only the slide's own sections.
   */
  private viewSequence(limit: number): number[] {
    const out: number[] = []
    const { sentences } = this.model
    const order = this.sectionOrder()
    for (let k = 0; k < order.length && out.length < limit; k++) {
      const sec = this.model.sections[order[k]]
      const open = sec.sentenceIdxs.filter((i) => this.status[i] === 'open')
      const ahead = open.filter((i) => sentences[i].index >= this.cursor[sec.idx])
      // The active section never forces a return to skipped sentences; other sections show where you'd resume.
      const list = k === 0 ? ahead : ahead.length ? ahead : open
      for (const i of list) if (out.length < limit) out.push(i)
    }
    return out
  }

  /** Displayed sentences that speech may cover: everything shown. */
  private nearCandidates(): number[] {
    return this.viewSequence(3)
  }

  /** Section visiting order from the active section; only the slide's sections when scoped. */
  private sectionOrder(): number[] {
    const n = this.model.sections.length
    const all = Array.from({ length: n }, (_, k) => (this.active + k) % n)
    return this.scope ? all.filter((i) => this.scope!.has(i)) : all
  }

  private enterSection(sec: number): void {
    const { sentences } = this.model
    const open = this.model.sections[sec].sentenceIdxs.filter((i) => this.status[i] === 'open')
    if (!open.some((i) => sentences[i].index >= this.cursor[sec]) && open.length) {
      this.cursor[sec] = sentences[open[0]].index // resume at the first unfinished sentence
    }
  }

  private switchSection(sec: number, recordJump: boolean): void {
    if (recordJump) this.jumpStack.push(this.active)
    if (this.jumpStack.length > 20) this.jumpStack.shift()
    this.closeRecent()
    this.active = sec
    this.enterSection(sec)
  }

  private closeRecent(): void {
    for (const r of this.recent) this.checkPartial(r)
    this.recent = []
  }

  private cover(i: number, how: 'lexical' | 'semantic' | 'manual'): void {
    const s = this.model.sentences[i]
    if (s.sectionIdx !== this.active) this.switchSection(s.sectionIdx, true)
    this.history.push({ sentence: i, prevStatus: this.status[i], prevCursor: this.cursor[s.sectionIdx] })
    if (this.history.length > 500) this.history.shift()
    this.status[i] = how === 'manual' ? 'manual' : 'covered'
    this.missing[i] = null
    // Heard largely word-for-word → a skipped clause still matters even if the paraphrase score is high.
    this.lexicalCover[i] = how === 'lexical' || (how === 'semantic' && this.lexEvidence[i] >= THRESHOLDS.nearWithSem)
    this.cursor[s.sectionIdx] = Math.max(this.cursor[s.sectionIdx], s.index + 1)
    // A newer sentence was reached: earlier ones are finished — decide whether a clause was skipped.
    for (const r of this.recent) this.checkPartial(r)
    this.recent.push(i)
    if (this.recent.length > 2) this.recent.shift()
    this.applyFlowRule(i)
  }

  /** N−1 said, N+1 just said, N had medium evidence → N was said too (paraphrasing speakers). */
  private applyFlowRule(i: number): void {
    const s = this.model.sentences[i]
    const secIdxs = this.model.sections[s.sectionIdx].sentenceIdxs
    if (s.index < 1) return
    const prev = secIdxs[s.index - 1]
    const beforePrev = s.index >= 2 ? secIdxs[s.index - 2] : null
    if (this.status[prev] !== 'open') return
    if (beforePrev !== null && !this.isSaid(beforePrev)) return
    const p = this.model.sentences[prev]
    if (this.evidence[prev] >= THRESHOLDS.medium || p.tokens.length === 0) {
      this.history.push({ sentence: prev, prevStatus: 'open', prevCursor: this.cursor[s.sectionIdx] })
      this.status[prev] = 'covered'
      // Inferred from words actually heard → a skipped clause still makes it 'partial'.
      this.lexicalCover[prev] = this.lexEvidence[prev] >= THRESHOLDS.medium
      this.checkPartial(prev)
    }
  }

  /** The missing clause of a partial sentence arrived after all → covered. */
  private recheckPartial(i: number): void {
    const missing = this.missing[i]
    if (this.status[i] !== 'partial' || !missing) return
    const s = this.model.sentences[i]
    if (missing.every((ci) => s.components[ci].some((t) => this.matchedToks[i].has(t)))) {
      this.status[i] = 'covered'
      this.missing[i] = null
    }
  }

  /** A lexically covered sentence that skipped a whole meaningful clause becomes 'partial'. */
  private checkPartial(i: number): void {
    if (this.status[i] !== 'covered' || !this.lexicalCover[i]) return
    const s = this.model.sentences[i]
    const missing = s.components
      .map((c, ci) => ({ c, ci }))
      .filter(({ c }) => c.length >= 2 && c.reduce((a, t) => a + s.weights[t], 0) / s.total >= 0.2)
      .filter(({ c }) => !c.some((t) => this.matchedToks[i].has(t)))
      .map(({ ci }) => ci)
    if (missing.length) {
      this.status[i] = 'partial'
      this.missing[i] = missing
    }
  }

  private semScore(i: number): number | null {
    return this.sem && this.sem.windowStart === this.windowStart ? this.sem.scores[i] : null
  }

  private evaluate(final: boolean): boolean {
    let changed = false
    for (let iter = 0; iter < 4 && this.step(final); iter++) changed = true
    if (changed) this.bump()
    return changed
  }

  /** One decision step. Returns true if state changed (then the caller re-evaluates). */
  private step(final: boolean): boolean {
    const win = this.windowTokens().filter((h) => h.content)
    if (!win.length) return false
    const lastSeq = win[win.length - 1].seq
    const near = this.nearCandidates()
    const recent = this.recent.filter((r) => !near.includes(r))
    const priority = [...near, ...recent]

    // 1) Assign each heard word to the on-screen/recent sentence where it adds the most.
    // Monotonic: until a word lands on a displayed sentence, ties go to the sentence just finished
    // (its trailing words); afterwards ties go to the displayed sentences.
    // The finished sentence only absorbs words that complete what it has not matched yet.
    const best = new Map<number, Map<number, { sim: number; seq: number }>>(priority.map((p) => [p, new Map()]))
    for (const r of recent) for (const tok of this.matchedToks[r]) best.get(r)!.set(tok, { sim: 1, seq: -1 })
    const recentSet = new Set(recent)
    const unexplained: Heard[] = []
    let reachedNear = false
    let leadingRecentEnd = -1
    let leadRecent = 0
    let leadUnexplained = 0
    for (const h of win) {
      let target = -1
      let targetGain = -1 // any match (even zero gain = a repeat) explains the word
      let targetMatch: TokenMatch | null = null
      for (const p of priority) {
        for (const m of h.matches) {
          if (m.sentence !== p) continue
          const have = best.get(p)!.get(m.tok)?.sim ?? 0
          const gain = Math.max(0, m.sim - have) * this.model.sentences[p].weights[m.tok] + 1e-6
          const tieWins = Math.abs(gain - targetGain) < 1e-6 && !reachedNear && recentSet.has(p) && !recentSet.has(target)
          if (gain > targetGain + 1e-6 || tieWins) {
            target = p
            targetGain = gain
            targetMatch = m
          }
        }
      }
      if (target < 0 || !targetMatch) {
        unexplained.push(h)
        if (!reachedNear) leadUnexplained++
        continue
      }
      if (recentSet.has(target)) {
        // The leading stretch is the finished sentence's tail only while its words dominate.
        if (!reachedNear && ++leadRecent > leadUnexplained) leadingRecentEnd = h.seq
      } else reachedNear = true
      const slot = best.get(target)!
      if ((slot.get(targetMatch.tok)?.sim ?? 0) < targetMatch.sim) slot.set(targetMatch.tok, { sim: targetMatch.sim, seq: h.seq })
    }
    for (const r of recent) {
      for (const tok of best.get(r)!.keys()) this.matchedToks[r].add(tok)
      this.recheckPartial(r)
    }
    // Trailing words of the finished sentence are consumed by it, so they don't blur what comes next.
    if (leadingRecentEnd >= 0) this.windowStart = leadingRecentEnd + 1

    // 2) Displayed sentences: cover on strong lexical, lexical+semantic, or clear paraphrase evidence.
    // Paraphrase margin is global: if any sentence anywhere fits better, this is not a paraphrase of i.
    const semOthers = (i: number) => {
      if (!this.sem) return 1
      let m = -1
      this.sem.scores.forEach((v, j) => {
        if (j !== i && v > m) m = v
      })
      return m
    }
    const covers: { i: number; how: 'lexical' | 'semantic'; maxSeq: number }[] = []
    for (const i of near) {
      const s = this.model.sentences[i]
      const slot = best.get(i)!
      let lex = 0
      for (const [tok, { sim, seq }] of slot) if (seq >= 0) lex += sim * s.weights[tok]
      lex = s.total > 0 ? lex / s.total : 0
      const sem = this.semScore(i)
      // Only paraphrase-level similarity counts as evidence; neighbouring sentences share a topic (~0.5).
      const semEv = sem === null ? 0 : clamp01((sem - 0.55) / 0.2)
      this.evidence[i] = Math.max(this.evidence[i], lex, semEv)
      this.lexEvidence[i] = Math.max(this.lexEvidence[i], lex)
      for (const tok of slot.keys()) this.matchedToks[i].add(tok)
      const maxSeq = Math.max(-1, ...[...slot.values()].map((v) => v.seq))
      const n = s.tokens.length
      if (n === 0) continue
      const allMatched = slot.size === n
      if (n < 3) {
        if (allMatched && lex >= 0.95) covers.push({ i, how: 'lexical', maxSeq })
        else if (sem !== null && sem >= 0.75 && sem - semOthers(i) >= THRESHOLDS.semMargin) covers.push({ i, how: 'semantic', maxSeq: lastSeq })
        continue
      }
      if (lex >= THRESHOLDS.near) covers.push({ i, how: 'lexical', maxSeq })
      else if (sem !== null && lex >= THRESHOLDS.nearWithSem && sem >= THRESHOLDS.semAgree && sem >= semOthers(i) - 0.1) {
        covers.push({ i, how: 'lexical', maxSeq })
      }
      else if (
        sem !== null &&
        win.length >= 4 &&
        slot.size >= 1 && // a paraphrase still shares at least one content word
        sem >= THRESHOLDS.semPara &&
        sem - semOthers(i) >= THRESHOLDS.semMargin &&
        this.semStreak?.sentence === i &&
        (this.semStreak.count >= 2 || final)
      ) {
        covers.push({ i, how: 'semantic', maxSeq: lastSeq })
      }
    }
    if (covers.length) {
      for (const c of covers) this.cover(c.i, c.how)
      this.windowStart = Math.max(...covers.map((c) => c.maxSeq)) + 1
      this.pending = null
      return true
    }

    // 3) Elsewhere: only words nothing on screen explains.
    return this.farStep(unexplained, new Set(priority), lastSeq, final)
  }

  private farStep(unexplained: Heard[], onScreen: Set<number>, lastSeq: number, final: boolean): boolean {
    if (this.pending && lastSeq - this.pending.createdSeq > THRESHOLDS.pendingExpiry * 2) this.pending = null
    if (!unexplained.length) return false
    const perSentence = new Map<number, Map<number, { sim: number; seq: number }>>()
    const perTitle = new Map<number, Set<number>>()
    for (const h of unexplained) {
      for (const m of h.matches) {
        if (m.sentence < 0) {
          if (m.section !== this.active) (perTitle.get(m.section) ?? perTitle.set(m.section, new Set()).get(m.section)!).add(m.tok)
          continue
        }
        if (onScreen.has(m.sentence)) continue
        const slot = perSentence.get(m.sentence) ?? perSentence.set(m.sentence, new Map()).get(m.sentence)!
        if ((slot.get(m.tok)?.sim ?? 0) < m.sim) slot.set(m.tok, { sim: m.sim, seq: h.seq })
      }
    }
    const score = (i: number): FarScore => {
      const s = this.model.sentences[i]
      const slot = perSentence.get(i)
      if (!slot || s.total === 0) return { lex: 0, matched: 0, maxSeq: -1, toks: [] }
      let lex = 0
      let maxSeq = -1
      for (const [tok, v] of slot) {
        lex += v.sim * s.weights[tok]
        maxSeq = Math.max(maxSeq, v.seq)
      }
      return { lex: lex / s.total, matched: slot.size, maxSeq, toks: [...slot.keys()] }
    }
    const qualifies = (i: number, f: FarScore): boolean => {
      const n = this.model.sentences[i].tokens.length
      const enough = n >= 3 ? f.matched >= 3 : f.matched === n && n >= 2
      if (!enough) return false
      const sem = this.semScore(i)
      if (sem === null) return f.lex >= THRESHOLDS.far + 0.1
      return f.lex >= THRESHOLDS.far && sem >= THRESHOLDS.farSemAgree
    }

    // a) Late mention of skipped/partial content in the active section: cover in place, no navigation.
    for (const i of perSentence.keys()) {
      const s = this.model.sentences[i]
      if (s.sectionIdx !== this.active || this.isSaid(i) || s.index >= this.cursor[this.active]) continue
      const f = score(i)
      if (qualifies(i, f) || this.completesMissing(i, perSentence.get(i)!)) {
        this.history.push({ sentence: i, prevStatus: this.status[i], prevCursor: this.cursor[this.active] })
        this.status[i] = 'covered'
        this.missing[i] = null
        this.lexicalCover[i] = false
        this.windowStart = f.maxSeq + 1
        return true
      }
    }

    // b) Best candidate that would move the speaker's position.
    let bestI = -1
    let bestF: FarScore = { lex: 0, matched: 0, maxSeq: -1, toks: [] }
    for (const i of perSentence.keys()) {
      const s = this.model.sentences[i]
      const sameSection = s.sectionIdx === this.active
      if (sameSection && (this.isSaid(i) || s.index < this.cursor[this.active])) continue // repeats / handled above
      if (!this.inScope(s.sectionIdx) && this.isSaid(i)) continue // other slides: no "returns" while scoped
      const f = score(i)
      if (qualifies(i, f) && f.lex > bestF.lex) {
        bestI = i
        bestF = f
      }
    }

    if (bestI >= 0) {
      const sec = this.model.sentences[bestI].sectionIdx
      const strong = bestF.lex >= 0.85 && bestF.matched >= 5
      if (strong || (final && bestF.lex >= 0.8)) return this.confirmJump(bestI, bestF)
      if (!this.pending || this.pending.section !== sec) {
        this.pending = { section: sec, sentence: bestI, createdSeq: lastSeq, matched: bestF.matched }
        return false
      }
      if (this.pending.sentence === bestI ? bestF.matched >= this.pending.matched + 2 : true) {
        return this.confirmJump(bestI, bestF)
      }
    }

    // c) A pending jump is confirmed by further speech from the target section.
    if (this.pending && (this.pending.sentence !== null || this.inScope(this.pending.section))) {
      const target = this.model.sections[this.pending.section]
      for (const i of target.sentenceIdxs) {
        if (i === this.pending.sentence) continue
        const f = score(i)
        if (f.matched >= 2 && f.lex >= 0.3) {
          const toCover = this.pending.sentence ?? i
          return this.confirmJump(toCover, score(toCover), true)
        }
      }
    }

    // d) Section title spoken ("Kommen wir zu den Gegenmaßnahmen") → pending jump.
    for (const [sec, toks] of perTitle) {
      const title = this.model.sections[sec]
      const n = title.titleTokens.length
      if (n === 0 || toks.size < n) continue
      const weight = title.titleWeights.reduce((a, b) => a + b, 0)
      const distinctive = n >= 2 || (title.titleTokens[0].folded.length >= 8 && weight >= 2)
      if (!distinctive || !this.inScope(sec)) continue
      if (!this.pending || this.pending.section !== sec) {
        this.pending = { section: sec, sentence: null, createdSeq: lastSeq, matched: 0 }
      }
    }
    return false
  }

  /**
   * Entering a section mid-way usually means its preceding sentence was what the speaker paraphrased
   * to get there. Cover it only with clear paraphrase-level semantic support.
   */
  private backfillParaphrasedEntry(i: number): void {
    const s = this.model.sentences[i]
    if (s.index < 1 || !this.sem || this.sem.windowStart !== this.windowStart) return
    const p = this.model.sections[s.sectionIdx].sentenceIdxs[s.index - 1]
    if (this.status[p] !== 'open') return
    const scores = this.sem.scores
    let others = -1
    scores.forEach((v, j) => {
      if (j !== p && j !== i && v > others) others = v
    })
    if (scores[p] >= THRESHOLDS.semPara && scores[p] - others >= THRESHOLDS.semMargin) {
      this.history.push({ sentence: p, prevStatus: 'open', prevCursor: this.cursor[s.sectionIdx] })
      this.status[p] = 'covered'
    }
  }

  /** All tokens of a partial sentence's missing clause(s) have now been heard. */
  private completesMissing(i: number, slot: Map<number, unknown>): boolean {
    const missing = this.missing[i]
    if (this.status[i] !== 'partial' || !missing) return false
    const s = this.model.sentences[i]
    return missing.every((ci) => s.components[ci].filter((t) => slot.has(t)).length >= Math.min(2, s.components[ci].length))
  }

  private confirmJump(i: number, f: FarScore, viaSection = false): boolean {
    const s = this.model.sentences[i]
    if (!this.inScope(s.sectionIdx)) {
      // The slide decides: content of another slide is checked off quietly; the view stays put.
      if ((this.status[i] === 'open' || this.status[i] === 'partial') && f.lex >= THRESHOLDS.far) {
        this.history.push({ sentence: i, prevStatus: this.status[i], prevCursor: this.cursor[s.sectionIdx] })
        this.status[i] = 'covered'
        this.missing[i] = null
        this.cursor[s.sectionIdx] = Math.max(this.cursor[s.sectionIdx], s.index + 1)
      }
      this.windowStart = Math.max(this.windowStart, f.maxSeq + 1)
      this.pending = null
      return true
    }
    if (s.sectionIdx !== this.active) this.switchSection(s.sectionIdx, true)
    this.backfillParaphrasedEntry(i)
    for (const tok of f.toks) this.matchedToks[i].add(tok)
    const open = this.status[i] === 'open' || this.status[i] === 'partial'
    if (open && (f.lex >= THRESHOLDS.far || viaSection)) {
      if (f.lex >= THRESHOLDS.far) this.cover(i, 'lexical')
    } else if (!open) {
      // Returning via already-said material: resume after it.
      this.cursor[s.sectionIdx] = Math.max(this.cursor[s.sectionIdx], s.index + 1)
      this.enterSection(s.sectionIdx)
    }
    this.windowStart = Math.max(this.windowStart, f.maxSeq + 1)
    this.pending = null
    return true
  }
}

function dot(a: Float32Array, b: Float32Array): number {
  let d = 0
  for (let i = 0; i < a.length; i++) d += a[i] * b[i]
  return d
}

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x))
}

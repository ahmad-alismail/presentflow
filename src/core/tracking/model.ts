// Precomputed matching model of a script: content tokens, IDF weights, clause components, vocabulary.
import type { Script } from '../script/parse'
import { computeIdf } from '../text/cues'
import { contentTokens, tokenSimilarity, TOKEN_MATCH, type Token } from '../text/normalize'

export interface SentenceModel {
  /** Global index in document order. */
  idx: number
  id: string
  sectionIdx: number
  /** Index within the section. */
  index: number
  text: string
  tokens: Token[]
  weights: number[]
  total: number
  /** Token indices per clause component (each with ≥ 2 content tokens after merging). */
  components: number[][]
}

export interface SectionModel {
  idx: number
  id: string
  title: string
  sentenceIdxs: number[]
  titleTokens: Token[]
  titleWeights: number[]
}

/** A heard word matched against one script token. `sentence` = -1 for section titles. */
export interface TokenMatch {
  sentence: number
  section: number
  tok: number
  sim: number
}

const CLAUSE_BREAK =
  /\s*[,;:()–—]\s*|\s+(?=(?:und|oder|aber|sondern|weil|denn|dass|wobei|während|sowie|and|but|or|because|which|while|whereas)\s)/giu

function clauseComponents(text: string): { tokens: Token[]; components: number[][] } {
  const tokens: Token[] = []
  const raw: number[][] = []
  for (const clause of text.split(CLAUSE_BREAK)) {
    const ct = contentTokens(clause)
    if (!ct.length) continue
    raw.push(ct.map((_, i) => tokens.length + i))
    tokens.push(...ct)
  }
  // Merge tiny components (< 2 content words) into a neighbour: "Wir untersuchen, ob …" is one idea.
  const merged: number[][] = []
  for (const c of raw) {
    if (merged.length && (c.length < 2 || merged[merged.length - 1].length < 2)) merged[merged.length - 1].push(...c)
    else merged.push([...c])
  }
  return { tokens, components: merged }
}

export class ScriptModel {
  readonly sentences: SentenceModel[]
  readonly sections: SectionModel[]
  private readonly vocab: { token: Token; occurrences: Omit<TokenMatch, 'sim'>[] }[]
  private readonly matchCache = new Map<string, TokenMatch[]>()

  constructor(readonly script: Script) {
    const idf = computeIdf(script.sentences.map((s) => s.text))
    const weightOf = (t: Token) => Math.max(0.5, idf.get(t.stem) ?? Math.log(1 + script.sentences.length))
    const sectionIdx = new Map(script.sections.map((s, i) => [s.id, i]))

    this.sentences = script.sentences.map((s, idx) => {
      const { tokens, components } = clauseComponents(s.text)
      const weights = tokens.map(weightOf)
      return {
        idx,
        id: s.id,
        sectionIdx: sectionIdx.get(s.sectionId)!,
        index: s.index,
        text: s.text,
        tokens,
        weights,
        total: weights.reduce((a, b) => a + b, 0),
        components
      }
    })
    const byId = new Map(this.sentences.map((s) => [s.id, s.idx]))
    this.sections = script.sections.map((s, idx) => {
      const titleTokens = contentTokens(s.title)
      return {
        idx,
        id: s.id,
        title: s.title,
        sentenceIdxs: s.sentenceIds.map((id) => byId.get(id)!),
        titleTokens,
        titleWeights: titleTokens.map(weightOf)
      }
    })

    const vocab = new Map<string, { token: Token; occurrences: Omit<TokenMatch, 'sim'>[] }>()
    const add = (token: Token, occ: Omit<TokenMatch, 'sim'>) => {
      const entry = vocab.get(token.folded) ?? { token, occurrences: [] }
      entry.occurrences.push(occ)
      vocab.set(token.folded, entry)
    }
    for (const s of this.sentences) s.tokens.forEach((t, tok) => add(t, { sentence: s.idx, section: s.sectionIdx, tok }))
    for (const sec of this.sections) sec.titleTokens.forEach((t, tok) => add(t, { sentence: -1, section: sec.idx, tok }))
    this.vocab = [...vocab.values()]
  }

  /** All script tokens a heard word plausibly matches (cached per spelling). */
  match(heard: Token): TokenMatch[] {
    const cached = this.matchCache.get(heard.folded)
    if (cached) return cached
    const out: TokenMatch[] = []
    for (const { token, occurrences } of this.vocab) {
      const sim = tokenSimilarity(heard, token)
      if (sim >= TOKEN_MATCH) for (const o of occurrences) out.push({ ...o, sim })
    }
    this.matchCache.set(heard.folded, out)
    return out
  }

  sectionOf(sentenceIdx: number): SectionModel {
    return this.sections[this.sentences[sentenceIdx].sectionIdx]
  }
}

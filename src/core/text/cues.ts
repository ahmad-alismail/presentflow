// Extractive memory cues: keywords taken verbatim from the sentence — never new content.
import { contentTokens, type Token } from './normalize'

/** Inverse document frequency of each stem across all sentences of the script. */
export function computeIdf(sentences: string[]): Map<string, number> {
  const df = new Map<string, number>()
  for (const s of sentences) {
    for (const stem of new Set(contentTokens(s).map((t) => t.stem))) df.set(stem, (df.get(stem) ?? 0) + 1)
  }
  const n = Math.max(1, sentences.length)
  const idf = new Map<string, number>()
  for (const [stem, d] of df) idf.set(stem, Math.log(1 + n / d))
  return idf
}

function salience(t: Token, idf: Map<string, number>, isFirstWord: boolean): number {
  let score = idf.get(t.stem) ?? 1
  // German nouns are capitalized: a strong signal for "what this sentence is about".
  if (!isFirstWord && /^\p{Lu}/u.test(t.surface)) score *= 1.6
  if (/\d/.test(t.folded)) score *= 1.6 // numbers (incl. spoken 'zwölf') are hard to remember
  if (/\p{Lu}.*\p{Lu}/u.test(t.surface)) score *= 1.3 // acronyms / technical terms
  return score * Math.min(1.25, 0.7 + t.surface.length / 16)
}

/** 3–5 keywords in sentence order, original spelling, de-duplicated by stem. */
export function extractKeywords(sentence: string, idf: Map<string, number>, max = 4): string[] {
  const tokens = contentTokens(sentence)
  const firstSurface = sentence.match(/[\p{L}\p{N}]+/u)?.[0]
  const seen = new Set<string>()
  const ranked = tokens
    .map((t, i) => ({ t, i, score: salience(t, idf, t.surface === firstSurface && i === 0) }))
    .filter(({ t }) => (seen.has(t.stem) ? false : (seen.add(t.stem), true)))
    .sort((a, b) => b.score - a.score)
    .slice(0, max)
    .sort((a, b) => a.i - b.i)
  return joinCompounds(sentence, ranked.map((r) => r.t.surface))
}

/** Re-attach hyphenated compounds the tokenizer split ("KI" + "Agenten" → "KI-Agenten"). */
function joinCompounds(sentence: string, words: string[]): string[] {
  const out: string[] = []
  for (const w of words) {
    const compound = sentence.match(new RegExp(`[\\p{L}\\p{N}]+(?:-[\\p{L}\\p{N}]+)*`, 'gu'))?.find(
      (c) => c.includes('-') && c.split('-').includes(w)
    )
    const word = compound ?? w
    if (!out.includes(word)) out.push(word)
  }
  return out
}

export function autoCue(sentence: string, idf: Map<string, number>): string {
  return extractKeywords(sentence, idf).join(' → ')
}

/**
 * Distinctive vocabulary of the whole script for biasing speech recognition
 * (OpenAI `keywords`, Gemini `customVocabulary`, Whisper prompt). Whole script, not just
 * the active section, so jumps to other sections are transcribed correctly too.
 */
export function scriptVocabulary(sentences: string[], max = 100): string[] {
  const idf = computeIdf(sentences)
  const best = new Map<string, { word: string; score: number }>()
  for (const s of sentences) {
    for (const t of contentTokens(s)) {
      const technical = /[\p{Lu}\d].*[\p{Lu}\d]/u.test(t.surface) || t.folded.length >= 9
      if (!technical && !/^\p{Lu}/u.test(t.surface)) continue
      const score = (idf.get(t.stem) ?? 1) * (technical ? 2 : 1)
      const prev = best.get(t.stem)
      if (!prev || prev.score < score) best.set(t.stem, { word: t.surface, score })
    }
  }
  for (const s of sentences) {
    for (const c of s.match(/[\p{L}\p{N}]+(?:-[\p{L}\p{N}]+)+/gu) ?? []) {
      best.set(`#${c}`, { word: c, score: 10 }) // hyphenated compounds are the most ASR-fragile
    }
  }
  return [...best.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, max)
    .map((v) => v.word)
}

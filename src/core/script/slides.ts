// Maps a PowerPoint slide to the part of the script that belongs to it.
import { fold } from '../text/normalize'
import type { Script } from './parse'

export interface SlideRef {
  /** 1-based slide index in the presentation. */
  slide: number
  count?: number
  title?: string
}

export interface SlideGroup {
  number: number | null
  title: string
  sectionIds: string[]
}

const NUMBER_PATTERNS = [
  /^(?:folie|slide|seite|page)\s*(\d{1,3})\b/i, // "Folie 6 — …", "Slide 6: …"
  /^(\d{1,3})\s*(?:[.):—–-]|\s)/, // "6 — …", "6. …", "6) …"
  /\[(\d{1,3})\]/ // "… [6]"
]

/** Slide number written in a heading, e.g. "Folie 6 — AI Agent Safety" → 6. */
export function slideNumberOf(heading: string): number | null {
  for (const re of NUMBER_PATTERNS) {
    const m = re.exec(heading.trim())
    if (m) return Number(m[1])
  }
  return null
}

/** Heading without its slide-number prefix: "Folie 6 — AI Agent Safety" → "AI Agent Safety". */
export function stripSlideNumber(heading: string): string {
  return heading
    .trim()
    .replace(/^(?:(?:folie|slide|seite|page)\s*)?\d{1,3}\s*[.):—–-]?\s*/i, '')
    .replace(/\s*\[\d{1,3}\]\s*/, ' ')
    .trim()
}

const norm = (s: string) => fold(s).replace(/[^\p{L}\p{N}]+/gu, ' ').trim()

/**
 * Slide-sized groups of sections: `#` slides with their sections; in single-level scripts every
 * section whose heading carries a slide number (typical for imported speaker notes) is its own group.
 */
export function slideGroups(script: Script): SlideGroup[] {
  if (script.slides.length) {
    return script.slides.map((s) => ({ number: slideNumberOf(s.title), title: s.title, sectionIds: s.sectionIds }))
  }
  const numbered = script.sections.filter((s) => slideNumberOf(s.title) !== null)
  const source = numbered.length ? numbered : script.sections
  return source.map((s) => ({ number: slideNumberOf(s.title), title: s.title, sectionIds: [s.id] }))
}

/**
 * Sections for the slide PowerPoint shows: by slide number in the heading, else by slide title,
 * else by order (only when the script has no numbers and the slide counts agree). Null = no match.
 */
export function matchSlide(script: Script, ref: SlideRef): string[] | null {
  const groups = slideGroups(script)
  const byNumber = groups.filter((g) => g.number === ref.slide)
  if (byNumber.length) return byNumber.flatMap((g) => g.sectionIds)

  const title = ref.title ? norm(ref.title) : ''
  if (title.length >= 3) {
    const exact = groups.find((g) => norm(stripSlideNumber(g.title)) === title)
    if (exact) return exact.sectionIds
    const partial = groups.find((g) => {
      const t = norm(stripSlideNumber(g.title))
      return t.length >= 4 && (t.includes(title) || title.includes(t))
    })
    if (partial) return partial.sectionIds
  }

  if (groups.length && groups.every((g) => g.number === null) && ref.count === groups.length) {
    return groups[ref.slide - 1]?.sectionIds ?? null
  }
  return null
}

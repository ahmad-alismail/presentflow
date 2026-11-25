// Markdown / plain-text script → slides, sections, sentences.
import { fold } from '../text/normalize'
import { splitSentences } from './sentences'

export interface ScriptSentence {
  /** Stable across edits elsewhere in the script (section + text + occurrence). */
  id: string
  /** Key for user-approved memory cues — depends on the sentence text only. */
  cueKey: string
  sectionId: string
  /** Position within its section. */
  index: number
  text: string
}

export interface ScriptSection {
  id: string
  title: string
  slideId: string | null
  index: number
  sentenceIds: string[]
}

export interface ScriptSlide {
  id: string
  title: string
  sectionIds: string[]
}

export interface Script {
  slides: ScriptSlide[]
  sections: ScriptSection[]
  sentences: ScriptSentence[]
}

/** FNV-1a, base36 — short stable ids. */
export function hashString(s: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(36)
}

export function cueKeyFor(text: string): string {
  return hashString(fold(text).replace(/[^\p{L}\p{N}]+/gu, ' ').trim())
}

/** Strips inline Markdown so only the spoken text remains. */
export function cleanInline(s: string): string {
  return s
    .replace(/!\[[^\]]*]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)]\([^)]*\)/g, '$1')
    .replace(/<[^>]+>/g, '')
    .replace(/(\*\*|__|\*|_|`|~~)(?=\S)([^]*?\S)\1/g, '$2')
    .replace(/\s+/g, ' ')
    .trim()
}

const HEADING = /^(#{1,6})\s+(.+?)\s*#*\s*$/
const LIST_ITEM = /^\s*(?:[-*+•]|\d+[.)])\s+(.*)$/

interface Block {
  kind: 'heading' | 'text'
  level?: number
  /** Heading title, or the sentences of a text block. */
  title?: string
  sentences?: string[]
}

function paragraphSentences(lines: string[]): string[] {
  const cleaned = lines.map(cleanInline).filter(Boolean)
  // Outline-style notes (several lines, no punctuation at all): each line is a point.
  if (cleaned.length > 1 && !cleaned.some((l) => /[.!?…]/.test(l))) return cleaned
  return splitSentences(cleaned.join(' '))
}

function toBlocks(source: string): Block[] {
  const lines = source
    .replace(/^﻿/, '')
    .replace(/\r\n?/g, '\n')
    .replace(/<!--[^]*?-->/g, '')
    .split('\n')
  const blocks: Block[] = []
  let para: string[] = []
  const flush = () => {
    if (para.length) blocks.push({ kind: 'text', sentences: paragraphSentences(para) })
    para = []
  }
  for (const raw of lines) {
    const line = raw.replace(/^\s*>\s?/, '') // blockquotes are just text
    const h = HEADING.exec(line)
    if (h) {
      flush()
      blocks.push({ kind: 'heading', level: h[1].length, title: cleanInline(h[2]) })
      continue
    }
    if (!line.trim()) {
      flush()
      continue
    }
    const li = LIST_ITEM.exec(line)
    if (li) {
      flush()
      para = [li[1]]
      flush()
      continue
    }
    para.push(line)
  }
  flush()
  return blocks
}

function titleFromText(sentence: string): string {
  const words = sentence.replace(/[.!?…:;,]+$/, '').split(' ')
  return words.length <= 5 ? words.join(' ') : `${words.slice(0, 5).join(' ')} …`
}

export function parseScript(source: string): Script {
  const blocks = toBlocks(source)
  const levels = new Set(blocks.filter((b) => b.kind === 'heading').map((b) => b.level!))
  const hasHeadings = levels.size > 0
  // With two or more heading levels, the top level is a slide; otherwise every heading is a section.
  const slideLevel = levels.size >= 2 ? Math.min(...levels) : -1

  const slides: ScriptSlide[] = []
  const sections: ScriptSection[] = []
  const sentences: ScriptSentence[] = []
  const usedIds = new Map<string, number>()
  const uniqueId = (base: string) => {
    const n = usedIds.get(base) ?? 0
    usedIds.set(base, n + 1)
    return n === 0 ? base : `${base}~${n}`
  }

  let slide: ScriptSlide | null = null
  let section: ScriptSection | null = null
  let pendingTitle: string | null = null // section heading seen, created lazily on first text

  const openSection = (title: string) => {
    const id = uniqueId(`s${hashString(`${slide?.title ?? ''}|${title}`)}`)
    section = { id, title, slideId: slide?.id ?? null, index: sections.length, sentenceIds: [] }
    sections.push(section)
    slide?.sectionIds.push(id)
  }

  for (const b of blocks) {
    if (b.kind === 'heading') {
      if (b.level === slideLevel) {
        slide = { id: uniqueId(`f${hashString(b.title!)}`), title: b.title!, sectionIds: [] }
        slides.push(slide)
        section = null
        pendingTitle = null
      } else {
        section = null
        pendingTitle = b.title!
      }
      continue
    }
    const texts = b.sentences ?? []
    if (texts.length === 0) continue
    if (!hasHeadings) section = null // plain text: every paragraph is its own section
    if (!section) openSection(pendingTitle ?? slide?.title ?? titleFromText(texts[0]))
    pendingTitle = null
    const sec = section!
    for (const text of texts) {
      const id = uniqueId(`${sec.id}.${cueKeyFor(text)}`)
      sentences.push({ id, cueKey: cueKeyFor(text), sectionId: sec.id, index: sec.sentenceIds.length, text })
      sec.sentenceIds.push(id)
    }
  }

  return { slides: slides.filter((s) => s.sectionIds.length > 0), sections, sentences }
}

// PowerPoint (.pptx) → PresentFlow script: slide titles become numbered slide headings, speaker notes
// become the text. Works without PowerPoint installed (a .pptx is a zip of XML parts).
import path from 'node:path'
import { strFromU8, unzipSync } from 'fflate'
import { guessLanguage } from '../core/text/language'
import type { SpeechLanguage } from '@shared/types'

export interface PptxSlide {
  /** 1-based position in the presentation (= PowerPoint's SlideIndex). */
  index: number
  title: string
  /** Notes paragraphs; '' marks an empty paragraph, '- …' a bullet. */
  notes: string[]
  hidden: boolean
}

const ENTITIES: Record<string, string> = { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" }

function decodeXml(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e: string) => {
    if (e[0] === '#') return String.fromCodePoint(e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10))
    return ENTITIES[e] ?? m
  })
}

type Files = Record<string, string>

/** Relationships of a part: rId → { target (resolved zip path), type }. */
function relationships(files: Files, part: string): Map<string, { target: string; type: string }> {
  const relsPath = path.posix.join(path.posix.dirname(part), '_rels', `${path.posix.basename(part)}.rels`)
  const xml = files[relsPath] ?? ''
  const out = new Map<string, { target: string; type: string }>()
  for (const m of xml.matchAll(/<Relationship\b[^>]*>/g)) {
    const attr = (name: string) => new RegExp(`\\b${name}="([^"]*)"`).exec(m[0])?.[1] ?? ''
    out.set(attr('Id'), { target: path.posix.normalize(path.posix.join(path.posix.dirname(part), attr('Target'))), type: attr('Type') })
  }
  return out
}

function shapes(xml: string): string[] {
  return xml.match(/<p:sp\b[\s\S]*?<\/p:sp>/g) ?? []
}

function placeholderType(shape: string): string | null {
  const ph = /<p:ph\b([^>]*)\/?>/.exec(shape)
  if (!ph) return null
  return /\btype="([^"]+)"/.exec(ph[1])?.[1] ?? 'body'
}

function paragraphs(shape: string): string[] {
  return (shape.match(/<a:p>[\s\S]*?<\/a:p>|<a:p\/>/g) ?? []).map((p) => {
    const text = (p.match(/<a:t>[\s\S]*?<\/a:t>|<a:br\/>/g) ?? [])
      .map((r) => (r === '<a:br/>' ? ' ' : decodeXml(r.slice(5, -6))))
      .join('')
      .replace(/\s+/g, ' ')
      .trim()
    const bullet = /<a:bu(Char|AutoNum)\b/.test(p)
    return text && bullet && !text.startsWith('#') ? `- ${text}` : text
  })
}

export function parsePptx(data: Uint8Array): PptxSlide[] {
  const raw = unzipSync(data, {
    filter: (f) => (f.name.startsWith('ppt/') && /\.(xml|rels)$/.test(f.name)) || f.name === 'docProps/core.xml'
  })
  const files: Files = Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, strFromU8(v)]))
  const presentation = files['ppt/presentation.xml']
  if (!presentation) throw new Error('not a PowerPoint presentation')
  const presRels = relationships(files, 'ppt/presentation.xml')
  const ids = [...presentation.matchAll(/<p:sldId\b[^>]*\br:id="([^"]+)"/g)].map((m) => m[1])

  return ids.map((rid, k) => {
    const slidePath = presRels.get(rid)?.target ?? ''
    const slideXml = files[slidePath] ?? ''
    const title = shapes(slideXml)
      .filter((sp) => ['title', 'ctrTitle'].includes(placeholderType(sp) ?? ''))
      .flatMap(paragraphs)
      .filter(Boolean)
      .join(' ')
    const notesPath = [...relationships(files, slidePath).values()].find((r) => r.type.endsWith('/notesSlide'))?.target
    const notesXml = notesPath ? (files[notesPath] ?? '') : ''
    const notes = shapes(notesXml)
      .filter((sp) => placeholderType(sp) === 'body')
      .flatMap(paragraphs)
    return { index: k + 1, title, notes, hidden: /<p:sld\b[^>]*\bshow="0"/.test(slideXml) }
  })
}

function documentTitle(data: Uint8Array): string | null {
  try {
    const core = unzipSync(data, { filter: (f) => f.name === 'docProps/core.xml' })['docProps/core.xml']
    const t = core ? /<dc:title>([\s\S]*?)<\/dc:title>/.exec(strFromU8(core))?.[1] : null
    return t ? decodeXml(t).trim() || null : null
  } catch {
    return null
  }
}

/** Builds a script: `# Folie N — Title` per visible slide, then its speaker notes (empty slides keep their heading as a to-do). */
export function pptxToScript(data: Uint8Array, fileTitle: string): { title: string; source: string; language: SpeechLanguage } {
  const slides = parsePptx(data).filter((s) => !s.hidden)
  const language = guessLanguage(slides.flatMap((s) => s.notes).join(' ') || slides.map((s) => s.title).join(' '))
  const word = language === 'de' ? 'Folie' : 'Slide'
  const blocks = slides.map((s) => {
    const heading = `# ${word} ${s.index}${s.title ? ` — ${s.title}` : ''}`
    // Each notes paragraph becomes its own paragraph; bullets stay together as a list.
    const body: string[] = []
    for (const p of s.notes) {
      if (!p) continue
      const isList = p.startsWith('- ')
      if (body.length && !(isList && body[body.length - 1].startsWith('- '))) body.push('')
      body.push(p)
    }
    return [heading, ...body].join('\n')
  })
  return { title: documentTitle(data) ?? fileTitle, source: `${blocks.join('\n\n')}\n`, language }
}

import fs from 'node:fs'
import { parseScript, type Script } from '../src/core/script/parse'
import type { Tracker } from '../src/core/tracking/tracker'

export const sample: Script = parseScript(fs.readFileSync('resources/sample-de.md', 'utf8'))

/** Clip name → Whisper large-v3-turbo transcript of the German TTS clip (see scripts/make-talk-clips.py). */
export const asr: Record<string, string> = Object.fromEntries(
  Object.entries(
    JSON.parse(fs.readFileSync('test/fixtures/asr-transcripts.json', 'utf8')) as Record<string, { asr: string }>
  ).map(([k, v]) => [k, v.asr])
)

export const sectionTitles = sample.sections.map((s) => s.title)

export function textOf(script: Script, id: string | undefined | null): string | null {
  if (!id) return null
  return script.sentences.find((s) => s.id === id)?.text ?? null
}

export function sentenceId(script: Script, section: number, index: number): string {
  return script.sections[section - 1].sentenceIds[index - 1]
}

export interface Embedder {
  embed(text: string): Promise<Float32Array>
}

let uttCounter = 0

/**
 * Speak `text` into the tracker like a live recognizer: growing partials (3 words at a time),
 * then a final. After each update, resolve any semantic request with the embedder (if given).
 */
export async function speak(tracker: Tracker, text: string, embedder?: Embedder): Promise<void> {
  const id = `u${uttCounter++}`
  const words = text.split(/\s+/)
  const settle = async () => {
    if (!embedder) return
    for (let k = 0; k < 3; k++) {
      const req = tracker.semanticRequest()
      if (!req) return
      tracker.applySemantic(req.key, await embedder.embed(req.text))
    }
  }
  for (let n = 3; n < words.length; n += 3) {
    tracker.ingest(id, words.slice(0, n).join(' '), false)
    await settle()
  }
  tracker.ingest(id, text, true)
  await settle()
}

export function currentText(tracker: Tracker, script: Script = sample): string | null {
  return textOf(script, tracker.view().current?.sentenceId)
}

export function activeTitle(tracker: Tracker, script: Script = sample): string | null {
  const id = tracker.view().activeSectionId
  return script.sections.find((s) => s.id === id)?.title ?? null
}

export function statusOf(tracker: Tracker, section: number, index: number, script: Script = sample) {
  return tracker.sentenceState(sentenceId(script, section, index)).status
}

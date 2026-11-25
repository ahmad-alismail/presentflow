// The lines above the current sentence in the lyrics-style stage: the script as written, read backwards.
import type { Script } from '../script/parse'
import type { TrackerView } from './tracker'

export interface PrecedingItem {
  sentenceId: string
  sectionId: string
  /** Not said although the speaker already passed it. */
  skipped: boolean
}

/**
 * Up to `max` sentences that precede the current one in document order, across section boundaries,
 * oldest first. In linear speaking the last item is the sentence just left (`view.lastSaidId`).
 * While the display is held to a slide, only that slide's sentences — and once it is finished,
 * its last ones.
 */
export function precedingSentences(script: Script, view: TrackerView, max: number): PrecedingItem[] {
  const { sentences } = script
  const scope = view.scope ? new Set(view.scope) : null
  let at = -1
  if (view.current) at = sentences.findIndex((s) => s.id === view.current!.sentenceId)
  else if (scope) at = sentences.findLastIndex((s) => scope.has(s.sectionId)) + 1
  if (at <= 0 || max <= 0) return []
  const skipped = new Set(view.sections.flatMap((s) => s.skipped))
  const out: PrecedingItem[] = []
  for (let k = at - 1; k >= 0 && out.length < max && (!scope || scope.has(sentences[k].sectionId)); k--) {
    out.unshift({ sentenceId: sentences[k].id, sectionId: sentences[k].sectionId, skipped: skipped.has(sentences[k].id) })
  }
  return out
}

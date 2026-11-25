// LocalAgreement-2: a word reaches the tracker only once two consecutive hypotheses agree on it.
// Re-transcribing ASR (local Whisper) and replacing interim text (Gemini) revise earlier words;
// this layer turns them into an append-only stream so the UI never has to move backwards.
import type { TranscriptEvent } from '@shared/types'

export interface StableUpdate {
  utteranceId: string
  text: string
  final: boolean
}

const norm = (w: string) => w.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '')

function commonPrefix(a: string[], b: string[]): number {
  let i = 0
  while (i < a.length && i < b.length && norm(a[i]) === norm(b[i])) i++
  return i
}

export class StableTranscript {
  private prev = new Map<string, string[]>()
  private committed = new Map<string, number>()

  /**
   * @param appendOnly provider guarantees earlier text never changes (OpenAI deltas) → pass through.
   * @returns the stable text to feed the tracker, or null if nothing new became stable.
   */
  push(e: TranscriptEvent, appendOnly = false): StableUpdate | null {
    if (e.kind === 'final' || appendOnly) {
      if (e.kind === 'final') this.forget(e.utteranceId)
      return e.text.trim() ? { utteranceId: e.utteranceId, text: e.text, final: e.kind === 'final' } : null
    }
    const words = e.text.trim().split(/\s+/).filter(Boolean)
    const prev = this.prev.get(e.utteranceId)
    this.prev.set(e.utteranceId, words)
    if (!prev) return null
    const agreed = commonPrefix(prev, words)
    const done = this.committed.get(e.utteranceId) ?? 0
    if (agreed <= done) return null
    this.committed.set(e.utteranceId, agreed)
    return { utteranceId: e.utteranceId, text: words.slice(0, agreed).join(' '), final: false }
  }

  forget(utteranceId: string): void {
    this.prev.delete(utteranceId)
    this.committed.delete(utteranceId)
  }
}

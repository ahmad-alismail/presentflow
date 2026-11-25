// Tracker with real multilingual embeddings: paraphrase recognition (SYS-05) without losing conservatism.
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { embedAll, nodeEmbedder } from '../../../test/embedder'
import { activeTitle, asr, currentText, sample, sentenceId, speak, statusOf, textOf } from '../../../test/helpers'
import { Tracker } from './tracker'

const embedder = nodeEmbedder()
let vectors: Float32Array[]
let t: Tracker
const S = (sec: number, i: number) => textOf(sample, sentenceId(sample, sec, i))
const say = (text: string) => speak(t, text, embedder)

beforeAll(async () => {
  vectors = await embedAll(embedder, sample.sentences.map((s) => s.text))
})
beforeEach(() => {
  t = new Tracker(sample)
  t.setSentenceVectors(vectors)
})

describe('paraphrase recognition', () => {
  it('recognizes the spec example: "Wir schauen, ob Agenten versuchen, einen Shutdown zu verhindern."', async () => {
    for (const c of ['s4-1', 's4-2', 's4-3']) await say(asr[c])
    expect(currentText(t)).toBe(S(5, 1)) // continuation into Shutdown Resistance
    await say(asr['p-shutdown-1'])
    expect(statusOf(t, 5, 1)).toBe('covered')
    expect(activeTitle(t)).toBe('Shutdown Resistance')
    expect(currentText(t)).toBe(S(5, 2))
  })

  it('follows a talk where many sentences are paraphrased', async () => {
    const talk = [
      'p-begruessung-1', 's1-2', 's1-3', 'p-ausgangslage-1', 's2-2', 's2-3', 's3-1', 'p-testumgebung-2', 's3-3',
      'p-konkurrenz-1', 's4-2', 's4-3', 'p-shutdown-1', 's5-2', 'p-shutdown-3', 'p-warum-1', 's6-2', 's6-3',
      's7-1', 's7-2', 'p-gegen-3', 'p-ressourcen-1', 's8-2', 's8-3', 'p-ueberleitung-1', 's9-2', 's9-3'
    ]
    for (const c of talk) await say(asr[c])
    const open = t.view().sections.flatMap((s) => s.remaining).map((id) => textOf(sample, id))
    expect(open).toEqual([])
  })

  it('handles fillers ("äh", "ähm" → "E.", "M.")', async () => {
    t.activateSection(sample.sections[2].id)
    await say(asr['f-testumgebung-1'])
    expect(statusOf(t, 3, 1)).toBe('covered')
  })

  it('still reports a skipped clause as partial when embeddings say "similar"', async () => {
    for (const c of ['s1-1', 's1-2', 's1-3', 's2-1']) await say(asr[c])
    await say(asr['partial-ausgangslage-2'])
    await say(asr['s2-3'])
    expect(statusOf(t, 2, 2)).toBe('partial')
  })

  it('does not react to off-topic remarks', async () => {
    await say(asr['s1-1'])
    const before = t.view()
    await say(asr['offtopic'])
    expect(t.view().current).toEqual(before.current)
  })

  it('does not jump on a paraphrase from a distant section alone (conservative)', async () => {
    await say(asr['s1-1'])
    await say(asr['p-warum-1'])
    expect(activeTitle(t)).toBe('Begrüßung')
    await say(asr['s6-2']) // continuing in that section confirms the jump
    expect(activeTitle(t)).toBe('Warum ist das wichtig?')
  })
})

describe('Definition of Done — jumpy rehearsal of the sample talk', () => {
  it('follows jumps, preserves unfinished sections, and resumes them', async () => {
    await say(asr['s1-1'])
    await say(asr['s1-2'])
    await say(asr['s1-3'])
    await say(asr['s2-1'])
    // Unexpected jump to "Warum ist das wichtig?" in the middle of Ausgangslage.
    await say(asr['p-warum-1'])
    await say(asr['s6-2'])
    expect(activeTitle(t)).toBe('Warum ist das wichtig?')
    expect(currentText(t)).toBe(S(6, 3))
    expect(t.view().sections[1].remaining).toEqual([sentenceId(sample, 2, 2), sentenceId(sample, 2, 3)])
    // Back to Ausgangslage: remembers what was said, shows what is left.
    await say(asr['s2-2'])
    expect(activeTitle(t)).toBe('Ausgangslage')
    expect(currentText(t)).toBe(S(2, 3))
    expect(t.view().upcoming[0]).toMatchObject({ continuation: true })
    await say(asr['s2-3'])
    expect(t.view().sections[1].status).toBe('done')
    // Section 6 still remembers its own open sentence.
    expect(t.view().sections[5].remaining).toEqual([sentenceId(sample, 6, 3)])
  })
})

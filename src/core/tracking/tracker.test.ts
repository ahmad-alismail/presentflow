// Tracker scenarios driven by real Whisper transcripts of German TTS clips — run twice:
// lexical-only (embedder unavailable) and with real multilingual embeddings (the app's default).
import fs from 'node:fs'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { embedAll, nodeEmbedder } from '../../../test/embedder'
import { activeTitle, asr, currentText, sample, sentenceId, speak as speakWith, statusOf, textOf, type Embedder } from '../../../test/helpers'
import { parseScript } from '../script/parse'
import { Tracker } from './tracker'

// Sections of the sample talk: 1 Begrüßung · 2 Ausgangslage · 3 Testumgebung · 4 Konkurrenz ·
// 5 Shutdown Resistance · 6 Warum ist das wichtig? · 7 Gegenmaßnahmen · 8 Zusätzliche Ressourcen · 9 Überleitung
const S = (sec: number, i: number) => textOf(sample, sentenceId(sample, sec, i))

describe.each([['lexical'], ['semantic']])('%s mode', (mode) => {
let t: Tracker
let embedder: Embedder | undefined
let vectors: Float32Array[] | undefined
const speak = (tr: Tracker, text: string) => speakWith(tr, text, embedder)

beforeAll(async () => {
  if (mode !== 'semantic') return
  embedder = nodeEmbedder()
  vectors = await embedAll(embedder, sample.sentences.map((s) => s.text))
})
beforeEach(() => {
  t = new Tracker(sample)
  if (vectors) t.setSentenceVectors(vectors)
})

describe('Scenario A — normal speaking', () => {
  it('starts at the first sentence with the next one underneath', () => {
    expect(currentText(t)).toBe(S(1, 1))
    expect(t.view().upcoming.map((u) => textOf(sample, u.sentenceId))).toEqual([S(1, 2), S(1, 3)])
  })

  it('covers each spoken sentence and promotes the next', async () => {
    await speak(t, asr['s1-1'])
    expect(statusOf(t, 1, 1)).toBe('covered')
    expect(currentText(t)).toBe(S(1, 2))
    await speak(t, asr['s1-2'])
    expect(currentText(t)).toBe(S(1, 3))
    expect(t.view().lastSaidId).toBe(sentenceId(sample, 1, 2))
  })

  it('follows a whole talk spoken in order', async () => {
    for (let sec = 1; sec <= 9; sec++) {
      for (let i = 1; i <= sample.sections[sec - 1].sentenceIds.length; i++) await speak(t, asr[`s${sec}-${i}`])
    }
    expect(t.view().sections.every((s) => s.status === 'done')).toBe(true)
    expect(t.view().current).toBeNull()
  })

  it('advances while one long utterance contains several sentences', async () => {
    await speak(t, `${asr['s3-1']} ${asr['s3-2']} ${asr['s3-3']}`)
    // Only Begrüßung is on screen at first; Testumgebung is reached via a confirmed jump.
    expect(activeTitle(t)).toBe('Testumgebung')
    expect(statusOf(t, 3, 2)).toBe('covered')
    expect(statusOf(t, 3, 3)).toBe('covered')
  })
})

describe('Section boundaries', () => {
  it('shows the next section as continuation at the end of a section', async () => {
    await speak(t, asr['s1-1'])
    await speak(t, asr['s1-2'])
    expect(t.view().upcoming[0]).toMatchObject({ continuation: true })
    expect(textOf(sample, t.view().upcoming[0].sentenceId)).toBe(S(2, 1))
    await speak(t, asr['s1-3'])
    expect(t.view().current).toMatchObject({ continuation: true })
    expect(currentText(t)).toBe(S(2, 1))
    await speak(t, asr['s2-1'])
    expect(activeTitle(t)).toBe('Ausgangslage')
    expect(currentText(t)).toBe(S(2, 2))
  })
})

describe('Scenario B — partial coverage', () => {
  it('keeps the uncovered clause available instead of marking the sentence done', async () => {
    await speak(t, asr['s1-1'])
    await speak(t, asr['s1-2'])
    await speak(t, asr['s1-3'])
    await speak(t, asr['s2-1'])
    await speak(t, asr['partial-ausgangslage-2']) // "Sie schreiben Code und buchen Termine." (omits "steuern andere Programme")
    await speak(t, asr['s2-3'])
    const st = t.sentenceState(sentenceId(sample, 2, 2))
    expect(st.status).toBe('partial')
    expect(st.missing).toHaveLength(1)
    expect(t.view().sections[1].remaining).toContain(sentenceId(sample, 2, 2))
    // Mentioning the missing clause later completes the sentence.
    await speak(t, 'Und sie steuern auch andere Programme.')
    expect(statusOf(t, 2, 2)).toBe('covered')
  })
})

describe('Scenario C/D — jumps and returns keep independent section memory', () => {
  it('jumps forward and returns to the remaining content', async () => {
    await speak(t, asr['s8-1']) // jump straight to "Zusätzliche Ressourcen"
    expect(activeTitle(t)).toBe('Zusätzliche Ressourcen')
    expect(currentText(t)).toBe(S(8, 2))

    await speak(t, asr['s6-1']) // jump to "Warum ist das wichtig?"
    expect(activeTitle(t)).toBe('Warum ist das wichtig?')
    expect(currentText(t)).toBe(S(6, 2))
    expect(statusOf(t, 8, 1)).toBe('covered')
    expect(statusOf(t, 8, 2)).toBe('open')

    await speak(t, asr['s8-2']) // return to "Zusätzliche Ressourcen"
    expect(activeTitle(t)).toBe('Zusätzliche Ressourcen')
    expect(currentText(t)).toBe(S(8, 3))
    expect(statusOf(t, 8, 1)).toBe('covered')
    expect(statusOf(t, 6, 1)).toBe('covered')
    expect(statusOf(t, 6, 2)).toBe('open')
  })

  it('returns by restating already-covered material and resumes at the first unfinished sentence', async () => {
    await speak(t, asr['s3-1'])
    await speak(t, asr['s3-2'])
    await speak(t, asr['s7-1']) // jump to Gegenmaßnahmen
    expect(activeTitle(t)).toBe('Gegenmaßnahmen')
    await speak(t, asr['s3-1']) // restates Testumgebung #1 (already said)
    expect(activeTitle(t)).toBe('Testumgebung')
    expect(currentText(t)).toBe(S(3, 3))
    expect(statusOf(t, 3, 1)).toBe('covered') // no double counting, no reset
  })

  it('jumps on a spoken section title once its content follows', async () => {
    await speak(t, asr['s1-1'])
    await speak(t, asr['title-gegen'])
    expect(activeTitle(t)).toBe('Begrüßung') // title alone is not enough
    await speak(t, asr['s7-1'])
    expect(activeTitle(t)).toBe('Gegenmaßnahmen')
    expect(statusOf(t, 7, 1)).toBe('covered')
  })
})

describe('Skips, repeats, silence, off-topic', () => {
  it('keeps a skipped sentence open without forcing a return, and covers it when mentioned later', async () => {
    await speak(t, asr['s3-1'])
    await speak(t, asr['s3-3'])
    expect(statusOf(t, 3, 2)).toBe('open')
    expect(t.view().sections[2].hasSkipped).toBe(true)
    expect(currentText(t)).toBe(S(4, 1)) // not dragged back to 3.2
    await speak(t, asr['s3-2'])
    expect(statusOf(t, 3, 2)).toBe('covered')
    expect(t.view().sections[2].status).toBe('done')
  })

  it('recognizes repeated content without duplicating progress', async () => {
    await speak(t, asr['s1-1'])
    const coverage = () => Object.values(t.snapshot().sentences).map((x) => x.status)
    const before = { coverage: coverage(), cursors: t.snapshot().cursors }
    await speak(t, asr['s1-1'])
    expect({ coverage: coverage(), cursors: t.snapshot().cursors }).toEqual(before)
    expect(currentText(t)).toBe(S(1, 2))
  })

  it('does nothing on off-topic remarks or fillers', async () => {
    await speak(t, asr['s1-1'])
    const before = t.view()
    await speak(t, asr['offtopic'])
    await speak(t, 'Äh, ähm, also, genau.')
    expect(t.view().current).toEqual(before.current)
    expect(t.view().activeSectionId).toBe(before.activeSectionId)
  })

  it('does not jump on a passing reference to another section', async () => {
    await speak(t, asr['s5-1'])
    await speak(t, 'Wie bei den Büroaufgaben vorhin.')
    expect(activeTitle(t)).toBe('Shutdown Resistance')
    await speak(t, asr['s5-2'])
    await speak(t, asr['s5-3']) // shares "zwölf Agenten" with Testumgebung — must stay here
    expect(activeTitle(t)).toBe('Shutdown Resistance')
    expect(statusOf(t, 5, 3)).toBe('covered')
    expect(statusOf(t, 3, 2)).toBe('open')
  })

  it('does not cover a sentence from a fragment of it', async () => {
    await speak(t, 'Guten Morgen')
    expect(statusOf(t, 1, 1)).toBe('open')
  })
})

describe('Scenario F — manual correction', () => {
  it('lets the user pick a section; tracking continues from there; coverage preserved', async () => {
    await speak(t, asr['s1-1'])
    t.activateSection(sample.sections[4].id)
    expect(activeTitle(t)).toBe('Shutdown Resistance')
    expect(currentText(t)).toBe(S(5, 1))
    await speak(t, asr['s5-1'])
    expect(currentText(t)).toBe(S(5, 2))
    expect(statusOf(t, 1, 1)).toBe('covered')
    t.undoJump()
    expect(activeTitle(t)).toBe('Begrüßung')
    expect(currentText(t)).toBe(S(1, 2))
  })

  it('next marks the current sentence said; back undoes it', () => {
    t.next()
    expect(statusOf(t, 1, 1)).toBe('manual')
    expect(currentText(t)).toBe(S(1, 2))
    t.back()
    expect(statusOf(t, 1, 1)).toBe('open')
    expect(currentText(t)).toBe(S(1, 1))
  })

  it('toggles a talking point from the navigator', () => {
    const id = sentenceId(sample, 2, 2)
    t.toggleSentence(id)
    expect(t.sentenceState(id).status).toBe('manual')
    t.toggleSentence(id)
    expect(t.sentenceState(id).status).toBe('open')
  })

  it('restart clears everything', async () => {
    await speak(t, asr['s1-1'])
    t.reset()
    expect(currentText(t)).toBe(S(1, 1))
    expect(t.view().sections.every((s) => s.status === 'open')).toBe(true)
  })
})

describe('Session recovery', () => {
  it('round-trips through a snapshot, also after editing the script', async () => {
    await speak(t, asr['s1-1'])
    await speak(t, asr['s6-1'])
    const snap = t.snapshot()
    const restored = new Tracker(sample)
    restored.restore(snap)
    expect(restored.view()).toMatchObject({ ...t.view(), version: expect.any(Number) })

    const edited = parseScript(`${'## Neu\nEin neuer Abschnitt am Anfang.\n\n'}${fs.readFileSync('resources/sample-de.md', 'utf8')}`)
    const r2 = new Tracker(edited)
    r2.restore(snap)
    expect(r2.sentenceState(sentenceId(sample, 6, 1)).status).toBe('covered')
    expect(activeTitle(r2, edited)).toBe('Warum ist das wichtig?')
  })
})
})

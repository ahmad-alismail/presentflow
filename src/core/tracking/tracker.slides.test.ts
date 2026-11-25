// "The slide decides": PowerPoint slide scope, in lexical-only and semantic mode.
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { embedAll, nodeEmbedder } from '../../../test/embedder'
import { activeTitle, asr, currentText, sample, sentenceId, speak as speakWith, statusOf, textOf, type Embedder } from '../../../test/helpers'
import { matchSlide } from '../script/slides'
import { Tracker } from './tracker'

// Sample talk slides: 1 = Begrüßung, Ausgangslage · 2 = Testumgebung, Konkurrenz, Shutdown Resistance ·
// 3 = Warum ist das wichtig?, Gegenmaßnahmen, Zusätzliche Ressourcen · 4 = Überleitung
const S = (sec: number, i: number) => textOf(sample, sentenceId(sample, sec, i))
const slide = (n: number) => matchSlide(sample, { slide: n })

describe.each([['lexical'], ['semantic']])('%s mode', (mode) => {
  let t: Tracker
  let embedder: Embedder | undefined
  let vectors: Float32Array[] | undefined
  const speak = (text: string) => speakWith(t, text, embedder)

  beforeAll(async () => {
    if (mode !== 'semantic') return
    embedder = nodeEmbedder()
    vectors = await embedAll(embedder, sample.sentences.map((s) => s.text))
  })
  beforeEach(() => {
    t = new Tracker(sample)
    if (vectors) t.setSentenceVectors(vectors)
  })

  it('opening a slide focuses its first unfinished section', () => {
    t.setSlideScope(slide(3))
    expect(activeTitle(t)).toBe('Warum ist das wichtig?')
    expect(currentText(t)).toBe(S(6, 1))
    expect(t.slideScoped).toBe(true)
  })

  it('speech moves between sections of the same slide', async () => {
    t.setSlideScope(slide(3))
    await speak(asr['s7-1'])
    expect(activeTitle(t)).toBe('Gegenmaßnahmen')
    expect(statusOf(t, 7, 1)).toBe('covered')
  })

  it('content from another slide is checked off quietly — the view stays on the slide', async () => {
    t.setSlideScope(slide(3))
    await speak(asr['s3-1']) // Testumgebung lives on slide 2
    expect(activeTitle(t)).toBe('Warum ist das wichtig?')
    expect(currentText(t)).toBe(S(6, 1))
    expect(statusOf(t, 3, 1)).toBe('covered')
  })

  it('nothing from the next slide is shown, even on the last sentence of the slide', async () => {
    t.setSlideScope(slide(1))
    for (const c of ['s1-1', 's1-2', 's1-3', 's2-1', 's2-2']) await speak(asr[c])
    const v = t.view()
    expect(currentText(t)).toBe(S(2, 3))
    expect(v.upcoming).toEqual([])
    expect(v.scope).toEqual(slide(1))
  })

  it('after the slide is finished, nothing is shown and the next slide waits until PowerPoint moves', async () => {
    t.setSlideScope(slide(1))
    for (const c of ['s1-1', 's1-2', 's1-3', 's2-1', 's2-2', 's2-3']) await speak(asr[c])
    expect(t.view().current).toBeNull()
    expect(t.view().scope).toEqual(slide(1))
    expect(activeTitle(t)).toBe('Ausgangslage')
    t.next() // manual "next" never reaches beyond the slide
    expect(statusOf(t, 3, 1)).toBe('open')
    await speak(asr['s3-1']) // said before clicking: checked off, view stays
    expect(activeTitle(t)).toBe('Ausgangslage')
    expect(statusOf(t, 3, 1)).toBe('covered')
    t.setSlideScope(slide(2)) // the click
    expect(activeTitle(t)).toBe('Testumgebung')
    expect(currentText(t)).toBe(S(3, 2))
  })

  it('returning to a partly done slide resumes its first unfinished sentence', async () => {
    t.setSlideScope(slide(2))
    await speak(asr['s3-1'])
    t.setSlideScope(slide(3))
    await speak(asr['s6-1'])
    t.setSlideScope(slide(2))
    expect(activeTitle(t)).toBe('Testumgebung')
    expect(currentText(t)).toBe(S(3, 2))
    expect(statusOf(t, 6, 1)).toBe('covered')
  })

  it('re-reporting the same slide changes nothing', async () => {
    t.setSlideScope(slide(3))
    await speak(asr['s7-1'])
    const v = t.view().version
    t.setSlideScope(slide(3))
    expect(t.view().version).toBe(v)
    expect(activeTitle(t)).toBe('Gegenmaßnahmen')
  })

  it('a manual section click outside the slide overrides the scope until the next slide change', async () => {
    t.setSlideScope(slide(3))
    t.activateSection(sample.sections[0].id)
    expect(t.slideScoped).toBe(false)
    expect(activeTitle(t)).toBe('Begrüßung')
    await speak(asr['s8-1']) // free tracking again: jumps
    expect(activeTitle(t)).toBe('Zusätzliche Ressourcen')
  })

  it('clearing the scope (PowerPoint closed) returns to free tracking', async () => {
    t.setSlideScope(slide(3))
    t.setSlideScope(null)
    expect(t.view().scope).toBeNull()
    await speak(asr['s3-1'])
    expect(activeTitle(t)).toBe('Testumgebung')
  })

  it('a slide without text holds the display too: nothing shown, other speech only checked off', async () => {
    t.setSlideScope(slide(1))
    await speak(asr['s1-1'])
    t.setSlideScope([])
    expect(t.view().current).toBeNull()
    expect(t.view().upcoming).toEqual([])
    expect(t.view().scope).toEqual([])
    await speak(asr['s3-1'])
    expect(statusOf(t, 3, 1)).toBe('covered')
    expect(activeTitle(t)).toBe('Begrüßung')
    t.next() // nothing to mark on an empty slide
    expect(statusOf(t, 1, 2)).toBe('open')
    t.setSlideScope(slide(2))
    expect(activeTitle(t)).toBe('Testumgebung')
    expect(currentText(t)).toBe(S(3, 2))
  })

  it('automatic mode: entering a slide resumes it without holding the display to it', async () => {
    t.enterSlide(slide(2)!)
    expect(activeTitle(t)).toBe('Testumgebung')
    expect(t.slideScoped).toBe(false)
    for (const c of ['s3-1', 's3-2', 's3-3', 's4-1', 's4-2', 's4-3', 's5-1', 's5-2', 's5-3']) await speak(asr[c])
    expect(currentText(t)).toBe(S(6, 1)) // the next slide shows up…
    await speak(asr['s6-1'])
    expect(activeTitle(t)).toBe('Warum ist das wichtig?') // …and speech moves on to it
  })

  it('automatic mode: entering the slide the speaker is already on changes nothing', async () => {
    t.enterSlide(slide(3)!)
    await speak(asr['s7-1'])
    const v = t.view().version
    t.enterSlide(slide(3)!)
    expect(t.view().version).toBe(v)
    expect(activeTitle(t)).toBe('Gegenmaßnahmen')
  })
})

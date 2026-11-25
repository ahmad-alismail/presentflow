import { beforeEach, describe, expect, it } from 'vitest'
import { sample, sentenceId, speak, textOf } from '../../../test/helpers'
import { matchSlide } from '../script/slides'
import { precedingSentences } from './preceding'
import { Tracker } from './tracker'

const id = (sec: number, i: number) => sentenceId(sample, sec, i)
const ids = (t: Tracker, max = 3) => precedingSentences(sample, t.view(), max).map((p) => p.sentenceId)

describe('precedingSentences', () => {
  let t: Tracker
  beforeEach(() => {
    t = new Tracker(sample)
  })

  it('is empty at the start of the talk', () => {
    expect(ids(t)).toEqual([])
  })

  it('keeps the sentence just left directly above the current one', () => {
    t.next()
    const view = t.view()
    const items = precedingSentences(sample, view, 3)
    expect(items.map((p) => p.sentenceId)).toEqual([id(1, 1)])
    expect(items.at(-1)!.sentenceId).toBe(view.lastSaidId)
    expect(items[0].skipped).toBe(false)
  })

  it('reads across section boundaries, oldest first, limited to max', () => {
    t.activateSection(sample.sections[1].id)
    expect(textOf(sample, t.view().current?.sentenceId)).toBe(textOf(sample, id(2, 1)))
    expect(ids(t)).toEqual([id(1, 1), id(1, 2), id(1, 3)])
    expect(ids(t, 2)).toEqual([id(1, 2), id(1, 3)])
  })

  it('flags a sentence the speaker passed without saying it', async () => {
    await speak(t, textOf(sample, id(1, 2))!)
    expect(t.view().current?.sentenceId).toBe(id(1, 3))
    expect(precedingSentences(sample, t.view(), 3)).toEqual([
      { sentenceId: id(1, 1), sectionId: sample.sections[0].id, skipped: true },
      { sentenceId: id(1, 2), sectionId: sample.sections[0].id, skipped: false }
    ])
  })

  it('is empty when everything has been said', () => {
    for (let k = 0; k < sample.sentences.length + 2; k++) t.next()
    expect(t.view().current).toBeNull()
    expect(ids(t)).toEqual([])
  })

  describe('while the display is held to a slide', () => {
    it('shows nothing from the previous slide', () => {
      t.setSlideScope(matchSlide(sample, { slide: 2 }))
      expect(t.view().current?.sentenceId).toBe(id(3, 1))
      expect(ids(t)).toEqual([])
      t.next()
      expect(ids(t)).toEqual([id(3, 1)])
    })

    it('keeps the last lines of a finished slide', () => {
      t.setSlideScope(matchSlide(sample, { slide: 1 }))
      for (let k = 0; k < 6; k++) t.next()
      expect(t.view().current).toBeNull()
      expect(ids(t)).toEqual([id(2, 1), id(2, 2), id(2, 3)])
    })
  })
})

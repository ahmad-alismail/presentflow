import { describe, expect, it } from 'vitest'
import { sample } from '../../../test/helpers'
import { parseScript } from './parse'
import { matchSlide, slideGroups, slideNumberOf, stripSlideNumber } from './slides'

describe('slide numbers in headings', () => {
  it.each([
    ['Folie 6 — AI Agent Safety', 6],
    ['Slide 12: Results', 12],
    ['Seite 3', 3],
    ['6 — Warum?', 6],
    ['7. Ausblick', 7],
    ['Zusammenfassung [9]', 9],
    ['Einleitung', null],
    ['2026 Strategie', null],
    ['3D-Druck', null]
  ])('%s → %s', (heading, n) => {
    expect(slideNumberOf(heading)).toBe(n)
  })

  it('strips the number prefix', () => {
    expect(stripSlideNumber('Folie 6 — AI Agent Safety')).toBe('AI Agent Safety')
    expect(stripSlideNumber('7. Ausblick')).toBe('Ausblick')
  })
})

describe('matchSlide', () => {
  it('maps by slide number in # slide headings (sample talk)', () => {
    const ids = matchSlide(sample, { slide: 2 })!
    expect(ids.map((id) => sample.sections.find((s) => s.id === id)!.title)).toEqual(['Testumgebung', 'Konkurrenz', 'Shutdown Resistance'])
    expect(matchSlide(sample, { slide: 9 })).toBeNull()
  })

  it('maps numbered single-level headings (imported speaker notes) to one section each', () => {
    const s = parseScript('# Folie 1 — Start\nHallo.\n\n# Folie 3 — Ergebnisse\nDie Zahlen.')
    expect(slideGroups(s)).toHaveLength(2)
    expect(matchSlide(s, { slide: 3 })).toEqual([s.sections[1].id])
    expect(matchSlide(s, { slide: 2 })).toBeNull() // slide without notes → no match
  })

  it('falls back to the slide title', () => {
    const s = parseScript('# Einstieg\n## A\nEins.\n# Ergebnisse der Studie\n## B\nZwei.')
    expect(matchSlide(s, { slide: 5, title: 'Ergebnisse der Studie' })).toEqual([s.sections[1].id])
    expect(matchSlide(s, { slide: 5, title: 'Ergebnisse' })).toEqual([s.sections[1].id])
  })

  it('falls back to order only when nothing is numbered and the counts agree', () => {
    const s = parseScript('# A\n## a\nEins.\n# B\n## b\nZwei.')
    expect(matchSlide(s, { slide: 2, count: 2 })).toEqual([s.sections[1].id])
    expect(matchSlide(s, { slide: 2, count: 5 })).toBeNull()
  })
})

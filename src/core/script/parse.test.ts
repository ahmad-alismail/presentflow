import fs from 'node:fs'
import { describe, expect, it } from 'vitest'
import { cleanInline, parseScript } from './parse'

describe('parseScript', () => {
  it('maps # to slides and ## to sections', () => {
    const s = parseScript('# Folie 1\n\n## A\nEins. Zwei.\n\n## B\nDrei.\n\n# Folie 2\n## C\nVier.')
    expect(s.slides.map((x) => x.title)).toEqual(['Folie 1', 'Folie 2'])
    expect(s.sections.map((x) => x.title)).toEqual(['A', 'B', 'C'])
    expect(s.sections[0].sentenceIds).toHaveLength(2)
    expect(s.sections[2].slideId).toBe(s.slides[1].id)
    expect(s.sentences.map((x) => x.text)).toEqual(['Eins.', 'Zwei.', 'Drei.', 'Vier.'])
  })
  it('treats a single heading level as sections', () => {
    const s = parseScript('## A\nEins.\n## B\nZwei.')
    expect(s.slides).toEqual([])
    expect(s.sections.map((x) => x.title)).toEqual(['A', 'B'])
  })
  it('creates a section for text directly under a slide heading', () => {
    const s = parseScript('# Einstieg\nHallo zusammen.\n# Teil 2\n## X\nText.')
    expect(s.sections.map((x) => x.title)).toEqual(['Einstieg', 'X'])
  })
  it('turns plain paragraphs into sections titled by their first words', () => {
    const s = parseScript('Erster Absatz mit vielen schönen Worten hier. Noch ein Satz.\n\nZweiter Absatz.')
    expect(s.sections).toHaveLength(2)
    expect(s.sections[0].title).toBe('Erster Absatz mit vielen schönen …')
    expect(s.sections[0].sentenceIds).toHaveLength(2)
  })
  it('treats list items and outline lines as separate points', () => {
    const s = parseScript('## Punkte\n- Erster Punkt\n- Zweiter Punkt\n\nZeile eins\nZeile zwei')
    expect(s.sentences.map((x) => x.text)).toEqual(['Erster Punkt', 'Zweiter Punkt', 'Zeile eins', 'Zeile zwei'])
  })
  it('joins soft-wrapped prose lines', () => {
    const s = parseScript('## A\nFür unsere Studie haben wir eine\nTestumgebung aufgebaut. Dann ging es los.')
    expect(s.sentences.map((x) => x.text)).toEqual([
      'Für unsere Studie haben wir eine Testumgebung aufgebaut.',
      'Dann ging es los.'
    ])
  })
  it('drops empty headings, comments and inline markdown', () => {
    const s = parseScript('## Leer\n## Voll\n<!-- Notiz -->\nDas ist **wichtig** und [hier](http://x) _kursiv_.')
    expect(s.sections.map((x) => x.title)).toEqual(['Voll'])
    expect(s.sentences[0].text).toBe('Das ist wichtig und hier kursiv.')
  })
  it('keeps ids stable when other parts change, unique for duplicates', () => {
    const a = parseScript('## A\nEins. Zwei.\n## B\nDrei.')
    const b = parseScript('## A\nNeu. Eins. Zwei.\n## B\nDrei.')
    expect(b.sentences.find((x) => x.text === 'Zwei.')!.id).toBe(a.sentences.find((x) => x.text === 'Zwei.')!.id)
    const d = parseScript('## A\nJa. Ja.')
    expect(new Set(d.sentences.map((x) => x.id)).size).toBe(2)
    expect(d.sentences[0].cueKey).toBe(d.sentences[1].cueKey)
  })
  it('parses the bundled sample talk', () => {
    const s = parseScript(fs.readFileSync('resources/sample-de.md', 'utf8'))
    expect(s.slides).toHaveLength(4)
    expect(s.sections).toHaveLength(9)
    expect(s.sentences).toHaveLength(27)
  })
  it('cleanInline strips emphasis but keeps hyphenated words', () => {
    expect(cleanInline('**KI-Agenten** und `Code`')).toBe('KI-Agenten und Code')
  })
})

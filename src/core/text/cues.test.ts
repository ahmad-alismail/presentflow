import fs from 'node:fs'
import { describe, expect, it } from 'vitest'
import { parseScript } from '../script/parse'
import { autoCue, computeIdf, extractKeywords, scriptVocabulary } from './cues'

const script = parseScript(fs.readFileSync('resources/sample-de.md', 'utf8'))
const texts = script.sentences.map((s) => s.text)
const idf = computeIdf(texts)

describe('cues', () => {
  it('extracts keywords verbatim from the sentence, in order', () => {
    const s = 'Das ist wichtig, weil künftig mehrere KI-Agenten über längere Zeit an komplexen Aufgaben arbeiten.'
    const kws = extractKeywords(s, idf)
    expect(kws.length).toBeGreaterThanOrEqual(3)
    expect(kws.length).toBeLessThanOrEqual(4)
    for (const k of kws) expect(s).toContain(k)
    const positions = kws.map((k) => s.indexOf(k))
    expect([...positions].sort((a, b) => a - b)).toEqual(positions)
  })
  it('keeps numbers and compounds', () => {
    const cue = autoCue('Drei von zwölf Agenten versuchten, die Abschaltung zu verzögern oder zu umgehen.', idf)
    expect(cue).toMatch(/zwölf|Drei/)
    expect(cue).toContain('Abschaltung')
    expect(autoCue('Wir untersuchen, ob sich KI-Agenten gegen das Abschalten absichern.', idf)).toContain('KI-Agenten')
  })
  it('builds a script vocabulary favouring technical terms', () => {
    const vocab = scriptVocabulary(texts)
    expect(vocab).toContain('KI-Agenten')
    expect(vocab).toContain('Kommandozeile')
    expect(vocab.length).toBeLessThanOrEqual(100)
  })
})

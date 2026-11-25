import { describe, expect, it } from 'vitest'
import { splitSentences } from './sentences'

describe('splitSentences', () => {
  it('splits ordinary German sentences', () => {
    expect(splitSentences('Guten Morgen. Wie geht es Ihnen? Mir geht es gut!')).toEqual([
      'Guten Morgen.',
      'Wie geht es Ihnen?',
      'Mir geht es gut!'
    ])
  })
  it('keeps abbreviations together', () => {
    expect(splitSentences('Das gilt z. B. für Agenten, d. h. für alle Systeme. Danach kommt mehr.')).toEqual([
      'Das gilt z. B. für Agenten, d. h. für alle Systeme.',
      'Danach kommt mehr.'
    ])
    expect(splitSentences('Laut Dr. Müller ist das bzw. war das wichtig. Ende.')).toHaveLength(2)
    expect(splitSentences('Es gibt Daten, Skripte usw. und mehr. Das reicht.')).toHaveLength(2)
  })
  it('keeps ordinals and dates together', () => {
    expect(splitSentences('Am 3. Mai beginnt die 2. Phase. Dann folgt Schritt 3.')).toEqual([
      'Am 3. Mai beginnt die 2. Phase.',
      'Dann folgt Schritt 3.'
    ])
  })
  it('handles decimals, quotes and ellipses', () => {
    expect(
      splitSentences('Der Wert ist 3.5 Prozent. Er sagte: „Das ist gut.“ Dann ging er… Weiter geht es.')
    ).toEqual(['Der Wert ist 3.5 Prozent.', 'Er sagte: „Das ist gut.“', 'Dann ging er…', 'Weiter geht es.'])
  })
  it('keeps text without terminal punctuation', () => {
    expect(splitSentences('Nur ein Stichpunkt ohne Punkt')).toEqual(['Nur ein Stichpunkt ohne Punkt'])
  })
  it('splits English', () => {
    expect(splitSentences('We test agents, e.g. coding agents. Results follow.')).toEqual([
      'We test agents, e.g. coding agents.',
      'Results follow.'
    ])
  })
})

import { describe, expect, it } from 'vitest'
import { contentTokens, tokenize, tokenSimilarity, TOKEN_MATCH } from './normalize'

const tok = (w: string) => tokenize(w)[0]

describe('normalize', () => {
  it('splits compounds and folds diacritics', () => {
    expect(tokenize('KI-Agenten über Größe').map((t) => t.folded)).toEqual(['ki', 'agenten', 'uber', 'grosse'])
  })
  it('maps number words to digits', () => {
    expect(tokenize('zwölf Agenten').map((t) => t.folded)).toEqual(['12', 'agenten'])
  })
  it('drops stopwords, fillers and single letters (Whisper writes "äh" as "E.")', () => {
    expect(contentTokens('E. Also, ähm, für unsere Studie haben wir M. eine Testumgebung').map((t) => t.surface)).toEqual([
      'Studie',
      'Testumgebung'
    ])
  })
  it('matches inflections, compounds and ASR slips', () => {
    expect(tokenSimilarity(tok('Agenten'), tok('Agent'))).toBe(1)
    expect(tokenSimilarity(tok('Abschaltung'), tok('abschalten'))).toBe(1)
    expect(tokenSimilarity(tok('Testumgebung'), tok('Umgebung'))).toBeGreaterThanOrEqual(TOKEN_MATCH)
    expect(tokenSimilarity(tok('Kommandozeile'), tok('Komandozeile'))).toBeGreaterThanOrEqual(TOKEN_MATCH)
  })
  it('does not match unrelated words', () => {
    expect(tokenSimilarity(tok('Agenten'), tok('Aufgaben'))).toBeLessThan(TOKEN_MATCH)
    expect(tokenSimilarity(tok('Daten'), tok('Taten'))).toBeLessThan(TOKEN_MATCH)
    expect(tokenSimilarity(tok('12'), tok('13'))).toBe(0)
  })
})

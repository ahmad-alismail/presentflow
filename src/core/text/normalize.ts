// Text normalization for fuzzy speech-to-script matching (German + English).

export interface Token {
  /** Original surface form (casing preserved). */
  surface: string
  /** Lowercased, diacritic-folded form. */
  folded: string
  /** Light stem of `folded`, used for exact-ish matching. */
  stem: string
  /** Character offset of the word in the source text. */
  start: number
}

const STOPWORDS = new Set(
  (
    // German function words
    'der die das den dem des ein eine einer eines einem einen und oder aber doch sondern denn weil dass ob wenn als wie ' +
    'ich du er sie es wir ihr mich mir dich dir sich uns euch ihn ihm ihnen ihre ihrer ihres ihrem ihren sein seine seiner ' +
    'seines seinem seinen mein meine meiner meines meinem meinen unser unsere unserer unseres unserem unseren euer eure ' +
    'dein deine dieser diese dieses diesem diesen jener jene jenes man was wer wo wann warum wieso welche welcher welches ' +
    'ist sind war waren bin bist seid wird werden wurde wurden worden hat haben hatte hatten habe hast kann können konnte ' +
    'konnten muss müssen musste mussten soll sollen sollte sollten will wollen wollte darf dürfen möchte möchten ' +
    'nicht kein keine keiner keinen keinem auch noch schon nur sehr so zu zum zur im in an am auf aus bei mit nach von vom ' +
    'vor über unter um durch für gegen ohne bis seit zwischen hier da dort dann jetzt nun mal wieder immer ganz mehr ' +
    'es gibt etwa bzw usw dabei damit dazu darin darauf davon dafür daher deshalb also halt eben ja nein ' +
    'gerade wirklich eigentlich einfach bereits natürlich vielleicht ziemlich etwas sehr ' +
    // English function words
    'the a an and or but because that if when as how what who where why which this these those it its is are was were be ' +
    'been being have has had do does did can could will would shall should may might must i you he she we they me him her ' +
    'us them my your his our their of to in on at by for with from into about over under than then there here not no so ' +
    'very just also too only'
  ).split(/\s+/)
)

/** Hesitations and filler words that carry no content. Whisper writes "äh"/"ähm" as "E."/"M.". */
const FILLERS = new Set(
  (
    'äh ähm öhm öh hm hmm mhm aeh aehm sozusagen genau quasi irgendwie naja okay ok ' +
    'uh um uhm erm like basically actually well right yeah'
  ).split(/\s+/)
)

const NUMBER_WORDS: Record<string, string> = {
  null: '0', eins: '1', zwei: '2', drei: '3', vier: '4', fünf: '5', sechs: '6', sieben: '7', acht: '8',
  neun: '9', zehn: '10', elf: '11', zwölf: '12', dreizehn: '13', vierzehn: '14', fünfzehn: '15', sechzehn: '16',
  siebzehn: '17', achtzehn: '18', neunzehn: '19', zwanzig: '20', dreißig: '30', vierzig: '40', fünfzig: '50',
  sechzig: '60', siebzig: '70', achtzig: '80', neunzig: '90', hundert: '100', tausend: '1000',
  zero: '0', two: '2', three: '3', four: '4', five: '5', six: '6', seven: '7', eight: '8', nine: '9',
  ten: '10', eleven: '11', twelve: '12', thirteen: '13', fourteen: '14', fifteen: '15', sixteen: '16',
  seventeen: '17', eighteen: '18', nineteen: '19', twenty: '20', thirty: '30', forty: '40', fifty: '50',
  sixty: '60', seventy: '70', eighty: '80', ninety: '90', hundred: '100', thousand: '1000'
}

/** Lowercase, fold diacritics (ä→a, ß→ss). */
export function fold(word: string): string {
  return word
    .toLowerCase()
    .replace(/ß/g, 'ss')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
}

const GERMAN_SUFFIXES = ['ungen', 'ung', 'ern', 'em', 'en', 'er', 'es', 'e', 'n', 's']
const ENGLISH_SUFFIXES = ['ing', 'ed', 'es', 's', 'ly']

/**
 * Deliberately light stemmer: strips one inflectional suffix so "Agenten"/"Agent",
 * "Abschaltung"/"abschalten" meet. Fuzzy matching covers the rest.
 */
export function stem(folded: string): string {
  if (/^\d+$/.test(folded)) return folded
  for (const suffixes of [GERMAN_SUFFIXES, ENGLISH_SUFFIXES]) {
    for (const s of suffixes) {
      if (folded.length - s.length >= 4 && folded.endsWith(s)) return folded.slice(0, -s.length)
    }
  }
  return folded
}

/** Splits text into word tokens. Hyphenated compounds yield their parts ("KI-Agenten" → KI, Agenten). */
export function tokenize(text: string): Token[] {
  return [...text.matchAll(/[\p{L}\p{N}]+(?:['’][\p{L}]+)?/gu)].map((m) => {
    const surface = m[0]
    const folded = NUMBER_WORDS[surface.toLowerCase()] ?? fold(surface)
    return { surface, folded, stem: stem(folded), start: m.index }
  })
}

export function isContentToken(t: Token): boolean {
  const lower = t.surface.toLowerCase()
  if (/^\d+$/.test(t.folded)) return true
  if (t.folded.length < 2) return false
  return !STOPWORDS.has(lower) && !FILLERS.has(lower)
}

/** Content-bearing tokens only (no stopwords, fillers, single letters). */
export function contentTokens(text: string): Token[] {
  return tokenize(text).filter(isContentToken)
}

function trigrams(s: string): Set<string> {
  const padded = ` ${s} `
  const out = new Set<string>()
  for (let i = 0; i < padded.length - 2; i++) out.add(padded.slice(i, i + 3))
  return out
}

const trigramCache = new Map<string, Set<string>>()
function cachedTrigrams(s: string): Set<string> {
  let t = trigramCache.get(s)
  if (!t) {
    t = trigrams(s)
    if (trigramCache.size > 20000) trigramCache.clear()
    trigramCache.set(s, t)
  }
  return t
}

/**
 * Similarity of two tokens in [0, 1]: 1 for equal stems, high for compound containment
 * ("Testumgebung" ⊃ "Umgebung"), otherwise character-trigram Dice (tolerates ASR spelling slips).
 */
export function tokenSimilarity(a: Token, b: Token): number {
  if (a.stem === b.stem || a.folded === b.folded) return 1
  const isNumA = /^\d+$/.test(a.folded)
  const isNumB = /^\d+$/.test(b.folded)
  if (isNumA || isNumB) return 0
  // Compound / prefix containment on stems and full forms ("Umgebung" ⊂ "Testumgebung", "zögern" ⊂ "verzögern").
  for (const [x, y] of [
    [a.stem, b.stem],
    [a.folded, b.folded]
  ]) {
    const [short, long] = x.length <= y.length ? [x, y] : [y, x]
    if (short.length >= 5 && (long.startsWith(short) || long.endsWith(short))) return 0.85
  }
  const ta = cachedTrigrams(a.stem)
  const tb = cachedTrigrams(b.stem)
  let shared = 0
  for (const g of ta) if (tb.has(g)) shared++
  return (2 * shared) / (ta.size + tb.size)
}

/** Minimum token similarity that counts as hearing a script word. */
export const TOKEN_MATCH = 0.72

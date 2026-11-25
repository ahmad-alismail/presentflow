// German/English-aware sentence splitting for presentation scripts.

const ABBREVIATIONS = new Set(
  (
    'z.b zb d.h dh u.a ua bzw ca usw etc vgl ggf evtl inkl bspw sog dr prof nr s abb kap tab str jh mio mrd ' +
    'i.d.r idr u.ä z.t zt o.ä e.g i.e vs mr mrs ms st no fig approx'
  ).split(' ')
)

/** Words after which "3." is an ordinal ("die 3. Folie", "am 2. Tag") rather than a sentence end. */
const ORDINAL_CONTEXT = new Set(
  'der die das den dem des am im zum zur vom beim ein eine einer einem einen ab bis seit vor nach zu jede jeder jedes'.split(' ')
)
const MONTHS = new Set(
  'januar februar märz april mai juni juli august september oktober november dezember jänner'.split(' ')
)

const TERMINATOR = /[.!?…]/
const CLOSERS = /["'“”„»«‘’)\]]/

/** Splits one paragraph of running text into sentences. */
export function splitSentences(paragraph: string): string[] {
  const text = paragraph.replace(/\s+/g, ' ').trim()
  if (!text) return []
  const out: string[] = []
  let start = 0
  for (let i = 0; i < text.length; i++) {
    if (!TERMINATOR.test(text[i])) continue
    // Swallow runs of terminators ("?!", "...") and closing quotes/brackets.
    let end = i + 1
    while (end < text.length && (TERMINATOR.test(text[end]) || CLOSERS.test(text[end]))) end++
    if (end < text.length && text[end] !== ' ') continue // decimals, "z.B.", URLs
    if (end >= text.length) break
    const next = text.slice(end + 1)
    if (text[i] === '.' && !isSentenceEnd(text.slice(start, i), next)) continue
    out.push(text.slice(start, end).trim())
    start = end + 1
    i = end
  }
  const rest = text.slice(start).trim()
  if (rest) out.push(rest)
  return out
}

function isSentenceEnd(before: string, after: string): boolean {
  const words = before.split(' ')
  const last = words[words.length - 1] ?? ''
  const prev = (words[words.length - 2] ?? '').toLowerCase()
  const nextWord = after.split(' ')[0] ?? ''
  if (ABBREVIATIONS.has(last.toLowerCase().replace(/[^\p{L}.]/gu, ''))) return false
  // Initials ("A. Müller") and spaced abbreviations ("z. B.", "d. h.", "u. a.").
  if (/^\p{L}$/u.test(last)) return false
  // Next sentence must start with an uppercase letter, digit or quote.
  if (/^\p{Ll}/u.test(nextWord)) return false
  if (/^\d{1,3}$/.test(last)) {
    if (MONTHS.has(nextWord.toLowerCase()) || ORDINAL_CONTEXT.has(prev)) return false
  }
  return true
}

// Whisper hallucination guards — transformers.js has none of Whisper's built-in thresholds.
const BLOCKLIST = /untertitel|zdf|amara\.org|copyright|vielen dank f(ü|ue)rs zuschauen|thanks? for watching|subtitles? by|swr ?\d|www\./i

export function cleanTranscript(raw: string, seconds: number): string {
  let text = raw.replace(/\s+/g, ' ').trim()
  if (!text || BLOCKLIST.test(text)) return ''
  const letters = text.replace(/[^\p{L}]/gu, '')
  const latin = letters.replace(/[^\p{Script=Latin}]/gu, '')
  if (letters.length && latin.length / letters.length < 0.7) return ''
  // Cut n-gram loops ("und dann und dann und dann …").
  const words = text.split(' ')
  for (let n = 1; n <= 4; n++) {
    for (let i = 0; i + n * 3 <= words.length; i++) {
      const gram = words.slice(i, i + n).join(' ').toLowerCase()
      let reps = 1
      while (words.slice(i + reps * n, i + (reps + 1) * n).join(' ').toLowerCase() === gram) reps++
      if (reps >= 3) {
        text = words.slice(0, i + n).join(' ')
        return text
      }
    }
  }
  if (text.length / Math.max(seconds, 0.5) > 45) return '' // far more text than audio
  return text
}


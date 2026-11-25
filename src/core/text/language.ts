import type { SpeechLanguage } from '@shared/types'

/** German or English, by counting very common function words. */
export function guessLanguage(text: string): SpeechLanguage {
  const de = (text.match(/\b(und|der|die|das|ist|nicht|wir|ich|mit|für|ein|eine|sie)\b/gi) ?? []).length
  const en = (text.match(/\b(and|the|is|not|we|with|for|this|that|you|are|of)\b/gi) ?? []).length
  return en > de ? 'en' : 'de'
}

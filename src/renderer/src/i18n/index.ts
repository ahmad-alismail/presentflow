import type { UiLanguage } from '@shared/types'
import { useApp } from '../store'
import { de, type Strings } from './de'
import { en } from './en'

const DICTS: Record<UiLanguage, Strings> = { de, en }

export type StringKey = keyof Strings

export function translate(lang: UiLanguage, key: StringKey, vars?: Record<string, string | number>): string {
  let s = DICTS[lang][key] ?? de[key]
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, String(v))
  return s
}

/** `const t = useT(); t('start')` — re-renders on language change. */
export function useT(): (key: StringKey, vars?: Record<string, string | number>) => string {
  const lang = useApp((s) => s.settings.uiLanguage)
  return (key, vars) => translate(lang, key, vars)
}

export function systemLanguage(): UiLanguage {
  return navigator.language.toLowerCase().startsWith('de') ? 'de' : 'en'
}

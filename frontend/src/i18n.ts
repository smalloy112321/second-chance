/**
 * Site language: English, Spanish, or Portuguese.
 *
 * Text is looked up by its English wording, so anything not yet translated simply shows in English.
 * Answers sent to the agents always stay in English underneath (the rules engine and agents get the
 * same input in every language); only what she reads changes. The agents are told separately to
 * write their own text (plan, explanations, coaching) in the chosen language.
 */
import { useSyncExternalStore } from 'react'

import { es } from './strings/es'
import { pt } from './strings/pt'

export type Lang = 'en' | 'es' | 'pt'
export const LANGS: { id: Lang; label: string }[] = [
  { id: 'en', label: 'English' },
  { id: 'es', label: 'Español' },
  { id: 'pt', label: 'Português' },
]

const DICTS: Record<Exclude<Lang, 'en'>, Record<string, string>> = { es, pt }
const KEY = 'scpp.lang'

let current: Lang = (() => {
  try {
    const v = localStorage.getItem(KEY)
    return v === 'es' || v === 'pt' ? v : 'en'
  } catch {
    return 'en'
  }
})()

if (typeof document !== 'undefined') document.documentElement.lang = current

export const getLang = (): Lang => current
const listeners = new Set<() => void>()

/** Re-renders the caller (the App root, so the whole site) when the language changes. */
export function useLang(): Lang {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn)
      return () => listeners.delete(fn)
    },
    () => current,
  )
}

export function setLang(lang: Lang): void {
  current = lang
  listeners.forEach((fn) => fn())
  try {
    localStorage.setItem(KEY, lang)
  } catch {
    /* preference just won't be remembered */
  }
  document.documentElement.lang = lang
}

/** Translate English text into the site language. `{name}` placeholders are filled from vars. */
export function t(english: string, vars?: Record<string, string | number>): string {
  const dict = current === 'en' ? undefined : DICTS[current]
  let out = dict?.[english] ?? english
  if (vars) for (const [k, v] of Object.entries(vars)) out = out.split(`{${k}}`).join(String(v))
  return out
}

/** For tests: which English strings a language is missing. */
export const missingIn = (lang: Exclude<Lang, 'en'>, keys: string[]) => keys.filter((k) => !(k in DICTS[lang]))

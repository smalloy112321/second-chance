/**
 * Makes the browser's Back and Forward buttons move between the app's screens.
 *
 * The site is one page, so moving between screens never told the browser anything and Back left
 * the site. Each piece of navigation state (which homepage choice, which question, results or plan,
 * Practice or not) registers a key here. When it changes we add a browser history entry holding
 * every key; when the user presses Back or Forward we read the key back and restore it.
 */
import { useEffect, useRef } from 'react'

type StepState = Record<string, unknown>

/** The value for `key` in a history entry, or `initial` if the entry doesn't have it. */
export function readStep<T>(state: unknown, key: string, initial: T): T {
  return state && typeof state === 'object' && key in (state as StepState) ? ((state as StepState)[key] as T) : initial
}

/** A history entry with `key` set to `value`, keeping every other key. */
export function withStep(state: unknown, key: string, value: unknown): StepState {
  return { ...(state && typeof state === 'object' ? (state as StepState) : {}), [key]: value }
}

type Options<T> = {
  /** Change the current entry instead of adding one (for steps Back should skip). */
  replace?: (value: T) => boolean
  /** Start a clean entry holding only this key (for a new homepage choice). */
  fresh?: boolean
  /** Called before Back/Forward changes the value. Return false to stay put. */
  allow?: (next: T, current: T) => boolean
}

export function useHistoryStep<T>(key: string, value: T, setValue: (v: T) => void, initial: T, options: Options<T> = {}) {
  const current = useRef(value)
  current.current = value
  const opts = useRef(options)
  opts.current = options
  const mounted = useRef(false)

  // Record changes the user makes in the app.
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true
      history.replaceState(withStep(history.state, key, value), '')
      return
    }
    if (Object.is(readStep(history.state, key, initial), value)) return // came from Back/Forward
    const next = withStep(opts.current.fresh ? null : history.state, key, value)
    if (opts.current.replace?.(value)) history.replaceState(next, '')
    else history.pushState(next, '')
  }, [key, value]) // eslint-disable-line react-hooks/exhaustive-deps

  // Follow the browser's Back and Forward buttons.
  useEffect(() => {
    const onPop = (e: PopStateEvent) => {
      const next = readStep(e.state, key, initial)
      if (Object.is(next, current.current)) return
      if (opts.current.allow && !opts.current.allow(next, current.current)) return
      setValue(next)
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [key]) // eslint-disable-line react-hooks/exhaustive-deps
}

/** The value this screen had in the current history entry, for a screen that is shown again. */
export const currentStep = <T,>(key: string, initial: T): T => readStep(history.state, key, initial)

/** Undo a Back press the app refused (moves forward to the entry we just left). */
export const stayHere = () => history.go(1)

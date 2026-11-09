/**
 * Keeps her answers, results, and plan in THIS browser tab only (sessionStorage), so a reload
 * doesn't lose them. Nothing new is stored on the server. Closing the tab clears it, and so does
 * "Clear my info" / "Clear the info" or going back to the homepage.
 */

const PREFIX = 'scpp.tab.'

export function loadTab<T>(key: string, fallback: T): T {
  try {
    const raw = sessionStorage.getItem(PREFIX + key)
    return raw === null ? fallback : (JSON.parse(raw) as T)
  } catch {
    return fallback
  }
}

export function saveTab(key: string, value: unknown): void {
  try {
    if (value === undefined || value === null) sessionStorage.removeItem(PREFIX + key)
    else sessionStorage.setItem(PREFIX + key, JSON.stringify(value))
  } catch {
    /* storage full or blocked: the app still works, it just won't survive a reload */
  }
}

/** Forget everything this tab kept (answers, results, plan, ticked steps). */
export function clearTab(): void {
  Object.keys(sessionStorage)
    .filter((k) => k.startsWith(PREFIX) || k.startsWith('plan-done:'))
    .forEach((k) => sessionStorage.removeItem(k))
}

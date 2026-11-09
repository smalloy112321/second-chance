/**
 * How the 30-day plan is laid out. Pure functions, testable with `node src/planDisplay.test.ts`.
 *
 * - Each week gets real dates, counted from the day the plan was made.
 * - Websites show as a short name ("ssa.gov"), not the full address.
 * - A program that appears in more than one step shows its full contact card only the first time;
 *   later steps point back to that week.
 */

export type StepLike = { step_id: string; resource_id: string | null }
export type WeekLike = { week: number; steps: StepLike[] }

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
let locale = 'en'
/** Month names follow the site language ("Nov 8", "8 nov", "8 de nov."). */
export const setDateLocale = (l: string) => { locale = l }
const fmt = (d: Date) =>
  locale === 'en' ? `${MONTHS[d.getMonth()]} ${d.getDate()}` : d.toLocaleDateString(locale, { month: 'short', day: 'numeric' })
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n)

/** "Nov 8 – Nov 14" for week 1 of a plan made on Nov 8. Week 4 runs to day 30. */
export function weekDates(week: number, start: Date): string {
  const first = addDays(start, (week - 1) * 7)
  const last = addDays(start, week === 4 ? 29 : week * 7 - 1)
  return `${fmt(first)} – ${fmt(last)}`
}

/** "Nov 8 – Dec 7" for the whole 30 days. */
export function planDates(start: Date): string {
  return `${fmt(start)} – ${fmt(addDays(start, 29))}`
}

/** "portal.ct.gov" instead of the full web address. */
export function shortUrl(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url.replace(/^https?:\/\/(www\.)?/, '').split('/')[0]
  }
}

/** For each step whose program already appeared earlier: the week it first appeared in. */
export function repeatedResources(weeks: WeekLike[]): Record<string, number> {
  const firstWeek: Record<string, number> = {}
  const repeats: Record<string, number> = {}
  for (const w of weeks) {
    for (const s of w.steps) {
      if (!s.resource_id) continue
      if (s.resource_id in firstWeek) repeats[s.step_id] = firstWeek[s.resource_id]
      else firstWeek[s.resource_id] = w.week
    }
  }
  return repeats
}

/** "Week 4, step 2 (Search for food service openings…)" for a step id like "w4s2". */
export type Tr = (english: string, vars?: Record<string, string | number>) => string
const same: Tr = (english, vars) => {
  let out = english
  if (vars) for (const [k, v] of Object.entries(vars)) out = out.split(`{${k}}`).join(String(v))
  return out
}

export function stepLabel(weeks: { week: number; steps: { step_id: string; action: string }[] }[], stepId: string | null, tr: Tr = same): string {
  if (!stepId) return ''
  for (const w of weeks) {
    const i = w.steps.findIndex((s) => s.step_id === stepId)
    if (i >= 0) {
      const a = w.steps[i].action
      return tr('Week {week}, step {n} ({action})', { week: w.week, n: i + 1, action: a.length > 60 ? a.slice(0, 57).trimEnd() + '…' : a })
    }
  }
  return ''
}

/** "3 of 10 steps done" */
export function progressText(done: number, total: number, tr: Tr = same): string {
  return total === 1 ? tr('{done} of {total} step done', { done, total }) : tr('{done} of {total} steps done', { done, total })
}

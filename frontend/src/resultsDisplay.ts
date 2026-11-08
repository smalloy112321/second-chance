/**
 * How Clean Slate results are worded on the results page. The rules engine decides every status
 * and date; this only decides what to show. Pure functions, testable with `node src/resultsDisplay.test.ts`.
 *
 * - Every conviction shows the same date line ("Convicted: 2012"). The questionnaire asks for the
 *   year only, so only years are shown (the month and day are estimates).
 * - A second line appears only when erasure is still in the future ("Expected to be erased: around 2030").
 * - For "waiting" statuses (on supervision, an open case, or an unfinished sentence) a past waiting
 *   date is never shown; a short note says what she's waiting on instead.
 */

export type RulesConvictionLike = {
  status: string
  eligible_on: string | null
  reason_code: string
  conviction_date?: string | null
}
export type RulesLike = { overall: string; convictions: RulesConvictionLike[] }
export type Tone = 'green' | 'blue' | 'gray' | 'amber' | 'neutral'

export const WAITING = new Set(['not_yet_supervision', 'not_yet_sentence'])

/** Plain-language answer for each status (shared by every results view). */
export const STATUS_LABEL: Record<string, { label: string; tone: Tone }> = {
  likely_erased: { label: 'Likely erased', tone: 'green' },
  likely_erased_cannabis: { label: 'Likely erased', tone: 'green' },
  partly_erased: { label: 'Partly erased', tone: 'green' },
  eligible_on: { label: 'Likely to be erased on a later date', tone: 'blue' },
  not_yet_supervision: { label: 'Likely erased after probation, parole, or an open case ends', tone: 'blue' },
  not_yet_sentence: { label: 'Likely erased after your sentence is finished', tone: 'blue' },
  petition: { label: 'Can be erased if you ask a court', tone: 'gray' },
  petition_pre_2000: { label: 'Can be erased if you ask a court', tone: 'gray' },
  petition_cannabis: { label: 'Can be erased if you ask a court', tone: 'gray' },
  needs_review: { label: 'Needs review', tone: 'amber' },
  not_eligible: { label: 'Likely not covered', tone: 'neutral' },
}

export const statusLabel = (status: string) => STATUS_LABEL[status] ?? { label: status, tone: 'neutral' as Tone }

const year = (iso: string | null | undefined) => (iso ? iso.slice(0, 4) : null)

const todayIso = (today: Date) =>
  `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`

/** True when a waiting conviction's waiting period is already over. */
export function waitPassed(c: RulesConvictionLike, today: Date = new Date()): boolean {
  return WAITING.has(c.status) && !!c.eligible_on && c.eligible_on <= todayIso(today)
}

/** The same first line under every conviction. */
export function convictedLine(c: RulesConvictionLike): string {
  const y = year(c.conviction_date)
  return y ? `Convicted: ${y}` : 'Convicted: year not sure'
}

/** A second line, only when erasure is still in the future (null otherwise). */
export function erasureLine(c: RulesConvictionLike, today: Date = new Date()): string | null {
  const future = !!c.eligible_on && c.eligible_on > todayIso(today)
  if (!future) return null
  if (c.status === 'eligible_on' || WAITING.has(c.status)) return `Expected to be erased: around ${year(c.eligible_on)}`
  return null
}

function whatShesWaitingOn(c: RulesConvictionLike): string {
  if (c.status === 'not_yet_sentence') return 'every part of your sentence is finished'
  return 'your probation or parole ends and any open case is closed'
}

/** A plain-language line for waiting statuses (null for everything else). */
export function waitingNote(c: RulesConvictionLike, today: Date = new Date()): string | null {
  if (!WAITING.has(c.status)) return null
  if (waitPassed(c, today)) {
    return `Your waiting period is over. This could be erased once ${whatShesWaitingOn(c)}, if you have no new convictions.`
  }
  return `This can only happen once ${whatShesWaitingOn(c)}.`
}

/**
 * The status for the big badge (caseworker view). The engine groups "waiting" under
 * "eligible_on"; when nothing is actually expected on a future date, show the waiting status.
 */
export function overallBadge(rules: RulesLike): string {
  if (rules.overall !== 'eligible_on') return rules.overall
  if (rules.convictions.some((c) => c.status === 'eligible_on')) return 'eligible_on'
  const waiting = rules.convictions.find((c) => WAITING.has(c.status))
  return waiting ? waiting.status : rules.overall
}

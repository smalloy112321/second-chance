/**
 * Helps caseworkers give the agents every fact the self-serve questionnaire collects.
 * Pure functions, testable with `node src/caseNotes.test.ts`.
 *
 * Free-text notes often leave out facts the rules engine needs (for example, whether a conviction
 * was a DUI). Those convictions then come back "Needs review". The template asks for every fact,
 * and the checklist shows which ones the notes don't mention yet.
 */

export const CASE_NOTES_TEMPLATE = `Client first name:
Town:
Conviction 1: what it was / misdemeanor or felony (and class, if a felony) / year it happened / year convicted / DUI? yes or no / cannabis possession? yes or no
Conviction 2:
Any conviction for family violence? yes or no
Any conviction for a sex offense? yes or no
On probation, parole, or special parole now? yes or no
Open criminal case in Connecticut now? yes or no
Finished every part of every sentence (prison, probation, parole)? yes or no
Children (how many, who they live with, any family court or DCF case):
Housing (tonight, and for the rest of this month):
IDs (state ID, birth certificate, Social Security card):
Work (working now? what work she wants):
Top 3 goals for the next 30 days:`

/** Each fact the agents need, and words that show the notes mention it. */
export const CHECKS: { label: string; pattern: RegExp }[] = [
  { label: 'Town', pattern: /\btown\b|\b(lives|living) in\b|, ct\b|connecticut|hartford|new haven|bridgeport|waterbury|stamford|new britain/i },
  { label: 'Conviction years', pattern: /\b(19|20)\d\d\b/ },
  { label: 'Misdemeanor or felony', pattern: /misdemeanor|felony/i },
  { label: 'DUI (yes or no)', pattern: /\bdui\b|\bdwi\b|driving under/i },
  { label: 'Cannabis possession (yes or no)', pattern: /cannabis|marijuana/i },
  { label: 'Family violence', pattern: /family violence|domestic/i },
  { label: 'Sex offense', pattern: /sex offen/i },
  { label: 'Probation or parole now', pattern: /probation|parole/i },
  { label: 'Open criminal case', pattern: /pending|open (criminal )?case|open charge/i },
  { label: 'Sentence finished', pattern: /sentence|finished probation|completed/i },
  { label: 'Children', pattern: /child|kids?\b|\bsons?\b|daughters?|no children/i },
  { label: 'Housing', pattern: /hous|staying|shelter|apartment|living with|homeless/i },
  { label: 'IDs', pattern: /\bids?\b|birth certificate|social security|license/i },
  { label: 'Goals', pattern: /goal|wants? to|interested in/i },
]

const TEMPLATE_LINES = new Set(CASE_NOTES_TEMPLATE.split('\n').map((l) => l.trim()))
const CONVICTION_HINT = CASE_NOTES_TEMPLATE.split('\n')[2].replace(/^Conviction 1:\s*/, '')

/** Facts the notes don't mention yet (empty notes: nothing listed). Template lines and hints that
 * are still unfilled don't count as mentioning a fact. */
export function notMentioned(notes: string): string[] {
  const text = notes
    .split('\n')
    .filter((line) => !TEMPLATE_LINES.has(line.trim()))
    .join('\n')
    .split(CONVICTION_HINT)
    .join('')
  if (!text.replace(/[A-Za-z0-9 ()?,/']*:\s*$/gm, '').trim()) return []
  return [...CHECKS.filter((c) => !c.pattern.test(text)).map((c) => c.label), ...convictionGaps(text)]
}

const YEAR = /\b(19|20)\d\d\b/g
const OFFENSE_YEAR = /(offen[cs]e|happened|arrest\w*|incident|committed)\D{0,25}\b(19|20)\d\d\b/i
const CONVICTED_YEAR = /(convict\w*|sentenc\w*|plea\w*|pled)\D{0,25}\b(19|20)\d\d\b/i

/** Each conviction in the notes: "(1) ... (2) ..." items, or "Conviction 1: ..." lines. */
export function convictionSegments(text: string): string[] {
  const lines = text.split('\n').filter((l) => /^\s*conviction\s*\d+\s*:/i.test(l))
  if (lines.length) return lines.map((l) => l.replace(/^\s*conviction\s*\d+\s*:\s*/i, '')).filter((l) => l.trim())
  const parts = text.split(/\(\d\)/)
  if (parts.length < 2) return []
  // The last item runs to the end of its line (the notes go on to other facts after it).
  return parts.slice(1).map((p, i, all) => (i === all.length - 1 ? p.split('\n')[0] : p))
}

/** What each conviction is missing: "Conviction 3: year it happened". */
export function convictionGaps(text: string): string[] {
  const gaps: string[] = []
  convictionSegments(text).forEach((seg, i) => {
    const years = seg.match(YEAR) ?? []
    const missing: string[] = []
    if (!/misdemeanor|felony/i.test(seg)) missing.push('misdemeanor or felony')
    if (years.length === 0) missing.push('year it happened', 'year convicted')
    else if (years.length === 1) {
      if (CONVICTED_YEAR.test(seg) && !OFFENSE_YEAR.test(seg)) missing.push('year it happened')
      else if (OFFENSE_YEAR.test(seg) && !CONVICTED_YEAR.test(seg)) missing.push('year convicted')
      else if (!OFFENSE_YEAR.test(seg) && !CONVICTED_YEAR.test(seg)) missing.push('year it happened and year convicted (or say they were the same year)')
    }
    if (missing.length) gaps.push(`Conviction ${i + 1}: ${missing.join(', ')}`)
  })
  return gaps
}

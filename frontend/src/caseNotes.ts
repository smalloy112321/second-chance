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
  return CHECKS.filter((c) => !c.pattern.test(text)).map((c) => c.label)
}

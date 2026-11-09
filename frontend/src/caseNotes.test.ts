// Run with: node src/caseNotes.test.ts
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { CASE_NOTES_TEMPLATE, notMentioned } from './caseNotes.ts'

// The notes from the live caseworker run (Nov 8, 2026) that came back "Needs review" for every conviction.
const DENISE = `Client: Denise R., 34, New Haven. Released from York CI in March 2025.
Convictions: (1) Larceny 6th degree, misdemeanor, offense 2011, convicted 2011. (2) Possession of narcotics, class D felony, offense June 2016, convicted Jan 2017. (3) Breach of peace 2nd degree, misdemeanor, convicted 2022 - not family violence.
No sex offenses. No family violence on any charge.
Currently on probation until Sept 2027 for the 2022 case. No pending charges. Has not finished probation.
Two children (ages 6 and 9) living with her mother in Hamden. Open DCF case; she wants more visitation. Family court date next month.
Housing: staying with a friend in New Haven, can stay through end of the month only.
IDs: has birth certificate and Social Security card, no state ID.
Not working. Interested in CNA training or warehouse work.
Goals: get a state ID, find stable housing, increase visits with her kids.`

test('the live notes that failed are missing DUI, cannabis, and conviction 3\'s offense year', () => {
  assert.deepEqual(notMentioned(DENISE), ['DUI (yes or no)', 'Cannabis possession (yes or no)', 'Conviction 3: year it happened'])
  assert.deepEqual(notMentioned(DENISE + '\nNone of the convictions were DUI or cannabis.'), ['Conviction 3: year it happened'])
  const fixed = DENISE.replace('convicted 2022 - not family violence', 'offense 2021, convicted 2022 - not family violence')
  assert.deepEqual(notMentioned(fixed + '\nNone of the convictions were DUI or cannabis.'), [])
})

test('an empty box or an unfilled template lists nothing yet', () => {
  assert.deepEqual(notMentioned(''), [])
  assert.deepEqual(notMentioned(CASE_NOTES_TEMPLATE), [])
})

test('the template hint words do not count as answers', () => {
  const partly = CASE_NOTES_TEMPLATE.replace('Town:', 'Town: Hartford')
  const missing = notMentioned(partly)
  assert.ok(!missing.includes('Town'))
  assert.ok(missing.includes('DUI (yes or no)'))
  assert.ok(missing.includes('Family violence'))
})

test('template lines are checked one conviction at a time', () => {
  const notes = CASE_NOTES_TEMPLATE
    .replace(/^Conviction 1:.*$/m, 'Conviction 1: shoplifting / misdemeanor / happened 2012 / convicted 2012 / DUI no / cannabis no')
    .replace(/^Conviction 2:.*$/m, 'Conviction 2: drug sale, 2016')
  const gaps = notMentioned(notes).filter((g) => g.startsWith('Conviction'))
  assert.deepEqual(gaps, ['Conviction 2: misdemeanor or felony, year it happened and year convicted (or say they were the same year)'])
})

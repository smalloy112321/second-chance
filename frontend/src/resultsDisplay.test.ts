// Run with: node src/resultsDisplay.test.ts
// Cases are real rules-engine output (backend/rules/clean_slate.py) for today = 2026-11-08.
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { convictedLine, erasureLine, overallBadge, statusLabel, waitingNote } from './resultsDisplay.ts'

const TODAY = new Date(2026, 10, 8)

const erased = { status: 'likely_erased', eligible_on: '2019-07-01', reason_code: 'MISD_7YR_MET', conviction_date: '2012-07-01' }
const cannabis = { status: 'likely_erased_cannabis', eligible_on: null, reason_code: 'CANNABIS_AUTO_ERASED_2023', conviction_date: '2010-07-01' }
const later = { status: 'eligible_on', eligible_on: '2030-07-01', reason_code: 'FELONY_10YR_NOT_MET', conviction_date: '2014-07-01' }
const notCovered = { status: 'not_eligible', eligible_on: null, reason_code: 'FELONY_CLASS_NOT_COVERED', conviction_date: '2010-07-01' }
const onProbation = { status: 'not_yet_supervision', eligible_on: '2024-07-01', reason_code: 'SUPERVISION_OR_PENDING', conviction_date: '2017-07-01' }
const onProbationFuture = { status: 'not_yet_supervision', eligible_on: '2029-07-01', reason_code: 'SUPERVISION_OR_PENDING', conviction_date: '2022-07-01' }
const sentenceOpen = { status: 'not_yet_sentence', eligible_on: '2024-07-01', reason_code: 'SENTENCE_NOT_COMPLETE', conviction_date: '2017-07-01' }
const unknownYear = { status: 'needs_review', eligible_on: null, reason_code: 'NEEDS_REVIEW_DATE_UNKNOWN', conviction_date: null }

test('every conviction gets the same "Convicted: YEAR" line', () => {
  for (const c of [erased, cannabis, later, notCovered, onProbation]) assert.match(convictedLine(c), /^Convicted: \d{4}$/)
  assert.equal(convictedLine(erased), 'Convicted: 2012')
  assert.equal(convictedLine(unknownYear), 'Convicted: year not sure')
})

test('a second line appears only when erasure is still in the future', () => {
  assert.equal(erasureLine(later, TODAY), 'Expected to be erased: around 2030')
  assert.equal(erasureLine(onProbationFuture, TODAY), 'Expected to be erased: around 2029')
  for (const c of [erased, cannabis, notCovered, onProbation, unknownYear]) assert.equal(erasureLine(c, TODAY), null)
})

test('answer labels are plain and consistent', () => {
  assert.equal(statusLabel('likely_erased').label, 'Likely erased')
  assert.equal(statusLabel('likely_erased_cannabis').label, 'Likely erased')
  assert.equal(statusLabel('not_eligible').label, 'Likely not covered')
  assert.equal(statusLabel('eligible_on').label, 'Likely to be erased on a later date')
  assert.equal(statusLabel('not_yet_supervision').label, 'Likely erased once probation or parole ends')
  assert.equal(statusLabel('petition_pre_2000').label, 'Can be erased if you ask a court')
})

test('label colors: later date and court petition are green, not covered is red', () => {
  assert.equal(statusLabel('eligible_on').tone, 'green')
  assert.equal(statusLabel('petition_pre_2000').tone, 'green')
  assert.equal(statusLabel('not_eligible').tone, 'red')
})

test('a past waiting date is never shown; the note says what she is waiting on', () => {
  assert.match(waitingNote(onProbation, TODAY)!, /^Your waiting period is over\. This could be erased once your probation or parole ends/)
  assert.match(waitingNote(onProbationFuture, TODAY)!, /only happen once your probation or parole ends/)
  assert.match(waitingNote(sentenceOpen, TODAY)!, /every part of your sentence is finished/)
  assert.equal(waitingNote(later, TODAY), null)
})

test('the caseworker badge says waiting, not "later date", when nothing is expected later', () => {
  assert.equal(overallBadge({ overall: 'eligible_on', convictions: [onProbation] }), 'not_yet_supervision')
  assert.equal(overallBadge({ overall: 'eligible_on', convictions: [later] }), 'eligible_on')
  assert.equal(overallBadge({ overall: 'likely_erased', convictions: [erased] }), 'likely_erased')
})

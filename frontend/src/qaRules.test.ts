// Run with: node src/qaRules.test.ts   (Node 22.6+ runs TypeScript directly)
// Questions below are the intake agent's real wording from a test session on Nov 8, 2026.
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { HOUSING, LEVEL, YES_NO, answerChoices, splitQuestion } from './qaRules.ts'

const yesNo = [
  'Are you on probation, parole, or special parole right now?',
  'Do you have any open or pending criminal case in Connecticut right now?',
  'Have you finished every part of any sentence you received, including prison, probation, or parole?',
  'Was the shoplifting conviction related to family violence or a sex offense?',
  'Just to be sure, do you mean you were not convicted of the shoplifting charge?',
]
const textOnly = [
  'What town do you live in now, or plan to live in?',
  'What convictions have you had?',
  // Either/or questions: "Yes" or "No" doesn't answer these.
  'Did the shoplifting charge lead to a conviction, or is it still open or not decided?',
  'Are you saying your children live in New Haven, or were you confirming your town?',
  // Asks for details buttons can't give.
  'For the shoplifting case, do you know whether it led to a conviction, and about what year the incident or conviction happened?',
  'How many children do you have, and what are their ages?',
  'Which of these do you have: a state ID or driver’s license, your birth certificate, and your Social Security card?',
  'What income do you have coming in now, if any?',
  'What are your top one to three goals for the next 30 days?',
]

test('yes/no questions get Yes / No / Not sure', () => {
  for (const q of yesNo) assert.deepEqual(answerChoices(q), YES_NO, q)
})

test('either/or and detail questions get only the text box', () => {
  for (const q of textOnly) assert.deepEqual(answerChoices(q), [], q)
})

test('housing and misdemeanor/felony questions get their own choices', () => {
  assert.deepEqual(
    answerChoices('Where will you stay tonight and for most of this month: stable housing, with family or friends, a shelter, outside, or a transitional program?'),
    HOUSING,
  )
  assert.deepEqual(answerChoices('Was it a misdemeanor or a felony?'), LEVEL)
})

test('splitQuestion keeps the question and drops the "skip is okay" line', () => {
  const r = splitQuestion(
    'Thanks. Are you on probation, parole, or special parole right now? “I don’t know” or “skip” is okay. This helps me check your record.',
  )
  assert.equal(r.question, 'Are you on probation, parole, or special parole right now?')
  assert.equal(r.note, 'Thanks. This helps me check your record.')
})

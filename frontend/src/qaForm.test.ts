// Run with: node src/qaForm.test.ts
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { GOALS_QUESTION, QUESTIONS, buildAnswerMessage, emptyAnswers, isAnswered, nameForQuestions, type Answers } from './qaForm.ts'

function sample(): Answers {
  return {
    ...emptyAnswers(),
    firstName: 'Maria',
    town: 'Hartford',
    state: 'Connecticut',
    convictions: [
      { type: 'Shoplifting or theft (larceny)', level: 'Misdemeanor', felonyClass: '', underFive: '', yearHappened: '2012', yearConvicted: '2012' },
      { type: 'DUI (driving under the influence)', level: 'Misdemeanor', felonyClass: '', underFive: '', yearHappened: '2015', yearConvicted: '2015' },
    ],
    familyViolence: 'No', sexOffense: 'No', probation: 'No', pending: 'No', finished: 'Yes',
    kids: 'Yes', kidsCount: '1', kidsWith: 'With family', familyCourt: 'No',
    housingTonight: 'With family or friends', housingMonth: 'With family or friends',
    ids: ['Birth certificate'], working: 'No', workWant: 'food service', goals: ['Get an ID', 'Apply for SNAP', ''],
  }
}

test('required questions match what the intake agent needs (items 1-7)', () => {
  assert.deepEqual(
    QUESTIONS.filter((q) => q.required).map((q) => q.id),
    ['where', 'convictions', 'familyViolence', 'sexOffense', 'probation', 'pending', 'finished', 'kids', 'housing'],
  )
  assert.deepEqual(QUESTIONS.filter((q) => !q.required).map((q) => q.id), ['name', 'ids', 'work'])
  assert.equal(GOALS_QUESTION.id, 'goals') // asked after the record check, before the plan
})

test('"I\'m not sure" counts as an answer, a blank does not', () => {
  const a = sample()
  assert.equal(isAnswered('probation', { ...a, probation: "I'm not sure" }), true)
  assert.equal(isAnswered('probation', { ...a, probation: '' }), false)
  assert.equal(isAnswered('where', { ...a, state: '' }), false)
  assert.equal(isAnswered('kids', { ...a, kidsWith: '' }), false) // "Yes" needs the details
  assert.equal(isAnswered('kids', { ...a, kids: 'No', kidsCount: '', kidsWith: '', familyCourt: '' }), true)
})

test('the message states every required item, including DUI and cannabis per conviction', () => {
  const m = buildAnswerMessage(sample())
  for (const needle of [
    'First name: Maria',
    'Where I live: Hartford, Connecticut',
    'Conviction 1: Shoplifting or theft (larceny). Level: Misdemeanor. Year it happened: 2012. Year I was convicted: 2012. DUI: no. Cannabis possession: no.',
    'Conviction 2: DUI (driving under the influence). Level: Misdemeanor. Year it happened: 2015. Year I was convicted: 2015. DUI: yes. Cannabis possession: no.',
    'family violence: No',
    'sex offense: No',
    'On probation, parole, or special parole right now: No',
    'Open criminal case in Connecticut right now: No',
    'Finished every part of every sentence (prison, probation, parole): Yes',
    'Children: yes, 1. They live: With family. Family court case: No.',
    "Where I'm staying tonight: With family or friends",
    "Where I'll stay for the rest of this month: With family or friends",
    'IDs I have: Birth certificate',
    'Working now: no. Work I want: food service',
    'Top goals for the next 30 days: (1) Get an ID (2) Apply for SNAP',
  ]) {
    assert.ok(m.includes(needle), `missing: ${needle}\n---\n${m}`)
  }
})

test('"I\'d rather not say" leaves DUI and cannabis as not sure instead of guessing', () => {
  const a = sample()
  a.convictions = [{ type: "I'd rather not say", level: "I'm not sure", felonyClass: '', underFive: '', yearHappened: "I'm not sure", yearConvicted: "I'm not sure" }]
  const m = buildAnswerMessage(a)
  assert.ok(m.includes("DUI: I'm not sure. Cannabis possession: I'm not sure."), m)
})

test('work: picking Yes or No counts, even with the follow-up box empty', () => {
  const a = { ...sample(), working: 'Yes', workWhere: '' }
  assert.equal(isAnswered('work', a), true)
  assert.ok(buildAnswerMessage(a).includes('Working now: yes\n'), buildAnswerMessage(a))
})

test('skipped optional questions are said to be skipped', () => {
  const a = { ...sample(), firstName: '', ids: [], working: '', goals: ['', '', ''] as Answers['goals'] }
  const m = buildAnswerMessage(a)
  for (const s of ['First name: skipped', 'IDs I have: skipped', 'Working now: skipped', 'Top goals for the next 30 days: asked later, after the record check']) {
    assert.ok(m.includes(s), s)
  }
})

test('felony: the class is required, and the 5-year question only when the class is unknown', () => {
  const felony = { type: 'Drug sale', level: 'Felony', felonyClass: '', underFive: '', yearHappened: '2014', yearConvicted: '2014' }
  const a = { ...sample(), convictions: [felony] }
  assert.equal(isAnswered('convictions', a), false) // class missing
  a.convictions = [{ ...felony, felonyClass: 'Class D' }]
  assert.equal(isAnswered('convictions', a), true) // known class: no 5-year question
  assert.ok(buildAnswerMessage(a).includes('Level: Felony. Felony class: Class D. Year it happened'), buildAnswerMessage(a))
  a.convictions = [{ ...felony, felonyClass: "I'm not sure" }]
  assert.equal(isAnswered('convictions', a), false) // needs the 5-year answer
  a.convictions = [{ ...felony, felonyClass: "I'm not sure", underFive: 'Yes' }]
  assert.equal(isAnswered('convictions', a), true)
  assert.ok(buildAnswerMessage(a).includes("Felony class: I'm not sure. Longest possible sentence was under 5 years: Yes."), buildAnswerMessage(a))
})

test('later questions use her first name once she gives it', () => {
  assert.equal(nameForQuestions({ ...sample(), firstName: '  Maria Lopez ' }), 'Maria')
  assert.equal(nameForQuestions({ ...sample(), firstName: '' }), '')
  for (const q of QUESTIONS.slice(1)) assert.ok(q.named?.includes('{name}'), q.id)
})

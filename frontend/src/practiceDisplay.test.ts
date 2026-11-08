// Run with: node src/practiceDisplay.test.ts
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { withoutUnansweredQuestion } from './practiceDisplay.ts'

const q1 = { kind: 'partner', text: 'Is there anything in your background we should talk about?' }
const a1 = { kind: 'me', text: 'I had a conviction in 2014.' }
const q2 = { kind: 'partner', text: 'What parts of that work did you enjoy most?' }

test('the last question is hidden once she ends, if she never answered it', () => {
  assert.deepEqual(withoutUnansweredQuestion([q1, a1, q2]), [q1, a1])
})

test('nothing is hidden when her answer is last, or before she has answered anything', () => {
  assert.deepEqual(withoutUnansweredQuestion([q1, a1]), [q1, a1])
  assert.deepEqual(withoutUnansweredQuestion([q1]), [q1])
})

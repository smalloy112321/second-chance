// Run with: node src/historyStep.test.ts
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { readStep, withStep } from './historyStep.ts'

test('a history entry keeps every screen key; missing keys fall back to the start', () => {
  const e = withStep(withStep(null, 'entry', 'self_serve:plan'), 'stage', 3)
  assert.deepEqual(e, { entry: 'self_serve:plan', stage: 3 })
  assert.equal(readStep(e, 'stage', 'intro'), 3)
  assert.equal(readStep(e, 'results', 'slate'), 'slate')
  assert.equal(readStep(null, 'entry', null), null) // the homepage entry has no keys
  assert.deepEqual(withStep(e, 'stage', 4), { entry: 'self_serve:plan', stage: 4 })
})

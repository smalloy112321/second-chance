// Run with: node src/planDisplay.test.ts
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { planDates, progressText, repeatedResources, shortUrl, weekDates } from './planDisplay.ts'

const START = new Date(2026, 10, 8) // Nov 8, 2026

test('weeks get real dates; week 4 ends on day 30', () => {
  assert.equal(weekDates(1, START), 'Nov 8 – Nov 14')
  assert.equal(weekDates(2, START), 'Nov 15 – Nov 21')
  assert.equal(weekDates(3, START), 'Nov 22 – Nov 28')
  assert.equal(weekDates(4, START), 'Nov 29 – Dec 7')
  assert.equal(planDates(START), 'Nov 8 – Dec 7')
})

test('websites show as a short name', () => {
  assert.equal(shortUrl('https://portal.ct.gov/dss/snap/supplemental-nutrition-assistance-program---snap/apply'), 'portal.ct.gov')
  assert.equal(shortUrl('https://www.ssa.gov/number-card/replace-card'), 'ssa.gov')
  assert.equal(shortUrl('https://cpa-ct.org/reentry-services-2/'), 'cpa-ct.org')
})

test('a program used twice shows its full card only the first time', () => {
  const weeks = [
    { week: 1, steps: [{ step_id: 'w1s1', resource_id: 'hartford-reentry-welcome-center' }, { step_id: 'w1s2', resource_id: 'ssa' }] },
    { week: 2, steps: [{ step_id: 'w2s1', resource_id: null }, { step_id: 'w2s2', resource_id: 'hartford-reentry-welcome-center' }] },
  ]
  assert.deepEqual(repeatedResources(weeks), { w2s2: 1 })
})

test('progress text', () => {
  assert.equal(progressText(0, 10), '0 of 10 steps done')
  assert.equal(progressText(1, 1), '1 of 1 step done')
})

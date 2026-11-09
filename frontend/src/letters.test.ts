// Run with: node src/letters.test.ts
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { letterForLink, letterText } from './letters.ts'

const TODAY = new Date(2026, 10, 9)

test('each official form gets the right template', () => {
  assert.equal(letterForLink('https://portal.ct.gov/-/media/DESPP/reports_and_records/DPS0846CCriminalHistoryRecordRequestFormRev120117pdf.pdf'), 'record_request')
  assert.equal(letterForLink('https://portal.ct.gov/-/media/DESPP/CSP/SPBI/Clean-Slate/DESPP-CS-Hearing-Form.pdf'), 'hearing_email')
  assert.equal(letterForLink('https://portal.ct.gov/bopp'), null)
})

test('what we know is filled in; the rest is left in [brackets]', () => {
  const record = letterText('record_request', { firstName: 'Maria', today: TODAY })
  assert.match(record, /^Maria \[last name\]\n/)
  assert.ok(record.includes('November 9, 2026'))
  assert.ok(record.includes('form DPS-0846-C'))
  assert.ok(record.includes('Date of birth: [MM/DD/YYYY]'))

  const email = letterText('hearing_email', { convictions: [{ description: 'Drug sale', year: '2014' }], today: TODAY })
  assert.ok(email.startsWith('To: DESPP.cshearing@ct.gov\nSubject: Request for a Clean Slate erasure hearing'))
  assert.ok(email.includes('- Drug sale, convicted in 2014'))
  assert.ok(email.includes('[Your full name]'))
})

test('no name or convictions: every blank is a bracket', () => {
  const email = letterText('hearing_email', { today: TODAY })
  assert.ok(email.includes('- [Conviction, year convicted, and court and docket number if you know them]'))
})

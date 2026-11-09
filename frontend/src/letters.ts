/**
 * Fill-in templates for the two things the app asks her to send (user test, Nov 9, 2026):
 *  - a cover letter to mail with form DPS-0846-C (her official record from the State Police)
 *  - an email to DESPP with the Clean Slate hearing form
 * The letters stay in English, because they go to Connecticut state offices. What we know (her first
 * name, the conviction and year) is filled in; everything else is a [bracket] for her to fill.
 * Pure functions, testable with `node src/letters.test.ts`.
 */

export type LetterKind = 'record_request' | 'hearing_email'
export type LetterInput = {
  firstName?: string
  convictions?: { description: string; year: string | null }[]
  today?: Date
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const longDate = (d: Date) => `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`

/** Which template goes with an official link (by the form it links to). */
export function letterForLink(url: string): LetterKind | null {
  if (/DPS0846/i.test(url)) return 'record_request'
  if (/Hearing-Form/i.test(url)) return 'hearing_email'
  return null
}

export function letterText(kind: LetterKind, input: LetterInput = {}): string {
  const name = input.firstName?.trim() ? `${input.firstName.trim()} [last name]` : '[Your full name]'
  const date = longDate(input.today ?? new Date())
  if (kind === 'record_request') {
    return [
      name,
      '[Street address]',
      '[City, State ZIP code]',
      '[Phone number]',
      '',
      date,
      '',
      'Connecticut State Police',
      'State Police Bureau of Identification',
      '[Mailing address printed on form DPS-0846-C]',
      '',
      'Re: Request for a copy of my criminal history record',
      '',
      'To whom it may concern:',
      '',
      'I am requesting a copy of my Connecticut criminal history record. I have enclosed my completed form DPS-0846-C, the fee, and everything else the form asks for.',
      '',
      'Please mail my record to the address above. If you have any questions, you can reach me at [phone number].',
      '',
      'Thank you,',
      '',
      '[Signature]',
      name,
      'Date of birth: [MM/DD/YYYY]',
    ].join('\n')
  }
  const list = input.convictions?.length
    ? input.convictions.map((c) => `- ${c.description}${c.year ? `, convicted in ${c.year}` : ''} [court and docket number, if you know them]`)
    : ['- [Conviction, year convicted, and court and docket number if you know them]']
  return [
    'To: DESPP.cshearing@ct.gov',
    'Subject: Request for a Clean Slate erasure hearing',
    '',
    'To DESPP Legal Affairs:',
    '',
    'I am requesting a hearing under Connecticut’s Clean Slate law. My official criminal history record from the State Police, dated [date printed on your record], still shows the following conviction(s), which I believe should have been erased automatically:',
    '',
    ...list,
    '',
    'I have attached the completed Clean Slate hearing form and a copy of my record.',
    '',
    'You can reach me at [phone number] or [email address].',
    '',
    'Thank you,',
    name,
    'Date of birth: [MM/DD/YYYY]',
  ].join('\n')
}

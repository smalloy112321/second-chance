/**
 * The self-serve questionnaire: a fixed list of questions answered on the page, then sent to the
 * intake agent as ONE message (the same way caseworker notes are sent). The backend agents are
 * unchanged. Pure functions only, so this can be tested with plain Node.
 *
 * Required questions are exactly what the intake agent needs before it stops asking
 * (backend/prompts/intake.md items 1-7). Name, IDs, work, and goals are optional.
 */

export type Conviction = {
  type: string
  level: string
  felonyClass: string // only for felonies
  underFive: string // only when the felony class is unclassified or unknown
  yearHappened: string
  yearConvicted: string
}

export type Answers = {
  firstName: string
  town: string
  state: string
  convictions: Conviction[]
  familyViolence: string
  sexOffense: string
  probation: string
  pending: string
  finished: string
  kids: string
  kidsCount: string
  kidsWith: string
  familyCourt: string
  housingTonight: string
  housingMonth: string
  ids: string[]
  working: string
  workWhere: string
  workWant: string
  goals: [string, string, string]
}

export const NOT_SURE = "I'm not sure"
export const YES_NO = ['Yes', 'No', NOT_SURE]

export const CONVICTION_TYPES = [
  'Shoplifting or theft (larceny)',
  'Drug possession',
  'Drug sale',
  'Cannabis (marijuana) possession',
  'DUI (driving under the influence)',
  'Assault',
  'Breach of peace or disorderly conduct',
  'Robbery or burglary',
  'Prostitution',
  'Other',
  "I'd rather not say",
]
export const LEVELS = ['Misdemeanor', 'Felony', NOT_SURE]
// Only class D and E felonies (and some unclassified ones) can be erased under Clean Slate.
export const FELONY_CLASSES = ['Class A', 'Class B', 'Class C', 'Class D', 'Class E', 'Unclassified', NOT_SURE]
export const needsSentenceQuestion = (c: Conviction) => c.level === 'Felony' && (c.felonyClass === 'Unclassified' || c.felonyClass === NOT_SURE)
export const YEARS = [...Array.from({ length: 2026 - 1970 + 1 }, (_, i) => String(2026 - i)), NOT_SURE]
export const HOUSING = ['My own place', 'With family or friends', 'A shelter', 'A program or halfway house', 'Nowhere safe tonight']
export const HOUSING_MONTH = ['My own place', 'With family or friends', 'A shelter', 'A program or halfway house', 'I don’t have a place yet', NOT_SURE]
export const KIDS_COUNT = ['1', '2', '3', '4', '5', '6 or more']
export const KIDS_WITH = ['With me', 'With family', 'In foster care or with DCF', 'Somewhere else', NOT_SURE]
export const IDS = ['State ID or driver’s license', 'Birth certificate', 'Social Security card']
export const STATES = [
  'Connecticut', 'Alabama', 'Alaska', 'Arizona', 'Arkansas', 'California', 'Colorado', 'Delaware',
  'District of Columbia', 'Florida', 'Georgia', 'Hawaii', 'Idaho', 'Illinois', 'Indiana', 'Iowa', 'Kansas',
  'Kentucky', 'Louisiana', 'Maine', 'Maryland', 'Massachusetts', 'Michigan', 'Minnesota', 'Mississippi',
  'Missouri', 'Montana', 'Nebraska', 'Nevada', 'New Hampshire', 'New Jersey', 'New Mexico', 'New York',
  'North Carolina', 'North Dakota', 'Ohio', 'Oklahoma', 'Oregon', 'Pennsylvania', 'Rhode Island',
  'South Carolina', 'South Dakota', 'Tennessee', 'Texas', 'Utah', 'Vermont', 'Virginia', 'Washington',
  'West Virginia', 'Wisconsin', 'Wyoming',
]

export const emptyConviction = (): Conviction => ({ type: '', level: '', felonyClass: '', underFive: '', yearHappened: '', yearConvicted: '' })

export const emptyAnswers = (): Answers => ({
  firstName: '', town: '', state: '', convictions: [emptyConviction()],
  familyViolence: '', sexOffense: '', probation: '', pending: '', finished: '',
  kids: '', kidsCount: '', kidsWith: '', familyCourt: '',
  housingTonight: '', housingMonth: '', ids: [], working: '', workWhere: '', workWant: '', goals: ['', '', ''],
})

export type QuestionId =
  | 'name' | 'where' | 'convictions' | 'familyViolence' | 'sexOffense' | 'probation' | 'pending'
  | 'finished' | 'kids' | 'housing' | 'ids' | 'work' | 'goals'

/** `named` is the same question with her first name, used once she has given it. */
export type Question = { id: QuestionId; title: string; named?: string; required: boolean }

export const QUESTIONS: Question[] = [
  { id: 'name', title: 'What’s your first name?', required: false },
  { id: 'where', title: 'Where do you live?', named: 'Where do you live, {name}?', required: true },
  { id: 'convictions', title: 'What convictions are on your record?', named: '{name}, what convictions are on your record?', required: true },
  { id: 'familyViolence', title: 'Were any of these convictions for family violence?', named: '{name}, were any of these convictions for family violence?', required: true },
  { id: 'sexOffense', title: 'Were any of these convictions for a sex offense?', named: '{name}, were any of these convictions for a sex offense?', required: true },
  { id: 'probation', title: 'Are you on probation, parole, or special parole right now?', named: '{name}, are you on probation, parole, or special parole right now?', required: true },
  { id: 'pending', title: 'Do you have an open criminal case in Connecticut right now?', named: '{name}, do you have an open criminal case in Connecticut right now?', required: true },
  { id: 'finished', title: 'Have you finished every part of every sentence, including prison, probation, and parole?', named: '{name}, have you finished every part of every sentence, including prison, probation, and parole?', required: true },
  { id: 'kids', title: 'Do you have children?', named: 'Do you have children, {name}?', required: true },
  { id: 'housing', title: 'Where are you staying tonight?', named: 'Where are you staying tonight, {name}?', required: true },
  { id: 'ids', title: 'Which of these IDs do you have?', named: 'Which of these IDs do you have, {name}?', required: false },
  { id: 'work', title: 'Are you working right now?', named: 'Are you working right now, {name}?', required: false },
]

/** Goals are asked after the record check, on the way to the 30-day plan (user test, Nov 9, 2026). */
export const GOALS_QUESTION: Question = {
  id: 'goals', title: 'What are your top three goals for the next 30 days?', named: '{name}, what are your top three goals for the next 30 days?', required: false,
}

/** Her first name for the questions ("Where do you live, Maria?"), or '' if she skipped it. */
export const nameForQuestions = (a: Answers) => a.firstName.trim().split(/\s+/)[0]?.slice(0, 30) ?? ''

const filled = (s: string) => s.trim().length > 0

/** Whether a question has a usable answer (required questions must, to move on). */
export function isAnswered(id: QuestionId, a: Answers): boolean {
  switch (id) {
    case 'name': return filled(a.firstName)
    case 'where': return filled(a.town) && filled(a.state)
    case 'convictions':
      return a.convictions.length > 0 && a.convictions.every((c) =>
        filled(c.type) && filled(c.level) && filled(c.yearHappened) && filled(c.yearConvicted) &&
        (c.level !== 'Felony' || filled(c.felonyClass)) && (!needsSentenceQuestion(c) || filled(c.underFive)))
    case 'familyViolence': return filled(a.familyViolence)
    case 'sexOffense': return filled(a.sexOffense)
    case 'probation': return filled(a.probation)
    case 'pending': return filled(a.pending)
    case 'finished': return filled(a.finished)
    case 'kids': return a.kids === 'No' || a.kids === NOT_SURE || (a.kids === 'Yes' && filled(a.kidsCount) && filled(a.kidsWith) && filled(a.familyCourt))
    case 'housing': return filled(a.housingTonight) && filled(a.housingMonth)
    case 'ids': return a.ids.length > 0
    case 'work': return a.working === 'Yes' || a.working === 'No' // the follow-up box is optional
    case 'goals': return a.goals.some(filled)
  }
}

/** A short answer for the "Check your answers" page. `tr` translates the fixed words (the page passes
 * the site's translator; tests use the English default). */
type Tr = (english: string, vars?: Record<string, string | number>) => string
const same: Tr = (english, vars) => {
  let out = english
  if (vars) for (const [k, v] of Object.entries(vars)) out = out.split(`{${k}}`).join(String(v))
  return out
}
export function summary(id: QuestionId, a: Answers, tr: Tr = same): string {
  if (!isAnswered(id, a)) return tr('Skipped')
  switch (id) {
    case 'name': return a.firstName.trim()
    case 'where': return `${a.town.trim()}, ${a.state}`
    case 'convictions':
      return a.convictions
        .map((c) => {
          const level = c.level === 'Felony'
            ? `${tr('felony')}, ${c.felonyClass === 'Unclassified' || c.felonyClass === NOT_SURE ? tr(c.felonyClass).toLowerCase() : tr(c.felonyClass)}`
            : tr(c.level).toLowerCase()
          const year = c.yearConvicted === NOT_SURE ? tr('year not sure') : c.yearConvicted
          return `${tr(c.type)} (${level}, ${tr('convicted {year}', { year })})`
        })
        .join('; ')
    case 'familyViolence': return tr(a.familyViolence)
    case 'sexOffense': return tr(a.sexOffense)
    case 'probation': return tr(a.probation)
    case 'pending': return tr(a.pending)
    case 'finished': return tr(a.finished)
    case 'kids':
      return a.kids === 'Yes'
        ? tr('Yes: {count}, {with}, family court case: {court}', { count: tr(a.kidsCount), with: tr(a.kidsWith).toLowerCase(), court: tr(a.familyCourt).toLowerCase() })
        : tr(a.kids)
    case 'housing': return tr('Tonight: {tonight}. This month: {month}', { tonight: tr(a.housingTonight), month: tr(a.housingMonth) })
    case 'ids': return a.ids.map((x) => tr(x)).join(', ')
    case 'work':
      return a.working === 'Yes'
        ? (filled(a.workWhere) ? tr('Yes, at {place}', { place: a.workWhere.trim() }) : tr('Yes'))
        : (filled(a.workWant) ? tr('No. Wants to work: {work}', { work: a.workWant.trim() }) : tr('No'))
    case 'goals': return a.goals.filter(filled).map((g) => g.trim()).join('; ')
  }
}

const isDui = (c: Conviction) => c.type.startsWith('DUI')
const isCannabis = (c: Conviction) => c.type.startsWith('Cannabis')
const unknownType = (c: Conviction) => c.type === "I'd rather not say"

/**
 * Turn the answers into one plain-language message for the intake agent. Every required item is
 * stated explicitly (including "not sure"), so the intake agent has what it needs in one pass.
 */
export function buildAnswerMessage(a: Answers): string {
  const lines: string[] = ['Here are my answers to all the questions.']
  lines.push(`First name: ${filled(a.firstName) ? a.firstName.trim() : 'skipped'}`)
  lines.push(`Where I live: ${a.town.trim()}, ${a.state}`)
  a.convictions.forEach((c, i) => {
    const dui = unknownType(c) ? NOT_SURE : isDui(c) ? 'yes' : 'no'
    const cannabis = unknownType(c) ? NOT_SURE : isCannabis(c) ? 'yes' : 'no'
    let level = `Level: ${c.level}.`
    if (c.level === 'Felony') {
      level += ` Felony class: ${c.felonyClass}.`
      if (needsSentenceQuestion(c)) level += ` Longest possible sentence was under 5 years: ${c.underFive}.`
    }
    lines.push(
      `Conviction ${i + 1}: ${c.type}. ${level} Year it happened: ${c.yearHappened}. ` +
        `Year I was convicted: ${c.yearConvicted}. DUI: ${dui}. Cannabis possession: ${cannabis}.`,
    )
  })
  lines.push(`Were any convictions for family violence: ${a.familyViolence}`)
  lines.push(`Were any convictions for a sex offense: ${a.sexOffense}`)
  lines.push(`On probation, parole, or special parole right now: ${a.probation}`)
  lines.push(`Open criminal case in Connecticut right now: ${a.pending}`)
  lines.push(`Finished every part of every sentence (prison, probation, parole): ${a.finished}`)
  lines.push(
    a.kids === 'Yes'
      ? `Children: yes, ${a.kidsCount}. They live: ${a.kidsWith}. Family court case: ${a.familyCourt}. Ages: skipped`
      : `Children: ${a.kids}`,
  )
  lines.push(`Where I'm staying tonight: ${a.housingTonight}`)
  lines.push(`Where I'll stay for the rest of this month: ${a.housingMonth}`)
  lines.push(`IDs I have: ${a.ids.length ? a.ids.join(', ') : 'skipped'}`)
  lines.push(
    a.working === 'Yes'
      ? `Working now: yes${filled(a.workWhere) ? `, at ${a.workWhere.trim()}` : ''}`
      : a.working === 'No'
        ? `Working now: no. Work I want: ${filled(a.workWant) ? a.workWant.trim() : 'skipped'}`
        : 'Working now: skipped',
  )
  const goals = a.goals.filter(filled).map((g) => g.trim())
  lines.push(`Top goals for the next 30 days: ${goals.length ? goals.map((g, i) => `(${i + 1}) ${g}`).join(' ') : 'asked later, after the record check'}`)
  return lines.join('\n')
}

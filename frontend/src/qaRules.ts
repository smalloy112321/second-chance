/**
 * Rules for the self-serve question cards. Pure functions (no React), so they can be tested
 * with plain Node: `node src/qaRules.test.ts`.
 *
 * The intake agent writes every question in its own words, so buttons are only offered when a
 * question clearly fits a known shape. Anything unclear gets just the text box, never a
 * misleading set of buttons.
 */

export const HOUSING = [
  'My own place',
  'With family or friends',
  'A shelter',
  'A program or halfway house',
  'Nowhere safe tonight',
]
export const YES_NO = ['Yes', 'No', "I'm not sure"]
export const LEVEL = ['A misdemeanor', 'A felony', "I'm not sure"]

/** Split the agent's message into the question itself and the softer lines around it. */
export function splitQuestion(text: string): { question: string; note: string } {
  const sentences = text.match(/[^.!?]+[.!?]+["”’']?\s*/g)?.map((s) => s.trim()) ?? [text.trim()]
  const meaningful = sentences.filter((s) => !/i don[’']?t know|\bskip\b/i.test(s)) // the Skip button covers these
  const asks = meaningful.filter((s) => s.endsWith('?'))
  if (asks.length === 0) return { question: text.trim(), note: '' }
  const note = meaningful.filter((s) => !s.endsWith('?')).join(' ')
  return { question: asks.join(' '), note }
}

const AUX = '(are|is|do|does|did|have|has|was|were|will|can|could)'
// Starts with a yes/no verb, optionally after a short lead-in ("Just to be sure, do you...").
const YES_NO_START = new RegExp(`^(?:[^,?]{0,40},\\s*)?${AUX}\\b`, 'i')
// "A, or is it B?" / "..., or were you...?": a choice between two answers, not yes/no.
const EITHER_OR = /\bor\s+(is|are|was|were|do|does|did|has|have|will|not|still|it|you|they|she|he|did)\b/i
// Asks for details (what, when, how many...), which buttons can't answer.
const ASKS_DETAILS = /\b(what|when|which|who|where|how many|how much|how long|how old)\b/i

/** Tap-to-answer choices, only when the question clearly fits; otherwise none (type instead). */
export function answerChoices(question: string): string[] {
  const q = question.trim()
  const lower = q.toLowerCase()
  if (/\b(stay|staying|sleep|sleeping)\b|tonight|housing/.test(lower)) return HOUSING
  if (/misdemeanor/.test(lower) && /felony/.test(lower)) return LEVEL
  if (EITHER_OR.test(q)) return []
  if (ASKS_DETAILS.test(q)) return []
  const first = q.split('?')[0]
  if (YES_NO_START.test(first)) return YES_NO
  return []
}

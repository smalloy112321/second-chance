import { useEffect, useRef, useState, type ReactNode } from 'react'

import {
  CONVICTION_TYPES, FELONY_CLASSES, HOUSING, HOUSING_MONTH, IDS, KIDS_COUNT, KIDS_WITH, LEVELS, QUESTIONS, STATES, YEARS,
  YES_NO, buildAnswerMessage, emptyAnswers, emptyConviction, isAnswered, needsSentenceQuestion, summary,
  type Answers, type Conviction, type QuestionId,
} from './qaForm'
import { answerChoices, splitQuestion } from './qaRules'
import { ResourceCard } from './Results'
import type { AgentState, ChatMessage, Resource } from './types'

/**
 * Self-serve questionnaire. A fixed list of questions is answered on the page (she can go back
 * and change any answer), then sent to the intake agent as one message. The backend agents are
 * unchanged.
 */

const STEPS = ['About you', 'Record check', 'Your results', '30-day plan', 'Practice'] as const

/** The "Checking your record…" card shown while the agents run (self-serve and caseworker). */
export function WorkingCard({ agents, client = false }: { agents: Record<string, { status: string }>; client?: boolean }) {
  const steps = client
    ? [['intake', 'Read the case notes'], ['screener', 'Checking Clean Slate rules'], ['planner', 'Building the 30-day plan'], ['verifier', 'Double-checking the plan']]
    : [['intake', 'Read your answers'], ['screener', 'Checking Clean Slate rules'], ['planner', 'Building your 30-day plan'], ['verifier', 'Double-checking your plan']]
  const heading =
    agents.verifier?.status === 'running'
      ? client ? 'Double-checking the plan…' : 'Double-checking your plan…'
      : agents.planner?.status === 'running'
        ? client ? 'Building the 30-day plan…' : 'Building your 30-day plan…'
        : agents.screener?.status === 'running'
          ? client ? 'Checking the record…' : 'Checking your record…'
          : client ? 'Reading the case notes…' : 'Reading your answers…'
  return (
    <section className="qa-card qa-wait" aria-live="polite">
      <span className="spinner qa-spinner" aria-hidden="true" />
      <h2 className="qa-question">{heading}</h2>
      <ul className="qa-checklist">
        {steps.map(([agent, label]) => {
          const st = agents[agent]?.status
          return (
            <li key={agent} className={st === 'done' ? 'is-done' : st === 'running' ? 'is-current' : ''}>
              <span aria-hidden="true">{st === 'done' ? '✓' : st === 'running' ? '●' : '○'}</span> {label}
            </li>
          )
        })}
      </ul>
    </section>
  )
}

/** The five-step progress bar shown across the self-serve flow (also on the Practice screen). */
export function ProgressSteps({ current, aboutFill = 100, labels = STEPS }: { current: number; aboutFill?: number; labels?: readonly string[] }) {
  return (
    <ol className="qa-steps" aria-label="Your progress">
      {labels.map((s, i) => (
        <li key={s} className={i < current ? 'is-done' : i === current ? 'is-current' : ''} aria-current={i === current ? 'step' : undefined}>
          <span className="qa-bar" aria-hidden="true">
            {i === 0 && <span className="qa-bar-fill" style={{ width: `${aboutFill}%` }} />}
          </span>
          {s}
        </li>
      ))}
    </ol>
  )
}
const TOTAL = QUESTIONS.length
const AUTO_ADVANCE: QuestionId[] = ['familyViolence', 'sexOffense', 'probation', 'pending', 'finished']
const CRISIS_IDS = ['988-lifeline', 'ct-safe-connect', 'ct-211-crisis', 'ct-211-can-housing']

type Stage = 'intro' | number | 'review' | 'submitted'

type Props = {
  messages: ChatMessage[]
  busy: boolean
  agents: Record<string, AgentState>
  finished: boolean
  db: Record<string, Resource>
  onSubmit: (text: string) => void
  renderResults?: (show: 'slate' | 'plan', onShowPlan: () => void, onBack: () => void) => ReactNode
}

function Choices({ options, value, onPick }: { options: string[]; value: string; onPick: (v: string) => void }) {
  return (
    <div className="qa-choices" role="radiogroup">
      {options.map((o) => (
        <button
          key={o}
          type="button"
          role="radio"
          aria-checked={value === o}
          className={`qa-choice ${value === o ? 'is-picked' : ''}`}
          onClick={() => onPick(o)}
        >
          {value === o && <span aria-hidden="true">✓ </span>}
          {o}
        </button>
      ))}
    </div>
  )
}

function Select({ label, value, options, onChange, placeholder = 'Choose one' }: {
  label: string; value: string; options: string[]; onChange: (v: string) => void; placeholder?: string
}) {
  return (
    <label className="qa-field">
      <span>{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="" disabled>
          {placeholder}
        </option>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </label>
  )
}

function Text({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <label className="qa-field">
      <span>{label}</span>
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} maxLength={200} autoComplete="off" />
    </label>
  )
}

export default function SelfServeFlow({ messages, busy, agents, finished, db, onSubmit, renderResults }: Props) {
  const [stage, setStage] = useState<Stage>('intro')
  const [a, setA] = useState<Answers>(emptyAnswers)
  const [followUp, setFollowUp] = useState('')
  const [resultView, setResultView] = useState<'slate' | 'plan'>('slate')
  const topRef = useRef<HTMLDivElement>(null)

  const set = <K extends keyof Answers>(k: K, v: Answers[K]) => setA((prev) => ({ ...prev, [k]: v }))
  const setConviction = (i: number, patch: Partial<Conviction>) =>
    setA((prev) => ({ ...prev, convictions: prev.convictions.map((c, j) => (j === i ? { ...c, ...patch } : c)) }))

  useEffect(() => {
    topRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [stage, finished, resultView])

  const answeredCount = QUESTIONS.filter((q) => isAnswered(q.id, a)).length
  const qIndex = typeof stage === 'number' ? stage : -1
  const q = qIndex >= 0 ? QUESTIONS[qIndex] : null
  const canContinue = q ? !q.required || isAnswered(q.id, a) : false

  const next = () => setStage((s) => (typeof s === 'number' ? (s + 1 < TOTAL ? s + 1 : 'review') : s))
  const back = () => setStage((s) => (s === 'review' ? TOTAL - 1 : typeof s === 'number' && s > 0 ? s - 1 : 'intro'))
  const pickAndGo = (k: keyof Answers, v: string) => {
    set(k, v as never)
    if (q && AUTO_ADVANCE.includes(q.id)) window.setTimeout(next, 250)
  }

  // ---- After she taps "Build my plan" -----------------------------------------------------
  const submitted = stage === 'submitted'
  const lastMsg = messages[messages.length - 1]
  const safety = lastMsg?.role === 'safety' ? lastMsg : null
  const errorMsg = lastMsg?.role === 'error' ? lastMsg : null
  const followQ = submitted && !busy && !finished && lastMsg?.role === 'assistant' && messages.length > 2 ? lastMsg : null
  const stepIndex = finished ? (resultView === 'plan' ? 3 : 2) : submitted ? 1 : 0
  const aboutFill = submitted || finished ? 100 : Math.round((answeredCount / TOTAL) * 100)

  const crisis = a.housingTonight === 'Nowhere safe tonight' ? CRISIS_IDS.map((id) => db[id]).filter(Boolean) : []

  const renderQuestion = (id: QuestionId) => {
    switch (id) {
      case 'name':
        return <Text label="First name" value={a.firstName} onChange={(v) => set('firstName', v)} placeholder="Your first name" />
      case 'where':
        return (
          <>
            <Text label="Town or city" value={a.town} onChange={(v) => set('town', v)} placeholder="For example, Hartford" />
            <Select label="State" value={a.state} options={STATES} onChange={(v) => set('state', v)} placeholder="Choose your state" />
            {a.state && a.state !== 'Connecticut' && (
              <p className="qa-warn" role="status">
                This planner covers Connecticut records and Connecticut services. You can keep going if your record is from Connecticut.
              </p>
            )}
          </>
        )
      case 'convictions':
        return (
          <>
            {a.convictions.map((c, i) => (
              <fieldset key={i} className="qa-group">
                <legend>
                  Conviction {i + 1}
                  {a.convictions.length > 1 && (
                    <button type="button" className="qa-remove" onClick={() => set('convictions', a.convictions.filter((_, j) => j !== i))}>
                      Remove
                    </button>
                  )}
                </legend>
                <Select label="What was it for?" value={c.type} options={CONVICTION_TYPES} onChange={(v) => setConviction(i, { type: v })} />
                <Select label="Misdemeanor or felony?" value={c.level} options={LEVELS} onChange={(v) => setConviction(i, { level: v, felonyClass: '', underFive: '' })} />
                {c.level === 'Felony' && (
                  <Select label="What class of felony?" value={c.felonyClass} options={FELONY_CLASSES} onChange={(v) => setConviction(i, { felonyClass: v, underFive: '' })} />
                )}
                {needsSentenceQuestion(c) && (
                  <Select label="Was the longest possible sentence under 5 years?" value={c.underFive} options={YES_NO} onChange={(v) => setConviction(i, { underFive: v })} />
                )}
                <div className="qa-row">
                  <Select label="Year it happened" value={c.yearHappened} options={YEARS} onChange={(v) => setConviction(i, { yearHappened: v })} placeholder="Year" />
                  <Select label="Year convicted" value={c.yearConvicted} options={YEARS} onChange={(v) => setConviction(i, { yearConvicted: v })} placeholder="Year" />
                </div>
              </fieldset>
            ))}
            {a.convictions.length < 6 && (
              <button type="button" className="qa-add" onClick={() => set('convictions', [...a.convictions, emptyConviction()])}>
                + Add another conviction
              </button>
            )}
          </>
        )
      case 'familyViolence':
      case 'sexOffense':
      case 'probation':
      case 'pending':
      case 'finished':
        return <Choices options={YES_NO} value={a[id]} onPick={(v) => pickAndGo(id, v)} />
      case 'kids':
        return (
          <>
            <Choices options={YES_NO} value={a.kids} onPick={(v) => set('kids', v)} />
            {a.kids === 'Yes' && (
              <div className="qa-sub">
                <Select label="How many?" value={a.kidsCount} options={KIDS_COUNT} onChange={(v) => set('kidsCount', v)} />
                <Select label="Who do they live with now?" value={a.kidsWith} options={KIDS_WITH} onChange={(v) => set('kidsWith', v)} />
                <Select label="Is there a family court case?" value={a.familyCourt} options={YES_NO} onChange={(v) => set('familyCourt', v)} />
              </div>
            )}
          </>
        )
      case 'housing':
        return (
          <>
            <Choices options={HOUSING} value={a.housingTonight} onPick={(v) => set('housingTonight', v)} />
            {crisis.length > 0 && (
              <div className="msg msg-safety qa-safety" role="alert">
                <p>
                  <strong>You don’t have to handle this alone. If you are in danger, call 911. These free services can help tonight:</strong>
                </p>
                <div className="safety-resources">
                  {crisis.map((r) => (
                    <ResourceCard key={r.id} r={r} />
                  ))}
                </div>
              </div>
            )}
            {a.housingTonight && (
              <div className="qa-sub">
                <Select label="And for the rest of this month?" value={a.housingMonth} options={HOUSING_MONTH} onChange={(v) => set('housingMonth', v)} />
              </div>
            )}
          </>
        )
      case 'ids':
        return (
          <div className="qa-choices" role="group" aria-label="IDs you have">
            {IDS.map((o) => {
              const on = a.ids.includes(o)
              return (
                <button
                  key={o}
                  type="button"
                  aria-pressed={on}
                  className={`qa-choice ${on ? 'is-picked' : ''}`}
                  onClick={() => set('ids', on ? a.ids.filter((x) => x !== o) : [...a.ids, o])}
                >
                  <span aria-hidden="true">{on ? '☑ ' : '☐ '}</span>
                  {o}
                </button>
              )
            })}
          </div>
        )
      case 'work':
        return (
          <>
            <Choices options={['Yes', 'No']} value={a.working} onPick={(v) => set('working', v)} />
            {a.working === 'Yes' && (
              <div className="qa-sub">
                <Text label="Where are you working?" value={a.workWhere} onChange={(v) => set('workWhere', v)} placeholder="For example, a grocery store" />
              </div>
            )}
            {a.working === 'No' && (
              <div className="qa-sub">
                <Text label="What kind of work do you want to do?" value={a.workWant} onChange={(v) => set('workWant', v)} placeholder="For example, food service" />
              </div>
            )}
          </>
        )
      case 'goals':
        return (
          <>
            {[0, 1, 2].map((i) => (
              <Text
                key={i}
                label={`Goal ${i + 1}`}
                value={a.goals[i]}
                onChange={(v) => set('goals', a.goals.map((g, j) => (j === i ? v : g)) as Answers['goals'])}
                placeholder={['For example, get a state ID', 'For example, apply for food benefits', 'For example, find a job'][i]}
              />
            ))}
          </>
        )
    }
  }

  return (
    <div className="qa">
      <div ref={topRef} className="qa-anchor" />
      <ProgressSteps current={stepIndex} aboutFill={aboutFill} />

      {finished ? (
        renderResults?.(resultView, () => setResultView('plan'), () => setResultView('slate'))
      ) : stage === 'intro' ? (
        <section className="qa-card">
          <h2 className="qa-question">Let’s check your record.</h2>
          <p className="qa-intro">
            I’m going to ask you a series of questions, which should take about 5 minutes. You can go back and change
            your answers at any time. Ready to get started?
          </p>
          <button type="button" className="qa-choice qa-start" onClick={() => setStage(0)}>
            Let’s get started
          </button>
        </section>
      ) : q ? (
        <section className="qa-card" aria-labelledby="qa-title">
          <div className="qa-meta">
            <span className="qa-label">
              Question {qIndex + 1} of {TOTAL}
            </span>
            <span className={`qa-req ${q.required ? 'is-required' : ''}`}>{q.required ? 'Required' : 'Optional'}</span>
          </div>
          <h2 id="qa-title" className="qa-question">
            {q.title}
          </h2>
          <div className="qa-body">{renderQuestion(q.id)}</div>
          <div className="qa-nav">
            <button type="button" className="btn btn-quiet" onClick={back}>
              ← Back
            </button>
            <button type="button" className="btn qa-next" onClick={next} disabled={!canContinue}>
              {!q.required && !isAnswered(q.id, a) ? 'Skip' : qIndex + 1 === TOTAL ? 'Review answers' : 'Next'}
            </button>
          </div>
        </section>
      ) : stage === 'review' ? (
        <section className="qa-card" aria-labelledby="qa-review">
          <h2 id="qa-review" className="qa-question">
            Check your answers
          </h2>
          <ol className="qa-review">
            {QUESTIONS.map((qq, i) => {
              const missing = qq.required && !isAnswered(qq.id, a)
              return (
                <li key={qq.id} className={missing ? 'is-missing' : ''}>
                  <div>
                    <span className="qa-r-q">{qq.title}</span>
                    <span className="qa-r-a">{missing ? 'Needed to check your record' : summary(qq.id, a)}</span>
                  </div>
                  <button type="button" className="link-button" onClick={() => setStage(i)}>
                    {missing ? 'Answer' : 'Change'}
                  </button>
                </li>
              )
            })}
          </ol>
          <div className="qa-nav">
            <button type="button" className="btn btn-quiet" onClick={back}>
              ← Back
            </button>
            <button
              type="button"
              className="btn qa-next"
              disabled={QUESTIONS.some((qq) => qq.required && !isAnswered(qq.id, a))}
              onClick={() => {
                setStage('submitted')
                onSubmit(buildAnswerMessage(a))
              }}
            >
              Build my plan
            </button>
          </div>
        </section>
      ) : (
        <>
          {safety && safety.role === 'safety' && (
            <div className="msg msg-safety qa-safety" role="alert">
              <p>
                <strong>{safety.text}</strong>
              </p>
              <div className="safety-resources">
                {safety.resources.map((r) => (
                  <ResourceCard key={r.id} r={r} />
                ))}
              </div>
            </div>
          )}
          {errorMsg && errorMsg.role === 'error' && <p className="qa-error" role="alert">{errorMsg.text}</p>}
          {busy ? (
            <WorkingCard agents={agents} />
          ) : followQ && followQ.role === 'assistant' ? (
            <section className="qa-card" aria-labelledby="qa-follow">
              <div className="qa-meta">
                <span className="qa-label">One more question</span>
              </div>
              <h2 id="qa-follow" className="qa-question">
                {splitQuestion(followQ.text).question}
              </h2>
              {answerChoices(splitQuestion(followQ.text).question).length > 0 && (
                <Choices
                  options={answerChoices(splitQuestion(followQ.text).question)}
                  value=""
                  onPick={(v) => onSubmit(v)}
                />
              )}
              <form
                className="qa-type"
                onSubmit={(e) => {
                  e.preventDefault()
                  if (followUp.trim()) {
                    onSubmit(followUp.trim())
                    setFollowUp('')
                  }
                }}
              >
                <label htmlFor="qa-follow-input" className="sr-only">
                  Your answer
                </label>
                <input id="qa-follow-input" value={followUp} onChange={(e) => setFollowUp(e.target.value)} placeholder="Type your answer…" maxLength={2000} />
                <button type="submit" className="btn" disabled={!followUp.trim()}>
                  Send
                </button>
              </form>
            </section>
          ) : (
            <section className="qa-card">
              <h2 className="qa-question">Something didn’t finish.</h2>
              <div className="qa-nav">
                <button type="button" className="btn" onClick={() => setStage('review')}>
                  Back to your answers
                </button>
              </div>
            </section>
          )}
        </>
      )}
    </div>
  )
}


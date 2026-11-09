import { useEffect, useRef, useState, type ReactNode } from 'react'

import { currentStep, stayHere, useHistoryStep } from './historyStep'
import { loadTab, saveTab } from './tabStore'
import { t } from './i18n'

import {
  CONVICTION_TYPES, FELONY_CLASSES, HOUSING, HOUSING_MONTH, IDS, KIDS_COUNT, KIDS_WITH, LEVELS, QUESTIONS, STATES, YEARS,
  YES_NO, GOALS_QUESTION, buildAnswerMessage, emptyAnswers, emptyConviction, isAnswered, nameForQuestions, needsSentenceQuestion, summary,
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
export function WorkingCard({ agents, client = false, phase = 'all' }: {
  agents: Record<string, { status: string }>; client?: boolean; phase?: 'all' | 'record' | 'plan'
}) {
  const all = client
    ? [['intake', 'Read the case notes'], ['screener', 'Checking Clean Slate rules'], ['planner', 'Building the 30-day plan'], ['verifier', 'Double-checking the plan']]
    : [['intake', 'Read your answers'], ['screener', 'Checking Clean Slate rules'], ['planner', 'Building your 30-day plan'], ['verifier', 'Double-checking your plan']]
  // Self-serve checks the record first, then builds the plan after she adds her goals.
  const steps = phase === 'record' ? all.slice(0, 2) : phase === 'plan' ? all.slice(2) : all
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
      <h2 className="qa-question">{t(heading)}</h2>
      <ul className="qa-checklist">
        {steps.map(([agent, label]) => {
          const st = agents[agent]?.status
          return (
            <li key={agent} className={st === 'done' ? 'is-done' : st === 'running' ? 'is-current' : ''}>
              <span aria-hidden="true">{st === 'done' ? '✓' : st === 'running' ? '●' : '○'}</span> {t(label)}
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
    <ol className="qa-steps" aria-label={t('Your progress')}>
      {labels.map((s, i) => (
        <li key={s} className={i < current ? 'is-done' : i === current ? 'is-current' : ''} aria-current={i === current ? 'step' : undefined}>
          <span className="qa-bar" aria-hidden="true">
            {i === 0 && <span className="qa-bar-fill" style={{ width: `${aboutFill}%` }} />}
          </span>
          {t(s)}
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
  /** Whether the 30-day plan has been built yet (it is built after the record check and her goals). */
  hasPlan?: boolean
  /** Build the plan from her goals. */
  onBuildPlan?: (goals: string[]) => void
  /** Go back to the homepage (used when Back is pressed after the answers were sent). */
  onLeave?: () => void
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
          {t(o)}
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
      <span>{t(label)}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="" disabled>
          {t(placeholder)}
        </option>
        {options.map((o) => (
          <option key={o} value={o}>
            {/^\d{4}$/.test(o) ? o : t(o)}
          </option>
        ))}
      </select>
    </label>
  )
}

function Text({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <label className="qa-field">
      <span>{t(label)}</span>
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder && t(placeholder)} maxLength={200} autoComplete="off" />
    </label>
  )
}

export default function SelfServeFlow({ messages, busy, agents, finished, db, onSubmit, hasPlan = true, onBuildPlan, onLeave, renderResults }: Props) {
  // A screen that comes back (e.g. after Practice) picks up where it was.
  const [stage, setStage] = useState<Stage>(() => {
    const s = currentStep<Stage>('stage', 'intro')
    return s === 'submitted' && !finished && !busy ? 'review' : s // reloaded mid-check: let her submit again
  })
  const [a, setA] = useState<Answers>(() => loadTab('self.answers', emptyAnswers()))
  useEffect(() => saveTab('self.answers', a), [a])
  const [followUp, setFollowUp] = useState('')
  const [resultView, setResultView] = useState<'slate' | 'plan'>(() => currentStep<'slate' | 'plan'>('results', 'slate'))
  // Browser Back/Forward: question to question, review, results <-> plan. Sending the answers
  // replaces the review entry, so Back from the results asks before leaving (the answers are sent).
  useHistoryStep<Stage>('stage', stage, setStage, 'intro', {
    replace: (v) => v === 'submitted',
    allow: (next, current) => {
      if (current !== 'submitted' || next === 'submitted') return true
      if (window.confirm(t('Go back to the start? Your results and 30-day plan will be cleared.'))) onLeave?.()
      else stayHere()
      return false
    },
  })
  useHistoryStep<'slate' | 'plan'>('results', resultView, setResultView, 'slate')
  const topRef = useRef<HTMLDivElement>(null)

  const set = <K extends keyof Answers>(k: K, v: Answers[K]) => setA((prev) => ({ ...prev, [k]: v }))
  const setConviction = (i: number, patch: Partial<Conviction>) =>
    setA((prev) => ({ ...prev, convictions: prev.convictions.map((c, j) => (j === i ? { ...c, ...patch } : c)) }))

  useEffect(() => {
    topRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [stage, finished, resultView])

  const answeredCount = QUESTIONS.filter((q) => isAnswered(q.id, a)).length
  const name = nameForQuestions(a)
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
                {t('This planner covers Connecticut records and Connecticut services. You can keep going if your record is from Connecticut.')}
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
                  {t('Conviction {n}', { n: i + 1 })}
                  {a.convictions.length > 1 && (
                    <button type="button" className="qa-remove" onClick={() => set('convictions', a.convictions.filter((_, j) => j !== i))}>
                      {t('Remove')}
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
                  <strong>{t('You don’t have to handle this alone. If you are in danger, call 911. These free services can help tonight:')}</strong>
                </p>
                <div className="safety-resources">
                  {crisis.map((r) => (
                    <ResourceCard key={r.id} r={r} plain />
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
          <div className="qa-choices" role="group" aria-label={t('IDs you have')}>
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
                  {t(o)}
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
                label={t('Goal {n}', { n: i + 1 })}
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

      {finished && resultView === 'plan' && !hasPlan ? (
        busy ? (
          <WorkingCard agents={agents} phase="plan" />
        ) : (
          <section className="qa-card" aria-labelledby="qa-goals">
            <div className="qa-meta">
              <span className="qa-label">{t('Your 30-day plan')}</span>
              <span className="qa-req">{t('Optional')}</span>
            </div>
            <h2 id="qa-goals" className="qa-question">
              {name ? t(GOALS_QUESTION.named!, { name }) : t(GOALS_QUESTION.title)}
            </h2>
            <p className="qa-intro">{t('Your plan will be built around these. You can leave them blank.')}</p>
            <div className="qa-body">{renderQuestion('goals')}</div>
            {errorMsg && errorMsg.role === 'error' && <p className="qa-error" role="alert">{t(errorMsg.text)}</p>}
            {safety && safety.role === 'safety' && (
              <div className="msg msg-safety qa-safety" role="alert">
                <p><strong>{t(safety.text)}</strong></p>
                <div className="safety-resources">
                  {safety.resources.map((r) => <ResourceCard key={r.id} r={r} plain />)}
                </div>
              </div>
            )}
            <div className="qa-nav">
              <button type="button" className="btn btn-quiet" onClick={() => setResultView('slate')}>
                ← {t('Back to my results')}
              </button>
              <button type="button" className="btn qa-next" onClick={() => onBuildPlan?.(a.goals.filter((g) => g.trim()))}>
                {t('Build my plan')}
              </button>
            </div>
          </section>
        )
      ) : finished ? (
        renderResults?.(resultView, () => setResultView('plan'), () => setResultView('slate'))
      ) : stage === 'intro' ? (
        <section className="qa-card">
          <h2 className="qa-question">{t('Let’s check your record.')}</h2>
          <p className="qa-intro">
            {t('I’m going to ask you a series of questions, which should take about 5 minutes. You can go back and change your answers at any time. Ready to get started?')}
          </p>
          <button type="button" className="qa-choice qa-start" onClick={() => setStage(0)}>
            {t('Let’s get started')}
          </button>
        </section>
      ) : q ? (
        <section className="qa-card" aria-labelledby="qa-title">
          <div className="qa-meta">
            <span className="qa-label">
              {t('Question {n} of {total}', { n: qIndex + 1, total: TOTAL })}
            </span>
            <span className={`qa-req ${q.required ? 'is-required' : ''}`}>{t(q.required ? 'Required' : 'Optional')}</span>
          </div>
          <h2 id="qa-title" className="qa-question">
            {name && q.named ? t(q.named, { name }) : t(q.title)}
          </h2>
          <div className="qa-body">{renderQuestion(q.id)}</div>
          <div className="qa-nav">
            <button type="button" className="btn btn-quiet" onClick={back}>
              ← {t('Back')}
            </button>
            <button type="button" className="btn qa-next" onClick={next} disabled={!canContinue}>
              {t(!q.required && !isAnswered(q.id, a) ? 'Skip' : qIndex + 1 === TOTAL ? 'Review answers' : 'Next')}
            </button>
          </div>
        </section>
      ) : stage === 'review' ? (
        <section className="qa-card" aria-labelledby="qa-review">
          <h2 id="qa-review" className="qa-question">
            {t('Check your answers')}
          </h2>
          <ol className="qa-review">
            {QUESTIONS.map((qq, i) => {
              const missing = qq.required && !isAnswered(qq.id, a)
              return (
                <li key={qq.id} className={missing ? 'is-missing' : ''}>
                  <div>
                    <span className="qa-r-q">{t(qq.title)}</span>
                    <span className="qa-r-a">{missing ? t('Needed to check your record') : summary(qq.id, a, t)}</span>
                  </div>
                  <button type="button" className="link-button" onClick={() => setStage(i)}>
                    {t(missing ? 'Answer' : 'Change')}
                  </button>
                </li>
              )
            })}
          </ol>
          <div className="qa-nav">
            <button type="button" className="btn btn-quiet" onClick={back}>
              ← {t('Back')}
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
              {t('Check my record')}
            </button>
          </div>
        </section>
      ) : (
        <>
          {safety && safety.role === 'safety' && (
            <div className="msg msg-safety qa-safety" role="alert">
              <p>
                <strong>{t(safety.text)}</strong>
              </p>
              <div className="safety-resources">
                {safety.resources.map((r) => (
                  <ResourceCard key={r.id} r={r} plain />
                ))}
              </div>
            </div>
          )}
          {errorMsg && errorMsg.role === 'error' && <p className="qa-error" role="alert">{t(errorMsg.text)}</p>}
          {busy ? (
            <WorkingCard agents={agents} phase="record" />
          ) : followQ && followQ.role === 'assistant' ? (
            <section className="qa-card" aria-labelledby="qa-follow">
              <div className="qa-meta">
                <span className="qa-label">{t('One more question')}</span>
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
                  {t('Your answer')}
                </label>
                <input id="qa-follow-input" value={followUp} onChange={(e) => setFollowUp(e.target.value)} placeholder={t('Type your answer…')} maxLength={2000} />
                <button type="submit" className="btn" disabled={!followUp.trim()}>
                  {t('Send')}
                </button>
              </form>
            </section>
          ) : (
            <section className="qa-card">
              <h2 className="qa-question">{t('Something didn’t finish.')}</h2>
              <div className="qa-nav">
                <button type="button" className="btn" onClick={() => setStage('review')}>
                  {t('Back to your answers')}
                </button>
              </div>
            </section>
          )}
        </>
      )}
    </div>
  )
}


import { useCallback, useEffect, useRef, useState } from 'react'

import ExamplesPage from './ExamplesPage'
import Logo from './Logo'
import PracticeRoom from './PracticeRoom'
import { PLAN_DONE_PREFIX } from './PlanView'
import { ProgressSteps, WorkingCard } from './SelfServeFlow'
import { CASE_NOTES_TEMPLATE, notMentioned } from './caseNotes'
import { clearSession, fetchResources, fetchUsage, newSessionId, streamChat, type StreamEvent } from './api'
import Results, { ResourceCard } from './Results'
import SelfServeFlow from './SelfServeFlow'
import {
  AGENTS,
  type AgentName,
  type AgentState,
  type ChatMessage,
  type Difficulty,
  type FinalPayload,
  type Mode,
  type Resource,
  type ResultPayload,
  type Usage,
} from './types'

const MODE_KEY = 'scpp.mode'

const MODE_LABEL: Record<Mode, string> = {
  self_serve: "I'm planning for myself",
  caseworker: "I'm helping a client",
}

const GREETING: Record<Mode, string> = {
  self_serve:
    "Hi, I'm glad you're here. I'll ask you a few questions, one at a time, to check your record and build a 30-day plan. You can say \"skip\" or \"I don't know\" to any question. When you're ready, say hello.",
  caseworker:
    'Paste your case notes about the client below, or start from the template. For each conviction, include the year, misdemeanor or felony, and whether it was a DUI or cannabis possession. I will pull out what I can and ask for anything missing.',
}

const CASEWORKER_STEPS = ['Case notes', 'Record check', 'Results', '30-day plan', 'Practice'] as const

const freshAgents = (): Record<AgentName, AgentState> =>
  Object.fromEntries(AGENTS.map((a) => [a, { status: 'idle', summary: '', tokens: 0 }])) as Record<AgentName, AgentState>

function storedMode(): Mode | null {
  const m = sessionStorage.getItem(MODE_KEY)
  return m === 'self_serve' || m === 'caseworker' ? m : null
}

type Launch = { view: 'plan' | 'practice'; sessionId?: string; scenario?: string; difficulty?: Difficulty }

/** A caseworker's practice link: /?practice=<scenario>&difficulty=<d>&sid=<new session id> */
function launchFromUrl(): Launch | null {
  const q = new URLSearchParams(location.search)
  const scenario = q.get('practice')
  if (!scenario) return null
  const d = q.get('difficulty')
  const sid = q.get('sid') ?? ''
  return {
    view: 'practice',
    scenario,
    difficulty: d === 'neutral' || d === 'skeptical' ? d : 'friendly',
    sessionId: /^[A-Za-z0-9_-]{8,64}$/.test(sid) ? sid : undefined,
  }
}

export default function App() {
  const [linkLaunch] = useState(launchFromUrl)
  const [mode, setMode] = useState<Mode | null>(linkLaunch ? 'self_serve' : storedMode)
  const [launch, setLaunch] = useState<Launch>(linkLaunch ?? { view: 'plan' })

  const choose = (m: Mode, view: Launch['view'] = 'plan') => {
    sessionStorage.setItem(MODE_KEY, m)
    setLaunch({ view })
    setMode(m)
  }
  const leave = () => {
    sessionStorage.removeItem(MODE_KEY)
    if (location.search) history.replaceState(null, '', location.pathname)
    setMode(null)
  }

  if (new URLSearchParams(location.search).has('examples')) {
    return (
      <Shell onHome={() => (location.href = '/')}>
        <ExamplesPage />
      </Shell>
    )
  }

  return mode ? (
    <Workspace key={`${mode}-${launch.view}`} mode={mode} launch={launch} onChangeMode={leave} />
  ) : (
    <Landing onChoose={choose} />
  )
}

function Shell({ children, footer, onHome }: { children: React.ReactNode; footer?: React.ReactNode; onHome?: () => void }) {
  return (
    <div className="page">
      <header className="site-header no-print">
        <a
          href="/"
          className="logo-link"
          aria-label="The Second Chance Pathway Planner, go to the homepage"
          onClick={(e) => {
            e.preventDefault()
            if (onHome) onHome()
            else window.scrollTo({ top: 0, behavior: 'smooth' })
          }}
        >
          <Logo />
        </a>
      </header>
      <main id="main">{children}</main>
      <footer className="site-footer">
        {footer}
        <p>
          This planner gives general information, not legal advice. For your situation, talk with a legal aid lawyer.
        </p>
        <p className="footer-source">
          Clean Slate figure (170,000 people) source:{' '}
          <a href="https://ctmirror.org/2026/07/15/ct-clears-clean-slate-backlog/" target="_blank" rel="noreferrer">
            CT Mirror, July 15, 2026
          </a>
          . Homepage photo (illustrative):{' '}
          <a href="https://unsplash.com/photos/four-women-laughing-outdoors-together-EU-Oc9VQHRg" target="_blank" rel="noreferrer">
            Crosby Hinze on Unsplash
          </a>
          .
        </p>
      </footer>
    </div>
  )
}

function Landing({ onChoose }: { onChoose: (m: Mode, view?: Launch['view']) => void }) {
  const [photoOk, setPhotoOk] = useState(true)
  return (
    <Shell>
      <section className="landing" aria-labelledby="landing-title">
        <h1 id="landing-title" className="sr-only">
          The Second Chance Pathway Planner
        </h1>
        <div className="hero">
          {photoOk && (
            <figure className="hero-figure">
              <img
                className="hero-photo"
                src="/hero-photo.jpg"
                alt="Four women with their arms around each other, laughing together outdoors"
                onError={() => setPhotoOk(false)}
              />
            </figure>
          )}
          <div className="hero-band">
            <div className="hero-inner">
              <p className="hero-text">
                <strong>Connecticut’s Clean Slate law has erased the convictions of 170,000 people.</strong> Check if
                your record was cleared, build a 30-day plan, and practice the conversations that matter most.
              </p>
            </div>
          </div>
        </div>
        <p className="choose-prompt">Let’s get started. Who are you planning for?</p>
        <div className="choices">
          <button type="button" className="choice choice-self" onClick={() => onChoose('self_serve')}>
            <span className="choice-title">
              I'm planning
              <br />for myself
            </span>
            <span className="choice-sub">Go at your own pace. One question at a time.</span>
            <span className="choice-cta">Get started →</span>
          </button>
          <button type="button" className="choice choice-case" onClick={() => onChoose('caseworker')}>
            <span className="choice-title">
              I'm helping
              <br />a client
            </span>
            <span className="choice-sub">Paste case notes and get a plan you can print.</span>
            <span className="choice-cta">Get started →</span>
          </button>
          <button type="button" className="choice choice-practice" onClick={() => onChoose('self_serve', 'practice')}>
            <span className="choice-title">
              I want to practice
              <br />a conversation
            </span>
            <span className="choice-sub">Practice with a boss, landlord, or social worker.</span>
            <span className="choice-cta">Get started →</span>
          </button>
        </div>
      </section>
    </Shell>
  )
}

function Workspace({ mode, launch, onChangeMode }: { mode: Mode; launch: Launch; onChangeMode: () => void }) {
  const caseworker = mode === 'caseworker'
  const [sessionId, setSessionId] = useState(() => launch.sessionId ?? newSessionId())
  const [view, setView] = useState<Launch['view']>(launch.view)
  const [messages, setMessages] = useState<ChatMessage[]>([{ role: 'assistant', text: GREETING[mode] }])
  const [input, setInput] = useState('')
  const [cwStarted, setCwStarted] = useState(false)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<ResultPayload | null>(null)
  const [agents, setAgents] = useState(freshAgents)
  const [usage, setUsage] = useState<Usage | null>(null)
  const [db, setDb] = useState<Record<string, Resource>>({})
  const bottom = useRef<HTMLDivElement>(null)
  const resultsRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    void fetchResources().then(setDb)
  }, [])

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages, busy])

  useEffect(() => {
    if (result) resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [result])


  const setAgent = (name: string, patch: (s: AgentState) => Partial<AgentState>) =>
    setAgents((all) =>
      name in all ? { ...all, [name]: { ...all[name as AgentName], ...patch(all[name as AgentName]) } } : all,
    )

  const onFinal = (f: FinalPayload) => {
    if (f.type === 'question' || f.type === 'limit') {
      setMessages((m) => [...m, { role: 'assistant', text: f.reply }])
    } else if (f.type === 'info') {
      setMessages((m) => [...m, { role: 'assistant', text: f.reply }])
      if (f.result) setResult(f.result)
    } else if (f.type === 'safety') {
      setMessages((m) => [...m, { role: 'safety', text: f.message, resources: f.resources }])
    } else if (f.type === 'result') {
      setResult(f)
      setMessages((m) => [
        ...m,
        {
          role: 'assistant',
          text: caseworker
            ? 'Done. The Clean Slate check and 30-day plan are below.'
            : 'Thank you for sharing all of that. Your Clean Slate check and 30-day plan are ready below.',
        },
      ])
    }
  }

  const onEvent = ({ event, data }: StreamEvent) => {
    switch (event) {
      case 'agent_started':
        setAgent(data.agent, () => ({ status: 'running' }))
        break
      case 'agent_done':
        setAgent(data.agent, (s) => ({
          status: 'done',
          summary: data.summary,
          tokens: s.tokens + (data.tokens?.total_tokens ?? 0),
        }))
        break
      case 'tool_called': {
        break
      }
      case 'verifier_issue':
        break
      case 'safety_block':
        setAgent('safety_guard', () => ({ status: 'blocked', summary: data.status }))
        break
      case 'error':
        if (data.kind !== 'limit') setMessages((m) => [...m, { role: 'error', text: data.message }])
        break
      case 'final':
        onFinal(data as FinalPayload)
        break
    }
  }

  const send = async (override?: string) => {
    const text = (override ?? input).trim()
    if (!text || busy) return
    if (override === undefined) setInput('')
    setMessages((m) => [...m, { role: 'user', text }])
    setAgents((all) =>
      Object.fromEntries(Object.entries(all).map(([k, v]) => [k, { ...v, status: 'idle' }])) as Record<
        AgentName,
        AgentState
      >,
    )
    setBusy(true)
    try {
      await streamChat({ session_id: sessionId, mode, message: text }, onEvent)
    } catch (e) {
      const msg =
        e instanceof Error && e.message !== 'Failed to fetch'
          ? e.message
          : 'Could not reach the planner. Is the server running?'
      setMessages((m) => [...m, { role: 'error', text: msg }])
    } finally {
      setBusy(false)
      refreshUsage()
    }
  }

  const refreshUsage = () => void fetchUsage(sessionId).then((u) => u && setUsage(u))

  const clearAll = useCallback(async () => {
    await clearSession(sessionId)
    Object.keys(sessionStorage).filter((k) => k.startsWith(PLAN_DONE_PREFIX)).forEach((k) => sessionStorage.removeItem(k))
    setSessionId(newSessionId())
    setMessages([{ role: 'assistant', text: GREETING[mode] }])
    setResult(null)
    setAgents(freshAgents())
    setUsage(null)
    setInput('')
    setCwStarted(false)
  }, [sessionId, mode])

  const changeMode = async () => {
    await clearSession(sessionId)
    onChangeMode()
  }

  const firstCaseworkerTurn = caseworker && messages.length === 1
  const missingFacts = firstCaseworkerTurn ? notMentioned(input) : []
  const caseStep = view === 'practice' ? 4 : result ? 2 : busy || messages.length > 1 ? 1 : 0
  const backLabel = result ? (caseworker ? 'Back to the plan' : 'Back to my plan') : 'Build my plan'
  const footer = usage && caseworker ? (
    <p className="usage-meter">
      This session: {usage.overall.total_tokens.toLocaleString()} tokens of {usage.session_token_cap.toLocaleString()}{' '}
      · about ${usage.overall.estimated_cost_usd.toFixed(4)}
    </p>
  ) : null

  return (
    <Shell footer={footer} onHome={changeMode}>
      <div className="toolbar no-print">
        <p className="mode-pill">
          {MODE_LABEL[mode]}
          <button type="button" className="link-button" onClick={changeMode}>
            Change
          </button>
        </p>
        <div className="toolbar-right">
          <button type="button" className="btn btn-quiet" onClick={clearAll} disabled={busy}>
            {caseworker ? 'Clear the info' : 'Clear my info'}
          </button>
          {view === 'practice' && (
            <button type="button" className="btn btn-quiet" onClick={() => setView('plan')}>
              ← {backLabel}
            </button>
          )}
        </div>
      </div>

      {caseworker && view !== 'practice' && (
        <div className="cw-steps no-print">
          <ProgressSteps current={caseStep} labels={CASEWORKER_STEPS} />
        </div>
      )}

      {view === 'practice' ? (
        <div className="qa qa-practice">
          {result && <ProgressSteps current={4} labels={caseworker ? CASEWORKER_STEPS : undefined} />}
          <PracticeRoom
            key={sessionId}
            sessionId={sessionId}
            mode={mode}
            initialScenario={launch.scenario}
            initialDifficulty={launch.difficulty}
            onBack={() => setView('plan')}
            backLabel={backLabel}
            onTurnDone={refreshUsage}
          />
        </div>
      ) : !caseworker ? (
        <SelfServeFlow
          key={sessionId}
          messages={messages}
          busy={busy}
          agents={agents}
          finished={!!result}
          db={db}
          onSubmit={(text) => void send(text)}
          renderResults={(show, onShowPlan, onBack) =>
            result ? (
              <div ref={resultsRef}>
                <Results
                  result={result}
                  mode={mode}
                  db={db}
                  show={show}
                  onShowPlan={onShowPlan}
                  onBackToResults={onBack}
                  onPractice={() => setView('practice')}
                />
              </div>
            ) : null
          }
        />
      ) : (
      !cwStarted && !result && messages.length === 1 ? (
        <section className="qa-card cw-intro">
          <h2 className="qa-question">Let’s check your client’s record.</h2>
          <p className="qa-intro">
            Paste your case notes or fill in the template, then submit. Adding notes takes a few minutes, and the record
            check and 30-day plan take about 2 more minutes. You can clear the info at any time. Ready to get started?
          </p>
          <button type="button" className="qa-choice qa-start" onClick={() => setCwStarted(true)}>
            Let’s get started
          </button>
        </section>
      ) : (
      <div className={`workspace ${caseworker ? 'is-caseworker' : 'is-self'}`}>
        <div className="workspace-main">
          <section className="chat no-print" aria-label="Conversation">
            <ol className="messages">
              {messages.map((m, i) => (
                <li key={i} className={`msg msg-${m.role}`}>
                  {m.role === 'safety' ? (
                    <div role="alert">
                      <p>{m.text}</p>
                      <div className="safety-resources">
                        {m.resources.map((r) => (
                          <ResourceCard key={r.id} r={r} />
                        ))}
                      </div>
                    </div>
                  ) : (
                    <p>{m.text}</p>
                  )}
                </li>
              ))}
            </ol>
            {busy && <WorkingCard agents={agents} client />}
            <div ref={bottom} />

            {!result && !busy && (
              <form
                className="composer composer-stacked"
                onSubmit={(e) => {
                  e.preventDefault()
                  void send()
                }}
              >
                <label htmlFor="msg" className="sr-only">
                  {firstCaseworkerTurn ? 'Case notes' : 'Your message'}
                </label>
                <textarea
                  id="msg"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey && !firstCaseworkerTurn) {
                      e.preventDefault()
                      void send()
                    }
                  }}
                  rows={firstCaseworkerTurn ? 9 : 2}
                  maxLength={8000}
                  placeholder={firstCaseworkerTurn ? 'Paste case notes here…' : 'Type your answer…'}
                  disabled={busy}
                />
                <div className="composer-row">
                  <button type="submit" className="btn" disabled={busy || !input.trim()}>
                    Submit
                  </button>
                  {firstCaseworkerTurn && !input.trim() && (
                    <button type="button" className="btn btn-quiet" onClick={() => setInput(CASE_NOTES_TEMPLATE)}>
                      Use the template
                    </button>
                  )}
                </div>
                {firstCaseworkerTurn && (
                  <div className="notes-help">
                    {missingFacts.length > 0 && (
                      <p className="notes-missing" aria-live="polite">
                        <strong>Not mentioned yet:</strong> {missingFacts.join(' · ')}
                        <span className="notes-missing-why">
                          {' '}Without these, some convictions may come back “Needs review”.
                        </span>
                      </p>
                    )}
                  </div>
                )}
              </form>
            )}
          </section>

          {result && (
            <div ref={resultsRef}>
              <Results result={result} mode={mode} db={db} onPractice={() => setView('practice')} />
            </div>
          )}
        </div>

      </div>
      )
      )}
    </Shell>
  )
}

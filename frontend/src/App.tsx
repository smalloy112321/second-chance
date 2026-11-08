import { useCallback, useEffect, useRef, useState } from 'react'

import AgentPanel from './AgentPanel'
import Logo from './Logo'
import PracticeRoom from './PracticeRoom'
import { clearSession, fetchResources, fetchUsage, newSessionId, streamChat, type StreamEvent } from './api'
import Results, { ResourceCard } from './Results'
import {
  AGENTS,
  type ActivityItem,
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
    'Paste your case notes about the client below (town, convictions with dates, supervision, children, housing, IDs, goals). I will pull out what I can and ask for anything missing.',
}

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

  return mode ? (
    <Workspace key={`${mode}-${launch.view}`} mode={mode} launch={launch} onChangeMode={leave} />
  ) : (
    <Landing onChoose={choose} />
  )
}

function Shell({ children, footer }: { children: React.ReactNode; footer?: React.ReactNode }) {
  return (
    <div className="page">
      <header className="site-header no-print">
        <Logo />
      </header>
      <main id="main">{children}</main>
      <footer className="site-footer">
        {footer}
        <p>
          This planner gives general information, not legal advice. For your situation, talk with a legal aid lawyer.
        </p>
      </footer>
    </div>
  )
}

function Landing({ onChoose }: { onChoose: (m: Mode, view?: Launch['view']) => void }) {
  return (
    <Shell>
      <section className="landing" aria-labelledby="landing-title">
        <h1 id="landing-title">Your next chapter starts with a plan.</h1>
        <p className="lead">
          Check whether your Connecticut record may have been cleared under the Clean Slate law, build a 30-day plan,
          and practice the conversations that matter.
        </p>
        <p className="choose-prompt">Who are you planning for?</p>
        <div className="choices">
          <button type="button" className="choice choice-self" onClick={() => onChoose('self_serve')}>
            <span className="choice-title">{MODE_LABEL.self_serve}</span>
            <span className="choice-sub">Go at your own pace. One question at a time.</span>
          </button>
          <button type="button" className="choice choice-case" onClick={() => onChoose('caseworker')}>
            <span className="choice-title">{MODE_LABEL.caseworker}</span>
            <span className="choice-sub">Paste case notes and get a plan you can print.</span>
          </button>
        </div>
        <button type="button" className="just-practice" onClick={() => onChoose('self_serve', 'practice')}>
          <span className="just-practice-title">Just practice a conversation</span>
          <span className="choice-sub">Rehearse a job interview, an apartment showing, or a meeting with a social worker.</span>
        </button>
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
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<ResultPayload | null>(null)
  const [agents, setAgents] = useState(freshAgents)
  const [activity, setActivity] = useState<ActivityItem[]>([])
  const [panelOpen, setPanelOpen] = useState(caseworker)
  const [usage, setUsage] = useState<Usage | null>(null)
  const [db, setDb] = useState<Record<string, Resource>>({})
  const nextId = useRef(0)
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

  const log = (agent: string, kind: ActivityItem['kind'], text: string) =>
    setActivity((a) => [...a, { id: nextId.current++, agent, kind, text }])

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
        log(data.agent, 'start', 'started')
        break
      case 'agent_done':
        setAgent(data.agent, (s) => ({
          status: 'done',
          summary: data.summary,
          tokens: s.tokens + (data.tokens?.total_tokens ?? 0),
        }))
        log(data.agent, 'done', `${data.summary} · ${(data.tokens?.total_tokens ?? 0).toLocaleString()} tokens`)
        break
      case 'tool_called': {
        const args = Object.entries(data.args ?? {})
          .filter(([, v]) => v !== null && v !== undefined)
          .map(([k, v]) => `${k}=${typeof v === 'string' ? v : JSON.stringify(v)}`)
          .join(', ')
        log(data.agent, 'tool', `→ ${data.name}(${args})`)
        break
      }
      case 'verifier_issue':
        log('verifier', 'issue', `${data.source === 'code' ? 'Code check' : 'AI check'}: ${data.check}: ${data.problem}`)
        break
      case 'safety_block':
        setAgent('safety_guard', () => ({ status: 'blocked', summary: data.status }))
        log('safety_guard', 'block', `blocked: ${data.status}`)
        break
      case 'error':
        log('app', 'error', data.message)
        if (data.kind !== 'limit') setMessages((m) => [...m, { role: 'error', text: data.message }])
        break
      case 'final':
        onFinal(data as FinalPayload)
        break
    }
  }

  const send = async () => {
    const text = input.trim()
    if (!text || busy) return
    setInput('')
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
    setSessionId(newSessionId())
    setMessages([{ role: 'assistant', text: GREETING[mode] }])
    setResult(null)
    setAgents(freshAgents())
    setActivity([])
    setUsage(null)
    setInput('')
  }, [sessionId, mode])

  const changeMode = async () => {
    await clearSession(sessionId)
    onChangeMode()
  }

  const firstCaseworkerTurn = caseworker && messages.length === 1
  const footer = usage ? (
    <p className="usage-meter">
      This session: {usage.overall.total_tokens.toLocaleString()} tokens of {usage.session_token_cap.toLocaleString()}{' '}
      · about ${usage.overall.estimated_cost_usd.toFixed(4)}
    </p>
  ) : null

  return (
    <Shell footer={footer}>
      <div className="toolbar no-print">
        <p className="mode-pill">
          {MODE_LABEL[mode]}
          <button type="button" className="link-button" onClick={changeMode}>
            Change
          </button>
        </p>
        <button type="button" className="btn btn-quiet" onClick={clearAll} disabled={busy}>
          Clear my info
        </button>
      </div>

      {view === 'practice' ? (
        <PracticeRoom
          key={sessionId}
          sessionId={sessionId}
          mode={mode}
          initialScenario={launch.scenario}
          initialDifficulty={launch.difficulty}
          onBack={() => setView('plan')}
          onTurnDone={refreshUsage}
        />
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
              {busy && (
                <li className="msg msg-assistant msg-typing" aria-live="polite">
                  <span className="spinner" aria-hidden="true" /> Working on it…
                </li>
              )}
            </ol>
            <div ref={bottom} />

            {!result && (
              <form
                className="composer"
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
                <button type="submit" className="btn" disabled={busy || !input.trim()}>
                  {firstCaseworkerTurn ? 'Read notes' : 'Send'}
                </button>
              </form>
            )}
          </section>

          {result && (
            <div ref={resultsRef}>
              <Results result={result} mode={mode} db={db} onPractice={() => setView('practice')} />
            </div>
          )}
        </div>

        <div className="no-print">
          <AgentPanel
            names={AGENTS}
            agents={agents}
            activity={activity}
            open={panelOpen}
            onToggle={() => setPanelOpen((o) => !o)}
          />
        </div>
      </div>
      )}
    </Shell>
  )
}

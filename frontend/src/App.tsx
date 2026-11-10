import { useCallback, useEffect, useRef, useState } from 'react'

import ExamplesPage from './ExamplesPage'
import Logo, { LogoMark } from './Logo'
import LanguagePicker, { Lines } from './LanguagePicker'
import { getLang, t, useLang } from './i18n'
import { setDateLocale } from './planDisplay'
import PracticeRoom from './PracticeRoom'
import { stayHere, useHistoryStep } from './historyStep'
import { clearTab, loadTab, saveTab } from './tabStore'
import { ProgressSteps, WorkingCard } from './SelfServeFlow'
import { caseNotesTemplate, notMentioned } from './caseNotes'
import { clearSession, fetchResources, fetchUsage, newSessionId, streamChat, streamPost, type StreamEvent } from './api'
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

const LEAVE_MESSAGE = 'Go back to the start? The results and 30-day plan on this page will be cleared.'

const CASEWORKER_STEPS = ['Case notes', 'Record check', 'Results', '30-day plan', 'Practice'] as const

/** "Conviction 3: year it happened" in the site language. */
function translateGap(gap: string): string {
  const m = gap.match(/^Conviction (\d+): (.*)$/)
  if (!m) return t(gap)
  return `${t('Conviction {n}', { n: m[1] })}: ${m[2].split(', ').map((part) => t(part)).join(', ')}`
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
  const lang = useLang() // re-render the whole site when the language changes
  setDateLocale(lang === 'es' ? 'es-US' : lang === 'pt' ? 'pt-BR' : 'en')
  const [linkLaunch] = useState(launchFromUrl)
  const [mode, setMode] = useState<Mode | null>(linkLaunch ? 'self_serve' : storedMode)
  const [launch, setLaunch] = useState<Launch>(linkLaunch ?? { view: loadTab<Launch['view']>('launchView', 'plan') })

  const choose = (m: Mode, view: Launch['view'] = 'plan') => {
    sessionStorage.setItem(MODE_KEY, m)
    saveTab('launchView', view)
    setLaunch({ view })
    setMode(m)
  }
  const leave = () => {
    sessionStorage.removeItem(MODE_KEY)
    clearTab()
    if (location.search) history.replaceState(history.state, '', location.pathname)
    setMode(null)
  }

  // Browser Back from the first screen of any path returns to the homepage. If there are results
  // (or the agents are still working), ask first, because leaving clears them.
  const hasWork = useRef(false)
  useHistoryStep<string | null>(
    'entry',
    mode ? `${mode}:${launch.view}` : null,
    (v) => {
      if (v === null) return leave()
      const [m, view] = v.split(':') as [Mode, Launch['view']]
      choose(m, view)
    },
    null,
    {
      fresh: true,
      allow: (next) => {
        if (next !== null || !hasWork.current) return true
        if (window.confirm(t(LEAVE_MESSAGE))) return true
        stayHere()
        return false
      },
    },
  )

  if (new URLSearchParams(location.search).has('examples')) {
    return (
      <Shell onHome={() => (location.href = '/')}>
        <ExamplesPage />
      </Shell>
    )
  }

  return mode ? (
    <Workspace key={`${mode}-${launch.view}`} mode={mode} launch={launch} onChangeMode={leave} hasWork={hasWork} />
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
          aria-label={t("The Second Chance Pathway Planner, go to the homepage")}
          onClick={(e) => {
            e.preventDefault()
            if (onHome) onHome()
            else window.scrollTo({ top: 0, behavior: 'smooth' })
          }}
        >
          <Logo />
        </a>
        <LanguagePicker />
      </header>
      <main id="main">{children}</main>
      <footer className="site-footer">
        <div className="footer-text">
        {footer}
        <p>{t('This planner gives general information, not legal advice. For your situation, talk with a legal aid lawyer.')}</p>
        {getLang() !== 'en' && <p>{t('Translated with AI help. Please check important details, like legal terms, with someone who speaks the language.')}</p>}
        <p className="footer-source">
          {t('Clean Slate figure (170,000 people) source:')}{' '}
          <a href="https://ctmirror.org/2026/07/15/ct-clears-clean-slate-backlog/" target="_blank" rel="noreferrer">
            CT Mirror, July 15, 2026
          </a>
          . {t('Homepage photo (illustrative):')}{' '}
          <a href="https://unsplash.com/photos/four-women-laughing-outdoors-together-EU-Oc9VQHRg" target="_blank" rel="noreferrer">
            Crosby Hinze on Unsplash
          </a>
          .
        </p>
        </div>
        <LogoMark size={44} />
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
          {t('The Second Chance Pathway Planner')}
        </h1>
        <div className="hero">
          {photoOk && (
            <figure className="hero-figure">
              <img
                className="hero-photo"
                src="/hero-photo.jpg"
                alt={t("Four women with their arms around each other, laughing together outdoors")}
                onError={() => setPhotoOk(false)}
              />
            </figure>
          )}
          <div className="hero-band">
            <div className="hero-inner">
              <p className="hero-text">
                <strong>{t('Connecticut’s Clean Slate law has erased the convictions of 170,000 people.')}</strong>{' '}
                {t('Check if your record was cleared, build a 30-day plan, and practice the conversations that matter most.')}
              </p>
            </div>
          </div>
        </div>
        <p className="choose-prompt">{t('Let’s get started. Who are you planning for?')}</p>
        <div className="choices">
          <button type="button" className="choice choice-self" onClick={() => onChoose('self_serve')}>
            <span className="choice-title">
              <Lines text={t("I'm planning\nfor myself")} />
            </span>
            <span className="choice-sub">{t('Go at your own pace. One question at a time.')}</span>
            <span className="choice-cta">{t('Get started')} →</span>
          </button>
          <button type="button" className="choice choice-case" onClick={() => onChoose('caseworker')}>
            <span className="choice-title">
              <Lines text={t("I'm helping\na client")} />
            </span>
            <span className="choice-sub">{t('Paste case notes and get a plan you can print.')}</span>
            <span className="choice-cta">{t('Get started')} →</span>
          </button>
          <button type="button" className="choice choice-practice" onClick={() => onChoose('self_serve', 'practice')}>
            <span className="choice-title">
              <Lines text={t('I want to practice\na conversation')} />
            </span>
            <span className="choice-sub">{t('Practice with a hiring manager, landlord, or social worker.')}</span>
            <span className="choice-cta">{t('Get started')} →</span>
          </button>
        </div>
      </section>
    </Shell>
  )
}

function Workspace({
  mode, launch, onChangeMode, hasWork,
}: { mode: Mode; launch: Launch; onChangeMode: () => void; hasWork: { current: boolean } }) {
  const caseworker = mode === 'caseworker'
  // Answers, results, and the plan survive a reload in this tab only (see tabStore.ts).
  const [sessionId, setSessionId] = useState(() => launch.sessionId ?? loadTab(`${mode}.sid`, newSessionId()))
  const [view, setView] = useState<Launch['view']>(() => loadTab(`${mode}.view`, launch.view))
  const [messages, setMessages] = useState<ChatMessage[]>(() => loadTab(`${mode}.messages`, [{ role: 'assistant', text: GREETING[mode] }]))
  const [input, setInput] = useState('')
  const [cwStarted, setCwStarted] = useState(() => loadTab(`${mode}.started`, false))
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<ResultPayload | null>(() => loadTab(`${mode}.result`, null))
  useEffect(() => {
    if (busy) return // a half-finished request isn't saved; after a reload she can submit again
    saveTab(`${mode}.sid`, sessionId)
    saveTab(`${mode}.view`, view)
    saveTab(`${mode}.messages`, messages)
    saveTab(`${mode}.started`, cwStarted)
    saveTab(`${mode}.result`, result)
  }, [mode, sessionId, view, messages, cwStarted, result, busy])
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
    } else if (f.type === 'error') {
      setMessages((m) => [...m, { role: 'error', text: f.reply }])
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
      // Self-serve checks the record first; the plan is built after she adds her goals.
      await streamChat({ session_id: sessionId, mode, message: text, record_only: !caseworker }, onEvent)
    } catch (e) {
      const msg =
        e instanceof Error && e.message !== 'Failed to fetch'
          ? e.message
          : t('Could not reach the planner. Is the server running?')
      setMessages((m) => [...m, { role: 'error', text: msg }])
    } finally {
      setBusy(false)
      refreshUsage()
    }
  }

  /** Self-serve: build the 30-day plan from her goals, after the record check. */
  const buildPlan = async (goals: string[]) => {
    if (busy) return
    setMessages((m) => m.filter((x) => x.role !== 'error' && x.role !== 'safety'))
    setAgents(freshAgents())
    setBusy(true)
    try {
      await streamPost('/api/plan/stream', { session_id: sessionId, mode, goals }, onEvent)
    } catch (e) {
      const msg = e instanceof Error && e.message !== 'Failed to fetch' ? e.message : t('Could not reach the planner. Is the server running?')
      setMessages((m) => [...m, { role: 'error', text: msg }])
    } finally {
      setBusy(false)
      refreshUsage()
    }
  }

  const refreshUsage = () => void fetchUsage(sessionId).then((u) => u && setUsage(u))

  const clearAll = useCallback(async () => {
    await clearSession(sessionId)
    clearTab()
    history.replaceState({ entry: history.state?.entry ?? null }, '') // start the steps over
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
  hasWork.current = !!result || busy
  useHistoryStep<Launch['view']>('view', view, setView, launch.view)
  useHistoryStep<boolean>('cw', cwStarted, setCwStarted, false, {
    allow: (next) => {
      if (next || (!result && messages.length === 1)) return true
      if (window.confirm(t(LEAVE_MESSAGE))) void changeMode()
      else stayHere()
      return false
    },
  })
  // Someone who came in through "I want to practice a conversation" sees that label until they
  // start building a plan (then it's the planner, "I'm planning for myself").
  const modeLabel = t(!caseworker && launch.view === 'practice' && view === 'practice' && !result ? 'I want to practice' : MODE_LABEL[mode])
  const missingFacts = firstCaseworkerTurn ? notMentioned(input) : []
  const caseStep = view === 'practice' ? 4 : result ? 2 : busy || messages.length > 1 ? 1 : 0
  const backLabel = t(result ? (caseworker ? 'Back to the plan' : 'Back to my plan') : 'Build my plan')
  const footer = usage && caseworker ? (
    <p className="usage-meter">
      {t('This session: {used} tokens of {cap} · about ${cost}', {
        used: usage.overall.total_tokens.toLocaleString(),
        cap: usage.session_token_cap.toLocaleString(),
        cost: usage.overall.estimated_cost_usd.toFixed(4),
      })}
    </p>
  ) : null

  return (
    <Shell footer={footer} onHome={changeMode}>
      <div className="toolbar no-print">
        <p className="mode-pill">
          {modeLabel}
          <button type="button" className="link-button" onClick={changeMode}>
            {t('Change')}
          </button>
        </p>
        <div className="toolbar-right">
          <button type="button" className="btn btn-quiet" onClick={clearAll} disabled={busy}>
            {t(caseworker ? 'Clear the info' : 'Clear my info')}
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
          hasPlan={!!result?.plan}
          onBuildPlan={(goals) => void buildPlan(goals)}
          onLeave={() => void changeMode()}
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
          <h2 className="qa-question">{t('Let’s check your client’s record.')}</h2>
          <p className="qa-intro">
            {t('Paste your case notes or fill in the template, then submit. Adding notes takes a few minutes, and the record check and 30-day plan take about 2 more minutes. You can clear the info at any time. Ready to get started?')}
          </p>
          <button type="button" className="qa-choice qa-start" onClick={() => setCwStarted(true)}>
            {t('Let’s get started')}
          </button>
        </section>
      ) : (
      <div className={`workspace ${caseworker ? 'is-caseworker' : 'is-self'}`}>
        <div className="workspace-main">
          <section className="chat no-print" aria-label={t('Conversation')}>
            <ol className="messages">
              {messages.map((m, i) => (
                <li key={i} className={`msg msg-${m.role}`}>
                  {m.role === 'safety' ? (
                    <div role="alert">
                      <p>{t(m.text)}</p>
                      <div className="safety-resources">
                        {m.resources.map((r) => (
                          <ResourceCard key={r.id} r={r} plain />
                        ))}
                      </div>
                    </div>
                  ) : m.role === 'user' && caseworker && m.text.length > 200 ? (
                    // Long pasted notes shrink to one line once sent; the full text is one tap away.
                    <details className="notes-sent">
                      <summary>
                        {t('Case notes submitted')} <span className="notes-sent-show">{t('Show')}</span>
                      </summary>
                      <p>{m.text}</p>
                    </details>
                  ) : (
                    <p>{m.role === 'user' ? m.text : t(m.text)}</p>
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
                  {t(firstCaseworkerTurn ? 'Case notes' : 'Your message')}
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
                  placeholder={t(firstCaseworkerTurn ? 'Paste case notes here…' : 'Type your answer…')}
                  disabled={busy}
                />
                <div className="composer-row">
                  <button type="submit" className="btn" disabled={busy || !input.trim()}>
                    {t('Submit')}
                  </button>
                  {firstCaseworkerTurn && !input.trim() && (
                    <button type="button" className="btn btn-quiet" onClick={() => setInput(caseNotesTemplate(getLang()))}>
                      {t('Use the template')}
                    </button>
                  )}
                </div>
                {firstCaseworkerTurn && (
                  <div className="notes-help">
                    {missingFacts.length > 0 && (
                      <p className="notes-missing" aria-live="polite">
                        <strong>{t('Not mentioned yet:')}</strong> {missingFacts.map((f) => translateGap(f)).join(' · ')}
                        <span className="notes-missing-why">
                          {' '}{t('Without these, some convictions may come back “Needs more information”.')}
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

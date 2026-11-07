import { useCallback, useEffect, useRef, useState } from 'react'

type Mode = 'self_serve' | 'caseworker'

type HelloUsage = {
  model_calls: number
  input_tokens: number
  cached_input_tokens: number
  output_tokens: number
  total_tokens: number
}

type HelloResponse = {
  reply: string
  mode: Mode
  usage: HelloUsage
  session_tokens_used: number
  session_token_cap: number
}

const MODE_KEY = 'scpp.mode'
const SESSION_KEY = 'scpp.session_id'

const MODE_LABEL: Record<Mode, string> = {
  self_serve: "I'm planning for myself",
  caseworker: "I'm helping a client",
}

function newSessionId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return `s-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`
}

function getSessionId(): string {
  let id = sessionStorage.getItem(SESSION_KEY)
  if (!id) {
    id = newSessionId()
    sessionStorage.setItem(SESSION_KEY, id)
  }
  return id
}

function storedMode(): Mode | null {
  const m = sessionStorage.getItem(MODE_KEY)
  return m === 'self_serve' || m === 'caseworker' ? m : null
}

const fmt = (n: number) => n.toLocaleString()

export default function App() {
  const [mode, setMode] = useState<Mode | null>(storedMode)

  const choose = (m: Mode) => {
    sessionStorage.setItem(MODE_KEY, m)
    setMode(m)
  }

  const reset = () => {
    sessionStorage.removeItem(MODE_KEY)
    setMode(null)
  }

  return (
    <div className="page">
      <header className="site-header">
        <span className="logo" aria-hidden="true" />
        <span className="site-name">Second Chance Pathway Planner</span>
      </header>
      <main id="main">{mode ? <Placeholder mode={mode} onChange={reset} /> : <Landing onChoose={choose} />}</main>
      <footer className="site-footer">
        This planner gives general information, not legal advice. For your situation, talk with a
        legal aid lawyer.
      </footer>
    </div>
  )
}

function Landing({ onChoose }: { onChoose: (m: Mode) => void }) {
  return (
    <section className="landing" aria-labelledby="landing-title">
      <h1 id="landing-title">Your next chapter starts with a plan.</h1>
      <p className="lead">
        Check whether your Connecticut record may have been cleared under the Clean Slate law, build a
        30-day plan, and practice the conversations that matter.
      </p>
      <p className="choose-prompt">Who are you planning for?</p>
      <div className="choices">
        <button type="button" className="choice choice-self" onClick={() => onChoose('self_serve')}>
          <span className="choice-title">{MODE_LABEL.self_serve}</span>
          <span className="choice-sub">Go at your own pace. Your answers stay in this browser session.</span>
        </button>
        <button type="button" className="choice choice-case" onClick={() => onChoose('caseworker')}>
          <span className="choice-title">{MODE_LABEL.caseworker}</span>
          <span className="choice-sub">For caseworkers and reentry staff working with a client.</span>
        </button>
      </div>
    </section>
  )
}

type Status = 'loading' | 'done' | 'error'

function Placeholder({ mode, onChange }: { mode: Mode; onChange: () => void }) {
  const [status, setStatus] = useState<Status>('loading')
  const [data, setData] = useState<HelloResponse | null>(null)
  const [error, setError] = useState('')
  const started = useRef(false)

  const sayHello = useCallback(async () => {
    setStatus('loading')
    setError('')
    try {
      const res = await fetch('/api/hello', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode, session_id: getSessionId() }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(typeof body.detail === 'string' ? body.detail : `Request failed (${res.status}).`)
      setData(body as HelloResponse)
      setStatus('done')
    } catch (e) {
      setError(e instanceof Error && e.message !== 'Failed to fetch' ? e.message : 'Could not reach the planner. Is the server running?')
      setStatus('error')
    }
  }, [mode])

  useEffect(() => {
    if (started.current) return // StrictMode runs effects twice in dev; only call the model once
    started.current = true
    void sayHello()
  }, [sayHello])

  return (
    <section className="placeholder" aria-labelledby="ph-title">
      <p className="mode-pill">
        {MODE_LABEL[mode]}
        <button type="button" className="link-button" onClick={onChange}>
          Change
        </button>
      </p>
      <h1 id="ph-title">{mode === 'self_serve' ? 'Welcome. Let’s take this one step at a time.' : 'Welcome. Let’s set up a plan with your client.'}</h1>

      <div className="card" aria-live="polite" aria-busy={status === 'loading'}>
        {status === 'loading' && (
          <p className="loading">
            <span className="spinner" aria-hidden="true" /> Getting a welcome message…
          </p>
        )}
        {status === 'error' && (
          <div className="error" role="alert">
            <p>
              <strong>Something went wrong.</strong> {error}
            </p>
            <button type="button" className="btn" onClick={() => void sayHello()}>
              Try again
            </button>
          </div>
        )}
        {status === 'done' && data && (
          <>
            <p className="reply">{data.reply}</p>
            <dl className="tokens" aria-label="Tokens used for this message">
              <div>
                <dt>Input</dt>
                <dd>{fmt(data.usage.input_tokens)}</dd>
              </div>
              <div>
                <dt>Cached input</dt>
                <dd>{fmt(data.usage.cached_input_tokens)}</dd>
              </div>
              <div>
                <dt>Output</dt>
                <dd>{fmt(data.usage.output_tokens)}</dd>
              </div>
              <div>
                <dt>Total</dt>
                <dd>{fmt(data.usage.total_tokens)}</dd>
              </div>
            </dl>
            <p className="session-meter">
              This session: {fmt(data.session_tokens_used)} of {fmt(data.session_token_cap)} tokens used
            </p>
          </>
        )}
      </div>

      <p className="coming-soon">Eligibility check, 30-day plan, and conversation practice are coming next.</p>
    </section>
  )
}

import { useEffect, useRef, useState } from 'react'

import { fetchScenarios, newSessionId, type ScenarioSuggestion, startPractice, streamPost, type StreamEvent } from './api'
import { useHistoryStep } from './historyStep'
import { t } from './i18n'
import { withoutUnansweredQuestion } from './practiceDisplay'
import { ResourceCard } from './Results'
import {
  type CoachCard,
  type Difficulty,
  type Mode,
  type PracticeFinal,
  type PracticeSummary,
  type Resource,
  type ScenarioCard,
} from './types'

const DIFFICULTIES: { id: Difficulty; label: string; hint: string }[] = [
  { id: 'friendly', label: 'Friendly', hint: 'Warm and patient' },
  { id: 'neutral', label: 'Neutral', hint: 'Businesslike' },
  { id: 'skeptical', label: 'Skeptical', hint: 'Polite but doubtful' },
]
/** Why a scenario is suggested, worded for a caseworker (the backend's reasons say "you"). */
const CASEWORKER_REASON: Record<string, string> = {
  reunification: 'Your notes mention a family court or DCF case.',
  job_interview: 'Your notes say the client is looking for work.',
  landlord: 'Your notes say the client needs a stable place to live.',
}
const HARDER: Record<Difficulty, Difficulty | null> = { friendly: 'neutral', neutral: 'skeptical', skeptical: null }

const SKILL_LABEL: Record<string, string> = {
  honest_and_accurate: 'Honest',
  brief: 'Brief',
  ownership: 'Ownership',
  forward: 'Looking forward',
  calm_confidence: 'Calm',
}

type Item =
  | { kind: 'partner'; name: string; text: string }
  | { kind: 'me'; text: string; coach?: CoachCard; pending?: boolean }
  | { kind: 'safety'; text: string; resources: Resource[] }
  | { kind: 'note'; text: string }

// The Web Speech API is not in TypeScript's DOM types in every setup.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const SpeechRecognitionImpl: any =
  typeof window !== 'undefined' ? (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition : null

export default function PracticeRoom({
  sessionId,
  mode,
  initialScenario,
  initialDifficulty,
  onBack,
  backLabel = 'Back to my plan',
  onTurnDone,
}: {
  sessionId: string
  mode: Mode
  initialScenario?: string
  initialDifficulty?: Difficulty
  /** Shown on the end screen (the top "Back to my plan" button lives in the page toolbar). */
  onBack?: () => void
  backLabel?: string
  onTurnDone: () => void
}) {
  const caseworker = mode === 'caseworker'
  const [scenarios, setScenarios] = useState<ScenarioCard[]>([])
  const [suggested, setSuggested] = useState<ScenarioSuggestion>(null)
  const [scenarioId, setScenarioId] = useState(initialScenario ?? '')
  const [difficulty, setDifficulty] = useState<Difficulty>(initialDifficulty ?? 'friendly')
  const [stage, setStage] = useState<'choose' | 'chat'>('choose')
  useHistoryStep<'choose' | 'chat'>('practice', stage, setStage, 'choose')
  const [items, setItems] = useState<Item[]>([])
  const [turn, setTurn] = useState(0)
  const [maxTurns, setMaxTurns] = useState(5)
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [paused, setPaused] = useState(false)
  const [summary, setSummary] = useState<PracticeSummary | null>(null)
  const [finished, setFinished] = useState(false)
  const [listening, setListening] = useState(false)
  const [copied, setCopied] = useState('')
  const recognizer = useRef<any>(null)
  const bottom = useRef<HTMLDivElement>(null)

  useEffect(() => {
    void fetchScenarios(sessionId).then(({ scenarios: list, suggested: sug }) => {
      setScenarios(list)
      setSuggested(sug)
      if (sug && !initialScenario) setScenarioId((cur) => cur || sug.id)
    })
  }, [sessionId, initialScenario])

  useEffect(() => {
    if (stage === 'chat') bottom.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [items, busy, paused, summary, stage])



  const onEvent = ({ event, data }: StreamEvent) => {
    if (event === 'error') {
      if (data.kind !== 'limit') setItems((it) => [...it, { kind: 'note', text: data.message }])
    } else if (event === 'final') {
      onFinal(data as PracticeFinal)
    }
  }

  const dropPending = (it: Item[]) => it.map((x) => (x.kind === 'me' && x.pending ? { ...x, pending: false } : x))

  const onFinal = (f: PracticeFinal) => {
    if ((f.type === 'turn' || f.type === 'ended') && 'coach' in f) {
      setItems((it) => {
        const out = [...it]
        for (let i = out.length - 1; i >= 0; i--) {
          const x = out[i]
          if (x.kind === 'me' && x.pending) {
            out[i] = { ...x, coach: f.coach, pending: false }
            break
          }
        }
        return [...out, { kind: 'partner', name: f.partner.name, text: f.partner.line }]
      })
      setTurn(f.turn_number)
      setMaxTurns(f.max_turns)
      if (f.type === 'ended') {
        setSummary(f.summary ?? null)
        setFinished(true)
      }
    } else if (f.type === 'ended') {
      const reply = 'reply' in f ? f.reply : undefined
      setItems(dropPending)
      setSummary(f.summary ?? null)
      setFinished(true)
      if (!f.summary && reply) setItems((it) => [...it, { kind: 'note', text: reply }])
    } else if (f.type === 'paused') {
      setItems(dropPending)
      setPaused(true)
    } else if (f.type === 'safety') {
      setItems((it) => [...dropPending(it), { kind: 'safety', text: f.message, resources: f.resources }])
    } else {
      const reply = 'reply' in f ? f.reply : t('Something went wrong.')
      setItems((it) => [...dropPending(it), { kind: 'note', text: reply }])
    }
  }

  const begin = async (id = scenarioId, diff = difficulty) => {
    if (!id) return
    setBusy(true)
    try {
      const r = await startPractice({ session_id: sessionId, mode, scenario_id: id, difficulty: diff })
      setScenarioId(id)
      setDifficulty(diff)
      setItems([{ kind: 'partner', name: r.partner.name, text: r.partner.line }])
      setTurn(0)
      setMaxTurns(r.max_turns)
      setSummary(null)
      setFinished(false)
      setPaused(false)
      setStage('chat')
    } catch (e) {
      setCopied(e instanceof Error ? e.message : t('Could not start practice.'))
    } finally {
      setBusy(false)
    }
  }

  const run = async (path: string, body: object) => {
    setBusy(true)
    try {
      await streamPost(path, body, onEvent)
    } catch (e) {
      setItems((it) => [
        ...dropPending(it),
        { kind: 'note', text: e instanceof Error && e.message !== 'Failed to fetch' ? e.message : 'Could not reach the planner.' },
      ])
    } finally {
      setBusy(false)
      onTurnDone()
    }
  }

  const send = async () => {
    const text = input.trim()
    if (!text || busy || finished) return
    recognizer.current?.stop()
    setInput('')
    setPaused(false)
    setItems((it) => [...it, { kind: 'me', text, pending: true }])
    await run('/api/practice/turn/stream', { session_id: sessionId, mode, message: text })
  }

  const endNow = () => {
    setPaused(false)
    void run('/api/practice/end/stream', { session_id: sessionId, mode })
  }

  const toggleMic = () => {
    if (!SpeechRecognitionImpl) return
    if (listening) {
      recognizer.current?.stop()
      return
    }
    const rec = new SpeechRecognitionImpl()
    rec.lang = 'en-US'
    rec.interimResults = false
    rec.continuous = false
    rec.onresult = (e: any) => {
      const said = Array.from(e.results as ArrayLike<any>)
        .map((r) => r[0].transcript)
        .join(' ')
      setInput((cur) => (cur ? `${cur} ${said}` : said))
    }
    rec.onend = () => setListening(false)
    rec.onerror = () => setListening(false)
    recognizer.current = rec
    setListening(true)
    rec.start()
  }

  const copyLink = async (id: string) => {
    const url = `${location.origin}/?practice=${encodeURIComponent(id)}&difficulty=${difficulty}&sid=${newSessionId()}`
    try {
      await navigator.clipboard.writeText(url)
      setCopied(t('Link copied. Send it to your client: {url}', { url }))
    } catch {
      setCopied(t('Copy this link and send it to your client: {url}', { url }))
    }
  }

  const scenario = scenarios.find((s) => s.id === scenarioId)

  if (stage === 'choose') {
    return (
      <section className="practice" aria-labelledby="practice-title">
        <div className="practice-head">
          <h1 id="practice-title">{t('Practice a conversation')}</h1>
        </div>
        <p className="lead">
          {caseworker
            ? t('Pick a scenario to rehearse with your client, or send them a link to practice on their own.')
            : t('Rehearse a hard conversation in a safe place. A coach gives you feedback after each answer.')}
        </p>

        <h2 className="choose-prompt">{t('1. Choose a conversation')}</h2>
        <div className="scenario-cards" role="radiogroup" aria-label={t('Scenario')}>
          {scenarios.map((s) => (
            <div key={s.id} className={`scenario-card ${scenarioId === s.id ? 'is-selected' : ''}`}>
              <button
                type="button"
                role="radio"
                aria-checked={scenarioId === s.id}
                className="scenario-pick"
                onClick={() => setScenarioId(s.id)}
              >
                {suggested?.id === s.id && <span className="scenario-suggested">{t('Suggested for you')}</span>}
                <span className="scenario-title">{t(s.title)}</span>
                <span className="scenario-desc">{t(s.description)}</span>
                <span className="scenario-who">{t("You'll talk with {name}", { name: s.character })}</span>
                {suggested?.id === s.id && (
                  <span className="scenario-reason">
                    {t(caseworker ? CASEWORKER_REASON[suggested.id] ?? suggested.reason : suggested.reason)}
                  </span>
                )}
              </button>
              {caseworker && (
                <button type="button" className="link-button" onClick={() => void copyLink(s.id)}>
                  {t('Send practice link to client')}
                </button>
              )}
            </div>
          ))}
        </div>

        <h2 className="choose-prompt">{t('2. How should they act?')}</h2>
        <div className="difficulty" role="radiogroup" aria-label={t('Difficulty')}>
          {DIFFICULTIES.map((d) => (
            <button
              key={d.id}
              type="button"
              role="radio"
              aria-checked={difficulty === d.id}
              className={`difficulty-btn ${difficulty === d.id ? 'is-selected' : ''}`}
              onClick={() => setDifficulty(d.id)}
            >
              <span>{t(d.label)}</span>
              <small>{t(d.hint)}</small>
            </button>
          ))}
        </div>

        {copied && (
          <p className="copied" role="status">
            {copied}
          </p>
        )}
        <button type="button" className="btn btn-big" disabled={!scenarioId || busy} onClick={() => void begin()}>
          {t(busy ? 'Starting…' : 'Start practice')}
        </button>
      </section>
    )
  }

  const harder = HARDER[difficulty]

  return (
    <div className={`workspace ${caseworker ? 'is-caseworker' : 'is-self'}`}>
      <section className="practice workspace-main" aria-labelledby="practice-chat-title">
        <div className="practice-head">
          <div>
            <h1 id="practice-chat-title">{t(scenario?.title ?? 'Practice')}</h1>
            <p className="practice-meta">
              {t(DIFFICULTIES.find((d) => d.id === difficulty)?.label ?? '')} ·{' '}
              {t('Answer {n} of {total}', { n: Math.min(turn + (finished ? 0 : 1), maxTurns), total: maxTurns })}
            </p>
          </div>
          <button type="button" className="btn btn-quiet" onClick={() => setStage('choose')} disabled={busy}>
            {t('Change scenario')}
          </button>
        </div>

        <ol className="practice-chat">
          {(finished ? withoutUnansweredQuestion(items) : items).map((x, i) => {
            if (x.kind === 'partner')
              return (
                <li key={i} className="pc pc-partner">
                  <span className="pc-name">{x.name}</span>
                  <p>{t(x.text)}</p>
                </li>
              )
            if (x.kind === 'me')
              return (
                <li key={i} className="pc pc-me">
                  <p className="pc-bubble">{x.text}</p>
                  {x.pending && (
                    <p className="pc-pending">
                      <span className="spinner" aria-hidden="true" /> {t('Coach is watching…')}
                    </p>
                  )}
                  {x.coach && <Coach card={x.coach} open={i >= items.length - 2} />}
                </li>
              )
            if (x.kind === 'safety')
              return (
                <li key={i} className="msg msg-safety" role="alert">
                  <p>
                    <strong>{t(x.text)}</strong>
                  </p>
                  <div className="safety-resources">
                    {x.resources.map((r) => (
                      <ResourceCard key={r.id} r={r} plain />
                    ))}
                  </div>
                </li>
              )
            return (
              <li key={i} className="pc-note">
                {x.text}
              </li>
            )
          })}
        </ol>

        {paused && !finished && (
          <div className="pause-banner" role="status">
            <p>
              <strong>{t('Paused.')}</strong> {t('Take your time.')}
            </p>
            <div className="btn-row">
              <button type="button" className="btn" onClick={() => setPaused(false)}>
                {t('Resume')}
              </button>
              <button type="button" className="btn btn-quiet" onClick={endNow} disabled={busy}>
                {t('End and see feedback')}
              </button>
            </div>
          </div>
        )}

        {finished ? (
          <EndScreen
            summary={summary}
            caseworker={caseworker}
            onAgain={() => void begin(scenarioId, difficulty)}
            onHarder={harder ? () => void begin(scenarioId, harder) : undefined}
            onChoose={() => setStage('choose')}
            onBack={onBack}
            backLabel={backLabel}
          />
        ) : (
          !paused && (
            <form
              className="composer"
              onSubmit={(e) => {
                e.preventDefault()
                void send()
              }}
            >
              <label htmlFor="practice-msg" className="sr-only">
                {t('Your answer')}
              </label>
              <textarea
                id="practice-msg"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    void send()
                  }
                }}
                rows={3}
                maxLength={4000}
                placeholder={t(listening ? 'Listening… speak your answer' : 'Type or say your answer…')}
                disabled={busy}
              />
              <div className="composer-actions">
                {SpeechRecognitionImpl && (
                  <button
                    type="button"
                    className={`btn btn-quiet mic ${listening ? 'is-listening' : ''}`}
                    onClick={toggleMic}
                    aria-pressed={listening}
                    disabled={busy}
                  >
                    {listening ? `● ${t('Stop')}` : `🎤 ${t('Speak')}`}
                  </button>
                )}
                <button type="submit" className="btn" disabled={busy || !input.trim()}>
                  {t('Send')}
                </button>
              </div>
            </form>
          )
        )}

        {!finished && (
          <div className="btn-row practice-controls">
            <button type="button" className="btn btn-quiet" onClick={() => setPaused(true)} disabled={busy || paused}>
              {t('Pause')}
            </button>
            <button type="button" className="btn btn-quiet" onClick={endNow} disabled={busy || turn === 0}>
              {t('End and see feedback')}
            </button>
          </div>
        )}
        <div ref={bottom} />
      </section>


    </div>
  )
}

function Dots({ value }: { value: number }) {
  return (
    <span className="dots" aria-label={t('{n} of 3', { n: value })}>
      {[1, 2, 3].map((n) => (
        <span key={n} className={`dot ${n <= value ? 'on' : ''}`} />
      ))}
    </span>
  )
}

function Coach({ card, open }: { card: CoachCard; open: boolean }) {
  const total = Object.values(card.scores).reduce((a, b) => a + b, 0)
  const replaced = card.guards.some((g) => g.guard === 'denial_replaced')
  return (
    <details className="coach" open={open}>
      <summary>
        {t('Coach feedback')} <span className="coach-total">{total}/15</span>
      </summary>
      <ul className="skills">
        {card.skills.map((s) => (
          <li key={s}>
            <span>{t(SKILL_LABEL[s] ?? s)}</span>
            <Dots value={card.scores[s] ?? 0} />
          </li>
        ))}
      </ul>
      <p>
        <strong>{t('What worked:')}</strong> {card.strength}
      </p>
      <p>
        <strong>{t('Try this:')}</strong> {card.tip}
      </p>
      <blockquote className="try-saying">
        <span className="try-label">{t('Try saying…')}</span>
        {card.try_saying}
      </blockquote>
      {replaced && (
        <p className="guard-note">
          {t("Safety check: we replaced a suggested answer that said you have no record, because your Clean Slate result doesn't support that yet.")}
        </p>
      )}
      {card.legal_fact && (
        <div className="legal-fact">
          <strong>{t('Good to know')}</strong>
          <p>{t(card.legal_fact.text)}</p>
          <a href={card.legal_fact.source} target="_blank" rel="noreferrer" aria-label={t('Source for this legal fact (opens in a new tab)')}>
            {t('Source')}
          </a>
        </div>
      )}
    </details>
  )
}

function EndScreen({
  summary,
  caseworker,
  onAgain,
  onHarder,
  onChoose,
  onBack,
  backLabel,
}: {
  summary: PracticeSummary | null
  caseworker: boolean
  onAgain: () => void
  onHarder?: () => void
  onChoose: () => void
  onBack?: () => void
  backLabel: string
}) {
  return (
    <section className="card end-card" aria-labelledby="end-title">
      <h2 id="end-title">{t(caseworker ? 'Session summary' : 'Nice work. Here is how it went.')}</h2>
      {summary ? (
        <>
          <p className="end-summary">{summary.summary}</p>
          {summary.best_quote && (
            <figure className="best-quote">
              <blockquote>“{summary.best_quote}”</blockquote>
              <figcaption>{t(caseworker ? 'Strongest moment' : 'Your strongest moment')}</figcaption>
            </figure>
          )}
          <div className="score-compare" aria-label={t('First and last answer scores')}>
            <div>
              <span className="score-label">{t('First answer')}</span>
              <span className="score-num">
                {summary.score_first}/{summary.max_score}
              </span>
            </div>
            <span aria-hidden="true" className="score-arrow">
              →
            </span>
            <div>
              <span className="score-label">{t('Last answer')}</span>
              <span className="score-num">
                {summary.score_last}/{summary.max_score}
              </span>
            </div>
          </div>
        </>
      ) : (
        <p>{t('Answer at least one question to get feedback.')}</p>
      )}
      <div className="btn-row">
        <button type="button" className="btn" onClick={onAgain}>
          {t('Practice again')}
        </button>
        {onHarder && (
          <button type="button" className="btn btn-quiet" onClick={onHarder}>
            {t('Try a harder version')}
          </button>
        )}
        <button type="button" className="btn btn-quiet" onClick={onChoose}>
          {t('Pick another scenario')}
        </button>
        {onBack && (
          <button type="button" className="btn btn-quiet" onClick={onBack}>
            ← {backLabel}
          </button>
        )}
      </div>
    </section>
  )
}

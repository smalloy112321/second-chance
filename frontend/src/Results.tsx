import { convictedLine, erasureLine, overallBadge, statusLabel, waitingNote } from './resultsDisplay'
import type { Mode, Resource, ResultPayload } from './types'

function Badge({ status }: { status: string }) {
  const s = statusLabel(status)
  return <span className={`badge badge-${s.tone}`}>{s.label}</span>
}

export function ResourceCard({ r, hideNotes = false }: { r: Resource; hideNotes?: boolean }) {
  return (
    <div className="resource">
      <div className="resource-name">{r.name}</div>
      <ul className="resource-contact">
        {r.phone && (
          <li>
            <span className="label">Phone</span> <a href={`tel:${r.phone.replace(/[^\d+]/g, '')}`}>{r.phone}</a>
          </li>
        )}
        {r.website && (
          <li>
            <span className="label">Website</span>{' '}
            <a href={r.website} target="_blank" rel="noreferrer">
              {r.website.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '')}
            </a>
          </li>
        )}
        {r.address && (
          <li>
            <span className="label">Address</span> {r.address}
          </li>
        )}
      </ul>
      {r.notes && !hideNotes && <p className="resource-notes">{r.notes}</p>}
      <p className="resource-checked">Checked {r.verified_on}</p>
    </div>
  )
}

const GUIDANCE: Record<string, string> = {
  can_answer_no_if_confirmed: 'May answer “no” only after an official record check confirms the erasure.',
  must_disclose: 'Treat the conviction as still on the record when answering questions, for now.',
  unsure_ask_legal_aid: 'Ask legal aid before answering questions about convictions.',
}

export default function Results({
  result,
  mode,
  db,
  onPractice,
  show = 'all',
  onShowPlan,
  onBackToResults,
}: {
  result: ResultPayload
  mode: Mode
  db: Record<string, Resource>
  onPractice?: () => void
  /** 'slate' = Clean Slate results only, 'plan' = 30-day plan only (self-serve steps); 'all' = both */
  show?: 'all' | 'slate' | 'plan'
  onShowPlan?: () => void
  onBackToResults?: () => void
}) {
  const lookup = (id: string | null) => (id ? result.resources[id] ?? db[id] : undefined)
  const caseworker = mode === 'caseworker'
  const simple = show === 'slate' // self-serve results step: convictions first, no summary on top

  return (
    <section className="results" aria-labelledby="results-title">
      <div className="results-head">
        <h2 id="results-title">{show === 'plan' ? 'Your 30-day plan' : caseworker ? 'Client results' : 'Your results'}</h2>
        <div className="btn-row no-print">
          {onPractice && show !== 'slate' && (
            <button type="button" className="btn" onClick={onPractice}>
              Practice a conversation
            </button>
          )}
          {caseworker && (
            <button type="button" className="btn btn-quiet" onClick={() => window.print()}>
              Print plan
            </button>
          )}
        </div>
      </div>

      {show !== 'plan' && (
        <>
      <article className="card slate-card">
        {simple ? null : (
          <>
            <div className="slate-top">
              <h3>Clean Slate check</h3>
              <Badge status={overallBadge(result.rules)} />
            </div>
            <p className="headline">{result.screener.headline}</p>
            <p className="explanation">{result.screener.explanation}</p>
          </>
        )}

        <ul className="conviction-list">
          {result.rules.convictions.map((c) => {
            const later = erasureLine(c)
            const note = waitingNote(c)
            return (
              <li key={c.id}>
                <div className="conviction-desc">{c.description}</div>
                <div className="conviction-meta">
                  <span>{convictedLine(c)}</span>
                  {later && <span>{later}</span>}
                  {caseworker && <span className="code">{c.reason_code}</span>}
                </div>
                <div className="conviction-outcome">
                  <Badge status={c.status} />
                </div>
                {note && <p className="conviction-note">{note}</p>}
              </li>
            )
          })}
        </ul>

        {caseworker && (
          <p className="guidance">
            <strong>Disclosure:</strong> {GUIDANCE[result.screener.disclosure_guidance]}{' '}
            <span className="code">{result.screener.disclosure_guidance}</span>
          </p>
        )}

        {result.next_steps.length > 0 && (
          <>
            <h3 className="steps-title">{caseworker ? 'Recommended next steps' : 'Here are your recommended next steps:'}</h3>
            <ol className="next-steps">
              {result.next_steps.map((s) => (
                <li key={s.code}>
                  <strong className="step-title">{s.title}</strong>
                  <p className="step-detail">{s.detail}</p>
                  {s.how && s.how.length > 0 && (
                    <ol className="step-how">
                      {s.how.map((h) => (
                        <li key={h}>{h}</li>
                      ))}
                    </ol>
                  )}
                  {s.links && s.links.length > 0 && (
                    <div className="step-links">
                      {s.links.map((l) => (
                        <a
                          key={l.url}
                          className={l.primary ? 'btn step-main' : 'step-link'}
                          href={l.url}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {l.label} <span aria-hidden="true">↗</span>
                        </a>
                      ))}
                    </div>
                  )}
                  {s.resource_ids.map((id) => {
                    const r = lookup(id)
                    return r ? <ResourceCard key={id} r={r} /> : null
                  })}
                </li>
              ))}
            </ol>
          </>
        )}
        <p className="disclaimer">{result.rules.disclaimer}</p>
      </article>

          {show === 'slate' && onShowPlan && (
            <div className="results-next no-print">
              <button type="button" className="btn qa-next" onClick={onShowPlan}>
                See my 30-day plan →
              </button>
            </div>
          )}
        </>
      )}

      {show !== 'slate' && (
        <>
          {show === 'plan' && onBackToResults && (
            <button type="button" className="link-button results-back no-print" onClick={onBackToResults}>
              ← Back to my results
            </button>
          )}
      {show !== 'plan' && <h3 className="plan-title">30-day plan</h3>}
      {result.needs_human_review && (
        <div className="review-banner" role="alert">
          <strong>Needs human review.</strong> Our checker still found problems after one revision. Please review this
          plan with a caseworker or legal aid before acting on it.
          <ul>
            {result.verifier.issues.map((i, n) => (
              <li key={n}>
                {i.step_id ? `${i.step_id}: ` : ''}
                {i.problem}
              </li>
            ))}
          </ul>
        </div>
      )}
      <p className="plan-summary">{result.plan.summary}</p>
      <div className="weeks">
        {result.plan.weeks.map((w) => (
          <article key={w.week} className="card week">
            <h4>
              Week {w.week}: <span>{w.focus}</span>
            </h4>
            <ol className="steps">
              {w.steps.map((s) => {
                const r = lookup(s.resource_id)
                return (
                  <li key={s.step_id} className={`step priority-${s.priority}`}>
                    <p className="step-action">{s.action}</p>
                    <p className="step-why">{s.why}</p>
                    {r && <ResourceCard r={r} />}
                  </li>
                )
              })}
            </ol>
          </article>
        ))}
      </div>
        </>
      )}
    </section>
  )
}

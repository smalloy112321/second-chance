import type { Mode, Resource, ResultPayload } from './types'

type Tone = 'green' | 'blue' | 'gray' | 'amber' | 'neutral'

const STATUS: Record<string, { label: string; tone: Tone }> = {
  likely_erased: { label: 'Likely erased', tone: 'green' },
  likely_erased_cannabis: { label: 'Likely erased (cannabis law)', tone: 'green' },
  partly_erased: { label: 'Partly erased', tone: 'green' },
  eligible_on: { label: 'Expected on a date', tone: 'blue' },
  not_yet_supervision: { label: 'Waiting on supervision', tone: 'blue' },
  not_yet_sentence: { label: 'Waiting on sentence', tone: 'blue' },
  petition: { label: 'Court petition possible', tone: 'gray' },
  petition_pre_2000: { label: 'Court petition possible', tone: 'gray' },
  petition_cannabis: { label: 'Court petition possible', tone: 'gray' },
  needs_review: { label: 'Needs review', tone: 'amber' },
  not_eligible: { label: 'Not covered', tone: 'neutral' },
}

function Badge({ status }: { status: string }) {
  const s = STATUS[status] ?? { label: status, tone: 'neutral' as Tone }
  return <span className={`badge badge-${s.tone}`}>{s.label}</span>
}

function fmtDate(iso: string | null) {
  if (!iso) return null
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })
}

export function ResourceCard({ r }: { r: Resource }) {
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
      {r.notes && <p className="resource-notes">{r.notes}</p>}
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
}: {
  result: ResultPayload
  mode: Mode
  db: Record<string, Resource>
}) {
  const lookup = (id: string | null) => (id ? result.resources[id] ?? db[id] : undefined)
  const caseworker = mode === 'caseworker'

  return (
    <section className="results" aria-labelledby="results-title">
      <div className="results-head">
        <h2 id="results-title">{caseworker ? 'Client results' : 'Your results'}</h2>
        {caseworker && (
          <button type="button" className="btn btn-quiet no-print" onClick={() => window.print()}>
            Print plan
          </button>
        )}
      </div>

      <article className="card slate-card">
        <div className="slate-top">
          <h3>Clean Slate check</h3>
          <Badge status={result.rules.overall} />
        </div>
        <p className="headline">{result.screener.headline}</p>
        <p className="explanation">{result.screener.explanation}</p>

        <ul className="conviction-list">
          {result.rules.convictions.map((c) => (
            <li key={c.id}>
              <div className="conviction-row">
                <span className="conviction-desc">{c.description}</span>
                <Badge status={c.status} />
              </div>
              <div className="conviction-meta">
                {c.eligible_on && <span>Date: {fmtDate(c.eligible_on)}</span>}
                {caseworker && <span className="code">{c.reason_code}</span>}
              </div>
            </li>
          ))}
        </ul>

        {caseworker && (
          <p className="guidance">
            <strong>Disclosure:</strong> {GUIDANCE[result.screener.disclosure_guidance]}{' '}
            <span className="code">{result.screener.disclosure_guidance}</span>
          </p>
        )}

        {result.next_steps.length > 0 && (
          <>
            <h4>Next steps for the record</h4>
            <ol className="next-steps">
              {result.next_steps.map((s) => (
                <li key={s.code}>
                  <strong>{s.title}</strong>
                  <p>{s.detail}</p>
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

      <h3 className="plan-title">30-day plan</h3>
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
    </section>
  )
}

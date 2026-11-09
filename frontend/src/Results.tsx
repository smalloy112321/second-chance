import PlanView from './PlanView'
import { getLang, t } from './i18n'
import { stepLabel } from './planDisplay'
import { convictedLine, erasureLine, overallBadge, statusLabel, waitingNote } from './resultsDisplay'
import type { Mode, Resource, ResultPayload } from './types'

function Badge({ status }: { status: string }) {
  const s = statusLabel(status)
  return <span className={`badge badge-${s.tone}`}>{t(s.label)}</span>
}

/** `plain` shows the short tip written for her instead of our research notes (used on crisis messages). */
export function ResourceCard({ r, hideNotes = false, plain = false }: { r: Resource; hideNotes?: boolean; plain?: boolean }) {
  return (
    <div className="resource">
      <div className="resource-name">{r.name}</div>
      <ul className="resource-contact">
        {r.phone && (
          <li>
            <span className="label">{t('Phone')}</span> <a href={`tel:${r.phone.replace(/[^\d+]/g, '')}`}>{r.phone}</a>
          </li>
        )}
        {r.website && (
          <li>
            <span className="label">{t('Website')}</span>{' '}
            <a href={r.website} target="_blank" rel="noreferrer">
              {r.website.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '')}
            </a>
          </li>
        )}
        {r.address && (
          <li>
            <span className="label">{t('Address')}</span> {r.address}
          </li>
        )}
      </ul>
      {r.tip && <p className="resource-tip">{t(r.tip)}</p>}
      {/* Our research notes (sources, caveats) stay one tap away instead of filling the card. */}
      {!plain && !hideNotes && r.notes && (
        r.tip ? (
          <details className="resource-more">
            <summary>{t(getLang() === 'en' ? 'More details' : 'More details (in English)')}</summary>
            <p className="resource-notes">{r.notes}</p>
          </details>
        ) : (
          <p className="resource-notes">{r.notes}</p>
        )
      )}
      <p className="resource-checked">{t('Checked {date}', { date: r.verified_on })}</p>
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
        <h2 id="results-title">{t(show === 'plan' ? 'Your 30-day plan' : caseworker ? 'Client results' : 'Your results')}</h2>
        <div className="btn-row no-print">
          {onPractice && show !== 'slate' && (
            <button type="button" className="btn" onClick={onPractice}>
              {t('Practice a conversation')}
            </button>
          )}
          {(caseworker || show === 'plan') && (
            <button type="button" className="btn btn-quiet" onClick={() => window.print()}>
              {t(caseworker ? 'Print plan' : 'Save or print my plan')}
            </button>
          )}
        </div>
      </div>

      {show === 'all' && (
        <nav className="jump-links no-print" aria-label={t('On this page')}>
          {t('Jump to:')} <a href="#clean-slate">{t('Clean Slate check')}</a> · <a href="#plan-30">{t('30-day plan')}</a>
        </nav>
      )}

      {show !== 'plan' && (
        <>
      <article className="card slate-card" id="clean-slate">
        {simple ? null : (
          <>
            <div className="slate-top">
              <h3>{t('Clean Slate check')}</h3>
              <Badge status={overallBadge(result.rules)} />
            </div>
            <p className="headline">{result.screener.headline}</p>
            {/* Caseworkers see the per-conviction cards (with reason codes) right below, so the long
                explanation would repeat them. */}
            {!caseworker && <p className="explanation">{result.screener.explanation}</p>}
          </>
        )}

        <ul className="conviction-list">
          {result.rules.convictions.map((c) => {
            const later = erasureLine(c, new Date(), t)
            const note = waitingNote(c, new Date(), caseworker ? 'client' : 'you')
            return (
              <li key={c.id}>
                <div className="conviction-desc">{t(c.description)}</div>
                <div className="conviction-meta">
                  <span>{convictedLine(c, t)}</span>
                  {later && <span>{later}</span>}
                  {caseworker && <span className="code">{c.reason_code}</span>}
                </div>
                <div className="conviction-outcome">
                  <Badge status={c.status} />
                </div>
                {note && <p className="conviction-note">{t(note)}</p>}
              </li>
            )
          })}
        </ul>

        {caseworker && (
          <p className="guidance">
            <strong>{t('Disclosure:')}</strong> {t(GUIDANCE[result.screener.disclosure_guidance])}{' '}
            <span className="code">{result.screener.disclosure_guidance}</span>
          </p>
        )}

        {result.next_steps.length > 0 && (
          <>
            <h3 className="steps-title">{t(caseworker ? 'Recommended next steps' : 'Here are your recommended next steps:')}</h3>
            <ol className="next-steps">
              {result.next_steps.map((s) => (
                <li key={s.code}>
                  <strong className="step-title">{t(s.title)}</strong>
                  <p className="step-detail">{t(s.detail)}</p>
                  {s.how && s.how.length > 0 && (
                    <ol className="step-how">
                      {s.how.map((h) => (
                        <li key={h}>{t(h)}</li>
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
                          {t(l.label)} <span aria-hidden="true">↗</span>
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
        <p className="disclaimer">{t(result.rules.disclaimer)}</p>
      </article>

          {show === 'slate' && onShowPlan && (
            <div className="results-next no-print">
              <button type="button" className="btn qa-next" onClick={onShowPlan}>
                {t('See my 30-day plan')} →
              </button>
            </div>
          )}
        </>
      )}

      {show !== 'slate' && (
        <>
          {show === 'plan' && onBackToResults && (
            <button type="button" className="link-button results-back no-print" onClick={onBackToResults}>
              ← {t('Back to my results')}
            </button>
          )}
      {show !== 'plan' && <h3 className="plan-title" id="plan-30">{t('30-day plan')}</h3>}
      {result.needs_human_review && (
        <div className="review-banner" role="alert">
          <strong>{t('Needs human review.')}</strong>{' '}
          {t('Our checker still found problems after one revision. Please review this plan with a caseworker or legal aid before acting on it.')}
          <ul>
            {result.verifier.issues.map((i, n) => (
              <li key={n}>
                {stepLabel(result.plan.weeks, i.step_id, t) && <strong>{stepLabel(result.plan.weeks, i.step_id, t)}: </strong>}
                {i.problem}
              </li>
            ))}
          </ul>
        </div>
      )}
      <PlanView plan={result.plan} lookup={lookup} />
        </>
      )}
    </section>
  )
}

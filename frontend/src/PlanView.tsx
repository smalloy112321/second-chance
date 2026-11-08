import { useEffect, useMemo, useState } from 'react'

import { planDates, progressText, repeatedResources, shortUrl, weekDates } from './planDisplay'
import type { Plan, PlanStep, Resource } from './types'

export const PLAN_DONE_PREFIX = 'plan-done:'

/** Contact details for a program, kept short: name, phone, website, address, one plain tip. */
function PlanContact({ r }: { r: Resource }) {
  return (
    <div className="plan-contact">
      <div className="plan-contact-name">{r.name}</div>
      <div className="plan-contact-links">
        {r.phone && (
          <a href={`tel:${r.phone.replace(/[^\d+]/g, '')}`}>
            <span className="label">Call</span> {r.phone}
          </a>
        )}
        {r.website && (
          <a href={r.website} target="_blank" rel="noreferrer">
            <span className="label">Website</span> {shortUrl(r.website)} <span aria-hidden="true">↗</span>
          </a>
        )}
        {r.address && (
          <span>
            <span className="label">Address</span> {r.address}
          </span>
        )}
      </div>
      {r.tip && <p className="plan-contact-tip">{r.tip}</p>}
    </div>
  )
}

function StepItem({
  s, r, repeatWeek, done, onToggle,
}: { s: PlanStep; r?: Resource; repeatWeek?: number; done: boolean; onToggle: () => void }) {
  const id = `plan-step-${s.step_id}`
  return (
    <li className={`plan-step${done ? ' is-done' : ''}`}>
      <input id={id} type="checkbox" checked={done} onChange={onToggle} />
      <div className="plan-step-body">
        <label htmlFor={id} className="plan-step-action">
          {s.action}
          {s.priority === 'high' && <span className="plan-tag">Top priority</span>}
        </label>
        <p className="plan-step-why">{s.why}</p>
        {s.official_links && s.official_links.length > 0 && (
          <div className="step-links">
            {s.official_links.map((l) => (
              <a key={l.url} className={l.primary ? 'btn step-main' : 'step-link'} href={l.url} target="_blank" rel="noreferrer">
                {l.label} <span aria-hidden="true">↗</span>
              </a>
            ))}
          </div>
        )}
        {r && repeatWeek !== undefined ? (
          <p className="plan-contact-repeat">
            {r.name}: contact details are in Week {repeatWeek}.
            {r.phone && (
              <>
                {' '}Call <a href={`tel:${r.phone.replace(/[^\d+]/g, '')}`}>{r.phone}</a>.
              </>
            )}
          </p>
        ) : (
          r && <PlanContact r={r} />
        )}
      </div>
    </li>
  )
}

export default function PlanView({ plan, lookup }: { plan: Plan; lookup: (id: string | null) => Resource | undefined }) {
  const [start] = useState(() => new Date())
  const steps = plan.weeks.flatMap((w) => w.steps)
  const storageKey = PLAN_DONE_PREFIX + steps.map((s) => s.step_id + s.action.length).join('|')
  const [done, setDone] = useState<Record<string, boolean>>(() => {
    try {
      return JSON.parse(sessionStorage.getItem(storageKey) || '{}')
    } catch {
      return {}
    }
  })
  useEffect(() => {
    sessionStorage.setItem(storageKey, JSON.stringify(done))
  }, [storageKey, done])
  const repeats = useMemo(() => repeatedResources(plan.weeks), [plan.weeks])
  const doneCount = steps.filter((s) => done[s.step_id]).length

  return (
    <div className="plan">
      <p className="plan-dates">{planDates(start)}</p>
      <p className="plan-summary">{plan.summary}</p>
      <div className="plan-progress" aria-live="polite">
        <div className="plan-progress-bar" aria-hidden="true">
          <span style={{ width: `${steps.length ? (doneCount / steps.length) * 100 : 0}%` }} />
        </div>
        <span>{progressText(doneCount, steps.length)}</span>
      </div>
      <div className="weeks">
        {plan.weeks.map((w) => (
          <article key={w.week} className="card week">
            <p className="week-label">
              Week {w.week} · {weekDates(w.week, start)}
            </p>
            <h4>{w.focus}</h4>
            <ol className="plan-steps">
              {w.steps.map((s) => (
                <StepItem
                  key={s.step_id}
                  s={s}
                  r={lookup(s.resource_id)}
                  repeatWeek={repeats[s.step_id]}
                  done={!!done[s.step_id]}
                  onToggle={() => setDone((d) => ({ ...d, [s.step_id]: !d[s.step_id] }))}
                />
              ))}
            </ol>
          </article>
        ))}
      </div>
    </div>
  )
}

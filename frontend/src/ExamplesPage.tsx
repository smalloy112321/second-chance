import { useEffect, useState } from 'react'

import Results from './Results'
import type { ResultPayload } from './types'

type Example = { title: string; answers: string; result: ResultPayload }

/** /?examples — sample results pages (rules engine only, no AI), for report screenshots. */
export default function ExamplesPage() {
  const [examples, setExamples] = useState<Example[] | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    fetch('/api/examples')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d) => setExamples(d.examples))
      .catch(() => setError('Could not load the examples.'))
  }, [])

  return (
    <section className="examples" aria-labelledby="examples-title">
      <h1 id="examples-title">Example results</h1>
      <p className="lead">
        What the “Your results” step shows for different answers. Statuses, dates, and next steps come from the Clean
        Slate rules engine (no AI), so these match the app exactly.
      </p>
      {error && <p className="qa-error">{error}</p>}
      {!examples && !error && (
        <p className="qa-reading">
          <span className="spinner" aria-hidden="true" /> Loading examples…
        </p>
      )}
      <div className="examples-list">
        {examples?.map((e, i) => (
          <article key={e.title} className="example" id={`example-${i + 1}`}>
            <p className="qa-label">
              Example {i + 1} · {e.title}
            </p>
            <p className="example-answers">
              <strong>Her answers:</strong> {e.answers}
            </p>
            <Results result={e.result} mode="self_serve" db={{}} show="slate" />
          </article>
        ))}
      </div>
    </section>
  )
}

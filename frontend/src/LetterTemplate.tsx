import { useId, useState } from 'react'

import { getLang, t } from './i18n'
import { letterText, type LetterInput, type LetterKind } from './letters'

/** "Use a letter template" under a step: an editable, pre-filled letter she can copy or print. */
export default function LetterTemplate({ kind, input }: { kind: LetterKind; input: LetterInput }) {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState(() => letterText(kind, input))
  const [copied, setCopied] = useState(false)
  const id = useId()
  const label = kind === 'record_request' ? 'Use a letter template' : 'Use an email template'

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2500)
    } catch {
      setCopied(false)
    }
  }
  const print = () => {
    const w = window.open('', '_blank', 'noopener=no')
    if (!w) return
    const pre = w.document.createElement('pre')
    pre.textContent = text
    pre.style.cssText = 'font: 12pt/1.5 Georgia, serif; white-space: pre-wrap; margin: 1in;'
    w.document.body.appendChild(pre)
    w.document.title = t(label)
    w.focus()
    w.print()
  }

  return (
    <div className="letter no-print">
      <button type="button" className="step-link letter-toggle" aria-expanded={open} aria-controls={id} onClick={() => setOpen((o) => !o)}>
        ✉ {t(label)} {open ? '▴' : '▾'}
      </button>
      {open && (
        <div className="letter-panel" id={id}>
          <p className="letter-help">
            {t('Fill in the parts in [brackets], then copy it or print it.')}
            {getLang() !== 'en' && ` ${t('The letter is in English because it goes to a Connecticut state office.')}`}
          </p>
          <label className="sr-only" htmlFor={`${id}-text`}>
            {t(label)}
          </label>
          <textarea id={`${id}-text`} value={text} onChange={(e) => setText(e.target.value)} rows={Math.min(24, text.split('\n').length + 1)} spellCheck />
          <div className="letter-actions">
            <button type="button" className="btn" onClick={() => void copy()}>
              {t(copied ? 'Copied' : 'Copy')}
            </button>
            <button type="button" className="btn btn-quiet" onClick={print}>
              {t('Print')}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

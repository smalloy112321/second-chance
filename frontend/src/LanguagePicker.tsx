import { Fragment } from 'react'

import { LANGS, setLang, t, useLang, type Lang } from './i18n'

/** The language dropdown, at the top of every page. */
export default function LanguagePicker() {
  const lang = useLang()
  return (
    <label className="lang-picker">
      <span className="lang-picker-icon" aria-hidden="true">🌐</span>
      <span className="sr-only">{t('Language')}</span>
      <select value={lang} onChange={(e) => setLang(e.target.value as Lang)}>
        {LANGS.map((l) => (
          <option key={l.id} value={l.id} lang={l.id}>
            {l.label}
          </option>
        ))}
      </select>
    </label>
  )
}

/** Translated text with "\n" shown as line breaks. */
export function Lines({ text }: { text: string }) {
  return (
    <>
      {text.split('\n').map((part, i) => (
        <Fragment key={i}>
          {i > 0 && <br />}
          {part}
        </Fragment>
      ))}
    </>
  )
}

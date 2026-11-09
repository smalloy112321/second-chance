// Run with: node src/i18n.test.ts
// Every t('...') in the code has a Spanish and a Portuguese translation, with the same {placeholders}.
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { test } from 'node:test'

import { es } from './strings/es.ts'
import { pt } from './strings/pt.ts'

const dir = new URL('.', import.meta.url)
const files = readdirSync(dir).filter((f) => /\.(ts|tsx)$/.test(f) && !f.endsWith('.test.ts'))
const LIT = String.raw`('(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*")`

function literals(): string[] {
  const out = new Set<string>()
  for (const f of files) {
    const src = readFileSync(new URL(f, dir), 'utf8')
    // Every string inside each t(...) call, including choices like t(a ? 'Skip' : 'Next').
    for (const m of src.matchAll(/\bt\(/g)) {
      let depth = 1, i = m.index! + 2, quote = ''
      for (; i < src.length && depth; i++) {
        const c = src[i]
        if (quote) { if (c === '\\') i++; else if (c === quote) quote = '' }
        else if (c === "'" || c === '"' || c === '`') quote = c
        else if (c === '(') depth++
        else if (c === ')') depth--
      }
      for (const l of src.slice(m.index! + 2, i - 1).matchAll(new RegExp(LIT, 'g'))) {
        const text = unquote(l[1])
        if (/[A-Za-z]{2,}/.test(text) && !/^[a-z_]+$/.test(text)) out.add(text) // skip ids like 'en'
      }
    }
  }
  return [...out]
}
const unquote = (lit: string) =>
  lit.slice(1, -1).replace(/\\n/g, '\n').replace(/\\'/g, "'").replace(/\\"/g, '"').replace(/\\\\/g, '\\')
const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort()

for (const [name, dict] of [['Spanish', es], ['Portuguese', pt]] as const) {
  test(`${name}: every t('...') string in the code is translated`, () => {
    const missing = literals().filter((k) => !(k in dict))
    assert.deepEqual(missing, [])
  })
  test(`${name}: placeholders like {n} and {name} are kept`, () => {
    const bad = Object.entries(dict).filter(([k, v]) => placeholders(k).join() !== placeholders(v).join())
    assert.deepEqual(bad.map(([k]) => k), [])
  })
}

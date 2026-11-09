/**
 * Helps caseworkers give the agents every fact the self-serve questionnaire collects.
 * Pure functions, testable with `node src/caseNotes.test.ts`.
 *
 * Free-text notes often leave out facts the rules engine needs (for example, whether a conviction
 * was a DUI). Those convictions then come back "Needs review". The template asks for every fact,
 * and the checklist shows which ones the notes don't mention yet.
 */

export const CASE_NOTES_TEMPLATE = `Client first name:
Town:
Conviction 1: what it was / misdemeanor or felony (and class, if a felony) / year it happened / year convicted / DUI? yes or no / cannabis possession? yes or no
Conviction 2:
Any conviction for family violence? yes or no
Any conviction for a sex offense? yes or no
On probation, parole, or special parole now? yes or no
Open criminal case in Connecticut now? yes or no
Finished every part of every sentence (prison, probation, parole)? yes or no
Children (how many, who they live with, any family court or DCF case):
Housing (tonight, and for the rest of this month):
IDs (state ID, birth certificate, Social Security card):
Work (working now? what work she wants):
Top 3 goals for the next 30 days:`

export const CASE_NOTES_TEMPLATE_ES = `Nombre de la clienta:
Pueblo o ciudad:
Condena 1: qué fue / delito menor o grave (y la clase, si es grave) / año en que pasó / año de la condena / ¿DUI? sí o no / ¿posesión de cannabis? sí o no
Condena 2:
¿Alguna condena por violencia familiar? sí o no
¿Alguna condena por delito sexual? sí o no
¿Está en libertad condicional o probatoria ahora? sí o no
¿Tiene un caso penal abierto en Connecticut ahora? sí o no
¿Terminó todas las partes de cada sentencia (prisión, probatoria, libertad condicional)? sí o no
Hijos (cuántos, con quién viven, si hay caso en la corte de familia o con DCF):
Vivienda (esta noche y el resto del mes):
Identificaciones (ID del estado, acta de nacimiento, tarjeta de Seguro Social):
Trabajo (¿trabaja ahora? ¿qué trabajo quiere?):
3 metas principales para los próximos 30 días:`

export const CASE_NOTES_TEMPLATE_PT = `Primeiro nome da cliente:
Cidade:
Condenação 1: o que foi / contravenção ou crime grave (e a classe, se for grave) / ano em que aconteceu / ano da condenação / DUI? sim ou não / posse de cannabis? sim ou não
Condenação 2:
Alguma condenação por violência familiar? sim ou não
Alguma condenação por crime sexual? sim ou não
Está em liberdade condicional ou probatória agora? sim ou não
Tem algum processo criminal aberto em Connecticut agora? sim ou não
Cumpriu todas as partes de cada pena (prisão, probatória, liberdade condicional)? sim ou não
Filhos (quantos, com quem moram, se há processo na vara de família ou com o DCF):
Moradia (esta noite e o resto do mês):
Documentos (ID do estado, certidão de nascimento, cartão do Seguro Social):
Trabalho (trabalha agora? que trabalho quer?):
3 metas principais para os próximos 30 dias:`

export const caseNotesTemplate = (lang: string) =>
  lang === 'es' ? CASE_NOTES_TEMPLATE_ES : lang === 'pt' ? CASE_NOTES_TEMPLATE_PT : CASE_NOTES_TEMPLATE

/** Each fact the agents need, and words (English, Spanish, Portuguese) that show the notes mention it. */
export const CHECKS: { label: string; pattern: RegExp }[] = [
  { label: 'Town', pattern: /\btown\b|\b(lives|living) in\b|, ct\b|connecticut|hartford|new haven|bridgeport|waterbury|stamford|new britain|pueblo|ciudad|vive en|cidade|mora em/i },
  { label: 'Conviction years', pattern: /\b(19|20)\d\d\b/ },
  { label: 'Misdemeanor or felony', pattern: /misdemeanor|felony|delito menor|delito grave|felon[ií]a|contraven[cç][aã]o|crime grave/i },
  { label: 'DUI (yes or no)', pattern: /\bdui\b|\bdwi\b|driving under|manejar (bajo|ebri)|conducir (bajo|ebri)|dirigir (alcoolizad|embriagad|sob)/i },
  { label: 'Cannabis possession (yes or no)', pattern: /cannabis|marijuana|marihuana|maconha/i },
  { label: 'Family violence', pattern: /family violence|domestic|violencia (familiar|dom[eé]stica)|viol[eê]ncia (familiar|dom[eé]stica)/i },
  { label: 'Sex offense', pattern: /sex offen|delito sexual|crime sexual/i },
  { label: 'Probation or parole now', pattern: /probation|parole|probatoria|probat[oó]ria|libertad condicional|liberdade condicional/i },
  { label: 'Open criminal case', pattern: /pending|open (criminal )?case|open charge|caso (penal )?abierto|cargos pendientes|processo (criminal )?aberto|acusa[cç][aã]o pendente/i },
  { label: 'Sentence finished', pattern: /sentence|finished probation|completed|sentencia|termin[oó]|cumpli[oó]|\bpena\b|cumpriu/i },
  { label: 'Children', pattern: /child|kids?\b|\bsons?\b|daughters?|no children|hij[oa]s?|niñ[oa]s|filh[oa]s?|crian[cç]as/i },
  { label: 'Housing', pattern: /hous|staying|shelter|apartment|living with|homeless|vivienda|se queda|refugio|apartamento|moradia|abrigo|mora com/i },
  { label: 'IDs', pattern: /\bids?\b|birth certificate|social security|license|identificaci|acta de nacimiento|seguro social|documentos?|certid[aã]o/i },
  { label: 'Goals', pattern: /goal|wants? to|interested in|metas?\b|quiere|objetivos?|quer\b/i },
]

const ALL_TEMPLATES = [CASE_NOTES_TEMPLATE, CASE_NOTES_TEMPLATE_ES, CASE_NOTES_TEMPLATE_PT]
const TEMPLATE_LINES = new Set(ALL_TEMPLATES.flatMap((tpl) => tpl.split('\n').map((l) => l.trim())))
const CONVICTION_LINE = /^\s*(conviction|condena|condena[cç][aã]o)\s*\d+\s*:\s*/i
const CONVICTION_HINTS = ALL_TEMPLATES.map((tpl) => tpl.split('\n')[2].replace(CONVICTION_LINE, ''))

/** Facts the notes don't mention yet (empty notes: nothing listed). Template lines and hints that
 * are still unfilled don't count as mentioning a fact. */
export function notMentioned(notes: string): string[] {
  const text = notes
    .split('\n')
    .filter((line) => !TEMPLATE_LINES.has(line.trim()))
    .join('\n')
  const cleaned = CONVICTION_HINTS.reduce((acc, hint) => acc.split(hint).join(''), text)
  if (!cleaned.replace(/[\p{L}0-9 ()?¿,/']*:\s*$/gmu, '').trim()) return []
  return [...CHECKS.filter((c) => !c.pattern.test(cleaned)).map((c) => c.label), ...convictionGaps(cleaned)]
}

const YEAR = /\b(19|20)\d\d\b/g
const OFFENSE_YEAR = /(offen[cs]e|happened|arrest\w*|incident|committed|pas[oó]|ocurri[oó]|delito en|aconteceu|ocorreu|pres[ao] em)\D{0,25}\b(19|20)\d\d\b/i
const CONVICTED_YEAR = /(convict\w*|sentenc\w*|plea\w*|pled|condenad[oa]|condena\b|condena[cç][aã]o)\D{0,25}\b(19|20)\d\d\b/i
const LEVEL = /misdemeanor|felony|delito menor|delito grave|felon[ií]a|contraven[cç][aã]o|crime grave/i

/** Each conviction in the notes: "(1) ... (2) ..." items, or "Conviction 1: ..." lines. */
export function convictionSegments(text: string): string[] {
  const lines = text.split('\n').filter((l) => CONVICTION_LINE.test(l))
  if (lines.length) return lines.map((l) => l.replace(CONVICTION_LINE, '')).filter((l) => l.trim())
  const parts = text.split(/\(\d\)/)
  if (parts.length < 2) return []
  // The last item runs to the end of its line (the notes go on to other facts after it).
  return parts.slice(1).map((p, i, all) => (i === all.length - 1 ? p.split('\n')[0] : p))
}

/** What each conviction is missing: "Conviction 3: year it happened". */
export function convictionGaps(text: string): string[] {
  const gaps: string[] = []
  convictionSegments(text).forEach((seg, i) => {
    const years = seg.match(YEAR) ?? []
    const missing: string[] = []
    if (!LEVEL.test(seg)) missing.push('misdemeanor or felony')
    if (years.length === 0) missing.push('year it happened', 'year convicted')
    else if (years.length === 1) {
      if (CONVICTED_YEAR.test(seg) && !OFFENSE_YEAR.test(seg)) missing.push('year it happened')
      else if (OFFENSE_YEAR.test(seg) && !CONVICTED_YEAR.test(seg)) missing.push('year convicted')
      else if (!OFFENSE_YEAR.test(seg) && !CONVICTED_YEAR.test(seg)) missing.push('year it happened and year convicted (or say they were the same year)')
    }
    if (missing.length) gaps.push(`Conviction ${i + 1}: ${missing.join(', ')}`)
  })
  return gaps
}

// vmu glossary audit — the vocabulary must be ONE thing, and it must be REAL.
//
// Three checks, all falsifiable:
//   1. the glossary is well formed (ids unique, every field non-empty, layer from the four-layer model);
//   2. docs/01-§7 IS what the glossary yields (generated, not hand-copied), two-sided;
//   3. every term's Chinese name actually APPEARS in the design set - a glossary entry nobody uses is
//      vocabulary theatre, and a term used everywhere but absent from the glossary is how drift starts.
import { readFileSync, readdirSync } from 'node:fs'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { readGlossary, renderTable, splitDoc } from '../scripts/generate-glossary-table.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = resolve(HERE, '..')
const DOCS = join(REPO, 'vibe-math-vmu', 'docs')
let passed = 0, failed = 0
const ok = (cond, name, detail) => { if (cond) passed++; else { failed++; console.log('  FAIL ' + name + (detail === undefined ? '' : ' :: ' + detail)) } }

const glossary = readGlossary()

// ---- 1. shape ------------------------------------------------------------------------------------
const LAYERS = new Set(['L1', 'L2', 'L3', 'L4', 'cross'])
ok(glossary.terms.length >= 30, 'the glossary is substantial (>=30 terms for 22 volumes)', glossary.terms.length)
ok(glossary.terms.every((t) => LAYERS.has(t.layer)), 'every term declares a known layer',
  JSON.stringify([...new Set(glossary.terms.map((t) => t.layer))]))
ok(glossary.terms.every((t) => /^\d\d-§/.test(t.definedIn) || /^\d\d-/.test(t.definedIn)),
  'every term names the volume that OWNS its definition', JSON.stringify(glossary.terms.filter((t) => !/^\d\d-/.test(t.definedIn)).map((t) => t.id)))
const ids = glossary.terms.map((t) => t.id)
ok(new Set(ids).size === ids.length, 'term ids are unique')

// ---- 2. docs/01-§7 is generated from the glossary ------------------------------------------------
const doc = readFileSync(join(DOCS, '01-philosophy.md'), 'utf8')
const { head, tail } = splitDoc(doc)
ok(head !== doc, 'docs/01 carries the GLOSSARY markers')
const expected = renderTable(glossary)
const actual = doc.slice(head.length, doc.length - tail.length)
ok(actual.trim() === expected.trim(), 'docs/01-§7 IS the glossary rendering (no hand copy)',
  'expected ' + expected.length + ' chars, found ' + actual.trim().length)
// two-sided: every glossary row is present, and the table has no extra rows
const rowCount = (s) => (s.match(/^\| \*\*/gm) || []).length
ok(rowCount(expected) === glossary.terms.length, 'one row per term', rowCount(expected) + '/' + glossary.terms.length)
ok(rowCount(actual) === glossary.terms.length, 'the shipped table has exactly one row per term (no extras)', rowCount(actual))

// ---- 3. the vocabulary is REAL: each term's Chinese name is used somewhere in the design set -------
const volumes = readdirSync(DOCS).filter((f) => /^\d\d-[A-Za-z0-9-]+\.md$/.test(f))
const all = volumes.map((f) => readFileSync(join(DOCS, f), 'utf8')).join('\n')
const unused = glossary.terms.filter((t) => !all.includes(t.zh)).map((t) => t.id + '(' + t.zh + ')')
ok(unused.length === 0, 'every glossary term is actually used in the design set (no vocabulary theatre)',
  unused.slice(0, 8).join(', '))
// and the reverse direction, honestly scoped: the CORE four-layer words must be in the glossary
const MUST = ['内核', '设置', '中间件', '整合包', '挂点', '原语', '能力面']
const missing = MUST.filter((w) => !glossary.terms.some((t) => t.zh === w))
ok(missing.length === 0, 'the four-layer core vocabulary is in the glossary', missing.join(','))

// ---- 4. `definedIn` must RESOLVE: the volume exists AND that section heading really exists ---------
// An independent reviewer found five entries whose `definedIn` was an unparseable placeholder
// (`07-§4.x`, `17-§x`) while the old assertion only required the string to start with `NN-§`. A pointer that
// cannot be followed makes "definition ownership" a slogan, so the check now follows it.
{
  const text = new Map(volumes.map((f) => [f.slice(0, 2), readFileSync(join(DOCS, f), 'utf8')]))
  const unresolved = []
  for (const t of glossary.terms) {
    const m = /^(\d\d)-§([\d.]+)$/.exec(t.definedIn)
    if (!m) { unresolved.push(t.id + ' (' + t.definedIn + ' 不是 NN-§X 形式)'); continue }
    const [vol, sec] = [m[1], m[2]]
    const body = text.get(vol)
    if (!body) { unresolved.push(t.id + ' (' + vol + ' 卷不存在)'); continue }
    const re = new RegExp('^#{2,3} ' + sec.replace(/\./g, '\\.') + '(?:\\.|\\s|$)', 'm')
    if (!re.test(body)) unresolved.push(t.id + ' (' + t.definedIn + ' 在 ' + vol + ' 卷找不到该编号标题)')
  }
  ok(unresolved.length === 0, 'every term\'s definedIn resolves to a REAL section heading',
    unresolved.slice(0, 6).join(' | '))
  // and no placeholders survived in any form
  const placeholders = glossary.terms.filter((t) => /[xX]/.test(t.definedIn.replace(/[^xX]/g, '')) || /\.x$/.test(t.definedIn))
  ok(placeholders.length === 0, 'no term points at a placeholder section', placeholders.map((t) => t.id).join(','))
}

console.log('')
console.log('=== VMU GLOSSARY: ' + passed + ' passed, ' + failed + ' failed (' + glossary.terms.length + ' terms) ===')
process.exit(failed === 0 ? 0 : 1)

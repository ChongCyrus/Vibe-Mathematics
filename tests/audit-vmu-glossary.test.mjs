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

console.log('')
console.log('=== VMU GLOSSARY: ' + passed + ' passed, ' + failed + ' failed (' + glossary.terms.length + ' terms) ===')
process.exit(failed === 0 ? 0 : 1)

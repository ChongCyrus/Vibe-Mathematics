#!/usr/bin/env node
// vmu settings table generator — docs/04 §11 discipline ③: the table must not be a second hand-written
// copy of the schema. This script DERIVES it from SETTING_DEFS, so a key can never exist in one place and
// be missing (or stale) in the other.
//
// Usage:
//   node scripts/generate-vmu-settings-table.mjs --write   rewrite the table from the schema
//   node scripts/generate-vmu-settings-table.mjs --check   fail if the file is not exactly what the schema yields
//
// The generated shape matches the documented columns exactly: 键 | 类型 | 默认 | 域 | 作用域 | H | 谁 | 接线 | 说明.
// The 说明 column is the schema's own `doc` string - the single source of truth, typed next to the key.
//
// THE 接线 (WIRED) COLUMN. A declared key that no runtime code reads is a knob the manual promises and the
// code does not keep: a reader changes it, gets `ok:true`, and nothing happens. The column is therefore
// COMPUTED, not written by hand - a key is `✅ 已接线` when its literal appears in the runtime sources
// (kernel/**, packs/**, the entry, and the host adapters) and `⚠️ 未接线` otherwise. `settings/schema.js`
// declares keys, so it is never a consumer; `math-computation.js` is the shared vendored module (its own
// parameter names, not `vmu.*` keys), so it is not scanned either.
//
// `VMU_SETTINGS_DOC` points the writer at a copy (the mutant family uses it to prove --check bites).

import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, resolve } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = resolve(HERE, '..')
const VMU_DIR = join(REPO, 'vibe-math-vmu')
// SEAM CONVENTION: every generator honours `VMU_DOCS_DIR` (point the whole doc set at a copy). This one also
// honours its own `VMU_SETTINGS_DOC` for a single-file redirect, which takes precedence. Before this, pointing
// `VMU_DOCS_DIR` at a copy silently did NOT redirect this generator - an independent reviewer hit exactly that
// while writing a mutant, so the two conventions now agree.
const DOC = process.env.VMU_SETTINGS_DOC ? resolve(process.env.VMU_SETTINGS_DOC)
  : process.env.VMU_DOCS_DIR ? join(resolve(process.env.VMU_DOCS_DIR), '04-settings.md')
    : join(REPO, 'vibe-math-vmu', 'docs', '04-settings.md')
const SCHEMA = join(REPO, 'vibe-math-vmu', 'settings', 'schema.js')

/** Every runtime source that could CONSUME a `vmu.*` key (schema.js declares, it does not consume). */
function runtimeSources() {
  const files = ['vibe-math-vmu.js', 'host.js', 'host-hooks.js', 'host-spawn.js'].map((f) => join(VMU_DIR, f))
  const walk = (dir, depth) => {
    if (depth > 3 || !existsSync(dir)) return
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (e.name === 'node_modules' || e.name === 'docs' || e.name === 'settings') continue
      const p = join(dir, e.name)
      if (e.isDirectory()) walk(p, depth + 1)
      else if (e.name.endsWith('.js') && e.name !== 'math-computation.js' && e.name !== 'math-engines.js') files.push(p)
    }
  }
  walk(VMU_DIR, 0)
  return [...new Set(files)].filter((f) => existsSync(f))
}

const SOURCES = runtimeSources()
const SOURCE_TEXT = SOURCES.map((f) => readFileSync(f, 'utf8')).join('\n')
/** Each source with its text, so the CARRIER column can name the first file that actually reads a key. */
const SOURCE_FILES = SOURCES.map((f) => ({ rel: f.replace(VMU_DIR, '').replace(/^[\\/]/, '').replace(/\\/g, '/'), text: readFileSync(f, 'utf8') }))

/** Does any runtime source read this key? (the honest meaning of "the knob works") */
export function hasConsumer(key) {
  // NO BACKTICK BRANCH (round 32). Counting a bare `vmu.something` inside a COMMENT as a consumer made this
  // column claim 已接线 for keys that no code ever read - the audit suite flagged two of them, and the root cause
  // was exactly this third alternative. A comment that mentions a key is documentation, not a reader; the audit
  // suite has always judged by quoted literals, so the generator now matches that stricter standard.
  return SOURCE_TEXT.includes("'" + key + "'") || SOURCE_TEXT.includes('"' + key + '"')
}

/**
 * WHERE the key is read (the first runtime source that names it), or null. The 接线 column says WHETHER the
 * knob works; this one says WHO reads it - so a reader can go straight to the consumer instead of trusting
 * the manual (docs/04 §7).
 */
export function carrierOf(key) {
  const hit = SOURCE_FILES.find((f) => f.text.includes("'" + key + "'") || f.text.includes('"' + key + '"'))
  return hit ? hit.rel : null
}

const MODE_WRITE = process.argv.includes('--write')
const MODE_CHECK = process.argv.includes('--check') || !MODE_WRITE
const JSON_OUT = process.argv.includes('--json')

const { SETTING_DEFS } = await import(new URL('file://' + SCHEMA.replace(/\\/g, '/')).href)

const TYPE_LABEL = {
  boolean: 'bool',
  natural: 'int ≥0',
  positiveInteger: 'int ≥1',
  stringList: 'string[]',
  objectList: 'obj[]',
  path: 'path',
  string: 'string',
  enum: 'enum',
}

const renderDefault = (def) => {
  const d = def.def
  if (Array.isArray(d)) return '`[' + d.join(',') + ']`'
  if (typeof d === 'string') return '`' + d + '`'
  return '`' + String(d) + '`'
}

const renderDomain = (def) => {
  if (def.type !== 'enum') return '—'
  return def.domain.map((v) => '`' + v + '`').join('∣')
}

const renderHot = (def) => (def.hot === 'H3' ? '**H3**' : def.hot)
const renderWho = (def) => (String(def.who).startsWith('role:') ? def.who : def.who)

const HEADER = [
  '| 键 | 类型 | 默认 | 域 | 作用域 | H | 谁 | 接线 | 载体（首个**提到**它的运行时代码；消费点可能在其下游） | 说明 |',
  '|---|---|---|---|---|---|---|---|---|---|',
]

const WIRED = '✅ 已接线'
const NOT_WIRED = '⚠️ 未接线（改了不会有行为变化）'

const rows = SETTING_DEFS.map((def) => {
  const carrier = carrierOf(def.key)
  return '| `' + def.key + '` | ' + (TYPE_LABEL[def.type] || def.type) + ' | ' +
    renderDefault(def) + ' | ' + renderDomain(def) + ' | 会话 | ' + renderHot(def) + ' | ' + renderWho(def) + ' | ' +
    (hasConsumer(def.key) ? WIRED : NOT_WIRED) + ' | ' + (carrier ? '`' + carrier + '`' : '—') + ' | ' + def.doc + ' |'
})

const generated = HEADER.concat(rows).join('\n')

// ---- splice into the document, replacing exactly the table body ---------------------------------
const docText = readFileSync(DOC, 'utf8')
const lines = docText.split('\n')
const headerIdx = lines.findIndex((l) => l.startsWith('| 键 | 类型 |'))
if (headerIdx === -1) {
  console.error('vmu settings table: the table header is missing from docs/04 §11')
  process.exit(1)
}
let end = headerIdx + 2 // past the separator
while (end < lines.length && lines[end].startsWith('|')) end++
const before = lines.slice(0, headerIdx)
const after = lines.slice(end)
const nextText = before.concat(generated.split('\n'), after).join('\n')

const WIRED_COUNT = SETTING_DEFS.filter((d) => hasConsumer(d.key)).length
const NOT_WIRED_COUNT = SETTING_DEFS.length - WIRED_COUNT
const SUMMARY = SETTING_DEFS.length + ' keys (' + WIRED_COUNT + ' wired, ' + NOT_WIRED_COUNT + ' declared-but-not-wired)'

if (JSON_OUT) {
  console.log(JSON.stringify({ keys: SETTING_DEFS.length, wired: WIRED_COUNT, notWired: NOT_WIRED_COUNT,
    tableLines: generated.split('\n').length, stale: nextText !== docText }, null, 2))
} else if (nextText === docText) {
  console.log('vmu settings table: up to date (' + SUMMARY + ')')
} else if (MODE_WRITE) {
  writeFileSync(DOC, nextText, 'utf8')
  console.log('vmu settings table: REWRITTEN from the schema (' + SUMMARY + ', ' + generated.split('\n').length + ' lines)')
} else {
  console.error('vmu settings table: STALE - docs/04 §11 is not what the schema yields (' + SUMMARY + ')')
  console.error('  run: node scripts/generate-vmu-settings-table.mjs --write')
  process.exit(1)
}

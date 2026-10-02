#!/usr/bin/env node
/**
 * STATUS/REPORT FIELD TABLE vs SOURCE (G-6) — the doc's per-preset field/scope rows must be exactly the
 * fields the code declares, in BOTH directions, and each row's scope must match the source classification.
 *
 * DEFECT CLASS: "machine-face field documented nowhere / documented field that does not exist" (F12/F3):
 * `实现方案.md §14.9` claimed every `status()` field had a row while >=13 top-level keys had none; and a
 * table written by hand drifts the moment a field is added. Sources are derived BY MARKER (line numbers
 * are claims, not anchors):
 *   v2/v3 -> `fieldScopes: { session: [...], durable: [...] }`  (20 / 25 entries)
 *   v5    -> the top-level keys of the object literal `status()` returns (its `fieldScopes` is coarse)
 *   v4    -> has NO `fieldScopes`; the table must say so rather than invent rows
 *
 * Run: node tests/audit-status-report-fields.mjs
 * Env (mutant harness): FIELD_DOC, FIELD_V2_JS, FIELD_V3_JS, FIELD_V5_JS, FIELD_V4_JS (absolute or relative).
 */
import { readFileSync } from 'node:fs'
import { dirname, isAbsolute, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..')
let passed = 0, failed = 0
const failures = []
const ok = (cond, label, detail) => { if (cond) passed++; else { failed++; failures.push(label + (detail ? ' — ' + detail : '')) } }
const read = (envName, rel) => {
  const v = process.env[envName]
  return readFileSync(v ? (isAbsolute(v) ? v : join(REPO, v)) : join(REPO, rel), 'utf8')
}
function fieldScopesOf(text) {
  const lines = text.split(/\r?\n/)
  const start = lines.findIndex((l) => /^\s*fieldScopes:\s*\{/.test(l))
  if (start === -1) return null
  let depth = 0
  const buf = []
  for (let i = start; i < lines.length; i++) {
    buf.push(lines[i]); depth += (lines[i].match(/\{/g) || []).length - (lines[i].match(/\}/g) || []).length
    if (i > start && depth <= 0) break
  }
  const out = {}
  for (const m of buf.join('\n').matchAll(/(\w+):\s*\[([\s\S]*?)\]/g)) {
    out[m[1]] = m[2].split(',').map((s) => s.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean)
  }
  return out
}
function statusKeysOf(text) {
  const lines = text.split(/\r?\n/)
  const fn = lines.findIndex((l) => /function status\s*\(/.test(l))
  if (fn === -1) return null
  const ret = lines.findIndex((l, i) => i > fn && /return\s*\{/.test(l))
  if (ret === -1) return null
  let depth = 0
  const buf = []
  for (let i = ret; i < lines.length; i++) {
    buf.push(lines[i]); depth += (lines[i].match(/\{/g) || []).length - (lines[i].match(/\}/g) || []).length
    if (i > ret && depth <= 0) break
  }
  const keys = []
  let d = 0
  for (const raw of buf.join('\n').split('\n')) {
    if (d === 1) { const m = /^([A-Za-z_$][\w$]*)\s*:/.exec(raw.trim()); if (m) keys.push(m[1]) }
    d += (raw.match(/\{/g) || []).length - (raw.match(/\}/g) || []).length + (raw.match(/\[/g) || []).length - (raw.match(/\]/g) || []).length
  }
  return [...new Set(keys)]
}
/** Rows of the doc section that starts with `headingPrefix`, up to the next `### `. */
function docRows(doc, headingPrefix) {
  const lines = doc.split(/\r?\n/)
  const start = lines.findIndex((l) => l.startsWith(headingPrefix))
  if (start === -1) return null
  let end = lines.findIndex((l, i) => i > start && /^### /.test(l))
  if (end === -1) end = lines.length
  const rows = []
  for (let i = start; i < end; i++) {
    const m = /^\|\s*`([^`]+)`\s*\|\s*([^|]+?)\s*\|/.exec(lines[i])
    if (m) rows.push({ name: m[1], scope: m[2] })
  }
  return rows
}
const diff = (a, b) => [...a].filter((x) => !b.has(x))

const doc = read('FIELD_DOC', 'docs/status-report-fields.md')
ok(doc.indexOf('G-6-FIELD-TABLE-START') !== -1 && doc.indexOf('G-6-FIELD-TABLE-END') !== -1,
  'the doc carries the machine-generated field table between its markers (so the guard knows what to read)')

const f2 = fieldScopesOf(read('FIELD_V2_JS', 'vibe-math-v2/vibe-math-v2.js'))
const f3 = fieldScopesOf(read('FIELD_V3_JS', 'vibe-math-v3/vibe-math-v3.js'))
const s5 = statusKeysOf(read('FIELD_V5_JS', 'vibe-math-v5/vibe-math-v5.js'))
const v4 = read('FIELD_V4_JS', 'vibe-math-v4/vibe-math-v4.js')
ok(!!f2 && !!f3 && !!s5, 'all three sources are parseable by marker (v2/v3 fieldScopes, v5 status())')

if (f2 && f3 && s5) {
  const cases = [
    { preset: 'v2', src: [...(f2.session || []), ...(f2.durable || [])], head: '### v2 的字段与作用域', scopeMap: { session: '会话', durable: '耐久' }, fs: f2 },
    { preset: 'v3', src: [...(f3.session || []), ...(f3.durable || [])], head: '### v3 的字段与作用域', scopeMap: { session: '会话', durable: '耐久' }, fs: f3 },
    { preset: 'v5', src: s5, head: '### v5 的字段与作用域', scopeMap: null, fs: null },
  ]
  for (const c of cases) {
    const rows = docRows(doc, c.head)
    ok(!!rows && rows.length > 0, c.preset + ': the doc section exists and has rows', String(rows && rows.length))
    if (!rows) continue
    const docSet = new Set(rows.map((r) => r.name))
    const srcSet = new Set(c.src)
    const missingInDoc = diff(srcSet, docSet)
    const extraInDoc = diff(docSet, srcSet)
    ok(missingInDoc.length === 0, '★ ' + c.preset + ': every source field has a doc row (doc↔source, source→doc)', JSON.stringify(missingInDoc))
    ok(extraInDoc.length === 0, '★ ' + c.preset + ': every doc row names a real source field (doc↔source, doc→source)', JSON.stringify(extraInDoc))
    if (c.scopeMap && c.fs) {
      const wrong = []
      for (const scope of ['session', 'durable']) {
        for (const name of c.fs[scope] || []) {
          const r = rows.find((x) => x.name === name)
          if (r && r.scope !== c.scopeMap[scope]) wrong.push(name + '=' + r.scope)
        }
      }
      ok(wrong.length === 0, '★ ' + c.preset + ': every row scope matches the source classification', JSON.stringify(wrong))
    }
  }
  // v4 must be stated as having none, and the source must agree
  const v4Rows = docRows(doc, '### v4')
  ok(!v4Rows || v4Rows.length === 0, '★ v4: no rows are invented (it has no fieldScopes to derive from)', String(v4Rows && v4Rows.length))
  ok(doc.indexOf('**没有** `fieldScopes`') !== -1 || doc.indexOf('不存在** `fieldScopes`') !== -1,
    '★ v4: the doc says explicitly that v4 has no fieldScopes')
  ok(!/fieldScopes/.test(v4), '★ v4: the source confirms it (zero occurrences of fieldScopes)')
}

console.log('')
console.log('=== STATUS FIELD TABLE: ' + passed + ' passed, ' + failed + ' failed ===')
for (const f of failures) console.error('  - ' + f)
process.exit(failed === 0 ? 0 : 1)

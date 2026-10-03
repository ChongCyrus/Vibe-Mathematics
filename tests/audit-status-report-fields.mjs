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
  // Robust: brace/comment/string aware, and it reads SHORTHAND properties too —
  // `institute: instituteName, project, key, phase,` is FOUR keys, not one. The earlier line-anchored
  // version missed 8 real keys (R19 F-A: project/key/phase/running/autoDone/runId/lastProgressAt/params).
  const fn = text.search(/function\s+status\s*\(/)
  if (fn === -1) return null
  const ret = text.indexOf('return {', fn)
  if (ret === -1) return null
  const start = text.indexOf('{', ret)
  let d0 = 0, stop = start, k = start
  while (k < text.length) {
    const c = text[k]
    if (c === '/' && text[k + 1] === '/') { while (k < text.length && text[k] !== '\n') k++; continue }
    if (c === '/' && text[k + 1] === '*') { k += 2; while (k < text.length && !(text[k] === '*' && text[k + 1] === '/')) k++; k += 2; continue }
    if (c === '"' || c === "'" || c === '`') { const q = c; k++; while (k < text.length) { if (text[k] === '\\') k += 2; else if (text[k] === q) break; else k++ } k++; continue }
    if (c === '{' || c === '[' || c === '(') d0++
    else if (c === '}' || c === ']' || c === ')') { d0--; if (d0 === 0) { stop = k; break } }
    k++
  }
  if (d0 !== 0) return null
  const body = text.slice(start + 1, stop)
  const segs = []
  let buf = '', d = 0, j = 0
  while (j < body.length) {
    const c = body[j]
    if (c === '/' && body[j + 1] === '/') { while (j < body.length && body[j] !== '\n') j++; continue }
    if (c === '/' && body[j + 1] === '*') { j += 2; while (j < body.length && !(body[j] === '*' && body[j + 1] === '/')) j++; j += 2; continue }
    if (c === '"' || c === "'" || c === '`') { const q = c; buf += c; j++; while (j < body.length) { buf += body[j]; if (body[j] === '\\') { j++; buf += body[j] } else if (body[j] === q) break; j++ } j++; continue }
    if (c === '{' || c === '[' || c === '(') d++
    if (c === '}' || c === ']' || c === ')') d--
    if (c === ',' && d === 0) { segs.push(buf); buf = ''; j++; continue }
    buf += c; j++
  }
  if (buf.trim()) segs.push(buf)
  const keys = []
  for (const seg of segs) {
    const t = seg.trim()
    if (!t) continue
    const m = /^([A-Za-z_$][\w$]*)\s*(?::|$|,)/.exec(t)
    if (m) keys.push(m[1])
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
  // ---- code -> doc (R19 F-A): EVERY status() top-level key lands in the v5 table OR is an explicit
  // exception. The exceptions list is empty today; adding one requires a reason HERE, in this file.
  const V5_EXCEPTIONS = []
  {
    const v5DocRows = docRows(doc, '### v5 的字段与作用域') || []
    const docSet5 = new Set(v5DocRows.map((r) => r.name))
    const frozen = s5
    const exceptions = V5_EXCEPTIONS
    console.log('  counts: frozen=' + frozen.length + ' doc-rows=' + docSet5.size + ' exceptions=' + exceptions.length)
    ok(frozen.length > 0 && docSet5.size > 0, '★ the three counts are non-zero (the comparison cannot pass vacuously)',
      'frozen=' + frozen.length + ' doc-rows=' + docSet5.size + ' exceptions=' + exceptions.length)
    const covered = new Set([...docSet5, ...exceptions])
    const uncovered = frozen.filter((k) => !covered.has(k))
    ok(uncovered.length === 0, '★ every status() top-level key is documented or an explicit exception (code->doc)',
      JSON.stringify(uncovered))
    const phantom = [...docSet5].filter((k) => frozen.indexOf(k) === -1 && exceptions.indexOf(k) === -1)
    ok(phantom.length === 0, '★ no v5 doc row names a key status() does not return (doc->code)',
      JSON.stringify(phantom))
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

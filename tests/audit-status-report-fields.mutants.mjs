#!/usr/bin/env node
/**
 * Mutant harness for tests/audit-status-report-fields.mjs (ships: `tests/*.mutants.mjs`).
 *
 * ONE MUTANT PER DIRECTION (the doc↔source comparison must bite both ways):
 *   A) doc→source: delete one v2 row from a COPY of docs/status-report-fields.md -> the "every source
 *      field has a doc row" assertion reddens by name
 *   B) source→doc: add a field to a COPY of vibe-math-v2.js's `fieldScopes.session` -> the "every doc row
 *      names a real source field" / missing-row assertion reddens by name
 *
 * Run: node tests/audit-status-report-fields.mutants.mjs
 */
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const HERE = fileURLToPath(new URL('./', import.meta.url))
const REPO = join(HERE, '..')
const GUARD = join(HERE, 'audit-status-report-fields.mjs')
let passed = 0, failed = 0
const ok = (c, l, d) => { if (c) { passed++; console.log('  ok   ' + l) } else { failed++; console.log('  FAIL ' + l + (d ? ' — ' + d : '')) } }
const run = (env) => {
  const r = spawnSync(process.execPath, [GUARD], { cwd: REPO, encoding: 'utf8', env: Object.assign({}, process.env, env || {}) })
  const out = String(r.stdout || '') + String(r.stderr || '')
  return { status: r.status, failLines: out.split('\n').filter((l) => /^  - /.test(l)), tail: out.trim().split('\n').filter(Boolean).slice(-1)[0] || '' }
}
const baseline = run(null)
ok(baseline.status === 0, 'baseline: the field-table guard is green', baseline.tail.slice(0, 80))

const dir = mkdtempSync(join(tmpdir(), 'fieldtable-mut-'))
// A) doc -> source
const docPath = join(REPO, 'docs/status-report-fields.md')
const docLines = readFileSync(docPath, 'utf8').split(/\r?\n/)
const v2Head = docLines.findIndex((l) => l.startsWith('### v2 的字段与作用域'))
const firstRow = docLines.findIndex((l, i) => i > v2Head && /^\|\s*`[^`]+`\s*\|/.test(l))
if (v2Head === -1 || firstRow === -1) ok(false, 'A: the v2 section and its first row exist (harness and guard agree on the shape)', 'ANCHOR MISS')
else {
  const removed = docLines[firstRow]
  const tampered = docLines.slice(0, firstRow).concat(docLines.slice(firstRow + 1)).join('\n')
  writeFileSync(join(dir, 'status-report-fields.md'), tampered)
  const a = run({ FIELD_DOC: join(dir, 'status-report-fields.md') })
  const named = a.failLines.some((l) => l.indexOf('v2: every source field has a doc row') !== -1)
  ok(a.status !== 0 && named, '★ A (doc→source): deleting a v2 row reddens the guard by name', 'removed=' + removed.trim().slice(0, 60) + ' exit=' + a.status)
  if (!named) for (const l of a.failLines.slice(0, 3)) console.log('      guard failure: ' + l.trim().slice(0, 130))
}
// B) source -> doc
const v2Path = join(REPO, 'vibe-math-v2/vibe-math-v2.js')
const v2src = readFileSync(v2Path, 'utf8')
const m = /(\n\s*session:\s*\[)([\s\S]*?)(\])/.exec(v2src)
if (!m) ok(false, 'B: the v2 fieldScopes session array exists (anchor check)', 'ANCHOR MISS')
else {
  const injected = m[1] + m[2].replace(/\s*$/, '') + ", 'ghostFieldFromMutant'" + m[3]
  writeFileSync(join(dir, 'vibe-math-v2.js'), v2src.replace(m[0], injected))
  const b = run({ FIELD_V2_JS: join(dir, 'vibe-math-v2.js') })
  const named = b.failLines.some((l) => l.indexOf('v2: every source field has a doc row') !== -1 || l.indexOf('v2: every doc row names a real source field') !== -1)
  ok(b.status !== 0 && named, '★ B (source→doc): adding a field to the source reddens the guard by name', 'exit=' + b.status)
  if (!named) for (const l of b.failLines.slice(0, 3)) console.log('      guard failure: ' + l.trim().slice(0, 130))
}
rmSync(dir, { recursive: true, force: true })
console.log('')
console.log('=== STATUS FIELD TABLE MUTANTS: ' + passed + ' passed, ' + failed + ' failed ===')
process.exit(failed === 0 ? 0 : 1)

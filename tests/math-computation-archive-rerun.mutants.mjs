#!/usr/bin/env node
/**
 * Mutant harness for tests/math-computation-shared.test.mjs §26 — ARCHIVE / RERUN provenance (ships:
 * `tests/*.mutants.mjs`). Replaces the dev-only draft `_oneoff/auditR2/roundA-mutants.mjs` (a1/a2).
 *
 * §26: re-running an EDITED original source keeps the same archive (attempt >= 2, `scriptChanged`), while
 * pointing at an ARCHIVED copy yields a NEW archive and flags `fileIsArchivedScript` /
 * `ARCHIVED_SCRIPT_RERUN`.
 *
 * Same shape as `math-computation-discovery.mutants.mjs`: copy `math-engines.js` + a ONE-SITE-mutated
 * `math-computation.js` into a private dir, run the SHIPPED suite through `MATH_COMPUTATION_MODULE`, and
 * require the named §26 assertion to redden. Baseline: the same copied pair, UNMUTATED, stays green.
 *
 * Run: node tests/math-computation-archive-rerun.mutants.mjs
 */
import { mkdtempSync, copyFileSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const HERE = fileURLToPath(new URL('./', import.meta.url))
const REPO = join(HERE, '..')
const SRC = join(REPO, 'vibe-math-v2')
const SUITE = join(HERE, 'math-computation-shared.test.mjs')
let passed = 0, failed = 0
const ok = (c, l, d) => { if (c) { passed++; console.log('  ok   ' + l) } else { failed++; console.log('  FAIL ' + l + (d ? ' — ' + d : '')) } }

function runSuite(dir) {
  const r = spawnSync(process.execPath, [SUITE], { cwd: REPO, encoding: 'utf8', maxBuffer: 1 << 26, env: Object.assign({}, process.env, { MATH_COMPUTATION_MODULE: join(dir, 'math-computation.js') }) })
  const o = String(r.stdout || '') + String(r.stderr || '')
  return { status: r.status, out: o, failLines: o.split('\n').filter((l) => /^\s*FAIL\b/.test(l)), sum: (o.split('\n').filter((l) => /passed, \d+ failed/.test(l)).slice(-1)[0] || '').trim() }
}
const CASES = [
  { name: 'a1: the ARCHIVED_SCRIPT_RERUN warning is dropped',
    expect: 'the response warns ARCHIVED_SCRIPT_RERUN',
    edit: (t) => t.replace(/^[ \t]*if \(archivedScriptSource\) warnings\.push\(warning\('ARCHIVED_SCRIPT_RERUN'.*$/m, '') },
  { name: 'a2: an archived source is never detected (always false)',
    expect: 'the response flags fileIsArchivedScript',
    edit: (t) => t.split('archivedScriptSource = /^Computation\\//.test(String(fileRel))').join('archivedScriptSource = false') },
]
{
  const dir = mkdtempSync(join(tmpdir(), 'mc-archive-base-'))
  copyFileSync(join(SRC, 'math-engines.js'), join(dir, 'math-engines.js'))
  copyFileSync(join(SRC, 'math-computation.js'), join(dir, 'math-computation.js'))
  const b = runSuite(dir)
  ok(b.status === 0, 'baseline: the shipped suite is green on the copied module pair (so a red below is the mutation)', b.sum.slice(0, 70))
  rmSync(dir, { recursive: true, force: true })
}
const ORIGIN = readFileSync(join(SRC, 'math-computation.js'), 'utf8')
for (const c of CASES) {
  const mutated = c.edit(ORIGIN)
  const anchorOk = mutated !== ORIGIN
  ok(anchorOk, c.name + ' — the single-site anchor applies', 'ANCHOR MISS')
  if (!anchorOk) continue
  const dir = mkdtempSync(join(tmpdir(), 'mc-archive-mut-'))
  copyFileSync(join(SRC, 'math-engines.js'), join(dir, 'math-engines.js'))
  writeFileSync(join(dir, 'math-computation.js'), mutated)
  const r = runSuite(dir)
  const named = r.failLines.some((l) => l.indexOf(c.expect) !== -1)
  ok(r.status !== 0 && named, '★ ' + c.name + ' -> ' + r.sum, named ? '' : 'named red not found (unit: named §26 assertion labels)')
  if (!named) for (const l of r.failLines.slice(0, 3)) console.log('        ' + l.trim().slice(0, 140))
  rmSync(dir, { recursive: true, force: true })
}
console.log('')
console.log('=== MATH ARCHIVE/RERUN MUTANTS: ' + passed + ' passed, ' + failed + ' failed ===')
process.exit(failed === 0 ? 0 : 1)

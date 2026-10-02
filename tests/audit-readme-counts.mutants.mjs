#!/usr/bin/env node
/**
 * Mutant harness for tests/audit-readme-counts.mjs (ships: `tests/*.mutants.mjs`).
 *
 * It proves the count guard can REDDEN: tamper the quoted TOTAL in a COPY of README.md (via the
 * guard's COUNTS_README seam) and require the NAMED assertion "README.md quotes the DERIVED totals"
 * in the failure list. Expected reds must name the LOAD-BEARING assertion, not any substring.
 *
 * Run: node tests/audit-readme-counts.mutants.mjs
 */
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { claims } from './helpers/doc-counts-format.mjs'

const HERE = fileURLToPath(new URL('./', import.meta.url))
const REPO = join(HERE, '..')
const GUARD = join(HERE, 'audit-readme-counts.mjs')
let passed = 0, failed = 0
const ok = (c, l, d) => { if (c) { passed++; console.log('  ok   ' + l) } else { failed++; console.log('  FAIL ' + l + (d ? ' — ' + d : '')) } }

const base = spawnSync(process.execPath, [GUARD], { cwd: REPO, encoding: 'utf8' })
const baseOut = String(base.stdout || '') + String(base.stderr || '')
ok(base.status === 0 && /10 passed, 0 failed|passed, 0 failed/.test(baseOut), 'baseline: the count guard is green',
  (baseOut.trim().split('\n').filter(Boolean).slice(-1)[0] || '').slice(0, 80))

// Tamper the EXACT quoted needle (not a random first match), so the red names the load-bearing check.
const derived = JSON.parse(spawnSync(process.execPath, [join(HERE, 'run-tests.mjs'), '--counts'], { cwd: REPO, encoding: 'utf8' }).stdout.trim())
const pkg = JSON.parse(readFileSync(join(REPO, 'package.json'), 'utf8'))
const dir = mkdtempSync(join(tmpdir(), 'counts-mut-'))
const zh = readFileSync(join(REPO, 'README.md'), 'utf8')
const shippedFiles = pkg.files.filter((f) => f.startsWith('tests/') && f.endsWith('.mjs'))
const shipped = { total: shippedFiles.length, suites: shippedFiles.filter((f) => f.endsWith('.test.mjs')).length }
shipped.probes = shipped.total - shipped.suites
const needle = claims(derived, shipped).zhTotal
if (zh.indexOf(needle) === -1) {
  ok(false, 'the tamper anchor is present in README.md (the guard and the harness agree on the shape)', 'ANCHOR MISS: ' + needle)
} else {
  writeFileSync(join(dir, 'README.md'), zh.replace(needle, '`TOTAL 57`（39 套件 + 18 探针/变体）'))
  const mut = spawnSync(process.execPath, [GUARD], { cwd: REPO, encoding: 'utf8', env: Object.assign({}, process.env, { COUNTS_README: join(dir, 'README.md') }) })
  const out = String(mut.stdout || '') + String(mut.stderr || '')
  const failLines = out.split('\n').filter((l) => /^  - /.test(l))
  const named = failLines.some((l) => l.indexOf('README.md carries the canonical JOB-count bullet') !== -1)
  ok(mut.status !== 0 && named, '★ tampering the quoted TOTAL makes the count guard RED by name', 'exit=' + mut.status)
  if (!named) for (const l of failLines.slice(0, 4)) console.log('      guard failure: ' + l.trim().slice(0, 130))
}
rmSync(dir, { recursive: true, force: true })
console.log('')
console.log('=== README COUNTS MUTANTS: ' + passed + ' passed, ' + failed + ' failed ===')
process.exit(failed === 0 ? 0 : 1)

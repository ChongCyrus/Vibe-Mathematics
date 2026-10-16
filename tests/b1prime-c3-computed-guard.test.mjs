#!/usr/bin/env node
// C3 RESIDENT GUARD — computed member access on a namespace binding (`NS[key]`) must be REPORTED BY NAME, never
// silently ignored. The tree's current reading is 0 occurrences, so the guard can only be shown by a FIXTURE; this
// test therefore builds one in a COPY (the real tree is never written).
// ★ It is NOT a wiring assertion: a computed subscript cannot be resolved statically. The guard means "a human must
// look", and a literal-constant subscript (`const K = 'vmu.x'; NS[K]`) deliberately lands in the SAME loud bucket
// (resolving it would need a same-file constant table — that part is named "没核", never guessed).
// ★ NON-EMPTY CONTROL: the same copy WITHOUT the probe must be silent and exit 0, so "it fired" cannot be vacuous.
import { mkdtempSync, readFileSync, writeFileSync, rmSync, mkdirSync, cpSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..')
const GEN = 'scripts/generate-vmu-settings-table.mjs'
const GUARD_MARK = /计算属性访问/
let passed = 0
const failures = []
const ok = (cond, name, detail) => { if (cond) { passed += 1; return } failures.push(name + (detail === undefined ? '' : ' [' + String(detail).slice(0, 170) + ']')) }
const runCopy = (dir) => {
  try { return { code: 0, err: '', out: execFileSync(process.execPath, [dir + '\\' + GEN, '--json'], { cwd: dir, encoding: 'utf8' }) } }
  catch (e) { return { code: e.status === undefined ? 1 : e.status, err: String(e.stderr || ''), out: String(e.stdout || '') } }
}
const mkCopy = (dir) => { mkdirSync(dir, { recursive: true }); for (const p of ['scripts', 'vibe-math-vmu']) cpSync(join(REPO, p), join(dir, p), { recursive: true }) }

const root = mkdtempSync(join(tmpdir(), 'c3-'))
try {
  // ── CONTROL: the copy as-is ⇒ the guard must stay silent and the generator must be up to date
  const clean = join(root, 'clean')
  mkCopy(clean)
  const control = runCopy(clean)
  ok(control.code === 0 && !GUARD_MARK.test(control.err),
    '★ CONTROL (no probe): the guard is SILENT and the generator exits 0 — it is not an always-firing guard',
    'exit=' + control.code + ' fired=' + GUARD_MARK.test(control.err))

  // ── FIXTURE: a probe file inside the copied tree, with `NS[key]` on a KNOWN line
  const probe = join(root, 'fixture')
  mkCopy(probe)
  const probeFile = join(probe, 'vibe-math-vmu', 'kernel', 'zzcomputed-probe.js')
  const probeLines = [
    "import * as NS from './store.js'",   // line 1
    'export function probe(key) {',        // line 2
    '  return NS[key]',                    // line 3  ← the target
    '}',                                   // line 4
  ]
  writeFileSync(probeFile, probeLines.join('\n') + '\n')
  const targetLine = probeLines.findIndex((l) => /NS\[/.test(l)) + 1
  const fixture = runCopy(probe)
  const named = fixture.err.split('\n').filter((l) => /zzcomputed-probe\.js/.test(l))
  ok(fixture.code === 1 && GUARD_MARK.test(fixture.err) && named.length >= 1,
    '★ FIXTURE: the guard FIRES (named line + non-zero exit) when a computed access exists',
    'exit=' + fixture.code + ' named=' + named.length)
  // ★ target-addressed: the printed LINE NUMBER must equal the probe's real line for `NS[key]`
  ok(named.length >= 1 && new RegExp('zzcomputed-probe\\.js:' + targetLine + '(\\s|$)').test(named[0]),
    '★ target-addressed: the reported line number equals the probe’s real `NS[key]` line',
    'expected :' + targetLine + ' got ' + JSON.stringify((named[0] || '').trim().slice(0, 80)))
  ok(named.length >= 1 && /NS/.test(named[0]), 'and the report names the BINDING, so a reader knows what to inspect', (named[0] || '').trim().slice(0, 60))
  // the guard must not be confused for a wiring verdict on a clean run: --json still reports the three tiers
  ok(/"wired":\s*\d+/.test(control.out), 'CONTROL still emits the normal --json payload (the guard is additive, not a replacement)', control.out.slice(0, 60))
} finally {
  rmSync(root, { recursive: true, force: true })
}
console.log('')
console.log('=== B1PRIME C3 COMPUTED GUARD: ' + passed + ' passed, ' + failures.length + ' failed ===')
for (const f of failures) console.log('  FAIL ' + f)
process.exit(failures.length === 0 ? 0 : 1)

#!/usr/bin/env node
// vmu PLANNED-CODES registry — the guard for scripts/generate-planned-codes.mjs.
//
// WHAT THIS PROVES (each case runs through the `VMU_CONTRACT` seam; the REAL 03-§8 is never written):
//   A. the real tree `--check` is clean (exit 0) — the generated block is what the docs yield;
//   B. a TEMP COPY with the BEGIN marker removed is REFUSED by both `--write` and `--check` (exit 2) and
//      the copy is BYTE-IDENTICAL afterwards — this is the round-6 defect: without the marker pair,
//      `splitContract` degrades to {head:text, tail:''} and the old code appended the whole block into the
//      file. The exit codes must also be DISTINGUISHABLE: no markers = 2, stale = 1 (never one code for both);
//   C. a TEMP COPY with one character changed inside the block makes `--check` exit 1 (STALE), which proves
//      the marker guard did not swallow the ordinary staleness rail.
import { readFileSync, writeFileSync, existsSync, mkdtempSync, copyFileSync, rmSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = fileURLToPath(new URL('./', import.meta.url))
const REPO = resolve(HERE, '..')
const GEN = join(REPO, 'scripts', 'generate-planned-codes.mjs')
const DOCS = process.env.VMU_DOCS_DIR ? resolve(process.env.VMU_DOCS_DIR) : join(REPO, 'vibe-math-vmu', 'docs')
const CONTRACT = process.env.VMU_CONTRACT ? resolve(process.env.VMU_CONTRACT) : join(DOCS, '03-interface-contract.md')
const BEGIN = '<!-- PLANNED-CODES:BEGIN'
const END = '<!-- PLANNED-CODES:END -->'

let passed = 0
let failed = 0
const failures = []
const ok = (cond, name, detail) => {
  if (cond) passed++
  else { failed++; failures.push(name + (detail === undefined ? '' : ' [' + detail + ']')) }
}
const run = (args, env) => spawnSync(process.execPath, [GEN].concat(args),
  { cwd: REPO, encoding: 'utf8', env: Object.assign({}, process.env, env || {}) })
/** The marker pair must exist in the real contract — otherwise every case below is meaningless. */
const realText = readFileSync(CONTRACT, 'utf8')

// ---- A. a FRESH copy is clean after --write, and a second --write is a no-op -----------------------
// The REAL contract is deliberately NOT asserted to be in sync: several writers edit the design volumes
// concurrently, so "the real tree is in sync at this instant" is not this generator's contract. Its contract
// is: (a) --write produces a block that --check then calls up to date; (b) re-running --write changes nothing.
{
  ok(existsSync(GEN), 'the planned-codes generator exists', GEN)
  ok(realText.includes(BEGIN) && realText.includes(END), 'the real contract carries the PLANNED-CODES marker pair',
    'BEGIN=' + realText.includes(BEGIN) + ' END=' + realText.includes(END))
  const dir = mkdtempSync(join(tmpdir(), 'vmu-planned-a-'))
  const copy = join(dir, '03-interface-contract.md')
  copyFileSync(CONTRACT, copy)
  const w = run(['--write'], { VMU_CONTRACT: copy })
  ok(w.status === 0, 'a fresh copy is writable (--write exit 0)', 'exit=' + w.status
    + ' ' + String(w.stderr || w.stdout || '').trim().slice(0, 140))
  const c = run(['--check'], { VMU_CONTRACT: copy })
  ok(c.status === 0 && /up to date/.test(String(c.stdout || '')),
    'after --write the copy is up to date (--check exit 0, "up to date" on stdout)',
    'exit=' + c.status + ' ' + String(c.stdout || '').trim().split('\n').slice(-1)[0].slice(0, 120))
  const before = readFileSync(copy, 'utf8')
  const w2 = run(['--write'], { VMU_CONTRACT: copy })
  ok(w2.status === 0 && readFileSync(copy, 'utf8') === before, 'a second --write is a no-op (deterministic)',
    'exit=' + w2.status)
  rmSync(dir, { recursive: true, force: true })
}

// ---- B. missing markers ⇒ exit 2, and the file is NOT touched ------------------------------------
{
  const dir = mkdtempSync(join(tmpdir(), 'vmu-planned-'))
  const copy = join(dir, '03-interface-contract.md')
  // strip the BEGIN line only: END stays, so this is exactly "the marker pair is incomplete"
  const stripped = realText.split('\n').filter((l) => l.indexOf(BEGIN) === -1).join('\n')
  writeFileSync(copy, stripped, 'utf8')
  const before = readFileSync(copy, 'utf8')
  const realBefore = readFileSync(CONTRACT, 'utf8')      // same-instant snapshot (writers edit docs concurrently)

  const w = run(['--write'], { VMU_CONTRACT: copy })
  ok(w.status === 2, 'a marker-less copy makes --write exit 2 (named refusal)', 'exit=' + w.status)
  ok(/markers/i.test(String(w.stderr || '')), 'the refusal SAYS the markers are missing',
    String(w.stderr || '').trim().split('\n')[0].slice(0, 140))
  ok(readFileSync(copy, 'utf8') === before, '--write did NOT modify the marker-less file (the defect is gone)')

  const c = run(['--check'], { VMU_CONTRACT: copy })
  ok(c.status === 2, 'a marker-less copy makes --check exit 2 (NOT 1: the two faults are distinguishable)',
    'exit=' + c.status)
  ok(readFileSync(copy, 'utf8') === before, '--check did not modify it either')
  ok(readFileSync(CONTRACT, 'utf8') === realBefore, 'the REAL contract was not touched by the negative case')
  rmSync(dir, { recursive: true, force: true })
}

// ---- C. one character inside the block ⇒ exit 1 (STALE), not 2 ------------------------------------
{
  const dir = mkdtempSync(join(tmpdir(), 'vmu-planned-s-'))
  const copy = join(dir, '03-interface-contract.md')
  copyFileSync(CONTRACT, copy)
  const lines = readFileSync(copy, 'utf8').split('\n')
  const b = lines.findIndex((l) => l.indexOf(BEGIN) !== -1)
  const e = lines.findIndex((l) => l.indexOf(END) !== -1)
  const rowIdx = lines.findIndex((l, i) => i > b && i < e && /^\| `VMU_/.test(l))
  ok(b >= 0 && e > b && rowIdx > b, 'the copy carries a generated code row between the markers',
    'begin=' + (b + 1) + ' end=' + (e + 1) + ' row=' + (rowIdx + 1))
  lines[rowIdx] = lines[rowIdx] + ' '                    // flip one character inside the generated block
  writeFileSync(copy, lines.join('\n'), 'utf8')
  const realBeforeC = readFileSync(CONTRACT, 'utf8')     // same-instant snapshot
  const r = run(['--check'], { VMU_CONTRACT: copy })
  ok(r.status === 1, 'one character inside the block makes --check exit 1 (STALE)', 'exit=' + r.status)
  ok(/STALE/.test(String(r.stderr || '')), 'the stale refusal says STALE and names the fix command',
    String(r.stderr || '').trim().split('\n').slice(0, 2).join(' | ').slice(0, 160))
  ok(readFileSync(CONTRACT, 'utf8') === realBeforeC, 'the real contract was not touched by the staleness case')
  rmSync(dir, { recursive: true, force: true })
}

if (failed === 0) {
  console.log('=== VMU PLANNED CODES: ALL GREEN (passed=' + passed + ', failed=0) ===')
  process.exit(0)
}
for (const f of failures) console.log('  FAIL - ' + f)
console.log('=== VMU PLANNED CODES: RED (passed=' + passed + ', failed=' + failed + ') ===')
process.exit(1)

#!/usr/bin/env node
// vibe-math-vmu — ASSEMBLY REACHABILITY, PINNED AS A SNAPSHOT.
//
// WHY THIS EXISTS (R16 / Lead ruling): `scripts/lib/reachability.mjs` answers ONE question — "is there an import path
// from a PLUGIN ENTRY file to this module?" — and two consumers already depend on it (the kernel-orphan gate and the
// settings table's "wired" column). The reachable SET itself, however, was only measured, never pinned: adding or
// removing an import silently changed which modules the running assembly can load, and every "wired" claim downstream
// moved with it. A measurement that nobody compares against anything is a number, not an invariant.
//
// WHAT THIS PINS: the full reachable set (repo-relative, `/`-separated) of `walkAssembly(vmuDir)`, plus the entry list
// that produced it. Any change — an ADDITION (a module newly loadable) or a REMOVAL (a module no longer loadable) —
// is RED until a human regenerates the baseline on purpose:
//
//   node tests/audit-assembly-reachability-snapshot.test.mjs --write
//
// and reviews the diff. `--write` is the ONLY way the baseline changes; nothing in this file rewrites it silently.
// The baseline may be pointed elsewhere with `VMU_REACH_BASELINE=<path>` (used by the teeth demo, and by nothing else).
//
// WHAT IT DOES NOT PROVE: that a reachable module is constructed, that its service has a caller, or that its keys
// change behaviour (the three-level chain "reachable ≠ constructed ≠ called" — `docs/11` §4.2 第五条). This gate only
// makes the CHEAPEST half explicit instead of implicit.
//
// TEETH (measured, not asserted in the abstract): a comparator self-probe runs below with three synthetic sets —
// identical ⇒ green, one addition ⇒ red, one removal ⇒ red. So "set equality" cannot pass by comparing two empties.

import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { dirname, join, resolve, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PLUGIN_ENTRY_FILES, walkAssembly } from '../scripts/lib/reachability.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, '..')
const VMU = join(ROOT, 'vibe-math-vmu')
const BASELINE = process.env.VMU_REACH_BASELINE
  ? resolve(process.env.VMU_REACH_BASELINE)
  : join(HERE, '_lib', 'assembly-reachability.baseline.json')
const WRITE = process.argv.includes('--write')

let passed = 0
const failures = []
const ok = (cond, name, detail) => {
  if (cond) { passed += 1; return }
  const shown = detail === undefined ? ''
    : ' [' + (typeof detail === 'object' ? JSON.stringify(detail) : String(detail)).slice(0, 300) + ']'
  failures.push(name + shown)
}

/** Repo-relative, `/`-separated name of an absolute path (the baseline's vocabulary). */
const relName = (abs) => relative(ROOT, abs).split(sep).join('/')

/** The one comparator. Returns { same, added, removed } — pure, so the self-probe can exercise it directly. */
const diffSets = (baselineNames, currentNames) => {
  const b = new Set(baselineNames)
  const c = new Set(currentNames)
  const added = [...c].filter((n) => !b.has(n)).sort()
  const removed = [...b].filter((n) => !c.has(n)).sort()
  return { same: added.length === 0 && removed.length === 0, added, removed }
}

// ─────────────────────────── TEETH: the comparator itself (three synthetic cases) ───────────────────────────
// ★ SELF-PROOF (audit-scanner-selfproof, round 17): `--self-test` runs THIS block alone and exits by its verdict,
// so the comparator's ability to redden is RUNNABLE in one command instead of asserted in the header.
const runComparatorProbe = () => {
  const base = ['a.js', 'b.js', 'kernel/c.js']
  const identical = diffSets(base, base.slice())
  ok(identical.same === true, '★ self-probe: an identical set compares EQUAL (the gate can be green at all)', identical)

  const withAddition = diffSets(base, base.concat(['d.js']))
  ok(withAddition.same === false && withAddition.added.length === 1 && withAddition.added[0] === 'd.js',
    '★★ self-probe (teeth): one ADDED module reddens and is NAMED (a silent widening cannot pass)', withAddition)

  const withRemoval = diffSets(base, base.filter((n) => n !== 'b.js'))
  ok(withRemoval.same === false && withRemoval.removed.length === 1 && withRemoval.removed[0] === 'b.js',
    '★★ self-probe (teeth): one REMOVED module reddens and is NAMED (a module dropping out of the assembly cannot pass)', withRemoval)

  // A double-empty comparison is the classic vacuous pass; it must not look like "same" in the assertion below,
  // which is why every real comparison is preceded by a non-empty precondition on BOTH sides.
  const doubleEmpty = diffSets([], [])
  ok(doubleEmpty.same === true,
    '★ self-probe (why the non-empty preconditions below exist): two empty sets DO compare equal — the real assertion therefore refuses empties first',
    doubleEmpty)
}
runComparatorProbe()
if (process.argv.includes('--self-test')) {
  console.log('SELFTEST ' + (failures.length === 0 ? 'PASS' : 'FAIL (' + failures.length + ')'))
  process.exit(failures.length === 0 ? 0 : 1)
}

// ─────────────────────────── THE REAL SNAPSHOT ───────────────────────────
const { entries, reachable } = walkAssembly(VMU)
const entryNames = entries.map(relName).sort()
const currentNames = [...reachable].map(relName).sort()

ok(PLUGIN_ENTRY_FILES.length === 8, 'fixture: the shared entry list is the 8 files the host loads', PLUGIN_ENTRY_FILES.length)
ok(entries.length === PLUGIN_ENTRY_FILES.length,
  'fixture: EVERY declared entry file exists on disk (a missing entry would silently narrow the graph)', { found: entries.length, declared: PLUGIN_ENTRY_FILES.length })
ok(entryNames.length > 0, 'fixture: the entry list is non-empty before comparing it', entryNames.length)
ok(currentNames.length > 0, 'fixture: the reachable set is non-empty before comparing it (an empty walk is a broken walk)', currentNames.length)

if (WRITE) {
  const payload = {
    generatedBy: 'node tests/audit-assembly-reachability-snapshot.test.mjs --write',
    note: 'Reachable set of walkAssembly(vibe-math-vmu) from the 8 PLUGIN_ENTRY_FILES. Both directions are gated: an addition AND a removal redden. Regenerate only after reviewing the diff; never to make a red disappear.',
    entries: entryNames,
    reachable: currentNames,
  }
  writeFileSync(BASELINE, JSON.stringify(payload, null, 2) + '\n', 'utf8')
  console.log('WROTE ' + BASELINE)
  console.log('entries=' + entryNames.length + ' reachable=' + currentNames.length)
  process.exit(0)
}

ok(existsSync(BASELINE), 'the baseline exists (run this file with --write to create it deliberately)', BASELINE)
const baseline = existsSync(BASELINE) ? JSON.parse(readFileSync(BASELINE, 'utf8')) : {}
const baseEntries = Array.isArray(baseline.entries) ? baseline.entries.slice() : []
const baseReachable = Array.isArray(baseline.reachable) ? baseline.reachable.slice() : []
ok(baseEntries.length > 0 && baseReachable.length > 0,
  '★ fixture: the baseline is non-empty on both sides (an empty baseline would make the set comparison vacuously true)', { entries: baseEntries.length, reachable: baseReachable.length })

ok(baseEntries.length > 0 && entryNames.length > 0,
  'fixture: both sides non-empty immediately before the entry set comparison (a vacuous equal is not evidence)',
  { baseline: baseEntries.length, current: entryNames.length })
const entryDiff = diffSets(baseEntries, entryNames)
ok(entryDiff.same === true,
  '★★ the ENTRY set is unchanged (the graph is rooted where the host actually loads; adding an entry is a deliberate act)',
  entryDiff)

ok(baseReachable.length > 0 && currentNames.length > 0,
  'fixture: both sides non-empty immediately before the reachable set comparison (an empty walk would compare equal to an empty baseline)',
  { baseline: baseReachable.length, current: currentNames.length })
const setDiff = diffSets(baseReachable, currentNames)
ok(setDiff.same === true,
  '★★ the REACHABLE SET is unchanged (additions and removals are both red; regenerate with --write after reviewing the diff)',
  { added: setDiff.added, removed: setDiff.removed })

// Every entry must be inside the reachable set (walkAssembly seeds the walk with them; this catches a broken walk).
ok(entryNames.length > 0 && currentNames.length > 0,
  'fixture: both sides non-empty immediately before the loop assertion (RULE E only reads the 3 lines above a loop)',
  { entries: entryNames.length, reachable: currentNames.length })
ok(entryNames.every((n) => currentNames.includes(n)),
  '★ every entry file is in the reachable set (a walk that loses its own roots asserts nothing)',
  { missing: entryNames.filter((n) => !currentNames.includes(n)) })

// ─────────────────────────── summary ───────────────────────────
if (failures.length > 0) {
  console.log('')
  for (const f of failures) console.log('  ✗ ' + f)
  console.log('ASSEMBLY REACHABILITY SNAPSHOT: ' + passed + ' passed, ' + failures.length + ' failed')
  process.exit(1)
}
console.log('ASSEMBLY REACHABILITY SNAPSHOT: ' + passed + ' passed, 0 failed')

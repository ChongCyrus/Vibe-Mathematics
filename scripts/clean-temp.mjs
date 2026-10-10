#!/usr/bin/env node
/**
 * TEMP HYGIENE (task-12) — sweep STALE test scratch directories and prefer a roomier temp root.
 *
 * WHY THIS EXISTS (measured, 2026-10 on this machine): the suites create their workspace with
 * `mkdtempSync(join(tmpdir(), '<prefix>-…'))` and remove it in `finally` — but a suite KILLED by the
 * runner's per-suite timeout cannot clean up, and some suites create many directories per run. After
 * hundreds of sweeps `%TEMP%` had reached **248,737 top-level entries, 245,288 of them ours**
 * (`vibe-*` 221,939, `v2-fix-*` 23,160, …), with 111,223 older than 24 h (oldest ~2 weeks).
 *
 * TWO RULES, both bounded:
 *   1. SWEEP: delete only entries at the TOP LEVEL of the temp root, only whose name starts with a
 *      prefix ACTUALLY USED BY THE SUITES (extracted from `tests/*.mjs`, never hand-written), and only
 *      when older than `--age-hours` (default 6 h — a concurrently running gate's dirs stay safe).
 *   2. PREFER D:: when `D:\_tmp` can be created, point TEMP/TMP/TMPDIR at it (the suites follow
 *      `os.tmpdir()` automatically, so this needs NO product change). Never hard-fail: if the drive is
 *      absent the ambient temp root is kept.
 *
 * Usage:
 *   node scripts/clean-temp.mjs                     # sweep (age 6 h) and print counts
 *   node scripts/clean-temp.mjs --dry-run           # print the plan, delete nothing
 *   node scripts/clean-temp.mjs --age-hours=12      # change the threshold
 *   node scripts/clean-temp.mjs --root=<dir>        # sweep another temp root (mainly for tests)
 *   node scripts/clean-temp.mjs --self-test         # prove the guards below (fresh dirs are NEVER swept)
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = resolve(HERE, '..')
const TESTS = join(REPO, 'tests')

/** Prefixes the suites really use — extracted from their own `mkdtempSync(join(tmpdir(), '<prefix>'))` calls. */
export function suitePrefixes(testsDir = TESTS) {
  const out = new Set()
  let files = []
  try { files = readdirSync(testsDir) } catch (e) { return [] }
  for (const f of files) {
    if (!f.endsWith('.mjs')) continue
    let text = ''
    try { text = readFileSync(join(testsDir, f), 'utf8') } catch (e) { continue }
    for (const m of text.matchAll(/mkdtempSync\(\s*join\(\s*tmpdir\(\)\s*,\s*'([^']+)'/g)) out.add(m[1])
    for (const m of text.matchAll(/mkdtempSync\(\s*join\(\s*tmpdir\(\)\s*,\s*"([^"]+)"/g)) out.add(m[1])
  }
  return [...out].sort()
}

/**
 * PURE planner: which entries may be deleted. `entries` are `{name, mtimeMs}` already read from the
 * temp root. An entry qualifies only if BOTH hold: its name starts with a suite prefix, and it is older
 * than the threshold. (This is the function the mutant family attacks: replacing the age test with
 * `true` must make the "a FRESH dir is never swept" check go red BY NAME.)
 */
export function planSweep(entries, { prefixes, ageHours = 6, now = Date.now() } = {}) {
  const cut = now - ageHours * 3600 * 1000
  return entries
    .filter((e) => Array.isArray(prefixes) ? prefixes.some((p) => String(e.name).startsWith(p)) : false)
    .filter((e) => Number(e.mtimeMs) < cut)
    .map((e) => e.name)
}

/**
 * Read the top level of a temp root into planner entries.
 *
 * ROUND 58: this used to skip FILES (`if (!d.isDirectory()) continue`), which meant a scratch script or a gate
 * log written straight into the temp root was never swept - it just accumulated for ever. The safety does not
 * come from "only directories", it comes from the PREFIX + AGE pair below, so files are now listed too and are
 * subject to exactly the same two tests. (The suite prefixes are extracted from the suites; the scratch prefixes
 * are the narrow, explicit allowlist of names THIS project's own tooling writes.)
 */
export function listTop(root) {
  const out = []
  let names = []
  try { names = readdirSync(root, { withFileTypes: true }) } catch (e) { return out }
  for (const d of names) {
    if (!d.isDirectory() && !d.isFile()) continue
    let mtimeMs = 0
    try { mtimeMs = statSync(join(root, d.name)).mtimeMs } catch (e) { continue }
    out.push({ name: d.name, mtimeMs })
  }
  return out
}

/** Delete the planned entries. Returns counts so callers can print a checkable summary. */
export function sweep({ root = tmpdir(), prefixes, ageHours = 6, dryRun = false, log = () => {} } = {}) {
  const all = listTop(root)
  const doomed = planSweep(all, { prefixes, ageHours })
  if (dryRun) return { root, scanned: all.length, planned: doomed.length, deleted: 0, failed: 0, dryRun: true }
  let deleted = 0
  let failed = 0
  for (const name of doomed) {
    try { rmSync(join(root, name), { recursive: true, force: true }); deleted++ } catch (e) { failed++ }
  }
  log('temp-hygiene: root=' + root + ' scanned=' + all.length + ' stale=' + doomed.length + ' deleted=' + deleted + ' failed=' + failed + ' ageHours=' + ageHours)
  return { root, scanned: all.length, planned: doomed.length, deleted, failed }
}

/**
 * Scratch prefixes THIS project's own tooling writes into the temp root (round 58). Deliberately a short,
 * explicit allowlist - never a glob - so a stale file from some other program is never touched. Everything here
 * is subject to the same age threshold as the suite dirs: **if it has not been reused for 6 h, it is deleted.**
 */
export const SCRATCH_PREFIXES = ['vmu-', 'probe-', 't1-', 'vmu_', 'tmp-vmu']

/** Every prefix the sweep may delete: suite workspaces (extracted from tests) + our own scratch names. */
export function sweepPrefixes(testsDir = TESTS) {
  return suitePrefixes(testsDir).concat(SCRATCH_PREFIXES)
}

/** `D:\_tmp` when the D: drive is usable; otherwise null (keep the ambient temp root). Never throws. */
export function preferredTempRoot(candidate = 'D:\\_tmp') {
  try {
    if (!existsSync(candidate)) mkdirSync(candidate, { recursive: true })
    return existsSync(candidate) ? candidate : null
  } catch (e) { return null }
}

/** Point TEMP/TMP/TMPDIR at `root` (children inherit; `os.tmpdir()` follows). No-op when root is falsy. */
export function useTempRoot(root) {
  if (!root) return false
  process.env.TEMP = root
  process.env.TMP = root
  process.env.TMPDIR = root
  return true
}

/**
 * Leftover-PROCESS detector (task-15). Measured motivation: a leftover DSH host (`--profile vmfix7`,
 * started two days earlier, its parent gone) had burned **197,410 s of CPU** on this 4-core machine - a
 * full core, permanently. With it, whole-gate `sum of suite times` went 2822 s -> 7875 s (x2.8) and
 * individual suites ran 1.3x-4.5x slower, so honest suites reported failures that never reproduced
 * standalone. The rule is deliberately NARROW: flag a process only when its command line matches THIS
 * project/team AND its parent is gone (a process the running gate spawned has a live parent, so a healthy
 * gate is never flagged - that property is asserted in `--self-test` and mutated by the family).
 */
export const DEFAULT_PROCESS_PATTERNS = [
  /--profile\s+\S+/,              // a DSH host started against any profile (including our clones)
  /[\\/]review[\\/][^\\/]*\.mjs/, // the dev-only harness scripts kept under _oneoff/review
  /[\\/]tests[\\/][^\\/]*\.mjs/,  // a test/probe script (gates, mutant families)
  /--temp-dry-run/,               // another gate run
]

export function suspectProcesses(entries, { selfPids = [], patterns = DEFAULT_PROCESS_PATTERNS } = {}) {
  const self = new Set((selfPids || []).map((p) => String(p)))
  return (entries || []).filter((e) => {
    if (!e || self.has(String(e.pid))) return false
    if (!patterns.some((re) => re.test(String(e.cmd || '')))) return false
    return e.parentGone === true          // the safety property: a live parent means something owns it
  })
}

/**
 * List node processes with a `parentGone` flag. Windows-only in practice (PowerShell JSON); other
 * platforms return [] rather than pretending. `exec` is injectable so the self-test can feed fixtures.
 */
export function listProcesses({ exec = null } = {}) {
  if (process.platform !== 'win32' && !exec) return []
  const ps = "$live=@{}; Get-Process | ForEach-Object { $live[[int]$_.Id]=1 }; " +
    "Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'node.exe' } | ForEach-Object { " +
    "[pscustomobject]@{ pid=[int]$_.ProcessId; parent=[int]$_.ParentProcessId; cmd=[string]$_.CommandLine; " +
    "parentGone=(-not $live.ContainsKey([int]$_.ParentProcessId)); created=[string]$_.CreationDate } } | ConvertTo-Json -Compress"
  try {
    const run = exec || ((args) => execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', args], { encoding: 'utf8', timeout: 30000 }))
    const raw = String(run(ps) || '').trim()
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : [parsed]
  } catch (e) { return [] }
}

export function formatSuspect(s) {
  const cmd = String(s.cmd || '')
  return '  pid=' + s.pid + '  parent=' + s.parent + (s.parentGone ? ' (GONE)' : '') + '  ' + (s.created || '') + '  ' + cmd.slice(0, 120)
}

const argv = process.argv.slice(2)
const has = (n) => argv.includes('--' + n)
const val = (n, d) => { const a = argv.find((x) => x.startsWith('--' + n + '=')); return a ? a.split('=').slice(1).join('=') : d }

if (has('self-test')) {
  // The GUARD: these three checks fail BY NAME if the planner's prefix test or age test is broken.
  const now = Date.now()
  const prefixes = ['vibe-', 'v2-fix-']
  const entries = [
    { name: 'vibe-fresh-abc', mtimeMs: now - 60 * 1000 },              // fresh  ⇒ must NOT be planned
    { name: 'vibe-stale-abc', mtimeMs: now - 48 * 3600 * 1000 },       // stale  ⇒ MUST be planned
    { name: 'v2-fix-stale', mtimeMs: now - 48 * 3600 * 1000 },         // stale  ⇒ MUST be planned
    { name: 'unrelated-stale', mtimeMs: now - 48 * 3600 * 1000 },      // foreign⇒ must NOT be planned
    { name: 'vibestale-nodash', mtimeMs: now - 48 * 3600 * 1000 },     // prefix must match exactly
  ]
  const planned = planSweep(entries, { prefixes, ageHours: 6, now })
  const failures = []
  const check = (cond, label) => { console.log((cond ? 'PASS ' : 'FAIL - ') + label); if (!cond) failures.push(label) }
  check(!planned.includes('vibe-fresh-abc'), 'TEMP-HYGIENE: a FRESH suite dir is never swept (age threshold respected)')
  check(planned.includes('vibe-stale-abc') && planned.includes('v2-fix-stale'), 'TEMP-HYGIENE: STALE dirs with a suite prefix ARE swept')
  check(!planned.includes('unrelated-stale') && !planned.includes('vibestale-nodash'), 'TEMP-HYGIENE: only exact suite prefixes are swept (no glob-like overreach)')
  const live = suitePrefixes()
  check(live.length >= 3, 'TEMP-HYGIENE: the prefix table is EXTRACTED from the suites (found ' + live.length + ': ' + live.slice(0, 4).join(', ') + ' …)')
  // ROUND 58: scratch FILES are swept by the same prefix+age pair, and foreign files still never are.
  const scratch = [
    { name: 'vmu-spec-census.mjs', mtimeMs: now - 7 * 3600 * 1000 },   // OUR scratch, stale ⇒ MUST be planned
    { name: 'vmu-census-new.mjs', mtimeMs: now - 60 * 1000 },          // OUR scratch, fresh ⇒ must NOT be planned
    { name: 'probe-clocks.mjs', mtimeMs: now - 30 * 3600 * 1000 },     // OUR probe, stale   ⇒ MUST be planned
    { name: 'notes-from-someone-else.md', mtimeMs: now - 30 * 3600 * 1000 }, // foreign stale ⇒ must NOT be planned
  ]
  const plannedScratch = planSweep(scratch, { prefixes: sweepPrefixes(), ageHours: 6, now })
  check(plannedScratch.includes('vmu-spec-census.mjs') && plannedScratch.includes('probe-clocks.mjs'),
    'TEMP-HYGIENE: STALE scratch FILES with our own prefixes ARE swept (they used to be skipped forever)')
  check(!plannedScratch.includes('vmu-census-new.mjs'), 'TEMP-HYGIENE: a FRESH scratch file is never swept (6 h rule holds for files too)')
  check(!plannedScratch.includes('notes-from-someone-else.md'), 'TEMP-HYGIENE: a foreign stale file is never swept (the allowlist is explicit, not a glob)')
  // task-15: the leftover-PROCESS predicate, tested on fixtures so the property is checkable and mutable.
  const procs = [
    { pid: 1, parent: 999, parentGone: true, cmd: 'node tests/run-tests.mjs --temp-dry-run' },  // excluded via selfPids ONLY
    { pid: 5, parent: 995, parentGone: false, cmd: 'node tests/run-tests.mjs --temp-dry-run' }, // LIVE parent -> never suspect
    { pid: 2, parent: 998, parentGone: true, cmd: 'node tests/run-tests.mjs --temp-dry-run' },  // an ORPHANED gate
    { pid: 3, parent: 997, parentGone: true, cmd: 'node bin.js --profile vmfix7 --port 7791' }, // the measured leftover
    { pid: 4, parent: 996, parentGone: true, cmd: 'C:/apps/editor/editor.exe --open notes.md' },// unrelated program
  ]
  const susp = suspectProcesses(procs, { selfPids: [1] })
  check(!susp.some((s) => s.pid === 1), 'TEMP-HYGIENE: an explicitly excluded pid (self / own parent) is never reported')
  // This one is what the "parent-gone" mutation attacks: pid 5 is NOT excluded by selfPids, so only the
  // live-parent property keeps it out of the report.
  check(!susp.some((s) => s.pid === 5), 'TEMP-HYGIENE: a process with a LIVE parent (our running gate) is never called a leftover')
  check(susp.some((s) => s.pid === 2) && susp.some((s) => s.pid === 3), 'TEMP-HYGIENE: ORPHANED project/team processes are reported (incl. a DSH host started against a clone profile)')
  check(!susp.some((s) => s.pid === 4), 'TEMP-HYGIENE: an unrelated program is never reported (the command-line gate holds)')
  console.log('temp-hygiene self-test: ' + (failures.length ? failures.length + ' failure(s)' : 'all checks passed'))
  process.exit(failures.length ? 1 : 0)
}

// CLI entry detection must survive being IMPORTED (then `process.argv[1]` is undefined — the naive
// `process.argv[1].replace(...)` form threw a TypeError for every importer).
const isCli = (() => {
  try { return !!process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url) } catch (e) { return false }
})()

if (isCli) {
  // task-15: read-only leftover-process report. `--kill` must be asked for explicitly, and the current
  // process + its parent are always excluded (a running gate must never kill itself).
  if (has('ps')) {
    const procs = listProcesses()
    const susp = suspectProcesses(procs, { selfPids: [process.pid, process.ppid] })
    console.log('temp-hygiene --ps: scanned ' + procs.length + ' node process(es); suspects=' + susp.length)
    for (const s of susp) console.log(formatSuspect(s))
    if (has('kill')) {
      let killed = 0
      for (const s of susp) { try { process.kill(Number(s.pid), 'SIGKILL'); killed++ } catch (e) { /* already gone */ } }
      console.log('temp-hygiene --ps --kill: killed=' + killed)
    } else if (susp.length) {
      console.log('temp-hygiene --ps: read-only. Re-run with --kill to stop them (each one steals CPU from the gate).')
    }
    process.exit(0)
  }
  const root = val('root', null)
  if (!root) { const pref = preferredTempRoot(); if (useTempRoot(pref)) console.log('temp-hygiene: using temp root ' + pref) }
  const res = sweep({
    root: val('root', tmpdir()),
    prefixes: sweepPrefixes(),
    ageHours: Number(val('age-hours', '6')),
    dryRun: has('dry-run'),
    log: (m) => console.log(m),
  })
  console.log('temp-hygiene: ' + JSON.stringify(res))
}

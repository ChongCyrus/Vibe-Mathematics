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

/** Read the top level of a temp root into planner entries. Only DIRECTORIES are considered. */
export function listTop(root) {
  const out = []
  let names = []
  try { names = readdirSync(root, { withFileTypes: true }) } catch (e) { return out }
  for (const d of names) {
    if (!d.isDirectory()) continue
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
  console.log('temp-hygiene self-test: ' + (failures.length ? failures.length + ' failure(s)' : 'all checks passed'))
  process.exit(failures.length ? 1 : 0)
}

// CLI entry detection must survive being IMPORTED (then `process.argv[1]` is undefined — the naive
// `process.argv[1].replace(...)` form threw a TypeError for every importer).
const isCli = (() => {
  try { return !!process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url) } catch (e) { return false }
})()

if (isCli) {
  const root = val('root', null)
  if (!root) { const pref = preferredTempRoot(); if (useTempRoot(pref)) console.log('temp-hygiene: using temp root ' + pref) }
  const res = sweep({
    root: val('root', tmpdir()),
    prefixes: suitePrefixes(),
    ageHours: Number(val('age-hours', '6')),
    dryRun: has('dry-run'),
    log: (m) => console.log(m),
  })
  console.log('temp-hygiene: ' + JSON.stringify(res))
}

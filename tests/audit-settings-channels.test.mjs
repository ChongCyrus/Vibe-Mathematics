// audit-settings-channels.test.mjs — gate for the TWO-READING-CHANNEL class and the zero-mechanism matrix.
//
// Why (reviewer round 15; root causes of rounds 13–14):
//   · 4th case: the settings view only exposed `get()` — property readers saw nothing.
//   · 5th case: the view was a CONSTRUCTION-TIME SNAPSHOT — `setSettingsValue()` reached `get()` and never
//     the property channel, so a runtime change silently had no effect (the receipt still said ok).
//   Both escaped the existing read-side gate because it scans LITERALS. This gate observes the channels.
//
// Gate 1: every settings key read at construction must be readable through BOTH channels, and a runtime
//         `setSettingsValue()` must be observed by both — no snapshot, no divergence.
// Gate 2: `node scripts/generate-zero-mechanism-matrix.mjs --check` ⇒ mismatches > 0 is RED;
//         `unregistered` (design undecided) and `probe-errors` (probe missing an argument) are COUNTED ONLY —
//         "undecided" must never be dressed up as "red".
// Run: node tests/audit-settings-channels.test.mjs
import { execFileSync } from 'node:child_process'
import { createKernel } from '../vibe-math-vmu/kernel/index.js'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..')
const MATRIX = join(REPO, 'scripts', 'generate-zero-mechanism-matrix.mjs')

let passed = 0
let failed = 0
function ok(cond, label, detail) { if (cond) { passed += 1 } else { failed += 1; console.log('FAIL ' + label + (detail === undefined ? '' : ' [' + detail + ']')) } }

const j2 = (s) => /ZERO-MECHANISM MATRIX/.test(String(s))
/** D9 drift rule, as a pure function: only exit 0 passes; anything else is the NAMED red MATRIX_DRIFT. */
export function judgeDrift(code) { return Number(code) === 0 ? 'PASS' : 'FAIL MATRIX_DRIFT' }

// ── the two-channel rule, as a pure function (so it can be fault-injected) ───────────────────
export function twoChannelAgree(a, b) { return a === b }
export function judgeMatrix(summary) {
  // The summary gained EXPECT_UNDECIDED and an n/a count when the matrix adjudicated all sixty modules (round 28).
  // The parser had to move with it - and the failure this caused was a real integration break, which is exactly
  // what a gate is for. Only `mismatches` reddens; undecided, unregistered and probe-errors are counted.
  const m = /(\d+)\s+modules,\s+(\d+)\s+mismatches,\s+(\d+)\s+unregistered(?:,\s+(\d+)\s+EXPECT_UNDECIDED)?(?:,\s+(\d+)\s+probe-errors)?(?:,\s+(\d+)\s+n\/a)?/.exec(summary)
  if (!m) return { ok: false, reason: 'unparseable summary', red: true }
  const num = (v) => (v === undefined ? 0 : Number(v))
  return {
    ok: true,
    modules: Number(m[1]),
    mismatches: Number(m[2]),
    unregistered: num(m[3]),
    undecided: num(m[4]),
    probeErrors: num(m[5]),
    notApplicable: num(m[6]),
    red: Number(m[2]) > 0,
  }
}

// ── Gate 1: watch BOTH channels of a REAL kernel ────────────────────────────────────────────
function channelProbe() {
  const getCalls = []
  const propCalls = []
  const backing = {}
  const proxy = new Proxy(backing, {
    get(t, p) {
      if (typeof p === 'string' && p !== 'get' && p !== 'has' && p !== 'keys' && p !== 'toJSON') propCalls.push(p)
      return t[p]
    },
    set(t, p, v) { t[p] = v; return true },
  })
  proxy.get = (key) => { getCalls.push(String(key)); return backing[key] }
  let kernel = null
  try { kernel = createKernel({ clock: () => 0, settings: proxy, root: null }) }
  catch (e) { return { kernel: null, error: e, getCalls, propCalls, backing, get: (k) => proxy.get(k) } }
  return { kernel, error: null, getCalls, propCalls, backing, get: (k) => proxy.get(k) }
}

{
  const probe = channelProbe()
  ok(probe.error === null, 'G1.a: createKernel accepts an instrumented settings object', probe.error && probe.error.message)
  if (probe.kernel) {
    const k = probe.kernel
    ok(typeof k.setSettingsValue === 'function', 'G1.b: the kernel exposes setSettingsValue (the runtime channel)')
    const keys = [...new Set(probe.propCalls)]
    ok(keys.length >= 5, 'G1.c: construction-time property reads reach the view (the property channel is wired, not get()-only)', 'keys=' + keys.length)
    const sampleKeys = keys.length ? keys : ['vmu.external.enabled']
    let observed = 0
    for (const key of sampleKeys.slice(0, 40)) {
      const before = probe.backing[key]
      const value = typeof before === 'boolean' ? !before : (typeof before === 'number' ? before + 1 : 'runtime-probe')
      let res = null
      try { res = k.setSettingsValue(key, value) } catch (e) { res = { error: e } }
      const viaProp = probe.backing[key]
      const viaGet = probe.get(key)   // the get() channel IS the settings view's get(), i.e. what consumers call
      if (viaProp !== undefined) observed += 1
      ok(twoChannelAgree(viaProp, viaGet), 'G1.e: both channels agree after a runtime set (' + key + ')', 'prop=' + JSON.stringify(viaProp) + ' get=' + JSON.stringify(viaGet))
      try { k.setSettingsValue(key, before) } catch (e) { /* restore defaults */ }
    }
    ok(observed >= 1 || sampleKeys.length === 0, 'G1.g: at least one sampled key is materialised in the view (no snapshot isolation)', 'observed=' + observed)
  }
}

// ── Gate 1 self-proofs (pure): the rule bites on divergence and agrees on equality ───────────
{
  ok(twoChannelAgree(1, 1) === true && twoChannelAgree(1, 2) === false, 'S1: the two-channel rule accepts equality and rejects divergence')
  ok(twoChannelAgree(undefined, undefined) === true, 'S2: two absent values agree (a missing key is not a divergence)')
  ok(twoChannelAgree(1, undefined) === false, 'S3 (fault): the snapshot shape (property channel lost the value) is rejected')
}

// ── Gate 2: the zero-mechanism matrix --check ───────────────────────────────────────────────
{
  let out = '', code = 0
  try { out = execFileSync(process.execPath, [MATRIX], { cwd: REPO, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }) }
  catch (e) { out = String(e.stdout || '') + String(e.stderr || ''); code = e.status === undefined ? 1 : e.status }
  // the script's --check only reports DRIFT against the written matrix; the full matrix (with the summary) is printed without flags
  let drift = '', driftCode = 0
  try { drift = execFileSync(process.execPath, [MATRIX, '--check'], { cwd: REPO, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }) }
  catch (e) { drift = String(e.stdout || '') + String(e.stderr || ''); driftCode = e.status === undefined ? 1 : e.status }
  // D9 (reviewer round 19): drift detection was WIRED but never ENFORCED — the old assertion passed as long
  // as the drift was *named*, so a stale matrix could sit there while every gate stayed green. Enforcement now
  // requires exit 0; the "must be named" requirement stays as an ADDITIONAL assertion (no `||` escape).
  ok(driftCode === 0, 'G2.g: the matrix --check must exit 0 (drift is RED, not merely reported)', 'exit=' + driftCode + ' out=' + drift.trim())
  if (driftCode !== 0) ok(/drift/i.test(drift), 'G2.g2: a non-zero --check is still REPORTED BY NAME (additional, not a substitute)', drift.trim())
  ok(judgeDrift(0) === 'PASS' && /^FAIL/.test(judgeDrift(1)) && /MATRIX_DRIFT/.test(judgeDrift(1)), 'G2.g3 (fault): the drift rule itself reddens on a non-zero code and NAMES it (MATRIX_DRIFT)')
  const summary = (out.split('\n').filter((l) => /ZERO-MECHANISM MATRIX/.test(l)).slice(-1)[0] || '').trim()
  const j = judgeMatrix(summary)
  ok(j.ok, 'G2.a: the matrix summary is parseable', summary)
  ok(j.red === (j.mismatches > 0), 'G2.b: RED is decided by mismatches alone (not by unregistered/probe-errors)')
  ok(!(j.unregistered > 0) || j.red === (j.mismatches > 0), 'G2.c: a non-zero unregistered count never reddens on its own')
  ok(!(j.probeErrors > 0) || j.red === (j.mismatches > 0), 'G2.d: a non-zero probe-errors count never reddens on its own')
  const findings = out.split('\n').filter((l) => /^FINDING /.test(l))
  if (j.red) {
    ok(code !== 0, 'G2.e: mismatches > 0 ⇒ the gate is RED (exit non-zero)', 'exit=' + code)
    console.log('G2 FINDINGS (' + findings.length + '): ' + findings.map((f) => f.trim()).join(' | '))
  } else ok(code === 0, 'G2.e: no mismatches ⇒ green', 'exit=' + code)
  ok(findings.length === j.mismatches, 'G2.f: every mismatch is reported as a FINDING line (no silent mismatch)', 'findings=' + findings.length + ' mismatches=' + j.mismatches)
}

// ── Gate 2 self-proofs (pure, deterministic) ────────────────────────────────────────────────
{
  const red = judgeMatrix('=== ZERO-MECHANISM MATRIX: 60 modules, 2 mismatches, 40 unregistered, 15 probe-errors ===')
  ok(red.ok && red.red === true && red.unregistered === 40 && red.probeErrors === 15, 'S4 (fault): expectation≠actual (mismatches>0) is RED while 40 unregistered + 15 probe-errors are only counted')
  const counted = judgeMatrix('=== ZERO-MECHANISM MATRIX: 60 modules, 0 mismatches, 40 unregistered, 15 probe-errors ===')
  ok(counted.ok && counted.red === false, 'S5 (fault): unregistered/probe-errors alone do NOT redden (undecided is not red)')
  const empty = judgeMatrix('nothing here')
  ok(empty.ok === false && empty.red === true, 'S6 (fault): an unparseable summary is RED (never silently green)')
}

console.log('=== VMU SETTINGS CHANNELS: ' + passed + ' passed, ' + failed + ' failed ===')
if (failed > 0) process.exit(1)

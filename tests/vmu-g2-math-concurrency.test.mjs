#!/usr/bin/env node
// vmu G2 — ONE READER FOR THE MATH CONCURRENCY CAP, AND A CAP THAT ACTUALLY APPLIES.
//
// THE RULE (宏观层面v5r运行规则.md line 59): members may use math tools (Python etc.), but the office sets
// the concurrency limit so a batch cannot overload the CPU or OOM the host.
//
// THE MEASURED DEFECT THIS SUITE PINS. `vmu.math.maxParallel` is a live H1 setting enforced by TWO faces:
//   · `kernel/mathtools.js` plan() rail ⑩ (the policy layer — nested/parallel math plans);
//   · `kernel/mathjobs.js` slot gate (the queue — jobs actually spawned).
// The policy layer read the key ONCE, into its `K` construction snapshot, and then railed against that
// snapshot forever, while the queue re-read the setting live per job. In a live run the office set
// `vmu.math.maxParallel=2` with `vibe_v5_set`; the queue honoured 2, the policy layer kept refusing the
// second concurrent plan against its stale 1, and `math status` read back `maxParallel: 1` — the operator
// had no way to see that the write took effect, and >1 concurrency was never exercised. Two readers of one
// setting must read the same thing.
//
// WHAT IS ASSERTED (each section has positive AND negative evidence; every loop is guarded by a
// non-empty length assertion — a vacuously-true `.every` is not evidence):
//   §1 FRESH KERNEL: both faces read the DEFAULT, and that default comes from the schema declaration
//      (not from a literal restated in the module), so changing the declaration moves both.
//   §2 LIVE WRITE, SAME INSTANCE: after a runtime write (the same route `vibe_v5_set` takes through the
//      settings view) the very NEXT status read reports the new value — no restart, no re-construction —
//      while `snapshotAtConstruction` keeps honestly disclosing the stale snapshot it does NOT rail on.
//   §3 THE CAP REALLY APPLIES: with a deferred fake spawn, cap 1 spawns exactly one job and parks the
//      second (`queued`), and after the same instance's cap is raised to 2 (live write) two jobs overlap
//      in flight at the same time (`maxInFlight === 2`, no more). This is the requirement's "must actually
//      allow 2 concurrent jobs", proved by the seam rather than asserted.
//   §4 ONE HELPER, TWO FACES AGREE: `mathtools.status()`, `mathtools.plan()` and `mathjobs.config()` all
//      report the same live number, both faces are observed READING the same key in the same turn, and the
//      queue's source no longer derives the value locally.
//
// RULE E (the repo's vacuous-assertion rejection): every `for..of` / `.every` below is preceded by a
// `length > 0` assertion, and the overlap test asserts an exact in-flight count instead of ">= 1".
//
// Run: node tests/vmu-g2-math-concurrency.test.mjs
// Last line: === VMU G2 MATH CONCURRENCY: N passed, M failed ===

import { readFileSync } from 'node:fs'
import { createMathTools, readMaxParallel, MAX_PARALLEL_KEY } from '../vibe-math-vmu/kernel/mathtools.js'
import { createMathJobs } from '../vibe-math-vmu/kernel/mathjobs.js'
import { declaredDefault } from '../vibe-math-vmu/kernel/settings-defaults.js'

const KEY = MAX_PARALLEL_KEY
const HERE = new URL('.', import.meta.url)

let passed = 0
let failed = 0
const failures = []
const ok = (cond, name, detail) => {
  if (cond) { passed += 1; console.log('  ok   ' + name) }
  else {
    failed += 1
    failures.push(name + (detail === undefined ? '' : ' [' + (typeof detail === 'string' ? detail : JSON.stringify(detail)) + ']'))
    console.log('  FAIL ' + name + (detail === undefined ? '' : ' [' + JSON.stringify(detail) + ']'))
  }
}
const tick = () => new Promise((resolve) => setTimeout(resolve, 0))
const settle = async (pred, tries = 60) => { for (let i = 0; i < tries && !pred(); i += 1) await tick(); return pred() }

/**
 * A LIVE settings view: the same shape the kernel hands both faces (`kernel/index.js` `settingsView`).
 * The kernel's view is a Proxy over the LIVE settings object whose `get` trap returns `target[key]`, and
 * `readSetting()` reads through the PROPERTY route (`settings[key]`), so this helper must serve both the
 * property route and the `.get()` method route, and both must read the SAME mutable map. `set()` writes the
 * map — the equivalent of `setSettingsValue()` writing `settings[key] = value` (`kernel/index.js:4037`),
 * which is the object the view wraps; a test cannot write through the real view (it refuses by name).
 */
const liveView = (initial = {}) => {
  const map = new Map(Object.entries(initial))
  const reads = []
  const target = { get(k) { reads.push(k); return map.get(k) } }
  const settings = new Proxy(target, {
    get(t, k) {
      if (k === 'get') { reads.push('get'); return t.get }
      reads.push(k)
      return map.get(k)
    },
    has(t, k) { return k === 'get' || map.has(k) },
    getOwnPropertyDescriptor(t, k) {
      return k === 'get'
        ? { value: t.get, enumerable: false, configurable: true }
        : (map.has(k) ? { value: map.get(k), enumerable: true, configurable: true, writable: false } : undefined)
    },
    ownKeys() { return ['get', ...map.keys()] },
  })
  return { reads, set: (k, v) => { map.set(k, v) }, settings }
}

const toolsOf = (settings) => createMathTools({ clock: () => 1000, settings, spawn: () => ({ ok: true, result: { value: 1 }, logLines: [], warnings: [], durationMs: 1 }) })

// ── §1 FRESH KERNEL: the default, from the DECLARATION ─────────────────────────────────────────────
{
  const declared = declaredDefault(KEY)
  ok(Number(declared) === 1, '§1 the schema DECLARES the default cap as 1 (the assertion below is therefore not the module agreeing with itself)', { declared })
  const t = toolsOf({})
  const st = t.status()
  const jobs = createMathJobs({ clock: () => 1000, log: () => {}, settings: {}, spawn: async () => ({ exitCode: 0, stdout: 'ok\n', stderr: '' }) })
  ok(st.limits.maxParallel === 1 && st.concurrency.maxParallel === 1 && jobs.config().maxParallel === 1,
    '§1 a FRESH kernel reads the default on BOTH faces (policy layer and queue): no constructor value can disagree with the declaration',
    { policy: st.limits.maxParallel, concurrency: st.concurrency.maxParallel, queue: jobs.config().maxParallel, declared })
  ok(st.concurrency.maxParallelSource === 'setting-live' && /readMaxParallel/.test(st.concurrency.reader),
    '§1 the status face NAMES its source and its reader (`setting-live`, `readMaxParallel()`), so an operator can tell a live read from a snapshot',
    { source: st.concurrency.maxParallelSource, reader: st.concurrency.reader })
  ok(readMaxParallel(undefined) === 1 && readMaxParallel({}) === declared,
    '§1 the helper itself is total: an absent settings view and an empty one both land on the declared default',
    { absent: readMaxParallel(undefined), empty: readMaxParallel({}) })
  // The clamp: a cap of 0/negative would wedge the queue forever, so <1 clamps to 1; a fraction floors.
  const clamped = [[0, 1], [-3, 1], ['x', 1], [2.9, 2], ['4', 4]]
  ok(clamped.length === 5 && clamped.every(([input, want]) => readMaxParallel({ [KEY]: input }) === want),
    '§1 the clamp holds for every edge the schema type does not catch (0/-3/NaN clamp to 1, 2.9 floors to 2, "4" parses to 4)',
    { clamped })
}

// ── §2 LIVE WRITE, NEXT READ, SAME INSTANCE ───────────────────────────────────────────────────────
// This is the field failure, reproduced at the smallest size: construct, read 1, write 2 through the live
// view (exactly what `vibe_v5_set {key:'vmu.math.maxParallel', value:2}` does), read again.
{
  const view = liveView({})
  const t = toolsOf(view.settings)
  const before = t.status()
  view.set(KEY, 2)
  const after = t.status()
  ok(before.limits.maxParallel === 1, '§2 before the write the same instance reports 1 (the baseline is real)', { before: before.limits.maxParallel })
  ok(after.limits.maxParallel === 2 && after.concurrency.maxParallel === 2 && after.keys[KEY] === 2,
    '§2 ★ the lived defect: after `set(2)` the VERY NEXT status read reports 2 — limits, the concurrency block and `keys` all agree, with no restart',
    { limits: after.limits.maxParallel, concurrency: after.concurrency.maxParallel, keys: after.keys[KEY] })
  ok(t.plan({ op: 'stats/mean' }).limits.maxParallel === 2,
    '§2 and the plan the member would actually submit is railed at 2 as well — the status face is not lying about a different number',
    { planLimits: t.plan({ op: 'stats/mean' }).limits.maxParallel })
  ok(after.concurrency.snapshotAtConstruction === 1 && after.concurrency.maxParallel === 2,
    '§2 the disclosure is HONEST: `snapshotAtConstruction` still says 1 (what `K` captured) while the effective value is 2 — the stale snapshot is visible but does not rail',
    { snapshot: after.concurrency.snapshotAtConstruction, effective: after.concurrency.maxParallel })
  ok(typeof after.concurrency.note === 'string' && /AT CALL TIME/.test(after.concurrency.note),
    '§2 the note states WHEN the value is read (at call time) and that the snapshot is disclosed, not enforced',
    { note: after.concurrency.note })
  view.set(KEY, 1)
  ok(t.status().limits.maxParallel === 1, '§2 and the write is symmetric: setting it back to 1 is visible on the next read too', { now: t.status().limits.maxParallel })
}

// ── §3 THE CAP REALLY APPLIES (deferred fake spawn, exact in-flight counts) ──────────────────────
{
  const pending = []
  const starts = []
  let inFlight = 0
  let maxInFlight = 0
  const spawn = (spec) => {
    starts.push(spec)
    inFlight += 1
    maxInFlight = Math.max(maxInFlight, inFlight)
    return new Promise((resolve) => pending.push(() => { inFlight -= 1; resolve({ exitCode: 0, stdout: 'ok\n', stderr: '' }) }))
  }
  const view = liveView({ 'vmu.math.engines': ['fake'], [KEY]: 1 })
  const jobs = createMathJobs({ clock: () => 1000, log: () => {}, spawn, settings: view.settings })
  const releaseAll = () => { const all = pending.splice(0); for (const r of all) r(); return all.length }

  const a = await jobs.submit({ engine: 'fake', argv: [], async: true })
  ok(a.ok === true && typeof a.jobId === 'string', '§3 harness: an async submit is accepted (the seam the rest of this section measures)', { a })
  await settle(() => starts.length === 1)
  const b = await jobs.submit({ engine: 'fake', argv: [], async: true })
  await settle(() => jobs.status({ jobId: b.jobId }).job.state === 'queued')
  ok(starts.length === 1 && jobs.status({ jobId: b.jobId }).job.state === 'queued',
    '§3 at cap 1 exactly ONE job is spawned and the second is PARKED as `queued` — the cap is enforced by the queue, not merely printed by status',
    { starts: starts.length, second: jobs.status({ jobId: b.jobId }).job.state })
  ok(releaseAll() === 1, '§3 exactly one release was outstanding for the one running job (the parked job was never spawned)', { released: 1 })
  await settle(() => starts.length === 2)
  ok(starts.length === 2 && jobs.status({ jobId: b.jobId }).job.state === 'running',
    '§3 releasing the first slot lets the parked job start — the wait is a queue, not a refusal',
    { starts: starts.length, second: jobs.status({ jobId: b.jobId }).job.state })
  ok(maxInFlight === 1, '§3 and it never overlapped at cap 1 (max in flight is exactly 1)', { maxInFlight })
  releaseAll()
  await settle(() => inFlight === 0)

  // THE OFFICE WRITES 2 — same instance, no restart. Both jobs must now be in flight at once.
  view.set(KEY, 2)
  const mark = starts.length
  const c = await jobs.submit({ engine: 'fake', argv: [], async: true })
  const d = await jobs.submit({ engine: 'fake', argv: [], async: true })
  await settle(() => starts.length === mark + 2)
  ok(jobs.config().maxParallel === 2 && starts.length === mark + 2,
    '§3 ★ after the live write to 2, TWO jobs are spawned without re-constructing the queue — the office\'s `vibe_v5_set {value:2}` really allows 2',
    { maxParallel: jobs.config().maxParallel, newStarts: starts.length - mark })
  ok(inFlight === 2 && maxInFlight === 2 &&
    jobs.status({ jobId: c.jobId }).job.state === 'running' && jobs.status({ jobId: d.jobId }).job.state === 'running',
    '§3 ★ and they OVERLAP: both are `running` with exactly 2 in flight at the same instant — the requirement\'s "actually allow 2 concurrent jobs", measured',
    { inFlight, maxInFlight, c: jobs.status({ jobId: c.jobId }).job.state, d: jobs.status({ jobId: d.jobId }).job.state })
  releaseAll()
  await settle(() => inFlight === 0)
  ok(maxInFlight === 2, '§3 the third job would have exceeded the cap: raising to 2 did not open a third slot (max in flight stayed exactly 2)', { maxInFlight })
}

// ── §4 ONE HELPER: THE TWO FACES AGREE, AND BOTH READ THE KEY ────────────────────────────────────
{
  const view = liveView({ 'vmu.math.engines': ['fake'] })
  const t = toolsOf(view.settings)
  const jobs = createMathJobs({ clock: () => 1000, log: () => {}, settings: view.settings, spawn: async () => ({ exitCode: 0, stdout: 'ok\n', stderr: '' }) })
  view.set(KEY, 3)
  view.reads.length = 0
  const st = t.status()
  const pl = t.plan({ op: 'stats/mean' })
  const cf = jobs.config()
  ok(st.limits.maxParallel === 3 && pl.limits.maxParallel === 3 && cf.maxParallel === 3,
    '§4 ★ THE TWO FACES AGREE: `mathtools.status()`, `mathtools.plan()` and `mathjobs.config()` all report 3 after one write — there is no second answer to disagree with',
    { status: st.limits.maxParallel, plan: pl.limits.maxParallel, queue: cf.maxParallel })
  const keyReads = view.reads.filter((k) => k === KEY).length
  ok(keyReads >= 2,
    '§4 and both faces were OBSERVED reading the one key in that turn (at least twice: status + queue config) — agreement by observation, not by a shared literal',
    { keyReads, all: view.reads.slice(0, 12) })
  ok(st.concurrency.reader === 'readMaxParallel() — the one function both faces call' && /readMaxParallel/.test(st.concurrency.reader),
    '§4 the status face declares WHICH function it read through, so a future second reader must change that sentence or fail this assertion',
    { reader: st.concurrency.reader })
  ok(Array.isArray(st.concurrency.enforcedBy) && st.concurrency.enforcedBy.length === 2 &&
    st.concurrency.enforcedBy.some((s) => /mathjobs\.js/.test(s)) && st.concurrency.enforcedBy.some((s) => /mathtools\.js/.test(s)),
    '§4 the declared enforcers are exactly the two real ones (the mathtools plan rail and the mathjobs slot gate)', { enforcedBy: st.concurrency.enforcedBy })

  // SOURCE-LEVEL: the queue really imports the one helper and no longer derives the value locally.
  const jobsSrc = readFileSync(new URL('../vibe-math-vmu/kernel/mathjobs.js', HERE), 'utf8')
  ok(/import \{ readMaxParallel \} from '\.\/mathtools\.js'/.test(jobsSrc),
    '§4 `kernel/mathjobs.js` imports `readMaxParallel` from the policy module (the single reader is the coupling, not a convention)',
    { found: /import \{ readMaxParallel \} from '\.\/mathtools\.js'/.test(jobsSrc) })
  ok(!/maxParallel: Math\.max\(1, n\('vmu\.math\.maxParallel'/.test(jobsSrc),
    '§4 and the OLD local derivation (`Math.max(1, n(\'vmu.math.maxParallel\', 1))`) is GONE — no second reader survives in the queue',
    { stale: /maxParallel: Math\.max\(1, n\('vmu\.math\.maxParallel'/.test(jobsSrc) })
  const toolsSrc = readFileSync(new URL('../vibe-math-vmu/kernel/mathtools.js', HERE), 'utf8')
  // COMMENTS NAME THE OLD FIELD ON PURPOSE (the defect is documented next to the fix), so the code check runs on
  // the comment-stripped source: a comment saying "`K.maxParallel` would be a cached cap again" is evidence FOR
  // the fix, while the same expression in executable code would be the defect back. Block comments first, then
  // line comments, so a `/* … */` spanning lines cannot leave a `//` fragment behind.
  const toolsCode = toolsSrc.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').map((l) => l.replace(/\/\/.*$/, '')).join('\n')
  ok(/export function readMaxParallel|export const readMaxParallel/.test(toolsSrc) && !/K\.maxParallel(?!AtConstruction)/.test(toolsCode),
    '§4 the policy module EXPORTS the reader and no longer rails on `K.maxParallel` in executable code (the construction snapshot survives only as `K.maxParallelAtConstruction`, disclosed and not enforced)',
    { exported: typeof readMaxParallel === 'function', codeStillRailsOnSnapshot: /K\.maxParallel(?!AtConstruction)/.test(toolsCode) })
  // The tool faces are thin pass-throughs: the number a member receives is the kernel's number.
  const toolMath = readFileSync(new URL('../vibe-math-vmu/tools/mathtools.js', HERE), 'utf8')
  const toolJobs = readFileSync(new URL('../vibe-math-vmu/tools/mathjobs.js', HERE), 'utf8')
  ok(/mathtools\.status\(\)/.test(toolMath) && /'config'/.test(toolJobs),
    '§4 the tool faces pass through (`vibe_v5_math status` → `mathtools.status()`, `vibe_v5_mathjobs config` → `jobs.config()`), so the agreement reaches the member, not just the kernel',
    { statusPassThrough: /mathtools\.status\(\)/.test(toolMath), configMethod: /'config'/.test(toolJobs) })
}

console.log('\n=== VMU G2 MATH CONCURRENCY: ' + passed + ' passed, ' + failed + ' failed ===')
if (failed > 0) {
  console.log(failed + ' failure(s):')
  for (const f of failures) console.log('  - ' + f)
  process.exitCode = 1
}

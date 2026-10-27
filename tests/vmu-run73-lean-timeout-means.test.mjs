#!/usr/bin/env node
// vmu F-69 — A COMPILE THAT RAN AND WAS CUT SHORT IS NOT "NO COMPILE RAN".
//
// WHERE THIS COMES FROM (code read after live run 72; the same shape was already visible in run 62's fix):
// ROUND 62/63 gave a job with no before/after comparison three machine-readable fields
// (`hashUnchanged: null`, `hashUnchangedState`, `hashUnchangedReason`) plus one sentence. The sentence has two
// branches: "not measured yet" for a job in flight, and — for every other cause — "not measured: no compile ran
// for this job (<code>)". The second branch is FALSE for the two terminal states where a compile DID run:
//   · `state:'timeout'`      — the compile ran and was killed (or survived) at its budget; receipt code `VMU_LEAN_TIMEOUT`
//   · `state:'interrupted'`  — the job was cancelled mid-flight; receipt code `VMU_JOB_CANCELLED`
// A reader that trusts the prose concludes "Lean never ran", which is a different fact from "Lean ran and did not
// finish in time". The reason field is right; only the sentence lies. Fix: branch the sentence on the job state, and
// make the two cut-short causes name themselves in the sentence the way the refusal codes already do.
import { dirname, join } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..')
const TOOLS = join(REPO, 'vibe-math-vmu', 'packs', 'v5r', 'tools.js')
const LEAN = join(REPO, 'vibe-math-vmu', 'kernel', 'lean.js')

const tools = await import(pathToFileURL(TOOLS).href)
const leanMod = await import(pathToFileURL(LEAN).href)

let passed = 0
const failures = []
const ok = (cond, label, detail) => {
  if (cond) { passed++; console.log('  ok   ' + label); return true }
  failures.push(label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  console.error('  FAIL ' + label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  return false
}
const has = (s, sub) => typeof s === 'string' && s.includes(sub)
const specOf = (name) => {
  const spec = tools.V5R_PACK_TOOLS.find((t) => t.name === name)
  if (!spec) throw new Error(name + ' must exist in V5R_PACK_TOOLS')
  return spec
}

const dir = await mkdtemp(join(tmpdir(), 'vmu-f69-timeout-'))
const mkSettings = (over = {}) => {
  const vals = Object.assign({
    'vmu.math.formalVerify': 'encourage',
    'vmu.math.leanCommand': 'lean',
    'vmu.math.leanArgs': [],
    'vmu.math.leanTimeoutMs': 120,
    'vmu.math.leanAsync': false,
    'vmu.math.leanInitiative': 'normal',
    'vmu.math.leanSearchPaths': [],
    'vmu.math.leanJobsMaxParallel': 1,
  }, over)
  return { get: (k) => vals[k], vals }
}
const mkKernel = async (rootName, opts = {}) => {
  const root = join(dir, rootName)
  await mkdir(join(root, 'Formal'), { recursive: true })
  await writeFile(join(root, 'Formal', 'Slow.lean'), 'theorem slow : True := trivial\n', 'utf8')
  const face = leanMod.createLeanFace(Object.assign({
    settings: mkSettings(), spawn: async () => ({ exitCode: 0 }), root, clock: () => 11, log: () => {},
  }, opts))
  return { kernel: { lean: face }, face, root }
}
const viewOf = async (face, id) => {
  const out = await face.status(id)
  return out && out.job ? out.job : out
}
const waitSettled = async (face, id, ms = 4000) => {
  const t0 = Date.now()
  for (;;) {
    const v = await viewOf(face, id)
    if (v && (v.state === 'settled' || v.state === 'failed' || v.state === 'timeout' || v.state === 'interrupted')) return v
    if (Date.now() - t0 > ms) return v
    await new Promise((r) => setTimeout(r, 25))
  }
}

// ── 1: the timeout branch — a compile that ran and was cut short must not claim "no compile ran" ─────
await (async () => {
  const { kernel, face } = await mkKernel('k1', { spawn: () => new Promise(() => {}) })
  const res = await specOf('vibe_v5_lean_run').handler({ file: 'Formal/Slow.lean', statement: 'True' }, { kernel })
  const view = await waitSettled(face, res.id)
  ok(view.state === 'timeout', 'setup: the hanging compile settles as timeout', view.state)
  ok('hashUnchanged' in view && view.hashUnchanged === null,
    'F-69a: the boolean is an explicit null on a timeout job (not a value, not a hole)', view.hashUnchanged)
  ok(view.hashUnchangedState === 'not-measured' && view.hashUnchangedReason === 'VMU_LEAN_TIMEOUT',
    'F-69b: state/reason still say not-measured plus the refusal code',
    view.hashUnchangedState + '/' + view.hashUnchangedReason)
  ok(!has(view.hashUnchangedMeans, 'no compile ran'),
    'F-69c: the sentence must NOT claim no compile ran — a compile ran and was cut short',
    view.hashUnchangedMeans)
  ok(has(view.hashUnchangedMeans, 'VMU_LEAN_TIMEOUT') || has(view.hashUnchangedMeans, 'budget'),
    'F-69d: the sentence names the budget/refusal that cut it', view.hashUnchangedMeans)
  ok(has(view.hashUnchangedMeans, 'NOT the value "unchanged"'),
    'F-69e: and keeps the "not unchanged" denial the failed-before-compiling branch already had',
    view.hashUnchangedMeans)
})()

// ── 2: the interrupted branch — a cancelled job is also not "no compile ran" ─────────────────────────
await (async () => {
  let hang = null
  const { kernel, face } = await mkKernel('k2', {
    settings: mkSettings({ 'vmu.math.leanAsync': true, 'vmu.math.leanTimeoutMs': 5000 }),
    spawn: () => new Promise((res) => { hang = res }),
  })
  const res = await specOf('vibe_v5_lean_run').handler({ file: 'Formal/Slow.lean', statement: 'True' }, { kernel })
  await new Promise((r) => setTimeout(r, 60))
  await face.cancel({ jobId: res.id })
  const view = await waitSettled(face, res.id)
  if (view.state !== 'interrupted') {
    console.log('  skip  the cancel path did not produce interrupted in this environment (state=' + view.state + ')')
  } else {
    ok(!has(view.hashUnchangedMeans, 'no compile ran'),
      'F-69f: a cancelled job does not claim no compile ran either', view.hashUnchangedMeans)
    ok(has(view.hashUnchangedMeans, 'cancel') || has(view.hashUnchangedMeans, 'VMU_JOB_CANCELLED'),
      'F-69g: the sentence names the cancellation', view.hashUnchangedMeans)
  }
  if (hang) hang({ exitCode: 0 })
})()

// ── 3: the two other branches keep their behaviour (regression on the same sentence) ─────────────────
await (async () => {
  const { kernel, face } = await mkKernel('k3')
  const res = await specOf('vibe_v5_lean_run').handler({ file: 'Formal/missing.lean', statement: 'True' }, { kernel })
  const view = await waitSettled(face, res.id)
  ok(view.state === 'failed' && view.hashUnchangedReason === 'VMU_LEAN_FILE_UNREADABLE',
    'F-69h (regression): a job that never compiled keeps its refusal code as the reason',
    view.state + '/' + view.hashUnchangedReason)
  ok(has(view.hashUnchangedMeans, 'no compile ran'),
    'F-69i (regression): and keeps the "no compile ran" sentence, which is TRUE for that branch',
    view.hashUnchangedMeans)
})()

await (async () => {
  const { kernel, face } = await mkKernel('k4', {
    settings: mkSettings({ 'vmu.math.leanAsync': true, 'vmu.math.leanTimeoutMs': 5000 }),
    spawn: () => new Promise(() => {}),
  })
  const res = await specOf('vibe_v5_lean_run').handler({ file: 'Formal/Slow.lean', statement: 'True' }, { kernel })
  const view = await viewOf(face, res.id)
  ok(view.state === 'running' || view.state === 'queued', 'setup: the async job is in flight', view.state)
  ok(view.hashUnchangedState === 'pending' && view.hashUnchangedReason === 'job-not-finished',
    'F-69j (regression): an in-flight job keeps pending/job-not-finished', view.hashUnchangedState + '/' + view.hashUnchangedReason)
  ok(has(view.hashUnchangedMeans, 'not measured yet'),
    'F-69k (regression): and keeps the "not measured yet" sentence', view.hashUnchangedMeans)
})()

console.log('\n=== VMU F-69 LEAN TIMEOUT MEANS: ' + passed + ' passed, ' + failures.length + ' failed ===')
if (failures.length) { for (const f of failures) console.error(' - ' + f); process.exit(1) }

#!/usr/bin/env node
// vmu RUN 63 / F-55 — THE ABSENCE WAS EXPLAINED IN PROSE, AND STILL MISSING FROM THE FIELD.
//
// THE OBSERVED GAP (live run 63, the root session's own report - `D:/_tmp/r63/final*.txt`): the ROUND 62 fix made a
// failed Lean job answer `hashUnchangedMeans` with a sentence, and left `hashUnchanged` itself ABSENT from the job
// object. The root kernel read the receipt field-by-field and wrote down why that is still not enough: three
// deterministic questions got three unstable answers —
//   · `job.hashUnchanged === false` → `undefined` (false, but for the wrong reason: no key at all),
//   · `job.hashUnchanged == null`    → `true` (accidentally right, undocumented),
//   · `'hashUnchanged' in job`       → `false` (so a reader cannot tell "not measured" from "the face forgot this key").
//
// THE FIX THIS SUITE PINS: the boolean becomes an explicit `null` when it was never measured, and the two causes of
// "no value" get machine-readable fields of their own — `hashUnchangedState` (`measured` | `pending` | `not-measured`)
// and `hashUnchangedReason` (the job state, the refusal code, or `no-compile`). The prose stays: a human reads the
// sentence, a program reads the fields, and neither has to parse the other.
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

const dir = await mkdtemp(join(tmpdir(), 'vmu-r63-hashfld-'))
const mkSettings = (over = {}) => {
  const vals = Object.assign({
    'vmu.math.formalVerify': 'encourage',
    'vmu.math.leanCommand': 'lean',
    'vmu.math.leanArgs': [],
    'vmu.math.leanTimeoutMs': 5000,
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
  const face = leanMod.createLeanFace(Object.assign({
    settings: mkSettings(), spawn: async () => ({ exitCode: 0 }), root, clock: () => 11, log: () => {},
  }, opts))
  return { kernel: { lean: face }, face, root }
}
const viewOf = async (face, id) => {
  const out = await face.status(id)
  return out && out.job ? out.job : out
}

// ── 1: a failed-before-compiling job carries an explicit null plus its two causes ─────────────────────
await (async () => {
  const { kernel, face } = await mkKernel('k1')
  const res = await specOf('vibe_v5_lean_run').handler({ file: 'Formal/missing.lean', statement: 'True' }, { kernel })
  const view = await viewOf(face, res.job.id)
  ok(view.state === 'failed' && view.code === 'VMU_LEAN_FILE_UNREADABLE',
    'setup: the unreadable file produces a named failure', view.state + '/' + view.code)
  ok('hashUnchanged' in view && view.hashUnchanged === null,
    'F-55a: the key EXISTS and is an explicit null (a machine reader never lands on `undefined`)',
    view.hashUnchanged)
  ok(view.hashUnchangedState === 'not-measured' && view.hashUnchangedReason === 'VMU_LEAN_FILE_UNREADABLE',
    'F-55b: the two causes are machine-readable (state=not-measured, reason=the refusal code)',
    view.hashUnchangedState + '/' + view.hashUnchangedReason)
  ok(view.hashUnchanged !== false && view.hashUnchanged !== true,
    'F-55c: and it still does not invent a boolean (null is not a substitute for `false`)', view.hashUnchanged)
  ok(has(view.hashUnchangedMeans, 'not measured') && has(view.hashUnchangedMeans, 'NOT the value "unchanged"'),
    'F-55d (regression): the human-facing sentence survives the field-level fix', view.hashUnchangedMeans)
}) ()

// ── 2: a measured job answers the same three questions the same way ─────────────────────────────────
await (async () => {
  const { kernel, face, root } = await mkKernel('k2')
  await writeFile(join(root, 'Formal', 'Ok.lean'), 'theorem ok : True := trivial\n', 'utf8')
  const res = await specOf('vibe_v5_lean_run').handler({ file: 'Formal/Ok.lean', statement: 'True' }, { kernel })
  const view = await viewOf(face, res.job.id)
  ok(view.hashUnchanged === true && view.hashUnchangedState === 'measured' && view.hashUnchangedReason === null,
    'F-55e: a measured job has the boolean, state=measured and no reason',
    [view.hashUnchanged, view.hashUnchangedState, view.hashUnchangedReason])
  ok(has(view.hashUnchangedMeans, 'same before and after'),
    'F-55f (regression): and keeps the round-59 meaning', view.hashUnchangedMeans)
}) ()

// ── 3: a job still in flight is "pending", not "not-measured" and not null-with-no-reason ───────────
await (async () => {
  let hang = null
  const { kernel, face } = await mkKernel('k3', {
    settings: mkSettings({ 'vmu.math.leanAsync': true, 'vmu.math.leanTimeoutMs': 400 }),
    spawn: () => new Promise((res) => { hang = res }),
  })
  const res = await specOf('vibe_v5_lean_run').handler({ file: 'Formal/running.lean', statement: 'True' }, { kernel })
  const view = await viewOf(face, res.job.id)
  ok(view.state === 'queued' || view.state === 'running', 'setup: the async job is still in flight', view.state)
  ok(view.hashUnchanged === null && view.hashUnchangedState === 'pending' && view.hashUnchangedReason === 'job-not-finished',
    'F-55g: an unfinished job says PENDING — that is a different cause from "no compile ran"',
    [view.hashUnchanged, view.hashUnchangedState, view.hashUnchangedReason])
  if (hang) hang({ exitCode: 0 })
}) ()

// ── 4: the list face answers the same three questions for every row ─────────────────────────────────
await (async () => {
  const { kernel } = await mkKernel('k4')
  await specOf('vibe_v5_lean_run').handler({ file: 'Formal/one.lean', statement: 'True' }, { kernel })
  await specOf('vibe_v5_lean_run').handler({ file: 'Formal/two.lean', statement: 'True' }, { kernel })
  const list = await specOf('vibe_v5_lean_job').handler({}, { kernel })
  const rows = (list.jobs && list.jobs.jobs) || []
  ok(rows.length === 2, 'setup: two jobs are listed', rows.length)
  const mute = rows.filter((r) => !('hashUnchanged' in r) || typeof r.hashUnchangedState !== 'string' || !('hashUnchangedReason' in r))
  ok(mute.length === 0,
    'F-55h: EVERY row carries the field triple (the list face cannot be quieter than the single-job face)',
    mute.map((r) => r.id))
}) ()

// ── 5: a reader that asks the three questions gets three determinate answers on both shapes ─────────
await (async () => {
  const { kernel, face } = await mkKernel('k5')
  const failed = await specOf('vibe_v5_lean_run').handler({ file: 'Formal/nope.lean', statement: 'True' }, { kernel })
  const fv = await viewOf(face, failed.job.id)
  const measuredKernel = await mkKernel('k5b')
  await writeFile(join(measuredKernel.root, 'Formal', 'Ok.lean'), 'theorem ok : True := trivial\n', 'utf8')
  const good = await specOf('vibe_v5_lean_run').handler({ file: 'Formal/Ok.lean', statement: 'True' }, { kernel: measuredKernel.kernel })
  const gv = await viewOf(measuredKernel.face, good.job.id)
  for (const [tag, v] of [['failed', fv], ['measured', gv]]) {
    ok(v.hashUnchanged === false || v.hashUnchanged === true || v.hashUnchanged === null,
      'F-55i: `===` comparison is determinate (' + tag + ')', v.hashUnchanged)
    ok((v.hashUnchanged === null) === (v.hashUnchangedState !== 'measured'),
      'F-55j: null and the state field never disagree (' + tag + ')', [v.hashUnchanged, v.hashUnchangedState])
    ok('hashUnchanged' in v && 'hashUnchangedState' in v && 'hashUnchangedReason' in v,
      'F-55k: `in` is true for all three keys (' + tag + ')', Object.keys(v).filter((k) => k.startsWith('hashUn')))
  }
}) ()

if (failures.length) {
  console.error('\nFAILED ' + failures.length + ' / ' + (passed + failures.length))
  process.exit(1)
}
console.log('\nOK ' + passed + ' checks')
process.exit(0)

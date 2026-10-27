#!/usr/bin/env node
// vmu RUN 64 / F-56 — ONE ENVELOPE, NOT TWO: EVERY LEAN TOOL ANSWERS AT THE SAME DEPTH.
//
// THE OBSERVED GAP (live run 64, the root session's own report - `D:/_tmp/r64/*`): the pack tools wrapped the Lean
// face's answer in a SECOND envelope, and the nesting depth was not even uniform —
//   · `vibe_v5_lean_job {jobId}`  → `receipt.job` = `{ok:true, job:{…}}`  ⇒ the record (and the F-55 field triple)
//                                    only reachable at `receipt.job.job.*`;
//   · `vibe_v5_lean_run`          → `receipt.job` = `{ok:true, id, state}` ⇒ `receipt.job.id` happened to work;
//   · `vibe_v5_lean_job {}`       → `receipt.jobs` = `{ok:true, count, jobs:[…]}` ⇒ rows only at `receipt.jobs.jobs`.
// The root session wrote down the honest consequence: "the four fields live at job.job" — i.e. exactly the bug class
// ROUND 63 closed (a determinate field that a reader cannot find) reintroduced by the pack's own wrapper.
//
// THE FIX THIS SUITE PINS: a lean tool's receipt IS the face's answer plus `tool`. Same depth for run / status / list /
// archive / lib / read; no tool nests another tool's envelope under a key that a sibling tool uses for the record itself.
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
const specOf = (name) => {
  const spec = tools.V5R_PACK_TOOLS.find((t) => t.name === name)
  if (!spec) throw new Error(name + ' must exist in V5R_PACK_TOOLS')
  return spec
}

const dir = await mkdtemp(join(tmpdir(), 'vmu-r64-receiptshape-'))
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
const mkKernel = async (rootName) => {
  const root = join(dir, rootName)
  await mkdir(join(root, 'Formal'), { recursive: true })
  const face = leanMod.createLeanFace({
    settings: mkSettings(), spawn: async () => ({ exitCode: 0 }), root, clock: () => 11, log: () => {},
  })
  return { kernel: { lean: face }, face, root }
}

// ── 1: lean_run answers at the TOP level (it used to answer at `receipt.job.id`) ────────────────────
await (async () => {
  const { kernel, root } = await mkKernel('k1')
  await writeFile(join(root, 'Formal', 'a.lean'), 'theorem a : True := trivial\n', 'utf8')
  const run = await specOf('vibe_v5_lean_run').handler({ file: 'Formal/a.lean', statement: 'True' }, { kernel })
  ok(run.ok === true && typeof run.id === 'string', 'F-56a: lean_run returns the job id at the top level', run.id)
  ok(run.job === undefined, 'F-56b: …and does NOT nest a second envelope under `job`', run.job && Object.keys(run.job))
  ok(run.tool === 'vibe_v5_lean_run', 'F-56c: the receipt still says which tool answered', run.tool)
}) ()

// ── 2: lean_job {jobId} puts the RECORD at `job` — and the record has no `job` of its own ──────────
await (async () => {
  const { kernel } = await mkKernel('k2')
  const run = await specOf('vibe_v5_lean_run').handler({ file: 'Formal/missing.lean', statement: 'True' }, { kernel })
  const st = await specOf('vibe_v5_lean_job').handler({ jobId: run.id }, { kernel })
  ok(st.ok === true && st.job && typeof st.job === 'object', 'F-56d: lean_job returns a record under `job`', st.job && Object.keys(st.job))
  ok(st.job.job === undefined, 'F-56e: the record is the JOB, not another envelope (no `job.job`)', st.job && st.job.job)
  ok('hashUnchanged' in st.job && st.job.hashUnchangedState === 'not-measured',
    'F-56f: the F-55 field triple is reachable at `receipt.job.*` (the depth the reader was told to look at)',
    Object.keys(st.job).filter((k) => k.startsWith('hashUn')))
}) ()

// ── 3: lean_job with no arguments lists ROWS at `jobs` (not `jobs.jobs`) ───────────────────────────
await (async () => {
  const { kernel } = await mkKernel('k3')
  await specOf('vibe_v5_lean_run').handler({ file: 'Formal/m1.lean', statement: 'True' }, { kernel })
  await specOf('vibe_v5_lean_run').handler({ file: 'Formal/m2.lean', statement: 'True' }, { kernel })
  const list = await specOf('vibe_v5_lean_job').handler({}, { kernel })
  ok(Array.isArray(list.jobs), 'F-56g: the list face answers `jobs` as an ARRAY of rows', list.jobs && typeof list.jobs)
  ok(Array.isArray(list.jobs) && list.jobs.length === 2, 'F-56h: …with one row per job', Array.isArray(list.jobs) ? list.jobs.length : null)
  const rows = Array.isArray(list.jobs) ? list.jobs : []
  ok(rows.every((r) => 'hashUnchanged' in r && 'hashUnchangedState' in r && 'hashUnchangedReason' in r),
    'F-56i: every row is a job record with the field triple (not an envelope containing them)',
    rows.map((r) => Object.keys(r).slice(0, 6)))
}) ()

// ── 4: archive / lib / read answer at the top level as well ─────────────────────────────────────────
await (async () => {
  const { kernel, root } = await mkKernel('k4')
  await writeFile(join(root, 'Formal', 'Odd.lean'), 'theorem odd : True := trivial\n', 'utf8')
  const arch = await specOf('vibe_v5_lean_archive').handler(
    { kind: 'lemma', name: 'oddTrue', file: 'Formal/Odd.lean', statement: 'True' }, { kernel })
  ok(arch.ok === true && arch.statement === 'True', 'F-56j: lean_archive returns the entry at the top level (no `archived` wrapper)', arch.statement)
  ok(arch.archived === undefined, 'F-56k: …and does not nest it under `archived`', arch.archived && Object.keys(arch.archived))
  ok(typeof arch.persisted === 'boolean', 'F-56l: the durability flag is at `receipt.persisted`', arch.persisted)
  const lib = await specOf('vibe_v5_lean_lib').handler({ refresh: true }, { kernel })
  ok(Array.isArray(lib.entries), 'F-56m: lean_lib returns `entries` as an ARRAY (no `lib` wrapper)', lib.entries && typeof lib.entries)
  ok(lib.entries.some((e) => e.name === 'oddTrue' && e.statement === 'True'), 'F-56n: …and the archived proposition is in it')
  const got = await specOf('vibe_v5_lean_read').handler({ name: 'oddTrue' }, { kernel })
  ok(got.ok === true && typeof got.content === 'string' && got.card === undefined,
    'F-56o: lean_read returns the entry at the top level (no `card` wrapper)', Object.keys(got).filter((k) => k === 'card' || k === 'content'))
}) ()

// ── 5: a refusal keeps its named code at the top level for every lean tool ─────────────────────────
await (async () => {
  const { kernel } = await mkKernel('k5')
  const missing = await specOf('vibe_v5_lean_job').handler({ jobId: 'lean-999' }, { kernel })
  ok(missing.ok === false && missing.code === 'VMU_LEAN_NOT_FOUND',
    'F-56p: an unknown job is refused by name at the top level (the spread must not hide a refusal)', JSON.stringify(missing).slice(0, 160))
  ok(missing.job === undefined, 'F-56q: …and even the refusal does not carry an empty `job` envelope', missing.job)
}) ()

if (failures.length) {
  console.error('\n=== VMU RUN 64 LEAN RECEIPT SHAPE: ' + passed + ' passed, ' + failures.length + ' failed ===')
  for (const f of failures) console.error('  · ' + f)
  process.exit(1)
}
console.log('\n=== VMU RUN 64 LEAN RECEIPT SHAPE: ' + passed + ' passed, 0 failed ===')

#!/usr/bin/env node
// vmu RUN 62 / F-53 + F-54 — AN ABSENCE WITH TWO CAUSES, AND A DURABLE LINE THAT STILL TAUGHT THE OLD SHAPE.
//
// THE OBSERVED GAP (live run 62, the root session's own receipts - `D:/_tmp/r62/dig62.txt`):
//   · F-53 — `vibe_v5_lean_job {jobId:"lean-2"}` returned a job whose file could not be read: `state:"failed"`,
//     `code:"VMU_LEAN_FILE_UNREADABLE"`, and `hashUnchangedMeans: null` while `hashUnchanged` was simply ABSENT. A
//     reader cannot tell two different facts apart: "no comparison exists because no compile ran" and "the face forgot
//     to explain this field". Absence has causes, and they are not the value `false` or `true`.
//   · F-54 — round 61 renamed the INPUT parameter to `recommendation`, but the DURABLE feedback card still stored the
//     advice as `action：把反馈面的 op 与正文 action 分开…`. The card is what later readers learn the shape from, so the
//     one-key-two-meanings lesson survived on disk after the tool description stopped teaching it.
//
// WHAT THIS SUITE PROVES:
//   1. a job that failed before any compile has a `hashUnchangedMeans` SENTENCE that names the code and denies "unchanged";
//   2. such a job does not carry a boolean `hashUnchanged` at all (absence stays absence — no invented `false`);
//   3. a passed job still carries the round-59 meaning (regression: the fix did not flatten the true branch);
//   4. a job still running says "not measured yet" instead of `null`;
//   5. EVERY job in `list()` with a non-boolean hash answers with a sentence (no job leaves the reader guessing);
//   6. a new feedback card labels the advice `recommendation：`, and no line says `action：`;
//   7. the legacy INPUT key `action` (a real recommendation, not an op word) still works and lands under the new label;
//   8. the card read back through `read_library` shows the same label (the durable face, not just the receipt).
import { dirname, join } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..')
const TOOLS = join(REPO, 'vibe-math-vmu', 'packs', 'v5r', 'tools.js')
const LEAN = join(REPO, 'vibe-math-vmu', 'kernel', 'lean.js')
const ENTRY = join(REPO, 'vibe-math-vmu', 'vibe-math-vmu.js')

const tools = await import(pathToFileURL(TOOLS).href)
const leanMod = await import(pathToFileURL(LEAN).href)
const entry = await import(pathToFileURL(ENTRY).href)

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

const dir = await mkdtemp(join(tmpdir(), 'vmu-r62-hash-'))
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

// ── 1/2: a job that failed BEFORE any compile explains the absence ─────────────────────────────────────
await (async () => {
  const { kernel, face } = await mkKernel('k1')
  const res = await specOf('vibe_v5_lean_run').handler({ file: 'Formal/missing.lean', statement: 'True' }, { kernel })
  const view = await viewOf(face, res.job.id)
  ok(view.state === 'failed', 'setup: the unreadable file produces a FAILED job', view.state)
  ok(view.code === 'VMU_LEAN_FILE_UNREADABLE', 'setup: the failure is named', view.code)
  ok(view.hashUnchanged !== true && view.hashUnchanged !== false,
    'F-53a: a compile that never ran does not pretend the file was unchanged (no boolean is minted)',
    view.hashUnchanged)
  ok(typeof view.hashUnchangedMeans === 'string' && has(view.hashUnchangedMeans, 'not measured'),
    'F-53b: the meaning is a SENTENCE, not null (absence has a cause)', view.hashUnchangedMeans)
  ok(has(view.hashUnchangedMeans, 'VMU_LEAN_FILE_UNREADABLE'),
    'F-53c: and the sentence names the code that explains it', view.hashUnchangedMeans)
  ok(has(view.hashUnchangedMeans, 'NOT the value "unchanged"'),
    'F-53d: and denies the reading a bare absence invites ("unchanged")', view.hashUnchangedMeans)
})()

// ── 3: the round-59 meaning survives for a real compile ────────────────────────────────────────────────
await (async () => {
  const { kernel, face, root } = await mkKernel('k2')
  await writeFile(join(root, 'Formal', 'Ok.lean'), 'theorem ok : True := trivial\n', 'utf8')
  const res = await specOf('vibe_v5_lean_run').handler({ file: 'Formal/Ok.lean', statement: 'True' }, { kernel })
  const view = await viewOf(face, res.job.id)
  ok(view.hashUnchanged === true, 'setup: a real compile records the boolean', view.hashUnchanged)
  ok(has(view.hashUnchangedMeans, 'same before and after') && has(view.hashUnchangedMeans, 'NOT a cache flag'),
    'F-53e (regression): a measured job still explains what the boolean is NOT', view.hashUnchangedMeans)
})()

// ── 4: a job still running says "yet" ─────────────────────────────────────────────────────────────────
await (async () => {
  let hang = null
  const { kernel, face } = await mkKernel('k3', {
    settings: mkSettings({ 'vmu.math.leanAsync': true, 'vmu.math.leanTimeoutMs': 400 }),
    spawn: () => new Promise((res) => { hang = res }),
  })
  const res = await specOf('vibe_v5_lean_run').handler({ file: 'Formal/running.lean', statement: 'True' }, { kernel })
  const view = await viewOf(face, res.job.id)
  const inFlight = view.state === 'queued' || view.state === 'running'
  ok(inFlight, 'setup: the async job is still in flight when it is read', view.state)
  ok(has(view.hashUnchangedMeans, 'not measured yet'),
    'F-53f: an unfinished job says the comparison does not exist YET (a third sentence, not null)', view.hashUnchangedMeans)
  if (hang) hang({ exitCode: 0 })
})()

// ── 5: no job in the list leaves this field to guesswork ──────────────────────────────────────────────
await (async () => {
  const { kernel } = await mkKernel('k4')
  await specOf('vibe_v5_lean_run').handler({ file: 'Formal/one.lean', statement: 'True' }, { kernel })
  await specOf('vibe_v5_lean_run').handler({ file: 'Formal/two.lean', statement: 'True' }, { kernel })
  const list = await specOf('vibe_v5_lean_job').handler({}, { kernel })
  const rows = (list.jobs && list.jobs.jobs) || []
  ok(rows.length === 2, 'setup: two jobs are listed', rows.length)
  const mute = rows.filter((r) => (r.hashUnchanged !== true && r.hashUnchanged !== false) && typeof r.hashUnchangedMeans !== 'string')
  ok(mute.length === 0,
    'F-53g: EVERY unmeasured job carries a sentence (the list face cannot be quieter than the single-job face)',
    mute.map((r) => r.id))
})()

// ── 6/7/8: the durable feedback card teaches the new label ────────────────────────────────────────────
let NOW = 1000
const boot = async (config = {}) => {
  const state = { specs: [] }
  const ctx = { effect(fn) { return fn() }, on() { return () => {} }, tools: { register: async (spec) => { state.specs.push(spec); return () => {} } } }
  const handle = entry.apply(ctx, Object.assign({ clock: () => NOW }, config))
  await handle.ready()
  return { handle, specOf: (n) => state.specs.find((s) => s.name === n) }
}
const callJSON = async (b, name, args = {}, ctx = {}) => {
  const spec = b.specOf(name)
  if (!spec) return { missing: true }
  try {
    const raw = await spec.execute(args, ctx)
    try { return { parsed: JSON.parse(raw) } } catch { return { raw } }
  } catch (e) { return { thrown: true, code: e && e.code, message: e && e.message, hint: e && e.hint } }
}

const recRoot = await mkdtemp(join('D:/_tmp', 'vmu-r62-feedback-'))
try {
  const b = await boot({ root: recRoot, packs: ['v5r'] })
  const k = b.handle.kernel
  const FIVE = { member: 'r-a', category: '流程', route: 'team', phenomenon: '现象原文', impact: '影响原文' }

  const made = await callJSON(b, 'vibe_v5_feedback',
    Object.assign({ op: 'add', recommendation: '把回执里的时点与正文标签分开' }, FIVE), { kernel: k })
  const recId = made.parsed && made.parsed.recordId
  ok(!!recId, 'setup: op:add with a recommendation writes a card', made)
  const read = recId ? await callJSON(b, 'vibe_v5_read_library', { id: recId }, { kernel: k }) : null
  const card = (read && read.parsed && read.parsed.card) || {}
  const body = String(card.body || '')
  ok(has(body, 'recommendation：把回执里的时点与正文标签分开'),
    'F-54a: the durable card labels the advice `recommendation：`', body)
  ok(!has(body, 'action：'),
    'F-54b: and no line of the card still teaches the old `action：` label (the card is what later readers learn from)', body)

  const legacy = await callJSON(b, 'vibe_v5_feedback',
    Object.assign({ op: 'add', action: '给出一次跨内核读回的真机证据' }, FIVE), { kernel: k })
  const legacyId = legacy.parsed && legacy.parsed.recordId
  ok(!!legacyId, 'F-54c: the legacy INPUT key `action` still stores a real recommendation', legacy)
  const readLegacy = legacyId ? await callJSON(b, 'vibe_v5_read_library', { id: legacyId }, { kernel: k }) : null
  const legacyBody = String(((readLegacy && readLegacy.parsed && readLegacy.parsed.card) || {}).body || '')
  ok(has(legacyBody, 'recommendation：给出一次跨内核读回的真机证据'),
    'F-54d: …and it lands under the SAME label (one storage shape for both input names)', legacyBody)
} finally {
  await rm(recRoot, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 })
}
await rm(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 })

console.log('=== VMU RUN62 HASH MEANS + LABEL: ' + passed + ' passed, ' + failures.length + ' failed ===')
if (failures.length > 0) console.log('FAILURES: ' + failures.join(' | '))
process.exit(failures.length ? 1 : 0)

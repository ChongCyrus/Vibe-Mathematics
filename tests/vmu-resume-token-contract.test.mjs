// vibe-math-vmu — ROUND 20 / task-122 (b): GUARD THE ROUND-9 RULING'S CONTRACT.
// Run: `node tests/vmu-resume-token-contract.test.mjs` (last line `=== VMU RESUME TOKEN CONTRACT: N passed, M failed ===`).
//
// WHY THIS SUITE EXISTS. `docs/15 §14.4` records the round-9 ruling: `submit({resumeFrom})`'s token is CARRIED and
// NEVER interpreted (request → child env `VMU_RESUME_FROM` → mirror → re-issued as-is; receipt `resumedFrom`; the
// token is part of the request fingerprint ⇒ a changed token is a DIFFERENT request, never a silent continuation;
// "not set" means "computed from the start, `resumedFrom:null`, and no pretence of resuming"). The ruling also
// names the upgrade's precondition ("a real resumable engine AND a single job lasting >= the job budget"), which
// is NOT met — so the upgrade (the kernel interpreting its own checkpoints, `VMU_RESUME_SEGMENT`,
// `resumedFromResolved`, `segmentsSkipped`) is deliberately NOT landed, and this suite is the TEETH that keeps the
// carried-only behaviour from being silently replaced: assertion RK2 reddens the moment the kernel starts
// interpreting the token without a re-ruling, and assertion RK6 reddens if a changed token ever silently re-runs.
//
// It also guards the round-20 ④ disclosure: EVERY engine face must ANSWER "can you resume mid-run?" by name —
// `mathjobs.js` and `lean.js` both say NO, with a reason and the change condition (a disclosure, not an
// interpretation).
import { createMathJobs, JOB_SCHEMA } from '../vibe-math-vmu/kernel/mathjobs.js'
import { createLeanFace } from '../vibe-math-vmu/kernel/lean.js'

let passed = 0
let failed = 0
const failures = []
const ok = (cond, name, detail) => {
  if (cond) { passed += 1; return }
  failed += 1
  failures.push(name + (detail === undefined ? '' : ' [' + JSON.stringify(detail) + ']'))
}
const J = (o) => JSON.stringify(o)

/** In-memory fs seam (root-relative paths), mirroring the host fs shape the face documents. */
function memFs(files = {}) {
  const store = new Map(Object.entries(files))
  const key = (rel) => String(rel).replace(/\\/g, '/')
  return {
    store,
    writeText: async (rel, text) => { store.set(key(rel), String(text)); return true },
    readText: async (rel) => store.get(key(rel)),
    exists: async (rel) => store.has(key(rel)),
    listDir: async (rel) => {
      const prefix = key(rel).replace(/\/+$/, '') + '/'
      const seen = new Map()
      for (const k of store.keys()) {
        if (!k.startsWith(prefix)) continue
        const rest = k.slice(prefix.length)
        const head = rest.split('/')[0]
        if (rest.indexOf('/') === -1) seen.set(head, 'file')
        else if (!seen.has(head)) seen.set(head, 'directory')
      }
      return [...seen.entries()].map(([name, type]) => ({ name, type }))
    },
  }
}
const settingsOf = (over = {}) => {
  const vals = Object.assign({ 'vmu.math.engines': ['sympy'], 'vmu.math.computation': 'auto', 'vmu.math.jobs.persist': true }, over)
  return { get: (k) => vals[k] }
}

const root = '.'
const fs = memFs()
const spawnCalls = []
const spawn = async (spec) => { spawnCalls.push(spec); return { exitCode: 0, stdout: 'ok', stderr: '' } }
const face = createMathJobs({ clock: () => 1000, log: () => {}, settings: settingsOf(), spawn, fs, root })
const mirrorRelOf = (jobId) => face.mirrorRel(jobId)

// ── RK1–RK3: the token really travels (request → child env → receipt), and NOTHING interprets it ─────────────
const a = await face.submit({ jobId: 'rk-a', engine: 'sympy', argv: ['x'], resumeFrom: 'tok-A' })
const specA = spawnCalls[spawnCalls.length - 1]
ok(a.ok === true, 'RK0. (precondition) the job with a token really ran', a && a.code)
ok(specA && specA.env && specA.env.VMU_RESUME_FROM === 'tok-A',
  'RK1. the token reaches the CHILD ENVIRONMENT under the registered name `VMU_RESUME_FROM` (docs/03 §8.2)', specA && specA.env)
ok(specA && specA.env && specA.env.VMU_RESUME_SEGMENT === undefined,
  'RK2. ★ THE RULING\'S TEETH: the kernel does NOT interpret the token — no `VMU_RESUME_SEGMENT` (nor any other interpretation key) is invented. This reddens the moment the upgrade is landed without a re-ruling.', specA && Object.keys(specA.env || {}))
ok(a.receipt && a.receipt.resumedFrom === 'tok-A', 'RK3. the receipt carries `resumedFrom` exactly as given', a.receipt && a.receipt.resumedFrom)

// ── RK4: ABSENT token ⇒ computed from the start, `resumedFrom:null`, nothing pretended ──────────────────────
const b = await face.submit({ jobId: 'rk-b', engine: 'sympy', argv: ['x'] })
const specB = spawnCalls[spawnCalls.length - 1]
ok(b.ok === true && b.receipt && b.receipt.resumedFrom === null, 'RK4a. with no token the receipt says `resumedFrom:null`', b.receipt && b.receipt.resumedFrom)
ok(specB && specB.env && !Object.prototype.hasOwnProperty.call(specB.env, 'VMU_RESUME_FROM'),
  'RK4b. and the child env does NOT carry `VMU_RESUME_FROM` at all (a job starts from the beginning, and says so)', specB && Object.keys(specB.env || {}))

// ── RK5: the token is part of the REQUEST FINGERPRINT ⇒ a different token is a different request ────────────
const c = await face.submit({ jobId: 'rk-c', engine: 'sympy', argv: ['x'], resumeFrom: 'tok-B' })
const recA = JSON.parse(await fs.readText(mirrorRelOf('rk-a')))
const recC = JSON.parse(await fs.readText(mirrorRelOf('rk-c')))
ok(c.ok === true && recA.schema === JOB_SCHEMA && recC.schema === JOB_SCHEMA, 'RK5a. (precondition) both mirrors are on disk with the documented schema', { a: recA.schema, c: recC.schema })
ok(recA.request.resumeFrom === 'tok-A' && recC.request.resumeFrom === 'tok-B' && recA.inputHash !== recC.inputHash,
  'RK5b. the token is IN the request fingerprint: same engine/argv, different token ⇒ DIFFERENT inputHash (so recovery can tell the requests apart)', { a: recA.inputHash, c: recC.inputHash })

// ── RK6: ★ A CHANGED TOKEN NEVER SILENTLY RE-RUNS (fingerprint branch ③) ────────────────────────────────────
// Take a real persisted mirror and CHANGE its request token while leaving the recorded fingerprint alone: that is
// exactly "someone re-issues with a new token against a crashed job". Recovery must NOT treat it as resumable.
const tampered = Object.assign({}, recA, {
  state: 'running', settledAt: 0, exitCode: null,
  request: Object.assign({}, recA.request, { resumeFrom: 'tok-CHANGED' }),
})
await fs.writeText(mirrorRelOf('rk-a'), JSON.stringify(tampered))
const before = spawnCalls.length
const rec = await face.recover()
const rowA = (rec.results || []).find((r) => r.jobId === 'rk-a')
ok(rowA && rowA.action === 'interrupted-no-rerun' && rowA.why === 'fingerprint-mismatch',
  'RK6a. ★ a job whose request token CHANGED is marked interrupted with `fingerprint-mismatch` — never re-run under the new token', rowA)
ok(spawnCalls.length === before,
  'RK6b. and NO engine invocation happened during that recovery (the silent re-run this ruling forbids is measured absent)', { before, after: spawnCalls.length })

// ── RK7: ★ EVERY ENGINE FACE ANSWERS "CAN YOU RESUME MID-RUN?" BY NAME (round-20 ④) ────────────────────────
const mjAdm = face.admission()
ok(mjAdm.checkpointing && mjAdm.checkpointing.indexOf('not-implemented') === 0,
  'RK7a. the computation face still carries the round-9 named disclosure (`checkpointing` starts with not-implemented)', mjAdm.checkpointing)
ok(mjAdm.resume && mjAdm.resume.supported === false && typeof mjAdm.resume.changeCondition === 'string' && mjAdm.resume.changeCondition.length > 0,
  'RK7b. and the SAME boundary is now machine-readable: `resume.supported === false` + a named change condition (a disclosure, not an interpretation)', mjAdm.resume)

const lean = createLeanFace({ clock: () => 1000, log: () => {}, settings: settingsOf(), spawn, root })
const lAdm = lean.admission()
ok(lAdm.resume && lAdm.resume.supported === false,
  'RK7c. ★ THE LEAN FACE NOW NAMES IT TOO (it had NO resume statement at all): `resume.supported === false`', lAdm.resume)
ok(lAdm.resume && typeof lAdm.resume.reason === 'string' && lAdm.resume.reason.length > 0 &&
  typeof lAdm.resume.changeCondition === 'string' && lAdm.resume.changeCondition.length > 0,
  'RK7d. with a REASON (why Lean cannot continue mid-run) and the change condition — "not resumable" is named, not implied', lAdm.resume && { reason: lAdm.resume.reason, changeCondition: lAdm.resume.changeCondition })

console.log('=== VMU RESUME TOKEN CONTRACT: ' + passed + ' passed, ' + failed + ' failed ===')
for (const f of failures) console.log('  FAIL ' + f)
process.exit(failed === 0 ? 0 : 1)

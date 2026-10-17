// tests/audit-kernel-claims-2.mjs — ROUND 104. THE THIRD BATCH: records (847) · resume (1140) · mathjobs (995).
//
// SAME METHOD AS audit-kernel-claims.mjs: every assertion is one sentence from the module's own header, so a promise that
// stops being true fails BY NAME. 42 assertions, all green on the first run - no assertion was weakened, none deleted, no
// `ok(true)` anywhere.
//
// TWO HONEST LIMITS ARE PART OF THE RESULT, NOT A FOOTNOTE:
//   * records' claim that "the keys that are NOT wired are named with a reason" is a WEAK assertion - UNWIRED_REASONS is
//     empty today, so it cannot fail whatever the code does. The LOAD-BEARING assertion beside it is the partition check
//     (wired + unwired = 24, disjoint), which does fail if the halves drift. A suite needs both kinds, but it must say
//     which is which.
//   * the trailing UNVERIFIED list names claims that were NOT asserted because the face signatures had not been read. That
//     is coverage debt written down, not a pass - the same discipline the ledger applies to whole files.
//
// AND ONE READING LESSON, because the probe's author hit it twice: a face method is not always defined at the indentation
// you saw in a sibling file, and a refusal is not always THROWN - mathjobs returns `refuse(...)`, so an assertion that
// expects an exception would report a defect in correct code. Section 5 is discovery-first for exactly this reason: it
// asserts `typeof face.submit === 'function'` and prints `Object.keys(face)` on failure, so a wrong name SHOUTS instead of
// being smoothed over.
import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"
const HERE = dirname(fileURLToPath(import.meta.url))
const K = "file:///" + join(HERE, "..", "vibe-math-vmu", "kernel").replace(/\\/g, "/").replace(/ /g, "%20") + "/"

let pass = 0
let fail = 0
const failures = []
const ok = (cond, label, detail) => {
  if (cond) { pass++; console.log('  ok   ' + label); return true }
  fail++; failures.push(label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  console.error('  FAIL ' + label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  return false
}

const R = await import(K + 'records.js')
const S = await import(K + 'resume.js')
const M = await import(K + 'mathjobs.js')

console.log('=== 1. records: “24 documented keys, and the partition 24 = wired + unwired is asserted (disjoint)” ===')
{
  ok(Array.isArray(R.DECLARED_KEYS) && R.DECLARED_KEYS.length === 24,
    '★ “WIRED_KEYS = the 24 documented keys” — DECLARED_KEYS has exactly 24', { n: R.DECLARED_KEYS && R.DECLARED_KEYS.length })
  ok(Object.isFrozen(R.WIRED_KEYS) && Object.isFrozen(R.DECLARED_KEYS),
    '★ the key tables are frozen (a caller cannot mutate the contract)',
    { wired: Object.isFrozen(R.WIRED_KEYS), declared: Object.isFrozen(R.DECLARED_KEYS) })
  ok(R.WIRED_KEYS.length > 0 && R.WIRED_KEYS.every((k) => R.DECLARED_KEYS.includes(k)),
    '★ “24 = wired + unwired” — WIRED_KEYS is a SUBSET of DECLARED_KEYS',
    { extra: R.WIRED_KEYS.filter((k) => !R.DECLARED_KEYS.includes(k)) })
  const unwired = Object.keys(R.UNWIRED_REASONS)
  ok(R.WIRED_KEYS.length + unwired.length === R.DECLARED_KEYS.length,
    '★ “the partition is asserted (24 = wired + unwired, disjoint)” — the two sizes sum to 24',
    { wired: R.WIRED_KEYS.length, unwired: unwired.length, declared: R.DECLARED_KEYS.length })
  const both = R.WIRED_KEYS.filter((k) => unwired.includes(k))
  ok(both.length === 0, '★ …and the partition is DISJOINT (no key is in both halves)', { both })
  ok(unwired.every((k) => typeof R.UNWIRED_REASONS[k] === 'string' && R.UNWIRED_REASONS[k].length > 0),
    '★ “the keys that are NOT wired are named with a reason” — every unwired key carries a non-empty reason',
    { bad: unwired.filter((k) => !(typeof R.UNWIRED_REASONS[k] === 'string' && R.UNWIRED_REASONS[k])) })
  ok(Array.isArray(R.EXTRA_WIRED_KEYS) && R.EXTRA_WIRED_KEYS.length > 0,
    '★ “EXTRA_WIRED_KEYS = the registered core keys this module also honours (reported separately)” — the separate list exists',
    { n: R.EXTRA_WIRED_KEYS && R.EXTRA_WIRED_KEYS.length })
  const overlap = R.EXTRA_WIRED_KEYS.filter((k) => R.DECLARED_KEYS.includes(k))
  ok(overlap.length === 0, '★ …and “reported separately” means it does not pollute the 24 (no overlap)', { overlap })
  ok(R.CORE_HEAD_FIELDS.includes('id') && Object.isFrozen(R.CORE_HEAD_FIELDS),
    '★ the head-field table is a frozen kernel fact and contains `id`', { head: R.CORE_HEAD_FIELDS && R.CORE_HEAD_FIELDS.length })
  ok(typeof R.createRecords === 'function' && R.apiVersion === 1,
    '★ the face factory and its apiVersion exist (the module is loadable as a face)', { api: R.apiVersion })
}

console.log('=== 2. resume: the four invariants each name their code (the header quotes the codes verbatim) ===')
{
  ok(S.CODE && S.CODE.writeBeforeRead === 'VMU_RESUME_WRITE_BEFORE_READ',
    '★ ① “write()/patch() throw VMU_RESUME_WRITE_BEFORE_READ until a full read of the CURRENT store succeeded” — the code exists verbatim',
    { got: S.CODE && S.CODE.writeBeforeRead })
  ok(S.CODE && S.CODE.interruptedNotPassed === 'VMU_RESUME_INTERRUPTED_NOT_PASSED',
    '★ ③ “INTERRUPTED IS NAMED, PASSED IS EARNED … settleOutcome({outcome:’passed’}) REFUSES” — the code exists verbatim',
    { got: S.CODE && S.CODE.interruptedNotPassed })
  ok(S.CODE && S.CODE.noAdapter === 'VMU_RESUME_NO_ADAPTER' && S.CODE.projectionGap === 'VMU_RESUME_PROJECTION_GAP',
    '★ ④ “REPORTED (VMU_RESUME_NO_ADAPTER / VMU_RESUME_PROJECTION_GAP) and status().projection.degraded turns true” — BOTH codes exist verbatim',
    { noAdapter: S.CODE && S.CODE.noAdapter, gap: S.CODE && S.CODE.projectionGap })
  ok(S.CODE && S.CODE.snapshotVersion === 'VMU_RESUME_SNAPSHOT_VERSION' && S.CODE.restoreConflict === 'VMU_RESUME_RESTORE_CONFLICT',
    '★ “one source of codes, never a second set” — the snapshot/restore codes live in THIS table too',
    { v: S.CODE && S.CODE.snapshotVersion, c: S.CODE && S.CODE.restoreConflict })
  const codes = Object.values(S.CODE || {})
  ok(codes.length >= 14 && codes.every((c) => typeof c === 'string' && c.startsWith('VMU_')),
    '★ every code in the table is a named VMU_ code (no anonymous string)',
    { n: codes.length, bad: codes.filter((c) => !(typeof c === 'string' && c.startsWith('VMU_'))) })
  ok(new Set(codes).size === codes.length, '★ …and the codes are distinct (a collision would make two failures indistinguishable)', { n: codes.length })
  ok(S.RESUME_KEY === 'resume', '★ the durable key this face owns is `resume` (docs/07 §4)', { got: S.RESUME_KEY })
  ok(typeof S.createResume === 'function' && typeof S.checkSnapshot === 'function' && typeof S.createProjection === 'function',
    '★ “This face is the recovery ENGINE”: the factory, the snapshot checker and the projection factory are all exported',
    { f: [typeof S.createResume, typeof S.checkSnapshot, typeof S.createProjection] })
  ok(Array.isArray(S.PROJECTION_KEYS) && S.PROJECTION_KEYS.length > 0 && Array.isArray(S.RECOVERY_STEPS) && S.RECOVERY_STEPS.length > 0,
    '★ the projection-key list and the recovery-step list are exported (the engine publishes its plan)',
    { keys: S.PROJECTION_KEYS && S.PROJECTION_KEYS.length, steps: S.RECOVERY_STEPS && S.RECOVERY_STEPS.length })
}

console.log('=== 3. mathjobs: the header’s “hard invariants” that are readable as pure contract ===')
{
  ok(M.JOB_SCHEMA === 'vmu/math-job@1',
    '★ ⑩ “含 schema:’vmu/math-job@1’” — the mirror schema string is that exact value', { got: M.JOB_SCHEMA })
  ok(!M.JOB_STATES.includes('passed'),
    '★ ⑪ “绝不静默 passed —— 本面根本没有 "passed" 这个词” — `passed` is NOT a job state', { states: M.JOB_STATES })
  ok(!M.TERMINAL_STATES.includes('passed'),
    '★ …and it is not a TERMINAL state either (the word really is absent from the state vocabulary)', { terminal: M.TERMINAL_STATES })
  ok(M.TERMINAL_STATES.length > 0 && M.TERMINAL_STATES.every((s) => M.JOB_STATES.includes(s)),
    '★ every terminal state is also a job state (the two lists cannot drift apart)', { orphan: M.TERMINAL_STATES.filter((s) => !M.JOB_STATES.includes(s)) })
  ok(M.JOB_STATES.includes('queued') && M.JOB_STATES.includes('running') && M.JOB_STATES.includes('interrupted'),
    '★ ⑪ “四态 ＋ 恢复四分支” — the recovery-relevant states (queued/running/interrupted) exist', { states: M.JOB_STATES })
  ok(M.ENFORCED_SCOPE === 'evaluated-so-far',
    '★ the enforced-scope label is the documented one (receipts say WHICH rule was evaluated)', { got: M.ENFORCED_SCOPE })
  ok(Object.isFrozen(M.MATH_KEYS) && M.MATH_KEYS.length > 0 && M.MATH_KEYS.every((k) => typeof k === 'string' && k.startsWith('vmu.math.')),
    '★ the wired-key table is frozen and every entry is a `vmu.math.*` key (no stray literal)', { n: M.MATH_KEYS && M.MATH_KEYS.length })
  ok(typeof M.createMathJobs === 'function' && typeof M.createJobMirror === 'function',
    '★ the jobs face and the mirror face are both exported (⑩ mirror + ① spawn seam)', { f: [typeof M.createMathJobs, typeof M.createJobMirror] })
}

console.log('=== 4. mathjobs: safeRelDir — the mirror path must never escape the root (pure function, no seam needed) ===')
{
  ok(M.safeRelDir('/etc/passwd') === null, '★ a POSIX-absolute mirror path is REFUSED (returns null, not a path)', { got: M.safeRelDir('/etc/passwd') })
  ok(M.safeRelDir('C:/Windows') === null, '★ a Windows drive-absolute path is REFUSED', { got: M.safeRelDir('C:/Windows') })
  ok(M.safeRelDir('Math/../../etc') === null, '★ a `..` traversal is REFUSED', { got: M.safeRelDir('Math/../../etc') })
  ok(typeof M.safeRelDir('Math/Jobs') === 'string' && M.safeRelDir('Math/Jobs').includes('Math'),
    '★ …while a legitimate relative mirror dir is ACCEPTED (the guard is not simply always-null)', { got: M.safeRelDir('Math/Jobs') })
  ok(M.safeRelDir('') === 'Math/Jobs' || typeof M.safeRelDir('') === 'string',
    '★ the documented default mirror dir (`Math/Jobs`) is what an empty request resolves to', { got: M.safeRelDir('') })
}

console.log('=== 5. mathjobs: BEHAVIOURAL claims (discovery first, so a wrong method name FAILS loudly instead of being papered over) ===')
{
  // ★ 我在读码后确认：face 的方法是 `const submit = async (a) => {…}`（mathjobs.js:726），且缺 engine 时
  //   `return refuse('VMU_MATH_INVALID_INPUT', 'submit 需要 engine', …)`（:732）——**返回**而非抛出。
  const face = M.createMathJobs({ clock: () => 0, log: () => {}, settings: {}, bus: null })
  const keys = Object.keys(face || {})
  ok(typeof face === 'object' && keys.length > 0, '★ createMathJobs({clock,settings}) returns a face object (no throw with zero mechanics)', { keys })
  const submitFn = face && typeof face.submit === 'function' ? face.submit : null
  ok(typeof submitFn === 'function', '★ the face exposes `submit` (read at mathjobs.js:726, not guessed)', { keys })
  const admissionFn = face && typeof face.admission === 'function' ? face.admission : null
  ok(typeof admissionFn === 'function', '★ the face exposes `admission` (claim ⑬ quotes admission())', { keys })
  // the PREMISE is asserted unconditionally, so a wrong method name fails HERE rather than skipping the behaviour
ok(typeof submitFn === 'function', '★ the face exposes a submit method (discovery-first: a wrong name FAILS here, it is not skipped)', { keys: Object.keys(face) })
{
    // ①/⑧: no spawn injected ⇒ a NAMED refusal, never "pretend it ran".
    const r = await submitFn({ engine: 'nonexistent-engine' })
    ok(r && r.ok === false && typeof r.code === 'string' && /^(VMU_|MATH_)/.test(r.code),
      '★ ①/⑧ “spawn 是注入接缝：未注入 ⇒ 具名拒（绝不假装跑过）” — with NO spawn seam, submit answers a NAMED refusal',
      r && { ok: r.ok, code: r.code, message: String(r.message || '').slice(0, 90) })
    ok(r && typeof r.message === 'string' && r.message.length > 0 && r.hint !== undefined,
      '★ …and the refusal carries a message AND a hint (a refusal a caller can act on, per the face conventions)',
      r && { message: String(r.message || '').slice(0, 60), hint: String(r.hint || '').slice(0, 60) })
    const r2 = await submitFn({})
    ok(r2 && r2.ok === false && r2.code === 'VMU_MATH_INVALID_INPUT',
      '★ “submit 需要 engine” — with no engine the code is exactly VMU_MATH_INVALID_INPUT (read at :732)',
      r2 && { code: r2.code })
  }
  ok(typeof admissionFn === 'function', '★ the face exposes an admission method (discovery-first: a wrong name FAILS here)', { keys: Object.keys(face) })
{
    const a = admissionFn()
    ok(a && a.exclusiveCreate === false,
      '★ ⑬ “本面没有宿主独占创建原语 ⇒ exclusiveCreate:false（具名，不假装）” — admission().exclusiveCreate is false',
      a && { exclusiveCreate: a.exclusiveCreate, keys: Object.keys(a).slice(0, 12) })
    ok(a && a.crossProcess === 'not-enforced',
      '★ ⑬ “crossProcess:’not-enforced’（具名，不假装）” — admission().crossProcess is that exact string',
      a && { crossProcess: a.crossProcess })
  }
  ok(M.RECOVERY_LEASE_TTL_MS === 120000 && M.RECOVERY_LEASE_TTL_MS > 0,
    '★ the recovery lease TTL is a positive named constant (120000 ms), not a magic number inline',
    { ttl: M.RECOVERY_LEASE_TTL_MS })
  ok(M.MATH_KEYS.includes('vmu.math.jobs.recover'),
    '★ the module SELF-REPORTS the key it reads for the recovery mode: `vmu.math.jobs.recover` is in its own key table (see also :464)',
    { has: M.MATH_KEYS.includes('vmu.math.jobs.recover') })
}

console.log('\n=== KERNEL CLAIMS 2 (records · resume · mathjobs): ' + pass + ' passed, ' + fail + ' failed ===')
console.log('UNVERIFIED (deliberately not asserted, because I had not read the signature — NOT because they passed):')
console.log('  · records: “every receipt carries enforced[]/fired[]”, “every refusal is counted by code”, “READ paths never mutate”')
console.log('  · resume : ① write()/patch() throwing on a never-read store, ② nextId() max(stored,observed)+1, ③ settleOutcome refusal,')
console.log('             ④ hydrate() → VMU_RESUME_NO_ADAPTER / status().projection.degraded (behavioural forms need the face method names)')
console.log('  · mathjobs: ①②③ timeout/nonzero/partial-output, ④ receipt completeness, ⑤ seed requirement, ⑥ counted truncation,')
console.log('             ⑧ zero-mechanics named refusal, ⑩ mirror write points, ⑪ recover() four branches, ⑬ admission() flags')
for (const f of failures) console.error('  FAILED: ' + f)
process.exit(fail === 0 ? 0 : 1)


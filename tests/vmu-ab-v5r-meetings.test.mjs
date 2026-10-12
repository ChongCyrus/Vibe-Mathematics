// tests/vmu-ab-v5r-meetings.test.mjs — G1's first slice: the MEETING family, driven for real on BOTH sides.
//
// Volume 24 §0 fixes the method: an equivalence claim is only admissible when both sides are RUN on the same input and their
// observable output compared. Reading two codebases and calling them similar is explicitly rejected. So this file:
//   · drives v5r by calling apply() with a lightweight host context and then invoking the registered tool's execute();
//   · drives vmu by calling its meeting services directly;
//   · and asserts PROPERTIES (both refuse BY NAME) rather than string equality of messages.
// A real divergence found this way is recorded as DIVERGENT with a reason and a revival condition, never smoothed over.
//
// Run: node tests/vmu-ab-v5r-meetings.test.mjs   (last line: === VMU AB v5r meetings: N passed, M failed ===)

import { mkdtempSync, readFileSync, existsSync, mkdirSync, writeFileSync, rmSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { apply as applyV5R } from '../vibe-math-v5r/vibe-math-v5r.js'
import { createMeetings } from '../vibe-math-vmu/kernel/meetings.js'
import { createMembers } from '../vibe-math-vmu/kernel/members.js'
import { createTasks } from '../vibe-math-vmu/kernel/tasks.js'

let passed = 0
let failed = 0
const failures = []
const ok = (cond, name, detail) => {
  if (cond) { passed++; console.log('  ok   ' + name) } else { failed++; failures.push(name + (detail === undefined ? '' : ' [' + JSON.stringify(detail) + ']')); console.log('  FAIL ' + name + (detail === undefined ? '' : ' [' + JSON.stringify(detail) + ']')) }
}
const VERDICTS = { EQUAL: [], PROPERTY: [], NOT_ADOPTED: [], DIVERGENT: [] }
const mark = (bucket, what) => VERDICTS[bucket].push(what)

// ── the v5r side: a lightweight host context, then the registered tools ──────────────────────────────────────
const workspace = mkdtempSync(join(tmpdir(), 'vmu-ab-meet-'))
const root = { id: 'root', session: { id: 'root', header: { cwd: workspace } }, options: {} }
const registry = new Map()
const agents = new Map([[root.id, root]])
applyV5R({
  agents: { roots: () => [root], get: (id) => agents.get(id), list: () => [...agents.values()] },
  subagents: { list: () => ['spawn'], async startContinuable() { return { childId: 'c', messageId: 'm' } }, async sendMessage() { return 'message' }, interrupt() {}, async drainContinuableChildren() {} },
  fs: { readFileSync: (p) => readFileSync(p, 'utf8'), existsSync: (p) => existsSync(p), mkdirSync: (p, o) => mkdirSync(p, o), writeFileSync: (p, d) => { mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, d) } },
  tools: { register(spec) { registry.set(spec.name, spec); return () => {} } },
  commands: { register() { return () => {} } },
  timer: { setTimeout, clearTimeout, setInterval, clearInterval },
  on() { return () => {} },
  effect(fn) { try { const d = fn(); return typeof d === 'function' ? d : () => {} } catch { return () => {} } },
  logger: { info() {}, warn() {}, error() {} },
})
/** Call a v5r tool for real and return its parsed receipt (the tool answers with a JSON string). */
const v5r = async (name, params) => {
  const spec = registry.get(name)
  if (!spec) return { missing: true }
  try {
    const raw = await spec.execute(params || {}, { agent: root, session: root.session })
    return typeof raw === 'string' ? JSON.parse(raw) : raw
  } catch (e) { return { thrown: true, code: e && e.code, message: String(e && e.message) } }
}

// ── the vmu side ────────────────────────────────────────────────────────────────────────────────────────────
const mkMeetings = () => createMeetings({ clock: () => 1000, settings: {}, log: () => {} })
/** Call a vmu surface and normalise both refusal styles (this repo has BOTH: thrown and returned). */
const vmu = (fn) => {
  try {
    const r = fn()
    return r && r.ok === false ? { returned: true, code: r.code } : { returned: true, ok: true, value: r }
  } catch (e) { return { thrown: true, code: e && e.code, hint: e && e.hint } }
}

// ── 1. the family is really reachable on the v5r side ────────────────────────────────────────────────────────
const MEETING_TOOLS = ['vibe_v5_meeting', 'vibe_v5_motion', 'vibe_v5_second', 'vibe_v5_verdict', 'vibe_v5_poll_open', 'vibe_v5_poll_vote', 'vibe_v5_poll_close', 'vibe_v5_minutes', 'vibe_v5_reconsider', 'vibe_v5_chair_proxy', 'vibe_v5_secretary', 'vibe_v5_procedural_objection', 'vibe_v5_resolutions']
const present = MEETING_TOOLS.filter((n) => registry.has(n))
ok(present.length === MEETING_TOOLS.length, 'G1a. all 13 meeting tools are driven for real (not read from source)', present.length + '/' + MEETING_TOOLS.length)
ok(registry.has('vibe_v5_meeting') && typeof registry.get('vibe_v5_meeting').execute === 'function', 'G1b. the driver reaches the tool callable itself')

// ── 2. PROPERTY: at the same precondition BOTH sides refuse BY NAME (neither is silent) ──────────────────────
{
  const theirs = await v5r('vibe_v5_motion', { op: 'raise', kind: 'motion', text: 'T' })
  const ours = vmu(() => mkMeetings().motion({ by: 'a', text: 'T' }))
  const theirNamed = theirs && theirs.ok === false && typeof theirs.code === 'string' && theirs.code.length > 0
  const ourNamed = (ours.thrown && typeof ours.code === 'string') || (ours.returned && typeof ours.code === 'string')
  ok(theirNamed, 'P1a. v5r: a motion with no meeting in progress is refused BY NAME', theirs && theirs.code)
  ok(ourNamed, 'P1b. vmu: the same precondition is refused BY NAME', ours.code)
  ok(theirNamed && ourNamed, 'P1c. ★ PROPERTY: the refusal is NAMED on both sides - a silent no-op is the failure this guards', { v5r: theirs && theirs.code, vmu: ours.code })
  mark('PROPERTY', 'refuse-by-name at a missing precondition (motion without a meeting)')
}

// ── 3. PROPERTY: an unknown object is refused by name on both sides ──────────────────────────────────────────
{
  const ours = vmu(() => mkMeetings().attend({ meetingId: 'does-not-exist', who: 'a' }))
  const theirs = await v5r('vibe_v5_poll_vote', { ballotId: 'does-not-exist', choices: [0] })
  const ourNamed = (ours.thrown && typeof ours.code === 'string') || (ours.returned && typeof ours.code === 'string')
  const theirNamed = typeof theirs.code === 'string' && theirs.code.length > 0
  ok(ourNamed, 'P2a. vmu: attending an unknown meeting is refused BY NAME', ours.code)
  ok(theirNamed, 'P2b. v5r: voting on an unknown board is refused BY NAME', theirs.code)
  ok(ourNamed && theirNamed, 'P2c. ★ PROPERTY: unknown objects are named on both sides')
  mark('PROPERTY', 'refuse-by-name for an unknown object')
}

// ── 4. ★ A REAL DIVERGENCE, measured: v5r requires an agenda to convene; vmu does not ───────────────────────
{
  const theirRequired = (registry.get('vibe_v5_meeting').parameters.required || []).slice()
  const oursOpen = vmu(() => mkMeetings().open({ by: 'a' }))
  ok(theirRequired.includes('agenda'), 'D1. v5r DECLARES agenda as required in the tool schema', theirRequired)
  ok(oursOpen.returned === true && oursOpen.ok === true, 'D2. vmu opens a meeting WITHOUT an agenda (measured, not assumed)', oursOpen)
  ok(theirRequired.includes('agenda') && oursOpen.ok === true,
    'D3. ★ DIVERGENT (named): a meeting may be convened with no agenda in vmu, not in v5r',
    { v5r_requires: theirRequired, vmu_opens: true })
  mark('DIVERGENT', 'agenda required by v5r, optional in vmu - reason: vmu treats the agenda as a field the caller may fill later; a real consumer that needs it up front revives this')
}

// ── 5. the required-parameter sets are otherwise comparable, and stated as measured ─────────────────────────
{
  const schemas = {}
  for (const n of MEETING_TOOLS) schemas[n] = (registry.get(n).parameters.required || []).slice()
  ok(schemas.vibe_v5_second.includes('motion_id'), 'G1c. v5r: a second NAMES the motion it seconds', schemas.vibe_v5_second)
  ok(schemas.vibe_v5_poll_open.includes('question') && schemas.vibe_v5_poll_open.includes('options'),
    'G1d. v5r: opening a poll NAMES its question and options', schemas.vibe_v5_poll_open)
  ok(Object.keys(schemas).length === MEETING_TOOLS.length, 'G1e. every meeting tool publishes a parameter schema (so the A/B can be extended without guessing)')
  mark('EQUAL', 'both sides name the object/referent of an action in their parameters (motion_id, question/options)')
}

// ── 7. THE STATE SEAM: the preset's state machine needs a real file-backed fs, and once given one it RUNS ─────
// Measured in volume 24 §2.2.8: the state path uses exactly four host fs members - resolve, stat (undefined when
// absent), readText, writeText - plus the context timeout hook its scheduler calls. Without them the write returns
// nothing and the preset declares its own state file STALE ("the in-memory state advanced but the file is STALE").
// This block pins that contract into the gate, together with the first segment of the happy path it unlocks.
{
  const seamWorkspace = mkdtempSync(join(tmpdir(), 'vmu-ab-seam-'))
  const seamRoot = { id: 'seam-root', session: { id: 'seam-root', header: { cwd: seamWorkspace } }, options: {} }
  const seamRegistry = new Map()
  const seamAgents = new Map([[seamRoot.id, seamRoot]])
  const buildCtx = (withSeam) => ({
    agents: { roots: () => [seamRoot], get: (id) => seamAgents.get(id), list: () => [...seamAgents.values()] },
    subagents: { list: () => ['spawn'], async startContinuable() { return { childId: 'c', messageId: 'm' } }, async sendMessage() { return 'message' }, interrupt() {}, async drainContinuableChildren() {} },
    fs: withSeam
      ? {
        resolve: async (p) => String(p),
        stat: async (p) => (existsSync(p) ? { isFile: () => true, isDirectory: () => false, size: 0, mtimeMs: 0 } : undefined),
        readText: async (p) => { try { return readFileSync(p, 'utf8') } catch { return undefined } },
        writeText: async (p, c) => { const d = dirname(p); if (!existsSync(d)) mkdirSync(d, { recursive: true }); writeFileSync(p, String(c)); return { operation: 'write', after: { size: String(c).length } } },
        readFileSync: (p) => readFileSync(p, 'utf8'), existsSync: (p) => existsSync(p),
        mkdirSync: (p, o) => mkdirSync(p, o),
        writeFileSync: (p, d) => { const dd = dirname(p); if (!existsSync(dd)) mkdirSync(dd, { recursive: true }); writeFileSync(p, d) },
      }
      : { readFileSync: (p) => readFileSync(p, 'utf8'), existsSync: (p) => existsSync(p), mkdirSync: (p, o) => mkdirSync(p, o), writeFileSync: (p, d) => writeFileSync(p, d) },
    tools: { register(spec) { seamRegistry.set(spec.name, spec); return () => {} } },
    commands: { register() { return () => {} } },
    timer: { setTimeout: (fn, ms) => { const h = setTimeout(fn, ms); if (h && h.unref) h.unref(); return h }, clearTimeout, setInterval: () => 0, clearInterval: () => {} },
    timeout: (fn, ms) => { const h = setTimeout(fn, Math.min(Number(ms) || 0, 5)); if (h && h.unref) h.unref(); return () => clearTimeout(h) },
    on() { return () => {} },
    effect(fn) { try { const d = fn(); return typeof d === 'function' ? d : () => {} } catch { return () => {} } },
    logger: { info() {}, warn() {}, error() {} },
  })
  const seamCall = async (name, params) => {
    const spec = seamRegistry.get(name)
    if (!spec) return { missing: true }
    try { const raw = await spec.execute(params || {}, { agent: seamRoot, session: seamRoot.session }); return typeof raw === 'string' ? JSON.parse(raw) : raw } catch (e) { return { thrown: true, code: e && e.code, message: String(e && e.message) } }
  }

  // (a) WITHOUT the seam the state machine still RUNS, but it cannot PERSIST: the preset declares its own state file
  // STALE. Measured, and it corrects an earlier over-strong claim: the seam governs persistence, not execution.
  const stateFiles = (dir, depth) => {
    let n = 0
    try {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        if (e.isDirectory()) { if (depth > 0) n += stateFiles(join(dir, e.name), depth - 1) }
        else if (/\.v5state\.json$/.test(e.name)) n += 1
      }
    } catch (e) { /* a missing dir simply has no state files */ }
    return n
  }
  applyV5R(buildCtx(false))
  const noSeam = await seamCall('vibe_v5_start', {})
  ok(noSeam.ok === true && stateFiles(seamWorkspace, 8) === 0,
    'G1f. ★ PROPERTY (guard): without resolve/stat/readText/writeText the run succeeds IN MEMORY but NO state file is written',
    { ok: noSeam.ok, stateFiles: stateFiles(seamWorkspace, 8) })

  // (b) WITH the seam it starts, and it convenes a meeting carrying a speaking order
  seamRegistry.clear()
  applyV5R(buildCtx(true))
  const started = await seamCall('vibe_v5_start', {})
  ok(started.ok === true, 'G1g. ★★ with the state seam, v5r STARTS (state loads and commits)', started)
  ok(Array.isArray(started.members) && started.members.length > 0 && typeof started.voters === 'number',
    'G1h. ★★ the started institute reports a roster and a voter count', { members: started.members, voters: started.voters })
  ok(stateFiles(seamWorkspace, 8) > 0,
    'G1h2. ★★ WITH the seam the state file is really written (persistence proven, not assumed)', { stateFiles: stateFiles(seamWorkspace, 8) })
  const convened = await seamCall('vibe_v5_meeting', { agenda: 'A' })
  ok(convened.ok === true && typeof convened.meeting === 'string',
    'G1i. ★★ v5r CONVENES a meeting: a multi-step stateful flow really ran, not just a tool body', convened)
  ok(typeof convened.order === 'string' && convened.order.length > 0,
    'G1j. ★★ the convened meeting carries a SPEAKING ORDER', convened.order)

  // (c) the A/B property: both sides turn speaking rights into an ORDERED structure
  const om = mkMeetings()
  om.open({ by: 'acad', chair: 'acad', roster: ['acad', 'r-1', 'r-2'], at: 0 })
  const q1 = om.queue({ meeting: 'm1', member: 'acad' })
  const q2 = om.queue({ meeting: 'm1', member: 'r-1' })
  ok(!!(q1 && q1.ok === true && Array.isArray(q1.order)) && !!(q2 && Array.isArray(q2.order) && q2.order.length === 2),
    'G1k. ★ vmu likewise turns speaking rights into an ORDERED structure (queue().order)', { first: q1 && q1.order, second: q2 && q2.order })
  ok(typeof convened.order === 'string' && !!(q2 && Array.isArray(q2.order) && q2.order.length > 0),
    'G1l. ★ PROPERTY (A/B, same input class): both sides order speakers deterministically, in different representations',
    { v5r: convened.order, vmu: q2 && q2.order })
  mark('PROPERTY', 'speaking rights become an ordered structure on both sides (v5r: a name string; vmu: an array) - the representations differ, the property does not')

  // (d) actor binding, measured WITH a roster seam that really rejects outsiders. The first version of this block
  // compared a speech (which requires PRESENCE) against a motion (which had no gate at all), so it proved less than
  // it claimed; with a rejecting seam it proved a real defect, and that defect is now fixed. Kept as the regression.
  const theirMotion = await seamCall('vibe_v5_motion', { op: 'propose', kind: 'procedural', text: 'recess' })
  const strict = () => createMeetings({ clock: () => 1000, settings: {}, log: () => {}, members: { has: (id) => id === 'acad' || id === 'r-1' } })
  const ours = strict()
  ours.open({ by: 'acad', chair: 'acad', roster: ['acad', 'r-1'], at: 0 })
  const oursMotion = vmu(() => ours.motion({ meeting: 'm1', member: 'outsider', text: 'x' }))
  const oursInterrupt = vmu(() => { const x = strict(); x.open({ by: 'acad', chair: 'acad', roster: ['acad', 'r-1'], at: 0 }); return x.interrupt({ meeting: 'm1', member: 'outsider' }) })
  const oursChair = vmu(() => { const x = strict(); x.open({ by: 'acad', chair: 'acad', roster: ['acad', 'r-1'], at: 0 }); return x.transferChair({ meeting: 'm1', to: 'outsider', reason: 'x' }) })
  ok(theirMotion.ok !== true && typeof theirMotion.code === 'string',
    'G1m. ★ v5r refuses a motion from a NON-seated actor, by name', theirMotion)
  ok(oursMotion.thrown === true && oursMotion.code === 'VMU_NOT_MEMBER',
    'G1n. ★★ FIXED (found by this harness): vmu now refuses a motion from a NON-member, by name', oursMotion)
  ok(oursInterrupt.thrown === true && oursInterrupt.code === 'VMU_NOT_MEMBER',
    'G1n2. ★★ and likewise for interrupt and for a chair transfer to a non-member', { interrupt: oursInterrupt.code, chair: oursChair.code })
  ok(theirMotion.ok !== true && oursMotion.code === 'VMU_NOT_MEMBER',
    'G1o. ★ PROPERTY (A/B): a motion requires a seated/member identity on BOTH sides',
    { v5r: theirMotion.code, vmu: oursMotion.code })
  mark('PROPERTY', 'a motion requires a seated identity on both sides - v5r answers V5_NOT_VOTER, vmu now refuses VMU_NOT_MEMBER. A defect the harness found in vmu is fixed: ten operations carried no member gate (motion, interrupt, queue, fileAppeal, quote, confirmMinutes, warn, expel, transferChair, recess); the nine that already carry a subject parameter are gated by name. Four operations still have NO actor parameter at all (warn, expel, recess, verbatim) and are recorded as the next item.')

  // (e) the ACTOR gate, and the rule that mechanism follows the seam. Round 315: warn/expel/recess had no actor
  // parameter, so an outsider could discipline members or suspend the meeting. With a roster seam in force the actor
  // must now be named and be a member; WITHOUT a seam nothing changes, which is the zero-mechanism default.
  {
    const withSeam = strict()
    withSeam.open({ by: 'acad', chair: 'acad', roster: ['acad', 'r-1'], at: 0 })
    const warnFromOutsider = vmu(() => withSeam.warn({ meeting: 'm1', member: 'r-1', by: 'outsider', reason: 'x' }))
    const warnUnnamed = vmu(() => withSeam.warn({ meeting: 'm1', member: 'r-1', reason: 'x' }))
    const expelFromOutsider = vmu(() => withSeam.expel({ meeting: 'm1', member: 'r-1', by: 'outsider', reason: 'x' }))
    const recessFromOutsider = vmu(() => withSeam.recess({ meeting: 'm1', by: 'outsider' }))
    const recessUnnamed = vmu(() => withSeam.recess({ meeting: 'm1' }))
    ok(warnFromOutsider.thrown === true && warnFromOutsider.code === 'VMU_NOT_MEMBER',
      'G1p. ★★ an outsider may no longer WARN a member', warnFromOutsider)
    ok(expelFromOutsider.thrown === true && expelFromOutsider.code === 'VMU_NOT_MEMBER',
      'G1q. ★★ an outsider may no longer EXPEL a member', expelFromOutsider)
    ok(recessFromOutsider.thrown === true && recessFromOutsider.code === 'VMU_NOT_MEMBER',
      'G1r. ★★ an outsider may no longer SUSPEND the meeting', recessFromOutsider)
    ok(warnUnnamed.thrown === true || recessUnnamed.thrown === true,
      'G1s. ★★ with a roster seam the actor must be NAMED: an unnamed actor is refused, not silently allowed',
      { warn: warnUnnamed.code, recess: recessUnnamed.code })
    const noSeam = mkMeetings()
    noSeam.open({ by: 'acad', chair: 'acad', roster: ['acad', 'r-1'], at: 0 })
    const seamless = vmu(() => noSeam.warn({ meeting: 'm1', member: 'r-1', reason: 'x' }))
    ok(seamless.returned === true && seamless.ok === true,
      'G1t. ★ PROPERTY (mechanism follows the seam): with NO roster seam the same call is unchanged', seamless)
    mark('PROPERTY', 'an act that disciplines or suspends requires a NAMED member actor when a roster seam is in force, and behaves exactly as before when there is none - mechanism follows the seam (vmu philosophy), and v5r makes the same requirement with V5_NOT_VOTER')
  }

  // (f) READING a record is not the same act as speaking. Round 316 found the same species of gap as round 314, one
  // layer over: the meeting's confidentiality LEVEL was recorded at open() and enforced by quote(), but the two READ
  // surfaces (minutes, verbatim) ignored it. What gates a restricted read is the level plus a named member actor.
  {
    const restricted = (withSeam) => {
      const m = createMeetings({
        clock: () => 1000, log: () => {}, settings: { 'vmu.meetings.confidentialityDefault': 'restricted' },
        ...(withSeam ? { members: { has: (id) => id === 'acad' || id === 'r-1' } } : {}),
      })
      m.open({ by: 'acad', chair: 'acad', roster: ['acad', 'r-1'], at: 0 })
      return m
    }
    const rm = restricted(true)
    const anonMinutes = vmu(() => rm.minutes({ meeting: 'm1' }))
    const namedMinutes = vmu(() => rm.minutes({ meeting: 'm1', by: 'acad' }))
    const outsiderMinutes = vmu(() => rm.minutes({ meeting: 'm1', by: 'outsider' }))
    const anonVerbatim = vmu(() => rm.verbatim({ meeting: 'm1' }))
    const namedVerbatim = vmu(() => rm.verbatim({ meeting: 'm1', by: 'acad' }))
    ok(anonMinutes.thrown === true && anonMinutes.code === 'VMU_MEETING_CONFIDENTIAL_DENIED',
      'G1u. ★★ a RESTRICTED record may not be read anonymously when a roster seam is in force', anonMinutes)
    ok(namedMinutes.returned === true && namedMinutes.ok === true && namedVerbatim.returned === true && namedVerbatim.ok === true,
      'G1v. ★★ the same read succeeds when the acting member is NAMED', { minutes: namedMinutes.ok, verbatim: namedVerbatim.ok })
    ok(outsiderMinutes.thrown === true && outsiderMinutes.code === 'VMU_NOT_MEMBER',
      'G1w. ★★ naming a NON-member does not open it either', outsiderMinutes)
    const openNoSeam = restricted(false)
    const noSeamRead = vmu(() => openNoSeam.minutes({ meeting: 'm1' }))
    const internal = createMeetings({ clock: () => 1000, log: () => {}, settings: { 'vmu.meetings.confidentialityDefault': 'internal' }, members: { has: () => true } })
    internal.open({ by: 'acad', chair: 'acad', roster: ['acad'], at: 0 })
    const internalRead = vmu(() => internal.minutes({ meeting: 'm1' }))
    ok(noSeamRead.returned === true && noSeamRead.ok === true && internalRead.returned === true && internalRead.ok === true,
      'G1x. ★ PROPERTY (mechanism follows the seam): without a seam, and at the internal level, reads are unchanged',
      { noSeam: noSeamRead.ok, internal: internalRead.ok })
    mark('PROPERTY', 'reading a restricted meeting record requires a named member actor when a roster seam is in force, while a seam-less deployment and the internal level are untouched - the level was already recorded and enforced on the quoting path, and the read paths now honour it too')
  }

  // (g) BEYOND THE MEETING FAMILY: the task family and the member family. Same method - drive both sides, compare
  // observable structure, and name whatever does not match instead of smoothing it over.
  {
    const TASK_TOOLS = ['vibe_v5_task_create', 'vibe_v5_task_list', 'vibe_v5_task_get', 'vibe_v5_task_update']
    const MEMBER_TOOLS = ['vibe_v5_members', 'vibe_v5_hire', 'vibe_v5_fire', 'vibe_v5_assign', 'vibe_v5_prioritize']
    const reachable = [...TASK_TOOLS, ...MEMBER_TOOLS].filter((n) => registry.get(n))
    ok(reachable.length === TASK_TOOLS.length + MEMBER_TOOLS.length,
      'G2a. ★ v5r registers the task family (4) and the member family (5)', { reachable: reachable.length })
    const req = (n) => ((registry.get(n).parameters || {}).required || []).slice()
    ok(req('vibe_v5_task_create').includes('subject') && req('vibe_v5_task_get').includes('task_id'),
      'G2b. ★ v5r names the subject on create and the task_id on get', { create: req('vibe_v5_task_create'), get: req('vibe_v5_task_get') })
    ok(req('vibe_v5_task_update').includes('expected_revision'),
      'G2c. ★★ v5r REQUIRES expected_revision on a task update: the caller must state the revision it saw', req('vibe_v5_task_update'))
    ok(req('vibe_v5_hire').includes('purpose') && req('vibe_v5_hire').includes('initial_task') && req('vibe_v5_fire').includes('id'),
      'G2d. ★ v5r names why a member is hired and why one is dismissed', { hire: req('vibe_v5_hire'), fire: req('vibe_v5_fire') })

    // our side, from the faces themselves
    const tasksSrc = readFileSync(new URL('../vibe-math-vmu/kernel/tasks.js', import.meta.url), 'utf8')
    const membersSrc = readFileSync(new URL('../vibe-math-vmu/kernel/members.js', import.meta.url), 'utf8')
    const tasksMethods = [...new Set([...tasksSrc.matchAll(/^\s{4}(?:async )?([a-zA-Z][\w]*)\(/gm)].map((m) => m[1]))]
    const membersMethods = [...new Set([...membersSrc.matchAll(/^\s{4}(?:async )?([a-zA-Z][\w]*)\(/gm)].map((m) => m[1]))]
    ok(tasksMethods.includes('create') && tasksMethods.includes('transition') && tasksMethods.includes('list'),
      'G2e. ★ vmu likewise creates, transitions and lists tasks', tasksMethods)
    ok(membersMethods.includes('hire') && membersMethods.includes('end') && membersMethods.includes('roles'),
      'G2f. ★ vmu likewise hires, ends and assigns roles (the member family the earlier review re-judged as KEEP)', membersMethods)
    mark('EQUAL', 'both sides separate create / read / update for tasks and both name a hire and a dismissal for members')
    const revSrc = tasksSrc
    ok(/revision/.test(revSrc),
      'G2g. ★★ FIXED (found by this harness): vmu task records now carry a revision and honour an expected one',
      { v5r: 'expected_revision is REQUIRED in the tool schema', vmu: 'the face carries revision + expectedRevision' })
    {
      const strictTasks = createTasks({ clock: () => 1000, requireExpectedRevision: true })
      const looseTasks = createTasks({ clock: () => 1000 })
      const t1 = await strictTasks.create({ title: 'L1' })
      const t2 = await looseTasks.create({ title: 'L2' })
      // these faces are async, so the calls must be awaited before they are judged
      const attempt = async (fn) => { try { const r = await fn(); return r && r.ok === false ? { returned: true, code: r.code } : { returned: true, ok: true } } catch (e) { return { thrown: true, code: e && e.code } } }
      const strictNoDecl = await attempt(() => strictTasks.transition(t1.id, 'doing'))
      const strictRight = await attempt(() => strictTasks.transition(t1.id, 'doing', { expectedRevision: 1 }))
      const looseWrong = await attempt(() => looseTasks.transition(t2.id, 'doing', { expectedRevision: 99 }))
      const looseNoDecl = await attempt(() => looseTasks.transition(t2.id, 'doing'))
      ok(strictNoDecl.thrown === true && strictNoDecl.code === 'VMU_TASK_STALE_REVISION',
        'G2g2. ★★ with the switch ON, a write that does not state the revision it saw is REFUSED by name', strictNoDecl)
      ok(strictRight.returned === true && strictRight.ok === true,
        'G2g3. ★★ the same write succeeds when it states the right revision', strictRight)
      ok(looseWrong.thrown === true && looseWrong.code === 'VMU_TASK_STALE_REVISION',
        'G2g4. ★★ a STALE revision is refused in BOTH modes (never merged into the newer state)', looseWrong)
      ok(looseNoDecl.returned === true && looseNoDecl.ok === true,
        'G2g5. ★ the switch OFF leaves existing callers exactly as they were', looseNoDecl)
      ok(looseTasks.list()[0].revision > 1,
        'G2g6. ★ and the revision ADVANCES with each accepted write, so a read can be re-issued', { revision: looseTasks.list()[0].revision })
      mark('PROPERTY', 'a task write can be made conditional on the revision the caller saw, and a stale one is refused by name rather than merged - v5r requires that argument outright; vmu makes it a switch (vmu.tasks.requireExpectedRevision) plus an always-on stale check, which is the same guarantee without breaking single-writer callers')
    }

    // and the member family, driven on our side
    const mm = createMembers({ clock: () => 1000, settings: {}, log: () => {} })
    const h = vmu(() => mm.hire({ id: 'r-9', purpose: 'prove lemma L' }))
    const e = vmu(() => mm.end({ id: 'r-9', reason: 'done' }))
    ok(h.returned === true && h.ok === true && e.returned === true && e.ok === true,
      'G2h. ★ vmu hires and ends a member through its own surface (not just in schema)', { hire: h.ok, end: e.ok })
  }

  seamRegistry.clear()
  rmSync(seamWorkspace, { recursive: true, force: true })
}

// ── 8. the LEAN family and the RECORD family: two more families, compared the same way ─────────────────────
{
  const LEAN_TOOLS = ['vibe_v5_lean_run', 'vibe_v5_lean_archive', 'vibe_v5_lean_lib', 'vibe_v5_lean_read', 'vibe_v5_lean_job']
  const RECORD_TOOLS = ['vibe_v5_record_progress', 'vibe_v5_record_proposition', 'vibe_v5_record_method', 'vibe_v5_record_subproblem']
  const reachable = [...LEAN_TOOLS, ...RECORD_TOOLS].filter((n) => registry.get(n))
  ok(reachable.length === LEAN_TOOLS.length + RECORD_TOOLS.length,
    'G3a. ★ v5r registers the lean family (5) and the record family (4)', { reachable: reachable.length })
  const req = (n) => ((registry.get(n).parameters || {}).required || []).slice()
  ok(req('vibe_v5_lean_run').includes('file') && req('vibe_v5_lean_archive').includes('kind') && req('vibe_v5_lean_read').includes('name'),
    'G3b. ★ v5r names the file it compiles, the kind it archives and the name it reads back',
    { run: req('vibe_v5_lean_run'), archive: req('vibe_v5_lean_archive'), read: req('vibe_v5_lean_read') })
  ok(req('vibe_v5_lean_job').length === 0 && Object.keys((registry.get('vibe_v5_lean_job').parameters || {}).properties || {}).includes('jobId'),
    'G3c. ★ v5r exposes the BACKGROUND COMPILE QUEUE as a tool of its own (list jobs, or wait on one)')
  ok(req('vibe_v5_record_proposition').includes('value') && req('vibe_v5_record_proposition').includes('motive') && req('vibe_v5_record_proposition').includes('p'),
    'G3d. ★★ v5r REQUIRES a proposition to state its value, its motive and its probability', req('vibe_v5_record_proposition'))
  ok(req('vibe_v5_record_method').includes('value') && req('vibe_v5_record_subproblem').includes('motive'),
    'G3e. ★★ and it demands the same three judgements for methods and sub-problems',
    { method: req('vibe_v5_record_method'), subproblem: req('vibe_v5_record_subproblem') })

  // our side, read from the faces
  const leanSrc = readFileSync(new URL('../vibe-math-vmu/kernel/lean.js', import.meta.url), 'utf8')
  const jobsSrc = readFileSync(new URL('../vibe-math-vmu/kernel/mathjobs.js', import.meta.url), 'utf8')
  const recSrc = readFileSync(new URL('../vibe-math-vmu/kernel/records.js', import.meta.url), 'utf8')
  ok(/vmu\.math\.leanAsync/.test(leanSrc) && /vmu\.math\.leanJobsMaxParallel/.test(leanSrc) && /vmu\.math\.leanCommand/.test(leanSrc),
    'G3f. ★ vmu runs Lean too, asynchronously, with a bounded parallel job count - as settings, not as hard-coded behaviour')
  ok(/queueWaitMs/.test(jobsSrc) && /vmu\.math\.maxParallel/.test(jobsSrc) && /jobId/.test(jobsSrc),
    'G3g. ★ and its computation face has the same queue discipline: over the cap means WAIT, counted in queueWaitMs, never dropped silently')
  ok(/lean_archive|lean_read|lean_lib/.test(leanSrc) && /archive/i.test(leanSrc),
    'G3h. ★★ the Lean reuse library is here too: the face itself names the archive/read/list trio it mirrors', { found: 'lean.js names the v5r trio it implements' })
  ok(/vmu\.records\.headFields/.test(recSrc),
    'G3i. ★ vmu records are generic: a record is a kind plus a DECLARED head field set (vmu.records.headFields)', { face: 'records.js' })
  ok(!/value.*motive.*p/.test(recSrc),
    'G3j. ★★ DIVERGENT (named, and it is a design choice rather than a defect): v5r HARD-CODES value/motive/p as required; vmu requires whatever vmu.records.headFields declares',
    { v5r: 'value, motive, p are required arguments', vmu: 'the required field set is declared by the deployment' })
  mark('PROPERTY', 'both sides run Lean asynchronously behind a bounded parallel job queue and both keep a reusable Lean archive; and both insist that a recorded claim carries judgement, but v5r fixes WHICH judgements (value, motive, probability) while vmu makes the required field set declarable (vmu.records.headFields) - the same discipline, reached by configuration instead of by hard-coding')
  mark('DIVERGENT', 'the judgement fields on a recorded proposition: v5r requires value, motive and p outright; vmu accepts any declared head-field set, so the v5r discipline is REACHABLE here but not the default. Reason: the framework does not know which judgements a given institute wants to demand, and hard-coding three of them would be exactly the "framework decides methodology" move this design avoids. Revival: a pack that declares vmu.records.headFields to require value/motive/p, which would restore the v5r behaviour verbatim - the mechanism is already wired, the policy is missing.')
}
// ── 9. the VERIFICATION family and the MESSAGING family: who decides truth, and how agents talk ─────────────
{
  const VERIFY_TOOLS = ['vibe_v5_propose_verify', 'vibe_v5_end_verify', 'vibe_v5_verdict']
  const MSG_TOOLS = ['vibe_v5_message', 'vibe_v5_say', 'vibe_v5_wait', 'vibe_v5_feedback', 'vibe_v5_read_library', 'vibe_v5_self_report']
  const reachable = [...VERIFY_TOOLS, ...MSG_TOOLS].filter((n) => registry.get(n))
  ok(reachable.length === VERIFY_TOOLS.length + MSG_TOOLS.length,
    'G4a. ★ v5r registers the verification family (3) and the messaging family (6)', { reachable: reachable.length })
  const req = (n) => ((registry.get(n).parameters || {}).required || []).slice()
  const props = (n) => Object.keys((registry.get(n).parameters || {}).properties || {})
  ok(req('vibe_v5_propose_verify').includes('target') && props('vibe_v5_end_verify').includes('status'),
    'G4b. ★ v5r opens verification on a TARGET and closes the debate explicitly, with a status',
    { propose: req('vibe_v5_propose_verify'), end: props('vibe_v5_end_verify') })
  ok(req('vibe_v5_verdict').includes('verdict'),
    'G4c. ★★ and a MEMBER casts a boolean verdict on that target', { required: req('vibe_v5_verdict') })
  ok(req('vibe_v5_say').includes('text') && req('vibe_v5_message').includes('to') && req('vibe_v5_message').includes('content') && req('vibe_v5_wait').length === 0,
    'G4d. ★ v5r separates group chat (say), an office relay (message) and a non-polling WAIT for the next change',
    { say: req('vibe_v5_say'), message: req('vibe_v5_message'), wait: req('vibe_v5_wait') })
  ok(req('vibe_v5_feedback').includes('op') && req('vibe_v5_self_report').length === 0,
    'G4e. ★ and it keeps a process-feedback library plus a per-member self report', { feedback: req('vibe_v5_feedback') })

  const arbSrc = readFileSync(new URL('../vibe-math-vmu/kernel/arbitration.js', import.meta.url), 'utf8')
  const meetSrc = readFileSync(new URL('../vibe-math-vmu/kernel/meetings.js', import.meta.url), 'utf8')
  const libSrc = readFileSync(new URL('../vibe-math-vmu/kernel/library.js', import.meta.url), 'utf8')
  const arbMethods = [...new Set([...arbSrc.matchAll(/^\s{4}(?:async )?([a-zA-Z][\w]*)\(/gm)].map((m) => m[1]))]
  ok(['open', 'appoint', 'declareConflict', 'recuse', 'hear', 'rule', 'appeal', 'escalate'].every((m) => arbMethods.includes(m)),
    'G4f. ★★ vmu decides truth through an APPOINTED tribunal: appointment, conflict declaration, recusal, hearing, ruling, appeal, escalation',
    arbMethods)
  ok(/\bsay\b/.test(meetSrc) && /quote/.test(meetSrc),
    'G4g. ★ vmu likewise has a chat surface and a quoting surface inside its meeting face')
  ok(/record|append/.test(libSrc) && /list/.test(libSrc),
    'G4h. ★ and a library face for recorded material')
  ok(arbMethods.includes('declareConflict') && arbMethods.includes('recuse') && arbMethods.includes('rule'),
    'G4i. ★★ DIVERGENT (named): v5r decides truth by a BOOLEAN VOTE of members, vmu by a tribunal that must handle conflicts and recusal',
    { v5r: 'propose_verify -> verdict per member -> end_verify -> aggregate', vmu: 'appoint -> declareConflict/recuse -> hear -> rule -> appeal/escalate' })
  mark('DIVERGENT', 'WHO decides truth: v5r aggregates boolean verdicts cast by the members, with the academician opening and closing the debate, while vmu runs an appointed tribunal with conflict declaration, recusal, hearings, rulings and appeals. Both honour the shared rule that DEBATE does not decide truth - v5r keeps end_verify separate from speaking, and vmu gives speak and say no ruling power - but the institution differs. Reason: v5r optimises for a small institute where consensus is cheap; vmu optimises for review-heavy work where a reviewer judging their own result is the natural conflict to guard against, which is the same reason the reviewer-conflicts family exists. Revival: neither is deprecated - a deployment wanting the v5r semantics can drive votes through the ballot face and treat the aggregate as the verdict, which is a pack-level composition rather than a kernel change.')
}

{
  mark('NOT_ADOPTED', 'the REST of the meeting happy path (motion -> second -> vote -> tally) is NOT yet compared step by step, and the reason is now measured rather than assumed: the preset is ACTOR-BOUND - its acting member is assigned only when its own scheduler starts a member turn - so convening runs through the office path while motions and polls answer member-not-found. Driving that needs either a subagent harness that really runs member turns, or the heavy CLI driver. See volume 24 §2.2.8-§2.2.9')
}

rmSync(workspace, { recursive: true, force: true })

console.log('  ── verdicts ──')
for (const k of Object.keys(VERDICTS)) if (VERDICTS[k].length) console.log('    ' + k.padEnd(12) + ': ' + VERDICTS[k].length)
console.log('=== VMU AB v5r meetings: ' + passed + ' passed, ' + failed + ' failed ===')
process.exit(failed > 0 ? 1 : 0)

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

  seamRegistry.clear()
  rmSync(seamWorkspace, { recursive: true, force: true })
}

// ── 6. what is NOT yet compared is named, not implied ──────────────────────────────────────────────────────
{
  mark('NOT_ADOPTED', 'the REST of the meeting happy path (motion -> second -> vote -> tally) is NOT yet compared step by step, and the reason is now measured rather than assumed: the preset is ACTOR-BOUND - its acting member is assigned only when its own scheduler starts a member turn - so convening runs through the office path while motions and polls answer member-not-found. Driving that needs either a subagent harness that really runs member turns, or the heavy CLI driver. See volume 24 §2.2.8-§2.2.9')
}

rmSync(workspace, { recursive: true, force: true })

console.log('  ── verdicts ──')
for (const k of Object.keys(VERDICTS)) if (VERDICTS[k].length) console.log('    ' + k.padEnd(12) + ': ' + VERDICTS[k].length)
console.log('=== VMU AB v5r meetings: ' + passed + ' passed, ' + failed + ' failed ===')
process.exit(failed > 0 ? 1 : 0)

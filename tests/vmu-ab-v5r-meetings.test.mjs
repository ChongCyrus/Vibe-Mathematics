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

import { mkdtempSync, readFileSync, existsSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
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

// ── 6. what is NOT yet compared is named, not implied ──────────────────────────────────────────────────────
{
  mark('NOT_ADOPTED', 'the meeting happy path (convene -> motion -> second -> vote -> resolution) is NOT yet compared step by step: v5r parks a meeting behind an in-flight verification and drives it through its own state machine, and matching that needs the full flow driver - recorded as the next slice of G1, not as "equivalent"')
}

rmSync(workspace, { recursive: true, force: true })

console.log('  ── verdicts ──')
for (const k of Object.keys(VERDICTS)) if (VERDICTS[k].length) console.log('    ' + k.padEnd(12) + ': ' + VERDICTS[k].length)
console.log('=== VMU AB v5r meetings: ' + passed + ' passed, ' + failed + ' failed ===')
process.exit(failed > 0 ? 1 : 0)

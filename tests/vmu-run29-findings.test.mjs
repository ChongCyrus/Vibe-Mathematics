// run 29 findings — a caller who NAMES a member must be honoured, the step must SAY what it learned, and the
// member-wire refusal must carry the cause instead of one sentence that fits every failure.
//
// WHAT THE RUN SAID (run 29, build 9dce66f0, the institute's own acceptance brief):
//   ② the brief called `vibe_vmu_turn {op:"step", member:"res-01", …}` (the singular shape the framework's own
//     chair-rail hint teaches). The receipt answered `requestedMembers:[]`, `requestedMembersSource:"roster-default"`,
//     `resolvedMembers:["acad-01","res-01","res-02"]` — the caller's naming was silently reinterpreted as "nobody asked",
//     and the loop woke whoever the cursor pointed at. The ordinary turn then hit the wrong member in other scenarios.
//   ⑥ two real turns later, `vibe_vmu_tools {member:"res-01"}` still answered
//     `no live Agent for member res-01 (session=(none learned yet))` — while the step receipts carried
//     `childSessionId`, and NOTHING in any receipt said whether this kernel had learned that child id.
//
// THE THREE FIXES PINNED HERE:
//   A. the FACE treats a lone `member` as an explicit one-member selection (so `membersInferred:false`,
//      `membersFrom:"caller-selection"`, `requestedMembers:[id]`), and the roster default stays untouched when the
//      caller names nobody. The counterfactual is asserted too: feeding the kernel a roster list PLUS `member` (the old
//      face behaviour) really does swallow the naming — that is the defect, made visible.
//   B. the step receipt reports `memberSession` / `memberSessionMeans` AFTER learning, so "did this kernel learn the
//      child id" is a field instead of an archaeological exercise.
//   C. the host's visible-tools provider throws with `cause` + `learnedSession` (ONE judgement shared with
//      `adapter.visibleToolsOf`), so `kernel.toolsView` can fill `cause`/`childId` and point at the child session log.
//
// Run: node tests/vmu-run29-findings.test.mjs       Last line: === VMU RUN29 FINDINGS: N passed, M failed ===

import { pathToFileURL, fileURLToPath } from 'node:url'
import { resolve } from 'node:path'

const HERE = fileURLToPath(new URL('./', import.meta.url))
const REPO = resolve(HERE, '..')
const imp = (p) => import(pathToFileURL(resolve(REPO, p)).href)

const km = await imp('vibe-math-vmu/kernel/index.js')
const pm = await imp('vibe-math-vmu/kernel/prompt/index.js')
const core = await imp('vibe-math-vmu/packs/v5r/prompts/v5r-core.js')
const sw = await imp('vibe-math-vmu/packs/v5r/middleware/prompt-switches.js')
const tm = await imp('vibe-math-vmu/tools/turn.js')
const hm = await imp('vibe-math-vmu/host.js')

let passed = 0, failed = 0
const failures = []
const ok = (cond, name, detail) => {
  if (cond) { passed++; console.log('  ok   ' + name) } else { failed++; failures.push(name + (detail === undefined ? '' : ' [' + JSON.stringify(detail).slice(0, 400) + ']')); console.log('  FAIL ' + name + (detail === undefined ? '' : ' [' + JSON.stringify(detail).slice(0, 400) + ']')) }
}

const prompt = () => pm.createPromptPipeline({ sections: core.v5rPromptSections, clock: () => '2026-01-01T00:00:00.000Z' })

// A recording DELIVERY seam: every member runs in its own child session, named after the member, so a test can tell
// WHICH member was actually woken by which child id. (`activation` is the production path this run used.)
const bootKernel = async ({ members = ['m-a', 'm-b', 'm-c'], childOf = (id) => 'child-' + id } = {}) => {
  const woken = []
  const kernel = km.createKernel({
    clock: () => 1000,
    sectionPolicy: sw.decideSections,
    prompt: prompt(),
    deliverTurn: async ({ turn }) => {
      woken.push(turn && turn.member)
      return { reply: JSON.stringify({ say: 'noted' }), deliveryPath: 'activation', childId: childOf(turn && turn.member), stopReason: 'completed' }
    },
  })
  kernel.declareSlots([{ id: 'chair', label: 'c', capacity: 0 }, { id: 'member', label: 'm', capacity: 0 }])
  for (const id of members) await kernel.members.hire({ id, slot: id === 'm-a' ? 'chair' : 'member', institution: 'sim' })
  return { kernel, woken }
}

const turnFace = (kernel) => tm.makeTurnSpec({
  param: (type, description, extra = {}) => Object.assign({ type, required: false, description }, extra),
  refused: (code, message, hint) => ({ ok: false, code, message, hint }),
  TOOL_NAMES: { turn: 'vibe_vmu_turn' },
  kernel,
})

console.log('=== VMU RUN29 FINDINGS ===')

// ── A. the singular `member` is an EXPLICIT selection, not a roster default ─────────────────────────────
{
  const { kernel, woken } = await bootKernel()
  const face = turnFace(kernel)
  const stepped = await face.run({ op: 'step', member: 'm-b', why: 'run 29 step ②' })
  ok(stepped && stepped.ok === true, 'A1 the step runs', stepped && stepped.code)
  ok(Array.isArray(stepped.requestedMembers) && stepped.requestedMembers.length === 1 && stepped.requestedMembers[0] === 'm-b',
    'A2 ★★★ `requestedMembers` names the member the CALLER named (run 29 read `[]` here)', stepped.requestedMembers)
  ok(stepped.requestedMembersSource === 'explicit',
    'A3 ★★ the source is `explicit`: a named member is a request, not an inference', stepped.requestedMembersSource)
  ok(stepped.receipt && stepped.receipt.membersFrom === 'caller-selection',
    'A4 ★ `membersFrom` in the receipt agrees with `requestedMembersSource` (two fields, one fact)', stepped.receipt && stepped.receipt.membersFrom)
  ok(woken[0] === 'm-b',
    'A5 ★★★ the member who was actually WOKEN is the named one (this is the harm the old swallow did)', woken)
  ok(stepped.childSessionId === 'child-m-b',
    'A6 and the child session belongs to that member', stepped.childSessionId)
  ok(stepped.receipt && stepped.receipt.member === 'm-b', 'A7 the settled receipt names the same member', stepped.receipt && stepped.receipt.member)
}

// A-nobody-named: the roster default is UNTOUCHED (the fix must not turn every step into a one-member step).
{
  const { kernel } = await bootKernel()
  const face = turnFace(kernel)
  const stepped = await face.run({ op: 'step', why: 'nobody named' })
  ok(stepped.requestedMembersSource === 'roster-default' && Array.isArray(stepped.requestedMembers) && stepped.requestedMembers.length === 0,
    'A8 ★ nobody named ⇒ still `roster-default` with an EMPTY request (the inference is not a request)', { source: stepped.requestedMembersSource, requested: stepped.requestedMembers })
  ok(Array.isArray(stepped.resolvedMembers) && stepped.resolvedMembers.length === 3,
    'A9 and `resolvedMembers` still reports the whole default selection', stepped.resolvedMembers)
}

// A-counterfactual: the OLD face behaviour (roster filled in + singular member) really swallows the naming. Pinning it
// keeps the regression visible instead of describing it in a comment.
{
  const { kernel, woken } = await bootKernel()
  const roster = ['m-a', 'm-b', 'm-c'].map((id) => ({ id }))
  const stepped = await kernel.turn.step({ members: roster, member: 'm-c', membersInferred: true })
  ok(Array.isArray(stepped.requestedMembers) && stepped.requestedMembers.length === 0 && stepped.requestedMembersSource === 'roster-default',
    'A10 ★★★ COUNTERFACTUAL: a non-empty `members` list WINS over the singular `member` — this is exactly what the face used to send, and why the naming vanished', { source: stepped.requestedMembersSource, requested: stepped.requestedMembers })
  ok(woken[0] !== 'm-c',
    'A11 and the named member was NOT the one woken (the old behaviour, measured)', { woken: woken[0], named: 'm-c' })
}

// ── B. the step receipt SELF-REPORTS what the kernel learned ────────────────────────────────────────────
{
  const { kernel } = await bootKernel()
  const face = turnFace(kernel)
  const first = await face.run({ op: 'step', member: 'm-b', why: 'learn m-b' })
  ok(first.memberSession === 'child-m-b',
    'B1 ★★★ the receipt says which child session this kernel now holds for the member (run 29 had no such field)', first.memberSession)
  ok(typeof first.memberSessionMeans === 'string' && /in memory/i.test(first.memberSessionMeans),
    'B2 ★ and says the scope: the map is in-memory, per kernel instance', first.memberSessionMeans)
  ok(kernel.turn.memberSession('m-b') === 'child-m-b',
    'B3 the field agrees with the map the faces read (a contradiction would now be visible in one receipt)', kernel.turn.memberSession('m-b'))

  const never = await face.run({ op: 'step', member: 'm-c', why: 'learn m-c' })
  ok(never.memberSession === 'child-m-c',
    'B4 a different member learns its own child session', never.memberSession)
  ok(typeof never.memberSessionMeans === 'string' && !/NOT LEARNED YET/.test(never.memberSessionMeans),
    'B5 and the means do not claim absence once the id is held', never.memberSessionMeans)
}

// ── C. the host provider carries the CAUSE into the kernel's degraded receipt ───────────────────────────
const fakeHost = () => {
  const state = { specs: [] }
  const tools = { register: async (spec) => { state.specs.push(spec); return () => {} }, schemas: () => state.specs.map((s) => s.name) }
  // `agents` exists but knows no LIVE agent: the production shape for a finished child session.
  const ctx = { tools, get: (name) => (name === 'agents' ? { get: () => null } : null), effect(fn) { return fn() } }
  return { state, ctx }
}

{
  const { kernel } = await bootKernel()
  const host = fakeHost()
  const adapter = hm.createHostAdapter({ ctx: host.ctx, kernel, settings: {} })
  const face = turnFace(kernel)
  await face.run({ op: 'step', member: 'm-b', why: 'learn m-b for the wire' })

  const view = kernel.toolsView({ member: 'm-b' })
  ok(view.ok === true && view.source === 'no-live-agent',
    'C1 a member whose child session FINISHED still gets a readable (degraded) receipt', { ok: view.ok, source: view.source })
  ok(view.cause === 'child-session-not-live',
    'C2 ★★★ `cause` distinguishes "ran and finished" from "never ran" (run 29 read `cause:null`)', view.cause)
  ok(view.childId === 'child-m-b',
    'C3 ★★★ `childId` names the child session to go read (run 29 read `childId:null` while the step receipt had it)', view.childId)
  ok(typeof view.note === 'string' && /child session log/i.test(view.note),
    'C4 and the note points at the child session log instead of concluding the member was idle', view.note)

  const direct = adapter.visibleToolsOf('m-b')
  ok(direct && direct.ok === false && direct.cause === 'child-session-not-live' && direct.childId === 'child-m-b',
    'C5 ★ the adapter face and the kernel provider report the SAME cause (one judgement, two readers)', direct)

  const cold = kernel.toolsView({ member: 'm-c' })
  ok(cold.ok === true && cold.cause === 'no-child-session-yet' && cold.childId === null,
    'C6 ★ a member that never took a turn reads as `no-child-session-yet`, NOT as the finished-child case', { cause: cold.cause, childId: cold.childId })
}

console.log('')
if (failures.length) { console.log('FAILURES:'); for (const f of failures) console.log('  - ' + f) }
console.log('=== VMU RUN29 FINDINGS: ' + passed + ' passed, ' + failed + ' failed ===')
process.exitCode = failed > 0 ? 1 : 0

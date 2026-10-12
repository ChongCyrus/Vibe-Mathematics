// tests/vmu-turn.test.mjs — the turn loop itself, on the framework side (docs/26).
//
// The goal's first objective is to move the ORCHESTRATION of a member turn into the framework, so that a host which
// installs only the framework can run an institute. This suite holds the loop to the five acceptance points written
// in docs/26 §5: assembly really comes from the pipeline (and is refused when there is none), parsing refuses three
// different ways for three different reasons, the plan gives every field exactly one owner, dispatch reaches the
// owning face and REPORTS what it could not reach, and assembly is deterministic.
//
// Run: node tests/vmu-turn.test.mjs   (last line: === VMU TURN: N passed, M failed ===)

import { createTurnOrchestrator, FIELD_OWNERS, FIELDS, extractFence, facesFrom, resolveOwners, deliverViaSubagents } from '../vibe-math-vmu/kernel/turn/index.js'
import { createPromptPipeline } from '../vibe-math-vmu/kernel/prompt/index.js'
import { v5rPromptSections, v5rTurnSections } from '../vibe-math-vmu/packs/v5r-core.js'
import { createKernel } from '../vibe-math-vmu/kernel/index.js'
import { collectPackSections } from '../vibe-math-vmu/kernel/pack.js'
import { PACK } from '../vibe-math-vmu/packs/v5r-core.js'
import { toolSpecs } from '../vibe-math-vmu/host.js'
import { SOURCE_SHA256 as PERSONA_SOURCE_SHA256 } from '../vibe-math-vmu/packs/v5r-persona.js'
import { CHARTER_SECTIONS, CHARTER_BLOCKS, CHARTER_ROLE_BINDINGS, CHARTER_BINDINGS } from '../vibe-math-vmu/packs/v5r-charter.js'
import { createHash } from 'node:crypto'
import { mkdtempSync, rmSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

let passed = 0
let failed = 0
const failures = []
const ok = (cond, name, detail) => {
  if (cond) { passed += 1; console.log('  ok   ' + name) } else { failed += 1; failures.push(name); console.log('  FAIL ' + name + (detail === undefined ? '' : ' [' + JSON.stringify(detail).slice(0, 200) + ']')) }
}
const rejects = async (fn, code) => { try { await fn(); return { caught: false } } catch (e) { return { caught: true, code: e && e.code, message: String(e && e.message) } } }
const fence = (obj) => 'some prose first\n\n```json\n' + JSON.stringify(obj, null, 2) + '\n```\n'

const pipeline = () => createPromptPipeline({ sections: v5rPromptSections, clock: () => '2026-01-01T00:00:00.000Z' })
const mk = (extra = {}) => createTurnOrchestrator({ prompt: pipeline(), ...extra })

// ① assembly comes from the pipeline, and its absence is a NAMED refusal rather than self-composition
{
  const t = mk()
  const { turn } = t.open({ member: 'r-1', phase: 'normal', round: 3 })
  const asm = await t.assemble(turn)
  ok(asm.ok === true && typeof asm.text === 'string' && asm.text.length > 1000,
    'T1. ★★★ the turn text is ASSEMBLED BY THE PIPELINE (docs/26 stage 2)', { chars: asm.text && asm.text.length })
  ok(Array.isArray(asm.sources) && asm.sources.length > 0,
    'T2. ★★ and the assembly reports its provenance, so a turn can be snapshotted and compared', { sources: asm.sources.length })
  const a = await mk().assemble(mk().open({ member: 'r-1', phase: 'normal' }).turn)
  const b = await mk().assemble(mk().open({ member: 'r-1', phase: 'normal' }).turn)
  ok(a.text === b.text, 'T3. ★★★ assembly is DETERMINISTIC: the same turn spec yields byte-identical text')
}
{
  const bare = createTurnOrchestrator({})
  const { turn } = bare.open({ member: 'r-1', phase: 'normal' })
  const r = await rejects(() => bare.assemble(turn), 'VMU_ENGINE_UNAVAILABLE')
  ok(r.caught && r.code === 'VMU_ENGINE_UNAVAILABLE',
    'T4. ★★★ with no pipeline wired the loop REFUSES BY NAME and never composes text itself', { code: r.code })
  const d = await rejects(() => bare.deliver(turn, 'text'), 'VMU_ENGINE_UNAVAILABLE')
  ok(d.caught && d.code === 'VMU_ENGINE_UNAVAILABLE',
    'T5. ★★★ and with no delivery adapter it refuses rather than pretending the member answered', { code: d.code })
}

// ② parsing: three DIFFERENT failures get three DIFFERENT names
{
  const t = mk()
  const noFence = await rejects(() => t.parse('I could not decide anything.'), 'VMU_TURN_NO_FENCE')
  ok(noFence.caught && noFence.code === 'VMU_TURN_NO_FENCE', 'T6. ★★ a reply with no fence is refused as such', { code: noFence.code })
  const badJson = await rejects(() => t.parse('```json\n{ say: not json }\n```'), 'VMU_TURN_BAD_JSON')
  ok(badJson.caught && badJson.code === 'VMU_TURN_BAD_JSON', 'T7. ★★ malformed JSON is refused as a DIFFERENT failure', { code: badJson.code })
  const unknown = await rejects(() => t.parse(fence({ say: 'hi', invent_a_field: 1 })), 'VMU_TURN_UNKNOWN_FIELD')
  ok(unknown.caught && unknown.code === 'VMU_TURN_UNKNOWN_FIELD' && /invent_a_field/.test(unknown.message),
    'T8. ★★★ an unknown field is refused BY NAME - the loop never guesses what the model meant', { code: unknown.code })
  const good = t.parse(fence({ say: 'hello', verdict: true }))
  ok(good.ok === true && good.fields.length === 2, 'T9. ★ a well-formed reply parses and reports its fields', good.fields)
  ok(extractFence('x```json\n{a:1}\n```y') !== null, 'T10. ★ the fence extractor is exported and works on embedded text')
}

// ③ the plan gives every field exactly ONE owner, and the owners are real face names
{
  const owners = Object.values(FIELD_OWNERS)
  ok(owners.every((o) => /^vmu\.[a-z][a-z0-9]*$/.test(o.face) && typeof o.op === 'string' && o.op.length > 0),
    'T11. ★★ every catalogued field names a real-shaped face and an operation', { fields: FIELDS.length })
  const t = mk()
  const planned = t.plan({ say: 'a', verdict: true, task_create: { title: 'x' } })
  ok(planned.length === 3 && new Set(planned.map((p) => p.face)).size >= 2,
    'T12. ★★ the plan turns a reply into one dispatch per field, each with its owning face', planned.map((p) => p.face))
  ok(t.plan({ unknown: 1 }).length === 0, 'T13. ★ fields outside the catalogue never enter the plan')
}

// ④ dispatch reaches the owning face, and what it cannot reach is COUNTED rather than dropped
{
  const calls = []
  const faces = {
    'vmu.meetings': { speak: async (p) => { calls.push(['meetings.speak', p]); return { ok: true } } },
    'vmu.tasks': { create: async (p) => { calls.push(['tasks.create', p]); return { ok: true } } },
  }
  const t = createTurnOrchestrator({ prompt: pipeline(), faces })
  const out = await t.apply({ say: 'hello', task_create: { title: 'x' } })
  ok(out.ok === true && out.executed.length === 2 && calls.length === 2,
    'T14. ★★★ each field reaches the face that owns it, exactly once', { executed: out.executed.length })
  ok(calls.some((c) => c[0] === 'meetings.speak') && calls.some((c) => c[0] === 'tasks.create'),
    'T15. ★★ and they go to DIFFERENT faces, because ownership is one-to-one', calls.map((c) => c[0]))
  const half = await t.apply({ verdict: true })
  ok(half.skipped.length === 1 && half.skipped[0].reason === 'face-not-wired' && t.status().counts.notExecuted === 1,
    'T16. ★★★ a field whose face is NOT wired is reported and COUNTED - a half-installed host is visible, never silent',
    { skipped: half.skipped, counts: t.status().counts })
}

// ⑤ the whole loop in one call, through both seams
{
  const t = createTurnOrchestrator({
    prompt: pipeline(),
    deliver: async ({ turn }) => fence({ progress: 'worked on L1' }),
    faces: { 'vmu.records': { put: async () => ({ ok: true }) } },
  })
  const receipt = await t.run({ member: 'r-2', phase: 'normal', round: 4 })
  ok(receipt.ok === true && receipt.fields.length === 1 && receipt.executed.length === 1 && receipt.skipped.length === 0,
    'T17. ★★★ one call runs the WHOLE turn: open, assemble, deliver, parse, dispatch', { fields: receipt.fields })
  const st = t.status()
  ok(st.counts.opened === 1 && st.counts.assembled === 1 && st.counts.delivered === 1 && st.counts.parsed === 1 && st.counts.dispatched === 1,
    'T18. ★★ and the status surface counts every stage, including refusals', st.counts)
  const bad = await rejects(() => t.open({ member: 'r-2', phase: 'nope' }), 'VMU_INVALID_ARGUMENT')
  ok(bad.caught && t.status().lastRefusal.code === 'VMU_INVALID_ARGUMENT',
    'T19. ★ a bad phase is refused and the refusal is REMEMBERED on the status surface', { code: bad.code })
}


// 6) THE REAL WIRING: the table names real operations, and a field actually LANDS in kernel state
{
  const root = mkdtempSync(join(tmpdir(), 'vmu-turn-'))
  const kernel = createKernel({ settings: {}, root, host: null })
  const faces = facesFrom(kernel)
  ok(Object.keys(faces).length >= 4 && Object.values(faces).every((m) => Object.values(m).every((f) => typeof f === 'function')),
    'T20. * facesFrom builds the face map from a REAL kernel: every catalogued operation resolves to a bound function',
    { faces: Object.keys(faces) })
  const listed = kernel.tasks.list()
  const before = Array.isArray(listed) ? listed.length : ((listed && listed.tasks) || []).length
  const t = createTurnOrchestrator({ prompt: pipeline(), faces })
  const out = await t.apply({ task_create: { title: 'via the turn loop' } })
  const listed2 = kernel.tasks.list()
  const after = Array.isArray(listed2) ? listed2.length : ((listed2 && listed2.tasks) || []).length
  ok(out.ok === true && out.executed.length === 1 && after === before + 1,
    'T21. **** END TO END: a task_create field in a parsed reply becomes a REAL task in the kernel task ledger - the loop lands state, it does not just report success',
    { before, after, executed: out.executed.length })
  const overridden = resolveOwners({ task_create: { face: 'vmu.tasks', op: 'list' } })
  ok(FIELD_OWNERS.task_create.op === 'create' && overridden.task_create.op === 'list' && overridden.verdict.op === 'cast',
    'T22. *** the ownership table is CONFIGURABLE: a caller binding wins per field while the declared default stays intact',
    { defaultOp: FIELD_OWNERS.task_create.op, overrideOp: overridden.task_create.op })
  const custom = createTurnOrchestrator({ prompt: pipeline(), bindings: { progress: { face: 'vmu.records', op: 'list' } } })
  ok(custom.status().fields === FIELDS.length && custom.status().owners.progress.op === 'list',
    'T23. * and the orchestrator reports the binding table it is actually using, so a half-configured host is visible')
  rmSync(root, { recursive: true, force: true })
}

// 7) THE LOOP AS A SERVICE: a kernel built with only settings, root and a host seam can run a whole turn
{
  const root = mkdtempSync(join(tmpdir(), 'vmu-turn-svc-'))
  const host = { deliverTurn: async () => '```json\n' + JSON.stringify({ task_create: { title: 'from the host seam' } }) + '\n```' }
  const kernel = createKernel({ settings: {}, root, host })
  ok(typeof kernel.turn === 'object' && typeof kernel.turn.run === 'function' && kernel.turn.status().fields === FIELDS.length,
    'T24. **** the loop is a REGISTERED SERVICE: a kernel built with only settings, root and a host exposes kernel.turn with the whole catalogue',
    { services: Object.keys(kernel).length, fields: kernel.turn && kernel.turn.status().fields })
  const before = (kernel.tasks.list() || []).length
  const receipt = await kernel.turn.run({ member: 'r-1', phase: 'normal' })
  const after = (kernel.tasks.list() || []).length
  ok(receipt.ok === true && receipt.fields.length === 1 && receipt.executed.length === 1 && after === before + 1,
    'T25. **** END TO END THROUGH THE SERVICE: one run call assembles from the pipeline, delivers through the HOST seam, parses, dispatches, and the task ledger grows by one - no original preset involved',
    { fields: receipt.fields, before, after })
  const noHost = createKernel({ settings: {}, root, host: null })
  const refused = await rejects(() => noHost.turn.run({ member: 'r-1', phase: 'normal' }), 'VMU_ENGINE_UNAVAILABLE')
  ok(refused.caught && refused.code === 'VMU_ENGINE_UNAVAILABLE',
    'T26. **** and with NO host delivery seam the service refuses by name rather than pretending a member answered', { code: refused.code })
  ok(noHost.turn.status().counts.refused >= 1,
    'T27. * the refusal is counted on the service status surface, so a host that cannot deliver is visible')
  rmSync(root, { recursive: true, force: true })
}

// 8) DECLARATION INSTEAD OF HAND-PASSING: the pack declares its sections and the assembly collects them
{
  const declared = collectPackSections([PACK])
  ok(Array.isArray(declared) && declared.length === v5rTurnSections.length + 11 && declared.length >= 79,
    'T28. **** the pack DECLARES its prompt sections and a pure collector gathers them - 68 sections with no hand-passing',
    { declared: declared.length })
  const loopDeclared = createTurnOrchestrator({ prompt: createPromptPipeline({ sections: declared, clock: () => '2026-01-01T00:00:00.000Z' }) })
  const d1 = await loopDeclared.assemble(loopDeclared.open({ member: 'r-1', role: 'researcher', phase: 'founding' }).turn)
  const d2 = await loopDeclared.assemble(loopDeclared.open({ member: 'acad', role: 'academician', phase: 'founding' }).turn)
  ok(d1.ok === true && d1.text !== d2.text && d1.text.includes('{{') === false,
    'T29. **** ASSEMBLED FROM THE DECLARATION ALONE: two members still get different text, no placeholder left',
    { chars: [d1.text.length, d2.text.length], differ: d1.text !== d2.text })
  let malformed = null
  try { collectPackSections([{ id: 'x', sections: [{ name: 'Not Kebab' }] }]) } catch (e) { malformed = e }
  ok(malformed !== null && malformed.code === 'VMU_PACK_INVALID',
    'T30. *** a malformed declaration is refused by name rather than skipped', { code: malformed && malformed.code })
  let collision = null
  try { collectPackSections([{ id: 'a', sections: [{ name: 'dup' }] }, { id: 'b', sections: [{ name: 'dup' }] }]) } catch (e) { collision = e }
  ok(collision !== null && collision.code === 'VMU_PACK_CONFLICT',
    'T31. *** and two packs claiming one section name is a CONFLICT, never resolved silently', { code: collision && collision.code })
}

// 9) PHASES: the assembled turn must vary with the phase, because the role section carries {{ phase }} - which is how
// a two-sided comparison can be extended beyond founding without inventing per-phase texts.
{
  const loopP = createTurnOrchestrator({ prompt: createPromptPipeline({ sections: collectPackSections([PACK]), clock: () => '2026-01-01T00:00:00.000Z' }) })
  const phases = ['founding', 'normal', 'verify']
  const texts = []
  for (const phase of phases) {
    const out = await loopP.assemble(loopP.open({ member: 'r-1', role: 'researcher', phase }).turn)
    texts.push(out.text)
    ok(out.ok === true && out.text.includes('阶段：' + phase),
      'T32. *** the assembled turn for phase ' + phase + ' NAMES that phase - the section is phase-sensitive without a text per phase')
  }
  ok(new Set(texts).size === phases.length,
    'T33. **** THREE PHASES, THREE DIFFERENT TEXTS: the framework turn is phase-aware, which is what lets the comparison against the original cover more than the founding round',
    { chars: texts.map((t) => t.length) })
  const same = await loopP.assemble(loopP.open({ member: 'r-1', role: 'researcher', phase: 'verify' }).turn)
  ok(same.text === texts[2],
    'T34. *** and the same phase assembles to identical bytes, so a phase comparison is reproducible')
}
// 10) THE HOST BRIDGE: a host with a subagent seam hands it to the loop in one line, and the loop really runs
{
  const seen = []
  const fakeSeam = {
    async startContinuable(spec) {
      seen.push(spec)
      return { handle: 'h-1', reply: '```json\n' + JSON.stringify({ task_create: { title: 'via the host bridge' } }) + '\n```' }
    },
  }
  const bridge = deliverViaSubagents(fakeSeam)
  ok(typeof bridge === 'function', 'T35. *** the bridge turns a subagent seam into a delivery adapter in one line')
  const root2 = mkdtempSync(join(tmpdir(), 'vmu-turn-bridge-'))
  const kernel2 = createKernel({ settings: {}, root: root2, host: null })
  const loop2 = createTurnOrchestrator({ prompt: createPromptPipeline({ sections: collectPackSections([PACK]) }), faces: facesFrom(kernel2), deliver: bridge })
  const before2 = (kernel2.tasks.list() || []).length
  const run2 = await loop2.run({ member: 'r-1', role: 'researcher', phase: 'normal' })
  const after2 = (kernel2.tasks.list() || []).length
  ok(run2.ok === true && after2 === before2 + 1 && seen.length === 1,
    'T36. **** A WHOLE TURN THROUGH THE HOST SEAM: the loop assembles, the bridge delivers, the reply parses, and the task ledger grows - a host needs one line to run an institute turn',
    { delivered: seen.length, before: before2, after: after2 })
  ok(seen[0] && seen[0].label === 'vmu-turn-' + run2.turn.id && typeof seen[0].request.prompt[0].text === 'string' && seen[0].request.prompt[0].text.length > 1000,
    'T37. **** and what reached the seam is the ASSEMBLED text, labelled with the turn it belongs to',
    { label: seen[0] && seen[0].label, chars: seen[0] && seen[0].request.prompt[0].text.length })
  // ROUND 346: the delivery spec carries the SAME three elements the original's wake takes ({ to, why, next_step }),
  // because a host handed only "some text" cannot supervise the turn it just started.
  const wake = createTurnOrchestrator({ prompt: createPromptPipeline({ sections: collectPackSections([PACK]) }), faces: facesFrom(kernel2), deliver: bridge })
  const opened = wake.open({ member: 'r-2', role: 'researcher', phase: 'normal', why: 'the lemma is open', nextStep: 'close it' })
  ok(opened.turn.why === 'the lemma is open' && opened.turn.nextStep === 'close it' && opened.turn.member === 'r-2',
    'T40. **** a turn records WHO, WHY and WHAT NEXT together - the three elements the original wake carries',
    { member: opened.turn.member, why: opened.turn.why, nextStep: opened.turn.nextStep })
  const seen2 = []
  const seam2 = { async startContinuable(spec) { seen2.push(spec); return { reply: '```json\n{}\n```' } } }
  await deliverViaSubagents(seam2)({ turn: opened.turn, text: 'x' })
  const keys = Object.keys(seen2[0] || {}).sort()
  ok(keys.includes('to') && keys.includes('why') && keys.includes('next_step') && seen2[0].to === 'r-2',
    'T41. **** and the host SEES them: the delivery spec names the member, the reason and the next step, so supervision does not depend on reading the prompt text',
    { keys, to: seen2[0] && seen2[0].to })
  ok(JSON.stringify(keys) === JSON.stringify(['label', 'next_step', 'request', 'to', 'why']),
    'T42. **** PROPERTY: the spec key set is exactly what the original wake takes plus the trace label - the two sides wake a member with the same information',
    { keys })
  let noSeam = null
  try { deliverViaSubagents(null) } catch (e) { noSeam = e }
  ok(noSeam !== null && noSeam.code === 'VMU_ENGINE_UNAVAILABLE',
    'T38. *** a host with no subagent seam is refused by name rather than silently undelivered', { code: noSeam && noSeam.code })
  let noReply = null
  const silent = deliverViaSubagents({ async startContinuable() { return { handle: 'h-2' } } })
  try { await silent({ turn: { id: 't-x' }, text: 'x' }) } catch (e) { noReply = e }
  ok(noReply !== null && noReply.code === 'VMU_ENGINE_UNAVAILABLE',
    'T39. *** and a host that accepts the turn but hands back NO reply is a named failure, never parsed as an empty answer', { code: noReply && noReply.code })
  rmSync(root2, { recursive: true, force: true })
}

// 11) MULTI-ROUND: the framework chooses who is woken next, by a DECLARED policy, and can drive several rounds
{
  const roster = [{ id: 'acad', role: 'academician' }, { id: 'r-1', role: 'researcher' }, { id: 'r-2', role: 'researcher' }]
  const mkLoop = (policy) => createTurnOrchestrator({ prompt: createPromptPipeline({ sections: collectPackSections([PACK]) }), wakeupPolicy: policy })
  const rr = mkLoop('round-robin')
  const rrOrder = []
  for (let i = 0; i < 4; i += 1) { const s = rr.nextTurn({ members: roster, phase: 'normal' }); rrOrder.push(s.member); rr.open({ member: s.member, phase: 'normal' }) }
  ok(rrOrder.join(',') === 'acad,r-1,r-2,acad',
    'T43. **** round-robin wakes the roster in ORDER and cycles - positional, so every member gets a turn before anyone repeats',
    { order: rrOrder })
  const lr = mkLoop('least-recent')
  lr.open({ member: 'acad', phase: 'normal' })
  lr.open({ member: 'acad', phase: 'normal' })
  const lrPick = lr.nextTurn({ members: roster, phase: 'normal' })
  ok(lrPick.member !== 'acad',
    'T44. **** least-recent DIVERGES once the counts do: after the academician is woken twice, someone else is chosen - this is what makes the two policies different, and the earlier runs only agreed because everyone had been woken once',
    { pick: lrPick.member, woken: lr.status().woken })
  const empty = mkLoop('round-robin')
  ok(empty.nextTurn({ members: [] }) === null,
    'T45. **** nobody to wake is a LEGAL state (null), never an invented member and never a failure')
  let unbounded = null
  try { await empty.drive({ members: roster, rounds: 0 }) } catch (e) { unbounded = e }
  ok(unbounded !== null && unbounded.code === 'VMU_INVALID_ARGUMENT',
    'T46. **** and the bound is EXPLICIT: rounds must be a positive integer, because there is no unlimited default', { code: unbounded && unbounded.code })
  const policyFromSettings = createKernel({ settings: { 'vmu.turn.wakeupPolicy': 'least-recent' }, root: null, host: null })
  ok(policyFromSettings.turn.status().policy === 'least-recent',
    'T47. **** THE POLICY IS A SETTING: a kernel told least-recent reports it, so a profile changes who gets woken without touching code',
    { policy: policyFromSettings.turn.status().policy })
  const defaulted = createKernel({ settings: {}, root: null, host: null })
  ok(defaulted.turn.status().policy === 'round-robin',
    'T48. *** and with nothing declared the default is round-robin, which is the zero-configuration behaviour')
}
// 12) THE TICK SEAM: a host ticks, the framework decides everything else - who by policy, what prompt by pipeline
{
  const root3 = mkdtempSync(join(tmpdir(), 'vmu-turn-tick-'))
  const kernel3 = createKernel({ settings: {}, root: root3, host: null })
  let n = 0
  const tickDeliver = async () => '```json\n' + JSON.stringify({ task_create: { title: 'round ' + (n += 1) } }) + '\n```'
  const loop3 = createTurnOrchestrator({ prompt: createPromptPipeline({ sections: collectPackSections([PACK]) }), faces: facesFrom(kernel3), deliver: tickDeliver })
  const roster = [{ id: 'acad', role: 'academician' }, { id: 'r-1', role: 'researcher' }, { id: 'r-2', role: 'researcher' }]
  const before3 = (kernel3.tasks.list() || []).length
  const ticks = []
  for (let i = 0; i < 3; i += 1) ticks.push(await loop3.step({ members: roster, phase: 'normal', why: 'tick', nextStep: 'keep going' }))
  const after3 = (kernel3.tasks.list() || []).length
  ok(ticks.every((t) => t.ok === true && t.receipt) && after3 === before3 + 3,
    'T49. **** A HOST TICKS, THE FRAMEWORK RUNS: three step calls produced three real rounds, each landing in the task ledger, with the member chosen by the policy',
    { members: ticks.map((t) => t.receipt && t.receipt.member), before: before3, after: after3 })
  ok(ticks[0].receipt.member === 'acad' && ticks[1].receipt.member === 'r-1' && ticks[2].receipt.member === 'r-2',
    'T50. **** and the THREE QUESTIONS now have three owners: WHEN is the host tick (the clock is a seam by design), WHO is the declared policy, and WHAT PROMPT is the pipeline - none of them left to the host to compose',
    { order: ticks.map((t) => t.receipt && t.receipt.member) })
  const bad = await loop3.step({ members: roster, phase: 'not-a-phase' })
  ok(bad.ok === false && bad.code === 'VMU_INVALID_ARGUMENT' && bad.receipt === null,
    'T51. **** a failed round is RETURNED with its code rather than thrown, because a failed round is an operational outcome - while a malformed ARGUMENT still throws',
    { code: bad.code })
  const st = loop3.status()
  ok(typeof st.woken === 'object' && Object.keys(st.woken).length >= 3 && st.counts.opened >= 3,
    'T52. *** the loop counts who it woke and how often, so a multi-round run is auditable from its own status surface',
    { woken: st.woken, opened: st.counts.opened })
  rmSync(root3, { recursive: true, force: true })
}
// 13) THE ENTRY POINT: a host session can actually run a round, and the tool is declared like every other face
{
  const root4 = mkdtempSync(join(tmpdir(), 'vmu-turn-tool-'))
  const kernel4 = createKernel({ settings: {}, root: root4, host: null })
  const off = toolSpecs({ kernel: kernel4, settings: {}, turnTool: false })
  ok(!off.some((s) => s.name === 'vibe_vmu_turn'),
    'T53. *** with nothing declared the turn tool is NOT offered - the preset still registers exactly one tool (zero mechanism)')
  const on = toolSpecs({ kernel: kernel4, settings: {}, turnTool: true })
  const spec = on.find((s) => s.name === 'vibe_vmu_turn')
  ok(spec && typeof spec.execute === 'function' && spec.parameters && spec.parameters.properties.op,
    'T54. **** and when the configuration declares it, the tool exists with its parameters - the loop is reachable from a session, not only from a test',
    { names: on.map((s) => s.name).slice(0, 6) })
  const st = JSON.parse(await spec.execute({ op: 'status' }))
  ok(st.ok === true && st.status && st.status.policy === 'round-robin',
    'T55. **** THE TOOL REACHES THE LOOP: asking for status returns the loop own surface, policy included', { policy: st.status && st.status.policy })
  ok(typeof (await spec.execute({ op: 'status' })) === 'string',
    'T55b. *** and it answers with a JSON STRING like every other face, so a host never has to know which tool speaks which type')
  const stepOut = JSON.parse(await spec.execute({ op: 'step', members: [{ id: 'r-1', role: 'researcher' }], phase: 'normal' }))
  ok(stepOut.ok === false && stepOut.code === 'VMU_ENGINE_UNAVAILABLE',
    'T56. **** and a round with NO delivery seam comes back as a returned refusal, so a host that cannot deliver is told rather than quietly getting a half-run',
    { code: stepOut.code })
  const badOp = JSON.parse(await spec.execute({ op: 'nope' }))
  ok(badOp.ok === false && badOp.code === 'VMU_INVALID_ARGUMENT',
    'T57. *** an unknown op is refused by name and the known ones are listed', { code: badOp.code })
  const empty = JSON.parse(await spec.execute({ op: 'step', members: [] }))
  ok(empty.ok === true && empty.stopped === 'no-members',
    'T58. *** and nobody to wake is still a LEGAL no-op through the tool, not an error')
  rmSync(root4, { recursive: true, force: true })
}
// 14) CONTROL: the assembled turn text is changeable through settings AND through the live override API, and the
// pipeline still does the assembling - which is the clause the objective states and nothing had yet proved.
{
  const sections = collectPackSections([PACK])
  const TARGET = 'v5r-role-block'
  const SPEC = '__CONTROLLED_BY_SETTINGS__'

  // (a) declared in SETTINGS: no code change, the next assembly obeys it
  const viaSettings = createPromptPipeline({ sections, clock: () => '2026-01-01T00:00:00.000Z',
    settings: { 'vmu.prompts.overrides': { [TARGET]: SPEC } } })
  const svc = createTurnOrchestrator({ prompt: viaSettings })
  const outSettings = await svc.assemble(svc.open({ member: 'r-1', role: 'researcher', phase: 'normal' }).turn)
  ok(outSettings.ok === true && outSettings.text.includes(SPEC) && outSettings.text.includes('【本轮面向的成员】') === false,
    'T59. **** SETTINGS CONTROL THE TEXT: a declared override replaces the section and the assembled turn obeys it - no code change, still assembled by the pipeline',
    { hasSpec: outSettings.text.includes(SPEC) })

  // (b) the same thing at RUNTIME, and reversible
  const live = createPromptPipeline({ sections, clock: () => '2026-01-01T00:00:00.000Z' })
  const lv = createTurnOrchestrator({ prompt: live })
  const before = await lv.assemble(lv.open({ member: 'r-1', role: 'researcher', phase: 'normal' }).turn)
  const changed = live.override(TARGET, SPEC, 'office')
  const after = await lv.assemble(lv.open({ member: 'r-1', role: 'researcher', phase: 'normal' }).turn)
  ok(changed.ok === true && changed.rollbackable === true && after.text.includes(SPEC) && before.text.includes(SPEC) === false,
    'T60. **** and RUNTIME CONTROL works the same way, with the previous text handed back so the change can be undone',
    { rollbackable: changed.rollbackable })
  live.rollback(TARGET, changed.previous)
  const rolled = await lv.assemble(lv.open({ member: 'r-1', role: 'researcher', phase: 'normal' }).turn)
  ok(rolled.text === before.text,
    'T61. **** ROLLBACK restores the assembly byte for byte, so tuning a prompt is not a one-way door')

  // (c) control is PERMISSIONED, not open to anyone
  let forbidden = null
  try { live.override(TARGET, SPEC, 'r-9') } catch (e) { forbidden = e }
  ok(forbidden !== null && forbidden.code === 'VMU_NOT_PERMITTED',
    'T62. **** and CHANGING THE TEXT IS PERMISSIONED: an identity outside whoMayOverride is refused by name', { code: forbidden && forbidden.code })
}

// 15) THE PERSONA (docs/26 section 3.7): the six-thousand-character charter the original composes, carried as
// SECTIONS by the pack and assembled per member - with the capture hash checked here so drift fails the gate.
{
  const declaredP = collectPackSections([PACK])
  const personaSections = declaredP.filter((s) => String(s.name).startsWith('v5r-persona-'))
  ok(personaSections.length === 11,
    'T63. **** the pack DECLARES the whole persona: eleven sections, six shared and five that vary by role or name the member',
    { personaSections: personaSections.length, all: declaredP.length })
  const loopP = createTurnOrchestrator({ prompt: createPromptPipeline({ sections: declaredP, bindings: PACK.bindings, clock: () => '2026-01-01T00:00:00.000Z' }) })
  const acadAsm = await loopP.assemble(loopP.open({ member: 'acad', role: 'academician', phase: 'founding' }).turn)
  const resAsm = await loopP.assemble(loopP.open({ member: 'r-1', role: 'researcher', phase: 'founding' }).turn)
  ok(acadAsm.text.includes('通用规章') && acadAsm.text.includes('表决与定论') && acadAsm.text.includes('{{') === false,
    'T64. **** THE ASSEMBLED TURN CARRIES THE CHARTER, titles included and every placeholder filled - the persona is assembled, not appended as a blob',
    { chars: acadAsm.text.length })
  ok(acadAsm.text.includes('作为院士，你对本所的组织与推进负总责') && resAsm.text.includes('本所是自组织的，但**不是没有组织**') && acadAsm.text !== resAsm.text,
    'T65. **** AND THE RIGHT CHARTER REACHES THE RIGHT MEMBER: the academician sees the academician duties and the researcher sees the researcher ones, through role bindings rather than two hard-coded texts',
    { acad: acadAsm.text.length, researcher: resAsm.text.length })
  const rawP = readFileSync(new URL('../prompt-corpus-v5/persona-corpus-v5.json', import.meta.url))
  const shaP = createHash('sha256').update(rawP).digest('hex')
  ok(PERSONA_SOURCE_SHA256 === shaP,
    'T66. **** and the module RECORDS the capture hash, so a drift between the pack and the capture is a gate failure rather than a silent difference',
    { recorded: PERSONA_SOURCE_SHA256.slice(0, 12), onDisk: shaP.slice(0, 12) })
}

// 16) THE CHARTER, REBUILT FROM THE ORIGINAL SOURCE (docs/26 section 3.10). The fragments are transcribed from
// `charterFor` rather than inferred from captured output, so the parity check is: every fixed prose line of every
// source-derived fragment must appear VERBATIM in the charter the original really hands that kind of member.
{
  ok(CHARTER_SECTIONS.length >= 17 && CHARTER_ROLE_BINDINGS.length >= 15,
    'T70. **** the charter is declared as source-derived sections with role bindings for the three member kinds',
    { sections: CHARTER_SECTIONS.length, bindings: CHARTER_ROLE_BINDINGS.length })
  const corpusC = JSON.parse(readFileSync(new URL('../prompt-corpus-v5/persona-corpus-v5.json', import.meta.url), 'utf8'))
  // The capture split AT the heading, so the body alone has no title; the source DOES push the title, so the
  // baseline is reconstructed the same way the persona generator does it. Without this the comparison would
  // blame the port for a heading the capture simply stores in another field.
  const originalOf = (id) => corpusC.roles[id].blocks.map((x) => {
    const m = /^s([一二三四五六七八九十]+)$/.exec(x.key)
    return (m ? '【' + m[1] + '、' + x.heading + '】\n' : '') + x.text
  }).join('\n')
  const acadOrig = originalOf('acad')
  const resOrig = originalOf('r-1')
  let total = 0
  const missing = []
  // Scope: the CHARTER blocks are checked against the persona the original really hands out. The reply spec is
  // deliberately EXCLUDED because measuring showed the captured prompt corpus does NOT contain it - only its opening
  // sentence and vote_solved appear - so there is no capture-side baseline for it. That gap is recorded in docs/26
  // section 3.12 rather than papered over with a weaker check.
  // The persona capture is the baseline for the CHARTER axis only. The per-turn pieces - the reply spec, the turn
  // heading and ask, the brief - belong to the PROMPT axis, and measuring showed the captured prompt corpus does
  // not even contain the reply catalogue. Scoping by axis is stated here rather than loosening the comparison.
  const PROMPT_AXIS_PREFIXES = ['v5r-reply-', 'v5r-turn-', 'v5r-brief-']
  for (const b of CHARTER_BLOCKS.filter((x) => !PROMPT_AXIS_PREFIXES.some((p) => String(x.name).startsWith(p)))) {
    const pairs = b.kind === 'shared' ? [['shared', b.texts.shared, acadOrig], ['shared', b.texts.shared, resOrig]]
      : (b.kind === 'role' ? [['academician', b.texts.academician, acadOrig], ['researcher', b.texts.researcher, resOrig]]
        : [['with-leader', b.texts['with-leader'], acadOrig]])
    for (const [variant, raw, source] of pairs) {
      if (!raw) continue
      for (const line of raw.split('\n').map((l) => l.trim()).filter((l) => l.length > 18 && !l.includes('{{'))) {
        total += 1
        if (!source.includes(line)) missing.push(b.name + '/' + variant + ': ' + line.slice(0, 40))
      }
    }
  }
  ok(total > 30 && missing.length === 0,
    'T71. **** PARITY WITH THE SOURCE: every fixed prose line of the source-derived charter appears verbatim in the charter the original really hands a member',
    { checked: total, missing: missing.slice(0, 3) })
  const loopC = createTurnOrchestrator({ prompt: createPromptPipeline({ sections: CHARTER_SECTIONS, bindings: CHARTER_ROLE_BINDINGS, clock: () => '2026-01-01T00:00:00.000Z' }) })
  const asmC = await loopC.assemble(loopC.open({ member: 'acad', role: 'academician', phase: 'founding', roster: 'acad、r-1', quorum: 2, round: 1 }).turn)
  ok(asmC.ok === true && asmC.text.includes('【二、通用规章（全员必读）】') && asmC.text.includes('【一、所内编制与你的同事】') && asmC.text.includes('{{') === false,
    'T72. **** and the ASSEMBLY produces the charter from those sections, in source order, with every placeholder filled',
    { chars: asmC.text.length })
}

// 17) THE PER-ROUND BRIEF (docs/26 section 3.11). The source's briefBlock builds a compact data block whose lines
// the loop composes from the kernel's own state; the pack only PLACES it. The format is asserted literally against
// the source's own line shape, so the brief cannot drift into a different dialect.
{
  const status = [
    '[状态] 你是 r-2（常驻研究员）｜轮次 7｜法定票数 m=3｜有表决权者 3 人',
    '[在册] acad、r-1、r-2',
    '[未就位] t-9（provisioning）',
    '[形式化] 鼓励 Lean｜已通过 2｜已记录阻塞 1',
    '[任务板] 进行中 1｜可认领 2｜我负责 t-1「probe」',
    '[新到的消息/通知]',
    '  from acad: please look at lemma 3',
  ].join('\n')
  const loopB = createTurnOrchestrator({ prompt: createPromptPipeline({ sections: CHARTER_SECTIONS, bindings: CHARTER_ROLE_BINDINGS, clock: () => '2026-01-01T00:00:00.000Z' }) })
  const asmB = await loopB.assemble(loopB.open({ member: 'r-2', role: 'researcher', phase: 'normal', roster: 'acad、r-1、r-2', quorum: 3, statusBlock: status, round: 7 }).turn)
  ok(asmB.ok === true && asmB.text.includes(status),
    'T73. **** THE PER-ROUND BRIEF reaches the prompt intact: the state line, the roster, the members not yet on the floor, the formalisation knob, the task board and the mail all arrive as the source formats them',
    { chars: asmB.text.length })
  ok(asmB.text.includes('[状态] 你是 r-2（常驻研究员）｜轮次 7｜法定票数 m=3｜有表决权者 3 人') && asmB.text.includes('[未就位] ') && asmB.text.includes('[形式化] '),
    'T74. **** and the LINE SHAPE matches the source: identity and kind in brackets, the round, the quorum and the voter count, plus the not-yet-seated line the source says must never be omitted silently',
    { statusLine: true })
}

// 18) THE REPLY SPEC (docs/26 section 3.12): the field catalogue that closes the loop, transcribed from `replySpec`.
// The source's two hard-won rules are asserted literally: the catalogue SAYS it is not valid JSON while demanding a
// valid object, and it ends with a strictly valid minimal sample so a model never has to guess.
{
  const loopRp = createTurnOrchestrator({ prompt: createPromptPipeline({ sections: CHARTER_SECTIONS, bindings: CHARTER_ROLE_BINDINGS, clock: () => '2026-01-01T00:00:00.000Z' }) })
  const asmRp = await loopRp.assemble(loopRp.open({ member: 'r-2', role: 'researcher', phase: 'normal', round: 3 }).turn)
  ok(asmRp.ok === true && asmRp.text.includes('字段目录') && asmRp.text.includes('因此这一段并非合法 JSON') && asmRp.text.includes('你真正要输出的对象必须严格合法'),
    'T75. **** the catalogue arrives AND admits it is not JSON while demanding a valid object - the contradiction is stated instead of left for a model to guess',
    { chars: asmRp.text.length })
  ok(asmRp.text.includes('最小合法样例') && asmRp.text.includes('{"say":"…","progress":"…","solved":false,"contextPct":40}') && asmRp.text.includes('"vote_solved": true|false'),
    'T76. **** and it ends with a STRICTLY VALID minimal sample, with the unanimity rule stated right next to vote_solved and the authority matrix next to fire',
    { sample: true })
  ok(asmRp.text.includes('常驻研究员只能由所办解聘') && asmRp.text.includes('只要有一位有表决权者没有填 true'),
    'T77. **** the two corrections the source records are carried verbatim: the firing authority matrix and what a partial yes does',
    { corrected: true })
}

// 19) THE PER-TURN HEADING AND ASK BY PHASE (docs/26 section 3.13): every prompt in the source is one eight-part
// sequence whose first two parts differ by phase, so they are PHASE bindings rather than code branches.
{
  const loopPh = createTurnOrchestrator({ prompt: createPromptPipeline({ sections: CHARTER_SECTIONS, bindings: CHARTER_BINDINGS, clock: () => '2026-01-01T00:00:00.000Z' }) })
  const asmF = await loopPh.assemble(loopPh.open({ member: 'r-1', role: 'researcher', phase: 'founding', round: 1 }).turn)
  const asmN = await loopPh.assemble(loopPh.open({ member: 'r-1', role: 'researcher', phase: 'normal', round: 7 }).turn)
  const asmC = await loopPh.assemble(loopPh.open({ member: 'acad', role: 'academician', phase: 'checkpoint', round: 9 }).turn)
  ok(asmF.text.includes('【入职首轮 —— 常驻研究员 r-1】') && asmF.text.includes('你刚刚加入本所。请你先**独立**想清楚'),
    'T78. **** the FOUNDING phase assembles its own heading and its own ask, with the human role name from roleLabel rather than the binding key',
    { heading: 'founding' })
  ok(asmN.text.includes('【第 7 轮 —— 常驻研究员 r-1】') && asmN.text.includes('请推进你的研究'),
    'T79. **** and the NORMAL phase announces the round the RUN supplies and asks for research rather than induction',
    { heading: 'normal' })
  ok(asmC.text.includes('【心跳检查 —— 院士 acad】') && asmC.text.includes('所内一段时间没有新进展了') && asmC.text.includes('【入职首轮') === false,
    'T80. **** and the CHECKPOINT phase gets the heartbeat heading and its own ask, with the founding heading absent - the bindings really select',
    { heading: 'checkpoint' })
}
console.log('=== VMU TURN: ' + passed + ' passed, ' + failed + ' failed ===')
for (const f of failures) console.log('  FAIL ' + f)
process.exit(failed === 0 ? 0 : 1)

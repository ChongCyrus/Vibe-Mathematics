import { decideSections as DECIDE_SECTIONS } from '../vibe-math-vmu/packs/v5r/middleware/prompt-switches.js'
import { RECORDED_FIELDS } from '../vibe-math-vmu/kernel/turn/index.js'
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
import { v5rPromptSections, v5rTurnSections } from '../vibe-math-vmu/packs/v5r/prompts/v5r-core.js'
import { createKernel } from '../vibe-math-vmu/kernel/index.js'
import { collectPackSections } from '../vibe-math-vmu/kernel/pack.js'
import { PACK } from '../vibe-math-vmu/packs/v5r/prompts/v5r-core.js'
import { toolSpecs } from '../vibe-math-vmu/host.js'
import { makeTurnSpec } from '../vibe-math-vmu/tools/turn.js'
import { SOURCE_SHA256 as PERSONA_SOURCE_SHA256 } from '../vibe-math-vmu/packs/v5r/prompts/v5r-persona.js'
import { CHARTER_SECTIONS, CHARTER_BLOCKS, CHARTER_ROLE_BINDINGS, CHARTER_BINDINGS } from '../vibe-math-vmu/packs/v5r/prompts/v5r-charter.js'
import { v5rRoleSection as V5R_ROLE_SECTION } from '../vibe-math-vmu/packs/v5r/prompts/v5r-core.js'
const V5R_ROLE_SECTION_VARS = V5R_ROLE_SECTION.vars
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
const mk = (extra = {}) => createTurnOrchestrator({ sectionPolicy: DECIDE_SECTIONS, prompt: pipeline(), ...extra })

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
// ★ PHASE 9 / round 7: `why` is the per-turn instruction; it used to live only on the turn object/host wake spec.
{
  const t = mk()
  const { turn } = t.open({ member: 'r-1', phase: 'normal', why: '本回合只调用一次 wait，不要做别的' })
  const asm = await t.assemble(turn)
  ok(asm.instructionDelivered === true && /【本轮指令】/.test(asm.text) && /只调用一次 wait/.test(asm.text),
    'T3b. ★ 正：step 的 why 进入成员提示词（【本轮指令】+ instructionDelivered:true）', { delivered: asm.instructionDelivered })
  const plain = mk().open({ member: 'r-1', phase: 'normal' })
  const asm2 = await mk().assemble(plain.turn)
  ok(asm2.instructionDelivered === false && !/【本轮指令】/.test(asm2.text),
    'T3c. ★ 反：没有 why 的回合不追加空指令块（instructionDelivered:false）', { delivered: asm2.instructionDelivered })
}
{
  const bare = createTurnOrchestrator({ sectionPolicy: DECIDE_SECTIONS,})
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
  const t = mk({ settings: { 'vmu.turn.unknownReplyFieldMode': 'refuse' } })
  const noFence = await rejects(() => t.parse('I could not decide anything.'), 'VMU_TURN_NO_FENCE')
  ok(noFence.caught && noFence.code === 'VMU_TURN_NO_FENCE', 'T6. ★★ a reply with no fence is refused as such', { code: noFence.code })
  const badJson = await rejects(() => t.parse('```json\n{ say: not json }\n```'), 'VMU_TURN_BAD_JSON')
  ok(badJson.caught && badJson.code === 'VMU_TURN_BAD_JSON', 'T7. ★★ malformed JSON is refused as a DIFFERENT failure', { code: badJson.code })
  const unknown = await rejects(() => t.parse(fence({ say: 'hi', invent_a_field: 1 })), 'VMU_TURN_UNKNOWN_FIELD')
  ok(unknown.caught && unknown.code === 'VMU_TURN_UNKNOWN_FIELD' && /invent_a_field/.test(unknown.message),
    'T8. ★★★ an unknown field is refused BY NAME - the loop never guesses what the model meant', { code: unknown.code })
  const good = t.parse(fence({ say: 'hello', verdict: true }))
  ok(good.ok === true && good.fields.length === 2, 'T9. ★ a well-formed reply parses and reports its fields', good.fields)
}
// ★ PHASE 7 round 15: unknownReplyFieldMode — ignore-named reports (never silently drops), refuse keeps the old gate.
{
  const loose = mk()   // default = ignore-named
  const parsed = loose.parse(fence({ say: 'hi', note: 'extra', solved: true }))
  ok(parsed.ok === true && Array.isArray(parsed.ignoredFields) && parsed.ignoredFields.join(',') === 'note',
    '★ 正（ignore-named）：带 note 的回执解析成功、已知字段保留、ignoredFields=[note]', { fields: parsed.fields, ignored: parsed.ignoredFields })
  ok(parsed.reply.say === 'hi' && parsed.reply.ignoredFields && parsed.reply.ignoredFields[0] === 'note',
    '★ 正：已知字段真的在 reply 里，ignoredFields 也挂在 reply 上（可见，不静默）', parsed.reply)
  const clean = loose.parse(fence({ say: 'hi' }))
  ok(clean.ok === true && !Object.prototype.hasOwnProperty.call(clean, 'ignoredFields'),
    '★ 反（零噪音）：没有未知字段 ⇒ 回执里【不出现】ignoredFields 键', clean.ignoredFields)
  const strict = mk({ settings: { 'vmu.turn.unknownReplyFieldMode': 'refuse' } })
  const refused = await rejects(() => strict.parse(fence({ say: 'hi', note: 'extra' })), 'VMU_TURN_UNKNOWN_FIELD')
  ok(refused.caught && refused.code === 'VMU_TURN_UNKNOWN_FIELD', '★ 反（refuse）：同一回执仍被整轮拒（严格模式没被破坏）', refused.code)
  const applied = await loose.apply({ say: 'hi', note: 'x' })
  ok(applied && applied.ok === true && Array.isArray(applied.executed), '★ 正：known 字段照常进入 apply（动作面不因多余字段被丢）', applied && applied.ok)
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
  const t = createTurnOrchestrator({ sectionPolicy: DECIDE_SECTIONS, prompt: pipeline(), faces })
  const out = await t.apply({ say: 'hello', task_create: { title: 'x' } })
  ok(out.ok === true && out.executed.length === 2 && calls.length === 2,
    'T14. ★★★ each field reaches the face that owns it, exactly once', { executed: out.executed.length })
  ok(calls.some((c) => c[0] === 'meetings.speak') && calls.some((c) => c[0] === 'tasks.create'),
    'T15. ★★ and they go to DIFFERENT faces, because ownership is one-to-one', calls.map((c) => c[0]))
  const half = await t.apply({ verdict: true })
  ok(half.skipped.length === 1 && half.skipped[0].reason === 'face-not-wired' && t.status().counts.notExecuted === 1,
    'T16. ★★★ a field whose face is NOT wired is reported and COUNTED - a half-installed host is visible, never silent',
    { skipped: half.skipped, counts: t.status().counts })
  // ★ PHASE 9 / round 7: no open meeting is a SYMPTOM; the real chain (a field no tool in this turn could produce) is named.
  const noMeeting = createTurnOrchestrator({ sectionPolicy: DECIDE_SECTIONS, prompt: pipeline(),
    faces: { 'vmu.meetings': { speak: async () => { const e = new Error('no meeting is open'); e.code = 'VMU_NO_OPEN_MEETING'; throw e } } } })
  let wrapped = null
  try { await noMeeting.apply({ say: 'x' }) } catch (e) { wrapped = e }
  ok(wrapped && wrapped.code === 'VMU_TURN_FIELD_NOT_APPLICABLE' && wrapped.cause && wrapped.cause.code === 'VMU_NO_OPEN_MEETING' &&
    /instructionDelivered/.test(String(wrapped.hint)),
    'T16b. ★ 反：回执带 meeting 字段但本回合无会议工具 ⇒ 具名 VMU_TURN_FIELD_NOT_APPLICABLE（保留 cause，不再只报 NO_OPEN_MEETING）', wrapped && { code: wrapped.code, cause: wrapped.cause && wrapped.cause.code })

  // ★ PHASE 12: two reply fields can NEVER be dispatched from a reply — a member reply is `{field: payload}` and
  // carries NO meeting reference. Measured before the fix: both dispatched `undefined` as the meeting id and the
  // service refused with VMU_NO_SUCH_OBJECT "no such meeting: undefined" (naming the wrong problem), and
  // `meeting_invite → attend` made the replying member ATTEND ITSELF. The receipt must say "this field has no
  // supported shape", never blame the host with face-not-wired (the faces below ARE wired for `speak`/`create`).
  const planShape = t.plan({ meeting_hand: { member: 'm-1' }, meeting_invite: { member: 'm-2' } })
  ok(planShape.length === 2 && planShape.every((p) => p.notApplicable && p.notApplicable.code === 'VMU_TURN_FIELD_NOT_APPLICABLE'),
    'T16c. ★★★ 反：从回执里永远表达不了的字段在【计划阶段】就被标成 notApplicable（code=VMU_TURN_FIELD_NOT_APPLICABLE）',
    planShape.map((p) => p.field + ':' + (p.notApplicable ? p.notApplicable.code : 'none')))
  ok(planShape.every((p) => p.face === 'vmu.meetings' && typeof p.op === 'string' && p.op.length > 0),
    'T16d. ★ 原本想走的路线仍然可读（face/op 都留着，读者能看见“本来打算做什么”，而不是整条消失）',
    planShape.map((p) => p.face + '.' + p.op))
  const shapeApplied = await t.apply({ meeting_hand: { member: 'm-1' }, meeting_invite: { member: 'm-2' } })
  ok(shapeApplied.executed.length === 0 && shapeApplied.skipped.length === 2 &&
    shapeApplied.skipped.every((s) => s.reason === 'no-supported-shape' && s.code === 'VMU_TURN_FIELD_NOT_APPLICABLE'),
    'T16e. ★★★ 反：跳过理由是这两个字段自己的形状问题（no-supported-shape），不是把宿主报成 face-not-wired',
    shapeApplied.skipped.map((s) => s.field + ':' + s.reason))
  ok(calls.length === 2 && /vibe_vmu_meeting/.test(String(shapeApplied.skipped[0].hint)),
    'T16f. ★★ 反：宿主零调用（calls 仍是 T14 那两次），而 hint 指向能表达它的工具面 vibe_vmu_meeting',
    { hostCalls: calls.length, hint: shapeApplied.skipped[0] && shapeApplied.skipped[0].hint })
  ok(t.status().counts.notExecuted === 3,
    'T16g. ★ 没有假执行：这两个字段被计入 notExecuted（1 次 face-not-wired + 2 次无形状），不是“已完成”',
    t.status().counts.notExecuted)
}

// ⑤ the whole loop in one call, through both seams
{
  const t = createTurnOrchestrator({ sectionPolicy: DECIDE_SECTIONS,
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
  const t = createTurnOrchestrator({ sectionPolicy: DECIDE_SECTIONS, prompt: pipeline(), faces })
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
  const custom = createTurnOrchestrator({ sectionPolicy: DECIDE_SECTIONS, prompt: pipeline(), bindings: { progress: { face: 'vmu.records', op: 'list' } } })
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
  // ROUND 374: the declared set is now the hand-written charter plus the authored role block, not the captured
  // corpus and persona. The assertion checks the STRUCTURE - the charter is declared - rather than pinning a count
  // that changes whenever a section is added.
  ok(Array.isArray(declared) && declared.length >= 17 && declared.some((s) => s.name === 'v5r-charter-opening') && declared.some((s) => s.name === 'v5r-role-block'),
    'T28. **** the pack DECLARES its prompt sections and a pure collector gathers them - 68 sections with no hand-passing',
    { declared: declared.length })
  const loopDeclared = createTurnOrchestrator({ sectionPolicy: DECIDE_SECTIONS, prompt: createPromptPipeline({ sections: declared, clock: () => '2026-01-01T00:00:00.000Z' }) })
  const d1 = await loopDeclared.assemble(loopDeclared.open({ member: 'r-1', role: 'researcher', roleLabel: '常驻研究员', phase: 'founding' }).turn)
  const d2 = await loopDeclared.assemble(loopDeclared.open({ member: 'acad', role: 'academician', roleLabel: '院士', phase: 'founding' }).turn)
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
  const loopP = createTurnOrchestrator({ sectionPolicy: DECIDE_SECTIONS, prompt: createPromptPipeline({ sections: collectPackSections([PACK]), clock: () => '2026-01-01T00:00:00.000Z' }) })
  const phases = ['founding', 'normal', 'verify']
  const texts = []
  for (const phase of phases) {
    const out = await loopP.assemble(loopP.open({ member: 'r-1', role: 'researcher', roleLabel: '常驻研究员', phase }).turn)
    texts.push(out.text)
    ok(out.ok === true && out.text.includes('阶段：' + phase),
      'T32. *** the assembled turn for phase ' + phase + ' NAMES that phase - the section is phase-sensitive without a text per phase')
  }
  ok(new Set(texts).size === phases.length,
    'T33. **** THREE PHASES, THREE DIFFERENT TEXTS: the framework turn is phase-aware, which is what lets the comparison against the original cover more than the founding round',
    { chars: texts.map((t) => t.length) })
  const same = await loopP.assemble(loopP.open({ member: 'r-1', role: 'researcher', roleLabel: '常驻研究员', phase: 'verify' }).turn)
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
  const loop2 = createTurnOrchestrator({ sectionPolicy: DECIDE_SECTIONS, prompt: createPromptPipeline({ sections: collectPackSections([PACK]) }), faces: facesFrom(kernel2), deliver: bridge })
  const before2 = (kernel2.tasks.list() || []).length
  const run2 = await loop2.run({ member: 'r-1', role: 'researcher', roleLabel: '常驻研究员', phase: 'normal' })
  const after2 = (kernel2.tasks.list() || []).length
  ok(run2.ok === true && after2 === before2 + 1 && seen.length === 1,
    'T36. **** A WHOLE TURN THROUGH THE HOST SEAM: the loop assembles, the bridge delivers, the reply parses, and the task ledger grows - a host needs one line to run an institute turn',
    { delivered: seen.length, before: before2, after: after2 })
  ok(seen[0] && seen[0].label === 'vmu-turn-' + run2.turn.id && typeof seen[0].request.prompt[0].text === 'string' && seen[0].request.prompt[0].text.length > 1000,
    'T37. **** and what reached the seam is the ASSEMBLED text, labelled with the turn it belongs to',
    { label: seen[0] && seen[0].label, chars: seen[0] && seen[0].request.prompt[0].text.length })
  // ROUND 346: the delivery spec carries the SAME three elements the original's wake takes ({ to, why, next_step }),
  // because a host handed only "some text" cannot supervise the turn it just started.
  const wake = createTurnOrchestrator({ sectionPolicy: DECIDE_SECTIONS, prompt: createPromptPipeline({ sections: collectPackSections([PACK]) }), faces: facesFrom(kernel2), deliver: bridge })
  const opened = wake.open({ member: 'r-2', role: 'researcher', roleLabel: '常驻研究员', phase: 'normal', why: 'the lemma is open', nextStep: 'close it' })
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
  // ★★ ROUND 71: THE HOST'S OWN CONTINUABLE CONTRACT ADDS THREE REQUIRED FIELDS. It types the request as
  // `ContinuableCreateRequest { sessionId; parent: Agent; signal: AbortSignal }`, and this spec previously supplied only
  // the wake information - label, to, why, next_step, request. The host then read `agent.options` off a parent that was
  // never sent, which is the "reading 'options'" failure seen thirty-five times on a real machine. The wake information
  // is still exactly what the original carries; the three transport fields are what the host requires on top.
  ok(JSON.stringify(keys) === JSON.stringify(['label', 'next_step', 'parent', 'request', 'sessionId', 'signal', 'to', 'why']),
    'T42. **** PROPERTY: the spec key set is the original wake plus the trace label PLUS the three fields the host\'s continuable contract requires (parent, signal, sessionId)',
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
  const roster = [{ id: 'acad', role: 'academician', roleLabel: '院士' }, { id: 'r-1', role: 'researcher', roleLabel: '常驻研究员' }, { id: 'r-2', role: 'researcher' }]
  const mkLoop = (policy) => createTurnOrchestrator({ sectionPolicy: DECIDE_SECTIONS, prompt: createPromptPipeline({ sections: collectPackSections([PACK]) }), wakeupPolicy: policy })
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
  const loop3 = createTurnOrchestrator({ sectionPolicy: DECIDE_SECTIONS, prompt: createPromptPipeline({ sections: collectPackSections([PACK]) }), faces: facesFrom(kernel3), deliver: tickDeliver })
  const roster = [{ id: 'acad', role: 'academician', roleLabel: '院士' }, { id: 'r-1', role: 'researcher', roleLabel: '常驻研究员' }, { id: 'r-2', role: 'researcher' }]
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
  // ★ PHASE 9 / round 9: `step` used to drop instructionDelivered; a host could not tell whether the why reached the prompt.
  ok(ticks.every((t) => t.receipt.instructionDelivered === true), 'T50b. ★ 正：带 why 的 step 回执 instructionDelivered:true', ticks.map((t) => t.receipt.instructionDelivered))
  const noWhy = await loop3.step({ members: roster, phase: 'normal' })
  ok(noWhy.ok === true && noWhy.receipt.instructionDelivered === false, 'T50c. ★ 反：无 why 的 step 回执 instructionDelivered:false', noWhy.receipt)
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
  ok(spec && typeof spec.execute === 'function' && spec.parameters && spec.parameters.op && spec.parameters.tools,
    'T54. **** and when the configuration declares it, the tool exists with its parameters - the loop is reachable from a session, not only from a test',
    { names: on.map((s) => s.name).slice(0, 6) })
  const st = JSON.parse(await spec.execute({ op: 'status' }))
  ok(st.ok === true && st.status && st.status.policy === 'round-robin',
    'T55. **** THE TOOL REACHES THE LOOP: asking for status returns the loop own surface, policy included', { policy: st.status && st.status.policy })
  ok(typeof (await spec.execute({ op: 'status' })) === 'string',
    'T55b. *** and it answers with a JSON STRING like every other face, so a host never has to know which tool speaks which type')
  // ★ PHASE 9+ / round 12: `detail:'closure'` used to be silently ignored; now it NARROWS and unknown values refuse.
  {
    const fullText = await spec.execute({ op: 'status' })
    const closeText = await spec.execute({ op: 'status', detail: 'closure' })
    const close = JSON.parse(closeText)
    ok(close.ok === true && close.detail === 'closure' && close.closureVote && 'cast' in close.closureVote &&
      'for' in close.closureVote && 'eligible' in close.closureVote && 'missing' in close.closureVote,
      '★ 正：detail:closure 只回 closureVote（含 cast/for/eligible/missing）', close)
    ok(closeText.length < fullText.length,
      '★ 正：closure 回执显著小于默认 status 回执（不再“收了 detail 却返回全量”）', { closureBytes: closeText.length, fullBytes: fullText.length })
    const bad = JSON.parse(await spec.execute({ op: 'status', detail: 'not-a-detail' }))
    ok(bad.ok === false && bad.code === 'VMU_INVALID_ARGUMENT' && /known detail/.test(String(bad.hint || bad.message)),
      '★ 反：未知 detail 值 ⇒ 具名 VMU_INVALID_ARGUMENT，不再静默忽略', bad)
  }
  const stepOut = JSON.parse(await spec.execute({ op: 'step', members: [{ id: 'r-1', role: 'researcher', roleLabel: '常驻研究员' }], phase: 'normal' }))
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
  const svc = createTurnOrchestrator({ sectionPolicy: DECIDE_SECTIONS, prompt: viaSettings })
  const outSettings = await svc.assemble(svc.open({ member: 'r-1', role: 'researcher', roleLabel: '常驻研究员', phase: 'normal' }).turn)
  ok(outSettings.ok === true && outSettings.text.includes(SPEC) && outSettings.text.includes('【本轮面向的成员】') === false,
    'T59. **** SETTINGS CONTROL THE TEXT: a declared override replaces the section and the assembled turn obeys it - no code change, still assembled by the pipeline',
    { hasSpec: outSettings.text.includes(SPEC) })

  // (b) the same thing at RUNTIME, and reversible
  const live = createPromptPipeline({ sections, clock: () => '2026-01-01T00:00:00.000Z' })
  const lv = createTurnOrchestrator({ sectionPolicy: DECIDE_SECTIONS, prompt: live })
  const before = await lv.assemble(lv.open({ member: 'r-1', role: 'researcher', roleLabel: '常驻研究员', phase: 'normal' }).turn)
  const changed = live.override(TARGET, SPEC, 'office')
  const after = await lv.assemble(lv.open({ member: 'r-1', role: 'researcher', roleLabel: '常驻研究员', phase: 'normal' }).turn)
  ok(changed.ok === true && changed.rollbackable === true && after.text.includes(SPEC) && before.text.includes(SPEC) === false,
    'T60. **** and RUNTIME CONTROL works the same way, with the previous text handed back so the change can be undone',
    { rollbackable: changed.rollbackable })
  live.rollback(TARGET, changed.previous)
  const rolled = await lv.assemble(lv.open({ member: 'r-1', role: 'researcher', roleLabel: '常驻研究员', phase: 'normal' }).turn)
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
  // ROUND 375: the persona is now kept as CONTENT EVIDENCE and deliberately NOT declared at runtime - the pack
  // declares the hand-written charter instead. This assertion used to require the 11 captured persona sections to be
  // declared, which is exactly the snapshot-in-the-runtime problem an independent audit measured, so the claim is
  // inverted rather than deleted: nothing from the capture may appear in the declaration.
  ok(personaSections.length === 0,
    'T63. **** the captured persona is NOT declared at runtime: the pack declares the hand-written charter, because a snapshot of one run must never enter a live assembly',
    { declaredFromCapture: personaSections.length })
  const loopP = createTurnOrchestrator({ sectionPolicy: DECIDE_SECTIONS, prompt: createPromptPipeline({ sections: declaredP, bindings: PACK.bindings, clock: () => '2026-01-01T00:00:00.000Z' }) })
  const acadAsm = await loopP.assemble(loopP.open({ member: 'acad', role: 'chair', roleLabel: '院士', phase: 'founding' }).turn)
  const resAsm = await loopP.assemble(loopP.open({ member: 'r-1', role: 'member', roleLabel: '常驻研究员', phase: 'founding' }).turn)
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
  // ★★ PREMISE FIX (round 9 · task-231): THE ORIGINAL HAS THREE ROLE OUTPUTS, NOT TWO. `charterFor` branches on
  // `kind` three ways - temp (`vibe-math-v5r.js:3172`), academician (`:3178`), otherwise researcher (`:3188`) - and
  // separately on whether a leader is on staff. The persona capture above models acad/r-1 ONLY, so a block derived
  // from the TEMP branch had no baseline while the old code compared it against `acadOrig` - which by construction
  // can never contain a temp sentence (measured: `v5r-charter-roster-temp/with-leader` was the one failure).
  // The DELIVERED-PROMPT capture carries a charter per (kind, owner): founding(acad,r-1,r-2,r-3),
  // founding-temp(t-1), founding-leaderless(r-1,r-2), resume(acad,r-1,r-2) - so the baseline is now the UNION of
  // every captured original charter, and a line counts as missing only when NO captured original contains it.
  // ★ The ONE combination the capture does not contain (temp × leaderless) is frozen in KNOWN_UNBASELINED below
  // by exact line and asserted - named, never silently exempted (T71b reddens on any NEW gap).
  const bcC = JSON.parse(readFileSync(new URL('../prompt-corpus-v5/baseline-context.json', import.meta.url), 'utf8'))
  const capturedCharters = bcC.prompts.filter((p) => typeof p.charter === 'string').map((p) => p.charter)
  const tempOrig = (bcC.prompts.find((p) => p.kind === 'founding-temp') || {}).charter || ''
  const baselineCorpus = [acadOrig, resOrig].concat(capturedCharters)
  ok(capturedCharters.length >= 8 && tempOrig.length > 0 && tempOrig.includes('临时雇入的协作人员'),
    'T70b. ★★ NON-EMPTY: the capture really carries a charter per KIND (temp and leaderless included), so the third role output has a real baseline instead of the academician standing in for it',
    { charters: capturedCharters.length, kinds: [...new Set(bcC.prompts.filter((p) => typeof p.charter === 'string').map((p) => p.kind))], tempChars: tempOrig.length })
  let total = 0
  const missing = []
  const unbaselined = []
  // ★ R13 (phase 12, second half): the source charter asserted a leader UNCONDITIONALLY («本所的领头人是**院士
  // {{ setting:vmu.turn.leaderId }}**»), which on a staffed-but-unconfigured institute rendered as an unresolved hole
  // and contradicted the neighbouring leaderless sections («本所当前没有在册院士») inside ONE prompt — measured on a
  // live run and reproduced by tests/vmu-prompt-live-facts.test.mjs R13e. The capture is a historical artefact and
  // cannot be edited, so the SHIPPED charter deliberately says 「本所的**领头人**（坐在 `chair` 席位…）」 instead: a
  // sentence about the SEAT, which stays true whether or not the office is occupied. The two lines are therefore
  // declared here BY NAME (a new, different line still reddens T71) rather than silently exempted.
  const KNOWN_UNBASELINED = [
    'v5r-charter-roster-temp/leaderless: · 本所当前没有在册院士：你只需向**雇主**负责（它给你派活）。',
    'v5r-charter-org/researcher: 本所的**领头人**（坐在 `chair` 席位、并被设为 `vmu.turn.leaderId` 的那位；见名册）以**全所视角**组织与协调：',
    'v5r-charter-org/temp: 本所的**领头人**（坐在 `chair` 席位、并被设为 `vmu.turn.leaderId` 的那位；见名册）以**全所视角**组织与协调：',
  ]
  // Scope: the CHARTER blocks are checked against the persona the original really hands out. The reply spec is
  // deliberately EXCLUDED because measuring showed the captured prompt corpus does NOT contain it - only its opening
  // sentence and vote_solved appear - so there is no capture-side baseline for it. That gap is recorded in docs/26
  // section 3.12 rather than papered over with a weaker check.
  // The persona capture is the baseline for the CHARTER axis only. The per-turn pieces - the reply spec, the turn
  // heading and ask, the brief - belong to the PROMPT axis, and measuring showed the captured prompt corpus does
  // not even contain the reply catalogue. Scoping by axis is stated here rather than loosening the comparison.
  // TODO(axis): this list is maintained by hand and every new prompt-axis block must be added. A structural fix -
  // an explicit axis field on each block - is owed. A block may now DECLARE itself corpus-derived, which is the honest
  // form: the prefix list below stays for the blocks that predate the field, and a new corpus-derived block says so.
  // A block is checked against the source unless it DECLARES that it came from the delivered prompts (the field
  // round 429 added and round 430 put on the twenty-two transcribed blocks), OR it is behind one of these prefixes.
  // THE PREFIX LIST IS NOT PROVENANCE, and round 430 measured exactly what it hides: remove it and ten blocks fail
  // the line check - the charter roster, rules, voting and hiring blocks, the reply spec and the compact catalogue,
  // the formal review, plan and work blocks, and the maths rules. Reading them shows why they fail: the source
  // wraps those sentences across lines and this check compares whole lines, so a wrapped sentence can never match.
  // So the list stays as a documented exemption for the blocks that predate the field, and the honest statement is
  // that their source parity is UNVERIFIED by this check rather than proven by it.
  // ROUND 431 TRIED TO RETIRE THIS LIST AND THE ATTEMPT IS THE ARGUMENT FOR KEEPING IT. Removing it and then marking
  // what failed ended with FIFTY-TWO of the fifty-eight blocks declaring themselves outside the check - including the
  // opening, the division, the roster snapshot and most of the charter. A gate that exempts nine tenths of its subject
  // is not a gate, and marking a block is not evidence that it is correct: it is a claim about where the text came
  // from, and the marking can always be extended until the check says nothing. The two comparisons also measure
  // DIFFERENT things, which is what the round got wrong: this check asks whether a blocks text appears in the
  // DELIVERED PROMPTS, while the scratch check that said everything was fine asked whether it appears in the SOURCE.
  // A block can be in the source and not in the delivered prompts - the formal reply specification is - so the two
  // answers are not in conflict and neither is a defect. The list stays, the coverage number stays honest, and the
  // honest statement remains that these blocks source parity is unverified by this check.
  const PROMPT_AXIS_PREFIXES = ['v5r-reply-', 'v5r-turn-', 'v5r-brief-', 'v5r-proof-', 'v5r-pointer-', 'v5r-feedback-', 'v5r-formal-', 'v5r-meeting-']
  for (const b of CHARTER_BLOCKS.filter((x) => x.derivedFrom !== 'corpus' && !PROMPT_AXIS_PREFIXES.some((p) => String(x.name).startsWith(p)))) {
    // Every kind the block DECLARES is checked: role blocks carry academician/researcher/temp, and a
    // leader-conditional block carries BOTH variants (the old code checked `with-leader` only and tested it
    // against one member's charter). Unknown kinds fall back to their own text keys, so a new kind is checked
    // rather than skipped - and if it has no baseline it lands in KNOWN_UNBASELINED (T71b) instead of vanishing.
    const variants = b.kind === 'shared' ? ['shared']
      : (b.kind === 'role' ? ['academician', 'researcher', 'temp']
        : (b.kind === 'leader-conditional' ? ['with-leader', 'leaderless'] : Object.keys(b.texts || {})))
    for (const variant of variants) {
      const raw = b.texts && b.texts[variant]
      if (!raw || typeof raw !== 'string') continue
      for (const line of raw.split('\n').map((l) => l.trim()).filter((l) => l.length > 18 && !l.includes('{{'))) {
        total += 1
        if (!baselineCorpus.some((s) => s.includes(line))) {
          const named = b.name + '/' + variant + ': ' + line
          if (KNOWN_UNBASELINED.includes(named)) unbaselined.push(named)
          else missing.push(b.name + '/' + variant + ': ' + line.slice(0, 40))
        }
      }
    }
  }
  ok(total > 30 && missing.length === 0,
    'T71. **** PARITY WITH THE SOURCE: every fixed prose line of the source-derived charter appears verbatim in the charter the original really hands a member - across EVERY captured kind (temp, leaderless and the rest), not just the academician',
    { checked: total, missing: missing.slice(0, 3), baselines: baselineCorpus.length, unbaselinedKnown: unbaselined.length })
  // ★ task-252 / RULE E (shape B): A NON-EMPTY PRECONDITION BEFORE THE COMPARISON. Two EMPTY collections compare
  // equal, so without this line the assertion below could pass while comparing nothing at all - the vacuous class
  // the declaration-criterion gate exists to catch. Both sides must be non-empty for the comparison to mean
  // anything: KNOWN_UNBASELINED is the frozen list, and `unbaselined` is what the run actually found against it.
  ok(KNOWN_UNBASELINED.length > 0 && unbaselined.length > 0,
    '★ PRECONDITION (shape B): both sides of the T71b comparison are NON-EMPTY, so it cannot pass on two empty collections',
    { known: KNOWN_UNBASELINED.length, found: unbaselined.length })

  ok(unbaselined.length > 0 && KNOWN_UNBASELINED.length > 0 && unbaselined.length === KNOWN_UNBASELINED.length,
    'T71b. ★★ THE ONLY LINES WITH NO CAPTURED BASELINE ARE THE NAMED ONES: the capture has no temp×leaderless charter, so that single line is frozen here - a NEW gap reddens T71b, and a closed gap must shrink the list (no silent exemption)',
    { found: unbaselined.length, known: KNOWN_UNBASELINED.length, foundList: unbaselined.map((x) => x.slice(0, 70)) })
  const loopC = createTurnOrchestrator({ sectionPolicy: DECIDE_SECTIONS, prompt: createPromptPipeline({ sections: CHARTER_SECTIONS, bindings: CHARTER_ROLE_BINDINGS, clock: () => '2026-01-01T00:00:00.000Z' }) })
  const asmC = await loopC.assemble(loopC.open({ member: 'acad', role: 'academician', roleLabel: '院士', phase: 'founding', roster: 'acad、r-1', quorum: 2, round: 1 }).turn)
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
  const loopB = createTurnOrchestrator({ sectionPolicy: DECIDE_SECTIONS, prompt: createPromptPipeline({ sections: CHARTER_SECTIONS, bindings: CHARTER_ROLE_BINDINGS, clock: () => '2026-01-01T00:00:00.000Z' }) })
  const asmB = await loopB.assemble(loopB.open({ member: 'r-2', role: 'researcher', roleLabel: '常驻研究员', phase: 'normal', roster: 'acad、r-1、r-2', quorum: 3, statusBlock: status, round: 7 }).turn)
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
  // These assertions test the FULL catalogue, so they name it: the loop selects one of the two by settings.
  const loopRp = createTurnOrchestrator({ sectionPolicy: DECIDE_SECTIONS, prompt: createPromptPipeline({ sections: CHARTER_SECTIONS, bindings: CHARTER_ROLE_BINDINGS, clock: () => '2026-01-01T00:00:00.000Z' }), settings: { 'vmu.turn.replyCatalogue': 'full' } })
  const asmRp = await loopRp.assemble(loopRp.open({ member: 'r-2', role: 'researcher', roleLabel: '常驻研究员', phase: 'normal', round: 3 }).turn)
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
  const loopPh = createTurnOrchestrator({ sectionPolicy: DECIDE_SECTIONS, prompt: createPromptPipeline({ sections: CHARTER_SECTIONS, bindings: CHARTER_BINDINGS, clock: () => '2026-01-01T00:00:00.000Z' }) })
  const asmF = await loopPh.assemble(loopPh.open({ member: 'r-1', role: 'researcher', roleLabel: '常驻研究员', phase: 'founding', round: 1 }).turn)
  const asmN = await loopPh.assemble(loopPh.open({ member: 'r-1', role: 'researcher', roleLabel: '常驻研究员', phase: 'normal', round: 7 }).turn)
  const asmC = await loopPh.assemble(loopPh.open({ member: 'acad', role: 'academician', roleLabel: '院士', phase: 'checkpoint', round: 9 }).turn)
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

// 20) THE RESOURCE DISCIPLINE and PROOF ADMISSION (docs/26 section 3.14). The source's resource block is not a
// slogan: every number in it is a runtime parameter, so the assertion is that the NUMBERS COME FROM SETTINGS.
{
  const pipeRs = createPromptPipeline({ sections: CHARTER_SECTIONS, bindings: CHARTER_BINDINGS, clock: () => '2026-01-01T00:00:00.000Z' })
  const ctxRs = { member: 'r-1', role: 'researcher', roleLabel: '常驻研究员', phase: 'normal', round: 4, roster: 'acad、r-1', quorum: 2, statusBlock: '[状态] x', settings: { 'vmu.turn.maxParallel': 5, 'vmu.turn.toolCallsPerTurnCap': 12, 'vmu.turn.memoryCeilingMb': 4096 } }
  const asmRs = await pipeRs.assemble(ctxRs)
  ok(asmRs.ok === true && asmRs.text.includes('最多同时唤醒 5 名成员') && asmRs.text.includes('工具调用不超过 12 次') && asmRs.text.includes('接近 4096 MB'),
    'T81. **** the RESOURCE DISCIPLINE renders its numbers FROM SETTINGS: concurrency, tool budget and memory ceiling are configuration, not prose',
    { chars: asmRs.text.length })
  ok(asmRs.text.includes('正确性优先于产出量') && asmRs.text.includes('OOM 会丢掉全部未落盘工作'),
    'T82. **** while the fixed judgement stays verbatim: correctness before throughput, and the reason - an OOM loses all unflushed work',
    { fixed: true })
  ok(asmRs.text.includes('【命题准入（本所纪律）】') && asmRs.text.includes('写实比写全更重要') && asmRs.text.includes('禁止') && asmRs.text.includes('已论证'),
    'T83. **** and PROOF ADMISSION arrives: the three evidence grades, the ban on passing drafts off as argued, and the line that writing truly beats writing fully',
    { admission: true })
}

// 21) SETTINGS REACH THE ASSEMBLY THROUGH THE LOOP (docs/26 section 3.15). This is the objective's own words: the
// prompt must be tunable from configuration. The assertion drives a REAL turn through the orchestrator - not a
// hand-made assemble call - and checks that a section's {{ setting:... }} is filled from the settings the loop was
// given, and that changing the setting changes the delivered prompt.
{
  const mkLoop = (settings) => createTurnOrchestrator({ sectionPolicy: DECIDE_SECTIONS, prompt: createPromptPipeline({ sections: CHARTER_SECTIONS, bindings: CHARTER_BINDINGS, clock: () => '2026-01-01T00:00:00.000Z' }), settings })
  const one = mkLoop({ 'vmu.turn.objective': '求 3N^2-2=b^2 的全部整数解', 'vmu.turn.maxParallel': 4 })
  const a1 = await one.assemble(one.open({ member: 'acad', role: 'academician', roleLabel: '院士', phase: 'founding', roster: 'acad', quorum: 1, round: 1 }).turn)
  const two = mkLoop({ 'vmu.turn.objective': '另一个研究对象', 'vmu.turn.maxParallel': 9 })
  const a2 = await two.assemble(two.open({ member: 'acad', role: 'academician', roleLabel: '院士', phase: 'founding', roster: 'acad', quorum: 1, round: 1 }).turn)
  ok(a1.ok === true && a1.text.includes('求 3N^2-2=b^2 的全部整数解') && a1.text.includes('最多同时唤醒 4 名成员') && a1.text.includes('{{') === false,
    'T84. **** a REAL TURN renders a section value FROM SETTINGS: the objective and the resource numbers arrive through configuration, and no placeholder is left behind',
    { chars: a1.text.length })
  ok(a1.text !== a2.text && a2.text.includes('另一个研究对象') && a2.text.includes('最多同时唤醒 9 名成员') && a2.text.includes('求 3N^2-2') === false,
    'T85. **** and CHANGING THE SETTINGS CHANGES THE PROMPT: the same turn with a different configuration delivers a different text, which is what tunability means',
    { differ: a1.text !== a2.text })
}

// 22) THE POINTER-PROPAGATION CONTRACT (docs/26 section 3.16), transcribed verbatim from the source. Its discipline
// is the same one this repository applies to its own generated modules, so each rule is asserted by name.
{
  const pipePc = createPromptPipeline({ sections: CHARTER_SECTIONS, bindings: CHARTER_BINDINGS, clock: () => '2026-01-01T00:00:00.000Z' })
  const asmPc = await pipePc.assemble({ member: 'r-1', role: 'researcher', roleLabel: '常驻研究员', phase: 'normal', round: 2, roster: 'acad、r-1', quorum: 2, statusBlock: '[状态] x' })
  ok(asmPc.ok === true && asmPc.text.includes('【指针传播 · 头部列表（机制约束）】') && asmPc.text.includes('**内容指纹**'),
    'T86. **** the pointer contract arrives: cross-object references exist only as a head list carrying a content fingerprint',
    { chars: asmPc.text.length })
  ok(asmPc.text.includes('不得**因为"我刚才读过"就当作它仍在你的上下文里') && asmPc.text.includes('指纹与头部列表不一致，必须重新拉取'),
    'T87. **** and it forbids the two memory traps: assuming a body is still in context, and reusing old text when the fingerprint no longer matches',
    { forbidden: 2 })
  ok(asmPc.text.includes('具名阻塞并上报') && asmPc.text.includes('具名停下并上报') && asmPc.text.includes('禁止**自行猜测、改写、拼写对象 id'),
    'T88. **** unresolvable references must STOP BY NAME and report rather than be guessed or narrated from memory, which is the same rule this repo applies to its own citations',
    { namedStop: true })
}

// 23) FORMALISATION AND WORK FEEDBACK (docs/26 section 3.18): the source's most valuable rule and its three routes.
{
  const pipeFm = createPromptPipeline({ sections: CHARTER_SECTIONS, bindings: CHARTER_BINDINGS, clock: () => '2026-01-01T00:00:00.000Z' })
  const SET = { 'vmu.turn.formalProof': 'Formal/p-9.lean', 'vmu.turn.formalBlockedNote': '缺一个引理', 'vmu.turn.formalRootRel': 'Formal', 'vmu.turn.formalModeLabel': '强制' }
  const asmFm = await pipeFm.assemble({ member: 'r-1', role: 'researcher', roleLabel: '常驻研究员', phase: 'normal', round: 5, roster: 'acad、r-1', quorum: 2, statusBlock: '[状态] x', settings: SET })
  ok(asmFm.ok === true && asmFm.text.includes('忠实性审查') && asmFm.text.includes('你不需要重新检查推导'),
    'T89. **** THE FAITHFULNESS REVIEW: once a Lean proof has passed, the reviewer job CHANGES - they check faithfulness instead of redoing the mathematics',
    { chars: asmFm.text.length })
  ok(asmFm.text.includes('发现任何偏差，不要投 0') && asmFm.text.includes('偏差只说明**形式化不合格**，不代表命题为假') && asmFm.text.includes('严格介于 0 与 1 之间'),
    'T90. **** and a DEFECT IS NOT A REFUTATION: abstaining plus recording the defect, because deviation-to-zero would make the mechanism that exists for rigour fabricate a false negative',
    { rule: 'deviation != false' })
  ok(asmFm.text.includes('只有当你**独立于这份 Lean 代码**也能确定命题为假时，才投 0') && asmFm.text.includes("decision:'defect'"),
    'T91. **** a zero verdict requires an INDEPENDENT argument, and the defect goes into the receipt so the framework withdraws the passed status',
    { independent: true })
  ok(asmFm.text.includes('没把握的先别入库') && asmFm.text.includes('在作业落地为“通过”之前，不得把该对象当成已通过'),
    'T92. **** and the as-you-go line keeps two honesty rules: do not archive what you are unsure of, and never call a queued compile passed',
    { honesty: 2 })
  ok(asmFm.text.includes('self＝你自己的做法⇒**自己调整，无需谁采纳**') && asmFm.text.includes('只有这条要先**缜密评估**') && asmFm.text.includes('interpersonal 必须回填 outcome'),
    'T93. **** and the feedback line carries three routes with three levels of ceremony: two need nobody approval, and only the one that requires OTHERS to change needs assessment and a written outcome',
    { routes: 3 })
  ok(asmFm.text.includes('Formal/p-9.lean') && asmFm.text.includes('缺一个引理') && asmFm.text.includes('强制') && asmFm.text.includes('{{') === false,
    'T94. **** with the mode and status values arriving from settings and no placeholder left behind',
    { fromSettings: true })
}

// 24) THE DATA LINE (docs/26 section 3.21). An independent audit found eight placeholders with no supplier, which
// rendered as silent empty slots. They are now DECLARED settings with defaults, and the assertions below measure the
// consequence: no misses at all, the strict policy no longer throws, and each kind gets ITS OWN charter.
{
  // The defaults are parsed from the SCHEMA FILE rather than hard-coded here, so this is not the test agreeing with
  // itself: if a key loses its default the parse loses it too and the misses come back.
  const schemaSrc = readFileSync(new URL('../vibe-math-vmu/settings/schema.js', import.meta.url), 'utf8')
  const defaults = {}
  for (const m of schemaSrc.matchAll(/\{ key: '([^']+)',[^}]*?def: (?:'([^']*)'|([0-9.]+)|(true|false))[^}]*\}/g)) {
    defaults[m[1]] = m[2] !== undefined ? m[2] : (m[3] !== undefined ? Number(m[3]) : m[4] === 'true')
  }
  const pipeD = createPromptPipeline({ sections: CHARTER_SECTIONS, bindings: CHARTER_BINDINGS, clock: () => '2026-01-01T00:00:00.000Z' })
  const ctxOf = (role) => ({ member: 'r-1', role, roleLabel: role === 'academician' ? '院士' : (role === 'temp' ? '临时工' : '常驻研究员'), phase: 'normal', round: 3, roster: 'acad、r-1', quorum: 2, statusBlock: '[状态] x', settings: defaults })
  const asmA = await pipeD.assemble(ctxOf('academician'))
  const asmR = await pipeD.assemble(ctxOf('researcher'))
  const asmT = await pipeD.assemble(ctxOf('temp'))
  ok(asmA.variableMisses.length === 0 && asmR.variableMisses.length === 0 && asmT.variableMisses.length === 0,
    'T95. **** NO PLACEHOLDER IS LEFT UNSUPPLIED: the eight slots the audit found are declared settings with defaults, so every kind assembles with zero misses',
    { misses: [asmA.variableMisses.length, asmR.variableMisses.length, asmT.variableMisses.length] })
  const strict = createPromptPipeline({ sections: CHARTER_SECTIONS, bindings: CHARTER_BINDINGS, clock: () => '2026-01-01T00:00:00.000Z' })
  let threw = null
  try { await strict.assemble({ ...ctxOf('researcher'), settings: { ...defaults, 'vmu.prompts.missingVariable': 'refuse' } }) } catch (e) { threw = e }
  ok(threw === null,
    'T96. **** and the STRICT policy now passes too: with the holes closed, refusing a missing value costs nothing, which is what makes that policy safe to adopt',
    { code: threw && threw.code })
  ok(asmT.text.includes('临时工') && asmT.text.includes('你是「institute」的**院士**') === false,
    'T97. **** EACH KIND GETS ITS OWN CHARTER: the temp member no longer falls back to the academician text, which was the second defect the audit measured',
    { tempChars: asmT.text.length })
  ok(asmR.text.includes('你是「institute」的一名常驻研究员') && (asmR.text.match(/你是「institute」的\*\*院士\*\*/g) || []).length === 0,
    'T98. **** and the researcher gets exactly ONE identity instead of three appended together',
    { chars: asmR.text.length })
  ok(asmR.text.length < 20000 && asmR.text.includes('m = 2') === true,
    'T99. **** with a single quorum value rather than the three the append produced',
    { chars: asmR.text.length })
}

// 25) CONTEXT BOOKKEEPING AND THE RESUME SEED (docs/26 section 3.21). The original accounts for context usage on
// EVERY reply, and its own comment records the v4 defect where only the normal branch did: the flag stuck true and the
// compaction directive reappeared at the head of every later prompt forever. Here the two fields must be RECOGNISED -
// refusing them was a blocker for a real round - and the compacted case must store the seed.
{
  const loopC = createTurnOrchestrator({ settings: { 'vmu.turn.unknownReplyFieldMode': 'refuse' }, sectionPolicy: DECIDE_SECTIONS, prompt: createPromptPipeline({ sections: CHARTER_SECTIONS, bindings: CHARTER_BINDINGS, clock: () => '2026-01-01T00:00:00.000Z' }) })
  // NOTE: the sample deliberately carries no other field. `solved`, `assign`, `task_claim` and the rest are REAL
  // reply fields the original parses and this face still does not know, which is the audit's field-surface gap (12 of
  // 29) and is recorded as owed rather than hidden by a sample that avoids them.
  const withPct = (() => { try { return loopC.parse('```json\n{"say":"hi","contextPct":63}\n```') } catch (e) { return { ok: false, code: e.code } } })()
  ok(withPct.ok === true && withPct.fields.includes('contextPct'),
    'T100. **** contextPct is RECOGNISED rather than refused as an unknown field, which is what a real model emits and what used to make a real round impossible',
    { fields: withPct.fields })
  const bk1 = await loopC.apply({ contextPct: 63 })
  ok(bk1.bookkeeping.some((b) => b.field === 'contextPct' && b.pct === 63),
    'T101. **** and it is ACCOUNTED for on a reply that dispatches nothing else, in the same single place for every phase',
    { bookkeeping: bk1.bookkeeping })
  const bk2 = await loopC.apply({ compacted: true, progress: 'X'.repeat(5000) })
  const seed = bk2.bookkeeping.find((b) => b.field === 'compacted')
  ok(seed !== undefined && seed.seedChars === 4000,
    'T102. **** and a REAL compaction stores the RESUME SEED, capped the way the source caps it, so a rebuilt session is handed something instead of starting from nothing',
    { seedChars: seed && seed.seedChars })
  // `parse` REFUSES BY THROWING (the named-refusal contract), so the negative case is a try/catch, not a returned flag.
  let unknownErr = null
  try { loopC.parse('```json\n{"nope":1}\n```') } catch (e) { unknownErr = e }
  ok(unknownErr !== null && unknownErr.code === 'VMU_TURN_UNKNOWN_FIELD',
    'T103. **** while a genuinely unknown field is still refused by name - recognising two more fields must not become accepting anything',
    { code: unknownErr && unknownErr.code })
}
﻿
// 26) THE FULL REPLY SURFACE (docs/26 section 3.22). An audit measured that this face knew 12 of the 29 fields the
// original parses, so a real model using task_claim or meeting_hand had its whole reply refused. Every owner pair was
// checked against what the kernel services really expose, and the fields with no matching operation are BOOKKEPT so
// that a real reply is never refused merely because a face is still to be built.
{
  // ★★ ROUND 51: `vote_solved` MOVED FROM DISPATCHED TO BOOKKEPT, AND THE COUNTS FOLLOWED. It was routed to the ballot
  // box, which needs a box id and a voter identity the dispatcher does not hold, so every call necessarily refused -
  // while being counted as dispatched. The PROMPT settles which field closes the institute: its own words make
  // `vote_solved` the closure vote (unanimity required) and `solved` merely the per-round judgement. So the closure
  // vote is recorded and counted, and 22 fields are dispatched while 7 are bookkept.
  ok(FIELDS.length + RECORDED_FIELDS.length === 29 && FIELDS.length === 22,
    'T104. **** the reply surface now covers all 29 fields the original parses - 22 dispatched to real operations and 7 bookkept',
    { dispatched: FIELDS.length, bookkept: RECORDED_FIELDS.length, total: FIELDS.length + RECORDED_FIELDS.length })
  ok(FIELD_OWNERS.vote_solved === undefined && FIELD_OWNERS.meeting_hand.op === 'queue' && FIELD_OWNERS.convene_meeting.op === 'open' && FIELD_OWNERS.assign.op === 'assign',
    'T105. **** and each new owner names an operation the kernel really exposes - nothing is invented (and `vote_solved` is BOOKKEPT, not dispatched to a face that cannot accept it)',
    { sample: FIELD_OWNERS.meeting_hand.face + '.' + FIELD_OWNERS.meeting_hand.op + ' ' + FIELD_OWNERS.convene_meeting.face + '.' + FIELD_OWNERS.convene_meeting.op + ' (and vote_solved is absent from FIELD_OWNERS: it is bookkept, not dispatched)' })
  // A loop built INSIDE this block: the earlier one lives in another block's scope, and reaching across would be a
  // dependency on declaration order that the next person would have to rediscover.
  const loopF = createTurnOrchestrator({ sectionPolicy: DECIDE_SECTIONS, prompt: createPromptPipeline({ sections: CHARTER_SECTIONS, bindings: CHARTER_BINDINGS, clock: () => '2026-01-01T00:00:00.000Z' }) })
  const realistic = ['```json', JSON.stringify({ say: 'progress note', progress: 'worked on lemma 4', task_claim: 't-4', meeting_hand: true, solved: false, contextPct: 41 }), '```'].join('\n')
  const parsedReal = (() => { try { return loopF.parse(realistic) } catch (e) { return { ok: false, code: e.code } } })()
  ok(parsedReal.ok === true && parsedReal.fields.length === 6,
    'T106. **** A REALISTIC REPLY IS ACCEPTED WHOLE: a reply mixing dispatched fields with a bookkept one no longer loses everything to a refusal',
    { fields: parsedReal.fields, code: parsedReal.code })
  const planReal = loopF.plan(parsedReal.reply)
  const plannedNames = planReal.map((d) => d.field)
  ok(plannedNames.length === 4 && plannedNames.includes('meeting_hand') && plannedNames.includes('solved') === false && plannedNames.includes('contextPct') === false && planReal.every((d) => typeof d.op === 'string' && d.op !== ''),
    'T107. **** and the plan sends the four dispatched fields - meeting_hand included, since the meeting service really does expose queue - while the bookkept ones stay out of it',
    { planned: plannedNames })
}

// 27) PER-TURN FACTS (docs/26 section 3.23). Some values a section needs are true only of THIS turn - the current
// meeting number, whether a leader is on staff - so the loop merges them OVER the resolved settings. Static
// configuration stays the floor and the turn overrides what it knows.
{
  const mkL = (settings) => createTurnOrchestrator({ sectionPolicy: DECIDE_SECTIONS, prompt: createPromptPipeline({ sections: CHARTER_SECTIONS, bindings: CHARTER_BINDINGS, clock: () => '2026-01-01T00:00:00.000Z' }), settings })
  const lf = mkL({ 'vmu.turn.meetingId': 'm-static' })
  const aF = await lf.assemble(lf.open({ member: 'acad', role: 'academician', roleLabel: '院士', phase: 'meeting', round: 2, facts: { 'vmu.turn.meetingId': 'm-7' } }).turn)
  const bF = await lf.assemble(lf.open({ member: 'acad', role: 'academician', roleLabel: '院士', phase: 'meeting', round: 2 }).turn)
  ok(aF.ok === true && aF.text.includes('m-7') && aF.text.includes('m-static') === false,
    'T108. **** a PER-TURN FACT overrides the static setting for the turn that supplied it, so a value that changes between meetings is never frozen',
    { fact: 'm-7' })
  ok(bF.text.includes('m-static'),
    'T109. **** and the NEXT turn falls back to the static configuration - the fact did not leak, because a fresh object is built per assembly rather than mutating the settings',
    { next: 'm-static' })
  ok(aF.text !== bF.text,
    'T110. **** so two turns of the same member under the same configuration differ exactly where the turn knew something the configuration did not',
    { differ: aF.text !== bF.text })
}

// 28) THE LAST MILE (docs/26 section 3.24). A pack is loaded AFTER the kernel, so its declared sections used to be
// visible to tests and invisible to a real round. The pipeline now accepts late sections AND late bindings; this
// asserts both, because a late section without its binding would assemble with another role's baseline.
{
  // ROUND 1 (P3): the stale `range: 'pack'` was removed - `range` is derived from `order` (docs/06 §3),
  // and order 10 does not lie in the pack interval.
  const late = createPromptPipeline({ sections: [{ name: 'seed-block', order: 10, text: 'SEED' }], clock: () => '2026-01-01T00:00:00.000Z' })
  for (const s of CHARTER_SECTIONS) late.register(s)
  for (const b of CHARTER_BINDINGS) late.bind(b)
  const asmL = await late.assemble({ member: 'r-1', role: 'researcher', roleLabel: '常驻研究员', phase: 'normal', round: 4, roster: 'acad、r-1', quorum: 2, statusBlock: '[状态] x' })
  ok(asmL.ok === true && asmL.text.includes('【二、通用规章（全员必读）】') && asmL.text.includes('SEED'),
    'T111. **** a pack loaded AFTER the kernel still reaches a real assembly: its sections register into the live pipeline',
    { chars: asmL.text.length })
  ok(asmL.text.includes('本所是自组织的，但**不是没有组织**') && asmL.text.includes('作为院士，你对本所的组织与推进负总责') === false,
    'T112. **** AND ITS BINDINGS TOO: the late charter assembles with the RESEARCHER text, not the academician baseline that a section alone would have carried',
    { bound: CHARTER_BINDINGS.length })
  let tieErr = null
  try { late.bind({ section: 'seed-block', role: 'a', phase: 'b', text: 'x' }) } catch (e) { tieErr = e }
  ok(tieErr !== null && tieErr.code === 'VMU_INVALID_ARGUMENT',
    'T113. **** and a malformed binding is refused by name rather than pushed into the list',
    { code: tieErr && tieErr.code })
}

// 29) THE ONE-SHOT NOTICE QUEUE and THE ASSEMBLER ORDER (docs/26 section 3.25). The source composes a settled
// compile announcement into the member NEXT prompt and says so explicitly: once. And the audit found no evidence
// that the five-part round prompt is assembled in the source order, so that is asserted here too.
{
  const lq = createTurnOrchestrator({ sectionPolicy: DECIDE_SECTIONS, prompt: createPromptPipeline({ sections: CHARTER_SECTIONS, bindings: CHARTER_BINDINGS, clock: () => "2026-01-01T00:00:00.000Z" }) })
  const q1 = lq.notify("r-1", "[形式化结果] p-9 passed")
  const a1 = await lq.assemble(lq.open({ member: "r-1", role: "researcher", roleLabel: '常驻研究员', phase: "normal", round: 5, statusBlock: "[状态] x" }).turn)
  const a2 = await lq.assemble(lq.open({ member: "r-1", role: "researcher", roleLabel: '常驻研究员', phase: "normal", round: 6, statusBlock: "[状态] x" }).turn)
  ok(q1.ok === true && a1.text.includes("[形式化结果] p-9 passed") && a2.text.includes("[形式化结果] p-9 passed") === false,
    "T114. **** a queued notice is announced EXACTLY ONCE: it reaches the next prompt and is gone from the one after, so it can neither repeat nor be lost",
    { queued: q1.queued })
  lq.notify("r-2", "notice for r-2")
  const a3 = await lq.assemble(lq.open({ member: "r-1", role: "researcher", roleLabel: '常驻研究员', phase: "normal", round: 7, statusBlock: "[状态] x" }).turn)
  const a4 = await lq.assemble(lq.open({ member: "r-2", role: "researcher", roleLabel: '常驻研究员', phase: "normal", round: 7, statusBlock: "[状态] x" }).turn)
  ok(a3.text.includes("notice for r-2") === false && a4.text.includes("notice for r-2"),
    "T115. **** and notices are PER MEMBER: someone else round never carries it",
    { leaked: a3.text.includes("notice for r-2") })
  let nErr = null
  try { lq.notify("", "x") } catch (e) { nErr = e }
  ok(nErr !== null && nErr.code === "VMU_INVALID_ARGUMENT",
    "T116. **** while a notice with no member or no line is refused by name rather than queued as a blank",
    { code: nErr && nErr.code })
  const ord = a1.text
  // Robust by construction: the order is read off the assembled text by the section NUMERALS the source uses, so a
  // reworded heading cannot break the check while a reordered charter still does.
  const numerals = [...a1.text.matchAll(/【([一二三四五六七八九十]+)、/g)].map((m) => m[1])
  const charterOrder = numerals.join("")
  const firstHeading = a1.text.indexOf("【第 5 轮")
  const lastSection = a1.text.lastIndexOf("【十、")
  const catalogue = a1.text.indexOf('# v5r-reply-compact')
  ok(charterOrder === "一二三四五六七八九十" && firstHeading > -1 && firstHeading < lastSection && catalogue > lastSection,
    "T117. **** THE ASSEMBLER ORDER IS THE SOURCE ORDER: the round heading comes first, the charter runs one to ten, and the reply catalogue closes the prompt - the evidence the audit said was missing",
    { numerals: charterOrder, catalogueLast: catalogue > lastSection })
}

// 30) THE OFF SWITCHES (docs/26 section 3.26). Measured first: overriding a section with an empty string left its
// heading behind, so "off" was not zero injection. The pipeline now has a real disable, and OFF means the section
// produces NOTHING - not a disabled notice, which would change the prompt words - while ON restores it unchanged.
{
  const mkS = (settings) => createTurnOrchestrator({ sectionPolicy: DECIDE_SECTIONS, prompt: createPromptPipeline({ sections: CHARTER_SECTIONS, bindings: CHARTER_BINDINGS, clock: () => "2026-01-01T00:00:00.000Z" }), settings })
  const base = { member: "r-1", role: "researcher", roleLabel: '常驻研究员', phase: "normal", round: 3, statusBlock: "[状态] x" }
  const on = mkS({})
  const aOn = await on.assemble(on.open(base).turn)
  const off = mkS({ "vmu.pointer.propagation": false, "vmu.turn.selfCheck": false, "vmu.turn.feedback": false })
  const aOff = await off.assemble(off.open(base).turn)
  ok(aOn.text.includes("【指针传播 · 头部列表（机制约束）】") && aOn.text.includes("【资源】") && aOn.text.includes("【工作经验／流程反馈"),
    "T118. **** by default all three optional blocks are injected, because a deployment that never configured them must get the full prompt",
    { chars: aOn.text.length })
  ok(aOff.text.includes("指针传播") === false && aOff.text.includes("【资源】") === false && aOff.text.includes("流程反馈") === false && aOff.text.length < aOn.text.length,
    "T119. **** and turning them OFF is ZERO INJECTION: no text and not even the heading, which an empty override could not achieve",
    { on: aOn.text.length, off: aOff.text.length })
  const back = mkS({})
  const aBack = await back.assemble(back.open(base).turn)
  ok(aBack.text === aOn.text,
    "T120. **** while enabling restores the section UNCHANGED: the prompt comes back byte for byte, so a switch is not a one-way door",
    { identical: aBack.text === aOn.text })
  let dErr = null
  try { aOn.__x = null; createPromptPipeline({ sections: [] }).disable("nope") } catch (e) { dErr = e }
  ok(dErr !== null && dErr.code === "VMU_NO_SUCH_OBJECT",
    "T121. **** and disabling a section that does not exist is refused by name rather than silently remembered",
    { code: dErr && dErr.code })
}

// 31) THE MEETING SPEAKER STATES (docs/26 section 3.27): the source describes three mutually exclusive situations
// and the loop enables exactly one, plus an ask that states speaking is optional and silence is never a vote.
{
  const mM = createTurnOrchestrator({ sectionPolicy: DECIDE_SECTIONS, prompt: createPromptPipeline({ sections: CHARTER_SECTIONS, bindings: CHARTER_BINDINGS, clock: () => "2026-01-01T00:00:00.000Z" }), settings: { "vmu.turn.invitedBy": "acad", "vmu.turn.invitedWhy": "needs the lemma" } })
  const aM = await mM.assemble(mM.open({ member: "t-1", role: "temp", roleLabel: '临时工', phase: "meeting", meetingState: "invited", round: 2, statusBlock: "[状态] x" }).turn)
  ok(aM.ok === true && aM.text.includes("受邀发言") && aM.text.includes("acad") && aM.text.includes("needs the lemma") && aM.text.includes("不计票") === true,
    "T122. **** the INVITED-TEMP state arrives with its inviter and reason, and states that the speech is minutes only, never a vote, and does not block",
    { chars: aM.text.length })
  ok(aM.text.includes("沉默不等于投票") && aM.text.includes("阻止结题") && aM.text.includes("要不要发言由你决定"),
    "T123. **** and the MEETING ASK carries the two rules the source is explicit about: speaking is optional AND silence is never a vote, with a missing vote blocking closure",
    { ask: true })
  // EXCLUSION NOW EXISTS, so the assertion moves from "declared but not selected" to the meaningful default: a
  // meeting round that names NO state gets none of the three, because guessing which one applies would put words in
  // the prompt that the caller never asked for.
  const declaredMeetingStates = CHARTER_SECTIONS.filter((s) => String(s.name).startsWith('v5r-meeting-')).map((s) => s.name).sort()
  const unnamed = await mM.assemble(mM.open({ member: "t-1", role: "temp", roleLabel: '临时工', phase: "meeting", round: 2, statusBlock: "[状态] x" }).turn)
  ok(declaredMeetingStates.length === 4 && unnamed.text.includes('受邀发言') === false && unnamed.text.includes('第一位发言者') === false && aM.text.includes('第一位发言者') === false,
    'T124. **** all three speaker states and the ask are DECLARED, and a meeting round that names NO state gets NONE of them - the loop refuses to guess which situation applies',
    { declared: declaredMeetingStates })
}

// 32) EXACTLY ONE MEETING SPEAKER STATE (docs/26 section 3.27). Declaring all three was the previous round gap; the
// loop now injects the one the caller names and disables the rest, injects none outside the meeting phase, and refuses
// an unrecognised state rather than silently rendering the first speaker.
{
  const mkM = () => createTurnOrchestrator({ sectionPolicy: DECIDE_SECTIONS, prompt: createPromptPipeline({ sections: CHARTER_SECTIONS, bindings: CHARTER_BINDINGS, clock: () => "2026-01-01T00:00:00.000Z" }), settings: { "vmu.turn.invitedBy": "acad", "vmu.turn.invitedWhy": "w" } })
  const invited = await mkM().assemble(mkM().open({ member: "t-1", role: "temp", roleLabel: '临时工', phase: "meeting", meetingState: "invited", round: 2, statusBlock: "[状态] x" }).turn)
  ok(invited.ok === true && invited.text.includes("受邀发言") && invited.text.includes("第一位发言者") === false && invited.text.includes("其他成员本次会议已发表的意见") === false,
    "T125. **** the INVITED state is injected ALONE: the first-speaker and the others-inputs states are absent, which is what mutually exclusive means",
    { chars: invited.text.length })
  const first = await mkM().assemble(mkM().open({ member: "r-1", role: "researcher", roleLabel: '常驻研究员', phase: "meeting", meetingState: "first", round: 2, statusBlock: "[状态] x" }).turn)
  ok(first.text.includes("第一位发言者") && first.text.includes("受邀发言") === false && first.text.includes("### 其他成员本次会议已发表的意见") === false,
    "T126. **** and the FIRST-SPEAKER state is injected alone, with the speaking model it carries",
    { chars: first.text.length })
  const others = await mkM().assemble(mkM().open({ member: "r-1", role: "researcher", roleLabel: '常驻研究员', phase: "meeting", meetingState: "others", round: 2, statusBlock: "[状态] x" }).turn)
  ok(others.text.includes("### 其他成员本次会议已发表的意见") && others.text.includes("第一位发言者") === false,
    "T127. **** and the OTHERS state forwards the inputs without claiming to be first",
    { chars: others.text.length })
  const normal = await mkM().assemble(mkM().open({ member: "r-1", role: "researcher", roleLabel: '常驻研究员', phase: "normal", round: 2, statusBlock: "[状态] x" }).turn)
  ok(normal.text.includes("受邀发言") === false && normal.text.includes("第一位发言者") === false && normal.text.includes("### 其他成员本次会议已发表的意见") === false,
    "T128. **** and OUTSIDE the meeting phase none of the three appears at all, because they are states of a meeting rather than of every round",
    { chars: normal.text.length })
  let sErr = null
  try { await mkM().assemble(mkM().open({ member: "r-1", role: "researcher", roleLabel: '常驻研究员', phase: "meeting", meetingState: "nope", round: 2, statusBlock: "[状态] x" }).turn) } catch (e) { sErr = e }
  ok(sErr !== null && sErr.code === "VMU_INVALID_ARGUMENT",
    "T129. **** while an unrecognised state is REFUSED by name rather than silently rendered as the first speaker",
    { code: sErr && sErr.code })
}

// 33) THE FORMALISATION STATUS LINE (docs/26 section 3.28): one line, four branches, exactly one shown - and unlike
// the meeting states it is ALWAYS shown, so the default is the not-attempted branch rather than nothing.
{
  const mkF = (settings) => createTurnOrchestrator({ sectionPolicy: DECIDE_SECTIONS, prompt: createPromptPipeline({ sections: CHARTER_SECTIONS, bindings: CHARTER_BINDINGS, clock: () => "2026-01-01T00:00:00.000Z" }), settings: settings || {} })
  const base = { member: "r-1", role: "researcher", roleLabel: '常驻研究员', phase: "normal", round: 3, statusBlock: "[状态] x" }
  const p1 = await mkF({ "vmu.turn.formalProof": "Formal/p-9.lean" }).assemble(mkF({ "vmu.turn.formalProof": "Formal/p-9.lean" }).open({ ...base, formalStatus: "passed" }).turn)
  ok(p1.ok === true && p1.text.includes("Lean 通过（Formal/p-9.lean）") && p1.text.includes("未尝试") === false && p1.text.includes("阻塞（") === false,
    "T130. **** the PASSED branch is shown alone, naming the proof file - the same exclusive pattern as the meeting states",
    { chars: p1.text.length })
  const b1 = await mkF({ "vmu.turn.formalBlockedNote": "needs lemma X" }).assemble(mkF({ "vmu.turn.formalBlockedNote": "needs lemma X" }).open({ ...base, formalStatus: "blocked" }).turn)
  ok(b1.text.includes("阻塞（needs lemma X）") && b1.text.includes("Lean 通过（") === false && b1.text.includes("已尝试未通过") === false,
    "T131. **** the BLOCKED branch is shown alone and carries its reason",
    { chars: b1.text.length })
  const a1 = await mkF({}).assemble(mkF({}).open({ ...base, formalStatus: "attempted" }).turn)
  ok(a1.text.includes("已尝试未通过") && a1.text.includes("未尝试") === false,
    "T132. **** the ATTEMPTED branch is shown alone",
    { chars: a1.text.length })
  const n1 = await mkF({}).assemble(mkF({}).open({ ...base }).turn)
  ok(n1.text.includes("未尝试") && n1.text.includes("Lean 通过（") === false && n1.text.includes("已尝试未通过") === false,
    "T133. **** and with NO status named the NOT-ATTEMPTED branch appears, because this line is always shown",
    { chars: n1.text.length })
  let fErr = null
  try { await mkF({}).assemble(mkF({}).open({ ...base, formalStatus: "maybe" }).turn) } catch (e) { fErr = e }
  ok(fErr !== null && fErr.code === "VMU_INVALID_ARGUMENT",
    "T134. **** while an unrecognised status is refused by name rather than guessed",
    { code: fErr && fErr.code })
}

// 34) THE DISPLAY LINE AND A PROVABLY DEAD FALLBACK (docs/26 section 3.29). An audit measured that headings were
// built from the binding KEY rather than the human role name; this authored section had the same defect, and the
// fallback text in CHARTER_SECTIONS is only safe while every role-bound block carries every role.
{
  // The authored role section is contributed by the PACK rather than by CHARTER_SECTIONS, so the assertion assembles
  // from the pack declaration - which is also what a real round does, and therefore the stronger place to check it.
  const loopR = createTurnOrchestrator({ sectionPolicy: DECIDE_SECTIONS, prompt: createPromptPipeline({ sections: collectPackSections([PACK]), bindings: PACK.bindings, clock: () => "2026-01-01T00:00:00.000Z" }) })
  const aR = await loopR.assemble(loopR.open({ member: "r-1", role: "researcher", roleLabel: "常驻研究员", phase: "normal", round: 2, statusBlock: "[状态] x" }).turn)
  ok(aR.text.includes("【本轮面向的成员】代号：r-1 ｜角色：常驻研究员 ｜阶段：normal"),
    "T135. **** the DISPLAY LINE names the human role, not the binding key: role selects sections, roleLabel is what a reader sees",
    { line: "roleLabel" })
  const roleBlocks = CHARTER_BLOCKS.filter((b) => b.kind === "role")
  const incomplete = roleBlocks.filter((b) => !["academician", "researcher", "temp"].every((r) => typeof b.texts[r] === "string" && b.texts[r] !== ""))
  ok(roleBlocks.length >= 6 && incomplete.length === 0,
    "T136. **** and every role-bound block carries ALL THREE roles, which is what makes the baseline fallback in CHARTER_SECTIONS provably dead rather than merely unused today",
    { blocks: roleBlocks.length, incomplete: incomplete.map((b) => b.name) })
  const v = V5R_ROLE_SECTION_VARS
  ok(v.includes("roleLabel") === true,
    "T137. **** and the authored role section declares roleLabel among the variables it uses, so the contract and the text agree",
    { vars: v })
}

// 35) WHAT HAPPENS TO A FIELD WITH NO FACE (docs/26 section 3.30). A probe showed that the recorded fields were
// recognised and then DISCARDED: a model writing prioritize, nudge or fire had its payload vanish with no trace.
// Two of them now have real operations, and every remaining one is KEPT on the turn state and reported.
{
  const loopK = createTurnOrchestrator({ sectionPolicy: DECIDE_SECTIONS, prompt: { assemble: async () => ({ ok: true, text: "x", sources: [] }) }, faces: {} })
  const resK = await loopK.apply({ prioritize: { order: [{ task_id: "t-1", priority: 2 }] }, fire: { id: "t-2", reason: "done" }, solved: false })
  ok(resK.bookkeeping.length === 3 && resK.bookkeeping.every((b) => b.kept === true),
    "T138. **** a field with no face is KEPT, not discarded: the payload reaches the turn state and the receipt says so, so it can neither vanish nor be mistaken for handled",
    { bookkeeping: resK.bookkeeping })
  const stK = loopK.status()
  ok(typeof stK === "object" && stK !== null,
    "T139. **** and the loop still reports its status after keeping them",
    { keys: Object.keys(stK).length })
  ok(FIELD_OWNERS.nudge.face === "vmu.meetings" && FIELD_OWNERS.nudge.op === "warn" && FIELD_OWNERS.reject_assign.op === "speak",
    "T140. **** while the two fields that DO have a real operation are dispatched to it - a nudge is the meeting service warn, and a rejected assignment is broadcast as speech, which is what the source says happens to that reason",
    { nudge: FIELD_OWNERS.nudge.face + "." + FIELD_OWNERS.nudge.op })
  ok(RECORDED_FIELDS.includes("hire") && RECORDED_FIELDS.includes("fire") && RECORDED_FIELDS.includes("prioritize") && RECORDED_FIELDS.includes("solved"),
    "T141. **** and the fields with NO real operation stay recorded rather than being sent somewhere invented - the members service is not even present in a default kernel",
    { recorded: RECORDED_FIELDS })
}

// 36) A REFUSED DISPATCH BECOMES A NOTICE (docs/26 section 3.31). The original corpus shows the shape: a refused field
// is announced to that member in the NEXT prompt. A refusal living only in the receipt is invisible to the member that
// caused it. The check is programmatic on purpose - the receipt and the queue - so no wording is duplicated here.
{
  const refuser = async () => ({ ok: false, code: "V5_TASK_STALE_REVISION", message: "stale revision" })
  const loopN = createTurnOrchestrator({ sectionPolicy: DECIDE_SECTIONS,
    prompt: createPromptPipeline({ sections: CHARTER_SECTIONS, bindings: CHARTER_BINDINGS, clock: () => "2026-01-01T00:00:00.000Z" }),
    deliver: async () => "```json\n{\"task_update\":{\"task_id\":\"t-1\",\"expected_revision\":99}}\n```",
    faces: { "vmu.tasks": { transition: refuser } },
  })
  const baseN = { member: "r-1", role: "researcher", roleLabel: '常驻研究员', phase: "normal", statusBlock: "[状态] x" }
  const r1 = await loopN.run({ ...baseN, round: 1 })
  ok(r1.ok === true && r1.refused.length === 1 && r1.refused[0].field === "task_update" && r1.refused[0].code === "V5_TASK_STALE_REVISION",
    "T142. **** a refused dispatch is REPORTED on the receipt rather than silently counted as executed",
    { refused: r1.refused })
  const queuedN = loopN.takeNotices("r-1")
  ok(queuedN.length === 1,
    "T143. **** and it is QUEUED for that member, so the refusal reaches them in their next prompt - the announcement point the source names",
    { queued: queuedN.length })
  const a2 = await loopN.assemble(loopN.open({ ...baseN, round: 2 }).turn)
  ok(a2.ok === true && loopN.takeNotices("r-1").length === 0,
    "T144. **** and the next assembly DRAINS it exactly once, so the notice neither repeats nor lingers",
    { drained: true })
  const okFace = createTurnOrchestrator({ sectionPolicy: DECIDE_SECTIONS,
    prompt: createPromptPipeline({ sections: CHARTER_SECTIONS, bindings: CHARTER_BINDINGS, clock: () => "2026-01-01T00:00:00.000Z" }),
    deliver: async () => "```json\n{\"task_update\":{\"task_id\":\"t-1\",\"expected_revision\":1}}\n```",
    faces: { "vmu.tasks": { transition: async () => ({ ok: true }) } },
  })
  const r2 = await okFace.run({ ...baseN, round: 1 })
  ok(r2.refused.length === 0 && okFace.takeNotices("r-1").length === 0,
    "T145. **** while a SUCCESSFUL dispatch queues nothing at all, because a notice about nothing is noise",
    { refused: r2.refused.length })
}
// 15) ONE BAD REPLY DOES NOT KILL THE BATCH: a broken round is recorded and the run continues (bounded per member)
{
  const kernel = createKernel({ settings: {}, root: null, host: null })
  const mk = (deliver) => createTurnOrchestrator({
    settings: { 'vmu.turn.unknownReplyFieldMode': 'refuse' },
    sectionPolicy: DECIDE_SECTIONS,
    prompt: createPromptPipeline({ sections: collectPackSections([PACK]) }),
    faces: facesFrom(kernel),
    deliver,
  })
  const roster = [{ id: 'a', role: 'member' }, { id: 'b', role: 'member' }, { id: 'c', role: 'member' }]
  let call = 0
  // Round 2 emits a reply with fields the kernel does not accept (the EXACT v3 shape that used to abort the whole run).
  const mixed = mk(async () => {
    call += 1
    if (call === 2) return '```json\n' + JSON.stringify({ role: 'verifier-review', status: 'cannot-verify', needed: 'target' }) + '\n```'
    return '```json\n' + JSON.stringify({ task_create: { title: 'round ' + call } }) + '\n```'
  })
  const before = (kernel.tasks.list() || []).length
  const out = await mixed.drive({ members: roster, rounds: 3 })
  ok(out.ok === true && out.roundsAttempted === 3 && out.roundsRun === 2 && out.failures.length === 1,
    'T146. **** one member s bad reply is RECORDED and the batch CONTINUES to the next round', { out })
  ok(out.receipts[1] && out.receipts[1].failed === true && out.receipts[1].code === 'VMU_TURN_UNKNOWN_FIELD'
    && out.receipts[1].executed === undefined && out.receipts[1].turn === undefined,
    'T147. **** and the failed round is NOT reported as a success (no fields/executed/turn on that receipt)', out.receipts[1] && out.receipts[1].code)
  ok((kernel.tasks.list() || []).length === before + 2,
    'T148. **** the bad round applied NOTHING (the ledger grew by exactly the two good rounds)',
    { before, after: (kernel.tasks.list() || []).length })
  // Reverse: a member that fails the SAME way three rounds in a row stops the batch BY NAME, with the limit stated.
  const alwaysBad = mk(async () => '```json\n' + JSON.stringify({ role: 'x', status: 'y' }) + '\n```')
  const out2 = await alwaysBad.drive({ members: [{ id: 'z', role: 'member' }], rounds: 5 })
  ok(out2.ok === false && out2.stopped === 'member-failures' && out2.failures.length === 3,
    'T149. **** a member failing three rounds in a row stops the run by name (roundsRun still names the successes)',
    { stopped: out2.stopped, failures: out2.failures && out2.failures.length })
  ok(out2.roundsRun === 0 && out2.roundsAttempted === 3,
    'T150. *** and the receipt separates successful rounds from attempted ones', { run: out2.roundsRun, attempted: out2.roundsAttempted })
}
// ── ★ PHASE 7 (goal 3): the status block lists the REAL visible tools (from schemas), and writes NOTHING when empty ─
{
  const t = mk()
  const { turn } = t.open({ member: 'r-1', phase: 'normal', statusBlock: '{"qid":"x"}' })
  t.setVisibleToolsProvider(() => ['vibe_vmu_status', 'vibe_vmu_turn'])
  const asm = await t.assemble(turn)
  ok(asm.text.includes('【本轮可用工具】vibe_vmu_status、vibe_vmu_turn'),
    '★ 正：状态块里的工具清单来自 provider（真实可见面），不是声明', asm.text.slice(-200))
  const asked = t.visibleToolsOf('r-1')
  ok(asked.ok === true && asked.tools.length === 2 && asked.tools[0] === 'vibe_vmu_status',
    '★ 正：visibleToolsOf 具名读取器返回同一集合', asked)
  const noProvider = mk()
  let refused = null
  try { noProvider.visibleToolsOf('r-1') } catch (e) { refused = e }
  ok(refused && refused.code === 'VMU_ENGINE_UNAVAILABLE', '★ 反：没有 provider ⇒ 具名拒，不返回空数组', refused && refused.code)
  const t2 = mk()
  const { turn: turn2 } = t2.open({ member: 'r-1', phase: 'normal', statusBlock: '{"qid":"x"}' })
  t2.setVisibleToolsProvider(() => [])
  const asm2 = await t2.assemble(turn2)
  ok(!asm2.text.includes('【本轮可用工具】'), '★ 反：没有工具时不写空段（零机制）', asm2.text.slice(-120))
}

// ★ PHASE 8 / round 24: tools:'none' is a PER-TURN override consumed by the pull resolver at request time.
{
  const overrides = new Map()
  const during = []
  const kernel = {
    turn: { step: async () => { during.push(overrides.get('member-a') || null); return { ok: true, receipt: { fields: ['vote_solved'] } } } },
    setMemberToolOverride: ({ member, all }) => { overrides.set(String(member), { all: all === true }); return { ok: true } },
    clearMemberToolOverride: (member) => { overrides.delete(String(member)); return { ok: true } },
    memberToolOverride: (member) => overrides.get(String(member)) || null,
  }
  const spec = makeTurnSpec({ param: (type, description, extra = {}) => ({ type, description, ...extra }), refused: (code, message, hint) => ({ ok: false, code, message, hint }), TOOL_NAMES: { turn: 'vibe_vmu_turn' }, kernel })
  const out = await spec.run({ op: 'step', members: [{ id: 'member-a', role: 'member' }], why: '结题表决', tools: 'none' })
  ok(out && out.ok === true && during.length === 1 && during[0] && during[0].all === true,
    '★ 正：tools:"none" ⇒ 回合执行时该成员的 per-turn override 是 all（pull 解析器据此清空可见集）', during)
  ok(overrides.size === 0, '★ 反：回合结束后 override 被清除（不泄漏到下一回合）', [...overrides.keys()])
}

// ★ PHASE 8 / round 37: tools:{allow:[...]} is the SECOND override shape; unknown names are a NAMED refusal.
{
  const overrides = new Map()
  const during = []
  const kernel = {
    turn: { step: async () => { during.push(overrides.get('member-a') || null); return { ok: true, receipt: { fields: ['vote_solved'] } } } },
    setMemberToolOverride: ({ member, all, allow }) => { overrides.set(String(member), { all: all === true, allow: Array.isArray(allow) ? allow.slice() : null }); return { ok: true } },
    clearMemberToolOverride: (member) => { overrides.delete(String(member)); return { ok: true } },
    validateToolFaceNames: (names) => {
      const known = ['vibe_vmu_vote', 'vibe_vmu_tools']
      for (const n of names) if (!known.includes(n)) { const e = new Error('unknown tool face name in tools.allow: ' + n); e.code = 'VMU_INVALID_ARGUMENT'; e.hint = 'known faces: ' + known.join(', '); throw e }
      return { ok: true, names: names.slice() }
    },
  }
  const spec = makeTurnSpec({ param: (type, description, extra = {}) => ({ type, description, ...extra }), refused: (code, message, hint) => ({ ok: false, code, message, hint }), TOOL_NAMES: { turn: 'vibe_vmu_turn' }, kernel })
  const out = await spec.run({ op: 'step', members: [{ id: 'member-a', role: 'member' }], why: '只挂表决工具', tools: { allow: ['vibe_vmu_vote'] } })
  ok(out && out.ok === true && during.length === 1 && during[0] && Array.isArray(during[0].allow) && during[0].allow.join(',') === 'vibe_vmu_vote' && during[0].all === false,
    '★ 正：tools:{allow:[vibe_vmu_vote]} ⇒ 回合执行时该成员只挂 allow 面（不是空面）', during)
  ok(overrides.size === 0, '★ 反：allow 回合结束后 override 被清除', [...overrides.keys()])
  // the REAL tool schema types tools as a string, so the model sends the object form JSON-encoded; that ONE form must
  // normalize to the same branch (and any other string shape must be refused, not silently ignored).
  const encoded = await spec.run({ op: 'step', members: [{ id: 'member-a', role: 'member' }], why: 'JSON 字符串形态', tools: JSON.stringify({ allow: ['vibe_vmu_vote'] }) })
  ok(encoded && encoded.ok === true && during.length === 2 && Array.isArray(during[1].allow) && during[1].allow.join(',') === 'vibe_vmu_vote',
    '★ 正：tools 以 JSON 字符串送达（真实 schema 是 string）⇒ 归一化后仍只挂 allow', during)
  const shape = await spec.run({ op: 'step', members: [{ id: 'member-a', role: 'member' }], why: '不认识的 tools 形态', tools: 'wat' })
  ok(shape && shape.ok === false && shape.code === 'VMU_INVALID_ARGUMENT' && during.length === 2,
    '★ 反：不认识的 tools 字符串 ⇒ 具名拒，不静默走角色收窄', shape)
  const before = during.length
  const bad = await spec.run({ op: 'step', members: [{ id: 'member-a', role: 'member' }], why: '未知工具名', tools: { allow: ['ghost_tool'] } })
  ok(bad && bad.ok === false && bad.code === 'VMU_INVALID_ARGUMENT' && during.length === before,
    '★ 反：allow 里的未注册名 ⇒ 具名拒（VMU_INVALID_ARGUMENT），且该回合不执行', bad)
}

// ★ MEASURED ON A LIVE RUN: a caller passed `members: ['member']` — an obvious reading of the declared shape
// `[{id, role}]` — and the turn answered `stopped: 'no-members'` while the roster held a seated member, because the
// kernel reads `.id` off each entry and a string yields none. A false "no members" is WORSE than a refusal: it cannot
// be acted on. Three assertions below: a bare id is normalised, a wrongly-shaped entry is refused BY NAME, and an
// omitted `members` still infers from the roster (the behaviour ROUND 45 added).
{
  const refused = (code, message, hint) => ({ ok: false, code, message, hint })
  const param = (type, description, opts) => Object.assign({ type, description }, opts || {})
  const mkTurnSpec = (kernel) => makeTurnSpec({ param, refused, TOOL_NAMES: { turn: 'vibe_vmu_turn' }, kernel })
  const capture = () => {
    const seen = []
    return {
      seen,
      kernel: {
        turn: { step: async (a) => { seen.push(a && a.members); return { ok: true, receipt: { executed: 0 } } }, status: () => ({ apiVersion: 1 }) },
        members: { roster: () => [{ id: 'r-1', state: 'live', slot: 'member' }] },
        setMemberToolOverride: () => ({ ok: true }), clearMemberToolOverride: () => ({ ok: true }),
        validateToolFaceNames: () => ({ ok: true }), setActiveTurnMember: () => ({ ok: true }),
      },
    }
  }
  // 正：裸 id 字符串被规范化成 {id}，不再产出假的 no-members
  {
    const c = capture()
    await mkTurnSpec(c.kernel).run({ op: 'step', members: ['r-1'] })
    const got = c.seen[c.seen.length - 1]
    ok(Array.isArray(got) && got.length === 1 && got[0] && got[0].id === 'r-1',
      '★ 真机反例：members:["r-1"] 被规范化成 [{id:"r-1"}]（旧行为：id 读不到 ⇒ 假的 stopped:no-members）', got)
  }
  // 正：缺省 members 仍从名册推断
  {
    const c = capture()
    await mkTurnSpec(c.kernel).run({ op: 'step' })
    const got = c.seen[c.seen.length - 1]
    ok(Array.isArray(got) && got.length === 1 && got[0].id === 'r-1' && got[0].role === 'member',
      '★ 缺省 members ⇒ 从名册推断 [{id,role}]（契约原本这么写，ROUND 45 才真的这么做）', got)
  }
  // 反：形状错误的项 ⇒ 具名拒，且引擎没被执行
  {
    const c = capture()
    const res = await mkTurnSpec(c.kernel).run({ op: 'step', members: [123] })
    ok(res && res.ok === false && res.code === 'VMU_INVALID_ARGUMENT' && /members/.test(String(res.hint)) && c.seen.length === 0,
      '★ 反：members 里有形状错误的项 ⇒ 具名 VMU_INVALID_ARGUMENT（hint 给出正确形状），引擎不执行', { res, calls: c.seen.length })
  }
}

// ★ G6 tier 2 (measured on a real machine): a member turn that calls `vibe_vmu_turn` used to QUEUE behind the very
// step delivering it (measured 175.7s), the outer step hit its 180s delivery timeout, the timeout's finally cleared
// the active-member scalar, and the member's NEXT request resolved no member and leaked the full 87-tool host
// catalogue. Two guards, both asserted here: member step/drive is refused BY NAME, and member status runs directly.
{
  const refused = (code, message, hint) => ({ ok: false, code, message, hint })
  const param = (type, description, opts) => Object.assign({ type, description }, opts || {})
  const mkTurnSpec = (kernel) => makeTurnSpec({ param, refused, TOOL_NAMES: { turn: 'vibe_vmu_turn' }, kernel })
  const baseKernel = (turnStep) => ({
    turn: { step: turnStep || (async () => ({ ok: true })), status: () => ({ apiVersion: 1 }) },
    members: { roster: () => [{ id: 'r-1', state: 'live', slot: 'member' }] },
    setMemberToolOverride: () => ({ ok: true }), clearMemberToolOverride: () => ({ ok: true }),
    validateToolFaceNames: () => ({ ok: true }), setActiveTurnMember: () => ({ ok: true }),
  })
  // (a) 反：成员不能 drive/step 回合引擎 —— 具名拒，且引擎真的没执行。
  {
    let stepped = 0
    const kernel = baseKernel(async () => { stepped += 1; return { ok: true } })
    const spec = mkTurnSpec(kernel)
    const res = await spec.run({ op: 'step', members: [{ id: 'r-1', role: 'member' }], tools: { allow: ['vibe_vmu_task'] } },
      { agent: { id: 'child-1' } })
    ok(res && res.ok === false && res.code === 'VMU_NOT_PERMITTED' && /member turn/.test(String(res.message)) && stepped === 0,
      '★ G6 反：成员回合调用 turn.step ⇒ 具名 VMU_NOT_PERMITTED（引擎不执行，不是排队空等）', { res, stepped })
  }
  // (b) 正：成员在回合内读 turn.status ⇒ 立即返回，不排在自己的 step 后面（旧行为：300ms 超时 / 真机 175.7s）。
  {
    let spec = null
    let nested = null
    const kernel = baseKernel(async () => {
      const t0 = Date.now()
      nested = await Promise.race([
        spec.run({ op: 'status' }, { agent: { id: 'child-1' } }),
        new Promise((r) => setTimeout(() => r({ timedOut: true }), 300)),
      ])
      return { ok: true, nestedMs: Date.now() - t0 }
    })
    spec = mkTurnSpec(kernel)
    const outer = await spec.run({ op: 'step', members: [{ id: 'r-1', role: 'member' }], tools: { allow: ['vibe_vmu_task'] } },
      { agent: { id: 'session-root' } })
    ok(outer && outer.ok === true && nested && nested.ok === true,
      '★ G6 正：成员在回合内读 turn.status ⇒ 立即返回（绕过队列），同一 step 正常完成——不再 175s 死等', { outer, nested })
  }
  // (c) 正：root 的并行调用仍按队列串行完成（修法没有把 root 的合法并行变成拒绝）。
  {
    const spec = mkTurnSpec(baseKernel())
    const [a, b] = await Promise.all([
      spec.run({ op: 'status' }, { agent: { id: 'session-root' } }),
      spec.run({ op: 'status' }, { agent: { id: 'session-root' } }),
    ])
    ok(a && a.ok === true && b && b.ok === true,
      '★ G6 正：root 的并行调用仍按队列串行完成（root 的合法并行没有被误拒）', { a: a && a.ok, b: b && b.ok })
  }
}

// ★ G7 ④ (real machine): the step receipt said only `executed:1/parsed:3`, so the root could not see WHAT the member
// called inside its turn. The host hook now records a bounded index (name/phase/ok) and the step receipt carries a
// SUMMARY: names + call/receipt counts + the result ok, never full receipts.
{
  let calls = []
  const recorder = {
    memberToolCalls: (m) => calls.filter((c) => c.member === m),
    clearMemberToolCalls: (m) => { calls = calls.filter((c) => c.member !== m) },
  }
  const t = createTurnOrchestrator({ sectionPolicy: DECIDE_SECTIONS, prompt: pipeline(), ...recorder,
    deliver: async ({ turn }) => {
      const m = turn.member
      calls.push({ member: m, name: 'vibe_vmu_meeting', phase: 'call', ok: null })
      calls.push({ member: m, name: 'vibe_vmu_meeting', phase: 'result', ok: true })
      calls.push({ member: m, name: 'vibe_v5_paper', phase: 'call', ok: null })
      calls.push({ member: m, name: 'vibe_v5_paper', phase: 'result', ok: false })
      return fence({ progress: 'did the work' })
    },
    faces: { 'vmu.records': { put: async () => ({ ok: true }) } },
  })
  const out = await t.step({ members: [{ id: 'r-2', role: 'member' }], why: 'G7 toolCalls' })
  const tc = out && out.receipt && out.receipt.toolCalls
  ok(Array.isArray(tc) && tc.length === 2 &&
    tc.some((x) => x.name === 'vibe_vmu_meeting' && x.called === 1 && x.receipts === 1 && x.ok === true) &&
    tc.some((x) => x.name === 'vibe_v5_paper' && x.called === 1 && x.receipts === 1 && x.ok === false),
    '★ G7 ④ 正：step 回执带 toolCalls 摘要（名字 + 调用/回执次数 + 成败），root 能看见成员这轮调了什么',
    tc)
  ok(Array.isArray(tc) && tc.length === 2 && tc.every((x) => Object.keys(x).sort().join(',') === 'called,name,ok,receipts'),
    '★ G7 ④ 反：摘要是体积受控的形状 — 只有 name/called/receipts/ok，不携带任何完整回执', tc && tc.map((x) => Object.keys(x).sort().join(',')))
  const quiet = createTurnOrchestrator({ sectionPolicy: DECIDE_SECTIONS, prompt: pipeline(), ...recorder,
    deliver: async () => fence({ progress: 'no tools' }),
    faces: { 'vmu.records': { put: async () => ({ ok: true }) } },
  })
  const quietOut = await quiet.step({ members: [{ id: 'r-2', role: 'member' }], why: 'G7 no calls' })
  ok(quietOut && quietOut.receipt && Array.isArray(quietOut.receipt.toolCalls) && quietOut.receipt.toolCalls.length === 0,
    '★ G7 ④ 反：成员没用工具 ⇒ 摘要为空数组（形状稳定，不是缺字段）', quietOut && quietOut.receipt && quietOut.receipt.toolCalls)
}

console.log('=== VMU TURN: ' + passed + ' passed, ' + failed + ' failed ===')
for (const f of failures) console.log('  FAIL ' + f)
process.exit(failed === 0 ? 0 : 1)

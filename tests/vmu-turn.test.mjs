// tests/vmu-turn.test.mjs — the turn loop itself, on the framework side (docs/26).
//
// The goal's first objective is to move the ORCHESTRATION of a member turn into the framework, so that a host which
// installs only the framework can run an institute. This suite holds the loop to the five acceptance points written
// in docs/26 §5: assembly really comes from the pipeline (and is refused when there is none), parsing refuses three
// different ways for three different reasons, the plan gives every field exactly one owner, dispatch reaches the
// owning face and REPORTS what it could not reach, and assembly is deterministic.
//
// Run: node tests/vmu-turn.test.mjs   (last line: === VMU TURN: N passed, M failed ===)

import { createTurnOrchestrator, FIELD_OWNERS, FIELDS, extractFence } from '../vibe-math-vmu/kernel/turn/index.js'
import { createPromptPipeline } from '../vibe-math-vmu/kernel/prompt/index.js'
import { v5rPromptSections } from '../vibe-math-vmu/packs/v5r-core.js'

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
    'vmu.minutes': { say: async (p) => { calls.push(['minutes.say', p]); return { ok: true } } },
    'vmu.tasks': { create: async (p) => { calls.push(['tasks.create', p]); return { ok: true } } },
  }
  const t = createTurnOrchestrator({ prompt: pipeline(), faces })
  const out = await t.apply({ say: 'hello', task_create: { title: 'x' } })
  ok(out.ok === true && out.executed.length === 2 && calls.length === 2,
    'T14. ★★★ each field reaches the face that owns it, exactly once', { executed: out.executed.length })
  ok(calls.some((c) => c[0] === 'minutes.say') && calls.some((c) => c[0] === 'tasks.create'),
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
    faces: { 'vmu.records': { progress: async () => ({ ok: true }) } },
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

console.log('=== VMU TURN: ' + passed + ' passed, ' + failed + ' failed ===')
for (const f of failures) console.log('  FAIL ' + f)
process.exit(failed === 0 ? 0 : 1)

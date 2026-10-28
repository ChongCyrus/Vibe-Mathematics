// ★ RUN 117 — a seat face that only lives on one road, and two declarations that had to be checked against the face
// they describe. Every case below is asserted against what the entry REALLY answers (measured by running it), not
// against what a summary of the run said — that difference is the whole point of this file.

import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..')
const ENTRY = join(REPO, 'vibe-math-vmu', 'vibe-math-vmu.js')

let passed = 0
let failed = 0
const ok = (cond, label, detail) => {
  if (cond) { passed++; console.log('  ok   ' + label); return true }
  failed++
  console.error('  FAIL ' + label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  return false
}

const entry = await import(pathToFileURL(ENTRY).href)
const roots = []
const mkRoot = async () => { const d = await mkdtemp(join(tmpdir(), 'vmu-r117-')); roots.push(d); return d }

const boot = async (root) => {
  const state = { specs: [] }
  const ctx = {
    effect(fn) { return fn() },
    on() { return () => {} },
    tools: { register: async (spec) => { state.specs.push(spec); return () => {} } },
  }
  const handle = entry.apply(ctx, { clock: () => 1000, packs: ['v5r'], root })
  await handle.ready()
  await handle.kernel.store.open()
  return { handle, K: handle.kernel, specOf: (n) => state.specs.find((s) => s.name === n) }
}
const call = async (b, name, args, exec = {}) => {
  const spec = b.specOf(name)
  if (!spec) return { missing: true }
  let raw
  try { raw = await spec.execute(args, exec) } catch (e) {
    return { thrown: true, code: e && e.code, message: e && e.message, hint: e && e.hint }
  }
  try { return { parsed: JSON.parse(raw) } } catch { return { raw } }
}

try {
  // ── §1 A8 — the generic records face is the SAME act as `vibe_v5_record_<kind>`, so it answers to the same seat gate
  {
    console.log('§1 A8 — the generic records face does not widen the seat face it mirrors')
    const root = await mkRoot()
    const b = await boot(root)
    await b.K.members.hire({ id: 'r-1', slot: 'member' })
    await b.K.members.hire({ id: 'r-t1', slot: 'temp' })
    ok(b.specOf('vibe_vmu_records') !== undefined, 'the entry publishes the generic records face')

    // The host learns "which session is which member" from the durable fold; this test tells it the same fact.
    await b.K.store.write('member_sessions', [
      { member: 'r-1', session: 'session-probe-member' },
      { member: 'r-t1', session: 'session-probe-temp' },
    ])
    ok(b.K.memberBySession('session-probe-temp') === 'r-t1',
      'the fixture really resolves the temp session to its member', b.K.memberBySession('session-probe-temp'))

    const temp = await call(b, 'vibe_vmu_records',
      { action: 'append', kind: 'proposition', statement: '临时工不该写这里' },
      { agent: { id: 'session-probe-temp' } })
    ok(temp.parsed && temp.parsed.ok !== true,
      'A8: a temp worker writing a proposition through the GENERIC face is refused', temp.parsed && temp.parsed.code)
    ok(temp.parsed && temp.parsed.code === 'VMU_TOOL_NOT_IN_FACE',
      'A8: the refusal is `VMU_TOOL_NOT_IN_FACE` — the same code the seat face gives for the named tool', temp.parsed && temp.parsed.code)
    const face = temp.parsed && temp.parsed.seatFace
    ok(face && face.member === 'r-t1' && face.tool === 'vibe_v5_record_proposition',
      'A8: the receipt names the seat and the tool it was judged against', face)
    ok(typeof (temp.parsed && temp.parsed.seatFaceMeans) === 'string' && /SAME seat gate/i.test(temp.parsed.seatFaceMeans),
      'A8: the receipt says it is the SAME gate the pack tool uses', temp.parsed && temp.parsed.seatFaceMeans)

    // OFFICE ROAD: no member seat on the call ⇒ the write is still allowed (the documented road).
    const office = await call(b, 'vibe_vmu_records', { action: 'append', kind: 'proposition', statement: '办公室记的命题' })
    ok(office.parsed && office.parsed.ok === true,
      'A8: the office road (no member seat) is unchanged — it may still write', office.parsed && office.parsed.code)

    // RESIDENT MEMBER: keeps the library writes its seat face allows, and the receipt discloses the seat.
    const member = await call(b, 'vibe_vmu_records',
      { action: 'append', kind: 'proposition', statement: '常驻研究员记的命题' },
      { agent: { id: 'session-probe-member' } })
    ok(member.parsed && member.parsed.ok === true,
      'A8: a resident member may still record a proposition (the gate is a mirror, not a wall)', member.parsed && member.parsed.code)
    ok(member.parsed && member.parsed.seatFace && member.parsed.seatFace.allowed === true,
      'A8: the allowed receipt discloses the seat it was judged under (a silent allow is not a disclosure)', member.parsed && member.parsed.seatFace)
  }

  // ── §2 C10 — `lean_run`'s declared shape and its face agree about `statement`
  {
    console.log('§2 C10 — the declaration of `lean_run` says what the face does')
    const root = await mkRoot()
    const b = await boot(root)
    const spec = b.specOf('vibe_v5_lean_run')
    ok(spec !== undefined, 'the entry publishes `vibe_v5_lean_run`')
    const schema = (spec && spec.parameters) || {}
    const props = schema.properties || {}
    const required = Array.isArray(schema.required) ? schema.required : []
    ok(required.includes('statement'),
      'C10: `statement` is DECLARED required (run 58 measured the schema calling it optional while the face refused without it)', required)
    ok(typeof (spec && spec.description) === 'string' && /LIBRARY ROOT/.test(spec.description),
      'C10: the description says `file` is resolved against the LIBRARY ROOT (a short path is not universal)', spec && spec.description && spec.description.slice(0, 80))
    ok(typeof (props.target && props.target.description) === 'string' && /legacy alias/i.test(props.target.description),
      'C10: `target` is declared for what it is — a legacy alias of the proposition, not an object id', props.target && props.target.description)

    // ★ AND THE ORDER OF THE TWO REFUSALS IS HONEST: with no Lean face at all the assembly says exactly that
    // (`VMU_ENGINE_UNAVAILABLE`, naming the missing seam) — the argument check lives INSIDE the face, so a missing
    // engine is reported before a missing statement. Recorded because it is the road a caller without `config.math`
    // actually walks; the statement-vs-face agreement is covered where a face exists (run 58 suite).
    const noFace = await call(b, 'vibe_v5_lean_run', { file: 'whatever.lean' })
    ok(noFace.parsed && noFace.parsed.code === 'VMU_ENGINE_UNAVAILABLE',
      'C10: an assembly with no Lean face refuses `VMU_ENGINE_UNAVAILABLE` (the engine check precedes the argument check)', noFace.parsed && noFace.parsed.code)
    ok(noFace.parsed && /spawn seam/i.test(String(noFace.parsed.message)),
      'C10: that refusal names the missing seam', noFace.parsed && noFace.parsed.message)
  }

  // ── §3 the paper face: the actions that address ONE paper refuse without it, and `sections` does not
  {
    console.log('§3 — a paper action that addresses one paper refuses without a target')
    const root = await mkRoot()
    const b = await boot(root)
    ok(b.specOf('vibe_v5_paper') !== undefined, 'the entry publishes `vibe_v5_paper`')

    const noTarget = await call(b, 'vibe_v5_paper', { action: 'start' })
    ok(noTarget.parsed && noTarget.parsed.code === 'VMU_INVALID_ARGUMENT',
      '§3: `start` without a target is refused `VMU_INVALID_ARGUMENT`', noTarget.parsed && noTarget.parsed.code)
    ok(noTarget.parsed && /addresses ONE paper/.test(String(noTarget.parsed.message)),
      '§3: the message says the action addresses ONE paper (not "no paper exists")', noTarget.parsed && noTarget.parsed.message)
    ok(noTarget.parsed && /target/.test(String(noTarget.parsed.hint)) && /status/.test(String(noTarget.parsed.hint)),
      '§3: the hint names the argument and the read that lists papers', noTarget.parsed && noTarget.parsed.hint)

    const sections = await call(b, 'vibe_v5_paper', { action: 'sections' })
    ok(sections.parsed && sections.parsed.ok === true && Array.isArray(sections.parsed.sections),
      '§3: `sections` does not address one paper, so it needs no target', sections.parsed && sections.parsed.ok)
  }
} finally {
  for (const r of roots) { try { await rm(r, { recursive: true, force: true, maxRetries: 20, retryDelay: 50 }) } catch { /* windows */ } }
}

console.log('\n=== VMU RUN117 (A8 generic face / lean_run declaration / paper target): ' + passed + ' passed, ' + failed + ' failed ===')
if (failed > 0) process.exitCode = 1

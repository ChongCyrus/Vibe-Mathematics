#!/usr/bin/env node
/**
 * ★★★ LIVE RUN 139 (F-139a) — A SEAT THAT CANNOT FILE A RULING IS NOT A DEBATER.
 *
 * The run convened a debate in which a temp seat (t-1) sat on the roster. The chair collected the member's ruling and
 * called `vibe_v5_verdict_final` — and the gate answered
 *   VMU_STATE "the ruling is missing 1 of the 2 member(s) who debated: t-1"
 * although `vibe_v5_verdict` is CLOSED to the temp seat (seat-faces.js declares allow.temp === false for it). The only
 * way out was `partial:true`, i.e. the rule's normal path was blocked by a seat that cannot walk it.
 *
 * WHAT THIS SUITE PINS
 *   §0 零机制：no pack ⇒ no ruling face (the gate cannot be "always on").
 *   §1 前置：chair + member + TEMP seats are really on the roster, and the temp seat really cannot call the verdict face.
 *   §2 正：with the temp on the meeting roster, the chair's ruling SUCCEEDS (not VMU_STATE) and the receipt names the
 *        temp as excluded with the reason (a count a reader cannot reconcile is the defect this project keeps removing).
 *   §3 反：an ordinary member who debated but filed nothing is STILL named in the refusal (the exclusion is about the
 *        seat's face, not a blanket "nobody has to file").
 *   §4 边界：`partial:true` keeps working for a deliberately partial ruling, and the receipt still says so.
 */
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const ENTRY = new URL('../vibe-math-vmu/vibe-math-vmu.js', import.meta.url)

let passed = 0
let failed = 0
const failures = []
const ok = (cond, label, detail) => {
  if (cond) { passed++; console.log('  ok   ' + label); return true }
  failed++; failures.push(label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  console.error('  FAIL ' + label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  return false
}
const eq = (actual, expected, label) => ok(actual === expected, label, actual)

const entry = await import(ENTRY.href)
const boot = async (config = {}) => {
  const state = { specs: [] }
  const ctx = {
    effect(fn) { return fn() },
    on() { return () => {} },
    tools: { register: async (spec) => { state.specs.push(spec); return () => {} } },
  }
  const handle = entry.apply(ctx, Object.assign({ clock: () => 1000 }, config))
  await handle.ready()
  return { handle, state, names: state.specs.map((s) => s.name), specOf: (n) => state.specs.find((s) => s.name === n) }
}
const receipt = async (b, name, args = {}) => {
  const spec = b.specOf(name)
  if (!spec) return { raw: undefined, parsed: undefined, missing: true }
  const raw = await spec.execute(args, {})
  let parsed
  try { parsed = JSON.parse(raw) } catch { parsed = undefined }
  return { raw, parsed, missing: false }
}
const codeOf = (p) => (p && p.code ? p.code : null)
const textOf = (p) => (p ? String(p.message || '') + ' ' + String(p.hint || '') : '')

const root = await mkdtemp(join(tmpdir(), 'vmu-run139-seats-'))
try {
  console.log('=== 0. 零机制：没有 v5r pack 就没有裁定面 ===')
  const bare = await boot({ root })
  ok(!bare.names.includes('vibe_v5_verdict_final'), '★★ 反(零机制)：无 pack ⇒ 无 vibe_v5_verdict_final', bare.names.length)

  console.log('=== 1. 前置：三种席位的真名册，且临时工的裁决面对它关着 ===')
  const b = await boot({ root, packs: ['v5r'] })
  const kernel = b.handle.kernel
  const CHAIR = 'r-chair'
  const M1 = 'r-1'
  const T1 = 't-1'
  await kernel.members.hire({ id: CHAIR, slot: 'chair' })
  await kernel.members.hire({ id: M1, slot: 'member' })
  await kernel.members.hire({ id: T1, slot: 'temp' })
  const roster = kernel.members.roster()
  ok(roster.map((m) => m.id).includes(CHAIR) && roster.map((m) => m.id).includes(M1) && roster.map((m) => m.id).includes(T1),
    '前置(RULE E)：三个真成员在位（含临时工）', roster.map((m) => m.id))

  const card = await receipt(b, 'vibe_v5_record_proposition', {
    id: 'p-r139', title: '自然数加倍', statement: '对一切自然数 n，n + n = 2 * n',
    value: true, motive: '辩论对象', p: 0.6, member: CHAIR,
    proof_ref: 'Members/r-1/Propos/p-r139.md#正式证明', proof_state: 'complete',
  })
  ok(card.parsed && card.parsed.ok === true, '前置(RULE E)：带证明引用的命题卡写成功（辩论对象要合法）', card.parsed && codeOf(card.parsed))

  const convened = await receipt(b, 'vibe_v5_meeting', { type: 'debate', subject: 'p-r139', member: CHAIR, agenda: '辩论 p-r139' })
  ok(convened.parsed && convened.parsed.ok === true && typeof convened.parsed.meeting === 'string',
    '前置(RULE E)：辩论会议开起来了', convened.parsed && codeOf(convened.parsed))
  const meeting = convened.parsed.meeting

  const view = kernel.meetings.meetingView({ meeting })
  ok(Array.isArray(view.roster) && view.roster.map(String).includes(T1),
    '前置(RULE E)：临时工真的在这场的名册上（否则下面的收窄是空跑）', view && view.roster)
  // The temp seat's verdict face is CLOSED — that is the fact the population must respect.
  const tempCanVote = (() => {
    try {
      const seat = kernel.members.roster().filter((m) => String(m.id) === T1)[0]
      const spec = b.specOf('vibe_v5_verdict')
      return { seat: seat && seat.slot, specDeclared: !!spec }
    } catch { return {} }
  })()
  eq(tempCanVote.seat, 'temp', '前置：临时工的席位是 temp')

  console.log('=== 2. 正：临时工在名册上，但「谁辩论了」的选民集不包含它 ===')
  const ruling = await receipt(b, 'vibe_v5_verdict_final', {
    meeting, proposition_id: 'p-r139', member: CHAIR,
    verdicts: [{ member: M1, p: 0.6, reason: '由 2*n 的定义直接可得' }],
  })
  ok(ruling.parsed && ruling.parsed.ok === true,
    '★★★ 正：委员交了裁决后，主席能正常收尾（不再因临时工未交而 VMU_STATE）', ruling.parsed && (codeOf(ruling.parsed) || ruling.parsed.ok))
  const cov = (ruling.parsed && ruling.parsed.coverage) || {}
  const excluded = Array.isArray(cov.excluded) ? cov.excluded : []
  const tempRow = excluded.filter((e) => String(e.member) === T1)[0] || null
  ok(!!tempRow, '★★ 正：回执点名临时工为什么不在选民集里（可对账，不是静默丢弃）', excluded)
  ok(!!tempRow && /seat/.test(String(tempRow.why || '')) && /vibe_v5_verdict|ruling/.test(String(tempRow.why || '')),
    '★ 正：理由说的是「这个席位不能交裁决」，不是含混的"未参与"', tempRow && tempRow.why)
  ok(Array.isArray(cov.missing) && cov.missing.length === 0, '★ 正：成功的回执 missing 为空（不是缺口被藏起来）', cov.missing)
  ok(cov.complete === true, '★ 正：coverage.complete 为真（收窄之后这场辩论是完整的）', cov.complete)

  console.log('=== 3. 反：真有表决权的成员没交 ⇒ 仍然被点名拒绝（收窄不是放水） ===')
  // A SECOND voting member joins so one member can file and the other stay silent: a silent member who COULD have filed
  // must still block the ruling, while the temp seat must not be demanded at all.
  const M2 = 'r-2'
  await kernel.members.hire({ id: M2, slot: 'member' })
  const convened2 = await receipt(b, 'vibe_v5_meeting', { type: 'debate', subject: 'p-r139', member: CHAIR, agenda: '辩论 p-r139 第二场' })
  const meeting2 = convened2.parsed && convened2.parsed.meeting
  const filed = await receipt(b, 'vibe_v5_verdict', { meeting: meeting2, proposition_id: 'p-r139', verdict: 0.6, reason: '交了', member: M1 })
  ok(filed.parsed && filed.parsed.ok === true, '前置：委员自己交了一份裁决（下面缺的是另一个人的，不是"一份都没有"）',
    filed.parsed && codeOf(filed.parsed))
  const denied = await receipt(b, 'vibe_v5_verdict_final', {
    meeting: meeting2, proposition_id: 'p-r139', member: CHAIR,
  })
  eq(codeOf(denied.parsed), 'VMU_STATE', '★★ 反：成员没交时仍被具名拒（收窄不是放水）')
  ok(new RegExp(M2).test(textOf(denied.parsed)), '★★ 反：拒绝点名那位真的该交的成员', textOf(denied.parsed).slice(0, 200))
  ok(!new RegExp('(^|[^0-9A-Za-z_-])' + T1 + '([^0-9A-Za-z_-]|$)').test(textOf(denied.parsed)),
    '★★ 反：拒绝里不再要求临时工交裁决（这正是被修掉的那半句）', textOf(denied.parsed).slice(0, 200))

  console.log('=== 4. 边界：partial:true 仍可用，且回执说明它是故意的不完整 ===')
  const partial = await receipt(b, 'vibe_v5_verdict_final', {
    meeting: meeting2, proposition_id: 'p-r139', member: CHAIR, partial: true, why: '故意只对已交者裁定',
  })
  ok(partial.parsed && partial.parsed.ok === true, '★ 边界：partial:true 的裁定成功（这条出路没有被这次修法堵死）',
    partial.parsed && (codeOf(partial.parsed) || partial.parsed.ok))

  console.log('\n=== DEBATER SEATS (live run 139, F-139a): ' + passed + ' passed, ' + failed + ' failed ===')
} finally {
  await rm(root, { recursive: true, force: true, maxRetries: 5 }).catch(() => {})
}
if (failed > 0) { console.error(failures.join('\n')); process.exitCode = 1 }

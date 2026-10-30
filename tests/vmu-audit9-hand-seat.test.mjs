#!/usr/bin/env node
/**
 * ★★★ G7 AUDIT 9 (C1) — A SEAT THAT MAY NOT ATTEND MAY NOT RAISE A HAND EITHER.
 *
 * Audit 9 measured the invited-temp frame saying "`input`/`hand` are refused with a named code for this seat" while
 * `hand` went straight through: `tools/meeting.js` validated the meeting id and called `queue()`/`handUp()`, and the
 * only thing `queue()` checks is `isMember`. The temp then sat in the floor queue as a name the chair could be ordered
 * to call and that could never be called (`speak()` requires `present`, and `attend` is refused for that seat). One
 * setting decided who may attend (`vmu.meetings.attendDeniedSeats`); the other door never asked it.
 *
 * WHAT THIS SUITE PINS
 *   §0 零机制：the deployment's setting really names the temp seat (so the assertions below are not "it always refuses").
 *   §1 正：a temp seat's `hand` is refused with VMU_NOT_PERMITTED, names the seat and the setting, and hands the caller
 *        a way that IS open (chat).
 *   §2 反：a seated member and the chair raise hands normally (the gate is not a blanket refusal), and the queue
 *        really holds them.
 *   §3 边界：a caller the face cannot name is not refused on a seat it cannot read — it discloses `enforced:false`
 *        elsewhere (measured by absence here: no seatPolicy, the hand succeeds).
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

const root = await mkdtemp(join(tmpdir(), 'vmu-audit9-hand-'))
try {
  const b = await boot({ root, packs: ['v5r'] })
  const kernel = b.handle.kernel
  const CHAIR = 'r-chair'
  const M1 = 'r-1'
  const T1 = 't-1'
  await kernel.members.hire({ id: CHAIR, slot: 'chair' })
  await kernel.members.hire({ id: M1, slot: 'member' })
  await kernel.members.hire({ id: T1, slot: 'temp' })

  console.log('=== 0. 零机制：部署的设置真的点名了 temp 席位 ===')
  const seats = kernel.settingOf('vmu.meetings.attendDeniedSeats')
  ok(Array.isArray(seats) && seats.includes('temp'),
    '★★ 前置：`vmu.meetings.attendDeniedSeats` 真的含 temp（否则下面测的是空集）', seats)
  const seatOfT1 = kernel.seatOfMember(T1)
  eq(seatOfT1, 'temp', '前置：名册读得到的席位确实是 temp')

  const convened = await receipt(b, 'vibe_v5_meeting', { type: 'ordinary', member: CHAIR, agenda: '举手登记' })
  ok(convened.parsed && convened.parsed.ok === true, '前置：会议开起来了', convened.parsed && codeOf(convened.parsed))
  const meeting = convened.parsed && convened.parsed.meeting

  console.log('=== 1. 正：不参会席位举手 ⇒ 具名拒，并指明明说这条坐席的设置 ===')
  const tHand = await receipt(b, 'vibe_vmu_meeting', { action: 'hand', id: meeting, member: T1 })
  eq(codeOf(tHand.parsed), 'VMU_NOT_PERMITTED', '★★★ 正：temp 举手被具名拒（不再静默入队）')
  ok(new RegExp('temp').test(textOf(tHand.parsed)), '★★ 正：拒绝点名那个席位', textOf(tHand.parsed).slice(0, 200))
  ok(/attendDeniedSeats/.test(textOf(tHand.parsed)), '★★ 正：拒绝指明明说的设置键（读者能去改它）', textOf(tHand.parsed).slice(0, 220))
  ok(/vibe_v5_say/.test(textOf(tHand.parsed)), '★ 正：拒绝给出真的走得通的路（群聊）', textOf(tHand.parsed).slice(0, 220))
  const sp = (tHand.parsed && tHand.parsed.seatPolicy) || {}
  eq(sp.seat, 'temp', '★★ 正：回执带 seatPolicy.seat（可对账，不是一句散文）')
  eq(sp.setting, 'vmu.meetings.attendDeniedSeats', '★ 正：seatPolicy 点名设置键')
  eq(sp.enforced, true, '★ 正：seatPolicy.enforced 为真')
  const afterTemp = kernel.meetings.meetingView({ meeting })
  ok(!(afterTemp.order || []).map(String).includes(T1),
    '★★★ 正：队列里没有留下这个幽灵名字（这才是被修掉的那半句）', afterTemp.order)

  console.log('=== 2. 反：在位席位与主席正常举手（不是一律拒） ===')
  const mHand = await receipt(b, 'vibe_vmu_meeting', { action: 'hand', id: meeting, member: M1 })
  ok(mHand.parsed && mHand.parsed.ok === true, '★★ 反：委员举手成功', mHand.parsed && codeOf(mHand.parsed))
  const cHand = await receipt(b, 'vibe_vmu_meeting', { action: 'hand', id: meeting, member: CHAIR })
  ok(cHand.parsed && cHand.parsed.ok === true, '★★ 反：主席举手成功', cHand.parsed && codeOf(cHand.parsed))
  // A SERVICE meeting's hand answers { queued, order }: the order array IS the evidence both really queued (a
  // refusal-shaped receipt carries no order at all).
  const mOrder = (mHand.parsed && Array.isArray(mHand.parsed.order)) ? mHand.parsed.order.map(String) : []
  const cOrder = (cHand.parsed && Array.isArray(cHand.parsed.order)) ? cHand.parsed.order.map(String) : []
  ok(mOrder.includes(M1), '★ 反：委员的举手真的进了队列（order 里有名字）', mOrder)
  ok(cOrder.includes(CHAIR) && cOrder.length > mOrder.length, '★ 反：主席的举手让队列真的变长（不是空操作）', cOrder)

  console.log('=== 3. 边界：读不到席位时不猜（不点名 ⇒ 不按席位拒） ===')
  const anon = await receipt(b, 'vibe_vmu_meeting', { action: 'hand', id: meeting })
  ok(!(anon.parsed && anon.parsed.seatPolicy), '★ 边界：没有名字就没有 seatPolicy（不凭空白造一个席位）',
    anon.parsed && anon.parsed.seatPolicy)

  console.log('\n=== AUDIT 9 C1 (non-attending seat cannot raise a hand): ' + passed + ' passed, ' + failed + ' failed ===')
} finally {
  await rm(root, { recursive: true, force: true, maxRetries: 5 }).catch(() => {})
}
if (failed > 0) { console.error(failures.join('\n')); process.exitCode = 1 }

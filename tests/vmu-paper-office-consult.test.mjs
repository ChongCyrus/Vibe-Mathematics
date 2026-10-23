#!/usr/bin/env node
// ★ E4 — "最后讨论、检查无误后定稿：定稿前必须问所办" — THE GATE ON THE PATH THAT IS ACTUALLY ASSEMBLED.
//
// WHY THIS FILE EXISTS. `vmu.paper.officeConsult` was declared, documented as wired, and read by `kernel/paper.js` —
// a module NOTHING constructs in the live assembly (`createPaper(` appears only in tests/scripts). The paper the
// institute actually runs finalises through `packs/v5r/paper.js` → `kit/paper.js`, which read NONE of those keys, so the
// rule never executed while the settings table said "已接线". The gate now lives on that path (kit/paper.js
// `recordFinal`), and this file proves four things a green light alone would not:
//   ① the refusal is NAMED and carries the facts a caller needs (current value, legal values, which keys were enforced);
//   ② the question SURVIVES (it is written into the paper's state record, so a crash does not re-ask from scratch);
//   ③ every branch refuses — `off` is the ONLY way past, and an unknown timeout policy degrades to `hold`, never to "go";
//   ④ the module holding the gate is REACHABLE from the plugin entry (the root cause of the old defect was "unreachable").
//
// Run: node tests/vmu-paper-office-consult.test.mjs
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { readFileSync } from 'node:fs'
import { isReachableRel } from '../scripts/lib/reachability.mjs'

const HERE = fileURLToPath(new URL('.', import.meta.url))
const REPO = join(HERE, '..')
const VMU = join(REPO, 'vibe-math-vmu')
const PACK = join(VMU, 'packs', 'v5r', 'paper.js')
const KIT = join(VMU, 'kit', 'paper.js')

let passed = 0
let failed = 0
const ok = (cond, name, detail) => {
  if (cond) { passed += 1; console.log('  ✓ ' + name) } else {
    failed += 1
    console.log('  ✗ ' + name + (detail === undefined ? '' : ' :: ' + (typeof detail === 'string' ? detail : JSON.stringify(detail))))
  }
}
// RULE E guard (vmu-verify, R16): two EMPTY collections stringify equal, so a plain
// JSON.stringify comparison passes vacuously (`[]` vs `[]`, `{}` vs `{}`) exactly when the
// flow handed nothing back. Pin that at least one side is a real observation; every call
// site compares against a non-empty expected value, so this guard cannot mask a real diff.
const isEmptyCollection = (v) => Array.isArray(v)
  ? v.length === 0
  : (v !== null && typeof v === 'object' ? Object.keys(v).length === 0 : false)
const eq = (a, b, name) => ok(!(isEmptyCollection(a) && isEmptyCollection(b)) && JSON.stringify(a) === JSON.stringify(b),
  name, { got: a, want: b })

// ── the double: the records face the kit composes (put/get/list) + settings + a roster. No kernel, no timers ───────────
// `records` mirrors the real contract closely enough for the flow: put without id mints one, put WITH id updates the same
// row (that is the single-state-row discipline the kit relies on), list filters by track.
function makeKernel(settings, roster) {
  const rows = new Map()
  let seq = 0
  const kernel = {
    settingsSnapshot: () => ({ ...settings }),
    members: { roster: () => roster.slice() },
    latex: { check: async () => ({ ok: false, code: 'VMU_LATEX_NO_ENGINE', tried: [{ engine: 'xelatex', phase: 'probe', available: false }] }) },
    records: {
      put(r) {
        const id = r.id || ('row-' + (++seq))
        const row = { ...r, id }
        rows.set(id, row)
        return { id, fingerprint: 'fp-' + id }
      },
      get({ id }) { return { record: rows.get(id) || null } },
      list({ track, limit } = {}) {
        const items = [...rows.values()].filter((r) => !track || r.track === track)
        return { items: typeof limit === 'number' ? items.slice(0, limit) : items }
      },
    },
  }
  return { kernel, rows }
}

const ROSTER = [{ id: 'acad', slot: 'chair' }, { id: 'office', slot: 'office' }, { id: 'r-1', slot: 'member' }, { id: 'r-2', slot: 'member' }]
const BASE = { 'vmu.records.tracks': ['paper'] }

/** Boot the LIVE path: `createPaperSubsystem` (the pack shell) over the double, with a movable clock. */
async function boot({ settings = {}, roster = ROSTER } = {}) {
  const pack = await import(pathToFileURL(PACK).href)
  const clock = { now: 1000 }
  const { kernel, rows } = makeKernel({ ...BASE, ...settings }, roster)
  const flow = pack.createPaperSubsystem({ kernel, clock: () => clock.now })
  return { flow, kernel, rows, clock, codes: pack.PAPER_CODES, pack }
}

/** Walk the paper to `awaiting-editor` through the REAL transitions (no state-row surgery: the transitions are the thing
 *  under test here, so faking the stage would let a broken advance pass this file). */
function toEditor(flow, target = 'P-1', participants = ['r-1', 'r-2']) {
  flow.start({ target, participants })
  flow.advance({ target })
  for (const m of participants) flow.recordReview({ target, member: m, deliverable: true })
  return flow.advance({ target })
}

const finalize = async (flow, target = 'P-1', member = 'acad') => {
  try { return { ok: true, receipt: await flow.recordFinal({ target, member, decision: 'deliverable' }) } } catch (e) { return { ok: false, error: e } }
}

console.log('=== ① 闸是开着的：没问过所办就不能定稿，且拒得具名 ===')
{
  const { flow, codes } = await boot({ settings: { 'vmu.paper.officeConsult': 'required' } })
  const moved = toEditor(flow)
  ok(moved.to === 'awaiting-editor', '前提：论文真的走到 awaiting-editor（走真状态机）', moved)
  const r = await finalize(flow)
  ok(r.ok === false && r.error.code === codes.OFFICE_CONSULT_REQUIRED, '★ 正：未问所办 ⇒ 具名拒 VMU_OFFICE_CONSULT_REQUIRED', r.error && r.error.code)
  ok(r.error.code === 'VMU_OFFICE_CONSULT_REQUIRED', '★ 码是登记在 docs/03 §8 的那个字面量（不是包内自造的前缀）', r.error.code)
  ok(/所办/.test(String(r.error.message)) && /定稿/.test(String(r.error.message)), '★ 拒绝文案说明"这是定稿前必须问所办"', String(r.error.message).slice(0, 120))
  ok(/recordConsult/.test(String(r.error.hint)), '★ hint 给出第一条出路（由所办 recordConsult 答复）', r.error.hint)
  eq(r.error.enforced, ['vmu.paper.officeConsult', 'vmu.paper.officeConsultOn', 'vmu.paper.officeConsultTimeoutMs', 'vmu.paper.officeConsultOnTimeout', 'vmu.paper.officeConsultExemptRoles'],
    '★ .enforced 列出五个真正求值的键（不是笼统一句"要看设置"）')
  ok(r.error.currentValue === 'required' && r.error.settingValues && r.error.settingValues['vmu.paper.officeConsult'] === 'required',
    '★ .currentValue/.settingValues 给出当前生效值（调用方不必回头再读设置）', r.error.currentValue)
  ok(typeof r.error.requestId === 'string' && r.error.requestId.startsWith('consult-'), '★ 拒里带提问 id（谁在等、等的是哪一条）', r.error.requestId)
  const st = flow.state('P-1')
  ok(st.state.status === 'awaiting-editor' && st.state.final === null, '★★ 反：被拒后论文状态一点没动（闸在 mutation 之前）', st.state.status)
  const cs = flow.consultState({ target: 'P-1' })
  ok(cs.awaiting && cs.awaiting.id === r.error.requestId, '★★ 提问已落进 state 记录（awaiting 可读）', cs.awaiting)
  ok(cs.policy['vmu.paper.officeConsultOn'] === 'finalize', '★ 未设 officeConsultOn 时按 finalize 报告', cs.policy['vmu.paper.officeConsultOn'])
}

console.log('=== ② 答了 ⇒ 放行，且回执说清是怎么满足的 ===')
{
  const { flow, codes } = await boot({ settings: { 'vmu.paper.officeConsult': 'required' } })
  toEditor(flow)
  const refused = await finalize(flow)
  const answered = flow.recordConsult({ target: 'P-1', by: 'office', note: '已核对合并稿与互审意见' })
  ok(answered.ok === true && answered.answeredBy === 'office' && answered.cleared === true,
    '★ 所办答复落进那一轮提问（cleared=true：确实回答的是已存在的提问，不是新开一条）', answered)
  const r = await finalize(flow)
  ok(r.ok === true && r.receipt.finalized === true, '★ 正：问过并答了 ⇒ 定稿放行', r.error && r.error.code)
  eq(r.receipt.consult && { armed: r.receipt.consult.armed, satisfiedBy: r.receipt.consult.satisfiedBy, answeredBy: r.receipt.consult.answeredBy },
    { armed: true, satisfiedBy: 'answered', answeredBy: 'office' }, '★★ 回执写明"闸是开着的、由答案满足、答复人 office"（不是只说 finalized）')
  ok(r.receipt.consult.requestId === refused.error.requestId, '★ 回执指回同一条提问 id', { got: r.receipt.consult.requestId, want: refused.error.requestId })
}

console.log('=== ③ off / 未设 ⇒ 行为保持不变（默认语义没有被这道闸改写） ===')
{
  const off = await boot({ settings: { 'vmu.paper.officeConsult': 'off' } })
  toEditor(off.flow)
  const r1 = await finalize(off.flow)
  ok(r1.ok === true && r1.receipt.finalized === true, '★ off：不经问询直接定稿（旧行为）', r1.error && r1.error.code)
  eq(r1.receipt.consult, { armed: false, satisfiedBy: 'policy:off', answeredBy: null, requestId: null, note: null },
    '★★ 回执明说"闸没开"，绝不谎称问过所办（安静地假装咨询是最坏的一种绿）')
  ok(off.flow.consultState({ target: 'P-1' }).counters.opened === 0, '★ off 时一条提问都不开（不留下幽灵台账）')
  const unset = await boot({ settings: {} })
  toEditor(unset.flow)
  const r2 = await finalize(unset.flow)
  ok(r2.ok === true && r2.receipt.consult.armed === false && r2.receipt.consult.satisfiedBy === 'policy:off',
    '★ 键压根没设 ⇒ 也按 off 处理（"未设 ⇒ 行为不变"）', r2.receipt && r2.receipt.consult)
}

console.log('=== ④ 只有声明的答复角色能答；别人答 ⇒ 具名拒，且不算数 ===')
{
  const { flow } = await boot({ settings: { 'vmu.paper.officeConsult': 'required' } })
  toEditor(flow)
  await finalize(flow)
  let err = null
  try { flow.recordConsult({ target: 'P-1', by: 'r-1', note: '我觉得没问题' }) } catch (e) { err = e }
  ok(err && err.code === 'VMU_NOT_PERMITTED', '★ 反：普通成员不能替所办答复（VMU_NOT_PERMITTED）', err && err.code)
  eq(err && err.declared, ['office'], '★ 拒里列出"谁能答"（declared: [office]）——答复角色是 pack 声明的事实')
  ok(err && err.received === 'r-1', '★ 拒里带收到的当事人 id', err && err.received)
  const r = await finalize(flow)
  ok(r.ok === false, '★★ 被拒的答复不改变任何东西：定稿仍被挡', r.error && r.error.code)
  let noBy = null
  try { flow.recordConsult({ target: 'P-1', note: '忘了写谁' }) } catch (e) { noBy = e }
  ok(noBy && noBy.code === 'VMU_INVALID_ARGUMENT' && /by/.test(String(noBy.message)), '★ 不写 by ⇒ 具名拒（不默认"系统"）', noBy && noBy.code)
  let afterFinal = null
  try { flow.recordConsult({ target: 'P-404', by: 'office' }) } catch (e) { afterFinal = e }
  ok(afterFinal && afterFinal.code === 'VMU_PACK_V5R_CORE_PAPER_STATE', '★ 不存在的论文 ⇒ 具名拒（CODE 来自 pack，不是猜的）', afterFinal && afterFinal.code)
}

console.log('=== ⑤ 豁免角色：点了名的角色反问不着 ===')
{
  const { flow } = await boot({ settings: { 'vmu.paper.officeConsult': 'required', 'vmu.paper.officeConsultExemptRoles': ['chair'] } })
  toEditor(flow)
  const r = await finalize(flow)
  ok(r.ok === true && r.receipt.finalized === true, '★ 正：定稿人在豁免名单里 ⇒ 放行', r.error && r.error.code)
  eq(r.receipt.consult && { armed: r.receipt.consult.armed, satisfiedBy: r.receipt.consult.satisfiedBy }, { armed: true, satisfiedBy: 'exempt' },
    '★★ 回执说"闸开着但被豁免放行"，并附豁免理由（不是伪装成 answered）')
  ok(/officeConsultExemptRoles/.test(String(r.receipt.consult.note)), '★ 豁免理由点到那个键（可追溯）', r.receipt.consult.note)
  const miss = await boot({ settings: { 'vmu.paper.officeConsult': 'required', 'vmu.paper.officeConsultExemptRoles': ['someone-else'] } })
  toEditor(miss.flow)
  const r2 = await finalize(miss.flow)
  ok(r2.ok === false, '★ 反：豁免名单没点到他 ⇒ 照旧拒', r2.error && r2.error.code)
}

console.log('=== ⑥ 超时：hold 保留提问、refuse 作废重开——两条路都不放行 ===')
{
  const hold = await boot({ settings: { 'vmu.paper.officeConsult': 'required', 'vmu.paper.officeConsultTimeoutMs': 1000, 'vmu.paper.officeConsultOnTimeout': 'hold' } })
  toEditor(hold.flow)
  const first = await finalize(hold.flow)
  const openedId = first.error.requestId
  hold.clock.now += 5000
  const r = await finalize(hold.flow)
  ok(r.ok === false && r.error.code === hold.codes.OFFICE_CONSULT_TIMEOUT, '★ hold：超时后具名拒 VMU_OFFICE_CONSULT_TIMEOUT（不是继续拿 REQUIRED 糊过去）', r.error && r.error.code)
  ok(r.error.heldOnTimeout === true && r.error.requestCleared === false, '★★ hold 分支：提问保留（heldOnTimeout）且没有作废', { held: r.error.heldOnTimeout, cleared: r.error.requestCleared })
  ok(r.error.timeoutMs === 1000 && typeof r.error.waitedMs === 'number' && r.error.waitedMs > 1000, '★ 拒里给出超时值与已等待毫秒', { timeoutMs: r.error.timeoutMs, waitedMs: r.error.waitedMs })
  ok(hold.flow.consultState({ target: 'P-1' }).awaiting && hold.flow.consultState({ target: 'P-1' }).awaiting.id === openedId,
    '★★ hold 后还是同一提问（没被悄悄重开，否则等待理由就消失了）', openedId)
  ok(hold.flow.consultState({ target: 'P-1' }).counters.timedOut === 1, '★ 记了一次超时', hold.flow.consultState({ target: 'P-1' }).counters.timedOut)

  const refuse = await boot({ settings: { 'vmu.paper.officeConsult': 'required', 'vmu.paper.officeConsultTimeoutMs': 1000, 'vmu.paper.officeConsultOnTimeout': 'refuse' } })
  toEditor(refuse.flow)
  const f1 = await finalize(refuse.flow)
  refuse.clock.now += 5000
  const r2 = await finalize(refuse.flow)
  ok(r2.ok === false && r2.error.code === refuse.codes.OFFICE_CONSULT_TIMEOUT && r2.error.requestCleared === true,
    '★ refuse：超时后作废该提问（requestCleared）', r2.error && { code: r2.error.code, cleared: r2.error.requestCleared })
  ok(refuse.flow.consultState({ target: 'P-1' }).awaiting === null, '★★ refuse 之后没有"还在等"的提问（作废是真的）', refuse.flow.consultState({ target: 'P-1' }).awaiting)
  const r3 = await finalize(refuse.flow)
  ok(r3.ok === false && r3.error.code === refuse.codes.OFFICE_CONSULT_REQUIRED && r3.error.requestId !== f1.error.requestId,
    '★★ 再试一次 ⇒ 重新开一条提问（新 id）并拒 REQUIRED，不是永久卡死也不是放行', { first: f1.error.requestId, next: r3.error.requestId })
  const answered = refuse.flow.recordConsult({ target: 'P-1', by: 'office', note: '重新问过' })
  ok(answered.ok === true && answered.cleared === true, '★ 重开后的提问同样能被答复（闭环没断）', answered)
  const done = await finalize(refuse.flow)
  ok(done.ok === true, '★ 答复之后放行', done.error && done.error.code)
}

console.log('=== ⑦ 坏值：不认识的策略一律不放行 ===')
{
  const bad = await boot({ settings: { 'vmu.paper.officeConsult': 'sometimes' } })
  toEditor(bad.flow)
  const r = await finalize(bad.flow)
  ok(r.ok === false && r.error.code === 'VMU_INVALID_ARGUMENT', '★★ 反：officeConsult 取值不认识 ⇒ 具名拒（不是当 off 悄悄放行）', r.error && r.error.code)
  ok(r.error.value === 'sometimes', '★ 拒里带收到的坏值', r.error && r.error.value)
  eq(r.error.declared, ['required', 'off'], '★ 拒里列出合法取值')
  ok(/vmu.paper.officeConsult/.test(String(r.error.hint)), '★ hint 指出是哪个键', r.error && r.error.hint)
  ok(bad.flow.state('P-1').state.status === 'awaiting-editor', '★ 论文没动', bad.flow.state('P-1').state.status)

  const weird = await boot({ settings: { 'vmu.paper.officeConsult': 'required', 'vmu.paper.officeConsultTimeoutMs': 10, 'vmu.paper.officeConsultOnTimeout': 'allow' } })
  toEditor(weird.flow)
  await finalize(weird.flow)
  weird.clock.now += 1000
  const r2 = await finalize(weird.flow)
  ok(r2.ok === false && r2.error.code === weird.codes.OFFICE_CONSULT_TIMEOUT && r2.error.onTimeout === 'hold',
    '★★ 不认识的 OnTimeout（"allow"）⇒ 按 hold 执行并具名拒——"看不懂策略"绝不等于"放行"', r2.error && { code: r2.error.code, onTimeout: r2.error.onTimeout })
  ok(/from allow/.test(String(weird.flow.consultState({ target: 'P-1' }).policy['vmu.paper.officeConsultOnTimeout'])),
    '★ 但读数里显形：实际按 hold、原始值是 allow（不隐瞒这次降级）', weird.flow.consultState({ target: 'P-1' }).policy['vmu.paper.officeConsultOnTimeout'])
}

console.log('=== ⑧ 闸只挡定稿；revise 与"别的动作"不受影响 ===')
{
  const { flow, codes } = await boot({ settings: { 'vmu.paper.officeConsult': 'required' } })
  toEditor(flow)
  const revised = await flow.recordFinal({ target: 'P-1', member: 'acad', decision: 'revise', note: '还要再改一轮' })
  ok(revised && revised.ok === true && revised.finalized === false && revised.moved === true,
    '★ revise 不需要问所办（规则说的是"定稿前"，不是"每次表态前"）', revised && { finalized: revised.finalized, moved: revised.moved })
  ok(flow.consultState({ target: 'P-1' }).counters.opened === 0, '★ revise 也没留提问（闸没被误踩）')
  let notChair = null
  toEditor(flow, 'P-2', ['r-1', 'r-2'])
  try { await flow.recordFinal({ target: 'P-2', member: 'r-1', decision: 'deliverable' }) } catch (e) { notChair = e }
  ok(notChair && notChair.code === 'VMU_NOT_PERMITTED', '★ 非定稿者本来就先被席位挡（闸不是唯一的门）', notChair && notChair.code)
}

console.log('=== ⑨ pack 没声明答复角色 ⇒ 谁都不能答（fail-closed，且说得出口） ===')
{
  const pack = await import(pathToFileURL(PACK).href)
  const kit = await import(pathToFileURL(KIT).href)
  const { kernel } = makeKernel({ ...BASE, 'vmu.paper.officeConsult': 'required' }, ROSTER)
  const flow = kit.createPaperFlow({ kernel, codes: pack.PAPER_CODES, sections: ['题与摘要'], maxRounds: 3, track: 'paper', clock: () => 1000 })
  toEditor(flow)
  let err = null
  try { await flow.recordFinal({ target: 'P-1', member: 'acad', decision: 'deliverable' }) } catch (e) { err = e }
  ok(err && err.code === 'VMU_INVALID_ARGUMENT' && /consultRoles|答复/.test(String(err.message)),
    '★★ 没有答复角色 ⇒ 定稿时就是配置错（VMU_INVALID_ARGUMENT），不是开一条永远等不到答案的提问', err && { code: err.code, message: String(err.message).slice(0, 60) })
  ok(err && Array.isArray(err.declaredAnswerRoles) && err.declaredAnswerRoles.length === 0 && err.reason !== undefined || err && err.declared !== undefined,
    '★ 拒里如实说"答复角色声明是空的"', err && err.declared)
  let who = null
  try { flow.recordConsult({ target: 'P-1', by: 'office' }) } catch (e) { who = e }
  ok(who && who.code === 'VMU_NOT_PERMITTED', '★ 而且即便有人自称所办，也没有任何角色可以答复（不是谁都能当所办）', who && who.code)
  ok(flow.consultState({ target: 'P-1' }).counters.opened === 0, '★★ 一条幽灵提问都没开（台账干净）', flow.consultState({ target: 'P-1' }).counters.opened)
}

console.log('=== ⑩ 提问真的写进了 state 记录（跨进程/重放也能接着答） ===')
{
  const { flow, rows, kernel } = await boot({ settings: { 'vmu.paper.officeConsult': 'required' } })
  toEditor(flow)
  await finalize(flow)
  const stateRow = [...rows.values()].filter((r) => r.kind === 'paper-state')[0]
  ok(stateRow && /consult-/.test(String(stateRow.body)), '★★ 提问在持久记录里（不是内存里的一闪念）', stateRow && String(stateRow.body).slice(0, 80))
  const body = JSON.parse(String(stateRow.body))
  ok(body.consult && body.consult.opened === 1 && body.consult.requests.length === 1 && body.consult.requests[0].status === 'awaiting',
    '★ 台账字段齐全（opened/requests[status=awaiting]）', body.consult)
  // simulate a restart: a NEW flow over the SAME records face must see the same question and accept the same answer
  const pack = await import(pathToFileURL(PACK).href)
  const reborn = pack.createPaperSubsystem({ kernel, clock: () => 2000 })
  const cs = reborn.consultState({ target: 'P-1' })
  ok(cs.awaiting && cs.awaiting.id === body.consult.requests[0].id, '★★ 重启后同一个 flow 看到同一条在等提问（durability，不是新开一条）', cs.awaiting)
  const answered = reborn.recordConsult({ target: 'P-1', by: 'office', note: '重启后答复' })
  const done = await reborn.recordFinal({ target: 'P-1', member: 'acad', decision: 'deliverable' })
  ok(answered.ok === true && done.ok === true && done.finalized === true, '★★ 重启后答复 ⇒ 定稿可完成（闭环跨重启成立）', done && { answered: answered.ok })
}

console.log('=== ⑪ 五个键都有真语义（不是只读一个键、其余写在文档里） ===')
{
  // each key is exercised by a DIFFERENT observable: value → armed/off; on → reported; timeoutMs → branch; onTimeout →
  // hold/refuse; exemptRoles → who is asked. The last one is the honesty assertion: the reader enumerates exactly five.
  const { flow } = await boot({ settings: { 'vmu.paper.officeConsult': 'required' } })
  toEditor(flow)
  const cs = flow.consultState({ target: 'P-1' })
  eq(Object.keys(cs.policy).sort(),
    ['vmu.paper.officeConsult', 'vmu.paper.officeConsultExemptRoles', 'vmu.paper.officeConsultOn', 'vmu.paper.officeConsultOnTimeout', 'vmu.paper.officeConsultTimeoutMs', 'answerRoles', 'onTimeoutRaw', 'raw'].sort(),
    '★ 读者读的是这五个键（policy 投影逐键可见）')
  const echo = await boot({ settings: { 'vmu.paper.officeConsult': 'required', 'vmu.paper.officeConsultOn': 'finalize-or-submit' } })
  toEditor(echo.flow)
  ok(echo.flow.consultState({ target: 'P-1' }).policy['vmu.paper.officeConsultOn'] === 'finalize-or-submit',
    '★ officeConsultOn 原样报告（何时问是声明的时机，不是内核替它改成 finalize）', echo.flow.consultState({ target: 'P-1' }).policy['vmu.paper.officeConsultOn'])
}

console.log('=== ⑫ 可达性：闸所在的模块真的从插件入口可达（这次缺陷的根因） ===')
{
  ok(isReachableRel(VMU, 'kit/paper.js') === true, '★★ kit/paper.js 从插件入口可达（闸不在孤岛上）')
  ok(isReachableRel(VMU, 'packs/v5r/paper.js') === true, '★★ packs/v5r/paper.js 可达（在册的论文流水线）')
  ok(isReachableRel(VMU, 'kernel/paper.js') === false, '★★ 反证：kernel/paper.js 不可达——"把闸长在那里"正是旧缺陷的根因', isReachableRel(VMU, 'kernel/paper.js'))
  const kitSrc = readFileSync(KIT, 'utf8')
  ok(/function recordConsult\(/.test(kitSrc) && /function consultGate\(/.test(kitSrc) && /recordFinal/.test(kitSrc),
    '★ 闸与答复面在同一文件、且挂在 recordFinal 上（源码探针）')
  const packSrc = readFileSync(PACK, 'utf8')
  ok(/consultRoles: PAPER_CONSULT_ROLES/.test(packSrc) && /OFFICE_CONSULT_REQUIRED: 'VMU_OFFICE_CONSULT_REQUIRED'/.test(packSrc),
    '★ pack 声明答复角色与本闸的登记码（政策在 pack、机制在 kit）')
  ok(/recordConsult, consultState,/.test(kitSrc), '★ 两个面都在 kit 的返回面上（调用方拿得到）')
}

console.log('')
console.log('vmu-paper-office-consult: ' + passed + ' passed, ' + failed + ' failed')
process.exit(failed === 0 ? 0 : 1)

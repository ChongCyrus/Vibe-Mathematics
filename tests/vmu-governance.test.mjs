// vibe-math-vmu —— 治理面（kernel/governance.js）独立测试。
// 运行：`node tests/vmu-governance.test.mjs`（末行 `=== VMU GOVERNANCE: N passed, M failed ===`）。

import assert from 'node:assert/strict'
import { createGovernance, AGENDA_KEYS, MOTION_KEYS, AUDIT_MAX } from '../vibe-math-vmu/kernel/governance.js'

let passed = 0
let failed = 0
const cases = []
const test = (name, fn) => cases.push({ name, fn })

// 注入式 settings：**真读值**（记录每个被读的键，供 keysUsed 交叉核对 ✓）
const mk = (over, now) => {
  const vals = Object.assign({}, over || {})
  const reads = []
  return {
    vals, reads,
    now: now === undefined ? () => 0 : now,
    settings: { get(k) { reads.push(k); return vals[k] } },
  }
}
const g = (o, clock) => createGovernance({ settings: o.settings, clock: clock || o.now, log: () => {}, bus: { emit: () => {} } })

// ① 用具名码逐条对照（每个拒绝一个场景）
test('refusals are all NAMED (no bare throw) and carry a hint', () => {
  const o = mk({ 'vmu.agenda.ownerRequired': true, 'vmu.agenda.timeboxRequired': true, 'vmu.agenda.maxItems': 1, 'vmu.agenda.splitDepthMax': 1 })
  const gov = g(o)
  const noTitle = gov.agenda.add({ owner: 'r-1', timeboxMs: 10 })
  assert.equal(noTitle.ok, false); assert.equal(noTitle.code, 'VMU_AGENDA_ITEM_REQUIRED'); assert.ok(noTitle.hint)
  const noOwner = gov.agenda.add({ title: 'A', timeboxMs: 10 })
  assert.equal(noOwner.code, 'VMU_AGENDA_OWNER_REQUIRED')
  const a1 = gov.agenda.add({ title: 'A', owner: 'r-1', timeboxMs: 10 })
  assert.equal(a1.ok, true)
  assert.equal(gov.agenda.add({ title: 'B', owner: 'r-1', timeboxMs: 10 }).code, 'VMU_CONFLICT')       // 超上限
  const child = gov.agenda.split(a1.item.id)                     // depth0 → depth1：允许（max=1）
  assert.equal(child.ok, true)
  assert.equal(gov.agenda.split(child.item.id).code, 'VMU_AGENDA_SPLIT_DEPTH')                          // 超深拆分（1→2 > 1）
  assert.equal(gov.agenda.reorder(['nope']).code, 'VMU_NOT_FOUND')                                     // 未知 id
  passed += 1
})

test('motion refusals: not seconded / expired / withdrawn / table limit / unknown id', () => {
  const o = mk({ 'vmu.motions.secondThreshold': 2, 'vmu.motions.expireMs': 100, 'vmu.motions.tabledMax': 1 })
  let t = 0
  const gov = g(o, () => t)
  const m1 = gov.motion.propose({ kind: 'topic', text: 'T1', by: 'r-1' })
  const m2 = gov.motion.propose({ kind: 'topic', text: 'T2', by: 'r-2' })
  assert.equal(gov.motion.propose({ kind: 'topic', text: '', by: 'r-1' }).code, 'VMU_MOTION_NOT_SECONDED')
  assert.equal(gov.motion.second('mo-404', 'r-2').code, 'VMU_NOT_FOUND')
  assert.equal(gov.motion.table(m2.motion.id).ok, true)                    // 第一次搁置成功
  assert.equal(gov.motion.table(m2.motion.id).code, 'VMU_MOTION_TABLE_LIMIT') // 达上限 ⇒ 具名拒
  t = 1000 // 走注入时钟；过期
  assert.equal(gov.motion.second(m1.motion.id, 'r-2').code, 'VMU_MOTION_EXPIRED')
  const m3 = gov.motion.propose({ kind: 'topic', text: 'T3', by: 'r-3' })
  assert.equal(gov.motion.withdraw(m3.motion.id, 'r-1').code, 'VMU_NOT_MEMBER') // 非提出者
  assert.equal(gov.motion.withdraw(m3.motion.id, 'r-3').ok, true)
  assert.equal(gov.motion.withdraw(m3.motion.id, 'r-3').code, 'VMU_MOTION_WITHDRAWN') // 已撤回
  assert.equal(gov.motion.second(m3.motion.id, 'r-2').code, 'VMU_MOTION_WITHDRAWN')
  passed += 1
})

test('amend: substantive needs the configured mode; friendly needs its switch', () => {
  const o = mk({ 'vmu.motions.amendFriendlyInline': false, 'vmu.motions.amendSubstantiveMode': 'vote' })
  const gov = g(o)
  const m = gov.motion.propose({ kind: 'topic', text: 'X', by: 'r-1' })
  assert.equal(gov.motion.amend(m.motion.id, { text: 'Y' }, 'r-1').code, 'VMU_AMENDMENT_REJECTED')
  assert.equal(gov.motion.amend(m.motion.id, { note: 'n' }, 'r-1').code, 'VMU_AMENDMENT_REJECTED')
  const o2 = mk({ 'vmu.motions.amendFriendlyInline': true, 'vmu.motions.amendSubstantiveMode': 'inline' })
  const gov2 = g(o2)
  const m2 = gov2.motion.propose({ kind: 'topic', text: 'X', by: 'r-1' })
  assert.equal(gov2.motion.amend(m2.motion.id, { note: 'n' }, 'r-1').ok, true)
  assert.equal(gov2.motion.amend(m2.motion.id, { text: 'Y' }, 'r-1').motion.text, 'Y')
  passed += 1
})

// ② 计数式截断（事件环超上限 ⇒ droppedEvents > 0，且不静默）
test('truncation is COUNTED (droppedEvents), never silent', () => {
  const o = mk({ 'vmu.agenda.maxItems': 0 })
  const gov = g(o)
  for (let i = 0; i < AUDIT_MAX + 7; i += 1) gov.agenda.add({ title: 'A' + i })
  const st = gov.agenda.status()
  assert.ok(st.droppedEvents >= 7, '事件环丢弃必须计数：got ' + st.droppedEvents)
  assert.equal(st.count, AUDIT_MAX + 7, '条目本身完整；被丢的是事件环')
  passed += 1
})

// ③ 零机制：不给 settings 也不崩；缺省最小（不强制 owner/timebox、不限上限）
test('zero-configuration: minimal and does not crash', () => {
  const gov = createGovernance({ clock: () => 0 })
  const a = gov.agenda.add({ title: 'A' })
  assert.equal(a.ok, true)
  const m = gov.motion.propose({ kind: 'topic', text: 'T', by: 'r-1' })
  assert.equal(m.ok, true)
  assert.equal(m.needed, 1, '缺省附议门槛＝1')
  assert.equal(gov.motion.second(m.motion.id, 'r-2').motion.state, 'seconded')
  assert.equal(gov.agenda.list().ok, true)
  passed += 1
})

// ④ 确定性：注入时钟 + 同输入 ⇒ 两次运行逐字同输出
test('determinism: identical inputs produce identical outputs (injected clock only)', () => {
  const run = () => {
    const o = mk({ 'vmu.motions.secondThreshold': 2 }, () => 42)
    const gov = g(o, () => 42)
    const a = gov.agenda.add({ title: 'A', owner: 'r-1' })
    const m = gov.motion.propose({ kind: 'topic', text: 'T', by: 'r-1' })
    gov.motion.second(m.motion.id, 'r-2')
    return JSON.stringify({ a: a.item, ag: gov.agenda.list(), m: gov.motion.list(), st: gov.motion.status() })
  }
  assert.equal(run(), run())
  passed += 1
})

// ⑤ 幂等：同一人重复附议不重复计数、不改状态
test('idempotent second: the same member twice does not double-count', () => {
  const o = mk({ 'vmu.motions.secondThreshold': 3 })
  const gov = g(o)
  const m = gov.motion.propose({ kind: 'topic', text: 'T', by: 'r-1' })
  const s1 = gov.motion.second(m.motion.id, 'r-2')
  const s2 = gov.motion.second(m.motion.id, 'r-2')
  assert.equal(s1.motion.seconds.length, 1)
  assert.equal(s2.deduped, true)
  assert.equal(s2.motion.seconds.length, 1)
  assert.equal(s2.motion.state, 'open', '未达门槛 ⇒ 仍 open')
  passed += 1
})

// ⑥ 只读分离：list()/status() 不改状态（前后快照逐字相同）
test('read paths never mutate state', () => {
  const o = mk({ 'vmu.motions.expireMs': 10 })
  const gov = g(o, () => 5)
  gov.agenda.add({ title: 'A' })
  gov.motion.propose({ kind: 'topic', text: 'T', by: 'r-1' })
  const before = JSON.stringify({ a: gov.agenda.list(), s: gov.agenda.status(), m: gov.motion.list(), ms: gov.motion.status() })
  const again = JSON.stringify({ a: gov.agenda.list(), s: gov.agenda.status(), m: gov.motion.list(), ms: gov.motion.status() })
  assert.equal(before, again)
  passed += 1
})

// ⑦ keysUsed()：15 个键全列出，且都真的被读过
test('keysUsed() lists every governance key and each is really read', () => {
  const o = mk({})
  const gov = g(o)
  gov.agenda.add({ title: 'A' }); gov.motion.propose({ kind: 'topic', text: 'T', by: 'r-1' })
  const used = gov.keysUsed()
  assert.equal(used.length, AGENDA_KEYS.length + MOTION_KEYS.length)
  for (const k of AGENDA_KEYS.concat(MOTION_KEYS)) assert.ok(used.indexOf(k) !== -1, '缺失：' + k)
  for (const k of used) assert.ok(o.reads.indexOf(k) !== -1, '键须真读（不得只在注释里写键名）：' + k)
  passed += 1
})

for (const c of cases) {
  try { await c.fn(); console.log('ok - ' + c.name) } catch (e) { failed += 1; console.log('FAIL - ' + c.name + ' :: ' + String((e && e.message) || e)) }
}
console.log('=== VMU GOVERNANCE: ' + passed + ' passed, ' + failed + ' failed ===')
process.exit(failed > 0 ? 1 : 0)

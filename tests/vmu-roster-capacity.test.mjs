// tests/vmu-roster-capacity.test.mjs — 轮 9 / 类 4：`capacity:0` 的回执口径（0 ＝ 无上限）。
//
// 真机观测（第一遍审计）：hire 回执 `{"slot":"member","id":"r-1","occupied":1,"capacity":0}` —— 0 却能落座。
// 判定（已核）：守卫是 `def.capacity > 0 && used >= def.capacity`（kernel/members.js:141）⇒ **0 ＝ 无上限**，
// 落座正确；误导的是"只回 capacity:0"。修法（本轮）：回执**加 `unlimited`**，`capacity` 值**不改**（既有消费者）。
//
// Run: node tests/vmu-roster-capacity.test.mjs
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
const HERE = dirname(fileURLToPath(import.meta.url))
const VMU = join(HERE, '..', 'vibe-math-vmu')
const { createKernel } = await import('file:///' + VMU.replace(/\\/g, '/').replace(/ /g, '%20') + '/kernel/index.js')

let passed = 0
let failed = 0
const ok = (cond, label, detail) => {
  if (cond) { passed += 1; console.log('  ok   ' + label) } else { failed += 1; console.error('  FAIL ' + label + (detail === undefined ? '' : ' :: ' + JSON.stringify(detail))) }
}

const kernel = createKernel({
  clock: () => 1,
  settings: {},
  slots: [
    { id: 'chair', capacity: 1, permissions: ['speak', 'vote'] },
    { id: 'member', capacity: 0, permissions: ['speak', 'vote'] },
  ],
})

console.log('=== capacity 0 ＝ 无上限（回执必须自曝 unlimited）===')
{
  const r = await kernel.members.hire({ id: 'r-1', slot: 'member' })
  ok(r && r.ok === true && r.capacity === 0, '★ 正：capacity:0 的槽位能落座（0 不是"容量 0"）', r && { ok: r.ok, capacity: r.capacity, occupied: r.occupied })
  ok(r && r.unlimited === true, '★ 正：且回执自曝 `unlimited:true`（不再只给一个 0）', r && r.unlimited)
}
{
  const r = await kernel.members.hire({ id: 'r-2', slot: 'chair' })
  ok(r && r.ok === true && r.capacity === 1 && r.unlimited === false, '★ 反：capacity:1 的槽位落座且 `unlimited:false`', r && { capacity: r.capacity, unlimited: r.unlimited })
}
{
  // 反证 capacity:1 真的被强制（否则上一行的 1 只是装饰）
  let threw = null
  try { await kernel.members.hire({ id: 'r-3', slot: 'chair' }) } catch (e) { threw = e }
  ok(!!threw && threw.code === 'VMU_RESOURCE_BUDGET', '★ 反：capacity:1 满员后另一人 ⇒ 具名拒 VMU_RESOURCE_BUDGET（1 是真上限）', threw && { code: threw.code, message: String(threw.message || '').slice(0, 70) })
}

console.log('')
console.log('=== ROSTER CAPACITY: ' + passed + ' passed, ' + failed + ' failed ===')
process.exit(failed === 0 ? 0 : 1)

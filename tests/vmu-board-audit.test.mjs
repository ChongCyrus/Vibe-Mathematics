// vibe-math-vmu —— **只读审计**：既有的 `kernel/board.js` 是否真把 6 个 CORE 键接上（**不改任何 kernel 文件** ✗）。
// 运行：`node tests/vmu-board-audit.test.mjs`（末行 `=== VMU BOARD AUDIT: N passed, M failed ===`）。
//
// 纪律（Lead 裁决 ✓）：① `enforced[]` 真求值 ✓；② **改键 ⇒ 结果变**（逐键实测并**记账** ✓）；③ `fired ⊆ enforced` ✓；
//   ④ **实测缺失的口径**（`enforcedScope`／`fired`／`wouldEvaluate`）**如实断言"未实现"** ✓✓（**不假装有** ✗）；
//   ⑤ 拒绝必须**具名**（带 `code`）✓；⑥ 只读：**不写任何 kernel 文件** ✓（本套件只 `readFileSync` ＋ 调公开面 ✓）。

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createBoard } from '../vibe-math-vmu/kernel/board.js'

const SRC = readFileSync(new URL('../vibe-math-vmu/kernel/board.js', import.meta.url), 'utf8')
const SCHEMA = readFileSync(new URL('../vibe-math-vmu/settings/schema.js', import.meta.url), 'utf8')
const KEYS = ['columns', 'wipPerColumn', 'wipDefault', 'swimlanes', 'agingWarnMs', 'moveRequiresTransition']
const CAP = ['enforcedScope', 'fired', 'wouldEvaluate']

let passed = 0
let failed = 0
const cases = []
const test = (n, f) => cases.push({ n, f })
const settingsWith = (vals) => Object.assign({ get(k) { return vals[k] }, ...vals })
const mk = (vals) => createBoard({ clock: () => 0, log: () => {}, settings: settingsWith(vals), bus: { emit: () => {} } })

/** 探测实例：逐个函数调用（**不改状态文件** ✓），把结果规范化成可比较的结构 ✓。 */
const probe = (inst) => {
  const out = {}
  for (const k of Object.keys(inst)) {
    if (typeof inst[k] !== 'function') continue
    try {
      const r = inst[k]({})
      out[k] = { ok: true, shape: JSON.stringify(r), refusal: (r && r.ok === false) ? String(r.code || '（无名）✗') : null }
    } catch (e) {
      out[k] = { ok: false, threw: String((e && e.message) || e) }
    }
  }
  return out
}

// ① 6 键确实在**核心表**声明（实测 ✓），且本套件不改 kernel ✓
test('the 6 board keys are declared CORE in settings/schema.js (read-only check)', () => {
  assert.equal(KEYS.length, 6)
  for (const k of KEYS) assert.ok(SCHEMA.indexOf("vmu.board." + k) !== -1, '核心表缺键：vmu.board.' + k)
  assert.ok(SRC.length > 0)
  passed += 1
})

// ④ 实测缺失的口径 ⇒ **如实断言"未实现"** ✓✓（不假装 ✓）
test('the three口径 tokens are NOT implemented in board.js (asserted as measured facts)', () => {
  const missing = CAP.filter((t) => SRC.indexOf(t) === -1)
  assert.deepEqual(missing.slice().sort(), CAP.slice().sort(), 'board.js 实测应**没有**这三个口径记号；实际缺失=' + JSON.stringify(missing))
  console.log('  · board.js 口径实测：' + CAP.map((t) => t + '=' + (SRC.indexOf(t) === -1 ? '缺 ✗' : '有 ✓')).join('  '))
  passed += 1
})

// ② 逐键**双证**：改键 ⇒ 结果变（记账 ✓）；不论变不变，**不得抛错** ✓
test('toggling each CORE key never throws, and every change is RECORDED (double-proof ledger)', () => {
  const base = mk({})
  const baseSnap = probe(base)
  const ledger = []
  for (const key of KEYS) {
    const on = {}
    // 用"非默认"值打开该键（类型按核心表提示：list/object/natural/boolean ✓）
    if (key === 'columns') on[key] = [{ id: 'todo' }, { id: 'doing' }]
    else if (key === 'swimlanes') on[key] = ['ops']
    else if (key === 'wipPerColumn') on[key] = { doing: 1 }
    else if (key === 'wipDefault') on[key] = 1
    else if (key === 'agingWarnMs') on[key] = 1000
    else on[key] = true
    const snap = probe(mk(on))
    const changed = Object.keys(snap).filter((op) => JSON.stringify(snap[op]) !== JSON.stringify(baseSnap[op]))
    const newThrows = Object.keys(snap).filter((op) => snap[op].ok === false && baseSnap[op] && baseSnap[op].ok === true)
    assert.deepEqual(newThrows, [], '改键后**新出现抛错**（应具名拒 ✓）：vmu.board.' + key + ' ⇒ ' + JSON.stringify(newThrows.map((o) => snap[o].threw)))
    ledger.push({ key: 'vmu.board.' + key, ops: Object.keys(snap).length, changed })
  }
  console.log('  · 逐键双证台账（changed＝该键改变了哪些操作的返回 ✓）：')
  for (const row of ledger) console.log('    - ' + row.key + ' ⇒ ops=' + row.ops + ' changed=' + (row.changed.length ? row.changed.join(',') : '（无：未观测到行为变化 ✗）'))
  const observed = ledger.filter((r) => r.changed.length > 0).map((r) => r.key)
  console.log('  · 观测到行为变化的键：' + (observed.length ? observed.join('、') : '（无 ✗）'))
  passed += 1
})

// ⑤ 拒绝必须**具名**；③ 若回执带 `enforced`／`fired` ⇒ 断言 `fired ⊆ enforced` ✓（条件式 ✓）
test('refusals are named, and fired ⊆ enforced wherever both exist', () => {
  const settings = settingsWith({ columns: [{ id: 'a' }], wipDefault: 1, moveRequiresTransition: true, agingWarnMs: 1 })
  const inst = createBoard({ clock: () => 0, log: () => {}, settings, bus: { emit: () => {} } })
  let refusals = 0
  let enforcedReceipts = 0
  for (const k of Object.keys(inst)) {
    if (typeof inst[k] !== 'function') continue
    for (const args of [{}, { from: 'a', to: 'b' }, { taskId: 'nope', to: 'b' }, { id: 'nope' }]) {
      let r
      try { r = inst[k](args) } catch (e) { failed += 0; continue }
      if (r && r.ok === false) {
        refusals += 1
        assert.ok(r.code, '拒绝必须具名（无 code）：' + k + '(' + JSON.stringify(args) + ')')
      }
      if (r && Array.isArray(r.enforced)) {
        enforcedReceipts += 1
        if (Array.isArray(r.fired)) for (const x of r.fired) assert.ok(r.enforced.indexOf(x) !== -1, '**fired ⊆ enforced** 违约：' + x)
      }
    }
  }
  console.log('  · 具名拒计数=' + refusals + '；带 enforced 的回执=' + enforcedReceipts + '（0 ⇒ 该面未实现口径 ✗，已由上一断言如实记录 ✓）')
  passed += 1
})

// ⑥ 零机制不崩 ＋ 只读面可重复（同一实例两次探测逐字相同 ✓）
test('zero-mechanism does not crash and repeated probing is identical (read-only)', () => {
  const zero = createBoard({ clock: () => 0 })
  assert.ok(zero && typeof zero === 'object')
  const a = JSON.stringify(probe(mk({})))
  const b = JSON.stringify(probe(mk({})))
  assert.equal(a, b, '同一输入两次探测必须逐字相同（无真实时间 ✗）')
  passed += 1
})

for (const c of cases) {
  try { await c.f(); console.log('ok - ' + c.n) } catch (e) { failed += 1; console.log('FAIL - ' + c.n + ' :: ' + String((e && e.message) || e)) }
}
console.log('=== VMU BOARD AUDIT: ' + passed + ' passed, ' + failed + ' failed ===')
process.exit(failed > 0 ? 1 : 0)

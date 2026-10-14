// vibe-math-vmu —— ROUND 3 · C-45：**忠实性缺陷 ⇒ 强制弃权**（kernel/fidelity.js 的内核谓词）。
// 运行：`node tests/vmu-fidelity-abstention.test.mjs`（末行 `=== VMU FIDELITY ABSTENTION: N passed, M failed ===`）。
//
// 判据（04-parity-matrix.md:254）："造一个不忠实回执 ⇒ 必须**具名弃权 + 留痕**"。
// 本套件逐条证：① 缺 note/by 不许匿名；② 声明即留痕（可选落盘，可跨实例重载）；
// ③ `abstentionFor` 是纯谓词、只对"该成员 × 该对象"生效；④ `applyAbstention` 是**唯一强制点**，
//    被登记者声明的 1/0 一律变 0.5；⑤ 不忠实**永远不是反证**（isRefutation 恒 false）。

import assert from 'node:assert/strict'
import { createFidelityRegistry, FIDELITY_ABSTENTION_VOTE, FIDELITY_DEFECT_DIR } from '../vibe-math-vmu/kernel/fidelity.js'
import { createFormal } from '../vibe-math-vmu/kernel/formal.js'

let passed = 0
let failed = 0
const cases = []
const test = (n, f) => cases.push({ n, f })

function memFs(seed = {}) {
  const store = new Map(Object.entries(seed))
  return {
    store,
    writeText: async (rel, text) => { store.set(String(rel).replace(/\\/g, '/'), String(text)); return true },
    readText: async (rel) => { const v = store.get(String(rel).replace(/\\/g, '/')); return v === undefined ? undefined : v },
    listDir: async (rel) => {
      const prefix = String(rel).replace(/\\/g, '/').replace(/\/+$/, '') + '/'
      const out = []
      for (const k of store.keys()) if (k.startsWith(prefix) && k.slice(prefix.length).indexOf('/') === -1) out.push({ name: k.slice(prefix.length), type: 'file' })
      return out
    },
  }
}
const mk = (over) => createFidelityRegistry(Object.assign({ clock: () => 7, log: () => {} }, over || {}))

// ── 1. 匿名/无理由的缺陷声明必须被具名拒（不能靠'不好'结案）────────────────────────────────
test('a defect declaration without target / by / note is refused BY NAME', async () => {
  const f = mk()
  const noTarget = await f.declareDefect({ by: 'r-1', note: 'x' })
  assert.equal(noTarget.code, 'VMU_MATH_INVALID_INPUT')
  assert.deepEqual(noTarget.enforced, [])
  assert.equal(noTarget.enforcedScope, 'evaluated-so-far')
  const noBy = await f.declareDefect({ target: 'p-1', note: 'x' })
  assert.equal(noBy.code, 'VMU_MATH_INVALID_INPUT')
  const noNote = await f.declareDefect({ target: 'p-1', by: 'r-1' })
  assert.equal(noNote.code, 'VMU_MATH_INVALID_INPUT')
  assert.ok(noNote.hint.length > 0, '拒绝必须带 hint')
  assert.equal(f.view().count, 0, '三次被拒之后不得留下任何标记')
  passed += 1
})

// ── 2. 声明成功 ⇒ 标记 + 强制弃权票值 + **不是反证** ───────────────────────────────────────
test('a declared defect yields a marker and an enforced abstention (never a refutation)', async () => {
  const f = mk()
  const r = await f.declareDefect({ target: 'p-1', by: 'r-1', note: 'Lean 把 ∀ 写成了 ∃，条件比原文弱' })
  assert.equal(r.ok, true)
  assert.match(r.marker.markerId, /^fd-\d+$/)
  assert.equal(r.marker.enforcedVote, FIDELITY_ABSTENTION_VOTE)
  assert.equal(r.marker.passedWithdrawn, true, '缺陷声明同时撤回"已通过"（v5r 的同一步）')
  assert.equal(r.enforcedAbstention.vote, 0.5)
  assert.equal(r.enforcedAbstention.enforced, true)
  assert.equal(r.isRefutation, false, '★ 不忠实 ≠ 命题为假')
  assert.equal(f.view().count, 1)
  assert.equal(f.status().declared, 1)
  passed += 1
})

// ── 3. `abstentionFor` 只对"该成员 × 该对象"生效（纯谓词，不外溢）──────────────────────────
test('the predicate is scoped to (target, by) and never leaks', async () => {
  const f = mk()
  await f.declareDefect({ target: 'p-1', by: 'r-1', note: 'statement drift' })
  assert.equal(f.abstentionFor({ target: 'p-1', by: 'r-1' }).vote, 0.5)
  assert.equal(f.abstentionFor({ target: 'p-1', by: 'r-2' }), null, '别的成员不受影响')
  assert.equal(f.abstentionFor({ target: 'p-9', by: 'r-1' }), null, '别的对象不受影响')
  assert.equal(f.abstentionFor({ target: 'p-1' }), null, '没有 by 就不是一个可判定的谓词实例')
  passed += 1
})

// ── 4. `applyAbstention` 是唯一强制点：1/0 一律变 0.5；未登记者原样通过 ─────────────────────
test('applyAbstention overrides a boolean ballot, and leaves everyone else untouched', async () => {
  const f = mk()
  await f.declareDefect({ target: 'p-1', by: 'r-1', note: 'definition mismatch' })
  const asTrue = f.applyAbstention({ target: 'p-1', by: 'r-1', declared: 1 })
  assert.equal(asTrue.vote, 0.5, '声明为真的票被改写为弃权')
  assert.equal(asTrue.enforced, true)
  const asFalse = f.applyAbstention({ target: 'p-1', by: 'r-1', declared: 0 })
  assert.equal(asFalse.vote, 0.5, '声明为假的票同样被改写（不是"改成反对"）')
  assert.equal(asFalse.enforced, true)
  const mid = f.applyAbstention({ target: 'p-1', by: 'r-1', declared: 0.5 })
  assert.equal(mid.vote, 0.5)
  assert.equal(mid.enforced, false, '本来就是不确定值 ⇒ 无事可做（不得重复计一次强制）')
  const other = f.applyAbstention({ target: 'p-1', by: 'r-2', declared: 1 })
  assert.equal(other.vote, 1, '未登记者原样通过')
  assert.equal(other.enforced, false)
  assert.equal(f.status().abstentionsEnforced, 2, '强制次数只数"真的改写了布尔票"的那两次')
  passed += 1
})

// ── 5. 留痕可跨实例重载（重启后仍然强制）；无 fs 接缝则**具名**降级 ─────────────────────────
test('the marker is durable and reloads; without an fs seam the face says so by name', async () => {
  const fs = memFs()
  const f1 = mk({ fs })
  const r = await f1.declareDefect({ target: 'p-7', by: 'r-1', note: 'quantifier scope' })
  assert.equal(r.persisted, true)
  assert.ok(fs.store.has(FIDELITY_DEFECT_DIR + '/p-7.json'), '标记必须落盘：' + [...fs.store.keys()].join(','))
  // A NEW instance over the same directory = a restart.
  const f2 = mk({ fs })
  assert.equal(f2.abstentionFor({ target: 'p-7', by: 'r-1' }), null, '重载之前是不知道的（证明重载真的发生了）')
  const loaded = await f2.loadDefects()
  assert.equal(loaded.ok, true)
  assert.equal(loaded.loaded, 1)
  assert.equal(f2.applyAbstention({ target: 'p-7', by: 'r-1', declared: 1 }).vote, 0.5, '★ 重启后强制弃权仍然生效')
  // No fs seam ⇒ in-memory only, NAMED (never silently "durable").
  const bare = mk()
  const rb = await bare.declareDefect({ target: 'p-8', by: 'r-1', note: 'x' })
  assert.equal(rb.durable, false)
  assert.equal(bare.view().durable, false)
  const ld = await bare.loadDefects()
  assert.equal(ld.ok, false)
  assert.equal(ld.enforcedScope, 'evaluated-so-far')
  passed += 1
})

// ── 6. 同一对象第二个缺陷追加（append-only：绝不抹掉第一个人）＋ 两人都被强制 ────────────────
test('a second defect on the same object is APPEND-ONLY and enforces both members', async () => {
  const fs = memFs()
  const f = mk({ fs })
  await f.declareDefect({ target: 'p-3', by: 'r-1', note: 'first drift' })
  await f.declareDefect({ target: 'p-3', by: 'r-2', note: 'second drift' })
  const rec = JSON.parse(fs.store.get(FIDELITY_DEFECT_DIR + '/p-3.json'))
  assert.equal(rec.history.length, 2, '历史必须追加，不得覆盖（v5r/Adv-verify F1 的同一课）')
  assert.equal(rec.history[0].by, 'r-1')
  const row = f.view().defects.filter((d) => d.target === 'p-3')[0]
  assert.equal(row.markers, 2)
  assert.equal(f.applyAbstention({ target: 'p-3', by: 'r-1', declared: 0 }).vote, 0.5)
  assert.equal(f.applyAbstention({ target: 'p-3', by: 'r-2', declared: 1 }).vote, 0.5)
  passed += 1
})

// ── 7. 只读面纯；`status().fidelity` 的数字与 defects() 一致 ──────────────────────────────
test('read surfaces are pure and the counters agree', async () => {
  const f = mk({ fs: memFs() })
  await f.declareDefect({ target: 'p-5', by: 'r-1', note: 'n' })
  f.applyAbstention({ target: 'p-5', by: 'r-1', declared: 1 })
  const before = JSON.stringify({ d: f.view(), s: f.status(), t: f.trail() })
  const after = JSON.stringify({ d: f.view(), s: f.status(), t: f.trail() })
  assert.equal(before, after)
  assert.equal(f.status().defects, 1)
  assert.equal(f.status().abstentionsEnforced, 1)
  assert.equal(f.view().enforcedVote, FIDELITY_ABSTENTION_VOTE)
  passed += 1
})

// ── 8. 形式化面能把登记册的数字显示出来（一条真接缝，不是两个各自为政的面）──────────────────
test('the formal face surfaces the registry counts when one is injected', async () => {
  const fid = mk()
  const formal = createFormal({ clock: () => 7, log: () => {}, fidelity: fid })
  assert.equal(typeof formal.declareDefect, 'undefined', '★ 形式化面**不得**长成第 11 个方法（工具枚举=10 必须保持）')
  await fid.declareDefect({ target: 'p-11', by: 'r-1', note: 'scope drift' })
  const st = formal.status()
  assert.equal(st.fidelity.defects, 1, '注入登记册后 status() 必须看得到它')
  assert.equal(st.fidelity.abstentionsEnforced, 0)
  assert.equal(createFormal({ clock: () => 7 }).status().fidelity, null, '没注入就是 null（而不是编一个 0 出来）')
  passed += 1
})

for (const c of cases) {
  try { await c.f(); console.log('ok - ' + c.n) } catch (e) { failed += 1; console.log('FAIL - ' + c.n + ' :: ' + String((e && e.message) || e)) }
}
console.log('=== VMU FIDELITY ABSTENTION: ' + passed + ' passed, ' + failed + ' failed ===')
process.exit(failed > 0 ? 1 : 0)

// vibe-math-vmu —— 多成员合著面（kernel/paper.js）独立测试。
// 运行：`node tests/vmu-paper.test.mjs`（末行 `=== VMU PAPER: N passed, M failed ===`）。
//
// 这套测试的纪律（与 storepolicy 同一条）：`keysUsed()` 列出的每个键都必须**真的被读过** —— 用一个记录读取的
// settings 存根来证明，而不是相信模块的自述 ✓。

import assert from 'node:assert/strict'
import { createPaper, WIRED_KEYS, PLANNED_KEYS, FINALIZERS } from '../vibe-math-vmu/kernel/paper.js'

let passed = 0
let failed = 0
const failures = []
const ok = (cond, name, detail) => {
  if (cond) { passed += 1; return }
  failed += 1
  failures.push(name + (detail === undefined ? '' : ' [' + detail + ']'))
}
const expectThrow = (fn, code, name) => {
  try { fn(); failed += 1; failures.push(name + ' [did not throw]') } catch (e) {
    ok(e && e.code === code, name, e && e.code)
  }
}
// ROUND 135: `finalize` is ASYNC, so its refusal arrives as a REJECTED PROMISE rather than a synchronous throw.
// The first version of this file called it synchronously, so three assertions reported "did not throw" while the
// refusals were in fact being produced - the same returned-versus-thrown confusion as round 122, one level deeper.
const expectRejects = async (fn, code, name) => {
  try { await fn(); failed += 1; failures.push(name + ' [did not reject]') } catch (e) {
    ok(e && e.code === code, name, e && e.code)
  }
}
const mkSettings = (over) => {
  const vals = Object.assign({
    'vmu.paper.requireAllSections': true,
    'vmu.paper.finalizer': 'editor',
  }, over || {})
  const reads = []
  return { reads, get(k) { reads.push(k); return vals[k] } }
}

const SECTIONS = ['introduction', 'method', 'results']
const OWNERS = { introduction: 'm-1', method: 'm-2', results: 'm-1' }

// ── 1. 开篇：契约必须完整（标题／章节／**每节都有人认领**／编辑）──────────────────────────────
{
  const p = createPaper({ settings: mkSettings(), clock: () => 1 })
  expectThrow(() => p.start({ sections: SECTIONS, contributors: OWNERS, editor: 'ed' }), 'VMU_INVALID_ARGUMENT', 'a manuscript without a title is refused by name')
  expectThrow(() => p.start({ title: 'T', sections: [], contributors: {}, editor: 'ed' }), 'VMU_INVALID_ARGUMENT', 'a manuscript with no sections is refused')
  expectThrow(() => p.start({ title: 'T', sections: ['a', 'a'], contributors: { a: 'm-1' }, editor: 'ed' }), 'VMU_INVALID_ARGUMENT', 'duplicate section names are refused')
  expectThrow(() => p.start({ title: 'T', sections: ['a', 'b'], contributors: { a: 'm-1' }, editor: 'ed' }), 'VMU_INVALID_ARGUMENT', '★ an UNOWNED section is refused (a promise nobody made)')
  expectThrow(() => p.start({ title: 'T', sections: SECTIONS, contributors: OWNERS }), 'VMU_INVALID_ARGUMENT', 'a manuscript without an editor is refused')
  const started = p.start({ title: 'T', sections: SECTIONS, contributors: OWNERS, editor: 'ed' })
  ok(started.ok === true && started.sections === 3, 'a complete contract starts', JSON.stringify(started).slice(0, 120))
  ok(started.outstanding.length === 3, 'and every section starts outstanding')
}

// ── 2. 交付：归属是**机器强制**的，且不得静默覆盖 ─────────────────────────────────────────
{
  const p = createPaper({ settings: mkSettings(), clock: () => 2 })
  const id = p.start({ title: 'T', sections: SECTIONS, contributors: OWNERS, editor: 'ed' }).paperId
  expectThrow(() => p.contribute({ paperId: id, section: 'method', by: 'm-1' }), 'VMU_NOT_PERMITTED', '★ a section can only be handed in by the member it was contracted to')
  expectThrow(() => p.contribute({ paperId: id, section: 'nope', by: 'm-1' }), 'VMU_NO_SUCH_OBJECT', 'an unknown section is refused, not created')
  expectThrow(() => p.contribute({ paperId: 'paper-999', section: 'method', by: 'm-2' }), 'VMU_NO_SUCH_OBJECT', 'an unknown manuscript is refused')
  const one = p.contribute({ paperId: id, section: 'method', by: 'm-2', artifact: 'lib/method' })
  ok(one.ok === true && one.artifact === 'lib/method' && one.outstanding.length === 2, 'the owner hands it in, and the outstanding list shrinks', JSON.stringify(one).slice(0, 120))
  expectThrow(() => p.contribute({ paperId: id, section: 'method', by: 'm-2' }), 'VMU_STATE', 'a second hand-in for the same section is refused (no silent overwrite)')
}

// ── 3. 定稿闸：缺节必须**点名到人**；缺接缝必须**具名拒**而不是假装登记 ────────────────────────
{
  const s = mkSettings()
  const p = createPaper({ settings: s, clock: () => 3 })
  const id = p.start({ title: 'T', sections: SECTIONS, contributors: OWNERS, editor: 'ed' }).paperId
  let missingErr = null
  try { await p.finalize({ paperId: id, by: 'ed' }) } catch (e) { missingErr = e }
  ok(!!missingErr && missingErr.code === 'VMU_STATE', 'finalising with everything outstanding is refused by name', missingErr && missingErr.code)
  ok(!!missingErr && missingErr.message.indexOf('introduction') !== -1 && missingErr.message.indexOf('m-1') !== -1,
    '★ and the refusal NAMES the missing section AND its owner', missingErr && missingErr.message.slice(0, 130))
  await expectRejects(() => p.finalize({ paperId: id, by: 'm-2' }), 'VMU_NOT_PERMITTED', 'a non-editor may not finalise under the default rule')

  for (const [sec, by] of [['introduction', 'm-1'], ['method', 'm-2'], ['results', 'm-1']]) p.contribute({ paperId: id, section: sec, by })
  const sealed = createPaper({ settings: mkSettings(), clock: () => 4 })
  const sealedId = sealed.start({ title: 'T2', sections: SECTIONS, contributors: OWNERS, editor: 'ed' }).paperId
  for (const [sec, by] of [['introduction', 'm-1'], ['method', 'm-2'], ['results', 'm-1']]) sealed.contribute({ paperId: sealedId, section: sec, by })
  let noSeam = null
  try { await sealed.finalize({ paperId: sealedId, by: 'ed' }) } catch (e) { noSeam = e }
  ok(!!noSeam && noSeam.code === 'VMU_ENGINE_UNAVAILABLE', '★ with no registration seam bound, finalising is refused by name (never faked)', noSeam && noSeam.code)

  const registered = []
  const q = createPaper({ settings: mkSettings(), clock: () => 5, register: async (pack) => { registered.push(pack); return { ok: true, chain: 'preprint' } } })
  const qid = q.start({ title: 'T3', sections: SECTIONS, contributors: OWNERS, editor: 'ed' }).paperId
  for (const [sec, by] of [['introduction', 'm-1'], ['method', 'm-2'], ['results', 'm-1']]) q.contribute({ paperId: qid, section: sec, by })
  const done = await q.finalize({ paperId: qid, by: 'ed' })
  ok(done.ok === true && done.state === 'finalized' && done.gaps.length === 0, 'with all sections in, the editor finalises', JSON.stringify(done).slice(0, 130))
  ok(registered.length === 1 && registered[0].sections.length === 3 && registered[0].title === 'T3', '★ the manuscript is handed to the INJECTED seam (registration is delegated, not reimplemented)')
  await expectRejects(() => q.finalize({ paperId: qid, by: 'ed' }), 'VMU_STATE', 'a second finalisation is refused')
}

// ── 4. 关掉齐全要求时：**缺口随回执一起走**（记录，而不是遗忘）─────────────────────────────
{
  const p = createPaper({ settings: mkSettings({ 'vmu.paper.requireAllSections': false }), clock: () => 6, register: async () => ({ ok: true }) })
  const id = p.start({ title: 'T', sections: SECTIONS, contributors: OWNERS, editor: 'ed' }).paperId
  p.contribute({ paperId: id, section: 'method', by: 'm-2' })
  const r = await p.finalize({ paperId: id, by: 'ed' })
  ok(r.ok === true && r.gaps.length === 2, 'with the requirement off, finalising records the gaps', JSON.stringify(r.gaps))
  ok(r.gaps[0].owner !== undefined && r.gaps.some((g) => g.name === 'introduction'), '★ and each gap still names its owner (a gap is information, not silence)')
}

// ── 5. finalizer 规则真的是可调的三种，且未知值回落为 editor ──────────────────────────────
{
  ok(FINALIZERS.length === 3 && FINALIZERS.indexOf('editor') === 0, 'three finaliser rules are declared, editor first')
  const p = createPaper({ settings: mkSettings({ 'vmu.paper.finalizer': 'nonsense' }), clock: () => 7, register: async () => ({ ok: true }) })
  const id = p.start({ title: 'T', sections: ['a'], contributors: { a: 'm-1' }, editor: 'ed' }).paperId
  p.contribute({ paperId: id, section: 'a', by: 'm-1' })
  await expectRejects(() => p.finalize({ paperId: id, by: 'm-1' }), 'VMU_NOT_PERMITTED', 'an unknown finaliser value falls back to editor (never to "any")')
  const q = createPaper({ settings: mkSettings({ 'vmu.paper.finalizer': 'contributor' }), clock: () => 8, register: async () => ({ ok: true }) })
  const qid = q.start({ title: 'T', sections: ['a'], contributors: { a: 'm-1' }, editor: 'ed' }).paperId
  q.contribute({ paperId: qid, section: 'a', by: 'm-1' })
  const r = await q.finalize({ paperId: qid, by: 'm-1' })
  ok(r.ok === true, 'under `contributor`, the member who wrote a section may finalise')
}

// ── 6. 家法：keysUsed() 的每个键都**真被读过**；partition 精确；只读面不改状态 ──────────────
{
  const s = mkSettings()
  const p = createPaper({ settings: s, clock: () => 9, register: async () => ({ ok: true }) })
  const id = p.start({ title: 'T', sections: ['a'], contributors: { a: 'm-1' }, editor: 'ed' }).paperId
  p.contribute({ paperId: id, section: 'a', by: 'm-1' })
  await p.finalize({ paperId: id, by: 'ed' })
  p.status()
  const used = p.keysUsed()
  ok(used.length === WIRED_KEYS.length && WIRED_KEYS.every((k) => used.indexOf(k) !== -1), 'keysUsed() lists the wired keys')
  const notRead = used.filter((k) => s.reads.indexOf(k) === -1)
  ok(notRead.length === 0, '★ every key in keysUsed() was REALLY read (proved by the recording stub)', notRead.join(','))
  const part = p.partition()
  ok(part.exact === true && part.wired === WIRED_KEYS.length && part.planned === PLANNED_KEYS.length && part.disjoint === true, 'the wired/planned partition is exact and disjoint', JSON.stringify(part))
  ok(PLANNED_KEYS.every((e) => Array.isArray(e) && String(e[1] || '').trim().length > 0), 'every planned entry carries a reason')
  const before = JSON.stringify(p.status())
  const after = JSON.stringify(p.status())
  ok(before === after, 'the read-only face changes no state')
}

// ── 7. 零策略自检：模块里不得出现 v5r 的角色名／章节名 ─────────────────────────────────────
{
  const { readFileSync } = await import('node:fs')
  const src = readFileSync(new URL('../vibe-math-vmu/kernel/paper.js', import.meta.url), 'utf8')
  const forbidden = ['academician', 'permanent researcher', 'temp worker', 'secretary', 'chair']
  const found = forbidden.filter((w) => src.toLowerCase().indexOf(w) !== -1)
  ok(found.length === 0, '★ the module carries none of the v5r role names (a slot is a name the pack supplies)', found.join(','))
}

// ── 8. ROUND 145：章节上限是【真限制】（默认 0 ＝ 不限 ⇒ 不改变既有行为 ✓）──────────────────
{
  const many = Array.from({ length: 40 }, (_, i) => 's' + i)
  const ownersOf = (list) => Object.fromEntries(list.map((n) => [n, 'm1']))

  // ① 默认（未声明 ⇒ 0）⇒ **不设限**：这就是"改了键才有变化"的反面证明 ✓
  const unlimited = createPaper({ settings: mkSettings({}), clock: () => 20 })
  const big = unlimited.start({ title: 'T', sections: many, contributors: ownersOf(many), editor: 'ed' })
  ok(big.ok === true && big.sections === 40, 'M1. with the default 0 there is NO cap (40 sections start ⇒ nothing changes by default)', JSON.stringify(big).slice(0, 90))

  // ② 超上限 ⇒ **具名拒**，且消息里**同时有实际数与上限** ✓
  const capped = createPaper({ settings: mkSettings({ 'vmu.paper.maxSections': 2 }), clock: () => 21 })
  let over = null
  try { capped.start({ title: 'T', sections: many.slice(0, 3), contributors: ownersOf(many.slice(0, 3)), editor: 'ed' }) } catch (e) { over = e }
  ok(!!over && over.code === 'VMU_RESOURCE_BUDGET', 'M2. ★ over the cap is refused by name', over && over.code)
  ok(!!over && over.message.indexOf('3 > 2') !== -1, 'M3. ★ and the refusal carries BOTH the actual count and the cap', over && over.message.slice(0, 90))

  // ③ 恰好等于上限 ⇒ 放行（边界 ✓）
  const atCap = capped.start({ title: 'T', sections: many.slice(0, 2), contributors: ownersOf(many.slice(0, 2)), editor: 'ed' })
  ok(atCap.ok === true && atCap.sections === 2, 'M4. at the cap is allowed (the bound is ">", not ">=")')

  // ④ 上限检查的【顺序】：超限时拒的是"太大"，而不是"一长串无主章节" ✓（消息里提到的是尺寸 ✓）
  let sizeFirst = null
  try { capped.start({ title: 'T', sections: many.slice(0, 5), contributors: {}, editor: 'ed' }) } catch (e) { sizeFirst = e }
  ok(!!sizeFirst && sizeFirst.message.indexOf('too many sections') !== -1 && sizeFirst.message.indexOf('no owner') === -1,
    'M5. ★ the SIZE refusal wins over the ownership refusal (a huge request is refused for its size, not for a long list of names)', sizeFirst && sizeFirst.message.slice(0, 80))

  // ⑤ 键表自述与实际一致 ✓：cap 键在 WIRED 里、不在 PLANNED 里
  ok(WIRED_KEYS.indexOf('vmu.paper.maxSections') !== -1, 'M6. the cap is declared WIRED')
  ok(PLANNED_KEYS.every((e) => e[0] !== 'vmu.paper.maxSections'), 'M7. and it is no longer claimed unwired')
}

console.log('=== VMU PAPER: ' + passed + ' passed, ' + failed + ' failed ===')
for (const f of failures) console.log('  FAIL ' + f)
process.exit(failed === 0 ? 0 : 1)

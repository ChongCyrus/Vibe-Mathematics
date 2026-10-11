// vibe-math-vmu —— 生命周期机（kernel/lifecycle.js）独立测试。
// 运行：`node tests/vmu-lifecycle.test.mjs`（末行 `=== VMU LIFECYCLE: N passed, M failed ===`）。

import assert from 'node:assert/strict'
import { createLifecycle, LIFECYCLE_KEYS } from '../vibe-math-vmu/kernel/lifecycle.js'

let passed = 0
let failed = 0
const cases = []
const test = (n, f) => cases.push({ n, f })
const TABLE = [
  { id: 'L1', name: '选题', requires: ['问题陈述'], gates: [] },
  { id: 'L2', name: '侦察', requires: ['相关文献'], gates: ['domain'] },
  { id: 'L3', name: '形式化', requires: ['命题'], gates: ['domain'] },
  { id: 'L4', name: '定稿', requires: ['证明'], gates: ['domain', 'publication'] },
]
const mk = (over) => {
  const vals = Object.assign({ 'vmu.lifecycle.stages': TABLE }, over || {})
  const reads = []
  return { vals, reads, settings: { get(k) { reads.push(k); return vals[k] } } }
}
const okGate = { check: () => ({ ok: true }) }
const failGate = (missing) => ({ check: () => ({ ok: false, missing }) })

// ① L 编号一一对应（回显；自造名 ⇒ 拒）
// ⑨ ROUND 246: the research-integrity declarations - pre-registration and significance (wired in round 245)
test('pre-registration is checked field by field, and locked when declared', () => {
  const S = {
    'vmu.lifecycle.searchSources': ['pubmed', 'arxiv'],
    'vmu.lifecycle.topicRequiredFields': ['title', 'question'],
    'vmu.lifecycle.variableRoles': ['exposure', 'outcome'],
    'vmu.lifecycle.dedupeKeys': ['doi'],
    'vmu.lifecycle.preregLock': true,
  }
  const lc = createLifecycle({ settings: mk(S).settings, clock: () => 0 })

  const incomplete = lc.prereg({ studyId: 's1', topic: { title: 'T' }, searches: ['pubmed'] })
  assert.equal(incomplete.code, 'VMU_LIFECYCLE_PREREG_INCOMPLETE')
  assert.deepEqual(incomplete.missing, ['question'], 'the missing FIELD is named, not merely counted')

  const missingSource = lc.prereg({ studyId: 's1', topic: { title: 'T', question: 'Q' }, searches: ['pubmed'] })
  assert.equal(missingSource.code, 'VMU_LIFECYCLE_PREREG_INCOMPLETE')
  assert.deepEqual(missingSource.missing, ['arxiv'], 'the missing SEARCH SOURCE is named too')

  const badRole = lc.prereg({ studyId: 's1', topic: { title: 'T', question: 'Q' }, searches: ['pubmed', 'arxiv'], variables: [{ name: 'x', role: 'nonsense' }] })
  assert.equal(badRole.code, 'VMU_LIFECYCLE_PREREG_INCOMPLETE')
  assert.deepEqual(badRole.missing, ['x'], 'a variable outside the declared roles is named')

  const good = lc.prereg({ studyId: 's1', topic: { title: 'T', question: 'Q' }, searches: ['pubmed', 'arxiv'], variables: [{ name: 'x', role: 'exposure' }], keys: { doi: '10.1/a' } })
  assert.equal(good.ok, true)
  assert.equal(good.locked, true, 'the receipt says the registration is locked')

  const relock = lc.prereg({ studyId: 's1', topic: { title: 'T', question: 'Q' }, searches: ['pubmed', 'arxiv'] })
  assert.equal(relock.code, 'VMU_LIFECYCLE_PREREG_LOCKED', 'preregLock=true refuses a second registration')

  const dup = lc.prereg({ studyId: 's2', topic: { title: 'T', question: 'Q' }, searches: ['pubmed', 'arxiv'], keys: { doi: '10.1/a' } })
  assert.equal(dup.code, 'VMU_LIFECYCLE_PREREG_DUPLICATE')
  assert.deepEqual(dup.duplicate, ['doi'], 'the DUPLICATED key is named')
  const other = lc.prereg({ studyId: 's3', topic: { title: 'T', question: 'Q' }, searches: ['pubmed', 'arxiv'], keys: { doi: '10.1/b' } })
  assert.equal(other.ok, true, 'a different value under the same key is fine')
  passed += 1
})

test('significance is judged against the declared alpha and power target', () => {
  const lc = createLifecycle({ settings: mk({ 'vmu.lifecycle.alpha': 0.01, 'vmu.lifecycle.powerTarget': 0.9 }).settings, clock: () => 0 })
  const above = lc.judge({ p: 0.02 })
  assert.equal(above.alpha, 0.01)
  assert.equal(above.significant, false, 'above alpha is NOT significant - and that is a result, not a failure')
  assert.equal(lc.judge({ p: 0.005 }).significant, true)
  assert.equal(lc.judge({ power: 0.7 }).powerMet, false, 'below the power target is reported')
  assert.equal(lc.judge({ power: 0.95 }).powerMet, true)
  assert.equal(lc.judge({}).code, 'VMU_META_VALIDATION_FAILED', 'a judgement with nothing to judge is refused')
  const fallback = createLifecycle({ settings: mk({ 'vmu.lifecycle.alpha': 9, 'vmu.lifecycle.powerTarget': 0 }).settings, clock: () => 0 })
  assert.equal(fallback.status().alpha, 0.05, 'an out-of-range alpha falls back instead of changing meaning silently')
  assert.equal(fallback.status().powerTarget, 0.8)
  passed += 1
})

test('every lifecycle key is read through the settings view, and reported in status', () => {
  const made = mk({ 'vmu.lifecycle.preregLock': true, 'vmu.lifecycle.alpha': 0.02 })
  const lc = createLifecycle({ settings: made.settings, clock: () => 0 })
  lc.status()
  for (const k of LIFECYCLE_KEYS) assert.ok(made.reads.includes(k), 'status() reads ' + k)
  assert.equal(LIFECYCLE_KEYS.length, 11, 'the face declares all eleven keys')
  assert.equal(lc.status().preregLock, true)
  assert.equal(lc.status().alpha, 0.02)
  passed += 1
})

test('stages() echoes the declared L ids; inventing a stage name is refused', () => {
  const lc = createLifecycle({ settings: mk({}).settings, clock: () => 0 })
  const s = lc.stages()
  assert.equal(s.ok, true)
  assert.deepEqual(s.stages.map((x) => x.id), ['L1', 'L2', 'L3', 'L4'])
  const bad = createLifecycle({ settings: mk({ 'vmu.lifecycle.stages': [{ id: 'phase-1' }] }).settings, clock: () => 0 })
  assert.equal(bad.stages().code, 'VMU_LIFECYCLE_BAD_STAGE_ID')
  passed += 1
})

// ② 越级/回退 ⇒ 具名拒 ＋ 当前 L ＋ 合法下一步
test('skipping or going backward is refused with the current L and the legal next step', () => {
  const lc = createLifecycle({ settings: mk({}).settings, clock: () => 0, domaingate: okGate })
  const l1 = lc.advance({ studyId: 's1', to: 'L1', evidence: ['stmt'] })
  assert.equal(l1.ok, true)
  const skip = lc.advance({ studyId: 's1', to: 'L3', evidence: ['x'] })
  assert.equal(skip.code, 'VMU_LIFECYCLE_ILLEGAL_STEP')
  assert.equal(skip.current, 'L1')
  assert.deepEqual(skip.legalNext, ['L2'])
  assert.ok(skip.hint.indexOf('L2') !== -1, '必须给合法下一步：' + skip.hint)
  const back = lc.advance({ studyId: 's1', to: 'L1', evidence: ['x'] })
  assert.equal(back.code, 'VMU_LIFECYCLE_ILLEGAL_STEP')
  assert.equal(back.current, 'L1')
  passed += 1
})

// ③ 闸点未过 ⇒ 点名缺项（判据由接缝给，本面不重定义）
test('an unmet gate names the missing item', () => {
  const lc = createLifecycle({ settings: mk({}).settings, clock: () => 0, domaingate: failGate(['词条索引', '术语表']) })
  lc.advance({ studyId: 's1', to: 'L1', evidence: ['stmt'] })
  const r = lc.advance({ studyId: 's1', to: 'L2', evidence: ['lit'] })
  assert.equal(r.code, 'VMU_LIFECYCLE_GATE_UNMET')
  assert.ok(r.message.indexOf('词条索引') !== -1 && r.message.indexOf('术语表') !== -1, '必须点名缺项：' + r.message)
  passed += 1
})

// ⑤ 无接缝 ⇒ 具名拒（不得假装已检查）
test('a missing seam is a NAMED refusal (never pretends the gate ran)', () => {
  const lc = createLifecycle({ settings: mk({}).settings, clock: () => 0 }) // 无 domaingate
  lc.advance({ studyId: 's1', to: 'L1', evidence: ['stmt'] })
  const r = lc.advance({ studyId: 's1', to: 'L2', evidence: ['lit'] })
  assert.equal(r.code, 'VMU_EXTERNAL_UNAVAILABLE')
  assert.ok(/不得假装/.test(r.message), '必须说明不假跑：' + r.message)
  passed += 1
})

// ④ 准入证据缺失 ⇒ 拒
test('missing admission evidence is refused', () => {
  const lc = createLifecycle({ settings: mk({}).settings, clock: () => 0, domaingate: okGate })
  const r = lc.advance({ studyId: 's1', to: 'L1', evidence: [] })
  assert.equal(r.code, 'VMU_LIFECYCLE_EVIDENCE_REQUIRED')
  assert.ok(r.message.indexOf('问题陈述') !== -1, '点名缺的证据：' + r.message)
  passed += 1
})

// ⑧ 未声明阶段表 ⇒ 拒（不是默认放行）
test('no declared stage table refuses instead of allowing everything', () => {
  const lc = createLifecycle({ settings: mk({ 'vmu.lifecycle.stages': [] }).settings, clock: () => 0 })
  assert.equal(lc.advance({ studyId: 's1', to: 'L1', evidence: ['x'] }).code, 'VMU_LIFECYCLE_NOT_DECLARED')
  const bare = createLifecycle({ clock: () => 0 })
  assert.equal(bare.stages().code, 'VMU_LIFECYCLE_NOT_DECLARED')
  passed += 1
})

// 多闸点（domain ＋ publication）逐个委托
test('every declared gate is delegated in order', () => {
  const seen = []
  const lc = createLifecycle({
    settings: mk({}).settings, clock: () => 0,
    domaingate: { check: (p) => { seen.push('domain:' + p.stage); return { ok: true } } },
    publication: { check: (p) => { seen.push('publication:' + p.stage); return { ok: true } } },
  })
  for (const [to, ev] of [['L1', ['a']], ['L2', ['b']], ['L3', ['c']], ['L4', ['d']]]) assert.equal(lc.advance({ studyId: 's1', to, evidence: ev }).ok, true)
  assert.deepEqual(seen, ['domain:L2', 'domain:L3', 'domain:L4', 'publication:L4'])
  passed += 1
})

// ⑥ 截断必计数
test('artifact cap is counted (droppedArtifacts)', () => {
  const lc = createLifecycle({ settings: mk({ 'vmu.lifecycle.maxArtifacts': 1 }).settings, clock: () => 0 })
  lc.advance({ studyId: 's1', to: 'L1', evidence: ['e1', 'e2', 'e3'] })
  const a = lc.artifacts({ studyId: 's1' })
  assert.equal(a.count, 1)
  assert.ok(a.droppedArtifacts >= 2, '丢弃产物必须计数：got ' + a.droppedArtifacts)
  passed += 1
})

// ⑦ 注入时钟 ⇒ 确定性；只读面纯
test('determinism (injected clock) and read purity', () => {
  const run = () => {
    const lc = createLifecycle({ settings: mk({}).settings, clock: () => 4, domaingate: okGate })
    lc.advance({ studyId: 's1', to: 'L1', evidence: ['a'] })
    return JSON.stringify({ st: lc.state({ studyId: 's1' }), g: lc.gateAt({ studyId: 's1', stage: 'L2' }), ar: lc.artifacts({ studyId: 's1' }), s: lc.status() })
  }
  assert.equal(run(), run())
  const lc = createLifecycle({ settings: mk({}).settings, clock: () => 4, domaingate: okGate })
  lc.advance({ studyId: 's1', to: 'L1', evidence: ['a'] })
  const a = JSON.stringify({ st: lc.state({ studyId: 's1' }), s: lc.status(), t: lc.trail() })
  const b = JSON.stringify({ st: lc.state({ studyId: 's1' }), s: lc.status(), t: lc.trail() })
  assert.equal(a, b)
  assert.equal(lc.state({ studyId: 's1' }).next[0], 'L2')
  passed += 1
})

// keysUsed()：4 键全列且真读
test('keysUsed() lists every lifecycle key and each is really read', () => {
  const o = mk({})
  const lc = createLifecycle({ settings: o.settings, clock: () => 0 })
  lc.stages()
  lc.status()
  const used = lc.keysUsed()
  assert.equal(used.length, LIFECYCLE_KEYS.length)
  for (const k of LIFECYCLE_KEYS) assert.ok(used.indexOf(k) !== -1, '缺失：' + k)
  for (const k of used) assert.ok(o.reads.indexOf(k) !== -1, '键须真读：' + k)
  passed += 1
})

for (const c of cases) {
  try { await c.f(); console.log('ok - ' + c.n) } catch (e) { failed += 1; console.log('FAIL - ' + c.n + ' :: ' + String((e && e.message) || e)) }
}
console.log('=== VMU LIFECYCLE: ' + passed + ' passed, ' + failed + ' failed ===')
process.exit(failed > 0 ? 1 : 0)

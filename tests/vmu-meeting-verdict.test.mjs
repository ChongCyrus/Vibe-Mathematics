// vibe-math-vmu —— 辩论最终裁决的聚合与通知（kernel/meetingverdict.js）独立测试。
// 运行：`node tests/vmu-meeting-verdict.test.mjs`（末行 `=== VMU MEETING VERDICT: N passed, M failed ===`）。
//
// 规则原文（phase 12，逐字）：待辩论会议结束，v5r框架请刚刚各个辩论的各个成员给出最终裁决「布尔概率（[0,1]），理由」，
// 若它们给出的布尔概率全部一致为1（或一致为0）则最终该命题的布尔概率为1（或0），否则取平均值。并发通知告诉该命题卡
// 的持有者「由于…，该命题最终布尔概率裁定为…，故请把相应命题卡的布尔概率改为该概率值」。
//
// 这份测试只断言「机制」：聚合的三种走向（一致 1 / 一致 0 / 否则均值）、浮点纪律（exact 与 rounded 同时给出、写哪个）、
// 六类具名拒（空集、非数字、越界、重复成员、无理由、无 owner/propositionId）、通知载荷真的指名 owner+value，以及
// 投递交给既有 face（端口回 ok:false 也算失败）。**不断言任何措辞**：模板可被 pack 替换，那是政策。

import assert from 'node:assert/strict'
import {
  aggregateVerdicts,
  rulePropositionProbability,
  createMeetingVerdict,
  DEFAULT_RULING_TEMPLATE,
  TEMPLATE_FIELDS,
  VERDICT_PRECISION,
} from '../vibe-math-vmu/kernel/meetingverdict.js'

let passed = 0
let failed = 0
const cases = []
const test = (n, f) => cases.push({ n, f })
const v = (member, p, reason) => ({ member, p, reason: reason === undefined ? ('reason for ' + member) : reason })

// ── ① 三个走向：这是规则本身 ─────────────────────────────────────────────────────────────────────────────────────
test('① 全票 1 ⇒ 最终布尔概率就是 1（一致分支不取均值，且被判为「已裁定」）', () => {
  const r = aggregateVerdicts({ verdicts: [v('acad', 1), v('r-1', 1), v('r-2', 1)] })
  assert.equal(r.mode, 'unanimous')
  assert.equal(r.value, 1)
  assert.equal(r.exact, 1)
  assert.equal(r.decided, true)
  assert.equal(r.estimate, false)
  assert.equal(r.n, 3)
  passed += 1
})

test('① 全票 0 ⇒ 最终布尔概率就是 0（0 不是「没人投票」）', () => {
  const r = aggregateVerdicts({ verdicts: [v('acad', 0), v('r-1', 0)] })
  assert.equal(r.mode, 'unanimous')
  assert.equal(r.value, 0)
  assert.equal(r.decided, true)
  passed += 1
})

test('① 不一致 ⇒ 算术平均，并明确标成「估计」而不是「裁定」', () => {
  const r = aggregateVerdicts({ verdicts: [v('a', 0.2), v('b', 0.4), v('c', 0.9)] })
  assert.equal(r.mode, 'mean')
  assert.equal(r.exact, (0.2 + 0.4 + 0.9) / 3)
  assert.equal(r.decided, false)
  assert.equal(r.estimate, true)
  // 0.5 均值也不许被读成「所里裁定半真」：它仍然是 estimate
  const mid = aggregateVerdicts({ verdicts: [v('a', 0.5), v('b', 0.5)] })
  assert.equal(mid.mode, 'mean')
  assert.equal(mid.value, 0.5)
  assert.equal(mid.estimate, true)
  passed += 1
})

test('① 单成员是退化的一致集合（1 ⇒ 1，0 ⇒ 0，0.5 ⇒ 均值）', () => {
  assert.equal(aggregateVerdicts({ verdicts: [v('solo', 1)] }).value, 1)
  assert.equal(aggregateVerdicts({ verdicts: [v('solo', 0)] }).value, 0)
  const half = aggregateVerdicts({ verdicts: [v('solo', 0.5)] })
  assert.equal(half.mode, 'mean')
  assert.equal(half.value, 0.5)
  passed += 1
})

test('① 边界值 0 与 1 本身可用；spread 同时报出 min/max（2 人 0 与 1 ≠ 两人各 0.5）', () => {
  const r = aggregateVerdicts({ verdicts: [v('a', 0), v('b', 1)] })
  assert.equal(r.mode, 'mean')
  assert.equal(r.value, 0.5)
  assert.equal(r.spread.min, 0)
  assert.equal(r.spread.max, 1)
  const same = aggregateVerdicts({ verdicts: [v('a', 0.5), v('b', 0.5)] })
  assert.deepEqual([same.spread.min, same.spread.max], [0.5, 0.5])
  passed += 1
})

// ── ② 浮点纪律：0.30000000000000004 不许直接写进命题卡 ────────────────────────────────────────────────────────────
test('② 均值同时给 exact 与 rounded，value 取 rounded，并说明取的是哪个', () => {
  const r = aggregateVerdicts({ verdicts: [v('a', 0.1), v('b', 0.2)] })
  assert.equal(r.mode, 'mean')
  assert.equal(r.exact, (0.1 + 0.2) / 2) // 0.15000000000000002
  assert.notEqual(r.exact, 0.15, '这个平台上的 (0.1+0.2)/2 本来就不是 0.15，测试要盯住这一点')
  assert.equal(r.rounded, 0.15)
  assert.equal(r.value, 0.15, '写进命题卡的是 rounded，不是 JS 的原始除法结果')
  assert.equal(r.valueSource, 'rounded')
  assert.equal(r.precision, VERDICT_PRECISION)
  assert.equal(VERDICT_PRECISION, 6)
  passed += 1
})

test('② 精度是声明出来的常量：更多位数不许被悄悄采信（6 位之外只体现在 exact）', () => {
  const p = 1 / 3
  const r = aggregateVerdicts({ verdicts: [v('a', p)] })
  assert.equal(r.value, Number(p.toFixed(VERDICT_PRECISION)))
  assert.equal(r.exact, p)
  assert.ok(String(r.value).length <= String(p).length, '写下的值不应比输入的原始值更长')
  passed += 1
})

test('② 一致分支不引入 rounding：value === exact === 1|0（不出现 0.999999）', () => {
  const r = aggregateVerdicts({ verdicts: [v('a', 1), v('b', 1)] })
  assert.equal(r.valueSource, 'exact')
  assert.equal(r.value, 1)
  passed += 1
})

// ── ③ 六类具名拒：拒绝要说清是哪一条、为什么 ─────────────────────────────────────────────────────────────────
test('③ 空集合被具名拒（均值的空集不是 0，更不是「一致 0」）', () => {
  assert.throws(() => aggregateVerdicts({ verdicts: [] }), (e) => {
    assert.equal(e.code, 'VMU_INVALID_ARGUMENT')
    assert.match(e.message, /empty/)
    assert.ok(e.hint && e.hint.length > 10, '拒绝必须带 hint')
    return true
  })
  passed += 1
})

test('③ 非数字 / NaN / Infinity / 数字字符串 都被具名拒，且报出成员与收到的值', () => {
  for (const bad of ['0.8', NaN, Infinity, null, undefined, {}]) {
    assert.throws(() => aggregateVerdicts({ verdicts: [v('m-1', bad)] }), (e) => {
      assert.equal(e.code, 'VMU_INVALID_ARGUMENT')
      assert.match(e.message, /m-1/, '具名拒必须说是谁的值')
      assert.ok(e.hint && e.hint.length > 10)
      return true
    }, 'p=' + String(bad) + ' 必须被拒')
  }
  passed += 1
})

test('③ 越界值（0.0 以下 / 1 以上，含百分数写法 80）被具名拒', () => {
  for (const bad of [-0.01, 1.01, 80, -1]) {
    assert.throws(() => aggregateVerdicts({ verdicts: [v('m-2', bad)] }), (e) => {
      assert.equal(e.code, 'VMU_INVALID_ARGUMENT')
      assert.match(e.message, /\[0,1\]/)
      return true
    }, 'p=' + String(bad) + ' 必须被拒')
  }
  passed += 1
})

test('③ 同一成员重复裁决被具名拒（不许把人当权重）', () => {
  assert.throws(() => aggregateVerdicts({ verdicts: [v('dup', 1), v('dup', 0)] }), (e) => {
    assert.equal(e.code, 'VMU_INVALID_ARGUMENT')
    assert.match(e.message, /dup/)
    return true
  })
  passed += 1
})

test('③ 没有理由的裸数字被具名拒（规则要的是「布尔概率, 理由」）', () => {
  for (const bad of ['', '   ', undefined, null, 42]) {
    assert.throws(() => aggregateVerdicts({ verdicts: [{ member: 'm-3', p: 0.5, reason: bad }] }), (e) => {
      assert.equal(e.code, 'VMU_INVALID_ARGUMENT')
      assert.match(e.message, /m-3/)
      return true
    }, 'reason=' + String(bad) + ' 必须被拒')
  }
  passed += 1
})

test('③ 行本身不是对象 / 没写成员 也被具名拒（不猜是谁）', () => {
  for (const bad of [null, 'a', 7, []]) {
    assert.throws(() => aggregateVerdicts({ verdicts: [bad] }), (e) => {
      assert.equal(e.code, 'VMU_INVALID_ARGUMENT')
      assert.match(e.message, /row 0/)
      return true
    })
  }
  assert.throws(() => aggregateVerdicts({ verdicts: [{ p: 1, reason: 'x' }] }), (e) => {
    assert.match(e.message, /names no member/)
    return true
  })
  passed += 1
})

test('③ 整个参数缺失/不是数组 也被具名拒（不是 TypeError）', () => {
  for (const bad of [undefined, null, 42, {}, 'x']) {
    assert.throws(() => aggregateVerdicts(bad === undefined ? {} : { verdicts: bad }), (e) => {
      assert.equal(e.code, 'VMU_INVALID_ARGUMENT')
      return true
    })
  }
  passed += 1
})

// ── ④ 通知载荷：真的指名 owner 与 value（这是「闭环」的那一半）──────────────────────────────────────────────────
test('④ 载荷指名持有者、命题、值、模式、逐成员（机器可读，不是散文）', () => {
  const r = rulePropositionProbability({
    verdicts: [v('a', 0.2, '弱证据'), v('b', 0.4, '部分成立')],
    propositionId: 'prop-42',
    owner: 'chen',
    from: 'chair',
  })
  const n = r.notice
  assert.equal(n.to, 'chen', '收件人必须是卡的主人')
  assert.equal(n.about, 'prop-42', '必须说是哪张卡')
  assert.equal(n.kind, 'verdict-ruling')
  assert.equal(n.value, 0.3)
  assert.equal(n.mode, 'mean')
  assert.equal(n.n, 2)
  assert.equal(n.from, 'chair')
  // ★ RULE E 同族自查：这里是同形状的第二处——先证非空（否则 `every` 在 `[]` 上恒真），再断言性质。
  assert.ok(Array.isArray(n.perMember) && n.perMember.length === 2, 'notice.perMember must carry exactly the two voters')
  assert.deepEqual(n.perMember.map((x) => x.member), ['a', 'b'])
  assert.deepEqual(n.perMember.map((x) => x.p), [0.2, 0.4])
  assert.ok(n.perMember.every((x) => typeof x.reason === 'string' && x.reason.length > 0))
  passed += 1
})

test('④ 通知文本把四个事实都带进去了：值、为什么、哪张卡、要做什么（默认模板）', () => {
  const mixed = rulePropositionProbability({ verdicts: [v('a', 0.2), v('b', 0.4)], propositionId: 'prop-42', owner: 'chen' })
  assert.match(mixed.notice.text, /0\.3/, '必须出现裁定值')
  assert.match(mixed.notice.text, /prop-42/, '必须出现命题 id')
  assert.match(mixed.notice.text, /2/, '必须说明几位成员')
  assert.match(mixed.notice.text, /布尔概率/, '必须说这是布尔概率')
  assert.match(mixed.notice.text, /请把/, '必须提出「请把…改为…」')
  const uni = rulePropositionProbability({ verdicts: [v('a', 1), v('b', 1)], propositionId: 'p-9', owner: 'chen' })
  assert.match(uni.notice.text, /全部一致/, '一致分支要说清是一致，而不是平均')
  assert.equal(uni.notice.mode, 'unanimous')
  passed += 1
})

test('④ 模板可由 pack 换（内核不决定措辞），且未知占位符不被静默清空', () => {
  const r = rulePropositionProbability({
    verdicts: [v('a', 1)],
    propositionId: 'p-1',
    owner: 'chen',
    template: 'RULE {value} FOR {proposition} TO {owner} BY {n}{nope}',
  })
  assert.equal(r.notice.text, 'RULE 1 FOR p-1 TO chen BY 1{nope}')
  assert.ok(TEMPLATE_FIELDS.includes('value') && TEMPLATE_FIELDS.includes('owner'))
  assert.ok(DEFAULT_RULING_TEMPLATE.unanimous.includes('{value}'))
  assert.ok(DEFAULT_RULING_TEMPLATE.mean.includes('{list}'))
  // 空模板 / 非字符串模板被具名拒
  assert.throws(() => rulePropositionProbability({ verdicts: [v('a', 1)], propositionId: 'p', owner: 'o', template: '  ' }), (e) => e.code === 'VMU_INVALID_ARGUMENT')
  passed += 1
})

test('④ 缺 propositionId 或缺 owner 被具名拒（没有这两种信息就不存在通知）', () => {
  assert.throws(() => rulePropositionProbability({ verdicts: [v('a', 1)], owner: 'chen' }), (e) => {
    assert.equal(e.code, 'VMU_INVALID_ARGUMENT')
    assert.match(e.message, /propositionId/)
    return true
  })
  assert.throws(() => rulePropositionProbability({ verdicts: [v('a', 1)], propositionId: 'p-1' }), (e) => {
    assert.match(e.message, /owner/)
    return true
  })
  assert.throws(() => rulePropositionProbability({ verdicts: [v('a', 1)], propositionId: '  ', owner: 'chen' }), (e) => e.code === 'VMU_INVALID_ARGUMENT')
  passed += 1
})

test('④ 没绑 send 端口 ⇒ 载荷齐全但 nothing sent，且如实自述（不是假绿）', () => {
  const r = rulePropositionProbability({ verdicts: [v('a', 1)], propositionId: 'p-1', owner: 'chen' })
  assert.equal(r.delivery.attempted, false)
  assert.equal(r.delivery.ok, null)
  assert.match(r.delivery.note, /NOTHING was sent/)
  passed += 1
})

test('④ 绑了 send 端口 ⇒ 载荷真的交到那个端口（还带 from），并记录成功', () => {
  const seen = []
  const f = createMeetingVerdict({ clock: () => 777, send: (n) => { seen.push(n); return { ok: true, id: 'm-1' } } })
  const r = f.rulePropositionProbability({ verdicts: [v('a', 0), v('b', 0)], propositionId: 'p-2', owner: 'li', from: 'chair' })
  assert.equal(seen.length, 1)
  assert.equal(seen[0].to, 'li')
  assert.equal(seen[0].from, 'chair')
  assert.equal(seen[0].value, 0)
  assert.equal(r.delivery.attempted, true)
  assert.equal(r.delivery.ok, true)
  assert.equal(r.at, 777, '时钟由装配提供，缺省是 0（纯函数）')
  assert.equal(f.status().delivery.attempts, 1)
  assert.equal(f.status().delivery.failures, 0)
  passed += 1
})

test('④ 端口「回 ok:false」也算投递失败（不抛异常不等于送到了）', () => {
  const f = createMeetingVerdict({ send: () => ({ ok: false, code: 'VMU_MAILBOX_NO_SUCH_RECIPIENT', message: 'no such recipient' }) })
  const r = f.rulePropositionProbability({ verdicts: [v('a', 1)], propositionId: 'p-3', owner: 'ghost' })
  assert.equal(r.delivery.ok, false)
  assert.equal(r.delivery.code, 'VMU_MAILBOX_NO_SUCH_RECIPIENT')
  assert.equal(f.status().delivery.failures, 1)
  assert.equal(r.ok, true, '裁决本身仍然成立：投递失败不许把算好的值也一起吞掉')
  passed += 1
})

test('④ 端口抛异常 ⇒ 裁决保留 + 具名失败 + 不吞（既有惯例：记数并上报）', () => {
  const logged = []
  const f = createMeetingVerdict({ send: () => { const e = new Error('boom'); e.code = 'VMU_ENGINE_UNAVAILABLE'; throw e }, log: (x) => logged.push(x) })
  const r = f.rulePropositionProbability({ verdicts: [v('a', 1)], propositionId: 'p-4', owner: 'li' })
  assert.equal(r.value, 1)
  assert.equal(r.delivery.ok, false)
  assert.equal(r.delivery.code, 'VMU_ENGINE_UNAVAILABLE')
  assert.ok(logged.some((x) => x && x.type === 'meeting/verdict-delivery-failed'), '失败必须留痕')
  passed += 1
})

test('④ 通知载荷是冻结的（下游不能偷偷改裁定值）', () => {
  const r = rulePropositionProbability({ verdicts: [v('a', 0.5)], propositionId: 'p-5', owner: 'chen' })
  assert.ok(Object.isFrozen(r.notice))
  assert.throws(() => { 'use strict'; r.notice.value = 1 }, TypeError)
  assert.equal(r.notice.value, 0.5)
  passed += 1
})

// ── ⑤ 事件：登记了就必须真的 emit；失败不许掀翻已经算好的值 ─────────────────────────────────────────────────────
test('⑤ 绑了 bus ⇒ 每次裁定 emit 一次 meeting/verdict-ruled，载荷含命题/主人/值/模式', () => {
  const events = []
  const f = createMeetingVerdict({ bus: { emit: (name, payload) => { events.push({ name, payload }) } } })
  f.rulePropositionProbability({ verdicts: [v('a', 1)], propositionId: 'p-6', owner: 'chen' })
  assert.equal(events.length, 1)
  assert.equal(events[0].name, 'meeting/verdict-ruled')
  assert.equal(events[0].payload.type, 'meeting/verdict-ruled')
  assert.equal(events[0].payload.proposition, 'p-6')
  assert.equal(events[0].payload.owner, 'chen')
  assert.equal(events[0].payload.value, 1)
  assert.equal(events[0].payload.mode, 'unanimous')
  assert.equal(events[0].payload.n, 1)
  passed += 1
})

test('⑤ 只有 aggregate（没裁定）不 emit；被拒也不算 emit（事件只对应「真的产出了一个裁定」）', () => {
  const events = []
  const f = createMeetingVerdict({ bus: { emit: (name) => events.push(name) } })
  f.aggregateVerdicts({ verdicts: [v('a', 0.5)] })
  assert.equal(events.length, 0)
  assert.throws(() => f.rulePropositionProbability({ verdicts: [], propositionId: 'p', owner: 'o' }))
  assert.equal(events.length, 0)
  assert.equal(f.status().refusals, 1)
  passed += 1
})

test('⑤ emit 抛异常 ⇒ 裁定仍然成立，失败被记数并留痕（监听者的错不许吞掉值）', () => {
  const logged = []
  const f = createMeetingVerdict({ bus: { emit: () => { throw new Error('listener exploded') } }, log: (x) => logged.push(x) })
  const r = f.rulePropositionProbability({ verdicts: [v('a', 1)], propositionId: 'p-7', owner: 'chen' })
  assert.equal(r.value, 1)
  assert.equal(r.ok, true)
  assert.equal(f.status().emit.failures, 1)
  assert.ok(logged.some((x) => x && x.type === 'bus/emit-failed' && x.name === 'meeting/verdict-ruled'))
  passed += 1
})

// ── ⑥ 纯函数纪律 + 自述 ────────────────────────────────────────────────────────────────────────────────────────
test('⑥ 同一个集合问两次答案相同（无时钟/无随机/无隐藏状态）', () => {
  const rows = [v('a', 0.1), v('b', 0.7), v('c', 0.4)]
  const one = aggregateVerdicts({ verdicts: rows })
  const two = aggregateVerdicts({ verdicts: rows })
  assert.deepEqual(one, two)
  const f = createMeetingVerdict({})
  assert.equal(f.aggregateVerdicts({ verdicts: rows }).value, one.value)
  assert.equal(f.aggregateVerdicts({ verdicts: rows }).value, one.value)
  passed += 1
})

test('⑥ 不读任何设置键：keys 恒为空数组，status 自述「不读设置、不投递」', () => {
  const r = aggregateVerdicts({ verdicts: [v('a', 1)] })
  assert.deepEqual(r.keys, [])
  const f = createMeetingVerdict({})
  assert.deepEqual(f.status().keys, [])
  assert.equal(f.status().delivery.portBound, false)
  assert.match(f.status().note, /NO setting is read/)
  assert.doesNotThrow(() => createMeetingVerdict({}))
  passed += 1
})

test('⑥ status 自述是自证的：算了几次、裁了几次、拒了几次，与实际一致', () => {
  const f = createMeetingVerdict({})
  f.aggregateVerdicts({ verdicts: [v('a', 1)] })
  f.aggregateVerdicts({ verdicts: [v('a', 0.5)] })
  f.rulePropositionProbability({ verdicts: [v('a', 1)], propositionId: 'p-8', owner: 'chen' })
  try { f.aggregateVerdicts({ verdicts: [] }) } catch (e) { /* expected */ }
  const s = f.status()
  assert.equal(s.aggregations, 2)
  assert.equal(s.rulings, 1)
  assert.equal(s.refusals, 1)
  assert.equal(s.lastRuling.proposition, 'p-8')
  assert.equal(s.lastRuling.owner, 'chen')
  assert.equal(s.lastRuling.mode, 'unanimous')
  passed += 1
})

test('⑥ 导出面稳定：四个导出都在，默认导出是工厂（docs/02 kernel-index 生成器读的是这些名字）', async () => {
  const mod = await import('../vibe-math-vmu/kernel/meetingverdict.js')
  assert.equal(typeof mod.aggregateVerdicts, 'function')
  assert.equal(typeof mod.rulePropositionProbability, 'function')
  assert.equal(typeof mod.createMeetingVerdict, 'function')
  assert.equal(typeof mod.default, 'function')
  assert.equal(typeof mod.rulePropositionProbability({ verdicts: [v('a', 1)], propositionId: 'p', owner: 'o' }).notice.text, 'string')
  passed += 1
})

// ── ⑧ 一个桶一条裁定（Lead 追问的「票→动议」纪律）────────────────────────────────────────────────────────────
// 一个跨两个命题的均值是「关于什么都没有的数」：每一行都合法、算术也合法，但答案两个命题都不对。
test('⑧ 行自带 propositionId 且全同 ⇒ 聚合出 proposition，值与该桶一致（不跨桶）', () => {
  const r = aggregateVerdicts({ verdicts: [
    { member: 'a', p: 0.2, reason: 'r-a', propositionId: 'p-1' },
    { member: 'b', p: 0.4, reason: 'r-b', propositionId: 'p-1' },
  ] })
  assert.equal(r.mode, 'mean')
  assert.equal(r.value, 0.3)
  assert.equal(r.proposition, 'p-1')
  // ★ RULE E（空洞断言家族）：对集合"的性质"断言之前，先断言它**非空**。`[]` 上的 `every(...)` 恒真——本仓反复
  // 踩过这个坑（一个永不失败的测试比没有测试更糟）。这里两层：先证 perMember 是数组且非空，再逐项断言。
  assert.ok(Array.isArray(r.perMember), 'perMember is reported as an array, not undefined')
  assert.ok(r.perMember.length > 0, 'perMember must not be empty (an empty list makes every(...) vacuously true)')
  assert.equal(r.perMember.length, 2)
  assert.deepEqual(r.perMember.map((x) => x.member), ['a', 'b'])
  assert.ok(r.perMember.every((x) => x.proposition === 'p-1'), 'every row carries the bucket proposition')
  passed += 1
})

test('⑧ 两个不同命题混在一起 ⇒ 具名拒，且把「谁说的哪个命题」报出来（绝不取均值）', () => {
  assert.throws(() => aggregateVerdicts({ verdicts: [
    { member: 'a', p: 0.2, reason: 'r-a', propositionId: 'p-1' },
    { member: 'b', p: 0.4, reason: 'r-b', propositionId: 'p-2' },
  ] }), (e) => {
    assert.equal(e.code, 'VMU_INVALID_ARGUMENT')
    assert.match(e.message, /more than one proposition/)
    assert.match(e.message, /p-1/)
    assert.match(e.message, /p-2/)
    assert.match(e.message, /a/)
    assert.match(e.message, /b/)
    assert.deepEqual(e.propositions, ['p-1', 'p-2'])
    return true
  })
  passed += 1
})

test('⑧ 只标了一部分行 ⇒ 具名拒（半标的桶无法证明是同一个桶）', () => {
  assert.throws(() => aggregateVerdicts({ verdicts: [
    { member: 'a', p: 1, reason: 'r-a', propositionId: 'p-1' },
    { member: 'b', p: 1, reason: 'r-b' },
  ] }), (e) => {
    assert.equal(e.code, 'VMU_INVALID_ARGUMENT')
    assert.match(e.message, /only some verdicts name the proposition/)
    assert.deepEqual(e.named, ['a'])
    assert.deepEqual(e.unnamed, ['b'])
    return true
  })
  passed += 1
})

test('⑧ 目标命题与裁决行所指不一致 ⇒ rulePropositionProbability 具名拒（不裁错卡）', () => {
  assert.throws(() => rulePropositionProbability({ verdicts: [
    { member: 'a', p: 1, reason: 'r-a', propositionId: 'p-OTHER' },
  ], propositionId: 'p-MINE', owner: 'chen' }), (e) => {
    assert.equal(e.code, 'VMU_INVALID_ARGUMENT')
    assert.match(e.message, /about proposition "p-OTHER"/)
    assert.match(e.message, /about "p-MINE"/)
    assert.equal(e.target, 'p-MINE')
    assert.equal(e.verdictsAbout, 'p-OTHER')
    return true
  })
  passed += 1
})

test('⑧ 目标命题与裁决行一致 ⇒ 照常裁定，notice.about 就是目标；不标命题的行也照常（纯计算）', () => {
  const r = rulePropositionProbability({ verdicts: [
    { member: 'a', p: 1, reason: 'r-a', propositionId: 'p-1' },
    { member: 'b', p: 1, reason: 'r-b', propositionId: 'p-1' },
  ], propositionId: 'p-1', owner: 'chen', from: 'chair' })
  assert.equal(r.proposition, 'p-1')
  assert.equal(r.notice.about, 'p-1')
  assert.equal(r.notice.value, 1)
  const plain = aggregateVerdicts({ verdicts: [v('a', 0.5)] })
  assert.equal(plain.proposition, null)
  assert.equal(plain.mode, 'mean')
  passed += 1
})

test('⑧ propositionId 给了个非空串以外的值 ⇒ 具名拒（不做真值转换）', () => {
  for (const bad of [1, {}, '', '   ', true]) {
    assert.throws(() => aggregateVerdicts({ verdicts: [v('a', 1)], propositionId: bad }), (e) => {
      assert.equal(e.code, 'VMU_INVALID_ARGUMENT')
      assert.match(e.message, /propositionId/)
      return true
    })
  }
  // 行上的 propositionId 同理：数字 id 不能被当成字符串比较
  assert.throws(() => aggregateVerdicts({ verdicts: [{ member: 'a', p: 1, reason: 'r', propositionId: 7 }] }), (e) => {
    assert.equal(e.code, 'VMU_INVALID_ARGUMENT')
    assert.match(e.message, /non-empty string/)
    return true
  })
  passed += 1
})

for (const c of cases) {
  try { await c.f(); console.log('ok - ' + c.n) } catch (e) { failed += 1; console.log('FAIL - ' + c.n + ' :: ' + String((e && e.message) || e)) }
}

console.log('=== VMU MEETING VERDICT: ' + passed + ' passed, ' + failed + ' failed ===')
process.exit(failed > 0 ? 1 : 0)

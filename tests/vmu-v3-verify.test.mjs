// tests/vmu-v3-verify.test.mjs — PHASE 6 / **P0-7（验证闭环：≥2 票／辩论／裁决／回写）**。
//
// 这张卡要证明的不是"写了一个 middleware"，而是下面这些【都会失败】的事实：
//
//   ① **单票绝不定论**：闸门在结算层（`trySettle`），不在算术里。1 票 ⇒ 具名 `VMU_BALLOT_MIN_VOTES_NOT_MET`，
//      且**不是**否决策：对象卡一个字段不改、verified 轨不写、裁决 journal 不写（只写一条"未成立"审计）。
//      `verifierCount=1` 也只得到下限 2（v3 `voteCount` 的 `Math.max(2, …)`）。
//   ② **法定人数由内核强制**：内核票箱在 `vmu.ballot.minVotes=3` 下、只 2 票 close ⇒ 具名拒，且 `tally.floor/floorBase` 可读；
//      连续概率由 pack 聚合（分层写在 verify.js 文件头）。
//   ③ **聚合边界逐个钉**：全 1→1／全 0→0／同侧均值 **恰好 0.85** 取均值／0.845 落到 forced／forced 夹 [0.01,0.99]／
//      natural 不夹（原值）／flat 0.5 —— 每一条都断**具体数值**，不是区间。
//   ④ **辩论轮次有界**：非全票一致才辩论、每轮新票箱、轮次用完**具名收口**（`maxRoundsReached: true`），
//      派发的票数正好 `required × 轮数`，没有第 N+1 轮。
//   ⑤ **三处同时存在**：命题卡状态/概率 ＋ `verified` 轨定论卡（只经 `promoteVerified`）＋ `journal` 裁决记录。
//   ⑥ **载体**：票只能走已登记字段 `progress` 的载荷（同名字段 `progress.votes` 或 `vote:` tag），消费后
//      `rewriteResult` 必须是 JSON 对象文本；缺字段的票进具名 journal，不静默丢。
//
// RULE E（本仓的"不可能失败"守卫）：本文件不用 `.every(` 判可能为空的集合、不用 `filter(...).length===0`
// 的随形写法、不把断言塞进条件分支；集合类断言一律先钉住**具体条数**，再逐项 forEach。
import { readFileSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, join } from 'node:path'

import { createKernel } from '../vibe-math-vmu/kernel/index.js'
import { createPackLoader } from '../vibe-math-vmu/kernel/pack.js'
import { SETTING_DEFS } from '../vibe-math-vmu/settings/schema.js'
import { PACK } from '../vibe-math-vmu/packs/v3/index.js'
import { V3_TICK_TOPIC } from '../vibe-math-vmu/packs/v3/middleware/tick.js'
import { writeCard, parseCard, escField } from '../vibe-math-vmu/packs/v3/middleware/dataplane.js'
import {
  V3_VERIFY_MODULE, VOTES_TRACK, VOTE_KIND, VOTE_TAG_PREFIX,
  NEAR_CONSENSUS_THRESHOLD, FORCED_MIN, FORCED_MAX, MIN_VERIFIERS, VERDICT_RULES,
  aggregateVerdict, requiredVerifiers, verifierIds, optionForResult,
  recordVote, readVotes, openVoteBox, submitVote, trySettle, settleProposition,
  recordUndecided, votesFromReply, v3VerifyStatus, listCandidates, isVerifierMember,
} from '../vibe-math-vmu/packs/v3/middleware/verify.js'
import { listGates, approveGate, rejectGate, v3GatesStatus } from '../vibe-math-vmu/packs/v3/middleware/gates.js'

const HERE = dirname(fileURLToPath(import.meta.url))
const VMU = join(HERE, '..', 'vibe-math-vmu')
const DEFAULTS_FILE = join(VMU, 'packs', 'v3', 'settings', 'defaults.json')
const ENTRY = join(VMU, 'vibe-math-vmu.js')

let passed = 0
let failed = 0
const failures = []
const ok = (cond, label, detail) => {
  if (cond) { passed++; console.log('  ok   ' + label); return true }
  failed++; failures.push(label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  console.error('  FAIL ' + label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  return false
}

const PACK_DEFAULTS = (() => {
  const parsed = JSON.parse(readFileSync(DEFAULTS_FILE, 'utf8'))
  return parsed && typeof parsed.defaults === 'object' && parsed.defaults ? parsed.defaults : {}
})()
const clone = (o) => JSON.parse(JSON.stringify(o))
const ACK = JSON.stringify({ prioritize: 'ack' })
const sameList = (a, b) => Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.join('\u0000') === b.join('\u0000')

function makeKernel({ overrides = {} } = {}) {
  const clockRef = { at: 1000 }
  const kernel = createKernel({ clock: () => clockRef.at, settings: Object.assign(clone(PACK_DEFAULTS), overrides) })
  return { kernel, clockRef, records: kernel.records }
}

function boot({ replier = null, overrides = {} } = {}) {
  const delivered = []
  const clockRef = { at: 1000 }
  const kernel = createKernel({
    clock: () => clockRef.at,
    settings: Object.assign(clone(PACK_DEFAULTS), overrides),
    sections: PACK.sections,
    deliverTurn: async ({ turn, text }) => { delivered.push({ member: turn.member, task: turn.task, statusBlock: turn.statusBlock }); return replier ? replier({ turn, text }) : ACK },
  })
  const loader = createPackLoader({ kernel, registry: kernel.registry, onPromptPolicy: () => () => {} })
  return { kernel, loader, delivered, clockRef, records: kernel.records }
}

async function tick(h, at) {
  // ★ SLV / TWO-PHASE: tick 1 dispatches verifier turns; the deterministic barrier lets turn/reply-parsed write the
  // votes; tick 2 settles the round. No sleeping.
  h.clockRef.at = at
  // One verifier per tick is dispatched (the loop returns on dispatch); the deterministic barrier lets each reply land,
  // and repeated ticks dispatch the remaining verifiers and finally settle. No sleeping anywhere.
  const before = v3VerifyStatus()
  const receipts = []
  for (let i = 0; i < 12; i += 1) {
    h.clockRef.at = at
    receipts.push(await h.kernel.bus.emit(V3_TICK_TOPIC, { at }, {}))
    await h.kernel.turn.whenIdle()
    const st = v3VerifyStatus()
    if (st.verdicts > before.verdicts || st.undecided > before.undecided || st.maxRoundsStops > before.maxRoundsStops) break
  }
  await new Promise((resolve) => setImmediate(resolve))
  return { receipts, ...receipts[receipts.length - 1] }
}

/** 一个按 (round, verifier index) 返回概率的"验证者"；返回 null ⇒ 该回合不投票（模拟没交票）。 */
const voteReplier = (byRound) => ({ turn }) => {
  const m = /^verifier-(\d+)$/.exec(String(turn.member || ''))
  if (!m) return ACK
  const index = Number(m[1])
  const rm = /:r(\d+):/.exec(String(turn.task || ''))
  const round = rm ? Number(rm[1]) : 1
  const result = byRound(round, index)
  if (result === null || result === undefined) return ACK
  const brief = JSON.parse(String(turn.statusBlock || '{}'))
  return JSON.stringify({ progress: { votes: [{ target: brief.target, result, reason: '理由 ' + index + ' / r' + round, round }] } })
}

/** 按"卡内 ID"找命题记录（records 的记录 id 是 r-N，卡里写的是 - ID: p-1）。 */
function findProp(records, cardId) {
  const list = records.list({ track: 'propos', limit: 0 })
  for (const head of list.items) {
    const rec = records.get({ id: head.id })
    const parsed = parseCard(rec.body)
    if (parsed.ok && parsed.kind === 'proposition' && String(parsed.card.id) === String(cardId)) return { recordId: head.id, body: rec.body, card: parsed.card }
  }
  return null
}
const propCard = (kernel, id, extra = {}) => writeCard({
  records: kernel.records, kind: 'proposition',
  card: Object.assign({ id, 标题: '命题 ' + id, 概率: 0.5, 陈述: '陈述 ' + id + '。' }, extra),
})
const journalTitles = (records) => records.list({ track: 'journal', limit: 0 }).items.map((h) => records.get({ id: h.id }).title)

console.log('=== 1. 形状与设置：verify 是第五个模块；三把键已登记；常量就是 v3 的语义 ===')
{
  ok(PACK && PACK.id === 'v3', 'PACK.id 是 v3', PACK && PACK.id)
  const entries = Array.isArray(PACK.middleware) ? PACK.middleware : []
  const verifyEntry = entries.find((e) => e && e.id === 'v3-verify')
  const methodsEntry = entries.find((e) => e && e.id === 'v3-methods')
  const planeEntry = entries.find((e) => e && e.id === 'v3-dataplane')
  ok(verifyEntry !== undefined && verifyEntry.module === V3_VERIFY_MODULE,
    '清单携带 v3-verify 条目且携带 module 对象', verifyEntry && typeof verifyEntry.module)
  ok(verifyEntry && Array.isArray(verifyEntry.on) && verifyEntry.on.includes(V3_TICK_TOPIC) && verifyEntry.on.includes('turn/reply-parsed'),
    '条目订阅 v3/tick（唯一派发点）与 turn/reply-parsed（K10 消费点）', verifyEntry && verifyEntry.on)
  ok(verifyEntry && Array.isArray(verifyEntry.capabilities) && verifyEntry.capabilities.includes('trigger-workflow') && verifyEntry.capabilities.includes('rewrite-result'),
    '条目声明 trigger-workflow + rewrite-result', verifyEntry && verifyEntry.capabilities)
  ok(verifyEntry && methodsEntry && verifyEntry.order > methodsEntry.order && planeEntry && verifyEntry.order < planeEntry.order,
    'order 落在 methods(115) 与 dataplane(120) 之间（裁决回写先落、索引后建）', { methods: methodsEntry && methodsEntry.order, verify: verifyEntry && verifyEntry.order, plane: planeEntry && planeEntry.order })
  const requires = Array.isArray(PACK.requires) ? PACK.requires.map((r) => r && r.service) : []
  ok(requires.includes('vmu.records') && requires.includes('vmu.turn') && requires.includes('vmu.ballotbox'),
    '清单 requires 覆盖 records/turn/**ballotbox**（法定人数由内核强制的前提）', requires)
  ok(V3_VERIFY_MODULE.meta && V3_VERIFY_MODULE.meta.id === 'v3-verify' && Number.isInteger(V3_VERIFY_MODULE.meta.apiVersion),
    '模块带 meta.id/meta.apiVersion（loader 的硬门槛）', V3_VERIFY_MODULE.meta)
  ok(typeof V3_VERIFY_MODULE.hooks[V3_TICK_TOPIC] === 'function' && typeof V3_VERIFY_MODULE.hooks['turn/reply-parsed'] === 'function',
    '模块 hooks 里真的有 tick 与 reply-parsed 两个处理器', Object.keys(V3_VERIFY_MODULE.hooks))

  const defs = new Map(SETTING_DEFS.map((d) => [d.key, d]))
  const vc = defs.get('vmu.v3.verifierCount')
  const rounds = defs.get('vmu.v3.debateMaxRounds')
  const mode = defs.get('vmu.v3.verdictMode')
  ok(vc && vc.def === 3, 'vmu.v3.verifierCount 已登记且默认 3', vc && vc.def)
  ok(rounds && rounds.def === 5, 'vmu.v3.debateMaxRounds 已登记且默认 5', rounds && rounds.def)
  ok(mode && mode.def === 'forced' && Array.isArray(mode.domain) && mode.domain.includes('forced') && mode.domain.includes('natural'),
    'vmu.v3.verdictMode 已登记：默认 forced、域 [forced, natural]', mode && { def: mode.def, domain: mode.domain })
  ok(NEAR_CONSENSUS_THRESHOLD === 0.85 && FORCED_MIN === 0.01 && FORCED_MAX === 0.99 && MIN_VERIFIERS === 2,
    '常量 = v3 的值：近共识 0.85／forced 夹 [0.01,0.99]／最低 2 票', { t: NEAR_CONSENSUS_THRESHOLD, lo: FORCED_MIN, hi: FORCED_MAX, min: MIN_VERIFIERS })
  ok(requiredVerifiers(3) === 3 && requiredVerifiers(1) === 2 && requiredVerifiers(0) === 3,
    '★ 需要几票 = max(2, verifierCount)：verifierCount=1 ⇒ 2（单票永远不够）', { v1: requiredVerifiers(1), v3: requiredVerifiers(3) })
  ok(verifierIds(3).length === 3 && sameList(verifierIds(3), ['verifier-1', 'verifier-2', 'verifier-3']),
    '验证者 id 是 verifier-1..N（不同 id 才能让内核票箱"一人一票"成立）', verifierIds(3))
  ok(optionForResult(0.9) === 'for' && optionForResult(0.1) === 'against' && optionForResult(0.5) === 'for',
    '连续票 → 票箱选项：≥0.5 记 for、<0.5 记 against（0.5 是一种立场，不是弃权）', [optionForResult(0.9), optionForResult(0.1), optionForResult(0.5)])
  ok(isVerifierMember('verifier-1') && !isVerifierMember('verifier') && !isVerifierMember('solver'),
    '只有 verifier-N 形状的成员被当成验证者（不抢 solver/planner 的回执）', {})
  ok(VERDICT_RULES.length === 6 && VERDICT_RULES.includes('near-consensus-mean') && VERDICT_RULES.includes('forced-mean') && VERDICT_RULES.includes('flat'),
    '裁决规则名是封闭清单（回执/审计按它逐条点名）', VERDICT_RULES)
}

console.log('=== 2. 纯聚合边界（每个都断具体数值：0.85 恰好、0.845、全 1、全 0、forced 夹端点、natural 原值、flat 0.5） ===')
{
  const near = (x, y) => Math.abs(x - y) < 1e-12
  const cases = [
    { rs: [1, 1, 1], mode: 'forced', verdict: 1, rule: 'unanimous-1', why: '全 1 ⇒ 1' },
    { rs: [0, 0, 0], mode: 'forced', verdict: 0, rule: 'unanimous-0', why: '全 0 ⇒ 0' },
    { rs: [0.9, 0.9, 1.0], mode: 'forced', verdict: 0.9333333333333333, rule: 'near-consensus-mean', why: '近共识取均值 0.9333（清单断言）' },
    { rs: [0.8, 0.9], mode: 'forced', verdict: 0.85, rule: 'near-consensus-mean', why: '★ 均值**恰好** 0.85 落在近共识一侧（>= 而不是 >）' },
    { rs: [0.79, 0.9], mode: 'forced', verdict: 0.845, rule: 'forced-mean', why: '★ 均值 0.845 差一点 ⇒ 落到 forced 分支（阈值边界另一侧）' },
    { rs: [0.9, 0.8, 0.7], mode: 'forced', verdict: 0.8, rule: 'forced-mean', why: 'forced 等权均值 0.8（清单断言）' },
    { rs: [1, 1, 0.998], mode: 'forced', verdict: 0.99, rule: 'near-consensus-mean', why: '★ forced 上夹：非全 1 的高均值被夹到恰好 0.99（清单 forced 夹端点）' },
    { rs: [1, 1, 0.998], mode: 'natural', verdict: 0.9993333333333333, rule: 'near-consensus-mean', why: '★ natural 不夹（schema 的"原值"）——同一输入两档不同' },
    { rs: [0, 0, 0.002], mode: 'forced', verdict: 0.01, rule: 'near-consensus-mean', why: '★ forced 下夹：低均值被夹到恰好 0.01（清单 forced 夹端点）' },
    { rs: [0, 0, 0.002], mode: 'natural', verdict: 0.0006666666666666666, rule: 'near-consensus-mean', why: '★ natural 低侧不夹（原值）' },
    { rs: [1, 1, 0], mode: 'forced', verdict: 2 / 3, rule: 'forced-mean', why: '★ 3 票 2 同意：forced 均值 2/3（不是 1，也不是 0）' },
    { rs: [0.9, 0.2], mode: 'forced', verdict: 0.55, rule: 'forced-mean', why: '两侧分歧 ⇒ forced 等权均值 0.55' },
    { rs: [1, 1, 0], mode: 'natural', verdict: 2 / 3, rule: 'natural-mean', why: 'natural 同值但具名规则不同（natural-mean）' },
    { rs: [1, 1, 0], mode: 'flat', verdict: 0.5, rule: 'flat', why: 'v3 字面回退 flat 0.5（纯函数保留；没有设置值会选中）' },
    { rs: [], mode: 'forced', verdict: 0.5, rule: 'flat', why: '空票是诊断值 0.5 —— 结算层永远不允许它走到裁决' },
  ]
  cases.forEach((c) => {
    const got = aggregateVerdict({ results: c.rs, verdictMode: c.mode })
    ok(near(got.verdict, c.verdict) && got.rule === c.rule, c.why, { got: got.verdict, rule: got.rule, want: c.verdict, wantRule: c.rule })
  })
}

console.log('=== 3. 法定人数：内核强制（票箱 close 具名拒）＋ pack 结算层闸门（单票绝不定论） ===')
{
  // ① 内核层：minVotes=3、只 2 票 close ⇒ 具名拒，且 tally 给 floor/floorBase。
  const h = makeKernel({ overrides: { 'vmu.ballot.minVotes': 3 } })
  const box = openVoteBox({ ballotbox: h.kernel.ballotbox, target: 'p-floor', round: 1, at: 2000 })
  ok(box.ok === true && String(box.boxId).startsWith('bx-'), '票箱开得出来（≥2 个选项）', box.boxId)
  ok(h.kernel.ballotbox.open({ question: '只有 1 个选项', options: ['for'] }).ok === false, '（负例防护）票箱 open 需要 ≥2 个选项')
  const c1 = submitVote({ records: h.records, ballotbox: h.kernel.ballotbox, boxId: box.boxId, target: 'p-floor', verifier: 'verifier-1', result: 0.9, reason: 'r1', round: 1, at: 2000 })
  const c2 = submitVote({ records: h.records, ballotbox: h.kernel.ballotbox, boxId: box.boxId, target: 'p-floor', verifier: 'verifier-2', result: 0.9, reason: 'r2', round: 1, at: 2000 })
  ok(c1.ok === true && c2.ok === true && c1.voteRecordId !== c2.voteRecordId, '双写：两票各自 cast 成功并各写一条 votes 记录', { a: c1.voteRecordId, b: c2.voteRecordId })
  ok(readVotes(h.records, 'p-floor', 1).count === 2, 'votes 轨上这一轮恰好 2 票', readVotes(h.records, 'p-floor', 1).count)
  const kernelClose = h.kernel.ballotbox.close({ boxId: box.boxId })
  ok(kernelClose.ok === false && kernelClose.code === 'VMU_BALLOT_MIN_VOTES_NOT_MET',
    '★★ 内核法定人数不足 ⇒ 具名拒 VMU_BALLOT_MIN_VOTES_NOT_MET（不是"未通过"）', kernelClose.code)
  ok(kernelClose.tally && kernelClose.tally.floor === 3 && kernelClose.tally.floorBase === 2,
    '内核回执给出现值/下限（floor=3、floorBase=2），可以据此催票', kernelClose.tally)

  // ② pack 结算层：同样 2 票，required=3 ⇒ 自己的具名"未成立"（且不改任何对象）。
  const r1 = trySettle({ records: h.records, ballotbox: h.kernel.ballotbox, boxId: box.boxId, target: 'p-floor', round: 1, required: 3, verdictMode: 'forced', at: 2000 })
  ok(r1.ok === false && r1.code === 'VMU_BALLOT_MIN_VOTES_NOT_MET' && r1.settled === false && r1.verdict === null,
    '★ 清单断言：法定数不足 ⇒ ok:false ＋ VMU_BALLOT_MIN_VOTES_NOT_MET ＋ 不定论（不是否决）', { code: r1.code, source: r1.source })
  ok(r1.source === 'pack-precheck' && r1.tally && r1.tally.votes === 2 && r1.tally.required === 3,
    '★ 拒绝词点名来源与现值（pack 前置闸门：2 < 3），不是一句笼统失败', r1.tally)

  // ③ 单票：算术会给出 0.9，但结算层绝不接受 1 票 —— 闸门不在算术里，这就是区别。
  const h2 = makeKernel({ overrides: { 'vmu.ballot.minVotes': 3 } })
  const box2 = openVoteBox({ ballotbox: h2.kernel.ballotbox, target: 'p-single', round: 1, at: 2000 })
  submitVote({ records: h2.records, ballotbox: h2.kernel.ballotbox, boxId: box2.boxId, target: 'p-single', verifier: 'verifier-1', result: 0.95, reason: '唯一一票', round: 1, at: 2000 })
  const single = trySettle({ records: h2.records, ballotbox: h2.kernel.ballotbox, boxId: box2.boxId, target: 'p-single', round: 1, required: 3, verdictMode: 'forced', at: 2000 })
  ok(aggregateVerdict({ results: [0.95], verdictMode: 'forced' }).verdict === 0.95,
    '（分层证据）纯算术对 1 票也会算出 0.95 —— 所以"单票不定论"必须由结算层负责', aggregateVerdict({ results: [0.95], verdictMode: 'forced' }).verdict)
  ok(single.ok === false && single.code === 'VMU_BALLOT_MIN_VOTES_NOT_MET', '★★ 单票 ⇒ 结算层具名"未成立"（绝不把 1 票当结论）', single.code)
}

console.log('=== 3b. 清单的三条可写断言原文：票数下限／全票一致／近共识取均值 ===')
{
  const h = makeKernel({ overrides: { 'vmu.ballot.minVotes': 3 } })
  const box = openVoteBox({ ballotbox: h.kernel.ballotbox, target: 'p-assert', round: 1, at: 2000 })
  // 全票一致：三次 for ⇒ 内核 close 的 outcome 就是 'for'
  submitVote({ records: h.records, ballotbox: h.kernel.ballotbox, boxId: box.boxId, target: 'p-assert', verifier: 'verifier-1', result: 1, reason: '', round: 1, at: 2000 })
  submitVote({ records: h.records, ballotbox: h.kernel.ballotbox, boxId: box.boxId, target: 'p-assert', verifier: 'verifier-2', result: 1, reason: '', round: 1, at: 2000 })
  submitVote({ records: h.records, ballotbox: h.kernel.ballotbox, boxId: box.boxId, target: 'p-assert', verifier: 'verifier-3', result: 1, reason: '', round: 1, at: 2000 })
  const closed = h.kernel.ballotbox.close({ boxId: box.boxId })
  ok(closed.ok === true && closed.outcome === 'for', "清单断言「全票一致」：3 票 for ⇒ 内核裁决 outcome === 'for'", closed && closed.outcome)

  // 近共识取均值：votes 轨 0.9,0.9,1.0（同侧且均值 ≥0.85）⇒ 结算层聚合 0.9333
  const h2 = makeKernel({ overrides: { 'vmu.ballot.minVotes': 3 } })
  const box2 = openVoteBox({ ballotbox: h2.kernel.ballotbox, target: 'p-near', round: 1, at: 2000 })
  const rs = [0.9, 0.9, 1.0]
  rs.forEach((r, i) => { submitVote({ records: h2.records, ballotbox: h2.kernel.ballotbox, boxId: box2.boxId, target: 'p-near', verifier: 'verifier-' + String(i + 1), result: r, reason: '', round: 1, at: 2000 }) })
  const agg = trySettle({ records: h2.records, ballotbox: h2.kernel.ballotbox, boxId: box2.boxId, target: 'p-near', round: 1, required: 3, verdictMode: 'forced', at: 2000 })
  ok(agg.ok === true && Math.abs(agg.pendingVerdict - 0.9333) < 1e-3 && agg.rule === 'near-consensus-mean',
    '★ 清单断言「近共识取均值」：Math.abs(agg - 0.9333) < 1e-3（同侧且均值 ≥0.85 取均值）', { agg: agg.pendingVerdict, rule: agg.rule })

  // forced 夹端点：forced 下非全 1 的高均值 = 0.99、低均值 = 0.01（两端都钉，不是"在区间内"）
  const hi = aggregateVerdict({ results: [1, 1, 0.998], verdictMode: 'forced' })
  const lo = aggregateVerdict({ results: [0, 0, 0.002], verdictMode: 'forced' })
  ok(hi.verdict === FORCED_MAX && lo.verdict === FORCED_MIN && hi.verdict >= 0.01 && hi.verdict <= 0.99 && lo.verdict >= 0.01 && lo.verdict <= 0.99,
    '★ 清单断言「forced 夹端点」：上端恰好 0.99、下端恰好 0.01（两端都断具体值）', { hi: hi.verdict, lo: lo.verdict })
}

console.log('=== 4. 单票/未凑齐端到端：不裁决、不改卡、不写 verified、不写否决（只写"未成立"审计） ===')
{
  const h = boot({ overrides: { 'vmu.v3.debateMaxRounds': 1 }, replier: voteReplier((round, i) => (i <= 2 ? 0.9 : null)) })
  const applied = await h.loader.apply(PACK)
  ok(applied && applied.ok === true, 'v3 包装载干净（五个 module 经 loader 顺利装载）', applied && applied.applied)
  propCard(h.kernel, 'p-under')
  const before = findProp(h.records, 'p-under')
  const receipt = await tick(h, 3000)
  const after = findProp(h.records, 'p-under')
  ok(receipt && receipt.ok === true, 'tick 本身成功（票不够不是 tick 的错误）', receipt && receipt.ok)
  ok(before.body === after.body, '★ 未凑齐 ⇒ 对象卡正文逐字节不变（不是"先把概率写成 0.9"）', after.body.split('\n').filter((l) => /概率|状态/.test(l)))
  ok(after.card.状态 === '未定论' && after.card.概率 === 0.5, '★ 状态仍是"未定论"、概率仍是 0.5（不足法定人数 ⇒ 未成立，不是否决）', { 状态: after.card.状态, 概率: after.card.概率 })
  ok(h.records.list({ track: 'verified', limit: 0 }).items.length === 0, 'verified 轨 0 条（没有定论就没有 Verified 卡）', h.records.list({ track: 'verified', limit: 0 }).items.length)
  const titles = journalTitles(h.records)
  const undecidedTitles = titles.filter((t) => String(t).startsWith('v3 验证未成立'))
  const verdictTitles = titles.filter((t) => String(t).startsWith('v3 裁决'))
  ok(undecidedTitles.length === 1 && verdictTitles.length === 0,
    '★ journal 里只有"未成立"审计、没有裁决记录（不是静默，也不是否决）', { undecided: undecidedTitles, verdict: verdictTitles })
  ok(v3VerifyStatus().undecided === 1 && v3VerifyStatus().verdicts === 0, '自报计数：undecided=1、verdicts=0', { u: v3VerifyStatus().undecided, v: v3VerifyStatus().verdicts })
  ok(readVotes(h.records, 'p-under', 1).count === 2, '票是真的收了 2 张（差一张，不是"没收到票"）', readVotes(h.records, 'p-under', 1).count)
}

console.log('=== 5. 全票一致 ⇒ 1：三处同时存在（命题卡 ＋ verified 轨 ＋ journal 裁决） ===')
{
  const h = boot({ replier: voteReplier(() => 1) })
  await h.loader.apply(PACK)
  propCard(h.kernel, 'p-1')
  await tick(h, 4000)
  const prop = findProp(h.records, 'p-1')
  ok(prop.body.includes('- 状态: 已验证·真'), '★ 清单断言「回写生效」：get(p-1).body 含 - 状态: 已验证·真', prop.body.split('\n').filter((l) => /概率|状态/.test(l)))
  ok(prop.card.概率 === 1, '命题卡概率 = 1', prop.card.概率)
  ok(prop.body.includes('### 证明 1｜验证证明｜概率1｜状态已验'), '命题卡里追加了 prob=1 的"验证证明"条目（Verified 可信内容的来源）', prop.body.split('\n').filter((l) => l.startsWith('### 证明')))
  const vlist = h.records.list({ track: 'verified', limit: 0 }).items
  ok(vlist.length === 1, '★ verified 轨恰好 1 条', vlist.length)
  const vbody = h.records.get({ id: vlist[0].id }).body
  ok(vbody.includes('- 概率: 1') && vbody.includes('- 结论: 真') && vbody.includes('【证明 #1】理由 1 / r1'),
    '★ Verified 卡是定论形状（概率 1/结论真/可信内容带 prob=1 全文，全文就是最强理由）—— 且它是经 promoteVerified 写的', vbody.split('\n').slice(0, 8))
  const titles = journalTitles(h.records)
  const verdicts = titles.filter((t) => String(t).startsWith('v3 裁决'))
  ok(verdicts.length === 1, '★ journal 轨恰好 1 条裁决记录', titles)
  const jrec = h.records.list({ track: 'journal', limit: 0 }).items.find((x) => String(h.records.get({ id: x.id }).title).startsWith('v3 裁决'))
  const jbody = h.records.get({ id: jrec.id }).body
  ok(jbody.includes('- target: p-1') && jbody.includes('- verdict: 1') && jbody.includes('- rule: unanimous-1') && jbody.includes('- votes: 3'),
    '裁决记录点名 target/verdict/rule/votes（可审计，不是一行"ok"）', jbody.split('\n').slice(0, 7))
  ok(h.records.list({ track: 'votes', limit: 0 }).items.length === 3 && readVotes(h.records, 'p-1', 1).count === 3,
    'votes 轨 3 条（双写完整）', h.records.list({ track: 'votes', limit: 0 }).items.length)
  ok(v3VerifyStatus().verdicts === 1 && v3VerifyStatus().votesCast === 3 && v3VerifyStatus().ballotsOpened === 1,
    '自报：verdicts=1、votesCast=3、ballotsOpened=1（一票不差）', { v: v3VerifyStatus().verdicts, c: v3VerifyStatus().votesCast })
  ok(v3VerifyStatus().lastReceipt && v3VerifyStatus().lastReceipt.verifiedWritten === true, '回执里点名 verified 真的写了（不是"大概写了"）', v3VerifyStatus().lastReceipt && v3VerifyStatus().lastReceipt.verifiedWritten)
}

console.log('=== 6. 全票一致 ⇒ 0：命题"已验证·假"＋ Verified 卡结论"假"/概率 0 ===')
{
  const h = boot({ replier: voteReplier(() => 0) })
  await h.loader.apply(PACK)
  propCard(h.kernel, 'p-0')
  await tick(h, 5000)
  const prop = findProp(h.records, 'p-0')
  ok(prop.body.includes('- 状态: 已验证·假') && prop.card.概率 === 0, '★ 全 0 ⇒ 状态 已验证·假、概率 0', { 状态: prop.card.状态, 概率: prop.card.概率 })
  ok(prop.body.includes('### 证伪 1｜验证证伪｜概率1｜状态已验'), '命题卡追加 prob=1 的"验证证伪"条目', prop.body.split('\n').filter((l) => l.startsWith('### 证伪')))
  const vlist = h.records.list({ track: 'verified', limit: 0 }).items
  const vbody = vlist.length === 1 ? h.records.get({ id: vlist[0].id }).body : ''
  ok(vlist.length === 1 && vbody.includes('- 结论: 假') && vbody.includes('- 概率: 0'),
    '★ verified 轨 1 条且结论=假/概率=0（verified 只收 1/0）', vbody.split('\n').slice(0, 6))
  const verdicts = journalTitles(h.records).filter((t) => String(t).startsWith('v3 裁决'))
  ok(verdicts.length === 1, 'journal 有裁决记录', verdicts)
}

console.log('=== 7. 3 票但 2 同意 ⇒ 2/3（未定论；不写 verified；轮次用尽具名收口） ===')
{
  const h = boot({ overrides: { 'vmu.v3.debateMaxRounds': 1 }, replier: voteReplier((round, i) => (i <= 2 ? 1 : 0)) })
  await h.loader.apply(PACK)
  propCard(h.kernel, 'p-split')
  await tick(h, 6000)
  const prop = findProp(h.records, 'p-split')
  ok(Math.abs(prop.card.概率 - 2 / 3) < 1e-12, '★★ 3 票 2 同意 ⇒ 概率 = 2/3（不是 1 —— 这一条抓"多数票=真"的实现）', prop.card.概率)
  ok(prop.card.状态 === '未定论', '★ 2/3 不是定论 ⇒ 状态"未定论"', prop.card.状态)
  ok(h.records.list({ track: 'verified', limit: 0 }).items.length === 0, '★ 未定论 ⇒ verified 轨 0 条（只收 1/0）', h.records.list({ track: 'verified', limit: 0 }).items.length)
  const jrec = h.records.list({ track: 'journal', limit: 0 }).items.find((x) => String(h.records.get({ id: x.id }).title).startsWith('v3 裁决'))
  const jbody = jrec ? h.records.get({ id: jrec.id }).body : ''
  ok(jbody.includes('- rule: forced-mean') && jbody.includes('- maxRoundsReached: true'),
    '★ 裁决记录点名 forced-mean 与 maxRoundsReached: true（轮次用尽、具名收口）', jbody.split('\n').filter((l) => /rule|maxRounds/.test(l)))
  ok(v3VerifyStatus().maxRoundsStops === 1, '自报 maxRoundsStops=1（"用完轮次"可观测，不是形容词）', v3VerifyStatus().maxRoundsStops)
  const delivered = h.delivered.filter((d) => /^verifier-\d+$/.test(String(d.member)))
  ok(delivered.length === 3, '辩论上限 1 轮时只派 3 个验证者回合（没有第 2 轮）', delivered.length)
}

console.log('=== 8. 辩论：第 1 轮分歧 ⇒ 第 2 轮一致 ⇒ 第 2 轮裁决（票继续双写、每轮新票箱） ===')
{
  const h = boot({ overrides: { 'vmu.v3.debateMaxRounds': 2 }, replier: voteReplier((round, i) => (round === 1 ? (i <= 2 ? 1 : 0) : 1)) })
  await h.loader.apply(PACK)
  propCard(h.kernel, 'p-debate')
  const receipt = await tick(h, 7000)
  const allReceipts = Array.isArray(receipt.receipts) ? receipt.receipts : [receipt]
  const verifyDecisions = allReceipts.flatMap((r) => (Array.isArray(r.decisions) ? r.decisions : [])).filter((d) => /^v3-verify/.test(String(d.id)))
  const prop = findProp(h.records, 'p-debate')
  ok(prop.card.概率 === 1 && prop.card.状态 === '已验证·真', '★ 第 2 轮全 1 ⇒ 最终裁决 1（辩论真的改变了结果）', { 概率: prop.card.概率, 状态: prop.card.状态 })
  ok(readVotes(h.records, 'p-debate', 1).count === 3 && readVotes(h.records, 'p-debate', 2).count === 3 && readVotes(h.records, 'p-debate', 3).count === 0,
    '★ 两轮各 3 票、第 3 轮 0 票（每轮双写、没有多跑）', { r1: readVotes(h.records, 'p-debate', 1).count, r2: readVotes(h.records, 'p-debate', 2).count, r3: readVotes(h.records, 'p-debate', 3).count })
  const debateTitles = journalTitles(h.records).filter((t) => String(t).startsWith('v3 验证辩论'))
  ok(debateTitles.length === 1 && String(debateTitles[0]).includes('第 1 轮'), '★ journal 里有第 1 轮辩论记录（辩论是可审计的，不是内部状态）', debateTitles)
  const verdict = journalTitles(h.records).filter((t) => String(t).startsWith('v3 裁决'))
  ok(verdict.length === 1, 'journal 里恰好 1 条最终裁决', verdict)
  const delivered = h.delivered.filter((d) => /^verifier-\d+$/.test(String(d.member)))
  ok(delivered.length === 6, '派发的验证者回合 = 3 票 × 2 轮 = 6（正好，不是"一直重试"）', delivered.length)
  const last = v3VerifyStatus().lastReceipt
  ok(last && last.settled === true && last.rounds === 2 && last.rule === 'unanimous-1',
    '回执：settled、rounds=2、rule=unanimous-1', last && { settled: last.settled, rounds: last.rounds, rule: last.rule })
  const settledDecisions = verifyDecisions.filter((d) => d.decision && d.decision.settled === 1)
  ok(settledDecisions.length === 1, '★ 结算回执出现在【后续 tick】（两阶段：派发轮不报 settled）', settledDecisions.length)
  const firstVerify = verifyDecisions[0]
  ok(firstVerify && firstVerify.decision && firstVerify.decision.settled !== 1, '★ 第一次 tick 的 v3-verify 回执没有 settled=1（它只派发）', firstVerify && firstVerify.decision)
}

console.log('=== 9. 辩论轮次上限：每轮都分歧 ⇒ 用完即具名收口（不无限） ===')
{
  const h = boot({ overrides: { 'vmu.v3.debateMaxRounds': 2 }, replier: voteReplier((round, i) => (i <= 2 ? 1 : 0)) })
  await h.loader.apply(PACK)
  propCard(h.kernel, 'p-cap')
  await tick(h, 8000)
  const prop = findProp(h.records, 'p-cap')
  ok(Math.abs(prop.card.概率 - 2 / 3) < 1e-12 && prop.card.状态 === '未定论',
    '★ 轮次用尽 ⇒ 按 forced 均值 2/3 收口（不无限辩论，也不假装定论）', { 概率: prop.card.概率, 状态: prop.card.状态 })
  ok(readVotes(h.records, 'p-cap', 1).count === 3 && readVotes(h.records, 'p-cap', 2).count === 3 && readVotes(h.records, 'p-cap', 3).count === 0,
    '恰两轮票（3+3），没有第 3 轮', { r1: readVotes(h.records, 'p-cap', 1).count, r2: readVotes(h.records, 'p-cap', 2).count })
  const debates = journalTitles(h.records).filter((t) => String(t).startsWith('v3 验证辩论'))
  ok(debates.length === 1, '只记了第 1 轮辩论（第 2 轮是最后一轮，直接收口 ⇒ 不再记"下一轮"）', debates)
  const jrec = h.records.list({ track: 'journal', limit: 0 }).items.find((x) => String(h.records.get({ id: x.id }).title).startsWith('v3 裁决'))
  const jbody = jrec ? h.records.get({ id: jrec.id }).body : ''
  ok(jbody.includes('- round: 2') && jbody.includes('- maxRoundsReached: true') && jbody.includes('- rule: forced-mean'),
    '最终裁决记录点名 round=2 / maxRoundsReached / rule（轮次上限是可见事实）', jbody.split('\n').filter((l) => /round|maxRounds|rule/.test(l)))
  ok(v3VerifyStatus().maxRoundsStops === 1 && v3VerifyStatus().debates === 1, '自报：maxRoundsStops=1、debates=1', { stops: v3VerifyStatus().maxRoundsStops, debates: v3VerifyStatus().debates })
  const delivered = h.delivered.filter((d) => /^verifier-\d+$/.test(String(d.member)))
  ok(delivered.length === 6, '派发回合数 = 6（required×maxRounds，一轮都不多）', delivered.length)
}

console.log('=== 10. 载体：progress.votes / vote: tag / 顶层都认；缺字段具名；改写必须是 JSON 对象文本 ===')
{
  const byFields = votesFromReply({ progress: { votes: [{ target: 'p-1', result: 0.9, reason: 'r', round: 1 }] } })
  ok(byFields.votes.length === 1 && byFields.votes[0].result === 0.9 && byFields.votes[0].carrier === 'fields',
    '★ 同名字段 progress.votes 被接受（真实回合的契约）', byFields.votes)
  const byVote = votesFromReply({ progress: { vote: { target: 'p-1', result: 0.3, reason: 'r' } } })
  ok(byVote.votes.length === 1 && byVote.votes[0].result === 0.3, 'progress.vote 单票形状也被接受', byVote.votes)
  const nastyReason = '理由里有｜竖线\n和换行'
  const tag = VOTE_TAG_PREFIX + 'p-1｜0.9｜' + escField(nastyReason) + '｜1'
  const byTag = votesFromReply({ progress: { tags: [tag] } })
  ok(byTag.votes.length === 1 && byTag.votes[0].carrier === 'tags' && byTag.votes[0].reason === nastyReason,
    '★ vote: tag 被接受，且含 `｜`/换行的理由**逐字还原**（不靠"解析出 4 段"糊过去）', byTag.votes[0] && byTag.votes[0].reason)
  const topLevel = votesFromReply({ votes: [{ target: 'p-1', result: 0.7 }] })
  ok(topLevel.votes.length === 1, '顶层 votes 也被接受（纯 API/测试；真实回合会被字段门拒，见文件头）', topLevel.votes.length)
  const malformed = votesFromReply({ progress: { votes: [{ target: 'p-1', reason: '没有 result' }, { result: 0.5 }] } })
  ok(malformed.votes.length === 1 && malformed.malformedCount === 1 && malformed.malformed[0].why === 'result-not-numeric',
    '★ 缺 result 的票进 malformed（不静默丢）；另一条合法票照常被接受', { malformed: malformed.malformed, good: malformed.votes.length })

  const h = boot({ replier: (() => ACK) })
  await h.loader.apply(PACK)
  const busy = await h.kernel.bus.emit('turn/reply-parsed', { turn: 't-s', member: 'solver', reply: { prioritize: 'ack' } }, { member: 'solver' })
  ok(h.kernel.bus.rewriteOf('turn/reply-parsed', busy) === null, '非验证者回执不被改写（不抢 solver 的字段）', {})
  const noVotes = await h.kernel.bus.emit('turn/reply-parsed', { turn: 't-v', member: 'verifier-1', role: 'verifier', reply: { prioritize: 'ack' } }, { member: 'verifier-1' })
  ok(h.kernel.bus.rewriteOf('turn/reply-parsed', noVotes) === null, '验证者回执里没有票 ⇒ 不改写（没有可消费的东西）', {})
  // 有票但没有本轮票箱 ⇒ 不写 votes 轨（双写必须两半同时成立），写一条具名 journal。
  const before = h.records.list({ track: VOTES_TRACK, limit: 0 }).items.length
  const orphan = await h.kernel.bus.emit('turn/reply-parsed', {
    turn: 't-o', member: 'verifier-1', role: 'verifier',
    reply: { progress: { votes: [{ target: 'p-orphan', result: 0.9, reason: 'r' }] } },
  }, { member: 'verifier-1' })
  ok(h.kernel.bus.rewriteOf('turn/reply-parsed', orphan) === null, '没有本轮票箱 ⇒ 不改写（不制造只有一半的票）', {})
  ok(h.records.list({ track: VOTES_TRACK, limit: 0 }).items.length === before, '没有票箱时不写 votes 轨（双写两半同时成立才落）', { before, after: h.records.list({ track: VOTES_TRACK, limit: 0 }).items.length })
  const orphanTitles = journalTitles(h.records).filter((t) => String(t).startsWith('v3 投票没有对应票箱'))
  ok(orphanTitles.length === 1, '★ 但票没被静默丢：journal 里有一条具名"没有对应票箱"', orphanTitles)
}

console.log('=== 11b. P0-8 人工门（verdict）：manual 下裁决排审、三处都不写；approve 才结算 ===')
{
  const h = boot({ overrides: { 'vmu.v3.mode': 'manual', 'vmu.v3.debateMaxRounds': 1 }, replier: voteReplier(() => 1) })
  await h.loader.apply(PACK)
  propCard(h.kernel, 'p-1')
  const before = findProp(h.records, 'p-1')
  await tick(h, 4000)
  const held = findProp(h.records, 'p-1')
  ok(held.body === before.body && held.card.状态 === '未定论' && held.card.概率 === 0.5,
    '★★ manual：命题卡**逐字节不变**、状态仍"未定论"、概率仍 0.5（裁决没回写）', { 状态: held.card.状态, 概率: held.card.概率 })
  const verifiedBefore = h.records.list({ track: 'verified', limit: 0 }).items.length
  ok(verifiedBefore === 0, '★★ manual：verified 轨 0 条（没结算就没有 Verified 卡）', verifiedBefore)
  const verdictTitles = journalTitles(h.records).filter((t) => String(t).startsWith('v3 裁决｜'))
  const waitingTitles = journalTitles(h.records).filter((t) => String(t).startsWith('v3 裁决待审'))
  ok(verdictTitles.length === 0 && waitingTitles.length === 1,
    '★ journal：只有"裁决待审"审计、没有裁决记录（不是静默不写）', { verdict: verdictTitles, waiting: waitingTitles })
  const gatesNow = listGates({ records: h.records })
  ok(gatesNow.counts.pending === 1 && gatesNow.pending[0].kind === 'verdict' && gatesNow.pending[0].subject === 'p-1',
    '★ 台账里恰好 1 扇 pending 的 verdict 门，subject 是命题卡 id', gatesNow.pending.map((g) => g.kind + ':' + g.subject))
  const gateId = gatesNow.pending[0].gateId
  // 第二个 tick：门仍 pending ⇒ 不再开第二扇（不刷台账）。
  await tick(h, 5000)
  const gatesAgain = listGates({ records: h.records })
  ok(gatesAgain.counts.total === 1 && gatesAgain.counts.pending === 1, '★ 第二次 tick 不重复开门（台账仍 1 条）', gatesAgain.counts)
  // approve：执行器真的结算（卡＋verified＋裁决 journal 三处同时出现）。
  const approved = await approveGate({ records: h.records, gateId, by: 'human', at: 6000 })
  ok(approved.ok === true && approved.executed === true && approved.gate.status === 'released',
    '★ approve 后裁决执行器真的跑了（executed:true、released）', approved.gate && approved.gate.status)
  const settledProp = findProp(h.records, 'p-1')
  ok(settledProp.card.状态 === '已验证·真' && settledProp.card.概率 === 1,
    '★★ 放行后命题卡被回写（已验证·真 / 概率 1）', { 状态: settledProp.card.状态, 概率: settledProp.card.概率 })
  ok(h.records.list({ track: 'verified', limit: 0 }).items.length === 1, '★★ 放行后 verified 轨出现 1 张定论卡', h.records.list({ track: 'verified', limit: 0 }).items.length)
  ok(journalTitles(h.records).filter((t) => String(t).startsWith('v3 裁决｜')).length === 1, '★★ 放行后 journal 出现 1 条裁决记录', journalTitles(h.records))
  ok(v3GatesStatus().counts.released >= 1 && v3GatesStatus().counts.failed === 0,
    '★ gates 自报 released≥1、failed=0（放行不是"看起来成功"）', v3GatesStatus().counts)
}

console.log('=== 11c. P0-8 人工门（verdict）：auto 零延迟直通；reject ⇒ 不定论且同轮不再刷门 ===')
{
  // auto：裁决直接结算，门台账 0 条（零延迟）。
  const hAuto = boot({ replier: voteReplier(() => 1) })
  await hAuto.loader.apply(PACK)
  propCard(hAuto.kernel, 'p-auto')
  await tick(hAuto, 4000)
  ok(findProp(hAuto.records, 'p-auto').card.状态 === '已验证·真', '★ auto：裁决零延迟直通（直接 已验证·真）', findProp(hAuto.records, 'p-auto').card.状态)
  const autoGates = listGates({ records: hAuto.records })
  ok(autoGates.counts.total === 0, '★ auto：台账 0 条（不写门记录）', autoGates.counts)

  // reject：human 拒绝 ⇒ 候选仍"未定论"、不写 verified；同一轮**不重复开门**。
  const h = boot({ overrides: { 'vmu.v3.mode': 'manual', 'vmu.v3.debateMaxRounds': 1 }, replier: voteReplier(() => 1) })
  await h.loader.apply(PACK)
  propCard(h.kernel, 'p-rej')
  await tick(h, 4000)
  const gateId = listGates({ records: h.records }).pending[0].gateId
  const rejected = rejectGate({ records: h.records, gateId, by: 'human', at: 5000, reason: 'not convincing' })
  ok(rejected.ok === true && rejected.gate.status === 'rejected' && rejected.executed === false,
    '★ reject：门落终态 rejected 且**没有执行**（executed:false）', rejected.gate && rejected.gate.status)
  await tick(h, 6000)
  const afterReject = listGates({ records: h.records })
  ok(afterReject.counts.pending === 0, '★★ 被拒后同一轮**不再自动开新门**（pending 0，不刷台账）', afterReject.counts)
  ok(findProp(h.records, 'p-rej').card.状态 === '未定论', '★ 被拒 ⇒ 命题仍"未定论"（人工拒绝不等于否决事实）', findProp(h.records, 'p-rej').card.状态)
  ok(h.records.list({ track: 'verified', limit: 0 }).items.length === 0, '★ 被拒 ⇒ verified 轨仍 0 条', h.records.list({ track: 'verified', limit: 0 }).items.length)
}

console.log('=== 12. 装配路径：真实入口 packs:["v3"] 上 v3-verify 挂上总线；votes 轨在值层 ===')
{
  const entry = await import(pathToFileURL(ENTRY).href)
  const ctx = { effect(fn) { return fn() }, on() { return () => {} }, tools: { register: async () => () => {} } }
  const handle = entry.apply(ctx, { clock: () => 1000, packs: ['v3'] })
  await handle.ready()
  ok(handle.packErrors().length === 0, '真实入口装载 packs=[v3] 无错', handle.packErrors())
  const busIds = handle.kernel.bus.entries().map((e) => String(e.id))
  ok(busIds.some((id) => id.startsWith('v3-verify') && id.includes(V3_TICK_TOPIC)), 'verify 的 tick 钩子挂上了总线', busIds.filter((id) => id.startsWith('v3-verify')))
  ok(busIds.some((id) => id.startsWith('v3-verify') && id.includes('turn/reply-parsed')), 'verify 的 reply-parsed 钩子挂上了总线', busIds.filter((id) => id.startsWith('v3-verify')))
  ok(handle.kernel.records.status().caps.tracks.includes(VOTES_TRACK), '★ votes 轨是内核构造期就声明的（值层 tracks）', handle.kernel.records.status().caps.tracks)
  ok(handle.kernel.records.status().caps.allowedKinds.includes(VOTE_KIND), '★ vote 是允许的 kind', {})
  for (const cleanup of handle.cleanups || []) { try { cleanup() } catch (e) { /* unwind is the host's job */ } }
}

console.log('')
console.log('=== V3 VERIFY (P0-7): ' + passed + ' passed, ' + failed + ' failed ===')
if (failures.length > 0) for (const f of failures) console.error('  - ' + f)
process.exit(failed === 0 ? 0 : 1)

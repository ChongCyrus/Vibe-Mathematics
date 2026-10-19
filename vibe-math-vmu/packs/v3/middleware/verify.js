/**
 * packs/v3/middleware/verify.js — PHASE 6 / **P0-7（验证闭环：≥2 票／辩论／裁决／回写）**。
 *
 * v3 的验证闭环（`vibe-math-v3.js:4149-4368`）落成一个 M2 模块。**分层是刻意的**：
 *
 *   · **法定人数由内核强制**：每张票**双写**到 `vmu.ballotbox`（`open`/`cast`/`close`）——凑不齐时内核
 *     以 `VMU_BALLOT_MIN_VOTES_NOT_MET` **具名拒**，且明说"不是未通过，是未成立"（`kernel/ballotbox.js:328-336`）。
 *   · **概率语义由 pack 持有**：ballotbox 只收**选项票**（for/against），连续 `Result∈[0,1]` 落在 `votes` 轨，
 *     聚合（全 1→1／全 0→0／同侧均值≥0.85 取均值／forced 等权均值夹 [0.01,0.99]／flat 0.5）由本模块的纯函数算
 *     —— 与 v3 `finalVerdict`（`:4244-4268`）逐条同形。
 *
 * ★ **单票绝不定论**：闸门不在算术里，而在 `trySettle()` —— 它要求 `votes 轨` 上本轮票数 ≥
 *   `max(2, vmu.v3.verifierCount)`（v3 `voteCount` 的 `Math.max(2, expectedCount)`），否则**具名拒**
 *   （`{ok:false, code:'VMU_BALLOT_MIN_VOTES_NOT_MET', settled:false}`）而**不是**否决策：
 *   对象卡一个字段都不改、verified 轨与裁决 journal 都不写，只写一条"本轮未成立"的审计 journal。
 *
 * ★ **辩论最多 `vmu.v3.debateMaxRounds` 轮**（v3 `advanceVerification` `:4199-4229`）：只要不是**全票一致**
 *   （全 1 或全 0 才是 v3 的 `consensus`）就进入下一轮，每轮**新开一个票箱**（内核票箱一人一票，跨轮必须新箱）、
 *   每轮都双写、把该轮摘要写进 `journal`。**用完轮次就具名收口**：按 `forced`/`natural` 给出最终概率并记
 *   `maxRoundsReached: true` —— 不会无限辩论，也不会"没跑完就假装定论"。
 *
 * ★ **三处同时落盘**（v3 `settleVerdict` `:4269-4368` 的四类回写里本卡覆盖命题这一类）：
 *   ① 命题卡的 `- 概率:`/`- 状态:` 被改写；② `verified` 轨新增定论卡（**只经 `dataplane.promoteVerified`**
 *   —— 它只收定论、内容不变不重写，不自己往 verified 轨 put）；③ `journal` 轨新增裁决记录。
 *
 * ★★ **回执载体**（已实测的硬约束）：内核回合字段门在中间件之前就拒未知顶层字段 ⇒ 验证者的票**不能**做顶层
 *   字段。本包契约：票放在**已登记字段 `progress`** 的载荷里 ——
 *   `{"progress":{"votes":[{"target":"p-1","result":0.9,"reason":"…","round":1}]}}`（同名字段），
 *   另**宽容接受** `progress.tags` 里的 `vote:<target>｜<result>｜<reason>｜<round>` 与顶层 `votes`（纯 API/测试）。
 *   消费完返回 `{rewriteResult: '{}'}`（**JSON 对象文本**；框架会把它解码成 reply 对象，非对象 ⇒ 具名
 *   `VMU_TURN_BAD_JSON`）。缺字段的票**不静默丢**：写一条具名 journal 并计入 `state.malformed`。
 *
 * ★ 派发只从 `v3/tick` 做（tick 不是 turn ⇒ 不撞 `VMU_TURN_REENTRANT`）；`turn/reply-parsed` 只消费/落盘/改写。
 *
 * ★ 时间只来自注入时钟（tick 的 `at`；回合钩子用"本 tick 的 at"）；没有值就写 `unknown`，绝不编一个 `Date.now()`。
 *
 * ★ 本模块【不新增拒码】：复用已登记的内核码（`VMU_BALLOT_MIN_VOTES_NOT_MET`／`VMU_INVALID_ARGUMENT`／
 *   `VMU_STATE`／`VMU_ENGINE_UNAVAILABLE`），理由同 dataplane 文件头（码表是单一登记源，`docs/**` 不在写域）。
 */
import { V3_TICK_TOPIC } from './tick.js'
import {
  parseCard, parseAnchors, composeCard, supersedeBody, writeBody,
  promoteVerified,
} from './dataplane.js'
// P1-8：Lean 三档的裁定门。**同一套语义函数**在 ballot/tally 钩子与这里各调用一次：
//   · 钩子给总线消费者一个具名 deny（该钩子是 blockable 的）；
//   · 真正的“不结算”必须在这里 —— 实测 `ballot.close()` 只读 `dec.decisions[].decision.tally`，
//     **不检查 `emit` 的 `refused`**，所以只挂钩子不会阻止裁决落库。留档（对象已在轨上）是自然的：
//     这里返回 settled:false，不调 settleProposition。
import { leanModeOf, leanEvidence, leanGateDecision } from './lean-gate.js'
import { proofVerdict } from './defects.js'
// P0-8：裁决前的人工门由 gates.js 判定/记账；verify 只调它，并在放行时由注册的执行器真正结算。
import { evaluateGate, registerGateExecutor, listGates } from './gates.js'

/** 轨/kind（`vmu.records.tracks` 与 `allowedKinds` 在 packs/v3/settings/defaults.json 的值层里声明）。 */
export const VOTES_TRACK = 'votes'
export const VOTE_KIND = 'vote'
/** 唯一能写 verified 轨的函数在这个模块之外（dataplane），这里只 import —— 见文件头 ③。 */
export const VOTE_TAG_PREFIX = 'vote:'
/** v3 `:4255`：近共识阈值（同侧均值 ≥0.85 或 ≤0.15 取均值）。 */
export const NEAR_CONSENSUS_THRESHOLD = 0.85
/** v3 `:4255`/`:4265`：forced 与近共识都夹到 [0.01, 0.99]。 */
export const FORCED_MIN = 0.01
export const FORCED_MAX = 0.99
/** v3 `:4151`：`expectedCount = Math.max(2, verifierCount)` —— **verifierCount=1 不是"允许单票"**。 */
export const MIN_VERIFIERS = 2
/** 本模块产出的裁决规则名（回执/审计里逐条点名，不写一个笼统的 "ok"）。 */
export const VERDICT_RULES = Object.freeze(['unanimous-1', 'unanimous-0', 'near-consensus-mean', 'forced-mean', 'natural-mean', 'flat'])
/** 设置的取值域由 `settings/schema.js` 声明为 forced｜natural；`flat` 只是**纯函数**里保留的 v3 字面回退
 *  （v3 `:4267` 的 `return 0.5`），没有设置值会选中它 —— 见 `aggregateVerdict` 的说明。 */
const VERDICT_MODES = Object.freeze(['forced', 'natural'])
const AGGREGATE_MODES = Object.freeze(['forced', 'natural', 'flat'])

const str = (v) => (v === undefined || v === null ? '' : String(v))
const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)
const clamp01 = (v) => { const n = Number(v); return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0.5 }
const clampForced = (v) => Math.max(FORCED_MIN, Math.min(FORCED_MAX, v))
const timeText = (at) => (Number.isFinite(at) ? new Date(at).toISOString() : 'unknown')

/** 具名拒绝：与 kernel/ballotbox.js 的返回形状一致（`{ok:false, code, message, hint}`，不抛）。 */
function refusal(code, message, hint, extra = {}) {
  return Object.assign({ ok: false, code, message, hint }, extra)
}

function requireRecords(records, who) {
  if (!records || typeof records.put !== 'function') {
    throw refusal('VMU_INVALID_ARGUMENT', who + ' needs a vmu.records handle', 'pass { records: kernel.records }')
  }
  return records
}

// ── 纯聚合（v3 finalVerdict `:4244-4268` 的同形实现） ─────────────────────────────────────────────────
/**
 * 连续概率票 → 裁决。**只做算术，不做法定人数判定**（后者在 `trySettle`；分层写在文件头）。
 * 规则顺序与 v3 完全一致：
 *   ① 空票 → 0.5（`flat`；本模块的结算层不允许空票走到这里）；
 *   ② 全 1 → 1（`unanimous-1`）；③ 全 0 → 0（`unanimous-0`）；
 *   ④ 全部同侧（全 ≥0.5 或全 ≤0.5）且均值 ≥0.85（或 ≤0.15）→ 均值（`near-consensus-mean`）；
 *   ⑤ 非一致、非同侧：`forced` ⇒ 等权均值**夹 [0.01,0.99]**（`forced-mean`，v3 默认）；
 *      `natural` ⇒ 等权均值**原值**（`natural-mean`，即 schema 对 `vmu.v3.verdictMode=natural` 的"原值"）；
 *      `flat` ⇒ 0.5（`flat`，v3 `:4267` 的字面回退；**没有设置值会选中它**，只为与 v3 对照/测试保留）。
 * 夹取只发生在 `forced`（schema 文档："forced＝夹到 [0.01,0.99]；natural＝原值"）。
 * 返回 `{verdict, rule, mean, results}` —— `rule` 是具名的，回执与 journal 都写它。
 */
export function aggregateVerdict({ results = [], verdictMode = 'forced' } = {}) {
  const rs = (Array.isArray(results) ? results : []).map(Number).filter((n) => Number.isFinite(n)).map(clamp01)
  const mode = AGGREGATE_MODES.includes(String(verdictMode)) ? String(verdictMode) : 'forced'
  if (rs.length === 0) return { ok: true, verdict: 0.5, rule: 'flat', mean: null, results: rs, mode, note: 'no votes: the settlement layer refuses empty rounds, so this reading is diagnostic only' }
  let sum = 0
  for (const r of rs) sum += r
  const mean = sum / rs.length
  if (rs.every((r) => r === 1)) return { ok: true, verdict: 1, rule: 'unanimous-1', mean, results: rs, mode }
  if (rs.every((r) => r === 0)) return { ok: true, verdict: 0, rule: 'unanimous-0', mean, results: rs, mode }
  const allHigh = rs.every((r) => r >= 0.5)
  const allLow = rs.every((r) => r <= 0.5)
  if ((allHigh || allLow) && (mean >= NEAR_CONSENSUS_THRESHOLD || mean <= (1 - NEAR_CONSENSUS_THRESHOLD))) {
    return { ok: true, verdict: mode === 'forced' ? clampForced(mean) : mean, rule: 'near-consensus-mean', mean, results: rs, mode }
  }
  if (mode === 'forced') return { ok: true, verdict: clampForced(mean), rule: 'forced-mean', mean, results: rs, mode }
  if (mode === 'natural') return { ok: true, verdict: mean, rule: 'natural-mean', mean, results: rs, mode }
  return { ok: true, verdict: 0.5, rule: 'flat', mean, results: rs, mode }
}

/** 本轮需要几票：`max(2, verifierCount)`（v3 `:4151`）。`verifierCount=1` ⇒ 2，不是单票。 */
export function requiredVerifiers(verifierCount) {
  const n = Number(verifierCount)
  const wanted = Number.isFinite(n) && n > 0 ? Math.floor(n) : 3
  return Math.max(MIN_VERIFIERS, wanted)
}

/** 验证者成员 id（`verifier-1`…；用不同 id 才能让内核票箱的"一人一票"成立）。 */
export function verifierIds(count) {
  const n = requiredVerifiers(count)
  const out = []
  for (let i = 1; i <= n; i++) out.push('verifier-' + i)
  return out
}

export function isVerifierMember(member) {
  return /^verifier-\d+$/.test(str(member))
}

/** 连续票 → 内核票箱的选项（票箱只收选项票；0.5 也记 'for'，因为验证者的连续估计总是一种立场，
 *  `abstain` 会改变"法定人数基数"的语义而这里并不想让它改变）。*/
export function optionForResult(result) {
  return clamp01(result) >= 0.5 ? 'for' : 'against'
}

// ── votes 轨：双写的一半（连续值 + 理由，可审计、可跨进程重算） ───────────────────────────────────────
export function voteBody({ target, verifier, result, reason, round, at, option, boxId }) {
  return [
    '- target: ' + str(target),
    '- verifier: ' + str(verifier),
    '- result: ' + (Number.isFinite(Number(result)) ? String(clamp01(result)) : '0.5'),
    '- reason: ' + str(reason),
    '- round: ' + (Number.isInteger(round) ? round : 1),
    '- option: ' + str(option),
    '- box: ' + str(boxId),
    '- at: ' + timeText(at),
  ].join('\n')
}

/** 写一条 votes 轨记录（双写的"连续值"半边）。同 (target, verifier, round) 重复写 ⇒ 内容指纹去重。 */
export function recordVote({ records, target, verifier, result, reason = '', round = 1, at = null, option = null, boxId = null, by = null }) {
  requireRecords(records, 'recordVote')
  if (!str(target).trim()) return refusal('VMU_INVALID_ARGUMENT', 'a vote needs a target', 'pass { target }')
  if (!str(verifier).trim()) return refusal('VMU_INVALID_ARGUMENT', 'a vote needs a verifier', 'pass { verifier }')
  const value = Number(result)
  if (!Number.isFinite(value)) return refusal('VMU_INVALID_ARGUMENT', 'a vote needs a numeric result in [0,1]', 'pass result: 0.9 (the continuous estimate, not a boolean)')
  const body = voteBody({ target, verifier, result: value, reason, round, at, option: option === null ? optionForResult(value) : option, boxId })
  const rec = writeBody({
    records, track: VOTES_TRACK, kind: VOTE_KIND,
    title: 'v3 票｜' + str(target) + '｜' + str(verifier) + '｜r' + String(round || 1),
    body, settled: true, by,
    tags: ['vote:' + str(target), 'round:' + String(Number.isInteger(round) ? round : 1)],
  })
  return { ok: true, recordId: rec.id, deduplicated: rec.deduplicated === true, result: clamp01(value), target: str(target), verifier: str(verifier), round: Number.isInteger(round) ? round : 1 }
}

/** 读某目标某一轮的票（只读 votes 轨；坏记录点名）。 */
export function readVotes(records, target, round = 1) {
  const list = records.list({ track: VOTES_TRACK, limit: 0 })
  const items = []
  const bad = []
  for (const head of list.items) {
    if (head.kind !== VOTE_KIND) continue
    let rec
    try { rec = records.get({ id: head.id }) } catch (e) { bad.push({ recordId: head.id, why: str((e && e.message) || e) }); continue }
    const a = parseAnchors(rec.body)
    if (str(a.target) !== str(target)) continue
    const voteRound = Number(a.round)
    const wanted = Number.isInteger(round) ? round : 1
    if (Number.isFinite(voteRound) && voteRound !== wanted) continue
    const result = Number(a.result)
    if (!Number.isFinite(result)) { bad.push({ recordId: head.id, why: 'result-not-numeric:' + str(a.result) }); continue }
    items.push({ recordId: head.id, target: str(a.target), verifier: str(a.verifier), result: clamp01(result), reason: str(a.reason), round: wanted, option: str(a.option), body: rec.body })
  }
  items.sort((x, y) => (x.verifier < y.verifier ? -1 : x.verifier > y.verifier ? 1 : 0))
  const results = items.map((x) => x.result)
  return { target: str(target), round, items, count: items.length, results, verifiers: items.map((x) => x.verifier), bad }
}

// ── 状态：按 records 句柄隔离（WeakMap；同 P0-2/P0-4 的理由：影响行为的计数不能是模块级） ──────────────
const VERIFY_STATES = new WeakMap()
let lastState = null
function stateFor(records) {
  let s = VERIFY_STATES.get(records)
  if (!s) {
    s = {
      ticks: 0, rounds: 0, debates: 0, ballotsOpened: 0, votesCast: 0, verdicts: 0, undecided: 0, ticksWithoutVerdict: 0,
      maxRoundsStops: 0, malformed: 0, inFlight: false, lastTickAt: null, dispatch: null,
      active: new Map(),
      lastSkip: null, lastReceipt: null, lastError: null,
    }
    VERIFY_STATES.set(records, s)
  }
  lastState = s
  return s
}

/** 只读自报（诊断用；持久事实都在 votes/journal/methods 轨与 verified 轨上）。 */
export function v3VerifyStatus() {
  const s = lastState
  if (!s) {
    return { ticks: 0, rounds: 0, debates: 0, ballotsOpened: 0, votesCast: 0, verdicts: 0, undecided: 0,
      maxRoundsStops: 0, malformed: 0, inFlight: false, lastTickAt: null, lastSkip: null, lastReceipt: null, lastError: null,
      note: 'no tick has touched this module yet' }
  }
  return {
    ticks: s.ticks, rounds: s.rounds, debates: s.debates, ballotsOpened: s.ballotsOpened, votesCast: s.votesCast,
    verdicts: s.verdicts, undecided: s.undecided, ticksWithoutVerdict: s.ticksWithoutVerdict || 0, closurePollDispatched: s.closurePollDispatched || 0, maxRoundsStops: s.maxRoundsStops, malformed: s.malformed,
    inFlight: s.inFlight, lastTickAt: s.lastTickAt,
    lastSkip: s.lastSkip, lastReceipt: s.lastReceipt ? JSON.parse(JSON.stringify(s.lastReceipt)) : null,
    lastError: s.lastError,
    note: 'diagnostics only: counters are per-process; the durable facts are records on the votes/journal tracks and on the verified track',
  }
}

// ── 候选：未定论的命题（v3 buildVerifyCandidates `:2204-2230` 的等价面） ─────────────────────────────
/** 可验证候选：命题卡且概率不是 1/0、状态不是已验证/已弃权。返回 `{items:[{recordId,id,card}], bad}`。 */
export function listCandidates(records, { fidelity = null } = {}) {
  const list = records.list({ track: 'propos', limit: 0 })
  const items = []
  const bad = []
  for (const head of list.items) {
    if (head.kind !== 'proposition') continue
    let rec
    try { rec = records.get({ id: head.id }) } catch (e) { bad.push({ recordId: head.id, why: str((e && e.message) || e) }); continue }
    const parsed = parseCard(rec.body)
    if (!parsed.ok) { bad.push({ recordId: head.id, why: parsed.reason }); continue }
    if (parsed.kind !== 'proposition') { bad.push({ recordId: head.id, why: 'kind-mismatch:' + parsed.kind }); continue }
    const card = parsed.card
    // P1-9（共同真源）：defect 撤回的命题**不再进入候选**——否则下一轮会把它重新验证/重新判“通过”。
    if (proofVerdict({ records, target: str(card.id) }).state === 'withdrawn') continue
    // 内核 fidelity 的 `passedWithdrawn` 也要问（同一撤回语义的两份既有标记）。
    if (fidelity && typeof fidelity.passedWithdrawnFor === 'function' && fidelity.passedWithdrawnFor(str(card.id))) continue
    if (card.概率 === 1 || card.概率 === 0) continue
    if (str(card.状态) === '已验证·真' || str(card.状态) === '已验证·假') continue
    if (card.优先级 === 'never') continue
    items.push({ recordId: head.id, id: str(card.id), card })
  }
  return { items, bad }
}

// ── 双写的一步：开票箱 / 投票 ───────────────────────────────────────────────────────────────────────
/** 开一个本轮票箱。返回 `{ok, boxId, round}` 或内核的具名拒（原样透传）。 */
export function openVoteBox({ ballotbox, target, round = 1, at = null }) {
  if (!ballotbox || typeof ballotbox.open !== 'function') {
    return refusal('VMU_ENGINE_UNAVAILABLE', 'vmu.ballotbox is not published in this assembly', 'the quorum must be enforced by the kernel: publish vmu.ballotbox (it is part of the M2 service catalog)')
  }
  const opened = ballotbox.open({
    question: 'v3 验证：命题 ' + str(target) + ' 是否成立（第 ' + String(round) + ' 轮）',
    options: ['for', 'against'],
  })
  if (!opened || opened.ok === false) return Object.assign({}, opened || refusal('VMU_MIDDLEWARE_FAILED', 'ballotbox.open returned no receipt'), { source: 'kernel-open', settled: false })
  return { ok: true, boxId: opened.boxId, round, target: str(target), at }
}

/**
 * 投一票（**双写**）：先 `ballotbox.cast` 让内核强制"一人一票/票面合法"，再写 `votes` 轨存连续值与理由。
 * 内核拒（重复票、票面外选项…）⇒ **原样透传它的具名拒**，且**不写** votes 轨（两边不出现"只有一半"）。
 */
export function submitVote({ records, ballotbox, boxId, target, verifier, result, reason = '', round = 1, at = null, by = null }) {
  requireRecords(records, 'submitVote')
  if (!ballotbox || typeof ballotbox.cast !== 'function') {
    return refusal('VMU_ENGINE_UNAVAILABLE', 'vmu.ballotbox is not published in this assembly', 'publish vmu.ballotbox so the quorum is enforced by the kernel')
  }
  if (!str(boxId).trim()) return refusal('VMU_STATE', 'no open ballot box for target ' + str(target), 'open a box for this round first (openVoteBox)')
  const value = Number(result)
  if (!Number.isFinite(value)) return refusal('VMU_INVALID_ARGUMENT', 'a vote needs a numeric result in [0,1]', 'pass result: 0.9 (continuous estimate)')
  const option = optionForResult(value)
  const cast = ballotbox.cast({ boxId: str(boxId), by: str(verifier), choice: option })
  if (!cast || cast.ok === false) {
    return Object.assign({}, cast || refusal('VMU_MIDDLEWARE_FAILED', 'ballotbox.cast returned no receipt'), { source: 'kernel-cast', target: str(target), verifier: str(verifier) })
  }
  const recorded = recordVote({ records, target, verifier, result: value, reason, round, at, option, boxId, by })
  if (recorded.ok === false) return Object.assign({}, recorded, { source: 'votes-track', cast })
  return { ok: true, source: 'double-write', boxId: str(boxId), target: str(target), verifier: str(verifier), option, result: recorded.result, voteRecordId: recorded.recordId, deduplicated: recorded.deduplicated === true }
}

// ── 结算：法定人数闸门（单票/未凑齐 ⇒ 具名"未成立"，不是否决） ──────────────────────────────────────
/**
 * 尝试结算一轮。**顺序刻意为**：
 *   ① pack 前置闸门：本轮 votes 轨票数 < required ⇒ 具名拒（`source:'pack-precheck'`），**不改任何对象**；
 *   ② 调内核 `close`：若内核法定人数不足 ⇒ 把内核的具名拒**原样**返回（`source:'kernel'`）；
 *   ③ 内核 OK ⇒ 用 votes 轨的连续值聚合（pack 语义）。
 * 返回 `{ok:true, settled:false, verdict:null, ...}` 的"未成立"回执**不是** `deny` —— 见文件头与报告。
 */
export function trySettle({ records, ballotbox, boxId, target, round = 1, required = MIN_VERIFIERS, verdictMode = 'forced', at = null }) {
  requireRecords(records, 'trySettle')
  const votes = readVotes(records, target, round)
  const need = Math.max(MIN_VERIFIERS, Number.isInteger(required) && required > 0 ? required : MIN_VERIFIERS)
  if (votes.count < need) {
    return refusal('VMU_BALLOT_MIN_VOTES_NOT_MET',
      '法定人数不足：votes 轨 ' + votes.count + ' < ' + need + '（本轮不定论）',
      '继续收票/补派验证器；不得把不足法定人数的结果当否决', {
        source: 'pack-precheck', settled: false, verdict: null, target: str(target), round,
        tally: { votes: votes.count, required: need, verifiers: votes.verifiers },
      })
  }
  let closed = null
  if (ballotbox && typeof ballotbox.close === 'function' && str(boxId).trim()) closed = ballotbox.close({ boxId: str(boxId) })
  if (closed && closed.ok === false) {
    // ★ 内核说"未成立" ⇒ 本轮不定论（不是否决策）：原样透传 code/tally，并写明来源是内核法定人数。
    return Object.assign({}, closed, { source: 'kernel', settled: false, verdict: null, target: str(target), round, votes: votes.count })
  }
  const agg = aggregateVerdict({ results: votes.results, verdictMode })
  return {
    ok: true, settled: false, pendingVerdict: agg.verdict, rule: agg.rule, mean: agg.mean,
    target: str(target), round, votes: votes.count, required: need, results: votes.results,
    ballot: closed ? { outcome: closed.outcome === undefined ? null : closed.outcome, tally: closed.tally || null } : null,
    source: 'pack-aggregate',
  }
}

function strongestReason(votes, verdict) {
  let best = ''
  let bestDist = -1
  for (const v of votes) {
    const dist = verdict >= 0.5 ? v.result : 1 - v.result
    if (dist > bestDist && v.reason) { bestDist = dist; best = v.reason }
  }
  return best
}

/**
 * 把裁决**回写到三处**：① 命题卡（概率/状态/证明或证伪条目）② `verified` 轨（**只经 promoteVerified**）
 * ③ `journal` 轨（裁决记录）。verdict 不是 1/0 时**只**改卡 + journal（verified 只收定论）。
 * 这是 v3 `settleVerdict`（`:4269-4368`）命题分支的等价面。
 */
export function settleProposition({ records, target, recordId, verdict, rule, at = null, by = 'v3-verify', round = 1, maxRoundsReached = false, votes = [], ballotId = null, fidelity = null }) {
  requireRecords(records, 'settleProposition')
  const value = clamp01(verdict)
  let rec
  try { rec = records.get({ id: recordId }) } catch (e) {
    return refusal('VMU_NO_SUCH_OBJECT', 'unknown candidate record: ' + str(recordId), 'listCandidates() shows what can be verified')
  }
  const parsed = parseCard(rec.body)
  if (!parsed.ok || parsed.kind !== 'proposition') {
    return refusal('VMU_INVALID_ARGUMENT', 'record ' + str(recordId) + ' is not a parsable proposition card: ' + (parsed.reason || parsed.kind), 'the P0-7 settlement rewrites propositions; other kinds are separate cards')
  }
  const card = parsed.card
  // P1-9（共同真源）：已撤回的证明不能被“再结算一次”悄悄恢复成通过。
  if (proofVerdict({ records, target: str(target) }).state === 'withdrawn') {
    return refusal('VMU_PACK_V3_DEFECT_WITHDRAWN', 'the archived proof of ' + str(target) + ' was withdrawn by a defect marker',
      'a defect marker is the shared truth for every reader; reinstating requires a NEW settlement/card, recorded deliberately')
  }
  // 内核实真：fidelity 的 `passedWithdrawn` 标记同样拒绝再结算（真实内核标记，不是 pack 记忆）。
  if (fidelity && typeof fidelity.passedWithdrawnFor === 'function' && fidelity.passedWithdrawnFor(str(target))) {
    return refusal('VMU_PACK_V3_DEFECT_WITHDRAWN', 'the archived proof of ' + str(target) + ' was withdrawn by a fidelity defect marker',
      'the fidelity registry records passedWithdrawn for this target; a settlement cannot silently reinstate it')
  }
  const status = value === 1 ? '已验证·真' : value === 0 ? '已验证·假' : '未定论'
  card.概率 = value
  card.状态 = status
  if (value === 1 || value === 0) card.优先级 = 'never'
  const reason = strongestReason(Array.isArray(votes) ? votes : [], value)
  if (value === 1) {
    card.proofs = (Array.isArray(card.proofs) ? card.proofs : []).concat([{ title: '验证证明', prob: 1, status: '已验', text: reason || '经验证闭环裁决为真' }])
  } else if (value === 0) {
    card.refutes = (Array.isArray(card.refutes) ? card.refutes : []).concat([{ title: '验证证伪', prob: 1, status: '已验', text: reason || '经验证闭环裁决为假' }])
  } else {
    card.proofs = (Array.isArray(card.proofs) ? card.proofs : []).concat([{ title: '辩论支持论证', prob: value, status: '已验', text: reason || '根据辩论得到的支持性论证' }])
    card.refutes = (Array.isArray(card.refutes) ? card.refutes : []).concat([{ title: '辩论反驳论证', prob: clampForced(1 - value), status: '已验', text: '根据辩论得到的反驳性论证' }])
  }
  const body = composeCard('proposition', card)
  const revised = supersedeBody({ records, id: recordId, body, reason: 'v3 裁决回写：' + rule + ' ⇒ ' + value, by })
  // ★ verified 轨只经 dataplane.promoteVerified 写（它只收定论、内容不变不重写）。
  let verified = { written: false, skipped: 'not-settled' }
  if (value === 1 || value === 0) {
    verified = promoteVerified({ records, sourceId: recordId, at, by })
  }
  const journal = writeBody({
    records, track: 'journal', kind: 'state',
    title: 'v3 裁决｜' + str(target) + '｜' + value,
    body: [
      '- target: ' + str(target),
      '- verdict: ' + value,
      '- rule: ' + str(rule),
      '- round: ' + (Number.isInteger(round) ? round : 1),
      '- votes: ' + (Array.isArray(votes) ? votes.length : 0),
      '- maxRoundsReached: ' + (maxRoundsReached === true),
      '- ballot: ' + str(ballotId),
      '- at: ' + timeText(at),
      '- verifiedWritten: ' + !!(verified && verified.written === true),
    ].join('\n'),
    settled: true, by,
  })
  return {
    ok: true, settled: true, target: str(target), recordId, verdict: value, rule: str(rule), status,
    rev: revised && revised.rev, verifiedId: verified && verified.id ? verified.id : null,
    verifiedWritten: !!(verified && verified.written === true), verifiedSkipped: verified && verified.skipped ? verified.skipped : null,
    journalId: journal && journal.id ? journal.id : null, maxRoundsReached: maxRoundsReached === true,
  }
}

/** "本轮未成立"的审计 journal（**不是**裁决记录：标题与正文都写明不是否决，且不写 verdict 字段）。 */
export function recordUndecided({ records, target, code, message, tally = null, at = null, round = 1, by = 'v3-verify' }) {
  const body = [
    '- target: ' + str(target),
    '- outcome: 未成立（NOT a negative verdict）',
    '- code: ' + str(code),
    '- message: ' + str(message),
    '- round: ' + (Number.isInteger(round) ? round : 1),
    '- tally: ' + (tally === null ? 'unknown' : JSON.stringify(tally)),
    '- at: ' + timeText(at),
    '- note: 本轮不定论；对象卡、verified 轨都没有被改写，下一 tick 继续收集票',
  ].join('\n')
  const rec = writeBody({ records, track: 'journal', kind: 'state', title: 'v3 验证未成立｜' + str(target), body, settled: true, by })
  return { ok: true, journalId: rec && rec.id ? rec.id : null }
}

/** 一轮辩论的审计 journal（每轮一条；`journal` 轨上的"辩论记录"就是它）。 */
export function recordDebateRound({ records, target, round, results, rule, verdict = null, at = null, by = 'v3-verify' }) {
  const body = [
    '- target: ' + str(target),
    '- debateRound: ' + (Number.isInteger(round) ? round : 1),
    '- results: ' + (Array.isArray(results) ? JSON.stringify(results) : '[]'),
    '- rule: ' + str(rule),
    '- tentativeVerdict: ' + (verdict === null ? 'none' : String(verdict)),
    '- at: ' + timeText(at),
    '- note: 非全票一致 ⇒ 进入下一轮辩论（每轮新开票箱，票继续双写）；轮次用尽后按 verdictMode 具名收口',
  ].join('\n')
  const rec = writeBody({ records, track: 'journal', kind: 'state', title: 'v3 验证辩论｜' + str(target) + '｜第 ' + String(round) + ' 轮', body, settled: true, by })
  return { ok: true, journalId: rec && rec.id ? rec.id : null }
}

// ── 回执载体解析（progress 载荷；严格性是"缺字段 ⇒ 具名，不静默丢"） ──────────────────────────────────
function splitEscaped(text, sep) {
  const out = []
  let cur = ''
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (c === '\\' && i + 1 < text.length) { cur += c + text[i + 1]; i += 1; continue }
    if (c === sep) { out.push(cur); cur = ''; continue }
    cur += c
  }
  out.push(cur)
  return out
}
function unesc(v) { return str(v).replace(/\\(.)/g, (_m, c) => (c === 'n' ? '\n' : c)) }

/**
 * 从回合回执里取票。三种载体都接受（任一即可）：
 *   · `progress.votes` 数组（同名字段；**真实回合的契约**）／`progress.vote` 单票对象
 *   · `progress.tags` 里的 `vote:<target>｜<result>｜<reason>｜<round>`
 *   · 顶层 `votes`/`vote`（纯 API/测试；真实回合会被字段门拒，见文件头）
 * 缺字段的票进 `malformed`（不静默丢）。
 */
export function votesFromReply(reply) {
  const r = isObject(reply) ? reply : {}
  const progress = isObject(r.progress) ? r.progress : {}
  const raw = []
  const pushList = (v) => { if (Array.isArray(v)) for (const x of v) raw.push({ carrier: 'fields', item: x }) }
  pushList(r.votes)
  if (isObject(r.vote)) raw.push({ carrier: 'fields', item: r.vote })
  pushList(progress.votes)
  if (isObject(progress.vote)) raw.push({ carrier: 'fields', item: progress.vote })
  const tags = Array.isArray(progress.tags) ? progress.tags : (Array.isArray(r.tags) ? r.tags : [])
  for (const tag of tags) {
    const s = str(tag)
    if (!s.startsWith(VOTE_TAG_PREFIX)) continue
    const parts = splitEscaped(s.slice(VOTE_TAG_PREFIX.length), '｜').map(unesc)
    raw.push({ carrier: 'tags', item: { target: parts[0], result: parts[1], reason: parts[2], round: parts[3] } })
  }
  const votes = []
  const malformed = []
  for (const entry of raw) {
    const item = entry.item
    if (!isObject(item)) { malformed.push({ carrier: entry.carrier, why: 'not-an-object', raw: item }); continue }
    const result = Number(item.result === undefined ? item.Result : item.result)
    if (!Number.isFinite(result)) { malformed.push({ carrier: entry.carrier, why: 'result-not-numeric', raw: item }); continue }
    const roundRaw = Number(item.round)
    votes.push({
      target: str(item.target),
      result: clamp01(result),
      reason: str(item.reason === undefined ? item.Reason : item.reason),
      round: Number.isInteger(roundRaw) && roundRaw > 0 ? roundRaw : null,
      carrier: entry.carrier,
    })
  }
  return { votes, malformed, malformedCount: malformed.length }
}

// ── 模块接线 ────────────────────────────────────────────────────────────────────────────────────────
function requireApi(flat, who) {
  const api = flat && flat.api
  if (!api || !api.services) {
    throw Object.assign(new Error(who + ' received no api facade, so vmu.records/vmu.ballotbox/vmu.turn cannot be reached'), {
      code: 'VMU_ENGINE_UNAVAILABLE',
      hint: 'a middleware entry must go through kernel/loader.js (module shape), not the raw bus path',
    })
  }
  return api
}

function readSettings(api) {
  const vcRaw = Number(api.setting('vmu.v3.verifierCount'))
  const roundsRaw = Number(api.setting('vmu.v3.debateMaxRounds'))
  const modeRaw = api.setting('vmu.v3.verdictMode')
  return {
    verifierCount: Number.isFinite(vcRaw) && vcRaw > 0 ? Math.floor(vcRaw) : 3,
    required: requiredVerifiers(Number.isFinite(vcRaw) && vcRaw > 0 ? vcRaw : 3),
    debateMaxRounds: Number.isFinite(roundsRaw) && roundsRaw >= 1 ? Math.floor(roundsRaw) : 5,
    verdictMode: VERDICT_MODES.includes(String(modeRaw)) ? String(modeRaw) : 'forced',
    // P0-8：人工门读**原始值**（gates.js 归一化；**脏值**按 manual，fail-closed）。
    // ★ "键不存在"不是脏值：内核不物化 schema 默认，而 `vmu.v3.mode` 的声明默认是 auto ⇒ 缺省回落 auto；
    //   拼错的字符串仍然 fail-closed（normaliseGateMode 的 unknown-mode 分支）。
    mode: (() => { const v = api.setting('vmu.v3.mode'); return v === undefined || v === null || String(v).trim() === '' ? 'auto' : v })(),
    // P1-8：H2 档位在构造期被 Lean 面读入；模块这里现读是为了让"本装配是哪一档"可观测（运行期改值不是热更新）。
    formalVerify: leanModeOf(api.setting('vmu.math.formalVerify')),
  }
}

// ── P0-8：裁决前的人工门（判定/台账在 gates.js；这里只做"该不该结算"的转接与放行执行器） ─────────────
/** 一扇裁决门放行后真正结算（**复用** settleProposition，不复制回写逻辑）。 */
function verdictGateExecutorFor({ records, state }) {
  return async (gate) => {
    const payload = isObject(gate && gate.payload) ? gate.payload : {}
    const at = Number.isFinite(gate && gate.at) ? gate.at : null
    const settled = settleProposition({
      records, target: str(payload.target), recordId: str(payload.recordId),
      verdict: Number(payload.verdict), rule: str(payload.rule), at,
      round: Number(payload.round) || 1, maxRoundsReached: payload.maxRoundsReached === true,
      votes: Array.isArray(payload.votes) ? payload.votes : [], ballotId: str(payload.ballotId) || null,
      by: 'v3-gates',
    })
    if (settled.ok !== true) {
      throw refuse(settled.code || 'VMU_MIDDLEWARE_FAILED', str(settled.message || 'the approved verdict could not be settled'),
        'a gate release must either settle the verdict or end as a terminal failure — never pretend success')
    }
    state.verdicts += 1
    if (payload.maxRoundsReached === true) state.maxRoundsStops += 1
    state.active.delete(str(payload.target))
    state.lastReceipt = Object.assign({}, settled, { releasedBy: 'gate', gateId: str(gate && gate.gateId) })
    state.gateReleased = (state.gateReleased || 0) + 1
    return settled
  }
}

/**
 * 裁决前过门：`allow:true` ⇒ 直接结算；`allow:false` ⇒ 返回具名 skip / 新建的 pending 门 id。
 * 幂等性：**同一候选已有 pending 裁决门 ⇒ 不再开第二扇**（manual 下每 tick 都开会在台账里刷出一堆重复门）；
 *          同一候选同一轮已有 rejected/failed 终态 ⇒ 本轮不再重开（下一轮辩论才会再问人）。
 */
function gateVerdict({ records, state, human, at, mode, target, candidate, verdict, rule, round, maxRoundsReached, votes, ballotId }) {
  const gates = listGates({ records })
  const pendingMine = gates.pending.find((g) => str(g.kind) === 'verdict' && str(g.subject) === str(target))
  if (pendingMine) return { allow: false, skip: 'verdict-gate-pending', gateId: pendingMine.gateId, gate: pendingMine }
  const sameRound = gates.resolved.filter((g) => str(g.kind) === 'verdict' && str(g.subject) === str(target)
    && isObject(g.payload) && Number(g.payload.round) === Number(round))
  const blocked = sameRound.find((g) => g.status === 'rejected' || g.status === 'failed')
  if (blocked) return { allow: false, skip: 'verdict-gate-' + blocked.status, gateId: blocked.gateId, gate: blocked }
  registerGateExecutor(records, 'verdict', verdictGateExecutorFor({ records, state }))
  const res = evaluateGate({
    records, human, at, mode, kind: 'verdict',
    subject: target,
    payload: { target: str(target), recordId: str(candidate.recordId), verdict, rule: str(rule), round, maxRoundsReached: maxRoundsReached === true, votes: Array.isArray(votes) ? votes : [], ballotId: str(ballotId) || null },
    why: 'v3 verdict awaiting human approval (verdict ' + str(verdict) + ', rule ' + str(rule) + ')',
    by: 'v3-verify',
  })
  if (res.allow) return { allow: true, outcome: res.decision ? res.decision.outcome : 'auto-pass' }
  return { allow: false, gateId: res.gateId || null, gate: res.gate || null, outcome: res.decision ? res.decision.outcome : 'pending' }
}

/** 裁决被人工门拦下时的审计 journal（**不是**裁决记录；对象卡与 verified 轨都没动）。 */
function recordVerdictAwaiting({ records, target, verdict, rule, round, gateId, at }) {
  const body = [
    '- target: ' + str(target),
    '- tentativeVerdict: ' + str(verdict),
    '- rule: ' + str(rule),
    '- round: ' + (Number.isInteger(round) ? round : 1),
    '- gateId: ' + str(gateId),
    '- at: ' + timeText(at),
    '- note: mode=manual: the verdict is QUEUED behind a human gate; the proposition card and the verified track were NOT written',
  ].join('\n')
  const rec = writeBody({ records, track: 'journal', kind: 'state', title: 'v3 裁决待审｜' + str(target), body, settled: true, by: 'v3-verify' })
  return { ok: true, journalId: rec && rec.id ? rec.id : null }
}

/** 派一个验证者回合（**只从 tick 调用**；回合内再开回合会被 VMU_TURN_REENTRANT 拒）。 */
async function dispatchVerifier({ turn, target, question, round, verifier, required, transcript, at, targetBody = null, targetCard = null }) {
  const brief = {
    target,
    question,
    round,
    verifier,
    requiredVotes: required,
    contract: {
      carrier: 'progress.votes',
      shape: [{ target, result: 'number in [0,1]', reason: 'string', round }],
      note: 'put the votes inside the registered `progress` field payload; a rewrite that is not JSON object text is refused by name',
    },
    transcript,
    targetCard: targetCard || null,
    targetBody: targetBody ? String(targetBody).slice(0, 8000) : null,
    at: Number.isFinite(at) ? at : null,
  }
  // ★ SLV / TWO-PHASE: dispatch only. Votes are written by the turn/reply-parsed handler; a later tick reads them
  // and decides whether the round settled.
  if (typeof turn.dispatch === 'function') {
    return turn.dispatch({
      member: verifier,
    role: 'verifier',
    phase: 'verify',
    task: 'v3-verify:' + target + ':r' + String(round) + ':' + verifier,
    why: 'v3 verification round ' + round + ' (' + verifier + '/' + String(required) + ')',
    statusBlock: JSON.stringify(brief, null, 2),
    round,
    })
  }
}

/**
 * 推进一个候选：逐轮"派发 → 收票 → 结算/辩论"，**轮次有界**（`debateMaxRounds`）。
 * 返回 `{ok, settled, verdict?, rule?, rounds, maxRoundsReached, undecided?}`。
 */
async function advanceCandidate({ records, ballotbox, turn, at, settings, state, candidate, human = null, fidelity = null, seatedVerifiers = null }) {
  const target = candidate.id
  const required = settings.required
  // ★ SLV: dispatch to the SEATED verifier members. The original guessed verifier-1..N, but a real deployment seats
  // verifier-a via the admission chain - the guessed ids are refused by name (VMU_INVALID_ARGUMENT / no meeting).
  const ids = Array.isArray(seatedVerifiers) && seatedVerifiers.length > 0 ? seatedVerifiers.slice() : verifierIds(settings.verifierCount)
  const transcript = []
  // ★ 跨 tick 复用同一轮的票箱：内核票箱是"一人一票"，若每 tick 重开一个箱，前几 tick 的 cast 就不在这个
  //   箱里 ⇒ 部署一旦设置 `vmu.ballot.minVotes`，法定人数会永远差几票（实测过的坑）。所以 active 按目标保存
  //   {boxId, round}，只有"结算成功"或"进入下一轮辩论"才换箱。
  const active = state.active.get(target) || null
  let round = active ? active.round : 1
  // ★ SLV / TWO-PHASE: a verifier is dispatched ONCE per round. If its reply never arrives, the round still proceeds to
  // the settlement attempt with the votes it HAS (the old synchronous code did this in one tick; now a later tick does).
  if (!state.tried) state.tried = new Map()
  let tried = state.tried.get(target)
  if (!tried || tried.round !== round) { tried = { round, verifiers: new Set() }; state.tried.set(target, tried) }
  let box = active ? { ok: true, boxId: active.boxId, round } : null
  for (; round <= settings.debateMaxRounds; round++) {
    if (!box) {
      tried = { round, verifiers: new Set() }
      state.tried.set(target, tried)
      box = openVoteBox({ ballotbox, target, round, at })
      if (box.ok !== true) return Object.assign({}, box, { settled: false, target, round, rounds: round })
      state.ballotsOpened += 1
      state.active.set(target, { boxId: box.boxId, round })
    }
    // 逐个派发本轮还缺票的验证者。
    let dispatchedThisTick = false
    for (const verifier of ids) {
      const before = readVotes(records, target, round)
      if (before.verifiers.includes(verifier)) continue
      if (tried.verifiers.has(verifier)) continue
      tried.verifiers.add(verifier)
      state.dispatch = { target, boxId: box.boxId, round, verifier }
      let receipt = null
      try {
        receipt = await dispatchVerifier({ turn, target, question: '命题 ' + target + ' 是否成立？', round, verifier, required, transcript, at, targetCard: candidate.card, targetBody: (() => { try { return records.get({ id: candidate.recordId }).body } catch { return null } })() })
      } catch (e) {
        state.lastError = { phase: 'verifier-turn', code: str((e && e.code) || 'VMU_MIDDLEWARE_FAILED'), message: str((e && e.message) || e) }
      } finally {
        state.dispatch = null
      }
      // ★ SLV / TWO-PHASE: the verifier turn was only DISPATCHED. Its vote lands through turn/reply-parsed; the whole
      // round's dispatches happen in this tick, and a LATER tick reads the votes and decides.
      if (receipt && receipt.dispatched === true) dispatchedThisTick = true
      if (receipt && receipt.ok === false && str((receipt.refused && receipt.refused.code) || receipt.code) === 'VMU_TURN_REENTRANT') {
        state.lastError = { phase: 'verifier-turn', code: 'VMU_TURN_REENTRANT', message: 'another turn is in flight; the next tick retries' }
        return { ok: true, settled: false, skipped: 'turn-reentrant', target, round, rounds: round, pendingVerdict: null }
      }
    }
    if (dispatchedThisTick) {
      state.lastDispatcherTick = state.ticks
      return { ok: true, dispatched: true, settled: false, target, round, awaitingReply: true }
    }
    const votes = readVotes(records, target, round)
    // ★ SLV: a REPEATED tick with the same vote count is not a new "undecided verdict" - it is a tick without a verdict.
    // Counting it as undecided made the number grow at tick rate while votesCast stayed 0.
    const voteKey = target + '@' + round
    if (!state.lastVoteCount || typeof state.lastVoteCount.get !== 'function') state.lastVoteCount = new Map()
    const prevVoteCount = state.lastVoteCount.get(voteKey)
    const repeatedNoNewVotes = prevVoteCount === votes.count
    state.lastVoteCount.set(voteKey, votes.count)
    // ★ PHASE 6 联动：`ballot.close()` 现在真的会因 middleware 的 deny 而**抛具名拒**（修了“blockable 钩子
    // 不被消费者检查”那一类）。这里把它接成“本轮未成立 + 保留候选”，而不是让整条 tick 抛出去 —— 否则
    // 一个候选的拒绝会带走同一 tick 里其它候选。
    let settledAttempt
    try {
      settledAttempt = trySettle({ records, ballotbox, boxId: box.boxId, target, round, required, verdictMode: settings.verdictMode, at })
    } catch (e) {
      const held = { ok: false, settled: false, target, round, rounds: round, code: str((e && e.code) || 'VMU_MIDDLEWARE_FAILED'), message: str((e && e.message) || e) }
      recordUndecided({ records, target, code: held.code, message: held.message, tally: null, at, round })
      if (repeatedNoNewVotes) state.ticksWithoutVerdict = (state.ticksWithoutVerdict || 0) + 1
      else state.undecided += 1
      return Object.assign({}, held, { note: 'the tally point refused this settlement by name; the object stays on its track' })
    }
    if (settledAttempt.ok === false) {
      // 未成立：写一条"不是否决"的审计 journal，保留候选（下一 tick 继续收票）。
      recordUndecided({ records, target, code: settledAttempt.code, message: settledAttempt.message, tally: settledAttempt.tally, at, round })
      if (repeatedNoNewVotes) state.ticksWithoutVerdict = (state.ticksWithoutVerdict || 0) + 1
      else state.undecided += 1
      return Object.assign({}, settledAttempt, { settled: false, target, round, rounds: round, undecided: true })
    }
    const verdict = settledAttempt.pendingVerdict
    const rule = settledAttempt.rule
    transcript.push({ round, results: votes.results, verdict, rule })
    // v3 的辩论条件：**不是全票一致**（consensus 仅指全 1/全 0）且还有轮次 ⇒ 进入下一轮。
    const consensus = rule === 'unanimous-1' || rule === 'unanimous-0'
    if (!consensus && round < settings.debateMaxRounds) {
      recordDebateRound({ records, target, round, results: votes.results, rule, verdict, at })
      state.debates += 1
      state.rounds += 1
      box = null
      state.active.delete(target)
      continue
    }
    const maxRoundsReached = !consensus && round >= settings.debateMaxRounds
    // ★ P0-8：裁决**之前**过人工门（auto ⇒ 直通零记录；manual ⇒ 停在这里，对象卡/verified 轨都不写）。
    const gate = gateVerdict({
      records, state, human, at, mode: settings.mode, target, candidate, verdict, rule, round,
      maxRoundsReached, votes: votes.items, ballotId: box.boxId,
    })
    if (!gate.allow) {
      const gateOutcome = {
        ok: true, settled: false, target, round, rounds: round,
        verdict, rule, maxRoundsReached,
        awaitingApproval: gate.skip === undefined,
        skipped: gate.skip || 'verdict-awaiting-approval',
        gateId: gate.gateId || null,
        pendingVerdict: verdict,
      }
      if (gate.skip === undefined) {
        recordVerdictAwaiting({ records, target, verdict, rule, round, gateId: gate.gateId, at })
        state.awaitingVerdicts = (state.awaitingVerdicts || 0) + 1
      }
      state.lastReceipt = Object.assign({}, gateOutcome, { note: 'verdict held by the human gate' })
      return gateOutcome
    }
    // ★ P1-8：人工门之后、结算之前 —— Lean 的 require 档在这里**真正**拦下裁决：
    //   没有 passed 证据（或最新证据是 blocked）⇒ 不调 settleProposition，对象留在原轨，写一条具名 journal。
    //   off / encourage ⇒ 不阻断（zero policy / 只提示）。
    const leanEvidenceView = leanEvidence({ records, target })
    const leanCheck = leanGateDecision({ mode: settings.formalVerify, target, evidence: leanEvidenceView.evidence })
    if (!leanCheck.allow) {
      try {
        writeBody({
          records, track: 'journal', kind: 'state',
          title: 'v3 裁决被 Lean 门拦下｜' + str(target),
          body: [
            '- target: ' + str(target),
            '- formalVerify: require',
            '- evidence: ' + (leanEvidenceView.evidence ? String(leanEvidenceView.evidence.status) : '(none)'),
            '- code: ' + str(leanCheck.code),
            '- at: ' + (Number.isFinite(at) ? at : 'unknown'),
            '- note: the verdict was NOT settled; the object stays on its track (no field was rewritten, verified track untouched)',
          ].join('\n'),
          settled: true, by: 'v3-verify',
        })
      } catch { /* a journal write must not break the tick; the receipt below still carries the refusal */ }
      state.leanDenials = (state.leanDenials || 0) + 1
      const leanOutcome = {
        ok: true, settled: false, target, round, rounds: round,
        verdict, rule, maxRoundsReached,
        skipped: 'lean-evidence-missing', pendingVerdict: verdict,
        code: leanCheck.code, message: leanCheck.message, hint: leanCheck.hint,
        note: 'formalVerify=require: no passed/blocked evidence ⇒ the verdict is NOT counted and the object is left on its track (a named hold, not a silent drop)',
      }
      state.lastReceipt = Object.assign({}, leanOutcome)
      return leanOutcome
    }
    const settled = settleProposition({
      records, target, recordId: candidate.recordId, verdict, rule,
      at, round, maxRoundsReached, votes: votes.items, ballotId: box.boxId, fidelity,
    })
    if (settled.ok === true) {
      state.verdicts += 1
      if (maxRoundsReached) state.maxRoundsStops += 1
      state.active.delete(target)
      state.lastReceipt = Object.assign({}, settled, { rounds: round })
      return Object.assign({}, settled, { rounds: round, maxRoundsReached })
    }
    return Object.assign({}, settled, { settled: false, target, round, rounds: round })
  }
  return refusal('VMU_STATE', 'the debate loop ended without a settlement: ' + str(target), 'debateMaxRounds must be >= 1; this is a code-path guard, not an expected outcome', { settled: false, target, rounds: settings.debateMaxRounds })
}

/**
 * ★ SLV / P1-8 CLOSURE POLL PATH: the pack wrote the vote_solved receipt contract but NOTHING dispatched the poll turn.
 * When every object is settled (verified track non-empty AND no candidates), ask each seated verifier the closure
 * question once. Positive: settled + no candidates ⇒ poll dispatched. Negative: no settled object / already polled ⇒ no poll.
 */
export async function dispatchClosurePoll({ records, turn, state, seatedVerifiers = [] }) {
  let verifiedCount = 0
  try { verifiedCount = records.list({ track: 'verified', limit: 0 }).items.length } catch { verifiedCount = 0 }
  if (verifiedCount === 0) return { dispatched: false, reason: 'no-settled-object-yet' }
  const ids = Array.isArray(seatedVerifiers) && seatedVerifiers.length > 0 ? seatedVerifiers : []
  if (ids.length === 0) return { dispatched: false, reason: 'no-seated-verifier' }
  if (!state.closurePolled) state.closurePolled = new Set()
  for (const id of ids) {
    if (state.closurePolled.has(id)) continue
    if (typeof turn.dispatch !== 'function') return { dispatched: false, reason: 'no-dispatch-verb' }
    const receipt = turn.dispatch({
      member: id,
      role: 'verifier',
      phase: 'verify',
      task: 'v3-closure-poll',
      why: 'closure poll: 所有需要验证的对象都已定论。只回答研究目标是否已解决。',
      statusBlock: JSON.stringify(Object.assign({ closurePoll: true,
        question: '研究目标是否已经解决？',
        instruction: '若下列 verified 证明已完整解决该问题，只输出 {"vote_solved": true}；否则只输出 {"vote_solved": false}。不要写 progress、不要写其他字段。' },
        (() => {
          // ★ SLV: the poll must carry the EVIDENCE, otherwise a verifier honestly answers "not solved" (it has no idea
          // what was proved). Include the verified cards and the problem they settle.
          const evidence = []
          try {
            for (const it of records.list({ track: 'verified', limit: 0 }).items.slice(0, 5)) {
              const rec = records.get({ id: it.id })
              evidence.push({ id: it.id, title: it.title, body: String((rec && rec.body) || '').slice(0, 4000) })
            }
          } catch { /* the poll still carries the question */ }
          const problems = []
          try {
            for (const it of records.list({ track: 'problems', limit: 0 }).items.slice(0, 5)) {
              const rec = records.get({ id: it.id })
              problems.push({ id: it.id, body: String((rec && rec.body) || '').slice(0, 3000) })
            }
          } catch { /* optional */ }
          return { verified: evidence, problems }
        })())),
      round: 1,
    })
    if (receipt && receipt.dispatched === true) {
      state.closurePolled.add(id)
      state.closurePollDispatched += 1
      return { dispatched: true, verifier: id, turn: receipt.turn || null }
    }
  }
  return { dispatched: false, reason: 'already-polled' }
}

async function onTick(flat) {
  const api = requireApi(flat, 'v3 verify')
  const at = Number.isFinite(flat.at) ? flat.at : null
  const records = api.services.get('vmu.records')
  const state = stateFor(records)
  state.ticks += 1
  if (at === null) {
    state.lastSkip = { reason: 'no-injected-clock', tick: state.ticks }
    return { ok: true, skipped: 'no-injected-clock', ticks: state.ticks }
  }
  state.lastTickAt = at
  const settings = readSettings(api)
  let fidelity = null
  try { if (typeof api.services.names === 'function' && api.services.names().includes('vmu.fidelity')) fidelity = api.services.get('vmu.fidelity') } catch { fidelity = null }
  const candidates = listCandidates(records, { fidelity })
  // seats are resolved before the no-candidates branch so the closure poll can use them
  let seatedForPoll = []
  try {
    const membersSvc = api.services.get('vmu.members')
    if (membersSvc && typeof membersSvc.roster === 'function') {
      for (const m of membersSvc.roster()) {
        if (!m || typeof m !== 'object') continue
        const slot = String(m.slot || m.role || '')
        if (slot !== 'verifier') continue
        if (m.state !== undefined && m.state !== 'live') continue
        seatedForPoll.push(String(m.id || m.memberId || ''))
      }
      seatedForPoll = seatedForPoll.filter((x) => x !== '')
    }
  } catch { seatedForPoll = [] }
  if (!state.closurePollDispatched) state.closurePollDispatched = 0
  if (candidates.items.length === 0) {
    const pollTurn = (() => { try { return api.services.get('vmu.turn') } catch { return null } })()
    const poll = await dispatchClosurePoll({ records, turn: pollTurn, state, seatedVerifiers: seatedForPoll })
    if (poll.dispatched) {
      state.lastSkip = { reason: 'closure-poll-dispatched', verifier: poll.verifier, tick: state.ticks }
      return { ok: true, skipped: 'closure-poll-dispatched', at, poll, badCandidates: candidates.bad.length }
    }
    state.lastSkip = { reason: 'no-candidates', tick: state.ticks, poll }
    return { ok: true, skipped: 'no-candidates', at, badCandidates: candidates.bad.length, poll }
  }
  if (state.inFlight) {
    state.lastSkip = { reason: 'verify-in-flight', tick: state.ticks }
    return { ok: true, skipped: 'verify-in-flight', at, candidates: candidates.items.length }
  }
  const ballotbox = api.services.get('vmu.ballotbox')
  const turn = api.services.get('vmu.turn')
  let human = null
  try { if (typeof api.services.names === 'function' && api.services.names().includes('vmu.human')) human = api.services.get('vmu.human') } catch (e) { human = null }
  // ★ seated verifier ids from the roster (never guessed names)
  let seatedVerifiers = []
  try {
    const membersSvc = api.services.get('vmu.members')
    if (membersSvc && typeof membersSvc.roster === 'function') {
      for (const m of membersSvc.roster()) {
        if (!m || typeof m !== 'object') continue
        const slot = String(m.slot || m.role || '')
        if (slot !== 'verifier') continue
        if (m.state !== undefined && m.state !== 'live') continue
        seatedVerifiers.push(String(m.id || m.memberId || ''))
      }
      seatedVerifiers = seatedVerifiers.filter((x) => x !== '')
    }
  } catch { seatedVerifiers = [] }
  state.inFlight = true
  const results = []
  try {
    for (const candidate of candidates.items) {
      const advanced = await advanceCandidate({ records, ballotbox, turn, at, settings, state, candidate, human, fidelity, seatedVerifiers })
      results.push({
        target: candidate.id, settled: advanced.settled === true,
        verdict: advanced.verdict === undefined ? (advanced.pendingVerdict === undefined ? null : advanced.pendingVerdict) : advanced.verdict,
        rule: advanced.rule || null, rounds: advanced.rounds === undefined ? null : advanced.rounds,
        code: advanced.code || null, source: advanced.source || null,
        awaitingApproval: advanced.awaitingApproval === true,
        gateId: advanced.gateId || null,
        skipped: advanced.skipped || null,
      })
      if (advanced.ok === false && advanced.code === 'VMU_ENGINE_UNAVAILABLE') break
    }
  } finally {
    state.inFlight = false
  }
  const settledCount = results.filter((r) => r.settled === true).length
  return {
    ok: true, at, candidates: candidates.items.length, settled: settledCount,
    undecided: results.filter((r) => r.settled !== true && r.code === 'VMU_BALLOT_MIN_VOTES_NOT_MET').length,
    awaitingApproval: results.filter((r) => r.awaitingApproval === true).length,
    results,
  }
}

async function onReplyParsed(flat) {
  const api = flat && flat.api
  if (!api || !api.services) return undefined
  const member = str(flat.member)
  const role = str(flat.role)
  if (!isVerifierMember(member) && role !== 'verifier') return undefined
  const reply = flat.reply
  if (!isObject(reply)) return undefined
  const parsedVotes = votesFromReply(reply)
  if (parsedVotes.votes.length === 0 && parsedVotes.malformedCount === 0) return undefined
  const records = api.services.get('vmu.records')
  const state = stateFor(records)
  const at = Number.isFinite(flat.at) ? flat.at : (Number.isFinite(state.lastTickAt) ? state.lastTickAt : null)
  const ballotbox = api.services.names && api.services.names().includes('vmu.ballotbox') ? api.services.get('vmu.ballotbox') : null
  if (parsedVotes.malformedCount > 0) {
    state.malformed += parsedVotes.malformedCount
    writeBody({
      records, track: 'journal', kind: 'state', title: 'v3 投票载体缺字段',
      body: ['- member: ' + member, '- malformed: ' + parsedVotes.malformedCount, '- details: ' + JSON.stringify(parsedVotes.malformed), '- at: ' + timeText(at),
        '- note: 缺字段的票没有被当成一票（不静默丢：本条 journal 是它的审计轨迹）'].join('\n'),
      settled: true, by: 'v3-verify',
    })
  }
  const applied = []
  for (const vote of parsedVotes.votes) {
    const dispatch = state.dispatch
    const target = vote.target || (dispatch ? dispatch.target : '')
    // ★ SLV / TWO-PHASE: a dispatched verifier's reply arrives on a LATER tick, when `state.dispatch` is already null.
    // The active ballot for the target is the durable-in-process link (set when the box was opened), so the vote can
    // still be double-written instead of being mislabelled "no box".
    const activeForTarget = target ? state.active.get(target) : null
    const boxId = dispatch && dispatch.target === target ? dispatch.boxId : (activeForTarget ? activeForTarget.boxId : null)
    const round = vote.round || (dispatch ? dispatch.round : (activeForTarget ? activeForTarget.round : 1))
    if (!target) { state.malformed += 1; continue }
    if (!boxId) {
      // 没有本轮票箱（例如票来自 planner 派的 verifier，或进程重启后）⇒ 记录为"没有箱的票"？不行：
      // 双写要求两半同时成立。这里如实记 journal 并计数，**不**写 votes 轨（不制造只有一半的票）。
      state.malformed += 1
      writeBody({
        records, track: 'journal', kind: 'state', title: 'v3 投票没有对应票箱',
        body: ['- target: ' + target, '- verifier: ' + member, '- at: ' + timeText(at),
          '- note: 该票没有本轮票箱 ⇒ 不写 votes 轨（双写必须两半同时成立）；下一 tick 会为新轮次开箱并重新派发'].join('\n'),
        settled: true, by: 'v3-verify',
      })
      continue
    }
    const res = submitVote({ records, ballotbox, boxId, target, verifier: member, result: vote.result, reason: vote.reason, round, at, by: member })
    if (res.ok === true) { state.votesCast += 1; applied.push(res) } else { state.malformed += 1; state.lastError = { phase: 'vote-write', code: str(res.code), message: str(res.message) } }
  }
  if (applied.length === 0) return undefined
  // 票已双写并落 votes 轨 ⇒ 改写回执（JSON 对象文本），内核不再派发原始 progress 载荷。
  return {
    rewriteResult: JSON.stringify({
      votesAccepted: applied.length,
      normalizedBy: 'v3-verify',
      note: 'the verifier votes were double-written (ballotbox cast + votes track) and replaced before dispatch (K10)',
    }),
  }
}

export const V3_VERIFY_MODULE = Object.freeze({
  meta: Object.freeze({ id: 'v3-verify', apiVersion: 1 }),
  // trigger-workflow：解锁 api.services（vmu.records / vmu.ballotbox / vmu.turn）。
  // rewrite-result：K10（return { rewriteResult } 需要它；非 JSON 对象文本会被内核具名拒）。
  capabilities: Object.freeze(['trigger-workflow', 'rewrite-result']),
  hooks: Object.freeze({
    [V3_TICK_TOPIC]: onTick,
    'turn/reply-parsed': onReplyParsed,
  }),
})

export default V3_VERIFY_MODULE

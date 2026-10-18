// tests/vmu-v3-gates.test.mjs — PHASE 6 / **P0-8（人工门 manual mode）**。
//
// 这张卡要证明的不是"写了个 gate 模块"，而是下面这些【都会失败】的事实：
//
//   ① **判定是纯函数**：`gateDecision({kind,mode,approval})` 的真值表——auto 直通；manual 无批准 ⇒ pending；
//      批准 ⇒ allowed；拒绝 ⇒ rejected；**未知 mode / 未知 kind 一律 fail-closed**（拼错不能变成自动放行）。
//   ② **manual 下三类动作都不执行**：plan / verdict / method-promote 各判一次 ⇒ 全部 allow:false，
//      执行器调用次数 **0**，pending **恰 3 条**，且在 records 的 `journal` 轨上看得见（kind `decision`）。
//   ③ **跨 tick 存活**：模块的 tick 处理器跑过之后 pending 仍是 3（既没丢也没被执行），回执里报出条数。
//   ④ **approve 一条 ⇒ 只那一条生效**：执行器被调 **恰 1 次**，另外两条仍在 pending；记录 rev 递增。
//   ⑤ **切 auto ⇒ 全部放行**：tick 处理器（mode=auto）把剩余 pending 全部落终态，pending 归 0。
//   ⑥ **放行失败也落终态**：执行器抛错的那条 ⇒ status `failed` + 具名 error，其余照常放行；pending 归 0。
//   ⑦ **auto 直通零延迟且零记录**：auto 下 evaluateGate 直接 allow，**一条门记录都不写**。
//   ⑧ **台账不是一个全局单例**：两个内核的 records 各自独立（同一进程里多内核互不污染）。
//
// RULE E：集合类断言先钉**具体条数**，再逐项 for 循环；不用 `.every(` 判可能为空的集合；
// 不把断言塞进条件分支。每条断言在注释里点名"怎样会让它红"。
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

import { createKernel } from '../vibe-math-vmu/kernel/index.js'
import { V3_TICK_TOPIC } from '../vibe-math-vmu/packs/v3/middleware/tick.js'
import { PACK } from '../vibe-math-vmu/packs/v3/index.js'
import {
  V3_GATES_MODULE, GATE_KINDS, GATE_MODES, GATE_TRACK, GATE_RECORD_KIND,
  gateDecision, normaliseGateMode, evaluateGate, createGate, getGate, listGates,
  approveGate, rejectGate, releaseAllGates, registerGateExecutor, clearGateExecutors, v3GatesStatus, cancelGate,
} from '../vibe-math-vmu/packs/v3/middleware/gates.js'

const HERE = dirname(fileURLToPath(import.meta.url))
const VMU = join(HERE, '..', 'vibe-math-vmu')
const DEFAULTS_FILE = join(VMU, 'packs', 'v3', 'settings', 'defaults.json')

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

/** 真实内核（records/human 都是真的）；mode 作为用户层覆盖写进设置。 */
function makeKernel({ mode = 'manual', overrides = {} } = {}) {
  const clockRef = { at: 1000 }
  const kernel = createKernel({
    clock: () => clockRef.at,
    settings: Object.assign(clone(PACK_DEFAULTS), { 'vmu.v3.mode': mode }, overrides),
  })
  return { kernel, records: kernel.records, human: kernel.human, clockRef }
}

/** 一次 tick 的 flat 事件（api 门面由 loader 在真实装配里给；测试里按同一形状伪造）。 */
function fakeTick(records, human, mode, at = 2000) {
  return {
    at,
    api: {
      setting: (k) => (k === 'vmu.v3.mode' ? mode : undefined),
      services: { get: (n) => (n === 'vmu.records' ? records : n === 'vmu.human' ? human : null) },
    },
  }
}

console.log('=== 1. 判定是纯函数：真值表 + fail-closed + 无副作用 ===')
{
  const autoPass = gateDecision({ kind: 'plan', mode: 'auto' })
  ok(autoPass.allow === true && autoPass.outcome === 'auto-pass' && autoPass.code === null,
    '★ mode=auto ⇒ 直通（allow:true / outcome:auto-pass / code:null）', autoPass)
  const pending = gateDecision({ kind: 'verdict', mode: 'manual' })
  ok(pending.allow === false && pending.outcome === 'pending' && pending.gateKind === 'verdict',
    '★ mode=manual 且没人放行 ⇒ pending（allow:false，但不抛错）', pending)
  const approved = gateDecision({ kind: 'verdict', mode: 'manual', approval: { decision: 'allowed' } })
  ok(approved.allow === true && approved.outcome === 'approved',
    '★ manual + 人工批准 ⇒ allow:true / outcome:approved', approved)
  const approvedAlt = gateDecision({ kind: 'method-promote', mode: 'manual', approval: { approved: true } })
  ok(approvedAlt.allow === true && approvedAlt.outcome === 'approved',
    '★ approval 形状宽容：{ approved:true } 也认（不用调用方猜一种形状）', approvedAlt)
  const rejected = gateDecision({ kind: 'plan', mode: 'manual', approval: { decision: 'denied' } })
  ok(rejected.allow === false && rejected.outcome === 'rejected',
    '★ manual + 人工拒绝 ⇒ rejected（allow:false）', rejected)
  const badMode = gateDecision({ kind: 'plan', mode: 'AUTO!' })
  ok(badMode.allow === false && badMode.outcome === 'unknown-mode' && badMode.code === 'VMU_INVALID_ARGUMENT',
    '★★ 未知 mode ⇒ fail-closed（按 manual，绝不因拼错而自动放行）', badMode)
  const missingMode = gateDecision({ kind: 'plan' })
  ok(missingMode.allow === false && missingMode.outcome === 'unknown-mode',
    '★★ 不传 mode ⇒ 同样 fail-closed（"忘了传"不能变成"自动放行"）', missingMode)
  const badKind = gateDecision({ kind: 'nope', mode: 'auto' })
  ok(badKind.allow === false && badKind.outcome === 'unknown-kind',
    '★★ 未知门类 ⇒ fail-closed（门类拼错也不能静默通过，即使 mode=auto）', badKind)
  const junkApproval = gateDecision({ kind: 'plan', mode: 'manual', approval: { decision: 'maybe' } })
  ok(junkApproval.allow === false && junkApproval.outcome === 'pending',
    '★ 不可读的 approval 形状 ⇒ 仍然 pending（不猜成放行）', junkApproval)
  // 纯函数：同一输入两次结果深相等；且不写任何记录（这里连 records 都没有）。
  const a = JSON.stringify(gateDecision({ kind: 'solver', mode: 'manual' }))
  const b = JSON.stringify(gateDecision({ kind: 'solver', mode: 'manual' }))
  ok(a === b && GATE_KINDS.length === 3 && GATE_MODES.length === 2 && normaliseGateMode('manual').mode === 'manual',
    '★ 纯函数（同输入同输出；三类门 / 两种模式是冻结常量）', { a, b })
}

console.log('=== 2. manual ⇒ 三类动作都不执行，pending 可见（records 台账） ===')
const h1 = makeKernel({ mode: 'manual' })
const calls = []
for (const k of GATE_KINDS) registerGateExecutor(h1.records, k, async (gate) => { calls.push({ kind: gate.kind, gateId: gate.gateId }) })
let gateIds = []
{
  const seats = []
  for (const kind of GATE_KINDS) {
    const r = await evaluateGate({ records: h1.records, human: h1.human, at: 1100, mode: 'manual', kind, subject: kind + '-subject', why: 'P0-8 manual test' })
    seats.push(r)
    gateIds.push(r.gateId)
  }
  // 三类都不执行：allow 全 false、pending 全 pending、执行器 0 次。
  let allowTrue = 0
  let pendingCount = 0
  for (const r of seats) { if (r.allow === true) allowTrue++; if (r.decision && r.decision.outcome === 'pending') pendingCount++ }
  ok(allowTrue === 0 && pendingCount === 3, '★★ manual：三类动作 allow 全为 false，且都判为 pending（一条都不放行）', { allowTrue, pendingCount })
  ok(calls.length === 0, '★★ manual：执行器调用 **0 次**（"排队但不执行"不是说说）', calls)
  const ledger = listGates({ records: h1.records })
  ok(ledger.counts.pending === 3 && ledger.pending.length === 3,
    '★★ pending 台账恰 3 条（plan／verdict／method-promote 各一）', ledger.counts)
  const kinds = ledger.pending.map((g) => g.kind).sort()
  ok(kinds.join(',') === GATE_KINDS.slice().sort().join(','),
    '★ 台账里的门类就是三类（不是只有一类被记下来）', kinds)
  const heads = h1.records.list({ track: GATE_TRACK, limit: 0 }).items.filter((h) => h.kind === GATE_RECORD_KIND)
  ok(heads.length === 3,
    '★★ 台账落在 records 的 journal 轨、kind=decision（list 直接看得见 3 个 head；放内存里就看不见）', heads.length)
  ok(ledger.resolved.length === 0 && ledger.bad.length === 0,
    '★ 初态没有已终结门、没有坏记录（坏记录会被点名，不静默）', { resolved: ledger.resolved.length, bad: ledger.bad.length })
}

console.log('=== 3. 跨 tick 存活：tick 处理器看过之后 pending 仍是 3，且回执可读 ===')
{
  const receipt = await V3_GATES_MODULE.hooks[V3_TICK_TOPIC](fakeTick(h1.records, h1.human, 'manual', 1200))
  const ledger = listGates({ records: h1.records })
  ok(receipt && receipt.ok === true && receipt.mode === 'manual' && receipt.pendingBefore === 3 && receipt.pendingAfter === 3,
    '★★ manual 的 tick 回执报出 pending 3→3（"还在等"是可见的，不是静默）', receipt)
  ok(receipt.released === null && calls.length === 0,
    '★★ manual 的 tick 不放行任何东西、不调执行器（released:null）', { released: receipt.released, calls: calls.length })
  ok(ledger.counts.pending === 3,
    '★★ 跨 tick 存活：台账还在 records 里，3 条 pending 一条没丢（不是模块内存里的临时数组）', ledger.counts.pending)
  const rec = h1.records.get({ id: gateIds[0] })
  ok(rec && rec.tags.includes(GATE_RECORD_KIND === 'decision' ? 'gate-status:pending' : '') && /gate-status:pending/.test(rec.tags.join(',')),
    '★ 记录的 tags 带 gate-status:pending（head 列表不看正文也能先筛状态）', rec && rec.tags)
}

console.log('=== 4. approve 一条 ⇒ 只那一条生效（其余仍 pending） ===')
let seqAfterApprove = null
{
  const before = getGate({ records: h1.records, gateId: gateIds[0] })
  const r = await approveGate({ records: h1.records, human: h1.human, at: 1300, gateId: gateIds[0], by: 'office', reason: 'plan approved in test' })
  seqAfterApprove = gateIds[0]
  ok(r.ok === true && r.executed === true && r.gate && r.gate.status === 'released' && r.gate.executed === true,
    '★★ approve 一条 ⇒ 该门 terminated released 且 executed:true（不是只改标记不执行）', r && r.gate && r.gate.status)
  ok(calls.length === 1 && calls[0].gateId === gateIds[0] && calls[0].kind === 'plan',
    '★★ 执行器被调 **恰 1 次**，且就是被批准的那一条（plan）', calls)
  // 反空断言：同一个执行器在放行时**确实会**被调 ⇒ §2 的 0 次是"没执行"，不是"执行器压根不可用"。
  ok(calls.length > 0, '★ 反空断言：执行器是可调用的（放行时被调过），所以"manual 下 0 次"不是空断言', calls.length)
  const ledger = listGates({ records: h1.records })
  ok(ledger.counts.pending === 2 && ledger.counts.byStatus.released === 1,
    '★★ 其余两条仍在 pending（总数 3 = pending 2 + released 1）', ledger.counts)
  ok(r.gate.rev > before.rev,
    '★ 终态写回同一条记录：rev 递增（rev ' + before.rev + ' → ' + r.gate.rev + '），不是新建一条掩盖历史', r.gate.rev)
  const again = await approveGate({ records: h1.records, gateId: gateIds[0] })
  ok(again.ok === false && again.code === 'VMU_STATE',
    '★ 已终结的门不可重复放行（VMU_STATE，而不是静默二次执行）', again)
}

console.log('=== 5. 拒绝一条：终态 rejected，不执行 ===')
{
  const beforeCalls = calls.length
  const r = rejectGate({ records: h1.records, human: h1.human, at: 1400, gateId: gateIds[1], by: 'office', reason: 'verdict rejected in test' })
  ok(r.ok === true && r.gate.status === 'rejected' && r.executed === false,
    '★ 拒绝 ⇒ 终态 rejected、executed:false', r.gate.status)
  ok(calls.length === beforeCalls, '★★ 拒绝不执行（执行器次数不变）', calls.length)
  const ledger = listGates({ records: h1.records })
  ok(ledger.counts.pending === 1 && ledger.counts.byStatus.rejected === 1,
    '★ 拒绝后 pending 只剩 method-promote 一条', ledger.counts)
}

console.log('=== 6. 切回 auto ⇒ 全部放行（tick 驱动；失败也落终态） ===')
{
  // 把 mode 覆盖成 auto 的"同一个内核"：模块每 tick 从设置读模式，这里直接给 fake api 的 setting 返回 auto。
  const receipt = await V3_GATES_MODULE.hooks[V3_TICK_TOPIC](fakeTick(h1.records, h1.human, 'auto', 1500))
  const ledger = listGates({ records: h1.records })
  ok(receipt && receipt.mode === 'auto' && receipt.pendingBefore === 1 && receipt.pendingAfter === 0,
    '★★ 切 auto ⇒ 剩余 pending 全部落终态（回执 1→0）', receipt)
  ok(ledger.counts.pending === 0,
    '★★ 不再有任何 pending（"切回 auto 时自动放行"不是口号）', ledger.counts)
  const releasedKinds = receipt.released ? receipt.released.outcomes.map((o) => o.kind) : []
  ok(receipt.released && receipt.released.released === 1 && releasedKinds.join(',') === 'method-promote' && calls.length === 2,
    '★ 放行的是 method-promote 那条，执行器恰被再调 1 次（总计 2 次）', { released: receipt.released, calls })
  // 幂等：再跑一次 auto tick，没有 pending ⇒ 不释放、不执行。
  const beforeCalls = calls.length
  const receipt2 = await V3_GATES_MODULE.hooks[V3_TICK_TOPIC](fakeTick(h1.records, h1.human, 'auto', 1600))
  ok(receipt2.pendingBefore === 0 && receipt2.released === null && calls.length === beforeCalls,
    '★ auto 且无 pending ⇒ 无事可做（released:null、执行器次数不变）', receipt2)
}

console.log('=== 7. 放行失败 ⇒ 落终态且可查（不留悬空 pending） ===')
const h2 = makeKernel({ mode: 'manual' })
{
  registerGateExecutor(h2.records, 'plan', async () => { /* 成功 */ })
  registerGateExecutor(h2.records, 'verdict', async () => { const e = new Error('dispatch refused by test executor'); e.code = 'VMU_ENGINE_UNAVAILABLE'; throw e })
  const g1 = await evaluateGate({ records: h2.records, human: h2.human, at: 2100, mode: 'manual', kind: 'plan', subject: 'p-ok' })
  const g2 = await evaluateGate({ records: h2.records, human: h2.human, at: 2101, mode: 'manual', kind: 'verdict', subject: 'v-bad' })
  // 让 tick 处理器批量放行（无显式 execute ⇒ 用注册的执行器）。
  const receipt = await V3_GATES_MODULE.hooks[V3_TICK_TOPIC](fakeTick(h2.records, h2.human, 'auto', 2200))
  ok(receipt.released && receipt.released.released === 1 && receipt.released.failed === 1 && receipt.pendingAfter === 0,
    '★★ 放行失败也落终态：1 released + 1 failed，pending 归 0（绝不留悬空 pending）', receipt.released)
  const failedGate = getGate({ records: h2.records, gateId: g2.gateId })
  ok(failedGate && failedGate.status === 'failed' && failedGate.executed === false && failedGate.error && failedGate.error.code === 'VMU_ENGINE_UNAVAILABLE',
    '★★ 失败的门可查：status=failed、executed=false、带具名 error.code（不是静默吞掉）', failedGate && failedGate.error)
  const ledger = listGates({ records: h2.records })
  ok(ledger.counts.pending === 0 && ledger.counts.byStatus.failed === 1 && ledger.counts.byStatus.released === 1,
    '★ 台账计数：released 1 / failed 1 / pending 0', ledger.counts)
  ok(listGates({ records: h2.records, status: 'failed' }).resolved.length === 1 &&
    listGates({ records: h2.records, status: 'released' }).resolved.length === 1,
    '★ 按状态过滤能分别查出 failed 与 released（list 是真正的可查面）', ledger.counts.byStatus)
  // 失败不可重放：终态门 approve 会被 VMU_STATE 拒。
  const re = await approveGate({ records: h2.records, gateId: g2.gateId })
  ok(re.ok === false && re.code === 'VMU_STATE',
    '★ 已失败的门不会因为再 approve 一次而"变成功"（终态不可重放）', re)
}

console.log('=== 7b. 批准了但没有执行器 ⇒ 终态 failed（"没执行"绝不能伪装成"已放行"） ===')
const h4 = makeKernel({ mode: 'manual' })
{
  const g1 = await evaluateGate({ records: h4.records, human: h4.human, at: 2500, mode: 'manual', kind: 'plan', subject: 'no-executor-plan' })
  const g2 = await evaluateGate({ records: h4.records, human: h4.human, at: 2501, mode: 'manual', kind: 'verdict', subject: 'no-executor-verdict' })
  const one = await approveGate({ records: h4.records, human: h4.human, at: 2502, gateId: g1.gateId, by: 'office' })
  ok(one.ok === false && one.gate.status === 'failed' && one.gate.executed === false && one.gate.error && one.gate.error.code === 'VMU_ENGINE_UNAVAILABLE',
    '★★ 没有执行器时 approve ⇒ 终态 failed + 具名 error（不是 released、不是 pending）', one && one.gate && one.gate.status)
  const rest = await releaseAllGates({ records: h4.records, human: h4.human, at: 2503 })
  ok(rest.pendingBefore === 1 && rest.failed === 1 && rest.released === 0 && rest.unexecuted === 1 && rest.pendingAfter === 0,
    '★★ 批量放行时同样：没有执行器 ⇒ failed 终态，pending 归 0（不留悬空）', rest)
  const ledger = listGates({ records: h4.records })
  ok(ledger.counts.pending === 0 && ledger.counts.byStatus.failed === 2,
    '★ 两条都查得到 failed（list 的 byStatus 计数 = 2）', ledger.counts)
  // 人性面缺省时也要能排队：不传 human，门照样落 records（镜像只是尽力而为）。
  const g3 = await evaluateGate({ records: h4.records, at: 2504, mode: 'manual', kind: 'method-promote', subject: 'no-human' })
  ok(g3.allow === false && g3.gate && g3.gate.status === 'pending' && g3.gate.approvalId === g3.gateId,
    '★ 不传人性面也能排队（approvalId 回落到门 id，台账仍是权威）', g3 && g3.gate && g3.gate.status)
  rejectGate({ records: h4.records, at: 2505, gateId: g3.gateId, by: 'office', reason: 'cleanup' })
}

console.log('=== 8. auto 直通：零延迟、零门记录 ===')
const h3 = makeKernel({ mode: 'auto' })
{
  const before = listGates({ records: h3.records }).counts.total
  const r = await evaluateGate({ records: h3.records, human: h3.human, at: 3000, mode: 'auto', kind: 'plan', subject: 'auto-plan' })
  const after = listGates({ records: h3.records }).counts.total
  ok(r.allow === true && r.decision.outcome === 'auto-pass' && r.gate === null,
    '★★ auto ⇒ 直接放行（allow:true / auto-pass / 无门对象）', r)
  ok(before === 0 && after === 0,
    '★★ auto 下不写任何门记录（零延迟 = 零台账开销；手动门不是必经之路）', { before, after })
  ok(h3.records.list({ track: GATE_TRACK, limit: 0 }).items.length === 0,
    '★ journal 轨在 auto 直通后仍是空的（没有"先记一笔再说"的假排队）')
}

console.log('=== 9. 人性面镜像：vmu.human 的审批态与门一一对应 ===')
{
  const hs = makeKernel({ mode: 'manual' })
  const g = await evaluateGate({ records: hs.records, human: hs.human, at: 4000, mode: 'manual', kind: 'method-promote', subject: 'm-abc' })
  const stPending = hs.human.approvalState({ requestId: g.gateId })
  ok(stPending && stPending.state === 'pending' && stPending.id === g.gateId,
    '★ 开 pending 门时镜像出一条 vmu.human 审批（requestId 就是门 id）', stPending && stPending.state)
  await rejectGate({ records: hs.records, human: hs.human, at: 4001, gateId: g.gateId, by: 'office', reason: 'mirror-test' })
  const stDenied = hs.human.approvalState({ requestId: g.gateId })
  ok(stDenied && stDenied.state === 'denied',
    '★ 拒绝镜像到人性面（human 面 state=denied），台账与人性面不打架', stDenied && stDenied.state)
}

console.log('=== 10. 台账不是全局单例：两个内核各自独立 ===')
{
  const ka = makeKernel({ mode: 'manual' })
  const kb = makeKernel({ mode: 'manual' })
  await evaluateGate({ records: ka.records, human: ka.human, at: 5000, mode: 'manual', kind: 'plan', subject: 'a' })
  ok(listGates({ records: ka.records }).counts.pending === 1 && listGates({ records: kb.records }).counts.pending === 0,
    '★★ 台账按 records 句柄隔离：内核 A 的门不会出现在内核 B 的 list 里', { a: listGates({ records: ka.records }).counts.pending, b: listGates({ records: kb.records }).counts.pending })
  ok(GATE_TRACK === 'journal' && GATE_RECORD_KIND === 'decision',
    '★ 落点是既有的 journal 轨 + decision kind（不新增轨/kind，也不改值层）')
  const st = v3GatesStatus()
  ok(st && st.track === GATE_TRACK && st.kinds.length === 3 && typeof st.counts.created === 'number',
    '★ v3GatesStatus() 可读（诊断面；持久事实仍以 listGates 为准）', st && st.counts)
}

console.log('=== 11. 模块形状：可被 pack 清单装载（meta/apiVersion/capabilities/钩子） ===')
{
  ok(V3_GATES_MODULE && V3_GATES_MODULE.meta && V3_GATES_MODULE.meta.id === 'v3-gates' && V3_GATES_MODULE.meta.apiVersion === 1,
    '★ meta.id=v3-gates、apiVersion=1（loader 的 validateModule 要求）')
  ok(Array.isArray(V3_GATES_MODULE.capabilities) && V3_GATES_MODULE.capabilities.includes('trigger-workflow'),
    '★ 声明 trigger-workflow（否则 api.services.get 会被 loader 具名拒）', V3_GATES_MODULE.capabilities)
  const hooks = Object.keys(V3_GATES_MODULE.hooks || {})
  ok(hooks.length === 1 && hooks[0] === V3_TICK_TOPIC && typeof V3_GATES_MODULE.hooks[V3_TICK_TOPIC] === 'function',
    '★ 唯一个钩子是已声明的 v3/tick（挂一个假钩子不如不挂）', hooks)
  // 模块是冻结声明：外部改不动（loader 会拒绝被改写的声明）。
  ok(Object.isFrozen(V3_GATES_MODULE) && Object.isFrozen(V3_GATES_MODULE.hooks),
    '★ 模块声明是冻结对象（装配期不被后手改写）')
  // P0-8 的最后一步：**真的挂进清单**（module 形状、order 在 tick 消费者末尾、只在 v3/tick 上）。
  const entries = Array.isArray(PACK.middleware) ? PACK.middleware : []
  const myEntry = entries.find((e) => e && e.id === 'v3-gates')
  ok(myEntry !== undefined && myEntry.module === V3_GATES_MODULE,
    '★★ 清单里有 v3-gates 条目且携带同一个 module 对象（"能装载"与"已装载"是两件事）', entries.map((e) => e && e.id))
  ok(myEntry && myEntry.order === 125 && myEntry.capabilities.includes('trigger-workflow') && myEntry.failure === 'open',
    '★ 条目形状：order 125（最后一个 tick 消费者）、trigger-workflow、failure=open', myEntry && { order: myEntry.order, caps: myEntry.capabilities, failure: myEntry.failure })
  clearGateExecutors(h3.records)
  ok(listGates({ records: h3.records }).counts.total === 0,
    '★ clearGateExecutors 只清注册表、不动台账（records 是事实源）')
}

console.log('=== 12. 未决门可以【取消】（半成品对：不再是 approve/reject 二选一） ===')
{
  const hc = makeKernel({ mode: 'manual' })
  const g = await evaluateGate({ records: hc.records, human: hc.human, at: 6000, mode: 'manual', kind: 'plan', subject: 'cancel-me' })
  ok(listGates({ records: hc.records }).counts.pending === 1, 'the gate starts pending', listGates({ records: hc.records }).counts.pending)
  let noReason = null
  try { cancelGate({ records: hc.records, gateId: g.gateId }) } catch (e) { noReason = e }
  ok(noReason && noReason.code === 'VMU_INVALID_ARGUMENT', 'cancel without a reason is refused by name (a withdrawal must say why)', noReason && noReason.code)
  const cancelled = cancelGate({ records: hc.records, human: hc.human, gateId: g.gateId, by: 'office', reason: 'superseded by a new plan' })
  ok(cancelled.ok === true && cancelled.gate.status === 'cancelled' && cancelled.executed === false,
    'cancel lands the terminal status cancelled, and NOTHING was executed', cancelled.gate && cancelled.gate.status)
  const back = getGate({ records: hc.records, gateId: g.gateId })
  ok(back && back.status === 'cancelled' && back.reason === 'superseded by a new plan' && back.decidedBy === 'office',
    'the cancelled gate is READABLE afterwards (status + reason + who)', back && { status: back.status, reason: back.reason, by: back.decidedBy })
  ok(listGates({ records: hc.records }).counts.pending === 0,
    'it no longer blocks: the pending list is empty after the cancel', listGates({ records: hc.records }).counts.pending)
  // The human mirror must not stay pending after a withdrawal (a phantom approval would look actionable).
  const humanState = hc.human.approvalState({ requestId: g.gateId })
  ok(humanState && humanState.state === 'withdrawn',
    'the withdrawal is mirrored to the human face with the SAME vocabulary (state=withdrawn), not left pending', humanState && humanState.state)
  const again = cancelGate({ records: hc.records, gateId: g.gateId, reason: 'twice' })
  ok(again && again.ok === false && again.code === 'VMU_STATE', 'a terminal gate cannot be cancelled twice', again && again.code)
  const approveAfter = await approveGate({ records: hc.records, gateId: g.gateId })
  ok(approveAfter.ok === false && approveAfter.code === 'VMU_STATE',
    'and a cancelled gate cannot be approved afterwards (terminal means terminal)', approveAfter.code)
}

console.log('')
console.log('=== V3 GATES (P0-8): ' + passed + ' passed, ' + failed + ' failed ===')
if (failures.length > 0) for (const f of failures) console.error('  - ' + f)
process.exit(failed === 0 ? 0 : 1)

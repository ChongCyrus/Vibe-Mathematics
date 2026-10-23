// tests/vmu-paper-consult-tool.test.mjs — PHASE 12 / E4: THE OFFICE CONSULT NEEDS A REACHABLE ANSWERING DOOR.
//
// THE DEFECT THIS PINS (the quieter half of red line ④, "没有消费者就不给机制"): `kit/paper.js` grew the pre-finalisation
// consult — `consultGate` arms on `vmu.paper.officeConsult="required"`, `recordFinal` refuses without an answer, and
// `recordConsult`/`consultState` were exported and unit-tested (`tests/vmu-paper-office-consult.test.mjs` calls the
// subsystem DIRECTLY). But `vibe_v5_paper`'s action table only had start/part/review/advance/final/render/status/compile/
// sections, so in a REAL session nobody could answer: the gate could only ever time out. A mechanism whose only caller is
// a test is dead in production — the test proves the code works, not that the institution can use it.
//
// WHAT THIS SUITE ASSERTS, on the REAL entry (`packs:['v5r']`, a real kernel, real records, the host's own refusal
// receipts — every refusal is READ BACK as the serialized `{ok:false, code, message, hint}` the caller actually gets):
//   · §0 the two actions exist in the DEPLOYED schema (not just in a comment) and only because the pack declares them;
//   · §1 a paper walked to `awaiting-editor` has its `final` REFUSED BY NAME, and the refusal names the consult request;
//   · §2 `consult_state` can read that request back (the ledger used to be write-only from the tool face: a stale id and
//        a typo looked identical);
//   · §3 a member who is not the declared answerer is refused BY NAME — and refusing does not consume the request;
//   · §4 a member id that does not exist cannot claim to be the office;
//   · §5 a WRONG request id is refused, and the hint lists what is really waiting (never "answer whichever is open");
//   · §6 `decision` is not silently ignored: it is refused, because the answer is free text (no second vocabulary);
//   · §7 the office answers through the TOOL, and the answer is read back from the reader (not from the write receipt);
//   · §8 the SAME `final` that was refused now goes through, and the receipt says WHICH way the rule was satisfied
//        ("answered"), so "finalized" cannot quietly mean "nobody checked";
//   · §9 an unknown paper is refused by the flow's own code, not invented here;
//   · §10 answering when nothing is waiting is reported HONESTLY (`cleared:false`), not as if a question was closed.
//
// RULE E: every list assertion declares NON-EMPTY first. Every "it worked" is read back from the kernel/records — a
// receipt is not evidence that a mechanism ran.
// Run: node tests/vmu-paper-consult-tool.test.mjs   Last line: === VMU PAPER CONSULT TOOL: N passed, M failed ===
import { mkdtemp, rm } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..')
const ENTRY = join(REPO, 'vibe-math-vmu', 'vibe-math-vmu.js')

let passed = 0
let failed = 0
const failures = []
const ok = (cond, label, detail) => {
  if (cond) { passed++; console.log('  ok   ' + label); return true }
  failed++; failures.push(label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  console.error('  FAIL ' + label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  return false
}
const eq = (actual, expected, label) => ok(actual === expected, label, actual)

const entry = await import(pathToFileURL(ENTRY).href)

const boot = async (config = {}) => {
  const state = { specs: [], effects: [] }
  const ctx = {
    effect(fn, label) { state.effects.push(label); return fn() },
    on() { return () => {} },
    tools: { register: async (spec) => { state.specs.push(spec); return () => {} } },
  }
  const handle = entry.apply(ctx, Object.assign({ clock: () => 1000 }, config))
  await handle.ready()
  return { handle, state, names: state.specs.map((s) => s.name), specOf: (n) => state.specs.find((s) => s.name === n) }
}
/**
 * Call a pack tool EXACTLY the way the host does and return what the CALLER sees: a named refusal arrives as a
 * serialized `{ok:false, code, message, hint}` receipt (host.js:1122 — the refusal path drops any extra field hung on
 * the Error, which is why the assertions below check `message`/`hint` for the ledger facts instead of `e.requestId`).
 */
const receipt = async (b, name, args = {}) => {
  const spec = b.specOf(name)
  if (!spec) return { raw: undefined, parsed: undefined, missing: true }
  const raw = await spec.execute(args, {})
  let parsed
  try { parsed = JSON.parse(raw) } catch { parsed = undefined }
  return { raw, parsed, missing: false }
}
const codeOf = (parsed) => (parsed && parsed.code) || null
const REQUEST_ID = /consult-[A-Za-z0-9_-]+-\d+/g

const base = await mkdtemp(join('D:/_tmp', 'vmu-paper-consult-tool-'))
try {
  // ── 0. THE FACE EXISTS, AND IT EXISTS BECAUSE THE PACK DECLARES IT ────────────────────────────────────────────
  console.log('=== 0. ZERO MECHANISM: NO PACK ⇒ NO PAPER FACE; WITH v5r ⇒ consult/consult_state IN THE DEPLOYED SCHEMA ===')
  const bare = await boot({ root: join(base, 'bare') })
  ok(!bare.names.includes('vibe_v5_paper'),
    '★★ 反(零机制)：没有 pack 就没有 vibe_v5_paper —— 这个面是 v5r 声明出来的，不是内核默认给的', bare.names.length)

  const v5rBoot = await boot({ root: join(base, 'v5r'), packs: ['v5r'] })
  ok(v5rBoot.names.includes('vibe_v5_paper'),
    '★★ 正：packs:["v5r"] 时 vibe_v5_paper 注册进宿主（捕获 register，不是读源码猜的）', v5rBoot.names.length)
  const kernel = v5rBoot.handle.kernel

  const paperSpec = v5rBoot.specOf('vibe_v5_paper')
  const props = paperSpec && paperSpec.parameters && paperSpec.parameters.properties ? paperSpec.parameters.properties : {}
  const propNames = Object.keys(props)
  ok(propNames.length > 0, '前置(RULE E)：宿主真正发布的参数表非空', propNames.length)
  ok(typeof props.action === 'string' || (props.action && typeof props.action.type === 'string'),
    '★★ 正：action 在部署的 schema 里（start/part/…/consult/consult_state 是同一扇门的不同动作）', props.action)
  const actionDoc = String((props.action && props.action.description) || '')
  ok(/consult/.test(actionDoc) && /consult_state/.test(actionDoc),
    '★★★ 正：action 的 schema 描述里【同时】有 consult 与 consult_state —— 所办答复与只读台账都进了真实发布的工具面', actionDoc)
  ok(typeof props.request_id === 'object' && typeof props.answer === 'object' && typeof props.by === 'object',
    '★ 正：request_id / answer / by 三个参数在 schema 里（答复要能指到那条问询、要有正文、要有答复人）',
    ['request_id', 'answer', 'by'].filter((n) => typeof props[n] === 'object'))
  ok(/PAPER_CONSULT_ROLES/.test(String(paperSpec.description || '')),
    '★★ 正：工具描述点名 PAPER_CONSULT_ROLES —— 「谁能答复」是 pack 声明的事实，不是内核猜的角色', String(paperSpec.description || '').slice(0, 60))

  // ── 1. WALK A REAL PAPER TO awaiting-editor, THEN THE GATE REFUSES BY NAME ─────────────────────────────────────
  console.log('=== 1. 走到 awaiting-editor：final 被【具名】拦住，并点名那条问询 ===')
  const ACAD = 'acad'
  const OFFICE = 'office'
  const R1 = 'r-1'
  // hire() is async — an unawaited call leaves the roster empty and every later assertion would "pass" against a world
  // with no members at all (the RULE E failure mode: green because nothing exists).
  await kernel.members.hire({ id: ACAD, slot: 'chair' })
  await kernel.members.hire({ id: OFFICE, slot: 'member' })
  await kernel.members.hire({ id: R1, slot: 'member' })
  const rosterNow = kernel.members.roster().map((m) => m.id)
  ok([ACAD, OFFICE, R1].every((id) => rosterNow.includes(id)) && rosterNow.length >= 3,
    '前置(RULE E)：三个真实成员在位（下面读的都是真记录、真台账）', rosterNow)

  const T = 'pc1'
  const started = await receipt(v5rBoot, 'vibe_v5_paper', { action: 'start', target: T, participants: [ACAD, R1] })
  ok(started.parsed && started.parsed.ok === true && started.parsed.started && started.parsed.started.status === 'writing',
    '★ 正：start 建出论文并进入 writing', started.parsed && started.parsed.started)
  const part = await receipt(v5rBoot, 'vibe_v5_paper', {
    action: 'part', target: T, member: ACAD, part: '第一部分', solution: '测试用的解法正文',
  })
  ok(part.parsed && part.parsed.ok === true && part.parsed.part && part.parsed.part.ok === true,
    '★ 正：part 记下一份写作（参与者在写）', part.parsed && part.parsed.part)
  const adv1 = await receipt(v5rBoot, 'vibe_v5_paper', { action: 'advance', target: T })
  ok(adv1.parsed && adv1.parsed.advance && adv1.parsed.advance.to === 'reviewing',
    '★ 正：advance 把 writing 推进到 reviewing', adv1.parsed && adv1.parsed.advance)
  for (const member of [ACAD, R1]) {
    const rv = await receipt(v5rBoot, 'vibe_v5_paper', { action: 'review', target: T, member, deliverable: true, notes: '可交付' })
    ok(rv.parsed && rv.parsed.ok === true && rv.parsed.review && rv.parsed.review.deliverable === true,
      '★ 正：' + member + ' 的互审 deliverable:true 记下（未表态不算可交付）', rv.parsed && rv.parsed.review)
  }
  const adv2 = await receipt(v5rBoot, 'vibe_v5_paper', { action: 'advance', target: T })
  ok(adv2.parsed && adv2.parsed.advance && adv2.parsed.advance.to === 'awaiting-editor',
    '★ 正：全体一致 ⇒ advance 到 awaiting-editor（定稿前的门口）', adv2.parsed && adv2.parsed.advance)

  const beforeFinal = await receipt(v5rBoot, 'vibe_v5_paper', { action: 'status', target: T })
  ok(beforeFinal.parsed && beforeFinal.parsed.paper && beforeFinal.parsed.paper.status === 'awaiting-editor',
    '★ 读回：状态真的是 awaiting-editor（不是回执自报）', beforeFinal.parsed && beforeFinal.parsed.paper)

  const finalBlocked = await receipt(v5rBoot, 'vibe_v5_paper', {
    action: 'final', target: T, member: ACAD, decision: 'deliverable', note: '定稿', body: '结论',
  })
  eq(codeOf(finalBlocked.parsed), 'VMU_OFFICE_CONSULT_REQUIRED',
    '★★★ 正(缺陷已修的那一半)：定稿被【具名】拦住 —— 闸真的在真机上跑了，而不是只在单元测试里跑')
  const blockMsg = String((finalBlocked.parsed && finalBlocked.parsed.message) || '')
  const idHits = blockMsg.match(REQUEST_ID) || []
  ok(/所办/.test(blockMsg) && idHits.length > 0,
    '★★★ 正：拒绝消息点名「所办」并给出这条问询的 id —— 调用者不必解析中文才知道要答哪条', blockMsg)
  const reqId = idHits[0]
  ok(/recordConsult/.test(String((finalBlocked.parsed && finalBlocked.parsed.hint) || '')),
    '★ 正：hint 指向下一步（recordConsult / 或把 officeConsult 设 off）', finalBlocked.parsed && finalBlocked.parsed.hint)
  const afterBlock = await receipt(v5rBoot, 'vibe_v5_paper', { action: 'status', target: T })
  ok(afterBlock.parsed && afterBlock.parsed.paper && afterBlock.parsed.paper.status === 'awaiting-editor',
    '★★ 正：被拒之后论文【原地不动】（闸在写状态之前跑；除了它刚刚打开的那条持久问询）',
    afterBlock.parsed && afterBlock.parsed.paper)

  // ── 2. THE LEDGER IS NOW READABLE (it used to be write-only from the tool face) ────────────────────────────────
  console.log('=== 2. consult_state 只读台账：谁在等、哪条 id 还开着 ===')
  const state1 = await receipt(v5rBoot, 'vibe_v5_paper', { action: 'consult_state', target: T })
  const cs1 = state1.parsed && state1.parsed.consult
  ok(cs1 && cs1.ok === true, '★ 正：consult_state 可读', state1.parsed)
  eq(cs1 && cs1.armed, true, '★ 读回：闸是 armed（v5r 声明 officeConsult="required"）')
  eq(cs1 && cs1.awaiting && cs1.awaiting.id, reqId, '★★ 读回：正等着的那条 id 与 final 拒绝消息里的一致')
  ok(cs1 && Array.isArray(cs1.requests) && cs1.requests.length === 1 && cs1.requests[0].status === 'awaiting',
    '★★ 正：台账恰好一条、状态 awaiting（不是"有记录"就算）', cs1 && cs1.requests)
  eq(cs1 && cs1.counters && cs1.counters.opened, 1, '★ 读回：计数器 opened=1')
  ok(cs1 && cs1.policy && Array.isArray(cs1.policy.answerRoles) && cs1.policy.answerRoles.includes('office'),
    '★★ 正：台账自己报出「谁能答」＝pack 声明的 answerRoles（不是内核猜的）', cs1 && cs1.policy)

  // ── 3. A MEMBER WHO IS NOT THE DECLARED ANSWERER IS REFUSED BY NAME — AND THE REQUEST SURVIVES ─────────────────
  console.log('=== 3. 普通成员答复：具名拒，且【不消耗】那条问询 ===')
  const byMember = await receipt(v5rBoot, 'vibe_v5_paper', {
    action: 'consult', target: T, member: R1, answer: '我说了算', note: '普通成员越权',
  })
  eq(codeOf(byMember.parsed), 'VMU_NOT_PERMITTED',
    '★★★ 反：普通成员（slot member, id r-1）答复被【具名】拒 —— 所办问询不是谁都能签的字')
  const byMemberMsg = String((byMember.parsed && byMember.parsed.message) || '')
  ok(byMemberMsg.includes(R1) && /office/.test(byMemberMsg),
    '★★ 正：拒绝消息同时点名「谁被拒」与「谁可以」（r-1 与 office）', byMemberMsg)
  const afterMember = await receipt(v5rBoot, 'vibe_v5_paper', { action: 'consult_state', target: T })
  const csAfterMember = afterMember.parsed && afterMember.parsed.consult
  eq(csAfterMember && csAfterMember.awaiting && csAfterMember.awaiting.id, reqId,
    '★★ 正：越权答复之后那条问询仍然开着（拒绝没有副作用）')
  eq(csAfterMember && csAfterMember.counters && csAfterMember.counters.opened, 1,
    '★ 读回：越权答复没有新开第二条问询')
  eq(csAfterMember && csAfterMember.counters && csAfterMember.counters.answered, 0,
    '★ 读回：answered 仍为 0（没有把"被拒的答复"记成答复）')

  // ── 4. A NON-EXISTENT MEMBER CANNOT CLAIM TO BE THE OFFICE ────────────────────────────────────────────────────
  console.log('=== 4. 名册上没有的 id 不能自称所办 ===')
  const byGhost = await receipt(v5rBoot, 'vibe_v5_paper', { action: 'consult', target: T, member: 'r-ghost', answer: '我是所办' })
  eq(codeOf(byGhost.parsed), 'VMU_NO_SUCH_OBJECT',
    '★★ 反：名册外的 id 被具名拒（答复人必须是真实成员，不是字符串"office"）')
  const csAfterGhost = (await receipt(v5rBoot, 'vibe_v5_paper', { action: 'consult_state', target: T })).parsed.consult
  eq(csAfterGhost && csAfterGhost.awaiting && csAfterGhost.awaiting.id, reqId, '★ 读回：问询仍开着')

  // ── 5. A WRONG REQUEST ID IS REFUSED, AND THE HINT LISTS WHAT IS WAITING ──────────────────────────────────────
  console.log('=== 5. 错的 request_id：具名拒，并且【列出】现在在等的那几条 ===')
  const wrongId = 'consult-' + T + '-999'
  const badId = await receipt(v5rBoot, 'vibe_v5_paper', {
    action: 'consult', target: T, member: OFFICE, request_id: wrongId, answer: '答我记忆里的那条',
  })
  eq(codeOf(badId.parsed), 'VMU_NO_SUCH_OBJECT', '★★ 反：答复一条不存在的问询被具名拒（不许"答当时开着的那条"')
  const badIdHint = String((badId.parsed && badId.parsed.hint) || '')
  ok(badIdHint.includes(reqId),
    '★★★ 正：hint 列出真正在等的 id —— 调用者能据此改对，而不用去猜', badIdHint)
  const csAfterBadId = (await receipt(v5rBoot, 'vibe_v5_paper', { action: 'consult_state', target: T })).parsed.consult
  eq(csAfterBadId && csAfterBadId.awaiting && csAfterBadId.awaiting.id, reqId,
    '★ 读回：错 id 之后真正的那条仍开着（工具没有顺手答了它）')

  // ── 6. `decision` IS NOT SILENTLY IGNORED: THE ANSWER IS FREE TEXT, THERE IS NO SECOND ENUM ────────────────────
  console.log('=== 6. consult 不收 decision：拒绝而不是静默丢弃 ===')
  const withDecision = await receipt(v5rBoot, 'vibe_v5_paper', {
    action: 'consult', target: T, member: OFFICE, decision: 'deliverable', answer: '看着没问题',
  })
  eq(codeOf(withDecision.parsed), 'VMU_INVALID_ARGUMENT',
    '★★ 反：把 final 的词（decision）塞给 consult 会被具名拒 —— 本面没有第二套词表')
  ok(/decision/.test(String((withDecision.parsed && withDecision.parsed.message) || '')),
    '★ 正：拒绝消息点名 decision', withDecision.parsed && withDecision.parsed.message)

  // ── 7. THE OFFICE ANSWERS THROUGH THE TOOL, AND THE ANSWER IS READ BACK ───────────────────────────────────────
  console.log('=== 7. 所办经【工具】答复，并从读面把答复读回来 ===')
  const answered = await receipt(v5rBoot, 'vibe_v5_paper', {
    action: 'consult', target: T, member: OFFICE, request_id: reqId, answer: '核对了解法与结论，可定稿', note: '办公室核对',
  })
  const ans = answered.parsed && answered.parsed.consult
  ok(answered.parsed && answered.parsed.ok === true, '★★★ 正：所办经工具面答复成功', answered.parsed)
  eq(ans && ans.requestId, reqId, '★ 读回：答复的正是那条在等的问询')
  eq(ans && ans.cleared, true, '★★ 正：cleared=true（它关掉了一条真的开着的问题）')
  eq(ans && ans.answeredBy, OFFICE, '★ 读回：答复人＝office')
  eq(ans && ans.answeredRole, 'office', '★ 读回：命中的答复角色＝office（按 id 命中的，不是 slot）')
  eq(ans && ans.armed, true, '★ 读回：闸仍 armed')
  eq(ans && ans.awaiting, null, '★★ 读回：答复之后没有东西在等（读面说的，不是写回执说的）')
  ok(ans && ans.latestAnswer && ans.latestAnswer.by === OFFICE && /核对/.test(String(ans.latestAnswer.answer || '')),
    '★★ 正：答复正文进台账并可读回（latestAnswer.by/answer）', ans && ans.latestAnswer)
  ok(ans && Array.isArray(ans.declaredAnswerRoles) && ans.declaredAnswerRoles.includes('office'),
    '★ 读回：读面报出 pack 声明的答复角色', ans && ans.declaredAnswerRoles)

  const stateAfter = (await receipt(v5rBoot, 'vibe_v5_paper', { action: 'consult_state', target: T })).parsed.consult
  eq(stateAfter && stateAfter.awaiting, null, '★ 读回(独立调用)：awaiting 现在为 null')
  ok(stateAfter && stateAfter.answered && stateAfter.answered.by === OFFICE,
    '★ 读回(独立调用)：answered.by === office', stateAfter && stateAfter.answered)
  eq(stateAfter && stateAfter.counters && stateAfter.counters.answered, 1, '★ 读回：计数器 answered=1')

  const reAnswer = await receipt(v5rBoot, 'vibe_v5_paper', {
    action: 'consult', target: T, member: OFFICE, request_id: reqId, answer: '再答一次',
  })
  eq(codeOf(reAnswer.parsed), 'VMU_NO_SUCH_OBJECT',
    '★★ 反：已经答复过的 id 不再"在等" —— 再拿它来答复被拒（答过≠还在等）')
  ok(/nothing is waiting|Nothing is waiting|没有|没有任何|already answered/.test(String((reAnswer.parsed && reAnswer.parsed.hint) || '')),
    '★ 正：hint 说明现在没有在等的问询（并指向 consult_state）', reAnswer.parsed && reAnswer.parsed.hint)

  // ── 8. THE SAME final THAT WAS REFUSED NOW GOES THROUGH, AND SAYS HOW THE RULE WAS SATISFIED ──────────────────
  console.log('=== 8. 同一条 final：由拒转放行，且回执说清"闸是怎么被满足的" ===')
  const finalNow = await receipt(v5rBoot, 'vibe_v5_paper', {
    action: 'final', target: T, member: ACAD, decision: 'deliverable', note: '定稿', body: '结论',
  })
  const fin = finalNow.parsed && finalNow.parsed.final
  ok(finalNow.parsed && finalNow.parsed.ok === true && fin && fin.finalized === true,
    '★★★ 正(成对)：答复之后同一条 final 真的通过（finalized:true）', fin)
  ok(fin && fin.consult && fin.consult.satisfiedBy === 'answered',
    '★★★ 正：定稿回执说清闸是【被答复满足】的（satisfiedBy="answered"），而不是默默放行', fin && fin.consult)
  eq(fin && fin.consult && fin.consult.answeredBy, OFFICE, '★ 读回：回执点名答复人 office')
  eq(fin && fin.consult && fin.consult.requestId, reqId, '★ 读回：回执点名被答复的那条问询')
  const finalState = (await receipt(v5rBoot, 'vibe_v5_paper', { action: 'status', target: T })).parsed
  eq(finalState && finalState.paper && finalState.paper.status, 'finalized', '★★ 读回：论文状态真的 finalized')

  // ── 9. AN UNKNOWN PAPER IS REFUSED BY THE FLOW'S OWN CODE, NOT INVENTED HERE ──────────────────────────────────
  console.log('=== 9. 不存在的论文：用 flow 自己的码，不新造 ===')
  const noPaper = await receipt(v5rBoot, 'vibe_v5_paper', { action: 'consult_state', target: 'pc-none' })
  eq(codeOf(noPaper.parsed), 'VMU_PACK_V5R_CORE_PAPER_STATE', '★★ 反：未知论文被具名拒（paper flow 的 STATE 码）')
  const noPaperConsult = await receipt(v5rBoot, 'vibe_v5_paper', { action: 'consult', target: 'pc-none', member: OFFICE, answer: 'x' })
  eq(codeOf(noPaperConsult.parsed), 'VMU_PACK_V5R_CORE_PAPER_STATE', '★ 反：对未知论文答复同样具名拒')

  // ── 10. ANSWERING WHEN NOTHING IS WAITING IS REPORTED HONESTLY (`cleared:false`) ───────────────────────────────
  console.log('=== 10. 没有在等的东西时答复：如实报 cleared:false，不装成"关掉了一个问题" ===')
  const T2 = 'pc2'
  const started2 = await receipt(v5rBoot, 'vibe_v5_paper', { action: 'start', target: T2, participants: [ACAD] })
  ok(started2.parsed && started2.parsed.ok === true, '前置：第二篇论文已开始', started2.parsed && started2.parsed.started)
  const earlyAnswer = await receipt(v5rBoot, 'vibe_v5_paper', {
    action: 'consult', target: T2, member: OFFICE, answer: '提前点头',
  })
  const early = earlyAnswer.parsed && earlyAnswer.parsed.consult
  ok(earlyAnswer.parsed && earlyAnswer.parsed.ok === true, '★ 正：没有在等的问询时，答复仍然被记录（所办可以预先表态）', earlyAnswer.parsed)
  eq(early && early.cleared, false, '★★★ 正：cleared=false —— 它没有关掉任何在等的问题，回执如实说')
  eq(early && early.awaiting, null, '★ 读回：答复之后没有在等的')
  ok(early && typeof early.requestId === 'string' && /^consult-/.test(early.requestId),
    '★ 读回：kit 仍开了一条并立刻答复（id 可读，不是空字符串）', early && early.requestId)
  const stateT2 = (await receipt(v5rBoot, 'vibe_v5_paper', { action: 'consult_state', target: T2 })).parsed.consult
  eq(stateT2 && stateT2.counters && stateT2.counters.opened, 1, '★ 读回(pc2)：opened=1（新开的那条）')
  eq(stateT2 && stateT2.counters && stateT2.counters.answered, 1, '★ 读回(pc2)：answered=1')
  ok(stateT2 && stateT2.answered && stateT2.answered.by === OFFICE,
    '★ 读回(pc2)：answered.by === office', stateT2 && stateT2.answered)
} finally {
  // The store writes atomically through temp+rename, so a removal can race one in-flight file: retry, and never let a
  // cleanup failure turn a green run red (the assertions above already reported the truth).
  await rm(base, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 }).catch(() => {})
}

console.log('\n=== VMU PAPER CONSULT TOOL: ' + passed + ' passed, ' + failed + ' failed ===')
if (failed > 0) { console.error('FAILURES:'); for (const f of failures) console.error('  - ' + f) }
process.exit(failed > 0 ? 1 : 0)

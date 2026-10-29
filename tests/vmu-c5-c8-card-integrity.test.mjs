#!/usr/bin/env node
// tests/vmu-c5-c8-card-integrity.test.mjs — 命题卡的写入完整性：C5 / C6 / C7 / C8 四个缺陷各自的「写入面」证据。
//
// 规则原文（docs/acceptance/rules-ledger.json，L16 的 C5..C8 行；宏观层面v5r运行规则.md 第 14 行）:
//   C5 「命题库……命题完整定义，布尔概率估计（0-1），进度」
//   C6 「……平时只记录……尝试字段，只有当自己真正知道怎么证明证伪时才开始写正式证明或证伪字段下内容。」
//   C7 「只有命题卡中含有正式证明或证伪内容（且已经写完了而非半成品）才能用于后续辩论。」
//   C8 「那些布尔概率为1的命题卡需标记为已verified。」
//
// 审计（2026-10）读到的缺口，以及这个文件测的机制：
//   ① C5a：p∈[0,1] 原先**只有读面**查（verified.js:parseCardBody），写面照收 p:1.5 —— 读面于是要指认一行
//      写面自己造的坏行。现在写在 `kit/handlers.js` 的 cardTool（三个卡片工具共用的唯一写入口）上具名拒，
//      并且拒绝文案明说「卡没有写进去」——把静默钳位当成成功的人会写两遍。
//   ② C5b：命题卡原先**根本没有 progress 字段**。现在它是卡面的一行（`- 进度：…`，与 record_progress 的日志轨
//      同一种存法），回执把它回显出来并给 `progressMeans` 说明它存在哪里。
//   ③ C6a：`proofState:"complete"` 原先背后可以什么都没有。现在同一次写入必须带 Lean 登记（已结算通过的
//      `lean_job`，或 `lean_conformance`），否则具名拒。
//   ④ C6b：complete 原先不锁——同一张卡 id 下一分钟就能改。现在 recorded-complete 的卡 id 是定稿：再写同一个 id
//      具名拒，改正走**新的卡号**。
//   ⑤ C7：`debateSubjectGate` 的 form:"statement" 分支原先把自由文本放行（allowed:true, provenance:"none"）。
//      现在一句话命题不能单独当辩论对象：先落成命题卡（带证明登记），再以卡号开会。
//   ⑥ C8：`verifiedRef` 原先只是读面的装饰，p=1 可以不带任何定论来源写进去。现在 p=1 的写必须归到四条路之一，
//      回执用 `verifiedMark` 说出标记在不在、并点名唯一的写入器 `vibe_v5_verified_promote`。
//
// 判据用既有权威：`parseCardBody`（读面）、`kernel.records`（真写没写）、工具回执（拒/收的形状），不另造解析器。
// 运行：`node tests/vmu-c5-c8-card-integrity.test.mjs`（末行打印 passed=N failed=M，失败时 exitCode=1）。
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'

import { parseCardBody } from '../vibe-math-vmu/packs/v5r/verified.js'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..')
const ENTRY = join(REPO, 'vibe-math-vmu', 'vibe-math-vmu.js')

let passed = 0
let failed = 0
const failures = []
const ok = (cond, label, detail) => {
  if (cond) { passed++; console.log('  ok   ' + label); return true }
  failed++
  failures.push(label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail).slice(0, 500)))
  console.error('  FAIL ' + label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail).slice(0, 500)))
  return false
}

const entry = await import(pathToFileURL(ENTRY).href)
const ROOT = await mkdtemp(join('D:/_tmp', 'vmu-c5c8-'))
await mkdir(join(ROOT, 'Formal'), { recursive: true })
const LEAN_FILE = 'Formal/c5c8-card.lean'
await writeFile(join(ROOT, LEAN_FILE), 'theorem c5c8_aux : True := trivial\n', 'utf8')

/** 宿主注入一个 `subprocess` 缝，Lean 面才存在（照 tests/vmu-b3-c8-c10.test.mjs 的 boot）。 */
const boot = async () => {
  const state = { specs: [] }
  const subprocess = {
    resolveExecutable: async (name) => '/fake/bin/' + String(name),
    spawn: () => ({
      done: Promise.resolve({ exitCode: 0, signal: null, stdout: 'Build completed successfully.\n', stderr: '' }),
      terminate() {},
    }),
  }
  const ctx = {
    effect(fn) { return fn() },
    on() { return () => {} },
    get: (what) => (what === 'subprocess' ? subprocess : undefined),
    tools: { register: async (spec) => { state.specs.push(spec); return () => {} } },
  }
  let NOW = 1000
  const handle = entry.apply(ctx, { clock: () => NOW + (NOW += 1000), packs: ['v5r'], root: ROOT })
  await handle.ready()
  return { handle, kernel: handle.kernel, specOf: (name) => state.specs.find((s) => s.name === name) }
}

const call = async (b, name, args = {}) => {
  const spec = b.specOf(name)
  if (!spec) return { missing: name }
  let raw
  try { raw = await spec.execute(args, { kernel: b.kernel }) } catch (e) {
    return { thrown: true, code: e && e.code, message: String(e && e.message), hint: e && e.hint }
  }
  if (typeof raw === 'string') { try { return JSON.parse(raw) } catch { return { raw } } }
  return raw || {}
}
/** 一条回执是不是「具名拒」：ok:false + 指定 code（receipt 或 throw 两种形状都认）。 */
const refusedWith = (receipt, code) => !!receipt && receipt.ok === false && receipt.code === code
/** 回执里的可见文本，用于断言「拒绝文案说了什么」——不看字段名，读的是写给人看的那几句。 */
const prose = (r) => [r && r.message, r && r.hint, r && r.means, r && r.progressMeans].filter((s) => typeof s === 'string').join('\n')

try {
  const b = await boot()
  const kernel = b.kernel
  await kernel.members.hire({ id: 'r-acad', slot: 'chair' })
  await kernel.members.hire({ id: 'r-1', slot: 'member' })
  const rowsOf = (track) => kernel.records.list({ track, limit: 0 }).items || []
  const bodyOf = (track, marker) => rowsOf(track).filter((row) => String(row.body || '').includes(marker)).map((row) => String(row.body))

  // ── §1 C5a：p 越界在写入口被具名拒，且什么都没写进去 ─────────────────────────────────────────────────────
  console.log('=== §1 C5a：p 越界 ⇒ 写入口具名拒（VMU_INVALID_ARGUMENT），卡没有落盘 ===')
  const MARK_1 = 'C5a-越界标记-不可落盘'
  const over = await call(b, 'vibe_v5_record_proposition', {
    statement: MARK_1, value: 'V', motive: 'M', p: 1.5, member: 'r-1' })
  ok(refusedWith(over, 'VMU_INVALID_ARGUMENT'), 'p:1.5 被 VMU_INVALID_ARGUMENT 具名拒', over && (over.code || over.ok))
  ok(/1\.5/.test(String(over.message)) && /\[0,1\]/.test(String(over.message)),
    '拒绝文案同时点名了那个值和区间 [0,1]', over && over.message)
  ok(/NOT written/i.test(String(over.hint)), 'hint 明说「the card was NOT written」', over && over.hint)

  const bodies1 = bodyOf('propositions', MARK_1)
  ok(rowsOf('propositions').length === 0, '★ 写入口拒了之后 propositions 轨上没有任何行（不是"拒了但还是写了"）', rowsOf('propositions').length)
  ok(bodies1.length === 0, '★ 用那句陈述去搜也搜不到——被拒的卡没有以任何形态落盘', bodies1)

  const neg = await call(b, 'vibe_v5_record_proposition', {
    statement: 'C5a-负值', value: 'V', motive: 'M', p: -0.2, member: 'r-1' })
  ok(refusedWith(neg, 'VMU_INVALID_ARGUMENT') && /-0\.2/.test(String(neg.message)),
    'p:-0.2 同码拒绝，且文案点名 -0.2', neg && (neg.message || neg.code))
  const notNum = await call(b, 'vibe_v5_record_proposition', {
    statement: 'C5a-非数', value: 'V', motive: 'M', p: 'high', member: 'r-1' })
  ok(refusedWith(notNum, 'VMU_INVALID_ARGUMENT'), 'p:"high"（非数）同码拒绝', notNum && (notNum.code || notNum.ok))

  // 「任何卡片族写入」——method 与 subproblem 走的是同一个 kit 写入口，所以也要拒。
  const meth = await call(b, 'vibe_v5_record_method', {
    content: 'C5a-method', value: 'V', motive: 'M', p: 2, member: 'r-1' })
  ok(refusedWith(meth, 'VMU_INVALID_ARGUMENT') && /2/.test(String(meth.message)),
    'method 卡 p:2 也拒（卡片族写入同一个入口）', meth && (meth.code || meth.ok))
  const sub = await call(b, 'vibe_v5_record_subproblem', {
    statement: 'C5a-sub', value: 'V', motive: 'M', p: 1.01, member: 'r-1' })
  ok(refusedWith(sub, 'VMU_INVALID_ARGUMENT'), 'subproblem 卡 p:1.01 也拒', sub && (sub.code || sub.ok))
  ok(bodyOf('methods', 'C5a-method').length === 0 && bodyOf('problems', 'C5a-sub').length === 0,
    '两张越界卡都没有落盘（按陈述/内容搜不到）')

  // 读面仍要指认坏的历史行（parser 的检查没有被写面的检查替代，而是并存）。
  const legacy = parseCardBody(['- statement：历史坏行', '- value：V', '- motive：M', '- p：1.5'].join('\n'))
  ok(legacy.ok === false && legacy.problems.join(' ').includes('[0,1]'),
    '读面 parseCardBody 仍然具名指认历史坏行（p 越界写进 problems）', legacy.problems)

  // ── §2 C5b：进度是卡面字段（自己一行），回执回显并说明存在哪里 ─────────────────────────────────────────
  console.log('\n=== §2 C5b：progress 存在卡面 `- 进度：…` 一行，回执回显 + progressMeans ===')
  const PROC = '证明写到第 3 步，缺引理 L'
  const card2 = await call(b, 'vibe_v5_record_proposition', {
    statement: 'C5b-进度卡：每个有限群都有 Sylow 子群。', value: 'V', motive: 'M', p: 0.3, progress: PROC, member: 'r-1' })
  ok(card2.ok === true && typeof card2.recordId === 'string' && card2.recordId !== '',
    '带 progress 的命题卡写成功（进度不是必填，但传了就要收）', card2 && (card2.code || card2.recordId))
  ok(card2.progress === PROC, '回执把进度原样回显（progress 字段）', card2 && card2.progress)
  ok(typeof card2.progressMeans === 'string' && card2.progressMeans.includes('- 进度：') && /card body/i.test(card2.progressMeans),
    'progressMeans 说明它被存成卡面的一行 `- 进度：…`（不是只在回执里）', card2 && card2.progressMeans)
  const read2 = await call(b, 'vibe_v5_read_library', { id: card2.recordId, member: 'r-1' })
  ok(JSON.stringify(read2).includes('- 进度：' + PROC), '★ 从读面读回来，卡体里真的有 `- 进度：…` 那一行', read2 && read2.id)
  const noProgress = await call(b, 'vibe_v5_record_proposition', {
    statement: 'C5b-无进度卡', value: 'V', motive: 'M', p: 0.4, member: 'r-1' })
  ok(noProgress.ok === true && noProgress.progress === null && /no `progress` figure/i.test(String(noProgress.progressMeans)),
    '没传 progress 时回执诚实地说没传（不是静默给个空串）', noProgress && noProgress.progressMeans)

  // ── §3 C6a：complete 的登记凭据 = 「写完的证明」或「Lean 通过」 ────────────────────────────────────
  // ★★ G7 AUDIT #2 (rule L14): the rule registers a card 「含有正式证明或证伪内容（且已经写完了）」. Requiring Lean on top
  // made that path unregistrable (proof_ref + complete was refused while complete was required for debate), so a WRITTEN
  // proof the card points at is a registration too — and a card with neither is refused by name.
  console.log('\n=== §3 C6a：complete 须有登记凭据（proof_ref 或 Lean 通过）；两者都没有 ⇒ 具名拒 ===')
  const MARK_3 = 'C6a-声明完成但没 Lean'
  const withProofRef = await call(b, 'vibe_v5_record_proposition', {
    statement: MARK_3, value: 'V', motive: 'M', p: 0.9, proof_ref: 'Formal/c5c8-card.lean#thm',
    proof_state: 'complete', member: 'r-1' })
  ok(withProofRef.ok === true && !!withProofRef.recordId,
    '★ L14 的「写完的证明」：带 proof_ref 的 complete 卡能登记（否则规则的这条路永远走不通）',
    withProofRef && (withProofRef.code || withProofRef.recordId))
  const noBasis = await call(b, 'vibe_v5_record_proposition', {
    statement: MARK_3 + '-无凭据', value: 'V', motive: 'M', p: 0.9, proof_state: 'complete', member: 'r-1' })
  ok(refusedWith(noBasis, 'VMU_INVALID_ARGUMENT'), '声明 complete 但没有任何登记凭据 ⇒ VMU_INVALID_ARGUMENT', noBasis && (noBasis.code || noBasis.ok))
  ok(/proof_ref/i.test(String(noBasis.message)) || /Lean/i.test(String(noBasis.message)),
    '拒绝文案点名两条路（proof_ref 的写完证明，或 Lean 证据）', noBasis && noBasis.message)
  ok(/vibe_v5_lean_run/.test(String(noBasis.hint)), 'hint 点名登记 Lean 证据的那个调用（vibe_v5_lean_run）', noBasis && noBasis.hint)

  const leanRun = await call(b, 'vibe_v5_lean_run', { statement: 'True', file: LEAN_FILE })
  const jobId = leanRun && typeof leanRun.id === 'string' ? leanRun.id : null
  ok(!!jobId, 'setup：Lean 作业入队（接缝注入，退出码 0）', leanRun && (leanRun.code || leanRun.id))
  const settled = jobId ? await kernel.lean.settle(jobId) : null
  ok(!!settled && settled.state === 'settled' && settled.passed === true, 'setup：作业结算为 settled/passed',
    settled && { state: settled.state, passed: settled.passed, exitCode: settled.exitCode })

  const CARD_3 = 'rec-c5c8-proof'
  const withLean = await call(b, 'vibe_v5_record_proposition', {
    id: CARD_3, statement: 'C6a-带 Lean 的完成卡：True。', value: 'V', motive: 'M', p: 0.9,
    proof_ref: 'Formal/c5c8-card.lean#thm', proof_state: 'complete', lean_job: jobId, member: 'r-1' })
  ok(withLean.ok === true && withLean.recordId === CARD_3, '★ 同一次写入带 lean_job（已通过）⇒ complete 被接受', withLean && (withLean.code || withLean.recordId))

  // ── §4 C6b：complete 之后卡 id 锁定 ─────────────────────────────────────────────────────────────────────
  console.log('\n=== §4 C6b：complete 的卡 id 锁定 ⇒ 再写同 id 具名拒；换新卡号可以写 ===')
  const rewrite = await call(b, 'vibe_v5_record_proposition', {
    id: CARD_3, statement: 'C6a-带 Lean 的完成卡：True。（偷偷改一版）', value: 'V', motive: 'M', p: 0.5, member: 'r-1' })
  ok(refusedWith(rewrite, 'VMU_STATE'), '再写同一个 complete 卡 id ⇒ VMU_STATE 具名拒', rewrite && (rewrite.code || rewrite.ok))
  ok(/locked/i.test(String(rewrite.message)) && /complete/i.test(String(rewrite.message)),
    '拒绝文案说清「因为证明已登记为 complete，卡被锁定」', rewrite && rewrite.message)
  ok(/new card id/i.test(String(rewrite.hint)) && /NEW card id/i.test(String(rewrite.hint)),
    'hint 指出改正方式（写一个新的卡号，旧卡留作历史）', rewrite && rewrite.hint)
  const rewrittenBody = bodyOf('propositions', '偷偷改一版')
  ok(rewrittenBody.length === 0, '★ 锁定拒之后卡体没有被改（新文案没有以任何形态落盘）', rewrittenBody)
  const freshId = await call(b, 'vibe_v5_record_proposition', {
    id: 'rec-c5c8-proof-v2', statement: 'C6a-带 Lean 的完成卡：True。（新卡号的改正版）', value: 'V', motive: 'M', p: 0.5, member: 'r-1' })
  ok(freshId.ok === true && freshId.recordId === 'rec-c5c8-proof-v2', '★ 换一个新卡号可以写（改正有出路）', freshId && (freshId.code || freshId.recordId))

  // ── §5 G7#2：一句话命题不是规则允许的两种形态之一 ⇒ 具名拒；带 Lean 证据的卡 ⇒ 开会 ─────────────────
  console.log('\n=== §5 G7#2：一句话命题 ⇒ 具名拒（规则只有卡/文件引用）；带 Lean 证据的卡 ⇒ 开会 ===')
  const freeText = await call(b, 'vibe_v5_meeting', {
    type: 'debate', kind: 'sync', subject: '任意一个猜想：每个偶数都是两个素数之和', agenda: '§5 自由文本对象', member: 'r-acad' })
  ok(freeText && freeText.ok === false && freeText.code === 'VMU_PACK_V5R_DEBATE_SUBJECT_NO_PROOF',
    '自由文本辩论对象 ⇒ 具名 VMU_PACK_V5R_DEBATE_SUBJECT_NO_PROOF（不是静默放行）', freeText && (freeText.code || freeText.ok))
  ok(freeText && /两种形态/.test(String(freeText.message)) && /vibe_v5_record_proposition/.test(String(freeText.hint || '')),
    '拒绝说清规则只允许两种形态，并给出写成卡的可执行调用', freeText && String(freeText.message || '').slice(0, 80))

  const byCard = await call(b, 'vibe_v5_meeting', {
    type: 'debate', subject: CARD_3, agenda: '§5 有 Lean 证据的卡', member: 'r-acad' })
  ok(byCard.ok === true, '★ 以带 Lean 通过证据的卡为对象 ⇒ 会议开得起来', byCard && (byCard.code || byCard.id))
  ok(byCard.subjectGate && byCard.subjectGate.allowed === true && byCard.subjectGate.form === 'card',
    '回执里的 subjectGate 说 allowed:true 且 form:"card"', byCard && byCard.subjectGate)

  // ── §6 C8：p=1 必须带 verified 标记；promote 那条路仍然通 ────────────────────────────────────────────────
  console.log('\n=== §6 C8：p=1 没定论来源 ⇒ 具名拒并点名 promote；文献路 p=1 收下，promote 写下标记；p=0 与 0<p<1 照旧 ===')
  const MARK_6 = 'C8-裸 p=1 无标记'
  const bare1 = await call(b, 'vibe_v5_record_proposition', {
    statement: MARK_6, value: 'V', motive: 'M', p: 1, member: 'r-1' })
  ok(refusedWith(bare1, 'VMU_PACK_V5R_P1_NEEDS_DEBATE'), 'p=1 没有任何定论来源 ⇒ VMU_PACK_V5R_P1_NEEDS_DEBATE', bare1 && (bare1.code || bare1.ok))
  ok(/verified/i.test(String(bare1.message)) && /p=1/.test(String(bare1.message)),
    '拒绝文案说清「p=1 必须带 verified 标记」', bare1 && bare1.message)
  ok(/vibe_v5_verified_promote/.test(String(bare1.hint)), 'hint 点名唯一的标记写入器 vibe_v5_verified_promote', bare1 && bare1.hint)
  ok(bodyOf('propositions', MARK_6).length === 0, '被拒的裸 p=1 卡没有落盘')

  // C8 的可达洞：method 工具带 track:"propositions" 曾能绕过命题工具的闸门，写进同一条轨。闸门现在键在**轨道**上。
  const sideDoor = await call(b, 'vibe_v5_record_method', {
    content: 'C8-借 method 写进命题轨', value: 'V', motive: 'M', p: 1, track: 'propositions', member: 'r-1' })
  ok(refusedWith(sideDoor, 'VMU_PACK_V5R_P1_NEEDS_DEBATE'),
    'method 工具带 track:"propositions" 写 p=1 也走同一道闸（不再有第二条门）', sideDoor && (sideDoor.code || sideDoor.ok))

  const CITE = 'Dummit & Foote, Abstract Algebra, 3rd ed., Section 3.2 Theorem 7'
  const lit1 = await call(b, 'vibe_v5_record_proposition', {
    statement: 'C8-文献路 p=1：拉格朗日定理。', value: 'V', motive: 'M', p: 1, literature_ref: CITE, member: 'r-1' })
  ok(lit1.ok === true && typeof lit1.recordId === 'string', '文献路 p=1 仍然写得进去（既有承诺不被改坏）', lit1 && (lit1.code || lit1.recordId))
  ok(lit1.verifiedMark && lit1.verifiedMark.required === true && lit1.verifiedMark.present === false,
    '★ 回执的 verifiedMark 说：标记必须存在，而现在还没有', lit1 && lit1.verifiedMark)
  ok(lit1.verifiedMark && lit1.verifiedMark.call === 'vibe_v5_verified_promote',
    'verifiedMark 点名去调用 vibe_v5_verified_promote', lit1 && lit1.verifiedMark)

  const promoted = await call(b, 'vibe_v5_verified_promote', {
    card: lit1.recordId, warrant_kind: 'literature', literature_ref: CITE, member: 'r-acad' })
  ok(promoted.ok === true && promoted.written === true, '★ promote 这条路仍然通（写下 verified 行）', promoted && (promoted.code || promoted.ok))
  const readLit = await call(b, 'vibe_v5_read_library', { id: lit1.recordId, member: 'r-1' })
  const litRow = readLit && readLit.card ? readLit.card : readLit
  ok(litRow && litRow.verifiedRef && typeof litRow.verifiedRef.id === 'string',
    '★ promote 之后读面带 verifiedRef（p=1 与标记成对出现）', litRow && litRow.verifiedRef)

  const mid = await call(b, 'vibe_v5_record_proposition', {
    statement: 'C8-中间概率 0.6 仍然自由', value: 'V', motive: 'M', p: 0.6, member: 'r-1' })
  ok(mid.ok === true, '0<p<1（p=0.6）仍然允许，不需要标记', mid && (mid.code || mid.ok))
  const zero = await call(b, 'vibe_v5_record_proposition', {
    statement: 'C8-p=0 仍然允许', value: 'V', motive: 'M', p: 0, member: 'r-1' })
  ok(zero.ok === true, 'p=0 仍然允许（规则只要求 p=1 带标记）', zero && (zero.code || zero.ok))
} catch (e) {
  failed++
  failures.push('harness threw: ' + (e && e.stack ? e.stack : String(e)))
  console.error('  FAIL harness threw: ' + (e && e.stack ? e.stack : e))
} finally {
  // best-effort: 并行写入者偶发保留句柄时 ENOTEMPTY 不应把一份全绿的报告变成崩溃
  try { await rm(ROOT, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }) } catch {}
}

const line = '=== VMU C5-C8 CARD INTEGRITY: ' + passed + ' passed, ' + failed + ' failed ==='
console.log('\n' + line)
if (failed > 0) {
  console.error('failures:\n- ' + failures.join('\n- '))
  process.exitCode = 1
}

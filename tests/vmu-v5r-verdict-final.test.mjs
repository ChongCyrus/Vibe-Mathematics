// tests/vmu-v5r-verdict-final.test.mjs — PHASE 12 / D13–D15: the four rule PREDICATES get their CALLERS, and the
// debate gets its FINAL RULING face.
//
// THE DEFECT CLASS THIS PINS (red line ④ "没有消费者就不给机制"): `packs/v5r/verification-gates.js` shipped four pure
// predicates (`p1Intent` / `debateSubjectGate` / `singleWriter` / `fidelityAsked`) that NOTHING called — a mechanism with
// zero consumers, which is the same defect as a name with zero mechanism, only quieter. This suite pins, on the REAL
// entry (packs:['v5r'], a real kernel, real records), that:
//   · ① p=1 on a proposition card is REFUSED BY NAME without a conclusion (a preference is not a conclusion) and
//        ACCEPTED with one of the three legal evidences — including the verified row READ FROM RECORDS (not claimed);
//   · ② the debate's subject is judged BEFORE the meeting exists: statement ⇒ allowed-but-unchecked, card without a
//        finished proof ⇒ named refusal, file reference ⇒ needs the caller's readability evidence;
//   · ③ the verified track has exactly ONE write path (`vibe_v5_verified_promote`), and a card tool cannot become a
//        second door to it (named refusal), so "谁把它定成定论" is answerable from the record;
//   · ④ before a number is ANNOUNCED, a passed Lean run with p≠1 forces the fidelity question — the refusal carries
//        the question and the two legal answers, and answering it admits the ruling;
//   · D15 the debate's final ruling is an EXPLICIT, SIGNED act: the chair aggregates the members' verdicts (all agree ⇒
//        that value, else the mean), the card owner is really told through the MAILBOX face (read back from the inbox),
//        and a non-chair signer / an unowned proposition is refused by name;
//   · D3 a meeting carries an OPTIONAL title of its own (passed through, read back, blank ⇒ null, non-string ⇒ named).
//
// RULE E: every loop/`every()` is preceded by an explicit NON-EMPTY assertion. Every "it worked" is READ BACK from the
// kernel/records/mailbox — a receipt is not evidence that a mechanism ran.
// Run: node tests/vmu-v5r-verdict-final.test.mjs   Last line: === VMU V5R VERDICT FINAL: N passed, M failed ===
import { mkdtemp, rm, readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..')
const ENTRY = join(REPO, 'vibe-math-vmu', 'vibe-math-vmu.js')
// READING A CARD'S p BACK needs the card parser, not a substring match: the value lives in the card BODY
// ("- p：0.5"), so "the receipt said settled:true" is not evidence that p moved. Using the pack's own parser also
// means this suite cannot drift from the format the kernel actually stores.
const { parseCard } = await import(pathToFileURL(join(REPO, 'vibe-math-vmu', 'packs', 'v5r', 'verified.js')).href)

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
const receipt = async (b, name, args = {}) => {
  const spec = b.specOf(name)
  if (!spec) return { raw: undefined, parsed: undefined, missing: true }
  const raw = await spec.execute(args, {})
  let parsed
  try { parsed = JSON.parse(raw) } catch { parsed = undefined }
  return { raw, parsed, missing: false }
}
const codeOf = (parsed) => parsed && parsed.code ? parsed.code : null

const root = await mkdtemp(join('D:/_tmp', 'vmu-v5r-verdict-final-'))
try {
  // ── 0. THE FACE EXISTS AT ALL ───────────────────────────────────────────────────────────────────────────────
  console.log('=== 0. ZERO MECHANISM: WITH NO PACK NEITHER NEW FACE EXISTS ===')
  const bare = await boot({ root })
  ok(!bare.names.includes('vibe_v5_verdict_final') && !bare.names.includes('vibe_v5_verified_promote'),
    '★★ 反(零机制)：没有 pack 就没有这两个面（它们的出现是 v5r 声明造成的，不是内核默认给的）', bare.names.length)

  const v5rBoot = await boot({ root, packs: ['v5r'] })
  ok(v5rBoot.names.includes('vibe_v5_verdict_final') && v5rBoot.names.includes('vibe_v5_verified_promote'),
    '★★ 正：packs:["v5r"] 时两个面都在（宿主 register 捕获，不是读源码猜的）', v5rBoot.names.length)
  const kernel = v5rBoot.handle.kernel
  const CHAIR = 'r-chair'
  const M1 = 'r-1'
  const M2 = 'r-2'
  // hire() is async — an unawaited call returns a promise, the roster stays empty, and every later assertion would
  // "pass" against a world with no members at all (the RULE E failure mode: green because nothing exists).
  await kernel.members.hire({ id: CHAIR, slot: 'chair' })
  await kernel.members.hire({ id: M1, slot: 'member' })
  await kernel.members.hire({ id: M2, slot: 'member' })
  const rosterNow = kernel.members.roster().map((m) => m.id)
  ok(rosterNow.includes(CHAIR) && rosterNow.includes(M1) && rosterNow.includes(M2),
    '前置(RULE E)：三个真实成员在位，下面读的都是真记录/真信箱', rosterNow)

  const card = (id, p, extra = {}) => receipt(v5rBoot, 'vibe_v5_record_proposition', Object.assign(
    { id, title: id, statement: id + ' 的陈述', value: 1, motive: '测试', p, member: M1 }, extra))
  const rowOf = (id) => {
    try { return kernel.records.get({ id }) } catch { return null }
  }
  const cardPOf = (id) => {
    const row = rowOf(id)
    if (!row) return null
    const parsed = parseCard(row)
    return parsed && parsed.card ? Number(parsed.card.p) : null
  }
  const verifiedRows = () => {
    const listed = kernel.records.list({ track: 'verified', limit: 50 })
    return Array.isArray(listed && listed.items) ? listed.items : []
  }

  // ── 1. ① p1Intent ON THE CARD WRITE PATH ───────────────────────────────────────────────────────────────────
  console.log('=== 1. ① 写命题卡：p=1 是定论，不是偏好（无证据 ⇒ 具名拒；有证据 ⇒ 收） ===')
  const noEv = await card('c-noev', 1)
  ok(noEv.parsed && noEv.parsed.ok === false && codeOf(noEv.parsed) === 'VMU_PACK_V5R_P1_NEEDS_DEBATE',
    '★★★ 反：p=1 且没有任何定论来源 ⇒ 具名 VMU_PACK_V5R_P1_NEEDS_DEBATE', noEv.parsed && codeOf(noEv.parsed))
  ok(noEv.parsed && typeof noEv.parsed.hint === 'string' && /debate-unanimous|verified-row|lean-conformance/.test(noEv.parsed.hint),
    '★ 拒绝自带"三种合法来源"的说明（不只是一句 forbidden）', noEv.parsed && (noEv.parsed.hint || '').slice(0, 60))
  ok(rowOf('c-noev') === null, '★ 反：被拒的写入没有落库（没有留下半张卡）', rowOf('c-noev'))

  const withDebate = await card('c-debate', 1, { debate_ruling: { mode: 'unanimous', value: 1, subject: 'c-debate', ballotId: 'b-c-debate' } })
  ok(withDebate.parsed && withDebate.parsed.ok === true && withDebate.parsed.settled === true,
    '★★★ 正：带「全体一致为 1 的辩论裁决」⇒ p=1 被收下且卡已定稿', withDebate.parsed && withDebate.parsed.settled)
  const cDebateRow = rowOf('c-debate')
  ok(cDebateRow && cardPOf('c-debate') === 1, '★ 正：读回卡上真是 p=1（不是只信回执）', cDebateRow && cardPOf('c-debate'))

  const splitDebate = await card('c-split', 1, { debate_ruling: { mode: 'mean', value: 1, subject: 'c-split', ballotId: 'b-split' } })
  ok(splitDebate.parsed && splitDebate.parsed.ok === false && codeOf(splitDebate.parsed) === 'VMU_PACK_V5R_P1_NEEDS_DEBATE',
    '★★ 反：非全体一致（mode=mean）的裁决不能把 p 设成 1（规则要的是"全部一致为 1"）', splitDebate.parsed && codeOf(splitDebate.parsed))
  ok(splitDebate.parsed && typeof splitDebate.parsed.message === 'string' && /全体一致|unanimous/.test(splitDebate.parsed.message),
    '★ 反的近失原因写明了"聚合必须全体一致"', splitDebate.parsed && (splitDebate.parsed.message || '').slice(-60))

  const wrongSubject = await card('c-wrongsub', 1, { debate_ruling: { mode: 'unanimous', value: 1, subject: 'c-OTHER' } })
  ok(wrongSubject.parsed && wrongSubject.parsed.ok === false && codeOf(wrongSubject.parsed) === 'VMU_PACK_V5R_P1_NEEDS_DEBATE',
    '★★ 反：裁决指向的是别的卡 ⇒ 等于没有证据（证据必须指向这张卡）', wrongSubject.parsed && codeOf(wrongSubject.parsed))

  const leanOnly = await card('c-lean', 1, { lean_job: 'job-1' })
  ok(leanOnly.parsed && leanOnly.parsed.ok === false && codeOf(leanOnly.parsed) === 'VMU_PACK_V5R_P1_NEEDS_DEBATE',
    '★★ 反：只给 lean 作业（且本内核没有该作业）⇒ 不是"Lean 通过"，仍具名拒', leanOnly.parsed && codeOf(leanOnly.parsed))

  const mid = await card('c-mid', 0.5)
  ok(mid.parsed && mid.parsed.ok === true && mid.parsed.settled === false,
    '★★ 正(边界)：p=0.5 不受本闸约束（估计值合法，卡不定稿）', mid.parsed && mid.parsed.settled)

  // ── 2. ③ THE VERIFIED TRACK'S SINGLE WRITER ────────────────────────────────────────────────────────────────
  console.log('=== 2. ③ 定论只有一个写入器：卡工具不许变成第二扇门；promote 要法官 ===')
  const secondDoor = await receipt(v5rBoot, 'vibe_v5_record_proposition',
    { track: 'verified', value: 1, motive: 'x', p: 0, member: M1 })
  ok(secondDoor.parsed && secondDoor.parsed.ok === false && codeOf(secondDoor.parsed) === 'VMU_PACK_V5R_VERIFIED_SINGLE_WRITER',
    '★★★ 反：卡工具指向 verified 轨 ⇒ 具名 VMU_PACK_V5R_VERIFIED_SINGLE_WRITER（第二扇门被关）', secondDoor.parsed && codeOf(secondDoor.parsed))
  ok(secondDoor.parsed && /promoteVerified/.test(String(secondDoor.parsed.message)),
    '★ 拒绝里点名唯一写入器 promoteVerified（告诉调用方该走哪条路）', secondDoor.parsed && (secondDoor.parsed.message || '').slice(0, 80))

  const noWarrant = await receipt(v5rBoot, 'vibe_v5_verified_promote', { card: 'c-mid' })
  ok(noWarrant.parsed && noWarrant.parsed.ok === false && codeOf(noWarrant.parsed) === 'VMU_INVALID_ARGUMENT',
    '★★ 反：promote 不给法官（warrant）⇒ 具名 VMU_INVALID_ARGUMENT', noWarrant.parsed && codeOf(noWarrant.parsed))

  const midPromote = await receipt(v5rBoot, 'vibe_v5_verified_promote', { card: 'c-mid', warrant: 'w-1', warrant_kind: 'debate-unanimous' })
  ok(midPromote.parsed && midPromote.parsed.ok === false && codeOf(midPromote.parsed) === 'VMU_STATE',
    '★★ 反：p=0.5 的卡不能进定论轨（"0.5 是偏好不是定论"）', midPromote.parsed && codeOf(midPromote.parsed))
  eq(verifiedRows().length, 0, '★ 反：被拒的 promote 没有在 verified 轨留下任何行')

  const settledCard = await card('c-false', 0, { statement: '被证伪的命题' })
  ok(settledCard.parsed && settledCard.parsed.ok === true && settledCard.parsed.settled === true,
    '前置：p=0 的卡已定稿（另一个合法的定稿值）', settledCard.parsed && settledCard.parsed.settled)
  const promoted = await receipt(v5rBoot, 'vibe_v5_verified_promote', { card: 'c-false', warrant: 'ballot-42', warrant_kind: 'debate-unanimous', member: M1,
    debate_ruling: { mode: 'unanimous', value: 0, ballotId: 'ballot-42', subject: 'c-false' } })
  ok(promoted.parsed && promoted.parsed.ok === true, '★★★ 正：带法官的 promote 成功', promoted.parsed && (promoted.parsed.code || 'ok'))
  ok(promoted.parsed && promoted.parsed.warrant && promoted.parsed.warrant.id === 'ballot-42',
    '★ 正：回执写明法官（warrant.id），"为什么它算定论"可从记录回答', promoted.parsed && promoted.parsed.warrant)
  const rowsAfter = verifiedRows()
  eq(rowsAfter.length, 1, '★★ 正：读回 verified 轨上真有一行（不是只信回执）')
  ok(rowsAfter.length > 0 && promoted.parsed && rowsAfter[0].id === promoted.parsed.id,
    '★ 正：那一行就是这次 promote 写的那一行', rowsAfter.map((r) => r.id))

  // ── 3. ① THE VERIFIED ROW AS EVIDENCE (read from records, not claimed) ─────────────────────────────────────
  console.log('=== 3. ① 定论行是可读的证据：已 promote 的卡再写 p=1 ⇒ 不再需要自报辩论 ===')
  const promotedTrue = await card('c-true', 1, { debate_ruling: { mode: 'unanimous', value: 1, subject: 'c-true', ballotId: 'b-c-true' } })
  ok(promotedTrue.parsed && promotedTrue.parsed.ok === true, '前置：先用辩论裁决把 c-true 写成 p=1', promotedTrue.parsed && codeOf(promotedTrue.parsed))
  const promoteTrue = await receipt(v5rBoot, 'vibe_v5_verified_promote', { card: 'c-true', warrant: 'ballot-7', warrant_kind: 'debate-unanimous', member: M1,
    debate_ruling: { mode: 'unanimous', value: 1, subject: 'c-true', ballotId: 'ballot-7' } })
  ok(promoteTrue.parsed && promoteTrue.parsed.ok === true, '前置：把 c-true promote 到定论轨', promoteTrue.parsed && codeOf(promoteTrue.parsed))
  const rewrite = await card('c-true', 1, { statement: 'c-true 的陈述（修订）' })
  ok(rewrite.parsed && rewrite.parsed.ok === true,
    '★★★ 正：这张卡已有 verified 定论行 ⇒ 再写 p=1 不再需要调用方自报辩论（证据来自记录面）', rewrite.parsed && codeOf(rewrite.parsed))
  const rewriteRow = rowOf('c-true')
  ok(rewriteRow && cardPOf('c-true') === 1, '★ 正：读回 p 仍是 1', rewriteRow && cardPOf('c-true'))

  // ── 4. ② debateSubjectGate: THE SUBJECT IS JUDGED BEFORE THE MEETING EXISTS ───────────────────────────────
  console.log('=== 4. ② 辩论对象：一句话命题放行但如实记 provenance；无证明的卡/无证据的文件 ⇒ 具名拒 ===')
  const stmtDebate = await receipt(v5rBoot, 'vibe_v5_meeting',
    { agenda: '辩论：一句话命题', type: 'debate', subject: '无穷是否存在', member: CHAIR })
  ok(stmtDebate.parsed && stmtDebate.parsed.ok === true && stmtDebate.parsed.subjectGate && stmtDebate.parsed.subjectGate.form === 'statement',
    '★★ 正：一句话命题可以开辩论（闸判不了证明，如实标形态）', stmtDebate.parsed && stmtDebate.parsed.subjectGate)
  ok(stmtDebate.parsed && stmtDebate.parsed.subjectGate && stmtDebate.parsed.subjectGate.provenance === 'none',
    '★★ 正：回执如实记 provenance:"none"（不假装核过证明）', stmtDebate.parsed && stmtDebate.parsed.subjectGate && stmtDebate.parsed.subjectGate.provenance)

  // A card-form subject is recognised by its `r-` id shape (verification-gates.js classifySubject), so the fixture must
  // be a real card with such an id — an arbitrary id like 'c-mid' is classified as a STATEMENT and would sail through
  // the gate, which is exactly the "the observable does not differ between the two cases" trap.
  const noProofCard = await card('r-noproof', 0.5, { statement: '还没有正式证明的命题' })
  ok(noProofCard.parsed && noProofCard.parsed.ok === true, '前置：造一张没有任何证明的 r- 前缀命题卡', noProofCard.parsed && codeOf(noProofCard.parsed))
  const meetingsBefore = kernel.meetings.status().liveMeetings
  const cardDebate = await receipt(v5rBoot, 'vibe_v5_meeting',
    { agenda: '辩论：没证明的卡', type: 'debate', subject: 'r-noproof', member: CHAIR })
  ok(cardDebate.parsed && cardDebate.parsed.ok === false && codeOf(cardDebate.parsed) === 'VMU_PACK_V5R_DEBATE_SUBJECT_NO_PROOF',
    '★★★ 反：以"没有正式证明"的卡为辩论对象 ⇒ 具名 VMU_PACK_V5R_DEBATE_SUBJECT_NO_PROOF（会议没被创建）', cardDebate.parsed && codeOf(cardDebate.parsed))
  const meetingsAfterRefusal = kernel.meetings.status().liveMeetings
  ok(Array.isArray(meetingsBefore) && meetingsBefore.length === 1 && meetingsAfterRefusal.length === meetingsBefore.length,
    '★ 反：被拒的辩论没有留下会议对象（当时只有 4.1 那一场）', { before: meetingsBefore, after: meetingsAfterRefusal })

  const fileDebate = await receipt(v5rBoot, 'vibe_v5_meeting',
    { agenda: '辩论：文件引用', type: 'debate', subject: 'Shared/proof-1.md', member: CHAIR })
  ok(fileDebate.parsed && fileDebate.parsed.ok === false && codeOf(fileDebate.parsed) === 'VMU_PACK_V5R_DEBATE_SUBJECT_NO_PROOF',
    '★★ 反：文件形态的辩论对象没有可读性证据 ⇒ 具名拒', fileDebate.parsed && codeOf(fileDebate.parsed))
  const fileDebate2 = await receipt(v5rBoot, 'vibe_v5_meeting',
    { agenda: '辩论：文件引用(有证据)', type: 'debate', subject: 'Shared/proof-2.md', member: CHAIR,
      subject_evidence: { file: { name: 'Shared/proof-2.md', bytes: 4096, readable: true } } })
  ok(fileDebate2.parsed && fileDebate2.parsed.ok === true && fileDebate2.parsed.subjectGate && fileDebate2.parsed.subjectGate.form === 'file',
    '★★ 正：给了 {readable:true,bytes>0} ⇒ 文件形态放行', fileDebate2.parsed && fileDebate2.parsed.subjectGate)
  ok(fileDebate2.parsed && fileDebate2.parsed.subjectGate && fileDebate2.parsed.subjectGate.proofChecked === false,
    '★★ 正：文件形态只证明"存在且非空"，proofChecked 如实为 false（内容完整性由人在辩论中核）',
    fileDebate2.parsed && fileDebate2.parsed.subjectGate && fileDebate2.parsed.subjectGate.proofChecked)

  // ── 5. D3 THE OPTIONAL TITLE ───────────────────────────────────────────────────────────────────────────────
  console.log('=== 5. D3 会议标题：可选、只在传了时透传、空白归一、非字符串具名拒 ===')
  const noTitle = await receipt(v5rBoot, 'vibe_v5_meeting', { agenda: '无标题会议', kind: 'sync', member: CHAIR })
  ok(noTitle.parsed && noTitle.parsed.ok === true && noTitle.parsed.title === null,
    '★★ 正：不传 title ⇒ 回执 title 为 null（不给没传的会议编标题）', noTitle.parsed && noTitle.parsed.title)
  const withTitle = await receipt(v5rBoot, 'vibe_v5_meeting', { agenda: '有标题会议', title: '  第 12 轮评审  ', kind: 'sync', member: CHAIR })
  ok(withTitle.parsed && withTitle.parsed.ok === true && withTitle.parsed.title === '第 12 轮评审',
    '★★ 正：title 透传且两端空白被去掉', withTitle.parsed && withTitle.parsed.title)
  const titledView = kernel.meetings.meetingView({ meeting: withTitle.parsed.meeting })
  eq(titledView && titledView.title, '第 12 轮评审', '★★ 正：内核面 meetingView 读回同一标题（不是只有回执里写着）')
  const blankTitle = await receipt(v5rBoot, 'vibe_v5_meeting', { agenda: '空白标题', title: '   ', kind: 'sync', member: CHAIR })
  ok(blankTitle.parsed && blankTitle.parsed.ok === true && blankTitle.parsed.title === null,
    '★ 边界：全空白 title ⇒ null（与"没传"等价，不发明标题）', blankTitle.parsed && blankTitle.parsed.title)
  const badTitle = await receipt(v5rBoot, 'vibe_v5_meeting', { agenda: '坏标题', title: 42, kind: 'sync', member: CHAIR })
  ok(badTitle.parsed && badTitle.parsed.ok === false && codeOf(badTitle.parsed) === 'VMU_INVALID_ARGUMENT',
    '★★ 反：非字符串 title ⇒ 具名 VMU_INVALID_ARGUMENT', badTitle.parsed && codeOf(badTitle.parsed))
  ok(badTitle.parsed && /number/.test(String(badTitle.parsed.message)),
    '★ 反：消息里带 typeof（说清错在哪，不让人猜）', badTitle.parsed && (badTitle.parsed.message || '').slice(0, 60))

  // ── 6. D15 THE FINAL RULING (the chair signs, the owner is really TOLD) ───────────────────────────────────
  console.log('=== 6. D15 最终裁决：全体一致⇒该值、否则均值；主席签名；真的通知到卡持有者 ===')
  const ruled = await receipt(v5rBoot, 'vibe_v5_verdict_final', {
    meeting: withTitle.parsed.meeting, proposition_id: 'c-mid', member: CHAIR,
    verdicts: [{ member: M1, p: 1, reason: '构造性证明成立' }, { member: M2, p: 1, reason: '复核通过' }],
  })
  ok(ruled.parsed && ruled.parsed.ok === true, '★★★ 正：主席对本会议的命题做最终裁决 ⇒ 成功', ruled.parsed && (ruled.parsed.code || 'ok'))
  eq(ruled.parsed && ruled.parsed.value, 1, '★★ 正：全体一致为 1 ⇒ 最终概率就是 1（取该值，不是均值）')
  eq(ruled.parsed && ruled.parsed.mode, 'unanimous', '★ 正：聚合模式如实为 unanimous')
  eq(ruled.parsed && ruled.parsed.from, CHAIR, '★ 正：签名人就是该会议主席（from=chair）')
  ok(ruled.parsed && Array.isArray(ruled.parsed.perMember) && ruled.parsed.perMember.length === 2,
    '★ 正：逐人裁决都在回执里（可复核，不是只有结论）', ruled.parsed && ruled.parsed.perMember)
  eq(ruled.parsed && ruled.parsed.owner, M1, '★ 正：持有者来自命题卡的作者（不是猜的）')

  const inbox = await receipt(v5rBoot, 'vibe_v5_inbox', { action: 'list', member: M1 })
  const mailRows = inbox.parsed && Array.isArray(inbox.parsed.rows) ? inbox.parsed.rows : []
  ok(mailRows.length > 0, '★ 前置(RULE E)：持有者的信箱里有信（下面才谈得上"通知到了"）', mailRows.length)
  const rulingMail = mailRows.filter((r) => /命题最终裁决/.test(String(r.subject || '')))
  ok(rulingMail.length === 1, '★★★ 正：持有者的信箱里真的有一封"命题最终裁决"的信（通知不是回执上的一句自称）', mailRows.map((r) => r.subject))
  ok(Array.isArray(ruled.parsed.notified) && ruled.parsed.notified.includes(M1),
    '★ 正：回执的 notified 与信箱一致', ruled.parsed && ruled.parsed.notified)

  const meanRuling = await receipt(v5rBoot, 'vibe_v5_verdict_final', {
    meeting: withTitle.parsed.meeting, proposition_id: 'c-false', member: CHAIR,
    verdicts: [{ member: M1, p: 0.8, reason: '八成' }, { member: M2, p: 0.4, reason: '四成' }],
  })
  ok(meanRuling.parsed && meanRuling.parsed.ok === true && Math.abs(meanRuling.parsed.value - 0.6) < 1e-9,
    '★★★ 正：不一致 ⇒ 取算术平均（(0.8+0.4)/2 = 0.6）', meanRuling.parsed && meanRuling.parsed.value)
  eq(meanRuling.parsed && meanRuling.parsed.mode, 'mean', '★ 正：聚合模式如实为 mean')

  const notChair = await receipt(v5rBoot, 'vibe_v5_verdict_final', {
    meeting: withTitle.parsed.meeting, proposition_id: 'c-mid', member: M2,
    verdicts: [{ member: M1, p: 1, reason: 'x' }],
  })
  ok(notChair.parsed && notChair.parsed.ok === false && codeOf(notChair.parsed) === 'VMU_NOT_PERMITTED',
    '★★★ 反：非主席不能签发最终裁决（不匿名签发）', notChair.parsed && codeOf(notChair.parsed))
  ok(notChair.parsed && String(notChair.parsed.message).includes(CHAIR) && String(notChair.parsed.message).includes(M2),
    '★ 反：拒绝里同时点名"主席是谁 / 你是谁"', notChair.parsed && (notChair.parsed.message || '').slice(0, 90))

  const emptySet = await receipt(v5rBoot, 'vibe_v5_verdict_final', { meeting: withTitle.parsed.meeting, proposition_id: 'c-mid', verdicts: [] })
  ok(emptySet.parsed && emptySet.parsed.ok === false && codeOf(emptySet.parsed) === 'VMU_INVALID_ARGUMENT',
    '★★ 反：空裁决集 ⇒ 具名拒（空集没有值）', emptySet.parsed && codeOf(emptySet.parsed))
  const noOwner = await receipt(v5rBoot, 'vibe_v5_verdict_final', {
    meeting: withTitle.parsed.meeting, proposition_id: 'c-does-not-exist',
    verdicts: [{ member: M1, p: 1, reason: 'x' }],
  })
  ok(noOwner.parsed && noOwner.parsed.ok === false && codeOf(noOwner.parsed) === 'VMU_STATE',
    '★★ 反：命题卡不存在 ⇒ 没有持有者可通知 ⇒ 具名 VMU_STATE（不产生"没人会看的裁定"）', noOwner.parsed && codeOf(noOwner.parsed))
  // ★ A 类修正（round 30 取证审计）：下面三处裁决集原先只给 M1 —— 在 046f797c 之后这已经不是一个「同场景」的
  // 裁决集了。046f797c（`feat(goal-5e2adedf): 请裁决的人口 = 在册者而非发过言者…`，2026-10-26 07:50）把
  // `debatedMembersOf` 的辩论人口从「发过言者」改成「在册者 ∪ 发过言者 − 主席」，而本文件的 sync 会议 roster 是
  // r-chair／r-1／r-2，于是"辩论过的人"= r-1 与 r-2 两人；`vibe-math-vmu/packs/v5r/tools.js:1288-1295` 的完整性闸
  // 会先用 `VMU_STATE "the ruling is missing 1 of the 2 member(s) who debated: r-2"` 拒掉只给一人的裁决集，把本段
  // 要测的三条规则（内核重复成员拒 / 先问符合性 / 回答后可宣布）全挡在那道闸后面。规则本身都还在：内核重复成员拒
  // `vibe-math-vmu/kernel/meetingverdict.js:108-112`（code VMU_INVALID_ARGUMENT），`fidelityAsked`
  // `vibe-math-vmu/packs/v5r/verification-gates.js:347-376`（VMU_PACK_V5R_FIDELITY_ASK_REQUIRED）。
  // 所以断言一字未动，只把人口补齐（补上 M2）：人口规则是后来轮次立的，套件（b70a69ec）写成时人口还是「发过言者」。
  const dupVerdict = await receipt(v5rBoot, 'vibe_v5_verdict_final', {
    meeting: withTitle.parsed.meeting, proposition_id: 'c-mid',
    verdicts: [{ member: M1, p: 1, reason: 'x' }, { member: M1, p: 0, reason: 'y' }, { member: M2, p: 1, reason: '复核通过' }],
  })
  ok(dupVerdict.parsed && dupVerdict.parsed.ok === false && codeOf(dupVerdict.parsed) === 'VMU_INVALID_ARGUMENT',
    '★★ 反：同一个人两条裁决 ⇒ 内核具名拒，原样透出（不静默合并）', dupVerdict.parsed && codeOf(dupVerdict.parsed))

  // ── 7. ④ THE FIDELITY QUESTION BEFORE A NUMBER IS ANNOUNCED ───────────────────────────────────────────────
  console.log('=== 7. ④ Lean 已过但 p≠1 ⇒ 必须先把「符合性」问清楚，才允许宣布裁决 ===')
  const askNeeded = await receipt(v5rBoot, 'vibe_v5_verdict_final', {
    meeting: withTitle.parsed.meeting, proposition_id: 'c-mid', lean_passed: true,
    verdicts: [{ member: M1, p: 0.9, reason: '基本一致' }, { member: M2, p: 0.9, reason: '也基本一致' }],
  })
  ok(askNeeded.parsed && askNeeded.parsed.ok === false && codeOf(askNeeded.parsed) === 'VMU_PACK_V5R_FIDELITY_ASK_REQUIRED',
    '★★★ 反：lean 通过 + p≠1 + 没回答符合性问题 ⇒ 具名拒（先问，再宣布）', askNeeded.parsed && codeOf(askNeeded.parsed))
  ok(askNeeded.parsed && /conform/.test(String(askNeeded.parsed.message)) && /defect/.test(String(askNeeded.parsed.message)),
    '★ 反：拒绝里带着两个合法答案（prompt 不让人猜格式）', askNeeded.parsed && (askNeeded.parsed.message || '').slice(0, 100))
  const answered = await receipt(v5rBoot, 'vibe_v5_verdict_final', {
    meeting: withTitle.parsed.meeting, proposition_id: 'c-mid', lean_passed: true, fidelity: 'conform',
    verdicts: [{ member: M1, p: 0.9, reason: '基本一致' }, { member: M2, p: 0.9, reason: '也基本一致' }],
  })
  ok(answered.parsed && answered.parsed.ok === true,
    '★★ 正：回答了符合性（conform）之后裁决可以宣布', answered.parsed && (answered.parsed.code || 'ok'))

  // ── 8. NO AUTOMATIC AGGREGATION ON CLOSE (the ruling stays an EXPLICIT act) ───────────────────────────────
  console.log('=== 8. 反：关会不会自动聚合 —— 裁决必须是一次显式签名，不是一次静默推断 ===')
  const before = kernel.meetingverdict && typeof kernel.meetingverdict.status === 'function'
    ? kernel.meetingverdict.status() : null
  const closed = await receipt(v5rBoot, 'vibe_vmu_meeting', { action: 'close', meeting: withTitle.parsed.meeting, actor: CHAIR, member: CHAIR })
  ok(closed.parsed && closed.parsed.ok === true, '前置：主席能把会议关掉', closed.parsed && codeOf(closed.parsed))
  const after = kernel.meetingverdict && typeof kernel.meetingverdict.status === 'function'
    ? kernel.meetingverdict.status() : null
  ok(before !== null && after !== null && Number(after.rulings) === Number(before.rulings),
    '★★★ 反：关会之后 ruling 次数没变（close 上没有挂自动聚合钩子）', { before: before && before.rulings, after: after && after.rulings })
  const toolsSrc = await readFile(join(REPO, 'vibe-math-vmu', 'packs', 'v5r', 'tools.js'), 'utf8')
  ok(!/on\(\s*'meetings\/close'/.test(toolsSrc) && !/hook:\s*'meetings\/close'/.test(toolsSrc),
    '★★ 反（源码面）：这个面没有注册 meetings/close 钩子', toolsSrc.length)
} finally {
  await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 })
}

console.log('\n=== VMU V5R VERDICT FINAL: ' + passed + ' passed, ' + failed + ' failed ===')
if (failures.length) { console.log('FAILURES:'); for (const f of failures) console.log('  - ' + f) }
if (failed > 0) process.exit(1)

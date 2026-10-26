// tests/vmu-run31-ruling-channel.test.mjs — LIVE RUN 31: THE MEMBERS' OWN FINAL RULING HAD NO CHANNEL, SO THE CHAIR
// WROTE EVERYONE'S NUMBER AND `coverage.complete:true` COUNTED THE ROSTER.
//
// WHAT THE RUN SAID (run 31, log `_oneoff/vm-slv/full-1026-191645.jsonl`, member session
// 6e2e2e81-0127-4a60-9dea-8c4db7e723a9, tool/result seq 84). The rule is 「待辩论会议结束，v5r框架请各个辩论的各个成员
// 给出最终裁决（布尔概率+理由）」 then 「全部一致为 1/0 则取该值，否则取算术平均」 and 「并通知命题卡持有者改卡」.
// The framework asked (the mail went out, `kind:"final-ruling-request"`), the member TRIED to answer, and the tool face
// answered with a TRUE refusal that named only the ballot:
//   {"ok":false,"code":"VMU_NO_SUCH_OBJECT","message":"no LIVE ballot with id p-r31",
//    "hint":"the ballot must be open; the original cast verdicts on the object under verification"}
// The member concluded 「I cannot vote without a ballot」 and put its opinion in a progress note instead. The chair then
// had exactly one way to produce a ruling — type every member's number into `vibe_v5_verdict_final.verdicts` — and
// `coverage.complete:true` was computed from the DEBATED ROSTER, not from anything a member filed. Two readings lied:
// "the members ruled" (nobody did) and (F4) `notified:["res-01"]` beside `delivery.result{delivered:0,queued:1}` (a
// queued copy read as "the owner has been told").
//
// WHAT THIS SUITE PINS (all through the REAL entry, a real kernel, a real durable root — a receipt is never the evidence
// that a mechanism ran):
//   A. the member half is REACHABLE: `vibe_v5_verdict { meeting, proposition_id, verdict, reason, member }` files a
//      ruling CARD under Members/<member>/Propos/, the receipt says it is YOUR ruling and that it enters the tally, and
//      the identical call twice is ONE ruling (idempotent) while a different number is refused by name;
//   B. the chair half COLLECTS: `vibe_v5_verdict_final { meeting, proposition_id }` with NO `verdicts` adopts the filed
//      rulings, `attribution` says whose number came from which submission (card id + path), and `coverage` keeps
//      `debated` / `submitted` / `typed` / `missing` apart — a member who debated and filed nothing is NAMED;
//   C. the channel CROSSES KERNELS: run 31's members ran in their own kernel instance (activation delivery), so the
//      second kernel in this suite writes the ruling and the CHAIR's kernel reads it back from disk;
//   D. the card the notice points at has a WRITABLE ADDRESS when it has one (a library card ⇒ its file), and says so
//      honestly when it has none (a records row);
//   E. F3: the pointer to the CLOSURE vote names the receipt that actually carries it (`vibe_vmu_status { detail:
//      "closure" }`), not `vibe_vmu_meeting { action: "status" }` (verified: that receipt has no `closureVote` key);
//   F. F4: `notification.state` separates "pushed into a live turn" from "waiting in the inbox", so `notified` can no
//      longer be read as "the owner has seen it";
//   G. the BALLOT face is untouched: the run-31 refusal is still the run-31 refusal, a live ballot still takes a cast,
//      and an out-of-range verdict is still refused.
//
// RULE E: every loop/`every()` is preceded by an explicit NON-EMPTY assertion, and every "it worked" is read back from
// disk / records / the mailbox.
//
// Run: node tests/vmu-run31-ruling-channel.test.mjs
// Last line: === VMU RUN31 RULING CHANNEL: N passed, M failed ===

import { existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..')
const imp = (p) => import(pathToFileURL(resolve(REPO, p)).href)

const entry = await imp('vibe-math-vmu/vibe-math-vmu.js')
const packMod = await imp('vibe-math-vmu/packs/v5r/tools.js')
const V5R_PACK_TOOLS = packMod.default || packMod.V5R_PACK_TOOLS

let passed = 0
let failed = 0
const failures = []
const ok = (cond, label, detail) => {
  if (cond) { passed++; console.log('  ok   ' + label); return true }
  failed++; failures.push(label + (detail === undefined ? '' : ' [' + JSON.stringify(detail).slice(0, 400) + ']'))
  console.log('  FAIL ' + label + (detail === undefined ? '' : ' [' + JSON.stringify(detail).slice(0, 400) + ']'))
  return false
}

console.log('=== VMU RUN31 RULING CHANNEL ===')

// ── HARNESS ────────────────────────────────────────────────────────────────────────────────────────────────────────
// The SAME shape the other vmu suites use: the real entry, `packs:['v5r']`, a real root, and the pack faces driven
// through the registered host spec (so what is exercised is the wire the model calls, not the handler directly).
const boot = async (config = {}) => {
  const state = { specs: [] }
  const ctx = {
    effect(fn) { return fn() },
    on() { return () => {} },
    tools: { register: async (spec) => { state.specs.push(spec); return () => {} } },
  }
  const handle = entry.apply(ctx, Object.assign({ clock: () => 1000 }, config))
  await handle.ready()
  return { handle, state, names: state.specs.map((s) => s.name), specOf: (n) => state.specs.find((s) => s.name === n) }
}
const call = async (b, name, args = {}, exec = {}) => {
  const spec = b.specOf(name)
  if (!spec) return { parsed: { ok: false, code: 'VMU_TEST_NO_SUCH_TOOL', message: 'tool ' + name + ' was not registered' }, missing: true }
  try { return { parsed: JSON.parse(await spec.execute(args, exec)) } } catch (e) {
    return { parsed: { ok: false, code: (e && e.code) || 'VMU_TEST_THROWN', message: (e && e.message) || String(e), hint: (e && e.hint) || null } }
  }
}
const R = async (b, name, args = {}, exec = {}) => (await call(b, name, args, exec)).parsed
const codeOf = (r) => (r && r.code ? String(r.code) : null)
// The DECLARATION is the face the model reads, so it is asserted too (see §F) — declared once, used from both places.
const decl = (n) => V5R_PACK_TOOLS.filter((t) => t && t.name === n)[0] || null

// ★ TEMP FILES stay under the task's own scratch root (never in the repo).
const TMP = 'D:/_tmp/r31/ruling-channel'
mkdirSync(TMP, { recursive: true })
const rootA = mkdtempSync(join(TMP, 'k-'))
const roots = [rootA]

try {
  // ── SETUP: the institute run 31 actually had ─────────────────────────────────────────────────────────────────────
  const A = await boot({ root: rootA, packs: ['v5r'] })
  const kernel = A.handle.kernel
  const CHAIR = 'acad-01'
  const M1 = 'res-01'
  const M2 = 'res-02'
  for (const [id, slot] of [[CHAIR, 'chair'], [M1, 'member'], [M2, 'member']]) await kernel.members.hire({ id, slot })
  const roster = kernel.members.roster().map((m) => String(m.id))
  ok(roster.includes(CHAIR) && roster.includes(M1) && roster.includes(M2),
    '前置(RULE E)：三个真实成员在位（下面读的都是真记录/真文件，不是回执的自述）', roster)

  // The proposition card run 31 recorded (`p-r31`, p=0.5, authored by res-01) — the shape the ruling is about.
  const card = await R(A, 'vibe_v5_record_proposition',
    { id: 'p-r31', statement: '1+1=2（run31 验收卡，仅供验收）', value: 1, motive: 'run31 验收', p: 0.5, member: M1 })
  ok(card && card.ok === true, '前置：命题卡 p-r31 已记录（p=0.5，持有者 res-01）', card && { ok: card.ok, code: card.code })
  const m1 = await R(A, 'vibe_v5_meeting', { agenda: 'run31 复现：p-r31 的辩论', kind: 'sync', member: CHAIR })
  ok(m1 && m1.ok === true && typeof m1.meeting === 'string', '前置：会议 m1 已召开（主席 acad-01）', m1 && { ok: m1.ok, meeting: m1.meeting })
  const MEET = m1.meeting

  // ── A. THE MEMBER HALF IS REACHABLE (and it is the member's OWN act) ─────────────────────────────────────────────
  console.log('=== A. 成员自己能提交裁决：这曾是一条不存在的通道 ===')
  // ★ FIRST: the mail the chair sends must NAME THE CALL. Run 31's member was asked for a ruling and told no way to give
  // one, so it guessed at the ballot face. The instruction sheet is the fix, and it is asserted as the member reads it.
  const asked = await R(A, 'vibe_v5_verdict_ask', { meeting: MEET, proposition_id: 'p-r31', member: CHAIR })
  ok(asked && asked.ok === true, 'A0 前置：主席发出了裁决请求（邮件已投递）', asked && { ok: asked.ok, code: asked.code })
  const mailText = String((asked && asked.mail && asked.mail.text) || '')
  ok(mailText.includes('vibe_v5_verdict { meeting: "' + MEET + '", proposition_id: "p-r31"'),
    '★★★ A1 邮件正文写出了成员该调用的**确切**调用（run 31 的成员只能猜票箱）', { text: mailText.slice(0, 320) })
  ok(mailText.includes('不要传 target') && mailText.includes('命题卡不是票箱'),
    '★★ A2 邮件同时说清「不要传 target」以及原因（票箱只对"待核验对象"开放）', { text: mailText.slice(0, 420) })
  ok(asked.memberCall === 'vibe_v5_verdict { meeting, proposition_id, verdict, reason, member }',
    '★★ A3 回执与邮件说同一件事：`memberCall` 就是邮件教的那个调用', { memberCall: asked.memberCall })
  ok(asked.how === 'vibe_v5_verdict_final' && typeof asked.howMeans === 'string' && asked.howMeans.includes('OMITS `verdicts`'),
    '★★ A4 `how` 仍是工具名，形状说明在 `howMeans`（并说明汇总时省略 verdicts）', { how: asked.how })

  // ★ THE SUBMISSION ITSELF — the call run 31's member could not make. No `target`.
  const filed = await R(A, 'vibe_v5_verdict',
    { meeting: MEET, proposition_id: 'p-r31', verdict: 1, reason: '构造性证明成立（1+1=2）', member: M1 })
  ok(filed && filed.ok === true && filed.channel === 'ruling',
    '★★★ A5 成员用 meeting+proposition_id（不传 target）真的提交了自己的裁决 ⇒ channel:"ruling"', filed && { ok: filed.ok, code: filed.code, message: filed.message, hint: filed.hint })
  ok(filed && filed.submission && filed.submission.member === M1 && filed.submission.meeting === MEET
    && filed.submission.proposition === 'p-r31' && Number(filed.submission.verdict) === 1,
    '★★ A6 回执的 submission 写明是谁、对哪场会议、哪个命题、给了什么数', filed && filed.submission)
  ok(filed && typeof filed.submission.path === 'string' && existsSync(filed.submission.path),
    '★★★ A7 裁决真的落成了一张**磁盘上的卡**（路径存在，不是回执自称已写）', filed && filed.submission.path)
  const rulingPath = filed && filed.submission && filed.submission.path
  const rulingBody = rulingPath && existsSync(rulingPath) ? await readFile(rulingPath, 'utf8') : ''
  ok(rulingBody.includes('VMU-RULING ') && rulingBody.includes('"member":"' + M1 + '"') && rulingBody.includes('"verdict":1'),
    '★★ A8 卡正文里的机读载荷带 member/verdict（汇总从磁盘读它，不解析散文）', { body: rulingBody.slice(0, 240) })
  ok(rulingBody.includes('对命题 p-r31 的最终裁决') && rulingBody.includes(M1),
    '★ A9 卡上有一句人读的话（谁对哪个命题裁了什么），不是只有 JSON', { body: rulingBody.slice(0, 200) })
  const meansA = String((filed && filed.means) || '')
  ok(meansA.includes('YOUR') && /chair does not write this number/i.test(meansA),
    '★★★ A10 回执用调用者的词汇说「这是**你的**裁决」并且「主席不替你写这个数」', { means: meansA.slice(0, 240) })
  ok(filed && filed.rosterChecked === true && typeof filed.rosterCheckedMeans === 'string',
    '★ A11 本会话读得到辩论名册 ⇒ 归还前已核对（rosterChecked:true 并说明）', filed && { rosterChecked: filed.rosterChecked, src: filed.rosterSource })

  // ★ IDEMPOTENT: the same act twice is one ruling — not an error the member has to work around.
  const again = await R(A, 'vibe_v5_verdict',
    { meeting: MEET, proposition_id: 'p-r31', verdict: 1, reason: '构造性证明成立（1+1=2）', member: M1 })
  ok(again && again.ok === true && again.idempotent === true && again.duplicate === true,
    '★★ A12 完全相同地再提交一次 ⇒ 幂等（idempotent/duplicate:true），不是第二次写卡', again && { ok: again.ok, idempotent: again.idempotent, code: again.code })
  ok(again && again.submission && again.submission.id === filed.submission.id,
    '★★ A13 幂等回执指回同一张卡（同一个 submission.id）', again && { a: again.submission && again.submission.id, b: filed.submission.id })
  const heads1 = await kernel.library.list({ kind: 'proposition' })
  const rulingHeads = (Array.isArray(heads1) ? heads1 : []).filter((h) => String(h.status || '') === 'ruling')
  ok(rulingHeads.length === 1, '★★★ A14 磁盘上关于 p-r31 的裁决卡**只有一张**（幂等不是只有回执这么说）', rulingHeads.map((h) => h.id))

  // ★ A DIFFERENT NUMBER AFTER A FILED RULING IS REFUSED BY NAME — a filed ruling is the member's act, not a draft.
  const flip = await R(A, 'vibe_v5_verdict',
    { meeting: MEET, proposition_id: 'p-r31', verdict: 0, reason: '改主意了', member: M1 })
  ok(flip && flip.ok === false && codeOf(flip) === 'VMU_RULING_ALREADY_FILED',
    '★★★ A15 已提交后又提交**不同的**数值 ⇒ 具名拒 VMU_RULING_ALREADY_FILED', flip && { code: codeOf(flip) })
  ok(flip && typeof flip.message === 'string' && flip.message.includes(M1) === false && flip.message.includes('already filed a DIFFERENT ruling'),
    '★ A16 拒绝消息说清「你已经提交过不同的裁决」并带上先前的值', flip && String(flip.message).slice(0, 220))
  ok(flip && typeof flip.hint === 'string' && flip.hint.includes(filingPath(filed)),
    '★ A17 hint 指名那张已提交的卡（在哪、叫什么），而不是只说 forbidden', flip && String(flip.hint).slice(0, 260))

  // ★ A NON-DEBATER IS REFUSED BY NAME — and the name is the membership the MEETING recorded, not a caller claim.
  const outsider = await R(A, 'vibe_v5_verdict',
    { meeting: MEET, proposition_id: 'p-r31', verdict: 1, reason: '我没参加辩论', member: 'res-99' })
  ok(outsider && outsider.ok === false && codeOf(outsider) === 'VMU_RULING_NOT_DEBATER',
    '★★★ A18 非辩论成员提交 ⇒ 具名拒 VMU_RULING_NOT_DEBATER', outsider && { code: codeOf(outsider) })
  ok(outsider && typeof outsider.hint === 'string' && outsider.hint.includes(M1) && outsider.hint.includes(M2),
    '★★ A19 拒绝的 hint 逐名列出该辩论的真实成员（不是一句"你不在名单里"）', outsider && String(outsider.hint).slice(0, 220))

  // ★ THE CHAIR DOES NOT FILE A MEMBER RULING: it signs the tally. Two acts, two faces.
  const chairFiled = await R(A, 'vibe_v5_verdict',
    { meeting: MEET, proposition_id: 'p-r31', verdict: 1, reason: '主席自己写', member: CHAIR })
  ok(chairFiled && chairFiled.ok === false && codeOf(chairFiled) === 'VMU_RULING_CHAIR_SIGNS',
    '★★★ A20 主席用成员通道提交 ⇒ 具名拒 VMU_RULING_CHAIR_SIGNS（两件事两个面）', chairFiled && { code: codeOf(chairFiled) })

  // ★ NO CHANNEL AT ALL IS NAMED, AND IT TEACHES BOTH FACES — run 31's defect was a refusal that named only the ballot.
  const nowhere = await R(A, 'vibe_v5_verdict', { verdict: 1, reason: '不知道传给谁', member: M1 })
  ok(nowhere && nowhere.ok === false && codeOf(nowhere) === 'VMU_RULING_NEEDS_CHANNEL',
    '★★★ A21 既没有 target 也没有 meeting+proposition_id ⇒ 具名拒 VMU_RULING_NEEDS_CHANNEL', nowhere && { code: codeOf(nowhere) })
  ok(nowhere && typeof nowhere.hint === 'string' && nowhere.hint.includes('target') && nowhere.hint.includes('proposition_id'),
    '★★ A22 这个拒绝同时教两条路（票箱 / 裁决）——不再只指票箱', nowhere && String(nowhere.hint).slice(0, 240))

  // ── G. THE BALLOT FACE IS UNTOUCHED (same refusal, same success, same range check) ───────────────────────────────
  console.log('=== G. 票箱语义未受影响：run 31 的那条拒绝仍是那条拒绝 ===')
  const noBallot = await R(A, 'vibe_v5_verdict', { target: 'p-r31', verdict: 1, reason: 'run31 原样复现', member: M1 })
  ok(noBallot && noBallot.ok === false && codeOf(noBallot) === 'VMU_NO_SUCH_OBJECT' && noBallot.message === 'no LIVE ballot with id p-r31',
    '★★★ G1 用命题 id 当票箱 target ⇒ 仍是 run 31 的原文拒绝（no LIVE ballot with id p-r31）', noBallot && { code: codeOf(noBallot), message: noBallot.message })
  ok(noBallot && noBallot.hint === 'the ballot must be open; the original cast verdicts on the object under verification',
    '★★ G2 连 hint 都没改：票箱面的说明与 run 31 逐字相同', noBallot && noBallot.hint)
  const live = kernel.ballot({ id: 'b-live-1', question: 'run31 活票箱对照' })
  ok(live && typeof live.cast === 'function', 'G3 前置：造出一个 LIVE 票箱（下面的正例才有对象）', !!live)
  await live.open({ by: M1 })
  ok(live.status().state === 'open', 'G3b 前置：票箱真的 OPEN 了（默认是 closed —— 打开是异步面）', live.status().state)
  const cast = await R(A, 'vibe_v5_verdict', { target: 'b-live-1', verdict: 1, reason: '照常投票', member: M1 })
  ok(cast && cast.ok === true && cast.target === 'b-live-1' && cast.kind === 'decisive' && cast.channel === undefined,
    '★★★ G4 活票箱照常收票（回执形态不变：target/kind/receipt，没有 channel:ruling）', cast && { ok: cast.ok, code: cast.code, keys: Object.keys(cast || {}).slice(0, 10), message: cast.message })
  const outOfRange = await R(A, 'vibe_v5_verdict', { target: 'b-live-1', verdict: 2, member: M1 })
  ok(outOfRange && outOfRange.ok === false && codeOf(outOfRange) === 'VMU_INVALID_ARGUMENT',
    '★★ G5 越界数值照常具名拒（票箱路径的校验没被裁决路径挤掉）', outOfRange && { code: codeOf(outOfRange) })

  // ── A-NOLEDGER: a session with no durable root cannot file, and SAYS SO ───────────────────────────────────────────
  // A bare deployment (no `root`) assembles no library face at all: a ruling there would have nowhere to live, so the
  // refusal is named BEFORE anything is written — "filed" without a ledger is exactly the fake coverage this replaces.
  const noLedgerKernel = {}
  let noLedger = null
  try {
    await decl('vibe_v5_verdict').handler({ meeting: 'm1', proposition_id: 'p-r31', verdict: 1, reason: 'x', member: M1 }, { kernel: noLedgerKernel })
  } catch (e) { noLedger = e }
  ok(noLedger && noLedger.code === 'VMU_RULING_NO_LEDGER',
    '★★★ A24 没有持久库的会话提交裁决 ⇒ 具名拒 VMU_RULING_NO_LEDGER（绝不假称已提交）', noLedger && { code: noLedger.code, message: String(noLedger.message).slice(0, 200) })
  ok(noLedger && typeof noLedger.hint === 'string' && noLedger.hint.includes('config.root'),
    '★★ A25 拒绝的 hint 指认部署缺的是哪一块（config.root），不是"提交失败"', noLedger && String(noLedger.hint).slice(0, 220))

  // ── B. THE CHAIR COLLECTS: attribution, debated-vs-submitted, NAMED missing ──────────────────────────────────────
  console.log('=== B. 主席收集并采纳：谁的数来自哪个提交、谁缺席 ===')
  // Only res-01 has filed; res-02 debated and filed nothing. The chair does NOT type anything.
  const short = await R(A, 'vibe_v5_verdict_final', { meeting: MEET, proposition_id: 'p-r31', member: CHAIR })
  ok(short && short.ok === false && codeOf(short) === 'VMU_STATE' && String(short.message).includes(M2),
    '★★★ B1 只收到部分裁决、且不声明 partial ⇒ 具名拒，并**逐名**点名缺席的 res-02', short && { code: codeOf(short), message: short.message })
  const shortNoWhy = await R(A, 'vibe_v5_verdict_final', { meeting: MEET, proposition_id: 'p-r31', member: CHAIR, partial: true })
  ok(shortNoWhy && shortNoWhy.ok === false && codeOf(shortNoWhy) === 'VMU_INVALID_ARGUMENT',
    '★★ B2 partial:true 却不给 why ⇒ 具名拒（部分裁决必须说明为什么可以部分）', shortNoWhy && { code: codeOf(shortNoWhy) })
  const partial = await R(A, 'vibe_v5_verdict_final',
    { meeting: MEET, proposition_id: 'p-r31', member: CHAIR, partial: true, why: 'res-02 尚未回执，先按已提交集裁一次' })
  ok(partial && partial.ok === true, '★★★ B3 partial+why ⇒ 收（部分裁决是声明的选择，不是静默放宽）', partial && { ok: partial.ok, code: partial.code, message: partial.message })
  const cov = (partial && partial.coverage) || {}
  ok(Array.isArray(cov.debated) && cov.debated.length === 2 && cov.debated.includes(M1) && cov.debated.includes(M2),
    '★★★ B4 coverage.debated 是辩论名册（2 人，逐名）——不是"有裁决的人"', cov.debated)
  ok(Array.isArray(cov.submitted) && cov.submitted.length === 1 && cov.submitted[0] === M1 && cov.submittedCount === 1,
    '★★★ B5 ★ coverage 把 submitted 单独列出来：只有 res-01 真的提交了', cov.submitted)
  ok(Array.isArray(cov.missing) && cov.missing.length === 1 && cov.missing[0] === M2 && cov.complete === false,
    '★★★ B6 coverage.missing 逐名点名 res-02，complete:false —— 这就是 run 31 里谎报的 complete:true', { missing: cov.missing, complete: cov.complete })
  ok(cov.adoptedFromSubmissions === 1 && cov.typedCount === 0 && Array.isArray(cov.typed) && cov.typed.length === 0,
    '★★★ B7 ★ adoptedFromSubmissions=1 / typed=0：主席一个数都没替人写', { adopted: cov.adoptedFromSubmissions, typed: cov.typed })
  const attr = Array.isArray(partial && partial.attribution) ? partial.attribution : []
  ok(attr.length === 1, '★★ B8 前置(RULE E)：attribution 有一行可查（否则下面的逐条断言不算数）', attr.length)
  const row1 = attr.filter((r) => r.member === M1)[0] || null
  ok(row1 && row1.source === 'submission' && row1.submission && row1.submission.id === filed.submission.id,
    '★★★ B9 ★ 逐条归因：res-01 的那一行 source:"submission"，并带**那张卡的 id**', row1)
  ok(row1 && row1.submission && typeof row1.submission.path === 'string' && row1.submission.path === filingPath(filed),
    '★★ B10 归因还带提交卡的路径（可点开核对，不是"框架说它提交了"）', row1 && row1.submission)
  ok(partial && Number(partial.value) === 1 && partial.mode === 'unanimous',
    '★★ B11 已提交集全体一致为 1 ⇒ 最终值 1（同一套聚合：一致取该值）', partial && { value: partial.value, mode: partial.mode })

  // ★ THE OLD REFUSAL STAYS: an EXPLICIT empty `verdicts` is still refused (it is a caller saying "here are none").
  const explicitEmpty = await R(A, 'vibe_v5_verdict_final', { meeting: MEET, proposition_id: 'p-r31', member: CHAIR, verdicts: [] })
  ok(explicitEmpty && explicitEmpty.ok === false && codeOf(explicitEmpty) === 'VMU_INVALID_ARGUMENT',
    '★★ B12 显式传 verdicts:[] 仍被拒（旧规则保留；"省略"才是采纳成员提交）', explicitEmpty && { code: codeOf(explicitEmpty) })

  // ★ A CHAIR NUMBER THAT CONTRADICTS A FILED RULING IS REFUSED BY NAME — never silently preferred.
  const contradict = await R(A, 'vibe_v5_verdict_final',
    { meeting: MEET, proposition_id: 'p-r31', member: CHAIR,
      verdicts: [{ member: M1, p: 0, reason: '主席认为否' }, { member: M2, p: 1, reason: '主席替 res-02 写的' }] })
  ok(contradict && contradict.ok === false && codeOf(contradict) === 'VMU_RULING_CONTRADICTS_SUBMISSION',
    '★★★ B13 主席手打的数与成员提交的数冲突 ⇒ 具名拒 VMU_RULING_CONTRADICTS_SUBMISSION', contradict && { code: codeOf(contradict) })
  ok(contradict && String(contradict.message).includes(M1),
    '★★ B14 冲突拒绝逐名点名是谁的提交被覆盖', contradict && String(contradict.message).slice(0, 240))

  // ── C. THE CHANNEL CROSSES KERNELS (run 31's actual topology) ─────────────────────────────────────────────────────
  console.log('=== C. 跨内核：成员在自己的内核里提交，主席的内核从磁盘读回 ===')
  // Run 31 ran every member turn in ITS OWN kernel instance (activation delivery), so a submission that only lived in the
  // member's memory would be invisible to the chair. The second kernel here shares the ROOT and nothing else.
  const B = await boot({ root: rootA, packs: ['v5r'] })
  const kB = B.handle.kernel
  // ★ The SECOND kernel is a different instance. Its roster is readable because the roster itself is durable state
  // (store key `members`) — that is NOT what the ruling needs: a ruling that only lived in the member's own memory
  // would still be invisible to the chair, which is why it is filed as a CARD ON DISK (§C4 below).
  ok(kB !== kernel && kB.members.roster().length === roster.length,
    'C0 前置：第二个内核是**另一个**实例（名册是持久状态所以同一份；裁决不靠内存共享）', { same: kB === kernel, roster: kB.members.roster().length })
  const fromB = await R(B, 'vibe_v5_verdict', { meeting: MEET, proposition_id: 'p-r31', verdict: 1, reason: '复核通过（在成员自己的内核里提交）', member: M2 })
  ok(fromB && fromB.ok === true && fromB.channel === 'ruling',
    '★★★ C1 成员在自己的内核实例里提交裁决 ⇒ 成功（不需要那台内核有名册/会议）', fromB && { ok: fromB.ok, code: fromB.code, message: fromB.message, hint: fromB.hint })
  // ★ THE RECEIPT MUST AGREE WITH ITSELF about whether the debate was readable HERE: `rosterChecked` is the fact and
  // `rosterCheckedMeans` is its sentence. A receipt that claims a check it did not do is the run-31 defect class.
  const meansB = String((fromB && fromB.rosterCheckedMeans) || '')
  ok(fromB && (fromB.rosterChecked === true
    ? /was readable in this session, so your membership in it was checked/.test(meansB)
    : /could not read who debated/.test(meansB) && /chair/.test(meansB)),
    '★★★ C2 ★ `rosterChecked` 与它的句子必须一致（读得到就说核对过；读不到就把核对交给主席，绝不假称核对过）', fromB && { checked: fromB.rosterChecked, means: meansB.slice(0, 200) })
  // ★ AND THE UNREADABLE CASE REALLY EXISTS: a bare kernel on a FRESH root has no roster and no meeting at all — the
  // shape run 31's member sat in. There the submission still files, and the receipt says the check moved to the chair.
  const rootC = mkdtempSync(join(TMP, 'bare-'))
  roots.push(rootC)
  const C = await boot({ root: rootC, packs: ['v5r'] })
  ok(C.handle.kernel.members.roster().length === 0, 'C2a 前置：这台内核没有名册（run 31 成员侧的形状）', C.handle.kernel.members.roster().length)
  const fromC = await R(C, 'vibe_v5_verdict', { meeting: 'm-z', proposition_id: 'p-z', verdict: 0.5, reason: '读不到名册时提交', member: M1 })
  ok(fromC && fromC.ok === true && fromC.rosterChecked === false && /could not read who debated/.test(String(fromC.rosterCheckedMeans))
    && /chair/i.test(String(fromC.rosterCheckedMeans)),
    '★★★ C2b ★ 读不到辩论名册时**仍能提交**，回执如实写 rosterChecked:false 并把核对交给主席', fromC && { ok: fromC.ok, checked: fromC.rosterChecked, means: String(fromC.rosterCheckedMeans).slice(0, 200) })
  ok(fromB && fromB.submission && typeof fromB.submission.path === 'string' && fromB.submission.path.includes(join('Members', M2, 'Propos')),
    '★★ C3 第二台内核把卡写进了 res-02 自己的目录（按成员分目录 ⇒ 并发安全）', fromB && fromB.submission.path)

  const seenByA = await kernel.library.list({ kind: 'proposition' })
  const rulingIdsA = (Array.isArray(seenByA) ? seenByA : []).filter((h) => String(h.status || '') === 'ruling').map((h) => String(h.id))
  ok(rulingIdsA.includes(String(fromB.submission.id)),
    '★★★ C4 主席的内核从磁盘读到了另一台内核写的卡（"卡 id 在 A 的表里"不是同一进程的巧合）', { id: fromB.submission.id, ids: rulingIdsA })

  const collect = await R(A, 'vibe_v5_verdict_final', { meeting: MEET, proposition_id: 'p-r31', member: CHAIR })
  ok(collect && collect.ok === true, '★★★ C5 全员都提交后，主席不传 verdicts 就能汇总（收集成功）', collect && { ok: collect.ok, code: collect.code, message: collect.message })
  const covC = (collect && collect.coverage) || {}
  ok(covC.complete === true && Array.isArray(covC.missing) && covC.missing.length === 0 && covC.adoptedFromSubmissions === 2,
    '★★★ C6 coverage.complete:true 这次是**真的**：2 个提交、0 缺席（run 31 的 true 数的是名册）', { complete: covC.complete, missing: covC.missing, adopted: covC.adoptedFromSubmissions })
  const attrC = Array.isArray(collect && collect.attribution) ? collect.attribution : []
  ok(attrC.length === 2, '★★ C7 前置(RULE E)：两个辩论成员各一行归因', attrC.map((r) => r.member))
  const row2 = attrC.filter((r) => r.member === M2)[0] || null
  ok(attrC.every((r) => r.source === 'submission') && row2 && row2.submission && row2.submission.id === fromB.submission.id,
    '★★★ C8 两行都来自提交，且 res-02 那行指向**另一台内核**写的那张卡', row2)
  ok(Number(collect.value) === 1 && collect.mode === 'unanimous',
    '★★ C9 两个 1 ⇒ 一致取 1（聚合规则未变）', collect && { value: collect.value, mode: collect.mode })

  // ── F4 + F3 on the SAME receipt ──────────────────────────────────────────────────────────────────────────────────
  console.log('=== F4/F3. 读数不再骗人：notified 的含义、以及闭题票的正确指路 ===')
  ok(Array.isArray(collect.notified) && collect.notified.includes(M1),
    'F4-1 前置：卡持有者 res-01 的信箱里有这份通知（notified 非空）', collect && collect.notified)
  const dr = (collect && collect.delivery && collect.delivery.result) || {}
  ok(Number(dr.delivered) === 0 && Number(dr.queued) >= 1,
    'F4-2 前置：投递面确实报告 delivered:0 / queued>=1（run 31 的那对数字）', { delivered: dr.delivered, queued: dr.queued })
  const notif = (collect && collect.notification) || {}
  ok(notif.state === 'queued' && notif.delivered === 0 && notif.queued >= 1 && notif.inboxCopy === true,
    '★★★ F4-3 ★ notification.state:"queued" 把"在信箱里"与"已经送达"分开（并原样带 delivered/queued）', notif)
  ok(typeof notif.means === 'string' && /NOT read|has NOT read/i.test(notif.means) && /not "the owner has seen it"/i.test(notif.means),
    '★★★ F4-4 ★ 句子明说「入箱 ≠ 已读」，不许把 queued 读成"持有者已经知道"', String(notif.means).slice(0, 260))
  ok(typeof collect.notifiedMeans === 'string' && /not "read"/i.test(collect.notifiedMeans) && /queued|IN the card owner/i.test(collect.notifiedMeans),
    '★★ F4-5 `notifiedMeans` 与 notification 说同一件事（两个字段不会互相打脸）', String(collect.notifiedMeans).slice(0, 260))
  ok(typeof collect.note === 'string' && /QUEUED, not read/i.test(collect.note),
    '★★ F4-6 `note` 里也没有"已通知"的说法（queued 就是 queued）', String(collect.note).slice(0, 200))

  const read = String((collect && collect.closureReading) || '')
  ok(read.includes('vibe_vmu_status { detail: "closure" }'),
    '★★★ F3-1 闭题票的指针改指**真的带这个键**的回执（vibe_vmu_status { detail:"closure" }）', read.slice(0, 200))
  ok(read.includes('`vibe_vmu_meeting { action: "status" }` does NOT'),
    '★★★ F3-2 并且明说旧的指路是错的（那个回执答的是会议对象，不是票数）', read.slice(0, 320))
  ok(!/`vibe_vmu_meeting \{ action: "status" \}` → closureVote/.test(read),
    '★★ F3-3 旧句子（status → closureVote）已经不在了', read.slice(0, 200))
  ok(read.includes('vibe_vmu_meeting { action: "close" }'),
    '★ F3-4 顺带指出真正带 closureVote 的另外两处（close 回执 / turn 回执）', read.slice(0, 260))

  // ── D. THE CARD THE NOTICE POINTS AT: a writable ADDRESS when it has one ──────────────────────────────────────────
  console.log('=== D. 卡能被指向可写路径（有的卡有文件，有的卡没有——两种都如实说） ===')
  const corr = (collect && collect.correction) || {}
  ok(corr.path === null && typeof corr.pathMeans === 'string' && /records row, not a library card/.test(corr.pathMeans),
    '★★★ D1 p-r31 是 records 行 ⇒ path:null，并说明"它没有文件，改它是 records 面的调用"', { path: corr.path, means: corr.pathMeans })
  ok(typeof corr.call === 'string' && corr.call.includes('vibe_v5_record_proposition') && corr.call.includes('debate_ruling'),
    '★★ D2 同一条回执仍带着可执行的改卡调用（run 30 ⑤ 没有被弄丢）', String(corr.call).slice(0, 220))

  // A LIBRARY card, on the other hand, HAS a file — and the receipt must name it.
  const lib = await kernel.library.append(
    { kind: 'proposition', id: 'lib-p1', title: 'library 命题卡', statement: '一个存在成员库里的命题（有真实文件）' },
    { member: CHAIR })
  ok(lib && lib.ok === true && typeof lib.file === 'string' && existsSync(lib.file),
    'D3 前置：造出一张 library 命题卡（有真实文件），否则"指向文件"测不到', lib && lib.file)
  const m3 = await R(A, 'vibe_v5_meeting', { agenda: 'library 命题卡的辩论', kind: 'sync', member: CHAIR })
  ok(m3 && m3.ok === true, 'D4 前置：为 library 卡召开会议', m3 && m3.meeting)
  const libFile = await R(A, 'vibe_v5_verdict', { meeting: m3.meeting, proposition_id: lib.id, verdict: 1, reason: '库卡的裁决', member: M1 })
  ok(libFile && libFile.ok === true, 'D5 前置：成员对 library 卡提交裁决', libFile && { ok: libFile.ok, code: libFile.code })
  const ruledLib = await R(A, 'vibe_v5_verdict_final',
    { meeting: m3.meeting, proposition_id: lib.id, member: CHAIR, owner: CHAIR, partial: true, why: '只等 res-01 一人' })
  const corrLib = (ruledLib && ruledLib.correction) || {}
  ok(ruledLib && ruledLib.ok === true, 'D6 前置：library 卡的裁决汇总成功', ruledLib && { ok: ruledLib.ok, code: ruledLib.code, message: ruledLib.message })
  ok(corrLib.path === lib.file && existsSync(corrLib.path),
    '★★★ D7 library 卡 ⇒ correction.path 就是那个真实文件（"去哪改"可执行）', { path: corrLib.path, file: lib.file })
  ok(corrLib.pathMeans === lib.file && corrLib.cardId === lib.id && corrLib.onRecord === false,
    '★★ D8 同一回执说明它是文件路径、卡 id 是这张库卡、且它不在 records 轨上', { pathMeans: corrLib.pathMeans, cardId: corrLib.cardId, onRecord: corrLib.onRecord })
  ok(typeof corrLib.call === 'string' && corrLib.call.includes(lib.file),
    '★★ D9 改卡说明也点名同一个文件（不是"去改那张卡"）', String(corrLib.call).slice(0, 240))

  // ── E. tool_help 的转发（Lead 增补：同一问题的两个口径不可并存） ─────────────────────────────────────────────────
  console.log('=== E. vibe_v5_tool_help 原样转发 voice/readingScope（有则转发、无则 null，不自行推算） ===')
  const helpEntry = V5R_PACK_TOOLS.filter((t) => t && t.name === 'vibe_v5_tool_help')[0]
  ok(!!helpEntry && typeof helpEntry.handler === 'function', 'E0 前置：声明里有 vibe_v5_tool_help 的 handler', !!helpEntry)
  const fakeWith = { toolsView: () => ({ tools: ['a', 'b'], count: 2, source: 'caller', voice: 'member', readingScope: 'caller-live-agent', callerIsThisMember: true, memberSession: 'child-1', memberSessionMeans: 'M', callerMeans: 'C' }) }
  const withFields = helpEntry.handler({ member: M1 }, { kernel: fakeWith })
  ok(withFields.voice === 'member' && withFields.readingScope === 'caller-live-agent' && withFields.callerIsThisMember === true
    && withFields.memberSession === 'child-1',
    '★★★ E1 内核读数带这些字段时，本面**原样**转发（voice/readingScope/callerIsThisMember/memberSession）', { voice: withFields.voice, scope: withFields.readingScope, session: withFields.memberSession })
  ok(withFields.tool === 'vibe_v5_tool_help' && Array.isArray(withFields.tools) && !/中文|或缺/.test(String(withFields.note)),
    '★★ E2 有字段时 note 不掺"缺席"的说明（不多话）', String(withFields.note).slice(0, 160))
  const fakeWithout = { toolsView: () => ({ tools: null, count: null, source: 'no-live-agent' }) }
  const withoutFields = helpEntry.handler({ member: M1 }, { kernel: fakeWithout })
  ok(withoutFields.voice === null && withoutFields.readingScope === null && withoutFields.callerIsThisMember === null
    && withoutFields.memberSession === null,
    '★★★ E3 内核读数不带这些字段时 ⇒ null（**不自己重算**，否则就是第二套口径）', { voice: withoutFields.voice, scope: withoutFields.readingScope })
  ok(typeof withoutFields.note === 'string' && withoutFields.note.includes('voice') && /null/.test(withoutFields.note),
    '★★ E4 并在 note 里说明「这一侧不存在该读数」，而不是让 null 沉默', String(withoutFields.note).slice(-260))

  // ── F. THE DECLARATION ITSELF (the face the model reads) ──────────────────────────────────────────────────────────
  console.log('=== F. 声明面：两个面都可被调用、都能被读懂 ===')
  const dv = decl('vibe_v5_verdict')
  const dvf = decl('vibe_v5_verdict_final')
  ok(dv && dv.parameters && dv.parameters.target && dv.parameters.target.required !== true,
    '★★★ F1 `vibe_v5_verdict.target` 不再 required（否则宿主层会在 handler 之前就拒掉裁决提交）', dv && dv.parameters.target)
  ok(dv && dv.parameters.meeting && dv.parameters.proposition_id,
    '★★ F2 声明里补上了 `meeting` / `proposition_id`（undeclared 键会被宿主按名拒）', dv && Object.keys(dv.parameters))
  ok(dv && typeof dv.description === 'string' && /BALLOT/i.test(dv.description) && /YOUR FINAL DEBATE RULING/i.test(dv.description),
    '★★★ F3 声明描述把两个面都教了（成员不会只看到票箱那半句）', dv && dv.description.slice(0, 200))
  ok(dvf && dvf.parameters && dvf.parameters.verdicts && dvf.parameters.verdicts.required !== true,
    '★★ F4 `verdict_final.verdicts` 不再 required（"省略"才是采纳成员提交）', dvf && dvf.parameters.verdicts)
  ok(dvf && typeof dvf.description === 'string' && /omit `verdicts`/.test(dvf.description) && /attribution/.test(dvf.description),
    '★ F5 汇总面的描述说明了"省略 verdicts ⇒ 采纳提交"，并点名 attribution', dvf && dvf.description.slice(0, 240))

  // ── H. NO SUBMISSIONS AT ALL IS ITS OWN NAMED REFUSAL ────────────────────────────────────────────────────────────
  console.log('=== H. 无人提交时不得凭空造一个裁决 ===')
  const m2 = await R(A, 'vibe_v5_meeting', { agenda: '另一场没有提交的辩论', kind: 'sync', member: CHAIR })
  ok(m2 && m2.ok === true, 'H0 前置：再开一场会议（下面要在没有提交的会议上汇总）', m2 && m2.meeting)
  const none = await R(A, 'vibe_v5_verdict_final', { meeting: m2.meeting, proposition_id: 'p-none', member: CHAIR, owner: M1 })
  ok(none && none.ok === false && codeOf(none) === 'VMU_RULING_NO_SUBMISSIONS',
    '★★★ H1 一场没人提交、主席也不代写的汇总 ⇒ 具名拒 VMU_RULING_NO_SUBMISSIONS', none && { code: codeOf(none), message: String(none.message).slice(0, 200) })
  ok(none && typeof none.hint === 'string' && /vibe_v5_verdict_ask/.test(none.hint) && /vibe_v5_verdict \{/.test(none.hint)
    && /collects them/i.test(none.hint),
    '★★ H2 拒绝的 hint 同时教「先请成员提交」和「本面自己收集」（不是只说 empty）', none && String(none.hint).slice(0, 260))
} finally {
  for (const r of roots) { try { rmSync(r, { recursive: true, force: true }) } catch { /* keep the last line clean */ } }
}

function filingPath(filedReceipt) {
  return filedReceipt && filedReceipt.submission ? String(filedReceipt.submission.path || '') : ''
}

console.log('')
if (failed === 0) console.log('=== VMU RUN31 RULING CHANNEL: ' + passed + ' passed, 0 failed ===')
else {
  console.log('FAILURES:')
  for (const f of failures) console.log('  - ' + f)
  console.log('=== VMU RUN31 RULING CHANNEL: ' + passed + ' passed, ' + failed + ' failed ===')
  process.exitCode = 1
}

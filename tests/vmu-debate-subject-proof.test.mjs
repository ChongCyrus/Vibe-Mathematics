// tests/vmu-debate-subject-proof.test.mjs — B6（规则：「只有**含正式证明/证伪且已写完**的命题卡才能用于辩论」）
// 的机器闸门禁。
//
// THE DEFECT CLASS THIS PINS：规则说辩论对象必须是「含正式证明或证伪内容、且已经写完」的命题卡，而本轮之前
// 这条判据**没有机器闸**——`debateSubjectGate` 把卡上的 `proofRef + proofState='complete'` 当成放行依据，
// 可那两个字段是**作者自己写进卡体的自述**：作者说"我写完了"就等于"有证明"。这就是「把自报当已证」，
// 与「提示词写了 ≠ 机制存在」同族：一个看起来严的假闸比没有闸更糟（它会让人以为已经核过了）。
//
// 拆法（照 docs/acceptance/conformance/lane-verified-design.md §4 的三层）：
//   ① 声明层（可机器读、**不构成证明**）：卡上 `proofRef` + `proofState:'complete'|'draft'`，成员自述；
//   ② 证据层（机器事实）：该卡有 Lean 作业 settled+passed，**或** 已在 `verified` 轨有定论行 —— 二者任一才放行；
//   ③ 追溯层：声明与证据都记在卡/轨上，"写完"本身不可机器判定，违规由 D13 忠实性审查 + defect 撤回兜底。
//
// WHAT THIS SUITE PROVES（每条都能机器失败）：
//   ① 只有声明、没有证据 ⇒ **放行**，但回执必须写 `proofBasis:"declaration-only"` 并说明「自述不等于已证」
//      （★ live run 8 把这条口径改了：规则要的是「已登记为写完」，而把机器证据也当必要条件会让三条合法形态里两条
//       在本部署不可达——verified 行要先有辩论、lean 要先有 .lean 文件，而 preset 没有建文件的工具 ⇒ 死锁）；
//   ①b 声明与机器证据**矛盾**（指向的 Lean 作业没通过）⇒ `DEBATE_SUBJECT_UNPROVEN`；
//   ② 连声明都没有（或只标 draft）⇒ 拒，码是 `VMU_PACK_V5R_DEBATE_SUBJECT_NO_PROOF`（两种缺失两个码）；
//   ③ 有机器证据（lean 通过 / verified 定论行）⇒ 放行，且回执点名证据来源 `proofVia`；
//   ④ 一句话命题**不是**规则允许的两种形态之一（L14 卡/证明、L45 卡或文件引用）⇒ 具名拒 `DEBATE_SUBJECT_NO_PROOF`，
//      并在拒绝里给出两条合法路。第二份 G7 审计把 run 103 的「放行 + 披露」裁决读成「闸不守它引用的规则」；
//   ⑤ 真机：卡上的声明能写进去、能读回来（`proof_ref`/`proof_state` 别名不被吞）；辩论开会时**真的**被拦；
//   ⑥ TEETH：把声明喂成"没有证据"的三种变体，闸必须分别报出应有的码（不是恒绿）。
//
// WHAT IT DOES NOT PROVE：不判定"证明内容是否真的写完"（不可机器判定，见 §4-3），也不驱动真模型去跑 Lean。
//
// RULE E: every loop/every() below is preceded by an explicit NON-EMPTY assertion.

import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..')

let passed = 0
let failed = 0
const failures = []
const ok = (cond, label, detail) => {
  if (cond) { passed++; console.log('  ok   ' + label); return true }
  failed++; failures.push(label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  console.error('  FAIL ' + label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  return false
}
const codeOf = (e) => (e && (e.code || (e.cause && e.cause.code))) || null

const gates = await import(pathToFileURL(join(REPO, 'vibe-math-vmu', 'packs', 'v5r', 'verification-gates.js')).href)
const verified = await import(pathToFileURL(join(REPO, 'vibe-math-vmu', 'packs', 'v5r', 'verified.js')).href)
const entry = await import(pathToFileURL(join(REPO, 'vibe-math-vmu', 'vibe-math-vmu.js')).href)

const boot = async (config = {}) => {
  const state = { specs: [] }
  // C6a: a declared-complete proof needs Lean registration on the SAME write, so §5 injects the `subprocess` seam
  // (host contract, as tests/vmu-b3-c8-c10.test.mjs does) and settles one real fake-engine run to cite.
  const subprocess = {
    resolveExecutable: async (name) => '/fake/bin/' + String(name),
    spawn: () => ({ done: Promise.resolve({ exitCode: 0, signal: null, stdout: 'Build completed successfully.\n', stderr: '' }), terminate() {} }),
  }
  const ctx = {
    effect(fn) { return fn() },
    on() { return () => {} },
    get: (what) => (what === 'subprocess' ? subprocess : undefined),
    tools: { register: async (spec) => { state.specs.push(spec); return () => {} } },
  }
  const handle = entry.apply(ctx, Object.assign({ clock: () => 1000 }, config))
  await handle.ready()
  return { handle, state, names: state.specs.map((s) => s.name), specOf: (n) => state.specs.find((s) => s.name === n) }
}
const receipt = async (b, name, args = {}) => {
  const spec = b.specOf(name)
  if (!spec) throw new Error('no such tool: ' + name)
  try { return JSON.parse(await spec.execute(args, {})) } catch (e) { return { ok: false, code: codeOf(e), message: e.message, hint: e.hint } }
}

const DEBATE = { type: 'debate' }
const CARD_ID = 'r-pv-1'
const cardEvidence = (extra) => Object.assign({ card: { id: CARD_ID, bodyTruncated: false, proofRef: '', proofState: '' } }, extra || {})

console.log('=== 0. the vocabulary: two missing-pieces, two codes ===')
{
  const codes = Object.values(gates.GATE_CODES)
  ok(codes.length > 0, 'the gate vocabulary is non-empty (guard)', codes.length)
  ok(codes.includes(gates.GATE_CODES.DEBATE_SUBJECT_NO_PROOF), '「没写证明」保持原来的码')
  ok(codes.includes(gates.GATE_CODES.DEBATE_SUBJECT_UNPROVEN), '★「写了但拿不出证据」有它自己的码（两种缺失不该共用一个码）')
  const catalog = gates.gateCatalog()
  ok(Array.isArray(catalog) && catalog.length > 0, 'the catalog is non-empty (guard)', catalog.length)
  const debateRows = catalog.filter((g) => g.id === 'debateSubjectGate')
  ok(debateRows.length === 1, '★ 一个闸只占一行（码的多样性放在 `codes` 里，不是复制行）', debateRows.length)
  // 目录里的码全集：老行只有 `code`，B6 这行多了 `codes`；两种形状都要能读，否则"目录可查"就是空的
  const published = debateRows.flatMap((r) => (Array.isArray(r.codes) ? r.codes : [r.code]))
  ok(published.length > 0, '目录里这个闸至少发布了一个码（guard）', published.length)
  ok(published.includes(gates.GATE_CODES.DEBATE_SUBJECT_NO_PROOF), '目录里能查到「没写证明」的码')
  ok(published.includes(gates.GATE_CODES.DEBATE_SUBJECT_UNPROVEN), '目录里能查到 B6 新增的码')
}

console.log('=== 1. 只有声明（自报）⇒ 放行但如实标注；声明与机器证据矛盾 ⇒ UNPROVEN ===')
{
  const declaredOnly = gates.debateSubjectGate({ meeting: DEBATE, subject: CARD_ID,
    evidence: cardEvidence({ card: { id: CARD_ID, bodyTruncated: false, proofRef: 'Members/acad/Propos/' + CARD_ID + '.md#正式证明', proofState: 'complete' } }) })
  // ★ live run 8 finding A: this used to be a refusal, and that refusal was a deadlock (verified row needs a finished
  // debate; a passed Lean job needs a .lean file the preset cannot create). The rule's condition is the REGISTRATION,
  // so the gate admits it and puts the honesty in the receipt instead of in a refusal that blocked the legal path.
  ok(declaredOnly.allowed === true, '★★★ 放行：声明 complete（这是规则要的「已登记为写完」）', declaredOnly)
  ok(declaredOnly.proofBasis === 'declaration-only', '★★ 但回执必须写 proofBasis:"declaration-only"（不把自报说成已证）', declaredOnly.proofBasis)
  ok(declaredOnly.declared === true && declaredOnly.declaredState === 'complete',
    '回执如实记下"作者声明过 complete"', { declared: declaredOnly.declared, state: declaredOnly.declaredState })
  ok(typeof declaredOnly.note === 'string' && /自述/.test(declaredOnly.note) && /verified/.test(declaredOnly.note),
    'note 说清三件事：自述、辩论是进证据层的正当路径、进 verified 轨还要过闸', declaredOnly.note)

  // ①b TEETH: a declaration the machine CONTRADICTS is still refused — that is what UNPROVEN now means.
  const contradicted = gates.debateSubjectGate({ meeting: DEBATE, subject: CARD_ID,
    evidence: cardEvidence({ card: { id: CARD_ID, bodyTruncated: false, proofRef: 'p.md', proofState: 'complete' },
      lean: { jobId: 'lean-9', passed: false, state: 'failed' } }) })
  ok(contradicted.allowed === false && contradicted.code === gates.GATE_CODES.DEBATE_SUBJECT_UNPROVEN,
    '★★★ 声明"写完了"但指向的 Lean 作业 failed ⇒ UNPROVEN（声明不能与机器证据矛盾）', contradicted.code)
  ok(contradicted.contradictedBy && contradicted.contradictedBy.jobId === 'lean-9',
    '★ 拒的原因点名是哪个作业、什么状态（不是一句"证据不足"）', contradicted.contradictedBy)
}

console.log('=== 2. 连声明都没有 / 只标 draft ⇒ 另一个码：NO_PROOF ===')
{
  const none = gates.debateSubjectGate({ meeting: DEBATE, subject: CARD_ID, evidence: cardEvidence() })
  ok(none.allowed === false && none.code === gates.GATE_CODES.DEBATE_SUBJECT_NO_PROOF,
    '★★★ 没有任何证明字段 ⇒ NO_PROOF（"没写"与"写了无证据"是两种缺失）', none.code)
  const draft = gates.debateSubjectGate({ meeting: DEBATE, subject: CARD_ID,
    evidence: cardEvidence({ card: { id: CARD_ID, bodyTruncated: false, proofRef: 'Members/acad/Propos/' + CARD_ID + '.md#草稿', proofState: 'draft' } }) })
  ok(draft.allowed === false && draft.code === gates.GATE_CODES.DEBATE_SUBJECT_NO_PROOF,
    '★ proofState=draft（半成品）不构成"已写完" —— 半成品不是辩论对象', draft.code)
  const unknown = gates.debateSubjectGate({ meeting: DEBATE, subject: 'r-not-read', evidence: { card: null } })
  ok(unknown.allowed === false && unknown.code === gates.GATE_CODES.DEBATE_SUBJECT_NO_PROOF,
    '卡读不到（records 没给证据）同样是 NO_PROOF：不许把"没读到"当"没问题"', unknown.code)
}

console.log('=== 3. 机器证据 ⇒ 放行（两种证据各一次）===')
{
  const leanRow = { id: CARD_ID, bodyTruncated: false, proofRef: '', proofState: '' }
  const byLean = gates.debateSubjectGate({ meeting: DEBATE, subject: CARD_ID,
    evidence: { card: leanRow, lean: { jobId: 'lean-1', passed: true, state: 'settled', conformance: { decision: 'conform' } } } })
  ok(byLean.allowed === true, '★★ 证据层：Lean 已通过 ⇒ 放行（即使卡上没登记 proofRef）', byLean)
  ok(byLean.proofVia === 'lean-passed', '回执点名证据来源 = lean-passed', byLean.proofVia)
  ok(byLean.declared === false && typeof byLean.note === 'string' && /自报/.test(byLean.note),
    '没登记声明时如实说明"放行依据是证据、不是自报"，并提示把引用补上', byLean.note)

  const byVerified = gates.debateSubjectGate({ meeting: DEBATE, subject: CARD_ID,
    evidence: { card: cardEvidence().card, verified: { cardId: CARD_ID, conclusion: true } } })
  ok(byVerified.allowed === true, '★★ 证据层：verified 轨已有定论行 ⇒ 放行', byVerified)
  ok(byVerified.proofVia === 'verified-row', '回执点名证据来源 = verified-row', byVerified.proofVia)
}

console.log('=== 4. 一句话命题不是规则允许的形态 ⇒ 具名拒，并给出两条合法路 ===')
{
  // ★★ G7 AUDIT #2 (rule L14 + L45, second independent read-only audit): the rule names exactly two debate-object forms —
  // 「命题卡…含有正式证明或证伪内容（且已经写完了）」 and 「辩论对象的文件引用」. §4 used to encode the run-103 arbitration
  // (let a bare sentence through with provenance:'none'), and that arbitration is what the audit called the gate refusing
  // to keep the rule it quotes. The sentence is now refused BY NAME; the refusal names the two legal forms instead of a note.
  const stmt = gates.debateSubjectGate({ meeting: DEBATE, subject: '任意一个猜想：每个偶数都是两个素数之和' })
  ok(stmt.allowed === false && stmt.code === gates.GATE_CODES.DEBATE_SUBJECT_NO_PROOF,
    '★★ 一句话命题 ⇒ 具名拒 DEBATE_SUBJECT_NO_PROOF（不是静默放行，也不是发明新码）',
    { allowed: stmt.allowed, code: stmt.code })
  ok(stmt.form === 'statement' && stmt.provenance === 'none',
    '并如实记它读到的形态（form:statement / provenance:none）——拒绝也要说清读到了什么', stmt)
  ok(/两种形态/.test(String(stmt.message)) && /已写完/.test(String(stmt.message)),
    '拒绝文案说清规则只允许哪种形态（含「已写完」的卡或文件引用）', stmt.message)
  ok(/vibe_v5_record_proposition/.test(String(stmt.hint)) && /文件引用/.test(String(stmt.hint)),
    'hint 给出两条合法路：写成卡（带 proof_ref/proof_state）或以文件引用作对象', stmt.hint)
  const nonDebate = gates.debateSubjectGate({ meeting: { type: 'ordinary' }, subject: CARD_ID, evidence: cardEvidence() })
  ok(nonDebate.allowed === true && nonDebate.applicable === false, '非辩论会议 ⇒ 本闸不适用（不被误伤）', nonDebate)
}

console.log('=== 5. 真机：声明能写能读，辩论开会时真的被拦 ===')
const root = await mkdtemp(join('D:/_tmp', 'vmu-debate-proof-'))
try {
  const b = await boot({ root, packs: ['v5r'] })
  const kernel = b.handle.kernel
  ok(kernel !== null, '★ 真机 boot 拿到 kernel（没有 kernel 的"通过"是假绿）')
  await kernel.members.hire({ id: 'acad', slot: 'chair' })
  await kernel.members.hire({ id: 'r-1', slot: 'member' })
  const roster = kernel.members.roster()
  ok(Array.isArray(roster) && roster.length >= 2, '名册非空且够开会（guard: 没有成员的会议无法验证任何事）', Array.isArray(roster) ? roster.length : typeof roster)

  // C6a: 声明 complete 现在须附 Lean 通过登记 —— 真跑一次（接缝退出码 0），把作业 id 写进卡。
  await mkdir(join(root, 'Formal'), { recursive: true })
  const LEAN = 'Formal/r-pv-1.lean'
  await writeFile(join(root, LEAN), 'theorem r_pv_1 : True := trivial\n', 'utf8')
  const leanRun = await receipt(b, 'vibe_v5_lean_run', { statement: 'True', file: LEAN })
  const leanJob = leanRun && leanRun.id
  const settled = leanJob ? await kernel.lean.settle(leanJob) : null
  ok(!!settled && settled.passed === true, 'setup: Lean 作业已结算并通过（卡要引用的登记）', settled)

  const declared = await receipt(b, 'vibe_v5_record_proposition', { member: 'acad', id: CARD_ID,
    statement: '命题卡：该算法在 O(n log n) 内停机', value: '该命题为真则算法可判定', motive: '为验证 B6 的声明层', p: 0.5,
    proof_ref: 'Members/acad/Propos/' + CARD_ID + '.md#正式证明', proof_state: 'complete', lean_job: leanJob })
  ok(declared.ok === true, '★ 卡写入成功（proof_ref/proof_state 不被 schema 拒）', declared)
  const row = kernel.records.get({ id: CARD_ID })
  const card = verified.parseCard(row)
  ok(card && card.ok === true, '卡能被 v5r 卡解析器读回', card && card.problem)
  ok(card.ok === true && String(card.fields.proofRef || '').length > 0,
    '★★ 读回：卡体里真的有 proofRef（声明层不是只活在回执里）', card.ok ? card.fields.proofRef : null)
  ok(card.ok === true && card.fields.proofState === 'complete', '★★ 读回：proofState=complete', card.ok ? card.fields.proofState : null)

  const opened = await receipt(b, 'vibe_v5_meeting', { member: 'acad', agenda: '辩论这张卡的证明是否成立', type: 'debate', subject: CARD_ID })
  ok(opened.ok === true && typeof opened.meeting === 'string',
    '★★★ 真机：按规则登记为 complete 的卡 ⇒ 辩论**开得起来**（run-8 的死锁已解）', opened)
  ok(opened.subjectGate && opened.subjectGate.proofBasis === 'declaration-only',
    '★★ 真机回执同样写 declaration-only（读面与闸一致，不美化）',
    opened.subjectGate && { basis: opened.subjectGate.proofBasis, provenance: opened.subjectGate.provenance })

  const draftCard = await receipt(b, 'vibe_v5_record_proposition', { member: 'acad', id: 'r-pv-2',
    statement: '命题卡：半成品', value: '该命题为假则需反例', motive: '声明层 draft', p: 0.4,
    proof_ref: 'Members/acad/Propos/r-pv-2.md#草稿', proof_state: 'draft' })
  ok(draftCard.ok === true, 'draft 卡可以写入（如实登记"还没写完"是允许的）', draftCard)
  const blockedDraft = await receipt(b, 'vibe_v5_meeting', { member: 'acad', agenda: '辩论半成品', type: 'debate', subject: 'r-pv-2' })
  ok(blockedDraft.ok === false && blockedDraft.code === gates.GATE_CODES.DEBATE_SUBJECT_NO_PROOF,
    '★★ 真机：draft 卡 ⇒ NO_PROOF（半成品不是辩论对象）', blockedDraft.code)

  const badState = await receipt(b, 'vibe_v5_record_proposition', { member: 'acad', id: 'r-pv-3',
    statement: 'x', value: 'y', motive: 'z', p: 0.2, proof_ref: 'a.md', proof_state: 'finished' })
  ok(badState.ok === false && badState.code === 'VMU_INVALID_ARGUMENT',
    '★ 域外 proof_state ⇒ 具名 VMU_INVALID_ARGUMENT（不静默当成 draft）', badState)

  const stmtMeeting = await receipt(b, 'vibe_v5_meeting', { member: 'acad', agenda: '辩论一句话命题', type: 'debate', kind: 'sync',
    subject: '任意一个猜想：素数是无穷多的' })
  ok(stmtMeeting.ok === false && stmtMeeting.code === 'VMU_PACK_V5R_DEBATE_SUBJECT_NO_PROOF',
    '★★ 真机：一句话命题**开不了**辩论（闸在召集时就拒，而不是等到开会后才说没核过）',
    { ok: stmtMeeting.ok, code: stmtMeeting.code })
} finally {
  await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 })
}

console.log('=== 6. TEETH：三种变体分别报出应有的码（闸不是恒绿/恒红）===')
{
  const cases = [
    { name: '只有声明', ev: cardEvidence({ card: { id: CARD_ID, bodyTruncated: false, proofRef: 'x.md', proofState: 'complete' } }), expect: null },
    { name: '声明被 Lean 作业否定', ev: cardEvidence({ card: { id: CARD_ID, bodyTruncated: false, proofRef: 'x.md', proofState: 'complete' }, lean: { jobId: 'lean-9', passed: false, state: 'failed' } }), expect: gates.GATE_CODES.DEBATE_SUBJECT_UNPROVEN },
    { name: '没有声明', ev: cardEvidence(), expect: gates.GATE_CODES.DEBATE_SUBJECT_NO_PROOF },
    { name: '有证据', ev: cardEvidence({ lean: { passed: true } }), expect: null },
  ]
  ok(cases.length > 0, 'variant ledger non-empty (guard)', cases.length)
  for (const c of cases) {
    const got = gates.debateSubjectGate({ meeting: DEBATE, subject: CARD_ID, evidence: c.ev })
    if (c.expect === null) ok(got.allowed === true, 'TEETH ' + c.name + ' ⇒ 放行', got.code)
    else ok(got.allowed === false && got.code === c.expect, 'TEETH ' + c.name + ' ⇒ ' + c.expect, got.code || got.allowed)
  }
}

console.log('')
if (failed === 0) console.log('=== VMU DEBATE SUBJECT PROOF: ' + passed + ' passed, 0 failed ===')
else {
  console.log('FAILURES:')
  for (const f of failures) console.log('  · ' + f)
  console.log('=== VMU DEBATE SUBJECT PROOF: ' + passed + ' passed, ' + failed + ' failed ===')
  process.exitCode = 1
}

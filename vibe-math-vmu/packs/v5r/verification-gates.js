// vibe-math-vmu/packs/v5r — B1 第 2 步：**闸**（hand-written；没有任何生成器读它）
//
// ★ WHY THIS FILE EXISTS. 第 1 步（`packs/v5r/verified.js`）只建了「承载」：一条 `verified` 记录轨、单一写入器
//   `promoteVerified`、以及会**具名**报告坏行的读视图。承载本身不拦任何人 —— 今天谁都能写 `p=1`、谁都能往
//   `verified` 轨直写、谁都能把一张**只有「证明尝试」**的卡挂上辩论。本文件把这三条做成**可判的谓词**。
//
// ★ PURE FUNCTIONS, INJECTED FACTS. 四条闸都不读设置、不读磁盘、不抛异常、不写任何东西：
//   输入是「这次调用想干什么」＋「调用方已经查到的证据」，输出是
//   `{ allowed, applicable, code?, message?, hint?, ...facts }`。三个好处：
//     · 单测可以逐条造「合法的收 / 非法的拒」，不需要装配内核；
//     · 设置怎么读、拒绝怎么抛，留在**接线层**（第 3 步 / Lead 的 middleware），本文件不掺策略；
//     · 谓词没有副作用 ⇒ 可以被审计反复调用而不改变世界。
//   ★ 拒绝的**具名**责任在这里（`code`/`message`/`hint` 三件套），**归属**（D3 口径的那两个字段：读了哪些键、
//     判到哪一步）在接线层：只有接线层知道这次判定读了哪些设置键，它把本文件返回的 `keys` 抄进回执/拒绝即可。
//     所以这里返回 `keys` 而不是自己编归属字段 —— 一个纯谓词声称"我强制执行了什么"是虚报。
//     （本文件因此**一字不写**那两个字面量：一致性审计会把任何提到它的模块记成"新盲点"，
//      而一个不执行任何东西的谓词不该占那个位置。）
//
// ★ THE FOUR GATES（逐条对应规则原文，见 docs/acceptance/phase12-v5r-rules-conformance.md 行 B1/B8/D13）
//   ① `p1Intent`          —— 「只有辩论才能把命题卡的布尔概率修改为 1」：p=1 必须有**已经存在的定论来源**。
//   ② `debateSubjectGate` —— 「只有命题卡中含有正式证明或证伪内容（且已经写完了）才能用于后续辩论」：
//                            辩论会议的 subject 必须能解析到**有证明引用**的对象；文件引用与一句话命题的
//                            合法用法**不许被误拒**，所以三种形态各自说明"怎么才算满足"。
//   ③ `singleWriter`      —— 定论只能由 `promoteVerified` 写；其它路径往 `verified` 轨写 ⇒ 具名拒。
//   ④ `fidelityAsked`     —— 「lean 通过但概率仍非 1」时辩论必须先问「代码中的命题/定义是否符合所需」：
//                            本闸是 `kernel/fidelity.js` 在 pack 侧的**第一个消费者**（撤回过的证明不再追问）。
//
// ★ WHAT THIS FILE IS NOT. 它不是 middleware，**没有接线**：今天这四条闸的调用方是 0（见
//   docs/acceptance/conformance/lane-verified-design.md §10.6）。没有调用方的机制就是一段死代码 ——
//   所以第 3 步（提示词文字）与接线必须紧随其后，否则本文件应该被删掉，而不是留着当"看起来完整"的方案。

import { VERIFIED_TRACK, VERIFIED_KIND, CARD_TRACK, findVerified } from './verified.js'
import { meetingTypeOf } from './meeting-procedures.js'

/** 四条闸的具名码。**每个码在 docs/03-interface-contract.md 的两张表里都成对登记**（§8 语义表 + 实现状态表）。 */
export const GATE_CODES = Object.freeze({
  P1_NEEDS_DEBATE: 'VMU_PACK_V5R_P1_NEEDS_DEBATE',
  DEBATE_SUBJECT_NO_PROOF: 'VMU_PACK_V5R_DEBATE_SUBJECT_NO_PROOF',
  // ★ B6: the SECOND refusal of the same gate, because "没写证明" and "写了但拿不出证据"是两种缺失、两条改法。
  // 合成一个码会让被拒的人不知道自己是漏登记还是证据没到齐 —— 拒绝必须点名缺什么。
  DEBATE_SUBJECT_UNPROVEN: 'VMU_PACK_V5R_DEBATE_SUBJECT_UNPROVEN',
  VERIFIED_SINGLE_WRITER: 'VMU_PACK_V5R_VERIFIED_SINGLE_WRITER',
  FIDELITY_ASK_REQUIRED: 'VMU_PACK_V5R_FIDELITY_ASK_REQUIRED',
})

/** 唯一被允许写定论的写入器（`packs/v5r/verified.js` 的 `promoteVerified`）。名字是**契约**，不是提示。 */
export const SINGLE_WRITER = 'promoteVerified'

/** 辩论对象的三种合法形态（规则原文：「命题卡 id / 一个文件引用 / 一句话命题」）。 */
export const SUBJECT_FORMS = Object.freeze(['card', 'file', 'statement'])

/** 「正式证明已写完」的可判标记：卡面 `proofState` 的终态值。半成品（`draft`/`attempt`）不算。 */
export const PROOF_STATE_COMPLETE = 'complete'

const P1_EVIDENCE_FORMS = Object.freeze([
  'debate-unanimous：一场辩论的裁决集合**全体一致**为 1（`{mode:"unanimous", value:1, ballotId}`）',
  'verified-row：该命题卡已在 `verified` 轨上有一条 `conclusion:true` 的行（`{cardId, conclusion:true}`）',
  'lean-conformance：Lean 作业通过 **且** 辩论已裁定「代码中的命题/定义与所需一致」（`{jobId, passed:true, conformance:{decision:"conform"}}`）',
  // ★ B2：规则的第四种来源 —— 规则 L7-L8「参考文献中的命题也可直接入 Verified」。来源是**引用**而不是本所裁决，
  //   所以它必须带着引用本身进闸：`reference` 就是这条定论的 warrant id，verified 行上的 source 记 'literature'，
  //   「为什么这条算定论」的答案是「它出自文献第几条」，而不是「有人说了算」。空引用不是引用。
  'literature-reference：命题直接取自参考文献，写入带引用（`{reference:"<作者/出处/定理号>"}`，须非空）',
])

function refuseGate(code, message, hint, extra) {
  return Object.assign({ ok: false, allowed: false, applicable: true, code, message, hint: hint || null, keys: [] }, extra || {})
}
function allow(extra) {
  return Object.assign({ ok: true, allowed: true, applicable: true, code: null, message: null, hint: null, keys: [] }, extra || {})
}
function isTruncatedRead(row) {
  return !!(row && (row.bodyTruncated === true || row.truncated === true || row.bodyMode === 'truncated'))
}
function asP(value) {
  if (value === undefined || value === null || value === '') return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

/**
 * ① `p1Intent` —— 「只有辩论才能把命题卡的布尔概率修改为 1」。
 *
 * 输入：`{ tool, args, card, evidence }`
 *   · `tool`   想写概率的那次调用（只用于在拒绝文案里点名，不参与判定）
 *   · `args`   该次调用的参数（`p` 或 `value`）
 *   · `card`   目标卡行的读结果（`records.get()` 的投影；用于取"读到的现值"与截断事实）
 *   · `evidence` 调用方已查到的定论证据（四种形态见 `P1_EVIDENCE_FORMS`）
 * 输出：`{ ok, allowed, applicable, code?, message?, hint?, p, evidenceForm?, keys }`
 *
 * 三条判定：① 读不完整的卡**先具名拒**（不许拿半张卡判断"有没有证明"）；② p≠1 与本闸无关（放行，
 * `applicable:false`）；③ p=1 必须命中四种定论证据之一，否则 `VMU_PACK_V5R_P1_NEEDS_DEBATE`。
 */
export function p1Intent({ tool = null, args = {}, card = null, evidence = {} } = {}) {
  const who = tool ? String(tool) : 'a write path'
  // ★ 硬约束 1（第 1 步实测教训）：被 bodyCap 截断的卡不能当"没有证明引用"来判 —— 半张卡上的否定是猜测。
  if (isTruncatedRead(card) || isTruncatedRead(evidence.card)) {
    return refuseGate('VMU_INVALID_ARGUMENT',
      who + ' 的判定对象是一张**读取被截断**的命题卡（bodyCap 截断），不能凭半张卡判定它有没有定论来源',
      '用更大的 vmu.records.bodyCapBytes 重新读取，或让调用方只传完整读到的卡；★ 不许把"读不到"当成"没有证明"',
      { p: null, truncated: true })
  }
  const p = asP(card && card.p !== undefined ? card.p : (args.p !== undefined ? args.p : args.value))
  if (p === null) return allow({ applicable: false, p: null, note: '这次写入没有带概率：与本闸无关' })
  if (p !== 1) return allow({ applicable: false, p, note: 'p≠1：规则只约束"改成 1"的那条路径，0 与 (0,1) 不受本闸约束' })

  // 四种定论证据，逐种核「指向的是不是这张卡」——证据存在但指向别的对象等于没有证据。
  const cardId = card && card.id ? String(card.id) : (args.card_id ? String(args.card_id) : null)
  const out = { p: 1, cardId }
  const ev = evidence || {}
  if (ev.verified && ev.verified.conclusion === true) {
    const target = ev.verified.cardId !== undefined ? String(ev.verified.cardId) : (ev.verified.sourceId !== undefined ? String(ev.verified.sourceId) : null)
    if (target && cardId && target === cardId) return allow(Object.assign(out, { evidenceForm: 'verified-row' }))
  }
  if (ev.debate && String(ev.debate.mode) === 'unanimous' && asP(ev.debate.value) === 1) {
    const target = ev.debate.subject !== undefined ? String(ev.debate.subject) : null
    if (!target || !cardId || target === cardId) return allow(Object.assign(out, { evidenceForm: 'debate-unanimous', ballotId: ev.debate.ballotId || null }))
  }
  if (ev.literature && typeof ev.literature.reference === 'string' && ev.literature.reference.trim() !== '') {
    const target = ev.literature.subject === undefined || ev.literature.subject === null ? null : String(ev.literature.subject)
    if (!target || !cardId || target === cardId) return allow(Object.assign(out, { evidenceForm: 'literature-reference', reference: ev.literature.reference.trim() }))
  }
  if (ev.lean && ev.lean.passed === true && ev.lean.conformance && String(ev.lean.conformance.decision) === 'conform') {
    const target = ev.lean.subject !== undefined ? String(ev.lean.subject) : (ev.lean.cardId !== undefined ? String(ev.lean.cardId) : null)
    if (!target || !cardId || target === cardId) return allow(Object.assign(out, { evidenceForm: 'lean-conformance', jobId: ev.lean.jobId || null }))
  }
  const nearMiss = []
  if (ev.lean && ev.lean.passed === true && !(ev.lean.conformance && ev.lean.conformance.decision === 'conform')) {
    nearMiss.push('Lean 作业通过了，但**没有**「描述符合性」的裁定（`conformance.decision:"conform"`）—— lean 通过本身不等于 p=1')
  }
  if (ev.debate && asP(ev.debate.value) === 1 && String(ev.debate.mode) !== 'unanimous') {
    nearMiss.push('辩论裁决里有 1，但聚合**不是全体一致**（mode=' + String(ev.debate.mode) + '）—— 规则要的是"全部一致为 1"')
  }
  if (ev.verified && ev.verified.conclusion !== true) nearMiss.push('`verified` 行给了，但 `conclusion` 不是 true（p=0 的定论不能把卡设成 1）')
  return refuseGate(GATE_CODES.P1_NEEDS_DEBATE,
    '把命题卡的布尔概率改成 1 需要**已经存在的定论来源**；' + who + ' 这次写入没有（card=' + String(cardId) + '）'
    + (nearMiss.length ? '。★ 近失原因：' + nearMiss.join('；') : ''),
    '四种合法来源：\n  · ' + P1_EVIDENCE_FORMS.join('\n  · ')
    + '\n非辩论路径把 p 设成 1 一律具名拒；lean 通过是**另一条**合法路径，但必须连同符合性裁定一起给。',
    out)
}

/** 判断辩论 subject 的形态。三种形态的**满足方式完全不同**，所以先分类再判。 */
export function classifySubject(subject, evidence) {
  const raw = subject === null || subject === undefined ? '' : String(subject).trim()
  if (!raw) return { form: null, raw, note: '空 subject：由 `vibe_v5_meeting` 自己的必填门先拒（本闸不重复）' }
  // 命题卡 id 有两条判据：
  //   ① 形状：records 内核的 id 前缀是 `r-`（kernel/records.js:533 `mint('record','r-')`）；
  //   ② 证据：调用方已经按 id 读到了卡（`evidence.card` / `evidence.verified`）⇒ 这个名字就是卡，形状无关紧要。
  // ★ ② 是 LIVE RUN 15 的教训：院士把包自己的命题卡 id `p-chair-rail` 当 subject 传进来，而它以 `p-` 开头、不带
  //   扩展名，于是落到"一句话命题"分支、回执写 `provenance:"none"`，代理据此判「框架把卡当成了短语」。形状判不了
  //   的名字，证据能判；两者都没有时不许猜成"已经是卡"（那会给出一个看起来严的假闸）。
  // ★ ROUND 42 / F-13: records mint `rec-<n>` now (the roster owns `r-<n>`); a legacy `r-<n>` row is still a card,
  //    because ids are names and history is not migrated. Both shapes are cards; nothing else changes.
  if (/^(rec|r)-[A-Za-z0-9][A-Za-z0-9_-]*$/.test(raw)) return { form: 'card', raw, note: null }
  const ev = evidence && typeof evidence === 'object' ? evidence : {}
  if (ev.card || ev.verified) return { form: 'card', raw, note: null, identifiedBy: 'evidence' }
  // 文件引用：路径分隔符，或其末段是一份带扩展名的文件（规则原文："辩论对象的文件引用"）。
  // ★ 也认 `名字.md#锚点`：run 15 里成员写的是 `p-chair-rail.md#证明尝试`，扩展名在锚点之前，旧正则漏掉这种形状。
  if (/[\\/]/.test(raw) || /\.(md|lean|txt|tex|json)(#|$)/i.test(raw)) return { form: 'file', raw, note: null }
  return { form: 'statement', raw, note: '一句话命题：无法承载证明引用' }
}

/**
 * ② `debateSubjectGate` —— 「只有命题卡中含有正式证明或证伪内容（且已经写完了而非半成品）才能用于后续辩论」。
 *
 * 输入：`{ meeting, subject, evidence }`
 *   · `meeting`  会议回执/视图（用 `meeting.type` 判是否辩论；非辩论 ⇒ `applicable:false` 放行）
 *   · `subject`  调用方想挂的辩论对象（三种形态）
 *   · `evidence` 调用方已查到的证据：
 *       `{ card:{id,p,proofRef,proofState,bodyTruncated}, verified:{cardId,conclusion}|null,
 *          lean:{jobId,passed,subject}|null, file:{readable,bytes,name}|null }`
 * 输出：`{ ok, allowed, applicable, code?, message?, hint?, form, proofChecked, ... }`
 *
 * ★ 三种形态各自的满足方式（拒绝文案必须说清，否则会把合法用法拒掉）：
 *   · 卡 id  → **证据层优先**（B6 之后）：该卡有 Lean 已通过作业、或已在 `verified` 轨有定论行 ⇒ 放行；
 *     **声明层不构成证明**（`proofRef` 非空且 `proofState='complete'` 是作者自述）⇒ 只有声明、没有证据
 *     ⇒ `DEBATE_SUBJECT_UNPROVEN`；声明也没有 ⇒ `DEBATE_SUBJECT_NO_PROOF`（两种缺失两个码）
 *   · 文件引用 → 证据说文件**可读且非空**；★ 但"它是不是一份写完的证明"本闸**判不了**，回执必须写
 *     `proofContentChecked:false` —— 宁可承认判不了，也不要给一个看起来严的假闸。
 *   · 一句话命题 → 无法承载证明引用 ⇒ **放行**（它是规则允许的合法形态），但回执记 `provenance:'none'`、
 *     `proofChecked:false`，并把"要受证明闸约束就改传卡 id / 文件引用"写进 `note`。
 */
export function debateSubjectGate({ meeting = null, subject = null, evidence = {} } = {}) {
  const typeInfo = meetingTypeOf(meeting && meeting.type !== undefined ? meeting.type : null)
  if (!meeting || typeInfo.type !== 'debate') {
    return allow({ applicable: false, form: null, proofChecked: false, note: '会议类型不是 debate（type=' + String(typeInfo.type) + '）：本闸只约束辩论会议的对象' })
  }
  const cls = classifySubject(subject, evidence)
  if (!cls.form) return allow({ applicable: false, form: null, proofChecked: false, note: cls.note })
  const ev = evidence || {}

  if (cls.form === 'statement') {
    // ★ LIVE RUN 15: a bare identifier that is neither shaped like a kernel record id (`r-…`) nor carries a dot/slash is
    // AMBIGUOUS — it may be the pack's own card id (`p-chair-rail`), a file stem, or a one-line proposition. This gate
    // cannot tell them apart without evidence, and the old receipt said `form:"statement", provenance:"none"` flatly,
    // which a reader could only read as "the framework treated a card as a phrase". The ambiguity is NAMED instead.
    const looksLikeIdentifier = /^[A-Za-z][A-Za-z0-9_-]*$/.test(cls.raw)
    return allow({ form: 'statement', subject: cls.raw, proofChecked: false, provenance: 'none', looksLikeIdentifier,
      note: looksLikeIdentifier
        ? '这个 subject 是一个裸名字（没有扩展名、没有路径分隔、也不是内核卡片 id `r-…`），本闸无法判定它是一句话命题、一个文件名，还是包自己的卡片 id ⇒ 按"一句话命题"放行，回执如实记 provenance:none；如果它其实是卡片，先 `vibe_v5_read_library {id}` 读到该卡并把读结果作为 evidence（本闸见到卡片证据就按卡片判）'
        : '一句话命题没有可寻址的载体，本闸对它**无法**核证明（合法放行，但回执如实记 provenance:none）；要受「正式证明已写完」约束，请把 subject 改成命题卡 id 或一个文件引用' })
  }

  if (cls.form === 'file') {
    const f = ev.file || null
    if (!f) {
      return refuseGate(GATE_CODES.DEBATE_SUBJECT_NO_PROOF,
        '辩论对象是一个文件引用，但调用方没给该文件的证据（可读性/大小）：无法判定它是不是一份写完了的证明',
        '先读一次该文件并把 `{file:{readable:true, bytes:N, name}}` 传进来；★ 文件形态的判据只有"存在且非空"，'
        + '"内容是否完整证明"本闸判不了 —— 那一条要靠人（成员）在辩论里核',
        { form: 'file', subject: cls.raw, proofChecked: false })
    }
    if (f.readable !== true || !(Number(f.bytes) > 0)) {
      return refuseGate(GATE_CODES.DEBATE_SUBJECT_NO_PROOF,
        '辩论对象的文件引用不可读或为空（readable=' + String(f.readable) + ', bytes=' + String(f.bytes) + '），不能作为已写完的证明',
        '换成可读且非空的文件引用，或改传命题卡 id（卡形态能核 `proofState="complete"`）',
        { form: 'file', subject: cls.raw, proofChecked: false })
    }
    return allow({ form: 'file', subject: cls.raw, proofChecked: false, proofContentChecked: false,
      // ★ LIVE RUN 7 (agent feedback item i): the acceptance agent passed `{path, name, readable:true, bytes:4096}` and
      // the gate allowed it, then claimed "文件存在且非空". It was right to call that out: the numbers were the
      // CALLER's, and nothing here stat()ed anything (this module is pure by design, and the pack holds no filesystem
      // seam). The claim is downgraded to what it actually is — caller-reported — and the field that says so travels
      // with the reading, so a reader cannot mistake it for a measurement.
      evidenceSource: 'caller-reported',
      note: '文件形态：调用方自报可读且非空（bytes=' + String(f.bytes) + '），本闸**没有**文件系统接缝、未自行 stat；'
        + '"内容是否写完"由辩论中的人核 ⇒ 回执如实标 proofContentChecked:false、evidenceSource:"caller-reported"' })
  }

  // form === 'card'
  const c = ev.card || null
  if (!c) {
    return refuseGate(GATE_CODES.DEBATE_SUBJECT_NO_PROOF,
      '辩论对象是一个命题卡 id（' + cls.raw + '），但调用方没给该卡的读结果：无法判定它有没有证明引用',
      '先 `records.get({id})` 读这张卡并把读结果传进 `evidence.card`；卡不存在同样是这个码（不许把"没读到"当"没问题"）',
      { form: 'card', subject: cls.raw, proofChecked: false })
  }
  if (isTruncatedRead(c)) {
    return refuseGate('VMU_INVALID_ARGUMENT',
      '辩论对象的卡读取被 bodyCap 截断，不能凭半张卡判定"有没有正式证明"',
      '用更大的 vmu.records.bodyCapBytes 重读后再判；★ 截断既不是"有证明"也不是"没证明"',
      { form: 'card', subject: cls.raw, proofChecked: false, truncated: true })
  }
  const proofRef = c.proofRef === null || c.proofRef === undefined ? '' : String(c.proofRef).trim()
  const proofState = c.proofState === null || c.proofState === undefined ? '' : String(c.proofState).trim()
  const declared = proofRef !== '' && proofState === PROOF_STATE_COMPLETE
  // ★★ LIVE RUN 48 (F-23): an UNJUDGEABLE card is its own answer, and it is NOT the same answer as "nothing was
  // registered". Run 48 measured this exactly: a card whose statement was written over three paragraphs made the parser
  // call its paragraph lines unparsable, the projection reported proofRef/proofState as empty, and this gate told the
  // caller 「没有任何登记」 — about a body that carried `- proofRef：…` two lines down. The caller's only reading of that
  // refusal is "register the proof again", so it wrote a second card (rec-9). Say what is true instead: the body could
  // not be read as a card, and here is what its author wrote.
  if (c.unjudgeable) {
    return refuseGate(GATE_CODES.DEBATE_SUBJECT_UNPROVEN,
      '辩论对象的卡 ' + cls.raw + ' 无法被判读：' + String(c.unjudgeable)
      + (proofRef ? '；而卡体里作者自己写着 proofRef=' + proofRef + (proofState ? '、proofState="' + proofState + '"' : '') : '')
      + '。这不是"没有登记证明"，是"这张卡的卡体读不出一张完整的卡"',
      '先修卡体再重试（卡体是 `- key：value` 行；多行值可以直接续行，但不要把以 `- ` 开头的行写进值里，也不要重复同一字段）；'
      + '用 `vibe_v5_read_library {id:"' + cls.raw + '", expand:true}` 读 body 原文核对；卡体能读成卡后，本闸按声明层放行（proofBasis:"declaration-only"）',
      { form: 'card', subject: cls.raw, proofChecked: false, unjudgeable: true, declared: !!proofRef, declaredState: proofState || null })
  }
  const verifiedHit = !!(ev.verified && ev.verified.conclusion !== undefined)
  const leanHit = !!(ev.lean && ev.lean.passed === true)
  const evidenced = verifiedHit || leanHit
  // ★ run-8 finding A: `DEBATE_SUBJECT_UNPROVEN` now has a REAL reachable meaning — the card declares "proof complete"
  // while a Lean job it was pointed at FAILED. That is not "no evidence yet" (admitted below), it is evidence CONTRADICTING
  // the declaration, which the gate must refuse rather than let the institution debate a claim its own machine rejected.
  const leanFailed = !!(ev.lean && ev.lean.passed === false && ev.lean.state !== null)
  // ★ PHASE 12 / B6：**证据层是唯一放行依据**。声明层（proofRef + proofState）是成员写进卡体的自述，作者说
  // "写完了"不等于有人验证过；把它当证明就是"把自报当已证"。证据层只有两种机器事实：Lean 作业通过、或这张卡
  // 已经在 verified 轨上有一条定论行（有人裁过）。两者都没有时，闸要能分开说缺的是哪一层。
  if (evidenced) {
    return allow({ form: 'card', subject: cls.raw, proofChecked: true,
      proofVia: verifiedHit ? 'verified-row' : 'lean-passed',
      evidence: { lean: leanHit, verified: verifiedHit },
      declared, declaredState: proofState || null,
      note: declared ? null
        : '放行依据是机器证据（' + (verifiedHit ? 'verified 轨的定论行' : '已通过的 Lean 作业') + '），不是卡上的自报：'
          + '这张卡还没登记 proofRef/proofState="complete"，接线层应把证明引用补上，让"谁写的、写在哪"可追溯' })
  }
  // ★ PHASE 12 / live run 8 finding A — THIS BRANCH USED TO REFUSE, AND THAT WAS A DEADLOCK.
  // The rule's condition for a debate subject is 「含正式证明且已写完」, and the DECLARATION (proofRef + proofState
  // "complete") is exactly that registration. Demanding machine evidence ON TOP made two of the three legal subject
  // forms unreachable in a real deployment: the only machine-evidence paths are (a) a `verified` row — which requires
  // a FINISHED DEBATE, i.e. the thing being gated — and (b) a passed Lean job — which requires a `.lean` file that the
  // preset has no tool to create. Measured in run 8: a card registered precisely as rule ⑩ requires was refused with
  // DEBATE_SUBJECT_UNPROVEN, and `lean_run` refused for want of `file` ⇒ a closed loop with no entrance.
  // The truth the gate still owes the reader is that a declaration is the AUTHOR's self-report. So it is admitted, and
  // the receipt says `proofBasis:'declaration-only'` instead of pretending it was verified. Evidence is machine-checked
  // where it belongs: promoting to the `verified` track still passes p1Intent + the single-writer gate.
  if (declared && leanFailed) {
    return refuseGate(GATE_CODES.DEBATE_SUBJECT_UNPROVEN,
      '命题卡 ' + cls.raw + ' 声明了自己的证明（proofRef=' + proofRef + '、proofState="complete"），但它指向的 Lean 作业 '
      + '(' + String(ev.lean.jobId || '?') + ', state=' + String(ev.lean.state) + ') 没有通过：机器证据与声明矛盾',
      '要么把 Lean 作业跑通（`vibe_v5_lean_run { target:"' + cls.raw + '" }` 且 passed），要么把 proofState 改成 "draft" 并说明'
      + '证明还没写完 —— 声明"写完了"而机器说没通过，闸不能当没看见',
      { form: 'card', subject: cls.raw, proofChecked: false, declared: true, declaredState: proofState,
        declaredProofRef: proofRef, contradictedBy: { jobId: ev.lean.jobId || null, state: ev.lean.state || null } })
  }
  if (declared) {
    return allow({ form: 'card', subject: cls.raw, proofChecked: false, proofBasis: 'declaration-only',
      provenance: 'declared', declared: true, declaredState: proofState, declaredProofRef: proofRef,
      // ★ LIVE RUN 50 (the chair's own report, with evidence): this note used to ASSERT "Lean 作业未通过" while the
      // cardinal had just run a Lean job on the very file the card points at (exit 0, passed, `dedupedOf` the earlier
      // job) and the archive held the theorem. The gate had not looked — it simply never received that evidence — and
      // a durable verdict that states an unmeasured fact is the same defect as a receipt that hides one. Say what was
      // checked: the card's two declared fields; nothing else was handed to this gate.
      note: '辩论对象的证明目前只有**作者自述**（proofRef=' + proofRef + '、proofState="complete"）。本闸只核了卡上的这两个字段：'
        + '这次调用没有把 Lean 作业或 `verified` 轨的证据交给闸（ev.lean / ev.verified 未提供），所以 proofChecked:false、'
        + 'proofBasis:"declaration-only" —— 「没核」不等于「没通过」。规则要的是"已登记为写完"，故放行；'
        + '自述不等于已证，而这场辩论正是把它送进证据层的正当路径，进 `verified` 轨仍要过 p1Intent 与单写者两道闸' })
  }
  return refuseGate(GATE_CODES.DEBATE_SUBJECT_NO_PROOF,
    '命题卡 ' + cls.raw + ' 没有「正式证明或证伪**已写完**」的任何登记：proofRef=' + (proofRef || '空')
    + '、proofState=' + (proofState || '空') + '；本闸同时没有收到 Lean 作业与 `verified` 轨的定论行作为证据（这次调用没把它们交进来）。'
    + '规则：只有含正式证明/证伪（且已写完而非半成品）的卡才能进入辩论；"证明尝试"只是候选，不是辩论对象',
    '先登记证明引用（写卡时传 `payload:{proofRef:"Members/<m>/Propos/<id>.md#正式证明", proofState:"complete"|"draft"}`，'
    + '或工具面的 `proof_ref`/`proof_state`），再跑 Lean 或走辩论；声明与证据齐了才可开辩论。'
    + '三种合法形态：命题卡 id（声明 + 机器证据）/ 文件引用（存在且非空）/ 一句话命题（本闸判不了证明，放行但记 provenance:none）',
    { form: 'card', subject: cls.raw, proofChecked: false, declared: false, declaredState: proofState || null })
}

/**
 * ③ `singleWriter` —— 定论只能由 `promoteVerified` 写。
 *
 * 输入：`{ records, cardId, by, at, writer, track, kind }`
 *   · `track`/`kind` 这次写入的目标（省略＝按"写 verified 轨"处理）；不是 verified 轨 ⇒ `applicable:false` 放行
 *   · `writer` 这次写入的**入口名**（`promoteVerified` 之外的任何名字都要被拒）
 * 输出：`{ ok, allowed, code?, ... , existing? }`
 *
 * ★ 为什么是"入口名"而不是"包一层 middleware"：`records.put` 是所有轨共用的底层写口，它不该认识
 *   `verified` 这个词（能力在内核、**语义在 pack**）。所以这条闸挡的是"pack 里多出一条写 verified 的路径"，
 *   而不是"内核里有人直接 put"—— 后者需要内核侧的轨写白名单，本闸**明确不声称**能挡（见设计文档 §10.5）。
 */
export function singleWriter({ records = null, cardId = null, by = null, at = null, writer = null, track = null, kind = null } = {}) {
  const t = track === null || track === undefined ? VERIFIED_TRACK : String(track)
  const k = kind === null || kind === undefined ? VERIFIED_KIND : String(kind)
  if (t !== VERIFIED_TRACK) {
    return allow({ applicable: false, track: t, kind: k, note: '目标不是 verified 轨：本闸只管定论' })
  }
  const w = writer === null || writer === undefined ? '' : String(writer).trim()
  if (!w) {
    return refuseGate(GATE_CODES.VERIFIED_SINGLE_WRITER,
      '往 `' + VERIFIED_TRACK + '` 轨写入必须**声明写入器**；调用方没给 `writer`，无法证明它走的是唯一写入器',
      '传 `writer:"' + SINGLE_WRITER + '"`（即 `packs/v5r/verified.js` 的 `promoteVerified`），其余入口一律具名拒',
      { track: t, kind: k, cardId: cardId === null ? null : String(cardId) })
  }
  if (w !== SINGLE_WRITER) {
    return refuseGate(GATE_CODES.VERIFIED_SINGLE_WRITER,
      '定论（`' + VERIFIED_TRACK + '` 轨）只能由 `' + SINGLE_WRITER + '` 写；这次写入的入口是 "' + w + '"',
      '把这次写入改成调用 `promoteVerified({ records, sourceId, warrant })`：它带 warrant 前置、幂等、并会写 `已验证｜` 标题与来源；'
      + '绕过它直写就等于让"结论"没有法官',
      { track: t, kind: k, cardId: cardId === null ? null : String(cardId) })
  }
  const extra = { track: t, kind: k, cardId: cardId === null ? null : String(cardId), by: by === null ? null : String(by), at }
  if (records && typeof records.get === 'function' && extra.cardId) {
    const existing = findVerified(records, extra.cardId)
    if (existing) extra.existing = { id: existing.id, by: existing.verified.by || null, at: existing.verified.at || null, conclusion: existing.verified.conclusion }
  }
  return allow(Object.assign(extra, { applicable: true, note: '唯一写入器：' + SINGLE_WRITER + '（幂等：同事实重写是 no-op，事实变了才 refresh）' }))
}

/**
 * ④ `fidelityAsked` —— 「lean 通过但概率仍非 1」必须先问「代码中的命题、各种定义是否描述符合所需」。
 *
 * 输入：`{ cardId, leanPassed, p, withdrawnFor, answered }`
 *   · `leanPassed`  该卡对应 Lean 作业是否通过（布尔结论，不是状态）
 *   · `p`           该卡当前概率
 *   · `withdrawnFor` `kernel/fidelity.js` 的 `passedWithdrawnFor`（函数或已算好的标记）；这里是它在 pack 侧的
 *                   **第一个消费者** —— 撤回过的证明不再追问，避免"证明已撤回却还拿它当辩论依据"
 *   · `answered`    已经记下的符合性裁定（`{decision:'conform'|'defect', by, at}`）
 * 输出：`{ ok, required, code?, question?, options?, resolved?, reason }`
 *
 * 判定：lean 未通过 / p=1 / 已有裁定 / 证明已被撤回 ⇒ 不追问（各自写明理由）；否则 `required:true` 并带
 * `VMU_PACK_V5R_FIDELITY_ASK_REQUIRED`，调用方必须把这一问放回辩论（或按 D13 记 defect）。
 */
export function fidelityAsked({ cardId = null, leanPassed = false, p = null, withdrawnFor = null, answered = null } = {}) {
  const base = { ok: true, allowed: true, applicable: false, required: false, keys: [], cardId: cardId === null ? null : String(cardId) }
  const out = (extra) => Object.assign({}, base, extra)
  if (leanPassed !== true) return out({ reason: 'Lean 未通过：没有"已通过的证明"可核，本闸不适用' })
  const pn = asP(p)
  if (pn === 1) return out({ reason: 'p=1：命题已由 lean 路径结项，没有"概率仍非 1"的追问' })
  if (answered && (answered.decision === 'conform' || answered.decision === 'defect')) {
    return out({ applicable: true, resolved: true, reason: '已有符合性裁定（decision=' + answered.decision + '）', decision: answered.decision, by: answered.by || null, at: answered.at || null })
  }
  let marker = null
  if (typeof withdrawnFor === 'function') {
    try { marker = withdrawnFor(cardId) } catch (e) { marker = null }
  } else if (withdrawnFor && typeof withdrawnFor === 'object') {
    marker = withdrawnFor.cardId === undefined || String(withdrawnFor.cardId) === String(cardId) ? withdrawnFor : null
  }
  if (marker && marker.withdrawn === true) {
    return out({ applicable: true, resolved: true, reason: '证明已被忠实性缺陷撤回（passedWithdrawn）；它不能再作为辩论依据，因此不追问符合性',
      markerId: marker.markerId || null, note: marker.note || null })
  }
  return out({
    allowed: false,
    applicable: true,
    required: true,
    code: GATE_CODES.FIDELITY_ASK_REQUIRED,
    reason: 'Lean 已通过但概率仍非 1（p=' + String(pn === null ? '未知' : pn) + '）：必须先在辩论中裁定「Lean 代码里的命题与定义是否与所需一致」',
    question: 'Lean 代码中的命题、各种定义是否描述符合所需？符合 ⇒ 布尔概率直接赋值为 1；不符合 ⇒ 记 formal:{decision:"defect"}，框架撤回该证明的"已通过"',
    options: ['conform', 'defect'],
    consumer: 'kernel/fidelity.js 的 passedWithdrawnFor（撤回标记）＋ 辩论裁决的 formal 字段',
  })
}

/** 只读的闸目录（供文档/接线层列举；不参与判定）。 */
export function gateCatalog() {
  return Object.freeze([
    Object.freeze({ id: 'p1Intent', code: GATE_CODES.P1_NEEDS_DEBATE, rule: '只有辩论才能把命题卡的布尔概率修改为 1', appliesTo: '写 p=1 的任何调用' }),
    // ★ B6: 一个闸、两个拒绝码 —— 「声明了证明但拿不出证据」与「根本没登记」是两种缺失、两条改法。
    Object.freeze({ id: 'debateSubjectGate', code: GATE_CODES.DEBATE_SUBJECT_NO_PROOF,
      codes: Object.freeze([GATE_CODES.DEBATE_SUBJECT_NO_PROOF, GATE_CODES.DEBATE_SUBJECT_UNPROVEN]),
      rule: '只有含正式证明/证伪（且写完）的卡才能用于辩论；卡上的 proofRef/proofState 只是自述，没有 Lean 通过或 verified 定论行就不算"已证"', appliesTo: 'type=debate 的会议 subject' }),
    Object.freeze({ id: 'singleWriter', code: GATE_CODES.VERIFIED_SINGLE_WRITER, rule: '定论只能由单一写入器写', appliesTo: '写 verified 轨的任何入口' }),
    Object.freeze({ id: 'fidelityAsked', code: GATE_CODES.FIDELITY_ASK_REQUIRED, rule: 'lean 通过但 p≠1 必须先核描述符合性（D13）', appliesTo: 'lean 通过且 p≠1 的命题卡' }),
  ])
}

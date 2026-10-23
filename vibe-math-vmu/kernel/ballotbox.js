// vibe-math-vmu — 表决票箱（08 卷表决节）：把 `vmu.ballot.*` **27 键**接成可观测行为。
//
// 标准（沿用 mathtools 的验收口径 ✓）：① 每条已接键**改变可观测行为**（不是只进 status ✗）；
//   ② 回执带 **`enforced[]`**（**只列本次真正求值的键** ✓ ⇒ "读了"与"起作用了"可区分 ✗✓）；
//   ③ **未接键逐个点名**（`planned[]`，带原因 ✓）＋ 断言 `planned ∩ wired = ∅` 且二者**恰好划分 27** ✓；
//   ④ 拒绝**按码计数**（`refusals`）✓；⑤ 注入时钟（不读真实时间 ✗）；⑥ 零机制不崩 ✓；⑦ 只读面不改状态 ✓。
//
// 语义（08 卷；**只引用不重定义** ✗）：**法定人数不足 ⇒ 具名拒（不是"未通过"）** ✓；平票按 `tieRule`
//   处置并**自曝用了哪条规则** ✓；`runoffTopN` ⇒ 第二轮并标 `round:2` ✓；**弃权与缺席分开计数** ✗✓；
//   秘密表决 ⇒ 明细**不可回收**但**保留计数** ✓；重复投票 ⇒ 具名拒 ✓。
//
// 码（**全部取自已登记清单** ✓）：`VMU_BALLOT_MIN_VOTES_NOT_MET`／`VMU_BALLOT_TIE_UNRESOLVED`／
//   `VMU_BALLOT_SECRECY_LOCKED`／`VMU_BALLOT_ABSTAIN_NOT_ALLOWED`／`VMU_BALLOT_FROZEN`／
//   `VMU_BALLOT_ROUNDS_EXHAUSTED`／`VMU_BALLOT_METHOD_UNSUPPORTED`／`VMU_CONFLICT`／`VMU_NOT_FOUND`。

export const ALL_BALLOT_KEYS = Object.freeze([
  'vmu.ballot.abstainAllowed', 'vmu.ballot.abstainCountsForFloor', 'vmu.ballot.auditReadOnly',
  'vmu.ballot.auditRetentionMs', 'vmu.ballot.freezeMeetingLinked', 'vmu.ballot.freezeMode',
  'vmu.ballot.irvInstantSingleCount', 'vmu.ballot.method', 'vmu.ballot.minVotes', 'vmu.ballot.minVotesRatio',
  'vmu.ballot.processReadingsVisible', 'vmu.ballot.proxyChainMaxDepth', 'vmu.ballot.proxyMode',
  'vmu.ballot.quadraticCreditCap', 'vmu.ballot.quotaSeats', 'vmu.ballot.recuseDeclareMode',
  'vmu.ballot.recusePublic', 'vmu.ballot.reopenFloor', 'vmu.ballot.reopenInitiatorScope',
  'vmu.ballot.reopenSameMeetingOnly', 'vmu.ballot.rollCallOrder', 'vmu.ballot.roundsMax',
  'vmu.ballot.runoffTopN', 'vmu.ballot.secrecy', 'vmu.ballot.secrecyRecordFact',
  'vmu.ballot.tieRule', 'vmu.ballot.vetoMode',
])
/** 已接（真求值）的键 ⇒ 有行为变化 ✓。 */
export const WIRED_BALLOT_KEYS = Object.freeze([
  'vmu.ballot.method', 'vmu.ballot.minVotes', 'vmu.ballot.minVotesRatio', 'vmu.ballot.abstainAllowed',
  'vmu.ballot.abstainCountsForFloor', 'vmu.ballot.secrecy', 'vmu.ballot.secrecyRecordFact',
  'vmu.ballot.tieRule', 'vmu.ballot.runoffTopN', 'vmu.ballot.roundsMax', 'vmu.ballot.rollCallOrder',
  'vmu.ballot.proxyMode', 'vmu.ballot.proxyChainMaxDepth', 'vmu.ballot.quadraticCreditCap',
  'vmu.ballot.quotaSeats', 'vmu.ballot.recusePublic', 'vmu.ballot.recuseDeclareMode',
  'vmu.ballot.vetoMode', 'vmu.ballot.auditReadOnly', 'vmu.ballot.auditRetentionMs',
  'vmu.ballot.processReadingsVisible',
  // ROUND 157: implemented in close() (the irv branch) - read, and it DECIDES (an irv box without it is
  // refused by name rather than counted as something else).
  'vmu.ballot.irvInstantSingleCount',
  // GAP-MTG-10 (round 3): `reopen()` landed in this face (own implementation, no second one anywhere), so the
  // floor it reads is a WIRED key now — it is read AND it decides (a thin ruling is refused by name).
  'vmu.ballot.reopenFloor',
])
// ROUND 157: the IRV counter lives in `ballot.js` beside `defaultTally` - the single tally source - and is imported
// here rather than reimplemented (cite, never copy).
import { instantRunoffTally } from './ballot.js'
import { CODE as RESUME_CODE } from './resume.js'

/** 未接：**逐个点名＋原因** ✗✓（不得静默 ✗）。 */
export const PLANNED_BALLOT_KEYS = Object.freeze([
  /**
   * ROUND 157: `irvInstantSingleCount` LEFT this list - it is implemented in `close()` now (see the irv branch), so
   * this face is down to the five entries that are genuinely owned elsewhere. Those keep the carrier's name and the
   * test line that proves it lives, which round 152 added.
   */
  ['vmu.ballot.freezeMode', '冻结行为由 `ballot.js` 的暂停闸承载 ✓（**不是本面** ✗）：`isPaused()` 同时闸住**开票**与**投票** ⇒ 具名拒 `VMU_STATE`；'
    + '运行时证据＝`tests/vmu-ballot.test.mjs` L89「冻结期间的投票被具名拒」✓、L143「未冻结却解冻被拒」✓；谓词由 `control` 面注入 ✓。'
    + '★ **轮 193 实测**：★ **本键的 `manual｜event` 区分【在任何面都没有实现】** ✗ —— `manual`（要冻结时才冻结 ✓）正是内核今天的行为 ✓；'
    + '`event`（按事件自动冻结 ✓）需要**事件源** ✓，而**没有任何面提供它** ✗ ⇒ **复活条件**：先有事件源（`bus` 型 ✓ 或 `scheduler` 型 ✓），再在冻结入口读本键 ✓'],
  ['vmu.ballot.freezeMeetingLinked', '★ **轮 193 实测更正** ✗✓：原句说「与会议联动的部分归 `meeting`／`board` 面」✓ —— '
    + '**实测是【设计归属】，不是已存在的机器** ✗：`board.js` 对 `freeze／frozen／reopen／reconsider／initiator／sameMeeting` **命中 0** ✗；'
    + '`meeting.js` 的 4 处**全是注释** ✓（暂停会冻结会议启动 ✓、s8-freeze-say 的教训 ✓）；`meetings.js` 的 3 处是 **JS 的 `Object.freeze`** ✗（假阳性 ✓）。'
    + '⇒ ★★ **「冻结是否联动会议轮次」在任何面【都没有实现】** ✗。**复活条件**：先有**会议轮次 ↔ 票箱**的联动点（`meeting.js` 的轮次生命周期 ✓），再读本键 ✓；'
    + '`ballot.js` 只做**票箱级**冻结 ✓（暂停谓词注入 ✓）⇒ 本面不建会议状态机 ✓'],
  ['vmu.ballot.reopenInitiatorScope', '★ **轮 193 实测更正** ✗✓：原句说发起人范围属**议程**（`board`／`meetings` ✓）—— '
    + '**实测：`initiator` 在 `board.js`／`meeting.js`／`meetings.js` 里【全部零命中】** ✗ ⇒ ★ **「防滥诉」目前是【设计意图，没有任何承载】** ✗；'
    + '票箱里确实没有「动议」这一概念 ✓ ⇒ 本面**不该**凭空造它 ✓。**复活条件**：议程面先有**动议对象**（含发起人 ✓）⇒ 再由它读本键 ✓'],
  ['vmu.ballot.reopenSameMeetingOnly', '★ **轮 193 实测更正** ✗✓：原句说同会期约束属**议程** ✓ —— '
    + '**实测：`sameMeeting` 在 `board.js`／`meeting.js`／`meetings.js` 里零命中** ✗ ⇒ **该约束【没有任何实现】** ✗；'
    + '而 `ballot.js` 的 `reopen(reason)` 只带理由、不带会期 ✓（**理由是审计事实** ✓）⇒ 这一半仍为真 ✓。'
    + '**复活条件**：票箱先能**记住自己属于哪个会期** ✓（那需要会议面给出会期标识 ✓）⇒ 再读本键 ✓'],
])

const refuse = (code, message, hint) => ({ ok: false, code, message, hint })

export function createBallotBox(opts) {
  const o = opts || {}
  const readKey = (k) => (o.settings && typeof o.settings.get === 'function' ? o.settings.get(k) : (o.settings || {})[k])
  // F28 (the "表决" half): a board left open forever gets the same bounded, NAMED and REVOCABLE fallback as a
  // meeting. The bound is DECLARED BY THE CONSTRUCTOR (`openMaxMs`, 0 = zero-mechanism = no fallback at all).
  //
  // WHY THERE IS DELIBERATELY NO SETTINGS KEY FOR IT (decided after the read-side audit flagged an earlier comment
  // that merely NAMED one): the bound belongs to ONE BOARD's lifetime. A settings key would be read either at
  // construction (so a hot change silently applies only to future boards) or per call (so a hot change could move
  // the bound of a board that is already being voted on) — both are worse than "the constructor declares it,
  // visibly, in the same place that creates the board". The pack that builds the box owns the policy; this face
  // reads no settings key here, so nothing is declared that no reader consumes.
  const openMaxMs = Number.isFinite(Number(o.openMaxMs)) && Number(o.openMaxMs) > 0 ? Math.floor(Number(o.openMaxMs)) : 0
  const LAPSE_NAME = 'ballot-lapse'
  const clock = typeof o.clock === 'function' ? o.clock : () => 0
  const log = typeof o.log === 'function' ? o.log : () => {}
  const emit = (ev, payload) => {
    if (typeof ev === 'string') ev = Object.assign({ type: ev }, payload || {})
  // ROUND 4 / task-25 (Lead's audit, extended to this module): the bus takes a STRING NAME as its first argument. This
  // helper forwarded the event OBJECT, so every emission from this module threw and was swallowed - the module LOOKED
  // wired and emitted nothing. The name is split out here, and a refusal (unregistered name, blocking middleware) is
  // NAMED through this module's own log instead of vanishing.
  if (!o.bus || typeof o.bus.emit !== 'function') return
  const name = ev && typeof ev.type === 'string' ? ev.type : null
  if (name === null) return log({ type: 'bus/emit-failed', at: clock(), name: null, code: 'VMU_BUS_NAME_REQUIRED', message: 'a bus event needs a string name (got an object without .type)' })
  try { o.bus.emit(name, ev) } catch (e) { log({ type: 'bus/emit-failed', at: clock(), name, code: (e && e.code) || 'VMU_BUS_EMIT_FAILED', message: String((e && e.message) || e) }) }
}

  const refusals = new Map()
  const bumpRefusal = (code) => { refusals.set(code, (refusals.get(code) || 0) + 1) }
  const ENFORCED_SCOPE = 'evaluated-so-far'
  /**
   * R7 — 「表决人数下限」的可读数。规则原文：下限 = min(用户设置数, 院士+常驻研究员数)。
   * 实现里这个数**曾经只在拒绝时算**（`VMU_BALLOT_MIN_VOTES_NOT_MET` 的 `tally.floor`），于是"通过了的表决"
   * 反而查不到它过的是哪条线 —— 读数在需要它的时候恰好缺失。这里只做两件事：取声明值、与有表决权人数取小。
   * `setting` 为 0（未设）时按"全员"解释（min(∞, n) = n），并把 `boundBy` 写成 'eligible'，让读者知道这条线是
   * 被人数而不是被设置卡住的。★ 它不是 close() 内部那个 `floor`（那个还叠加 minVotesRatio、且决定成不成会），
   * 两者口径不同，因此名字区分开（`ruleFloor` vs `tally.floor`），不给读者一个看不出差别的数。
   */
  const floorReading = (box, c) => {
    const declared = box && box.rules && Number.isInteger(box.rules.minVotes) ? box.rules.minVotes : (c ? c.minVotes : 0)
    const eligible = box && Array.isArray(box.eligible) ? box.eligible.length : null
    const required = eligible === null ? declared : Math.min(declared > 0 ? declared : eligible, eligible)
    const cast = box ? box.votes.size + ((c && c.abstainCountsForFloor) ? box.abstain.size : 0) : 0
    return Object.freeze({
      rule: 'min(设置数, 有表决权人数)',
      setting: declared,
      eligible,
      required,
      cast,
      met: required === 0 ? true : cast >= required,
      boundBy: (eligible !== null && required === eligible && (declared === 0 || declared > eligible)) ? 'eligible' : 'vmu.ballot.minVotes',
    })
  }
  // 入列前查重（D3 统一口径 ✓）：同一个键在一份回执里**只出现一次** ✗✓ —— **不改** `enforced` 的数组语义 ✓
  const mark = (list, key) => { if (key && list.indexOf(key) === -1) list.push(key); return list }
  const deny = (code, msg, hint, enforced) => {
    bumpRefusal(code)
    // 拒绝一律**带上 `enforced`**（数组 ✓，可空 ✓，**不得 `undefined`** ✗✓）—— 照 `mathtools.js` 口径 ✓
    // D3（第 26 轮）：并带 `enforcedScope` ⇒ 明写这是"**到此为止**"的已求值集合，**不是**全集 ✗✓
    const keys = Array.isArray(enforced) ? enforced.slice() : []
    return Object.assign(refuse(code, msg, hint), { enforced: keys, enforcedScope: ENFORCED_SCOPE })
  }

  const boxes = new Map()
  let seq = 0
  let droppedAudit = 0

  const cfg = () => {
    const n = (k, d) => { const v = Number(readKey(k)); return Number.isFinite(v) && v >= 0 ? Math.floor(v) : d }
    const s = (k, d) => { const v = readKey(k); return (v === undefined || v === null || v === '') ? d : String(v) }
    const b = (k, d) => { const v = readKey(k); return v === undefined ? d : v === true }
    return {
      method: s('vmu.ballot.method', 'plurality'),
    // ROUND 157: whether IRV is resolved in ONE ruling. Default false, so nothing changes unless a pack asks; with
    // it off an `irv` box is refused by name rather than silently counted as something else.
    irvInstantSingleCount: b('vmu.ballot.irvInstantSingleCount', false),
      minVotes: n('vmu.ballot.minVotes', 0),
      minVotesRatio: Number(readKey('vmu.ballot.minVotesRatio')) > 0 ? Number(readKey('vmu.ballot.minVotesRatio')) : 0,
      abstainAllowed: b('vmu.ballot.abstainAllowed', true),
      abstainCountsForFloor: b('vmu.ballot.abstainCountsForFloor', false),
      secrecy: b('vmu.ballot.secrecy', false),
      secrecyRecordFact: b('vmu.ballot.secrecyRecordFact', true),
      tieRule: s('vmu.ballot.tieRule', 'unresolved'),
      // GAP-MTG-10: the floor a SETTLED box must clear before it may be reopened (0 = no floor). It is read in
      // `reopen()` and it DECIDES (a thin ruling is refused by name instead of being reopened silently).
      reopenFloor: n('vmu.ballot.reopenFloor', 0),
      runoffTopN: n('vmu.ballot.runoffTopN', 0),
      roundsMax: n('vmu.ballot.roundsMax', 2),
      rollCallOrder: s('vmu.ballot.rollCallOrder', 'roster'),
      proxyMode: s('vmu.ballot.proxyMode', 'off'),
      proxyChainMaxDepth: n('vmu.ballot.proxyChainMaxDepth', 0),
      quadraticCreditCap: n('vmu.ballot.quadraticCreditCap', 0),
      quotaSeats: n('vmu.ballot.quotaSeats', 1),
      recusePublic: b('vmu.ballot.recusePublic', false),
      recuseDeclareMode: s('vmu.ballot.recuseDeclareMode', 'self'),
      vetoMode: s('vmu.ballot.vetoMode', 'off'),
      auditReadOnly: b('vmu.ballot.auditReadOnly', true),
      auditRetentionMs: n('vmu.ballot.auditRetentionMs', 0),
      processReadingsVisible: b('vmu.ballot.processReadingsVisible', false),
    }
  }
  const keysUsed = () => WIRED_BALLOT_KEYS.slice()
  const partition = () => ({
    all: ALL_BALLOT_KEYS.length,
    wired: WIRED_BALLOT_KEYS.length,
    planned: PLANNED_BALLOT_KEYS.length,
    disjoint: WIRED_BALLOT_KEYS.every((k) => PLANNED_BALLOT_KEYS.every((p) => p[0] !== k)),
    exact: WIRED_BALLOT_KEYS.length + PLANNED_BALLOT_KEYS.length === ALL_BALLOT_KEYS.length,
  })

  const open = (a) => {
    const args = a || {}
    const c = cfg()
    // ★ PHASE 7: PER-BOX RULES live ON THE BOX, never in a global setting snapshot. The six the original v5r §7.1
    // allows (options/one-or-multi/max/min choices/min_votes/allow_revote) are accepted here; unknown names are a
    // NAMED refusal so a typo cannot silently become "the global default".
    const RULE_KEYS = ['minVotes', 'allowRevote', 'maxChoices', 'minChoices', 'mode']
    const rawRules = args.rules === undefined || args.rules === null ? null : args.rules
    const rules = {}
    if (rawRules !== null) {
      if (typeof rawRules !== 'object' || Array.isArray(rawRules)) return deny('VMU_BALLOT_RULE_INVALID', 'open 的 rules 必须是对象', '例如 { minVotes: 2, mode: "single" }')
      for (const k of Object.keys(rawRules)) if (!RULE_KEYS.includes(k)) {
        return deny('VMU_BALLOT_RULE_UNKNOWN', '未知的票箱规则：' + k, '允许：' + RULE_KEYS.join('、'))
      }
      if (rawRules.minVotes !== undefined) {
        if (!Number.isInteger(rawRules.minVotes) || rawRules.minVotes < 0) return deny('VMU_BALLOT_RULE_INVALID', 'rules.minVotes 必须是非负整数', '例如 minVotes: 2')
        if (Array.isArray(args.eligible) && rawRules.minVotes > args.eligible.length) {
          return deny('VMU_BALLOT_RULE_INVALID', 'rules.minVotes=' + rawRules.minVotes + ' 大于有表决权人数 ' + args.eligible.length, '门槛不能高于可投票人数')
        }
        rules.minVotes = rawRules.minVotes
      }
      if (rawRules.allowRevote !== undefined) {
        if (typeof rawRules.allowRevote !== 'boolean') return deny('VMU_BALLOT_RULE_INVALID', 'rules.allowRevote 必须是布尔值', 'true|false')
        rules.allowRevote = rawRules.allowRevote
      }
      for (const k of ['maxChoices', 'minChoices']) {
        if (rawRules[k] === undefined) continue
        if (!Number.isInteger(rawRules[k]) || rawRules[k] < 1) return deny('VMU_BALLOT_RULE_INVALID', 'rules.' + k + ' 必须是正整数', '例如 ' + k + ': 2')
        rules[k] = rawRules[k]
      }
      if (rawRules.mode !== undefined) {
        if (rawRules.mode !== 'single' && rawRules.mode !== 'multi') return deny('VMU_BALLOT_RULE_INVALID', 'rules.mode 只能是 single|multi', 'single|multi')
        rules.mode = rawRules.mode
      }
      if (rules.minChoices !== undefined && rules.maxChoices !== undefined && rules.minChoices > rules.maxChoices) {
        return deny('VMU_BALLOT_RULE_INVALID', 'rules.minChoices 不能大于 maxChoices', 'minChoices <= maxChoices')
      }
      if (rules.mode === 'single' && (rules.maxChoices === undefined || rules.maxChoices > 1)) rules.maxChoices = 1
    }
    // **真实求值列表**（求值点即列举点 ✓；未求值/未改变行为者**不得**出现 ✗✓）
    const enforced = []
    const evalKey = (k) => { mark(enforced, k) }
    evalKey('vmu.ballot.method')                                        // 用于 method 白名单校验 ⇒ 真求值 ✓
    if (c.secrecy === true) evalKey('vmu.ballot.secrecy')               // 只有"开"才改变可观测行为（sealed=true）✓
    // 注：`abstainAllowed` **不在此处列举** ✗✓（open 读了它但不改变本次结果 ⇒ 留到真正起作用的 cast 拒绝处 ✓）
    const allowed = ['plurality', 'approval', 'runoff', 'irv']
    if (allowed.indexOf(c.method) === -1) return deny('VMU_BALLOT_METHOD_UNSUPPORTED', '不支持的 method：' + c.method, '可用：' + allowed.join('、'), enforced.slice())
    const question = String(args.question || '').trim()
    const options = Array.isArray(args.options) ? args.options.map(String) : []
    if (!question || options.length < 2) return deny('VMU_CONFLICT', 'open 需要 question 与 ≥2 个 options', '给出问题与选项')
    const id = 'bx-' + (++seq)
    const box = { id, question, options, at: clock(), round: 1, votes: new Map(), abstain: new Map(), absent: [], recused: [], sealed: c.secrecy, tieUsed: '', rounds: 0, enforced, rules, rulesDeclared: rawRules !== null,
      // GAP-MTG-10: a box has an explicit life cycle now, because `reopen()` has to mean something. `state` is
      // `open` | `closed`; only a CLOSED box may be reopened, and a closed box never accepts another vote.
      state: 'open', closedAt: 0, priorResult: null, reopenCount: 0, reopenedAt: 0, reopenHistory: [],
      // ★ ELIGIBILITY IS RECORDED HERE, AND ENFORCED AT CAST TIME. It used to be consulted only when validating
      // `minVotes`, and never stored - so `cast` had no idea who was entitled to vote, and any caller reaching it
      // directly could add a vote from someone who is not. That is the same bypass the meeting service had before
      // the members seam was wired; here it is a missing record rather than a missing seam.
      eligible: Array.isArray(args.eligible) ? args.eligible.map((x) => String(x)) : null }
    boxes.set(id, box)
    emit('ballot/open', { id })
    return { ok: true, boxId: id, round: box.round, sealed: box.sealed, rules: box.rules || null, rulesDeclared: box.rulesDeclared === true, ruleFloor: floorReading(box, cfg()), enforced, enforcedScope: ENFORCED_SCOPE }
  }

  const castBody = (a) => {
    const args = a || {}
    const box = boxes.get(String(args.boxId || ''))
    if (!box) return deny('VMU_NOT_FOUND', '找不到票箱 ' + String(args.boxId || ''), '先 open() 取 id')
    // GAP-MTG-10: a SETTLED box is not a ballot any more. Without this guard `reopen()` could never mean
    // "reconsider a closed ruling", because the ruling would still be accumulating votes.
    if (box.state !== 'open') return deny('VMU_STATE', '该票箱已裁定（state=' + box.state + '）：不再收票', '要重开请调 reopen()（附理由；受 vmu.ballot.reopenFloor 约束）')
    const by = String(args.by || '').trim()
    if (!by) return deny('VMU_CONFLICT', 'cast 需要 by（投票人）', 'by 必填')
    // ★ THE ENTITLEMENT CHECK THE BOX WAS MISSING. An empty or absent list means "no restriction was declared",
    // which stays the zero-policy default; a non-empty list means exactly those ids may vote, and anyone else is
    // refused BY NAME rather than quietly counted.
    if (Array.isArray(box.eligible) && box.eligible.length > 0 && !box.eligible.includes(by)) {
      return deny('VMU_NOT_PERMITTED', 'not eligible to vote in this box: ' + by,
        'this box was opened with an explicit eligible list: ' + box.eligible.join(', '))
    }
    const br = box.rules || {}
    if (box.votes.has(by) || box.abstain.has(by)) {
      if (br.allowRevote !== true) return deny('VMU_CONFLICT', '重复投票被拒：' + by, '该票箱 allowRevote=false ⇒ 一人一票')
      box.votes.delete(by); box.abstain.delete(by)
    }
    const c = cfg()
    const enforced = []
    if (String(args.choice) === 'abstain') {
      // **只在它真的改变本次结果时入列** ✗✓：`abstainAllowed=false` 且本次是弃权 ⇒ 入列 ✓；
      // `true` 时弃权**照样成功** ⇒ **不入列** ✓（否则就是"读"而非"起作用" ✗）。
      if (!c.abstainAllowed) return deny('VMU_BALLOT_ABSTAIN_NOT_ALLOWED', '该配置不允许弃权（abstainAllowed=false）', '打开它，或给出选项', ['vmu.ballot.abstainAllowed'])
      box.abstain.set(by, clock())
      return { ok: true, boxId: box.id, kind: 'abstain', sealed: box.sealed, enforced, enforcedScope: ENFORCED_SCOPE }
    }
    // ROUND 157: a ranked ballot carries `choices` (best first). `choice` keeps its exact old meaning, so no
    // existing method changes behaviour; a ranked list is only ever stored when the caller sends one.
    const ranked = Array.isArray(args.choices) ? args.choices.map((x) => String(x === undefined || x === null ? '' : x).trim()).filter((x) => x !== '') : null
    /**
     * ROUND 159 — APPROVAL BALLOTS CARRY A SET. `allowed` had declared this method for as long as the whitelist has
     * existed while no branch ever mentioned it, so an approval box was silently counted as plurality: the face
     * claimed to support something and did something else. `scripts/audit-enum-branches.mjs` finds exactly that shape
     * by counting occurrences, and this is the fix it pointed at. A scalar `choice` remains a ONE-ELEMENT approval
     * set, so the old call shape keeps working unchanged.
     */
    const approved = Array.isArray(args.approvals) ? args.approvals.map((x) => String(x === undefined || x === null ? '' : x).trim()).filter((x) => x !== '') : null
    const list = ranked || approved
    const choice = list || String(args.choice || '')
    if (br.mode === 'single' || br.maxChoices !== undefined || br.minChoices !== undefined) {
      const n = list ? list.length : 1
      const maxC = br.maxChoices !== undefined ? br.maxChoices : (br.mode === 'single' ? 1 : Infinity)
      const minC = br.minChoices !== undefined ? br.minChoices : 1
      if (n < minC) return deny('VMU_BALLOT_CHOICE_COUNT', '选择数 ' + n + ' 少于规则 minChoices=' + minC, '按该票箱规则至少选 ' + minC)
      if (n > maxC) return deny('VMU_BALLOT_CHOICE_COUNT', '选择数 ' + n + ' 多于规则 maxChoices=' + maxC, '按该票箱规则最多选 ' + maxC)
    }
    if (list) {
      const off = list.filter((x) => box.options.indexOf(x) === -1)
      if (off.length) return deny('VMU_CONFLICT', '清单里有不在票面上的选项：' + off.join('、'), '可选：' + box.options.join('、'))
    } else if (box.options.indexOf(choice) === -1) return deny('VMU_CONFLICT', '选项不在票面上：' + choice, '可选：' + box.options.join('、'))
    if (c.recuseDeclareMode === 'required' && args.recuse !== undefined) mark(enforced, 'vmu.ballot.recuseDeclareMode')
    if (args.recuse === true) {
      mark(enforced, 'vmu.ballot.recusePublic')
      box.recused.push(by)
      if (c.recusePublic) emit('ballot/recuse', { boxId: box.id, by })
      return { ok: true, boxId: box.id, kind: 'recused', sealed: box.sealed, enforced, enforcedScope: ENFORCED_SCOPE }
    }
    // ROUND 158: a ranked ballot is stored AS A LIST. The scalar path keeps its exact old meaning (`String(choice)`),
    // so no existing method changes behaviour; stringifying a list would have destroyed the ranking that IRV needs.
    box.votes.set(by, list ? list.slice() : String(choice))
    if (c.proxyMode === 'on' && args.proxyFor) { mark(enforced, 'vmu.ballot.proxyMode'); if (c.proxyChainMaxDepth > 0) mark(enforced, 'vmu.ballot.proxyChainMaxDepth') }
    if (c.quadraticCreditCap > 0 && Number(args.credits) > c.quadraticCreditCap) { return deny('VMU_CONFLICT', 'credits 超上限 ' + c.quadraticCreditCap + '（`vmu.ballot.quadraticCreditCap`）', '调小 credits', ['vmu.ballot.quadraticCreditCap']) }
    return { ok: true, boxId: box.id, kind: 'vote', sealed: box.sealed, enforced, enforcedScope: ENFORCED_SCOPE }
  }

  /**
   * G7 (Round 8) — the BOARD's cast commits through the SAME durable log the ballot face uses
   * (`createDurableCommitLog`, `kernel/ballot.js`): intent reserved, body run, outcome recorded. With no queue bound
   * (`o.durableQueue` absent) the body runs unchanged and nothing pretends to be durable.
   */
  const cast = (a) => {
    const q = o.durableQueue
    if (!q || q.durable !== true) return castBody(a)
    const rec = q.reserve({ kind: 'ballotbox-cast', boxId: a && a.boxId, by: a && a.by })
    try {
      const r = castBody(a)
      q.complete(rec, r && r.ok === false ? 'refused' : 'accepted')
      return r
    } catch (e) {
      q.complete(rec, 'refused')
      throw e
    }
  }

  /** 缺席/未到（**与弃权分开计数** ✗✓）。A SETTLED box refuses attendance marks for the same reason it refuses votes. */
  const markAbsent = (a) => {
    const box = boxes.get(String((a && a.boxId) || ''))
    if (!box) return deny('VMU_NOT_FOUND', '找不到票箱', '先 open()')
    if (box.state !== 'open') return deny('VMU_STATE', '该票箱已裁定（state=' + box.state + '）：不再记缺席', '要重开请调 reopen()（附理由）')
    const who = String((a && a.by) || '').trim()
    if (!who) return deny('VMU_CONFLICT', 'markAbsent 需要 by', 'by 必填')
    if (box.absent.indexOf(who) === -1) box.absent.push(who)
    return { ok: true, boxId: box.id, absent: box.absent.length, abstain: box.abstain.size }
  }

  const close = (a) => {
    const box = boxes.get(String((a && a.boxId) || ''))
    if (!box) return deny('VMU_NOT_FOUND', '找不到票箱 ' + String((a && a.boxId) || ''), '先 open() 取 id')
    const c = cfg()
    const enforced = ['vmu.ballot.minVotes', 'vmu.ballot.minVotesRatio', 'vmu.ballot.abstainCountsForFloor', 'vmu.ballot.tieRule']
    /**
     * ROUND 157 — IRV IS RESOLVED HERE, IN ONE RULING. The round-based model cannot express instant-runoff (it would
     * need one session per elimination round), which is exactly why `irvInstantSingleCount` exists: with it on, the
     * tally runs to completion inside this one ruling and every round it took is returned in `rounds[]`. With it off
     * an `irv` box is refused BY NAME instead of being counted as something it is not.
     */
    /**
     * ROUND 159 — APPROVAL VOTING, the method `allowed` had been claiming all along. Each voter approves a SET; the
     * most-approved option wins; a tie for most is NOT broken here but returned as `undecided` with the tied options
     * NAMED, the same rule the instant-runoff counter follows, because the tie rule belongs to the pack. A scalar
     * `choice` counts as a one-element approval set, so nothing about the old shape changes.
     */
    if (c.method === 'approval') {
      mark(enforced, 'vmu.ballot.method')
      const counts = {}
      const sets = []
      for (const [who, v] of box.votes.entries()) {
        const set = [...new Set(Array.isArray(v) ? v : [String(v)])]
        sets.push({ who, set })
        for (const o of set) counts[o] = (counts[o] || 0) + 1
      }
      const rankedApprovals = Object.keys(counts).map((o) => ({ option: o, n: counts[o] })).sort((x, y) => y.n - x.n || String(x.option).localeCompare(String(y.option)))
      const top = rankedApprovals[0] || null
      const tie = top ? rankedApprovals.filter((r) => r.n === top.n).map((r) => r.option) : []
      return {
        ok: true, boxId: box.id, method: 'approval', round: box.round,
        outcome: top && tie.length === 1 ? top.option : 'undecided',
        reason: !top ? 'no approvals cast' : (tie.length === 1 ? 'most approvals' : 'tie for most approvals'),
        tally: Object.assign({}, counts), approvals: sets.length, ballots: sets,
        tie: tie.length > 1 ? tie : [],
        enforced, enforcedScope: ENFORCED_SCOPE,
      }
    }
    if (c.method === 'irv') {
      mark(enforced, 'vmu.ballot.method')
      if (!c.irvInstantSingleCount) {
        mark(enforced, 'vmu.ballot.irvInstantSingleCount')
        return Object.assign(deny('VMU_BALLOT_METHOD_UNSUPPORTED',
          'irv 需要 `vmu.ballot.irvInstantSingleCount=true` ⇒ 拒（否则 IRV 只能靠**逐轮重开会议**表达 ✗）',
          '打开该键：IRV 在**一次裁定内**解完所有淘汰轮，且 `rounds[]` 全程留痕 ✓', enforced), { method: c.method })
      }
      mark(enforced, 'vmu.ballot.irvInstantSingleCount')
      const irvVotes = {}
      for (const [who, v] of box.votes.entries()) irvVotes[who] = { kind: 'decisive', value: Array.isArray(v) ? v : [v] }
      const r = instantRunoffTally({ votes: irvVotes, eligible: box.options.slice(), quorumRule: 'irv (majority of continuing)' })
      box.rounds = r.detail.rounds.length
      return {
        ok: true, boxId: box.id, method: 'irv', round: box.round, rounds: r.detail.rounds,
        outcome: r.outcome, reason: r.reason, elected: r.detail.elected, exhausted: r.detail.exhausted, tie: r.detail.tie,
        tally: r.detail.rounds.length ? r.detail.rounds[r.detail.rounds.length - 1].counts : {},
        enforced, enforcedScope: ENFORCED_SCOPE,
      }
    }
    const castN = box.votes.size + box.abstain.size
    const floorBase = box.votes.size + (c.abstainCountsForFloor ? box.abstain.size : 0)
    const boxMinVotes = box.rules && Number.isInteger(box.rules.minVotes) ? box.rules.minVotes : c.minVotes
    const floor = Math.max(boxMinVotes, Math.ceil((box.options.length ? 1 : 0) * 0 + c.minVotesRatio * (box.votes.size + box.abstain.size + box.absent.length)))
    // **法定人数不足 ⇒ 具名拒（不是"未通过"）** ✗✓
    if (floorBase < floor) {
      // **点名是哪把尺子不够** ✗✓（`minVotes` 还是 `minVotesRatio`）—— 求值点即列举点 ✓
      const ratioFloor = Math.ceil(c.minVotesRatio * (box.votes.size + box.abstain.size + box.absent.length))
      const boundBy = boxMinVotes >= ratioFloor ? (box.rules && Number.isInteger(box.rules.minVotes) ? 'ballot.rules.minVotes' : 'vmu.ballot.minVotes') : 'vmu.ballot.minVotesRatio'
      mark(enforced, boundBy)
      return Object.assign(deny('VMU_BALLOT_MIN_VOTES_NOT_MET', '法定人数不足：' + floorBase + ' < ' + floor + '（受限键：`' + boundBy + '`）⇒ **本次不是"未通过"，而是"未成立"** ✗✓',
        '继续收票/催票；不得把不足法定人数的结果当否决 ✗'), { tally: { cast: castN, votes: box.votes.size, abstain: box.abstain.size, absent: box.absent.length, floor, floorBase, boundBy }, enforced })
    }
    const tally = {}
    for (const v of box.votes.values()) tally[v] = (tally[v] || 0) + 1
    const ranked = Object.keys(tally).map((k) => ({ option: k, n: tally[k] })).sort((x, y) => y.n - x.n || String(x.option).localeCompare(String(y.option)))
    const top = ranked[0], second = ranked[1]
    let outcome = top ? top.option : ''
    const tie = !!(top && second && top.n === second.n)
    // **平票**：先看是否进第二轮（✓ 顺序很重要：runoff 必须在 unresolved 拒之前），再按 tieRule 处置并自曝 ✓
    if (tie) {
      mark(enforced, 'vmu.ballot.tieRule')
      if (c.method === 'runoff' && c.runoffTopN >= 2 && box.round < c.roundsMax) {
        mark(enforced, 'vmu.ballot.runoffTopN'); mark(enforced, 'vmu.ballot.roundsMax')
        box.round += 1
        box.votes = new Map(); box.abstain = new Map()
        emit('ballot/runoff', { boxId: box.id, round: box.round })
        return { ok: true, boxId: box.id, round: 2, runoff: ranked.slice(0, c.runoffTopN).map((x) => x.option), tally: { cast: castN, votes: castN, abstain: 0, absent: box.absent.length, floor, floorBase, ruleFloor: floorReading(box, c) }, enforced, enforcedScope: ENFORCED_SCOPE, note: '进入第二轮 ✓' }
      }
      if (c.method === 'runoff' && box.round >= c.roundsMax) {
        mark(enforced, 'vmu.ballot.roundsMax')
        return Object.assign(deny('VMU_BALLOT_ROUNDS_EXHAUSTED', '轮次用尽（roundsMax=' + c.roundsMax + '）仍平票', '人工裁定或调大 roundsMax'), { enforced })
      }
      if (c.tieRule === 'unresolved') {
        box.tieUsed = 'unresolved'
        return Object.assign(deny('VMU_BALLOT_TIE_UNRESOLVED', '平票且 tieRule=unresolved ⇒ 不判定（自曝规则：unresolved ✓）', '设 tieRule=chair|status-quo，或人工裁定'), { tally: { cast: castN, votes: box.votes.size, abstain: box.abstain.size, absent: box.absent.length, floor, floorBase }, enforced, tieUsed: 'unresolved' })
      }
      if (c.tieRule === 'status-quo') {
        // G5 第六轮 F2: the declared domain value now has an EXPLICIT branch (it used to fall through the else).
        // status-quo = keep the current leading option, and SAY SO in the receipt.
        box.tieUsed = 'status-quo'
        outcome = top.option
      } else {
        box.tieUsed = c.tieRule
        outcome = (c.tieRule === 'chair') ? (String(a && a.chairChoice || '') || top.option) : top.option
      }
    }
    // 第二轮（runoffTopN）
    if (c.method === 'runoff' && c.runoffTopN >= 2 && box.round < c.roundsMax && tie) {
      mark(enforced, 'vmu.ballot.runoffTopN'); mark(enforced, 'vmu.ballot.roundsMax')
      box.round += 1
      box.votes = new Map(); box.abstain = new Map()
      emit('ballot/runoff', { boxId: box.id, round: box.round })
      return { ok: true, boxId: box.id, round: 2, runoff: ranked.slice(0, c.runoffTopN).map((x) => x.option), tally: { cast: castN, votes: castN, abstain: 0, absent: box.absent.length, floor, floorBase, ruleFloor: floorReading(box, c) }, enforced, enforcedScope: ENFORCED_SCOPE, note: '进入第二轮 ✓' }
    }
    if (c.method === 'runoff' && box.round >= c.roundsMax && tie) {
      mark(enforced, 'vmu.ballot.roundsMax')
      return Object.assign(deny('VMU_BALLOT_ROUNDS_EXHAUSTED', '轮次用尽（roundsMax=' + c.roundsMax + '）仍平票', '人工裁定或调大 roundsMax'), { enforced })
    }
    box.rounds += 1
    const audit = c.auditReadOnly ? [] : null
    if (c.auditReadOnly) mark(enforced, 'vmu.ballot.auditReadOnly')
    if (c.auditRetentionMs > 0) mark(enforced, 'vmu.ballot.auditRetentionMs')
    if (c.processReadingsVisible) mark(enforced, 'vmu.ballot.processReadingsVisible')
    if (c.secrecy && c.secrecyRecordFact) mark(enforced, 'vmu.ballot.secrecyRecordFact')
    // GAP-MTG-10: THIS is the settled ruling — the box closes here, and only here. The earlier returns are
    // "not settled" (another runoff round, or a named refusal), so they must NOT mark it closed.
    box.state = 'closed'
    box.closedAt = clock()
    box.priorResult = { outcome, round: box.round, tieUsed: box.tieUsed || '', sealed: box.sealed }
    return {
      ok: true, boxId: box.id, round: box.round, outcome,
      // **秘密表决 ⇒ 明细不可回收，但计数保留** ✓
      detail: box.sealed ? null : Array.from(box.votes.entries()).map(([by, choice]) => ({ by, choice })),
      sealed: box.sealed,
      tieUsed: box.tieUsed || '',
      tally: { cast: castN, votes: box.votes.size, abstain: box.abstain.size, absent: box.absent.length, floor, floorBase, ranked },
      enforced: enforced.slice(),
      enforcedScope: ENFORCED_SCOPE,
      audit,
    }
  }

  /**
   * REOPEN a SETTLED box (GAP-MTG-10). This face holds its own box objects and never instantiates
   * `createBallot`, so this is the "own implementation" branch its PLANNED list named: there is deliberately NO
   * second reopen anywhere in the kernel. Rules, all of them machine facts:
   *   · only a CLOSED box may be reopened, and a reason is required (an unexplained reopen is unauditable);
   *   · `vmu.ballot.reopenFloor` (0 = no floor) is read and DECIDES: a ruling with fewer valid votes than the
   *     floor is refused BY NAME with the current count and the floor;
   *   · the prior ruling is preserved in `reopenHistory` (append-only) before anything is cleared, so the
   *     record can never lose what was decided.
   */
  const reopen = (a) => {
    const args = a || {}
    const box = boxes.get(String(args.boxId || ''))
    if (!box) return deny('VMU_NOT_FOUND', '找不到票箱 ' + String(args.boxId || ''), '先 open() 取 id')
    const reason = String(args.reason || '').trim()
    if (!reason) return deny('VMU_REASON_REQUIRED', 'reopen 需要 reason（为什么重开）', '给理由：无理由的重开不可审计')
    if (box.state !== 'closed') {
      return deny('VMU_STATE', '只有已裁定的票箱可以重开（state=' + box.state + '）',
        '先 close() 出一个结论，再 reopen()；未裁定的箱子本来就还在收票')
    }
    const c = cfg()
    const enforced = []
    const floor = c.reopenFloor
    const valid = box.votes.size
    if (floor > 0) {
      mark(enforced, 'vmu.ballot.reopenFloor')
      if (valid < floor) {
        return deny('VMU_BALLOT_MIN_VOTES_NOT_MET',
          '重开门槛未达：有效票 ' + valid + ' < ' + floor + '（vmu.ballot.reopenFloor）',
          '门槛读作"这一轮至少有多少有效票才值得重开"；继续收票，或把 vmu.ballot.reopenFloor 调低', enforced)
      }
    }
    box.reopenHistory.push({ at: box.closedAt, outcome: box.priorResult ? box.priorResult.outcome : null,
      round: box.priorResult ? box.priorResult.round : box.round, tally: box.priorResult ? box.priorResult.tally : null,
      valid, reason, by: String(args.by || '') })
    box.votes = new Map()
    box.abstain = new Map()
    box.absent = []
    box.recused = []
    box.state = 'open'
    box.closedAt = 0
    box.priorResult = null
    box.reopenCount = Number(box.reopenCount || 0) + 1
    box.reopenedAt = clock()
    emit('ballot/reopen', { boxId: box.id, count: box.reopenCount })
    return { ok: true, boxId: box.id, reopened: true, reopenCount: box.reopenCount, floor,
      enforced: enforced.slice(), enforcedScope: ENFORCED_SCOPE }
  }

  /**
   * F28 — the bounded fallback for an OPEN board: settle it by NAME once the declared bound has passed, and let
   * that fallback be revoked with a reason. Nothing settles silently: before the bound `lapse()` refuses with the
   * current/limit pair, and the lapse record carries `{name, why, at, revocable}`. Votes cast so far are KEPT
   * (the outcome stays `null` = not-established) and revoking returns the board to `open`, so the fallback is a
   * decision about the ROUND, never a rewrite of the ballots.
   */
  const lapseDue = (a) => {
    const args = a || {}
    const box = boxes.get(String(args.boxId || ''))
    if (!box) return deny('VMU_NOT_FOUND', '找不到票箱 ' + String(args.boxId || ''), '先 open() 取 id')
    const now = args.at === undefined || args.at === null ? clock() : args.at
    const elapsed = now - box.at
    const enforced = openMaxMs > 0 ? ['openMaxMs (constructor-declared)'] : []
    if (openMaxMs <= 0) return { ok: true, due: false, name: LAPSE_NAME, boxId: box.id, reason: 'no bound is declared (openMaxMs=0 ⇒ zero mechanism)', enforced }
    if (box.state !== 'open') return { ok: true, due: false, name: LAPSE_NAME, boxId: box.id, reason: 'the board is ' + box.state, elapsedMs: elapsed, limitMs: openMaxMs, enforced }
    if (elapsed <= openMaxMs) return { ok: true, due: false, name: LAPSE_NAME, boxId: box.id, elapsedMs: elapsed, limitMs: openMaxMs, enforced }
    return { ok: true, due: true, name: LAPSE_NAME, boxId: box.id, at: now, revocable: true,
      why: 'the board stayed open past its declared bound: ' + elapsed + ' / ' + openMaxMs + ' ms',
      elapsedMs: elapsed, limitMs: openMaxMs, enforced }
  }
  const lapse = (a) => {
    const args = a || {}
    const d = lapseDue(args)
    if (d.ok === false) return d
    if (!d.due) return Object.assign(deny('VMU_STATE', 'the bounded fallback is NOT due: ' + String(d.reason || (d.elapsedMs + ' / ' + d.limitMs + ' ms')),
      'keep collecting, close() it explicitly, or declare openMaxMs > 0 on the constructor', d.enforced), { due: false })
    const box = boxes.get(String(args.boxId))
    if (box.lapse && !box.lapse.revokedAt) return { ok: true, deduped: true, boxId: box.id, lapse: Object.assign({}, box.lapse) }
    const rec = { name: d.name, why: d.why, at: d.at, revocable: true, elapsedMs: d.elapsedMs, limitMs: d.limitMs,
      by: args.by === undefined || args.by === null ? null : String(args.by), revokedAt: 0, revokedBy: null, revokeReason: null }
    box.lapse = rec
    box.state = 'lapsed'
    emit('ballot/lapse', { boxId: box.id, name: rec.name, limitMs: rec.limitMs, elapsedMs: rec.elapsedMs })
    return { ok: true, boxId: box.id, lapse: Object.assign({}, rec), settlement: 'lapsed-by-declared-bound',
      outcome: null, votes: box.votes.size, enforced: d.enforced.slice(), enforcedScope: ENFORCED_SCOPE }
  }
  const revokeLapse = (a) => {
    const args = a || {}
    const box = boxes.get(String(args.boxId || ''))
    if (!box) return deny('VMU_NOT_FOUND', '找不到票箱 ' + String(args.boxId || ''), '先 open() 取 id')
    if (!box.lapse) return deny('VMU_STATE', 'this board has no lapse to revoke', 'lapse() first', [])
    if (box.lapse.revocable !== true) return deny('VMU_NOT_PERMITTED', 'this lapse was declared NOT revocable', 'a non-revocable fallback is final', [])
    const reason = String(args.reason || '').trim()
    if (!reason) return deny('VMU_REASON_REQUIRED', 'revoking a bounded fallback needs a reason', 'say why the board may continue: an unexplained revocation is unauditable', [])
    if (box.lapse.revokedAt) return { ok: true, deduped: true, boxId: box.id, lapse: Object.assign({}, box.lapse) }
    box.lapse.revokedAt = args.at === undefined || args.at === null ? clock() : args.at
    box.lapse.revokedBy = args.by === undefined || args.by === null ? null : String(args.by)
    box.lapse.revokeReason = reason
    box.state = 'open'
    emit('ballot/lapse-revoked', { boxId: box.id, name: box.lapse.name, by: box.lapse.revokedBy })
    return { ok: true, boxId: box.id, lapse: Object.assign({}, box.lapse), enforced: [], enforcedScope: ENFORCED_SCOPE }
  }

  const status = (a) => {
    const box = a && a.boxId ? boxes.get(String(a.boxId)) : null
    const c = cfg()
    if (a && a.boxId) {
      if (!box) return deny('VMU_NOT_FOUND', '找不到票箱', '先 open()')
      return { ok: true, boxId: box.id, round: box.round, sealed: box.sealed, state: box.state, reopenCount: Number(box.reopenCount || 0), votes: box.votes.size, abstain: box.abstain.size, absent: box.absent.length,
        // ★★★ PER-OPTION COUNTS, NOT JUST A TOTAL. Measured on a full live run: a motion stayed `seconded` with `tally for:0` even
        // though the ballots had been cast, because the only read available here was `votes: box.votes.size` - a TOTAL that cannot
        // tell "for" from "against". Per-option counts existed only in close()'s tally, so an OPEN box could not answer the question
        // the meeting needs to ask (kernel/meetings.js counts for/against from the motion's own `mo.votes`, which stays empty
        // because the votes live here). `byChoice` is a direct aggregate over `box.votes` - no new state, nothing inferred.
        // ★ Secrecy does NOT hide these numbers: a sealed box still COUNTED, it only withholds the detail of who chose what (close()
        // does exactly that - `detail: null` while `tally` remains). So the totals are safe to expose at any state.
        byChoice: (() => {
          const acc = {}
          for (const choice of box.votes.values()) acc[String(choice)] = (acc[String(choice)] || 0) + 1
          return acc
        })(),
        // F28: the fallback state is observable state, not an inference from a missing board.
        openMaxMs, lapse: box.lapse ? Object.assign({}, box.lapse) : null, droppedAudit,
        // ★ R7: THE RULE'S FLOOR must be askable on a PASSING ballot, not only inside a refusal. The rule reads
        // 「表决人数下限 = min(用户设置数, 院士+常驻研究员数)」; the implementation computed that number only while
        // throwing `VMU_BALLOT_MIN_VOTES_NOT_MET`, so a ballot that cleared the floor could not report WHICH floor it
        // cleared — the reading was missing exactly when it was needed (the live run's `tally` showed
        // `{decisive:0, eligible:2}` and nothing else). `ruleFloor` is derived from the box's own eligible list and
        // the declared setting; nothing is inferred from votes.
        ruleFloor: floorReading(box, c),
        // G7 self-report (Round 9): "no durable log is bound ⇒ this commit is IN-PROCESS ONLY" must be READABLE
        // here, never inferred (mirrors `ballot.status().gate.durable`).
        durableLog: { bound: !!(o.durableQueue && o.durableQueue.durable === true) } }
    }
    return { ok: true, boxes: boxes.size, droppedAudit, refusals: Object.fromEntries(refusals), partition: partition(), method: c.method, tieRule: c.tieRule, rules: [...boxes.values()].map((b) => ({ id: b.id, state: b.state, rules: b.rules || null, rulesDeclared: b.rulesDeclared === true })), secrecy: c.secrecy, durableLog: { bound: !!(o.durableQueue && o.durableQueue.durable === true) } }
  }

  /**
   * PERSISTENCE SEAM v1 (kernel/resume.js interface). The boxes hold Maps (`votes`, `abstain`) that plain JSON
   * would flatten to `{}` in silence, so they are serialised through a Map/Set-aware replacer and revived as
   * Maps. The 26 declared `vmu.ballot.*` values are NOT snapshotted (they come from settings/pack and are
   * re-resolved on restore, so an old declaration cannot overwrite newer configuration).
   */
  const snapshot = () => {
    const ser = (v) => JSON.stringify(v, (k, val) => {
      if (val instanceof Map) return { __map: [...val.entries()] }
      if (val instanceof Set) return { __set: [...val.values()] }
      return val
    })
    const maxId = [...boxes.keys()].reduce((mx, id) => Math.max(mx, Number(String(id).replace(/[^0-9]/g, '')) || 0), 0)
    return { apiVersion: 1, face: 'ballotbox', v: 1, at: clock(), data: { boxes: ser(boxes) },
      counters: { ballotbox: Math.max(seq, maxId) },
      skipped: [{ what: 'policy', why: 'the declared vmu.ballot.* values come from settings/pack and are re-resolved on restore' },
        { what: 'bus', why: 'the injected bus is re-bound by the host, never serialised' }] }
  }

  /** Hydrate a `snapshot()`. Merge-safe while empty, idempotent on the same snapshot, else named conflict. */
  const restore = (snap) => {
    if (!snap || typeof snap !== 'object') return { ok: false, restored: false, code: RESUME_CODE.snapshotIncomplete, message: 'no snapshot to restore', missing: ['snapshot'] }
    if (snap.face !== 'ballotbox') return { ok: false, restored: false, code: RESUME_CODE.snapshotVersion, message: 'not a ballotbox snapshot (face=' + String(snap.face) + ')' }
    if (Number(snap.v) !== 1) return { ok: false, restored: false, code: RESUME_CODE.snapshotVersion, message: 'unsupported snapshot version ' + String(snap.v) }
    const d = snap.data
    const missing = ['boxes'].filter((k) => !d || d[k] === undefined)
    if (missing.length) return { ok: false, restored: false, code: RESUME_CODE.snapshotIncomplete, message: 'snapshot is missing ' + missing.join(', '), missing }
    if (boxes.size > 0) {
      const same = JSON.stringify(d) === JSON.stringify(snapshot().data)
      if (!same) return { ok: false, restored: false, code: RESUME_CODE.restoreConflict,
        message: 'this ballot box already holds ' + boxes.size + ' live box(es): refusing to half-overwrite them',
        hint: 'restore into a fresh instance, or restore the snapshot matching the live state' }
    }
    const revived = JSON.parse(String(d.boxes || '[]'), (k, val) => {
      if (val && typeof val === 'object') {
        if (Array.isArray(val.__map)) return new Map(val.__map)
        if (Array.isArray(val.__set)) return new Set(val.__set)
      }
      return val
    })
    boxes.clear()
    for (const [k, v] of revived) boxes.set(String(k), v)
    const fromSnap = Number((snap.counters && snap.counters.ballotbox) || 0)
    const maxId = [...boxes.keys()].reduce((mx, id) => Math.max(mx, Number(String(id).replace(/[^0-9]/g, '')) || 0), 0)
    seq = Math.max(seq, fromSnap, maxId)
    return { ok: true, restored: true, restored_items: ['boxes'], counters: { ballotbox: seq }, skipped: (snap.skipped || []).slice(), boxes: boxes.size }
  }

  return { open, cast, markAbsent, close, reopen, lapseDue, lapse, revokeLapse, status, keysUsed, partition, config: cfg, refusals: () => Object.fromEntries(refusals), snapshot, restore }
}

export default createBallotBox

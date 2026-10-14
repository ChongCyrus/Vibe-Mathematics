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
  ['vmu.ballot.reopenFloor', '★ **轮 190 实测更正** ✗✓：原句写「票箱层面的重开已由 `ballot.js` 的 `reopen()` 承载」✓ —— '
    + '**这只对【原语】成立** ✓（`ballot.js` 确有 `reopen(reason)` ✓：只允许 `tallied` 重开 ✓、旧结论进历史 ✓；运行时证据＝`tests/vmu-ballot.test.mjs` L97-100 ✓）。'
    + '★ **但本面【不调用那个原语】** ✗：`ballotbox.js` 只从 `ballot.js` 导入 `instantRunoffTally` ✓，'
    + '**本面自己没有 `reopen()`** ✗（`reopen` 一词在本文件里只出现在键名与本条理由里 ✓）。'
    + '⇒ ★★ **因此本键现在【不能接线】** ✗：把 `reopenFloor` 注入原语没用 ✓ —— **本面从不调用它** ✓；'
    + '若为了接线而给本面**另写一套 reopen**，那就是**第二份重开实现** ✗ —— 与本项目「零机制／避免第二份实现」的纪律相反 ✓✓。'
    + '**复活条件（已改正 ✓）**：① 本面先有 `reopen()`（**委托原语** ✓ 或**自有** ✓，两者择一，**不许并存** ✗）；'
    + '② 届时在 `reopen()` 里**先读本键**、**在清空票之前**具名拒 ✓ —— 复用**已登记码** `VMU_BALLOT_MIN_VOTES_NOT_MET` ✓（`docs/03` §8 ✓，语义正是「成立门槛未达」、**须给当前与门槛** ✓）；'
    + '③ 0（默认）**仍交给 pack 的 `reconsiderFloor`** ✓（**不成为第二意见** ✓）。'],
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
  const clock = typeof o.clock === 'function' ? o.clock : () => 0
  const log = typeof o.log === 'function' ? o.log : () => {}
  const emit = (ev) => { try { if (o.bus && typeof o.bus.emit === 'function') o.bus.emit(ev) } catch (e) { /* 广播不改结果 */ } }

  const refusals = new Map()
  const bumpRefusal = (code) => { refusals.set(code, (refusals.get(code) || 0) + 1) }
  const ENFORCED_SCOPE = 'evaluated-so-far'
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
    const box = { id, question, options, at: clock(), round: 1, votes: new Map(), abstain: new Map(), absent: [], recused: [], sealed: c.secrecy, tieUsed: '', rounds: 0, enforced }
    boxes.set(id, box)
    emit({ type: 'ballot.open', id })
    return { ok: true, boxId: id, round: box.round, sealed: box.sealed, enforced, enforcedScope: ENFORCED_SCOPE }
  }

  const cast = (a) => {
    const args = a || {}
    const box = boxes.get(String(args.boxId || ''))
    if (!box) return deny('VMU_NOT_FOUND', '找不到票箱 ' + String(args.boxId || ''), '先 open() 取 id')
    const by = String(args.by || '').trim()
    if (!by) return deny('VMU_CONFLICT', 'cast 需要 by（投票人）', 'by 必填')
    if (box.votes.has(by) || box.abstain.has(by)) return deny('VMU_CONFLICT', '重复投票被拒：' + by, '一人一票；改票需先撤回（本面未实现 ✗）')
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
    if (list) {
      const off = list.filter((x) => box.options.indexOf(x) === -1)
      if (off.length) return deny('VMU_CONFLICT', '清单里有不在票面上的选项：' + off.join('、'), '可选：' + box.options.join('、'))
    } else if (box.options.indexOf(choice) === -1) return deny('VMU_CONFLICT', '选项不在票面上：' + choice, '可选：' + box.options.join('、'))
    if (c.recuseDeclareMode === 'required' && args.recuse !== undefined) mark(enforced, 'vmu.ballot.recuseDeclareMode')
    if (args.recuse === true) {
      mark(enforced, 'vmu.ballot.recusePublic')
      box.recused.push(by)
      if (c.recusePublic) emit({ type: 'ballot.recuse', boxId: box.id, by })
      return { ok: true, boxId: box.id, kind: 'recused', sealed: box.sealed, enforced, enforcedScope: ENFORCED_SCOPE }
    }
    // ROUND 158: a ranked ballot is stored AS A LIST. The scalar path keeps its exact old meaning (`String(choice)`),
    // so no existing method changes behaviour; stringifying a list would have destroyed the ranking that IRV needs.
    box.votes.set(by, list ? list.slice() : String(choice))
    if (c.proxyMode === 'on' && args.proxyFor) { mark(enforced, 'vmu.ballot.proxyMode'); if (c.proxyChainMaxDepth > 0) mark(enforced, 'vmu.ballot.proxyChainMaxDepth') }
    if (c.quadraticCreditCap > 0 && Number(args.credits) > c.quadraticCreditCap) { return deny('VMU_CONFLICT', 'credits 超上限 ' + c.quadraticCreditCap + '（`vmu.ballot.quadraticCreditCap`）', '调小 credits', ['vmu.ballot.quadraticCreditCap']) }
    return { ok: true, boxId: box.id, kind: 'vote', sealed: box.sealed, enforced, enforcedScope: ENFORCED_SCOPE }
  }

  /** 缺席/未到（**与弃权分开计数** ✗✓）。 */
  const markAbsent = (a) => {
    const box = boxes.get(String((a && a.boxId) || ''))
    if (!box) return deny('VMU_NOT_FOUND', '找不到票箱', '先 open()')
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
    const floor = Math.max(c.minVotes, Math.ceil((box.options.length ? 1 : 0) * 0 + c.minVotesRatio * (box.votes.size + box.abstain.size + box.absent.length)))
    // **法定人数不足 ⇒ 具名拒（不是"未通过"）** ✗✓
    if (floorBase < floor) {
      // **点名是哪把尺子不够** ✗✓（`minVotes` 还是 `minVotesRatio`）—— 求值点即列举点 ✓
      const ratioFloor = Math.ceil(c.minVotesRatio * (box.votes.size + box.abstain.size + box.absent.length))
      const boundBy = c.minVotes >= ratioFloor ? 'vmu.ballot.minVotes' : 'vmu.ballot.minVotesRatio'
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
        emit({ type: 'ballot.runoff', boxId: box.id, round: box.round })
        return { ok: true, boxId: box.id, round: 2, runoff: ranked.slice(0, c.runoffTopN).map((x) => x.option), tally: { cast: castN, votes: castN, abstain: 0, absent: box.absent.length, floor, floorBase }, enforced, enforcedScope: ENFORCED_SCOPE, note: '进入第二轮 ✓' }
      }
      if (c.method === 'runoff' && box.round >= c.roundsMax) {
        mark(enforced, 'vmu.ballot.roundsMax')
        return Object.assign(deny('VMU_BALLOT_ROUNDS_EXHAUSTED', '轮次用尽（roundsMax=' + c.roundsMax + '）仍平票', '人工裁定或调大 roundsMax'), { enforced })
      }
      if (c.tieRule === 'unresolved') {
        box.tieUsed = 'unresolved'
        return Object.assign(deny('VMU_BALLOT_TIE_UNRESOLVED', '平票且 tieRule=unresolved ⇒ 不判定（自曝规则：unresolved ✓）', '设 tieRule=chair|random|runoff，或人工裁定'), { tally: { cast: castN, votes: box.votes.size, abstain: box.abstain.size, absent: box.absent.length, floor, floorBase }, enforced, tieUsed: 'unresolved' })
      }
      box.tieUsed = c.tieRule
      outcome = (c.tieRule === 'chair') ? (String(a && a.chairChoice || '') || top.option) : top.option
    }
    // 第二轮（runoffTopN）
    if (c.method === 'runoff' && c.runoffTopN >= 2 && box.round < c.roundsMax && tie) {
      mark(enforced, 'vmu.ballot.runoffTopN'); mark(enforced, 'vmu.ballot.roundsMax')
      box.round += 1
      box.votes = new Map(); box.abstain = new Map()
      emit({ type: 'ballot.runoff', boxId: box.id, round: box.round })
      return { ok: true, boxId: box.id, round: 2, runoff: ranked.slice(0, c.runoffTopN).map((x) => x.option), tally: { cast: castN, votes: castN, abstain: 0, absent: box.absent.length, floor, floorBase }, enforced, enforcedScope: ENFORCED_SCOPE, note: '进入第二轮 ✓' }
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

  const status = (a) => {
    const box = a && a.boxId ? boxes.get(String(a.boxId)) : null
    const c = cfg()
    if (a && a.boxId) {
      if (!box) return deny('VMU_NOT_FOUND', '找不到票箱', '先 open()')
      return { ok: true, boxId: box.id, round: box.round, sealed: box.sealed, votes: box.votes.size, abstain: box.abstain.size, absent: box.absent.length, droppedAudit }
    }
    return { ok: true, boxes: boxes.size, droppedAudit, refusals: Object.fromEntries(refusals), partition: partition(), method: c.method, tieRule: c.tieRule, secrecy: c.secrecy }
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

  return { open, cast, markAbsent, close, status, keysUsed, partition, config: cfg, refusals: () => Object.fromEntries(refusals), snapshot, restore }
}

export default createBallotBox

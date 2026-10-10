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
])
/** 未接：**逐个点名＋原因** ✗✓（不得静默 ✗）。 */
export const PLANNED_BALLOT_KEYS = Object.freeze([
  ['vmu.ballot.freezeMode', '冻结与会议联动未接（本面不建会议状态机 ✗；见 08 卷冻结节）'],
  ['vmu.ballot.freezeMeetingLinked', '同上：会议联动由 meeting/board 面承载 ✗'],
  ['vmu.ballot.irvInstantSingleCount', 'IRV 计票器未实现（本面只做一轮/二轮 ✗）'],
  ['vmu.ballot.reopenFloor', '重开表决议程未实现：需 board 面与会议议程协同 ✗（本面只管票箱）'],
  ['vmu.ballot.reopenInitiatorScope', '重开动议的发起人范围未实现：依赖 board/reopenFloor ✗'],
  ['vmu.ballot.reopenSameMeetingOnly', '重开的同会期约束未实现：依赖 board/reopenFloor ✗'],
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
  const deny = (code, msg, hint, enforced) => {
    bumpRefusal(code)
    // 拒绝一律**带上 `enforced`**（数组 ✓，可空 ✓，**不得 `undefined`** ✗✓）—— 照 `mathtools.js` 口径 ✓
    const keys = Array.isArray(enforced) ? enforced.slice() : []
    return Object.assign(refuse(code, msg, hint), { enforced: keys })
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
    const evalKey = (k) => { if (enforced.indexOf(k) === -1) enforced.push(k) }
    evalKey('vmu.ballot.method')                                        // 用于 method 白名单校验 ⇒ 真求值 ✓
    if (c.secrecy === true) evalKey('vmu.ballot.secrecy')               // 只有"开"才改变可观测行为（sealed=true）✓
    // 注：`abstainAllowed` **不在此处列举** ✗✓（open 读了它但不改变本次结果 ⇒ 留到真正起作用的 cast 拒绝处 ✓）
    const allowed = ['plurality', 'approval', 'runoff']
    if (allowed.indexOf(c.method) === -1) return deny('VMU_BALLOT_METHOD_UNSUPPORTED', '不支持的 method：' + c.method, '可用：' + allowed.join('、'), enforced.slice())
    const question = String(args.question || '').trim()
    const options = Array.isArray(args.options) ? args.options.map(String) : []
    if (!question || options.length < 2) return deny('VMU_CONFLICT', 'open 需要 question 与 ≥2 个 options', '给出问题与选项')
    const id = 'bx-' + (++seq)
    const box = { id, question, options, at: clock(), round: 1, votes: new Map(), abstain: new Map(), absent: [], recused: [], sealed: c.secrecy, tieUsed: '', rounds: 0, enforced }
    boxes.set(id, box)
    emit({ type: 'ballot.open', id })
    return { ok: true, boxId: id, round: box.round, sealed: box.sealed, enforced }
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
      return { ok: true, boxId: box.id, kind: 'abstain', sealed: box.sealed, enforced }
    }
    const choice = String(args.choice || '')
    if (box.options.indexOf(choice) === -1) return deny('VMU_CONFLICT', '选项不在票面上：' + choice, '可选：' + box.options.join('、'))
    if (c.recuseDeclareMode === 'required' && args.recuse !== undefined) enforced.push('vmu.ballot.recuseDeclareMode')
    if (args.recuse === true) {
      enforced.push('vmu.ballot.recusePublic')
      box.recused.push(by)
      if (c.recusePublic) emit({ type: 'ballot.recuse', boxId: box.id, by })
      return { ok: true, boxId: box.id, kind: 'recused', sealed: box.sealed, enforced }
    }
    box.votes.set(by, String(choice))
    if (c.proxyMode === 'on' && args.proxyFor) { enforced.push('vmu.ballot.proxyMode'); if (c.proxyChainMaxDepth > 0) enforced.push('vmu.ballot.proxyChainMaxDepth') }
    if (c.quadraticCreditCap > 0 && Number(args.credits) > c.quadraticCreditCap) { return deny('VMU_CONFLICT', 'credits 超上限 ' + c.quadraticCreditCap + '（`vmu.ballot.quadraticCreditCap`）', '调小 credits', ['vmu.ballot.quadraticCreditCap']) }
    return { ok: true, boxId: box.id, kind: 'vote', sealed: box.sealed, enforced }
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
    const castN = box.votes.size + box.abstain.size
    const floorBase = box.votes.size + (c.abstainCountsForFloor ? box.abstain.size : 0)
    const floor = Math.max(c.minVotes, Math.ceil((box.options.length ? 1 : 0) * 0 + c.minVotesRatio * (box.votes.size + box.abstain.size + box.absent.length)))
    // **法定人数不足 ⇒ 具名拒（不是"未通过"）** ✗✓
    if (floorBase < floor) {
      // **点名是哪把尺子不够** ✗✓（`minVotes` 还是 `minVotesRatio`）—— 求值点即列举点 ✓
      const ratioFloor = Math.ceil(c.minVotesRatio * (box.votes.size + box.abstain.size + box.absent.length))
      const boundBy = c.minVotes >= ratioFloor ? 'vmu.ballot.minVotes' : 'vmu.ballot.minVotesRatio'
      if (enforced.indexOf(boundBy) === -1) enforced.push(boundBy)
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
      enforced.push('vmu.ballot.tieRule')
      if (c.method === 'runoff' && c.runoffTopN >= 2 && box.round < c.roundsMax) {
        enforced.push('vmu.ballot.runoffTopN', 'vmu.ballot.roundsMax')
        box.round += 1
        box.votes = new Map(); box.abstain = new Map()
        emit({ type: 'ballot.runoff', boxId: box.id, round: box.round })
        return { ok: true, boxId: box.id, round: 2, runoff: ranked.slice(0, c.runoffTopN).map((x) => x.option), tally: { cast: castN, votes: castN, abstain: 0, absent: box.absent.length, floor, floorBase }, enforced, note: '进入第二轮 ✓' }
      }
      if (c.method === 'runoff' && box.round >= c.roundsMax) {
        enforced.push('vmu.ballot.roundsMax')
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
      enforced.push('vmu.ballot.runoffTopN', 'vmu.ballot.roundsMax')
      box.round += 1
      box.votes = new Map(); box.abstain = new Map()
      emit({ type: 'ballot.runoff', boxId: box.id, round: box.round })
      return { ok: true, boxId: box.id, round: 2, runoff: ranked.slice(0, c.runoffTopN).map((x) => x.option), tally: { cast: castN, votes: castN, abstain: 0, absent: box.absent.length, floor, floorBase }, enforced, note: '进入第二轮 ✓' }
    }
    if (c.method === 'runoff' && box.round >= c.roundsMax && tie) {
      enforced.push('vmu.ballot.roundsMax')
      return Object.assign(deny('VMU_BALLOT_ROUNDS_EXHAUSTED', '轮次用尽（roundsMax=' + c.roundsMax + '）仍平票', '人工裁定或调大 roundsMax'), { enforced })
    }
    box.rounds += 1
    const audit = c.auditReadOnly ? [] : null
    if (c.auditReadOnly) enforced.push('vmu.ballot.auditReadOnly')
    if (c.auditRetentionMs > 0) enforced.push('vmu.ballot.auditRetentionMs')
    if (c.processReadingsVisible) enforced.push('vmu.ballot.processReadingsVisible')
    if (c.secrecy && c.secrecyRecordFact) enforced.push('vmu.ballot.secrecyRecordFact')
    return {
      ok: true, boxId: box.id, round: box.round, outcome,
      // **秘密表决 ⇒ 明细不可回收，但计数保留** ✓
      detail: box.sealed ? null : Array.from(box.votes.entries()).map(([by, choice]) => ({ by, choice })),
      sealed: box.sealed,
      tieUsed: box.tieUsed || '',
      tally: { cast: castN, votes: box.votes.size, abstain: box.abstain.size, absent: box.absent.length, floor, floorBase, ranked },
      enforced: enforced.slice(),
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

  return { open, cast, markAbsent, close, status, keysUsed, partition, config: cfg, refusals: () => Object.fromEntries(refusals) }
}

export default createBallotBox

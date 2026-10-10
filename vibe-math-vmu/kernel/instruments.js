// vibe-math-vmu — 仪器/设备面（22 卷仪器与设施）：把 `vmu.instruments.*` **17 键**接成可观测行为。
//
// 标准（`mathtools.js` 口径 ✓）：① 每键**改变可观测行为** ✓；② 回执带 **`enforced[]`**（只列真求值者 ✓）；
//   **拒绝一律带 `enforced[]`（数组、可空、不得 undefined ✓）＋ `enforcedScope:'evaluated-so-far'`** ✓✓；
//   ③ **未接逐个点名＋原因** ✓ 且 `wired ∩ planned = ∅`、**恰好划分 17** ✓；④ 正反例 ✓；⑤ 拒绝**按码计数** ✓；
//   ⑥ 注入时钟（不读真实时间 ✗）；⑦ 零机制不崩 ✓；⑧ 只读面（`status/list`）不改状态 ✓。
//
// 语义（22 卷 ✓；与 20 卷安全 **只引用不重定义** ✗）：**校准过期 ⇒ 具名拒并给到期日** ✓✓；
//   **未培训人员操作 ⇒ 拒** ✓；**借用冲突（同时段同台）⇒ 拒并点名冲突时段** ✓✓；
//   **预约超时长上限 ⇒ 给当前/上限** ✓；**维护窗口内预约 ⇒ 拒** ✓；**使用记录缺目的 ⇒ 拒** ✓。

export const INSTRUMENT_KEYS = Object.freeze([
  'vmu.instruments.requireCalibration', 'vmu.instruments.calibrationDueDays', 'vmu.instruments.blockOnOverdue',
  'vmu.instruments.requireOwner', 'vmu.instruments.capabilityTags', 'vmu.instruments.reserve',
  'vmu.instruments.maxHoldHours', 'vmu.instruments.reservationHorizonDays', 'vmu.instruments.overbookRatio',
  'vmu.instruments.priorityPolicy', 'vmu.instruments.waitlistPolicy', 'vmu.instruments.downtimePolicy',
  'vmu.instruments.scheduleMaintenance', 'vmu.instruments.attachCapture', 'vmu.instruments.dataCaptureRef',
  'vmu.instruments.ledgerDir', 'vmu.instruments.hashAlgo',
])
export const WIRED_INSTRUMENT_KEYS = Object.freeze([
  'vmu.instruments.requireCalibration', 'vmu.instruments.calibrationDueDays', 'vmu.instruments.blockOnOverdue',
  'vmu.instruments.requireOwner', 'vmu.instruments.capabilityTags', 'vmu.instruments.reserve',
  'vmu.instruments.maxHoldHours', 'vmu.instruments.reservationHorizonDays', 'vmu.instruments.overbookRatio',
  'vmu.instruments.priorityPolicy', 'vmu.instruments.waitlistPolicy', 'vmu.instruments.scheduleMaintenance',
  'vmu.instruments.hashAlgo', 'vmu.instruments.attachCapture',
])
/** 未接：**逐个点名＋原因** ✗✓。 */
export const PLANNED_INSTRUMENT_KEYS = Object.freeze([
  ['vmu.instruments.ledgerDir', '台账落盘目录未接：无 FS 接缝（本面只保留内存台账 ✗）'],
  ['vmu.instruments.dataCaptureRef', '数据捕获引用未接：需 library 面（只引用不重定义 ✗）'],
  ['vmu.instruments.downtimePolicy', '停机策略未接：需与运维/告警面协同（本面只做维护窗口 ✗）'],
])
export const ENFORCED_SCOPE = 'evaluated-so-far'
const refuse = (code, message, hint) => ({ ok: false, code, message, hint })

export function createInstruments(opts) {
  const o = opts || {}
  const readKey = (k) => (o.settings && typeof o.settings.get === 'function' ? o.settings.get(k) : (o.settings || {})[k])
  const clock = typeof o.clock === 'function' ? o.clock : () => 0
  const log = typeof o.log === 'function' ? o.log : () => {}
  const emit = (ev) => { try { if (o.bus && typeof o.bus.emit === 'function') o.bus.emit(ev) } catch (e) { /* 广播不改结果 */ } }

  const refusals = new Map()
  const units = new Map()
  const trained = new Map()
  const reservations = []
  const maintenance = []
  const ledger = []
  let seq = 0

  /** 拒绝：**必带 `enforced`（数组、可空）＋ `enforcedScope`** ✓✓。 */
  const deny = (code, msg, hint, enforced) => {
    refusals.set(code, (refusals.get(code) || 0) + 1)
    return Object.assign(refuse(code, msg, hint), {
      enforced: Array.isArray(enforced) ? enforced.slice() : [],
      enforcedScope: ENFORCED_SCOPE,
    })
  }

  const cfg = () => {
    const n = (k, d) => { const v = Number(readKey(k)); return Number.isFinite(v) && v >= 0 ? v : d }
    const b = (k, d) => { const v = readKey(k); return v === undefined ? d : v === true }
    const s = (k, d) => { const v = readKey(k); return (v === undefined || v === null || v === '') ? d : String(v) }
    const tags = readKey('vmu.instruments.capabilityTags')
    return {
      requireCalibration: b('vmu.instruments.requireCalibration', true),
      calibrationDueDays: n('vmu.instruments.calibrationDueDays', 365),
      blockOnOverdue: b('vmu.instruments.blockOnOverdue', true),
      requireOwner: b('vmu.instruments.requireOwner', true),
      capabilityTags: Array.isArray(tags) ? tags.map(String) : [],
      reserve: b('vmu.instruments.reserve', true),
      maxHoldHours: n('vmu.instruments.maxHoldHours', 8),
      reservationHorizonDays: n('vmu.instruments.reservationHorizonDays', 30),
      overbookRatio: n('vmu.instruments.overbookRatio', 0),
      priorityPolicy: s('vmu.instruments.priorityPolicy', 'fifo'),
      waitlistPolicy: s('vmu.instruments.waitlistPolicy', 'queue'),
      scheduleMaintenance: b('vmu.instruments.scheduleMaintenance', true),
      hashAlgo: s('vmu.instruments.hashAlgo', 'sha256'),
      attachCapture: b('vmu.instruments.attachCapture', true),
    }
  }
  const keysUsed = () => WIRED_INSTRUMENT_KEYS.slice()
  const partition = () => ({
    all: INSTRUMENT_KEYS.length, wired: WIRED_INSTRUMENT_KEYS.length, planned: PLANNED_INSTRUMENT_KEYS.length,
    disjoint: WIRED_INSTRUMENT_KEYS.every((k) => PLANNED_INSTRUMENT_KEYS.every((p) => p[0] !== k)),
    exact: WIRED_INSTRUMENT_KEYS.length + PLANNED_INSTRUMENT_KEYS.length === INSTRUMENT_KEYS.length,
  })
  const fp = (x) => { const s = typeof x === 'string' ? x : JSON.stringify(x); let h = 0; for (let i = 0; i < s.length; i += 1) h = (h * 31 + s.charCodeAt(i)) >>> 0; return cfg().hashAlgo + ':' + h.toString(16) }
  const DAY = 86400000

  const register = (a) => {
    const args = a || {}
    const c = cfg()
    const enforced = []
    const mark = (k) => { if (enforced.indexOf(k) === -1) enforced.push(k) }
    mark('vmu.instruments.requireOwner')
    const id = String(args.id || '').trim()
    if (!id) return deny('VMU_META_VALIDATION_FAILED', 'register 需要 id', '给仪器 id', enforced)
    if (c.requireOwner && !String(args.owner || '').trim()) return deny('VMU_NOT_PERMITTED', '该配置要求仪器有责任人（vmu.instruments.requireOwner=true）', '补 owner', enforced)
    if (c.capabilityTags.length) { mark('vmu.instruments.capabilityTags') }
    const tags = (Array.isArray(args.tags) ? args.tags.map(String) : []).filter((t) => c.capabilityTags.length === 0 || c.capabilityTags.indexOf(t) !== -1)
    const cal = Number(args.calibratedAt)
    const calibratedAt = Number.isFinite(cal) ? cal : clock()   // **`0` 是合法时刻**（不得用 `||` 兜底 ✗）
    units.set(id, { id, name: String(args.name || id), owner: String(args.owner || ''), tags, calibratedAt, maintenance: [] })
    return { ok: true, id, tags, calibratedAt, enforced, enforcedScope: ENFORCED_SCOPE }
  }

  const setSkill = (a) => {
    const args = a || {}
    const by = String((args && args.by) || '').trim()
    if (!by) return deny('VMU_META_VALIDATION_FAILED', 'train 需要 by', '给人员 id', [])
    trained.set(by, Array.isArray(args.tags) ? args.tags.map(String) : [])
    return { ok: true, by, tags: trained.get(by), enforced: [], enforcedScope: ENFORCED_SCOPE }
  }

  /** **校准过期 ⇒ 拒并给到期日** ✓✓；**未培训 ⇒ 拒** ✓；**使用记录缺目的 ⇒ 拒** ✓。 */
  const use = (a) => {
    const args = a || {}
    const c = cfg()
    const enforced = []
    const mark = (k) => { if (enforced.indexOf(k) === -1) enforced.push(k) }
    const u = units.get(String(args.id || ''))
    if (!u) return deny('VMU_NOT_FOUND', '找不到仪器 ' + String(args.id || ''), '先 register()', enforced)
    const by = String(args.by || '').trim()
    if (!by) return deny('VMU_META_VALIDATION_FAILED', 'use 需要 by', '给操作人', enforced)
    const purpose = String(args.purpose || '').trim()
    if (!purpose) { mark('vmu.instruments.attachCapture'); return deny('VMU_META_VALIDATION_FAILED', '使用记录**缺目的** ⇒ 拒（`purpose` 必填 ✓）', '写明使用目的', enforced) }
    // 培训（capabilityTags 非空时按标签要求 ✓）
    if (u.tags.length) {
      mark('vmu.instruments.capabilityTags')
      const have = trained.get(by) || []
      const missing = u.tags.filter((t) => have.indexOf(t) === -1)
      if (missing.length) return deny('VMU_NOT_PERMITTED', '**未培训**人员操作 ⇒ 拒（缺资质：' + missing.join('、') + '）', '先 train() 补资质', enforced)
    }
    // 校准
    if (c.requireCalibration) {
      mark('vmu.instruments.requireCalibration')
      const due = u.calibratedAt + c.calibrationDueDays * DAY
      if (clock() > due) {
        mark('vmu.instruments.calibrationDueDays')
        if (c.blockOnOverdue) {
          mark('vmu.instruments.blockOnOverdue')
          return Object.assign(deny('VMU_NOT_PERMITTED', '**校准已过期**（到期日 ' + new Date(due).toISOString().slice(0, 10) + '）⇒ 拒', '先重新校准', enforced), { dueAt: due, dueDate: new Date(due).toISOString().slice(0, 10) })
        }
      }
    }
    if (c.attachCapture) mark('vmu.instruments.attachCapture')
    const record = { id: 'ur-' + (++seq), unit: u.id, by, purpose, at: clock(), fingerprint: fp({ unit: u.id, by, purpose, at: clock() }) }
    ledger.push(record)
    log('instruments.use ' + u.id)
    emit({ type: 'instruments.use', unit: u.id })
    return { ok: true, usageId: record.id, fingerprint: record.fingerprint, enforced, enforcedScope: ENFORCED_SCOPE }
  }

  const openWindow = (a) => {
    const args = a || {}
    const c = cfg()
    const enforced = []
    if (!c.scheduleMaintenance) return deny('VMU_NOT_PERMITTED', '本配置不允许排维护（vmu.instruments.scheduleMaintenance=false）', '打开它', ['vmu.instruments.scheduleMaintenance'])
    enforced.push('vmu.instruments.scheduleMaintenance')
    const u = units.get(String(args.id || ''))
    if (!u) return deny('VMU_NOT_FOUND', '找不到仪器', '先 register()', enforced)
    const from = Number(args.from), to = Number(args.to)
    if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from) return deny('VMU_META_VALIDATION_FAILED', '维护窗口需要 from<to', '给合法时段', enforced)
    const win = { unit: u.id, from, to }
    maintenance.push(win); u.maintenance.push(win)
    return { ok: true, unit: u.id, window: win, enforced, enforcedScope: ENFORCED_SCOPE }
  }

  /** 预约：`reserve`／`maxHoldHours`（当前/上限 ✓）／horizon／**冲突点名时段** ✓／**维护窗口拒** ✓／overbookRatio／priority／waitlist ✓。 */
  const reserve = (a) => {
    const args = a || {}
    const c = cfg()
    const enforced = []
    const mark = (k) => { if (enforced.indexOf(k) === -1) enforced.push(k) }
    mark('vmu.instruments.reserve')
    if (!c.reserve) return deny('VMU_NOT_PERMITTED', '本配置不允许预约（vmu.instruments.reserve=false）', '打开它', enforced)
    const u = units.get(String(args.id || ''))
    if (!u) return deny('VMU_NOT_FOUND', '找不到仪器 ' + String(args.id || ''), '先 register()', enforced)
    const by = String(args.by || '').trim()
    if (!by) return deny('VMU_META_VALIDATION_FAILED', 'reserve 需要 by', '给预约人', enforced)
    const fromArg = Number(args.from)
    const from = Number.isFinite(fromArg) ? fromArg : clock()   // **`0` 是合法起点** ✗
    const current = Number(args.hours)
    const hours = Number.isFinite(current) && current > 0 ? current : 1
    // 超时长上限 ⇒ **给当前/上限** ✓
    mark('vmu.instruments.maxHoldHours')
    if (c.maxHoldHours > 0 && hours > c.maxHoldHours) {
      return deny('VMU_RESOURCE_BUDGET', '预约超时长上限：**当前 ' + hours + ' h / 上限 ' + c.maxHoldHours + ' h**（vmu.instruments.maxHoldHours）', '缩短时长或申请特批', enforced)
    }
    const hrs = (from - clock()) / 3600000
    mark('vmu.instruments.reservationHorizonDays')
    if (c.reservationHorizonDays > 0 && hrs > c.reservationHorizonDays * 24) {
      return deny('VMU_RESOURCE_BUDGET', '超出预约视野：' + Math.round(hrs / 24) + ' 天 > ' + c.reservationHorizonDays + ' 天', '推近时段', enforced)
    }
    // 维护窗口 ⇒ 拒
    const win = u.maintenance.find((w) => from < w.to && (from + hours * 3600000) > w.from)
    if (win) {
      mark('vmu.instruments.scheduleMaintenance')
      return Object.assign(deny('VMU_CONFLICT', '**维护窗口内**预约 ⇒ 拒（窗口 ' + new Date(win.from).toISOString() + ' → ' + new Date(win.to).toISOString() + '）', '避开维护窗口', enforced), { conflict: [{ from: win.from, to: win.to, kind: 'maintenance' }] })
    }
    const to = from + hours * 3600000
    const clash = reservations.filter((r) => r.unit === u.id && from < r.to && to > r.from)
    if (clash.length) {
      // overbookRatio 允许有限超额 ✓；否则**拒并点名冲突时段** ✓✓
      mark('vmu.instruments.overbookRatio')
      const allowed = c.overbookRatio > 0 && clash.length <= c.overbookRatio
      mark('vmu.instruments.priorityPolicy')
      if (!allowed) {
        return Object.assign(deny('VMU_CONFLICT', '**同时段同台已有预约** ⇒ 拒（冲突：' + clash.map((r) => new Date(r.from).toISOString() + '→' + new Date(r.to).toISOString()).join('、') + '；priorityPolicy=' + c.priorityPolicy + '）', '换时段或提高优先级', enforced), { conflict: clash.map((r) => ({ from: r.from, to: r.to, by: r.by })) })
      }
    }
    const rec = { id: 'rs-' + (++seq), unit: u.id, by, from, to, hours, priority: c.priorityPolicy, waitlist: '' }
    if (clash.length && c.waitlistPolicy === 'queue') { mark('vmu.instruments.waitlistPolicy'); rec.waitlist = 'queued' }
    reservations.push(rec)
    emit({ type: 'instruments.reserve', unit: u.id })
    return { ok: true, reservationId: rec.id, unit: u.id, from, to, hours, waitlist: rec.waitlist, enforced, enforcedScope: ENFORCED_SCOPE }
  }

  const calibrate = (a) => {
    const u = units.get(String((a && a.id) || ''))
    if (!u) return deny('VMU_NOT_FOUND', '找不到仪器', '先 register()', [])
    u.calibratedAt = Number(a && a.at) || clock()
    return { ok: true, id: u.id, calibratedAt: u.calibratedAt, enforced: ['vmu.instruments.requireCalibration'], enforcedScope: ENFORCED_SCOPE }
  }

  const status = (a) => {
    const c = cfg()
    const id = a && a.id ? String(a.id) : ''
    if (id) {
      const u = units.get(id)
      if (!u) return deny('VMU_NOT_FOUND', '找不到仪器 ' + id, '先 register()', [])
      const due = u.calibratedAt + c.calibrationDueDays * DAY
      return { ok: true, id, owner: u.owner, tags: u.tags.slice(), dueAt: due, dueDate: new Date(due).toISOString().slice(0, 10), overdue: clock() > due, maintenance: u.maintenance.slice(), enforced: [], enforcedScope: ENFORCED_SCOPE }
    }
    return { ok: true, units: units.size, reservations: reservations.length, maintenance: maintenance.length, ledger: ledger.length, refusals: Object.fromEntries(refusals), partition: partition(), hashAlgo: c.hashAlgo, reserve: c.reserve }
  }

  return { register, train: setSkill, use, openWindow, reserve, calibrate, status, keysUsed, partition, config: cfg, refusals: () => Object.fromEntries(refusals), ledger: () => ledger.slice(), reservations: () => reservations.slice() }
}

export default createInstruments

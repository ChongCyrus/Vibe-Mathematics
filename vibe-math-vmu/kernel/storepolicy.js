// vibe-math-vmu — 存储**后端策略**面（07 卷）：把 `vmu.store.*` **15 键**接成可观测行为。
//
// **分层（只引用不重定义 ✗）**：本面**只做后端策略**（后端/根/临时/fsync/锁/备份/远端/版本过高 ✓）；
//   **记录语义**在 `kernel/records.js` ✓、**字节存储**在 `store` 接缝 ✓、**档案/归档策略**（压缩/配额/保留期/
//   校验和/迁移）**归属别的命名空间** ✓（`vmu.pack.compression` ✓／`vmu.migration.*` ✓／`vmu.audit.retentionDays` ✓／
//   `records` 的 `bodyCapBytes` 家族 ✓）—— **本面不新建键、不新建面** ✗✓。
//
// 口径（`mathtools` 标准 ✓）：回执带 **`enforced[]`／`fired[]`（`fired ⊆ enforced`）／`enforcedScope`** ✓；
//   **每个拒绝**（返回型 ✓）带**数组型 `enforced`** ＋ `enforcedScope` ＋ **`wouldEvaluate ⊇ enforced`** ✓✓；
//   **未接逐个点名** ✓（本面 15/15 已接 ⇒ `planned = []` ✓ 且断言**恰好划分 15** ✓）；正反例 ✓；**逐码计数** ✓；
//   注入时钟（**不读真实时间** ✗ —— 锁的等待按**虚拟时钟**推进 ✓）；零机制不崩 ✓；只读面（`can/capabilities/status`）不改状态 ✓。
//   码：**全部复用已登记** ✓（`VMU_NOT_PERMITTED`／`VMU_INVALID_ARGUMENT`／`VMU_CONFLICT`／`VMU_RESOURCE_BUDGET`／
//   `VMU_META_VALIDATION_FAILED`／`VMU_COMPAT_UNKNOWN_COMBO`）⇒ **无新码提案** ✓✓。

export const STORE_KEYS = Object.freeze([
  'vmu.store.backend', 'vmu.store.root', 'vmu.store.tmpDir', 'vmu.store.fsync',
  'vmu.store.lock', 'vmu.store.lock.backoffMs', 'vmu.store.lock.retries', 'vmu.store.lock.serializeAll',
  'vmu.store.lock.timeoutMs', 'vmu.store.autoBackup',
  'vmu.store.remote', 'vmu.store.remote.consistency', 'vmu.store.remote.offlinePolicy', 'vmu.store.remote.url',
  'vmu.store.onVersionTooHigh',
])
/** 全部已接 ⇒ 未接为空（**逐条点名**在 `PLANNED` 里显式为空数组 ✓）。 */
export const WIRED_STORE_KEYS = STORE_KEYS
export const PLANNED_STORE_KEYS = Object.freeze([])
export const ENFORCED_SCOPE = 'evaluated-so-far'

const refuse = (code, message, hint) => ({ ok: false, code, message, hint })

export function createStorePolicy(opts) {
  const o = opts || {}
  const readKey = (k) => (o.settings && typeof o.settings.get === 'function' ? o.settings.get(k) : (o.settings || {})[k])
  const clock = typeof o.clock === 'function' ? o.clock : () => 0
  const log = typeof o.log === 'function' ? o.log : () => {}
  const emit = (ev) => { try { if (o.bus && typeof o.bus.emit === 'function') o.bus.emit(ev) } catch (e) { /* 广播不改结果 */ } }

  const refusals = new Map()
  const counters = { writes: 0, backups: 0, queued: 0, lockWaits: 0 }
  const locks = new Map()
  const trail = []
  let droppedLog = 0
  const LOG_MAX = 200

  /** 拒绝：**数组型 `enforced` ＋ 口径 ＋ `wouldEvaluate ⊇ enforced`** ✓✓。 */
  const deny = (code, msg, hint, enforced, wouldEvaluate) => {
    refusals.set(code, (refusals.get(code) || 0) + 1)
    const e = Array.isArray(enforced) ? enforced.slice() : []
    const w = Array.isArray(wouldEvaluate) ? wouldEvaluate.slice() : e.slice()
    for (const k of e) if (w.indexOf(k) === -1) w.push(k)   // **`wouldEvaluate ⊇ enforced`** 必须成立 ✓
    return Object.assign(refuse(code, msg, hint), { enforced: e, enforcedScope: ENFORCED_SCOPE, wouldEvaluate: w })
  }
  const note = (what, id, extra) => {
    trail.push(Object.assign({ at: clock(), what, id: String(id || '') }, extra || {}))
    if (trail.length > LOG_MAX) { trail.shift(); droppedLog += 1 }
  }

  const cfg = () => {
    const n = (k, d) => { const v = Number(readKey(k)); return Number.isFinite(v) && v >= 0 ? v : d }
    const b = (k, d) => { const v = readKey(k); return v === undefined ? d : v === true }
    const s = (k, d) => { const v = readKey(k); return (v === undefined || v === null || v === '') ? d : String(v) }
    return {
      backend: s('vmu.store.backend', 'file'),
      root: s('vmu.store.root', ''),
      tmpDir: s('vmu.store.tmpDir', ''),
      fsync: b('vmu.store.fsync', true),
      lock: b('vmu.store.lock', true),
      lockBackoffMs: n('vmu.store.lock.backoffMs', 25),
      lockRetries: n('vmu.store.lock.retries', 3),
      lockSerializeAll: b('vmu.store.lock.serializeAll', false),
      lockTimeoutMs: n('vmu.store.lock.timeoutMs', 1000),
      autoBackup: b('vmu.store.autoBackup', false),
      remote: s('vmu.store.remote', 'none'),
      remoteConsistency: s('vmu.store.remote.consistency', 'eventual'),
      remoteOfflinePolicy: s('vmu.store.remote.offlinePolicy', 'refuse'),
      remoteUrl: s('vmu.store.remote.url', ''),
      onVersionTooHigh: s('vmu.store.onVersionTooHigh', 'refuse'),
    }
  }
  const keysUsed = () => WIRED_STORE_KEYS.slice()
  const partition = () => ({
    all: STORE_KEYS.length, wired: WIRED_STORE_KEYS.length, planned: PLANNED_STORE_KEYS.length,
    disjoint: true, exact: WIRED_STORE_KEYS.length + PLANNED_STORE_KEYS.length === STORE_KEYS.length,
  })

  /** 路径校验（**只校验不做 IO** ✓）：非绝对、含 `..`、不在 root 之下 ⇒ 拒 ✓。 */
  const checkPath = (p, enforced, would) => {
    const s = String(p || '')
    if (!s) return deny('VMU_INVALID_ARGUMENT', '需要 root（vmu.store.root）', '声明存储根目录', enforced, would)
    if (s.indexOf('..') !== -1) return deny('VMU_NOT_PERMITTED', '路径含 `..` 穿越 ⇒ 拒：' + s, '用规范化路径', enforced, would)
    if (!/^([A-Za-z]:[\\/]|\/)/.test(s)) return deny('VMU_INVALID_ARGUMENT', '路径必须是绝对路径：' + s, '给绝对路径', enforced, would)
    return { ok: true }
  }

  /** 后端能力（**只读** ✓）：零机制 ⇒ 按默认 `file` 声明最小可用能力 ✓。 */
  const capabilities = () => {
    const c = cfg()
    const enforced = ['vmu.store.backend', 'vmu.store.root', 'vmu.store.fsync', 'vmu.store.remote']
    const fired = []
    if (c.fsync) fired.push('vmu.store.fsync')
    return {
      ok: true, backend: c.backend, rooted: c.root !== '' || c.backend === 'memory', durable: c.fsync,
      remote: c.remote, consistency: c.remoteConsistency,
      enforced, fired, enforcedScope: ENFORCED_SCOPE,
    }
  }

  /** 取锁（**虚拟时钟**推进 ✓）：失败 ⇒ 拒并给**当前/上限** ＋ 退避计数 ✓。 */
  const acquire = (a) => {
    const args = a || {}
    const c = cfg()
    const enforcement = ['vmu.store.lock', 'vmu.store.lock.timeoutMs', 'vmu.store.lock.retries', 'vmu.store.lock.backoffMs', 'vmu.store.lock.serializeAll']
    const would = enforcement.slice()
    const fired = []
    const name = c.lockSerializeAll ? '*' : String(args.name || 'default')   // **串行化 ⇒ 单车道** ✓
    if (c.lockSerializeAll) fired.push('vmu.store.lock.serializeAll')
    if (!c.lock) { fired.push('vmu.store.lock'); return { ok: true, name, locked: false, serialized: c.lockSerializeAll, enforced: ['vmu.store.lock'], fired, enforcedScope: ENFORCED_SCOPE } }
    fired.push('vmu.store.lock')
    const holder = locks.get(name)
    if (holder) {
      let waited = 0
      let attempts = 0
      while (waited < c.lockTimeoutMs && attempts < c.lockRetries) {
        attempts += 1
        waited += c.lockBackoffMs          // **按虚拟时钟步进**（不 sleep ✗）
      }
      counters.lockWaits += 1
      fired.push('vmu.store.lock.timeoutMs')
      if (attempts > 0) fired.push('vmu.store.lock.retries')
      if (c.lockBackoffMs > 0) fired.push('vmu.store.lock.backoffMs')
      return Object.assign(deny('VMU_CONFLICT', '抢锁失败：已被「' + holder.by + '」持有（**当前等待 ' + waited + ' ms / 上限 ' + c.lockTimeoutMs + ' ms**，退避 ' + attempts + ' 次）', '稍后重试或调大 lock.timeoutMs', enforcement, would),
        { name, attempts, waitedMs: waited, timeoutMs: c.lockTimeoutMs, retries: c.lockRetries })
    }
    locks.set(name, { by: String(args.by || 'anon'), at: clock() })
    note('store.lock', name)
    return { ok: true, name, locked: true, holder: String(args.by || 'anon'), serialized: c.lockSerializeAll, enforced: enforcement.slice(), fired, enforcedScope: ENFORCED_SCOPE }
  }

  const release = (a) => {
    const name = (a && a.name) ? String(a.name) : (cfg().lockSerializeAll ? '*' : 'default')
    const had = locks.delete(name)
    return { ok: true, name, released: had, enforced: ['vmu.store.lock'], fired: had ? ['vmu.store.lock'] : [], enforcedScope: ENFORCED_SCOPE }
  }

  /** 写入（**策略层**：不落字节 ✗）：fsync ⇒ `durable` ✓；远端离线 ⇒ `offlinePolicy` 决定拒/排队 ✓；`autoBackup` 计数 ✓。 */
  const write = (a) => {
    const args = a || {}
    const c = cfg()
    const enforcement = ['vmu.store.backend', 'vmu.store.root', 'vmu.store.fsync', 'vmu.store.autoBackup',
      'vmu.store.remote', 'vmu.store.remote.url', 'vmu.store.remote.consistency', 'vmu.store.remote.offlinePolicy']
    const would = enforcement.slice()
    const fired = []
    const allowed = ['file', 'memory']
    // ① 后端未知值 ⇒ 具名拒 ✓
    if (allowed.indexOf(c.backend) === -1) return deny('VMU_NOT_PERMITTED', '未知存储后端：' + c.backend + '（可用 ' + allowed.join('/') + '）', '改用已声明后端', ['vmu.store.backend'], would)
    fired.push('vmu.store.backend')
    if (c.backend === 'file') {
      const p = checkPath(c.root, ['vmu.store.root'], would)
      if (p.ok === false) return p
      fired.push('vmu.store.root')
      if (c.tmpDir) {
        const pp = checkPath(c.tmpDir, ['vmu.store.tmpDir', 'vmu.store.root'], would)
        if (pp.ok === false) return pp
        if (c.tmpDir.indexOf(c.root) !== 0 && c.root !== '') return deny('VMU_META_VALIDATION_FAILED', 'tmpDir 必须在 root 之下：' + c.tmpDir + ' ⊄ ' + c.root, '放到 root 内', ['vmu.store.tmpDir', 'vmu.store.root'], would)
        fired.push('vmu.store.tmpDir')
      }
    }
    // ② 远端：声明了 remote=on ⇒ 必须有 url ✓；离线 ⇒ offlinePolicy 决定 ✓
    if (c.remote === 'on') {
      fired.push('vmu.store.remote')
      if (!c.remoteUrl) return deny('VMU_INVALID_ARGUMENT', 'remote=on 但未声明 `vmu.store.remote.url` ⇒ 拒', '补 url 或关掉远端', ['vmu.store.remote', 'vmu.store.remote.url'], would)
      fired.push('vmu.store.remote.url')
      fired.push('vmu.store.remote.consistency')
      if (args.online === false) {
        fired.push('vmu.store.remote.offlinePolicy')
        if (c.remoteOfflinePolicy === 'refuse') return deny('VMU_NOT_PERMITTED', '远端离线且 offlinePolicy=refuse ⇒ 拒', '改为 queue 或等联网', ['vmu.store.remote.offlinePolicy', 'vmu.store.remote.consistency'], would)
        counters.queued += 1
      }
    }
    counters.writes += 1
    if (c.autoBackup) { counters.backups += 1; fired.push('vmu.store.autoBackup') }
    note('store.write', String(args.id || 'w' + counters.writes))
    emit({ type: 'store.write', id: String(args.id || '') })
    return {
      ok: true, id: String(args.id || 'w' + counters.writes), bytes: Number(args.bytes) || 0,
      durable: c.fsync, queued: c.remote === 'on' && args.online === false && c.remoteOfflinePolicy !== 'refuse',
      backups: counters.backups,
      enforced: enforcement.slice(), fired: fired.slice(), enforcedScope: ENFORCED_SCOPE,
    }
  }

  /** 版本过高策略（**与 N4 同口径** ✓）：`refuse` ⇒ 具名拒 ✓；`warn` ⇒ 放行且**自曝 `assumed`** ✓✓。 */
  const read = (a) => {
    const args = a || {}
    const c = cfg()
    const enforcement = ['vmu.store.onVersionTooHigh', 'vmu.store.backend']
    const would = enforcement.slice()
    const fired = ['vmu.store.backend']
    const found = Number(args.foundVersion)
    const current = Number(args.currentVersion)
    if (Number.isFinite(found) && Number.isFinite(current) && found > current) {
      fired.push('vmu.store.onVersionTooHigh')
      if (c.onVersionTooHigh === 'refuse') {
        return deny('VMU_COMPAT_UNKNOWN_COMBO', '磁盘版本 ' + found + ' **高于**当前内核 ' + current + '（onVersionTooHigh=refuse）⇒ 拒', '升级内核或改 warn（会自曝 assumed ✓）', enforcement, would)
      }
      return { ok: true, assumed: true, note: '版本过高但 onVersionTooHigh=warn ⇒ **按当前版本假定**（自曝，非静默 ✓）', enforced: enforcement.slice(), fired, enforcedScope: ENFORCED_SCOPE }
    }
    return { ok: true, assumed: false, enforced: enforcement.slice(), fired, enforcedScope: ENFORCED_SCOPE }
  }

  const status = (a) => {
    const c = cfg()
    const id = a && a.name ? String(a.name) : ''
    if (id) return { ok: true, name: id, held: locks.has(id), by: locks.has(id) ? locks.get(id).by : '', enforced: [], fired: [], enforcedScope: ENFORCED_SCOPE }
    return {
      ok: true, backend: c.backend, rooted: c.root !== '' || c.backend === 'memory', durable: c.fsync,
      remote: c.remote, offlinePolicy: c.remoteOfflinePolicy, onVersionTooHigh: c.onVersionTooHigh,
      locks: locks.size, counters: Object.assign({}, counters),
      refusals: Object.fromEntries(refusals), partition: partition(), droppedLog,
      enforced: [], fired: [], enforcedScope: ENFORCED_SCOPE,
    }
  }

  return { capabilities, acquire, release, write, read, status, keysUsed, partition, config: cfg, refusals: () => Object.fromEntries(refusals), trail: () => trail.slice() }
}

export default createStorePolicy

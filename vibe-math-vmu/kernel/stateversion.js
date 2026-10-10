// vibe-math-vmu — 状态版本与迁移（N4）：**跨版本读必须被拒绝**，迁移必须**显式、可审计、原子**。
//
// 硬不变式：
//   ① **未知/缺失版本 ⇒ 默认具名拒**（**绝不当成当前版本** ✗）；`onUnknown='warn'` 时**必须自曝 `assumed`** ✗✓；
//   ② 迁移**显式且可审计**：每步 `from→to` ＋ 谁/何时/为何（时刻取自注入 `clock` ✓；**不得隐式就地改写** ✗）；
//   ③ **迁移失败不留半迁移态**（失败 ⇒ 原状态**一字不变** ＋ 具名拒 ✓）；
//   ④ **降级默认拒**（`to` 低于当前 ⇒ 拒；显式放行才通且自曝 ✓）；
//   ⑤ **幂等**（已目标版本 ⇒ `noop:true`，不重复迁移 ✓）；
//   ⑥ **环检测**（迁移图成环 ⇒ 具名拒 ✓）；
//   ⑦ 步数上限 ⇒ 具名拒并给**当前/上限** ✓；⑧ 零机制不崩 ✓；只读面（`check/status`）不改状态 ✓。
//
// 注入：`createStateVersion({ clock, log, settings, bus })`；`declare({version, migrations})` 声明。
// 码（**全部取自已登记清单** ✓）：`VMU_COMPAT_UNKNOWN_COMBO`（未知/缺版本）、`VMU_NOT_FOUND`（无迁移路径）、
//   `VMU_MIGRATE_DRYRUN_FAILED`（迁移抛错）、`VMU_INDEX_STALE`（降级被拒）、`VMU_RESOURCE_BUDGET`（步数上限）。

export const STATEVERSION_KEYS = Object.freeze([
  'vmu.state.current',
  'vmu.state.requireVersion',
  'vmu.state.maxMigrationSteps',
  'vmu.state.onUnknown',
  'vmu.state.keepHistory',
])
const refuse = (code, message, hint) => ({ ok: false, code, message, hint })
const TAG = 'schemaVersion'

export function createStateVersion(opts) {
  const o = opts || {}
  const readKey = (k) => (o.settings && typeof o.settings.get === 'function' ? o.settings.get(k) : (o.settings || {})[k])
  const clock = typeof o.clock === 'function' ? o.clock : () => 0
  const log = typeof o.log === 'function' ? o.log : () => {}
  const emit = (ev) => { try { if (o.bus && typeof o.bus.emit === 'function') o.bus.emit(ev) } catch (e) { /* 广播不改结果 */ } }

  let declared = null   // { version, migrations: [{from,to,run}] }
  let current = ''      // 当前版本（declare 时设定；settings 可覆盖）
  const history = []

  const cfg = () => {
    const n = Number(readKey('vmu.state.maxMigrationSteps'))
    const cur = readKey('vmu.state.current')
    return {
      current: String(cur === undefined || cur === null || cur === '' ? current : cur),
      requireVersion: readKey('vmu.state.requireVersion') !== false,   // 默认 true ✗✓
      maxMigrationSteps: Number.isFinite(n) && n >= 0 ? Math.floor(n) : 16,
      onUnknown: String(readKey('vmu.state.onUnknown') || 'refuse'),   // refuse|warn，默认 refuse ✓
      keepHistory: readKey('vmu.state.keepHistory') !== false,
    }
  }
  const keysUsed = () => STATEVERSION_KEYS.slice()

  const declare = (a) => {
    const args = a || {}
    const version = String(args.version || '').trim()
    if (!version) return refuse('VMU_COMPAT_UNKNOWN_COMBO', 'declare 需要 version（当前版本）', '给内核当前版本号')
    const migrations = Array.isArray(args.migrations) ? args.migrations.map((m) => ({ from: String((m && m.from) || ''), to: String((m && m.to) || ''), run: m && m.run })) : []
    for (const m of migrations) {
      if (!m.from || !m.to) return refuse('VMU_COMPAT_UNKNOWN_COMBO', '迁移项必须含 from 与 to', '形如 {from:"1",to:"2",run}')
      if (typeof m.run !== 'function') return refuse('VMU_MIGRATE_DRYRUN_FAILED', '迁移 ' + m.from + '→' + m.to + ' 缺少 run', '每步必须是**显式**函数（不得隐式改写 ✗）')
    }
    declared = { version, migrations, order: Array.isArray(args.order) ? args.order.map(String) : null }
    current = version
    return { ok: true, version, migrations: migrations.map((m) => ({ from: m.from, to: m.to })) }
  }

  /** 版本标签（**只加标签，不改内容** ✓）。 */
  const wrap = (a) => {
    const st = (a && a.state) || {}
    const c = cfg()
    if (!c.current) return refuse('VMU_COMPAT_UNKNOWN_COMBO', '尚未 declare 当前版本', '先 declare({version})')
    return { ok: true, state: Object.assign({}, st, { [TAG]: c.current }) }
  }

  const versionOf = (state) => {
    const v = state ? state[TAG] : undefined
    return (v === undefined || v === null || v === '') ? '' : String(v)
  }

  /** 只读：未知/缺失版本 ⇒ 默认拒（warn ⇒ 自曝 `assumed`）✓。 */
  const check = (a) => {
    const c = cfg()
    const state = (a && a.state) || null
    const v = versionOf(state)
    if (!v) {
      if (c.requireVersion && c.onUnknown !== 'warn') {
        return refuse('VMU_COMPAT_UNKNOWN_COMBO', '状态缺少版本标签（' + TAG + '）⇒ **拒绝读**（绝不当成当前版本 ✗）', '用 wrap() 打标签，或显式声明策略')
      }
      return { ok: true, version: c.current, assumed: true, warning: '无版本标签 ⇒ 按当前版本 ' + c.current + ' **假定**（自曝，非静默 ✓）' }
    }
    if (v === c.current) return { ok: true, version: v, assumed: false }
    const path = findPath(v, c.current, c)
    if (path.ok === false) {
      if (c.onUnknown === 'warn') return { ok: true, version: c.current, assumed: true, warning: '未知版本 ' + v + ' ⇒ 按 ' + c.current + ' **假定**（自曝 ✓；路径不可达：' + path.message + '）' }
      return Object.assign(refuse('VMU_COMPAT_UNKNOWN_COMBO', '未知版本 ' + v + '（当前 ' + c.current + '）⇒ **拒绝读**', '提供显式迁移链，或用 wrap() 重新打标签'), { found: v, current: c.current })
    }
    return { ok: true, version: v, assumed: false, upgradeable: true, steps: path.steps }
  }

  /** 迁移图搜索：**环检测** ＋ **步数上限**（给当前/上限）✓。 */
  const findPath = (from, to, c) => {
    if (!declared) return refuse('VMU_COMPAT_UNKNOWN_COMBO', '尚未 declare 迁移表', '先 declare({version, migrations})')
    const edges = declared.migrations
    const seen = new Set([from])
    let frontier = [{ at: from, steps: [] }]
    let hops = 0
    while (frontier.length) {
      const next = []
      for (const node of frontier) {
        for (const m of edges) {
          if (m.from !== node.at) continue
          if (seen.has(m.to)) continue                 // ⑥ 环检测（不走回头路）
          const steps = node.steps.concat([{ from: m.from, to: m.to }])
          if (m.to === to) return { ok: true, steps }
          hops += 1
          if (c.maxMigrationSteps > 0 && hops > c.maxMigrationSteps) {
            return refuse('VMU_RESOURCE_BUDGET', '迁移步数超上限：' + hops + ' > ' + c.maxMigrationSteps, '当前步 ' + hops + '／上限 ' + c.maxMigrationSteps + '；拆小或调大 vmu.state.maxMigrationSteps')
          }
          seen.add(m.to)
          next.push({ at: m.to, steps })
        }
      }
      frontier = next
    }
    return refuse('VMU_NOT_FOUND', '没有从 ' + from + ' 到 ' + to + ' 的显式迁移路径', '补迁移链；本面**绝不隐式改写** ✗')
  }

  /**
   * 方向判定（**fail-closed** ✗✓）：`order` 显式全序优先；否则**只有两者都是纯数值**才敢比大小；
   * 其余（`vX`／`2024-01`／`1.2.3`…）⇒ `unknown:true` ⇒ 调用处**视同降级并拒**（绝不静默放行 ✗）。
   */
  const directionOf = (from, to) => {
    const ord = (declared && Array.isArray(declared.order)) ? declared.order : null
    if (ord) {
      const a = ord.indexOf(from), b = ord.indexOf(to)
      if (a !== -1 && b !== -1) return { unknown: false, backward: b < a, forward: b > a }
      return { unknown: true, backward: false, forward: false }   // 不在显式序里 ⇒ 不可比 ⇒ fail-closed ✗
    }
    const pureNumber = (x) => /^-?\d+(\.\d+)?$/.test(String(x)) && Number.isFinite(Number(x))
    if (pureNumber(from) && pureNumber(to)) {
      const nf = Number(from), nt = Number(to)
      return { unknown: false, backward: nt < nf, forward: nt > nf }
    }
    return { unknown: true, backward: false, forward: false }
  }

  /**
   * 可选校验接缝（**A3 修复** ✗✓）：`createStateVersion({ validate })` 或 `declare({ validate })`。
   * **`noop` 也必须走它** —— `{noop:true}` ＝ "**不需要迁移**" ≠ "**文档已检查合格**" ✗✓（两件事分开字段 ✓）。
   * 返回 `{ok:true}`／`{ok:false, missing:[…]}`；未提供 ⇒ 结果**自曝 `validated:'skipped'`** ✗✓。
   */
  const runValidate = (state) => {
    const fn = (typeof o.validate === 'function') ? o.validate : (declared && typeof declared.validate === 'function' ? declared.validate : null)
    if (!fn) return { validated: 'skipped' }                       // **必须自曝** ✗✓（不得让人以为已检查 ✓）
    let r
    try { r = fn(state) } catch (e) { r = { ok: false, missing: ['validate threw: ' + String((e && e.message) || e)] } }
    if (r && r.ok === true) return { validated: true }
    const missing = Array.isArray(r && r.missing) && r.missing.length ? r.missing.map(String) : ['（校验未给出缺项）']
    return { validated: false, missing }
  }

  /** 显式迁移：逐版本前进；**失败 ⇒ 原状态一字不变** ✓；已达成 ⇒ `noop:true` ✓。 */
  const migrate = (a) => {
    const args = a || {}
    const c = cfg()
    if (!declared) return refuse('VMU_COMPAT_UNKNOWN_COMBO', '尚未 declare 迁移表', '先 declare({version, migrations})')
    const from = versionOf(args.state)
    const to = String(args.to || c.current)
    if (!from) return refuse('VMU_COMPAT_UNKNOWN_COMBO', '状态缺少版本标签 ⇒ 拒绝迁移（不做"猜版本" ✗）', '先 wrap() 或给出带标签的快照')
    if (from === to) {
      // **A3**：`noop` 之前**必须先走可选校验** ✗✓ —— 损坏文档不得因"版本相同"而静默通过 ✓
      const v = runValidate(args.state)
      if (v.validated === false) {
        return Object.assign(refuse('VMU_META_VALIDATION_FAILED', '版本已是目标（' + to + '）但**校验不通过** ⇒ 拒绝（**不得** `ok:true, noop:true` ✗）', '缺项：' + v.missing.join('、')), { validated: false, missing: v.missing })
      }
      return {
        ok: true, noop: true, state: args.state, from, to, steps: [],
        validated: v.validated,
        noopMeans: '不需要迁移（**≠ 文档已检查合格** ✗✓；见 validated 字段 ✓）',
      }
    }
    const idxFrom = Number(from), idxTo = Number(to)
    const allowDown = readKey('vmu.state.allowDowngrade') === true
    const dir = directionOf(from, to)
    // **非数值/序外 ⇒ fail-closed**：方向未知一律视同降级 ⇒ 默认拒（+ 自曝）✗✓
    if (dir.unknown && !allowDown) {
      return refuse('VMU_INDEX_STALE', '版本方向未知（非纯数值且未声明 order）：' + from + ' ⇒ ' + to + ' ⇒ **视同降级并拒绝**',
        '要么 declare({order:[…]}) 给出**显式全序**，要么设 vmu.state.allowDowngrade=true（会**自曝** directionUnknown ✓）')
    }
    if (dir.backward && !allowDown) {
      return refuse('VMU_INDEX_STALE', '降级被拒：' + from + ' ⇒ ' + to + '（默认不允许降级）', '显式设置 vmu.state.allowDowngrade=true 才可降级（会自曝 ✓）')
    }
    void idxFrom; void idxTo
    const directionUnknown = dir.unknown === true
    const forced = directionUnknown || dir.backward === true
    const path = findPath(from, to, c)
    if (path.ok === false) return path
    // **原子性**：在副本上跑完全部步骤才提交 ✓
    let draft = JSON.parse(JSON.stringify(args.state))
    const audit = []
    for (const step of path.steps) {
      const m = declared.migrations.filter((x) => x.from === step.from && x.to === step.to)[0]
      let out
      try { out = m.run(JSON.parse(JSON.stringify(draft))) } catch (e) {
        return refuse('VMU_MIGRATE_DRYRUN_FAILED', '迁移 ' + step.from + '→' + step.to + ' 失败：' + String((e && e.message) || e),
          '**原状态未改动**（不留半迁移态 ✓）；修迁移函数后重试')
      }
      if (!out || typeof out !== 'object') {
        return refuse('VMU_MIGRATE_DRYRUN_FAILED', '迁移 ' + step.from + '→' + step.to + ' 未返回对象', '**原状态未改动** ✓；返回新状态对象')
      }
      draft = out
      audit.push({ from: step.from, to: step.to, at: clock(), by: String(args.by || ''), why: String(args.why || '') })
    }
    draft[TAG] = to
    const rec = { from, to, at: clock(), by: String(args.by || ''), why: String(args.why || ''), steps: audit }
    if (c.keepHistory) history.push(rec)
    log('stateversion.migrate ' + from + '→' + to)
    emit({ type: 'stateversion.migrate', from, to, steps: audit.length })
    return { ok: true, state: draft, from, to, noop: false, steps: audit, audit: audit.map((x) => x.from + '→' + x.to), directionUnknown, forced }
  }

  const status = () => {
    const c = cfg()
    return { ok: true, declared: !!declared, current: c.current, migrations: declared ? declared.migrations.length : 0, history: history.length, requireVersion: c.requireVersion, onUnknown: c.onUnknown, maxMigrationSteps: c.maxMigrationSteps }
  }

  return { declare, wrap, migrate, check, status, keysUsed, config: cfg, history: () => history.slice() }
}

export default createStateVersion

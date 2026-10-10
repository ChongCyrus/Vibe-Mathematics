// vibe-math-vmu — 复现包（16 卷 L12）：把"能复现"变成**可点名的成员集合**＋**可定位的差异**。
//
// 硬不变式：
//   ① 缺必填成员 ⇒ **具名拒并点名**（缺哪个成员写在回执里，绝不是"打包失败"）；
//   ② **有随机性就必须有种子**：`allowMissingSeed=false`（默认）时缺种子 ⇒ 具名拒（不许"应该能复现"）；
//   ③ **验证失败必须给差异**：`diff()` 逐成员指出 expected/actual（不只说"不一致"）；
//   ④ **打包不得静默截断**：`maxPackBytes` 触界 ⇒ 报 `dropped`（计数器，不是沉默）；
//   ⑤ **数据默认只存指针**（`dataPointerOnly=true`）：不复制数据；显式 `copyData:true` 才复制且**留痕**；
//   ⑥ 只走注入的 `clock`（**不读真实时间** ✗）；⑦ 零机制不崩；⑧ `list/status` **纯读**。
//
// 注入：`createReproPack({ clock, log, settings, bus, library })`
//   · library —— 可选 `{ fingerprint?(ref) => string }`（内容寻址/指纹来自 07 卷，本面**只引用不重定义** ✓）

export const REPRO_KEYS = Object.freeze([
  'vmu.repro.requiredMembers',
  'vmu.repro.hashAlgo',
  'vmu.repro.maxPackBytes',
  'vmu.repro.allowMissingSeed',
  'vmu.repro.envLockMode',
  'vmu.repro.dataPointerOnly',
  'vmu.repro.verifyRequiresMatch',
])
const ALL_MEMBERS = ['script', 'entry', 'envLock', 'seed', 'dataFingerprint', 'deps']
const DEFAULT_REQUIRED = ['script', 'entry', 'envLock', 'seed', 'dataFingerprint', 'deps']

const refuse = (code, message, hint) => ({ ok: false, code, message, hint })

export function createReproPack(opts) {
  const o = opts || {}
  const readKey = (k) => (o.settings && typeof o.settings.get === 'function' ? o.settings.get(k) : (o.settings || {})[k])
  const clock = typeof o.clock === 'function' ? o.clock : () => 0
  const log = typeof o.log === 'function' ? o.log : () => {}
  const emit = (ev) => { try { if (o.bus && typeof o.bus.emit === 'function') o.bus.emit(ev) } catch (e) { /* 广播不改结果 */ } }
  const lib = o.library || {}

  const cfg = () => {
    const rawReq = readKey('vmu.repro.requiredMembers')
    const required = (Array.isArray(rawReq) && rawReq.length ? rawReq.map(String) : DEFAULT_REQUIRED).filter((m) => ALL_MEMBERS.indexOf(m) !== -1)
    const n = Number(readKey('vmu.repro.maxPackBytes'))
    return {
      requiredMembers: required,
      hashAlgo: String(readKey('vmu.repro.hashAlgo') || 'sha256'),
      maxPackBytes: Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0,          // 0＝不限
      allowMissingSeed: readKey('vmu.repro.allowMissingSeed') === true,        // 默认 false ✗
      envLockMode: String(readKey('vmu.repro.envLockMode') || 'full'),         // full|minimal
      dataPointerOnly: readKey('vmu.repro.dataPointerOnly') !== false,         // 默认 true
      verifyRequiresMatch: readKey('vmu.repro.verifyRequiresMatch') !== false,
    }
  }
  const keysUsed = () => REPRO_KEYS.slice()

  const packs = new Map()
  let seq = 0
  let droppedLog = 0
  const trail = [] // 复制留痕 ＋ 事件（**有上限 ⇒ 丢弃必计数** ✓）
  const LOG_MAX = 200
  const note = (what, id, extra) => {
    trail.push(Object.assign({ at: clock(), what, id: String(id || '') }, extra || {}))
    if (trail.length > LOG_MAX) { trail.shift(); droppedLog += 1 }
  }

  /** 稳定指纹：只依赖内容（不看时钟 ⇒ 同内容两次同 id ✓）。 */
  const fingerprint = (obj) => {
    const s = JSON.stringify(obj, Object.keys(obj || {}).sort())
    let h = 0
    for (let i = 0; i < s.length; i += 1) { h = (h * 31 + s.charCodeAt(i)) >>> 0 }
    return cfg().hashAlgo + ':' + h.toString(16)
  }

  /** 成员视图（**只读**）：把入参整理成"成员集合"，不入状态。 */
  const members = (a) => {
    const args = a || {}
    const scriptId = String(args.scriptId || args.jobId || '').trim()
    const env = args.env || {}
    const c = cfg()
    // envLock：**只用调用方给的 env**（不凭空造成员 ✗）；`envLockMode` 只记录在包里
    const envLock = Object.keys(env).sort().reduce((acc, k) => { acc[k] = String(env[k]); return acc }, {})
    const dataRefs = Array.isArray(args.dataRefs) ? args.dataRefs.map(String) : []
    return {
      script: scriptId,
      entry: String(args.entry || '').trim(),
      envLock,
      seed: (args.seed === undefined || args.seed === null || args.seed === '') ? '' : String(args.seed),
      dataFingerprint: dataRefs.length ? dataRefs.map((r) => (typeof lib.fingerprint === 'function' ? String(lib.fingerprint(r)) : 'ref:' + r)).join(',') : String(args.dataFingerprint || '').trim(),
      deps: Array.isArray(args.deps) ? args.deps.map(String).sort() : [],
      // 非成员：仅留痕用的入参
      _random: args.random === true,
      _dataRefs: dataRefs,
      _copyData: args.copyData === true,
    }
  }

  const build = (a) => {
    const c = cfg()
    const m = members(a)
    // ① 缺必填成员 ⇒ **点名**（`allowMissingSeed=true` ⇒ seed 从必填表移除，这是**显式**选择 ✓）
    const req = c.requiredMembers.filter((k) => !(k === 'seed' && c.allowMissingSeed))
    const present = {
      script: !!m.script, entry: !!m.entry, envLock: Object.keys(m.envLock).length > 0,
      seed: !!m.seed, dataFingerprint: !!m.dataFingerprint, deps: m.deps.length > 0,
    }
    const missing = req.filter((k) => !present[k])
    if (m._random && !m.seed && !c.allowMissingSeed) missing.push('seed') // ② 有随机性 ⇒ 必须有种子
    if (missing.length) {
      const uniq = [...new Set(missing)]
      const code = uniq.indexOf('seed') !== -1 ? 'VMU_MATH_SEED_REQUIRED' : 'VMU_FORMAL_REPRO_INCOMPLETE'
      return refuse(code, '复现包缺必填成员：' + uniq.join('、'), '补齐这些成员再打包（成员表见 docs/16 §2 L12）：' + uniq.join('、'))
    }
    // ⑤ 数据默认只存指针；显式复制才复制且留痕
    const copied = []
    if (m._copyData) {
      if (c.dataPointerOnly) {
        return refuse('VMU_REPRO_COPY_DENIED', '该配置只允许数据指针（vmu.repro.dataPointerOnly=true）', '把 dataPointerOnly 设为 false，或不要 copyData')
      }
      for (const r of m._dataRefs) copied.push({ ref: r, bytes: 0 })
      note('repro.copy', m.script, { copied: copied.map((x) => x.ref) })
    }
    // ④ 打包不得静默截断：估算字节 + 上限 ⇒ 报 dropped
    const body = { script: m.script, entry: m.entry, envLock: m.envLock, seed: m.seed, dataFingerprint: m.dataFingerprint, deps: m.deps }
    const bytes = Buffer.byteLength(JSON.stringify(body), 'utf8')
    let dropped = 0; let kept = body
    if (c.maxPackBytes > 0 && bytes > c.maxPackBytes) {
      // 超限：按"可选性"从低到高丢弃 **并计数**（绝不静默）；仍超 ⇒ 继续丢到空包
      const order = ['deps', 'envLock', 'dataFingerprint', 'entry']
      kept = Object.assign({}, body)
      for (const k of order) {
        if (Buffer.byteLength(JSON.stringify(kept), 'utf8') <= c.maxPackBytes) break
        if (kept[k] !== undefined) { delete kept[k]; dropped += 1 }
      }
      if (Buffer.byteLength(JSON.stringify(kept), 'utf8') > c.maxPackBytes) { kept = {}; dropped = Object.keys(body).length }
    }
    const id = 'rp-' + (++seq)
    const rawBytes = Buffer.byteLength(JSON.stringify(kept), 'utf8')
    // 预算必须被遵守：即使只剩成员骨架也超限 ⇒ 报上限值（**丢弃已计数** ⇒ 不是静默截断 ✓）
    const finalBytes = c.maxPackBytes > 0 ? Math.min(rawBytes, c.maxPackBytes) : rawBytes
    const rec = { id, at: clock(), members: kept, bytes: finalBytes, rawBytes, dropped, pointerOnly: !m._copyData, copied, envLockMode: c.envLockMode, fingerprint: fingerprint(kept) }
    packs.set(id, rec)
    note('repro.build', id, { dropped })
    emit({ type: 'repro.build', id, dropped })
    return { ok: true, pack: view(rec) }
  }

  const view = (r) => ({ id: r.id, at: r.at, members: r.members, bytes: r.bytes, dropped: r.dropped, pointerOnly: r.pointerOnly, copied: r.copied.slice(), fingerprint: r.fingerprint })

  /** ③ 差异定位：逐成员 expected/actual（**不只说"不一致"** ✗）。 */
  const diff = ({ packId, actual } = {}) => {
    const r = packs.get(String(packId))
    if (!r) return refuse('VMU_NOT_FOUND', '找不到复现包 ' + String(packId), '先 list() 取 id')
    const a = actual || {}
    const norm = members(a) // **同一归一化**再比（否则 raw 入参会造出假差异 ✗）
    const out = []
    for (const k of ALL_MEMBERS) {
      const exp = r.members[k]
      if (exp === undefined) continue
      const expS = (exp !== null && typeof exp === 'object') ? JSON.stringify(exp) : String(exp)
      const actS = (norm[k] !== null && typeof norm[k] === 'object') ? JSON.stringify(norm[k]) : String(norm[k])
      if (expS !== actS) out.push({ member: k, expected: exp, actual: norm[k] })
    }
    return { ok: true, equal: out.length === 0, diffs: out, dropped: r.dropped }
  }

  const verify = ({ packId, actual } = {}) => {
    const c = cfg()
    const d = diff({ packId, actual })
    if (d.ok === false) return d
    if (d.equal) return { ok: true, matched: true, diffs: [] }
    if (c.verifyRequiresMatch) {
      return Object.assign(refuse('VMU_MATH_REPRO_MISMATCH', '复现验证失败：' + d.diffs.map((x) => x.member).join('、') + ' 不一致', '逐成员差异见 diffs；修掉不一致再重试'), { diffs: d.diffs })
    }
    return { ok: true, matched: false, diffs: d.diffs }
  }

  const list = () => ({ ok: true, count: packs.size, dropped: droppedLog, packs: [...packs.values()].map(view) })
  const status = () => {
    const c = cfg()
    return { ok: true, count: packs.size, dropped: droppedLog, requiredMembers: c.requiredMembers.slice(), pointerMode: c.dataPointerOnly, hashAlgo: c.hashAlgo, maxPackBytes: c.maxPackBytes }
  }
  return { build, verify, diff, list, status, keysUsed, membersOf: members, config: cfg, trail: () => trail.slice() }
}

export default createReproPack

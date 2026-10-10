// vibe-math-vmu — 研究生命周期机（16 卷 §1 的 L1–L24）：**声明式**阶段 ＋ **闸点委托**。
//
// 本模块**不重造**阶段机语义 ✗：阶段表由**声明**提供（`vmu.lifecycle.stages`），闸点判据**委托**给注入的
// `domaingate`／`publication` 接缝 ✓；本面只做"编号/顺序/证据/闸点"的**结构校验** ✓。
//
// 硬不变式：
//   ① 阶段与闸点必须与 L 编号一一对应：`stages()` 回显 `L<n>`；**不得自造阶段名** ✗（非 `L<n>` 的 id ⇒ 拒）；
//   ② 越级/回退 ⇒ 具名拒，并给**当前 L** 与**合法下一步** ✓；
//   ③ 闸点未过 ⇒ 拒并**点名缺哪一项** ✓；
//   ④ 每阶段必须有**准入证据**（缺 ⇒ 拒）；
//   ⑤ 无接缝 ⇒ 具名拒（**不得假装已检查** ✗）；
//   ⑥ 截断必计数（`droppedLog`／`droppedArtifacts`）；⑦ 注入时钟（不读真实时间 ✗）；
//   ⑧ 未声明阶段表 ⇒ **拒而不是默认放行** ✗✓；只读面（`stages/state/gateAt/artifacts/status`）不改状态 ✓。
//
// 注入：`createLifecycle({ clock, log, settings, bus, workflow, domaingate, publication })`

export const LIFECYCLE_KEYS = Object.freeze([
  'vmu.lifecycle.stages',
  'vmu.lifecycle.requireEvidence',
  'vmu.lifecycle.maxArtifacts',
  'vmu.lifecycle.allowBackward',
])
const LOG_MAX = 200
const refuse = (code, message, hint) => ({ ok: false, code, message, hint })

export function createLifecycle(opts) {
  const o = opts || {}
  const readKey = (k) => (o.settings && typeof o.settings.get === 'function' ? o.settings.get(k) : (o.settings || {})[k])
  const clock = typeof o.clock === 'function' ? o.clock : () => 0
  const log = typeof o.log === 'function' ? o.log : () => {}
  const emit = (ev) => { try { if (o.bus && typeof o.bus.emit === 'function') o.bus.emit(ev) } catch (e) { /* 广播不改结果 */ } }
  const domaingate = o.domaingate
  const publication = o.publication

  const cfg = () => {
    const raw = readKey('vmu.lifecycle.stages')
    const n = (k, d) => { const v = Number(readKey(k)); return Number.isFinite(v) && v >= 0 ? Math.floor(v) : d }
    return {
      stages: (Array.isArray(raw) && raw.length) ? raw : null,          // 空/未声明 ⇒ null ⇒ **拒** ✗✓
      requireEvidence: readKey('vmu.lifecycle.requireEvidence') !== false,
      maxArtifacts: n('vmu.lifecycle.maxArtifacts', 20),
      allowBackward: readKey('vmu.lifecycle.allowBackward') === true,
    }
  }
  const keysUsed = () => LIFECYCLE_KEYS.slice()

  /** 声明表校验：id 必须是 `L<n>`（**不得自造阶段名** ✗），且严格递增。 */
  const tableOf = () => {
    const c = cfg()
    if (!c.stages) return refuse('VMU_LIFECYCLE_NOT_DECLARED', '未声明阶段表（vmu.lifecycle.stages 为空）', '先声明 16 卷 §1 的 L1–L24；默认**不放行** ✗')
    const out = []
    for (const s of c.stages) {
      const id = String((s && s.id) || '')
      if (!/^L\d+$/.test(id)) return refuse('VMU_LIFECYCLE_BAD_STAGE_ID', '阶段 id 必须是 L<编号>，不得自造阶段名：' + JSON.stringify(id), '用 16 卷 §1 的 L 编号：L1…L24')
      out.push({ id, name: String((s && s.name) || ''), gates: Array.isArray(s && s.gates) ? s.gates.map(String) : [], requires: Array.isArray(s && s.requires) ? s.requires.map(String) : [] })
    }
    return { ok: true, table: out }
  }

  const studies = new Map()
  const artifacts = new Map()
  let droppedLog = 0
  let droppedArtifacts = 0
  const trail = []
  const note = (what, id, extra) => {
    trail.push(Object.assign({ at: clock(), what, id: String(id || '') }, extra || {}))
    if (trail.length > LOG_MAX) { trail.shift(); droppedLog += 1 }
  }

  const stages = () => { const t = tableOf(); if (t.ok === false) return t; return { ok: true, count: t.table.length, stages: t.table } }

  const stateOf = (q) => {
    const studyId = String((q && q.studyId) || '')
    if (!studyId) return refuse('VMU_META_VALIDATION_FAILED', 'state 需要 studyId', '给 studyId')
    const st = studies.get(studyId)
    const t = tableOf()
    if (t.ok === false) return t
    if (!st) return { ok: true, studyId, stage: '', index: -1, declared: t.table.map((s) => s.id), next: t.table.length ? [t.table[0].id] : [], artifacts: 0 }
    const idx = t.table.findIndex((s) => s.id === st.stage)
    return { ok: true, studyId, stage: st.stage, index: idx, declared: t.table.map((s) => s.id), next: idx >= 0 && idx + 1 < t.table.length ? [t.table[idx + 1].id] : [], artifacts: (artifacts.get(studyId) || []).length }
  }

  const gateAt = (q) => {
    const studyId = String((q && q.studyId) || '')
    const stage = String((q && q.stage) || '')
    const t = tableOf()
    if (t.ok === false) return t
    const def = t.table.filter((s) => s.id === stage)[0]
    if (!def) return Object.assign(refuse('VMU_NOT_FOUND', '阶段未声明：' + stage, '见 stages()'), { declared: t.table.map((s) => s.id) })
    return { ok: true, studyId, stage, gates: def.gates.slice(), requires: def.requires.slice() }
  }

  /** 闸点：**委托**接缝；无接缝 ⇒ 具名拒（不假装已检查 ✗）。 */
  const runGate = (kind, payload) => {
    const seam = kind === 'publication' ? publication : domaingate
    if (!seam || typeof seam.check !== 'function') {
      return refuse('VMU_EXTERNAL_UNAVAILABLE', '闸点接缝未注入：' + kind + '（**不得假装已检查** ✗）', '由宿主注入 ' + kind + '.check({stage, evidence})')
    }
    const r = seam.check(payload) || {}
    if (r.ok === true) return { ok: true }
    const missing = Array.isArray(r.missing) && r.missing.length ? r.missing.map(String) : []
    return refuse('VMU_LIFECYCLE_GATE_UNMET', '闸点未过（' + kind + '）：' + (missing.length ? '缺 ' + missing.join('、') : (r.message || '未通过')),
      '补齐缺项：' + (missing.length ? missing.join('、') : '见接缝回执'))
  }

  const advance = (a) => {
    const args = a || {}
    const t = tableOf()
    if (t.ok === false) return t
    const studyId = String(args.studyId || '')
    const to = String(args.to || '')
    if (!studyId) return refuse('VMU_META_VALIDATION_FAILED', 'advance 需要 studyId', '给 studyId')
    const def = t.table.filter((s) => s.id === to)[0]
    if (!def) return Object.assign(refuse('VMU_LIFECYCLE_BAD_STAGE_ID', '目标阶段未声明：' + JSON.stringify(to), '只能用声明表里的 L 编号'), { declared: t.table.map((s) => s.id) })
    const st = studies.get(studyId) || { studyId, stage: '', at: 0 }
    const idx = st.stage ? t.table.findIndex((s) => s.id === st.stage) : -1
    const want = idx + 1
    // ② 越级/回退 ⇒ 具名拒 ＋ 当前 L ＋ 合法下一步
    if (t.table[want] === undefined || t.table[want].id !== to) {
      const legal = t.table[want] ? [t.table[want].id] : []
      const backward = idx >= 0 && t.table.findIndex((s) => s.id === to) < idx
      if (backward && cfg().allowBackward) { /* 显式允许回退（**显式**才放行 ✓） */ }
      else {
        return Object.assign(refuse('VMU_LIFECYCLE_ILLEGAL_STEP',
          '非法步进：当前 ' + (st.stage || '（未开始）') + ' ⇒ 目标 ' + to + '（' + (backward ? '回退' : '越级') + '）',
          '合法下一步：' + (legal.length ? legal.join('、') : '（已是末阶段）')),
          { current: st.stage || '', legalNext: legal })
      }
    }
    // ④ 准入证据
    const c = cfg()
    const evidence = Array.isArray(args.evidence) ? args.evidence.map(String) : []
    if (c.requireEvidence && evidence.length === 0 && def.requires.length > 0) {
      return refuse('VMU_LIFECYCLE_EVIDENCE_REQUIRED', '进入 ' + to + ' 需要准入证据：' + def.requires.join('、'), '把证据引用放进 evidence[]')
    }
    // ③ 闸点（委托）
    for (const kind of def.gates) {
      const g = runGate(kind === 'publication' ? 'publication' : 'domain', { studyId, stage: to, evidence })
      if (g.ok !== true) return g
    }
    st.stage = to; st.at = clock()
    studies.set(studyId, st)
    const arts = (artifacts.get(studyId) || []).concat(evidence.map((e) => ({ ref: e, at: clock() })))
    artifacts.set(studyId, arts)
    if (arts.length > c.maxArtifacts) { const drop = arts.length - c.maxArtifacts; artifacts.set(studyId, arts.slice(drop)); droppedArtifacts += drop }
    note('lifecycle.advance', studyId, { to })
    emit({ type: 'lifecycle.advance', studyId, to })
    return { ok: true, studyId, stage: to, at: st.at, index: t.table.findIndex((s) => s.id === to) }
  }

  const artifactsOf = (q) => {
    const studyId = String((q && q.studyId) || '')
    const list = artifacts.get(studyId) || []
    return { ok: true, studyId, count: list.length, droppedArtifacts, artifacts: list.slice() }
  }
  const summary = () => {
    const c = cfg()
    return { ok: true, studies: studies.size, declared: c.stages ? c.stages.length : 0, droppedLog, droppedArtifacts, requireEvidence: c.requireEvidence, allowBackward: c.allowBackward }
  }

  return { stages, state: stateOf, advance, gateAt, artifacts: artifactsOf, status: summary, keysUsed, config: cfg, trail: () => trail.slice() }
}

export default createLifecycle

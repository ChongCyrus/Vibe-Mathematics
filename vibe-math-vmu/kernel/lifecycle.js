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
  // ROUND 245: research integrity - the pre-registration unit and the significance unit.
  'vmu.lifecycle.preregLock',
  'vmu.lifecycle.searchSources',
  'vmu.lifecycle.topicRequiredFields',
  'vmu.lifecycle.variableRoles',
  'vmu.lifecycle.dedupeKeys',
  'vmu.lifecycle.alpha',
  'vmu.lifecycle.powerTarget',
])
const LOG_MAX = 200
const refuse = (code, message, hint) => ({ ok: false, code, message, hint })

export function createLifecycle(opts) {
  const o = opts || {}
  const readKey = (k) => (o.settings && typeof o.settings.get === 'function' ? o.settings.get(k) : (o.settings || {})[k])
  const clock = typeof o.clock === 'function' ? o.clock : () => 0
  const log = typeof o.log === 'function' ? o.log : () => {}
  // MEASURED BUG (fixed in round 2, reported by vmu-pack): this used to be `o.bus.emit(ev)` with an OBJECT,
  // which `kernel/bus.js` refuses by name ("bus.emit needs a NON-EMPTY STRING hook") - and the try/catch around
  // it swallowed the refusal, so BOTH lifecycle broadcasts never reached the bus at all. Producers pass the hook
  // NAME first and catch the async rejection on the promise.
  const emit = (name, payload) => {
    if (!o.bus || typeof o.bus.emit !== 'function') return null
    try {
      const r = o.bus.emit(name, payload)
      if (r && typeof r.catch === 'function') r.catch(() => {})
      return r
    } catch (e) { return null }
  }
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
      // ROUND 245: the pre-registration unit and the significance unit.
      preregLock: readKey('vmu.lifecycle.preregLock') === true,
      searchSources: (() => { const v = readKey('vmu.lifecycle.searchSources'); return Array.isArray(v) ? v.map(String).filter(Boolean) : [] })(),
      topicRequiredFields: (() => { const v = readKey('vmu.lifecycle.topicRequiredFields'); return Array.isArray(v) ? v.map(String).filter(Boolean) : [] })(),
      variableRoles: (() => { const v = readKey('vmu.lifecycle.variableRoles'); return Array.isArray(v) ? v.map(String).filter(Boolean) : [] })(),
      dedupeKeys: (() => { const v = readKey('vmu.lifecycle.dedupeKeys'); return Array.isArray(v) ? v.map(String).filter(Boolean) : [] })(),
      alpha: (() => { const v = Number(readKey('vmu.lifecycle.alpha')); return Number.isFinite(v) && v > 0 && v <= 0.5 ? v : 0.05 })(),
      powerTarget: (() => { const v = Number(readKey('vmu.lifecycle.powerTarget')); return Number.isFinite(v) && v > 0 && v <= 1 ? v : 0.8 })(),
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

  const preregs = new Map()
  /**
   * ROUND 245: pre-registration. The declaration says what it must CONTAIN (`topicRequiredFields`, `searchSources`,
   * `variableRoles`) and what may not be registered twice (`dedupeKeys`); `preregLock` decides whether a locked study may be
   * registered again at all. A missing field is named, never merely counted.
   */
  const prereg = (a) => {
    const args = a || {}
    const c = cfg()
    const studyId = String(args.studyId || '')
    if (!studyId) return refuse('VMU_META_VALIDATION_FAILED', 'prereg 需要 studyId', '给 studyId')
    const existing = preregs.get(studyId)
    if (existing && c.preregLock) {
      return refuse('VMU_LIFECYCLE_PREREG_LOCKED', 'vmu.lifecycle.preregLock=true 且该研究已预注册：' + studyId,
        '预注册是锁定件（16 卷）；要改就换 studyId，或显式关掉 preregLock')
    }
    const topic = args.topic && typeof args.topic === 'object' ? args.topic : {}
    const missingFields = c.topicRequiredFields.filter((f) => topic[f] === undefined || topic[f] === null || String(topic[f]).trim() === '')
    if (missingFields.length) {
      return Object.assign(refuse('VMU_LIFECYCLE_PREREG_INCOMPLETE', '预注册 topic 缺字段：' + missingFields.join('、'),
        '补齐 ' + missingFields.join('、') + '（vmu.lifecycle.topicRequiredFields）'), { missing: missingFields })
    }
    const searches = Array.isArray(args.searches) ? args.searches.map(String) : []
    const missingSources = c.searchSources.filter((s) => !searches.includes(s))
    if (missingSources.length) {
      return Object.assign(refuse('VMU_LIFECYCLE_PREREG_INCOMPLETE', '预注册缺检索源：' + missingSources.join('、'),
        '把 ' + missingSources.join('、') + ' 加进 searches[]（vmu.lifecycle.searchSources）'), { missing: missingSources })
    }
    const variables = Array.isArray(args.variables) ? args.variables : []
    const badRoles = c.variableRoles.length
      ? variables.filter((v) => !c.variableRoles.includes(String((v && v.role) || ''))).map((v) => String((v && v.name) || '?'))
      : []
    if (badRoles.length) {
      return Object.assign(refuse('VMU_LIFECYCLE_PREREG_INCOMPLETE', '变量角色不在声明集合内：' + badRoles.join('、'),
        '角色只能是 ' + c.variableRoles.join('、') + '（vmu.lifecycle.variableRoles）'), { missing: badRoles })
    }
    const dupe = []
    for (const [otherId, other] of preregs) {
      if (otherId === studyId) continue
      // MEASURED BUG: this compared `other.keys[k]` against the whole keys OBJECT, so a duplicate was never detected.
      const incoming = args.keys && typeof args.keys === 'object' ? args.keys : {}
      for (const k of c.dedupeKeys) if (other.keys[k] !== undefined && incoming[k] !== undefined && other.keys[k] === incoming[k]) dupe.push(k)
    }
    if (dupe.length) {
      return Object.assign(refuse('VMU_LIFECYCLE_PREREG_DUPLICATE', '预注册与既有研究重复（键：' + dupe.join('、') + '）',
        '换掉 ' + dupe.join('、') + '，或从 vmu.lifecycle.dedupeKeys 里去掉该键'), { duplicate: dupe })
    }
    const keys = args.keys && typeof args.keys === 'object' ? args.keys : {}
    preregs.set(studyId, { studyId, at: clock(), keys, topic, searches, variables })
    note('lifecycle.prereg', studyId, { searches: searches.length, variables: variables.length })
    emit('lifecycle/prereg', { studyId })
    return { ok: true, studyId, at: clock(), locked: c.preregLock, topicRequiredFields: c.topicRequiredFields.slice(), searchSources: c.searchSources.slice(), enforced: ['vmu.lifecycle.preregLock', 'vmu.lifecycle.topicRequiredFields', 'vmu.lifecycle.searchSources', 'vmu.lifecycle.variableRoles', 'vmu.lifecycle.dedupeKeys'] }
  }

  /**
   * ROUND 245: significance. `alpha` and `powerTarget` are JUDGED here, because a declaration nobody reads is not a rule.
   * A p-value above alpha is not a failure of the study - it is a result, and the receipt says so without pretending.
   */
  const judge = (a) => {
    const args = a || {}
    const c = cfg()
    const p = Number(args.p)
    const hasP = Number.isFinite(p)
    const power = Number(args.power)
    const hasPower = Number.isFinite(power)
    if (!hasP && !hasPower) {
      return refuse('VMU_META_VALIDATION_FAILED', 'judge 需要 p 或 power', '给 { p } 或 { power }')
    }
    const out = { ok: true, alpha: c.alpha, powerTarget: c.powerTarget, enforced: ['vmu.lifecycle.alpha', 'vmu.lifecycle.powerTarget'] }
    if (hasP) { out.p = p; out.significant = p <= c.alpha; out.note = out.significant ? '低于 alpha ⇒ 显著' : '高于 alpha ⇒ 不显著（这是一个结果，不是失败）' }
    if (hasPower) { out.power = power; out.powerMet = power >= c.powerTarget }
    return out
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
    emit('lifecycle/advance', { studyId, to })
    return { ok: true, studyId, stage: to, at: st.at, index: t.table.findIndex((s) => s.id === to) }
  }

  const artifactsOf = (q) => {
    const studyId = String((q && q.studyId) || '')
    const list = artifacts.get(studyId) || []
    return { ok: true, studyId, count: list.length, droppedArtifacts, artifacts: list.slice() }
  }
  const summary = () => {
    const c = cfg()
    return { ok: true, studies: studies.size, declared: c.stages ? c.stages.length : 0, droppedLog, droppedArtifacts, requireEvidence: c.requireEvidence, allowBackward: c.allowBackward,
      // ROUND 245: the research-integrity declarations are reported, so an operator can see them without reading settings.
      preregLock: c.preregLock, preregs: preregs.size, alpha: c.alpha, powerTarget: c.powerTarget,
      searchSources: c.searchSources.slice(), topicRequiredFields: c.topicRequiredFields.slice(), variableRoles: c.variableRoles.slice(), dedupeKeys: c.dedupeKeys.slice() }
  }

  return { stages, state: stateOf, advance, gateAt, artifacts: artifactsOf, status: summary, keysUsed, config: cfg, trail: () => trail.slice(),
    prereg, judge, preregOf: (q) => { const id = String((q && q.studyId) || ''); const r = preregs.get(id); return r ? { ok: true, studyId: id, at: r.at, searches: r.searches.slice(), variables: r.variables.slice() } : refuse('VMU_NOT_FOUND', '该研究未预注册：' + id, '先调 prereg({studyId, topic, searches})') } }
}

export default createLifecycle

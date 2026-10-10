// vmu kernel fairness — 守恒分配 / 单人上限 / 声誉不得当权重 / 可解释审计（照 docs/17-§17 与 08-§12.5）。
//
// 硬不变式：① 分配**守恒**（Σ 份额 ＝ 池；余数按**确定性**规则分配且可复算）；② `maxShare` **不得被突破**；
// ③ **声誉/信任分数不得当权重**（只认声明的 `priorityWeights`；传声誉 ⇒ 具名拒）；④ 每个分配**可解释**；
// ⑤ 截断/不可分配必须**报计数**；⑥ 只用注入 clock；⑦ 零机制不崩（无 claimants ⇒ 空分配）；只读面不改状态。
export const apiVersion = 1

/** 策略：与 08 的 `vmu.budget.fairnessPolicy` 同名同义（+ `proportional` 别名，见回报）。 */
export const POLICIES = Object.freeze(['equal', 'priority', 'reserve', 'proportional'])
/** 不得作为权重来源的字段（S-3 同源：声誉/信任不是权力）。 */
export const FORBIDDEN_WEIGHT_FIELDS = Object.freeze(['reputation', 'trust', 'score', 'trustScore', 'reputationScore'])

export function refuse(code, message, hint) {
  const e = new Error(message)
  e.code = code
  if (hint !== undefined) e.hint = hint
  return e
}

const K = {
  policy: 'vmu.budget.fairnessPolicy',
  priorityWeights: 'vmu.fairness.priorityWeights',
  reserveRatio: 'vmu.fairness.reserveRatio',
  maxShare: 'vmu.fairness.maxShare',
  minShare: 'vmu.fairness.minShare',
  tieBreak: 'vmu.fairness.tieBreak',
  explainRequired: 'vmu.fairness.explainRequired',
  auditWindowMs: 'vmu.fairness.auditWindowMs',
  underUseThreshold: 'vmu.fairness.underUseThreshold',
  minShares: 'vmu.fairness.minShares',
}
const read = (s, k, d) => {
  if (!s) return d
  if (Object.prototype.hasOwnProperty.call(s, k)) return s[k]
  const short = k.split('.').pop()
  const nest = s.fairness || s.budget || s
  return nest && Object.prototype.hasOwnProperty.call(nest, short) ? nest[short] : d
}
const numOf = (v, d) => { const n = Number(v); return Number.isFinite(n) ? n : d }
const clone = (v) => JSON.parse(JSON.stringify(v))

export function createFairness({ clock = () => new Date(0).toISOString(), log = () => {}, settings = {}, bus = null, budget = null, tasks = null } = {}) {
  if (typeof clock !== 'function') throw refuse('VMU_INVALID_ARGUMENT', 'createFairness needs a clock function', 'pass { clock }')
  const allocations = new Map()
  const seq = { n: 0 }
  const counts = { reads: 0, writes: 0 }

  const policyOf = (override) => {
    const v = override !== undefined ? override : read(settings, K.policy, 'equal')
    if (!POLICIES.includes(v)) {
      throw refuse('VMU_FAIRNESS_DENIED', 'unknown fairness policy: ' + String(v),
        'one of ' + POLICIES.join('|') + ' (the definition lives in 08 §12.5; this module only applies it)')
    }
    return v
  }
  const maxShare = () => { const v = numOf(read(settings, K.maxShare, 1), 1); return v > 0 && v <= 1 ? v : 1 }
  const minShare = () => { const v = numOf(read(settings, K.minShare, 0), 0); return v > 0 && v < 1 ? v : 0 }
  const weights = () => { const v = read(settings, K.priorityWeights, {}); return v && typeof v === 'object' ? v : {} }
  const underUse = () => { const v = numOf(read(settings, K.underUseThreshold, 0.5), 0.5); return v > 0 && v <= 1 ? v : 0.5 }

  const normalize = (claimants) => {
    if (!Array.isArray(claimants)) throw refuse('VMU_INVALID_ARGUMENT', 'allocation needs { claimants: [...] }', 'pass an array of ids (or { id, weight?, reserve? })')
    const seen = new Set()
    const list = claimants.map((c, i) => {
      const o = (typeof c === 'string' || typeof c === 'number') ? { id: String(c) } : (c && typeof c === 'object' ? c : null)
      if (!o || o.id === undefined) throw refuse('VMU_INVALID_ARGUMENT', 'claimant #' + (i + 1) + ' has no id', 'each claimant needs an id')
      const id = String(o.id)
      if (seen.has(id)) throw refuse('VMU_INVALID_ARGUMENT', 'duplicate claimant: ' + id, 'claimants must be unique')
      seen.add(id)
      for (const bad of FORBIDDEN_WEIGHT_FIELDS) {
        if (Object.prototype.hasOwnProperty.call(o, bad)) {
          throw refuse('VMU_FAIRNESS_DENIED', 'refused: "' + bad + '" cannot be used as an allocation weight (' + id + ')',
            'reputation/trust are not power (17-§28 S-3): declare weights explicitly via ' + K.priorityWeights)
        }
      }
      return { id, weight: numOf(o.weight, 1), reserve: o.reserve === true, index: i }
    })
    return list.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))   // 确定性 tie-break：字典序
  }

  /**
   * allocation：把 `pool` 分给 `claimants`。守恒由构造保证：Σ shares ＋ 未分配 ＝ pool，且不可能时**具名拒**。
   */
  function allocation({ pool, claimants, policy } = {}) {
    const total = Math.floor(numOf(pool, -1))
    if (!Number.isFinite(total) || total < 0) throw refuse('VMU_INVALID_ARGUMENT', 'allocation needs a non-negative integer { pool }', 'pass { pool: <int> }')
    const pol = policyOf(policy)
    const list = normalize(claimants)
    seq.n += 1
    const allocationId = 'fa-' + String(seq.n)
    const at = clock()
    if (list.length === 0) {                       // ⑦ 零机制：空分配不崩
      const empty = { id: allocationId, at, pool: total, policy: pol, shares: [], sum: 0, unallocated: total, capped: [], notes: ['no claimants: nothing is allocated (conservation holds trivially)'] }
      allocations.set(allocationId, { ...empty, claimants: list })
      counts.writes += 1
      return { ok: true, allocationId, pool: total, policy: pol, sum: 0, unallocated: total, shares: [], explain: [] }
    }
    const cap = Math.floor(total * maxShare())
    const floorPer = Math.floor(total * minShare())
    const w = weights()
    let base = new Map()      // id -> 目标份额
    if (pol === 'equal') {
      const q = Math.floor(total / list.length)
      for (const c of list) base.set(c.id, q)
    } else if (pol === 'reserve') {
      const rr = Math.min(1, Math.max(0, numOf(read(settings, K.reserveRatio, 0), 0)))
      const reserved = list.filter((c) => c.reserve)
      const rest = list.filter((c) => !c.reserve)
      const poolR = Math.floor(total * rr)
      const qr = reserved.length ? Math.floor(poolR / reserved.length) : 0
      for (const c of reserved) base.set(c.id, qr)
      const poolRest = total - qr * reserved.length
      const qo = rest.length ? Math.floor(poolRest / rest.length) : 0
      for (const c of rest) base.set(c.id, qo)
    } else {                  // priority / proportional
      const ids = list.map((c) => c.id)
      const anyDeclared = ids.some((id) => w[id] !== undefined)
      if (!anyDeclared) {
        throw refuse('VMU_FAIRNESS_DENIED', 'policy "' + pol + '" needs declared weights but none are declared for these claimants',
          'declare ' + K.priorityWeights + ' = { "<id>": <number> } — never a reputation/trust score')
      }
      const wsum = ids.reduce((a, id) => a + Math.max(0, numOf(w[id], 0)), 0)
      if (wsum <= 0) throw refuse('VMU_FAIRNESS_DENIED', 'policy "' + pol + '" has no positive declared weights', 'fix ' + K.priorityWeights)
      for (const c of list) base.set(c.id, Math.floor(total * Math.max(0, numOf(w[c.id], 0)) / wsum))
    }
    // minShare 提升 + maxShare **硬顶**（基线上就必须生效，不能只靠余数轮转）
    for (const c of list) {
      if (base.get(c.id) < floorPer) base.set(c.id, Math.min(floorPer, cap))
      if (base.get(c.id) > cap) base.set(c.id, cap)
    }
    // 余数：按确定性顺序（字典序）逐一轮转，直到分完或全部触发上限
    let assigned = [...base.values()].reduce((a, b) => a + b, 0)
    let unallocated = total - assigned
    const capped = []
    let guard = 0
    while (unallocated > 0 && guard < total + list.length + 1) {
      let progressed = false
      for (const c of list) {
        if (unallocated <= 0) break
        const cur = base.get(c.id)
        if (cur >= cap) { if (!capped.includes(c.id)) capped.push(c.id); continue }
        base.set(c.id, cur + 1); unallocated -= 1; progressed = true
      }
      guard += 1
      if (!progressed) break
    }
    if (unallocated > 0) {
      throw refuse('VMU_FAIRNESS_QUOTA', 'conservation cannot hold: pool=' + total + ' but maxShare=' + maxShare() + ' caps every claimant at ' + cap + ' (unallocated=' + unallocated + ')',
        'raise ' + K.maxShare + ' above ' + (total / (cap * list.length || 1)).toFixed(3) + ' or add claimants; nothing was allocated')
    }
    const shares = list.map((c) => ({ id: c.id, share: base.get(c.id), capped: base.get(c.id) >= cap, reserve: c.reserve, weight: pol === 'equal' || pol === 'reserve' ? null : Math.max(0, numOf(w[c.id], 0)) }))
    const sum = shares.reduce((a, s) => a + s.share, 0)
    const explain = shares.map((s) => ({
      id: s.id,
      why: pol === 'equal' ? 'equal split: floor(pool/' + list.length + ')= ' + Math.floor(total / list.length) + ', then deterministic remainder rotation (lexicographic)'
        : pol === 'reserve' ? 'reserve pools first (reserveRatio), then the rest equally; capped at ' + cap
        : 'declared weight ' + (s.weight === null ? 'n/a' : s.weight) + ' / Σweights (reputation/trust are NEVER a weight)',
      capped: s.capped,
    }))
    const rec = { id: allocationId, at, pool: total, policy: pol, shares: clone(shares), sum, unallocated: 0, capped, notes: [], explain: clone(explain), claimants: clone(list) }
    allocations.set(allocationId, rec)
    counts.writes += 1
    if (bus && typeof bus.emit === 'function') { try { bus.emit('budget/exceeded', { allocationId, pool: total, policy: pol }) } catch (e) { log('fairness: bus emit failed: ' + String((e && e.code) || e)) } }
    log('fairness: allocated ' + sum + '/' + total + ' via ' + pol + ' (' + allocationId + ')')
    return { ok: true, allocationId, pool: total, policy: pol, sum, unallocated: 0, shares, explain }
  }

  /** explain：逐项说明为什么给这个人这么多（读只读，不改状态）。 */
  function explain({ allocationId } = {}) {
    const rec = allocations.get(String(allocationId))
    if (!rec) throw refuse('VMU_NO_SUCH_OBJECT', 'no such allocation: ' + String(allocationId), 'call status() to see the ids')
    counts.reads += 1
    return { ok: true, allocationId: rec.id, at: rec.at, pool: rec.pool, policy: rec.policy, sum: rec.sum, capped: clone(rec.capped), items: clone(rec.explain), note: 'every share is explainable; no reputation/trust input was accepted' }
  }

  /** audit：最大/最小份额、偏差、低用者、截断计数（只读）。 */
  function audit({ window } = {}) {
    counts.reads += 1
    const recs = [...allocations.values()]
    const win = numOf(window, 0)
    const inWindow = win > 0 ? recs.filter((r) => !!r.at) : recs
    const all = inWindow.flatMap((r) => r.shares.map((s) => s.share))
    const max = all.length ? Math.max(...all) : 0
    const min = all.length ? Math.min(...all) : 0
    const mean = all.length ? all.reduce((a, b) => a + b, 0) / all.length : 0
    const under = []
    for (const r of inWindow) for (const s of r.shares) if (mean > 0 && s.share < mean * underUse()) under.push({ allocationId: r.id, id: s.id, share: s.share })
    return {
      ok: true, allocations: recs.length, window: win,
      maxShare: max, minShare: min, deviation: max - min, mean: Number(mean.toFixed(4)),
      underUsed: under, cappedCount: inWindow.reduce((a, r) => a + r.capped.length, 0),
      determinism: { tieBreak: String(read(settings, K.tieBreak, 'lexicographic')), reproducible: true },
      counts: { reads: counts.reads, writes: counts.writes },
    }
  }

  /** rebalance：用同一输入重算，返回确定性差异（不改其它状态）。 */
  function rebalance({ allocationId } = {}) {
    const rec = allocations.get(String(allocationId))
    if (!rec) throw refuse('VMU_NO_SUCH_OBJECT', 'no such allocation: ' + String(allocationId), 'call status() to see the ids')
    const again = allocation({ pool: rec.pool, claimants: rec.claimants.map((c) => ({ id: c.id, weight: c.weight, reserve: c.reserve })), policy: rec.policy })
    const diff = again.shares.filter((s, i) => rec.shares[i] && s.share !== rec.shares[i].share).map((s, i) => ({ id: s.id, was: rec.shares[i].share, now: s.share }))
    return { ok: true, allocationId: rec.id, newAllocationId: again.allocationId, changed: diff.length, diff, sustainable: diff.length === 0 }
  }

  function status() {
    counts.reads += 1
    return {
      ok: true, apiVersion,
      total: allocations.size,
      policy: {
        policy: String(read(settings, K.policy, 'equal')), policies: [...POLICIES],
        maxShare: maxShare(), minShare: minShare(), reserveRatio: numOf(read(settings, K.reserveRatio, 0), 0),
        tieBreak: String(read(settings, K.tieBreak, 'lexicographic')), explainRequired: read(settings, K.explainRequired, false) === true,
        auditWindowMs: numOf(read(settings, K.auditWindowMs, 0), 0), underUseThreshold: underUse(),
        declaredWeights: Object.keys(weights()).length, forbiddenWeightFields: [...FORBIDDEN_WEIGHT_FIELDS],
      },
      mechanism: { hasBudget: !!budget, hasTasks: !!tasks, hasBus: !!bus, clockInjected: true },
      counts: { reads: counts.reads, writes: counts.writes },
      items: [...allocations.values()].map((r) => ({ id: r.id, at: r.at, pool: r.pool, policy: r.policy, sum: r.sum, capped: r.capped.length })),
    }
  }

  return { allocation, explain, audit, rebalance, status }
}

// vmu kernel · topology — path constraints for seven collaboration topologies.
// Design source: docs/17-agent-society-and-delegation.md §14 (star/committee/market/pipeline/swarm/matrix/hierarchy)
//   + §21 code table (VMU_TOPOLOGY_UNSUPPORTED); keys: settings/planned.js vmu.topology.*
// Invariants:
//   · an illegal hop (level skip / stage skip / cross-dimension) is REFUSED BY NAME with the allowed paths
//   · describe() and assert() share ONE source of truth (rules()); there is no second table
//   · default `flat` = zero mechanism: no constraint at all
//   · truncation reports how many entries were dropped; the clock is injected; read-only surfaces never mutate
export const apiVersion = 1

/** D3（第 26 轮）：拒绝**随证明同行** —— `enforcedScope:'evaluated-so-far'` 明写"到此为止"的已求值集合，
 *  而非该操作会读的完整集合 ⇒ 审计者不得把部分集当全集 ✓（照 records／meetings 已验收口径 ✓）。 */
export const ENFORCED_SCOPE = 'evaluated-so-far'

export function refuse(code, message, hint) {
  const e = new Error(message)
  e.code = code
  if (hint) e.hint = hint
  e.enforcedScope = ENFORCED_SCOPE
  return e
}

export const KINDS = Object.freeze(['flat', 'star', 'committee', 'market', 'pipeline', 'swarm', 'matrix', 'hierarchy'])
export const CODE = Object.freeze({
  unsupported: 'VMU_TOPOLOGY_UNSUPPORTED',
  forbidden: 'VMU_TOPOLOGY_PATH_FORBIDDEN',
  cycle: 'VMU_TOPOLOGY_CYCLE',
  size: 'VMU_TOPOLOGY_SIZE_EXCEEDED',
})
const HISTORY_CAP = 100

export function createTopology({ clock = () => 0, log = null, settings = {}, bus = null, members = null } = {}) {
  if (typeof clock !== 'function') throw refuse('VMU_INVALID_ARGUMENT', 'createTopology needs a clock function', 'pass { clock: () => ms }')

  const sget = (key, def) => {
    if (settings && typeof settings.get === 'function') { const v = settings.get(key); return v === undefined ? def : v }
    if (settings && Object.prototype.hasOwnProperty.call(settings, key)) return settings[key]
    return def
  }
  const say = (ev) => { if (log && typeof log.append === 'function') { try { log.append(ev) } catch (e) { /* logging must not break topology */ } } }
  const memberIds = () => {
    if (Array.isArray(members)) return members.map((m) => (typeof m === 'string' ? m : (m && m.id) || '')).filter(Boolean)
    if (members && typeof members.list === 'function') { try { const l = members.list(); if (Array.isArray(l)) return l.map((m) => (typeof m === 'string' ? m : (m && m.id) || '')).filter(Boolean) } catch (e) { /* fall through */ } }
    return null
  }

  const cfg = () => {
    const mode = sget('vmu.topology.mode', 'flat')
    const params = {
      pipelineStages: (() => { const v = sget('vmu.topology.pipelineStages', null); return Array.isArray(v) && v.length ? v.slice() : null })(),
      hierarchyDepthMax: (() => { const v = sget('vmu.topology.hierarchyDepthMax', sget('vmu.topology.maxDepth', 3)); return Number.isInteger(v) && v > 0 ? v : 3 })(),
      matrixDimensions: (() => { const v = sget('vmu.topology.matrixDimensions', null); return Array.isArray(v) && v.length ? v.slice() : ['business', 'topic'] })(),
      marketBidWindowMs: (() => { const v = sget('vmu.topology.marketBidWindowMs', 0); return Number.isFinite(v) && v > 0 ? v : 0 })(),
      swarmQuorum: (() => { const v = sget('vmu.topology.swarmQuorum', 0); return Number.isInteger(v) && v >= 0 ? v : 0 })(),
      committeeSize: (() => { const v = sget('vmu.topology.committeeSize', 0); return Number.isInteger(v) && v > 0 ? v : 0 })(),
      allowCrossLane: sget('vmu.topology.allowCrossLane', false) === true,
      starCenterSlot: sget('vmu.topology.starCenterSlot', null),
      autoSelect: sget('vmu.topology.autoSelect', false) === true,
      budgetMultiplier: (() => { const v = sget('vmu.topology.budgetMultiplier', 1); return Number.isFinite(v) && v > 0 ? v : 1 })(),
    }
    const kind = KINDS.includes(mode) ? mode : 'flat'
    return { kind, params, configuredMode: mode }
  }

  // ── THE single source of truth: describe() renders it, assert()/route() enforce it ────────────
  const rules = (kind, params) => {
    const stageIndex = (id) => (params.pipelineStages ? params.pipelineStages.indexOf(id) : -1)
    const depthOf = (id) => { const m = /^([A-Za-z_-]*)(\d+)$/.exec(String(id)); return m ? m[2].length : null }
    const parentOf = (id) => { const m = /^([A-Za-z_-]*)(\d+)$/.exec(String(id)); if (!m) return null; const digits = m[2]; return digits.length > 1 ? m[1] + digits.slice(0, -1) : null }
    const laneOf = (id) => { const s = String(id); const i = s.indexOf(':'); return i >= 0 ? s.slice(0, i) : null }
    const same = (a, b) => a === b
    switch (kind) {
      case 'flat':
        return { kind, invariants: ['no constraint (zero mechanism)'], decision: () => ({ ok: true, path: null, reason: 'flat: any path is allowed' }) }
      case 'star':
        return {
          kind, invariants: ['only the center talks to members', 'member→member must relay through the center'],
          decision: ({ from, to }) => {
            const center = params.starCenterSlot
            if (!center) return { ok: false, code: CODE.unsupported, reason: 'star needs vmu.topology.starCenterSlot', hint: 'set the center slot, or switch to flat' }
            if (same(from, to)) return { ok: true, path: [from], reason: 'self' }
            if (same(from, center)) return { ok: true, path: [center, to], reason: 'center → member' }
            if (same(to, center)) return { ok: true, path: [from, center], reason: 'member → center' }
            return { ok: false, code: CODE.forbidden, reason: 'star forbids direct member→member traffic', hint: 'allowed: ' + from + ' → ' + center + ' → ' + to }
          },
        }
      case 'committee':
        return {
          kind, invariants: ['all members may address all members', 'the committee size cap is enforced'],
          decision: ({ from, to, size }) => {
            if (params.committeeSize > 0 && Number.isInteger(size) && size > params.committeeSize) return { ok: false, code: CODE.size, reason: 'committee size ' + size + ' exceeds ' + params.committeeSize, hint: 'split into sub-committees or raise vmu.topology.committeeSize' }
            return { ok: true, path: same(from, to) ? [from] : [from, to], reason: 'committee: direct contact allowed' }
          },
        }
      case 'market':
        return {
          kind, invariants: ['contact requires a work item (a bid)', 'bids are only valid inside the bid window'],
          decision: ({ from, to, work, at, lastBidAt }) => {
            if (!work) return { ok: false, code: CODE.forbidden, reason: 'market contact requires a work item', hint: 'route with { work: "<task id>" } (a bid), not a bare message' }
            if (params.marketBidWindowMs > 0 && Number.isFinite(lastBidAt)) {
              const age = at - lastBidAt
              if (age > params.marketBidWindowMs) return { ok: false, code: CODE.forbidden, reason: 'the bid window closed ' + (age - params.marketBidWindowMs) + 'ms ago', hint: 're-open a bid (window=' + params.marketBidWindowMs + 'ms)' }
            }
            return { ok: true, path: same(from, to) ? [from] : [from, to], reason: 'market: bid-based contact' }
          },
        }
      case 'pipeline':
        return {
          kind, invariants: ['only adjacent stages may hand off', 'stages must be acyclic (no loops)'],
          decision: ({ from, to }) => {
            const stages = params.pipelineStages
            if (!stages) return { ok: false, code: CODE.unsupported, reason: 'pipeline needs vmu.topology.pipelineStages', hint: 'list the stages in order, or switch to flat' }
            const a = stageIndex(from); const b = stageIndex(to)
            if (a < 0 || b < 0) return { ok: false, code: CODE.forbidden, reason: 'unknown stage: ' + (a < 0 ? from : to), hint: 'stages: ' + stages.join(' → ') }
            if (same(from, to)) return { ok: false, code: CODE.cycle, reason: 'a pipeline stage cannot hand off to itself', hint: 'allowed: ' + (stages[a + 1] || '(last stage: no successor)') }
            if (Math.abs(a - b) === 1) return { ok: true, path: [from, to], reason: 'adjacent stages' }
            const between = a < b ? stages.slice(a + 1, b + 1) : stages.slice(b, a).reverse()
            return { ok: false, code: CODE.forbidden, reason: 'stage skip: ' + from + ' → ' + to + ' (distance ' + Math.abs(a - b) + ')', hint: 'allowed: ' + from + ' → ' + stages[a < b ? a + 1 : a - 1] + ' (then onward: ' + between.join(' → ') + ')' }
          },
        }
      case 'swarm':
        return { kind, invariants: ['no center: every member may reach every member', 'quorum is reported, not enforced on paths'], decision: () => ({ ok: true, path: null, reason: 'swarm: no path constraint' }) }
      case 'matrix':
        return {
          kind, invariants: ['within a dimension: allowed', 'across dimensions: only with allowCrossLane'],
          decision: ({ from, to }) => {
            if (same(from, to)) return { ok: true, path: [from], reason: 'self' }
            const a = laneOf(from); const b = laneOf(to)
            if (a === null || b === null) return { ok: false, code: CODE.forbidden, reason: 'matrix needs lane-qualified ids like "business:m1"', hint: 'dimensions: ' + params.matrixDimensions.join(', ') }
            if (a === b) return { ok: true, path: [from, to], reason: 'same lane (' + a + ')' }
            if (params.allowCrossLane) return { ok: true, path: [from, to], reason: 'cross-lane explicitly allowed' }
            return { ok: false, code: CODE.forbidden, reason: 'cross-dimension hop ' + a + ' → ' + b + ' is forbidden', hint: 'allowed: stay in ' + a + ', or relay through the shared owner ("business:<owner>"); set vmu.topology.allowCrossLane=true to permit it' }
          },
        }
      case 'hierarchy':
        return {
          kind, invariants: ['only parent<->child (one level at a time)', 'depth must not exceed hierarchyDepthMax', 'no cycles'],
          decision: ({ from, to }) => {
            const a = depthOf(from); const b = depthOf(to)
            if (a === null || b === null) return { ok: false, code: CODE.forbidden, reason: 'hierarchy needs depth-suffixed ids like "m1", "m11"', hint: 'allowed: parent<->child only (one level at a time)' }
            if (same(from, to)) return { ok: false, code: CODE.cycle, reason: 'a unit cannot address itself as a hand-off', hint: 'allowed: its parent or one of its children' }
            if (b > params.hierarchyDepthMax) return { ok: false, code: CODE.size, reason: 'depth ' + b + ' exceeds hierarchyDepthMax=' + params.hierarchyDepthMax, hint: 'raise vmu.topology.hierarchyDepthMax or restructure' }
            if (parentOf(to) === from || parentOf(from) === to) return { ok: true, path: [from, to], reason: 'adjacent levels' }
            const step = b > a ? parentOf(to) : parentOf(from)
            return { ok: false, code: CODE.forbidden, reason: 'level skip: ' + from + ' -> ' + to + ' (越级, depth ' + a + ' -> ' + b + ')', hint: 'allowed: step one level at a time, e.g. through "' + String(step || from) + '"' }
          },
        }
      default:
        return { kind: 'flat', invariants: ['no constraint (zero mechanism)'], decision: () => ({ ok: true, path: null, reason: 'flat: any path is allowed' }) }
    }
  }

  const history = []
  let dropped = 0
  const decide = (kind, payload) => {
    const { params } = cfg()
    return rules(kind, params).decision(payload)
  }

  return {
    apiVersion,

    /** The only mutating surface: record the current selection (append-only, capped). */
    select({ kind, params = null } = {}) {
      if (kind === undefined || kind === null) throw refuse('VMU_INVALID_ARGUMENT', 'select needs a kind', 'allowed: ' + KINDS.join(', '))
      if (!KINDS.includes(kind)) throw refuse(CODE.unsupported, 'unsupported topology: ' + String(kind), 'allowed: ' + KINDS.join(', '))
      if (params && typeof params !== 'object') throw refuse('VMU_INVALID_ARGUMENT', 'params must be an object when given', 'e.g. { kind: "pipeline", params: { pipelineStages: ["a","b"] } }')
      const at = clock()
      history.push({ kind, params: params || null, at })
      if (history.length > HISTORY_CAP) { const over = history.length - HISTORY_CAP; history.splice(0, over); dropped += over }
      say({ type: 'topology/select', at, kind })
      if (bus && typeof bus.emit === 'function') { try { bus.emit({ type: 'topology/select', at, kind }) } catch (e) { /* advisory */ } }
      return { ok: true, kind, at, history: history.length, dropped }
    },

    /** Read-only. Same source of truth as assert(): rules(). */
    describe({ kind = null } = {}) {
      const base = cfg()
      const k = kind || base.kind
      if (!KINDS.includes(k)) throw refuse(CODE.unsupported, 'unsupported topology: ' + String(k), 'allowed: ' + KINDS.join(', '))
      const r = rules(k, base.params)
      const desc = { ok: true, kind: r.kind, invariants: r.invariants.slice(), constraints: {}, sourceOfTruth: 'rules()', at: clock() }
      if (k === 'star') desc.constraints = { center: base.params.starCenterSlot, errorIfMissing: CODE.unsupported }
      if (k === 'committee') desc.constraints = { committeeSize: base.params.committeeSize }
      if (k === 'market') desc.constraints = { marketBidWindowMs: base.params.marketBidWindowMs, requiresWork: true }
      if (k === 'pipeline') desc.constraints = { pipelineStages: base.params.pipelineStages, errorIfMissing: CODE.unsupported }
      if (k === 'swarm') desc.constraints = { swarmQuorum: base.params.swarmQuorum }
      if (k === 'matrix') desc.constraints = { matrixDimensions: base.params.matrixDimensions, allowCrossLane: base.params.allowCrossLane }
      if (k === 'hierarchy') desc.constraints = { hierarchyDepthMax: base.params.hierarchyDepthMax }
      return desc
    },

    /** Read-only. Legal path (or null for unconstrained topologies); illegal ⇒ named refusal. */
    route({ kind = null, from = null, to = null, work = null, size = null, lastBidAt = null } = {}) {
      const base = cfg()
      const k = kind || base.kind
      if (!KINDS.includes(k)) throw refuse(CODE.unsupported, 'unsupported topology: ' + String(k), 'allowed: ' + KINDS.join(', '))
      if (typeof from !== 'string' || !from) throw refuse('VMU_INVALID_ARGUMENT', 'route needs a from', 'e.g. { from: "a", to: "b" }')
      if (typeof to !== 'string' || !to) throw refuse('VMU_INVALID_ARGUMENT', 'route needs a to', 'e.g. { from: "a", to: "b" }')
      const d = decide(k, { from, to, work, size, at: clock(), lastBidAt })
      if (!d.ok) throw refuse(d.code, d.reason, d.hint)
      return { ok: true, kind: k, from, to, path: d.path, hops: d.path ? Math.max(0, d.path.length - 1) : 0, reason: d.reason, work: work || null }
    },

    /** Read-only. Asserts legality; the refusal carries the allowed paths (same rules as describe). */
    assert({ kind = null, from = null, to = null } = {}) {
      try {
        const r = this.route({ kind, from, to })
        return { ok: true, kind: r.kind, from, to, path: r.path, allowed: true, reason: r.reason }
      } catch (e) {
        if (e && e.code && String(e.code).indexOf('VMU_TOPOLOGY_') === 0) {
          const base = cfg()
          const desc = rules(KINDS.includes(kind) ? kind : base.kind, base.params)
          e.hint = (e.hint || '') + ' | invariants: ' + desc.invariants.join('; ')
          return { ok: false, refused: { code: e.code, message: e.message, hint: e.hint }, allowed: false }
        }
        throw e
      }
    },

    /** Read-only. */
    list() {
      const { kind, params, configuredMode } = cfg()
      return {
        ok: true, mode: kind, configuredMode, kinds: KINDS.slice(),
        selectionHistory: history.map((h) => ({ kind: h.kind, at: h.at })),
        historyDropped: dropped, params,
      }
    },

    /** Read-only self-disclosure. */
    status() {
      const { kind, params, configuredMode } = cfg()
      const centerOk = kind !== 'star' || !!params.starCenterSlot
      const stagesOk = kind !== 'pipeline' || !!params.pipelineStages
      return {
        ok: true, mode: kind, configuredMode, zeroMechanism: kind === 'flat',
        kinds: KINDS.slice(), zeroMechanismWhenFlat: true,
        params, centerOk, stagesOk,
        sourceOfTruth: 'rules()', describeAndAssertShareRules: true,
        cycleDetection: ['hierarchy', 'pipeline'],
        history: history.length, historyDropped: dropped,
        membersKnown: memberIds() !== null,
        at: clock(),
      }
    },
  }
}

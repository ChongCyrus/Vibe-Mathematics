// vmu kernel budget — four quota classes, reserve, fairness, warn threshold and boundary action.
// Spec: docs/08-primitives-meeting-ballot-workflow.md §4 / §10 / §12.5 (vmu.budget.* family).
// Codes: VMU_BUDGET_SCOPE_UNKNOWN / VMU_BUDGET_RESERVE_EXHAUSTED / VMU_RESOURCE_BUDGET (03-§8).
// Invariants: named refusals WITH current value and limit; counted truncation on list(); zero-config is
// unlimited and never throws; deterministic (only the injected clock); remaining/status/list never mutate.

// ROUND 2 (task-10 A): the durable projection seam (docs/07 §4). The DECLARATION (totals, reserveRatio,
// fairnessPolicy …) is re-resolved from settings at startup and is deliberately not part of the snapshot; only
// what was SPENT is restored, because that is the fact a restart cannot recompute.
import { checkSnapshot } from './resume.js'

export const apiVersion = 1

/** The four quota classes (§12.5). */
export const BUDGET_KINDS = Object.freeze(['tokens', 'turns', 'toolCalls', 'subagents'])

/** Named refusal carrying the current value and the limit (same shape as the other kernels). */
export function refuse(code, message, hint, extra) {
  const err = new Error(message)
  err.code = code
  err.hint = hint
  if (extra) Object.assign(err, extra)
  return err
}

const KINDS = BUDGET_KINDS
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null)

/**
 * Create the budget service. `clock` is injected (never Date.now inside), `settings` is the resolved
 * settings map (vmu.budget.*), `log` receives warnings, `bus` may receive 'budget/exceeded' notices.
 */
export function createBudget({ clock = () => Date.now(), log = () => {}, settings = {}, bus = null, listCap = 200 } = {}) {
  const scopes = new Map()
  const cfg = () => ({
    fairnessPolicy: settings['vmu.budget.fairnessPolicy'] || 'equal',
    reserveRatio: num(settings['vmu.budget.reserveRatio']) ?? 0,
    warnAtRatio: num(settings['vmu.budget.warnAtRatio']) ?? 0.8,
    onExceed: settings['vmu.budget.onExceed'] || 'refuse',
    // ROUND 221: the declared TOTALS. 0 means unlimited, which is the declared default for all four.
    totals: (() => {
      const t = {}
      for (const [kind, key] of [['tokens', 'vmu.budget.tokens'], ['turns', 'vmu.budget.turns'], ['toolCalls', 'vmu.budget.toolCalls'], ['subagents', 'vmu.budget.subagents']]) {
        const v = num(settings[key])
        if (v !== null && v > 0) t[kind] = Math.floor(v)
      }
      return t
    })(),
    perTaskShare: (() => { const v = num(settings['vmu.budget.perTaskShare']); return v !== null && v >= 0 && v <= 1 ? v : 0 })(),
  })
  const need = (scope) => {
    const s = scopes.get(scope)
    if (!s) throw refuse('VMU_BUDGET_SCOPE_UNKNOWN', 'unknown budget scope: ' + String(scope),
      'open({scope}) first; known scopes: ' + (scopes.size ? [...scopes.keys()].join(',') : '(none)'), { scope })
    return s
  }
  const limitOf = (s, kind) => { const v = num(s.limits[kind]); return v === null ? Infinity : v }

  /** Open a scope. No limits ⇒ unlimited (zero-config). */
  function open({ scope, limits = {}, perTaskShare = null } = {}) {
    if (!scope || typeof scope !== 'string') throw refuse('VMU_BUDGET_SCOPE_UNKNOWN', 'open needs a string scope', 'e.g. open({scope:"meeting:mt-1"})')
    const c0 = cfg()
    const l = {}
    for (const k of KINDS) { const v = num(limits[k]); if (v !== null) l[k] = v }
    // ROUND 221: a declared family TOTAL is the default limit for that kind; an explicit limit still wins.
    for (const [kind, total] of Object.entries(c0.totals)) { if (KINDS.includes(kind) && l[kind] === undefined) l[kind] = total }
    const share = perTaskShare === null ? c0.perTaskShare : num(perTaskShare)
    if (share !== null && (share < 0 || share > 1)) throw refuse('VMU_BUDGET_SCOPE_UNKNOWN', 'perTaskShare must be between 0 and 1: ' + String(share), 'pass a ratio (vmu.budget.perTaskShare)')
    const s = { scope, limits: l, used: Object.fromEntries(KINDS.map((k) => [k, 0])), reserved: Object.fromEntries(KINDS.map((k) => [k, 0])), warnings: 0, perTaskShare: share === null ? 0 : share, tasks: new Map(), openedAt: clock(), paused: false }
    scopes.set(scope, s)
    return viewOf(s)
  }

  /** Charge one kind. Named refusal on exhaustion; `onExceed` decides refuse|warn|pause. */
  function charge({ scope, kind, amount = 0, taskId = null } = {}) {
    const s = need(scope)
    if (!KINDS.includes(kind)) throw refuse('VMU_RESOURCE_BUDGET', 'unknown budget kind: ' + String(kind), 'kinds: ' + KINDS.join('|'), { scope, kind })
    const a = num(amount) ?? 0
    if (a < 0) throw refuse('VMU_RESOURCE_BUDGET', 'amount must be >= 0', 'negative charges are not budget spending', { scope, kind })
    const lim = limitOf(s, kind)
    const used = s.used[kind]
    const c = cfg()
    // ROUND 221: vmu.budget.perTaskShare. With a share declared and a limited kind, ONE task may not take more than
    // that fraction of the limit - counted per task, refused by name, and independent of the scope total.
    if (taskId !== null && s.perTaskShare > 0 && lim !== Infinity && lim > 0) {
      const key = String(taskId) + '\u0000' + kind
      const shareCap = Math.floor(lim * s.perTaskShare)
      const already = s.tasks.get(key) || 0
      if (already + a > shareCap) {
        throw refuse('VMU_BUDGET_TASK_SHARE_EXCEEDED', 'task ' + String(taskId) + ' would exceed vmu.budget.perTaskShare of ' + kind + ': ' + (already + a) + ' > ' + shareCap,
          'perTaskShare=' + s.perTaskShare + ' of limit ' + lim + '; charge it to another task or raise the share', { scope, kind, taskId: String(taskId), used: already + a, cap: shareCap })
      }
      s.tasks.set(key, already + a)
    }
    const next = used + a
    // reserve: the reserved slice is held back; spending into it is refused by name.
    // NOTE: only when a reserve actually exists — otherwise the plain limit check must decide.
    const spendable = lim === Infinity ? Infinity : Math.max(0, lim - s.reserved[kind])
    if (s.reserved[kind] > 0 && next > spendable && lim !== Infinity) {
      const code = 'VMU_BUDGET_RESERVE_EXHAUSTED'
      if (c.onExceed === 'warn') { s.used[kind] = next; s.warnings += 1; log('budget warn (reserve): ' + scope + '/' + kind + ' used=' + next + ' limit=' + lim + ' reserved=' + s.reserved[kind]); return viewOf(s) }
      if (c.onExceed === 'pause') s.paused = true
      throw refuse(code, 'reserve exhausted for ' + scope + '/' + kind + ': used=' + next + ' spendable=' + spendable + ' limit=' + lim,
        'reserveRatio=' + c.reserveRatio + ' holds back ' + s.reserved[kind] + '; raise the limit or release the reserve', { scope, kind, used: next, limit: lim, reserved: s.reserved[kind] })
    }
    if (next > lim) {
      if (c.onExceed === 'warn') { s.used[kind] = next; s.warnings += 1; log('budget warn: ' + scope + '/' + kind + ' used=' + next + ' limit=' + lim) }
      else { if (c.onExceed === 'pause') s.paused = true
        throw refuse('VMU_RESOURCE_BUDGET', 'budget exceeded for ' + scope + '/' + kind + ': used=' + next + ' limit=' + lim,
          'onExceed=' + c.onExceed + '; raise the limit or open a new scope', { scope, kind, used: next, limit: lim }) }
    }
    s.used[kind] = next
    // warnAtRatio: warn once per scope/kind crossing, never refuses
    if (lim !== Infinity && lim > 0 && next / lim >= c.warnAtRatio) {
      s.warnings += 1
      log('budget warnAtRatio: ' + scope + '/' + kind + ' at ' + Math.round((next / lim) * 100) + '% (ratio=' + c.warnAtRatio + ')')
      // ROUND 496: this used to be a bare, un-awaited emit. Even with the name now frozen, a LISTENER can throw, and a
        // warning must never break the caller that merely crossed a ratio - so the rejection is caught and the warning is
        // recorded rather than propagated.
        if (bus && typeof bus.emit === 'function') {
          const emitted = bus.emit('budget/warn', { scope, kind, used: next, limit: lim })
          if (emitted && typeof emitted.catch === 'function') emitted.catch((e) => log('budget/warn listener failed: ' + String(e && e.message)))
        }
    }
    return viewOf(s)
  }

  /** Reserve a slice of every limited kind (fairness policy reserve). */
  function reserve({ scope, ratio } = {}) {
    const s = need(scope)
    const r = num(ratio) ?? cfg().reserveRatio
    if (r < 0 || r > 1) throw refuse('VMU_RESOURCE_BUDGET', 'reserve ratio must be in 0..1: ' + String(r), 'reserveRatio is a fraction of the limit', { scope })
    for (const k of KINDS) { const lim = limitOf(s, k); s.reserved[k] = lim === Infinity ? 0 : Math.floor(lim * r) }
    return viewOf(s)
  }

  /** Read-only views (must never mutate). */
  const remaining = ({ scope } = {}) => {
    const s = scopes.get(scope)
    if (!s) throw refuse('VMU_BUDGET_SCOPE_UNKNOWN', 'unknown budget scope: ' + String(scope), 'open({scope}) first', { scope })
    const out = {}
    for (const k of KINDS) { const lim = limitOf(s, k); out[k] = lim === Infinity ? Infinity : Math.max(0, lim - s.used[k]) }
    return out
  }
  const viewOf = (s) => ({ scope: s.scope, limits: { ...s.limits }, used: { ...s.used }, reserved: { ...s.reserved }, warnings: s.warnings, paused: s.paused, perTaskShare: s.perTaskShare, openedAt: s.openedAt })
  const status = () => ({ scopes: scopes.size, kinds: KINDS.slice(), policy: cfg(), paused: [...scopes.values()].filter((s) => s.paused).map((s) => s.scope) })
  const list = () => { const all = [...scopes.values()].map(viewOf); const kept = all.slice(0, listCap); return { items: kept, total: all.length, dropped: all.length - kept.length } }

  /**
   * ROUND 4 (task-28 C): the public projection seam. The DECLARATION (`totals`, `reserveRatio`, `fairnessPolicy`…)
   * is re-resolved from settings at startup and is deliberately absent here; what is projected is what was SPENT,
   * because that is the fact a restart cannot recompute. The internal formatter that used to be called `snapshot`
   * is now `viewOf`, so the projection contract's name is free (the collision is why this seam was missing).
   */
  function snapshot() {
    return {
      apiVersion: 1, face: 'budget', v: 1, at: clock(),
      data: {
        scopes: [...scopes.entries()].map(([key, s]) => [key, {
          scope: s.scope, limits: Object.assign({}, s.limits), used: Object.assign({}, s.used),
          reserved: Object.assign({}, s.reserved), warnings: s.warnings, perTaskShare: s.perTaskShare,
          openedAt: s.openedAt, paused: s.paused, tasks: [...s.tasks.entries()],
        }]),
      },
      counters: {},
      skipped: [],
    }
  }

  /** Put the spending back. Idempotent for the same snapshot; a different one needs `{ replace: true }`. */
  function restore(snap, { replace = false } = {}) {
    checkSnapshot('budget', snap, ['scopes'])
    const incoming = Array.isArray(snap.data.scopes) ? snap.data.scopes : []
    if (scopes.size > 0 && !replace) {
      const same = JSON.stringify([...scopes.entries()].map(([k, s]) => [k, viewOf(s)])) === JSON.stringify(incoming.map(([k, s]) => [k, viewOf(s)]))
      if (same) return { ok: true, restored: [], skipped: [], idempotent: true }
      throw refuse('VMU_RESUME_RESTORE_CONFLICT', 'this ledger already tracks ' + scopes.size + ' scope(s): restoring a different snapshot needs { replace: true }',
        'stop/clear the scopes first, or pass { replace: true } deliberately - losing recorded spending silently is refused by name')
    }
    const skipped = []
    scopes.clear()
    for (const pair of incoming) {
      if (!Array.isArray(pair) || pair.length !== 2 || typeof pair[0] !== 'string' || !pair[1] || typeof pair[1] !== 'object') {
        skipped.push({ what: 'scopes[]', why: 'not a [scope, record] pair' }); continue
      }
      const key = pair[0]
      const raw = pair[1]
      const limits = {}
      for (const k of KINDS) { const v = num((raw.limits || {})[k]); if (v !== null) limits[k] = v }
      const used = {}
      const reserved = {}
      for (const k of KINDS) {
        const u = num((raw.used || {})[k]); used[k] = u === null ? 0 : u
        const rv = num((raw.reserved || {})[k]); reserved[k] = rv === null ? 0 : rv
      }
      const tasks = new Map()
      for (const row of (Array.isArray(raw.tasks) ? raw.tasks : [])) {
        if (!Array.isArray(row) || row.length !== 2) { skipped.push({ what: 'scopes[' + key + '].tasks[]', why: 'not a [key, amount] pair' }); continue }
        const amount = num(row[1]); tasks.set(String(row[0]), amount === null ? 0 : amount)
      }
      scopes.set(key, {
        scope: String(raw.scope || key), limits, used, reserved,
        warnings: Number(raw.warnings) || 0,
        perTaskShare: num(raw.perTaskShare) === null ? 0 : num(raw.perTaskShare),
        openedAt: raw.openedAt === undefined ? clock() : raw.openedAt,
        paused: raw.paused === true,
        tasks,
      })
    }
    return { ok: true, restored: ['scopes'], skipped, counters: {} }
  }

  return { apiVersion, open, charge, reserve, remaining, status, list, snapshot, restore,
    kinds: KINDS.slice(), totals: () => cfg().totals, perTaskShare: () => cfg().perTaskShare }
}

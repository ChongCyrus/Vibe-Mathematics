// vmu kernel budget — four quota classes, reserve, fairness, warn threshold and boundary action.
// Spec: docs/08-primitives-meeting-ballot-workflow.md §4 / §10 / §12.5 (vmu.budget.* family).
// Codes: VMU_BUDGET_SCOPE_UNKNOWN / VMU_BUDGET_RESERVE_EXHAUSTED / VMU_RESOURCE_BUDGET (03-§8).
// Invariants: named refusals WITH current value and limit; counted truncation on list(); zero-config is
// unlimited and never throws; deterministic (only the injected clock); remaining/status/list never mutate.

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
    const l = {}
    for (const k of KINDS) { const v = num(limits[k]); if (v !== null) l[k] = v }
    const s = { scope, limits: l, used: Object.fromEntries(KINDS.map((k) => [k, 0])), reserved: Object.fromEntries(KINDS.map((k) => [k, 0])), warnings: 0, perTaskShare, openedAt: clock(), paused: false }
    scopes.set(scope, s)
    return snapshot(s)
  }

  /** Charge one kind. Named refusal on exhaustion; `onExceed` decides refuse|warn|pause. */
  function charge({ scope, kind, amount = 0 } = {}) {
    const s = need(scope)
    if (!KINDS.includes(kind)) throw refuse('VMU_RESOURCE_BUDGET', 'unknown budget kind: ' + String(kind), 'kinds: ' + KINDS.join('|'), { scope, kind })
    const a = num(amount) ?? 0
    if (a < 0) throw refuse('VMU_RESOURCE_BUDGET', 'amount must be >= 0', 'negative charges are not budget spending', { scope, kind })
    const lim = limitOf(s, kind)
    const used = s.used[kind]
    const c = cfg()
    const next = used + a
    // reserve: the reserved slice is held back; spending into it is refused by name.
    // NOTE: only when a reserve actually exists — otherwise the plain limit check must decide.
    const spendable = lim === Infinity ? Infinity : Math.max(0, lim - s.reserved[kind])
    if (s.reserved[kind] > 0 && next > spendable && lim !== Infinity) {
      const code = 'VMU_BUDGET_RESERVE_EXHAUSTED'
      if (c.onExceed === 'warn') { s.used[kind] = next; s.warnings += 1; log('budget warn (reserve): ' + scope + '/' + kind + ' used=' + next + ' limit=' + lim + ' reserved=' + s.reserved[kind]); return snapshot(s) }
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
      if (bus && typeof bus.emit === 'function') bus.emit('budget/warn', { scope, kind, used: next, limit: lim })
    }
    return snapshot(s)
  }

  /** Reserve a slice of every limited kind (fairness policy reserve). */
  function reserve({ scope, ratio } = {}) {
    const s = need(scope)
    const r = num(ratio) ?? cfg().reserveRatio
    if (r < 0 || r > 1) throw refuse('VMU_RESOURCE_BUDGET', 'reserve ratio must be in 0..1: ' + String(r), 'reserveRatio is a fraction of the limit', { scope })
    for (const k of KINDS) { const lim = limitOf(s, k); s.reserved[k] = lim === Infinity ? 0 : Math.floor(lim * r) }
    return snapshot(s)
  }

  /** Read-only views (must never mutate). */
  const remaining = ({ scope } = {}) => {
    const s = scopes.get(scope)
    if (!s) throw refuse('VMU_BUDGET_SCOPE_UNKNOWN', 'unknown budget scope: ' + String(scope), 'open({scope}) first', { scope })
    const out = {}
    for (const k of KINDS) { const lim = limitOf(s, k); out[k] = lim === Infinity ? Infinity : Math.max(0, lim - s.used[k]) }
    return out
  }
  const snapshot = (s) => ({ scope: s.scope, limits: { ...s.limits }, used: { ...s.used }, reserved: { ...s.reserved }, warnings: s.warnings, paused: s.paused, perTaskShare: s.perTaskShare, openedAt: s.openedAt })
  const status = () => ({ scopes: scopes.size, kinds: KINDS.slice(), policy: cfg(), paused: [...scopes.values()].filter((s) => s.paused).map((s) => s.scope) })
  const list = () => { const all = [...scopes.values()].map(snapshot); const kept = all.slice(0, listCap); return { items: kept, total: all.length, dropped: all.length - kept.length } }

  return { apiVersion, open, charge, reserve, remaining, status, list, kinds: KINDS.slice() }
}

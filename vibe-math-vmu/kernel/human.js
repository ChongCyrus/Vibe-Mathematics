// vmu kernel · human — the HUMAN IN THE LOOP: vetoes, observer visibility, approval waiting and the dashboard
// （docs/17 the human table; docs/08 owns the vote side and is referenced, never redefined）.
//
// WHAT IT IS: the scope a human veto covers, whether a veto must carry a reason, which scopes an observer may see, how long
// an approval may be waited for and what happens when the wait runs out, and how wide the human dashboard is.
//
// THE ONE INVARIANT WORTH STATING: the declared default for an expired approval is `hold` - never `default-allow`. A system
// that quietly allows what nobody approved is the failure this face exists to prevent, so the timeout path is explicit and
// `hold` is what an unconfigured instance does.
//
// FACE CONVENTIONS (same as the other vmu faces): literal key reads; receipts carry enforced[] and fired[]; refusals are
// named; nothing declared means nothing happens; injected clock; read-only surfaces never mutate.
export const apiVersion = 1

export function refuse(code, message, hint, extra) {
  const e = new Error(message)
  e.code = code
  if (hint !== undefined) e.hint = hint
  if (extra !== undefined) e.detail = extra
  return e
}

const str = (v) => (typeof v === 'string' ? v.trim() : '')
const boolOr = (v, d) => (typeof v === 'boolean' ? v : d)
const listOf = (v) => (Array.isArray(v) ? v.filter((x) => typeof x === 'string' && x.trim()).map((x) => x.trim()) : [])
const SCOPE_RANK = Object.freeze({ task: 1, institution: 2, global: 3 })
const TIMEOUT_ACTIONS = Object.freeze(['hold', 'default-deny', 'default-allow'])

export const CODE = Object.freeze({
  vetoScope: 'VMU_HUMAN_VETO_SCOPE',
  vetoReason: 'VMU_HUMAN_VETO_REASON_REQUIRED',
  observerScope: 'VMU_HUMAN_OBSERVER_SCOPE',
  approvalTimeout: 'VMU_HUMAN_APPROVAL_TIMEOUT',
  dashboardScope: 'VMU_HUMAN_DASHBOARD_SCOPE',
})

export function createHuman({ clock = () => 0, log = null, settings = {}, bus = null, listCap = 100 } = {}) {
  if (typeof clock !== 'function') throw refuse('VMU_INVALID_ARGUMENT', 'createHuman needs a clock function', 'pass { clock: () => ms }')
  const sget = (key, def) => {
    if (settings && typeof settings.get === 'function') { const v = settings.get(key); return v === undefined ? def : v }
    if (settings && Object.prototype.hasOwnProperty.call(settings, key)) return settings[key]
    return def
  }
  const say = (ev) => { if (log && typeof log.append === 'function') { try { log.append(ev) } catch (e) { /* logging never breaks the face */ } } }

  const cfg = () => ({
    vetoScope: ['global', 'institution', 'task'].includes(sget('vmu.human.vetoScope')) ? sget('vmu.human.vetoScope') : 'institution',
    vetoNeedsReason: boolOr(sget('vmu.human.vetoNeedsReason'), false),
    observerScopes: listOf(sget('vmu.human.observerScopes')),
    approvalTimeoutMs: (() => { const v = sget('vmu.human.approvalTimeoutMs'); return Number.isFinite(v) && v > 0 ? Math.floor(v) : 0 })(),
    onTimeout: TIMEOUT_ACTIONS.includes(sget('vmu.human.onTimeout')) ? sget('vmu.human.onTimeout') : 'hold',
    dashboardScope: ['global', 'institution'].includes(sget('vmu.human.dashboardScope')) ? sget('vmu.human.dashboardScope') : 'institution',
  })

  const vetoes = []
  const approvals = new Map()   // requestId -> { id, subject, askedAt, decidedAt, decision, reason, pendingReason }
  let dropped = 0
  let seq = 0

  /**
   * Record a human veto. `vetoScope` bounds what it may cover, and `vetoNeedsReason` demands a reason - with the declared
   * allowance that an EMERGENCY veto may supply it afterwards, which is recorded as pending rather than pretended.
   */
  function veto({ by = null, scope = null, target = null, reason = null, emergency = false } = {}) {
    const c = cfg()
    const enforced = ['vmu.human.vetoScope', 'vmu.human.vetoNeedsReason']
    const fired = []
    const asked = str(scope) || c.vetoScope
    if (SCOPE_RANK[asked] === undefined) throw refuse('VMU_INVALID_ARGUMENT', 'unknown veto scope: ' + asked, 'one of global, institution, task', { scope: asked })
    if (SCOPE_RANK[asked] > SCOPE_RANK[c.vetoScope]) {
      fired.push('vmu.human.vetoScope')
      throw refuse(CODE.vetoScope, 'the veto scope exceeds vmu.human.vetoScope: ' + asked + ' > ' + c.vetoScope,
        'narrow the veto to ' + c.vetoScope + ', or raise vmu.human.vetoScope deliberately', { asked, allowed: c.vetoScope, enforced, fired })
    }
    const why = str(reason)
    let pendingReason = false
    if (c.vetoNeedsReason && !why) {
      if (!emergency) {
        fired.push('vmu.human.vetoNeedsReason')
        throw refuse(CODE.vetoReason, 'vmu.human.vetoNeedsReason=true: a veto needs a reason',
          'pass reason, or set emergency:true when the reason follows afterwards', { by: by === null ? null : String(by), enforced, fired })
      }
      pendingReason = true
    }
    const rec = { id: 'veto-' + (++seq), by: by === null ? null : String(by), scope: asked, target: target === null ? null : String(target), reason: why || null, emergency: emergency === true, pendingReason, at: clock() }
    vetoes.push(rec)
    while (vetoes.length > 200) { vetoes.shift(); dropped += 1 }
    say({ type: 'human/veto', at: rec.at, id: rec.id, scope: asked, target: rec.target, pendingReason })
    return { ok: true, veto: Object.assign({}, rec), enforced, fired }
  }

  /** Supplying the reason an emergency veto promised. Only a pending veto accepts one. */
  function explainVeto({ vetoId, reason } = {}) {
    const rec = vetoes.find((x) => x.id === String(vetoId))
    if (!rec) throw refuse('VMU_INVALID_ARGUMENT', 'unknown veto: ' + String(vetoId), 'veto() returns its id', { vetoId: String(vetoId) })
    const why = str(reason)
    if (!why) throw refuse('VMU_INVALID_ARGUMENT', 'explainVeto needs a reason', 'pass { reason }')
    rec.reason = why
    rec.pendingReason = false
    return { ok: true, vetoId: rec.id, reason: why, enforced: ['vmu.human.vetoNeedsReason'], fired: [] }
  }

  /**
   * What an observer may see. An EMPTY list means nothing is visible (zero mechanism); a non-empty list is enforced.
   * This face decides visibility only - the data itself belongs to the faces that own it.
   */
  function observerView({ scope = null } = {}) {
    const c = cfg()
    const enforced = ['vmu.human.observerScopes']
    const asked = str(scope)
    if (c.observerScopes.length === 0) {
      return { ok: true, scope: asked || null, visible: false, scopes: [], note: 'no observer scopes are declared, so nothing is visible (zero mechanism)', enforced, fired: ['vmu.human.observerScopes'] }
    }
    if (!asked || !c.observerScopes.includes(asked)) {
      throw refuse(CODE.observerScope, 'observer scope is not declared: ' + (asked || '(none)'),
        'declared: ' + c.observerScopes.join(', ') + ' (vmu.human.observerScopes)', { asked: asked || null, declared: c.observerScopes.slice(), enforced, fired: ['vmu.human.observerScopes'] })
    }
    return { ok: true, scope: asked, visible: true, scopes: c.observerScopes.slice(), enforced, fired: [] }
  }

  /** Open an approval wait. `approvalTimeoutMs` = 0 means wait indefinitely, which is the declared default. */
  function openApproval({ subject, requestId = null } = {}) {
    const c = cfg()
    const id = str(requestId) || ('approval-' + (++seq))
    const rec = { id, subject: subject === null || subject === undefined ? null : String(subject), askedAt: clock(), decidedAt: null, decision: null, reason: null, pendingReason: null }
    approvals.set(id, rec)
    return { ok: true, id, subject: rec.subject, askedAt: rec.askedAt, timeoutMs: c.approvalTimeoutMs, onTimeout: c.onTimeout, enforced: ['vmu.human.approvalTimeoutMs', 'vmu.human.onTimeout'], fired: [] }
  }

  /**
   * Read the state of an approval at a moment. When the wait has run out the DECLARED action decides: `hold` keeps it
   * pending, `default-deny` refuses, `default-allow` grants - and `hold` is the default, never an allow.
   */
  function approvalState({ requestId, at = null } = {}) {
    const c = cfg()
    const rec = approvals.get(String(requestId))
    if (!rec) throw refuse('VMU_INVALID_ARGUMENT', 'unknown approval: ' + String(requestId), 'openApproval returns its id', { requestId: String(requestId) })
    const enforced = ['vmu.human.approvalTimeoutMs', 'vmu.human.onTimeout']
    const now = Number.isFinite(at) ? Number(at) : clock()
    if (rec.decidedAt !== null) return { ok: true, id: rec.id, state: rec.decision, decidedAt: rec.decidedAt, expired: false, enforced, fired: [] }
    if (c.approvalTimeoutMs === 0) return { ok: true, id: rec.id, state: 'pending', expired: false, waitsForever: true, enforced, fired: [] }
    const expired = (now - rec.askedAt) >= c.approvalTimeoutMs
    if (!expired) return { ok: true, id: rec.id, state: 'pending', expired: false, remainingMs: c.approvalTimeoutMs - (now - rec.askedAt), enforced, fired: [] }
    const fired = ['vmu.human.onTimeout']
    if (c.onTimeout === 'hold') return { ok: true, id: rec.id, state: 'pending', expired: true, heldOnTimeout: true, onTimeout: 'hold', note: 'the declared timeout action is hold: it stays pending, it is never silently allowed', enforced, fired }
    if (c.onTimeout === 'default-deny') return { ok: false, id: rec.id, state: 'denied', expired: true, onTimeout: 'default-deny', error: refuse(CODE.approvalTimeout, 'the approval wait expired and vmu.human.onTimeout=default-deny', 'decide it explicitly, or change the declared action', { id: rec.id, enforced, fired }) }
    return { ok: true, id: rec.id, state: 'allowed-on-timeout', expired: true, onTimeout: 'default-allow', enforced, fired }
  }

  /** A human decides. */
  function decide({ requestId, allow, reason = null } = {}) {
    const rec = approvals.get(String(requestId))
    if (!rec) throw refuse('VMU_INVALID_ARGUMENT', 'unknown approval: ' + String(requestId), 'openApproval returns its id', { requestId: String(requestId) })
    rec.decidedAt = clock()
    rec.decision = allow === true ? 'allowed' : 'denied'
    rec.reason = reason === null ? null : String(reason)
    return { ok: true, id: rec.id, decision: rec.decision, decidedAt: rec.decidedAt, enforced: ['vmu.human.approvalTimeoutMs'], fired: [] }
  }

  /** How wide the dashboard is. Asking for more than `dashboardScope` allows is refused by name. */
  function dashboard({ scope = null } = {}) {
    const c = cfg()
    const enforced = ['vmu.human.dashboardScope']
    const asked = str(scope) || c.dashboardScope
    if (SCOPE_RANK[asked] === undefined || SCOPE_RANK[asked] < 2) throw refuse('VMU_INVALID_ARGUMENT', 'dashboard scope must be global or institution: ' + asked, 'one of global, institution', { asked })
    if (SCOPE_RANK[asked] > SCOPE_RANK[c.dashboardScope]) {
      throw refuse(CODE.dashboardScope, 'the dashboard scope exceeds vmu.human.dashboardScope: ' + asked + ' > ' + c.dashboardScope,
        'narrow it to ' + c.dashboardScope + ', or raise the key deliberately', { asked, allowed: c.dashboardScope, enforced, fired: ['vmu.human.dashboardScope'] })
    }
    return { ok: true, scope: asked, allowed: c.dashboardScope, enforced, fired: [] }
  }

  const status = () => ({
    ok: true,
    vetoes: vetoes.length, pendingReasons: vetoes.filter((v) => v.pendingReason).length,
    approvals: approvals.size, dropped,
    policy: cfg(),
    neverAllowsBySilence: cfg().onTimeout !== 'default-allow',
    timeoutIsExplicit: true,
    readsArePure: true,
    at: clock(),
    listCap,
  })

  return { apiVersion, veto, explainVeto, observerView, openApproval, approvalState, decide, dashboard, status }
}

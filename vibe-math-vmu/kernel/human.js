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
//
// ROUND 3 (task-18 A): the face now has a DURABLE projection seam. The approval queue and the veto ledger were
// session memory, so a restart silently lost "an action is still waiting for a human" and every veto reason that
// was promised afterwards. `snapshot()`/`restore(snap)` put them under the `human` durable key (assembled by
// `resume.attachProjection({target: human, key: 'human', mode: 'state', …})`), and `checkSnapshot` is the shared
// validator — this face does not invent a second code set.
import { checkSnapshot } from './resume.js'
import { idNumber } from './ids.js'

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
  // ROUND 2 — the approval GATE (docs/17 §19): an undeclared action runs; a gated action queues until a human
  // decides. These codes are what makes the queue a real interception instead of a label.
  approvalPending: 'VMU_HUMAN_APPROVAL_PENDING',
  approvalDenied: 'VMU_HUMAN_APPROVAL_DENIED',
  vetoed: 'VMU_HUMAN_VETOED',
  defaultAllowNotAcknowledged: 'VMU_HUMAN_DEFAULT_ALLOW_NOT_ACKNOWLEDGED',
  queueFull: 'VMU_HUMAN_QUEUE_FULL',
  liftRole: 'VMU_HUMAN_LIFT_ROLE',
  liftReason: 'VMU_HUMAN_LIFT_REASON_REQUIRED',
  dashboardDomain: 'VMU_HUMAN_DASHBOARD_DOMAIN',
})

/** Domains that may NEVER be shown, whatever is declared: the private face stays private (G5/D6). */
export const PRIVATE_DOMAINS = Object.freeze(['private', 'dm', 'direct-message', 'secret'])

/**
 * Wrap the named mutating methods of a service so every call first passes through the human approval gate.
 * The gate THROWS its named refusal (`VMU_HUMAN_APPROVAL_PENDING` with `detail.queued=true`), so the wrapped
 * action does NOT run — it is queued, which is what "the human decides" has to mean (S-5).
 *
 * Returns `{ wrapped, missing, unwrap }`: a method name that does not exist is REPORTED, never silently skipped.
 */
export function attachApprovalGate({ target, methods = [], gate, subjectOf = null, byRoleOf = null, face = null } = {}) {
  if (!target || typeof target !== 'object') throw refuse('VMU_INVALID_ARGUMENT', 'attachApprovalGate needs a target object')
  if (typeof gate !== 'function') throw refuse('VMU_INVALID_ARGUMENT', 'attachApprovalGate needs the gate function', 'pass gate: human.gate')
  // The action name is QUALIFIED (`tasks.create`), because `open`/`close`/`cast` exist on several faces and an
  // unqualified name would make `vmu.human.gatedActions` ambiguous.
  const qualifier = str(face) ? str(face) + '.' : ''
  const wrapped = []
  const missing = []
  const originals = new Map()
  for (const name of (Array.isArray(methods) ? methods : []).filter((m) => typeof m === 'string' && m.trim())) {
    const original = target[name]
    if (typeof original !== 'function') { missing.push(name); continue }
    originals.set(name, original)
    target[name] = function gatedMethod(...args) {
      const req = {
        action: qualifier + name,
        subject: typeof subjectOf === 'function' ? subjectOf(name, args[0]) : (args[0] && args[0].id ? String(args[0].id) : null),
        byRole: typeof byRoleOf === 'function' ? byRoleOf(name, args) : null,
      }
      gate(req)   // throws the named refusal when the action may not proceed
      return original.apply(this, args)
    }
    wrapped.push(name)
  }
  return {
    wrapped,
    missing,
    qualified: wrapped.map((n) => qualifier + n),
    unwrap() { for (const [name, original] of originals) target[name] = original; return wrapped.slice() },
  }
}

export function createHuman({ clock = () => 0, log = null, settings = {}, bus = null, listCap = 100 } = {}) {
  if (typeof clock !== 'function') throw refuse('VMU_INVALID_ARGUMENT', 'createHuman needs a clock function', 'pass { clock: () => ms }')
  const sget = (key, def) => {
    if (settings && typeof settings.get === 'function') { const v = settings.get(key); return v === undefined ? def : v }
    if (settings && Object.prototype.hasOwnProperty.call(settings, key)) return settings[key]
    return def
  }
  const say = (ev) => { if (log && typeof log.append === 'function') { try { log.append(ev) } catch (e) { /* logging never breaks the face */ } } }
  // A broadcast is what makes "the veto is in force NOW" observable to middleware, not only readable from a log.
  // Hook producers pass the NAME first (`kernel/bus.js` refuses a non-string hook) and catch the async rejection
  // on the promise: an object-shaped emit is swallowed by the bus and never reaches any middleware.
  const emit = (name, payload) => {
    if (!bus || typeof bus.emit !== 'function') return null
    try {
      const r = bus.emit(name, payload)
      if (r && typeof r.catch === 'function') r.catch(() => {})
      return r
    } catch (e) { return null }
  }

  const cfg = () => ({
    vetoScope: ['global', 'institution', 'task'].includes(sget('vmu.human.vetoScope')) ? sget('vmu.human.vetoScope') : 'institution',
    vetoNeedsReason: boolOr(sget('vmu.human.vetoNeedsReason'), false),
    observerScopes: listOf(sget('vmu.human.observerScopes')),
    approvalTimeoutMs: (() => { const v = sget('vmu.human.approvalTimeoutMs'); return Number.isFinite(v) && v > 0 ? Math.floor(v) : 0 })(),
    onTimeout: TIMEOUT_ACTIONS.includes(sget('vmu.human.onTimeout')) ? sget('vmu.human.onTimeout') : 'hold',
    dashboardScope: ['global', 'institution'].includes(sget('vmu.human.dashboardScope')) ? sget('vmu.human.dashboardScope') : 'institution',
    // ROUND 2 (the gate). `gatedActions: []` is the zero-mechanism default: with nothing declared, NO action is
    // gated and every caller behaves exactly as before.
    gatedActions: listOf(sget('vmu.human.gatedActions')),
    queueCap: (() => { const v = Number(sget('vmu.human.approvalQueueCap')); return Number.isInteger(v) && v > 0 ? v : 100 })(),
    defaultAllowAcknowledged: boolOr(sget('vmu.human.defaultAllowAcknowledged'), false),
    dashboardDomains: listOf(sget('vmu.human.dashboardDomains')),
    vetoLiftRoles: listOf(sget('vmu.human.vetoLiftRoles')).length ? listOf(sget('vmu.human.vetoLiftRoles')) : ['office'],
  })

  const vetoes = []
  const approvals = new Map()   // requestId -> { id, subject, askedAt, decidedAt, decision, reason, pendingReason }
  const gateIndex = new Map()    // action + '\u0000' + subject -> requestId (so repeated attempts queue ONCE)
  let dropped = 0
  let seq = 0
  let queueDropped = 0
  let gateAttempts = 0
  let gateQueued = 0
  let gateAllowed = 0
  let gateDenied = 0

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
    emit('human/vetoed', { at: rec.at, id: rec.id, scope: asked, target: rec.target, by: rec.by, pendingReason })
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

  /** A human decides. A denial takes effect IMMEDIATELY, is broadcast, and may carry its reason later. */
  function decide({ requestId, allow, reason = null, by = null } = {}) {
    const rec = approvals.get(String(requestId))
    if (!rec) throw refuse('VMU_INVALID_ARGUMENT', 'unknown approval: ' + String(requestId), 'openApproval returns its id', { requestId: String(requestId) })
    rec.decidedAt = clock()
    rec.decision = allow === true ? 'allowed' : 'denied'
    rec.reason = reason === null ? null : String(reason)
    rec.decidedBy = by === null ? null : String(by)
    // A denial with no reason is recorded as PENDING, exactly like an emergency veto: a decision that must be
    // justified later is written down as unjustified, never dressed up as complete.
    if (rec.decision === 'denied' && !str(rec.reason)) rec.pendingReason = true
    say({ type: 'human/decided', at: rec.decidedAt, id: rec.id, decision: rec.decision, by: rec.decidedBy, pendingReason: !!rec.pendingReason })
    emit('human/approval-decided', { at: rec.decidedAt, id: rec.id, decision: rec.decision, by: rec.decidedBy })
    return { ok: true, id: rec.id, decision: rec.decision, decidedAt: rec.decidedAt, decidedBy: rec.decidedBy, pendingReason: !!rec.pendingReason, enforced: ['vmu.human.approvalTimeoutMs'], fired: [] }
  }

  /** Fill in a reason that was promised afterwards — for an emergency veto OR a denial. */
  function explainDecision({ vetoId = null, requestId = null, reason = null } = {}) {
    const why = str(reason)
    if (!why) throw refuse('VMU_INVALID_ARGUMENT', 'explaining a decision needs a reason', 'pass { reason }')
    if (vetoId !== null && vetoId !== undefined && vetoId !== '') {
      const rec = vetoes.find((x) => x.id === String(vetoId))
      if (!rec) throw refuse('VMU_INVALID_ARGUMENT', 'unknown veto: ' + String(vetoId), 'veto() returns its id', { vetoId: String(vetoId) })
      rec.reason = why
      rec.pendingReason = false
      return { ok: true, vetoId: rec.id, reason: why, enforced: ['vmu.human.vetoNeedsReason'], fired: [] }
    }
    const rec = approvals.get(String(requestId))
    if (!rec) throw refuse('VMU_INVALID_ARGUMENT', 'unknown approval: ' + String(requestId), 'openApproval returns its id', { requestId: String(requestId) })
    rec.reason = why
    rec.pendingReason = false
    return { ok: true, requestId: rec.id, reason: why, enforced: ['vmu.human.approvalTimeoutMs'], fired: [] }
  }

  /**
   * Lift a veto. A veto that can never be lifted would be a permanent, unreviewed block; lifting is therefore a
   * named, reasoned, logged act restricted to `vmu.human.vetoLiftRoles`.
   */
  function liftVeto({ vetoId, by = null, reason = null } = {}) {
    const c = cfg()
    const rec = vetoes.find((x) => x.id === String(vetoId))
    if (!rec) throw refuse('VMU_INVALID_ARGUMENT', 'unknown veto: ' + String(vetoId), 'veto() returns its id', { vetoId: String(vetoId) })
    if (rec.liftedAt) return { ok: true, vetoId: rec.id, alreadyLifted: true, liftedAt: rec.liftedAt }
    const role = str(by)
    if (!role || !c.vetoLiftRoles.includes(role)) {
      throw refuse(CODE.liftRole, 'this role may not lift a veto: ' + (role || '(none)'),
        'may lift: ' + c.vetoLiftRoles.join(', ') + ' (vmu.human.vetoLiftRoles)', { byRole: role || null, declared: c.vetoLiftRoles.slice() })
    }
    const why = str(reason)
    if (!why) throw refuse(CODE.liftReason, 'lifting a veto needs a reason', 'pass { reason } - the lift is auditable')
    rec.liftedAt = clock()
    rec.liftedBy = role
    rec.liftReason = why
    say({ type: 'human/veto-lifted', at: rec.liftedAt, id: rec.id, by: role })
    emit('human/veto-lifted', { at: rec.liftedAt, id: rec.id, by: role })
    return { ok: true, vetoId: rec.id, liftedAt: rec.liftedAt, liftedBy: role, enforced: ['vmu.human.vetoLiftRoles'], fired: [] }
  }

  // ── the approval GATE (ROUND 2 / docs/17 §19) ──────────────────────────────────────────────────────────────
  // What makes the human table a MECHANISM instead of a label: a gated action does not run while no human has
  // approved it. The gate returns a DECISION object, and `gate()` turns the same decision into a thrown refusal,
  // so any call site can use whichever shape it needs.
  function approvalDecision({ action = null, subject = null, byRole = null, scope = null, at = null } = {}) {
    const c = cfg()
    const act = str(action)
    if (!act) throw refuse('VMU_INVALID_ARGUMENT', 'the gate needs an action name', 'e.g. gate({ action: "task.create" })')
    const subj = subject === null || subject === undefined ? null : String(subject)
    const reqScope = SCOPE_RANK[str(scope)] !== undefined ? str(scope) : 'institution'
    const standing = vetoes.filter((x) => !x.liftedAt && SCOPE_RANK[x.scope] >= SCOPE_RANK[reqScope]
      && (x.target === null || String(x.target) === subj))[0]
    if (standing) {
      gateDenied += 1
      return { ok: false, code: CODE.vetoed, gated: true, action: act, subject: subj,
        veto: { id: standing.id, by: standing.by, scope: standing.scope, target: standing.target, reason: standing.reason, pendingReason: !!standing.pendingReason, at: standing.at },
        message: 'the action is vetoed by ' + standing.id + (standing.pendingReason ? ' (its reason is still pending)' : ''), enforced: ['vmu.human.vetoScope'], fired: [CODE.vetoed] }
    }
    if (c.gatedActions.indexOf(act) === -1) {
      gateAllowed += 1
      return { ok: true, allowed: true, gated: false, action: act, subject: subj,
        note: 'this action is not in vmu.human.gatedActions: nothing is gated (zero mechanism)', enforced: [], fired: [] }
    }
    const key = act + '\u0000' + String(subj)
    let id = gateIndex.get(key)
    let rec = id ? approvals.get(id) : null
    if (!rec) {
      if (approvals.size >= c.queueCap) {
        gateDenied += 1
        queueDropped += 1
        return { ok: false, code: CODE.queueFull, gated: true, action: act, subject: subj,
          message: 'the approval queue is full (' + c.queueCap + '): the action is NOT queued and NOT run',
          hint: 'decide() or liftVeto() the pending requests first (vmu.human.approvalQueueCap)', enforced: ['vmu.human.approvalQueueCap'], fired: [CODE.queueFull] }
      }
      id = 'approval-' + (++seq)
      rec = { id, action: act, subject: subj, askedAt: Number.isFinite(at) ? Number(at) : clock(), decidedAt: null, decision: null, reason: null, pendingReason: null, attempts: 0, decidedBy: null }
      approvals.set(id, rec)
      gateIndex.set(key, id)
      say({ type: 'human/approval-asked', at: rec.askedAt, id, action: act, subject: subj })
      emit('human/approval-asked', { at: rec.askedAt, id, action: act, subject: subj })
      emit('human/gate-pending', { at: rec.askedAt, id, action: act, subject: subj })
    }
    rec.attempts += 1
    gateAttempts += 1
    const base = { gated: true, action: act, subject: subj, requestId: id, attempts: rec.attempts, timeoutMs: c.approvalTimeoutMs, onTimeout: c.onTimeout,
      enforced: ['vmu.human.gatedActions', 'vmu.human.approvalTimeoutMs', 'vmu.human.onTimeout'], fired: [] }
    if (rec.decidedAt !== null && rec.decision === 'allowed') { gateAllowed += 1; return Object.assign({ ok: true, allowed: true, state: 'allowed', decidedAt: rec.decidedAt }, base) }
    if (rec.decidedAt !== null) {
      gateDenied += 1
      return Object.assign({ ok: false, code: CODE.approvalDenied, state: 'denied', reason: rec.reason, pendingReason: !!rec.pendingReason,
        message: 'a human DENIED this action' + (rec.reason ? ': ' + rec.reason : ' (reason still pending)') }, base)
    }
    const nowMs = Number.isFinite(at) ? Number(at) : clock()
    if (c.approvalTimeoutMs === 0) {
      gateQueued += 1
      return Object.assign({ ok: false, code: CODE.approvalPending, queued: true, state: 'pending', waitsForever: true,
        message: 'the action is QUEUED: no human has approved it, and the wait is declared as indefinite',
        hint: 'a human calls decide({ requestId, allow: true }); the action is not executed until then' }, base)
    }
    const expired = (nowMs - rec.askedAt) >= c.approvalTimeoutMs
    if (!expired) {
      gateQueued += 1
      return Object.assign({ ok: false, code: CODE.approvalPending, queued: true, state: 'pending', expiresInMs: c.approvalTimeoutMs - (nowMs - rec.askedAt),
        message: 'the action is QUEUED: no human has approved it yet',
        hint: 'a human calls decide({ requestId, allow: true }); the action is not executed until then' }, base)
    }
    if (c.onTimeout === 'default-deny') {
      gateDenied += 1
      return Object.assign({ ok: false, code: CODE.approvalTimeout, expired: true, state: 'denied',
        message: 'the approval wait expired and vmu.human.onTimeout=default-deny',
        hint: 'decide it explicitly, or change the declared action' }, base)
    }
    if (c.onTimeout === 'default-allow' && c.defaultAllowAcknowledged === true) {
      gateAllowed += 1
      return Object.assign({ ok: true, allowed: true, state: 'allowed-on-timeout', expired: true,
        note: 'the declared timeout action allows, and vmu.human.defaultAllowAcknowledged=true acknowledges it' }, base)
    }
    if (c.onTimeout === 'default-allow') {
      gateDenied += 1
      return Object.assign({ ok: false, code: CODE.defaultAllowNotAcknowledged, expired: true, queued: true, state: 'pending', heldOnTimeout: true,
        message: 'vmu.human.onTimeout=default-allow but vmu.human.defaultAllowAcknowledged is false: the action stays QUEUED (silence never allows)',
        hint: 'set vmu.human.defaultAllowAcknowledged=true deliberately, or decide it explicitly' }, base)
    }
    gateQueued += 1
    return Object.assign({ ok: false, code: CODE.approvalPending, queued: true, state: 'pending', expired: true, heldOnTimeout: true,
      message: 'the wait expired and the declared timeout action is hold: it stays QUEUED (never silently allowed)',
      hint: 'a human calls decide({ requestId, allow: true })' }, base)
  }

  /** The drop-in form used at call sites: throws the named refusal unless the action may proceed. */
  function gate(req) {
    const d = approvalDecision(req)
    if (d.ok === true) return d
    const hint = d.hint || (d.queued ? 'a human calls decide({ requestId: "' + d.requestId + '", allow: true }) - the action is NOT executed until then' : 'a human vetoed this action; lift it by name (liftVeto) after reviewing it')
    throw refuse(d.code, d.message || ('the action may not proceed: ' + d.code), hint, d)
  }

  /** The queue a human sees: what is waiting, who asked, how long, and how many attempts it took. */
  function queue() {
    const rows = [...approvals.values()].map((r) => ({
      requestId: r.id, action: r.action || null, subject: r.subject === undefined ? null : r.subject,
      askedAt: r.askedAt, attempts: r.attempts || 0, state: r.decidedAt === null ? 'pending' : r.decision,
      decidedAt: r.decidedAt, decidedBy: r.decidedBy || null, reason: r.reason, pendingReason: !!r.pendingReason,
    }))
    const shown = rows.slice(-listCap)
    return { ok: true, total: rows.length, pending: rows.filter((r) => r.state === 'pending').length, shown: shown.length,
      dropped: rows.length - shown.length, queueCap: cfg().queueCap, requests: shown, enforced: ['vmu.human.gatedActions', 'vmu.human.approvalQueueCap'], fired: [] }
  }

  /** How wide the dashboard is. Asking for more than `dashboardScope` allows is refused by name. */
  function dashboard({ scope = null, domains = null } = {}) {
    const c = cfg()
    const enforced = ['vmu.human.dashboardScope', 'vmu.human.dashboardDomains']
    const asked = str(scope) || c.dashboardScope
    if (SCOPE_RANK[asked] === undefined || SCOPE_RANK[asked] < 2) throw refuse('VMU_INVALID_ARGUMENT', 'dashboard scope must be global or institution: ' + asked, 'one of global, institution', { asked })
    if (SCOPE_RANK[asked] > SCOPE_RANK[c.dashboardScope]) {
      throw refuse(CODE.dashboardScope, 'the dashboard scope exceeds vmu.human.dashboardScope: ' + asked + ' > ' + c.dashboardScope,
        'narrow it to ' + c.dashboardScope + ', or raise the key deliberately', { asked, allowed: c.dashboardScope, enforced, fired: ['vmu.human.dashboardScope'] })
    }
    const wanted = Array.isArray(domains) ? domains.map(String).filter(Boolean) : []
    const privateAsked = wanted.filter((d) => PRIVATE_DOMAINS.includes(d.toLowerCase()))
    if (privateAsked.length) {
      throw refuse(CODE.dashboardDomain, 'the private face is never visible on the dashboard: ' + privateAsked.join(', '),
        'private/dm/secret domains are excluded by construction (G5/D6); ask the parties to record it publicly instead',
        { asked: privateAsked, enforced, fired: [CODE.dashboardDomain] })
    }
    const undeclared = wanted.filter((d) => !c.dashboardDomains.includes(d))
    if (undeclared.length) {
      throw refuse(CODE.dashboardDomain, 'dashboard domain(s) are not declared: ' + undeclared.join(', '),
        'declared: ' + (c.dashboardDomains.join(', ') || '(none: aggregate counts only)') + ' (vmu.human.dashboardDomains)',
        { undeclared, declared: c.dashboardDomains.slice(), enforced, fired: [CODE.dashboardDomain] })
    }
    return { ok: true, scope: asked, allowed: c.dashboardScope, domains: wanted, declared: c.dashboardDomains.slice(), enforced, fired: [] }
  }

  /**
   * A pure snapshot of the HUMAN LEDGER: the vetoes (including a promised-but-unwritten reason), the approvals
   * (pending, decided, attempts, `pendingReason`) and the id counter. The gate's decision counters and the
   * declared policy are NOT here: policy comes from settings, counters are statistics.
   */
  function snapshot() {
    const ids = [...approvals.keys()].map((k) => idNumber(k) || 0).concat(vetoes.map((v) => idNumber(v.id) || 0))
    return {
      apiVersion: 1, face: 'human', v: 1, at: clock(),
      data: {
        vetoes: vetoes.map((v) => JSON.parse(JSON.stringify(v))),
        approvals: [...approvals.entries()].map(([id, rec]) => [id, JSON.parse(JSON.stringify(rec))]),
      },
      counters: { human: Math.max(seq, ...(ids.length ? ids : [0])) },
      skipped: [],
    }
  }

  /**
   * Put the human ledger back. Idempotent for the same snapshot; a DIFFERENT snapshot against live state needs
   * `{ replace: true }`, because a silent half-overwrite of "who is still waiting for a human" is the failure this
   * refusal exists to prevent.
   */
  function restore(snap, { replace = false } = {}) {
    checkSnapshot('human', snap, ['vetoes', 'approvals'])
    const inVetoes = Array.isArray(snap.data.vetoes) ? snap.data.vetoes : []
    const inApprovals = Array.isArray(snap.data.approvals) ? snap.data.approvals : []
    if ((vetoes.length > 0 || approvals.size > 0) && !replace) {
      const sameVetoes = JSON.stringify(vetoes) === JSON.stringify(inVetoes)
      const sameApprovals = JSON.stringify([...approvals.entries()]) === JSON.stringify(inApprovals)
      if (sameVetoes && sameApprovals) return { ok: true, restored: [], skipped: [], idempotent: true, counters: { human: seq } }
      throw refuse('VMU_RESUME_RESTORE_CONFLICT', 'this human ledger already holds ' + vetoes.length + ' veto(es) and ' + approvals.size + ' request(s): restoring a different snapshot needs { replace: true }',
        'stop/clear the ledger first, or pass { replace: true } deliberately - losing a pending approval silently is refused by name')
    }
    const skipped = []
    vetoes.length = 0
    for (const v of inVetoes) {
      if (!v || typeof v.id !== 'string') { skipped.push({ what: 'vetoes[]', why: 'an entry without a string id' }); continue }
      vetoes.push(JSON.parse(JSON.stringify(v)))
    }
    approvals.clear()
    gateIndex.clear()
    for (const pair of inApprovals) {
      if (!Array.isArray(pair) || pair.length !== 2 || typeof pair[0] !== 'string' || !pair[1] || typeof pair[1] !== 'object') {
        skipped.push({ what: 'approvals[]', why: 'not a [requestId, record] pair' }); continue
      }
      const id = pair[0]
      const rec = JSON.parse(JSON.stringify(pair[1]))
      approvals.set(id, rec)
      // The queue index must be rebuilt, or a restarted process would queue a SECOND request for the same action
      // (the exact "one action, two requests" drift the gate's idempotence exists to prevent).
      if (rec.action) gateIndex.set(String(rec.action) + '\u0000' + String(rec.subject === undefined ? null : rec.subject), id)
      if (!rec.id) { rec.id = id; skipped.push({ what: 'approvals[' + id + '].id', why: 'rebuilt from the map key' }) }
    }
    // The id counter takes the MAX of the snapshot counter and the ids that actually exist, so a restart can never
    // hand out `approval-1` / `veto-1` twice.
    const declared = Number((snap.counters || {}).human)
    const observed = [...approvals.keys()].concat(vetoes.map((v) => v.id)).reduce((mx, id) => Math.max(mx, idNumber(id) || 0), 0)
    seq = Math.max(Number.isInteger(declared) ? declared : 0, observed)
    return { ok: true, restored: ['vetoes', 'approvals'], skipped, counters: { human: seq } }
  }

  const status = () => ({
    ok: true,
    vetoes: vetoes.length, pendingReasons: vetoes.filter((v) => v.pendingReason).length,
    activeVetoes: vetoes.filter((v) => !v.liftedAt).length, liftedVetoes: vetoes.filter((v) => !!v.liftedAt).length,
    approvals: approvals.size, dropped,
    // ROUND 2 — the gate's observable surface. `queue` is what a human actually reads before deciding.
    queue: queue(),
    gatedActions: cfg().gatedActions.slice(),
    gateAttempts, gateQueued, gateAllowed, gateDenied, queueDropped, queueCap: cfg().queueCap,
    policy: cfg(),
    neverAllowsBySilence: cfg().onTimeout !== 'default-allow',
    // The GATE is stricter than the display: default-allow only applies to a gated action when it was
    // acknowledged deliberately (`vmu.human.defaultAllowAcknowledged=true`).
    gateNeverAllowsBySilence: cfg().onTimeout !== 'default-allow' || cfg().defaultAllowAcknowledged !== true,
    timeoutIsExplicit: true,
    readsArePure: true,
    at: clock(),
    listCap,
  })

  return { apiVersion, veto, explainVeto, explainDecision, liftVeto, observerView, openApproval, approvalState,
    decide, queue, approvalDecision, gate, dashboard, snapshot, restore,
    /** Adapter convenience: the rows a projection reconciles ids against. */
    list: () => queue().requests,
    status }
}

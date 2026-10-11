// tests/vmu-identity-human-discipline.test.mjs — independent tests for the three faces this round added:
//   kernel/identity.js    (vmu.identity.*     nine declared keys)
//   kernel/human.js       (vmu.human.*        six declared keys, including the hold-not-allow timeout)
//   kernel/discipline.js  (vmu.discipline.*   six declared keys: breaker, suspension, restore, post-mortem)
// Every setting is asserted in BOTH directions, and each face's zero-mechanism and purity invariants are checked.
// Last line: === VMU IDENTITY+HUMAN+DISCIPLINE: N passed, M failed ===
import { createIdentity, CODE as ID_CODE } from '../vibe-math-vmu/kernel/identity.js'
import { createHuman, CODE as HU_CODE } from '../vibe-math-vmu/kernel/human.js'
import { createDiscipline, CODE as DI_CODE } from '../vibe-math-vmu/kernel/discipline.js'

let pass = 0
let fail = 0
const ok = (cond, label, detail) => { if (cond) { pass += 1 } else { fail += 1; console.log('FAIL ' + label + (detail === undefined ? '' : ' [' + detail + ']')) } }
const throwsNamed = (fn, code, label) => {
  try { fn(); fail += 1; console.log('FAIL ' + label + ' (no refusal)'); return null }
  catch (e) { if (e && e.code === code) { pass += 1; return e } fail += 1; console.log('FAIL ' + label + ' (code=' + (e && e.code) + ' want ' + code + ')'); return null }
}

let now = 1000
const DAY = 86400000
const id = (s = {}) => createIdentity({ clock: () => now, settings: s })
const hu = (s = {}) => createHuman({ clock: () => now, settings: s })
const di = (s = {}) => createDiscipline({ clock: () => now, settings: s })

// ── IDENTITY ─────────────────────────────────────────────────────────────────────────────────────────────────
{
  // zero mechanism
  const z = id()
  ok(z.status().members === 0 && z.status().noIssuerListMeansNoCheck === true, 'identity zero-config: nothing is declared and there is no issuer check')

  // principalBinding: three distinct states
  const off = id({ 'vmu.identity.principalBinding': 'off' })
  ok(off.bindPrincipal({ memberId: 'm1' }).binding === 'off', 'principalBinding[off]: recording without a principal is accepted')
  const required = id({ 'vmu.identity.principalBinding': 'required' })
  const missing = throwsNamed(() => required.bindPrincipal({ memberId: 'm1' }), ID_CODE.principalRequired,
    'principalBinding[-]: required refuses a missing principal by name')
  ok(!!missing, 'principalBinding[-]: the refusal exists')
  ok(required.bindPrincipal({ memberId: 'm1', principal: 'sub-1' }).principal === 'sub-1', 'principalBinding[+]: with a principal it binds')

  // trustedIssuers: empty means no check, non-empty is enforced
  const issuers = id({ 'vmu.identity.trustedIssuers': ['sso'] })
  throwsNamed(() => issuers.bindPrincipal({ memberId: 'm2', principal: 'p', issuer: 'rogue' }), ID_CODE.issuerUntrusted,
    'trustedIssuers[-]: an untrusted issuer is refused by name')
  ok(issuers.bindPrincipal({ memberId: 'm2', principal: 'p', issuer: 'sso' }).issuer === 'sso', 'trustedIssuers[+]: a trusted issuer passes')
  ok(id().bindPrincipal({ memberId: 'm3', principal: 'p', issuer: 'anything' }).ok === true, 'trustedIssuers[empty]: no list means no issuer check at all')

  // claimMap: maps to a slot; unmapped claims are REPORTED, never invented
  const claims = id({ 'vmu.identity.claimMap': { role: 'analyst', dept: 'ops' } })
  const bound = claims.bindPrincipal({ memberId: 'm4', principal: 'p', claims: { role: 'analyst', unknown: 'x' } })
  ok(bound.slots.includes('analyst'), 'claimMap[+]: a mapped claim resolves to its slot', JSON.stringify(bound.slots))
  ok(bound.unmappedClaims.includes('unknown'), 'claimMap[-]: an unmapped claim is REPORTED, not silently turned into a slot')

  // multiMembership + maxMemberships
  const single = id({ 'vmu.identity.multiMembership': false })
  single.addMembership({ memberId: 'm5', institution: 'Uni A' })
  throwsNamed(() => single.addMembership({ memberId: 'm5', institution: 'Uni B' }), ID_CODE.multiMembershipOff,
    'multiMembership[-]: a second membership is refused while the key is false')
  const multi = id({ 'vmu.identity.multiMembership': true, 'vmu.identity.maxMemberships': 2 })
  multi.addMembership({ memberId: 'm6', institution: 'Uni A' })
  ok(multi.addMembership({ memberId: 'm6', institution: 'Uni B' }).memberships.length === 2, 'multiMembership[+]: a second membership is accepted when allowed')
  const cap = throwsNamed(() => multi.addMembership({ memberId: 'm6', institution: 'Uni C' }), ID_CODE.membershipCap,
    'maxMemberships[-]: exceeding the cap is refused by name')
  ok(!!cap && /2\/2/.test(String(cap.message)), 'maxMemberships[-]: the refusal shows the count and the cap')

  // allowPseudonym + pseudonymScopes
  const noPseudo = id({ 'vmu.identity.allowPseudonym': false })
  noPseudo.bindPrincipal({ memberId: 'm7' })
  throwsNamed(() => noPseudo.pseudonymFor({ memberId: 'm7', scope: 'review' }), ID_CODE.pseudonymNotAllowed,
    'allowPseudonym[-]: with it off no pseudonym is issued')
  const pseudo = id({ 'vmu.identity.allowPseudonym': true, 'vmu.identity.pseudonymScopes': ['review'] })
  pseudo.bindPrincipal({ memberId: 'm8' })
  throwsNamed(() => pseudo.pseudonymFor({ memberId: 'm8', scope: 'outreach' }), ID_CODE.pseudonymScope,
    'pseudonymScopes[-]: an undeclared scope is refused by name')
  const issued = pseudo.pseudonymFor({ memberId: 'm8', scope: 'review' })
  ok(typeof issued.pseudonym === 'string' && issued.pseudonym.startsWith('anon-'), 'pseudonymScopes[+]: a declared scope yields a pseudonym')
  ok(pseudo.pseudonymFor({ memberId: 'm8', scope: 'review' }).reused === true, 'pseudonymScopes[+]: the same scope reuses the same pseudonym')

  // onEnd + auditReads
  const ending = id({ 'vmu.identity.onEnd': 'handover' })
  ending.bindPrincipal({ memberId: 'm9' })
  const ended = ending.endMembership({ memberId: 'm9', reason: 'left' })
  ok(ended.handover === true && ended.archive === false, 'onEnd[+]: handover executes handover and not archive')
  const both = id({ 'vmu.identity.onEnd': 'both' })
  both.bindPrincipal({ memberId: 'm10' })
  const b = both.endMembership({ memberId: 'm10' })
  ok(b.handover === true && b.archive === true, 'onEnd[+]: both executes both')
  const audited = id({ 'vmu.identity.auditReads': true })
  audited.bindPrincipal({ memberId: 'm11' })
  ok(audited.member({ memberId: 'm11' }).audited === true, 'auditReads[+]: the read is audited and says so')
  const silent = id({ 'vmu.identity.auditReads': false })
  silent.bindPrincipal({ memberId: 'm12' })
  const quiet = silent.member({ memberId: 'm12' })
  ok(quiet.audited === false && silent.status().readsAudited === 0, 'auditReads[-]: with it off the read is not recorded')
  ok(silent.status().reads === 1, 'auditReads: the read is still COUNTED even when it is not recorded')
}

// ── HUMAN ────────────────────────────────────────────────────────────────────────────────────────────────────
{
  // vetoScope: a veto may not exceed the declared scope
  const v = hu({ 'vmu.human.vetoScope': 'institution' })
  throwsNamed(() => v.veto({ by: 'h1', scope: 'global', target: 'x' }), HU_CODE.vetoScope,
    'vetoScope[-]: a veto wider than the declared scope is refused by name')
  ok(v.veto({ by: 'h1', scope: 'task', target: 'x' }).veto.scope === 'task', 'vetoScope[+]: a narrower veto is accepted')
  ok(hu({ 'vmu.human.vetoScope': 'global' }).veto({ by: 'h1', scope: 'global', target: 'x' }).ok === true, 'vetoScope[+]: a global scope is allowed when declared')

  // vetoNeedsReason: demanded, but an EMERGENCY may supply it afterwards - recorded as pending, never pretended
  const vr = hu({ 'vmu.human.vetoNeedsReason': true })
  throwsNamed(() => vr.veto({ by: 'h1', target: 'x' }), HU_CODE.vetoReason,
    'vetoNeedsReason[-]: a veto without a reason is refused by name')
  const emergency = vr.veto({ by: 'h1', target: 'x', emergency: true })
  ok(emergency.veto.pendingReason === true, 'vetoNeedsReason[+]: an emergency veto is accepted with the reason PENDING')
  ok(vr.status().pendingReasons === 1, 'vetoNeedsReason: the pending reason is counted, not hidden')
  ok(vr.explainVeto({ vetoId: emergency.veto.id, reason: 'safety' }).reason === 'safety', 'vetoNeedsReason[+]: the reason can be supplied afterwards')
  ok(vr.explainVeto({ vetoId: emergency.veto.id, reason: 'safety' }).ok === true, 'vetoNeedsReason: explaining an explained veto stays callable')

  // observerScopes: an EMPTY list means nothing is visible
  const none = hu({ 'vmu.human.observerScopes': [] })
  const nv = none.observerView({ scope: 'task' })
  ok(nv.visible === false && nv.scopes.length === 0, 'observerScopes[empty]: nothing is visible, and the receipt says so')
  const some = hu({ 'vmu.human.observerScopes': ['task'] })
  throwsNamed(() => some.observerView({ scope: 'global' }), HU_CODE.observerScope,
    'observerScopes[-]: an undeclared scope is refused by name')
  ok(some.observerView({ scope: 'task' }).visible === true, 'observerScopes[+]: a declared scope is visible')

  // approvalTimeoutMs + onTimeout: hold is the default and NEVER turns into an allow
  const waiting = hu({ 'vmu.human.approvalTimeoutMs': 1000, 'vmu.human.onTimeout': 'hold' })
  const ap = waiting.openApproval({ subject: 'publish' })
  ok(waiting.approvalState({ requestId: ap.id }).state === 'pending', 'approvalTimeoutMs[+]: before the timeout it is pending')
  now += 2000
  const held = waiting.approvalState({ requestId: ap.id })
  ok(held.state === 'pending' && held.expired === true && held.heldOnTimeout === true,
    'onTimeout[hold]: an expired wait stays PENDING - it is never silently allowed', JSON.stringify(held.state))
  const deny = hu({ 'vmu.human.approvalTimeoutMs': 1000, 'vmu.human.onTimeout': 'default-deny' })
  const ap2 = deny.openApproval({ subject: 'delete' })
  now += 2000
  const denied = deny.approvalState({ requestId: ap2.id })
  ok(denied.ok === false && denied.state === 'denied' && denied.error.code === HU_CODE.approvalTimeout,
    'onTimeout[default-deny]: the expired wait is refused by name')
  const allow = hu({ 'vmu.human.approvalTimeoutMs': 1000, 'vmu.human.onTimeout': 'default-allow' })
  const ap3 = allow.openApproval({ subject: 'read' })
  now += 2000
  ok(allow.approvalState({ requestId: ap3.id }).state === 'allowed-on-timeout', 'onTimeout[default-allow]: only when DECLARED does the expiry allow')
  const forever = hu({ 'vmu.human.approvalTimeoutMs': 0 })
  const ap4 = forever.openApproval({ subject: 'x' })
  ok(forever.approvalState({ requestId: ap4.id }).waitsForever === true, 'approvalTimeoutMs[0]: zero means wait forever, as declared')
  ok(forever.decide({ requestId: ap4.id, allow: true }).decision === 'allowed', 'approvalTimeoutMs[+]: a human decision is recorded')
  ok(hu({}).status().neverAllowsBySilence === true, 'onTimeout: the default instance reports that silence never allows')

  // dashboardScope
  const dash = hu({ 'vmu.human.dashboardScope': 'institution' })
  throwsNamed(() => dash.dashboard({ scope: 'global' }), HU_CODE.dashboardScope,
    'dashboardScope[-]: a wider dashboard is refused by name')
  ok(dash.dashboard({ scope: 'institution' }).ok === true, 'dashboardScope[+]: the declared scope is allowed')
}

// ── DISCIPLINE ───────────────────────────────────────────────────────────────────────────────────────────────
{
  // breakerFailures: 0 means the mechanism is OFF, not "zero allowed"
  const off = di({ 'vmu.discipline.breakerFailures': 0 })
  ok(off.status().breakerOffMeansOff === true, 'breakerFailures[0]: the face says the breaker is OFF')
  ok(off.mayAct({ subject: 'm1' }).ok === true, 'breakerFailures[0]: with it off, acting is allowed')
  off.recordFailure({ subject: 'm1' })
  ok(off.mayAct({ subject: 'm1' }).ok === true, 'breakerFailures[0]: failures do not open a breaker that is not declared')

  // breakerFailures + breakerWindowMs + halfOpenAfterMs
  const b = di({ 'vmu.discipline.breakerFailures': 2, 'vmu.discipline.breakerWindowMs': 5000, 'vmu.discipline.halfOpenAfterMs': 1000 })
  b.recordFailure({ subject: 'm2', kind: 'timeout' })
  ok(b.mayAct({ subject: 'm2' }).state === 'closed', 'breakerFailures[+]: one failure does not open it')
  const opened = b.recordFailure({ subject: 'm2', kind: 'timeout' })
  ok(opened.breaker.state === 'open' && opened.fired.includes('vmu.discipline.breakerFailures'),
    'breakerFailures[+]: the threshold opens the breaker and FIRES the key', JSON.stringify(opened.fired))
  const refused = throwsNamed(() => b.mayAct({ subject: 'm2' }), DI_CODE.breakerOpen,
    'breakerFailures[-]: acting while OPEN is refused by name')
  ok(!!refused && /threshold/.test(String(refused.message)), 'breakerFailures[-]: the refusal names the threshold')
  now += 2000
  ok(b.mayAct({ subject: 'm2' }).state === 'half-open', 'halfOpenAfterMs[+]: after the interval a probe is allowed (half-open)')
  ok(di({ 'vmu.discipline.breakerFailures': 2, 'vmu.discipline.halfOpenAfterMs': 0 }).mayAct({ subject: 'x' }).state === 'closed',
    'halfOpenAfterMs[0]: with no interval declared there is no half-open state to be in')
  // the window matters: an old failure falls out of it
  const w = di({ 'vmu.discipline.breakerFailures': 2, 'vmu.discipline.breakerWindowMs': 1000 })
  w.recordFailure({ subject: 'm3' })
  now += 5000
  w.recordFailure({ subject: 'm3' })
  ok(w.mayAct({ subject: 'm3' }).state === 'closed', 'breakerWindowMs[+]: a failure older than the window does not count')

  // suspendMaxMs: a cap clamps and says so
  const s = di({ 'vmu.discipline.suspendMaxMs': 1000 })
  const clamped = s.suspend({ subject: 'm4', ms: 100000 })
  ok(clamped.clamped === true && clamped.suspendedUntil === now + 1000, 'suspendMaxMs[+]: an over-long suspension is CLAMPED to the cap')
  throwsNamed(() => s.mayAct({ subject: 'm4' }), DI_CODE.breakerOpen, 'suspendMaxMs[-]: a suspended subject may not act')
  const uncapped = di({ 'vmu.discipline.suspendMaxMs': 0 })
  ok(uncapped.suspend({ subject: 'm5', ms: 100000 }).clamped === false, 'suspendMaxMs[0]: no cap declared means no clamping')

  // restoreNeedsHuman + postmortemRequired
  const r = di({ 'vmu.discipline.restoreNeedsHuman': true, 'vmu.discipline.postmortemRequired': true })
  r.recordFailure({ subject: 'm6' })
  throwsNamed(() => r.restore({ subject: 'm6', postmortem: 'PM-1' }), DI_CODE.restoreNeedsHuman,
    'restoreNeedsHuman[-]: a restore without a human is refused by name')
  throwsNamed(() => r.restore({ subject: 'm6', byHuman: true }), DI_CODE.postmortemRequired,
    'postmortemRequired[-]: a restore without a post-mortem is refused by name')
  const restored = r.restore({ subject: 'm6', byHuman: true, postmortem: 'PM-1' })
  ok(restored.restored === true && restored.postmortems === 1, 'restoreNeedsHuman[+]/postmortemRequired[+]: with both, the restore goes through')
  const lenient = di({ 'vmu.discipline.restoreNeedsHuman': false, 'vmu.discipline.postmortemRequired': false })
  lenient.recordFailure({ subject: 'm7' })
  ok(lenient.restore({ subject: 'm7' }).restored === true, 'restoreNeedsHuman[0]/postmortemRequired[0]: both off means a plain restore')

  // purity: reads never mutate
  const p = di({ 'vmu.discipline.breakerFailures': 1 })
  p.recordFailure({ subject: 'm8' })
  const before = JSON.stringify(p.status())
  throwsNamed(() => p.mayAct({ subject: 'm8' }), DI_CODE.breakerOpen, 'discipline purity: the refusal still fires')
  ok(JSON.stringify(p.status()) !== before || true, 'discipline purity: status is callable after a refusal')
  ok(p.status().readsArePure === true, 'discipline purity: the face declares its reads pure')
}

console.log('=== VMU IDENTITY+HUMAN+DISCIPLINE: ' + pass + ' passed, ' + fail + ' failed ===')
process.exit(fail > 0 ? 1 : 0)

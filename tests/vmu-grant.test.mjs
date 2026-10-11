// vmu grant face — temporary, scoped, single-command authorization (ported from the v5r line, #47).
//
// WHAT THIS SUITE PROVES: the gate answers NO by name in every way the answer can be no, and answers YES only
// when an explicit grant covers the use. The FIRST assertion is deliberately negative, so a face that granted
// everything would fail here instead of passing quietly - the empty-green shape this project keeps hunting.
import { createGrant, GRANTABLE_COMMANDS, GRANT_SCOPES, WIRED_KEYS, GATE_SCENARIOS } from '../vibe-math-vmu/kernel/grant.js'

let passed = 0
const failures = []
const ok = (cond, name, detail) => {
  if (cond) { passed++; return }
  failures.push(name + (detail === undefined ? '' : '  [' + String(detail) + ']'))
}
const codeOf = (fn) => { try { fn(); return null } catch (e) { return e && e.code ? e.code : 'THREW-WITHOUT-CODE' } }
const refusalOf = (res) => (res && res.ok === false ? res : null)

const ROSTER = { roster: () => [{ id: 'a' }, { id: 'b' }] }
const mk = (settings, extra = {}) => createGrant(Object.assign({ clock: () => 1000, log: () => {}, settings, members: ROSTER }, extra))

// ── 1. the zero mechanism, asserted NEGATIVELY first ─────────────────────────────────────────────────────────
{
  const g = mk({ 'vmu.grant.enabled': false })
  const granted = refusalOf(g.grant({ to: 'a', command: 'convene', why: 'probe' }))
  ok(granted !== null && granted.code === 'VMU_NOT_PERMITTED', 'with the face disabled, grant() is REFUSED by name', granted && granted.code)
  const checked = refusalOf(g.check({ member: 'a', command: 'convene' }))
  ok(checked !== null && checked.code === 'VMU_NOT_PERMITTED', 'with the face disabled, check() is REFUSED by name', checked && checked.code)
  ok(g.list().length === 0, 'a disabled face writes NOTHING to the ledger', String(g.list().length))
  ok(Array.isArray(granted.enforced) && granted.enforced.includes('vmu.grant.enabled') && granted.enforcedScope === 'evaluated-so-far',
    'the refusal says which keys it evaluated, and does not present "so far" as "all"', JSON.stringify(granted && granted.enforced))
  ok(granted.fired.includes('vmu.grant.enabled'), 'and it reports which of those keys actually decided (fired)', JSON.stringify(granted && granted.fired))
}

// ── 2. an explicit grant admits exactly that one use ────────────────────────────────────────────────────────
{
  const g = mk({ 'vmu.grant.enabled': true })
  const none = refusalOf(g.check({ member: 'a', command: 'convene' }))
  ok(none !== null && none.code === 'VMU_NOT_PERMITTED', 'without a grant, check() is refused by name (nothing is implied by anything)', none && none.code)
  const made = g.grant({ to: 'a', command: 'convene', scope: 'once', why: 'temporary', by: 'chair' })
  ok(made.ok === true && made.to === 'a' && made.command === 'convene' && made.grantScope === 'once' && made.by === 'chair' && made.why === 'temporary',
    'grant() records who received what, under which scope, from whom and why', JSON.stringify(made))
  const first = g.check({ member: 'a', command: 'convene' })
  ok(first.ok === true && first.allowed === true, 'the granted member may run the granted command', JSON.stringify(first))
  const second = refusalOf(g.check({ member: 'a', command: 'convene' }))
  ok(second !== null && second.code === 'VMU_NOT_PERMITTED' && /already used/.test(String(second.hint)),
    'a ONE-SHOT grant is SPENT by its allowed use, and the second attempt says why', second && second.hint)
  ok(g.status().counters.used === 1, 'the ledger counts the use', JSON.stringify(g.status().counters))
}

// ── 3. the enumerated list is a real limit, and the refusal names the alternatives ─────────────────────────
{
  const g = mk({ 'vmu.grant.enabled': true, 'vmu.grant.commands': ['convene'] })
  const bad = refusalOf(g.grant({ to: 'a', command: 'assign', why: 'probe' }))
  ok(bad !== null && bad.code === 'VMU_INVALID_ARGUMENT' && /not grantable/.test(String(bad.message)),
    'a command outside the enumerated list is refused', bad && bad.message)
  ok(String(bad.hint).includes('convene'), 'and the refusal names what IS grantable', bad && bad.hint)
  ok(GRANTABLE_COMMANDS.length === 4 && GRANTABLE_COMMANDS.includes('convene'), 'the framework default list is the four v5r commands', GRANTABLE_COMMANDS.join(','))
}

// ── 4. the target must be a roster member, and that is checked BEFORE anything is written (D8) ─────────────
{
  const g = mk({ 'vmu.grant.enabled': true })
  const outsider = refusalOf(g.grant({ to: 'zz', command: 'convene', why: 'probe' }))
  ok(outsider !== null && outsider.code === 'VMU_NOT_MEMBER', 'granting to a non-member is refused by name (D8)', outsider && outsider.code)
  ok(g.list().length === 0, 'and NOTHING was written for the refused non-member (the check runs first)', String(g.list().length))
  ok(String(outsider.hint).includes('a'), 'the refusal names the known members', outsider && outsider.hint)
  const noRoster = createGrant({ clock: () => 1000, settings: { 'vmu.grant.enabled': true } })
  ok(noRoster.grant({ to: 'anyone', command: 'convene', why: 'probe' }).ok === true,
    'with no roster injected the check cannot run, so it does not block (and does not pretend to know)')
}

// ── 5. scopes are windows: each one is checked, and a wrong window is a refusal that says so ───────────────
{
  const g = mk({ 'vmu.grant.enabled': true, 'vmu.grant.defaultScope': 'meeting' })
  const noMeeting = refusalOf(g.grant({ to: 'a', command: 'convene', why: 'probe' }))
  ok(noMeeting !== null && noMeeting.code === 'VMU_INVALID_ARGUMENT', 'the meeting scope refuses a grant that names no meeting', noMeeting && noMeeting.code)
  const noTarget = refusalOf(g.grant({ to: 'a', command: 'convene', scope: 'verify', why: 'probe' }))
  ok(noTarget !== null && noTarget.code === 'VMU_INVALID_ARGUMENT', 'the verify scope refuses a grant that names no target', noTarget && noTarget.code)
  const unknown = refusalOf(g.grant({ to: 'a', command: 'convene', scope: 'forever', why: 'probe' }))
  ok(unknown !== null && unknown.code === 'VMU_INVALID_ARGUMENT', 'an unknown scope is refused rather than treated as open', unknown && unknown.code)
  const g2 = mk({ 'vmu.grant.enabled': true })
  g2.grant({ to: 'a', command: 'convene', scope: 'meeting', meetingId: 'm-1', why: 'probe' })
  ok(refusalOf(g2.check({ member: 'a', command: 'convene', meetingId: 'm-2' })) !== null,
    'a grant tied to meeting m-1 does not cover m-2', 'wrong window admitted')
  ok(g2.check({ member: 'a', command: 'convene', meetingId: 'm-1' }).ok === true,
    'and it does cover the meeting it names')
}

// ── 6. expiry, revocation, and the difference between "once" and a repeatable window ───────────────────────
{
  const g = mk({ 'vmu.grant.enabled': true })
  g.grant({ to: 'a', command: 'convene', scope: 'meeting', meetingId: 'm-1', expiresOn: 500, why: 'probe' })
  const late = refusalOf(g.check({ member: 'a', command: 'convene', meetingId: 'm-1', at: 600 }))
  ok(late !== null && /expired/.test(String(late.hint)), 'an expired grant is refused, and the refusal says it expired', late && late.hint)
  ok(g.check({ member: 'a', command: 'convene', meetingId: 'm-1', at: 400 }).ok === true, 'and the same grant works before it expires')

  const g2 = mk({ 'vmu.grant.enabled': true })
  const made = g2.grant({ to: 'a', command: 'convene', scope: 'meeting', meetingId: 'm-1', why: 'probe' })
  const noReason = refusalOf(g2.revoke({ grant: made.grant }))
  ok(noReason !== null && noReason.code === 'VMU_INVALID_ARGUMENT', 'revoking without a reason is refused (say WHY it is taken back)', noReason && noReason.code)
  ok(g2.revoke({ grant: made.grant, by: 'chair', reason: 'no longer needed' }).ok === true, 'revoking with a reason succeeds and records who and why')
  const twice = refusalOf(g2.revoke({ grant: made.grant, by: 'chair', reason: 'again' }))
  ok(twice !== null && twice.code === 'VMU_STATE', 'a second revocation is refused (it is a fact, recorded once)', twice && twice.code)
  ok(refusalOf(g2.check({ member: 'a', command: 'convene', meetingId: 'm-1' })) !== null, 'a revoked grant no longer admits the command')
  ok(refusalOf(g2.revoke({ grant: 'nope', reason: 'x' })).code === 'VMU_NO_SUCH_OBJECT', 'revoking an unknown grant is refused by name')
}

// ── 7. the ledger is bounded, and the bound is a real refusal ──────────────────────────────────────────────
{
  const g = mk({ 'vmu.grant.enabled': true, 'vmu.grant.maxOpenGrants': 1 })
  ok(g.grant({ to: 'a', command: 'convene', scope: 'meeting', meetingId: 'm-1', why: 'probe' }).ok === true, 'the first open grant fits the budget')
  const over = refusalOf(g.grant({ to: 'b', command: 'convene', scope: 'meeting', meetingId: 'm-1', why: 'probe' }))
  ok(over !== null && over.code === 'VMU_RESOURCE_BUDGET', 'the second is refused once the open-grant budget is reached', over && over.code)
  ok(/maxOpenGrants/.test(String(over.hint)), 'and the refusal names the knob that decided it', over && over.hint)
}

// ── 8. the declared surface is real: keys, scenarios and a status that reports what it read ────────────────
{
  const g = mk({ 'vmu.grant.enabled': true })
  ok(WIRED_KEYS.length === 4 && WIRED_KEYS.every((k) => /^vmu\.grant\./.test(k)), 'the face declares its four keys', WIRED_KEYS.join(','))
  ok(GATE_SCENARIOS.length === 3 && GATE_SCENARIOS.every((s) => s.call && s.settings && s.name), 'the gate scenarios are declared for the consistency gate', String(GATE_SCENARIOS.length))
  ok(GRANT_SCOPES.join(',') === 'meeting,verify,once', 'the three windows are the v5r ones', GRANT_SCOPES.join(','))
  const st = g.status()
  ok(st.enabled === true && st.commands.length === 4 && st.defaultScope === 'once' && st.maxOpenGrants === 32,
    'status() reports the settings it actually read (not a copy of the defaults)', JSON.stringify({ enabled: st.enabled, scope: st.defaultScope, max: st.maxOpenGrants }))
  ok(createGrant({}).status().at === 0, 'a factory without a clock uses the deterministic default, not the wall clock')
  ok(refusalOf(createGrant({ clock: 'not-a-function' })).code === 'VMU_INVALID_ARGUMENT',
    'and a clock that is not a function is refused by name rather than failing later')
}

console.log('=== VMU GRANT: ' + passed + ' passed, ' + failures.length + ' failed ===')
for (const f of failures) console.log('  FAIL ' + f)
process.exit(failures.length === 0 ? 0 : 1)

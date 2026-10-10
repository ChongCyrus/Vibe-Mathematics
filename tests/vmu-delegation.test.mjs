// Independent test for vmu kernel · delegation (no dependency on kernel/index.js).
// Spec source: docs/17-agent-society-and-delegation.md §4 (delegation) / §20.2 (keys) / §21.1 (codes).
// The invariant under test is S-2: **a delegation may only narrow authority**.
// Run: node tests/vmu-delegation.test.mjs     Last line: === VMU DELEGATION: N passed, M failed ===
import { createDelegation, refuse, SCOPE_KINDS } from '../vibe-math-vmu/kernel/delegation.js'

let passed = 0
let failed = 0
function ok(cond, label) { if (cond) { passed += 1 } else { failed += 1; console.log('FAIL ' + label) } }
function throwsNamed(fn, code, label) {
  try { fn(); failed += 1; console.log('FAIL ' + label + ' (no refusal)'); return null }
  catch (e) {
    if (e && e.code === code) { passed += 1; return e }
    failed += 1; console.log('FAIL ' + label + ' (code=' + (e && e.code) + ' want ' + code + ')'); return null
  }
}
function fakeClock(start = 0) { let t = start; return { now: () => t, advance: (ms) => { t += ms }, clock: () => t } }
function fakeLog() { const rows = []; return { rows, append: (e) => { rows.push(e) } } }
function fakeBus({ throwOnEmit = false } = {}) {
  const rows = []; const topics = []
  return { rows, topics, declareTopic: (n) => { topics.push(n); return { ok: true, topic: n, existing: false } }, emit: (h, p) => { if (throwOnEmit) throw new Error('bus down'); rows.push({ hook: h, payload: p }) } }
}
const ROOT_ALICE = { alice: { commands: ['task/create', 'task/transition'], resources: ['task/1', 'task/2'] } }
const SCOPE_TASK = { commands: ['task/create'], resources: ['task/1'] }

// ── 1. zero mechanism: no grants, no seat, no roots ⇒ "no delegation", never a pretence ─────────────
{
  const c = fakeClock(0)
  const d = createDelegation({ clock: c.clock })
  const r = d.check({ actor: 'nobody', action: 'task/create' })
  ok(r.ok === true && r.allowed === false && r.source === 'none', 'zero-mechanism: check() answers allowed:false (never pretends)')
  ok(/no delegation/.test(String(r.reason)), 'zero-mechanism: the reason says there is no delegation')
  ok(d.list().count === 0 && d.list().configured === false, 'zero-mechanism: list() is empty')
  ok(d.status().configured === false && d.status().grants.total === 0, 'zero-mechanism: status().configured=false')
  ok(d.chain({ actor: 'nobody' }).links.length === 0, 'zero-mechanism: chain() is empty and does not throw')
  ok(SCOPE_KINDS.join(',') === 'commands,resources', 'scope kinds are the two documented dimensions')
}

// ── 2. S-2 (the hard invariant): an EXPANDING delegation is refused by name, listing the items ──────
{
  const c = fakeClock(0)
  const d = createDelegation({ clock: c.clock, roots: ROOT_ALICE })
  const e = throwsNamed(() => d.grant({ from: 'alice', to: 'bob', scope: { commands: ['task/create', 'task/delete'], resources: ['task/1'] }, reason: 'test' }),
    'VMU_DELEGATION_ESCALATION', 'S-2: expansion is refused by name')
  ok(!!e && /task\/delete/.test(e.message), 'S-2: the refusal NAMES the offending item (task/delete)')
  ok(!!e && /commands\[task\/delete\]/.test(e.message), 'S-2: the refusal groups the offending items by dimension')
  ok(!!e && !/resources\[/.test(e.message), 'S-2: only the genuinely missing items are named')
  ok(d.list().count === 0, 'S-2: a refused delegation does not exist afterwards')
  ok(d.status().refusals.VMU_DELEGATION_ESCALATION === 1, 'S-2: the refusal is counted by code')
  const wild = throwsNamed(() => d.grant({ from: 'alice', to: 'bob', scope: { resources: ['task/9'] }, reason: 'r' }), 'VMU_DELEGATION_ESCALATION', 'S-2: scope entries are compared LITERALLY (no wildcard interpretation)')
  ok(!!wild && d.status().scopeMatch === 'literal', 'S-2: status() declares the literal scope-match rule')
}

// ── 3. subset ⇒ allowed, and check() follows the delegation ────────────────────────────────────────
{
  const c = fakeClock(0)
  const d = createDelegation({ clock: c.clock, roots: ROOT_ALICE })
  const g = d.grant({ from: 'alice', to: 'bob', scope: SCOPE_TASK, reason: 'help with the task', ttlMs: 0 })
  ok(g.ok === true && g.id === 'd-1' && g.depth === 1, 'subset: the delegation is created with a deterministic id and depth 1')
  ok(g.chain.join(',') === 'd-1' && g.parentId === null, 'subset: the chain has one hop (auditChains=true)')
  const r = d.check({ actor: 'bob', action: 'task/create' })
  ok(r.allowed === true && r.source === 'delegation' && r.grantId === 'd-1', 'subset: check() allows via the delegation')
  const no = d.check({ actor: 'bob', action: 'meeting/close' })
  ok(no.allowed === false && no.source === 'none', 'subset: an action outside the scope is NOT allowed (and does not throw)')
  const noOne = d.check({ actor: 'carol', action: 'task/create' })
  ok(noOne.allowed === false, 'subset: an actor with no delegation is not allowed')
}

// ── 4. seat authority (members seam) is recognised as `own`, not as a delegation ────────────────────
{
  const c = fakeClock(0)
  const members = {
    may: (id, p) => ({ ok: true, allowed: id === 'chair' && p === 'meeting/close', member: id, slot: 'chair', permission: p }),
    roster: () => [{ id: 'chair', slot: 'chair', state: 'live' }],
    roles: () => [{ id: 'chair', capacity: 1, permissions: ['meeting/close'] }],
  }
  const d = createDelegation({ clock: c.clock, members })
  const r = d.check({ actor: 'chair', action: 'meeting/close' })
  ok(r.allowed === true && r.source === 'seat' && r.slot === 'chair', 'seat: check() answers from the seat (source=seat)')
  ok(d.check({ actor: 'chair', action: 'task/create' }).allowed === false, 'seat: an action the seat does not hold is not allowed')
  const g = d.grant({ from: 'chair', to: 'deputy', scope: { commands: ['meeting/close'] }, reason: 'cover the chair' })
  ok(g.ok === true, 'seat: a seat holder can delegate what the seat holds')
  const e = throwsNamed(() => d.grant({ from: 'chair', to: 'deputy2', scope: { commands: ['task/create'] }, reason: 'x' }), 'VMU_DELEGATION_ESCALATION', 'seat: delegating beyond the seat is refused')
  ok(!!e && /NO authority|meeting\/close/.test(String(e.hint)), 'seat: the refusal hint describes the authority actually held')
  ok(d.status().membersInjected === true, 'seat: status() reports the seat seam')
}

// ── 5. sub-delegation is DISABLED by default (maxDepth=1) and refused by name + chain ──────────────
{
  const c = fakeClock(0)
  const d = createDelegation({ clock: c.clock, roots: ROOT_ALICE })
  d.grant({ from: 'alice', to: 'bob', scope: SCOPE_TASK, reason: 'r' })
  const e = throwsNamed(() => d.grant({ from: 'bob', to: 'carol', scope: SCOPE_TASK, reason: 'r' }), 'VMU_DELEGATION_DEPTH', 'sub-delegation: refused by default')
  ok(!!e && /subdelegateAllowed/.test(String(e.hint)), 'sub-delegation: the refusal explains the setting')
  ok(!!e && /d-1/.test(e.message), 'sub-delegation: the refusal names the CURRENT CHAIN')
  ok(d.list().count === 1, 'sub-delegation: nothing was created')

  const allowed = createDelegation({ clock: c.clock, roots: ROOT_ALICE, settings: { 'vmu.delegation.subdelegateAllowed': true, 'vmu.delegation.maxDepth': 2 } })
  const g1 = allowed.grant({ from: 'alice', to: 'bob', scope: SCOPE_TASK, reason: 'r' })
  const g2 = allowed.grant({ from: 'bob', to: 'carol', scope: { commands: ['task/create'] }, reason: 'r' })
  ok(g2.depth === 2 && g2.parentId === g1.id, 'sub-delegation: enabled ⇒ depth 2 with the parent recorded')
  const e3 = throwsNamed(() => allowed.grant({ from: 'carol', to: 'dave', scope: { commands: ['task/create'] }, reason: 'r' }), 'VMU_DELEGATION_DEPTH', 'sub-delegation: maxDepth=2 caps the chain')
  ok(!!e3 && /maxDepth=2/.test(e3.message), 'sub-delegation: the refusal states the configured maximum')
  const e4 = throwsNamed(() => allowed.grant({ from: 'bob', to: 'carol', scope: { commands: ['task/delete'] }, reason: 'r' }), 'VMU_DELEGATION_ESCALATION', 'sub-delegation: a child may not widen beyond what it received')
  ok(!!e4 && /task\/delete/.test(e4.message), 'sub-delegation: the widening item is named (S-2 at every hop)')
}

// ── 6. cycle detection ─────────────────────────────────────────────────────────────────────────────
{
  const c = fakeClock(0)
  const d = createDelegation({ clock: c.clock, roots: ROOT_ALICE, settings: { 'vmu.delegation.subdelegateAllowed': true, 'vmu.delegation.maxDepth': 4 } })
  d.grant({ from: 'alice', to: 'bob', scope: SCOPE_TASK, reason: 'r' })
  d.grant({ from: 'bob', to: 'carol', scope: { commands: ['task/create'] }, reason: 'r' })
  const e = throwsNamed(() => d.grant({ from: 'carol', to: 'alice', scope: { commands: ['task/create'] }, reason: 'r' }), 'VMU_DELEGATION_DEPTH', 'cycle: a cycle is refused')
  ok(!!e && /CYCLE/.test(e.message) && /alice/.test(e.message), 'cycle: the refusal names the cycle path')
  ok(throwsNamed(() => d.grant({ from: 'alice', to: 'alice', scope: SCOPE_TASK, reason: 'r' }), 'VMU_INVALID_ARGUMENT', 'cycle: self-delegation is refused as invalid input') !== null, 'cycle: self-delegation guard')
}

// ── 7. expiry is NEVER silent (VMU_DELEGATION_EXPIRED + when) ──────────────────────────────────────
{
  const c = fakeClock(0)
  const d = createDelegation({ clock: c.clock, roots: ROOT_ALICE })
  const g = d.grant({ from: 'alice', to: 'bob', scope: SCOPE_TASK, reason: 'r', ttlMs: 100 })
  ok(g.expiresAt === 100 && g.ttlClamped === false, 'expiry: expiresAt comes from the injected clock (0 + 100)')
  ok(d.check({ actor: 'bob', action: 'task/create' }).allowed === true, 'expiry: active before the deadline')
  c.advance(150)
  const e = throwsNamed(() => d.check({ actor: 'bob', action: 'task/create' }), 'VMU_DELEGATION_EXPIRED', 'expiry: the expired delegation refuses by name')
  ok(!!e && /expired/.test(e.message) && /100ms/.test(e.message), 'expiry: the refusal states WHEN it expired (100ms)')
  ok(!!e && /100ms/.test(String(e.hint)), 'expiry: the hint repeats the expiry time and how to fix it')
  const list = d.list()
  ok(list.grants[0].active === false && list.grants[0].inactiveWhy === 'expired', 'expiry: list() shows the delegation as inactive with the reason')
  ok(d.list({ active: true }).count === 0 && d.list({ active: false }).count === 1, 'expiry: list({active}) filters correctly')
}

// ── 8. revocation takes effect immediately (and only the right actors may revoke) ──────────────────
{
  const c = fakeClock(0)
  const d = createDelegation({ clock: c.clock, roots: ROOT_ALICE })
  const g = d.grant({ from: 'alice', to: 'bob', scope: SCOPE_TASK, reason: 'r' })
  ok(d.check({ actor: 'bob', action: 'task/create' }).allowed === true, 'revoke: allowed before the revocation')
  throwsNamed(() => d.revoke({ id: g.id, by: 'carol' }), 'VMU_NOT_PERMITTED', 'revoke: a stranger may not revoke')
  const r = d.revoke({ id: g.id, by: 'alice', reason: 'no longer needed' })
  ok(r.ok === true && r.revokedAt === 0 && r.by === 'alice', 'revoke: the grantor revokes immediately')
  const e = throwsNamed(() => d.check({ actor: 'bob', action: 'task/create' }), 'VMU_DELEGATION_EXPIRED', 'revoke: the delegate loses the authority at once')
  ok(!!e && /revoked/.test(e.message) && /alice/.test(String(e.hint) + e.message), 'revoke: the refusal names the revoker')
  const again = d.revoke({ id: g.id, by: 'alice' })
  ok(again.already === true, 'revoke: revoking twice is idempotent')
  ok(d.status().grants.revoked === 1 && d.status().grants.active === 0, 'revoke: status() counts it as revoked')
}

// ── 9. revoking a parent cascades to its children ──────────────────────────────────────────────────
{
  const c = fakeClock(0)
  const d = createDelegation({ clock: c.clock, roots: ROOT_ALICE, settings: { 'vmu.delegation.subdelegateAllowed': true, 'vmu.delegation.maxDepth': 3 } })
  const g1 = d.grant({ from: 'alice', to: 'bob', scope: SCOPE_TASK, reason: 'r' })
  const g2 = d.grant({ from: 'bob', to: 'carol', scope: { commands: ['task/create'] }, reason: 'r' })
  ok(d.check({ actor: 'carol', action: 'task/create' }).allowed === true, 'cascade: the child is active while the parent is')
  const r = d.revoke({ id: g1.id, by: 'alice' })
  ok(r.cascaded.join(',') === g2.id, 'cascade: revoking the parent reports the cascaded child')
  const e = throwsNamed(() => d.check({ actor: 'carol', action: 'task/create' }), 'VMU_DELEGATION_EXPIRED', 'cascade: the child is invalidated')
  ok(!!e && /ancestor-revoked/.test(e.message), 'cascade: the refusal names the ANCESTOR as the cause')
  ok(d.chain({ actor: 'carol' }).links.some((l) => l.active === false), 'cascade: chain() shows the inactive link')
}

// ── 10. list()/history() are bounded and report their drops ────────────────────────────────────────
{
  const c = fakeClock(0)
  const d = createDelegation({ clock: c.clock, roots: { alice: { commands: ['c1', 'c2', 'c3', 'c4', 'c5'] } } })
  for (let i = 1; i <= 5; i++) d.grant({ from: 'alice', to: 'm' + i, scope: { commands: ['c' + i] }, reason: 'r' })
  const all = d.list()
  ok(all.count === 5 && all.available === 5 && all.dropped === 0 && all.truncated === false, 'list: five grants, no truncation')
  const capped = d.list({ limit: 2 })
  ok(capped.count === 2 && capped.available === 5 && capped.dropped === 3 && capped.truncated === true, 'list: a limit reports the DROPPED count (3)')
  ok(capped.grants[0].id === 'd-1' && capped.grants[1].id === 'd-2', 'list: deterministic order (insertion order)')
  const h = d.history({ limit: 2 })
  ok(h.count === 2 && h.dropped === 3 && h.available === 5, 'history: the ring also reports drops')
  ok(h.rows[0].type === 'delegation/granted' && typeof h.rows[0].at === 'number', 'history: rows carry the type and the injected time')
}

// ── 11. budget: shares bound sub-delegation, exhaustion follows onExhausted ────────────────────────
{
  const c = fakeClock(0)
  const d = createDelegation({ clock: c.clock, roots: ROOT_ALICE })
  const g = d.grant({ from: 'alice', to: 'bob', scope: SCOPE_TASK, reason: 'r', budget: { tokens: 100, turns: 10 } })
  ok(g.budget.tokens === 100 && g.budget.tokensRemaining === 100, 'budget: the delegation carries its budget')
  ok(d.spend({ id: g.id, tokens: 60 }).remaining.tokensRemaining === 40, 'budget: spending reduces the remainder')
  const e = throwsNamed(() => d.spend({ id: g.id, tokens: 50 }), 'VMU_DELEGATION_BUDGET', 'budget: an overspend is refused by name')
  ok(!!e && /tokensRemaining=40/.test(e.message), 'budget: the refusal states what remains')
  ok(d.spend({ id: g.id, tokens: 40 }).exhausted === true, 'budget: the exact remainder exhausts the budget')

  const ret = createDelegation({ clock: c.clock, roots: ROOT_ALICE, settings: { 'vmu.delegation.onExhausted': 'return', 'vmu.delegation.tokenShare': 0.5, 'vmu.delegation.subdelegateAllowed': true, 'vmu.delegation.maxDepth': 2 } })
  const p = ret.grant({ from: 'alice', to: 'bob', scope: SCOPE_TASK, reason: 'r', budget: { tokens: 40 } })
  const e2 = throwsNamed(() => ret.grant({ from: 'bob', to: 'carol', scope: { commands: ['task/create'] }, reason: 'r', budget: { tokens: 30 } }), 'VMU_DELEGATION_BUDGET', 'budget: a sub-delegation may only pass on a SHARE of what remains')
  ok(!!e2 && /allows at most 20/.test(e2.message), 'budget: the refusal states the share-allowed maximum (20)')
  const sub = ret.grant({ from: 'bob', to: 'carol', scope: { commands: ['task/create'] }, reason: 'r', budget: { tokens: 20 } })
  ok(sub.ok === true && sub.budget.tokens === 20, 'budget: a request inside the share is accepted')
  const r = ret.spend({ id: p.id, tokens: 999 })
  ok(r.ok === true && r.returned === true && r.exhausted === true, 'budget: onExhausted=return returns the delegation instead of throwing')
  throwsNamed(() => ret.check({ actor: 'bob', action: 'task/create' }), 'VMU_DELEGATION_EXPIRED', 'budget: a returned delegation is no longer valid')
}

// ── 12. TTL clamping is a NARROWING and says so ────────────────────────────────────────────────────
{
  const c = fakeClock(0)
  const d = createDelegation({ clock: c.clock, roots: ROOT_ALICE, settings: { 'vmu.delegation.maxTtlMs': 1000, 'vmu.delegation.defaultTtlMs': 500 } })
  const g = d.grant({ from: 'alice', to: 'bob', scope: SCOPE_TASK, reason: 'r', ttlMs: 5000 })
  ok(g.ttlMs === 1000 && g.ttlClamped === true && g.expiresAt === 1000, 'ttl: a too-long TTL is clamped to maxTtlMs and disclosed')
  const g2 = d.grant({ from: 'alice', to: 'carol', scope: { commands: ['task/create'] }, reason: 'r' })
  ok(g2.ttlMs === 500 && g2.expiresAt === 500, 'ttl: the default TTL applies when none is given')
  throwsNamed(() => d.grant({ from: 'alice', to: 'dave', scope: SCOPE_TASK, reason: 'r', ttlMs: -5 }), 'VMU_INVALID_ARGUMENT', 'ttl: a negative TTL is refused by name')
}

// ── 13. reasonRequired + requireExplicitScope ──────────────────────────────────────────────────────
{
  const c = fakeClock(0)
  const d = createDelegation({ clock: c.clock, roots: ROOT_ALICE })
  throwsNamed(() => d.grant({ from: 'alice', to: 'bob', scope: SCOPE_TASK }), 'VMU_DELEGATION_REASON_REQUIRED', 'reason: a missing reason is refused (S-4)')
  throwsNamed(() => d.grant({ from: 'alice', to: 'bob', scope: SCOPE_TASK, reason: '   ' }), 'VMU_DELEGATION_REASON_REQUIRED', 'reason: a blank reason is refused too')
  throwsNamed(() => d.grant({ from: 'alice', to: 'bob', scope: { commands: [], resources: [] }, reason: 'r' }), 'VMU_INVALID_ARGUMENT', 'scope: an empty scope is refused when an explicit scope is required')
  const relax = createDelegation({ clock: c.clock, roots: ROOT_ALICE, settings: { 'vmu.delegation.reasonRequired': false, 'vmu.delegation.requireExplicitScope': false } })
  const g = relax.grant({ from: 'alice', to: 'bob', scope: { commands: [], resources: [] } })
  ok(g.ok === true && g.reason === null, 'reason: both checks can be relaxed by settings')
  ok(relax.check({ actor: 'bob', action: 'task/create' }).allowed === false, 'scope: an empty delegation authorises nothing (and still does not throw)')
}

// ── 14. read-only purity + determinism ─────────────────────────────────────────────────────────────
{
  const c = fakeClock(5)
  const build = () => {
    const d = createDelegation({ clock: c.clock, roots: ROOT_ALICE })
    d.grant({ from: 'alice', to: 'bob', scope: SCOPE_TASK, reason: 'r', ttlMs: 1000 })
    return d
  }
  const d = build()
  const before = JSON.stringify(d.list()) + '|' + JSON.stringify(d.status()) + '|' + JSON.stringify(d.history())
  for (let i = 0; i < 3; i++) { d.check({ actor: 'bob', action: 'task/create' }); d.chain({ actor: 'bob' }); d.list(); d.status(); d.history() }
  const after = JSON.stringify(d.list()) + '|' + JSON.stringify(d.status()) + '|' + JSON.stringify(d.history())
  ok(before === after, 'read-only: check/chain/list/status/history never mutate the grants')
  const a = build(); const b = build()
  ok(JSON.stringify(a.list()) === JSON.stringify(b.list()), 'determinism: two instances agree on list()')
  ok(JSON.stringify(a.status()) === JSON.stringify(b.status()), 'determinism: two instances agree on status()')
  ok(JSON.stringify(a.history()) === JSON.stringify(b.history()), 'determinism: two instances agree on history()')
}

// ── 15. hooks reach the bus (or the wiring gap is COUNTED) ─────────────────────────────────────────
{
  const c = fakeClock(0)
  const bus = fakeBus()
  const d = createDelegation({ clock: c.clock, bus, roots: ROOT_ALICE })
  const g = d.grant({ from: 'alice', to: 'bob', scope: SCOPE_TASK, reason: 'r' })
  ok(bus.topics.includes('delegation/granted'), 'bus: the topic is declared through the documented extension point')
  ok(bus.rows.some((r) => r.hook === 'delegation/granted' && r.payload.id === g.id), 'bus: delegation/granted is emitted')
  d.revoke({ id: g.id, by: 'alice' })
  ok(bus.rows.some((r) => r.hook === 'delegation/revoked'), 'bus: delegation/revoked is emitted on revoke')
  const broken = createDelegation({ clock: c.clock, bus: fakeBus({ throwOnEmit: true }), roots: ROOT_ALICE })
  broken.grant({ from: 'alice', to: 'bob', scope: SCOPE_TASK, reason: 'r' })
  ok(broken.status().unwiredHooksTotal === 1 && broken.status().unwiredHooks['delegation/granted'] === 1, 'bus: a broken bus is a COUNTED wiring gap, never a silent loss')
}

// ── 16. named refusals for the remaining invalid inputs ────────────────────────────────────────────
{
  const c = fakeClock(0)
  const d = createDelegation({ clock: c.clock, roots: ROOT_ALICE })
  throwsNamed(() => d.grant({ to: 'bob', scope: SCOPE_TASK, reason: 'r' }), 'VMU_INVALID_ARGUMENT', 'grant: missing `from` refused')
  throwsNamed(() => d.grant({ from: 'alice', scope: SCOPE_TASK, reason: 'r' }), 'VMU_INVALID_ARGUMENT', 'grant: missing `to` refused')
  throwsNamed(() => d.grant({ from: 'alice', to: 'bob', scope: 'everything', reason: 'r' }), 'VMU_INVALID_ARGUMENT', 'grant: a non-object scope refused')
  throwsNamed(() => d.grant({ from: 'alice', to: 'bob', scope: { commands: [1] }, reason: 'r' }), 'VMU_INVALID_ARGUMENT', 'grant: a non-string scope item refused')
  throwsNamed(() => d.revoke({ id: 'd-404', by: 'alice' }), 'VMU_NO_SUCH_OBJECT', 'revoke: an unknown id refused with the known list')
  throwsNamed(() => d.check({ action: 'task/create' }), 'VMU_INVALID_ARGUMENT', 'check: a missing actor refused')
  throwsNamed(() => d.spend({ id: 'd-404' }), 'VMU_NO_SUCH_OBJECT', 'spend: an unknown id refused')
  const g = d.grant({ from: 'alice', to: 'bob', scope: SCOPE_TASK, reason: 'r' })
  throwsNamed(() => d.grant({ from: 'alice', to: 'bob', scope: SCOPE_TASK, reason: 'r' }), 'VMU_STATE', 'grant: a duplicate ACTIVE delegation refused')
  d.revoke({ id: g.id, by: 'alice' })
  ok(d.grant({ from: 'alice', to: 'bob', scope: SCOPE_TASK, reason: 'r' }).ok === true, 'grant: after revocation the pair can be granted again')
  const e = throwsNamed(() => d.check({ actor: 'bob', action: 'task/create', scope: { commands: ['task/delete'] } }), 'VMU_DELEGATION_ESCALATION', 'check: a requested scope beyond the grant is refused by name')
  ok(!!e && /task\/delete/.test(e.message), 'check: the escalation refusal names the item')
  throwsNamed(() => d.declareAuthority({ actor: 'nobody', scope: { commands: [] } }), 'VMU_INVALID_ARGUMENT', 'declareAuthority: an empty authority refused')
  ok(refuse('X', 'y', 'z').code === 'X' && refuse('X', 'y', 'z').hint === 'z', 'refuse(): the named-error helper keeps code/hint')
}

// ── 17. declareAuthority is the non-delegation source, and it is audited ───────────────────────────
{
  const c = fakeClock(7)
  const log = fakeLog()
  const d = createDelegation({ clock: c.clock, log })
  const r = d.declareAuthority({ actor: 'office', scope: { commands: ['task/archive'] }, reason: 'the office owns archiving' })
  ok(r.ok === true && r.scope.commands[0] === 'task/archive', 'authority: a root authority can be declared')
  ok(d.grant({ from: 'office', to: 'clerk', scope: { commands: ['task/archive'] }, reason: 'delegate archiving' }).ok === true, 'authority: it can then be delegated (narrowing)')
  ok(d.check({ actor: 'clerk', action: 'task/archive' }).allowed === true, 'authority: the delegate can act')
  ok(log.rows.some((x) => x.type === 'delegation/authority-declared'), 'authority: the declaration is audited')
  ok(log.rows.some((x) => x.type === 'delegation/granted'), 'authority: the grant is audited')
  ok(d.status().roots.join(',') === 'office', 'authority: status() lists the declared roots')
}

console.log('=== VMU DELEGATION: ' + passed + ' passed, ' + failed + ' failed ===')
if (failed > 0) process.exit(1)

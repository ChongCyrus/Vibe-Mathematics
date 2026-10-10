// Independent test for vmu kernel · charter (no dependency on kernel/index.js).
// Spec source: docs/17-agent-society-and-delegation.md §15 (self-organisation / charter) / §21.3 (codes).
// Four hard invariants under test: ① immutable articles cannot be amended (named) ② a subsidiary may not
// exceed its parent (S-2, named) ③ dissolution needs a reason and is audited ④ a charter that is not in
// force may not be cited (inForce() says false, with the reason and the effective time).
// Run: node tests/vmu-charter.test.mjs     Last line: === VMU CHARTER: N passed, M failed ===
import { createCharter, refuse } from '../vibe-math-vmu/kernel/charter.js'

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
const S = (extra = {}) => Object.assign({ 'vmu.charter.enabled': true }, extra)
function proposeRoot(d, extra = {}) {
  return d.propose(Object.assign({ kind: 'charter', text: 'the institution charter', by: 'office', articles: [{ id: 'A-1', text: 'duties' }, { id: 'A-2', text: 'meetings' }] }, extra))
}
function proposeParent(d, extra = {}) {
  const p = d.propose(Object.assign({ kind: 'charter', text: 'parent charter', by: 'office', authority: { commands: ['task/create', 'task/close'], resources: ['task/1'] } }, extra))
  d.ratify({ id: p.id, by: 'office', votes: [{ by: 'a', choice: 'for' }, { by: 'b', choice: 'for' }] })
  return p
}

// ── 1. zero mechanism: enabled=false (the default) ⇒ writes refused by name, reads still answer ────────
{
  const c = fakeClock(0)
  const d = createCharter({ clock: c.clock })
  ok(d.status().configured === false && d.status().enabled === false, 'zero-mechanism: status().configured=false')
  ok(d.list().count === 0 && d.list().configured === false, 'zero-mechanism: list() is empty and does not throw')
  const inf = d.inForce()
  ok(inf.ok === true && inf.count === 0 && inf.inForce.length === 0, 'zero-mechanism: inForce() is an empty answer, not a throw')
  const e = throwsNamed(() => proposeRoot(d), 'VMU_CHARTER_NOT_AUTHORIZED', 'zero-mechanism: propose() is refused by name')
  ok(!!e && /vmu\.charter\.enabled/.test(String(e.hint)), 'zero-mechanism: the refusal says how to enable it')
  ok(d.status().refusals.VMU_CHARTER_NOT_AUTHORIZED === 1, 'zero-mechanism: the refusal is counted by code')
  throwsNamed(() => d.inForce({ id: 'ch-1' }), 'VMU_NO_SUCH_OBJECT', 'zero-mechanism: querying a charter that does not exist is refused by name')
}

// ── 2. INVARIANT ①: immutable articles cannot be amended (and the refusal NAMES them) ─────────────────
{
  const c = fakeClock(0)
  // The amendment QUORUM gate itself is exercised in §7; here we only care about immutability.
  const d = createCharter({ clock: c.clock, settings: S({ 'vmu.charter.amendNeedsQuorum': false }) })
  const p = proposeRoot(d, { articles: [{ id: 'S-1', text: 'seats carry no policy' }, { id: 'A-2', text: 'meetings' }] })
  ok(p.ok === true && p.version === 1 && p.articles.join(',') === 'S-1,A-2', '①: a charter is proposed with article ids')
  const e = throwsNamed(() => d.amend({ id: p.id, patch: { articles: [{ id: 'S-1', text: 'CHANGED' }, { id: 'A-2', text: 'meetings' }] }, by: 'office' }),
    'VMU_CHARTER_FROZEN', '①: changing an immutable article is refused by name')
  ok(!!e && /S-1/.test(e.message), '①: the refusal NAMES the immutable article (S-1)')
  ok(!!e && /immutable|frozen/i.test(String(e.hint)), '①: the refusal explains immutability')
  const drop = throwsNamed(() => d.amend({ id: p.id, patch: { articles: [{ id: 'A-2', text: 'meetings' }] }, by: 'office' }), 'VMU_CHARTER_FROZEN', '①: silently DROPPING an immutable article is refused too')
  ok(!!drop && /S-1/.test(drop.message), '①: the drop is named as well')
  throwsNamed(() => d.amend({ id: p.id, patch: { removeArticles: ['S-1'] }, by: 'office' }), 'VMU_CHARTER_FROZEN', '①: removeArticles cannot remove an immutable article')
  throwsNamed(() => d.amend({ id: p.id, patch: { addArticles: [{ id: 'S-2', text: 're-added' }] }, by: 'office' }), 'VMU_CHARTER_FROZEN', '①: a frozen id cannot be re-added')
  const fine = d.amend({ id: p.id, patch: { text: 'the institution charter (rev 2)', articles: [{ id: 'S-1', text: 'seats carry no policy' }, { id: 'A-2', text: 'meetings weekly' }, { id: 'A-3', text: 'audit' }] }, by: 'office' })
  ok(fine.ok === true && fine.version === 2 && fine.articles.length === 3, '①: amending everything ELSE works and bumps the version')
  ok(d.articles({ id: p.id }).articles.find((a) => a.id === 'S-1').immutable === true, '①: the frozen article is reported as immutable')
  const own = createCharter({ clock: c.clock, settings: S({ 'vmu.charter.immutableArticles': ['X-9'], 'vmu.charter.amendNeedsQuorum': false }) })
  const q = own.propose({ kind: 'charter', text: 't', by: 'office', articles: [{ id: 'X-9', text: 'frozen by settings' }, { id: 'Y-1', text: 'free' }] })
  throwsNamed(() => own.amend({ id: q.id, patch: { articles: [{ id: 'X-9', text: 'changed' }, { id: 'Y-1', text: 'free' }] }, by: 'office' }), 'VMU_CHARTER_FROZEN', '①: vmu.charter.immutableArticles freezes an article')
  const selfFrozen = own.propose({ kind: 'charter', text: 't2', by: 'office', articles: [{ id: 'Z-1', text: 'x', immutable: true }] })
  throwsNamed(() => own.amend({ id: selfFrozen.id, patch: { articles: [{ id: 'Z-1', text: 'changed' }] }, by: 'office' }), 'VMU_CHARTER_FROZEN', '①: an article may freeze itself with immutable:true')
}

// ── 3. INVARIANT ②: a subsidiary may not exceed its parent (S-2; names the offending items) ───────────
{
  const c = fakeClock(0)
  const d = createCharter({ clock: c.clock, settings: S({ 'vmu.charter.amendNeedsQuorum': false }) })
  const parent = proposeParent(d)
  const child = d.propose({ kind: 'subsidiary', parentId: parent.id, text: 'sub', by: 'office', consent: { by: parent.id }, authority: { commands: ['task/create'] } })
  ok(child.ok === true && child.kind === 'subsidiary' && child.depth === 1, '②: a narrower subsidiary is accepted')
  const e = throwsNamed(() => d.propose({ kind: 'subsidiary', parentId: parent.id, text: 'greedy', by: 'office', consent: { by: parent.id }, authority: { commands: ['task/delete'] } }),
    'VMU_CHARTER_NOT_AUTHORIZED', '②: exceeding the parent is refused by name')
  ok(!!e && /commands\[task\/delete\]/.test(e.message), '②: the refusal NAMES the offending items')
  ok(!!e && /S-2/.test(String(e.hint)), '②: the hint points at S-2 / narrowing')
  ok(d.list({ kind: 'subsidiary' }).count === 1, '②: the refused subsidiary does not exist')
  const amendExceed = throwsNamed(() => d.amend({ id: child.id, patch: { authority: { commands: ['task/create', 'task/delete'] } }, by: 'office' }),
    'VMU_CHARTER_NOT_AUTHORIZED', '②: an amendment that would exceed the parent is refused too')
  ok(!!amendExceed && /task\/delete/.test(amendExceed.message), '②: the amendment refusal names the item')
  ok(d.amend({ id: child.id, patch: { authority: { commands: ['task/create'], resources: ['task/1'] } }, by: 'office' }).ok === true, '②: narrowing further is allowed')
  throwsNamed(() => d.propose({ kind: 'subsidiary', parentId: parent.id, text: 'no consent', by: 'office', authority: { commands: ['task/create'] } }),
    'VMU_CHARTER_NOT_AUTHORIZED', '②: requiresParentConsent=true refuses a unilateral subsidiary')
  const noConsent = createCharter({ clock: c.clock, settings: S({ 'vmu.charter.requiresParentConsent': false }) })
  const p2 = proposeParent(noConsent)
  ok(noConsent.propose({ kind: 'subsidiary', parentId: p2.id, text: 'sub', by: 'office', authority: { commands: ['task/create'] } }).ok === true, '②: requiresParentConsent=false allows it (disclosed in status)')
  ok(noConsent.status().requiresParentConsent === false, '②: status() declares the consent rule')
  throwsNamed(() => d.propose({ kind: 'charter', parentId: parent.id, text: 'x', by: 'office' }), 'VMU_INVALID_ARGUMENT', '②: parentId on a non-subsidiary is refused')
  throwsNamed(() => d.propose({ kind: 'subsidiary', text: 'x', by: 'office', authority: {} }), 'VMU_INVALID_ARGUMENT', '②: a subsidiary without a parentId is refused')

  const deep = createCharter({ clock: c.clock, settings: S({ 'vmu.charter.depthMax': 1 }) })
  const dp = proposeParent(deep)
  const dc = deep.propose({ kind: 'subsidiary', parentId: dp.id, text: 'child', by: 'office', consent: { by: dp.id }, authority: { commands: ['task/create'] } })
  deep.ratify({ id: dc.id, by: 'office', votes: [{ by: 'a', choice: 'for' }] })
  const de = throwsNamed(() => deep.propose({ kind: 'subsidiary', parentId: dc.id, text: 'grandchild', by: 'office', consent: { by: dc.id }, authority: { commands: ['task/create'] } }),
    'VMU_CHARTER_DEPTH', '②: exceeding depthMax is refused by name')
  ok(!!de && /depthMax=1/.test(de.message), '②: the depth refusal states the cap')
  const capped = createCharter({ clock: c.clock, settings: S({ 'vmu.charter.spawnMaxChildren': 1 }) })
  const cp = proposeParent(capped)
  capped.propose({ kind: 'subsidiary', parentId: cp.id, text: 'one', by: 'office', consent: { by: cp.id }, authority: { commands: ['task/create'] } })
  const ce = throwsNamed(() => capped.propose({ kind: 'subsidiary', parentId: cp.id, text: 'two', by: 'office', consent: { by: cp.id }, authority: { commands: ['task/create'] } }),
    'VMU_CHARTER_NOT_AUTHORIZED', '②: spawnMaxChildren is enforced')
  ok(!!ce && /1\/1/.test(ce.message), '②: the children refusal states the usage')
}

// ── 4. INVARIANT ③: dissolution needs a reason, is audited, and respects the human gate ──────────────
{
  const c = fakeClock(0)
  const log = fakeLog()
  const d = createCharter({ clock: c.clock, log, settings: S() })
  const p = proposeRoot(d)
  throwsNamed(() => d.dissolve({ id: p.id, by: 'office' }), 'VMU_REASON_REQUIRED', '③: dissolution without a reason is refused')
  const e = throwsNamed(() => d.dissolve({ id: p.id, by: 'office', reason: 'no longer needed' }), 'VMU_CHARTER_DISSOLVE_DENIED', '③: the human gate refuses an unattended dissolution')
  ok(!!e && /dissolveNeedsHuman/.test(e.message), '③: the refusal names the setting')
  throwsNamed(() => d.dissolve({ id: p.id, by: 'office', human: true }), 'VMU_REASON_REQUIRED', '③: human approval does not remove the reason requirement')
  const r = d.dissolve({ id: p.id, by: 'office', human: true, reason: 'no longer needed' })
  ok(r.ok === true && r.dissolvedAt === 0 && r.reason === 'no longer needed', '③: a reasoned, human-approved dissolution succeeds')
  ok(log.rows.some((x) => x.type === 'charter/dissolved' && x.why === 'no longer needed'), '③: the dissolution is AUDITED with its reason')
  ok(d.history({ id: p.id }).rows.some((x) => x.type === 'charter/dissolved'), '③: it is in the charter history')
  ok(d.dissolve({ id: p.id, by: 'office', reason: 'again', human: true }).already === true, '③: dissolving twice is idempotent')
  ok(d.status().charters.dissolved === 1, '③: status() counts the dissolution')
  const relaxed = createCharter({ clock: c.clock, settings: S({ 'vmu.charter.dissolveNeedsHuman': false, 'vmu.charter.dissolveRequiresReason': false }) })
  const q = proposeRoot(relaxed)
  ok(relaxed.dissolve({ id: q.id, by: 'office' }).ok === true, '③: both gates can be relaxed by settings (disclosed in status)')

  const branch = createCharter({ clock: c.clock, settings: S({ 'vmu.charter.dissolveNeedsHuman': false }) })
  const bp = proposeParent(branch)
  const bc = branch.propose({ kind: 'subsidiary', parentId: bp.id, text: 'child', by: 'office', consent: { by: bp.id }, authority: { commands: ['task/create'] } })
  const be = throwsNamed(() => branch.dissolve({ id: bp.id, by: 'office', reason: 'end' }), 'VMU_CHARTER_DISSOLVE_DENIED', '③: dissolving a parent with live children is refused')
  ok(!!be && new RegExp(bc.id).test(be.message), '③: the refusal NAMES the live children')
  const casc = branch.dissolve({ id: bp.id, by: 'office', reason: 'end', cascade: true })
  ok(casc.cascaded.join(',') === bc.id, '③: cascade dissolves the branch and reports the children')
  ok(branch.inForce({ id: bc.id }).inForce === false && branch.inForce({ id: bc.id }).reason === 'dissolved', '③: a cascaded child is no longer in force')
  const succ = createCharter({ clock: c.clock, settings: S({ 'vmu.charter.dissolveNeedsHuman': false }) })
  const a = proposeParent(succ)
  const b = succ.propose({ kind: 'subsidiary', parentId: a.id, text: 'child', by: 'office', consent: { by: a.id }, authority: { commands: ['task/create'] } })
  throwsNamed(() => succ.dissolve({ id: a.id, by: 'office', reason: 'end', cascade: true, successor: b.id }), 'VMU_STATE', '③: a successor inside the branch is refused')
  throwsNamed(() => succ.dissolve({ id: b.id, by: 'office', reason: 'end', successor: 'ch-404' }), 'VMU_NO_SUCH_OBJECT', '③: an unknown successor is refused')
  const c2 = proposeParent(succ)
  ok(succ.dissolve({ id: b.id, by: 'office', reason: 'end', successor: c2.id }).successor === c2.id, '③: an outside in-force successor is recorded')
}

// ── 5. INVARIANT ④: not in force ⇒ inForce() false WITH the reason/effective time, and cite() refuses ─
{
  const c = fakeClock(0)
  const d = createCharter({ clock: c.clock, settings: S({ 'vmu.charter.effectiveDelayMs': 100 }) })
  const p = proposeRoot(d)
  const before = d.inForce({ id: p.id })
  ok(before.inForce === false && before.reason === 'not-ratified' && before.effectiveAt === null, '④: a proposal is explicitly NOT in force (not-ratified)')
  ok(/do not rely on it/.test(before.note), '④: the answer says plainly not to rely on it')
  throwsNamed(() => d.cite({ id: p.id, by: 'alpha' }), 'VMU_STATE', '④: a draft may not be cited')
  const rate = d.ratify({ id: p.id, by: 'office', votes: [{ by: 'a', choice: 'for' }, { by: 'b', choice: 'for' }] })
  ok(rate.inForceAt === 100 && rate.inForceNow === false, '④: ratification starts the effective delay (in force at 100ms)')
  const mid = d.inForce({ id: p.id })
  ok(mid.inForce === false && mid.reason === 'not-yet-effective' && mid.effectiveAt === 100, '④: inside the delay it is explicitly not in force, with the time')
  throwsNamed(() => d.cite({ id: p.id }), 'VMU_STATE', '④: a ratified-but-not-yet-effective charter may not be cited')
  c.advance(100)
  ok(d.inForce({ id: p.id }).inForce === true, '④: at the effective time it becomes in force')
  const cited = d.cite({ id: p.id, articleId: 'A-1', by: 'alpha' })
  ok(cited.ok === true && cited.article.id === 'A-1' && cited.version === 1, '④: an in-force charter can be cited (article included)')
  throwsNamed(() => d.cite({ id: p.id, articleId: 'NOPE' }), 'VMU_NO_SUCH_OBJECT', '④: citing an unknown article is refused with the known list')
  ok(d.inForce({ id: p.id, at: 50 }).inForce === false, '④: inForce({ at }) answers for an explicit moment')
  const noDelay = createCharter({ clock: c.clock, settings: S() })
  const q = proposeRoot(noDelay)
  ok(noDelay.ratify({ id: q.id, by: 'office', votes: [{ by: 'a', choice: 'for' }] }).inForceNow === true, '④: with no delay the charter is in force at ratification')
  ok(noDelay.inForce().count === 1 && noDelay.inForce().inForce[0].id === q.id, '④: the no-id form lists what IS in force')
  ok(noDelay.status().charters.inForce === 1, '④: status() counts the in-force charters')
  const draft2 = proposeRoot(d, { text: 'not yet ratified' })
  const blocked = throwsNamed(() => d.propose({ kind: 'subsidiary', parentId: draft2.id, text: 'x', by: 'office', consent: { by: draft2.id }, authority: { commands: [] } }),
    'VMU_STATE', '④: a subsidiary may not be founded under a charter that is NOT in force')
  ok(!!blocked && /not-ratified/.test(blocked.message), '④: the refusal states WHY the parent is not in force')
}

// ── 6. ratification thresholds (silence is not consent) ───────────────────────────────────────────────
{
  const c = fakeClock(0)
  const d = createCharter({ clock: c.clock, settings: S({ 'vmu.charter.ratifyThreshold': 0.75 }) })
  const p = proposeRoot(d)
  throwsNamed(() => d.ratify({ id: p.id, by: 'office' }), 'VMU_CHARTER_QUORUM', 'ratify: a silent ratification is refused')
  throwsNamed(() => d.ratify({ id: p.id, by: 'office', votes: [] }), 'VMU_CHARTER_QUORUM', 'ratify: an empty vote list is refused')
  const e = throwsNamed(() => d.ratify({ id: p.id, by: 'office', votes: [{ by: 'a', choice: 'for' }, { by: 'b', choice: 'against' }] }), 'VMU_CHARTER_QUORUM', 'ratify: a below-threshold vote is refused')
  ok(!!e && /1\/2/.test(e.message) && /0\.75/.test(e.message), 'ratify: the refusal states the tally and the threshold')
  const rate = d.ratify({ id: p.id, by: 'office', votes: [{ by: 'a', choice: 'for' }, { by: 'b', choice: 'for' }, { by: 'c', choice: 'for' }, { by: 'd', choice: 'against' }, { by: 'e', choice: 'abstain' }] })
  ok(rate.ok === true && rate.tally.for === 3 && rate.tally.against === 1 && rate.tally.abstain === 1, 'ratify: abstentions are counted but excluded from the denominator (3/4 = 0.75 ≥ 0.75)')
  const tallyForm = createCharter({ clock: c.clock, settings: S() })
  const q = proposeRoot(tallyForm)
  ok(tallyForm.ratify({ id: q.id, by: 'office', votes: { for: 3, against: 1 } }).ok === true, 'ratify: a tally object is accepted')
  const numForm = createCharter({ clock: c.clock, settings: S() })
  const r = proposeRoot(numForm)
  ok(numForm.ratify({ id: r.id, by: 'office', votes: 2 }).ok === true, 'ratify: a plain number of decisive votes is accepted')
  throwsNamed(() => numForm.ratify({ id: r.id, by: 'office', votes: [{ by: '' }] }), 'VMU_INVALID_ARGUMENT', 'ratify: a vote without a voter is refused')
}

// ── 7. amendment gates (amendNeedsQuorum / amendQuorum / amendNeedsHuman) ────────────────────────────
{
  const c = fakeClock(0)
  const d = createCharter({ clock: c.clock, settings: S({ 'vmu.charter.amendQuorum': 0.5 }) })
  const p = proposeRoot(d)
  const e = throwsNamed(() => d.amend({ id: p.id, patch: { text: 'x' }, by: 'office' }), 'VMU_CHARTER_QUORUM', 'amend: amendNeedsQuorum=true refuses an unrecorded amendment')
  ok(!!e && /approval/.test(String(e.hint)), 'amend: the refusal asks for an approval record')
  const low = throwsNamed(() => d.amend({ id: p.id, patch: { text: 'x' }, by: 'office', approval: { support: 1, eligible: 3 } }), 'VMU_CHARTER_QUORUM', 'amend: below amendQuorum is refused')
  ok(!!low && /1\/3/.test(low.message), 'amend: the refusal states the support')
  ok(d.amend({ id: p.id, patch: { text: 'x' }, by: 'office', approval: { support: 2, eligible: 3 } }).ok === true, 'amend: at/above the quorum it succeeds')
  const human = createCharter({ clock: c.clock, settings: S({ 'vmu.charter.amendQuorum': 0, 'vmu.charter.amendNeedsQuorum': false, 'vmu.charter.amendNeedsHuman': true }) })
  const q = proposeRoot(human)
  throwsNamed(() => human.amend({ id: q.id, patch: { text: 'y' }, by: 'office' }), 'VMU_NOT_PERMITTED', 'amend: amendNeedsHuman refuses a machine-only amendment')
  ok(human.amend({ id: q.id, patch: { text: 'y' }, by: 'office', approval: { human: true } }).ok === true, 'amend: an explicit human approval unlocks it')
  const both = createCharter({ clock: c.clock, settings: S({ 'vmu.charter.amendQuorum': 0.5, 'vmu.charter.amendNeedsHuman': true }) })
  const q2 = proposeRoot(both)
  const first = throwsNamed(() => both.amend({ id: q2.id, patch: { text: 'y' }, by: 'office' }), 'VMU_CHARTER_QUORUM', 'amend: with both gates on, the missing approval record is reported first (documented order)')
  ok(!!first && /approval record/.test(first.message), 'amend: the first refusal is the quorum one, as documented')
  const free = createCharter({ clock: c.clock, settings: S({ 'vmu.charter.amendNeedsQuorum': false, 'vmu.charter.amendNeedsHuman': false }) })
  const r = proposeRoot(free)
  ok(free.amend({ id: r.id, patch: { text: 'z' }, by: 'office' }).ok === true, 'amend: both gates can be relaxed by settings')
  throwsNamed(() => free.amend({ id: r.id, patch: { text: 'z' } }), 'VMU_INVALID_ARGUMENT', 'amend: a missing `by` is refused')
  throwsNamed(() => free.amend({ id: r.id, by: 'office' }), 'VMU_INVALID_ARGUMENT', 'amend: a missing patch is refused')
  const dis = createCharter({ clock: c.clock, settings: S({ 'vmu.charter.amendNeedsQuorum': false, 'vmu.charter.dissolveNeedsHuman': false }) })
  const s = proposeRoot(dis)
  dis.dissolve({ id: s.id, by: 'office', reason: 'end' })
  throwsNamed(() => dis.amend({ id: s.id, patch: { text: 'no' }, by: 'office' }), 'VMU_STATE', 'amend: a dissolved charter cannot be amended')
}

// ── 8. maxArticles ────────────────────────────────────────────────────────────────────────────────────
{
  const c = fakeClock(0)
  const d = createCharter({ clock: c.clock, settings: S({ 'vmu.charter.maxArticles': 2, 'vmu.charter.amendNeedsQuorum': false }) })
  throwsNamed(() => d.propose({ kind: 'charter', text: 't', by: 'office', articles: [{ id: 'A' }, { id: 'B' }, { id: 'C' }] }), 'VMU_INVALID_ARGUMENT', 'maxArticles: too many articles are refused')
  const p = d.propose({ kind: 'charter', text: 't', by: 'office', articles: [{ id: 'A' }, { id: 'B' }] })
  throwsNamed(() => d.amend({ id: p.id, patch: { addArticles: [{ id: 'C' }] }, by: 'office' }), 'VMU_INVALID_ARGUMENT', 'maxArticles: an amendment may not exceed the cap')
  ok(d.status().maxArticles === 2, 'maxArticles: status() reports the cap')
}

// ── 9. truncation counting: list()/history()/children()/articles() all report drops ───────────────────
{
  const c = fakeClock(0)
  const d = createCharter({ clock: c.clock, settings: S({ 'vmu.charter.requiresParentConsent': false, 'vmu.charter.effectiveDelayMs': 0 }) })
  const parent = proposeParent(d)
  for (let i = 1; i <= 5; i++) d.propose({ kind: 'charter', text: 't' + i, by: 'office', articles: [{ id: 'A' + i }] })
  for (let i = 1; i <= 2; i++) d.propose({ kind: 'subsidiary', parentId: parent.id, text: 's' + i, by: 'office', authority: { commands: ['task/create'] } })
  const all = d.list()
  ok(all.count === 8 && all.available === 8 && all.dropped === 0 && all.truncated === false, 'list: eight charters, no truncation')
  const capped = d.list({ limit: 2 })
  ok(capped.count === 2 && capped.available === 8 && capped.dropped === 6 && capped.truncated === true, 'list: a limit reports the DROPPED count (6)')
  ok(capped.charters[0].id === 'ch-1' && capped.charters[1].id === 'ch-2', 'list: deterministic insertion order')
  const kids = d.children({ id: parent.id, limit: 1 })
  ok(kids.count === 1 && kids.available === 2 && kids.dropped === 1 && kids.truncated === true, 'children: a limit reports the DROPPED count')
  const arts = d.articles({ id: all.charters[1].id, limit: 0 })
  ok(arts.count >= 1 && arts.available === arts.count, 'articles: limit=0 falls back to the cap (no silent empty answer)')
  const h = d.history({ limit: 2 })
  ok(h.count === 2 && h.available >= 8 && h.dropped === h.available - 2 && h.truncated === true, 'history: the ring also reports drops')
  ok(d.list({ kind: 'subsidiary' }).count === 2 && d.list({ state: 'proposed' }).count >= 7, 'list: kind/state filters work')
  ok(d.list({ limit: 3 }).inForce >= 1, 'list: the in-force count is included')
}

// ── 10. read-only purity + determinism ───────────────────────────────────────────────────────────────
{
  const c = fakeClock(7)
  const build = () => {
    const d = createCharter({ clock: c.clock, settings: S() })
    const p = proposeParent(d)
    d.ratify({ id: p.id, by: 'office', votes: [{ by: 'a', choice: 'for' }] })
    return { d, p }
  }
  const { d, p } = build()
  const before = JSON.stringify(d.list()) + '|' + JSON.stringify(d.status()) + '|' + JSON.stringify(d.history()) + '|' + JSON.stringify(d.inForce({ id: p.id })) + '|' + JSON.stringify(d.articles({ id: p.id }))
  for (let i = 0; i < 3; i++) { d.list(); d.status(); d.history(); d.inForce({ id: p.id }); d.articles({ id: p.id }); d.cite({ id: p.id }) }
  const after = JSON.stringify(d.list()) + '|' + JSON.stringify(d.status()) + '|' + JSON.stringify(d.history()) + '|' + JSON.stringify(d.inForce({ id: p.id })) + '|' + JSON.stringify(d.articles({ id: p.id }))
  ok(before === after, 'read-only: list/status/history/inForce/articles never mutate charters')
  const a = build(); const b = build()
  const aS = a.d; const bS = b.d
  ok(JSON.stringify(aS.list()) === JSON.stringify(bS.list()), 'determinism: two instances agree on list()')
  ok(JSON.stringify(aS.status()) === JSON.stringify(bS.status()), 'determinism: two instances agree on status()')
  ok(JSON.stringify(aS.history()) === JSON.stringify(bS.history()), 'determinism: two instances agree on history()')
  ok(aS.inForce({ id: a.p.id }).effectiveAt === 7, 'injected clock: the effective time comes from clock() only')
}

// ── 11. bus hooks + the delegation seam (gaps are COUNTED, never silent) ──────────────────────────────
{
  const c = fakeClock(0)
  const bus = fakeBus()
  const d = createCharter({ clock: c.clock, settings: S(), bus })
  const p = proposeRoot(d)
  d.ratify({ id: p.id, by: 'office', votes: [{ by: 'a', choice: 'for' }] })
  d.dissolve({ id: p.id, by: 'office', human: true, reason: 'end' })
  ok(bus.topics.includes('charter/proposed') && bus.topics.includes('charter/ratified') && bus.topics.includes('charter/dissolved'), 'bus: topics are declared through the documented extension point')
  ok(bus.rows.some((x) => x.hook === 'charter/proposed' && x.payload.id === p.id), 'bus: charter/proposed is emitted')
  const broken = createCharter({ clock: c.clock, settings: S(), bus: fakeBus({ throwOnEmit: true }) })
  proposeRoot(broken)
  ok(broken.status().unwired['bus:charter/proposed'] === 1, 'bus: a broken bus is a COUNTED wiring gap')

  const dSeam = { list: ({ active }) => ({ ok: true, grants: [{ id: 'd-1', to: 'ch-1', scope: { commands: ['task/delegate-only'], resources: [] } }] }) }
  const inh = createCharter({ clock: c.clock, settings: S({ 'vmu.charter.inheritDelegation': true, 'vmu.charter.requiresParentConsent': false }), delegation: dSeam })
  const ip = proposeParent(inh)
  const ic = inh.propose({ kind: 'subsidiary', parentId: ip.id, text: 'sub', by: 'office', authority: { commands: ['task/create', 'task/delegate-only'] } })
  ok(ic.ok === true, 'delegation seam: inheritDelegation widens the PARENT authority by its own delegations (still narrowing for the child)')
  const bad = throwsNamed(() => inh.propose({ kind: 'subsidiary', parentId: ip.id, text: 'x', by: 'office', authority: { commands: ['task/not-granted'] } }), 'VMU_CHARTER_NOT_AUTHORIZED', 'delegation seam: an ungranted command is still refused')
  ok(!!bad, 'delegation seam: the refusal is named')
  const brokenSeam = createCharter({ clock: c.clock, settings: S({ 'vmu.charter.inheritDelegation': true, 'vmu.charter.requiresParentConsent': false }), delegation: { list: () => { throw new Error('seam down') } } })
  const bp = proposeParent(brokenSeam)
  brokenSeam.propose({ kind: 'subsidiary', parentId: bp.id, text: 's', by: 'office', authority: { commands: ['task/create'] } })
  ok(brokenSeam.status().unwired['delegation-seam'] >= 1, 'delegation seam: a seam that cannot answer is a COUNTED wiring gap')
  ok(inh.status().delegationInjected === true && inh.status().inheritDelegation === true, 'delegation seam: status() is explicit about the seam and the setting')
}

// ── 12. the remaining named refusals ──────────────────────────────────────────────────────────────────
{
  const c = fakeClock(0)
  const d = createCharter({ clock: c.clock, settings: S() })
  throwsNamed(() => d.propose({ kind: 'republic', text: 't', by: 'office' }), 'VMU_INVALID_ARGUMENT', 'propose: an unknown kind is refused')
  throwsNamed(() => d.propose({ kind: 'charter', by: 'office' }), 'VMU_INVALID_ARGUMENT', 'propose: a missing text is refused')
  throwsNamed(() => d.propose({ kind: 'charter', text: 't' }), 'VMU_INVALID_ARGUMENT', 'propose: a missing proposer is refused')
  throwsNamed(() => d.propose({ kind: 'charter', text: 't', by: 'office', articles: [{ id: 'A' }, { id: 'A' }] }), 'VMU_INVALID_ARGUMENT', 'propose: duplicate article ids are refused')
  throwsNamed(() => d.propose({ kind: 'charter', text: 't', by: 'office', articles: [{ text: 'no id' }] }), 'VMU_INVALID_ARGUMENT', 'propose: an article without an id is refused')
  const p = proposeRoot(d)
  throwsNamed(() => d.amend({ id: 'ch-404', patch: { text: 'x' }, by: 'office', approval: { support: 9, eligible: 9 } }), 'VMU_NO_SUCH_OBJECT', 'amend: an unknown charter is refused')
  throwsNamed(() => d.ratify({ id: p.id, votes: [{ by: 'a', choice: 'for' }] }), 'VMU_INVALID_ARGUMENT', 'ratify: a missing ratifier is refused')
  throwsNamed(() => d.articles({ id: 'ch-404' }), 'VMU_NO_SUCH_OBJECT', 'articles: an unknown charter is refused')
  throwsNamed(() => d.children({ id: 'ch-404' }), 'VMU_NO_SUCH_OBJECT', 'children: an unknown charter is refused')
  throwsNamed(() => d.dissolve({ id: p.id, reason: 'x', human: true }), 'VMU_INVALID_ARGUMENT', 'dissolve: a missing actor is refused')
  ok(d.status().refusals.VMU_INVALID_ARGUMENT >= 6 && d.status().refusals.VMU_NO_SUCH_OBJECT >= 2, 'refusals: every refusal is counted by code')
  ok(refuse('X', 'y', 'z').code === 'X' && refuse('X', 'y', 'z').hint === 'z', 'refuse(): the named-error helper keeps code/hint')
}

console.log('=== VMU CHARTER: ' + passed + ' passed, ' + failed + ' failed ===')
if (failed > 0) process.exit(1)

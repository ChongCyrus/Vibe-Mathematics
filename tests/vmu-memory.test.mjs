// Independent test for vmu kernel · memory (no dependency on kernel/index.js).
// Spec source: docs/17-agent-society-and-delegation.md §9 (memory & knowledge) / §21.2 (codes).
// Four hard invariants under test: ① memory NEVER authorizes ② contradictions are never silent
// ③ expiry self-discloses (`stale:true`, counted exclusions) ④ `supersede` needs a reason.
// Run: node tests/vmu-memory.test.mjs     Last line: === VMU MEMORY: N passed, M failed ===
import { createMemory, refuse } from '../vibe-math-vmu/kernel/memory.js'

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
// Baseline: the scope default fills in for most tests; the dedicated unscoped-refusal test turns the
// requirement ON (`scopeRequired: true`) to prove the refusal is named.
const S = (extra = {}) => Object.assign({ 'vmu.memory.scopeRequired': false, 'vmu.memory.scopeDefault': 'institution' }, extra)
const CARD = { kind: 'lesson', text: 'the freeze path double-counts refusals', by: 'alpha', evidence: ['lib-1'] }

// ── 1. zero mechanism: no entries ⇒ reads answer empty, nothing throws ────────────────────────────────
{
  const c = fakeClock(0)
  const m = createMemory({ clock: c.clock })
  ok(m.status().configured === false, 'zero-mechanism: status().configured=false')
  const r = m.recall()
  ok(r.ok === true && r.count === 0 && r.entries.length === 0 && r.dropped === 0, 'zero-mechanism: recall() is empty and does not throw')
  ok(m.list().count === 0 && m.list().configured === false, 'zero-mechanism: list() is empty')
  ok(m.contradictions().count === 0 && m.contradictions().pairs.length === 0, 'zero-mechanism: contradictions() is empty')
  ok(m.expire().count === 0, 'zero-mechanism: expire() reports nothing stale')
  ok(m.history().count === 0, 'zero-mechanism: history() is empty')
  ok(m.compact({ keepEvery: 0 }).ok === true && m.compact({ keepEvery: 0 }).dropped.length === 0, 'zero-mechanism: a no-op compaction is harmless')
}

// ── 2. INVARIANT ①: memory NEVER authorizes (may/authorize always refuse by name) ─────────────────────
{
  const c = fakeClock(0)
  const trust = { score: () => 1 }   // a high-reputation seam must change NOTHING
  const m = createMemory({ clock: c.clock, trust, settings: S() })
  const e1 = throwsNamed(() => m.may({ actor: 'alpha', action: 'task/create' }), 'VMU_MEMORY_NOT_AUTHORITY', '①: may() refuses by name')
  ok(!!e1 && /S-3/.test(String(e1.hint)) && /kernel\/members\.js/.test(String(e1.hint)), '①: the refusal explains where authority really comes from')
  throwsNamed(() => m.authorize({ actor: 'alpha', action: 'task/create' }), 'VMU_MEMORY_NOT_AUTHORITY', '①: the authorize() alias refuses identically')
  throwsNamed(() => m.may({}), 'VMU_MEMORY_NOT_AUTHORITY', '①: a call without arguments is refused too (never a silent true)')
  m.record(CARD)
  throwsNamed(() => m.may({ actor: 'alpha', action: 'task/create' }), 'VMU_MEMORY_NOT_AUTHORITY', '①: having a memory does NOT change the answer')
  ok(m.status().refusals.VMU_MEMORY_NOT_AUTHORITY === 4, '①: every refused authority attempt is counted by code')
  ok(m.status().trustInjected === true && m.status().trustUsedForAuthority === false, '①: the trust seam is reported and explicitly unused for authority')
  ok(m.recall().count === 1, '①: the memory itself is still readable (it is advice, not authority)')
}

// ── 3. recording: kinds, scopes, evidence, scopeRequired, caps ────────────────────────────────────────
{
  const c = fakeClock(0)
  const m = createMemory({ clock: c.clock, settings: S() })
  const r = m.record({ kind: 'lesson', text: 'rebase before the long run', by: 'alpha', evidence: ['lib-1'], scope: 'team', tags: ['process'] })
  ok(r.ok === true && r.id === 'm-1' && r.scope === 'team', 'record: a card is stored with a deterministic id')
  ok(r.expiresAt === null, 'record: with no TTL the card never expires')
  const kinds = ['lesson', 'antipattern', 'fact', 'preference']
  for (const k of kinds.slice(1)) m.record({ kind: k, text: 'text for ' + k, by: 'beta', evidence: ['lib-1'] })
  ok(m.recall().count === 4, 'record: all four documented kinds are accepted')
  throwsNamed(() => m.record({ kind: 'rumour', text: 'x', by: 'alpha', evidence: ['lib-1'] }), 'VMU_MEMORY_CARD_INVALID', 'record: an unknown kind is refused')
  throwsNamed(() => m.record({ kind: 'fact', text: '  ', by: 'alpha', evidence: ['lib-1'] }), 'VMU_MEMORY_CARD_INVALID', 'record: blank text is refused')
  throwsNamed(() => m.record({ kind: 'fact', text: 'x' }), 'VMU_MEMORY_CARD_INVALID', 'record: a missing author is refused')
  throwsNamed(() => m.record({ kind: 'fact', text: 'x', by: 'alpha' }), 'VMU_MEMORY_CARD_INVALID', 'record: missing evidence is refused when requireEvidence=true')
  throwsNamed(() => m.record({ kind: 'fact', text: 'x', by: 'alpha', evidence: ['lib-1'], scope: 'galaxy' }), 'VMU_INVALID_ARGUMENT', 'record: an unknown scope is refused')
  throwsNamed(() => m.record({ kind: 'fact', text: 'x', by: 'alpha', evidence: ['lib-1'], visibility: 'secret' }), 'VMU_INVALID_ARGUMENT', 'record: an unknown visibility is refused')
  ok(m.status().kinds.join(',') === 'lesson,antipattern,fact,preference,obstacle,rejected', 'status: the declared kinds are reported (four task kinds + obstacle/rejected)')
  const noScope = createMemory({ clock: c.clock, settings: S({ 'vmu.memory.scopeRequired': false, 'vmu.memory.scopeDefault': 'agent' }) })
  const nr = noScope.record({ kind: 'fact', text: 'no explicit scope', by: 'alpha', evidence: ['lib-1'] })
  ok(nr.scope === 'agent', 'record: scopeDefault applies when scopeRequired=false')
  ok(noScope.status().scopeDefault === 'agent', 'status: the default scope is reported')
  const scoped = createMemory({ clock: c.clock, settings: S({ 'vmu.memory.scopeRequired': true }) })
  const e = throwsNamed(() => scoped.record({ kind: 'fact', text: 'x', by: 'alpha', evidence: ['lib-1'], scope: null }), 'VMU_MEMORY_KEY_UNSCOPED', 'record: an unscoped key can be refused by name')
  ok(!!e, 'record: the unscoped refusal is named')
  const cap = createMemory({ clock: c.clock, settings: S({ 'vmu.memory.maxCards': 1 }) })
  cap.record({ kind: 'fact', text: 'first', by: 'alpha', evidence: ['lib-1'] })
  const full = throwsNamed(() => cap.record({ kind: 'fact', text: 'second', by: 'alpha', evidence: ['lib-1'] }), 'VMU_STATE', 'record: the cap refuses a new card instead of silently evicting')
  ok(!!full && /1\/1/.test(full.message), 'record: the cap refusal states the usage')
  ok(cap.list().count === 1 && cap.recall().count === 1, 'record: the cap did not evict anything')
}

// ── 4. INVARIANT ②: contradictions are never silent (report | block | supersede) ─────────────────────
{
  const c = fakeClock(0)
  const report = createMemory({ clock: c.clock, settings: S({ 'vmu.memory.contradictionPolicy': 'report' }) })
  const a = report.record({ kind: 'fact', text: 'the index is rebuilt at 03:00', by: 'alpha', evidence: ['lib-1'], scope: 'institution' })
  const b = report.record({ kind: 'fact', text: 'the index is rebuilt at 04:00', by: 'beta', evidence: ['lib-2'], scope: 'institution' })
  ok(b.ok === true && b.contradictions.join(',') === a.id, '②: report accepts the new card AND reports the conflict')
  const pairs = report.contradictions()
  ok(pairs.count === 1 && pairs.pairs[0].a === a.id && pairs.pairs[0].b === b.id, '②: contradictions() shows the pair')
  ok(pairs.policy === 'report' && /MUST be resolved/.test(pairs.note), '②: the policy is stated with the list')
  ok(report.recall().count === 2, '②: report keeps BOTH cards visible (nothing is hidden)')
  const same = report.record({ kind: 'fact', text: '  The   INDEX is rebuilt at 04:00 ', by: 'gamma', evidence: ['lib-3'], scope: 'institution' })
  ok(same.contradictions.length === 1, '②: normalised duplicates are not contradictions (only a+b, not the restatement)')
  ok(report.contradictions().count === 2, '②: both conflicting pairs are visible')
  ok(report.record({ kind: 'fact', text: 'different scope', by: 'delta', evidence: ['lib-4'], scope: 'team' }).contradictions.length === 0, '②: a different scope is not a contradiction')

  const block = createMemory({ clock: c.clock, settings: S({ 'vmu.memory.contradictionPolicy': 'block' }) })
  const first = block.record({ kind: 'fact', text: 'the gate is red', by: 'alpha', evidence: ['lib-1'] })
  const e = throwsNamed(() => block.record({ kind: 'fact', text: 'the gate is green', by: 'beta', evidence: ['lib-2'] }), 'VMU_STATE', '②: block refuses the contradicting card')
  ok(!!e && new RegExp(first.id).test(e.message), '②: the block refusal NAMES the existing card')
  ok(block.list().count === 1 && block.contradictions().count === 0, '②: nothing was written by the refused call')
  ok(block.record({ kind: 'fact', text: 'the gate is green', by: 'beta', evidence: ['lib-2'], supersedes: [first.id] }).ok === true, '②: an explicit supersede is the sanctioned way through a block')

  const auto = createMemory({ clock: c.clock, settings: S({ 'vmu.memory.contradictionPolicy': 'supersede' }) })
  const old = auto.record({ kind: 'preference', text: 'prefer tabs', by: 'alpha', evidence: ['lib-1'] })
  const fresh = auto.record({ kind: 'preference', text: 'prefer spaces', by: 'beta', evidence: ['lib-2'] })
  ok(fresh.autoSuperseded.join(',') === old.id, '②: supersede policy auto-supersedes the older card and says so')
  ok(auto.contradictions().count === 0, '②: after the auto-supersede nothing conflicting is live')
  ok(auto.list({ state: 'superseded' }).count === 1, '②: the older card is still listed (superseded, not deleted)')
  ok(auto.history().rows.some((x) => x.type === 'memory/superseded' && x.auto === true), '②: the auto-supersede is audited with its mechanical reason')
  const older = auto.list().entries.find((x) => x.id === old.id)
  ok(/auto: contradictionPolicy/.test(String(older.supersedeReason)), '②: the auto reason is recorded verbatim')
}

// ── 5. INVARIANT ③: expiry self-discloses (stale flag + counted exclusion) ────────────────────────────
{
  const c = fakeClock(0)
  const m = createMemory({ clock: c.clock, settings: S({ 'vmu.memory.cardTtlMs': 100 }) })
  const a = m.record({ kind: 'fact', text: 'short-lived fact', by: 'alpha', evidence: ['lib-1'] })
  ok(a.expiresAt === 100, '③: the TTL comes from the injected clock')
  ok(m.recall().entries[0].stale === false, '③: before the TTL the card is not stale')
  c.advance(150)
  const r = m.recall()
  ok(r.entries[0].stale === true && r.stale === 1, '③: after the TTL recall() marks stale:true and counts it')
  ok(r.count === 1, '③: by default a stale card is still returned (with its flag) — never silently dropped')
  const excluded = m.recall({ excludeStale: true })
  ok(excluded.count === 0 && excluded.excludedStale === 1, '③: excluding stale cards is COUNTED, never a silent omission')
  const noStale = m.recall({ includeStale: false })
  ok(noStale.count === 0 && noStale.excludedStale === 1, '③: the includeStale flag is honoured the same way')
  const swept = m.expire()
  ok(swept.count === 1 && swept.expired[0] === a.id, '③: expire() sweeps the stale card and reports it')
  ok(m.list({ state: 'expired' }).count === 1 && m.list({ state: 'active' }).count === 0, '③: the swept card is listed as expired (not deleted)')
  ok(m.recall().excludedExpired === 1 && m.recall().count === 0, '③: a swept (expired) card is no longer recalled, and the exclusion is counted')
  ok(m.status().entries.expired === 1, '③: status() counts the expired entries')
  const ttlOverride = m.record({ kind: 'fact', text: 'long-lived fact', by: 'beta', evidence: ['lib-2'], ttlMs: 1000 })
  ok(ttlOverride.expiresAt === 1150, '③: a per-card ttlMs overrides the default')
}

// ── 6. INVARIANT ④: supersede needs a reason, and the act is audited ─────────────────────────────────
{
  const c = fakeClock(0)
  const log = fakeLog()
  const m = createMemory({ clock: c.clock, log, settings: S() })
  const a = m.record({ kind: 'fact', text: 'the API is v1', by: 'alpha', evidence: ['lib-1'] })
  throwsNamed(() => m.supersede({ id: a.id, by: 'beta' }), 'VMU_REASON_REQUIRED', '④: superseding without a reason is refused')
  throwsNamed(() => m.supersede({ id: a.id, by: 'beta', reason: '   ' }), 'VMU_REASON_REQUIRED', '④: a blank reason is refused too')
  throwsNamed(() => m.supersede({ id: a.id, reason: 'x' }), 'VMU_INVALID_ARGUMENT', '④: a missing actor is refused')
  throwsNamed(() => m.supersede({ id: 'm-404', by: 'beta', reason: 'x' }), 'VMU_NO_SUCH_OBJECT', '④: an unknown id is refused with the known list')
  const r = m.supersede({ id: a.id, by: 'beta', reason: 'the API moved to v2' })
  ok(r.ok === true && r.supersededAt === 0 && r.reason === 'the API moved to v2', '④: a reasoned supersede succeeds and is dated')
  ok(m.recall().count === 0 && m.recall().excludedSuperseded === 1, '④: a superseded card is not recalled, and the exclusion is counted')
  ok(m.list({ state: 'superseded' }).count === 1, '④: it remains listed as superseded')
  ok(m.supersede({ id: a.id, by: 'beta', reason: 'again' }).already === true, '④: superseding twice is idempotent')
  ok(log.rows.some((x) => x.type === 'memory/superseded' && x.why === 'the API moved to v2'), '④: the reason reaches the audit log')
  const relaxed = createMemory({ clock: c.clock, settings: S({ 'vmu.memory.supersedeNeedsReason': false }) })
  const b = relaxed.record({ kind: 'fact', text: 'x', by: 'alpha', evidence: ['lib-1'] })
  ok(relaxed.supersede({ id: b.id, by: 'beta' }).ok === true, '④: the requirement can be relaxed by settings (disclosed in status)')
  ok(relaxed.status().supersedeNeedsReason === false, '④: status() declares the rule')
}

// ── 7. compaction protects negative knowledge (neverDropKinds) ───────────────────────────────────────
{
  const c = fakeClock(0)
  const m = createMemory({ clock: c.clock, settings: S() })
  const lessons = []
  for (let i = 1; i <= 4; i++) lessons.push(m.record({ kind: 'lesson', text: 'lesson ' + i, by: 'alpha', evidence: ['lib-1'] }).id)
  const rejects = []
  for (let i = 1; i <= 3; i++) rejects.push(m.record({ kind: 'rejected', text: 'rejected approach ' + i, by: 'alpha', evidence: ['lib-2'] }).id)
  const kept = m.compact({ keepEvery: 2 })
  ok(kept.ok === true && kept.dropped.length === 2, 'compact: keepEvery keeps every 2nd lesson and supersedes 2')
  ok(kept.neverDropped.length === 3, 'compact: the protected kind (rejected) is never dropped')
  ok(m.list({ kind: 'rejected', state: 'active' }).count === 3, 'compact: the rejected cards are still active')
  ok(m.list({ kind: 'lesson', state: 'superseded' }).count === 2, 'compact: dropped lessons are superseded, not deleted')
  ok(m.history().rows.some((x) => x.type === 'memory/compacted'), 'compact: the compaction is audited')
  const strict = createMemory({ clock: c.clock, settings: S({ 'vmu.memory.keepEvery': 3 }) })
  for (let i = 1; i <= 4; i++) strict.record({ kind: 'rejected', text: 'reject ' + i, by: 'alpha', evidence: ['lib-1'] })
  const e = throwsNamed(() => strict.compact({ keepEvery: 2, dropKinds: ['rejected'] }), 'VMU_MEMORY_COMPACTION_REFUSED', 'compact: an explicit request to drop a protected kind is refused by name')
  ok(!!e && /rejected/.test(e.message), 'compact: the refusal names the protected kind')
  ok(strict.list({ state: 'active' }).count === 4, 'compact: the refused compaction changed nothing')
  const partial = strict.compact({ keepEvery: 2 })
  ok(partial.dropped.length === 0 && partial.neverDropped.length === 4, 'compact: the protected kind survives the stride and is reported')
  throwsNamed(() => strict.compact({ keepEvery: -1 }), 'VMU_INVALID_ARGUMENT', 'compact: a negative keepEvery is refused')
  throwsNamed(() => strict.compact({ keepEvery: 2, dropKinds: ['rumour'] }), 'VMU_INVALID_ARGUMENT', 'compact: an unknown dropKinds kind is refused')
}

// ── 8. visibility: private cards are not silently invisible ──────────────────────────────────────────
{
  const c = fakeClock(0)
  const m = createMemory({ clock: c.clock, settings: S({ 'vmu.memory.visibility': 'private' }) })
  const mine = m.record({ kind: 'preference', text: 'I prefer short turns', by: 'alpha', evidence: ['lib-1'] })
  m.record({ kind: 'preference', text: 'beta likes long turns', by: 'beta', evidence: ['lib-2'], scope: 'agent' })
  const asAlpha = m.recall({ actor: 'alpha' })
  ok(asAlpha.count === 1 && asAlpha.entries[0].id === mine.id, 'visibility: a private card is readable by its author')
  const asBeta = m.recall({ actor: 'beta' })
  ok(asBeta.excludedByVisibility >= 1, 'visibility: what is filtered out is COUNTED (never a silent omission)')
  const anon = m.recall()
  ok(anon.excludedByVisibility >= 1 && anon.count === 0, 'visibility: without an actor, private cards are excluded but counted')
  ok(m.status().entries.private === 2, 'visibility: status() counts the private cards')
  ok(m.list().count === 2, 'visibility: list() (the operator view) still shows them')
}

// ── 9. truncation counting: recall()/list()/contradictions()/history() ───────────────────────────────
{
  const c = fakeClock(0)
  const m = createMemory({ clock: c.clock, settings: S({ 'vmu.memory.contradictionPolicy': 'report' }) })
  for (let i = 1; i <= 5; i++) m.record({ kind: 'fact', text: 'fact number ' + i, by: 'alpha', evidence: ['lib-1'], scope: 'institution' })
  const all = m.recall({ query: 'fact number' })
  ok(all.count === 5 && all.available === 5 && all.dropped === 0 && all.truncated === false, 'recall: five cards, no truncation')
  const capped = m.recall({ query: 'fact number', limit: 2 })
  ok(capped.count === 2 && capped.available === 5 && capped.dropped === 3 && capped.truncated === true, 'recall: a limit reports the DROPPED count (3)')
  ok(m.list({ limit: 2 }).dropped === 3, 'list: a limit reports drops')
  const pairs = m.contradictions({ limit: 1 })
  ok(pairs.available > 1 && pairs.dropped === pairs.available - 1 && pairs.truncated === true, 'contradictions: a limit reports drops')
  const h = m.history({ limit: 2 })
  ok(h.count === 2 && h.available >= 5 && h.dropped === h.available - 2, 'history: the ring reports drops')
  ok(m.recall({ kind: 'fact' }).count === 5 && m.recall({ kind: 'lesson' }).count === 0, 'recall: kind filter works')
  ok(m.recall({ tags: ['none'] }).count === 0, 'recall: a tag filter with no match returns nothing (no throw)')
}

// ── 10. read-only purity + determinism + the injected clock ──────────────────────────────────────────
{
  const c = fakeClock(7)
  const build = () => {
    const m = createMemory({ clock: c.clock, settings: S({ 'vmu.memory.cardTtlMs': 100 }) })
    m.record({ kind: 'lesson', text: 'a', by: 'alpha', evidence: ['lib-1'] })
    m.record({ kind: 'antipattern', text: 'b', by: 'beta', evidence: ['lib-2'] })
    return m
  }
  const m = build()
  const before = JSON.stringify(m.recall()) + '|' + JSON.stringify(m.status()) + '|' + JSON.stringify(m.history()) + '|' + JSON.stringify(m.contradictions()) + '|' + JSON.stringify(m.list())
  for (let i = 0; i < 3; i++) { m.recall(); m.status(); m.history(); m.contradictions(); m.list() }
  const after = JSON.stringify(m.recall()) + '|' + JSON.stringify(m.status()) + '|' + JSON.stringify(m.history()) + '|' + JSON.stringify(m.contradictions()) + '|' + JSON.stringify(m.list())
  ok(before === after, 'read-only: recall/status/history/contradictions/list never mutate the ledger')
  const a = build(); const b = build()
  ok(JSON.stringify(a.recall()) === JSON.stringify(b.recall()), 'determinism: two instances agree on recall()')
  ok(JSON.stringify(a.status()) === JSON.stringify(b.status()), 'determinism: two instances agree on status()')
  ok(JSON.stringify(a.history()) === JSON.stringify(b.history()), 'determinism: two instances agree on history()')
  ok(m.recall().entries[0].recordedAt === 7, 'injected clock: recordedAt comes from clock() only')
}

// ── 11. seams: library evidence + bus hooks (gaps are COUNTED, never silent) ─────────────────────────
{
  const c = fakeClock(0)
  const bus = fakeBus()
  const library = { list: () => [{ id: 'lib-1' }, { id: 'lib-2' }] }
  const m = createMemory({ clock: c.clock, bus, library, settings: S() })
  const r = m.record({ kind: 'lesson', text: 'with a real library', by: 'alpha', evidence: ['lib-1'] })
  ok(r.ok === true, 'library seam: a known evidence id is accepted')
  const e = throwsNamed(() => m.record({ kind: 'lesson', text: 'bogus evidence', by: 'alpha', evidence: ['lib-9'] }), 'VMU_MEMORY_CARD_INVALID', 'library seam: an unknown evidence id is refused')
  ok(!!e && /lib-1/.test(String(e.hint)), 'library seam: the refusal lists the known ids')
  ok(bus.topics.includes('memory/recorded') && bus.rows.some((x) => x.hook === 'memory/recorded'), 'bus: memory/recorded is declared and emitted')
  const broken = createMemory({ clock: c.clock, bus: fakeBus({ throwOnEmit: true }), library: { list: () => { throw new Error('lib down') } }, settings: S() })
  broken.record({ kind: 'fact', text: 'x', by: 'alpha', evidence: ['lib-1'] })
  ok(broken.status().unwired['bus:memory/recorded'] === 1, 'bus: a broken bus is a COUNTED wiring gap')
  ok(broken.status().unwired['library-seam'] >= 1, 'library seam: a seam that cannot answer is a COUNTED wiring gap')
  ok(m.status().libraryInjected === true, 'library seam: status() reports the seam')
}

// ── 12. the remaining named refusals ──────────────────────────────────────────────────────────────────
{
  const c = fakeClock(0)
  const m = createMemory({ clock: c.clock, settings: S() })
  throwsNamed(() => m.record({}), 'VMU_INVALID_ARGUMENT', 'record: a missing kind is refused')
  const a = m.record({ kind: 'fact', text: 'x', by: 'alpha', evidence: ['lib-1'] })
  throwsNamed(() => m.record({ kind: 'fact', text: 'y', by: 'alpha', evidence: ['lib-1'], ttlMs: -1 }), 'VMU_INVALID_ARGUMENT', 'record: a negative TTL is refused')
  throwsNamed(() => m.record({ kind: 'fact', text: 'y', by: 'alpha', evidence: ['lib-1'], supersedes: ['m-404'] }), 'VMU_NO_SUCH_OBJECT', 'record: superseding an unknown card is refused BEFORE anything is written')
  ok(m.list().count === 1, 'record: the refused supersede wrote nothing')
  ok(m.record({ kind: 'fact', text: 'y', by: 'alpha', evidence: ['lib-1'], supersedes: [a.id] }).ok === true, 'record: an explicit supersedes list is honoured')
  ok(m.list({ state: 'superseded' }).count === 1, 'record: the superseded card is marked, not deleted')
  ok(m.status().refusals.VMU_INVALID_ARGUMENT >= 2 && m.status().refusals.VMU_NO_SUCH_OBJECT >= 1, 'refusals: every refusal is counted by code')
  ok(refuse('X', 'y', 'z').code === 'X' && refuse('X', 'y', 'z').hint === 'z', 'refuse(): the named-error helper keeps code/hint')
}

console.log('=== VMU MEMORY: ' + passed + ' passed, ' + failed + ' failed ===')
if (failed > 0) process.exit(1)

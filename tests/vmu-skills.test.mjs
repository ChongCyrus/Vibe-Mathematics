// Independent test for vmu kernel · skills (no dependency on kernel/index.js).
// Run: node tests/vmu-skills.test.mjs     Last line: === VMU SKILLS: N passed, M failed ===
import { createSkills, DEFAULT_LEVELS, CODE } from '../vibe-math-vmu/kernel/skills.js'

let passed = 0
let failed = 0
function ok(cond, label) { if (cond) { passed += 1 } else { failed += 1; console.log('FAIL ' + label) } }
function throwsNamed(fn, code, label) {
  try { fn(); failed += 1; console.log('FAIL ' + label + ' (no refusal)'); return null }
  catch (e) { if (e && e.code === code) { passed += 1; return e } failed += 1; console.log('FAIL ' + label + ' (code=' + (e && e.code) + ' want ' + code + ')'); return null }
}
function fakeClock(start = 1000) { let t = start; return { clock: () => t, advance: (ms) => { t += ms } } }

// ── 1. zero mechanism: unknown, never the lowest level ───────────────────────────────────────
{
  const c = fakeClock()
  const s = createSkills({ clock: c.clock })
  const r = s.level({ memberId: 'm1', skill: 'lean' })
  ok(r.ok === true && r.known === false && r.level === null, 'zero-mechanism: level() is unknown with level=null')
  ok(r.level !== DEFAULT_LEVELS[0], 'zero-mechanism: unknown is explicitly NOT the lowest level')
  ok(r.code === CODE.unknown && /NOT the lowest level/.test(r.note), 'zero-mechanism: the note says it is not the lowest level')
  ok(s.list().count === 0 && s.expire().count === 0, 'zero-mechanism: list()/expire() are empty and do not throw')
  ok(s.status().unknownIsNotLowest === true && s.status().declarations === 0, 'zero-mechanism: status self-discloses the rule')
}

// ── 2. no self-appointment: evidence + a third-party attestation are both required ───────────
{
  const c = fakeClock(0)
  const s = createSkills({ clock: c.clock })
  throwsNamed(() => s.declare({ memberId: 'm1', skill: 'lean', level: 'capable' }), CODE.evidence, 'evidence: a bare claim is refused')
  throwsNamed(() => s.declare({ memberId: 'm1', skill: 'lean', level: 'capable', evidence: [] }), CODE.evidence, 'evidence: an empty evidence list is refused')
  const d = s.declare({ memberId: 'm1', skill: 'lean', level: 'capable', evidence: ['proof-1'] })
  ok(d.ok === true && d.status === 'unverified', 'declare: accepted but stays unverified')
  const before = s.level({ memberId: 'm1', skill: 'lean' })
  ok(before.known === false && before.gated === true && /attestation/.test(before.note), 'no self-appointment: an unattested claim is gated (not usable)')
  throwsNamed(() => s.attest({ memberId: 'm1', skill: 'lean', by: 'm1' }), CODE.selfAttest, 'no self-appointment: self-attestation refused by name')
  const a = s.attest({ memberId: 'm1', skill: 'lean', by: 'm2', note: 'reviewed the proof' })
  ok(a.ok === true && a.status === 'verified' && a.by === 'm2', 'attest: another member verifies the claim')
  const after = s.level({ memberId: 'm1', skill: 'lean' })
  ok(after.known === true && after.level === 'capable' && after.verifiedBy === 'm2', 'level(): verified claim reports the level and witness')
  const relaxed = createSkills({ clock: c.clock, settings: { 'vmu.skills.selfAttestAllowed': true } })
  relaxed.declare({ memberId: 'm1', skill: 'lean', level: 'capable', evidence: ['e'] })
  ok(relaxed.attest({ memberId: 'm1', skill: 'lean', by: 'm1' }).ok === true, 'self-attestation allowed only when explicitly enabled')
  throwsNamed(() => s.attest({ memberId: 'm1', skill: 'rust', by: 'm2' }), CODE.unknown, 'attest: no declaration ⇒ unknown')
  throwsNamed(() => s.attest({ memberId: 'm1', skill: 'lean' }), 'VMU_INVALID_ARGUMENT', 'attest: missing witness refused')
}

// ── 3. controlled vocabulary ────────────────────────────────────────────────────────────────
{
  const c = fakeClock()
  const s = createSkills({ clock: c.clock, settings: { 'vmu.skills.levels': ['novice', 'capable', 'expert'] } })
  ok(typeof s.level === 'function', 'sanity: level() is callable')
  throwsNamed(() => s.declare({ memberId: 'm1', skill: 'lean', level: 'godlike', evidence: ['e'] }), CODE.vocab, 'vocab: a level outside the controlled list is refused by name')
  const e = throwsNamed(() => s.declare({ memberId: 'm1', skill: 'lean', level: 'godlike', evidence: ['e'] }), CODE.vocab, 'vocab: refusal repeats with the allowed levels')
  ok(!!e && /novice, capable, expert/.test(String(e.hint)), 'vocab: the hint lists the allowed levels')
  ok(s.declare({ memberId: 'm1', skill: 'lean', level: 'expert', evidence: ['e'] }).ok === true, 'vocab: an in-list level is accepted')
}

// ── 4. freshness: expiry self-discloses AND downgrades (never silently valid) ────────────────
{
  const c = fakeClock(0)
  const s = createSkills({ clock: c.clock, settings: { 'vmu.skills.freshnessMs': 100, 'vmu.skills.aggregate': 'latest' } })
  s.declare({ memberId: 'm1', skill: 'lean', level: 'expert', evidence: ['e'] })
  s.attest({ memberId: 'm1', skill: 'lean', by: 'm2' })
  ok(s.level({ memberId: 'm1', skill: 'lean' }).level === 'expert', 'freshness: fresh claim keeps its level')
  c.advance(101)
  const st = s.level({ memberId: 'm1', skill: 'lean' })
  ok(st.known === true && st.stale === true && st.degraded === true, 'freshness: stale claim is flagged AND degraded')
  ok(st.level === 'capable' && st.declaredLevel === 'expert', 'freshness: it downgrades one step (expert ⇒ capable)')
  ok(st.code === CODE.degraded && /stale/.test(String(st.note)) && /not silently accepted/.test(String(st.note)), 'freshness: the downgrade is self-disclosed by name')
  const ex = s.expire()
  ok(ex.count >= 1 && ex.items[0].code === CODE.degraded && ex.items[0].effectiveLevel === 'capable', 'expire(): lists the stale claim with its effective level')
  ok(s.expire({ at: 0 }).count === 0, 'expire(): the injected `at` is honoured (deterministic)')
  const hold = createSkills({ clock: c.clock, settings: { 'vmu.skills.freshnessMs': 100, 'vmu.skills.degradePolicy': 'hold' } })
  hold.declare({ memberId: 'm1', skill: 'lean', level: 'expert', evidence: ['e'] })
  hold.attest({ memberId: 'm1', skill: 'lean', by: 'm2' })
  c.advance(200)
  const held = hold.level({ memberId: 'm1', skill: 'lean' })
  ok(held.stale === true && held.level === 'expert' && held.degraded === false, 'freshness: degradePolicy=hold keeps the level but still flags stale')
  const bottom = createSkills({ clock: c.clock, settings: { 'vmu.skills.freshnessMs': 1 } })
  bottom.declare({ memberId: 'm1', skill: 'lean', level: 'novice', evidence: ['e'] })
  bottom.attest({ memberId: 'm1', skill: 'lean', by: 'm2' })
  c.advance(10)
  ok(bottom.level({ memberId: 'm1', skill: 'lean' }).level === null, 'freshness: at the bottom level the degradation yields null (no invented level)')
}

// ── 5. aggregate: latest vs max ─────────────────────────────────────────────────────────────
{
  const c = fakeClock(0)
  const latest = createSkills({ clock: c.clock, settings: { 'vmu.skills.aggregate': 'latest' } })
  latest.declare({ memberId: 'm1', skill: 'lean', level: 'expert', evidence: ['e1'] })
  latest.attest({ memberId: 'm1', skill: 'lean', by: 'm2' })
  c.advance(5)
  latest.declare({ memberId: 'm1', skill: 'lean', level: 'capable', evidence: ['e2'] })
  latest.attest({ memberId: 'm1', skill: 'lean', by: 'm3' })
  ok(latest.level({ memberId: 'm1', skill: 'lean' }).level === 'capable', 'aggregate=latest: the newest declaration wins')
  const max = createSkills({ clock: c.clock, settings: { 'vmu.skills.aggregate': 'max' } })
  max.declare({ memberId: 'm1', skill: 'lean', level: 'capable', evidence: ['e1'] })
  max.attest({ memberId: 'm1', skill: 'lean', by: 'm2' })
  c.advance(5)
  max.declare({ memberId: 'm1', skill: 'lean', level: 'expert', evidence: ['e2'] })
  max.attest({ memberId: 'm1', skill: 'lean', by: 'm3' })
  ok(max.level({ memberId: 'm1', skill: 'lean' }).level === 'expert', 'aggregate=max: the highest verified level wins')
}

// ── 6. needed(): capability ≠ permission ────────────────────────────────────────────────────
{
  const c = fakeClock(0)
  const s = createSkills({ clock: c.clock, settings: { 'vmu.skills.requiresPermission': true } })
  s.declare({ memberId: 'm1', skill: 'lean', level: 'capable', evidence: ['e'] }); s.attest({ memberId: 'm1', skill: 'lean', by: 'm2' })
  s.declare({ memberId: 'm3', skill: 'r', level: 'novice', evidence: ['e2'] }); s.attest({ memberId: 'm3', skill: 'r', by: 'm2' })
  const r = s.needed({ taskId: 'T-1', skills: ['lean', 'octave'] })
  ok(r.matches.length === 1 && r.matches[0].memberId === 'm1', 'needed(): lists who can cover the requested skill')
  ok(r.missing.join(',') === 'octave', 'needed(): reports the uncovered skills')
  ok(r.requiresPermission === true && /capability != permission/.test(r.note), 'needed(): states that capability is not permission')
  ok(s.status().capabilityIsNotPermission === true, 'status(): repeats the capability/permission separation')
}

// ── 7. retire + truncation counting ─────────────────────────────────────────────────────────
{
  const c = fakeClock(0)
  // INTEGRATOR NOTE: cap raised 2 → 3 so that the "retire frees a slot" assertion can be exercised without
  // the earlier refusal consuming the budget. OPEN QUESTION for the module owner: with cap=2 this line failed
  // with VMU_SKILL_LIMIT (2/2) even AFTER retire() - i.e. either retired claims still count toward the cap, or
  // retire() needs a witness and failed silently. Both would be kernel behaviour worth naming explicitly.
  const s = createSkills({ clock: c.clock, settings: { 'vmu.skills.maxSkillsPerMember': 3 } })
  s.declare({ memberId: 'm1', skill: 'a', level: 'novice', evidence: ['e'] })
  s.declare({ memberId: 'm1', skill: 'b', level: 'novice', evidence: ['e'] })
  s.declare({ memberId: 'm1', skill: 'c', level: 'novice', evidence: ['e'] })
  throwsNamed(() => s.declare({ memberId: 'm1', skill: 'd', level: 'novice', evidence: ['e'] }), CODE.limit, 'limit: exceeding maxSkillsPerMember is refused by name')
  const ret = s.retire({ memberId: 'm1', skill: 'a' })
  ok(ret.ok === true && ret.code === CODE.retired, 'retire: marks the claim retired with the retired code')
  ok(s.declare({ memberId: 'm1', skill: 'd', level: 'novice', evidence: ['e'] }).ok === true, 'retire: frees a slot')
  ok(s.level({ memberId: 'm1', skill: 'a' }).known === false, 'retire: a retired claim reads as unknown')
  // INTEGRATOR NOTE: this board needs a cap ABOVE the loop count - the default cap is 50 and the loop below
  // declares 60, which is what actually crashed with VMU_SKILL_LIMIT (the earlier cap=2 suspicion was wrong).
  const big = createSkills({ clock: c.clock, settings: { 'vmu.skills.maxSkillsPerMember': 100 } })
  for (let i = 0; i < 60; i++) { c.advance(1); big.declare({ memberId: 'm9', skill: 's' + i, level: 'novice', evidence: ['e'] }); big.attest({ memberId: 'm9', skill: 's' + i, by: 'm2' }) }
  const l = big.list()
  ok(l.attestations === 50 && l.droppedFromCap > 0, 'truncation: the attestation log is capped and the dropped count is reported')
  ok(big.status().droppedFromCap === l.droppedFromCap, 'truncation: status() repeats the dropped count')
}

// ── 8. read-only surfaces never mutate ──────────────────────────────────────────────────────
{
  const c = fakeClock(0)
  const s = createSkills({ clock: c.clock })
  s.declare({ memberId: 'm1', skill: 'lean', level: 'capable', evidence: ['e'] })
  s.attest({ memberId: 'm1', skill: 'lean', by: 'm2' })
  const st = JSON.stringify(s.status()); const li = JSON.stringify(s.list()); const lv = JSON.stringify(s.level({ memberId: 'm1', skill: 'lean' }))
  const ex = JSON.stringify(s.expire()); const nd = JSON.stringify(s.needed({ skills: ['lean'] }))
  s.status(); s.list(); s.level({ memberId: 'm1', skill: 'lean' }); s.expire(); s.needed({ skills: ['lean'] })
  ok(JSON.stringify(s.status()) === st && JSON.stringify(s.list()) === li, 'read-only: status()/list() unchanged by reads')
  ok(JSON.stringify(s.level({ memberId: 'm1', skill: 'lean' })) === lv, 'read-only: level() unchanged by reads')
  ok(JSON.stringify(s.expire()) === ex && JSON.stringify(s.needed({ skills: ['lean'] })) === nd, 'read-only: expire()/needed() unchanged by reads')
}

// ── 9. determinism (injected clock only) + members validation ────────────────────────────────
{
  const mk = () => { const c = fakeClock(500); const s = createSkills({ clock: c.clock }); s.declare({ memberId: 'm1', skill: 'lean', level: 'capable', evidence: ['e'] }); s.attest({ memberId: 'm1', skill: 'lean', by: 'm2' }); return s }
  const a = mk(); const b = mk()
  ok(JSON.stringify(a.status()) === JSON.stringify(b.status()), 'determinism: two instances agree on status()')
  ok(JSON.stringify(a.list()) === JSON.stringify(b.list()), 'determinism: two instances agree on list()')
  ok(a.level({ memberId: 'm1', skill: 'lean' }).level === b.level({ memberId: 'm1', skill: 'lean' }).level, 'determinism: same level() result')
  const c = fakeClock()
  const strict = createSkills({ clock: c.clock, members: ['m1', 'm2'] })
  strict.declare({ memberId: 'm1', skill: 'lean', level: 'capable', evidence: ['e'] })
  throwsNamed(() => strict.attest({ memberId: 'm1', skill: 'lean', by: 'stranger' }), 'VMU_NO_SUCH_OBJECT', 'members: an unknown witness is refused when the roster is known')
  ok(strict.attest({ memberId: 'm1', skill: 'lean', by: 'm2' }).ok === true, 'members: a known witness is accepted')
  ok(strict.status().membersKnown === true, 'members: status() reports that the roster is known')
}

console.log('=== VMU SKILLS: ' + passed + ' passed, ' + failed + ' failed ===')
if (failed > 0) process.exit(1)

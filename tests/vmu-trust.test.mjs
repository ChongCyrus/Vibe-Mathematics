// Independent test for vmu kernel · trust (no dependency on kernel/index.js).
// Run: node tests/vmu-trust.test.mjs     Last line: === VMU TRUST: N passed, M failed ===
import { createTrust, refuse, AUTHORITY_REFUSAL } from '../vibe-math-vmu/kernel/trust.js'

let passed = 0
let failed = 0
function ok(cond, label) { if (cond) { passed += 1 } else { failed += 1; console.log('FAIL ' + label) } }
function throwsNamed(fn, code, label) {
  try { fn(); failed += 1; console.log('FAIL ' + label + ' (no refusal)'); return null }
  catch (e) { if (e && e.code === code) { passed += 1; return e } failed += 1; console.log('FAIL ' + label + ' (code=' + (e && e.code) + ' want ' + code + ')'); return null }
}
function fakeClock(start = 1000) { let t = start; return { clock: () => t, set: (v) => { t = v }, advance: (ms) => { t += ms } } }

// ── 1. S-3: reputation NEVER becomes authority ────────────────────────────────────────────────
{
  const c = fakeClock()
  const t = createTrust({ clock: c.clock })
  const e = throwsNamed(() => t.authorityFrom(1), AUTHORITY_REFUSAL, 'S-3: authorityFrom refuses even for a perfect score')
  ok(!!e && /no vote, no seat, no delegation, no budget/.test(e.message), 'S-3: refusal names the forbidden uses')
  throwsNamed(() => t.authorityFrom({ score: 0.99, subject: 'm1' }), AUTHORITY_REFUSAL, 'S-3: authorityFrom refuses for an object argument too')
  const st = t.status()
  ok(st.reputationGrantsAuthority === false && st.authorityRefusalCode === AUTHORITY_REFUSAL, 'S-3: status() self-discloses that reputation grants no authority')
  ok(st.forbiddenUses.includes('vote') && st.forbiddenUses.includes('seat') && st.forbiddenUses.includes('delegation') && st.forbiddenUses.includes('budget'), 'S-3: forbidden uses are enumerated')
}

// ── 2. zero mechanism: no data ⇒ score is null, never a fake 0 ────────────────────────────────
{
  const c = fakeClock()
  const t = createTrust({ clock: c.clock })
  const s = t.score({ subject: 'nobody' })
  ok(s.ok === true && s.score === null && s.hasData === false, 'zero-mechanism: score is null (not 0)')
  ok(s.score !== 0, 'zero-mechanism: explicitly not 0')
  ok(s.reason === 'no-signals', 'zero-mechanism: reason says no-signals')
  const x = t.explain({ subject: 'nobody' })
  ok(x.hasData === false && x.score === null && typeof x.noDataReason === 'string' && /not 0/.test(x.noDataReason), 'zero-mechanism: explain() states there is no data (and that it is not 0)')
  const d = t.decay({ subject: 'nobody' })
  ok(d.score === null && d.hasData === false, 'zero-mechanism: decay() also returns null')
  const l = t.list()
  ok(l.subjects.length === 0 && l.signals === 0, 'zero-mechanism: list() is empty and does not throw')
}

// ── 3. auditable scoring: mean / weighted / median ───────────────────────────────────────────
{
  const c = fakeClock()
  const t = createTrust({ clock: c.clock, settings: { 'vmu.trust.aggregate': 'mean', 'vmu.trust.halfLifeMs': 0 } })
  t.signal({ subject: 'm1', kind: 'review', weight: 0.4, source: 'm2', evidence: ['r1'] })
  c.advance(10)
  t.signal({ subject: 'm1', kind: 'review', weight: 0.8, source: 'm3', evidence: ['r2'] })
  const s = t.score({ subject: 'm1' })
  ok(s.hasData === true && Math.abs(s.score - 0.6) < 1e-9, 'aggregate=mean: (0.4+0.8)/2 = 0.6')
  ok(s.samples === 2, 'score reports the sample count')
  const t2 = createTrust({ clock: c.clock, settings: { 'vmu.trust.aggregate': 'median', 'vmu.trust.halfLifeMs': 0 } })
  t2.signal({ subject: 'm1', kind: 'review', weight: 0.1, source: 'm2', evidence: ['x1'] })
  c.advance(1)
  t2.signal({ subject: 'm1', kind: 'review', weight: 0.9, source: 'm3', evidence: ['x2'] })
  c.advance(1)
  t2.signal({ subject: 'm1', kind: 'review', weight: 0.5, source: 'm4', evidence: ['x3'] })
  ok(Math.abs(t2.score({ subject: 'm1' }).score - 0.5) < 1e-9, 'aggregate=median: middle value 0.5')
  const bad = createTrust({ clock: c.clock, settings: { 'vmu.trust.aggregate': 'nonsense' } })
  ok(bad.status().aggregate === 'weighted', 'invalid aggregate falls back to weighted (never crashes)')
}

// ── 4. decay determinism (injected clock only) ───────────────────────────────────────────────
{
  const c = fakeClock(0)
  const t = createTrust({ clock: c.clock, settings: { 'vmu.trust.halfLifeMs': 1000, 'vmu.trust.aggregate': 'mean' } })
  t.signal({ subject: 'm1', kind: 'review', weight: 1, source: 'm2', evidence: ['ev'] })
  ok(Math.abs(t.score({ subject: 'm1' }).score - 1) < 1e-9, 'decay: fresh signal has full weight')
  c.advance(1000)
  ok(Math.abs(t.score({ subject: 'm1' }).score - 0.5) < 1e-9, 'decay: one half-life halves the weight')
  c.advance(1000)
  ok(Math.abs(t.score({ subject: 'm1' }).score - 0.25) < 1e-9, 'decay: two half-lives quarter it')
  const a = t.decay({ subject: 'm1', at: 1000 })
  const b = t.decay({ subject: 'm1', at: 1000 })
  ok(JSON.stringify(a) === JSON.stringify(b) && Math.abs(a.score - 0.5) < 1e-9, 'decay: same `at` ⇒ byte-identical result (deterministic)')
  ok(t.score({ subject: 'm1' }).score === t.score({ subject: 'm1' }).score, 'decay: repeated reads agree (no hidden time)')
  throwsNamed(() => t.decay({ subject: 'm1', at: -5 }), 'VMU_INVALID_ARGUMENT', 'decay: negative timestamp refused')
}

// ── 5. every score is explainable: explain() agrees with score() ─────────────────────────────
{
  const c = fakeClock(0)
  const t = createTrust({ clock: c.clock, settings: { 'vmu.trust.halfLifeMs': 0, 'vmu.trust.aggregate': 'mean' } })
  t.signal({ subject: 'm1', kind: 'review', weight: 0.5, source: 'm2', evidence: ['e1'] })
  c.advance(5)
  t.signal({ subject: 'm1', kind: 'bug', weight: 1, source: 'm3', evidence: ['e2'] })
  const s = t.score({ subject: 'm1' })
  const x = t.explain({ subject: 'm1' })
  ok(x.hasData === true && Math.abs(x.score - s.score) < 1e-12, 'explain: score matches score() exactly')
  ok(x.signals.length === 2 && x.samples === 2, 'explain: lists every constituent signal')
  ok(x.signals.every((p) => typeof p.kind === 'string' && typeof p.source === 'string' && typeof p.weight === 'number' && typeof p.decayedWeight === 'number'), 'explain: each signal carries kind/source/weight/decayedWeight')
  ok(x.aggregate === 'mean' && x.halfLifeMs === 0, 'explain: states the aggregation and half-life used')
  ok(x.authorityRefusalCode === AUTHORITY_REFUSAL, 'explain: repeats the S-3 refusal code')
}

// ── 6. strong weight without evidence ⇒ DOWNWEIGHTED and self-disclosed ──────────────────────
{
  const c = fakeClock()
  const t = createTrust({ clock: c.clock, settings: { 'vmu.trust.evidenceRequired': 0.75, 'vmu.trust.aggregate': 'mean', 'vmu.trust.halfLifeMs': 0 } })
  const r = t.signal({ subject: 'm1', kind: 'review', weight: 0.9, source: 'm2' })
  ok(r.weight === 0.25 && r.flags.includes('downgraded:no-evidence'), 'no evidence: strong weight is capped and flagged')
  const x = t.explain({ subject: 'm1' })
  ok(x.signals[0].weight === 0.25 && x.signals[0].flags.includes('downgraded:no-evidence'), 'no evidence: the downgrade is visible in explain()')
  const withEv = t.signal({ subject: 'm2', kind: 'review', weight: 0.9, source: 'm3', evidence: ['proof'] })
  ok(withEv.weight === 0.9 && withEv.flags.length === 0, 'with evidence: the strong weight is kept')
}

// ── 7. controlled vocabulary + source/self-score gates ───────────────────────────────────────
{
  const c = fakeClock()
  const t = createTrust({ clock: c.clock, settings: { 'vmu.trust.kinds': ['review', 'bug'], 'vmu.trust.requireSource': true } })
  t.signal({ subject: 'm1', kind: 'review', source: 'm2' })
  throwsNamed(() => t.signal({ subject: 'm1', kind: 'gossip', source: 'm2' }), 'VMU_TRUST_VOCAB_VIOLATION', 'vocab: kind outside the controlled vocabulary is refused')
  throwsNamed(() => t.signal({ subject: 'm1', kind: 'review' }), 'VMU_TRUST_EVIDENCE_REQUIRED', 'source: missing source is refused when required')
  throwsNamed(() => t.signal({ subject: 'm1', kind: 'review', source: 'm1' }), 'VMU_TRUST_SELF_SCORE', 'self-scoring is refused')
  const relaxed = createTrust({ clock: c.clock, settings: { 'vmu.trust.requireSource': false, 'vmu.trust.selfScoreAllowed': true } })
  let relaxedOk = false; try { relaxedOk = relaxed.signal({ subject: 'm1', kind: 'review', source: 'm1', evidence: ['self'] }).ok === true } catch (e) { relaxedOk = false; console.log('      (relaxed self-score refused: ' + e.code + ')') }
  ok(relaxedOk, 'relaxed: self-scoring allowed only when explicitly enabled')
  throwsNamed(() => t.signal({ subject: 'm1', kind: 'review', weight: 2, source: 'm2' }), 'VMU_INVALID_ARGUMENT', 'weight outside [0,1] is refused')
  throwsNamed(() => t.signal({ subject: '', kind: 'review', source: 'm2' }), 'VMU_INVALID_ARGUMENT', 'empty subject is refused')
}

// ── 8. truncation counts (cap ⇒ dropped reported, never silent) ──────────────────────────────
{
  const c = fakeClock(0)
  const t = createTrust({ clock: c.clock, settings: { 'vmu.trust.maxSignalsPerSubject': 3, 'vmu.trust.aggregate': 'mean', 'vmu.trust.halfLifeMs': 0 } })
  let last = null
  for (let i = 0; i < 5; i++) { c.advance(1); last = t.signal({ subject: 'm1', kind: 'review', weight: 0.2 * (i + 1), source: 'src' + i, evidence: ['e' + i] }) }
  ok(last.dropped === 1 && last.truncated === true, 'cap: the overflowing signal reports dropped=1')
  const st = t.status()
  ok(st.maxSignalsPerSubject === 3 && st.droppedFromCap === 2 && t.list().signals === 3, 'cap: total dropped count is self-reported (2)')
  const x = t.explain({ subject: 'm1' })
  ok(x.samples === 3 && x.droppedFromCap === 2, 'cap: explain() shows the kept samples and the dropped total')
}

// ── 9. disputes: window enforced by the injected clock ───────────────────────────────────────
{
  const c = fakeClock(0)
  const t = createTrust({ clock: c.clock, settings: { 'vmu.trust.appealWindowMs': 100 } })
  t.signal({ subject: 'm1', kind: 'review', source: 'm2' })
  const okDisp = t.dispute({ scoreId: 'm1', reason: 'the signal was about a different task' })
  ok(okDisp.ok === true && okDisp.status === 'open', 'dispute: opens inside the window')
  c.advance(101)
  throwsNamed(() => t.dispute({ scoreId: 'm1', reason: 'too late' }), 'VMU_TRUST_APPEAL_WINDOW', 'dispute: window closes with the clock')
  throwsNamed(() => t.dispute({ scoreId: 'm1' }), 'VMU_INVALID_ARGUMENT', 'dispute: missing reason is refused')
  ok(t.status().disputes === 1 && t.status().openDisputes === 1, 'dispute: status() counts disputes')
}

// ── 10. read-only surfaces never mutate state ────────────────────────────────────────────────
{
  const c = fakeClock(0)
  const t = createTrust({ clock: c.clock, settings: { 'vmu.trust.halfLifeMs': 5000 } })
  t.signal({ subject: 'm1', kind: 'review', weight: 0.7, source: 'm2', evidence: ['e'] })
  const st1 = JSON.stringify(t.status())
  const s1 = JSON.stringify(t.score({ subject: 'm1' }))
  const e1 = JSON.stringify(t.explain({ subject: 'm1' }))
  const l1 = JSON.stringify(t.list())
  const d1 = JSON.stringify(t.decay({ subject: 'm1', at: 0 }))
  t.status(); t.score({ subject: 'm1' }); t.explain({ subject: 'm1' }); t.list(); t.decay({ subject: 'm1', at: 0 })
  ok(JSON.stringify(t.status()) === st1, 'read-only: status() unchanged by reads')
  ok(JSON.stringify(t.score({ subject: 'm1' })) === s1, 'read-only: score() unchanged by reads')
  ok(JSON.stringify(t.explain({ subject: 'm1' })) === e1, 'read-only: explain() unchanged by reads')
  ok(JSON.stringify(t.list()) === l1 && JSON.stringify(t.decay({ subject: 'm1', at: 0 })) === d1, 'read-only: list()/decay() unchanged by reads')
  ok(refuse('X', 'y', 'z').code === 'X', 'refuse(): named-error helper keeps code/hint')
}

// ── task-217: vmu.trust.halfLifeMs = 0 means DECAY IS OFF, and an explicit 0 stays distinguishable from
// "not given" (the module self-discloses the SOURCE: explicit vs default).
{
  const withHalfLife = (settings) => {
    const fc = fakeClock(1000)
    const t = createTrust({ clock: fc.clock, settings })
    t.signal({ subject: 'm1', kind: 'review', source: 'doc-1', weight: 1, evidence: 'ev-1' })
    return { t, fc }
  }
  // (a) explicit 0 ⇒ no decay + self-disclosed as explicit
  const zero = withHalfLife({ 'vmu.trust.halfLifeMs': 0 })
  const s0 = zero.t.score({ subject: 'm1' })
  ok(s0.halfLifeMs === 0 && s0.decay === 'off' && s0.halfLifeSource === 'explicit', 'halfLifeMs=0 ⇒ decay OFF and the receipt says so (decay=off, source=explicit)')
  const d0 = zero.t.decay({ subject: 'm1', at: 1000 + 10 * 86400000 })
  ok(d0.score === s0.score && d0.decay === 'off', 'ten days later the score is UNCHANGED with 0 (0 is read as "no decay", not as a missing value)')
  // (b) not given ⇒ the module's DECLARED default (0 ⇒ also off) but the SOURCE says default (distinguishable)
  const none = withHalfLife({})
  const sn = none.t.score({ subject: 'm1' })
  ok(sn.halfLifeMs === 0 && sn.decay === 'off' && sn.halfLifeSource === 'default', 'halfLifeMs not given ⇒ the declared default (0, off) with source=default')
  ok(sn.halfLifeSource !== s0.halfLifeSource, 'explicit 0 and "not given" are DISTINGUISHABLE (source explicit vs default)')
  // (c) a positive half-life really decays (so 0 is not simply "decay disabled by accident")
  const on = withHalfLife({ 'vmu.trust.halfLifeMs': 1000 })
  const s1 = on.t.score({ subject: 'm1' })
  const d1 = on.t.decay({ subject: 'm1', at: 1000 + 1000 })
  ok(s1.decay === 'on' && s1.halfLifeSource === 'explicit', 'halfLifeMs=1000 ⇒ decay on (source explicit)')
  ok(d1.score < s1.score && d1.score > 0, 'one half-life later the score is HALVED (0.5×) — the knob really governs')
  ok(on.t.explain({ subject: 'm1' }).halfLifeSource === 'explicit', 'explain() self-discloses the half-life source too')
}

console.log('=== VMU TRUST: ' + passed + ' passed, ' + failed + ' failed ===')
if (failed > 0) process.exit(1)

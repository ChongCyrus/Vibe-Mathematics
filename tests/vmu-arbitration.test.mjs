// Independent test for vmu kernel · arbitration (no dependency on kernel/index.js).
// Spec source: docs/17-agent-society-and-delegation.md §6 (conflict & arbitration) / §20.4 (keys) / §21.2 (codes).
// The four essentials under test: ① no party arbitrates its own case ② a ruling must state its rationale
// ③ the effect is explicit (binding=false is ADVISORY and says so) ④ failing to recuse inside the window is refused.
// Run: node tests/vmu-arbitration.test.mjs     Last line: === VMU ARBITRATION: N passed, M failed ===
import { createArbitration, refuse } from '../vibe-math-vmu/kernel/arbitration.js'

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
function fakeMinutes({ throwOnAppend = false } = {}) {
  const rows = []
  return { rows, append: (r) => { if (throwOnAppend) throw new Error('minutes down'); rows.push(r) } }
}
const S = (extra = {}) => Object.assign({ 'vmu.arbitration.mode': 'single', 'vmu.arbitration.binding': false }, extra)
function openCase(d, extra = {}) { return d.open(Object.assign({ parties: ['alpha', 'beta'], subject: 'task t-3' }, extra)) }

// ── 1. zero mechanism: mode=off (the default) ⇒ writes refused BY NAME, reads still answer ─────────────
{
  const c = fakeClock(0)
  const d = createArbitration({ clock: c.clock })
  ok(d.status().configured === false && d.status().mode === 'off', 'zero-mechanism: status() reports mode=off, configured=false')
  ok(d.list().count === 0 && d.list().configured === false, 'zero-mechanism: list() is empty and does not throw')
  const e = throwsNamed(() => openCase(d), 'VMU_ARBITRATION_OFF', 'zero-mechanism: open() is refused by name')
  ok(!!e && /vmu\.arbitration\.mode/.test(String(e.hint)), 'zero-mechanism: the refusal says how to turn it on')
  ok(d.status().refusals.VMU_ARBITRATION_OFF === 1, 'zero-mechanism: the refusal is counted by code')
}

// ── 2. ESSENTIAL ①: a party may not arbitrate its own case (naming the conflict) ──────────────────────
{
  const c = fakeClock(0)
  const d = createArbitration({ clock: c.clock, settings: S() })
  const o = openCase(d)
  ok(o.ok === true && o.caseId === 'c-1' && o.state === 'open', 'open: the case exists with a deterministic id')
  const e = throwsNamed(() => d.appoint({ caseId: o.caseId, arbiter: 'alpha' }), 'VMU_ARBITER_IS_PARTY', '①: a party is refused as arbiter')
  ok(!!e && /party alpha/.test(e.message), '①: the refusal NAMES the conflicting party')
  ok(!!e && /arbiterMustDiffer/.test(String(e.hint)), '①: the refusal points at the setting')
  const pre = openCase(d, { subject: 'task t-4', conflicts: [{ arbiter: 'gamma', withParty: 'alpha' }] })
  ok(pre.mustRecuse.join(',') === 'gamma', 'open: declared conflicts mark who must recuse')
  const e2 = throwsNamed(() => d.appoint({ caseId: pre.caseId, arbiter: 'gamma' }), 'VMU_ARBITER_IS_PARTY', '①: an actor required to recuse is refused too')
  ok(!!e2 && /declared conflict with party alpha/.test(e2.message), '①: that refusal names the party it conflicts with')
  ok(d.appoint({ caseId: o.caseId, arbiter: 'chair' }).ok === true, '①: a third party may arbitrate')
  ok(d.pick({ caseId: o.caseId, candidates: ['alpha', 'delta'] }).arbiter === 'delta', '①: pick() filters out the parties (and anyone already on the panel)')
  const loose = createArbitration({ clock: c.clock, settings: S({ 'vmu.conflict.arbiterMustDiffer': false }) })
  const o2 = openCase(loose)
  ok(loose.appoint({ caseId: o2.caseId, arbiter: 'alpha' }).ok === true, '①: arbiterMustDiffer=false relaxes the rule (and is disclosed)')
  ok(loose.status().arbiterMustDiffer === false, '①: status() declares the effective rule')
}

// ── 3. ESSENTIAL ②: a ruling must state its rationale ─────────────────────────────────────────────────
{
  const c = fakeClock(0)
  const d = createArbitration({ clock: c.clock, settings: S() })
  const o = openCase(d)
  d.appoint({ caseId: o.caseId, arbiter: 'chair' })
  d.hear({ caseId: o.caseId, note: 'both sides were heard', by: 'chair' })
  const e = throwsNamed(() => d.rule({ caseId: o.caseId, outcome: 't-3 belongs to alpha' }), 'VMU_REASON_REQUIRED', '②: a ruling without a rationale is refused')
  ok(!!e && /rationaleRequired/.test(String(e.hint)), '②: the refusal names the setting')
  const r = d.rule({ caseId: o.caseId, outcome: 't-3 belongs to alpha', rationale: 'alpha created it and beta agrees' })
  ok(r.ok === true && r.rationale === 'alpha created it and beta agrees' && r.decidedAt === 0, '②: a reasoned ruling is recorded with the injected time')
  const relax = createArbitration({ clock: c.clock, settings: S({ 'vmu.arbitration.rationaleRequired': false }) })
  const o2 = openCase(relax)
  relax.appoint({ caseId: o2.caseId, arbiter: 'chair' })
  relax.hear({ caseId: o2.caseId, note: 'n' })
  ok(relax.rule({ caseId: o2.caseId, outcome: 'x' }).ok === true, '②: rationaleRequired=false allows a bare outcome (disclosed)')
}

// ── 4. ESSENTIAL ③: the effect is explicit — advisory is stated as advisory ───────────────────────────
{
  const c = fakeClock(0)
  const adv = createArbitration({ clock: c.clock, settings: S({ 'vmu.arbitration.binding': false }) })
  const o = openCase(adv)
  adv.appoint({ caseId: o.caseId, arbiter: 'chair' })
  adv.hear({ caseId: o.caseId, note: 'n' })
  ok(adv.effective({ caseId: o.caseId }).effect === 'none', '③: before a ruling, effective() says there is nothing to be effective')
  adv.rule({ caseId: o.caseId, outcome: 'x', rationale: 'y' })
  const eff = adv.effective({ caseId: o.caseId })
  ok(eff.effect === 'advisory' && eff.binding === false && eff.enforcement === 'none', '③: binding=false ⇒ effect=advisory, enforcement=none')
  ok(/ADVISORY ONLY/.test(eff.note) && /nothing is enforced/.test(eff.note), '③: the note says ADVISORY ONLY — no pretended enforcement')
  ok(eff.outcome === 'x' && eff.rationale === 'y' && eff.decided === true, '③: the decision and its rationale are visible')

  const bin = createArbitration({ clock: c.clock, settings: S({ 'vmu.arbitration.binding': true }) })
  const o2 = openCase(bin)
  bin.appoint({ caseId: o2.caseId, arbiter: 'chair' })
  bin.hear({ caseId: o2.caseId, note: 'n' })
  bin.rule({ caseId: o2.caseId, outcome: 'z', rationale: 'because' })
  const eff2 = bin.effective({ caseId: o2.caseId })
  ok(eff2.effect === 'binding' && eff2.enforcement === 'by-declaration', '③: binding=true ⇒ effect=binding, enforcement=by-declaration')
  ok(/does not execute/.test(eff2.note), '④: even binding=true is honest: the kernel records, it does not execute')
  bin.appeal({ caseId: o2.caseId, by: 'alpha', reason: 'new evidence' })
  const eff3 = bin.effective({ caseId: o2.caseId })
  ok(eff3.appealed === true && /PENDING/.test(eff3.note), '③: a pending appeal is stated, and the declared effect is unchanged')
}

// ── 5. ESSENTIAL ④: failing to recuse inside the window is refused ────────────────────────────────────
{
  const c = fakeClock(0)
  const d = createArbitration({ clock: c.clock, settings: S({ 'vmu.arbitration.recuseWindowMs': 100 }) })
  const o = openCase(d)
  d.appoint({ caseId: o.caseId, arbiter: 'chair' })
  const dc = d.declareConflict({ caseId: o.caseId, arbiter: 'chair', withParty: 'beta', reason: 'shared grant' })
  ok(dc.mustRecurse === true && dc.windowClosesAt === 100, '④: declaring a conflict sets the recusal window')
  c.advance(150)
  const e = throwsNamed(() => d.recuse({ caseId: o.caseId, arbiter: 'chair', reason: 'late' }), 'VMU_DUTY_CONFLICT', '④: a late recusal is refused by name')
  ok(!!e && /closed at 100ms/.test(e.message) && /100ms/.test(e.message), '④: the refusal states the window and when it closed')
  const e2 = throwsNamed(() => d.rule({ caseId: o.caseId, outcome: 'x', rationale: 'y' }), 'VMU_ARBITER_IS_PARTY', '④: an un-recused conflicted panel cannot rule')
  ok(!!e2 && /chair \(with beta\)/.test(e2.message), '④: the refusal names the conflicted arbiter and its party')

  const c2 = fakeClock(0)
  const d2 = createArbitration({ clock: c2.clock, settings: S({ 'vmu.arbitration.recuseWindowMs': 100 }) })
  const o2 = openCase(d2)
  d2.appoint({ caseId: o2.caseId, arbiter: 'chair' })
  d2.declareConflict({ caseId: o2.caseId, arbiter: 'chair', withParty: 'beta' })
  c2.advance(50)
  const r = d2.recuse({ caseId: o2.caseId, arbiter: 'chair', reason: 'inside the window' })
  ok(r.ok === true && r.removedFromPanel === true && r.mustReplace === true, '④: an in-window recusal removes the arbiter from the panel')
  ok(r.arbiters.length === 0, '④: the panel is empty again and needs a replacement')
  throwsNamed(() => d2.recuse({ caseId: o2.caseId, arbiter: 'chair' }), 'VMU_REASON_REQUIRED', '④: recusal without a reason is refused')
  ok(d2.recuse({ caseId: o2.caseId, arbiter: 'chair', reason: 'again' }).ok === true, '④: recusing again is idempotent (already recused)')
  const vol = d2.recuse({ caseId: o2.caseId, arbiter: 'nobody', reason: 'voluntary' })
  ok(vol.ok === true && vol.removedFromPanel === false, '④: a voluntary recusal by a non-panelist is recorded, not refused')
}

// ── 6. mode / panel size / appointment rules ──────────────────────────────────────────────────────────
{
  const c = fakeClock(0)
  const single = createArbitration({ clock: c.clock, settings: S() })
  const o = openCase(single)
  single.appoint({ caseId: o.caseId, arbiter: 'a1' })
  ok(single.status().panelSize === 1 && single.status().mode === 'single', 'mode: single ⇒ panelSize 1')
  throwsNamed(() => single.appoint({ caseId: o.caseId, arbiter: 'a2' }), 'VMU_STATE', 'mode: a full single panel refuses a second arbiter')

  const panel = createArbitration({ clock: c.clock, settings: { 'vmu.arbitration.mode': 'panel', 'vmu.arbitration.panelSize': 3 } })
  const o2 = openCase(panel)
  panel.appoint({ caseId: o2.caseId, arbiter: 'a1' })
  panel.hear({ caseId: o2.caseId, note: 'n' })
  const e = throwsNamed(() => panel.rule({ caseId: o2.caseId, outcome: 'x', rationale: 'y' }), 'VMU_STATE', 'mode: an incomplete panel cannot rule')
  ok(!!e && /1\/3/.test(e.message), 'mode: the refusal states the panel fill (1/3)')
  panel.appoint({ caseId: o2.caseId, arbiter: 'a2' })
  panel.appoint({ caseId: o2.caseId, arbiter: 'a3' })
  ok(panel.rule({ caseId: o2.caseId, outcome: 'x', rationale: 'y' }).ok === true, 'mode: a complete panel can rule')
  ok(panel.status().panelSize === 3, 'mode: status() reports the effective panel size')

  const odd = createArbitration({ clock: c.clock, settings: { 'vmu.arbitration.mode': 'panel', 'vmu.arbitration.panelSize': 1 } })
  ok(odd.status().panelSize === 2 && odd.status().panelSizeRequested === 1, 'mode: a 1-person "panel" is widened to 2 and disclosed')
  const bogus = createArbitration({ clock: c.clock, settings: { 'vmu.arbitration.mode': 'royal-decree' } })
  ok(bogus.status().mode === 'off', 'mode: an unknown mode fails closed to off')
}

// ── 7. hearing gate (hearingMinNotes / hearingNeedsMinutes) ──────────────────────────────────────────
{
  const c = fakeClock(0)
  const d = createArbitration({ clock: c.clock, settings: S({ 'vmu.arbitration.hearingMinNotes': 2 }) })
  const o = openCase(d)
  throwsNamed(() => d.hear({ caseId: o.caseId, note: 'n' }), 'VMU_STATE', 'hearing: a case with no arbiter cannot hear')
  d.appoint({ caseId: o.caseId, arbiter: 'chair' })
  const h = d.hear({ caseId: o.caseId, note: 'first' })
  ok(h.notes === 1 && h.satisfied === false && h.minNotes === 2, 'hearing: the note count and the minimum are reported')
  throwsNamed(() => d.rule({ caseId: o.caseId, outcome: 'x', rationale: 'y' }), 'VMU_STATE', 'hearing: ruling before the minimum notes is refused')
  d.hear({ caseId: o.caseId, note: 'second' })
  ok(d.rule({ caseId: o.caseId, outcome: 'x', rationale: 'y' }).ok === true, 'hearing: once the minimum is met, the ruling is allowed')
  const nos = createArbitration({ clock: c.clock, settings: S({ 'vmu.arbitration.hearingMinNotes': 0, 'vmu.conflict.hearingNeedsMinutes': false }) })
  const o2 = openCase(nos)
  nos.appoint({ caseId: o2.caseId, arbiter: 'chair' })
  ok(nos.rule({ caseId: o2.caseId, outcome: 'x', rationale: 'y' }).ok === true, 'hearing: hearingNeedsMinutes=false relaxes the floor to 0')
}

// ── 8. maxOpen / cooldown / escalation limits (all counted, all named) ────────────────────────────────
{
  const c = fakeClock(0)
  const d = createArbitration({ clock: c.clock, settings: S({ 'vmu.conflict.maxOpen': 1 }) })
  openCase(d)
  const e = throwsNamed(() => openCase(d, { subject: 'other' }), 'VMU_CONFLICT_LIMIT', 'maxOpen: a second open case is refused')
  ok(!!e && /1\/1/.test(e.message), 'maxOpen: the refusal states current/max')

  const cool = createArbitration({ clock: c.clock, settings: S({ 'vmu.conflict.cooldownMs': 1000 }) })
  const o = openCase(cool)
  cool.appoint({ caseId: o.caseId, arbiter: 'chair' })
  cool.hear({ caseId: o.caseId, note: 'n' })
  cool.rule({ caseId: o.caseId, outcome: 'x', rationale: 'y' })
  c.advance(500)
  const e2 = throwsNamed(() => openCase(cool), 'VMU_STATE', 'cooldown: re-opening the same subject inside the cooldown is refused')
  ok(!!e2 && /500ms of 1000ms/.test(e2.message), 'cooldown: the refusal states the elapsed/required window')
  c.advance(600)
  ok(openCase(cool, { parties: ['alpha', 'gamma'] }).ok === true, 'cooldown: after the window the subject may be re-opened')

  const esc = createArbitration({ clock: fakeClock(0).clock, settings: S({ 'vmu.conflict.escalateMaxPerSubject': 1 }) })
  const o3 = openCase(esc)
  ok(esc.escalate({ caseId: o3.caseId, to: 'office', reason: 'deadlock' }).ok === true, 'escalation: the first escalation is allowed')
  const e3 = throwsNamed(() => esc.escalate({ caseId: o3.caseId, to: 'office', reason: 'again' }), 'VMU_CONFLICT_LIMIT', 'escalation: the per-subject cap is enforced')
  ok(!!e3 && /1\/1/.test(e3.message), 'escalation: the refusal states the usage')
  throwsNamed(() => esc.escalate({ caseId: o3.caseId, to: '', reason: 'x' }), 'VMU_CONFLICT_TARGET_UNKNOWN', 'escalation: an empty target is refused by name')
  throwsNamed(() => esc.escalate({ caseId: o3.caseId, to: 'office' }), 'VMU_REASON_REQUIRED', 'escalation: a missing reason is refused')
}

// ── 9. appeals: window, human gate, ordering ──────────────────────────────────────────────────────────
{
  const c = fakeClock(0)
  const d = createArbitration({ clock: c.clock, settings: S({ 'vmu.arbitration.appealWindowMs': 100 }) })
  const o = openCase(d)
  throwsNamed(() => d.appeal({ caseId: o.caseId, by: 'alpha', reason: 'x' }), 'VMU_STATE', 'appeal: an undecided case cannot be appealed')
  d.appoint({ caseId: o.caseId, arbiter: 'chair' })
  d.hear({ caseId: o.caseId, note: 'n' })
  d.rule({ caseId: o.caseId, outcome: 'x', rationale: 'y' })
  c.advance(150)
  const e = throwsNamed(() => d.appeal({ caseId: o.caseId, by: 'alpha', reason: 'late' }), 'VMU_STATE', 'appeal: a late appeal is refused')
  ok(!!e && /closed at 100ms/.test(e.message), 'appeal: the refusal states when the window closed')
  throwsNamed(() => d.appeal({ caseId: o.caseId, by: '', reason: 'x' }), 'VMU_INVALID_ARGUMENT', 'appeal: a missing appellant is refused')
  throwsNamed(() => d.appeal({ caseId: o.caseId, by: 'alpha' }), 'VMU_REASON_REQUIRED', 'appeal: a missing reason is refused')
  const off = createArbitration({ clock: c.clock, settings: S({ 'vmu.conflict.appealToHuman': false }) })
  const o2 = openCase(off)
  off.appoint({ caseId: o2.caseId, arbiter: 'chair' })
  off.hear({ caseId: o2.caseId, note: 'n' })
  off.rule({ caseId: o2.caseId, outcome: 'x', rationale: 'y' })
  throwsNamed(() => off.appeal({ caseId: o2.caseId, by: 'alpha', reason: 'r' }), 'VMU_NOT_PERMITTED', 'appeal: appealToHuman=false refuses by name')
  const okCase = createArbitration({ clock: fakeClock(0).clock, settings: S() })
  const o3 = openCase(okCase)
  okCase.appoint({ caseId: o3.caseId, arbiter: 'chair' })
  okCase.hear({ caseId: o3.caseId, note: 'n' })
  okCase.rule({ caseId: o3.caseId, outcome: 'x', rationale: 'y' })
  ok(okCase.appeal({ caseId: o3.caseId, by: 'alpha', reason: 'review' }).target === 'human', 'appeal: an in-window appeal targets the human')
}

// ── 10. pick() is deterministic and never invents authority ───────────────────────────────────────────
{
  const c = fakeClock(0)
  const senior = createArbitration({ clock: c.clock, settings: S({ 'vmu.conflict.arbiterRule': 'senior-slot' }) })
  const o = openCase(senior)
  ok(senior.pick({ caseId: o.caseId, candidates: ['z', 'a', 'm'] }).arbiter === 'z', 'pick: senior-slot takes the caller-declared order (deterministic)')
  const rnd = createArbitration({ clock: c.clock, settings: S({ 'vmu.conflict.arbiterRule': 'random' }) })
  const oR = openCase(rnd)
  const first = rnd.pick({ caseId: oR.caseId, candidates: ['x', 'y', 'z'] }).arbiter
  const second = rnd.pick({ caseId: oR.caseId, candidates: ['x', 'y', 'z'] }).arbiter
  ok(first === second, 'pick: "random" is REPRODUCIBLE (no Math.random ⇒ same answer twice)')
  const human = createArbitration({ clock: c.clock, settings: S({ 'vmu.conflict.arbiterRule': 'human' }) })
  const oH = openCase(human)
  throwsNamed(() => human.pick({ caseId: oH.caseId, candidates: ['x'] }), 'VMU_ARBITER_UNAVAILABLE', 'pick: rule=human refuses to pick for a human')
  throwsNamed(() => human.pick({ candidates: [] }), 'VMU_ARBITER_UNAVAILABLE', 'pick: no candidates is refused by name')
  throwsNamed(() => senior.pick({ caseId: o.caseId, candidates: ['alpha', 'beta'] }), 'VMU_ARBITER_UNAVAILABLE', 'pick: candidates that are ALL parties leave nobody ⇒ refused by name (ESSENTIAL ①)')
  ok(senior.pick({ candidates: ['free'] }).rule === 'senior-slot', 'pick: works without a case (selection only)')
  throwsNamed(() => senior.pick({ caseId: 'c-404', candidates: ['free'] }), 'VMU_NO_SUCH_OBJECT', 'pick: an unknown case is refused by name')
}

// ── 11. truncation counting: list()/history() report drops ────────────────────────────────────────────
{
  const c = fakeClock(0)
  const d = createArbitration({ clock: c.clock, settings: S({ 'vmu.conflict.maxOpen': 0 }) })
  for (let i = 1; i <= 5; i++) d.open({ parties: ['p' + i, 'q' + i], subject: 's' + i })
  const all = d.list()
  ok(all.count === 5 && all.available === 5 && all.dropped === 0 && all.truncated === false, 'list: five cases, no truncation')
  const capped = d.list({ limit: 2 })
  ok(capped.count === 2 && capped.available === 5 && capped.dropped === 3 && capped.truncated === true, 'list: a limit reports the DROPPED count (3)')
  ok(capped.cases[0].caseId === 'c-1' && capped.cases[1].caseId === 'c-2', 'list: deterministic insertion order')
  const h = d.history({ limit: 2 })
  ok(h.count === 2 && h.available === 5 && h.dropped === 3 && h.truncated === true, 'history: the ring also reports drops')
  ok(d.list({ state: 'open' }).count === 5 && d.list({ state: 'decided' }).count === 0, 'list: state filter works')
  ok(d.list({ subject: 's3' }).count === 1, 'list: subject filter works')
}

// ── 12. read-only purity + determinism ────────────────────────────────────────────────────────────────
{
  const c = fakeClock(9)
  const build = () => {
    const d = createArbitration({ clock: c.clock, settings: S() })
    const o = openCase(d)
    d.appoint({ caseId: o.caseId, arbiter: 'chair' })
    d.hear({ caseId: o.caseId, note: 'n' })
    d.rule({ caseId: o.caseId, outcome: 'x', rationale: 'y' })
    return d
  }
  const d = build()
  const before = JSON.stringify(d.list()) + '|' + JSON.stringify(d.status()) + '|' + JSON.stringify(d.history()) + '|' + JSON.stringify(d.effective({ caseId: 'c-1' }))
  for (let i = 0; i < 3; i++) { d.list(); d.status(); d.history(); d.effective({ caseId: 'c-1' }) }
  const after = JSON.stringify(d.list()) + '|' + JSON.stringify(d.status()) + '|' + JSON.stringify(d.history()) + '|' + JSON.stringify(d.effective({ caseId: 'c-1' }))
  ok(before === after, 'read-only: list/status/history/effective never mutate the cases')
  const a = build(); const b = build()
  ok(JSON.stringify(a.list()) === JSON.stringify(b.list()), 'determinism: two instances agree on list()')
  ok(JSON.stringify(a.status()) === JSON.stringify(b.status()), 'determinism: two instances agree on status()')
  ok(JSON.stringify(a.history()) === JSON.stringify(b.history()), 'determinism: two instances agree on history()')
  ok(a.effective({ caseId: 'c-1' }).decidedAt === 9, 'injected clock: timestamps come from clock() only')
}

// ── 13. minutes seam (recordInMinutes) and bus hooks — gaps are COUNTED, never silent ─────────────────
{
  const c = fakeClock(0)
  const minutes = fakeMinutes()
  const bus = fakeBus()
  const d = createArbitration({ clock: c.clock, settings: S(), minutes, bus })
  const o = openCase(d)
  d.appoint({ caseId: o.caseId, arbiter: 'chair' })
  d.hear({ caseId: o.caseId, note: 'n' })
  const r = d.rule({ caseId: o.caseId, outcome: 'x', rationale: 'y' })
  ok(r.inMinutes === true && minutes.rows.length === 1 && minutes.rows[0].caseId === o.caseId, 'minutes: the ruling reaches the minutes seam (recordInMinutes)')
  ok(bus.topics.includes('conflict/opened') && bus.topics.includes('conflict/resolved'), 'bus: the topics are declared through the documented extension point')
  ok(bus.rows.some((x) => x.hook === 'conflict/resolved' && x.payload.caseId === o.caseId), 'bus: conflict/resolved is emitted')

  const noSeam = createArbitration({ clock: c.clock, settings: S() })
  const o2 = openCase(noSeam)
  noSeam.appoint({ caseId: o2.caseId, arbiter: 'chair' })
  noSeam.hear({ caseId: o2.caseId, note: 'n' })
  const r2 = noSeam.rule({ caseId: o2.caseId, outcome: 'x', rationale: 'y' })
  ok(r2.inMinutes === false && /no minutes seam/.test(String(r2.minutesNote)), 'minutes: a missing seam is disclosed in the ruling')
  ok(noSeam.status().unwiredTotal >= 1 && noSeam.status().unwired['minutes-seam'] >= 1, 'minutes: the missing seam is COUNTED as a wiring gap')

  const broken = createArbitration({ clock: c.clock, settings: S(), minutes: fakeMinutes({ throwOnAppend: true }) })
  const o3 = openCase(broken)
  broken.appoint({ caseId: o3.caseId, arbiter: 'chair' })
  broken.hear({ caseId: o3.caseId, note: 'n' })
  ok(broken.rule({ caseId: o3.caseId, outcome: 'x', rationale: 'y' }).ok === true, 'minutes: a broken seam never breaks the ruling')
  ok(broken.status().unwired['minutes-seam'] === 1, 'minutes: the broken seam is counted')
  const busDown = createArbitration({ clock: c.clock, settings: S(), bus: fakeBus({ throwOnEmit: true }) })
  openCase(busDown)
  ok(busDown.status().unwired['bus:conflict/opened'] === 1, 'bus: a broken bus is a COUNTED wiring gap')
}

// ── 14. the remaining named refusals ──────────────────────────────────────────────────────────────────
{
  const c = fakeClock(0)
  const d = createArbitration({ clock: c.clock, settings: S() })
  throwsNamed(() => d.open({ parties: ['only-one'], subject: 's' }), 'VMU_INVALID_ARGUMENT', 'open: fewer than two parties refused')
  throwsNamed(() => d.open({ parties: ['a', 'a'], subject: 's' }), 'VMU_INVALID_ARGUMENT', 'open: duplicate parties refused')
  throwsNamed(() => d.open({ parties: ['a', 'b'] }), 'VMU_INVALID_ARGUMENT', 'open: a missing subject refused')
  throwsNamed(() => d.open({ parties: ['a', 'b'], subject: 's', kind: 'nonsense' }), 'VMU_INVALID_ARGUMENT', 'open: an undeclared conflict class refused')
  const o = openCase(d)
  throwsNamed(() => d.appoint({ caseId: 'c-404', arbiter: 'x' }), 'VMU_NO_SUCH_OBJECT', 'appoint: an unknown case refused')
  throwsNamed(() => d.appoint({ caseId: o.caseId }), 'VMU_INVALID_ARGUMENT', 'appoint: a missing arbiter refused')
  throwsNamed(() => d.hear({ caseId: o.caseId, note: 'n' }), 'VMU_STATE', 'hear: hearing before an appointment refused')
  d.appoint({ caseId: o.caseId, arbiter: 'chair' })
  throwsNamed(() => d.hear({ caseId: o.caseId, note: '   ' }), 'VMU_INVALID_ARGUMENT', 'hear: a blank note refused')
  throwsNamed(() => d.declareConflict({ caseId: o.caseId, arbiter: 'chair', withParty: 'stranger' }), 'VMU_NO_SUCH_OBJECT', 'declareConflict: a non-party refused with the party list')
  throwsNamed(() => d.declareConflict({ caseId: o.caseId, withParty: 'alpha' }), 'VMU_INVALID_ARGUMENT', 'declareConflict: a missing arbiter refused')
  ok(d.declareConflict({ caseId: o.caseId, arbiter: 'chair', withParty: 'alpha' }).ok === true, 'declareConflict: a real conflict is recorded')
  ok(d.declareConflict({ caseId: o.caseId, arbiter: 'chair', withParty: 'alpha' }).ok === true, 'declareConflict: declaring twice is idempotent')
  throwsNamed(() => d.effective({}), 'VMU_NO_SUCH_OBJECT', 'effective: an unknown case refused')
  ok(d.status().refusals.VMU_INVALID_ARGUMENT >= 5 && d.status().refusals.VMU_NO_SUCH_OBJECT >= 3, 'refusals: every refusal is counted by code')
  ok(refuse('X', 'y', 'z').code === 'X' && refuse('X', 'y', 'z').hint === 'z', 'refuse(): the named-error helper keeps code/hint')
}

console.log('=== VMU ARBITRATION: ' + passed + ' passed, ' + failed + ' failed ===')
if (failed > 0) process.exit(1)

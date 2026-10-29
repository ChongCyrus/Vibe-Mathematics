// tests/vmu-assistant-report.test.mjs — GOAL 6, HALF ONE: the reporting primitive and the parameter face.
//
// WHAT THIS SUITE IS FOR. v5r's main agent (the `office` session root) is the ASSISTANT/external interface: it does not
// research and does not vote (agent.cordis.yml:74-86), and its parameters are the only ones anybody may change
// (`withOffice` refused everything else with V5_NOT_OFFICE). What v5r did NOT have is a reporting MECHANISM: only
// persona prose, the Progress/ files, an academician-initiated overview, and the office's manual report(). So the
// framework has to provide the primitive - declarable triggers, content templates, recipients and channels, an off
// switch that declares nothing by default, a trace per report, and a parameter-config face - and this suite is the
// machine proof that each of those is real rather than described.
//
// THE THREE PROPERTIES THAT MATTER MOST, and each has its own section:
//   · ZERO MECHANISM: nothing declared ⇒ nothing happens (and the pack's policy is what turns it on);
//   · IT NEVER DRIVES: every receipt says drives:false, a declaration that tries to attach an action is refused BY
//     NAME, and the module cannot even reach a decision service (it has no imports at all);
//   · NAMED REFUSALS, NEVER A SILENT SLIP: an unknown trigger, an unknown template variable, an out-of-domain
//     parameter and a wrong owner all come back with a code and a hint, and every change leaves an audit row.
//
// Run: node tests/vmu-assistant-report.test.mjs
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { createReport, CODE, EVENT_VOCAB, TRIGGER_KINDS, THRESHOLD_OPS, DRIVING_FIELDS, TEMPLATE_VARS } from '../vibe-math-vmu/kernel/report.js'
import { makeReportSpec } from '../vibe-math-vmu/tools/report.js'
import { PACK } from '../vibe-math-vmu/packs/v5r/prompts/v5r-core.js'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..')

let passed = 0
let failed = 0
const failures = []
function ok(cond, label, detail) {
  if (cond) { passed++; console.log('  ok   ' + label); return true }
  failed++; failures.push(label + (detail === undefined ? '' : ' — ' + JSON.stringify(detail)))
  console.error('  FAIL ' + label + (detail === undefined ? '' : ' — ' + JSON.stringify(detail)))
  return false
}
const throwsCode = (fn, code) => {
  try { fn() } catch (e) { return e && e.code === code }
  return false
}

/** A report face with a controllable clock, a delivery recorder and an audit recorder. */
function harness(settings = {}) {
  let t = 1000
  const sent = []
  const auditRows = []
  const logs = []
  const face = createReport({
    clock: () => t,
    log: (e) => logs.push(e),
    settings,
    deliver: (n) => sent.push(n),
    audit: { append: (row) => auditRows.push(row) },
  })
  return { face, sent, auditRows, logs, at: (v) => { t = v }, now: () => t }
}

console.log('=== 1. ZERO MECHANISM: NOTHING DECLARED ⇒ NOTHING HAPPENS ===')
{
  const h = harness({})
  const s = h.face.status()
  ok(s.enabled === false && s.declared === 0 && s.armed === 0,
    'an unconfigured instance reports nothing and says so (enabled=false, declared=0)', { enabled: s.enabled, declared: s.declared })
  const t1 = h.face.tick({ at: 2000, event: 'progress', metrics: { artifacts: 99 } })
  ok(t1.ok === true && t1.fired.length === 0 && t1.delivered === 0 && h.sent.length === 0,
    'a tick fires nothing and sends nothing', t1)
  ok(/zero mechanism/.test(String(t1.note)), 'and the receipt explains WHY (zero mechanism, not "nothing matched")', t1.note)
  const d = h.face.declarations()
  ok(d.declared === 0 && d.problems.length === 0, 'declarations() reports an empty, problem-free surface', d)
  ok(s.drives === false && s.neverDrives === true, 'and the status face states the invariant: a report never drives', s)
}

console.log('=== 2. THE THREE TRIGGER KINDS, DECLARED AND REAL ===')
{
  // EACH KIND IN ITS OWN HARNESS, on purpose: a period trigger fires on every tick past its interval, so mixing the
  // three would make an assertion about the event trigger accidentally about the period one.
  const period = harness({ 'vmu.report.enabled': true, 'vmu.report.minIntervalMs': 0, 'vmu.report.reports': [
    { name: 'per', trigger: { kind: 'period', everyMs: 100 }, template: 'PER {{ count }} @{{ at }}', to: ['office'], channel: 'digest' },
  ] })
  ok(period.face.declarations().declared === 1 && period.face.declarations().problems.length === 0,
    'a declared period trigger normalises without problems', period.face.declarations().problems)
  // THE PERIODS ARE ARMED BY THE FIRST EVALUATION, not by construction: constructing the face must not need a clock at
  // all (section 10 is the regression that proves why), and "when did this mechanism start being driven" is a fact the
  // first tick actually knows.
  const arm = period.face.tick({ at: 1000 })
  ok(arm.fired.length === 0 && arm.clock.ok === true && period.face.status().periodBaseArmed === true,
    'the first evaluation ARMS the periods and fires nothing', { at: arm.at, ok: arm.clock.ok })
  ok(period.face.tick({ at: 1099 }).fired.length === 0, 'it does NOT fire before its interval has elapsed')
  const p1 = period.face.tick({ at: 1100 })
  ok(p1.fired.length === 1 && p1.fired[0].name === 'per', 'it fires exactly once when the interval has elapsed', p1.fired.map((f) => f.name))
  ok(period.face.tick({ at: 1150 }).fired.length === 0, 'and not again inside the same interval (no machine-gun reporting)')
  ok(period.face.tick({ at: 1200 }).fired.filter((f) => f.name === 'per').length === 1, 'the next interval fires again')

  const evt = harness({ 'vmu.report.enabled': true, 'vmu.report.reports': [
    { name: 'evt', trigger: { kind: 'event', event: 'meeting-closed' }, template: 'EVT {{ at }}', to: ['office'], channel: 'inbox' },
  ] })
  ok(evt.face.tick({ at: 1300, event: 'progress' }).fired.length === 0, 'an undeclared event fires nothing')
  const unknown = evt.face.tick({ at: 1400, event: 'not-a-real-event' })
  ok(unknown.ignored.length === 1 && unknown.ignored[0].code === CODE.triggerUnknown,
    'an event outside the closed vocabulary is REPORTED as ignored (never folded into a near miss)', unknown.ignored)
  ok(evt.face.tick({ at: 1500, event: 'meeting-closed' }).fired.length === 1, 'the declared event fires')
  ok(evt.face.tick({ at: 1600 }).fired.length === 0, 'and a tick with no event fires no event trigger at all')

  const thr = harness({ 'vmu.report.enabled': true, 'vmu.report.reports': [
    { name: 'thr', trigger: { kind: 'threshold', metric: 'artifacts', op: 'gte', value: 3 }, template: 'THR {{ metric:artifacts }}', to: ['office'], channel: 'inbox' },
  ] })
  ok(thr.face.tick({ at: 1600, metrics: { artifacts: 2 } }).fired.length === 0, 'a threshold below its line does not fire')
  ok(thr.face.tick({ at: 1700 }).fired.length === 0, 'nor does a tick with no metrics at all')
  ok(thr.face.tick({ at: 1700, metrics: { artifacts: 3 } }).fired.length === 1, 'and fires when the metric reaches the line')
  ok(thr.face.tick({ at: 1800, metrics: { artifacts: 40 } }).fired.filter((f) => f.name === 'thr').length === 1,
    'a threshold trigger keeps firing while the metric stays over the line (it is a line, not a level change)')

  ok(period.sent.length + evt.sent.length + thr.sent.length === 5,
    'every emission reached the injected transport exactly once (2 period + 1 event + 2 threshold)',
    { sent: period.sent.length + evt.sent.length + thr.sent.length })
  ok([...period.sent, ...evt.sent, ...thr.sent].every((n) => n.drives === false), 'and every delivered report says drives:false')
  ok(TRIGGER_KINDS.length === 3 && THRESHOLD_OPS.length === 5 && EVENT_VOCAB.length === 8,
    'the declared vocabularies are the three trigger kinds, five comparison ops and eight events',
    { kinds: TRIGGER_KINDS.length, ops: THRESHOLD_OPS.length, events: EVENT_VOCAB.length })
}

console.log('=== 3. TEMPLATES: DECLARED CONTENT, CLOSED VARIABLES, VISIBLE TRUNCATION ===')
{
  const h = harness({
    'vmu.report.enabled': true,
    'vmu.report.reports': [
      { name: 'good', trigger: { kind: 'event', event: 'progress' }, template: 'N={{ name }} E={{ event }} A={{ at }} C={{ count }}', to: ['office'], channel: 'inbox' },
      { name: 'badvar', trigger: { kind: 'event', event: 'progress' }, template: 'oops {{ nope }}', to: ['office'], channel: 'inbox' },
    ],
  })
  const d = h.face.declarations()
  const bad = d.problems.find((p) => p.name === 'badvar')
  ok(bad && bad.code === CODE.templateVarUnknown, 'an unregistered template variable is a NAMED declaration problem', bad)
  ok(d.items.find((x) => x.name === 'badvar').problems.length === 1 && d.items.find((x) => x.name === 'good').problems.length === 0,
    'and a broken declaration is never armed while its sibling still is')
  const t = h.face.tick({ at: 2000, event: 'progress' })
  ok(t.fired.length === 1 && t.fired[0].name === 'good', 'the valid report fires', t.fired.map((f) => f.name))
  ok(t.skipped.some((s) => s.name === 'badvar' && s.code === CODE.templateVarUnknown),
    'the broken one is REPORTED as skipped on every tick, not silently forgotten', t.skipped)
  ok(t.fired[0].text === 'N=good E=progress A=2000 C=1', 'every placeholder resolved to the real value', t.fired[0].text)
  ok(throwsCode(() => h.face.preview({ name: 'good', payload: { metrics: {} } }), null) === false,
    'preview renders without any transport or side effect')

  // a variable whose value nobody supplied is refused at RENDER time, never rendered as an empty slot
  const h2 = harness({ 'vmu.report.enabled': true, 'vmu.report.reports': [
    { name: 'miss', trigger: { kind: 'threshold', metric: 'x', op: 'gte', value: 1 }, template: 'X={{ metric:missing }}', to: ['office'], channel: 'inbox' },
  ] })
  ok(throwsCode(() => h2.face.tick({ at: 1, metrics: { x: 5 } }), CODE.templateVarUnknown),
    'a metric placeholder with no supplied metric is refused BY NAME at render time, not left empty')

  // truncation must be visible in the text AND counted
  const long = 'x'.repeat(50)
  const h3 = harness({ 'vmu.report.enabled': true, 'vmu.report.templateMaxChars': 20, 'vmu.report.reports': [
    { name: 'long', trigger: { kind: 'event', event: 'progress' }, template: 'L=' + long, to: ['office'], channel: 'inbox' },
  ] })
  const t3 = h3.face.tick({ at: 1, event: 'progress' })
  ok(t3.fired[0].truncated === 32 && /已截断：省略尾部 32 字符/.test(t3.fired[0].text),
    'an over-long report is truncated, with the omitted count IN the text and in the receipt', t3.fired[0])
  ok(h3.face.status().truncated === 1, 'and the truncation is counted on the status face', h3.face.status().truncated)
  ok(TEMPLATE_VARS.includes('metric:') && TEMPLATE_VARS.includes('setting:') && TEMPLATE_VARS.includes('at'),
    'the template whitelist is published, so a declaration can be written against it instead of guessed', TEMPLATE_VARS)
}

console.log('=== 4. THE OFF SWITCH: DECLARED BUT OFF IS VISIBLE, NOT SILENT ===')
{
  const reports = [{ name: 'r', trigger: { kind: 'event', event: 'progress' }, template: 'R', to: ['office'], channel: 'inbox' }]
  const off = harness({ 'vmu.report.enabled': false, 'vmu.report.reports': reports })
  const s = off.face.status()
  ok(s.declared === 1 && s.enabled === false && s.armed === 1,
    'a declared report under a disabled switch is still DECLARED (and armed), it is simply not evaluated', s)
  ok(s.problems.some((p) => p.code === CODE.notEnabled), 'and the off state is named in problems rather than hidden', s.problems)
  const t = off.face.tick({ at: 5, event: 'progress' })
  ok(t.fired.length === 0 && off.sent.length === 0 && /off switch/.test(String(t.note)),
    'a tick under the off switch fires nothing and explains that it is the switch', t.note)
  ok(throwsCode(() => off.face.emit({ name: 'r' }), CODE.notEnabled),
    'an explicit emit under the off switch is refused BY NAME ("off" that still sends is not an off switch)')
  // a declaration may switch itself off, and an unknown name is its own named refusal
  const one = harness({ 'vmu.report.enabled': true, 'vmu.report.reports': [Object.assign({ enabled: false }, reports[0])] })
  ok(one.face.tick({ at: 5, event: 'progress' }).fired.length === 0, 'a report declared with enabled:false does not fire')
  ok(throwsCode(() => one.face.emit({ name: 'r' }), CODE.notEnabled), 'and emit says so by name too')
  ok(throwsCode(() => one.face.emit({ name: 'ghost' }), CODE.unknownName), 'an undeclared name is refused by name')
  // and the switch is now ON in the same instance, with no reconstruction
  const on = harness({ 'vmu.report.enabled': true, 'vmu.report.reports': reports })
  ok(on.face.tick({ at: 5, event: 'progress' }).fired.length === 1, 'the same declaration fires once the switch is on')
}

console.log('=== 5. IT NEVER DRIVES (the invariant, structurally and behaviourally) ===')
{
  const src = readFileSync(join(REPO, 'vibe-math-vmu', 'kernel', 'report.js'), 'utf8')
  ok(!/^import\s/m.test(src),
    'kernel/report.js has NO imports at all, so it cannot reach a decision service even by accident', { imports: (src.match(/^import\s/gm) || []).length })
  const h = harness({
    'vmu.report.enabled': true,
    'vmu.report.reports': [
      { name: 'driver', trigger: { kind: 'event', event: 'progress' }, template: 'D', to: ['office'], channel: 'inbox', action: 'pause' },
      { name: 'driver2', trigger: { kind: 'event', event: 'progress' }, template: 'D2', to: ['office'], channel: 'inbox', decide: true },
    ],
  })
  const d = h.face.declarations()
  ok(d.problems.length === 2 && d.problems.every((p) => p.code === CODE.actionNotAllowed),
    'a declaration that tries to attach an action is refused BY NAME (never quietly disarmed)', d.problems)
  const t = h.face.tick({ at: 1, event: 'progress' })
  ok(t.fired.length === 0 && t.skipped.length === 2, 'and such a declaration never fires', t.skipped)
  ok(throwsCode(() => h.face.emit({ name: 'driver' }), CODE.actionNotAllowed), 'emit on it is refused by name')
  const receipts = [h.face.status(), h.face.tick({ at: 2 }), h.face.paramDomain(), h.face.trace(), h.face.noteParamChange({ key: 'k', to: 1 })]
  ok(receipts.every((r) => r.drives === false), 'EVERY receipt carries drives:false', receipts.map((r) => r.drives))
  ok(DRIVING_FIELDS.includes('action') && DRIVING_FIELDS.includes('decide'), 'the forbidden field list is published', DRIVING_FIELDS)
}

console.log('=== 6. EVERY REPORT AND EVERY CHANGE LEAVES A TRACE ===')
{
  const h = harness({
    'vmu.report.enabled': true,
    'vmu.report.traceCap': 3,
    'vmu.report.reports': [{ name: 'a', trigger: { kind: 'event', event: 'progress' }, template: 'A{{ at }}', to: ['office'], channel: 'inbox' }],
  })
  for (let i = 0; i < 5; i++) h.face.tick({ at: i, event: 'progress' })
  const tr = h.face.trace({ limit: 10 })
  ok(tr.items.length === 3 && tr.total === 3 && tr.dropped === 2,
    'the trace ring keeps vmu.report.traceCap rows and COUNTS what it dropped', { kept: tr.items.length, dropped: tr.dropped })
  ok(tr.items.every((r) => r.drives === false && r.name === 'a' && r.delivered === true),
    'each row names the report, the trigger, the delivery and drives:false', tr.items[0])
  const creates = h.auditRows.filter((r) => r.what === 'create')
  ok(creates.length === 5 && creates.every((r) => String(r.subject).startsWith('report:') && r.drove === false),
    'the AUDIT carries one row per emission, marked drove:false', creates.length)
  const change = h.face.noteParamChange({ key: 'vmu.turn.objective', from: 'a', to: 'b', by: 'office', reason: 'user asked' })
  const updates = h.auditRows.filter((r) => r.what === 'update')
  ok(change.audit.appended === true && updates.length === 1 && updates[0].subject === 'setting:vmu.turn.objective' && updates[0].reason === 'user asked',
    'a parameter change writes an audit row with subject/from/to/by/reason', updates)
  // an absent audit seam is a NAMED gap, not a pretend write
  const noAudit = createReport({ clock: () => 1, settings: { 'vmu.report.enabled': true }, deliver: () => {} })
  const r2 = noAudit.noteParamChange({ key: 'k', to: 1 })
  ok(r2.audit.appended === false && r2.audit.code === CODE.auditUnavailable && /named gap/.test(String(r2.audit.note)),
    'with no audit seam the receipt says so by name instead of claiming a durable write', r2.audit)
  // a transport-less assembly still records before it refuses
  const noTransport = createReport({ clock: () => 1, settings: { 'vmu.report.enabled': true, 'vmu.report.reports': [{ name: 'x', trigger: { kind: 'event', event: 'progress' }, to: ['office'], channel: 'inbox' }] } })
  const t2 = noTransport.tick({ at: 1, event: 'progress' })
  ok(t2.fired.length === 1 && t2.fired[0].delivered === false && t2.fired[0].refused && t2.fired[0].refused.code === CODE.noTransport,
    'without a transport the report is RECORDED and refused by name (nothing is pretended)', t2.fired[0])
  ok(noTransport.trace().total === 1, 'and the trace still has the row')
  ok(throwsCode(() => noTransport.emit({ name: 'x' }), CODE.noTransport), 'an explicit emit without a transport refuses by name')
  // ★ LIVE RUN 20/21: the receipt of the FAILED emit is a read face, and the key a reader is told to quote is
  // `delivered`. It was absent from the thrown refusal (the kernel record had `delivered:false` on the RECORD but not
  // on the error), and then absent AGAIN because the tool face carried a hand-written whitelist of keys. Both layers
  // are asserted here, so the pair cannot drift apart again without this going red.
  let thrown = null
  try { noTransport.emit({ name: 'x' }) } catch (e) { thrown = e }
  ok(thrown && thrown.delivered === false, '★ the THROWN no-transport refusal carries delivered:false (not absent)', thrown && thrown.delivered)
  ok(thrown && thrown.drives === false && thrown.neverDrives === true && thrown.transportInjected === false,
    '★ and the other three facts ride with it, so all four quoted keys exist on one receipt',
    thrown && { drives: thrown.drives, neverDrives: thrown.neverDrives, transportInjected: thrown.transportInjected })
}

console.log('=== 7. THE PARAMETER DOMAIN: DECLARED KEYS, DECLARED OWNERS, REPORTED HOT CLASS ===')
{
  const h = harness({ 'vmu.report.params': ['vmu.turn.objective'], 'vmu.report.whoMayChange': ['office'] })
  const dom = h.face.paramDomain()
  ok(dom.paramsDeclared === true && dom.entries.length === 1 && dom.entries[0].key === 'vmu.turn.objective',
    'the domain is exactly what vmu.report.params declares', dom.entries)
  ok(dom.described === false && dom.entries[0].hot === null && dom.entries[0].who === null && /UNKNOWN/.test(dom.note),
    'with no settings descriptor the hot class and owner are reported as UNKNOWN, never invented', dom.note)
  ok(throwsCode(() => h.face.guardParam({ key: 'vmu.meetings.hardLimitMs', by: 'office' }), CODE.paramNotDeclared),
    'a key outside the declared domain is refused BY NAME', 'vmu.meetings.hardLimitMs')
  ok(throwsCode(() => h.face.guardParam({ key: 'vmu.turn.objective', by: 'r-1' }), CODE.paramNotAllowed),
    'an owner outside vmu.report.whoMayChange is refused BY NAME (the v5r boundary, as a declaration)')
  ok(h.face.guardParam({ key: 'vmu.turn.objective', by: 'office' }).ok === true, 'the declared owner passes the guard')

  const empty = harness({})
  ok(empty.face.paramDomain().paramsDeclared === false && /refused by name rather than guessed at/.test(empty.face.paramDomain().note),
    'an empty domain says so: nothing is addressable rather than everything being allowed')
  ok(throwsCode(() => empty.face.guardParam({ key: 'vmu.core.enabled' }), CODE.paramNotDeclared),
    'and with an empty domain EVERY key is refused by name')

  const strict = harness({ 'vmu.report.params': ['vmu.turn.objective'], 'vmu.report.requireReason': true })
  ok(throwsCode(() => strict.face.guardParam({ key: 'vmu.turn.objective', by: 'office' }), CODE.paramReasonRequired),
    'vmu.report.requireReason=true refuses a change with no reason')
  ok(strict.face.guardParam({ key: 'vmu.turn.objective', by: 'office', reason: 'user asked' }).ok === true, 'and accepts one with a reason')

  const described = createReport({ clock: () => 1, settings: { 'vmu.report.params': ['k'] },
    describeSetting: (key) => ({ key, declared: true, type: 'boolean', hot: 'H1', who: 'office' }) })
  const d2 = described.paramDomain()
  ok(d2.described === true && d2.entries[0].hot === 'H1' && d2.entries[0].who === 'office' && d2.entries[0].declared === true,
    'with the descriptor injected the hot class and the declared owner are surfaced', d2.entries[0])
  ok(d2.hotClasses.join(',') === 'H1', 'the hot classes are collected, so a caller can see what a change will cost')
}

console.log('=== 8. THE TOOL FACE: ONE SANCTIONED WRITER, ONE GUARD, NO HAND-WRITTEN SETTINGS ===')
{
  const calls = []
  const face = harness({ 'vmu.report.enabled': true, 'vmu.report.params': ['vmu.turn.objective'], 'vmu.report.whoMayChange': ['office'] }).face
  const kernel = {
    report: face,
    setSettingsValue(key, value, { by } = {}) {
      calls.push({ key, value, by })
      return { ok: true, key, value, hot: 'H2', who: 'office', ownerCheck: 'identified', appliesAt: 'next session', requiresRestart: true,
        liveApplied: [], pendingConsumers: ['kernel'], previous: 'old' }
    },
  }
  const spec = makeReportSpec({ param: (type, description, extra = {}) => ({ type, description, ...extra }), refused: (code, message, hint) => ({ ok: false, code, message, hint: hint || null }), TOOL_NAMES: { report: 'vibe_vmu_report' }, kernel })
  ok(spec.name === 'vibe_vmu_report', 'the tool publishes the declared name')
  ok(JSON.stringify(spec.parameters.action.enum) === JSON.stringify(['status', 'declarations', 'params', 'set', 'preview', 'emit', 'tick', 'trace']),
    'and the eight actions the wiring order names', spec.parameters.action.enum)
  const status = await spec.run({ action: 'status' })
  ok(status.ok === true && status.action === 'status' && status.declared === 0, 'status forwards the service status', status.declared)
  const set = await spec.run({ action: 'set', key: 'vmu.turn.objective', value: 'prove P=NP', by: 'office', reason: 'the user asked' })
  ok(set.ok === true && calls.length === 1 && calls[0].key === 'vmu.turn.objective' && calls[0].value === 'prove P=NP' && calls[0].by === 'office',
    'set goes through the KERNEL writer (the sanctioned path), not through a hand-written assignment', calls)
  ok(set.appliesAt === 'next session' && set.requiresRestart === true && set.hot === 'H2',
    'and the receipt carries the hot class and the real apply point (H2 says it needs a restart)', set)
  ok(set.audit.appended === true, 'the change left an audit row', set.audit)
  const typed = await spec.run({ action: 'set', key: 'vmu.turn.objective', value: 'true', by: 'office' })
  ok(typed.ok === true && calls[1].value === true, 'a boolean-looking string is read as the declared boolean, not stored as "true"', calls[1])
  const outOfDomain = await spec.run({ action: 'set', key: 'vmu.core.enabled', value: 'false', by: 'office' })
  ok(outOfDomain.ok === false && outOfDomain.code === CODE.paramNotDeclared, 'an out-of-domain key is a structured named refusal', outOfDomain)
  ok(calls.length === 2, 'and nothing was written for it', calls.length)
  const wrongOwner = await spec.run({ action: 'set', key: 'vmu.turn.objective', value: 'x', by: 'r-1' })
  ok(wrongOwner.ok === false && wrongOwner.code === CODE.paramNotAllowed, 'a wrong owner is a structured named refusal', wrongOwner)
  const noFace = makeReportSpec({ param: (t, d, e = {}) => ({ t, d, ...e }), refused: (code, message, hint) => ({ ok: false, code, message, hint: hint || null }), TOOL_NAMES: { report: 'vibe_vmu_report' }, kernel: {} })
  const missing = await noFace.run({ action: 'status' })
  ok(missing.ok === false && missing.code === 'VMU_ENGINE_UNAVAILABLE', 'an assembly with no report face refuses by name instead of no-op', missing)
  // ★ LIVE RUN 21: the TOOL FACE is the layer the agent actually reads, and it used to rebuild the refusal from a
  // HAND-WRITTEN key list — so the "delivered" field I had just added to the kernel error was dropped one layer above
  // it and run 21 reported the same missing key again. The face now carries every own field of the refusal, so this
  // asserts a receipt a caller could quote: code + the four facts + the report name and id.
  const faceKernel = { report: { emit() {
    const e = new Error('no delivery transport was injected: nothing was sent (and nothing is pretended)')
    e.code = CODE.noTransport
    e.hint = 'pass { deliver: (report) => ... } when creating the module'
    e.delivered = false
    e.drives = false
    e.neverDrives = true
    e.transportInjected = false
    e.report = 'x'
    e.id = 'rep-1'
    throw e
  }, status: () => ({ ok: true }), declarations: () => ({ declared: [] }) } }
  const faceSpec = makeReportSpec({ param: (t, d, e = {}) => ({ t, d, ...e }), refused: (code, message, hint) => ({ ok: false, code, message, hint: hint || null }), TOOL_NAMES: { report: 'vibe_vmu_report' }, kernel: faceKernel })
  const faceRefusal = await faceSpec.run({ action: 'emit', name: 'x' })
  ok(faceRefusal.ok === false && faceRefusal.code === CODE.noTransport, '★ the tool face returns the refusal as a receipt, not a throw', faceRefusal)
  ok(faceRefusal.delivered === false && faceRefusal.drives === false && faceRefusal.neverDrives === true && faceRefusal.transportInjected === false,
    '★ and the receipt the CALLER quotes carries all four facts (a hand-written key list dropped delivered once)', faceRefusal)
  ok(faceRefusal.report === 'x' && faceRefusal.id === 'rep-1', 'and the report name and id survive the face too', { report: faceRefusal.report, id: faceRefusal.id })
}

console.log('=== 9. THE PACK\'S OWN POLICY IS VALID (it cannot ship a broken declaration) ===')
{
  // THE PACK'S REPORTING POLICY IS DECLARED ON THE LOADED MANIFEST (`packs/v5r/prompts/v5r-core.js`), not in
  // `settings/defaults.json`: that file is the pack's VALUE layer and says so itself, and a key claimed by both records
  // would be a named VMU_PACK_CONFLICT (D-02/O4) - which is exactly the conflict this suite hit while both declared it.
  const declared = PACK.settings['vmu.report.reports']
  ok(Array.isArray(declared) && declared.length >= 3,
    'the v5r pack declares its reporting policy on the loaded manifest (one owner per key)',
    { reports: Array.isArray(declared) ? declared.length : null })
  const defaultsPath = join(REPO, 'vibe-math-vmu', 'packs', 'v5r', 'settings', 'defaults.json')
  const defaults = (JSON.parse(readFileSync(defaultsPath, 'utf8')).defaults) || {}
  ok(!Object.keys(defaults).some((k) => k.startsWith('vmu.report.')),
    'and the pack\'s value layer declares NO vmu.report.* key, so the two records cannot fight over one knob',
    Object.keys(defaults).filter((k) => k.startsWith('vmu.report.')))
  const bookmark = createReport({ clock: () => 1, settings: {
    'vmu.report.enabled': PACK.settings['vmu.report.enabled'],
    'vmu.report.reports': declared,
    'vmu.report.params': PACK.settings['vmu.report.params'],
    'vmu.report.whoMayChange': PACK.settings['vmu.report.whoMayChange'],
  }, deliver: () => {} })
  const d = bookmark.declarations()
  ok(d.declared >= 3 && d.problems.length === 0,
    'those declarations normalise with ZERO problems (a broken declaration would be a pack defect, not a test finding)', d.problems)
  const kinds = d.items.map((it) => it.kind).sort().join(',')
  // ★ LIVE RUN 126 (A2): the pack now declares FOUR reports — one per trigger kind plus a second `event` listener for
  // `progress`, because the kernel started emitting that event and an event nobody waits for is not a report. The
  // assertion is therefore "every kind of the three is exercised", not a hard-coded count of listeners.
  const kindSet = [...new Set(d.items.map((it) => it.kind))].sort().join(',')
  ok(kindSet === 'event,period,threshold' && d.items.filter((it) => it.kind === 'event').length >= 2,
    'and the pack exercises all three trigger kinds (with a progress listener among the events), so the whole surface is policy-driven rather than test-only',
    kinds)
  // NON-EMPTY FIRST (RULE E): `every()` on an empty list is true, so the guard and the check live in ONE expression.
  ok(d.items.length > 0 && d.items.every((it) => it.to.includes('office')),
    'every pack report is addressed to the office, which is v5r\'s external interface', { reports: d.items.length })
  const pd = bookmark.paramDomain()
  ok(pd.declared >= 5 && pd.whoMayChange.includes('office'),
    'the pack declares the parameter domain and names the office as its only owner (v5r\'s boundary, as a declaration)', pd)
  ok(PACK.settings['vmu.report.enabled'] === true,
    'and the pack turns the mechanism ON (the schema default is already false, so a pack that declared reports and left it off would have declared a mechanism it can never run)')
  ok(bookmark.status().enabled === true, 'so the mechanism is live when the pack is loaded')
  // ZERO MECHANISM IS UNTOUCHED BY THE PACK EXISTING: an assembly that does NOT activate the pack still reports nothing.
  const untouched = createReport({ clock: () => 1, settings: {}, deliver: () => {} })
  ok(untouched.status().enabled === false && untouched.status().declared === 0,
    'while an assembly that does NOT activate the pack still reports nothing (zero mechanism survives the pack)')
}

console.log('=== 10. A HOST CLOCK THAT IS NOT A NUMBER CANNOT TAKE THE PRESET DOWN (regression) ===')
{
  // MEASURED DEFECT (reported by vmu-pack, reproduced here): the kernel hands this face the CLOCK-GUARDED clock, and the
  // guard THROWS for a non-finite reading - while a host may legitimately inject an ISO-string clock
  // (`tests/vmu-entry.test.mjs:36` does exactly that). Reading the clock at CONSTRUCTION therefore killed
  // `createKernel` itself, i.e. a face no declaration had even switched on could bring the whole preset down. The fix
  // is in the shape of the module: no clock read at construction, and a diagnostic surface REPORTS a broken clock.
  const REPORTS = [
    { name: 'evt', trigger: { kind: 'event', event: 'progress' }, template: 'E {{ at }}', to: ['office'], channel: 'inbox' },
    { name: 'per', trigger: { kind: 'period', everyMs: 100 }, template: 'P {{ at }}', to: ['office'], channel: 'inbox' },
  ]
  const stringClock = () => '2026-10-09T00:00:00.000Z'
  let constructed = true
  let a = null
  try { a = createReport({ clock: stringClock, settings: { 'vmu.report.enabled': true, 'vmu.report.minIntervalMs': 0, 'vmu.report.reports': REPORTS }, deliver: () => {} }) }
  catch (e) { constructed = false }
  ok(constructed && a !== null, 'constructing the face with a STRING clock does not throw (construction reads no clock)')
  if (constructed) {
    const st = a.status()
    ok(st.clock.ok === false && st.problems.some((p) => p.name === '(clock)'),
      'status() reports the clock as unusable BY NAME instead of dying of it (every time-based trigger is degraded)', st.clock)
    ok(a.tick({ at: 5000, event: 'progress' }).fired.length === 1,
      'an event trigger still works when the moment is supplied explicitly (`at`)')
    const t = a.tick({})
    ok(t.fired.length === 0 && t.clock.ok === false && t.clock.note !== null,
      'a period trigger is simply UNEVALUABLE and the receipt says why (nothing is guessed from a bad clock)', t.clock)
  }
  // the guard itself throws, and that must be caught and reported too - not propagated into the caller
  const throwingClock = () => { const e = new Error('the injected clock returned a non-finite value: NaN'); e.code = 'VMU_CLOCK_UNGUARDED'; throw e }
  let b = null
  let constructed2 = true
  try { b = createReport({ clock: throwingClock, settings: { 'vmu.report.enabled': true, 'vmu.report.reports': REPORTS }, deliver: () => {} }) }
  catch (e) { constructed2 = false }
  ok(constructed2 && b !== null, 'and a clock that THROWS is also survivable at construction')
  if (constructed2) {
    ok(b.status().clock.ok === false && /VMU_CLOCK_UNGUARDED/.test(String(b.status().clock.note)),
      'with the guard refusal carried as a named reason', b.status().clock)
    ok(throwsCode(() => b.emit({ name: 'evt' }), 'VMU_INVALID_ARGUMENT'),
      'emit() without a usable moment refuses by name and points at the explicit `at` escape')
    ok(b.emit({ name: 'evt', at: 42 }).ok === true, 'and an explicit `at` makes it work')
  }
}

console.log('')
console.log('=== VMU ASSISTANT REPORT: ' + passed + ' passed, ' + failed + ' failed ===')
if (failed) { console.error('FAILURES:\n' + failures.map((f) => '  - ' + f).join('\n')); process.exitCode = 1 }

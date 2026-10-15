// tests/vmu-doc-invariant2-falsify.test.mjs — FAMILY 11: DOCUMENTED PROMISES THAT NAME A SINGLE IMPLEMENTATION LINE.
// Run: node tests/vmu-doc-invariant2-falsify.test.mjs
//
// ROUND 8 invented the doc-invariant form (one promise in `docs/07`, one line in `kernel/resume.js`). ROUND 9 asks
// the question that decides whether the form is worth keeping: CAN IT BE APPLIED TO ORDINARY PROMISES — a tool table
// row in `docs/03`, and the `fired ⊆ enforced` discipline in `docs/02`/`docs/11` — WITHOUT BENDING EITHER SIDE?
//
// THE FORM, in three sentences (this is what a new family must satisfy):
//   ① THE PROMISE IS QUOTED, NOT SUMMARISED. The probe READS THE VOLUME at runtime, extracts the claim (a tool's
//      action list, a parameter list, a subset discipline) and reports the extraction as a CONTROL FIELD. If the
//      sentence is deleted or softened, the control field disappears and the library refuses the family with
//      `CONTROL-FIELD-ABSENT` — a citation cannot rot silently (proved mechanically at the bottom of this file).
//   ② THE PROMISE HAS ONE LOAD-BEARING IMPLEMENTATION LINE. Every mutation below is a single `find`/`replace` on
//      the module the volume is talking about; nothing else is touched.
//   ③ THE GREEN READING SHOWS THE PROMISE HOLDING, and the mutant reading shows exactly which clause broke (a
//      missing action, a missing parameter, a key that is `fired` but not `enforced`).
//
// CASE 1 — `docs/03-interface-contract.md` §3 table row for `vibe_vmu_wait` (line 1412): the volume promises TWO
//   actions (`status｜wait`) and names the canonical parameters (`action`/`timeoutMs`/`why`/`me`). The probe
//   builds the REAL tool spec (`tools/activity.js`) and requires every DOCUMENTED action to be reachable (a call
//   the row tells a reader to make must not answer "unknown action") and every DOCUMENTED parameter to be declared.
// CASE 2 — the D3 receipt discipline `fired[] ⊆ enforced[]` (`docs/02-architecture.md` storepolicy row, stated
//   again in `docs/11-gates-and-development.md:466`): a key reported as having CHANGED the outcome must also be
//   reported as having been EVALUATED. The probe reads the discipline out of both volumes and requires every real
//   receipt it can build to satisfy it — including the WRITE receipt whose `tmpDir` branch really fires a key, which
//   is the branch where this file MEASURED a live violation in round 9 (see the CLOSED FINDING section at the end:
//   the defect is repaired, the pin became a guard, and a mutation restores the broken shape on purpose).
import { falsifyFamily, falsify, formatFamilyReport } from './_lib/falsify.mjs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, join } from 'node:path'
import { readFileSync } from 'node:fs'
// The REAL kernel is the assembly the host publishes faces from; the module UNDER TEST for case 3 is `host.js`.
import { createKernel } from '../vibe-math-vmu/kernel/index.js'

const HERE = dirname(fileURLToPath(import.meta.url))
const VMU = join(HERE, '..', 'vibe-math-vmu')
const TOOL_ACTIVITY = join(VMU, 'tools', 'activity.js')
const STOREPOLICY = join(VMU, 'kernel', 'storepolicy.js')
const HOST = join(VMU, 'host.js')
const DOC03 = join(VMU, 'docs', '03-interface-contract.md')
const DOC02 = join(VMU, 'docs', '02-architecture.md')
const DOC11 = join(VMU, 'docs', '11-gates-and-development.md')
const DOC08 = join(VMU, 'docs', '08-primitives-meeting-ballot-workflow.md')

let passed = 0
let failed = 0
const failures = []
const ok = (cond, label, detail) => {
  if (cond) { passed++; console.log('  ok   ' + label); return true }
  failed++; failures.push(label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  console.error('  FAIL ' + label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  return false
}

// ---------------------------------------------------------------------------------------------------------------
// CASE 1: the docs/03 tool-table row, parsed (not summarised).
// ---------------------------------------------------------------------------------------------------------------
const DOC03_TEXT = readFileSync(DOC03, 'utf8')
/** The row the volume prints for `vibe_vmu_wait`: `| tool | … （N 动作）：\`a｜b\` | \`p\`… | 出现条件 | 码 |`. */
function parseWaitRow(text) {
  const line = text.split('\n').find((l) => l.includes('vibe_vmu_wait')) || ''
  const cells = line.split('|').map((c) => c.trim())
  const actionCell = cells[2] || ''
  const paramCell = cells[3] || ''
  const m = /：`([^`]+)`/.exec(actionCell)
  return {
    found: line.length > 0 && !!m,
    tool: (/(vibe_vmu_[a-z_]+)/.exec(cells[1] || '') || [])[1] || '',
    actions: m ? m[1].split('｜').map((s) => s.trim()).filter(Boolean) : [],
    params: [...paramCell.matchAll(/`([A-Za-z][A-Za-z0-9]*)`/g)].map((x) => x[1]),
    // the 4th cell: the row's OCCURRENCE CONDITION (`` `activityTool` 为真（`vmu.activity.*`） ``) - case 3 reads it
    gate: cells[4] || '',
    gateName: (/`([a-zA-Z][A-Za-z0-9]*)`/.exec(cells[4] || '') || [])[1] || '',
    gateFamily: (/`(vmu\.[a-z0-9.]+)\*`/.exec(cells[4] || '') || [])[1] || '',
  }
}
const ROW = parseWaitRow(DOC03_TEXT)

async function toolTableProbe(mod) {
  const stub = {
    status: () => ({ ok: true, waiters: 0, wake: { declared: [], wired: false }, invariants: { futureOnly: true } }),
    wait: async () => ({ ok: true, action: 'wait', timedOut: true, enforced: [] }),
  }
  const spec = mod.makeActivitySpec({
    param: (type, description, extra) => Object.assign({ type, description }, extra || {}),
    refused: (code, message, hint) => ({ ok: false, code, message, hint }),
    TOOL_NAMES: { activity: 'vibe_vmu_wait' },
    kernel: { activity: stub },
  })
  const enums = (spec.parameters.action && spec.parameters.action.enum) || []
  const declared = Object.keys(spec.parameters)
  // Every DOCUMENTED action must be reachable: the volume tells a reader these are the two things they may ask for.
  const reachable = {}
  for (const a of ROW.actions) {
    const r = await spec.run({ action: a })
    reachable[a] = !(r && r.ok === false && r.code === 'VMU_INVALID_ARGUMENT')
  }
  const unknown = await spec.run({ action: 'definitely-not-a-documented-action' })
  const missingParams = ROW.params.filter((p) => declared.indexOf(p) === -1)
  const setEq = (a, b) => a.length > 0 && a.length === b.length && a.every((x) => b.indexOf(x) !== -1)
  return {
    citationPresent: ROW.found && ROW.actions.length === 2 && ROW.params.length === 4,
    toolNameMatchesDoc: ROW.tool === 'vibe_vmu_wait' && spec.name === ROW.tool,
    docActions: ROW.actions.join(','),
    declaredEnumMatchesDoc: setEq(enums, ROW.actions),
    allDocActionsReachable: ROW.actions.length > 0 && ROW.actions.every((a) => reachable[a] === true),
    docParamsDeclared: ROW.params.length > 0 && missingParams.length === 0,
    missingDocParams: missingParams.join(','),
    unknownActionRefusedNamed: unknown.ok === false && unknown.code === 'VMU_INVALID_ARGUMENT',
  }
}

// ---------------------------------------------------------------------------------------------------------------
// CASE 2: the `fired ⊆ enforced` discipline, quoted from two volumes.
// ---------------------------------------------------------------------------------------------------------------
const DOC02_TEXT = readFileSync(DOC02, 'utf8')
const DOC11_TEXT = readFileSync(DOC11, 'utf8')
const STORE_ROW = DOC02_TEXT.split('\n').find((l) => l.includes('`storepolicy.js`')) || ''
const DISCIPLINE_CITED = /fired ⊆ enforced/.test(STORE_ROW) && /fired ⊆ enforced/.test(DOC11_TEXT)

function receiptDisciplineProbe(mod) {
  const sp = mod.createStorePolicy({ clock: () => 0, log: () => {}, settings: {} })
  const cap = sp.capabilities()
  const fired = Array.isArray(cap.fired) ? cap.fired : []
  const enforced = Array.isArray(cap.enforced) ? cap.enforced : []
  const rogue = fired.filter((k) => enforced.indexOf(k) === -1)
  // The WRITE receipt is the one that carries the `tmpDir` branch — the real `fired ⊄ enforced` found in round 9 and
  // repaired by task-66. The reading is deliberately TWO-SIDED: the key must really FIRE (with no `tmpDir` declared
  // the check is vacuous, which is exactly how the older guard in `tests/vmu-storepolicy.test.mjs` missed it) AND it
  // must be disclosed in `enforced[]`.
  const spw = mod.createStorePolicy({ clock: () => 0, log: () => {}, settings: {
    'vmu.store.backend': 'file', 'vmu.store.root': 'D:\\vault', 'vmu.store.tmpDir': 'D:\\vault\\tmp' } })
  const w = spw.write({ id: 'w' })
  const wFired = Array.isArray(w.fired) ? w.fired : []
  const wEnforced = Array.isArray(w.enforced) ? w.enforced : []
  const wRogue = wFired.filter((k) => wEnforced.indexOf(k) === -1)
  return {
    citationPresent: DISCIPLINE_CITED,
    firedCount: fired.length,
    subsetOk: fired.length > 0 && rogue.length === 0,
    rogue: rogue.join(','),
    writeFiresTmpDir: wFired.indexOf('vmu.store.tmpDir') !== -1 && wEnforced.indexOf('vmu.store.tmpDir') !== -1,
    writeSubsetOk: wFired.length > 0 && wRogue.length === 0,
    writeRogue: wRogue.join(','),
  }
}

/**
 * CASE 3 (round 11, ruled by vmu-verify): the row's SECOND HALF — the OCCURRENCE CONDITION. `docs/03:1412` prints
 * `` `activityTool` 为真（`vmu.activity.*`） `` for `vibe_vmu_wait`, i.e. the face is published when a `vmu.activity.*`
 * key is declared. The judgement is the PUBLICATION side (`toolSpecs`), NOT the declaration-side table
 * (`TOOL_FACES`/`resolveFaces`): "declared" and "published" are different facts, and the gap between them is exactly
 * what a silently non-mounting face hides in (the round-10 `ballots` lesson). D-01 is excluded from the NEGATIVE case
 * on purpose — a bus entry is also a declaration — so that scenario declares an unrelated prefix and requires the bus
 * to be free of any entry. The disclosure report (`disabled`/`unknownDisabled`) is read as well, because "not
 * published" and "silently vanished" are indistinguishable without it.
 */
async function occurrenceConditionProbe(mod) {
  const build = (settings) => {
    const k = createKernel({ clock: () => 0, settings })
    return { k, specs: mod.toolSpecs({ kernel: k, settings }) }
  }
  const names = (list) => (Array.isArray(list) ? list.map((s) => (s && s.name) || String(s)) : [])
  const has = (list, name) => names(list).indexOf(name) !== -1
  const dec = build({ 'vmu.activity.timeoutMs': 10000 })
  const unr = build({ 'vmu.chat.quota': 5 })
  const off = build({ 'vmu.activity.timeoutMs': 10000, 'vmu.core.facesDisabled': ['activity'] })
  const busStatus = unr.k.bus && typeof unr.k.bus.status === 'function' ? unr.k.bus.status() : null
  const offFaces = mod.resolveFaces({ settings: { 'vmu.activity.timeoutMs': 10000, 'vmu.core.facesDisabled': ['activity'] } })
  const typoFaces = mod.resolveFaces({ settings: { 'vmu.core.facesDisabled': ['no-such-face'] } })
  return {
    // the citation itself: the row still names the gate AND the family prefix it claims
    citationPresent: /activityTool/.test(ROW.gate) && ROW.gateName === 'activityTool' && ROW.gateFamily === 'vmu.activity.',
    busFree: !!busStatus && Array.isArray(busStatus.entries) && busStatus.entries.length === 0,
    declaredPublishes: has(dec.specs, 'vibe_vmu_wait'),
    unrelatedDoesNotPublish: !has(unr.specs, 'vibe_vmu_wait') && names(unr.specs).length > 0,
    disabledDoesNotPublish: !has(off.specs, 'vibe_vmu_wait'),
    disabledIsNamed: Array.isArray(offFaces.disabled) && offFaces.disabled.some((d) => d.face === 'activity' && d.code === 'VMU_NOT_PERMITTED'),
    unknownDisableIsNamed: Array.isArray(typoFaces.unknownDisabled) && typoFaces.unknownDisabled.indexOf('no-such-face') !== -1,
  }
}

const family = await falsifyFamily({
  name: 'documented promises — the docs/03 tool-table row, and `fired ⊆ enforced`',
  cases: [{
    name: 'docs/03 §3 `vibe_vmu_wait` row ↔ tools/activity.js',
    module: TOOL_ACTIVITY,
    probe: toolTableProbe,
    controlFields: ['citationPresent', 'toolNameMatchesDoc', 'declaredEnumMatchesDoc', 'allDocActionsReachable',
      'docParamsDeclared', 'unknownActionRefusedNamed'],
    mutations: [
      { label: 'the documented `status` action is unreachable', name: 'doc03-status-unreachable',
        find: "        if (action === 'status') return Object.assign({ ok: true, action }, activity.status())",
        replace: "        if (false) return Object.assign({ ok: true, action }, activity.status())   // MUTANT: the documented action is gone" },
      { label: 'the documented `timeoutMs` parameter is no longer declared', name: 'doc03-param-renamed',
        find: "      timeoutMs: param('number',", replace: "      timeoutMsRenamed: param('number'," },
      { label: 'the action enum no longer offers what the row lists', name: 'doc03-enum-narrowed',
        find: "{ enum: ['wait', 'status'] }", replace: "{ enum: ['wait'] /* MUTANT: the row says two actions */ }" },
    ],
  }, {
    name: 'docs/02 + docs/11 `fired ⊆ enforced` ↔ kernel/storepolicy.js',
    module: STOREPOLICY,
    probe: receiptDisciplineProbe,
    controlFields: ['citationPresent', 'firedCount', 'subsetOk', 'writeFiresTmpDir', 'writeSubsetOk'],
    mutations: [
      { label: 'a key is reported as fired without ever being evaluated', name: 'discipline-rogue-fired',
        find: "if (c.fsync) fired.push('vmu.store.fsync')",
        replace: "if (c.fsync) fired.push('vmu.store.lock')   // MUTANT: fired, but not in enforced[]" },
      // The REGRESSION GUARD for the round-9 finding: put the write enforcement list back the way it was and the
      // `tmpDir` branch fires a key its own receipt never evaluated. This is the same defect the gate owner repaired
      // (task-66) — now it can never come back unnoticed.
      { label: 'the write receipt fires a key its enforcement list forgot', name: 'discipline-write-regression',
        find: "const enforcement = ['vmu.store.backend', 'vmu.store.root', 'vmu.store.tmpDir', 'vmu.store.fsync', 'vmu.store.autoBackup',",
        replace: "const enforcement = ['vmu.store.backend', 'vmu.store.root', 'vmu.store.fsync', 'vmu.store.autoBackup',   // MUTANT: the F1 regression, restored" },
    ],
  }, {
    name: 'docs/03:1412 occurrence condition (`activityTool` ⇔ `vmu.activity.*`) ↔ host.js',
    module: HOST,
    probe: occurrenceConditionProbe,
    controlFields: ['citationPresent', 'busFree', 'declaredPublishes', 'unrelatedDoesNotPublish', 'disabledIsNamed', 'unknownDisableIsNamed'],
    mutations: [
      { label: 'the documented declaration no longer publishes the face', name: 'occurrence-family-renamed',
        find: "families: ['vmu.activity.']", replace: "families: ['vmu.activityX.']" },
      { label: 'the face is published with NO declaration at all (zero-mechanism broken)', name: 'occurrence-always',
        find: "families: ['vmu.activity.']", replace: "families: ['vmu.activity.'], always: true" },
      { label: 'a face disabled BY NAME is published anyway (the disclosure lies)', name: 'occurrence-disable-ignored',
        find: 'if (disabledKeys.has(row.face)) {', replace: 'if (false) {' },
    ],
  }],
})

console.log('=== CONTROL GROUP: the two promises are quoted, and both hold on the real modules ===')
ok(ROW.found === true && ROW.actions.join(',') === 'status,wait' && ROW.params.length === 4,
  '★ the docs/03 row still names two actions (`status｜wait`) and four parameters — the promise is READ, not assumed', ROW)
ok(DISCIPLINE_CITED === true,
  '★ and `fired ⊆ enforced` is still written down in docs/02 (storepolicy row) and docs/11 — the citation is machine-read', STORE_ROW.slice(0, 0) || 'cited')
const t = family.cases[0].real
ok(t.toolNameMatchesDoc === true && t.declaredEnumMatchesDoc === true && t.unknownActionRefusedNamed === true,
  '★ every action the row lists is in the enum, and an action the row does NOT list is refused BY NAME', t)
ok(t.allDocActionsReachable === true && t.docParamsDeclared === true,
  '★ and each documented action is really reachable and each documented parameter is really declared', t)
const r = family.cases[1].real
ok(r.subsetOk === true && r.firedCount === 1 && r.rogue === '',
  '★ the real `capabilities()` receipt satisfies the discipline (a fired key was necessarily evaluated)', r)
ok(r.writeFiresTmpDir === true && r.writeSubsetOk === true && r.writeRogue === '',
  '★ and the WRITE receipt — the `tmpDir` branch the older guard never reached — really fires the key AND discloses it (the round-9 finding, now a live guard)', r)
const o = family.cases[2].real
ok(ROW.gate !== '' && o.citationPresent === true,
  '★ the row\'s 4th cell still states the occurrence condition (`activityTool` ⇔ `vmu.activity.*`) — read from the volume, not assumed', { gate: ROW.gate, gateName: ROW.gateName, gateFamily: ROW.gateFamily })
ok(o.busFree === true && o.declaredPublishes === true && o.unrelatedDoesNotPublish === true,
  '★ declaring the documented prefix PUBLISHES `vibe_vmu_wait`; declaring an unrelated prefix (with the bus free of entries, so D-01 cannot mask it) does NOT', o)
ok(o.disabledIsNamed === true && o.unknownDisableIsNamed === true && o.disabledDoesNotPublish === true,
  'and the disclosure does not lie: a face disabled BY NAME is reported as `disabled` with `VMU_NOT_PERMITTED` and is NOT published, and a typo lands in `unknownDisabled`', o)

console.log('=== FALSIFICATION: cut a row clause, break the subset discipline, or break the occurrence condition ===')
ok(family.ok, '★ all eight documented-promise mutations are caught (control green + each mutant red)', formatFamilyReport(family))
const byLabel = (needle) => family.results.find((x) => x.label.includes(needle))
const statusRed = byLabel('documented `status` action is unreachable') && byLabel('documented `status` action is unreachable').red
const paramRed = byLabel('`timeoutMs` parameter is no longer declared') && byLabel('`timeoutMs` parameter is no longer declared').red
const enumRed = byLabel('action enum no longer offers') && byLabel('action enum no longer offers').red
const firedRed = byLabel('fired without ever being evaluated') && byLabel('fired without ever being evaluated').red
ok(!!statusRed && statusRed.allDocActionsReachable === false && statusRed.declaredEnumMatchesDoc === true,
  '★ "status unreachable": the row still lists the action and the enum still declares it — only the HANDLER stopped answering it', statusRed)
ok(!!paramRed && paramRed.docParamsDeclared === false && paramRed.missingDocParams === 'timeoutMs',
  '★ "parameter renamed": a reader following the volume now passes an argument the tool does not declare', paramRed)
ok(!!enumRed && enumRed.declaredEnumMatchesDoc === false,
  '★ "enum narrowed": the declared action list stops matching the row, so the table is no longer the interface', enumRed)
ok(!!firedRed && firedRed.subsetOk === false && firedRed.rogue === 'vmu.store.lock',
  '★ "rogue fired key": the receipt claims `vmu.store.lock` changed the outcome while its `enforced[]` never evaluated it', firedRed)
const writeRegRed = byLabel('write receipt fires a key') && byLabel('write receipt fires a key').red
ok(!!writeRegRed && writeRegRed.writeSubsetOk === false && writeRegRed.writeRogue === 'vmu.store.tmpDir' && writeRegRed.subsetOk === true,
  '★ "the F1 regression restored": only the WRITE receipt breaks — the `capabilities()` receipt is untouched, so the guard is narrow and aimed at that branch', writeRegRed)
const famRed = byLabel('documented declaration no longer publishes') && byLabel('documented declaration no longer publishes').red
const alwaysRed = byLabel('published with NO declaration') && byLabel('published with NO declaration').red
const disableRed = byLabel('disabled BY NAME is published anyway') && byLabel('disabled BY NAME is published anyway').red
ok(!!famRed && famRed.declaredPublishes === false && famRed.unrelatedDoesNotPublish === true,
  '★ "prefix renamed": the declaration the volume prints stops publishing the face — while the unrelated prefix still publishes nothing (the mutation is narrow)', famRed)
ok(!!alwaysRed && alwaysRed.unrelatedDoesNotPublish === false && alwaysRed.declaredPublishes === true && alwaysRed.disabledDoesNotPublish === true,
  '★ "published always": a deployment that declared only `vmu.chat.quota` now gets `vibe_vmu_wait` — the zero-mechanism default is gone (the named-disable branch still wins, so the mutation is aimed)', alwaysRed)
ok(!!disableRed && disableRed.disabledDoesNotPublish === false && disableRed.disabledIsNamed === false,
  '★ "disable ignored": `vmu.core.facesDisabled: [\'activity\']` no longer stops the face AND no longer reports it as disabled — the disclosure lies in the same breath', disableRed)

console.log('=== CLOSED FINDING (the pin became a guard) ===')
// HISTORY, because a pin that silently disappears is worse than one that never existed: while building case 2 this
// file MEASURED the write receipt naming `vmu.store.tmpDir` in `fired[]` while its `enforced[]` omitted it (a real
// `fired ⊄ enforced`, reported as F1 in `docs/acceptance/activity-round9-report.md`). It was pinned here, the gate owner
// reproduced it and task-66 repaired `kernel/storepolicy.js` (the key joined the write enforcement list), and the pin
// was flipped to assert the PROMISE instead of the gap — plus the mutation above, so the repaired shape is what is
// now protected. The two-sided reading is what makes the flip honest: had the fix simply stopped firing the key, the
// `writeFiresTmpDir` control field would have gone false.
const { createStorePolicy: realStorePolicy } = await import(pathToFileURL(STOREPOLICY).href)
const fixedReceipt = realStorePolicy({ clock: () => 0, log: () => {}, settings: {
  'vmu.store.backend': 'file', 'vmu.store.root': 'D:\\vault', 'vmu.store.tmpDir': 'D:\\vault\\tmp' } }).write({ id: 'closed' })
const fixedRogue = fixedReceipt.fired.filter((k) => fixedReceipt.enforced.indexOf(k) === -1)
ok(fixedRogue.length === 0 && fixedReceipt.fired.indexOf('vmu.store.tmpDir') !== -1 && fixedReceipt.enforced.indexOf('vmu.store.tmpDir') !== -1,
  'F1 CLOSED (task-66): the write receipt with `vmu.store.tmpDir` declared fires the key, discloses it in `enforced[]`, and leaves ZERO rogue keys',
  { fired: fixedReceipt.fired, enforced: fixedReceipt.enforced, rogue: fixedRogue })

console.log('=== SELF-PROOF: a rotted citation cannot pass silently ===')
const DOC08_TEXT = readFileSync(DOC08, 'utf8')
const RULE = /返回 `undefined`\*\*（不产生任何 decision）/
ok(RULE.test(DOC08_TEXT) === true, 'control: the live volume really states the wake-listener rule', RULE.source)
const rotReport = await falsify({
  name: 'citation-rot',
  module: TOOL_ACTIVITY,
  // The same regexes, applied to a copy of the volume with the sentence deleted: this is exactly what a softened
  // citation does, and the library must refuse the reading outright rather than report "no bad path happened".
  probe: () => ({
    docRuleWakeSilent: RULE.test(DOC08_TEXT.replace(RULE, '')),
    docRulePeerSeamNamed: /VMU_ACTIVITY_PEER_SEAM_FAILED/.test(DOC08_TEXT),
    positive: true,
  }),
  controlFields: ['docRuleWakeSilent', 'docRulePeerSeamNamed'],
  mutations: [{ label: 'identity mutation (the module is not what is under test here)', name: 'rot-identity',
    find: 'export function makeActivitySpec', replace: 'export function makeActivitySpec' }],
})
ok(rotReport.ok === false && rotReport.problems.some((p) => p.startsWith('CONTROL-FIELD-ABSENT')),
  '★ doc-rot proof: delete the sentence from a COPY and the same guard reports CONTROL-FIELD-ABSENT (the citation field is load-bearing)',
  rotReport.problems)
ok(rotReport.real.docRuleWakeSilent === false && rotReport.real.docRulePeerSeamNamed === true,
  'and it is the ROTTED rule that vanished, not the reading (the other citation still matches)', rotReport.real)

console.log('')
console.log('=== VMU DOC-INVARIANT2 FALSIFY: ' + passed + ' passed, ' + failed + ' failed ===')
if (failed) { console.error('FAILURES:\n' + failures.map((f) => '  - ' + f).join('\n')) }
process.exitCode = failed === 0 ? 0 : 1

// tests/audit-enforced-consistency.test.mjs — the C2 gate: one noun, one meaning.
//
// WHY (independent reviewer, round 12): three modules gave `enforced` three different meanings - `meetings` was
// "evaluated for THIS call", `records` added `fired`, and `ballotbox.open()` carried a HARD-CODED list - so the
// hardest discipline in this project ("the key was READ" vs "the key DID something") silently stopped being
// checkable there. This gate measures the noun instead of trusting the prose, with five rules:
//
//   ① NO DUPLICATES      - within one receipt, a key appears at most once;
//   ② DETERMINISM        - the same scenario twice yields element-wise identical lists (injected clock);
//   ③ BEHAVIOUR LISTED   - for every scenario whose trigger/non-trigger pair CHANGES behaviour, `enforced` must
//                          differ; two identical lists mean a STATIC list (the ballotbox defect class);
//   ④ UNEVALUATED ABSENT - a key the code path never consults must not appear (reverse direction);
//   ⑤ ARRAY, NEVER null  - every `enforced` found is an array, and a REFUSAL carries one too (mathtools sets
//                          `e.enforced = keys`; a refusal with `enforced === undefined` fails this rule).
//
// Plus: every kernel module that mentions `enforced` IN CODE must be covered here (a new module is a new blind
// spot until it is), and FOUR deliberately-wrong self-proofs show each checker can actually fail.
//
// The gate is allowed to be RED: it reports what the TREE does, and it names the module, the call and the key.
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { stripComments } from './_lib/strip-comments.mjs'
import { createBallotBox } from '../vibe-math-vmu/kernel/ballotbox.js'
import { createMeetings } from '../vibe-math-vmu/kernel/meetings.js'
import { createRecords } from '../vibe-math-vmu/kernel/records.js'
import { createMathTools } from '../vibe-math-vmu/kernel/mathtools.js'
import { createCourse } from '../vibe-math-vmu/kernel/course.js'
import { createExternal } from '../vibe-math-vmu/kernel/external.js'
import { createWorkflow } from '../vibe-math-vmu/kernel/workflow.js'
import { createConference } from '../vibe-math-vmu/kernel/conference.js'
import { createInstruments } from '../vibe-math-vmu/kernel/instruments.js'
import { createIp } from '../vibe-math-vmu/kernel/ip.js'
import { createCompliance } from '../vibe-math-vmu/kernel/compliance.js'
import { createFunding } from '../vibe-math-vmu/kernel/funding.js'
import { createStorePolicy } from '../vibe-math-vmu/kernel/storepolicy.js'
import { createCapacity } from '../vibe-math-vmu/kernel/capacity.js'
import { createHr } from '../vibe-math-vmu/kernel/hr.js'
import { createMigration } from '../vibe-math-vmu/kernel/migration.js'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = resolve(HERE, '..')
const KERNEL = join(REPO, 'vibe-math-vmu', 'kernel')
const CLOCK = () => 1000000
// hr drives its rails from ISO timestamps (a numeric clock makes its own comparisons throw VMU_INVALID_ARGUMENT).
const ISO_CLOCK = () => '2026-07-01T00:00:00.000Z'
const KEY = 'enforced'
const GOOD_SEAM = async () => ({ ok: true, status: 200, headers: {}, bytes: 64, body: { results: [{ id: 'x', title: 'T', doi: '10.1/x', concepts: [{ id: 'c1' }, { id: 'c2' }, { id: 'c3' }], mesh: ['m1'], related: ['r1'], abstract: 'a'.repeat(50), authors: [{ name: 'A' }] }] } })

let passed = 0, failed = 0
const findings = []
const ok = (cond, name, detail) => { if (cond) passed++; else { failed++; console.log('  FAIL ' + name + (detail === undefined ? '' : ' :: ' + detail)) } }
const finding = (kind, name, detail) => { findings.push({ kind, name, detail }); console.log('  FINDING ' + kind + ' :: ' + name + (detail ? ' :: ' + detail : '')) }

// ---------------------------------------------------------------------------------------------------------
// collection: every `enforced` value reachable in a result or a thrown refusal
// ---------------------------------------------------------------------------------------------------------
/**
 * Collect every `enforced` field reachable from a value (depth-limited, cycle-safe).
 * Returns { arrays, nonArrays, count } where nonArrays names fields that are present but not arrays.
 */
export function collectEnforced(root, maxDepth = 5) {
  const arrays = []
  const nonArrays = []
  const seen = new Set()
  const walk = (o, path, d) => {
    if (!o || typeof o !== 'object' || d > maxDepth || seen.has(o)) return
    seen.add(o)
    for (const [k, v] of Object.entries(o)) {
      if (k === KEY) {
        if (Array.isArray(v)) arrays.push({ path: path + '.' + k, value: v })
        else nonArrays.push({ path: path + '.' + k, value: v === null ? null : typeof v })
      } else if (v && typeof v === 'object') walk(v, path + '.' + k, d + 1)
    }
  }
  walk(root, '$', 0)
  return { arrays, nonArrays, count: arrays.length + nonArrays.length }
}

/**
 * Outcome form of rule ③, for keys the module ALWAYS evaluates (the list cannot differ by construction):
 * the two runs must reach DIFFERENT outcomes, and the key must be reported by the call. Asserting the outcome
 * as well makes this strictly stronger than "the lists differ" for that class.
 */
export function checkOutcomeListed(limiting, permissive, key) {
  const bad = []
  if (limiting.outcome === permissive.outcome) {
    bad.push('OUTCOME-UNCHANGED: ' + limiting.label + ' :: both runs ended "' + limiting.outcome + '" - the pair does not exercise the key (scenario error)')
  }
  const reported = [limiting, permissive].some((r) => r.arrays.some((x) => x.value.includes(key)))
  if (!reported) bad.push('KEY-NOT-ENFORCED-BY-THIS-OPERATION: ' + limiting.label + ' :: ' + key + ' is never reported by this call (scenario attribution error)')
  return bad
}

/** The five checkers, pure, so the self-proof can mutate their inputs. */
export function checkDuplicates(run) {
  const bad = []
  for (const a of run.arrays) {
    const dup = a.value.filter((k, i) => a.value.indexOf(k) !== i)
    if (dup.length) bad.push('DUPLICATE-ENFORCED: ' + run.label + ' :: ' + [...new Set(dup)].join(','))
  }
  return bad
}
export function checkArrayShape(run) {
  const bad = []
  for (const n of run.nonArrays) bad.push('NON-ARRAY-ENFORCED: ' + run.label + ' :: ' + n.path + ' = ' + JSON.stringify(n.value))
  if (run.threw && !run.refusalEnforcedIsArray) bad.push('REFUSAL-WITHOUT-ENFORCED: ' + run.label + ' :: thrown ' + run.code + ' with enforced === undefined')
  if (!run.threw && run.count === 0) bad.push((run.refused ? 'REFUSAL-NO-ENFORCED: ' : 'NO-ENFORCED-REPORTED: ') + run.label + ' :: the call reported no enforced[] at all')
  return bad
}
export function checkDeterministic(a, b) {
  // compare the COLLECTED LISTS only (the labels differ by construction: they name the two runs)
  return JSON.stringify(a.arrays) === JSON.stringify(b.arrays) ? [] : ['NONDETERMINISTIC: ' + a.label + ' :: ' + JSON.stringify(a.arrays) + ' vs ' + JSON.stringify(b.arrays)]
}
export function checkBehaviourListed(limiting, permissive, key) {
  const a = JSON.stringify(limiting.arrays)
  const b = JSON.stringify(permissive.arrays)
  const bad = []
  if (a === b) bad.push('STATIC-LIST: ' + limiting.label + ' :: behaviour changed but enforced[] is identical (' + key + ')')
  // ATTRIBUTION (round 13): if NEITHER run reports the key, the scenario claims a key this call never evaluates -
  // that is a TABLE error (misattributed key), not a module defect, and it must be named as such.
  const reported = [limiting, permissive].some((r) => r.arrays.some((x) => x.value.includes(key)))
  if (!reported) bad.push('KEY-NOT-ENFORCED-BY-THIS-OPERATION: ' + limiting.label + ' :: ' + key + ' is never reported by this call (scenario attribution error)')
  return bad
}
export function checkUnevaluatedAbsent(run, key) {
  const hit = run.arrays.find((a) => a.value.includes(key))
  return hit ? ['UNEVALUATED-KEY-LISTED: ' + run.label + ' :: ' + key + ' appears although the path never consults it'] : []
}

// ---------------------------------------------------------------------------------------------------------
// scenario table - every `expectDiff: true` pair was MEASURED to change behaviour before being written here
// ---------------------------------------------------------------------------------------------------------
const put = (rc, extra = {}) => rc.put(Object.assign({ track: 'progress', kind: 'progress', title: 't', body: 'b', settled: true }, extra))

const SCENARIOS = [
  { module: 'ballotbox', call: 'open', key: 'vmu.ballot.secrecy', expectDiff: true,
    limiting: { settings: { 'vmu.ballot.secrecy': false } }, permissive: { settings: { 'vmu.ballot.secrecy': true } },
    make: (settings, variant) => createBallotBox({ clock: CLOCK, log: () => {}, settings }),
    run: (bb) => bb.open({ question: 'q', options: ['a', 'b'] }) },
  { module: 'ballotbox', call: 'cast(vote)', key: 'vmu.ballot.abstainAllowed', expectDiff: true, absentIn: 'permissive',
    // ROUND-13 CORRECTION (Lead ruling): `vmu.ballot.abstainAllowed` belongs to CAST, not to OPEN. Measured:
    //   open(secrecy)                       -> ['vmu.ballot.method'] regardless of abstainAllowed
    //   cast({choice:'abstain'}), allowed=false -> ['vmu.ballot.abstainAllowed']   (it caused THIS refusal)
    //   cast({choice:'a'}),       allowed=false -> []                              (never consulted)
    // The key is reported exactly when it changed THIS call's outcome - which is the rule, not a static list.
    limiting: { settings: { 'vmu.ballot.abstainAllowed': false }, input: { choice: 'abstain' } },
    permissive: { settings: { 'vmu.ballot.abstainAllowed': false }, input: { choice: 'a' } },
    make: (settings) => createBallotBox({ clock: CLOCK, log: () => {}, settings }),
    run: (bb, variant) => { const o = bb.open({ question: 'q', options: ['a', 'b'] }); return bb.cast({ boxId: o.boxId, by: 'm1', choice: variant.input.choice }) } },
  { module: 'ballotbox', call: 'cast(abstain)', key: 'vmu.ballot.abstainAllowed', expectDiff: true,
    limiting: { settings: { 'vmu.ballot.abstainAllowed': false } }, permissive: { settings: { 'vmu.ballot.abstainAllowed': true } },
    make: (settings) => createBallotBox({ clock: CLOCK, log: () => {}, settings }),
    run: (bb) => { const o = bb.open({ question: 'q', options: ['a', 'b'] }); return bb.cast({ boxId: o.boxId, by: 'm1', choice: 'abstain' }) } },
  { module: 'ballotbox', call: 'close', key: 'vmu.ballot.auditReadOnly', expectDiff: true,
    limiting: { settings: { 'vmu.ballot.auditReadOnly': true } }, permissive: { settings: { 'vmu.ballot.auditReadOnly': false } },
    make: (settings) => createBallotBox({ clock: CLOCK, log: () => {}, settings }),
    run: (bb) => { const o = bb.open({ question: 'q', options: ['a', 'b'] }); bb.cast({ boxId: o.boxId, by: 'm1', choice: 'a' }); return bb.close({ boxId: o.boxId }) } },

  { module: 'meetings', call: 'attend(late)', key: 'vmu.meetings.lateAfterMs', expectDiff: true,
    limiting: { settings: { 'vmu.meetings.lateAfterMs': 0 } }, permissive: { settings: { 'vmu.meetings.lateAfterMs': 1000 } },
    make: (settings) => createMeetings({ clock: CLOCK, log: () => {}, settings }),
    run: (mg) => { const o = mg.open({ type: 'ordinary', roster: ['a', 'b'], at: 0 }); return mg.attend({ meeting: o.meeting, member: 'a', at: 5000 }) } },
  { module: 'meetings', call: 'open', key: 'vmu.meetings.typeCatalog', expectDiff: true,
    limiting: { settings: { 'vmu.meetings.typeCatalog': [] } }, permissive: { settings: { 'vmu.meetings.typeCatalog': ['ordinary'] } },
    make: (settings) => createMeetings({ clock: CLOCK, log: () => {}, settings }),
    run: (mg) => mg.open({ type: 'ordinary', roster: ['a'] }) },
  { module: 'meetings', call: 'close', key: 'vmu.meetings.minutesRetentionMs', expectDiff: true,
    limiting: { settings: { 'vmu.meetings.minutesRetentionMs': 0 } }, permissive: { settings: { 'vmu.meetings.minutesRetentionMs': 1000 } },
    make: (settings) => createMeetings({ clock: CLOCK, log: () => {}, settings }),
    run: (mg) => { const o = mg.open({ type: 'ordinary', roster: ['a'] }); return mg.close({ meeting: o.meeting }) } },
  { module: 'meetings', call: 'open', key: 'vmu.meetings.lateAfterMs', expectDiff: false, absentIn: 'both',
    limiting: { settings: { 'vmu.meetings.lateAfterMs': 1000 } }, permissive: { settings: { 'vmu.meetings.lateAfterMs': 1000 } },
    make: (settings) => createMeetings({ clock: CLOCK, log: () => {}, settings }),
    run: (mg) => mg.open({ type: 'ordinary', roster: ['a'] }) },

  { module: 'records', call: 'put', key: 'vmu.records.retention.tierThreshold', expectDiff: true,
    limiting: { settings: { 'vmu.records.retention.tierThreshold': 0 } }, permissive: { settings: { 'vmu.records.retention.tierThreshold': 100 } },
    make: (settings) => createRecords({ clock: CLOCK, log: () => {}, settings }),
    run: (rc) => put(rc, { body: 'x'.repeat(300) }) },
  { module: 'records', call: 'get', key: 'vmu.records.bodyCapBytes', expectDiff: true,
    limiting: { settings: { 'vmu.records.bodyCapBytes': 10 }, input: { includeBody: true } },
    permissive: { settings: { 'vmu.records.bodyCapBytes': 10 }, input: { includeBody: false } },
    make: (settings) => createRecords({ clock: CLOCK, log: () => {}, settings }),
    run: (rc, variant) => { const p = put(rc, { body: 'y'.repeat(200) }); return rc.get({ id: p.id, includeBody: variant.input.includeBody }) } },
  { module: 'records', call: 'remove', key: 'vmu.records.trash.autoPurge', expectDiff: true,
    limiting: { settings: { 'vmu.records.trash.autoPurge': false } }, permissive: { settings: { 'vmu.records.trash.autoPurge': true } },
    make: (settings) => createRecords({ clock: CLOCK, log: () => {}, settings }),
    run: (rc) => { const p = put(rc, { title: 'r1' }); return rc.remove({ id: p.id, reason: 'probe', by: 'me' }) } },
  { module: 'records', call: 'get(no body)', key: 'vmu.records.bodyCapBytes', expectDiff: false, absentIn: 'both',
    limiting: { settings: { 'vmu.records.bodyCapBytes': 10 } }, permissive: { settings: { 'vmu.records.bodyCapBytes': 10 } },
    make: (settings) => createRecords({ clock: CLOCK, log: () => {}, settings }),
    run: (rc) => { const p = put(rc, { body: 'z'.repeat(200) }); return rc.get({ id: p.id, includeBody: false }) } },

  { module: 'mathtools', call: 'plan', key: 'vmu.math.cache.enabled', expectDiff: true,
    limiting: { settings: { 'vmu.math.cache.enabled': false } }, permissive: { settings: { 'vmu.math.cache.enabled': true } },
    make: (settings) => createMathTools({ clock: CLOCK, log: () => {}, settings }),
    run: (mt) => mt.plan({ op: 'optim/minimize', args: {} }) },
  { module: 'mathtools', call: 'plan', key: 'vmu.math.sandbox.network', expectDiff: true, absentIn: 'permissive',
    limiting: { settings: { 'vmu.math.sandbox.network': 'deny' }, input: { needsNetwork: false } },
    permissive: { settings: { 'vmu.math.sandbox.network': 'deny' }, input: { needsNetwork: undefined } },
    make: (settings) => createMathTools({ clock: CLOCK, log: () => {}, settings }),
    run: (mt, variant) => mt.plan({ op: 'optim/minimize', args: {}, needsNetwork: variant.input.needsNetwork }) },
  { module: 'mathtools', call: 'plan', key: 'vmu.math.units.enabled', expectDiff: true,
    limiting: { settings: { 'vmu.math.units.enabled': false } }, permissive: { settings: { 'vmu.math.units.enabled': true } },
    make: (settings) => createMathTools({ clock: CLOCK, log: () => {}, settings }),
    run: (mt) => mt.plan({ op: 'optim/minimize', args: {}, units: { x: 'm' } }) },
  { module: 'mathtools', call: 'plan(non-net)', key: 'vmu.math.sandbox.network', expectDiff: false, absentIn: 'both',
    limiting: { settings: { 'vmu.math.sandbox.network': 'deny' } }, permissive: { settings: { 'vmu.math.sandbox.network': 'deny' } },
    make: (settings) => createMathTools({ clock: CLOCK, log: () => {}, settings }),
    run: (mt) => mt.plan({ op: 'stats/mean', args: {} }) },

  // ---- ROUND-14 COVERAGE: course.js / external.js / workflow.js (the scan found these three uncovered) ----
  // course: `vmu.course.visibility` is consulted ONLY when visibility==='public' while allowAuditors is not true
  // (course.js:112) ⇒ internal vs public changes what this call evaluates.
  { module: 'course', call: 'open', key: 'vmu.course.visibility', expectDiff: true,
    limiting: { settings: { 'vmu.course.visibility': 'internal' } }, permissive: { settings: { 'vmu.course.visibility': 'public' } },
    make: (settings) => createCourse({ clock: CLOCK, log: () => {}, settings }),
    run: (c) => c.open({ courseId: 'c1', title: 'T' }) },
  // course: same key, the OTHER trigger (public + allowAuditors=true ⇒ the key is not consulted at all).
  { module: 'course', call: 'open(public+auditors)', key: 'vmu.course.visibility', expectDiff: true,
    limiting: { settings: { 'vmu.course.visibility': 'public', 'vmu.course.allowAuditors': false } },
    permissive: { settings: { 'vmu.course.visibility': 'public', 'vmu.course.allowAuditors': true } },
    make: (settings) => createCourse({ clock: CLOCK, log: () => {}, settings }),
    run: (c) => c.open({ courseId: 'c1', title: 'T' }) },
  // course: `evidencePack` pushes requireEvidence only when it is ON (course.js:256).
  { module: 'course', call: 'evidencePack', key: 'vmu.course.requireEvidence', expectDiff: true,
    limiting: { settings: { 'vmu.course.requireEvidence': false } }, permissive: { settings: { 'vmu.course.requireEvidence': true } },
    make: (settings) => createCourse({ clock: CLOCK, log: () => {}, settings }),
    run: (c) => c.evidencePack({ claims: [{ refs: ['r1'] }] }) },
  // course reverse: with an internal course the visibility key must not appear.
  { module: 'course', call: 'open(internal)', key: 'vmu.course.visibility', expectDiff: false, absentIn: 'both',
    limiting: { settings: { 'vmu.course.visibility': 'internal' } }, permissive: { settings: { 'vmu.course.visibility': 'internal' } },
    make: (settings) => createCourse({ clock: CLOCK, log: () => {}, settings }),
    run: (c) => c.open({ courseId: 'c1', title: 'T' }) },

  // external: `normalize` consults arxiv.maxAbstractChars only when the abstract exceeds it (external.js normalize).
  { module: 'external', call: 'normalize(arxiv)', key: 'vmu.external.arxiv.maxAbstractChars', expectDiff: true,
    limiting: { settings: { 'vmu.external.arxiv.maxAbstractChars': 0 } }, permissive: { settings: { 'vmu.external.arxiv.maxAbstractChars': 10 } },
    make: (settings) => createExternal({ clock: CLOCK, log: () => {}, settings }),
    run: (ex) => ex.normalize({ source: 'arxiv', enforced: [], results: [{ id: 'x', abstract: 'a'.repeat(50) }] }) },
  // external: fetchOne refuses on the network gate (allowNetwork=false) and completes with the seam injected.
  { module: 'external', call: 'fetchOne(allowNetwork)', key: 'vmu.external.allowNetwork', expectDiff: true,
    limiting: { settings: { 'vmu.external.enabled': true, 'vmu.external.allowNetwork': false } },
    permissive: { settings: { 'vmu.external.enabled': true, 'vmu.external.allowNetwork': true, 'vmu.external.requireReceipt': false } },
    make: (settings) => createExternal({ clock: CLOCK, log: () => {}, settings, fetchFn: GOOD_SEAM }),
    run: (ex) => ex.fetchOne({ source: 'arxiv', id: 'x', by: 'probe' }) },
  // external: requireReceipt decides whether the receipt rail fires at all (refusal vs success).
  { module: 'external', call: 'fetchOne(requireReceipt)', key: 'vmu.external.requireReceipt', expectDiff: true,
    limiting: { settings: { 'vmu.external.enabled': true, 'vmu.external.allowNetwork': true, 'vmu.external.requireReceipt': false } },
    permissive: { settings: { 'vmu.external.enabled': true, 'vmu.external.allowNetwork': true, 'vmu.external.requireReceipt': true } },
    make: (settings) => createExternal({ clock: CLOCK, log: () => {}, settings, fetchFn: GOOD_SEAM }),
    run: (ex) => ex.fetchOne({ source: 'arxiv', id: 'x', by: 'probe' }) },
  // external reverse: an openalex-only key must not appear while normalizing an arxiv record.
  { module: 'external', call: 'normalize(arxiv, openalex key)', key: 'vmu.external.openalex.maxConcepts', expectDiff: false, absentIn: 'both',
    limiting: { settings: { 'vmu.external.openalex.maxConcepts': 3 } }, permissive: { settings: { 'vmu.external.openalex.maxConcepts': 3 } },
    make: (settings) => createExternal({ clock: CLOCK, log: () => {}, settings }),
    run: (ex) => ex.normalize({ source: 'arxiv', enforced: [], results: [{ id: 'x', abstract: 'a'.repeat(50) }] }) },

  // workflow: these keys are ALWAYS evaluated, so the list cannot differ - the outcome form is used instead
  // (outcomeDiff), which asserts one more thing: the two runs must reach different outcomes.
  { module: 'workflow', call: 'retry', key: 'vmu.workflow.retryMax', outcomeDiff: true,
    limiting: { settings: { 'vmu.workflow.retryMax': 0 } }, permissive: { settings: { 'vmu.workflow.retryMax': 3 } },
    make: (settings) => createWorkflow({ clock: CLOCK, log: () => {}, settings }),
    run: (wf) => { wf.define({ stages: ['open', 'done'], transitions: [{ from: 'open', to: 'done' }] }); wf.advance({ taskId: 't', to: 'open', by: 'a' }); return wf.retry({ taskId: 't', reason: 'probe' }) } },
  { module: 'workflow', call: 'escalate', key: 'vmu.workflow.escalationAfterMs', outcomeDiff: true,
    limiting: { settings: { 'vmu.workflow.escalationAfterMs': 0 } }, permissive: { settings: { 'vmu.workflow.escalationAfterMs': 10 ** 9 } },
    make: (settings) => createWorkflow({ clock: CLOCK, log: () => {}, settings }),
    run: (wf) => { wf.define({ stages: ['open', 'done'], transitions: [{ from: 'open', to: 'done' }] }); wf.advance({ taskId: 't', to: 'open', by: 'a' }); return wf.escalate({ taskId: 't', reason: 'probe' }) } },
  { module: 'workflow', call: 'advance(gate)', key: 'vmu.workflow.stageGateMode', outcomeDiff: true,
    // the missing-evidence gate: `refuse` (default) throws, `advisory` records the block and advances
    limiting: { settings: { 'vmu.workflow.stageGateMode': 'refuse' } }, permissive: { settings: { 'vmu.workflow.stageGateMode': 'advisory' } },
    make: (settings) => createWorkflow({ clock: CLOCK, log: () => {}, settings }),
    run: (wf) => { wf.define({ stages: ['open', 'mid', 'done'], transitions: [{ from: 'open', to: 'mid' }, { from: 'mid', to: 'done' }] }); wf.advance({ taskId: 't', to: 'open', by: 'a' }); return wf.advance({ taskId: 't', to: 'mid', by: 'a' }) } },
  // workflow reverse: `queue()` (priority order) never consults the retry keys.
  { module: 'workflow', call: 'queue', key: 'vmu.workflow.retryMax', expectDiff: false, absentIn: 'both',
    limiting: { settings: { 'vmu.workflow.retryMax': 3 } }, permissive: { settings: { 'vmu.workflow.retryMax': 3 } },
    make: (settings) => createWorkflow({ clock: CLOCK, log: () => {}, settings }),
    run: (wf) => { wf.define({ stages: ['open', 'done'], transitions: [{ from: 'open', to: 'done' }] }); wf.advance({ taskId: 't', to: 'open', by: 'a' }); return wf.queue() } },

  // ---- ROUND-16 COVERAGE: conference.js / instruments.js / ip.js (read from their own tests, then MEASURED) --
  // conference: the CfP window keys are conditional - a closed/not-yet-open window refuses and reports the key,
  // an open window takes the long success path (7 keys) ⇒ the two lists genuinely differ.
  { module: 'conference', call: 'submit(cfpCloseMs)', key: 'vmu.conference.cfpCloseMs', expectDiff: true,
    limiting: { settings: { 'vmu.conference.cfpCloseMs': 500 } }, permissive: { settings: { 'vmu.conference.cfpCloseMs': 0 } },
    make: (settings) => createConference({ clock: CLOCK, log: () => {}, settings }),
    run: (t) => { const r = t.open({ id: 'c1', topics: ['ml', 'hci'] }); return t.submit({ conference: r.conference, title: 'A', authors: ['ada'], topics: ['ml'] }) } },
  { module: 'conference', call: 'submit(cfpOpenMs)', key: 'vmu.conference.cfpOpenMs', expectDiff: true,
    limiting: { settings: { 'vmu.conference.cfpOpenMs': 2_000_000 } }, permissive: { settings: { 'vmu.conference.cfpOpenMs': 0 } },
    make: (settings) => createConference({ clock: CLOCK, log: () => {}, settings }),
    run: (t) => { const r = t.open({ id: 'c1', topics: ['ml', 'hci'] }); return t.submit({ conference: r.conference, title: 'A', authors: ['ada'], topics: ['ml'] }) } },
  { module: 'conference', call: 'register', key: 'vmu.conference.register', expectDiff: true,
    limiting: { settings: { 'vmu.conference.register': false } }, permissive: { settings: { 'vmu.conference.register': true } },
    make: (settings) => createConference({ clock: CLOCK, log: () => {}, settings }),
    run: (t) => { const r = t.open({ id: 'c1', topics: ['ml'] }); return t.register({ conference: r.conference, attendee: 'a' }) } },
  { module: 'conference', call: 'assign', key: 'vmu.conference.cfpCloseMs', expectDiff: false, absentIn: 'both',
    limiting: { settings: { 'vmu.conference.reviewAssignmentsPerPaper': 1, 'vmu.conference.assign': 'auto' } },
    permissive: { settings: { 'vmu.conference.reviewAssignmentsPerPaper': 1, 'vmu.conference.assign': 'auto' } },
    make: (settings) => createConference({ clock: CLOCK, log: () => {}, settings }),
    run: (t) => { const r = t.open({ id: 'c1', topics: ['ml'] }); const s = t.submit({ conference: r.conference, title: 'A', authors: ['ada'], topics: ['ml'] }).submission; return t.assign({ conference: r.conference, submission: s, eligible: ['r1', 'r2', 'r3'] }) } },

  // instruments: `reserve` consults maxHoldHours only through the hold rail (1h limit refuses, 24h passes and
  // additionally consults reservationHorizonDays), and the overbook rail is conditional on overbookRatio.
  { module: 'instruments', call: 'reserve(maxHoldHours)', key: 'vmu.instruments.maxHoldHours', expectDiff: true,
    limiting: { settings: { 'vmu.instruments.maxHoldHours': 1 } }, permissive: { settings: { 'vmu.instruments.maxHoldHours': 24 } },
    make: (settings) => createInstruments({ clock: CLOCK, log: () => {}, settings }),
    run: (i) => { i.register({ id: 'mri', owner: 'lab' }); return i.reserve({ id: 'mri', by: 'a', hours: 2 }) } },
  { module: 'instruments', call: 'reserve(overbookRatio, 2nd)', key: 'vmu.instruments.overbookRatio', expectDiff: true,
    limiting: { settings: { 'vmu.instruments.overbookRatio': 0 } }, permissive: { settings: { 'vmu.instruments.overbookRatio': 1 } },
    make: (settings) => createInstruments({ clock: CLOCK, log: () => {}, settings }),
    run: (i) => { i.register({ id: 'x', owner: 'lab' }); i.reserve({ id: 'x', by: 'a', hours: 1 }); return i.reserve({ id: 'x', by: 'b', hours: 1 }) } },
  // instruments outcome form: skill gate is always evaluated, but the untrained call is REFUSED while the same
  // call after `train` succeeds ⇒ outcome differs and the key is reported on both sides.
  { module: 'instruments', call: 'use(capabilityTags)', key: 'vmu.instruments.capabilityTags', outcomeDiff: true,
    limiting: { settings: { 'vmu.instruments.capabilityTags': ['sem'] }, input: { train: false } },
    permissive: { settings: { 'vmu.instruments.capabilityTags': ['sem'] }, input: { train: true } },
    make: (settings) => createInstruments({ clock: CLOCK, log: () => {}, settings }),
    run: (i, variant) => { i.register({ id: 'sem', owner: 'lab', tags: ['sem'] }); if (variant.input.train) i.train({ by: 'newbie', tags: ['sem'] }); return i.use({ id: 'sem', by: 'newbie', purpose: 'image' }) } },
  { module: 'instruments', call: 'use', key: 'vmu.instruments.maxHoldHours', expectDiff: false, absentIn: 'both',
    limiting: { settings: {} }, permissive: { settings: {} },
    make: (settings) => createInstruments({ clock: CLOCK, log: () => {}, settings }),
    run: (i) => { i.register({ id: 'scope2', owner: 'lab' }); return i.use({ id: 'scope2', by: 'a', purpose: 'm' }) } },

  // ip: every knob is ALWAYS evaluated (measured: quick/standard, disclosureRequired on/off, authorshipRule,
  // holdEnforcement all report the SAME key set), so the honest form for ip is the outcome form.
  { module: 'ip', call: 'file(disclosureRequired)', key: 'vmu.ip.disclosureRequired', outcomeDiff: true,
    limiting: { settings: { 'vmu.ip.disclosureRequired': true } }, permissive: { settings: { 'vmu.ip.disclosureRequired': false } },
    make: (settings) => createIp({ clock: CLOCK, log: () => {}, settings }),
    run: (a) => a.file({ title: 'T', inventors: ['Ada Lovelace'] }) },
  { module: 'ip', call: 'complete(disclosureFields)', key: 'vmu.ip.disclosureFields', outcomeDiff: true,
    limiting: { settings: { 'vmu.ip.disclosureFields': ['evidenceRefs'] } }, permissive: { settings: { 'vmu.ip.disclosureFields': [] } },
    make: (settings) => createIp({ clock: CLOCK, log: () => {}, settings }),
    run: (a) => { const f = a.file({ title: 'T', inventors: ['Ada Lovelace'], publicDisclosures: [], contributors: [{ id: 'm1', share: 0.9, evidence: ['e'] }], priorArt: { hits: [{ id: 'x' }], conclusion: 'clear' }, evidenceRefs: undefined }); return a.complete({ id: f.id }) } },
  { module: 'ip', call: 'priorArt(priorArtSearchDepth)', key: 'vmu.ip.priorArtSearchDepth', outcomeDiff: true,
    limiting: { settings: { 'vmu.ip.priorArtSearchDepth': 'quick' } }, permissive: { settings: { 'vmu.ip.priorArtSearchDepth': 'standard' } },
    make: (settings) => createIp({ clock: CLOCK, log: () => {}, settings }),
    run: (a) => { const f = a.file({ title: 'T', inventors: ['Ada Lovelace'], publicDisclosures: [], contributors: [{ id: 'm1', share: 0.9, evidence: ['e'] }], priorArt: { hits: [{ id: 'x' }], conclusion: 'clear' } }); return a.priorArt({ id: f.id, hits: [] }) } },
  { module: 'ip', call: 'ownership', key: 'vmu.ip.priorArtSearchDepth', expectDiff: false, absentIn: 'both',
    limiting: { settings: {} }, permissive: { settings: {} },
    make: (settings) => createIp({ clock: CLOCK, log: () => {}, settings }),
    run: (a) => { const f = a.file({ title: 'T', inventors: ['Ada Lovelace'], publicDisclosures: [], contributors: [{ id: 'm1', share: 0.9, evidence: ['e'] }], priorArt: { hits: [{ id: 'x' }], conclusion: 'clear' } }); return a.ownership({ id: f.id }) } },

  // ---- ROUND-17 (task-192): the "change a setting ⇒ behaviour changes" double-proof the critic found missing ----
  // conference registrationCap: cap 0 (unlimited) lets the 3rd attendee through on the long path; cap 2 refuses it
  // and reports [register, registrationCap]. Pre-state = an opened conference with two registrations already made.
  { module: 'conference', call: 'register(registrationCap)', key: 'vmu.conference.registrationCap', expectDiff: true,
    limiting: { settings: { 'vmu.conference.registrationCap': 0, 'vmu.conference.registrationFeeMinor': 12000 } },
    permissive: { settings: { 'vmu.conference.registrationCap': 2, 'vmu.conference.registrationFeeMinor': 12000 } },
    make: (settings) => createConference({ clock: CLOCK, log: () => {}, settings }),
    run: (t) => { const r = t.open({ id: 'c1', topics: ['ml'] }); t.register({ conference: r.conference, attendee: 'a' }); t.register({ conference: r.conference, attendee: 'b' }); return t.register({ conference: r.conference, attendee: 'c' }) } },
  // conference slotMinutes: 20-minute items do not fit 5-minute slots (conflict refusal, 2 keys) but fit 60 (ok, 4 keys).
  { module: 'conference', call: 'planAgenda(slotMinutes)', key: 'vmu.conference.slotMinutes', expectDiff: true,
    limiting: { settings: { 'vmu.conference.schedule': 'sequential', 'vmu.conference.slotMinutes': 5 } },
    permissive: { settings: { 'vmu.conference.schedule': 'sequential', 'vmu.conference.slotMinutes': 60 } },
    make: (settings) => createConference({ clock: CLOCK, log: () => {}, settings }),
    run: (t) => { const r = t.open({ id: 'c1', topics: ['ml'] }); return t.planAgenda({ conference: r.conference, items: [{ id: 't1', minutes: 20 }, { id: 't2', minutes: 20 }] }) } },
  // ip publicationHoldDays: 90 holds the disclosure (refusal names the remaining days), 0 releases it immediately.
  { module: 'ip', call: 'disclose(publicationHoldDays)', key: 'vmu.ip.publicationHoldDays', outcomeDiff: true,
    limiting: { settings: { 'vmu.ip.publicationHoldDays': 90 } }, permissive: { settings: { 'vmu.ip.publicationHoldDays': 0 } },
    make: (settings) => createIp({ clock: CLOCK, log: () => {}, settings }),
    run: (a) => { const f = a.file({ title: 'T', inventors: ['Ada Lovelace'], publicDisclosures: [], contributors: [{ id: 'm1', share: 0.9, evidence: ['e'] }], priorArt: { hits: [{ id: 'x' }], conclusion: 'clear' } }); return a.disclose({ id: f.id, at: CLOCK() + 86400000 }) } },
  // ip holdEnforcement with a HELD dossier: block refuses the disclosure, warn lets it through (marked held).
  { module: 'ip', call: 'disclose(holdEnforcement, held)', key: 'vmu.ip.holdEnforcement', outcomeDiff: true,
    limiting: { settings: { 'vmu.ip.holdEnforcement': 'block', 'vmu.ip.publicationHoldDays': 90 } },
    permissive: { settings: { 'vmu.ip.holdEnforcement': 'warn', 'vmu.ip.publicationHoldDays': 90 } },
    make: (settings) => createIp({ clock: CLOCK, log: () => {}, settings }),
    run: (a) => { const f = a.file({ title: 'T', inventors: ['Ada Lovelace'], publicDisclosures: [], contributors: [{ id: 'm1', share: 0.9, evidence: ['e'] }], priorArt: { hits: [{ id: 'x' }], conclusion: 'clear' } }); a.hold({ id: f.id, reason: 'secrecy review', at: CLOCK() }); return a.disclose({ id: f.id, at: CLOCK() + 86400000 }) } },

  // ---- ROUND-18 (task-193): compliance / funding / storepolicy (the last three uncovered modules) -------------
  // compliance: `review` consults irbRequired + requireApprovalGate only while the gate is ON; with all three
  // gates off nothing is evaluated ([]) so the two lists genuinely differ.
  { module: 'compliance', call: 'review', key: 'vmu.compliance.irbRequired', expectDiff: true,
    limiting: { settings: {} },
    permissive: { settings: { 'vmu.compliance.irbRequired': false, 'vmu.compliance.requireApprovalGate': false, 'vmu.compliance.require': 'none' } },
    make: (settings) => createCompliance({ clock: CLOCK, settings }),
    run: (c) => c.review({ protocolId: 'P-1' }) },
  // compliance: `exportData` always evaluates redactionPolicy, but missing redaction REFUSES and redactionPolicy=off
  // lets the same export through ⇒ outcome form.
  { module: 'compliance', call: 'exportData(redactionPolicy)', key: 'vmu.compliance.redactionPolicy', outcomeDiff: true,
    limiting: { settings: {} }, permissive: { settings: { 'vmu.compliance.redactionPolicy': 'off' } },
    make: (settings) => createCompliance({ clock: CLOCK, settings }),
    run: (c) => c.exportData({ studyId: 'S-1', approvedBy: 'acad' }) },
  // compliance: `coi` consults conflictOfInterestDisclosure + coiScope; an undeclared COI refuses (2 keys), a
  // declared one passes (1 key) ⇒ the lists differ AND the outcome differs.
  { module: 'compliance', call: 'coi', key: 'vmu.compliance.conflictOfInterestDisclosure', expectDiff: true,
    limiting: { settings: {}, input: { declared: false } }, permissive: { settings: {}, input: { declared: true } },
    make: (settings) => createCompliance({ clock: CLOCK, settings }),
    run: (c, variant) => c.coi(variant.input.declared ? { who: 'r-1', declared: { declared: true } } : { who: 'r-1' }) },
  { module: 'compliance', call: 'prepare', key: 'vmu.compliance.calendarDir', expectDiff: false, absentIn: 'both',
    limiting: { settings: {} }, permissive: { settings: {} },
    make: (settings) => createCompliance({ clock: CLOCK, settings }),
    run: (c) => c.prepare({}) },

  // funding: all refusals are RETURNED (`{ok:false, code, enforced}`). approvalThresholdMinor decides whether the
  // same 9000 request is auto-approved or refused ⇒ outcome form (the key is evaluated in both paths).
  { module: 'funding', call: 'request(approvalThresholdMinor)', key: 'vmu.funding.approvalThresholdMinor', outcomeDiff: true,
    limiting: { settings: { 'vmu.funding.request': 'auto', 'vmu.funding.approvalThresholdMinor': 5000 } },
    permissive: { settings: { 'vmu.funding.request': 'auto', 'vmu.funding.approvalThresholdMinor': 100000 } },
    make: (settings) => { const f = createFunding({ clock: CLOCK, settings }); f.openAccount({ id: 'a1', title: 'T', approved: true }); return f },
    run: (f) => f.request({ account: 'a1', title: 'R', amountMinor: 9000 }) },
  // funding: costSharePolicy cap 50% refuses a 70% share, allow-any accepts it ⇒ outcome form.
  { module: 'funding', call: 'request(costSharePolicy)', key: 'vmu.funding.costSharePolicy', outcomeDiff: true,
    limiting: { settings: { 'vmu.funding.costSharePolicy': 'cap', 'vmu.funding.split': ['0.5'] } },
    permissive: { settings: { 'vmu.funding.costSharePolicy': 'allow-any' } },
    make: (settings) => { const f = createFunding({ clock: CLOCK, settings }); f.openAccount({ id: 'a1', title: 'T', approved: true }); return f },
    run: (f) => f.request({ account: 'a1', title: 'R', amountMinor: 1000, costShareMinor: 700 }) },
  // funding: auditPack is gated by vmu.funding.auditPack (unset ⇒ VMU_NOT_PERMITTED, true ⇒ the pack is produced).
  { module: 'funding', call: 'auditPack', key: 'vmu.funding.auditPack', outcomeDiff: true,
    limiting: { settings: {} }, permissive: { settings: { 'vmu.funding.auditPack': true } },
    make: (settings) => { const f = createFunding({ clock: CLOCK, settings }); f.openAccount({ id: 'a1', title: 'T', approved: true }); return f },
    run: (f) => { f.request({ account: 'a1', title: 'R', amountMinor: 10 }); return f.auditPack({ account: 'a1' }) } },
  { module: 'funding', call: 'request', key: 'vmu.funding.auditPackFields', expectDiff: false, absentIn: 'both',
    limiting: { settings: {} }, permissive: { settings: {} },
    make: (settings) => { const f = createFunding({ clock: CLOCK, settings }); f.openAccount({ id: 'a1', title: 'T', approved: true }); return f },
    run: (f) => f.request({ account: 'a1', title: 'R', amountMinor: 10 }) },

  // storepolicy: onVersionTooHigh=refuse refuses a too-high version, warn assumes it ⇒ outcome form.
  { module: 'storepolicy', call: 'read(onVersionTooHigh)', key: 'vmu.store.onVersionTooHigh', outcomeDiff: true,
    limiting: { settings: { 'vmu.store.backend': 'memory', 'vmu.store.onVersionTooHigh': 'refuse' } },
    permissive: { settings: { 'vmu.store.backend': 'memory', 'vmu.store.onVersionTooHigh': 'warn' } },
    make: (settings) => createStorePolicy({ clock: CLOCK, log: () => {}, settings }),
    run: (s) => s.read({ id: 'r', foundVersion: 3, currentVersion: 1 }) },
  // storepolicy: the root key is evaluated by the FILE backend only - memory succeeds (8-key list), file without a
  // root refuses with just [root] ⇒ the lists differ (and the key is reported by the refusing side).
  { module: 'storepolicy', call: 'write(root)', key: 'vmu.store.root', expectDiff: true,
    limiting: { settings: { 'vmu.store.backend': 'memory' } }, permissive: { settings: { 'vmu.store.backend': 'file' } },
    make: (settings) => createStorePolicy({ clock: CLOCK, log: () => {}, settings }),
    run: (s) => s.write({ id: 'w', online: false }) },
  // storepolicy: lock=false lets the second acquire through, the lock family refuses the clash ⇒ outcome form.
  { module: 'storepolicy', call: 'acquire(lock, 2nd)', key: 'vmu.store.lock', outcomeDiff: true,
    limiting: { settings: { 'vmu.store.backend': 'memory', 'vmu.store.lock': false } },
    permissive: { settings: { 'vmu.store.backend': 'memory', 'vmu.store.lock': true, 'vmu.store.lock.timeoutMs': 100, 'vmu.store.lock.retries': 3, 'vmu.store.lock.backoffMs': 50 } },
    make: (settings) => createStorePolicy({ clock: CLOCK, log: () => {}, settings }),
    run: (s) => { s.acquire({ name: 'a', by: 'm1' }); return s.acquire({ name: 'a', by: 'm2' }) } },
  { module: 'storepolicy', call: 'release', key: 'vmu.store.onVersionTooHigh', expectDiff: false, absentIn: 'both',
    limiting: { settings: { 'vmu.store.backend': 'memory' } }, permissive: { settings: { 'vmu.store.backend': 'memory' } },
    make: (settings) => createStorePolicy({ clock: CLOCK, log: () => {}, settings }),
    run: (s) => s.release({ name: 'a' }) },

  // ---- ROUND-19 (task-200): capacity / hr ----
  // capacity (GATE_SCENARIOS ①): the pool rail is always evaluated; 20h into a 10h pool is REFUSED while a 1000h
  // pool accepts the same call ⇒ outcome form.
  { module: 'capacity', call: 'reserve(machineHoursPool)', key: 'vmu.capacity.machineHoursPool', outcomeDiff: true,
    limiting: { settings: { 'vmu.capacity.machineHoursPool': 10, 'vmu.capacity.overcommitRatio': 1 } },
    permissive: { settings: { 'vmu.capacity.machineHoursPool': 1000, 'vmu.capacity.overcommitRatio': 1 } },
    make: (settings) => createCapacity({ clock: CLOCK, log: () => {}, settings }),
    run: (c) => c.reserve({ domain: 'd1', hours: 20 }) },
  // capacity: safetyBriefingRequired is consulted only for a declared facility - true refuses, false admits.
  { module: 'capacity', call: 'reserve(safetyBriefingRequired)', key: 'vmu.capacity.safetyBriefingRequired', outcomeDiff: true,
    limiting: { settings: { 'vmu.capacity.safetyBriefingRequired': true, 'vmu.capacity.facilities': ['lab'] } },
    permissive: { settings: { 'vmu.capacity.safetyBriefingRequired': false, 'vmu.capacity.facilities': ['lab'] } },
    make: (settings) => createCapacity({ clock: CLOCK, log: () => {}, settings }),
    run: (c) => c.reserve({ domain: 'd', facility: 'lab', hours: 1 }) },
  // capacity (GATE_SCENARIOS ③): a 10-day forecast beyond a 3-day horizon is STALE (refused), a 300-day horizon passes.
  { module: 'capacity', call: 'forecast(forecastHorizonDays)', key: 'vmu.capacity.forecastHorizonDays', outcomeDiff: true,
    limiting: { settings: { 'vmu.capacity.forecastHorizonDays': 3 } }, permissive: { settings: { 'vmu.capacity.forecastHorizonDays': 300 } },
    make: (settings) => createCapacity({ clock: CLOCK, log: () => {}, settings }),
    run: (c) => c.forecast({ days: 10 }) },
  // capacity (GATE_SCENARIOS ② as the rule-④ carrier): the reserve rail never consults the forecast keys.
  { module: 'capacity', call: 'reserve(GATE ②)', key: 'vmu.capacity.forecastHorizonDays', expectDiff: false, absentIn: 'both',
    limiting: { settings: { 'vmu.capacity.machineHoursPool': 100, 'vmu.capacity.overcommitRatio': 0.5 } },
    permissive: { settings: { 'vmu.capacity.machineHoursPool': 100, 'vmu.capacity.overcommitRatio': 0.5 } },
    make: (settings) => createCapacity({ clock: CLOCK, log: () => {}, settings }),
    run: (c) => c.reserve({ domain: 'd1', hours: 80 }) },

  // hr (all rails THROW): humanDecisionRequired forbids an automatic tenure decision while the human path needs a
  // decisionAt inside the window ⇒ the outcome differs (forbidden vs due vs ok).
  { module: 'hr', call: 'tenure(humanDecisionRequired)', key: 'vmu.hr.humanDecisionRequired', outcomeDiff: true,
    limiting: { settings: { 'vmu.hr.humanDecisionRequired': true }, input: { votes: 5, auto: true } },
    permissive: { settings: { 'vmu.hr.humanDecisionRequired': false }, input: { votes: 3, decisionAt: '2026-06-01T00:00:00.000Z' } },
    make: (settings) => createHr({ clock: ISO_CLOCK, log: () => {}, settings }),
    run: (h, variant) => h.tenure(Object.assign({ who: 'r-2', trackStart: '2023-01-01T00:00:00.000Z' }, variant.input)) },
  // hr: offboardingChecklist decides whether the offboarding set is complete (refused vs admitted).
  { module: 'hr', call: 'offboard(offboardingChecklist)', key: 'vmu.hr.offboardingChecklist', outcomeDiff: true,
    limiting: { settings: {}, input: { done: ['handover'] } },
    permissive: { settings: {}, input: { done: ['handover', 'keys', 'records'] } },
    make: (settings) => createHr({ clock: ISO_CLOCK, log: () => {}, settings }),
    run: (h, variant) => h.offboard({ who: 'r-3', done: variant.input.done }) },
  // hr: appealWindowDays is consulted while an appeal is open (refused) and cleared once it is resolved.
  { module: 'hr', call: 'appeal(appealWindowDays)', key: 'vmu.hr.appealWindowDays', outcomeDiff: true,
    limiting: { settings: {}, input: { resolved: false } }, permissive: { settings: {}, input: { resolved: true } },
    make: (settings) => createHr({ clock: ISO_CLOCK, log: () => {}, settings }),
    run: (h, variant) => h.appeal({ who: 'r-4', openedAt: '2026-06-20T00:00:00.000Z', resolved: variant.input.resolved }) },
  // hr reverse: offboarding never consults the appeal window.
  { module: 'hr', call: 'offboard', key: 'vmu.hr.appealWindowDays', expectDiff: false, absentIn: 'both',
    limiting: { settings: {} }, permissive: { settings: {} },
    make: (settings) => createHr({ clock: ISO_CLOCK, log: () => {}, settings }),
    run: (h) => h.offboard({ who: 'r-3', done: ['handover', 'keys', 'records'] }) },

  // ---- ROUND-20 (task-215): migration (every key is always evaluated ⇒ outcome form) ----
  // requireConfirm: the same apply is refused without a confirmation and executes with one.
  { module: 'migration', call: 'apply(requireConfirm)', key: 'vmu.migration.requireConfirm', outcomeDiff: true,
    limiting: { settings: { 'vmu.migration.requireConfirm': true, 'vmu.migration.dryRunDefault': false }, input: { confirm: false } },
    permissive: { settings: { 'vmu.migration.requireConfirm': true, 'vmu.migration.dryRunDefault': false }, input: { confirm: true } },
    make: (settings) => createMigration({ clock: CLOCK, log: () => {}, settings, backends: ['json-fold', 'storage-domain'] }),
    run: (m, variant) => { const p = m.plan({ from: 'v1', to: 'v2', backend: 'json-fold', steps: 3 }); return m.apply(Object.assign({ migration: p.migration }, variant.input)) } },
  // onFailure: a failing step ABORTS by name under 'abort' and is absorbed (executed=3) under 'continue'.
  { module: 'migration', call: 'apply(onFailure)', key: 'vmu.migration.onFailure', outcomeDiff: true,
    limiting: { settings: { 'vmu.migration.onFailure': 'abort', 'vmu.migration.dryRunDefault': false } },
    permissive: { settings: { 'vmu.migration.onFailure': 'continue', 'vmu.migration.dryRunDefault': false } },
    make: (settings) => createMigration({ clock: CLOCK, log: () => {}, settings, backends: ['json-fold', 'storage-domain'] }),
    run: (m) => { const p = m.plan({ from: 'v1', to: 'v2', backend: 'json-fold', steps: 3 }); return m.apply({ migration: p.migration, failAtStep: 2 }) } },
  // keepBackups: with onFailure=rollback and a failing step, no backup ⇒ VMU_ROLLBACK_UNAVAILABLE, with backups
  // the failure is reported by the migrate rail instead ⇒ the two runs end differently (different named refusals).
  { module: 'migration', call: 'apply(keepBackups)', key: 'vmu.migration.keepBackups', outcomeDiff: true,
    limiting: { settings: { 'vmu.migration.keepBackups': false, 'vmu.migration.onFailure': 'rollback', 'vmu.migration.dryRunDefault': false } },
    permissive: { settings: { 'vmu.migration.keepBackups': true, 'vmu.migration.onFailure': 'rollback', 'vmu.migration.dryRunDefault': false } },
    make: (settings) => createMigration({ clock: CLOCK, log: () => {}, settings, backends: ['json-fold', 'storage-domain'] }),
    run: (m) => { const p = m.plan({ from: 'v1', to: 'v2', backend: 'json-fold', steps: 3 }); return m.apply({ migration: p.migration, failAtStep: 2 }) } },
  // migration reverse: planning never consults the report formatting keys.
  { module: 'migration', call: 'plan', key: 'vmu.migration.reportFormat', expectDiff: false, absentIn: 'both',
    limiting: { settings: {} }, permissive: { settings: {} },
    make: (settings) => createMigration({ clock: CLOCK, log: () => {}, settings, backends: ['json-fold', 'storage-domain'] }),
    run: (m) => m.plan({ from: 'v1', to: 'v2', backend: 'json-fold', steps: 3 }) },
]

// REFUSAL DISCIPLINE: these calls are EXPECTED to refuse. mathtools attaches `enforced` to the thrown error;
// a refusal that does not is a finding, because "why was it refused" must name what was enforced.
const REFUSAL_SCENARIOS = [
  { module: 'meetings', call: 'open(materialsRequired)', settings: { 'vmu.meetings.materialsRequired': true },
    make: (settings) => createMeetings({ clock: CLOCK, log: () => {}, settings }), run: (mg) => mg.open({ type: 'ordinary', roster: ['a'], materials: null }) },
  { module: 'meetings', call: 'close(minutesActionsRequired)', settings: { 'vmu.meetings.minutesActionsRequired': true },
    make: (settings) => createMeetings({ clock: CLOCK, log: () => {}, settings }), run: (mg) => { const o = mg.open({ type: 'ordinary', roster: ['a'] }); return mg.close({ meeting: o.meeting }) } },
  { module: 'records', call: 'put(quota)', settings: { 'vmu.records.retention.maxBytes': 50 },
    make: (settings) => createRecords({ clock: CLOCK, log: () => {}, settings }), run: (rc) => put(rc, { body: 'q'.repeat(200) }) },
  { module: 'records', call: 'remove(no by)', settings: {},
    make: (settings) => createRecords({ clock: CLOCK, log: () => {}, settings }), run: (rc) => { const p = put(rc); return rc.remove({ id: p.id }) } },
  { module: 'mathtools', call: 'plan(requireSeed)', settings: { 'vmu.math.repro.requireSeed': true },
    make: (settings) => createMathTools({ clock: CLOCK, log: () => {}, settings }), run: (mt) => mt.plan({ op: 'optim/minimize', args: {} }) },
  { module: 'conference', call: 'register(closed)', settings: { 'vmu.conference.register': false },
    make: (settings) => createConference({ clock: CLOCK, log: () => {}, settings }),
    run: (t) => { const r = t.open({ id: 'c1', topics: ['ml'] }); return t.register({ conference: r.conference, attendee: 'a' }) } },
  { module: 'instruments', call: 'use(untrained)', settings: { 'vmu.instruments.capabilityTags': ['sem'] },
    make: (settings) => createInstruments({ clock: CLOCK, log: () => {}, settings }),
    run: (i) => { i.register({ id: 'sem', owner: 'lab', tags: ['sem'] }); return i.use({ id: 'sem', by: 'newbie', purpose: 'image' }) } },
  { module: 'ip', call: 'priorArt(standard, empty)', settings: { 'vmu.ip.priorArtSearchDepth': 'standard' },
    make: (settings) => createIp({ clock: CLOCK, log: () => {}, settings }),
    run: (a) => { const f = a.file({ title: 'T', inventors: ['Ada Lovelace'], publicDisclosures: [], contributors: [{ id: 'm1', share: 0.9, evidence: ['e'] }], priorArt: { hits: [{ id: 'x' }], conclusion: 'clear' } }); return a.priorArt({ id: f.id, hits: [] }) } },
  { module: 'compliance', call: 'review(no approval)', settings: {},
    make: (settings) => createCompliance({ clock: CLOCK, settings }),
    run: (c) => c.review({ protocolId: 'P-1' }) },
  { module: 'funding', call: 'request(over threshold)', settings: { 'vmu.funding.request': 'auto', 'vmu.funding.approvalThresholdMinor': 5000 },
    make: (settings) => { const f = createFunding({ clock: CLOCK, settings }); f.openAccount({ id: 'a1', title: 'T', approved: true }); return f },
    run: (f) => f.request({ account: 'a1', title: 'R', amountMinor: 9000 }) },
  { module: 'storepolicy', call: 'acquire(lock clash)', settings: { 'vmu.store.backend': 'memory', 'vmu.store.lock': true, 'vmu.store.lock.timeoutMs': 100, 'vmu.store.lock.retries': 3, 'vmu.store.lock.backoffMs': 50 },
    make: (settings) => createStorePolicy({ clock: CLOCK, log: () => {}, settings }),
    run: (s) => { s.acquire({ name: 'a', by: 'm1' }); return s.acquire({ name: 'a', by: 'm2' }) } },
  { module: 'capacity', call: 'reserve(pool exhausted)', settings: { 'vmu.capacity.machineHoursPool': 10, 'vmu.capacity.overcommitRatio': 1 },
    make: (settings) => createCapacity({ clock: CLOCK, log: () => {}, settings }),
    run: (c) => c.reserve({ domain: 'd1', hours: 20 }) },
  { module: 'hr', call: 'tenure(auto decision)', settings: { 'vmu.hr.humanDecisionRequired': true },
    make: (settings) => createHr({ clock: ISO_CLOCK, log: () => {}, settings }),
    run: (h) => h.tenure({ who: 'r-2', trackStart: '2023-01-01T00:00:00.000Z', votes: 5, auto: true }) },
  { module: 'migration', call: 'plan(same-version)', settings: { 'vmu.migration.rollback': 'allow' },
    make: (settings) => createMigration({ clock: CLOCK, log: () => {}, settings, backends: ['json-fold', 'storage-domain'] }),
    run: (m) => m.plan({ from: 'v2', to: 'v2', backend: 'json-fold', steps: 1 }) },
]

// ---------------------------------------------------------------------------------------------------------
// the runner
// ---------------------------------------------------------------------------------------------------------
const runVariant = async (scn, variant, label) => {
  const service = scn.make(variant.settings || {})
  try {
    const result = await scn.run(service, variant)
    const c = collectEnforced(result)
    const refused = !!result && typeof result === 'object' && (result.ok === false || typeof result.code === 'string')
    return { label, ok: true, threw: false, code: refused ? result.code : null, refused, outcome: refused ? 'refused:' + result.code : 'ok', arrays: c.arrays, nonArrays: c.nonArrays, count: c.count }
  } catch (e) {
    const refusal = e && typeof e === 'object' ? { enforced: e.enforced } : {}
    const c = collectEnforced(e)
    return { label, ok: false, threw: true, code: (e && e.code) || 'UNKNOWN', outcome: 'threw:' + ((e && e.code) || 'UNKNOWN'), arrays: c.arrays.concat(collectEnforced(refusal).arrays), nonArrays: c.nonArrays, count: c.count, refusalEnforcedIsArray: Array.isArray(e && e.enforced) }
  }
}

const byModule = new Map()
const attributionRows = []
const keySetOf = (run) => new Set(run.arrays.flatMap((a) => a.value))
ok(SCENARIOS.length > 0, 'non-vacuous: the scenario table must not be empty (' + SCENARIOS.length + ' scenarios)')
for (const scn of SCENARIOS) {
  const label = scn.module + '.' + scn.call + ' [' + scn.key + ']'
  const lim = await runVariant(scn, scn.limiting, label + ' limiting')
  const per = await runVariant(scn, scn.permissive, label + ' permissive')
  const lim2 = await runVariant(scn, scn.limiting, label + ' limiting#2')
  if (!byModule.has(scn.module)) byModule.set(scn.module, { diff: 0, keys: [] })
  const m = byModule.get(scn.module)
  {
    const lk = keySetOf(lim)
    const pk = keySetOf(per)
    attributionRows.push({
      label, key: scn.key,
      limHas: lk.has(scn.key), perHas: pk.has(scn.key),
      reported: lk.has(scn.key) || pk.has(scn.key),
      absentIn: scn.absentIn || null,           // 'both' | 'permissive' | 'limiting' - rule ④ rows
      identical: JSON.stringify(lim.arrays) === JSON.stringify(per.arrays),
      diff: [...new Set([...lk, ...pk])].filter((k) => lk.has(k) !== pk.has(k)),
    })
  }

  const shape = checkArrayShape(lim).concat(checkArrayShape(per))
  ok(shape.length === 0, 'rule ⑤ array-not-null: ' + label, shape[0])
  for (const f of shape) finding(f.split(':')[0], label, f) // EMPTY_ALLOWED: `shape` 为空正是"无数组形状 finding"的期望结果（上面的 ok 已断言 length === 0）

  const dup = checkDuplicates(lim).concat(checkDuplicates(per))
  ok(dup.length === 0, 'rule ① no duplicates: ' + label, dup[0])
  for (const f of dup) finding('DUPLICATE', label, f) // EMPTY_ALLOWED: `dup` 为空正是"无重复键 finding"的期望结果（上面的 ok 已断言 length === 0）

  const det = checkDeterministic(lim, lim2)
  ok(det.length === 0, 'rule ② deterministic: ' + label, det[0])
  for (const f of det) finding('NONDETERMINISTIC', label, f) // EMPTY_ALLOWED: `det` 为空正是"确定性 finding 为零"的期望结果（上面的 ok 已断言 length === 0）

  if (scn.expectDiff) {
    const st = checkBehaviourListed(lim, per, scn.key)
    ok(st.length === 0, 'rule ③ behaviour listed: ' + label, st[0])
    if (st.length) finding('STATIC-LIST', label, scn.key)
    else { m.diff++; m.keys.push(scn.key) }
  }
  if (scn.outcomeDiff) {
    // Keys that the module ALWAYS evaluates cannot make the two lists differ (measured: retry/escalate/advance
    // report the same key set whether they refuse or not). For those, the honest form of "behaviour changed ⇒
    // in the list" is the OUTCOME form: the two runs must reach DIFFERENT outcomes, and the key must be
    // reported by the call. This is not a relaxation - it asserts one more thing (the outcome) than ③ does.
    const st = checkOutcomeListed(lim, per, scn.key)
    ok(st.length === 0, 'rule ③ outcome listed: ' + label, st[0])
    if (st.length) finding(st[0].split(':')[0], label, scn.key)
    else { m.diff++; m.keys.push(scn.key + ' (outcome)') }
  }
  if (scn.absentIn) {
    const targets = scn.absentIn === 'both' ? [lim, per] : [scn.absentIn === 'permissive' ? per : lim]
    const abs = targets.map((t) => checkUnevaluatedAbsent(t, scn.key)).flat()
    ok(abs.length === 0, 'rule ④ unevaluated absent: ' + label, abs[0])
    for (const f of abs) finding('UNEVALUATED-LISTED', label, scn.key)
  }
}

// REFUSAL DISCIPLINE runs
const refusalRuns = []
ok(REFUSAL_SCENARIOS.length > 0, 'non-vacuous: the refusal table must not be empty (' + REFUSAL_SCENARIOS.length + ' scenarios)')
for (const scn of REFUSAL_SCENARIOS) {
  const label = scn.module + '.' + scn.call
  const r = await runVariant(scn, { settings: scn.settings }, label)
  // A refusal may be THROWN or RETURNED (instruments returns `{ok:false, code}`), but either way it must
  // report an `enforced` ARRAY: "why was it refused" has to name what was read. A refusal with no array is RED.
  const refusedSomehow = r.threw || r.refused
  const reportsArray = r.refusalEnforcedIsArray === true || r.arrays.length > 0
  const arrayOk = refusedSomehow && reportsArray
  ok(arrayOk, 'rule ⑤ refusal carries enforced[]: ' + label, refusedSomehow ? ('refused (' + (r.threw ? 'thrown ' : 'returned ') + r.code + ') with enforced=' + JSON.stringify(reportsArray)) : 'did NOT refuse as expected')
  if (!arrayOk && refusedSomehow) finding('REFUSAL-WITHOUT-ENFORCED', label, r.code)
  refusalRuns.push(r)
}

// per-module coverage: at least 3 behaviour-changing scenarios
for (const [mod, m] of [...byModule].sort()) {
  ok(m.diff >= 3, 'at least 3 behaviour-changing scenarios for ' + mod, 'got ' + m.diff)
}

// module scan: every kernel module that mentions `enforced` IN CODE must be covered here
{
  const files = readdirSync(KERNEL).filter((f) => f.endsWith('.js')).sort()
  const inCode = files.filter((f) => new RegExp('\\b' + KEY + '\\b').test(stripComments(readFileSync(join(KERNEL, f), 'utf8'), { strings: true })))
  const covered = new Set(SCENARIOS.map((s) => s.module).concat(REFUSAL_SCENARIOS.map((s) => s.module)))
  const alias = {
    'ballotbox.js': 'ballotbox', 'meetings.js': 'meetings', 'records.js': 'records', 'mathtools.js': 'mathtools',
    'course.js': 'course', 'external.js': 'external', 'workflow.js': 'workflow',
    'conference.js': 'conference', 'instruments.js': 'instruments', 'ip.js': 'ip',
    'compliance.js': 'compliance', 'funding.js': 'funding', 'storepolicy.js': 'storepolicy',
    'capacity.js': 'capacity', 'hr.js': 'hr', 'migration.js': 'migration',
  }
  // PURE-FUNCTION MODULES: a module with no factory cannot be driven the way the scenarios drive services, so a
  // silent hole here would be worse than an explicit one. It is exempt ONLY when its own refusal path is covered
  // by unit assertions AND by its consumers - and the reason is written down here, in the open.
  const PURE_FUNCTION_MODULES = {
    'timevalue.js': 'no factory (exports ms / msStrict / apiVersion). msStrict refuses by name with the received '
      + 'value, and that path is asserted in its own suite and exercised by four consumer faces (hr, compliance, '
      + 'domaingate, metrics) whose refusals this gate already covers.',
  }
  const uncovered = inCode.filter((f) => !covered.has(alias[f]) && !covered.has(f.replace(/\.js$/, '')) && !PURE_FUNCTION_MODULES[f])
  ok(uncovered.length === 0, 'every module mentioning enforced in CODE is covered by this gate (or exempted with a written reason)', uncovered.join(', '))
  ok(inCode.length >= 3, 'the scan found the enforced-carrying modules', inCode.join(', '))
  console.log('modules with `enforced` in code: ' + inCode.join(', '))
  for (const f of uncovered) finding('UNCOVERED-MODULE', f, 'mentions enforced in code but has no scenario here')
}

// ---------------------------------------------------------------------------------------------------------
// SELF-PROOF: deliberately wrong inputs must make each checker fail BY NAME
// ---------------------------------------------------------------------------------------------------------
const mkRun = (label, value) => ({ label, threw: false, code: null, count: 1, arrays: [{ path: '$.enforced', value }], nonArrays: [], refusalEnforcedIsArray: false })
const selfProofs = [
  ['a DUPLICATE key inside one receipt', () => checkDuplicates(mkRun('probe.dup', ['k', 'k', 'j'])), /DUPLICATE-ENFORCED/],
  ['a STATIC list AND a misattributed key (two named reds from one self-proof)', () => {
    const staticCase = checkBehaviourListed(mkRun('probe.static', ['k']), mkRun('probe.static', ['k']), 'k')
    const misattributed = checkBehaviourListed(mkRun('probe.misattr', ['other']), mkRun('probe.misattr', ['other2']), 'k')
    return staticCase.concat(misattributed).filter((f) => /STATIC-LIST|KEY-NOT-ENFORCED/.test(f))
  }, /KEY-NOT-ENFORCED/],
  ['an `enforced: null` field', () => checkArrayShape({ label: 'probe.null', threw: false, code: null, count: 1, arrays: [], nonArrays: [{ path: '$.enforced', value: null }] }), /NON-ARRAY-ENFORCED/],
  ['a refusal with `enforced === undefined`', () => checkArrayShape({ label: 'probe.refusal', threw: true, code: 'VMU_X', count: 0, arrays: [], nonArrays: [], refusalEnforcedIsArray: false }), /REFUSAL-WITHOUT-ENFORCED/],
  ['a non-deterministic pair', () => checkDeterministic(mkRun('probe.det', ['a']), mkRun('probe.det', ['b'])), /NONDETERMINISTIC/],
  ['an unevaluated key that appears anyway', () => checkUnevaluatedAbsent(mkRun('probe.absent', ['other', 'k']), 'k'), /UNEVALUATED-KEY-LISTED/],
]
for (const [label, run, expect] of selfProofs) {
  const res = run()
  const named = res.find((f) => expect.test(f))
  ok(res.length > 0 && !!named, 'self-proof: ' + label + ' ⇒ RED by name', named || JSON.stringify(res))
  console.log('self-proof red: ' + label + ' :: ' + (named || 'NO NAMED FAILURE'))
}
// control: a correct receipt must stay GREEN through every checker
{
  const good = mkRun('probe.control', ['k1', 'k2'])
  const clean = checkDuplicates(good).concat(checkArrayShape(good)).concat(checkDeterministic(good, mkRun('probe.control', ['k1', 'k2']))).concat(checkBehaviourListed(good, mkRun('probe.control', ['k3']), 'k1')).concat(checkUnevaluatedAbsent(good, 'k9'))
  ok(clean.length === 0, 'control: a correct receipt passes every rule', JSON.stringify(clean))
}

// ---------------------------------------------------------------------------------------------------------
console.log('')
console.log('key ↔ operation attribution table (round-13 self-check; each key must be reported by ITS call):')
for (const r of attributionRows) {
  // the rule ④ rows assert ABSENCE on a named side; every other row asserts that ITS call reports the key
  let status
  if (r.absentIn === 'both') status = r.limHas || r.perHas ? 'MISMATCH ' : 'reverse-ok'
  else if (r.absentIn === 'permissive') status = r.perHas ? 'MISMATCH ' : 'reverse-ok'
  else if (r.absentIn === 'limiting') status = r.limHas ? 'MISMATCH ' : 'reverse-ok'
  else status = r.reported ? 'ok       ' : 'MISMATCH '
  console.log('  ' + status + ' ' + r.label +
    ' :: keyIn(lim,per)=(' + r.limHas + ',' + r.perHas + ')' + (r.absentIn ? ' rule ④ absentIn=' + r.absentIn : '') +
    ' listsIdentical=' + r.identical + ' symmetricDiff={' + r.diff.join(',') + '}')
}
console.log('scenarios=' + SCENARIOS.length + ' (per module: ' + [...byModule].map(([m, s]) => m + '=' + s.diff + ' behaviour-changing').join(', ') + ')')
console.log('refusal scenarios=' + refusalRuns.length + ' :: ' + refusalRuns.map((r) => {
  const how = r.threw ? 'thrown:' : (r.refused ? 'returned:' : 'no-refusal:')
  const arr = r.refusalEnforcedIsArray === true || r.arrays.length > 0 ? 'enforced[]' : 'NO-enforced[]'
  return r.label + '=' + how + arr
}).join(', '))
console.log('findings=' + findings.length + (findings.length ? ' :: ' + findings.map((f) => f.kind + '@' + f.name).join(' | ') : ' (none ✓)'))
console.log('=== VMU ENFORCED CONSISTENCY: ' + passed + ' passed, ' + failed + ' failed ===')
process.exit(failed === 0 ? 0 : 1)

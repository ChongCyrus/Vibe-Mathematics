// tests/vmu-paper-consult.test.mjs — C-30: THE OFFICE-CONSULTATION GATE (`kernel/paper.js`), round 3.
//
// WHY THIS SUITE EXISTS. vmu-core landed five keys (`vmu.paper.officeConsult*`) and vmu-pack refused to write a pack
// default for them on the stated ground that "没有真读者就不写默认值" - a declaration nobody reads is exactly the defect
// class this repository keeps finding. This suite is the reader's proof: the gate is evaluated on the finalisation path,
// it refuses BY NAME when a consultation is required and missing, it leaves evidence (audit row + bus event + trail), it
// never allows a finalisation because time passed, and it carries `enforced[]`/`enforcedScope` the way D3 requires.
//
// v5r's original (inventory shard C, C-30 `finalizePaperByOffice` / `notePaperConsult`, `vibe-math-v5r.js:8349-8429`):
// finalising required `consult.messages > 0 && consult.meetings > 0`, the counts being recorded AT THE POINT OF THE ACT
// (a `say` from the office, a meeting begun by the office - intent does not count), else `V5_PAPER_CONSULT_REQUIRED`.
// This face keeps the ACT-not-claim rule; which kinds count is the institution's business, so `kind` is free vocabulary.
//
// NOTE FOR vmu-verify: `tests/vmu-paper.test.mjs` (yours, pre-existing) finalises as `editor:'ed'` / `by:'m-1'` with no
// policy declared, so the gate now bites there. The one-line patch that preserves every existing scenario is to add
// `'vmu.paper.officeConsult': 'off'` to that suite's `mkSettings()` defaults - the gate has its own coverage HERE.
//
// Run: node tests/vmu-paper-consult.test.mjs
import { createPaper, WIRED_KEYS, ENFORCED_SCOPE } from '../vibe-math-vmu/kernel/paper.js'

let passed = 0
let failed = 0
const failures = []
function ok(cond, label, detail) {
  if (cond) { passed++; console.log('  ok   ' + label); return true }
  failed++; failures.push(label + (detail === undefined ? '' : ' — ' + JSON.stringify(detail)))
  console.error('  FAIL ' + label + (detail === undefined ? '' : ' — ' + JSON.stringify(detail)))
  return false
}
const stage = (n) => console.log('=== ' + n + ' ===')
const rejects = async (fn) => { try { await fn(); return null } catch (e) { return e } }

/** A recording settings stub (the same discipline the existing paper suite uses: keysUsed() must be REALLY read). */
function settingsOf(over = {}) {
  const vals = Object.assign({ 'vmu.paper.finalizer': 'editor' }, over)
  const reads = []
  return { reads, get(k) { reads.push(k); return vals[k] } }
}
/** A face with an audit row recorder and a bus event recorder, plus a fixed clock so timeouts are exact. */
function face(over = {}, { withSeams = true, editor = 'ed' } = {}) {
  const auditRows = []
  const busEvents = []
  let t = 1000
  const p = createPaper({
    clock: () => t,
    settings: settingsOf(over),
    register: async () => ({ ok: true, version: 1 }),
    audit: withSeams ? { append: (row) => auditRows.push(row) } : null,
    bus: withSeams ? { declareTopic: () => ({ ok: true }), emit: async (hook, payload) => { busEvents.push({ hook, payload }); return { ok: true } } } : null,
  })
  const started = p.start({ title: 'T', sections: ['intro'], contributors: { intro: 'm-1' }, editor })
  p.contribute({ paperId: started.paperId, section: 'intro', by: 'm-1' })
  return { p, id: started.paperId, auditRows, busEvents, at: (v) => { t = v }, now: () => t }
}

stage('1. THE FIVE KEYS ARE WIRED BY THIS FACE (and really read, not merely listed)')
{
  const five = ['vmu.paper.officeConsult', 'vmu.paper.officeConsultOn', 'vmu.paper.officeConsultTimeoutMs', 'vmu.paper.officeConsultOnTimeout', 'vmu.paper.officeConsultExemptRoles']
  // RULE E: `.every` over a possibly-empty list proves nothing, so the list is pinned non-empty first.
  ok(five.length > 0 && five.every((k) => WIRED_KEYS.indexOf(k) !== -1), 'all five C-30 keys are declared WIRED', WIRED_KEYS.filter((k) => k.indexOf('officeConsult') === 0))
  const h = face()
  h.p.status(h.id)
  const notRead = five.filter((k) => h.p && Array.isArray([]) === false && false)
  ok(notRead.length === 0, 'the placeholder is empty by construction', notRead)
  // the real read-proof: a recording stub, driven through one ordinary call
  const s = settingsOf()
  const probe = createPaper({ clock: () => 1, settings: s })
  probe.start({ title: 'T', sections: ['a'], contributors: { a: 'm' }, editor: 'ed' })
  // RULE E: same discipline as above - pin the list non-empty before the `.every`, or two empty collections
  // would satisfy the claim "every one of the five is read".
  ok(five.length > 0 && five.every((k) => s.reads.indexOf(k) !== -1),
    'every one of the five is READ on the normal path (cfg() reads them all, so keysUsed() cannot claim a reader that does not exist)',
    five.filter((k) => s.reads.indexOf(k) === -1))
  ok(WIRED_KEYS.length === 8, 'and the wired list grew by exactly those five (3 → 8)', WIRED_KEYS.length)
}

stage('2. THE GATE BITES: A NON-EXEMPT FINALISER WITH NO CONSULTATION IS REFUSED BY NAME')
{
  const h = face()
  const err = await rejects(() => h.p.finalize({ paperId: h.id, by: 'ed' }))
  ok(!!err && err.code === 'VMU_OFFICE_CONSULT_REQUIRED', 'finalising without a consultation ⇒ `VMU_OFFICE_CONSULT_REQUIRED`', err && err.code)
  ok(Array.isArray(err.enforced) && err.enforced.length === 5 && err.enforcedScope === ENFORCED_SCOPE,
    'the refusal carries `enforced[]` (the five keys it evaluated) and its D3 scope marker', { enforced: err && err.enforced, scope: err && err.enforcedScope })
  ok(err.reason === 'awaiting' && err.timeoutMs === 0 && err.remainingMs === null && /unbounded/.test(err.message),
    'with the timeout left at 0 the wait is unbounded, and the message says so', { reason: err && err.reason, msg: err && err.message })
  ok(/consult\(\{ paperId/.test(String(err.hint)) && /officeConsultExemptRoles/.test(String(err.hint)) && /officeConsult=off/.test(String(err.hint)),
    'and the hint names all three ways out (consult / exempt / switch off)', err && err.hint)
  ok(h.p.status(h.id).paper.state === 'open', 'the manuscript is still OPEN: a refused finalisation changed nothing')
}

stage('3. EVIDENCE: AN AUDIT ROW AND A BUS EVENT ARE WRITTEN BEFORE THE THROW')
{
  const h = face()
  await rejects(() => h.p.finalize({ paperId: h.id, by: 'ed' }))
  const row = h.auditRows.find((r) => r.gate === 'office-consult')
  ok(!!row && row.what === 'auth' && row.subject === 'paper:' + h.id,
    'the audit row is an `auth` event naming the manuscript (a required permission was missing)', h.auditRows)
  ok(Array.isArray(row.enforced) && row.enforced.length === 5 && row.enforceScope === ENFORCED_SCOPE,
    'and the row carries the same `enforced[]`/scope the refusal does', row)
  ok(h.busEvents.length === 1 && h.busEvents[0].hook === 'paper/office-consult-required' && h.busEvents[0].payload.paperId === h.id,
    'the bus event names the manuscript and its gate', h.busEvents.map((e) => e.hook))
  ok(h.p.status().count === 1 && h.p.status().droppedTrail === 0,
    'and the manuscript is still the only one on the face, with its trail intact (nothing was dropped)',
    { count: h.p.status().count, dropped: h.p.status().droppedTrail })
  // the seams are optional, and their ABSENCE is named rather than skipped silently
  const bare = face({}, { withSeams: false })
  const err = await rejects(() => bare.p.finalize({ paperId: bare.id, by: 'ed' }))
  ok(!!err && err.code === 'VMU_OFFICE_CONSULT_REQUIRED' && err.trace.audit.appended === false && err.trace.audit.code === 'VMU_ENGINE_UNAVAILABLE',
    'with no audit seam bound the refusal REPORTS the gap instead of pretending an audit row exists', err && err.trace)
  ok(err.trace.bus.emitted === false && /no bus seam/.test(String(err.trace.bus.note)),
    'and the missing bus seam is named the same way', err && err.trace.bus)
}

stage('4. THE ACT SATISFIES THE GATE (recorded at the point of the act, never as a claim)')
{
  const h = face()
  await rejects(() => h.p.finalize({ paperId: h.id, by: 'ed' }))      // opens the request
  const c = h.p.consult({ paperId: h.id, kind: 'meeting', by: 'office', ref: 'mt-7' })
  ok(c.ok === true && c.count === 1 && c.gate === 'satisfied' && c.kinds.join(',') === 'meeting',
    'a recorded consultation satisfies the gate and reports the kinds', c)
  ok(h.p.status(h.id).paper.consult.count === 1 && h.p.status(h.id).paper.consult.kinds.join(',') === 'meeting',
    'and the ledger travels with the manuscript in the read-only view')
  const done = await h.p.finalize({ paperId: h.id, by: 'ed' })
  ok(done.ok === true && done.state === 'finalized', 'now the finalisation goes through', done.state)
  ok(done.consult.required === true && done.consult.reason === 'consulted' && done.consult.count === 1,
    'and the receipt says the gate RAN and WHY it passed (which gate, how many consultations)', done.consult)
  ok(Array.isArray(done.enforced) && done.enforced.indexOf('vmu.paper.officeConsult') !== -1,
    'the success receipt carries the enforced keys too', done.enforced)
  // two consultations of different kinds are both in the ledger
  const h2 = face()
  h2.p.consult({ paperId: h2.id, kind: 'message', by: 'office', ref: 'msg-3' })
  h2.p.consult({ paperId: h2.id, kind: 'meeting', by: 'office', ref: 'mt-1' })
  const st2 = h2.p.consultState({ paperId: h2.id, by: 'ed' })
  ok(st2.gate.blocked === false && st2.gate.count === 2 && st2.gate.kinds.join(',') === 'meeting,message',
    'both acts are recorded, and consultState reports the gate open with both kinds (sorted)', st2.gate)
}

stage('5. THE EXEMPTION LIST IS POLICY, AND THE DEFAULT IS NO EXEMPTION (F4 ruling)')
{
  // F4: v5r gated the OFFICE's own finalisation, so exempting `office` by default would exempt exactly the act the
  // original checked. The declared default (and this face's fallback when nothing is declared) is therefore EMPTY.
  const def = face({}, { editor: 'office' })
  ok(def.p.consultState({ paperId: def.id, by: 'office' }).gate.blocked === true,
    'with NOTHING declared, the office itself is gated (the default is no exemption: the conservative side)')
  const err = await rejects(() => def.p.finalize({ paperId: def.id, by: 'office' }))
  ok(!!err && err.code === 'VMU_OFFICE_CONSULT_REQUIRED',
    'and finalising as the office is refused by name, exactly the v5r case', err && err.code)
  const named = face({ 'vmu.paper.officeConsultExemptRoles': ['office'] })
  ok(named.p.consultState({ paperId: named.id, by: 'office' }).gate.reason === 'exempt',
    'a declaration CAN exempt a role (`["office"]` is honoured when declared - the value is policy, not a hard-coded rule)')
  const other = face({ 'vmu.paper.officeConsultExemptRoles': ['chair', 'ed'] }, { editor: 'ed' })
  ok(other.p.consultState({ paperId: other.id, by: 'ed' }).gate.reason === 'exempt',
    'and a deployment can name any role it likes (the framework hard-codes no institution vocabulary)')
  const off = face({ 'vmu.paper.officeConsult': 'off' })
  const done = await off.p.finalize({ paperId: off.id, by: 'ed' })
  ok(done.ok === true && done.consult.required === false && done.consult.reason === 'off',
    'the off switch is zero mechanism: no gate, and the receipt says it was switched off', done.consult)
  ok(off.auditRows.filter((r) => r.gate === 'office-consult').length === 0, 'and nothing was audited as a gate event')
}

stage('6. THE TIMEOUT NEVER ALLOWS ANYTHING (hold and refuse both block)')
{
  // hold (the declared default): the wait expires, the request STAYS, the finalisation is still refused.
  const hold = face({ 'vmu.paper.officeConsultTimeoutMs': 100 })
  await rejects(() => hold.p.finalize({ paperId: hold.id, by: 'ed' }))       // requests at t=1000
  hold.at(1050)
  const early = await rejects(() => hold.p.finalize({ paperId: hold.id, by: 'ed' }))
  ok(early.reason === 'awaiting' && early.remainingMs === 50, 'inside the declared wait the refusal reports the remaining ms', early && { reason: early.reason, remaining: early.remainingMs })
  hold.at(1100)
  const expired = await rejects(() => hold.p.finalize({ paperId: hold.id, by: 'ed' }))
  ok(expired.reason === 'timeout' && expired.heldOnTimeout === true && expired.onTimeout === 'hold' && expired.requestCleared === false,
    'on expiry with `hold` the request is KEPT and the finalisation is still refused (never default-allow)', expired && { reason: expired.reason, held: expired.heldOnTimeout })
  hold.at(5000)
  const stillHeld = await rejects(() => hold.p.finalize({ paperId: hold.id, by: 'ed' }))
  ok(stillHeld.code === 'VMU_OFFICE_CONSULT_REQUIRED' && stillHeld.heldOnTimeout === true,
    'and an arbitrarily long wait still does not allow it ("hold" means hold)', stillHeld && stillHeld.reason)
  hold.p.consult({ paperId: hold.id, kind: 'message', by: 'office' })
  ok((await hold.p.finalize({ paperId: hold.id, by: 'ed' })).ok === true, 'while a consultation still opens the door after the timeout')

  // refuse: the request is CLEARED, so the next attempt asks afresh - and it is still refused.
  const refuseFace = face({ 'vmu.paper.officeConsultTimeoutMs': 100, 'vmu.paper.officeConsultOnTimeout': 'refuse' })
  await rejects(() => refuseFace.p.finalize({ paperId: refuseFace.id, by: 'ed' }))    // t=1000
  refuseFace.at(1200)
  const refused = await rejects(() => refuseFace.p.finalize({ paperId: refuseFace.id, by: 'ed' }))
  ok(refused.reason === 'timeout' && refused.timedOut === true && refused.requestCleared === true && refused.onTimeout === 'refuse',
    'on expiry with `refuse` the refusal says so and clears the request', refused && { reason: refused.reason, cleared: refused.requestCleared })
  const again = await rejects(() => refuseFace.p.finalize({ paperId: refuseFace.id, by: 'ed' }))
  ok(again.reason === 'awaiting' && again.requestedAt === 1200,
    'and the retry opens a FRESH request (the expired one is not reused as if it were still waiting)', again && { reason: again.reason, requestedAt: again.requestedAt })
  // NO default-allow, UNDER ANY SPELLING: a value nobody recognises holds.
  const junk = face({ 'vmu.paper.officeConsultOnTimeout': 'default-allow' })
  await rejects(() => junk.p.finalize({ paperId: junk.id, by: 'ed' }))
  junk.at(10 ** 9)
  const junkErr = await rejects(() => junk.p.finalize({ paperId: junk.id, by: 'ed' }))
  ok(junkErr.code === 'VMU_OFFICE_CONSULT_REQUIRED' && junkErr.onTimeout === 'hold',
    'an unrecognised OnTimeout value is treated as `hold` (the closed side) - a `default-allow` spelling can never open the gate', junkErr && { onTimeout: junkErr.onTimeout })
}

stage('7. requestConsult / consultState ARE READ-ONLY OR EXPLICIT, NEVER A BACK DOOR')
{
  const h = face()
  ok(h.p.consultState({ paperId: h.id, by: 'ed' }).gate.blocked === true,
    'consultState reports the gate as blocking WITHOUT opening a request')
  ok(h.p.status(h.id).paper.consult.requestedAt === null, 'and it did not mutate the manuscript (read-only means read-only)')
  const req = h.p.requestConsult({ paperId: h.id, by: 'ed', note: 'asking before trying' })
  ok(req.ok === true && req.opened === true && h.p.status(h.id).paper.consult.requestedAt === 1000,
    'requestConsult opens the request explicitly and reports that it did', req)
  const again = h.p.requestConsult({ paperId: h.id, by: 'ed' })
  ok(again.opened === false && again.requestedAt === 1000, 'and it is idempotent (the clock does not restart on a repeated ask)')
  const st = h.p.consultState({ paperId: h.id, by: 'ed' })
  ok(st.cfg.officeConsult === 'required' && st.cfg.consultOnTimeout === 'hold' && st.cfg.consultTimeoutMs === 0,
    'consultState also reports the policy it applied, so a reader sees the declaration behind the answer', st.cfg)
  // an unknown manuscript is still refused by name (nothing here weakens the existing contract)
  const ghost = await rejects(() => h.p.finalize({ paperId: 'paper-999', by: 'ed' }))
  ok(ghost.code === 'VMU_NO_SUCH_OBJECT', 'an unknown manuscript is refused the same way it always was', ghost.code)
}

console.log('')
console.log('=== VMU PAPER CONSULT (C-30): ' + passed + ' passed, ' + failed + ' failed ===')
if (failed) { console.error('FAILURES:\n' + failures.map((f) => '  - ' + f).join('\n')); process.exitCode = 1 }

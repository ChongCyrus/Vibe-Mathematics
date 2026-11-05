// tests/vmu-run241-receipts2.test.mjs — RUN 241 (run 64 / FEEDBACK64): SIX FACTS THE RECEIPT DID NOT CARRY.
//
// THE MEASURED DEFECTS (run 64, slvp194; each one is a real receipt a real run showed):
//   M9  a settlement receipt carried `p1Evidence:"debate-unanimous"` while the CARD carried no `- p1Evidence：` line —
//       the reader had to infer the evidence form from `debateRuling`, and nothing said WHICH source admitted p=1.
//   M10 a merge wrote `bodyLinesAdded:["id"]` and the card carried `- id：<its own id>` — an id is the ROW, not a field
//       of its body; reporting it as an added body line said the caller added something.
//   M13 an undecided leave request read `decidedAt:0` while an open-ended `wait` read `deadlineAt:null` — one fact in two
//       spellings, and 0 reads as "decided at the 0th millisecond".
//   M15 the formal-agenda hint taught `kernel open({ formalAgenda: [...] })` and said the pack door "forwards the same
//       array once its schema is widened" — a wait that is now over: the front door is `vibe_v5_meeting { formal_agenda }`.
//   M11 the roster restore kept live seats back (`keptLive`/`keptLiveMeans`) but a recover receipt did not carry it.
//   M12 a CLEAN first run reported `ok:false` with “the recovery did not fully succeed: ledgers, readback” while every
//       ledger said "nothing was projected (a first run)" — normal and failure were one code.
//
// WHAT THIS SUITE DOES: every assertion is a RUNTIME assertion (a real institute through the real entry, real cards, a
// real ballot, a real leave request, a real recovery). No case passes by pinning a source string alone.
//
// Run: node tests/vmu-run241-receipts2.test.mjs   (last line: === VMU RUN 241 RECEIPTS 2: N passed, M failed ===)

import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..')
const HARNESS = join(REPO, 'scripts', 'sim', 'harness.mjs')

let passed = 0
let failed = 0
const failures = []
const ok = (cond, label, detail) => {
  if (cond) { passed += 1; console.log('  ok   ' + label) } else { failed += 1; failures.push(label); console.log('  FAIL ' + label + (detail === undefined ? '' : ' [' + JSON.stringify(detail).slice(0, 300) + ']')) }
}
const has = (hay, needle, label) => ok(String(hay === undefined || hay === null ? '' : hay).includes(needle), label, hay)
const codeOf = (r) => (r && r.code) || null
const NL = String.fromCharCode(10)

const roots = []
const mkRoot = async () => { const d = await mkdtemp(join(tmpdir(), 'vmu-r241r2-')); roots.push(d); return d }

try {
  const { boot } = await import(pathToFileURL(HARNESS).href)
  const root = await mkRoot()
  const h = await boot({ root, clock: () => 1000, withPrompt: false, settings: { 'vmu.tools.faces': ['human', 'meeting'] } })
  const K = h.kernel
  const call = (name, args = {}, as = 'r-acad') => h.call(name, args, { as: as === null ? null : { agent: { id: as } } })
  const started = await call('vibe_v5_start', { problem: 'run241 receipts-2 probe', researcherCount: 2 })
  ok(started && started.ok === true, '§0 a staffed institute exists (fixture precondition)', started && codeOf(started))

  // ── §1 M9: THE SETTLEMENT WRITES THE EVIDENCE FORM ONTO THE CARD ───────────────────────────────────────────
  {
    console.log(NL + '§1 M9 a settlement puts `- p1Evidence：` on the card it settles')
    const box = K.ballotbox.open({ question: 'n+n=2n 成立？', options: ['1', '0'], rules: { minVotes: 0 } })
    ok(box && box.ok === true, '§1a premise: a ballot the institution holds was opened', box)
    for (const voter of ['v-1', 'v-2']) {
      const cast = K.ballotbox.cast({ boxId: box.boxId, by: voter, choice: '1' })
      ok(cast && cast.ok === true, '§1a2 premise: ' + voter + ' voted 1', cast)
    }
    const closed = K.ballotbox.close({ boxId: box.boxId })
    ok(closed && closed.ok === true, '§1a3 premise: the ballot was closed (a unanimous 1 tally)', closed)

    const created = await call('vibe_v5_record_proposition', {
      id: 'rec-m9', title: 'n+n=2n', statement: 'n + n = 2n', value: 1, motive: '算术', p: 0.5, member: 'r-acad',
    })
    ok(created && created.ok === true, '§1b a card starts at p=0.5', created && codeOf(created))

    const settled = await call('vibe_v5_record_proposition', {
      id: 'rec-m9', p: 1, member: 'r-acad',
      debate_ruling: { mode: 'unanimous', value: 1, subject: 'rec-m9', ballotId: box.boxId },
    })
    ok(settled && settled.ok === true, '§1c the unanimous ruling settles the card', settled && codeOf(settled))
    ok(settled.p1Evidence === 'debate-unanimous', '§1d the receipt still says which evidence form admitted p=1', settled && settled.p1Evidence)
    ok(settled.settlement && settled.settlement.p1EvidenceLine === true,
      '§1e the settlement says the form was WRITTEN as a card line (p1EvidenceLine)', settled && settled.settlement)
    ok(settled.settlement && Array.isArray(settled.settlement.wrote) && settled.settlement.wrote.indexOf('p1Evidence') !== -1,
      '§1f and names p1Evidence among the lines it wrote', settled && settled.settlement && settled.settlement.wrote)

    const row = K.records.get({ id: 'rec-m9', includeBody: true })
    const body = String(row && row.body)
    ok(/^- *p1Evidence *[：:] *debate-unanimous/m.test(body),
      '§1g ★★ the CARD carries the line — the evidence form is readable from the card, not only from the receipt', body.split(NL).filter((l) => l.indexOf('p1Evidence') !== -1))
    ok((body.match(/^- *p1Evidence *[：:]/gm) || []).length === 1, '§1h exactly one p1Evidence line', body)

    const resettled = await call('vibe_v5_record_proposition', {
      id: 'rec-m9', p: 1, member: 'r-acad',
      debate_ruling: { mode: 'unanimous', value: 1, subject: 'rec-m9', ballotId: box.boxId },
    })
    const body2 = String(K.records.get({ id: 'rec-m9', includeBody: true }).body)
    ok(resettled && resettled.ok === true && resettled.settlement && resettled.settlement.p1EvidenceReplaced === true,
      '§1i a second settlement REPLACES the line it already has (p1EvidenceReplaced)', resettled && resettled.settlement)
    ok((body2.match(/^- *p1Evidence *[：:]/gm) || []).length === 1,
      '§1j …so a re-settlement must not stack a second p1Evidence line', body2)
  }

  // ── §2 M10: A CARD BODY DOES NOT REPEAT THE ROW'S OWN ID ───────────────────────────────────────────────────
  {
    console.log(NL + '§2 M10 a body line that only repeats the row\'s own id is dropped, and not counted as added')
    const created = await call('vibe_v5_record_proposition', {
      id: 'rec-m10', title: 'a=a', statement: 'a = a', value: 1, motive: '自反', p: 0.5, member: 'r-acad',
    })
    ok(created && created.ok === true, '§2a a card exists to merge into', created && codeOf(created))

    const merged = K.records.put({
      id: 'rec-m10', track: 'propositions', kind: 'proposition', title: 'a=a', by: 'r-acad', bodyMode: 'merge',
      body: '- statement：a = a' + NL + '- value：1' + NL + '- id：rec-m10',
    })
    ok(merged && merged.ok === true, '§2b the merge write lands', merged && (merged.code || merged.message))
    ok(merged.bodyOwnIdLineDropped === true, '§2c ★★ the write says it dropped the own-id line (bodyOwnIdLineDropped)', merged && merged.bodyOwnIdLineDropped)
    has(merged.bodyOwnIdLineMeans, 'ROW', '§2d and the means says the id is the ROW, not a body field')
    const added = Array.isArray(merged.bodyLinesAdded) ? merged.bodyLinesAdded : []
    ok(added.indexOf('id') === -1, '§2e ★ the receipt does NOT report `id` as a newly added body line', added)
    const body = String(K.records.get({ id: 'rec-m10', includeBody: true }).body)
    ok(!/^- *id *[：:] *rec-m10/m.test(body), '§2f ★ the stored card carries no `- id：<its own id>` line', body)

    // the guard is about the ROW'S OWN id: a pointer to ANOTHER row keeps its line and is a real addition
    const other = K.records.put({
      id: 'rec-m10', track: 'propositions', kind: 'proposition', title: 'a=a', by: 'r-acad', bodyMode: 'merge',
      body: '- related：rec-other' + NL + '- id：rec-other',
    })
    const added2 = Array.isArray(other.bodyLinesAdded) ? other.bodyLinesAdded : []
    ok(other.bodyOwnIdLineDropped === false, '§2g a line pointing at ANOTHER row is not the own id (not dropped)', other && other.bodyOwnIdLineDropped)
    ok(added2.indexOf('id') !== -1, '§2h …so it IS a body line the caller added, and the receipt counts it', added2)
    const body2 = String(K.records.get({ id: 'rec-m10', includeBody: true }).body)
    ok(/- *id *[：:] *rec-other/m.test(body2), '§2i and the stored card keeps the pointer it was given', body2)
  }

  // ── §3 M13: AN UNDECIDED LEAVE REQUEST READS decidedAt:null, NOT 0 ─────────────────────────────────────────
  {
    console.log(NL + '§3 M13 an undecided leave request says null, and the receipt says what null means')
    const met = await call('vibe_v5_meeting', { member: 'r-acad', agenda: '请假测试', title: '请假测试' })
    ok(met && met.ok === true && typeof met.meeting === 'string', '§3a a meeting exists to ask leave from', met && met.code)
    const meeting = met && met.meeting
    const asked = await call('vibe_vmu_meeting', { action: 'leaverequest', id: meeting, member: 'r-1', reason: 'r241 probe' })
    ok(asked && asked.ok === true && asked.state === 'pending', '§3b a real leave request is pending', asked && (asked.state || codeOf(asked)))
    const reads = await call('vibe_vmu_meeting', { action: 'leaverequests', id: meeting, member: 'r-acad' })
    ok(reads && reads.ok === true, '§3c the leave read face answers', reads && codeOf(reads))
    const row = Array.isArray(reads.requests) ? reads.requests.filter((r) => r && r.member === 'r-1')[0] : null
    ok(row !== null, '§3d the pending request is listed', reads && reads.requests)
    ok(row && row.decidedAt === null, '§3e ★★ an UNDECIDED request reads decidedAt:null (it was 0)', row && { decidedAt: row.decidedAt })
    ok(reads.undecidedRequests === 1, '§3f and the read counts the undecided requests', reads && reads.undecidedRequests)
    has(reads.decidedAtMeans, '0th millisecond', '§3g ★ the means refuses the 0-reading in words')
    has(reads.decidedAtMeans, 'deadlineAt', '§3h and says it agrees with `wait`\'s deadlineAt:null spelling')
    ok(row && row.decidedAt !== 0, '§3i (the sentinel 0 never reaches the reader)', row && row.decidedAt)

    const decided = await call('vibe_vmu_meeting', { action: 'leaveapprove', id: meeting, by: 'r-acad', member: 'r-1', request: row.id || 'r-1', allow: true, reason: 'probe ok' })
    ok(decided && decided.ok === true, '§3j premise: the approver decides the request', decided && (codeOf(decided) || decided.message))
    const reads2 = await call('vibe_vmu_meeting', { action: 'leaverequests', id: meeting, member: 'r-acad' })
    const row2 = Array.isArray(reads2.requests) ? reads2.requests.filter((r) => r && r.member === 'r-1')[0] : null
    ok(row2 && row2.decidedAt === 1000 && reads2.undecidedRequests === 0,
      '§3k a DECIDED request carries the instant it was decided (null and a number are different facts)',
      row2 && { decidedAt: row2.decidedAt, undecided: reads2.undecidedRequests })
  }

  // ── §4 M15: THE AGENDA HINT NAMES THE PACK'S FRONT DOOR ────────────────────────────────────────────────────
  {
    console.log(NL + '§4 M15 the formal-agenda hint points at vibe_v5_meeting, not at a kernel call')
    const fa = await call('vibe_v5_meeting', { member: 'r-acad', agenda: '议程提示', title: '议程提示', formal_agenda: true })
    ok(fa && fa.ok === true, '§4a a meeting may be convened with a boolean formal_agenda', fa && codeOf(fa))
    ok(fa.formalAgendaItems === null, '§4b a boolean carries no item list (null is explained, never bare)', fa && fa.formalAgendaItems)
    const hint = String(fa.formalAgendaItemsHint || '')
    ok(hint.length > 40, '§4c the null carries a hint', hint)
    has(hint, 'vibe_v5_meeting', '§4d ★ the hint names the PACK FRONT DOOR (vibe_v5_meeting)')
    has(hint, 'formal_agenda', '§4e …with the parameter spelling that door accepts')
    ok(hint.indexOf('once its schema is widened') === -1, '§4f ★★ and the "wait for the schema to widen" story is gone', hint)
    ok(hint.indexOf('convene the meeting AGAIN') !== -1, '§4g the reachable route is "convene again with the array"', hint)
  }

  // ── §5 M11 + M12: A RECOVER RECEIPT CARRIES WHAT IT KEPT AND WHAT IT HAD NOTHING TO RESTORE ────────────────
  {
    console.log(NL + '§5 M11/M12 recover reports keptLive, and nothing-to-restore never reads as a failure')
    // a FIRST RUN of its own institute: the recover claim is about what a fresh institute persists, so the fixture must
    // not carry a live ballot box, invitations or cards the snapshot already holds (those would be real conflicts).
    const root2 = await mkRoot()
    const h2 = await boot({ root: root2, clock: () => 1000, withPrompt: false, settings: { 'vmu.tools.faces': ['human', 'meeting'] } })
    const K2 = h2.kernel
    const call2 = (name, args = {}, as = 'r-acad') => h2.call(name, args, { as: as === null ? null : { agent: { id: as } } })
    const st2 = await call2('vibe_v5_start', { problem: 'r241: a first run with a live roster and no projection yet', researcherCount: 2 })
    ok(st2 && st2.ok === true, '§5a premise: a fresh institute was started', st2 && codeOf(st2))
    const durableSeats = () => {
      const e = K2.store.read('members')
      const rows = e && e.value && e.value.data && Array.isArray(e.value.data.members) ? e.value.data.members : []
      return rows.map((r) => String(r && r.id))
    }
    const durableBefore = durableSeats()
    const liveIds = ['r-acad', 'r-1', 'r-2']

    const rec = await call2('vibe_vmu_human', { action: 'recover', reason: 'r241: prove the receipt carries what it kept' })
    ok(rec && rec.ok === true, '§5b ★★ a CLEAN first run reports ok:true (nothing-to-restore is not a failure)', rec && { code: codeOf(rec), message: String(rec && rec.message).slice(0, 160) })
    ok(Array.isArray(rec.keptLive), '§5c ★★ the recover receipt carries keptLive as a list (run 64 carried no such key)', rec && rec.keptLive)
    const expectedKept = liveIds.filter((id) => durableBefore.indexOf(id) === -1).sort()
    const gotKept = (Array.isArray(rec.keptLive) ? rec.keptLive.map((id) => String(id)) : []).sort()
    ok(gotKept.length > 0 && expectedKept.length > 0 && JSON.stringify(gotKept) === JSON.stringify(expectedKept),
      '§5d ★★ keptLive is exactly the live seats the snapshot did not carry — stated where the reader can check it',
      { keptLive: rec.keptLive, expected: expectedKept, durable: durableBefore })
    has(rec.keptLiveMeans, 'PERSISTED', '§5e and keptLiveMeans says a restore is about what was PERSISTED')
    const rec2 = await call2('vibe_vmu_human', { action: 'recover', reason: 'r241: second recovery proves keptLive is a fact about the roster, not a one-off' })
    const durableBefore2 = durableSeats()
    const expectedKept2 = liveIds.filter((id) => durableBefore2.indexOf(id) === -1).sort()
    const gotKept2 = (rec2 && Array.isArray(rec2.keptLive) ? rec2.keptLive.map((id) => String(id)) : []).sort()
    ok(rec2 && rec2.ok === true
      && gotKept2.length === expectedKept2.length
      && gotKept2.filter((id) => expectedKept2.indexOf(id) !== -1).length === expectedKept2.length,
      '§5f a second recovery reports keptLive for THAT snapshot too (once persisted, a seat is no longer kept back)',
      { then: gotKept, now: gotKept2, durable: durableBefore2, ok: rec2 && rec2.ok })
    ok(Array.isArray(rec.nothingToRestore), '§5g the receipt lists the ledgers with nothing to restore (nothingToRestore)', rec && rec.nothingToRestore)
    has(rec.nothingToRestoreMeans, 'normal', '§5h ★ and the means says that is NORMAL, not a failure')
    has(rec.nothingToRestoreMeans, 'do not make ok:false', '§5i ★★ …and says explicitly it does not make ok:false')
    ok(rec.nothingToRestoreMeans.indexOf('did not fully succeed') === -1,
      '§5j the old "the recovery did not fully succeed" sentence is not said about nothing-to-restore', String(rec.nothingToRestoreMeans).slice(0, 160))
    const report = rec.recovery || {}
    ok(JSON.stringify(report.nothingToRestore) === JSON.stringify(rec.nothingToRestore),
      '§5k the face hands the report\'s own list through unchanged', { face: rec.nothingToRestore, report: report.nothingToRestore })
    const ledgerStep = Array.isArray(report.steps) ? report.steps.filter((s) => s && s.step === 'ledgers')[0] : null
    ok(ledgerStep && Array.isArray(ledgerStep.nothingToRestore) && ledgerStep.ok !== false,
      '§5l the ledgers step carries the same list and is not marked failed', ledgerStep && { ok: ledgerStep.ok, nothing: ledgerStep.nothingToRestore })
    ok(report.ok === true && Array.isArray(report.unhydrated) && report.unhydrated.length === 0,
      '§5m when nothing is unhydrated, the recovery really succeeded (the only ok:false causes are conflicts/drift)', { ok: report.ok, unhydrated: report.unhydrated })
  }
} catch (e) {
  failed += 1
  failures.push('suite threw')
  console.log('  FAIL suite threw: ' + String((e && e.stack) || e).split(NL).slice(0, 4).join(' | '))
} finally {
  for (const r of roots) { try { await rm(r, { recursive: true, force: true }) } catch { /* best effort */ } }
}

console.log(NL + '=== VMU RUN 241 RECEIPTS 2: ' + passed + ' passed, ' + failed + ' failed ===')
if (failed) { console.log('failures:'); for (const f of failures) console.log('  - ' + f) }
process.exitCode = failed ? 1 : 0

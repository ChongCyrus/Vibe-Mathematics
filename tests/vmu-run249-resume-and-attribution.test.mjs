// tests/vmu-run249-resume-and-attribution.test.mjs — RUN 249-D (run 69 / FEEDBACK69): FOUR READING DEFECTS.
//
// THE MEASURED DEFECTS (run 69, build 013b4c65; each one is a real receipt a real run showed):
//   F-06  `vibe_vmu_human { action:"recover" }` answered `ok:false, code:"VMU_STATE", failedSteps:["ledgers","readback"]`
//         while all four seats were live and `keptLive:[]`. The task book's criterion ("not one seat is missing") PASSED,
//         and nothing on the receipt said so: "the recovery did not fully succeed" could only be read as "somebody is
//         gone". The receipt must separate "a seat was lost" from "a ledger did not fully restore".
//   F-07  the recovery record id was `"rec-2"` — the SAME id space `kernel/records.js` mints proposition cards in. One
//         string named two objects. The recovery record now lives in `recovery-rec-<n>` and says `idSpace:"recovery"`.
//         (MEASURED while fixing: `state.seq` also restarted at 0 in every process, so a restart minted an id the fold
//         already held. Both collisions are pinned below.)
//   F-09  a temp seat called `vibe_vmu_set` (no `by`) and the receipt said `who:"office"`,
//         `ownerCheck:"exempted (no `by` given…)"` — the exemption was disclosed, the ATTRIBUTION was lost, and the
//         runtime-write ledger could not answer "who actually changed this".
//   B     `tool_help { member:"r-temp" }` and `{ member:"r-1" }` returned the SAME 80-item table (chair/office faces
//         included), `source:"caller"`: the answer was the CALLER's catalogue, not the named seat's face. `tool_help`
//         must answer for the seat that was asked about, using the EXISTING `SEAT_TOOL_FACES` truth (this suite
//         cross-checks the answer against that file, so the criterion is not measured by itself).
//
// WHAT THIS SUITE DOES: every assertion is a RUNTIME assertion — a real institute through the real entry, a real
// restart on the same durable root, a real ledger conflict, a real concurrent store write, real seat faces. No case
// passes by pinning a source string alone.
//
// Run: node tests/vmu-run249-resume-and-attribution.test.mjs   (last line: === VMU RUN 249 RESUME AND ATTRIBUTION: N passed, M failed ===)

import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..')
const HARNESS = join(REPO, 'scripts', 'sim', 'harness.mjs')
const SEAT_FACES = join(REPO, 'vibe-math-vmu', 'packs', 'v5r', 'seat-faces.js')

let passed = 0
let failed = 0
const failures = []
const ok = (cond, label, detail) => {
  if (cond) { passed += 1; console.log('  ok   ' + label) } else { failed += 1; failures.push(label); console.log('  FAIL ' + label + (detail === undefined ? '' : ' [' + JSON.stringify(detail).slice(0, 320) + ']')) }
}
const has = (hay, needle, label) => ok(String(hay === undefined || hay === null ? '' : hay).includes(needle), label, hay)
const codeOf = (r) => (r && r.code) || null
const NL = String.fromCharCode(10)
const sorted = (a) => (Array.isArray(a) ? a.slice() : []).map(String).sort()
const sameSet = (a, b) => JSON.stringify(sorted(a)) === JSON.stringify(sorted(b))
// Deep equality for the "same source, not a second copy" checks (the receipt must carry the report's OWN value).
const sameJSON = (a, b) => JSON.stringify(a) === JSON.stringify(b)
// Set containment with an explicit empty case: sup ⊇ sub. Used BOTH ways in §6 to pin set EQUALITY against the
// existing SEAT_TOOL_FACES truth (a one-way check would let a second table ADD denials pass unnoticed).
const coversAll = (sup, sub) => Array.isArray(sup) && Array.isArray(sub) && sub.filter((x) => sup.indexOf(x) !== -1).length === sub.length

const roots = []
const mkRoot = async () => { const d = await mkdtemp(join(tmpdir(), 'vmu-r249d-')); roots.push(d); return d }
const callAs = (h, name, args = {}, as = 'r-acad') => h.call(name, args, { as: as === null ? null : { agent: { id: as } } })
const bootOn = async (root) => boot({ root, clock: () => 1000, withPrompt: false, settings: { 'vmu.tools.faces': ['human', 'meeting'] } })

let boot = null

try {
  boot = (await import(pathToFileURL(HARNESS).href)).boot
  const seatFaces = await import(pathToFileURL(SEAT_FACES).href)

  // ══════════════════════════════════════════════════════════════════════════════════════════════════════════════
  // §1 F-06: A RECOVERY THAT REFUSES A LEDGER STILL SAYS THE ROSTER IS INTACT
  // ══════════════════════════════════════════════════════════════════════════════════════════════════════════════
  const rootA = await mkRoot()
  const h1 = await bootOn(rootA)
  const start1 = await callAs(h1, 'vibe_v5_start', { problem: 'run249 F-06/F-07: a restart with a live roster', researcherCount: 2 })
  ok(start1 && start1.ok === true, '§1a premise: a staffed institute exists on a durable root', start1 && codeOf(start1))
  const m1 = await callAs(h1, 'vibe_v5_meeting', { member: 'r-acad', agenda: 'run249 §1', title: 'the meeting the snapshot holds' })
  ok(m1 && m1.ok === true, '§1b premise: a meeting was persisted into the snapshot (the ledger a restart will refuse to half-overwrite)', m1 && codeOf(m1))

  const h2 = await bootOn(rootA)
  const K2 = h2.kernel
  const call2 = (name, args = {}, as = 'r-acad') => callAs(h2, name, args, as)
  const liveSeatsBefore = (K2.members.roster() || []).filter((r) => r && r.state === 'live').map((r) => String(r.id))
  ok(liveSeatsBefore.length >= 3, '§1c premise: the restarted kernel carries the live roster (r-acad, r-1, r-2)', liveSeatsBefore)
  const m2 = await call2('vibe_v5_meeting', { member: 'r-acad', agenda: 'run249 §1 live', title: 'the live meeting the policy layer holds' })
  ok(m2 && m2.ok === true, '§1d premise: the restarted kernel holds a live meeting of its own (the conflict this recovery meets)', m2 && codeOf(m2))

  const rec = await call2('vibe_vmu_human', { action: 'recover', reason: 'run249: the run-69 shape' }, null)
  const R = (rec && rec.recovery) || {}
  console.log(NL + '§1 F-06 the receipt separates "a ledger refused" from "a seat was lost"')
  ok(rec && rec.ok === false, '§1e the recovery really did not fully succeed (a ledger conflict is a named failure, not a success)', rec && { ok: rec.ok, code: codeOf(rec), msg: String(rec.message).slice(0, 160) })
  ok(codeOf(rec) === 'VMU_STATE', '§1f and the face still names it VMU_STATE (the wording did not change; the READING did)', codeOf(rec))
  ok(Array.isArray(rec.failedSteps) && rec.failedSteps.indexOf('ledgers') !== -1, '§1g the failed step is named (ledgers)', rec && rec.failedSteps)
  ok(R.rosterIntact === true, '§1h ★★ rosterIntact is a BOOLEAN true: every seat the durable roster held is still live (the run-69 criterion that PASSED)', R.rosterIntact)
  ok(R.rosterMeasured === true, '§1i ★★ and it is MEASURED, not assumed (rosterMeasured:true)', { measured: R.rosterMeasured, live: R.rosterLive, durable: R.rosterDurable })
  ok(Number.isInteger(R.rosterLive) && R.rosterLive >= 3 && Number.isInteger(R.rosterDurable) && R.rosterDurable >= 3,
    '§1j the comparison is checkable: it counted the live seats and the durable seats', { live: R.rosterLive, durable: R.rosterDurable })
  ok(Array.isArray(R.rosterMissingLive) && R.rosterMissingLive.length === 0, '§1k no seat is missing (rosterMissingLive is an empty list, not absent)', R.rosterMissingLive)
  ok(R.ledgerIntact && R.ledgerIntact.meetings === false, '§1l ★★ ledgerIntact.meetings is false: the ledger that refused to hydrate is reported as NOT intact', R.ledgerIntact)
  ok(R.ledgerIntactKeys && Array.isArray(R.ledgerIntactKeys.broken) && R.ledgerIntactKeys.broken.indexOf('meetings') !== -1,
    '§1m and the broken keys are listed by name', R.ledgerIntactKeys)
  ok(R.ledgerIntactKeys && Array.isArray(R.ledgerIntactKeys.intact) && R.ledgerIntactKeys.intact.length > 0,
    '§1n the ledgers that WERE fine are listed too (a reader can tell "one ledger refused" from "everything failed")', R.ledgerIntactKeys)
  ok(Array.isArray(R.needsHuman) && R.needsHuman.length > 0, '§1o ★★ needsHuman is a non-empty list: ok:false is attached to the step a human must decide', R.needsHuman)
  const nh = Array.isArray(R.needsHuman) ? R.needsHuman.filter((n) => n && n.step === 'ledgers')[0] : null
  ok(nh && nh.code === 'VMU_STATE', '§1p the human item names the step and its code', nh)
  ok(nh && typeof nh.why === 'string' && nh.why.length > 40, '§1q …and says WHY in prose (not a bare code)', nh && nh.why)
  ok(nh && Array.isArray(nh.keys) && nh.keys.indexOf('meetings') !== -1, '§1r …and names the ledger key(s) to decide about', nh && nh.keys)
  has(R.needsHumanMeans, 'ONLY', '§1s needsHumanMeans says ok:false is ONLY about these steps')
  has(R.rosterIntactMeans, 'no seat was lost', '§1t rosterIntactMeans states the fact in words: no seat was lost')
  const ledgerStep = (R.steps || []).filter((s) => s && s.step === 'ledgers')[0] || null
  ok(ledgerStep && ledgerStep.ok === false && ledgerStep.ledgerIntact && ledgerStep.ledgerIntact.meetings === false,
    '§1u the ledgers STEP carries the same reading (a reader of the step does not need the report top level)', ledgerStep && { ok: ledgerStep.ok, intact: ledgerStep.ledgerIntact })
  ok(R.ok === false && rec.ok === false && R.rosterIntact === true,
    '§1v ★★ two readings, one receipt: the recovery failed AND nobody was lost — the two facts no longer share one code',
    { reportOk: R.ok, faceOk: rec.ok, rosterIntact: R.rosterIntact })
  const liveSeatsAfter = (K2.members.roster() || []).filter((r) => r && r.state === 'live').map((r) => String(r.id))
  ok(sameSet(liveSeatsAfter, liveSeatsBefore), '§1w and the roster really is unchanged by the failed recovery', { before: liveSeatsBefore, after: liveSeatsAfter })
  // ★★ RUN 249-D (Lead ruling): the three readings exist so a reader does NOT have to dig into `recovery.*`. The face
  // must carry them at the TOP level, and the value must be the report's OWN value (same source, not a second copy
  // computed by the face — a face that recomputed `rosterIntact` would be a second reader of the roster).
  ok(rec.rosterIntact === R.rosterIntact && typeof rec.rosterIntact === 'boolean' && rec.rosterMeasured === R.rosterMeasured,
    '§1x ★★ the FACE carries rosterIntact at top level — a boolean, the same value as recovery.rosterIntact (no digging)', rec && { top: rec.rosterIntact, report: R.rosterIntact, measured: rec.rosterMeasured })
  ok(sameJSON(rec.ledgerIntact, R.ledgerIntact) && rec.ledgerIntact && rec.ledgerIntact.meetings === false,
    '§1y ★★ …and ledgerIntact at top level, the same per-ledger object as recovery.ledgerIntact', rec && rec.ledgerIntact)
  ok(sameJSON(rec.needsHuman, R.needsHuman) && Array.isArray(rec.needsHuman) && rec.needsHuman.length > 0,
    '§1z ★★ …and needsHuman at top level, the same list as recovery.needsHuman (ok:false is attached to a named human decision)', rec && rec.needsHuman)
  ok(rec.needsHumanMeans === R.needsHumanMeans && rec.rosterIntactMeans === R.rosterIntactMeans && rec.ledgerIntactMeans === R.ledgerIntactMeans,
    '§1aa ★ and the three Means are the report\'s own strings — one source, two places, zero chance to disagree',
    rec && { nh: rec.needsHumanMeans === R.needsHumanMeans, ri: rec.rosterIntactMeans === R.rosterIntactMeans, li: rec.ledgerIntactMeans === R.ledgerIntactMeans })

  // ══════════════════════════════════════════════════════════════════════════════════════════════════════════════
  // §2 F-06 (the other half): A CLEAN RECOVERY SAYS ok:true AND NOTHING NEEDS A HUMAN
  // ══════════════════════════════════════════════════════════════════════════════════════════════════════════════
  console.log(NL + '§2 F-06 a clean recovery needs no human and claims no failure')
  const rootB = await mkRoot()
  const h3 = await bootOn(rootB)
  const K3 = h3.kernel
  const call3 = (name, args = {}, as = 'r-acad') => callAs(h3, name, args, as)
  const start3 = await call3('vibe_v5_start', { problem: 'run249 F-06/F-09/B: a clean first run', researcherCount: 2 })
  ok(start3 && start3.ok === true, '§2a premise: a fresh staffed institute exists', start3 && codeOf(start3))
  const clean = await call3('vibe_vmu_human', { action: 'recover', reason: 'run249: a clean first run' }, null)
  const CR = (clean && clean.recovery) || {}
  ok(clean && clean.ok === true, '§2b a clean recovery reports ok:true (nothing-to-restore is not a failure)', clean && { code: codeOf(clean), msg: String(clean.message).slice(0, 160) })
  ok(Array.isArray(CR.failedSteps) && CR.failedSteps.length === 0, '§2c no failed step is named (the report carries the list; the face only prints it on failure)', CR.failedSteps)
  ok(Array.isArray(CR.needsHuman) && CR.needsHuman.length === 0, '§2d ★ needsHuman is an EMPTY list when nothing needs a human (not absent, not a string)', CR.needsHuman)
  has(CR.needsHumanMeans, 'nothing in this recovery needs a human', '§2e and the means says so in words')
  ok(Array.isArray(clean.needsHuman) && clean.needsHuman.length === 0 && sameJSON(clean.needsHuman, CR.needsHuman),
    '§2e-1 ★ the clean receipt ALSO carries needsHuman at top level (an empty list, same as recovery.needsHuman)', clean && clean.needsHuman)
  ok(clean.rosterIntact === CR.rosterIntact && clean.rosterIntact === true && sameJSON(clean.ledgerIntact, CR.ledgerIntact),
    '§2e-2 ★ …and rosterIntact/ledgerIntact at top level on the clean path too (the promotion is not failure-only)', clean && { rosterIntact: clean.rosterIntact, ledgerIntact: clean.ledgerIntact })
  ok(CR.ledgerIntactKeys && Array.isArray(CR.ledgerIntactKeys.broken) && CR.ledgerIntactKeys.broken.length === 0,
    '§2f ledgerIntactKeys.broken is empty: every ledger either restored or had nothing projected', CR.ledgerIntactKeys)
  ok(CR.rosterIntact === true && typeof CR.rosterMeasured === 'boolean', '§2g rosterIntact is still answered on a clean run (a boolean, with the measurement disclosed)', { intact: CR.rosterIntact, measured: CR.rosterMeasured })
  ok(CR.idSpace === 'recovery' && /^recovery-rec-\d+$/.test(String(CR.id)), '§2h and the clean run record already lives in the recovery id space', { id: CR.id, idSpace: CR.idSpace })

  // ══════════════════════════════════════════════════════════════════════════════════════════════════════════════
  // §3 F-06: READ-BACK DRIFT IS REPORTED AS DRIFT, WITH ITS KEYS — NOT AS A LOST ROSTER
  // ══════════════════════════════════════════════════════════════════════════════════════════════════════════════
  console.log(NL + '§3 F-06 a concurrent store write is read back as drift, and the roster claim survives it')
  let patched = null
  try { patched = await K2.store.patch('meetings', (cur) => Object.assign({}, cur, { injectedByRun249Probe: true })) } catch (e) { patched = { ok: false, error: String((e && e.message) || e) } }
  ok(patched && patched.ok !== false, '§3a premise: a concurrent writer moved the stored `meetings` value under the process', patched)
  const drift = await call2('vibe_vmu_human', { action: 'recover', reason: 'run249: drift after a concurrent write' }, null)
  const DR = (drift && drift.recovery) || {}
  ok(drift && drift.ok === false, '§3b the recovery fails when its own write expectation no longer hashes', drift && { code: codeOf(drift) })
  // ★★★ RUN 259 / TB-2647: a read-back drift is NOT "a failed step of this process" — it is a step that SAW the
  // bytes move. The receipt names it in `driftedSteps` and does NOT print `failedSteps` (MEASURED on the real machine:
  // every one of the four drift receipts had no `failedSteps` key, and the drift path had no step name at all). The
  // mixed case (ledgers AND readback) still carries `failedSteps` — pinned in §1 above.
  ok(Array.isArray(drift.driftedSteps) && drift.driftedSteps.indexOf('readback') !== -1,
    '§3c the drift is named as a DRIFTED step (driftedSteps includes readback), not as a failed step of this process', drift && drift.driftedSteps)
  ok(drift && !Object.prototype.hasOwnProperty.call(drift, 'failedSteps'),
    '§3c-1 ★★ and the drift receipt does NOT carry `failedSteps` — a drift is a fact about the store, not a failure here', drift && { keys: Object.keys(drift || {}) })
  const rbStep = (DR.steps || []).filter((s) => s && s.step === 'readback')[0] || null
  ok(rbStep && rbStep.ok === false && rbStep.code === 'VMU_RESUME_READBACK_DRIFT', '§3d the readback STEP names the drift code', rbStep && { ok: rbStep.ok, code: rbStep.code })
  ok(DR.readBack && DR.readBack.consistent === false && Array.isArray(DR.readBack.drift) && DR.readBack.drift.some((d) => d && d.key === 'meetings'),
    '§3e readBack.drift names the key that moved (meetings)', DR.readBack && { consistent: DR.readBack.consistent, keys: (DR.readBack.drift || []).map((d) => d && d.key) })
  ok(DR.readBack && typeof DR.readBack.writesBetween === 'number', '§3f writesBetween is a number a reader can weigh the drift against', DR.readBack && DR.readBack.writesBetween)
  has(DR.readBack && DR.readBack.driftMeans, 'writesBetween', '§3g driftMeans says what writesBetween is for (a concurrent writer, not data loss)')
  const nhRb = Array.isArray(DR.needsHuman) ? DR.needsHuman.filter((n) => n && n.step === 'readback')[0] : null
  ok(nhRb && Array.isArray(nhRb.keys) && nhRb.keys.indexOf('meetings') !== -1, '§3h ★ needsHuman names the drift step and its key', nhRb)
  has(nhRb && nhRb.why, 'drift', '§3i …with a why that says drift')
  ok(DR.rosterIntact === true, '§3j ★★ a store that moved under the process is not a lost seat: rosterIntact stays true', DR.rosterIntact)

  // ══════════════════════════════════════════════════════════════════════════════════════════════════════════════
  // §4 F-07: THE RECOVERY RECORD HAS ITS OWN ID SPACE, AND ITS IDS NEVER REPEAT
  // ══════════════════════════════════════════════════════════════════════════════════════════════════════════════
  console.log(NL + '§4 F-07 recovery ids live in `recovery-rec-<n>` and never collide with a proposition card')
  const hist = (K2.recovery && typeof K2.recovery.history === 'function' ? K2.recovery.history() : []) || []
  ok(hist.length >= 2, '§4a premise: the restarted kernel adopted its history and appended to it', hist.map((r) => r && r.id))
  ok(hist.every((r) => r && /^recovery-rec-\d+$/.test(String(r.id))), '§4b ★★ every recovery id is `recovery-rec-<n>` (its own id space)', hist.map((r) => r && r.id))
  ok(hist.every((r) => r && r.idSpace === 'recovery'), '§4c …and every row SAYS idSpace:"recovery" (a reader never has to parse a prefix)', hist.map((r) => r && r.idSpace))
  ok(hist.every((r) => r && !/^rec-\d+$/.test(String(r.id))), '§4d ★★ no recovery id is in the proposition-card space (`rec-<n>`) any more', hist.map((r) => r && r.id))
  const idSet = new Set(hist.map((r) => String(r && r.id)))
  ok(idSet.size === hist.length, '§4e ★★ every id in the history is UNIQUE — the restart did not mint an id the fold already held', { ids: hist.map((r) => r && r.id), unique: idSet.size })
  const suffixes = hist.map((r) => Number(/^recovery-rec-(\d+)$/.exec(String(r.id))[1]))
  ok(suffixes.length === hist.length && suffixes.length >= 2, '§4f-0 every history row produced a numeric suffix (non-vacuous: ' + suffixes.length + ' rows)', suffixes)
  ok(suffixes.every((n, i) => i === 0 || n > suffixes[i - 1]), '§4f the suffixes are strictly increasing (ids are a sequence, not a lottery)', suffixes)
  const durableEnv = K2.store.read('resume')
  const durableRows = durableEnv && Array.isArray(durableEnv.recoveries) ? durableEnv.recoveries : []
  ok(durableRows.length > 0 && durableRows.every((r) => r && r.idSpace === 'recovery' && /^recovery-rec-\d+$/.test(String(r.id))),
    '§4g the DURABLE record carries the same id space (not just the in-memory history)', durableRows.map((r) => r && r.id))
  ok(durableEnv && durableEnv.counters && Number.isInteger(Number(durableEnv.counters.recoverySeq)) && Number(durableEnv.counters.recoverySeq) >= Math.max(...suffixes),
    '§4h ★ the id counter is durable: pruning the history cannot recycle an id on the next start', durableEnv && durableEnv.counters)

  // ══════════════════════════════════════════════════════════════════════════════════════════════════════════════
  // §5 F-09: A TEMP SEAT'S SETTING CALL IS ATTRIBUTED ON THE RECEIPT AND IN THE AUDIT TRAIL
  // ══════════════════════════════════════════════════════════════════════════════════════════════════════════════
  console.log(NL + '§5 F-09 `who` is the declared owner, `actedBy` is who actually turned the key')
  const hired = await call3('vibe_v5_hire', { purpose: 'run249 F-09: a temp seat that changes a setting', initial_task: 'probe the setting face', to: 'r-temp' })
  ok(hired && hired.ok === true, '§5a premise: a temp seat (r-temp) was hired', hired && codeOf(hired))
  const setTemp = await call3('vibe_vmu_set', { key: 'vmu.math.maxParallel', value: '5' }, 'r-temp')
  ok(setTemp && setTemp.ok === true, '§5b the temp seat may change the setting (the office path stays reachable)', setTemp && codeOf(setTemp))
  ok(setTemp && setTemp.who === 'office', '§5c who still reports the key\'s DECLARED owner (office)', setTemp && setTemp.who)
  ok(setTemp && (setTemp.by === null || setTemp.by === undefined), '§5d and `by` is still absent: the exemption is the caller\'s omission, unchanged', setTemp && setTemp.by)
  has(setTemp && setTemp.ownerCheck, 'exempted', '§5e ★ the exemption semantics are preserved verbatim (ownerCheck says exempted/DISCLOSED)')
  ok(setTemp && setTemp.actedBy === 'r-temp', '§5f ★★ actedBy is the REAL caller measured from the turn context (r-temp), not "office"', setTemp && { actedBy: setTemp.actedBy, source: setTemp.actedBySource })
  ok(setTemp && setTemp.actedBySource === 'caller', '§5g …and it says the attribution was MEASURED (actedBySource:"caller")', setTemp && setTemp.actedBySource)
  has(setTemp && setTemp.actedByMeans, 'resolveTurnMember', '§5h the means names the criterion that measured it')
  const audit = K3.status({ detail: 'full' })
  const lastWrite = audit && audit.settings ? audit.settings.lastRuntimeWrite : null
  ok(lastWrite && lastWrite.actedBy === 'r-temp', '§5i ★★ the runtime-write LEDGER carries the same attribution (an audit reader sees who changed it)', lastWrite)
  has(lastWrite && lastWrite.ownerCheck, 'exempted', '§5j …while the ledger still discloses the exemption')
  ok(lastWrite && lastWrite.action === 'set', '§5k the ledger row is the set it claims to be', lastWrite && lastWrite.action)
  const setMember = await call3('vibe_vmu_set', { key: 'vmu.math.maxParallel', value: '7', by: 'office' }, 'r-1')
  ok(setMember && setMember.ok === true && setMember.ownerCheck === 'identified', '§5l a declared `by` that matches the owner is still `identified` (unchanged path)', setMember && { ok: setMember.ok, ownerCheck: setMember.ownerCheck })
  ok(setMember && setMember.actedBy === 'r-1' && setMember.by === 'office', '§5m ★★ measured caller beats the declaration: actedBy is r-1 while by is office', setMember && { by: setMember.by, actedBy: setMember.actedBy })
  const setRoot = await call3('vibe_vmu_set', { key: 'vmu.math.maxParallel', value: '6' }, null)
  ok(setRoot && setRoot.ok === true && setRoot.actedBy === 'office' && setRoot.actedBySource === 'office-path',
    '§5n an office call is attributed to the office (resolveTurnMember null IS the root/office answer, not "unknown")', setRoot && { actedBy: setRoot.actedBy, source: setRoot.actedBySource })
  const unset = K3.unsetSettingsValue('vmu.math.maxParallel', { actedBy: 'r-1' })
  ok(unset && unset.ok === true && unset.actedBy === 'r-1', '§5o the unset path carries actedBy too (one attribution rule for both writes)', unset && { ok: unset.ok, actedBy: unset.actedBy })
  const lastUnset = K3.status({ detail: 'full' }).settings.lastRuntimeWrite
  ok(lastUnset && lastUnset.action === 'unset' && lastUnset.actedBy === 'r-1', '§5p …and its ledger row does too', lastUnset)

  // ══════════════════════════════════════════════════════════════════════════════════════════════════════════════
  // §6 B: tool_help ANSWERS FOR THE SEAT THAT WAS ASKED ABOUT (the EXISTING SEAT_TOOL_FACES truth)
  // ══════════════════════════════════════════════════════════════════════════════════════════════════════════════
  console.log(NL + '§6 B tool_help is the named seat\'s face, not the caller\'s whole catalogue')
  const declared = K3.packTools().map((t) => t.name)
  const fakeCaller = { id: 'child-249', ctx: { tools: { schemas: () => declared.map((name) => ({ name })) } } }
  const helpAs = async (member) => h3.call('vibe_v5_tool_help', { member }, { as: { agent: fakeCaller } })
  const helpMember = await helpAs('r-1')
  const helpTemp = await helpAs('r-temp')
  const helpChair = await helpAs('r-acad')
  ok(helpMember && helpMember.ok === true && Array.isArray(helpMember.tools), '§6a premise: tool_help answers for a member', helpMember && codeOf(helpMember))
  ok(helpMember.count === helpMember.tools.length, '§6b count is the number of tools actually returned (one fact, not two)', { count: helpMember.count, n: helpMember.tools.length })
  ok(helpMember.source === 'seat', '§6c ★★ source is "seat": the answer is the seat\'s face (run 69 said "caller")', helpMember.source)
  ok(helpMember.deniedCount === declared.length - helpMember.count && helpMember.deniedCount > 0,
    '§6d ★★ deniedCount says how many tools the seat may NOT use, and it adds up', { declared: declared.length, count: helpMember.count, denied: helpMember.deniedCount })
  ok(helpMember.seatFilter && helpMember.seatFilter.slot === 'member' && helpMember.seatFilter.rule === 'seat-deny' && helpMember.seatFilter.applied === true,
    '§6e the receipt says WHICH face was applied and by which rule', helpMember.seatFilter)
  ok(helpMember.seatFilter && helpMember.seatFilter.before === declared.length && helpMember.seatFilter.after === helpMember.count,
    '§6f before/after are the real widths of the catalogue and the answer', helpMember.seatFilter && { before: helpMember.seatFilter.before, after: helpMember.seatFilter.after })
  ok(Array.isArray(helpMember.hidden) && helpMember.hidden.length === helpMember.deniedCount,
    '§6g a name the seat may not use is a HIDDEN fact, not silently dropped', { hidden: (helpMember.hidden || []).length, denied: helpMember.deniedCount })
  ok(helpTemp && helpTemp.count < helpMember.count, '§6h ★★ the temp seat gets FEWER tools than the member seat (the run-69 defect: both got the same 80)', { member: helpMember.count, temp: helpTemp && helpTemp.count })
  ok(helpTemp && helpTemp.source === 'seat' && helpTemp.deniedCount === declared.length - helpTemp.count && helpTemp.deniedCount > helpMember.deniedCount,
    '§6i ★★ the temp seat\'s own face is applied (a larger deniedCount), still source "seat"', helpTemp && { source: helpTemp.source, count: helpTemp.count, denied: helpTemp.deniedCount })
  const memberNames = helpMember.tools.map((t) => t.name)
  const tempNames = helpTemp.tools.map((t) => t.name)
  ok(JSON.stringify(sorted(memberNames)) !== JSON.stringify(sorted(tempNames)), '§6j ★★ the two seats do NOT answer the same table', { member: memberNames.length, temp: tempNames.length })
  ok(tempNames.length > 0 && tempNames.length === helpTemp.count, '§6k-0 the temp answer really has tools to check (non-vacuous: ' + tempNames.length + ')', tempNames.length)
  ok(tempNames.every((n) => memberNames.indexOf(n) !== -1), '§6k the temp answer is a SUBSET of the member answer (the filter removes, it does not invent)', tempNames.filter((n) => memberNames.indexOf(n) === -1))
  const memberOnly = memberNames.filter((n) => tempNames.indexOf(n) === -1)
  ok(memberOnly.length > 0 && memberOnly.indexOf('vibe_v5_record_proposition') !== -1,
    '§6l a member-only tool (recording a proposition) is present for r-1 and absent for r-temp', memberOnly.slice(0, 10))
  ok(helpChair && helpChair.deniedCount === 0 && helpChair.count === declared.length,
    '§6m the chair seat denies nothing: the same rule, applied to a face with an empty deny list', helpChair && { count: helpChair.count, denied: helpChair.deniedCount })
  ok(helpChair && helpChair.seatFilter && helpChair.seatFilter.applied === false, '§6n …and says the filter removed nothing (applied:false, not a silent 0)', helpChair && helpChair.seatFilter)
  // ★ THE CRITERION IS NOT MEASURED BY ITSELF: cross-check every seat against the EXISTING SEAT_TOOL_FACES file.
  const seats = [['chair', helpChair], ['member', helpMember], ['temp', helpTemp]]
  const crossChecked = seats.map(([seat, got]) => {
    const expected = seatFaces.seatDenyNames(seat, declared)
    const gotDeny = (got && got.seatFilter && got.seatFilter.deniedNames) || null
    return { seat, expected, got: gotDeny, fwd: coversAll(expected, gotDeny), bwd: coversAll(gotDeny, expected) }
  })
  ok(crossChecked.length === 3 && crossChecked.filter((c) => c.expected.length > 0).length === 2,
    '§6o-0 the cross-check really has three seats, TWO of them with a non-empty deny list (non-vacuous: ' + crossChecked.length + ')', crossChecked.map((c) => c.seat + ':' + c.expected.length))
  ok(crossChecked.length === 3 && crossChecked.every((c) => c.fwd),
    '§6o-1 ★★ direction ⊆: every name seatDenyNames says is DENIED really is denied — the wire cannot add a tool the file forbids',
    crossChecked.map((c) => ({ seat: c.seat, fwd: c.fwd })))
  ok(crossChecked.length === 3 && crossChecked.every((c) => c.bwd),
    '§6o-2 ★★ direction ⊇: and nothing else is denied — the filter cannot over-remove, nor invent a second table',
    crossChecked.map((c) => ({ seat: c.seat, bwd: c.bwd })))
  ok(crossChecked.length === 3 && crossChecked.every((c) => c.fwd && c.bwd),
    '§6o-3 ★★ the two directions TOGETHER are SET EQUALITY against packs/v5r/seat-faces.js — the existing truth, not a second table',
    crossChecked.map((c) => ({ seat: c.seat, expected: c.expected.length, got: c.got === null ? null : c.got.length })))
  const helpOffice = await call3('vibe_v5_tool_help', { member: 'r-1' }, null)
  ok(helpOffice && helpOffice.source === 'no-live-agent' && (helpOffice.deniedCount === null || helpOffice.deniedCount === undefined),
    '§6p with no caller the answer is the provider path, unchanged (source "no-live-agent", deniedCount null/absent — not a fabricated 0)', helpOffice && { source: helpOffice.source, denied: helpOffice.deniedCount })
} catch (e) {
  failed += 1
  failures.push('suite threw')
  console.log('  FAIL suite threw: ' + String((e && e.stack) || e).split(NL).slice(0, 5).join(' | '))
} finally {
  for (const r of roots) { try { await rm(r, { recursive: true, force: true }) } catch { /* best effort */ } }
}

console.log(NL + '=== VMU RUN 249 RESUME AND ATTRIBUTION: ' + passed + ' passed, ' + failed + ' failed ===')
if (failed) { console.log('failures:'); for (const f of failures) console.log('  - ' + f) }
process.exitCode = failed ? 1 : 0

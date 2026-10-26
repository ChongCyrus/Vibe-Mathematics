// tests/vmu-run29-verdict-ask.test.mjs — LIVE RUN 29: the ask face published three things it had not read.
//
// THE DEFECT CLASS THIS PINS (measured against the run-29 build, not read off a prompt):
//   ① THE SEAT COUNT DID NOT RECONCILE. `rosterCount:3` sat beside `asked:[…two members…]` and no field said who the
//      third seat was. It was the CHAIR, dropped by a bare `m !== chair`; a number a reader cannot reconcile is a number
//      they must either distrust or silently translate — and the chair HAD spoken in run 29, so the omission was not even
//      "someone who did not debate". This file asserts the receipt now names the exclusion (`excluded:[{member, why}]`),
//      states what the count counts (`rosterCountMeans`) and shows the arithmetic closing (`accounting`): asked +
//      excluded = the members the meeting named.
//   ② THE MAIL ASSERTED THE DEBATE HAD ENDED. Every message carried the fixed clause 「（会议 <id> 已结束辩论；…）」.
//      Measured: the same meeting's own `meetingView` reported `state:"open"` while that clause was in the members'
//      inboxes. The clause is now GENERATED from `meetingView.state` (`debateClosureOf`), and an unreadable state makes
//      the mail say 状态不可读 instead of inventing a closure. Both directions are exercised: a fake kernel is asked for
//      each state, so the sentence is shown to FOLLOW the state rather than being one fixed string.
//   ③ ANY STRING WAS ACCEPTED AS "THE PROPOSITION". `proposition_id` was checked for PRESENCE only; with the
//      propositions library at `total:0`, the id `p-typo` — neither the meeting's declared debate object nor any card —
//      was accepted and members were asked to rule on it. Now a card / a file reference / the meeting's declared
//      object are accepted (each labelled in `propositionKind`), and anything else is REFUSED by name
//      `VMU_ASK_UNKNOWN_PROPOSITION` — before the mailbox, which this file also asserts.
//
// ALSO PINNED HERE (the same face, found while fixing the above): `askedWhy` branched on `source === 'explicit'` and
// `source === 'speech'` while the code emits 'members' / 'spokeBy' / 'minutes' — two DEAD branches, so an explicit
// `members:[…]` call was described with the union wording it never used. `askedWhy` now branches on the values the
// code actually assigns, and the declaration lists those same five values.
//
// WHAT A READER OF run 29 COULD NOT SEE, AND CAN NOW: whether the chair was skipped on purpose
// (`excluded[].why:"presides"`), whether the proposition was checked (`propositionKind`), and what the meeting
// actually said about its own closure (`meetingState` / `closurePhase` / `mail.closureSentence`).
//
// RULE E: every collection assertion states its non-emptiness (or exact shape) in the same expression.
import { mkdtemp } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'
// ★ ROUND 31: the state vocabulary's ONE map — imported so this suite can prove the receipt publishes that map's
// sentence rather than a second copy of it.
import { MEETING_STATE_MEANING } from '../vibe-math-vmu/kernel/meeting.js'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..')
const ENTRY = join(REPO, 'vibe-math-vmu', 'vibe-math-vmu.js')

let passed = 0
let failed = 0
const failures = []
const ok = (cond, label, detail) => {
  if (cond) { passed++; console.log('  ok   ' + label); return true }
  failed++; failures.push(label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  console.error('  FAIL ' + label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  return false
}
const J = (o) => JSON.stringify(o)

const entry = await import(pathToFileURL(ENTRY).href)
const toolsMod = await import(pathToFileURL(join(REPO, 'vibe-math-vmu', 'packs', 'v5r', 'tools.js')).href)
const askSpec = toolsMod.V5R_PACK_TOOLS.find((t) => t.name === 'vibe_v5_verdict_ask')
// The handler is not exported (only the frozen tool list is), so the direct-call cases reach it through the spec:
// that is the SAME function the host runs, not a copy of it.
const ASK = askSpec && askSpec.handler

let NOW = 1000
const boot = async (config = {}) => {
  const state = { specs: [] }
  const ctx = {
    effect(fn) { return fn() },
    on() { return () => {} },
    tools: { register: async (spec) => { state.specs.push(spec); return () => {} } },
  }
  const handle = entry.apply(ctx, Object.assign({ clock: () => NOW }, config))
  await handle.ready()
  return { handle, state, specOf: (n) => state.specs.find((s) => s.name === n) }
}
const call = async (b, name, args = {}) => {
  const spec = b.specOf(name)
  if (!spec) return { parsed: undefined, missing: true }
  try { return { parsed: JSON.parse(await spec.execute(args, {})) } } catch (e) { return { parsed: undefined, code: e && e.code, message: e && e.message, hint: e && e.hint } }
}
// One shape for both transports: a pack funnel returns {ok:false,code,…} as JSON, the kernel raises instead.
const R = (r) => r.parsed || { ok: false, code: r.code, message: r.message, hint: r.hint }

// ── 0. SETUP: a debate the meeting itself declared, with the CHAIR among the speakers ────────────────────────────────
console.log('=== 0. SETUP: THREE SEATS, ONE CHAIR, TWO SPEAKERS (THE CHAIR ONE OF THEM) ===')
const root = await mkdtemp(join('D:/_tmp', 'vmu-run29-ask-'))
const b = await boot({ root, packs: ['v5r'] })
const kernel = b.handle.kernel
for (const id of ['acad-01', 'res-01', 'res-02']) {
  await kernel.members.hire({ id, slot: id === 'acad-01' ? 'chair' : 'member' })
}
const convened = await call(b, 'vibe_v5_meeting', { agenda: '辩论 p-unknown', type: 'debate', subject: 'p-unknown', member: 'acad-01' })
const mid = R(convened).meeting
for (const m of ['acad-01', 'res-01', 'res-02']) await call(b, 'vibe_vmu_meeting', { action: 'attend', id: mid, member: m })
// The chair SPEAKS — so its later absence from `asked` cannot be explained as "it never debated".
await call(b, 'vibe_vmu_meeting', { action: 'speak', id: mid, member: 'acad-01', text: 'chair opening' })
await call(b, 'vibe_vmu_meeting', { action: 'speak', id: mid, member: 'res-01', text: 'evidence' })
const view0 = kernel.meetings.meetingView({ meeting: mid })
ok(view0.state === 'open' && view0.subject === 'p-unknown' && Array.isArray(view0.roster) && view0.roster.length === 3,
  '0. the meeting really is open, really declared p-unknown, and really rosters three seats (read back, not assumed)',
  { state: view0.state, subject: view0.subject, roster: view0.roster })

// ── ① THE SEAT COUNT RECONCILES ─────────────────────────────────────────────────────────────────────────────────────
console.log('=== 1. `rosterCount` INCLUDES THE CHAIR SEAT — `excluded` SAYS SO, `accounting` CLOSES ===')
const first = R(await call(b, 'vibe_v5_verdict_ask', { meeting: mid, proposition_id: 'p-unknown' }))
ok(first.ok === true, '1. the ask still succeeds on a normal debate (the fix did not turn a working call into a refusal)', { ok: first.ok, code: first.code, message: String(first.message || '').slice(0, 200) })
ok(Array.isArray(first.asked) && first.asked.length === 2 && first.asked.slice().sort().join(',') === 'res-01,res-02',
  '1. the population is the two NON-CHAIR seats (res-02 never spoke and is still asked — the roster is the debate)',
  { asked: first.asked })
ok(Array.isArray(first.excluded) && first.excluded.length === 1 && first.excluded[0].member === 'acad-01' && first.excluded[0].why === 'presides',
  '① the chair is NAMED as excluded with a machine-readable reason ("presides"), not silently dropped', { excluded: first.excluded })
ok(typeof first.excludedMeans === 'string' && first.excludedMeans.toLowerCase().includes('signs the ask'),
  '① `excludedMeans` states WHY the chair is not in `asked` (it signs the ask instead of answering it)', { excludedMeans: String(first.excludedMeans || '').slice(0, 180) })
ok(first.rosterCount === 3 && typeof first.rosterCountMeans === 'string' && first.rosterCountMeans.includes('INSIDE `rosterCount`') && first.rosterCountMeans.includes('NOT inside `asked`'),
  '① `rosterCount` is still 3 and `rosterCountMeans` says the chair sits INSIDE that count but NOT inside `asked`', { rosterCount: first.rosterCount, means: String(first.rosterCountMeans || '').slice(0, 200) })
const acct = first.accounting || {}
ok(acct.askedCount === first.asked.length && acct.excludedCount === first.excluded.length && acct.accountedCount === 3 && acct.rosterCount === 3 && acct.speakerCount === 2,
  '① `accounting` carries every number the receipt used, so nothing has to be recomputed from prose', { accounting: acct })
ok(acct.askedCount + acct.excludedCount === acct.accountedCount && typeof acct.means === 'string' && acct.means.includes('asked 2 + excluded 1 = 3'),
  '① the three numbers CLOSE: asked + excluded = accountedCount, and the sentence says it in the same words the reader can check', { means: String(acct.means || '').slice(0, 180) })
ok(first.speakerCount === 2 && first.askedSource === 'roster+speech',
  '① the chair is in `speakerCount` (it DID debate) which is exactly why the exclusion needed naming — the two facts are separable', { speakerCount: first.speakerCount, askedSource: first.askedSource })
ok(first.askedSource === 'roster+speech' && first.askedWhy.includes('UNION of the meeting roster') && first.askedWhy.includes('excluded'),
  '① the UNION branch keeps its wording (run-28 pin) and now points at `excluded` for the chair seat', { askedWhy: String(first.askedWhy || '').slice(0, 220) })

// ── ② THE MAIL IS DERIVED FROM THE MEETING STATE ───────────────────────────────────────────────────────────────────
console.log('=== 2. THE MAIL CLAUSE IS GENERATED FROM `meetingView.state`, NOT ASSERTED ===')
const mail = first.mail || {}
ok(first.meetingState === 'open' && first.closurePhase === 'running',
  '② the receipt reports the MEETING state it read ("open") and the phase it derived from it ("running")', { meetingState: first.meetingState, closurePhase: first.closurePhase })
ok(typeof mail.text === 'string' && mail.text.includes('state "open"') && mail.text.includes('尚未') && !mail.text.includes('已结束辩论'),
  '② the mail says the debate is STILL RUNNING and does NOT claim it ended — the run-29 clause is gone', { text: String(mail.text || '').slice(0, 220) })
ok(typeof mail.closureSentence === 'string' && mail.closureSentence.length > 0 && mail.text.includes(mail.closureSentence),
  '② the receipt exposes the exact generated clause inside the body, so a reader can attribute the sentence to a field', { sentence: mail.closureSentence })
ok(mail.stateReadable === true && mail.closurePhase === 'running' && typeof mail.means === 'string' && mail.means.includes('never writes a closure it did not read'),
  '② `mail.means` states the generation rule, so the field is documented where it is read', { means: String(mail.means || '').slice(0, 180) })
ok(typeof first.meetingStateMeans === 'string' && first.meetingStateMeans.length > 0 && first.meetingStateMeans === MEETING_STATE_MEANING.open,
  '② ★ R31: `meetingStateMeans` is the KERNEL\'s own sentence for "open". In run 29 this field was null, because MEETING_STATE_MEANING described only the primitive\'s words — a reader got a state name with no explanation. The pack still does not write its own wording: it publishes the map\'s sentence (the null-for-unknown behaviour is pinned in 2b).',
  { meetingStateMeans: first.meetingStateMeans })
ok(typeof first.next === 'string' && first.next.includes('closurePhase') && first.next.includes('close'),
  '② `next` agrees with the receipt: it tells the chair to close the debate when `closurePhase` is not "ended"', { next: String(first.next || '').slice(0, 200) })

// The state matrix runs the REAL handler with a fake kernel, because the real kernel cannot publish a closed view
// (see 2c) — and a rule that only ever sees one state is not a rule this file can claim to have tested.
console.log('=== 2b. EVERY STATE THE KERNEL CAN NAME, READ THROUGH THE SAME HANDLER ===')
const fakeKernel = (view, opts = {}) => {
  const sent = []
  return {
    sent,
    meetings: {
      meetingView: () => view,
      spokeBy: () => ({ spokeBy: opts.spokeBy === undefined ? ['m1'] : opts.spokeBy }),
    },
    mailbox: { send: (from, msg) => { sent.push({ from, to: msg && msg.to, text: msg && msg.text }); return { ok: true } } },
    members: { roster: () => (opts.roster === undefined ? ['c1', 'm1', 'm2'] : opts.roster).map((id) => ({ id })) },
    records: opts.records,
  }
}
const askDirect = (args, kernelObj) => {
  try { return { receipt: ASK(args, { kernel: kernelObj }) } } catch (e) { return { code: e && e.code, message: e && e.message, hint: e && e.hint } }
}
const baseView = (state, stateMeans) => ({
  meeting: 'm9', chair: 'c1', roster: ['c1', 'm1', 'm2'], subject: 'p-9',
  state, stateMeans: stateMeans === undefined ? null : stateMeans,
})
const MATRIX = [
  { state: 'closed', stateMeans: 'the meeting is closed', phase: 'ended', ended: true, readable: true },
  { state: 'lapsed', stateMeans: 'the meeting lapsed', phase: 'lapsed', ended: false, readable: true },
  { state: 'open', stateMeans: null, phase: 'running', ended: false, readable: true },
  { state: 'in_session', stateMeans: 'in session', phase: 'running', ended: false, readable: true },
  { state: 'recess', stateMeans: null, phase: 'running', ended: false, readable: true },
  { state: 'scheduled', stateMeans: 'scheduled', phase: 'not_started', ended: false, readable: true },
  { state: 'waiting', stateMeans: 'waiting', phase: 'not_started', ended: false, readable: true },
  { state: 'quantum-docket', stateMeans: null, phase: 'unknown', ended: false, readable: false },
  { state: undefined, stateMeans: undefined, phase: 'unknown', ended: false, readable: false },
]
// Every row is run and REDUCED to readings first, so each assertion below is an `are there any bad rows`
// question rather than a loop that could run zero times and report success. A vacuous pass is the run-28
// defect class ("looks checked, checked nothing"), so it is not allowed in the test that pins it.
const matrixRows = MATRIX.map((row) => {
  const fake = fakeKernel(baseView(row.state, row.stateMeans))
  const got = askDirect({ meeting: 'm9', proposition_id: 'p-9' }, fake)
  const rec = got.receipt || {}
  const body = (rec.mail && rec.mail.text) || ''
  const claimsEnd = body.includes('已结束辩论')
  const explainsUnreadable = body.includes('状态不可读') || body.includes('没有为这个状态名声明含义')
  return {
    label: 'state ' + J(row.state), code: got.code,
    phase: rec.closurePhase, phaseExpected: row.phase,
    readableClaim: rec.mail && rec.mail.stateReadable, readableExpected: row.readable,
    claimsEnd, endExpected: row.ended, saysWhyUnreadable: row.readable === false ? explainsUnreadable : true,
    body: body.slice(0, 200),
  }
})
const badPhase = matrixRows.filter((r) => !(r.code === undefined && r.phase === r.phaseExpected))
const badReadable = matrixRows.filter((r) => r.readableClaim !== r.readableExpected)
const badEnd = matrixRows.filter((r) => r.claimsEnd !== r.endExpected)
const badUnreadable = matrixRows.filter((r) => !r.saysWhyUnreadable)
const oneEndedState = MATRIX.filter((r) => r.ended).length === 1
ok(matrixRows.length === 9 && badPhase.length === 0,
  '② all 9 kernel states drive closurePhase from the real state (the phase FOLLOWS the state, it is not one fixed sentence)',
  { rows: matrixRows.length, bad: badPhase.map((r) => r.label + ' ⇒ ' + J(r.phase) + ' (want ' + J(r.phaseExpected) + ', code ' + J(r.code) + ')') })
ok(badReadable.length === 0,
  '② every row reports mail.stateReadable matching the view (an unreadable view is labelled, never assumed readable)',
  { rows: matrixRows.length, bad: badReadable.map((r) => r.label + ' ⇒ ' + J(r.readableClaim)) })
ok(badEnd.length === 0,
  '② only the CLOSED view lets the body claim the debate ended (nine rows, exactly one licence)',
  { rows: matrixRows.length, bad: badEnd.map((r) => r.label + ' claimsEnd=' + r.claimsEnd + ' want=' + r.endExpected) })
ok(badUnreadable.length === 0,
  '② an unreadable view makes the body say WHY no closure is asserted (状态不可读 / no declared meaning)',
  { rows: matrixRows.length, bad: badUnreadable.map((r) => ({ label: r.label, body: r.body })) })
ok(MATRIX.length === 9 && oneEndedState,
  '② the matrix is non-empty and exactly ONE kernel state licenses the "ended" claim (a rule with one writing state)', { cases: MATRIX.length })

// ★ A caller-named population on a meeting where the DERIVED set skipped nobody: `excluded` is empty, so the
// `excludedMeans` sentence must say it describes the derived set and NOTHING about this call — the pre-fix wording
// ("this list is what the derived set would have left out (the chair presides)") was a sentence about a chair row
// that this call did not have. A means sentence that describes a row it never saw is the same defect class as the
// unreconcilable counts: prose asserting facts the receipt does not carry.
const noChairRow = fakeKernel({ meeting: 'm9', chair: 'c1', roster: ['m1'], subject: 'p-9', state: 'open', stateMeans: null },
  { spokeBy: [], roster: ['m1'] })
const overrideRec = (askDirect({ meeting: 'm9', proposition_id: 'p-9', members: ['m1'] }, noChairRow).receipt) || {}
ok(overrideRec.ok === true && overrideRec.asked.length === 1 && overrideRec.asked[0] === 'm1',
  '② a caller-named population is asked as given even when the derived set had nothing to exclude', { asked: overrideRec.asked, code: overrideRec.code })
ok(Array.isArray(overrideRec.excluded) && overrideRec.excluded.length === 0 && typeof overrideRec.excludedMeans === 'string'
  && overrideRec.excludedMeans.includes('says nothing about who was skipped'),
  '② with an EMPTY `excluded` the means sentence says it says nothing about THIS call (no invented chair row)', { means: overrideRec.excludedMeans })

console.log('=== 2c. THE REAL KERNEL CANNOT PUBLISH A CLOSED VIEW — AND THE ASK DOES NOT INVENT ONE ===')
const closedResult = await call(b, 'vibe_vmu_meeting', { action: 'close', id: mid, member: 'acad-01' })
ok(R(closedResult).ok === true, '2c. the debate meeting really closes (setup for the next assertion)', { code: R(closedResult).code })
const afterClose = R(await call(b, 'vibe_v5_verdict_ask', { meeting: mid, proposition_id: 'p-unknown' }))
ok(afterClose.ok === false && typeof afterClose.code === 'string' && /^[A-Z][A-Z0-9_]+$/.test(afterClose.code),
  '2c. asking about a CLOSED meeting is REFUSED BY NAME by the kernel (no view ⇒ no state ⇒ no closure to assert), never answered with a made-up closure', { code: afterClose.code, message: String(afterClose.message || '').slice(0, 160) })

// ── ③ THE PROPOSITION IS CHECKED ───────────────────────────────────────────────────────────────────────────────────
console.log('=== 3. A PROPOSITION THAT NAMES NOTHING IS REFUSED BY NAME, BEFORE THE MAILBOX ===')
// A second debate meeting: the first one is closed, and a fresh view keeps this section order-independent.
const convened2 = await call(b, 'vibe_v5_meeting', { agenda: '辩论 p-unknown', type: 'debate', subject: 'p-unknown', member: 'acad-01' })
const mid2 = R(convened2).meeting
for (const m of ['acad-01', 'res-01', 'res-02']) await call(b, 'vibe_vmu_meeting', { action: 'attend', id: mid2, member: m })
await call(b, 'vibe_vmu_meeting', { action: 'speak', id: mid2, member: 'res-01', text: 'evidence' })
const library = await call(b, 'vibe_v5_read_library', { track: 'propositions' })
const libraryTotal = R(library).total
ok(libraryTotal === 0, '3. the propositions library is REALLY empty here — the next refusal is about absence, not about a missing field', { total: libraryTotal })

const typo = R(await call(b, 'vibe_v5_verdict_ask', { meeting: mid2, proposition_id: 'p-typo' }))
ok(typo.ok === false && typo.code === 'VMU_ASK_UNKNOWN_PROPOSITION',
  '③ an id that is neither a card nor the declared debate object is refused by name `VMU_ASK_UNKNOWN_PROPOSITION`', { code: typo.code, ok: typo.ok })
ok(String(typo.message || '').includes('p-typo') && String(typo.message || '').includes('p-unknown'),
  '③ the message names BOTH the bad id and the object this meeting actually debated (caller vocabulary, not a generic rejection)', { message: String(typo.message || '').slice(0, 240) })
ok(typeof typo.hint === 'string' && typo.hint.includes('vibe_v5_record_proposition') && (typo.hint.includes('.md') || typo.hint.includes('文件名') || typo.hint.includes('FILE')),
  '③ the hint names the tool that would make it valid AND the file-reference shape v5r allows', { hint: String(typo.hint || '').slice(0, 240) })

const cardShaped = R(await call(b, 'vibe_v5_verdict_ask', { meeting: mid2, proposition_id: 'r-deadbeef' }))
ok(cardShaped.ok === false && cardShaped.code === 'VMU_ASK_UNKNOWN_PROPOSITION',
  '③ an `r-…` id the library does not hold is refused too — the records track MINTS that shape, so absence there is a fact', { code: cardShaped.code })

// The refusal must land BEFORE the mailbox: an ask about nothing must not reach a single member's inbox.
const fakeRefuse = fakeKernel({ meeting: 'm9', chair: 'c1', roster: ['c1', 'm1', 'm2'], subject: 'p-9', state: 'open', stateMeans: null })
const fakeOutcome = askDirect({ meeting: 'm9', proposition_id: 'p-typo' }, fakeRefuse)
ok(fakeOutcome.code === 'VMU_ASK_UNKNOWN_PROPOSITION' && fakeRefuse.sent.length === 0,
  '③ the refusal is raised BEFORE `mailbox.send`: zero messages left the framework for an object nobody debated', { code: fakeOutcome.code, sent: fakeRefuse.sent.length })

console.log('=== 3b. THE THREE SHAPES THAT ARE ACCEPTED, EACH LABELLED ===')
const asSubject = R(await call(b, 'vibe_v5_verdict_ask', { meeting: mid2, proposition_id: 'p-unknown' }))
ok(asSubject.ok === true && asSubject.propositionKind === 'meeting-subject' && asSubject.propositionVerified === true && asSubject.fileChecked === null,
  "③ the meeting's own declared debate object is accepted as `meeting-subject` and marked verified BY the meeting", { kind: asSubject.propositionKind, verified: asSubject.propositionVerified })
ok(typeof asSubject.propositionWhy === 'string' && asSubject.propositionWhy.includes('meetingView.subject'),
  '③ `propositionWhy` names the field the verification read (no verification claim without its evidence)', { why: String(asSubject.propositionWhy || '').slice(0, 200) })

const asFile = R(await call(b, 'vibe_v5_verdict_ask', { meeting: mid2, proposition_id: 'docs/proof.md' }))
ok(asFile.ok === true && asFile.propositionKind === 'file-ref' && asFile.propositionVerified === false && asFile.fileChecked === false,
  '③ a FILE REFERENCE is accepted (v5r allows a file as the debate object) and honestly labelled: shape accepted, `fileChecked:false`', { kind: asFile.propositionKind, fileChecked: asFile.fileChecked })
ok(typeof asFile.propositionWhy === 'string' && asFile.propositionWhy.includes('NOT read'),
  '③ `propositionWhy` says the file was NOT read (a shape check is not a content check)', { why: String(asFile.propositionWhy || '').slice(0, 200) })

const recorded = await call(b, 'vibe_v5_record_proposition', { member: 'res-01', title: '命题', statement: '一句话命题', value: 1, motive: 'run 29 test', p: 0.5 })
const cardId = R(recorded).recordId
// ROUND 42 (F-13): records are minted as `rec-<n>` now, members stay `r-<n>`. The setup still
// needs "a card", and a card is recognised by EITHER prefix (`verification-gates.js` keeps the old
// one readable so ledgers written before round 42 still work).
ok(R(recorded).ok === true && typeof cardId === 'string' && /^(rec|r)-/.test(cardId),
  '3b. a real proposition card is recorded (setup: the "card" label needs a card)', { recordId: cardId, code: R(recorded).code })
const asCard = R(await call(b, 'vibe_v5_verdict_ask', { meeting: mid2, proposition_id: cardId }))
ok(asCard.ok === true && asCard.propositionKind === 'card' && asCard.propositionVerified === true && asCard.fileChecked === null,
  '③ a card the library HOLDS is accepted as `card` and marked verified — the ruling has a target list now', { kind: asCard.propositionKind, verified: asCard.propositionVerified })

console.log('=== 3c. WHEN NOTHING IS DECLARED, THE FACE SAYS IT CANNOT TELL (instead of refusing a legal shape) ===')
const convened3 = await call(b, 'vibe_v5_meeting', { agenda: '普通会议', member: 'acad-01' })
const mid3 = R(convened3).meeting
for (const m of ['acad-01', 'res-01', 'res-02']) await call(b, 'vibe_vmu_meeting', { action: 'attend', id: mid3, member: m })
const ordinaryView = kernel.meetings.meetingView({ meeting: mid3 })
ok(ordinaryView.subject === null || ordinaryView.subject === undefined,
  '3c. this meeting really declared NO debate object (so the ambiguity below is real)', { subject: ordinaryView.subject })
const unverified = R(await call(b, 'vibe_v5_verdict_ask', { meeting: mid3, proposition_id: 'p-demo' }))
ok(unverified.ok === true && unverified.propositionKind === 'unverified' && unverified.propositionVerified === false,
  '③ with nothing declared, a one-line proposition is still accepted — it is a LEGAL v5r debate object — and labelled `unverified`', { kind: unverified.propositionKind, ok: unverified.ok })
ok(typeof unverified.propositionWhy === 'string' && unverified.propositionWhy.includes('一句话命题'),
  '③ `propositionWhy` says the face cannot tell a legal one-line proposition from a typo (the limit is disclosed, not hidden)', { why: String(unverified.propositionWhy || '').slice(0, 220) })

// ── ④ THE DEAD `askedWhy` BRANCHES ──────────────────────────────────────────────────────────────────────────────────
console.log('=== 4. `askedWhy` NOW BRANCHES ON THE VALUES THE CODE ACTUALLY ASSIGNS ===')
const explicit = R(await call(b, 'vibe_v5_verdict_ask', { meeting: mid2, proposition_id: 'p-unknown', members: ['res-01'] }))
ok(explicit.ok === true && explicit.askedSource === 'members' && explicit.asked.length === 1 && explicit.asked[0] === 'res-01',
  '④ an explicit `members` list is reported with `askedSource:"members"` and IS the population (not widened)', { askedSource: explicit.askedSource, asked: explicit.asked })
ok(typeof explicit.askedWhy === 'string' && explicit.askedWhy.includes('REPLACES') && !explicit.askedWhy.includes('UNION'),
  '④ the explicit call is described as REPLACING the derived set — the run-29 dead branch used to describe it as a union it never used', { askedWhy: String(explicit.askedWhy || '').slice(0, 220) })
ok(typeof explicit.excludedMeans === 'string' && explicit.excludedMeans.includes('DERIVED'),
  '④ `excludedMeans` says the excluded rows describe the DERIVED set, not who was skipped in an explicit call', { excludedMeans: String(explicit.excludedMeans || '').slice(0, 200) })
ok(typeof explicit.accounting.means === 'string' && explicit.accounting.means.includes('caller named `members`'),
  '④ `accounting.means` refuses to reconcile an explicit call against the meeting roster (the numbers belong to different populations)', { means: String(explicit.accounting.means || '').slice(0, 200) })

const askSource = await import('node:fs/promises').then((fs) => fs.readFile(join(REPO, 'vibe-math-vmu', 'packs', 'v5r', 'tools.js'), 'utf8'))
// Scope the static pin to THIS face: other tools in the same file legitimately compare `source === 'explicit'`, and a
// whole-file grep would either fail on them or (worse) pass because of them. Comments are stripped as well, because the
// ★ comment ABOVE the branches quotes the dead comparisons it replaced — a pin that reads its own explanation would
// fail on the fix itself.
const codeOnly = (text) => text.split('\n').filter((line) => {
  const s = line.trim()
  return s !== '' && !s.startsWith('//') && !s.startsWith('/*') && !s.startsWith('*')
}).join('\n')
const askBody = codeOnly(askSource.slice(askSource.indexOf('function toolVerdictAsk'), askSource.indexOf('function toolMeeting(')))
ok(askBody.length > 1000, '④ the pinned region really is the ask handler (a slice that silently became empty would pass every check below)', { length: askBody.length })
ok(askBody.includes("source === 'members'") && askBody.includes("source === 'spokeBy'") && !askBody.includes("source === 'explicit'") && !askBody.includes("source === 'speech'"),
  '④ STATIC PIN: the handler compares against the emitted values, and neither dead comparison (`explicit` / `speech`) survives inside it', {
    members: askBody.includes("source === 'members'"), spokeBy: askBody.includes("source === 'spokeBy'"),
    deadExplicit: askBody.includes("source === 'explicit'"), deadSpeech: askBody.includes("source === 'speech'"),
  })
ok(askBody.includes("source === 'minutes'") && codeOnly(askSource).includes("'roster+speech'"),
  '④ STATIC PIN: the minutes-only path is reachable in the handler and the union label the branch describes still exists in the derived set', {
    minutes: askBody.includes("source === 'minutes'"), unionLabel: codeOnly(askSource).includes("'roster+speech'"),
  })

// ── ⑤ THE DECLARATION PROMISES EXACTLY WHAT THE RECEIPT PUBLISHES ──────────────────────────────────────────────────
console.log('=== 5. THE DESCRIPTION NAMES EVERY FIELD AND REFUSAL THIS FACE NOW PRODUCES ===')
const desc = String((askSpec && askSpec.description) || '')
const promised = ['propositionKind', 'file-ref', 'fileChecked:false', 'meeting-subject', 'unverified', 'propositionWhy',
  'VMU_ASK_UNKNOWN_PROPOSITION', 'excluded', 'rosterCountMeans', 'accounting', 'meetingState', 'meetingStateMeans',
  'closurePhase', '状态不可读', 'mail.text', '`askedWhy` says why']
const missingFromDesc = promised.filter((field) => !desc.includes(field))
ok(desc.length > 0 && promised.length === 16 && missingFromDesc.length === 0,
  '⑤ the description names EVERY mechanism this round added (a described mechanism needs its consumer named)',
  { promised: promised.length, missing: missingFromDesc })
ok(desc.includes('"roster+speech" | "roster" | "spokeBy" | "minutes" | "members"'),
  '⑤ the declaration lists the SAME five `askedSource` values the code emits (run 29: it promised "speech" | "explicit" and emitted neither)', { values: desc.includes('| "members"') })

const receiptFields = ['propositionKind', 'propositionVerified', 'fileChecked', 'propositionWhy', 'excluded', 'excludedMeans',
  'rosterCountMeans', 'accounting', 'meetingState', 'meetingStateMeans', 'closurePhase', 'closureMeans', 'mail']
const missing = receiptFields.filter((f) => !(f in first))
ok(missing.length === 0, '⑤ every field this round adds is actually IN the receipt (a promised field with no value is the run-28 defect again)', { missing })
ok(first.propositionKind === 'meeting-subject' && first.propositionVerified === true && first.fileChecked === null,
  '⑤ the receipt carries the proposition labels too — the two faces (declaration and receipt) agree', { kind: first.propositionKind, verified: first.propositionVerified, fileChecked: first.fileChecked })

console.log('\n=== VMU RUN 29 VERDICT ASK: ' + passed + ' passed, ' + failed + ' failed ===')
if (failed > 0) { for (const f of failures) console.error('  - ' + f); process.exit(1) }

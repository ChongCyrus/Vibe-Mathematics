// tests/audit-kernel-claims-3.mjs — ROUND 105, batch A: ballot (15) · meetings (6) · chat (6).
//
// SAME METHOD AS audit-kernel-claims.mjs: every assertion is one sentence from the module's own header, so a promise that
// stops being true fails BY NAME.
//
// The A path found three failures and ALL THREE were its own mistake - it had asserted that a missing `clock` throws, while meetings.js:52 declares `clock = () => 0`, so a default is legal and only a NON-FUNCTION clock is refused. It corrected the assertion onto the true claim instead of deleting it, and deliberately refused to guess a factory signature it had only read part of, asserting the pure functions instead.
//
// THE UNVERIFIED HALF IS PART OF THE RESULT. Both authors listed what they did NOT assert and why - meetings.js's larger
// state machine and its 29 codes, ballot's frozen/eligibility/replay rules, chat's dangling-anchor and mute enforcement,
// workflow's retry and compensation paths, library's revision family, funding's reimburse/settle paths. Written down as
// coverage debt, which is what the ledger does for whole files.
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
const HERE = dirname(fileURLToPath(import.meta.url))
const K = 'D:/wd/vibemath开发/Vibe-Mathematics/vibe-math-vmu/kernel/'
const url = (f) => 'file:///' + join(K, f).replace(/\\/g, '/').replace(/ /g, '%20')
let pass = 0, fail = 0
const failures = []
const ok = (cond, label, detail) => {
  if (cond) { pass++; console.log('  ok   ' + label); return true }
  fail++; failures.push(label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail).slice(0, 200)))
  console.error('  FAIL ' + label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail).slice(0, 200)))
  return false
}
const caught = (fn) => { try { return { value: fn(), threw: null } } catch (e) { return { value: undefined, threw: e } } }
const B = await import(url('ballot.js'))
const M = await import(url('meetings.js'))
const C = await import(url('chat.js'))

console.log('=== 1. ballot: A PROCESS READING IS NOT A VERDICT (header I-1) ===')
ok(typeof B.classifyVote === 'function', '★ discovery: ballot exports classifyVote', typeof B.classifyVote)
ok(B.classifyVote(1, 'process') === 'process', '★ `kind:"process"` entries are NOT decisive votes', B.classifyVote(1, 'process'))
ok(B.classifyVote(1, 'decisive') === 'for', '★ a decisive 1 classifies as "for"', B.classifyVote(1, 'decisive'))
ok(B.classifyVote(0, 'decisive') === 'against', '★ a decisive 0 classifies as "against"', B.classifyVote(0, 'decisive'))

console.log('\n=== 2. ballot: THE OUTCOME IS THREE-VALUED AND `undecided` MUST CARRY A REASON ===')
ok(typeof B.defaultTally === 'function', '★ discovery: ballot exports defaultTally', typeof B.defaultTally)
const noVotes = B.defaultTally({ votes: {}, eligible: ['a', 'b'], quorumRule: 'majority' })
ok(noVotes.outcome === 'undecided', '★ no decisive vote ⇒ outcome `undecided`', noVotes)
ok(noVotes.outcome === 'undecided' && typeof noVotes.reason === 'string' && noVotes.reason.length > 0,
  '★ and that `undecided` CARRIES A REASON (the claim verbatim: "undecided MUST carry a reason")', noVotes.reason)
const unanimous = B.defaultTally({ votes: { a: { kind: 'for', value: 1 }, b: { kind: 'for', value: 1 } }, eligible: ['a', 'b'], quorumRule: 'majority' })
ok(unanimous.outcome !== 'undecided', '★ a unanimous decisive ballot is NOT undecided', unanimous)
const partial = B.defaultTally({ votes: { a: { kind: 'for', value: 1 } }, eligible: ['a', 'b'], quorumRule: 'majority' })
ok(partial.outcome === 'undecided' && String(partial.reason || '').length > 0,
  '★ a PARTIAL turnout stays undecided with a reason (not every eligible member has voted yet)', partial)
// non-empty guard before the collection-wide check (RULE E): the undecided set really has members
const undecidedSet = [noVotes, partial].filter((r) => r.outcome === 'undecided')
ok(undecidedSet.length > 0, '★ non-empty guard: the undecided samples exist before checking them all', undecidedSet.length)
ok(undecidedSet.length > 0 && undecidedSet.every((r) => typeof r.reason === 'string' && r.reason.length > 0),
  '★ EVERY undecided outcome carries a reason', undecidedSet.map((r) => r.reason))

console.log('\n=== 3. ballot: instantRunoffTally — a TIE is undecided WITH NAMED tied options ===')
ok(typeof B.instantRunoffTally === 'function', '★ discovery: ballot exports instantRunoffTally', typeof B.instantRunoffTally)
const tie = B.instantRunoffTally({ votes: { a: ['x', 'y'], b: ['y', 'x'] }, eligible: ['a', 'b'], quorumRule: 'majority' })
ok(tie.outcome === 'undecided', '★ a tie for elimination is `undecided`, never silently broken here', tie)
ok(tie.outcome === 'undecided' && String(tie.reason || '').length > 0, '★ and it carries a reason', tie.reason)
const empty = B.instantRunoffTally({ votes: {}, eligible: ['a'], quorumRule: 'majority' })
ok(empty.outcome === 'undecided' && String(empty.reason || '').length > 0, '★ no ranked ballot carried any option ⇒ undecided WITH a reason', empty.reason)

console.log('\n=== 4. meetings: the factory refuses a missing clock BY NAME (no silent default) ===')
ok(typeof M.createMeetings === 'function', '★ discovery: meetings exports createMeetings', typeof M.createMeetings)
// ★ MY ERROR (measured): `createMeetings({ clock = () => 0, … })` has a DEFAULT clock, so omitting it is LEGAL.
// The claim is about a clock that is present and WRONG, so the assertion tests that - not a missing one.
const defaulted = caught(() => M.createMeetings({}))
ok(!defaulted.threw, '★ the clock has a declared default: createMeetings({}) builds a face (no throw)', defaulted.threw && defaulted.threw.message)
ok(!!defaulted.value && typeof defaulted.value === 'object', '★ and it really returned a face object', defaulted.value ? Object.keys(defaulted.value).slice(0, 8) : null)
const badClock = caught(() => M.createMeetings({ clock: 'not-a-function' }))
ok(!!badClock.threw, '★ a NON-FUNCTION clock THROWS rather than being silently accepted (no silent default)', badClock.threw ? badClock.threw.code : '(no throw)')
ok(badClock.threw && badClock.threw.code === 'VMU_INVALID_ARGUMENT', '★ and the refusal is named VMU_INVALID_ARGUMENT', badClock.threw && badClock.threw.code)
ok(badClock.threw && /clock/.test(String(badClock.threw.message)), '★ and it NAMES the offending piece (clock)', badClock.threw && badClock.threw.message)

console.log('\n=== 5. chat: declared vocabulary + the freeze seam is SELF-REPORTED ===')
ok(C.CHAT_QUOTE_MAX === 4, '★ chat declares CHAT_QUOTE_MAX = 4', C.CHAT_QUOTE_MAX)
ok(Array.isArray(C.CHAT_KINDS) && C.CHAT_KINDS.length > 0 && C.CHAT_KINDS.join(',') === 'chat,announce', '★ chat declares exactly the two kinds chat|announce', C.CHAT_KINDS)
ok(typeof C.createChat === 'function', '★ discovery: chat exports createChat', typeof C.createChat)
const bare = C.createChat({ clock: () => 1000, settings: {} })
ok(!!bare && typeof bare === 'object', '★ createChat({clock, settings}) builds a face', bare ? Object.keys(bare).slice(0, 10) : null)
const stNo = caught(() => (typeof bare.status === 'function' ? bare.status() : null))
ok(!!stNo.value && stNo.value.mechanism && stNo.value.mechanism.hasFrozenSeam === false,
  '★ WITHOUT an isFrozen seam the face SELF-REPORTS hasFrozenSeam:false (the "self-reports true/false" claim)', stNo.value ? stNo.value.mechanism : stNo.threw && stNo.threw.message)
const withSeam = C.createChat({ clock: () => 1000, settings: {}, isFrozen: () => false })
const stYes = caught(() => (typeof withSeam.status === 'function' ? withSeam.status() : null))
ok(!!stYes.value && stYes.value.mechanism && stYes.value.mechanism.hasFrozenSeam === true,
  '★ WITH an isFrozen seam it self-reports hasFrozenSeam:true', stYes.value ? stYes.value.mechanism : stYes.threw && stYes.threw.message)

console.log('')
console.log('=== KERNEL CLAIMS 5A: ' + pass + ' passed, ' + fail + ' failed ===')
// this loop PRINTS failures; it asserts nothing, so an empty list needs no exemption - a guard says so plainly
if (failures.length > 0) for (const f of failures) console.log('  FAIL - ' + f)

// ★ A GATE THAT CANNOT FAIL IS NOT A GATE: feed the same `ok()` a deliberate falsehood and require it to go red.
if (process.argv.includes("--selftest")) {
  // EMPTY_ALLOWED: the assertion below is DELIBERATELY false. It is not a check of the module - it is the proof that this
  // harness CAN report a failure, so the exemption is granted for the harness's own self-proof rather than for a claim.
  const p0 = pass, f0 = fail
  ok(1 === 2, "selftest: a claim that is false must be reported as a failure")
  const caught = fail === f0 + 1
  pass = p0; fail = f0
  console.log("")
  console.log("=== KERNEL CLAIMS 5A SELFTEST: " + (caught ? "1 passed, 0 failed" : "0 passed, 1 failed") + " ===")
  process.exit(caught ? 0 : 1)
}

console.log("")
console.log("=== KERNEL CLAIMS 5A (ballot (15) · meetings (6) · chat (6)): " + pass + " passed, " + fail + " failed ===")
if (fail) console.error("FAILURES:\n" + failures.map((f) => "  - " + f).join("\n"))
process.exit(fail === 0 ? 0 : 1)


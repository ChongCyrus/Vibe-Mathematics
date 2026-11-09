// tests/vmu-run257-delivery-unavailable.test.mjs — RUN 257 / TB-2645 (task-126, TB-2611 item 4).
//
// THE MEASURED GAP: when the delivery seam threw, the turn row flipped to `undelivered` and named the code, but the row
// could not say the one thing the office needed: THE MEMBER NEVER RAN. A failed delivery therefore looked like a turn that
// happened (and, worse, `turnReceipts` rows and `memberWorkShare` had no way to keep such a row out of the member count:
// a hole could be re-read as a member act). This suite holds the FOURTH decidable state:
//
//   deliveryUnavailable: true  — the prompt never reached the member (timeout / error / not-configured / engine-lost-reply)
//   deliveryUnavailable: false — the seam did hand the turn over (applied rows say this explicitly, never null)
//   the row's deliveryPath MUST be null in the unavailable case — "caller" means the office CHOSE to play the turn, a
//     broken delivery is not a choice, so mixing them would launder a failure into a route.
//   and `workShareOf` counts the writes of such a row as unknownActs (never member), with a means sentence that says
//   "N 个回合投递不可用，成员未运行".
//
// §0 the shape is named in the source (row slots, whitelist, both failure branches, classifier order)
// §1 a real kernel whose seam throws a timeout: the row carries the three keys, deliveryPath stays null, the error carries
//    the same facts, and the batch receipt lifts them
// §2 no delivery seam at all ⇒ not-configured, still named
// §3 the engine lost the reply (VMU_ENGINE_UNAVAILABLE, "handed back no reply") ⇒ why engine-lost-reply, never smoothed to timeout
// §4 an unnamed throw ⇒ why error, closedWith the fallback code
// §5 deliverMode caller is NOT a failure: an awaiting envelope must not manufacture an unavailable row
// §6 workShareOf: unavailable writes are unknown, the count travels, the means says the sentence, and an empty proof is null
// §7 ANTI-FAKE-GREEN: the same shape with deliveryUnavailable:false must classify as member or office (both unknown means the
//    classifier is dead); flipping the flag moves the reading; a forged true+caller row is unknown, never office
// §8 one arithmetic on real rows: an independent classifier over the published rows equals the kernel number
// §9 the contract lines exist (docs/03 status face + turn face, docs/26 row fields)
//
// Run: node tests/vmu-run257-delivery-unavailable.test.mjs    Last line: N passed, M failed

import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..')
const km = await import(pathToFileURL(join(REPO, 'vibe-math-vmu', 'kernel', 'index.js')).href)
const turnModule = await import(pathToFileURL(join(REPO, 'vibe-math-vmu', 'kernel', 'turn', 'index.js')).href)
const workShareOf = turnModule.workShareOf
const TURN_SRC = await readFile(join(REPO, 'vibe-math-vmu', 'kernel', 'turn', 'index.js'), 'utf8')

let passed = 0
let failed = 0
const failures = []
const ok = (cond, label, detail) => {
  if (cond) { passed++; console.log('  ok   ' + label); return true }
  failed++
  failures.push(label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  console.error('  FAIL ' + label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  return false
}
const section = (name) => console.log(String.fromCharCode(10) + name)

const NL = String.fromCharCode(10)
const fence = (obj) => ['```json', JSON.stringify(obj), '```'].join(NL)
const roots = []
const mkRoot = async () => { const d = await mkdtemp(join(tmpdir(), 'vmu-r257du-')); roots.push(d); return d }

const boot = async (extra = {}) => {
  const root = await mkRoot()
  const k = km.createKernel(Object.assign({ root, clock: () => 1000, settings: {} }, extra))
  await k.store.open()
  return k
}
const runTurn = (k, why) => k.turn.run({ member: 'm-1', phase: 'normal', round: 1, role: 'researcher', roleLabel: '常驻研究员', why })
const rowsOf = (k) => k.turn.status({ roster: ['m-1'] }).turnReceipts || []
const rowOf = (k) => rowsOf(k)[0] || null
const caught = async (fn) => { try { await fn(); return null } catch (e) { return e } }

// INDEPENDENT RECOMPUTATION: written here from the published rows only; it does not import workShareOf and it reads the
// fourth state FIRST (that order is the semantics under test, not an implementation detail).
const classify = (rows) => {
  let member = 0
  let office = 0
  let unknown = 0
  let unavailableTurns = 0
  for (const row of Array.isArray(rows) ? rows : []) {
    const n = row && Array.isArray(row.writes) ? row.writes.length : 0
    if (n === 0) continue
    if (row && row.deliveryUnavailable === true) { unknown += n; unavailableTurns += 1; continue }
    const path = row && typeof row.deliveryPath === 'string' ? row.deliveryPath : ''
    if (path === '') unknown += n
    else if (path === 'caller') office += n
    else member += n
  }
  return { memberActs: member, officeRelayedActs: office, unknownActs: unknown, unavailableTurns,
    memberShare: member + office > 0 ? Math.round((member / (member + office)) * 10000) / 10000 : null }
}

try {
  // ────────────────────────────────────────────────────────────────────────────────────────────────────────────────
  section('§0 the fourth state is a NAMED shape in the source (slots, whitelist, both failure exits, classifier order)')
  ok(/deliveryUnavailable: null,/.test(TURN_SRC), '§0a the row template owns the slot from OPEN time (null = a named meaning)')
  ok(TURN_SRC.includes('deliveryUnavailableWhy: null,') && TURN_SRC.includes('deliveryUnavailableMeans: null,'),
    '§0b the how and the why-sentence are row slots too, not ad-hoc keys on one branch')
  ok(TURN_SRC.includes('if (patch.deliveryUnavailable === true) {') && TURN_SRC.includes('} else if (patch.deliveryUnavailable === false) {'),
    '§0c the ledger keeps BOTH values: true names the state, false says the seam did hand the turn over (never null)')
  ok(TURN_SRC.includes('deliveryUnavailable: false,'), '§0d the APPLIED row says false explicitly (four decidable states, no silent null)')
  ok(TURN_SRC.includes('const unavailableWhy = deliveryUnavailableWhyOf(e)'), '§0e the throwing exit derives the why from the seam error')
  ok(TURN_SRC.includes('deliveryUnavailableWhy: why,') && TURN_SRC.includes('settledBy: \'delivery-threw\''),
    '§0f the throwing exit writes the state on the SAME row it closes as undelivered')
  const noSeamMark = TURN_SRC.indexOf('deliveryUnavailableWhy: why,')
  const noSeamFail = TURN_SRC.indexOf("fail('VMU_ENGINE_UNAVAILABLE', 'no delivery adapter is wired")
  ok(noSeamMark !== -1 && noSeamFail !== -1 && noSeamMark < noSeamFail,
    '§0g the no-seam exit names not-configured BEFORE it refuses (a refusal is still a row)')
  const wsBody = TURN_SRC.slice(TURN_SRC.indexOf('export function workShareOf'), TURN_SRC.indexOf('export function sendViaSubagents'))
  ok(wsBody.indexOf('row.deliveryUnavailable === true') !== -1 && wsBody.indexOf('row.deliveryUnavailable === true') < wsBody.indexOf('row.deliveryPath'),
    '§0h the classifier reads the fourth state BEFORE deliveryPath (a broken delivery is not a route)')
  ok(wsBody.includes('deliveryUnavailableTurns'), '§0i the count travels with the ratio so a reader can see what was excluded')
  ok(wsBody.includes('成员未运行'), '§0j the means says the sentence the acceptance can assert externally')
  ok(TURN_SRC.includes('if (e.deliveryUnavailable === true) {'), '§0k the batch/step failure receipt lifts the same facts (the error is not the only place)')
  ok(TURN_SRC.includes('\'delivery-unavailable\':'), '§0l classifiedBy names the fourth class and its field')

  // ────────────────────────────────────────────────────────────────────────────────────────────────────────────────
  section('§1 a real kernel whose delivery seam TIMED OUT: the row says the member never ran, and the route stays null')
  const timeoutSeam = async () => { const e = new Error('the seam gave up waiting'); e.code = 'VMU_TURN_DELIVERY_TIMEOUT'; e.deliveryPath = 'one-shot'; e.stillRunning = true; throw e }
  const k1 = await boot({ deliverTurn: timeoutSeam })
  const threw1 = await caught(() => runTurn(k1, 'why the timeout row'))
  ok(threw1 !== null && threw1.code === 'VMU_TURN_DELIVERY_TIMEOUT', '§1a premise: the seam threw a named timeout', threw1 && threw1.code)
  const row1 = rowOf(k1)
  ok(row1 !== null, '§1b the settled row exists (a refusal without a row would be a silent turn)')
  ok(row1 && row1.status === 'undelivered', '§1c status is undelivered, not applied', row1 && row1.status)
  ok(row1 && row1.deliveryUnavailable === true, '§1d ★ the row names the fourth state', row1 && row1.deliveryUnavailable)
  ok(row1 && row1.deliveryUnavailableWhy === 'timeout', '§1e ★ the why is the seam code translated, not a guess', row1 && row1.deliveryUnavailableWhy)
  ok(row1 && row1.deliveryPath === null, '§1f ★ deliveryPath is NULL: a timeout is not the office choosing to play the turn', row1 && row1.deliveryPath)
  ok(row1 && typeof row1.deliveryUnavailableMeans === 'string' && row1.deliveryUnavailableMeans.includes('成员未运行'),
    '§1g ★ the means sentence is on the row (未运行 is assertable, not inferred)', row1 && row1.deliveryUnavailableMeans)
  ok(threw1 && threw1.deliveryUnavailable === true && threw1.deliveryUnavailableWhy === 'timeout' && typeof threw1.deliveryUnavailableMeans === 'string',
    '§1h the refused call itself carries the three facts (a caller that only catches the error can report them)')
  const lastFail1 = k1.turn.status({ roster: ['m-1'] }).counts.deliveryLastFail
  ok(lastFail1 && lastFail1.deliveryUnavailable === true && lastFail1.deliveryUnavailableWhy === 'timeout',
    '§1i deliveryLastFail names the same state (one fact, not two vocabularies)', lastFail1 && lastFail1.deliveryUnavailableWhy)
  const k1b = await boot({ deliverTurn: timeoutSeam })
  const rec1 = await k1b.turn.drive({ members: ['m-1'] })
  const fail1 = (rec1.failures || [])[0] || null
  ok(fail1 !== null, '§1j the batch path produced a failure row (that is where a batch reader looks)')
  ok(fail1 && fail1.deliveryUnavailable === true && fail1.deliveryUnavailableWhy === 'timeout',
    '§1k ★ the batch failure row lifts the same two facts (the step/drive receipt is not the poorer reader)', fail1 && fail1.deliveryUnavailableWhy)

  // ────────────────────────────────────────────────────────────────────────────────────────────────────────────────
  section('§2 NO seam at all ⇒ not-configured, and the refusal still leaves a named row')
  const k2 = await boot({})
  const threw2 = await caught(() => runTurn(k2, 'why no seam'))
  ok(threw2 !== null && threw2.code === 'VMU_ENGINE_UNAVAILABLE', '§2a the kernel refuses by name when no adapter is wired', threw2 && threw2.code)
  const row2 = rowOf(k2)
  ok(row2 !== null && row2.status === 'undelivered', '§2b the refusal did not leave an open lie behind', row2 && row2.status)
  ok(row2 && row2.deliveryUnavailable === true && row2.deliveryUnavailableWhy === 'not-configured',
    '§2c ★ the why distinguishes "nothing configured" from "it broke"', row2 && row2.deliveryUnavailableWhy)
  ok(row2 && row2.deliveryPath === null, '§2d still null: not configured is not the caller route')

  // ────────────────────────────────────────────────────────────────────────────────────────────────────────────────
  section('§3 the ENGINE LOST the reply: engine-lost-reply, never smoothed into timeout')
  const lostSeam = async () => { const e = new Error('the host accepted the turn but handed back no reply'); e.code = 'VMU_ENGINE_UNAVAILABLE'; throw e }
  const k3 = await boot({ deliverTurn: lostSeam })
  await caught(() => runTurn(k3, 'why engine lost'))
  const row3 = rowOf(k3)
  ok(row3 && row3.deliveryUnavailable === true, '§3a the row is unavailable')
  ok(row3 && row3.deliveryUnavailableWhy === 'engine-lost-reply',
    '§3b ★ the shape the 65th live run hit is named for itself, not folded into timeout', row3 && row3.deliveryUnavailableWhy)
  ok(row3 && row3.deliveryPath === null, '§3c and the route is still null')

  // ────────────────────────────────────────────────────────────────────────────────────────────────────────────────
  section('§4 an UNNAMED throw ⇒ error (the fallback names a class, never a made-up cause)')
  const k4 = await boot({ deliverTurn: async () => { throw new Error('boom') } })
  await caught(() => runTurn(k4, 'why unnamed'))
  const row4 = rowOf(k4)
  ok(row4 && row4.deliveryUnavailable === true && row4.deliveryUnavailableWhy === 'error',
    '§4a an unclassified throw is still decidable as unavailable/error', row4 && row4.deliveryUnavailableWhy)
  ok(row4 && row4.closedWith === 'VMU_TURN_DELIVERY_FAILED', '§4b the fallback code is unchanged (this task adds a why, not a new code)', row4 && row4.closedWith)

  // ────────────────────────────────────────────────────────────────────────────────────────────────────────────────
  section('§5 deliverMode caller is NOT a failure: an awaiting envelope must not manufacture an unavailable row')
  const k5 = await boot({ deliverTurn: async ({ turn }) => ({ awaiting: true, memberPrompt: 'the prompt for ' + String(turn && turn.id) }) })
  const res5 = await caught(() => runTurn(k5, 'why caller route'))
  ok(res5 === null, '§5a the caller-played route did not throw')
  const rows5 = rowsOf(k5)
  // RULE E (T1 2026-11-09): §5b/§5c quantify over rows5, so an empty rows5 would make them pass over nothing.
  // The guard is the fact itself: a turn that ran and did not throw must have published its row.
  ok(rows5.length > 0, '§5b-pre the caller-played turn published at least one row (so §5b/§5c quantify over something)', rows5)
  const unavailable5 = rows5.filter((r) => r && r.deliveryUnavailable === true)
  ok(unavailable5.length === 0, '§5b ★ the route the office CHOSE is not recorded as a broken delivery', unavailable5)
  ok(rows5.every((r) => r.status !== 'undelivered' || r.deliveryUnavailable === true), '§5c no row claims undelivered without saying unavailable')

  // ────────────────────────────────────────────────────────────────────────────────────────────────────────────────
  section('§6 workShareOf: an unavailable row is unknown, the count travels, the sentence is present, an empty proof is null')
  const base = { turn: 't-x', member: 'm-1', status: 'undelivered', deliveryPath: null, writes: [{ tool: 'v5_record' }] }
  const onlyUnavailable = workShareOf({ turns: [Object.assign({}, base, { deliveryUnavailable: true, deliveryUnavailableWhy: 'timeout' })] })
  ok(onlyUnavailable.unknownActs === 1, '§6a ★ the write is unknown, not member', onlyUnavailable.unknownActs)
  ok(onlyUnavailable.memberActs === 0 && onlyUnavailable.officeRelayedActs === 0, '§6b ★ a hole never becomes a member number', onlyUnavailable.memberActs)
  ok(onlyUnavailable.memberShare === null, '§6c with nothing proven the ratio is a NAMED absence (null), not 0 and not 1', onlyUnavailable.memberShare)
  ok(onlyUnavailable.deliveryUnavailableTurns === 1, '§6d the count is published beside the ratio', onlyUnavailable.deliveryUnavailableTurns)
  ok(onlyUnavailable.means.includes('1 个回合投递不可用，成员未运行'), '§6e ★ the means says the sentence with the count (外部可断言)', onlyUnavailable.means.slice(-160))
  ok(onlyUnavailable.acts === onlyUnavailable.memberActs + onlyUnavailable.officeRelayedActs + onlyUnavailable.unknownActs, '§6f acts is the sum of the three classes')
  ok(onlyUnavailable.classifiedBy['delivery-unavailable'] !== undefined, '§6g classifiedBy names the fourth class and what field it reads')
  const noUnavailable = workShareOf({ turns: [Object.assign({}, base, { deliveryPath: 'activation', deliveryUnavailable: false })] })
  ok(!noUnavailable.means.includes('个回合投递不可用'), '§6h when nothing is unavailable the sentence is absent, not "0 个" noise')

  // ────────────────────────────────────────────────────────────────────────────────────────────────────────────────
  section('§7 ANTI-FAKE-GREEN: same shape with the flag false must classify as member or office (both unknown = a dead classifier)')
  const liveMember = Object.assign({}, base, { deliveryPath: 'activation', deliveryUnavailable: false })
  const liveOffice = Object.assign({}, base, { deliveryPath: 'caller', deliveryUnavailable: false })
  const sMember = workShareOf({ turns: [liveMember] })
  const sOffice = workShareOf({ turns: [liveOffice] })
  ok(sMember.memberActs === 1 && sMember.unknownActs === 0, '§7a ★ the same row with deliveryUnavailable:false and a seat path is MEMBER', sMember.memberActs)
  ok(sOffice.officeRelayedActs === 1 && sOffice.unknownActs === 0, '§7b ★ with the caller path it is OFFICE-RELAYED', sOffice.officeRelayedActs)
  const flipped = workShareOf({ turns: [Object.assign({}, liveMember, { deliveryUnavailable: true })] })
  ok(flipped.memberActs === 0 && flipped.unknownActs === 1 && flipped.memberShare === null,
    '§7c ★ flipping the flag to true moves the reading (member 1 ⇒ unknown 1); the classifier is alive', { member: flipped.memberActs, unknown: flipped.unknownActs })
  const forged = workShareOf({ turns: [Object.assign({}, base, { deliveryPath: 'caller', deliveryUnavailable: true })] })
  ok(forged.officeRelayedActs === 0 && forged.unknownActs === 1,
    '§7d a forged true+caller row is UNKNOWN, never laundered into office-relayed (precedence, not a tie)', forged)
  const appliedRow = rowsOf(k1).find((r) => r.status === 'applied') || null
  ok(appliedRow === null || appliedRow.deliveryUnavailable === false,
    '§7e every APPLIED row carries an explicit false (the four states are decidable, no silent null)')

  // ────────────────────────────────────────────────────────────────────────────────────────────────────────────────
  section('§8 one arithmetic: an independent classifier over the published rows equals the kernel number')
  const k8 = await boot({ deliverTurn: async () => ({ reply: fence({ progress: '读了一篇论文，写下一行' }), deliveryPath: 'activation' }) })
  const okTurn = await caught(() => runTurn(k8, 'why the real member turn'))
  ok(okTurn === null, '§8a a successful seat turn settles without a throw', okTurn && okTurn.code)
  const rows8 = rowsOf(k8)
  const ext8 = classify(rows8)
  const ks8 = k8.turn.status({ roster: ['m-1'] }).memberWorkShare
  ok(ks8 && ks8.memberActs === ext8.memberActs && ks8.officeRelayedActs === ext8.officeRelayedActs && ks8.unknownActs === ext8.unknownActs,
    '§8b ★ the kernel reading equals the independent one (three classes)', { kernel: ks8, external: ext8 })
  ok(ks8 && ks8.memberShare === ext8.memberShare, '§8c the ratio agrees', { kernel: ks8 && ks8.memberShare, external: ext8.memberShare })
  ok(ks8 && Number.isInteger(ks8.deliveryUnavailableTurns), '§8d the fourth-state count is on the status face', ks8 && ks8.deliveryUnavailableTurns)
  const rowsRealWithUnavailable = workShareOf({ turns: rows8.concat([Object.assign({}, base, { turn: 't-un', deliveryUnavailable: true, deliveryUnavailableWhy: 'timeout' })]) })
  ok(rowsRealWithUnavailable.unknownActs === ext8.unknownActs + 1 && rowsRealWithUnavailable.memberShare === ext8.memberShare,
    '§8e ★ an unavailable act beside real member acts leaves the ratio untouched (it is not in the denominator)',
    { unknown: rowsRealWithUnavailable.unknownActs, share: rowsRealWithUnavailable.memberShare })

  // ────────────────────────────────────────────────────────────────────────────────────────────────────────────────
  section('§9 the contract lines exist (docs/03 status face + turn face, docs/26 row fields)')
  const DOC03 = await readFile(join(REPO, 'vibe-math-vmu', 'docs', '03-interface-contract.md'), 'utf8')
  const DOC26 = await readFile(join(REPO, 'vibe-math-vmu', 'docs', '26-turn-orchestration.md'), 'utf8')
  ok(DOC03.includes('memberWorkShare'), '§9a docs/03 registers the status face reading')
  ok(DOC03.includes('deliveryUnavailable'), '§9b docs/03 registers the fourth state')
  ok(DOC03.includes('deliveryPath'), '§9c docs/03 registers the route field and its four meanings')
  ok(DOC26.includes('deliveryUnavailable'), '§9d docs/26 registers the row fields')
  ok(DOC26.includes('deliveryPath'), '§9e docs/26 registers the route field')
} finally {
  for (const r of roots) await rm(r, { recursive: true, force: true, maxRetries: 5 }).catch(() => {})
}

console.log(String.fromCharCode(10) + '=== VMU RUN 257 DELIVERY UNAVAILABLE: ' + passed + ' passed, ' + failed + ' failed ===')
if (failed > 0) { console.error('failures:' + NL + failures.join(NL)); process.exitCode = 1 }

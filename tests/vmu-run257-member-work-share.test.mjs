// tests/vmu-run257-member-work-share.test.mjs — RUN 257 / TB-2611 (task-90) KERNEL HALF.
//
// THE MEASURED GAP: the office could read one row per settled turn (`turnReceipts`), and every tool receipt already named
// who acted (`callerIsSeat` / `ranInOwnTurn` / `memberActed` / `actedForMember`) — but NO reading aggregated the question
// the office actually asks: how much of the writing did the SEATS do themselves, and how much did the calling session play
// on their behalf? A turn row carried no `deliveryPath` at all, so "a turn happened" and "the member spoke" were the same
// line, and a caller-played (office relayed) turn was indistinguishable from a seat own-session turn.
//
// THE DERIVATION (read-only, no scheduling change): `workShareOf({turns})` reads the SAME rows `turnReceipts` publishes and
// classifies each act by ONE row-level receipt field — `deliveryPath`:
//   · `"caller"` ⇒ the CALLING session played this member turn (deliverByReturning parks it; attribution supplied-by-caller)
//     ⇒ office-relayed;
//   · any other NAMED path (activation / continuation / one-shot / a host seam name) ⇒ the seat own session ran it ⇒ member;
//   · absent ⇒ the ledger does not say WHO ran it ⇒ unknown, NEVER folded into member (same rule as RUN 249: null is a
//     named absence, not a default).
// `memberShare = memberActs / (memberActs + officeRelayedActs)` — unknownActs is NOT in the denominator, so an unproven
// act can neither inflate nor dilute the ratio; a null share means both proven sides are zero (nothing to divide).
//
// §0 the derivation is a named shape in the source (and the row now keeps deliveryPath)
// §1 a turn the seat own session ran ⇒ member
// §2 a turn the CALLING session played ⇒ office-relayed
// §3 synthesis: unknown is counted as unknown and is NOT member; empty proof ⇒ null share (named absence)
// §4 ANTI-FAKE-GREEN: the same scenario through the two real paths moves the share (1 ⇒ 0), and tampering with the row
//    field moves the recomputed reading the same way
// §5 one arithmetic: the identity holds, the recomputation from the published rows equals the kernel number, and the
//    reading travels on the kernel status the turn tool returns
//
// Run: node tests/vmu-run257-member-work-share.test.mjs    Last line: N passed, M failed

import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..')
const km = await import(pathToFileURL(join(REPO, 'vibe-math-vmu', 'kernel', 'index.js')).href)
const turnModule = await import(pathToFileURL(join(REPO, 'vibe-math-vmu', 'kernel', 'turn', 'index.js')).href)

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
const mkRoot = async () => { const d = await mkdtemp(join(tmpdir(), 'vmu-r257-')); roots.push(d); return d }

const boot = async (extra = {}) => {
  const root = await mkRoot()
  const k = km.createKernel(Object.assign({ root, clock: () => 1000, settings: {} }, extra))
  await k.store.open()
  return k
}
const runTurn = (k, why) => k.turn.run({ member: 'm-1', phase: 'normal', round: 1, role: 'researcher', roleLabel: '常驻研究员', why })
const idOf = (r) => (r && r.turn && typeof r.turn === 'object' ? String(r.turn.id) : String(r && r.turn))
const rowsOf = (k) => k.turn.status({ roster: ['m-1'] }).turnReceipts || []
const rowOf = (k, id) => rowsOf(k).find((r) => String(r.turn) === String(id)) || null

// THE INDEPENDENT RECOMPUTATION the acceptance asks for: a classifier written HERE from the published rows only (it does
// not import the kernel derivation and does not read `memberWorkShare`), so the two numbers are two sources of the truth.
const classify = (rows) => {
  let member = 0
  let office = 0
  let unknown = 0
  for (const row of Array.isArray(rows) ? rows : []) {
    const n = row && Array.isArray(row.writes) ? row.writes.length : 0
    if (n === 0) continue
    const path = row && typeof row.deliveryPath === 'string' ? row.deliveryPath : ''
    if (path === '') unknown += n
    else if (path === 'caller') office += n
    else member += n
  }
  const proven = member + office
  return { member, office, unknown, proven, share: proven > 0 ? Math.round((member / proven) * 10000) / 10000 : null }
}
const plainShare = (s) => (s && typeof s === 'object' ? { memberActs: s.memberActs, officeRelayedActs: s.officeRelayedActs, unknownActs: s.unknownActs, acts: s.acts, provenActs: s.provenActs, memberShare: s.memberShare } : s)

try {
  // ── §0 NAMED SHAPES IN THE SOURCE ───────────────────────────────────────────────────────────────────────────────
  section('§0 the derivation is a named shape in the source, and the row now keeps who ran the turn')
  {
    const turnSource = await readFile(join(REPO, 'vibe-math-vmu', 'kernel', 'turn', 'index.js'), 'utf8')
    ok(turnModule.workShareOf && typeof turnModule.workShareOf === 'function',
      '§0a workShareOf is exported (a reader outside the loop can re-derive, not just trust status)')
    ok(typeof turnModule.WORK_SHARE_MEANS === 'string' && turnModule.WORK_SHARE_MEANS.includes('unknownActs is NOT in that denominator'),
      '§0b the wording says BY NAME that unknown is not in the denominator')
    ok(turnSource.includes('      deliveryPath: null,') && turnSource.includes("if (typeof patch.deliveryPath === 'string'"),
      '§0c the turn row keeps deliveryPath from OPEN time and the settle patch copies it (the whitelist no longer drops it)')
    ok(turnSource.includes('memberWorkShare: workShareOf({ turns: Array.from(turnReceipts.values()) })'),
      '§0d status derives the share from the SAME rows turnReceipts publishes (one computation, no second ledger)')
    ok(turnSource.includes('classifiedBy: WORK_SHARE_CLASSIFIED_BY') && turnSource.includes("'office-relayed': 'row.deliveryPath === \"caller\""),
      '§0e the receipt carries the classification rule under classifiedBy (readable, not an implicit heuristic)')
    ok(turnSource.includes('no path proves NEITHER side') && turnSource.includes('never folded into'),
      '§0f the docblock states the unknown rule (no path proves neither side, so it is unknown and never member)')
  }

  // ── §1 A SEAT OWN-SESSION TURN IS MEMBER ────────────────────────────────────────────────────────────────────────
  section('§1 a turn the seat own session ran reads as member, recomputed from the published rows')
  {
    const k = await boot({ deliverTurn: async () => ({ reply: fence({ progress: '成员自己写的进展：第 3 节复核完成。' }), deliveryPath: 'fake-delegated' }) })
    const r = await runTurn(k, 'run257 member owned')
    const turnId = idOf(r)
    const row = rowOf(k, turnId)
    const share = k.turn.status({ roster: ['m-1'] }).memberWorkShare
    ok(r && r.ok === true && !r.awaiting, '§1a the turn settled (not parked)', r && { ok: r.ok, awaiting: r.awaiting, code: r.code })
    ok(row !== null && row.deliveryPath === 'fake-delegated',
      '§1b the settled row really records the delivery seam path', row && row.deliveryPath)
    ok(row !== null && Array.isArray(row.writes) && row.writes.length >= 1,
      '§1c the turn produced at least one record write (the act the share counts)', row && row.writes)
    const mine = classify(rowsOf(k))
    ok(mine.member === (row.writes || []).length && mine.office === 0 && mine.unknown === 0,
      '§1d the external classifier reads every act as member (path is a named non-caller seam)', mine)
    ok(share && share.memberActs === mine.member && share.officeRelayedActs === 0 && share.unknownActs === 0,
      '§1e the kernel reading equals the external recomputation', plainShare(share))
    ok(share && share.memberShare === 1, '§1f memberShare is 1 when every proven act is the seat own', share && share.memberShare)
    ok(share && share.classifiedBy && typeof share.classifiedBy.member === 'string' && share.classifiedBy.member.includes('deliveryPath'),
      '§1g classifiedBy says which row field made the call', share && share.classifiedBy && share.classifiedBy.member)
  }

  // ── §2 A CALLER-PLAYED TURN IS OFFICE-RELAYED ────────────────────────────────────────────────────────────────
  section('§2 a turn the CALLING session played reads as office-relayed')
  {
    const k = await boot({ settings: { 'vmu.turn.deliverMode': 'caller' } })
    const parked = await runTurn(k, 'run257 caller played')
    ok(parked && parked.awaiting === true, '§2a the caller route parks the turn (the office must answer it)', parked && parked.awaiting)
    const supplied = k.turn.supplyMemberReply(fence({ progress: '所办代成员写的进展：定义已固定。' }), 'm-1')
    ok(supplied && supplied.ok === true, '§2b the caller-supplied reply is accepted', supplied && { ok: supplied.ok, code: supplied.code })
    const stepped = await k.turn.step({ members: [{ id: 'm-1' }], phase: 'normal' })
    const row = rowOf(k, idOf(parked))
    const share = k.turn.status({ roster: ['m-1'] }).memberWorkShare
    ok(row !== null && row.status === 'applied' && row.deliveryPath === 'caller',
      '§2c the settled row names the caller path (who played the turn is recorded, not inferred)', row && { status: row.status, path: row.deliveryPath })
    ok(row !== null && Array.isArray(row.writes) && row.writes.length >= 1, '§2d the relayed turn wrote the same kind of act', row && row.writes)
    const mine = classify(rowsOf(k))
    ok(mine.office === (row.writes || []).length && mine.member === 0,
      '§2e the external classifier reads every act as office-relayed', mine)
    ok(share && share.officeRelayedActs === mine.office && share.memberActs === 0 && share.unknownActs === 0,
      '§2f the kernel reading equals the external recomputation', plainShare(share))
    ok(share && share.memberShare === 0, '§2g memberShare is 0 when the office played every act', share && share.memberShare)
    ok(share && share.classifiedBy && String(share.classifiedBy['office-relayed'] || '').includes('caller'),
      '§2h classifiedBy names the caller path as the relay evidence')
  }

  // ── §3 SYNTHESIS: UNKNOWN IS UNKNOWN, NULL IS NAMED ABSENCE ────────────────────────────────────────────────────
  section('§3 unknown acts are counted as unknown (never member), and no proof means a null share')
  {
    const synthetic = [
      { deliveryPath: 'activation', writes: [{ tool: 'record' }, { tool: 'record' }] },
      { deliveryPath: 'caller', writes: [{ tool: 'record' }] },
      { writes: [{ tool: 'record' }] },
      { deliveryPath: 'caller', writes: [] },
    ]
    const s = turnModule.workShareOf({ turns: synthetic })
    ok(s.memberActs === 2 && s.officeRelayedActs === 1 && s.unknownActs === 1,
      '§3a the three classes count only the acts that belong to them', plainShare(s))
    ok(s.memberShare === 0.6667 && s.memberShare === Math.round((2 / 3) * 10000) / 10000,
      '§3b memberShare divides by the two PROVEN sides only (unknown is not in the denominator)', s.memberShare)
    ok(s.acts === 4 && s.memberActs + s.officeRelayedActs + s.unknownActs === s.acts,
      '§3c acts is the sum of the three (no act is lost and none is double counted)', plainShare(s))
    const unknownOnly = turnModule.workShareOf({ turns: [{ deliveryPath: '', writes: [{ tool: 'record' }] }] })
    ok(unknownOnly.memberActs === 0 && unknownOnly.unknownActs === 1 && unknownOnly.memberShare === null,
      '§3d an act nobody can attribute is NOT folded into member, and the share is null (nothing proven)', plainShare(unknownOnly))
    const empty = turnModule.workShareOf({ turns: [] })
    ok(empty.acts === 0 && empty.memberShare === null && empty.unknownActs === 0,
      '§3e an empty ledger reads as null share with zero acts, not as a perfect or failed score', plainShare(empty))
    ok(String(empty.means || '').includes('null') && String(empty.means || '').includes('NOT counted as member'),
      '§3f the means explains both the null meaning and the unknown rule')
  }

  // ── §4 ANTI-FAKE-GREEN: THE SAME SCENARIO MOVES WITH THE REAL PATH ─────────────────────────────────────────────
  section('§4 the same reply through the two real paths moves the share, and tampering with the row moves it too')
  {
    const reply = fence({ progress: '同一句进展：引理已证。' })
    const kMember = await boot({ deliverTurn: async () => ({ reply, deliveryPath: 'fake-delegated' }) })
    await runTurn(kMember, 'run257 anti-fake member')
    const memberShare = kMember.turn.status({ roster: ['m-1'] }).memberWorkShare

    const kCaller = await boot({ settings: { 'vmu.turn.deliverMode': 'caller' } })
    const parked = await runTurn(kCaller, 'run257 anti-fake caller')
    kCaller.turn.supplyMemberReply(reply, 'm-1')
    await kCaller.turn.step({ members: [{ id: 'm-1' }], phase: 'normal' })
    const callerShare = kCaller.turn.status({ roster: ['m-1'] }).memberWorkShare

    ok(memberShare && memberShare.memberShare === 1 && callerShare && callerShare.memberShare === 0,
      '§4a the SAME reply reads 1 on a seat turn and 0 on a caller-played turn (the share follows the real path)', { member: memberShare && memberShare.memberShare, caller: callerShare && callerShare.memberShare })
    ok(memberShare && callerShare && memberShare.memberActs === 1 && callerShare.memberActs === 0 &&
      memberShare.officeRelayedActs === 0 && callerShare.officeRelayedActs === memberShare.memberActs,
      '§4b the same act is booked in different classes (not both, not neither)', { member: plainShare(memberShare), caller: plainShare(callerShare) })

    // tamper the published rows: flip the path the same way the two paths differ above; the recomputation MUST move.
    const rows = JSON.parse(JSON.stringify(rowsOf(kMember)))
    const tampered = rows.map((row) => Object.assign({}, row, { deliveryPath: 'caller' }))
    const before = classify(rows)
    const after = classify(tampered)
    ok(before.share === 1 && after.share === 0 && after.office === before.member,
      '§4c flipping deliveryPath on the same rows moves the recomputed reading (the field is load-bearing)', { before, after })
    const stripped = rows.map((row) => { const copy = Object.assign({}, row); delete copy.deliveryPath; return copy })
    const hidden = classify(stripped)
    ok(hidden.unknown === before.member && hidden.share === null && hidden.member === 0,
      '§4d removing the evidence makes the act unknown, NOT member (a hole must not become a member number)', hidden)
  }

  // ── §5 ONE ARITHMETIC, AND THE READING TRAVELS ────────────────────────────────────────────────────────────────
  section('§5 the identity holds, the published rows re-derive the number, and the kernel face carries it')
  {
    const k = await boot({ deliverTurn: async () => ({ reply: fence({ progress: '复核完成。' }), deliveryPath: 'continuation' }) })
    await runTurn(k, 'run257 identity')
    const status = k.turn.status({ roster: ['m-1'] })
    const share = status.memberWorkShare
    const mine = classify(status.turnReceipts)
    ok(share && share.acts === mine.member + mine.office + mine.unknown,
      '§5a acts equals the external sum over the published rows (one arithmetic, same denominator source)', share && { acts: share.acts, mine })
    ok(share && share.memberActs === mine.member && share.officeRelayedActs === mine.office && share.unknownActs === mine.unknown,
      '§5b every class equals the external recomputation', plainShare(share))
    ok(share && share.memberShare !== null && share.memberShare === mine.share,
      '§5c memberShare equals the externally recomputed ratio', share && { kernel: share.memberShare, external: mine.share })
    const keys = ['memberActs', 'officeRelayedActs', 'unknownActs', 'memberShare', 'means', 'classifiedBy']
    ok(keys.every((key) => share && share[key] !== undefined),
      '§5d the receipt carries every named key (no undefined hole a reader could mistake for zero)', keys.filter((key) => !share || share[key] === undefined))
    const turnToolSource = await readFile(join(REPO, 'vibe-math-vmu', 'tools', 'turn.js'), 'utf8')
    ok(turnToolSource.includes('const status = kernel.turn.status()') && turnToolSource.includes('return { ok: true, status, turns: perTurn,'),
      '§5e the turn tool returns the whole kernel status (so the share reaches the tool face unchanged)')
    const after = turnModule.workShareOf({ turns: JSON.parse(JSON.stringify(status.turnReceipts)) })
    ok(JSON.stringify(plainShare(after)) === JSON.stringify(plainShare(share)),
      '§5f the pure derivation applied to the published rows reproduces the kernel reading byte for byte', { after: plainShare(after), kernel: plainShare(share) })
  }
} finally {
  for (const dir of roots) await rm(dir, { recursive: true, force: true, maxRetries: 5 }).catch(() => {})
}

console.log(String.fromCharCode(10) + '=== RUN-257 MEMBER WORK SHARE: ' + passed + ' passed, ' + failed + ' failed ===')
if (failed > 0) {
  console.error('failures:' + NL + failures.map((f) => '  - ' + f).join(NL))
  process.exitCode = 1
}

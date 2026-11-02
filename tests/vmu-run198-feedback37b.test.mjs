// RUN 198 — run 38 / FEEDBACK37 (the leftovers): one ruling under two names, a meeting whose agenda was only spaces,
// a paper slot taught as an append, and work assigned to a seat that cannot reach it.
//
// 2.4  `debate_ruling` accepts `ballotId` and `meeting` as ONE reference, and the write receipt reads it back
//      (`p1RulingRef`) — run 38's reader had to pass BOTH keys because the docs said ballotId and the framework's own
//      `correction.call` printed meeting, and the receipt afterwards could not name what decided the card.
// 2.3  `convene` with an agenda that is only whitespace used to convene a room nobody could state the purpose of; the
//      refusal now names the case and what the agenda becomes once stored.
// 2.5  the live paper prompt taught "write your part" without saying that a member holds ONE part slot (a second
//      `part` REPLACES), so "three rounds of writing" read like three parts.
// 2.6  the chair assigned a FORMAL-VERIFICATION task to a temp worker while the receipt said nothing about the temp
//      seat having no Lean face at all.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('../', import.meta.url))
const ENTRY = join(ROOT, 'vibe-math-vmu', 'vibe-math-vmu.js')
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8')
const PACK = read('vibe-math-vmu/packs/v5r/tools.js')
const GATES = read('vibe-math-vmu/packs/v5r/verification-gates.js')
const PROMPTS = read('vibe-math-vmu/packs/v5r/prompts/v5r-paper-prompts.js')

const ok = (cond, msg, extra) => assert.ok(cond, msg + (extra === undefined ? '' : '\n' + JSON.stringify(extra, null, 2)))
const has = (hay, needle, msg) => ok(String(hay).includes(needle), msg + ' — missing: ' + needle)

async function assemble(dir) {
  const entry = await import(pathToFileURL(ENTRY).href)
  const specs = []
  const ctx = { effect(fn) { return fn() }, on() { return () => {} }, tools: { async register(s) { specs.push(s); return () => {} } } }
  const handle = await entry.apply(ctx, { clock: () => 1000, packs: ['v5r'], root: dir })
  await handle.ready()
  await handle.kernel.store.open()
  const call = async (name, args) => {
    const s = specs.filter((x) => x && x.name === name)[0]
    if (!s) throw new Error('no such face: ' + name)
    const raw = await s.execute(args, { kernel: handle.kernel })
    return raw && typeof raw === 'object' ? raw : JSON.parse(String(raw))
  }
  return { handle, specs, call }
}

test('RUN 198 §0 — every repair is on the source it belongs to (source pins)', () => {
  // 2.4 one ruling, two names, ONE normalized reference
  has(PACK, 'const ballotId = word(raw.ballotId)', '§0a the ballot name is part of the declared shape')
  has(PACK, 'const meeting = word(raw.meeting)', '§0b ★ and so is the meeting name (the one `correction.call` prints)')
  // ★ RUN 205: the reference now normalises THREE names into one (RUN 204 added `tallyId`, the name `verdict_final`
  // prints) — the sentence, not the arity, is the contract.
  has(PACK, 'const rulingRef = ballotId || meeting || tallyId || null', '§0c ★ the names are normalized ONCE into one reference')
  has(PACK, 'rulingRefMeans:', '§0d and the reference says which name it came from')
  has(GATES, 'rulingRef: ev.debate.rulingRef || null', '§0e the gate echoes the reference it admitted on')
  has(PACK, 'p1RulingRef: p1Ruling', '§0f ★ the card write receipt reads that reference back')
  has(PACK, `ballotId: "' + tallyId + '"`, '§0g the printed correction carries the tally id as the ballot name')
  has(PACK, 'shapeMeans:', '§0h and says the two keys are one reading, not two decisions')
  has(PACK, 'RUN 198 (run 38 FEEDBACK37 2.4)', '§0i the repair names the measurement it answers')
  // 2.3 an agenda of spaces is not an agenda
  has(PACK, 'EMPTY after trimming', '§0j ★ the empty-agenda case is refused as its OWN case')
  has(PACK, 'this face only convenes', '§0k and a reader who meant to READ is sent to the read face')
  // 2.5 one slot per member
  has(PROMPTS, '一位成员只有一个部分槽位', '§0l ★ the live prompt says a member holds ONE part slot')
  has(PROMPTS, '不会变成第二段', '§0m and that a second `part` is a REPLACEMENT')
  // 2.6 the assignee's reachable faces
  has(PACK, 'assigneeCapability', '§0n ★ the assignment receipt states what the assignee seat can reach')
  has(PACK, 'noLeanFace: true', '§0o and names the temp seat as having NO Lean face')
  has(PACK, 'assign it to a member', '§0p with the reachable fix, not just the fact')
  // ★ the two agenda cases are told apart by PRESENCE: `has()` already trims (kit/handlers.js:12), so branching the
  // cases on `has()` left the empty case unreachable and reported a blank agenda as "none was passed" — the first
  // version of this repair did exactly that and this suite caught it before the commit.
  has(PACK, 'const agendaGiven = args.agenda !== undefined && args.agenda !== null',
    '§0q ★★ presence — not `has()` — decides which agenda case this is')
})

test('RUN 198 §1 — a ruling that names its MEETING admits the card and the receipt says so', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'vmu-run198-'))
  try {
    const { call, handle } = await assemble(dir)
    await call('vibe_v5_start', { researcherCount: 2 })
    // ★★ RUN 201: the ruling NAME is resolved against the institute's records, so both routes need a real entity that
    // really holds votes. The meeting route: convene, move, second, vote (one vote is enough — "voted", not "tallied").
    const convened = await call('vibe_v5_meeting', { member: 'r-acad', agenda: '裁决 a+b=b+a', title: 'run198 辩论' })
    ok(convened.ok === true, '§1z premise: the debate meeting exists', convened)
    const meetingId = String(convened.meeting)
    // quorum is attendance, not votes: the three seats take their seats first, or every vote is refused 1/3.
    for (const who of ['r-acad', 'r-1', 'r-2']) handle.kernel.meetings.attend({ meeting: meetingId, member: who })
    const moved = handle.kernel.meetings.motion({ meeting: meetingId, member: 'r-acad', text: 'a+b=b+a 成立，交由一致表决' })
    ok(moved && moved.ok === true, '§1z2 premise: a motion is on the floor', moved)
    const motionId = String(moved.motion) // ★ `motion()` answers with the motion ID itself (`{ok, motion:'mo1'}`)
    handle.kernel.meetings.second({ meeting: meetingId, motion: motionId, member: 'r-1' })
    // ★ the vote rail enforces quorum (1/3 was refused): all three seats vote, which is also the shape the route reads.
    for (const who of ['r-acad', 'r-1', 'r-2']) {
      handle.kernel.meetings.vote({ meeting: meetingId, motion: motionId, member: who, value: 1 })
    }
    // a card that still needs a conclusion (p=0.99 with a finished proof, so p=1 can then be settled by a ruling)
    const card = await call('vibe_v5_record_proposition', {
      statement: 'run198 §1 命题：a+b=b+a', value: 1, motive: '交换律', p: 0.99,
      proof_ref: 'Members/r-1/Propos/run198.md#证明', proof_state: 'complete', member: 'r-1',
    })
    ok(card.ok === true, '§1a the card exists at p=0.99', card)
    const cardId = card.recordId
    // ★ the run-38 shape: the ruling names a MEETING, no ballot id anywhere
    const settled = await call('vibe_v5_record_proposition', {
      id: cardId, statement: 'run198 §1 命题：a+b=b+a', value: 1, motive: '交换律', p: 1, member: 'r-1',
      debate_ruling: { subject: cardId, value: 1, mode: 'unanimous', n: 3, decided: true, meeting: meetingId, by: 'r-acad' },
    })
    ok(settled.ok === true, '§1b a meeting-ruled p=1 write is admitted (the route is the same "debate")', settled)
    ok(settled.p1Route === 'debate', '§1c the route is named', settled)
    ok(settled.p1RulingRef === meetingId,
      '§1d ★★ the receipt names WHAT decided this card — the meeting, because that is the name the ruling carried', settled)
    ok(typeof settled.p1RulingMeans === 'string' && settled.p1RulingMeans.length > 20,
      '§1e and says what that reference is', settled)
    // a second card ruled through a BALLOT id: same route, different name, and the receipt follows the ruling
    const card2 = await call('vibe_v5_record_proposition', {
      statement: 'run198 §1 命题二：a*1=a', value: 1, motive: '单位元', p: 0.99,
      proof_ref: 'Members/r-1/Propos/run198b.md#证明', proof_state: 'complete', member: 'r-1',
    })
    const ballot = handle.kernel.ballotbox.open({ question: 'a*1=a 是否成立', options: ['1', '0'], rules: { minVotes: 0 } })
    const ballotId = String(ballot.boxId || ballot.id)
    handle.kernel.ballotbox.cast({ boxId: ballotId, by: 'r-1', choice: '1' })
    const settled2 = await call('vibe_v5_record_proposition', {
      id: card2.recordId, statement: 'run198 §1 命题二：a*1=a', value: 1, motive: '单位元', p: 1, member: 'r-1',
      debate_ruling: { subject: card2.recordId, value: 1, mode: 'unanimous', ballotId },
    })
    ok(settled2.ok === true && settled2.p1RulingRef === ballotId,
      '§1f a ballot-ruled write reads back the ballot id — one shape, whichever name was used', settled2)
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('RUN 198 §2 — an agenda of spaces convenes nothing, and the refusal says which case it is', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'vmu-run198-'))
  try {
    const { call } = await assemble(dir)
    await call('vibe_v5_start', { researcherCount: 2 })
    const blank = await call('vibe_v5_meeting', { member: 'r-acad', agenda: '   ', title: 'blank agenda probe' })
    ok(blank.ok === false && blank.code === 'VMU_INVALID_ARGUMENT',
      '§2a ★★ whitespace is refused as a MISSING agenda, not silently convened', blank)
    ok(/EMPTY after trimming/.test(String(blank.message || '')),
      '§2b the refusal names the case (empty-after-trimming), not just "needs an agenda"', blank)
    ok(/materials/.test(String(blank.message || '')),
      '§2c and says what the agenda becomes once stored (so the field is not decorative)', blank)
    ok(/vibe_vmu_meeting/.test(String(blank.hint || '')),
      '§2d a reader who meant to READ a meeting is pointed at the face that reads one', blank)
    const real = await call('vibe_v5_meeting', { member: 'r-acad', agenda: '决定 run198 的结题口径', title: 'real agenda probe' })
    ok(real.ok !== false, '§2e a real agenda still convenes (the gate refuses the empty case, not the field)', real)
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('RUN 198 §3 — assigning work states what the assignee SEAT can reach', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'vmu-run198-'))
  try {
    const { handle, call } = await assemble(dir)
    for (const [id, slot] of [['r-acad', 'chair'], ['r-1', 'member'], ['r-2', 'member']]) {
      await handle.kernel.members.hire({ id, slot, institution: 'sim' })
    }
    await handle.kernel.members.hire({ id: 'r-temp', slot: 'temp', institution: 'sim' })
    // ★ run 38: the chair handed a FORMAL VERIFICATION job to the temp worker
    const toTemp = await call('vibe_v5_assign', {
      to: 'r-temp', subject: '形式化复核 p-evenprod', why: '需要 Lean 复核', acceptance: 'Lean 作业通过且裁定 conform',
    })
    ok(toTemp.ok === true, '§3a the assignment is still made (this face cannot read intent out of prose)', toTemp)
    ok(toTemp.assigneeSeat === 'temp', '§3b the receipt names the assignee SEAT', toTemp)
    ok(toTemp.assigneeCapability && toTemp.assigneeCapability.noLeanFace === true,
      '§3c ★★ and says that seat has NO Lean face (the run-38 assignment could not have been done by it)', toTemp)
    ok(/assign it to a member/.test(String(toTemp.assigneeCapability && toTemp.assigneeCapability.means)),
      '§3d with the reachable fix, said where the assignment is made', toTemp)
    const toMember = await call('vibe_v5_assign', {
      to: 'r-1', subject: '形式化复核 p-evenprod', why: '需要 Lean 复核', acceptance: 'Lean 作业通过且裁定 conform',
    })
    ok(toMember.ok === true && toMember.assigneeSeat === 'member'
      && toMember.assigneeCapability && toMember.assigneeCapability.noLeanFace === false,
      '§3e a member assignment reads back the member seat and no limit — the field is a reading, not a warning word', toMember)
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

// RUN 202 — run 40 / FEEDBACK39 (continued): "unanimous" was a claim nobody checked, a truncated line did not say
// why it was truncated, and "applied immediately" did not say "for whom".
//
// 1.1  the p=1 debate route checked that the named decision EXISTED and held votes, but never that the votes AGREED.
//      A box that split 1:1 could be quoted as `mode:"unanimous"` — the same lie as run 40's unvoted box, with more
//      effort spent hiding it.
// 1.1b a meeting's unanimity is about the VOTES, not about whether the chair has closed the round: the first repair
//      asked only for CARRIED motions, so a motion seconded and voted 3:0 read as "not unanimous" and refused a card
//      that quoted a decision the institute really had taken (measured by `tests/vmu-run198-feedback37b.test.mjs` §1).
// 2.2  `requiredLineTruncated:true` named a fact without its CAUSE — a reader could not tell "the claim is long" from
//      "the NAME was capped when the card title was derived", and 48 is the number an author needs to decide.
// 2.5  the settings receipt said `applied:"immediate"` and, three fields later, `crossKernelScope:"this-process"`;
//      the word a reader skims first was the misleading one.
// 1.4  the temp seat's capability note read as "a temp can never leave a progress row", while a live run showed the
//      TURN reply envelope writing one for a temp member — two DIFFERENT DOORS, and the note had to say so.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'
import { checkQuality, verifiedRequirements, QUALITY_CODES } from '../vibe-math-vmu/packs/v5r/paper-quality.js'

const ROOT = fileURLToPath(new URL('../', import.meta.url))
const ENTRY = join(ROOT, 'vibe-math-vmu', 'vibe-math-vmu.js')
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8')
const PACK = read('vibe-math-vmu/packs/v5r/tools.js')
const QUALITY = read('vibe-math-vmu/packs/v5r/paper-quality.js')

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
  return { handle, call }
}
/** A card at p=0.99 with a finished proof: the only shape a p=1 ruling may then settle. */
async function pendingCard(call, tag) {
  const card = await call('vibe_v5_record_proposition', {
    statement: 'run202 ' + tag + ' 命题：a+b=b+a', value: 1, motive: '交换律', p: 0.99,
    proof_ref: 'Members/r-1/Propos/run202-' + tag + '.md#证明', proof_state: 'complete', member: 'r-1',
  })
  ok(card.ok === true, 'premise: the card exists at p=0.99 (' + tag + ')', card)
  return card.recordId
}

test('RUN 202 §0 — every repair is on the source it belongs to (source pins)', () => {
  has(PACK, 'const unanimousTallies = motions.filter', '§0a ★ the meeting branch asks about the tallies, not the procedure')
  has(PACK, 'Number(t.abstain) === 0', '§0b ★ and an abstention breaks unanimity (it is not a vote FOR)')
  has(PACK, 'ALL FOR (no against vote, no abstention)', '§0c ★ the meeting means says what it counted, in those words')
  has(PACK, 'unanimousCarried: unanimousCarried.length > 0', '§0d and keeps the NARROWER "carried" disclosure beside it')
  has(PACK, 'VMU_PACK_V5R_CORE_P1_RULING_NOT_UNANIMOUS', '§0e ★★ the p=1 gate refuses a split tally claimed as unanimous')
  has(PACK, 'the votes are SPLIT across choices', '§0f and the ballot branch says so in words a reader can act on')
  has(QUALITY, "requiredLineTruncatedBy: named.truncated ? 'card-title-cap' : null", '§0g ★ the author-side line names the CAUSE')
  has(QUALITY, 'requiredLineTruncatedAt: named.truncated ? 48 : null', '§0h and the number the cap was applied at')
  has(QUALITY, 'the CARD TITLE was derived from the claim and capped at 48 characters', '§0i ★★ with a sentence saying title ≠ claim')
  has(QUALITY, "requiredLineTruncatedBy: truncated ? 'card-title-cap' : null", '§0j ★ the READ face carries the same three fields')
  has(QUALITY, 'requiredLineTruncatedAt: truncated ? 48 : null', '§0k (read face: the cap)')
  has(QUALITY, 'the title was derived from the claim and capped at 48 characters', '§0l (read face: the cause)')
  // RUN 207: the two readings (`partial` and `partialFor`) now come from ONE predicate `processOnly`, so the
  // sentence and the value cannot disagree. The contract is still "the receipt says for whom it is immediate".
  has(PACK, "partialFor: processOnly", '§0m ★★ the settings receipt says "for whom"')
  has(PACK, "const processOnly = !!(receipt && receipt.crossKernelScope === 'this-process')",
    '§0m2 ★★ …and both readings come from the one `this-process` predicate')
  has(PACK, 'TRUE FOR THIS PROCESS ONLY', '§0n ★ in those words, next to the word that misled')
  has(PACK, 'TURN reply envelope wrote one for a temp member', '§0o ★★ the temp note names the second door')
  has(PACK, 'DIFFERENT DOORS', '§0p ★ and says the two doors are different, not contradictory')
})

test('RUN 202 §1 — "unanimous" is a claim about a tally: a split ballot cannot be quoted as one', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'vmu-run202-'))
  try {
    const { handle, call } = await assemble(dir)
    await call('vibe_v5_start', { researcherCount: 2 })
    // (a) a ballot the institute really holds, with votes that REALLY disagree
    const split = handle.kernel.ballotbox.open({ question: 'a+b=b+a 是否成立（分裂票）', options: ['1', '0'], rules: { minVotes: 0 } })
    const splitId = String(split.boxId === undefined ? split.id : split.boxId)
    handle.kernel.ballotbox.cast({ boxId: splitId, by: 'r-1', choice: '1' })
    handle.kernel.ballotbox.cast({ boxId: splitId, by: 'r-2', choice: '0' })
    const cardA = await pendingCard(call, 'split')
    const refused = await call('vibe_v5_record_proposition', {
      id: cardA, statement: 'run202 split 命题：a+b=b+a', value: 1, motive: '交换律', p: 1, member: 'r-1',
      debate_ruling: { subject: cardA, value: 1, mode: 'unanimous', ballotId: splitId },
    })
    ok(refused.ok === false && refused.code === 'VMU_PACK_V5R_CORE_P1_RULING_NOT_UNANIMOUS',
      '§1a ★★ a 1:1 box named as UNANIMOUS is refused BY NAME, not written with a note', refused)
    ok(/claims UNANIMOUS while the named decision is not/.test(String(refused.message || '')),
      '§1b the refusal says what was claimed against what was read', refused)
    ok(/SPLIT across choices/.test(String(refused.message || '')),
      '§1c ★ and the reading names the split (the reader learns the tally, not just the verdict)', refused)
    // (b) the refusal is about the CLAIM, so it must name a reachable exit: a gate that only says no leaves the author
    // holding a card that cannot be settled by the decision the institute actually took.
    ok(/fidelity_conclude/.test(String(refused.hint || '')),
      '§1d ★ the refusal names a route that CAN settle this card', refused)
    ok(/close the vote/.test(String(refused.hint || '')),
      '§1e and a step the reader can take on the very box they quoted', refused)
    // (c) a box everyone voted the same way in
    const unanimous = handle.kernel.ballotbox.open({ question: 'a*1=a 是否成立（一致票）', options: ['1', '0'], rules: { minVotes: 0 } })
    const unanimousId = String(unanimous.boxId === undefined ? unanimous.id : unanimous.boxId)
    for (const who of ['r-acad', 'r-1', 'r-2']) handle.kernel.ballotbox.cast({ boxId: unanimousId, by: who, choice: '1' })
    const cardB = await pendingCard(call, 'agreed')
    const agreed = await call('vibe_v5_record_proposition', {
      id: cardB, statement: 'run202 agreed 命题：a*1=a', value: 1, motive: '单位元', p: 1, member: 'r-1',
      debate_ruling: { subject: cardB, value: 1, mode: 'unanimous', ballotId: unanimousId },
    })
    ok(agreed.ok === true, '§1f ★★ a box where every vote agrees admits the unanimous ruling (a gate that only refuses proves nothing)', agreed)
    ok(agreed.p1RulingRef === unanimousId, '§1g and the receipt names what decided it', agreed)
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('RUN 202 §2 — a meeting\'s unanimity is about its votes, not about the chair having rung the bell', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'vmu-run202-'))
  try {
    const { handle, call } = await assemble(dir)
    await call('vibe_v5_start', { researcherCount: 2 })
    const seated = ['r-acad', 'r-1', 'r-2']
    /** convene, move, second and vote three seats; returns the meeting id. */
    const debated = (title, values) => {
      const out = call('vibe_v5_meeting', { member: 'r-acad', agenda: '裁决 ' + title, title })
      return out.then((convened) => {
        ok(convened.ok === true, 'premise: the debate meeting exists', convened)
        const meetingId = String(convened.meeting)
        for (const who of seated) handle.kernel.meetings.attend({ meeting: meetingId, member: who })
        const moved = handle.kernel.meetings.motion({ meeting: meetingId, member: 'r-acad', text: title + ' 交由表决' })
        const motionId = String(moved.motion)
        handle.kernel.meetings.second({ meeting: meetingId, motion: motionId, member: 'r-1' })
        seated.forEach((who, i) => handle.kernel.meetings.vote({ meeting: meetingId, motion: motionId, member: who, value: values[i] }))
        return meetingId
      })
    }
    // (a) 3:0, motion SECONDED but not yet carried — the run-41 shape
    const agreedMeeting = await debated('run202 §2 一致', [1, 1, 1])
    const cardA = await pendingCard(call, 'meeting-agreed')
    const agreed = await call('vibe_v5_record_proposition', {
      id: cardA, statement: 'run202 meeting-agreed 命题：a+b=b+a', value: 1, motive: '交换律', p: 1, member: 'r-1',
      debate_ruling: { subject: cardA, value: 1, mode: 'unanimous', n: 3, decided: true, meeting: agreedMeeting, by: 'r-acad' },
    })
    ok(agreed.ok === true,
      '§2a ★★ a 3:0 meeting admits the unanimous ruling even before the chair carries the motion (the votes are the evidence)', agreed)
    ok(agreed.p1RulingRef === agreedMeeting, '§2b and the receipt names the MEETING that decided it', agreed)
    ok(/ALL FOR/.test(String((agreed.p1RulingReading || {}).means || '')),
      '§2c ★ the READING says what it counted: a tally that is all FOR', agreed)
    // (b) 2:1 — the same shape, a different tally, and the claim is false. `meetings.vote` reads 0 as AGAINST and any
    // other value as FOR (one convention for the whole face), so a split vote is `[1,1,0]`.
    const splitMeeting = await debated('run202 §2 分裂', [1, 1, 0])
    const cardB = await pendingCard(call, 'meeting-split')
    const refused = await call('vibe_v5_record_proposition', {
      id: cardB, statement: 'run202 meeting-split 命题：a*1=a', value: 1, motive: '单位元', p: 1, member: 'r-1',
      debate_ruling: { subject: cardB, value: 1, mode: 'unanimous', n: 3, decided: true, meeting: splitMeeting, by: 'r-acad' },
    })
    ok(refused.ok === false && refused.code === 'VMU_PACK_V5R_CORE_P1_RULING_NOT_UNANIMOUS',
      '§2d ★★ a 2:1 meeting named as UNANIMOUS is refused: a majority is not a unanimity', refused)
    ok(/carried\)/.test(String(refused.message || '')),
      '§2e and the reading still reports the carrying count (the two facts are separate fields, whatever the verdict)', refused)
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('RUN 202 §3 — a truncated required line names its CAUSE and the number, in both readers', () => {
  // a verified row whose NAME stops at the title cap: the claim is longer than the name, which is exactly the shape
  // run 40's author met. `statement` is intentionally absent from the VIEW (a verified row carries no statement) so the
  // full sentence has to be read back from the card — the 181/199 fallback, still exercised here.
  const title = '已验证｜' + 'a_1 + a_2 + a_3 + a_4 + a_5 + a_6 + a_7 + a_8 的和是一…'
  const rows = {
    'rec-v1': { id: 'rec-v1', track: 'verified', fingerprint: 'f1' },
    'p-long': { id: 'p-long', track: 'proposition', body: '- statement：a_1 + a_2 + a_3 + a_4 + a_5 + a_6 + a_7 + a_8 的和是一个定值，且该定值与排列无关。' },
    'rec-p1': { id: 'rec-p1', track: 'state', body: JSON.stringify({ evidence: ['rec-v1'] }) },
  }
  const records = { get: ({ id }) => rows[String(id)] || null }
  const view = {
    records,
    verified: () => ({ items: [{ id: 'rec-v1', cardId: 'p-long', title }] }),
    subproblems: () => ({ items: [] }),
  }
  const reading = verifiedRequirements({ view })
  ok(reading.ok === true && reading.count === 1, '§3a the read face answers before anything is written', reading)
  const item = reading.items[0]
  ok(item.requiredLineTruncated === true, '§3b the premise holds: this name is a ceiling', item)
  ok(item.requiredLineTruncatedBy === 'card-title-cap',
    '§3c ★★ the READ face names the CAUSE (the card title was derived and capped), not just the fact', item)
  ok(item.requiredLineTruncatedAt === 48, '§3d and the number the cap was applied at', item)
  ok(/capped at 48 characters/.test(String(item.requiredLineTruncatedMeans || '')),
    '§3e ★ in a sentence, so nobody has to read the source to learn it', item)
  ok(typeof item.requiredLineFull === 'string' && item.requiredLineFull.length > 0,
    '§3f and the sentence to paste is still handed over (a ceiling is not a paste target)', item)

  // the AUTHOR-side reader: `checkQuality` refuses a prose that omits the conclusion, and the row it points at carries
  // the same three fields.
  const state = { parts: { 'r-1': { recordId: 'rec-p1' } } }
  const out = checkQuality({ md: '正文：本论文由 r-1 撰写，证据 rec-v1。', state, view })
  ok(out.ok === false && out.code === QUALITY_CODES.VERIFIED_MISSING,
    '§3g the author-side gate refuses a body that does not state the conclusion', out)
  const missing = (out.missing || [])[0] || {}
  ok(missing.requiredLineTruncatedBy === 'card-title-cap', '§3h ★★ the author-side row names the same CAUSE', missing)
  ok(missing.requiredLineTruncatedAt === 48, '§3i and the same number', missing)
  ok(/requiredLineFull/.test(String(missing.requiredLineTruncatedMeans || '')),
    '§3j ★ and points at the field that IS the sentence', missing)
})

test('RUN 202 §4 — "applied immediately" says FOR WHOM it is immediate', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'vmu-run202-'))
  try {
    const { call } = await assemble(dir)
    await call('vibe_v5_start', { researcherCount: 2 })
    const receipt = await call('vibe_v5_set', { key: 'vmu.turn.leaderId', value: 'r-acad', why: 'run202 §4' })
    ok(receipt.ok === true, '§4a the write is accepted', receipt)
    const set = receipt.applied || {}
    ok(set.crossKernelScope === 'this-process', '§4b premise: this is a per-process write (the kernel says so)', receipt)
    ok(set.partial === true, '§4c ★★ the receipt says the write is PARTIAL, in the field a reader meets first', set)
    ok(set.partialFor === 'the member kernels spawned for turns (this process only)',
      '§4d ★ naming who does NOT have it, not just that someone does not', set)
    ok(/TRUE FOR THIS PROCESS ONLY/.test(String(set.partialMeans || '')),
      '§4e ★★ and the sentence sits next to `applied:"immediate"` and contradicts the reading it invites', set)
    ok(/member turn boots its own kernel/.test(String(set.partialMeans || '')),
      '§4f naming the mechanism, so the reader can decide what to do instead', set)
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('RUN 202 §5 — the temp seat: two doors, and the note says they are different', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'vmu-run202-'))
  try {
    const { handle, call } = await assemble(dir)
    for (const [id, slot] of [['r-acad', 'chair'], ['r-1', 'member'], ['r-2', 'member']]) {
      await handle.kernel.members.hire({ id, slot, institution: 'sim' })
    }
    await handle.kernel.members.hire({ id: 'r-temp', slot: 'temp', institution: 'sim' })
    const toTemp = await call('vibe_v5_assign', {
      to: 'r-temp', subject: '临时核对', why: '需要人手', acceptance: '报告核对结果',
    })
    ok(toTemp.ok === true && toTemp.assigneeCapability && toTemp.assigneeCapability.noLeanFace === true,
      '§5a premise: the temp seat still reads as having no Lean face', toTemp)
    const means = String(toTemp.assigneeCapability.means || '')
    ok(/TURN reply envelope/.test(means),
      '§5b ★★ the note names the SECOND door (the turn\'s own reply channel), so "temp can never write a row" is not left standing', means)
    ok(/DIFFERENT DOORS/.test(means),
      '§5c ★ and says the two statements are different doors, not a contradiction', means)
    ok(/research-library FACE/.test(means) || /library face/.test(means),
      '§5d while keeping the first door (the library face) closed, named', means)
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

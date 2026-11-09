// RUN 214 — run 51 / FEEDBACK50: a sentence that was true of the wrong call, two names for one count where
// the misleading one was the alias, and three reminders that arrived after the mistake.
//
// 1.1 `headingDroppedMeans` promised "THIS TOOL writes that heading itself" for a FIRST proposal too — where the
//     heading is dropped and nothing is written in its place (run 51 read back 0 headings on the receipt that
//     claimed one). The sentence now follows the branch that actually happened.
// 1.2 `p1RulingReading.sources` carried `submittedRulings` AND a `typedRulings` alias holding the SAME (submitted)
//     count, printed beside `tally.sources.typed:0` — run 51's agent read the alias as "two chair-typed rulings".
//     The alias is deleted; the descriptor is `rulingCards`, and the receipt announces the removal.
// 1.3 `vibe_vmu_chat` refused an unknown action by naming nothing it does (and pointing at the docs), while the
//     paper face on the same deployment lists every declared parameter. It now lists its declared words.
// 1.4 `memberActsMeans` said `vibe_vmu_meeting{status}` reads "meetings and votes" — the closure reading itself
//     says status does NOT carry the tally; and the chat READ verb is `list`, not `read`.
// 2.1 "re-register the card" read as "edit this card's pointer", but the records face mints a NEW row per write.
// 2.2 the seats a deployment declares non-attending were named only AFTER a member tried to attend and was refused.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'
import { createKernel } from '../vibe-math-vmu/kernel/index.js'

const ROOT = fileURLToPath(new URL('../', import.meta.url))
const ENTRY = join(ROOT, 'vibe-math-vmu', 'vibe-math-vmu.js')
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8')
const TOOLS = read('vibe-math-vmu/packs/v5r/tools.js')
const BP = read('vibe-math-vmu/packs/v5r/blueprint.js')
const TURN = read('vibe-math-vmu/kernel/turn/index.js')
const CHAT = read('vibe-math-vmu/tools/chat.js')

const ok = (cond, msg, extra) => assert.ok(cond, msg + (extra === undefined ? '' : '\n' + JSON.stringify(extra, null, 2)))
const has = (hay, needle, msg) => ok(String(hay).includes(needle), msg + ' — missing: ' + needle)
const blockOf = (r, key) => (r && r[key]) || r
const tmp = () => mkdtempSync(join(tmpdir(), 'vmu-run214-'))

async function assemble(dir) {
  const entry = await import(pathToFileURL(ENTRY).href)
  const specs = []
  const ctx = { effect(fn) { return fn() }, on() { return () => {} }, tools: { async register(s) { specs.push(s); return () => {} } } }
  const handle = await entry.apply(ctx, { clock: () => 1793464780000, packs: ['v5r'], root: dir })
  await handle.ready()
  await handle.kernel.store.open()
  const call = async (name, args) => {
    const s = specs.filter((x) => x && x.name === name)[0]
    if (!s) throw new Error('no such face: ' + name)
    const raw = await s.execute(args, { kernel: handle.kernel })
    return raw && typeof raw === 'object' ? raw : JSON.parse(String(raw))
  }
  return { call, handle, specs }
}

test('RUN 214 §0 — the repairs live on the source they belong to (pins)', () => {
  // 1.1 — the drop sentence follows the branch that happened
  has(BP, 'this is the FIRST proposal of this revision, so there is no per-member section yet', '§0a ★★★ a first proposal is told the heading was dropped, not replaced')
  has(BP, 'no heading was written in its place', '§0b ★★ and says so plainly')
  has(BP, 'THIS TOOL writes that heading itself for a section ADDED to an existing draft', '§0c ★★★ the ownership sentence survives only where it is true')
  // 1.2 — one honest name, and the alias is gone
  has(TOOLS, 'rulingCards: rulingCards === null', '§0d ★★★ the card count has an honest name')
  has(TOOLS, 'rulingCardsMeans:', '§0e ★ and is explained')
  has(TOOLS, 'typedRulingsDeprecated:', '§0f ★★ the removed key is ANNOUNCED, not silently vanished')
  ok(!TOOLS.includes('typedRulings: cardVotes'), '§0g ★★★ the alias holding the submitted count is gone (run 51 read it as chair-typed)')
  // 1.3 — a refusal names the words it does accept
  has(CHAT, 'this face declares: send, list, policy', '§0h ★★★ the chat refusal lists its declared actions')
  has(CHAT, 'reading messages is `list`, not `read`', '§0i ★★ and names the verb the run guessed wrong')
  // 1.4 — the turn receipt must not promise the tally on the meeting status
  has(TURN, 'does NOT answer the vote tally', '§0j ★★★ memberActsMeans stops pointing at status for votes')
  has(TURN, 'the READ action is `list`, not `read`', '§0k ★★ and names the chat read verb')
  // 2.1 — re-register means a NEW row
  has(TOOLS, 'REGISTER THE CARD AGAIN', '§0l ★★★ the repair path says what re-registering does')
  has(TOOLS, 'the records face mints a NEW row per write', '§0m ★★ and why an edit is not on the table')
  // 2.2 — the declaration is printed beside the roster
  has(TOOLS, 'nonAttending, nonAttendingMeans,', '§0n ★★★ the convene receipt prints who may not attend')
  has(TOOLS, 'forbids their seat to attend or vote', '§0o ★ and says what the declaration means')
})

test('RUN 214 §1 — a dropped heading is described against the call that dropped it', async () => {
  const dir = tmp()
  try {
    const { call } = await assemble(dir)
    ok((await call('vibe_v5_start', { problem: 'RUN 214 标题口径', researcherCount: 2 })).ok === true, 'premise: founded')
    const first = await call('vibe_v5_blueprint', {
      // legacy path: kernel-materialized only when materialize:true is explicit (RUN 255 default flipped to fs-first)
      action: 'propose', materialize: true, path: 'p-214', member: 'r-1',
      text: '## 共同设计补充｜r-1\n- 节点 1：把命题拆成归纳基与归纳步',
    })
    ok(first.ok === true, '§1a premise: the first proposal is written', first)
    ok(first.headingDropped === 1, '§1b the repeated heading is counted', first.headingDropped)
    has(first.headingDroppedMeans, 'FIRST proposal', '§1c ★★★ the FIRST proposal is told there is no section yet')
    has(first.headingDroppedMeans, 'no heading was written in its place', '§1d ★★ and that nothing replaced it')
    ok(!String(first.headingDroppedMeans).includes('THIS TOOL writes that heading itself for a section ADDED'), '§1e ★ the continuation promise is not printed here', first.headingDroppedMeans)
    const readBack = await call('vibe_v5_blueprint', { action: 'read', id: String(first.id) })
    ok(String((readBack && readBack.text) || '').split('## 共同设计补充｜').length - 1 === 0, '§1f ★★ and the stored base really has no heading (so the old sentence was false)', readBack && readBack.text)
    const second = await call('vibe_v5_blueprint', {
      action: 'propose', materialize: true, path: 'p-214', member: 'r-2',
      text: '## 共同设计补充｜r-2\n- 节点 3：把归纳步写成可核验的等式链',
    })
    ok(second.ok === true, '§1g premise: a co-designer continues the same draft', second)
    has(second.headingDroppedMeans, 'ADDED to an existing draft', '§1h ★★★ a CONTINUATION keeps the ownership sentence, because there it is true')
    ok(!String(second.headingDroppedMeans).includes('FIRST proposal'), '§1i ★ and does not claim to be a first proposal', second.headingDroppedMeans)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('RUN 214 §2 — the reading counts submitted cards under a name that cannot be read backwards', async () => {
  const dir = tmp()
  try {
    const { call } = await assemble(dir)
    ok((await call('vibe_v5_start', { problem: 'RUN 214 裁决计数', researcherCount: 2 })).ok === true, 'premise: founded')
    const card = await call('vibe_v5_record_proposition', {
      statement: '前 n 个奇数之和等于 n 的平方', value: '对 n≥1 成立', motive: 'RUN 214 §2', p: 0.5, member: 'r-acad',
      proof_ref: 'Members/r-acad/Propos/run214.md', proof_state: 'complete',
    })
    ok(card.ok === true, '§2a premise: the card', card)
    const mid = String(card.recordId)
    const met = await call('vibe_v5_meeting', { member: 'r-acad', agenda: ['读裁决'], title: 'RUN 214 会', type: 'debate', subject: mid, formal_agenda: true })
    ok(met.ok === true, '§2c premise: the meeting', met)
    const meetingId = String(met.meeting)
    for (const seat of ['r-acad', 'r-1', 'r-2']) {
      ok((await call('vibe_vmu_meeting', { action: 'attend', id: meetingId, member: seat })).ok === true, '§2d premise: attendance by ' + seat)
    }
    for (const m of ['r-1', 'r-2']) {
      const f = await call('vibe_v5_verdict', { meeting: meetingId, proposition_id: mid, verdict: 1, reason: '由归纳可证 ' + m, member: m })
      ok(f.ok === true, '§2e premise: ' + m + ' files its own ruling card', f)
    }
    const fin = await call('vibe_v5_verdict_final', { meeting: meetingId, proposition_id: mid, member: 'r-acad' })
    ok(fin.ok === true, '§2f premise: the chair signs the tally', fin)
    const reading = fin.p1RulingReading || {}
    ok(reading.ok === true, '§2g the receipt hands back the reading', reading)
    ok(reading.sources && reading.sources.submittedRulings === 2, '§2h ★★★ the submitted cards are counted under the honest name', reading.sources)
    ok(!reading.sources || reading.sources.typedRulings === undefined, '§2i ★★★ and no alias called typedRulings sits beside a typed number', reading.sources)
    ok(reading.rulingCards && reading.rulingCards.count === 2, '§2j ★★ the card count itself is stated', reading.rulingCards)
    has(reading.rulingCardsMeans, 'durable ruling CARDS', '§2k ★ and explained')
    has(reading.typedRulingsDeprecated, 'REMOVED in RUN 214', '§2l ★★ the removal is announced on the receipt that used to carry the alias')
    // §2m the chair-typed count still lives on the TALLY side (registry of what each receipt says)
    ok(fin.sources && fin.sources.typed === 0, '§2m ★ and the verdict receipt still says the numbers were NOT chair-typed', fin.sources)
    ok(fin.sources && fin.sources.submitted === 2, '§2n ★★ the two member cards are counted as submitted, exactly as the reading counts them', fin.sources)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('RUN 214 §3 — a chat refusal names the words the face accepts', async () => {
  const dir = tmp()
  try {
    const { call } = await assemble(dir)
    ok((await call('vibe_v5_start', { problem: 'RUN 214 聊天面', researcherCount: 2 })).ok === true, 'premise: founded')
    const bad = await call('vibe_vmu_chat', { action: 'read', member: 'r-1' })
    ok(bad.ok === false, '§3a premise: an unknown action is refused', bad)
    ok(bad.code === 'VMU_INVALID_ARGUMENT', '§3b ★ the refusal keeps its code', bad.code)
    has(bad.message, 'this face declares:', '§3c ★★★ the refusal lists the declared actions')
    has(bad.message, 'reading messages is `list`, not `read`', '§3d ★★ and names the verb that was wanted')
    has(bad.hint, 'this face refuses by name', '§3e ★ and says why it refuses instead of guessing')
    // §3f the listed words are really accepted: `list` works on the same kernel
    const list = await call('vibe_vmu_chat', { action: 'list', member: 'r-1' })
    ok(list.ok === true, '§3f ★★ the listed `list` action is actually accepted (the refusal is not a dead end)', list)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('RUN 214 §4 — the convene receipt names the seats the deployment forbids, beside the roster', async () => {
  const dir = tmp()
  try {
    const { call } = await assemble(dir)
    ok((await call('vibe_v5_start', { problem: 'RUN 214 席位声明', researcherCount: 2 })).ok === true, 'premise: founded')
    const hired = await call('vibe_v5_hire', {
      purpose: '临时工核验', initial_task: '整理命题拆解清单', to: 'r-temp', slot: 'temp',
    })
    ok(hired.ok === true, '§4a premise: a temp seat is on the roster', hired)
    const met = await call('vibe_v5_meeting', { member: 'r-acad', agenda: ['席位声明'], title: 'RUN 214 席位会' })
    ok(met.ok === true, '§4b premise: the meeting opens', met)
    ok(Array.isArray(met.nonAttending), '§4c ★★★ the receipt carries the declared non-attending members', met.nonAttending)
    ok(met.nonAttending.includes('r-temp'), '§4d ★★★ and names the temp seat, so the caller does not have to be refused to learn it', met.nonAttending)
    has(met.nonAttendingMeans, 'attendDeniedSeats', '§4e ★★ the means names the declaration behind it')
    has(met.nonAttendingMeans, 'refused BY NAME', '§4f ★ and says what an attempt would meet')
    // §4h the declaration is real: the temp seat's attend is refused by name
    const refused = await call('vibe_vmu_meeting', { action: 'attend', id: String(met.meeting), member: 'r-temp' })
    ok(refused.ok === false, '§4h ★★ premise: the declaration is enforced, so the sentence above is not cosmetic', refused)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('RUN 214 §5 — a deferred lock says the repair is a NEW card, not an edit', async () => {
  const dir = tmp()
  try {
    const { call } = await assemble(dir)
    ok((await call('vibe_v5_start', { problem: 'RUN 214 指针推迟', researcherCount: 2 })).ok === true, 'premise: founded')
    const card = await call('vibe_v5_record_proposition', {
      statement: '形如 n²+1 的素数有无穷多个', value: '成立', motive: 'RUN 214 §5', p: 0.5, member: 'r-acad',
      proof_ref: 'Members/r-acad/Propos/missing-214.md', proof_state: 'complete',
    })
    ok(card.ok === true, '§5a premise: the dangling-pointer card lands', card)
    ok(card.proofLockDeferred === true, '§5b premise: its lock is deferred (RUN 212)', card.proofLockDeferred)
    has(card.proofLockDeferredMeans, 'REGISTER THE CARD AGAIN', '§5c ★★★ the repair path is named as a NEW registration')
    has(card.proofLockDeferredMeans, 'NEW row per write', '§5d ★★ and says why editing this row is not an option')
    has(card.proofLockDeferredMeans, 'never editing this row', '§5e ★ and rules the edit out in words')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('RUN 214 §6 — the turn receipt points at the faces that answer its question', async () => {
  const root = tmp()
  try {
    const host = { deliverTurn: async () => 'this reply has no fence at all' }
    const kernel = createKernel({ settings: {}, root, host })
    const out = await kernel.turn.drive({ members: ['r-1'], rounds: 1 })
    has(out.memberActsMeans, 'does NOT answer the vote tally', '§6a ★★★ the receipt stops promising votes on the meeting status')
    has(out.memberActsMeans, 'the READ action is `list`, not `read`', '§6b ★★ and names the chat read verb')
    has(out.memberActsMeans, 'tally', '§6c ★ and points at where the tally IS readable')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

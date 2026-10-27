#!/usr/bin/env node
// vmu RUN 85 / RULE L36 — 「单次发言版群聊（每人各说一次、不打断）」必须有机制，不能只有一句教学。
//
// THE GAP THIS CLOSES. `docs/acceptance/rules-ledger.json` row E17 recorded the rule as a MECHANISM GAP: the debate
// skeleton carried it as `binding:'recommendation'` (a suggestion, refused nothing), and `vibe_v5_say { meeting }`
// recorded speeches one by one without ever refusing a member's SECOND speech in the same round. A rule with no
// consumer is exactly the shape AGENTS red line ④ forbids.
//
// WHAT WAS BUILT, AND WHERE. `vibe-math-vmu/kernel/chat.js` gained a ROUND BOOK (`speakRound`, `roundStatus`, `rounds`)
// — a named page of the chat ledger per round id: who has spoken, who is still owed a turn, and a NAMED REFUSAL for
// the second speech (`VMU_CHAT_ALREADY_SPOKE`, nothing appended). `vibe-math-vmu/packs/v5r/tools.js` wraps
// `vibe_v5_say` so a member can pass `round` (with `text` = speak, without `text` = READ who already spoke).
//
// THE HONEST BOUNDARY (and the reason this suite asserts the sentence): this is BOOKKEEPING + A NAMED REFUSAL, not
// isolation. It does not schedule or interleave turns and it does not stop two DIFFERENT members from writing at the
// same instant; "不打断" is the room convention the book enforces AFTER the fact. Every receipt carries that sentence
// in `means`, and §1/§3 assert it is really there — a receipt that claimed enforcement would be a false message.
//
// WHAT THIS SUITE PROVES:
//   §0 the faces and the fixture are real (RULE E: no assertion below may be vacuous);
//   §1 the first speech is recorded with round / spokenBy / remaining / complete and the honest `means`;
//   §2 the SAME member's second speech in the SAME round is refused BY NAME, names the round and the first message,
//      says 「本轮已发言，下轮再说」, appends NOTHING, and leaves the page unchanged;
//   §3 remaining really decrements, and `complete` flips only when everyone declared has spoken;
//   §4 a NEW round id allows speaking again, and the previous page is not rewritten by it;
//   §5 the round rule does not smuggle past the existing gates: a muted member hears `VMU_CHAT_MUTED`, and a send
//      refused by mute does NOT open a round page (a page must never claim a speech that was not recorded);
//   §6 a declared participant list is honoured, an unknown round is READABLE without being created, and an empty
//      list is refused (a roster of nobody would make `remaining` a lie);
//   §7 the PACK face routes the same way (round speech, named refusal, read form, `round`+`to` refused, and the
//      no-round form still behaves exactly as before);
//   §8 the round book is DURABLE: a second kernel over the same store reads `spokenBy`/`remaining` from the fold and
//      refuses the repeat itself (write-through is fire-and-forget, so the assertion POLLS the fold).
//
// Run: node tests/vmu-run85-say-round.test.mjs
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..')
const CHAT = join(REPO, 'vibe-math-vmu', 'kernel', 'chat.js')
const KERNEL = join(REPO, 'vibe-math-vmu', 'kernel', 'index.js')
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
const codeOf = (fn) => {
  try { const r = fn(); return { code: null, result: r } } catch (e) { return { code: (e && e.code) || 'THREW', message: String((e && e.message) || e), hint: String((e && e.hint) || '') } }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const list = (v) => (Array.isArray(v) ? v.map(String) : [])

const { createChat } = await import(pathToFileURL(CHAT).href)
const m = await import(pathToFileURL(KERNEL).href)
const entry = await import(pathToFileURL(ENTRY).href)

// A chat with a REAL seat seam: the round's participant list comes from `seatsOf()` when the caller declares none.
// `vmu.chat.admins` names the officer the mute test needs (the face adds no policy of its own).
const mkChat = () => createChat({
  clock: () => Date.now(),
  settings: { 'vmu.chat.admins': ['r-chair'] },
  seatsOf: () => ({ chair: ['r-chair'], member: ['r-1', 'r-2'] }),
})

const BASE = 'D:/_tmp/r85/say-round'
await mkdir(BASE, { recursive: true })
const root = await mkdtemp(join(BASE, 'store-'))
const SETTINGS = {
  'vmu.resume.projections': ['chat'],
  'vmu.resume.autoRecover': true,
  'vmu.resume.writeThrough': true,
  'vmu.chat.admins': ['r-chair'],
}
const flush = async (k) => { if (k.resumeService && typeof k.resumeService.settle === 'function') await k.resumeService.settle() }
const openKernel = async (home = root) => {
  const k = m.createKernel({ root: home, clock: () => Date.now(), settings: Object.assign({}, SETTINGS) })
  await k.store.open()
  await k.resumeService.read()
  await k.resumeService.hydrate({ keys: ['chat'] })
  return k
}
const foldChat = async (home = root) => {
  const raw = JSON.parse(await readFile(join(home, 'vmu', 'state.json'), 'utf8'))
  return raw && raw.keys ? raw.keys.chat : null
}

let bootPack = null
const boot = async (config = {}) => {
  const state = { specs: [] }
  const ctx = { effect(fn) { return fn() }, on() { return () => {} }, tools: { register: async (spec) => { state.specs.push(spec); return () => {} } } }
  const handle = entry.apply(ctx, Object.assign({ clock: () => Date.now() }, config))
  await handle.ready()
  return { handle, specOf: (n) => state.specs.find((s) => s.name === n) }
}
const call = async (b, name, args = {}) => {
  const spec = b.specOf(name)
  if (!spec) return { parsed: undefined, missing: true }
  try {
    const raw = await spec.execute(args, {})
    let parsed
    try { parsed = JSON.parse(raw) } catch { parsed = undefined }
    return { raw, parsed, missing: false }
  } catch (e) {
    return { raw: null, parsed: { ok: false, code: e && e.code, message: e && e.message, hint: e && e.hint }, missing: false }
  }
}

try {
  // ══ §0 THE FACES AND THE FIXTURE ARE REAL ═══════════════════════════════════════════════════════════════════════
  console.log('=== 0. THE FACE AND THE FIXTURE ARE REAL (RULE E: nothing below may be vacuous) ===')
  const probe = mkChat()
  ok(typeof probe.speakRound === 'function' && typeof probe.roundStatus === 'function' && typeof probe.rounds === 'function',
    '§0 the chat face publishes speakRound / roundStatus / rounds', Object.keys(probe).filter((k) => /round/i.test(k)))
  ok(Array.isArray(probe.status().rounds) && probe.status().rounds.length === 0,
    '§0 status() carries an (empty) round read, so "who spoke" is answerable without speaking', probe.status().rounds)
  ok(typeof probe.status().roundsMeans === 'string' && probe.status().roundsMeans.includes('not a scheduler'),
    '§0 status() says in words that the round book is not a scheduler', probe.status().roundsMeans)

  // ══ §1 THE FIRST SPEECH IS RECORDED ════════════════════════════════════════════════════════════════════════════
  console.log('=== 1. THE FIRST SPEECH IN A ROUND IS RECORDED (round / spokenBy / remaining / complete) ===')
  const c = mkChat()
  const first = c.speakRound({ round: 'q1-round-1', from: 'r-1', text: '我先说：这是本轮我的唯一一次发言。' })
  ok(first && first.ok === true && first.spoke === true, '§1 the first speech succeeds and says so', first && first.ok)
  ok(String(first.round) === 'q1-round-1', '§1 the receipt names the ROUND it was recorded in', first.round)
  ok(JSON.stringify(list(first.spokenBy)) === JSON.stringify(['r-1']), '§1 spokenBy names the speaker', first.spokenBy)
  ok(JSON.stringify(list(first.remaining)) === JSON.stringify(['r-chair', 'r-2']),
    '§1 remaining is the DECLARED roster minus the speaker (r-chair and r-2 are still owed a turn)', first.remaining)
  ok(first.complete === false, '§1 the round is not complete after one of three has spoken', first.complete)
  ok(typeof first.means === 'string' && first.means.includes('not isolation') && first.means.includes('VMU_CHAT_ALREADY_SPOKE'),
    '§1 the receipt carries the HONEST boundary in `means` (bookkeeping + a named refusal, not isolation)', first.means)
  ok(Number(c.status().messages) === 1, '§1 the speech landed in the group chat as a message (the book records the real message)', c.status().messages)

  // ══ §2 THE SECOND SPEECH BY THE SAME MEMBER IN THE SAME ROUND IS REFUSED BY NAME ═══════════════════════════════
  console.log('=== 2. THE SAME MEMBER SPEAKING TWICE IN ONE ROUND IS REFUSED BY NAME ===')
  const before = Number(c.status().messages)
  const second = codeOf(() => c.speakRound({ round: 'q1-round-1', from: 'r-1', text: '我还想说第二次。' }))
  ok(second.code === 'VMU_CHAT_ALREADY_SPOKE', '§2 the second speech is refused BY NAME (VMU_CHAT_ALREADY_SPOKE)', second.code)
  ok(String(second.message).includes('q1-round-1') && String(second.message).includes('one speech per member per round'),
    '§2 the message names the ROUND and the rule it broke', second.message)
  ok(String(second.hint).includes('本轮已发言，下轮再说'), '§2 the hint tells the member what to do instead (本轮已发言，下轮再说)', second.hint)
  ok(String(second.hint).includes('r-2'), '§2 the hint names who the round is still waiting on (an actionable refusal)', second.hint)
  ok(Number(c.status().messages) === before, '§2 the refused speech appended NOTHING (the refusal is not a silent accept)', c.status().messages)
  const page1 = c.status().rounds.find((r) => r.round === 'q1-round-1')
  ok(page1 && page1.spoke.length === 1, '§2 the round page still records exactly one speech', page1 && page1.spoke.length)

  // ══ §3 remaining DECREMENTS, complete FLIPS ONLY WHEN EVERYONE SPOKE ═══════════════════════════════════════════
  console.log('=== 3. remaining DECREMENTS AND complete FLIPS ONLY AT THE END ===')
  const thirdSpeaker = c.speakRound({ round: 'q1-round-1', from: 'r-2', text: '我第二个人说。' })
  ok(JSON.stringify(list(thirdSpeaker.remaining)) === JSON.stringify(['r-chair']),
    '§3 remaining decrements to the one member still owed a turn', thirdSpeaker.remaining)
  ok(thirdSpeaker.complete === false, '§3 still not complete while one declared member has not spoken', thirdSpeaker.complete)
  const lastSpeaker = c.speakRound({ round: 'q1-round-1', from: 'r-chair', text: '我最后说。' })
  ok(JSON.stringify(list(lastSpeaker.remaining)) === JSON.stringify([]), '§3 remaining is empty once everyone spoke', lastSpeaker.remaining)
  ok(lastSpeaker.complete === true, '§3 complete flips to true exactly when the declared roster is exhausted', lastSpeaker.complete)
  ok(JSON.stringify(list(c.roundStatus({ round: 'q1-round-1' }).spokenBy)) === JSON.stringify(['r-1', 'r-2', 'r-chair']),
    '§3 the round read returns the speakers in the order they spoke', c.roundStatus({ round: 'q1-round-1' }).spokenBy)

  // ══ §4 A NEW ROUND ALLOWS SPEAKING AGAIN ═══════════════════════════════════════════════════════════════════════
  console.log('=== 4. A NEW ROUND ID ALLOWS SPEAKING AGAIN (and the old page is untouched) ===')
  const nextRound = c.speakRound({ round: 'q1-round-2', from: 'r-1', text: '第二轮我第一个说。' })
  ok(nextRound.ok === true && String(nextRound.round) === 'q1-round-2',
    '§4 the same member speaks again in a NEW round (the refusal is per round, not per member)', nextRound.round)
  ok(JSON.stringify(list(nextRound.spokenBy)) === JSON.stringify(['r-1']) && list(nextRound.remaining).length === 2,
    '§4 the new round starts its own book (one speaker, two still owed)', { spokenBy: nextRound.spokenBy, remaining: nextRound.remaining })
  const oldAfter = c.roundStatus({ round: 'q1-round-1' })
  ok(oldAfter.complete === true && oldAfter.spoke.length === 3, '§4 the PREVIOUS round page is not rewritten by the new round', oldAfter.complete)
  ok(c.status().rounds.length === 2, '§4 both rounds are readable from one status() call', c.status().rounds.length)

  // ══ §5 THE EXISTING GATES STILL WIN, AND A REFUSED SEND OPENS NO PAGE ═════════════════════════════════════════
  console.log('=== 5. MUTE STILL REFUSES FIRST, AND A REFUSED SEND NEVER OPENS A ROUND PAGE ===')
  const d = mkChat()
  d.mute('r-2', { durationMs: 600000, reason: 'run 85: the round rule must not swallow the mute gate', by: 'r-chair' })
  const muted = codeOf(() => d.speakRound({ round: 'q1-round-3', from: 'r-2', text: '被禁言的人还想说话。' }))
  ok(muted.code === 'VMU_CHAT_MUTED', '§5 a muted member hears VMU_CHAT_MUTED, not the round refusal (gate order preserved)', muted.code)
  ok(d.roundStatus({ round: 'q1-round-3' }).known === false, '§5 the refused send did NOT open a round page (no phantom speech)', d.roundStatus({ round: 'q1-round-3' }).known)
  ok(Number(d.status().messages) === 0, '§5 and nothing landed in the chat', d.status().messages)

  // ══ §6 DECLARED PARTICIPANTS, READ-ONLY UNKNOWN ROUND, EMPTY LIST REFUSED ═════════════════════════════════════
  console.log('=== 6. A DECLARED PARTICIPANT LIST IS HONOURED; AN UNKNOWN ROUND IS READ, NOT CREATED ===')
  const declaredRead = d.roundStatus({ round: 'q1-round-9', members: ['m-1', 'm-2'] })
  ok(declaredRead.ok === true && declaredRead.known === false && list(declaredRead.remaining).length === 2,
    '§6 reading an unknown round answers with the DECLARED list instead of inventing a page', declaredRead.known)
  ok(d.roundStatus({ round: 'q1-round-9' }).known === false, '§6 the read above did not create the page (a read must not mutate)', d.roundStatus({ round: 'q1-round-9' }).known)
  const declaredSpeak = d.speakRound({ round: 'q1-round-9', from: 'm-1', text: '按声明名单发言。', members: ['m-1', 'm-2'] })
  ok(JSON.stringify(list(declaredSpeak.remaining)) === JSON.stringify(['m-2']),
    '§6 the declared list — not the seat roster — decides who is still owed a turn', declaredSpeak.remaining)
  const emptyList = codeOf(() => d.speakRound({ round: 'q1-round-10', from: 'm-1', text: 'x', members: [] }))
  ok(emptyList.code === 'VMU_INVALID_ARGUMENT', '§6 an EMPTY participant list is refused (a roster of nobody would make remaining a lie)', emptyList.code)
  const noRoundId = codeOf(() => d.speakRound({ round: '   ', from: 'm-1', text: 'x' }))
  ok(noRoundId.code === 'VMU_INVALID_ARGUMENT', '§6 an empty round id is refused by name', noRoundId.code)

  // ══ §7 THE PACK FACE ROUTES THE SAME WAY ═══════════════════════════════════════════════════════════════════════
  console.log('=== 7. vibe_v5_say CARRIES THE ROUND (speak, read, refusals, and the untouched default form) ===')
  bootPack = await boot({ root: join(root, 'pack'), packs: ['v5r'] })
  const pk = bootPack.handle.kernel
  await pk.members.hire({ id: 'r-chair', slot: 'chair' })
  await pk.members.hire({ id: 'r-1', slot: 'member' })
  await pk.members.hire({ id: 'r-2', slot: 'member' })
  const saySpec = bootPack.specOf('vibe_v5_say')
  const sayProps = (saySpec && saySpec.parameters && saySpec.parameters.properties) || {}
  const sayRequired = (saySpec && saySpec.parameters && saySpec.parameters.required) || []
  ok(Boolean(sayProps.round) && Boolean(sayProps.members),
    '§7 the declaration carries `round` and `members` (the teaching surface and the schema agree)', Object.keys(sayProps))
  ok(!sayRequired.includes('text'),
    '§7 `text` is NOT required any more — otherwise the read form (`round` without `text`) would be an illegal call', sayRequired)
  const say1 = await call(bootPack, 'vibe_v5_say', { round: 'pack-1', member: 'r-1', text: '通过工具面发言。' })
  ok(say1.parsed && say1.parsed.ok === true && say1.parsed.spoke === true && say1.parsed.round === 'pack-1',
    '§7 the pack face speaks into the round through the kernel book', say1.parsed && (say1.parsed.code || say1.parsed.round))
  ok(list(say1.parsed.remaining).includes('r-2'), '§7 the pack receipt carries the remaining members of the roster', say1.parsed.remaining)
  const say2 = await call(bootPack, 'vibe_v5_say', { round: 'pack-1', member: 'r-1', text: '第二次。' })
  ok(say2.parsed && say2.parsed.ok === false && say2.parsed.code === 'VMU_CHAT_ALREADY_SPOKE',
    '§7 the same member through the SAME tool is refused by name', say2.parsed && say2.parsed.code)
  const readBack = await call(bootPack, 'vibe_v5_say', { round: 'pack-1', member: 'r-1' })
  ok(readBack.parsed && readBack.parsed.ok === true && readBack.parsed.read === true && list(readBack.parsed.spokenBy).includes('r-1'),
    '§7 `round` WITHOUT `text` is a READ of who already spoke (and it did not need to speak to learn that)', readBack.parsed && readBack.parsed.spokenBy)
  const roundWithDm = await call(bootPack, 'vibe_v5_say', { round: 'pack-1', member: 'r-1', to: 'r-2', text: '私信里没有轮次。' })
  ok(roundWithDm.parsed && roundWithDm.parsed.ok === false && roundWithDm.parsed.code === 'VMU_INVALID_ARGUMENT',
    '§7 `round` combined with `to` is refused (the round rule is the GROUP-CHAT rule)', roundWithDm.parsed && roundWithDm.parsed.code)
  const plain = await call(bootPack, 'vibe_v5_say', { member: 'r-2', text: '没有轮次的普通发言仍然照旧。' })
  ok(plain.parsed && plain.parsed.ok === true && plain.parsed.via === 'chat' && plain.parsed.spoke === undefined,
    '§7 the no-round form still behaves exactly as before (the kit path is untouched)', plain.parsed && (plain.parsed.code || plain.parsed.via))

  // ══ §8 THE ROUND BOOK IS DURABLE (a second kernel reads it from the fold) ══════════════════════════════════════
  console.log('=== 8. A SECOND KERNEL OVER THE SAME STORE READS spokenBy (write-through is fire-and-forget: POLL) ===')
  const a = await openKernel()
  const spoken = a.chat.speakRound({ round: 'live-1', from: 'r-1', text: '开工第一句（这一句要能被另一个内核读到）。', members: ['r-1', 'r-2'] })
  ok(spoken.ok === true && list(spoken.remaining).length === 1, '§8 the first kernel recorded the speech', spoken.remaining)
  await flush(a)
  let foldRounds = null
  for (let i = 0; i < 80 && foldRounds === null; i++) {
    const env = await foldChat().catch(() => null)
    const data = env && env.value && env.value.data
    const page = data && data.rounds && data.rounds['live-1']
    if (page && Array.isArray(page.spoke) && page.spoke.length === 1) foldRounds = page
    else await sleep(25)
  }
  ok(foldRounds !== null && foldRounds.spoke[0].member === 'r-1',
    '§8 the fold itself carries the round page (the write-through really landed, not just the memory)', foldRounds && foldRounds.spoke)

  const b2 = await openKernel()
  const seen = b2.chat.roundStatus({ round: 'live-1' })
  ok(seen.known === true && JSON.stringify(list(seen.spokenBy)) === JSON.stringify(['r-1']),
    '§8 the SECOND kernel reads spokenBy from the durable fold (who spoke is a conversation fact, not local memory)', seen)
  ok(JSON.stringify(list(seen.remaining)) === JSON.stringify(['r-2']),
    '§8 and it knows who is still owed a turn (remaining survived the restart)', seen.remaining)
  const repeat = codeOf(() => b2.chat.speakRound({ round: 'live-1', from: 'r-1', text: '重启后想再说一次。' }))
  ok(repeat.code === 'VMU_CHAT_ALREADY_SPOKE',
    '§8 the restored book refuses the repeat in the OTHER kernel (the refusal is durable, not instance-local)', repeat.code)
  const otherMember = b2.chat.speakRound({ round: 'live-1', from: 'r-2', text: '轮到我。', members: ['r-1', 'r-2'] })
  ok(otherMember.ok === true && otherMember.complete === true,
    '§8 the other member can still speak in that round, and the round completes', { remaining: otherMember.remaining, complete: otherMember.complete })
} finally {
  await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }).catch(() => {})
}

console.log(failed === 0 ? '=== VMU RUN85 SAY ROUND: ' + passed + ' passed, 0 failed ===' : '')
if (failed !== 0) {
  console.log('=== VMU RUN85 SAY ROUND: ' + passed + ' passed, ' + failed + ' failed ===')
  for (const f of failures) console.log('  · ' + f)
  process.exit(1)
}

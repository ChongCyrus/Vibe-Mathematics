#!/usr/bin/env node
// vmu RUN 107 / F-108a — A ROUND BOOK MUST NAME ITS SURFACE, ON THE WRITE **AND** ON THE READ.
//
// THE DEFECT THIS CLOSES. `vibe_v5_say { member, round, text }` (no `meeting`) writes into the GROUP-CHAT round book, and
// `vibe_v5_say { meeting, member, text }` writes into a MEETING's debate round. Measured on run 107: the office kernel
// called the first form, got `round:"chat-round-1"`, `spokenBy:["r-1"]`, `remaining:["r-acad","r-2"]`, and read that as
// "the debate round of the meeting I just convened" — then judged the debate's procedure against a chat page. Nothing in
// the receipt said which book it came from; `stampedMembers` and `remaining` look identical on both surfaces.
//
// WHAT WAS BUILT. `vibe-math-vmu/kernel/chat.js` carries ONE sentence (`ROUND_SURFACE_MEANS`) and puts it on every
// receipt and every page it renders: `speakRound` (the write), `roundStatus` (both the known and the unknown page), and
// `roundView` (so `rounds()` / `status()` pages carry it too). One spelling, not two — a reader who sees the sentence on
// a write and a shorter one on a read would have to guess whether they describe the same book.
//
// THE HONEST PART: this names the surface, it does not re-route anything. A chat round is still a chat round; a meeting
// speech still goes through `vibe_vmu_meeting { action: "speak" }` / `vibe_v5_say { meeting }`. The sentence says where
// the other surface lives instead of pretending the two are one book.
//
// WHAT THIS SUITE PROVES:
//   §0 the fixture is real (a speech really lands, `spokenBy` really moves — RULE E: no vacuous assertion);
//   §1 the WRITE receipt names the chat surface and points at the meeting speech surface;
//   §2 the READ of that same page carries the SAME sentence (string equality: one sentence, not two spellings);
//   §3 the READ of an unknown page names it too (the page you get before anything is written is a page as well);
//   §4 `rounds()` / `status()` pages carry it (every renderer of the book, not just the convenient one);
//   §5 the second-speech refusal is untouched: still `VMU_CHAT_ALREADY_SPOKE`, and the page did not move (the surface
//      field must not have been bought by weakening the mechanism it describes).
//
// Run: node tests/vmu-run107-round-surface.test.mjs
import { dirname, join } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..')
const CHAT = join(REPO, 'vibe-math-vmu', 'kernel', 'chat.js')

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
  try { const r = fn(); return { code: null, result: r } } catch (e) { return { code: (e && e.code) || 'THREW', message: String((e && e.message) || e) } }
}
const list = (v) => (Array.isArray(v) ? v.map(String) : [])

const { createChat } = await import(pathToFileURL(CHAT).href)
const mkChat = () => createChat({
  clock: () => Date.now(),
  settings: { 'vmu.chat.admins': ['r-chair'] },
  seatsOf: () => ({ chair: ['r-chair'], member: ['r-1', 'r-2'] }),
})

const MEETING_SPEECH = 'vibe_vmu_meeting { action: "speak" }'

console.log('=== 0. fixture ===')
const chat = mkChat()
const first = chat.speakRound({ round: 'chat-round-1', from: 'r-1', text: '收到，我先说一句', members: ['r-1', 'r-2'] })
ok(first && first.ok === true, '§0 the first speech lands (the fixture can write)', first)
ok(list(first.spokenBy).join(',') === 'r-1', '§0 spokenBy moved — the page really recorded the speech', first.spokenBy)
ok(list(first.remaining).join(',') === 'r-2', '§0 remaining really decremented (not a static field)', first.remaining)
ok(Array.isArray(chat.rounds()) && chat.rounds().length >= 1, '§0 rounds() lists the page (the book exists)', chat.rounds())

console.log('=== 1. the WRITE receipt names the surface ===')
ok(first.roundSurface === 'chat', '§1 speakRound returns roundSurface:"chat"', first.roundSurface)
const writeMeans = String(first.roundSurfaceMeans || '')
ok(writeMeans.includes('CHAT round book'), '§1 the sentence says it is a CHAT round book', writeMeans)
ok(writeMeans.includes('MEETING round'), '§1 the sentence says what it is NOT (a MEETING round)', writeMeans)
ok(writeMeans.includes(MEETING_SPEECH), '§1 the sentence names where a meeting speech IS recorded', writeMeans)
ok(String(first.means || '').includes('BOOKKEEPING'), '§1 the older `means` (bookkeeping, not isolation) is untouched', first.means)

console.log('=== 2. the READ carries the SAME sentence ===')
const view = chat.roundStatus({ round: 'chat-round-1' })
ok(view && view.ok === true && view.known === true, '§2 the page is known', view)
ok(view.roundSurface === 'chat', '§2 roundStatus returns roundSurface:"chat"', view.roundSurface)
ok(view.roundSurfaceMeans === first.roundSurfaceMeans,
  '§2 write and read carry the IDENTICAL sentence (one spelling, not two)', { write: first.roundSurfaceMeans, read: view.roundSurfaceMeans })
ok(String(view.means || '').includes('BOOKKEEPING'), '§2 the read keeps the honest `means` too', view.means)

console.log('=== 3. an UNKNOWN page names it as well ===')
const unopened = chat.roundStatus({ round: 'never-opened', members: ['r-1', 'r-2'] })
ok(unopened && unopened.known === false, '§3 the page is readable without being created', unopened)
ok(unopened.roundSurface === 'chat', '§3 the unknown page names the surface too', unopened.roundSurface)
ok(unopened.roundSurfaceMeans === first.roundSurfaceMeans, '§3 … with the same sentence', unopened.roundSurfaceMeans)

console.log('=== 4. every renderer of the book carries it ===')
const rows = chat.rounds()
ok(rows.every((r) => r.roundSurface === 'chat'), '§4 rounds() rows name the surface', rows.map((r) => r.roundSurface))
const status = chat.status()
const pageInStatus = status.roundDetails || status.rounds || null
ok(Array.isArray(pageInStatus) && pageInStatus.length >= 1, '§4 status() carries the pages', Object.keys(status))
ok(Array.isArray(pageInStatus) && pageInStatus.every((r) => r.roundSurface === 'chat' && r.roundSurfaceMeans === first.roundSurfaceMeans),
  '§4 status() pages carry the surface AND the same sentence',
  Array.isArray(pageInStatus) ? pageInStatus.map((r) => ({ s: r.roundSurface, m: r.roundSurfaceMeans })) : pageInStatus)

console.log('=== 5. the mechanism the field describes is not weakened ===')
const second = codeOf(() => chat.speakRound({ round: 'chat-round-1', from: 'r-1', text: '我再说一句', members: ['r-1', 'r-2'] }))
ok(second.code === 'VMU_CHAT_ALREADY_SPOKE', '§5 a second speech in the same round is still refused by name', second)
const afterRefusal = chat.roundStatus({ round: 'chat-round-1' })
ok(list(afterRefusal.spokenBy).join(',') === 'r-1', '§5 the refused speech appended nothing', afterRefusal.spokenBy)
ok(afterRefusal.roundSurfaceMeans === first.roundSurfaceMeans, '§5 the page still carries the same sentence after a refusal', afterRefusal.roundSurfaceMeans)

console.log('')
if (failed) { console.error(failed + ' FAILED:'); for (const f of failures) console.error('  - ' + f); process.exit(1) }
console.log(passed + ' passed, 0 failed')

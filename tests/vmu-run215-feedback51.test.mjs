// RUN 215 — run 52 / FEEDBACK51 1.1a, 1.1b, 1.2, 1.3, 2.2, 2.3.
//
// 1.1a  THE `dropped:0` BRANCH TOLD THE TRUTH ABOUT THE RULE AND A LIE ABOUT THE TEXT. Run 52 put
//       `## 共同设计补充｜r-acad` on the third line of its proposal; the receipt answered "the text you passed carried
//       no heading", which was false — the text carried one, but `stripRepeatedCodesignHeading` only reads the FIRST
//       line. One sentence described the rule as if it described the input.
// 1.1b  THE SAME CONTINUATION PASTED THE WHOLE DRAFT BACK IN. r-1 continued the draft with a text that began with the
//       draft it had just read, so the drafted revision held the base twice and the receipt said only
//       `headingDropped:0`. A duplicate paragraph is content, not formatting: it would have been adopted as current.
// 1.2   `count:0` AND `cards:2` IN ONE RECEIPT. `cards` counted every ruling-status card in the library (all meetings,
//       all propositions) while `count`/`rows` were filtered to this debate; a chair-typed sitting therefore read as
//       "no cards filed, two cards found".
// 1.3   THE CHAIR ATTENDING TWICE WAS A SILENT NO-OP. `ok:true` while `presentBreakdown.attended` did not move.
// 2.2   THE REQUIRED-LINE LIST WAS ONLY ON `status`, so the first time a part writer heard about it was `final`
//       refusing the paper. The part receipt now carries the list.
// 2.3   THE CHAT FACE HAS NO RELAY FIELD. The office typed a member's sentence under `by:<member>` and the receipt said
//       `from:<member>` — indistinguishable from the member speaking. The receipt now says so and points at the face
//       that names a relay.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('../', import.meta.url))
const ENTRY = join(ROOT, 'vibe-math-vmu', 'vibe-math-vmu.js')
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8')
const BLUEPRINT_SRC = read('vibe-math-vmu/packs/v5r/blueprint.js')
const TOOLS_SRC = read('vibe-math-vmu/packs/v5r/tools.js')
const MEETINGS_SRC = read('vibe-math-vmu/kernel/meetings.js')
const CHAT_SRC = read('vibe-math-vmu/tools/chat.js')

const ok = (cond, msg, extra) => assert.ok(cond, msg + (extra === undefined ? '' : '\n' + JSON.stringify(extra, null, 2)))
const has = (hay, needle, msg) => ok(String(hay).includes(needle), msg + ' — missing: ' + needle)
const hasNot = (hay, needle, msg) => ok(!String(hay).includes(needle), msg + ' — unexpected: ' + needle)

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
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw
    return parsed
  }
  return { handle, kernel: handle.kernel, specs, call }
}

test('RUN 215 — a sentence about one branch, a pasted draft, a number about the wrong cards', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'vmu-r215-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  const { kernel, call } = await assemble(dir)
  const BLUEPRINT = await import(pathToFileURL(join(ROOT, 'vibe-math-vmu', 'packs', 'v5r', 'blueprint.js')).href)

  console.log('=== 0. THE SOURCE CARRIES THE SIX FACTS THIS ROUND ADDS (a pin, so a later edit cannot quietly drop them) ===')
  has(BLUEPRINT_SRC, 'NOT as the first line', '§0a the `dropped:0` branch names the FIRST-LINE rule instead of claiming the text had no heading')
  has(BLUEPRINT_SRC, 'stripLeadingDuplicateDraft', '§0b a leading copy of the continued draft is detected and stripped')
  has(BLUEPRINT_SRC, 'bodyPrefixDropped', '§0c the receipt says how much of the pasted draft was removed')
  has(TOOLS_SRC, 'cardsScanned', '§0d the library-wide scan and the per-debate count are two named numbers')
  has(MEETINGS_SRC, 'alreadyPresent', '§0e attend reports that it was a no-op and why')
  has(TOOLS_SRC, 'these are the lines the DELIVERY gate looks for VERBATIM', '§0f a part receipt carries the required-line list')
  has(CHAT_SRC, 'relayedBy', '§0g the chat receipt points at the face that names a relay')
  has(TOOLS_SRC, 'it MUST be the FIRST line', '§0h the propose description states the first-line rule before the caller writes')
  hasNot(BLUEPRINT_SRC, 'the text you passed carried no `## 共同设计补充｜…` heading, so nothing had to be dropped',
    '§0i the sentence that described the rule as a fact about the text is GONE')

  console.log('=== 1. A HEADING THAT IS PRESENT BUT NOT FIRST IS DESCRIBED AS SUCH (1.1a) ===')
  await kernel.members.hire({ id: 'r-acad', slot: 'chair' })
  await kernel.members.hire({ id: 'r-1', slot: 'member' })
  await kernel.members.hire({ id: 'r-2', slot: 'member' })
  const PATH = 'Blueprint/run215.md'
  const first = BLUEPRINT.proposeBlueprint({
    records: kernel.records, path: PATH, by: 'r-acad', seat: 'chair',
    text: '第一版基准稿：先写目标，再写节奏。\n再一行。\n## 共同设计补充｜r-acad\n- 院士自带的标题写在第三行。',
  })
  ok(first.ok === true && first.continued === false, '§1a the first proposal is accepted', first && { ok: first.ok, continued: first.continued })
  ok(first.headingDropped === 0, '§1b the heading was NOT dropped: it is not on the first line, so the stripper did not see it', first.headingDropped)
  has(first.headingDroppedMeans, 'NOT as the first line', '§1c the receipt says WHY it was not dropped (it is present, just not first)')
  has(first.headingDroppedMeans, 'stored verbatim', '§1d and says what happened to it instead (stored inside the body)')
  hasNot(first.headingDroppedMeans, 'carries no `## 共同设计补充｜…` heading line at all',
    '§1e the sentence claiming the text had NO heading is not used here — the text did have one')

  console.log('=== 2. A CONTINUATION THAT PASTES THE DRAFT BACK IN IS STRIPPED AND REPORTED (1.1b) ===')
  const draftText = BLUEPRINT.readBlueprint({ records: kernel.records, id: first.id }).text
  const pasted = draftText + '\n\n## 共同设计补充｜r-1\n- 复核分工：我先验归纳步。'
  const second = BLUEPRINT.proposeBlueprint({ records: kernel.records, path: PATH, draft: first.id, by: 'r-1', seat: 'member', text: pasted })
  ok(second.ok === true && second.continued === true, '§2a the continuation is accepted', second && { ok: second.ok, continued: second.continued })
  ok(second.bodyPrefixDropped > 0, '§2b the pasted copy of the draft was removed (a non-zero count, not a promise)', second.bodyPrefixDropped)
  has(second.bodyPrefixDroppedMeans, 'pasted back in', '§2c the receipt names what was removed and why')
  const after = BLUEPRINT.readBlueprint({ records: kernel.records, id: first.id }).text
  const occurrences = String(after).split('第一版基准稿：先写目标，再写节奏。').length - 1
  ok(occurrences === 1, '★§2d the base paragraph now appears EXACTLY ONCE in the drafted revision (this is the content defect run 52 hit)', occurrences)
  has(after, '复核分工：我先验归纳步。', '§2e the member text that was actually new is kept')

  console.log('=== 3. `cards` AND `cardsScanned` ANSWER TWO DIFFERENT QUESTIONS (1.2) ===')
  const convened = await call('vibe_v5_meeting', { member: 'r-acad', agenda: 'RUN215 会议', title: 'RUN215' })
  ok(convened && convened.ok === true, '§3a the meeting convenes', convened && { ok: convened.ok, code: convened.code })
  const MID = convened.meeting
  const card = await call('vibe_v5_record_proposition', { statement: '前 n 个偶数之和等于 n(n+1)', value: '对 n≥1 成立', motive: 'RUN215', p: 0.9, member: 'r-1' })
  ok(card && card.ok === true, '§3b a proposition card is filed (the debate object)', card && { ok: card.ok, code: card.code })
  const CARD = card.recordId || (card.record && card.record.id)
  const filed = await call('vibe_v5_verdict', { meeting: MID, proposition_id: CARD, verdict: 1, reason: 'RUN215 意见', member: 'r-1' })
  ok(filed && filed.ok === true, '§3c a member files a ruling card', filed && { ok: filed.ok, code: filed.code })
  const matched = await call('vibe_v5_meeting', { action: 'rulings', id: MID, proposition_id: CARD })
  ok(matched && matched.ok === true, '§3d the rulings read succeeds', matched && { ok: matched.ok, code: matched.code })
  ok(matched.cards === 1 && matched.cardsScanned >= 1, '§3e the card filed for THIS debate is counted in `cards`', { cards: matched.cards, cardsScanned: matched.cardsScanned })
  const other = await call('vibe_v5_meeting', { action: 'rulings', id: MID, proposition_id: 'rec-does-not-exist' })
  ok(other && other.ok === true && other.cards === 0 && other.cardsScanned >= 1,
    '★★§3f a debate with NO matching card reads `cards:0` while `cardsScanned` still counts the library — the two numbers can no longer contradict each other', { cards: other.cards, cardsScanned: other.cardsScanned })
  has(other.means, 'not a contradiction', '§3g the means says explicitly that 0 beside a positive scan is not a contradiction')

  console.log('=== 4. THE CHAIR ATTENDING TWICE IS A NAMED NO-OP (1.3) ===')
  const attendChair = await call('vibe_vmu_meeting', { action: 'attend', id: MID, member: 'r-acad' })
  ok(attendChair && attendChair.ok === true && attendChair.alreadyPresent === true,
    '§4a the chair was seated by open(), so this attend is reported as already-present', attendChair && { ok: attendChair.ok, alreadyPresent: attendChair.alreadyPresent })
  has(attendChair.alreadyPresentMeans, 'CHAIR', '§4b the means names the reason (the chair is seated by open()), so `attended` not moving is explained')
  const attendFirst = await call('vibe_vmu_meeting', { action: 'attend', id: MID, member: 'r-1' })
  ok(attendFirst && attendFirst.alreadyPresent === false, '§4c a first arrival is NOT already-present', attendFirst && attendFirst.alreadyPresent)
  const attendAgain = await call('vibe_vmu_meeting', { action: 'attend', id: MID, member: 'r-1' })
  ok(attendAgain && attendAgain.alreadyPresent === true, '§4d a second arrival is reported as a no-op', attendAgain && attendAgain.alreadyPresent)
  has(attendAgain.alreadyPresentMeans, 'ALREADY present', '§4e and says the counts were unchanged')

  console.log('=== 5. A PART RECEIPT CARRIES THE REQUIRED-LINE LIST (2.2) ===')
  const started = await call('vibe_v5_paper', { action: 'start', participants: ['r-acad', 'r-1'], title: 'RUN215 论文' })
  ok(started && started.ok === true, '§5a the paper starts', started && { ok: started.ok, code: started.code })
  const TARGET = (started.started && started.started.id) || started.target
  const part = await call('vibe_v5_paper', { action: 'part', member: 'r-1', target: TARGET, body: '§1 正文：先写结论再写理由。' })
  ok(part && part.ok === true, '§5b a part is written', part && { ok: part.ok, code: part.code })
  const look = part && part.requiredLines
  ok(look !== null && look !== undefined && typeof look === 'object', '★★§5c the part receipt carries `requiredLines` (the list the delivery gate checks)', look)
  ok(Array.isArray(look.items) && typeof look.count === 'number', '§5d the list is DATA (count + items), not a paragraph', look && { count: look.count, items: look.items && look.items.length })
  has(look.means, 'VERBATIM', '§5e and says the gate wants these lines verbatim')

  console.log('=== 6. THE CHAT FACE SAYS IT HAS NO RELAY FIELD (2.3) ===')
  const sent = await call('vibe_vmu_chat', { action: 'send', by: 'r-1', text: 'RUN215 群聊试读' })
  ok(sent && sent.ok === true, '§6a the message is sent', sent && { ok: sent.ok, code: sent.code })
  has(sent.voiceMeans, 'NO relay field', '★★§6b the receipt says `from` is the VOICE and this face cannot express a relay')
  has(sent.voiceMeans, 'relayedBy', '§6c and points at the face that does (vibe_v5_message)')
  ok(sent.from === 'r-1', '§6d `from` is still the voice it always was (the disclosure changes no data)', sent.from)
})

/**
 * tests/vmu-run216-feedback52.test.mjs — RUN 216：run 53（FEEDBACK52）量到的三处「回执说的事与磁盘上的事不是一件事」。
 *
 * THE THREE DEFECTS THIS SUITE PINS (all MEASURED in run 53, task-sim53.txt):
 *   ① `vibe-math-vmu/packs/v5r/blueprint.js` — RUN 215 taught `propose` to STRIP a pasted-back copy of the draft it was
 *      continuing, and the receipt said "that copy was removed, so this revision holds it once". But when the FIRST
 *      proposer did the pasting, the stripped remainder REPLACED the `## 正文` base, so the draft's own body vanished and
 *      the sentence was false: run 53 read `bodyPrefixDropped:52` beside a body whose base paragraph appeared 0 times.
 *   ② `vibe-math-vmu/packs/v5r/tools.js` — the ruling read's `means` said "it ALSO holds N TYPED RULING CARD(S)" about
 *      the cards the members filed with `vibe_v5_verdict`, in the receipt that printed `sources.typed:0`. Run 53 read the
 *      sentence alone and reported "the chair typed two cards" — the opposite of the fact.
 *   ③ `vibe-math-vmu/kit/handlers.js` — a ruling card is a LIBRARY FILE card, and `vibe_v5_read_library { id }` answered
 *      `VMU_NO_SUCH_OBJECT` for it, so run 53 concluded a filed ruling cannot be read by id at all. The read now expands
 *      the file card (body + path) instead of telling the reader the noun is wrong.
 *
 * RULE E: every fixture assertion is preceded by an explicit non-empty check; a refusal is normalised from BOTH shapes
 * (a thrown error and a serialised `{ok:false}` receipt) so it can never be mistaken for a success.
 *
 * Run: node tests/vmu-run216-feedback52.test.mjs
 */
import { mkdirSync, mkdtempSync } from 'node:fs'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const REPO = 'D:/wd/vibemath开发/Vibe-Mathematics'
const VMU = join(REPO, 'vibe-math-vmu')
const TMP = 'D:/_tmp/r216'
mkdirSync(TMP, { recursive: true })

const SRC_BLUEPRINT = readFileSync(join(VMU, 'packs', 'v5r', 'blueprint.js'), 'utf8')
const SRC_TOOLS = readFileSync(join(VMU, 'packs', 'v5r', 'tools.js'), 'utf8')
const SRC_HANDLERS = readFileSync(join(VMU, 'kit', 'handlers.js'), 'utf8')

let passed = 0
let failed = 0
const failures = []
function ok(cond, name, detail) {
  if (cond) { passed += 1; console.log('  ok   ' + name) } else { failed += 1; failures.push(name + (detail === undefined ? '' : ' :: ' + JSON.stringify(detail))); console.log('  FAIL ' + name + (detail === undefined ? '' : ' :: ' + JSON.stringify(detail))) }
}
const codeOf = (e) => (e && (e.code || (e.cause && e.cause.code))) || null

const entry = await import(pathToFileURL(join(VMU, 'vibe-math-vmu.js')).href)
const BLUEPRINT = await import(pathToFileURL(join(VMU, 'packs', 'v5r', 'blueprint.js')).href)
const { V5R_PACK_TOOLS } = await import(pathToFileURL(join(VMU, 'packs', 'v5r', 'tools.js')).href)

const boot = async (config = {}) => {
  const state = { specs: [] }
  const ctx = {
    effect: (fn) => fn(),
    on: () => () => {},
    tools: { register: async (spec) => { state.specs.push(spec); return () => {} } },
  }
  const handle = entry.apply(ctx, Object.assign({ clock: () => 1000, packs: ['v5r'] }, config))
  await handle.ready()
  const specOf = (n) => state.specs.filter((s) => s.name === n)[0] || null
  const call = async (name, args = {}) => {
    const spec = specOf(name)
    if (!spec) return { ok: false, code: 'VMU_TEST_NO_SUCH_TOOL', message: 'tool ' + name + ' was not registered', hint: 'the spec registry is empty for this name' }
    try {
      const raw = await spec.execute(args)
      const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw
      return parsed && typeof parsed === 'object' ? parsed : { ok: false, code: 'VMU_TEST_NO_RECEIPT', message: 'the face answered ' + String(raw), hint: null }
    } catch (e) {
      return { ok: false, code: codeOf(e) || 'VMU_TEST_THROWN', message: String((e && e.message) || e), hint: (e && e.hint) || null }
    }
  }
  return { handle, state, specOf, call }
}

console.log('=== 0. THE SURFACES THIS SUITE DRIVES ARE PUBLISHED, AND THE THREE SENTENCES ARE IN THE SOURCE ===')

console.log('--- 0a. source pins: the three fixes are in the files, not only in this test ---')
ok(SRC_BLUEPRINT.includes('const strippedCopy = dup.matched !== null'),
  '★ ① the blueprint write path ASKS whether a copy was stripped before it decides who owns the base (RUN 216)', SRC_BLUEPRINT.includes('strippedCopy'))
ok(SRC_BLUEPRINT.includes('A strip removes a COPY; it must never'),
  '★ ① and the reason is written down beside it: a strip must not turn the remainder into the whole base', SRC_BLUEPRINT.indexOf('a strip removes a COPY') > 0)
ok(SRC_BLUEPRINT.includes('&& !strippedCopy'), '★ ① the replacement branch is now conditional on NOT having stripped a copy', SRC_BLUEPRINT.includes('&& !strippedCopy'))
ok(!SRC_TOOLS.includes("'; it ALSO holds ' + String(rulingCards.count) + ' TYPED RULING CARD(S) filed"), '★ ② the false sentence is GONE from the ruling READ (a comment may still quote the old wording)', SRC_TOOLS.includes("String(rulingCards.count) + ' TYPED RULING CARD(S) filed"))
ok(SRC_TOOLS.includes('SUBMITTED RULING CARD(S) filed for proposition'),
  '★ ② and the card count is named by what it counts: SUBMITTED (what `sources.submittedRulings` counts)', SRC_TOOLS.includes('SUBMITTED RULING CARD(S) filed for proposition'))
ok(SRC_HANDLERS.includes('libraryCard: {'), '★ ③ the records read returns a `libraryCard` block instead of a wrong-noun refusal', SRC_HANDLERS.includes('libraryCard: {'))
ok(SRC_HANDLERS.includes('names a LIBRARY FILE card'),
  '★ ③ and the block says what the id names (a file card, not a ledger row)', SRC_HANDLERS.includes('names a LIBRARY FILE card'))
ok(SRC_HANDLERS.includes('`{ member: "<owner>" }` lists those cards with their `.md` path'),
  '★ ③ the fallback refusal still names the reachable door for a file card the kernel cannot expand', SRC_HANDLERS.includes('lists those cards with their'))

console.log('=== 1. ① A PASTED-BACK COPY IS REMOVED AND THE BASE STAYS (run 53: 0 times) ===')
const A = await boot({ root: mkdtempSync(join(TMP, 'k-')) })
const kernel = A.handle.kernel
ok(kernel !== null && typeof kernel.records === 'object', 'the kernel booted with a records face (a null kernel would make every assertion below vacuous)', kernel === null)
for (const [id, slot] of [['r-acad', 'chair'], ['r-1', 'member'], ['r-2', 'member']]) await kernel.members.hire({ id, slot })
ok(kernel.members.roster().length === 3, 'three real members are seated before any blueprint call (RULE E)', kernel.members.roster().length)

const BASE_LINE = '诊断草案第一段：只用于 RUN 216 复验 1.1b。'
// legacy path: kernel-materialized only when materialize:true is explicit (RUN 255 default flipped to fs-first)
const first = await A.call('vibe_v5_blueprint', { action: 'propose', materialize: true, member: 'r-1', text: BASE_LINE })
ok(first.ok === true && typeof first.id === 'string' && first.continued === false, 'a first proposal is written (a draft is not in force until adopt)', { ok: first.ok, id: first.id, continued: first.continued, code: first.code })
ok(first.bodyPrefixDropped === 0, 'a FIRST proposal has nothing to strip (bodyPrefixDropped 0)', first.bodyPrefixDropped)

const rowA = kernel.records.get({ id: first.id })
const parsedA = rowA ? BLUEPRINT.parseBlueprint(rowA.record || rowA) : null
ok(parsedA !== null && String(parsedA.text || '').includes(BASE_LINE), 'the draft row really carries the base line (read back from disk)', parsedA && String(parsedA.text).slice(0, 80))

// The run-53 shape: the FIRST proposer pastes the whole draft it just read, then appends its own text.
const PASTED = String(parsedA.text)
const APPENDED = '交换段：复核分工，我先验归纳步。'
const second = await A.call('vibe_v5_blueprint', { action: 'propose', materialize: true, member: 'r-1', draft: first.id, text: PASTED + '\n\n## 共同设计补充｜r-1\n- ' + APPENDED })
ok(second.ok === true && second.continued === true, 'the same author continues the SAME draft (one draft per revision)', { ok: second.ok, continued: second.continued, code: second.code })
ok(Number(second.bodyPrefixDropped) > 0, '★ the pasted copy was counted and removed (bodyPrefixDropped > 0)', second.bodyPrefixDropped)
ok(typeof second.bodyPrefixDroppedMeans === 'string' && second.bodyPrefixDroppedMeans.includes('holds it once'),
  'the receipt claims the revision holds the draft once — the claim this suite now checks against the disk', second.bodyPrefixDroppedMeans)

const rowB = kernel.records.get({ id: first.id })
const parsedB = rowB ? BLUEPRINT.parseBlueprint(rowB.record || rowB) : null
ok(parsedB !== null, 'the continued draft can be read back (a null parse would make the next assertion vacuous)', parsedB === null)
const textB = parsedB === null ? '' : String(parsedB.text || '')
const baseCount = textB.split(BASE_LINE).length - 1
ok(baseCount === 1, '★★ ① the base line appears EXACTLY ONCE after the paste (run 53 measured 0 — the sentence was false)', { baseCount, text: textB.slice(0, 200) })
ok(textB.includes(APPENDED), '★ the text after the pasted copy is stored as the author\'s own addition (nothing was thrown away)', textB.includes(APPENDED))
ok(textB.includes('## 共同设计补充｜r-1'), '★ and it lands under the author\'s own section heading', textB.includes('## 共同设计补充｜r-1'))

console.log('=== 2. ② A SUBMITTED CARD IS NOT CALLED TYPED (run 53: readings contradicted themselves) ===')
const B = await boot({ root: mkdtempSync(join(TMP, 'k-')) })
const kb = B.handle.kernel
for (const [id, slot] of [['r-acad', 'chair'], ['r-1', 'member'], ['r-2', 'member']]) await kb.members.hire({ id, slot })
const card = await B.call('vibe_v5_record_proposition', { id: 'p-r216', statement: '1+1=2（RUN 216 复验卡）', value: 1, motive: 'RUN 216 复验裁决读数', p: 0.5, member: 'r-1' })
ok(card.ok === true, 'the proposition card is written (a card is the object of the ruling)', { ok: card.ok, code: card.code, message: String(card.message || '').slice(0, 120) })
const convened = await B.call('vibe_v5_meeting', { agenda: 'RUN 216：p-r216 的辩论裁决', kind: 'sync', member: 'r-acad' })
ok(convened.ok === true && typeof convened.meeting === 'string', 'the meeting is convened (its id is read from the receipt, never invented)', { ok: convened.ok, meeting: convened.meeting, code: convened.code })
const MID = String(convened.meeting)
for (const m of ['r-1', 'r-2']) {
  const filed = await B.call('vibe_v5_verdict', { meeting: MID, proposition_id: 'p-r216', verdict: 1, reason: m + ' 自己交的裁决（不是主席代填）', member: m })
  ok(filed.ok === true && filed.channel === 'ruling', '★ a member files its OWN ruling card (' + m + ') — the submission half', { ok: filed.ok, channel: filed.channel, code: filed.code, message: String(filed.message || '').slice(0, 120) })
}
const final = await B.call('vibe_v5_verdict_final', { meeting: MID, proposition_id: 'p-r216', member: 'r-acad' })
ok(final.ok === true, 'the chair tallies the debate (omitting verdicts so the filed cards are used)', { ok: final.ok, code: final.code, message: String(final.message || '').slice(0, 160) })
const sources = final.sources || (final.p1RulingReading && final.p1RulingReading.sources) || null
ok(sources !== null && Number(sources.submitted) === 2 && Number(sources.typed) === 0,
  '★ PREMISE: the tally counted TWO SUBMITTED rulings and NO chair-typed numbers (the receipt\'s own numbers)', sources)
const reading = final.p1RulingReading || null
ok(reading !== null && typeof reading.means === 'string' && reading.means.length > 0,
  'the ruling reading carries a non-empty `means` (the sentence this defect is about)', reading && String(reading.means).slice(0, 160))
const means = String((reading && reading.means) || '')
ok(means.includes('SUBMITTED RULING CARD'), '★★ ② the sentence names the cards by what they are: SUBMITTED', means.slice(0, 220))
ok(!means.includes('TYPED RULING CARD'), '★★ ② and it no longer calls the members\' own cards TYPED (run 53 read "the chair typed two cards")', means.slice(0, 220))
ok(Number(reading && reading.voted === true ? 1 : 0) === 1, 'and the reading does find a counted decision (voted:true) — the sentence and the verdict agree', { voted: reading && reading.voted })

console.log('=== 3. ③ A FILED RULING IS READABLE BY ITS OWN ID (run 53: "unknown record") ===')
const listing = await B.call('vibe_v5_read_library', { member: 'r-1' })
const cards = (listing && Array.isArray(listing.libraryCards)) ? listing.libraryCards : []
ok(cards.length > 0, 'the member\'s library lists the ruling file card (premise: a file card exists to be read)', { count: cards.length, keys: Object.keys(listing || {}).slice(0, 12) })
const fileCard = cards.filter((c) => c && String(c.kind || '') !== 'proposition' || (c && /^ruling-/.test(String(c.id || ''))))[0] || cards[0]
ok(fileCard && typeof fileCard.id === 'string', 'the listed card has an id (a file card is named, not anonymous)', fileCard && { id: fileCard.id, path: fileCard.path })
const byId = await B.call('vibe_v5_read_library', { id: String(fileCard.id) })
ok(byId.ok === true, '★★ ③ reading that id now SUCCEEDS instead of VMU_NO_SUCH_OBJECT', { ok: byId.ok, code: byId.code, message: String(byId.message || '').slice(0, 160) })
ok(byId.card === null, 'and it does not pretend a ledger row exists: `card` is null for a file card', { card: byId.card })
const lc = byId.libraryCard || null
ok(lc !== null && String(lc.id) === String(fileCard.id), '★ the receipt carries the `libraryCard` block for the id that was asked', lc && { id: lc.id, path: lc.path })
ok(lc !== null && String(lc.body || '').includes('VMU-RULING'), '★★ ③ the BODY is returned (the machine payload the tally parses), not just a path', lc && String(lc.body).slice(0, 120))
ok(lc !== null && typeof lc.means === 'string' && lc.means.includes('LIBRARY FILE card'), 'and the block says which noun this id is, so the reader is not left guessing', lc && String(lc.means).slice(0, 160))
ok(lc !== null && (lc.path === null || /\.md$/.test(String(lc.path))), 'the path, when printed, is the .md the card really is (never invented)', lc && lc.path)

const miss = await B.call('vibe_v5_read_library', { id: 'ruling-does-not-exist-216' })
ok(miss.ok === false && miss.code === 'VMU_NO_SUCH_OBJECT', 'a genuinely unknown id is still refused BY NAME (the expansion did not swallow the refusal)', { ok: miss.ok, code: miss.code })
ok(typeof miss.hint === 'string' && miss.hint.includes('member:'), 'and its hint still names the reachable door (`member:"<owner>"` lists file cards)', String(miss.hint || '').slice(0, 200))
const declared = V5R_PACK_TOOLS.filter((t) => t && t.name === 'vibe_v5_read_library')[0]
ok(declared && declared.parameters && declared.parameters.id !== undefined,
  'the declaration still publishes `id` (the wire this suite drove is the documented one)', declared && Object.keys(declared.parameters))

console.log('=== RESULT: ' + passed + ' passed, ' + failed + ' failed ===')
if (failed > 0) {
  console.log('FAILURES:')
  for (const f of failures) console.log('  - ' + f)
  process.exitCode = 1
}

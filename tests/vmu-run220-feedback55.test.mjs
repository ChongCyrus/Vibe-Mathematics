/**
 * tests/vmu-run220-feedback55.test.mjs — RUN 220: run 56 (FEEDBACK55) measured five readings that were true of
 * something other than the question asked.
 *
 *   ① `vibe-math-vmu/packs/v5r/prompts/v5r-core.js` — the record-book contract TAUGHT A FALSE MECHANISM: "in real
 *      subagent mode your record book is a private kernel instance the institute cannot read". run 56 MEASURED the
 *      office reading `rec-21` (owner r-1, rev 1) out of the SAME durable ledger with `vibe_v5_read_library`. The
 *      contract now states the branch it can prove, and names the receipt field (`libraryRoot`) that decides it.
 *   ② `vibe-math-vmu/packs/v5r/tools.js` — `appliedScope` said `this-process-only` for `vmu.paper.officeConsult`,
 *      a key whose own `reachableInstead` names a durable route members DO read, using the SAME word as
 *      `vmu.turn.leaderId`, whose `reachableInstead` says no face can reach it. Two opposite facts, one scope word.
 *   ③ `vibe-math-vmu/packs/v5r/blueprint.js` — `draftSharing.means` advised "say so in `note` and prune the draft"
 *      AFTER adoption, where prune moves WHOLE rows and would take the live protocol with it.
 *   ④ `vibe-math-vmu/host.js` — a positional `prune keep:1` could trash the CURRENT row and the receipt only said
 *      "the rows above are in the TRASH". It now counts the doomed CURRENT rows and warns before the act.
 *   ⑤ `vibe-math-vmu/packs/v5r/tools.js` — the `rulings` face prints its count at the TOP level; the absence of a
 *      `submissions` block was read as a missing number. And `VMU_RULING_ALREADY_FILED` said "a note to the chair"
 *      without naming the durable face that carries a note.
 *
 * RULE E: every fixture assertion is preceded by an explicit non-empty premise check.
 *
 * Run: node tests/vmu-run220-feedback55.test.mjs
 */
import { mkdirSync, mkdtempSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { REPO } from './_lib/repo-root.mjs'

const VMU = join(REPO, 'vibe-math-vmu')
const TMP = 'D:/_tmp/r220'
mkdirSync(TMP, { recursive: true })

const SRC_CORE = readFileSync(join(VMU, 'packs', 'v5r', 'prompts', 'v5r-core.js'), 'utf8')
const SRC_TOOLS = readFileSync(join(VMU, 'packs', 'v5r', 'tools.js'), 'utf8')
const SRC_BLUEPRINT = readFileSync(join(VMU, 'packs', 'v5r', 'blueprint.js'), 'utf8')
const SRC_HOST = readFileSync(join(VMU, 'host.js'), 'utf8')

let passed = 0
let failed = 0
const failures = []
function ok(cond, name, detail) {
  if (cond) { passed += 1; console.log('  ok   ' + name) }
  else { failed += 1; failures.push(name + (detail === undefined ? '' : ' :: ' + JSON.stringify(detail))); console.log('  FAIL ' + name + (detail === undefined ? '' : ' :: ' + JSON.stringify(detail))) }
}
const has = (text, needle, name) => ok(typeof text === 'string' && text.includes(needle), name, text)
const hasNot = (text, needle, name) => ok(typeof text !== 'string' || !text.includes(needle), name, text)
const codeOf = (e) => (e && (e.code || (e.cause && e.cause.code))) || null
const hintOf = (r) => String((r && (r.hint || (r.refusal && r.refusal.hint))) || '')
const meansOf = (r) => String((r && (r.means || (r.closureVote && r.closureVote.means))) || '')

const entry = await import(pathToFileURL(join(VMU, 'vibe-math-vmu.js')).href)

const boot = async (config = {}) => {
  const state = { specs: [] }
  const root = config.root || mkdtempSync(join(TMP, 'k-'))
  const ctx = {
    effect: (fn) => fn(),
    on: () => () => {},
    tools: { register: async (spec) => { state.specs.push(spec); return () => {} } },
  }
  const handle = entry.apply(ctx, Object.assign({ clock: () => 1000, packs: ['v5r'] }, config, { root }))
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

console.log('=== 0. THE SENTENCES ARE IN THE SOURCE ===')

ok(SRC_CORE.includes('先确认你的记录本落在哪个库根'),
  '★ ① the record-book contract asks which ROOT the record book landed on, instead of asserting privacy', SRC_CORE.includes('先确认'))
hasNot(SRC_CORE, '研究所的正式记录本读不到它',
  '★ ① the false sentence ("the institute cannot read your record book") is GONE — run 56 read rec-21 across kernels')
has(SRC_CORE, 'libraryRoot',
  '★ ① the contract names the receipt field that decides which branch applies')
// ★ T1 pin refresh (old '采纳之前' → current '采纳前'): the advice is STILL in the prompt and still names the
// BEFORE-adoption window (采纳前 … prune); only the wording moved when the draft-sharing text was rewritten to also
// point at blueprint.js's BEFORE/AFTER windows. Same claim, so the pin follows the wording — and the failure echo is
// now the matching line itself instead of the whole corpus file (a failed `has` used to dump it all).
const adviceLines = SRC_CORE.split('\n').filter((line) => line.includes('采纳前') && line.includes('prune'))
ok(adviceLines.length === 1 && /采纳前[^。]*prune/.test(adviceLines[0]) && adviceLines[0].includes('共享草案'),
  '★ ③ the cleanup advice names the window where pruning a draft is still reachable (采纳前 … prune)',
  adviceLines.length === 1 ? adviceLines[0].slice(0, 400) : adviceLines.length + ' matching line(s)')
hasNot(SRC_CORE, '不想要就在 note 里说明并让所办 prune，不要把共享草案当草稿纸。',
  '★ ③ the old advice that only worked BEFORE adoption is gone')

has(SRC_TOOLS, 'const routeFor = processOnly ? (MEMBER_FACING_SETTING_ROUTES[key] || null) : null',
  '★ ② a route predicate sits beside `processOnly` (the scope word can now follow the route, not the kernel flag)')
has(SRC_TOOLS, "'this-process (members reach the intent another way — see reachableInstead)'",
  '★ ② a key WITH a named route no longer reports the same word as a key with none')
has(SRC_TOOLS, "reachableInstead: processOnly ? (routeFor || MEMBER_FACING_SETTING_ROUTES['*']) : null",
  '★ ② and `reachableInstead` reads the same predicate, so the two fields cannot disagree')
has(SRC_TOOLS, 'absence of a `submissions` block here is not a missing number',
  '★ ⑤ the `rulings` face says its top-level count IS `verdict_final.submissions.count`')
has(SRC_TOOLS, 'send it with vibe_v5_message',
  '★ ⑤ `VMU_RULING_ALREADY_FILED` names a REACHABLE channel for "a note to the chair"')

has(SRC_BLUEPRINT, 'The AFTER-adoption window is stated only so the future is not a surprise',
  '★ ③ draftSharing.means states what happens after adoption')
has(SRC_BLUEPRINT, 'NO path that deletes just a paragraph',
  '★ ③ …and says the paragraph-level edit has no face at all')

has(SRC_HOST, 'const declaredCurrent = []',
  '★ ④ prune counts the doomed rows that DECLARE current (RUN 222 renamed it: a declaration is history, not the in-force row)')
has(SRC_HOST, "bodyText.indexOf('- status：current') >= 0",
  '★ ④ …and reads the row header, because the list projection calls a CURRENT row `live` like its drafts')
has(SRC_HOST, 'doomedDeclaredCurrentCount: declaredCurrent.length',
  '★ ④ the DECLARED count is on the receipt')
has(SRC_HOST, 'doomedInForceIds: inForceIds.length === 0',
  '★ ④ ★★ and the IN-FORCE rows are DERIVED from the headers (RUN 224; RUN 222 left them null)')
has(SRC_HOST, 'counted from the NEWEST row backwards',
  '★ ④ the by-position means states which direction `keep` counts')

console.log('\n=== 1. appliedScope follows the route (FEEDBACK55 1.1) ===')

{
  const { call } = await boot()
  const founded = await call('vibe_v5_start', { researcherCount: 2, problem: 'run220 appliedScope' })
  ok(founded.ok === true, '§1 premise: the institute starts', founded)
  const applied = Array.isArray(founded.applied) ? founded.applied : []
  ok(applied.length > 0, '§1a premise: the start receipt reports the settings it applied', applied.length)
  const leader = applied.filter((a) => a && a.key === 'vmu.turn.leaderId')[0] || null
  ok(leader !== null, '§1b premise: `vmu.turn.leaderId` is among them', applied.map((a) => a && a.key))
  ok(String(leader.appliedScope) === 'this-process-only',
    '§1c a key with NO per-key route still says `this-process-only` (the word did not get weaker)',
    { appliedScope: leader.appliedScope })
  ok(String(leader.applied) === 'immediate (THIS PROCESS ONLY)',
    '§1d …and its value keeps the qualifier', { applied: leader.applied })

  const consult = await call('vibe_v5_set', { key: 'vmu.paper.officeConsult', value: 'off', why: 'run220 复验：有成员可达路线' })
  ok(consult.ok === true, '§1e premise: the office sets a member-facing key', consult)
  const block = (consult.applied && typeof consult.applied === 'object') ? consult.applied : {}
  ok(block.partial === true, '§1f premise: the setting is a `this-process` declaration, so it is partial', block.partial)
  has(String(block.appliedScope), 'members reach the intent another way',
    '§1g ★ a key WITH a named route says so, instead of borrowing the no-route word', { appliedScope: block.appliedScope })
  has(String(block.reachableInstead), 'consult',
    '§1h …and the route is the one it prints', { reachableInstead: block.reachableInstead })
  ok(String(block.appliedScope) !== 'this-process-only',
    '§1i the two opposite facts no longer share one word', { appliedScope: block.appliedScope })
}

console.log('\n=== 2. draftSharing.means names the adoption boundary (FEEDBACK55 1.2) ===')

{
  const { call } = await boot()
  const started = await call('vibe_v5_start', { researcherCount: 2, problem: 'run220 蓝图窗口' })
  ok(started.ok === true, '§2 premise: the institute starts', started)
  // legacy path: kernel-materialized only when materialize:true is explicit (RUN 255 default flipped to fs-first)
  const first = await call('vibe_v5_blueprint', { action: 'propose', materialize: true, member: 'r-1', text: '第 220 次演练：草案一' })
  ok(first.ok === true, '§2a premise: the first proposal opens a draft', first)
  const second = await call('vibe_v5_blueprint', { action: 'propose', materialize: true, member: 'r-2', text: '草案二：续写' })
  ok(second.ok === true, '§2b premise: the second proposal continues it', second)
  const sharing = second.draftSharing || {}
  has(String(sharing.means), 'The AFTER-adoption window is stated only so the future is not a surprise',
    '§2c ★ the means states what is true after adoption', { means: sharing.means })
  has(String(sharing.means), 'NO path that deletes just a paragraph',
    '§2d ★ …and says the paragraph edit it used to suggest has no face', { means: sharing.means })
  hasNot(String(sharing.means), 'say so in `note` and prune the draft (',
    '§2e the advice that only worked before adoption is gone', { means: sharing.means })
}

console.log('\n=== 3. a positional prune warns before it trashes the CURRENT row (FEEDBACK55 1.3) ===')

{
  const { call } = await boot()
  const started = await call('vibe_v5_start', { researcherCount: 2, problem: 'run220 prune 现行版' })
  ok(started.ok === true, '§3 premise: the institute starts', started)
  const first = await call('vibe_v5_blueprint', { action: 'propose', materialize: true, member: 'r-1', text: '第 220 次演练：将被采纳的草案' })
  ok(first.ok === true, '§3a premise: a NEW draft exists (appendedTo is null on a first proposal)',
    first.draftSharing && first.draftSharing.appendedTo !== undefined ? first.draftSharing : first)
  const draftId = typeof first.id === 'string' ? first.id : null
  ok(typeof draftId === 'string' && draftId !== '', '§3b premise: the draft row id is printed at the top level', { draftId })
  const chairDesign = await call('vibe_v5_blueprint', { action: 'propose', materialize: true, member: 'r-acad', text: '院士席的设计 section：第 220 次演练' })
  ok(chairDesign.ok === true, '§3b2 premise: the chair writes its own design section (adopt cannot substitute for co-design)',
    chairDesign.ok === true ? true : { code: chairDesign.code, message: chairDesign.message })
  const adopted = await call('vibe_v5_blueprint', { action: 'adopt', member: 'r-acad', draft: draftId })
  ok(adopted.ok === true, '§3c premise: the draft becomes the current protocol', adopted)
  const newer = await call('vibe_v5_blueprint', { action: 'propose', materialize: true, member: 'r-2', text: '第 220 次演练：更晚的一份草案' })
  ok(newer.ok === true, '§3d premise: a NEWER row now sits above the current one', newer)

  const dry = await call('vibe_vmu_records', { action: 'prune', track: 'blueprint', keep: 1, dryRun: true })
  ok(dry.ok === true, '§3e the positional dry run answers', dry)
  ok(Number(dry.doomedDeclaredCurrentCount) >= 1,
    '§3f ★ the receipt counts the doomed rows that DECLARE current (run 56: keep:1 would have trashed the row the track was using)',
    { doomedDeclaredCurrentCount: dry.doomedDeclaredCurrentCount, wouldPrune: dry.wouldPruneCount })
  has(String(dry.doomedDeclaredCurrentMeans), 'WARNING',
    '§3g ★ …and says so in words, not only in a number', { means: dry.doomedDeclaredCurrentMeans })
  has(String(dry.doomedDeclaredCurrentMeans), 'status: current',
    '§3h the warning names the line it actually read (the row header), not a verdict about what is in force', { means: dry.doomedDeclaredCurrentMeans })
  has(String(dry.doomedDeclaredCurrentMeans), 'WHEN IT WAS WRITTEN',
    '§3h-2 ★★★ RUN 222/224: the sentence says that header line was true WHEN WRITTEN and points at the derivation', { means: dry.doomedDeclaredCurrentMeans })
  ok(Number.isInteger(dry.doomedInForceCount),
    '§3h-3 ★★ the in-force count is COMPUTED from the row headers (RUN 224)', dry.doomedInForceCount)
  has(String(dry.doomedInForceMeans), 'highest `revision`',
    '§3h-4 …and the means states the ruler it used', { means: dry.doomedInForceMeans })
  has(String(dry.selectionMeans), 'counted from the NEWEST row backwards',
    '§3i the by-position means states the direction, so `keep` cannot be read as "keep the current one"', { means: dry.selectionMeans })

  const byId = await call('vibe_vmu_records', { action: 'prune', track: 'blueprint', ids: String(draftId), dryRun: true })
  ok(byId.ok === true, '§3j premise: a by-id dry run answers for the same track', byId)
  ok(Number(byId.doomedDeclaredCurrentCount) === 0,
    '§3k ★ a by-id selection does not doom a row that DECLARES current, and the count proves it',
    { doomedDeclaredCurrentCount: byId.doomedDeclaredCurrentCount, means: byId.doomedDeclaredCurrentMeans })
  ok(byId.doomedDeclaredCurrentMeans === null,
    '§3l …and prints no warning at all (a clean selection is not a warning with a zero in it)', { m: byId.doomedDeclaredCurrentMeans })
}

console.log('\n=== 4. the two ruling shapes are one number, and the note has a channel (FEEDBACK55 1.4 / 1.5) ===')

{
  const { call, handle } = await boot()
  const started = await call('vibe_v5_start', { researcherCount: 2, problem: 'run220 裁决面' })
  ok(started.ok === true, '§4 premise: the institute starts', started)
  const card = await call('vibe_v5_record_proposition', {
    statement: 'run220 命题：前 n 个奇数之和等于 n 的平方', value: 1, motive: '归纳', p: 0.9, member: 'r-acad',
    proof_ref: 'Members/r-acad/Propos/rec-220.md#形式证明', proof_state: 'complete',
  })
  ok(card.ok === true, '§4a premise: a proposition card exists', card)
  const conv = await call('vibe_v5_meeting', { agenda: '决定 ' + card.recordId + ' 是否成立', type: 'debate', subject: card.recordId, member: 'r-acad' })
  ok(conv.ok === true && typeof conv.meeting === 'string', '§4b premise: a debate meeting exists', conv)
  const mid = conv.meeting
  const filed = await call('vibe_v5_verdict', { meeting: mid, proposition_id: card.recordId, verdict: 1, reason: '由归纳可证', member: 'r-1' })
  ok(filed.ok === true, '§4c premise: r-1 files a typed ruling', filed)
  const same = await call('vibe_v5_verdict', { meeting: mid, proposition_id: card.recordId, verdict: 1, reason: '补充理由：每一步都用了归纳假设', member: 'r-1' })
  ok(same.ok === false && same.code === 'VMU_RULING_ALREADY_FILED',
    '§4d premise: a second card with the SAME verdict and a DIFFERENT reason is refused', { code: same.code, message: same.message })
  has(hintOf(same), 'vibe_v5_message',
    '§4e ★ the refusal names a durable, reachable way to send the chair the note (say so to the chair → with what?)',
    { hint: hintOf(same) })

  const rulings = await call('vibe_v5_meeting', { action: 'rulings', id: mid, proposition_id: card.recordId })
  ok(rulings.ok === true, '§4f premise: the rulings face answers for the same (meeting, proposition)', rulings)
  ok(Number(rulings.count) >= 1, '§4g premise: it found the filing', { count: rulings.count })
  ok(rulings.submissions === undefined,
    '§4h the face really has no `submissions` block (the shape FEEDBACK55 compared against)', { hasSubmissions: rulings.submissions !== undefined })
  has(meansOf(rulings), 'absence of a `submissions` block here is not a missing number',
    '§4i ★ the means says the top-level count IS `submissions.count`, so the missing block is not a missing number',
    { means: meansOf(rulings) })
  ok(String(rulings.count) !== '0',
    '§4j …and the number it points at is not a stand-in zero', { count: rulings.count })
}

console.log('\n=== 5. the record-book contract survives the member-registration pin (no word was dropped) ===')
{
  has(SRC_CORE, '记录本契约', '§5a the section is still named 记录本契约 (a pin checks this word)')
  has(SRC_CORE, '草稿', '§5b …and still talks about 草稿, with the branch that decides whether it is private')
  has(SRC_CORE, '回执', '§5c …and still points at the 回执 as the place a conclusion is registered')
  has(SRC_CORE, '所办', '§5d …and still names 所办 as the seat that files it')
}

console.log('')
console.log('TOTAL ' + (passed + failed) + ' PASS ' + passed + ' FAIL ' + failed)
if (failed > 0) { console.log('FAILURES:'); for (const f of failures) console.log('  - ' + f); process.exitCode = 1 }

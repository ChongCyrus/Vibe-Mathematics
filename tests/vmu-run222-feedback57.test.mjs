/**
 * tests/vmu-run222-feedback57.test.mjs — RUN 222: run 58 (FEEDBACK57) measured four readings that named the wrong
 * window, the wrong owner, or the wrong question.
 *
 *   ① `vibe-math-vmu/host.js` — a positional `prune keep:1` warned that it would trash "a CURRENT row" and named the
 *      SUPERSEDED revision rec-2, while `vibe_v5_blueprint { action: "state" }` said the row in force was rec-8. Root
 *      cause: the warning read the row HEADER (`- status：current`), which is a historical declaration written when the
 *      row was minted, not a verdict about what is in force today. The receipt now separates the two: what the header
 *      DECLARES (`doomedDeclaredCurrentCount`, with `HISTORY` in its sentence) and what is in force
 *      (`doomedInForceCount: null`, because only the owning face can compute that).
 *   ② `vibe-math-vmu/packs/v5r/blueprint.js` — `draftSharing.means` printed BOTH windows in one breath, so a call that
 *      STARTED a fresh draft row on a path that already had an adopted revision was told "AFTER adoption your text is
 *      inside the CURRENT protocol row" — the opposite of the fact. The sentence now names the window THIS call is in
 *      (`OPEN DRAFT row` when it continued one, `NEW DRAFT row` when it started one) and keeps the other as a warning
 *      about later, not a claim about now.
 *   ③ `vibe-math-vmu/packs/v5r/tools.js` — `started` and `startedRaw` carried the same fact under two key names
 *      (`middlewareAlreadyRegistered` vs `already`), and run 58 reported the shape difference itself as a defect. The
 *      projection is again `already`, with `alreadyMeans` giving the word its subject.
 *   ④ `vibe-math-vmu/packs/v5r/tools.js` — three different questions were called `settled` in one run (is the MEETING
 *      closed / is the TALLY decided / is the evidence CARD settled). The meeting-side reading now prints
 *      `meetingSettled` + `meetingSettledMeans`, keeps `settled` as a named deprecated alias, and says what it does not
 *      answer.
 *
 * RULE E: every assertion is preceded by an explicit non-empty premise check.
 *
 * Run: node tests/vmu-run222-feedback57.test.mjs
 */
import { mkdtempSync, readFileSync,mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { REPO } from './_lib/repo-root.mjs'

import { tmpRoot as __tmpRoot } from './_lib/scratch.mjs'
const VMU = join(REPO, 'vibe-math-vmu')
// The scratch parent is created here, not assumed: a per-round directory in D:\_tmp can be
// reclaimed by any tmp cleanup between runs, and mkdtempSync needs its parent to exist.
const TMP = __tmpRoot() + '/r222'
mkdirSync(TMP, { recursive: true })
const SRC_TOOLS = readFileSync(join(VMU, 'packs', 'v5r', 'tools.js'), 'utf8')
const SRC_BLUEPRINT = readFileSync(join(VMU, 'packs', 'v5r', 'blueprint.js'), 'utf8')

let passed = 0
let failed = 0
const failures = []
function ok(cond, name, detail) {
  if (cond) { passed += 1; console.log('  ok   ' + name) }
  else { failed += 1; failures.push(name + (detail === undefined ? '' : ' :: ' + JSON.stringify(detail))); console.log('  FAIL ' + name + (detail === undefined ? '' : ' :: ' + JSON.stringify(detail))) }
}
const has = (text, needle, name) => ok(typeof text === 'string' && text.includes(needle), name, typeof text === 'string' ? text.slice(0, 200) : text)

const entry = await import(pathToFileURL(join(VMU, 'vibe-math-vmu.js')).href)

const boot = async (extra = {}) => {
  const specs = []
  const root = mkdtempSync(join(TMP, 'k-'))
  const ctx = {
    effect: (fn) => fn(),
    on: () => () => {},
    tools: { register: async (spec) => { specs.push(spec); return () => {} } },
  }
  const handle = entry.apply(ctx, Object.assign({ clock: () => 1000, packs: ['v5r'] }, extra, { root }))
  await handle.ready()
  await handle.kernel.store.open()
  const specOf = (n) => specs.filter((s) => s && s.name === n)[0] || null
  const call = async (name, args = {}) => {
    const spec = specOf(name)
    if (!spec) return { ok: false, code: 'VMU_TEST_NO_SUCH_TOOL', message: 'tool ' + name + ' was not registered', hint: null }
    try {
      const raw = await spec.execute(args, { kernel: handle.kernel })
      const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw
      return parsed && typeof parsed === 'object' ? parsed : { ok: false, code: 'VMU_TEST_NO_RECEIPT', message: String(raw), hint: null }
    } catch (e) {
      return { ok: false, code: (e && (e.code || (e.cause && e.cause.code))) || 'VMU_TEST_THROWN', message: String((e && e.message) || e), hint: (e && e.hint) || null }
    }
  }
  return { handle, call }
}

console.log('\n=== 0. THE FOUR REPAIRS ARE ON THE SOURCE THEY BELONG TO ===')

has(SRC_BLUEPRINT, 'const draftSharingOf = (joinedId, authorList, continued) => ({',
  '§0a ★ the draft-sharing sentence is a function OF THIS CALL (a third argument says whether it continued a draft)')
has(SRC_BLUEPRINT, 'continuesOpenDraft: continued === true,',
  '§0b ★ the receipt prints which window applies, as a field')
has(SRC_BLUEPRINT, 'your text went into the OPEN DRAFT row',
  '§0c ★ a continuation is told which row its text joined')
has(SRC_BLUEPRINT, 'your text is in a NEW DRAFT row — this call adopted nothing',
  '§0d ★★ a fresh draft on an already-adopted path is told the BEFORE window applies to it (run 58 was told the opposite)')
has(SRC_TOOLS, 'alreadyMeans:',
  '§0e ★ the start projection gives `already` its subject in a separate sentence')
ok(!SRC_TOOLS.includes('middlewareAlreadyRegistered: started'),
  '§0f ★★ and the second name for the same fact is gone (one fact, one key)')
has(SRC_TOOLS, "meetingSettled: read.state === 'closed',",
  '§0g ★ the meeting-side reading answers "is the MEETING closed" under its own name')
has(SRC_TOOLS, 'settledDeprecated:',
  '§0h ★ and names the old key as a deprecated alias instead of silently keeping three meanings')

console.log('\n=== 1. THE DRAFT-SHARING SENTENCE NAMES THE WINDOW THIS CALL IS IN (FEEDBACK57 B) ===')

{
  const { call } = await boot()
  const started = await call('vibe_v5_start', { researcherCount: 2, problem: 'run222 草案窗口' })
  ok(started.ok === true, '§1 premise: the institute starts', started.ok === true ? true : started)

  // legacy path: kernel-materialized only when materialize:true is explicit (RUN 255 default flipped to fs-first)
  const first = await call('vibe_v5_blueprint', { action: 'propose', materialize: true, member: 'r-1', text: '第 222 次演练：第一份草案' })
  ok(first.ok === true, '§1a premise: a first proposal is accepted', first.ok === true ? true : { code: first.code, message: first.message })
  const draftId = typeof first.id === 'string' ? first.id : null
  ok(typeof draftId === 'string' && draftId !== '', '§1b premise: the draft row id is printed', { draftId })
  ok(first.draftSharing && first.draftSharing.continuesOpenDraft === false,
    '§1c ★ the FIRST proposal says it continued nothing', first.draftSharing)
  has(String(first.draftSharing && first.draftSharing.means), 'NEW DRAFT row',
    '§1d ★★ …and names the NEW DRAFT window, not the after-adoption one', String(first.draftSharing && first.draftSharing.means))

  const chair = await call('vibe_v5_blueprint', { action: 'propose', materialize: true, member: 'r-acad', text: '院士席的设计 section：第 222 次' })
  ok(chair.ok === true, '§1e premise: the chair writes its own section into the SAME draft', chair.ok === true ? true : { code: chair.code, message: chair.message })
  ok(chair.draftSharing && chair.draftSharing.continuesOpenDraft === true,
    '§1f ★ a continuation says it joined an open draft', chair.draftSharing)
  has(String(chair.draftSharing && chair.draftSharing.means), 'OPEN DRAFT row',
    '§1g ★★ …and names that row in words', String(chair.draftSharing && chair.draftSharing.means))
  ok(String(chair.draftSharing && chair.draftSharing.means).includes(String(draftId)),
    '§1h …naming the actual id a reader can act on', { means: String(chair.draftSharing && chair.draftSharing.means).slice(0, 160), draftId })

  const adopted = await call('vibe_v5_blueprint', { action: 'adopt', member: 'r-acad', draft: draftId })
  ok(adopted.ok === true, '§1i premise: the draft becomes the current protocol', adopted.ok === true ? true : { code: adopted.code, message: adopted.message })

  const after = await call('vibe_v5_blueprint', { action: 'propose', materialize: true, member: 'r-2', text: '第 222 次演练：采纳之后的一版新草案' })
  ok(after.ok === true, '§1j premise: a NEW revision is proposed after adoption', after.ok === true ? true : { code: after.code, message: after.message })
  ok(after.draftSharing && after.draftSharing.continuesOpenDraft === false && after.draftSharing.appendedTo === null,
    '§1k ★★★ run 58 shape: a fresh draft row after adoption starts nothing it continues', after.draftSharing)
  const afterMeans = String(after.draftSharing && after.draftSharing.means)
  has(afterMeans, 'NEW DRAFT row',
    '§1l ★★★ …and the sentence says the BEFORE-adoption window is the live one for THIS call', afterMeans)
  has(afterMeans, 'does NOT describe this call',
    '§1m ★★ the after-adoption paragraph is explicitly labelled as not being about this call', afterMeans)
}

console.log('\n=== 2. THE START PROJECTION PRINTS ONE NAME AND ONE SUBJECT (FEEDBACK57 ②A) ===')

{
  const { call } = await boot()
  const founded = await call('vibe_v5_start', { researcherCount: 2, problem: 'run222 立所读数' })
  ok(founded.ok === true, '§2 premise: the institute starts', founded.ok === true ? true : founded)
  const projection = founded.started
  ok(projection && typeof projection === 'object', '§2a premise: the projection block exists', projection)
  ok(projection.already === true, '§2b ★ the kernel\'s own start answer travels as `already` (the same key `startedRaw` uses)', projection)
  ok(!('middlewareAlreadyRegistered' in projection),
    '§2c ★★ the second name is gone, so there is no shape difference to report as a defect', Object.keys(projection || {}))
  has(String(projection.alreadyMeans), 'does NOT mean the institute existed before',
    '§2d ★★ the sentence gives the word its subject: `true` is about middleware in THIS process', String(projection.alreadyMeans))
  ok(founded.startedRaw && founded.startedRaw.already === true,
    '§2e and the raw kernel answer is still carried, unchanged', founded.startedRaw)
}

console.log('\n=== 3. `settled` IS ANSWERED UNDER THE NAME OF THE QUESTION IT ANSWERS (FEEDBACK57 ②E) ===')

{
  const { handle, call } = await boot()
  const started = await call('vibe_v5_start', { researcherCount: 2, problem: 'run222 会议读数' })
  ok(started.ok === true, '§3 premise: the institute starts', started.ok === true ? true : started)

  // The MEETING route: a ruling that names a meeting is read off the MEETINGS face — that is the branch whose word
  // `settled` collided with the tally and the card. Quorum is ATTENDANCE, not votes, so the three seats sit first.
  const convened = await call('vibe_v5_meeting', { member: 'r-acad', agenda: '第 222 次裁定', title: 'run222 裁定会' })
  ok(convened.ok === true && typeof convened.meeting === 'string', '§3a premise: a meeting exists', convened)
  const meetingId = String(convened.meeting)
  for (const who of ['r-acad', 'r-1', 'r-2']) handle.kernel.meetings.attend({ meeting: meetingId, member: who })
  const moved = handle.kernel.meetings.motion({ meeting: meetingId, member: 'r-acad', text: 'n+n=2n 成立，交由一致表决' })
  ok(moved && moved.ok === true, '§3b premise: a motion is on the floor', moved)
  const motionId = String(moved.motion)
  handle.kernel.meetings.second({ meeting: meetingId, motion: motionId, member: 'r-1' })
  for (const who of ['r-acad', 'r-1', 'r-2']) {
    handle.kernel.meetings.vote({ meeting: meetingId, motion: motionId, member: who, value: 1 })
  }

  const card = await call('vibe_v5_record_proposition', {
    statement: 'run222 §3 命题：n+n=2n', value: 1, motive: '算术', p: 0.99,
    proof_ref: 'Members/r-1/Propos/run222.md#证明', proof_state: 'complete', member: 'r-1',
  })
  ok(card.ok === true, '§3c premise: the card exists at p=0.99', card.ok === true ? true : { code: card.code, message: card.message })
  const cardId = card.recordId
  const settled = await call('vibe_v5_record_proposition', {
    id: cardId, statement: 'run222 §3 命题：n+n=2n', value: 1, motive: '算术', p: 1, member: 'r-1',
    debate_ruling: { subject: cardId, value: 1, mode: 'unanimous', n: 3, decided: true, meeting: meetingId, by: 'r-acad' },
  })
  ok(settled.ok === true, '§3d premise: the meeting-ruled p=1 write is admitted', settled.ok === true ? true : { code: settled.code, message: settled.message })
  const reading = settled.p1RulingReading
  ok(reading && reading.kind === 'meeting', '§3e premise: the ruling reading came off the MEETINGS face', reading && reading.kind)
  ok(typeof reading.meetingSettled === 'boolean',
    '§3f ★ the reading answers "is the MEETING closed" under its own name (a boolean, never absent)', reading && reading.meetingSettled)
  has(String(reading.meetingSettledMeans), 'ONLY "is the MEETING closed"',
    '§3g ★★ …and says it answers nothing about the tally or the card', String(reading.meetingSettledMeans))
  ok(reading.settled === reading.meetingSettled,
    '§3h ★ the old key is an ALIAS of the new one (they cannot disagree)', { settled: reading.settled, meetingSettled: reading.meetingSettled })
  has(String(reading.settledDeprecated), 'three different questions were read off the word',
    '§3i ★★ and the alias is named as deprecated, with the reason run 58 measured', String(reading.settledDeprecated))
}

console.log('\n=== 4. A POSITIONAL PRUNE COUNTS DECLARATIONS, AND SAYS WHO OWNS "IN FORCE" (FEEDBACK57 A) ===')

{
  const { call } = await boot()
  const started = await call('vibe_v5_start', { researcherCount: 2, problem: 'run222 剪除读数' })
  ok(started.ok === true, '§4 premise: the institute starts', started.ok === true ? true : started)
  const first = await call('vibe_v5_blueprint', { action: 'propose', materialize: true, member: 'r-1', text: '第 222 次演练：将被采纳的草案' })
  ok(first.ok === true, '§4a premise: a draft exists', first.ok === true ? true : { code: first.code, message: first.message })
  const draftId = typeof first.id === 'string' ? first.id : null
  ok(typeof draftId === 'string' && draftId !== '', '§4b premise: the draft id is printed', { draftId })
  const chairDesign = await call('vibe_v5_blueprint', { action: 'propose', materialize: true, member: 'r-acad', text: '院士席的设计 section：第 222 次' })
  ok(chairDesign.ok === true, '§4c premise: the chair co-designs it', chairDesign.ok === true ? true : { code: chairDesign.code, message: chairDesign.message })
  const adopted = await call('vibe_v5_blueprint', { action: 'adopt', member: 'r-acad', draft: draftId })
  ok(adopted.ok === true, '§4d premise: the draft becomes current', adopted.ok === true ? true : { code: adopted.code, message: adopted.message })
  const newer = await call('vibe_v5_blueprint', { action: 'propose', materialize: true, member: 'r-2', text: '第 222 次演练：更晚的一份草案' })
  ok(newer.ok === true, '§4e premise: a newer row sits above the current one', newer.ok === true ? true : { code: newer.code, message: newer.message })

  const dry = await call('vibe_vmu_records', { action: 'prune', track: 'blueprint', keep: 1, dryRun: true })
  ok(dry.ok === true, '§4f the positional dry run answers', dry)
  ok(Number(dry.doomedDeclaredCurrentCount) >= 1,
    '§4g ★ the receipt counts the doomed rows that DECLARE current', { c: dry.doomedDeclaredCurrentCount, wouldPrune: dry.wouldPruneCount })
  has(String(dry.doomedDeclaredCurrentMeans), 'WHEN IT WAS WRITTEN',
    '§4h ★★★ …and the sentence says that header line was true WHEN WRITTEN (RUN 224: it now points at inForceIds instead of denying the derivation)', String(dry.doomedDeclaredCurrentMeans))
  // ★★★ RUN 224 (FEEDBACK58 1.1): the in-force revision IS derivable from the rows' own headers — the declared-`current`
  // row carrying the highest `revision` — so the count is a number now, and the run-58/59 contradiction (a fact called
  // history) is answered by data instead of by a sentence about which face owns the ruler.
  ok(Number.isInteger(dry.doomedInForceCount) && dry.doomedInForceCount >= 0,
    '§4i ★★ the in-force count is COMPUTED (NULL only on a track with no revision ruler)', dry.doomedInForceCount)
  ok(Array.isArray(dry.inForceIds) && dry.inForceIds.length === 1 && String(dry.inForceIds[0]) !== String(draftId),
    '§4j the derivation names the CURRENT revision, not the newer draft above it', { inForceIds: dry.inForceIds, draftId })
  has(String(dry.doomedInForceMeans), 'highest `revision`',
    '§4j2 …and the means states the ruler it used', String(dry.doomedInForceMeans))
  const state = await call('vibe_v5_blueprint', { action: 'state' })
  ok(state.ok === true, '§4k premise: the owning face answers', state.ok === true ? true : { code: state.code, message: state.message })
  ok(state.current && String(state.current.id) !== String(draftId),
    '§4l ★★ the row in force is NOT the superseded draft the positional warning named (run 58 measured the two disagreeing)',
    { current: state.current && state.current.id, namedByWarning: dry.doomedDeclaredCurrentIds })
}

console.log('')
if (failed > 0) {
  console.log('TOTAL ' + (passed + failed) + ' checks, FAILED ' + failed + ':')
  for (const f of failures) console.log('  - ' + f)
  process.exitCode = 1
} else {
  console.log('TOTAL ' + passed + ' PASS ' + passed + ' FAIL 0')
}

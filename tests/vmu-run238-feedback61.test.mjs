// tests/vmu-run238-feedback61.test.mjs — RUN 238: seven readings from run 61 (FEEDBACK61 A/B/C/D/E/F/H), each measured
// on the real faces, each fixed where the receipt was silent or said something the next line contradicted.
//
//   A  a DRAFT wrote the canonical md. An unadopted draft therefore REPLACED the document in force, and `prune` (which
//      moves index rows) could not put the old text back: two rows named one file and the file held neither. Now a
//      draft writes NO file — `adopt` is the only writer — and the receipt says so by name (`deferredTo:"adopt"`).
//   B  a same-id card write replaced the body and never named the labelled lines that vanished. The receipt now carries
//      `bodyLinesDropped` / `bodyLinesMeans`.
//   C  the settlement wrote `- p：1` onto a card that already carried `- value：0.95`: two probability lines, no word
//      about which counts. The settlement now names the stale line.
//   D  two outline nodes with the same id were accepted. They are named once now, and the refusal says which entry.
//   E  `rev` is per-kernel, and two kernels reading one workspace can differ without either being wrong — the receipt
//      now says where the number came from (`revSource`).
//   F  the meeting view counted speeches under the name `turns`; `speeches` now says the same number and says that a
//      member TURN is a different thing.
//   H  `vibe_v5_task_create` did not return the revision of the task it just created.
//
// RULE E: every loop / every() is preceded by an explicit NON-EMPTY assertion.
import { mkdtemp, rm } from 'node:fs/promises'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..')
const ENTRY = join(REPO, 'vibe-math-vmu', 'vibe-math-vmu.js')
const BP_SRC = readFileSync(join(REPO, 'vibe-math-vmu', 'packs', 'v5r', 'blueprint.js'), 'utf8')
const REC_SRC = readFileSync(join(REPO, 'vibe-math-vmu', 'kernel', 'records.js'), 'utf8')
const TOOLS_SRC = readFileSync(join(REPO, 'vibe-math-vmu', 'packs', 'v5r', 'tools.js'), 'utf8')
const MEET_SRC = readFileSync(join(REPO, 'vibe-math-vmu', 'kernel', 'meetings.js'), 'utf8')
const TASK_SRC = readFileSync(join(REPO, 'vibe-math-vmu', 'kernel', 'tasks.js'), 'utf8')
const HAND_SRC = readFileSync(join(REPO, 'vibe-math-vmu', 'kit', 'handlers.js'), 'utf8')

let passed = 0
let failed = 0
const failures = []
const ok = (cond, label, detail) => {
  if (cond) { passed++; console.log('  ok   ' + label); return true }
  failed++; failures.push(label)
  console.error('  FAIL ' + label + (detail === undefined ? '' : ' :: ' + JSON.stringify(detail)))
  return false
}
const has = (text, needle, label) => ok(typeof text === 'string' && text.indexOf(needle) !== -1, label, { needle })

const entry = await import(pathToFileURL(ENTRY).href)

const boot = async (root) => {
  const specs = []
  const ctx = {
    effect(fn) { return fn() },
    on() { return () => {} },
    tools: { register: async (spec) => { specs.push(spec); return () => {} } },
  }
  const handle = entry.apply(ctx, { clock: () => 1000, packs: ['v5r'], root })
  await handle.ready()
  const specOf = (name) => specs.find((s) => s && s.name === name) || null
  const call = async (name, args = {}, exec = undefined) => {
    const spec = specOf(name)
    if (!spec) return { ok: false, code: 'NO_SUCH_TOOL', name }
    try {
      const raw = await spec.execute(args, { kernel: handle.kernel, exec })
      return typeof raw === 'string' ? JSON.parse(raw) : raw
    } catch (e) {
      return { ok: false, code: (e && e.code) || null, message: String((e && e.message) || e) }
    }
  }
  return { handle, kernel: handle.kernel, records: handle.kernel.records, specs, specOf, call }
}

// ── §0 the source of each fix exists (a silent revert is red here, not only in behaviour) ───────────────────────────
{
  console.log('=== §0 source: every fix is present, and the draft path is GONE ===')
  has(BP_SRC, 'draftMdDeferred', 'A: the draft absence has a name (draftMdDeferred)')
  has(BP_SRC, "deferredTo: 'adopt'", 'A: the receipt names what WOULD write the document')
  ok(BP_SRC.indexOf('writeBlueprintMd(') >= 0, 'precondition: adoption still writes the file', { hits: BP_SRC.split('writeBlueprintMd(').length - 1 })
  const callSites = BP_SRC.split('= writeBlueprintMd({').length - 1
  ok(callSites === 1, '★★ A: exactly ONE call site writes the md (adoption) — a draft cannot reach the file face', { callSites })
  ok(!/draftMdPathOf|BLUEPRINT_DRAFT_DIR/.test(BP_SRC), 'A: the abandoned "drafts write their own file" shape left no residue')
  ok(/propose[\s\S]{0,4000}?draftMdDeferred\(\{ path: wantedPath \}\)/.test(BP_SRC), 'A: the new-draft path calls the deferral, not the writer')
  has(REC_SRC, 'bodyLinesDropped', 'B: the records receipt can name the labelled lines a replace dropped')
  has(REC_SRC, 'bodyLinesMeans', 'B: and says what that list means')
  has(REC_SRC, 'revSource', 'E: the receipt says which kernel counted the rev')
  has(HAND_SRC, 'bodyLinesDropped', 'B: the seat face now re-states the dropped-line reading instead of dropping it')
  has(TOOLS_SRC, 'staleValueLines', 'C: the settlement names a conflicting `value` line')
  has(BP_SRC, 'repeats an id already used by an earlier entry', 'D: a repeated outline id has its own sentence')
  has(MEET_SRC, 'SPEECHES_MEANS', 'F: the meeting view explains the two names')
  ok(/revision: t\.revision/.test(TASK_SRC), 'H: task create returns the revision of the task it created')
}

const root = await mkdtemp(join('D:/_tmp', 'vmu-run238-'))
try {
  const b = await boot(root)
  const kernel = b.kernel
  await kernel.members.hire({ id: 'r-acad', slot: 'chair' })
  await kernel.members.hire({ id: 'r-1', slot: 'member' })
  ok(kernel.members.roster().length === 2, 'precondition: a chair and a member are on the roster', kernel.members.roster().map((m) => m.id))

  // ── §1 A: a draft writes no file; adoption writes it ─────────────────────────────────────────────────────────────
  console.log('=== A. a draft writes NO file; adoption is the only writer ===')
  const mdAbs = join(root, 'VibeMath', 'Shared', 'Protocol.md')
  const started = await b.call('vibe_v5_start', { problem: '前 n 个奇数之和 = n²。', researcherCount: 1 })
  ok(started && started.ok === true, 'precondition: the round starts (the blueprint seats exist)', started && started.code)
  const T1 = '- 命题：前 n 个奇数之和 = n²。'
  const p1 = await b.call('vibe_v5_blueprint', { action: 'propose', path: 'Shared/Protocol.md', member: 'r-acad', text: T1 })
  ok(p1 && p1.ok === true && p1.status === 'draft', 'A1 a draft is created', p1 && p1.code)
  ok(p1 && p1.md && p1.md.written === false, '★★ A1 the draft writes no file', p1 && p1.md)
  ok(p1 && p1.md && p1.md.deferredTo === 'adopt', 'A1 the receipt says adoption is what writes it', p1 && p1.md && p1.md.deferredTo)
  ok(p1 && p1.md && p1.md.available === false, 'A1 `available:false` is the NAMED absence of a draft write, not "no file face"')
  has(p1 && p1.md && p1.md.means, 'writes no md file', 'A1 and the means says it in words')
  ok(existsSync(mdAbs) === false, '★★ A1 the document in force does not exist yet — the draft could not have touched it')
  const p1row = b.records.get({ id: p1.id, includeBody: true })
  has(p1row && p1row.body, T1, 'A1 the draft text lives in its index row')
  ok(!/- mdPath：\S/.test(String(p1row && p1row.body)), 'A1 an unadopted draft claims no md file')

  const p2 = await b.call('vibe_v5_blueprint', { action: 'propose', path: 'Shared/Protocol.md', member: 'r-1', text: '## 补充｜r-1\n- 复核 n=1。' })
  ok(p2 && p2.ok === true && p2.continued === true, 'A2 a co-design seat joins the same draft', p2 && p2.code)
  ok(p2 && p2.md && p2.md.written === false, 'A2 the continuation writes no file either')
  ok(existsSync(mdAbs) === false, '★★ A2 the in-force document is STILL untouched (this is the defect run 61 measured)')

  const adopted = await b.call('vibe_v5_blueprint', { action: 'adopt', draft: p2.id, member: 'r-acad', path: 'Shared/Protocol.md' })
  ok(adopted && adopted.ok === true && adopted.status === 'current', 'A3 adopt succeeds', adopted && adopted.code)
  ok(existsSync(mdAbs) === true, '★★ A3 adoption is what puts the text on disk')
  const mdText = readFileSync(mdAbs, 'utf8')
  ok(mdText.indexOf('# 蓝图｜Shared/Protocol.md｜r1｜生效') === 0, 'A3 the file in force says r1 and current', mdText.slice(0, 60))
  has(mdText, T1, 'A3 the file carries the adopted text')
  ok(adopted && adopted.mdIsTheDocumentInForce && adopted.mdIsTheDocumentInForce.wroteNow === true,
    'A3 the adopt receipt states the file contract (wroteNow:true)', adopted && adopted.mdIsTheDocumentInForce)
  has(adopted && adopted.mdIsTheDocumentInForce && adopted.mdIsTheDocumentInForce.means, 'ONLY file the blueprint writes',
    'A3 … and that adoption is the ONLY writer')

  // ── §2 B: a replacing write names the labelled lines it dropped ──────────────────────────────────────────────────
  console.log('=== B. a same-id write names the card lines it replaced ===')
  const made = await b.call('vibe_v5_record_proposition', {
    statement: '前 n 个奇数之和 = n²。', value: '0.9', motive: 'RUN 238/B', p: 0.6, member: 'r-1',
    proof_ref: 'Members/r-1/Propos/p1.md',
  })
  ok(made && made.ok === true, 'B0 a proposition card is written', made && made.code)
  const cardId = made.recordId || made.id || (made.record && made.record.id)
  const before = b.records.get({ id: cardId, includeBody: true })
  has(before && before.body, '- proofRef：', 'B0 the card carries a proof pointer line to lose')
  const again = await b.call('vibe_v5_record_proposition', {
    id: cardId, statement: '前 n 个奇数之和 = n²。', value: '0.9', motive: 'RUN 238/B rewrite', p: 0.6, member: 'r-1',
  })
  ok(again && again.ok === true && again.updated === true, 'B1 the same-id write UPDATES the row', again && again.code)
  ok(Array.isArray(again && again.bodyLinesDropped) && again.bodyLinesDropped.length > 0,
    '★★ B1 the receipt names the labelled lines that did not survive', again && again.bodyLinesDropped)
  ok(Array.isArray(again && again.bodyLinesDropped) && again.bodyLinesDropped.indexOf('proofRef') !== -1,
    'B1 … and `proofRef` is one of them (the line run 61 lost silently)', again && again.bodyLinesDropped)
  has(again && again.bodyLinesMeans, 'did NOT survive', 'B1 the means says they are gone, not that nothing happened')

  // ── §3 C: the settlement names a conflicting `value` line ────────────────────────────────────────────────────────
  console.log('=== C. a settlement names a stale `value` line instead of leaving two probabilities ===')
  const moot = await b.call('vibe_v5_meeting', { member: 'r-acad', agenda: ['命题：偶数和为偶数'], title: 'run238 C' })
  const meeting = moot && (typeof moot.meeting === 'string' ? moot.meeting : moot.meeting && moot.meeting.id)
  ok(typeof meeting === 'string' && meeting !== '', 'C0 a meeting is convened', moot && Object.keys(moot || {}))
  // A p=1 settlement is only admitted when the meeting it cites VOTED (RUN 204: floor first, then votes) — so this
  // section does the real thing a debate does: three seats attend, a motion is moved+seconded, all three vote.
  for (const seat of ['r-1', 'r-2']) await b.kernel.members.hire({ id: seat, slot: 'member' })
  for (const seat of ['r-acad', 'r-1', 'r-2']) await b.kernel.meetings.attend({ meeting, member: seat })
  const moved = await b.kernel.meetings.motion({ meeting, member: 'r-acad', text: '偶数和为偶数' })
  const motionId = moved && (typeof moved === 'string' ? moved : (moved.motion || moved.id))
  await b.kernel.meetings.second({ meeting, motion: motionId, member: 'r-1' })
  for (const seat of ['r-acad', 'r-1', 'r-2']) await b.kernel.meetings.vote({ meeting, motion: motionId, member: seat, value: 1 })
  const cardId2 = 'p-c238'
  const seededC = b.records.put({
    id: cardId2, track: 'state', kind: 'proposition', title: 'C 卡',
    body: '- statement：偶数和为偶数' + String.fromCharCode(10) + '- value：0.95' + String.fromCharCode(10) + '- motive：RUN 238/C',
    by: 'r-1',
  })
  ok(seededC && seededC.id === cardId2, 'C0 a card carrying `- value：0.95` exists with no `p` line', { rows: Object.keys(seededC || {}) })
  // The settlement path is the one a debate uses: p + debate_ruling on an EXISTING card (rule L53 patches p, not the card).
  const settlementCall = await b.call('vibe_v5_record_proposition', {
    id: cardId2, statement: '偶数和为偶数', value: '0.95', motive: 'RUN 238/C', p: 1, member: 'r-1',
    debate_ruling: { value: 1, mode: 'unanimous', n: 3, decided: true, meeting, by: 'r-acad' },
  })
  ok(settlementCall && settlementCall.ok === true, 'C1 the ruling settlement is admitted on the existing card', settlementCall && (settlementCall.code || settlementCall.message))
  const st = settlementCall && settlementCall.settlement
  ok(st && Array.isArray(st.staleValueLines) && st.staleValueLines.length === 1, '★★ C1 the settlement names ONE stale value line', st && st.staleValueLines)
  ok(st && st.staleValueLines[0] === '0.95', 'C1 … the number a reader would otherwise take for the result', st && st.staleValueLines)
  has(st && st.staleValueLinesMeans, 'p', 'C1 the means says which number counts')

  // ── §4 D: a repeated outline id is refused by name ───────────────────────────────────────────────────────────────
  console.log('=== D. two outline nodes may not share an id ===')
  const dup = await b.call('vibe_v5_blueprint', {
    action: 'propose', path: 'Shared/Protocol.md', member: 'r-acad',
    text: '- r2：分层。', outline: [{ id: '1', title: '粗', depth: 1 }, { id: '1', title: '细', depth: 2 }],
  })
  ok(dup && dup.ok === false && dup.code === 'VMU_INVALID_ARGUMENT', '★★ D1 a repeated outline id is refused', dup && dup.code)
  has(dup && dup.message, 'repeats an id', 'D1 the refusal says WHICH rule it broke')
  const okOutline = await b.call('vibe_v5_blueprint', {
    action: 'propose', path: 'Shared/Protocol.md', member: 'r-acad',
    text: '- r2：分层。', outline: [{ id: '1', title: '粗', depth: 1 }, { id: '1.1', title: '细', depth: 2 }],
  })
  ok(okOutline && okOutline.ok === true && okOutline.outlineCount === 2, 'D2 distinct ids still pass (the fix is not a ban on outlines)', okOutline && okOutline.code)

  // ── §5 E: rev says which kernel counted it ───────────────────────────────────────────────────────────────────────
  console.log('=== E. rev names the kernel that counted it ===')
  const seeded = b.records.put({ id: 'e-238', track: 'state', kind: 'proposition', title: 'E 卡', body: '- a：1', by: 'r-1' })
  const updated = b.records.put({ id: 'e-238', track: 'state', kind: 'proposition', title: 'E 卡', body: '- a：2', by: 'r-1' })
  ok(updated && updated.updated === true && updated.rev >= 2, 'E0 the row really was updated', { rev: updated && updated.rev, seeded: seeded && seeded.rev })
  ok(updated && updated.revSource === 'this-kernel', '★★ E1 the receipt says the rev is this kernel\'s count', updated && updated.revSource)
  has(updated && updated.revMeans, 'fingerprint', 'E1 the means says what to compare across kernels instead')

  // ── §6 F: the meeting counts speeches under a name that says so ──────────────────────────────────────────────────
  console.log('=== F. a speech count is called speeches ===')
  const sp = await b.call('vibe_vmu_meeting', { action: 'speak', id: meeting, member: 'r-acad', text: '主席开场' })
  ok(sp && sp.ok === true, 'F0 a speech is accepted', sp && sp.code)
  const mv = await b.call('vibe_vmu_meeting', { action: 'status', id: meeting })
  ok(mv && mv.ok === true, 'F1 the meeting status is readable', mv && mv.code)
  ok(mv && mv.speeches === mv.turns, '★★ F1 `speeches` is the old `turns` number under its true name', { speeches: mv && mv.speeches, turns: mv && mv.turns })
  ok(mv && typeof mv.speeches === 'number' && mv.speeches >= 1, 'F1 … and it counts the accepted speech', mv && mv.speeches)
  has(mv && mv.speechesMeans, 'member TURN is a different thing', 'F1 the means keeps the two words apart')

  // ── §7 H: a new task reports its revision ────────────────────────────────────────────────────────────────────────
  console.log('=== H. task_create returns the revision it created ===')
  const task = await b.call('vibe_v5_task_create', { subject: 'RUN 238/H: 记住 revision', write_scopes: ['VibeMath/Members/r-1/'] })
  const taskRow = task && task.task ? task.task : task
  ok(task && task.ok === true && taskRow && taskRow.id, 'H0 a task is created', task && (task.code || task.message))
  ok(taskRow && taskRow.revision === 1, '★★ H1 the create receipt carries the revision (no second read needed)', taskRow && taskRow.revision)
} finally {
  await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 })
}

console.log('\n=== RUN 238 (FEEDBACK61 A/B/C/D/E/F/H): ' + passed + ' passed, ' + failed + ' failed ===')
if (failed > 0) {
  console.log('failures:')
  for (const f of failures) console.log('  - ' + f)
  process.exit(1)
}

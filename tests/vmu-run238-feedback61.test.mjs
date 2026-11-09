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
const hasNot = (text, needle, label) => ok(!(typeof text === 'string' && text.indexOf(needle) !== -1), label, { needle })

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
  // ★★★ RUN 248-M2 修 pin：§0 原先把 RUN 238 的「草案延后给 adopt」钉在源码里（`draftMdDeferred` + `deferredTo:'adopt'`）。
  // 用户 2026-11-06 的裁定把它反转了（草案必须落盘）。同一件事 —「草案与生效文件的写入责任在源码里显式、可 grep」—
  // 现在由下面的名字证明：草案写者 `writeBlueprintMd` 出现在三条具名车道里，而「延后」的旧形状彻底不存在。
  hasNot(BP_SRC, 'draftMdDeferred', 'A: the draft no longer defers its write to adopt (RUN 248 made the draft a file)')
  hasNot(BP_SRC, 'deferredTo', 'A: no receipt field still claims the write is deferred')
  has(BP_SRC, "'kernel-materialized'", 'A: the receipt names the kernel as the writer of a materialized draft')
  ok(BP_SRC.indexOf('writeBlueprintMd(') >= 0, 'precondition: a draft writer exists at all', { hits: BP_SRC.split('writeBlueprintMd(').length - 1 })
  // 三条车道 = 新草案 / 共同设计续写 / adopt 晋升。多出第四条就是又一个沉默的写者，少一条就是有一版写不进文件。
  const callSites = BP_SRC.split('= writeBlueprintMd({').length - 1
  ok(callSites === 3, '★★ A: exactly THREE call sites write the md, one per named lane (new draft / continuation / adopt)', { callSites })
  ok(BP_SRC.split(', path: draftPath,').length - 1 === 2, '★★ A: the two DRAFT lanes write through draftPath, not the canonical path', { draftLanes: BP_SRC.split(', path: draftPath,').length - 1 })
  ok(/blueprintDraftMdPathOf|BLUEPRINT_DRAFT_DIR/.test(BP_SRC), 'A: the per-revision draft-file path shape is declared (drafts own their file)')
  ok(/propose[\s\S]{0,9000}?writeBlueprintMd\(\{[\s\S]{0,80}?path: draftPath/.test(BP_SRC), 'A: the new-draft path writes the draft md before indexing the row')
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

  // ── §1 A: a draft writes its OWN file; adoption promotes those bytes to the canonical path ──────────────────────
  console.log('=== A. a draft writes its OWN md; adoption promotes it to the canonical path ===')
  const mdAbs = join(root, 'VibeMath', 'Shared', 'Protocol.md')
  const draftAbs = join(root, 'VibeMath', 'Shared', 'Drafts', 'Protocol-r1.md')
  const DRAFT1 = 'Shared/Drafts/Protocol-r1.md'
  const started = await b.call('vibe_v5_start', { problem: '前 n 个奇数之和 = n²。', researcherCount: 1 })
  ok(started && started.ok === true, 'precondition: the round starts (the blueprint seats exist)', started && started.code)
  const T1 = '- 命题：前 n 个奇数之和 = n²。'
  // legacy path: kernel-materialized only when materialize:true is explicit (RUN 255 default flipped to fs-first)
  const p1 = await b.call('vibe_v5_blueprint', { action: 'propose', path: 'Shared/Protocol.md', member: 'r-acad', text: T1, materialize: true })
  ok(p1 && p1.ok === true && p1.status === 'draft', 'A1 a draft is created', p1 && p1.code)
  ok(p1 && p1.md && p1.md.written === true, '★★ A1 the draft WRITES its own file (RUN 248 reversed RUN 238 here)', p1 && p1.md)
  ok(p1 && p1.md && p1.md.writtenBy === 'kernel-materialized' && p1.md.mdPath === DRAFT1, 'A1 the receipt names who wrote it and where', p1 && p1.md)
  ok(p1 && p1.draftMdPath === DRAFT1 && p1.mdWritten === true, 'A1 the published draft reading says the same (draftMdPath + mdWritten)', p1 && { draftMdPath: p1.draftMdPath, mdWritten: p1.mdWritten })
  ok(p1 && p1.md && p1.md.available === true, 'A1 `available:true` is the NAMED presence of the draft write (not "no file face")')
  has(p1 && p1.md && p1.md.means, 'sha256', 'A1 and the means says the row indexes the sha256 of the bytes on disk')
  ok(existsSync(draftAbs) === true, '★★ A1 the draft md exists at the per-revision path', { abs: draftAbs })
  ok(existsSync(mdAbs) === false, '★★ A1 the document in force does not exist yet — a draft could not have touched it')
  const p1row = b.records.get({ id: p1.id, includeBody: true })
  has(p1row && p1row.body, T1, 'A1 the draft text lives in its index row')
  has(p1row && p1row.body, '- mdPath：' + DRAFT1, 'A1 an unadopted draft CLAIMS its own draft file')

  // legacy path: the continuation rewrites the kernel-materialized draft only when materialize:true is explicit
  const p2 = await b.call('vibe_v5_blueprint', { action: 'propose', path: 'Shared/Protocol.md', member: 'r-1', text: '## 补充｜r-1\n- 复核 n=1。', materialize: true })
  ok(p2 && p2.ok === true && p2.continued === true, 'A2 a co-design seat joins the same draft', p2 && p2.code)
  ok(p2 && p2.md && p2.md.written === true && p2.md.mdPath === DRAFT1, 'A2 the continuation REWRITES that same draft file (one draft = one md)')
  ok(existsSync(mdAbs) === false, '★★ A2 the in-force document is STILL untouched (the defect run 61 measured stays fixed)')

  const adopted = await b.call('vibe_v5_blueprint', { action: 'adopt', draft: p2.id, member: 'r-acad', path: 'Shared/Protocol.md' })
  ok(adopted && adopted.ok === true && adopted.status === 'current', 'A3 adopt succeeds', adopted && adopted.code)
  ok(existsSync(mdAbs) === true, '★★ A3 adoption is what puts the text on disk')
  const mdText = readFileSync(mdAbs, 'utf8')
  ok(mdText.indexOf('# 蓝图｜Shared/Protocol.md｜r1｜生效') === 0, 'A3 the file in force says r1 and current', mdText.slice(0, 60))
  has(mdText, T1, 'A3 the file carries the adopted text')
  ok(adopted && adopted.mdIsTheDocumentInForce && adopted.mdIsTheDocumentInForce.wroteNow === true,
    'A3 the adopt receipt states the file contract (wroteNow:true)', adopted && adopted.mdIsTheDocumentInForce)
  has(adopted && adopted.mdIsTheDocumentInForce && adopted.mdIsTheDocumentInForce.means, 'ONE file that counts',
    'A3 … and that ONE canonical file counts (the draft files do not)')
  ok(adopted && adopted.copiedFrom === DRAFT1 && adopted.alreadyWritten === false,
    'A3 … and it names the DRAFT file whose bytes were promoted here', { copiedFrom: adopted && adopted.copiedFrom })

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
  // ★★★ RUN 239 (FEEDBACK62 #2): a report AFTER the destruction is an epitaph. The write that would delete a
  // settlement-bearing line is now REFUSED by name, and the two honest ways forward are named in the refusal:
  // `bodyMode:"merge"` (what this write names wins, every other line survives) or `confirmDestructive:true`.
  ok(again && again.ok === false && again.code === 'VMU_RECORD_DESTRUCTIVE_WRITE',
    '★★ B1 a replace that would delete a settlement line is REFUSED by name', again && again.code)
  has(again && again.message, 'proofRef', 'B1 the refusal names the line that would be deleted')
  has(again && again.hint, 'merge', 'B1 … and names bodyMode:"merge" as the reachable repair')
  has(again && again.hint, 'confirmDestructive', 'B1 … and names confirmDestructive:true as the deliberate path')
  const untouched = b.records.get({ id: cardId, includeBody: true })
  has(untouched && untouched.body, '- proofRef：', 'B1 the refused write changed NOTHING: the pointer line is still there')
  ok(untouched && untouched.rev === before.rev, 'B1 … and the revision did not move', { before: before.rev, after: untouched && untouched.rev })
  const merged = await b.call('vibe_v5_record_proposition', {
    id: cardId, statement: '前 n 个奇数之和 = n²。', value: '0.9', motive: 'RUN 238/B merged', p: 0.6, member: 'r-1',
    bodyMode: 'merge',
  })
  ok(merged && merged.ok === true && merged.updated === true, '★★ B1 bodyMode:"merge" is admitted and UPDATES the row', merged && merged.code)
  ok(Array.isArray(merged && merged.bodyLinesDropped) && merged.bodyLinesDropped.length === 0,
    'B1 … and reports NO dropped line (nothing was lost)', merged && merged.bodyLinesDropped)
  const mergedRow = b.records.get({ id: cardId, includeBody: true })
  has(mergedRow && mergedRow.body, '- proofRef：', 'B1 … the pointer line SURVIVED the correction')
  has(mergedRow && mergedRow.body, 'RUN 238/B merged', 'B1 … and the named line was the one that changed')
  const forced = await b.call('vibe_v5_record_proposition', {
    id: cardId, statement: '前 n 个奇数之和 = n²。', value: '0.9', motive: 'RUN 238/B forced', p: 0.6, member: 'r-1',
    confirmDestructive: true,
  })
  ok(forced && forced.ok === true, 'B1 confirmDestructive:true still allows the deletion when it IS the intent', forced && forced.code)
  ok(Array.isArray(forced && forced.bodyLinesDropped) && forced.bodyLinesDropped.indexOf('proofRef') !== -1,
    'B1 … and the receipt still names what it deleted (reported, not silent)', forced && forced.bodyLinesDropped)
  has(forced && forced.bodyLinesMeans, 'did NOT survive', 'B1 the means says they are gone, not that nothing happened')

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
  // legacy path: kernel-materialized only when materialize:true is explicit (RUN 255 default flipped to fs-first)
  const okOutline = await b.call('vibe_v5_blueprint', {
    action: 'propose', path: 'Shared/Protocol.md', member: 'r-acad',
    text: '- r2：分层。', outline: [{ id: '1', title: '粗', depth: 1 }, { id: '1.1', title: '细', depth: 2 }], materialize: true,
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

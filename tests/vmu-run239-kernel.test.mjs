// tests/vmu-run239-kernel.test.mjs — RUN 239, the kernel half: three readings run 62 measured on the ledger and on the
// turn, each fixed where the fact existed but the shape lied about it.
//
//   §1 OWNER IS NOT THE WRITER. `- owner` was not a field: the view derived it from `by`, so a chair correcting one line
//      of r-1's card made the card r-acad's, and the receipt counted that under `fieldsReplaced`. Now an update keeps
//      the owner it found unless it names one; the view reports `owner` and `writer` separately.
//   §2 A REPLACE THAT DELETES A SETTLEMENT LINE IS REFUSED, NOT NARRATED. run 62 lost `debateRuling` / `p1Evidence` /
//      `proofRef` from a settled card and read `bodyLinesDropped` afterwards; a receipt after the destruction is an
//      epitaph. `bodyMode:"merge"` keeps every line the write does not name, and `confirmDestructive:true` still allows
//      the deletion when deleting IS the intent (and still reports it).
//   §3 ONE TURN OF PROGRESS IS ONE ROW, WHATEVER THE WORDING. The dedupe key was the title, so a tool-written progress
//      line and a reply-written progress line for the same act became two rows 2 ms apart. On the `progress` track the
//      key is (member, this turn).
//   §4 THE MEETING FRAME CARRIES THE MEETING'S OWN TYPE AND AGENDA. The frame printed the corpus string
//      `议程：分工与下一步（类型：ordinary）` for every meeting; the type and agenda are now per-turn FACTS read from the
//      meeting face.
//
// RULE E: every loop / every() is preceded by an explicit NON-EMPTY assertion.
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..')
const ENTRY = join(REPO, 'vibe-math-vmu', 'vibe-math-vmu.js')
const RECORDS = join(REPO, 'vibe-math-vmu', 'kernel', 'records.js')
const TURN = join(REPO, 'vibe-math-vmu', 'kernel', 'turn', 'index.js')
const HANDLERS = join(REPO, 'vibe-math-vmu', 'kit', 'handlers.js')

let passed = 0
let failed = 0
const failures = []
const ok = (cond, label, detail) => {
  if (cond) { passed += 1; console.log('  ok   ' + label); return true }
  failed += 1
  failures.push(label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  console.error('  FAIL ' + label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  return false
}

const entry = await import(pathToFileURL(ENTRY).href)
const recSource = await readFile(RECORDS, 'utf8')
const turnSource = await readFile(TURN, 'utf8')
const handSource = await readFile(HANDLERS, 'utf8')

const roots = []
const mkRoot = async () => { const d = await mkdtemp(join(tmpdir(), 'vmu-r239k-')); roots.push(d); return d }

const boot = async (root, clock = () => 1000, extra = {}) => {
  const state = { specs: [] }
  const ctx = {
    effect (fn) { return fn() },
    on () { return () => {} },
    tools: { register: async (spec) => { state.specs.push(spec); return () => {} } },
  }
  const handle = entry.apply(ctx, Object.assign({ clock, packs: ['v5r'], root, deliverMode: 'caller' }, extra))
  await handle.ready()
  await handle.kernel.store.open()
  const call = async (name, args = {}, { as = null } = {}) => {
    const spec = state.specs.filter((s) => s && s.name === name)[0] || null
    if (!spec) return { ok: false, tool: name, code: 'NO_SUCH_TOOL' }
    const exec = as === null ? { kernel: handle.kernel } : { kernel: handle.kernel, agent: as.agent }
    try {
      const raw = await spec.execute(args, exec)
      return typeof raw === 'string' ? JSON.parse(raw) : raw
    } catch (e) {
      return { ok: false, code: (e && e.code) || null, message: String((e && e.message) || e) }
    }
  }
  return { handle, K: handle.kernel, specs: state.specs, call }
}

const NL = String.fromCharCode(10)
const fence = (obj) => ['```json', JSON.stringify(obj), '```'].join(NL)
const receiptOf = (res) => (res && res.receipt) || res || {}
const rowsOf = (res, key) => {
  const receipt = receiptOf(res)
  const detail = receipt[key + 'Detail']
  if (Array.isArray(detail)) return detail
  const list = receipt[key]
  return Array.isArray(list) ? list : []
}
const frameTextOf = (step) => (step && step.memberPrompt && typeof step.memberPrompt.text === 'string' ? step.memberPrompt.text : null)
const specOf = (b, name) => b.specs.find((s) => s && s.name === name) || null

try {
  // ── §0 SOURCE READINGS ────────────────────────────────────────────────────────────────────────────────────────
  {
    console.log('§0 each repair exists in the source as a named shape')
    ok(recSource.includes("const BODY_MODES = Object.freeze(['replace', 'append', 'merge'])"), '§0a the kernel declares the merge body mode')
    ok(recSource.includes('const mergeCardText = '), '§0b and has the line-labelled merge it promises')
    ok(recSource.includes("const SETTLEMENT_LINES = Object.freeze(['debateRuling', 'p1Evidence', 'proofRef'])"),
      '§0c the settlement-bearing lines are named in one place')
    ok(recSource.includes('VMU_RECORD_DESTRUCTIVE_WRITE'), '§0d a destructive replace is refused by a registered name')
    ok(recSource.includes('const mergedOwner = updating'), '§0e ownership is its own field, not a copy of the writer')
    ok(handSource.includes('bodyMode: has(args.bodyMode) ? str(args.bodyMode) : undefined'),
      '§0f the kit layer forwards the body mode it was given (a dropped argument is a silent replace)')
    ok(turnSource.includes("const onePerTurn = String(payload.track) === 'progress'"),
      '§0g the turn dedupe is track-aware: one progress row per turn')
    ok(turnSource.includes("'vmu.turn.meetingType'"), '§0h the turn supplies the meeting TYPE as a fact')
    ok(turnSource.includes("'vmu.turn.meetingAgenda'"), '§0h2 and the meeting AGENDA as a fact')
  }

  // ── §1 OWNER IS NOT THE WRITER ───────────────────────────────────────────────────────────────────────────────
  {
    console.log('§1 a correction by another seat does not move the card to that seat')
    const b = await boot(await mkRoot())
    const created = b.K.records.put({
      id: 'c-owner', track: 'state', kind: 'proposition', title: 'owner probe',
      body: '- statement：偶数和为偶数' + NL + '- value：0.9' + NL + '- motive：RUN 239 owner',
      by: 'r-1',
    })
    ok(created && created.ok !== false, '§1a the card is written', created && created.code)
    const first = b.K.records.get({ id: 'c-owner' })
    ok(first && String(first.owner) === 'r-1', '§1b its owner is the member it was written for', first && first.owner)
    ok(first && String(first.writer) === 'r-1', '§1c and the writer of this revision is the same seat')
    const corrected = b.K.records.put({
      id: 'c-owner', track: 'state', kind: 'proposition', title: 'owner probe',
      body: '- statement：偶数和为偶数' + NL + '- value：0.95' + NL + '- motive：RUN 239 owner (chair correction)',
      by: 'r-acad',
    })
    ok(corrected && corrected.ok !== false, '§1d the chair corrects one line', corrected && corrected.code)
    const afterChair = b.K.records.get({ id: 'c-owner' })
    ok(afterChair && String(afterChair.owner) === 'r-1', '§1e ★ the OWNER did not move to the corrector', afterChair && afterChair.owner)
    ok(afterChair && String(afterChair.writer) === 'r-acad', '§1f … the WRITER is the corrector, and says so', afterChair && afterChair.writer)
    ok(Array.isArray(corrected && corrected.fieldsReplaced) && corrected.fieldsReplaced.indexOf('owner') === -1,
      '§1g the receipt does NOT count `owner` as a replaced field (the writer may change; the owner is not the writer)',
      corrected && corrected.fieldsReplaced)
    const reassigned = b.K.records.put({
      id: 'c-owner', track: 'state', kind: 'proposition', title: 'owner probe',
      body: '- statement：偶数和为偶数' + NL + '- value：0.95' + NL + '- motive：RUN 239 owner (handover)',
      by: 'r-acad', owner: 'r-2',
    })
    ok(reassigned && reassigned.ok !== false, '§1h an EXPLICIT owner is admitted', reassigned && reassigned.code)
    const afterHandover = b.K.records.get({ id: 'c-owner' })
    ok(afterHandover && String(afterHandover.owner) === 'r-2', '§1i ★ a named owner DOES move it (handover is a fact, not a side effect)',
      afterHandover && afterHandover.owner)
    const changed = reassigned && Array.isArray(reassigned.fieldsReplaced) ? reassigned.fieldsReplaced : []
    ok(changed.indexOf('owner') !== -1, '§1j … and the receipt names `owner` among the replaced fields', changed)
  }

  // ── §2 A DESTRUCTIVE REPLACE IS REFUSED, AND MERGE IS THE REACHABLE REPAIR ───────────────────────────────────
  {
    console.log('§2 a write that would delete a settlement line is refused before it happens')
    const b = await boot(await mkRoot())
    const settled = b.K.records.put({
      id: 'c-settled', track: 'state', kind: 'proposition', title: 'settled probe',
      body: [
        '- statement：前 n 个奇数之和 = n²',
        '- value：1',
        '- p：1',
        '- debateRuling：{"value":1,"mode":"unanimous"}',
        '- p1Evidence：debate-unanimous',
        '- proofRef：Members/r-1/Propros/p1.md',
      ].join(NL),
      settled: true, by: 'r-1',
    })
    ok(settled && settled.ok !== false, '§2a a settled card is written', settled && settled.code)
    const before = b.K.records.get({ id: 'c-settled', includeBody: true })
    ok(before && typeof before.body === 'string' && before.body.includes('- debateRuling：'),
      '§2b the card carries a debateRuling line to lose', before && before.body)
    let refusal = null
    try {
      b.K.records.put({
        id: 'c-settled', track: 'state', kind: 'proposition', title: 'settled probe',
        body: '- statement：前 n 个奇数之和 = n²' + NL + '- value：0.95' + NL + '- motive：RUN 239 destruct', by: 'r-acad',
      })
    } catch (e) { refusal = e }
    ok(refusal && refusal.code === 'VMU_RECORD_DESTRUCTIVE_WRITE', '§2c ★ the replace that would delete it is REFUSED by name',
      refusal && refusal.code)
    ok(refusal && String(refusal.message).includes('debateRuling'), '§2d the refusal names the line it would have deleted',
      refusal && refusal.message)
    ok(refusal && String(refusal.hint).includes('merge') && String(refusal.hint).includes('confirmDestructive'),
      '§2e and names both honest routes out', refusal && refusal.hint)
    const stillThere = b.K.records.get({ id: 'c-settled', includeBody: true })
    ok(stillThere && stillThere.body.includes('- debateRuling：'), '§2f ★ the refused write changed NOTHING',
      stillThere && stillThere.body)
    ok(stillThere && Number(stillThere.rev) === Number(before.rev), '§2g … not even the revision',
      { before: before && before.rev, after: stillThere && stillThere.rev })
    const merged = b.K.records.put({
      id: 'c-settled', track: 'state', kind: 'proposition', title: 'settled probe',
      body: '- statement：前 n 个奇数之和 = n²' + NL + '- value：0.95' + NL + '- motive：RUN 239 merge',
      by: 'r-acad', bodyMode: 'merge',
    })
    ok(merged && merged.ok !== false && merged.updated === true, '§2h bodyMode:"merge" is admitted', merged && merged.code)
    ok(Array.isArray(merged && merged.bodyLinesDropped) && merged.bodyLinesDropped.length === 0,
      '§2i … and reports that nothing was dropped', merged && merged.bodyLinesDropped)
    const afterMerge = b.K.records.get({ id: 'c-settled', includeBody: true })
    ok(afterMerge && afterMerge.body.includes('- debateRuling：'), '§2j ★ the settlement line survived the correction',
      afterMerge && afterMerge.body)
    ok(afterMerge && afterMerge.body.includes('- value：0.95'), '§2k … and the line the write DID name was the one that changed',
      afterMerge && afterMerge.body)
    ok(afterMerge && afterMerge.body.includes('- proofRef：'), '§2l … and so did the proof pointer')
    const forced = b.K.records.put({
      id: 'c-settled', track: 'state', kind: 'proposition', title: 'settled probe',
      body: '- statement：前 n 个奇数之和 = n²' + NL + '- value：0.9' + NL + '- motive：RUN 239 forced', by: 'r-acad',
      confirmDestructive: true,
    })
    ok(forced && forced.ok !== false, '§2m confirmDestructive:true still allows the deletion when it IS the intent',
      forced && forced.code)
    ok(Array.isArray(forced && forced.bodyLinesDropped) && forced.bodyLinesDropped.indexOf('debateRuling') !== -1,
      '§2n … and still reports what it deleted (reported, never silent)', forced && forced.bodyLinesDropped)
  }

  // ── §3 THE PACK FACE FORWARDS THE CHOICE (a schema that accepts and a layer that drops is still a replace) ───
  {
    console.log('§3 the tool face reaches the kernel with the body mode the caller asked for')
    const b = await boot(await mkRoot())
    const created = await b.call('vibe_v5_record_proposition', {
      statement: '前 n 个奇数之和 = n²。', value: '0.9', motive: 'RUN 239 tools', p: 0.9, member: 'r-1',
      proof_ref: 'Members/r-1/Propos/p1.md',
    })
    ok(created && created.ok === true, '§3a a card with a proof pointer exists', created && created.code)
    const cardId = created && (created.recordId || created.id)
    ok(typeof cardId === 'string' && cardId !== '', '§3b the receipt names the card', cardId)
    const before = b.K.records.get({ id: cardId, includeBody: true })
    ok(before && String(before.body).includes('- proofRef：'), '§3c the card really carries the pointer line the next write drops',
      before && before.body)
    const refused = await b.call('vibe_v5_record_proposition', {
      id: cardId, statement: '前 n 个奇数之和 = n²。', value: '0.95', motive: 'RUN 239 tools replace', p: 0.95, member: 'r-acad',
    })
    ok(refused && refused.ok === false && refused.code === 'VMU_RECORD_DESTRUCTIVE_WRITE',
      '§3d ★ the tool face reaches the kernel gate (a dropped argument would have made this a silent replace)',
      refused && refused.code)
    const merged = await b.call('vibe_v5_record_proposition', {
      id: cardId, statement: '前 n 个奇数之和 = n²。', value: '0.95', motive: 'RUN 239 tools merge', p: 0.95, member: 'r-acad',
      bodyMode: 'merge',
    })
    ok(merged && merged.ok === true, '§3e bodyMode:"merge" through the tool face is admitted', merged && merged.code)
    ok(Array.isArray(merged && merged.bodyLinesDropped) && merged.bodyLinesDropped.length === 0,
      '§3f … and the tool receipt carries the drop reading', merged && merged.bodyLinesDropped)
    const row = b.K.records.get({ id: cardId, includeBody: true })
    ok(row && row.body.includes('- proofRef：'), '§3g … the pointer line is still on the card', row && row.body)
  }

  // ── §4 ONE TURN OF PROGRESS IS ONE ROW, WHATEVER THE WORDING ────────────────────────────────────────────────
  {
    console.log('§4 the second progress write of a turn is skipped by name even when its wording differs')
    const b = await boot(await mkRoot())
    await b.K.members.hire({ id: 'r-1', slot: 'member' })
    const opened = await b.K.turn.step({ members: ['r-1'], phase: 'normal', why: 'run239 dedupe probe' })
    ok(opened && opened.awaiting === true, '§4a a member turn opens', opened && opened.ok)
    const progressSpec = specOf(b, 'vibe_v5_record_progress')
    ok(progressSpec !== null, '§4b the progress face is registered on this boot')
    const raw = await progressSpec.execute(
      { member: 'r-1', track: 'progress', content: '工具面先写的一行：把差分写成望远镜和。' },
      { kernel: b.K },
    )
    const toolReceipt = typeof raw === 'string' ? JSON.parse(raw) : raw
    ok(toolReceipt && toolReceipt.ok === true && typeof toolReceipt.recordId === 'string',
      '§4c the tool door wrote the row and named it', toolReceipt && toolReceipt.recordId)
    const toolRowId = toolReceipt.recordId
    const reply = await b.K.turn.supplyMemberReply(fence({
      say: '同一件事又用回复字段写了一遍（措辞不同）',
      progress: '回复面写的是另一句话：下一步给出偶数项和的闭式。',
    }), 'r-1')
    ok(reply === undefined || reply === null || reply.ok !== false, '§4d the reply is accepted for the turn')
    const done = await b.K.turn.step({ members: ['r-1'], phase: 'normal', why: 'run239 dedupe apply' })
    const receipt = receiptOf(done)
    ok(done && done.ok === true && receipt.ok !== false, '§4e the turn survives the second progress write')
    const executedFields = rowsOf(done, 'executedDetail').map((e) => e && e.field)
    ok(executedFields.includes('progress') === false, '§4f ★ the differently-worded second write was NOT dispatched', executedFields)
    const skipped = rowsOf(done, 'skippedDetail').filter((s) => s && s.field === 'progress')
    ok(skipped.length === 1, '§4g the receipt names the skipped progress field', rowsOf(done, 'skippedDetail').map((s) => s && s.field))
    ok(skipped[0] && skipped[0].reason === 'already-written-this-turn', '§4h with the reason that says what it is',
      skipped[0] && skipped[0].reason)
    ok(skipped[0] && String(skipped[0].existingId) === String(toolRowId),
      '§4i ★ … and cites the row that already carries it (the wording is not the key)', skipped[0] && skipped[0].existingId)
    const progressRows = b.K.records.list({ track: 'progress', limit: 0 }).items.filter((r) => String(r.owner) === 'r-1')
    ok(progressRows.length === 1, '§4j ★ the ledger holds ONE progress row for this member this turn',
      progressRows.map((r) => r.id))
  }

  // ── §5 THE MEETING FRAME CARRIES THE MEETING'S OWN TYPE AND AGENDA ──────────────────────────────────────────
  {
    console.log('§5 the meeting frame prints the bound meeting type, chair and agenda as facts')
    const b = await boot(await mkRoot())
    const started = await b.call('vibe_v5_start', { problem: 'run239 meeting frame probe', researcherCount: 2 })
    ok(started && started.ok === true, '§5a0 the institute starts (the chair seat exists at all)', started && started.code)
    await b.K.turn.step({ members: ['r-acad'], phase: 'normal', why: 'run239 meeting probe (chair turn)' })
    const opened = await b.call('vibe_v5_meeting', {
      member: 'r-acad', agenda: ['确认命题：偶数和为偶数', '指定复核人'], title: 'run239 会议',
    })
    ok(opened && opened.ok === true, '§5a a real meeting is opened', opened && opened.code)
    const meetingId = opened && (typeof opened.meeting === 'string' ? opened.meeting : opened.meeting && opened.meeting.id)
    ok(typeof meetingId === 'string' && meetingId !== '', '§5b the receipt names the meeting', meetingId)
    const summary = b.K.meetings.summary({ meeting: meetingId })
    ok(summary && summary.ok === true, '§5c the meeting face can be read back')
    const bound = await b.K.turn.step({ members: ['r-1'], phase: 'meeting', why: 'run239 meeting frame', meeting: meetingId })
    ok(bound && bound.awaiting === true, '§5d a member turn opens bound to that meeting')
    const frame = frameTextOf(bound)
    ok(typeof frame === 'string' && frame.length > 0, '§5e the frame is assembled')
    ok(typeof frame === 'string' && frame.includes(meetingId), '§5f ★ the frame names the bound meeting id', frame)
    ok(typeof frame === 'string' && frame.includes(String(summary.type)),
      '§5g ★ … and the meeting REAL type, read from the meeting (not a corpus default)', { type: summary.type, frame })
    ok(typeof frame === 'string' && frame.includes('确认命题'), '§5h ★ … and its real agenda line', frame)
    ok(typeof frame === 'string' && frame.includes('ordinary') === false || String(summary.type) === 'ordinary',
      '§5i the corpus placeholder type is gone from the frame', frame)
  }
  // ── §6 A WAITER IS WOKEN BY THE EVENT, NOT POLLED FOR ────────────────────────────────────────────────────────
  {
    console.log('§6 a member can wait on a meeting event and is woken by it (RUN 239-D, the user requirement)')
    const b = await boot(await mkRoot())
    const started = await b.call('vibe_v5_start', { problem: 'run239 waiter probe', researcherCount: 2 })
    ok(started && started.ok === true, '§6a0 the institute starts', started && started.code)
    await b.K.turn.step({ members: ['r-acad'], phase: 'normal', why: 'run239 waiter probe (chair turn)' })
    const opened = await b.call('vibe_v5_meeting', { member: 'r-acad', agenda: ['确认命题'], title: 'run239 waiter 会议' })
    const mid = opened && (typeof opened.meeting === 'string' ? opened.meeting : opened.meeting && opened.meeting.id)
    ok(typeof mid === 'string' && mid !== '', '§6a a meeting exists to wait on', opened && opened.code)
    const bad = await b.call('vibe_vmu_meeting', { action: 'wait', id: mid, member: 'r-1', until: 'close' })
    ok(bad && bad.ok === false && bad.code === 'VMU_INVALID_ARGUMENT', '§6b an event nobody can ever fire is refused by name', bad && bad.code)
    ok(bad && String(bad.message || '').includes('meeting-closed'), '§6b2 … and the message names the word that does exist (meeting-closed)', bad && bad.message)
    const armed = await b.call('vibe_vmu_meeting', { action: 'wait', id: mid, member: 'r-1', until: 'speak', reason: '等主席开场' })
    ok(armed && armed.ok === true, '§6c a member can arm a wait on a meeting event', armed && (armed.code || armed.message))
    ok(armed && armed.registry === 'service', '§6d the wait went to the meeting SERVICE, not the convene-only face', armed && armed.registry)
    ok(armed && typeof armed.waitId === 'string' && armed.waitId !== '', '§6e the receipt names the waiter row', armed && armed.waitId)
    const s1 = b.K.meetings.summary({ meeting: mid })
    const w1 = Array.isArray(s1 && s1.waiters) ? s1.waiters : []
    ok(w1.length === 1 && w1[0].member === 'r-1' && w1[0].state === 'armed',
      '§6f the read face shows the armed waiter', w1)
    const spoke = await b.call('vibe_vmu_meeting', { action: 'speak', id: mid, member: 'r-acad', text: '开场：确认命题' })
    ok(spoke && spoke.ok === true, '§6g the chair speaks', spoke && spoke.code)
    const fired = Array.isArray(spoke && spoke.firedWaiters) ? spoke.firedWaiters : []
    ok(fired.length === 1 && fired[0].member === 'r-1', '§6h ★ the speaking receipt names the waiter it fired', fired)
    ok(fired.length === 1 && fired[0].wake && typeof fired[0].wake === 'object', '§6i ★ … with the wake it performed, not just the event', fired[0] && fired[0].wake)
    const w0 = fired.length === 1 ? fired[0].wake : null
    ok(w0 !== null && (w0.pending === true || w0.woken === true || (w0.delivered === false && typeof w0.why === 'string' && w0.why.length > 0)),
      '§6j ★ … and that wake is delivered, marked pending, or refused WITH the reason (never a silent no-op)', w0)
    await new Promise((r) => setTimeout(r, 50))
    const s2 = b.K.meetings.summary({ meeting: mid })
    const w2 = Array.isArray(s2 && s2.waiters) ? s2.waiters : []
    ok(w2.length === 1 && w2[0].state === 'fired', '§6k the waiter stays fired (an event is never rolled back)', w2)
    ok(w2.length === 1 && w2[0].wake && w2[0].wake.pending !== true,
      '§6l ★ the pending wake settled in place instead of staying a claim forever', w2[0] && w2[0].wake)
    const nothing = await b.call('vibe_vmu_meeting', { action: 'unwait', id: mid, member: 'r-2' })
    ok(nothing && nothing.ok === true && nothing.cancelled === false, '§6m unwait on a member who was not waiting says so', nothing && nothing.cancelled)
    const again = await b.call('vibe_vmu_meeting', { action: 'wait', id: mid, member: 'r-2', until: 'vote' })
    const cancelled = await b.call('vibe_vmu_meeting', { action: 'unwait', id: mid, member: 'r-2', why: '不打算表决' })
    ok(again && again.ok === true, '§6n a second member arms a wait', again && again.code)
    ok(cancelled && cancelled.ok === true && cancelled.cancelled === true, '§6o ★ unwait really cancels the armed row', cancelled && cancelled.code)
    const late = await b.call('vibe_vmu_meeting', { action: 'wait', id: mid, member: 'r-1', until: 'deadline', timeoutMs: 5000 })
    ok(late && late.ok === true && late.deadlineAt === 6000,
      '§6p a deadline wait names WHEN it expires (clock 1000 + 5000)', late && late.deadlineAt)

    // -- §6q A DEPLOYMENT THAT CAN RUN TURNS REALLY WAKES THE SEAT. The test above runs with no transport bound, which
    // is why its wake may be honestly refused; this one proves the channel that DOES exist: the turn loop. A seat has
    // no resident process, so "wake" means "open that seat's turn and hand it a prompt" - and the report transport
    // (`deliver`) is NOT that channel: it takes report rows shaped {name,text,to}, so handing it a wake envelope is a
    // shape error, not a wake. This test therefore requires the loop to run, the waiter row to record `woken:true`,
    // the parked prompt to belong to the woken seat, and the report transport to stay untouched.
    const delivered = []
    const b2 = await boot(await mkRoot(), () => 1000, { deliver: async (envelope) => { delivered.push(envelope); return { ok: true, delivered: true } } })
    const started2 = await b2.call('vibe_v5_start', { problem: 'run239 waiter transport probe', researcherCount: 2 })
    ok(started2 && started2.ok === true, '§6q0 a second institute starts', started2 && started2.code)
    await b2.K.turn.step({ members: ['r-acad'], phase: 'normal', why: 'run239 waiter transport probe (chair turn)' })
    // The caller-played loop holds ONE parked prompt; a wake that needs a free turn must find the loop free, so the
    // chair's prompt is answered and applied first. (A deployment whose delivery seam runs subagents never parks.)
    await b2.K.turn.supplyMemberReply(fence({ say: '主席回合到此结束。' }), 'r-acad')
    // ★ The park is cleared only by a step that names the SAME seat (measured: an empty member list applies the reply
    // but leaves the prompt parked, so the next drive still refuses).
    await b2.K.turn.step({ members: ['r-acad'], phase: 'normal', why: 'run239 waiter transport probe (apply chair reply)' })
    ok(b2.K.turn.awaitingCaller() === false, '§6q1 the loop is free before the waiter fires (a parked prompt would refuse the wake)', b2.K.turn.awaitingCaller())
    const opened2 = await b2.call('vibe_v5_meeting', { member: 'r-acad', agenda: ['确认命题'], title: 'run239 waiter transport 会议' })
    const mid2 = opened2 && (typeof opened2.meeting === 'string' ? opened2.meeting : opened2.meeting && opened2.meeting.id)
    const armed2 = await b2.call('vibe_vmu_meeting', { action: 'wait', id: mid2, member: 'r-1', until: 'speak' })
    ok(armed2 && armed2.ok === true, '§6q2 the waiter is armed on the second institute', armed2 && armed2.code)
    const spoke2 = await b2.call('vibe_vmu_meeting', { action: 'speak', id: mid2, member: 'r-acad', text: '开场' })
    ok(spoke2 && spoke2.ok === true, '§6q3 the chair speaks there', spoke2 && spoke2.code)
    const fired2 = Array.isArray(spoke2 && spoke2.firedWaiters) ? spoke2.firedWaiters : []
    ok(fired2.length === 1 && fired2[0].member === 'r-1', '§6q4 the waiter fires', fired2)
    await new Promise((r) => setTimeout(r, 100))
    const s3 = b2.K.meetings.summary({ meeting: mid2 })
    const w3 = Array.isArray(s3 && s3.waiters) ? s3.waiters : []
    ok(w3.length === 1 && w3[0].state === 'fired', '§6q5 the fired row stays on the ledger', w3)
    ok(w3.length === 1 && w3[0].wake && w3[0].wake.woken === true, '§6q6 ★ … and the wake really happened (the seat turn was run), not refused', w3[0] && w3[0].wake)
    ok(delivered.length === 0, '§6q7 ★ the REPORT transport was NOT used as a wake channel (a wake envelope is not a report row)', delivered)
    ok(b2.K.turn.awaitingCaller() === true, '§6q8 ★ … and the prompt now parked belongs to the woken seat, waiting for its reply', b2.K.turn.awaitingCaller())
  }
} finally {
  for (const r of roots) { try { await rm(r, { recursive: true, force: true }) } catch { /* best effort */ } }
}

console.log(NL + (failed === 0 ? '=== vmu-run239-kernel: ' + passed + ' passed, 0 failed ===' : '=== vmu-run239-kernel: ' + passed + ' passed, ' + failed + ' failed ==='))
if (failed > 0) { console.log('failures:'); for (const f of failures) console.log('  - ' + f); process.exitCode = 1 }

// tests/vmu-run236-frame-and-progress.test.mjs — RUN 60 / task-30: two defects the live round measured, and the truth
// the prompt now teaches instead.
//
//   1) THE MEMBER COULD NOT SEE WHICH MEETING ITS TURN WAS BOUND TO. The meeting frame rendered
//      `{{ setting:vmu.turn.meetingId }}`, a SETTING with a default of '' and no runtime writer, so the first line was
//      「研究所会议  进行中」 with a hole where the id belongs. The member inferred m2 from the type while the turn was
//      actually bound to m1, and nothing in the frame let it discover the difference. The turn object already carried
//      `meeting: normalizeMeetingId(meeting)` — the fix turns it into prompt FACTS (`vmu.turn.meetingId` and a one-line
//      `vmu.turn.meetingDelivery` reading), merged UNDER the caller's own `facts` so an explicit fact still wins.
//
//   2) THE REPLY FIELD `progress` WROTE A SECOND ROW IN THE SAME TURN. A member that had already called
//      `vibe_v5_record_progress` and also wrote `progress` in the fenced reply got rec-23 AND rec-24 (same owner,
//      same turn) and the receipt's coercion did not say a row already existed; the second title was
//      `firstLine.slice(0, 80)`, which cut a live row into the half word `…n2-difference-telescop`. Now: one turn of
//      progress is one row (the text form is reported as `skipped-duplicate` citing the existing row id), and the row
//      title is FIXED per member (`<member> · 本轮 progress`) with the whole text kept in `body`.
//
// §1 the meeting frame carries the REAL bound meeting id and the one-line delivery reading
// §2 the same frame, with no binding, says the speech is not delivered and names the working route
// §3 a reply `progress` after the tool door already wrote this turn: one row, skipped by name, coercion cites the row
// §4 the text form with no twin still writes one row — fixed title, whole body, no truncation
//
// Run: node tests/vmu-run236-frame-and-progress.test.mjs   Last line: N passed, M failed

import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..')
const ENTRY = join(REPO, 'vibe-math-vmu', 'vibe-math-vmu.js')
const TURN = join(REPO, 'vibe-math-vmu', 'kernel', 'turn', 'index.js')
const BLOCKS_A = join(REPO, 'vibe-math-vmu', 'packs', 'v5r', 'prompts', 'v5r-blocks-a.js')
const REPLY_CHANNEL = join(REPO, 'vibe-math-vmu', 'packs', 'v5r', 'prompts', 'v5r-reply-channel.js')

let passed = 0
let failed = 0
const failures = []
const ok = (cond, label, detail) => {
  if (cond) { passed++; console.log('  ok   ' + label); return true }
  failed++
  failures.push(label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  console.error('  FAIL ' + label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  return false
}

const entry = await import(pathToFileURL(ENTRY).href)
const turnSource = await readFile(TURN, 'utf8')
const blocksASource = await readFile(BLOCKS_A, 'utf8')
const replyChannelSource = await readFile(REPLY_CHANNEL, 'utf8')

const roots = []
const mkRoot = async () => { const d = await mkdtemp(join(tmpdir(), 'vmu-r236-')); roots.push(d); return d }

const boot = async (root) => {
  const state = { specs: [] }
  const ctx = {
    effect(fn) { return fn() },
    on() { return () => {} },
    tools: { register: async (spec) => { state.specs.push(spec); return () => {} } },
  }
  const handle = entry.apply(ctx, { clock: () => 1000, packs: ['v5r'], root, deliverMode: 'caller' })
  await handle.ready()
  await handle.kernel.store.open()
  return { handle, K: handle.kernel, specs: state.specs }
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
const frameTextOf = (step) => {
  if (!step || !step.memberPrompt) return null
  return typeof step.memberPrompt.text === 'string' ? step.memberPrompt.text : null
}
const progressRowsFor = (K, member) => {
  const list = K.records.list({ track: 'progress', limit: 0 })
  const items = Array.isArray(list.items) ? list.items : []
  return items.filter((r) => r && String(r.owner) === String(member))
}

try {
  // ── §0 THE SOURCE-SIDE READINGS: both repairs are named shapes, not coincidences ─────────────────────────────
  {
    console.log('§0 both repairs exist in the source as named shapes')
    ok(turnSource.includes('vmu.turn.meetingDelivery'), '§0a the kernel assembles a per-turn delivery reading')
    ok(turnSource.includes("'vmu.turn.meetingId': boundMeetingId"), '§0b and feeds the REAL bound id into the setting the frame renders')
    ok(blocksASource.includes('{{ setting:vmu.turn.meetingDelivery }}'),
      '§0c the meeting frame asks the prompt pipeline for that reading')
    ok(turnSource.includes('progressWrittenThisTurn'), '§0d the duplicate-progress guard exists')
    ok(turnSource.includes('skipped-duplicate'), '§0e and its coercion names the skip (not a generic "converted")')
    ok(replyChannelSource.includes('不要再调 vibe_v5_record_progress'),
      '§0f the taught reply field tells the member one progress route per turn')
  }

  // ── §1 THE FRAME CARRIES THE REAL BOUND MEETING ID ──────────────────────────────────────────────────────────
  {
    console.log('§1 the meeting frame prints the meeting this turn is bound to, and how speech reaches it')
    const b = await boot(await mkRoot())
    await b.K.members.hire({ id: 'r-1', slot: 'member' })
    const opened = await b.K.turn.step({ members: ['r-1'], phase: 'meeting', why: 'run236 frame probe', meeting: 'm1' })
    ok(opened && opened.awaiting === true, '§1a a member turn opens bound to m1', opened && opened.ok)
    const frame = frameTextOf(opened)
    ok(typeof frame === 'string' && frame.length > 0, '§1b the parked prompt carries the assembled frame text')
    ok(typeof frame === 'string' && frame.includes('本回合绑定会议 m1'),
      '§1c ★ the frame names the REAL binding (m1), not an empty setting', frame)
    ok(typeof frame === 'string' && frame.includes('投到'),
      '§1d and says where this turn\'s speech actually goes')
    ok(typeof frame === 'string' && frame.includes('vibe_v5_meeting_round'),
      '§1e and names the working route to bind a different meeting for the NEXT turn')
    ok(typeof frame === 'string' && frame.includes('〔未提供：vmu.turn.meetingId〕') === false,
      '§1f the old empty-setting hole is gone from the frame')
  }

  // ── §2 WITH NO BINDING THE FRAME SAYS THE SPEECH IS NOT DELIVERED ───────────────────────────────────────────
  {
    console.log('§2 an unbound turn does not promise delivery; it names the route that works')
    const b = await boot(await mkRoot())
    await b.K.members.hire({ id: 'r-1', slot: 'member' })
    const opened = await b.K.turn.step({ members: ['r-1'], phase: 'meeting', why: 'run236 unbound frame probe' })
    ok(opened && opened.awaiting === true, '§2a an unbound meeting-phase turn still opens', opened && opened.ok)
    const frame = frameTextOf(opened)
    ok(typeof frame === 'string' && frame.length > 0, '§2b the frame is assembled')
    ok(typeof frame === 'string' && frame.includes('本回合没有绑定会议'),
      '§2c the frame says there is NO binding for this turn', frame)
    ok(typeof frame === 'string' && frame.includes('不会投递'),
      '§2d and that the reply `say` is not delivered (it only stays in the receipt notes)')
    ok(typeof frame === 'string' && frame.includes('vibe_v5_say'),
      '§2e and names the tool that actually sends group/private speech')
  }

  // ── §3 THE TOOL DOOR ALREADY WROTE THIS TURN: THE REPLY FORM DOES NOT WRITE A TWIN ──────────────────────────
  {
    console.log('§3 one turn of progress is one row: the text form is reported, not double-written')
    const b = await boot(await mkRoot())
    await b.K.members.hire({ id: 'r-1', slot: 'member' })
    const opened = await b.K.turn.step({ members: ['r-1'], phase: 'normal', why: 'run236 dedupe probe' })
    ok(opened && opened.awaiting === true, '§3a the member turn opens')
    const progressSpec = b.specs.find((s) => s && s.name === 'vibe_v5_record_progress')
    ok(progressSpec !== undefined, '§3b the progress tool is registered on this boot')
    const raw = await progressSpec.execute(
      { member: 'r-1', track: 'progress', content: '工具先写的研究日志行：定义已固定。' },
      { kernel: b.K },
    )
    const toolReceipt = typeof raw === 'string' ? JSON.parse(raw) : raw
    ok(toolReceipt && toolReceipt.ok === true && typeof toolReceipt.recordId === 'string',
      '§3c the tool door wrote the row and named it', toolReceipt && toolReceipt.recordId)
    const toolRowId = toolReceipt && toolReceipt.recordId
    const before = progressRowsFor(b.K, 'r-1')
    ok(Array.isArray(before) && before.length === 1 && String(before[0].id) === String(toolRowId),
      '§3d the ledger holds exactly the tool row before the reply is applied', before.map((r) => r.id))
    await b.K.turn.supplyMemberReply(fence({ say: '同一件事又用回复字段写了一遍', progress: '工具先写的研究日志行：定义已固定。' }), 'r-1')
    const done = await b.K.turn.step({ members: ['r-1'], phase: 'normal', why: 'run236 dedupe apply' })
    const receipt = receiptOf(done)
    ok(done && done.ok === true && receipt.ok !== false, '§3e the turn SURVIVES the duplicate text form', done && done.ok)
    const executedFields = rowsOf(done, 'executedDetail').map((e) => e && e.field)
    ok(executedFields.includes('progress') === false, '§3f ★ the text form was NOT dispatched (no second row)', executedFields)
    const duplicateRows = rowsOf(done, 'skippedDetail').filter((s) => s && s.field === 'progress')
    ok(duplicateRows.length === 1, '§3g the receipt names the skipped progress field',
      rowsOf(done, 'skippedDetail').map((s) => s && s.field))
    ok(duplicateRows[0] && duplicateRows[0].reason === 'already-written-this-turn',
      '§3h with the reason that says what it is', duplicateRows[0] && duplicateRows[0].reason)
    ok(duplicateRows[0] && String(duplicateRows[0].existingId) === String(toolRowId),
      '§3i and cites the row that already exists', duplicateRows[0] && duplicateRows[0].existingId)
    ok(duplicateRows[0] && typeof duplicateRows[0].means === 'string' && duplicateRows[0].means.length > 40,
      '§3j and explains why no twin was written', duplicateRows[0] && duplicateRows[0].means)
    const coercions = Array.isArray(receipt.coercions) ? receipt.coercions : []
    const dupCoercion = coercions.find((c) => c && c.field === 'progress' && c.to === 'skipped-duplicate')
    ok(dupCoercion !== undefined, '§3k ★ the coercion names the skip (to:"skipped-duplicate")', coercions)
    ok(dupCoercion && typeof dupCoercion.why === 'string' && dupCoercion.why.includes(String(toolRowId)),
      '§3l and its why cites the existing row id (a reader is never told only "converted")', dupCoercion && dupCoercion.why)
    const after = progressRowsFor(b.K, 'r-1')
    ok(Array.isArray(after) && after.length === 1, '§3m ★ the ledger still holds ONE progress row for this member',
      after.map((r) => ({ id: r.id, title: r.title })))
  }

  // ── §4 NO TWIN: THE TEXT FORM WRITES ONE ROW, FIXED TITLE, WHOLE BODY ───────────────────────────────────────
  {
    console.log('§4 the taught text form with no twin still writes one complete row')
    const b = await boot(await mkRoot())
    await b.K.members.hire({ id: 'r-1', slot: 'member' })
    const opened = await b.K.turn.step({ members: ['r-1'], phase: 'normal', why: 'run236 text progress probe' })
    ok(opened && opened.awaiting === true, '§4a the member turn opens')
    const longText = '完成第一步：把 n 与 n+2 的差分写成望远镜和。' + NL + '下一步：给出偶数项和的闭式。'
    await b.K.turn.supplyMemberReply(fence({ say: '按文本记一条进展', progress: longText }), 'r-1')
    const done = await b.K.turn.step({ members: ['r-1'], phase: 'normal', why: 'run236 text progress apply' })
    const receipt = receiptOf(done)
    const progressRows = rowsOf(done, 'executedDetail').filter((e) => e && e.field === 'progress')
    ok(receipt.executed >= 1 && progressRows.length === 1, '§4b the text form is dispatched exactly once',
      { executed: receipt.executed, rows: rowsOf(done, 'executedDetail').map((e) => e && e.field) })
    const coerced = progressRows[0] && progressRows[0].coerced
    ok(coerced && coerced.from === 'string', '§4c the text form is reported as a coercion', coerced)
    ok(coerced && typeof coerced.to === 'string' && coerced.to.includes('progress row'),
      '§4d the coercion says what it became (a progress row)')
    const rows = progressRowsFor(b.K, 'r-1')
    ok(Array.isArray(rows) && rows.length === 1, '§4e exactly one progress row is on the ledger', rows.map((r) => r.id))
    const row = rows[0]
    ok(row && row.title === 'r-1 · 本轮 progress',
      '§4f ★ the title is FIXED per member (never a truncated first line)', row && row.title)
    const full = row ? await b.K.records.get({ id: row.id }) : null
    ok(full && typeof full.body === 'string' && full.body.includes('望远镜和') && full.body.includes('闭式'),
      '§4g the WHOLE text travels in the body (both lines survive)', full && full.body)
    ok(full && full.bodyTruncated === false, '§4h and the body was not truncated', full && full.bodyTruncated)
  }
} finally {
  for (const r of roots) { try { await rm(r, { recursive: true, force: true }) } catch { /* best effort */ } }
}

console.log('')
console.log(passed + ' passed, ' + failed + ' failed')
if (failed > 0) process.exitCode = 1

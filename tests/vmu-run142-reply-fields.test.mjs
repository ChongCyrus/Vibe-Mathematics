#!/usr/bin/env node
/**
 * ★★★ RUN 142 / audit10 — THE REPLY CATALOGUE TAUGHT TWO FIELDS NO MECHANISM COULD REACH.
 *
 * THE DEFECTS THIS SUITE PINS (both measured, not inferred):
 *   C2. `record` was taught as a CARD ARRAY ("成果卡数组：kind,id,title,statement 或 content,value,motive,p"). But the kernel
 *       owns that field as `vmu.library.record`, whose REAL signature is `record(member, track, text)` — it appends one
 *       research-log line to `Members/<member>/Progress/<track>.md`. The dispatch loop called `fn(payload, meta)`, so the
 *       payload object landed in the `track` slot and EVERY `record` reply died with `VMU_RECORD_SHAPE`. The documented
 *       shape was unreachable: a member who followed the catalogue lost the whole turn.
 *   C3. `say` was taught as "对全所说话（群聊）；也可 {"to":"r-2","text":"…"} 私信或 {"to":"voters","text":"…"} 只对表决者".
 *       The dispatch route is `vmu.meetings.speak` (a meeting-floor speech, needs an open meeting), and the true chat /
 *       DM route is the pack tool `vibe_v5_say`. The say note is corrected to the mechanism; the ALREADY-ADJUDICATED
 *       `no-meeting-bound` skip is NOT reversed — it is pinned here as it stands (the line is kept in the receipt `notes`).
 *
 * WHAT THIS SUITE PROVES, in the order a reader needs it:
 *   §1 正: a REAL turn whose reply carries `{record:{track:'progress',text:'…'}}` dispatches (`executed` has
 *          `field:'record'`, `result.ok !== false`), the line really lands in `Members/<member>/Progress/progress.md`,
 *          and the receipt carries NO `VMU_RECORD_SHAPE`.
 *   §2 反: a payload that is not `{track,text}` (`{record:'不是对象'}`) does NOT roll the turn back: the field is recorded
 *          as SKIPPED BY NAME (`reason:'record-shape'`, `code:'VMU_RECORD_SHAPE'`), the hint names `{track,text}` and the
 *          Progress path, nothing is written for that member, and the OTHER field of the same reply still executes.
 *   §3 裁决: a bare `{say:'…'}` in a turn with NO meeting is still `reason:'no-meeting-bound'` with the sentence kept in
 *          `receipt.notes`; and the declared say note no longer promises the unreachable `{"to":…}` shapes — it names the
 *          real DM/chat tool.
 *   §4 教学: the declared `record` note states the mechanism (research-log line under `Members/<you>/Progress/`, a
 *          `track` from `vmu.records.tracks`, `vmu.library.record`) and does NOT repeat the card-array promise.
 *
 * Run: node tests/vmu-run142-reply-fields.test.mjs     Last line: === VMU RUN142 REPLY FIELDS: N passed, M failed ===
 */
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..')
const ENTRY = pathToFileURL(join(REPO, 'vibe-math-vmu', 'vibe-math-vmu.js')).href
const TURN_MODULE = pathToFileURL(join(REPO, 'vibe-math-vmu', 'kernel', 'turn', 'index.js')).href
const REPLY_CHANNEL = pathToFileURL(join(REPO, 'vibe-math-vmu', 'packs', 'v5r', 'prompts', 'v5r-reply-channel.js')).href

let passed = 0
let failed = 0
const failures = []
const ok = (cond, label, detail) => {
  if (cond) { passed++; console.log('  ok   ' + label); return true }
  failed++
  failures.push(label + (detail === undefined ? '' : ' — ' + JSON.stringify(detail)))
  console.error('  FAIL ' + label + (detail === undefined ? '' : ' — ' + JSON.stringify(detail)))
  return false
}

const entry = await import(ENTRY)
const kernelTurn = await import(TURN_MODULE)
const decl = await import(REPLY_CHANNEL)

const roots = []
const boot = async () => {
  const root = await mkdtemp(join(tmpdir(), 'vmu-run142-fields-'))
  roots.push(root)
  const state = { specs: [] }
  const ctx = {
    effect(fn) { return fn() },
    on() { return () => {} },
    tools: { register: async (spec) => { state.specs.push(spec); return () => {} } },
  }
  // `deliverMode:'caller'` is the only mode in which a member turn can be held awaiting a reply (supplyMemberReply);
  // the reply then goes through the REAL dispatch loop, which is the whole point of §1/§2.
  const handle = entry.apply(ctx, { root, packs: ['v5r'], clock: () => 1000, deliverMode: 'caller' })
  await handle.ready()
  return { root, kernel: handle.kernel, names: state.specs.map((s) => s.name) }
}
const NL = String.fromCharCode(10)
const fence = (obj) => ['```json', JSON.stringify(obj), '```'].join(NL)

/** Walk ONE real member turn: open, supply the fenced reply, settle. Returns the settled step (its receipt is the proof). */
const playTurn = async (booted, member, reply) => {
  const opened = await booted.kernel.turn.step({ members: [member], phase: 'normal', why: 'run142 reply-fields probe' })
  if (!opened || opened.awaiting !== true) throw new Error('the member turn did not open: ' + JSON.stringify(opened).slice(0, 400))
  const supplied = booted.kernel.turn.supplyMemberReply(fence(reply), member)
  if (!supplied || supplied.ok !== true) throw new Error('the member reply was not supplied: ' + JSON.stringify(supplied).slice(0, 400))
  return booted.kernel.turn.step({ members: [member], phase: 'normal', why: 'run142 reply-fields probe' })
}
const details = (step, key) => (step && step.receipt && Array.isArray(step.receipt[key]) ? step.receipt[key] : [])

try {
  console.log('=== 1. 正：record 字段真的可达 —— 研究日志行写进磁盘 ===')
  {
    const b = await boot()
    await b.kernel.members.hire({ id: 'r-1', slot: 'member' })
    const LINE = 'run142：模 9 全表已核验到 3^5（probe）'
    const step = await playTurn(b, 'r-1', { record: { track: 'progress', text: LINE } })
    ok(step && step.ok === true, '§1a. 带 {record:{track,text}} 的回执被接受（回合成功），不再整轮抛错', step && step.code)
    const row = details(step, 'executedDetail').find((d) => d && d.field === 'record')
    ok(Boolean(row), '§1b. 回执 executedDetail 里有一行 field:"record"（真的走到派发循环并派发）', details(step, 'executedDetail').map((d) => d.field))
    ok(Boolean(row) && row.result && row.result.ok !== false, '§1c. 该行 result.ok !== false（vmu.library.record 真实返回成功）', row && row.result)
    ok(Boolean(row) && row.face === kernelTurn.FIELD_OWNERS.record.face && row.op === kernelTurn.FIELD_OWNERS.record.op,
      '§1d. 派发的面/操作仍是 FIELD_OWNERS.record（{face:"vmu.library",op:"record"}，面不变，改的是调用形状）', row && { face: row.face, op: row.op })
    const expectedFile = join('Members', 'r-1', 'Progress', 'progress.md')
    let text = ''
    try { text = String(await readFile(join(b.root, expectedFile), 'utf8')) } catch { text = '' }
    ok(text.includes(LINE), '§1e. 磁盘上 ' + expectedFile + ' 真的出现这一行（readFile 断言，不是只看返回值）', text.slice(0, 200))
    ok(Boolean(row) && String(row.result.file || '').endsWith(expectedFile), '§1f. 回执的 result.file 指向同一个 Progress 文件', row && row.result.file)
    ok(!JSON.stringify(step).includes('VMU_RECORD_SHAPE'), '§1g. 回执里没有 VMU_RECORD_SHAPE（旧矛盾：这一行必然出现）')
  }

  console.log('=== 2. 反：形状不符只跳过该字段，不回滚整轮，且具名指出缺什么 ===')
  {
    const b = await boot()
    await b.kernel.members.hire({ id: 'r-2', slot: 'member' })
    const PROGRESS = { track: 'progress', kind: 'progress', title: 'run142 形状反例', body: 'record 写错了，但同一条回执里的 progress 仍应生效' }
    const step = await playTurn(b, 'r-2', { record: '不是对象', progress: PROGRESS })
    ok(step && step.ok === true, '§2a. 形状不符的 record 不回滚回合（ok:true，回执仍产出）', step && step.code)
    const skipped = details(step, 'skippedDetail')
    const bad = skipped.find((s) => s && s.field === 'record')
    ok(Boolean(bad), '§2b. skipped 里有一行 field:"record"（不是静默丢掉）', skipped.map((s) => s.field))
    ok(Boolean(bad) && bad.reason === 'record-shape', '§2c. reason 是字面量 record-shape', bad && bad.reason)
    ok(Boolean(bad) && bad.code === 'VMU_RECORD_SHAPE', '§2d. code 是字面量 VMU_RECORD_SHAPE（与 library.js 的具名拒绝同一个名字）', bad && bad.code)
    ok(Boolean(bad) && Array.isArray(bad.missing) && bad.missing.includes('track') && bad.missing.includes('text'),
      '§2e. 发送方看得到具体缺哪个槽：missing 含 track 与 text', bad && bad.missing)
    const hint = String((bad && bad.hint) || '')
    ok(hint.includes('track') && hint.includes('text') && hint.includes('Members/<you>/Progress/') && hint.includes('vmu.library.record'),
      '§2f. hint 指出真实形状 {track,text} 与真实落点 Members/<you>/Progress/<track>.md（照 library.js 的 hint 风格）', hint.slice(0, 200))
    ok(Boolean(bad) && typeof bad.note === 'string' && /NOT dispatched/.test(bad.note) && Boolean(bad.means) && /research-log/.test(bad.means),
      '§2g. skipped 行的 note/means 说明了「没派发、什么也没写、其余字段照旧」的语义', bad && { note: bad.note, means: bad.means && bad.means.slice(0, 80) })
    const good = details(step, 'executedDetail').find((d) => d && d.field === 'progress')
    ok(Boolean(good) && good.result && good.result.ok !== false, '§2h. 同一条回执里的另一个字段（progress）仍然执行了 —— 收窄到字段，不是整轮失败', good && good.result)
    let wroteRecord = true
    try { await readFile(join(b.root, 'Members', 'r-2', 'Progress', 'progress.md'), 'utf8') } catch { wroteRecord = false }
    ok(wroteRecord === false, '§2i. 形状不符的 record 什么也没写（该成员的 Progress 文件根本不存在）', wroteRecord)
  }

  console.log('=== 3. 裁决钉住 + say 教学改成机制真相 ===')
  {
    const b = await boot()
    await b.kernel.members.hire({ id: 'r-3', slot: 'member' })
    const sentence = '本轮结论已在会议里说过：模 9 全表成立'
    const step = await playTurn(b, 'r-3', { say: sentence })
    const skipped = details(step, 'skippedDetail')
    const saySkip = skipped.find((s) => s && s.field === 'say')
    ok(Boolean(saySkip) && saySkip.reason === 'no-meeting-bound',
      '§3a. 无会议绑定的 {say} 仍被具名跳过 reason:"no-meeting-bound"（既有裁决，不反转）', saySkip && saySkip.reason)
    const notes = (step && step.receipt && Array.isArray(step.receipt.notes)) ? step.receipt.notes : []
    const kept = notes.find((n) => n && n.field === 'say')
    ok(Boolean(kept) && kept.text === sentence && kept.kept === true,
      '§3b. 这句话原文进回执 notes（kept:true），没有静默丢弃', kept)
    const sayRow = decl.REPLY_FIELD_ROWS.find((r) => r.field === 'say')
    const note = String((sayRow && sayRow.note) || '')
    ok(Boolean(sayRow), '§3c. REPLY_FIELD_ROWS 里仍有 say 行')
    ok(!note.includes('也可 {"to"'), '§3d. say 行 note 不再出现「也可 {"to"」这种不可达措辞（旧承诺的准确原文）', note)
    ok(note.includes('vibe_v5_say'), '§3e. say 行 note 把群聊/私信指向真实工具 vibe_v5_say', note)
    ok(note.includes('notes') && /会议/.test(note), '§3f. say 行 note 说明无会议绑定时不投递、句子进 notes，以及会议轮才是会议楼层发言', note)
    ok(note.includes('必须用工具 vibe_v5_say'), '§3g. 群聊/私信被写成强制走工具（不是「也可」），与机制一致', note)
  }

  console.log('=== 4. 教学：record 行的 note 与机制对得上 ===')
  {
    const recordRow = decl.REPLY_FIELD_ROWS.find((r) => r.field === 'record')
    const note = String((recordRow && recordRow.note) || '')
    ok(Boolean(recordRow), '§4a. REPLY_FIELD_ROWS 里仍有 record 行')
    ok(recordRow && recordRow.face === kernelTurn.FIELD_OWNERS.record.face && recordRow.op === kernelTurn.FIELD_OWNERS.record.op,
      '§4b. record 行的 owner 仍是 FIELD_OWNERS.record（{face:"vmu.library",op:"record"}）', recordRow && { face: recordRow.face, op: recordRow.op })
    ok(note.includes('Members/<你>/Progress/'), '§4c. note 写明落点 Members/<你>/Progress/<track>.md', note)
    ok(note.includes('track'), '§4d. note 写明 track（且必须是 vmu.records.tracks 之一）', note)
    ok(note.includes('vmu.library.record'), '§4e. note 点名真实机制 vmu.library.record', note)
    ok(!note.includes('成果卡数组'), '§4f. note 不再把 record 许诺成成果卡数组（旧承诺的准确原文）', note)
    ok(note.includes('vibe_v5_record_proposition'), '§4g. note 把成果卡指到真实工具（vibe_v5_record_proposition / _method / _subproblem）', note)
    ok(!/value|概率/.test(note), '§4h. note 不再许诺价值/概率字段（旧 note 里没有，也禁止回来）', note)
  }
} finally {
  for (const root of roots) { try { await rm(root, { recursive: true, force: true }) } catch { /* cleanup only */ } }
}

console.log('=== VMU RUN142 REPLY FIELDS: ' + passed + ' passed, ' + failed + ' failed ===')
if (failed > 0) {
  console.error('FAILURES:')
  for (const f of failures) console.error('  - ' + f)
  process.exitCode = 1
}

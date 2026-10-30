#!/usr/bin/env node
/**
 * ★★★ RUN 144 / audit12 — EIGHT REPLY FIELDS WERE TAUGHT WITH SHAPES THE DISPATCHER CANNOT DELIVER.
 *
 * THE DEFECTS THIS SUITE PINS (measured by the auditor by driving a real kernel round with the EXACT json the live
 * catalogue taught; every one of these DIED THE TURN, because the dispatch loop re-throws):
 *   C-1 `task_create` taught `{subject,…}` — `vmu.tasks.create` reads `title` ⇒ `VMU_INVALID_ARGUMENT`.
 *   C-2 `task_update` taught `{task_id,expected_revision,action}` — `tasks.transition(id, to)` is POSITIONAL, so the
 *       payload object landed in the `id` slot ⇒ `no task with id [object Object]`.
 *   C-3/C-4 `task_claim` / `task_done` taught "任务 id 字符串" — the second positional slot always receives the dispatch
 *       meta ⇒ `unknown task state: [object Object]`.
 *   C-5 `reject_assign` promised 「理由会被广播给全体表决者」 — the owner is `vmu.meetings.speak`, a reply carries no
 *       meeting, so it is skipped `no-meeting-bound`: executed 0, no objection row, no mail.
 *   C-6/C-7/C-8 (full catalogue only) `propose_meeting` / `assign` / `nudge` — same positional-or-meeting-owner family.
 *
 * THE FIX THIS SUITE PINS: a reply field can carry ONE value; the operations above take POSITIONAL arguments (or an
 * object only a meeting-bound turn has). So the kernel declares them `noReplyShape` (refused BY NAME before any face
 * lookup, the rest of the turn still applies) and the declaration names the TOOL face that does work — the pack tool
 * handlers are the adapters that turn a reply-shaped object into the positional call. `task_create` stays usable, taught
 * with the key the face really reads (`title`).
 *
 * WHAT THIS SUITE PROVES:
 *   §1 a REAL turn carrying each of the six refused fields returns ok:true (it does NOT die), and the receipt carries a
 *      skipped row with `reason:'no-supported-shape'` + `code:'VMU_TURN_FIELD_NOT_APPLICABLE'` + a hint naming a tool.
 *   §2 `task_create` with `{title}` really executes (`vmu.tasks.create`), and the task is on the board.
 *   §3 the declaration and the kernel agree: every `FIELD_OWNERS` entry with `noReplyShape` is marked `notApplicable`
 *      in `REPLY_FIELD_ROWS` (and nothing is marked without the kernel saying so).
 *   §4 every hint/note for a refused field names a REAL tool route (`vibe_v5_…`); no row teaches a positional shape as
 *      if a reply could carry it.
 *   §5 the captured corpus sentence is still verbatim and the corrected line right after it says these three are not
 *      reply fields.
 *
 * Run: node tests/vmu-run144-reply-routes.test.mjs   Last line: === VMU RUN144 REPLY ROUTES: N passed, M failed ===
 */
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..')
const ENTRY = pathToFileURL(join(REPO, 'vibe-math-vmu', 'vibe-math-vmu.js')).href
const TURN_MODULE = pathToFileURL(join(REPO, 'vibe-math-vmu', 'kernel', 'turn', 'index.js')).href
const REPLY_CHANNEL = pathToFileURL(join(REPO, 'vibe-math-vmu', 'packs', 'v5r', 'prompts', 'v5r-reply-channel.js')).href
const BLOCKS_B = pathToFileURL(join(REPO, 'vibe-math-vmu', 'packs', 'v5r', 'prompts', 'v5r-blocks-b.js')).href

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
const blocksB = await import(BLOCKS_B)

const roots = []
const boot = async () => {
  const root = await mkdtemp(join(tmpdir(), 'vmu-run144-routes-'))
  roots.push(root)
  const state = { specs: [] }
  const ctx = {
    effect(fn) { return fn() },
    on() { return () => {} },
    tools: { register: async (spec) => { state.specs.push(spec); return () => {} } },
  }
  const handle = entry.apply(ctx, { root, packs: ['v5r'], clock: () => 1000, deliverMode: 'caller' })
  await handle.ready()
  return { root, kernel: handle.kernel, names: state.specs.map((s) => s.name) }
}
const NL = String.fromCharCode(10)
const fence = (obj) => ['```json', JSON.stringify(obj), '```'].join(NL)

const playTurn = async (booted, member, reply) => {
  const opened = await booted.kernel.turn.step({ members: [member], phase: 'normal', why: 'run144 reply-routes probe' })
  if (!opened || opened.awaiting !== true) throw new Error('the member turn did not open: ' + JSON.stringify(opened).slice(0, 400))
  const supplied = booted.kernel.turn.supplyMemberReply(fence(reply), member)
  if (!supplied || supplied.ok !== true) throw new Error('the member reply was not supplied: ' + JSON.stringify(supplied).slice(0, 400))
  return booted.kernel.turn.step({ members: [member], phase: 'normal', why: 'run144 reply-routes probe' })
}
const details = (step, key) => (step && step.receipt && Array.isArray(step.receipt[key]) ? step.receipt[key] : [])
const row = (field) => decl.REPLY_FIELD_ROWS.find((r) => r.field === field)

/** The six fields the auditor measured as UNDELIVERABLE from a reply. Each carries the route that really works. */
const REFUSED = [
  { field: 'task_update', payload: { task_id: 't-1', expected_revision: 1, action: 'claim' }, route: 'vibe_v5_task_update' },
  { field: 'task_claim', payload: 't-1', route: 'vibe_v5_task_update' },
  { field: 'task_done', payload: 't-1', route: 'vibe_v5_task_update' },
  { field: 'assign', payload: { subject: 's', to: 'r-2', why: 'w', acceptance: 'a' }, route: 'vibe_v5_assign' },
  { field: 'nudge', payload: { to: 'r-2', why: 'w', next_step: 'n' }, route: 'vibe_v5_nudge' },
  { field: 'reject_assign', payload: { task_id: 't-1', why: '不同意方向' }, route: 'vibe_v5_record_progress' },
]

try {
  console.log('=== 1. 六个别再教形状的字段：真回合不崩，具名跳过，hint 给活路 ===')
  // non-vacuous: REFUSED is a six-element literal right above (each entry asserted below).
  for (const c of REFUSED) {
    const b = await boot()
    await b.kernel.members.hire({ id: 'r-1', slot: 'member' })
    const step = await playTurn(b, 'r-1', { [c.field]: c.payload })
    ok(step && step.ok === true, '§1a.' + c.field + ' 的回合成功（旧矛盾：整轮抛错）', step && step.code)
    const skipped = details(step, 'skippedDetail')
    const bad = skipped.find((s) => s && s.field === c.field)
    ok(Boolean(bad), '§1b.' + c.field + ' 在 skipped 里有具名行（不静默丢）', skipped.map((s) => s.field))
    ok(Boolean(bad) && bad.reason === 'no-supported-shape', '§1c.' + c.field + ' reason 是字面量 no-supported-shape', bad && bad.reason)
    ok(Boolean(bad) && bad.code === 'VMU_TURN_FIELD_NOT_APPLICABLE', '§1d.' + c.field + ' code 是 VMU_TURN_FIELD_NOT_APPLICABLE', bad && bad.code)
    const hint = String((bad && bad.hint) || '')
    ok(hint.includes(c.route), '§1e.' + c.field + ' 的 hint 点名活路 ' + c.route, hint.slice(0, 160))
    const executed = details(step, 'executedDetail')
    ok(!executed.some((d) => d && d.field === c.field), '§1f.' + c.field + ' 没有被假装执行（executed 里没有它）', executed.map((d) => d.field))
  }

  console.log('=== 2. task_create 仍是可用字段，而且教的是内核真读的键 ===')
  {
    const b = await boot()
    await b.kernel.members.hire({ id: 'r-2', slot: 'member' })
    const step = await playTurn(b, 'r-2', { task_create: { title: 'run144：可认领的占位任务', description: '证明 title 是内核真读的键' } })
    ok(step && step.ok === true, '§2a. 用 {title} 写 task_create 的回合成功', step && step.code)
    const rowExec = details(step, 'executedDetail').find((d) => d && d.field === 'task_create')
    ok(Boolean(rowExec) && rowExec.result && rowExec.result.ok !== false, '§2b. task_create 真的执行了（vmu.tasks.create 返回成功）', rowExec && rowExec.result)
    const listed = await b.kernel.tasks.list({})
    const items = Array.isArray(listed) ? listed : []
    ok(items.some((t) => t && t.title === 'run144：可认领的占位任务'), '§2c. 任务板上真的有这行（list({}) 读到它）', items.map((t) => t && t.title))
    const note = String(row('task_create').note || '')
    ok(note.includes('title') && note.includes('subject'), '§2d. task_create 的教学同时点名 title（内核键）与 subject（工具形参），两处名字不同', note)
  }

  console.log('=== 3. 声明与内核双向一致：noReplyShape ⇔ notApplicable ===')
  {
    const kernelNoShape = Object.entries(kernelTurn.FIELD_OWNERS).filter(([, v]) => v && v.noReplyShape).map(([f]) => f).sort()
    const declNoShape = decl.REPLY_FIELD_ROWS.filter((r) => r.notApplicable).map((r) => r.field).sort()
    ok(kernelNoShape.length > 0 && declNoShape.length > 0 && JSON.stringify(kernelNoShape) === JSON.stringify(declNoShape),
      '§3a. 两边集合逐字相等（内核说没有形状的字段，目录里一个不少、也一个不多）', { kernelNoShape, declNoShape })
    for (const f of ['task_update', 'task_claim', 'task_done', 'assign', 'nudge', 'reject_assign']) {
      ok(kernelNoShape.includes(f) && Boolean(row(f) && row(f).notApplicable), '§3b.' + f + ' 两侧都标成「没有可用形状」', { kernel: kernelNoShape.includes(f), decl: row(f) && row(f).notApplicable })
    }
  }

  console.log('=== 4. 每个被拒字段的路由都是真工具名，而且没有一行把位置参数形状当可用 ===')
  {
    const declared = new Set(decl.REPLY_FIELD_ROWS.map((r) => r.field))
    // non-vacuous: REFUSED is a six-element literal (see §1); every entry gets three assertions here.
    for (const c of REFUSED) {
      const r = row(c.field)
      const text = String((r && r.note) || '') + ' ' + String((kernelTurn.FIELD_OWNERS[c.field] && kernelTurn.FIELD_OWNERS[c.field].noReplyShape && kernelTurn.FIELD_OWNERS[c.field].noReplyShape.hint) || '')
      ok(new RegExp('vibe_v5_[a-z_]+').test(text), '§4a.' + c.field + ' 的教学/hint 至少点名一个 vibe_v5_* 工具路由')
      ok(r && r.notApplicable === true, '§4b.' + c.field + ' 的目录行标成 notApplicable（不再作为可用字段渲染）', r && { notApplicable: r.notApplicable })
    }
    ok(declared.has('task_create') && !row('task_create').notApplicable, '§4c. task_create 仍是可用行（只有它真的能被回执送达）')
    const pm = String(row('propose_meeting').note || '')
    // AUDIT15 C-1 (this round): the old promise 「只在会议轮投递」 was FALSE — a meeting round is not enough, because
    // a reply carries no meeting id. The truth is: it cannot be delivered from the reply at all; use the tool.
    // AUDIT16 C-1 (run 147): the CONVENE route it names must be `vibe_v5_meeting` — the pack tool is the face that
    // enforces "only the chair convenes" (`vibe_vmu_meeting` is the framework face, which does not police seats) — so
    // the assertion follows the mechanism instead of the old name.
    ok(!row('propose_meeting').notApplicable && pm.includes('回执不带会议 id') && pm.includes('vibe_v5_meeting') && pm.includes('vibe_v5_motion'),
      '§4d. propose_meeting 保留可用但说清「回执不带会议 id」并给出召集工具与动议工具', pm)
    ok(!pm.includes('只在会议轮投递'),
      '§4e. ★ 旧的「只在会议轮投递」承诺已删（会议轮也不够：回执不带会议 id）', pm)
  }

  console.log('=== 5. 捕获原文逐字保留，紧跟着一行说清「这三个不是回执字段」 ===')
  {
    const block = blocksB.CHARTER_BLOCKS_B.find((s) => String((s.texts && s.texts.shared) || '').includes('task_done：完成的任务id'))
    const text = String((block && block.texts && block.texts.shared) || '')
    ok(text.includes('task_done：完成的任务id；task_update：{task_id,expected_revision,action}（release等）；reject_assign：{task_id,why}。阻塞原因写入progress，不代表已证伪。'),
      '§5a. 捕获句仍逐字在位（fixture 保真基线不动）')
    ok(text.includes('这三件事都**不是回执字段**') && text.includes('vibe_v5_task_update') && text.includes('VMU_TURN_FIELD_NOT_APPLICABLE'),
      '§5b. 紧随其后的一行说清它们不是回执字段，并点名工具与拒绝码', text.slice(0, 120))
  }
} finally {
  for (const root of roots) {
    try { await rm(root, { recursive: true, force: true, maxRetries: 5 }) } catch (e) { console.error('  note: temp cleanup ' + (e && e.code)) }
  }
}

if (failed > 0) {
  console.error(NL + 'FAILURES:' + NL + failures.map((f) => '  · ' + f).join(NL))
}
console.log(NL + '=== VMU RUN144 REPLY ROUTES: ' + passed + ' passed, ' + failed + ' failed ===')
process.exit(failed === 0 ? 0 : 1)

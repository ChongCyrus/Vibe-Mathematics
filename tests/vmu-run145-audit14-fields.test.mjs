#!/usr/bin/env node
/**
 * ★★★ RUN 145 / audit14 — TWO LIVE CATALOGUE LINES TAUGHT A RESULT THE DISPATCH PATH COULD NOT PRODUCE.
 *
 * THE DEFECTS THIS SUITE PINS (both measured by the auditor with a REAL kernel round):
 *   C-1 `task_create` taught `{title,description,blocked_by?,write_scopes?}` while `vmu.tasks.create` reads
 *       `{title,objective,deps,writeScopes}`: the last three keys were DROPPED SILENTLY (`deps:[], writeScopes:[]`,
 *       `ready:true` for a task whose declared prerequisite existed) with no refusal and no note.
 *   C-2 `propose_meeting` said "普通轮会被具名跳过 VMU_TURN_FIELD_NOT_APPLICABLE"; the ordinary round actually DIED
 *       (`receipt=null`): `plan()` marks only the declared `noReplyShape` fields, so the motion reached the meeting face,
 *       threw `VMU_NO_OPEN_MEETING`, and the re-mapper re-raised it. `motion`/`proposal`/`propose_verify` had the same
 *       fate (audit12 G14).
 *
 * THE FIX THIS SUITE PINS:
 *   - `taskCreateArgs` (kernel/turn/index.js) maps the taught keys onto the real ones AND refuses unknown keys by name
 *     (`reason:'task-create-shape'`, `code:'VMU_INVALID_ARGUMENT'`, accepted-key list in the hint).
 *   - `dispatchSkipReason` skips a meetings-motion field with `reason:'no-meeting-bound'` when the turn has no meeting,
 *     keeps the line in `notes`, and lets the turn complete — the same object-requirement rule `say` has had since run 35.
 *
 * WHAT THIS SUITE PROVES:
 *   §1 a real `task_create` round with all four taught keys created the task WITH its deps/objective/writeScopes.
 *   §2 an unknown key is a named skip, not a silent drop, and no task is created.
 *   §3 the four meeting-motion fields on an ordinary round: ok:true, skipped `no-meeting-bound`, line kept in notes,
 *      nothing executed (the old behaviour was receipt=null).
 *   §4 the catalogue text says what the mechanism now does and no longer claims the old refusal code.
 *   §5 `taskCreateArgs` is a pure function whose every branch is reachable (mapping + refusal), asserted directly.
 *
 * Run: node tests/vmu-run145-audit14-fields.test.mjs   Last line: === VMU RUN145 AUDIT14 FIELDS: N passed, M failed ===
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
  const root = await mkdtemp(join(tmpdir(), 'vmu-run145-audit14-'))
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
const fenced = (obj) => ['```json', JSON.stringify(obj), '```'].join(NL)

const playTurn = async (booted, member, reply) => {
  const opened = await booted.kernel.turn.step({ members: [member], phase: 'normal', why: 'run145 audit14 probe' })
  if (!opened || opened.awaiting !== true) throw new Error('the member turn did not open: ' + JSON.stringify(opened).slice(0, 400))
  const supplied = booted.kernel.turn.supplyMemberReply(fenced(reply), member)
  if (!supplied || supplied.ok !== true) throw new Error('the member reply was not supplied: ' + JSON.stringify(supplied).slice(0, 400))
  return booted.kernel.turn.step({ members: [member], phase: 'normal', why: 'run145 audit14 probe' })
}
const details = (step, key) => (step && step.receipt && Array.isArray(step.receipt[key]) ? step.receipt[key] : [])
const row = (field) => decl.REPLY_FIELD_ROWS.find((r) => r.field === field)
const board = async (booted) => {
  const listed = await booted.kernel.tasks.list({})
  return Array.isArray(listed) ? listed : (listed && Array.isArray(listed.tasks) ? listed.tasks : [])
}

try {
  console.log('=== 1. task_create 教了四个键，四个键都必须真的到达内核（旧矛盾：后三个被静默丢弃） ===')
  {
    const b = await boot()
    await b.kernel.members.hire({ id: 'r-1', slot: 'member' })
    const pre = await playTurn(b, 'r-1', { task_create: { title: '前置任务', description: 'dep target' } })
    const preCreated = details(pre, 'executedDetail').find((d) => d && d.field === 'task_create')
    ok(Boolean(preCreated) && preCreated.result && preCreated.result.id, '§1a. 先建一条真任务拿到 id（blocked_by 要引用一个真存在的 id）', preCreated && preCreated.result)
    const depId = preCreated && preCreated.result && preCreated.result.id
    const step = await playTurn(b, 'r-1', {
      task_create: {
        title: 'run145：带前置与写面的任务',
        description: 'DESC 必须进 objective',
        blocked_by: [depId],
        write_scopes: ['src/x'],
      },
    })
    ok(step && step.ok === true, '§1b. 四键 task_create 的回合成功', step && step.code)
    const exec = details(step, 'executedDetail').find((d) => d && d.field === 'task_create')
    ok(Boolean(exec) && exec.result && exec.result.ok !== false, '§1c. 真的执行了（不是跳过）', exec && exec.result)
    const made = exec && exec.result
    ok(Boolean(made) && Array.isArray(made.deps) && made.deps.length === 1 && String(made.deps[0]) === String(depId),
      '§1d. blocked_by 真的进了 deps（旧矛盾：deps 为空数组）', made && made.deps)
    ok(Boolean(made) && Array.isArray(made.writeScopes) && made.writeScopes.length === 1 && made.writeScopes[0] === 'src/x',
      '§1e. write_scopes 真的进了 writeScopes（旧矛盾：为空数组）', made && made.writeScopes)
    const listed = await board(b)
    const mine = listed.find((t) => t && t.title === 'run145：带前置与写面的任务')
    ok(Boolean(mine), '§1f. 任务板上有这一行', listed.map((t) => t && t.title))
    ok(Boolean(made) && made.objective === 'DESC 必须进 objective', '§1g. description 真的进了 objective（create 回执读得回，旧矛盾里这个键根本没被看到）', made && made.objective)
    ok(Boolean(mine) && Array.isArray(mine.deps) && mine.deps.length === 1, '§1h. list 读回的 deps 不是空的（声明的前置不是「说了等于没说」）', mine && mine.deps)
  }

  console.log('=== 2. 目录没教的键：具名跳过，不静默丢、不建任务 ===')
  {
    const b = await boot()
    await b.kernel.members.hire({ id: 'r-1', slot: 'member' })
    const step = await playTurn(b, 'r-1', { task_create: { title: 'run145：不该被建出来的任务', priority: 7 } })
    ok(step && step.ok === true, '§2a. 未知键的回合仍成功（不整轮死）', step && step.code)
    const skipped = details(step, 'skippedDetail')
    const bad = skipped.find((s) => s && s.field === 'task_create')
    ok(Boolean(bad), '§2b. skipped 里有 task_create 的具名行', skipped.map((s) => s.field))
    ok(Boolean(bad) && bad.reason === 'task-create-shape', '§2c. reason 是字面量 task-create-shape', bad && bad.reason)
    ok(Boolean(bad) && bad.code === 'VMU_INVALID_ARGUMENT', '§2d. code 是 VMU_INVALID_ARGUMENT', bad && bad.code)
    const hint = String((bad && bad.hint) || '')
    ok(hint.includes('title') && hint.includes('blocked_by') && hint.includes('write_scopes') && hint.includes('four keys only'),
      '§2e. hint 列出这个字段能带的四个键并明说「four keys only」', hint.slice(0, 240))
    ok(hint.includes('vibe_v5_task_create'), '§2f. hint 点名工具面 vibe_v5_task_create 作为 owner/priority 的活路', hint.slice(0, 240))
    const listed = await board(b)
    ok(!listed.some((t) => t && t.title === 'run145：不该被建出来的任务'), '§2g. 板子上没有这条任务（跳过的字段没有副作用）', listed.map((t) => t && t.title))
  }

  console.log('=== 3. 会议动议字段在普通轮：具名跳过 + 原句留在 notes（旧矛盾：receipt=null） ===')
  // non-vacuous: MOTION_FIELDS is a four-element literal right below; every entry gets four assertions.
  const MOTION_FIELDS = [
    { field: 'propose_meeting', payload: { agenda: '下一步' } },
    { field: 'propose_verify', payload: { target: 'p-lemma-a', kind: 'lemma', reason: 'r' } },
    { field: 'proposal', payload: { text: '我提议先做引理' } },
    { field: 'motion', payload: { text: '我提议换方向' } },
  ]
  // non-vacuous: MOTION_FIELDS is a four-element literal defined just above (each field asserted below).
  for (const c of MOTION_FIELDS) {
    const b = await boot()
    await b.kernel.members.hire({ id: 'r-1', slot: 'member' })
    const step = await playTurn(b, 'r-1', { [c.field]: c.payload })
    ok(step && step.ok === true && Boolean(step.receipt), '§3a.' + c.field + ' 普通轮不再杀死整轮（receipt 存在）', step && step.code)
    const skipped = details(step, 'skippedDetail')
    const bad = skipped.find((s) => s && s.field === c.field)
    ok(Boolean(bad) && bad.reason === 'no-meeting-bound', '§3b.' + c.field + ' 具名跳过 reason=no-meeting-bound', bad && bad.reason)
    const executed = details(step, 'executedDetail')
    ok(!executed.some((d) => d && d.field === c.field), '§3c.' + c.field + ' 没有被假装提交为动议（executed 里没有它）', executed.map((d) => d.field))
    const notes = (step && step.receipt && Array.isArray(step.receipt.notes)) ? step.receipt.notes : []
    ok(notes.some((n) => n && n.field === c.field && n.kept === true), '§3d.' + c.field + ' 的原句留在 notes 里（kept:true），不是被扔掉', notes)
  }

  console.log('=== 4. 目录文本必须说机制现在做的事（旧句「会被具名跳过 VMU_TURN_FIELD_NOT_APPLICABLE」已不成立） ===')
  {
    // non-vacuous: MOTION_FIELDS is a four-element literal (see §3); each row must exist and be quoted here.
    for (const c of MOTION_FIELDS) {
      const r = row(c.field)
      const note = String((r && r.note) || '')
      ok(Boolean(r), '§4a.' + c.field + ' 在目录里有一行', Boolean(r))
      ok(note.includes('no-meeting-bound'), '§4b.' + c.field + ' 的 note 写明普通轮跳过方式是 no-meeting-bound', note.slice(0, 200))
      ok(note.includes('VMU_TURN_FIELD_NOT_APPLICABLE') === false, '§4c.' + c.field + ' 的 note 不再声称 VMU_TURN_FIELD_NOT_APPLICABLE（那是旧矛盾的出处）', note.slice(0, 200))
    }
    const createNote = String((row('task_create') && row('task_create').note) || '')
    ok(createNote.includes('title') && createNote.includes('blocked_by') && createNote.includes('write_scopes'),
      '§4d. task_create 的 note 教的键与内核适配器认的键一致', createNote)
  }

  console.log('=== 5. taskCreateArgs 是纯函数：映射分支与拒绝分支都可达 ===')
  {
    const mapped = kernelTurn.taskCreateArgs({ title: 'T', description: 'D', blocked_by: ['t-1'], write_scopes: ['src/y'] })
    ok(mapped && mapped.ok === true && Array.isArray(mapped.args) && mapped.args.length === 1, '§5a. 四键输入返回一组位置参数（映射分支可达）', mapped)
    const arg = mapped && mapped.args && mapped.args[0]
    ok(Boolean(arg) && arg.title === 'T' && arg.objective === 'D' && JSON.stringify(arg.deps) === JSON.stringify(['t-1']) && JSON.stringify(arg.writeScopes) === JSON.stringify(['src/y']),
      '§5b. 映射后的实参用的是内核真读的键名 objective/deps/writeScopes', arg)
    const noTitle = kernelTurn.taskCreateArgs({ description: 'D' })
    ok(noTitle && noTitle.ok === false && noTitle.reason === 'task-create-shape' && noTitle.missing.includes('title'),
      '§5c. 缺 title 是具名拒绝（拒绝分支可达）', noTitle && { reason: noTitle.reason, missing: noTitle.missing })
    const extra = kernelTurn.taskCreateArgs({ title: 'T', owner: 'r-1' })
    ok(extra && extra.ok === false && extra.missing.includes('owner') && String(extra.hint).includes('vibe_v5_task_create'),
      '§5d. 未知键（owner）被具名拒绝并指向工具面', extra && { missing: extra.missing, hint: String(extra.hint).slice(0, 120) })
    const notObj = kernelTurn.taskCreateArgs('just a string')
    ok(notObj && notObj.ok === false && notObj.reason === 'task-create-shape', '§5e. 非对象输入是具名拒绝而不是崩溃', notObj && notObj.reason)
    const skipMotion = kernelTurn.dispatchSkipReason({ field: 'motion', face: 'vmu.meetings', op: 'motion', payload: { text: 'x' } }, { boundMeeting: null })
    ok(Boolean(skipMotion) && skipMotion.reason === 'no-meeting-bound', '§5f. dispatchSkipReason 对无会议的 motion 给出 no-meeting-bound（纯函数可断言）', skipMotion)
    const skipSpeakKept = kernelTurn.dispatchSkipReason({ field: 'say', face: 'vmu.meetings', op: 'speak', payload: 'x' }, { boundMeeting: null })
    ok(Boolean(skipSpeakKept) && skipSpeakKept.reason === 'no-meeting-bound', '§5g. 旧的 say 跳过规则没有被新分支改掉（同一函数两条规则都在）', skipSpeakKept)
    const boundMotion = kernelTurn.dispatchSkipReason({ field: 'motion', face: 'vmu.meetings', op: 'motion', payload: { text: 'x' } }, { boundMeeting: 'm-1' })
    ok(boundMotion === null, '§5h. 有会议绑定时不跳过（新分支只处理「没有会议」这一种情形）', boundMotion)
  }
} finally {
  for (const root of roots) {
    try { await rm(root, { recursive: true, force: true, maxRetries: 5 }) } catch (e) { console.log('  note   temp dir kept: ' + root) }
  }
}

console.log('')
if (failed === 0) {
  console.log('=== VMU RUN145 AUDIT14 FIELDS: ' + passed + ' passed, 0 failed ===')
} else {
  console.log('=== VMU RUN145 AUDIT14 FIELDS: ' + passed + ' passed, ' + failed + ' failed ===')
  console.error('FAILURES:')
  for (const f of failures) console.error('  - ' + f)
  process.exit(1)
}

#!/usr/bin/env node
/**
 * ★★★ RUN 146 / audit15 C-1 — THE FOUR MOTION ROWS OF THE FULL CATALOGUE PROMISED A DELIVERY THE REPLY
 * CHANNEL CANNOT CARRY.
 *
 * THE DEFECT THIS SUITE PINS (measured by the auditor with a REAL meeting round):
 *   `v5r-reply-channel.js`'s full catalogue said 「会议轮投递为动议」 for `propose_verify`, `proposal`, `motion` and
 *   `propose_meeting`. In a meeting round the taught shape was silently skipped (`motion:no-meeting-bound`) and the skip
 *   note literally said "this turn has no meeting" — although the round WAS a meeting. A member cannot bind a meeting
 *   from the reply channel (top-level `meeting` => `VMU_TURN_UNKNOWN_FIELD`, the turn dies), so the promised delivery
 *   never happened; the only working payload (`{meeting,member,text}`) was taught nowhere.
 *
 * THE FIX THIS SUITE PINS (sentences changed, mechanism untouched):
 *   - the four rows now teach the tool `vibe_v5_motion { meeting, member, kind, text }` (run 147: `member` is REQUIRED
 *     by the tool, so the row must print it) and the explicit `{meeting,member,text}` payload, and say plainly that a
 *     reply carries NO meeting id (a meeting round is not enough);
 *   - the skip note now reads "this reply carries no meeting" and names both live routes;
 *   - G17: `v5r-core.js` no longer calls the real field `record` a 「自造字段」.
 *
 * WHAT THIS SUITE PROVES (each asserted against a REAL kernel round, not against a field name):
 *   §0 the full catalogue no longer promises channel delivery and names both live routes.
 *   §1 the skip note's wording is the honest one (and the old lie is gone).
 *   §2 a REAL meeting round: the explicit `{meeting,member,text}` payload really lands as a motion.
 *   §3 the tool route the rows teach really lands as a motion (spec.execute).
 *   §4 a meeting round with the shape-less payload: ok, skipped by name, line kept, round survives.
 *   §5 an ordinary round: same, and the taught text is exactly what happened (no regression of run145).
 *   §6 G17: the ad-hoc-field sentence no longer lists `record`.
 *
 * Run: node tests/vmu-run146-motion-catalogue.test.mjs   Last line: === VMU RUN146 MOTION CATALOGUE: N passed, M failed ===
 */
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { readFileSync } from 'node:fs'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..')
const ENTRY = pathToFileURL(join(REPO, 'vibe-math-vmu', 'vibe-math-vmu.js')).href
const TURN_MODULE = pathToFileURL(join(REPO, 'vibe-math-vmu', 'kernel', 'turn', 'index.js')).href
const REPLY_CHANNEL = pathToFileURL(join(REPO, 'vibe-math-vmu', 'packs', 'v5r', 'prompts', 'v5r-reply-channel.js')).href
const CORE = join(REPO, 'vibe-math-vmu', 'packs', 'v5r', 'prompts', 'v5r-core.js')

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
const boot = async (settings = {}) => {
  const root = await mkdtemp(join(tmpdir(), 'vmu-run146-motion-'))
  roots.push(root)
  const state = { specs: [] }
  const ctx = {
    effect(fn) { return fn() },
    on() { return () => {} },
    tools: { register: async (spec) => { state.specs.push(spec); return () => {} } },
  }
  await (async () => {
    const root2 = root
    const handle = entry.apply(ctx, Object.assign({ root: root2, packs: ['v5r'], clock: () => 1000, deliverMode: 'caller' }, settings))
    await handle.ready()
    state.handle = handle
  })()
  return { root, kernel: state.handle.kernel, names: state.specs.map((s) => s.name), specs: state.specs }
}
const NL = String.fromCharCode(10)
const fenced = (obj) => ['```json', JSON.stringify(obj), '```'].join(NL)
const row = (field) => decl.REPLY_FIELD_ROWS.find((r) => r.field === field)
const MOTION_ROWS = ['propose_verify', 'proposal', 'motion', 'propose_meeting']
const detailOf = (step, key) => (step && step.receipt && Array.isArray(step.receipt[key]) ? step.receipt[key] : [])
const notesOf = (step) => (step && step.receipt && Array.isArray(step.receipt.notes) ? step.receipt.notes : [])

try {
  console.log('=== 0. full 目录：四行动议不再承诺「会议轮投递」，并且点名两条活路 ===')
  {
    const full = decl.replyCatalogueLines({ mode: 'full', seat: null })
    const fullText = String(full)
    // non-vacuous: MOTION_ROWS is a four-element literal defined at the top of this file (see the §0 list).
    for (const field of MOTION_ROWS) {
      const r = row(field)
      ok(Boolean(r), '§0a ' + field + ' 行存在')
      const note = r ? String(r.note) : ''
      ok(!note.includes('会议轮投递为动议'), '§0b ' + field + ' 不再写「会议轮投递为动议」', note.slice(0, 120))
      ok(note.includes('vibe_v5_motion'), '§0c ' + field + ' 点名工具 vibe_v5_motion', note.slice(0, 160))
      // RUN 147 / audit16 G22: the tool REFUSES a payload without `member`, so the rows now teach the four-parameter
      // shape. Accepting only the old three-parameter text here is what let the taught shape drift from the tool.
      ok(note.includes('meeting, member, kind, text') || note.includes('{meeting, member, text'),
        '§0d ' + field + ' 点名显式载荷或工具形参（四参形）', note.slice(0, 160))
    }
    ok(fullText.includes('回执不带会议 id'), '§0e full 目录把「回执不带会议 id」写在行里')
    ok(!/会议轮投递为动议/.test(fullText), '§0f full 整目录里旧承诺 0 命中')
  }

  console.log('=== 1. skip note 的措辞是诚实的（会议轮里不许再说「this turn has no meeting」） ===')
  {
    const motionSkip = kernelTurn.dispatchSkipReason({ face: 'vmu.meetings', op: 'motion', payload: { kind: 'topic', text: 'x' } }, { boundMeeting: null })
    ok(Boolean(motionSkip) && motionSkip.reason === 'no-meeting-bound', '§1a 无会议引用的 motion 被具名跳过', motionSkip)
    ok(Boolean(motionSkip) && String(motionSkip.note).includes('this reply carries no meeting'), '§1b ★ note 说「this reply carries no meeting」', motionSkip && motionSkip.note)
    ok(Boolean(motionSkip) && !String(motionSkip.note).includes('this turn has no meeting'), '§1c ★★ 旧句子「this turn has no meeting」已删', motionSkip && motionSkip.note)
    ok(Boolean(motionSkip) && String(motionSkip.note).includes('vibe_v5_motion') && String(motionSkip.note).includes('{meeting, member, text}'),
      '§1d note 给出两条活路（工具 + 显式载荷）', motionSkip && motionSkip.note)
    const speakSkip = kernelTurn.dispatchSkipReason({ face: 'vmu.meetings', op: 'speak', payload: { text: 'x' } }, { boundMeeting: null })
    ok(Boolean(speakSkip) && speakSkip.reason === 'no-meeting-bound' && String(speakSkip.note).includes('this reply carries no meeting'),
      '§1e speak 分支同一措辞（会议轮不是「没有会议」）', speakSkip && speakSkip.note)
  }

  console.log('=== 2. 真会议轮：显式 {meeting,member,text} 真的投成动议 ===')
  {
    const b = await boot({ 'vmu.turn.replyCatalogue': 'full' })
    await b.kernel.members.hire({ id: 'r-chair', slot: 'chair' })
    await b.kernel.members.hire({ id: 'r-1', slot: 'member' })
    const opened = await b.kernel.meetings.open({ type: 'planning', member: 'r-chair', agenda: 'run146' })
    const mid = opened.meeting || opened.id
    const meetTool = b.specs.find((s) => s.name === 'vibe_vmu_meeting')
    await meetTool.execute({ action: 'attend', id: mid, member: 'r-1' }, {})
    const first = await b.kernel.turn.step({ members: ['r-1'], phase: 'meeting', why: 'run146 §2' })
    ok(Boolean(first) && first.awaiting === true, '§2a 真会议轮开得起来', first && first.awaiting)
    await b.kernel.turn.supplyMemberReply(fenced({ motion: { meeting: mid, member: 'r-1', text: '我提议换方向' } }), 'r-1')
    const step = await b.kernel.turn.step({ members: ['r-1'], phase: 'meeting', why: 'run146 §2' })
    ok(Boolean(step) && step.ok === true && Boolean(step.receipt), '§2b 会议轮回执存在（轮次没死）', step && step.code)
    const exec = detailOf(step, 'executedDetail').find((d) => d && d.field === 'motion')
    ok(Boolean(exec), '§2c ★★ 显式载荷的 motion 真的执行了（不是跳过）', detailOf(step, 'executedDetail').map((d) => d.field))
    ok(Boolean(exec) && exec.result && exec.result.ok !== false && typeof exec.result.motion === 'string',
      '§2d ★★★ 会议面回执给出 motion id（真实投递）', exec && exec.result)
  }

  console.log('=== 3. 目录教的工具路真的能投成动议（vibe_v5_motion） ===')
  {
    const b = await boot()
    await b.kernel.members.hire({ id: 'r-chair', slot: 'chair' })
    await b.kernel.members.hire({ id: 'r-1', slot: 'member' })
    const opened = await b.kernel.meetings.open({ type: 'planning', member: 'r-chair', agenda: 'run146 tool' })
    const mid = opened.meeting || opened.id
    ok(b.names.includes('vibe_v5_motion'), '§3a vibe_v5_motion 在部署的工具表里')
    const tool = b.specs.find((s) => s.name === 'vibe_v5_motion')
    ok(Boolean(tool) && tool.parameters && Array.isArray(tool.parameters.required) && tool.parameters.required.includes('meeting') && tool.parameters.required.includes('member'),
      '§3b 工具声明 meeting/member 是必填（与目录教的形参一致）', tool && tool.parameters)
    const res = await tool.execute({ meeting: mid, member: 'r-1', kind: 'topic', text: '目录教的这条路' }, {})
    const parsed = typeof res === 'string' ? JSON.parse(res) : res
    ok(Boolean(parsed) && parsed.ok === true && (typeof parsed.motion === 'string' || (parsed.receipt && parsed.receipt.motion)),
      '§3c ★★★ 工具路真的投成动议', parsed)
  }

  console.log('=== 4. 会议轮 + 无会议引用的形：具名跳过、原句保留、轮次照常完成 ===')
  {
    const b = await boot()
    await b.kernel.members.hire({ id: 'r-chair', slot: 'chair' })
    await b.kernel.members.hire({ id: 'r-1', slot: 'member' })
    const opened = await b.kernel.meetings.open({ type: 'planning', member: 'r-chair', agenda: 'run146 §4' })
    const mid = opened.meeting || opened.id
    const meetTool = b.specs.find((s) => s.name === 'vibe_vmu_meeting')
    await meetTool.execute({ action: 'attend', id: mid, member: 'r-1' }, {})
    await b.kernel.turn.step({ members: ['r-1'], phase: 'meeting', why: 'run146 §4' })
    await b.kernel.turn.supplyMemberReply(fenced({ motion: { kind: 'topic', text: '无引用的原句' } }), 'r-1')
    const step = await b.kernel.turn.step({ members: ['r-1'], phase: 'meeting', why: 'run146 §4' })
    ok(Boolean(step) && step.ok === true && Boolean(step.receipt), '§4a 轮次存活（旧缺陷不会杀轮也谈不上，这里证明不杀轮）', step && step.code)
    const skipped = detailOf(step, 'skippedDetail').find((d) => d && d.field === 'motion')
    ok(Boolean(skipped) && skipped.reason === 'no-meeting-bound', '§4b ★★ motion 被具名跳过 no-meeting-bound', skipped)
    const kept = notesOf(step).filter((n) => n && n.field === 'motion')
    ok(kept.length > 0, '§4c ★★ 原句留在 notes（没有被静默丢弃）', notesOf(step))
    ok(!detailOf(step, 'executedDetail').some((d) => d && d.field === 'motion'), '§4d executed 里没有 motion（确实没投）')
  }

  console.log('=== 5. 普通轮不回归（run145 基线） ===')
  {
    const b = await boot()
    await b.kernel.members.hire({ id: 'r-1', slot: 'member' })
    const first = await b.kernel.turn.step({ members: ['r-1'], phase: 'normal', why: 'run146 §5' })
    ok(Boolean(first) && first.awaiting === true, '§5a 普通轮开得起来')
    await b.kernel.turn.supplyMemberReply(fenced({
      propose_verify: { target: 'p-1', kind: 'verify-request', reason: 'r' },
      proposal: { text: 'p' },
      motion: { kind: 'topic', text: 'm' },
      propose_meeting: { agenda: 'a' },
    }), 'r-1')
    const step = await b.kernel.turn.step({ members: ['r-1'], phase: 'normal', why: 'run146 §5' })
    ok(Boolean(step) && step.ok === true && Boolean(step.receipt), '§5b 普通轮回执存在（不杀轮）', step && step.code)
    const skippedFields = detailOf(step, 'skippedDetail').filter((d) => d && MOTION_ROWS.includes(d.field))
    ok(MOTION_ROWS.length > 0 && skippedFields.length === MOTION_ROWS.length, '§5c ★ 四个动议字段都被具名跳过', skippedFields.map((d) => d.field + ':' + d.reason))
    ok(skippedFields.length > 0 && skippedFields.every((d) => d.reason === 'no-meeting-bound' || d.reason === 'no-supported-shape'),
      '§5d 跳过原因是具名的（no-meeting-bound / no-supported-shape）', skippedFields.map((d) => d.reason))
    ok(!detailOf(step, 'executedDetail').some((d) => d && MOTION_ROWS.includes(d.field)), '§5e executed 里没有四个动议字段')
  }

  console.log('=== 6. G17：活提示词不再把真字段 record 叫「自造字段」 ===')
  {
    const core = readFileSync(CORE, 'utf8')
    ok(!core.includes('record/artifacts'), '§6a 旧句「顶层不要写 record/artifacts」已删')
    ok(core.includes('record 与 progress 都是真字段'), '§6b 新句承认 record 与 progress 都是真字段')
    ok(core.includes('artifacts 等自造字段'), '§6c artifacts 仍被点名为自造字段')
  }
} catch (err) {
  failed++
  failures.push('uncaught: ' + (err && err.stack ? err.stack.split('\n')[0] : String(err)))
  console.error('  FAIL uncaught — ' + (err && err.stack ? err.stack : String(err)))
} finally {
  for (const r of roots) {
    try { await rm(r, { recursive: true, force: true, maxRetries: 5 }) } catch (e) { console.log('  note: cleanup skipped for ' + r) }
  }
}

console.log('=== VMU RUN146 MOTION CATALOGUE: ' + passed + ' passed, ' + failed + ' failed ===')
if (failed > 0) {
  console.log('failures:')
  for (const f of failures) console.log('  - ' + f)
  process.exit(1)
}

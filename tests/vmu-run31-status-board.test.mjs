// tests/vmu-run31-status-board.test.mjs — task-19: THE STATUS BOARD'S FOUR FIELDS, AND WHERE EACH ONE COMES FROM.
//
// THE DEFECT THIS PINS (P3 in `docs/acceptance/phase12-v5r-rules-conformance.md` §状态板四字段无来源, checked against the
// build rather than read off a prompt): the v5r rule (docs/acceptance/conformance/lane-rows-c.md §C3) requires every
// member's status board to cover ① 总任务 ② 规划 ③ 各任务完成状态 ④ 当前小任务, "with time information", and the
// mechanism produced only 「席位/轮次/阶段＋在册＋法定票数 m」. So a member could not answer "what is the goal, what
// happens next, who is doing what" from anything the loop handed it, and the board tool was not mentioned at all.
//
// THE FIX THIS FILE MEASURES is that all four fields are DERIVED FROM LEDGERS THAT ALREADY EXISTED — no new store:
//   总任务        ← setting `vmu.turn.objective`, else the task board's dependency-free ROOT tasks;
//   规划          ← `tasks.list()` unfinished work split into 可开工 / 被前置卡住 (with the ids it waits on);
//   各任务完成状态 ← `tasks.list()` counts per declared state;
//   当前小任务     ← `records.list({ track: 'progress' })`, the member's newest row (its `updatedAt` is the time info).
//
// THE OTHER HALF — HONESTY — is asserted in its own section: when a source cannot be read it must say WHICH source and
// WHY (「该来源未提供：<原因>」), because an empty label is exactly the defect class this row exists to delete. Both
// directions are exercised for every field, so neither "always unavailable" nor "always invented" can pass this file.
//
// ALSO PINNED: the read face went into the TURN LOOP's status block (where rule C3 puts the board, in the text every
// member receives each round), NOT into an eighth `vibe_vmu_board` action — that tool's enum is pinned one-for-one to
// the kernel board service by `tests/vmu-board-tool.test.mjs` §2, and a reading belongs to the loop, not the kanban
// service. The face map gains DECLARED read legs (`STATUS_BOARD_READ_OPS`) instead of a new tool name.

import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { createKernel } from '../vibe-math-vmu/kernel/index.js'
import { toolSpecs, TOOL_NAMES } from '../vibe-math-vmu/host.js'
import {
  createTurnOrchestrator, facesFrom, resolveOwners,
  STATUS_BOARD_FIELDS, STATUS_BOARD_READ_OPS, statusBoardReadings, renderStatusBoard, FIELD_OWNERS,
} from '../vibe-math-vmu/kernel/turn/index.js'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..')
void REPO

let passed = 0
let failed = 0
const failures = []
const ok = (cond, label, detail) => {
  if (cond) { passed++; console.log('  ok   ' + label); return true }
  failed++; failures.push(label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  console.error('  FAIL ' + label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  return false
}

const LABELS = ['[总任务]', '[规划]', '[各任务完成状态]', '[当前小任务]']
// The receipt's four keys are the rule's four facts; a rename in one place only would be a silent split between the
// declaration and the reader, so both are compared to this list.
const KEYS = ['objective', 'plan', 'tasks', 'current']
const lineOf = (text, label) => (text.split('\n').find((l) => l.startsWith(label)) || '')
const EMPTY_LABEL = /^\[[^\]]+\]\s*$/

const fakePrompt = () => ({
  // The pipeline only has to hand the assembled text back: the loop itself appends the status block when no section
  // rendered it, and THAT appended text is what this file reads.
  assemble: async (ctx) => ({ ok: true, text: 'PROMPT\n' + String(ctx.statusBlock || '') }),
})

const bootKernel = (config = {}) => createKernel({ clock: () => 1700000000000, settings: {}, ...config })

console.log('=== 0. THE FOUR FIELDS ARE DECLARED, WITH ONE NAMED SOURCE EACH ===')
{
  ok(STATUS_BOARD_FIELDS.length === 4 && JSON.stringify(STATUS_BOARD_FIELDS.map((f) => f.key)) === JSON.stringify(KEYS),
    '① the declaration lists exactly the rule\'s four facts, in the rule\'s order', { keys: STATUS_BOARD_FIELDS.map((f) => f.key) })
  ok(JSON.stringify(STATUS_BOARD_FIELDS.map((f) => f.label)) === JSON.stringify(['总任务', '规划', '各任务完成状态', '当前小任务']),
    '② and uses the rule\'s own four names, so a reader can match the board to the rule without translation')
  const everySource = STATUS_BOARD_FIELDS.every((f) => typeof f.source === 'string' && f.source.trim() !== '')
  ok(everySource, '③ every field names the ledger it is DERIVED from - the board adds no storage of its own',
    { sources: STATUS_BOARD_FIELDS.map((f) => f.source) })
  ok(JSON.stringify(STATUS_BOARD_READ_OPS['vmu.tasks']) === JSON.stringify(['list']) &&
    JSON.stringify(STATUS_BOARD_READ_OPS['vmu.records']) === JSON.stringify(['list', 'get']),
    '④ the read legs are DECLARED operations of the two kernel ledgers, not invented verbs', { readOps: STATUS_BOARD_READ_OPS })
}

console.log('\n=== 1. WITH DATA: EVERY FIELD IS DERIVED FROM THE LEDGER THAT OWNS IT ===')
const k = bootKernel()
const t1 = await k.tasks.create({ title: '证明引理 A', owner: 'r-1' })
const t2 = await k.tasks.create({ title: '写论文第 3 节', deps: [t1.id] })
const rec = k.records.put({ track: 'progress', kind: 'progress', title: '第 3 轮：引理 A 前半段', body: '证完了交换图的第一步；下一步补自然性。\n余下：自然性方块。', settled: true, by: 'r-1', bySource: 'argument' })
{
  const r = statusBoardReadings({ tasks: k.tasks, records: k.records, member: 'r-1' })
  ok(r.ok === true && r.fields.length === 4 && JSON.stringify(r.fields.map((f) => f.key)) === JSON.stringify(KEYS),
    '① the reading names all four fields even when they are all available', { fields: r.fields.map((f) => f.key) })
  ok(r.available === 4 && r.unavailable === 0,
    '② all four are available in a kernel that HAS a task board and one progress row', { available: r.available, unavailable: r.unavailable, fields: r.fields.map((f) => [f.key, f.value]) })
  ok(typeof r.objective.value === 'string' && r.objective.value.includes(t1.id) && r.objective.value.includes('证明引理 A'),
    '③ 总任务 falls back to the board\'s dependency-free ROOT task (t-1), since vmu.turn.objective is still the default',
    { objective: r.objective.value })
  ok(typeof r.plan.value === 'string' && r.plan.value.includes('可开工') && r.plan.value.includes('被前置卡住') &&
    r.plan.value.includes(t1.id) && r.plan.value.includes(t2.id),
    '④ 规划 splits the unfinished work into 可开工 and 被前置卡住, naming both tasks', { plan: r.plan.value })
  ok(typeof r.plan.value === 'string' && r.plan.value.includes('等 ' + t1.id),
    '⑤ and the blocked entry names the id it waits on, so "why can\'t I start" is answerable from the board', { plan: r.plan.value })
  // The counts come from the ledger's OWN declared states, not from a vocabulary this file invents: t-1 was created
  // WITH an owner (`owner:'r-1'` ⇒ state `assigned`), t-2 was created without one (⇒ `open`). Asserting the exact split
  // is what makes a re-labelled state show up as a failure instead of as a plausible-looking number.
  ok(typeof r.tasks.value === 'string' && r.tasks.value.includes('共 2 条') && r.tasks.value.includes('未结 2') &&
    r.tasks.value.includes('open 1') && r.tasks.value.includes('assigned 1'),
    '⑥ 各任务完成状态 counts per declared state over the same read (assigned 1 because t-1 was created with an owner)',
    { tasks: r.tasks.value })
  ok(typeof r.current.value === 'string' && r.current.value.includes(String(rec.id)) && r.current.value.includes('第 3 轮'),
    '⑦ 当前小任务 is THIS member\'s newest progress row (the records head list maps owner→author)', { current: r.current.value })
  ok(typeof r.current.at === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(r.current.at),
    '⑧ and it carries the TIME information the rule asks for (the row\'s updatedAt as an ISO stamp)', { at: r.current.at })
  ok(typeof r.current.value === 'string' && r.current.value.includes('自然性'),
    '⑨ the row is EXPANDED for one short excerpt, so the member sees what it actually wrote, not only the title',
    { current: r.current.value })
  const rendered = renderStatusBoard(r)
  ok(rendered.split('\n').length === 4 && LABELS.every((l) => rendered.includes(l)),
    '⑩ the rendered block is four labelled lines, one per fact', { rendered })
  ok(!rendered.split('\n').some((l) => EMPTY_LABEL.test(l)), '⑪ no line is a bare label (the defect class: a tag with nothing behind it)')
}

console.log('\n=== 2. THE SETTING IS THE 总任务 SOURCE WHEN THE OFFICE SETS IT ===')
{
  const r = statusBoardReadings({ tasks: k.tasks, records: k.records, member: 'r-1', settings: { 'vmu.turn.objective': '证明 Vibe-Mathematics 的核心引理' } })
  ok(r.objective.value === '证明 Vibe-Mathematics 的核心引理' && String(r.objective.source).includes('vmu.turn.objective'),
    '① the office\'s declared objective WINS over the root-task fallback, and the receipt names which source fired',
    { objective: r.objective, rootTask: t1.id })
  const view = { get: (key) => (key === 'vmu.turn.objective' ? '来自设置视图的目标' : undefined) }
  const r2 = statusBoardReadings({ tasks: k.tasks, records: k.records, member: 'r-1', settings: view })
  ok(r2.objective.value === '来自设置视图的目标',
    '② a settings VIEW (the `get` shape the kernel actually passes) is read the same way as a plain object', { objective: r2.objective.value })
  const r3 = statusBoardReadings({ tasks: k.tasks, records: k.records, member: 'r-1', settings: { 'vmu.turn.objective': '尚未设定' } })
  ok(typeof r3.objective.value === 'string' && r3.objective.value.includes(t1.id),
    '③ the DECLARED DEFAULT 「尚未设定」 is not a mission statement: it falls through to the board rather than being printed as the goal',
    { objective: r3.objective.value })
}

console.log('\n=== 3. WITH NO DATA: THE REASON IS NAMED, NEVER AN EMPTY LABEL ===')
{
  const empty = bootKernel({ clock: () => 1800000000000 })
  const r = statusBoardReadings({ tasks: empty.tasks, records: empty.records, member: 'r-9' })
  ok(r.ok === true && r.available === 0 && r.unavailable === 4,
    '① an empty kernel still returns four NAMED fields - unavailable is a fact, not an omission', { available: r.available, unavailable: r.unavailable })
  const whys = r.fields.map((f) => [f.key, f.value, f.why])
  ok(r.fields.length === 4 && r.fields.every((f) => f.value === null && typeof f.why === 'string' && f.why.trim() !== ''),
    '② every unavailable field carries a non-empty `why` - the reason is part of the reading', { whys })
  ok(typeof r.objective.why === 'string' && r.objective.why.includes('0 条') && r.objective.why.includes('尚未设定'),
    '③ 总任务 says the board is empty AND that the setting is still the default (both sources named)', { why: r.objective.why })
  ok(typeof r.plan.why === 'string' && r.plan.why.includes('任务板为空'),
    '④ 规划 says the board has no unfinished work rather than "no plan exists"', { why: r.plan.why })
  ok(typeof r.tasks.why === 'string' && r.tasks.why.includes('一条任务都没有'),
    '⑤ 各任务完成状态 says the board returned 0 rows (with the call it made)', { why: r.tasks.why })
  ok(typeof r.current.why === 'string' && r.current.why.includes('r-9') && r.current.why.includes('还没有记录'),
    '⑥ 当前小任务 names the member it looked for and says the progress track has no row for them', { why: r.current.why })
  const rendered = renderStatusBoard(r)
  const lines = rendered.split('\n')
  ok(lines.length === 4 && lines.every((l) => l.includes('该来源未提供：')),
    '⑦ the rendered block says 该来源未提供：<why> for all four (a bare label or a blank would fail here)', { rendered })
  ok(!lines.some((l) => EMPTY_LABEL.test(l)) && !/undefined|null/.test(rendered),
    '⑧ no empty label, and no literal undefined/null leaks into the text a model reads', { rendered })
}

console.log('\n=== 4. WITH AN UNREADABLE SOURCE: THE FAILURE IS NAMED, NOT MASKED ===')
{
  const noFaces = statusBoardReadings({ member: 'r-1' })
  ok(noFaces.available === 0 && typeof noFaces.tasks.why === 'string' && noFaces.tasks.why.includes('没有注入任务面'),
    '① with no task face at all, the field says the face is missing (not "the board is empty")', { why: noFaces.tasks.why })
  ok(typeof noFaces.current.why === 'string' && noFaces.current.why.includes('没有注入 records.list'),
    '② and the progress track is named the same way', { why: noFaces.current.why })
  const throwing = statusBoardReadings({ tasks: { list: () => { throw new Error('ledger offline') } }, records: { list: () => { throw new Error('records offline') } }, member: 'r-1' })
  ok(throwing.available === 0 && String(throwing.tasks.why).includes('ledger offline') && String(throwing.current.why).includes('records offline'),
    '③ a reader that THROWS is reported with its own message - a broken source cannot masquerade as an empty board',
    { tasks: throwing.tasks.why, current: throwing.current.why })
  const promiseReader = statusBoardReadings({ tasks: { list: async () => [] }, records: { list: async () => ({ items: [] }) }, member: 'r-1' })
  ok(promiseReader.available === 0 && String(promiseReader.tasks.why).includes('Promise'),
    '④ an async reader is reported as unreadable (the board is a synchronous read of two synchronous ledgers)',
    { why: promiseReader.tasks.why })
  const noMember = statusBoardReadings({ tasks: k.tasks, records: k.records, member: null })
  ok(noMember.current.value === null && String(noMember.current.why).includes('未指定成员'),
    '⑤ without a member id 当前小任务 says so instead of guessing someone else\'s row', { why: noMember.current.why })
  const otherMember = statusBoardReadings({ tasks: k.tasks, records: k.records, member: 'r-2' })
  ok(otherMember.current.value === null && String(otherMember.current.why).includes('r-2'),
    '⑥ a member with no progress row of their own does NOT inherit the r-1 row (attribution by the ledger\'s author)',
    { why: otherMember.current.why })
}

console.log('\n=== 4b. THE "MOST RECENT" ROW IS CHOSEN BY TIME, NOT BY LIST ORDER ===')
{
  // The ledger's `headSort` is deployable and its clock may emit an epoch number OR an ISO string, so "most recent" has
  // to be a comparison, not "the last item" and not `Number(updatedAt)` (which is NaN for every ISO stamp and would
  // leave the choice to whatever order the ledger returned). The newest row here is in the MIDDLE and is an epoch.
  const NEWEST_MS = Date.parse('2026-10-26T09:00:00.000Z')
  const mixed = {
    items: [
      { id: 'p-a', title: '旧的（ISO）', owner: 'r-1', updatedAt: '2026-10-20T10:00:00.000Z' },
      { id: 'p-b', title: '最新（epoch 数字）', owner: 'r-1', updatedAt: NEWEST_MS },
      { id: 'p-c', title: '时间不可解析', owner: 'r-1', updatedAt: 'not-a-time' },
    ],
  }
  const readMixed = () => mixed
  const r = statusBoardReadings({ tasks: k.tasks, records: { list: readMixed, get: () => null }, member: 'r-1' })
  ok(typeof r.current.value === 'string' && r.current.value.startsWith('p-b「最新（epoch 数字）」'),
    '① the row with the LATEST parseable stamp wins even when the ledger returns it in the middle', { current: r.current.value })
  ok(typeof r.current.value === 'string' && !r.current.value.includes('p-c'),
    '② an unparseable stamp never wins the "most recent" comparison (it sorts as unknown, it is not treated as now)', { current: r.current.value })
  ok(r.current.at === new Date(NEWEST_MS).toISOString(),
    '③ the time info is NORMALISED to an ISO instant, so a numeric-clock deployment still renders a readable time', { at: r.current.at })
  const isoNewestFirst = { items: [
    { id: 'p-d', title: '较新（ISO）', owner: 'r-1', updatedAt: '2026-10-25T09:00:00.000Z' },
    { id: 'p-e', title: '较旧（ISO）', owner: 'r-1', updatedAt: '2026-10-21T09:00:00.000Z' },
  ] }
  const r2 = statusBoardReadings({ tasks: k.tasks, records: { list: () => isoNewestFirst }, member: 'r-1' })
  ok(typeof r2.current.value === 'string' && r2.current.value.startsWith('p-d「较新（ISO）」'),
    '④ ISO stamps compare as instants too (this is the case `Number(updatedAt)` got wrong for BOTH rows)', { current: r2.current.value })
}

console.log('\n=== 5. THE READ LEGS COME FROM THE FACE MAP, SO A REAL KERNEL NEEDS NO WIRING ===')
{
  const faces = facesFrom(k)
  ok(typeof faces['vmu.tasks'] === 'object' && typeof faces['vmu.tasks'].list === 'function' && typeof faces['vmu.tasks'].create === 'function',
    '① the face map carries the DECLARED read leg beside the write operation it already had', { ops: Object.keys(faces['vmu.tasks'] || {}) })
  ok(typeof faces['vmu.records'].list === 'function' && typeof faces['vmu.records'].get === 'function' && typeof faces['vmu.records'].put === 'function',
    '② same for records: list/get added, put kept', { ops: Object.keys(faces['vmu.records'] || {}) })
  // The invariant is "the read legs are ADDITIVE": every write op whose owning instance is actually present must still
  // be bound exactly as before. The instance (not FIELD_OWNERS alone) decides what "present" means, because a bare
  // `createKernel` does not carry every face a full deployment does (notably `vmu.library`, whose `record` op is
  // therefore unbound BEFORE and AFTER this change - a pre-existing gap this file must not silently bless as a rule).
  const instanceOf = (face) => {
    const bag = k[String(face)] !== undefined ? k[String(face)] : k[String(face).replace(/^vmu\./, '')]
    if (!bag) return null
    return typeof bag === 'function' ? null : bag
  }
  const carried = Object.values(FIELD_OWNERS).filter((o) => {
    const instance = instanceOf(o.face)
    return instance && typeof instance[o.op] === 'function'
  })
  const dropped = carried.filter((o) => !faces[o.face] || typeof faces[o.face][o.op] !== 'function')
  ok(carried.length >= 8 && dropped.length === 0,
    '③ every WRITE operation whose face this kernel carries is still bound (the read legs replace nothing)',
    { carried: carried.map((o) => [o.face, o.op]), dropped: dropped.map((o) => [o.face, o.op]) })
  ok(typeof faces['vmu.tasks'].create === 'function' && typeof faces['vmu.records'].put === 'function' &&
    typeof faces['vmu.meetings'].speak === 'function' && typeof faces['vmu.ballotbox'].cast === 'function',
    '③b and the named write verbs the reply catalogue dispatches to are individually still there, not just "some function"',
    { tasks: Object.keys(faces['vmu.tasks'] || {}), records: Object.keys(faces['vmu.records'] || {}) })
  ok(typeof resolveOwners({ task_create: { face: 'vmu.tasks', op: 'list' } }).task_create === 'object',
    '④ a per-field override still resolves (the override hook is untouched by this change)')
  const noServices = facesFrom({})
  ok(Object.keys(noServices).length === 0, '⑤ a bag with neither ledger binds nothing - no invented faces', { keys: Object.keys(noServices) })
}

console.log('\n=== 6. END TO END: THE TURN\'S STATUS BLOCK CARRIES THE FOUR FIELDS ===')
{
  const loop = createTurnOrchestrator({ prompt: fakePrompt(), faces: facesFrom(k), clock: () => 1700000000000 })
  const opened = loop.open({ member: 'r-1', role: 'researcher', roleLabel: '常驻研究员', phase: 'normal', round: 3 })
  const asm = await loop.assemble(opened.turn)
  ok(asm.ok === true && typeof asm.text === 'string' && asm.text.length > 0, '① a turn assembles with the loop\'s own status block')
  ok(LABELS.every((l) => asm.text.includes(l)),
    '② the assembled PROMPT carries all four labels - the member does not have to call a tool to know the goal', { labels: LABELS.map((l) => asm.text.includes(l)) })
  ok(asm.text.includes(t1.id + '「证明引理 A」') && asm.text.includes('可开工'),
    '③ and it carries the REAL task board (this kernel\'s root task and the ready/blocked split), not a placeholder', {
      objectiveLine: lineOf(asm.text, '[总任务]'), planLine: lineOf(asm.text, '[规划]'),
    })
  ok(asm.text.includes('[状态板]') && asm.text.includes('[状态] 你是 常驻研究员「r-1」'),
    '④ the four fields extend the existing block (seat/round/phase line and [状态板] header travel together)')
  ok(!asm.text.split('\n').filter((l) => LABELS.some((lab) => l.startsWith(lab))).some((l) => EMPTY_LABEL.test(l)),
    '⑤ no empty label reaches the model')
}

console.log('\n=== 7. A CALLER-SUPPLIED statusBlock WINS, AND THEN NOTHING IS READ ===')
{
  let readCalls = 0
  const spyFaces = {
    'vmu.tasks': { list: () => { readCalls += 1; return [] }, create: async () => ({ ok: true }) },
    'vmu.records': { list: () => { readCalls += 1; return { items: [] } }, put: async () => ({ ok: true }) },
  }
  const loop = createTurnOrchestrator({ prompt: fakePrompt(), faces: spyFaces })
  const asm = await loop.assemble(loop.open({ member: 'r-1', phase: 'normal', statusBlock: 'STATUS-FROM-THE-PACK' }).turn)
  ok(asm.text.includes('STATUS-FROM-THE-PACK') && readCalls === 0,
    '① the pack\'s own brief is used verbatim and the ledgers are not touched (byte-identical behaviour for pack-supplied blocks)',
    { readCalls })
  ok(!asm.text.includes('[状态板]'), '② the loop does not bolt its own board onto a caller\'s block', { text: asm.text.slice(0, 120) })
}

console.log('\n=== 8. THE statusSources SEAM OWNS THE BOARD WHEN A CALLER HANDS ONE OVER ===')
{
  const loop = createTurnOrchestrator({
    prompt: fakePrompt(),
    faces: facesFrom(k),
    statusSources: ({ member, turn }) => statusBoardReadings({ tasks: k.tasks, records: k.records, member, settings: { 'vmu.turn.objective': 'seam:' + String(turn.member) } }),
  })
  const asm = await loop.assemble(loop.open({ member: 'r-1', phase: 'normal' }).turn)
  ok(asm.text.includes('seam:r-1'), '① a sync function source is used as-is', { line: lineOf(asm.text, '[总任务]') })
  const asyncLoop = createTurnOrchestrator({
    prompt: fakePrompt(), faces: {},
    statusSources: async () => statusBoardReadings({ member: 'r-1' }),
  })
  const asm2 = await asyncLoop.assemble(asyncLoop.open({ member: 'r-1', phase: 'normal' }).turn)
  ok(asm2.ok === true && asm2.text.includes('该来源未提供：'), '② an async source is awaited and its honest gaps are rendered')
  const bagLoop = createTurnOrchestrator({ prompt: fakePrompt(), faces: {}, statusSources: { tasks: k.tasks, records: k.records } })
  const asm3 = await bagLoop.assemble(bagLoop.open({ member: 'r-1', phase: 'normal' }).turn)
  ok(asm3.text.includes(t1.id + '「证明引理 A」'),
    '③ a {tasks, records} BAG works too, so a deployment can inject the two ledgers without touching the loop', { line: lineOf(asm3.text, '[总任务]') })

  // A source that throws is a NAMED refusal (the noticeSource precedent), never a silently empty board.
  const broken = createTurnOrchestrator({ prompt: fakePrompt(), faces: {}, statusSources: () => { throw new Error('board service crashed') } })
  let code = null; let message = ''
  try { await broken.assemble(broken.open({ member: 'r-1', phase: 'normal' }).turn) } catch (e) { code = e && e.code; message = String((e && e.message) || '') }
  ok(code === 'VMU_ENGINE_UNAVAILABLE' && message.includes('board service crashed'),
    '④ a throwing source is refused BY NAME with its own message - a board nobody produced is never rendered', { code, message })
  const shapeless = createTurnOrchestrator({ prompt: fakePrompt(), faces: {}, statusSources: async () => ({ nope: true }) })
  let code2 = null
  try { await shapeless.assemble(shapeless.open({ member: 'r-1', phase: 'normal' }).turn) } catch (e) { code2 = e && e.code }
  ok(code2 === 'VMU_ENGINE_UNAVAILABLE',
    '⑤ a source that returns the wrong shape is refused too, so a half-filled board cannot pass as a reading', { code2 })
}

console.log('\n=== 9. THE FACE WENT INTO THE LOOP, NOT INTO A NEW TOOL ===')
{
  const names = Object.values(TOOL_NAMES).map(String)
  ok(!names.some((n) => /status.?board|boardstatus/i.test(n)),
    '① no new tool name was minted (a new name would drag face/member-scope/prompt/installer derivations)', { names })
  const specs = toolSpecs({ kernel: k, settings: {}, boardTool: true })
  const boardSpec = specs.find((s) => s.name === TOOL_NAMES.board)
  const enumNow = boardSpec && boardSpec.parameters && boardSpec.parameters.action && boardSpec.parameters.action.enum
  ok(Array.isArray(enumNow) && enumNow.length === 7 && !enumNow.includes('statusBoard'),
    '② the board tool enum is UNCHANGED: tests/vmu-board-tool.test.mjs §2 pins it one-for-one to the kernel board service, ' +
    'so the reading belongs to the loop rather than to an eighth kanban action', { enum: enumNow })
  const kernelBoardOps = Object.keys(k.board).filter((n) => typeof k.board[n] === 'function').sort()
  ok(JSON.stringify([...enumNow].sort()) === JSON.stringify(kernelBoardOps),
    '③ and the pinned invariant still holds after this change', { enumNow, kernelBoardOps })
  const declared = renderStatusBoard(statusBoardReadings({ tasks: k.tasks, records: k.records, member: 'r-1' }))
  ok(declared.includes('[各任务完成状态]') && declared.includes('[当前小任务]'),
    '④ the two fields the pack prompt never named are labelled in the framework\'s own wording (no pack needed)', { declared })
}

console.log('\n=== VMU RUN 31 STATUS BOARD: ' + passed + ' passed, ' + failed + ' failed ===')
if (failed > 0) { for (const f of failures) console.error('  - ' + f); process.exit(1) }

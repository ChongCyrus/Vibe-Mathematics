// tests/vmu-run111-board-own-share.test.mjs — AUDIT HOLE D1 (rule 26 "各自推进各自的总任务").
//
// WHY THIS FILE EXISTS: the four-row status board answered ② (规划) and ③ (各任务完成状态) from ONE institute-wide
// reading for every member, while the v5r prompt taught each member "`[总任务]` 是「你」的总任务：每人各自推进各自的".
// Two members therefore saw byte-identical plan/completion rows and could not find their own slice; the only row that
// was member-scoped was ④ (the caller's newest progress record). The fix prints the CALLER'S OWN SLICE FIRST on ②/③
// and makes ① say it is the institute's single copy — so "各自" is a reading, not a promise.
//
// Measured from the public reader (`statusBoardReadings` / `renderStatusBoard`), never from prose. The institute view
// (no `member`) must stay byte-identical: the office's board IS the institute's board.

import { statusBoardReadings, renderStatusBoard } from '../vibe-math-vmu/kernel/turn/index.js'

let passed = 0
let failed = 0
const failures = []
const ok = (cond, label, detail) => {
  if (cond) { passed++; console.log('  ok   ' + label); return true }
  failed++; failures.push(label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  console.error('  FAIL ' + label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  return false
}

const TASKS = Object.freeze([
  { id: 't-1', title: '把主定理拆成引理', state: 'doing', owner: 'r-1', deps: [] },
  { id: 't-2', title: '找反例', state: 'open', owner: 'r-2', deps: [] },
  { id: 't-3', title: '写引理 3 的证明', state: 'open', owner: 'r-1', deps: ['t-1'] },
  { id: 't-4', title: '整理参考文献', state: 'done', owner: 'r-2', deps: [] },
])
const tasks = { list: () => TASKS.map((r) => ({ ...r })) }
const rows = [
  { id: 'rec-1', track: 'progress', owner: 'r-1', title: '引理 3 进度', updatedAt: '2026-10-28T06:20:12.000Z', createdAt: '2026-10-28T06:20:12.000Z' },
  { id: 'rec-2', track: 'progress', owner: 'r-2', title: '反例搜索', updatedAt: '2026-10-28T06:21:00.000Z', createdAt: '2026-10-28T06:21:00.000Z' },
]
const records = {
  list: (q = {}) => (q && q.track && q.track !== 'progress' ? [] : rows.map((r) => ({ ...r }))),
  get: ({ id }) => ({ body: rows.find((r) => r.id === id)?.title || '' }),
}
const settings = { 'vmu.turn.objective': '证出主定理' }
const read = (member) => statusBoardReadings({ tasks, records, member, settings, at: '2026-10-28T06:30:00.000Z' })
const fieldOf = (r, key) => (r.fields || []).find((f) => f.key === key) || {}

// ── §1 the caller's own slice comes FIRST on ② ──────────────────────────────────────────────────────────────────
{
  const a = read('r-1')
  const plan = fieldOf(a, 'plan')
  const value = String(plan.value || '')
  ok(value.startsWith('你的（r-1'), '§1.1 ② leads with the caller\'s own slice', value)
  ok(value.includes('t-1') && !/t-2（/.test(value.split('｜全所')[0] || ''), '§1.2 the own slice lists r-1\'s tasks, not r-2\'s',
    value.split('｜全所')[0])
  ok(value.includes('全所：未完成'), '§1.3 the institute total is still printed after the own slice', value)
  const b = read('r-2')
  const valueB = String(fieldOf(b, 'plan').value || '')
  ok(valueB !== value, '§1.4 two members read two different plans (the old board gave one)', { r1: value, r2: valueB })
  ok(valueB.startsWith('你的（r-2') && valueB.includes('t-2'), '§1.5 r-2 sees its own share', valueB)
}

// ── §2 ③ counts the caller's own states before the institute's ───────────────────────────────────────────────────
{
  const a = read('r-1')
  const tasks3 = String(fieldOf(a, 'tasks').value || '')
  ok(tasks3.startsWith('属于你（r-1）'), '§2.1 ③ leads with the caller\'s own counts', tasks3)
  ok(tasks3.includes('属于你（r-1）2 条'), '§2.2 the own count is the ledger\'s (r-1 owns t-1/t-3)', tasks3)
  ok(tasks3.includes('｜全所：共 4 条'), '§2.3 the institute totals follow', tasks3)
  const b = read('r-2')
  ok(String(fieldOf(b, 'tasks').value || '').includes('属于你（r-2）2 条'), '§2.4 r-2\'s own count is its own (t-2/t-4)',
    fieldOf(b, 'tasks').value)
}

// ── §3 ① says whose value it is ──────────────────────────────────────────────────────────────────────────────────
{
  const a = read('r-1')
  const objective = fieldOf(a, 'objective')
  ok(typeof objective.scopeNote === 'string' && objective.scopeNote.includes('全所总任务'),
    '§3.1 ① carries a scopeNote naming it as the institute\'s single copy', objective)
  const rendered = renderStatusBoard(a)
  ok(rendered.includes('全所总任务，内核只有一份'), '§3.2 the renderer prints the scope note', rendered.split('\n')[0])
  ok(rendered.includes('你的（r-1'), '§3.3 the rendered block carries the own slice', rendered)
}

// ── §4 a member with NO assigned task still gets an honest line ──────────────────────────────────────────────────
{
  const a = read('r-acad')
  const plan = String(fieldOf(a, 'plan').value || '')
  ok(plan.startsWith('你的（r-acad）'), '§4.1 a member with no tasks still leads with its own (empty) slice', plan)
  ok(plan.includes('没有分派给你且未完成的任务'), '§4.2 the empty slice says so in words, not by omission', plan)
  const tasks3 = String(fieldOf(a, 'tasks').value || '')
  ok(tasks3.includes('属于你（r-acad）0 条'), '§4.3 the count line names zero rather than dropping the member', tasks3)
}

// ── §5 the INSTITUTE view (no member) is unchanged: no own-slice text, and two reads are byte-identical ──────────
{
  const a = read(null)
  const b = read(null)
  const plan = String(fieldOf(a, 'plan').value || '')
  const tasks3 = String(fieldOf(a, 'tasks').value || '')
  ok(!plan.includes('你的（'), '§5.1 the office board has no member slice', plan)
  ok(!tasks3.includes('属于你（'), '§5.2 the office board has no member counts', tasks3)
  ok(!fieldOf(a, 'objective').scopeNote, '§5.3 the office board does not claim a scope note', fieldOf(a, 'objective'))
  ok(JSON.stringify(a.fields) === JSON.stringify(b.fields), '§5.4 the board is a pure read: same input, same fields')
  ok(JSON.stringify(a.fields) === JSON.stringify(statusBoardReadings({ tasks, records, settings, at: '2026-10-28T06:30:00.000Z' }).fields),
    '§5.5 the institute view needs no `member` to be complete')
}

// ── §6 ④ stays what it was: the caller's newest progress record ─────────────────────────────────────────────────
{
  const a = read('r-1')
  const current = String(fieldOf(a, 'current').value || '')
  ok(current.includes('rec-1'), '§6.1 ④ is still the caller\'s newest progress record', current)
  ok(!current.includes('rec-2'), '§6.2 and not another member\'s', current)
}

console.log('\n=== VMU RUN 111 BOARD OWN SHARE: ' + passed + ' passed, ' + failed + ' failed ===')
if (failed > 0) {
  console.error(failures.join('\n'))
  process.exit(1)
}

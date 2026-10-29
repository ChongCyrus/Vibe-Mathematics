// tests/vmu-d1-d5-board-times.test.mjs — D5 (every board row answers about TIME) and D1 (ONE spelling for "your share").
//
// WHY THIS FILE EXISTS (both defects were measured against the running code, not inferred from prose):
//
//   D5. Rule D5 says the status board is a READING, so every row must say WHEN it was read - or say BY NAME why there is
//       no time. `statusBoardReadings` only gave `timeWhy` to ① 总任务; ② 规划 and ③ 各任务完成状态 were built with
//       `at: readAt` and the ONE production caller passes no `at` (ROUND 102 forbids printing the read clock on the
//       prompt path, so a prompt stays diffable), so those two rows rendered with NEITHER `（读于 …）` NOR
//       `（时间未提供：…）`. "I have no time" and "I did not print a time" read identically - exactly the silence the
//       rule exists to forbid. The fix is STRUCTURAL: one `stampedTime(row, at, why)` helper is the only writer of
//       either field and every row (plus any row a future edit adds) leaves through it.
//
//   D1. The pack prompt teaches members to find their own share as `属于你（<member>，未完成 N 条）`, but ② rendered
//       `你的（r-1，未完成 N 条）` while ③ rendered `属于你（…）`: one idea, two spellings, so a member had to
//       translate between two adjacent lines. Both rows now build their lead-in from ONE helper with the SAME count.
//
// WHAT IS PINNED HERE:
//   §1 `at: null`  ⇒ all four rows carry `timeWhy` and none carries `at`, and every rendered line names the absence.
//   §2 `at` given  ⇒ all four rows carry that time and no row carries `timeWhy`; a settings-derived ① is the ONE
//                    deliberate exception (configuration has no content timestamp - it must not borrow the clock).
//   §3 two members see `属于你（<their id>，未完成 N 条）` on BOTH ② and ③, and the OFFICE view (no `member`) is
//      byte-identical to the output captured BEFORE this change.
//   §4 a member with zero owned tasks reads `属于你（<id>，未完成 0 条` on both rows and the all-office total still prints.
//
// A test file must be able to FAIL: every `.every` below is guarded by a non-empty assertion, and each section asserts
// the POSITIVE (the field is there) and the NEGATIVE (the other field is not), so neither "always timeWhy" nor
// "always at" can pass.

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

const AT = '2026-10-28T06:30:00.000Z'
const TASKS = Object.freeze([
  { id: 't-1', title: '把主定理拆成引理', state: 'doing', owner: 'r-1', deps: [] },
  { id: 't-2', title: '找反例', state: 'open', owner: 'r-2', deps: [] },
  { id: 't-3', title: '写引理 3 的证明', state: 'open', owner: 'r-1', deps: ['t-1'] },
  { id: 't-4', title: '整理参考文献', state: 'done', owner: 'r-2', deps: [] },
])
const tasks = { list: () => TASKS.map((r) => ({ ...r })) }
const STAMPED = [
  { id: 'rec-1', track: 'progress', owner: 'r-1', title: '引理 3 进度', updatedAt: '2026-10-28T06:20:12.000Z' },
  { id: 'rec-2', track: 'progress', owner: 'r-2', title: '反例搜索', updatedAt: '2026-10-28T06:21:00.000Z' },
]
// A progress row whose writer never stamped it: this is the case in which ④ has no CONTENT time either, so it must
// say so - the board is not allowed to borrow the read clock for it.
const UNSTAMPED = [{ id: 'rec-x', track: 'progress', owner: 'r-1', title: '没有回报时间的进度' }]
const recordsOf = (rows) => ({
  list: (q = {}) => (q && q.track && q.track !== 'progress' ? [] : rows.map((r) => ({ ...r }))),
  get: ({ id }) => ({ body: (rows.find((r) => r.id === id) || {}).title || '' }),
})
const records = recordsOf(STAMPED)
const fieldOf = (r, key) => (r.fields || []).find((f) => f.key === key) || {}
const read = (extra = {}) => statusBoardReadings({ tasks, records, member: 'r-1', at: AT, ...extra })

// ── §1 `at: null` (the production prompt path): EVERY row says why it has no content time ────────────────────────
{
  // ① comes from a settings key (configuration, no updatedAt), ④ from a record that never stamped itself, ②/③ are
  // derived from the task board: NONE of the four has a content timestamp, which is exactly the production shape.
  const r = statusBoardReadings({
    tasks, records: recordsOf(UNSTAMPED), member: 'r-1', settings: { 'vmu.turn.objective': '证出主定理' },
  })
  const fields = Array.isArray(r.fields) ? r.fields : []
  ok(fields.length === 4, '§1.0 the board still returns its four rows', fields.map((f) => f.key))
  ok(fields.length > 0 && fields.every((f) => typeof f.timeWhy === 'string' && f.timeWhy.trim() !== ''),
    '§1.1 with at:null EVERY row names why it has no content time', fields.map((f) => [f.key, f.timeWhy]))
  ok(fields.length > 0 && fields.every((f) => f.at === null),
    '§1.2 ...and none borrows a read stamp it does not have', fields.map((f) => [f.key, f.at]))
  ok(fields.length > 0 && fields.every((f) => (f.at !== null) !== (typeof f.timeWhy === 'string' && f.timeWhy.trim() !== '')),
    '§1.3 exactly one of at/timeWhy is set on every row (never both, never neither)',
    fields.map((f) => [f.key, f.at, f.timeWhy]))

  const rowObjects = [r.objective, r.plan, r.tasks, r.current]
  ok(rowObjects.length === 4 && rowObjects.every((row) => row && row.at === null &&
    typeof row.timeWhy === 'string' && row.timeWhy.trim() !== ''),
    '§1.4 the row OBJECTS themselves carry timeWhy (not only the frozen fields)',
    rowObjects.map((row) => row && [row.key, row.at, row.timeWhy]))

  const lines = String(renderStatusBoard(r)).split('\n')
  ok(lines.length === 4 && lines.every((l) => l.includes('时间未提供：')),
    '§1.5 every rendered line prints （时间未提供：…） - the defect was ② and ③ printing NEITHER form', lines)
  ok(!lines.some((l) => l.includes('读于 ')), '§1.6 ...and no line claims a read time')
  ok(lines[0].includes('设置键没有内容时间戳'), '§1.7 ① names the settings key as its reason')
  ok(lines[1].includes('规划是按当前任务板现算的读数'),
    '§1.8 ② names the task-board derivation as its reason (the exact line that used to say nothing)', lines[1])
  ok(lines[2].includes('各任务完成状态是按当前任务板现算的计数'),
    '§1.9 ③ names the task-board derivation as its reason (the exact line that used to say nothing)', lines[2])
  ok(lines[3].includes('没有回报 updatedAt'), '§1.10 ④ names the record as its reason')
}

// ── §2 `at` given: every row carries the time it was read, and no row needs an absence ───────────────────────────
{
  // ① derives from the board's root tasks (no settings key), so every one of the four has a content-or-read time.
  const r = read()
  const rowObjects = [r.objective, r.plan, r.tasks, r.current]
  ok(rowObjects.length === 4 && rowObjects.every((row) => typeof row.at === 'string' && row.at.trim() !== ''),
    '§2.1 with `at` given EVERY row carries a time', rowObjects.map((row) => [row.key, row.at]))
  ok(rowObjects.length === 4 && rowObjects.every((row) => !Object.prototype.hasOwnProperty.call(row, 'timeWhy')),
    '§2.2 ...and no row carries timeWhy: the two fields are exclusive', rowObjects.map((row) => [row.key, row.timeWhy]))

  const fields = Array.isArray(r.fields) ? r.fields : []
  ok(fields.length === 4 && fields.every((f) => typeof f.at === 'string' && f.at.trim() !== '' && f.timeWhy === undefined),
    '§2.3 the frozen fields carry the same, so the renderer cannot lose it', fields.map((f) => [f.key, f.at, f.timeWhy]))
  const lines = String(renderStatusBoard(r)).split('\n')
  ok(lines.length === 4 && lines.every((l) => l.includes('（读于 ')), '§2.4 every rendered line prints its time', lines)
  ok(!lines.some((l) => l.includes('时间未提供：')), '§2.5 ...and none says time is missing')
  ok(lines[3].includes('2026-10-28T06:20:12.000Z'),
    '§2.6 ④ keeps the RECORD stamp (its content time), not the board clock', lines[3])

  // §2.7 THE ONE DELIBERATE EXCEPTION: a settings value is CONFIGURATION. It has no content timestamp, so even when the
  // caller supplies `at` it must NOT borrow that clock - it names the absence instead (the rule: never invent a time).
  const s = read({ settings: { 'vmu.turn.objective': '证出主定理' } })
  ok(s.objective.at === null && typeof s.objective.timeWhy === 'string' && s.objective.timeWhy.includes('设置键没有内容时间戳'),
    '§2.7 a settings-derived ① does NOT borrow the board clock: it names the absence', { at: s.objective.at, timeWhy: s.objective.timeWhy })
  ok(String(fieldOf(s, 'plan').at) === AT && String(fieldOf(s, 'tasks').at) === AT,
    '§2.8 ...while the two task-board rows still carry the read time')
}

// ── §3 ONE spelling: `属于你（<member>，未完成 N 条）` on BOTH ② and ③; office view byte-identical ────────────────
// Captured from the code BEFORE this change, for this exact fixture (`STAMPED` records, no settings, `AT` given). The
// office board is the institute's board: the own-share work must not alter one byte of it.
const OFFICE_VIEW = [
  '[总任务] t-1「把主定理拆成引理」；t-2「找反例」（来源：任务板（无依赖的根任务 2 条））（读于 2026-10-28T06:30:00.000Z）',
  '[规划] 可开工：t-1「把主定理拆成引理」（r-1）；t-2「找反例」（r-2）；被前置卡住：t-3「写引理 3 的证明」（等 t-1）（来源：任务板（未完成 3 条））（读于 2026-10-28T06:30:00.000Z）',
  '[各任务完成状态] 共 4 条（未结 3）：open 2 · doing 1 · done 1（来源：任务板（按状态的计数））（读于 2026-10-28T06:30:00.000Z）',
  '[当前小任务] 该来源未提供：未指定成员：没有成员 id，无法定位「该成员最近的 progress 记录」',
].join('\n')
{
  const a = read()
  const planA = String(a.plan.value || '')
  const tasksA = String(a.tasks.value || '')
  ok(planA.startsWith('属于你（r-1，未完成 2 条）：'), '§3.1 r-1 reads the taught prefix on ②', planA)
  ok(tasksA.startsWith('属于你（r-1，未完成 2 条）：'), '§3.2 r-1 reads the SAME prefix on ③', tasksA)
  const planLead = planA.slice(0, planA.indexOf('：'))
  const tasksLead = tasksA.slice(0, tasksA.indexOf('：'))
  ok(planLead === tasksLead && planLead.includes('r-1'),
    '§3.3 the two lead-ins are byte-identical on the same read (one idea, one spelling)', { planLead, tasksLead })
  ok(!planA.includes('你的（') && !tasksA.includes('你的（'),
    '§3.4 the old ② spelling is gone from both rows', { plan: planA, tasks: tasksA })

  const b = read({ member: 'r-2' })
  const planB = String(b.plan.value || '')
  const tasksB = String(b.tasks.value || '')
  ok(planB.startsWith('属于你（r-2，未完成 1 条）：') && tasksB.startsWith('属于你（r-2，未完成 1 条）：'),
    '§3.5 r-2 sees its OWN id and its OWN unfinished count on both rows (t-4 is done, so 1 not 2)', { planB, tasksB })
  ok(planB !== planA && tasksB !== tasksA,
    '§3.6 two members read two different shares (the pre-D1 defect gave one institute reading)', { planA, planB, tasksA, tasksB })
  ok(tasksA.includes('｜全所：共 4 条') && tasksB.includes('｜全所：共 4 条'),
    '§3.7 the ｜全所 half still follows the own slice on ③', { tasksA, tasksB })
  ok(planA.includes('｜全所：未完成 3 条') && planB.includes('｜全所：未完成 3 条'),
    '§3.8 and ② keeps its ｜全所 total', { planA, planB })

  const office = String(renderStatusBoard(statusBoardReadings({ tasks, records, member: null, at: AT })))
  ok(office === OFFICE_VIEW, '§3.9 the office view (no member) is BYTE-IDENTICAL to the pre-change capture',
    { now: office, before: OFFICE_VIEW })
  ok(!office.includes('属于你（') && !office.includes('你的（'),
    '§3.10 the office board carries no member slice in either spelling', office)
}

// ── §4 a member with ZERO owned tasks reads the same prefix with 0, and the office totals still print ───────────
{
  const z = read({ member: 'r-acad' })
  const planZ = String(z.plan.value || '')
  const tasksZ = String(z.tasks.value || '')
  ok(planZ.startsWith('属于你（r-acad，未完成 0 条）'),
    '§4.1 a member with no assigned task reads `未完成 0 条` on ②, not a bare id', planZ)
  ok(planZ.includes('任务板上没有分派给你且未完成的任务'),
    '§4.2 ② says the emptiness in words, not by omission', planZ)
  ok(tasksZ.startsWith('属于你（r-acad，未完成 0 条）：'),
    '§4.3 ③ reads the same zero in the same prefix', tasksZ)
  ok(tasksZ.includes('（任务板上没有 owner 是你的任务）'),
    '§4.4 ③ explains why its breakdown is empty', tasksZ)
  ok(planZ.includes('｜全所：未完成 3 条') && tasksZ.includes('｜全所：共 4 条（未结 3）'),
    '§4.5 the all-office totals are still printed after the zero share', { planZ, tasksZ })
  ok(String(fieldOf(z, 'plan').at) === AT && String(fieldOf(z, 'tasks').at) === AT,
    '§4.6 both rows still carry the read time (the zero share did not disable the time rule)')
}

console.log('\n=== VMU D1/D5 BOARD TIMES: ' + passed + ' passed, ' + failed + ' failed ===')
if (failed > 0) {
  console.error(failures.join('\n'))
  process.exit(1)
}

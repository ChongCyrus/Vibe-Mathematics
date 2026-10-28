// tests/vmu-run99-status-ownership.test.mjs — D5 (the four contents carry TIME) and D7 (the board is read by others,
// rewritten only by its owner).
//
// WHY THIS FILE EXISTS (rule L34, and the independent audit that called our green ledger vacuous): the rule says
// "状态版：可查看他人、可改自己、四个必需内容（当前进度／遇到的障碍／下一步计划／需要的帮助）＋时间信息". Two halves of
// that sentence had prose but no mechanism:
//   D5 — every field object carried an `at`, and every read branch wrote `at: null`. The board therefore showed four
//        values with ONE stamp (the block's own), which is not the same fact as "these four were read at that instant".
//   D7 — `member` was taken at face value from the caller: a member could name another member and rewrite THAT member's
//        panel, and the receipt did not say whose panel had changed.
// Both are measured here from the public surfaces (the board reader and the pack tool), never from prose.

import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { createKernel } from '../vibe-math-vmu/kernel/index.js'
import { statusBoardReadings, renderStatusBoard } from '../vibe-math-vmu/kernel/turn/index.js'
import { V5R_PACK_TOOLS } from '../vibe-math-vmu/packs/v5r/tools.js'

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

const NL = String.fromCharCode(10)
const T = 1700000000000
const boot = () => createKernel({ clock: () => T, settings: {} })
const progressTool = () => V5R_PACK_TOOLS.find((t) => t.name === 'vibe_v5_record_progress')
const PANEL = { progress: '把引理 3 的形式化补完', obstacles: 'Lean 里缺一条辅助引理', next: '先证辅助引理，再拼主证明', help: '需要一位熟悉 mathlib 的成员看一下思路' }

// ── §D5 ───────────────────────────────────────────────────────────────────────────────────────────────────────────
// Every field that HAS a value must carry the read instant, and the rendered line must print it. A field that could not
// be read must NOT borrow that instant (its `at` stays null and the line says why instead).
{
  const k = boot()
  k.records.put({ track: 'progress', kind: 'progress', by: 'r-1', title: '第 99 轮', body: '正在补引理 3', settled: true })
  k.records.put({ track: 'state', kind: 'state', by: 'r-1', title: '状态版', body: '- progress：' + PANEL.progress, settled: true })
  k.tasks.create({ title: '补完引理 3 的形式化', by: 'r-1' })

  const r = statusBoardReadings({ tasks: k.tasks, records: k.records, member: 'r-1', at: T })
  const fields = Array.isArray(r.fields) ? r.fields : []
  ok(fields.length === 4, 'D5 · the board still has its four fields', fields.map((f) => f.key))
  const valued = fields.filter((f) => typeof f.value === 'string' && f.value.trim() !== '')
  ok(valued.length >= 3, 'D5 · at least three fields were readable in this setup', valued.map((f) => f.key))
  ok(valued.every((f) => f.at !== null && f.at !== undefined && String(f.at).trim() !== ''), 'D5 · every readable field carries a time (its own stamp, or this read instant)', valued.map((f) => [f.key, f.at]))
  ok(valued.filter((f) => String(f.at) === String(T)).length >= 3, 'D5 · the task-board fields carry the read instant', valued.map((f) => [f.key, f.at]))
  const gaps = fields.filter((f) => f.value === null)
  ok(gaps.every((f) => f.at === null), 'D5 · an unreadable field does NOT borrow that instant', gaps.map((f) => [f.key, f.at]))

  const rendered = String(renderStatusBoard(r)).split(NL)
  const stamped = rendered.filter((l) => l.includes('读于 ' + String(T)))
  ok(stamped.length >= 3, 'D5 · the rendered line prints the read instant for the fields that were read now', rendered)
  ok(rendered.every((l) => !(l.includes('读于') && l.includes('该来源未提供'))), 'D5 · a "source unavailable" line never claims a read time')
  ok(rendered.some((l) => l.includes('读于 2023-11-14')), 'D5 · the current-small-task row prints the RECORD stamp it really has', rendered)

  // A board read WITHOUT a clock still works and prints no time — the reader must not invent one.
  const noClock = statusBoardReadings({ tasks: k.tasks, records: k.records, member: 'r-1' })
  const noClockValued = (noClock.fields || []).filter((f) => typeof f.value === 'string' && f.value.trim() !== '')
  ok(noClockValued.length > 0, 'D5 · a board read without a clock still returns values', noClockValued.map((f) => f.key))
  // The `current` row legitimately carries the RECORD's own stamp — that time belongs to the record, not to this read.
  ok(noClockValued.filter((f) => f.key !== 'current').every((f) => f.at === null), 'D5 · without a clock no field invents a read instant', noClockValued.map((f) => [f.key, f.at]))
  ok(String(renderStatusBoard(noClock)).split(NL).filter((l) => l.includes('读于')).every((l) => l.includes('2023-11-14')), 'D5 · without a clock the only printed time is the RECORD stamp the row really has', String(renderStatusBoard(noClock)))
}

// ── §D7 ───────────────────────────────────────────────────────────────────────────────────────────────────────────
// The panel belongs to one member: writing YOUR OWN needs no id, writing SOMEBODY ELSE'S is refused by name, and the
// office path (no member seat on the call) may write on behalf — with the receipt naming whose panel it rewrote.
{
  const k = boot()
  const tool = progressTool()
  const me = { id: 'r-1' }

  const own = tool.handler({ track: 'state', ...PANEL }, { kernel: k, agent: me })
  ok(own && own.ok === true, 'D7 · a member may write its own panel without naming itself', own && own.code)
  ok(own.panelOwner === 'r-1', 'D7 · the receipt names the panel owner it rewrote', own.panelOwner)
  ok(typeof own.panelOwnerMeans === 'string' && own.panelOwnerMeans.includes('panel owner itself'), 'D7 · …and says the writer IS the owner', own.panelOwnerMeans)
  const rows = k.records.list({ track: 'state' }).items
  ok(rows.length === 1 && rows[0].owner === 'r-1', 'D7 · the row landed on the caller, not on "nobody"', rows.map((x) => x.owner))

  let crossed = null
  try {
    tool.handler({ track: 'state', member: 'r-2', ...PANEL }, { kernel: k, agent: me })
  } catch (e) { crossed = e }
  ok(crossed && crossed.code === 'VMU_NOT_PERMITTED', 'D7 · rewriting another member panel is refused by name', crossed && crossed.code)
  ok(crossed && /r-2/.test(String(crossed.message)) && /only that member/.test(String(crossed.message)), 'D7 · …and the message names whose panel it is', crossed && crossed.message)
  ok(crossed && /vibe_v5_read_library/.test(String(crossed.hint)) && /r-2/.test(String(crossed.hint)), 'D7 · …with the readable path and the panelled id in the hint', crossed && crossed.hint)
  ok(k.records.list({ track: 'state' }).count === 1, 'D7 · the refused write changed nothing')

  const onBehalf = tool.handler({ track: 'state', member: 'r-2', ...PANEL }, { kernel: k })
  ok(onBehalf && onBehalf.ok === true, 'D7 · the office path may write on behalf', onBehalf && onBehalf.code)
  ok(onBehalf.panelOwner === 'r-2', 'D7 · …and the receipt names whose panel it rewrote', onBehalf.panelOwner)
  ok(typeof onBehalf.panelOwnerMeans === 'string' && onBehalf.panelOwnerMeans.includes('on behalf'), 'D7 · …saying it was written on behalf', onBehalf.panelOwnerMeans)

  // A non-state track is unaffected: the rule is about the shared status board, not the research log.
  const log = tool.handler({ content: '写一句进度' }, { kernel: k, agent: me })
  ok(log && log.ok === true && log.panelOwner === undefined, 'D7 · a plain progress row is not a panel and carries no panel fields', log && [log.ok, log.panelOwner])
}

if (failed > 0) {
  console.error('\nRUN99 STATUS+OWNERSHIP: ' + passed + ' passed, ' + failed + ' failed')
  console.error('  - ' + failures.join('\n  - '))
  process.exit(1)
}
console.log('\nRUN99 STATUS+OWNERSHIP: ' + passed + ' passed, 0 failed')

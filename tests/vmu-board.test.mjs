// Independent test for vmu kernel · board (no dependency on kernel/index.js).
// Run: node tests/vmu-board.test.mjs     Last line: === VMU BOARD: N passed, M failed ===
import { createBoard, refuse } from '../vibe-math-vmu/kernel/board.js'

let passed = 0
let failed = 0
function ok(cond, label) { if (cond) { passed += 1 } else { failed += 1; console.log('FAIL ' + label) } }
function throwsNamed(fn, code, label) {
  try { fn(); failed += 1; console.log('FAIL ' + label + ' (no refusal)'); return null }
  catch (e) {
    if (e && e.code === code) { passed += 1; return e }
    failed += 1; console.log('FAIL ' + label + ' (code=' + (e && e.code) + ' want ' + code + ')'); return null
  }
}
function fakeClock(start = 1000) { let t = start; return { now: () => t, advance: (ms) => { t += ms }, clock: () => t } }

// ── 1. zero mechanism (unconfigured ⇒ minimal and non-throwing) ───────────────────────────────
{
  const c = fakeClock()
  const b = createBoard({ clock: c.clock })
  const cols = b.columns()
  ok(cols.ok === true && cols.count === 0, 'zero-mechanism: columns() is empty')
  ok(b.status().configured === false, 'zero-mechanism: status().configured=false')
  ok(b.swimlanes().count === 0, 'zero-mechanism: swimlanes() empty')
  ok(b.aging().count === 0 && b.aging().dropped === 0, 'zero-mechanism: aging() empty')
  throwsNamed(() => b.move({ taskId: 't1', toColumn: 'anywhere' }), 'VMU_INVALID_ARGUMENT', 'zero-mechanism: move is refused by name')
  throwsNamed(() => b.setWip({ column: 'nope', limit: 1 }), 'VMU_INVALID_ARGUMENT', 'zero-mechanism: setWip refused')
}

// ── 2. addColumn + ordering + duplicate refusal ───────────────────────────────────────────────
{
  const c = fakeClock()
  const b = createBoard({ clock: c.clock })
  const r1 = b.addColumn({ id: 'doing', name: 'Doing', wipLimit: 2, order: 2 })
  const r2 = b.addColumn({ id: 'todo', name: 'To do', order: 1 })
  ok(r1.ok === true && r2.ok === true, 'addColumn: accepts two columns')
  const ids = b.columns().columns.map((x) => x.id)
  ok(ids.join(',') === 'todo,doing', 'addColumn: deterministic order (order then id)')
  throwsNamed(() => b.addColumn({ id: 'todo', name: 'dup' }), 'VMU_INVALID_ARGUMENT', 'addColumn: duplicate id refused')
  throwsNamed(() => b.addColumn({ id: '', name: 'x' }), 'VMU_INVALID_ARGUMENT', 'addColumn: empty id refused')
  throwsNamed(() => b.addColumn({ id: 'x', name: 'x', wipLimit: -1 }), 'VMU_INVALID_ARGUMENT', 'addColumn: negative wip refused')
}

// ── 3. WIP boundary: exactly at limit is allowed, one over is refused with current/limit ──────
{
  const c = fakeClock()
  const b = createBoard({ clock: c.clock, settings: { 'vmu.board.columns': [{ id: 'doing', name: 'Doing', wipLimit: 2, order: 1 }], 'vmu.board.moveRequiresTransition': false } })
  ok(b.move({ taskId: 't1', toColumn: 'doing' }).ok === true, 'WIP: first item enters')
  ok(b.move({ taskId: 't2', toColumn: 'doing' }).ok === true, 'WIP: second item enters (at limit)')
  const e = throwsNamed(() => b.move({ taskId: 't3', toColumn: 'doing' }), 'VMU_WORKFLOW_WIP_LIMIT', 'WIP: third item refused by name')
  ok(!!e && /2\/2/.test(e.message), 'WIP: refusal reports current/limit (2/2)')
  ok(b.columns().columns[0].occupants === 2, 'WIP: occupancy unchanged after refusal')
}

// ── 4. unknown column ⇒ named refusal listing the available columns ──────────────────────────
{
  const c = fakeClock()
  const b = createBoard({ clock: c.clock, settings: { 'vmu.board.columns': [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }] } })
  const e = throwsNamed(() => b.move({ taskId: 't', toColumn: 'zz' }), 'VMU_INVALID_ARGUMENT', 'move: unknown column refused')
  ok(!!e && /a, b/.test(String(e.hint)), 'move: refusal lists available columns')
  throwsNamed(() => b.move({ toColumn: 'a' }), 'VMU_INVALID_ARGUMENT', 'move: missing taskId refused')
}

// ── 5. moveRequiresTransition (default true, no tasks seam) ⇒ named refusal unless declared ───
{
  const c = fakeClock()
  const b = createBoard({ clock: c.clock, settings: { 'vmu.board.columns': [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }] } })
  ok(b.move({ taskId: 't', toColumn: 'a' }).ok === true, 'transition gate: first placement does not need a transition')
  throwsNamed(() => b.move({ taskId: 't', toColumn: 'b' }), 'VMU_WORKFLOW_TRANSITION_REQUIRED', 'transition gate: column change refused without a transition')
  ok(b.move({ taskId: 't', toColumn: 'b', transition: true }).ok === true, 'transition gate: explicit declaration allows the move')
  const off = createBoard({ clock: c.clock, settings: { 'vmu.board.columns': [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }], 'vmu.board.moveRequiresTransition': false } })
  ok(off.move({ taskId: 't', toColumn: 'b' }).ok === true, 'transition gate: disabled by setting ⇒ free move')
}

// ── 6. tasks seam: canTransition decides (refusal code passes through) ───────────────────────
{
  const c = fakeClock()
  const seen = []
  const tasks = { canTransition: ({ from, to }) => { seen.push(from + '->' + to); return { ok: false, code: 'VMU_STATE', message: 'illegal transition', hint: 'use the state machine' } } }
  const b = createBoard({ clock: c.clock, tasks, settings: { 'vmu.board.columns': [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }] } })
  b.move({ taskId: 't', toColumn: 'a' })
  const r = b.move({ taskId: 't', toColumn: 'b' })
  ok(r.ok === false && r.refused.code === 'VMU_STATE', 'tasks seam: canTransition refusal is surfaced by name')
  ok(seen.length === 1 && seen[0] === 'a->b', 'tasks seam: canTransition was consulted once with from/to')
  const allow = { canTransition: () => ({ ok: true }) }
  const b2 = createBoard({ clock: c.clock, tasks: allow, settings: { 'vmu.board.columns': [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }] } })
  b2.move({ taskId: 't', toColumn: 'a' })
  ok(b2.move({ taskId: 't', toColumn: 'b' }).ok === true, 'tasks seam: allowance permits the move')
}

// ── 7. aging: uses only the injected clock; cap ⇒ DROPPED count reported ─────────────────────
{
  const c = fakeClock(0)
  const b = createBoard({ clock: c.clock, settings: { 'vmu.board.columns': [{ id: 'a', name: 'A' }], 'vmu.board.agingWarnMs': 100, 'vmu.board.moveRequiresTransition': false } })
  b.move({ taskId: 't1', toColumn: 'a' })
  c.advance(150)
  b.move({ taskId: 't2', toColumn: 'a' })
  c.advance(150)
  b.move({ taskId: 't3', toColumn: 'a' })
  c.advance(150)
  const all = b.aging()
  ok(all.count === 3 && all.items[0].task === 't1' && all.items[0].ageMs === 450, 'aging: oldest first, ages from the injected clock')
  ok(all.dropped === 0 && all.truncated === false, 'aging: no truncation when under the cap')
  const capped = b.aging({ limit: 1 })
  ok(capped.count === 1 && capped.dropped === 2 && capped.truncated === true, 'aging: cap reports the dropped count (2)')
  const filtered = b.aging({ warnMs: 1000 })
  ok(filtered.count === 0, 'aging: warnMs filter applies')
}

// ── 8. read-only: columns()/aging()/status() never mutate state ──────────────────────────────
{
  const c = fakeClock(0)
  const b = createBoard({ clock: c.clock, settings: { 'vmu.board.columns': [{ id: 'a', name: 'A', wipLimit: 3 }], 'vmu.board.swimlanes': ['x', 'y'], 'vmu.board.moveRequiresTransition': false } })
  b.move({ taskId: 't1', toColumn: 'a' })
  const s1 = JSON.stringify(b.status())
  const c1 = JSON.stringify(b.columns())
  const a1 = JSON.stringify(b.aging())
  b.status(); b.columns(); b.aging()
  ok(JSON.stringify(b.status()) === s1 && JSON.stringify(b.columns()) === c1 && JSON.stringify(b.aging()) === a1, 'read-only: repeated reads are identical')
  ok(b.swimlanes().count === 2 && b.swimlanes().swimlanes[0] === 'x', 'swimlanes: read from settings, no mutation')
}

// ── 9. determinism: same inputs ⇒ byte-identical output (no real time anywhere) ──────────────
{
  const mk = () => { const c = fakeClock(500); const b = createBoard({ clock: c.clock, settings: { 'vmu.board.columns': [{ id: 'a', name: 'A', order: 1 }], 'vmu.board.moveRequiresTransition': false } }); b.move({ taskId: 't', toColumn: 'a' }); return b }
  const b1 = mk(); const b2 = mk()
  ok(JSON.stringify(b1.status()) === JSON.stringify(b2.status()), 'determinism: two boards agree on status()')
  ok(JSON.stringify(b1.columns()) === JSON.stringify(b2.columns()), 'determinism: two boards agree on columns()')
}

// ── 10. injected tasks ledger supplies occupancy (and WIP is enforced against the ledger) ────
{
  const c = fakeClock(0)
  const ledger = [{ id: 'l1', wipColumn: 'a' }, { id: 'l2', wipColumn: 'a' }]
  const tasks = { list: () => ledger.slice(), canTransition: () => ({ ok: true }) }
  const b = createBoard({ clock: c.clock, tasks, settings: { 'vmu.board.columns': [{ id: 'a', name: 'A', wipLimit: 2 }] } })
  ok(b.columns().columns[0].occupants === 2, 'tasks linkage: occupancy comes from the injected ledger')
  ok(b.status().tasksInjected === true, 'tasks linkage: status() reports the ledger is injected')
  throwsNamed(() => b.move({ taskId: 'new', toColumn: 'a' }), 'VMU_WORKFLOW_WIP_LIMIT', 'tasks linkage: WIP refused using ledger count')
  const nos = createBoard({ clock: c.clock, tasks: { list: () => { throw new Error('boom') } }, settings: { 'vmu.board.columns': [{ id: 'a', name: 'A' }], 'vmu.board.moveRequiresTransition': false } })
  ok(nos.move({ taskId: 'x', toColumn: 'a' }).ok === true, 'tasks linkage: a broken ledger falls back to the local map (board still works)')
}

// ── 11. setWip override + named refusals ─────────────────────────────────────────────────────
{
  const c = fakeClock(0)
  const b = createBoard({ clock: c.clock, settings: { 'vmu.board.columns': [{ id: 'a', name: 'A' }], 'vmu.board.moveRequiresTransition': false } })
  ok(b.setWip({ column: 'a', limit: 1 }).ok === true, 'setWip: accepts a limit')
  b.move({ taskId: 't1', toColumn: 'a' })
  throwsNamed(() => b.move({ taskId: 't2', toColumn: 'a' }), 'VMU_WORKFLOW_WIP_LIMIT', 'setWip: override is enforced')
  throwsNamed(() => b.setWip({ column: 'a', limit: -2 }), 'VMU_INVALID_ARGUMENT', 'setWip: negative limit refused')
  throwsNamed(() => b.setWip({ column: 'nope', limit: 1 }), 'VMU_INVALID_ARGUMENT', 'setWip: unknown column refused')
  ok(refuse('X', 'y', 'z').code === 'X', 'refuse(): named-error helper keeps code/hint')
}

console.log('=== VMU BOARD: ' + passed + ' passed, ' + failed + ' failed ===')
if (failed > 0) process.exit(1)

// vmu panel — the capability scenario for kernel/panel.js (task-11 / D-08 baseline B).
//
// The one NEW field the v5r line was missing is `subtasks` ("正在执行的子任务"); everything else it already had
// (`overall`/`subgoal`/`plan`/`status`). This suite pins the invariants: append-only history, framework-written
// times (a caller-supplied `...At` is refused by name), same-value idempotence, the subtask lifecycle and cap,
// deviation recording (vs policy refusal), the VIEW AUDIT with counted drops, and the optional mirror into
// `members.selfReport` that must NOT receive `subtasks` (that face does not know the field).

import { resolve } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'

const HERE = fileURLToPath(new URL('./', import.meta.url))
const REPO = resolve(HERE, '..')
const MODULE = resolve(REPO, 'vibe-math-vmu', 'kernel', 'panel.js')

let passed = 0, failed = 0
const failures = []
const ok = (cond, name, detail) => {
  if (cond) passed++
  else { failed++; failures.push(name + (detail === undefined ? '' : ' [' + detail + ']')) }
}
const expectThrow = async (fn, code, name) => {
  try { await fn(); failed++; failures.push(name + ' (did not throw)') }
  catch (e) { ok(e && e.code === code, name, e && e.code) }
}

const p = await import(pathToFileURL(MODULE).href)

let NOW = Date.parse('2026-10-09T00:00:00.000Z')
const clock = () => NOW
const mk = (settings = {}, extra = {}) => p.createPanel(Object.assign({ clock, settings, log: () => {} }, extra))

// ---- 1. the three D-08 fields, written and read back -----------------------------------------------
{
  const panel = mk()
  const w = await panel.set('r-1', { overall: 'prove theorem T', plan: ['lemma A', 'lemma B'], subtasks: ['search for a counterexample'] }, { by: 'r-1' })
  ok(w.ok === true && w.changed.length === 3, 'overall + plan + subtasks are written in one call')
  const g = panel.get('r-1')
  ok(g.overall === 'prove theorem T' && g.plan.length === 2, 'get returns the overall goal and the plan')
  ok(g.subtasks.length === 1 && g.subtasks[0].title === 'search for a counterexample' && g.subtasks[0].state === 'running',
    'a string sub-task becomes a RUNNING entry (the "正在执行" default)')
  ok(g.times.overallAt === NOW && g.times.planAt === NOW && g.times.subtasksAt === NOW, 'the framework wrote every ...At')
  const rich = await panel.set('r-1', { subtasks: [{ id: 's-1', title: 'finite check', state: 'blocked', note: 'needs n>10^6' }] }, { by: 'r-1' })
  ok(rich.subtasks[0].state === 'blocked' && rich.subtasks[0].note === 'needs n>10^6', 'a rich sub-task keeps id/state/note')
  const unknownMember = panel.get('nobody')
  ok(unknownMember.known === false && unknownMember.overall === '', 'an unknown member reads as an empty KNOWN-ABSENT row')
}

// ---- 2. validation: unknown fields, framework time, empty writes ------------------------------------
{
  const panel = mk()
  await expectThrow(() => panel.set('r-1', { motto: 'x' }, { by: 'r-1' }), 'VMU_PANEL_UNKNOWN_FIELD', 'an unknown field is refused by name')
  await expectThrow(() => panel.set('r-1', { overallAt: 5 }, { by: 'r-1' }), 'VMU_PANEL_TIME_KEY', 'a caller-supplied instant is refused by name')
  await expectThrow(() => panel.set('r-1', {}, { by: 'r-1' }), 'VMU_INVALID_ARGUMENT', 'an empty write is refused')
  await expectThrow(() => panel.set('r-1', { subtasks: [{ title: 'x', state: 'flying' }] }, { by: 'r-1' }),
    'VMU_INVALID_ARGUMENT', 'an unknown sub-task state is refused')
  await expectThrow(() => panel.set('r-1', { subtasks: [{ state: 'running' }] }, { by: 'r-1' }),
    'VMU_INVALID_ARGUMENT', 'a sub-task without a title is refused')
  const capped = mk({ 'vmu.panel.subtasksMax': 2 })
  await expectThrow(() => capped.set('r-1', { subtasks: ['a', 'b', 'c'] }, { by: 'r-1' }),
    'VMU_PANEL_CAP_REACHED', 'the sub-task cap is machine-enforced with a named refusal')
}

// ---- 3. append-only history + same-value idempotence ------------------------------------------------
{
  const panel = mk()
  await panel.set('r-1', { overall: 'goal v1' }, { by: 'r-1', reason: 'start' })
  NOW += 1000
  await panel.set('r-1', { overall: 'goal v2' }, { by: 'r-1', reason: 'refined' })
  const h = panel.history('r-1')
  ok(h.entries.length === 2 && h.entries[0].to === 'goal v1' && h.entries[1].to === 'goal v2', 'history is append-only, oldest first')
  ok(h.entries[1].reason === 'refined' && h.entries[1].source === 'self', 'history records reason and source')
  const same = await panel.set('r-1', { overall: 'goal v2' }, { by: 'r-1' })
  ok(same.deduped === true && panel.history('r-1').entries.length === 2, 'a same-value write is idempotent and appends NO history')
  const capped = mk({ 'vmu.panel.historyCap': 2 })
  for (let i = 0; i < 5; i++) await capped.set('r-1', { status: 's' + i }, { by: 'r-1' })
  ok(capped.history('r-1').entries.length === 2 && capped.history('r-1').dropped === 3, 'history drops are COUNTED, never silent')
}

// ---- 4. deviation: the previous author keeps their value retrievable (or the policy refuses) --------
{
  const panel = mk()
  await panel.set('r-1', { overall: 'the chair goal' }, { by: 'acad', source: 'academician' })
  const dev = await panel.set('r-1', { overall: 'my own goal' }, { by: 'r-1' })
  ok(dev.deviation && dev.deviation.keptValue === 'the chair goal' && dev.deviation.keptBy === 'academician',
    'an overwrite by another member RECORDS the previous value, author and time')
  ok(panel.get('r-1').overall === 'my own goal', 'the new value is applied (it is recorded, not blocked)')
  const strict = mk({ 'vmu.panel.deviationPolicy': 'refuse' })
  await strict.set('r-1', { overall: 'chair goal' }, { by: 'acad', source: 'academician' })
  await expectThrow(() => strict.set('r-1', { overall: 'mine' }, { by: 'r-1' }), 'VMU_PANEL_DEVIATION',
    'policy=refuse turns the deviation into a named refusal')
  ok(strict.get('r-1').overall === 'chair goal' && strict.get('r-1').deviation === null, 'nothing changed on the refusal')
}

// ---- 5. the view is audited, and the audit drops are counted ---------------------------------------
{
  const panel = mk()
  await panel.set('r-1', { overall: 'a', subtasks: [{ title: 'run', state: 'running' }] }, { by: 'r-1' })
  await panel.set('r-2', { overall: 'b', subtasks: [{ title: 'stuck', state: 'blocked' }] }, { by: 'r-2' })
  const v = panel.view({ viewer: 'acad' })
  ok(v.roster.length === 2 && v.running === 1, 'view returns every known row and counts RUNNING sub-tasks')
  ok(panel.audit().length === 1 && panel.audit()[0].by === 'acad' && panel.audit()[0].saw.length === 2, 'the view writes an audit row naming who saw whom')
  const board = panel.board()
  ok(board.length === 2 && board.some((r) => r.running === 1) && board.some((r) => r.blocked === 1), 'the board summarises running/blocked per member')
  const capped = mk({ 'vmu.panel.auditCap': 2 })
  for (let i = 0; i < 4; i++) capped.view({ viewer: 'acad', ids: ['r-1'] })
  ok(capped.audit().length === 2 && capped.status().dropped.audit === 2, 'the view audit is capped with a COUNTED drop')
}

// ---- 6. mirroring into members.selfReport, and the bus fallback -------------------------------------
{
  const calls = []
  const seam = { async selfReport(id, fields, opts) { calls.push({ id, fields, opts }); return { ok: true } } }
  const panel = mk({}, { members: seam })
  const w = await panel.set('r-1', { overall: 'g', plan: ['p'], subtasks: ['running now'] }, { by: 'r-1' })
  ok(w.mirrored === true && calls.length === 1, 'a bound members seam receives the write')
  ok(calls[0].fields.subtasks === undefined && calls[0].fields.overall === 'g', 'subtasks is NOT mirrored (that face does not know the field)')
  ok(calls[0].opts.by === 'r-1', 'the acting member is passed through as the audit fact')
  const failing = mk({}, { members: { async selfReport() { throw Object.assign(new Error('nope'), { code: 'VMU_INVALID_ARGUMENT' }) } } })
  const w2 = await failing.set('r-1', { overall: 'g' }, { by: 'r-1' })
  ok(w2.mirrored === false && w2.mirrorSkipped && w2.mirrorSkipped.what === 'members.selfReport', 'a refusing seam is reported, never hidden')
  ok(failing.get('r-1').overall === 'g', 'the panel ledger stays authoritative for its own row')
  const events = []
  const withBus = mk({}, { bus: { emit: (topic, payload) => events.push({ topic, payload }) } })
  await withBus.set('r-1', { overall: 'g' }, { by: 'r-1' })
  ok(events.length === 3 && events.some((e) => e.topic === 'member/self-report')
    && events.some((e) => e.topic === 'panel/written'),
  'without a members seam the panel emits the existing report hook itself (plus panel/write-before and panel/written)')
  ok(events[0].topic === 'panel/write-before' && events[0].payload.member === 'r-1', 'the BEFORE hook fires with the member in its payload')
}

// ---- 7. projection seam v1: rows + history + view audit cross a restart -----------------------------
{
  const p1 = mk()
  await p1.set('r-1', { overall: 'goal', plan: ['a'], subtasks: [{ title: 'run', state: 'running' }] }, { by: 'r-1' })
  p1.view({ viewer: 'acad' })
  const snap = p1.snapshot()
  ok(snap.face === 'panel' && snap.v === 1 && snap.counters.panel === 0 && snap.skipped.length === 0,
    'a panel snapshot is a v1 envelope (this face mints no ids of its own)')
  ok(!JSON.stringify(snap.data).includes('subtasksMax') && !JSON.stringify(snap.data).includes('deviationPolicy'),
    'policy is NOT in the snapshot (settings is re-resolved on restore)')
  const p2 = mk()
  const r = p2.restore(snap)
  ok(r.ok === true && r.members === 1 && p2.get('r-1').overall === 'goal' && p2.get('r-1').subtasks[0].state === 'running',
    'restore hydrates the rows and the running sub-task')
  ok(p2.audit().length === 1 && p2.history('r-1').entries.length === 3,
    'the view audit and the append-only history survive too (one row per changed field: overall/plan/subtasks)')
  ok(p2.restore(snap).ok === true, 're-restoring the same snapshot is idempotent')
  const p3 = mk()
  await p3.set('r-9', { overall: 'other' }, { by: 'r-9' })
  ok(p3.restore(snap).code === 'VMU_RESUME_RESTORE_CONFLICT', 'a DIFFERENT live panel is a named conflict')
  ok(p3.restore({ face: 'chat', v: 1, data: {} }).code === 'VMU_RESUME_SNAPSHOT_VERSION', 'a foreign face is refused by name')
  ok(p3.restore({ face: 'panel', v: 1, data: { rows: {} } }).code === 'VMU_RESUME_SNAPSHOT_INCOMPLETE', 'a missing collection is NAMED')
}

console.log('vmu-panel: ' + passed + ' passed, ' + failed + ' failed')
for (const f of failures) console.log('  FAIL ' + f)
process.exit(failed === 0 ? 0 : 1)

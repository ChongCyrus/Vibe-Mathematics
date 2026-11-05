// vmu run 229 — "blocked_by" must BLOCK the claim, not just decorate the board.
//
// WHAT WAS WRONG (measured, HEAD before this test):
//   · `kernel/tasks.js` kept the dependency fact in `unmetDeps` only: `list()` reported `ready:false` and `transition()`
//     re-checked it at `doing`/`done` — but `assign()` (the door `vibe_v5_task_update {action:"claim"}` goes through in
//     `kit/extras.js`) never looked. Probe on HEAD: `assign('t-2','m-1')` on a task whose dependency `t-1` was still
//     `open` returned `{ok:true, state:'assigned', owner:'m-1'}`.
//   · The reply field had already PROMISED the refusal: `kernel/turn/index.js:139` says "blocked_by dependencies are
//     refused there by name", about a refusal that did not exist.
//   · The gate is not a new invention: the v5r preset this kernel was extracted from refused exactly here —
//     `archive/legacy-presets/vibe-math-v5r/vibe-math-v5r.js:6200` (claim) and `:6266` (reassign) threw
//     `V5_TASK_BLOCKED` "task <id> still has incomplete blockers". The port dropped it and kept the prose.
//
// WHAT MUST HOLD NOW:
//   · a claim (or a chair's `assign`) on a task with unfinished blockers is refused with `VMU_TASK_BLOCKED`, and the
//     message NAMES every open blocker WITH ITS STATE — "finish it" is useless advice if the reader cannot tell which;
//   · the hint gives only REAL routes: wait for done (`open -> assigned -> doing -> done`), or drop the edge with
//     `set_dependencies`; it must not promise "release"/"cancel the blocker" (a cancelled blocker never unblocks) and
//     it must not promise a path this kernel does not have;
//   · a blocker list that forms a CYCLE is a different fact: no completion can ever unblock it, so the refusal is
//     `VMU_TASK_DEPENDENCY_CYCLE` with the path, never a bare "still has unfinished blockers" that implies waiting works;
//   · an unblocked task keeps today's semantics exactly (same receipt, same by/bySource), and a terminal task keeps its
//     own `VMU_STATE` refusal — the dependency gate is about dependencies, not about state;
//   · the tool face and the kernel agree by construction (the face calls `assign`), so both are asserted here.

import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const HERE = fileURLToPath(new URL('./', import.meta.url))
const REPO = resolve(HERE, '..')
const TASKS = resolve(REPO, 'vibe-math-vmu', 'kernel', 'tasks.js')
const EXTRAS = resolve(REPO, 'vibe-math-vmu', 'kit', 'extras.js')
const TURN = resolve(REPO, 'vibe-math-vmu', 'kernel', 'turn', 'index.js')

let passed = 0, failed = 0
const failures = []
const ok = (cond, name, detail) => {
  if (cond) passed++
  else { failed++; failures.push(name + (detail === undefined ? '' : ' [' + detail + ']')) }
}
const refused = async (fn, code, name) => {
  try { const r = await fn(); failed++; failures.push(name + ' (returned instead of refusing: ' + JSON.stringify(r) + ')'); return null }
  catch (e) { ok(e && e.code === code, name + ' — code ' + code, e && e.code); return e }
}
const has = (s, frag) => typeof s === 'string' && s.indexOf(String(frag)) !== -1

const T = await import(pathToFileURL(TASKS).href)
const X = await import(pathToFileURL(EXTRAS).href)
const mk = () => T.createTasks({ clock: () => '2026-11-04T00:00:00.000Z' })
const kernelOf = (tasks) => ({ tasks, settings: {}, settingsView: () => ({}) })

// ---- 1. the headline: a blocked claim is refused BY NAME, and the blocker is named -------------------
{
  const l = mk()
  const blocker = await l.create({ title: 'the blocker' })
  const work = await l.create({ title: 'the work', deps: [blocker.id] })
  const rev = (await l.list()).filter((t) => t.id === work.id)[0].revision
  const e = await refused(() => l.assign(work.id, 'm-1', { expectedRevision: rev, by: 'm-1', bySource: 'caller' }),
    'VMU_TASK_BLOCKED', '1. claim on a task whose blocker is open is refused')
  if (e) {
    ok(has(e.message, blocker.id), '1a. the message names the open blocker', e.message)
    ok(has(e.message, '(' + blocker.state + ')'), '1b. the message names the blocker\'s STATE', e.message)
    ok(has(e.hint, 'set_dependencies'), '1c. the hint names the real route: set_dependencies', e.hint)
    ok(has(e.hint, 'done'), '1d. the hint names the other real route: the blocker reaching done', e.hint)
    ok(!/\brelease\b/.test(String(e.hint)) && !/cancel the blocker/.test(String(e.hint)),
      '1e. the hint does NOT promise release/cancel (a cancelled blocker never unblocks)', e.hint)
    const d = e.detail || {}
    ok(d.id === work.id, '1f. detail.id is the task that could not be claimed', JSON.stringify(d.id))
    ok(Array.isArray(d.blockers) && d.blockers.length === 1 && d.blockers[0].id === blocker.id && d.blockers[0].state === 'open',
      '1g. detail.blockers lists {id,state} of every open blocker', JSON.stringify(d.blockers))
  }
  const rows = l.history().filter((h) => h.what === 'task-assigned' && String(h.id || (h.detail && h.detail.id)) === work.id)
  ok(rows.length === 0, '1h. a refused claim leaves NO assigned row in the audit ledger', JSON.stringify(rows))
  const after = (await l.list()).filter((t) => t.id === work.id)[0]
  ok(after && after.owner === null && after.state === 'open', '1i. the refused claim moved nothing (owner still null)', JSON.stringify(after))
}

// ---- 2. the chair's `assign` path is the same gate (not a claim-only courtesy) ----------------------
{
  const l = mk()
  const blocker = await l.create({ title: 'b' })
  const work = await l.create({ title: 'w', deps: [blocker.id] })
  const rev = (await l.list()).filter((t) => t.id === work.id)[0].revision
  await refused(() => l.assign(work.id, 'm-7', { expectedRevision: rev, by: 'chair', bySource: 'argument' }),
    'VMU_TASK_BLOCKED', '2. a chair assignment on a blocked task is refused too')
}

// ---- 3. positive branch: once the blocker is done the same claim goes through ------------------------
{
  const l = mk()
  const blocker = await l.create({ title: 'b' })
  const work = await l.create({ title: 'w', deps: [blocker.id] })
  await l.transition(blocker.id, 'doing')
  await l.transition(blocker.id, 'done')
  const r = await l.assign(work.id, 'm-1', { expectedRevision: work.revision, by: 'm-1', bySource: 'caller' })
  ok(r && r.ok === true && r.owner === 'm-1' && r.state === 'assigned', '3. after the blocker is done the claim succeeds',
    JSON.stringify(r && { ok: r.ok, owner: r.owner, state: r.state }))
}

// ---- 4. unblocked tasks keep today's semantics (the gate must not touch the happy path) -------------
{
  const l = mk()
  const t = await l.create({ title: 'free' })
  const r = await l.assign(t.id, 'm-1', { by: 'm-1', bySource: 'caller' })
  ok(r && r.ok === true && r.owner === 'm-1' && r.state === 'assigned' && r.by === 'm-1' && r.bySource === 'caller',
    '4. an unblocked claim returns the same receipt as before (by/bySource preserved)', JSON.stringify(r))
}

// ---- 5. a CANCELLED blocker never unblocks: the refusal says so instead of implying "wait" -----------
{
  const l = mk()
  const blocker = await l.create({ title: 'b' })
  await l.transition(blocker.id, 'cancelled')
  const work = await l.create({ title: 'w', deps: [blocker.id] })
  const rev = (await l.list()).filter((t) => t.id === work.id)[0].revision
  const e = await refused(() => l.assign(work.id, 'm-1', { expectedRevision: rev }),
    'VMU_TASK_BLOCKED', '5. a cancelled blocker still blocks the claim')
  if (e) {
    ok(has(e.message, '(cancelled)'), '5a. the message shows the blocker is cancelled (so "finish it" is visibly impossible)', e.message)
    ok(/CANCELLED blocker never unblocks/.test(String(e.hint)), '5b. the hint states that a cancelled blocker never unblocks', e.hint)
  }
}

// ---- 6. a dependency that does not exist yet is named as such --------------------------------------
{
  const l = mk()
  const work = await l.create({ title: 'w', deps: ['t-404'] })
  const rev = (await l.list()).filter((t) => t.id === work.id)[0].revision
  const e = await refused(() => l.assign(work.id, 'm-1', { expectedRevision: rev }),
    'VMU_TASK_BLOCKED', '6. a dependency that does not exist is refused by name')
  if (e) {
    ok(has(e.message, 't-404') && has(e.message, 'does not exist yet'),
      '6a. the message says the dependency does not exist (a state it does not have must not be invented)', e.message)
    const d = e.detail || {}
    ok(Array.isArray(d.blockers) && d.blockers[0] && d.blockers[0].state === null,
      '6b. detail.blockers reports state:null for a nonexistent dependency', JSON.stringify(d.blockers))
  }
}

// ---- 7. a blocker CYCLE is a different fact: no completion can unblock it, so the refusal says so ----
// The API refuses to BUILD a cycle (create/setDependencies), so a hydrated board is the only way one exists in the wild:
// a snapshot restored into a live ledger is exactly how a legacy/deadlocked board comes back.
{
  const l = mk()
  const snap = {
    apiVersion: 1, face: 'tasks', v: 1, at: '2026-11-04T00:00:00.000Z',
    data: {
      tasks: [
        { id: 't-1', title: 'a', objective: null, owner: null, deps: ['t-2'], writeScopes: [], priority: 0, state: 'open', createdAt: 'x', transitions: [], revision: 1 },
        { id: 't-2', title: 'b', objective: null, owner: null, deps: ['t-1'], writeScopes: [], priority: 0, state: 'open', createdAt: 'x', transitions: [], revision: 1 },
      ],
      history: [], briefs: [], stageIndex: -1, stages: [],
    },
    counters: { task: 2 }, skipped: [],
  }
  const rest = l.restore(snap, { replace: true })
  ok(rest && rest.ok === true, '7-setup. a cyclic board can be restored (the only way a cycle reaches this code)', JSON.stringify(rest && rest.ok))
  const e = await refused(() => l.assign('t-1', 'm-1', { expectedRevision: 1 }),
    'VMU_TASK_DEPENDENCY_CYCLE', '7. a claim blocked by a dependency cycle is refused as a CYCLE')
  if (e) {
    ok(has(e.message, 'dependency cycle'), '7a. the message says it is a cycle', e.message)
    const cyc = (e.detail && e.detail.cycle) || []
    ok(Array.isArray(cyc) && cyc.length >= 3 && cyc[0] === cyc[cyc.length - 1],
      '7b. detail.cycle is the path, first id repeated last', JSON.stringify(cyc))
    ok(has(e.hint, 'break the cycle'), '7c. the hint says the only route out is breaking the cycle', e.hint)
    ok(has(e.hint, 'set_dependencies'), '7d. the hint names the real tool for dropping the edge', e.hint)
  }
}

// ---- 8. a terminal task keeps its OWN refusal: this gate is about dependencies, not about state ------
{
  const l = mk()
  const t = await l.create({ title: 'done already' })
  await l.transition(t.id, 'doing')
  await l.transition(t.id, 'done')
  // RUN 238: create() now reports the revision it minted, so `t.revision` is the OLD number after two
  // transitions — read the current row (a stale expectation would be refused for the wrong reason).
  const done = (await l.list()).filter((x) => x.id === t.id)[0]
  await refused(() => l.assign(t.id, 'm-1', { expectedRevision: done.revision }), 'VMU_STATE',
    '8. assigning a done task is still refused as VMU_STATE (not re-labelled as a dependency problem)')
}

// ---- 9. the TOOL FACE is the same gate (it calls assign; asserted so the two cannot drift) ----------
{
  const l = mk()
  const blocker = await l.create({ title: 'b' })
  const work = await l.create({ title: 'w', deps: [blocker.id] })
  const kernel = kernelOf(l)
  const rev0 = (await l.list()).filter((t) => t.id === work.id)[0].revision
  const e = await refused(() => X.toolTaskUpdate({ action: 'claim', task_id: work.id, member: 'm-1', expected_revision: rev0 }, { kernel }),
    'VMU_TASK_BLOCKED', '9. vibe_v5_task_update {action:"claim"} on a blocked task is refused by the SAME code')
  if (e) ok(has(e.message, blocker.id), '9a. the tool-face refusal still names the blocker', e.message)

  await l.transition(blocker.id, 'doing')
  await l.transition(blocker.id, 'done')
  const fresh = (await l.list()).filter((t) => t.id === work.id)[0]
  const r = await X.toolTaskUpdate({ action: 'claim', task_id: work.id, member: 'm-1', expected_revision: fresh.revision }, { kernel })
  ok(r && r.ok === true && r.tool === 'vibe_v5_task_update' && r.task && r.task.state === 'assigned',
    '9b. the same tool call succeeds once the blocker is done (positive branch)', JSON.stringify(r && { ok: r.ok, tool: r.tool, state: r.task && r.task.state }))
}

// ---- 10. the promise and the gate must not drift apart again ---------------------------------------
// The reply field's hint promised this refusal while it did not exist. Pin the sentence NEXT TO the behaviour it names,
// so removing the gate (or the sentence) makes this test fail instead of leaving a true-sounding lie in the interface.
{
  const src = await readFile(TURN, 'utf8')
  ok(has(src, 'blocked_by dependencies are refused there by name'),
    '10. the reply-field hint still promises the refusal this test verifies (a gate and its promise, pinned together)')
  ok(has(src, 'task_claim: Object.freeze('),
    '10a. the hint is attached to the `task_claim` reply shape, not to some other field')
}

console.log('=== VMU RUN 229 (blocked_by claim gate): ' + passed + ' passed, ' + failed + ' failed ===')
for (const f of failures) console.log('  FAIL ' + f)
process.exit(failed === 0 ? 0 : 1)

// tests/vmu-run31-taskboard.test.mjs — RUN 31, THE DEFECT'S SIAMESE TWIN: THE BOARD WAS ONE KERNEL'S MEMORY.
//
// Run 31 measured the mailbox failure (F1, `tests/vmu-run31-mailbox.test.mjs`). The boot-twice probe for §2 of that
// report measured the SAME class of defect on the task board, and the run's durable file agrees with it: the office
// kernel `tasks.create()`-ed rows (its own `tasks` Map held them) while a member sub-session — a SEPARATE kernel over
// the SAME `<root>/vmu/state.json` — listed 0 rows, a third boot listed 0 rows, and `VibeMath/vmu/state.json` ended the
// run with `tasks: []`. The v5r rules require ONE board (认领/交派 and the 状态板's "各任务完成状态/当前小任务" are read by
// members), so a per-instance board is a rule violation, not a cache lag.
//
// WHY (mechanism, not blame): `vibe-math-vmu/kernel/index.js` attached `tasks` as a `mode:'journal'` projection. A
// journal records THIS instance's commands and replays them on ITS OWN hydrate — it can never show another instance's
// rows, and it never wrote a board to the store. The mailbox had already proved the right shape on the same defect:
// pull before a read face, merge inside `store.patch` on write-back, name every refusal.
//
// WHAT THIS FILE PROVES (each claim is a measured receipt, not a promise):
//   ① the run-31 defect itself: two kernels over one root, the office creates a task, the MEMBER kernel lists it;
//   ② a claim made by the member instance is visible to the OFFICE kernel (owner + revision moved, not just the row);
//   ③ a THIRD kernel booted from the same root still sees the row and its owner — the board is durable, and the key
//      holds a `mode:'state'` envelope whose `value` is the board snapshot `resume` hydrates from;
//   ④ writing the same task twice never produces two rows (ids are the identity: repeated pulls/pushes and repeated
//      mutations leave the board's row count alone);
//   ⑤ two kernels that mint the SAME id in one tick (the sequence is per instance) BOTH survive: the collided row is
//      re-keyed and reported, never merged away and never dropped;
//   ⑥ a same-revision disagreement (owner vs state) is resolved by "later write wins" WITH AN EXPLANATION: the
//      disagreement is counted in `shared().conflicts` and logged, and both kernels end on the same row;
//   ⑦ with NO store port the board still answers honestly: `durable:false`, `source:'memory'`, and a NAMED reason;
//   ⑧ a read before `store.open()` is a NAMED, counted refusal that RETRIES (kernels are constructed before the entry
//      opens the store), not a silently empty board;
//   ⑨ the TOOL receipt (`vibe_vmu_task`) carries the same fact, so a member reading the board through the tool — not
//      through the kernel object — can tell durable from private.
//
// Run: node tests/vmu-run31-taskboard.test.mjs        Last line: === VMU RUN31 TASKBOARD: N passed, M failed ===

import { mkdtemp, readFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..')
const imp = (p) => import(pathToFileURL(resolve(REPO, p)).href)
const km = await imp('vibe-math-vmu/kernel/index.js')
const tm = await imp('vibe-math-vmu/tools/task.js')

let passed = 0
let failed = 0
const failures = []
const ok = (cond, name, detail) => {
  if (cond) { passed += 1; console.log('  ok   ' + name) } else {
    failed += 1
    failures.push(name)
    console.log('  FAIL ' + name + (detail === undefined ? '' : '  ' + JSON.stringify(detail)))
  }
}
const section = (title) => console.log('\n── ' + title + ' ' + '─'.repeat(Math.max(2, 78 - title.length)))

// The write-back is SERIALISED and COALESCED (one promise chain per board), so an assertion must give the queued write a
// chance to land. Bounded polling on the RECEIPT (never a fixed sleep as the only evidence): the predicate is the fact
// being asserted, the timeout only keeps a broken build from hanging.
const waitFor = async (pred, ms = 2000) => {
  const deadline = Date.now() + ms
  let last = await pred()
  while (!last && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 5))
    last = await pred()
  }
  return last
}
const tempRoot = async (tag) => mkdtemp(join('D:/_tmp', 'vmu-run31-tb-' + tag + '-'))
// The real boot shape (`vibe-math-vmu/vibe-math-vmu.js`): the kernel is CONSTRUCTED first, then the host opens the
// store. `boot` does both so a test case can also construct-then-open by hand (case ⑧).
const boot = async (root, extra = {}) => {
  const k = km.createKernel(Object.assign({ root, clock: () => 1000, settings: {} }, extra))
  await k.store.open()
  return k
}
const idsOf = (rows) => (Array.isArray(rows) ? rows.map((r) => r && r.id).sort() : [])
const rowOf = (rows, id) => (Array.isArray(rows) ? rows.find((r) => r && r.id === id) || null : null)

console.log('vmu run31 taskboard — the board must be ONE board across kernels')

// ── ① the run-31 defect: the office creates, the MEMBER kernel lists ────────────────────────────────────────────
section('① run 31: the office created tasks, the member kernel listed none')
{
  const root = await tempRoot('boot-twice')
  const office = await boot(root)
  const member = await boot(root)
  const made = await office.tasks.create({ title: '共享板任务', objective: 'run31 repro' })
  ok(made.ok === true && made.id === 't-1', 'the office kernel created t-1', made)
  const seen = await waitFor(() => rowOf(member.tasks.list(), 't-1'))
  ok(!!seen, 'the MEMBER kernel sees the row the office created (run 31: 0 rows)', idsOf(member.tasks.list()))
  ok(seen && seen.title === '共享板任务', 'the member sees the SAME row, not a copy with a different title', seen)
  const st = member.tasks.sharing()
  ok(st.durable === true && st.source === 'store', 'the member says the board is durable and store-backed', st)
  ok(st.bound === true && st.pullRefused === 0 && st.lastError === null, 'the pull succeeded (no refusal, no stale error)', st)
  // The tally object is the read most callers ask for ("how many open?"), so it must carry the same fact instead of
  // forcing every caller to know about a separate sharing() accessor.
  const tally = member.tasks.status()
  ok(tally.total === 1 && tally.shared && tally.shared.durable === true && tally.shared.reason === null,
    'the member status() tally carries the shared fact (durable, no reason to doubt it)', { total: tally.total, shared: tally.shared })
}

// ── ② a claim made by the member is visible to the office ───────────────────────────────────────────────────────
section('② the member claims; the office sees the OWNER CHANGE, not just the row')
{
  const root = await tempRoot('owner')
  const office = await boot(root)
  const member = await boot(root)
  await office.tasks.create({ title: '认领测试' })
  ok(await waitFor(() => rowOf(member.tasks.list(), 't-1')), 'the member can see the row before claiming')
  const claim = await member.tasks.assign('t-1', 'res-01')
  ok(claim.ok === true && claim.owner === 'res-01', 'the member kernel assigned the task to res-01', claim)
  const seen = await waitFor(() => {
    const row = rowOf(office.tasks.list(), 't-1')
    return row && row.owner === 'res-01' ? row : null
  })
  ok(!!seen, 'the OFFICE kernel sees owner=res-01 (the write-back merged the claim, it did not overwrite it)', rowOf(office.tasks.list(), 't-1'))
  ok(seen && Number(seen.revision) === 2, 'the office sees the bumped revision, so a reread is not a stale snapshot', seen)
  ok(office.tasks.sharing().durable === true, 'the office board is durable after the member wrote', office.tasks.sharing())
}

// ── ③ a third kernel still sees it, and the durable key is the shape resume hydrates ───────────────────────────
section('③ a THIRD kernel booted from the root still sees the row and its owner')
{
  const root = await tempRoot('persist')
  const office = await boot(root)
  await office.tasks.create({ title: '持久板' })
  await office.tasks.assign('t-1', 'res-02')
  ok(await waitFor(async () => {
    const raw = office.store.read('tasks')
    return !!(raw && raw.mode === 'state' && raw.value && raw.value.data && raw.value.data.tasks.length === 1)
  }), 'the tasks key holds a mode:state envelope after a mutation (no persist() call)', office.store.read('tasks') && office.store.read('tasks').mode)
  const third = await boot(root)
  const listed = third.tasks.list()
  ok(idsOf(listed).length === 1, 'the third kernel lists exactly one row', idsOf(listed))
  ok(rowOf(listed, 't-1') && rowOf(listed, 't-1').owner === 'res-02', 'the third kernel sees the owner the first kernel wrote', rowOf(listed, 't-1'))
  const raw = third.store.read('tasks')
  ok(raw && raw.value && raw.value.face === 'tasks' && raw.value.data && typeof raw.value.data.tasks === 'object',
    'the envelope value is a tasks SNAPSHOT (face/data) — the shape kernel/resume.js restores from', raw && raw.value && raw.value.face)
  const file = JSON.parse(await readFile(join(root, 'vmu', 'state.json'), 'utf8'))
  ok(file.keys && file.keys.tasks && file.keys.tasks.mode === 'state', 'the durable FILE holds it as a state projection, not a journal', file.keys && file.keys.tasks && file.keys.tasks.mode)
  ok(third.tasks.sharing().durable === true, 'the third kernel reports the board durable', third.tasks.sharing())
}

// ── ④ the same task written twice never becomes two rows ───────────────────────────────────────────────────────
section('④ one task stays ONE row across repeated reads, writes and pulls')
{
  const root = await tempRoot('nodup')
  const office = await boot(root)
  const member = await boot(root)
  await office.tasks.create({ title: '只此一行' })
  await waitFor(() => rowOf(member.tasks.list(), 't-1'))
  for (let i = 0; i < 4; i += 1) { member.tasks.list(); office.tasks.list() }
  await member.tasks.assign('t-1', 'res-01')
  await office.tasks.transition('t-1', 'doing', { reason: 'started' })
  member.tasks.list()
  office.tasks.list()
  await waitFor(async () => {
    const raw = member.store.read('tasks')
    return !!(raw && raw.value && raw.value.data.tasks.length === 1)
  })
  const raw = member.store.read('tasks')
  const rows = raw && raw.value ? raw.value.data.tasks : []
  ok(rows.length === 1, 'the durable board holds exactly ONE row for one task', rows.map((r) => r.id))
  ok(idsOf(rows).join(',') === 't-1', 'and its id is still t-1 (no duplicate minted by a reread)', idsOf(rows))
  const officeRows = office.tasks.list()
  ok(officeRows.length === 1 && officeRows[0].state === 'doing', 'both kernels agree on the single row', officeRows)
  ok(idsOf(member.tasks.list()).join(',') === idsOf(officeRows).join(','), 'the two kernels list the same ids', [idsOf(member.tasks.list()), idsOf(officeRows)])
}

// ── ⑤ the same id minted in one tick: both rows survive, the collision is named ────────────────────────────────
section('⑤ two kernels minting the SAME id in one tick both survive (re-keyed, reported)')
{
  const root = await tempRoot('collision')
  const a = await boot(root)
  const b = await boot(root)
  const ra = await a.tasks.create({ title: 'from a' })
  const rb = await b.tasks.create({ title: 'from b' })
  ok(ra.id === 't-1' && rb.id === 't-1', 'both kernels minted t-1 (the sequence is per instance)', [ra.id, rb.id])
  const settled = await waitFor(async () => {
    const rows = a.store.read('tasks')
    return !!(rows && rows.value && rows.value.data.tasks.length === 2)
  })
  ok(settled, 'the durable board holds BOTH rows after the write-back settled', a.store.read('tasks') && a.store.read('tasks').value.data.tasks.map((r) => [r.id, r.title]))
  const titles = (a.store.read('tasks').value.data.tasks || []).map((r) => r.title).sort()
  ok(titles.join('|') === 'from a|from b', 'neither row was merged away (both titles survive)', titles)
  const fresh = await boot(root)
  const freshTitles = fresh.tasks.list().map((r) => r.title).sort()
  ok(freshTitles.join('|') === 'from a|from b', 'a fresh kernel sees both tasks too', freshTitles)
  const renamed = [a, b].some((k) => k.tasks.sharing().renamed >= 1)
  ok(renamed, 'the re-key is REPORTED in shared().renamed (a collision is not silent)', [a.tasks.sharing().renamed, b.tasks.sharing().renamed])
  // A re-key must not DUPLICATE the row in the instance that was re-keyed: its memory still holds the old id, so a
  // later pull has to recognise the same task under the durable id (identity, not id) instead of minting a third one.
  // Measured before the fix: kernel `b` listed THREE rows for two tasks (`t-1, t-2, t-3`, with `from b` twice).
  for (let i = 0; i < 4; i += 1) { a.tasks.list(); b.tasks.list(); await new Promise((r) => setTimeout(r, 20)) }
  const aRows = a.tasks.list()
  const bRows = b.tasks.list()
  ok(aRows.length === 2 && bRows.length === 2, 'neither kernel duplicated a row on repeated pulls after a re-key',
    { a: aRows.map((r) => [r.id, r.title]), b: bRows.map((r) => [r.id, r.title]) })
  ok(bRows.map((r) => r.title).sort().join('|') === 'from a|from b', 'each memory holds both tasks exactly once', bRows.map((r) => [r.id, r.title]))
}

// ── ⑥ same-revision disagreement: later write wins WITH an explanation ────────────────────────────────────────
section('⑥ owner vs state at the same revision: resolved and EXPLAINED, never silently overwritten')
{
  const root = await tempRoot('conflict')
  const events = []
  const log = (ev) => events.push(ev)
  const a = await boot(root, { log })
  const b = await boot(root, { log })
  await a.tasks.create({ title: 'contested' })
  await waitFor(() => rowOf(b.tasks.list(), 't-1'))
  await a.tasks.assign('t-1', 'res-01')          // revision 2
  await waitFor(() => Number((rowOf(b.tasks.list(), 't-1') || {}).revision) === 2)
  await b.tasks.transition('t-1', 'doing', { reason: 'b started it' })   // also revision 2
  const converged = await waitFor(() => {
    const ra = rowOf(a.tasks.list(), 't-1')
    const rb = rowOf(b.tasks.list(), 't-1')
    return ra && rb && JSON.stringify(ra) === JSON.stringify(rb) ? ra : null
  })
  ok(!!converged, 'the two kernels CONVERGE on one row instead of diverging silently', [rowOf(a.tasks.list(), 't-1'), rowOf(b.tasks.list(), 't-1')])
  ok(converged && converged.owner === 'res-01', 'the row keeps the claim the later write carried', converged)
  const conflicts = a.tasks.sharing().conflicts + b.tasks.sharing().conflicts
  ok(conflicts >= 1, 'the disagreement was COUNTED in shared().conflicts', [a.tasks.sharing().conflicts, b.tasks.sharing().conflicts])
  const logged = events.filter((e) => e && e.type === 'vmu/taskboard-conflict')
  ok(logged.length >= 1, 'and it was LOGGED (vmu/taskboard-conflict), so an operator can see the decision', logged.slice(0, 1))
  ok(logged.length === 0 || Array.isArray(logged[0].conflicts) && logged[0].conflicts[0] && typeof logged[0].conflicts[0].reason === 'string',
    'the log row explains WHY one side won', logged[0] && logged[0].conflicts && logged[0].conflicts[0])
}

// ── ⑦ no store port: durable:false with a NAMED reason ────────────────────────────────────────────────────────
section('⑦ no store port: the board works in memory and says so')
{
  const k = km.createKernel({ clock: () => 1000, settings: {} })
  const made = await k.tasks.create({ title: 'local only' })
  ok(made.ok === true, 'a rootless kernel still creates tasks', made)
  const st = k.tasks.sharing()
  ok(st.durable === false, 'durable is FALSE (not pretended)', st)
  ok(st.source === 'memory' && st.bound === false, 'source names the memory the board really lives in', st)
  ok(typeof st.reason === 'string' && /no store port is bound/.test(st.reason), 'the reason is NAMED, in the caller\'s words', st.reason)
  ok(made.shared && made.shared.durable === false && typeof made.shared.reason === 'string', 'the mutator receipt carries the same honest fact', made.shared)
  ok(k.tasks.list().length === 1, 'and the row is really there in this instance', k.tasks.list())
}

// ── ⑧ a read before store.open() is NAMED and retries (the real boot order) ──────────────────────────────────
section('⑧ read before store.open(): a NAMED refusal that heals, not an empty board')
{
  const root = await tempRoot('early')
  const writer = await boot(root)
  await writer.tasks.create({ title: 'written before the early read' })
  await waitFor(async () => {
    const raw = writer.store.read('tasks')
    return !!(raw && raw.value && raw.value.data.tasks.length === 1)
  })
  const early = km.createKernel({ root, clock: () => 1000, settings: {} })
  const before = early.tasks.list()
  const st = early.tasks.sharing()
  ok(Array.isArray(before) && before.length === 0, 'before open() the read face still ANSWERS (empty), it does not throw', before)
  ok(st.durable === false && st.pullRefused >= 1, 'the refusal is counted, not swallowed', st)
  ok(st.lastError && st.lastError.code === 'VMU_STORE_FAILED', 'and it is NAMED VMU_STORE_FAILED', st.lastError)
  ok(st.lastError && /store is not open/.test(String(st.lastError.message)), 'with the store\'s own message', st.lastError && st.lastError.message)
  ok(typeof (st.lastError && st.lastError.hint) === 'string' && st.lastError.hint.length > 0, 'and a hint that says what to do', st.lastError && st.lastError.hint)
  await early.store.open()
  const healed = await waitFor(() => rowOf(early.tasks.list(), 't-1'))
  ok(!!healed, 'the SAME instance sees the board after open() — the refusal retried', idsOf(early.tasks.list()))
  ok(early.tasks.sharing().durable === true && early.tasks.sharing().pullRefused >= 1, 'durable flips true while the refusal HISTORY is kept', early.tasks.sharing())
}

// ── ⑨ the tool receipt carries the same fact ─────────────────────────────────────────────────────────────────
section('⑨ vibe_vmu_task carries the shared fact (the member reads the board through the TOOL)')
{
  const root = await tempRoot('tool')
  const office = await boot(root)
  const makeSpec = (kernel) => tm.makeTaskSpec({
    param: (type, description, extra = {}) => Object.assign({ type, required: false, description }, extra),
    refused: (code, message, hint) => ({ ok: false, code, message, hint }),
    TOOL_NAMES: { task: 'vibe_vmu_task' },
    kernel,
  })
  const officeSpec = makeSpec(office)
  const memberSpec = makeSpec(await boot(root))
  const created = await officeSpec.run({ action: 'create', title: '经工具建的板' })
  ok(created.ok === true && created.id === 't-1', 'the office creates through the tool', created)
  ok(created.shared && created.shared.durable === true, 'the create receipt names the board as durable', created.shared)
  const listed = await waitFor(async () => {
    const r = await memberSpec.run({ action: 'list' })
    return r && r.ok === true && r.tasks.length === 1 ? r : null
  })
  ok(!!listed, 'the MEMBER tool lists the office row (run 31: the tool showed nothing)', listed && listed.tasks)
  ok(listed && listed.shared && listed.shared.durable === true && listed.shared.source === 'store',
    'the LIST receipt carries durable/source, not just rows', listed && listed.shared)
  ok(listed && listed.shared && listed.shared.writeQueued === false, 'a settled read is not reported as still-settling', listed && listed.shared)
  const rootless = km.createKernel({ clock: () => 1000, settings: {} })
  const localSpec = makeSpec(rootless)
  const localCreate = await localSpec.run({ action: 'create', title: 'local' })
  const localList = await localSpec.run({ action: 'list' })
  ok(localCreate.shared && localCreate.shared.durable === false, 'rootless: the receipt says durable:false', localCreate.shared)
  ok(localList.shared && localList.shared.durable === false && typeof localList.shared.reason === 'string',
    'rootless: the LIST receipt names the reason too', localList.shared)
}

// ── verdict ─────────────────────────────────────────────────────────────────────────────────────────────────
console.log('')
if (failed > 0) console.log('failed: ' + failures.join(' | '))
console.log('=== VMU RUN31 TASKBOARD: ' + passed + ' passed, ' + failed + ' failed ===')
if (failed > 0 || passed === 0) process.exit(1)

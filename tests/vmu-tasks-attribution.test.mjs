// D10 residual — the task board's audit row must say WHO assigned, not only WHO received.
//
// WHAT WAS WRONG (measured before this file existed): `kernel/tasks.js` `assign()` recorded
// `record('task-assigned', { id, who, state })` — `who` is the ASSIGNEE. `setPriority` right above it already recorded
// `by`; `assign` did not. So the ledger could not distinguish:
//   · 我自己认领 (self-claim)      · 院士把我派过去 (the chair assigned me)
// which is exactly the distinction the rule's "任务板可认领/交派" asks the audit trail to preserve. And `kit/extras.js`
// claimed/assigned without ever accepting `by`, so even a caller that knew the actor had no way to hand it over.
//
// THE RULE THIS FILE ENFORCES: `by` is a member id or null; `bySource` says how it is known and is a CLOSED SET
// (`argument` | `caller` | `unknown`). `unknown` MUST carry `by:null` and the other two MUST carry an id — the kernel
// refuses the contradiction by name rather than writing a guess into the ledger.
import { pathToFileURL, fileURLToPath } from 'node:url'
import path from 'node:path'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const TASKS = pathToFileURL(path.join(ROOT, 'vibe-math-vmu/kernel/tasks.js')).href
const KIT = pathToFileURL(path.join(ROOT, 'vibe-math-vmu/kit/extras.js')).href

let passed = 0
const failures = []
const ok = (cond, name, detail) => {
  if (cond) passed++
  else { failed++; failures.push(name + (detail === undefined ? '' : ' [' + detail + ']')) }
}
const failed = { n: 0 }
const refuse = async (fn, code, name) => {
  try { await fn(); failed.n += 1; failures.push(name + ' (did not throw)') }
  catch (e) { ok(e && e.code === code, name, e && (e.code + ' / ' + e.message)) }
}

const T = await import(TASKS)
const K = await import(KIT)

let NOW = Date.parse('2026-10-23T00:00:00.000Z')
const clock = () => NOW
const mkTasks = (settings = {}) => T.createTasks({ clock, log: () => {}, settings })
const mkKernel = (tasks) => ({ tasks, settings: {}, settingsView: () => ({}) })

// `create()` answers a receipt (id/state); the compare-and-set token lives on the BOARD row, which is where a caller
// is expected to take it from (`task_list`/`task_get`) — so the helper reads it back instead of inventing a revision.
const newTask = async (tasks, title) => {
  const made = await tasks.create({ title })
  const listed = await tasks.list()
  const rows = Array.isArray(listed) ? listed : (listed.tasks || [])
  const row = rows.filter((r) => r.id === made.id)[0]
  return { id: made.id, revision: row.revision }
}

// ---- 1. kernel: a self-claim records the claimer as the actor -------------------------------------
{
  const tasks = mkTasks()
  const t = await newTask(tasks, 'sweep the calculus')
  const r = await tasks.assign(t.id, 'm-a', { expectedRevision: t.revision, by: 'm-a', bySource: 'caller' })
  ok(r.ok === true && r.by === 'm-a' && r.bySource === 'caller', '★ 正：自己认领 ⇒ 回执 by=自己、bySource=caller', r)
  const row = tasks.history().filter((h) => h.what === 'task-assigned').pop()
  ok(row && row.by === 'm-a' && row.bySource === 'caller' && row.who === 'm-a',
    '★★★ 正（核心）：self-claim 的审计行同时有 who（被派者）与 by（执行者），两者同为本人', row)
}

// ---- 2. kernel: the chair assigns somebody else — who ≠ by ----------------------------------------
{
  const tasks = mkTasks()
  const t = await newTask(tasks, 'prove the lemma')
  const r = await tasks.assign(t.id, 'm-b', { expectedRevision: t.revision, by: 'm-chair', bySource: 'argument' })
  ok(r.ok === true && r.owner === 'm-b' && r.by === 'm-chair', '★ 正：院士派给他人 ⇒ owner=被派者、by=院士', r)
  const row = tasks.history().filter((h) => h.what === 'task-assigned').pop()
  ok(row && row.who === 'm-b' && row.by === 'm-chair' && row.bySource === 'argument',
    '★★★ 正（核心）：被派者与执行者是两个不同的 id，台账能区分「我认领」与「院士派的」', row)
}

// ---- 3. kernel: without an actor the row says UNKNOWN, never a guess -------------------------------
{
  const tasks = mkTasks()
  const t = await newTask(tasks, 'read the source')
  const r = await tasks.assign(t.id, 'm-c', { expectedRevision: t.revision })
  ok(r.ok === true && r.by === null && r.bySource === 'unknown',
    '★ 正：没给 by ⇒ by:null 且 bySource:"unknown"（不猜成院士、不拿被派者冒充执行者）', r)
  const row = tasks.history().filter((h) => h.what === 'task-assigned').pop()
  ok(row && row.by === null && row.bySource === 'unknown' && row.who === 'm-c',
    '★★ 正：审计行里 by 是 null 而不是缺失，bySource 说明「不知道」', row)
}

// ---- 4. kernel: missing source defaults to `argument` when an id was given -------------------------
{
  const tasks = mkTasks()
  const t = await newTask(tasks, 'audit the chain')
  const r = await tasks.assign(t.id, 'm-d', { expectedRevision: t.revision, by: 'm-chair' })
  ok(r.by === 'm-chair' && r.bySource === 'argument', '★ 正：只给 by ⇒ 视为 argument（调用方明确交过来）', r)
}

// ---- 5. kernel: refusals are NAMED, and happen BEFORE the board moves -----------------------------
{
  const tasks = mkTasks()
  const t = await newTask(tasks, 'guarded row')
  await refuse(() => tasks.assign(t.id, 'm-e', { expectedRevision: t.revision, by: 'm-x', bySource: 'unknown' }),
    'VMU_INVALID_ARGUMENT', '★ 反：bySource:"unknown" 却带着 id ⇒ 具名拒（自相矛盾）')
  await refuse(() => tasks.assign(t.id, 'm-e', { expectedRevision: t.revision, bySource: 'argument' }),
    'VMU_INVALID_ARGUMENT', '★ 反：bySource:"argument" 却没有 id ⇒ 具名拒')
  await refuse(() => tasks.assign(t.id, 'm-e', { expectedRevision: t.revision, by: 42 }),
    'VMU_INVALID_ARGUMENT', '★ 反：by 不是字符串 ⇒ 具名拒')
  await refuse(() => tasks.assign(t.id, 'm-e', { expectedRevision: t.revision, by: 'm-x', bySource: 'chair' }),
    'VMU_INVALID_ARGUMENT', '★ 反：bySource 不在闭集 ⇒ 具名拒（不发明第四个来源）')
  const after = (await tasks.list()).tasks ? (await tasks.list()) : await tasks.list()
  const row = (Array.isArray(after) ? after : after.tasks).filter((x) => x.id === t.id)[0]
  ok(row && row.owner === null, '★★ 反（无副作用）：被拒的 assign 一条都没把 owner 落盘', row && row.owner)
  ok(tasks.history().filter((h) => h.what === 'task-assigned').length === 0,
    '★★ 反（无副作用）：被拒的调用不写审计行（校验在变更之前）', tasks.history().length)
}

// ---- 6. the FACE: claim defaults by to the claiming member ----------------------------------------
{
  const tasks = mkTasks()
  const t = await newTask(tasks, 'claim me')
  const out = await K.toolTaskUpdate({ task_id: t.id, action: 'claim', member: 'm-f', expected_revision: t.revision }, { kernel: mkKernel(tasks) })
  ok(out.ok === true && out.by === 'm-f' && out.bySource === 'caller',
    '★★ 正：面参 claim 不给 by ⇒ by=认领人、来源 caller（「我自己认领」）', out)
  const row = tasks.history().filter((h) => h.what === 'task-assigned').pop()
  ok(row && row.by === 'm-f' && row.who === 'm-f', '★★ 正：面的 claim 走同一台账行', row)
}

// ---- 7. the FACE: assign/reassign without by says unknown; with by says argument -------------------
{
  const tasks = mkTasks()
  const t = await newTask(tasks, 'assign me')
  const bare = await K.toolTaskUpdate({ task_id: t.id, action: 'assign', owner: 'm-g', expected_revision: t.revision }, { kernel: mkKernel(tasks) })
  ok(bare.ok === true && bare.by === null && bare.bySource === 'unknown',
    '★★ 正：面参 assign 不给 by ⇒ 不猜（by:null/unknown），而不是拿 owner 冒充执行者', bare)
  const t2 = await newTask(tasks, 'assign me again')
  const named = await K.toolTaskUpdate({ task_id: t2.id, action: 'reassign', owner: 'm-h', by: 'm-chair', expected_revision: t2.revision }, { kernel: mkKernel(tasks) })
  ok(named.ok === true && named.by === 'm-chair' && named.bySource === 'argument',
    '★★ 正：面参 reassign 带 by ⇒ 审计认院士为执行者', named)
  const row = tasks.history().filter((h) => h.what === 'task-assigned').pop()
  ok(row && row.who === 'm-h' && row.by === 'm-chair', '★★★ 正：』院士把我派过去』这一格能被读出来', row)
}

// ---- 8. the CLOSED SET is exported (so a pack can read the vocabulary instead of guessing) ---------
{
  ok(Array.isArray(T.ACTOR_SOURCES) && T.ACTOR_SOURCES.join(',') === 'argument,caller,unknown',
    '★ 正：ACTOR_SOURCES 是闭集且被导出（消费方读词表，不自己发明来源）', T.ACTOR_SOURCES)
  const a = T.normaliseActor('m-i')
  ok(a.by === 'm-i' && a.bySource === 'argument', '★ 正：normaliseActor 无来源 ⇒ argument', a)
}

if (failures.length) {
  console.error('vmu-tasks-attribution: ' + passed + ' passed, ' + (failures.length) + ' failed')
  for (const f of failures) console.error('  ✗ ' + f)
} else {
  console.log('vmu-tasks-attribution: ' + passed + ' passed, 0 failed')
}
process.exit(failures.length ? 1 : 0)

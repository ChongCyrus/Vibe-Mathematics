// vibe-math-vmu/kit/extras.js — PHASE 8 / B-3: the task board (4) + the Lean five (5), EXTRACTED VERBATIM from the pack.
//
// Kit boundaries (tests/audit-kit-boundaries): no spawn, no filesystem, no new error codes. The Lean tools never start a
// process themselves — they call the kernel face and carry its NAMED refusal text verbatim (需内核能力：宿主 spawn 接缝).
//
// POLLS ARE NOT HERE, deliberately: their eligibility rules (which SLOTS may vote / chair-only) are institution policy,
// and parameterising them would change the handler signature the pack spec already publishes. They stay in the pack.

import { KIT_HELPERS } from './handlers.js'
// ★ THE LEGAL STATES COME FROM THE KERNEL, never a local copy: `TASK_STATES` is frozen there, and a second list here would
// be exactly the "two sources that drift" shape this project keeps removing. Importing it is also what makes the refusal
// below able to say the real values instead of a vague "invalid status".
import { TASK_STATES } from '../kernel/tasks.js'
const { str, has, refuse } = KIT_HELPERS

function tasksOf(kernel) {
  if (!kernel || !kernel.tasks || typeof kernel.tasks.list !== 'function') {
    throw refuse('VMU_ENGINE_UNAVAILABLE', 'this kernel publishes no task ledger, so the v5r task tools are absent',
      'assemble a kernel with the tasks service (it is part of the framework)')
  }
  return kernel.tasks
}

const rowsOf = (listed) => (Array.isArray(listed) ? listed : (listed && Array.isArray(listed.tasks) ? listed.tasks : []))

async function toolTaskCreate(args = {}, { kernel } = {}) {
  const tasks = tasksOf(kernel)
  if (!has(args.subject)) {
    throw refuse('VMU_INVALID_ARGUMENT', 'task_create needs a subject',
      'pass subject:"what the task is" (the original REQUIRED it)')
  }
  // ★ PHASE 7 round 23: the task ledger DOES carry a priority column now (`kernel/tasks.js:211` create takes
  // `priority = 0`, `:234` stores it, `:371` sorts the board by it). The old note said the column did not exist — stale.
  const priority = Number.isInteger(args.priority) ? args.priority : 0
  const made = await tasks.create({
    title: str(args.subject),
    objective: has(args.description) ? str(args.description) : null,
    owner: has(args.owner) ? str(args.owner) : null,
    deps: Array.isArray(args.blocked_by) ? args.blocked_by.map(String) : null,
    writeScopes: Array.isArray(args.write_scopes) ? args.write_scopes.map(String) : [],
    priority,
  })
  return { ok: true, tool: 'vibe_v5_task_create', task: made, priority,
    note: 'priority is STORED (the ledger has the column and lists the board by it); the original also treated it as a hint — here it is real data' }
}

async function toolTaskList(args = {}, { kernel } = {}) {
  const tasks = tasksOf(kernel)
  const all = rowsOf(await tasks.list())
  let out = all
  if (has(args.status)) {
    const want = str(args.status)
    // ★★★ "all" IS NOT A STATUS, AND SILENTLY RETURNING NOTHING FOR IT IS A LIE THE READER CANNOT SEE. Measured on a full
    // live run: `task_list {status:'all'}` returned zero rows while the SAME receipt carried `total: 2`, so the caller saw
    // "no tasks" beside evidence of two. The old line compared the literal string against each row's state and matched
    // nothing - a filter that cannot distinguish "all" from a typo.
    // ★ So: "all" (and "*") mean NO FILTER, and an UNKNOWN status is REFUSED BY NAME with the legal values - which also
    // answers the second half of the live report, that `in_progress` was rejected without saying what the real states are
    // (`doing` is the state; `in_progress` never existed).
    if (want === 'all' || want === '*') {
      // no filter, said explicitly
    } else if (!TASK_STATES.includes(want)) {
      throw refuse('VMU_INVALID_ARGUMENT', 'unknown task status: ' + want,
        'valid: all, ' + TASK_STATES.join(', ') + ' — note the state is "doing" (there is no "in_progress")')
    } else {
      out = out.filter((t) => String(t.status || t.state) === want)
    }
  }
  if (has(args.owner)) out = out.filter((t) => String(t.owner) === str(args.owner))
  // "ready" DERIVED, not guessed: a row is ready when it declares no unfinished blocker. The kernel hands the
  // blocked-by list out; this filter reads it, it does not invent a readiness rule of its own.
  if (args.ready === true) out = out.filter((t) => !Array.isArray(t.blockedBy) || t.blockedBy.length === 0)
  return { ok: true, tool: 'vibe_v5_task_list', count: out.length, total: all.length, tasks: out }
}

const TASK_UPDATE_FACE_OPS = Object.freeze(['claim', 'reassign', 'complete', 'reopen', 'set_dependencies'])

async function toolTaskUpdate(args = {}, { kernel } = {}) {
  const tasks = tasksOf(kernel)
  if (!has(args.task_id)) throw refuse('VMU_INVALID_ARGUMENT', 'task_update needs task_id', 'pass task_id:"t-…"')
  if (!has(args.action)) throw refuse('VMU_INVALID_ARGUMENT', 'task_update needs action', 'supported: ' + TASK_UPDATE_FACE_OPS.join(', '))
  const rev = Number(args.expected_revision)
  if (!Number.isInteger(rev)) {
    throw refuse('VMU_INVALID_ARGUMENT', 'task_update needs expected_revision (the compare-and-set token)',
      'take it from task_list/task_get; a stale revision must be refused, not overwritten')
  }
  const action = str(args.action)
  const id = str(args.task_id)
  if (!TASK_UPDATE_FACE_OPS.includes(action)) {
    throw refuse('VMU_INVALID_ARGUMENT', 'task action "' + action + '" has NO task-face operation in this kernel',
      'the original allowed edit/delete/release; this kernel\'s ledger exposes only ' + TASK_UPDATE_FACE_OPS.join(', ') + ' — the missing ones are refused by name rather than faked')
  }
  if (action === 'claim') {
    if (!has(args.member)) throw refuse('VMU_INVALID_ARGUMENT', 'claim needs the claiming member', 'pass member:"<roster id>"')
    const done = await tasks.assign(id, str(args.member), { expectedRevision: rev })
    return { ok: true, tool: 'vibe_v5_task_update', action, task: done }
  }
  if (action === 'reassign') {
    if (!has(args.owner)) throw refuse('VMU_INVALID_ARGUMENT', 'reassign needs the new owner', 'pass owner:"<roster id>"')
    const done = await tasks.assign(id, str(args.owner), { expectedRevision: rev })
    return { ok: true, tool: 'vibe_v5_task_update', action, task: done }
  }
  if (action === 'complete' || action === 'reopen') {
    const to = action === 'complete' ? 'done' : 'open'
    const done = await tasks.transition(id, to, { reason: 'vibe_v5_task_update ' + action, expectedRevision: rev })
    return { ok: true, tool: 'vibe_v5_task_update', action, to, task: done }
  }
  const deps = Array.isArray(args.blocked_by) ? args.blocked_by.map(String) : []
  const done = await tasks.setDependencies(id, deps, { expectedRevision: rev })
  return { ok: true, tool: 'vibe_v5_task_update', action, blockedBy: deps, task: done }
}



async function toolTaskGet(args = {}, { kernel } = {}) {
  if (!has(args.id) && !has(args.task_id)) throw refuse('VMU_INVALID_ARGUMENT', 'task_get needs the task id', 'pass id:"t-…" (from task_list)')
  const id = str(args.id || args.task_id)
  const rows = rowsOf(await tasksOf(kernel).list())
  const row = rows.filter((t) => String(t.id) === id)[0]
  if (!row) throw refuse('VMU_NO_SUCH_OBJECT', 'no task "' + id + '" on this board', 'call task_list for the real ids')
  let brief = null
  if (kernel.tasks && typeof kernel.tasks.briefOf === 'function') brief = kernel.tasks.briefOf(id)
  return { ok: true, tool: 'vibe_v5_task_get', task: row, brief }
}

function leanFaceOrRefuse(kernel, what) {
  const lean = kernel && kernel.lean
  if (!lean || typeof lean.submit !== 'function') {
    throw refuse('VMU_ENGINE_UNAVAILABLE', what + ' needs the Lean face, and this assembly has none (the host injected no spawn seam)',
      '需内核能力：宿主 spawn 接缝（kernel/index.js 只在 spawn 存在时创建 Lean face）。本包不自己起子进程——那是内核/特殊脚本的活')
  }
  return lean
}

const LEAN_ARCHIVE_KIND_MAP = Object.freeze({ def: 'def', lemma: 'lemma', proof: 'theorem', blocked: 'assumption' })

/** ★ `vibe_v5_lean_run` — compile one existing .lean FILE through the kernel's Lean face (the face owns the process,
 * the timeout and the cancel path). A per-call timeout is NOT supported (the face declares vmu.math.leanTimeoutMs). */
async function toolLeanRun(args = {}, { kernel } = {}) {
  if (!has(args.file)) throw refuse('VMU_INVALID_ARGUMENT', 'lean_run needs file', 'pass file:"Formal/x.lean"')
  const lean = leanFaceOrRefuse(kernel, 'vibe_v5_lean_run')
  const statement = has(args.target) ? str(args.target) : (has(args.statement) ? str(args.statement) : '')
  const submitted = await lean.submit({ statement, file: str(args.file), member: has(args.member) ? str(args.member) : '' })
  return { ok: true, tool: 'vibe_v5_lean_run', job: submitted,
    unapplied: has(args.timeout_ms) ? [{ rule: 'timeout_ms', why: 'the Lean face times out on its declared vmu.math.leanTimeoutMs; a per-call timeout is not part of submit()' }] : [],
    note: 'the process, the timeout and the cancel path belong to the Lean face (spawn seam); this tool only submits' }
}
async function toolLeanJob(args = {}, { kernel } = {}) {
  const lean = leanFaceOrRefuse(kernel, 'vibe_v5_lean_job')
  if (has(args.jobId)) return { ok: true, tool: 'vibe_v5_lean_job', job: lean.status(str(args.jobId)) }
  return { ok: true, tool: 'vibe_v5_lean_job', jobs: lean.list(),
    note: has(args.waitMs) ? 'waitMs is not applied: the job queue returns its current state; observe again after a wake' : undefined }
}
async function toolLeanLib(args = {}, { kernel } = {}) {
  const lean = leanFaceOrRefuse(kernel, 'vibe_v5_lean_lib')
  return { ok: true, tool: 'vibe_v5_lean_lib', lib: await lean.lib({ refresh: args.refresh === true }) }
}
async function toolLeanRead(args = {}, { kernel } = {}) {
  if (!has(args.name)) throw refuse('VMU_INVALID_ARGUMENT', 'lean_read needs name', 'pass name:"<archived name>" (see lean_lib)')
  const lean = leanFaceOrRefuse(kernel, 'vibe_v5_lean_read')
  return { ok: true, tool: 'vibe_v5_lean_read', card: await lean.read({ name: str(args.name) }),
    note: has(args.kind) ? 'kind (auto/lib/proved) is not applied: this kernel keeps ONE archive namespace (def/lemma/theorem/assumption)' : undefined }
}
async function toolLeanArchive(args = {}, { kernel } = {}) {
  if (!has(args.kind)) throw refuse('VMU_INVALID_ARGUMENT', 'lean_archive needs kind', 'the original offered def/lemma/proof/blocked')
  const mapped = LEAN_ARCHIVE_KIND_MAP[str(args.kind)]
  if (!mapped) throw refuse('VMU_INVALID_ARGUMENT', 'unknown archive kind: ' + str(args.kind), 'the original offered: ' + Object.keys(LEAN_ARCHIVE_KIND_MAP).join(', '))
  if (!has(args.name)) throw refuse('VMU_INVALID_ARGUMENT', 'lean_archive needs name', 'give a stable name: read() and lib() use it')
  const file = has(args.from) ? str(args.from) : (has(args.file) ? str(args.file) : '')
  if (!file) throw refuse('VMU_INVALID_ARGUMENT', 'lean_archive needs the existing .lean file (from/file)', 'this face registers existing files; it does not take inline content')
  const lean = leanFaceOrRefuse(kernel, 'vibe_v5_lean_archive')
  const archived = await lean.archive({ name: str(args.name), kind: mapped, file, statement: has(args.target) ? str(args.target) : '' })
  return { ok: true, tool: 'vibe_v5_lean_archive', mappedKind: mapped, archived,
    note: has(args.content) ? 'content is NOT stored: the archive registers existing files by hash (write the file first)' : undefined }
}

export const KIT_TASKS = Object.freeze({ create: toolTaskCreate, list: toolTaskList, update: toolTaskUpdate, get: toolTaskGet })
export const KIT_LEAN = Object.freeze({ run: toolLeanRun, job: toolLeanJob, lib: toolLeanLib, read: toolLeanRead, archive: toolLeanArchive })
export const KIT_TASK_HELPERS = Object.freeze({ tasksOf, rowsOf })
export { toolTaskCreate, toolTaskList, toolTaskUpdate, toolTaskGet }
export { toolLeanRun, toolLeanJob, toolLeanLib, toolLeanRead, toolLeanArchive, leanFaceOrRefuse, tasksOf, rowsOf }

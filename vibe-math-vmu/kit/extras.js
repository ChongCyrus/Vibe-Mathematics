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

// ★★★ THE LEDGER'S TWO REAL VERBS NOW HAVE FACE NAMES. Measured on a full live run: a member wanted to ASSIGN and to
// TRANSITION a task, and this face accepted neither word. Neither was a missing capability - `claim`/`reassign` already call
// `tasks.assign`, and `tasks.transition` exists in the kernel - so the gap was that the face's VOCABULARY was narrower than the
// ledger's, and a caller using the ledger's words was refused. That is the opposite of the named-refusal red line: a refusal is
// only useful when the caller's intent has NO operation behind it.
// ★ `assign` is the ledger's own name for what `claim`/`reassign` do; `transition` is the generic move the kernel publishes
// (`to` plus a reason) and which had NO face at all.
const TASK_UPDATE_FACE_OPS = Object.freeze(['claim', 'reassign', 'assign', 'transition', 'complete', 'reopen', 'set_dependencies'])

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
  // ★ ROUND 53 (D10): the ledger's audit row now carries WHO did it (`by`) next to WHOM it happened to (`who`), and
  // this face states where that knowledge came from instead of leaving it implicit:
  //   · claim — the claiming member IS the actor, so `by` defaults to `member` with source `caller`; an explicit `by`
  //             (a chair claiming on someone's behalf, recorded as such) wins with source `argument`;
  //   · assign / reassign — this face does NOT know the caller's identity, so without `by` the row says
  //             `by:null, bySource:'unknown'`. The kernel refuses to invent a chair or to reuse the assignee as actor.
  if (action === 'claim') {
    if (!has(args.member)) throw refuse('VMU_INVALID_ARGUMENT', 'claim needs the claiming member', 'pass member:"<roster id>"')
    const declared = has(args.by) ? str(args.by) : null
    const done = await tasks.assign(id, str(args.member), { expectedRevision: rev,
      by: declared === null ? str(args.member) : declared, bySource: declared === null ? 'caller' : 'argument' })
    return { ok: true, tool: 'vibe_v5_task_update', action, by: done.by, bySource: done.bySource, task: done }
  }
  if (action === 'reassign' || action === 'assign') {
    const owner = has(args.owner) ? str(args.owner) : (has(args.member) ? str(args.member) : null)
    if (!owner) {
      throw refuse('VMU_INVALID_ARGUMENT', action + ' needs the new owner', 'pass owner:"<roster id>" (member: is accepted too)')
    }
    const done = await tasks.assign(id, owner, { expectedRevision: rev,
      by: has(args.by) ? str(args.by) : null, bySource: has(args.by) ? 'argument' : 'unknown' })
    return { ok: true, tool: 'vibe_v5_task_update', action, owner, by: done.by, bySource: done.bySource, task: done }
  }
  // ★ TRANSITION: the generic move the kernel publishes, which this face simply did not expose. The `to` state is the caller's
  // choice and the kernel's transition table is what judges it - so an illegal move is refused BY THE KERNEL, with its own code,
  // not by a list this face invents.
  if (action === 'transition') {
    if (!has(args.to)) throw refuse('VMU_INVALID_ARGUMENT', 'transition needs the target state', 'pass to:"open|assigned|doing|done|cancelled" (the transition table in kernel/tasks.js judges it)')
    const reason = has(args.why) ? str(args.why) : (has(args.reason) ? str(args.reason) : 'vibe_v5_task_update transition')
    const done = await tasks.transition(id, str(args.to), { reason, expectedRevision: rev })
    return { ok: true, tool: 'vibe_v5_task_update', action, to: str(args.to), task: done }
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
  let briefNote = null
  // ★★★ A READ MUST NOT FAIL BECAUSE AN OPTIONAL PART IS ABSENT. Measured on a full live run: `task_get` refused the WHOLE row when
  // the task had no brief, so the caller could not read the task it had just been told about. The row and the brief are two
  // facts: the row always exists once its id matches, the brief may legitimately not.
  // ★ AND THE FAILURE IS NOT SWALLOWED: when the brief lookup itself throws (rather than returning nothing), that is reported
  // in `briefNote` - the read succeeds, and the reason the brief is missing stays visible instead of being lost.
  let briefMeans = null
  if (kernel.tasks && typeof kernel.tasks.briefOf === 'function') {
    try { brief = kernel.tasks.briefOf(id) } catch (e) {
      brief = null
      const code = e && e.code ? String(e.code) : null
      const msg = String((e && e.message) || e || '')
      // ★ LIVE RUN 119 (F-119a): an OPTIONAL part that is simply ABSENT is not a FAILED LOOKUP. The board's own refusal for
      // "this task has no brief" (VMU_NO_SUCH_OBJECT, message "task t-1 has no brief") used to surface here as
      // `briefNote:"brief lookup failed: VMU_NO_SUCH_OBJECT"`, which reads like a broken read: on the live run the member
      // said (in its own words) "the brief lookup failed", and built a whole obstacle card around a mechanism problem that
      // did not exist. Absence gets its own sentence naming the setter; only a REAL failure keeps the "lookup failed:" form.
      if (code === 'VMU_NO_SUCH_OBJECT' && /has no brief/.test(msg)) {
        briefNote = null
        briefMeans = 'this task has no brief attached: the board holds none for it. A brief is OPTIONAL (docs/08) and is set by the '
          + 'owner path with vibe_vmu_task { action: "brief", id, text }. No brief ≠ a broken lookup: this answer was read, not refused.'
      } else {
        briefNote = 'brief lookup failed: ' + String(code || msg)
      }
    }
  } else {
    briefMeans = 'this assembly publishes no briefOf, so the task has no brief to read'
  }
  return { ok: true, tool: 'vibe_v5_task_get', task: row, brief,
    ...(briefNote ? { briefNote } : {}), ...(briefMeans ? { briefMeans } : {}) }
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
  // ★★ LIVE RUN 59 — THE ALIAS OUTRANKED THE FIELD IT ALIASES. `target` used to win over `statement`, so a call that
  // gave ONLY `target` (a card id, e.g. "p-odd-sum") was accepted and the audit recorded that ID as the proposition
  // text. Two slips in one line: the legacy alias silently shadowed the documented field, and a required field could be
  // satisfied by a name that is not the thing it names. The rule now mirrors lean_archive's from/file rule — the
  // documented field wins, two names that disagree are REFUSED by name, and `target` alone cannot stand in for the
  // proposition (an object id is not a proposition).
  const statementRaw = has(args.statement) ? str(args.statement).trim() : ''
  const targetRaw = has(args.target) ? str(args.target).trim() : ''
  if (statementRaw && targetRaw && statementRaw !== targetRaw) {
    throw refuse('VMU_INVALID_ARGUMENT', 'lean_run got BOTH statement and target with different values',
      'pass statement (the proposition text) — target is a legacy alias and used to win silently; the audit records statement')
  }
  const statement = statementRaw || ''
  if (!statement && targetRaw) {
    throw refuse('VMU_LEAN_STATEMENT_REQUIRED', 'lean_run got target:"' + targetRaw + '" but no statement',
      'pass statement:"<the proposition text>" — target names an OBJECT (a card id); the receipt and the audit are about the proposition, not about the object it lives on')
  }
  // ★★ RUN 156 (real machine, run 5 / N1): the kernel's submit() has always honoured a caller-chosen `jobId`
  // (`kernel/lean.js` `const requestedId = String(args.jobId || '').trim()`), but this tool never forwarded it - so the
  // VMU_MATH_JOB_ID_TAKEN refusal's one documented exit (`pass jobId:"<your id>"`) was unreachable through the face
  // that printed it. Forward it now; when the caller names no id the face mints one and re-mints on a mirror collision.
  const submitted = await lean.submit({ statement, file: str(args.file), member: has(args.member) ? str(args.member) : '',
    jobId: has(args.jobId) ? str(args.jobId) : undefined })
  // ★★ LIVE RUN 64 · F-56 — ONE ENVELOPE, NOT TWO. The face already answers in an envelope (`{ok, id, state}`, and for
  // status `{ok, job}` / for list `{ok, count, jobs}`). Wrapping that envelope AGAIN under a key put the same facts one
  // level deeper and at a DIFFERENT path per tool: `lean_run` answered `job.id` (because the inner object happened to
  // carry `id`), while `lean_job {jobId}` answered `job.job.hashUnchanged`. A reader that asked the field-level question
  // we had just made determinate (F-55) got `undefined` again — the exact bug class ROUND 63 closed, reintroduced by the
  // pack's own wrapper. So every lean tool now SPREADS the face's envelope into the receipt and names itself with `tool`;
  // the shape is the same for run, status and list, and `receipt.<field>` is where the field is.
  return { ...submitted, ok: true, tool: 'vibe_v5_lean_run',
    unapplied: has(args.timeout_ms) ? [{ rule: 'timeout_ms', why: 'the Lean face times out on its declared vmu.math.leanTimeoutMs; a per-call timeout is not part of submit()' }] : [],
    note: 'the process, the timeout and the cancel path belong to the Lean face (spawn seam); this tool only submits' }
}
async function toolLeanJob(args = {}, { kernel } = {}) {
  const lean = leanFaceOrRefuse(kernel, 'vibe_v5_lean_job')
  // Same rule as lean_run (F-56): spread the face's envelope, never nest it. `job` is therefore the RECORD, and the
  // field-level questions (`hashUnchanged` / `hashUnchangedState` / `hashUnchangedReason`) sit at `receipt.job.*`.
  if (has(args.jobId)) {
    // ★★ RUN 153 (real machine, run 3 / agent report G3): `status()` looks in THIS process's job table first and then in
    // the durable mirror's in-memory map — but that map is filled by `list()`, so a job file written by an EARLIER kernel
    // process (`Formal/Jobs/lean-6.json`, settled/passed/exit 0) was reported as `VMU_LEAN_NOT_FOUND` while its file sat
    // on disk. The hint already promised "readable by id (mirror hydrate)" — now the read hydrates. And when it really is
    // nowhere, the refusal says WHICH TWO places were searched instead of implying a single namespace.
    const jobId = str(args.jobId)
    let first = null
    try { first = lean.status(jobId) } catch (e) { first = e }
    if (first && first.ok === true) return { ...first, tool: 'vibe_v5_lean_job' }
    let mirrors = null
    try { mirrors = typeof lean.listMirrors === 'function' ? await lean.listMirrors() : null } catch (e) { mirrors = null }
    if (mirrors !== null) {
      let second = null
      try { second = lean.status(jobId) } catch (e) { second = e }
      if (second && second.ok === true) return { ...second, tool: 'vibe_v5_lean_job', hydrated: true,
        means: 'this job was not created by the running kernel process: it was read back from the durable job mirror after hydrating it' }
      const dir = mirrors && mirrors.dir ? String(mirrors.dir) : 'Formal/Jobs'
      const count = mirrors && typeof mirrors.count === 'number' ? mirrors.count : null
      // ★ RUN 153 (F-56p, still in force): a refusal is a RECEIPT at the top level, not a thrown exception — every lean
      // tool spreads its envelope and this one must not be the exception that makes a caller parse two shapes. The
      // `searched` block names both places, so "not found" is checkable instead of asserted.
      return { ok: false, code: 'VMU_LEAN_NOT_FOUND',
        message: '找不到 Lean 作业 ' + jobId + '：本内核进程没有它，作业镜像 ' + dir + ' 里也没有' + (count === null ? '' : '（镜像现有 ' + String(count) + ' 条）'),
        hint: '换个 id 前先看点哪里找过：进程内表格（本次内核启动以来跑的作业）与持久镜像 ' + dir + '/<jobId>.json；两者都没有才叫「没有这个作业」',
        searched: { process: 'this kernel process (jobs created since it started)', mirror: { dir, count } },
        tool: 'vibe_v5_lean_job' }
    }
    return { ...first, tool: 'vibe_v5_lean_job' }
  }
  return { ...lean.list(), tool: 'vibe_v5_lean_job',
    note: has(args.waitMs) ? 'waitMs is not applied: the job queue returns its current state; observe again after a wake' : undefined }
}
async function toolLeanLib(args = {}, { kernel } = {}) {
  const lean = leanFaceOrRefuse(kernel, 'vibe_v5_lean_lib')
  return { ...(await lean.lib({ refresh: args.refresh === true })), tool: 'vibe_v5_lean_lib' }
}
async function toolLeanRead(args = {}, { kernel } = {}) {
  if (!has(args.name)) throw refuse('VMU_INVALID_ARGUMENT', 'lean_read needs name', 'pass name:"<archived name>" (see lean_lib)')
  const lean = leanFaceOrRefuse(kernel, 'vibe_v5_lean_read')
  // ★ F-56 also applies here: same spread-not-nest rule as lean_run / lean_job — the face's envelope IS the receipt.
  return { ...(await lean.read({ name: str(args.name) })), tool: 'vibe_v5_lean_read',
    note: has(args.kind) ? 'kind (auto/lib/proved) is not applied: this kernel keeps ONE archive namespace (def/lemma/theorem/assumption)' : undefined }
}
async function toolLeanArchive(args = {}, { kernel } = {}) {
  if (!has(args.kind)) throw refuse('VMU_INVALID_ARGUMENT', 'lean_archive needs kind', 'the original offered def/lemma/proof/blocked')
  const mapped = LEAN_ARCHIVE_KIND_MAP[str(args.kind)]
  if (!mapped) throw refuse('VMU_INVALID_ARGUMENT', 'unknown archive kind: ' + str(args.kind), 'the original offered: ' + Object.keys(LEAN_ARCHIVE_KIND_MAP).join(', '))
  if (!has(args.name)) throw refuse('VMU_INVALID_ARGUMENT', 'lean_archive needs name', 'give a stable name: read() and lib() use it')
  // ★★ TWO NAMES FOR ONE THING MUST NOT SILENTLY DISAGREE. `from` used to take priority over `file`: a caller that passed BOTH
  // got `from` and never learned that `file` was ignored. Measured on a full live run - the agent supplied both and could not
  // tell which one the archive used. A silent shadow is the same failure as a silent no-op: the caller believes something that
  // did not happen. So: one name, or two names that AGREE; two that DISAGREE are refused by name.
  const fromRaw = has(args.from) ? str(args.from) : null
  const fileRaw = has(args.file) ? str(args.file) : null
  if (fromRaw !== null && fileRaw !== null && fromRaw !== fileRaw) {
    throw refuse('VMU_INVALID_ARGUMENT', 'lean_archive got BOTH from and file with different values',
      'pass ONE of them (they name the same thing): from=' + fromRaw + ' file=' + fileRaw +
      ' — the archive used to prefer `from` and silently ignore `file`, which is why this is now refused')
  }
  const file = fromRaw !== null ? fromRaw : (fileRaw !== null ? fileRaw : '')
  if (!file) throw refuse('VMU_INVALID_ARGUMENT', 'lean_archive needs the existing .lean file (from/file)', 'this face registers existing files; it does not take inline content')
  const lean = leanFaceOrRefuse(kernel, 'vibe_v5_lean_archive')
  // ★ LIVE RUN 59: a member archived a compiled lemma with the proposition text in `note` and the library came back
  // with `statement:""` — the archive face had no `statement` parameter at all and only ever filled the field from the
  // legacy `target` alias. The registered entry must be able to answer "what does this file formalise", so the text is
  // now a first-class argument (still accepting `target` as its legacy alias, and refusing two names that disagree).
  const archStatementRaw = has(args.statement) ? str(args.statement).trim() : ''
  const archTargetRaw = has(args.target) ? str(args.target).trim() : ''
  if (archStatementRaw && archTargetRaw && archStatementRaw !== archTargetRaw) {
    throw refuse('VMU_INVALID_ARGUMENT', 'lean_archive got BOTH statement and target with different values',
      'pass statement (the proposition text this file formalises) — target is its legacy alias')
  }
  const archived = await lean.archive({ name: str(args.name), kind: mapped, file, statement: archStatementRaw || archTargetRaw })
  // ★ F-56: spread the face's answer (it already carries ok/name/kind/file/statement/hash/persisted/persistence).
  return { ...archived, tool: 'vibe_v5_lean_archive', mappedKind: mapped,
    note: has(args.content) ? 'content is NOT stored: the archive registers existing files by hash (write the file first)' : undefined }
}

export const KIT_TASKS = Object.freeze({ create: toolTaskCreate, list: toolTaskList, update: toolTaskUpdate, get: toolTaskGet })
export const KIT_LEAN = Object.freeze({ run: toolLeanRun, job: toolLeanJob, lib: toolLeanLib, read: toolLeanRead, archive: toolLeanArchive })
export const KIT_TASK_HELPERS = Object.freeze({ tasksOf, rowsOf })
export { toolTaskCreate, toolTaskList, toolTaskUpdate, toolTaskGet }
export { toolLeanRun, toolLeanJob, toolLeanLib, toolLeanRead, toolLeanArchive, leanFaceOrRefuse, tasksOf, rowsOf }

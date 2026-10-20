// tests/vmu-v5r-tools.test.mjs — PHASE 7 / goal 2 (first batch): the v5r PACK-DECLARED tool face (6 tools).
//
// THE DEFECT CLASS THIS PINS (measured in docs/acceptance/phase7-coverage-matrix.md §2): `packs/v5r` declared **0
// tools** while its prompts taught members to call `vibe_v5_record_progress/_proposition/_method/_subproblem`,
// `vibe_v5_say` and `vibe_v5_message` — 17 taught names, 0 declared. So this suite proves, on the REAL entry:
//   · with no pack, NOT ONE v5r tool exists (zero mechanism);
//   · with packs=['v5r'], exactly the six DECLARED names are published, and the framework tool table holds none;
//   · every tool receipt is a JSON STRING whose parse is an OBJECT (stringified exactly once — `receiptMeta`);
//   · a refusal carries a REGISTERED code + a hint (never a bare exception, never a silent empty success);
//   · the tools really do their job (a record lands on its track, a group message exists, mail reaches a member);
//   · `say` refuses an EMPTY sender and an UNKNOWN sender by name — it never invents a speaker;
//   · the per-role tool-discovery SECTIONS are role-scoped and non-source-derived (discoverability, part ②);
//   · unload RETRACTS the declarations, so the names stop being publishable.
//
// RULE E: every loop/every() below is preceded by an explicit NON-EMPTY assertion.
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..')
const ENTRY = join(REPO, 'vibe-math-vmu', 'vibe-math-vmu.js')

let passed = 0
let failed = 0
const failures = []
const ok = (cond, label, detail) => {
  if (cond) { passed++; console.log('  ok   ' + label); return true }
  failed++; failures.push(label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  console.error('  FAIL ' + label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  return false
}
const J = (o) => JSON.stringify(o)

const entry = await import(pathToFileURL(ENTRY).href)
const v5r = await import(pathToFileURL(join(REPO, 'vibe-math-vmu', 'packs', 'v5r', 'index.js')).href)
const toolsMod = await import(pathToFileURL(join(REPO, 'vibe-math-vmu', 'packs', 'v5r', 'tools.js')).href)

/** The names the pack is expected to declare (bands 1–6: 6 + 6 + 7 + 7 + 11). */
const EXPECTED = ['vibe_v5_record_progress', 'vibe_v5_record_proposition', 'vibe_v5_record_method',
  'vibe_v5_record_subproblem', 'vibe_v5_say', 'vibe_v5_message',
  'vibe_v5_task_create', 'vibe_v5_task_list', 'vibe_v5_task_get', 'vibe_v5_task_update', 'vibe_v5_hire', 'vibe_v5_report', 'vibe_v5_overview',
  'vibe_v5_tool_help', 'vibe_v5_assign', 'vibe_v5_fire', 'vibe_v5_nudge', 'vibe_v5_prioritize', 'vibe_v5_feedback',
  'vibe_v5_read_library',
  'vibe_v5_meeting', 'vibe_v5_motion', 'vibe_v5_second', 'vibe_v5_poll_open', 'vibe_v5_poll_vote', 'vibe_v5_poll_close',
  'vibe_v5_verdict',
  'vibe_v5_start', 'vibe_v5_stop', 'vibe_v5_pause', 'vibe_v5_resume', 'vibe_v5_configure', 'vibe_v5_set',
  'vibe_v5_lean_run', 'vibe_v5_lean_job', 'vibe_v5_lean_lib', 'vibe_v5_lean_read', 'vibe_v5_lean_archive']
/** The codes a refusal may carry: REGISTERED ones only (docs/03 §8). */
const REGISTERED_CODES = ['VMU_INVALID_ARGUMENT', 'VMU_NO_SUCH_OBJECT', 'VMU_STATE', 'VMU_ENGINE_UNAVAILABLE',
  'VMU_NOT_PERMITTED', 'VMU_NOT_FOUND', 'VMU_CONFLICT', 'VMU_QUOTA_EXCEEDED', 'VMU_PACK_MISSING']

const boot = async (config = {}) => {
  const state = { specs: [], effects: [] }
  const ctx = {
    effect(fn, label) { state.effects.push(label); return fn() },
    on() { return () => {} },
    tools: { register: async (spec) => { state.specs.push(spec); return () => {} } },
  }
  const handle = entry.apply(ctx, Object.assign({ clock: () => 1000 }, config))
  await handle.ready()
  return { handle, state, names: state.specs.map((s) => s.name), specOf: (n) => state.specs.find((s) => s.name === n) }
}
const receipt = async (b, name, args = {}) => {
  const spec = b.specOf(name)
  if (!spec) return { raw: undefined, parsed: undefined, missing: true }
  const raw = await spec.execute(args, {})
  let parsed
  try { parsed = JSON.parse(raw) } catch { parsed = undefined }
  return { raw, parsed, missing: false }
}

const countOf = (kernel, track) => {
  const listed = kernel.records.list({ track, limit: 500 })
  if (Array.isArray(listed.items)) return listed.items.length
  if (typeof listed.available === 'number') return listed.available
  if (typeof listed.total === 'number') return listed.total
  return -1
}
// TEMP ROOT ON D: — this repository's rule is that scratch files never land on the C: drive (AGENTS.md §6).
const root = await mkdtemp(join('D:/_tmp', 'vmu-v5r-tools-'))
try {
  // ── ① ZERO MECHANISM ────────────────────────────────────────────────────────────────────────────────────────
  console.log('=== 1. NO PACK ⇒ NOT ONE v5r TOOL EXISTS ===')
  const bare = await boot({ root })
  ok(EXPECTED.length === 38, 'the expected list is non-empty (RULE E)', EXPECTED.length)
  const bareHits = EXPECTED.filter((n) => bare.names.includes(n))
  ok(bareHits.length === 0, 'without the pack none of the six names is published', bareHits)

  // ── ② THE DECLARATION (the names come FROM the pack) ───────────────────────────────────────────────────────
  console.log('=== 2. WITH packs=["v5r"] THE THIRTY-EIGHT DECLARED NAMES ARE PUBLISHED ===')
  const PACK = v5r.PACK
  ok(Array.isArray(PACK.tools) && PACK.tools.length === 38, 'the loaded manifest DECLARES thirty-eight tools', PACK.tools && PACK.tools.length)
  const declaredNames = PACK.tools.map((t) => t.name)
  ok(declaredNames.length > 0 && EXPECTED.filter((n) => declaredNames.includes(n)).length === EXPECTED.length,
    'the declaration is exactly the thirty-eight expected names', declaredNames)
  const v5rBoot = await boot({ root, packs: ['v5r'] })
  const published = EXPECTED.filter((n) => v5rBoot.names.includes(n))
  ok(EXPECTED.length > 0 && published.length > 0 && published.length === EXPECTED.length,
    'all thirty-eight are published through the real host adapter', { published: published.length, names: v5rBoot.names.length })
  ok(v5rBoot.handle.kernel.packTools().length === 38, 'the KERNEL holds the thirty-eight declarations', v5rBoot.handle.kernel.packTools().length)
  const kernelStatus = v5rBoot.handle.kernel.status({ detail: 'summary' })
  ok(Array.isArray(kernelStatus.packTools) && kernelStatus.packTools.length === 38,
    'kernel.status() reports the declared names (observable, not implicit)', kernelStatus.packTools && kernelStatus.packTools.length)
  const hostNames = Object.values((await import(pathToFileURL(join(REPO, 'vibe-math-vmu', 'host.js')).href)).TOOL_NAMES)
  const leaked = EXPECTED.filter((n) => hostNames.includes(n))
  ok(leaked.length === 0, 'no v5r tool name exists in the framework tool table', leaked)

  // ── ③ THE TOOLS REALLY DO THEIR JOB ────────────────────────────────────────────────────────────────────────
  console.log('=== 3. THE HANDLERS LAND ON THE REAL FACES ===')
  const kernel = v5rBoot.handle.kernel
  // A live member is required by `say` (the roster is created by the pack's slots; hire seats one).
  const hired = await kernel.members.hire({ id: 'r-1', slot: 'member' })
  await kernel.members.hire({ id: 'r-2', slot: 'member' })
  ok(!!hired && kernel.members.roster().some((m) => m.id === 'r-1') && kernel.members.roster().some((m) => m.id === 'r-2'),
    'precondition: TWO real members are on the roster', kernel.members.roster().map((m) => m.id))

  const before = countOf(kernel, 'progress')
  const progress = await receipt(v5rBoot, 'vibe_v5_record_progress', { content: '本轮推导：先证引理 A', member: 'r-1' })
  ok(typeof progress.raw === 'string', 'record_progress: execute() returns a STRING', typeof progress.raw)
  ok(progress.parsed && progress.parsed.ok === true && progress.parsed.track === 'progress', 'record_progress writes onto the progress track', progress.parsed)
  ok(progress.parsed && typeof progress.parsed.receiptMeta === 'object',
    'record_progress: it went through the ONE serializer (receiptMeta present)', progress.parsed && Object.keys(progress.parsed.receiptMeta || {}).length)
  const after = countOf(kernel, 'progress')
  ok(after === before + 1, 'the progress track grew by exactly one', { before, after })

  const propBefore = countOf(kernel, 'propositions')
  const prop = await receipt(v5rBoot, 'vibe_v5_record_proposition',
    { id: 'p-tools-1', title: '引理 A', statement: 'A 成立', value: 3, motive: '主证明的一步', p: 1 })
  ok(prop.parsed && prop.parsed.ok === true && prop.parsed.track === 'propositions', 'record_proposition writes onto the propositions track', prop.parsed)
  ok(prop.parsed && prop.parsed.settled === true, 'p=1 settles the card (the original card key is carried, not interpreted)', prop.parsed && prop.parsed.settled)
  ok(countOf(kernel, 'propositions') === propBefore + 1, 'the propositions track grew by exactly one', propBefore)
  const meth = await receipt(v5rBoot, 'vibe_v5_record_method', { content: '方法：反证 + 极值', value: 2, motive: '复用', p: 0 })
  ok(meth.parsed && meth.parsed.ok === true && meth.parsed.track === 'methods' && meth.parsed.settled === true,
    'record_method writes onto the methods track (p=0 ⇒ settled, which is what the pack stance demands)', meth.parsed)
  // ★★ ROUND 3 LEAD RULING: `vmu.records.requireSettledRecords` is now FALSE at its DECLARATION site, because the
  // original let a member WRITE a draft and promote it later, and the risk "looks proved" is carried by the VERIFIED
  // TRACK plus the card's status — not by refusing the write. 正: the draft is accepted. 反: it is visibly undecided.
  const draft = await receipt(v5rBoot, 'vibe_v5_record_proposition', { id: 'p-draft-1', statement: '未定稿的命题', value: 1, motive: '待定', p: 0.5 })
  ok(draft.parsed && draft.parsed.ok === true && draft.parsed.settled === false,
    '★ 正：草稿命题（p=0.5）被接受，回执自报 settled:false —— 原版"先写草稿、后由 verified 轨升级"的工作流重新可行', draft.parsed)
  const draftRaw = kernel.records.get({ id: draft.parsed.recordId })
  const draftRow = draftRaw && draftRaw.record ? draftRaw.record : draftRaw
  ok(draftRow && draftRow.ok !== false && draftRow.status !== 'verified' && draftRow.settled !== true,
    '★ 反：同一张草稿在库里【不是已验证】（status 不是 verified、settled 不是 true）—— "看起来已证明"由状态承担，不由拒绝写入承担',
    draftRow && { status: draftRow.status, settled: draftRow.settled })
  // And it is NOT in a verified track. v5r declares no such track, so asking is a NAMED refusal (measured, not
  // assumed); a deployment that does declare one must show a zero count.
  const tracksNow = kernel.settingsSnapshot()['vmu.records.tracks'] || []
  if (tracksNow.includes('verified')) {
    ok(countOf(kernel, 'verified') === 0, '★ 反：草稿不在 verified 轨（该轨已声明，计数为 0）', countOf(kernel, 'verified'))
  } else {
    // The records face reports a bad track by THROWING a named refusal (not by returning ok:false), so the check
    // captures the code — the assertion is on the CODE, not on a swallowed exception.
    let verifiedCode = null
    try { kernel.records.list({ track: 'verified', limit: 5 }) } catch (e) { verifiedCode = e && e.code }
    ok(verifiedCode === 'VMU_INVALID_ARGUMENT',
      '★ 反：本部署没有 verified 轨 ⇒ 查它被【具名拒】—— 所以草稿不可能被当成已验证', verifiedCode)
  }
  const sub = await receipt(v5rBoot, 'vibe_v5_record_subproblem', { statement: '子问题：边界情形', value: 1, motive: '补洞', p: 0 })
  ok(sub.parsed && sub.parsed.ok === true && sub.parsed.track === 'problems', 'record_subproblem writes onto the problems track', sub.parsed)

  const said = await receipt(v5rBoot, 'vibe_v5_say', { member: 'r-1', text: '各位，引理 A 已进库' })
  ok(said.parsed && said.parsed.ok === true && said.parsed.via === 'chat' && said.parsed.member === 'r-1',
    'say (no `to`) speaks in the GROUP CHAT as the real member', said.parsed)
  const dm = await receipt(v5rBoot, 'vibe_v5_say', { member: 'r-1', text: '私信：请看引理 A', to: 'r-2' })
  ok(dm.parsed && dm.parsed.ok === true && dm.parsed.via === 'mailbox', 'say with `to` uses the MAILBOX (per-recipient durable mail)', dm.parsed)
  const msg = await receipt(v5rBoot, 'vibe_v5_message', { to: 'r-1', content: '所办通知：本周五开会' })
  ok(msg.parsed && msg.parsed.ok === true && msg.parsed.from === 'office', 'message relays in the OFFICE voice (the original sender)', msg.parsed)

  // ── ③b SECOND BATCH: task board, hire, report, overview — each with a POSITIVE and a NAMED-NEGATIVE ─────────
  console.log('=== 3b. THE SECOND BATCH LANDS ON THE REAL FACES (one positive + one named negative each) ===')
  const made = await receipt(v5rBoot, 'vibe_v5_task_create', { subject: '证明引理 A', description: '写出完整证明', write_scopes: ['proofs/'] })
  ok(made.parsed && made.parsed.ok === true && made.parsed.task && made.parsed.task.id,
    'task_create: 正 — a task really lands on the board', made.parsed && made.parsed.task && { id: made.parsed.task.id, status: made.parsed.task.status })
  const createdId = made.parsed && made.parsed.task && made.parsed.task.id
  // The revision token is read from the BOARD (the list row is the documented source of `revision`): the create
  // receipt's own shape is the ledger's, and this suite must not assume a field name it has not measured.
  const listedForRev = await receipt(v5rBoot, 'vibe_v5_task_list', {})
  const rowForRev = listedForRev.parsed && listedForRev.parsed.tasks ? listedForRev.parsed.tasks.filter((t) => t.id === createdId)[0] : null
  const rev0 = rowForRev ? (rowForRev.revision !== undefined ? rowForRev.revision : rowForRev.rev) : undefined
  ok(Number.isInteger(rev0), 'precondition: the board exposes the revision token task_update needs', { rev0, row: rowForRev && Object.keys(rowForRev) })
  const listed = await receipt(v5rBoot, 'vibe_v5_task_list', {})
  ok(listed.parsed && listed.parsed.ok === true && Array.isArray(listed.parsed.tasks) && listed.parsed.tasks.some((t) => t.id === createdId),
    'task_list: 正 — the created task is in the list', listed.parsed && { count: listed.parsed.count })
  const noSubject = await receipt(v5rBoot, 'vibe_v5_task_create', { description: '没有 subject' })
  ok(noSubject.parsed && noSubject.parsed.ok === false && noSubject.parsed.code === 'VMU_INVALID_ARGUMENT',
    'task_create: 反 — a missing subject is refused by name', noSubject.parsed)
  const noRev = await receipt(v5rBoot, 'vibe_v5_task_update', { task_id: createdId, action: 'claim', member: 'r-1' })
  ok(noRev.parsed && noRev.parsed.ok === false && noRev.parsed.code === 'VMU_INVALID_ARGUMENT',
    'task_update: 反 — no expected_revision is refused by name (compare-and-set is mandatory, not optional)', noRev.parsed)
  const claimed = await receipt(v5rBoot, 'vibe_v5_task_update', { task_id: createdId, expected_revision: rev0, action: 'claim', member: 'r-1' })
  ok(claimed.parsed && claimed.parsed.ok === true && claimed.parsed.action === 'claim',
    'task_update: 正 — claim with the right revision goes through the task face assign', claimed.parsed && claimed.parsed.task && { owner: claimed.parsed.task.owner })
  const noFaceOp = await receipt(v5rBoot, 'vibe_v5_task_update', { task_id: createdId, expected_revision: rev0, action: 'delete' })
  ok(noFaceOp.parsed && noFaceOp.parsed.ok === false && noFaceOp.parsed.code === 'VMU_INVALID_ARGUMENT' && /NO task-face operation/.test(String(noFaceOp.parsed.message)),
    '★ task_update: 反 — `delete` has NO task-face operation in this kernel ⇒ refused BY NAME (not faked, not silently ignored)', noFaceOp.parsed && noFaceOp.parsed.message)

  const hireNoPurpose = await receipt(v5rBoot, 'vibe_v5_hire', { initial_task: '读一篇论文' })
  ok(hireNoPurpose.parsed && hireNoPurpose.parsed.ok === false && hireNoPurpose.parsed.code === 'VMU_INVALID_ARGUMENT',
    'hire: 反 — a missing purpose is refused by name', hireNoPurpose.parsed)
  const hiredTemp = await receipt(v5rBoot, 'vibe_v5_hire', { purpose: '核验引理 A 的边界情形', initial_task: '逐个 n 验证 n≤3', to: 'r-temp-1' })
  const tempRow = kernel.members.roster().filter((m) => m.id === 'r-temp-1')[0]
  ok(hiredTemp.parsed && hiredTemp.parsed.ok === true && hiredTemp.parsed.slot === 'temp' && tempRow && String(tempRow.slot) === 'temp',
    'hire: 正 — the temp worker is REALLY on the roster in the temp seat', { parsed: hiredTemp.parsed && hiredTemp.parsed.slot, row: tempRow && tempRow.slot })
  ok(hiredTemp.parsed && hiredTemp.parsed.task && hiredTemp.parsed.task.id,
    'hire: 正 — the initial task was opened for that worker (the composition is members.hire + tasks.create)', hiredTemp.parsed && hiredTemp.parsed.task && hiredTemp.parsed.task.id)

  const report = await receipt(v5rBoot, 'vibe_v5_report', {})
  ok(report.parsed && report.parsed.ok === true && typeof report.parsed.report === 'string' && report.parsed.counts.roster > 0 && report.parsed.counts.tasks > 0,
    'report: 正 — a human-readable report over the REAL counts', report.parsed && report.parsed.counts)
  const overviewDenied = await receipt(v5rBoot, 'vibe_v5_overview', { member: 'r-1' })
  ok(overviewDenied.parsed && overviewDenied.parsed.ok === false && overviewDenied.parsed.code === 'VMU_NOT_PERMITTED',
    '★ overview: 反 — a member in the `member` seat is refused by name (academician-only, the check is the pack\'s)', overviewDenied.parsed)
  await kernel.members.hire({ id: 'r-chair', slot: 'chair' })
  const overviewOk = await receipt(v5rBoot, 'vibe_v5_overview', { member: 'r-chair' })
  ok(overviewOk.parsed && overviewOk.parsed.ok === true && Array.isArray(overviewOk.parsed.roster) && overviewOk.parsed.board.tasks > 0,
    'overview: 正 — the chair seat gets the institute-wide view', overviewOk.parsed && overviewOk.parsed.board)

  // ── ③c THIRD BATCH (round 4): help, assign, fire, nudge, prioritize, feedback, read_library ────────────────
  console.log('=== 3c. THE THIRD BATCH (one positive + one named negative each) ===')
  const help = await receipt(v5rBoot, 'vibe_v5_tool_help', {})
  const declaredNow = kernel.packTools().map((t) => t.name).sort()
  const helpNames = help.parsed && Array.isArray(help.parsed.tools) ? help.parsed.tools.map((t) => t.name).sort() : []
  ok(help.parsed && help.parsed.ok === true && J(helpNames) === J(declaredNow),
    '★ tool_help: 正 — the returned list SET-EQUALS the kernel\'s own declarations (packTools), not a copy of the prompt', { help: helpNames.length, declared: declaredNow.length })
  ok(help.parsed.tools.length > 0 && help.parsed.tools.every((t) => typeof t.name === 'string' && typeof t.purpose === 'string' && t.purpose.length > 10),
    'tool_help: 正 — every entry carries a name and a one-line purpose', help.parsed.tools.length)
  const helpUnknown = await receipt(v5rBoot, 'vibe_v5_tool_help', { member: 'r-nobody' })
  ok(helpUnknown.parsed && helpUnknown.parsed.ok === false && helpUnknown.parsed.code === 'VMU_NO_SUCH_OBJECT',
    '★ tool_help: 反 — an unknown member is refused by name (never an empty list pretending success)', helpUnknown.parsed)

  const assignNoAccept = await receipt(v5rBoot, 'vibe_v5_assign', { to: 'r-1', why: '因为你最熟' })
  ok(assignNoAccept.parsed && assignNoAccept.parsed.ok === false && assignNoAccept.parsed.code === 'VMU_INVALID_ARGUMENT',
    'assign: 反 — a missing acceptance criterion is refused by name (the original required it)', assignNoAccept.parsed)
  const assigned = await receipt(v5rBoot, 'vibe_v5_assign', { to: 'r-2', subject: '核验边界情形', why: '这是引理 A 的缺口', acceptance: '给出 n≤3 的全部情形' })
  ok(assigned.parsed && assigned.parsed.ok === true && !!assigned.parsed.taskId && !!assigned.parsed.notice,
    'assign: 正 — the task is created and assigned, and why/acceptance reached the assignee as mail', assigned.parsed && { taskId: assigned.parsed.taskId, notice: !!assigned.parsed.notice })

  const nudgeNoWhy = await receipt(v5rBoot, 'vibe_v5_nudge', { to: 'r-1' })
  ok(nudgeNoWhy.parsed && nudgeNoWhy.parsed.ok === false && nudgeNoWhy.parsed.code === 'VMU_INVALID_ARGUMENT', 'nudge: 反 — a nudge without a reason is refused by name', nudgeNoWhy.parsed)
  const nudged = await receipt(v5rBoot, 'vibe_v5_nudge', { to: 'r-1', why: '任务已逾期两天', next_step: '先给 n=5 的反例' })
  ok(nudged.parsed && nudged.parsed.ok === true && !!nudged.parsed.sent, 'nudge: 正 — delivered as urgent mail', nudged.parsed && !!nudged.parsed.sent)

  const prioNoWhy = await receipt(v5rBoot, 'vibe_v5_prioritize', { order: [{ task_id: createdId, priority: 1 }] })
  ok(prioNoWhy.parsed && prioNoWhy.parsed.ok === false && prioNoWhy.parsed.code === 'VMU_INVALID_ARGUMENT', 'prioritize: 反 — no why is refused by name', prioNoWhy.parsed)
  const prioUnknown = await receipt(v5rBoot, 'vibe_v5_prioritize', { order: [{ task_id: 't-phantom', priority: 1 }], why: 'x' })
  ok(prioUnknown.parsed && prioUnknown.parsed.ok === false && prioUnknown.parsed.code === 'VMU_NO_SUCH_OBJECT', 'prioritize: 反 — an order over phantom tasks is refused by name', prioUnknown.parsed)
  const prioOk = await receipt(v5rBoot, 'vibe_v5_prioritize', { order: [{ task_id: createdId, priority: 1 }], why: '离结题最近' })
  ok(prioOk.parsed && prioOk.parsed.ok === true && !!prioOk.parsed.archived && /NOT applied/.test(String(prioOk.parsed.note)),
    '★ prioritize: 正 — the order is ARCHIVED as a durable record AND the receipt says it was not applied to the board', prioOk.parsed && prioOk.parsed.note)

  const fbMissing = await receipt(v5rBoot, 'vibe_v5_feedback', { op: 'add', category: '协作' })
  ok(fbMissing.parsed && fbMissing.parsed.ok === false && fbMissing.parsed.code === 'VMU_INVALID_ARGUMENT',
    'feedback: 反 — a bare add is refused by name (category/route/phenomenon/impact/action required)', fbMissing.parsed)
  const fbAdd = await receipt(v5rBoot, 'vibe_v5_feedback', { op: 'add', category: '协作', route: 'process', phenomenon: '分派信息不足', impact: '返工', action: '分派时写验收标准' })
  ok(fbAdd.parsed && fbAdd.parsed.ok === true && fbAdd.parsed.status === 'open', 'feedback: 正 — a feedback record lands on the feedback track', fbAdd.parsed)
  const fbInter = await receipt(v5rBoot, 'vibe_v5_feedback', { op: 'add', category: '人际', route: 'interpersonal', phenomenon: 'x', impact: 'y', action: 'z' })
  ok(fbInter.parsed && fbInter.parsed.ok === false && /assessment/.test(String(fbInter.parsed.message)),
    'feedback: 反 — the interpersonal route without assessment is refused by name', fbInter.parsed)
  const fbList = await receipt(v5rBoot, 'vibe_v5_feedback', { op: 'list' })
  ok(fbList.parsed && fbList.parsed.ok === true && fbList.parsed.count >= 1, 'feedback: 正 — list returns the open items', fbList.parsed && fbList.parsed.count)

  const lib = await receipt(v5rBoot, 'vibe_v5_read_library', { member: 'r-1' })
  ok(lib.parsed && lib.parsed.ok === true && Array.isArray(lib.parsed.cards), 'read_library: 正 — the read-only list form works', lib.parsed && lib.parsed.count)
  const libMissing = await receipt(v5rBoot, 'vibe_v5_read_library', { id: 'no-such-card' })
  ok(libMissing.parsed && libMissing.parsed.ok === false && ['VMU_NO_SUCH_OBJECT', 'VMU_NOT_FOUND'].includes(libMissing.parsed.code),
    'read_library: 反 — an unknown card id is refused by name', libMissing.parsed)

  const fireNoId = await receipt(v5rBoot, 'vibe_v5_fire', {})
  ok(fireNoId.parsed && fireNoId.parsed.ok === false && fireNoId.parsed.code === 'VMU_INVALID_ARGUMENT', 'fire: 反 — no id is refused by name', fireNoId.parsed)
  const fireUnknown = await receipt(v5rBoot, 'vibe_v5_fire', { id: 'r-ghost' })
  ok(fireUnknown.parsed && fireUnknown.parsed.ok === false && fireUnknown.parsed.code === 'VMU_NO_SUCH_OBJECT', 'fire: 反 — an unknown member is refused by name', fireUnknown.parsed)
  await receipt(v5rBoot, 'vibe_v5_hire', { purpose: '临时核验', initial_task: '跑 n≤3', to: 'r-temp-2' })
  const tempTasks = (await kernel.tasks.list()).filter((t) => String(t.owner) === 'r-temp-2')
  const fired = await receipt(v5rBoot, 'vibe_v5_fire', { id: 'r-temp-2', reason: '本轮结束' })
  ok(tempTasks.length > 0 && fired.parsed && fired.parsed.ok === true && fired.parsed.cancelledTasks.length === tempTasks.length,
    'fire: 正 — the member is ended and their open tasks move to cancelled (both halves are real face calls)', fired.parsed && { cancelled: fired.parsed.cancelledTasks, tempTasks: tempTasks.length })

  // ── ③d FOURTH BATCH (round 5): the meeting and voting skeleton (v5r's core difference from v3) ─────────────
  console.log('=== 3d. THE MEETING / VOTING SKELETON (fourth batch) ===')
  const chairId = 'r-chair'
  const meet = await receipt(v5rBoot, 'vibe_v5_meeting', { agenda: '本轮结题评审', kind: 'sync', member: chairId })
  const meetingId = meet.parsed && meet.parsed.meeting && (meet.parsed.meeting.id || meet.parsed.meeting)
  ok(meet.parsed && meet.parsed.ok === true && !!meetingId, 'meeting: 正 — a meeting is convened through the meetings face', meet.parsed && meet.parsed.meeting)
  const meetBadKind = await receipt(v5rBoot, 'vibe_v5_meeting', { agenda: 'x', kind: 'nope', member: chairId })
  ok(meetBadKind.parsed && meetBadKind.parsed.ok === false && meetBadKind.parsed.code === 'VMU_INVALID_ARGUMENT', 'meeting: 反 — an unknown kind is refused by name', meetBadKind.parsed)

  const motion = await receipt(v5rBoot, 'vibe_v5_motion', { meeting: meetingId, kind: 'topic', text: '建议把引理 A 的证明拆成两步', member: 'r-1' })
  ok(motion.parsed && motion.parsed.ok === true && !!motion.parsed.motion, 'motion: 正 — the motion lands in the meeting', motion.parsed && motion.parsed.motion)
  const motionBadKind = await receipt(v5rBoot, 'vibe_v5_motion', { meeting: meetingId, kind: 'nope', text: 'x', member: 'r-1' })
  ok(motionBadKind.parsed && motionBadKind.parsed.ok === false && motionBadKind.parsed.code === 'VMU_INVALID_ARGUMENT', 'motion: 反 — an unknown motion kind is refused by name', motionBadKind.parsed)
  const withdrew = await receipt(v5rBoot, 'vibe_v5_motion', { op: 'withdraw', meeting: meetingId, member: 'r-1' })
  ok(withdrew.parsed && withdrew.parsed.ok === false && withdrew.parsed.code === 'VMU_ENGINE_UNAVAILABLE' && /withdraw/.test(String(withdrew.parsed.message)),
    '★ motion withdraw: 反 — refused by NAME (需内核能力：motion withdraw), never silently accepted', withdrew.parsed)

  const seconded = await receipt(v5rBoot, 'vibe_v5_second', { motion_id: motion.parsed && motion.parsed.motion, member: 'r-2' })
  ok(seconded.parsed && seconded.parsed.ok === false && seconded.parsed.code === 'VMU_ENGINE_UNAVAILABLE' && /motion second/.test(String(seconded.parsed.message)),
    '★ second: 反 — refused by NAME with the missing capability (no secondedBy in this kernel), never a silent no-op', seconded.parsed)
  const secondByTemp = await receipt(v5rBoot, 'vibe_v5_second', { motion_id: 'm-1', member: 'r-temp-1' })
  ok(secondByTemp.parsed && secondByTemp.parsed.ok === false && secondByTemp.parsed.code === 'VMU_NOT_PERMITTED',
    '★ second: 反 — a TEMP seat is refused as a NON-VOTER before the capability gap (V5_NOT_VOTER lands first)', secondByTemp.parsed)

  const poll = await receipt(v5rBoot, 'vibe_v5_poll_open', { question: '引理 A 的证明策略？', options: ['拆两步', '直接反证'], min_votes: 2, mode: 'single', member: chairId })
  const boxId = poll.parsed && poll.parsed.boxId
  ok(poll.parsed && poll.parsed.ok === true && !!boxId, 'poll_open: 正 — the box is really open', poll.parsed && poll.parsed.boxId)
  ok(poll.parsed.unapplied.length === 2 && poll.parsed.unapplied.filter((u) => u.why.length > 20).length === 2,
    '★ poll_open: the per-poll rules the box cannot take are reported under `unapplied` (asked ≠ applied; 需内核能力：per-box rules)', poll.parsed.unapplied)
  const pollByMemberSeat = await receipt(v5rBoot, 'vibe_v5_poll_open', { question: 'q', options: ['a', 'b'], member: 'r-1' })
  ok(pollByMemberSeat.parsed && pollByMemberSeat.parsed.ok === false && pollByMemberSeat.parsed.code === 'VMU_NOT_PERMITTED',
    'poll_open: 反 — only the chair seat may open a poll (the original marks it "(academician)")', pollByMemberSeat.parsed)

  const vote1 = await receipt(v5rBoot, 'vibe_v5_poll_vote', { ballot_id: boxId, choices: ['拆两步'], member: 'r-1' })
  ok(vote1.parsed && vote1.parsed.ok === true, 'poll_vote: 正 — a permanent seat\'s vote lands in the box', vote1.parsed && vote1.parsed.receipt)
  const voteTemp = await receipt(v5rBoot, 'vibe_v5_poll_vote', { ballot_id: boxId, choices: ['拆两步'], member: 'r-temp-1' })
  ok(voteTemp.parsed && voteTemp.parsed.ok === false && voteTemp.parsed.code === 'VMU_NOT_PERMITTED' && /V5_NOT_VOTER/.test(String(voteTemp.parsed.message)),
    '★★ poll_vote: 反 — a TEMP seat has no vote (原版 V5_NOT_VOTER／D8), refused BY NAME with the original wording', voteTemp.parsed && voteTemp.parsed.message)

  // ★ min_votes NOT met ⇒ the ballot does NOT count. A SECOND kernel declares a real floor so the case is deterministic
  // instead of depending on a default: one vote cast, floor 2, close ⇒ the box's own registered code fires.
  const strictRoot = await mkdtemp(join('D:/_tmp', 'vmu-v5r-tools-strict-'))
  const strictBoot = await boot({ root: strictRoot, packs: ['v5r'], 'vmu.ballot.minVotes': 2 })
  try {
    await strictBoot.handle.kernel.members.hire({ id: 'r-chair', slot: 'chair' })
    await strictBoot.handle.kernel.members.hire({ id: 'r-1', slot: 'member' })
    const strictPoll = await receipt(strictBoot, 'vibe_v5_poll_open', { question: 'q?', options: ['a', 'b'], member: 'r-chair' })
    const strictBox = strictPoll.parsed && strictPoll.parsed.boxId
    await receipt(strictBoot, 'vibe_v5_poll_vote', { ballot_id: strictBox, choices: ['a'], member: 'r-1' })
    const earlyClose = await receipt(strictBoot, 'vibe_v5_poll_close', { ballot_id: strictBox, member: 'r-chair' })
    ok(earlyClose.parsed && earlyClose.parsed.ok === false && earlyClose.parsed.code === 'VMU_BALLOT_MIN_VOTES_NOT_MET' && /不成立/.test(String(earlyClose.parsed.message)),
      '★★ poll_close: 反 — with the floor unmet the ballot DOES NOT COUNT: VMU_BALLOT_MIN_VOTES_NOT_MET + "本次投票不成立" (min_votes is NOT the quorum)',
      earlyClose.parsed && { code: earlyClose.parsed.code, message: earlyClose.parsed.message })
  } finally { await rm(strictRoot, { recursive: true, force: true }).catch(() => {}) }
  const closeByMember = await receipt(v5rBoot, 'vibe_v5_poll_close', { ballot_id: boxId, member: 'r-1' })
  ok(closeByMember.parsed && closeByMember.parsed.ok === false && closeByMember.parsed.code === 'VMU_NOT_PERMITTED',
    'poll_close: 反 — only the chair seat may close/tally', closeByMember.parsed)

  const verdictBad = await receipt(v5rBoot, 'vibe_v5_verdict', { target: 'b-none', verdict: 2, member: 'r-1' })
  ok(verdictBad.parsed && verdictBad.parsed.ok === false && verdictBad.parsed.code === 'VMU_INVALID_ARGUMENT',
    'verdict: 反 — a verdict outside [0,1] is refused by name', verdictBad.parsed)
  const verdictNoBallot = await receipt(v5rBoot, 'vibe_v5_verdict', { target: 'b-none', verdict: 1, member: 'r-1' })
  ok(verdictNoBallot.parsed && verdictNoBallot.parsed.ok === false && verdictNoBallot.parsed.code === 'VMU_NO_SUCH_OBJECT',
    'verdict: 反 — a verdict on a non-live ballot is refused by name (no invented ballot)', verdictNoBallot.parsed)

  // ── ③e FIFTH/SIXTH BANDS (round 6): lifecycle, configuration, and the Lean five ─────────────────────────────
  console.log('=== 3e. LIFECYCLE, CONFIGURATION, AND THE LEAN FIVE (sixth band) ===')
  const started = await receipt(v5rBoot, 'vibe_v5_start', { problem: '证明引理 A', researcherCount: 2, academician: false })
  ok(started.parsed && started.parsed.ok === true && started.parsed.hired.length === 2 && started.parsed.started && started.parsed.started.ok === true,
    'start: 正 — the institute is founded (2 researchers seated, kernel.start reported); academician:false because the chair seat is already taken in this fixture', started.parsed && { hired: started.parsed.hired })
  const chairTaken = await receipt(v5rBoot, 'vibe_v5_start', { researcherCount: 0 })
  ok(chairTaken.parsed && chairTaken.parsed.ok === false && !!chairTaken.parsed.code,
    'start: 反 — seating a SECOND academician while the chair slot is occupied is refused by name (slot capacity)', chairTaken.parsed && chairTaken.parsed.code)
  const paused = await receipt(v5rBoot, 'vibe_v5_pause', { reason: '评测' })
  ok(paused.parsed && paused.parsed.ok === true && paused.parsed.receipt, 'pause: 正 — the kernel control state is paused', paused.parsed && paused.parsed.receipt)
  const resumed = await receipt(v5rBoot, 'vibe_v5_resume', { reason: '继续' })
  ok(resumed.parsed && resumed.parsed.ok === true && resumed.parsed.receipt, 'resume: 正 — resumed through the CONTROL face', resumed.parsed && resumed.parsed.receipt)
  const h1 = await receipt(v5rBoot, 'vibe_v5_set', { key: 'vmu.records.tracks', value: ['progress', 'routes', 'obstacles', 'rejected', 'state', 'propositions', 'methods', 'problems', 'feedback', 'paper'] })
  ok(h1.parsed && h1.parsed.ok === true && h1.parsed.applied.hot === 'H1' && /立即/.test(String(h1.parsed.effective)),
    '★ set: 正 — an H1 key is written AND the receipt says "live now" with its declared hot level', h1.parsed && h1.parsed.applied)
  const h2 = await receipt(v5rBoot, 'vibe_v5_set', { key: 'vmu.ballot.minVotes', value: 2 })
  ok(h2.parsed && h2.parsed.ok === true && h2.parsed.applied.hot === 'H2' && /重启后生效/.test(String(h2.parsed.effective)),
    '★ set: 正 — an H2 key is written AND the receipt says "restart to take effect" (never implying it is live)', h2.parsed && h2.parsed.effective)
  const undeclared = await receipt(v5rBoot, 'vibe_v5_set', { key: 'vmu.no.such.key', value: 1 })
  ok(undeclared.parsed && undeclared.parsed.ok === false && undeclared.parsed.code === 'VMU_INVALID_ARGUMENT',
    '★ set: 反 — an UNDECLARED key is refused by name (only settings/schema.js keys are settable)', undeclared.parsed)
  const cfgMixed = await receipt(v5rBoot, 'vibe_v5_configure', { institute: '测试所', params: { 'vmu.ballot.minVotes': 3 } })
  ok(cfgMixed.parsed && cfgMixed.parsed.ok === true && cfgMixed.parsed.restartRequired.includes('vmu.ballot.minVotes'),
    '★ configure: 正 — mixed hot levels are reported: H2 keys land in restartRequired (H1 ones do not)', cfgMixed.parsed && cfgMixed.parsed.restartRequired)
  const cfgEmpty = await receipt(v5rBoot, 'vibe_v5_configure', {})
  ok(cfgEmpty.parsed && cfgEmpty.parsed.ok === false && cfgEmpty.parsed.code === 'VMU_INVALID_ARGUMENT', 'configure: 反 — nothing to set is refused by name', cfgEmpty.parsed)

  // ★ Lean: the kernel HAS the executor but only when the host injected a spawn seam. The fixture context has none, so
  // the honest evidence is TWO-SIDED: the face is absent, AND the kernel's own formal face + our five tools all refuse
  // BY NAME — none of them fakes a compile.
  ok(kernel.lean === null, '★ Lean: this assembly has NO Lean face (kernel/index.js creates it only when a spawn seam exists)', typeof kernel.lean)
  let formalNoSpawn = null
  try { formalNoSpawn = await v5rBoot.handle.kernel.formal.check({ statement: 'P', proof: 'theorem t : True := trivial' }) } catch (e) { formalNoSpawn = { code: e && e.code, message: String(e && e.message) } }
  ok(formalNoSpawn && (formalNoSpawn.code === 'VMU_EXTERNAL_UNAVAILABLE' || /spawn/.test(String(formalNoSpawn.message))),
    '★ Lean: the kernel\'s formal face REFUSES BY NAME without a spawn seam ("本面绝不假跑") — the executor is real but conditional', formalNoSpawn && formalNoSpawn.code)
  const leanNames = ['vibe_v5_lean_run', 'vibe_v5_lean_job', 'vibe_v5_lean_lib', 'vibe_v5_lean_read', 'vibe_v5_lean_archive']
  const leanArgs = { 'vibe_v5_lean_run': { file: 'Formal/x.lean' }, 'vibe_v5_lean_job': {}, 'vibe_v5_lean_lib': {}, 'vibe_v5_lean_read': { name: 'x' }, 'vibe_v5_lean_archive': { kind: 'lemma', name: 'x', from: 'Formal/x.lean' } }
  const leanRefusals = []
  for (const n of leanNames) {
    const r = await receipt(v5rBoot, n, leanArgs[n])
    leanRefusals.push({ name: n, code: r.parsed && r.parsed.code, hint: r.parsed && r.parsed.hint })
  }
  ok(leanNames.length === 5 && leanRefusals.filter((r) => r.code === 'VMU_ENGINE_UNAVAILABLE').length === 5,
    '★ Lean 五工具: 反 — all five refuse BY NAME (VMU_ENGINE_UNAVAILABLE) when there is no spawn seam; none fakes a run', leanRefusals)
  ok(leanRefusals.filter((r) => /spawn/.test(String(r.hint)) && /内核/.test(String(r.hint))).length === 5,
    '★ and each refusal names the missing capability (需内核能力：宿主 spawn 接缝) — the fix is in the tool itself', leanRefusals)
  const leanBadKind = await receipt(v5rBoot, 'vibe_v5_lean_archive', { kind: 'nope', name: 'x', from: 'Formal/x.lean' })
  ok(leanBadKind.parsed && leanBadKind.parsed.ok === false && leanBadKind.parsed.code === 'VMU_INVALID_ARGUMENT', 'lean_archive: 反 — an unknown archive kind is refused BEFORE the face check', leanBadKind.parsed)

  // ── ③f THE PAPER SUBSYSTEM (round 7): state machine + records + fingerprints + the four artefacts ───────────
  console.log('=== 3f. THE PAPER SUBSYSTEM (state machine / records / fingerprints / artefacts) ===')
  const paperMod = await import(pathToFileURL(join(REPO, 'vibe-math-vmu', 'packs', 'v5r', 'paper.js')).href)
  const paper = paperMod.createPaperSubsystem({ kernel })
  const TARGET = '引理 A'
  const begun = paper.start({ target: TARGET, participants: ['r-1', 'r-2'] })
  ok(begun && begun.ok === true && begun.status === 'writing' && begun.round === 1 && !!begun.stateRecord,
    'paper start: 正 — a paper object is created in the records face (writing, round 1) and the state record exists', begun)
  let startDup = null
  try { paper.start({ target: TARGET, participants: ['r-1'] }) } catch (e) { startDup = e }
  ok(startDup && startDup.code === 'VMU_PACK_V5R_CORE_PAPER_STATE', '★ paper start: 反 — a second paper for the same target is REFUSED by name (never a silent overwrite)', startDup && startDup.code)

  const part = paper.recordPart({ target: TARGET, member: 'r-1', title: '引理 A 的证明骨架', solution: '把 A 拆成两个引理', evidence: ['r-1 的命题卡'] })
  ok(part && part.ok === true && !!part.recordId && typeof part.fingerprint === 'string' && part.fingerprint.length > 0,
    '★ recordPart: 正 — the part is archived as its own record AND carries the KERNEL-computed fingerprint', part && { id: part.recordId, fp: String(part.fingerprint).slice(0, 12) })
  let reviewTooEarly = null
  try { paper.recordReview({ target: TARGET, member: 'r-2', deliverable: true }) } catch (e) { reviewTooEarly = e }
  ok(reviewTooEarly && reviewTooEarly.code === 'VMU_PACK_V5R_CORE_PAPER_STATE', '★ recordReview: 反 — a review in the WRITING stage is refused by name (out-of-order is never silently accepted)', reviewTooEarly && reviewTooEarly.code)
  let noPart = null
  try { paper.recordPart({ target: TARGET, member: 'r-9', title: 'x' }) } catch (e) { noPart = e }
  ok(noPart && noPart.code === 'VMU_NO_SUCH_OBJECT', 'recordPart: 反 — a non-participant is refused by name', noPart && noPart.code)

  const adv1 = paper.advance({ target: TARGET })
  ok(adv1 && adv1.moved === true && adv1.to === 'reviewing' && adv1.reviewOf && adv1.reviewOf['r-1'] === 'r-2',
    '★ advance: 正 — writing → reviewing with the rotation (r-1 reviews r-2, the original\'s reviewOf)', adv1 && adv1.reviewOf)
  let badDeliverable = null
  try { paper.recordReview({ target: TARGET, member: 'r-1', deliverable: 'yes' }) } catch (e) { badDeliverable = e }
  ok(badDeliverable && badDeliverable.code === 'VMU_INVALID_ARGUMENT', '★ recordReview: 反 — deliverable must be a real boolean ("未表态不算可交付")', badDeliverable && badDeliverable.code)
  paper.recordReview({ target: TARGET, member: 'r-1', deliverable: false, comments: '还缺 n=5 的情形' })
  const adv2 = paper.advance({ target: TARGET })
  ok(adv2 && adv2.moved === true && adv2.to === 'writing' && adv2.round === 2,
    '★ advance: 正 — one non-deliverable review sends the paper back to writing for round 2 (the disagreement is recorded)', adv2 && adv2.refusers)
  paper.advance({ target: TARGET })
  paper.recordReview({ target: TARGET, member: 'r-1', deliverable: true, comments: '已补 n=5' })
  paper.recordReview({ target: TARGET, member: 'r-2', deliverable: true, comments: '可交付' })
  const adv3 = paper.advance({ target: TARGET })
  ok(adv3 && adv3.moved === true && adv3.to === 'awaiting-editor' && adv3.unanimous === true,
    '★ advance: 正 — unanimous cross-review moves to awaiting-editor', adv3)

  const artsBefore = paper.PaperArtifacts({ target: TARGET })
  ok(artsBefore.complete === false && artsBefore.missing.length === 4,
    '★ PaperArtifacts: 正 — before rendering, ALL FOUR artefacts are missing and the receipt says INCOMPLETE (never claims completion)', artsBefore.missing)
  ok(artsBefore.pdf && artsBefore.pdf.code === 'VMU_PACK_V5R_CORE_PAPER_PDF_NEEDS_KERNEL' && /LaTeX/.test(String(artsBefore.pdf.needsKernel)),
    '★ PaperArtifacts: the missing PDF NAMES the kernel capability it needs (LaTeX 编译执行器) — measured: no latex face in kernel/', artsBefore.pdf && artsBefore.pdf.needsKernel)

  let finalBad = null
  try { paper.recordFinal({ target: TARGET, member: 'r-1', decision: 'deliverable' }) } catch (e) { finalBad = e }
  ok(finalBad && finalBad.code === 'VMU_NOT_PERMITTED', '★ recordFinal: 反 — a non-chair member cannot finalise (the academician does)', finalBad && finalBad.code)
  const finalized = paper.recordFinal({ target: TARGET, member: 'r-chair', decision: 'deliverable', note: '互审一致', conclusion: 'A 成立' })
  ok(finalized && finalized.ok === true && finalized.finalized === true && finalized.missing.includes('pdf'),
    '★ recordFinal: 正 — the academician finalises; the receipt renders md/tex/meta, still reports the missing pdf, and NEVER claims a complete paper', finalized && { missing: finalized.missing })
  const md = paper.PaperMd({ target: TARGET })
  ok(typeof md === 'string' && md.includes(paperMod.PAPER_SECTIONS[0]) && md.includes('r-1'),
    '★ PaperMd: 正 — the body is REBUILT from the parts (by id + fingerprint), section headings from the original\'s nine', md.length)
  const tex = paper.PaperTex({ target: TARGET })
  ok(typeof tex === 'string' && tex.includes('\\documentclass') && tex.includes('ctex') && tex.includes('xelatex'),
    '★ PaperTex: 正 — the tex carries the engine order (xelatex first for zh ⇒ ctex preamble)', tex.length)

  // ★★ RULE ①: the fingerprint guard. Tamper with the part record BY ID (a new body under the same record id) — the
  // state still remembers the old fingerprint, so rendering must BLOCK by name instead of reusing stale prose.
  const stateNow = paper.state(TARGET).state
  kernel.records.put({ id: stateNow.parts['r-1'].recordId, track: 'paper', kind: 'paper-part', title: 'v5r-paper|' + TARGET + '|part|r-1', body: JSON.stringify({ member: 'r-1', title: '被背后改过的正文', solution: '改了' }), by: 'tamper' })
  let fpErr = null
  try { paper.PaperMd({ target: TARGET }) } catch (e) { fpErr = e }
  ok(fpErr && fpErr.code === 'VMU_PACK_V5R_CORE_PAPER_FINGERPRINT_MISMATCH',
    '★★ RULE ①: a body changed behind the paper\'s back BLOCKS BY NAME (fingerprint mismatch) — the stale text is never silently used', fpErr && fpErr.code)

  // ── ③g THE PAPER PROMPTS (round 8): phase-scoped, non-source-derived, one prompt per phase ──────────────────
  console.log('=== 3g. THE PAPER PROMPTS (phase-scoped, non-source-derived) ===')
  const promptMod2 = await import(pathToFileURL(join(REPO, 'vibe-math-vmu', 'kernel', 'prompt', 'index.js')).href)
  const paperPromptsMod = await import(pathToFileURL(join(REPO, 'vibe-math-vmu', 'packs', 'v5r', 'prompts', 'v5r-paper-prompts.js')).href)
  const paperSections = PACK.sections.filter((s) => s.source === 'v5r-fixture:paper')
  ok(paperSections.length === 3, '★ three paper prompt sections exist in the loaded manifest', paperSections.map((s) => s.name))
  const phasesScoped = paperSections.map((s) => s.scope && s.scope.phase).sort()
  ok(J(phasesScoped) === J(['paper-final', 'paper-review', 'paper-write']),
    '★ each is scoped to exactly ONE phase (the pipeline matches scope.phase — no kernel change needed)', phasesScoped)
  const paperMarkers = paperSections.map((s) => String(s.text).split('\n')[0])
  ok(new Set(paperMarkers).size === 3 && paperMarkers.filter((m) => m.startsWith('【最终论文·')).length === 3,
    '★ the three markers are UNIQUE and each names its own stage', paperMarkers)
  ok(paperSections.filter((s) => /\{\{/.test(String(s.text))).length === 0,
    'no paper prompt contains a {{ }} placeholder (static per-phase text)', paperSections.map((s) => s.name))
  ok(paperSections.filter((s) => String(s.text).length > 300).length === 3,
    'each paper prompt carries real content (not a one-line stub)', paperSections.map((s) => String(s.text).length))
  // THE CONTENT CONTRACTS: deliverable's meaning, the office precondition, the evidence rule, and the numbers coming
  // from `paper.js` (single source of truth, not hand-copied).
  const byPhase = (p) => paperSections.filter((s) => s.scope && s.scope.phase === p)[0]
  const writeText = String(byPhase('paper-write').text)
  const reviewText = String(byPhase('paper-review').text)
  const finalText = String(byPhase('paper-final').text)
  ok(writeText.includes('不得编造') && writeText.includes('paper_part') && writeText.includes('vibe_v5_record_proposition'),
    '★ write prompt: the evidence rule + the reply contract + the REAL tool name (no invented tool)', { hasTool: writeText.includes('vibe_v5_record_proposition') })
  ok(reviewText.includes('deliverable: true') && reviewText.includes('全体参与成员都投 true') && reviewText.includes('未表态不算可交付'),
    '★★ review prompt: `deliverable` is DEFINED (true = ship as-is / false = must revise / all-true required) — the state machine\'s only input', reviewText.length)
  ok(finalText.includes('院士') && finalText.includes('所办') && finalText.includes('未接线') && finalText.includes('咨询'),
    '★★ final prompt: the CHAIR decides AND the office precondition (consult + meeting) is stated as NOT wired — so nobody assumes office can finalise', finalText.length)
  ok(writeText.includes(String(paperMod.PAPER_MAX_ROUNDS)) && paperSections.filter((s) => s.text.includes('xelatex')).length >= 1,
    '★ the numbers/engine order are taken from paper.js (single source), not hand-copied', String(paperMod.PAPER_MAX_ROUNDS))
  // 一正一反 THROUGH THE REAL PIPELINE: each phase's assembly carries ONLY its own marker.
  const paperPipe = promptMod2.createPromptPipeline({ sections: PACK.sections, bindings: PACK.bindings || [], settings: {}, counts: {} })
  const textAt = async (phase) => (await paperPipe.assemble({ member: 'r-1', role: 'researcher', roleLabel: 'researcher', phase })).text
  const atWrite = await textAt('paper-write')
  const atReview = await textAt('paper-review')
  const atFinal = await textAt('paper-final')
  const atNormal = await textAt('normal')
  ok(atWrite.includes('【最终论文·撰写】') && !atWrite.includes('【最终论文·互审】') && !atWrite.includes('【最终论文·定稿】'),
    '★ 正: phase=paper-write carries ONLY the writing prompt', { write: atWrite.length })
  ok(atReview.includes('【最终论文·互审】') && !atReview.includes('【最终论文·撰写】') && !atReview.includes('【最终论文·定稿】'),
    '★ 反: phase=paper-review does NOT carry the writing prompt (nor the final one)', { review: atReview.length })
  ok(atFinal.includes('【最终论文·定稿】') && !atFinal.includes('【最终论文·撰写】') && !atFinal.includes('【最终论文·互审】'),
    '★ and phase=paper-final carries only the final prompt', { final: atFinal.length })
  ok(!atNormal.includes('【最终论文·撰写】') && !atNormal.includes('【最终论文·互审】') && !atNormal.includes('【最终论文·定稿】'),
    '★ a NON-paper phase carries NONE of the three (no phase ⇒ no paper instruction at all)', { normal: atNormal.length })

  // ── ④ REFUSALS ARE NAMED (the 一正一反 the fixture verified: empty sender) ──────────────────────────────────
  console.log('=== 4. REFUSALS CARRY A REGISTERED CODE + A HINT ===')
  const noP = await receipt(v5rBoot, 'vibe_v5_record_proposition', { statement: '缺 p 的命题' })
  ok(noP.parsed && noP.parsed.ok === false && noP.parsed.code === 'VMU_INVALID_ARGUMENT', 'a card missing its REQUIRED p is refused by name', noP.parsed)
  ok(noP.parsed && REGISTERED_CODES.includes(noP.parsed.code) && typeof noP.parsed.hint === 'string' && noP.parsed.hint.length > 0,
    'the card refusal carries a REGISTERED code AND a next step (hint)', noP.parsed && { code: noP.parsed.code, hint: noP.parsed.hint })
  const emptySender = await receipt(v5rBoot, 'vibe_v5_say', { text: '没有发言者的一句话' })
  ok(emptySender.parsed && emptySender.parsed.ok === false && emptySender.parsed.code === 'VMU_INVALID_ARGUMENT',
    '★ say with an EMPTY sender is refused by name (a pack handler has no agent→member map: it never invents one)', emptySender.parsed)
  const unknownSender = await receipt(v5rBoot, 'vibe_v5_say', { member: 'r-does-not-exist', text: '未知发言者' })
  ok(unknownSender.parsed && unknownSender.parsed.ok === false && unknownSender.parsed.code === 'VMU_NO_SUCH_OBJECT',
    '★ say with an UNKNOWN member is refused by name with the roster in the message', unknownSender.parsed)
  const badTrack = await receipt(v5rBoot, 'vibe_v5_record_progress', { content: 'x', track: 'no-such-track' })
  ok(badTrack.parsed && badTrack.parsed.ok === false && badTrack.parsed.code === 'VMU_INVALID_ARGUMENT',
    'an unknown progress track is refused by name (vmu.records.tracks declares the set)', badTrack.parsed)

  // ── ⑤ THE DISCOVERY SECTIONS (part ②: a tool a member cannot SEE is a paper capability) ────────────────────
  console.log('=== 5. PER-ROLE TOOL DISCOVERY SECTIONS (non-source-derived, role-scoped, unique markers) ===')
  const sections = PACK.sections
  ok(Array.isArray(sections) && sections.length > 0, 'the manifest declares a non-empty section list (RULE E)', sections.length)
  const toolSections = sections.filter((s) => s && s.source === 'v5r-fixture:tools')
  ok(toolSections.length === 3, 'three tool-discovery sections exist (one per role)', toolSections.map((s) => s.name))
  const rolesScoped = toolSections.map((s) => s.scope && s.scope.role)
  ok(J(rolesScoped.sort()) === J(['academician', 'researcher', 'temp']), 'each is scoped to exactly ONE role (no cross-role prelude)', rolesScoped)
  const markers = toolSections.map((s) => String(s.text).split('\n')[0])
  const badMarkers = markers.filter((m) => !m.startsWith('【本轮可用的工具｜'))
  ok(new Set(markers).size === 3 && markers.length === 3 && badMarkers.length === 0,
    'every marker is unique and names its own role', markers)
  const placeholders = toolSections.filter((s) => /\{\{/.test(String(s.text)))
  ok(placeholders.length === 0, 'no tool-discovery section contains a {{ }} placeholder (static per-role text)', placeholders.map((s) => s.name))
  const sourceDerived = toolSections.filter((s) => String(s.source).startsWith('v5r-charter:') || String(s.source).startsWith('v5r-corpus:'))
  ok(sourceDerived.length === 0, 'none of them is source-derived (the charter verbatim gate stays untouched)', sourceDerived.map((s) => s.name))

  // The sections must really RENDER for their role, and NOT for another role — the observable difference.
  const promptMod = await import(pathToFileURL(join(REPO, 'vibe-math-vmu', 'kernel', 'prompt', 'index.js')).href)
  const pipe = promptMod.createPromptPipeline({ sections, bindings: PACK.bindings || [], settings: {}, counts: {} })
  const textFor = async (role) => (await pipe.assemble({ member: 'r-1', role, roleLabel: role, phase: 'normal' })).text
  const asResearcher = await textFor('researcher')
  const asTemp = await textFor('temp')
  const asAcademician = await textFor('academician')
  ok(asResearcher.includes('vibe_v5_record_proposition') && asResearcher.includes('【本轮可用的工具｜研究员】'),
    'the researcher\'s assembly carries the researcher tool list', asResearcher.length)
  ok(asAcademician.includes('vibe_v5_message') && asAcademician.includes('【本轮可用的工具｜院士】'),
    'the academician sees the office-relay tool (the researcher\'s list does not have it)', asAcademician.length)
  // THE SUBSET IS CHECKED ON THE SECTION ITSELF (the assembled prompt legitimately mentions these names elsewhere in
  // the charter, so a whole-prompt grep would confuse prose with a tool list).
  const tempSection = toolSections.filter((s) => s.scope && s.scope.role === 'temp')[0]
  const researcherSection = toolSections.filter((s) => s.scope && s.scope.role === 'researcher')[0]
  const acadSection = toolSections.filter((s) => s.scope && s.scope.role === 'academician')[0]
  ok(!!tempSection && !!researcherSection && !!acadSection, 'precondition: all three role sections are present', { temp: !!tempSection, res: !!researcherSection, acad: !!acadSection })
  ok(!String(tempSection.text).includes('vibe_v5_record_proposition') && String(tempSection.text).includes('vibe_v5_record_progress'),
    'the TEMP section lists only its own subset (progress + say, no library cards)', String(tempSection.text).length)
  ok(String(tempSection.text).includes('vibe_v5_say') && !String(tempSection.text).includes('vibe_v5_message'),
    'the temp list has `say` and NOT the office-relay tool', String(tempSection.text).length)
  // The NEGATIVE role checks look for a TOOL BULLET (`· vibe_v5_x`), not for the bare name: the sections legitimately
  // mention a tool while telling the reader it is NOT theirs ("全局视图不是……那是 vibe_v5_overview，仅院士").
  const bulletHas = (s, n) => new RegExp('·\\s*' + n + '\\b', 'm').test(String(s))
  ok(String(acadSection.text).includes('vibe_v5_hire') && String(acadSection.text).includes('vibe_v5_report') && String(acadSection.text).includes('vibe_v5_overview'),
    'the academician list carries hire + report + overview (the coordinating seat)', String(acadSection.text).length)
  ok(bulletHas(researcherSection.text, 'vibe_v5_hire') && !bulletHas(researcherSection.text, 'vibe_v5_overview'),
    'the researcher list carries hire (a permanent researcher hires its own temp) but NOT the institute-wide overview', String(researcherSection.text).length)
  ok(bulletHas(tempSection.text, 'vibe_v5_task_list') && !bulletHas(tempSection.text, 'vibe_v5_hire') && !bulletHas(tempSection.text, 'vibe_v5_report'),
    'the temp list carries the task board but NOT hire/report (those are not a temporary seat\'s job)', String(tempSection.text).length)
  // ROUND 4: `tool_help` is SELF-REFERENTIAL — the tool that answers "what can I call" is itself listed in every role,
  // and the third band is distributed by role (coordinating tools stay with the chair seat).
  const helpBullets = [acadSection, researcherSection, tempSection].map((s) => bulletHas(s.text, 'vibe_v5_tool_help'))
  ok(helpBullets.length === 3 && helpBullets.every(Boolean), '★ `vibe_v5_tool_help` is listed in ALL THREE role sections (self-referential)', helpBullets)
  ok(bulletHas(acadSection.text, 'vibe_v5_assign') && bulletHas(acadSection.text, 'vibe_v5_fire') && bulletHas(acadSection.text, 'vibe_v5_nudge') && bulletHas(acadSection.text, 'vibe_v5_prioritize'),
    'the chair seat gets assign/fire/nudge/prioritize (the coordinating band)', String(acadSection.text).length)
  ok(!bulletHas(researcherSection.text, 'vibe_v5_fire') && !bulletHas(researcherSection.text, 'vibe_v5_assign') && bulletHas(researcherSection.text, 'vibe_v5_feedback'),
    'the researcher gets feedback/read_library but NOT fire/assign', String(researcherSection.text).length)
  ok(!bulletHas(tempSection.text, 'vibe_v5_fire') && !bulletHas(tempSection.text, 'vibe_v5_prioritize') && bulletHas(tempSection.text, 'vibe_v5_read_library'),
    'the temp seat gets read_library but NOT fire/prioritize', String(tempSection.text).length)
  // ROUND 5: the meeting/voting band is distributed by seat — the chair convenes/opens/closes, permanent members
  // move/vote, and the temp seat gets NO meeting tool at all (D8: 临时工无表决权).
  ok(bulletHas(acadSection.text, 'vibe_v5_meeting') && bulletHas(acadSection.text, 'vibe_v5_poll_open') && bulletHas(acadSection.text, 'vibe_v5_poll_close'),
    'the chair seat gets meeting/poll_open/poll_close', String(acadSection.text).length)
  ok(bulletHas(researcherSection.text, 'vibe_v5_motion') && bulletHas(researcherSection.text, 'vibe_v5_poll_vote') && bulletHas(researcherSection.text, 'vibe_v5_verdict'),
    'the researcher seat gets motion/poll_vote/verdict', String(researcherSection.text).length)
  ok(!bulletHas(tempSection.text, 'vibe_v5_poll_vote') && !bulletHas(tempSection.text, 'vibe_v5_poll_open') && !bulletHas(tempSection.text, 'vibe_v5_meeting'),
    '★ the temp seat\'s list carries NO meeting/voting tool (D8), matching the runtime refusal', String(tempSection.text).length)
  // ROUND 6: lifecycle/configuration stay with the chair seat; the Lean five are research work (chair + researcher).
  ok(bulletHas(acadSection.text, 'vibe_v5_start') && bulletHas(acadSection.text, 'vibe_v5_configure') && bulletHas(acadSection.text, 'vibe_v5_lean_run'),
    'the chair seat gets the lifecycle/config band AND the Lean five', String(acadSection.text).length)
  ok(bulletHas(researcherSection.text, 'vibe_v5_lean_run') && !bulletHas(researcherSection.text, 'vibe_v5_start') && !bulletHas(researcherSection.text, 'vibe_v5_configure'),
    'the researcher gets the Lean five but NOT the lifecycle/config band', String(researcherSection.text).length)
  ok(!bulletHas(tempSection.text, 'vibe_v5_lean_run') && !bulletHas(tempSection.text, 'vibe_v5_set'),
    'the temp seat gets neither the Lean five nor configuration', String(tempSection.text).length)
  ok(asTemp.includes('【本轮可用的工具｜临时成员】') && !asTemp.includes('【本轮可用的工具｜研究员】'),
    'the TEMP assembly carries its OWN marker and not another role\'s', asTemp.length)
  ok(!asResearcher.includes('【本轮可用的工具｜临时成员】') && !asAcademician.includes('【本轮可用的工具｜研究员】'),
    'no role sees another role\'s tool list (no cross-role leak)', { researcherHasTemp: asResearcher.includes('｜临时成员'), acadHasRes: asAcademician.includes('｜研究员') })

  // ── ⑥ UNLOAD RETRACTS THE DECLARATIONS ─────────────────────────────────────────────────────────────────────
  console.log('=== 6. UNLOAD RETRACTS THE NAMES (the pack is the mechanism, and it comes off) ===')
  const km = await import(pathToFileURL(join(REPO, 'vibe-math-vmu', 'kernel', 'index.js')).href)
  const pm = await import(pathToFileURL(join(REPO, 'vibe-math-vmu', 'kernel', 'pack.js')).href)
  const k2 = km.createKernel({ clock: () => 1000, root })
  const loader = pm.createPackLoader({ kernel: k2, registry: k2.registry })
  const applied = await loader.apply({ id: 'v5r-tools-probe', version: '1.0.0', tools: toolsMod.V5R_PACK_TOOLS })
  ok(applied && applied.ok === true, 'a manifest carrying the thirty-eight declarations APPLIES', applied && (applied.code || applied.id))
  ok(k2.packTools().length === 38, 'the kernel holds the thirty-eight names after apply', k2.packTools().length)
  const unloaded = await loader.unload('v5r-tools-probe')
  ok(unloaded && unloaded.ok === true && unloaded.residueFree === true, 'unload reports no residue', unloaded)
  ok(k2.packTools().length === 0, 'the declarations are RETRACTED (nothing left to publish)', k2.packTools().length)
  // ── ⑦ THE NAMED NEXT BATCH AND THE ROUND'S NAMED GAPS ─────────────────────────────────────────────────────
  console.log('=== 7. THE NEXT BATCH AND THE NAMED GAPS ===')
  const next = toolsMod.V5R_NEXT_BATCH_TOOLS
  ok(Array.isArray(next) && next.length === 0, '★ the next-batch list is EMPTY: every prompt-taught name is now declared (the four Lean names joined this round)', next && next.length)
  // The emptiness is not "vacuous": it is paired with the closed-world check — every vibe_v5_* name the PROMPTS teach
  // must be declared. A new taught-but-missing name reddens here instead of lingering.
  const fsMod = await import('node:fs')
  const origSrc = fsMod.readFileSync(join(REPO, 'vibe-math-v5r', 'vibe-math-v5r.js'), 'utf8')
  const corpusSrc = fsMod.readFileSync(join(REPO, 'vibe-math-vmu', 'packs', 'v5r', 'prompts', 'v5r-prompts.js'), 'utf8')
  const taught = [...new Set((corpusSrc.match(/vibe_v5_[a-z_]+/g) || []))]
  const undeclaredTaught = taught.filter((n) => !EXPECTED.includes(n))
  ok(taught.length > 0 && undeclaredTaught.length === 0,
    '★ closed world: every vibe_v5_* name the PROMPT CORPUS teaches is declared as a tool (nothing taught-but-missing is left)', { taught: taught.length, missing: undeclaredTaught })
  const gaps = toolsMod.V5R_NAMED_GAPS
  ok(Array.isArray(gaps) && gaps.length === 6 && gaps.filter((g) => typeof g === 'string' && g.length > 20).length === 6,
    '★ the measured limits are recorded as NAMED GAPS (visible-tools reader / mail purge / priority column / motion second / per-box poll rules / secretary)', gaps && gaps.length)
  // ★ ROUND 4: `tool_help` is no longer a prompt invention — it is DECLARED, and the original still has no such tool.
  const helpDeclared = PACK.tools.some((t) => t.name === 'vibe_v5_tool_help')
  ok(helpDeclared && origSrc.includes("registerTool('vibe_v5_tool_help'") === false,
    '★ `vibe_v5_tool_help` is now a REAL declared tool although the ORIGINAL never registered it (the prompt was implemented, not deleted)', { declared: helpDeclared })
} finally {
  // The store writes atomically through temp+rename, so a removal can race one in-flight file: retry, and never let
  // a cleanup failure turn a green run red (the assertions above already reported the truth).
  await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 }).catch(() => {})
}

console.log('\n=== VMU V5R TOOLS: ' + passed + ' passed, ' + failed + ' failed ===')
if (failed > 0) { console.error('FAILURES:'); for (const f of failures) console.error('  - ' + f) }
process.exit(failed > 0 ? 1 : 0)

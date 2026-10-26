import { legacyDir, legacyFile } from './_lib/legacy-presets.mjs'
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
  'vibe_v5_verdict', 'vibe_v5_verdict_final', 'vibe_v5_verdict_ask', 'vibe_v5_verified_promote', 'vibe_v5_meeting_round', 'vibe_v5_fidelity_conclude',
  'vibe_v5_blueprint',
  'vibe_v5_start', 'vibe_v5_stop', 'vibe_v5_pause', 'vibe_v5_resume', 'vibe_v5_configure', 'vibe_v5_set',
  'vibe_v5_lean_run', 'vibe_v5_lean_job', 'vibe_v5_lean_lib', 'vibe_v5_lean_read', 'vibe_v5_lean_archive',
  'vibe_v5_inbox', 'vibe_v5_wait', 'vibe_v5_paper', 'vibe_v5_script']
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
  ok(EXPECTED.length > 0, 'the expected list is non-empty (RULE E)', EXPECTED.length)
  const bareHits = EXPECTED.filter((n) => bare.names.includes(n))
  ok(bareHits.length === 0, 'without the pack none of the six names is published', bareHits)

  // ── ② THE DECLARATION (the names come FROM the pack) ───────────────────────────────────────────────────────
  console.log('=== 2. WITH packs=["v5r"] THE THIRTY-EIGHT DECLARED NAMES ARE PUBLISHED ===')
  const PACK = v5r.PACK
  ok(Array.isArray(PACK.tools) && PACK.tools.length > 0 && EXPECTED.length > 0 && PACK.tools.length === EXPECTED.length, 'the loaded manifest DECLARES every expected tool (both sides PROVABLY non-empty: "both empty" cannot pass - RULE E shape B)', PACK.tools && PACK.tools.length)
  const declaredNames = PACK.tools.map((t) => t.name)
  ok(declaredNames.length > 0 && EXPECTED.filter((n) => declaredNames.includes(n)).length === EXPECTED.length,
    'the declaration is exactly the expected names', declaredNames)
  const v5rBoot = await boot({ root, packs: ['v5r'] })
  const published = EXPECTED.filter((n) => v5rBoot.names.includes(n))
  ok(EXPECTED.length > 0 && published.length > 0 && published.length === EXPECTED.length,
    'every expected tool is published through the real host adapter', { published: published.length, names: v5rBoot.names.length })
  ok(v5rBoot.handle.kernel.packTools().length === EXPECTED.length, 'the KERNEL holds every declaration', v5rBoot.handle.kernel.packTools().length)
  const kernelStatus = v5rBoot.handle.kernel.status({ detail: 'summary' })
  ok(Array.isArray(kernelStatus.packTools) && kernelStatus.packTools.length > 0 && EXPECTED.length > 0 && kernelStatus.packTools.length === EXPECTED.length,
    'kernel.status() reports the declared names (observable, not implicit; both sides PROVABLY non-empty - RULE E shape B)', kernelStatus.packTools && kernelStatus.packTools.length)
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
  // ★ PHASE 12 / D13: 「只有辩论能把命题卡的 p 改成 1」 is now a GATE (packs/v5r/verification-gates.js `p1Intent`), so a
  // p=1 write must carry the conclusion that produced it. Here that conclusion is a unanimous debate ruling on this very
  // card — caller-supplied by design (§10.6: the gate proves "no evidence ⇒ refuse", never "the evidence is true").
  // The refusal side (p=1 with no evidence) is covered in tests/vmu-v5r-verdict-final.test.mjs, and the promoted-verified
  // row is the second legal source.
  const prop = await receipt(v5rBoot, 'vibe_v5_record_proposition',
    { id: 'p-tools-1', title: '引理 A', statement: 'A 成立', value: 3, motive: '主证明的一步', p: 1,
      debate_ruling: { mode: 'unanimous', value: 1, subject: 'p-tools-1', ballotId: 'ballot-tools-1' } })
  ok(prop.parsed && prop.parsed.ok === true && prop.parsed.track === 'propositions', 'record_proposition writes onto the propositions track', prop.parsed)
  ok(prop.parsed && prop.parsed.settled === true, 'p=1 settles the card (the original card key is carried, not interpreted)', prop.parsed && prop.parsed.settled)
  ok(countOf(kernel, 'propositions') === propBefore + 1, 'the propositions track grew by exactly one', propBefore)
  // ★ PHASE 7 / toolification B: a record tool may target a DECLARED generic track; an undeclared one is NAMED.
  const generic = await receipt(v5rBoot, 'vibe_v5_record_method', { track: 'feedback', content: '通用 track 探针', value: 1, motive: 'B 阶段', p: 0 })
  ok(generic.parsed && generic.parsed.ok === true && generic.parsed.track === 'feedback',
    '★ 正：record_method 用【已声明】的通用 track（feedback）写入 ⇒ 卡落在该轨', generic.parsed)
  const unknownTrack = await receipt(v5rBoot, 'vibe_v5_record_method', { track: 'not-a-declared-track', content: 'x', value: 1, motive: 'x', p: 0 })
  ok(unknownTrack.parsed && unknownTrack.parsed.ok === false && unknownTrack.parsed.code === 'VMU_INVALID_ARGUMENT' && /unknown track/.test(unknownTrack.parsed.message),
    '★ 反：未声明的 track ⇒ 具名 VMU_INVALID_ARGUMENT（不发明轨）', unknownTrack.parsed && unknownTrack.parsed.code)
  const payload = await receipt(v5rBoot, 'vibe_v5_record_method', { track: 'feedback', content: 'payload 探针', value: 1, motive: 'B 阶段', p: 0, payload: { 权重: 0.5 } })
  ok(payload.parsed && payload.parsed.ok === true, '★ 正：payload 附加字段按 key：value 写入正文', payload.parsed)
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
  // ★ D10 (phase 12): 「认领 / 交派」必须能区分「自己认领」与「被院士交派」—— 内核已经记 by/bySource
  // (kernel/tasks.js assign)，kit/extras.js 也已经读 args.by，但这个 pack 面的 schema 没声明它 ⇒ 通过被教的工具
  // 永远无法交派归属。断言：声明在、两种来源都真的落在回执上。
  ok(claimed.parsed && claimed.parsed.by === 'r-1' && claimed.parsed.bySource === 'caller',
    '★ D10: claim attributes the CLAIMING member (by=r-1, bySource=caller) — self-claim is distinguishable from an assignment',
    claimed.parsed && { by: claimed.parsed.by, bySource: claimed.parsed.bySource })
  // assign()'s receipt does NOT carry revision (it returns owner/by/bySource/state) — read the board row.
  const boardRow = kernel.tasks.list({}).find((r) => r.id === createdId)
  const revForAssign = boardRow && boardRow.revision
  const givenBy = await receipt(v5rBoot, 'vibe_v5_task_update', { task_id: createdId, expected_revision: revForAssign, action: 'assign', owner: 'r-2', by: 'r-1' })
  ok(givenBy.parsed && givenBy.parsed.ok === true && givenBy.parsed.by === 'r-1' && givenBy.parsed.bySource === 'argument',
    '★ D10: an ASSIGNMENT records the actor that was given (by=r-1, bySource=argument) — never the assignee posing as the actor',
    givenBy.parsed && { by: givenBy.parsed.by, bySource: givenBy.parsed.bySource, owner: givenBy.parsed.owner })
  const updateTool = PACK.tools.find((x) => x.name === 'vibe_v5_task_update')
  ok(!!updateTool && !!updateTool.parameters && !!updateTool.parameters.by,
    '★ D10: the face DECLARES the attribution parameter it reads (a reader without a declaration is unreachable)',
    updateTool && updateTool.parameters && Object.keys(updateTool.parameters))
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
  // ★ PHASE 8 / B-1 (round 26): tool_help is a THIN FORWARDER to kernel.toolsView. The assertions that used to live
  // here encoded the DECLARATION-based answer (`packTools` — 38 names). That is an INTENTIONAL semantic change, not a
  // convenience edit: the declaration set and the visible set are no longer the same once role-scoped deny faces apply
  // (a temp seat declares 38 and sees 6), and the old answer was the wrong one for a member asking "what can I call".
  const helpNoMember = await receipt(v5rBoot, 'vibe_v5_tool_help', {})
  ok(helpNoMember.parsed && helpNoMember.parsed.ok === false && helpNoMember.parsed.code === 'VMU_INVALID_ARGUMENT' && typeof helpNoMember.parsed.hint === 'string',
    '★ tool_help: 反（no member）— the answer is PER MEMBER, so a missing member id is refused by name (with a hint)', helpNoMember.parsed && helpNoMember.parsed.code)
  const help = await receipt(v5rBoot, 'vibe_v5_tool_help', { member: 'r-1' })
  // ★ In THIS fixture there is no live Agent behind the visible-tools provider. Since run 34 the kernel answers that
  // case with a READABLE receipt: `tools:null` (never `[]`, which would claim the member can use nothing), the
  // provider's named refusal as a FIELD, and the override record the loop would apply. The pack face forwards it
  // verbatim — the assertion pins that the forwarder neither invents a list nor re-wraps the refusal into a throw.
  ok(help.parsed && help.parsed.ok === true && help.parsed.tools === null && help.parsed.source === 'no-live-agent' &&
    help.parsed.refusal && help.parsed.refusal.code === 'VMU_NO_SUCH_OBJECT' && help.parsed.tool === 'vibe_v5_tool_help' &&
    !Array.isArray(help.parsed.tools),
    '★★ tool_help: 反（fixture has no live Agent）— 回执仍是可读的：tools:null + 具名拒字段 + 无声明清单（旧实现会在这里返回 38 个名字）',
    help.parsed && { ok: help.parsed.ok, tools: help.parsed.tools, source: help.parsed.source, code: help.parsed.refusal && help.parsed.refusal.code })
  // ★★★ POSITIVE by a DIRECT handler call with a stub kernel: the forwarder must return EXACTLY the toolsView result, and
  // purpose:null must survive — null means "the host registered no description", NOT a missing field.
  const helpSpec = PACK.tools.filter((t) => t.name === 'vibe_v5_tool_help')[0]
  const stubView = { ok: true, member: 'stub-1', count: 2, tools: [{ name: 'vibe_v5_say', purpose: '在群里说一句' }, { name: 'vibe_v5_unknown', purpose: null }] }
  const forwarded = helpSpec.handler({ member: 'stub-1' }, { kernel: { toolsView: ({ member }) => Object.assign({}, stubView, { member }) } })
  ok(forwarded && forwarded.ok === true && forwarded.count === 2 && forwarded.tools[0].purpose === '在群里说一句' && forwarded.tools[1].purpose === null && forwarded.tool === 'vibe_v5_tool_help',
    '★★★ tool_help: 正 — the forwarder returns the kernel\'s toolsView result unchanged (purpose:null passed through as "no registered description", never invented)', forwarded && { count: forwarded.count })
  // ★★ SAME READING: the pack alias and the framework tool must both call kernel.toolsView — the two cannot disagree.
  const helpSrc = (await import('node:fs')).readFileSync(join(REPO, 'vibe-math-vmu', 'packs', 'v5r', 'tools.js'), 'utf8')
  const helpFnSrc = helpSrc.slice(helpSrc.indexOf('function toolHelp'), helpSrc.indexOf('function toolHelp') + 1800)
  const fwSrc = (await import('node:fs')).readFileSync(join(REPO, 'vibe-math-vmu', 'tools', 'member-tools.js'), 'utf8')
  ok(/kernel\.toolsView\(\{ member/.test(helpFnSrc) && /packTools\(\)/.test(helpFnSrc) === false && /kernel\.toolsView\(\{ member/.test(fwSrc),
    '★★ SAME READING: both `vibe_v5_tool_help` and the framework\'s `vibe_vmu_tools` call kernel.toolsView (source probe: the pack body no longer mentions packTools at all)', null)

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
  // ★ UPDATED WITH THE CAPABILITY: `prioritize` could not apply an order because the kernel had no setPriority. It does now,
    // so the assertion flips from "it says it was NOT applied" to "it WAS applied and reports from->to".
    ok(prioOk.parsed && prioOk.parsed.ok === true && !!prioOk.parsed.archived && Array.isArray(prioOk.parsed.applied) && prioOk.parsed.applied.length === 1 && prioOk.parsed.applied[0].to === 1,
    '★ prioritize: 正 — the order is ARCHIVED and APPLIED (kernel/tasks.js setPriority), with from->to in the receipt', prioOk.parsed && prioOk.parsed.note)

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

  // ★ PHASE 12 (B4/B5): `routes` / `obstacles` / `rejected` used to be WRITE-ONLY — the pack wrote negative knowledge
  // into them (vibe_v5_record_progress) while the reader listed a hardcoded four tracks that did not include them.
  // The pack now declares 13 tracks (`vmu.records.tracks`) and the reader DERIVES its list from that declaration
  // (kit/handlers.js `declaredTracks()`), so the round trip is asserted end to end instead of being argued from code.
  const routePut = await receipt(v5rBoot, 'vibe_v5_record_progress', { member: 'r-1', track: 'routes', content: '先拟合小 n 再外推', title: '路线卡' })
  ok(routePut.parsed && routePut.parsed.ok === true && routePut.parsed.track === 'routes',
    'B4: a route card can be WRITTEN (track:"routes")', routePut.parsed)
  const rejectedPut = await receipt(v5rBoot, 'vibe_v5_record_progress', { member: 'r-1', track: 'rejected', content: '直接枚举到 n=8 不可行', title: '否决路线' })
  ok(rejectedPut.parsed && rejectedPut.parsed.ok === true && rejectedPut.parsed.track === 'rejected',
    'B5: a rejected route can be WRITTEN (track:"rejected")', rejectedPut.parsed)
  const libRoutes = await receipt(v5rBoot, 'vibe_v5_read_library', { member: 'r-1', track: 'routes' })
  ok(libRoutes.parsed && libRoutes.parsed.ok === true && libRoutes.parsed.count >= 1
    && (libRoutes.parsed.cards || []).some((c) => String(c.track) === 'routes'),
    '★ B4: what was written to `routes` is READABLE through read_library (the write-only gap is closed)', libRoutes.parsed && libRoutes.parsed.count)
  const libRejected = await receipt(v5rBoot, 'vibe_v5_read_library', { member: 'r-1', track: 'rejected' })
  ok(libRejected.parsed && libRejected.parsed.ok === true && libRejected.parsed.count >= 1,
    '★ B5: `rejected` is readable too — negative knowledge is not write-only', libRejected.parsed && libRejected.parsed.count)
  const libAll = await receipt(v5rBoot, 'vibe_v5_read_library', { member: 'r-1' })
  const declaredNow = (libAll.parsed && libAll.parsed.declaredTracks) || []
  ok(['routes', 'obstacles', 'rejected'].every((t) => declaredNow.includes(t)) && declaredNow.length >= 5,
    'B4/B5: the READER takes its track list from the declaration (no hardcoded four)', declaredNow)

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
  // ★ round 23: the kernel HAS withdraw; the pack now calls it.
  const withdrew = await receipt(v5rBoot, 'vibe_v5_motion', { op: 'withdraw', meeting: meetingId, motion_id: motion.parsed && motion.parsed.motion, member: 'r-1' })
  ok(withdrew.parsed && withdrew.parsed.ok === true && withdrew.parsed.status === 'withdrawn',
    '★ motion withdraw: 正 — the proposer withdraws and the kernel moves the motion to withdrawn', withdrew.parsed)

  // ★ round 23: second is a REAL kernel transition now (secondedBy + proposed gate).
  // make a FRESH proposed motion so the second-gate assertions do not depend on the withdrawn one above
  const fresh = await receipt(v5rBoot, 'vibe_v5_motion', { meeting: meetingId, kind: 'topic', text: '建议把证明归档', member: 'r-1' })
  const freshMotion = fresh.parsed && fresh.parsed.motion
  ok(fresh.parsed && fresh.parsed.ok === true && fresh.parsed.status === 'proposed', '★ motion: a new motion starts proposed (the second gate is real)', fresh.parsed && fresh.parsed.status)
  const seconded = await receipt(v5rBoot, 'vibe_v5_second', { meeting: meetingId, motion_id: freshMotion, member: 'r-2' })
  ok(seconded.parsed && seconded.parsed.ok === true && seconded.parsed.status === 'seconded' && seconded.parsed.secondedBy === 'r-2',
    '★★ second: 正 — another member seconds and the kernel records status=seconded + secondedBy', seconded.parsed)
  const selfSecond = await receipt(v5rBoot, 'vibe_v5_second', { meeting: meetingId, motion_id: freshMotion, member: 'r-1' })
  ok(selfSecond.parsed && selfSecond.parsed.ok === false && selfSecond.parsed.code === 'VMU_NOT_PERMITTED',
    '★★ second: 反 — the proposer cannot second their own motion (the kernel refuses it by name)', selfSecond.parsed && selfSecond.parsed.code)
  const secondByTemp = await receipt(v5rBoot, 'vibe_v5_second', { meeting: meetingId, motion_id: freshMotion, member: 'r-temp-1' })
  ok(secondByTemp.parsed && secondByTemp.parsed.ok === false && secondByTemp.parsed.code === 'VMU_NOT_PERMITTED',
    '★ second: 反 — a TEMP seat is refused as a NON-VOTER before the capability gap (V5_NOT_VOTER lands first)', secondByTemp.parsed)

  const poll = await receipt(v5rBoot, 'vibe_v5_poll_open', { question: '引理 A 的证明策略？', options: ['拆两步', '直接反证'], min_votes: 2, mode: 'single', member: chairId })
  const boxId = poll.parsed && poll.parsed.boxId
  ok(poll.parsed && poll.parsed.ok === true && !!boxId, 'poll_open: 正 — the box is really open', poll.parsed && poll.parsed.boxId)
  // ★ round 23: the §7.1 per-poll rules are TRANSLATED into the kernel's per-box rules object.
  ok(poll.parsed.rulesDeclared === true && poll.parsed.rules && poll.parsed.rules.minVotes === 2 && poll.parsed.rules.mode === 'single' && poll.parsed.rules.maxChoices === 1,
    '★★ poll_open: min_votes/mode are translated into the kernel per-box rules (and mode single pins maxChoices=1)', poll.parsed.rules)
  ok(poll.parsed.unapplied.length === 0 && poll.parsed.applied.length === 2,
    '★ poll_open: nothing asked was untranslatable, so `unapplied` is empty (asked vs applied is still reported)', { applied: poll.parsed.applied, unapplied: poll.parsed.unapplied })
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
  } finally { await rm(strictRoot, { recursive: true, force: true, maxRetries: 20, retryDelay: 50 }).catch(() => {}) }
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
  // ★ LIVE RUN 7 (agent feedback item g): these two assertions used to demand the PACK's invented wording
  // ("live now" for H1 / "restart to take effect" for H2). The kernel already answers when a value is visible
  // (`appliesAt` + `requiresRestart = hot === 'H2' && liveReaders.length === 0`, kernel/index.js:2847), and the pack
  // contradicted it in the SAME receipt (`applied:"immediate"` for a key also listed in `restartRequired`). What is
  // asserted now is that the pack CARRIES the kernel's answer; the hot letter alone no longer decides the sentence.
  ok(h1.parsed && h1.parsed.ok === true && h1.parsed.applied.hot === 'H1' && h1.parsed.applied.appliesAt === 'next turn'
    && h1.parsed.applied.requiresRestart === false && /H1/.test(String(h1.parsed.effective)),
    '★ set: 正 — an H1 key is written and the receipt carries the KERNEL appliesAt (next turn), not a hot-letter guess', h1.parsed && h1.parsed.applied)
  const h2 = await receipt(v5rBoot, 'vibe_v5_set', { key: 'vmu.ballot.minVotes', value: 2 })
  ok(h2.parsed && h2.parsed.ok === true && h2.parsed.applied.hot === 'H2'
    && typeof h2.parsed.applied.appliesAt === 'string' && h2.parsed.applied.appliesAt.length > 0
    && h2.parsed.applied.requiresRestart === ((h2.parsed.applied.liveReadBy || []).length === 0),
    '★ set: 正 — an H2 key is written and requiresRestart AGREES with the measured live readers carried in the receipt', h2.parsed && h2.parsed.applied)
  const undeclared = await receipt(v5rBoot, 'vibe_v5_set', { key: 'vmu.no.such.key', value: 1 })
  ok(undeclared.parsed && undeclared.parsed.ok === false && undeclared.parsed.code === 'VMU_INVALID_ARGUMENT',
    '★ set: 反 — an UNDECLARED key is refused by name (only settings/schema.js keys are settable)', undeclared.parsed)
  // ★ LIVE RUN 20 (its residual 1): the face's declaration promises to PARSE the value against the declared type, and
  // the institute reported the contradiction — a numeric string was refused with "expected an integer >= 0". The face
  // now keeps that promise; the receipt must echo the COERCED value, because that is what was written.
  const numericText = await receipt(v5rBoot, 'vibe_v5_set', { key: 'vmu.limits.maxLiveMembers', value: '2', why: '字符串数字' })
  ok(numericText.parsed && numericText.parsed.ok === true && numericText.parsed.applied.value === 2,
    '★ set: 正 — a numeric STRING for a `natural` key is parsed to the number and the receipt echoes 2 (not "2")', numericText.parsed && numericText.parsed.applied)
  const badNumeric = await receipt(v5rBoot, 'vibe_v5_set', { key: 'vmu.limits.maxLiveMembers', value: 'two' })
  ok(badNumeric.parsed && badNumeric.parsed.ok === false && badNumeric.parsed.code === 'VMU_INVALID_ARGUMENT'
    && /is declared natural but the value is the text/.test(String(badNumeric.parsed.message)) && /JSON NUMBER/.test(String(badNumeric.parsed.hint)),
    '★ set: 反 — a NON-numeric string is refused NAMING the declared type and the text (never "expected an integer" about an unseen value)', badNumeric.parsed)
  const boolText = await receipt(v5rBoot, 'vibe_v5_set', { key: 'vmu.data.requireParent', value: 'true' })
  ok(boolText.parsed && boolText.parsed.ok === true && boolText.parsed.applied.value === true,
    '★ set: 正 — the text "true" is parsed for a boolean key', boolText.parsed && boolText.parsed.applied)
  const textStays = await receipt(v5rBoot, 'vibe_v5_set', { key: 'vmu.prompts.agentId', value: '8000' })
  ok(textStays.parsed && textStays.parsed.ok === true && textStays.parsed.applied.value === '8000',
    '★ set: 正 — a TEXT key keeps "8000" as text (the parse must not touch text declarations)', textStays.parsed && textStays.parsed.applied)
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
  // ★ G7 finding: a second part by the same member used to overwrite the first state slot silently. The minimal fix
  // names what was replaced instead of pretending both are represented.
  const part2 = paper.recordPart({ target: TARGET, member: 'r-1', title: '引理 A 的第二种写法', solution: '改写成反证法', evidence: ['r-1 的命题卡（反证法版）'] })
  ok(part2 && part2.ok === true && part2.replaced && part2.replaced.recordId === part.recordId,
    '★ recordPart: 正 — a second part NAMES the replaced record (replaced.recordId === the first part id)', part2 && part2.replaced)
  ok(part2.replaced && part2.replaced.title === '引理 A 的证明骨架',
    '★ recordPart: replaced also names the replaced title, so the caller can re-record it', part2 && part2.replaced && part2.replaced.title)
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
  ok(artsBefore.pdf && artsBefore.pdf.produced === false && artsBefore.pdf.code === undefined,
    // ★ UPDATED WITH THE FIX, not to make a test pass: this pinned a STATIC claim about a RUNTIME fact ("no latex face in kernel/"),
    // which the full live run contradicted by finding xelatex. An artefact inventory reports what is in the archive, and carries no
    // error code; only render() can name NEEDS_KERNEL vs FAILED.
    '★ PaperArtifacts: a missing PDF is reported as NOT PRODUCED and carries NO error code (a missing artefact is not an error; render names the code)')

  let finalBad = null
  try { await paper.recordFinal({ target: TARGET, member: 'r-1', decision: 'deliverable' }) } catch (e) { finalBad = e }
  ok(finalBad && finalBad.code === 'VMU_NOT_PERMITTED', '★ recordFinal: 反 — a non-chair member cannot finalise (the academician does)', finalBad && finalBad.code)
  // ★ E4 — "定稿前必须问所办" now REALLY EXECUTES ON THIS PATH. The live v5r settings declare
  // `vmu.paper.officeConsult="required"` and the gate lives in kit/paper.js `recordFinal` (kernel/paper.js carries a gate
  // too but nothing constructs it, so it never ran — that unreachable guard was the defect). Asserting it HERE, on the
  // assembled path, is what makes "已接线" a measured fact instead of a table cell.
  let consultBad = null
  try { await paper.recordFinal({ target: TARGET, member: 'r-chair', decision: 'deliverable', note: '互审一致', conclusion: 'A 成立' }) } catch (e) { consultBad = e }
  ok(consultBad && consultBad.code === 'VMU_OFFICE_CONSULT_REQUIRED' && /所办/.test(String(consultBad.message)) && Array.isArray(consultBad.enforced) && consultBad.enforced.length === 5,
    '★★ E4 recordFinal: 反 — 在册路径上"定稿前必须问所办"真的执行（required ⇒ 具名拒，并列出五个求值键）', consultBad && { code: consultBad.code, enforced: consultBad.enforced })
  const consultAnswer = paper.recordConsult({ target: TARGET, by: 'office', note: '已核对合并稿：结论范围与题设一致' })
  ok(consultAnswer && consultAnswer.ok === true && consultAnswer.answeredBy === 'office' && consultAnswer.cleared === true,
    '★★ E4 recordConsult: 正 — 所办答复后才放行（答复角色由 pack 的 consultRoles 声明，不是内核猜的）', consultAnswer)
  const finalized = await paper.recordFinal({ target: TARGET, member: 'r-chair', decision: 'deliverable', note: '互审一致', conclusion: 'A 成立' })
  ok(finalized && finalized.ok === true && finalized.finalized === true && finalized.missing.includes('pdf'),
    '★ recordFinal: 正 — the academician finalises; the receipt renders md/tex/meta, still reports the missing pdf, and NEVER claims a complete paper', finalized && { missing: finalized.missing })
  ok(finalized && finalized.consult && finalized.consult.armed === true && finalized.consult.satisfiedBy === 'answered',
    '★ E4 回执: 定稿回执写明闸开着、由所办答案满足（不是只说 finalized）', finalized && finalized.consult)
  const md = paper.PaperMd({ target: TARGET })
  ok(typeof md === 'string' && md.includes(paperMod.PAPER_SECTIONS[0]) && md.includes('r-1'),
    '★ PaperMd: 正 — the body is REBUILT from the parts (by id + fingerprint), section headings from the original\'s nine', md.length)
  // ★ G7 finding: status exposed the flow state only; a caller had to render (which writes) to learn missing/pdf.
  const toolsMod = await import(pathToFileURL(join(REPO, 'vibe-math-vmu', 'packs', 'v5r', 'tools.js')).href)
  const paperTool = toolsMod.V5R_PACK_TOOLS.find((t) => t.name === 'vibe_v5_paper')
  const statusAfterFinal = await paperTool.handler({ action: 'status', target: TARGET }, { kernel })
  ok(statusAfterFinal && statusAfterFinal.exists === true && Array.isArray(statusAfterFinal.missing) &&
    statusAfterFinal.missing.includes('pdf') && statusAfterFinal.complete === false &&
    // ★ UPDATED WITH THE FIX: the status view now reports "not produced" without a code (the code belongs to a render attempt).
    statusAfterFinal.pdf && statusAfterFinal.pdf.produced === false && statusAfterFinal.pdf.code === undefined,
    '★ status: 正 — missing/complete/pdf come from the SAME PaperArtifacts source as render (no write needed)', {
      missing: statusAfterFinal && statusAfterFinal.missing, complete: statusAfterFinal && statusAfterFinal.complete,
    })
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
  const textAt = async (phase) => (await paperPipe.assemble({ member: 'r-1', role: 'member', roleLabel: 'researcher', phase })).text
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

  // ── ③h THE REPLY → PAPER DISPATCHER (round 9): phase-gated, named on malformed, idempotent, status-visible ──
  console.log('=== 3h. THE PAPER REPLY DISPATCHER (the gap the prompts promised) ===')
  const dispatchMod = await import(pathToFileURL(join(REPO, 'vibe-math-vmu', 'packs', 'v5r', 'middleware', 'paper-dispatch.js')).href)
  const T2 = '论文-回执'
  paper.start({ target: T2, participants: ['r-1', 'r-2'] })
  dispatchMod.resetPaperDispatch()
  const partsOf = () => Object.keys(paper.state(T2).state.parts).length
  // ① a paper field in the WRONG phase is NOT recorded, and it is NAMED
  const wrongPhase = await dispatchMod.dispatchPaperReply({ phase: 'normal', turn: 't-wrong', member: 'r-1', flat: { kernel },
    reply: { paper_part: { target: T2, title: '不该被收', solution: 'x' } } })
  ok(wrongPhase.ok === false && wrongPhase.skipped === true && wrongPhase.code === 'VMU_PACK_V5R_CORE_PAPER_STATE' && partsOf() === 0,
    '★ ① phase gating: a `paper_part` reply in a NORMAL turn is refused by name AND nothing is recorded', { parts: partsOf(), code: wrongPhase.code })
  // ② malformed: the field is there but the subsystem refuses it — named, and NOT marked as dispatched
  const malformed = await dispatchMod.dispatchPaperReply({ phase: 'paper-write', turn: 't-bad', member: 'r-1', flat: { kernel },
    reply: { paper_part: { target: T2 } } })
  ok(malformed.ok === false && malformed.code === 'VMU_INVALID_ARGUMENT' && partsOf() === 0,
    '★ ② a malformed part is recorded as a NAMED failure (not silently dropped) and nothing lands', { code: malformed.code })
  ok(dispatchMod.paperDispatchStatus().last && dispatchMod.paperDispatchStatus().last.ok === false,
    '★ ④ the last refusal is VISIBLE through paperDispatchStatus() (what status() reports)', dispatchMod.paperDispatchStatus().last)
  // ③ a REAL write reply: dispatched to paper.recordPart
  const goodAnswer = { paper_part: { target: T2, title: '回执标题', solution: '回执正文' } }
  const dispatched = await dispatchMod.dispatchPaperReply({ phase: 'paper-write', turn: 't-good', member: 'r-1', flat: { kernel }, reply: goodAnswer })
  ok(dispatched.ok === true && dispatched.field === 'paper_part' && partsOf() === 1 && dispatched.result && dispatched.result.recorded === 'r-1',
    '★ 正: a paper-write reply is really recorded through paper.recordPart (the prompt contract now has a consumer)', { parts: partsOf() })
  // ③ IDEMPOTENT: the SAME turn dispatched twice writes nothing the second time
  const again = await dispatchMod.dispatchPaperReply({ phase: 'paper-write', turn: 't-good', member: 'r-1', flat: { kernel }, reply: goodAnswer })
  ok(again.ok === true && again.duplicate === true && partsOf() === 1,
    '★ ③ idempotent: re-dispatching the SAME turn reports duplicate:true and the part count stays 1', { parts: partsOf(), duplicate: again.duplicate })
  // review + final through the dispatcher
  paper.advance({ target: T2 })
  const rev1 = await dispatchMod.dispatchPaperReply({ phase: 'paper-review', turn: 't-rev-1', member: 'r-1', flat: { kernel }, reply: { paper_review: { target: T2, deliverable: true, comments: '可以' } } })
  const rev2 = await dispatchMod.dispatchPaperReply({ phase: 'paper-review', turn: 't-rev-2', member: 'r-2', flat: { kernel }, reply: { paper_review: { target: T2, deliverable: true, comments: '可以' } } })
  ok(rev1.ok === true && rev2.ok === true, '★ review replies are dispatched to paper.recordReview', { r1: rev1.ok, r2: rev2.ok })
  paper.advance({ target: T2 })
  // ★ E4: the FINAL reply now goes through the office-consult gate (kit/paper.js), so the dispatcher must refuse it by
  // name until the office answers — and the refusal must be VISIBLE through paperDispatchStatus(), never swallowed.
  const finBlocked = await dispatchMod.dispatchPaperReply({ phase: 'paper-final', turn: 't-fin-0', member: 'r-chair', flat: { kernel },
    reply: { paper_final: { target: T2, decision: 'deliverable', note: '一致', conclusion: '结论' } } })
  ok(finBlocked.ok === false && finBlocked.code === 'VMU_OFFICE_CONSULT_REQUIRED' && paper.state(T2).state.status === 'awaiting-editor',
    '★★ E4: 定稿回执在"没问所办"时被具名拦下（dispatcher 不吞），论文仍停在 awaiting-editor', { code: finBlocked.code, status: paper.state(T2).state.status })
  const finConsult = paper.recordConsult({ target: T2, by: 'office', note: '定稿前已核' })
  ok(finConsult.ok === true, '★ E4: 所办答复后可继续定稿', finConsult)
  const fin = await dispatchMod.dispatchPaperReply({ phase: 'paper-final', turn: 't-fin', member: 'r-chair', flat: { kernel },
    reply: { paper_final: { target: T2, decision: 'deliverable', note: '一致', conclusion: '结论' } } })
  ok(fin.ok === true && fin.result && fin.result.finalized === true,
    '★ final reply is dispatched to paper.recordFinal and the paper really finalises', { finalized: fin.result && fin.result.finalized })
  const noTarget = await dispatchMod.dispatchPaperReply({ phase: 'paper-write', turn: 't-notarget', member: 'r-1', flat: { kernel }, reply: { paper_part: { title: 'x', solution: 'y' } } })
  ok(noTarget.ok === false && noTarget.code === 'VMU_INVALID_ARGUMENT' && /target/.test(String(noTarget.reason)),
    '★ a reply that does not name its paper target is refused by name (the dispatcher never guesses which paper)', noTarget.reason)

  // ── ③i paperCompilePdf: the KERNEL LaTeX face, named when absent, four artefacts when it works ──────────────
  console.log('=== 3i. paperCompilePdf (kernel latex face) ===')
  const T3 = '论文-编译'
  paper.start({ target: T3, participants: ['r-1'] })
  paper.recordPart({ target: T3, member: 'r-1', title: '编译用正文', solution: '正文' })
  let noFaceErr = null
  try { await paper.compilePdf({ target: T3 }) } catch (e) { noFaceErr = e }
  ok(noFaceErr && noFaceErr.code === 'VMU_PACK_V5R_CORE_PAPER_EXECUTOR_MISSING' && /spawn/.test(String(noFaceErr.hint)),
    '★ 反: with NO kernel latex face the PDF is refused by name (…PAPER_EXECUTOR_MISSING) with the spawn-seam hint', noFaceErr && noFaceErr.code)
  const artsNoFace = paper.PaperArtifacts({ target: T3 })
  ok(artsNoFace.missing.includes('pdf') && artsNoFace.complete === false, '★ 反: and the pdf artefact is still MISSING (complete:false)', artsNoFace.missing)
  let sawRequest = null
  const fakeLatexKernel = {
    records: kernel.records, members: kernel.members, settingsSnapshot: () => kernel.settingsSnapshot(),
    latex: { check: async (req) => { sawRequest = req; return { ok: true, engine: 'xelatex', tried: ['xelatex', 'latexmk'], pdfPath: 'Paper/' + T3 + '/main.pdf', pdfBytes: 4096, elapsedMs: 17, timeoutMs: 120000 } } },
  }
  const paperWithLatex = paperMod.createPaperSubsystem({ kernel: fakeLatexKernel })
  paperWithLatex.render({ target: T3 })
  const compiled = await paperWithLatex.compilePdf({ target: T3 })
  ok(compiled.ok === true && compiled.engine === 'xelatex' && compiled.artifacts.complete === true && compiled.artifacts.missing.length === 0,
    '★★ 正: a working (faked) kernel latex face makes the PDF the FOURTH artefact — md/tex/meta/pdf all present, complete:true', compiled.artifacts && compiled.artifacts.present)
  ok(sawRequest && typeof sawRequest.source === 'string' && /\\documentclass/.test(sawRequest.source) && sawRequest.outDir === 'Paper/paper-' + T3,
    '★ the pack hands the kernel the rendered TEX source and an out dir — the kernel owns engine probing/timeout/kill', sawRequest && { outDir: sawRequest.outDir, len: String(sawRequest.source || '').length })
  const failKernel = {
    records: kernel.records, members: kernel.members, settingsSnapshot: () => kernel.settingsSnapshot(),
    latex: { check: async () => ({ ok: false, code: 'LATEX_COMPILE_FAILED', engine: 'xelatex', tried: ['xelatex'], stderr: '! Undefined control sequence.', elapsedMs: 9 }) },
  }
  const paperBadLatex = paperMod.createPaperSubsystem({ kernel: failKernel })
  let failErr = null
  try { await paperBadLatex.compilePdf({ target: T3 }) } catch (e) { failErr = e }
  ok(failErr && failErr.code === 'VMU_PACK_V5R_CORE_PAPER_PDF_FAILED' && /LATEX_COMPILE_FAILED/.test(String(failErr.message)) && /Undefined control sequence/.test(String(failErr.stderrTail)),
    '★ a REFUSED compile is named with the face\'s own code AND a bounded stderr tail (no fake success)', failErr && { code: failErr.faceCode, tail: String(failErr.stderrTail).slice(0, 24) })

  // ── ③j THE VALUE LAYER: Chinese-first engine order is PACK POLICY, the kernel stays neutral ─────────────────
  console.log('=== 3j. latexEngineOrder: policy in the pack, neutral default in the kernel ===')
  const installedOrder = kernel.settingsSnapshot()['vmu.paper.latexEngineOrder']
  ok(Array.isArray(installedOrder) && installedOrder.length > 0 && installedOrder[0] === 'xelatex',
    '★ 装 v5r ⇒ 值层把引擎顺序设成中文优先（xelatex 第一），与原版 zh 顺序一致', installedOrder && installedOrder.join(' → '))
  const bareOrder = bare.handle.kernel.settingsSnapshot()['vmu.paper.latexEngineOrder']
  const bareDecl = bare.handle.kernel.settingDef('vmu.paper.latexEngineOrder')
  // the DECLARATION is neutral (pdflatex first); a kernel without the pack holds no pack value for it at all (the
  // snapshot does not materialise schema defaults - the same lesson the v3 tools file documents).
  ok(bareDecl && Array.isArray(bareDecl.def) && bareDecl.def[0] === 'pdflatex' && (!Array.isArray(bareOrder) || bareOrder[0] !== 'xelatex'),
    '★★ 不装 v5r ⇒ 内核默认声明是中性顺序（pdflatex 第一），且没有 pack 的中文优先值 —— 这就是"策略在 pack、机制在内核"的教科书例子',
    { bareOrder: bareOrder === undefined ? '(unset)' : bareOrder, declared: bareDecl && bareDecl.def })

  // ── ③k THE SLV FIXTURE MODE (round 10): two variants + one switch, MUTUALLY EXCLUSIVE ───────────────────────
  console.log('=== 3k. THE SLV FIXTURE MODE (no-tools | tools, mutually exclusive) ===')
  const fixtureSections = PACK.sections.filter((s) => s.source === 'v5r-fixture:slv')
  ok(fixtureSections.length === 2, '★ BOTH fixture variants are declared in the manifest (declaring both is what makes a call-time switch possible)', fixtureSections.map((s) => s.name))
  const fixtureNames = fixtureSections.map((s) => s.name).sort()
  ok(J(fixtureNames) === J(['v5r-fixture-constraint', 'v5r-fixture-tools']), '★ they are exactly the constraint and the tools variant', fixtureNames)
  const fixtureMarkers = fixtureSections.map((s) => String(s.text).split('\n')[0])
  ok(new Set(fixtureMarkers).size === 2 && fixtureMarkers.filter((m) => m.includes('夹具约束')).length === 2,
    '★ their markers are UNIQUE and both belong to the fixture family', fixtureMarkers)
  const constraintMarker = '【SLV 夹具约束｜本轮不调用工具】'
  const toolsMarker = '【SLV 夹具约束｜本轮调用工具】'
  // ① the POLICY: exactly one variant enabled in each mode (the positive proof of mutual exclusion)
  const decDefault = v5r.decideSections({ settings: {} }).decisions.filter((d) => d.name.startsWith('v5r-fixture-'))
  const decTools = v5r.decideSections({ settings: { 'vmu.v5r.fixtureMode': 'tools' } }).decisions.filter((d) => d.name.startsWith('v5r-fixture-'))
  ok(decDefault.length === 2 && decDefault.filter((d) => d.enabled === true).length === 1 &&
    decDefault.filter((d) => d.name === 'v5r-fixture-constraint' && d.enabled === true).length === 1 && decDefault.filter((d) => d.name === 'v5r-fixture-tools' && d.enabled === false).length === 1,
    '★ 反（默认）: only the CONSTRAINT variant is enabled (mode defaults to no-tools)', decDefault)
  ok(decTools.length === 2 && decTools.filter((d) => d.enabled === true).length === 1 &&
    decTools.filter((d) => d.name === 'v5r-fixture-tools' && d.enabled === true).length === 1 && decTools.filter((d) => d.name === 'v5r-fixture-constraint' && d.enabled === false).length === 1,
    '★ 正: fixtureMode=tools enables ONLY the tools variant (the constraint is disabled)', decTools)
  const decBad = v5r.decideSections({ settings: { 'vmu.v5r.fixtureMode': 'nope' } }).errors
  ok(decBad.length === 1 && decBad[0].code === 'VMU_INVALID_ARGUMENT' && /fixtureMode/.test(String(decBad[0].message)),
    '★ an UNKNOWN fixture mode is refused by name (never defaulted to a guess)', decBad)
  // ② THROUGH THE REAL KERNEL PIPELINE: the TURN LOOP is what applies the policy's decisions (kernel/turn/index.js
  // calls prompt.disable/enable per turn). This test reproduces that exact step — it does NOT assume the raw
  // `assemble()` consults the policy (it does not; the policy is applied by the turn loop BEFORE assembling).
  const kernelPrompt = v5rBoot.handle.kernel.prompt
  const applyMode = (settings) => {
    for (const d of v5r.decideSections({ settings }).decisions) {
      if (d.enabled === true) kernelPrompt.enable(d.name)
      else kernelPrompt.disable(d.name)
    }
  }
  const assembleAs = async (settings) => {
    applyMode(settings)
    return (await kernelPrompt.assemble({ member: 'r-1', role: 'member', roleLabel: 'researcher', phase: 'normal', settings: {} })).text
  }
  const defaultText = await assembleAs({})
  const toolsText = await assembleAs({ 'vmu.v5r.fixtureMode': 'tools' })
  ok(defaultText.includes(constraintMarker) && !defaultText.includes(toolsMarker),
    '★ 反（经真管线 + 真实策略应用步骤）: the default assembly carries the CONSTRAINT marker and NOT the tools marker', { len: defaultText.length })
  ok(toolsText.includes(toolsMarker) && !toolsText.includes(constraintMarker),
    '★★ 正（经真管线）: fixtureMode=tools carries the TOOLS marker and NOT the constraint marker', { len: toolsText.length })
  ok([defaultText, toolsText].filter((t) => t.includes(constraintMarker) && t.includes(toolsMarker)).length === 0,
    '★★★ 互斥性: in NEITHER assembly do the two markers co-occur (the positive form of "exactly one")',
    { defaultBoth: defaultText.includes(constraintMarker) && defaultText.includes(toolsMarker), toolsBoth: toolsText.includes(constraintMarker) && toolsText.includes(toolsMarker) })
  // ③ the value layer keeps the historical default so previous rounds' results stay comparable
  const installedFixtureMode = kernel.settingsSnapshot()['vmu.v5r.fixtureMode']
  ok(installedFixtureMode === 'no-tools',
    '★ the pack\'s value layer ships fixtureMode = no-tools (the historical instruction stays the default ⇒ old runs remain comparable)', installedFixtureMode)

  // ── ③l THE PAPER DISPATCH STATUS (round 14): registered through the GENERAL `vmu.status` service ────────────
  // Round 11 could not do this: a pack module got a `{read}`-only kernel facade. The framework now hands a module's
  // LOAD-TIME factory the capability-gated `services` accessor and honours a module `dispose()` on unload, so the pack
  // registers a status SECTION and unload really clears it. The single-purpose `setPaperDispatchStatus` setter is no
  // longer used by v5r at all.
  console.log('=== 3l. paperDispatch STATUS via the general vmu.status service ===')
  const dispatchSrc = (await import('node:fs')).readFileSync(join(REPO, 'vibe-math-vmu', 'packs', 'v5r', 'middleware', 'paper-dispatch.js'), 'utf8')
  ok(dispatchSrc.includes("services.get('vmu.status')") && !/setPaperDispatchStatus\s*\(/.test(dispatchSrc),
    '★ the module registers through `services.get(\'vmu.status\')` and NO LONGER CALLS the deprecated single-point setter (code probe: a comment may name it, a CALL would fail here)', { usesStatus: dispatchSrc.includes("services.get('vmu.status')"), callsSetter: /setPaperDispatchStatus\s*\(/.test(dispatchSrc) })
  const bareSections = bare.handle.kernel.status().sections
  ok(bareSections === undefined || bareSections.paperDispatch === undefined,
    '★ 反（不装 v5r / 零机制）: with no pack the kernel status has NO `sections.paperDispatch`', bareSections && Object.keys(bareSections))
  // ★ GOAL ROUND 3: the dispatcher is DEPRECATED and NOT installed by the pack. It waits for paper_part/paper_review/
  // paper_final, but kernel/turn refuses those fields as VMU_TURN_UNKNOWN_FIELD before turn/reply-parsed — so it could
  // never fire. The real entry is the `vibe_v5_paper` tool. Assert BOTH facts instead of pretending the section exists.
  ok(dispatchMod.PAPER_DISPATCH_DEPRECATED && dispatchMod.PAPER_DISPATCH_DEPRECATED.deprecated === true &&
    dispatchMod.PAPER_DISPATCH_DEPRECATED.installedByDefault === false,
    '★★ 反：paper-dispatch 是 DEPRECATED 且默认不安装（marker 可机器读）', dispatchMod.PAPER_DISPATCH_DEPRECATED)
  const bootSections = v5rBoot.handle.kernel.status().sections
  ok(bootSections === undefined || bootSections.paperDispatch === undefined,
    '★★ 反（不再假装在工作）: 装了 v5r 也没有 `sections.paperDispatch` —— 该监听器永远收不到字段，已由 `vibe_v5_paper` 取代', bootSections && Object.keys(bootSections))
  // module-level disposer is exported (the loader\'s unload contract) and safe to call once
  ok(typeof dispatchMod.V5R_PAPER_DISPATCH.dispose === 'function',
    '★ the module EXPORTS `dispose` — the loader\'s unload contract (kernel/pack.js awaits it)', typeof dispatchMod.V5R_PAPER_DISPATCH.dispose)
  // ★★★ UNLOAD RESIDUE: a minimal manifest carrying this module really clears its section on unload (dispose awaited)
  const pm2 = await import(pathToFileURL(join(REPO, 'vibe-math-vmu', 'kernel', 'pack.js')).href)
  const km2 = await import(pathToFileURL(join(REPO, 'vibe-math-vmu', 'kernel', 'index.js')).href)
  const kUnload = km2.createKernel({ clock: () => 1000 })
  const loader2 = pm2.createPackLoader({ kernel: kUnload, registry: kUnload.registry })
  const applied2 = await loader2.apply({ id: 'v5r-status-probe', version: '1.0.0', middleware: [{ id: 'v5r.paper-dispatch', kind: 'module', order: 320, on: ['turn/reply-parsed'], failure: 'open', capabilities: ['record', 'trigger-workflow'], module: dispatchMod.V5R_PAPER_DISPATCH }] })
  ok(applied2 && applied2.ok === true && kUnload.status().sections && kUnload.status().sections.paperDispatch && kUnload.status().sections.paperDispatch.ok === true,
    '★ load-time registration works through a manifest apply (section present after apply)', applied2 && applied2.code)
  const unloaded2 = await loader2.unload('v5r-status-probe')
  const afterUnload = kUnload.status().sections
  ok(unloaded2 && unloaded2.ok === true && (afterUnload === undefined || afterUnload.paperDispatch === undefined),
    '★★★ 卸载后该段消失（零残留）: `pack.unload()` awaited the module\'s `dispose`, so the status section is gone', { residueFree: unloaded2 && unloaded2.residueFree, sections: afterUnload && Object.keys(afterUnload) })

  // ── ③o THE `progress` SHAPE (round 14): the prompt's copy-paste sample must be the kernel's REAL shape ──────
  // REAL-MACHINE DEFECT: members sent `"progress": "طول叙述"` (a string) and every write of the turn failed with
  // "unknown record track: undefined" ×19. Root cause: OUR fixture/prompts never showed the concrete shape. The shape
  // is not a guess: `FIELD_OWNERS.progress = {face:'vmu.records', op:'put'}` ⇒ the payload IS the put-args object.
  console.log('=== 3o. THE progress SHAPE: the sample the prompts teach is the shape the kernel accepts ===')
  const turnMod = await import(pathToFileURL(join(REPO, 'vibe-math-vmu', 'kernel', 'turn', 'index.js')).href)
  ok(turnMod.FIELD_OWNERS && turnMod.FIELD_OWNERS.progress && turnMod.FIELD_OWNERS.progress.face === 'vmu.records' && turnMod.FIELD_OWNERS.progress.op === 'put',
    '★ the reply field `progress` is dispatched straight to the records face `put` — so its value must be ONE put-args OBJECT', turnMod.FIELD_OWNERS.progress)
  const sampleProgress = { track: 'progress', kind: 'progress', title: '本轮进展', body: '做了什么与下一步' }
  const progressBefore = countOf(kernel, 'progress')
  const wrote = kernel.records.put(sampleProgress)
  const wroteRow = wrote && wrote.id ? (() => { const g = kernel.records.get({ id: wrote.id }); return g && g.record ? g.record : g })() : null
  ok(wrote && wrote.ok === true && countOf(kernel, 'progress') === progressBefore + 1 && wroteRow && String(wroteRow.track) === 'progress',
    '★★ 正: the EXACT sample the prompts teach is ACCEPTED by the kernel and the record really lands on the progress track', { before: progressBefore, after: countOf(kernel, 'progress'), id: wrote && wrote.id, track: wroteRow && wroteRow.track })
  let stringRefused = null
  try { kernel.records.put('长叙述') } catch (e) { stringRefused = e }
  ok(stringRefused && stringRefused.code === 'VMU_INVALID_ARGUMENT' && /unknown record track/.test(String(stringRefused.message)),
    '★★ 反: the real-machine shape (a STRING) is refused by name — exactly the "unknown record track: undefined" that killed a whole turn', stringRefused && stringRefused.code)
  let arrayRefused = null
  try { kernel.records.put([sampleProgress]) } catch (e) { arrayRefused = e }
  ok(arrayRefused && arrayRefused.code === 'VMU_INVALID_ARGUMENT',
    '★★ 反: an ARRAY is refused too (the old fixture sample showed an array!) — the sample had to be corrected, not the kernel', arrayRefused && arrayRefused.code)
  // And the prompts really carry that sample (so the proof above cannot drift away from the text a member reads).
  const sampleMarker = '"progress":{"track":"progress"'
  const withSample = [...PACK.sections].filter((s) => String(s.text || '').includes(sampleMarker))
  ok(withSample.length >= 4,
    '★★ the copy-paste sample appears in the prompts a member reads (fixture-constraint / fixture-tools / all three role lists)', withSample.map((s) => s.name))
  const wrongArraySample = [...PACK.sections].filter((s) => String(s.text || '').includes('"progress":['))
  ok(wrongArraySample.length === 0,
    '★★ the OLD array-shaped sample is GONE from every section (it was the shape that produced the real-machine failure)', wrongArraySample.map((s) => s.name))

  // ── ③p THE RECEIPT CONTRACT + THE CLOSURE VOTE (round 15): thin receipts, and what actually casts ----------
  // REAL-MACHINE DEFECT: a member finished its tool work and then wrote a RICH receipt (`note` + `solved` +
  // `vote_solved` + `meeting_hand` + `record` + a string `progress`) ⇒ "unknown reply field(s)" ×9, the whole turn
  // voided. The contract below is derived from the kernel's OWN catalogue, not invented.
  console.log('=== 3p. THE RECEIPT CONTRACT + THE CLOSURE VOTE ===')
  ok(turnMod.FIELDS.includes('progress') && turnMod.FIELDS.includes('say') &&
    turnMod.RECORDED_FIELDS.includes('solved') && turnMod.RECORDED_FIELDS.includes('vote_solved'),
    '★ the four fields the contract allows are REAL kernel fields (progress/say from FIELDS; solved/vote_solved from RECORDED_FIELDS)', { fields: turnMod.FIELDS.length, recorded: turnMod.RECORDED_FIELDS.length })
  const unknownClass = ['note', 'plan']
  ok(unknownClass.filter((f) => !turnMod.FIELDS.includes(f) && !turnMod.RECORDED_FIELDS.includes(f)).length === unknownClass.length,
    '★★ 反: `note`/`plan` are in NEITHER catalogue — writing them is the `VMU_TURN_UNKNOWN_FIELD` class the real machine hit', unknownClass)
  const turnSrc2 = (await import('node:fs')).readFileSync(join(REPO, 'vibe-math-vmu', 'kernel', 'turn', 'index.js'), 'utf8')
  ok(turnSrc2.includes("fail('VMU_TURN_UNKNOWN_FIELD'") || turnSrc2.includes('VMU_TURN_UNKNOWN_FIELD'),
    '★ the kernel really raises VMU_TURN_UNKNOWN_FIELD for those (source probe) — the failure class exists, it is not hypothetical', turnSrc2.includes('VMU_TURN_UNKNOWN_FIELD'))
  // 正: the MINIMAL receipt's only key is a kernel field ⇒ acceptable BY CONSTRUCTION
  const minimalReceipt = { vote_solved: true }
  ok(Object.keys(minimalReceipt).length === 1 && Object.keys(minimalReceipt).every((k) => turnMod.FIELDS.includes(k) || turnMod.RECORDED_FIELDS.includes(k)),
    '★★ 正: the minimal receipt {"vote_solved": true} has exactly one key and that key is a kernel field ⇒ the field gate accepts it', Object.keys(minimalReceipt))
  // 正/反: the CLOSURE PREDICATE is the kernel's, and `missing` is exactly what the fixture loop must drain.
  const votesAll = new Map([['r-1', true], ['r-2', true]])
  const allIn = turnMod.closureVoteOf({ votes: votesAll, roster: ['r-1', 'r-2'] })
  const half = new Map([['r-1', true]])
  const halfIn = turnMod.closureVoteOf({ votes: half, roster: ['r-1', 'r-2'] })
  ok(allIn.cast === true && allIn.missing.length === 0 && halfIn.cast === false && halfIn.missing.filter((m) => m === 'r-2').length === 1,
    '★★ the closure predicate: all-true ⇒ cast:true (missing empty); one silent member ⇒ cast:false with `missing` naming them — this is what the fixture tells root to drain', { all: allIn.cast, half: halfIn.cast, missing: halfIn.missing })
  // ★★★ THE WINDOW LABEL MUST MATCH THE ACTUAL SEMANTICS. A full live run recorded m1 voting in round 2 and m2 in round 6 and
  // then cast:true, and the agent reported it as "closureVote.window is round yet votes from different rounds aggregated". The
  // votes map carries no round, so nothing can expire an old vote; the truthful label is the meeting, not the round. This asserts
  // BOTH halves: the label, and the fact that an old vote really does still count (so the label can never drift back to 'round'
  // without this failing).
  const staleVote = new Map([['r-1', true], ['r-2', true]])
  const withStale = turnMod.closureVoteOf({ votes: staleVote, roster: ['r-1', 'r-2'] })
  // ★★★ PHASE 12 / R18 (the institute's own run-16 report, item 2): the label is now the scope the predicate really
  // has. The votes map is the ORCHESTRATOR's, so it cannot name a meeting — saying 'meeting' claimed a fact the reading
  // did not carry, and the run's settlement (a phase:'normal' step) could not be attributed to any of m85/m86/m87/m90.
  // A caller that knows the meeting may pass { meetingId }, and then the label IS 'meeting' — asserted both ways here.
  ok(allIn.window === 'session' && withStale.window === 'session' && allIn.meetingId === null && typeof allIn.windowMeans === 'string',
    '★★ closureVote.window is the SESSION (the votes map lives as long as the orchestrator) and it says why — a per-round label would promise expiry that does not exist, and a `meeting` label would name a meeting it cannot name', { window: allIn.window, meetingId: allIn.meetingId })
  const attributed = turnMod.closureVoteOf({ votes: new Map([['r-1', true]]), roster: ['r-1'], meetingId: 'm-7' })
  ok(attributed.window === 'meeting' && attributed.meetingId === 'm-7',
    '★★ and a caller that DOES know the meeting gets the meeting window back, with the id — so the correction is a scope statement, not the removal of a reading', { window: attributed.window, meetingId: attributed.meetingId })
  ok(withStale.cast === true,
    '★★ votes cast in a previous round still count (this is the behaviour the meeting label now declares truthfully instead of hiding behind ‘round’)', { cast: withStale.cast })
  // and the prompt teaches exactly that contract (no drift between the text a member reads and the proof above)
  const contractText = [...PACK.sections].filter((s) => String(s.text || '').includes('顶层只允许这四个字段'))
  // REPOINTED after the F5/R15 rewrite: the minimal-receipt line now teaches BOTH values ({vote_solved: true|false})
  // because the closure vote is a boolean; the old needle pinned the one-value form, so the assertion went red when the
  // text got MORE correct. The intent (the section carries a copy-pasteable vote_solved receipt) is unchanged.
  ok(contractText.length >= 1 && contractText.filter((s) => /\{"vote_solved": true(\|false)?\}/.test(String(s.text))).length >= 1,
    '★★ the fixture-tools section carries the receipt contract AND the copy-paste minimal receipt', contractText.map((s) => s.name))
  const staleNoteAdvice = [...PACK.sections].filter((s) => /写进回执的 note/.test(String(s.text || '')))
  ok(staleNoteAdvice.length === 0,
    '★★ the OLD wrong advice ("把 code 与 hint 写进回执的 note") is GONE — that advice itself produced an unknown field', staleNoteAdvice.map((s) => s.name))

  // ── ③q THE INSTITUTE'S PROBLEM (round 19): `vmu.turn.objective` is PACK POLICY, and empty was why cast stayed false ──
  // REAL-MACHINE ROOT CAUSE (the one in OUR layer): members read the charter's "原问题" as the unfilled placeholder and
  // (correctly) refused to invent a problem from the turn's `why`. "What this institute is researching" is the
  // INSTITUTION's problem, so the pack's value layer carries it (red line 1); the framework only declares the key.
  console.log('=== 3q. THE INSTITUTE\'S PROBLEM: objective in the pack value layer ===')
  const objectiveDef = kernel.settingDef('vmu.turn.objective')
  ok(objectiveDef && objectiveDef.type === 'string' && objectiveDef.def === '（尚未设定）' && objectiveDef.hot === 'H2',
    '★ the framework DECLARES the key with the unfilled placeholder as its default (hot H2) — the value is policy, not mechanism', objectiveDef && { def: objectiveDef.def, hot: objectiveDef.hot })
  const defaultsJsonR19 = JSON.parse((await import('node:fs')).readFileSync(join(REPO, 'vibe-math-vmu', 'packs', 'v5r', 'settings', 'defaults.json'), 'utf8'))
  const packObjective = defaultsJsonR19.defaults['vmu.turn.objective']
  ok(typeof packObjective === 'string' && packObjective.length > 40 && packObjective !== objectiveDef.def &&
    /前 n 个奇数之和/.test(packObjective) && /归纳/.test(packObjective),
    '★★ 正（装了 v5r 的值层携带）: the pack DEFAULT itself is the institute\'s objective — non-empty, the n² claim, with an acceptance standard', { chars: String(packObjective).length })
  // ★ NOTE: §3e above ran `vibe_v5_start({problem:'证明引理 A'})`, which sets the objective AT RUNTIME by design — so the
  // live snapshot here is that value, not the pack default. That is why the assertion above reads the VALUE LAYER, and
  // the read-path proof below passes the pack value explicitly (the turn loop passes its settings view at
  // kernel/turn/index.js:741).
  const bareObjective = bare.handle.kernel.settingsSnapshot()['vmu.turn.objective']
  const bareObjectiveDecl = bare.handle.kernel.settingDef('vmu.turn.objective')
  ok((bareObjective === undefined) && bareObjectiveDecl && bareObjectiveDecl.def === '（尚未设定）',
    '★★ 反（不装 v5r）: the kernel keeps its declared default (the placeholder) and no pack value exists — exactly the state members read on the real machine', { bareObjective: bareObjective === undefined ? '(unset)' : bareObjective, def: bareObjectiveDecl && bareObjectiveDecl.def })
  // ★ THE READ PATH (measured): the template `{{ setting:vmu.turn.objective }}` is resolved at ASSEMBLY time from the
  // call's settings (probe: a marker in ctx.settings replaced the value), and the turn loop passes its settings view at
  // kernel/turn/index.js:741 — so the value layer is both sufficient and the right owner.
  const withObjective = (await kernelPrompt.assemble({ member: 'r-1', role: 'member', roleLabel: '研究员', phase: 'normal', settings: { ...kernel.settingsSnapshot(), 'vmu.turn.objective': packObjective } })).text
  ok(withObjective.includes('前 n 个奇数之和') && !withObjective.includes('（尚未设定）'),
    '★★ 正: with the turn settings the assembled charter carries the objective (and the placeholder is gone)', { len: withObjective.length })
  const bareAssembled = (await bare.handle.kernel.prompt.assemble({ member: 'm-1', role: 'member', phase: 'normal', settings: bare.handle.kernel.settingsSnapshot() })).text
  ok(!bareAssembled.includes('前 n 个奇数之和'),
    '★★ 反: without the pack the objective is absent from the charter (no hidden second source of the problem)', { len: bareAssembled.length })
  const blocksSrc = (await import('node:fs')).readFileSync(join(REPO, 'vibe-math-vmu', 'packs', 'v5r', 'prompts', 'v5r-blocks-a.js'), 'utf8')
  ok((blocksSrc.match(/\{\{ setting:vmu\.turn\.objective \}\}/g) || []).length === 3,
    '★ the ported charter still interpolates the key in all three role texts (the field was never missing — the VALUE was)', (blocksSrc.match(/\{\{ setting:vmu\.turn\.objective \}\}/g) || []).length)

  // ── ③m THE ROLE VOCABULARY (round 12): section scopes must speak SLOT IDS, not display names ────────────────
  // THE BUG THIS PINS (found on a real machine): `scope.role` is matched against `turn.role`, which is the ROSTER SLOT
  // ID (chair/member/temp); the display names (academician/researcher) are `roleLabel`, and a scope written with them can
  // never match. The local tests used to pass the DISPLAY name as `role`, so they stayed green while the prompt was
  // empty on a real run — the (a)-class "fixture has the same shape as the wrong code" defect.
  console.log('=== 3m. THE ROLE VOCABULARY: scope.role must be the SLOT ID ===')
  const slotIds = (PACK.slots || []).map((s) => s.id).sort()
  ok(slotIds.length === 3 && J(slotIds) === J(['chair', 'member', 'temp']),
    '★ the slots come FROM THE MANIFEST (not hand-copied): chair/member/temp', slotIds)
  const roleScoped = PACK.sections.filter((s) => s.scope && s.scope.role !== undefined)
  const scopeRoleValues = [...new Set(roleScoped.flatMap((s) => Array.isArray(s.scope.role) ? s.scope.role : [s.scope.role]))].sort()
  ok(roleScoped.length > 0 && scopeRoleValues.length > 0 && scopeRoleValues.every((v) => slotIds.includes(v)),
    '★★ every `scope.role` value is one of the manifest\'s SLOT IDS (nothing outside the slot vocabulary)', { sections: roleScoped.length, values: scopeRoleValues })
  const displayNameScopes = roleScoped.filter((s) => {
    const list = Array.isArray(s.scope.role) ? s.scope.role : [s.scope.role]
    return list.some((v) => v === 'academician' || v === 'researcher')
  })
  ok(displayNameScopes.length === 0,
    '★★ NO section scopes on a DISPLAY name (academician/researcher) — that is the exact shape that rendered nothing on the real machine', displayNameScopes.map((s) => s.name))
  // POSITIVE through the real turn-applied pipeline: each SLOT ID gets its own tool list.
  const assembleForRole = async (role) => {
    applyMode({})
    return (await kernelPrompt.assemble({ member: 'r-1', role, roleLabel: role, phase: 'normal', settings: {} })).text
  }
  const asChair = await assembleForRole('chair')
  const asMemberSlot = await assembleForRole('member')
  const asTempSlot = await assembleForRole('temp')
  ok(asChair.includes('【本角色可用的工具｜院士】') && asChair.includes('vibe_v5_poll_open'),
    '★ chair slot renders the academician tool list (convening/poll verbs included)', asChair.length)
  ok(asMemberSlot.includes('【本角色可用的工具｜研究员】') && !asMemberSlot.includes('【本角色可用的工具｜院士】'),
    '★ member slot renders the researcher tool list and not the chair one', asMemberSlot.length)
  ok(asTempSlot.includes('【本角色可用的工具｜临时成员】') && !asTempSlot.includes('【本角色可用的工具｜研究员】'),
    '★ temp slot renders the temp tool list only', asTempSlot.length)
  // NEGATIVE (this is the real-machine shape): a DISPLAY name as `role` renders NO ROLE-SCOPED v5r section at all.
  // (The non-role-scoped sections — e.g. the no-tools fixture constraint — legitimately still render; only sections whose
  // scope is a role are evidence here, so those are exactly the markers counted below.)
  const asDisplayAcademician = await assembleForRole('academician')
  const asDisplayResearcher = await assembleForRole('researcher')
  const displayMarkers = ['【本角色可用的工具｜院士】', '【本角色可用的工具｜研究员】', '【本角色可用的工具｜临时成员】', '【SLV 夹具约束｜本轮调用工具】']
  const renderedWithDisplay = [asDisplayAcademician, asDisplayResearcher]
    .filter((t) => displayMarkers.some((m) => t.includes(m))).length
  ok(renderedWithDisplay === 0,
    '★★★ 负证明: when `role` is a DISPLAY name (academician/researcher) NO role-scoped v5r section renders — so the next person who writes a display name in a scope turns this red',
    { displayAcademician: asDisplayAcademician.includes('【本角色可用的工具'), displayResearcher: asDisplayResearcher.includes('【本角色可用的工具') })

  // ★ LIVE RUN 23 (b)1 — THE HEADING USED TO CLAIM PER-TURN AVAILABILITY. `tools:"none"` narrows the REAL wire, but the
  // role catalogue is static text: a heading 「本轮可用的工具」 sitting beside the host's 「本轮你实际能调用的工具」 gave two
  // similar names to two different things, and the institute reported the catalogue as proof that the override had not
  // applied. The catalogue heading is 本角色 now, and the sentence that points at the host's section states outright that
  // the catalogue is NOT a promise about the mounted face.
  const toolsSectionText = (PACK.sections || []).map((s2) => (s2 && typeof s2.text === 'string' ? s2.text : '')).join('\n')
  ok(!toolsSectionText.includes('【本轮可用的工具｜'),
    '★★ no pack section claims "THIS TURN" tool availability any more (that heading now belongs to the host-written section alone)',
    toolsSectionText.includes('【本轮可用的工具｜'))
  ok(toolsSectionText.includes('不承诺「本回合已挂载」') && toolsSectionText.includes('本轮你实际能调用的工具'),
    '★ and the pointer sentence says the catalogue is a ROLE list, naming the host section as the availability authority',
    { disclaimer: toolsSectionText.includes('不承诺「本回合已挂载」'), namesHostSection: toolsSectionText.includes('本轮你实际能调用的工具') })

  // ── ③n THE BINDING VOCABULARY (round 13): the charter's role BINDINGS must speak slot ids too ───────────────  // Same mechanism as §3m, one layer deeper: a binding's `role` dimension is matched against turn.role (the SLOT ID).
  // The charter's texts are keyed by the SOURCE's words (academician/researcher/temp); emitting those words as binding
  // dimensions made the role-specific content DEAD — every seat fell back to the section default (= researcher text).
  console.log('=== 3n. THE BINDING VOCABULARY: charter role bindings speak slot ids ===')
  const roleBindings = (PACK.bindings || []).filter((b) => b && b.role !== undefined)
  const bindingRoleCounts = roleBindings.reduce((m, b) => { m[b.role] = (m[b.role] || 0) + 1; return m }, {})
  ok(roleBindings.length > 0 && Object.keys(bindingRoleCounts).length === 3 &&
    bindingRoleCounts.chair > 0 && bindingRoleCounts.member > 0 && bindingRoleCounts.temp > 0,
    '★ every charter role binding uses a SLOT ID (chair/member/temp), with all three seats represented', bindingRoleCounts)
  const displayNameBindings = roleBindings.filter((b) => b.role === 'academician' || b.role === 'researcher')
  ok(displayNameBindings.length === 0,
    '★★ NO charter binding uses a DISPLAY name any more (that was the shape that made the role content dead on a real run)', displayNameBindings.length)
  // POSITIVE: the two permanent seats really receive DIFFERENT charter content for the same role-varying section.
  const roleSection = roleBindings[0].section
  const miniSections = PACK.sections.filter((s) => s.name === roleSection)
  const miniBindings = roleBindings.filter((b) => b.section === roleSection)
  ok(miniSections.length === 1 && miniBindings.filter((b) => b.role === 'chair' || b.role === 'member').length === 2,
    'precondition: a role-varying charter section exists with a bindings pair for chair and member', { section: roleSection, bindings: miniBindings.length })
  const miniPipe = promptMod2.createPromptPipeline({ sections: miniSections, bindings: miniBindings, settings: {}, counts: {} })
  const seatText = async (role) => (await miniPipe.assemble({ member: 'r-1', role, roleLabel: role, phase: 'normal', settings: {} })).text
  const chairCharter = await seatText('chair')
  const memberCharter = await seatText('member')
  const defaultCharter = await seatText('academician')   // a display name matches NO binding ⇒ the section's default text
  ok(chairCharter.length > 0 && memberCharter.length > 0 && chairCharter !== memberCharter,
    '★★★ 正: the CHAIR seat and the MEMBER seat receive DIFFERENT charter text for the same section (the role content is alive again)', { chair: chairCharter.length, member: memberCharter.length })
  // The section's DEFAULT text (what a non-matching role falls back to) is `texts['with-leader'] || texts.researcher`
  // in `charterSections()` — i.e. the RESEARCHER version. That is the measured answer to "which seat's text was every
  // real run actually reading": the member/researcher one, for every seat.
  ok(defaultCharter === memberCharter && defaultCharter !== chairCharter,
    '★★ 负证明: a DISPLAY name as `role` matches NO binding and lands on the section\'s DEFAULT text, which IS the member/researcher version — so before this fix EVERY seat (the academician included) read the researcher charter',
    { defaultLen: defaultCharter.length, equalsMember: defaultCharter === memberCharter, equalsChair: defaultCharter === chairCharter })

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
  ok(J(rolesScoped.sort()) === J(['chair', 'member', 'temp']), 'each is scoped to exactly ONE role (no cross-role prelude)', rolesScoped)
  const markers = toolSections.map((s) => String(s.text).split('\n')[0])
  const badMarkers = markers.filter((m) => !m.startsWith('【本角色可用的工具｜'))
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
  const asResearcher = await textFor('member')
  const asTemp = await textFor('temp')
  const asAcademician = await textFor('chair')
  ok(asResearcher.includes('vibe_v5_record_proposition') && asResearcher.includes('【本角色可用的工具｜研究员】'),
    'the researcher\'s assembly carries the researcher tool list', asResearcher.length)
  ok(asAcademician.includes('vibe_v5_message') && asAcademician.includes('【本角色可用的工具｜院士】'),
    'the academician sees the office-relay tool (the researcher\'s list does not have it)', asAcademician.length)
  // THE SUBSET IS CHECKED ON THE SECTION ITSELF (the assembled prompt legitimately mentions these names elsewhere in
  // the charter, so a whole-prompt grep would confuse prose with a tool list).
  const tempSection = toolSections.filter((s) => s.scope && s.scope.role === 'temp')[0]
  const researcherSection = toolSections.filter((s) => s.scope && s.scope.role === 'member')[0]
  const acadSection = toolSections.filter((s) => s.scope && s.scope.role === 'chair')[0]
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
  ok(asTemp.includes('【本角色可用的工具｜临时成员】') && !asTemp.includes('【本角色可用的工具｜研究员】'),
    'the TEMP assembly carries its OWN marker and not another role\'s', asTemp.length)
  ok(!asResearcher.includes('【本角色可用的工具｜临时成员】') && !asAcademician.includes('【本角色可用的工具｜研究员】'),
    'no role sees another role\'s tool list (no cross-role leak)', { researcherHasTemp: asResearcher.includes('｜临时成员'), acadHasRes: asAcademician.includes('｜研究员') })

  // ── ⑥ UNLOAD RETRACTS THE DECLARATIONS ─────────────────────────────────────────────────────────────────────
  console.log('=== 6. UNLOAD RETRACTS THE NAMES (the pack is the mechanism, and it comes off) ===')
  const km = await import(pathToFileURL(join(REPO, 'vibe-math-vmu', 'kernel', 'index.js')).href)
  const pm = await import(pathToFileURL(join(REPO, 'vibe-math-vmu', 'kernel', 'pack.js')).href)
  const k2 = km.createKernel({ clock: () => 1000, root })
  const loader = pm.createPackLoader({ kernel: k2, registry: k2.registry })
  const applied = await loader.apply({ id: 'v5r-tools-probe', version: '1.0.0', tools: toolsMod.V5R_PACK_TOOLS })
  ok(applied && applied.ok === true, 'a manifest carrying every declaration APPLIES', applied && (applied.code || applied.id))
  ok(k2.packTools().length === EXPECTED.length, 'the kernel holds every name after apply', k2.packTools().length)
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
  const origSrc = fsMod.readFileSync(join(legacyDir('vibe-math-v5r'), 'vibe-math-v5r.js'), 'utf8')
  const corpusSrc = fsMod.readFileSync(join(REPO, 'vibe-math-vmu', 'packs', 'v5r', 'prompts', 'v5r-prompts.js'), 'utf8')
  const taught = [...new Set((corpusSrc.match(/vibe_v5_[a-z_]+/g) || []))]
  const undeclaredTaught = taught.filter((n) => !EXPECTED.includes(n))
  ok(taught.length > 0 && undeclaredTaught.length === 0,
    '★ closed world: every vibe_v5_* name the PROMPT CORPUS teaches is declared as a tool (nothing taught-but-missing is left)', { taught: taught.length, missing: undeclaredTaught })
  const gaps = toolsMod.V5R_NAMED_GAPS
  // ★ 4, not 5: `task-priority SETTER` LEFT this list when the kernel gained setPriority. The COUNT is only a shape check;
  // the anti-rot guard is the NEXT assertion, which re-checks that each named capability is still grep-ABSENT from the
  // kernel file it names - that is what makes this list unable to lie, and it is why the count had to move with the fix.
  ok(Array.isArray(gaps) && gaps.length === 4 && gaps.filter((g) => typeof g === 'string' && g.length > 20).length === 4,
    '★ the measured limits are recorded as NAMED GAPS (visible-tools reader / mail purge / per-box secrecy / meeting propose)', gaps && gaps.length)
  // ★ ROUND 23: three of the six old gaps were CLOSED by the kernel in round 6 and are now WIRED by this pack. The list
  // must say so, and every remaining gap must be VERIFIABLE — its missing capability has to still be grep-absent from the
  // kernel file named in the check (this is the anti-rot guard: if the kernel gains the capability, this flips red).
  const closed = toolsMod.V5R_CLOSED_GAPS
  ok(Array.isArray(closed) && closed.length === 4 && closed.filter((c) => /kernel\//.test(String(c.kernel)) && /vibe_v5_/.test(String(c.wired))).length === 4,
    '★★ the gaps CLOSED by the kernel and WIRED here are recorded as data (with the kernel file reference and the wiring)', closed && closed.map((c) => c.id))
  const gapChecks = toolsMod.V5R_NAMED_GAP_CHECKS
  const fsModGap = await import('node:fs')
  const gapVerdicts = []
  for (const c of (gapChecks || [])) {
    const src = fsModGap.readFileSync(join(REPO, 'vibe-math-vmu', ...c.file.split('/')), 'utf8')
    gapVerdicts.push({ gap: c.gap, file: c.file, absent: (src.match(c.absent) || []).length, present: c.present ? (src.match(c.present) || []).length : -1 })
  }
  // ★ 4, not 5: the `task priority setter` check left with the gap it guarded, because the kernel gained setPriority.
  ok(Array.isArray(gapChecks) && gapChecks.length === 4 && gapVerdicts.filter((v) => v.absent === 0 && (v.present === -1 || v.present > 0)).length === 4,
    '★★★ every NAMED GAP is still VERIFIABLE: the claimed-missing capability is grep-ABSENT from the kernel file it names (and the provider it names is still present) — the list cannot silently go stale again',
    { checked: gapVerdicts.length, all: gapVerdicts.filter((v) => v.absent === 0 && (v.present === -1 || v.present > 0)).length })
  // ★ ROUND 4: `tool_help` is no longer a prompt invention — it is DECLARED, and the original still has no such tool.
  const helpDeclared = PACK.tools.some((t) => t.name === 'vibe_v5_tool_help')
  ok(helpDeclared && origSrc.includes("registerTool('vibe_v5_tool_help'") === false,
    '★ `vibe_v5_tool_help` is now a REAL declared tool although the ORIGINAL never registered it (the prompt was implemented, not deleted)', { declared: helpDeclared })
  // ── ⑦b ROUND 23: the pack now WIRES what the kernel closed in round 6 ─────────────────────────────────────────
  console.log('=== 7b. ROUND 23: SECRETARY / PRIORITY / PER-BOX FLOOR ===')
  const secMeet = await receipt(v5rBoot, 'vibe_v5_meeting', { agenda: '记录人测试', kind: 'sync', member: chairId, secretary: 'r-temp-1' })
  const secMeetId = secMeet.parsed && (secMeet.parsed.meeting && (secMeet.parsed.meeting.id || secMeet.parsed.meeting))
  const secView = secMeetId ? v5rBoot.handle.kernel.meetings.meetingView({ meeting: secMeetId }) : null
  ok(secMeet.parsed && secMeet.parsed.ok === true && secMeet.parsed.secretary === 'r-temp-1' && secView && secView.secretary === 'r-temp-1',
    '★★ ③ secretary: the recorder is accepted at open and the kernel meeting view carries it', secView && { secretary: secView.secretary, chair: secView.chair })
  const secUnknown = await receipt(v5rBoot, 'vibe_v5_meeting', { agenda: 'x', kind: 'sync', member: chairId, secretary: 'nobody' })
  ok(secUnknown.parsed && secUnknown.parsed.ok === false && secUnknown.parsed.code === 'VMU_NO_SUCH_OBJECT',
    '★ ③ 反: a secretary that is not on the roster is refused by name (no phantom recorder)', secUnknown.parsed && secUnknown.parsed.code)
  const secPoll = await receipt(v5rBoot, 'vibe_v5_poll_open', { question: '记录人测试票', options: ['a', 'b'], member: chairId })
  const secPollVote = secPoll.parsed && secPoll.parsed.boxId
    ? await receipt(v5rBoot, 'vibe_v5_poll_vote', { ballot_id: secPoll.parsed.boxId, choices: ['a'], member: 'r-temp-1' })
    : { parsed: null }
  ok(secPoll.parsed && secPoll.parsed.ok === true && secPollVote.parsed && secPollVote.parsed.ok === false && secPollVote.parsed.code === 'VMU_NOT_PERMITTED',
    '★★ ③ 记录权≠表决权: the SECRETARY (a temp seat) still cannot vote — the recorder right grants no ballot', secPollVote.parsed && secPollVote.parsed.code)
  // ★ the kernel STORES priority and SORTS by it, but its list projection omits the field (kernel/tasks.js:368-372) —
  // so the honest observation is the receipt plus the BOARD ORDER, not a priority column that the view does not carry.
  // The lifecycle section above STOPPED the institute (stop is terminal; resume does not reopen it), so the priority
  // observation runs on a FRESH kernel: storage + board order are the KERNEL's facts.
  const taskKernel = km2.createKernel({ clock: () => 1000 })
  await taskKernel.tasks.create({ title: '低优先级任务', priority: 0 })
  await taskKernel.tasks.create({ title: '高优先级任务', priority: 9 })
  const rowsT = taskKernel.tasks.list()
  const idxHighT = rowsT.findIndex((t) => String(t.title) === '高优先级任务')
  const idxLowT = rowsT.findIndex((t) => String(t.title) === '低优先级任务')
  ok(rowsT.length === 2 && idxHighT === 0 && idxLowT === 1,
    '★★ task priority: the ledger STORES it and the BOARD ORDER shows it (priority 9 row first, priority 0 row second)', { idxHigh: idxHighT, idxLow: idxLowT })
  const toolsSrcPrio = fsModGap.readFileSync(join(REPO, 'vibe-math-vmu', 'kit', 'extras.js'), 'utf8')
  ok(/tasks\.create\(\{[\s\S]{0,400}?priority,/.test(toolsSrcPrio),
    '★★ and the kit handler really passes it (the probe follows task_create into kit/extras.js, where it now lives) — the tool no longer drops the hint', null)
  const floorPoll = await receipt(v5rBoot, 'vibe_v5_poll_open', { question: '门槛测试', options: ['a', 'b'], min_votes: 2, member: chairId })
  const floorBox = floorPoll.parsed && floorPoll.parsed.boxId
  await receipt(v5rBoot, 'vibe_v5_poll_vote', { ballot_id: floorBox, choices: ['a'], member: 'r-1' })
  const floorClose = await receipt(v5rBoot, 'vibe_v5_poll_close', { ballot_id: floorBox, member: chairId })
  ok(floorPoll.parsed && floorPoll.parsed.rulesDeclared === true && floorClose.parsed && floorClose.parsed.ok === false && floorClose.parsed.code === 'VMU_BALLOT_MIN_VOTES_NOT_MET',
    '★★★ ① 正: a PER-BOX min_votes:2 box with ONE vote refuses on close with the kernel\'s own VMU_BALLOT_MIN_VOTES_NOT_MET (the kernel criterion, not a pack rule)', floorClose.parsed && floorClose.parsed.code)
  const plainPoll = await receipt(v5rBoot, 'vibe_v5_poll_open', { question: '无规则对照', options: ['a', 'b'], member: chairId })
  ok(plainPoll.parsed && plainPoll.parsed.ok === true && plainPoll.parsed.rulesDeclared === false && Object.keys(plainPoll.parsed.rules || {}).length === 0,
    '★★ ① 反: with no rules asked, rulesDeclared is FALSE and the box behaves as before (the deployment policy applies)', plainPoll.parsed && { rulesDeclared: plainPoll.parsed.rulesDeclared })
  // ── ⑦c GOAL A (PHASE 8): THE ROLE-SCOPED TOOL FACE ────────────────────────
  // ── ⑦b-bis A1 (轮 10): THE FOUR DEFECTS OF THE MEETING CHAIN ──────────────────────────────────────────────
  console.log('=== 7b-bis. A1: ghost vote / id bridge / eligible seats / service summary ===')
  const a1Kernel = v5rBoot.handle.kernel
  const a1Svc = a1Kernel.meetings
  const a1View = typeof a1Kernel.settingsView === 'function' ? a1Kernel.settingsView() : {}
  const a1Seats = a1View['vmu.meetings.eligibleSeats']
  ok(Array.isArray(a1Seats) && a1Seats.join(',') === 'chair,member',
    '★ A1④: the voter seats are a DECLARED pack value (chair/member) — no longer a constant in the pack handler', a1Seats)
  const a1Elig = a1Svc.eligibleVoterIds()
  ok(a1Elig && a1Elig.restricted === true && a1Elig.ids.includes('r-1') === true && a1Elig.ids.includes('r-temp-1') === false,
    '★ A1④: the SAME declaration decides the eligible ids (a member seat yes / a temp seat no)', a1Elig)
  const a1Open = await receipt(v5rBoot, 'vibe_v5_meeting', { agenda: 'A1 会议', kind: 'sync', member: chairId })
  const a1Mid = a1Open.parsed && (a1Open.parsed.meeting && (a1Open.parsed.meeting.id || a1Open.parsed.meeting))
  ok(!!a1Mid, '★ A1 setup: a service meeting was opened', a1Mid)
  const a1Mo = await receipt(v5rBoot, 'vibe_v5_motion', { meeting: a1Mid, kind: 'topic', text: 'A1 动议', member: 'r-1' })
  const a1MoId = a1Mo.parsed && a1Mo.parsed.motion
  ok(!!a1MoId, '★ A1 setup: a motion exists for the vote checks', a1Mo.parsed && a1Mo.parsed.motion)
  // ① ghost vote (was counted: the service had no roster seam)
  let a1Ghost = null
  try { a1Svc.vote({ meeting: a1Mid, member: 'r-ghost-a1', motion: a1MoId, value: 1 }) } catch (e) { a1Ghost = e }
  ok(a1Ghost && a1Ghost.code === 'VMU_NOT_MEMBER',
    '★ A1①: a NON-MEMBER vote is refused by name (the assembly passes the members seam now; this used to be counted)', a1Ghost && a1Ghost.code)
  // ③ temp seat on the SERVICE (the seat declaration decides)
  let a1TempVote = null
  try { a1Svc.vote({ meeting: a1Mid, member: 'r-temp-1', motion: a1MoId, value: 1 }) } catch (e) { a1TempVote = e }
  ok(a1TempVote && a1TempVote.code === 'VMU_NOT_PERMITTED' && Array.isArray(a1TempVote.enforced) && a1TempVote.enforced.includes('vmu.meetings.eligibleSeats'),
    '★ A1③[service]: the TEMP seat is refused by the declared seats, and the refusal names the key in enforced[]', a1TempVote && { code: a1TempVote.code, enforced: a1TempVote.enforced })
  // ★ LIVE RUN 18 / §109: the quorum floor now has a SOURCE and the pack declares `universe`, so a vote in a 3-seat
  // house needs the three eligible seats PRESENT (m = min(setting, 院士+常驻)). The old fixture voted with the chair
  // alone and expected it to count - that expectation encoded the missing floor. Seat the residents first.
  a1Svc.attend({ meeting: a1Mid, member: 'r-1' })
  a1Svc.attend({ meeting: a1Mid, member: 'r-2' })
  const a1ChairVote = a1Svc.vote({ meeting: a1Mid, member: chairId, motion: a1MoId, value: 1 })
  ok(a1ChairVote && a1ChairVote.counted === true && a1ChairVote.tally.for === 1,
    '★ A1③[service] 正: a declared voter seat still counts', a1ChairVote && a1ChairVote.tally)
  // ⑤ summary reads the SERVICE for a service id
  const a1Sum = await receipt(v5rBoot, 'vibe_vmu_meeting', { action: 'summary', id: a1Mid })
  ok(a1Sum.parsed && a1Sum.parsed.ok === true && Array.isArray(a1Sum.parsed.motions) && a1Sum.parsed.motions.length === 1 &&
    a1Sum.parsed.motions[0].tally && a1Sum.parsed.motions[0].tally.for === 1 && Array.isArray(a1Sum.parsed.motions[0].votes),
    '★ A1⑤: the vmu summary reads a SERVICE meeting and carries motions/votes (this answered "no live meeting" before)', a1Sum.parsed && a1Sum.parsed.motions)
  // ② the id bridge
  const a1Bridge = await receipt(v5rBoot, 'vibe_vmu_meeting', { action: 'open', id: 'a1-bridge-id', agenda: 'A1 桥', roster: a1Kernel.members.roster().map((m) => m.id), secretary: chairId })
  const a1BridgeId = a1Bridge.parsed && a1Bridge.parsed.id
  ok(a1Bridge.parsed && a1Bridge.parsed.ok === true && a1BridgeId === 'a1-bridge-id' && a1Bridge.parsed.serviceMeeting === a1BridgeId,
    '★ A1② 正: an explicit id is honoured by the service — the primitive and the service record share ONE id', a1Bridge.parsed && { id: a1Bridge.parsed.id, serviceMeeting: a1Bridge.parsed.serviceMeeting })
  ok(!!a1Kernel.liveMeeting('a1-bridge-id') && a1Svc.status().liveMeetings.includes('a1-bridge-id'),
    '★ A1②: the same id is addressable in BOTH spaces (this is the "vibe_vmu_meeting status finds it" criterion)', { live: a1Kernel.liveList().meetings.filter((x) => x === 'a1-bridge-id'), service: a1Svc.status().liveMeetings.filter((x) => x === 'a1-bridge-id') })
  const a1Dup = await receipt(v5rBoot, 'vibe_vmu_meeting', { action: 'open', id: 'a1-bridge-id', agenda: 'dup', secretary: chairId })
  ok(a1Dup.parsed && a1Dup.parsed.ok === false && a1Dup.parsed.code === 'VMU_CONFLICT',
    '★ A1② 反: re-using a LIVE id is refused by name (no silent replacement)', a1Dup.parsed && a1Dup.parsed.code)
  // ③ the per-object ballot gets the declared eligible list
  const a1Ballot = await receipt(v5rBoot, 'vibe_vmu_meeting', { action: 'ballot', target: 'a1-claim', member: chairId })
  const a1Bid = a1Ballot.parsed && a1Ballot.parsed.ballotId
  ok(a1Ballot.parsed && a1Ballot.parsed.ok !== false && Array.isArray(a1Ballot.parsed.eligible) &&
    a1Ballot.parsed.eligible.includes('r-1') && !a1Ballot.parsed.eligible.includes('r-temp-1'),
    '★ A1③: the per-object ballot is created with the DECLARED eligible list (temp excluded)', a1Ballot.parsed && a1Ballot.parsed.eligible)
  const a1TempCast = await receipt(v5rBoot, 'vibe_vmu_meeting', { action: 'vote', ballotId: a1Bid, member: 'r-temp-1', value: '1' })
  ok(a1TempCast.parsed && a1TempCast.parsed.ok === false && a1TempCast.parsed.code === 'VMU_NOT_PERMITTED',
    '★ A1③ 反: the temp seat cannot cast that ballot (the kernel ballot refuses by name)', a1TempCast.parsed && a1TempCast.parsed.code)
  const a1ChairCast = await receipt(v5rBoot, 'vibe_vmu_meeting', { action: 'vote', ballotId: a1Bid, member: 'r-1', value: '1' })
  ok(a1ChairCast.parsed && a1ChairCast.parsed.ok !== false,
    '★ A1③ 正: a member seat can cast it', a1ChairCast.parsed && a1ChairCast.parsed.ok)
  // ── ⑦b-quater G7 (round 9): ONE AUTHORITY — a ballot's votes reach the service motion tally ────────────────
  console.log('=== 7b-quater. G7: ballot votes merge into the service tally (one authority) ===')
  const g7m = await receipt(v5rBoot, 'vibe_v5_meeting', { agenda: 'G7 合流', kind: 'sync', member: chairId })
  const g7mid = g7m.parsed && g7m.parsed.meeting
  // ★ §109: the floor is the eligible universe, so the three eligible seats must be PRESENT before any vote counts.
  v5rBoot.handle.kernel.meetings.attend({ meeting: g7mid, member: 'r-1' })
  v5rBoot.handle.kernel.meetings.attend({ meeting: g7mid, member: 'r-2' })
  const g7mo = await receipt(v5rBoot, 'vibe_v5_motion', { meeting: g7mid, member: 'r-1', kind: 'topic', text: '接受证明' })
  const g7moid = g7mo.parsed && g7mo.parsed.motion
  await receipt(v5rBoot, 'vibe_v5_second', { meeting: g7mid, motion_id: g7moid, member: chairId })
  const g7ballot = await receipt(v5rBoot, 'vibe_vmu_meeting', { action: 'ballot', meeting: g7mid, target: g7moid, member: chairId })
  ok(g7ballot.parsed && g7ballot.parsed.ok === true && g7ballot.parsed.opened && g7ballot.parsed.opened.target === g7moid &&
    g7ballot.parsed.target === g7moid && g7ballot.parsed.meeting === g7mid && g7ballot.parsed.mergedInto && g7ballot.parsed.mergedInto.motion === g7moid,
    '★ G7 ③: `opened.target` equals the top-level target, and the ballot is BOUND to (meeting, motion) — no self-contradicting receipt',
    g7ballot.parsed && { openedTarget: g7ballot.parsed.opened && g7ballot.parsed.opened.target, target: g7ballot.parsed.target, mergedInto: g7ballot.parsed.mergedInto })
  const g7bid = g7ballot.parsed && g7ballot.parsed.ballotId
  const g7v1 = await receipt(v5rBoot, 'vibe_vmu_meeting', { action: 'vote', ballotId: g7bid, member: 'r-1', value: 1 })
  const g7v2 = await receipt(v5rBoot, 'vibe_vmu_meeting', { action: 'vote', ballotId: g7bid, member: chairId, value: 1 })
  ok(g7v1.parsed && g7v1.parsed.ok === true && g7v1.parsed.serviceVote && g7v1.parsed.serviceVote.ok === true && g7v1.parsed.serviceVote.tally.for === 1 &&
    g7v2.parsed && g7v2.parsed.serviceVote && g7v2.parsed.serviceVote.ok === true && g7v2.parsed.serviceVote.tally.for === 2,
    '★ G7 ① 正: each ballot cast writes the SERVICE motion tally (1 → 2) and the mirror receipt is on the vote',
    { v1: g7v1.parsed && g7v1.parsed.serviceVote && g7v1.parsed.serviceVote.tally, v2: g7v2.parsed && g7v2.parsed.serviceVote && g7v2.parsed.serviceVote.tally })
  const g7sum = await receipt(v5rBoot, 'vibe_vmu_meeting', { action: 'summary', meeting: g7mid })
  ok(g7sum.parsed && g7sum.parsed.ok === true && g7sum.parsed.motions && g7sum.parsed.motions[0] &&
    g7sum.parsed.motions[0].tally && g7sum.parsed.motions[0].tally.for === 2 && g7sum.parsed.votes === 2,
    '★ G7 ① 判据：ballot vote 之后 service summary 的 tally.for=2、votes=2（两套账合流）',
    g7sum.parsed && { tally: g7sum.parsed.motions && g7sum.parsed.motions[0] && g7sum.parsed.motions[0].tally, votes: g7sum.parsed.votes })
  const g7conflict = await receipt(v5rBoot, 'vibe_vmu_meeting', { action: 'summary', id: 'another-meeting', meeting: g7mid })
  ok(g7conflict.parsed && g7conflict.parsed.ok === false && g7conflict.parsed.code === 'VMU_INVALID_ARGUMENT' && /different/.test(String(g7conflict.parsed.message)),
    '★ G7 ② 反：id 与 meeting 不一致 ⇒ 具名拒（不静默偏向其中一个）', g7conflict.parsed && g7conflict.parsed.message)
  const g7missing = await receipt(v5rBoot, 'vibe_vmu_meeting', { action: 'summary' })
  ok(g7missing.parsed && g7missing.parsed.ok === false && g7missing.parsed.code === 'VMU_INVALID_ARGUMENT' &&
    /meeting id/.test(String(g7missing.parsed.message)) && /alias/.test(String(g7missing.parsed.hint)),
    '★ G7 ② 正：两个参数都没给 ⇒ 拒说清"这个 action 要哪个字段"并点明 alias', g7missing.parsed && { message: g7missing.parsed.message, hint: g7missing.parsed.hint })
  const g7mo2 = await receipt(v5rBoot, 'vibe_v5_motion', { meeting: g7mid, member: 'r-1', kind: 'topic', text: '第二动议' })
  const g7sv = await receipt(v5rBoot, 'vibe_vmu_meeting', { action: 'vote', meeting: g7mid, motion: g7mo2.parsed && g7mo2.parsed.motion, member: 'r-1', value: 1 })
  ok(g7sv.parsed && g7sv.parsed.ok === true && g7sv.parsed.registry === 'service' && g7sv.parsed.tally && g7sv.parsed.tally.for === 1,
    '★ G7 ②: action vote ALSO accepts (meeting + motion) — the service-motion vote path is reachable from the same action',
    g7sv.parsed && { registry: g7sv.parsed.registry, tally: g7sv.parsed.tally })
  const g7vbad = await receipt(v5rBoot, 'vibe_vmu_meeting', { action: 'vote' })
  ok(g7vbad.parsed && g7vbad.parsed.ok === false && g7vbad.parsed.code === 'VMU_INVALID_ARGUMENT' &&
    /ballotId/.test(String(g7vbad.parsed.message)) && /meeting/.test(String(g7vbad.parsed.message)),
    '★ G7 ② 反：vote 没有任何地址 ⇒ 具名拒并同时说出两种合法形状', g7vbad.parsed && g7vbad.parsed.message)
  // ★ UPDATED WITH THE CAPABILITY (phase 12, rule D2): the v5r pack now declares `vmu.meetings.closeRequiresChair`, so a
  // close must be ATTRIBUTABLE and must name the chair. The kernel face falls back actor → by → member, so `member` alone
  // is a route; the assertion keeps its original subject (the enforced arrays are real arrays, not "[circular]").
  const g7close = await receipt(v5rBoot, 'vibe_vmu_meeting', { action: 'close', meeting: g7mid, member: chairId })
  ok(g7close.parsed && g7close.parsed.ok === true && Array.isArray(g7close.parsed.enforced) && Array.isArray(g7close.parsed.receipt && g7close.parsed.receipt.enforced),
    '★ G7 ④：close 回执的 enforced 是【数组】（顶层与 receipt 内都是），不是 "[circular]" 串',
    g7close.parsed && { enforced: g7close.parsed.enforced, inReceipt: g7close.parsed.receipt && g7close.parsed.receipt.enforced })
  console.log('=== 7c. GOAL A: role-scoped tool faces (prompt == declaration) ===')
  const faces = PACK.toolFaces
  const faceRoles = faces ? Object.keys(faces).sort() : []
  ok(JSON.stringify(faceRoles) === JSON.stringify(['chair', 'member', 'temp']),
    '★★ the manifest declares a tool face for each of the THREE slot ids (chair/member/temp)', faceRoles)
  // THE SAME-SOURCE PROOF: the allow list the manifest applies IS the set of tool names the role prompt teaches.
  const reDerive = (section) => [...new Set(String(section.text).matchAll(/vibe_v5_[a-z0-9_]+/g).map((m) => m[0]))]
  const coreModA = await import(pathToFileURL(join(REPO, 'vibe-math-vmu', 'packs', 'v5r', 'prompts', 'v5r-core.js')).href)
  const sectionFor = { chair: coreModA.v5rToolSectionAcademician, member: coreModA.v5rToolSectionResearcher, temp: coreModA.v5rToolSectionTemp }
  // ★ ROUND 31: the derivation counts LINE-STARTING BULLETS only, so the same-source identity is split into TWO pairs
  // (they answer different questions): A = bullet list ↔ what the seat can actually call; B = declaration ↔ bullet.
  const bulletNames = (section) => [...new Set(String(section.text).split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('·'))
    .flatMap((line) => line.match(/vibe_v5_[a-z0-9_]+/g) || []))]
  const allNamesIn = (section) => [...new Set(String(section.text).match(/vibe_v5_[a-z0-9_]+/g) || [])]
  const allDeclared = (PACK.tools || []).map((x) => x.name)
  const roleRows = [
    { role: 'chair', section: sectionFor.chair, deny: faces.chair.deny },
    { role: 'member', section: sectionFor.member, deny: faces.member.deny },
    { role: 'temp', section: sectionFor.temp, deny: faces.temp.deny },
  ]
  // A) bullet ↔ visible (declared − deny)
  const pairA = roleRows.map((r) => {
    const bullets = bulletNames(r.section)
    const visible = allDeclared.filter((n) => !r.deny.includes(n))
    return {
      role: r.role,
      bullets: bullets.length,
      visible: visible.length,
      missingInVisible: bullets.filter((n) => !visible.includes(n)),
      extraInVisible: visible.filter((n) => !bullets.includes(n)),
    }
  })
  ok(pairA.filter((r) => r.bullets > 0 && r.missingInVisible.length === 0 && r.extraInVisible.length === 0).length === 3,
    '★★★ A: the BULLET LIST a seat reads EQUALS the set it can actually call (`declared − deny`) — both diffs empty; THIS is the pair a live session drifted on', pairA)
  // B) declaration ↔ bullet  (keeps the declaration and the prompt from drifting apart)
  const pairB = roleRows.map((r) => {
    const bullets = bulletNames(r.section)
    return { role: r.role, missingInBullets: allDeclared.filter((n) => !bullets.includes(n)).length, extra: bullets.filter((n) => !allDeclared.includes(n)) }
  })
  ok(pairB.filter((r) => r.extra.length === 0).length === 3,
    '★★★ B: every BULLET names a DECLARED tool (the prompt cannot promise a tool the pack does not declare)', pairB)
  // C) ANTI-DEGENERATION: prose mentions must also be in the bullet list, otherwise the prose promises what the list omits.
  const proseRows = roleRows.map((r) => {
    const prose = allNamesIn(r.section).filter((n) => !bulletNames(r.section).includes(n))
    return { role: r.role, proseOnly: prose }
  })
  ok(proseRows.filter((r) => r.proseOnly.length === 0).length === 3,
    '★★ C: every `vibe_v5_*` mentioned ANYWHERE in the section is in its bullet list — "prose says you may use X, the list omits X" would be the next drift', proseRows)
  // the deny boundary + sizes
  const denyAll = [...faces.chair.deny, ...faces.member.deny, ...faces.temp.deny]
  ok(denyAll.length > 0 && denyAll.filter((n) => !n.startsWith('vibe_v5_')).length === 0 && denyAll.filter((n) => /^vibe_vmu_/.test(n)).length === 0,
    '★★ the deny lists contain ONLY v5r tools (vibe_v5_*) — no framework face (vibe_vmu_*) is ever denied by this pack', { deny: denyAll.length })
  ok(faces.chair.deny.length === allDeclared.length - 40 && faces.member.deny.length === allDeclared.length - 23 && faces.temp.deny.length === allDeclared.length - 9,
    '★★ the deny sizes are the complement of the BULLET sets (chair 1 / member 18 / temp 32 of the 40 declared)', { chair: faces.chair.deny.length, member: faces.member.deny.length, temp: faces.temp.deny.length })
  // every DENIED name is a DECLARED tool (a prose mention cannot narrow a face)
  const declaredNameSet = new Set((PACK.tools || []).map((t) => t.name))
  ok(denyAll.filter((n) => declaredNameSet.has(n)).length === denyAll.length,
    '★ every name in a deny list is a tool this pack DECLARES (no prompt-only phantom can be denied)', { denied: denyAll.length })
  // ZERO MECHANISM: a kernel assembled WITHOUT the pack has no pack faces at all.
  ok(Array.isArray(bare.handle.kernel.packToolFaces()) && bare.handle.kernel.packToolFaces().length === 0,
    '★ 反（零机制）: with no pack applied there is NO declared tool face \u2014 nothing is narrowed by default', bare.handle.kernel.packToolFaces().length)
  // RETRACTION PATH: the declaration is retractable and re-declarable (pack unload calls this same retract).
  const declaredBefore = v5rBoot.handle.kernel.packToolFaces()
  const retracted = v5rBoot.handle.kernel.retractPackToolFaces({ by: 'v5r-core' })
  const afterRetract = v5rBoot.handle.kernel.packToolFaces()
  ok(declaredBefore.length === 1 && retracted && retracted.ok === true && afterRetract.length === 0,
    '★★ 卸载/撤销: retracting the pack removes its declared faces (zero residue) — and pack unload runs this same retract', { before: declaredBefore.length, after: afterRetract.length })
  v5rBoot.handle.kernel.declarePackToolFaces(faces, { by: 'v5r-core' })
  const reapplied = v5rBoot.handle.kernel.applyPackToolFaces({ by: 'v5r-core' })
  ok(Array.isArray(reapplied.applied) || Array.isArray(reapplied.failed),
    '★ re-declaring and re-applying the face is possible (the apply path is idempotent enough to re-run)', reapplied && { applied: (reapplied.applied || []).length, failed: (reapplied.failed || []).length })

  // ── ⑦e GOAL B-2 (PHASE 8): the pack IMPORTS the kit — one copy of the code, institution vocabulary stays in v5r ──
  console.log('=== 7e. B-2 WIRING: kit imports, zero local copies ===')
  ok(PACK.tools.length > 0 && EXPECTED.length > 0 && PACK.tools.length === EXPECTED.length,
    '★★ the declared tool COUNT is what the pack declares (institution vocabulary stays in the pack; 40 + inbox + wait) - and the equality is evidence only because BOTH sides are provably non-empty (RULE E shape B)', PACK.tools.length)
  const packSrcW = (await import('node:fs')).readFileSync(join(REPO, 'vibe-math-vmu', 'packs', 'v5r', 'tools.js'), 'utf8')
  const movedDecls = [
    'const str = (v)', 'const has = (v)', 'function refuse(', 'function settingsOf(', 'function declaredTracks(',
    'function recordsOf(', 'function membersOf(', 'function requireSpeaker(',
    'function cardBody(', 'function cardTool(', 'function toolSay(', 'function toolMessage(',
    'function toolReadLibrary(', 'function toolRecordProgress(',
  ]
  const leftovers = movedDecls.filter((p) => packSrcW.split(p).length - 1 > 0)
  ok(movedDecls.length === 14 && leftovers.length === 0,
    '★★★ ZERO local declarations left for the 8 helpers + 6 handlers moved into the kit (probe over the pack source)', { checked: movedDecls.length, leftovers })
  ok(packSrcW.includes("from '../../kit/handlers.js'") && packSrcW.includes("from '../../kit/tools.js'"),
    '★★ the pack IMPORTS the kit (handlers + the card factory) — "deleted" cannot quietly mean "forgot to import"', null)
  const kitModW = await import(pathToFileURL(join(REPO, 'vibe-math-vmu', 'kit', 'handlers.js')).href)
  const helperNames = Object.keys(kitModW.KIT_HELPERS || {})
  ok(helperNames.length === 8 && helperNames.filter((n) => typeof kitModW.KIT_HELPERS[n] === 'function').length === 8,
    '★★ the kit exports all 8 helpers it now owns (one copy in the tree, imported by the pack)', helperNames)
  const kitToolsModW = await import(pathToFileURL(join(REPO, 'vibe-math-vmu', 'kit', 'tools.js')).href)
  // B-2 moved 4 tools, B-3 moved the task board (4) + the Lean five (5) ⇒ 13 kit entries, five disableKey families.
  const kitNamed = kitToolsModW.KIT_TOOLS.map((t) => t.name)
  const kitFamilies = [...new Set(kitToolsModW.KIT_TOOLS.map((t) => t.disableKey))].sort()
  const expectedKit = ['vibe_v5_record_progress', 'vibe_v5_say', 'vibe_v5_message', 'vibe_v5_read_library',
    'vibe_v5_task_create', 'vibe_v5_task_list', 'vibe_v5_task_update', 'vibe_v5_task_get',
    'vibe_v5_lean_run', 'vibe_v5_lean_job', 'vibe_v5_lean_lib', 'vibe_v5_lean_read', 'vibe_v5_lean_archive']
  ok(kitNamed.length === 13 && expectedKit.every((n) => kitNamed.includes(n)) &&
    kitToolsModW.KIT_TOOLS.filter((t) => typeof t.run !== 'function' || typeof t.disableKey !== 'string' || t.disableKey === '').length === 0 &&
    kitFamilies.length === 5,
    '★★ the kit holds the four moved tools, each with a disableKey and a run', kitToolsModW.KIT_TOOLS.map((t) => t.name + ':' + t.disableKey))

  // ── ⑦g PHASE 8 round 32: tell the model PLAINLY that a no-tools turn really has no tools ─────────────────────
  // REAL-MACHINE DEFECT (run 19850): with `tools:'none'` the tool channel was gone, so the model wrote a DSML tool call
  // into the BODY ⇒ no JSON ⇒ VMU_TURN_NO_FENCE and the vote never landed. The prompt now states the fact.
  console.log('=== 7g. NO-TOOLS TURN: the fact is stated (and only there) ===')
  const noToolMarkers = ['没有任何工具可用', '不要写任何工具调用语法']
  const constraintSec = PACK.sections.filter((s) => s.name === 'v5r-fixture-constraint')[0]
  const toolsSec = PACK.sections.filter((s) => s.name === 'v5r-fixture-tools')[0]
  ok(constraintSec && noToolMarkers.filter((m) => String(constraintSec.text).includes(m)).length === noToolMarkers.length,
    '★★ 正: the NO-TOOLS turn section says there are no tools AND not to write tool-call syntax', noToolMarkers)
  ok(toolsSec && noToolMarkers.filter((m) => String(toolsSec.text).includes(m)).length === 0,
    '★★ 反: the TOOLS-ENABLED section does NOT carry those sentences (they would mislead a turn that does have tools)', 'v5r-fixture-tools')
  // the new text must not mention any tool name — otherwise it would perturb the bullet-derived role faces (assertion C)
  const addedLines = String(constraintSec.text).split('\n').filter((line) => noToolMarkers.some((m) => line.includes(m)))
  ok(addedLines.length === 2 && addedLines.filter((line) => /vibe_v5_[a-z0-9_]+/.test(line)).length === 0,
    '★★ the added sentences mention NO tool name (the bullet derivation and the prose⊆bullet assertion stay untouched)', addedLines.length)

  // ── ⑦h PHASE 8 / B-4 WIRING: packs/v5r/paper.js is a THIN SHELL over kit/paper.js ─────────────────────────────
  // The hard judges of this step: no local flow implementation left, the kit is imported, and the institution POLICY
  // (sections / round cap / engine order / repair set) is still declared in the pack — the kit must not own it.
  console.log('=== 7h. B-4 WIRING: paper.js is a policy shell ===')
  const paperSrcW = (await import('node:fs')).readFileSync(join(REPO, 'vibe-math-vmu', 'packs', 'v5r', 'paper.js'), 'utf8')
  ok(/from '\.\.\/\.\.\/kit\/paper\.js'/.test(paperSrcW) && /createPaperFlow\(/.test(paperSrcW),
    '★★ the pack IMPORTS the kit flow and calls its factory (deleted cannot mean forgot to import)', null)
  const paperImpls = ['function writeState(', 'function readState(', 'function requireState(', 'function readPartVerified(',
    'function advance(', 'function pass(', 'async function recordFinal(', 'function PaperMd(', 'function PaperTex(',
    'function PaperArtifacts(', 'function render(', 'async function compilePdf(', 'function recordPart(', 'function recordReview(']
  const paperLeftovers = paperImpls.filter((sig) => paperSrcW.split(sig).length - 1 > 0)
  ok(paperImpls.length === 14 && paperLeftovers.length === 0,
    '★★★ ZERO local state-machine / fingerprint / assembly implementations remain in the pack (source probe, 14 signatures)', { checked: paperImpls.length, leftovers: paperLeftovers })
  const policyDecls = ['export const PAPER_MAX_ROUNDS = 3', 'export const PAPER_SECTIONS', 'export const PAPER_ENGINE_ORDER', 'export const PAPER_REPAIR_CORE', 'export const PAPER_CONSULT_ROLES']
  ok(policyDecls.filter((p) => paperSrcW.includes(p)).length === policyDecls.length,
    '★★ the four POLICY constants are still declared in the PACK (the kit never owns institution semantics)', policyDecls)
  const paperModW = await import(pathToFileURL(join(REPO, 'vibe-math-vmu', 'packs', 'v5r', 'paper.js')).href)
  const paperKeys = Object.keys(paperModW).sort()
  ok(JSON.stringify(paperKeys) === JSON.stringify(['PAPER_ARTIFACTS', 'PAPER_CODES', 'PAPER_CONSULT_ROLES', 'PAPER_ENGINE_ORDER', 'PAPER_MAX_ROUNDS', 'PAPER_REPAIR_CORE', 'PAPER_SECTIONS', 'PAPER_STATES', 'PAPER_TRACK', 'createPaperSubsystem', 'default']) &&
    typeof paperModW.default === 'function', '★★ the module EXPORT SURFACE is unchanged (middleware/tests import these names)', paperKeys)
  const paperFlow = paperModW.createPaperSubsystem({ kernel: v5rBoot.handle.kernel })
  const flowMethods = ['start', 'recordPart', 'recordReview', 'advance', 'pass', 'recordFinal', 'PaperMd', 'PaperTex', 'PaperArtifacts', 'render', 'compilePdf', 'sections', 'state']
  ok(flowMethods.filter((m) => typeof paperFlow[m] === 'function').length === flowMethods.length,
    '★★ the subsystem still exposes all 13 methods (the shell forwards the kit flow)', flowMethods.length)

  // ── ⑦h-bis G7 ⑤: the paper PDF failure message renders engine RECORDS readably ─────────────────────────────
  console.log('=== 7h-bis. G7 ⑤: the paper PDF failure names engines readably ===')
  {
    const { createPaperFlow } = await import(pathToFileURL(join(REPO, 'vibe-math-vmu', 'kit', 'paper.js')).href)
    const { PAPER_CODES, PAPER_ENGINE_ORDER } = await import(pathToFileURL(join(REPO, 'vibe-math-vmu', 'packs', 'v5r', 'paper.js')).href)
    const rows = new Map()
    let seq = 0
    const recordsStub = {
      put(r) { const id = r.id || ('row-' + (++seq)); rows.set(id, Object.assign({ id }, r)); return { id, fingerprint: 'fp-' + id } },
      get({ id }) { return { record: rows.get(id) || null } },
      list() { return { items: [...rows.values()] } },
    }
    const failure = {
      ok: false, code: 'VMU_LATEX_NO_ENGINE',
      tried: [{ engine: 'xelatex', phase: 'probe', available: false }, { engine: 'latexmk', phase: 'probe', available: false, code: 'VMU_LATEX_NO_ENGINE' }],
      stderr: 'xelatex: not found',
    }
    const flow = createPaperFlow({
      kernel: { records: recordsStub, settingsSnapshot: () => ({ 'vmu.records.tracks': ['paper'] }), members: { roster: () => [{ id: 'acad', slot: 'chair' }] }, latex: { check: async () => failure } },
      codes: PAPER_CODES, sections: ['题与摘要'], maxRounds: 3, track: 'paper', engineOrder: PAPER_ENGINE_ORDER,
    })
    flow.start({ target: 'g7-paper', participants: ['r-1'] })
    let err = null
    try { await flow.compilePdf({ target: 'g7-paper' }) } catch (e) { err = e }
    ok(err && err.code === PAPER_CODES.PDF_FAILED && /xelatex/.test(String(err.message)) && /latexmk/.test(String(err.message)) &&
      !/\[object Object\]/.test(String(err.message)) && !/\[circular\]/.test(String(err.message)),
      '★ G7 ⑤ 正：PDF 失败回执把引擎【记录】渲染成可读名（xelatex/latexmk），不是 [object Object]',
      err && String(err.message).slice(0, 180))
    ok(err && Array.isArray(err.tried) && err.tried.length === 2 && typeof err.tried[0] === 'object',
      '★ G7 ⑤ 反：机器可读的 `tried` 数组仍保留（可读文案不替代数据）', err && err.tried && err.tried.length)
    ok(err && Array.isArray(err.triedEngines) && err.triedEngines.length === 2 &&
      err.triedEngines[0].engine === 'xelatex' && err.triedEngines[0].phase === 'probe' &&
      err.triedEngines[1].engine === 'latexmk' && err.triedEngines[1].code === 'VMU_LATEX_NO_ENGINE',
      '★ G7 ③ 正：失败错误上带结构化的 triedEngines:[{engine,phase,code}]（可程序化判断试过谁、哪个错）',
      err && err.triedEngines)
    // and the FINAL receipt's `pdf` carries it (the user-facing projection, not only the thrown error)
    const stateRow = [...rows.values()].find((r) => String(r.title || '').endsWith('|state'))
    if (stateRow) { const st = JSON.parse(stateRow.body); st.status = 'awaiting-editor'; st.stage = 'awaiting-editor'; stateRow.body = JSON.stringify(st) }
    const finalized = await flow.recordFinal({ target: 'g7-paper', member: 'acad', decision: 'deliverable' })
    ok(finalized && finalized.pdf && finalized.pdf.ok === false && Array.isArray(finalized.pdf.triedEngines) &&
      finalized.pdf.triedEngines.some((x) => x.engine === 'xelatex') && finalized.pdf.triedEngines.some((x) => x.engine === 'latexmk') &&
      finalized.pdf.code === PAPER_CODES.PDF_FAILED,
      '★ G7 ③ 反（最终回执）：final 回执的 pdf 同时含 code/message 与结构化 triedEngines（散文保留、数据可程序化）',
      finalized && finalized.pdf && { code: finalized.pdf.code, triedEngines: finalized.pdf.triedEngines })
  }

  // ── ⑦i PHASE 8 / goal 10 (round 38): the PACK declares its tool presentation; the HOST applies it ───────────────
  // ★ PHASE 9 / round 1 — THE FOUNDER'S RULING, AS ASSERTIONS: v5r DECLARES NOTHING.
  // ptc really did change the wire (a single `run_code`) while these prompts still teach tool-by-tool and never mention
  // ptc/run_code ⇒ wire and prompt disagreed, which is the one property this pack exists to keep. The CAPABILITY stays
  // (manifest field / validatePack / reader / host layer) for a pack willing to adapt its prompts; v5r stays native.
  console.log('=== 7i. TOOL PRESENTATION: v5r stays native (declares nothing) ===')
  ok(PACK.toolPresentation === undefined,
    '★★ v5r declares NO toolPresentation (zero mechanism: every tool stays native, prompt == wire)', PACK.toolPresentation)
  ok(v5rBoot.handle.kernel.packToolPresentation() === null,
    '★★★ packToolPresentation() returns null when the applied pack declares nothing (no fabricated native default)', v5rBoot.handle.kernel.packToolPresentation())
  ok(bare.handle.kernel.packToolPresentation() === null,
    '★ 反: an assembly without the pack is null too — nothing is declared anywhere', bare.handle.kernel.packToolPresentation())
  // WIRE == LOGICAL: with no declaration every registered v5r spec is one of the tools the kernel holds, and no spec
  // carries `deferLoading` (the disproved mode is gone too). This is exactly the property ptc breaks.
  const wireSpecs39 = v5rBoot.state.specs.map((s) => s.name).filter((n) => String(n).startsWith('vibe_v5_'))
  const kernelNames39 = v5rBoot.handle.kernel.packTools().map((t) => t.name)
  // (constant-anchored: the declared count is a contract asserted elsewhere, so "both sides empty" cannot pass here)
  const wireSorted39 = wireSpecs39.slice().sort()
  const kernelSorted39 = kernelNames39.slice().sort()
  // RULE E shape B: `both empty compare equal`, so the non-emptiness is ASSERTED (not only commented) before the
  // equality - the comment above used to be the whole argument, and a comment is not a mechanism.
  ok(wireSpecs39.length > 0 && kernelNames39.length > 0 && wireSpecs39.length === EXPECTED.length && kernelNames39.length === EXPECTED.length && JSON.stringify(wireSorted39) === JSON.stringify(kernelSorted39),
    '★★★ WIRE == LOGICAL: the registered v5r specs are exactly the tools the kernel holds (native; nothing replaced by run_code)', { wire: wireSpecs39.length, kernel: kernelNames39.length })
  ok(v5rBoot.state.specs.filter((s) => s.deferLoading !== undefined).length === 0,
    '★★ no spec carries deferLoading (the disproved defer mode is gone as well)', v5rBoot.state.specs.length)
  // HOST half: no declaration ⇒ the presentation hook exists but does NOTHING (no presentAs on any agent, no unapplied).
  const hm39 = await import(pathToFileURL(join(REPO, 'vibe-math-vmu', 'host.js')).href)
  const presentCalls39 = []
  const listeners39 = {}
  const ctx39 = { effect: (fn) => fn(), on: (event, fn) => { (listeners39[event] = listeners39[event] || []).push(fn) }, tools: { register: () => () => {} } }
  const receipt39 = await hm39.createHostAdapter({ ctx: ctx39, kernel: v5rBoot.handle.kernel, settings: {} }).install()
  const hook39 = (listeners39['system-prompt/assemble'] || [])[0]
  const agent39 = { id: 'child-native', ctx: { tools: { presentAs: (mode) => { presentCalls39.push(mode); return () => {} } } } }
  if (typeof hook39 === 'function') await hook39({ tools: [] }, { agent: agent39 }, () => Promise.resolve({ tools: [] }))
  ok(receipt39.presentation && receipt39.presentation.mode === null && presentCalls39.length === 0 &&
    (!receipt39.presentation.unapplied || receipt39.presentation.unapplied.length === 0),
    '★★★ 零机制（宿主侧）：不声明 ⇒ 回执 mode:null、presentAs 从未被调用、无 unapplied', { mode: receipt39.presentation && receipt39.presentation.mode, calls: presentCalls39 })

  // ── ⑦j PHASE 9 / round 3: INBOX (eight-field triage) + WAIT + message subject/urgent ──────────────────────────
  // The mailbox list/open/setState work is another lane's: the tool face is asserted BOTH ways — the stub proves the
  // projection (eight fields, no body on list, body on open), and the REAL kernel right now proves the named refusal
  // ("需内核能力：mailbox …") instead of a silent empty list.
  console.log('=== 7j. INBOX / WAIT / MESSAGE (subject+urgent) ===')
  const specs = (n) => PACK.tools.filter((t) => t.name === n)[0]
  const stubKernel = {
    members: { roster: () => [{ id: 'r-1', slot: 'member', state: 'live' }] },
    mailbox: {
      list: async (member, opts) => ([{ id: 'm1', from: 'r-2', at: 7, subject: 'hello', read: false, todo: false, kind: 'dm', bytes: 12, text: 'SECRET BODY' }]),
      open: async (member, id) => ({ entry: { id, from: 'r-2', at: 7, subject: 'hello', kind: 'dm', text: 'BODY TEXT', read: false, todo: false } }),
      setState: async (member, patch) => ({ id: patch && patch.id, read: patch && patch.read === true, todo: patch && patch.todo === true }),
      send: (from, payload) => { stubKernel._sent = { from, payload }; return { ok: true, ids: ['m9'] } },
    },
  }
  const inboxList = await specs('vibe_v5_inbox').handler({ action: 'list', member: 'r-1' }, { kernel: stubKernel })
  const rowKeys = inboxList.rows && inboxList.rows[0] ? Object.keys(inboxList.rows[0]).sort() : []
  ok(JSON.stringify(rowKeys) === JSON.stringify(['at', 'bytes', 'from', 'id', 'kind', 'read', 'subject', 'todo', 'urgent']) && inboxList.rows[0].text === undefined,
    '★★★ inbox list: every row carries EXACTLY the nine triage fields (the eight plus the sender urgent flag) and NO body (text is only via open)', rowKeys)
  const inboxOpen = await specs('vibe_v5_inbox').handler({ action: 'open', id: 'm1', member: 'r-1' }, { kernel: stubKernel })
  ok(inboxOpen.message && inboxOpen.message.text === 'BODY TEXT' && inboxOpen.message.read === true,
    '★★★ inbox open: the body comes back and the read flag is true', inboxOpen.message && { hasText: inboxOpen.message.text === 'BODY TEXT', read: inboxOpen.message.read })
  const inboxMark = await specs('vibe_v5_inbox').handler({ action: 'mark', id: 'm1', todo: true, member: 'r-1' }, { kernel: stubKernel })
  ok(inboxMark.state && inboxMark.state.todo === true,
    '★★ inbox mark: the todo flag is set', inboxMark.state)
  // The kernel's mailbox list/open/setState HAS landed (this round): assert the REAL cycle, and keep the
  // "capability missing" refusal on a stub whose mailbox has no list (a named refusal, never a silent empty table).
  const emptyInbox = await receipt(v5rBoot, 'vibe_v5_inbox', { action: 'list', member: 'r-chair', status: 'all' })
  ok(emptyInbox.parsed && emptyInbox.parsed.ok === true && Array.isArray(emptyInbox.parsed.rows),
    '★★ 正（真实内核）：inbox list 返回 rows 数组（此时可能为空，但不是失败）', emptyInbox.parsed && { count: emptyInbox.parsed.count })
  const sentProbe = await receipt(v5rBoot, 'vibe_v5_message', { to: 'r-chair', content: 'hello body line', subject: 'S1' })
  const inboxAfter = await receipt(v5rBoot, 'vibe_v5_inbox', { action: 'list', member: 'r-chair', status: 'all' })
  const rowAfter = inboxAfter.parsed && Array.isArray(inboxAfter.parsed.rows) ? inboxAfter.parsed.rows.filter((r) => r.subject === 'S1')[0] : null
  const rowKeysReal = rowAfter ? Object.keys(rowAfter).sort() : []
  ok(sentProbe.parsed && sentProbe.parsed.ok === true && sentProbe.parsed.urgent === false && rowAfter &&
    JSON.stringify(rowKeysReal) === JSON.stringify(['at', 'bytes', 'from', 'id', 'kind', 'read', 'subject', 'todo', 'urgent']) && rowAfter.text === undefined,
    '★★★ 真实 cycle：message 默认非紧急发出 ⇒ inbox list 里出现该行，且行【恰九个字段（八字段＋紧急标）、无正文】', { keys: rowKeysReal, urgent: sentProbe.parsed && sentProbe.parsed.urgent })
  const realId = rowAfter && rowAfter.id
  const openedReal = await receipt(v5rBoot, 'vibe_v5_inbox', { action: 'open', id: realId, member: 'r-chair' })
  const listAgainReal = await receipt(v5rBoot, 'vibe_v5_inbox', { action: 'list', member: 'r-chair', status: 'all' })
  const rowAgain = listAgainReal.parsed && Array.isArray(listAgainReal.parsed.rows) ? listAgainReal.parsed.rows.filter((r) => r.id === realId)[0] : null
  ok(openedReal.parsed && openedReal.parsed.ok === true && /hello body line/.test(String(openedReal.parsed.message && openedReal.parsed.message.text)) &&
    rowAgain && rowAgain.read === true,
    '★★★ 真实 open：正文回来，且再 list 时该行 read:true', openedReal.parsed && { hasBody: !!(openedReal.parsed.message && openedReal.parsed.message.text), read: rowAgain && rowAgain.read })
  const markedReal = await receipt(v5rBoot, 'vibe_v5_inbox', { action: 'mark', id: realId, todo: true, member: 'r-chair' })
  ok(markedReal.parsed && markedReal.parsed.ok === true && markedReal.parsed.state && markedReal.parsed.state.todo === true,
    '★★ 真实 mark：todo 置位（setState 的 (member, {id,…}) 形状）', markedReal.parsed && markedReal.parsed.state)
  const openMissing = await receipt(v5rBoot, 'vibe_v5_inbox', { action: 'open', id: 'ml-does-not-exist', member: 'r-chair' })
  ok(openMissing.parsed && openMissing.parsed.ok === false && typeof openMissing.parsed.code === 'string' && openMissing.parsed.code.startsWith('VMU_'),
    '★★ 反：open 未知 id ⇒ 具名拒（不静默返回空）', openMissing.parsed && openMissing.parsed.code)
  const noListStub = { members: { roster: () => [{ id: 'r-1', slot: 'member', state: 'live' }] }, mailbox: {} }
  const missingCap = await specs('vibe_v5_inbox').handler({ action: 'list', member: 'r-1' }, { kernel: noListStub }).catch((e) => ({ code: e && e.code, hint: e && e.hint }))
  ok(missingCap && missingCap.code === 'VMU_ENGINE_UNAVAILABLE' && /mailbox/.test(String(missingCap.hint)),
    '★★ 反（缺内核能力）：mailbox 无 list ⇒ 具名 VMU_ENGINE_UNAVAILABLE 且 hint 点名 mailbox（工具"等能力"，不是坏了）', missingCap)
  const waitStub = await specs('vibe_v5_wait').handler({ timeout_ms: 5 }, { kernel: { activity: { wait: async ({ timeoutMs }) => ({ timedOut: true, timeoutMs }), status: () => ({ waiters: 0 }) } } })
  ok(waitStub.ok === true && waitStub.action === 'wait' && waitStub.timedOut === true,
    '★★ wait: returns on timeout with timedOut:true (the seam; never a poll loop)', waitStub)
  const waitStatus = await receipt(v5rBoot, 'vibe_v5_wait', { action: 'status' })
  ok(waitStatus.parsed && waitStatus.parsed.ok === true && waitStatus.parsed.status !== null,
    '★ wait status: the real kernel activity face answers', waitStatus.parsed && typeof waitStatus.parsed.status)
  // ── ⑦k PHASE 9 / round 6: the two real-machine bugs (A: urgent missing from the PUBLISHED schema; B: kind decides
  // urgency). A fixes the parameter map the host publishes; B makes the DEFAULT non-urgent and keeps `urgent` the only
  // thing that decides urgency (kind 'note' vs 'notice' is a consequence, never the cause).
  console.log('=== 7k. MESSAGE: urgent in the DEPLOYED schema + default NON-urgent ===')
  const msgHostSpec = v5rBoot.specOf('vibe_v5_message')
  const msgProps = msgHostSpec && msgHostSpec.parameters && msgHostSpec.parameters.properties ? Object.keys(msgHostSpec.parameters.properties).sort() : []
  // ★★★ LIVE RUN 28 (the institute's own report, item 9): the face had NO sender parameter, so `from` was always
  // "office" and a member-to-member message could not be expressed at all. `member` is the sender now (omitted =
  // office) and the receipt names both sides (`from` vs `relayedBy`), so the deployed schema has FIVE keys.
  ok(msgProps.length === 5 && msgProps.filter((n) => n === 'urgent' || n === 'subject' || n === 'member').length === 3,
    '★★★ bug A 反/正 + run-28 item 9：宿主真正发布的 schema 里有 subject、urgent 与发送者 member', msgProps)
  const mkMsgStub = () => {
    const stub = { members: { roster: () => [{ id: 'r-1', slot: 'member', state: 'live' }] }, _sent: null }
    stub.mailbox = { send: (from, payload) => { stub._sent = { from, payload }; return { ok: true, ids: ['m1'] } } }
    return stub
  }
  const stubA = mkMsgStub()
  const msgDefault = await specs('vibe_v5_message').handler({ to: 'r-1', content: 'hi' }, { kernel: stubA })
  ok(msgDefault.urgent === false && msgDefault.kind === 'note' && stubA._sent.payload.urgent === false && stubA._sent.payload.kind === 'note',
    '★★★ bug B 反：不传 urgent ⇒ 回执 urgent===false，且以 kind=note（非紧急 kind）投递', { urgent: msgDefault.urgent, kind: stubA._sent.payload.kind })
  const stubB = mkMsgStub()
  const msgStringTrue = await specs('vibe_v5_message').handler({ to: 'r-1', content: 'hi', subject: 'S', urgent: 'true' }, { kernel: stubB })
  ok(msgStringTrue.urgent === true && msgStringTrue.kind === 'notice' && msgStringTrue.subject === 'S' &&
    stubB._sent.payload.urgent === true && stubB._sent.payload.kind === 'notice',
    '★★★ bug B 正：urgent 以 JSON 字符串 "true" 到达也归一化为真 ⇒ 用 kind=notice 投递（紧急只由 urgent 决定）', { urgent: msgStringTrue.urgent, kind: stubB._sent.payload.kind })
  const stubC = mkMsgStub()
  const msgExplicitFalse = await specs('vibe_v5_message').handler({ to: 'r-1', content: 'hi', urgent: false }, { kernel: stubC })
  ok(msgExplicitFalse.urgent === false && stubC._sent.payload.kind === 'note',
    '★ 显式 urgent:false ⇒ 仍是非紧急（kind=note），不会因为别的字段变紧急', stubC._sent.payload.kind)
  // ── ⑦k-bis PHASE 9 / round 7: THE THIRD FACE OF THE SAME ROOT CAUSE — a STALE EXPLICIT VALUE in the pack's VALUE
  // layer. Bug A was a parameter map that dropped a field; bug B was a handler default that decided the answer. This one
  // is the value layer: the pack still spelled out the OLD seven automatic-urgency kinds for the mailbox, and because a
  // pack default is folded UNDER the user's settings but OVER the schema default, it SHADOWED the schema's new default
  // (empty). So the kernel still treated a 'notice'-kind message as automatically urgent and the sender could not win.
  // ★ The rule this pins: an institution has no reason to restate a framework default, and a STALE explicit value is
  // WORSE than "not set" — it looks configured while its semantics are old. If this institution ever really wants
  // kind-driven urgency, it must declare the list explicitly AND say why, never copy an outdated default.
  // What is asserted: (反) the pack's value layer carries no such key while its neighbours are still there (so the
  // absence is not a broken/empty map); (正) the LIVE kernel built from the REAL entry now reports an empty automatic
  // list, a plain notice is NOT urgent, and the mechanism is not switched off — an explicit urgent:true is still true.
  console.log('=== 7k-bis. THE PACK VALUE LAYER MUST NOT RESTATE THE FRAMEWORK\'S URGENCY DEFAULT ===')
  const packDefaultsR7 = JSON.parse((await import('node:fs')).readFileSync(
    join(REPO, 'vibe-math-vmu', 'packs', 'v5r', 'settings', 'defaults.json'), 'utf8')).defaults || {}
  const packKeyCountR7 = Object.keys(packDefaultsR7).length
  const staleKeyR7 = 'vmu.mailbox.urgentKinds'
  const urgencyDefR7 = kernel.settingDef(staleKeyR7)
  ok(urgencyDefR7 && Array.isArray(urgencyDefR7.def) && urgencyDefR7.def.length === 0,
    '★ 正：该键的默认在 schema 里就是空表 ⇒ 值层"不声明"＝采用框架默认，不是"忘了配"',
    urgencyDefR7 && { type: urgencyDefR7.type, def: urgencyDefR7.def })
  ok(!Object.prototype.hasOwnProperty.call(packDefaultsR7, staleKeyR7),
    '★★★ 反：pack 值层不再显式声明信箱自动紧迫种类的键（schema 的默认是唯一所有者；旧显式值会把它盖住）',
    { keys: packKeyCountR7, present: Object.prototype.hasOwnProperty.call(packDefaultsR7, staleKeyR7) })
  ok(packKeyCountR7 >= 20 && packDefaultsR7['vmu.mailbox.wakeBudget'] === 1,
    '★ 非空洞对照：同一张表里邻居键仍在（wakeBudget=1，且键数 ≥20）⇒ 上面那条"不存在"不是"表读坏了"',
    { keys: packKeyCountR7, wakeBudget: packDefaultsR7['vmu.mailbox.wakeBudget'] })
  const policyKindsR7 = kernel.mailbox.status().policy.urgentKinds
  ok(Array.isArray(policyKindsR7) && policyKindsR7.length === 0,
    '★★★ 正：真入口折入后，活动内核的信箱策略里自动紧迫种类是空表（schema 默认真正生效，不再被值层的旧值覆盖）',
    policyKindsR7)
  await kernel.members.hire({ id: 'r7-a', slot: 'member' })
  await kernel.members.hire({ id: 'r7-b', slot: 'member' })
  const liveRosterR7 = kernel.members.roster().map((m) => m.id)
  ok(liveRosterR7.includes('r7-a') && liveRosterR7.includes('r7-b'),
    '★ 前置（RULE E）：两个真实成员在位，下面两条是真实投递而不是桩', liveRosterR7.filter((id) => /^r7-/.test(id)))
  const plainNoticeR7 = kernel.mailbox.send('r7-a', { to: 'r7-b', text: '普通通告', kind: 'notice' })
  ok(plainNoticeR7 && plainNoticeR7.ok === true && plainNoticeR7.urgent === false,
    '★★★ 正（真缺陷的反证）：非紧急的 notice 消息现在 urgent===false —— 上轮真机回执里正是这里回了 true',
    plainNoticeR7 && { ok: plainNoticeR7.ok, urgent: plainNoticeR7.urgent })
  const explicitUrgentR7 = kernel.mailbox.send('r7-a', { to: 'r7-b', text: '紧急通告', kind: 'note', urgent: true })
  ok(explicitUrgentR7 && explicitUrgentR7.urgent === true,
    '★★ 反（机制没被关死）：发送方显式 urgent:true 仍然为真 ⇒ 这是"默认假、显式真"，不是"紧迫永远为假"',
    explicitUrgentR7 && { ok: explicitUrgentR7.ok, urgent: explicitUrgentR7.urgent })
  // prompts: the four lines exist in EACH role section, item 3 carries the exact tightening, and nothing uses `{{ }}`.
  const roleSecs = ['v5r-tools-academician', 'v5r-tools-researcher', 'v5r-tools-temp'].map((n) => PACK.sections.filter((s) => s.name === n)[0])
  const promptHits = roleSecs.map((s) => {
    const t = String((s && s.text) || '')
    return {
      wait: t.includes('留言（信箱）不需要立即阅读'), order: t.includes('先看列表'), urgent: t.includes('【紧急】只表示'),
      noInterrupt: t.includes('不代表】内容更重要') && t.includes('也不代表】你必须立刻中断'), waitTool: t.includes('用 vibe_v5_wait'),
      noTemplate: !t.includes('{{'),
    }
  })
  ok(promptHits.filter((h) => h.wait && h.order && h.urgent && h.noInterrupt && h.waitTool && h.noTemplate).length === 3,
    '★★★ prompts: all four mailbox-semantics lines are in EVERY role section, item 3 keeps "不代表内容更重要 / 不必中断", and no `{{ }}`', promptHits)

  // ── ⑦l PHASE 9 / goal 3 (pack side): the ENVIRONMENT face must be PUBLISHED here, and the prompts must teach the
  // four-step protocol (probe first → do not force it → report a finding → the main agent asks the user for authorization).
  // ★ WHY THE PUBLICATION IS MEASURED, NOT ASSUMED: the host publishes this face from a FAMILY declaration (`vmu.env.*`
  // or ANY `vmu.math.*`), and v5r declares math keys in its value layer - so the face is expected. But "expected" is
  // exactly what this repository refuses to accept, so there are TWO arms: with the pack the name IS in the registered
  // specs; with NO pack it is ABSENT, which is what makes the pack's declaration the live cause (zero mechanism holds).
  console.log('=== 7l. ENV FACE PUBLISHED IN v5r + THE FOUR-STEP ENVIRONMENT PROTOCOL IN THE PROMPTS ===')
  const hostModL = await import(pathToFileURL(join(REPO, 'vibe-math-vmu', 'host.js')).href)
  ok(Object.keys(hostModL.TOOL_NAMES).length >= 54 && hostModL.TOOL_NAMES.env === 'vibe_vmu_env',
    '★ the framework declares the env face by name (TOOL_NAMES.env)', { count: Object.keys(hostModL.TOOL_NAMES).length, env: hostModL.TOOL_NAMES.env })
  ok(v5rBoot.names.includes('vibe_vmu_env'),
    '★★★ 正：v5r 的可见工具里有 vibe_vmu_env（宿主 register 捕获，不是读源码猜的）',
    { tools: v5rBoot.names.length, has: v5rBoot.names.includes('vibe_vmu_env') })
  ok(!bare.names.includes('vibe_vmu_env'),
    '★★ 反（零机制对照）：没有 pack 的那一次装配里没有它 ⇒ v5r 的声明才是这次发布的原因', { bareTools: bare.names.length })
  const envSpecL = v5rBoot.specOf('vibe_vmu_env')
  const envPropsL = envSpecL && envSpecL.parameters && envSpecL.parameters.properties ? envSpecL.parameters.properties : {}
  const envActionsL = envPropsL.action && Array.isArray(envPropsL.action.enum) ? envPropsL.action.enum.slice().sort() : []
  ok(envActionsL.length === 3 && envActionsL.join(',') === 'list,probe,report',
    '★★ the DEPLOYED schema offers exactly probe/list/report (so the prompt may name these actions)', { actions: envActionsL })
  // ★ The CAUSE is stated as data too, so "why is it published" is checkable after the fact: v5r's value layer declares
  // `vmu.math.*` keys, and the host's env family is ['vmu.env.', 'vmu.math.'] - so the math knobs an institution wants
  // anyway are what activate the environment face. (No `vmu.env.needs` declaration is added: restating a 22-row table
  // that the schema already owns is the stale-explicit-value defect pinned in §7k-bis.)
  const packDefaultsL = JSON.parse((await import('node:fs')).readFileSync(
    join(REPO, 'vibe-math-vmu', 'packs', 'v5r', 'settings', 'defaults.json'), 'utf8')).defaults || {}
  const envFamilyL = Object.keys(packDefaultsL).filter((k) => k.startsWith('vmu.env.') || k.startsWith('vmu.math.'))
  ok(envFamilyL.length >= 1 && envFamilyL.filter((k) => k.startsWith('vmu.math.')).length >= 1,
    '★★ 发布原因可复核：v5r 的值层里有 vmu.math.* 键（宿主 env 面的家族是 vmu.env. 或 vmu.math.）⇒ 不必再声明一张 env 需求表',
    envFamilyL)
  // ★★ LIVE RUN 20 (the institute's own report, ⑬.2): a member's fenced reply carrying an UNDECLARED field
  // (bogus_field) was silently ignored and the turn executed anyway, while the TOOL channel refuses the same unknown
  // name by VMU_TURN_UNKNOWN_FIELD. The framework's default is 'ignore-named', so leniency is the DEFAULT a deployment
  // inherits; this pack must therefore declare 'refuse' explicitly. Without this assertion the pack could lose the line
  // and only a live run would notice.
  ok(packDefaultsL['vmu.turn.unknownReplyFieldMode'] === 'refuse',
    '★★★ LIVE RUN 20 ⑬.2: the v5r value layer declares refuse for unknown reply fields — one rule over two channels (tool args and member replies) must not answer differently',
    packDefaultsL['vmu.turn.unknownReplyFieldMode'])
  // The four steps, as markers over the REAL section text (not over the source file).
  const stepRowsL = roleSecs.map((s) => {
    const t = String((s && s.text) || '')
    return {
      role: (s && s.scope && s.scope.role) || (s && s.name),
      probe: t.includes('动手前先探环境') && t.includes("action:'probe'"),
      noForce: t.includes('探不通不要硬试') && t.includes('框架不会替你安装') && t.includes('不会静默假装成功'),
      report: t.includes('探不通就上报') && t.includes("action:'report'") && t.includes('主代理会读到'),
      authorize: t.includes('未获授权前不要尝试安装') && t.includes('不要改用户的系统'),
      inBullet: /^[ \t]*·[ \t]*vibe_vmu_env\b/m.test(t),
    }
  })
  ok(stepRowsL.length === 3 && stepRowsL.filter((r) => r.probe && r.noForce && r.report && r.authorize && r.inBullet).length === 3,
    '★★★ 正：三段角色提示词都写了四步（先探 → 不硬试 → 上报 → 未授权前不装），且名字出现在该角色的 `·` bullet 里', stepRowsL)
  const chairTextL = String((roleSecs.find((s) => s && s.scope && s.scope.role === 'chair') || {}).text || '')
  ok(chairTextL.includes('你是主代理') && chairTextL.includes('installCommand') && chairTextL.includes('请求授权') &&
    chairTextL.includes('未获授权前不要尝试安装'),
    '★★★★ 正（主代理那一步）：chair 段写着"读到 environment-missing 的 finding → 报告缺什么 ＋ 给 installCommand ＋ 请求授权"，并逐字含着"未获授权前不要尝试安装"',
    { mainAgent: chairTextL.includes('你是主代理'), install: chairTextL.includes('installCommand'), verbatim: chairTextL.includes('未获授权前不要尝试安装') })
  // ★ 反：NO hard-coded absolute path may reach the model from these sections ("no hard-coded paths" must be checkable
  // at the PROMPT layer, not only in code). The detector is proved NON-BLIND on a planted control before the zero counts.
  const absReL = /[A-Za-z]:[\\/]|\/usr\/bin\/|\/usr\/local\/bin\/|\\Users\\|\\\\[A-Za-z0-9_.-]+\\/
  const absReLg = new RegExp(absReL.source, 'g')
  const plantedL = 'D:\\tools\\lean.exe and /usr/bin/python3 and C:/Users/x'
  ok((plantedL.match(absReLg) || []).length === 3,
    '★ 反断言的自证：同一个检测器在种下的三处绝对路径上真的命中（否则下面的 0 命中也说明不了什么）',
    (plantedL.match(absReLg) || []).length)
  const absHitsL = roleSecs.map((s) => (String((s && s.text) || '').match(absReL) || []).slice(0, 3))
  ok(absHitsL.length === 3 && absHitsL.filter((h) => h.length === 0).length === 3,
    '★★★ 反：三段角色提示词里没有任何写死的绝对路径（盘符／/usr/bin／用户目录／UNC 一律 0 命中）', absHitsL)

  // ── ⑦m PHASE 9 / round 5: THE EFFECTIVE-TOOLS PLACEHOLDER + THE "以本段为准" SENTENCE ─────────────────────────────
  // The host now computes the effective member tool set ONCE and uses it for BOTH the wire and a prompt block titled
  // 【本轮你实际能调用的工具｜…】. Without a declared placeholder the host APPENDS that block wherever the section list
  // ends, which can be far from the static role list it corrects ⇒ a member could read two contradictory tables. What is
  // pinned: (正) one declared placeholder per role, positioned after its static list, carrying the title the host looks
  // for; and the sentence that sends the reader to the block is present in EVERY section that carries a static list;
  // (反) neither the sentence nor the placeholder text introduces a tool NAME (that would silently change the derived
  // role bullet face — the very drift pair A/B/C measures), and the detector for that is proved non-blind on a control.
  console.log('=== 7m. EFFECTIVE-TOOLS PLACEHOLDER + "以本段为准" (pack side) ===')
  const hostSrcM = (await import('node:fs')).readFileSync(join(REPO, 'vibe-math-vmu', 'host.js'), 'utf8')
  ok(hostSrcM.includes("sec.name === 'v5r-effective-tools'") && hostSrcM.includes("sec.text.includes('【本轮你实际能调用的工具"),
    '★ the host really looks for EITHER that name OR that title in the text (the predicate our placeholders must satisfy)',
    { byName: hostSrcM.includes("sec.name === 'v5r-effective-tools'"), byText: hostSrcM.includes("sec.text.includes('【本轮你实际能调用的工具") })
  const phs = PACK.sections.filter((s) => /^v5r-effective-tools-/.test(String(s.name)))
  const phNames = phs.map((s) => s.name)
  ok(phs.length === 3 && new Set(phNames).size === 3,
    '★★★ 正：三个角色各有一个占位段，且段名互不相同（★ 同名段是具名 pack 冲突，会拒绝整包装载）', phNames)
  ok(phs.filter((s) => ['chair', 'member', 'temp'].includes(s.scope && s.scope.role)).length === 3,
    '★★ 占位段的 scope.role 就是内核的角色词汇（chair／member／temp，不是显示名）', phs.map((s) => s.scope && s.scope.role))
  const secOfM = (n) => PACK.sections.filter((s) => s.name === n)[0]
  const corner = { chair: secOfM('v5r-tools-academician'), member: secOfM('v5r-tools-researcher'), temp: secOfM('v5r-tools-temp') }
  const phByRole = { chair: phs.find((s) => s.scope.role === 'chair'), member: phs.find((s) => s.scope.role === 'member'), temp: phs.find((s) => s.scope.role === 'temp') }
  ok(['chair', 'member', 'temp'].every((r) => corner[r] && phByRole[r] && Number.isInteger(phByRole[r].order) && phByRole[r].order > corner[r].order &&
    String(phByRole[r].text).includes('【本轮你实际能调用的工具')),
    '★★★ 正：每个占位段的 order 都晚于该角色的静态清单（★ 否则"替换块"会跑到清单前面），且文本带宿主要找的标题标记',
    ['chair', 'member', 'temp'].map((r) => ({ role: r, listOrder: corner[r] && corner[r].order, phOrder: phByRole[r] && phByRole[r].order })))
  const sentinel = '★ 上表是职责说明；**本回合你实际能调用哪些，以【本轮你实际能调用的工具】为准**。'
  const listSections = [...roleSecs, PACK.sections.filter((s) => s.name === 'v5r-fixture-tools')[0]]
  const sentenceHits = listSections.map((s) => ({ name: s && s.name, has: String((s && s.text) || '').includes(sentinel) }))
  ok(sentenceHits.length === 4 && sentenceHits.filter((h) => h.has).length === 4,
    '★★★ 正：三段角色清单 ＋ 研究回合清单（v5r-fixture-tools）都写了"以【本轮你实际能调用的工具】为准"那句', sentenceHits)
  // ★ 反：no tool NAME may enter through the new text (a name here would silently widen/narrow the derived bullet face).
  const newTexts = [...phs.map((s) => String(s.text)), sentinel]
  const nameReM = /vibe_v5_[a-z0-9_]+/g
  const plantedM = '· vibe_v5_say —— 控制组，应当被检测到'
  ok((plantedM.match(nameReM) || []).length === 1,
    '★ 反断言的自证：同一个检测器在种下的工具名上真的命中（否则下面的 0 命中说明不了什么）',
    (plantedM.match(nameReM) || []).length)
  const leakedNamesM = newTexts.map((t) => (t.match(nameReM) || []).slice(0, 3))
  ok(leakedNamesM.length === 4 && leakedNamesM.filter((h) => h.length === 0).length === 4,
    '★★★ 反：新文字（三份占位段 ＋ 那句话）里没有任何工具名 ⇒ 不扰动 bullet 派生／角色面', leakedNamesM)
  // ★ The placement must be true in the REAL assembly (not only in the declaration list): one placeholder per role, after
  // that role's static list. That is what makes the host's in-place replacement land next to the table it corrects.
  const promptModM = await import(pathToFileURL(join(REPO, 'vibe-math-vmu', 'kernel', 'prompt', 'index.js')).href)
  const pipeM = promptModM.createPromptPipeline({ sections: PACK.sections, bindings: PACK.bindings || [], settings: {}, counts: {} })
  const roleMarksM = { chair: '【本角色可用的工具｜院士】', member: '【本角色可用的工具｜研究员】', temp: '【本角色可用的工具｜临时成员】' }
  const placementM = {}
  for (const role of ['chair', 'member', 'temp']) {
    const t = (await pipeM.assemble({ member: 'r-1', role, roleLabel: role, phase: 'normal' })).text
    placementM[role] = { placeholder: (t.match(/｜占位段】/g) || []).length,
      blockAt: t.indexOf('【本轮你实际能调用的工具｜占位段】'), listAt: t.indexOf(roleMarksM[role]) }
  }
  ok(['chair', 'member', 'temp'].filter((r) => placementM[r].placeholder === 1 && placementM[r].listAt >= 0 && placementM[r].blockAt > placementM[r].listAt).length === 3,
    '★★★ 正（真装配）：每个角色的提示词里【恰好一个】占位段，且位置在该角色静态清单【之后】—— 内核的原地替换才会落在"该在的位置"', placementM)

} finally {
  // The store writes atomically through temp+rename, so a removal can race one in-flight file: retry, and never let
  // a cleanup failure turn a green run red (the assertions above already reported the truth).
  await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 }).catch(() => {})
}

// ★ GOAL ROUND 3: paper.start must have a PRODUCTION read point. Before `vibe_v5_paper`, `paper.start` appeared only
// in unit tests — the mechanism was complete but unreachable. This is the same read-point probe as the reportfeedback
// guards: read the production pack source, not a mention in a comment.
{
  const toolsSrcPaper = (await import('node:fs')).readFileSync(join(REPO, 'vibe-math-vmu', 'packs', 'v5r', 'tools.js'), 'utf8')
  ok(/import\s*\{[^}]*createPaperSubsystem[^}]*\}\s*from\s*'\.\/paper\.js'/.test(toolsSrcPaper) &&
    /paper\.start\s*\(/.test(toolsSrcPaper) && /function\s+toolPaper\s*\(/.test(toolsSrcPaper),
    '★★ 正：`paper.start` 有生产读点（tools.js 引入 createPaperSubsystem 且 toolPaper 调 paper.start）', {
      imported: /createPaperSubsystem/.test(toolsSrcPaper), called: /paper\.start\s*\(/.test(toolsSrcPaper),
    })
}

console.log('\n=== VMU V5R TOOLS: ' + passed + ' passed, ' + failed + ' failed ===')
if (failed > 0) { console.error('FAILURES:'); for (const f of failures) console.error('  - ' + f) }
process.exit(failed > 0 ? 1 : 0)

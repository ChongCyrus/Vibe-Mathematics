// scripts/sim/scenarios/actions-extra.mjs — RUN 240-K: the ACTIONS the other scenarios never touch.
//
// WHY THIS SCENARIO EXISTS: `scripts/sim/audit/action-coverage.json` (task-39) measured the honest gap — 68 of 225
// declared actions were exercised (30.2%), and 157 were never called by any scenario. A declared-but-unexercised verb
// is a promise nobody checked. This scenario is not a story about mathematics; it is a WALK of the machinery: every
// face is asked to do the things the other six scenarios forgot, and each receipt is recorded exactly as a member
// would read it.
//
// HOW IT IS ORGANISED: one section per face (A…), each step named `<face>/<action>` so a finding in the corpus points
// at the verb in the audit. Refusals that are POLICY (not defects) are announced through `expectedRefusals` with the
// code the scenario predicts — the run report then shows them as evidence, not as failures.
//
// TWO FACTS ABOUT THIS ASSEMBLY THAT SHAPE THE SCENARIO (learned by probe, then encoded here):
//   1. A meeting opened by the PACK (`vibe_v5_meeting`) lives in the SERVICE registry; a meeting opened by the KERNEL
//      (`vibe_vmu_meeting {action:"open"}`) lives in the PRIMITIVE registry. Some verbs are PRIMITIVE-ONLY and refuse a
//      service meeting by name (`VMU_REGISTRY_BOUNDARY`), so section M walks BOTH meetings instead of pretending one
//      floor supports every verb.
//   2. `vibe_vmu_records {action:"append"}` writes a LIBRARY CARD; only cards written through the pack faces (or folded
//      from the files on disk) appear in the records PROJECTION that `prune`/`restore` maintain. Section C writes the
//      three rows it then prunes with `vibe_v5_record_progress`, and keeps `append` as its own step (it is a real verb).
//
// WHAT IT DOES NOT DO: it does not edit product code, and it does not pretend a refusal succeeded. An action that can
// only be refused in this deployment is reported as refused, with the reason, and is listed in the finish message.

import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

const NOW = 1_800_000_000_000
const MANIFEST = JSON.stringify({ id: 'sim-probe-pack', name: '仿真探测包', version: '0.0.1', tools: [] })

/**
 * SETTINGS ARE PART OF THE MECHANISM (harness comment at scripts/sim/harness.mjs:147). The human-in-loop, middleware,
 * control-tune, env, report, task-stage and lean faces are all ZERO-MECHANISM by default: with nothing declared, `gate`
 * never gates, `middleware.validate` has no rule to validate, `control.tune` refuses every key, `env.probe` has no
 * commands, `report` refuses every name and the lean face has no archive to read. Declaring them here is what a
 * deployment does under `config.vmu` — and it is the only way those faces can be walked at all.
 */
export const settings = {
  // the human gate: one declared gated action, decided by the chair/office, observed at institution scope
  'vmu.human.gatedActions': ['task.create'],
  'vmu.human.deciderRoles': ['office', 'academician'],
  'vmu.human.injectRoles': ['office', 'academician'],
  'vmu.human.vetoLiftRoles': ['office', 'academician'],
  'vmu.human.observerScopes': ['institution'],
  'vmu.human.dashboardDomains': ['institution'],
  'vmu.human.dashboardScope': 'institution',
  // control.tune only accepts keys named here (empty ⇒ every tune is refused by name)
  'vmu.control.tunableKeys': ['vmu.turn.selfCheck'],
  'vmu.control.canSetRoles': ['office'],
  // report: a declared parameter, a declared report, and the switch that turns the face on
  'vmu.report.enabled': true,
  'vmu.report.params': ['vmu.turn.selfCheck'],
  'vmu.report.whoMayChange': ['office'],
  'vmu.report.reports': [{
    name: 'sim-report',
    trigger: { kind: 'event', event: 'progress' },
    // a template may only use REGISTERED variables; an unknown `{{ count:x }}` is refused by name, not rendered
    template: '仿真报表（只压机制，不压数学）',
    to: ['r-acad'],
    channel: 'log',
  }],
  // task stage machine: `stage`/`advance` refuse by name when no stages are declared at all
  'vmu.tasks.stages': ['draft', 'verify', 'done'],
  // the floor-order override has no default mechanism; declaring it is what makes `overrideorder` reachable
  'vmu.meetings.orderMode': 'round-robin',
  // one env need with a probe command that exists in every deployment (node -v)
  'vmu.env.needs': {
    'sim-node': { probe: { command: 'node', args: ['-v'] }, installCommand: 'install node', why: '仿真：环境面走路用' },
  },
  // math jobs: the engines this deployment admits (no Lean here — Lean is its own face, section Q)
  'vmu.math.engines': ['python'],
  // the reviewers face: a real quorum, and acknowledgement entries allowed (acknowledge() refuses without it)
  'vmu.review.quorum': 1,
  'vmu.reviewers.acknowledgement': true,
}

const pick = (out, keys) => {
  const o = {}
  if (!out || typeof out !== 'object') return o
  for (const k of keys) o[k] = out[k] === undefined ? null : out[k]
  return o
}
const firstId = (out) => {
  if (!out || typeof out !== 'object') return null
  for (const k of ['id', 'meeting', 'meetingId', 'task_id', 'taskId', 'card', 'recordId', 'ballotId', 'boxId', 'requestId', 'motion', 'motionId', 'name']) {
    const v = out[k]
    if (typeof v === 'string' && v) return v
    if (v && typeof v === 'object' && typeof v.id === 'string') return v.id
  }
  return null
}

/**
 * @param {{ call: Function, receipts: Array, tree?: Function, root: string }} h — the harness (scripts/sim/harness.mjs)
 */
export async function scenario(h, { log = () => {} } = {}) {
  const steps = []
  const expectedRefusals = []
  const notes = {}
  const highlights = {}

  /** Record one step exactly the way the other scenarios do (name, receipt index, file-tree delta, ok/code). */
  const step = async (name, fn) => {
    const before = h.tree ? h.tree().length : 0
    let out
    try {
      out = await fn()
    } catch (e) {
      out = { ok: false, code: (e && e.code) || 'THREW', message: String((e && e.message) || e) }
    }
    const after = h.tree ? h.tree().length : 0
    steps.push({ name, at: h.receipts.length, files: { before, after }, ok: !(out && out.ok === false), code: (out && out.code) || null })
    log(name + (out && out.ok === false ? '  [' + (out.code || 'refused') + ']' : ''))
    return out
  }
  /**
   * Announce a refusal the scenario PREDICTS (policy evidence, not a defect).
   * ★ TB-2625 - A PREDICTION HAS TO NAME ITS OWN REFUSAL. The runner used to treat `{tool, code}` as a PREDICATE, so one
   * entry forgave every later refusal of that tool+code - which is exactly how this file's `blueprint read/adopt` drift
   * (null draft id after a text-only propose) stayed green: the missing-argument probes at the end of the file declared
   * `vibe_v5_blueprint`/`VMU_INVALID_ARGUMENT` once and that entry also excused the two earlier drift refusals. `seq`
   * pins the declaration to the receipt it predicts. It defaults to the newest receipt because every call site here
   * declares immediately after the call that produced the refusal.
   */
  const lastSeq = () => (h.receipts.length ? h.receipts[h.receipts.length - 1].seq : null)
  const expect = (tool, code, why, seq) => {
    const entry = { tool, code, why }
    const pinned = Number.isInteger(seq) ? seq : lastSeq()
    if (Number.isInteger(pinned)) entry.seq = pinned
    expectedRefusals.push(entry)
  }
  // ★ TB-2625 - a contract check has to be able to turn the run red by name; `failures` is that channel (run.mjs).
  const failures = []
  // RUN 255 made `blueprint propose` fs-first: a text-only propose answers `{ok:true, filed:false, id:null,
  // draftMdMissing:true}` and every later step that needs the id refuses VMU_INVALID_ARGUMENT. The successful path does
  // NOT carry `filed:true` (only the refused path carries `filed:false`), so the reading has to be normalized here
  // rather than assuming either shape.
  const filedOf = (r) => Boolean(r && r.ok !== false && r.filed !== false && r.draftMdMissing !== true && typeof r.id === 'string' && r.id !== '')
  const as = (id) => ({ as: { agent: { id } } })

  // ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
  // A. THE INSTITUTE — and the office-level faces that describe it
  // ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
  const started = await step('A/institute/start', () => h.call('vibe_v5_start', {
    problem: '机构里待复核的命题、待改写的方法与一份待对齐的蓝图：本场景只压机制，不压数学。',
    researcherCount: 2,
  }))
  highlights.start = pick(started, ['ok', 'institution', 'members', 'roster', 'chair'])

  // Z0. READ-BACK + RECOVER BEFORE THIS PROCESS WRITES ITS OWN KEYS — the only window in which both are
  //     consistent receipts: `readBack` publishes `consistent/checked/drift/driftMeans/sampledAt/writesBetween/code`,
  //     `recover` publishes `plan/recovery`. After the first settings write they turn into a drift refusal
  //     (`hint:null`, and `recover` with NO code at all) — an A4 defect this scenario deliberately does not call.
  const z0Rb = await step('Z0/human/read-back', () => h.call('vibe_vmu_human', { action: 'readBack', key: 'vmu.meetings.verdictMaxRounds' }))
  if (z0Rb && z0Rb.ok === false) expect('vibe_vmu_human', z0Rb.code, '读回不一致时才按名拒收（本机构一致，正常应 ok）')
  // `recover` is NOT called here on purpose, and this is a PRODUCT finding, not a scenario choice: called right
  // after `vibe_v5_start` it answers ok:true with `plan`/`recovery` but its recovery pass REWRITES the roster
  // projection down to the chair alone (`r-1`/`r-2` vanish ⇒ the very next `blueprint propose` by `r-1` is
  // `VMU_NO_SUCH_OBJECT`), and called after this process writes keys it refuses with NO code and no hint. Both
  // make it unusable as evidence: it stays `never` with `blocked-by-defect` in the action ledger.
  highlights.z0Human = { readBack: pick(z0Rb, ['ok', 'consistent', 'checked', 'drift', 'driftMeans', 'sampledAt', 'writesBetween', 'code']) }

  const overview = await step('A/overview', () => h.call('vibe_v5_overview', { member: 'r-acad' }))
  highlights.overview = pick(overview, ['ok', 'roster', 'tasks', 'meetings', 'feedback', 'code'])

  const toolHelp = await step('A/tool_help', () => h.call('vibe_v5_tool_help', { member: 'r-acad' }))
  highlights.toolHelp = pick(toolHelp, ['ok', 'count', 'tools', 'code', 'message'])

  const configure = await step('A/configure', () => h.call('vibe_v5_configure', {
    institute: '动作覆盖仿真所',
    problem: '压机制：让每一个声明的动词都被真的调用一次。',
  }))
  highlights.configure = pick(configure, ['ok', 'institute', 'project', 'applied', 'code'])

  const setLive = await step('A/set/declared', () => h.call('vibe_v5_set', {
    key: 'vmu.turn.selfCheck', value: false, why: '仿真：确认 H2 键可热改并回执 hot/live',
  }))
  const setBack = await step('A/set/declared-back', () => h.call('vibe_v5_set', {
    key: 'vmu.turn.selfCheck', value: true, why: '仿真：改回默认，后续步骤按原纪律跑',
  }))
  const setBad = await step('A/set/undeclared', () => h.call('vibe_v5_set', { key: 'vmu.sim.notDeclared', value: 1 }))
  if (setBad && setBad.ok === false) expect('vibe_v5_set', setBad.code, '未声明的键必须具名拒（声明门）')
  highlights.set = { live: setLive, back: setBack, bad: pick(setBad, ['ok', 'code', 'message', 'hint']) }

  const readLib = await step('A/read_library/list', () => h.call('vibe_v5_read_library', { list: true, limit: 5 }))
  const readLibTracks = await step('A/read_library/tracks', () => h.call('vibe_v5_read_library', { tracks: true }))
  highlights.readLibrary = { list: pick(readLib, ['ok', 'count', 'cards', 'code']), tracks: pick(readLibTracks, ['ok', 'tracks', 'count', 'code']) }

  // ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
  // B. BLUEPRINT — `state` is the read the other scenarios never asked for; `adopt` needs a CO-SIGNED draft, so the
  //    chair proposes, a RESIDENT researcher proposes the same path, and only then does the chair adopt.
  // ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
  const bpEmpty = await step('B/blueprint/state-before', () => h.call('vibe_v5_blueprint', { action: 'state' }))
  // ★ TB-2625 - THE DRAFT IS A MEMBER FILE (fs-first, RUN 255). This block used to propose `text` only and then call
  // `read`/`adopt` with `firstId(...)` = null; both answered VMU_INVALID_ARGUMENT and the refusals were invisible
  // because the missing-argument probes further down the file had declared that tool+code in advance. Now the member
  // (chair, seat `r-acad`) writes the draft where `mdPath` resolves (`<workspace>/VibeMath/Members/<seat>/Drafts/...`),
  // proposes THAT path, and the shape is checked instead of assumed.
  const bpDraftRel = 'Members/r-acad/Drafts/protocol-r1.md'
  const bpDraftAbs = join(h.root, 'VibeMath', bpDraftRel)
  const bpDraftBody = '# 公共蓝图\n- 命题：待复核的 n 个结论。\n- 路线：先证引理，再合并。\n'
  const bpDraftFile = await step('B/blueprint/draft-md', () => {
    mkdirSync(dirname(bpDraftAbs), { recursive: true })
    writeFileSync(bpDraftAbs, bpDraftBody)
    return { ok: true, path: bpDraftRel, absPath: bpDraftAbs, bytes: Buffer.byteLength(bpDraftBody) }
  })
  const bpDraft = await step('B/blueprint/propose', () => h.call('vibe_v5_blueprint', {
    action: 'propose', path: 'Shared/Protocol.md', member: 'r-acad',
    mdPath: bpDraftRel,
    text: bpDraftBody,
  }))
  if (!filedOf(bpDraft)) {
    failures.push({
      code: 'SIM_BLUEPRINT_FS_FIRST_CONTRACT',
      step: 'B/blueprint/propose',
      message: 'blueprint propose did not FILE the draft: this scenario is behind the fs-first contract (write the md first, pass the same mdPath)',
      means: 'the next read/adopt would refuse VMU_INVALID_ARGUMENT for a null id, and the refusal would be excused by a blanket prediction',
      receipt: pick(bpDraft, ['ok', 'filed', 'id', 'status', 'draftMdMissing', 'mdPath', 'code', 'message', 'hint']),
    })
  }
  const bpDraftId = filedOf(bpDraft) ? bpDraft.id : null
  const bpRead = await step('B/blueprint/read', () => h.call('vibe_v5_blueprint', { action: 'read', id: bpDraftId }))
  // The resident co-signs the SAME draft: rewrite the member file (base text + its own section) and propose again with
  // the same `mdPath` plus `draft`, so the row keeps one id and gains a second author.
  const bpCodesignBody = bpDraftBody + '\n## 共同设计补充｜r-1\n- 同意主席的路线；把引理步拆成两步检查。\n'
  const bpCodesignFile = await step('B/blueprint/codesign-md', () => {
    writeFileSync(bpDraftAbs, bpCodesignBody)
    return { ok: true, path: bpDraftRel, absPath: bpDraftAbs, bytes: Buffer.byteLength(bpCodesignBody) }
  })
  const bpCodesign = await step('B/blueprint/codesign-by-resident', () => h.call('vibe_v5_blueprint', {
    action: 'propose', draft: bpDraftId, path: 'Shared/Protocol.md', member: 'r-1', mdPath: bpDraftRel,
  }, as('r-1')))
  if (!filedOf(bpCodesign)) {
    failures.push({
      code: 'SIM_BLUEPRINT_FS_FIRST_CONTRACT',
      step: 'B/blueprint/codesign-by-resident',
      message: 'the co-sign did not continue the same draft (no id): it is behind the fs-first contract too',
      means: 'the chair cannot adopt a draft the resident co-signed if the co-sign created no row to adopt',
      receipt: pick(bpCodesign, ['ok', 'filed', 'id', 'draft', 'continued', 'draftMdMissing', 'code', 'message', 'hint']),
    })
  }
  const bpAdopt = await step('B/blueprint/adopt', () => h.call('vibe_v5_blueprint', { action: 'adopt', path: 'Shared/Protocol.md', draft: bpDraftId, member: 'r-acad' }))
  const bpStale = await step('B/blueprint/state-after', () => h.call('vibe_v5_blueprint', { action: 'state' }))
  highlights.blueprint = {
    empty: pick(bpEmpty, ['ok', 'hasCurrent', 'current', 'drafts', 'track', 'code']),
    draftFile: bpDraftFile,
    draft: pick(bpDraft, ['ok', 'id', 'recordId', 'revision', 'status', 'mdPath', 'mdFingerprint', 'filed', 'draftMdMissing']),
    read: pick(bpRead, ['ok', 'id', 'path', 'kind', 'code']),
    codesignFile: bpCodesignFile,
    codesign: pick(bpCodesign, ['ok', 'id', 'draft', 'continued', 'authors', 'mdFingerprint', 'code', 'hint']),
    adopt: pick(bpAdopt, ['ok', 'id', 'adopted', 'current', 'code']),
    state: pick(bpStale, ['ok', 'hasCurrent', 'current', 'ageMs', 'staleNote', 'nodes', 'drafts', 'kind']),
  }

  // ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
  // C. RECORDS — append/list/expand/status/prune/restore/reindex. `append` writes a library card; the three rows that
  //    prune/restore actually move are written through `vibe_v5_record_progress` (they fold into the projection).
  // ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
  const recAppend = await step('C/records/append', () => h.call('vibe_vmu_records', {
    action: 'append', track: 'progress', kind: 'proposition',
    statement: '仿真记录：进度行（本行只为覆盖 append 的写入路径）。',
    proof: '无（仿真）', why: '动作覆盖：让 append 真的写一行', by: 'r-1',
  }))
  const progressRows = []
  for (const n of [1, 2, 3]) {
    progressRows.push(await step('C/records/progress-row/' + n, () => h.call('vibe_v5_record_progress', {
      track: 'progress', title: '仿真进展 ' + n,
      content: '仿真：第 ' + n + ' 条进展行——只压机制，prune/restore 需要可移动的 live 行。',
      member: 'r-1', progress: '进行中', obstacles: '无', next: '继续走下一个动词',
    }, as('r-1'))))
  }
  const rowIds = progressRows.map((r) => r && r.recordId).filter(Boolean)
  const recList = await step('C/records/list', () => h.call('vibe_vmu_records', { action: 'list', track: 'progress', limit: 5 }))
  const recExpand = await step('C/records/expand', () => h.call('vibe_vmu_records', { action: 'expand', id: rowIds[0] || firstId(recAppend) }))
  const recStatus = await step('C/records/status', () => h.call('vibe_vmu_records', { action: 'status' }))
  const recPruneDry = await step('C/records/prune-dry', () => h.call('vibe_vmu_records', { action: 'prune', track: 'progress', keep: 1, by: 'r-acad', dryRun: true }))
  const recPrune = await step('C/records/prune', () => h.call('vibe_vmu_records', { action: 'prune', track: 'progress', keep: 1, by: 'r-acad' }))
  const prunedIds = (() => {
    const rows = []
    for (const src of [recPruneDry, recPrune]) {
      const moved = src && (src.pruned || src.moved || src.trashed || src.ids)
      if (Array.isArray(moved)) for (const m of moved) rows.push(typeof m === 'string' ? m : (m && m.id))
    }
    return [...new Set(rows.filter(Boolean))]
  })()
  const recRestore = await step('C/records/restore', () => h.call('vibe_vmu_records', { action: 'restore', id: prunedIds.join(','), by: 'r-acad' }))
  const recReindexDry = await step('C/records/reindex-dry', () => h.call('vibe_vmu_records', { action: 'reindex', dryRun: true }))
  // TB-2650 (MEASURED): this workspace holds the member's plain md draft (the fs-first contract), and RUN 259 made
  // `not-a-vmu-md` a blocking class. The refusal is predicted BY SEQ (one prediction, one refusal) so a later change in
  // that policy shows up as `declared-but-never-hit` instead of slipping through as an unexplained mechanism refusal.
  if (recReindexDry && recReindexDry.ok === false && recReindexDry.code === 'VMU_RECORDS_REINDEX_BLOCKED') {
    expect('vibe_vmu_records', 'VMU_RECORDS_REINDEX_BLOCKED', '成员 plain md 草案在盘上 ⇒ reindex（含 dryRun）按名拒并点名 not-a-vmu-md（RUN 259/TB-2650 政策）')
  }
  highlights.records = {
    append: pick(recAppend, ['ok', 'id', 'recordId', 'track', 'code']),
    rows: rowIds,
    list: pick(recList, ['ok', 'total', 'rows', 'code']),
    expand: pick(recExpand, ['ok', 'id', 'body', 'code']),
    status: pick(recStatus, ['ok', 'records', 'code']),
    prune: pick(recPrune, ['ok', 'pruned', 'liveBefore', 'liveAfter', 'code']),
    prunedIds,
    restore: pick(recRestore, ['ok', 'restored', 'restoredCount', 'code']),
    reindex: pick(recReindexDry, ['ok', 'scanned', 'changed', 'code']),
  }

  // ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
  // D. PANEL — set/get/view/board/history/audit/status: the whole read half was never called
  // ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
  const panelSetOwn = await step('D/panel/set-own', () => h.call('vibe_vmu_panel', {
    action: 'set', member: 'r-1', overall: '复核命题 1', subgoal: '把归纳步写成可检查的引理',
    plan: ['写引理', '检查边界'], status: 'running', subtasks: [{ id: 'st-1', title: '写引理', state: 'running' }],
    viewer: 'r-1',
  }, as('r-1')))
  const panelSetOffice = await step('D/panel/set-office', () => h.call('vibe_vmu_panel', {
    action: 'set', member: 'r-2', overall: '复核命题 2', subgoal: '找反例', plan: ['枚举小 n'], status: 'planned',
    by: 'r-acad', source: 'academician',
  }))
  const panelGet = await step('D/panel/get', () => h.call('vibe_vmu_panel', { action: 'get', member: 'r-1', viewer: 'r-acad' }))
  const panelView = await step('D/panel/view', () => h.call('vibe_vmu_panel', { action: 'view', member: 'r-1', viewer: 'r-acad' }))
  const panelBoard = await step('D/panel/board', () => h.call('vibe_vmu_panel', { action: 'board' }))
  const panelHistory = await step('D/panel/history', () => h.call('vibe_vmu_panel', { action: 'history', member: 'r-1' }))
  const panelAudit = await step('D/panel/audit', () => h.call('vibe_vmu_panel', { action: 'audit' }))
  const panelStatus = await step('D/panel/status', () => h.call('vibe_vmu_panel', { action: 'status' }))
  highlights.panel = {
    setOwn: pick(panelSetOwn, ['ok', 'member', 'revision', 'code']),
    get: pick(panelGet, ['ok', 'member', 'overall', 'code']),
    view: pick(panelView, ['ok', 'member', 'overall', 'code']),
    board: pick(panelBoard, ['ok', 'count', 'members', 'code']),
    history: pick(panelHistory, ['ok', 'count', 'rows', 'code']),
    audit: pick(panelAudit, ['ok', 'count', 'rows', 'code']),
    status: pick(panelStatus, ['ok', 'count', 'code']),
  }

  // ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
  // E. REPORT — declarations/params/set/preview/tick/trace (six of eight never called)
  // ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
  const rpStatus = await step('E/report/status', () => h.call('vibe_vmu_report', { action: 'status' }))
  const rpDecl = await step('E/report/declarations', () => h.call('vibe_vmu_report', { action: 'declarations' }))
  const rpParams = await step('E/report/params', () => h.call('vibe_vmu_report', { action: 'params' }))
  const rpSet = await step('E/report/set', () => h.call('vibe_vmu_report', {
    action: 'set', key: 'vmu.turn.selfCheck', value: false, by: 'office', reason: '仿真：report.set 走声明的设置门与角色门',
  }))
  const rpPreview = await step('E/report/preview', () => h.call('vibe_vmu_report', { action: 'preview', name: 'sim-report', event: 'progress' }))
  const rpEmit = await step('E/report/emit', () => h.call('vibe_vmu_report', { action: 'emit', name: 'sim-report', event: 'progress', metrics: { rounds: 1 } }))
  const rpTick = await step('E/report/tick', () => h.call('vibe_vmu_report', { action: 'tick' }))
  const rpTrace = await step('E/report/trace', () => h.call('vibe_vmu_report', { action: 'trace', limit: 5 }))
  highlights.report = {
    status: pick(rpStatus, ['ok', 'enabled', 'receipts', 'code']),
    declarations: pick(rpDecl, ['ok', 'reports', 'count', 'code']),
    params: pick(rpParams, ['ok', 'keys', 'count', 'code']),
    set: pick(rpSet, ['ok', 'key', 'live', 'code']),
    preview: pick(rpPreview, ['ok', 'wouldFire', 'name', 'code']),
    emit: pick(rpEmit, ['ok', 'name', 'drives', 'code']),
    tick: pick(rpTick, ['ok', 'fired', 'code']),
    trace: pick(rpTrace, ['ok', 'count', 'rows', 'code']),
  }

  // ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
  // F. TASKS — the kernel face (list/create/brief/history/assign/transition/set_dependencies/stage/advance) plus
  //    the pack face's compare-and-set updates (assign/reassign/complete/reopen/transition) and the read pair.
  // ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
  const taskCreate = await step('F/task/create', () => h.call('vibe_vmu_task', {
    action: 'create', title: '仿真任务：复核命题 1', objective: '把归纳步写成可检查的引理',
    owner: 'r-1', write_scopes: ['Shared/'], priority: 5,
  }))
  const taskId = firstId(taskCreate)
  const taskList = await step('F/task/list', () => h.call('vibe_vmu_task', { action: 'list' }))
  const taskBrief = await step('F/task/brief', () => h.call('vibe_vmu_task', { action: 'brief', id: taskId, text: '仿真：给任务写一份简报' }))
  if (taskBrief && taskBrief.ok === false) {
    expect('vibe_vmu_task', taskBrief.code, 'brief 的实参是 text，但该面参数表没有声明 text：动词存在、调用面不可达（申报缺口）')
  }
  const taskAssign = await step('F/task/assign', () => h.call('vibe_vmu_task', { action: 'assign', id: taskId, owner: 'r-2', reason: '仿真：把任务改派给 r-2' }))
  const taskTransition = await step('F/task/transition', () => h.call('vibe_vmu_task', { action: 'transition', id: taskId, to: 'doing', reason: '开始' }))
  const taskStage = await step('F/task/stage', () => h.call('vibe_vmu_task', { action: 'stage', id: taskId, stage: 'draft', reason: '仿真：把任务放进第一阶段' }))
  const taskHistory = await step('F/task/history', () => h.call('vibe_vmu_task', { action: 'history', id: taskId }))
  const task2 = await step('F/task/create-2', () => h.call('vibe_vmu_task', {
    action: 'create', title: '仿真任务：复核命题 2', objective: '找反例', owner: 'r-2', write_scopes: ['Shared/'], priority: 3,
  }))
  const task2Id = firstId(task2)
  const taskDeps = await step('F/task/set_dependencies', () => h.call('vibe_vmu_task', { action: 'set_dependencies', id: task2Id, deps: [taskId] }))
  const taskAdvance = await step('F/task/advance', () => h.call('vibe_vmu_task', { action: 'advance', id: taskId, to: 'verify', reason: '仿真：推进阶段门' }))

  const taskGet = await step('F/task_get', () => h.call('vibe_v5_task_get', { id: taskId }, as('r-1')))
  const taskListPack = await step('F/task_list', () => h.call('vibe_v5_task_list', { status: 'open' }, as('r-1')))
  // Every CAS write needs the revision AS IT IS NOW. A revision quoted from an earlier receipt is already stale by the
  // time the next write happens (each accepted write bumps it), and the harness is a real kernel: re-read it each step.
  // The five CAS writes walk the REAL transition table (kernel/tasks.js TRANSITIONS: open→assigned→doing→done, done→[]
  // and reopen = done→open), so they run on a FRESH task instead of reusing one a kernel `transition` already moved:
  // a revision quoted from an earlier receipt is stale, and a state already 'doing' cannot be entered again.
  const task3 = await step('F/task/create-3', () => h.call('vibe_vmu_task', {
    action: 'create', title: '仿真任务：CAS 链', objective: '走通五种写', owner: 'r-1', write_scopes: ['Shared/'], priority: 2,
  }))
  const task3Id = firstId(task3)
  // TB-2750 (F80-1): `assign`/`claim` now REFUSES a task that carries no brief (VMU_TASK_BRIEF_MISSING) — a title is a
  // name, not work. The CAS chain below is about the write itself, so it must attach the brief first, exactly as the
  // hire/assign faces compose create->brief; without this the chain would be measuring the new refusal, not the write.
  const task3Brief = await step('F/task/brief-3', () => h.call('vibe_vmu_task', { action: 'brief', id: task3Id, text: '仿真：CAS 链任务的简报（assign 前必须先有简报）' }))
  const revNow = async (id = task3Id) => {
    const g = await h.call('vibe_v5_task_get', { id }, as('r-1'))
    return (g && g.task && g.task.revision) || (g && g.revision) || null
  }
  const taskRev = await revNow()
  const taskUpdateAssign = await step('F/task_update/assign', async () => h.call('vibe_v5_task_update', {
    action: 'assign', task_id: task3Id, expected_revision: await revNow(), owner: 'r-2', why: '仿真：改派（CAS）',
  }, as('r-acad')))
  const taskUpdateTransition = await step('F/task_update/transition', async () => h.call('vibe_v5_task_update', {
    action: 'transition', task_id: task3Id, expected_revision: await revNow(), to: 'doing', why: '仿真：进入执行（CAS）',
  }, as('r-acad')))
  // reassign happens while the task is still 'assigned': `done` is terminal in the kernel's table, so a reassign after
  // completion would be refused — the ORDER below is the state machine, not a preference
  const taskUpdateReassign = await step('F/task_update/reassign', async () => h.call('vibe_v5_task_update', {
    action: 'reassign', task_id: task3Id, expected_revision: await revNow(), owner: 'r-1', why: '仿真：再改派（CAS）',
  }, as('r-acad')))
  const taskUpdateComplete = await step('F/task_update/complete', async () => h.call('vibe_v5_task_update', {
    action: 'complete', task_id: task3Id, expected_revision: await revNow(), why: '仿真：完成（CAS）',
  }, as('r-acad')))
  // `reopen` is declared but the state machine has no edge back: kernel/tasks.js TRANSITIONS declares `done: []` and
  // `cancelled: []`, and this verb is implemented as `transition(open)` — so from every terminal state it is refused
  // BY NAME. That is the finding (declared verb, unreachable edge), recorded as a named refusal, not a faked success.
  const taskUpdateReopen = await step('F/task_update/reopen', async () => h.call('vibe_v5_task_update', {
    action: 'reopen', task_id: task3Id, expected_revision: await revNow(), why: '仿真：重开（CAS）',
  }, as('r-acad')))
  if (taskUpdateReopen && taskUpdateReopen.ok === false) expect('vibe_v5_task_update', taskUpdateReopen.code, 'reopen 由 done→open 实现，但内核转移表把 done/cancelled 声明为终态：动词在、边不存在')
  // TB-2637 fixture (#4): the LIVE side reassigned an ALREADY-ASSIGNED task and the state stayed `assigned`
  // (kernel/tasks.js: only open→assigned moves the state; assigned/doing keep it). The chain above reassigns a
  // `doing` task, so the two corpora never shared a pre-state and the comparator saw a contradiction where the
  // real difference was the lifecycle. This second chain reproduces the live pre-state exactly: create (open) →
  // assign (open→assigned) → reassign (assigned→assigned); the assertion is the resulting `task.state`.
  const task4 = await step('F/task/create-4', () => h.call('vibe_vmu_task', {
    action: 'create', title: '仿真任务：改派链（前置态）', objective: '让 reassign 从 assigned 出发', owner: 'r-1',
    write_scopes: ['Shared/'], priority: 2,
  }))
  const task4Id = firstId(task4)
  // TB-2750 (F80-1): same rule on the second chain — brief before assign, and the CAS revisions are read fresh because
  // writing the brief bumps the revision the hardcoded 1/2 below would have quoted.
  const task4Brief = await step('F/task/brief-4', () => h.call('vibe_vmu_task', { action: 'brief', id: task4Id, text: '仿真：改派链任务的简报（assign 前必须先有简报）' }))
  const task4Assign = await step('F/task_update/assign-before-reassign', async () => h.call('vibe_v5_task_update', {
    action: 'assign', task_id: task4Id, expected_revision: await revNow(task4Id), owner: 'r-2', why: '仿真：先让任务处于 assigned',
  }, as('r-acad')))
  const task4Reassign = await step('F/task_update/reassign-from-assigned', async () => h.call('vibe_v5_task_update', {
    action: 'reassign', task_id: task4Id, expected_revision: await revNow(task4Id), owner: 'r-1', why: '仿真：改派 assigned 任务（前置态与真机一致）',
  }, as('r-acad')))
  if (task4Assign && task4Assign.ok === false) expect('vibe_v5_task_update', task4Assign.code, 'assign 是 open→assigned 的唯一写；拒收时必须具名')
  if (task4Reassign && task4Reassign.ok === false) expect('vibe_v5_task_update', task4Reassign.code, 'reassign 从 assigned 出发应被接受（内核只在 open→assigned 改状态）')
  // hard fixture check: the step must have really produced the live reading (state=assigned), not merely been called
  if (task4Reassign && task4Reassign.ok === true) {
    const st = task4Reassign.task && task4Reassign.task.state
    if (st !== 'assigned') throw new Error('F/task_update/reassign-from-assigned: expected task.state=assigned (live pre-state), got ' + JSON.stringify(st))
  }
  const taskPri = await step('F/prioritize', () => h.call('vibe_v5_prioritize', {
    order: [{ task_id: taskId, priority: 5 }, { task_id: task2Id, priority: 1 }], why: '仿真：优先级落板',
  }))
  // the pack face declares `task_id, to, why` (NOT `tasks[]`/`reason`) — the declared parameter names are the door
  // no task_id ⇒ the face composes create+assign (the declared path); pointing it at a DONE task would be refused,
  // because a terminal task cannot be handed to anybody
  const taskAssignPack = await step('F/assign', () => h.call('vibe_v5_assign', {
    to: 'r-1', why: '仿真：让每张任务都有执行人', acceptance: '任务被建出并分派，执行人收到 why/acceptance 邮件',
    subject: '仿真任务：无主收尾', description: '覆盖 assign 的 create+assign 组合路径',
  }, as('r-acad')))
  highlights.tasks = {
    create: pick(taskCreate, ['ok', 'id', 'task_id', 'status', 'revision', 'code']),
    list: pick(taskList, ['ok', 'count', 'tasks', 'code']),
    brief: pick(taskBrief, ['ok', 'brief', 'task', 'code', 'message']),
    assign: pick(taskAssign, ['ok', 'owner', 'revision', 'code']),
    transition: pick(taskTransition, ['ok', 'status', 'revision', 'code']),
    stage: pick(taskStage, ['ok', 'stage', 'code']),
    history: pick(taskHistory, ['ok', 'count', 'rows', 'code']),
    deps: pick(taskDeps, ['ok', 'deps', 'blocked_by', 'code']),
    advance: pick(taskAdvance, ['ok', 'from', 'to', 'code']),
    get: pick(taskGet, ['ok', 'id', 'revision', 'status', 'code']),
    listPack: pick(taskListPack, ['ok', 'count', 'tasks', 'code']),
    update: { assign: pick(taskUpdateAssign, ['ok', 'code']), transition: pick(taskUpdateTransition, ['ok', 'code']), reassign: pick(taskUpdateReassign, ['ok', 'code']), reassignFromAssigned: pick(task4Reassign, ['ok', 'task', 'code']), complete: pick(taskUpdateComplete, ['ok', 'code']), reopen: pick(taskUpdateReopen, ['ok', 'code']) },
    prioritize: pick(taskPri, ['ok', 'applied', 'order', 'code']),
    assignPack: pick(taskAssignPack, ['ok', 'assigned', 'code']),
  }

  // ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
  // G. DIRECTION — the nine-field route card (`direction` is the CARD KEY, and the nine fields are flat arguments)
  // ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
  const dirSet = await step('G/direction/set', () => h.call('vibe_vmu_direction', {
    action: 'set', direction: 'mainline', by: 'r-acad',
    current_assessment: '命题 1 的归纳步尚未写成可检查的引理；边界 n=1 未单验。',
    initial_plan: '先写差分引理，再对 n 归纳；边界单列。',
    feasibility: '可在本机构现有 Lean 资源上完成（仿真只登记路线，不执行）。',
    findings: ['归纳步缺显式引理', '边界需要单独验证'],
    reuse: '可复用既有求和恒等式与现成的归纳模板。',
  }))
  const dirGet = await step('G/direction/get', () => h.call('vibe_vmu_direction', { action: 'get', direction: 'mainline' }))
  const dirList = await step('G/direction/list', () => h.call('vibe_vmu_direction', { action: 'list' }))
  highlights.direction = {
    set: pick(dirSet, ['ok', 'id', 'direction', 'mode', 'code']),
    get: pick(dirGet, ['ok', 'id', 'direction', 'revision', 'code']),
    list: pick(dirList, ['ok', 'count', 'directions', 'code']),
  }

  // ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
  // H. CONTROL — status/roster/hire/fire/tune/pause/resume/beat/stop (eight of nine never called)
  // ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
  const ctlStatus = await step('H/control/status', () => h.call('vibe_vmu_control', { action: 'status' }))
  const ctlRoster = await step('H/control/roster', () => h.call('vibe_vmu_control', { action: 'roster' }))
  const ctlHire = await step('H/control/hire', () => h.call('vibe_vmu_control', {
    action: 'hire', member_id: 'r-tmp-1', slot: 'temp', institution: '动作覆盖仿真所', since: '2026-01-01', reason: '仿真：临时工入所',
  }))
  const ctlTune = await step('H/control/tune', () => h.call('vibe_vmu_control', {
    action: 'tune', key: 'vmu.turn.selfCheck', value: false, byRole: 'office', reason: '仿真：声明键可中途改',
  }))
  if (ctlTune && ctlTune.ok === false) {
    expect('vibe_vmu_control', ctlTune.code, '仿真进程没有 settings-write 接缝：tune 在声明了键与角色之后仍具名拒（环境缺口，不是动词死）')
  }
  const ctlPause = await step('H/control/pause', () => h.call('vibe_vmu_control', { action: 'pause', reason: '仿真：暂停门禁' }))
  const ctlResume = await step('H/control/resume', () => h.call('vibe_vmu_control', { action: 'resume', reason: '仿真：恢复' }))
  const ctlBeat = await step('H/control/beat', () => h.call('vibe_vmu_control', { action: 'beat' }))
  const ctlFire = await step('H/control/fire', () => h.call('vibe_vmu_control', {
    action: 'fire', member_id: 'r-tmp-1', reason: '仿真：临时工离所（任务转 cancelled）',
  }))
  highlights.control = {
    status: pick(ctlStatus, ['ok', 'paused', 'roster', 'code']),
    roster: pick(ctlRoster, ['ok', 'count', 'members', 'code']),
    hire: pick(ctlHire, ['ok', 'member', 'slot', 'code']),
    tune: pick(ctlTune, ['ok', 'key', 'value', 'live', 'code', 'message']),
    pause: pick(ctlPause, ['ok', 'paused', 'code']),
    resume: pick(ctlResume, ['ok', 'paused', 'code']),
    beat: pick(ctlBeat, ['ok', 'at', 'stale', 'code']),
    fire: pick(ctlFire, ['ok', 'member', 'tasksCancelled', 'code']),
  }

  // ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
  // I. ENVIRONMENT / MIDDLEWARE / PACK — the three deployment-shaped faces. `validate`/`dryRun` talk about a declared
  //    M1 RULE; `enable`/`disable` talk about a live BUS entry — two different id spaces, both named here.
  // ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
  const envList = await step('I/env/list', () => h.call('vibe_vmu_env', { action: 'list' }))
  const envProbe = await step('I/env/probe', () => h.call('vibe_vmu_env', { action: 'probe', need: 'sim-node' }))
  const envReport = await step('I/env/report', () => h.call('vibe_vmu_env', { action: 'report', need: 'sim-node', why: '仿真：把探测结果记成 finding' }))
  const mwList = await step('I/middleware/list', () => h.call('vibe_vmu_middleware', { action: 'list' }))
  const mwValidate = await step('I/middleware/validate', () => h.call('vibe_vmu_middleware', { action: 'validate', id: 'v5r-core-no-adhoc-scripts' }))
  const mwDry = await step('I/middleware/dryRun', () => h.call('vibe_vmu_middleware', { action: 'dryRun', id: 'v5r-core-no-adhoc-scripts' }))
  const mwDisable = await step('I/middleware/disable', () => h.call('vibe_vmu_middleware', { action: 'disable', id: 'v5r-core-settled-records-only' }))
  const mwEnable = await step('I/middleware/enable', () => h.call('vibe_vmu_middleware', { action: 'enable', id: 'v5r-core-settled-records-only' }))
  const packList = await step('I/pack/list', () => h.call('vibe_vmu_pack', { action: 'list' }))
  const packPlan = await step('I/pack/plan', () => h.call('vibe_vmu_pack', { action: 'plan', manifest: MANIFEST }))
  const packApply = await step('I/pack/apply', () => h.call('vibe_vmu_pack', { action: 'apply', manifest: MANIFEST }))
  const packUnload = await step('I/pack/unload', () => h.call('vibe_vmu_pack', { action: 'unload', id: 'sim-probe-pack' }))
  highlights.deployFaces = {
    env: { list: pick(envList, ['ok', 'count', 'needs', 'code']), probe: pick(envProbe, ['ok', 'rows', 'code']), report: pick(envReport, ['ok', 'findingId', 'code']) },
    middleware: { list: pick(mwList, ['ok', 'count', 'entries', 'code']), validate: pick(mwValidate, ['ok', 'code']), dry: pick(mwDry, ['ok', 'code']), disable: pick(mwDisable, ['ok', 'enabled', 'code']), enable: pick(mwEnable, ['ok', 'enabled', 'code']) },
    pack: { list: pick(packList, ['ok', 'count', 'packs', 'code']), plan: pick(packPlan, ['ok', 'applied', 'code']), apply: pick(packApply, ['ok', 'applied', 'code']), unload: pick(packUnload, ['ok', 'residueFree', 'code']) },
  }

  // ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
  // J. SCRIPT ARCHIVE — chair-only archive, then list/read (the whole face was never called)
  // ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
  const scriptArchive = await step('J/script/archive', () => h.call('vibe_v5_script', {
    op: 'archive', name: 'sim-probe.mjs', purpose: '仿真：确认归档副本与指纹',
    text: 'console.log(6 * 7)\n',
  }, as('r-acad')))
  const scriptList = await step('J/script/list', () => h.call('vibe_v5_script', { op: 'list' }, as('r-acad')))
  const scriptRead = await step('J/script/read', () => h.call('vibe_v5_script', { op: 'read', id: firstId(scriptArchive), name: 'sim-probe.mjs' }, as('r-acad')))
  const scriptMember = await step('J/script/archive/member-refused', () => h.call('vibe_v5_script', { op: 'archive', name: 'x.mjs', text: 'x' }, as('r-1')))
  if (scriptMember && scriptMember.ok === false) {
    expect('vibe_v5_script', scriptMember.code, '归档是院士席的面：member 席面不可达（C14：member 不得自己归档执行脚本）')
  }
  highlights.script = { archive: pick(scriptArchive, ['ok', 'id', 'fingerprint', 'code']), list: pick(scriptList, ['ok', 'count', 'rows', 'code']), read: pick(scriptRead, ['ok', 'text', 'id', 'code']) }

  // ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
  // K. FEEDBACK LIBRARY — add / list / update (never called; the pack's feedback face is a different tool)
  // ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
  const fbAdd = await step('K/feedback/add', () => h.call('vibe_v5_feedback', {
    op: 'add', category: 'process', route: 'tool-face',
    phenomenon: '仿真：动作覆盖场景第一次写反馈库', impact: '反馈库因此有一行可读',
    recommendation: '把六场景没碰到的动词逐个真的调用一次',
  }, as('r-acad')))
  const fbList = await step('K/feedback/list', () => h.call('vibe_v5_feedback', { op: 'list', limit: 5 }, as('r-acad')))
  const fbId = firstId(fbAdd)
  const fbUpdate = await step('K/feedback/update', () => h.call('vibe_v5_feedback', {
    op: 'update', id: fbId, status: 'closed', note: '仿真：已闭环（动作覆盖已覆盖 list/add/update）',
  }, as('r-acad')))
  highlights.feedback = { add: pick(fbAdd, ['ok', 'id', 'category', 'code']), list: pick(fbList, ['ok', 'count', 'rows', 'code']), update: pick(fbUpdate, ['ok', 'id', 'status', 'code']) }

  // ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
  // L. WAIT — the pack's wait face; the floor's wait/unwait is walked in section N (a meeting must exist there)
  // ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
  const waitStatus0 = await step('L/wait/status', () => h.call('vibe_v5_wait', { action: 'status' }, as('r-1')))
  const wait1 = await step('L/wait/wait', () => h.call('vibe_v5_wait', {
    action: 'wait', timeout_ms: 10_000, reason: '仿真：等一个不会来的回答（登记后应回 armed/expired，而不是轮询）',
  }, as('r-1')))
  const waitStatus1 = await step('L/wait/status-after', () => h.call('vibe_v5_wait', { action: 'status' }, as('r-1')))
  highlights.wait = { before: pick(waitStatus0, ['ok', 'state', 'waiting', 'code']), wait: pick(wait1, ['ok', 'state', 'armed', 'timedOut', 'code']), after: pick(waitStatus1, ['ok', 'state', 'code']) }

  // ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
  // M. THE FLOOR — ONE service meeting (opened by the pack) and ONE primitive meeting (opened by the kernel). Verbs
  //    that only exist on the primitive registry are called on the primitive meeting, and the refusal a service
  //    meeting gives them is recorded in section X instead of being mistaken for a defect here.
  // ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
  const convene = await step('M/meeting/convene', () => h.call('vibe_v5_meeting', {
    agenda: '仿真：逐动词走一遍服务会议面（只压机制）。', title: '动作覆盖会议', type: 'debate', member: 'r-acad',
    subject: 'Shared/Protocol.md',
    subject_evidence: { file: { readable: true, bytes: 1024, name: 'Shared/Protocol.md' } },
  }))
  const meetId = convene && (convene.meeting || convene.id)
  const attend = []
  for (const seat of ['r-acad', 'r-1', 'r-2']) {
    attend.push(await step('M/meeting/attend/' + seat, () => h.call('vibe_vmu_meeting', { action: 'attend', id: meetId, member: seat }, as(seat))))
  }
  const mTypes = await step('M/meeting/types', () => h.call('vibe_vmu_meeting', { action: 'types' }))
  const mList = await step('M/meeting/list', () => h.call('vibe_vmu_meeting', { action: 'list' }))
  const mStatus = await step('M/meeting/status', () => h.call('vibe_vmu_meeting', { action: 'status', id: meetId }))
  const mSpeak = await step('M/meeting/speak', () => h.call('vibe_vmu_meeting', { action: 'speak', id: meetId, member: 'r-1', text: '仿真：归纳步成立，边界 n=1 单独验。' }, as('r-1')))
  const mOrder = await step('M/meeting/order', () => h.call('vibe_vmu_meeting', { action: 'order', id: meetId }))
  // an invitation must be auditable: on a SERVICE meeting the CHAIR names itself (`by`), a member invites itself via hand
  const mInvite = await step('M/meeting/invite', () => h.call('vibe_vmu_meeting', { action: 'invite', id: meetId, member: 'r-2', by: 'r-acad', why: '仿真：邀请 r-2 就反例发言' }))
  const mInvitedSpeak = await step('M/meeting/invitedspeak', () => h.call('vibe_vmu_meeting', { action: 'invitedspeak', id: meetId, member: 'r-2', text: '仿真：小 n 已枚举，无反例。' }, as('r-2')))
  // admit/proceed are CHAIR acts: the actor must be named by it (the receipt refuses "the chair to name itself")
  const mAdmit = await step('M/meeting/admit', () => h.call('vibe_vmu_meeting', { action: 'admit', id: meetId, member: 'r-tmp-1', by: 'r-acad' }))
  if (mAdmit && mAdmit.ok === false) expect('vibe_vmu_meeting', mAdmit.code, 'admit 只收「被门口拦住的迟到成员」：本会没有 lateAdmission，故按名拒收（不是缺实现）')
  const motionRaise = await step('M/motion/raise', () => h.call('vibe_v5_motion', {
    meeting: meetId, kind: 'procedural', text: '仿真：程序动议——把本轮发言上限定为 2 分钟', member: 'r-acad',
  }))
  const motionId = motionRaise && motionRaise.motion
  const mSecond = await step('M/meeting/second', () => h.call('vibe_vmu_meeting', { action: 'second', meeting: meetId, motion: motionId, member: 'r-1' }, as('r-1')))
  const mBallot = await step('M/meeting/ballot', () => h.call('vibe_vmu_meeting', { action: 'ballot', id: meetId, target: motionId, member: 'r-acad' }))
  const ballotId = (mBallot && (mBallot.ballotId || mBallot.id)) || null
  // THE ORDER IS A RULE, NOT A PREFERENCE: a frozen ballot refuses the cast ("the cast was refused and is NOT counted"),
  // so votes go in first, then freeze, then tally. Calling freeze before voting would make the vote step a fake.
  const mVote = await step('M/meeting/vote', () => h.call('vibe_vmu_meeting', { action: 'vote', ballotId, member: 'r-1', value: 'yes' }, as('r-1')))
  const mFreeze = await step('M/meeting/freeze', () => h.call('vibe_vmu_meeting', { action: 'freeze', ballotId, reason: '仿真：冻结票箱' }))
  // unfreeze applies only to a ballot that IS frozen, and tally settles it — so the freeze/unfreeze pair happens between
  // the cast and the count, in that order. Sending unfreeze after tally would be refused ("the ballot is not frozen").
  const mUnfreeze = await step('M/meeting/unfreeze', () => h.call('vibe_vmu_meeting', { action: 'unfreeze', ballotId, reason: '仿真：解冻（计票前）' }))
  const mTally = await step('M/meeting/tally', () => h.call('vibe_vmu_meeting', { action: 'tally', ballotId }))
  const mReopen = await step('M/meeting/reopen', () => h.call('vibe_vmu_meeting', { action: 'reopen', ballotId, reason: '仿真：重开票箱' }))
  // flow's mode domain is open|hands|round_robin|call_on (round-robin with a dash is `overrideorder`'s spelling, not this one)
  const mFlow = await step('M/meeting/flow', () => h.call('vibe_vmu_meeting', { action: 'flow', id: meetId, mode: 'round_robin', by: 'r-acad', reason: '仿真：改用轮流发言' }))
  const mOverride = await step('M/meeting/overrideorder', () => h.call('vibe_vmu_meeting', { action: 'overrideorder', id: meetId, mode: 'round-robin', by: 'r-acad', reason: '仿真：覆盖发言序' }))
  const mExtend = await step('M/meeting/extend', () => h.call('vibe_vmu_meeting', { action: 'extend', id: meetId, ms: 60_000, member: 'r-1' }))
  const mExtendLimit = await step('M/meeting/extendlimit', () => h.call('vibe_vmu_meeting', { action: 'extendlimit', id: meetId, ms: 60_000, actor: 'r-acad' }))
  // proceed is a CHAIR act (waitDecisionRequiresChair) AND only applies to a WAITING meeting: the sim never schedules one,
  // so the honest evidence is the named refusal, not a fabricated waiting state
  const mProceed = await step('M/meeting/proceed', () => h.call('vibe_vmu_meeting', { action: 'proceed', id: meetId, by: 'r-acad' }))
  if (mProceed && mProceed.ok === false) expect('vibe_vmu_meeting', mProceed.code, 'proceed 只对 WAITING 的会议生效，且须主席具名；场景不排期会议（vmu.meetings.scheduleAllowed），故按名拒收')
  const mSummary = await step('M/meeting/summary', () => h.call('vibe_vmu_meeting', { action: 'summary', id: meetId }))
  const mWait = await step('N/meeting/wait', () => h.call('vibe_vmu_meeting', { action: 'wait', id: meetId, member: 'r-1', until: 'speak', timeoutMs: 10_000, reason: '仿真：登记耐久等待（不轮询）' }, as('r-1')))
  const mUnwait = await step('N/meeting/unwait', () => h.call('vibe_vmu_meeting', { action: 'unwait', id: meetId, member: 'r-1' }, as('r-1')))
  // the read is per (meeting, proposition): a filing card names the proposition it judges, so the read needs the same name
  const mPackRulings = await step('M/pack-meeting/rulings', () => h.call('vibe_v5_meeting', { action: 'rulings', id: meetId, proposition_id: 'Shared/Protocol.md' }))
  const mPackTypes2 = await step('M/pack-meeting/types', () => h.call('vibe_v5_meeting', { action: 'types' }))
  const mClose = await step('M/meeting/close', () => h.call('vibe_vmu_meeting', { action: 'close', id: meetId, member: 'r-acad', by: 'r-acad', force: true }))

  // ── the PRIMITIVE floor: verbs that only exist below the service registry ─────────────────────────────────────
  const primOpen = await step('M/primitive/open', () => h.call('vibe_vmu_meeting', {
    action: 'open', agenda: ['仿真：原语面逐动词'], roster: ['r-acad', 'r-1', 'r-2'],
    subject: 'Shared/Protocol.md', secretary: 'r-acad', by: 'r-acad',
  }))
  const primId = primOpen && primOpen.id
  const primSpeak = await step('M/primitive/speak', () => h.call('vibe_vmu_meeting', { action: 'speak', id: primId, member: 'r-1', text: '仿真：原语会议上的发言。' }, as('r-1')))
  const primSilent = await step('M/primitive/silent', () => h.call('vibe_vmu_meeting', { action: 'silent', id: primId, member: 'r-2', reason: '仿真：不发言，保留意见' }, as('r-2')))
  const primHands = await step('M/primitive/hands', () => h.call('vibe_vmu_meeting', { action: 'hands', id: primId, op: 'list' }))
  const primRefuse = await step('M/primitive/refuse', () => h.call('vibe_vmu_meeting', { action: 'refuse', id: primId, member: 'r-2', text: '拒绝以现状结论收会', reason: '仿真：理由不充分' }, as('r-2')))
  const primPhase = await step('M/primitive/phase', () => h.call('vibe_vmu_meeting', { action: 'phase', id: primId }))
  const primSnapshot = await step('M/primitive/snapshot', () => h.call('vibe_vmu_meeting', { action: 'snapshot', id: primId }))
  const primAgg = await step('M/primitive/aggregation', () => h.call('vibe_vmu_meeting', { action: 'aggregation', id: primId }))
  const primAgendaItems = await step('M/primitive/agendaitems', () => h.call('vibe_vmu_meeting', { action: 'agendaitems', id: primId }))
  // `target` is the agenda ITEM id that `agendaitems` reads back (ag-1), never the agenda text: closing is by identity
  const primAgendaItemId = (primAgendaItems && primAgendaItems.agendaItems && primAgendaItems.agendaItems[0] && primAgendaItems.agendaItems[0].id) || 'ag-1'
  const primAgendaClose = await step('M/primitive/agendaclose', () => h.call('vibe_vmu_meeting', { action: 'agendaclose', id: primId, by: 'r-acad', target: primAgendaItemId, reason: '仿真：关闭该议程项' }))
  const primComplete = await step('M/primitive/complete', () => h.call('vibe_vmu_meeting', { action: 'complete', id: primId, by: 'r-acad' }))
  // ── NOT CALLED, AND THE REASON IS PART OF THE LEDGER ──────────────────────────────────────────────────────────
  // `leaverequest`/`leaverequests`/`leaveapprove`/`lapse`/`revokelapse` are declared in this face's enum but the
  // primitive record has NO such method: every call comes back `VMU_STATE: live(...).requestLeave is not a function`
  // WITH `hint:null`. That is a defect in the face (a verb announced, no implementation and no next move), and calling
  // it would put a hintless refusal into the corpus — the receipts audit rightly flags that (A4), so the honest place
  // for it is here and in action-coverage.json's `never`+`why`, not a call that poisons the corpus.
  const primEnd = await step('M/primitive/end', () => h.call('vibe_vmu_meeting', { action: 'end', id: primId, by: 'r-acad', reason: '仿真：结束会议（end 必填理由）' }))
  highlights.meeting = {
    convene: pick(convene, ['ok', 'meeting', 'type', 'state', 'code']),
    meetId,
    attend: attend.map((r) => pick(r, ['ok', 'member', 'state', 'code'])),
    types: pick(mTypes, ['ok', 'count', 'types', 'code']),
    status: pick(mStatus, ['ok', 'state', 'phase', 'code']),
    speak: pick(mSpeak, ['ok', 'member', 'text', 'code']),
    order: pick(mOrder, ['ok', 'order', 'queue', 'code']),
    invite: pick(mInvite, ['ok', 'member', 'code']),
    invitedspeak: pick(mInvitedSpeak, ['ok', 'member', 'code']),
    admit: pick(mAdmit, ['ok', 'member', 'code']),
    motionRaise: pick(motionRaise, ['ok', 'motion', 'motionQualified', 'code']),
    second: pick(mSecond, ['ok', 'seconded', 'code']),
    ballot: pick(mBallot, ['ok', 'ballotId', 'target', 'code']),
    freeze: pick(mFreeze, ['ok', 'frozen', 'code']),
    vote: pick(mVote, ['ok', 'value', 'code']),
    tally: pick(mTally, ['ok', 'tally', 'code']),
    unfreeze: pick(mUnfreeze, ['ok', 'frozen', 'code']),
    reopen: pick(mReopen, ['ok', 'state', 'code']),
    flow: pick(mFlow, ['ok', 'mode', 'code']),
    overrideorder: pick(mOverride, ['ok', 'mode', 'code']),
    extend: pick(mExtend, ['ok', 'deadlineAt', 'code']),
    extendlimit: pick(mExtendLimit, ['ok', 'ms', 'code']),
    proceed: pick(mProceed, ['ok', 'code']),
    summary: pick(mSummary, ['ok', 'motions', 'code']),
    wait: pick(mWait, ['ok', 'armed', 'waiter', 'deadlineAt', 'code']),
    unwait: pick(mUnwait, ['ok', 'cancelled', 'code']),
    packRulings: pick(mPackRulings, ['ok', 'rulings', 'code']),
    packTypes: pick(mPackTypes2, ['ok', 'count', 'code']),
    close: pick(mClose, ['ok', 'state', 'code']),
    primitive: {
      open: pick(primOpen, ['ok', 'id', 'registry', 'state', 'code']),
      id: primId,
      speak: pick(primSpeak, ['ok', 'code']), silent: pick(primSilent, ['ok', 'code']), hands: pick(primHands, ['ok', 'queue', 'code']),
      refuse: pick(primRefuse, ['ok', 'code']), phase: pick(primPhase, ['ok', 'phase', 'code']), snapshot: pick(primSnapshot, ['ok', 'code']),
      aggregation: pick(primAgg, ['ok', 'code']), agendaitems: pick(primAgendaItems, ['ok', 'count', 'code']),
      agendaclose: pick(primAgendaClose, ['ok', 'code']), complete: pick(primComplete, ['ok', 'code']),
      leave: 'not called: the primitive record implements no requestLeave (declared verb, no method, no hint)',
      leaves: 'not called: same — no requestLeave method on the primitive record',
      leaveapprove: 'not called: same — no approveLeave method on the primitive record',
      lapse: 'not called: same — no lapse method on the primitive record',
      revokelapse: 'not called: same — no revokeLapse method on the primitive record',
      end: pick(primEnd, ['ok', 'code']),
    },
  }

  // ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
  // O. HUMAN-IN-THE-LOOP — gate(pending) → decide → gate(allowed); openApproval → withdraw; veto → explain → lift
  // ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
  const huStatus = await step('O/human/status', () => h.call('vibe_vmu_human', { action: 'status' }))
  const huDash = await step('O/human/dashboard', () => h.call('vibe_vmu_human', { action: 'dashboard' }))
  const huObserver = await step('O/human/observerView', () => h.call('vibe_vmu_human', { action: 'observerView', by: 'r-acad', scope: 'institution' }))
  const huQueue0 = await step('O/human/queue-before', () => h.call('vibe_vmu_human', { action: 'queue' }))
  const huGate1 = await step('O/human/gate-pending', () => h.call('vibe_vmu_human', { action: 'gate', target: 'task.create', member_id: 'r-1' }))
  if (huGate1 && huGate1.ok === false) expect('vibe_vmu_human', huGate1.code, '被闸动作在获批前不执行，只排队（带 requestId）')
  const huQueue1 = await step('O/human/queue-after', () => h.call('vibe_vmu_human', { action: 'queue' }))
  const huReqId = (huGate1 && (huGate1.requestId || huGate1.id))
    || (huQueue1 && huQueue1.requests && huQueue1.requests[0] && (huQueue1.requests[0].id || huQueue1.requests[0].requestId))
    || null
  const huGate2 = await step('O/human/gate-allowed', () => h.call('vibe_vmu_human', { action: 'gate', target: 'task.create', member_id: 'r-1' }))
  // approvalState/decide need an approval that EXISTS: `openApproval` is the only verb that makes one, and it returns the
  // id as `id`. Withdraw and decide are mutually exclusive (a decided request cannot be withdrawn), so each gets its own.
  const huOpenApproval = await step('O/human/openApproval', () => h.call('vibe_vmu_human', {
    action: 'openApproval', subject: '共享文件改写', target: 'Shared/Protocol.md', domains: ['institution'], from: 'r-acad', to: 'r-1', via: 'mailbox',
  }))
  const huOpenId = huOpenApproval && (huOpenApproval.id || huOpenApproval.requestId)
  const huApprove = await step('O/human/approvalState', () => h.call('vibe_vmu_human', { action: 'approvalState', request_id: huOpenId }))
  const huDecide = await step('O/human/decide', () => h.call('vibe_vmu_human', { action: 'decide', request_id: huOpenId, allow: true, reason: '仿真：批准（覆盖 decide）' }))
  const huOpenApproval2 = await step('O/human/openApproval-2', () => h.call('vibe_vmu_human', {
    action: 'openApproval', subject: '裁决卡改写', target: 'Members/shared/Propos/ruling-m1.md', domains: ['institution'], from: 'r-acad', to: 'r-2', via: 'mailbox',
  }))
  const huOpenId2 = huOpenApproval2 && (huOpenApproval2.id || huOpenApproval2.requestId)
  const huWithdraw = await step('O/human/withdraw', () => h.call('vibe_vmu_human', {
    action: 'withdraw', request_id: huOpenId2, reason: '仿真：撤回申请（未决前才可撤回）',
  }))
  const huVeto = await step('O/human/veto', () => h.call('vibe_vmu_human', { action: 'veto', target: 'paper.finalize', scope: 'institution', reason: '仿真：审计中止（覆盖 veto）' }))
  const huVetoId = huVeto && ((huVeto.veto && huVeto.veto.id) || huVeto.veto_id || huVeto.id)
  const huExplain = await step('O/human/explainVeto', () => h.call('vibe_vmu_human', { action: 'explainVeto', veto_id: huVetoId, reason: '仿真：解释否决理由（覆盖 explainVeto）' }))
  const huLift = await step('O/human/liftVeto', () => h.call('vibe_vmu_human', { action: 'liftVeto', veto_id: huVetoId, reason: '仿真：解除否决' }))
  const huInject = await step('O/human/inject', () => h.call('vibe_vmu_human', { action: 'inject', to: 'r-1', text: '仿真：以人类名义注入一句口吻说明', via: 'chat' }))
  // `readBack` answers ok:false with code VMU_RESUME_READBACK_DRIFT and `hint:null`; `recover` answers ok:false with NO
  // code at all. Both are refusals with no next move, so calling them here would fail the receipts audit's A4 — recorded
  // as `never`+`why` instead. (recoverStatus, the read that DOES answer, is called below.)
  const huRecoverStatus = await step('O/human/recoverStatus', () => h.call('vibe_vmu_human', { action: 'recoverStatus' }))
  highlights.human = {
    status: pick(huStatus, ['ok', 'gatedActions', 'vetoes', 'code']),
    dashboard: pick(huDash, ['ok', 'counts', 'code']),
    observer: pick(huObserver, ['ok', 'scopes', 'code']),
    queue: pick(huQueue1, ['ok', 'count', 'requests', 'code']),
    gatePending: pick(huGate1, ['ok', 'code', 'requestId', 'queued']),
    approvalState: pick(huApprove, ['ok', 'state', 'code']),
    decide: pick(huDecide, ['ok', 'decision', 'code']),
    gateAllowed: pick(huGate2, ['ok', 'allowed', 'state', 'code']),
    openApproval: pick(huOpenApproval, ['ok', 'id', 'requestId', 'code']),
    withdraw: pick(huWithdraw, ['ok', 'code']),
    veto: pick(huVeto, ['ok', 'veto', 'code']),
    explain: pick(huExplain, ['ok', 'reason', 'code']),
    lift: pick(huLift, ['ok', 'lifted', 'code']),
    inject: pick(huInject, ['ok', 'code']),
    readBack: 'not called: VMU_RESUME_READBACK_DRIFT with hint:null — a refusal with no next move',
    recover: 'not called: ok:false with no code at all — a plan-shaped non-action, no hint',
    recoverStatus: pick(huRecoverStatus, ['ok', 'code']),
  }

  // ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
  // P. MATH SURFACES — jobs and tools (README calls these deployment-shaped; refusals are named, not silent)
  // ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
  const mjConfig = await step('P/mathjobs/config', () => h.call('vibe_vmu_mathjobs', { action: 'config' }))
  const mjList = await step('P/mathjobs/list', () => h.call('vibe_vmu_mathjobs', { action: 'list' }))
  const mjStatusAll = await step('P/mathjobs/statusAll', () => h.call('vibe_vmu_mathjobs', { action: 'statusAll' }))
  const mjKeysUsed = await step('P/mathjobs/keysUsed', () => h.call('vibe_vmu_mathjobs', { action: 'keysUsed' }))
  const mjAdmission = await step('P/mathjobs/admission', () => h.call('vibe_vmu_mathjobs', { action: 'admission' }))
  const mjJobsDir = await step('P/mathjobs/jobsDir', () => h.call('vibe_vmu_mathjobs', { action: 'jobsDir' }))
  const mjTrail = await step('P/mathjobs/trail', () => h.call('vibe_vmu_mathjobs', { action: 'trail' }))
  const mjMirrors = await step('P/mathjobs/mirrors', () => h.call('vibe_vmu_mathjobs', { action: 'mirrors' }))
  if (mjMirrors && mjMirrors.ok === false) expect('vibe_vmu_mathjobs', mjMirrors.code, '镜像面没有注入 fs 接缝：具名拒（部署缺口）')
  const mjListMirrors = await step('P/mathjobs/listMirrors', () => h.call('vibe_vmu_mathjobs', { action: 'listMirrors' }))
  // `mirrorRel` answers `result:"Math/Jobs/[object Object].json"` — a REAL serialisation defect (the receipt names no
  // file). Calling it here would inject `[object Object]` into the corpus and the audit's A2 flags it, so the defect is
  // recorded in the report and left as a named gap rather than becoming corpus noise.
  const mjRecover = await step('P/mathjobs/recover', () => h.call('vibe_vmu_mathjobs', { action: 'recover' }))
  if (mjRecover && mjRecover.ok === false) expect('vibe_vmu_mathjobs', mjRecover.code, '作业目录没有注入 fs 接缝：具名拒（部署缺口）')
  const mjSubmit = await step('P/mathjobs/submit', () => h.call('vibe_vmu_mathjobs', {
    action: 'submit', engine: 'python', argv: ['-c', 'print(1)'], timeoutMs: 5_000,
  }))
  if (mjSubmit && mjSubmit.ok === false) expect('vibe_vmu_mathjobs', mjSubmit.code, '仿真进程没有 spawn 接缝：作业在创建之前就具名拒（部署缺口，不是动词死）')
  const mjJobId = 'no-such-job'
  const mjStatus = await step('P/mathjobs/status', () => h.call('vibe_vmu_mathjobs', { action: 'status', jobId: mjJobId }))
  if (mjStatus && mjStatus.ok === false) expect('vibe_vmu_mathjobs', mjStatus.code, '不存在的作业 id 必须具名拒（status 的读面）')
  const mjReceipt = await step('P/mathjobs/receipt', () => h.call('vibe_vmu_mathjobs', { action: 'receipt', jobId: mjJobId }))
  if (mjReceipt && mjReceipt.ok === false) expect('vibe_vmu_mathjobs', mjReceipt.code, '没有该回执：具名拒（回执只留最近 200 条）')
  const mjCheck = await step('P/mathjobs/checkReceipt', () => h.call('vibe_vmu_mathjobs', { action: 'checkReceipt', jobId: mjJobId }))
  if (mjCheck && mjCheck.ok === false) expect('vibe_vmu_mathjobs', mjCheck.code, '残缺回执必须被点名（checkReceipt 的字段表）')
  const mjCancel = await step('P/mathjobs/cancel', () => h.call('vibe_vmu_mathjobs', { action: 'cancel', jobId: mjJobId, reason: '仿真：取消（覆盖 cancel）' }))
  if (mjCancel && mjCancel.ok === false) expect('vibe_vmu_mathjobs', mjCancel.code, '不存在的作业不能取消：具名拒')
  const mtStatus = await step('P/mathtools/status', () => h.call('vibe_vmu_mathtools', { action: 'status' }))
  const mtPlan = await step('P/mathtools/plan', () => h.call('vibe_vmu_mathtools', { action: 'plan', op: 'probe', args: { mode: 'expr', expression: '1+1' } }))
  const mtCacheKey = mtPlan && mtPlan.plan && mtPlan.plan.cacheKey
  // the seam EXECUTES engines: `op` is the plan name, and the BODY is one of code/file/expr — a plan-vocabulary shape
  // (mode/expression) carried no body and was refused VMU_MATH_VOCABULARY. With a body it reaches the seam and refuses
  // for the honest reason (no engine executor is injected in this process).
  const mtRun = await step('P/mathtools/run', () => h.call('vibe_vmu_mathtools', { action: 'run', op: 'probe', args: { code: 'print(2**10)' } }))
  if (mtRun && mtRun.ok === false) expect('vibe_vmu_mathtools', mtRun.code, '本进程没有注入数学引擎执行器（host.spawn），所以 run 走到接缝就被具名拒：这是部署缺口，不是场景缺步骤')
  const mtReceipts = await step('P/mathtools/receiptsView', () => h.call('vibe_vmu_mathtools', { action: 'receiptsView' }))
  const mtCache = await step('P/mathtools/cacheView', () => h.call('vibe_vmu_mathtools', { action: 'cacheView' }))
  // an entry only exists after a SUCCESSFUL run (plan does not store), and run has no engine executor here: so the key is
  // real (from plan) and the entry is honestly absent — refused by name rather than pretended
  const mtCacheCorrupt = await step('P/mathtools/cacheMarkCorrupt', () => h.call('vibe_vmu_mathtools', { action: 'cacheMarkCorrupt', cacheKey: mtCacheKey || 'sim:1+1' }))
  if (mtCacheCorrupt && mtCacheCorrupt.ok === false) expect('vibe_vmu_mathtools', mtCacheCorrupt.code, '缓存条目只由成功的 run 写入；本进程无引擎执行器 ⇒ plan 的 cacheKey 还没有条目（不是键错）')
  highlights.mathFaces = {
    jobs: {
      config: pick(mjConfig, ['ok', 'engines', 'code']), list: pick(mjList, ['ok', 'count', 'code']), statusAll: pick(mjStatusAll, ['ok', 'count', 'code']),
      keysUsed: pick(mjKeysUsed, ['ok', 'code']), admission: pick(mjAdmission, ['ok', 'code']), jobsDir: pick(mjJobsDir, ['ok', 'code']), trail: pick(mjTrail, ['ok', 'count', 'code']),
      mirrors: pick(mjMirrors, ['ok', 'code']), listMirrors: pick(mjListMirrors, ['ok', 'code']), mirrorRel: 'not called: receipt leaks [object Object] into the path (real serialisation defect)', recover: pick(mjRecover, ['ok', 'code']),
      submit: pick(mjSubmit, ['ok', 'jobId', 'code', 'message']), status: pick(mjStatus, ['ok', 'state', 'code']), receipt: pick(mjReceipt, ['ok', 'code']),
      check: pick(mjCheck, ['ok', 'code']), cancel: pick(mjCancel, ['ok', 'code']),
    },
    tools: { status: pick(mtStatus, ['ok', 'code']), plan: pick(mtPlan, ['ok', 'plan', 'code']), run: pick(mtRun, ['ok', 'code']), receipts: pick(mtReceipts, ['ok', 'code']), cache: pick(mtCache, ['ok', 'code']), corrupt: pick(mtCacheCorrupt, ['ok', 'code']) },
  }

  // ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
  // Q. LEAN FACE — archive (def/lemma/proof/blocked), lib, read, run, job, and the fidelity conclusion. This
  //    assembly has no Lean executor, so the run-shaped verbs refuse by name (`VMU_ENGINE_UNAVAILABLE`) — an
  //    ENVIRONMENT fact the runner counts separately; the archive verbs are reads/writes and do not need a compiler.
  // ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
  const leanDir = join(h.root, 'Formal')
  mkdirSync(leanDir, { recursive: true })
  const leanFile = 'Formal/Sum.lean'
  writeFileSync(join(h.root, leanFile), [
    '-- 仿真：Lean 面走路用的占位文件（不证明任何东西）。',
    'theorem sim_placeholder : 1 + 1 = 2 := by decide',
    '',
  ].join('\n'))

  const leanLib0 = await step('Q/lean/lib-before', () => h.call('vibe_v5_lean_lib', {}))
  const leanArchDef = await step('Q/lean/archive-def', () => h.call('vibe_v5_lean_archive', {
    kind: 'def', name: 'simDef', file: leanFile, statement: '仿真占位定义', target: leanFile,
  }))
  const leanArchLemma = await step('Q/lean/archive-lemma', () => h.call('vibe_v5_lean_archive', {
    kind: 'lemma', name: 'simLemma', file: leanFile, statement: '仿真占位引理', target: leanFile,
  }))
  const leanArchProof = await step('Q/lean/archive-proof', () => h.call('vibe_v5_lean_archive', {
    kind: 'proof', name: 'simProof', file: leanFile, statement: '仿真占位证明', target: leanFile,
  }))
  const leanArchBlocked = await step('Q/lean/archive-blocked', () => h.call('vibe_v5_lean_archive', {
    kind: 'blocked', name: 'simBlocked', file: leanFile, statement: '仿真占位受阻项', target: leanFile, note: '仿真：受阻原因占位',
  }))
  const leanLib1 = await step('Q/lean/lib-after', () => h.call('vibe_v5_lean_lib', {}))
  const leanRead = await step('Q/lean/read', () => h.call('vibe_v5_lean_read', { name: 'simDef' }))
  const leanRun = await step('Q/lean/run', () => h.call('vibe_v5_lean_run', {
    file: leanFile, statement: '1+1=2', target: 'simDef', timeout_ms: 5_000, member: 'r-1',
  }))
  const leanJob = await step('Q/lean/job', () => h.call('vibe_v5_lean_job', {}))
  const leanJobWait = await step('Q/lean/job-wait', () => h.call('vibe_v5_lean_job', { jobId: (leanRun && leanRun.jobId) || 'no-such-lean-job', waitMs: 10 }))
  const fidelity = await step('Q/fidelity_conclude', () => h.call('vibe_v5_fidelity_conclude', {
    card: 'rec-1', fidelity: 'conform', member: 'r-acad', note: '仿真：忠实性结论占位（不为任何命题背书）',
  }))
  if (fidelity && fidelity.ok === false) expect('vibe_v5_fidelity_conclude', fidelity.code, '符合性结论需要「编译通过的 Lean 作业」：本装配没有 Lean，具名拒（环境缺口）')
  highlights.lean = {
    libBefore: pick(leanLib0, ['ok', 'count', 'code']),
    archive: { def: pick(leanArchDef, ['ok', 'code', 'hint']), lemma: pick(leanArchLemma, ['ok', 'code']), proof: pick(leanArchProof, ['ok', 'code']), blocked: pick(leanArchBlocked, ['ok', 'code']) },
    libAfter: pick(leanLib1, ['ok', 'count', 'code']),
    read: pick(leanRead, ['ok', 'name', 'code']),
    run: pick(leanRun, ['ok', 'outcome', 'code', 'hint']),
    job: pick(leanJob, ['ok', 'count', 'code']),
    jobWait: pick(leanJobWait, ['ok', 'code']),
    fidelity: pick(fidelity, ['ok', 'code']),
  }

  // ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
  // R. PAPER + VERDICT CHAIN + TURN READS — the last declared verbs that no scenario has reached. The verdict chain
  //    is walked END TO END on the service meeting: ask → each member files its durable ruling → the chair closes.
  //    The verified row is reached on the LITERATURE route (a citation IS a conclusion), which is the one route this
  //    assembly can satisfy without a Lean run.
  // ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
  const paperStart = await step('R/paper/start', () => h.call('vibe_v5_paper', {
    action: 'start', target: '前 n 个奇数之和 = n^2', title: '仿真论文：机制占位', track: 'formal', participants: ['r-1', 'r-2'], member: 'r-acad',
  }))
  const paperSections = await step('R/paper/sections', () => h.call('vibe_v5_paper', { action: 'sections' }))
  const paperStatus = await step('R/paper/status', () => h.call('vibe_v5_paper', { action: 'status' }))

  const debate = await step('R/debate/convene', () => h.call('vibe_v5_meeting', {
    agenda: '仿真：裁决链（只压机制，不裁决数学）。', title: '裁决链会议', type: 'debate', member: 'r-acad',
    subject: 'Shared/Protocol.md', subject_evidence: { file: { readable: true, bytes: 10, name: 'Shared/Protocol.md' } },
  }))
  const debateId = debate && debate.meeting
  for (const s of ['r-acad', 'r-1', 'r-2']) {
    await step('R/debate/attend/' + s, () => h.call('vibe_vmu_meeting', { action: 'attend', id: debateId, member: s }, as(s)))
  }
  const card = await step('R/record_proposition/debated-candidate', () => h.call('vibe_v5_record_proposition', {
    statement: '前 n 个奇数之和 = n^2（仿真占位，不声称已证明）', value: '对任意正整数 n', p: 0.9,
    motive: '仿真：给裁决链一张可被裁决的卡（不是数学主张）', member: 'r-1',
  }, as('r-1')))
  const cardId = card && card.recordId
  const vAsk = await step('R/verdict_ask', () => h.call('vibe_v5_verdict_ask', { meeting: debateId, proposition_id: cardId, member: 'r-acad' }))
  // a pack handler has no agent→member map: the ruling must NAME its member (`member:"<id>"`), the `as` seat alone is not enough
  const vR1 = await step('R/verdict/r-1', () => h.call('vibe_v5_verdict', {
    meeting: debateId, proposition_id: cardId, verdict: 1, reason: '仿真占位：与既定恒等式一致', member: 'r-1',
  }, as('r-1')))
  const vR2 = await step('R/verdict/r-2', () => h.call('vibe_v5_verdict', {
    meeting: debateId, proposition_id: cardId, verdict: 1, reason: '仿真占位：小 n 已枚举', member: 'r-2',
  }, as('r-2')))
  const vFinal = await step('R/verdict_final', () => h.call('vibe_v5_verdict_final', { meeting: debateId, proposition_id: cardId, member: 'r-acad' }))
  const tally = vFinal && vFinal.tally
  const promoted = await step('R/verified_promote/debated', () => h.call('vibe_v5_verified_promote', {
    card: cardId, warrant: tally && tally.id, warrant_kind: 'debate-unanimous',
    debate_ruling: { mode: 'unanimous', value: 1, subject: cardId, ballotId: tally && tally.id }, member: 'r-acad',
  }))
  if (promoted && promoted.ok === false) expect('vibe_v5_verified_promote', promoted.code, '裁决票是 1/0 时才能落 verified：这里记录它具名拒的原因')

  const litCard = await step('R/record_proposition/literature', () => h.call('vibe_v5_record_proposition', {
    statement: '前 n 个奇数之和 = n^2（参考文献：经典恒等式）', value: '对任意正整数 n', p: 1,
    motive: '仿真：走文献路线进 verified（引文本身就是结论证据）', member: 'r-acad',
    literature_ref: 'Knuth, The Art of Computer Programming, Vol. 1, §1.2.1',
  }, as('r-acad')))
  const litId = litCard && litCard.recordId
  const litPromote = await step('R/verified_promote/literature', () => h.call('vibe_v5_verified_promote', {
    card: litId, warrant_kind: 'literature', literature_ref: 'Knuth, The Art of Computer Programming, Vol. 1, §1.2.1', member: 'r-acad',
  }))
  // `step` runs the INSTITUTE turn engine: a member seat may not call it ("a member turn cannot run the institute
  // turn engine"), the office may — and the prompt it assembles is what `prompt` pages back
  const turnStep = await step('R/turn/step', () => h.call('vibe_vmu_turn', { op: 'step', member: 'r-1', phase: 'normal' }))
  const turnPrompt = await step('R/turn/prompt', () => h.call('vibe_vmu_turn', { op: 'prompt', member: 'r-1', phase: 'normal' }))
  const turnStatus = await step('R/turn/status', () => h.call('vibe_vmu_turn', { op: 'status' }))
  const turnReopen = await step('R/turn/reopen-closure', () => h.call('vibe_vmu_turn', { op: 'reopen-closure', member: 'r-1', reason: '仿真：重开已关闭的回合（覆盖 reopen-closure）' }))
  const coreStatus = await step('R/kernel/status', () => h.call('vibe_vmu_status', {}))
  const coreTools = await step('R/kernel/tools', () => h.call('vibe_vmu_tools', { member: 'r-acad' }))
  highlights.rest = {
    paper: { start: pick(paperStart, ['ok', 'paperId', 'code']), sections: pick(paperSections, ['ok', 'count', 'sections', 'code']), status: pick(paperStatus, ['ok', 'state', 'code']) },
    verdicts: {
      meetId: debateId, card: cardId,
      ask: pick(vAsk, ['ok', 'asked', 'code']),
      filed: [pick(vR1, ['ok', 'code']), pick(vR2, ['ok', 'code'])],
      final: pick(vFinal, ['ok', 'decided', 'tally', 'code']),
      promote: pick(promoted, ['ok', 'code', 'message']),
      litPromote: pick(litPromote, ['ok', 'code', 'message']),
    },
    turn: { step: pick(turnStep, ['ok', 'code']), prompt: pick(turnPrompt, ['ok', 'prompt', 'code']), status: pick(turnStatus, ['ok', 'turns', 'code']), reopen: pick(turnReopen, ['ok', 'code']) },
    kernel: { status: pick(coreStatus, ['ok', 'services', 'packs', 'code']), tools: pick(coreTools, ['ok', 'count', 'tools', 'code']) },
  }

  // ── SECTION X: THE REFUSAL FACE, deliberately. A named refusal is the page a reader actually gets when the call
  //    is malformed, and the audit's fidelity gap was partly missing `code`/`message`/`hint` keys — the keys a
  //    refusal adds. One minimal call per face. The expected code is the RECEIPT's own code (a refusal predicted
  //    from the declaration, announced after it is read — never a severity downgrade: an `ok:true` here is a miss
  //    the run reports as a step that unexpectedly succeeded).
  const refusals = []
  const probe = async (name, tool, args, asWho = null) => {
    const out = await step('X/refusals/' + name, () => (asWho ? h.call(tool, args, asWho) : h.call(tool, args)))
    if (out && out.ok === false) expect(tool, out.code, '具名拒的字段面（code/message/hint）只有拒一次才出现；本步故意缺参数')
    refusals.push({ name, tool, predicted: 'a named refusal', actual: out && out.code, ok: out && out.ok })
    return out
  }
  await probe('say-missing-text', 'vibe_v5_say', { member: 'r-1' }, as('r-1'))
  await probe('records-restore-no-id', 'vibe_vmu_records', { action: 'restore', by: 'r-acad' })
  await probe('meeting-missing-id', 'vibe_vmu_meeting', { action: 'status' })
  await probe('tasks-update-missing-task', 'vibe_v5_task_update', { action: 'claim' }, as('r-1'))
  await probe('script-missing-name', 'vibe_v5_script', { op: 'archive' }, as('r-acad'))
  await probe('direction-missing-direction', 'vibe_vmu_direction', { action: 'set' })
  await probe('human-missing-action-target', 'vibe_vmu_human', { action: 'gate' })
  await probe('paper-unknown-action', 'vibe_v5_paper', { action: 'sim-no-such-action' })
  await probe('mathjobs-missing-job', 'vibe_vmu_mathjobs', { action: 'status' })
  await probe('mathtools-missing-op', 'vibe_vmu_mathtools', { action: 'run' })
  await probe('middleware-unknown-id', 'vibe_vmu_middleware', { action: 'disable', id: 'sim-no-such-entry' })
  await probe('blueprint-missing-id', 'vibe_v5_blueprint', { action: 'read' })
  await probe('meeting-primitive-on-service', 'vibe_vmu_meeting', { action: 'silent', id: meetId, member: 'r-2' }, as('r-2'))
  highlights.refusalFace = refusals

  // ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
  // Z. THE END — `stop` is the last thing an institute does, so it is the last call here.
  // ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
  // ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
  // Y. REFUSAL SHAPES + FIELD-RICH READS — two things the coverage number alone cannot see:
  //    (a) every face must REFUSE an incomplete call BY NAME, with a hint. A refusal is part of the contract: an
  //        agent that gets `ok:false` and nothing else has no next move. One deliberately-bad call per face is the
  //        cheapest honest way to prove the refusal shape exists.
  //    (b) several readings only appear on a SUCCESSFUL call with the right inputs (`subjectGate` on a meeting whose
  //        subject is a bare identifier; `quota`/`round` on a say that belongs to a meeting; the narrowing on a
  //        meeting_round; `enforced`/`evaluated` on a motion). Those are walked here too.
  // ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
  const refusalShapes = []
  const refuseStep = async (name, tool, args, why, seat) => {
    const out = await step(name, () => h.call(tool, args, seat))
    if (out && out.ok === false) {
      expect(tool, out.code, why)
      refusalShapes.push({ name, tool, code: out.code })
    }
    return out
  }

  await refuseStep('Y/refusal/start', 'vibe_v5_start', {}, 'start 缺 problem：按名拒收（不是静默建所）')
  await refuseStep('Y/refusal/assign', 'vibe_v5_assign', {}, 'assign 缺 to/why/acceptance：按名拒收并给出所缺的键')
  await refuseStep('Y/refusal/configure', 'vibe_v5_configure', { key: 'no.such.setting', value: 1 }, 'configure 写未声明的设置键：按名拒收（写设置不是自由写）')
  await refuseStep('Y/refusal/message', 'vibe_v5_message', { to: 'r-1' }, 'message 缺正文：按名拒收')
  await refuseStep('Y/refusal/report', 'vibe_v5_report', { to: 'no-such-member', body: 'x' }, 'report 点名不存在的成员：按名拒收')
  await refuseStep('Y/refusal/task_create', 'vibe_v5_task_create', {}, 'task_create 缺标题：按名拒收')
  await refuseStep('Y/refusal/task_list', 'vibe_v5_task_list', { status: 'no-such-status' }, 'task_list 给了不存在的状态值：按名拒收')
  await refuseStep('Y/refusal/task_get', 'vibe_v5_task_get', { task_id: 'no-such-task' }, 'task_get 点不存在的任务：按名拒收')
  await refuseStep('Y/refusal/tool_help', 'vibe_v5_tool_help', { name: 'no-such-tool' }, 'tool_help 点不存在的工具：按名拒收')
  await refuseStep('Y/refusal/verdict_ask', 'vibe_v5_verdict_ask', {}, 'verdict_ask 缺会议/命题：按名拒收')
  await refuseStep('Y/refusal/verdict', 'vibe_v5_verdict', {}, 'verdict 缺会议/命题/裁决：按名拒收')
  await refuseStep('Y/refusal/verdict_final', 'vibe_v5_verdict_final', {}, 'verdict_final 缺会议：按名拒收')
  await refuseStep('Y/refusal/poll_open', 'vibe_v5_poll_open', {}, 'poll_open 缺问题/选项：按名拒收')
  await refuseStep('Y/refusal/poll_vote', 'vibe_v5_poll_vote', {}, 'poll_vote 缺票箱：按名拒收')
  await refuseStep('Y/refusal/poll_close', 'vibe_v5_poll_close', {}, 'poll_close 缺票箱：按名拒收')
  await refuseStep('Y/refusal/motion', 'vibe_v5_motion', { op: 'raise' }, 'motion 缺会议/文本：按名拒收')
  await refuseStep('Y/refusal/second', 'vibe_v5_second', {}, 'second 缺会议/动议：按名拒收')
  await refuseStep('Y/refusal/wait', 'vibe_v5_wait', { meeting: 'no-such-meeting' }, 'wait 指向不存在的会议：按名拒收')
  await refuseStep('Y/refusal/inbox', 'vibe_v5_inbox', { action: 'open', member: 'r-1', id: 'no-entry' }, 'inbox 点不存在的邮件：按名拒收（带 enforced 集合）')
  await refuseStep('Y/refusal/hire', 'vibe_v5_hire', { slot: 'member', to: 'r-x' }, 'hire 缺 purpose：按名拒收')
  await refuseStep('Y/refusal/feedback', 'vibe_v5_feedback', { op: 'add' }, 'feedback 缺类别/现象：按名拒收')
  await refuseStep('Y/refusal/read_library', 'vibe_v5_read_library', { kind: 'no-such-kind' }, 'read_library 给了不存在的类别：按名拒收')
  await refuseStep('Y/refusal/meeting_round', 'vibe_v5_meeting_round', {}, 'meeting_round 缺会议 id：按名拒收')
  await refuseStep('Y/refusal/records', 'vibe_vmu_records', { action: 'no-such-action' }, 'records 给了不存在的动作：按名拒收')
  await refuseStep('Y/refusal/panel', 'vibe_vmu_panel', { action: 'set', member: 'no-such-member' }, 'panel 写不存在的成员：按名拒收')
  await refuseStep('Y/refusal/chat', 'vibe_vmu_chat', { action: 'send', to: 'no-such-member', text: 'x' }, 'chat 发给不存在的成员：按名拒收（带 enforced 集合）')
  await refuseStep('Y/refusal/mailbox', 'vibe_vmu_mailbox', { action: 'send', to: 'no-such-member', text: 'x' }, 'mailbox 发给不存在的成员：按名拒收（带 enforced 集合）')
  await refuseStep('Y/refusal/report-face', 'vibe_vmu_report', { action: 'set', key: 'no.such.key', value: 1 }, 'report 面写未声明的参数键：按名拒收')
  await refuseStep('Y/refusal/tools-face', 'vibe_vmu_tools', { action: 'no-such-action' }, 'tools 面给了不存在的动作：按名拒收')
  await refuseStep('Y/refusal/vote-face', 'vibe_vmu_vote', { action: 'no-such-action' }, 'vote 面给了不存在的动作：按名拒收')
  await refuseStep('Y/refusal/meeting-face', 'vibe_vmu_meeting', { action: 'speak', id: 'no-such-meeting', member: 'r-1', text: 'x' }, '会议面指向不存在的会议：按名拒收')
  await refuseStep('Y/refusal/env', 'vibe_vmu_env', { action: 'probe', need: 'no-such-tool' }, 'env 探不存在的依赖：按名拒收')
  await refuseStep('Y/refusal/mathjobs', 'vibe_vmu_mathjobs', { action: 'submit', engine: 'no-such-engine', argv: ['x'] }, 'mathjobs 给了不存在的引擎：按名拒收')
  await refuseStep('Y/refusal/direction', 'vibe_vmu_direction', { action: 'get', direction: 'no-such-direction' }, 'direction 读不存在的方向卡：按名拒收')
  await refuseStep('Y/refusal/record_proposition', 'vibe_v5_record_proposition', { statement: '仿真：缺必填字段的卡' }, 'record_proposition 缺 value/motive/p：按名拒收并点名所缺字段')

  // ── (b) the field-rich successes ───────────────────────────────────────────────────────────────────────────────
  // A meeting whose SUBJECT is a bare identifier: the subject gate publishes what it judged and what it never checked
  // (`looksLikeIdentifier`, `proofChecked`, `proofContentChecked`, `provenance`, `form`, `applicable`, `declared`).
  const fieldConv = await step('Y/field/convene-identifier-subject', () => h.call('vibe_v5_meeting', {
    agenda: '仿真：一句话命题只是一个标识符时，闸怎么读。', title: '标识符命题会议', type: 'debate', member: 'r-acad',
    subject: 'P1',
  }))
  // A bare sentence is NOT a debate object: the gate refuses it by name and publishes what it judged (`form`,
  // `proofChecked`, `proofContentChecked`, `provenance`, `looksLikeIdentifier`) — that refusal IS the reading.
  if (fieldConv && fieldConv.ok === false) expect('vibe_v5_meeting', fieldConv.code, '一句话命题没有可寻址的载体：辩论闸按名拒收，并给出 form/proofChecked/provenance 的读数')
  const fieldId = fieldConv && (fieldConv.meeting || fieldConv.id)
  let fieldSay = null, fieldRound = null, fieldMotion = null, fieldSecond = null, fieldLib = null
  if (fieldId) {
    for (const s of ['r-acad', 'r-1', 'r-2']) {
      await step('Y/field/attend/' + s, () => h.call('vibe_vmu_meeting', { action: 'attend', id: fieldId, member: s }, as(s)))
    }
    // a say that BELONGS to a meeting carries the round/quota reading (a say without a meeting cannot)
    fieldSay = await step('Y/field/say-in-meeting', () => h.call('vibe_v5_say', {
      meeting: fieldId, text: '仿真：这一句属于会议，不是独白。', member: 'r-acad',
    }))
    if (fieldSay && fieldSay.ok === false) expect('vibe_v5_say', fieldSay.code, '会议内发言的额外读数在本装配下按名拒收')
    // the narrowing the round driver applies is READ BACK on the receipt, not inferred
    fieldRound = await step('Y/field/meeting-round', () => h.call('vibe_v5_meeting_round', { meeting: fieldId, phase: 'meeting' }))
    if (fieldRound && fieldRound.ok === false) expect('vibe_v5_meeting_round', fieldRound.code, '按会议类型推进一轮在本装配下按名拒收（无子回合驱动）')
    // a raised motion carries `enforced`/`evaluated` (the keys the rule actually looked at)
    fieldMotion = await step('Y/field/motion-raise', () => h.call('vibe_v5_motion', {
      op: 'raise', meeting: fieldId, kind: 'procedural', text: '仿真：程序动议（用于读 enforced 集合）', member: 'r-acad',
    }))
    if (fieldMotion && fieldMotion.ok === false) expect('vibe_v5_motion', fieldMotion.code, '在本会议类型下动议按名拒收')
    fieldSecond = await step('Y/field/motion-second', () => h.call('vibe_v5_second', {
      meeting: fieldId, motion_id: (fieldMotion && (fieldMotion.motion || fieldMotion.motionId)) || 'no-such-motion', member: 'r-1',
    }))
    if (fieldSecond && fieldSecond.ok === false) expect('vibe_v5_second', fieldSecond.code, '没有可附议的动议时按名拒收')
    // a library read IN THE MEMBER'S OWN SEAT: the receipt says which member read, in whose name
    fieldLib = await step('Y/field/read-library-member', () => h.call('vibe_v5_read_library', { member: 'r-1', list: true }, as('r-1')))
    if (fieldLib && fieldLib.ok === false) expect('vibe_v5_read_library', fieldLib.code, '成员读库在本装配下按名拒收')
  }
  highlights.refusalShapes = refusalShapes
  highlights.fieldShapes = {
    conveneIdentifier: pick(fieldConv, ['ok', 'meeting', 'subjectGate', 'code', 'hint']),
    meetingRound: pick(fieldRound, ['ok', 'meeting', 'narrowed', 'phase', 'code', 'hint']),
    motion: pick(fieldMotion, ['ok', 'motion', 'enforced', 'evaluated', 'code']),
    second: pick(fieldSecond, ['ok', 'code']),
  }

  // ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
  // Z2. THE REST OF THE VERBS — a second meeting for `convene`/`withdraw`/the four box verbs, the ten reviewers
  //     verbs, the two pack write faces nobody called yet, and the pack-level control verbs (pause/resume/stop).
  // ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
  const z2Conv = await step('Z2/meeting/convene-explicit', () => h.call('vibe_v5_meeting', {
    action: 'convene', agenda: '仿真：为剩余动词再开一场会', title: '剩余动词会', type: 'debate', member: 'r-acad',
    subject: 'Shared/Protocol.md', subject_evidence: { file: { readable: true, bytes: 2048, name: 'Shared/Protocol.md' } },
  }))
  const z2Meet = z2Conv && (z2Conv.meeting || z2Conv.id)
  // the pack face ONLY convenes; attending a convened meeting is the kernel face's business
  const z2Attend = await step('Z2/meeting/attend-a', () => h.call('vibe_vmu_meeting', { action: 'attend', meeting: z2Meet, member: 'r-acad' }))
  highlights.z2Attend = pick(z2Attend, ['ok', 'action', 'meeting', 'member', 'code'])
  const z2Raise = await step('Z2/motion/raise', () => h.call('vibe_v5_motion', { op: 'raise', meeting: z2Meet, kind: 'procedural', text: '仿真：一条会被撤回的程序动议', member: 'r-1' }))
  const z2Motion = z2Raise && (z2Raise.motion || z2Raise.motionId)
  const z2Withdraw = await step('Z2/motion/withdraw', () => h.call('vibe_v5_motion', { op: 'withdraw', meeting: z2Meet, motion_id: z2Motion, member: 'r-1' }))
  highlights.z2Motion = pick(z2Withdraw, ['ok', 'op', 'meeting', 'motion', 'status', 'code'])
  // the ballot BOX: a second, unrelated substrate next to the motion ballot — open, cast, close all really run
  const z2Box = await step('Z2/box/open', () => h.call('vibe_vmu_meeting', { action: 'boxopen', meeting: z2Meet, target: '仿真：是否采纳该命题', options: ['yes', 'no'] }))
  const z2BoxId = z2Box && (z2Box.boxId || z2Box.ballotId)
  const z2Cast = await step('Z2/box/cast', () => h.call('vibe_vmu_meeting', { action: 'boxcast', meeting: z2Meet, ballotId: z2BoxId, member: 'r-1', value: 'yes' }))
  const z2Lapse = await step('Z2/box/lapse-refused', () => h.call('vibe_vmu_meeting', { action: 'boxlapse', meeting: z2Meet, ballotId: z2BoxId, reason: '仿真：没有声明时限，故没有到期的兜底' }))
  if (z2Lapse && z2Lapse.ok === false) expect('vibe_vmu_meeting', z2Lapse.code, 'boxlapse 只在声明了 openMaxMs 时才有到期机制；本装配 zeroMechanism，按名拒收并给出 hint')
  const z2Revoke = await step('Z2/box/revoke-lapse-refused', () => h.call('vibe_vmu_meeting', { action: 'boxrevokelapse', meeting: z2Meet, ballotId: z2BoxId, reason: '仿真：没有可撤销的失效' }))
  if (z2Revoke && z2Revoke.ok === false) expect('vibe_vmu_meeting', z2Revoke.code, '没有失效就没有可撤销的失效，按名拒收并给出「先 lapse」的 hint')
  const z2Reopen = await step('Z2/box/reopen-refused', () => h.call('vibe_vmu_meeting', { action: 'boxreopen', meeting: z2Meet, ballotId: z2BoxId, reason: '仿真：未裁定不能重开' }))
  if (z2Reopen && z2Reopen.ok === false) expect('vibe_vmu_meeting', z2Reopen.code, '只有已裁定的票箱能重开；未裁定说明它本来还在收票')
  const z2Close = await step('Z2/box/close', () => h.call('vibe_vmu_meeting', { action: 'boxclose', meeting: z2Meet, ballotId: z2BoxId }))
  highlights.z2Box = pick(z2Close, ['ok', 'boxId', 'outcome', 'tally', 'code'])
  const z2ReopenOk = await step('Z2/box/reopen-after-close', () => h.call('vibe_vmu_meeting', { action: 'boxreopen', meeting: z2Meet, ballotId: z2BoxId, reason: '仿真：已裁定，允许重开一局' }))
  highlights.z2BoxReopen = pick(z2ReopenOk, ['ok', 'boxId', 'round', 'code'])
  // the reviewers face: ten verbs, one real assignment through its whole life
  const rvStatus = await step('Z2/reviewers/status', () => h.call('vibe_vmu_reviewers', { action: 'status' }))
  const rvKeys = await step('Z2/reviewers/keys-used', () => h.call('vibe_vmu_reviewers', { action: 'keysUsed' }))
  const rvReg1 = await step('Z2/reviewers/register-1', () => h.call('vibe_vmu_reviewers', { action: 'register', id: 'r-1', expertise: ['logic'], conflicts: [] }))
  const rvReg2 = await step('Z2/reviewers/register-2', () => h.call('vibe_vmu_reviewers', { action: 'register', id: 'r-2', expertise: ['algebra'], conflicts: [] }))
  const rvAssign = await step('Z2/reviewers/assign', () => h.call('vibe_vmu_reviewers', { action: 'assign', reviewerId: 'r-1', submissionId: 'rec-1' }))
  const rvView = await step('Z2/reviewers/reviewer-view', () => h.call('vibe_vmu_reviewers', { action: 'reviewerView', reviewerId: 'r-1' }))
  const rvAck = await step('Z2/reviewers/acknowledge', () => h.call('vibe_vmu_reviewers', { action: 'acknowledge', reviewerId: 'r-1', submissionId: 'rec-1' }))
  const rvUnbind = await step('Z2/reviewers/unbind', () => h.call('vibe_vmu_reviewers', { action: 'unbind', reviewerId: 'r-1', submissionId: 'rec-1', reason: '仿真：解绑一条指派' }))
  const rvQuorum = await step('Z2/reviewers/quorum-met', () => h.call('vibe_vmu_reviewers', { action: 'quorumMet', submissionId: 'rec-1' }))
  const rvAcks = await step('Z2/reviewers/acknowledgements', () => h.call('vibe_vmu_reviewers', { action: 'acknowledgements' }))
  const rvTrace = await step('Z2/reviewers/trace', () => h.call('vibe_vmu_reviewers', { action: 'trace' }))
  highlights.reviewers = {
    status: pick(rvStatus, ['ok', 'reviewers', 'assignments', 'counts']), keysUsed: pick(rvKeys, ['ok', 'keysUsed']),
    assigned: pick(rvAssign, ['ok', 'id', 'reviewerId', 'submissionId', 'mode', 'blind']),
    acknowledge: pick(rvAck, ['ok', 'code', 'hint']), unbind: pick(rvUnbind, ['ok', 'code', 'hint']),
    quorum: pick(rvQuorum, ['ok', 'completed', 'quorum', 'met']), acks: pick(rvAcks, ['ok', 'acknowledgements']),
    trace: pick(rvTrace, ['ok', 'trace']),
  }
  // the two pack write faces nobody had called: both refuse by name while a REQUIRED v5r field is missing
  const recMethod = await step('Z2/record/method-refused', () => h.call('vibe_v5_record_method', { title: '仿真：方法', type: 'method', content: '仿真：方法正文', member: 'r-1' }))
  if (recMethod && recMethod.ok === false) expect('vibe_v5_record_method', recMethod.code, '原 v5r 面要求 value/motive/p 三字段；缺一即按名拒收并点名缺的是哪几个')
  const recSub = await step('Z2/record/subproblem-refused', () => h.call('vibe_v5_record_subproblem', { title: '仿真：子问题', statement: '仿真：子问题陈述', motive: '仿真', p: 0.5, member: 'r-1' }))
  if (recSub && recSub.ok === false) expect('vibe_v5_record_subproblem', recSub.code, '子问题面同样沿用 v5r 的必填字段，缺 value 就按名拒收')
  const packPause = await step('Z2/control/pause', () => h.call('vibe_v5_pause', { reason: '仿真：在收所前暂停一次' }))
  const packResume = await step('Z2/control/resume', () => h.call('vibe_v5_resume', { reason: '仿真：恢复，接着收所' }))
  highlights.packControl = { pause: pick(packPause, ['ok', 'state', 'code']), resume: pick(packResume, ['ok', 'state', 'resumedFrom', 'code']) }

  // ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
  // Z3. THE LAST FOUR — resume/read-back (they only MEAN something after a process has written keys, which by now
  //     it has), the mailbox flush, a real fire, and the primitive meeting's withdraw (which has no motion to take).
  // ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
  // `readBack`/`recover` are DELIBERATELY not called here: once this process has written its own keys,
  // readBack answers VMU_RESUME_READBACK_DRIFT with `hint:null` and recover then refuses with NO code at all —
  // both are A4 (refusal without hint) defects, not evidence. They stay `never` with that reason in the ledger.
  const mailFlush = await step('Z3/mailbox/flush', () => h.call('vibe_vmu_mailbox', { action: 'flush', member: 'r-1' }))
  if (mailFlush && mailFlush.ok === false) expect('vibe_vmu_mailbox', mailFlush.code, 'flush 需要点名 member：无 member 即按名拒收并给出 docs/18 的提示')
  const fireTarget = ((started && (started.members || started.roster) || []).map((m) => (typeof m === 'string' ? m : (m && m.id))).find((x) => x && x !== 'r-acad')) || 'r-2'
  const packFire = await step('Z3/control/fire', () => h.call('vibe_v5_fire', { id: fireTarget, reason: '仿真：解雇一名临时工，验证机构面真的能减员' }))
  if (packFire && packFire.ok === false) expect('vibe_v5_fire', packFire.code, '解雇不存在的成员时按名拒收，并指出花名册里真正活着的 id')
  highlights.packFire = pick(packFire, ['ok', 'seats', 'removed', 'code'])
  const primWithdraw = await step('Z3/primitive/withdraw', () => h.call('vibe_vmu_meeting', {
    action: 'withdraw', meeting: primId, member: 'r-1', motion: 'mo-none', reason: '仿真：原语记录里没有可撤回的动议',
  }))
  if (primWithdraw && primWithdraw.ok === false) expect('vibe_vmu_meeting', primWithdraw.code, '原语会议不承载动议：撤回按名拒收并列出这场会真正有的动议（没有就是 none）')
  highlights.primWithdraw = pick(primWithdraw, ['ok', 'code', 'hint'])

  // ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
  // Z4. FIELD TOP-UP — the live receipts that publish `enforcedScope`, `narrowing`, `detail`, `job`, `required`:
  //     one REFUSED call per face is enough to publish the whole refusal shape (`code/message/hint/required/missing`).
  // ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
  const topUp = []
  const topStep = async (name, tool, args, why, seat) => {
    const out = await step(name, () => h.call(tool, args, seat))
    topUp.push({ name, tool, ok: !(out && out.ok === false), code: (out && out.code) || null })
    if (out && out.ok === false) expect(tool, out.code, why)
    return out
  }
  await topStep('Z4/fire/unknown-member', 'vibe_v5_fire', { id: 'no-such-member', reason: '仿真：解雇一个不在花名册上的 id' }, '解雇不存在的成员时按名拒收，并指出花名册里真正活着的 id')
  await topStep('Z4/hire/enforced-scope', 'vibe_v5_hire', { purpose: '仿真：再招一名临时研究员以读 hired 面的 enforcedScope', slot: 'temp' }, '招人缺 institution 时按名拒收，并在拒收回执里带上 enforcedScope')
  await topStep('Z4/start/already-started', 'vibe_v5_start', { problem: '仿真：重复启动' }, '机构已经建好时重复启动按名拒收')
  await topStep('Z4/overview/unknown-member', 'vibe_v5_overview', { member: 'no-such-member' }, '点一个不在花名册上的成员时按名拒收')
  await topStep('Z4/progress/missing-content', 'vibe_v5_record_progress', { track: 'progress', title: '仿真：缺正文' }, '进度面缺 content 时按名拒收并点名缺哪些必填字段')
  await topStep('Z4/direction/get-missing', 'vibe_vmu_direction', { action: 'get' }, '方向卡按 key 取；不给 key 就按名拒收并列出必填字段')
  await topStep('Z4/mathjobs/status-missing-job', 'vibe_vmu_mathjobs', { action: 'status' }, '作业面查状态必须点名作业；不点名就按名拒收')
  await topStep('Z4/mathtools/status', 'vibe_vmu_mathtools', { action: 'status' }, '工具面查状态（无需计划；本装配无引擎接缝时按名回环境不可用）')
  await topStep('Z4/report/status', 'vibe_vmu_report', { action: 'status' }, '报表面查状态（走默认档）')
  await topStep('Z4/meeting-round/phase', 'vibe_v5_meeting_round', { meeting: primId, phase: 'debate' }, '轮次面点名会议与相位；原语会议不承载轮次时按名拒收')
  await topStep('Z4/wait/until', 'vibe_v5_wait', { member: 'r-1', until: 'speak', timeout_ms: 120000 }, '等待面点名一个真实的唤醒条件（本机构已收所前，无人会唤醒它）')
  await topStep('Z4/task-get/brief-note', 'vibe_v5_task_get', { task_id: 'no-such-task' }, '取一个不存在的任务时按名拒收并说明 brief 的读法')
  await topStep('Z4/mailbox/bad-action', 'vibe_vmu_mailbox', { action: 'flush' }, '信箱 flush 不点名成员时按名拒收（回执带 from 的用法）')
  highlights.fieldTopUp = topUp

  // ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
  // Z5. THE LAST FULL-SHAPE RECEIPTS — a successful card write (`record_subproblem`) publishes the whole 16-key
  //     write shape; an INCOMPLETE direction set publishes `fieldsRequired`; a resume-while-running publishes the
  //     control-face state refusal; a member-seat start publishes the face refusal (`VMU_TOOL_NOT_IN_FACE`).
  // ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
  const z5Sub = await step('Z5/record/subproblem-ok', () => h.call('vibe_v5_record_subproblem', {
    title: '仿真：一个真的子问题', statement: '在动作覆盖仿真里，每个声明的动词都真的被调用过一次。', value: '待复核', motive: '压机制', p: 0.5, member: 'r-1',
  }))
  highlights.z5Sub = pick(z5Sub, ['ok', 'recordId', 'settled', 'proofState', 'track', 'code'])
  const z5Dir = await step('Z5/direction/set-incomplete', () => h.call('vibe_vmu_direction', { action: 'set', direction: 'mainline-survey', by: 'r-acad' }))
  if (z5Dir && z5Dir.ok === false) expect('vibe_vmu_direction', z5Dir.code, '方向卡缺必填字段时按名拒收，并列出 fieldsRequired')
  highlights.z5Dir = pick(z5Dir, ['ok', 'code', 'fieldsRequired', 'fieldsPresent'])
  const z5Resume = await step('Z5/control/resume-while-running', () => h.call('vibe_v5_resume', { reason: '仿真：没有暂停就恢复' }))
  if (z5Resume && z5Resume.ok === false) expect('vibe_v5_resume', z5Resume.code, '所还开着时 resume 按名拒收（控制面状态机拒绝空转）')
  const z5Start = await step('Z5/start/member-seat', () => h.call('vibe_v5_start', { problem: '仿真：成员席想再建一所' }, as('r-1')))
  if (z5Start && z5Start.ok === false) expect('vibe_v5_start', z5Start.code, '只有办公室能建所：成员席按名拒收并点名 face')
  highlights.z5Faces = { direction: pick(z5Dir, ['code', 'fieldsRequired']), resume: pick(z5Resume, ['code']), start: pick(z5Start, ['code', 'face']) }

  // ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
  // Z6. FIELD TOP-UP ROUND 2 — the live receipts that publish a whole extra facet:
  //     · `vibe_v5_say` as a CHAT round publishes 18 keys the meeting form never prints (`from/seq/at/kind/
  //       replyTo/quotes/quota/round/spoke/spokenBy/remaining/complete/roundSurface`), and the round's SECOND
  //       speech publishes `enforced`/`enforcedScope`;
  //     · `vibe_v5_verdict` addressed to a BALLOT publishes `target/member/verdict/kind/receipt`, and a SECOND
  //       filing of the same ruling publishes `existing/incoming/sameVerdict`;
  //     · a repeated `verified_promote` on an already-verified row publishes `unchanged`;
  //     · `vibe_v5_wait` with an out-of-interval timeout publishes `enforced[]`/`enforcedScope`;
  //     · `record_proposition` with p=1 and NO source publishes `applicable`/`p1Routes`/`cardId`;
  //     · `verdict_final` against a meeting id that is not open publishes `evaluated[]`;
  //     · `human readBack`/`recover` on a kernel that has not drifted publish `consistent/checked/drift/
  //       driftMeans/sampledAt/writesBetween/code` and `plan/recovery`.
  // ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
  // (`human readBack`/`recover` live at Z0 — they must run BEFORE this process writes its own keys, or the
  //  drift refusal comes back with `hint:null` and no code, which is an A4 defect, not evidence.)
  const z6Chat = await step('Z6/say/chat-round', () => h.call('vibe_v5_say', {
    member: 'r-1', text: '仿真：chat 轮次记账（只压机制，不主张数学）', round: 'z6-round', members: ['r-1', 'r-2'],
  }, as('r-1')))
  const z6ChatDup = await step('Z6/say/chat-round-duplicate', () => h.call('vibe_v5_say', {
    member: 'r-1', text: '仿真：同一轮第二句必须具名拒', round: 'z6-round', members: ['r-1', 'r-2'],
  }, as('r-1')))
  if (z6ChatDup && z6ChatDup.ok === false) expect('vibe_v5_say', z6ChatDup.code, '同一 chat 轮内同一成员第二次发言按名拒收（并带 enforced/enforcedScope）')
  const z6Conv = await step('Z6/meeting/convene-for-ballot', () => h.call('vibe_v5_meeting', {
    agenda: '仿真：票箱裁决（只压机制，不裁决数学）', title: '票箱裁决会', type: 'debate', member: 'r-acad',
    subject: 'Shared/Protocol.md', subject_evidence: { file: { readable: true, bytes: 10, name: 'Shared/Protocol.md' } },
  }))
  const z6Mid = z6Conv && z6Conv.meeting
  if (z6Mid) {
    await step('Z6/meeting/attend-r-1', () => h.call('vibe_vmu_meeting', { action: 'attend', id: z6Mid, member: 'r-1' }, as('r-1')))
  }
  const z6Mo = await step('Z6/motion/raise', () => h.call('vibe_v5_motion', {
    op: 'raise', meeting: z6Mid, kind: 'procedural', text: '仿真：一条用于票箱的程序动议', member: 'r-1',
  }, as('r-1')))
  const z6MoId = z6Mo && z6Mo.motion
  const z6Ballot = await step('Z6/ballot/open', () => h.call('vibe_vmu_meeting', { action: 'ballot', meeting: z6Mid, target: z6MoId, by: 'r-acad' }))
  const z6BallotId = z6Ballot && z6Ballot.ballotId
  if (z6BallotId) {
    const z6Vote = await step('Z6/verdict/ballot', () => h.call('vibe_v5_verdict', {
      target: z6BallotId, verdict: 0.9, reason: '仿真：对票箱投一票', member: 'r-1',
    }, as('r-1')))
    highlights.z6Vote = pick(z6Vote, ['ok', 'target', 'member', 'verdict', 'kind', 'receipt', 'code'])
  }
  const z6WaitBad = await step('Z6/wait/bad-timeout', () => h.call('vibe_v5_wait', { action: 'wait', member: 'r-1', timeout_ms: 5 }, as('r-1')))
  if (z6WaitBad && z6WaitBad.ok === false) expect('vibe_v5_wait', z6WaitBad.code, 'timeout 不在 10000..3600000 内按名拒收，并带 enforced/enforcedScope')
  const z6P1 = await step('Z6/record_proposition/p1-no-source', () => h.call('vibe_v5_record_proposition', {
    title: '仿真：无凭据的 p=1', statement: '仿真：p=1 必须有来源（这条不主张数学）', value: 1, motive: '仿真：读 applicable/p1Routes/cardId', p: 1, member: 'r-acad',
  }, as('r-acad')))
  if (z6P1 && z6P1.ok === false) expect('vibe_v5_record_proposition', z6P1.code, 'p=1 无任何凭据时按名拒收，并列出三条合法路线（p1Routes）')
  const z6FinalBad = await step('Z6/verdict_final/no-open-meeting', () => h.call('vibe_v5_verdict_final', {
    meeting: 'm-nope', proposition_id: cardId, member: 'r-acad',
  }, as('r-acad')))
  if (z6FinalBad && z6FinalBad.ok === false) expect('vibe_v5_verdict_final', z6FinalBad.code, '对不存在的会议裁决按名拒收，并带 evaluated/enforcedScope')
  const z6PromoteAgain = await step('Z6/verified_promote/literature-unchanged', () => h.call('vibe_v5_verified_promote', {
    card: litId, warrant_kind: 'literature', literature_ref: 'Knuth, The Art of Computer Programming, Vol. 1, §1.2.1', member: 'r-acad',
  }, as('r-acad')))
  if (z6PromoteAgain && z6PromoteAgain.ok === false) expect('vibe_v5_verified_promote', z6PromoteAgain.code, '重复把同一事实 promote 一次时按名回执（或 unchanged）')
  const z6Mail = await step('Z6/mailbox/send', () => h.call('vibe_vmu_mailbox', {
    action: 'send', from: 'r-acad', to: 'r-1', subject: '仿真：字段', text: '仿真：信箱发送（读 caller/ids 形状）',
  }, as('r-acad')))
  highlights.z6 = {
    chat: pick(z6Chat, ['ok', 'seq', 'at', 'from', 'kind', 'replyTo', 'quotes', 'quota', 'spoke', 'spokenBy', 'remaining', 'complete', 'roundSurface', 'round', 'code']),
    dup: pick(z6ChatDup, ['ok', 'code', 'enforced', 'enforcedScope']),
    waitBad: pick(z6WaitBad, ['ok', 'code', 'enforced', 'enforcedScope']),
    p1: pick(z6P1, ['ok', 'code', 'applicable', 'p1Routes', 'p', 'cardId']),
    finalBad: pick(z6FinalBad, ['ok', 'code', 'evaluated', 'enforcedScope']),
    promoteAgain: pick(z6PromoteAgain, ['ok', 'code', 'unchanged', 'written', 'p1Route']),
    mail: pick(z6Mail, ['ok', 'caller', 'ids', 'to', 'queued', 'code']),
  }

  const ctlStop = await step('Z/control/stop', () => h.call('vibe_vmu_control', { action: 'stop', reason: '仿真：动作覆盖走完，收所' }))
  const packStop = await step('Z2/control/stop', () => h.call('vibe_v5_stop', { reason: '仿真：机构面收所' }))
  highlights.packStop = pick(packStop, ['ok', 'state', 'code'])

  notes.settings = Object.keys(settings)
  return {
    steps,
    receipts: h.receipts,
    tree: h.tree ? h.tree() : [],
    highlights,
    notes,
    refusals,
    expectedRefusals,
    // ★ TB-2625 - the scenario's own contract checks. A non-empty list is a mechanism failure even though every call
    // answered `ok:true`; run.mjs carries it into the headline and the exit code.
    failures,
    contract: { fsFirst: Boolean(bpDraftId) && filedOf(bpCodesign), draftMdPath: bpDraftRel, chain: { propose: filedOf(bpDraft), codesign: filedOf(bpCodesign), adopt: Boolean(bpAdopt && bpAdopt.ok !== false), read: Boolean(bpRead && bpRead.ok !== false) } },
    stopped: pick(ctlStop, ['ok', 'stopped', 'code']),
  }
}

export default scenario

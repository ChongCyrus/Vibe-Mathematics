// scripts/sim/scenarios/rules-extra.mjs — the 30 rules the other five scenarios never touched (RUN 240 / task-46).
//
// WHY THIS SCENARIO EXISTS
//   `scripts/sim/audit/all.mjs` reads `scripts/sim/audit/rule-steps.json` and asks: for every rule in
//   `docs/acceptance/rules-ledger.json`, is there a REAL scenario step that exercised it, with the right shape
//   (an `allow` step whose receipt was accepted, a `refuse` step whose receipt carries a named code)? After the five
//   original scenarios (mainline / meetings / paper / turns / comms) 63 of 93 rules had such a step; this scenario
//   drives the institute through the remaining 30 so the map stops being a plan and becomes a measurement.
//
// WHAT MAKES A STEP EVIDENCE (and what would not)
//   Every step below is a TOOL CALL on the real kernel through `scripts/sim/harness.mjs`; the corpus keeps the whole
//   receipt. A source-code pin (`read the file and assert a regex`) is NOT a step here, even where the mechanism is
//   undeniable in source: the audit's job is to show the rule biting at runtime, so where the assembly cannot produce
//   that (no Lean face, no spawn seam) the rule stays a MEASURED REFUSAL with the named code, and the report says so.
//
// THE SETTINGS ARE PART OF THE EVIDENCE
//   `vmu.human.gatedActions` defaults to [] (zero mechanism: nothing is gated). G3's gate is therefore only reachable
//   on a deployment that DECLARES the action it gates, so this scenario exports settings with one gated action
//   (`vmu.tasks.assign`) - nothing else in the scenario takes that path, so the gate stays a probe instead of
//   poisoning the rest of the run. `vmu.human.approvalTimeoutMs: 0` is the "waits for a human" default, which makes
//   the pending state mean what G3 says it means. `vmu.math.computation:'on'` gives G1 a real math face (the run
//   itself still needs a host subprocess seam, so its execution stays a NAMED environmental refusal).
//   `vmu.limits.maxLiveMembers: 6` keeps `vibe_v5_start {researcherCount:2}` off the live-member ceiling (the
//   scenario needs three seats: chair + two members + a temp).

import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { snapshotTree } from '../harness.mjs'

export const settings = {
  'vmu.math.computation': 'on',
  'vmu.limits.maxLiveMembers': 6,
  'vmu.human.gatedActions': ['vmu.tasks.assign'],
  'vmu.human.approvalTimeoutMs': 0,
}

export async function rulesExtra(h, { log = () => {} } = {}) {
  const steps = []
  const ledger = {}
  const members = (id) => ({ as: { agent: { id } } })
  const office = (id) => ({ as: { agent: { id: id || 'office' } } })
  // The OFFICE is a ROOT session, not a seat: a human decision (G3) may only be taken from the root caller, which the
  // kernel distinguishes from an agent that merely names itself "office" (that caller is refused VMU_HUMAN_CALLER_UNKNOWN).
  const root = () => ({ as: null })

  const files = () => snapshotTree(h.root).length
  const step = async (name, kind, fn) => {
    const before = files()
    let out
    try {
      out = await fn()
    } catch (e) {
      out = { ok: false, code: (e && e.code) || null, message: String((e && e.message) || e) }
    }
    const after = files()
    const row = { name, kind, ok: out && out.ok === true, code: (out && out.code) || null, files: { before, after } }
    steps.push(row)
    log(name + ': ' + (row.ok ? 'ok' : 'REFUSED ' + (row.code || '')))
    return out
  }
  const call = (tool, args, opts = office()) => h.call(tool, args, opts)

  // ── 0. Setup: an institute with a chair, two members, a temp worker, and files on disk ───────────────────────
  await step('setup-institute', 'setup', () => call('vibe_v5_start', { problem: '把 30 条未覆盖规则做成真步骤：真调工具、真具名拒', researcherCount: 2 }))
  await step('setup-proof-file', 'setup', async () => {
    // C6/C7/E27 need a proof that really resolves inside the member library: the card face checks `proof_ref`
    // against the workspace, so the file has to exist before the card names it.
    mkdirSync(join(h.root, 'Members', 'r-1', 'Propos'), { recursive: true })
    writeFileSync(join(h.root, 'Members', 'r-1', 'Propos', 'proof-odd.md'), '证：n≥1 时前 n 个奇数之和为 n²（归纳）。\n')
    mkdirSync(join(h.root, 'Lean'), { recursive: true })
    writeFileSync(join(h.root, 'Lean', 'OddSum.lean'), 'theorem odd_sum (n : Nat) : 2 * (List.range n).sum + n = n * n := by\n  simp\n')
    return { ok: true, code: null, files: ['Members/r-1/Propos/proof-odd.md', 'Lean/OddSum.lean'] }
  })

  // ── A3: settings are SET by name; an undeclared key is refused by name (not silently dropped) ────────────────
  await step('a3-set-declared-key', 'allow', () => call('vibe_v5_set', { key: 'vmu.turn.maxParallel', value: 4 }))
  await step('a3-set-undeclared-key', 'refuse', () => call('vibe_v5_set', { key: 'vmu.r240.not-a-real-key', value: 1 }))

  // ── A9 / A8 / A7: hiring needs a stated purpose; a temp's seat face excludes the card faces; fire is not dismissable ──
  await step('a9-hire-no-purpose', 'refuse', () => call('vibe_v5_hire', { to: 'temp-1', initial_task: '核对归纳步的边界' }, members('r-acad')))
  await step('a9-hire-with-purpose', 'allow', () => call('vibe_v5_hire', { to: 'temp-1', purpose: '并行核对两份证明，减轻常驻负担', initial_task: '核对归纳步的边界' }, members('r-acad')))
  await step('a8-temp-record-refused', 'refuse', () => call('vibe_v5_record_proposition', { id: 'prop-temp', title: '临时工越界', statement: 'x', p: 0.5, member: 'temp-1' }, members('temp-1')))

  // ── G3 (placed before the fire step: it assigns the temp's task, which has to still be open) ────────────────
  // `vmu.tasks.assign` is declared in `export const settings` above, which is the ONLY reason anything here queues:
  // an undeclared action runs untouched (zero mechanism). A gated action THROWS `VMU_HUMAN_APPROVAL_PENDING`
  // (queued, not run) until a human decides — and the SAME call then runs.
  await step('g3-assign-queued', 'refuse', () => call('vibe_vmu_task', { action: 'assign', id: 't-1', owner: 'r-2' }, members('r-acad')))
  const queue = await step('g3-approval-queue', 'allow', () => call('vibe_vmu_human', { action: 'queue' }, root()))
  const requestId = (queue && Array.isArray(queue.requests) && queue.requests[0] && (queue.requests[0].requestId || queue.requests[0].id)) || null
  ledger.approvalRequest = requestId
  ledger.approvalQueued = queue && queue.requests ? queue.requests.map((r) => ({ requestId: r.requestId, action: r.action, subject: r.subject, state: r.state })) : null
  await step('g3-approval-state', 'allow', () => call('vibe_vmu_human', { action: 'approvalState', request_id: requestId }, root()))
  await step('g3-approval-decide', 'allow', () => call('vibe_vmu_human', { action: 'decide', request_id: requestId, allow: true, by: 'office', reason: '用户同意把核对任务派给 r-2' }, root()))
  await step('g3-assign-allowed', 'allow', () => call('vibe_vmu_task', { action: 'assign', id: 't-1', owner: 'r-2' }, members('r-acad')))

  await step('a7-fire-temp', 'allow', () => call('vibe_v5_fire', { id: 'temp-1', reason: '本轮核对完成' }, members('r-acad')))
  await step('a7-fire-chair-refused', 'refuse', () => call('vibe_v5_fire', { id: 'r-acad', reason: '试图解雇院士' }, members('r-acad')))

  // ── C6: a proof registered complete LOCKS the card (a locked row cannot be rewritten) ───────────────────────
  await step('c6-card-proof-complete', 'allow', () => call('vibe_v5_record_proposition', {
    id: 'prop-proof', title: '前 n 个奇数之和等于 n 的平方', statement: '对 n≥1 成立', value: 'n²', motive: '对 n 归纳',
    p: 0.95, proof_ref: 'Members/r-1/Propos/proof-odd.md', proof_state: 'complete', member: 'r-1',
  }, members('r-1')))
  await step('c6-card-locked-rewrite', 'refuse', () => call('vibe_v5_record_proposition', {
    id: 'prop-proof', statement: '另一说法', p: 0.9, member: 'r-1',
  }, members('r-1')))

  // ── C7: a debate's subject must carry a written proof (a bare statement is refused by name) ─────────────────
  await step('c7-unproven-card', 'allow', () => call('vibe_v5_record_proposition', {
    id: 'prop-bare', title: '未附证明的猜想', statement: '对 n≥1 成立', value: 'n²', motive: '直觉', p: 0.9, member: 'r-2',
  }, members('r-2')))
  await step('c7-debate-without-proof', 'refuse', () => call('vibe_v5_meeting', { member: 'r-acad', agenda: '核验未证猜想', type: 'debate', subject: 'prop-bare' }, members('r-acad')))
  const debate = await step('c7-debate-with-proof', 'allow', () => call('vibe_v5_meeting', { member: 'r-acad', agenda: '核验归纳证明', type: 'debate', subject: 'prop-proof' }, members('r-acad')))
  const meetingId = (debate && debate.meeting) || 'm1'
  ledger.debateMeeting = meetingId

  // ── E27 / E28 / E32: members file their own final rulings; the chair aggregates (mean when they disagree) and the
  //    card's owner is NOTIFIED of the value to write — the chair does not write it for them ─────────────────────
  await step('e27-verdict-ask', 'allow', () => call('vibe_v5_verdict_ask', { meeting: meetingId, proposition_id: 'prop-proof', member: 'r-acad' }, members('r-acad')))
  await step('e27-verdict-r1', 'allow', () => call('vibe_v5_verdict', { member: 'r-1', meeting: meetingId, proposition_id: 'prop-proof', verdict: 1, reason: '归纳成立' }, members('r-1')))
  await step('e27-verdict-r2', 'allow', () => call('vibe_v5_verdict', { member: 'r-2', meeting: meetingId, proposition_id: 'prop-proof', verdict: 0.7, reason: '边界需补一步' }, members('r-2')))
  await step('e27-verdict-chair-refused', 'refuse', () => call('vibe_v5_verdict', { member: 'r-acad', meeting: meetingId, proposition_id: 'prop-proof', verdict: 1 }, members('r-acad')))
  const final = await step('e28-verdict-final-mean', 'allow', () => call('vibe_v5_verdict_final', { meeting: meetingId, proposition_id: 'prop-proof', owner: 'r-1' }, members('r-acad')))
  ledger.final = final
    ? { mode: final.mode, value: final.value, correction: final.correction ? final.correction.needed : null, notified: final.notified || null }
    : null
  await step('e32-owner-notified', 'allow', async () => {
    const inbox = await call('vibe_v5_inbox', { member: 'r-1' }, members('r-1'))
    const rows = Array.isArray(inbox.rows) ? inbox.rows : []
    ledger.ownerNotice = rows.filter((r) => String(r.subject || '').indexOf('最终裁决') !== -1).map((r) => ({ id: r.id, subject: r.subject }))
    return inbox
  })

  // ── B1 / B2 / B3 / C8: Verified admits only settled (p=1) conclusions; literature is one lawful route; claiming
  //    p=1 with no warrant at all is refused by name ───────────────────────────────────────────────────────────
  await step('b3-p1-without-warrant', 'refuse', () => call('vibe_v5_record_proposition', { id: 'prop-bare-p1', title: '自述已证', statement: '对 n≥1 成立', p: 1, member: 'r-1' }, members('r-1')))
  await step('b2-literature-route', 'allow', () => call('vibe_v5_record_proposition', {
    id: 'prop-lit', title: '算术基本定理', statement: '每个大于 1 的整数可唯一分解为素数之积', value: '唯一素因子分解', motive: '数论基本结论',
    p: 1, literature_ref: 'TAOCP §4.5.1', member: 'r-1',
  }, members('r-1')))
  await step('b2-promote-literature', 'allow', () => call('vibe_v5_verified_promote', {
    card: 'prop-lit', warrant: '文献：TAOCP §4.5.1 已给出标准证明', warrant_kind: 'literature', literature_ref: 'TAOCP §4.5.1', member: 'r-acad',
  }, members('r-acad')))
  await step('b1-promote-unsettled', 'refuse', () => call('vibe_v5_verified_promote', {
    card: 'prop-bare', warrant: '我想先标上', warrant_kind: 'literature', literature_ref: 'x', member: 'r-acad',
  }, members('r-acad')))
  await step('c8-read-verified', 'allow', () => call('vibe_v5_read_library', { member: 'r-1', kind: 'verified', list: true }, members('r-1')))

  // ── C2 / C3 / C4: routes, obstacles and rejected lines are all progress rows on their own tracks ─────────────
  await step('c2-route-progress', 'allow', () => call('vibe_v5_record_progress', { member: 'r-1', track: 'routes', content: '已尝试：直接归纳 + 交换求和次序' }, members('r-1')))
  await step('c3-obstacle-progress', 'allow', () => call('vibe_v5_record_progress', { member: 'r-2', track: 'obstacles', content: '障碍：n=2 的边界在库引理里没有现成形式' }, members('r-2')))
  await step('c4-rejected-progress', 'allow', () => call('vibe_v5_record_progress', { member: 'r-2', track: 'rejected', content: '放弃：解析延拓对本命题不适用' }, members('r-2')))
  await step('c2-unknown-track-refused', 'refuse', () => call('vibe_v5_record_progress', { member: 'r-1', track: 'no-such-track', content: 'x' }, members('r-1')))

  // ── C9 / C15: a method card, and a self-feedback row ─────────────────────────────────────────────────────────
  await step('c9-method-record', 'allow', () => call('vibe_v5_record_method', {
    title: '归纳-化简法', type: 'method', content: '先对 n 归纳，再用交换求和次序把和式化简', value: 0.8, motive: '本命题已验证有效', p: 0.8, member: 'r-1',
  }, members('r-1')))
  await step('c15-feedback-add', 'allow', () => call('vibe_v5_feedback', {
    op: 'add', member: 'r-2', category: 'method', route: 'research', context: '辩论证明确认时',
    phenomenon: '两人对边界看法不同', impact: '裁决取平均而非一致', recommendation: '边界单独列一条引理再辩',
  }, members('r-2')))

  // ── C12 / C10 / C11 / E24: the formal-verify switch; a Lean face that this assembly does not have ────────────
  await step('c12-formal-verify-setting', 'allow', () => call('vibe_v5_set', { key: 'vmu.math.formalVerify', value: 'encourage' }))
  await step('c10-lean-archive-refused', 'refuse', () => call('vibe_v5_lean_archive', {
    kind: 'proof', name: 'odd_sum', statement: '前 n 个奇数和为 n²', from: 'Lean/OddSum.lean', target: 'odd_sum',
  }, members('r-1')))
  await step('c11-fidelity-needs-lean', 'refuse', () => call('vibe_v5_fidelity_conclude', {
    card: 'prop-proof', fidelity: 'conform', lean_job: 'job-1', member: 'r-acad',
  }, members('r-acad')))

  // ── C14: the script archive is the chair's act; a member naming it is refused by name ────────────────────────
  await step('c14-script-archive', 'allow', () => call('vibe_v5_script', {
    op: 'archive', member: 'r-acad', name: 'sum_odd.py', purpose: '枚举 n=1..50 核对奇数之和', text: 'print([sum(2*k+1 for k in range(n)) - n*n for n in range(1,51)])\n',
  }, members('r-acad')))
  // The member is NAMED on the call while the CALLER is the office: the refusal is the SEAT SLOT gate (the archive is
  // the chair's act, rule C14), not the seat-face exclusion a member caller would hit first (VMU_TOOL_NOT_IN_FACE).
  await step('c14-script-member-refused', 'refuse', () => call('vibe_v5_script', {
    op: 'archive', member: 'r-1', name: 'ad-hoc.py', purpose: '临时算一下', text: 'print(1)\n',
  }, office()))

  // ── D6: a member's status panel is readable by another member (and the read is recorded) ────────────────────
  await step('d6-panel-set', 'allow', () => call('vibe_vmu_panel', {
    action: 'set', member: 'r-1', by: 'r-1', overall: '归纳主线：已证 n² 数值', subgoal: '补 n=2 边界引理', plan: '先立引理再合并', status: '推进中', subtasks: ['列边界', '立引理'], source: 'self',
  }, members('r-1')))
  await step('d6-panel-get', 'allow', () => call('vibe_vmu_panel', { action: 'get', member: 'r-1', viewer: 'r-2' }, members('r-2')))

  // ── E9: the chair narrows a meeting's roster by naming it (the narrowing is stated, not silent) ─────────────
  const narrowed = await step('e9-meeting-narrowed-roster', 'allow', () => call('vibe_v5_meeting', {
    member: 'r-acad', agenda: '只与 r-1 对齐边界引理', members: ['r-acad', 'r-1'],
  }, members('r-acad')))
  const narrowedId = (narrowed && narrowed.meeting) || null
  await step('e9-meeting-status', 'allow', () => call('vibe_vmu_meeting', { action: 'status', id: narrowedId }, members('r-acad')))

  // ── G1 / G2: the computation face exists and is PLANNED here; its execution needs a host subprocess seam ────
  await step('g1-mathtools-plan', 'allow', () => call('vibe_vmu_mathtools', { action: 'plan', op: 'run', args: { mode: 'expr', expr: 'sum(2*k+1 for k in range(60))' } }, office()))
  await step('g1-mathtools-run-refused', 'refuse', () => call('vibe_vmu_mathtools', { action: 'run', op: 'run', args: { mode: 'expr', expr: 'sum(2*k+1 for k in range(60))' } }, office()))
  await step('g2-set-maxparallel', 'allow', () => call('vibe_v5_set', { key: 'vmu.limits.maxParallel', value: 2 }))

  // ── G4: pause and resume go through the kernel control state (resume names where it came from) ──────────────
  await step('g4-pause', 'allow', () => call('vibe_v5_pause', { reason: '用户要求暂停以核对裁决' }, office()))
  await step('g4-resume', 'allow', () => call('vibe_v5_resume', { reason: '用户核对完毕，继续' }, office()))

  // ── A2: a progress row wakes the office — the notice lands in the chair's mailbox as a report notice ────────
  await step('a2-progress-report', 'allow', () => call('vibe_v5_record_progress', { member: 'r-1', content: '完成边界引理的草稿，等待裁决' }, members('r-1')))
  await step('a2-office-notice', 'allow', async () => {
    const list = await call('vibe_v5_inbox', { member: 'r-acad' }, members('r-acad'))
    const rows = Array.isArray(list.rows) ? list.rows : []
    const notice = rows.filter((r) => String(r.subject || '').indexOf('progress-notice') !== -1)[0]
    ledger.progressNotice = notice ? { id: notice.id, from: notice.from, subject: notice.subject } : null
    if (!notice) return { ok: false, code: 'NO_PROGRESS_NOTICE', rows: rows.length }
    const opened = await call('vibe_v5_inbox', { member: 'r-acad', action: 'open', id: notice.id }, members('r-acad'))
    ledger.progressNoticeText = opened && opened.message ? opened.message.text : null
    return opened
  })

  return {
    steps,
    receipts: h.receipts,
    expectedRefusals: [
      { tool: 'vibe_v5_set', code: 'VMU_INVALID_ARGUMENT' },
      { tool: 'vibe_v5_hire', code: 'VMU_INVALID_ARGUMENT' },
      { tool: 'vibe_v5_record_proposition', code: 'VMU_TOOL_NOT_IN_FACE' },
      { tool: 'vibe_v5_fire', code: 'VMU_NOT_PERMITTED' },
      { tool: 'vibe_v5_record_proposition', code: 'VMU_STATE' },
      { tool: 'vibe_v5_verified_promote', code: 'VMU_STATE' },
      { tool: 'vibe_v5_meeting', code: 'VMU_PACK_V5R_DEBATE_SUBJECT_NO_PROOF' },
      { tool: 'vibe_v5_verdict', code: 'VMU_RULING_CHAIR_SIGNS' },
      { tool: 'vibe_v5_verdict_final', code: 'VMU_MEETING_QUORUM_LOST' },
      { tool: 'vibe_v5_record_proposition', code: 'VMU_PACK_V5R_P1_NEEDS_DEBATE' },
      { tool: 'vibe_v5_record_progress', code: 'VMU_INVALID_ARGUMENT' },
      { tool: 'vibe_v5_lean_archive', code: 'VMU_ENGINE_UNAVAILABLE' },
      { tool: 'vibe_v5_fidelity_conclude', code: 'VMU_PACK_V5R_FIDELITY_LEAN_NOT_PASSED' },
      { tool: 'vibe_v5_script', code: 'VMU_NOT_PERMITTED' },
      { tool: 'vibe_vmu_mathtools', code: 'VMU_ENGINE_UNAVAILABLE' },
      { tool: 'vibe_vmu_task', code: 'VMU_HUMAN_APPROVAL_PENDING' },
    ],
    tree: snapshotTree(h.root),
    highlights: {
      scenario: 'rules-extra',
      root: h.root,
      ledger,
      stepsMeans: 'one row per tool call: `ok` is what the receipt said, `code` is the named refusal when there was one — the audit matches a rule\'s `side` against exactly this pair',
      gatedAction: 'vmu.tasks.assign',
      gatedActionMeans: 'declared through `export const settings`; `vmu.human.gatedActions` is [] by default (zero mechanism: nothing is gated), so the pending/decided pair below exists only because a deployment declared it — which is what G3 asks a deployment to do',
      findings: [
        'C10 (Lean code + compile results archived) and C11/E24 (fidelity check after Lean passed) can only be measured as NAMED REFUSALS in this assembly: the host injects no spawn seam, so `vibe_v5_lean_archive`/`vibe_v5_lean_run` refuse `VMU_ENGINE_UNAVAILABLE` and `vibe_v5_fidelity_conclude` refuses `VMU_PACK_V5R_FIDELITY_LEAN_NOT_PASSED` before any archive row can exist. The archive itself is therefore NOT demonstrated; the refusal is real and named, and the allow branch needs a Lean-capable host.',
        'G2 (the office caps parallelism to protect CPU/OOM) is measured on its ALLOW side only: `vibe_v5_set vmu.limits.maxParallel` reports `maxParallelSource:"setting-live"`, while the ceiling REFUSAL (`VMU_RESOURCE_BUDGET`, "live members at the ceiling") is only reachable from settings declared at BOOT (verified offline: a runtime set does not move the live ceiling in this process). One scenario cannot re-boot, so the refusal belongs to a deployment-level test, not to a step here.',
        'A2 (progress wakes the office) is proven by the chair\'s mailbox: a `v5r-progress-notice` row from `report` appears after the member writes a progress row, and opening it shows the text. The wake is delivered as a mailbox notice; `vibe_v5_report` carries no wake counter.',
        'G3\'s gate is the human approval gate attached to the real service faces (kernel/index.js attachApprovalGates). A gated action THROWS `VMU_HUMAN_APPROVAL_PENDING` (queued, not run) until `vibe_vmu_human {action:"decide"}` allows it — the same call then runs. Declaring the action is the deployment\'s job; the default is zero mechanism.',
        'E28/E32: the chair\'s final ruling on a split vote is the ARITHMETIC MEAN (0.85 of 1 and 0.7) and the receipt carries `correction` (recipient = the card owner, tool + exact call) and `notified:["r-1"]`, delivered as a mailbox message (`ml-*`, subject 命题最终裁决 …). The chair does not write the number into the card — the owner does.',
        'A9\'s hire refusal is the argument face ("hire needs purpose"), not the slot gate: a hire with a purpose succeeds and lands slot temp. A8\'s temp refusal is the SEAT FACE (`VMU_TOOL_NOT_IN_FACE`), and it only fires when the call is made AS the temp (`as:{agent:{id:"temp-1"}}`) — naming `member:"temp-1"` from the office does not refuse, which is why the step is written with the caller identity.',
      ],
    },
  }
}

export const scenario = rulesExtra
export default rulesExtra

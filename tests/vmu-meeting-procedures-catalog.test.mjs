// tests/vmu-meeting-procedures-catalog.test.mjs — D5（规则：「框架给特殊类型会议推荐流程骨架」）的**目录门禁**。
//
// THE DEFECT CLASS THIS PINS（本轮修复的那一类）：`MEETING_PROCEDURES` 里只声明了 `debate` 一套骨架，
// 其余五类（ordinary/academic/closure/paper/planning）走 `procedureFor()` 拿到 `null`。而 `null` 在调用方眼里
// 与「这个类型没有协议」无法区分 —— 于是「规则没点名给骨架的会议」被静默当成「框架没有意见」。
// 同族的第二个坑：骨架里的步骤**点名工具**，如果那些名字是编的，就是**假承诺**（B4/B10 已经踩过一次：
// 提示词教了一个不存在的工具，代理照着调，什么也没发生）。
//
// WHAT THIS SUITE PROVES（每一条都能机器失败）：
//   ① 六个类型**每一个都有决议**：要么有骨架，要么具名说明为什么不给（`MEETING_PROCEDURE_DECISIONS` 是台账）；
//   ② 每套骨架的每一步都带 `tool:` 字段，且那名字必须在**运行时工具目录**里真的存在（真机 boot 出来的名字集，
//      不是硬编码的清单 —— 硬编码清单会把"改名"伪装成"通过"）；
//   ③ `binding:'recommendation'` 在六套上都是机器可读的；骨架不是门禁；
//   ④ `debate` 的四步语义没有被这次改动动过（阶段、文本关键词、`pendingSteps` 为空）；
//   ⑤ 台账**有牙**：把一份被篡改的目录喂给同一个检查函数，它必须报出"假工具名 / 空骨架 / 缺决议"。
//
// WHAT IT DOES NOT PROVE：不驱动真实模型去遵循骨架。那是真机问题，不是这条门禁的问题。
//
// RULE E: every loop/every() below is preceded by an explicit NON-EMPTY assertion.

import { mkdtemp, rm } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..')

let passed = 0
let failed = 0
const failures = []
const ok = (cond, label, detail) => {
  if (cond) { passed++; console.log('  ok   ' + label); return true }
  failed++; failures.push(label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  console.error('  FAIL ' + label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  return false
}

const proc = await import(pathToFileURL(join(REPO, 'vibe-math-vmu', 'packs', 'v5r', 'meeting-procedures.js')).href)
const entry = await import(pathToFileURL(join(REPO, 'vibe-math-vmu', 'vibe-math-vmu.js')).href)

const boot = async (config = {}) => {
  const state = { specs: [] }
  const ctx = {
    effect(fn) { return fn() },
    on() { return () => {} },
    tools: { register: async (spec) => { state.specs.push(spec); return () => {} } },
  }
  const handle = entry.apply(ctx, Object.assign({ clock: () => 1000 }, config))
  await handle.ready()
  return { handle, state, names: state.specs.map((s) => s.name), specOf: (n) => state.specs.find((s) => s.name === n) }
}
const call = async (b, name, args = {}) => {
  const spec = b.specOf(name)
  if (!spec) return { missing: true }
  let parsed
  try { parsed = JSON.parse(await spec.execute(args, {})) } catch { parsed = undefined }
  return { missing: false, parsed }
}

/**
 * 目录检查器 —— **纯函数**，同一个函数既查真数据（③④）也查被篡改的副本（⑤）。
 * 返回问题列表（空＝没问题）；每个问题都带 `where`，这样红的时候人不用猜是哪一类。
 */
const catalogProblems = ({ typeIds, procedures, decisions, toolNames }) => {
  const problems = []
  if (!Array.isArray(typeIds) || typeIds.length === 0) problems.push({ where: 'typeIds', why: '类型目录是空的' })
  if (!Array.isArray(decisions) || decisions.length === 0) problems.push({ where: 'decisions', why: '决议台账是空的' })
  if (!Array.isArray(toolNames) || toolNames.length === 0) problems.push({ where: 'toolNames', why: '工具目录是空的（空集会让"名字合法"这条假绿）' })
  const toolSet = new Set(toolNames || [])
  const decisionByType = new Map((decisions || []).map((d) => [d.type, d]))
  // RULE E 非空前置：第 66 行已把「空类型目录」记成一条问题。这里再把「空输入」显式挡住并提前返回，
  // 让循环的前置条件在源码形状上可被审计看见 —— 纯函数遇到空输入必须带着问题返回，绝不空转后返回 []。
  if (!(Array.isArray(typeIds) && typeIds.length > 0)) return problems
  for (const id of typeIds) {
    const decision = decisionByType.get(id)
    if (!decision) { problems.push({ where: id, why: '这一类没有决议（既没骨架也没具名不骨架的理由）' }); continue }
    const procedure = procedures ? procedures[id] : null
    if (decision.hasProcedure !== !!procedure) {
      problems.push({ where: id, why: '决议说 hasProcedure=' + decision.hasProcedure + '，但目录里' + (procedure ? '有' : '没有') + '骨架' })
    }
    if (!procedure) {
      if (typeof decision.reason !== 'string' || decision.reason.trim() === '') problems.push({ where: id, why: '没有骨架，也没有具名理由（静默的 null）' })
      continue
    }
    if (procedure.binding !== 'recommendation') problems.push({ where: id, why: 'binding 不是 recommendation（骨架会被误当门禁）' })
    if (!Array.isArray(procedure.steps) || procedure.steps.length === 0) { problems.push({ where: id, why: '骨架没有任何步骤' }); continue }
    const seen = new Set()
    ok(procedure.steps.length > 0, 'the skeleton really has steps to check (RULE E)', procedure.steps.length)
    for (const s of procedure.steps) {
      if (!Number.isInteger(s.n) || s.n < 1) problems.push({ where: id + ' step', why: 'n 不是正整数：' + String(s.n) })
      else if (seen.has(s.n)) problems.push({ where: id + ' step ' + s.n, why: 'n 重复' })
      else seen.add(s.n)
      if (typeof s.tool !== 'string' || s.tool.trim() === '') { problems.push({ where: id + ' step ' + s.n, why: '没有 tool 字段（步骤点名的工具无法被机器核对）' }); continue }
      if (!toolSet.has(s.tool)) problems.push({ where: id + ' step ' + s.n, why: '点名的工具不存在：' + s.tool })
      if (s.status !== 'supported' && s.status !== 'pending') problems.push({ where: id + ' step ' + s.n, why: 'status 既不是 supported 也不是 pending' })
      if (s.status === 'pending' && (typeof s.pendingReason !== 'string' || s.pendingReason.trim() === '')) {
        problems.push({ where: id + ' step ' + s.n, why: 'pending 却没有 pendingReason' })
      }
      // `tools` 里的每个字符串都以真实工具名开头，否则"示例调用"也只是好看的假话。
      if (!Array.isArray(s.tools) || s.tools.length === 0) problems.push({ where: id + ' step ' + s.n, why: 'tools 示例为空' })
      else {
        for (const t of s.tools) {
          const name = String(t).trim().split(/\s+/)[0]
          if (!toolSet.has(name)) problems.push({ where: id + ' step ' + s.n, why: 'tools 示例里的工具不存在：' + name })
        }
      }
    }
    if (!Array.isArray(procedure.notes) || procedure.notes.length === 0) problems.push({ where: id, why: '没有 notes（"这是推荐不是门禁"没有写下来）' })
    else if (!/推荐/.test(String(procedure.notes[0]))) problems.push({ where: id, why: 'notes[0] 没说这是推荐' })
  }
  return problems
}

// 真机 boot：工具目录来自运行时注册表（不是本文件里的一份清单）。
// TEMP ROOT ON D: —— 本仓规矩是临时文件不落 C:（AGENTS.md §6）。
const root = await mkdtemp(join('D:/_tmp', 'vmu-meeting-proc-'))
const booted = await boot({ root, packs: ['v5r'] })
ok(booted.handle.kernel !== null && booted.handle.kernel !== undefined, 'the pack really applied (a boot without a library root would silently make every name below look missing)', booted.handle.kernel ? 'kernel' : null)
const packToolNames = booted.handle.kernel ? booted.handle.kernel.packTools().map((t) => t.name) : []
const toolNames = Array.from(new Set(booted.names.concat(packToolNames))).sort()
const realProblems = catalogProblems({
  typeIds: proc.MEETING_TYPE_IDS,
  procedures: proc.MEETING_PROCEDURES,
  decisions: proc.MEETING_PROCEDURE_DECISIONS,
  toolNames,
})

try {
  // ── ① 六类都有决议 ─────────────────────────────────────────────────────────────────────────────────────────
  console.log('=== 1. EVERY DECLARED TYPE HAS A DECISION (a skeleton, or a NAMED reason for none) ===')
  ok(Array.isArray(proc.MEETING_TYPE_IDS) && proc.MEETING_TYPE_IDS.length === 6,
    'the catalogue still declares the rule\'s six types', proc.MEETING_TYPE_IDS && proc.MEETING_TYPE_IDS.length)
  ok(Array.isArray(proc.MEETING_PROCEDURE_DECISIONS) && proc.MEETING_PROCEDURE_DECISIONS.length === 6,
    '★ the decision ledger covers all six types (one row each, no silent gaps)', proc.MEETING_PROCEDURE_DECISIONS && proc.MEETING_PROCEDURE_DECISIONS.length)
  const decidedTypes = proc.MEETING_PROCEDURE_DECISIONS.map((d) => d.type)
  ok(decidedTypes.length > 0 && proc.MEETING_TYPE_IDS.every((id) => decidedTypes.includes(id)),
    'every declared type appears in the decision ledger', decidedTypes)
  const skeletonTypes = proc.MEETING_PROCEDURE_DECISIONS.filter((d) => d.hasProcedure === true).map((d) => d.type)
  ok(skeletonTypes.length === 6,
    '★ all six types now carry a recommended skeleton (a rule that named only debate does not make the other five "nothing")',
    proc.MEETING_PROCEDURE_DECISIONS.map((d) => [d.type, d.hasProcedure]))
  const namedNonSkeletons = proc.MEETING_PROCEDURE_DECISIONS.filter((d) => d.hasProcedure === false)
  // EMPTY_ALLOWED: 今天六个类型都有骨架，所以这个集合按设计可能为空 —— 断言的是「凡是无骨架者必须带具名理由」这个
  // 形状，而不是「现在一定存在无骨架者」。反过来强行要求非空会让这条闸在规则演进后变成假红，必须显式说明空集合法。
  ok(namedNonSkeletons.every((d) => typeof d.reason === 'string' && d.reason.trim().length > 10),
    'a type WITHOUT a skeleton must carry a named reason (the shape stays even while unused today)',
    namedNonSkeletons.map((d) => d.type))

  // ── ② 每个类型 procedureFor() 都说得出话 ────────────────────────────────────────────────────────────────
  console.log('=== 2. procedureFor() ANSWERS FOR EVERY TYPE — AND NEVER RETURNS A SILENT NULL ===')
  ok(proc.MEETING_TYPE_IDS.length > 0, 'the type list is non-empty (RULE E)', proc.MEETING_TYPE_IDS.length)
  const perType = proc.MEETING_TYPE_IDS.map((id) => ({ id, d: proc.procedureFor(id) }))
  const missingSkeleton = perType.filter((r) => r.d.hasProcedure !== true || !r.d.procedure)
  ok(missingSkeleton.length === 0, 'every known type returns a skeleton object (non-null)', missingSkeleton.map((r) => r.id))
  const badBinding = perType.filter((r) => r.d.binding !== 'recommendation')
  ok(badBinding.length === 0, '★ every skeleton is machine-readably a RECOMMENDATION (never a gate)', badBinding.map((r) => [r.id, r.d.binding]))
  const emptySteps = perType.filter((r) => !Array.isArray(r.d.procedure.steps) || r.d.procedure.steps.length === 0)
  ok(emptySteps.length === 0, 'every skeleton has at least one step', emptySteps.map((r) => r.id))
  const badNotes = perType.filter((r) => !/推荐/.test(r.d.note))
  ok(badNotes.length === 0, 'the per-type note still says it is a recommendation (skipping it is allowed)', badNotes.map((r) => r.id))
  const unknown = proc.procedureFor('weekly-sync')
  ok(unknown.known === false && unknown.hasProcedure === false && /legal:/.test(unknown.note),
    'an UNKNOWN type is still unknown-by-name and lists the legal values (the non-invented path survives)', unknown.note)

  // ── ③ 步骤点名的工具必须真实存在 ─────────────────────────────────────────────────────────────────────────
  console.log('=== 3. EVERY STEP NAMES A TOOL THAT REALLY EXISTS (a fake name is a fake promise) ===')
  ok(toolNames.length > 0, 'the runtime tool catalogue is non-empty (RULE E — an empty catalogue would make this check vacuous)', toolNames.length)
  const withSkeleton = proc.MEETING_TYPE_IDS.filter((id) => proc.MEETING_PROCEDURES[id])
  ok(withSkeleton.length === 6, 'the skeleton map covers all six types', withSkeleton)
  const allSteps = withSkeleton.reduce((a, id) => a.concat(proc.MEETING_PROCEDURES[id].steps.map((s) => ({ id, s }))), [])
  ok(allSteps.length >= 6, 'there is at least one step per type to check (RULE E)', allSteps.length)
  const fakeTools = allSteps.filter((r) => !toolNames.includes(r.s.tool))
  ok(fakeTools.length === 0, '★ no step names a tool that is missing from the runtime catalogue', fakeTools.map((r) => [r.id, r.s.n, r.s.tool]))
  const stepsMissingField = allSteps.filter((r) => typeof r.s.tool !== 'string' || r.s.tool.trim() === '')
  ok(stepsMissingField.length === 0, 'every step carries a `tool:` field (the machine-checkable half)', stepsMissingField.map((r) => [r.id, r.s.n]))
  const labelled = allSteps.filter((r) => r.s.status !== 'supported' && r.s.status !== 'pending')
  ok(labelled.length === 0, 'every step is either supported or a pending one with a reason', labelled.map((r) => [r.id, r.s.n, r.s.status]))
  const pendingWithoutReason = allSteps.filter((r) => r.s.status === 'pending' && !(typeof r.s.pendingReason === 'string' && r.s.pendingReason.trim() !== ''))
  ok(pendingWithoutReason.length === 0, 'a pending step always says why it is pending', pendingWithoutReason.map((r) => [r.id, r.s.n]))

  // ── ④ debate 的四步语义没被动过 ─────────────────────────────────────────────────────────────────────────
  console.log('=== 4. THE DEBATE SKELETON IS UNCHANGED (four steps, same phases, same promises) ===')
  const debate = proc.procedureFor('debate')
  ok(debate.procedure.steps.length === 4, 'debate still has the rule\'s four steps', debate.procedure.steps.length)
  const phases = debate.procedure.steps.map((s) => s.phase)
  ok(phases.join(',') === 'independent-estimates,debate,final-verdicts,aggregate-and-notify',
    'the four phases are unchanged and in order', phases)
  ok(/概率/.test(debate.procedure.steps[0].what) && /理由/.test(debate.procedure.steps[0].what),
    'step 1 still asks for 布尔概率 + 理由', debate.procedure.steps[0].what.slice(0, 60))
  ok(/轮数由院士/.test(debate.procedure.steps[1].what), 'step 2 still leaves the rounds to the academician', debate.procedure.steps[1].what.slice(0, 60))
  ok(/最终裁决/.test(debate.procedure.steps[2].what), 'step 3 is still the final verdict', debate.procedure.steps[2].what.slice(0, 60))
  ok(/平均/.test(debate.procedure.steps[3].what) && /通知/.test(debate.procedure.steps[3].what),
    'step 4 still spells out both branches (average, notify)', debate.procedure.steps[3].what.slice(0, 60))
  ok(debate.pendingSteps.length === 0, 'debate still reports no pending step', debate.pendingSteps)
  ok(debate.procedure.steps.length > 0 && debate.procedure.steps.every((s) => s.status === 'supported'),
    'every debate step is still labelled supported (the field stays, an empty list is the honest form)', debate.procedure.steps.map((s) => s.status))

  // ── ⑤ 台账有牙：篡改副本必须被同一个检查器抓出来 ─────────────────────────────────────────────────────────
  console.log('=== 5. THE LEDGER HAS TEETH: a doctored catalogue MUST be caught by the same checker ===')
  ok(realProblems.length === 0, 'the REAL catalogue has zero problems', realProblems)
  const doctored = {
    typeIds: ['debate', 'ghost-type'],
    procedures: { debate: { binding: 'gate', steps: [], notes: [] } },
    decisions: [{ type: 'debate', hasProcedure: true, reason: null }],
    toolNames: ['vibe_v5_say'],
  }
  const doctoredProblems = catalogProblems(doctored)
  const where = doctoredProblems.map((p) => p.where + ' :: ' + p.why).join(' | ')
  ok(doctoredProblems.length > 0, '★ a doctored catalogue (missing decision / empty steps / gate binding) is reported at all', doctoredProblems.length)
  ok(/ghost-type/.test(where), 'the checker names the type with NO decision row', where)
  ok(/没有任何步骤|binding/.test(where), 'the checker catches an empty skeleton / a non-recommendation binding', where)
  const fakeNameProblems = catalogProblems({
    typeIds: ['debate'],
    procedures: { debate: { binding: 'recommendation', notes: ['推荐'], steps: [{ n: 1, tool: 'vibe_v5_does_not_exist', status: 'supported', tools: ['vibe_v5_does_not_exist { x: 1 }'] }] } },
    decisions: [{ type: 'debate', hasProcedure: true }],
    toolNames: ['vibe_v5_say'],
  })
  ok(fakeNameProblems.some((p) => /点名的工具不存在/.test(p.why)), '★ the checker catches a FABRICATED tool name (the B4/B10 class)', fakeNameProblems)
  const emptyCatalogProblems = catalogProblems({ typeIds: ['debate'], procedures: { debate: { binding: 'recommendation', notes: ['推荐'], steps: [{ n: 1, tool: 'vibe_v5_say', status: 'supported', tools: ['vibe_v5_say'] }] } }, decisions: [{ type: 'debate', hasProcedure: true }], toolNames: [] })
  ok(emptyCatalogProblems.some((p) => p.where === 'toolNames'), '★ an EMPTY tool catalogue is itself a problem (otherwise "every name is legal" passes vacuously)', emptyCatalogProblems)

  // ── ⑥ 回执里真的带着骨架（不是只有模块内部有） ───────────────────────────────────────────────────────────
  console.log('=== 6. THE RECEIPT CARRIES THE SKELETON: a module-internal catalogue nobody reads is dead code ===')
  const booted2 = booted
  const kernel = booted2.handle.kernel
  await kernel.members.hire({ id: 'acad', slot: 'chair' })
  await kernel.members.hire({ id: 'r-1', slot: 'member' })
  const opened = await call(booted2, 'vibe_v5_meeting', { agenda: '本轮同步', kind: 'sync', member: 'acad', type: 'ordinary' })
  ok(opened.parsed && opened.parsed.ok === true, 'an ordinary meeting opens', opened.parsed && opened.parsed.ok)
  ok(opened.parsed && opened.parsed.procedure && Array.isArray(opened.parsed.procedure.steps) && opened.parsed.procedure.steps.length >= 2,
    '★ the ordinary receipt carries a non-empty recommended skeleton (it reads back from the pack, not from the prompt)',
    opened.parsed && opened.parsed.procedure && opened.parsed.procedure.steps && opened.parsed.procedure.steps.length)
  ok(opened.parsed && opened.parsed.procedureBinding === 'recommendation', 'the receipt labels it a recommendation', opened.parsed && opened.parsed.procedureBinding)
  ok(opened.parsed && opened.parsed.procedureNote && /推荐/.test(opened.parsed.procedureNote), 'the receipt says in words that following it is optional', opened.parsed && opened.parsed.procedureNote)
  const planned = await call(booted2, 'vibe_v5_meeting', { agenda: '下季度规划', kind: 'sync', member: 'acad', type: 'planning' })
  ok(planned.parsed && planned.parsed.procedure && planned.parsed.procedure.steps.length === 4,
    'the planning receipt reports its own four-step skeleton (per-type, not one shared blob)',
    planned.parsed && planned.parsed.procedure && planned.parsed.procedure.steps && planned.parsed.procedure.steps.length)
} finally {
  await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 })
}

if (failed > 0) {
  console.error('\nFAILURES:')
  for (const f of failures) console.error('  · ' + f)
}
console.log('=== VMU MEETING PROCEDURES CATALOG: ' + passed + ' passed, ' + failed + ' failed ===')
process.exit(failed > 0 ? 1 : 0)

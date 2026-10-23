// tests/vmu-meeting-type-tools.test.mjs — D7 第二句（「成员可用的命令按会议类型不同」）的**生产者门禁**。
//
// THE DEFECT CLASS THIS PINS：`kernel/turn.step` 早就能收窄一轮的工具面（`vibe-math-vmu/tools/turn.js` 把
// `{tools:{allow}}` 翻译成 `kernel.setMemberToolOverride({member, all, allow})`），但 **pack 侧没有任何生产者** ——
// 于是「辩论会议上不能写论文/跑 lean/改配置」这件事只存在于提示词里。提示词不是门禁（红线①：越权不得靠"提示词要求"）。
//
// WHAT THIS SUITE PROVES：
//   ① 策略表是 pack 的：六类各有决议，`debate` 收窄、其余具名"不收窄"（未声明的类型也有具名默认，不是静默空集）；
//   ② 只能**收窄**不能扩大：下发的 allow ＝「身份可见表 ∩ 声明允许集」，`intersectFace` 的输出永远是输入的**子集**
//      （有专门的子集断言：身份面里多出来的名字一个都没被"收"进去）；
//   ③ 读不到身份面 ⇒ 具名 `VMU_ENGINE_UNAVAILABLE`（不猜、不扩权）；交集为空 ⇒ 具名 `VMU_STATE`，且**一个 override
//      都不留下**（两阶段：先全算，再全设 —— 一边算一边设会在第二次读失败时留下第一个人的收窄）；
//   ④ 双向断言（用可控的假 kernel 直接驱动工具 handler）：辩论会议期间 `vibe_v5_paper` 从 allow 里掉了，正常会议期间
//      **一个 override 都不设**（不误伤）；主席永远不在收窄范围内；
//   ⑤ override 只活一轮：step 成功或失败之后都清掉（`finally`），失败时错误对象上带着这次收窄的事实；
//   ⑥ 真机上这个工具面存在且注册，未声明会议/未知会议 id 的路径都是具名拒。
//
// WHAT IT DOES NOT PROVE：不证明真实模型在辩论里会遵守收窄后的工具表（那是"模型是否听话"，不是"框架是否收窄"）。
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

const faceMod = await import(pathToFileURL(join(REPO, 'vibe-math-vmu', 'packs', 'v5r', 'meeting-tool-face.js')).href)
const procMod = await import(pathToFileURL(join(REPO, 'vibe-math-vmu', 'packs', 'v5r', 'meeting-procedures.js')).href)
const toolsMod = await import(pathToFileURL(join(REPO, 'vibe-math-vmu', 'packs', 'v5r', 'tools.js')).href)
const entry = await import(pathToFileURL(join(REPO, 'vibe-math-vmu', 'vibe-math-vmu.js')).href)

const roundTool = toolsMod.default.find((t) => t.name === 'vibe_v5_meeting_round')

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

/**
 * 可控的假 kernel：只要够 `membersOf` / `meetingView` / `toolsView` / `turn.step` / override 这两对方法。
 * `visible` 是 member → 工具名数组；某个 member 不在表里 ⇒ toolsView 抛（模拟"这一部署读不到身份面"）。
 */
const makeKernel = ({ type = 'debate', chair = 'acad', visible = {}, stepImpl = null } = {}) => {
  const calls = { overrides: [], cleared: [], steps: [], views: [] }
  const kernel = {
    meetings: {
      meetingView: (args) => { calls.views.push(args); return { ok: true, meeting: args.meeting, type, chair, state: 'open' } },
    },
    members: {
      roster: () => [
        { id: 'acad', slot: 'chair', state: 'live' },
        { id: 'r-1', slot: 'member', state: 'live' },
        { id: 'r-2', slot: 'member', state: 'live' },
      ],
    },
    toolsView: ({ member }) => {
      const list = visible[member]
      if (list === undefined) {
        const err = new Error('VMU_ENGINE_UNAVAILABLE no tool visibility provider is installed')
        err.code = 'VMU_ENGINE_UNAVAILABLE'
        throw err
      }
      return { ok: true, member, count: list.length, tools: list.map((name) => ({ name })) }
    },
    setMemberToolOverride: (o) => { calls.overrides.push(o) },
    clearMemberToolOverride: (m) => { calls.cleared.push(m) },
    turn: {
      step: (a) => { calls.steps.push(a); return stepImpl ? stepImpl(a) : { ok: true, advanced: a.members.length } },
    },
  }
  return { kernel, calls }
}

const DEBATE_VISIBLE = {
  'r-1': ['vibe_v5_say', 'vibe_v5_paper', 'vibe_v5_verdict', 'vibe_v5_tool_help'],
  'r-2': ['vibe_v5_say', 'vibe_v5_lean_run', 'vibe_v5_verdict'],
}
const ORDINARY_VISIBLE = {
  'r-1': ['vibe_v5_say', 'vibe_v5_paper', 'vibe_v5_verdict', 'vibe_v5_tool_help'],
  'r-2': ['vibe_v5_say', 'vibe_v5_paper'],
}

const runRound = async (kernel, args) => {
  try {
    const receipt = await roundTool.handler(args, { kernel })
    return { ok: true, receipt }
  } catch (err) {
    return { ok: false, code: err && err.code, message: err && err.message, hint: err && err.hint, error: err }
  }
}

try {
  // ── ① 策略表：六类各有决议 ──────────────────────────────────────────────────────────────────────────────
  console.log('=== 1. THE POLICY TABLE IS THE PACK\'S: six types, six decisions ===')
  ok(Array.isArray(procMod.MEETING_TYPE_IDS) && procMod.MEETING_TYPE_IDS.length === 6,
    'the catalogue declares six types', procMod.MEETING_TYPE_IDS && procMod.MEETING_TYPE_IDS.length)
  const faces = procMod.MEETING_TYPE_IDS.map((id) => faceMod.meetingTypeFace(id))
  ok(faces.length === 6, 'every declared type has a face decision (RULE E)', faces.length)
  ok(faces.every((f) => f.declared === true), 'every declared type is in the table (no implicit default by accident)', faces.filter((f) => !f.declared).map((f) => f.type))
  const debateFace = faceMod.meetingTypeFace('debate')
  ok(debateFace.narrowed === true && Array.isArray(debateFace.allow) && debateFace.allow.length > 0,
    '★ debate narrows, and declares a non-empty allow list', { narrowed: debateFace.narrowed, n: debateFace.allow && debateFace.allow.length })
  ok(debateFace.allow.includes('vibe_v5_say') && debateFace.allow.includes('vibe_v5_verdict'),
    'debate keeps the speaking/verdict tools (narrowing must not make the debate impossible)', debateFace.allow)
  ok(!debateFace.allow.includes('vibe_v5_paper'),
    '★ debate does NOT allow writing a paper (that is another meeting\'s business — the bidirectional half)', debateFace.allow.includes('vibe_v5_paper'))
  const defaultFaces = faces.filter((f) => f.narrowed === false)
  ok(defaultFaces.length === 5, 'the other five run on the identity face (a NAMED default, not a silent empty set)', defaultFaces.map((f) => f.type))
  ok(defaultFaces.every((f) => typeof f.reason === 'string' && f.reason.trim().length > 5 && f.allow === null),
    'each non-narrowing type explains itself and declares no allow list', defaultFaces.map((f) => f.type))
  const ghost = faceMod.meetingTypeFace('weekly-sync')
  ok(ghost.declared === false && ghost.narrowed === false && /没有声明工具面收窄/.test(ghost.reason),
    'an UNDECLARED type is a named default too (never a silent empty allow)', ghost)

  // ── ② 只能收窄：交集是子集 ──────────────────────────────────────────────────────────────────────────────
  console.log('=== 2. THE INTERSECTION CAN ONLY SHRINK (a widening would be a privilege escalation) ===')
  const visible = ['vibe_v5_say', 'vibe_v5_paper', 'vibe_v5_verdict', 'vibe_v5_tool_help']
  ok(visible.length > 0, 'the visible list is non-empty (RULE E)', visible.length)
  const cut = faceMod.intersectFace(visible, debateFace)
  ok(cut.allow.length > 0, 'the intersection is non-empty for a realistic face', cut.allow)
  ok(cut.allow.every((n) => visible.includes(n)),
    '★ every allowed name is a name the member could already see (subset, not a new grant)', cut.allow)
  ok(cut.dropped.includes('vibe_v5_paper'),
    '★ the names the member LOSES are reported (`dropped` = visible minus allow, not silently discarded)', cut.dropped)
  ok(cut.dropped.length > 0 && cut.dropped.every((n) => visible.includes(n)),
    '`dropped` contains only names the member actually had (a policy-only name is not a loss)', cut.dropped)
  ok(Array.isArray(cut.unavailable),
    'the policy-only names are a SEPARATE list (`unavailable`: wanted but never visible — a recipe/identity mismatch, not a loss)', cut.unavailable)
  ok(cut.unavailable.length > 0 && cut.unavailable.every((n) => !visible.includes(n)),
    '`unavailable` never contains a name the member can see (the two difference lists do not overlap)', cut.unavailable)
  const widened = faceMod.intersectFace(visible, { allow: visible.concat(['vibe_v5_hire', 'vibe_v5_set']) })
  ok(widened.allow.length > 0 && widened.allow.every((n) => visible.includes(n)) && !widened.allow.includes('vibe_v5_hire'),
    '★ even if the POLICY asked for a name outside the identity face, it cannot be granted (the table is not an authority over identity)', widened.allow)

  // ── ③ 两条具名拒 + 不留残余 ─────────────────────────────────────────────────────────────────────────────
  console.log('=== 3. TWO NAMED REFUSALS — AND NO HALF-APPLIED NARROWING LEFT BEHIND ===')
  const noProvider = makeKernel({ type: 'debate', visible: {} })
  const r1 = await runRound(noProvider.kernel, { meeting: 'm1' })
  ok(r1.ok === false && r1.code === 'VMU_ENGINE_UNAVAILABLE',
    '★ an unreadable identity face is refused by name (guessing an allow here would be a widening)', r1.code)
  ok(/身份可见表/.test(String(r1.message)), 'the refusal says WHAT could not be read', String(r1.message).slice(0, 80))
  ok(noProvider.calls.overrides.length === 0, 'nothing was applied before the refusal', noProvider.calls.overrides.length)
  // 第二个成员读不到身份面 ⇒ 第一个也不能被留下 override（两阶段）
  const halfBroken = makeKernel({ type: 'debate', visible: { 'r-1': DEBATE_VISIBLE['r-1'] } })
  const r2 = await runRound(halfBroken.kernel, { meeting: 'm1', members: ['r-1', 'r-2'] })
  ok(r2.ok === false && r2.code === 'VMU_ENGINE_UNAVAILABLE', 'the second member\'s unreadable face refuses the whole round', r2.code)
  ok(halfBroken.calls.overrides.length === 0,
    '★ NO override survives a refusal: the round computes every face first and only then applies (a half-applied narrowing is worse than none)',
    halfBroken.calls.overrides)
  const emptyIsect = makeKernel({ type: 'debate', visible: { 'r-1': ['vibe_v5_paper'] } })
  const r3 = await runRound(emptyIsect.kernel, { meeting: 'm1', members: ['r-1'] })
  ok(r3.ok === false && r3.code === 'VMU_STATE', '★ an EMPTY intersection is refused (an empty face is a bad configuration, not strictness)', r3.code)
  ok(/空的/.test(String(r3.message)) && /交集 0/.test(String(r3.message)), 'the refusal prints the numbers (declared / visible / intersection)', String(r3.message).slice(0, 120))
  ok(emptyIsect.calls.overrides.length === 0, 'and it applied nothing', emptyIsect.calls.overrides.length)

  // ── ④ 双向：辩论收窄 / 正常会议不误伤 / 主席不收窄 ──────────────────────────────────────────────────────
  console.log('=== 4. BOTH DIRECTIONS: a debate really narrows, an ordinary meeting is really untouched ===')
  const debate = makeKernel({ type: 'debate', chair: 'acad', visible: DEBATE_VISIBLE })
  const dRound = await runRound(debate.kernel, { meeting: 'm1' })
  ok(dRound.ok === true, 'the debate round advances', dRound.code)
  ok(debate.calls.overrides.length === 2, 'both non-chair members get an override (the chair does not)', debate.calls.overrides.map((o) => o.member))
  ok(debate.calls.overrides.every((o) => o.member !== 'acad'), '★ the CHAIR is never narrowed (order-keeping is the seat\'s duty)', debate.calls.overrides.map((o) => o.member))
  const r1Override = debate.calls.overrides.find((o) => o.member === 'r-1')
  ok(r1Override && r1Override.all === false && Array.isArray(r1Override.allow), 'the override is an allow list (all:false)', r1Override)
  ok(r1Override && !r1Override.allow.includes('vibe_v5_paper') && r1Override.allow.includes('vibe_v5_say'),
    '★ during the debate, vibe_v5_paper is NOT in the member\'s allow list and speaking still is', r1Override && r1Override.allow)
  ok(dRound.receipt.narrowed === true && dRound.receipt.narrowing.members.length === 2,
    'the receipt reports the narrowing (who, what was dropped)', dRound.receipt && dRound.receipt.narrowing)
  ok(dRound.receipt.narrowing.members.some((m) => m.dropped.includes('vibe_v5_paper')),
    'the receipt names the dropped tools (so a reader can see the difference)', dRound.receipt.narrowing.members.map((m) => m.dropped))
  ok(debate.calls.steps.length === 1 && debate.calls.steps[0].members.map((m) => m.id).join(',') === 'r-1,r-2',
    'the step was driven for exactly the narrowed members, in order', debate.calls.steps[0] && debate.calls.steps[0].members)
  ok(debate.calls.cleared.length === 2 && debate.calls.cleared.includes('r-1') && debate.calls.cleared.includes('r-2'),
    '★ the override is cleared after the round (it belongs to THIS round only)', debate.calls.cleared)

  const ordinary = makeKernel({ type: 'ordinary', chair: 'acad', visible: ORDINARY_VISIBLE })
  const oRound = await runRound(ordinary.kernel, { meeting: 'm2' })
  ok(oRound.ok === true, 'an ordinary round advances', oRound.code)
  ok(ordinary.calls.overrides.length === 0,
    '★ an ordinary meeting sets NO override at all (not a smaller face — the identity face, un-touched)', ordinary.calls.overrides)
  ok(ordinary.calls.cleared.length === 0, 'so there is nothing to clear either', ordinary.calls.cleared.length)
  ok(oRound.receipt.narrowed === false && typeof oRound.receipt.narrowing.reason === 'string' && oRound.receipt.narrowing.reason.length > 5,
    'the receipt says in words WHY nothing was narrowed (a named decision, not a silent skip)', oRound.receipt && oRound.receipt.narrowing)
  ok(ordinary.calls.steps.length === 1 && ordinary.calls.steps[0].members.map((m) => m.id).join(',') === 'r-1,r-2',
    'the ordinary round still drives the members (no narrowing does not mean "does nothing")', ordinary.calls.steps[0] && ordinary.calls.steps[0].members)

  // 显式 members：只收窄点名的那些
  const explicit = makeKernel({ type: 'debate', visible: DEBATE_VISIBLE })
  const eRound = await runRound(explicit.kernel, { meeting: 'm1', members: ['r-2'] })
  ok(eRound.ok === true && explicit.calls.overrides.length === 1 && explicit.calls.overrides[0].member === 'r-2',
    'an explicit member list narrows exactly those members', explicit.calls.overrides.map((o) => o.member))

  // ── ⑤ 失败也要清、失败时带着收窄事实 ───────────────────────────────────────────────────────────────────
  console.log('=== 5. A FAILED STEP STILL CLEARS THE OVERRIDE AND REPORTS WHAT WAS NARROWED ===')
  const boom = new Error('VMU_TURN_NO_FENCE the reply carries no usable json object')
  boom.code = 'VMU_TURN_NO_FENCE'
  boom.hint = 'reply with one fenced json object'
  const failing = makeKernel({ type: 'debate', visible: DEBATE_VISIBLE, stepImpl: () => { throw boom } })
  const fRound = await runRound(failing.kernel, { meeting: 'm1' })
  ok(fRound.ok === false && fRound.code === 'VMU_TURN_NO_FENCE', 'the step refusal is passed through unchanged', fRound.code)
  ok(failing.calls.cleared.length === 2, '★ the override is cleared even when the step throws (no leaked narrowing)', failing.calls.cleared)
  ok(fRound.error && fRound.error.narrowing && fRound.error.narrowing.narrowed === true,
    'the error carries the narrowing facts (a reader can tell "it was narrowed, then the step failed")', fRound.error && fRound.error.narrowing)
  ok(fRound.error && fRound.error.narrowing && fRound.error.narrowing.members.length === 2,
    'and which members were narrowed', fRound.error && fRound.error.narrowing && fRound.error.narrowing.members.length)

  // ── ⑥ 真机：工具面存在、注册、未知名路径具名拒 ────────────────────────────────────────────────────────
  console.log('=== 6. THE PRODUCER IS A REAL, REGISTERED TOOL FACE (not a module nobody calls) ===')
  ok(!!roundTool, 'vibe_v5_meeting_round is registered in the pack manifest')
  ok(roundTool && roundTool.parameters && roundTool.parameters.meeting && roundTool.parameters.meeting.required === true,
    'its schema requires the meeting id', roundTool && roundTool.parameters && Object.keys(roundTool.parameters))
  ok(roundTool && typeof roundTool.description === 'string' && /会议类型/.test(roundTool.description) && /narrows|收窄/i.test(roundTool.description),
    'the description states the narrowing rule (agents read descriptions, not source)', roundTool && roundTool.description.slice(0, 60))
  // TEMP ROOT ON D:（AGENTS.md §6）
  const root = await mkdtemp(join('D:/_tmp', 'vmu-meeting-type-tools-'))
  try {
    const booted = await boot({ root, packs: ['v5r'] })
    ok(booted.names.includes('vibe_v5_meeting_round'), 'the tool is published by a real boot (`packs:["v5r"]`)', booted.names.includes('vibe_v5_meeting_round'))
    const kernel = booted.handle.kernel
    ok(!!kernel, 'the pack applied (a boot without a library root would refuse every call for the wrong reason)', !!kernel)
    const spec = booted.specOf('vibe_v5_meeting_round')
    const missingMeeting = spec ? JSON.parse(await spec.execute({}, {})) : null
    ok(missingMeeting && missingMeeting.ok === false && missingMeeting.code === 'VMU_INVALID_ARGUMENT' && /meeting/.test(missingMeeting.message),
      'a missing meeting id is refused by name (the tool does not guess a meeting)', missingMeeting && [missingMeeting.code, missingMeeting.message])
    const unknownMeeting = spec ? JSON.parse(await spec.execute({ meeting: 'no-such-meeting' }, {})) : null
    ok(unknownMeeting && unknownMeeting.ok === false && /^VMU_/.test(String(unknownMeeting.code)) && /no-such-meeting/.test(String(unknownMeeting.message)),
      'an unknown meeting is refused by the kernel face BY NAME (a VMU_* code that quotes the id — not a crash, not a silent no-op)',
      unknownMeeting && [unknownMeeting.code, unknownMeeting.message])
  } finally {
    await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 })
  }
} finally {
  // no scratch files survive the suite
}

if (failed > 0) {
  console.error('\nFAILURES:')
  for (const f of failures) console.error('  · ' + f)
}
console.log('=== VMU MEETING TYPE TOOLS: ' + passed + ' passed, ' + failed + ' failed ===')
process.exit(failed > 0 ? 1 : 0)

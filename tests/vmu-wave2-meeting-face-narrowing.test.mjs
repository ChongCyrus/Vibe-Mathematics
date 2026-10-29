// tests/vmu-wave2-meeting-face-narrowing.test.mjs — ROUND 120 / ledger E12：**声明"不收窄"的类型是一个决议，不是空集**。
//
// THE DEFECT THIS PINS：`applyMeetingTypeFace` 对 `narrowed:false` 的类型直接 `return { rows: [] }` —— 于是
// `vibe_v5_meeting_round` 的回执里 `narrowing.members` 是空的，"这一轮没有收窄，工具面等于身份面"这句话**没有任何
// 地方说**。读者只能从"没有 override"反推，而"收窄了但没人看"长得一模一样；更糟的是工具描述早就承诺了
// "in a type that declares no narrowing the member keeps the identity face and the receipt says so by name"。
//
// WHAT THIS SUITE PROVES：
//   ① 未声明收窄的类型：每个成员一行 `narrowing:{applied:false, reason:"type-declares-no-narrowing"}`，
//      `allow:null`（不是空数组 —— 一个都没算，不能被读成"允许了零个工具"），**零 override、零 clear**；
//   ② 未知类型同理，但 `declared:false` + 类型自己的理由；
//   ③ 未声明收窄 + 读不到身份面 ⇒ **这一轮照样开**（不设任何 override，就没有扩权风险），行里如实写
//      `visible:null` + `identityFaceUnreadable`，而不是 `VMU_ENGINE_UNAVAILABLE`；
//   ④ 辩论轮（真 handler）能跑：`ok:true`，两个成员各装一个 allow，`vibe_v5_paper` 掉出 allow，step 收到 phase:"debate"；
//   ⑤ 真正空的**交集**（声明了收窄、但身份面里一个都不匹配）仍是披露而非拒会：`applied:false, reason:"empty-intersect"`，
//      这一轮 ok，override 一个不留 —— 与 ① 的空集是两件事，测试必须区分。
//
// RULE E: every loop is preceded by an explicit NON-EMPTY assertion.

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
const toolsMod = await import(pathToFileURL(join(REPO, 'vibe-math-vmu', 'packs', 'v5r', 'tools.js')).href)
const roundTool = toolsMod.default.find((t) => t.name === 'vibe_v5_meeting_round')

const REFUSE = (code, message, hint) => Object.assign(new Error(message), { code, hint })

/** Controllable fake kernel: only the seams `applyMeetingTypeFace` / `toolMeetingRound` actually read. */
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
    turn: { step: (a) => { calls.steps.push(a); return stepImpl ? stepImpl(a) : { ok: true, advanced: a.members.length } } },
  }
  return { kernel, calls }
}

const runRound = async (kernel, args) => {
  try { return { ok: true, receipt: await roundTool.handler(args, { kernel }) } }
  catch (err) { return { ok: false, code: err && err.code, message: err && err.message, hint: err && err.hint } }
}

const DEBATE_VISIBLE = {
  'r-1': ['vibe_v5_say', 'vibe_v5_paper', 'vibe_v5_verdict', 'vibe_v5_tool_help'],
  'r-2': ['vibe_v5_say', 'vibe_v5_lean_run', 'vibe_v5_verdict'],
}
const ORDINARY_VISIBLE = {
  'r-1': ['vibe_v5_say', 'vibe_v5_paper', 'vibe_v5_verdict', 'vibe_v5_tool_help'],
  'r-2': ['vibe_v5_say', 'vibe_v5_paper'],
}

try {
  // ── ① 未声明收窄：原样身份面 + 具名理由 ───────────────────────────────────────────────────────────────────
  console.log('=== 1. A TYPE THAT DECLARES NO NARROWING SAYS SO, BY NAME ===')
  const ordinaryFace = faceMod.meetingTypeFace('ordinary')
  ok(ordinaryFace.narrowed === false && ordinaryFace.allow === null, 'ordinary declares no narrowing (precondition)', ordinaryFace)
  const { kernel: k1, calls: c1 } = makeKernel({ type: 'ordinary', visible: ORDINARY_VISIBLE })
  const applied = faceMod.applyMeetingTypeFace({ kernel: k1, type: 'ordinary', members: ['r-1', 'r-2'], refuse: REFUSE })
  ok(Array.isArray(applied.rows) && applied.rows.length === 2, '★ every member gets a disclosure row (E12: this used to be rows:[] under a named decision)',
    applied.rows && applied.rows.length)
  // ★ RULE E: the checks below iterate this list, so the list is pinned non-empty HERE (a loop over an empty array
  // would pass every assertion that follows without evidence). The local is deliberate: `applied.rows` reads as
  // "the framework's field", `rowsAll` reads as "the two rows I just proved exist".
  const rowsAll = applied.rows.slice()
  const rowsOk = rowsAll.length === 2 && rowsAll.every((r) => r.narrowing && r.narrowing.applied === false && r.narrowing.reason === 'type-declares-no-narrowing')
  ok(rowsOk, '★ each row carries narrowing:{applied:false, reason:"type-declares-no-narrowing"}',
    rowsAll.map((r) => r.narrowing && r.narrowing.reason))
  ok(rowsAll.length > 0 && rowsAll.every((r) => r.allow === null), '★ allow is null, NOT [] — nothing was computed, so nothing may read as "allowed zero"',
    rowsAll.map((r) => r.allow))
  ok(rowsAll.length > 0 && rowsAll.every((r) => Array.isArray(r.dropped) && r.dropped.length === 0 && Array.isArray(r.unavailable) && r.unavailable.length === 0),
    'nothing was dropped and nothing was unavailable — the identity face is untouched', rowsAll.map((r) => [r.dropped, r.unavailable]))
  ok(rowsAll.length > 0 && rowsAll.every((r) => r.narrowing.declared === true && typeof r.narrowing.typeReason === 'string' && r.narrowing.typeReason.includes('正常会议')),
    'the row quotes the TYPE decision (declared:true + the type reason), not an invented one', rowsAll.map((r) => r.narrowing.typeReason))
  ok(rowsAll.length > 0 && rowsAll.every((r) => r.visible === (r.member === 'r-1' ? 4 : 2) && r.narrowing.identityFaceVisible === r.visible),
    'the identity face count is reported (visible + identityFaceVisible agree)', rowsAll.map((r) => [r.member, r.visible]))
  ok(c1.overrides.length === 0, '★ NO override is installed for a type that declares none (a "narrowing" that is not there must not touch the member)',
    c1.overrides)
  ok(c1.cleared.length === 0, '★ and clear() clears NOTHING — we never installed an override, so we must never un-set one the host owns',
    c1.cleared)
  ok(applied.face && applied.face.narrowed === false && typeof applied.face.reason === 'string',
    'the returned face still names the decision (callers print face.reason)', applied.face)

  // ── ② 未知类型：同样的"不收窄"，但是未声明的理由 ──────────────────────────────────────────────────────────
  console.log('=== 2. AN UNKNOWN TYPE IS ALSO A NAMED DECISION (declared:false) ===')
  const { kernel: k2, calls: c2 } = makeKernel({ type: 'weekly-sync', visible: ORDINARY_VISIBLE })
  const ghost = faceMod.applyMeetingTypeFace({ kernel: k2, type: 'weekly-sync', members: ['r-1'], refuse: REFUSE })
  ok(ghost.rows.length === 1 && ghost.rows[0].narrowing.reason === 'type-declares-no-narrowing',
    'an undeclared type is disclosed with the same reason code (the face is still the identity face)', ghost.rows.map((r) => r.narrowing))
  ok(ghost.rows[0].narrowing.declared === false && ghost.rows[0].narrowing.typeReason.includes('没有声明'),
    'but `declared:false` plus the type own "not declared" sentence distinguish it from a declared non-narrowing type',
    ghost.rows[0].narrowing.typeReason)
  ok(c2.overrides.length === 0, 'no override for an undeclared type either', c2.overrides)

  // ── ③ 未声明收窄 + 读不到身份面 ⇒ 这一轮照样开 ────────────────────────────────────────────────────────────
  console.log('=== 3. UNREADABLE VISIBILITY MUST NOT KILL A ROUND THAT NARROWS NOTHING ===')
  const { kernel: k3, calls: c3 } = makeKernel({ type: 'ordinary', visible: {} })
  let threw = null
  let blind = null
  try { blind = faceMod.applyMeetingTypeFace({ kernel: k3, type: 'ordinary', members: ['r-1'], refuse: REFUSE }) }
  catch (err) { threw = err }
  ok(threw === null, '★ no VMU_ENGINE_UNAVAILABLE: computing no allow cannot widen anything, so the round must run', threw && threw.code)
  ok(blind && blind.rows.length === 1 && blind.rows[0].visible === null,
    'the row says visible:null (not 0 — "could not read" is not "sees nothing")', blind && blind.rows[0].visible)
  ok(blind && typeof blind.rows[0].narrowing.identityFaceUnreadable === 'string' && blind.rows[0].narrowing.identityFaceUnreadable.length > 0,
    'and names why it could not be read (identityFaceUnreadable)', blind && blind.rows[0].narrowing.identityFaceUnreadable)
  ok(c3.overrides.length === 0, 'still zero overrides', c3.overrides)

  // ── ④ 辩论轮：真的跑起来，收窄真的生效 ────────────────────────────────────────────────────────────────────
  console.log('=== 4. A DEBATE ROUND RUNS, AND ITS NARROWING IS REAL ===')
  const { kernel: k4, calls: c4 } = makeKernel({ type: 'debate', visible: DEBATE_VISIBLE })
  const debate = await runRound(k4, { meeting: 'm1', phase: 'debate', members: ['r-1', 'r-2'], why: '第一轮表态' })
  ok(debate.ok === true && debate.receipt && debate.receipt.ok === true,
    '★ vibe_v5_meeting_round {phase:"debate"} returns ok:true (a debate round is not refused as a whole)', debate.ok ? null : debate.code + ' ' + debate.message)
  ok(debate.receipt && debate.receipt.narrowed === true && debate.receipt.narrowing && debate.receipt.narrowing.narrowed === true,
    'the receipt says the type IS narrowed', debate.receipt && debate.receipt.narrowing)
  const dr = (debate.receipt && debate.receipt.narrowing && debate.receipt.narrowing.members) || []
  ok(dr.length === 2 && dr.every((r) => Array.isArray(r.allow) && r.allow.length > 0 && !(r.narrowing && r.narrowing.applied === false)),
    '★ both members carry a real allow list (no disclosure row, because the narrowing applied)', dr.map((r) => r.allow))
  const r1row = dr.find((r) => r.member === 'r-1')
  ok(r1row && r1row.allow.includes('vibe_v5_say') && !r1row.allow.includes('vibe_v5_paper') && r1row.dropped.includes('vibe_v5_paper'),
    '★ vibe_v5_paper is dropped from r-1 allow (the bidirectional half: what the type removes is readable)', r1row && { allow: r1row.allow, dropped: r1row.dropped })
  ok(c4.overrides.length === 2 && c4.cleared.length === 2 && c4.cleared.every((m) => c4.overrides.some((o) => o.member === m)),
    'two overrides installed, and exactly those two cleared after the round', { overrides: c4.overrides.length, cleared: c4.cleared })
  ok(c4.steps.length === 1 && c4.steps[0].phase === 'debate' && c4.steps[0].members.length === 2,
    'the turn was stepped for exactly the invited members with the phase the caller asked for', c4.steps[0])

  // ── ⑤ 真正空的交集：披露，不是拒会 ────────────────────────────────────────────────────────────────────────
  console.log('=== 5. AN EMPTY INTERSECTION IS STILL A DISCLOSURE (the OTHER "not applied") ===')
  const EMPTY_VISIBLE = { 'r-1': ['vibe_v5_paper'], 'r-2': ['vibe_v5_lean_run'] }
  const { kernel: k5, calls: c5 } = makeKernel({ type: 'debate', visible: EMPTY_VISIBLE })
  const empty = await runRound(k5, { meeting: 'm2', phase: 'debate', members: ['r-1', 'r-2'] })
  ok(empty.ok === true && empty.receipt && empty.receipt.ok === true,
    '★ a debate round with an empty intersection still runs (R103/F-103b behaviour preserved)', empty.ok ? null : empty.code + ' ' + empty.message)
  const er = (empty.receipt && empty.receipt.narrowing && empty.receipt.narrowing.members) || []
  ok(er.length === 2 && er.every((r) => r.narrowing && r.narrowing.applied === false && r.narrowing.reason === 'empty-intersect'),
    '★ reason is "empty-intersect" — a DIFFERENT fact from "type-declares-no-narrowing"', er.map((r) => r.narrowing && r.narrowing.reason))
  ok(er.every((r) => Array.isArray(r.allow) && r.allow.length === 0 && r.narrowing.expectedAllowed > 0 && r.narrowing.identityFaceVisible > 0),
    'the empty intersect keeps its counts (expectedAllowed>0, identityFaceVisible>0) so a reader can see it was not "nothing declared"',
    er.map((r) => r.narrowing))
  ok(c5.overrides.length === 0 && c5.cleared.length === 0, 'no override installed and none cleared for a disclosed empty intersect',
    { overrides: c5.overrides.length, cleared: c5.cleared })
  ok(empty.receipt && typeof empty.receipt.note === 'string' && empty.receipt.note.includes('empty-intersect'),
    'the round note names empty-intersect', empty.receipt && empty.receipt.note)

  // ── ⑥ 未声明收窄的那一轮：回执说"没有收窄" ────────────────────────────────────────────────────────────────
  console.log('=== 6. THE NON-NARROWED ROUND SAYS SO IN ITS RECEIPT AND NOTE ===')
  const { kernel: k6, calls: c6 } = makeKernel({ type: 'ordinary', visible: ORDINARY_VISIBLE })
  const plain = await runRound(k6, { meeting: 'm3', phase: 'meeting', members: ['r-1', 'r-2'] })
  ok(plain.ok === true && plain.receipt && plain.receipt.ok === true, '★ an ordinary round runs', plain.ok ? null : plain.code + ' ' + plain.message)
  ok(plain.receipt && plain.receipt.narrowed === false, 'the receipt says narrowed:false', plain.receipt && plain.receipt.narrowed)
  const pr = (plain.receipt && plain.receipt.narrowing && plain.receipt.narrowing.members) || []
  ok(pr.length === 2 && pr.every((r) => r.narrowing && r.narrowing.reason === 'type-declares-no-narrowing'),
    '★ every member row carries the named decision in the round receipt (the gap this suite pins)',
    pr.map((r) => r.narrowing && r.narrowing.reason))
  ok(typeof plain.receipt.narrowing.reason === 'string' && plain.receipt.narrowing.reason.includes('正常会议'),
    'the face-level reason travels on the receipt too', plain.receipt.narrowing.reason)
  ok(typeof plain.receipt.note === 'string' && plain.receipt.note.includes('没有') && plain.receipt.note.includes('正常会议'),
    'the note says this round did NOT narrow, quoting the type decision', plain.receipt.note)
  ok(c6.overrides.length === 0 && c6.cleared.length === 0, 'and the ordinary round installs nothing', { overrides: c6.overrides.length })
  ok(c6.steps.length === 1 && c6.steps[0].phase === 'meeting', 'the turn still ran (the meeting happens with the identity face)', c6.steps[0])
} catch (err) {
  failed++
  failures.push('suite crashed: ' + (err && err.stack ? err.stack.split('\n')[0] : String(err)))
  console.error('  FAIL suite crashed: ' + (err && err.stack ? err.stack : err))
}

console.log('\n=== VMU WAVE2 MEETING FACE NARROWING: ' + passed + ' passed, ' + failed + ' failed ===')
console.log(failed === 0 ? 'ALL GREEN' : 'FAILURES: ' + failures.length)
process.exit(failed > 0 ? 1 : 0)

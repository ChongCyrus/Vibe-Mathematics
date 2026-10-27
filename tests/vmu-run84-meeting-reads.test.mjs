/**
 * RUN 84 —— 三个「回执比事实更乐观」的钉子（真机 run 84 淘到）
 *
 *  ① `vibe_v5_meeting_round { phase: "round" }`：`kernel.turn.step()` 把拒绝当**返回值**交回，包装面照抄成
 *    `ok:true` ⇒ 顶层说这一轮成功、内层说 `unknown phase`，而这一轮**什么都没发生**。
 *  ② 用 `vibe_v5_meeting { action: "convene" }`（工具自己做的那个动词）被拒：「只有 convene，没有 convene 动作」。
 *  ③ primitive 面在「id 只在 service 注册表」时回 `no live meeting with id m2`（读起来像不存在），而同一回执的
 *    hint 承认它在 service —— 且被问的动作（`lapse`）根本不在它列的交叉表里。
 *
 * 三条都是「同一份回执里两个字段互相打架」，所以断言一律成对读：顶层与内层、消息与 hint、被问动作与交叉表。
 */
import assert from 'node:assert/strict'


import { V5R_PACK_TOOLS } from '../vibe-math-vmu/packs/v5r/tools.js'
import { primitiveMissError, SERVICE_CROSSING_ACTIONS } from '../vibe-math-vmu/tools/meeting.js'

const results = []
const test = (name, fn) => { try { fn(); results.push({ ok: true, name }) } catch (e) { results.push({ ok: false, name, error: e }) } }
const testAsync = async (name, fn) => { try { await fn(); results.push({ ok: true, name }) } catch (e) { results.push({ ok: false, name, error: e }) } }

const packTool = (name) => V5R_PACK_TOOLS.find((t) => t && t.name === name)
// The tool funnel turns a thrown named refusal into `{ok:false, code, message, hint}`; calling the handler directly
// skips that wrapper, so the test does the same translation (and fails loudly on an error that carries no code).
async function callTool(name, args, kernel) {
  try {
    return await packTool(name).handler(args, { kernel })
  } catch (err) {
    return { ok: false, code: err && err.code, message: err && err.message, hint: err && err.hint, thrown: true }
  }
}

/* ── ① 一轮失败不能报成功 ────────────────────────────────────────────────────────────────────────────── */

function roundKernel(stepResult) {
  return {
    members: {
      roster: () => [{ id: 'r-acad', state: 'live' }, { id: 'r-1', state: 'live' }],
    },
    meetings: { meetingView: ({ meeting }) => (meeting === 'm1' ? { id: 'm1', type: 'ordinary', chair: 'r-acad' } : null) },
    turn: { step: async () => stepResult },
  }
}

await testAsync('① 成员回合失败（unknown phase）⇒ 顶层 ok:false，step 的 code/message/hint 被提到顶层，turn 保留全读', async () => {
  const tool = packTool('vibe_v5_meeting_round')
  assert.ok(tool && typeof tool.handler === 'function', 'vibe_v5_meeting_round must exist')
  const kernel = roundKernel({
    ok: false,
    code: 'VMU_INVALID_ARGUMENT',
    message: 'unknown phase: round',
    hint: 'known phases: founding, normal, checkpoint, verify, verify-debate, meeting, resume, heartbeat, paper-write, paper-review, paper-final',
  })
  const out = await tool.handler({ meeting: 'm1', members: ['r-1'], phase: 'round' }, { kernel })
  assert.equal(out.ok, false, 'a round whose turn failed must not report ok:true')
  assert.equal(out.code, 'VMU_INVALID_ARGUMENT')
  assert.match(out.message, /unknown phase/)
  assert.match(out.hint, /known phases/)
  assert.equal(out.turnFailed, true)
  assert.equal(out.turn.ok, false, 'the whole step reading stays under turn')
  assert.match(out.note, /CLEARED/, 'the one-round face must still say it was cleared')
  assert.match(out.note, /failed/, 'and that the turn itself failed')
})

await testAsync('①b 成功的一轮仍然是 ok:true（不能为了修失败路径把成功路径也改坏）', async () => {
  const tool = packTool('vibe_v5_meeting_round')
  const kernel = roundKernel({ ok: true, turns: [{ member: 'r-1', ok: true }] })
  const out = await tool.handler({ meeting: 'm1', members: ['r-1'], phase: 'normal' }, { kernel })
  assert.equal(out.ok, true)
  assert.equal(out.turnFailed, undefined)
  assert.equal(out.phase, 'normal')
})

/* ── ② 面自己的动词不该被自己拒 ──────────────────────────────────────────────────────────────────────── */

const signal = { aborted: false, addEventListener() {}, removeEventListener() {} }
const refused = (code, message, hint) => Object.assign(new Error(message), { code, hint, sideEffectsUnverified: true })

function packFaceKernel() {
  // vibe_v5_meeting 的 convene 分支只用到 meetings.open 与 settings；这里给最小可用装配，
  // 断言点在「动作词是否被前置校验吞掉」，不在会议本身。
  return {
    settings: { get: (k, d) => d },
    members: { roster: () => [{ id: 'r-acad', state: 'live' }] },
    meetings: {
      open: async (rest) => ({ ok: true, id: 'm-x', kind: rest.kind, state: 'open', status: 'open', type: rest.kind, agenda: rest.agenda, subjectGate: null, argued: 0 }),

      meetingView: () => ({ id: 'm-x', state: 'open', type: 'ordinary', chair: 'r-acad' }),
    },
    turn: { step: async () => ({ ok: true }) },
  }
}

await testAsync('② action:"convene" 不再被「它没有 convene 动作」拒（面自己的动词与工具对齐）', async () => {
  const out = await callTool('vibe_v5_meeting', { action: 'convene', kind: 'ordinary', agenda: '季度同步', at: 4102444800000, member: 'r-acad' }, packFaceKernel())
  assert.ok(!(out.thrown && !out.code), 'an aligned action must not crash: ' + String(out.message))
  // 允许两种合法结局：真的召集成功，或某个与会话/席位有关的状态拒绝 —— 但**不能**是「没有 convene 动作」。
  if (out && out.ok === false) {
    assert.doesNotMatch(String(out.message || ''), /has no "convene" action/, 'the face must not refuse its own verb')
  }
})

await testAsync('②b 别的动词（close）在这一面仍被具名拒，并且 hint 指向真正有它的面', async () => {
  const tool = packTool('vibe_v5_meeting')
  const out = await callTool('vibe_v5_meeting', { action: 'close', id: 'm-x', member: 'r-acad' }, packFaceKernel())
  assert.equal(out.ok, false)
  assert.match(String(out.message || ''), /close/)
  assert.match(String(out.hint || ''), /vibe_vmu_meeting/)
})

/* ── ③ primitive 面点名「两张表」与被问动作是否交叉 ────────────────────────────────────────────────── */

function primFaceKernel() {
  return {
    settings: { get: (k, d) => d },
    members: { roster: () => [{ id: 'r-acad', state: 'live' }] },
    meetings: {
      openMeetings: () => [],
      list: () => [{ id: 'm-prim' }],
      meetingView: ({ meeting }) => (meeting === 'm-prim' ? { id: 'm-prim', state: 'open', type: 'ordinary', chair: 'r-acad' } : null),
      status: () => null,
    },
    // service 注册表里有 m2、primitive 里没有 —— 正是 run 84 的形状
    meetingService: {
      calls: [],
      list: () => [{ id: 'm2', state: 'scheduled', type: 'ordinary' }],
      has: (id) => String(id) === 'm2',
      get: (id) => (String(id) === 'm2' ? { id: 'm2', state: 'scheduled', type: 'ordinary', chair: 'r-acad' } : null),
      status: () => null,
    },
    turn: { step: async () => ({ ok: true }) },
  }
}

test('③ lapse 打在只在 service 的 id 上：消息说「不在本表」、hint 点名另一张表、且明说该动作不交叉', () => {
  const err = primitiveMissError({ id: 'm2', inService: true, action: 'lapse' })
  assert.equal(err.code, 'VMU_NO_SUCH_OBJECT')
  assert.match(err.message, /no PRIMITIVE meeting with id m2/)
  assert.match(err.message, /SERVICE registry/, 'the message must say the id exists somewhere else')
  assert.doesNotMatch(err.message, /no live meeting with id m2$/, 'the old sentence read as "it does not exist"')
  assert.match(err.hint, /lapse addresses the PRIMITIVE registry only and does NOT cross/)
  assert.match(err.hint, /Actions that cross:/, 'the hint must name the crossing set, not just say "different registry"')
  assert.equal(err.registry, 'service')
  assert.equal(err.askedAction, 'lapse')
  assert.equal(err.actionCrosses, false)
})

test('③b 同一个拒绝在交叉动作上要说「这动作会交叉」——否则两种情形读起来一样', () => {
  const err = primitiveMissError({ id: 'm2', inService: true, action: 'status' })
  assert.equal(err.actionCrosses, true)
  assert.match(err.hint, /status DOES cross registries/)
  assert.match(err.hint, /only when the service exposes that method/, 'crossing is not a promise that it will work')
})

test('③c 两张表都没有时仍是老实话（不点名 service）', () => {
  const err = primitiveMissError({ id: 'm9', inService: false, action: 'lapse' })
  assert.equal(err.message, 'no live meeting with id m9')
  assert.equal(err.registry, null)
  assert.match(err.hint, /reports both registries/)
})

test('③d 交叉表就是 run() 真会转给 service 的那些动作（表与分支一致，避免声明与实现分岔）', () => {
  // 这些是 run() 里真的去调 kernel.meetings.*View/service 的动作；缺一个就意味着 hint 在撒谎。
  for (const a of ['status', 'summary', 'close', 'speak', 'hand', 'hands', 'invite', 'invitedspeak', 'order', 'attend', 'extendlimit', 'proceed', 'second', 'withdraw', 'flow', 'overrideorder']) {
    assert.ok(SERVICE_CROSSING_ACTIONS.includes(a), a + ' must be declared as crossing')
  }
  // instructive counter-examples: they must NOT be in the set (they are primitive-only or not meeting acts at all).
  for (const a of ['lapse', 'revokelapse', 'snapshot', 'open', 'end']) {
    assert.ok(!SERVICE_CROSSING_ACTIONS.includes(a), a + ' must not be declared as crossing')
  }
})

const failed = results.filter((r) => !r.ok)
for (const r of results) {
  if (r.ok) console.log('  ok   ' + r.name)
  else { console.log('  FAIL ' + r.name); console.log('       ' + (r.error && r.error.message)) }
}
console.log('\n=== RUN84 MEETING READS: ' + (results.length - failed.length) + ' passed, ' + failed.length + ' failed ===')
if (failed.length > 0) process.exit(1)

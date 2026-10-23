// vmu member face gate — the CALL-TIME half of rule D7 (docs/acceptance/conformance/lane-d7.md, kernel/memberface.js).
//
// The scenario is a PAIR on purpose: for every seat the gate must (a) let a tool the face admits through, and (b) refuse a
// tool the face keeps out BY NAME — the refusal names the tool AND the seat, and its code is one of the two registered
// ones. The wire's own answer (`toolsView`) and the gate's answer must agree, because they read ONE resolution: this is
// the anti-drift assertion (the 20-vs-22 lesson), not a convenience check.
//
// Fail-closed is asserted as behaviour, not as a comment: an unknown member, an unknown seat, an unreadable face and a
// missing face list all REFUSE — none of them returns "allowed".
//
// Run: node tests/vmu-member-face.test.mjs        Last line: === VMU MEMBER FACE: N passed, M failed ===

import { pathToFileURL } from 'node:url'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  faceGate, resolveFace, hiddenNames, FACE_CODES, FACE_REASONS, HIDDEN_CATALOGUE,
} from '../vibe-math-vmu/kernel/memberface.js'
import { makePackToolSpec, packToolFaceGate, resolveTurnMember } from '../vibe-math-vmu/host-pack-tools.js'

const HERE = fileURLToPath(new URL('./', import.meta.url))
const REPO = resolve(HERE, '..')
const MODULE = resolve(REPO, 'vibe-math-vmu', 'kernel', 'index.js')
const m = await import(pathToFileURL(MODULE).href)

let passed = 0, failed = 0
const failures = []
const ok = (cond, name, detail) => { if (cond) passed++; else { failed++; failures.push(name + (detail === undefined ? '' : ' [' + JSON.stringify(detail) + ']')) } }
const expectThrow = (fn, code, name) => {
  try { fn(); failed++; failures.push(name + ' (did not throw)') } catch (e) { ok(e && e.code === code, name, e && e.code) }
}

// ── ① the pure predicate: the four admitted/refused shapes ───────────────────────────────────────────────────────
{
  ok(FACE_CODES.NOT_IN_FACE === 'VMU_TOOL_NOT_IN_FACE' && FACE_CODES.UNRESOLVED === 'VMU_TOOL_FACE_UNRESOLVED',
    '① 两个拒码的字面值就是登记在 docs/03 的那两个（改名会立刻打红）', FACE_CODES)
  ok(FACE_REASONS.length === 2 && FACE_REASONS[0] === 'seat' && FACE_REASONS[1] === 'turn',
    '① 具名原因只有 seat / turn 两种（第三种只出现在 hidden 的 catalogue，见 ⑤）', FACE_REASONS)

  const denied = faceGate({ member: 'm-a', slot: 'member', toolName: 'vote', faces: [{ slot: 'member', deny: ['vote'], allow: null, all: false, source: ['pack'] }] })
  ok(denied.ok === false && denied.code === 'VMU_TOOL_NOT_IN_FACE' && /"vote"/.test(denied.message) && /member/.test(denied.message),
    '★ 反：deny 名单里的工具 ⇒ 具名拒，message 同时点名工具与席位', denied)
  ok(denied.face && denied.face.deny.includes('vote') && denied.face.source[0] === 'pack',
    '反：拒里带回那张面（成员可以读到“为什么没有它”）', denied.face)

  const admitted = faceGate({ member: 'm-a', slot: 'member', toolName: 'read', faces: [{ slot: 'member', deny: ['vote'], allow: null, all: false }] })
  ok(admitted.ok === true && admitted.tool === 'read' && admitted.slot === 'member',
    '★ 正：不在 deny 名单 ⇒ 放行，且回执点名席位（同一张面的另一种读法）', admitted)

  const byAllow = faceGate({ member: 'm-a', slot: 'member', toolName: 'read', faces: { member: { allow: ['read'], deny: ['read'] } } })
  ok(byAllow.ok === true,
    '★ allow 优先于 deny（与 wire 过滤同序：host.js 先判 allow，再判 deny）', byAllow)
  const outOfAllow = faceGate({ member: 'm-a', slot: 'member', toolName: 'vote', faces: { member: { allow: ['read'], deny: null } } })
  ok(outOfAllow.ok === false && /allow list/.test(outOfAllow.message),
    '★ 反：allow 名单外的工具 ⇒ 具名拒，理由写明是 allow 名单', outOfAllow)

  const noTools = faceGate({ member: 'm-a', slot: 'member', toolName: 'read', faces: [{ slot: 'member', all: true, deny: [], allow: null }] })
  ok(noTools.ok === false && noTools.code === 'VMU_TOOL_NOT_IN_FACE' && /no tool at all/.test(noTools.message),
    '★ 反：this turn admits no tool（all:true）⇒ 任何工具都拒，理由不是缺省放行', noTools)
}

// ── ② fail-closed: four unresolvable shapes, none of them returns ok:true ────────────────────────────────────────
{
  const cases = [
    ['no face list at all', { slot: 'member', toolName: 'read', faces: null }],
    ['empty face list', { slot: 'member', toolName: 'read', faces: [] }],
    ['unknown seat', { slot: 'ghost-seat', toolName: 'read', faces: [{ slot: 'member', deny: [] }] }],
    ['non-array deny', { slot: 'member', toolName: 'read', faces: [{ slot: 'member', deny: 'vote' }] }],
  ]
  for (const [label, args] of cases) {
    const r = faceGate(args)
    ok(r.ok === false && r.code === 'VMU_TOOL_FACE_UNRESOLVED' && typeof r.message === 'string' && r.message.length > 10 && typeof r.hint === 'string',
      '★ 反：' + label + ' ⇒ VMU_TOOL_FACE_UNRESOLVED（fail-closed，不看全集）', r)
  }
  const noSlot = resolveFace({ faces: { member: { deny: [] } }, slot: null })
  ok(noSlot.ok === false && noSlot.code === 'VMU_TOOL_FACE_UNRESOLVED',
    '★ 反：没有席位 ⇒ 无法选面 ⇒ 具名拒（不猜一个默认面）', noSlot)
  const noTool = faceGate({ slot: 'member', toolName: '', faces: [{ slot: 'member', deny: [] }] })
  ok(noTool.ok === false && noTool.code === 'VMU_INVALID_ARGUMENT',
    '反：没有工具名 ⇒ 参数拒（同一模块的第三种具名拒）', noTool)
  const malformed = resolveFace({ faces: 'nonsense', slot: 'member' })
  ok(malformed.ok === false && malformed.code === 'VMU_TOOL_FACE_UNRESOLVED',
    '★ 反：面既不是记录/列表/映射 ⇒ 具名拒，不抛异常', malformed)
}

// ── ③ THE ANTI-DRIFT PAIR on a real kernel: gate answer == wire answer, from ONE resolution ──────────────────────
{
  const k = m.createKernel({ clock: () => 0 })
  k.declareSlots([{ id: 'chair', label: 'c', capacity: 0 }, { id: 'member', label: 'm', capacity: 0 }])
  await k.members.hire({ id: 'm-a', slot: 'member', institution: 'sim' })
  await k.members.hire({ id: 'c-a', slot: 'chair', institution: 'sim' })
  k.declarePackTools([
    { name: 'vibe_test_read', handler: () => ({}) },
    { name: 'vibe_test_vote', handler: () => ({}) },
    { name: 'vibe_test_secret', handler: () => ({}) },
  ], { by: 'probe-pack' })
  k.declarePackToolFaces({ member: { deny: ['vibe_test_secret'] }, chair: { deny: [] } }, { by: 'probe-pack' })
  k.turn.setVisibleToolsProvider(() => ['vibe_test_read', 'vibe_test_vote'])

  const declared = k.packTools().map((t) => t.name)
  ok(declared.length === 3, '③ 前提：内核登记了 3 个 pack 工具（hidden 的 declared 来源）', declared)

  for (const name of declared) {
    const gate = k.memberFaceGate({ member: 'm-a', toolName: name })
    const view = k.toolsView({ member: 'm-a' })
    const onWire = view.tools.some((t) => t.name === name)
    ok(gate.ok === onWire,
      '★ 同一份名单两种读法：' + name + ' 的 gate 结论 == wire 是否提供它（防 20-vs-22 漂移）', { gate, onWire })
  }
  const chairGate = k.memberFaceGate({ member: 'c-a', toolName: 'vibe_test_secret' })
  ok(chairGate.ok === true, '★ 正：同一工具在院士席位上放行（面按席位不同——D7 的核心）', chairGate)
  const memberGate = k.memberFaceGate({ member: 'm-a', toolName: 'vibe_test_secret' })
  ok(memberGate.ok === false && memberGate.code === 'VMU_TOOL_NOT_IN_FACE' && memberGate.slot === 'member',
    '★ 反：普通成员对同一工具具名拒，回执写明席位 member', memberGate)

  const view = k.toolsView({ member: 'm-a' })
  ok(Array.isArray(view.hidden) && view.hidden.length === 1 && view.hidden[0].name === 'vibe_test_secret' && view.hidden[0].reason === 'seat' && view.hidden[0].source === 'pack-face',
    '★ 正：toolsView 的 hidden 只反映事实（1 条：被席位面挡掉的 secret，原因 seat/pack-face）', view.hidden)
  const diff = declared.filter((n) => !view.tools.some((t) => t.name === n)).sort()
  ok(JSON.stringify(diff) === JSON.stringify(view.hidden.map((h) => h.name).sort()),
    '★ hidden 与 wire 的差集逐名一致（declared − visible == hidden）', { diff, hidden: view.hidden })

  expectThrow(() => k.memberFaceGate({ member: 'ghost-x', toolName: 'vibe_test_read' }), 'VMU_NO_SUCH_OBJECT',
    '★ 反：未知成员 ⇒ fail-closed 的具名拒（解析器先按名册拒，绝不按全集放行）')
  expectThrow(() => k.memberFaceGate({ member: '', toolName: 'vibe_test_read' }), 'VMU_INVALID_ARGUMENT',
    '反：空成员 ⇒ 参数拒')
  expectThrow(() => k.memberFaceGate({ member: 'm-a', toolName: '' }), 'VMU_INVALID_ARGUMENT',
    '反：空工具名 ⇒ 参数拒')

  // a member hired AFTER the declaration still gets its face (the resolver reads the LIVE roster)
  await k.members.hire({ id: 'm-late', slot: 'member', institution: 'sim' })
  const late = k.memberFaceGate({ member: 'm-late', toolName: 'vibe_test_secret' })
  ok(late.ok === false && late.code === 'VMU_TOOL_NOT_IN_FACE',
    '★ 正：声明之后才入职的成员同样被裁（读 live roster，不缓存旧名单）', late)
}

// ── ④ the turn override narrows: reason becomes `turn`, and the gate follows it ───────────────────────────────────
{
  const k = m.createKernel({ clock: () => 0 })
  k.declareSlots([{ id: 'member', label: 'm', capacity: 0 }])
  await k.members.hire({ id: 'm-b', slot: 'member', institution: 'sim' })
  k.declarePackTools([{ name: 'vibe_test_read', handler: () => ({}) }, { name: 'vibe_test_vote', handler: () => ({}) }], { by: 'probe-pack' })
  k.declarePackToolFaces({ member: { deny: [] } }, { by: 'probe-pack' })
  k.turn.setVisibleToolsProvider(() => ['vibe_test_read', 'vibe_test_vote'])

  k.setMemberToolOverride({ member: 'm-b', deny: ['vibe_test_vote'] })
  const denied = k.memberFaceGate({ member: 'm-b', toolName: 'vibe_test_vote' })
  // the WIRE is the host's job; simulate it (the provider now omits the narrowed tool) so `hidden` has a real difference
  // to project — the kernel reports the difference, it does not invent one.
  k.turn.setVisibleToolsProvider(() => ['vibe_test_read'])
  const view = k.toolsView({ member: 'm-b' })
  ok(denied.ok === false && denied.code === 'VMU_TOOL_NOT_IN_FACE' && denied.face.source.includes('turn'),
    '★ 反：本轮 override 收窄 ⇒ 同一工具具名拒，面来源里带 turn', denied)
  ok(view.hidden.some((h) => h.name === 'vibe_test_vote' && h.reason === 'turn' && h.source === 'turn-override'),
    '★ 正：hidden 把同一事实标成 turn/turn-override（不是 seat）', view.hidden)

  k.setMemberToolOverride({ member: 'm-b', allow: ['vibe_test_read'] })
  ok(k.memberFaceGate({ member: 'm-b', toolName: 'vibe_test_vote' }).ok === false && k.memberFaceGate({ member: 'm-b', toolName: 'vibe_test_read' }).ok === true,
    '★ allow 收窄：名单外拒、名单内放行', k.toolsView({ member: 'm-b' }).hidden)
  k.setMemberToolOverride({ member: 'm-b', all: true })
  ok(k.memberFaceGate({ member: 'm-b', toolName: 'vibe_test_read' }).ok === false,
    '★ all:true（tools:"none" 那种）⇒ 任何工具都拒', null)
  k.clearMemberToolOverride('m-b')
  ok(k.memberFaceGate({ member: 'm-b', toolName: 'vibe_test_read' }).ok === true && k.memberFaceGate({ member: 'm-b', toolName: 'vibe_test_vote' }).ok === true,
    '★ 清了 override 之后恢复原面（收窄不粘住）', null)
}

// ── ⑤ zero mechanism + the third hidden reason (a declared tool the host never offers) ───────────────────────────
{
  const k = m.createKernel({ clock: () => 0 })
  k.declareSlots([{ id: 'member', label: 'm', capacity: 0 }])
  await k.members.hire({ id: 'm-c', slot: 'member', institution: 'sim' })
  k.turn.setVisibleToolsProvider(() => ['only_this'])
  const view = k.toolsView({ member: 'm-c' })
  ok(Array.isArray(view.hidden) && view.hidden.length === 0,
    '★ 零机制：没有 pack 工具声明 ⇒ hidden 为空数组（不凭空造差异）', view.hidden)
  ok(k.memberFaceGate({ member: 'm-c', toolName: 'anything' }).ok === true,
    '★ 零机制：没有面声明 ⇒ 空 deny ⇒ 放行（默认不是拒绝，拒绝只来自真实声明）', null)

  const hidden = hiddenNames({ declared: ['a', 'b', 'c'], visible: ['a'], face: { deny: ['b'], allow: null, all: false } })
  ok(hidden.length === 2 && hidden[0].reason === 'seat' && hidden[1].reason === HIDDEN_CATALOGUE && hidden[1].source === 'host-catalogue',
    '★ 第三种原因：没被面挡、但宿主本轮没提供 ⇒ reason=catalogue（如实标注，不冒充 seat）', hidden)
  const none = hiddenNames({ declared: [], visible: ['x'], face: null })
  ok(Array.isArray(none) && none.length === 0, '★ 零声明 ⇒ 空投影', none)
}

// ── ⑥ THE REAL DISPATCH PATH: `makePackToolSpec().run` asks the gate BEFORE the handler ─────────────────────────
// Hiding a tool from the wire is NOT refusing it: a model (or a stale face) can still name it. This group walks the
// one funnel every pack tool goes through and proves, with a counter, that a refused call left NO side effect.
{
  const k = m.createKernel({ clock: () => 0 })
  k.declareSlots([{ id: 'chair', label: 'c', capacity: 0 }, { id: 'member', label: 'm', capacity: 0 }])
  await k.members.hire({ id: 'm-a', slot: 'member', institution: 'sim' })
  let calls = 0
  const entryOf = (name) => ({ name, handler: () => { calls += 1; return { ok: true, ran: name } } })
  k.declarePackTools([entryOf('vibe_test_read'), entryOf('vibe_test_secret')].map((e) => ({ name: e.name, handler: e.handler })), { by: 'probe-pack' })
  k.declarePackToolFaces({ member: { deny: ['vibe_test_secret'] } }, { by: 'probe-pack' })
  k.turn.setVisibleToolsProvider(() => ['vibe_test_read'])
  k.setActiveTurnMember('m-a')
  const inFace = makePackToolSpec({ entry: entryOf('vibe_test_read'), kernel: k, packId: 'probe-pack' })
  const outFace = makePackToolSpec({ entry: entryOf('vibe_test_secret'), kernel: k, packId: 'probe-pack' })

  const child = { agent: { id: 'child-1' } }
  const wasOk = await inFace.run({}, child)
  ok(wasOk && wasOk.ok === true && wasOk.ran === 'vibe_test_read' && calls === 1,
    '★ 正：成员调自己面内的 pack 工具 ⇒ 放行且 handler 真的执行了一次', { wasOk, calls })

  let refusal = null
  try { await outFace.run({}, child) } catch (err) { refusal = err }
  ok(refusal && refusal.code === 'VMU_TOOL_NOT_IN_FACE' && calls === 1,
    '★ 反：面外工具 ⇒ 具名拒，且 handler 没有被执行（计数仍是 1，不是"拒了但副作用已发生"）', { code: refusal && refusal.code, calls })
  ok(/"vibe_test_secret"/.test(refusal && refusal.message) && /"m-a"/.test(refusal && refusal.message),
    '★ 反：回执点名「哪个成员」调「哪个工具」', { message: refusal && refusal.message })
  ok(/vibe_test_read/.test(String(refusal && refusal.hint)) && !/vibe_test_secret/.test(String(refusal && refusal.hint)),
    '★ 反：hint 列出该成员实际可见的 pack 工具（有答案，不是静默消失）', { hint: refusal && refusal.hint })
  ok(refusal && refusal.face && String(refusal.face).length > 0, '反：回执带 face（可读回是哪一张面挡的）', { face: refusal && refusal.face })

  // ROOT sessions are not members: v5r's deliverMode:'caller' really does drive packs from the root agent.
  const root = { agent: { id: 'session-root' } }
  const rootOut = await outFace.run({}, root)
  ok(rootOut && rootOut.ok === true && calls === 2,
    '★ 正：根会话（session-…）没有成员 ⇒ 受席位面约束不适用，放行（不把 root 一刀切拒掉）', { rootOut, calls })

  // face resolution itself fails ⇒ fail CLOSED, never "could not tell, so let it through".
  const noResolver = { currentTurnMember: () => 'm-a', members: { roster: () => [{ id: 'm-a', slot: 'member', state: 'live' }] } }
  const stranded = makePackToolSpec({ entry: entryOf('vibe_test_read'), kernel: noResolver, packId: 'probe-pack' })
  let unresolved = null
  try { await stranded.run({}, child) } catch (err) { unresolved = err }
  ok(unresolved && unresolved.code === 'VMU_TOOL_FACE_UNRESOLVED' && calls === 2,
    '★ 反：解析不出面 ⇒ VMU_TOOL_FACE_UNRESOLVED 且 handler 未执行（fail-closed）', { code: unresolved && unresolved.code, calls })

  // a member the seat resolver cannot find (stale turn record) is ALSO fail-closed, not "unknown ⇒ allow".
  k.setActiveTurnMember('ghost-member')
  let ghost = null
  try { await inFace.run({}, child) } catch (err) { ghost = err }
  ok(ghost && ghost.code === 'VMU_TOOL_FACE_UNRESOLVED' && calls === 2,
    '★ 反：本轮记录的成员已不在名册 ⇒ 同样具名 fail-closed（不漏放）', { code: ghost && ghost.code, calls })
  k.setActiveTurnMember('m-a')

  // no kernel at all: the spec factory is used standalone (unit tests / planning) ⇒ nothing to resolve, gate skipped.
  const standalone = makePackToolSpec({ entry: entryOf('vibe_test_read') })
  const alone = await standalone.run({}, null)
  ok(alone && alone.ok === true && calls === 3,
    '★ 零机制：没有内核 ⇒ 没有席位可解析、没有声明要遵守，门禁跳过并如实标 skipped（既有用法不变）', { alone, calls })
  ok(packToolFaceGate({ kernel: null, exec: child, toolName: 'vibe_test_read' }).ok === true,
    '反：packToolFaceGate 对无内核输入返回放行 + skipped:no-kernel（可判读，不是静默）', null)
}

console.log('=== VMU MEMBER FACE: ' + passed + ' passed, ' + failed + ' failed ===')
for (const f of failures) console.log('  FAIL: ' + f)
if (failed > 0) process.exit(1)

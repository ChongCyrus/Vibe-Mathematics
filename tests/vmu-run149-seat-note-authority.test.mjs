/**
 * RUN 149 / G7 audit17→18 C-1 — the seat notes must name the layer that actually refuses.
 *
 * audit18 measured: `assign` / `nudge` written into a member's or temp's reply are skipped by the kernel's SHAPE gate
 * BEFORE dispatch (code `VMU_TURN_FIELD_NOT_APPLICABLE`, `reason: no-supported-shape`) — the chair gets the same skip,
 * so it is not a seat decision. The TOOLS `vibe_v5_assign` / `vibe_v5_nudge` are refused by the SEAT face
 * (`VMU_TOOL_NOT_IN_FACE`, `seat-faces.js` allow {chair:true, member:false, temp:false}) — the owner face never runs.
 * The two catalogue seat notes said "权限由属主面判" / "会被属主面具名拒", i.e. they named an authority that never runs,
 * and the member note recommended two tools the member cannot call. This suite pins the sentences to the mechanism:
 *   §0 the source sentences (what they say, what they no longer say, and the chair note that was already right)
 *   §1 the seat face really denies the tools for member and temp and lets the chair through
 *   §2 the reply FIELD is skipped before dispatch for the chair too (so it is not a seat decision)
 *   §3 the assembled prompts of the three seats carry the corrected sentences and none of the wrong-authority phrasing
 *
 * Run: node tests/vmu-run149-seat-note-authority.test.mjs
 * Last line: === VMU RUN149 SEAT NOTE AUTHORITY: N passed, M failed ===
 */
import { mkdtemp, rm } from 'node:fs/promises'
import { readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..')
const ENTRY = pathToFileURL(join(REPO, 'vibe-math-vmu', 'vibe-math-vmu.js')).href
const REPLY_CHANNEL = pathToFileURL(join(REPO, 'vibe-math-vmu', 'packs', 'v5r', 'prompts', 'v5r-reply-channel.js')).href
const SEAT_FACES = join(REPO, 'vibe-math-vmu', 'packs', 'v5r', 'seat-faces.js')

let passed = 0
let failed = 0
const failures = []
const ok = (cond, label, detail) => {
  if (cond) { passed++; console.log('  ok   ' + label); return true }
  failed++
  failures.push(label + (detail === undefined ? '' : ' — ' + JSON.stringify(detail)))
  console.error('  FAIL ' + label + (detail === undefined ? '' : ' — ' + JSON.stringify(detail)))
  return false
}

const entry = await import(ENTRY)
const decl = await import(REPLY_CHANNEL)

const roots = []
const boot = async (settings = {}) => {
  const root = await mkdtemp(join(tmpdir(), 'vmu-run149-authority-'))
  roots.push(root)
  const state = { specs: [] }
  const ctx = {
    effect(fn) { return fn() },
    on() { return () => {} },
    tools: { register: async (spec) => { state.specs.push(spec); return () => {} } },
  }
  const handle = entry.apply(ctx, Object.assign({ root, packs: ['v5r'], clock: () => 1000, deliverMode: 'caller' }, settings))
  await handle.ready()
  return { root, kernel: handle.kernel, names: state.specs.map((s) => s.name), specs: state.specs }
}
const NL = String.fromCharCode(10)
const fenced = (obj) => ['```json', JSON.stringify(obj), '```'].join(NL)
const detailOf = (step, key) => (step && step.receipt && Array.isArray(step.receipt[key]) ? step.receipt[key] : [])
const seatNote = (seat) => String((decl.REPLY_SEAT_NOTES || {})[seat] || '')
const WRONG_AUTHORITY = /权限由属主面判|会被属主面具名拒|属主面各自判[^，。；]*(assign|nudge)/
const SEAT_ACL = /VMU_TOOL_NOT_IN_FACE/
const SHAPE_SKIP = /VMU_TURN_FIELD_NOT_APPLICABLE/

try {
  console.log('=== 0. 源码口径：三席注要么说席位 ACL、要么说投递前具名跳过，不点「属主面」 ===')
  {
    const member = seatNote('member')
    const temp = seatNote('temp')
    const chair = seatNote('chair')
    ok(member.length > 0 && temp.length > 0 && chair.length > 0, '§0a 三条席位注都存在', { member: member.length, temp: temp.length, chair: chair.length })
    ok(SEAT_ACL.test(member) && member.includes('不在常驻研究员的工具面里'), '§0b ★★ member 注把拒绝点写成席位 ACL（VMU_TOOL_NOT_IN_FACE）', member.slice(0, 200))
    ok(SHAPE_SKIP.test(member) && member.includes('投递前'), '§0c ★★ member 注同时写明回执字段在投递前被具名跳过', member.slice(0, 240))
    ok(!WRONG_AUTHORITY.test(member), '§0d ★★★ member 注不再说「权限由属主面判」（audit18 C-1 原句）', member.slice(0, 240))
    ok(SEAT_ACL.test(temp) && temp.includes('不在临时工的工具面里'), '§0e ★★ temp 注同样把拒绝点写成席位 ACL', temp.slice(0, 200))
    ok(SHAPE_SKIP.test(temp) && temp.includes('院士席也一样'), '§0f ★★ temp 注写明回执字段对院士席也一样被跳过（不是席位判决）', temp.slice(0, 240))
    ok(!WRONG_AUTHORITY.test(temp), '§0g ★★★ temp 注不再说「会被属主面具名拒」（audit18 C-1 原句）', temp.slice(0, 240))
    ok(chair.includes('没有可用形状') && chair.includes('assign'), '§0h ★ 院士席注本来就对：回执里的 assign/nudge 没有可用形状（audit18 明确排除，未被改坏）', chair.slice(0, 200))
    // the whole live file: no seat note or row note may route the assign/nudge refusal to the owner face
    const liveTexts = Object.values(decl.REPLY_SEAT_NOTES || {}).map(String).concat((decl.REPLY_FIELD_ROWS || []).map((r) => String(r.note || '')))
    ok(liveTexts.length > 0 && !liveTexts.some((t) => WRONG_AUTHORITY.test(t)), '§0i ★★★ 整面扫描：没有一条活句子把 assign/nudge 的拒绝点说成「属主面」', liveTexts.filter((t) => WRONG_AUTHORITY.test(t)).slice(0, 2))
  }

  console.log('=== 1. 工具面：席位 ACL 拒 member/temp，放行 chair ===')
  {
    const b = await boot()
    await b.kernel.members.hire({ id: 'r-chair', slot: 'chair' })
    await b.kernel.members.hire({ id: 'r-1', slot: 'member' })
    await b.kernel.members.hire({ id: 'r-t', slot: 'temp' })
    const memberGate = b.kernel.memberFaceGate({ member: 'r-1', toolName: 'vibe_v5_assign' })
    ok(Boolean(memberGate) && memberGate.ok === false && memberGate.code === 'VMU_TOOL_NOT_IN_FACE' && memberGate.slot === 'member',
      '§1a ★★★ member 的工具面拒 vibe_v5_assign（VMU_TOOL_NOT_IN_FACE，slot=member）', memberGate && (memberGate.code + ' ' + memberGate.slot))
    const tempGate = b.kernel.memberFaceGate({ member: 'r-t', toolName: 'vibe_v5_nudge' })
    ok(Boolean(tempGate) && tempGate.ok === false && tempGate.code === 'VMU_TOOL_NOT_IN_FACE' && tempGate.slot === 'temp',
      '§1b ★★★ temp 的工具面拒 vibe_v5_nudge（VMU_TOOL_NOT_IN_FACE，slot=temp）', tempGate && (tempGate.code + ' ' + tempGate.slot))
    const chairGate = b.kernel.memberFaceGate({ member: 'r-chair', toolName: 'vibe_v5_assign' })
    ok(Boolean(chairGate) && chairGate.ok === true, '§1c ★★ 同一工具在院士席放行（席位面按席位不同）', chairGate && chairGate.code)
    ok(WRONG_AUTHORITY.test('权限由属主面判') === true, '§1d 自检：反例正则会命中 audit18 的原句（否则 §0d/§0g 是空断言）')
  }

  console.log('=== 2. 回执字段：院士席也一样在投递前被具名跳过（所以它不是席位判决） ===')
  {
    const b = await boot()
    await b.kernel.members.hire({ id: 'r-chair', slot: 'chair' })
    await b.kernel.members.hire({ id: 'r-t', slot: 'temp' })
    await b.kernel.turn.step({ members: ['r-t'], phase: 'normal', why: 'run149 §2' })
    await b.kernel.turn.supplyMemberReply(fenced({ assign: { to: 'r-chair', subject: 's', why: 'w', acceptance: 'a' } }), 'r-t')
    const tempStep = await b.kernel.turn.step({ members: ['r-t'], phase: 'normal', why: 'run149 §2' })
    const tempSkip = detailOf(tempStep, 'skippedDetail').find((d) => d && d.field === 'assign')
    ok(Boolean(tempStep) && tempStep.ok === true, '§2a temp 的轮次存活', tempStep && tempStep.code)
    ok(Boolean(tempSkip) && tempSkip.reason === 'no-supported-shape' && tempSkip.code === 'VMU_TURN_FIELD_NOT_APPLICABLE',
      '§2b ★★★ temp 写回执 assign ⇒ 具名跳过 no-supported-shape/VMU_TURN_FIELD_NOT_APPLICABLE', tempSkip && (tempSkip.reason + ' ' + tempSkip.code))
    ok(!detailOf(tempStep, 'executedDetail').some((d) => d && d.field === 'assign'), '§2c 它没有被执行')
    await b.kernel.turn.step({ members: ['r-chair'], phase: 'normal', why: 'run149 §2' })
    await b.kernel.turn.supplyMemberReply(fenced({ nudge: { to: 'r-t', why: 'w' } }), 'r-chair')
    const chairStep = await b.kernel.turn.step({ members: ['r-chair'], phase: 'normal', why: 'run149 §2' })
    const chairSkip = detailOf(chairStep, 'skippedDetail').find((d) => d && d.field === 'nudge')
    ok(Boolean(chairSkip) && chairSkip.reason === 'no-supported-shape' && chairSkip.code === 'VMU_TURN_FIELD_NOT_APPLICABLE',
      '§2d ★★★ 院士席写回执 nudge 也被同一条形状闸跳过（同码同因 ⇒ 这不是席位判决）', chairSkip && (chairSkip.reason + ' ' + chairSkip.code))
  }

  console.log('=== 3. 装配后的提示词：三席都带修正句，且没有「属主面」这个错权威 ===')
  {
    for (const [seat, id] of [['chair', 'r-chair'], ['member', 'r-1'], ['temp', 'r-t']]) {
      const b = await boot()
      await b.kernel.members.hire({ id: 'r-chair', slot: 'chair' })
      await b.kernel.members.hire({ id: 'r-1', slot: 'member' })
      await b.kernel.members.hire({ id: 'r-t', slot: 'temp' })
      await b.kernel.turn.step({ members: [id], phase: 'normal', why: 'run149 §3' })
      const turn = await b.kernel.turn.open({ member: id, phase: 'normal', why: 'run149 §3' })
      const asm = await b.kernel.turn.assemble(turn)
      const text = String(asm && asm.text !== undefined ? asm.text : asm)
      const note = seatNote(seat)
      const firstLine = note.split('；')[0]
      // The charter sub-assembly does not render the reply catalogue (it is the deployment/boot assembly that does), so
      // the seat note is pinned where it is really delivered: the catalogue render for that seat. The assembled prompt is
      // still checked for the wrong-authority phrasing, because if it ever leaks in it leaks in here.
      const rendered = decl.replyCatalogueLines({ mode: 'compact', seat }).join(NL)
      ok(rendered.includes(firstLine.slice(0, 24)), '§3a ' + seat + ' 的目录渲染带上本席注（前 24 字可定位）', firstLine.slice(0, 40))
      ok(!text.includes('权限由属主面判') && !text.includes('会被属主面具名拒'), '§3b ' + seat + ' 的装配提示词里没有「属主面」错权威句')
    }
    const seatFaces = readFileSync(SEAT_FACES, 'utf8')
    ok(/vibe_v5_assign/.test(seatFaces) && /VMU_TOOL_NOT_IN_FACE|deny/.test(seatFaces), '§3c 席位面文件确实是 assign 的拒绝点（seat-faces.js 的 allow/deny 表）')
  }
} catch (e) {
  failed++
  failures.push('THREW ' + (e && e.stack ? e.stack.split(NL)[0] : String(e)))
  console.error('  FAIL THREW ' + (e && e.stack ? e.stack : e))
} finally {
  for (const r of roots) await rm(r, { recursive: true, force: true }).catch(() => {})
}

console.log('')
if (failed) { console.error('FAILURES:'); for (const f of failures) console.error('  - ' + f) }
console.log('=== VMU RUN149 SEAT NOTE AUTHORITY: ' + passed + ' passed, ' + failed + ' failed ===')
process.exit(failed ? 1 : 0)

#!/usr/bin/env node
/**
 * ★★★ RUN 147 / audit16 C-1 + C-2 + G22 + G23 + G24 — THE CONVENE SIDE DOOR, AND THREE SMALLER LIES NEXT TO IT.
 *
 * THE DEFECT THIS SUITE PINS (audit16, measured with REAL kernel rounds):
 *   C-1  `v5r-reply-channel.js` said 「只有院士席能召集（conveneRequiresChair），别的席位调用会被具名拒」 in the
 *        `convene_meeting` row, in the chair/member/temp seat notes and in the compact catalogue line. Measured: a
 *        member and a temp seat writing `"convene_meeting": {…}` really OPENED a meeting (`openedBy: null`), because the
 *        field dispatched `vmu.meetings` `open` with no chair, i.e. the kernel's chairless convene path — which
 *        deliberately does not police seats (kernel/meetings.js:2793-2803: it only refuses a convene that INSTALLS a
 *        chair without naming that chair as its actor). Only the TOOL face (`vibe_v5_meeting { action: "convene" }`,
 *        pack requireChairSeat) refuses a non-chair seat.
 *   C-1' (RUN 148 / audit17) the first fix over-corrected into a NEW false claim: the row and the seat notes said the
 *        field still LANDS on that chairless path and 「写了真会开出一个会」, while the same delivered line also said it
 *        would be refused by name. Since RUN 147 the field is `notApplicable` and the dispatch loop CONTINUES PAST it
 *        before any face is touched, so the truth is: skipped by name BEFORE dispatch, no meeting is created, and the
 *        seat policy is judged on the tool face only. §0c/§0c2/§0c3 and §0i/§0i2/§0i3 pin exactly that.
 *   C-2  the temp seat note still said `propose_verify`/`propose_meeting` are deliverable 「会议轮投递」 — the last live
 *        occurrence of a phrase run146 removed from the rows but not from the seat notes.
 *   G22  the four motion rows taught `vibe_v5_motion { meeting, kind, text }` while the tool REFUSES a payload without
 *        `member` (`VMU_INVALID_ARGUMENT "motion needs the acting member id"`).
 *   G23  the `input` row said 「会议轮用」 without saying that the round must have a BOUND meeting (a meeting-phase turn
 *        with no bound meeting skips it as no-meeting-bound).
 *   G24  `v5r-blocks-b.js` taught `vibe_vmu_meeting { action: "minutes" }` — an action this face does not have
 *        (measured: `unknown action: minutes`, VMU_INVALID_ARGUMENT), and `seat-faces.js` repeated 「minutes 读逐字发言」.
 *
 * THE FIX THIS SUITE PINS: `convene_meeting` carries `noReplyShape` in the kernel (FIELD_OWNERS) and `notApplicable`
 * in the pack catalogue, its row names the tool route that DOES enforce the seat policy, all three seat notes and the
 * compact line stop claiming a policy that is not on that path, the motion rows teach the four-parameter shape, the
 * `input` row states the binding requirement, and the minutes claims are replaced by the reads that really exist.
 *
 * Run: node tests/vmu-run147-convene-field.test.mjs   Last line: === VMU RUN147 CONVENE FIELD: N passed, M failed ===
 */
import { mkdtemp, rm } from 'node:fs/promises'
import { readdirSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..')
const ENTRY = pathToFileURL(join(REPO, 'vibe-math-vmu', 'vibe-math-vmu.js')).href
const TURN_MODULE = pathToFileURL(join(REPO, 'vibe-math-vmu', 'kernel', 'turn', 'index.js')).href
const REPLY_CHANNEL = pathToFileURL(join(REPO, 'vibe-math-vmu', 'packs', 'v5r', 'prompts', 'v5r-reply-channel.js')).href
const PROMPTS_DIR = join(REPO, 'vibe-math-vmu', 'packs', 'v5r', 'prompts')
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
const kernelTurn = await import(TURN_MODULE)
const decl = await import(REPLY_CHANNEL)

const roots = []
const boot = async (settings = {}) => {
  const root = await mkdtemp(join(tmpdir(), 'vmu-run147-convene-'))
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
const row = (field) => decl.REPLY_FIELD_ROWS.find((r) => r.field === field)
const detailOf = (step, key) => (step && step.receipt && Array.isArray(step.receipt[key]) ? step.receipt[key] : [])
const notesOf = (step) => (step && step.receipt && Array.isArray(step.receipt.notes) ? step.receipt.notes : [])
const promptSources = () => {
  const names = readdirSync(PROMPTS_DIR).filter((n) => n.endsWith('.js')).map((n) => join(PROMPTS_DIR, n))
  return names.concat([SEAT_FACES]).map((p) => ({ path: p, text: readFileSync(p, 'utf8') }))
}
const meetingsOf = (kernel) => {
  const m = kernel.meetings && typeof kernel.meetings.list === 'function' ? kernel.meetings.list({}) : null
  const arr = Array.isArray(m) ? m : (m && Array.isArray(m.meetings) ? m.meetings : [])
  return arr
}

try {
  console.log('=== 0. 源码口径：convene_meeting 说真话，四处旧承诺全删 ===')
  {
    const convene = row('convene_meeting')
    ok(Boolean(convene), '§0a convene_meeting 行存在')
    ok(Boolean(convene) && convene.notApplicable === true, '§0b ★ 该行标了 notApplicable（回执没有可用形状）', convene && convene.notApplicable)
    const note = convene ? String(convene.note) : ''
    ok(note.includes('没有可用形状') && note.includes('投递前'), '§0c 行里写明它没有可用形状、在投递前就被具名跳过', note.slice(0, 160))
    ok(note.includes('会议不会开出来') && note.includes('VMU_TURN_FIELD_NOT_APPLICABLE'), '§0c2 行里写明会议不会开出来、并点名具名码', note.slice(0, 160))
    ok(!/真会开出一个会|真会开会/.test(note), '§0c3 行里不再说「写了真会开会」（audit17 C-1 的反例）', note.slice(0, 160))
    ok(note.includes('vibe_v5_meeting') && note.includes('action: "convene"'), '§0d 行里点名工具面召集路（政策在那里）', note.slice(0, 200))
    ok(!note.includes('只有院士席能召集（conveneRequiresChair），别的席位调用会被具名拒'), '§0e ★★ 旧承诺（该字段会被具名拒）已删')
    ok(!note.includes('直接召集'), '§0f 不再教「直接召集」', note.slice(0, 80))
    const owner = kernelTurn.FIELD_OWNERS.convene_meeting
    ok(Boolean(owner) && Boolean(owner.noReplyShape), '§0g ★ kernel FIELD_OWNERS.convene_meeting 带有 noReplyShape', owner)
    ok(Boolean(owner && owner.noReplyShape) && owner.noReplyShape.code === 'VMU_TURN_FIELD_NOT_APPLICABLE', '§0h noReplyShape 的具名码是 VMU_TURN_FIELD_NOT_APPLICABLE')
    ok(Boolean(owner && owner.noReplyShape) && /CHAIRLESS/i.test(String(owner.noReplyShape.message)), '§0i message 仍点名那把 CHAIRLESS 椅子（作为历史路径）', owner && owner.noReplyShape && owner.noReplyShape.message)
    ok(Boolean(owner && owner.noReplyShape) && /NO usable shape/i.test(String(owner.noReplyShape.message)) && /BEFORE any face/i.test(String(owner.noReplyShape.message)), '§0i2 message 说清现在的行为是「投递前具名跳过、不开会」', owner && owner.noReplyShape && owner.noReplyShape.message)
    ok(Boolean(owner && owner.noReplyShape) && !/really opens a meeting/i.test(String(owner.noReplyShape.message)), '§0i3 message 不再声称「写了真会开会」（audit17 C-1）', owner && owner.noReplyShape && owner.noReplyShape.message)
    ok(Boolean(owner && owner.noReplyShape) && String(owner.noReplyShape.hint).includes('vibe_v5_meeting'), '§0j hint 给出真正判政策的那条工具路')
    // R35e: the two sets (kernel noReplyShape vs pack notApplicable) must agree in BOTH directions.
    const kernelSet = Object.keys(kernelTurn.FIELD_OWNERS).filter((k) => kernelTurn.FIELD_OWNERS[k] && kernelTurn.FIELD_OWNERS[k].noReplyShape).sort()
    const packSet = decl.REPLY_FIELD_ROWS.filter((r) => r.notApplicable).map((r) => r.field).sort()
    ok(kernelSet.length > 0 && packSet.length > 0, '§0k-pre 两侧集合都非空（R35e 的比较不可能是「两空相等」）', { kernelSet, packSet })
    // audit17 C-1: no row and no seat note may say the field really opens a meeting — that is the shape that shipped
    // in 9dc6c196 and was measured false. The field is skipped before dispatch.
    const liveTexts = decl.REPLY_FIELD_ROWS.map((r) => String(r.note || '')).concat(Object.values(decl.REPLY_SEAT_NOTES).map(String))
    const opensClaim = liveTexts.filter((t) => /真会开出一个会|真会开会|really opens a meeting/.test(t))
    ok(liveTexts.length > 0 && opensClaim.length === 0, '§0k2 没有一行/一条席位注再说「写了真会开会」（audit17 C-1 的整面扫描）', opensClaim.slice(0, 2))
    const beforeDispatch = liveTexts.filter((t) => /convene_meeting/.test(t) && /投递前|没有可用形状|VMU_TURN_FIELD_NOT_APPLICABLE/.test(t))
    ok(liveTexts.length > 0 && beforeDispatch.length >= 2, '§0k3 提到 convene_meeting 的活句子都说明「投递前具名跳过/没有可用形状」', beforeDispatch.length)
    ok(kernelSet.length > 0 && packSet.length > 0 && JSON.stringify(kernelSet) === JSON.stringify(packSet), '§0k ★ R35e：内核 noReplyShape 集合与目录 notApplicable 集合双向一致', { kernelSet, packSet })
    ok(kernelSet.includes('convene_meeting') && packSet.includes('convene_meeting'), '§0l 两个集合都含 convene_meeting')
    // C-2: no live seat note may still promise channel delivery of a motion.
    for (const seat of ['chair', 'member', 'temp']) {
      const n = String(decl.REPLY_SEAT_NOTES[seat] || '')
      ok(!n.includes('会议轮投递'), '§0m ' + seat + ' 席位注不再写「会议轮投递」', n.slice(0, 120))
      ok(n.includes('vibe_v5_meeting') && n.includes('convene'), '§0n ' + seat + ' 席位注点名工具面召集路', n.slice(0, 160))
    }
    ok(!String(decl.REPLY_SEAT_NOTES.chair).includes('`convene_meeting` 可直接召集'), '§0o ★ chair 注不再说「可直接召集」')
    ok(!String(decl.REPLY_SEAT_NOTES.member).includes('只有院士席能召集（conveneRequiresChair）'), '§0p ★ member 注不再把内核 rail 当成席位政策')
    const compact = String(decl.replyCatalogueLines({ mode: 'compact', seat: 'member' }))
    ok(!compact.includes('convene 只有院士席能召集'), '§0q ★ compact 目录行不再宣称「convene 只有院士席能召集」')
    ok(compact.includes('convene_meeting'), '§0r compact 的「没有可用形状」一行点名 convene_meeting', compact.slice(-600))
  }

  console.log('=== 1. 真回合（member）：convene_meeting 被具名拒，会议没被开出来，轮次照常完成 ===')
  {
    const b = await boot()
    await b.kernel.members.hire({ id: 'r-chair', slot: 'chair' })
    await b.kernel.members.hire({ id: 'r-1', slot: 'member' })
    const before = meetingsOf(b.kernel).length
    const first = await b.kernel.turn.step({ members: ['r-1'], phase: 'normal', why: 'run147 §1' })
    ok(Boolean(first) && first.awaiting === true, '§1a 普通轮开得起来')
    await b.kernel.turn.supplyMemberReply(fenced({ convene_meeting: { agenda: '我想偷偷开会' } }), 'r-1')
    const step = await b.kernel.turn.step({ members: ['r-1'], phase: 'normal', why: 'run147 §1' })
    ok(Boolean(step) && step.ok === true && Boolean(step.receipt), '§1b 轮次存活（不是整轮拒）', step && step.code)
    const skipped = detailOf(step, 'skippedDetail').find((d) => d && d.field === 'convene_meeting')
    ok(Boolean(skipped) && skipped.reason === 'no-supported-shape', '§1c ★★ convene_meeting 被具名跳过 no-supported-shape', skipped)
    ok(Boolean(skipped) && skipped.code === 'VMU_TURN_FIELD_NOT_APPLICABLE', '§1d 跳过带具名码 VMU_TURN_FIELD_NOT_APPLICABLE', skipped && skipped.code)
    ok(!detailOf(step, 'executedDetail').some((d) => d && d.field === 'convene_meeting'), '§1e ★★★ 它没有被执行（旧缺陷里这里会开出一个会）')
    const after = meetingsOf(b.kernel).length
    ok(after === before, '§1f ★★★ 会议数量没变（member 没能从回执开会）', { before, after })
    // The refusal is BEFORE dispatch, so it carries no `notes` entry (notes are for dispatch-bound skips); what it
    // carries instead is the named code and the route that really enforces the policy.
    ok(Boolean(skipped) && String(skipped.hint || '').includes('vibe_v5_meeting'), '§1g 回执的 hint 给出真正判政策的工具路', skipped && skipped.hint)
  }

  console.log('=== 2. 真回合（temp）：同一条路同样被拒 ===')
  {
    const b = await boot()
    await b.kernel.members.hire({ id: 'r-chair', slot: 'chair' })
    await b.kernel.members.hire({ id: 'r-t', slot: 'temp' })
    const before = meetingsOf(b.kernel).length
    await b.kernel.turn.step({ members: ['r-t'], phase: 'normal', why: 'run147 §2' })
    await b.kernel.turn.supplyMemberReply(fenced({ convene_meeting: { agenda: 'temp 开会' } }), 'r-t')
    const step = await b.kernel.turn.step({ members: ['r-t'], phase: 'normal', why: 'run147 §2' })
    ok(Boolean(step) && step.ok === true, '§2a 轮次存活', step && step.code)
    ok(detailOf(step, 'skippedDetail').some((d) => d && d.field === 'convene_meeting' && d.reason === 'no-supported-shape'), '§2b ★★ temp 的 convene_meeting 也被具名跳过')
    ok(meetingsOf(b.kernel).length === before, '§2c ★★★ 会议数量没变（temp 没能从回执开会）')
  }

  console.log('=== 3. 工具面才是判席位政策的那条路（院士能召集，成员被具名拒） ===')
  {
    const b = await boot()
    await b.kernel.members.hire({ id: 'r-chair', slot: 'chair' })
    await b.kernel.members.hire({ id: 'r-1', slot: 'member' })
    const meetTool = b.specs.find((s) => s.name === 'vibe_v5_meeting')
    ok(Boolean(meetTool), '§3a vibe_v5_meeting 在部署工具表里')
    const chairRes = await meetTool.execute({ action: 'convene', member: 'r-chair', agenda: '院士召集' }, {})
    const chairParsed = typeof chairRes === 'string' ? JSON.parse(chairRes) : chairRes
    ok(Boolean(chairParsed) && chairParsed.ok !== false && (chairParsed.meeting || chairParsed.id), '§3b ★ 院士席用工具召集成功', chairParsed && (chairParsed.code || chairParsed.meeting))
    const memberRes = await meetTool.execute({ action: 'convene', member: 'r-1', agenda: '成员召集' }, {})
    const memberParsed = typeof memberRes === 'string' ? JSON.parse(memberRes) : memberRes
    ok(Boolean(memberParsed) && memberParsed.ok === false && memberParsed.code === 'VMU_NOT_PERMITTED', '§3c ★★★ 成员席用工具召集被具名拒 VMU_NOT_PERMITTED', memberParsed && (memberParsed.code + ' ' + String(memberParsed.message).slice(0, 120)))
  }

  console.log('=== 4. G22：目录教的 vibu_v5_motion 形参是四参，工具也真的要求 member ===')
  {
    const MOTION_ROWS = ['propose_verify', 'proposal', 'motion', 'propose_meeting']
    // non-vacuous: MOTION_ROWS is a four-element literal listed on this line.
    for (const field of MOTION_ROWS) {
      const note = String((row(field) || {}).note || '')
      ok(note.includes('meeting, member, kind, text'), '§4a ' + field + ' 教的是四参形 { meeting, member, kind, text }', note.slice(0, 200))
      ok(!note.includes('{ meeting, kind, text }'), '§4b ' + field + ' 不再教缺 member 的三参形', note.slice(0, 160))
    }
    const b = await boot()
    await b.kernel.members.hire({ id: 'r-chair', slot: 'chair' })
    await b.kernel.members.hire({ id: 'r-1', slot: 'member' })
    const opened = await b.kernel.meetings.open({ type: 'planning', member: 'r-chair', agenda: 'run147 §4' })
    const mid = opened.meeting || opened.id
    const tool = b.specs.find((s) => s.name === 'vibe_v5_motion')
    ok(Boolean(tool) && Array.isArray(tool.parameters.required) && tool.parameters.required.includes('meeting') && tool.parameters.required.includes('member'),
      '§4c 工具声明 meeting/member 都是必填', tool && tool.parameters && tool.parameters.required)
    let missing = null
    try {
      const res = await tool.execute({ meeting: mid, kind: 'topic', text: '缺 member' }, {})
      missing = typeof res === 'string' ? JSON.parse(res) : res
    } catch (e) {
      missing = { ok: false, code: e && e.code, message: e && e.message }
    }
    ok(Boolean(missing) && missing.ok === false && missing.code === 'VMU_INVALID_ARGUMENT', '§4d ★★ 缺 member 的调用被具名拒（这正是 G22 里那一条）', missing && (missing.code + ' ' + String(missing.message).slice(0, 120)))
    const good = await tool.execute({ meeting: mid, member: 'r-1', kind: 'topic', text: '按目录的四参形' }, {})
    const goodParsed = typeof good === 'string' ? JSON.parse(good) : good
    ok(Boolean(goodParsed) && goodParsed.ok === true && (typeof goodParsed.motion === 'string' || (goodParsed.receipt && goodParsed.receipt.motion)),
      '§4e ★★★ 目录教的四参形真的投成动议', goodParsed && (goodParsed.code || goodParsed.motion))
  }

  console.log('=== 5. G23：input 行说明必须已绑定会议，真回合里这条边界成立 ===')
  {
    const note = String((row('input') || {}).note || '')
    ok(note.includes('绑定') && note.includes('会议'), '§5a input 行写明需要会议绑定', note)
    ok(note.includes('no-meeting-bound') || note.includes('跳过'), '§5b input 行写明无绑定会被具名跳过', note.slice(0, 200))
    ok(note.includes('vibe_v5_say'), '§5c input 行给出口头通道 vibe_v5_say', note.slice(0, 200))
    const b = await boot()
    await b.kernel.members.hire({ id: 'r-1', slot: 'member' })
    await b.kernel.turn.step({ members: ['r-1'], phase: 'normal', why: 'run147 §5' })
    await b.kernel.turn.supplyMemberReply(fenced({ input: '普通轮的发言' }), 'r-1')
    const step = await b.kernel.turn.step({ members: ['r-1'], phase: 'normal', why: 'run147 §5' })
    ok(Boolean(step) && step.ok === true, '§5d 轮次存活', step && step.code)
    const skipped = detailOf(step, 'skippedDetail').find((d) => d && d.field === 'input')
    ok(Boolean(skipped) && skipped.reason === 'no-meeting-bound', '§5e ★★ 无会议绑定的 input 被具名跳过 no-meeting-bound', skipped)
  }

  console.log('=== 6. G24：minutes 不是这个面的 action；活教学里 0 命中 ===')
  {
    const b = await boot()
    await b.kernel.members.hire({ id: 'r-chair', slot: 'chair' })
    const opened = await b.kernel.meetings.open({ type: 'planning', member: 'r-chair', agenda: 'run147 §6' })
    const mid = opened.meeting || opened.id
    const meetTool = b.specs.find((s) => s.name === 'vibe_vmu_meeting')
    let minutesRes = null
    try {
      const res = await meetTool.execute({ action: 'minutes', id: mid }, {})
      minutesRes = typeof res === 'string' ? JSON.parse(res) : res
    } catch (e) {
      minutesRes = { ok: false, code: e && e.code, message: e && e.message }
    }
    ok(Boolean(minutesRes) && minutesRes.ok === false && minutesRes.code === 'VMU_INVALID_ARGUMENT' && /unknown action: minutes/.test(String(minutesRes.message)),
      '§6a ★★★ action "minutes" 被具名拒（unknown action），旧教学教的是一条不存在的动作', minutesRes && (minutesRes.code + ' ' + String(minutesRes.message).slice(0, 100)))
    const statusRes = await meetTool.execute({ action: 'status', id: mid }, {})
    const statusParsed = typeof statusRes === 'string' ? JSON.parse(statusRes) : statusRes
    ok(Boolean(statusParsed) && statusParsed.ok !== false, '§6b status 是真的读法（会况）', statusParsed && (statusParsed.code || Object.keys(statusParsed).length))
    const summaryRes = await meetTool.execute({ action: 'summary', id: mid }, {})
    const summaryParsed = typeof summaryRes === 'string' ? JSON.parse(summaryRes) : summaryRes
    ok(Boolean(summaryParsed) && summaryParsed.ok !== false, '§6c summary 是真的读法（材料/动议/表决）', summaryParsed && (summaryParsed.code || Object.keys(summaryParsed).length))
    const noVerbatim = !Object.keys(summaryParsed || {}).some((k) => /speech|verbatim/i.test(k))
    ok(noVerbatim, '§6d ★ summary 里没有逐字发言字段（所以教学不许承诺逐字发言）', Object.keys(summaryParsed || {}))
    const sources = promptSources()
    ok(sources.length > 5, '§6e 扫描到的活提示词源文件数 > 5', sources.length)
    const minuteClaims = sources.filter((s) => {
      const re = /action\s*[:=]\s*["']minutes["']/g
      let m
      while ((m = re.exec(s.text)) !== null) {
        // A TRUTHFUL correction is allowed to NAME the dead action ("本面没有 action=… , 写了会被具名拒"); what must
        // not survive is a sentence TEACHING it. Every occurrence therefore has to be inside a refusal context.
        const window = s.text.slice(m.index, m.index + 200)
        if (!/没有|unknown action|VMU_INVALID_ARGUMENT|不存在的动/.test(window)) return true
      }
      return false
    })
    ok(minuteClaims.length === 0, '§6f ★★ 活提示词源里没有一句还在教 action: "minutes"（提及只允许出现在「没有/被拒」的语境里）', minuteClaims.map((s) => s.path))
    const deliveryClaims = sources.filter((s) => s.text.includes('会议轮投递'))
    ok(deliveryClaims.length === 0, '§6g ★★ 活提示词源里再也没有「会议轮投递」', deliveryClaims.map((s) => s.path))
  }

  console.log('=== 7. 装配后的真实提示词：每个席位都不再教不存在的路 ===')
  {
    for (const slot of ['chair', 'member', 'temp']) {
      const b = await boot({ 'vmu.turn.replyCatalogue': 'full' })
      await b.kernel.members.hire({ id: 'r-x', slot })
      await b.kernel.turn.step({ members: ['r-x'], phase: 'meeting', why: 'run147 §7 ' + slot })
      const turn = await b.kernel.turn.open({ member: 'r-x', phase: 'meeting', why: 'run147 §7 ' + slot })
      const asm = await b.kernel.turn.assemble(turn)
      const text = String(asm && asm.text !== undefined ? asm.text : asm)
      ok(text.length > 0, '§7a ' + slot + ' 装配出提示词', text.length)
      ok(!text.includes('action: "minutes"') && !text.includes('action="minutes"'), '§7b ' + slot + ' 提示词里没有 minutes 动作', text.length)
      ok(!text.includes('会议轮投递'), '§7c ' + slot + ' 提示词里没有「会议轮投递」')
      ok(!text.includes('convene 只有院士席能召集'), '§7d ' + slot + ' 提示词不再宣称「convene 只有院士席能召集」')
      ok(!text.includes('`convene_meeting` 可直接召集') && !text.includes('`convene_meeting` 只有院士席能召集'),
        '§7d2 ' + slot + ' 提示词不再把席位政策挂在回执字段上')
      ok(text.includes('vibe_v5_meeting { action: "convene"'), '§7e ' + slot + ' 提示词点名工具面召集路', text.includes('vibe_v5_meeting { action: "convene"'))
    }
  }
} catch (err) {
  failed++
  failures.push('uncaught: ' + (err && err.stack ? err.stack.split('\\n')[0] : String(err)))
  console.error('  FAIL uncaught — ' + (err && err.stack ? err.stack : String(err)))
} finally {
  for (const r of roots) {
    try { await rm(r, { recursive: true, force: true, maxRetries: 5 }) } catch (e) { console.log('  note: cleanup skipped for ' + r) }
  }
}

console.log('=== VMU RUN147 CONVENE FIELD: ' + passed + ' passed, ' + failed + ' failed ===')
if (failed > 0) {
  console.log('failures:')
  for (const f of failures) console.log('  - ' + f)
  process.exit(1)
}

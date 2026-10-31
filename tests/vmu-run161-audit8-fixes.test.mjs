#!/usr/bin/env node
// tests/vmu-run161-audit8-fixes.test.mjs — ★ RUN 161：第九次真机跑（tarball `1ce2d35a`，jsonl
// `full-1031-105821.jsonl`，代理报告 `FEEDBACK8.md` / `SIM-REPORT8.md`，`RUN7 VERDICT: PASS` 但七件事之外另有
// 十二条新账）的第一批修法。本套钉住六处「同一事实两个面说法不同 / 先断言后看事实」的缺陷：
//
//   (1) `recover` 的 watchdogs 步只把散文写进 report，durable 的 `status().watchdogs` 是同一组数字而无散文；且
//       `plan` 对「没有端口」说 `ok:false`、`recovery` 对同一件事说 `ok:true`（两个结论）⇒ `ok` 现在说的是
//       「这一步跑过」，端口在不在另说（`available`/`wired`），两个面都带 `means`。
//   (2) `nonAttending:[]` 与 `nonAttendingSeats:["temp"]` 同现（名册里根本没有 temp）读起来自相矛盾 ⇒
//       `nonAttendingSeats` 只列**本名册实际被移除的席位**，声明本身另立 `deniedSeatsDeclared` 并说明两者不同。
//   (3) `attend` 对已归档会议报 `VMU_NO_SUCH_OBJECT`，`message` 仍说「两份注册表里都没有」⇒ 关过的会议不在活表
//       但可读，`message` 必须自报「它关过、记录在归档里」（hint 只是补充，多数调用者只打 message）。
//   (4) `subjectGate.note` 固定串断言「这张卡还没登记 proofRef/proofState="complete"」，而卡上就是
//       `proofState:"complete"`（`rec-253`）⇒ note 从本调用真正读到的字段拼，说清缺的是哪一半。
//   (5) 保真拒绝语只给两个取值 `[conform | defect]`，不说**形参名** `fidelity` ⇒ 拒绝语带上可直接照抄的下一调。
//   (6) 工物四行的标题是 `v5r-paper|<state.target>|md`…，而 `PaperArtifacts` 用**调用方拼写**去查 ⇒ run 9 里
//       同一次 `final` 既报 `produced:true / pdfBytes:97422` 又报四行全缺。标题改由 state 的规范 target 拼，
//       并说明「缺的是 ARCHIVE ROW，不是造不出来」。
//
// Run: node tests/vmu-run161-audit8-fixes.test.mjs
// Last line: === RUN 161 AUDIT8 FIXES: N passed, M failed ===
import { readFileSync } from 'node:fs'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..')
const ENTRY = pathToFileURL(join(REPO, 'vibe-math-vmu', 'vibe-math-vmu.js')).href
const RESUME = join(REPO, 'vibe-math-vmu', 'kernel', 'resume.js')
const MEETINGS = join(REPO, 'vibe-math-vmu', 'kernel', 'meetings.js')
const GATES = join(REPO, 'vibe-math-vmu', 'packs', 'v5r', 'verification-gates.js')
const PAPER_KIT = join(REPO, 'vibe-math-vmu', 'kit', 'paper.js')
const TOOLS = join(REPO, 'vibe-math-vmu', 'packs', 'v5r', 'tools.js')
const MEETING_TOOL = join(REPO, 'vibe-math-vmu', 'tools', 'meeting.js')
const RESUME_SRC = readFileSync(RESUME, 'utf8')
const MEETINGS_SRC = readFileSync(MEETINGS, 'utf8')
const GATES_SRC = readFileSync(GATES, 'utf8')
const PAPER_KIT_SRC = readFileSync(PAPER_KIT, 'utf8')
const TOOLS_SRC = readFileSync(TOOLS, 'utf8')
const MEETING_TOOL_SRC = readFileSync(MEETING_TOOL, 'utf8')

let passed = 0
let failed = 0
const failures = []
const ok = (cond, label, detail) => {
  if (cond) { passed += 1; console.log('  ✓ ' + label); return true }
  failed += 1; failures.push(label + (detail === undefined ? '' : ' :: ' + JSON.stringify(detail)))
  console.log('  ✗ ' + label + (detail === undefined ? '' : ' :: ' + JSON.stringify(detail)))
  return false
}

const entry = await import(ENTRY)
const { createResume } = await import(pathToFileURL(RESUME).href)
const { createMeetings } = await import(pathToFileURL(MEETINGS).href)
const { debateSubjectGate, fidelityAsked } = await import(pathToFileURL(GATES).href)

// ── durable store contract (the shape tests/vmu-run160-run7-fixes.test.mjs uses) ──────────────────────────────────
const mkStore = (initial = {}) => {
  const data = new Map(Object.entries(initial))
  const copy = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)))
  return {
    export: () => ({ version: 1, keys: Object.fromEntries(data) }),
    read: (k) => copy(data.get(k)),
    patch: (k, fn) => { const next = fn(copy(data.get(k))); data.set(k, next); return { ok: true, key: k } },
    _raw: data,
  }
}
const stepOf = (report, name) => ((report && report.steps) || []).find((s) => s && s.step === name) || null

// ── tool-level harness (real assembly; the seam runs 155/156/158/159/160 use) ────────────────────────────────────
const roots = []
const bootTools = async (settings = {}) => {
  const root = await mkdtemp(join(tmpdir(), 'vmu-run161-'))
  roots.push(root)
  process.chdir(root)
  const state = { specs: [] }
  const ctx = {
    effect(fn) { return fn() },
    on() { return () => {} },
    tools: { register: async (spec) => { state.specs.push(spec); return () => {} } },
    get() { return undefined },
  }
  const handle = entry.apply(ctx, Object.assign({ root, packs: ['v5r'], clock: () => 1000, deliverMode: 'caller' }, settings))
  await handle.ready()
  const kernel = handle.kernel
  await kernel.members.hire({ id: 'r-chair', slot: 'chair' })
  await kernel.members.hire({ id: 'r-1', slot: 'member' })
  await kernel.members.hire({ id: 'r-2', slot: 'member' })
  return { root, kernel, specs: state.specs }
}
const TOOL = (specs, name) => specs.find((s) => s.name === name)
const parse = (res) => (typeof res === 'string' ? JSON.parse(res) : res)
const call = async (specs, name, args) => {
  const spec = TOOL(specs, name)
  if (!spec) return { ok: false, code: 'NO_SUCH_TOOL', message: name }
  try { return parse(await spec.execute(args, {})) } catch (e) {
    return { ok: false, code: (e && e.code) || null, message: (e && e.message) || String(e), hint: (e && e.hint) || null }
  }
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
console.log('§0 源码口径：六处修法各在自己的所有者上（行为由 §1–§6 钉住）')
{
  ok(RESUME_SRC.includes('ok: true, available: !!watchdogs')
    && RESUME_SRC.includes('availableMeans'),
    '(1) plan 的 watchdogs 步：ok 是「这一步跑过」，端口在不在由 available/availableMeans 说')
  ok(RESUME_SRC.includes('wd.means = wdMeans') && RESUME_SRC.includes('wd.wired = !!(watchdogs')
    && RESUME_SRC.includes('wd.ok = !wd.error'),
    '(1) status 面与 act 面同源：means/wired/ok 写进 durable 的 state.watchdogs')
  ok(MEETINGS_SRC.includes('deniedSeatsDeclared: deniedSeats.slice()')
    && MEETINGS_SRC.includes('rosterSeatOf.get(String(r))')
    && MEETINGS_SRC.includes('deniedSeatsDeclaredMeans'),
    '(2) nonAttendingSeats 只列本名册实际被移除的席位；声明另立 deniedSeatsDeclared')
  ok(MEETING_TOOL_SRC.includes('const archivedRowOf = (idv) =>') && MEETING_TOOL_SRC.includes('it WAS here: this meeting is CLOSED'),
    '(3) noSuchMeeting 的 message 自报关过的会议在归档里（不只 hint）')
  ok(GATES_SRC.includes('proofState === PROOF_STATE_COMPLETE')
    && GATES_SRC.includes('但 proofRef 是空的'),
    '(4) subjectGate.note 从本调用读到的字段拼（说清缺的是哪一半）')
  ok(GATES_SRC.includes('`fidelity` 是形参名'), '(5) 保真拒绝语点名形参 `fidelity`')
  ok(PAPER_KIT_SRC.includes('const canon = found && found.state') && PAPER_KIT_SRC.includes('missingMeans:')
    && TOOLS_SRC.includes('missingMeans: finalized.missingMeans || null'),
    '(6) 工物行标题用 state 的规范 target；缺失语义随列表一起传')
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
console.log('§1 (1) watchdogs：status 面带散文、plan 与 act 不再对同一件事说两个结论（真 createResume）')
{
  // (1a) 没有端口：status().watchdogs 必须带 means/wired/ok，而不是只有目标数的空壳
  {
    const r = createResume({ store: mkStore({ work: [] }), clock: () => 1000 })
    await r.read()
    await r.recover({ reason: 'run161-wd-absent' })
    const w = r.status().watchdogs || {}
    ok(w.attached === false && w.targets === null && w.wired === false && w.ok === true,
      '(1a) status 面：未接线 ⇒ attached:false、targets:null、wired:false、ok:true（这一步跑过了）',
      { attached: w.attached, targets: w.targets, wired: w.wired, ok: w.ok })
    ok(typeof w.means === 'string' && /no watchdog port/i.test(w.means) && /never a manufactured 0|manufactured/i.test(w.means),
      '(1a) status 面自带散文（FEEDBACK8 1.4-1 说这一面把 `means` 丢了）', w.means)
    const planWd = stepOf(r.recoverPlan({ reason: 'run161-plan-absent' }), 'watchdogs') || {}
    ok(planWd.ok === true && planWd.available === false,
      '(1a) plan 面：ok:true（这一步会被计划执行）+ available:false（没有端口），不再是 ok:false',
      { ok: planWd.ok, available: planWd.available })
    ok(typeof planWd.availableMeans === 'string' && /NOT wired/.test(planWd.availableMeans),
      '(1a) plan 面说明「没有端口」是配置出来的缺席，不是失败', planWd.availableMeans)
  }

  // (1b) 端口接线且真的 0 个目标：这是测量到的零，和「没接线」是不同的事实
  {
    const watchdogs = { targets: () => [], touch: () => ({ ok: true }), refresh: () => ({ refreshed: [] }) }
    const r = createResume({ store: mkStore({ work: [] }), clock: () => 1000, watchdogs })
    await r.read()
    await r.recover({ reason: 'run161-wd-zero' })
    const w = r.status().watchdogs || {}
    ok(w.attached === true && w.targets === 0 && w.wired === true && w.ok === true,
      '(1b) status 面：接线且 0 目标 ⇒ targets:0（测量到的零）、wired:true',
      { attached: w.attached, targets: w.targets, wired: w.wired, ok: w.ok })
    ok(typeof w.means === 'string' && /MEASURED/i.test(w.means),
      '(1b) status 面的散文说这个零是测量出来的', w.means)
  }
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
console.log('§2 (2) 一致性读数：`nonAttendingSeats` 只列本名册被移除的席位，声明另立字段（真 meetings 面）')
{
  const bench = {
    roster: () => [
      { id: 'acad', slot: 'chair' },
      { id: 'r-1', slot: 'member' },
      { id: 'r-temp', slot: 'temp' },
    ],
  }
  const mk = (settings) => createMeetings({
    clock: () => 1000,
    settings: { get: (k) => settings[k] },
    members: bench,
  })
  const rule = { 'vmu.meetings.quorumRule': 'm-unanimous', 'vmu.meetings.quorumCap': 0 }

  // (2a) 名册里有 temp 席：被排除的成员与它所在的席位都具名
  {
    const t = mk(Object.assign({ 'vmu.meetings.attendDeniedSeats': ['temp'] }, rule))
    const id = t.open({ type: 'ordinary', chair: 'acad', roster: ['acad', 'r-1', 'r-temp'] }).meeting
    t.attend({ meeting: id, member: 'acad' })
    t.attend({ meeting: id, member: 'r-1' })
    const u = t.quorum({ meeting: id }).unanimity
    ok(u.met === true && u.nonAttending.includes('r-temp') && u.nonAttendingSeats.includes('temp'),
      '(2a) 名册里有 temp 席：一致性可达 true，成员与席位都具名',
      { met: u.met, nonAttending: u.nonAttending, nonAttendingSeats: u.nonAttendingSeats })
    ok(Array.isArray(u.deniedSeatsDeclared) && u.deniedSeatsDeclared.includes('temp'),
      '(2a) 声明本身另立 deniedSeatsDeclared', u.deniedSeatsDeclared)
  }

  // (2b) 名册里没有 temp 席：声明照样在，但 nonAttending/nonAttendingSeats 必须都是空 —— 不再自相矛盾
  {
    const t = mk(Object.assign({ 'vmu.meetings.attendDeniedSeats': ['temp'] }, rule))
    const id = t.open({ type: 'ordinary', chair: 'acad', roster: ['acad', 'r-1'] }).meeting
    t.attend({ meeting: id, member: 'acad' })
    t.attend({ meeting: id, member: 'r-1' })
    const u = t.quorum({ meeting: id }).unanimity
    ok(u.nonAttending.length === 0 && u.nonAttendingSeats.length === 0,
      '(2b) 名册里没有该席位的人：nonAttending 与 nonAttendingSeats 都为空（FEEDBACK8 2.4-2 的矛盾消失）',
      { nonAttending: u.nonAttending, nonAttendingSeats: u.nonAttendingSeats })
    ok(u.deniedSeatsDeclared.includes('temp'),
      '(2b) 声明仍在 deniedSeatsDeclared 里（声明 ≠ 计数）', u.deniedSeatsDeclared)
    ok(u.met === true, '(2b) 全员到齐 ⇒ 一致性成立', u.met)
  }
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
console.log('§3 (3) 已归档会议：`message` 自己说「它关过、记录在归档里」（真工具回执）')
{
  const { specs } = await bootTools({})
  const opened = await call(specs, 'vibe_v5_meeting', { action: 'convene', member: 'r-chair', agenda: ['run161 archived message'], members: ['r-chair', 'r-1'] })
  ok(opened.ok === true, '(3) 会议开起来了', opened.ok === false ? opened : undefined)
  const id = String((opened.meeting && (opened.meeting.id || opened.meeting)) || opened.id || '')
  const closed = await call(specs, 'vibe_vmu_meeting', { action: 'close', id, member: 'r-chair' })
  ok(closed.ok === true, '(3) 会议已关闭（归档）', closed.ok === false ? closed : undefined)
  const attended = await call(specs, 'vibe_vmu_meeting', { action: 'attend', id, member: 'r-1' })
  ok(attended.ok === false && attended.code === 'VMU_NO_SUCH_OBJECT',
    '(3) 对归档会议 attend 仍被具名拒', { ok: attended.ok, code: attended.code })
  const message = String(attended.message || '')
  ok(/CLOSED/.test(message) && /archive/.test(message),
    '(3) message 本体自报「它关过、记录在归档里」（不是只说 no meeting with id）', message)
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
console.log('§4 (4) subjectGate.note 与卡上事实一致；保真拒绝语点名形参（真 gate 函数）')
{
  // (4a) 卡上写了 proofState=complete 但 proofRef 空：note 必须说「缺的是 proofRef」，不能说「没登记 complete」
  {
    const gate = debateSubjectGate({
      meeting: { type: 'debate' },
      subject: 'rec-161',
      evidence: { card: { proofRef: null, proofState: 'complete' }, lean: { passed: true, state: 'settled' } },
    })
    const note = String(gate.note || '')
    ok(gate.allowed === true, '(4a) 有机器证据 ⇒ 放行', { allowed: gate.allowed, note })
    ok(/proofState="complete"/.test(note) && /proofRef 是空的/.test(note),
      '(4a) note 说清「写完了有登记、写在哪没登记」', note)
    ok(!/还没登记 proofRef\/proofState/.test(note),
      '(4a) 不再断言「还没登记 proofRef/proofState="complete"」（对 rec-253 是假话）', note)
  }
  // (4b) 卡上什么都没写：note 报两个真实取值（空）
  {
    const gate = debateSubjectGate({
      meeting: { type: 'debate' },
      subject: 'rec-161b',
      evidence: { card: { proofRef: null, proofState: null }, lean: { passed: true, state: 'settled' } },
    })
    const note = String(gate.note || '')
    ok(/既没登记 proofRef（空）/.test(note) && /没有 proofState="complete"（空）/.test(note),
      '(4b) 两样都空时 note 直说两个取值都是空', note)
  }
  // (4c) 保真拒绝语必须给出形参名，否则调用者只能猜
  {
    const asked = fidelityAsked({ cardId: 'rec-161', leanPassed: true, p: 0.6 })
    ok(asked.allowed === false, '(4c) p≠1 且没答保真 ⇒ 拒', { allowed: asked.allowed })
    ok(typeof asked.hint === 'string' && /`fidelity` 是形参名/.test(asked.hint) && /fidelity:"conform"/.test(asked.hint),
      '(4c) hint 点名形参 `fidelity` 并给出两个取值的写法', asked.hint)
  }
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
console.log('§5 (5) 论文工物：行标题按 state 的规范 target 查，两种拼写读数一致（真工具调用）')
{
  const { specs } = await bootTools({})
  const started = await call(specs, 'vibe_v5_paper', { action: 'start', target: 'run161 artefacts', editor: 'academician', participants: ['r-1'] })
  ok(started.ok === true, '(5) 论文开起来了', started.ok === false ? started : undefined)
  // the receipt nests the kit's answer under `started` (ids are minted there: `paper-pN`).
  const id = String((started.started && started.started.id) || (started.paper && started.paper.id) || started.id || '')
  const rendered = await call(specs, 'vibe_v5_paper', { action: 'render', target: id })
  ok(rendered.ok === true, '(5) 用 id 渲染成功（id 可寻址）', { id, ok: rendered.ok, message: rendered.message })
  const present = rendered.present || {}
  ok(present.md === true && present.tex === true && present.meta === true,
    '(5) 同一次 render 里 md/tex/meta 三行都查到了（行标题按 state 的 target 拼）', present)
  ok(Array.isArray(rendered.missing) && rendered.missing.length === 1 && rendered.missing[0] === 'pdf',
    '(5) 只有 pdf 这一行还缺（还没有 compile）', rendered.missing)
}
{
  // (5b) 调用方用标题拼写：与用 id 的读数必须一致（不再出现「同一次调用既 produced 又四行全缺」）
  const { specs } = await bootTools({})
  const started = await call(specs, 'vibe_v5_paper', { action: 'start', target: 'run161 by title', editor: 'academician', participants: ['r-1'] })
  const id = String((started.started && started.started.id) || (started.paper && started.paper.id) || started.id || '')
  const byId = await call(specs, 'vibe_v5_paper', { action: 'render', target: id })
  const byTitle = await call(specs, 'vibe_v5_paper', { action: 'render', target: 'run161 by title' })
  const p1 = byId.present || {}
  const p2 = byTitle.present || {}
  // non-vacuous: both sides are the four-name artefact map of a REAL render (md/tex/meta present, pdf absent), so an
  // equality of two empty objects is excluded by construction — the two keys sets are named here, not assumed.
  ok(Object.keys(p1).length === 4 && Object.keys(p2).length === 4 && p1.md === true && p2.md === true,
    '(5b) 两次渲染都真的报出了四个工物名（不是两个空对象相比）', { byId: p1, byTitle: p2 })
  ok(JSON.stringify(p1) === JSON.stringify(p2),
    '(5b) 用 id 与用标题两种拼写的 present 完全一致', { byId: p1, byTitle: p2 })
  ok(Array.isArray(byTitle.missing) && byTitle.missing.length === 1 && byTitle.missing[0] === 'pdf',
    '(5b) 用标题拼写时也只有 pdf 缺', byTitle.missing)
}

console.log('')
console.log('=== RUN 161 AUDIT8 FIXES: ' + passed + ' passed, ' + failed + ' failed ===')
if (failed > 0) { for (const f of failures) console.log('FAILED :: ' + f); process.exit(1) }

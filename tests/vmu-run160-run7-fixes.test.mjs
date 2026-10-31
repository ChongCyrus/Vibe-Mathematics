#!/usr/bin/env node
// tests/vmu-run160-run7-fixes.test.mjs — ★ RUN 160：第八次真机跑（续跑，tarball `8c6f8c4f`，jsonl
// `full-1031-094327.jsonl`，代理报告 `FEEDBACK7.md` / `SIM-REPORT7.md`，`RUN7 VERDICT: PASS` 但七件事里
// 第 2 件只做到一半、另有四条新账）的四条修法。
//
//   (1) watchdogs 把「未接线」与「0 个目标」折叠成同一个 `targets: 0` ⇒ 未接线/端口抛错时 `targets: null`
//       （没测量过的零是制造的），三态各有 `means` 散文，与 `children` 步同形。
//   (2) 规则 m-unanimous 在含 temp 席的名册上结构性不可达（`attend` 拒 temp 到会，一致性却等它）⇒ 一致性的
//       选择体 = 名册 − `vmu.meetings.attendDeniedSeats` 席位，被排除的成员在 `nonAttending` 里具名。
//   (3) `attend` 对已归档会议报 `VMU_NO_SUCH_OBJECT` 而 hint 只说「哪几个 id 是活的」⇒ hint 必须说明「关会从
//       两张活表消失」并指向仍读归档的 `vibe_v5_verdict_ask` / `vibe_v5_verdict_final`。
//   (4) `verdict_final` 的 `fidelity.lean` 恒 `"none"`，而同卡 `proofStateEvidence.jobId` 有 Lean 作业 ⇒ 调用者
//       没传 `lean_job`/`lean_passed` 时读卡自己的 `leanJob`，并说明来源。
//
// Run: node tests/vmu-run160-run7-fixes.test.mjs
// Last line: === RUN 160 RUN7 FIXES: N passed, M failed ===
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
const MEETING_TOOL = join(REPO, 'vibe-math-vmu', 'tools', 'meeting.js')
const TOOLS = join(REPO, 'vibe-math-vmu', 'packs', 'v5r', 'tools.js')
const RESUME_SRC = readFileSync(RESUME, 'utf8')
const MEETINGS_SRC = readFileSync(MEETINGS, 'utf8')
const MEETING_TOOL_SRC = readFileSync(MEETING_TOOL, 'utf8')
const TOOLS_SRC = readFileSync(TOOLS, 'utf8')

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

// ── durable store contract (the shape tests/vmu-resume-recovery.test.mjs uses) ────────────────────────────────────
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

// ── tool-level harness (real assembly; the seam runs 155/156/158/159 use) ─────────────────────────────────────────
const roots = []
const bootTools = async (settings = {}) => {
  const root = await mkdtemp(join(tmpdir(), 'vmu-run160-'))
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
console.log('§0 源码口径：四处修法各在自己的所有者上（行为由 §1–§4 钉住）')
{
  ok(RESUME_SRC.includes('let wd = { attached: false, targets: null, refreshed: [] }')
    && (RESUME_SRC.split('targets: null, refreshed: []').length - 1) >= 2,
    '(1) watchdogs 的「未接线」与「端口抛错」两支 targets 是 null（不是制造的 0）')
  ok(RESUME_SRC.includes('const wdMeans = wd.attached === true')
    && RESUME_SRC.includes('this zero was MEASURED')
    && RESUME_SRC.includes('a zero nobody measured is manufactured'),
    '(1) watchdogs 三态各有 means 散文，且区分「测量到的零」与「没测量」')
  ok(MEETINGS_SRC.includes('function mailboxProbe') === false && MEETINGS_SRC.includes('nonAttendingSeats')
    && MEETINGS_SRC.includes('nonAttendingMeans'),
    '(2) 一致性的选择体排除 attendDeniedSeats，并具名 nonAttending')
  ok(MEETING_TOOL_SRC.includes('a CLOSED meeting is in NEITHER live table')
    && MEETING_TOOL_SRC.includes('meetingArchived:true'),
    '(3) 归档会议的拒绝 hint 说明关会离开活表并指向仍读归档的面')
  ok(TOOLS_SRC.includes('const cardLeanJob = (() => {')
    && TOOLS_SRC.includes("source: 'card'")
    && TOOLS_SRC.includes('leanSourceMeans'),
    '(4) verdict_final 在调用者没传 Lean 证据时读卡自己的 leanJob，并报来源')
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
console.log('§1 (1) watchdogs 三态：未接线 targets:null、接线 0 目标 targets:0、端口抛错 targets:null（真 recover 报告）')
{
  // (1a) 根本没有 watchdog 端口：targets 必须是 null —— 一个没测量过的零是制造的
  {
    const r = createResume({ store: mkStore({ work: [] }), clock: () => 1000 })
    await r.read()
    const w = stepOf(await r.recover({ reason: 'run160-wd-absent' }), 'watchdogs')
    ok(!!w && w.attached === false && w.targets === null,
      '(1a) 未接线：attached:false 且 targets:null（不是 0）', w && { attached: w.attached, targets: w.targets })
    ok(!!w && w.code === 'VMU_RESUME_WATCHDOGS_UNAVAILABLE',
      '(1a) 未接线：具名 VMU_RESUME_WATCHDOGS_UNAVAILABLE', w && w.code)
    ok(!!w && typeof w.means === 'string' && /never 0|manufactured/i.test(w.means) && /no watchdog port/i.test(w.means),
      '(1a) 未接线：means 说明「没有人看过，所以不是 0」', w && w.means)
    ok(!!w && w.note === w.means, '(1a) note 与 means 是同一句话（不造第二个名字）', w && { note: w.note })
  }

  // (1b) 端口接线且真的 0 个目标：这是「测量到的零」，可以是数字 0 —— 与 (1a) 是不同的事实
  {
    const watchdogs = {
      targets: () => [],
      touch: () => ({ ok: true }),
      refresh: () => ({ refreshed: [] }),
    }
    const r = createResume({ store: mkStore({ work: [] }), clock: () => 1000, watchdogs })
    await r.read()
    const w = stepOf(await r.recover({ reason: 'run160-wd-zero' }), 'watchdogs')
    ok(!!w && w.attached === true && w.targets === 0 && w.code === 'VMU_RESUME_WATCHDOGS_NONE',
      '(1b) 接线且 0 目标：attached:true、targets:0、具名 VMU_RESUME_WATCHDOGS_NONE', w && { attached: w.attached, targets: w.targets, code: w.code })
    ok(!!w && /MEASURED/i.test(String(w.means)),
      '(1b) means 明确说这个零是测量出来的', w && w.means)
  }

  // (1c) 端口接线但刷新抛错：OK 必须是 false，且 targets 仍是 null（问失败≠0 个）
  {
    // `listOf` keeps STRINGS only (a non-string row is not a target), so the port hands over ids.
    const watchdogs = {
      targets: () => ['w-1'],
      touch: () => { throw new Error('watchdog store refused') },
    }
    const r = createResume({ store: mkStore({ work: [] }), clock: () => 1000, watchdogs })
    await r.read()
    const w = stepOf(await r.recover({ reason: 'run160-wd-fail' }), 'watchdogs')
    ok(!!w && w.ok === false && w.attached === false && w.targets === null,
      '(1c) 端口抛错：ok:false、targets:null（不是 0 个目标）', w && { ok: w.ok, targets: w.targets })
    ok(!!w && w.code === 'VMU_RESUME_WATCHDOGS_PORT_FAILED',
      '(1c) 端口抛错：具名 VMU_RESUME_WATCHDOGS_PORT_FAILED（不与「未接线」同形）', w && w.code)
  }
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
console.log('§2 (2) m-unanimous 在含 temp 席的名册上可达：选择体排除禁到会的席位并具名（真 meetings 面）')
{
  const bench = {
    roster: () => [
      { id: 'acad', slot: 'chair' },
      { id: 'r-1', slot: 'member' },
      { id: 'r-2', slot: 'member' },
      { id: 'r-temp', slot: 'temp' },
    ],
  }
  const mk = (settings) => createMeetings({
    clock: () => 1000,
    settings: { get: (k) => settings[k] },
    members: bench,
  })
  const roster = ['acad', 'r-1', 'r-temp']

  // (2a) run 8 的那份名册：temp 席在册、被声明禁止到会 ⇒ 一致性必须可达 true，而不是永远等一个到不了的人
  {
    const t = mk({ 'vmu.meetings.quorumRule': 'm-unanimous', 'vmu.meetings.quorumCap': 0, 'vmu.meetings.attendDeniedSeats': ['temp'] })
    const id = t.open({ type: 'ordinary', chair: 'acad', roster }).meeting
    t.attend({ meeting: id, member: 'acad' })
    t.attend({ meeting: id, member: 'r-1' })
    const q = t.quorum({ meeting: id })
    ok(q.unanimity.met === true,
      '(2a) 除开禁到会的席位后全员到齐 ⇒ unanimity.met 为 true（run 8 里它恒 false）',
      { met: q.unanimity.met, unanswered: q.unanimity.unanswered, nonAttending: q.unanimity.nonAttending })
    ok(Array.isArray(q.unanimity.nonAttending) && q.unanimity.nonAttending.includes('r-temp'),
      '(2a) 被排除的 temp 席在 nonAttending 里具名（不是悄悄减掉）', q.unanimity.nonAttending)
    ok(q.unanimity.nonAttendingSeats.includes('temp'),
      '(2a) nonAttendingSeats 说明了是哪个席位被声明禁到会', q.unanimity.nonAttendingSeats)
    ok(q.unanimity.unanswered.length === 0 && q.unanimity.electorate === 2,
      '(2a) unanswered 只剩真正该到而没到的人（此刻为空），electorate=2', { unanswered: q.unanimity.unanswered, electorate: q.unanimity.electorate })
    ok(/EVERY roster member/.test(String(q.unanimity.policy)) && /attendDeniedSeats/.test(String(q.unanimity.policy)),
      '(2a) policy 仍点名规则（EVERY roster member），并说明选择体如何排除', q.unanimity.policy)
  }

  // (2b) 反向：没有那条声明时，temp 席照样被等待 ⇒ unanimity.met 为 false（声明是唯一的差别）
  {
    const t = mk({ 'vmu.meetings.quorumRule': 'm-unanimous', 'vmu.meetings.quorumCap': 0 })
    const id = t.open({ type: 'ordinary', chair: 'acad', roster }).meeting
    t.attend({ meeting: id, member: 'acad' })
    t.attend({ meeting: id, member: 'r-1' })
    const q = t.quorum({ meeting: id })
    ok(q.unanimity.met === false && q.unanimity.unanswered.includes('r-temp'),
      '(2b) 没有声明时仍等 r-temp（声明才是差别，不是把 temp 一律忽略）', { met: q.unanimity.met, unanswered: q.unanimity.unanswered })
    ok(q.unanimity.nonAttending.length === 0 && q.unanimity.electorate === 3,
      '(2b) 没有声明时 electorate 就是整份名册', { electorate: q.unanimity.electorate })
  }

  // (2c) 真正的缺席者即使有声明也仍然挡路（排除的是「到不了的席位」，不是「缺席的人」）
  {
    const t = mk({ 'vmu.meetings.quorumRule': 'm-unanimous', 'vmu.meetings.quorumCap': 0, 'vmu.meetings.attendDeniedSeats': ['temp'] })
    const id = t.open({ type: 'ordinary', chair: 'acad', roster }).meeting
    t.attend({ meeting: id, member: 'acad' })
    const q = t.quorum({ meeting: id })
    ok(q.unanimity.met === false && q.unanimity.unanswered.includes('r-1'),
      '(2c) 缺席的常驻研究员仍然挡路（排除只针对禁到会席位）', { met: q.unanimity.met, unanswered: q.unanimity.unanswered })
  }
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
console.log('§3 (3) 已归档会议：attend 的拒绝 hint 说明「关会离开活表」并指向仍读归档的裁决面')
{
  {
    const { specs } = await bootTools({})
    // `vibe_v5_meeting` only CONVENES (member + agenda; `members` narrows the invited subset).
    const opened = await call(specs, 'vibe_v5_meeting', { action: 'convene', member: 'r-chair', agenda: ['run160 archived-id hint'], members: ['r-chair', 'r-1'] })
    ok(opened.ok === true, '(3) 会议开起来了', opened.ok === false ? opened : undefined)
    const id = String((opened.meeting && (opened.meeting.id || opened.meeting)) || opened.id || '')
    // closing is a KERNEL action on the primitive/service face (`vibe_v5_meeting` has no close).
    const closed = await call(specs, 'vibe_vmu_meeting', { action: 'close', id, member: 'r-chair' })
    ok(closed.ok === true, '(3) 会议已关闭（归档）', closed.ok === false ? closed : undefined)
    const attended = await call(specs, 'vibe_vmu_meeting', { action: 'attend', id, member: 'r-1' })
    ok(attended.ok === false && attended.code === 'VMU_NO_SUCH_OBJECT',
      '(3) 对归档会议 attend 被具名拒（关会从活表消失）', { ok: attended.ok, code: attended.code })
    ok(typeof attended.hint === 'string'
      && /CLOSED meeting is in NEITHER live table/.test(attended.hint)
      && /vibe_v5_verdict_ask/.test(attended.hint)
      && /vibe_v5_verdict_final/.test(attended.hint),
      '(3) hint 说明归档会议不在活表，并指向仍读归档的裁决面', attended.hint)
  }
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
console.log('§4 (4) verdict_final 读卡自己的 Lean 作业：fidelity.lean 不再是 "none"（真工具调用）')
{
  {
    const { kernel, specs } = await bootTools({})
    const rec = await call(specs, 'vibe_v5_record_proposition', {
      id: 'rec-160', statement: 'run160 impl pin', value: 0.5, member: 'r-1',
      motive: 'run 160 pins the card-read Lean evidence', p: 0.5,
    })
    ok(rec.ok === true, '(4) 命题卡写成', rec.ok === false ? rec : undefined)
    // the card carries its own Lean job and a complete proof state — that is what `proofStateEvidence` reads.
    const card = await kernel.records.get({ id: 'rec-160' })
    await kernel.records.put({ id: 'rec-160', track: card.track, kind: card.kind, title: card.title,
      body: String(card.body) + '\n- leanJob: lean-run160\n- proofState: complete\n' })
    // a SERVICE meeting must be OPEN (verdict_final addresses the service registry), and the ruling needs at least
    // one filled verdict — both are the tool's declared contracts, not workarounds.
    const opened = await call(specs, 'vibe_v5_meeting', {
      action: 'convene', member: 'r-chair', agenda: ['run160 lean-evidence'], members: ['r-chair', 'r-1'],
    })
    const meetingId = String((opened.meeting && (opened.meeting.id || opened.meeting)) || opened.id || '')
    // RUN 163 made the floor bite by arithmetic: the denominator is the INSTITUTE's voter seats (chair + 2 members
    // = 3), so a ruling signed by r-1 alone is 2 of 3. Declaring it partial is the sanctioned shape for that
    // (and it is what a reduced roster must do) — the lean-evidence path under test is unchanged.
    const finals = await call(specs, 'vibe_v5_verdict_final', {
      meeting: meetingId, proposition_id: 'rec-160', owner: 'r-1',
      verdicts: [{ member: 'r-1', p: 1, reason: 'run160 lean evidence pin' }],
      partial: true, why: 'run 160 pins the card-read Lean evidence on a two-seat probe meeting',
    })
    const fidelity = finals.fidelity || {}
    ok(finals.ok !== undefined, '(4) verdict_final 有回执', finals.ok === false ? finals.message : undefined)
    ok(fidelity.lean !== 'none',
      '(4) fidelity.lean 不再是 "none"（调用者没传 Lean 证据，卡自己有 leanJob）', { lean: fidelity.lean, cardJob: fidelity.cardJob })
    ok(fidelity.leanSource === 'card' && fidelity.cardJob === 'lean-run160',
      '(4) 来源自报 card，并点名卡上的作业 id', { leanSource: fidelity.leanSource, cardJob: fidelity.cardJob })
    ok(/card/i.test(String(fidelity.leanSourceMeans)) && /leanJob/.test(String(fidelity.leanSourceMeans)),
      '(4) leanSourceMeans 说明「读了这张卡自己的 leanJob」', fidelity.leanSourceMeans)
  }
}

console.log('')
console.log('=== RUN 160 RUN7 FIXES: ' + passed + ' passed, ' + failed + ' failed ===')
if (failed) { for (const f of failures) console.log('  FAILED: ' + f); process.exitCode = 1 }

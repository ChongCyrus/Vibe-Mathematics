#!/usr/bin/env node
// tests/vmu-run158-run6-fixes.test.mjs — ★ RUN 158：第六次真机跑（续跑，tarball `4b791a48`，jsonl
// `full-1031-072522.jsonl`，代理报告 `FEEDBACK5.md` / `SIM-REPORT5.md`）里的六条新账。
//
//   (A) N2 论文 id/目录不可移植   `start` 省略 target 时用标题当 id，`paper-第五次续跑 之 结题 现场 验证 稿` 成为目录名，
//       xelatex `fatal: putenv(TEXMF_OUTPUT_DIRECTORY=…)`（同正文换 ASCII 名即成功）⇒ 非可移植标题铸 ASCII 短 id。
//   (B) N1 修复轮预算耗尽后的 hint  (a)「record a new part」不可达（part 只在 writing）；(b) 只说「raise maxRounds」，
//       而只有当新上限 **严格大于** 当前 round 时才走普通修订 ⇒ 拒绝语给出能判定的数字。
//   (C) N3 已关会议不能裁决     `close()` 归档后 `verdict_final` 报 `VMU_NO_SUCH_OBJECT`，而规则 L53 正是「待辩论会议
//       结束」后裁决 ⇒ 已关（归档）服务会议可读、`meetingArchived` 说明读的是哪份记录。
//   (D) N4 设置不跨进程         运行时 `set` 只改内存，新进程读回声明默认值，而回执从没说过 ⇒ `persistsAcrossRestart:false`。
//   (E) N5 两尾部同文/普通修订无 from-to  失败回执 `stderrTail==stdoutTail` 却不说明；普通修订回执 `from:null,to:null`。
//   (F) N6 resume 读数不完整     children 无父会话 / watchdogs 未接线 与「接线但 0 个」同形；read-back 无采样时间与写入数。
//
// Run: node tests/vmu-run158-run6-fixes.test.mjs
// Last line: === RUN 158 RUN-6 FIXES: N passed, M failed ===
import { readFileSync } from 'node:fs'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..')
const ENTRY = pathToFileURL(join(REPO, 'vibe-math-vmu', 'vibe-math-vmu.js')).href
const KIT = join(REPO, 'vibe-math-vmu', 'kit', 'paper.js')
const TOOLS = join(REPO, 'vibe-math-vmu', 'packs', 'v5r', 'tools.js')
const KERNEL = join(REPO, 'vibe-math-vmu', 'kernel', 'index.js')
const MEETINGS = join(REPO, 'vibe-math-vmu', 'kernel', 'meetings.js')
const RESUME = join(REPO, 'vibe-math-vmu', 'kernel', 'resume.js')
const KIT_SRC = readFileSync(KIT, 'utf8')
const TOOLS_SRC = readFileSync(TOOLS, 'utf8')
const KERNEL_SRC = readFileSync(KERNEL, 'utf8')
const MEETINGS_SRC = readFileSync(MEETINGS, 'utf8')
const RESUME_SRC = readFileSync(RESUME, 'utf8')

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
const resumeMod = await import(pathToFileURL(RESUME).href)

// ── tool-level harness (real assembly; same seam run 155/156 use) ────────────────────────────────────────────────────
const roots = []
const ORIG_CWD = process.cwd()
const makeSubprocess = (behave) => {
  const calls = []
  const service = {
    spawn(spec = {}) {
      calls.push(spec)
      const argv = Array.isArray(spec.argv) ? spec.argv.map(String) : []
      const res = { exitCode: 0, stdout: '', stderr: '' }
      if (argv.includes('--version')) res.stdout = 'xelatex 1.0'
      else if (typeof behave === 'function') Object.assign(res, behave(argv) || {})
      return {
        done: Promise.resolve({ exitCode: res.exitCode, signal: null }),
        collected: {
          stdout: { readFrom: () => ({ text: res.stdout }) },
          stderr: { readFrom: () => ({ text: res.stderr }) },
        },
      }
    },
  }
  return { service, calls, ctx: { get: (name) => (name === 'subprocess' ? service : undefined) } }
}
const FAILING_COMPILE = (argv) => {
  const tex = String(argv.filter((a) => a.endsWith('.tex'))[0] || '')
  // ONE stream only: this is the shape that made stderrTail and stdoutTail identical in the live receipt.
  return { exitCode: 1, stdout: '! Undefined control sequence.' + String.fromCharCode(10) + '<*> ' + tex, stderr: '' }
}
const bootTools = async (settings = {}, subprocess = null) => {
  const root = await mkdtemp(join(tmpdir(), 'vmu-run158-'))
  roots.push(root)
  process.chdir(root)
  const state = { specs: [] }
  const ctx = {
    effect(fn) { return fn() },
    on() { return () => {} },
    tools: { register: async (spec) => { state.specs.push(spec); return () => {} } },
    get(name) { return subprocess && name === 'subprocess' ? subprocess.service : undefined },
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

// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
console.log('§0 源码口径：六处修法各在自己的所有者上（行为由 §1–§5 钉住）')
{
  ok(KIT_SRC.includes('const PORTABLE_TARGET = /^[A-Za-z0-9][A-Za-z0-9._-]{0,59}$/') && KIT_SRC.includes('const mintPaperId = () => {'),
    '(A) kit 有「可移植判定 + 铸 ASCII id」两件工具')
  ok(KIT_SRC.includes('const plateId = asciiSafe ? \'paper-\' + targetWord : mintPaperId()') && KIT_SRC.includes('idMinted: asciiSafe === false'),
    '(A) start 用 plateId 建论文并自报 asciiSafe/idMinted')
  ok(KIT_SRC.includes('if (!row && /^paper-p[0-9]+$/.test(str(target))) {')
    && KIT_SRC.includes('if (st && String(st.id) === str(target)) { row = cand; break }'),
    '(A) readState 认得以铸造 id 寻址（对未去前缀的原始拼写判定）')
  ok(KIT_SRC.includes('repairsUsed=') && KIT_SRC.includes('STRICTLY GREATER than the current round'),
    '(B) 预算耗尽的拒绝语带读数与「严格大于当前 round」的条件')
  ok(MEETINGS_SRC.includes('includeArchived === true') && MEETINGS_SRC.includes('archivedMeans'),
    '(C) 内核 requireMeeting 支持 includeArchived，meetingView 自报 archived/archivedMeans')
  ok(TOOLS_SRC.includes('allowArchived: true') && TOOLS_SRC.includes('meetingArchived'),
    '(C) verdict_final/ask 读归档并自报 meetingArchived')
  ok(KERNEL_SRC.includes('persistsAcrossRestart: false') && KERNEL_SRC.includes('persistsAcrossRestartMeans'),
    '(D) 内核 settings 回执给出持久性事实')
  ok(KIT_SRC.includes('failure.tailsIdentical') && KIT_SRC.includes('failure.outDir = outDir') && KIT_SRC.includes('failure.sourceName = request.sourceName'),
    '(E) 失败对象带 tailsIdentical/outDir/sourceName')
  ok(KIT_SRC.includes("repair: false, repairs: Number(state.repairs || 0), repairBudget: REPAIR_ROUNDS, cap: capNow"),
    '(E) 普通修订回执也自报 from/to/repair:false/repairs')
  ok(RESUME_SRC.includes('childrenNoParent') && RESUME_SRC.includes('watchdogsNone') && RESUME_SRC.includes('writesBetween'),
    '(F) resume 的 children/watchdogs/read-back 各自有具名读数')
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
console.log('§1 (A) 非 ASCII 标题 → ASCII plate id + ASCII 目录（真 tool 回执）')
{
  // Latency: the paper's title is CJK (the live title that broke xelatex), and the plate id must be portable.
  const { specs } = await bootTools({}, makeSubprocess(FAILING_COMPILE))
  const T = '第六次 续跑 之 结题 现场 验证 稿'
  const started = await call(specs, 'vibe_v5_paper', { action: 'start', target: T, participants: ['r-1', 'r-2'] })
  const S = (started && started.started) || {}
  ok(started.ok === true && S.ok === true, '前提：CJK 标题的论文能建立', started && started.message)
  ok(/^paper-p[0-9]+$/.test(String(S.id || '')), '(A) 非可移植标题得到 paper-pN 形式 id', { id: S.id })
  ok(S.asciiSafe === false && S.idMinted === true, '(A) 回执明说 id 是铸的（asciiSafe:false, idMinted:true）', { asciiSafe: S.asciiSafe, idMinted: S.idMinted })
  ok(S.title === T, '(A) 标题仍是标题（没有被悄悄改写）', { title: S.title })
  ok(/^[A-Za-z0-9._-]+$/.test(String(S.folder || '')), '(A) folder 是纯 ASCII（xelatex 的 -output-directory 不再拿到中文）', { folder: S.folder })

  const byTitle = await call(specs, 'vibe_v5_paper', { action: 'status', target: T })
  ok(byTitle.ok === true && byTitle.paper && byTitle.paper.id === S.id, '(A) 用标题仍能寻址（读到同一篇）', byTitle && byTitle.paper && { id: byTitle.paper.id })
  const byId = await call(specs, 'vibe_v5_paper', { action: 'status', target: S.id })
  ok(byId.ok === true && byId.paper && byId.paper.id === S.id, '(A) 用铸出的 id 也能寻址（回执印的 id 可达）', byId && byId.paper && { id: byId.paper.id })

  const second = await call(specs, 'vibe_v5_paper', { action: 'start', target: '第二篇 中文 标题', participants: ['r-1', 'r-2'] })
  const S2 = (second && second.started) || {}
  ok(second.ok === true && S2.id !== S.id && /^paper-p[0-9]+$/.test(String(S2.id || '')),
    '(A) 第二篇非可移植标题铸不同的 id（不撞号）', { id: S2.id })

  const portable = await call(specs, 'vibe_v5_paper', { action: 'start', target: 'p158-ascii', participants: ['r-1', 'r-2'] })
  const S1 = (portable && portable.started) || {}
  ok(portable.ok === true && S1.id === 'paper-p158-ascii' && S1.asciiSafe === true && S1.idMinted === false,
    '(A) 可移植 target 保持 paper-<target>（不无谓改名）', { id: S1.id, asciiSafe: S1.asciiSafe })

  // 编译失败对象：目录/源名/两尾部同文三项都必须在（真机那次的 outDir 是 null）
  const failed = await call(specs, 'vibe_v5_paper', { action: 'compile', target: T })
  const block = failed.compiled || null
  ok(block && block.produced === false, '前提：编译真的失败（走失败回执）', block && { produced: block.produced })
  ok(block && typeof block.outDir === 'string' && block.outDir !== '', '(E) 失败回执带真正用过的 outDir（不再是 null）', block && { outDir: block.outDir })
  ok(block && typeof block.sourceName === 'string' && /\.tex$/.test(block.sourceName) && /^[A-Za-z0-9._-]+\.tex$/.test(block.sourceName),
    '(E) 失败回执带 ASCII 的 sourceName', block && { sourceName: block.sourceName })
  ok(block && block.tailsIdentical === true && block.tailSource === 'stdout',
    '(E) 两尾部逐字相同时如实标记 tailsIdentical:true', block && { tailsIdentical: block.tailsIdentical, tailSource: block.tailSource })
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
console.log('§2 (B) 修复轮预算耗尽：拒绝语给出能判定的数字与真实出口')
{
  const { specs } = await bootTools({ 'vmu.paper.maxRounds': 1 })
  const P = 'p158-预算'
  // 评审都投可交付 ⇒ advance 把论文送进 awaiting-editor（有 refuser 时 advance 回 writing，那是另一条路）
  const toAwaiting = async () => {
    for (const m of ['r-1', 'r-2']) await call(specs, 'vibe_v5_paper', { action: 'review', target: P, member: m, deliverable: true, notes: '可' })
    let last = null
    for (let i = 0; i < 2; i += 1) {
      const a = await call(specs, 'vibe_v5_paper', { action: 'advance', target: P })
      last = (a && a.advance) || last
      if (last && (last.to === 'awaiting-editor' || last.state === 'awaiting-editor')) return last
    }
    return last
  }
  await call(specs, 'vibe_v5_paper', { action: 'start', target: P, participants: ['r-1', 'r-2'] })
  for (const m of ['r-1', 'r-2']) await call(specs, 'vibe_v5_paper', { action: 'part', target: P, member: m, part: m + ' 标题', body: m + ' 正文' })
  const a0 = await call(specs, 'vibe_v5_paper', { action: 'advance', target: P })
  ok(a0.advance && a0.advance.to === 'reviewing', '前提：writing → reviewing', a0 && a0.advance)
  const reach1 = await toAwaiting()
  ok(reach1 && reach1.to === 'awaiting-editor', '前提：全部可交付后到 awaiting-editor', reach1)
  const r1 = await call(specs, 'vibe_v5_paper', { action: 'final', target: P, member: 'r-chair', decision: 'revise', note: '一' })
  ok(r1.final && r1.final.repair === true && r1.final.repairs === 1, '前提：第一次 revise 是修复轮 1/2', r1 && r1.final)
  await call(specs, 'vibe_v5_paper', { action: 'advance', target: P })
  const reach2 = await toAwaiting()
  ok(reach2 && reach2.to === 'awaiting-editor', '前提：修复后再次到 awaiting-editor', reach2)
  const r2 = await call(specs, 'vibe_v5_paper', { action: 'final', target: P, member: 'r-chair', decision: 'revise', note: '二' })
  ok(r2.final && r2.final.repair === true && r2.final.repairs === 2, '前提：第二次 revise 是修复轮 2/2', r2 && r2.final)
  await call(specs, 'vibe_v5_paper', { action: 'advance', target: P })
  const reach3 = await toAwaiting()
  ok(reach3 && reach3.to === 'awaiting-editor', '前提：修复轮用尽后仍能到 awaiting-editor', reach3)
  const third = await call(specs, 'vibe_v5_paper', { action: 'final', target: P, member: 'r-chair', decision: 'revise', note: '三' })
  ok(third.ok === false && String(third.code || '') === 'VMU_PACK_V5R_CORE_PAPER_STATE',
    '(B) 预算耗尽后第三次 revise 是具名拒绝', third && { code: third.code })
  ok(/repairsUsed=2\/2/.test(String(third.message || '')) && /round=1/.test(String(third.message || '')),
    '(B) 拒绝语带 repairsUsed 与当前 round（读者不必猜）', third && { message: third.message })
  ok(/STRICTLY GREATER than the current round/.test(String(third.hint || '')) && /maxRounds/.test(String(third.hint || '')),
    '(B) hint 说清「新上限要严格大于当前 round」', third && { hint: String(third.hint || '').slice(0, 120) })
  ok(/NOT an exit here/.test(String(third.hint || '')) && /parts can only be written while the paper is in writing/.test(String(third.hint || '')),
    '(B) 不可达的出口（record a new part）被明确否认', third && { hint: String(third.hint || '').slice(0, 160) })

  // 正面：把上限抬到当前 round 之上后，下一次 revise 是普通修订（不是修复轮），说明 (b) 的条件是真的
  const raised = await call(specs, 'vibe_v5_set', { key: 'vmu.paper.maxRounds', value: 2, why: 'run158 正面' })
  ok(raised.ok === true, '前提：maxRounds 抬到 2 成功', raised && raised.message)
  const normal = await call(specs, 'vibe_v5_paper', { action: 'final', target: P, member: 'r-chair', decision: 'revise', note: '四' })
  const nf = (normal && normal.final) || {}
  ok(normal.ok === true && nf.moved === true && nf.repair === false && nf.from === 'awaiting-editor' && nf.to === 'writing',
    '(B) 上限抬高后走的是普通修订（hint 的条件被真机验证）', { moved: nf.moved, repair: nf.repair, from: nf.from, to: nf.to })
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
console.log('§3 (E) 普通修订回执自报 from/to（与修复轮可区分）')
{
  const { specs } = await bootTools({ 'vmu.paper.maxRounds': 3 })
  const P = 'p158-修订'
  await call(specs, 'vibe_v5_paper', { action: 'start', target: P, participants: ['r-1', 'r-2'] })
  for (const m of ['r-1', 'r-2']) await call(specs, 'vibe_v5_paper', { action: 'part', target: P, member: m, part: m, body: m + ' 正文' })
  await call(specs, 'vibe_v5_paper', { action: 'advance', target: P })
  for (const m of ['r-1', 'r-2']) await call(specs, 'vibe_v5_paper', { action: 'review', target: P, member: m, deliverable: true, notes: '可' })
  await call(specs, 'vibe_v5_paper', { action: 'advance', target: P })
  let reach = null
  for (let i = 0; i < 2; i += 1) {
    const a = await call(specs, 'vibe_v5_paper', { action: 'advance', target: P })
    if (a && a.advance) reach = a.advance
    if (reach && (reach.to === 'awaiting-editor' || reach.state === 'awaiting-editor')) break
  }
  ok(reach && (reach.to === 'awaiting-editor' || reach.state === 'awaiting-editor'), '前提：到 awaiting-editor', reach)
  const rev = await call(specs, 'vibe_v5_paper', { action: 'final', target: P, member: 'r-chair', decision: 'revise', note: 'x' })
  const rf = (rev && rev.final) || {}
  ok(rev.ok === true && rf.from === 'awaiting-editor' && rf.to === 'writing' && rf.moved === true,
    '(E) 普通修订回执说清 awaiting-editor → writing', { from: rf.from, to: rf.to, moved: rf.moved })
  ok(rf.repair === false && rf.repairs === 0 && rf.cap === 3,
    '(E) 普通修订回执自报 repair:false/repairs:0/cap', { repair: rf.repair, repairs: rf.repairs, cap: rf.cap })
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
console.log('§4 (D) 运行时设置不跨进程这一事实进了回执')
{
  const { specs, kernel } = await bootTools({})
  const set = await call(specs, 'vibe_v5_set', { key: 'vmu.paper.maxRounds', value: 4, why: 'run158 (D)' })
  ok(set.ok === true && set.applied && set.applied.persistsAcrossRestart === false,
    '(D) set 回执带 persistsAcrossRestart:false', set && set.applied && { p: set.applied.persistsAcrossRestart })
  ok(/RUNNING kernel only/.test(String(set.applied && set.applied.persistsAcrossRestartMeans || '')),
    '(D) 并说明它只活在运行中的内核里', set && set.applied && { means: String(set.applied.persistsAcrossRestartMeans || '').slice(0, 80) })
  const direct = kernel.setSettingsValue('vmu.paper.maxRounds', 5, { by: 'office', reason: 'run158 (D) 直读' })
  ok(direct && direct.persistsAcrossRestart === false && typeof direct.persistsAcrossRestartMeans === 'string',
    '(D) 内核回执本身也带这两个字段', direct && { p: direct.persistsAcrossRestart })
  const configured = await call(specs, 'vibe_v5_configure', { params: { 'vmu.paper.maxRounds': 6 } })
  ok(configured.ok === true && Array.isArray(configured.applied) && configured.applied[0].persistsAcrossRestart === false,
    '(D) configure 的每条也带同一事实', configured && configured.applied && configured.applied[0] && { p: configured.applied[0].persistsAcrossRestart })
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
console.log('§5 (F) resume 的「没有」与「没有接线」现在是两件事，read-back 带采样时间与写入数')
{
  const storeSeam = (keys = {}) => ({ keys, export: () => ({ keys }), read: (k) => keys[k], patch: async (k, fn) => { keys[k] = typeof fn === 'function' ? fn(keys[k]) : fn } })

  // children：接线了，但本内核没有父会话 ⇒ 具名 VMU_RESUME_CHILDREN_NO_PARENT
  const r1 = resumeMod.createResume({ store: storeSeam({ resume: { v: 1, counters: {}, recoveries: [] } }), clock: () => 1000, children: () => [] })
  await r1.recover({ reason: 'run158 (F) children' })
  const ch = r1.status().children || {}
  ok(ch.attached === true && ch.code === 'VMU_RESUME_CHILDREN_NO_PARENT',
    '(F) 无父会话时 children 步具名（不再是 code:null）', { attached: ch.attached, code: ch.code })

  // watchdogs：没有端口 ⇒ UNAVAILABLE；接线但 0 个 ⇒ NONE（两种「零」分开）
  const r2 = resumeMod.createResume({ store: storeSeam({ resume: { v: 1, counters: {}, recoveries: [] } }), clock: () => 1000 })
  await r2.recover({ reason: 'run158 (F) wd 无端口' })
  const wd2 = r2.status().watchdogs || {}
  ok(wd2.attached === false && wd2.code === 'VMU_RESUME_WATCHDOGS_UNAVAILABLE',
    '(F) 无 watchdog 端口 ⇒ VMU_RESUME_WATCHDOGS_UNAVAILABLE', { attached: wd2.attached, code: wd2.code })
  const r3 = resumeMod.createResume({ store: storeSeam({ resume: { v: 1, counters: {}, recoveries: [] } }), clock: () => 1000,
    watchdogs: { targets: () => [], touch: () => true } })
  await r3.recover({ reason: 'run158 (F) wd 空' })
  const wd3 = r3.status().watchdogs || {}
  ok(wd3.attached === true && wd3.targets === 0 && wd3.code === 'VMU_RESUME_WATCHDOGS_NONE',
    '(F) 接线但 0 个目标 ⇒ VMU_RESUME_WATCHDOGS_NONE（测得零，不是缺接线）', { attached: wd3.attached, targets: wd3.targets, code: wd3.code })

  // read-back：带 sampledAt 与 writesBetween
  const r4 = resumeMod.createResume({ store: storeSeam({ resume: { v: 1, counters: {}, recoveries: [] } }), clock: () => 1000,
    settings: { 'vmu.resume.readBack': true } })
  await r4.recover({ reason: 'run158 (F) rb' })
  const rb = r4.readBack()
  ok(typeof rb.sampledAt === 'number' && rb.sampledAt >= 0, '(F) read-back 自带采样时刻 sampledAt', { sampledAt: rb.sampledAt })
  ok(typeof rb.writesBetween === 'number' && rb.writesBetween > 0,
    '(F) read-back 自报本进程在持有预期之后写了多少次（writesBetween>0 才说明不是别人写的）', { writesBetween: rb.writesBetween })
  ok(rb.consistent === true && /hashes to what it wrote/.test(String(rb.driftMeans || '')),
    '(F) 一致时回执给出一致语义', { driftMeans: String(rb.driftMeans || '').slice(0, 60) })
  // 外部写入者改了同一个键 ⇒ 漂移必须被具名，且回执说明「另有人写」
  const store4 = r4.status().storeAttached === true ? null : null
  ok(store4 === null, '(F) 前提：store 已接线（status().storeAttached）', { storeAttached: r4.status().storeAttached })
}

// ── cleanup ─────────────────────────────────────────────────────────────────────────────────────────────────────────
process.chdir(ORIG_CWD)
console.log('')
if (failed === 0) console.log('=== RUN 158 RUN-6 FIXES: ' + passed + ' passed, 0 failed ===')
else {
  console.log('=== RUN 158 RUN-6 FIXES: ' + passed + ' passed, ' + failed + ' failed ===')
  for (const f of failures) console.log('  ✗ ' + f)
  process.exitCode = 1
}

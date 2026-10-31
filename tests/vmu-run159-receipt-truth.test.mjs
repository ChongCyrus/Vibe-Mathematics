#!/usr/bin/env node
// tests/vmu-run159-receipt-truth.test.mjs — ★ RUN 159：第七次真机跑（续跑，tarball `c11f83e8`，jsonl
// `full-1031-084639.jsonl`，代理报告 `FEEDBACK6.md` / `SIM-REPORT6.md`，`RUN7 VERDICT: PASS`）里的六条新账。
//
//   (1) resume 的「四种没有」   children 无父会话时**真去问了宿主**（`live:0` 而被问的是 `null`），
//       `recoverStatus.ports.children:true` 与 `children.attached:false` 互相否认，watchdogs 用 `code + targets:0`
//       同时表达「未接线」与「0 目标」⇒ 四种「没有」各有具名码，且 `queried:false` / `live:null` = 没问过。
//   (2) plan 与 recovery 的 mailbox  同一次续跑里 `plan` 说 attached:false、`recovery` 说 attached:true/pending:118
//       ⇒ 两处读同一个来源（端口优先，其次 durable `mailbox` 键），并写明来源。
//   (3) drift 可读性   `c289f5a5:967` vs `0e68d3ed:967` 看不出「内容变了」还是「尺寸变了」⇒ 拆成 hash/length + sameLength。
//   (4) tailsIdentical 只有布尔   ⇒ 加散文（哪一支为真、意味着什么）。
//   (5) outDir 相对而 argv 绝对   ⇒ 内核 latex 面在**失败**回执上也带解析后的绝对 outDir。
//   (6) asciiSafe 易被读成「目录不安全」/ verdict_final 不报会议状态 / set 不报作用域 ⇒ 三个说明字段。
//
// Run: node tests/vmu-run159-receipt-truth.test.mjs
// Last line: === RUN 159 RECEIPT TRUTH: N passed, M failed ===
import { readFileSync } from 'node:fs'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { isAbsolute, dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..')
const ENTRY = pathToFileURL(join(REPO, 'vibe-math-vmu', 'vibe-math-vmu.js')).href
const KIT = join(REPO, 'vibe-math-vmu', 'kit', 'paper.js')
const TOOLS = join(REPO, 'vibe-math-vmu', 'packs', 'v5r', 'tools.js')
const KERNEL = join(REPO, 'vibe-math-vmu', 'kernel', 'index.js')
const MEETINGS = join(REPO, 'vibe-math-vmu', 'kernel', 'meetings.js')
const RESUME = join(REPO, 'vibe-math-vmu', 'kernel', 'resume.js')
const LATEX = join(REPO, 'vibe-math-vmu', 'kernel', 'latex.js')
const KIT_SRC = readFileSync(KIT, 'utf8')
const TOOLS_SRC = readFileSync(TOOLS, 'utf8')
const KERNEL_SRC = readFileSync(KERNEL, 'utf8')
const MEETINGS_SRC = readFileSync(MEETINGS, 'utf8')
const RESUME_SRC = readFileSync(RESUME, 'utf8')
const LATEX_SRC = readFileSync(LATEX, 'utf8')

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
const { createResume, createWorkLedger: _unused } = await import(pathToFileURL(RESUME).href).then((m) => ({ createResume: m.createResume }))
const { createLatexFace } = await import(pathToFileURL(LATEX).href)

// ── durable store contract (the same shape tests/vmu-resume-recovery.test.mjs uses) ────────────────────────────────
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

// ── tool-level harness (real assembly; the seam run 155/156/158 use) ───────────────────────────────────────────────
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
  return { exitCode: 1, stdout: '! Undefined control sequence.' + String.fromCharCode(10) + '<*> ' + tex, stderr: '' }
}
const bootTools = async (settings = {}, subprocess = null) => {
  const root = await mkdtemp(join(tmpdir(), 'vmu-run159-'))
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
const stepOf = (report, name) => ((report && report.steps) || []).find((s) => s && s.step === name) || null

// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
console.log('§0 源码口径：六处修法各在自己的所有者上（行为由 §1–§3 钉住，每处一行）')
{
  ok(RESUME_SRC.includes("childrenNoParent: 'VMU_RESUME_CHILDREN_NO_PARENT'")
    && RESUME_SRC.includes("childrenNoneYet: 'VMU_RESUME_CHILDREN_NONE_YET'")
    && RESUME_SRC.includes("watchdogsUnavailable: 'VMU_RESUME_WATCHDOGS_UNAVAILABLE'")
    && RESUME_SRC.includes("watchdogsFailed: 'VMU_RESUME_WATCHDOGS_PORT_FAILED'"),
    '(1) resume 的四种「没有」各有具名码（含端口失败这一种）')
  ok(RESUME_SRC.includes('queried: false') && RESUME_SRC.includes('`live:null` means NOT ASKED'),
    '(1) 无父会话时的形状写明「没问过」而不是「问了得到 0」')
  ok(RESUME_SRC.includes('function mailboxProbe()') && RESUME_SRC.includes('const planMailbox = mailboxProbe()')
    && RESUME_SRC.includes('the plan and the act agree'),
    '(2) plan 与 recovery 共用同一个 mailbox 读数')
  ok(RESUME_SRC.includes('expectedHash') && RESUME_SRC.includes('sameLength')
    && RESUME_SRC.includes('the CONTENT of this key changed under this process'),
    '(3) drift 拆成 hash/length 并解释同长不同哈希的含义')
  ok(LATEX_SRC.includes('outDir,\n          stderr: tail(res.stderr), message: \'the LaTeX compile exited')
    || (LATEX_SRC.split('          outDir,').length - 1) >= 3,
    '(5) 内核 latex 面的失败回执带解析后的 outDir（至少三处失败分支）')
  ok(KIT_SRC.includes('failure.tailsIdenticalMeans') && KIT_SRC.includes('failure.outDir = (r && r.outDir) || outDir'),
    '(4)(5) kit 的失败对象带 outDir 兜底与 tailsIdenticalMeans')
  ok(TOOLS_SRC.includes('tailsIdenticalMeans') && TOOLS_SRC.includes('meetingState: view')
    && TOOLS_SRC.includes('meetingStateMeans'),
    '(4)(6) 投影带 tailsIdenticalMeans；verdict_final 报 meetingState')
  ok(KERNEL_SRC.includes("scope: 'this-kernel'") && KERNEL_SRC.includes('scopeMeans'),
    '(6) 设置写入回执自报作用域')
  ok(KIT_SRC.includes('asciiSafeMeans'), '(6) start 回执解释 asciiSafe 的含义')
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
console.log('§1 (1)(2)(3) resume：四种「没有」、plan/recovery 同源、drift 拆字段（真 recover 报告）')
{
  // (1a) children 端口在、但没有父会话：不调宿主，live:null（没问过），具名 NO_PARENT
  {
    const children = () => { called += 1; return ['child-x'] }
    let called = 0
    children.parentId = () => null
    const r = createResume({ store: mkStore({ work: [] }), clock: () => 1000, children })
    await r.read()
    const rep = await r.recover({ reason: 'run159-a' })
    const c = stepOf(rep, 'children')
    ok(!!c && c.queried === false && c.live === null, '(1a) 无父会话：children 步 queried:false 且 live:null', c && { queried: c.queried, live: c.live })
    ok(!!c && c.code === 'VMU_RESUME_CHILDREN_NO_PARENT' && c.wired === true, '(1a) 具名 VMU_RESUME_CHILDREN_NO_PARENT（端口在，但没有父会话可问）', c && c.code)
    ok(called === 0, '(1a) 宿主根本没被问过（端口调用 0 次）', { called })
  }

  // (1b) 有父会话、宿主答「0 个存活」，而名册里没人持有 childId：这是第三个「没有」（NONE_YET），不是 NO_PARENT
  {
    const children = (p) => { askedWith = p; return [] }
    let askedWith = null
    children.parentId = () => 'parent-session-1'
    const roster = () => [{ id: 'r-1', slot: 'member' }, { id: 'r-2', slot: 'member' }]
    const r = createResume({ store: mkStore({ work: [] }), clock: () => 1000, children, roster })
    await r.read()
    const c = stepOf(await r.recover({ reason: 'run159-b' }), 'children')
    ok(!!c && c.queried === true && c.live === 0 && askedWith === 'parent-session-1',
      '(1b) 有父会话：真问了宿主，live:0 是「问过且真的 0」', c && { queried: c.queried, live: c.live, askedWith })
    ok(!!c && c.code === 'VMU_RESUME_CHILDREN_NONE_YET' && c.checked === 0,
      '(1b) 具名 VMU_RESUME_CHILDREN_NONE_YET（父会话在、还没有成员持有 childId）', c && c.code)
  }

  // (1c) 端口在但查询抛错：ok:false + 端口失败码（不再谎称 ok:true）
  {
    const children = () => { throw Object.assign(new Error('session query persisted nothing'), { code: 'SESSION_QUERY_PERSISTENCE_FAILED' }) }
    children.parentId = () => 'parent-session-2'
    const r = createResume({ store: mkStore({ work: [] }), clock: () => 1000, children })
    await r.read()
    const c = stepOf(await r.recover({ reason: 'run159-c' }), 'children')
    ok(!!c && c.ok === false && c.portFailed === true && c.code === 'SESSION_QUERY_PERSISTENCE_FAILED',
      '(1c) 端口抛错：ok:false、portFailed:true、保留端口的具名码（run 7 那次谎称 ok:true）', c && { ok: c.ok, code: c.code })
  }

  // (1d) watchdogs 三态：未接线 / 接线但 0 目标 / 接线但触达失败
  {
    const absent = createResume({ store: mkStore({ work: [] }), clock: () => 1000 })
    await absent.read()
    const wAbsent = stepOf(await absent.recover({ reason: 'wd-a' }), 'watchdogs')
    ok(!!wAbsent && wAbsent.attached === false && wAbsent.code === 'VMU_RESUME_WATCHDOGS_UNAVAILABLE',
      '(1d) 未接线：VMU_RESUME_WATCHDOGS_UNAVAILABLE', wAbsent && wAbsent.code)

    const zero = createResume({ store: mkStore({ work: [] }), clock: () => 1000, watchdogs: { targets: async () => [], touch: async () => true } })
    await zero.read()
    const wZero = stepOf(await zero.recover({ reason: 'wd-z' }), 'watchdogs')
    ok(!!wZero && wZero.attached === true && wZero.targets === 0 && wZero.code === 'VMU_RESUME_WATCHDOGS_NONE',
      '(1d) 接线但 0 目标：VMU_RESUME_WATCHDOGS_NONE（测得的 0，不是缺端口）', wZero && { attached: wZero.attached, code: wZero.code })

    const broken = createResume({ store: mkStore({ work: [] }), clock: () => 1000, watchdogs: { targets: async () => ['t1'], touch: async () => { throw new Error('no port') } } })
    await broken.read()
    const wBroken = stepOf(await broken.recover({ reason: 'wd-b' }), 'watchdogs')
    ok(!!wBroken && wBroken.attached === false && wBroken.code === 'VMU_RESUME_WATCHDOGS_PORT_FAILED',
      '(1d) 接线但触达失败：VMU_RESUME_WATCHDOGS_PORT_FAILED（与「未接线」分开）', wBroken && wBroken.code)
  }

  // (2) plan 与 recovery 读同一个 mailbox 来源：没有端口、只有 durable mailbox 键时两处都说 durable-mailbox-key
  {
    const boxes = { inbox: [{ id: 'm1' }, { id: 'm2' }], outbox: [{ id: 'm3' }] }
    const store = mkStore({ work: [], mailbox: { mode: 'state', value: { face: 'mailbox', data: { boxes } } } })
    const r = createResume({ store, clock: () => 1000 })
    await r.read()
    const plan = r.recoverPlan({ reason: 'plan' })
    const planMailbox = stepOf(plan, 'mailbox')
    const rep = await r.recover({ reason: 'act' })
    const recMailbox = stepOf(rep, 'mailbox')
    ok(!!planMailbox && planMailbox.attached === true && planMailbox.source === 'durable-mailbox-key' && planMailbox.pending === 3,
      '(2) plan 从 durable 键数出 3 封未确认邮件', planMailbox)
    ok(!!recMailbox && recMailbox.attached === true && recMailbox.source === planMailbox.source && recMailbox.pending === planMailbox.pending,
      '(2) recovery 与 plan 同源同数（run 7 那次两边互相否认）', { plan: planMailbox, act: recMailbox })
  }

  // (3) drift：外部改写同一长度的内容 ⇒ 回执给出两个哈希、sameLength:true、以及「内容变了」的散文
  {
    const store = mkStore({ work: [], resume: { v: 1, counters: {}, recoveries: [] } })
    const r = createResume({ store, clock: () => 1000, settings: { 'vmu.resume.readBack': true } })
    await r.recover({ reason: 'rb' })
    const clean = r.readBack()
    ok(clean.consistent === true && clean.sampledAt !== undefined && clean.writesBetween >= 0,
      '(3) 一致态：带采样时刻与本次进程写入数', { writesBetween: clean.writesBetween })
    const raw = JSON.parse(JSON.stringify(store._raw.get('resume')))
    raw.recoveries[0].reason = 'rc'   // same length, different content: exactly the live drift shape
    store._raw.set('resume', raw)
    const drifted = r.readBack()
    const d = (drifted.drift || [])[0] || null
    ok(d && typeof d.expectedHash === 'string' && typeof d.actualHash === 'string' && d.expectedHash !== d.actualHash,
      '(3) 漂移态：两个哈希都印出来（不再只有一条拼好的串）', d && { expectedHash: d.expectedHash, actualHash: d.actualHash })
    ok(d && d.sameLength === true && /same length, different hash/.test(String(d.means || '')),
      '(3) 同长不同哈希被说成「内容变了」而不是「尺寸变了」', d && { sameLength: d.sameLength, means: String(d.means || '').slice(0, 60) })
  }
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
console.log('§2 (4)(5)(6) 回执：tailsIdentical 的散文、失败 outDir 绝对、asciiSafe/meetingState/scope 的说明')
{
  const { specs, kernel } = await bootTools({}, makeSubprocess(FAILING_COMPILE))

  // (4)(5) 编译失败：两尾部同文要说明白，目录要给绝对值
  const T = '第七次 续跑 之 结题 现场 验证 稿'
  const started = await call(specs, 'vibe_v5_paper', { action: 'start', target: T, participants: ['r-1', 'r-2'] })
  const S = (started && started.started) || {}
  ok(started.ok === true && S.ok === true, '前提：CJK 标题的论文能建立', started && started.message)
  ok(typeof S.asciiSafeMeans === 'string' && /TITLE/.test(S.asciiSafeMeans) && /not/.test(S.asciiSafeMeans),
    '(6) start 回执解释 asciiSafe:false 说的是「标题不是可移植 ASCII 名」，不是「目录不安全」', { means: String(S.asciiSafeMeans || '').slice(0, 70) })

  const failed = await call(specs, 'vibe_v5_paper', { action: 'compile', target: T })
  const block = (failed && failed.compiled) || null
  ok(block && block.produced === false, '前提：编译真的失败（走失败回执）', block && { produced: block.produced })
  ok(block && block.tailsIdentical === true && typeof block.tailsIdenticalMeans === 'string' && block.tailsIdenticalMeans.length > 20,
    '(4) 两尾部逐字相同时不但标记，还给出散文说明', block && { means: String(block.tailsIdenticalMeans || '').slice(0, 60) })
  ok(block && typeof block.outDir === 'string' && isAbsolute(String(block.outDir)),
    '(5) 失败回执的 outDir 是解析后的绝对路径（与 argv 同形，不再是相对串）', block && { outDir: block.outDir })

  // (5) 内核 latex 面自身的失败回执也带绝对 outDir
  {
    // the face's spawn contract is { exitCode, stdout, stderr } (NOT the host subprocess service shape)
    const faceSpawn = async ({ args }) => (args.includes('--version')
      ? { exitCode: 0, stdout: 'xelatex 3.14', stderr: '' }
      : { exitCode: 1, stdout: 'boom', stderr: '' })
    const face = createLatexFace({ spawn: faceSpawn, clock: () => 1000 })
    const outDir = join(roots[roots.length - 1], 'latex-abs')
    const res = await face.check({ source: '\\documentclass{article}\\begin{document}x\\end{document}', outDir: outDir.replace(/\\/g, '/') })
    ok(res && res.ok === false && typeof res.outDir === 'string' && isAbsolute(String(res.outDir)),
      '(5) latex 面的失败回执也带解析后的绝对 outDir', res && { code: res.code, outDir: res.outDir })
  }

  // (6) set 回执自报作用域
  const set = kernel.setSettingsValue('vmu.paper.maxRounds', 4, { by: 'office', reason: 'run159 scope' })
  const setReceipt = set && (set.receipt || set)
  ok(!!setReceipt && setReceipt.scope === 'this-kernel' && typeof setReceipt.scopeMeans === 'string',
    '(6) set 回执带 scope:this-kernel 与说明（不只说「不跨进程」，还说改了谁）', setReceipt && { scope: setReceipt.scope })

  // (6) verdict_final 报会议状态（关会后从归档回答，状态仍是 recorded 的 closed）
  const opened = await kernel.meetings.open({ type: 'debate', chair: 'r-chair', actor: 'r-chair', agenda: 'rec-run159', roster: ['r-chair', 'r-1', 'r-2'] })
  const mid = (opened && (opened.meeting || opened.id)) || null
  ok(!!mid, '前提：辩论会开出来了', opened && { mid })
  for (const m of ['r-1', 'r-2']) await call(specs, 'vibe_vmu_meeting', { action: 'attend', id: mid, member: m })
  for (const m of ['r-1', 'r-2']) await call(specs, 'vibe_v5_verdict', { meeting: mid, proposition_id: 'rec-run159', verdict: 1, reason: 'proof', member: m })
  await call(specs, 'vibe_vmu_meeting', { action: 'close', id: mid, actor: 'r-chair' })
  const final = await call(specs, 'vibe_v5_verdict_final', { meeting: mid, proposition_id: 'rec-run159', owner: 'r-1' })
  ok(final.ok === true && final.meetingArchived === true, '前提：关会后仍能裁决（RUN 158 修的归档读）', final && { ok: final.ok, archived: final.meetingArchived })
  ok(final.meetingState === 'closed' && typeof final.meetingStateMeans === 'string' && final.meetingStateMeans.length > 20,
    '(6) 回执自报 meetingState:closed 与它的含义（读者不必再猜是哪份记录）', { state: final.meetingState, means: String(final.meetingStateMeans || '').slice(0, 60) })
}

process.chdir(ORIG_CWD)
console.log('')
const total = passed + failed
console.log('=== RUN 159 RECEIPT TRUTH: ' + passed + ' passed, ' + failed + ' failed ===')
if (failed !== 0) {
  console.log('FAILURES:')
  for (const f of failures) console.log('  - ' + f)
}
process.exit(failed === 0 ? 0 : 1)

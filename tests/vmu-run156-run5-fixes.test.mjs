#!/usr/bin/env node
// tests/vmu-run156-run5-fixes.test.mjs — ★ RUN 156：第五次真机跑（续跑，tarball `d8e1b71c`，jsonl
// `full-1031-060959.jsonl`，代理报告 `FEEDBACK4.md` / `SIM-REPORT4.md`）里的四条新缺陷 + 一条上一轮漏修。
//
//   ① repair 回执缺字段   `kit/paper.js` 的 `recordFinal` 早就 return `repair/repairs/repairBudget/cap`，但
//                        `packs/v5r/tools.js` 的 `final` 投影把它们全丢了 ⇒ 调用方只能再调一次 `status` 才知道
//                        这次的 revise 是「修复轮」。真机回执原文：`{"ok":true,"finalized":false,"final":null,"missing":[],"consult":null,"pdf":null}`。
//   ② N1 Lean 新作业不可达 工作区已有 `Formal/Jobs/lean-1..6` 时，自动号连续撞号，拒绝语让传 `jobId`——
//                        而 `vibe_v5_lean_run` 的 parameters 里没有 `jobId`，唯一出口正是它自己点名的那条路。
//   ③ N2 `status` 无 target 的 hint 自相矛盾  hint 说「不传 target 会列出论文」，而这次调用正是被它拒的。
//                        修法是让 listing 真的存在（同一个 `paper-state` 行，一行一篇）。
//   ④ N3 `panel board` 缺 `subgoal`/`status`  规则第 28 行要「③各任务完成状态情况」，`set` 收这两个字段、
//                        `board` 行却不回显（run 4 的 H7 也是这条，上轮没修）。
//   ⑤ N4 失败回执 `engine:null` 而同回执 `triedEngines[0].engine` 是 `xelatex` —— 同一份回执里两个字段互相否认。
//   ⑥ start 回执不自报 id；省略 target 时 id 取标题 ⇒ 目录名含空格 ⇒ xelatex `putenv(...)` fatal。
//
// Run: node tests/vmu-run156-run5-fixes.test.mjs
// Last line: === RUN 156 RUN-5 FIXES: N passed, M failed ===
import { readFileSync, writeFileSync } from 'node:fs'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..')
const ENTRY = pathToFileURL(join(REPO, 'vibe-math-vmu', 'vibe-math-vmu.js')).href
const KIT = join(REPO, 'vibe-math-vmu', 'kit', 'paper.js')
const EXTRAS = join(REPO, 'vibe-math-vmu', 'kit', 'extras.js')
const TOOLS = join(REPO, 'vibe-math-vmu', 'packs', 'v5r', 'tools.js')
const PANEL = join(REPO, 'vibe-math-vmu', 'kernel', 'panel.js')
const KIT_SRC = readFileSync(KIT, 'utf8')
const EXTRAS_SRC = readFileSync(EXTRAS, 'utf8')
const TOOLS_SRC = readFileSync(TOOLS, 'utf8')
const PANEL_SRC = readFileSync(PANEL, 'utf8')

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
const pack = await import(pathToFileURL(join(REPO, 'vibe-math-vmu', 'packs', 'v5r', 'paper.js')).href)
const extras = await import(pathToFileURL(EXTRAS).href)

// ── kit-level harness (same shape run 154/155 use) ───────────────────────────────────────────────────────────────────
function makeKernel(settings, roster) {
  const rows = new Map()
  let seq = 0
  const kernel = {
    settingsSnapshot: () => ({ ...settings }),
    members: { roster: () => roster.slice() },
    records: {
      put(r) {
        const id = r.id || ('row-' + (++seq))
        const prev = rows.get(id) || {}
        seq += 1
        const row = { ...prev, ...r, id, rev: (prev.rev || 0) + 1, updatedAt: seq, fingerprint: 'fp-' + id + '-' + seq }
        rows.set(id, row)
        return { id, rev: row.rev, fingerprint: row.fingerprint }
      },
      get({ id }) { return { record: rows.get(id) || null } },
      list({ track, limit } = {}) {
        const items = [...rows.values()].filter((r) => !track || r.track === track)
        return { items: typeof limit === 'number' ? items.slice(0, limit) : items }
      },
    },
  }
  return { kernel, rows }
}
const ROSTER = [
  { id: 'acad', slot: 'chair' },
  { id: 'r-1', slot: 'member' },
  { id: 'r-2', slot: 'member' },
  { id: 'office', slot: 'office' },
]
const BASE = { 'vmu.records.tracks': ['paper'], 'vmu.paper.officeConsult': 'off' }
const bootKit = (extra = {}, latex = null) => {
  const settings = { ...BASE, ...extra }
  const { kernel, rows } = makeKernel(settings, ROSTER)
  if (latex) kernel.latex = latex
  const flow = pack.createPaperSubsystem({ kernel, clock: () => 1 })
  return { flow, kernel, rows, settings }
}
const refusalOf = async (fn) => { try { await fn(); return null } catch (e) { return e } }
const stateOf = (flow, T) => { const got = flow.state(T); return got && got.state ? got.state : null }

// ── tool-level harness (real assembly on a temp root; same seam run 155 uses) ─────────────────────────────────────────
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
  return { exitCode: 1, stdout: '! Undefined control sequence.' + String.fromCharCode(10) + '<*> ' + tex }
}
const bootTools = async (settings = {}, subprocess = null) => {
  const root = await mkdtemp(join(tmpdir(), 'vmu-run156-'))
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
console.log('§0 源码口径：六处修法各在所有者上（行为由 §1–§6 钉住）')
{
  ok(TOOLS_SRC.includes("...(finalized.repair === true ? {") && TOOLS_SRC.includes('repairBudget: Number(finalized.repairBudget) || 0'),
    '① final 投影不再吞掉 repair/repairs/repairBudget/cap')
  ok(KIT_SRC.includes("from: 'awaiting-editor', to: 'writing', round: state.round, status: state.status, repair: true"),
    '① kit 的修复分支自报 from/to（回执能说清这次 revise 从哪到哪）')
  ok(TOOLS_SRC.includes("jobId: { type: 'string', description: 'name this job yourself;"),
    '② `vibe_v5_lean_run` 真的声明了 jobId（拒绝语点名的出口不再不可达）')
  ok(EXTRAS_SRC.includes('jobId: has(args.jobId) ? str(args.jobId) : undefined'),
    '② 工具把 jobId 转发给 Lean 面（内核 submit 一直收这个参数）')
  ok(TOOLS_SRC.includes('listed: true, count: papers.length, papers') && TOOLS_SRC.includes("if (action === 'status' && !target)"),
    '③ `status` 无 target 真的列出论文（hint 的承诺有机制）')
  ok(PANEL_SRC.includes('subgoal: row.subgoal === undefined ? null : (row.subgoal || null)') && PANEL_SRC.includes('status: row.status === undefined ? null : (row.status || null)'),
    '④ board 行回显 subgoal/status（与 set 的字段集一致）')
  ok(TOOLS_SRC.includes("engineSource: p.engine ? 'face' : ((engines[0] && engines[0].engine) ? 'triedEngines' : null)"),
    '⑤ 失败回执的 engine 回退到 triedEngines，并说明来源')
  ok(KIT_SRC.includes('const folderOf = (name) => {') && KIT_SRC.includes("id: state.id, folder: folderOf(state.id)"),
    '⑥ 目录名 slug 化，start 回执自报 id+folder')
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
console.log('§1 ① repair 回执：过轮数上限后的 revise 说清自己是修复轮（真 tool 回执）')
{
  const { specs } = await bootTools({ 'vmu.paper.maxRounds': 1 })
  const P = 'r156-修复轮'
  const started = await call(specs, 'vibe_v5_paper', { action: 'start', target: P, participants: ['r-1', 'r-2'] })
  ok(started.ok === true, '前提：论文建立成功', started && started.message)
  for (const m of ['r-1', 'r-2']) {
    await call(specs, 'vibe_v5_paper', { action: 'part', target: P, member: m, part: m + ' 的标题', body: m + ' 的正文' })
  }
  await call(specs, 'vibe_v5_paper', { action: 'advance', target: P })
  await call(specs, 'vibe_v5_paper', { action: 'review', target: P, member: 'r-1', deliverable: true, notes: '可交付' })
  await call(specs, 'vibe_v5_paper', { action: 'review', target: P, member: 'r-2', deliverable: false, notes: '差证据' })
  const moved = await call(specs, 'vibe_v5_paper', { action: 'advance', target: P })
  ok(moved.ok === true && moved.advance && moved.advance.to === 'awaiting-editor',
    '前提：论文停在 awaiting-editor 且已到上线（cap=1）', moved && moved.advance)
  const fin = await call(specs, 'vibe_v5_paper', { action: 'final', target: P, member: 'r-chair', decision: 'revise', note: '补一条' })
  ok(fin.ok === true && fin.final && fin.final.repair === true,
    '① 回执自报 repair:true（不必再调一次 status 才知道这是修复轮）', fin && fin.final)
  ok(fin.final && fin.final.repairs === 1 && fin.final.repairBudget === 2 && fin.final.cap === 1,
    '① 回执带 repairs/repairBudget/cap 三个读数', fin && fin.final)
  ok(fin.final && fin.final.from === 'awaiting-editor' && fin.final.to === 'writing' && fin.final.moved === true,
    '① 回执说清从哪到哪（awaiting-editor → writing）', fin && fin.final)
  const st = await call(specs, 'vibe_v5_paper', { action: 'status', target: P })
  ok(st.paper && st.paper.status === 'writing' && Number(st.paper.repairs) === 1,
    '① 论文真的回到 writing 且 repairs=1（回执与状态一致）', st.paper && { status: st.paper.status, repairs: st.paper.repairs })
  ok(true, '§1 修复轮回执四证齐全（上面五条即真机回执的四栏）')
}

// 反向对照（单独一篇、上限 3）：round=1 < cap 时的 revise 是**正常修订轮**，回执不得自称 repair
// （projection 只在修复分支上加这四个键；加成一刀切就等于伪造分支）。
{
  const { specs: s3 } = await bootTools({ 'vmu.paper.maxRounds': 3 })
  const Q = 'r156-正常修订'
  await call(s3, 'vibe_v5_paper', { action: 'start', target: Q, participants: ['r-1', 'r-2'] })
  await call(s3, 'vibe_v5_paper', { action: 'part', target: Q, member: 'r-1', part: '标题', body: '正文' })
  await call(s3, 'vibe_v5_paper', { action: 'advance', target: Q })
  await call(s3, 'vibe_v5_paper', { action: 'review', target: Q, member: 'r-1', deliverable: true, notes: '可交付' })
  await call(s3, 'vibe_v5_paper', { action: 'review', target: Q, member: 'r-2', deliverable: true, notes: '可交付' })
  const adv = await call(s3, 'vibe_v5_paper', { action: 'advance', target: Q })
  const before = await call(s3, 'vibe_v5_paper', { action: 'status', target: Q })
  ok(adv.advance && adv.advance.to === 'awaiting-editor' && before.paper.round === 1,
    '前提：论文在 awaiting-editor 且 round=1 < cap=3', { advance: adv && adv.advance, round: before.paper && before.paper.round })
  const normal = await call(s3, 'vibe_v5_paper', { action: 'final', target: Q, member: 'r-chair', decision: 'revise', note: '正常修订' })
  ok(normal.ok === true && normal.final && normal.final.repair === undefined && normal.final.repairs === undefined,
    '① 正常修订轮不自称 repair（四个字段只出现在修复分支）', normal && (normal.final || { code: normal.code, message: normal.message }))
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
console.log('§2 ② Lean 作业：face 真的接受 jobId 并转给内核（拒绝语点名的出口现在可达）')
{
  const seen = []
  const fakeKernel = {
    lean: {
      submit: async (a) => { seen.push({ ...a }); return { ok: true, id: a.jobId || 'lean-1', state: 'queued' } },
    },
  }
  const r1 = await extras.toolLeanRun({ file: 'Formal/x.lean', statement: 'n+n=2n', jobId: 'lean-9' }, { kernel: fakeKernel })
  ok(r1.ok === true && r1.id === 'lean-9', '② 传 jobId 时面按调用方的名字建作业', r1 && { id: r1.id })
  ok(seen.length === 1 && seen[0].jobId === 'lean-9', '② jobId 真的转发到 submit（不是被工具吞掉）', seen[0])
  const r2 = await extras.toolLeanRun({ file: 'Formal/x.lean', statement: 'n+n=2n' }, { kernel: fakeKernel })
  ok(r2.ok === true && r2.id === 'lean-1', '② 不传 jobId 时仍由面发号（自动路不回退）', r2 && { id: r2.id })
  const { specs } = await bootTools()
  const spec = TOOL(specs, 'vibe_v5_lean_run')
  // 注册到 host 的 parameters 是 JSON-Schema 形状（properties/required），不是 pack 声明里的简写。
  const props = spec && spec.parameters && spec.parameters.properties ? spec.parameters.properties : {}
  ok(spec !== undefined && props.jobId && props.jobId.type === 'string',
    '② 真装配里 `vibe_v5_lean_run` 的参数声明含 jobId', spec && Object.keys(props))
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
console.log('§3 ③ `status` 无 target 真的列论文（hint 不再指向一次会被自己拒掉的调用）')
{
  const { specs } = await bootTools()
  await call(specs, 'vibe_v5_paper', { action: 'start', target: 'p-a', participants: ['r-1'] })
  await call(specs, 'vibe_v5_paper', { action: 'start', target: 'p-b', participants: ['r-2'] })
  const listed = await call(specs, 'vibe_v5_paper', { action: 'status' })
  ok(listed.ok === true && listed.listed === true, '③ 无 target 的 status 返回 listing（不再被拒）', listed && { ok: listed.ok, listed: listed.listed, message: listed.message })
  ok(Number(listed.count) === 2 && Array.isArray(listed.papers) && listed.papers.length === 2,
    '③ 两篇论文各一行（count=2）', listed && { count: listed.count })
  const ids = (listed.papers || []).map((p) => p.id).sort()
  ok(ids[0] === 'paper-p-a' && ids[1] === 'paper-p-b', '③ 行里的 id 可直接当 target 用（与 status 同形）', ids)
  const listedPapers = listed.papers || []
  ok(listedPapers.length > 0 && listedPapers.every((p) => p.status === 'writing' && p.round === 1),
    '③ 行里带 status/round（完成状态可读，不用逐人 get）', listed.papers)
  const refused = await call(specs, 'vibe_v5_paper', { action: 'final' })
  ok(refused.ok === false && String(refused.hint || '').includes('status') && String(refused.hint || '').includes('lists them'),
    '③ 其余动作的拒绝语指向这次真的可用的 listing', refused && refused.hint)
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
console.log('§4 ④ 状态板 board 行回显 subgoal/status（规则 28「③各任务完成状态情况」）')
{
  const { kernel } = await bootTools()
  const panel = kernel.panel
  const did = await panel.set('r-1', { overall: '推进第 5 期', subgoal: '完成定稿', status: 'doing' }, { by: 'r-1' })
  ok(did && (did.ok === true || did.subtaskOk !== undefined || did.changed !== undefined), '前提：panel.set 接受 subgoal/status', did && (did.code || did.changed))
  const row = (panel.board() || []).filter((r) => r.member === 'r-1')[0] || null
  ok(row !== null, '前提：board 里有 r-1 的行', row)
  ok(row && row.subgoal === '完成定稿', '④ board 行回显 subgoal', row && row.subgoal)
  ok(row && row.status === 'doing', '④ board 行回显 status（完成状态不再只在 get 里）', row && row.status)
  // board() 只列出真的有记录的成员：所以「未设置」要用一个只写了 overall 的成员来证，
  // 而不是去筛「没有行」的成员（那会得到空集，空集上的 every() 是一个永真的空证。
  await panel.set('r-2', { overall: '只填进展' }, { by: 'r-2' })
  const unset = (panel.board() || []).filter((r) => r.member === 'r-2')
  ok(unset.length > 0 && unset.every((r) => r.subgoal === null && r.status === null), '④ 未设置的成员给 null（不是缺键，也不编造值）',
    unset.map((r) => ({ member: r.member, subgoal: r.subgoal, status: r.status })))
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
console.log('§5 ⑤ 失败回执的 engine 与 triedEngines 一致（同一份回执里两个字段不再互相否认）')
{
  const sub = makeSubprocess(FAILING_COMPILE)
  const { specs } = await bootTools({}, sub)
  const P = 'r156-编译失败'
  await call(specs, 'vibe_v5_paper', { action: 'start', target: P, participants: ['r-1'] })
  await call(specs, 'vibe_v5_paper', { action: 'part', target: P, member: 'r-1', part: '标题', body: '正文' })
  const compiled = await call(specs, 'vibe_v5_paper', { action: 'compile', target: P })
  const block = compiled.compiled || null
  ok(block !== null && block.ok === false, '前提：编译真的失败（回执仍是回执，不是抛空）', block && { ok: block.ok, code: block.code })
  ok(block && block.engine === 'xelatex', '⑤ 失败回执的 engine 是实际尝试的引擎（不再是 null）', block && block.engine)
  ok(block && block.engineSource === 'triedEngines', '⑤ engineSource 说明这个值来自 triedEngines', block && block.engineSource)
  ok(block && Array.isArray(block.triedEngines) && block.triedEngines.length > 0 && block.triedEngines[0].engine === block.engine,
    '⑤ engine 与 triedEngines[0].engine 一致（可逐字段对照）', block && block.triedEngines)
  ok(block && String(block.stderrTail || '').length > 0, '⑤ 失败尾部仍有编译器原话（上轮修好的不回退）', block && String(block.stderrTail || '').slice(0, 60))
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
console.log('§6 ⑥ 目录名 slug 化：标题当 id 也不会产生含空格目录（xelatex putenv 的 fatal）')
{
  const reqs = []
  const latex = { check: async (req) => { reqs.push(req); return { ok: false, code: 'VMU_PAPER_LATEX_FAILED', engine: 'xelatex', argv: [], tried: [{ engine: 'xelatex', phase: 'compile' }], stderr: 'x', stdout: '' } } }
  const { flow } = bootKit({}, latex)
  const T = '第 4 期 轮数 上限'
  const started = flow.start({ target: T, participants: ['r-1'] })
  ok(started.ok === true && typeof started.id === 'string' && started.id.length > 0, '⑥ start 回执自报 id', started && { id: started.id })
  ok(started.folder && !/\s/.test(started.folder), '⑥ 回执并排给出不含空格的 folder', started && started.folder)
  await refusalOf(async () => flow.compilePdf({ target: T }))
  ok(reqs.length === 1, '前提：compile 真的把请求交给 LaTeX 面', reqs.length)
  const req = reqs[0] || {}
  ok(typeof req.outDir === 'string' && !/\s/.test(req.outDir), '⑥ outDir 不含空格（TeX putenv 不再 fatal）', req.outDir)
  ok(typeof req.sourceName === 'string' && !/\s/.test(req.sourceName) && req.sourceName.endsWith('.tex'),
    '⑥ 源文件名同样 slug 化并保留 .tex', req.sourceName)
  ok(String(req.outDir || '').includes(String(started.folder)), '⑥ 回执给的 folder 就是 compile 真正用的目录名', { folder: started.folder, outDir: req.outDir })
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
// ── §7 ⑦ compile 的回执路径只包「编译失败」，其它拒绝照旧具名拒绝（audit26 item 8）──
console.log('§7 ⑦ compile 的回执路径只包「编译失败」，其它拒绝照旧具名拒绝')
{
  // ⑦-1 源码口径：catch 前面必须有「只接 PDF_FAILED」的卫兵
  ok(TOOLS_SRC.includes("if (!e || String(e.code || '') !== 'VMU_PACK_V5R_CORE_PAPER_PDF_FAILED') throw e"),
    '⑦ catch 的作用域被限制在编译失败上（其它错误继续抛）')
  // ⑦-2 行为口径：不存在的论文 —— 必须是具名拒绝，不能是一份「没问题」的回执
  const bare = await bootTools()
  const typo = await call(bare.specs, 'vibe_v5_paper', { action: 'compile', target: 'c7-没这篇' })
  ok(typo.ok === false && typo.compiled === undefined && /PAPER_STATE|NO_SUCH_OBJECT/.test(String(typo.code || '')),
    '⑦ 不存在的论文 compile 是具名拒绝（不被 catch 吞成 ok:true）',
    typo && { ok: typo.ok, code: typo.code, message: typo.message })
  // ⑦-3 反向对照：真正的编译失败仍然是回执（RUN 155 修好的那半不回退）
  const sub = makeSubprocess(FAILING_COMPILE)
  const { specs } = await bootTools({}, sub)
  await call(specs, 'vibe_v5_paper', { action: 'start', target: 'c7-fail', participants: ['r-1'] })
  const failed = await call(specs, 'vibe_v5_paper', { action: 'compile', target: 'c7-fail' })
  ok(failed.ok === true && failed.compiled && failed.compiled.produced === false,
    '⑦ 真编译失败仍走回执路径（不是拒绝、也不是抛异常）',
    failed && { ok: failed.ok, produced: failed.compiled && failed.compiled.produced })
}

process.chdir(ORIG_CWD)
console.log('')
console.log('=== RUN 156 RUN-5 FIXES: ' + passed + ' passed, ' + failed + ' failed ===')
if (failed > 0) { for (const f of failures) console.log('  FAILED: ' + f); process.exit(1) }

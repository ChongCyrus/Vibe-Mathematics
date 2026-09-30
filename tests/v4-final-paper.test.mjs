// ============================================================
// V4 FINAL PAPER SUITE  (docs/final-paper.md, v1 + v2 amendments)
//
// Covers the v4 side of docs/final-paper.md §6:
//   · the five/six new parameters: defaults, schema presence, boolean/enum coercion of RAW STRINGS
//     (the `/v4 set` path hands the parameter layer strings) and rejection/fallback of bad values;
//   · the trigger: NOT fired on a run that has not closed, fired on the closing meeting's unanimous
//     stop vote, disabled by `finalPaper=false`, and idempotent when re-triggered;
//   · the team flow: parts -> framework merge -> cross-review (each participant reviews ANOTHER
//     part) -> editor finalisation -> deliverability vote, for `paperEditor=office` and
//     `resident:<id>` (including the dismissed-editor downgrade);
//   · NEGATIVE cases: a review that names nobody is refused and cannot finalise; dissent never
//     finalises silently (bounded iteration, then the appendix + a warning);
//   · the md+tex nine-section skeleton, the evidence index, and explicit 未决 flags;
//   · the compile branches via an INJECTED FAKE COMPILER (success / repaired via the minimal
//     template / persistent failure -> degrade) plus the no-LaTeX branch and `paperCompilePdf=false`;
//   · `Paper/<id>/` containment for a hostile problem id, and no pollution of Verified/State;
//   · `/v4 paper` with parameter overrides, `force`, and `kind:'error'` on a bad option.
//
// V4_PLUGIN overrides the plugin under test: a sensitivity probe MUST point this suite at a mutated
// copy, otherwise the probe would exercise the unmutated plugin and stay green
// (AUDIT-CHECKLIST §2.5).
//
// Run: node tests/v4-final-paper.test.mjs
// ============================================================
import { mkdtempSync, rmSync, existsSync, readFileSync, readdirSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
const PLUGIN = process.env.V4_PLUGIN
  ? new URL('file:///' + String(process.env.V4_PLUGIN).replace(/\\/g, '/'))
  : new URL('../vibe-math-v4/vibe-math-v4.js', import.meta.url)
const sleep = ms => new Promise(r => setTimeout(r, ms))
let passed = 0, failed = 0
const failures = []
const assert = (c, m) => { if (c) { passed++; console.log('  ok - ' + m) } else { failed++; failures.push(m); console.error('  FAIL - ' + m) } }
const section = (t) => console.log('\n[' + t + ']')
const JSONX = o => '```json\n' + JSON.stringify(o) + '\n```'
const readIf = (p) => { try { return readFileSync(p, 'utf8') } catch (e) { return '' } }
/** Parse a JSON artifact, or `null` when it is missing/unparseable — a missing artifact must be ONE
 *  clean assertion failure, never an uncaught SyntaxError that swallows the rest of the file. */
const readJsonIf = (p) => { try { return JSON.parse(readFileSync(p, 'utf8')) } catch (e) { return null } }

// ---- injectable fake LaTeX compiler ------------------------------------------------------------
// The host fs is text-only, so paper.pdf can ONLY come from the compiler subprocess. This mock is
// that subprocess: `mode` decides how the fake engine behaves.
const COMPILER = { mode: 'none', engines: [], ws: '' }
function makeSubprocess() {
  return {
    async resolveExecutable(cmd) {
      if (COMPILER.mode === 'none' || COMPILER.engines.indexOf(String(cmd)) === -1) throw new Error('spawn ' + cmd + ' ENOENT')
      return String(cmd)
    },
    spawn(spec) {
      // The plugin passes the paper directory RELATIVE to the project root (a real host resolves it
      // against the session workspace); the mock must do the same.
      const raw = String(spec.cwd || '')
      const cwd = raw.indexOf(':') !== -1 || raw[0] === '/' ? raw : join(COMPILER.ws, 'VibeMath', 'Projects', 'default', raw)
      const argv = (spec.argv || []).map(String)
      const exe = argv[0] || ''
      const texRel = argv[argv.length - 1] || ''
      const tex = existsSync(join(cwd, texRel)) ? readFileSync(join(cwd, texRel), 'utf8') : ''
      const usesPackages = /\\usepackage/.test(tex)
      let exitCode = 0
      if (COMPILER.mode === 'ok') exitCode = 0
      else if (COMPILER.mode === 'repair') exitCode = usesPackages ? 1 : 0   // only the minimal template compiles
      else if (COMPILER.mode === 'fail') exitCode = 1
      if (exitCode === 0) { try { writeFileSync(join(cwd, 'paper.pdf'), '%PDF-1.4 fake compiler output for ' + exe) } catch (e) {} }
      const text = exitCode === 0 ? 'fake engine ok\n' : '! Fake LaTeX error: unsupported package\n'
      return {
        done: Promise.resolve({ exitCode, signal: null }),
        collected: {
          stdout: { readFrom: () => ({ text: exitCode === 0 ? text : '', nextOffset: 0, lossy: false }) },
          stderr: { readFrom: () => ({ text: exitCode === 0 ? '' : text, nextOffset: 0, lossy: false }) },
        },
        terminate() {},
      }
    },
  }
}

function makeCtx() {
  const WS = mkdtempSync(join(tmpdir(), 'vibe-v4-paper-'))
  COMPILER.ws = WS
  const listeners = {}, toolRegs = [], cmdRegs = [], spawns = [], followups = []
  let ROOT
  const ctx = {
    get(name) { return name === 'subprocess' ? makeSubprocess() : undefined },
    on(e, fn) { (listeners[e] = listeners[e] || []).push(fn) },
    effect(fn) { const d = fn(); return () => { if (typeof d === 'function') d() } },
    logger: { info() {}, warn() {}, error() {} },
    timeout(cb, ms) { const h = setTimeout(cb, ms); return () => clearTimeout(h) },
    tools: { register(s) { toolRegs.push(s) } },
    commands: { register(s) { cmdRegs.push(s) } },
    subagents: {
      list() { return ['spawn'] },
      async startContinuable({ label, request }) { const id = 'c' + (spawns.length + 1); spawns.push({ label, childId: id, request }); return { childId: id } },
      async sendMessage(parent, childId, blocks) { followups.push({ childId, blocks }); return 'w' + followups.length },
      interrupt() {},
    },
    agents: { roots() { return [] }, get(id) { return id === 'sess-A' ? ROOT : undefined } },
    fs: {
      async resolve(rel, opts) { const b = (opts && opts.cwd) || WS; return { targetKey: join(b, ...String(rel).split('/')), displayPath: 'x' } },
      async stat(t) { return existsSync(t.targetKey) ? { version: 'v1', type: 'file', size: 1 } : undefined },
      async readText(t) { return readFileSync(t.targetKey, 'utf8') },
      async writeText(t, c) { mkdirSync(dirname(t.targetKey), { recursive: true }); writeFileSync(t.targetKey, c, 'utf8') },
      async listDir(t) { if (!existsSync(t.targetKey)) return []; return readdirSync(t.targetKey, { withFileTypes: true }).map(e => ({ name: e.name, type: e.isDirectory() ? 'directory' : 'file' })) },
    },
  }
  ROOT = { id: 'sess-A', options: { provider: 'mock', model: 'm' }, session: { id: 'sess-A', header: { cwd: WS, parentSession: undefined } }, followup() {}, ctx: undefined }
  return {
    WS, ctx, toolRegs, cmdRegs, spawns, followups,
    callTool: async (n, a) => { const s = toolRegs.find(x => x.name === n); if (!s) throw new Error('no tool ' + n); return JSON.parse(await s.execute(a || {}, { agent: ROOT })) },
    callToolAs: async (n, a, cid) => { const s = toolRegs.find(x => x.name === n); if (!s) throw new Error('no tool ' + n); const agent = { id: cid, session: { id: cid, header: { cwd: WS, parentSession: 'sess-A' } } }; return JSON.parse(await s.execute(a, { agent })) },
    fireEnd: (info) => { for (const h of (listeners['subagent/end'] || [])) h(info) },
    cmd: async (rawInput) => { const c = cmdRegs.find(x => x.name === 'v4'); if (!c) throw new Error('no /v4 command'); return await c.handler({ agent: ROOT, rawInput }) },
    ridOf: (cid) => { const s = spawns.find(x => x.childId === cid); return s ? s.label : '' },
  }
}
async function newPlugin(m) {
  const q = Date.now() + Math.random()
  const mod = await import(PLUGIN.href + '?t=' + q)
  ;(mod.default || mod).apply(m.ctx)
}
async function waitFor(pred, ms = 3000) { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (pred()) return true; await sleep(5) } return !!pred() }
/** Poll `status()` until `pred` holds (or the wall-clock budget expires) and return the last status.
 *  Every timing-sensitive precondition is WAITED for, then asserted — a fixed iteration budget is not
 *  a clock, and under a 4-way parallel gate (measured with 4 CPU hogs + 4 copies) a 60-iteration
 *  budget expired before the plugin had even reached the step under test. */
async function waitStatus(m, pred, ms = 30000) {
  const t0 = Date.now()
  let st = await m.callTool('vibe_v4_status', {})
  while (!pred(st) && (Date.now() - t0) < ms) { await sleep(10); st = await m.callTool('vibe_v4_status', {}) }
  return st
}
/** Drive one resident turn at a time; `reply(text, rid, fu)` returns the JSON object to answer with.
 *  Bounded by WALL-CLOCK (`maxMs`) as well as a generous iteration cap, so CPU contention can only
 *  make the drive take longer, never make it give up early on an outer assertion. */
async function drive(m, reply, stop, opts) {
  const o = opts || {}
  const budget = o.budget || 20000
  const maxMs = o.maxMs || 60000
  const t0 = Date.now()
  let fi = 0
  for (let i = 0; i < budget && (Date.now() - t0) < maxMs; i++) {
    if (fi < m.followups.length) {
      const fu = m.followups[fi++]
      const rid = m.ridOf(fu.childId)
      const pt = (fu.blocks && fu.blocks[0] && fu.blocks[0].text) || ''
      const r = reply(pt, rid, fu)
      const obj = (r && typeof r === 'object' && r.__raw) ? r.__raw : r
      m.fireEnd({ id: fu.childId, runId: 'p-' + i, provider: 'spawn', local: true, stopReason: 'completed', lastAssistantMessage: [{ type: 'text', text: JSONX(obj === undefined ? {} : obj) }] })
      await sleep(2)
      continue
    }
    const st = await m.callTool('vibe_v4_status', {})
    if (stop && stop(st)) return st
    await sleep(5)
  }
  return await m.callTool('vibe_v4_status', {})
}
/** Per-case teardown: stop this case's scheduler/heartbeat (a still-armed heartbeat from a finished
 *  case keeps burning the event loop and makes the NEXT case slower) and delete its scratch tree. */
async function finish(m) {
  try { await m.callTool('vibe_v4_abort', {}) } catch (e) { /* best effort */ }
  rmSync(m.WS, { recursive: true, force: true })
}
/** Start a 2-resident run with one recorded proposition + one method (evidence for §4/§6). */
async function startRun(m, problem, extra) {
  await m.callTool('vibe_v4_start', { problem: problem || 'final-paper-test', residentCount: 2 })
  await waitFor(() => m.spawns.length >= 2)
  // `activityTimeoutMs` doubles as the consensus-watchdog period (`recoverStallMs() = 2×`) and as the
  // paper step deadline (`max(2000, 4×recoverStallMs)`). 60 ms → a 240 ms paper deadline, which a
  // loaded host can blow past while merely answering the fixture's own wakes (a successful
  // contribution would be recorded as "missing"). 1000 ms ⇒ an 8 s step budget: still a fast run,
  // but no longer a bet on the scheduler.
  await m.callTool('vibe_v4_set', { activityTimeoutMs: 1000, verdictMaxRounds: 1, ...(extra || {}) })
  for (const sp of m.spawns.slice()) {
    m.fireEnd({ id: sp.childId, runId: 'br-' + sp.label, provider: 'spawn', local: true, stopReason: 'completed', lastAssistantMessage: [{ type: 'text', text: JSONX({ summary: 'insight ' + sp.label, solved: false }) }] })
    await sleep(30)
  }
  await m.callToolAs('vibe_v4_record_proposition', { id: 'p-ok', title: '已证命题', statement: 's', prob: 0.8, value: 0.7, motivation: 'm' }, m.spawns[0].childId)
  await m.callToolAs('vibe_v4_record_method', { id: 'm-tool', title: '工具法', type: '工具', content: 'c', value: 0.6, motivation: 'm' }, m.spawns[1].childId)
  // `subagent/end` is delivered to ASYNC listeners: WAIT for the phase transition (the old code
  // asserted it 30 ms after the last end, which is a clock-dependent precondition).
  await waitStatus(m, (s) => s.phase === 'active', 30000)
  return m
}
/** Drive the closing meeting to a UNANIMOUS stop vote → the paper trigger (docs/final-paper.md §A4).
 *  The same driver then answers the paper's own wakes, so the auto path is exercised end to end.
 *  `expectPaper=false` is for the `finalPaper=false` case, where the run concludes immediately and
 *  no paper state is ever entered — waiting for `paper.status==='done'` there burns the whole wall
 *  budget for nothing. */
async function closeRun(m, paperOpts, expectPaper = true) {
  const st0 = await waitStatus(m, (s) => s.phase === 'active', 30000)
  assert(st0.phase === 'active', 'run reached the active phase (phase=' + st0.phase + ')')
  await m.callTool('vibe_v4_meeting', { agenda: '收口会议' })
  const answerPaper = paperReply(paperOpts || {})
  return await drive(m, (pt, rid, fu) => {
    if (/meeting is in progress/i.test(pt)) return { input: '同意收口 ' + rid, voteSolved: true, propose_verify: null, propose_task: null, claim_task: null }
    if (/verifying object/i.test(pt)) return { vote: { verdict: 1, reason: 'ok' } }
    if (/\[PAPER /.test(pt)) return answerPaper(pt, rid, fu)
    return { summary: '继续', solved: false }
  }, (st) => st.autoDone === true && (!expectPaper || (st.paper && st.paper.status === 'done')), { maxMs: 90000 })
}
const paperReply = (opts) => (pt, rid, fu) => {
  const o = opts || {}
  if (/\[PAPER PART\]/.test(pt)) {
    if (o.partMissing && o.partMissing.indexOf(rid) !== -1) return { summary: '（不发部分）' }
    return { paperPart: { title: '部分 ' + rid, markdown: (o.partText || defaultPart)(rid) } }
  }
  if (/\[PAPER REVIEW\]/.test(pt)) {
    if (o.badReview && o.badReview.indexOf(rid) !== -1) return { paperReview: { reviewed: rid, points: ['自审'], improvements: 'x' } }
    const others = fu && fu.childId ? null : null
    const other = (o.otherOf && o.otherOf[rid]) || (rid === 'r-1' ? 'r-2' : 'r-1')
    return { paperReview: { reviewed: other, points: ['记号不统一：请统一 ' + rid], improvements: '已统一记号与术语' } }
  }
  if (/\[PAPER FINAL\]/.test(pt)) return { paperFinal: { markdown: '# 最终稿（resident 定稿）\n\n## 原问题\n\n由 ' + rid + ' 定稿。\n\n## 规律\n\n- 复用法则一\n' } }
  if (/\[PAPER DELIVERABLE\]/.test(pt) || /\[PAPER REVISE\]/.test(pt)) {
    if (o.dissent && o.dissent.indexOf(rid) !== -1) return { paperDeliverable: false, reason: '第 4 节证据不足' }
    return { paperDeliverable: true, reason: '可交付' }
  }
  return { summary: '继续', solved: false }
}
const defaultPart = (rid) => ['## ' + rid + ' 的部分', '', '我们证明了结论 ' + rid + '。', '', '- 记号：统一用 $n$ 表示自然数', '',
  '- 证据：`Verified/命题/p-ok.md`'].join('\n')

// =====================================================================================
section('1 parameters: defaults, schema, raw-string coercion, rejection')
{
  const m = makeCtx(); await newPlugin(m)
  const st = await m.callTool('vibe_v4_status', {})
  assert(st.paper.params.finalPaper === true && st.paper.params.paperFormat === 'both' && st.paper.params.paperLanguage === 'zh'
    && st.paper.params.paperCompilePdf === true && st.paper.params.paperEditor === 'office' && st.paper.params.paperLatexCommand === '',
    '★ defaults: finalPaper=true, paperFormat=both, paperLanguage=zh, paperCompilePdf=true, paperEditor=office, paperLatexCommand="" (got ' + JSON.stringify(st.paper.params) + ')')
  const setSpec = m.toolRegs.find(t => t.name === 'vibe_v4_set')
  for (const k of ['finalPaper', 'paperFormat', 'paperLanguage', 'paperCompilePdf', 'paperEditor', 'paperLatexCommand']) {
    assert(!!(setSpec.parameters.properties && setSpec.parameters.properties[k]), '★ vibe_v4_set schema advertises ' + k)
  }
  assert(JSON.stringify(setSpec.parameters.properties.paperFormat.enum) === JSON.stringify(['both', 'md', 'tex'])
    && JSON.stringify(setSpec.parameters.properties.paperLanguage.enum) === JSON.stringify(['zh', 'en']),
    'the schema narrows paperFormat/paperLanguage to their real enums')
  assert(/finalPaper/.test(setSpec.description) && /paperEditor/.test(setSpec.description) && /paperLatexCommand/.test(setSpec.description),
    '★ the tool HELP names the paper parameters (a schema key the help never mentions is not discoverable)')
  // RAW STRINGS are what `/v4 set` hands the parameter layer (docs/final-paper.md §B): 'false' must not stay truthy.
  const r1 = await m.callTool('vibe_v4_set', { finalPaper: 'false', paperFormat: 'tex', paperLanguage: 'en', paperCompilePdf: '0', paperEditor: 'resident:r-2' })
  assert(r1.paper.params.finalPaper === false && r1.paper.params.paperFormat === 'tex' && r1.paper.params.paperLanguage === 'en' && r1.paper.params.paperCompilePdf === false && r1.paper.params.paperEditor === 'resident:r-2',
    '★ raw strings are coerced: finalPaper="false"→false, paperCompilePdf="0"→false, enums accepted (got ' + JSON.stringify(r1.paper.params) + ')')
  const r2 = await m.callTool('vibe_v4_set', { finalPaper: 'banana', paperFormat: 'docx', paperLanguage: 'fr', paperEditor: 'nobody' })
  assert(r2.paper.params.finalPaper === true && r2.paper.params.paperFormat === 'both' && r2.paper.params.paperLanguage === 'zh' && r2.paper.params.paperEditor === 'office',
    '★ bad values fall back to the DEFAULTS (never to a stronger/different behaviour): ' + JSON.stringify(r2.paper.params))
  const r3 = await m.callTool('vibe_v4_set', { paperNonsense: 1 })
  assert(r3.ok === false && Array.isArray(r3.ignored) && r3.ignored.indexOf('paperNonsense') !== -1, 'an unknown key is refused with ok:false + ignored[] (never silent)')
  assert(st.paper.closureSignal.indexOf('finalizeMeeting/allSolved') === 0, '★ status cites the REAL closure branch (v2 §A4): ' + st.paper.closureSignal)
  await finish(m)
}

// =====================================================================================
section('2 negative triggers: not closed, and finalPaper=false')
{
  const m = makeCtx(); await newPlugin(m)
  await startRun(m)
  const st = await m.callTool('vibe_v4_status', {})
  assert(!existsSync(join(m.WS, 'VibeMath', 'Projects', 'default', 'Paper')), '★ a run that has NOT closed writes no Paper/ directory (negative trigger)')
  assert(st.paper.status === 'idle', 'and status reports idle (got ' + st.paper.status + ')')
  await finish(m)
}
{
  const m = makeCtx(); await newPlugin(m)
  await startRun(m, 'final-paper-off', { finalPaper: false })
  const st = await closeRun(m, {}, false)   // finalPaper=false: the run concludes with NO paper phase
  assert(st.autoDone === true, 'finalPaper=false: the run still closes normally')
  assert(!existsSync(join(m.WS, 'VibeMath', 'Projects', 'default', 'Paper')), '★ finalPaper=false suppresses the automatic paper entirely')
  const cmd = await m.cmd('paper')
  const parsed = JSON.parse(cmd.text)
  assert(cmd.kind === 'success' && parsed.ok === true && /finalPaper=false/.test(JSON.stringify(parsed)),
    '★ ...but the MANUAL /v4 paper command still works and says the automatic trigger is off')
  await finish(m)
}

// =====================================================================================
section('3 automatic trigger on the unanimous stop vote + full team flow + 9-section md/tex')
{
  const m = makeCtx(); await newPlugin(m)
  await startRun(m, '团队合写测试')
  await m.callToolAs('vibe_v4_record_proposition', { id: 'p-unres', title: '未决命题', statement: 's', prob: 0.4, value: 0.3, motivation: 'm' }, m.spawns[0].childId)
  COMPILER.mode = 'ok'; COMPILER.engines = ['xelatex', 'latexmk']
  const st = await closeRun(m)
  // The PAPER must actually have run: without `st.paper.status==='done' && finalizedAt>0` this
  // assertion also holds when the paper phase is disabled (docs/final-paper.md §A1 mutant), and the case would
  // only die later on a missing artifact. It is the paper phase's own success that must be asserted.
  assert(st.autoDone === true && st.running === false && st.paper.status === 'done' && st.paper.finalizedAt > 0 && st.paper.trigger === 'auto',
    '★ the paper ran to completion (status=' + st.paper.status + ', finalizedAt=' + st.paper.finalizedAt + ', trigger=' + st.paper.trigger + ') and only THEN the run was marked done (docs/final-paper.md §A1)')
  const dir = join(m.WS, 'VibeMath', 'Projects', 'default', 'Paper', st.paper.id)
  const meta = readJsonIf(join(dir, 'paper.meta.json')) || {}
  const md = readIf(join(dir, 'paper.md')), tex = readIf(join(dir, 'paper.tex')), log = readIf(join(dir, 'paper.log.md'))
  assert(existsSync(dir) && !!md && !!tex && !!log && meta.dir === 'Paper/' + meta.id, '★ Paper/<run id>/{paper.md,paper.tex,paper.meta.json,paper.log.md} all exist (meta.dir=' + meta.dir + ')')
  const heads = ['标题、作者、日期与摘要', '引言与问题背景', '原问题的完整解法', '已检验通过的命题', '已解决的子问题与中间成果', '创造或发现的有价值之物', '规律总结', '讨论、局限与展望', '附录：证据与文件索引']
  assert(heads.every((h, i) => md.indexOf('## ' + (i + 1) + '. ' + h) !== -1), '★ the md carries the exact 9-section skeleton (docs/final-paper.md §3)')
  assert(heads.every((h, i) => tex.indexOf('\\section{' + h + '}') !== -1), '★ the tex carries the same 9 sections')
  assert(/\\documentclass\[11pt\]\{ctexart\}/.test(tex) && /\\usepackage\{amsmath\}/.test(tex) && /\\usepackage\{hyperref\}/.test(tex),
    'the zh template is ctexart with the documented package set (docs/final-paper.md §5)')
  assert(/Verified\/命题\/p-ok\.md|Propos\//.test(md) && /p-ok/.test(md), '★ the evidence index names real card paths')
  assert(/\[未决\]/.test(md) && /p-unres/.test(md), '★ an unverified object is explicitly flagged [未决] (docs/final-paper.md §3 writing rule)')
  assert(/Vibe-Mathematics v4/.test(md) && /团队合写测试/.test(md), 'the title/abstract carry the preset name and the original problem')
  assert(meta.finalizedAt > 0 && meta.trigger === 'auto' && meta.params && meta.params.paperFormat === 'both' && meta.params.paperLanguage === 'zh',
    '★ paper.meta.json records the trigger, the params, the language and finalizedAt')
  assert((meta.parts || []).length === 2 && (meta.reviews || []).length === 2 && (meta.deliverable || []).length === 2,
    '★ meta records who wrote a part, who reviewed (and whom), and every deliverability statement')
  assert((meta.reviews || []).every(r => r.reviewed && r.reviewed !== r.id), '★ every review names ANOTHER participant (docs/final-paper.md §4.3)')
  // The no-invention contract must reach EVERY paper wake (v2/v3 already assert it; v4 shipped the
  // clause in the prompt but nothing guarded it — a prompt-level regression would have been silent).
  const paperPrompts = m.followups.map(f => (f.blocks && f.blocks[0] && f.blocks[0].text) || '').filter(t => /\[PAPER /.test(t))
  assert(paperPrompts.length >= 6 && paperPrompts.every(t => /只整理\*\*已有证据\*\*/.test(t) && /不得编造/.test(t) && /未决\/被否证的条目必须显式标注/.test(t)),
    '★ every one of the ' + paperPrompts.length + ' paper wakes carries the no-invention contract: only reorganise EXISTING evidence, never invent, and flag unresolved/refuted items explicitly')
  assert(/互审/.test(log) && /已采纳/.test(log) && /交付表态/.test(log) && /定稿/.test(log),
    '★ paper.log.md records who wrote what, who raised which review point and how it was handled')
  assert(/facilitator 合并|合并完成/.test(log) && meta.mergeNotes && typeof meta.mergeNotes.dups === 'number',
    '★ the framework merge step ran and recorded its dedup/term-unification bookkeeping')
  assert(m.spawns.length === 2, 'the team was reused (no extra residents were spawned for the paper)')
  await finish(m)
}

// =====================================================================================
section('4 idempotency: re-triggering the same run only fills missing artifacts')
{
  const m = makeCtx(); await newPlugin(m)
  await startRun(m, '幂等测试')
  COMPILER.mode = 'ok'; COMPILER.engines = ['xelatex']
  const st = await closeRun(m)
  const dir = join(m.WS, 'VibeMath', 'Projects', 'default', 'Paper', st.paper.id)
  const meta1 = readJsonIf(join(dir, 'paper.meta.json')) || {}
  const md1 = readIf(join(dir, 'paper.md'))
  await sleep(20)
  const again = await m.cmd('paper')
  const parsed = JSON.parse(again.text)
  assert(again.kind === 'success' && parsed.ok === true && parsed.idempotent === true, '★ a second trigger is recognised as already finalized (idempotent=true)')
  const meta2 = readJsonIf(join(dir, 'paper.meta.json')) || {}
  assert(meta2.finalizedAt === meta1.finalizedAt && meta2.filled === undefined && readIf(join(dir, 'paper.md')) === md1,
    '★ nothing was rewritten: finalizedAt unchanged, paper.md byte-identical')
  rmSync(join(dir, 'paper.pdf'), { force: true })
  const refill = await m.cmd('paper')
  const p3 = JSON.parse(refill.text)
  assert(p3.idempotent === true && existsSync(join(dir, 'paper.pdf')), '★ a missing artifact (deleted pdf) is the ONLY thing a re-trigger writes (filled=' + JSON.stringify(p3.filled) + ')')
  const forced = await m.cmd('paper force')
  const p4 = JSON.parse(forced.text)
  assert(forced.kind === 'success' && p4.ok === true && !p4.idempotent, '★ /v4 paper force rewrites instead of short-circuiting')
  await finish(m)
}

// =====================================================================================
section('5 /v4 paper overrides: lang=en, format=tex, editor, and error kind')
{
  const m = makeCtx(); await newPlugin(m)
  await startRun(m, 'override-test')
  COMPILER.mode = 'none'
  const r = await m.cmd('paper lang=en format=tex')
  const parsed = JSON.parse(r.text)
  assert(r.kind === 'success' && parsed.ok === true, '/v4 paper lang=en format=tex was accepted')
  const st = await drive(m, paperReply({}), (s) => s.paper && s.paper.status === 'done', { maxMs: 90000 })
  const dir = join(m.WS, 'VibeMath', 'Projects', 'default', 'Paper', st.paper.id)
  const tex = readIf(join(dir, 'paper.tex'))
  assert(existsSync(join(dir, 'paper.tex')) && !existsSync(join(dir, 'paper.md')), '★ format=tex produces paper.tex and NO paper.md')
  assert(/\\documentclass\[11pt\]\{article\}/.test(tex), '★ lang=en switches the template to article (no ctexart)')
  // The English variant must carry the same no-invention contract as the zh one.
  const enPaperPrompts = m.followups.map(f => (f.blocks && f.blocks[0] && f.blocks[0].text) || '').filter(t => /\[PAPER /.test(t))
  assert(enPaperPrompts.length > 0 && enPaperPrompts.every(t => /Only organise EXISTING evidence/.test(t) && /never invent/.test(t) && /flag unresolved\/refuted items explicitly/.test(t)),
    '★ the lang=en paper wakes carry the English no-invention contract too (' + enPaperPrompts.length + ' wakes)')
  assert(/\[PAPER DELIVERABLE\]/.test(m.followups.map(f => (f.blocks && f.blocks[0] && f.blocks[0].text) || '').join('\n')), 'the deliverability vote was held')
  const bad = await m.cmd('paper nonsense=1')
  assert(bad.kind === 'error' && JSON.parse(bad.text).ok === false, '★ a bad /v4 paper option returns kind:\'error\' (never a silent success)')
  const hint = m.cmdRegs.find(c => c.name === 'v4').input.hint
  assert(/paper/.test(hint), 'the /v4 slash hint advertises the paper subcommand')
  await finish(m)
}

// =====================================================================================
section('6 paperEditor=resident:<id> and the dismissed-editor downgrade (v2 §A5)')
{
  const m = makeCtx(); await newPlugin(m)
  await startRun(m, 'resident-editor')
  COMPILER.mode = 'ok'; COMPILER.engines = ['xelatex']
  const start = await m.cmd('paper editor=resident:r-2')
  assert(JSON.parse(start.text).ok === true, 'paperEditor=resident:r-2 accepted by the command')
  let sawFinal = false, finalRid = ''
  const st = await drive(m, (pt, rid, fu) => {
    if (/\[PAPER FINAL\]/.test(pt)) { sawFinal = true; finalRid = rid }
    return paperReply({})(pt, rid, fu)
  }, (s) => s.paper && s.paper.status === 'done', { maxMs: 90000 })
  assert(sawFinal && finalRid === 'r-2', '★ the NAMED resident (r-2) received the [PAPER FINAL] turn (got ' + finalRid + ')')
  const dir = join(m.WS, 'VibeMath', 'Projects', 'default', 'Paper', st.paper.id)
  assert(/resident 定稿/.test(readIf(join(dir, 'paper.md'))), '★ the resident\'s own final text reached paper.md')
  const meta = readJsonIf(join(dir, 'paper.meta.json')) || {}
  assert(meta.editor === 'resident:r-2' && meta.editorId === 'r-2' && meta.editorDowngraded === false, 'meta records the named editor')
  await finish(m)
}
{
  const m = makeCtx(); await newPlugin(m)
  await startRun(m, 'dismissed-editor')
  await m.callTool('vibe_v4_remove_member', { id: 'r-2' })
  COMPILER.mode = 'ok'; COMPILER.engines = ['xelatex']
  const start = await m.cmd('paper editor=resident:r-2')
  assert(JSON.parse(start.text).ok === true, 'paper started with an editor who has just been dismissed')
  const st = await drive(m, paperReply({}), (s) => s.paper && s.paper.status === 'done', { maxMs: 90000 })
  const dir = join(m.WS, 'VibeMath', 'Projects', 'default', 'Paper', st.paper.id)
  const meta = readJsonIf(join(dir, 'paper.meta.json')) || {}
  assert(meta.editorDowngraded === true && meta.editorId === 'office' && /降级/.test(readIf(join(dir, 'paper.log.md'))),
    '★ a dismissed editor is DOWNGRADED to office and the downgrade is recorded in meta + log (never silently substituted)')
  await finish(m)
}

// =====================================================================================
section('7 negative team flow: an invalid review cannot finalise (and is warned if it never lands)')
{
  const m = makeCtx(); await newPlugin(m)
  await startRun(m, 'bad-review')
  const start = await m.cmd('paper lang=en format=md')
  assert(JSON.parse(start.text).ok === true, 'paper started to observe the review guard')
  let badAnswers = 0
  // r-1 answers its review by naming ITSELF → must be refused; r-2 answers properly.
  const st1 = await drive(m, (pt, rid, fu) => {
    if (/\[PAPER REVIEW\]/.test(pt) && rid === 'r-1') { badAnswers++; return { paperReview: { reviewed: 'r-1', points: ['自审'] } } }
    return paperReply({})(pt, rid, fu)
  }, (s) => badAnswers >= 1 && s.paper && s.paper.status === 'review', { maxMs: 30000 })
  const dir = join(m.WS, 'VibeMath', 'Projects', 'default', 'Paper', st1.paper.id)
  assert(badAnswers >= 1, 'the invalid review was actually submitted at least once')
  assert(st1.paper.status === 'review' && !existsSync(join(dir, 'paper.md')),
    '★ an invalid review is REFUSED and the paper does NOT finalise (status=' + st1.paper.status + ', bad review still outstanding)')
  // Let the step deadline expire: the flow must escape with an explicit warning + an appendix note.
  const st2 = await drive(m, (pt, rid, fu) => {
    if (/\[PAPER REVIEW\]/.test(pt) && rid === 'r-1') return { paperReview: { reviewed: 'r-1', points: ['仍然自审'] } }
    return paperReply({})(pt, rid, fu)
  }, (s) => s.paper && s.paper.status === 'done', { maxMs: 90000 })
  const meta = readJsonIf(join(dir, 'paper.meta.json')) || {}
  assert(st2.paper.status === 'done' && /超时未回应|互审/.test(meta.warning || ''), '★ after the deadline the incomplete review is recorded as a warning, never silently dropped')
  assert(/\[未决\]|互审超时/.test(readIf(join(dir, 'paper.md')) + readIf(join(dir, 'paper.log.md'))), '★ the incomplete review is visible in the artifacts')
  await finish(m)
}

// =====================================================================================
section('8 dissent: bounded iteration, then the appendix records it and a warning is raised')
{
  const m = makeCtx(); await newPlugin(m)
  await startRun(m, 'dissent-test')
  COMPILER.mode = 'none'
  const start = await m.cmd('paper lang=en format=md')
  assert(JSON.parse(start.text).ok === true, 'paper started for the dissent case')
  const st = await drive(m, paperReply({ dissent: ['r-1'] }), (s) => s.paper && s.paper.status === 'done', { maxMs: 90000 })
  const dir = join(m.WS, 'VibeMath', 'Projects', 'default', 'Paper', st.paper.id)
  const md = readIf(join(dir, 'paper.md')), meta = readJsonIf(join(dir, 'paper.meta.json')) || {}
  assert(st.paper.status === 'done' && (meta.dissent || []).indexOf('r-1') !== -1, '★ dissent did not block finalisation forever: the run iterated and then recorded the dissent (rounds=' + meta.rounds + '/' + meta.maxRounds + ')')
  assert(/附录：交付分歧|Appendix: deliverability dissent/.test(md), '★ the disagreement is written into the appendix (docs/final-paper.md §4.5)')
  assert(/迭代达到上限/.test(meta.warning || ''), '★ and the cap is warned about in meta.log')
  await finish(m)
}

// =====================================================================================
section('9 compile branches: fake compiler success / repaired / persistent failure / none')
{
  const m = makeCtx(); await newPlugin(m)
  await startRun(m, 'compile-ok')
  COMPILER.mode = 'ok'; COMPILER.engines = ['xelatex']
  const st = await closeRun(m)
  const dir = join(m.WS, 'VibeMath', 'Projects', 'default', 'Paper', st.paper.id)
  const meta = readJsonIf(join(dir, 'paper.meta.json')) || {}
  assert(existsSync(join(dir, 'paper.pdf')) && (meta.compile || {}).result === 'ok' && (meta.compile || {}).engine === 'xelatex',
    '★ fake compiler success: paper.pdf exists, meta.compile={result:ok, engine:xelatex}')
  const c0 = (meta.compile || {}).attempts || []
  assert(!!c0[0] && c0[0].stage === 'initial' && c0[0].engine === 'xelatex', 'the initial attempt is recorded')
  await finish(m)
}
{
  const m = makeCtx(); await newPlugin(m)
  await startRun(m, 'repair-path')
  COMPILER.mode = 'repair'; COMPILER.engines = ['xelatex']
  const start = await m.cmd('paper lang=en format=both')
  assert(JSON.parse(start.text).ok === true, 'paper started for the repair branch')
  const st = await drive(m, paperReply({}), (s) => s.paper && s.paper.status === 'done', { maxMs: 90000 })
  const dir = join(m.WS, 'VibeMath', 'Projects', 'default', 'Paper', st.paper.id)
  const meta = readJsonIf(join(dir, 'paper.meta.json')) || {}
  assert(existsSync(join(dir, 'paper.pdf')) && (meta.compile || {}).result === 'ok' && (meta.compile || {}).repaired === 'minimal-template',
    '★ a failing tex is REPAIRED by the one minimal-template retry, then compiles (repaired=' + ((meta.compile || {}).repaired || '') + ')')
  assert(((meta.compile || {}).attempts || []).some(a => a.stage === 'minimal-template' && a.ok), 'the repair attempt is recorded in meta')
  assert(/\\documentclass/.test(readIf(join(dir, 'paper.tex'))) && !/\\usepackage/.test(readIf(join(dir, 'paper.tex'))),
    'the on-disk tex is the minimal template that actually compiled')
  await finish(m)
}
{
  const m = makeCtx(); await newPlugin(m)
  await startRun(m, 'compile-degrade')
  COMPILER.mode = 'fail'; COMPILER.engines = ['xelatex', 'latexmk']
  const start = await m.cmd('paper lang=en format=both')
  const st = await drive(m, paperReply({}), (s) => s.paper && s.paper.status === 'done', { maxMs: 90000 })
  const dir = join(m.WS, 'VibeMath', 'Projects', 'default', 'Paper', st.paper.id)
  const meta = readJsonIf(join(dir, 'paper.meta.json')) || {}
  assert(st.paper.status === 'done' && !existsSync(join(dir, 'paper.pdf')) && existsSync(join(dir, 'paper.tex')) && existsSync(join(dir, 'paper.md')),
    '★ persistent compiler failure DEGRADES: tex+md kept, no pdf, finalisation NOT blocked')
  assert(meta.compile && meta.compile.result === 'failed' && /编译失败/.test(meta.compile.error || '') && /编译失败/.test(meta.warning || readIf(join(dir, 'paper.log.md'))),
    '★ meta records compile:failed and the failure is warned + reported')
  assert(((meta.compile || {}).attempts || []).length >= 2 && meta.compile.attempts.every(a => a.ok === false), 'every capped repair attempt is recorded')
  await finish(m)
}
{
  const m = makeCtx(); await newPlugin(m)
  await startRun(m, 'no-latex')
  COMPILER.mode = 'none'; COMPILER.engines = []
  const start = await m.cmd('paper lang=zh format=both')
  const st = await drive(m, paperReply({}), (s) => s.paper && s.paper.status === 'done', { maxMs: 90000 })
  const dir = join(m.WS, 'VibeMath', 'Projects', 'default', 'Paper', st.paper.id)
  const meta = readJsonIf(join(dir, 'paper.meta.json')) || {}
  assert(st.paper.status === 'done' && (meta.compile || {}).result === 'not-detected' && /未检测到 LaTeX/.test((meta.compile || {}).reason || ''),
    '★ no LaTeX engine: compile=not-detected, tex+md kept, NO error thrown')
  assert(existsSync(join(dir, 'paper.tex')) && existsSync(join(dir, 'paper.md')), 'tex+md are still produced on the no-LaTeX branch')
  await finish(m)
}
{
  const m = makeCtx(); await newPlugin(m)
  await startRun(m, 'no-compile', { paperCompilePdf: false })
  COMPILER.mode = 'ok'; COMPILER.engines = ['xelatex']   // an engine IS available — the knob must still win
  const start = await m.cmd('paper lang=en format=both')
  const st = await drive(m, paperReply({}), (s) => s.paper && s.paper.status === 'done', { maxMs: 90000 })
  const dir = join(m.WS, 'VibeMath', 'Projects', 'default', 'Paper', st.paper.id)
  const meta = readJsonIf(join(dir, 'paper.meta.json')) || {}
  assert((meta.compile || {}).result === 'skipped' && /paperCompilePdf=false/.test((meta.compile || {}).reason || '') && !existsSync(join(dir, 'paper.pdf')),
    '★ paperCompilePdf=false skips compilation even when a LaTeX engine is available')
  await finish(m)
}
{
  const m = makeCtx(); await newPlugin(m)
  await startRun(m, 'no-compile')
  COMPILER.mode = 'none'
  const start = await m.cmd('paper lang=en format=md')
  const st = await drive(m, paperReply({}), (s) => s.paper && s.paper.status === 'done', { maxMs: 90000 })
  const dir = join(m.WS, 'VibeMath', 'Projects', 'default', 'Paper', st.paper.id)
  const meta = readJsonIf(join(dir, 'paper.meta.json')) || {}
  assert((meta.compile || {}).result === 'skipped' && /paperFormat=md/.test((meta.compile || {}).reason || ''),
    '★ format=md skips compilation without a "cannot compile without tex" warning (v2 §E)')
  await finish(m)
}
{
  const m = makeCtx(); await newPlugin(m)
  await startRun(m, 'existing-pdf')
  COMPILER.mode = 'ok'; COMPILER.engines = ['xelatex']
  const st = await closeRun(m)
  const dir = join(m.WS, 'VibeMath', 'Projects', 'default', 'Paper', st.paper.id)
  // The directory may legitimately not exist (a missing/failed paper phase): create it so the probe's
  // own write cannot abort the suite with an uncaught ENOENT — the assertion below must be the
  // failure, not a crash (AUDIT-CHECKLIST §4: a missing artifact is one clean assertion failure).
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'paper.pdf'), 'PRE-EXISTING')
  const again = await m.cmd('paper')
  assert(JSON.parse(again.text).idempotent === true && readIf(join(dir, 'paper.pdf')) === 'PRE-EXISTING',
    '★ an existing paper.pdf is never clobbered (docs/final-paper.md §D)')
  await finish(m)
}

// =====================================================================================
section('10 containment: a hostile problem id stays inside Paper/<id>/')
{
  const m = makeCtx(); await newPlugin(m)
  await startRun(m, '../../etc/evil:name')
  COMPILER.mode = 'none'
  const start = await m.cmd('paper')
  const st = await drive(m, paperReply({}), (s) => s.paper && s.paper.status === 'done', { maxMs: 90000 })
  const id = st.paper.id
  assert(id.indexOf('..') === -1 && id.indexOf('/') === -1 && id.indexOf('\\') === -1 && id.indexOf(':') === -1,
    '★ the paper id is normalised (no separators / no traversal): ' + id)
  const paperDir = join(m.WS, 'VibeMath', 'Projects', 'default', 'Paper', id)
  assert(existsSync(join(paperDir, 'paper.meta.json')), 'everything landed under Paper/<id>/')
  const stray = join(m.WS, 'VibeMath', 'etc')
  assert(!existsSync(stray), '★ no file escaped the Paper/ directory')
  const stateDir = join(m.WS, 'VibeMath', 'Projects', 'default', 'State')
  const before = (existsSync(stateDir) ? readdirSync(stateDir) : []).sort().join(',')
  assert(before.indexOf('paper') === -1, '★ State/ is not polluted by paper artifacts')
  await finish(m)
}

console.log('')
console.log('passed=' + passed + ' failed=' + failed)
if (failed) { console.error('FAILURES:'); for (const f of failures) console.error('  - ' + f) }
if (failed) process.exit(1)
console.log('ALL GREEN')
process.exit(0)

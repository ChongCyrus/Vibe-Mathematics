// ============================================================
// V2 LEAN FORMAL VERIFICATION SUITE  (docs/formal-verification.md)
//
// Asserts the whole contract of the v2 `formalVerify` knob:
//   · 'off'       is a TRUE no-op: no Lean text in ANY prompt it builds, no formal record,
//                 no gate — while the three tools stay registered (registration is static)
//   · 'encourage' injects the Lean section into BOTH the review and the debate prompt and the
//                 "顺手形式化" line into the solver/explorer prompts, and — the actual point of
//                 the feature — turns the review into a FIDELITY check once a Lean run passed
//   · 'require'   withholds a true/false verdict (未定论 + Formal/TODO.md + announcement) until
//                 the object is Lean-passed or carries an explicit, reasoned blocker; then the
//                 same verdict DOES write the card, and the card records the formal status
//   · the three tools (run / archive / lib) write the right things to the right paths
//
// The Lean toolchain is mocked through the subprocess SERVICE (a fake Lean: exit 0 unless the
// file still contains `sorry` or the marker `-- FAIL`), so these tests exercise the REAL code
// path (resolveExecutable → spawn → collected stdout → exit code) without Lean installed.
//
// The plugin path honours V2_PLUGIN so a sensitivity probe can point this suite at a mutated
// copy of the plugin (a suite that ignored the override would make every probe vacuous —
// AUDIT-CHECKLIST §2.5).
//
// Run: node formal-verify-v2.test.mjs
// ============================================================
import { mkdtempSync, rmSync, existsSync, readFileSync, readdirSync, writeFileSync, statSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname, isAbsolute } from 'node:path'

const PLUGIN = process.env.V2_PLUGIN
  ? new URL('file:///' + String(process.env.V2_PLUGIN).replace(/\\/g, '/'))
  : new URL('./vibe-math-v2/vibe-math-v2.js', import.meta.url)

let passed = 0, failed = 0
const failures = []
const assert = (c, m) => { if (c) { passed++; console.log('  ok - ' + m) } else { failed++; failures.push(m); console.error('  FAIL - ' + m) } }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const section = (t) => console.log('\n[' + t + ']')

// ---------------------------------------------------------------
// the fake Lean toolchain (mocked at the SERVICE boundary)
// ---------------------------------------------------------------
let toolchainAvailable = true
const leanRuns = []
const subprocess = {
  async resolveExecutable(cmd) {
    if (!toolchainAvailable) throw new Error('spawn lean ENOENT')
    if (String(cmd) !== 'lean') throw new Error('unknown executable ' + cmd)
    return 'lean'
  },
  spawn(spec) {
    const last = spec.argv[spec.argv.length - 1]
    const script = String(last || '')
    // v2 creates its directory tree through this SAME subprocess service
    // (`powershell … New-Item -Force -ItemType Directory -Path 'a','b'`). Without honouring
    // it, the Formal/ and Verified/Lean/ assertions would be vacuous: they would fail for the
    // wrong reason (a mocked no-op) instead of a real defect.
    if (/New-Item/.test(script)) {
      const m = /-Path\s+(.+?)\s*(\||$)/.exec(script)
      if (m) m[1].split(',').forEach((p) => { const q = p.trim().replace(/^'|'$/g, '').replace(/''/g, "'"); if (q) mkdirSync(q, { recursive: true }) })
      return { done: Promise.resolve({ exitCode: 0 }), collected: {}, terminate() {} }
    }
    if (/mkdir -p /.test(script)) {
      const m = /mkdir -p (.+)$/.exec(script)
      if (m) m[1].split(/\s+/).forEach((p) => { const q = p.trim().replace(/^'|'$/g, ''); if (q) mkdirSync(q, { recursive: true }) })
      return { done: Promise.resolve({ exitCode: 0 }), collected: {}, terminate() {} }
    }
    const text = existsSync(last) ? readFileSync(last, 'utf8') : ''
    const bad = /sorry|-- FAIL/.test(text)
    leanRuns.push({ argv: spec.argv.slice(0, -1), file: last, cwd: spec.cwd, graceMs: spec.graceMs, stdio: spec.stdio })
    const stdout = bad ? '' : 'ok\n'
    const stderr = bad ? 'error: declaration uses sorry\n' : ''
    return {
      done: Promise.resolve({ exitCode: bad ? 1 : 0, signal: null }),
      collected: {
        stdout: { readFrom: () => ({ text: stdout, nextOffset: stdout.length, lossy: false }) },
        stderr: { readFrom: () => ({ text: stderr, nextOffset: stderr.length, lossy: false }) },
      },
      terminate() {},
    }
  },
}

// ---------------------------------------------------------------
// mock host (v2 standing-mount shape: one plugin instance, many sessions)
// ---------------------------------------------------------------
function makeHost(WS, opts = {}) {
  const listeners = {}
  const toolRegs = []
  const cmdRegs = []
  const spawns = []
  const followups = []
  const interrupts = []
  const ctx = {
    get(name) {
      if (name === 'subprocess') return opts.noSubprocess ? undefined : subprocess
      if (name === 'sandboxPolicy') return { workspaceRoot: WS, resolve: () => ({ workspaceRoot: WS }) }
      return undefined
    },
    on(event, fn) { (listeners[event] = listeners[event] || []).push(fn) },
    effect(fn) { const d = fn(); return () => { if (typeof d === 'function') d() } },
    logger: { info() {}, warn() {}, error() {} },
    tools: { register(spec) { toolRegs.push(spec); return () => {} } },
    commands: { register(spec) { cmdRegs.push(spec); return () => {} } },
    timeout(cb, ms) { const h = setTimeout(cb, ms); return () => clearTimeout(h) },
    subagents: {
      list() { return ['spawn'] },
      async startContinuable({ label, request }) {
        const childId = 'child-' + (spawns.length + 1) + '-' + Math.random().toString(36).slice(2, 6)
        spawns.push({ label, childId, rootId: (request && request.parent && request.parent.id) || 'root', prompt: request && request.prompt && request.prompt[0] && request.prompt[0].text })
        return { childId }
      },
      async followup(parent, childId, blocks) { followups.push({ childId, prompt: (blocks && blocks[0] && blocks[0].text) || '' }) },
      async sendMessage(parent, childId, blocks) { followups.push({ childId, prompt: (blocks && blocks[0] && blocks[0].text) || '' }) },
      interrupt(childId) { interrupts.push(childId) },
    },
    agents: { roots() { return [] }, get() { return undefined } },
    fs: {
      async resolve(rel, o) {
        const raw = String(rel)
        const p = isAbsolute(raw) ? raw : join((o && o.cwd) || WS, ...raw.split('/'))
        return p.replace(/\\/g, '/')
      },
      async stat(t) { if (!existsSync(t)) return undefined; return { type: statSync(t).isDirectory() ? 'directory' : 'file' } },
      async readText(t) { return readFileSync(t, 'utf8') },
      async writeText(t, c) { mkdirSync(dirname(t), { recursive: true }); writeFileSync(t, c, 'utf8') },
      async listDir(t) { if (!existsSync(t)) return []; return readdirSync(t, { withFileTypes: true }).map((e) => ({ name: e.name, type: e.isDirectory() ? 'directory' : 'file' })) },
    },
  }
  const fireEnd = (info) => { for (const h of (listeners['subagent/end'] || [])) h(info) }
  return { ctx, toolRegs, cmdRegs, spawns, followups, interrupts, fireEnd, WS }
}

function makeRoot(id, WS) {
  return { id, options: { provider: 'mock', model: 'mock' }, session: { id, header: { cwd: WS, parentSession: undefined } }, followup() {} }
}

const hosts = []
/**
 * Build an INDEPENDENT plugin instance + workspace for one test case.
 * AUDIT-CHECKLIST §2.3: cases must not share a session root/workspace, or a leftover
 * heartbeat/verification from one case pollutes the next.
 */
async function makeCase(label, opts = {}) {
  const WS = mkdtempSync(join(tmpdir(), 'vibe-v2-lean-' + label + '-'))
  const h = makeHost(WS, opts)
  const mod = await import(PLUGIN.href + '?t=' + Date.now() + '-' + Math.random().toString(36).slice(2, 8))
  ;(mod.default || mod).apply(h.ctx)
  const root = makeRoot('sess-' + label, WS)
  const call = async (name, args, agent) => {
    const spec = h.toolRegs.find((s) => s.name === name)
    if (!spec) throw new Error('no tool ' + name)
    return JSON.parse(await spec.execute(args || {}, { agent: agent || root }))
  }
  await call('vibe_math_new_project', { name: 'proj' })
  // 200ms is the sanitizer floor; verifierCount=2 (the sanitizer floor too) keeps each
  // verification exactly two children, so a round settles predictably.
  await call('vibe_math_set_params', { tickIntervalMs: 200, verifierCount: 2 })
  const c = Object.assign(h, { WS, root, call, label })
  hosts.push(c)
  return c
}
// The scheduler only picks objects up while it is RUNNING (scheduleTick early-returns).
async function startScheduler(h) { await h.call('vibe_math_start', {}) }

const projRoot = (h) => join(h.WS, 'VibeMath', 'Projects', 'proj')
const vibeRoot = (h) => join(h.WS, 'VibeMath')
const readIf = (p) => (existsSync(p) ? readFileSync(p, 'utf8') : '')
const formalStateOf = (h) => JSON.parse(readIf(join(projRoot(h), 'VibeMath_State', 'formal.json')) || '{}')
// One scheduler pass. v2's timer polls at 1s and ticks when tickDue() (200ms) — so one
// wall-clock second advances roughly one tick, exactly like the other v2 suites assume.
const tick = (ms = 1200) => sleep(ms)
async function waitFor(pred, tries = 40, ms = 120) {
  for (let i = 0; i < tries; i++) { const v = pred(); if (v) return v; await sleep(ms) }
  return undefined
}
const verifiersOf = (h, rKind, exclude) => h.spawns.filter((s) => s.label.startsWith('verifier:' + rKind) && !(exclude || []).some((o) => o.childId === s.childId))
const fireVerdicts = (h, kids, vale) => {
  for (let i = 0; i < kids.length; i++) {
    h.fireEnd({ id: kids[i].childId, runId: 'v' + i, provider: 'spawn', local: true, stopReason: 'completed', lastAssistantMessage: [{ type: 'text', text: '```json\n' + JSON.stringify({ Result: vale, Reason: 'review ' + i }) + '\n```' }] })
  }
}
/**
 * Verify one object and DRIVE IT TO A SETTLEMENT.
 *
 * Important: v2's `processVerify` starts at most ONE verification and skips every candidate
 * while a task is live, so leaving an object mid-debate would silently block the NEXT case's
 * verification. The first `firstRounds` rounds are answered with `vale` (a non-unanimous value
 * forces a real debate round, which is exactly what the debate-prompt assertions need), and any
 * later round is answered with `settle` so the object actually closes.
 */
async function verifyWithDebate(h, rKind, vale, firstRounds = 1, settle = 1) {
  // v2 re-wakes the SAME verifier children for every debate round (it does not spawn new
  // ones), so a new round is detected by counting the followups written to those children.
  const kids = new Set()
  for (let i = 0; i < 16; i++) {
    // The scheduler may need a whole pass before it notices the object and another before it
    // fills the verifier quota, so each wait must span several timer ticks.
    const cand = await waitFor(() => {
      const x = verifiersOf(h, rKind)
      return x.length >= 2 ? x : undefined
    }, 40, 250)
    if (!cand) break
    cand.forEach((s) => kids.add(s.childId))
    const rounds = 1 + h.followups.filter((f) => kids.has(f.childId)).length
    // `fireEnd` is a NO-OP for a child with no in-flight turn, so answering the whole current
    // verifier set each pass is safe; the extra answers land before the next round's wakes.
    fireVerdicts(h, cand, rounds <= firstRounds ? vale : settle)
    await sleep(200)
    await tick(1100)
  }
  const rounds = 1 + h.followups.filter((f) => kids.has(f.childId)).length
  return { first: h.spawns.filter((s) => s.label.startsWith('verifier:' + rKind)), rounds: kids.size ? rounds : 0 }
}

// ===============================================================
console.log('-- V2 Lean formal verification --')

// ---------- 1. 'off' is a true no-op ----------
section("1 'off' (default) is a true no-op")
{
  const h = await makeCase('off')
  const st = await h.call('vibe_math_status', {})
  assert(st.params.formalVerify === 'off', "the default mode is 'off' (got " + st.params.formalVerify + ')')
  assert(st.formal.mode === 'off' && st.formal.required === false, 'status exposes the formal mode and gate flag')
  assert(st.params.leanCommand === 'lean' && Array.isArray(st.params.leanArgs), 'the Lean knobs are readable in status.params')
  assert(st.params.leanTimeoutMs === 120000, 'leanTimeoutMs defaults to 120000 (got ' + st.params.leanTimeoutMs + ')')
  assert(!!h.toolRegs.find((t) => t.name === 'vibe_math_lean_run') && !!h.toolRegs.find((t) => t.name === 'vibe_math_lean_archive') && !!h.toolRegs.find((t) => t.name === 'vibe_math_lean_lib'),
    'the three Lean tools are registered in every mode (registration is static)')
  assert(existsSync(join(vibeRoot(h), 'Formal', 'Lib')) && existsSync(join(vibeRoot(h), 'Formal', 'Proved')), 'the GLOBAL Formal/Lib + Formal/Proved dirs are created outside the project')
  assert(existsSync(join(projRoot(h), 'Formal')) && existsSync(join(projRoot(h), 'Verified', 'Lean')), 'the project Formal/ and Verified/Lean/ dirs are created')
  await h.call('vibe_math_add_problem', { id: 'q1', description: 'off 模式无操作测试' })
  await startScheduler(h)
  await tick(2000)
  const ex = await waitFor(() => h.spawns.find((s) => s.label.startsWith('explorer:q1')), 60, 200)
  assert(!!ex, 'the explorer was spawned (the scheduler really is running)')
  assert(!!ex && !/Lean|形式化/.test(ex.prompt || ''), 'the explorer prompt contains no Lean/形式化 text in off mode')
  if (ex) h.fireEnd({ id: ex.childId, runId: 'r1', provider: 'spawn', local: true, stopReason: 'completed', lastAssistantMessage: [{ type: 'text', text: '```json\n{"directions":[{"id":"d1","title":"D","method":"m","core_assumption":"c","feasibility":0.6}]}\n```' }] })
  await sleep(300)
  const so = await waitFor(() => h.spawns.find((s) => s.label.startsWith('solver:q1')), 40, 200)
  assert(!!so, 'the solver was spawned after the explorer returned directions')
  assert(!!so && !/Lean|形式化/.test(so.prompt || ''), 'the solver prompt contains no Lean/形式化 text in off mode')
  if (so) h.fireEnd({ id: so.childId, runId: 'r2', provider: 'spawn', local: true, stopReason: 'completed', lastAssistantMessage: [{ type: 'text', text: '```json\n{"status":"success","solution":"complete solution","solution_probability":0.8,"lemmas":[],"routes":[],"lessons":[],"survival_probability":0.9,"dead_end_reason":null,"sub_questions":[]}\n```' }] })
  const vs = await verifyWithDebate(h, 'r-q1-s0', 1)
  assert(!!vs.first && vs.first.length >= 2, 'verifiers were spawned for the solution (' + (vs.first ? vs.first.length : 0) + ')')
  const vp = vs.first ? (h.spawns.find((s) => s.label === 'verifier:r-q1-s0:0').prompt || '') : ''
  assert(!/Lean|形式化/.test(vp), 'the review prompt contains no Lean/形式化 text in off mode')
  const debateText = h.followups.map((f) => f.prompt || '').join('\n')
  assert(!/Lean|形式化/.test(debateText), 'no debate/followup prompt mentions Lean in off mode')
  const qs = JSON.parse(readIf(join(projRoot(h), 'qs', 'qs.json')) || '[]')
  const q = qs.find((x) => x.id === 'q1')
  assert(!!q && q.已解决 === true, "'off' still finalizes: the problem is marked solved with NO Lean artifact")
  assert(!!q && q.解法列表 && q.解法列表[0].正确概率 === 1, 'the solution probability is 1 in off mode')
  assert(existsSync(join(projRoot(h), 'Verified', '问题_Verified.json')), 'the Verified card was written in off mode')
  assert(!/形式化/.test(readIf(join(projRoot(h), 'Verified', '问题_Verified.json'))), 'the card carries no formal line in off mode')
  assert(!existsSync(join(projRoot(h), 'Formal', 'TODO.md')), 'no Formal/TODO.md is produced in off mode')
  const fs0 = formalStateOf(h)
  assert(!fs0.records || Object.keys(fs0.records).length === 0, 'off mode records no formal object state')
}

// ---------- 2. parameter validation + runtime switching ----------
section('2 parameter validation and runtime switching')
{
  const h = await makeCase('params')
  const bad = await h.call('vibe_math_set_params', { formalVerify: 'banana' })
  assert(bad.params.formalVerify === 'off', "an unknown mode degrades to 'off', never to a stronger mode (got " + bad.params.formalVerify + ')')
  const enc = await h.call('vibe_math_set_params', { formalVerify: 'encourage' })
  assert(enc.params.formalVerify === 'encourage', "'encourage' is accepted")
  const req = await h.call('vibe_math_set_params', { formalVerify: 'require', leanTimeoutMs: -5, leanCommand: '   ' })
  assert(req.params.formalVerify === 'require', "'require' is accepted")
  assert(req.params.leanTimeoutMs === 120000, 'a non-positive leanTimeoutMs falls back to the default (' + req.params.leanTimeoutMs + ')')
  assert(req.params.leanCommand === 'lean', 'a blank leanCommand falls back to "lean"')
  const lake = await h.call('vibe_math_set_params', { leanCommand: 'lake', leanArgs: ['env', 'lean'] })
  assert(lake.params.leanCommand === 'lake' && lake.params.leanArgs.join(' ') === 'env lean', 'leanCommand/leanArgs are settable (lake env lean)')
  const st = await h.call('vibe_math_status', {})
  assert(st.formal.leanCommand === 'lake' && st.formal.leanArgs.join(' ') === 'env lean', 'the Lean knobs round-trip through status')
  const setup = await h.call('vibe_math_setup', {})
  const names = setup.parameters.map((p) => p.name)
  assert(['formalVerify', 'leanCommand', 'leanArgs', 'leanTimeoutMs'].every((n) => names.indexOf(n) !== -1), 'vibe_math_setup schema lists all four Lean knobs')
  const fv = setup.parameters.find((p) => p.name === 'formalVerify')
  assert(!!fv && fv.current === 'require' && fv.default === 'off', 'the schema reports the current and default formalVerify')
  const tpl = await h.call('vibe_math_template', { where: 'global' })
  const tplText = readIf(tpl.path)
  assert(/formalVerify/.test(tplText) && /leanCommand/.test(tplText) && /leanTimeoutMs/.test(tplText), 'the settings template documents the Lean knobs')
  assert(/leanArgs/.test(tplText), 'the settings template also documents leanArgs')
  assert(!/:\s*undefined/.test(tplText), 'the template has no bare undefined token (settings round-trip safety)')
  const saved = await h.call('vibe_math_save_settings', {})
  assert(saved.ok === true, 'save_settings still round-trips with the new knobs')
  await h.call('vibe_math_set_params', { formalVerify: 'encourage' })
  await h.call('vibe_math_add_problem', { id: 'q2', description: '模式切换测试' })
  await startScheduler(h)
  await tick(2000)
  const ex = await waitFor(() => h.spawns.find((s) => s.label.startsWith('explorer:q2')), 60, 200)
  assert(!!ex && /【顺手形式化（鼓励）】/.test(ex.prompt || ''), '★ switching to encourage changes the NEXT prompt immediately')
  if (ex) h.fireEnd({ id: ex.childId, runId: 'r', provider: 'spawn', local: true, stopReason: 'completed', lastAssistantMessage: [{ type: 'text', text: '```json\n{"directions":[{"id":"d1","title":"D","method":"m","core_assumption":"c","feasibility":0.5}]}\n```' }] })
  await h.call('vibe_math_set_params', { formalVerify: 'off' })
  await sleep(400)
  const so = await waitFor(() => h.spawns.find((s) => s.label.startsWith('solver:q2')), 40, 200)
  assert(!!so, 'the solver was spawned after the mode was switched back to off')
  assert(!!so && !/形式化|Lean/.test(so.prompt || ''), '★ switching back to off removes the Lean text from the next prompt')
}

// ---------- 3. 'encourage' injection ----------
section("3 'encourage' injects the Lean section into review AND debate prompts")
{
  const h = await makeCase('enc')
  await h.call('vibe_math_set_params', { formalVerify: 'encourage', maxParallelThreshold: 8 })
  // Keep the scheduler alive: v2 STOPS itself when there is no unsolved problem, no agent and
  // no task, and a stopped scheduler never starts a verification (nor spawns an explorer).
  await h.call('vibe_math_add_problem', { id: 'qKeep', description: '保持调度器运行的占位问题', priority: 9 })
  await startScheduler(h)
  await h.call('vibe_math_add_proposition', { id: 'pEnc', 概述: '鼓励模式下的忠实性审查', 布尔估计: 0.5, 优先级: 1, '价值/关键性': 0.5, 细类型: { 数论: {} } })
  const vs = await verifyWithDebate(h, 'r-pEnc', 0.5, 1) // 0.5 -> no consensus -> a REAL debate round
  assert(!!vs.first, 'verifiers spawned for the bare proposition')
  assert(vs.rounds >= 2, 'the object really went through a debate round (' + vs.rounds + ' rounds)')
  const review = h.spawns.find((s) => s.label === 'verifier:r-pEnc:0')
  assert(!!review, 'the first review prompt was captured')
  const reviewText = review ? review.prompt : ''
  assert(/【Lean 形式化验证（鼓励模式）】/.test(reviewText), '★ the REVIEW prompt carries the Lean section')
  assert(/一旦 Lean 通过，你唯一需要确认的就是忠实性/.test(reviewText), 'the review prompt states that a passing Lean run shrinks the question to fidelity')
  assert(/实现难度/.test(reviewText), 'the review prompt asks for the implementation-difficulty judgement')
  assert(/可以不做，但请在回执的 formal 字段写明难度判断/.test(reviewText), "'encourage' explicitly allows skipping (with a recorded judgement)")
  assert(/vibe_math_lean_run（执行）· vibe_math_lean_archive（归档）· vibe_math_lean_lib（查已有可复用库）/.test(reviewText), 'the review prompt names the three v2 tools')
  const debate = h.followups.map((f) => f.prompt || '').filter((p) => /DEBATE/.test(p)).join('\n')
  assert(/DEBATE/.test(debate), 'the debate round actually happened (a followup with the debate prompt was issued)')
  assert(/【Lean 形式化验证（鼓励模式）】/.test(debate), '★ the DEBATE prompt carries the Lean section too')
  assert(/一旦 Lean 通过，你唯一需要确认的就是忠实性/.test(debate), 'the debate prompt states the fidelity shift')
  await h.call('vibe_math_add_problem', { id: 'qW', description: '顺手形式化测试' })
  await tick(2000)
  const ex = await waitFor(() => h.spawns.find((s) => s.label.startsWith('explorer:qW')), 60, 200)
  assert(!!ex && /【顺手形式化（鼓励）】/.test(ex.prompt || ''), '★ the explorer work prompt carries the 顺手形式化 line')
  assert(!!ex && /vibe_math_lean_archive kind='def'/.test(ex.prompt || ''), 'the work line points at the archive tool for reusable definitions')
  assert(!!ex && /vibe_math_lean_lib 查重/.test(ex.prompt || ''), 'the work line tells members to check the reuse library first')
  const offHost = await makeCase('enc-off')
  await offHost.call('vibe_math_add_problem', { id: 'qN', description: 'x' })
  await startScheduler(offHost)
  await tick(2000)
  const exN = await waitFor(() => offHost.spawns.find((s) => s.label.startsWith('explorer:qN')), 60, 200)
  assert(!!exN && !/形式化|Lean/.test(exN.prompt || ''), 'the same prompt in off mode is free of Lean text (injection is mode-computed, not frozen)')
}

// ---------- 4. the run tool ----------
section('4 lean_run executes through the subprocess service and reports honestly')
{
  const h = await makeCase('run')
  await h.call('vibe_math_set_params', { formalVerify: 'encourage' })
  const proj = projRoot(h)
  mkdirSync(join(proj, 'Formal'), { recursive: true })
  writeFileSync(join(proj, 'Formal', 'good.lean'), 'theorem t : 1 = 1 := rfl\n', 'utf8')
  writeFileSync(join(proj, 'Formal', 'bad.lean'), 'theorem t : 1 = 2 := by sorry\n', 'utf8')
  const before = leanRuns.length
  const runGood = await h.call('vibe_math_lean_run', { file: 'Formal/good.lean', target: 'pRun' })
  assert(runGood.ok === true && runGood.exitCode === 0, 'a file with no sorry runs green (' + JSON.stringify({ ok: runGood.ok, exitCode: runGood.exitCode }) + ')')
  assert(leanRuns.length > before, 'the run really went through the mocked subprocess service')
  const spec = leanRuns[leanRuns.length - 1]
  assert(spec.cwd.replace(/\\/g, '/') === proj.replace(/\\/g, '/'), 'the toolchain runs with the PROJECT root as cwd (got ' + spec.cwd + ')')
  assert(!!spec.stdio && spec.stdio.stdin === 'ignore' && spec.stdio.stdout.maxBytes === 64 * 1024 && spec.stdio.stderr.maxBytes === 64 * 1024, 'stdio is stdin=ignore with a 64KB output cap')
  assert(typeof spec.graceMs === 'number' && spec.graceMs >= 1000, 'the configured timeout is passed as graceMs (' + spec.graceMs + ')')
  assert(typeof runGood.command === 'string' && runGood.command.indexOf('good.lean') !== -1, 'the result reports the exact command line')
  const runBad = await h.call('vibe_math_lean_run', { file: 'Formal/bad.lean' })
  assert(runBad.ok === false && runBad.exitCode === 1, 'a file that still uses sorry reports a red run')
  assert(/sorry/.test(runBad.stderr), 'the compiler output is returned verbatim (' + JSON.stringify(runBad.stderr).slice(0, 60) + ')')
  assert(/修复后重跑/.test(runBad.hint || ''), 'a red run tells the member to fix and rerun')
  const runMissing = await h.call('vibe_math_lean_run', { file: 'Formal/nope.lean' })
  assert(runMissing.ok === false && runMissing.code === 'V2_NOT_FOUND', 'a missing file is refused with a typed code (' + runMissing.code + ')')
  const runNoFile = await h.call('vibe_math_lean_run', {})
  assert(runNoFile.ok === false && runNoFile.code === 'V2_INVALID_ARGUMENT', 'a run without `file` is refused')
  // The guard's boundary is the VibeMath ROOT, not the project: the global reuse library
  // deliberately lives at <VibeMath>/Formal/{Lib,Proved}, so climbing out of the project but
  // staying inside VibeMath is legal (it just fails as a missing file).
  const runOutOfProject = await h.call('vibe_math_lean_run', { file: '../../Formal/Lib/x.lean' })
  assert(runOutOfProject.ok === false && runOutOfProject.code === 'V2_NOT_FOUND',
    'climbing out of the project but staying inside the VibeMath root is ALLOWED (got ' + runOutOfProject.code + ')')
  const runEscape = await h.call('vibe_math_lean_run', { file: '../../../../etc/evil.lean' })
  assert(runEscape.ok === false && runEscape.code === 'V2_INVALID_ARGUMENT', '★ a traversal that climbs ABOVE the VibeMath root is refused')
  const runEscape2 = await h.call('vibe_math_lean_run', { file: 'Formal/../../../../../evil.lean' })
  assert(runEscape2.ok === false && runEscape2.code === 'V2_INVALID_ARGUMENT', 'a deeper traversal is refused too')
  const runEscape3 = await h.call('vibe_math_lean_run', { file: '/etc/evil.lean' })
  assert(runEscape3.ok === false && runEscape3.code === 'V2_INVALID_ARGUMENT', 'an unrelated absolute path is refused')
  const runEscape4 = await h.call('vibe_math_lean_run', { file: 'C:/Windows/evil.lean' })
  assert(runEscape4.ok === false && runEscape4.code === 'V2_INVALID_ARGUMENT', 'an unrelated Windows absolute path is refused')
  const runNotLean = await h.call('vibe_math_lean_run', { file: 'Formal/good.txt' })
  assert(runNotLean.ok === false && runNotLean.code === 'V2_INVALID_ARGUMENT', 'only .lean files can be executed')
  assert(/VibeMath/.test(runEscape.message || ''), 'the refusal names the boundary it enforced')
  mkdirSync(join(vibeRoot(h), 'Formal', 'Lib'), { recursive: true })
  writeFileSync(join(vibeRoot(h), 'Formal', 'Lib', 'abs.lean'), 'def absTest := 1\n', 'utf8')
  const runAbs = await h.call('vibe_math_lean_run', { file: join(vibeRoot(h), 'Formal', 'Lib', 'abs.lean').replace(/\\/g, '/') })
  assert(runAbs.ok === true, 'an absolute path inside the VibeMath root is accepted')
  const rec = formalStateOf(h)
  assert(!!rec.records && !!rec.records.pRun && rec.records.pRun.status === 'attempted', 'a green lean_run records the object as attempted (stored, not promoted)')
  assert(!!rec.records.pRun.run && rec.records.pRun.run.ok === true && rec.records.pRun.run.exitCode === 0, 'the run record keeps ok/exitCode')
  assert(rec.records.pRun.run.stdoutTail !== undefined && rec.records.pRun.run.stderrTail !== undefined, 'the run record keeps truncated output tails')
  toolchainAvailable = false
  const runNoTc = await h.call('vibe_math_lean_run', { file: 'Formal/good.lean' })
  assert(runNoTc.ok === false && runNoTc.code === 'LEAN_NOT_FOUND', 'a missing toolchain returns LEAN_NOT_FOUND instead of crashing')
  assert(/仍可把形式化代码写下来归档/.test(runNoTc.message), 'the failure explains the graceful degradation')
  toolchainAvailable = true
  const noSub = await makeCase('nosub', { noSubprocess: true })
  mkdirSync(join(projRoot(noSub), 'Formal'), { recursive: true })
  writeFileSync(join(projRoot(noSub), 'Formal', 'x.lean'), 'theorem x : 1 = 1 := rfl\n', 'utf8')
  const noSubRun = await noSub.call('vibe_math_lean_run', { file: 'Formal/x.lean' })
  assert(noSubRun.ok === false && noSubRun.code === 'NO_SUBPROCESS', 'a host without the subprocess service returns NO_SUBPROCESS and does not crash (got ' + noSubRun.code + ')')
  const noSubStatus = await noSub.call('vibe_math_status', {})
  assert(noSubStatus.ok === true, 'the scheduler still answers status after that (nothing was thrown into the loop)')
}

// ---------- 5. archive: def / lemma / proof / blocked ----------
section('5 lean_archive writes the contract paths and indexes')
{
  const h = await makeCase('arc')
  await h.call('vibe_math_set_params', { formalVerify: 'encourage' })
  const proj = projRoot(h)
  const libPath = join(vibeRoot(h), 'Formal', 'Lib')
  const provedPath = join(vibeRoot(h), 'Formal', 'Proved')
  const defRes = await h.call('vibe_math_lean_archive', { kind: 'def', name: 'ZMod5', content: 'def ZMod5 := Fin 5\n' })
  assert(defRes.ok === true && defRes.file === 'Formal/Lib/ZMod5.lean', 'a reusable definition is archived to the global lib (' + defRes.file + ')')
  assert(existsSync(join(libPath, 'ZMod5.lean')), '★ the definition exists under <VibeMath>/Formal/Lib/ (cross-project, NOT inside the project)')
  assert(!existsSync(join(proj, 'Formal', 'Lib', 'ZMod5.lean')), 'it is NOT duplicated inside the project tree')
  assert(!!defRes.run && defRes.run.ok === true, 'the archived definition was executed (kind=def runs by default)')
  const lemmaRes = await h.call('vibe_math_lean_archive', { kind: 'lemma', name: 'sq_odd', content: 'theorem sq_odd (n : Nat) : Odd (n*n) → Odd n := by omega\n' })
  assert(lemmaRes.ok === true && lemmaRes.file === 'Formal/Proved/sq_odd.lean', 'a lemma is archived to the global Proved/ (' + lemmaRes.file + ')')
  assert(existsSync(join(provedPath, 'sq_odd.lean')), 'the lemma exists under <VibeMath>/Formal/Proved/')
  const defNoRun = await h.call('vibe_math_lean_archive', { kind: 'def', name: 'quiet', content: 'def quiet := 2\n', run: false })
  assert(defNoRun.ok === true && defNoRun.run === undefined, 'run:false archives without executing (still indexed)')
  assert(/ZMod5/.test(readIf(join(libPath, 'Index.md'))), 'Lib/Index.md lists the new definition')
  assert(/quiet/.test(readIf(join(libPath, 'Index.md'))), 'Lib/Index.md lists the run:false definition too')
  assert(/sq_odd/.test(readIf(join(provedPath, 'Index.md'))), 'Proved/Index.md lists the new lemma')
  writeFileSync(join(proj, 'Formal', 'src.lean'), 'def copied := 3\n', 'utf8')
  const defFrom = await h.call('vibe_math_lean_archive', { kind: 'def', name: 'copied', from: 'Formal/src.lean' })
  assert(defFrom.ok === true && existsSync(join(libPath, 'copied.lean')), 'kind=def can archive from an existing .lean file')
  const fromOutside = await h.call('vibe_math_lean_archive', { kind: 'def', name: 'escape', from: '../../../../etc/passwd' })
  assert(fromOutside.ok === false && fromOutside.code === 'V2_INVALID_ARGUMENT', 'from=<path outside the VibeMath root> is refused')
  const noName = await h.call('vibe_math_lean_archive', { kind: 'def', content: 'def x := 1\n' })
  assert(noName.ok === false && noName.code === 'V2_INVALID_ARGUMENT', 'archiving a definition without a name is refused')
  const noBody = await h.call('vibe_math_lean_archive', { kind: 'lemma', name: 'xb' })
  assert(noBody.ok === false && noBody.code === 'V2_INVALID_ARGUMENT', 'archiving a lemma with neither content nor from is refused')
  const badKind = await h.call('vibe_math_lean_archive', { kind: 'nonsense' })
  assert(badKind.ok === false && badKind.code === 'V2_INVALID_ARGUMENT', 'an unknown archive kind is refused')
  const noTarget = await h.call('vibe_math_lean_archive', { kind: 'proof', content: 'theorem x : 1 = 1 := rfl\n' })
  assert(noTarget.ok === false && noTarget.code === 'V2_INVALID_ARGUMENT', 'kind=proof without a target is refused')
  const proof = await h.call('vibe_math_lean_archive', { kind: 'proof', target: 'pProof', content: 'theorem p_proof : 3 * 1 ^ 2 - 2 = (1:Nat) ^ 2 := by decide\n' })
  assert(proof.ok === true && proof.passed === true, 'a passing proof is archived (' + JSON.stringify({ ok: proof.ok, passed: proof.passed }) + ')')
  assert(proof.file === 'Formal/pProof.lean', 'the working file is Formal/<target>.lean')
  assert(proof.proof === 'Verified/Lean/pProof.lean', 'the archived proof path is Verified/Lean/<target>.lean')
  assert(existsSync(join(proj, 'Formal', 'pProof.lean')), 'the working file exists on disk')
  assert(existsSync(join(proj, 'Verified', 'Lean', 'pProof.lean')), '★ the proof is archived under Verified/Lean/')
  assert(proof.status === 'passed', 'the object status becomes passed')
  const proofBad = await h.call('vibe_math_lean_archive', { kind: 'proof', target: 'pRed', content: 'theorem p_red : 1 = 2 := by sorry\n' })
  assert(proofBad.ok === true && proofBad.passed === false && proofBad.status === 'attempted', 'a red proof is recorded as attempted (not passed)')
  assert(!existsSync(join(proj, 'Verified', 'Lean', 'pRed.lean')), 'a red proof is NOT archived under Verified/Lean/')
  assert(/sorry/.test((proofBad.run && proofBad.run.stderr) || ''), 'the red run keeps the compiler output for the member to fix')
  const st = await h.call('vibe_math_status', {})
  assert(st.formal.objects.some((o) => o.target === 'pProof' && o.status === 'passed'), 'status lists the passed object')
  const idx = readIf(join(proj, 'Formal', 'Index.md'))
  assert(/pProof/.test(idx) && /passed/.test(idx) && /Verified\/Lean\/pProof\.lean/.test(idx), 'Formal/Index.md indexes the object, its status and its archived proof')
  assert(/pRed/.test(idx) && /attempted/.test(idx), 'Formal/Index.md also records the failed attempt')
  const blkNoNote = await h.call('vibe_math_lean_archive', { kind: 'blocked', target: 'pBlk' })
  assert(blkNoNote.ok === false && blkNoNote.code === 'V2_INVALID_ARGUMENT', 'blocked without a note is refused')
  const blk = await h.call('vibe_math_lean_archive', { kind: 'blocked', target: 'pBlk', note: '需要外层解析数论框架，本轮工作量不可接受' })
  assert(blk.ok === true && blk.status === 'blocked', 'a reasoned blocker is recorded')
  assert(/需要外层解析数论框架/.test(readIf(join(proj, 'Formal', 'Index.md'))), 'the blocker reason reaches the index')
  const stBlk = await h.call('vibe_math_status', {})
  assert(stBlk.formal.objects.some((o) => o.target === 'pBlk' && o.status === 'blocked'), 'status lists the blocked object')
  const lib = await h.call('vibe_math_lean_lib', {})
  assert(lib.ok === true && lib.counts.lib >= 3 && lib.counts.proved >= 1, 'lean_lib reports the reuse library sizes (' + JSON.stringify(lib.counts) + ')')
  assert(lib.objects.some((o) => o.target === 'pProof' && o.status === 'passed'), 'lean_lib lists the per-object formal status')
  assert(/复用优先/.test(lib.hint || ''), 'lean_lib tells agents to reuse before redefining')
  assert(lib.mode === 'encourage', 'lean_lib reports the active mode')
  const noRefresh = await h.call('vibe_math_lean_lib', { refresh: false })
  assert(noRefresh.rebuilt === false && noRefresh.counts.lib === null, 'refresh:false lists without rebuilding')
  assert(existsSync(join(proj, 'Formal', 'Index.md')), 'the project Formal/Index.md exists')
  assert(existsSync(join(libPath, 'Index.md')) && existsSync(join(provedPath, 'Index.md')), 'the two GLOBAL indexes exist')
}

// ---------- 6. a passing proof flips the review to FIDELITY ----------
section('6 a passing proof flips the review subject to fidelity')
{
  const h = await makeCase('fid')
  await h.call('vibe_math_set_params', { formalVerify: 'encourage', maxParallelThreshold: 8 })
  // v2's scheduler STOPS itself when there is no unsolved problem, no agent and no task; a
  // case that only wants to verify a proposition therefore needs one live problem to keep
  // the tick loop alive (otherwise no verification would ever be started).
  await h.call('vibe_math_add_problem', { id: 'qKeep', description: '保持调度器运行的占位问题', priority: 9 })
  await startScheduler(h)
  await h.call('vibe_math_lean_archive', { kind: 'proof', target: 'r-pFid', content: 'theorem p_fid : 2 + 2 = 4 := by decide\n' })
  await h.call('vibe_math_add_proposition', { id: 'pFid', 概述: '2+2=4（已有 Lean 证明）', 布尔估计: 0.5, 优先级: 1, '价值/关键性': 0.5, 细类型: { 数论: {} } })
  // 0.5 in round 1 forces a debate round whose prompt must ALSO carry the fidelity wording
  const vs = await verifyWithDebate(h, 'r-pFid', 0.5, 1)
  assert(!!vs.first, 'a verifier was spawned for the Lean-passed object')
  const vp = h.spawns.find((s) => s.label === 'verifier:r-pFid:0')
  const vpText = vp ? vp.prompt : ''
  assert(/该对象已有\*\*通过的 Lean 形式化证明\*\*/.test(vpText), 'the review prompt announces the passing proof')
  assert(/你不需要重新检查推导/.test(vpText), '★ it tells reviewers NOT to re-derive')
  assert(/忠实性审查/.test(vpText), '★ it tells reviewers the review subject is now fidelity')
  assert(/定义 \/ 对象 \/ 条件 \/ 假设 \/ 结论是否与命题原文\*\*完全一致\*\*/.test(vpText), 'it enumerates exactly what fidelity means')
  assert(/Verified\/Lean\/r-pFid\.lean/.test(vpText), 'it points at the archived proof')
  assert(/把 Result 用在\*\*忠实性\*\*上/.test(vpText), 'the verdict guidance switches to fidelity')
  assert(!/请先判断该对象的\*\*实现难度\*\*/.test(vpText), 'the "judge the difficulty first" wording is gone when a proof already exists')
  const debate = h.followups.map((f) => f.prompt || '').filter((p) => /DEBATE/.test(p)).join('\n')
  assert(/你不需要重新检查推导/.test(debate), '★ the debate prompt for a Lean-passed object also asks for fidelity, not re-derivation')
  await h.call('vibe_math_lean_archive', { kind: 'blocked', target: 'r-pBlk2', note: '涉及未形式化的分析学前置' })
  await h.call('vibe_math_add_proposition', { id: 'pBlk2', 概述: '已记录阻塞的命题', 布尔估计: 0.5, 优先级: 1, '价值/关键性': 0.5, 细类型: { 数论: {} } })
  const vs2 = await verifyWithDebate(h, 'r-pBlk2', 0.5, 1)
  assert(!!vs2.first, 'verifiers spawned for the blocked object')
  const vp2 = h.spawns.find((s) => s.label === 'verifier:r-pBlk2:0')
  const vp2Text = vp2 ? vp2.prompt : ''
  assert(/该对象已被记录为\*\*形式化阻塞\*\*/.test(vp2Text), 'a blocked object is announced as such')
  assert(/涉及未形式化的分析学前置/.test(vp2Text), 'the blocker reason is shown to the reviewers')
  assert(/这个阻塞判断是否成立/.test(vp2Text), 'the verdict guidance asks whether the blocker is justified')
}

// ---------- 7. the 'require' gate (proposition) ----------
section("7 'require' withholds a verdict until the formal record exists")
{
  const h = await makeCase('gate')
  await h.call('vibe_math_set_params', { formalVerify: 'require', maxParallelThreshold: 8 })
  // a live problem keeps the scheduler from stopping itself (see the comment in case 6)
  await h.call('vibe_math_add_problem', { id: 'qKeep', description: '保持调度器运行的占位问题', priority: 9 })
  await startScheduler(h)
  const proj = projRoot(h)
  await h.call('vibe_math_add_proposition', { id: 'pGate', 概述: '必须形式化的命题', 布尔估计: 0.5, 优先级: 1, '价值/关键性': 0.5, 细类型: { 数论: {} } })
  const vs = await waitFor(() => { const x = verifiersOf(h, 'r-pGate'); return x.length >= 2 ? x : undefined }, 60, 250)
  assert(!!vs, 'verifiers were spawned under require mode')
  const vp = (h.spawns.find((s) => s.label === 'verifier:r-pGate:0') || {}).prompt || ''
  assert(/【Lean 形式化验证（强制模式）】/.test(vp), 'the review prompt says 强制模式')
  assert(/必须产出 Lean 形式化/.test(vp), "'require' states the formalization is mandatory")
  assert(/本次裁定不会生效/.test(vp), 'the prompt warns that the verdict will not take effect without it')
  assert(/formal-required/.test(vp), 'the prompt names the machine-readable reason')
  fireVerdicts(h, vs, 1)
  // The deferral writes Formal/TODO.md from INSIDE the settle path; waiting for that file is
  // the observable proof that the round settled (the task is dropped right after).
  const todoSettled = await waitFor(() => /pGate/.test(readIf(join(proj, 'Formal', 'TODO.md'))), 40, 150)
  assert(!!todoSettled, 'the deferred round settled (Formal/TODO.md recorded the object)')
  await tick(600)
  const propFile = join(proj, 'Propos', '数论_Propos.json')
  const props = JSON.parse(readIf(propFile) || '[]')
  const pGate = props.find((x) => x.id === 'pGate') || {}
  assert(pGate.布尔估计 === 0.5, "★ the verdict did NOT take effect: the proposition's 布尔估计 is unchanged (got " + pGate.布尔估计 + ')')
  assert(!(pGate.证明列表 || []).some((x) => x.正确概率 === 1), 'no probability-1 proof entry was recorded')
  assert(pGate.优先级 !== 'never', 'the priority was not pinned to never')
  assert(!existsSync(join(proj, 'Verified', '数论_Verified.json')), '★ no Verified card was written')
  const todo = readIf(join(proj, 'Formal', 'TODO.md'))
  assert(existsSync(join(proj, 'Formal', 'TODO.md')), 'Formal/TODO.md was created')
  assert(/pGate/.test(todo) && /formal-required/.test(todo), '★ the object is on the formalization TODO with the machine-readable reason')
  const recAfterGate = formalStateOf(h)
  // record key = the verification object id (rId), which is what lean_archive target= also uses
  assert(!!recAfterGate.records && !!recAfterGate.records['r-pGate'] && !!recAfterGate.records['r-pGate'].deferredAt, 'the deferral is persisted in the durable formal state (survives resume)')
  assert(!!recAfterGate.records['r-pGate'] && recAfterGate.records['r-pGate'].status === 'none', 'the object stays at status none (nothing was formalized)')
  const vlogs = existsSync(join(proj, 'Verification_logs')) ? readdirSync(join(proj, 'Verification_logs')) : []
  assert(vlogs.some((f) => f.startsWith('r-pGate')), '★ the verification round DID complete (its debate log exists) — the gate withheld the conclusion, it did not stall the round')
  const st1 = await h.call('vibe_math_status', {})
  assert(/require 模式搁置/.test(JSON.stringify(st1.recentActivity)), 'the withholding is announced on v2-readable channel (activity log; v2 has no Shared/Chat/)')
  assert(st1.formal.todo.some((t) => t.id === 'r-pGate'), 'status exposes the formalization TODO')
  const rep = await h.call('vibe_math_report', {})
  assert(!!rep.formal && rep.formal.required === true && rep.formal.mode === 'require', 'the report exposes the formal mode and gate flag')
  assert(rep.recentActivity.some((a) => /formal-gate/.test(a.event)), 'the deferral also lands in the report log')
  // The deferral leaves this project with no agent, task or solved problem, and v2's strict
  // termination stops the scheduler there — so a case that wants to RE-verify the object after
  // formalizing it must (re)start the scheduler, exactly as a human would.
  await startScheduler(h)
  const proofNow = await h.call('vibe_math_lean_archive', { kind: 'proof', target: 'pGate', content: 'theorem p_gate : 2 + 2 = 4 := by decide\n' })
  assert(proofNow.ok === true && proofNow.passed === true, 'the object is now Lean-passed')
  const spawned2 = await verifyWithDebate(h, 'r-pGate', 1, 0)
  assert(!!spawned2.first, 'the object was re-verified after the proof was archived')
  const props2 = JSON.parse(readIf(propFile) || '[]')
  const pGateNow = props2.find((x) => x.id === 'pGate') || {}
  assert(pGateNow.布尔估计 === 1, '★ with a passing Lean artifact the same unanimous verdict DOES take effect (布尔估计=1)')
  const cardFile = join(proj, 'Verified', '数论_Verified.json')
  const cards = JSON.parse(readIf(cardFile) || '[]')
  const card = cards.find((c) => c.id === 'pGate')
  assert(!!card, '★ the Verified card was written after the proof passed')
  assert(!!card && /Lean 通过/.test(card['形式化'] || ''), '★ the card records how strong the result is (Lean 通过)')
  assert(!!card && /Verified\/Lean\/pGate\.lean/.test(card['形式化'] || ''), 'the card points at the archived proof')
  await h.call('vibe_math_add_proposition', { id: 'pBlkOk', 概述: '记录阻塞后可定论', 布尔估计: 0.5, 优先级: 1, '价值/关键性': 0.5, 细类型: { 数论: {} } })
  const sp3 = await waitFor(() => { const x = verifiersOf(h, 'r-pBlkOk'); return x.length >= 2 ? x : undefined }, 60, 250)
  assert(!!sp3, 'verifiers spawned for the blocker-escape case')
  await h.call('vibe_math_lean_archive', { kind: 'blocked', target: 'r-pBlkOk', note: '命题涉及未形式化的分析学，本轮不做' })
  fireVerdicts(h, sp3 || [], 1)
  await waitFor(() => { const c = JSON.parse(readIf(cardFile) || '[]').find((x) => x.id === 'pBlkOk'); return c ? c : undefined }, 40, 150)
  await tick(400)
  const cards3 = JSON.parse(readIf(cardFile) || '[]')
  const card3 = cards3.find((c) => c.id === 'pBlkOk')
  assert(!!card3, '★ an explicit reasoned blocker also lets the verdict through (decide by difficulty, but decide out loud)')
  assert(!!card3 && /阻塞（/.test(card3['形式化'] || ''), 'the card records the blocker')
  assert(!!card3 && /未形式化的分析学/.test(card3['形式化'] || ''), 'the card records the blocker REASON, not just the fact')
}

// ---------- 8. the gate covers the qs (problem) choke point ----------
section('8 the gate also covers a problem-solution verdict')
{
  const h = await makeCase('gq')
  await h.call('vibe_math_set_params', { formalVerify: 'require', maxParallelThreshold: 8 })
  // a live problem keeps the scheduler from stopping itself (see the comment in case 3)
  await h.call('vibe_math_add_problem', { id: 'qStay', description: '保持调度器运行的占位问题', priority: 9 })
  await startScheduler(h)
  const proj = projRoot(h)
  await h.call('vibe_math_add_problem', { id: 'qG', description: '带解法的 require 门禁问题', priority: 1 })
  const qsFile = join(proj, 'qs', 'qs.json')
  const qs0 = JSON.parse(readIf(qsFile) || '[]')
  qs0.find((q) => q.id === 'qG').解法列表 = [{ 完整解法: 'closing argument', 正确概率: 0.8, 已验: false }]
  writeFileSync(qsFile, JSON.stringify(qs0, null, 2), 'utf8')
  await tick(2000)
  const sp = await waitFor(() => { const x = verifiersOf(h, 'r-qG-s0'); return x.length >= 2 ? x : undefined }, 60, 250)
  assert(!!sp, 'verifiers spawned for the problem solution')
  fireVerdicts(h, sp || [], 1)
  const todoG = await waitFor(() => /qG/.test(readIf(join(proj, 'Formal', 'TODO.md'))), 40, 150)
  assert(!!todoG, 'the deferred problem round settled (Formal/TODO.md recorded it)')
  await tick(600)
  const qs1 = JSON.parse(readIf(qsFile) || '[]')
  const qG = qs1.find((q) => q.id === 'qG')
  assert(!!qG && qG.已解决 !== true, '★ the problem was NOT marked solved (the require gate blocked the promotion)')
  assert(!!qG && qG.解法列表[0].正确概率 !== 1, "the solution's probability was left as it was")
  assert(!existsSync(join(proj, 'Verified', '问题_Verified.json')), 'no problem Verified card was written')
  assert(/qG/.test(readIf(join(proj, 'Formal', 'TODO.md'))), 'the problem is on the formalization TODO')
  await h.call('vibe_math_lean_archive', { kind: 'blocked', target: 'qG', note: '问题的形式化超出本轮工作量' })
  await startScheduler(h) // see case 7: the deferral may have stopped the scheduler
  const sp2 = await verifyWithDebate(h, 'r-qG-s0', 1, 0)
  assert(!!sp2.first, 'the problem solution was re-verified after the blocker was recorded')
  const qs2 = JSON.parse(readIf(qsFile) || '[]')
  const qG2 = qs2.find((q) => q.id === 'qG')
  assert(!!qG2 && qG2.已解决 === true, 'with a reasoned blocker the problem DOES close')
  assert(!!qG2 && qG2.解法列表[0].正确概率 === 1, 'the solution probability becomes 1 after the gate opened')
  const cards = JSON.parse(readIf(join(proj, 'Verified', '问题_Verified.json')) || '[]')
  const card = cards.find((c) => c.id === 'qG')
  assert(!!card && /阻塞（/.test(card['形式化'] || ''), 'the problem card records the formal status')
  assert(!existsSync(join(vibeRoot(h), 'Formal', 'Lib', 'qG.lean')), 'a blocked record does not fabricate a library file')
}

// ---------- 9. persistence across resume ----------
section('9 the formal state survives resume (v2 has no session projection)')
{
  const h = await makeCase('persist')
  await h.call('vibe_math_set_params', { formalVerify: 'require' })
  await h.call('vibe_math_lean_archive', { kind: 'proof', target: 'pPersist', content: 'theorem p_persist : 1 + 1 = 2 := by decide\n' })
  const before = await h.call('vibe_math_status', {})
  assert(before.formal.objects.some((o) => o.target === 'pPersist' && o.status === 'passed'), 'the object is passed before the restart')
  const proj = projRoot(h)
  writeFileSync(join(proj, 'VibeMath_State', 'process_epoch.json'), JSON.stringify('OLD-PROCESS-EPOCH'), 'utf8')
  const res = await h.call('vibe_math_resume', {})
  assert(res.ok === true, 'resume succeeded')
  const after = await h.call('vibe_math_status', {})
  assert(after.formal.objects.some((o) => o.target === 'pPersist' && o.status === 'passed'),
    '★ the Lean-passed object is still passed after resume (the gate does not forget)')
  assert(/pPersist/.test(readIf(join(proj, 'Formal', 'Index.md'))), 'Formal/Index.md still indexes it (the files are the readable mirror)')
}

// ---------- 10. the gate is a no-op unless require ----------
section("10 'encourage' never gates (a verdict still lands with no Lean artifact)")
{
  const h = await makeCase('nogate')
  await h.call('vibe_math_set_params', { formalVerify: 'encourage', maxParallelThreshold: 8 })
  await h.call('vibe_math_add_problem', { id: 'qKeep', description: '保持调度器运行的占位问题', priority: 9 })
  await startScheduler(h)
  const proj = projRoot(h)
  await h.call('vibe_math_add_proposition', { id: 'pFree', 概述: '鼓励模式不设门禁', 布尔估计: 0.5, 优先级: 1, '价值/关键性': 0.5, 细类型: { 数论: {} } })
  const vs = await verifyWithDebate(h, 'r-pFree', 1, 0)
  assert(!!vs.first, 'verifiers spawned under encourage mode')
  const props = JSON.parse(readIf(join(proj, 'Propos', '数论_Propos.json')) || '[]')
  const p = props.find((x) => x.id === 'pFree') || {}
  assert(p.布尔估计 === 1, "'encourage' finalizes normally with NO Lean artifact (布尔估计=1)")
  const cards = JSON.parse(readIf(join(proj, 'Verified', '数论_Verified.json')) || '[]')
  assert(!!cards.find((c) => c.id === 'pFree'), "'encourage' writes the Verified card")
  assert(!existsSync(join(proj, 'Formal', 'TODO.md')) || !/pFree/.test(readIf(join(proj, 'Formal', 'TODO.md'))), 'no formalization TODO is created in encourage mode')
}

// cleanup
for (const h of hosts) { try { rmSync(h.WS, { recursive: true, force: true }) } catch (e) { /* ignore */ } }

console.log('')
console.log('passed=' + passed + ' failed=' + failed)
if (failed) { console.error('FAILURES:'); for (const f of failures) console.error('  - ' + f); process.exit(1) }
console.log('ALL GREEN')
process.exit(0)

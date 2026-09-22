// ============================================================
// V4 LEAN FORMAL VERIFICATION SUITE  (docs/formal-verification.md)
//
// Asserts the whole contract of the `formalVerify` knob for the v4 preset:
//   · 'off'       is a TRUE no-op (no Lean text anywhere, no gate, verification unchanged)
//   · 'encourage' injects the Lean section into the VERIFICATION prompt AND the ordinary work
//                 round, and — the actual point of the feature — turns the voting prompt into a
//                 FIDELITY review once a Lean run has passed
//   · 'require'   withholds a unanimous 真/假 verdict as 未定论 until the object is Lean-passed
//                 or carries an explicit, reasoned blocker record; then it allows it, and the
//                 Verified card records how strong the result really is
//   · the three tools (run / archive / lib) write the right things to the right paths
//
// The Lean toolchain is mocked through the `subprocess` SERVICE (a fake Lean: a file passes unless
// it still contains `sorry` or the marker `-- FAIL`), so the tests exercise the REAL code path
// (resolveExecutable → spawn → collected stdout → exit code) without requiring Lean to be installed.
//
// V4_PLUGIN lets a sensitivity probe point this suite at a MUTATED copy of the plugin; without that
// override every probe would run the unmutated file and pass vacuously (AUDIT-CHECKLIST §2.5).
//
// Prompt text is asserted through the plugin's own `vibe_v4_prompts` host tool — the exact builder
// the framework uses — rather than by guessing which queued wake carries which prompt. That keeps
// the assertions precise even when the scheduler queues several rounds in one pass, and the suite
// still drives the real consensus path for every STATE transition (AUDIT-CHECKLIST §0.1/§2.2).
//
// Run: node formal-verify-v4.test.mjs
// ============================================================
import { mkdtempSync, existsSync, readFileSync, mkdirSync, writeFileSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname, isAbsolute } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'

// V4_PLUGIN (same convention the v5 suite uses for V5_PLUGIN): point the suite at a MUTATED copy of
// the plugin so a sensitivity probe can prove each invariant actually turns this suite red. Accept a
// plain filesystem path or a file:// URL, and never touch the value otherwise.
function pluginUrl() {
  const raw = process.env.V4_PLUGIN
  if (!raw || !String(raw).trim()) return new URL('./vibe-math-v4/vibe-math-v4.js', import.meta.url)
  const s = String(raw).trim()
  if (/^file:/i.test(s)) return new URL(s)
  return pathToFileURL(fileURLToPath(new URL('file:///' + s.replace(/\\/g, '/'))))
}
const PLUGIN = pluginUrl()

let passed = 0, failed = 0
const failures = []
const assert = (c, m) => { if (c) { passed++; console.log('  ok - ' + m) } else { failed++; failures.push(m); console.error('  FAIL - ' + m) } }
const sleep = ms => new Promise(r => setTimeout(r, ms))
const section = (t) => console.log('\n[' + t + ']')
const JSONX = o => '```json\n' + JSON.stringify(o) + '\n```'
const promptOf = (entry) => (entry && entry.blocks && entry.blocks[0] && entry.blocks[0].text) || ''
const readIf = (p) => (existsSync(p) ? readFileSync(p, 'utf8') : '')

// ===============================================================
// MOCK HOST — the shape selfdrive-v4 / e2e-v4-fixes use, plus a fake Lean
// ===============================================================
let toolchainAvailable = true
const leanRuns = []          // every spawn the framework made, for cwd/argv assertions

function makeSubprocess() {
  return {
    async resolveExecutable(cmd) {
      if (!toolchainAvailable) throw new Error('spawn lean ENOENT')
      if (String(cmd) !== 'lean' && String(cmd) !== 'lake') throw new Error('unknown executable ' + cmd)
      return String(cmd)
    },
    spawn(spec) {
      // The plugin passes an ABSOLUTE path as the last argv element, so resolve it directly; fall
      // back to scanning the argv for an existing .lean file (mirrors leanAbsPath).
      const last = spec.argv[spec.argv.length - 1]
      const file = existsSync(last) ? last : (spec.argv.find(a => /\.lean$/.test(String(a)) && existsSync(a)) || last)
      const text = existsSync(file) ? readFileSync(file, 'utf8') : ''
      const bad = /sorry|-- FAIL/.test(text)
      leanRuns.push({ argv: spec.argv.slice(), file, cwd: spec.cwd, graceMs: spec.graceMs, stdio: spec.stdio })
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
}

function makeHost() {
  const WS = mkdtempSync(join(tmpdir(), 'vibe-v4-lean-'))
  const listeners = {}, toolRegs = [], spawns = [], followups = []
  const subprocess = makeSubprocess()
  let ROOT
  const ctx = {
    get(name) { return name === 'subprocess' ? subprocess : undefined },
    on(e, fn) { (listeners[e] = listeners[e] || []).push(fn) },
    effect(fn) { const d = fn(); return () => { if (typeof d === 'function') d() } },
    logger: { info() {}, warn() {}, error() {} },
    timeout(cb, ms) { const h = setTimeout(cb, ms); return () => clearTimeout(h) },
    tools: { register(s) { toolRegs.push(s) } }, commands: { register() {} },
    // Real DSH exposes ONLY subagents.sendMessage for continuable wakes (followup is an Agent
    // method, not a subagents service method) — deliberately no followup, so a regression fails.
    subagents: {
      list() { return ['spawn'] },
      async startContinuable({ label, request }) { const id = 'c' + (spawns.length + 1); spawns.push({ label, request, childId: id }); return { childId: id } },
      async sendMessage(parent, childId, blocks) { followups.push({ childId, blocks }) },
      interrupt() {},
    },
    agents: { roots() { return [] }, get(id) { return id === 'sess-A' ? ROOT : undefined } },
    fs: {
      async resolve(rel, opts) { const b = (opts && opts.cwd) || WS; const p = (typeof rel === 'string' && isAbsolute(rel)) ? rel.replace(/\//g, '\\') : join(b, ...String(rel).split('/')); return { targetKey: p, displayPath: p } },
      async stat(t) { return existsSync(t.targetKey) ? { version: 'v1', type: 'file', size: 1 } : undefined },
      async readText(t) { return readFileSync(t.targetKey, 'utf8') },
      async writeText(t, c) { mkdirSync(dirname(t.targetKey), { recursive: true }); writeFileSync(t.targetKey, c, 'utf8') },
      async listDir(t) { if (!existsSync(t.targetKey)) return []; return readdirSync(t.targetKey, { withFileTypes: true }).map(e => ({ name: e.name, type: e.isDirectory() ? 'directory' : 'file' })) },
    },
  }
  ROOT = { id: 'sess-A', options: { provider: 'mock', model: 'm' }, session: { id: 'sess-A', header: { cwd: WS, parentSession: undefined } }, followup() {}, ctx: undefined }
  const projectRoot = join(WS, 'VibeMath', 'Projects', 'default')
  const vibeRoot = join(WS, 'VibeMath')
  let consumed = 0
  const h = {
    WS, ctx, toolRegs, spawns, followups, ROOT, projectRoot, vibeRoot,
    async callTool(n, a, agent) {
      const s = toolRegs.find(x => x.name === n); if (!s) throw new Error('no tool ' + n)
      return JSON.parse(await s.execute(a || {}, { agent: agent || ROOT }))
    },
    /** The exact prompt text a resident would receive, read through the plugin's own host tool. */
    async prompts(which, rId, arg) {
      const out = await h.callTool('vibe_v4_prompts', Object.assign({ which, member: rId }, arg || {}), ROOT)
      return out.text
    },
    resAgent: (cid) => ({ id: cid, session: { id: cid, header: { cwd: WS, parentSession: 'sess-A' } } }),
    ridOfChild(cid) { for (const sp of spawns) if (sp.childId === cid) return sp.label; return '' },
    childOf(rId) { for (const sp of spawns) if (sp.label === rId) return sp.childId; return '' },
    fireEnd(cid, reply) {
      const blocks = reply === undefined ? [] : [{ type: 'text', text: JSONX(reply) }]
      for (const fn of (listeners['subagent/end'] || [])) fn({ id: cid, runId: 'r', provider: 'spawn', local: true, stopReason: 'completed', lastAssistantMessage: blocks })
    },
    /** Every prompt this project's residents have received (founding + wakes). */
    allPrompts() {
      return spawns.map(s => (s.request && s.request.prompt && s.request.prompt[0] && s.request.prompt[0].text) || '').join('\n')
        + '\n' + followups.map(promptOf).join('\n')
    },
    nextWake() { while (consumed < followups.length) return followups[consumed++]; return null },
    resetCursor() { consumed = followups.length },
  }
  return h
}

async function mount() {
  const h = makeHost()
  const mod = await import(PLUGIN.href + '?t=' + Date.now() + Math.random())
  ;(mod.default || mod).apply(h.ctx)
  return h
}

// ===============================================================
// driving helpers
// ===============================================================
/** Complete every brainstorm round so the run becomes phase=active, then park the heartbeat. */
async function establish() {
  const h = await mount()
  const before = h.spawns.length
  await h.callTool('vibe_v4_start', { problem: '形式化契约验证测试', residentCount: 2 })
  for (let i = 0; i < 60 && h.spawns.length < before + 2; i++) await sleep(10)
  for (const sp of h.spawns.slice(before)) { h.fireEnd(sp.childId, { summary: '初始见解。', solved: false, contextPct: 10 }); await sleep(30) }
  // Park the heartbeat far away: these tests drive wakes explicitly, so a short heartbeat would
  // only add unrelated normal rounds and make the followup stream harder to reason about.
  await h.callTool('vibe_v4_set', { activityTimeoutMs: 600000 })
  for (let i = 0; i < 40; i++) { const s = await h.callTool('vibe_v4_status', {}); if (s.phase === 'active') break; await sleep(20) }
  await sleep(30)
  h.resetCursor()
  return h
}
/**
 * Answer the next wake with `replyFor(promptText, rId)`; returns how many wakes were answered.
 * `stop` is evaluated AFTER processing each wake, never before the first one: a run that is simply
 * idle between rounds would otherwise satisfy "no verification in flight" at entry and the loop
 * would exit without answering anything.
 */
async function drive(h, replyFor, stop, budget = 40) {
  let n = 0
  for (; n < budget; n++) {
    const w = h.nextWake()
    if (!w) break
    const pt = promptOf(w)
    h.fireEnd(w.childId, replyFor(pt, h.ridOfChild(w.childId)))
    await sleep(12)
    if (stop && await stop()) { n++; break }
  }
  return n
}
const verifySettled = (h) => async () => { const s = await h.callTool('vibe_v4_status', {}); return s.verifyInProgress === false && s.pendingVerify === null }
const voteReply = (plan) => (pt, rId) => (/团队验证/.test(pt)
  ? { vote: { verdict: plan(rId), reason: rId + ' 的判断' } }
  : { summary: '继续推进。', solved: false, contextPct: 20 })
/** Drive the pending verification to a settled state and return the resulting status. */
async function settleVerify(h, plan = () => 1, budget = 40) {
  await drive(h, voteReply(plan), verifySettled(h), budget)
  return await h.callTool('vibe_v4_status', {})
}
/**
 * Record a card for `target`, have r-1 propose verifying it, vote it wherever it lands, and return
 * the settled status. Prompt TEXT is asserted separately (see `h.prompts`) — this helper exercises
 * the real consensus path for the STATE transitions.
 */
async function proposeAndVote(h, target, opts = {}) {
  const card = opts.card || { id: target, title: target, statement: '待验证对象 ' + target, prob: 0.8, value: 0.6, motivation: 'm' }
  await h.callTool('vibe_v4_record_proposition', card, h.resAgent(h.childOf('r-1')))
  // The heartbeat is parked far away, so drive the FIRST round explicitly: an idle resident is
  // woken immediately by an incoming message (postMessage → wakeResident).
  const before = h.followups.length
  await h.callTool('vibe_v4_message', { to: 'r-1', content: '请处理本轮工作。' })
  for (let i = 0; i < 300 && h.followups.length === before; i++) await sleep(10)
  const proposal = opts.proposal || { summary: '提议验证 ' + target + '。', solved: false, propose_verify: target, contextPct: 20 }
  await drive(h, (pt) => (/团队验证/.test(pt)
    ? { vote: { verdict: (opts.verdict === undefined ? 1 : opts.verdict), reason: '预看提示词' } }
    : proposal), verifySettled(h))
  // The verification may only have been QUEUED by the proposal round; finish it.
  return await settleVerify(h, opts.plan || (() => (opts.verdict === undefined ? 1 : opts.verdict)))
}
/** Wake exactly the given resident with an ordinary work round and return that wake. */
async function workWake(h, rId) {
  const before = h.followups.length
  await h.callTool('vibe_v4_message', { to: rId, content: '请继续推进。' })
  for (let i = 0; i < 300 && h.followups.length === before; i++) await sleep(10)
  const w = h.nextWake()
  assert(w !== null, 'a work wake was delivered to ' + rId)
  return w
}

// ===============================================================
console.log('-- V4 Lean formal verification --')

// ---------- 1. 'off' is a true no-op ----------
section("1 'off' (default) is a true no-op")
const A = await establish()
{
  const st = await A.callTool('vibe_v4_status', {})
  assert(st.formal.mode === 'off' && st.formal.on === false, "the default mode is 'off' (got " + st.formal.mode + ')')
  assert(/formalVerify=off/.test(st.params), "status exposes formalVerify=off in its readable params (got " + st.params + ')')
  // Scan BEFORE any hand-written test message is injected: this test's own text would otherwise
  // taint the scan. The scan is on the feature's own TOKENS rather than the bare word 形式化: the
  // pre-existing brainstorm brief already contains 形式化 in the unrelated sentence about being
  // free to invent theories, so asserting the bare word would fail for a reason that has nothing
  // to do with this contract (AUDIT-CHECKLIST §2.2).
  const all = A.allPrompts()
  assert(!/Lean/.test(all), 'no founding/round prompt mentions Lean in off mode')
  assert(!/顺手形式化|Lean 通过|忠实性审查|vibe_v4_lean/.test(all), 'no founding/round prompt carries any Lean-formalization text in off mode')
  assert(all.length > 0, 'sanity: the scan actually saw the founding prompts')
}
// an off-mode verification must behave exactly as before: unanimous 真 → Verified/, no formal record
const offSettled = await proposeAndVote(A, 'p-off', {
  card: { id: 'p-off', title: '关模式', statement: '关模式下的普通命题', prob: 0.8, value: 0.6, motivation: 'm' },
  proposal: { summary: '请提议验证 p-off。', solved: false, propose_verify: 'p-off', contextPct: 20 },
})
assert(existsSync(join(A.projectRoot, 'Verified', '命题', 'p-off.md')), "★ 'off' still closes a unanimous TRUE verdict with NO Lean artifact")
assert(offSettled.formal.passed.length === 0 && offSettled.formal.objects.length === 0, "'off' records no formal object at all")
assert(!/形式化/.test(readIf(join(A.projectRoot, 'Verified', '命题', 'p-off.md'))), 'the Verified card carries no formal line in off mode')
assert(!existsSync(join(A.projectRoot, 'Formal', 'TODO.md')) || !/p-off/.test(readIf(join(A.projectRoot, 'Formal', 'TODO.md'))), 'no formalization TODO was created for p-off')
assert(!/顺手形式化|Lean/.test(await A.prompts('verify', 'r-1', { target: 'p-off' })), 'the voting prompt carries no Lean text in off mode')
assert(!/顺手形式化/.test(await A.prompts('normal', 'r-1')), 'the work prompt carries no formalization line in off mode')
// the tools still EXIST in off mode (static registration), they are just never advertised
assert(['vibe_v4_lean_run', 'vibe_v4_lean_archive', 'vibe_v4_lean_lib'].every(n => !!A.toolRegs.find(t => t.name === n)),
  'the three Lean tools are registered in every mode (registration is static)')

// ---------- 2. parameter validation + runtime switching ----------
section('2 parameter validation and runtime switching')
const B = await establish()
{
  const bad = await B.callTool('vibe_v4_set', { formalVerify: 'banana' })
  assert(bad.formal.mode === 'off' && /formalVerify=off/.test(bad.params), "an unknown mode degrades to 'off', never to a stronger mode (got " + bad.formal.mode + ')')
  const enc = await B.callTool('vibe_v4_set', { formalVerify: 'encourage' })
  assert(enc.formal.mode === 'encourage', "'encourage' is accepted")
  const req = await B.callTool('vibe_v4_set', { formalVerify: 'require', leanTimeoutMs: -5, leanCommand: '   ' })
  assert(req.formal.mode === 'require', "'require' is accepted")
  assert(/leanTimeoutMs=120000/.test(req.params), 'a non-positive leanTimeoutMs falls back to the default (' + (/leanTimeoutMs=\S+/.exec(req.params) || [])[0] + ')')
  assert(/leanCommand=lean/.test(req.params), 'a blank leanCommand falls back to "lean"')
  const lk = await B.callTool('vibe_v4_set', { leanCommand: 'lake', leanArgs: ['env', 'lean'] })
  assert(/leanCommand=lake/.test(lk.params) && /leanArgs=env,lean/.test(lk.params), 'leanCommand/leanArgs are settable (lake env lean)')
  const la = await B.callTool('vibe_v4_set', { leanArgs: 'a, b ,,c' })
  assert(/leanArgs=a,b,c/.test(la.params), 'leanArgs accepts a comma-separated string and drops blanks (got ' + (/leanArgs=[^,]*,[^,]*,[^,]*/.exec(la.params) || [])[0] + ')')
  await B.callTool('vibe_v4_set', { leanTimeoutMs: 5 })
  assert(/leanTimeoutMs=5/.test((await B.callTool('vibe_v4_status', {})).params), 'a legitimate leanTimeoutMs is preserved')
  await B.callTool('vibe_v4_set', { leanTimeoutMs: 0 })
  assert(/leanTimeoutMs=120000/.test((await B.callTool('vibe_v4_status', {})).params), 'leanTimeoutMs:0 also falls back to the default')
  // the switch must be visible to the very NEXT prompt, not to some frozen brief
  await B.callTool('vibe_v4_set', { formalVerify: 'encourage' })
  assert(/顺手形式化/.test(await B.prompts('normal', 'r-1')), '★ switching the mode at runtime changes the NEXT prompt immediately')
  await B.callTool('vibe_v4_set', { formalVerify: 'off' })
  assert(!/顺手形式化/.test(await B.prompts('normal', 'r-1')), 'switching back to off removes it again')
}

// ---------- 3. 'encourage' injection into BOTH prompts ----------
section("3 'encourage' injects the Lean section into the verification AND the work prompt")
const C = await establish()
await C.callTool('vibe_v4_set', { formalVerify: 'encourage' })
{
  // The ordinary work round. Read the builder AND drive a real wake, so the assertion cannot pass
  // on a builder that is never actually used to address a resident.
  const built = await C.prompts('normal', 'r-2')
  assert(/【顺手形式化（鼓励）】/.test(built), '★ the ordinary work round tells residents to formalize reusable objects as they go')
  assert(/vibe_v4_lean_archive kind='def'/.test(built), 'the work round points at the archive tool for reusable definitions')
  assert(/vibe_v4_lean_lib 查重/.test(built), 'the work round tells them to de-duplicate against the reuse library first')
  assert(/"formal":/.test(built), 'the work reply contract documents the formal field')
  assert(/Resident researcher r-2/.test(built), 'the work prompt is addressed to the resident it is built for')
  const hb = await C.prompts('heartbeat', 'r-2')
  assert(/【顺手形式化（鼓励）】/.test(hb), 'the CHECKPOINT/heartbeat round carries it too')
  const w = await workWake(C, 'r-2')
  assert(/【顺手形式化（鼓励）】/.test(promptOf(w)), '★ a REAL delivered work wake contains the line (the builder is the one in use)')
  C.fireEnd(w.childId, { summary: '继续推进。', solved: false, contextPct: 20 })
  await sleep(30)
  const core = await C.prompts('coreRules')
  assert(/\[核心规则重申\]/.test(core) && /【顺手形式化（鼓励）】/.test(core), 'the post-compact core-rules recap also carries the formalization line')
}
{
  await proposeAndVote(C, 'p-enc', {
    card: { id: 'p-enc', title: '鼓励注入', statement: '鼓励模式下的忠实性审查', prob: 0.5, value: 0.6, motivation: 'm' },
    proposal: { summary: '提议验证 p-enc。', solved: false, propose_verify: 'p-enc', contextPct: 20 },
    verdict: 0.5, plan: () => 0.5,
  })
  const prompt = await C.prompts('verify', 'r-1', { target: 'p-enc', stage: 'independent' })
  assert(/【Lean 形式化验证（鼓励模式）】/.test(prompt), 'the voting prompt explains the Lean mode')
  assert(/一旦 Lean 通过，你唯一需要确认的就是忠实性/.test(prompt), 'the voting prompt states that a passing Lean run shrinks the question to fidelity')
  assert(/实现难度/.test(prompt), 'the voting prompt asks for the implementation-difficulty judgement')
  assert(/可以不做，但请在回执的 formal 字段写明难度判断/.test(prompt), "'encourage' explicitly allows skipping (with a recorded judgement)")
  assert(/vibe_v4_lean_run/.test(prompt) && /vibe_v4_lean_archive/.test(prompt) && /vibe_v4_lean_lib/.test(prompt), 'the voting prompt names all three tools')
  assert(/"formal":/.test(prompt), '★ the voting reply contract documents the formal field')
  assert(/Resident r-1/.test(prompt), 'the voting prompt is addressed to the voter it is built for')
  assert(!/强制模式/.test(prompt), "'encourage' does not use the mandatory wording")
}

// ---------- 4. the run tool ----------
section('4 lean_run executes through the subprocess service and reports honestly')
const D = await establish()
await D.callTool('vibe_v4_set', { formalVerify: 'encourage' })
mkdirSync(join(D.projectRoot, 'Formal'), { recursive: true })
writeFileSync(join(D.projectRoot, 'Formal', 'good.lean'), 'theorem t : 1 = 1 := rfl\n', 'utf8')
writeFileSync(join(D.projectRoot, 'Formal', 'bad.lean'), 'theorem t : 1 = 2 := by sorry\n', 'utf8')
const r1 = D.resAgent(D.childOf('r-1'))
const runGood = await D.callTool('vibe_v4_lean_run', { file: 'Formal/good.lean' }, r1)
assert(runGood.ok === true && runGood.exitCode === 0, 'a file with no sorry runs green (' + JSON.stringify({ ok: runGood.ok, exitCode: runGood.exitCode }) + ')')
assert(typeof runGood.ms === 'number' && typeof runGood.command === 'string' && runGood.file === 'Formal/good.lean', 'the result carries {ms, command, file} as the spec requires')
assert(leanRuns.length > 0 && String(leanRuns[leanRuns.length - 1].cwd).replace(/\\/g, '/') === D.projectRoot.replace(/\\/g, '/'), 'the toolchain runs with the PROJECT root as cwd')
{
  const last = leanRuns[leanRuns.length - 1]
  assert(String(last.argv[0]).indexOf('lean') !== -1 && /\.lean$/.test(String(last.argv[last.argv.length - 1])), 'argv is [exe, ...leanArgs, absolute file]')
  assert(last.stdio && last.stdio.stdin === 'ignore', "stdin is ignored (the spec's stdio shape)")
}
const runBad = await D.callTool('vibe_v4_lean_run', { file: 'Formal/bad.lean' }, r1)
assert(runBad.ok === false && runBad.exitCode === 1, 'a file that still uses sorry reports a red run')
assert(/sorry/.test(runBad.stderr), 'the compiler output is returned verbatim (' + JSON.stringify(runBad.stderr).slice(0, 60) + ')')
assert(runBad.code === 'LEAN_FAILED', 'a red run is typed LEAN_FAILED')
const runMissing = await D.callTool('vibe_v4_lean_run', { file: 'Formal/nope.lean' }, r1)
assert(runMissing.ok === false && runMissing.code === 'V4_NOT_FOUND', 'a missing file is refused with a typed code')
const runNoFile = await D.callTool('vibe_v4_lean_run', {}, r1)
assert(runNoFile.ok === false && runNoFile.code === 'V4_INVALID_ARGUMENT', 'a run without a file is refused')
// The guard's boundary is the VibeMath ROOT, not the project: the global reuse library
// deliberately lives at <VibeMath>/Formal/{Lib,Proved}, so climbing out of the project but staying
// inside VibeMath must remain legal (it just fails as a missing file).
const runOutside = await D.callTool('vibe_v4_lean_run', { file: '../../Formal/Lib/x.lean' }, r1)
assert(runOutside.code === 'V4_NOT_FOUND', 'climbing out of the project but staying inside VibeMath is allowed (the global library lives there)')
const esc1 = await D.callTool('vibe_v4_lean_run', { file: '../../../../../etc/evil.lean' }, r1)
assert(esc1.ok === false && esc1.code === 'V4_INVALID_ARGUMENT', '★ a traversal that climbs ABOVE the VibeMath root is refused')
const esc2 = await D.callTool('vibe_v4_lean_run', { file: 'Formal/../../../../../../evil.lean' }, r1)
assert(esc2.ok === false && esc2.code === 'V4_INVALID_ARGUMENT', 'a deeper traversal is refused too')
const esc3 = await D.callTool('vibe_v4_lean_run', { file: '/etc/evil.lean' }, r1)
assert(esc3.ok === false && esc3.code === 'V4_INVALID_ARGUMENT', 'an unrelated absolute path is refused')
const esc4 = await D.callTool('vibe_v4_lean_run', { file: 'C:\\Windows\\evil.lean' }, r1)
assert(esc4.ok === false && esc4.code === 'V4_INVALID_ARGUMENT', 'an unrelated absolute path with a drive letter is refused')
const notLean = await D.callTool('vibe_v4_lean_run', { file: 'Formal/good.txt' }, r1)
assert(notLean.ok === false && notLean.code === 'V4_INVALID_ARGUMENT', 'only .lean files can be executed')
toolchainAvailable = false
const noTc = await D.callTool('vibe_v4_lean_run', { file: 'Formal/good.lean' }, r1)
assert(noTc.ok === false && noTc.code === 'LEAN_NOT_FOUND', '★ a missing toolchain returns LEAN_NOT_FOUND instead of crashing')
assert(/仍可把形式化代码写下来归档/.test(noTc.message || ''), 'the failure explains the graceful degradation')
assert((await D.callTool('vibe_v4_status', {})).ok === true, 'the group did NOT crash on the missing toolchain (status still answers)')
toolchainAvailable = true

// ---------- 5. a passing proof flips the review subject to fidelity ----------
section('5 a passing proof flips the review subject to fidelity')
const arc = await D.callTool('vibe_v4_lean_archive', { kind: 'proof', target: 'p-proof', content: 'theorem p_proof : 3 * 1 ^ 2 - 2 = (1:Nat) ^ 2 := by decide\n' }, r1)
assert(arc.ok === true && arc.passed === true, 'the proof is archived and passes (' + JSON.stringify({ ok: arc.ok, passed: arc.passed }) + ')')
assert(arc.file === 'Formal/p-proof.lean', 'the working file is Formal/<target>.lean')
assert(arc.proof === 'Verified/Lean/p-proof.lean', 'the archived proof path is Verified/Lean/<target>.lean')
assert(existsSync(join(D.projectRoot, 'Formal', 'p-proof.lean')), 'the working file exists on disk')
assert(existsSync(join(D.projectRoot, 'Verified', 'Lean', 'p-proof.lean')), '★ the proof is archived under Verified/Lean/ as the proof of that object')
const stD = await D.callTool('vibe_v4_status', {})
assert(stD.formal.passed.indexOf('p-proof') !== -1, 'status reports the object as Lean-passed')
const idxD = readIf(join(D.projectRoot, 'Formal', 'Index.md'))
assert(/p-proof/.test(idxD) && /passed/.test(idxD) && /Verified\/Lean\/p-proof\.lean/.test(idxD), 'Formal/Index.md indexes the object, its status and its archived proof')
// a RED proof must NOT mint a Verified/Lean/ copy or mark the object passed
const arcRed = await D.callTool('vibe_v4_lean_archive', { kind: 'proof', target: 'p-red', content: 'theorem p_red : 1 = 2 := by sorry\n' }, r1)
assert(arcRed.ok === true && arcRed.passed === false && arcRed.status === 'attempted', 'a red proof is archived as attempted, not passed')
assert(!existsSync(join(D.projectRoot, 'Verified', 'Lean', 'p-red.lean')), '★ a red run does NOT mint a Verified/Lean proof copy')
// durable state: the record survives a resume (v4 has no session projection)
{
  const raw = readIf(join(D.projectRoot, 'State', 'formal.json'))
  assert(/"p-proof"/.test(raw) && /"passed"/.test(raw), "★ the formal record is persisted in v4's own durable State/formal.json")
  const before = D.spawns.length
  await D.callTool('vibe_v4_abort', {})
  const res = await D.callTool('vibe_v4_resume', {})
  assert(res.ok === true && D.spawns.length > before, 'abort → resume re-spawns residents')
  const stR = await D.callTool('vibe_v4_status', {})
  assert(stR.formal.passed.indexOf('p-proof') !== -1, '★ the Lean-passed record SURVIVES resume (durable state, not an in-memory projection)')
  for (const sp of D.spawns.slice(before)) { D.fireEnd(sp.childId, { summary: '恢复见解。', solved: false, contextPct: 10 }); await sleep(25) }
  await D.callTool('vibe_v4_set', { activityTimeoutMs: 600000 })
  D.resetCursor()
}
// now the voting prompt must ASK FOR FIDELITY, not for a re-derivation
{
  await proposeAndVote(D, 'p-proof', {
    card: { id: 'p-proof', title: '忠实性', statement: '3N²−2=b² 在 N=1 时成立', prob: 0.9, value: 0.6, motivation: 'm' },
    proposal: { summary: '提议验证 p-proof。', solved: false, propose_verify: 'p-proof', contextPct: 20 },
    verdict: 0.5, plan: () => 0.5,
  })
  const prompt = await D.prompts('verify', 'r-1', { target: 'p-proof', stage: 'independent' })
  assert(/该对象已有\*\*通过的 Lean 形式化证明\*\*/.test(prompt), 'the voting prompt announces the passing proof')
  assert(/你不需要重新检查推导/.test(prompt), '★ it tells voters NOT to re-derive')
  assert(/忠实性审查/.test(prompt), '★ it tells voters the review subject is now fidelity')
  assert(/定义 \/ 对象 \/ 条件 \/ 假设 \/ 结论是否与命题原文\*\*完全一致\*\*/.test(prompt), 'it enumerates exactly what fidelity means')
  assert(/因此请把 verdict 用在\*\*忠实性\*\*上/.test(prompt), 'the shift is made explicit in the verdict instruction')
  assert(/Verified\/Lean\/p-proof\.lean/.test(prompt), 'it points at the archived proof')
  // the SAME object's work round must not inherit the fidelity framing (that is a voting
  // instruction), but it does carry the standing formalization line.
  const work = await D.prompts('normal', 'r-1')
  assert(!/忠实性审查/.test(work), 'the fidelity instruction is confined to the voting prompt')
  assert(/【顺手形式化（鼓励）】/.test(work), 'the work round carries the standing formalization line instead')
}

// ---------- 6. the reusable cross-project library ----------
section('6 reusable definitions and lemmas go to the GLOBAL library')
const libPath = join(D.vibeRoot, 'Formal', 'Lib')
const provedPath = join(D.vibeRoot, 'Formal', 'Proved')
const defRes = await D.callTool('vibe_v4_lean_archive', { kind: 'def', name: 'ZMod5', content: 'def ZMod5 := Fin 5\n' }, r1)
assert(defRes.ok === true && defRes.file === 'Formal/Lib/ZMod5.lean', 'a reusable definition is archived to the global lib (' + defRes.file + ')')
assert(existsSync(join(libPath, 'ZMod5.lean')), '★ the definition exists under VibeMath/Formal/Lib/ (cross-project, NOT inside the project)')
assert(!existsSync(join(D.projectRoot, 'Formal', 'Lib', 'ZMod5.lean')), 'it is NOT duplicated inside the project tree')
const lemRes = await D.callTool('vibe_v4_lean_archive', { kind: 'lemma', name: 'sq_odd', content: 'theorem sq_odd (n : Nat) : Odd (n*n) → Odd n := by omega\n' }, r1)
assert(lemRes.ok === true && lemRes.file === 'Formal/Proved/sq_odd.lean', 'a lemma is archived to Proved/')
assert(existsSync(join(provedPath, 'sq_odd.lean')), 'the lemma exists under VibeMath/Formal/Proved/')
assert(/ZMod5/.test(readIf(join(libPath, 'Index.md'))), 'Lib/Index.md lists the new definition')
assert(/sq_odd/.test(readIf(join(provedPath, 'Index.md'))), 'Proved/Index.md lists the new lemma')
// `from` copies an existing workspace .lean file instead of inline content
writeFileSync(join(D.projectRoot, 'Formal', 'src.lean'), 'def copied := 7\n', 'utf8')
const fromRes = await D.callTool('vibe_v4_lean_archive', { kind: 'def', name: 'Copied', from: 'Formal/src.lean' }, r1)
assert(fromRes.ok === true && readIf(join(libPath, 'Copied.lean')) === 'def copied := 7\n', "kind='def' accepts from=<existing .lean file>")
const fromEsc = await D.callTool('vibe_v4_lean_archive', { kind: 'def', name: 'Evil', from: '../../../../etc/passwd' }, r1)
assert(fromEsc.ok === false && fromEsc.code === 'V4_INVALID_ARGUMENT', "★ kind='def' refuses a `from` outside the VibeMath root")
const libList = await D.callTool('vibe_v4_lean_lib', {}, r1)
assert(libList.ok === true && libList.counts.lib >= 2 && libList.counts.proved >= 1, 'lean_lib reports the reuse library sizes (' + JSON.stringify(libList.counts) + ')')
assert(libList.objects.some(o => o.target === 'p-proof' && o.status === 'passed'), 'lean_lib lists per-object formal status')
assert(/复用优先/.test(libList.hint || ''), 'lean_lib tells agents to reuse before redefining')
assert(libList.paths && /Formal\/Lib/.test(libList.paths.lib), 'lean_lib reports the global library paths')
const noName = await D.callTool('vibe_v4_lean_archive', { kind: 'def', content: 'def x := 1\n' }, r1)
assert(noName.ok === false && noName.code === 'V4_INVALID_ARGUMENT', 'archiving a definition without a name is refused')
const noBody = await D.callTool('vibe_v4_lean_archive', { kind: 'lemma', name: 'empty' }, r1)
assert(noBody.ok === false && noBody.code === 'V4_INVALID_ARGUMENT', 'archiving without content or from is refused')
const badKind = await D.callTool('vibe_v4_lean_archive', { kind: 'nonsense' }, r1)
assert(badKind.ok === false && badKind.code === 'V4_INVALID_ARGUMENT', 'an unknown archive kind is refused')
const libNoRefresh = await D.callTool('vibe_v4_lean_lib', { refresh: false }, r1)
assert(libNoRefresh.ok === true && libNoRefresh.rebuilt === false && libNoRefresh.counts.lib === null, 'refresh:false reads without rebuilding')

// ---------- 7. blocked needs a reason ----------
section('7 a "blocker" record must be explicit and reasoned')
const blkNoNote = await D.callTool('vibe_v4_lean_archive', { kind: 'blocked', target: 'p-blk' }, r1)
assert(blkNoNote.ok === false && blkNoNote.code === 'V4_INVALID_ARGUMENT', '★ blocked without a note is refused')
const blkBlank = await D.callTool('vibe_v4_lean_archive', { kind: 'blocked', target: 'p-blk', note: '   ' }, r1)
assert(blkBlank.ok === false && blkBlank.code === 'V4_INVALID_ARGUMENT', 'a whitespace-only note is refused too')
const blk = await D.callTool('vibe_v4_lean_archive', { kind: 'blocked', target: 'p-blk', note: '需要外层解析数论框架，本轮工作量不可接受' }, r1)
assert(blk.ok === true && blk.status === 'blocked', 'a reasoned blocker is recorded')
const stBlk = await D.callTool('vibe_v4_status', {})
assert(stBlk.formal.blocked.indexOf('p-blk') !== -1, 'status lists the blocked object')
assert(/需要外层解析数论框架/.test(readIf(join(D.projectRoot, 'Formal', 'Index.md'))), 'the blocker reason is written into the index')

// ---------- 8. the per-round `formal` reply channel ----------
section('8 the per-round `formal` reply judgement is recorded')
{
  const w1 = await workWake(D, 'r-1')
  D.fireEnd(w1.childId, { summary: '难度太高，本轮不做形式化。', formal: { target: 'p-reply', decision: 'blocked', note: '需要大量未形式化的实分析前置知识' }, contextPct: 20 })
  await sleep(60)
  const st = await D.callTool('vibe_v4_status', {})
  assert(st.formal.blocked.indexOf('p-reply') !== -1, '★ a `formal.decision=blocked` reply is recorded as a blocker')
  assert(/实分析前置知识/.test(readIf(join(D.projectRoot, 'Formal', 'Index.md'))), 'and its reason reaches the index')
}
{
  const w2 = await workWake(D, 'r-2')
  D.fireEnd(w2.childId, { summary: '我写了形式化草稿。', formal: { target: 'p-reply2', decision: 'used', file: 'Formal/p-reply2.lean' }, contextPct: 20 })
  await sleep(60)
  const st = await D.callTool('vibe_v4_status', {})
  assert(st.formal.objects.some(o => o.target === 'p-reply2' && o.status === 'attempted'),
    'a `formal.decision=used` reply records the object as ATTEMPTED with its file (no green run yet)')
}
{
  const w3 = await workWake(D, 'r-1')
  D.fireEnd(w3.childId, { summary: '不做。', formal: { target: 'p-reply3', decision: 'blocked' }, contextPct: 20 })
  await sleep(60)
  const st = await D.callTool('vibe_v4_status', {})
  assert(!st.formal.objects.some(o => o.target === 'p-reply3'), 'a blocker with no note creates NO record')
  assert(st.ok === true, 'the refusal did not crash the run')
}

// ---------- 9. the 'require' gate ----------
section("9 'require' withholds a verdict until the formal record exists")
const E = await establish()
await E.callTool('vibe_v4_set', { formalVerify: 'require' })
{
  await proposeAndVote(E, 'p-gate', {
    card: { id: 'p-gate', title: '门禁', statement: '必须形式化的命题', prob: 0.8, value: 0.6, motivation: 'm' },
    proposal: { summary: '提议验证 p-gate。', solved: false, propose_verify: 'p-gate', contextPct: 20 },
    verdict: 1,
  })
  const prompt = await E.prompts('verify', 'r-1', { target: 'p-gate', stage: 'independent' })
  assert(/【Lean 形式化验证（强制模式）】/.test(prompt), 'the voting prompt says 强制模式')
  assert(/必须产出 Lean 形式化/.test(prompt), "'require' states the formalization is mandatory")
  assert(/本次裁定不会生效/.test(prompt), 'the prompt warns that the verdict will not take effect without it')
  assert(!/可以不做/.test(prompt), "'require' does NOT offer the encourage-mode opt-out")
}
const gated = await E.callTool('vibe_v4_status', {})
assert(gated.verifyInProgress === false && gated.pendingVerify === null, 'the verification actually RAN to a settled state (so the next assertion is falsifiable)')
assert(!existsSync(join(E.projectRoot, 'Verified', '命题', 'p-gate.md')), '★ a unanimous TRUE verdict did NOT promote the object to Verified/')
assert(gated.formal.todo.indexOf('p-gate') !== -1, '★ it is recorded as 未定论 (a formalization TODO entry)')
assert(gated.formal.objects.some(o => o.target === 'p-gate' && o.status === 'none'), 'the object keeps a `none` formal record (never silently marked passed)')
assert(!/已验证·真/.test(readIf(join(E.projectRoot, 'Propos', 'r-1', 'p-gate.md'))), 'the source card was NOT rewritten to 已验证·真 (the conclusion was withheld, not taken)')
const todoE = readIf(join(E.projectRoot, 'Formal', 'TODO.md'))
assert(existsSync(join(E.projectRoot, 'Formal', 'TODO.md')), 'Formal/TODO.md was created')
assert(/p-gate/.test(todoE) && /formal-required/.test(todoE), '★ the object is on the formalization TODO with the machine-readable reason')
assert(!/已验证·真/.test(readIf(join(E.projectRoot, 'Shared', 'debates', 'p-gate.md'))), 'the debate record does NOT claim a 真 conclusion')
assert(/formal-required/.test(readIf(join(E.projectRoot, 'Formal', 'Index.md'))), 'the index carries the withheld verdict too')
// now formalize it and re-verify: the gate must open
const proofNow = await E.callTool('vibe_v4_lean_archive', { kind: 'proof', target: 'p-gate', content: 'theorem p_gate : 2 + 2 = 4 := by decide\n' }, E.resAgent(E.childOf('r-1')))
assert(proofNow.ok === true && proofNow.passed === true, 'the object is now Lean-passed')
{
  await proposeAndVote(E, 'p-gate', {
    card: { id: 'p-gate', title: '门禁', statement: '必须形式化的命题', prob: 0.8, value: 0.6, motivation: 'm' },
    proposal: { summary: '已形式化，重新提议验证 p-gate。', solved: false, propose_verify: 'p-gate', contextPct: 20 },
    verdict: 1,
  })
  const prompt = await E.prompts('verify', 'r-1', { target: 'p-gate', stage: 'independent' })
  assert(/该对象已有\*\*通过的 Lean 形式化证明\*\*/.test(prompt), 'the re-verify prompt now points at the passing proof')
}
const gated2 = await E.callTool('vibe_v4_status', {})
assert(existsSync(join(E.projectRoot, 'Verified', '命题', 'p-gate.md')), '★ with a passing Lean artifact the same verdict DOES promote it')
const card = readIf(join(E.projectRoot, 'Verified', '命题', 'p-gate.md'))
assert(/- 形式化: Lean 通过/.test(card), '★ the Verified card records how strong the result is (Lean 通过)')
assert(/Verified\/Lean\/p-gate\.lean/.test(card), 'the card points at the archived proof')
assert(gated2.formal.todo.indexOf('p-gate') === -1, 'the satisfied TODO entry was cleared')
// the blocker escape hatch must also open the gate
await E.callTool('vibe_v4_lean_archive', { kind: 'blocked', target: 'p-blocked-ok', note: '命题涉及未形式化的分析学，本轮不做' }, E.resAgent(E.childOf('r-1')))
await proposeAndVote(E, 'p-blocked-ok', {
  card: { id: 'p-blocked-ok', title: '阻塞放行', statement: '记录阻塞后可定论', prob: 0.8, value: 0.6, motivation: 'm' },
  proposal: { summary: '提议验证 p-blocked-ok。', solved: false, propose_verify: 'p-blocked-ok', contextPct: 20 },
  verdict: 1,
})
assert(existsSync(join(E.projectRoot, 'Verified', '命题', 'p-blocked-ok.md')), '★ an explicit reasoned blocker also lets the verdict through (decide by difficulty, but decide out loud)')
assert(/- 形式化: 阻塞（/.test(readIf(join(E.projectRoot, 'Verified', '命题', 'p-blocked-ok.md'))), 'the card records the blocker')
assert((await E.callTool('vibe_v4_status', {})).formal.blocked.indexOf('p-blocked-ok') !== -1, 'status lists it as blocked')
// a `require`-mode FALSE verdict must be gated exactly the same way (the gate sits on the choke
// point, not on the 真 branch): assert the tally was recorded BEFORE asserting it was withheld.
await proposeAndVote(E, 'p-gate-false', {
  card: { id: 'p-gate-false', title: '假也要门禁', statement: '一个会被一致判假的命题', prob: 0.1, value: 0.6, motivation: 'm' },
  proposal: { summary: '提议验证 p-gate-false。', solved: false, propose_verify: 'p-gate-false', contextPct: 20 },
  verdict: 0,
})
const gatedF = await E.callTool('vibe_v4_status', {})
assert(!existsSync(join(E.projectRoot, 'Verified', '命题', 'p-gate-false.md')), '★ a unanimous FALSE verdict is gated too')
assert(gatedF.formal.todo.indexOf('p-gate-false') !== -1, 'the false verdict is recorded as 未定论 as well')
assert(!/已验证·假/.test(readIf(join(E.projectRoot, 'Propos', 'r-1', 'p-gate-false.md'))), 'the source card was not rewritten to 已验证·假')

// ---------- 10. 'encourage' does NOT gate ----------
section("10 'encourage' has no gate (the verdict still closes)")
const F = await establish()
await F.callTool('vibe_v4_set', { formalVerify: 'encourage' })
await proposeAndVote(F, 'p-enc-ok', {
  card: { id: 'p-enc-ok', title: '鼓励不门禁', statement: '鼓励模式下无形式化产物也能定论', prob: 0.8, value: 0.6, motivation: 'm' },
  proposal: { summary: '提议验证 p-enc-ok。', solved: false, propose_verify: 'p-enc-ok', contextPct: 20 },
  verdict: 1,
})
assert(existsSync(join(F.projectRoot, 'Verified', '命题', 'p-enc-ok.md')), "★ 'encourage' imposes NO gate: the verdict closes with no Lean artifact")
assert(/- 形式化: 未尝试/.test(readIf(join(F.projectRoot, 'Verified', '命题', 'p-enc-ok.md'))), 'the card still states the object was never formalized')

// ---------- 11. reporting ----------
section('11 the host can audit formal strength')
const repF = await F.callTool('vibe_v4_formal_report', {}, F.ROOT)
assert(/## Lean 形式化/.test(repF.formalReport), 'the formal report has a Lean section')
assert(/模式：encourage/.test(repF.formalReport), 'it states the mode')
const repOff = await A.callTool('vibe_v4_formal_report', {}, A.ROOT)
assert(/未启用/.test(repOff.formalReport), 'in off mode the report says the feature is not enabled')
const repE = await E.callTool('vibe_v4_report', {}, E.ROOT)
assert(repE.formal && repE.formal.passed.indexOf('p-gate') !== -1, 'the structured report exposes the Lean-passed objects')
assert(repE.formal.blocked.indexOf('p-blocked-ok') !== -1, 'and the blocked objects')
const reportE = await E.callTool('vibe_v4_formal_report', {}, E.ROOT)
assert(/已通过：.*p-gate/.test(reportE.formalReport), 'the human report lists Lean-passed objects')
assert(/已记录阻塞：.*p-blocked-ok/.test(reportE.formalReport), 'the human report lists blocked objects')
assert(/形式化待办：.*p-gate-false/.test(reportE.formalReport), 'the human report lists the formalization TODO')

// ===============================================================
console.log('')
console.log('passed=' + passed + ' failed=' + failed)
if (failed) { console.error('FAILURES:'); for (const f of failures) console.error('  - ' + f); process.exit(1) }
console.log('ALL GREEN')
process.exit(0)

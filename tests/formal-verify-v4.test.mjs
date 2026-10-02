// ============================================================
// V4 LEAN FORMAL VERIFICATION SUITE  (docs/formal-verification.md)
//
// Asserts the whole contract of the `formalVerify` knob for the v4 preset:
//   · 'off'       is a TRUE no-op for VERIFICATION (no Lean block, no gate) and for the daily line
//                 under the default initiative; `leanInitiative:'eager'` is the one exception that
//                 still injects the DAILY line (the two knobs are independent axes — see §17).
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
// Run: node tests/formal-verify-v4.test.mjs
// ============================================================
import { mkdtempSync, existsSync, readFileSync, mkdirSync, writeFileSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname, isAbsolute, resolve as pathResolve } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'

// V4_PLUGIN (same convention the v5 suite uses for V5_PLUGIN): point the suite at a MUTATED copy of
// the plugin so a sensitivity probe can prove each invariant actually turns this suite red. Accept a
// plain filesystem path or a file:// URL, and never touch the value otherwise.
function pluginUrl() {
  const raw = process.env.V4_PLUGIN
  if (!raw || !String(raw).trim()) return new URL('../vibe-math-v4/vibe-math-v4.js', import.meta.url)
  const s = String(raw).trim()
  if (/^file:/i.test(s)) return new URL(s)
  return pathToFileURL(fileURLToPath(new URL('file:///' + s.replace(/\\/g, '/'))))
}
const PLUGIN = pluginUrl()
// docs §10 item 10: the Lean prompt corpus is shipped under prompt-corpus-v4/ so a HUMAN can read
// the exact text the framework sends. V4_CORPUS_DIR overrides the destination (same convention v3
// and v5 use for V3_CORPUS_DIR / V5_CORPUS_DIR).
const HERE = dirname(fileURLToPath(import.meta.url))
const CORPUS_DIR = process.env.V4_CORPUS_DIR ? pathResolve(process.env.V4_CORPUS_DIR) : join(HERE, '..', 'prompt-corpus-v4')

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
// A host that exposes NO `subprocess` service at all (docs §7 → NO_SUBPROCESS, and §6 hard rule 4
// requires the injected guidance to name that code so the resident records a blocker instead of
// retrying forever).
let subprocessAvailable = true
// A stub host whose shell EXITS 0 WITHOUT deleting anything (a permissions quirk / a stub host).
// Used by §13 to prove the withdrawal is not a best-effort delete: the framework must confirm the
// file is gone through the fs service and fall back to overwriting it with a withdrawal notice.
let shellDeletesFiles = true
const leanRuns = []          // every spawn the framework made, for cwd/argv assertions
const terminated = []        // files whose handle the framework actively terminate()d (docs §7)
const shellCalls = []        // every platform-shell script (mkdir at mount, Remove-Item on defect)

function makeSubprocess() {
  return {
    async resolveExecutable(cmd) {
      if (!toolchainAvailable) throw new Error('spawn lean ENOENT')
      if (String(cmd) !== 'lean' && String(cmd) !== 'lake') throw new Error('unknown executable ' + cmd)
      return String(cmd)
    },
    spawn(spec) {
      // The preset drives the platform shell through this SAME `subprocess` service (runShell:
      // powershell / /bin/sh) for mkdir at mount, and — since docs §4.1 — for Remove-Item when a
      // `defect` retracts an archived proof. Handle it here so that retraction is a REAL filesystem
      // deletion, exactly as the real host performs it; otherwise "the proof file is gone" could
      // only be asserted against a mock's bookkeeping.
      const argv0 = String((spec.argv && spec.argv[0]) || '')
      if (/powershell|cmd\.exe|\/bin\/sh|(^|\/)sh$/i.test(argv0)) {
        const script = String(spec.argv[spec.argv.length - 1] || '')
        shellCalls.push(script)
        const m = script.match(/-LiteralPath\s+'((?:[^']|'')*)'/)
        if (shellDeletesFiles && /Remove-Item/.test(script) && m) rmSync(m[1].replace(/''/g, "'"), { force: true })
        if (shellDeletesFiles && /^rm -f /.test(script)) for (const q of script.slice(6).match(/'[^']*'/g) || []) rmSync(q.slice(1, -1), { force: true })
        return {
          done: Promise.resolve({ exitCode: 0, signal: null }),
          collected: { stdout: { readFrom: () => ({ text: '', nextOffset: 0, lossy: false }) }, stderr: { readFrom: () => ({ text: '', nextOffset: 0, lossy: false }) } },
          terminate() {},
        }
      }
      // The plugin passes an ABSOLUTE path as the last argv element, so resolve it directly; fall
      // back to scanning the argv for an existing .lean file (mirrors leanAbsPath).
      const last = spec.argv[spec.argv.length - 1]
      const file = existsSync(last) ? last : (spec.argv.find(a => /\.lean$/.test(String(a)) && existsSync(a)) || last)
      const text = existsSync(file) ? readFileSync(file, 'utf8') : ''
      const bad = /sorry|-- FAIL/.test(text)
      leanRuns.push({ argv: spec.argv.slice(), file, cwd: spec.cwd, graceMs: spec.graceMs, stdio: spec.stdio })
      // A HANG file never settles and never exits: the ONLY thing that can end it is the framework's
      // own timeout calling handle.terminate() (docs §7). Records each terminate so the suite can
      // assert the timeout path is ACTIVE, not merely reported.
      if (/-- HANG/.test(text)) {
        return {
          done: new Promise(() => {}),
          collected: { stdout: { readFrom: () => ({ text: '', nextOffset: 0, lossy: false }) }, stderr: { readFrom: () => ({ text: '', nextOffset: 0, lossy: false }) } },
          terminate() { terminated.push(file) },
        }
      }
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
  const listeners = {}, toolRegs = [], spawns = [], followups = [], cmdRegs = []
  const subprocess = makeSubprocess()
  let ROOT
  const ctx = {
    get(name) { return name === 'subprocess' && subprocessAvailable ? subprocess : undefined },
    on(e, fn) { (listeners[e] = listeners[e] || []).push(fn) },
    effect(fn) { const d = fn(); return () => { if (typeof d === 'function') d() } },
    logger: { info() {}, warn() {}, error() {} },
    timeout(cb, ms) { const h = setTimeout(cb, ms); return () => clearTimeout(h) },
    tools: { register(s) { toolRegs.push(s) } }, commands: { register(s) { cmdRegs.push(s) } },
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
    WS, ctx, toolRegs, spawns, followups, ROOT, projectRoot, vibeRoot, cmdRegs,
    /** Drive the registered `/v4` slash command — the OTHER parameter surface the spec §B names. */
    async cmd(rawInput) { const c = cmdRegs.find(x => x.name === 'v4'); if (!c) throw new Error('no /v4 command'); return await c.handler({ agent: ROOT, rawInput }) },
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
  // `leanAsync:false` on purpose: sections 1-16 assert the HISTORICAL SYNCHRONOUS contract
  // (lean_run returns exitCode/stdout in the same call, archive{run:true} compiles inline) verbatim.
  // The asynchronous contract (enqueue + settle + recovery) has its own sections 17+.
  await h.callTool('vibe_v4_set', { activityTimeoutMs: 600000, leanAsync: false })
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
/**
 * Start a verification and KEEP IT IN FLIGHT (the first half of `proposeAndVote`): record a card, have
 * r-1 propose verifying it, and stop driving as soon as the verify view is ACTIVE. Note the trap:
 * `verifyInProgress` is already true while the verification is merely QUEUED, so `consensus.kind`
 * is the only reliable "it is really running" signal.
 */
async function startVerifyOnly(h, target) {
  const card = { id: target, title: target, statement: '待验证对象 ' + target, prob: 0.8, value: 0.6, motivation: 'm' }
  await h.callTool('vibe_v4_record_proposition', card, h.resAgent(h.childOf('r-1')))
  const before = h.followups.length
  await h.callTool('vibe_v4_message', { to: 'r-1', content: '请处理本轮工作。' })
  for (let i = 0; i < 300 && h.followups.length === before; i++) await sleep(10)
  await drive(h, () => ({ summary: '提议验证 ' + target + '。', solved: false, propose_verify: target, contextPct: 20 }), async () => {
    const s = await h.callTool('vibe_v4_status', {})
    return !!(s.consensus && s.consensus.kind === 'verify')
  })
  return await h.callTool('vibe_v4_status', {})
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
  // `off` must not CREATE Lean state at all: the feature's durable record file must not appear
  // for a session that never used the feature (v3's suite pins the same invariant).
  assert(!existsSync(join(A.projectRoot, 'State', 'formal.json')), '★ off mode creates NO State/formal.json (a TRUE no-op, not just an empty record store)')
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

// ★ The mode switch must be REACHABLE THROUGH THE TOOL SCHEMA (2.3.2 defect D1) ──────────────
// Every tool schema here is closed (`additionalProperties:false`), so a key the schema does not
// advertise is REJECTED by any schema-validating provider. v3 shipped 2.3.0/2.3.1 with all four Lean
// parameters missing from the set-params schema while every assertion in this file stayed green —
// because the suite calls the handler DIRECTLY and never inspects the registered schema. The feature
// could not be switched on at all through the tool interface.
{
  const setSpec = A.toolRegs.find((t) => t.name === 'vibe_v4_set')
  assert(!!setSpec, "vibe_v4_set is registered")
  assert(setSpec.parameters && setSpec.parameters.type === 'object' && setSpec.parameters.additionalProperties === false,
    '★ vibe_v4_set publishes a CLOSED object schema (an unlisted key is rejected, so the schema IS the contract)')
  for (const k of ['formalVerify', 'leanCommand', 'leanArgs', 'leanTimeoutMs']) {
    assert(Object.prototype.hasOwnProperty.call(setSpec.parameters.properties, k),
      '★ the registered schema advertises ' + k + ' (every other surface documents it; a schema that omits it makes the switch unreachable)')
  }
  assert(JSON.stringify(setSpec.parameters.properties.formalVerify.enum) === JSON.stringify(['off', 'encourage', 'require']),
    'the schema narrows formalVerify to the three real modes (a typo must not be a fourth)')
}

// A stray `formal` reply in OFF mode must be INERT (finding #1): the reply contract does not offer
// the field there, so honouring it would contradict "off is a TRUE no-op". The TOOLS stay usable.
{
  await A.callTool('vibe_v4_record_proposition', { id: 'p-offreply', title: 'off', statement: '关模式下注入回执', prob: 0.8, value: 0.6, motivation: 'm' }, A.resAgent(A.childOf('r-1')))
  const wOffR = await workWake(A, 'r-1')
  A.fireEnd(wOffR.childId, { summary: '继续。', solved: false, contextPct: 20, formal: { target: 'p-offreply', decision: 'defect', note: '不应被记录' } })
  await sleep(80)
  const stOffReply = await A.callTool('vibe_v4_status', {})
  assert(stOffReply.formal.objects.length === 0, '★ a stray `formal` reply in off mode records NO formal object')
  assert(!existsSync(join(A.projectRoot, 'Formal', 'p-offreply.lean')), '★ and writes no formal working file')
  assert(!existsSync(join(A.projectRoot, 'Formal', 'TODO.md')) || !/p-offreply/.test(readIf(join(A.projectRoot, 'Formal', 'TODO.md'))), '★ and creates no TODO entry')
  assert(!existsSync(join(A.projectRoot, 'State', 'formal.json')), '★ and still no State/formal.json after the stray reply (the off-mode guard is a true no-op)')
}

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
// No `subprocess` service at all (docs §7): the run must degrade to a typed NO_SUBPROCESS result —
// never a thrown error into the scheduler — and an object it was asked to record must stay
// `attempted` (an un-runnable host must not mint a `passed` record).
{
  subprocessAvailable = false
  const noSub = await D.callTool('vibe_v4_lean_run', { file: 'Formal/good.lean', target: 'p-nosub' }, r1)
  assert(noSub.ok === false && noSub.code === 'NO_SUBPROCESS', '★ a host with no subprocess service returns NO_SUBPROCESS instead of crashing (got ' + noSub.code + ')')
  assert(/no subprocess service/.test(String(noSub.message || '')), 'the failure is readable (it explains that Lean cannot be executed here)')
  const stNoSub = await D.callTool('vibe_v4_status', {})
  assert(stNoSub.ok === true, 'the group did NOT crash on the missing service (status still answers)')
  const recNoSub = stNoSub.formal.objects.find((o) => o.target === 'p-nosub')
  assert(recNoSub && recNoSub.status === 'attempted' && !recNoSub.proof, '★ the object record stays honest: attempted (never passed) when nothing could be executed')
  subprocessAvailable = true
}
// A run that never finishes: the framework must ACTIVELY terminate it (docs §7) and still report a
// readable LEAN_TIMEOUT — relying on the host's own graceMs alone leaves the Lean process running.
{
  writeFileSync(join(D.projectRoot, 'Formal', 'hang.lean'), '-- HANG\ntheorem t : 1 = 1 := rfl\n', 'utf8')
  const t0 = Date.now()
  const runHang = await D.callTool('vibe_v4_lean_run', { file: 'Formal/hang.lean', timeout_ms: 1000 }, r1)
  const waited = Date.now() - t0
  assert(runHang.ok === false && runHang.code === 'LEAN_TIMEOUT' && runHang.timedOut === true, '★ a run that never finishes is reported as LEAN_TIMEOUT (got ' + runHang.code + ')')
  assert(terminated.some(f => /hang\.lean$/.test(String(f))), '★ the timeout path really calls handle.terminate() (docs §7) instead of leaving the Lean process running')
  assert(waited >= 900 && waited < 15000, 'the timeout waited for the cap before terminating (' + waited + 'ms)')
}

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
// A later run recorded against an ALREADY-passed object records the run but must never strip
// `passed`/`proof`: doing so would silently remove the fidelity branch from the next voting prompt
// AND (in `require`) re-close the gate on an object that already has a green archived proof.
{
  writeFileSync(join(D.projectRoot, 'Formal', 'p-proof.lean'), 'theorem p_proof : 1 = 2 := by sorry\n', 'utf8')
  const rerun = await D.callTool('vibe_v4_lean_run', { file: 'Formal/p-proof.lean', target: 'p-proof' }, r1)
  assert(rerun.ok === false, 'precondition: the recorded re-run is red')
  const rec = (await D.callTool('vibe_v4_status', {})).formal.objects.find(o => o.target === 'p-proof')
  assert(rec && rec.status === 'passed' && rec.proof === 'Verified/Lean/p-proof.lean',
    '★ a RED re-run never downgrades a `passed` record (docs §31.6: only an explicit re-archive decides) — the object keeps its fidelity prompt and its require-mode gate')
  writeFileSync(join(D.projectRoot, 'Formal', 'p-proof.lean'), 'theorem p_proof : 3 * 1 ^ 2 - 2 = (1:Nat) ^ 2 := by decide\n', 'utf8')
}
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
  assert(/一致 → verdict = 1/.test(prompt), "the fidelity instruction uses v4's REAL reply field name (`verdict`)")
  assert(/发现任何偏差，不要投 0/.test(prompt), '★ it forbids expressing a fidelity deviation as "0 / false"')
  assert(/偏差只说明\*\*形式化不合格\*\*，不代表命题为假/.test(prompt), '★ it states WHY: a defect is a failed formalization, not a refutation')
  assert(/formal:\{decision:'defect', note:'<具体偏差>'\}/.test(prompt), '★ it hands the voter the exact `defect` reply contract')
  assert(/降级为 attempted、删除归档证明、写入形式化待办/.test(prompt), 'it says what the framework WILL do with a defect (downgrade + delete + TODO)')
  assert(/只有当你\*\*独立于这份 Lean 代码\*\*也能确定命题为假时，才投 0/.test(prompt), 'only an INDEPENDENT refutation may be expressed as 0')
  assert(!/偏离 → 0/.test(prompt), '★ the old "a deviation ⇒ 0" wording is gone (it would fabricate a negative conclusion)')
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
// 12. the fidelity rule + the prompt hard requirements (docs §6, §10 items 9/11)
//     The v2 lesson (docs §10 item 8) is why every claim here is paired with a BEHAVIOURAL
//     assertion in §13/§14: wording alone guards nothing.
// ===============================================================
section('12 the injected text states the fidelity rule and never abbreviates a tool name')
const G = await establish()
await G.callTool('vibe_v4_set', { formalVerify: 'encourage' })
{
  const enc = await G.prompts('verify', 'r-1', { target: 'p-text', stage: 'independent' })
  assert(/【Lean 形式化验证（鼓励模式）】/.test(enc), 'the encourage voting prompt keeps its header')
  assert(/实现难度/.test(enc), 'it still asks for the implementation-difficulty judgement')
  assert(/工具：vibe_v4_lean_run（执行\/入队）· vibe_v4_lean_archive（归档）· vibe_v4_lean_lib（查已有可复用库与 jobs）· vibe_v4_lean_read（读归档原文逐字复用）/.test(enc), 'it names all FOUR tools in FULL (the new read-only tool included)')
  assert(/归档可复用定义\/引理前先跑通（vibe_v4_lean_archive run=true 或先 vibe_v4_lean_run）；跑不通不要入库。/.test(enc), '★ a reusable definition/lemma must be RUN GREEN before it is archived')
  assert(/宿主没有 Lean 工具链（LEAN_NOT_FOUND）或根本没有 subprocess 服务（NO_SUBPROCESS）时：把代码写下来归档，并在回执的 note 里写明"宿主无 Lean 工具链"/.test(enc), '★ both unavailable-toolchain paths are written out (missing Lean OR no subprocess service) as explicit blocker reasons')
  assert(/一旦 Lean 通过，你唯一需要确认的就是忠实性/.test(enc), 'a green Lean run still shrinks the open question to fidelity')
  assert(/decision='blocked' 时必须写明 note/.test(enc), 'the encourage opt-out documents the mandatory note')
  assert(!/偏离 → 0/.test(enc) && !/发现任何偏离/.test(enc), '★ no "deviation ⇒ 0" instruction anywhere in the encourage block')
  await G.callTool('vibe_v4_set', { formalVerify: 'require' })
  const req = await G.prompts('verify', 'r-1', { target: 'p-text', stage: 'independent' })
  assert(/【Lean 形式化验证（强制模式）】/.test(req), 'the require voting prompt says 强制模式')
  assert(/必须产出 Lean 形式化/.test(req) && /必须\*\*给出显式的阻塞原因/.test(req), "'require' states the formalization OR an explicit blocker is mandatory")
  assert(/本次裁定不会生效/.test(req) && /进入「形式化待办」/.test(req), 'it warns the verdict is withheld as 未定论 (formal-required)')
  assert(!/可以不做/.test(req), "'require' does NOT offer the encourage-mode opt-out")
  assert(/归档可复用定义\/引理前先跑通/.test(req) && /宿主没有 Lean 工具链/.test(req), 'the run-before-archive and toolchain rules are in the require text as well')
  assert(/LEAN_NOT_FOUND/.test(req) && /NO_SUBPROCESS/.test(req), '★ the require text names BOTH unavailable-toolchain codes (the escape route must be documented in every mode)')
  // The sentence is written ONCE and reused by both modes: a second copy would drift (one branch
  // kept up to date, the other stale). The anchor `（LEAN_NOT_FOUND）` therefore occurs exactly once
  // in the plugin, which is also what the sensitivity probe table assumes.
  {
    const src = readFileSync(fileURLToPath(PLUGIN), 'utf8')
    assert(src.split('（LEAN_NOT_FOUND）').length - 1 === 1, '★ the unavailable-toolchain guidance is written once (not duplicated per mode/branch)')
    assert(src.split('（NO_SUBPROCESS）').length - 1 === 1, 'the same single sentence names NO_SUBPROCESS (no per-branch copy)')
  }
  assert(/\*\*本模式要求\*\*/.test(req), 'the require bullet replaces the encourage opt-out in place')
  // normal / heartbeat / post-compact recap all carry the standing work line; the two that ARE a
  // reply contract also document the `defect` decision (coreRules is a recap prefix, not a contract)
  for (const [label, text] of [['normal', await G.prompts('normal', 'r-1')], ['heartbeat', await G.prompts('heartbeat', 'r-1')], ['coreRules', await G.prompts('coreRules', 'r-1')]]) {
    assert(/【顺手形式化（强制）】/.test(text), label + ': the standing formalization line uses the require wording')
    assert(/归档前先跑通（vibe_v4_lean_run 或 run=true）；跑不通的定义不要进可复用库。/.test(text), label + ': ★ it requires a green run before archiving a reusable definition')
    if (label !== 'coreRules') assert(/"decision":"used\|blocked\|defect"/.test(text), label + ': the reply contract documents the `defect` decision')
  }
  assert(/"decision":"used\|blocked\|defect"/.test(req) && /具体偏差/.test(req), '★ the voting reply contract documents decision=defect and its note')
}
{
  // ---- the sweep: EVERY agent-facing string must spell the three tools in full (docs §6-1) ----
  const scanned = []
  const addText = (label, t) => { if (typeof t === 'string' && t) scanned.push({ label, text: t }) }
  addText('captured run prompts', G.allPrompts())
  for (const which of ['brainstorm', 'normal', 'heartbeat', 'coreRules']) addText(which, await G.prompts(which, 'r-1'))
  for (const t of ['p-text', 'p-corpus']) for (const st of ['independent', 'debate']) addText('verify:' + t + ':' + st, await G.prompts('verify', 'r-1', { target: t, stage: st }))
  // tool hints are injected text too (docs §6 hard requirement 1 names them explicitly)
  const r1G = G.resAgent(G.childOf('r-1'))
  const hintGreen = await G.callTool('vibe_v4_lean_archive', { kind: 'proof', target: 'p-hint', content: 'theorem p_hint : 1 = 1 := rfl\n' }, r1G)
  assert(hintGreen.ok === true && hintGreen.passed === true, 'precondition: a green file exists for the hint sweep')
  const hintRed = await G.callTool('vibe_v4_lean_archive', { kind: 'proof', target: 'p-hint-red', content: 'theorem p_hint_red : 1 = 2 := by sorry\n' }, r1G)
  assert(hintRed.ok === true && hintRed.passed === false, 'precondition: a red file exists for the hint sweep')
  addText('lean_run hint (green)', (await G.callTool('vibe_v4_lean_run', { file: 'Formal/p-hint.lean' }, r1G)).hint)
  addText('lean_run hint (red)', (await G.callTool('vibe_v4_lean_run', { file: 'Formal/p-hint-red.lean' }, r1G)).hint)
  addText('lean_lib hint', (await G.callTool('vibe_v4_lean_lib', {}, r1G)).hint)
  toolchainAvailable = false
  addText('LEAN_NOT_FOUND message', (await G.callTool('vibe_v4_lean_run', { file: 'Formal/p-hint.lean' }, r1G)).message)
  toolchainAvailable = true
  for (const t of G.toolRegs.filter((x) => /lean/.test(x.name))) addText('tool description ' + t.name, t.description)
  // The activity log is agent/host-readable text too (vibe_v4_report exposes `recentActivity`, and
  // a host reads it out to the group): a bare abbreviation there names a tool that does not exist,
  // for exactly the same reason as in a prompt.
  try {
    const log = JSON.parse(readIf(join(G.projectRoot, 'State', 'session.json')) || '{}').activityLog || []
    for (const e of log) addText('activity log: ' + e.event, String((e && e.detail) || ''))
  } catch (e) { /* the log is best-effort */ }
  const bare = [/(^|[^a-z_])lean_run/, /(^|[^a-z_])lean_archive/, /(^|[^a-z_])lean_lib/]
  const offenders = []
  for (const s of scanned) for (const re of bare) if (re.test(s.text)) offenders.push(s.label + ' :: ' + re.source)
  assert(offenders.length === 0, '★ no injected text (prompt, tool hint or tool description) uses a bare tool abbreviation (' + offenders.slice(0, 3).join(' | ') + ')')
  assert(scanned.length >= 15, 'the sweep really covered the injected-text surface (' + scanned.length + ' texts)')
}
{
  // docs §4.1-3 / §6.1: the fidelity branch's "the framework withholds the verdict" clause may only
  // appear in `require` (the only mode with a gate). In `encourage` the framework still withdraws
  // the proof and records the TODO, but it CANNOT hold the ballot — so the text must not promise
  // that, and must instead point at the voter's own abstention.
  await G.callTool('vibe_v4_set', { formalVerify: 'require' })
  const reqFid = await G.prompts('verify', 'r-1', { target: 'p-hint', stage: 'independent' })
  assert(/该对象已有\*\*通过的 Lean 形式化证明\*\*/.test(reqFid), 'precondition: p-hint is the passed/fidelity case in this prompt')
  assert(/本次裁定\*\*不定论\*\*/.test(reqFid), "'require' fidelity text states the verdict will be withheld (it has a gate)")
  await G.callTool('vibe_v4_set', { formalVerify: 'encourage' })
  const encFid = await G.prompts('verify', 'r-1', { target: 'p-hint', stage: 'independent' })
  assert(!/本次裁定\*\*不定论\*\*/.test(encFid), "★ 'encourage' does NOT promise a hold it cannot enforce (docs §4.1-3)")
  assert(/本档没有门禁/.test(encFid) && /弃权值/.test(encFid), "★ instead it says the voter's own abstention is what keeps the ballot from concluding")
  assert(/降级为 attempted、删除归档证明、写入形式化待办/.test(encFid), 'the withdrawal the framework CAN enforce is still stated in both modes')
  assert(/发现任何偏差，不要投 0/.test(encFid), 'the fidelity rule itself is mode-independent')
  await G.callTool('vibe_v4_set', { formalVerify: 'require' })
}

// ===============================================================
// 13. the `defect` reply channel (docs §4.1 / §10 item 8) — BEHAVIOURAL, not wording
// ===============================================================
section('13 the `defect` reply withdraws a passing proof (spec §4.1)')
await G.callTool('vibe_v4_set', { formalVerify: 'encourage' })
const activityOf = (h) => { try { return JSON.parse(readIf(join(h.projectRoot, 'State', 'session.json')) || '{}').activityLog || [] } catch (e) { return [] } }
const g1 = G.resAgent(G.childOf('r-1'))
{
  const arc = await G.callTool('vibe_v4_lean_archive', { kind: 'proof', target: 'p-defect', content: 'theorem p_defect : 2 + 2 = 4 := by decide\n' }, g1)
  assert(arc.passed === true && existsSync(join(G.projectRoot, 'Verified', 'Lean', 'p-defect.lean')), 'precondition: p-defect has a green archived proof')
  const w = await workWake(G, 'r-1')
  G.fireEnd(w.childId, { summary: '我逐条核对了 Lean 代码，发现偏差。', formal: { target: 'p-defect', decision: 'defect', note: 'Lean 里的条件比命题弱：只证了 n ≥ 1 的情形' }, contextPct: 20 })
  await sleep(90)
  const st = await G.callTool('vibe_v4_status', {})
  const rec = st.formal.objects.find((o) => o.target === 'p-defect')
  assert(rec && rec.status === 'attempted', '★ a `formal.decision=defect` reply downgrades the object to attempted (never a refutation)')
  assert(rec && rec.proof === '', '★ the archived proof is cleared from the record')
  assert(rec && rec.note === 'Lean 里的条件比命题弱：只证了 n ≥ 1 的情形', 'the concrete deviation is stored as the record note')
  assert(!existsSync(join(G.projectRoot, 'Verified', 'Lean', 'p-defect.lean')), '★ the archived proof file is DELETED (the formalization is 不合格 — the proposition is NOT false)')
  assert(existsSync(join(G.projectRoot, 'Formal', 'p-defect.lean')), 'the WORKING file is kept — the code is not lost, only its "passed" claim')
  assert(st.formal.passed.indexOf('p-defect') === -1, 'the object is no longer reported as Lean-passed')
  assert(shellCalls.some((c) => /Remove-Item|^rm -f/.test(c) && /p-defect\.lean/.test(c)), 'the withdrawal really went through the platform shell (the fs service has no delete)')
  const todo = readIf(join(G.projectRoot, 'Formal', 'TODO.md'))
  assert(/p-defect/.test(todo) && /formal-defect/.test(todo), '★ Formal/TODO.md lists the object with the DEFECT reason')
  assert(/只证了 n ≥ 1 的情形/.test(todo), '★ the concrete deviation reaches the human-readable TODO')
  const idx = readIf(join(G.projectRoot, 'Formal', 'Index.md'))
  assert(/\| p-defect \| attempted \|/.test(idx), 'Formal/Index.md downgrades the object to attempted')
  assert(/只证了 n ≥ 1 的情形/.test(idx), 'the deviation is the record note in the index')
  assert(activityOf(G).some((e) => /忠实性缺陷/.test(e.detail) && /p-defect/.test(e.detail)), '★ the retraction is announced in the activity log')
  // the log line is agent/host-readable text, so it is bound by the same §4.1-3 rule as the prompt:
  // in `encourage` it may not claim a hold the mode does not have.
  {
    const line = activityOf(G).filter((e) => /忠实性缺陷/.test(e.detail) && /p-defect[^-]/.test(e.detail)).pop() || { detail: '' }
    assert(/本档没有门禁/.test(line.detail) && !/本次裁定\*\*不定论\*\*/.test(line.detail), "★ the encourage-mode activity line does not promise the 不定论 hold that only `require` enforces")
  }
}
{
  // §4.1 degraded withdrawal: the record must never be the ONLY thing withdrawn. A host whose shell
  // "succeeds" without deleting (a stub host / a permissions quirk) must be caught by re-reading the
  // file through the fs service, and the archive must then be OVERWRITTEN with a withdrawal notice —
  // otherwise the retracted proof keeps sitting at the exact path everyone looks for the proof.
  const arcD = await G.callTool('vibe_v4_lean_archive', { kind: 'proof', target: 'p-defect-degraded', content: 'theorem p_defect_degraded : 5 = 5 := rfl\n' }, g1)
  assert(arcD.passed === true && existsSync(join(G.projectRoot, 'Verified', 'Lean', 'p-defect-degraded.lean')), 'precondition: the degraded-path object has a green archived proof')
  shellDeletesFiles = false
  const wD = await workWake(G, 'r-1')
  G.fireEnd(wD.childId, { summary: '核对后发现偏差。', formal: { target: 'p-defect-degraded', decision: 'defect', note: '结论方向相反' }, contextPct: 20 })
  await sleep(90)
  shellDeletesFiles = true
  const body = readIf(join(G.projectRoot, 'Verified', 'Lean', 'p-defect-degraded.lean'))
  assert(!/p_defect_degraded/.test(body), '★ a shell that exits 0 without deleting does NOT leave the retracted proof readable — its original text is gone')
  assert(/已撤回/.test(body) && /原代码保留在工作文件/.test(body), '★ the archived file was OVERWRITTEN with an explicit withdrawal notice instead (delete → confirm → overwrite)')
  const recD = (await G.callTool('vibe_v4_status', {})).formal.objects.find((o) => o.target === 'p-defect-degraded')
  assert(recD && recD.status === 'attempted' && recD.proof === '', 'the record is downgraded on the degraded path too')
  assert(activityOf(G).some((e) => /覆盖归档证明/.test(e.detail) && /p-defect-degraded/.test(e.detail)), '★ the activity log says WHICH withdrawal path was taken (overwritten, not silently reported as deleted)')
}
{
  const arc2 = await G.callTool('vibe_v4_lean_archive', { kind: 'proof', target: 'p-defect2', content: 'theorem p_defect2 : 3 + 3 = 6 := by decide\n' }, g1)
  assert(arc2.passed === true, 'precondition: p-defect2 is Lean-passed')
  const w2 = await workWake(G, 'r-2')
  G.fireEnd(w2.childId, { summary: '有偏差，但没写清是什么。', formal: { target: 'p-defect2', decision: 'defect' }, contextPct: 20 })
  await sleep(90)
  const st2 = await G.callTool('vibe_v4_status', {})
  const rec2 = st2.formal.objects.find((o) => o.target === 'p-defect2')
  assert(rec2 && rec2.status === 'passed' && rec2.proof === 'Verified/Lean/p-defect2.lean', '★ a `defect` reply WITHOUT a note is REJECTED — the record is untouched')
  assert(existsSync(join(G.projectRoot, 'Verified', 'Lean', 'p-defect2.lean')), '★ and the archived proof is NOT withdrawn')
  assert(activityOf(G).some((e) => /defect/.test(e.detail) && /V4_INVALID_ARGUMENT/.test(e.detail)), '★ the rejection carries the preset error code (V4_INVALID_ARGUMENT), not a silent drop')
  assert((await G.callTool('vibe_v4_status', {})).ok === true, 'the refusal did not crash the run')
}
{
  const blk = await G.callTool('vibe_v4_lean_archive', { kind: 'blocked', target: 'p-defect3', note: '前置知识未形式化，本轮不做' }, g1)
  assert(blk.ok === true && blk.status === 'blocked', 'precondition: p-defect3 carries a reasoned blocker record')
  const w3 = await workWake(G, 'r-1')
  G.fireEnd(w3.childId, { summary: '复核后发现归档的形式化换了对象。', formal: { target: 'p-defect3', decision: 'defect', note: '归档的形式化证的是特例，换了对象' }, contextPct: 20 })
  await sleep(90)
  const st3 = await G.callTool('vibe_v4_status', {})
  const rec3 = st3.formal.objects.find((o) => o.target === 'p-defect3')
  assert(rec3 && rec3.status === 'attempted', '★ `defect` downgrades even a `blocked` record (spec §4.1: ALWAYS downgrade)')
  assert(st3.formal.blocked.indexOf('p-defect3') === -1, '★ a bad formalization may not stay in the gate-passing `blocked` state')
}

// ===============================================================
// 14. `require` after a defect: the retraction closes the gate (docs §4.1-3 / §10 item 9)
// ===============================================================
// 13b. a plain `used` judgement must NOT withdraw an ESTABLISHED proof (contract §4): only a
// fidelity defect retracts one. v2 shipped the unconditional downgrade and silently re-closed the gate.
section('13b a \`used\` reply must NOT downgrade an already-passed object')
{
  const arcU = await G.callTool('vibe_v4_lean_archive', { kind: 'proof', target: 'p-usedkeep', content: 'theorem p_usedkeep : 2 + 2 = 4 := by decide\n' }, g1)
  assert(arcU.passed === true && existsSync(join(G.projectRoot, 'Verified', 'Lean', 'p-usedkeep.lean')), 'used-keep: the object starts with a green archived proof')
  const wU = await workWake(G, 'r-1')
  G.fireEnd(wU.childId, { summary: '这一轮只是又写了一遍草稿。', formal: { target: 'p-usedkeep', decision: 'used', file: 'Formal/p-usedkeep.lean' }, contextPct: 20 })
  await sleep(90)
  const stU = await G.callTool('vibe_v4_status', {})
  const recU = stU.formal.objects.find((o) => o.target === 'p-usedkeep')
  assert(!!recU && recU.status === 'passed', '★ a `used` reply does NOT downgrade an already-passed object (got ' + JSON.stringify(recU) + ')')
  assert(!!recU && recU.proof === 'Verified/Lean/p-usedkeep.lean', '★ and the proof pointer survives the reply')
  assert(existsSync(join(G.projectRoot, 'Verified', 'Lean', 'p-usedkeep.lean')), '★ and the archived proof is still on disk')
  assert(stU.formal.passed.indexOf('p-usedkeep') !== -1, '★ status still reports it as Lean-passed')
  const rerunU = await G.callTool('vibe_v4_lean_run', { file: 'Formal/p-usedkeep.lean', target: 'p-usedkeep' }, g1)
  assert(rerunU.ok === true, 'used-keep: the work file runs green')
  const recU2 = (await G.callTool('vibe_v4_status', {})).formal.objects.find((o) => o.target === 'p-usedkeep')
  assert(!!recU2 && recU2.status === 'passed', '★ a plain re-run does not downgrade a passed record (contract §4)')
}

section("14 'require' withholds the verdict after a defect, even on a unanimous 1")
const H = await establish()
await H.callTool('vibe_v4_set', { formalVerify: 'require' })
{
  const h1 = H.resAgent(H.childOf('r-1'))
  const arc = await H.callTool('vibe_v4_lean_archive', { kind: 'proof', target: 'p-defect-req', content: 'theorem p_defect_req : 4 * 1 ^ 2 - 2 = (1:Nat) ^ 2 := by decide\n' }, h1)
  assert(arc.passed === true, 'precondition: p-defect-req is Lean-passed')
  const before = await H.prompts('verify', 'r-1', { target: 'p-defect-req', stage: 'independent' })
  assert(/不要投 0/.test(before) && /formal:\{decision:'defect'/.test(before), 'the voter is told (before voting) how to report a fidelity defect')
  await H.callTool('vibe_v4_record_proposition', { id: 'p-defect-req', title: '缺陷不是证伪', statement: '形式化写窄了不代表命题为假', prob: 0.9, value: 0.6, motivation: 'm' }, h1)
  const n0 = H.followups.length
  await H.callTool('vibe_v4_message', { to: 'r-1', content: '请处理本轮工作。' })
  for (let i = 0; i < 300 && H.followups.length === n0; i++) await sleep(10)
  // r-1 reports the defect AND votes 1 in the SAME reply; r-2 votes 1. The framework must NOT take
  // the unanimous 1: the formalization was just retracted, so the verdict has to be deferred.
  const replyFor = (pt, rId) => (/团队验证/.test(pt)
    ? (rId === 'r-1'
      ? { vote: { verdict: 1, reason: '我发现形式化写窄了，但独立看命题仍为真' }, formal: { target: 'p-defect-req', decision: 'defect', note: 'Lean 只证了 x=1 的特例，命题要求所有整数 x' } }
      : { vote: { verdict: 1, reason: '独立复核为真' } })
    : { summary: '提议验证 p-defect-req。', solved: false, propose_verify: 'p-defect-req', contextPct: 20 })
  for (let i = 0; i < 4; i++) { await drive(H, replyFor, verifySettled(H)); if (await verifySettled(H)()) break }
  const st = await H.callTool('vibe_v4_status', {})
  assert(st.verifyInProgress === false && st.pendingVerify === null, 'the verification actually settled (so the next assertion is falsifiable)')
  assert(!existsSync(join(H.projectRoot, 'Verified', '命题', 'p-defect-req.md')), '★ a defect in `require` mode writes NO Verified card, even with a unanimous 1')
  assert(st.formal.todo.indexOf('p-defect-req') !== -1, '★ the object stays 未定论 on the formalization TODO')
  const rec = st.formal.objects.find((o) => o.target === 'p-defect-req')
  assert(rec && rec.status === 'attempted' && rec.proof === '', 'the formal record is the retracted one (attempted, no proof)')
  assert(rec && /只证了 x=1 的特例/.test(rec.note || ''), "the record's note is the reported deviation")
  assert(!existsSync(join(H.projectRoot, 'Verified', 'Lean', 'p-defect-req.lean')), '★ the archived proof was withdrawn as part of the retraction')
  assert(!/已验证·真/.test(readIf(join(H.projectRoot, 'Propos', 'r-1', 'p-defect-req.md'))), 'the source card was NOT rewritten to 已验证·真 (the conclusion was withheld, not taken)')
  assert(!/已验证·真/.test(readIf(join(H.projectRoot, 'Shared', 'debates', 'p-defect-req.md'))), 'the debate record does not claim a 真 conclusion')
  const todo = readIf(join(H.projectRoot, 'Formal', 'TODO.md'))
  assert(/p-defect-req/.test(todo) && /formal-defect/.test(todo), '★ the TODO keeps the DEFECT reason, not merely formal-required')
  assert(/只证了 x=1 的特例/.test(todo), 'the concrete deviation is what a human reads in the TODO')
}

// ===============================================================
// 15. the shipped Lean prompt corpus (docs §10 item 10) — a HUMAN must be able to re-read the
//     exact text, not just the assertions about it.
// ===============================================================
section('15 the captured Lean prompt corpus is written for human review')
const K = await establish()
{
  const vibe = K.vibeRoot
  // Normalise BOTH slash forms, and the VibeMath root FIRST: it sits INSIDE the workspace, so
  // replacing the workspace first would leave `<WS>/VibeMath` instead of `<VIBEMATH>`.
  const scrub = (s) => String(s == null ? '' : s)
    .split(vibe).join('<VIBEMATH>').split(vibe.replace(/\\/g, '/')).join('<VIBEMATH>')
    .split(K.WS).join('<WS>').split(K.WS.replace(/\\/g, '/')).join('<WS>')
    // `propose_task` mints `t-<8 hex>` from Math.random (vibe-math-v4.js:1317 + shortId :2582).
    // The task-frame entry embeds that id, so without this the SHIPPED corpus changed on every
    // run (AUDIT-CHECKLIST §2.4: two consecutive runs must hash identically) and `git status`
    // always showed prompt-corpus-v4/* as modified. Normalise it like the machine paths.
    .replace(/\bt-[0-9a-f]{8}\b/g, '<TASKID>')
  const corpus = []
  const add = (kind, label, prompt) => corpus.push({ kind, label, prompt: scrub(prompt) })
  // (a) off: a TRUE no-op must be visible in the corpus, not merely asserted
  add('verify', 'off/verify', await K.prompts('verify', 'r-1', { target: 'p-corpus', stage: 'independent' }))
  add('work', 'off/normal', await K.prompts('normal', 'r-1'))
  // (b) encourage
  await K.callTool('vibe_v4_set', { formalVerify: 'encourage' })
  add('verify', 'encourage/verify', await K.prompts('verify', 'r-1', { target: 'p-corpus', stage: 'independent' }))
  const encNormal = await K.prompts('normal', 'r-1')
  add('work', 'encourage/normal', encNormal)
  add('work', 'encourage/heartbeat', await K.prompts('heartbeat', 'r-1'))
  add('work', 'encourage/coreRules', await K.prompts('coreRules', 'r-1'))
  // (c) require
  await K.callTool('vibe_v4_set', { formalVerify: 'require' })
  add('verify', 'require/verify', await K.prompts('verify', 'r-1', { target: 'p-corpus', stage: 'independent' }))
  add('verify', 'require/verify/debate', await K.prompts('verify', 'r-1', { target: 'p-corpus', stage: 'debate' }))
  add('work', 'require/normal', await K.prompts('normal', 'r-1'))
  // (d) a PASSED object: the review subject has changed to fidelity
  const k1 = K.resAgent(K.childOf('r-1'))
  await K.callTool('vibe_v4_lean_archive', { kind: 'proof', target: 'p-corpus-passed', content: 'theorem p_corpus_passed : 1 + 1 = 2 := by decide\n' }, k1)
  const fid = await K.prompts('verify', 'r-1', { target: 'p-corpus-passed', stage: 'independent' })
  add('verify', 'passed/fidelity', fid)
  // (d2) the SAME passed object in `encourage`: the promise must shrink to what that mode enforces
  // (docs §4.1-3: no gate there, so no claim that the framework withholds the verdict).
  await K.callTool('vibe_v4_set', { formalVerify: 'encourage' })
  const fidEnc = await K.prompts('verify', 'r-1', { target: 'p-corpus-passed', stage: 'independent' })
  add('verify', 'passed/fidelity (encourage)', fidEnc)
  await K.callTool('vibe_v4_set', { formalVerify: 'require' })
  // (e) a BLOCKED object
  await K.callTool('vibe_v4_lean_archive', { kind: 'blocked', target: 'p-corpus-blocked', note: '需要未形式化的解析数论框架' }, k1)
  add('verify', 'blocked/verify', await K.prompts('verify', 'r-1', { target: 'p-corpus-blocked', stage: 'independent' }))
  // (f) the `formal` reply contract line itself (the field whose parsing §13/§14 prove)
  const contractLine = (t) => { const m = String(t).match(/"formal":\{[^\n]*\}\}/); return m ? m[0] : '' }
  add('contract', 'formal reply contract (voting prompt)', contractLine(fid))
  add('contract', 'formal reply contract (work prompt)', contractLine(encNormal))
  // (g) a REAL delivered work wake (proves the builder is the one actually used to address a resident)
  const w = await workWake(K, 'r-2')
  add('work', 'require/real work wake', promptOf(w))
  K.fireEnd(w.childId, { summary: '继续推进。', solved: false, contextPct: 20 })
  await sleep(40)
  // (h) the tool hints are injected text too (docs §6 hard requirement 1)
  add('hint', 'lean_run hint (green)', (await K.callTool('vibe_v4_lean_run', { file: 'Formal/p-corpus-passed.lean' }, k1)).hint)
  add('hint', 'lean_lib hint', (await K.callTool('vibe_v4_lean_lib', {}, k1)).hint)
  // (i) ── THE NON-FORMAL SURFACES (audit M6/F15) ─────────────────────────────────────────────
  // The corpus used to cover ONLY Lean/formal variants, so the meeting prompt — this preset's ONLY
  // group-chat / task-allocation / stop-vote carrier — and every message frame had NO reviewable
  // artefact at all: a defect in `meetingPrompt` (e.g. its stop-vote contract) could not be read by
  // a human reviewer. These entries close that gap. `st` is passed explicitly so the capture does
  // not depend on the scheduler's state, and both the meeting's two perspectives (first speaker with
  // no prior speech / a later speaker seeing a relayed contribution) are captured.
  {
    const st = {
      id: 'mt-corpus', agenda: '分工与是否需要验证', type: 'general', targetId: null, round: 0, asked: [], order: ['r-1', 'r-2'],
      inputs: { 'r-1': { input: '我建议先验证 p-corpus，并认领引理 A 的整理。', voteSolved: false, propose_verify: 'p-corpus', propose_task: '整理引理 A', task_desc: '把已有引理写成可复用形式', claim_task: null } },
      transcript: [], at: Date.now(), lastInputAt: Date.now(),
    }
    add('meeting', 'meeting/first speaker (no prior speech)', await K.prompts('meeting', 'r-2', { meeting: { agenda: st.agenda, type: st.type, inputs: {}, order: st.order } }))
    add('meeting', 'meeting/later speaker (others relayed)', await K.prompts('meeting', 'r-2', { meeting: st }))
  }
  // (i) ── the private-message frame ──────────────────────────────────────────────────────────────
  // A resident reads a message in TWO shapes, and both must be reviewable:
  //   · `[MESSAGE from <sender>] <content>` — the frame `deliverNextMailbox` prepends when it wakes an
  //     idle recipient with a QUEUED message (captured here from a REAL delivery, not re-typed);
  //   · `[<sender>] <content>` — the inbox line every prompt's "New items:" block renders.
  // r-1 is put in flight first (a message to an IDLE resident is delivered immediately as its own
  // wake instead of queueing), so the second message is queued and the prompt shows the inbox line.
  {
    const before = K.followups.length
    await K.callTool('vibe_v4_message', { to: 'r-1', content: '先做一轮常规工作。' })
    for (let i = 0; i < 200 && K.followups.length === before; i++) await sleep(10)
    const inFlight = K.followups[K.followups.length - 1]
    assert(!!inFlight, 'corpus: r-1 is in flight so the next message is QUEUED (mailbox frame prerequisite)')
    await K.callTool('vibe_v4_message', { to: 'r-1', content: '请优先核对引理 B 的假设条件。' })
    add('work', 'normal + queued inbox line ([<sender>] content)', await K.prompts('normal', 'r-1'))
    K.fireEnd(inFlight.childId, { summary: '推进。', solved: false, input: '我对引理 B 的假设有异议：需要 n≥1。', contextPct: 20 })
    await sleep(60)
  }
  // the REAL delivery frames. A message that arrives while its recipient is idle is delivered as a
  // wake whose body is `<ordinary round>\n\n[MESSAGE from <sender>]\n<content>`, and a message that
  // was relayed by a teammate (`relayToGroup` posts it with the sender's own id and the `[群聊]`
  // prefix — the exact same `postMessage` path the human messenger uses) renders as `[群聊] …`.
  // Each frame is captured from a REAL delivery on its own host, so the corpus text is generated by
  // the code under review rather than re-typed here.
  const deliveredFrame = async (content, sender) => {
    const L = await establish()
    await L.callTool('vibe_v4_set', { activityTimeoutMs: 600000 })   // keep the heartbeat out of the way
    const before = L.followups.length
    await (sender === 'facilitator'
      ? L.callTool('vibe_v4_message', { to: 'r-1', content })
      : L.callTool('vibe_v4_send_message', { to: 'r-1', content }, L.resAgent(L.childOf(sender))))
    let hit = null
    for (let i = 0; i < 300 && !hit; i++) { hit = L.followups.slice(before).find((f) => /\[(NEW )?MESSAGE from /.test(promptOf(f))) || null; if (!hit) await sleep(10) }
    assert(!!hit, 'corpus: a real delivery wake carrying "' + content.slice(0, 16) + '…" was produced (saw ' + L.followups.slice(before).map((f) => promptOf(f).slice(-90).replace(/\n/g, ' ')).join(' | ') + ')')
    if (hit) L.fireEnd(hit.childId, { summary: '收到。', solved: false, contextPct: 20 })
    await sleep(30)
    return hit ? promptOf(hit) : ''
  }
  add('work', 'normal + delivered message frame ([NEW MESSAGE from ...])', await deliveredFrame('请优先核对引理 B 的假设条件。', 'facilitator'))
  // the group-chat frame: the recipient's inbox line for a message RELAYED by a teammate
  // (`relayToGroup` pushes `[群聊] <text>` into every other resident's mailbox with the speaker's own
  // id, and the next delivery renders `[<sender>] [群聊] <text>` — the same `postMessage` path, run
  // with the sender the resident actually sees). Deterministic on the same host: the speaker's own
  // end handler is what triggers the relay, and reading the recipient's next prompt shows it.
  {
    const L = await establish()
    await L.callTool('vibe_v4_set', { activityTimeoutMs: 600000 })
    const before = L.followups.length
    await L.callTool('vibe_v4_message', { to: 'r-2', content: '先做一轮常规工作。' })
    for (let i = 0; i < 300 && L.followups.length === before; i++) await sleep(10)
    const speaker = L.followups[L.followups.length - 1]
    assert(!!speaker, 'corpus: the relaying resident is in flight')
    const mark = L.followups.length
    L.fireEnd(speaker.childId, { summary: '推进。', solved: false, input: '我对引理 B 的假设有异议：需要 n≥1。', contextPct: 20 })
    let relay = null
    for (let i = 0; i < 300 && !relay; i++) { relay = L.followups.slice(mark).find((f) => /群聊/.test(promptOf(f))) || null; if (!relay) await sleep(10) }
    assert(!!relay, 'corpus: the relayed group-chat message was really delivered (saw ' + L.followups.slice(mark).map((f) => promptOf(f).slice(-90).replace(/\n/g, ' ')).join(' | ') + ')')
    add('work', 'normal + group-chat frame ([群聊])', relay ? promptOf(relay) : '')
    if (relay) L.fireEnd(relay.childId, { summary: '收到。', solved: false, contextPct: 20 })
    await sleep(30)
  }
  // the task-claim frame. The task is claimed while its claimer is idle, so the claim wake carries
  // `[YOU CLAIMED TASK …]`; the corpus entry is the ordinary round plus that exact frame.
  {
    const pt = await K.callTool('vibe_v4_propose_task', { title: '核对引理 B 的假设', description: '确认 n≥1 是否必要' })
    assert(pt.ok === true && !!pt.id, 'corpus: a task was proposed for the task-frame entry')
    const claimed = await K.callTool('vibe_v4_claim_task', { id: pt.id }, k1)
    add('work', 'task frame ([YOU CLAIMED TASK ...])', claimed.ok === true ? (await K.prompts('normal', 'r-1')) + '\n\n[YOU CLAIMED TASK ' + pt.id + '] 核对引理 B 的假设 — 确认 n≥1 是否必要' : '')
  }

  // The corpus is REGENERATED on every run. Dumping it while V4_PLUGIN points at a MUTATED copy
  // would let a sensitivity probe overwrite the SHIPPED corpus with mutated text (the probe's job
  // is to run this suite against a broken plugin), so the dump is skipped then — unless the probe
  // explicitly redirects it with V4_CORPUS_DIR. The IN-MEMORY corpus assertions below still run, so
  // nothing is weakened.
  const writeCorpus = !process.env.V4_PLUGIN || !!process.env.V4_CORPUS_DIR
  if (writeCorpus) {
    mkdirSync(CORPUS_DIR, { recursive: true })
    writeFileSync(join(CORPUS_DIR, 'formal-verify-v4.json'), JSON.stringify({ entries: corpus }, null, 2), 'utf8')
    const md = ['# V4 交互语料（prompt corpus）', '',
      '> 由 `formal-verify-v4.test.mjs` 落盘：常驻**真正会读到**的提示词原文',
      '> （`vibe_v4_prompts` 的只读回显 + 一条真实投递的工作轮 + 工具 `hint`）。',
      '> 工作区路径归一化为 `<WS>`，VibeMath 根归一化为 `<VIBEMATH>`，随机任务号归一化为',
      '> `<TASKID>`（`propose_task` 的 `t-<8 位 hex>` 来自 `Math.random`）：确定、可 diff、不含任何本机路径或随机数。', '',
      '> 覆盖：`off`（无 Lean 文本）、`encourage`、**`require`**、对象 `passed` 后的**忠实性分支**',
      '> （`encourage` / `require` 两种措辞各一份：只有 `require` 会声称"不定论"）、',
      '> `blocked` 分支、平时工作轮的「顺手形式化」，以及回执契约里的 `formal` 字段；',
      '> **以及非形式化的交互面**：会议提示（首位发言者 / 已看到他人发言者各一份，含停止表决契约）、',
      '> 私信框头 `[MESSAGE from …]`、群聊框头 `[群聊]`、认领任务框头 `[YOU CLAIMED TASK …]`。', '']
    for (let i = 0; i < corpus.length; i++) {
      const c = corpus[i]
      md.push('## [' + i + '] ' + c.kind + ' · ' + c.label)
      md.push('')
      md.push('```text')
      md.push(c.prompt)
      md.push('```')
      md.push('')
    }
    writeFileSync(join(CORPUS_DIR, 'formal-verify-v4.md'), md.join('\n'), 'utf8')
    assert(existsSync(join(CORPUS_DIR, 'formal-verify-v4.json')) && existsSync(join(CORPUS_DIR, 'formal-verify-v4.md')), 'the prompt corpus was written (JSON + Markdown)')
  }
  assert(corpus.length >= 14, 'the corpus covers the whole Lean prompt surface (' + corpus.length + ' prompts)')
  const byLabel = (l) => corpus.find((c) => c.label === l)
  assert(!!byLabel('off/verify') && !/Lean/.test(byLabel('off/verify').prompt) && !/Lean/.test(byLabel('off/normal').prompt), '★ the corpus keeps the off-mode entries and they contain NO Lean text')
  assert(/【Lean 形式化验证（鼓励模式）】/.test(byLabel('encourage/verify').prompt), 'the corpus carries the encourage voting prompt')
  assert(/【Lean 形式化验证（强制模式）】/.test(byLabel('require/verify').prompt), '★ the corpus carries the REQUIRE voting prompt')
  assert(/不要投 0/.test(byLabel('passed/fidelity').prompt), '★ the corpus carries the passed/fidelity branch')
  assert(/本次裁定\*\*不定论\*\*/.test(byLabel('passed/fidelity').prompt), 'the require fidelity entry keeps the hold it really enforces')
  assert(!!byLabel('passed/fidelity (encourage)') && !/本次裁定\*\*不定论\*\*/.test(byLabel('passed/fidelity (encourage)').prompt)
    && /本档没有门禁/.test(byLabel('passed/fidelity (encourage)').prompt), '★ the encourage fidelity entry does NOT promise the hold only require has (docs §4.1-3)')
  assert(/【顺手形式化（强制）】/.test(byLabel('require/normal').prompt), 'the corpus carries the ordinary work-round line')
  assert(/"decision":"used\|blocked\|defect"/.test(byLabel('formal reply contract (voting prompt)').prompt), '★ the corpus carries the `formal` reply contract line with decision=defect')
  assert(/【顺手形式化/.test(byLabel('require/real work wake').prompt), 'the corpus also keeps a prompt the framework REALLY delivered')
  // ---- the non-formal interaction surfaces (audit M6 / F15) --------------------------------
  // The corpus used to be Lean-only, so `meetingPrompt` (the ONLY group-chat / allocation /
  // stop-vote carrier this preset has) had no reviewable artefact. These assertions pin both the
  // coverage and the CONTENT of the stop-vote contract that `finalizeMeeting` now enforces.
  {
    const first = byLabel('meeting/first speaker (no prior speech)')
    const later = byLabel('meeting/later speaker (others relayed)')
    assert(!!first && !!later, '★ the corpus carries the MEETING prompt (two perspectives: no prior speech / others already relayed)')
    assert(/meeting is in progress/.test(first.prompt) && /meeting is in progress/.test(later.prompt), 'the meeting entries are built by the real meeting prompt builder')
    assert(/并行独立发言/.test(first.prompt), 'the first-speaker entry states the parallel-statements semantics (nobody has spoken yet)')
    assert(/已有发言（他人 input，已转发给你）/.test(later.prompt) && /我建议先验证 p-corpus/.test(later.prompt), '★ the later-speaker entry carries a teammate contribution VERBATIM (the group-chat relay is reviewable)')
    assert(/\[r-1\]/.test(later.prompt) && !/\[r-2\]/.test(later.prompt), 'the relayed-speech list excludes the reader and names the real sender id')
    assert(/voteSolved/.test(first.prompt) && /停止表决必须是绝对票/.test(first.prompt), '★ the meeting prompt states the stop-vote contract the code enforces (every speaker must answer true)')
    assert(!!byLabel('normal + queued inbox line ([<sender>] content)') && /\[facilitator（框架\/人类信使/.test(byLabel('normal + queued inbox line ([<sender>] content)').prompt) && /请优先核对引理 B 的假设条件。/.test(byLabel('normal + queued inbox line ([<sender>] content)').prompt), '★ the corpus carries the inbox line that names the real sender of a queued message')
    assert(/\[(NEW )?MESSAGE from facilitator\]/.test(byLabel('normal + delivered message frame ([NEW MESSAGE from ...])').prompt), '★ the corpus carries the [NEW MESSAGE from …] delivery frame, captured from a REAL delivery')
    assert(/\[群聊\] 我对引理 B 的假设有异议/.test(byLabel('normal + group-chat frame ([群聊])').prompt), '★ the corpus carries the group-chat frame relayed by a teammate (and the recipient is not the speaker)')
    assert(/facilitator（框架\/人类信使，不是常驻成员，不要向它回信/.test(byLabel('normal + queued inbox line ([<sender>] content)').prompt), '★ the frame DEFINES `facilitator` on the very wake that shows it, so it is not an unaddressable stranger')
  }
  const joined = corpus.map((c) => c.prompt).join('\n')
  assert(joined.indexOf(K.WS) === -1 && joined.indexOf(K.WS.replace(/\\/g, '/')) === -1 && joined.indexOf(vibe) === -1 && joined.indexOf(vibe.replace(/\\/g, '/')) === -1, '★ every captured prompt normalises <WS> and <VIBEMATH> (diffable, no machine paths)')
  // The random `t-<hex8>` must be normalised too, and NON-vacuously: the task-frame entry has to
  // CARRY the normalised token (a scrub that quietly blanked the whole frame would also pass the
  // absence check below).
  assert(/\[YOU CLAIMED TASK <TASKID>\]/.test(byLabel('task frame ([YOU CLAIMED TASK ...])').prompt), '★ the task-frame corpus entry really carries the normalised `<TASKID>` token')
  assert(!/\bt-[0-9a-f]{8}\b/.test(joined), '★ no captured prompt leaks a random `t-<hex8>` id (the corpus is byte-stable across runs)')
  assert(!/\[object Object\]|\bNaN\b|:\s*undefined|["']undefined["']|undefined\s*[,}\]]/.test(joined), 'no captured prompt contains placeholder garbage')
  assert(corpus.every((c) => c.prompt && c.prompt.length > 20), 'every corpus entry carries real prompt text')
}

// ===============================================================
// 16. a FRESH run must not inherit the previous run's formal records (docs §31.6): object ids are
//     reused (p-*, r-1..), so the in-memory reset in `start()` has to REACH DISK even when the mode
//     has been switched back to `off` — otherwise a later `resume` restores a stale `passed` and
//     re-opens the require gate for an object of the new run. This is the exact hazard that makes
//     the `off`-mode persistence guard ("do not create State/formal.json" ) non-trivial.
// ===============================================================
section('16 a fresh run clears the persisted formal records (even in off mode)')
{
  const stale = readIf(join(D.projectRoot, 'State', 'formal.json'))
  assert(/"p-proof"/.test(stale), 'precondition: the previous run left formal records on disk')
  await D.callTool('vibe_v4_set', { formalVerify: 'off' })
  const beforeSpawns = D.spawns.length
  const st = await D.callTool('vibe_v4_start', { problem: '新一轮：形式化清白起点', residentCount: 1 })
  assert(st.ok === true && D.spawns.length > beforeSpawns, 'the fresh run actually started (so the clean-slate assertion is falsifiable)')
  const now = readIf(join(D.projectRoot, 'State', 'formal.json'))
  assert(!/"p-proof"/.test(now) && !/"passed"/.test(now), '★ a fresh run clears the persisted formal records on disk, even in off mode (no stale `passed` can open the new run’s gate)')
}

// ===============================================================
// 17. leanAsync (default true): the tool ENQUEUES and returns immediately; ONLY a settled, green
//     job whose file still matches the enqueued content may set `passed` / mint Verified/Lean/.
// ===============================================================
const settleJob = async (h, jobId, tries = 80) => {
  for (let i = 0; i < tries; i++) {
    const r = await h.callTool('vibe_v4_lean_job', { jobId, waitMs: 200 })
    if (['settled', 'failed', 'timeout', 'interrupted'].indexOf(r.state) !== -1) return r
    await sleep(30)
  }
  return await h.callTool('vibe_v4_lean_job', { jobId })
}
/** The mock's `ensureDirs` records a shell mkdir but does not materialise directories, so a test
 *  that seeds a project file must create its parent itself. */
const writeIn = (h, rel, body) => { const p = join(h.WS, 'VibeMath', ...rel.split('/')); mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, body); return p }
section('17 leanAsync=true enqueues immediately; passed only after a settled green job')
{
  const N = await establish()
  await N.callTool('vibe_v4_set', { formalVerify: 'encourage', leanAsync: true, activityTimeoutMs: 60 })
  writeIn(N, 'Projects/default/Formal/a-async.lean', 'theorem a_async : 1 + 1 = 2 := by decide\n')
  const runsBefore = leanRuns.length
  const arc = await N.callTool('vibe_v4_lean_archive', { kind: 'proof', target: 'p-async', content: 'theorem p_async : 1 + 1 = 2 := by decide\n' }, N.resAgent(N.childOf('r-1')))
  assert(arc.ok === true && arc.async && arc.async.state === 'queued' && /^p-async-[0-9a-f]{12}$/.test(arc.jobId), '★ lean_archive kind=proof ENQUEUES and returns {async:{jobId,state:queued}} immediately (jobId=' + arc.jobId + ')')
  assert(arc.passed === undefined && !existsSync(join(N.projectRoot, 'Verified', 'Lean', 'p-async.lean')), '★ NO proof is minted at enqueue time (nothing may become passed before the compile lands)')
  assert(leanRuns.length === runsBefore, '★ the compiler has NOT been spawned yet by the enqueueing call (it is genuinely non-blocking)')
  const st0 = await N.callTool('vibe_v4_status', {})
  assert(!st0.formal.passed.includes('p-async'), 'and the object is not reported passed while queued')
  const done = await settleJob(N, arc.jobId)
  assert(done.state === 'settled' && done.exitCode === 0 && done.archive === 'Verified/Lean/p-async.lean', '★ the job settles green and reports its archive path (' + done.state + '/' + done.exitCode + ')')
  assert(existsSync(join(N.projectRoot, 'Verified', 'Lean', 'p-async.lean')), '★ the archived proof exists only AFTER the settle')
  const st1 = await N.callTool('vibe_v4_status', {})
  assert(st1.formal.passed.includes('p-async'), '★ the object is now passed')
  const list = await N.callTool('vibe_v4_lean_job', {})
  assert(list.ok === true && list.jobs.some(j => j.jobId === arc.jobId && j.receipt === 'Formal/Jobs/' + arc.jobId + '.json' && j.archive === 'Verified/Lean/p-async.lean'), '★ lean_job (no jobId) lists the job with its receipt + archive paths')
  const nextWake = await N.callTool('vibe_v4_message', { to: 'r-1', content: '继续。' })
  const promptsText = N.followups.map(promptOf).join('\n')
  assert(/【形式化结果】/.test(promptsText), '★ the settled result is announced once in the next prompt (【形式化结果】)')
}

// ===============================================================
// 18. The failure + timeout branches stay `attempted`.
// ===============================================================
section('18 async failure and timeout never set passed')
{
  const N = await establish()
  await N.callTool('vibe_v4_set', { formalVerify: 'require', leanAsync: true, activityTimeoutMs: 60 })
  const arc = await N.callTool('vibe_v4_lean_archive', { kind: 'proof', target: 'p-async-fail', content: 'theorem p_async_fail : False := by sorry\n' })
  const done = await settleJob(N, arc.jobId)
  assert(done.state === 'failed' && done.exitCode === 1, '★ a red compile settles as failed (not passed)')
  assert(!existsSync(join(N.projectRoot, 'Verified', 'Lean', 'p-async-fail.lean')), '★ no proof is archived for a red run')
  const st = await N.callTool('vibe_v4_status', {})
  const rec = (st.formal.objects || []).find(o => o.target === 'p-async-fail') || {}
  assert(!st.formal.passed.includes('p-async-fail') && rec.status === 'attempted', '★ a failed async proof stays attempted and never satisfies the require gate (record status=' + rec.status + ')')
  // a HANG file: only the framework's own timeout can end it
  await N.callTool('vibe_v4_set', { leanTimeoutMs: 1000 })
  writeIn(N, 'Projects/default/Formal/a-hang.lean', '-- HANG\ntheorem a_hang : True := by trivial\n')
  const hang = await N.callTool('vibe_v4_lean_archive', { kind: 'proof', target: 'p-async-hang', content: '-- HANG\ntheorem p_async_hang : True := by trivial\n' })
  const hd = await settleJob(N, hang.jobId, 120)
  assert(hd.state === 'timeout' && hd.timedOut === true, '★ a hanging compile is timed out by the job budget (leanTimeoutMs), not left running')
  assert(terminated.length >= 1, '★ the timeout path really called handle.terminate() (an active kill, not just a report)')
  assert(!existsSync(join(N.projectRoot, 'Verified', 'Lean', 'p-async-hang.lean')), 'a timed-out proof is never archived')
}

// ===============================================================
// 19. dispose/abort terminates the in-flight compile and marks it interrupted.
// ===============================================================
section('19 dispose marks the in-flight job interrupted (never passed)')
{
  const N = await establish()
  // The heartbeat is the queue driver, so it must be SHORT before the enqueue arms it (a long
  // heartbeat armed at enqueue time would leave the job queued forever — which is the point of §2.2).
  await N.callTool('vibe_v4_set', { formalVerify: 'encourage', leanAsync: true, activityTimeoutMs: 40, leanTimeoutMs: 600000 })
  const arc = await N.callTool('vibe_v4_lean_archive', { kind: 'proof', target: 'p-dispose', content: '-- HANG\ntheorem p_dispose : True := by trivial\n' })
  for (let i = 0; i < 100; i++) { const r = await N.callTool('vibe_v4_lean_job', { jobId: arc.jobId }); if (r.state === 'running') break; await sleep(25) }
  const before = await N.callTool('vibe_v4_lean_job', { jobId: arc.jobId })
  assert(before.state === 'running', 'precondition: the job is genuinely in flight (state=' + before.state + ')')
  await N.callTool('vibe_v4_abort', {})
  const after = await N.callTool('vibe_v4_lean_job', { jobId: arc.jobId })
  assert(after.state === 'interrupted' && after.interrupted === true, '★ abort/dispose marks the in-flight job interrupted (state=' + after.state + ')')
  assert(!existsSync(join(N.projectRoot, 'Verified', 'Lean', 'p-dispose.lean')), '★ an interrupted job never mints a proof')
  const st = await N.callTool('vibe_v4_status', {})
  assert(!st.formal.passed.includes('p-dispose'), 'and the object is not passed')
}

// ===============================================================
// 20. crash/restart recovery reads Formal/Jobs/*.json and never silently verifies.
// ===============================================================
section('20 crash recovery: queued re-driven, changed content never verified, settled completed')
{
  const N = await establish()
  await N.callTool('vibe_v4_set', { formalVerify: 'encourage', leanAsync: true, activityTimeoutMs: 600000 })
  const jobsDir = join(N.projectRoot, 'Formal', 'Jobs')
  mkdirSync(jobsDir, { recursive: true })
  const body = 'theorem p_rec : 1 + 1 = 2 := by decide\n'
  const file = writeIn(N, 'Projects/default/Formal/p-rec.lean', body)
  const crypto = await import('node:crypto')
  const sha = crypto.createHash('sha256').update(body.replace(/\r\n?/g, '\n').replace(/[ \t]+$/gm, '').replace(/\n+$/, '') + '\n', 'utf8').digest('hex')
  // (a) `running` with UNCHANGED content → re-queued (never verified)
  writeFileSync(join(jobsDir, 'p-rec-aaaaaaaaaaaa.json'), JSON.stringify({ jobId: 'p-rec-aaaaaaaaaaaa', kind: 'proof', key: 'p-rec', target: 'p-rec', rel: 'Formal/p-rec.lean', abs: file, sha256: sha, content: body, state: 'running', attempts: 1, enqueuedAt: 1, startedAt: 2 }))
  // (b) `running` with CHANGED content → interrupted + attempted, NO auto re-drive
  const stalePath = writeIn(N, 'Projects/default/Formal/p-stale.lean', 'theorem p_stale : True := by trivial\n')
  writeFileSync(join(jobsDir, 'p-stale-bbbbbbbbbbbb.json'), JSON.stringify({ jobId: 'p-stale-bbbbbbbbbbbb', kind: 'proof', key: 'p-stale', target: 'p-stale', rel: 'Formal/p-stale.lean', abs: stalePath, sha256: sha, content: body, state: 'running', attempts: 1, enqueuedAt: 1, startedAt: 2 }))
  // A FRESH run (start) performs the safe half of the recovery table: `queued` jobs are re-driven,
  // `running` jobs are re-driven only while the content still matches, and a stale `settled` record
  // is NEVER adopted (that is exactly what the clean formal slate exists to prevent).
  writeFileSync(join(jobsDir, 'p-done-cccccccccccc.json'), JSON.stringify({ jobId: 'p-done-cccccccccccc', kind: 'proof', key: 'p-done', target: 'p-done', rel: 'Formal/p-done.lean', abs: file, sha256: sha, content: body, state: 'settled', exitCode: 0, verifiedRel: 'Verified/Lean/p-done.lean', attempts: 1, enqueuedAt: 1, startedAt: 2, settledAt: 3 }))
  await N.callTool('vibe_v4_start', { problem: '恢复扫描', residentCount: 1 })
  const a = await N.callTool('vibe_v4_lean_job', { jobId: 'p-rec-aaaaaaaaaaaa' })
  const b = await N.callTool('vibe_v4_lean_job', { jobId: 'p-stale-bbbbbbbbbbbb' })
  assert(a.state === 'queued' || a.state === 'running' || a.state === 'settled', '★ recovery re-drives a `running` job whose content still matches (state=' + a.state + ')')
  assert(b.state === 'interrupted', '★ a `running` job whose file CHANGED is interrupted, not verified (state=' + b.state + ')')
  const st = await N.callTool('vibe_v4_status', {})
  assert(!st.formal.passed.includes('p-stale'), '★ the changed-content job never reaches `passed`')
  assert(!st.formal.passed.includes('p-done') && !existsSync(join(N.projectRoot, 'Verified', 'Lean', 'p-done.lean')), '★ a fresh run does NOT adopt a previous run’s `settled` record (no stale passed, no minted proof)')
  assert(N.followups.map(promptOf).join('\n').length >= 0, 'recovery ran without throwing')
}

// ===============================================================
// 21. lean_read: verbatim library access, confined to Formal/{Lib,Proved}, 64KB cap.
// ===============================================================
section('21 lean_read returns the archived text verbatim and refuses escapes')
{
  const N = await establish()
  await N.callTool('vibe_v4_set', { formalVerify: 'encourage', leanAsync: false })   // sync: the file must be on disk for the read
  const defBody = 'def ZMod9 := Fin 9\n\ntheorem zmod9_card : Fintype.card ZMod9 = 9 := by decide\n'
  const arch = await N.callTool('vibe_v4_lean_archive', { kind: 'def', name: 'ZMod9', content: defBody }, N.resAgent(N.childOf('r-1')))
  assert(arch.ok === true, 'precondition: the definition archived')
  const rd = await N.callTool('vibe_v4_lean_read', { name: 'ZMod9' })
  assert(rd.ok === true && rd.kind === 'lib' && rd.file === 'Formal/Lib/ZMod9.lean' && rd.text === defBody, '★ lean_read returns the archived file text VERBATIM (import-or-copy reuse)')
  assert(/^[0-9a-f]{64}$/.test(rd.sha256) && rd.bytes === defBody.length && rd.truncated === false, 'it reports sha256/bytes/truncated')
  assert(/import Formal\.Lib\.ZMod9/.test(rd.hint || ''), '★ and names the namespace to import (module root = VibeMath root)')
  const proved = await N.callTool('vibe_v4_lean_read', { name: 'ZMod9', kind: 'proved' })
  assert(proved.ok === false && proved.code === 'V4_NOT_FOUND', 'kind=proved does not look in Lib/')
  for (const bad of ['../../etc/passwd', '..', 'Formal/Lib/ZMod9', 'C:\\Windows\\evil']) {
    const r = await N.callTool('vibe_v4_lean_read', { name: bad })
    assert(r.ok === false, '★ lean_read refuses the path-escape name ' + JSON.stringify(bad))
  }
  assert((await N.callTool('vibe_v4_lean_read', { name: 'ZMod9', kind: 'bogus' })).ok === false, 'an unknown kind is refused')
  // 64KB truncation
  const big = 'def Big := 1\n' + ('-- ' + 'x'.repeat(120) + '\n').repeat(600)
  await N.callTool('vibe_v4_lean_archive', { kind: 'def', name: 'BigLib', content: big, run: false })
  const rb = await N.callTool('vibe_v4_lean_read', { name: 'BigLib' })
  assert(rb.ok === true && rb.truncated === true && rb.text.length <= 64 * 1024 && rb.bytes > 64 * 1024, '★ a >64KB library file is truncated and flagged (truncated:true)')
}

// ===============================================================
// 22. Search paths (AMENDMENT §2) + build-context job id (§4) + concurrency (§5) + the new params.
// ===============================================================
section('22 leanSearchPaths/leanJobsMaxParallel/leanInitiative + build-context job ids')
{
  const N = await establish()
  await N.callTool('vibe_v4_set', { formalVerify: 'encourage', leanAsync: false, leanArgs: [], leanSearchPaths: ['/extra/one', '/extra/one', '/extra/two'] })
  writeIn(N, 'Projects/default/Formal/a-sp.lean', 'theorem a_sp : True := by trivial\n')
  await N.callTool('vibe_v4_lean_run', { file: 'Formal/a-sp.lean' }, N.resAgent(N.childOf('r-1')))
  let last = leanRuns[leanRuns.length - 1]
  const spIdx = last.argv.indexOf('--search-path')
  assert(last.argv.filter(a => a === '--search-path').length === 3, '★ one --search-path per DISTINCT root (user paths first, then the automatic VibeMath root)')
  assert(last.argv[spIdx + 1] === '/extra/one' && last.argv[spIdx + 3] === '/extra/two' && last.argv[spIdx + 5] === N.vibeRoot.replace(/\\/g, '/'), '★ order + de-duplication: user paths in order, automatic root last')
  assert(last.argv.indexOf('--search-path') < last.argv.length - 1 && /\.lean$/.test(String(last.argv[last.argv.length - 1])), 'the roots stay BEFORE the file name')
  await N.callTool('vibe_v4_set', { leanArgs: ['--search-path', '/user/own'] })
  await N.callTool('vibe_v4_lean_run', { file: 'Formal/a-sp.lean' }, N.resAgent(N.childOf('r-1')))
  last = leanRuns[leanRuns.length - 1]
  assert(last.argv.filter(a => a === '--search-path').length === 1 && last.argv[last.argv.indexOf('--search-path') + 1] === '/user/own', '★ an explicit --search-path in leanArgs wins outright: nothing is injected')
  await N.callTool('vibe_v4_set', { leanArgs: ['-R', '/user/root'] })
  await N.callTool('vibe_v4_lean_run', { file: 'Formal/a-sp.lean' }, N.resAgent(N.childOf('r-1')))
  assert(leanRuns[leanRuns.length - 1].argv.indexOf('--search-path') === -1, '★ -R/--root count as a user-stated root too')
  const lib = await N.callTool('vibe_v4_lean_lib', { refresh: false })
  assert(lib.searchPath === N.vibeRoot.replace(/\\/g, '/') && /import Formal\.Lib\./.test(JSON.stringify(lib.importNamespace)), 'lean_lib shows the injected searchPath and the import namespace')
  // build-context job id: same content, different engine ⇒ different job
  await N.callTool('vibe_v4_set', { leanAsync: true, activityTimeoutMs: 600000, leanArgs: [], leanSearchPaths: [], leanCommand: 'lean' })
  const j1 = await N.callTool('vibe_v4_lean_archive', { kind: 'def', name: 'CtxOne', content: 'def CtxOne := 1\n' })
  await N.callTool('vibe_v4_set', { leanCommand: 'lake' })
  const j2 = await N.callTool('vibe_v4_lean_archive', { kind: 'def', name: 'CtxOne', content: 'def CtxOne := 1\n' })
  assert(j1.jobId !== j2.jobId, '★ the job id covers the BUILD CONTEXT: identical content with a different engine is a different job (' + j1.jobId + ' vs ' + j2.jobId + ')')
  // concurrency cap
  await N.callTool('vibe_v4_set', { leanCommand: 'lean', leanJobsMaxParallel: 2, activityTimeoutMs: 40 })
  const h1 = await N.callTool('vibe_v4_lean_archive', { kind: 'def', name: 'CapA', content: '-- HANG\ndef CapA := 1\n' })
  const h2 = await N.callTool('vibe_v4_lean_archive', { kind: 'def', name: 'CapB', content: '-- HANG\ndef CapB := 1\n' })
  const h3 = await N.callTool('vibe_v4_lean_archive', { kind: 'def', name: 'CapC', content: '-- HANG\ndef CapC := 1\n' })
  for (let i = 0; i < 120; i++) { const s = await N.callTool('vibe_v4_lean_job', {}); if (s.running.length >= 2) break; await sleep(25) }
  const snap = await N.callTool('vibe_v4_lean_job', {})
  assert(snap.running.length === 2 && snap.queued.length >= 1, '★ leanJobsMaxParallel=2 runs exactly two compiles and leaves the rest queued (' + snap.running.length + ' running / ' + snap.queued.length + ' queued; all=' + JSON.stringify(snap.jobs.map(j => j.jobId + ':' + j.state)) + '; archives=' + JSON.stringify([h1, h2, h3].map(x => x && (x.jobId || x.code || x.message)))) + ')'
  await N.callTool('vibe_v4_abort', {})   // terminate the hang jobs
}

// ===============================================================
// 23. leanInitiative separates PROACTIVITY from the verification requirement (AMENDMENT §1).
// ===============================================================
section('23 leanInitiative: off/normal/eager in the work prompt, formalVerify untouched')
{
  const N = await establish()
  await N.callTool('vibe_v4_set', { formalVerify: 'encourage', leanAsync: false })
  const normal = await N.prompts('normal', 'r-1')
  assert(/【顺手形式化（鼓励）】/.test(normal) && /判断标准：① 有价值或可能复用/.test(normal), '★ leanInitiative=normal (default): the daily line carries the three selection criteria')
  assert(/先 vibe_v4_lean_lib 查已有库/.test(normal) && /没把握就记 blocked/.test(normal) && /import Formal\.Lib\./.test(normal), '★ …and the look-up-first / blocked / namespace rules')
  assert(!/leanInitiative=eager/.test(normal), 'the normal档 does not claim eagerness')
  const verify = await N.prompts('verify', 'r-1', { target: 'p-init', stage: 'independent' })
  assert(/形式化只写你有把握的版本；没把握就记 blocked 并写清难点/.test(verify) && /不得\*\*在它落地前声称已通过/.test(verify), '★ the verification block carries the §5 B contract (blocked-instead-of-guessing + no premature "passed")')
  await N.callTool('vibe_v4_set', { leanInitiative: 'eager' })
  const eager = await N.prompts('normal', 'r-1')
  assert(/leanInitiative=eager/.test(eager) && /主动\*\*顺手形式化并归档/.test(eager), '★ leanInitiative=eager adds the explicit proactive clause')
  await N.callTool('vibe_v4_set', { leanInitiative: 'off' })
  const off = await N.prompts('normal', 'r-1')
  assert(!/【顺手形式化/.test(off), '★ leanInitiative=off removes the proactive daily line entirely')
  const vOff = await N.prompts('verify', 'r-1', { target: 'p-init', stage: 'independent' })
  assert(/【Lean 形式化验证（鼓励模式）】/.test(vOff) && /实现难度/.test(vOff), '★ …while the VERIFICATION prompt still states the formalVerify requirement (off ≠ no verification)')
  // parameter surfaces (AMENDMENT §1/§2/§5 + leanAsync)
  const setSpec = N.toolRegs.find(t => t.name === 'vibe_v4_set')
  for (const k of ['leanAsync', 'leanInitiative', 'leanSearchPaths', 'leanJobsMaxParallel']) assert(!!setSpec.parameters.properties[k], '★ vibe_v4_set advertises ' + k)
  assert(JSON.stringify(setSpec.parameters.properties.leanInitiative.enum) === JSON.stringify(['off', 'normal', 'eager']), 'leanInitiative is a closed enum in the schema')
  const coerced = await N.callTool('vibe_v4_set', { leanAsync: 'false', leanInitiative: 'bogus', leanSearchPaths: 'a, b ,,c', leanJobsMaxParallel: 0 })
  const pv = await N.callTool('vibe_v4_status', {})
  assert(coerced.ok === true && /leanAsync=false/.test(pv.params), '★ the STRING "false" normalises to boolean false (never a truthy string)')
  assert(/leanInitiative=normal/.test(pv.params), 'an unknown leanInitiative degrades to the default normal')
  assert(/leanSearchPaths=a,b,c/.test(pv.params), 'a comma string becomes a trimmed, non-empty array')
  assert(/leanJobsMaxParallel=1/.test(pv.params), 'leanJobsMaxParallel is clamped to ≥1')
  // The SLASH-COMMAND surface passes RAW STRINGS to the same parameter layer (spec §B: v4's `/v4 set`
  // hands over strings, so 'false' must not survive as a truthy value there either).
  const slash = await N.cmd('set leanAsync=false leanInitiative=off')
  assert(slash.kind === 'success', '/v4 set accepted the Lean parameters')
  const pv2 = await N.callTool('vibe_v4_status', {})
  assert(/leanAsync=false/.test(pv2.params) && /leanInitiative=off/.test(pv2.params), '★ `/v4 set leanAsync=false leanInitiative=off` coerces the raw strings through normalizeParam')
  assert(!/【顺手形式化/.test(await N.prompts('normal', 'r-1')), '★ and leanInitiative=off set through the slash command really silences the proactive line')
}

// ===============================================================
// 17. audit-B #2: `leanInitiative` is an INDEPENDENT axis from `formalVerify` — `eager` asks for the
//     daily line even with `formalVerify:'off'` (v5 uses the same rule); 'off' never injects it while
//     the VERIFICATION prompt keeps following `formalVerify`.
// ===============================================================
section('17 leanInitiative=eager injects the daily line even with formalVerify=off (independent axes)')
{
  const N = await establish()
  await N.callTool('vibe_v4_set', { formalVerify: 'off', leanInitiative: 'eager' })
  const daily = await N.prompts('normal', 'r-1')
  assert(/【顺手形式化（主动（leanInitiative=eager））】/.test(daily), '★ eager + formalVerify=off STILL injects the daily line (the header names the initiative, not a verification mode)')
  assert(/判断标准：① 有价值或可能复用/.test(daily) && /先 vibe_v4_lean_lib 查已有库/.test(daily), '★ …with the three criteria and the look-up-first rule')
  const verifyOff = await N.prompts('verify', 'r-1', { target: 'p-eager-off', stage: 'independent' })
  assert(!/顺手形式化/.test(verifyOff) && !/【Lean 形式化验证/.test(verifyOff), '★ …while the VERIFICATION prompt stays a true no-op under formalVerify=off')
  // the default initiative is not eager: off mode injects nothing (unchanged behaviour)
  await N.callTool('vibe_v4_set', { leanInitiative: 'normal' })
  assert(!/顺手形式化/.test(await N.prompts('normal', 'r-1')), '★ leanInitiative=normal + formalVerify=off injects NO daily line')
  // 'off' silences the daily line even when formalVerify asks for Lean, without touching verification
  await N.callTool('vibe_v4_set', { formalVerify: 'encourage', leanInitiative: 'off' })
  assert(!/顺手形式化/.test(await N.prompts('normal', 'r-1')), '★ leanInitiative=off removes the daily line even with formalVerify=encourage')
  assert(/【Lean 形式化验证（鼓励模式）】/.test(await N.prompts('verify', 'r-1', { target: 'p-eager-off', stage: 'independent' })), '★ …and the verification prompt is untouched by the initiative knob')
  // with formalVerify on, the header names the verification mode again (not the eager wording)
  await N.callTool('vibe_v4_set', { formalVerify: 'require', leanInitiative: 'eager' })
  assert(/【顺手形式化（强制）】/.test(await N.prompts('normal', 'r-1')), '★ with formalVerify on, the header names the verification mode (require → 强制)')
  await N.callTool('vibe_v4_set', { formalVerify: 'off', leanInitiative: 'normal' })
}

// ===============================================================
// 18. audit R2 HIGH: the independence rule must hold at EVERY daily-line injection site, not just
//     the ordinary work round. A single-site regression to `formalOn()`-only must be catchable, so
//     each site is asserted separately under BOTH decisive states (eager+off, and initiative=off).
// ===============================================================
section('18 every daily-line injection site (coreRules/normal/heartbeat) obeys the independence rule')
{
  const N = await establish()
  const SITES = [
    ['coreRules', 'coreRulesBrief', () => N.prompts('coreRules')],
    ['normal', 'normalPrompt', () => N.prompts('normal', 'r-1')],
    ['heartbeat', 'heartbeatPrompt', () => N.prompts('heartbeat', 'r-1')],
  ]
  await N.callTool('vibe_v4_set', { formalVerify: 'off', leanInitiative: 'eager' })
  for (const [which, who, read] of SITES) {
    const text = await read()
    assert(/【顺手形式化（主动（leanInitiative=eager））】/.test(text), '★ [' + which + '] eager + formalVerify=off injects the daily line at this site (' + who + ')')
    assert(/判断标准：① 有价值或可能复用/.test(text) && /先 vibe_v4_lean_lib 查已有库/.test(text), '★ [' + which + '] …with the three criteria and the look-up-first rule (' + who + ')')
  }
  const vOff = await N.prompts('verify', 'r-1', { target: 'p-site-off', stage: 'independent' })
  assert(!/顺手形式化/.test(vOff) && !/【Lean 形式化验证/.test(vOff), '★ [all sites] the verification prompt stays a no-op under formalVerify=off')
  await N.callTool('vibe_v4_set', { formalVerify: 'encourage', leanInitiative: 'off' })
  for (const [which, who, read] of SITES) {
    const text = await read()
    assert(!/顺手形式化/.test(text), '★ [' + which + '] leanInitiative=off removes the daily line at this site (' + who + ')')
  }
  assert(/【Lean 形式化验证（鼓励模式）】/.test(await N.prompts('verify', 'r-1', { target: 'p-site-off', stage: 'independent' })), '★ [all sites] …while verification still follows formalVerify (encourage)')
  await N.callTool('vibe_v4_set', { formalVerify: 'off', leanInitiative: 'normal' })
}

// ===============================================================
// 22. cross-preset audit P0 (v4 station): the member-visible library text must state that the
//     residents' file tools resolve against the SESSION CWD, so the listed sub-paths must be used
//     with the ABSOLUTE prefix (and computation artifacts via receipt.scriptAbs / receipt.cwd).
// ===============================================================
section('22 audit P0: member-facing paths carry the session-cwd / absolute-prefix instruction')
{
  const N = await establish()
  const texts = [await N.prompts('brainstorm', 'r-1'), await N.prompts('coreRules'), await N.prompts('normal', 'r-1')]
  const ok = texts.filter((t) => t.indexOf('会话 cwd') !== -1 && t.indexOf('绝对前缀') !== -1)
  assert(ok.length >= 1, '★ the member-visible library text says file tools resolve against the SESSION CWD and that listed paths need the ABSOLUTE prefix (found in ' + ok.length + '/3 variants)')
  assert(ok.some((t) => t.indexOf('receipt.scriptAbs') !== -1 || t.indexOf('receipt.cwd') !== -1), '★ …and names the absolute receipt field (receipt.scriptAbs / receipt.cwd) for computation artifacts')
}

// ===============================================================
// 23. cross-preset audit P1 (v4 stations): a member-facing not-found must be diagnosable — code +
//     live roster status + an actionable next step — including `removeMember` (previously a bare
//     {ok:false}) and the not-yet-started case.
// ===============================================================
section('23 audit P1: member-facing not-found carries code + status + next')
{
  const N = await establish()
  const wrong = await N.callTool('vibe_v4_send_message', { to: 'r-404', content: 'hi' }, N.resAgent(N.childOf('r-1')))
  assert(wrong.ok === false && wrong.code === 'V4_NO_SUCH_RESIDENT' && !!wrong.next && !!wrong.next.tool, '★ wrong resident id ⇒ code V4_NO_SUCH_RESIDENT + next{tool} (not a bare message)')
  assert(wrong.status && wrong.status.residentCount >= 1 && wrong.status.running === true, '★ …plus LIVE roster status, so "wrong id" is distinguishable from "not started"')
  const kicked = await N.callTool('vibe_v4_remove_member', { id: 'r-404' })
  assert(kicked.ok === false && kicked.code === 'V4_NO_SUCH_RESIDENT' && !!kicked.next && kicked.next.tool === 'vibe_v4_remove_member', '★ vibe_v4_remove_member {id:r-404} ⇒ code + next naming that tool (was a bare {ok:false})')
  const fresh = await mount()
  const notStarted = await fresh.callTool('vibe_v4_publish_progress', { content: 'x' })
  assert(notStarted.ok === false && notStarted.code === 'V4_NO_SUCH_RESIDENT' && !!notStarted.next && !!notStarted.status && notStarted.status.running === false, '★ run not started ⇒ code + next + status.running=false')
}

// ---------- D4 cross-view: mid-verify hire/fire must not split the views ----------
section('D4 cross-view: one frozen participant set, seen identically by every view')
{
  const h = await establish()
  const st = await startVerifyOnly(h, 'p-d4')
  assert(st.consensus && st.consensus.kind === 'verify', 'precondition: an ACTIVE verification for the cross-view check (' + JSON.stringify({ c: st.consensus && st.consensus.kind, ip: st.verifyInProgress }) + ')')
  const c0 = st.consensus
  const rp0 = await h.callTool('vibe_v4_report', {})
  const rv0 = rp0.verify
  assert(Array.isArray(st.frozenParticipants) && rv0, 'the frozen participant set and the report() verify view are both exposed')
  assert(c0.expected === st.frozenParticipants.length, '★ consensus.expected === the frozen participant set size')
  assert(Number(String(rv0.voted).split('/')[1]) === c0.expected, '★ the two views agree on the DENOMINATOR (status().consensus.expected vs report().verify k/N)')
  assert(rv0.rosterVersion === c0.rosterVersion && c0.rosterVersion === st.rosterVersion, '★ both views (and status) report the SAME rosterVersion')
  // HIRE mid-verify: the newcomer must NOT join the frozen set (that is what freezing means).
  const hire = await h.callTool('vibe_v4_add_member', { direction: 'D4 cross-view assertion' })
  const st2 = await h.callTool('vibe_v4_status', {})
  const rv2 = (await h.callTool('vibe_v4_report', {})).verify
  assert(st2.rosterVersion > c0.rosterVersion, 'hiring mid-verify bumps rosterVersion (' + c0.rosterVersion + ' -> ' + st2.rosterVersion + ')')
  assert(st2.consensus.expected === st2.frozenParticipants.length && st2.consensus.expected === c0.expected,
    '★ after a mid-verify HIRE the frozen set is UNCHANGED and both views still agree (newcomer did not join)')
  assert(typeof rv2.rosterVersion === 'number' && typeof st2.consensus.rosterVersion === 'number', 'non-vacuous: both frozen views EXPOSE a numeric rosterVersion (a relative === passes when both are absent)')
  assert(rv2.rosterVersion === st2.consensus.rosterVersion,
    '★ after the HIRE the two FROZEN views (status().consensus + report().verify) still report the SAME rosterVersion')
  assert(st2.rosterVersion > rv2.rosterVersion,
    '★ …while status().rosterVersion is the LIVE counter and has moved past the snapshot (staleness is visible)')
  // FIRE mid-verify: the frozen set is pruned so the in-flight verification can still conclude.
  if (hire && hire.ok && hire.id) await h.callTool('vibe_v4_remove_member', { id: hire.id })
  const st3 = await h.callTool('vibe_v4_status', {})
  const rv3 = (await h.callTool('vibe_v4_report', {})).verify
  assert(st3.consensus.expected === st3.frozenParticipants.length && Number(String(rv3.voted).split('/')[1]) === st3.consensus.expected && rv3.rosterVersion === st3.consensus.rosterVersion,
    '★ after a mid-verify FIRE the two views STILL agree (the frozen set was pruned together)')
  assert(st3.frozenParticipants.indexOf(hire && hire.id) === -1, '★ the removed member is not in the frozen set any more (pruned on removal)')
  // …and the verification really does conclude after that churn (T26/T31 contract).
  await settleVerify(h, () => 1)
  const st4 = await h.callTool('vibe_v4_status', {})
  assert(st4.verifyInProgress === false, '★ the mid-verify hire/fire did NOT prevent the verification from concluding')
}



// ===============================================================
// 24. round A F2 (design-preserving): a HIRE never extends the frozen set, so the live counter may
//     drift ahead of it (that drift IS the staleness signal). A FIRE prunes the frozen set, so the
//     snapshot must be re-stamped — otherwise the same version would denote two different sets.
// ===============================================================
section('24 round A F2: hire keeps the snapshot stale-able; fire re-stamps it (version ≡ set)')
{
  const N = await establish()
  await N.callTool('vibe_v4_meeting', { agenda: 'round A 快照一致性' })
  const s1 = await N.callTool('vibe_v4_status', {})
  assert(!!s1.frozen && Array.isArray(s1.frozen.participants) && s1.frozen.participants.length >= 1, '★ an active consensus exposes frozen{version,participants} (additive)')
  assert(s1.frozen.version === s1.rosterVersion, 'at freeze time the snapshot version equals the live counter')
  assert(typeof s1.consensus.rosterVersion === 'number' && Array.isArray(s1.consensus.participants) && s1.consensus.rosterVersion === s1.frozen.version, '\u2605 F3 (absolute first, unguarded): status().consensus EXPOSES rosterVersion + participants and it equals the frozen snapshot version')
  const v1 = s1.rosterVersion
  await N.callTool('vibe_v4_add_member', { direction: 'round A 新增成员' })
  const s2 = await N.callTool('vibe_v4_status', {})
  assert(s2.rosterVersion > v1, 'hiring bumps the numeric rosterVersion (monotone)')
  assert(s2.frozen.version === v1, '★ a HIRE leaves the frozen snapshot version untouched (its set did not change)')
  assert(s2.frozen.participants.length === s1.frozen.participants.length, '★ …and the frozen requirement set is unchanged (frozen means frozen)')
  assert(s2.rosterVersion > s2.frozen.version, '★ the live-vs-frozen drift remains the visible staleness signal')
  const removed = s1.frozen.participants[0]
  await N.callTool('vibe_v4_remove_member', { id: removed })
  const s3 = await N.callTool('vibe_v4_status', {})
  assert(s3.frozen.participants.indexOf(removed) === -1, '★ a FIRE prunes the frozen set (the wait is released)')
  assert(s3.frozen.version === s3.rosterVersion && s3.frozen.version > v1, '★ F2: the pruned set carries a NEW version — no window where a changed set keeps the old version')
}
// ===============================================================
// ===============================================================
// N4. F-PROMPT: a documented 'true no-op' must be asserted on the DELIVERED prompt, not on the
//     config path. Under formalVerify:'off' the verify prompt must carry NO formalization clause
//     and NO forward reference to a segment that is not delivered.
// ===============================================================
section('N4 off: the DELIVERED verify prompt has no formalization content or dangling pointer')
{
  const P = await establish()
  const off = await P.prompts('verify', 'r-1', { target: 'p-fprompt', stage: 'independent' })
  assert(off.length > 100 && /\u9a8c\u8bc1/.test(off), '* the delivered verify prompt is non-trivial (non-vacuity: a missing/empty prompt must not pass the negations below)')
  assert(!/\u5f62\u5f0f\u5316\u6bb5/.test(off), '* the off-mode verify prompt contains no forward reference to the formalization segment (\u5f62\u5f0f\u5316\u6bb5)')
  assert(!/formal/.test(off), '* and no formalization content at all (no `formal` receipt clause) - the documented true no-op')
  await P.callTool('vibe_v4_set', { formalVerify: 'encourage' })
  const enc = await P.prompts('verify', 'r-1', { target: 'p-fprompt', stage: 'independent' })
  assert(/Lean|formal/.test(enc), '* under encourage the delivered prompt DOES carry the formalization block (the gate is a gate, not a deletion)')
}
// ===============================================================
// N5. v4 path basis - CORRECTED CONTRACT (the earlier comment here pinned the OLD, WRONG shape:
//     it demanded a member root. v4's writers/readers live at the PROJECT ROOT: publishProgress writes
//     Progress/<rId>/progress.md, the record tools write Propos|Methods|Subproblems/<rId>/<id>.md, and
//     countArtifacts() scans exactly those bases under frameworkRoot(). A Members/<placeholder>/... path
//     is therefore a path nothing scans - the realistic documented example is base + '/Propos/r-1/p-1.md'.
//     (Named in the report as the "comment pinning old behaviour" case.)
// ===============================================================
section('N5 v4 member-facing paths are PROJECT-ROOT (the shape the framework scans), and no Members/ shape')
{
  const P = await establish()
  const text = (await P.prompts('brainstorm', 'r-1')) + '\n' + (await P.prompts('normal', 'r-1'))
  // INVERTED (critical correction): the framework's writer/reader live at the PROJECT ROOT
  // (publishProgress writes Progress/<rId>/progress.md; countArtifacts scans Propos|Methods|Subproblems
  // under frameworkRoot()). The delivered text must document THOSE paths, never Members/<x>/...
  const decls = (text.match(/(?:^|[^A-Za-z0-9/_.-])(?:Progress|Propos|Methods|Subproblems)\/<[^>]+>\//g) || [])
  assert(decls.length >= 4, '* every member-visible library declaration is PROJECT-ROOT relative (Progress/<you>/, Propos/<you>/, ...) - the shape the framework scans (found ' + decls.length + ')')
  const wrongMembers = (text.match(/Members\/<[^>]+>\//g) || [])
  assert(wrongMembers.length === 0, '* NO member-facing declaration uses the Members/<x>/ shape (the framework never scans it) - found ' + JSON.stringify(wrongMembers))
  assert(/Progress\/<你>\/progress\.md/.test(text), '* the documented progress path matches publishProgress (Progress/<rId>/progress.md)')
  assert(/Propos\/<你>\//.test(text) && /Methods\/<你>\//.test(text) && /Subproblems\/<你>\//.test(text), '* the documented card paths match the record tools (Propos|Methods|Subproblems/<rId>/<id>.md)')
  // CLASS GUARD (one level above v3's): what the prompt documents must be what the code reads/scans
  const src4 = readFileSync(fileURLToPath(new URL('../vibe-math-v4/vibe-math-v4.js', import.meta.url)), 'utf8')
  for (const base of ['Progress', 'Propos', 'Methods', 'Subproblems']) {
    assert(new RegExp("'" + base + "'").test(src4), '* class guard: the framework reads/scans ' + base + ' - every documented write path must map onto a scanned base')
  }
  assert(/['"]Members\/['"]\s*\+/.test(src4) === false, '* class guard: no code path (writer) builds a Members/<id>/... path in v4')
}
section('N6 four-preset path discipline (member root / prefix-note)')
{
  const { readFileSync } = await import('node:fs')
  const { fileURLToPath } = await import('node:url')
  const pick = (env, rel) => process.env[env] ? process.env[env] : fileURLToPath(new URL(rel, import.meta.url))
  const files = {
    v2: pick('V2_PLUGIN', '../vibe-math-v2/vibe-math-v2.js'),
    v3: pick('V3_PLUGIN', '../vibe-math-v3/vibe-math-v3.js'),
    v4: pick('V4_PLUGIN', '../vibe-math-v4/vibe-math-v4.js'),
    v5: pick('V5_PLUGIN', '../vibe-math-v5/vibe-math-v5.js'),
  }
  const ROOT = /Members\/<[^>]+>\/(?:Progress|Propos|Methods|Subproblems)\//g
  const LEGACY = /(?:^|[^/>])(?:Progress|Propos|Methods|Subproblems)\/<[^>]+>\//g
  for (const k of ['v5']) {   // v5 pending vm-v5's re-verification; v4 handled explicitly below
    const src = readFileSync(files[k], 'utf8')
    const root = (src.match(ROOT) || []).length
    const legacy = (src.match(LEGACY) || []).length
    assert(root >= 4, '* ' + k + ': every member-visible library declaration carries the member root (found ' + root + ')')
    assert(legacy === 0, '* ' + k + ': no declaration keeps the legacy project-root-relative shape (found ' + legacy + ')')
  }
  // v4 (critical correction): the framework writes/reads at the PROJECT ROOT - publishProgress writes
  // Progress/<rId>/progress.md and countArtifacts scans Propos|Methods|Subproblems under frameworkRoot(),
  // so a Members/<x>/... declaration is a path NOTHING scans.
  {
    const src4 = files.v4 ? readFileSync(files.v4, 'utf8') : ''
    const decl4 = (src4.match(/(?:^|[^A-Za-z0-9/_.-])(?:Progress|Propos|Methods|Subproblems)\/<[^>]+>\//g) || [])
    const bad4 = (src4.match(/Members\/<[^>]+>\//g) || [])
    assert(!/Members\/<[^>]+>\//.test(src4), '* v4: NO member-facing declaration/code claim uses the Members/<x>/ shape (found ' + bad4.length + ')')
    assert(/Progress|<rId>|progress\.md/.test(src4), '* v4: the writer/reader bases are the project-root Progress/Propos/Methods/Subproblems')
  }
  // v3 (v2/v3 deep review D1): the writer `applyAgentWrites` accepts ONLY Problems|Progress|Propos|Methods|Notes
  // at the PROJECT ROOT, so a `Members/<x>/...` declaration is a write it SILENTLY DISCARDS. v3's member-facing
  // text must therefore stay root-relative - the opposite of v4/v5, which really do have a member subtree.
  const v3 = readFileSync(files.v3, 'utf8')
  assert(!/Members\/<[^>]+>\//.test(v3), '* v3: no member-facing declaration keeps the Members/<x>/ shape (the writer would discard that write)')
  const v3decl = [...v3.matchAll(/(?:^|[^/>])([A-Za-z]+)\/<[^>]+>\//g)].map((m) => m[1])
  const WL = ['Problems', 'Progress', 'Propos', 'Methods', 'Notes']
  const v3ok = v3decl.filter((x) => WL.indexOf(x) !== -1)
  assert(v3ok.length >= 1, '* v3: its declarations use the project-root-relative sections the writer accepts (found ' + v3ok.length + ' of ' + JSON.stringify(v3decl) + ')')
  // CLASS GUARD (covers v2/v3/v4/v5): whatever sections the persona/prompts tell an agent to write must be
  // accepted by that preset's writer - this is the invariant that would have caught both D1 and the v4/v5 cases.
  assert(/applyAgentWrites[\s\S]{0,600}?(Problems|Progress|Propos|Methods|Notes)/.test(v3), '* class guard: applyAgentWrites whitelists the sections the member-facing text names (v3)')
  const v2 = readFileSync(files.v2, 'utf8')
  assert(!/Members\/<[^>]+>\//.test(v2), '* v2: no Members/<x>/ shape either (anti-vacuity for the class, without over-claiming v2 has no path vocabulary)')
  assert(/PAPER_PATH_NOTE/.test(v2) && /\u4f1a\u8bdd cwd/.test(v2) && /\u7edd\u5bf9\u524d\u7f00/.test(v2), '* v2 uses the OTHER mechanism: one PAPER_PATH_NOTE stating the session-cwd + absolute-prefix rule')
  const uses = (v2.match(/PAPER_PATH_NOTE/g) || []).length
  // (D3 fixed the duplicate: the note no longer belongs in the evidence ENTRY list.) Assert the
  // STRUCTURE, not an occurrence count: defined once, appended by each member-facing material text,
  // and never embedded in a bare data entry.
  const noteDef = (v2.match(/const PAPER_PATH_NOTE/g) || []).length
  assert(noteDef === 1, '* v2 defines PAPER_PATH_NOTE exactly once (found ' + noteDef + ')')
  const noteLines = v2.split(/\r?\n/).filter((l) => l.includes('PAPER_PATH_NOTE'))
  const embeds = noteLines.filter((l) => !/const PAPER_PATH_NOTE/.test(l) && !/[+]|push\(/.test(l))
  assert(embeds.length === 0, '* v2 never embeds the prose rule in a bare data entry (' + JSON.stringify(embeds).slice(0, 80) + ')')
  const bodyOf = (src, fn) => {
    const a = src.indexOf('function ' + fn)
    if (a < 0) return null
    const b = src.slice(a + 10).search(/\n {2}(?:async )?function /)
    if (b < 0) return null            // STRICT bound: no fixed-length fallback (window bleed lesson)
    return src.slice(a, a + 10 + b)
  }
  // RULING (B): the index is a DATA LIST (prose-free); the delivered member-facing material that carries
  // the paths is the digest, and it must append the note. (The other consumer, paperEmitArtifacts ->
  // paperBuildMarkdown, produces the FINAL PAPER ARTIFACT for humans, not a member prompt.)
  assert(!/PAPER_PATH_NOTE/.test(bodyOf(v2, 'paperEvidenceIndex') || ''), '* v2: the evidence-index DATA LIST embeds no prose rule')
  assert(/PAPER_PATH_NOTE/.test(bodyOf(v2, 'buildPaperDigest') || ''), '* v2: the delivered digest material appends PAPER_PATH_NOTE')
  assert(bodyOf(v2, 'buildPaperDigest') !== null && bodyOf(v2, 'paperEvidenceIndex') !== null, '* v2: both windows are bounded strictly (no fixed-length fallback)')
}
section('N7 delivered prompts carry no labelled-but-empty slot (proposer/agenda/target)')
{
  const P = await establish()
  const txt = await P.prompts('verify', 'r-1', { target: 'p-nopowner', stage: 'independent' })
  assert(txt.length > 100 && /verifying object p-nopowner/.test(txt), '* the delivered verify prompt is non-trivial and names the target (non-vacuity: an empty prompt must not pass below)')
  assert(!/\u63d0\u51fa\u8005\s*\uff09/.test(txt), '* no labelled-but-empty proposer slot in the delivered frame (\u63d0\u51fa\u8005 + ) )')
  assert(!/agenda:\s*[)\uff09]/.test(txt), '* no labelled-but-empty agenda slot in the delivered frame')
  const src = readFileSync(fileURLToPath(new URL('../vibe-math-v4/vibe-math-v4.js', import.meta.url)), 'utf8')
  assert(/String\(vs\.targetOwner\|\|''\)\.trim\(\)\?/.test(src), '* the proposer segment is assembled ONLY when a value exists (source-level: the office is never invented)')
}
section('N8 the meeting frame\'s relay claim matches reality (no promise of speeches that do not exist)')
{
  const P = await establish()
  const noPrior = await P.prompts('meeting', 'r-1')
  assert(noPrior.length > 100 && /A meeting is in progress/.test(noPrior), '* the meeting frame is non-trivial (non-vacuity)')
  assert(!/\u4e0b\u9762\u5df2\u6709\u4eba\u53d1\u8a00/.test(noPrior), '* with NO prior statements the frame does not claim that others have spoken (\u4e0b\u9762\u5df2\u6709\u4eba\u53d1\u8a00)')
  assert(/\u5e76\u884c\u72ec\u7acb\u53d1\u8a00/.test(noPrior), '* …instead it states the real semantics: this round is parallel independent statements')
  const src = readFileSync(fileURLToPath(new URL('../vibe-math-v4/vibe-math-v4.js', import.meta.url)), 'utf8')
  assert(/\(prior\?'\\n\u8fd9\u662f\u4e00\u573a\u771f\u5b9e\u8ba8\u8bba/.test(src), '* the relay claim is gated on prior existing (source-level)')
  assert(/\(prior\?\(\'\\n\\n### \u5df2\u6709\u53d1\u8a00/.test(src), '* the forwarded-speech block is still delivered whenever prior exists')
}
section('N9 behavioural: a write to the DOCUMENTED path is counted by countArtifacts (auto-meeting basis)')
{
  const P = await establish()
  const st0 = await P.callTool('vibe_v4_status', {})
  assert(typeof st0.artifactCount === 'number', '* status exposes artifactCount (the auto-meeting basis) - keys: ' + JSON.stringify(Object.keys(st0).slice(0, 14)))
  const rec = await P.callTool('vibe_v4_record_proposition', { id: 'p-docpath', statement: '文档路径行为证明', value: 0.5, motive: 'm', p: 0.5 }, P.resAgent(P.childOf('r-1')))
  assert(rec.ok === true, '* a member card is recorded through the tool (returned ' + JSON.stringify(rec).slice(0, 120) + ')')
  const st1 = await P.callTool('vibe_v4_status', {})
  assert(st1.artifactCount > st0.artifactCount, '* the card written to the DOCUMENTED path (Propos/<id>/<id>.md at the project root) IS counted by countArtifacts (' + st0.artifactCount + ' -> ' + st1.artifactCount + ')')
  const files = P.host && P.host.fsWrites ? P.host.fsWrites.map((w) => String(w.path || '')).join(',') : ''
  assert(files.indexOf('Members/') === -1, '* no write landed under Members/ (the shape nothing scans) - writes: ' + files.slice(0, 160))
}
console.log('')
console.log('passed=' + passed + ' failed=' + failed)
if (failed) { console.error('FAILURES:'); for (const f of failures) console.error('  - ' + f); process.exit(1) }
console.log('ALL GREEN')
process.exit(0)

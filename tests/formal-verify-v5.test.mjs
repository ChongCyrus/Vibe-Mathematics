// ============================================================
// V5 LEAN FORMAL VERIFICATION SUITE  (docs/formal-verification.md)
//
// Asserts the whole contract of the `formalVerify` knob:
//   · 'off'       is a TRUE no-op (no Lean text anywhere, no gate)
//   · 'encourage' injects the Lean section AND — the actual point of the feature — turns the
//                 voting prompt into a FIDELITY review once a Lean run has passed
//   · 'require'   withholds a true/false verdict as 未定论 until the object is Lean-passed
//                 or carries an explicit, reasoned blocker record; then allows it, and the
//                 Verified card records how strong the result really is
//   · the three tools (run / archive / lib) write the right things to the right paths
//
// The Lean toolchain is mocked through the subprocess SERVICE, so the tests exercise the
// real code path (resolveExecutable → spawn → collected stdout → exit code) without
// requiring Lean to be installed.
//
// Run: node tests/formal-verify-v5.test.mjs
// ============================================================
import { mkdtempSync, existsSync, readFileSync, mkdirSync, writeFileSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname, isAbsolute } from 'node:path'
import { fileURLToPath } from 'node:url'

const PLUGIN = process.env.V5_PLUGIN
  ? new URL('file:///' + String(process.env.V5_PLUGIN).replace(/\\/g, '/'))
  : new URL('../vibe-math-v5/vibe-math-v5.js', import.meta.url)
const WS = mkdtempSync(join(tmpdir(), 'vibe-v5-lean-'))

let passed = 0, failed = 0
const failures = []
const assert = (c, m) => { if (c) { passed++; console.log('  ok - ' + m) } else { failed++; failures.push(m); console.error('  FAIL - ' + m) } }
const sleep = ms => new Promise(r => setTimeout(r, ms))
const section = (t) => console.log('\n[' + t + ']')

// ---------------------------------------------------------------
// mock host
// ---------------------------------------------------------------
function makeProjectionRegistry() {
  const units = new Map(); const cells = new Map()
  const cellMap = (s) => { const id = String(s.id); let m = cells.get(id); if (!m) { m = new Map(); cells.set(id, m) } return m }
  return {
    register(def) { units.set(def.key, def); return () => { units.delete(def.key) } },
    stateOf(session, key) {
      const def = units.get(key); if (!def) return undefined
      const m = cellMap(session)
      if (!m.has(key)) m.set(key, def.init(session.header, session.inheritedEventCount || 0))
      return m.get(key)
    },
    _drive(session, event) {
      const m = cellMap(session)
      for (const [k, def] of units) {
        const cur = m.has(k) ? m.get(k) : def.init(session.header, session.inheritedEventCount || 0)
        let next; try { next = def.apply(cur, event) } catch (e) { next = cur }
        m.set(k, next)
      }
    },
  }
}

const projections = makeProjectionRegistry()
const listeners = {}
const toolRegs = []
const liveAgents = new Map()
const spawns = []
const wakes = []
const delivered = []
const leanRuns = []

// A fake Lean: a file PASSES unless it still contains `sorry` or the marker `-- FAIL`.
// This mirrors the one property that matters for the feature — an exit code that says
// "the kernel accepted this".
let toolchainAvailable = true
// A host with NO `subprocess` service at all: `ctx.get('subprocess')` returns undefined, which
// must become a readable NO_SUBPROCESS result (and must NOT stop the code from being archived).
let noSubprocess = false
// A run that HANGS: `hangLean` makes the fake toolchain return a `done` that only settles
// after `hangMs` (far beyond any cap the tests use), so the run can only be reported as a
// timeout by actually racing `done` against a timer. `terminations` records every
// `handle.terminate()` call, which is the observable proof that the guard fired.
let hangLean = false
let hangMs = 60000
const terminations = []
let subprocess = {
  async resolveExecutable(cmd) {
    if (!toolchainAvailable) throw new Error('spawn lean ENOENT')
    if (String(cmd) !== 'lean') throw new Error('unknown executable ' + cmd)
    return 'lean'
  },
  spawn(spec) {
    const file = spec.argv[spec.argv.length - 1]
    const text = existsSync(file) ? readFileSync(file, 'utf8') : ''
    const bad = /sorry|-- FAIL/.test(text)
    leanRuns.push({ argv: spec.argv.slice(0, -1), file, cwd: spec.cwd })
    const stdout = bad ? '' : 'ok\n'
    const stderr = bad ? 'error: declaration uses sorry\n' : ''
    const done = hangLean
      ? new Promise(r => setTimeout(() => r({ exitCode: 0, signal: null }), hangMs))
      : Promise.resolve({ exitCode: bad ? 1 : 0, signal: null })
    return {
      done,
      collected: {
        stdout: { readFrom: () => ({ text: stdout, nextOffset: stdout.length, lossy: false }) },
        stderr: { readFrom: () => ({ text: stderr, nextOffset: stderr.length, lossy: false }) },
      },
      terminate() { terminations.push(file) },
    }
  },
}

function makeMockSession(id, parentSession) {
  const events = []
  const s = {
    id,
    header: { version: 1, id, createdAt: Date.now(), cwd: WS, parentSession, isSeeded: false },
    inheritedEventCount: 0,
    get seq() { return events.length },
    append(type, data) { const ev = { type, data, seq: events.length, time: Date.now() }; events.push(ev); projections._drive(s, ev); return ev },
    deriveMessages() { return [] },
    snapshotEvents(from) { return events.slice(from || 0) },
    ownEvents() { return events.slice() },
    _events: events,
  }
  return s
}

const roots = new Map()
let rootSeq = 0
function makeRoot() {
  const id = 'sess-' + String.fromCharCode(65 + rootSeq++)
  const session = makeMockSession(id, undefined)
  const root = { id, options: { provider: 'mock', model: 'm' }, session, ctx: undefined }
  roots.set(id, root)
  return root
}

const ctx = {
  get(name) {
    if (name === 'sessionProjections') return projections
    if (name === 'sandboxPolicy') return undefined
    if (name === 'compaction') return undefined
    if (name === 'subprocess') return noSubprocess ? undefined : subprocess
    return undefined
  },
  on(e, fn) { (listeners[e] = listeners[e] || []).push(fn) },
  effect(fn) { const d = fn(); return () => { if (typeof d === 'function') d() } },
  logger: { info() {}, warn() {}, error() {} },
  timeout(cb, ms) { const h = setTimeout(cb, ms); return () => clearTimeout(h) },
  tools: { register(spec) { toolRegs.push(spec); return () => {} } },
  commands: { register() { return () => {} } },
  sessions: { async flush() { return true } },
  subagents: {
    list() { return ['spawn'] },
    async startContinuable({ label, request }) {
      const rootId = (request && request.parent && request.parent.id) || 'sess-A'
      const id = 'c' + (spawns.length + 1)
      liveAgents.set(id, { id, session: makeMockSession(id, rootId), options: request && request.agentOptions })
      spawns.push({ label, childId: id, rootId, persona: request && request.persona, prompt: request && request.prompt && request.prompt[0] && request.prompt[0].text })
      return { childId: id, messageId: 'm' + spawns.length }
    },
    async sendMessage(parent, childId, blocks) {
      wakes.push({ childId, rootId: (parent && parent.id) || 'sess-A', prompt: (blocks && blocks[0] && blocks[0].text) || '' })
      return 'w' + (wakes.length + delivered.length)
    },
    interrupt() {},
    async drainContinuableChildren(parent, ids) { for (const i of ids) liveAgents.delete(i) },
  },
  agents: {
    roots() { return [...roots.values()] },
    get(id) { return roots.get(id) || liveAgents.get(id) },
    list() { return [...roots.values(), ...liveAgents.values()] },
  },
  fs: {
    async resolve(rel, opts) {
      const b = (opts && opts.cwd) || WS
      const p = (typeof rel === 'string' && isAbsolute(rel)) ? rel.replace(/\//g, '\\') : join(b, ...String(rel).split('/'))
      return { targetKey: p, displayPath: p }
    },
    async stat(t) { return existsSync(t.targetKey) ? { version: 'v1', type: 'file', size: 1 } : undefined },
    async readText(t) { return readFileSync(t.targetKey, 'utf8') },
    async writeText(t, c) { mkdirSync(dirname(t.targetKey), { recursive: true }); writeFileSync(t.targetKey, c, 'utf8') },
    async listDir(t) { if (!existsSync(t.targetKey)) return []; return readdirSync(t.targetKey, { withFileTypes: true }).map(e => ({ name: e.name, type: e.isDirectory() ? 'directory' : 'file' })) },
  },
}

const mod = await import(PLUGIN.href + '?t=' + Date.now())
;(mod.default || mod).apply(ctx)

// ---------------------------------------------------------------
// driving helpers
// ---------------------------------------------------------------
async function callTool(name, args, agent) {
  const spec = toolRegs.find(x => x.name === name)
  if (!spec) throw new Error('no tool ' + name)
  return JSON.parse(await spec.execute(args || {}, { agent }))
}
const childAgent = (childId) => liveAgents.get(childId)
function fireEnd(childId, reply) {
  const blocks = reply === undefined ? [] : [{ type: 'text', text: '```json\n' + JSON.stringify(reply) + '\n```' }]
  for (const h of (listeners['subagent/end'] || [])) {
    h({ id: childId, runId: 'r', provider: 'spawn', local: true, stopReason: 'completed', lastAssistantMessage: blocks })
  }
}
const settle = async () => { await sleep(30) }
const memberOfChild = (childId) => { const s = spawns.find(x => x.childId === childId); const m = s ? /vibe5 (\S+) /.exec(s.label) : null; return m ? m[1] : '' }
const spawnOf = (root, id) => spawns.find(s => s.rootId === root.id && s.label.indexOf('vibe5 ' + id + ' ') !== -1)
const childOf = (root, id) => { const s = spawnOf(root, id); return s ? s.childId : '' }
const spawnsFor = (root) => spawns.filter(s => s.rootId === root.id)

let votePlan = new Map()
async function drainWakes(budget, root) {
  let n = 0
  while (n < budget) {
    const idx = wakes.findIndex(w => !root || w.rootId === root.id)
    if (idx === -1) break
    const w = wakes.splice(idx, 1)[0]
    const owner = memberOfChild(w.childId)
    delivered.push({ prompt: w.prompt, owner, rootId: w.rootId })
    let reply
    if (/【求真表决/.test(w.prompt)) {
      const target = (/"target"\s*:\s*"([^"]+)"/.exec(w.prompt) || [])[1] || ''
      const v = votePlan.has(owner) ? votePlan.get(owner) : 0.5
      reply = { verdict: { target, verdict: v, reason: owner + ' 的判断' }, contextPct: 20 }
    } else if (/【研究所会议/.test(w.prompt)) reply = { input: owner + '：意见。', solved: false, contextPct: 20 }
    else reply = { progress: owner + '：继续推进。', solved: false, contextPct: 20 }
    fireEnd(w.childId, reply)
    n++
    await settle()
  }
  return n
}
async function settleInstitute(root, rounds = 12) {
  for (let i = 0; i < rounds; i++) {
    await drainWakes(40, root)
    await sleep(20)
    const st = await callTool('vibe_v5_status', {}, root)
    if (!st.members.some(m => m.busy) && !st.meeting && !st.verify && wakes.filter(w => w.rootId === root.id).length === 0) return st
  }
  return await callTool('vibe_v5_status', {}, root)
}
async function foundInstitute(root, problem, params) {
  await callTool('vibe_v5_start', Object.assign({ problem, researcherCount: 2 }, params || {}), root)
  for (const sp of spawnsFor(root)) { fireEnd(sp.childId, { progress: memberOfChild(sp.childId) + '：初见解。', solved: false, contextPct: 10 }); await settle() }
  await callTool('vibe_v5_set', { maxParallel: 8 }, root)
  return await settleInstitute(root)
}
// Vote a verdict through to completion. `waitRounds` bounds the debate loop.
async function voteToConclusion(root, target, plan, rounds = 5) {
  votePlan = plan
  for (let i = 0; i < rounds; i++) {
    delivered.length = 0
    await settle(); await drainWakes(10, root)
    const st = await callTool('vibe_v5_status', {}, root)
    if (!st.verify || st.verify.target !== target) return st
    if (st.undecided.indexOf(target) !== -1 || st.verified.indexOf(target) !== -1) return st
  }
  return await callTool('vibe_v5_status', {}, root)
}

// Deterministically wake ONE member and answer with a chosen reply.
// Firing an end for a member that has no in-flight turn is a no-op (the in-flight token is
// what makes onMemberEnd honour the event), so the wake must be created first.
async function wakeAndReply(root, memberId, reply, fromMember) {
  delivered.length = 0
  await callTool('vibe_v5_say', { to: memberId, text: '请处理这件事。' }, childAgent(childOf(root, fromMember || 'acad')))
  await settle()
  const idx = wakes.findIndex(w => w.rootId === root.id && memberOfChild(w.childId) === memberId)
  if (idx === -1) return null
  const w = wakes.splice(idx, 1)[0]
  fireEnd(w.childId, reply)
  await settle()
  await drainWakes(8, root)
  return w
}

const instRootOf = (root) => join(WS, 'VibeMath', 'Projects', 'default', 'Institutes', 'institute')
const vibeRoot = join(WS, 'VibeMath')
const readIf = (p) => (existsSync(p) ? readFileSync(p, 'utf8') : '')
// Every Lean tool mention in AGENT-FACING text must be the registered name (vibe_v5_lean_*).
// An abbreviated `lean_archive` is not a tool: an agent that copies it calls nothing.
const noBareLeanTool = (t) => !/(^|[^a-z_])lean_(run|archive|lib)/.test(String(t || ''))

// ===============================================================
console.log('-- V5 Lean formal verification --')

// ---------- 1. 'off' is a true no-op ----------
section("1 'off' (default) is a true no-op")
const RA = makeRoot()
const st0 = await foundInstitute(RA, '形式化开关默认关闭测试')
assert(st0.params.formalVerify === 'off', "the default is 'off' (got " + st0.params.formalVerify + ')')
{
  const allPrompts = spawnsFor(RA).map(s => s.prompt || '').join('\n') + '\n' + delivered.filter(d => d.rootId === RA.id).map(d => d.prompt).join('\n')
  assert(!/Lean/.test(allPrompts), 'no founding/round prompt mentions Lean in off mode')
  assert(!/形式化/.test(allPrompts), 'no prompt mentions 形式化 in off mode')
  assert(!/\[形式化\]/.test(allPrompts), 'the [形式化] state line is absent in off mode')
}
// an off-mode verification must behave exactly as before (no gate at all)
await callTool('vibe_v5_record_proposition', { id: 'p-off', statement: '关模式下的普通命题', value: 0.6, motive: 'm', p: 0.8 }, childAgent(childOf(RA, 'r-1')))
await callTool('vibe_v5_propose_verify', { target: 'p-off', kind: 'proposition', reason: '直接表决' }, childAgent(childOf(RA, 'r-1')))
const offDone = await voteToConclusion(RA, 'p-off', new Map([['acad', 1], ['r-1', 1], ['r-2', 1]]))
assert(offDone.verified.indexOf('p-off') !== -1, "'off' mode still finalizes on a unanimous boolean vote with NO Lean artifact")
assert(existsSync(join(instRootOf(RA), 'Verified', '命题', 'p-off.md')), "the Verified card was written in 'off' mode")
assert(!/形式化/.test(readIf(join(instRootOf(RA), 'Verified', '命题', 'p-off.md'))), 'the card carries no formal line in off mode')
// the tools still EXIST in off mode (static registration), they are just never advertised
assert(!!toolRegs.find(t => t.name === 'vibe_v5_lean_run') && !!toolRegs.find(t => t.name === 'vibe_v5_lean_archive') && !!toolRegs.find(t => t.name === 'vibe_v5_lean_lib'),
  'the three Lean tools are registered in every mode (registration is static)')

// ★ The mode switch must be REACHABLE THROUGH THE TOOL SCHEMA (2.3.2 defect D1) ──────────────
// Every tool schema here is closed (`additionalProperties:false`), so a key the schema does not
// advertise is REJECTED by any schema-validating provider. v3 shipped 2.3.0/2.3.1 with all four Lean
// parameters missing from the set-params schema while every assertion in this file stayed green —
// because the suite calls the handler DIRECTLY and never inspects the registered schema. The feature
// could not be switched on at all through the tool interface.
{
  const setSpec = toolRegs.find((t) => t.name === 'vibe_v5_set')
  assert(!!setSpec, "vibe_v5_set is registered")
  assert(setSpec.parameters && setSpec.parameters.type === 'object' && setSpec.parameters.additionalProperties === false,
    '★ vibe_v5_set publishes a CLOSED object schema (an unlisted key is rejected, so the schema IS the contract)')
  for (const k of ['formalVerify', 'leanCommand', 'leanArgs', 'leanTimeoutMs']) {
    assert(Object.prototype.hasOwnProperty.call(setSpec.parameters.properties, k),
      '★ the registered schema advertises ' + k + ' (every other surface documents it; a schema that omits it makes the switch unreachable)')
  }
  assert(JSON.stringify(setSpec.parameters.properties.formalVerify.enum) === JSON.stringify(['off', 'encourage', 'require']),
    'the schema narrows formalVerify to the three real modes (a typo must not be a fourth)')
}

// A stray `formal` reply in OFF mode must be INERT: the field is not offered in the reply contract
// there, and honouring it would create Formal/ state in a mode documented as a "TRUE no-op" (the
// TOOLS stay usable on purpose — a tool call is deliberate, a stray reply field is not).
{
  const wOff = await wakeAndReply(RA, 'r-1', {
    progress: '关模式下的普通回轮。',
    formal: { target: 'p-off-stray', decision: 'blocked', note: '不应被记录' },
    contextPct: 20,
  })
  assert(!!wOff, 'off mode: a wake carrying a stray formal reply was fed to the framework')
  const stOff2 = await callTool('vibe_v5_status', {}, RA)
  assert((stOff2.formal.objects || []).length === 0, '★ a stray `formal` reply in off mode records NO formal object')
  assert((stOff2.formal.todo || []).length === 0, '★ and adds nothing to the formalization TODO')
  assert(!/p-off-stray/.test(readIf(join(instRootOf(RA), 'Formal', 'TODO.md'))), '★ and writes no TODO entry for it')
}

// ---------- 2. parameter validation ----------
section('2 parameter validation and runtime switching')
const RB = makeRoot()
await foundInstitute(RB, '形式化参数校验测试')
const bad = await callTool('vibe_v5_set', { formalVerify: 'banana' }, RB)
assert(bad.params.formalVerify === 'off', "an unknown mode degrades to 'off', never to a stronger mode (got " + bad.params.formalVerify + ')')
const enc = await callTool('vibe_v5_set', { formalVerify: 'encourage' }, RB)
assert(enc.params.formalVerify === 'encourage', "'encourage' is accepted")
const req = await callTool('vibe_v5_set', { formalVerify: 'require', leanTimeoutMs: -5, leanCommand: '   ' }, RB)
assert(req.params.formalVerify === 'require', "'require' is accepted")
assert(req.params.leanTimeoutMs === 120000, 'a non-positive leanTimeoutMs falls back to the default (' + req.params.leanTimeoutMs + ')')
assert(req.params.leanCommand === 'lean', 'a blank leanCommand falls back to "lean"')
await callTool('vibe_v5_set', { leanCommand: 'lake', leanArgs: ['env', 'lean'] }, RB)
const stL = await callTool('vibe_v5_status', {}, RB)
assert(stL.params.leanCommand === 'lake' && stL.params.leanArgs.join(' ') === 'env lean', 'leanCommand/leanArgs are settable (lake env lean)')

// ---------- 3. 'encourage' injection ----------
section("3 'encourage' injects the Lean section into the right prompts")
const RC = makeRoot()
await foundInstitute(RC, '鼓励模式注入测试')
await callTool('vibe_v5_set', { formalVerify: 'encourage' }, RC)
{
  // a plain work round must carry the "formalize reusable things as you go" line
  delivered.length = 0
  await callTool('vibe_v5_say', { to: 'r-1', text: '请继续。' }, childAgent(childOf(RC, 'acad')))
  await settle(); await drainWakes(6, RC)
  const work = delivered.filter(d => d.rootId === RC.id).map(d => d.prompt).join('\n')
  assert(/\[形式化\] 鼓励 Lean/.test(work), "the state block gains a [形式化] 鼓励 Lean line")
  assert(/【顺手形式化（鼓励）】/.test(work), 'the work round tells members to formalize reusable objects as they go')
  assert(/vibe_v5_lean_archive kind='def'/.test(work), 'the work round points at the archive tool for reusable definitions')
  assert(noBareLeanTool(work), 'no abbreviated tool name appears in the injected work-round prompt')
  assert(/归档前先跑通/.test(work), 'the work-round prompt requires a green run before archiving into the reuse library')
}
await callTool('vibe_v5_record_proposition', { id: 'p-enc', statement: '鼓励模式下的忠实性审查', value: 0.6, motive: 'm', p: 0.8 }, childAgent(childOf(RC, 'r-1')))
await callTool('vibe_v5_propose_verify', { target: 'p-enc', kind: 'proposition', reason: '先看看提示词' }, childAgent(childOf(RC, 'r-1')))
await settle(); delivered.length = 0; await drainWakes(3, RC)
{
  const vp = delivered.filter(d => d.rootId === RC.id).map(d => d.prompt).join('\n')
  assert(/【Lean 形式化验证（鼓励模式）】/.test(vp), 'the voting prompt explains the Lean mode')
  assert(/一旦 Lean 通过，你唯一需要确认的就是忠实性/.test(vp), 'the voting prompt states that a passing Lean run shrinks the question to fidelity')
  assert(/归档可复用定义\/引理前先跑通/.test(vp), 'the voting prompt requires a GREEN RUN before archiving a reusable definition')
  assert(/LEAN_NOT_FOUND/.test(vp) && /宿主无 Lean 工具链/.test(vp), 'the voting prompt says what to do when the host has no Lean toolchain')
  assert(/NO_SUBPROCESS/.test(vp), '§6 rule 4: the no-toolchain route names NO_SUBPROCESS too (an agent that only knows LEAN_NOT_FOUND treats a service-less host as an unknown failure and retries)')
  assert(noBareLeanTool(vp), 'no abbreviated tool name appears in the injected voting prompt')
  assert(/实现难度/.test(vp), 'the voting prompt asks for the implementation-difficulty judgement')
  assert(/可以不做，但请在回执的 formal 字段写明难度判断/.test(vp), "'encourage' explicitly allows skipping (with a recorded judgement)")
  assert(/"formal":/.test(vp), 'the reply contract documents the formal field')
  assert(/"decision":"used\|blocked\|defect"/.test(vp), '★ the reply contract offers the defect decision (a faithfulness defect is recordable)')
}
await drainWakes(10, RC)

// ---------- 4. the run tool ----------
section('4 lean_run executes through the subprocess service and reports honestly')
const RD = makeRoot()
await foundInstitute(RD, 'Lean 运行测试')
await callTool('vibe_v5_set', { formalVerify: 'encourage' }, RD)
const instD = instRootOf(RD)
mkdirSync(join(instD, 'Formal'), { recursive: true })
writeFileSync(join(instD, 'Formal', 'good.lean'), 'theorem t : 1 = 1 := rfl\n', 'utf8')
writeFileSync(join(instD, 'Formal', 'bad.lean'), 'theorem t : 1 = 2 := by sorry\n', 'utf8')
const runGood = await callTool('vibe_v5_lean_run', { file: 'Formal/good.lean' }, childAgent(childOf(RD, 'r-1')))
assert(runGood.ok === true && runGood.exitCode === 0, 'a file with no sorry runs green (' + JSON.stringify({ ok: runGood.ok, exitCode: runGood.exitCode }) + ')')
assert(leanRuns.length > 0 && leanRuns[leanRuns.length - 1].cwd.replace(/\\/g, '/') === instD.replace(/\\/g, '/'), 'the toolchain runs with the institute root as cwd')
const runBad = await callTool('vibe_v5_lean_run', { file: 'Formal/bad.lean' }, childAgent(childOf(RD, 'r-1')))
assert(runBad.ok === false && runBad.exitCode === 1, 'a file that still uses sorry reports a red run')
assert(/sorry/.test(runBad.stderr), 'the compiler output is returned verbatim (' + JSON.stringify(runBad.stderr).slice(0, 60) + ')')
const runMissing = await callTool('vibe_v5_lean_run', { file: 'Formal/nope.lean' }, childAgent(childOf(RD, 'r-1')))
assert(runMissing.ok === false && runMissing.code === 'V5_NOT_FOUND', 'a missing file is refused with a typed code')
// The guard's boundary is the VibeMath ROOT, not the institute: the global reuse library
// deliberately lives at <VibeMath>/Formal/{Lib,Proved}, so climbing out of the institute
// but staying inside VibeMath must remain legal (it just fails as a missing file).
const runOutsideInst = await callTool('vibe_v5_lean_run', { file: '../../../Formal/Lib/x.lean' }, childAgent(childOf(RD, 'r-1')))
assert(runOutsideInst.code === 'V5_NOT_FOUND', 'climbing out of the institute but staying inside VibeMath is allowed (the global library lives there)')
const runEscape = await callTool('vibe_v5_lean_run', { file: '../../../../../etc/evil.lean' }, childAgent(childOf(RD, 'r-1')))
assert(runEscape.ok === false && runEscape.code === 'V5_INVALID_ARGUMENT', '★ a traversal that climbs ABOVE the VibeMath root is refused')
const runEscape2 = await callTool('vibe_v5_lean_run', { file: 'Formal/../../../../../../evil.lean' }, childAgent(childOf(RD, 'r-1')))
assert(runEscape2.ok === false && runEscape2.code === 'V5_INVALID_ARGUMENT', 'a deeper traversal is refused too')
const runEscape3 = await callTool('vibe_v5_lean_run', { file: '/etc/evil.lean' }, childAgent(childOf(RD, 'r-1')))
assert(runEscape3.ok === false && runEscape3.code === 'V5_INVALID_ARGUMENT', 'an unrelated absolute path is refused')
const runNotLean = await callTool('vibe_v5_lean_run', { file: 'Formal/good.txt' }, childAgent(childOf(RD, 'r-1')))
assert(runNotLean.ok === false && runNotLean.code === 'V5_INVALID_ARGUMENT', 'only .lean files can be executed')
toolchainAvailable = false
const runNoTc = await callTool('vibe_v5_lean_run', { file: 'Formal/good.lean' }, childAgent(childOf(RD, 'r-1')))
assert(runNoTc.ok === false && runNoTc.code === 'LEAN_NOT_FOUND', 'a missing toolchain returns LEAN_NOT_FOUND instead of crashing')
assert(/仍可把形式化代码写下来归档/.test(runNoTc.message), 'the failure explains the graceful degradation')
toolchainAvailable = true
// docs/formal-verification.md §7: a TIMEOUT must TERMINATE the process. `graceMs` is only a
// request to the host, so a run whose `done` never settles within the cap must be ended by
// `handle.terminate()` — otherwise a runaway toolchain lingers while we report LEAN_TIMEOUT.
{
  const before = terminations.length
  hangLean = true
  hangMs = 60000
  const runHang = await callTool('vibe_v5_lean_run', { file: 'Formal/good.lean', timeout_ms: 1000 }, childAgent(childOf(RD, 'r-1')))
  hangLean = false
  assert(runHang.ok === false && runHang.code === 'LEAN_TIMEOUT', '★ a run that outlives the cap is reported as LEAN_TIMEOUT (got ' + runHang.code + ')')
  assert(runHang.timedOut === true, 'the result is flagged timedOut')
  assert(terminations.slice(before).some(f => /good\.lean$/.test(String(f))), '★ the timeout path really called handle.terminate() (the toolchain is not left running)')
  assert(runHang.signal === 'SIGTERM', 'the synthetic outcome names the signal that ended it')
}
// A host that exposes NO `subprocess` service must produce the readable NO_SUBPROCESS result
// (never a throw into the scheduler), must leave the object record honest (`attempted`, and NOT
// passed), and must still let the code be written down through the archive route.
{
  noSubprocess = true
  const runNoSvc = await callTool('vibe_v5_lean_run', { file: 'Formal/good.lean', target: 'p-nosub' }, childAgent(childOf(RD, 'r-1')))
  assert(runNoSvc.ok === false && runNoSvc.code === 'NO_SUBPROCESS', '★ a host with no subprocess service returns NO_SUBPROCESS instead of throwing (got ' + runNoSvc.code + ')')
  assert(typeof runNoSvc.message === 'string' && /no subprocess service/.test(runNoSvc.message), 'the result explains why Lean cannot run here')
  const stNoSvc = await callTool('vibe_v5_status', {}, RD)
  assert(stNoSvc.ok === true, 'the institute still answers status after that (nothing was thrown into the scheduling loop)')
  const recNoSvc = (stNoSvc.formal.objects || []).find(o => o.target === 'p-nosub') || {}
  assert(recNoSvc.status === 'attempted', 'the run is recorded as attempted (no toolchain = no proof), got ' + recNoSvc.status)
  assert(!recNoSvc.proof, 'and it is NOT recorded as passed')
  // The way out (contract §6 rule 4): the code can still be written down. The archive route
  // itself needs no toolchain at all.
  const arcNoSvc = await callTool('vibe_v5_lean_archive', { kind: 'proof', target: 'p-nosub', content: 'theorem p_nosub : 1 + 1 = 2 := by decide\n' }, childAgent(childOf(RD, 'r-1')))
  assert(arcNoSvc.ok === true && arcNoSvc.passed === false && arcNoSvc.run && arcNoSvc.run.code === 'NO_SUBPROCESS',
    'the code is still written down and archived with no toolchain, and the record stays honest (' + JSON.stringify({ ok: arcNoSvc.ok, status: arcNoSvc.status, code: arcNoSvc.run && arcNoSvc.run.code }) + ')')
  assert(existsSync(join(instD, 'Formal', 'p-nosub.lean')), 'the working file exists on disk even though nothing could execute it')
  assert(!existsSync(join(instD, 'Verified', 'Lean', 'p-nosub.lean')), '★ nothing is promoted to Verified/Lean/ without a green run')
  noSubprocess = false
}

// ---------- 5. archive a proof → the vote becomes a FIDELITY review ----------
section('5 a passing proof flips the review subject to fidelity')
const arc = await callTool('vibe_v5_lean_archive', {
  kind: 'proof', target: 'p-proof', content: 'theorem p_proof : 3 * 1 ^ 2 - 2 = (1:Nat) ^ 2 := by decide\n', note: '',
}, childAgent(childOf(RD, 'r-1')))
assert(arc.ok === true && arc.passed === true, 'the proof is archived and passes (' + JSON.stringify({ ok: arc.ok, passed: arc.passed }) + ')')
assert(arc.file === 'Formal/p-proof.lean', 'the working file is Formal/<target>.lean')
assert(arc.proof === 'Verified/Lean/p-proof.lean', 'the archived proof path is Verified/Lean/<target>.lean')
assert(existsSync(join(instD, 'Formal', 'p-proof.lean')), 'the working file exists on disk')
assert(existsSync(join(instD, 'Verified', 'Lean', 'p-proof.lean')), '★ the proof is archived under Verified/Lean/ as the proof of that object')
const stD = await callTool('vibe_v5_status', {}, RD)
assert(stD.formal.passed.indexOf('p-proof') !== -1, 'status reports the object as Lean-passed')
const idxD = readIf(join(instD, 'Formal', 'Index.md'))
assert(/p-proof/.test(idxD) && /passed/.test(idxD) && /Verified\/Lean\/p-proof\.lean/.test(idxD), 'Formal/Index.md indexes the object, its status and its archived proof')
// now the voting prompt must ASK FOR FIDELITY, not for a re-derivation
await callTool('vibe_v5_record_proposition', { id: 'p-proof', statement: '3N²−2=b² 在 N=1 时成立', value: 0.6, motive: 'm', p: 0.9 }, childAgent(childOf(RD, 'r-1')))
await callTool('vibe_v5_propose_verify', { target: 'p-proof', kind: 'proposition', reason: '已有 Lean 证明' }, childAgent(childOf(RD, 'r-1')))
await settle(); delivered.length = 0; await drainWakes(3, RD)
{
  const vp = delivered.filter(d => d.rootId === RD.id).map(d => d.prompt).join('\n')
  assert(/该对象已有\*\*通过的 Lean 形式化证明\*\*/.test(vp), 'the voting prompt announces the passing proof')
  assert(/你不需要重新检查推导/.test(vp), '★ it tells voters NOT to re-derive')
  assert(/忠实性审查/.test(vp), '★ it tells voters the review subject is now fidelity')
  assert(/定义 \/ 对象 \/ 条件 \/ 假设 \/ 结论是否与命题原文\*\*完全一致\*\*/.test(vp), 'it enumerates exactly what fidelity means')
  assert(/不要投 0/.test(vp), '★ a faithfulness defect must NOT be expressed as 0 (that would record 命题为假)')
  assert(/形式化不合格/.test(vp), 'it names the failure a formalisation defect, not a refutation')
  assert(/decision:'defect'/.test(vp), 'it names the defect reply channel')
  assert(!/偏离 → 0/.test(vp), '★ the old "any deviation → 0" instruction is GONE')
  assert(/本档没有门禁：请务必给一个严格介于 0 与 1 之间的弃权值，以保证本轮无法得出一致结论/.test(vp),
    '★ encourage mode is explicit that there is NO gate and the voter\'s abstention is what prevents a conclusion (wording shared with v2/v3/v4)')
  assert(noBareLeanTool(vp), 'no abbreviated tool name appears in the fidelity prompt')
}
await drainWakes(10, RD)

// ---------- 6. the reusable cross-project library ----------
section('6 reusable definitions and lemmas go to the GLOBAL library')
const libPath = join(vibeRoot, 'Formal', 'Lib')
const provedPath = join(vibeRoot, 'Formal', 'Proved')
const defRes = await callTool('vibe_v5_lean_archive', { kind: 'def', name: 'ZMod5', content: 'def ZMod5 := Fin 5\n' }, childAgent(childOf(RD, 'r-1')))
assert(defRes.ok === true && defRes.file === 'Formal/Lib/ZMod5.lean', 'a reusable definition is archived to the global lib (' + defRes.file + ')')
assert(existsSync(join(libPath, 'ZMod5.lean')), '★ the definition exists under VibeMath/Formal/Lib/ (cross-project, NOT inside the institute)')
assert(!existsSync(join(instD, 'Formal', 'Lib', 'ZMod5.lean')), 'it is NOT duplicated inside the institute tree')
const lemRes = await callTool('vibe_v5_lean_archive', { kind: 'lemma', name: 'sq_odd', content: 'theorem sq_odd (n : Nat) : Odd (n*n) → Odd n := by omega\n' }, childAgent(childOf(RD, 'r-1')))
assert(lemRes.ok === true && lemRes.file === 'Formal/Proved/sq_odd.lean', 'a lemma is archived to Proved/')
assert(existsSync(join(provedPath, 'sq_odd.lean')), 'the lemma exists under VibeMath/Formal/Proved/')
const libIdx = readIf(join(libPath, 'Index.md'))
assert(/ZMod5/.test(libIdx), 'Lib/Index.md lists the new definition')
const provedIdx = readIf(join(provedPath, 'Index.md'))
assert(/sq_odd/.test(provedIdx), 'Proved/Index.md lists the new lemma')
const libList = await callTool('vibe_v5_lean_lib', {}, childAgent(childOf(RD, 'r-1')))
assert(libList.ok === true && libList.counts.lib >= 1 && libList.counts.proved >= 1, 'lean_lib reports the reuse library sizes (' + JSON.stringify(libList.counts) + ')')
assert(libList.objects.some(o => o.target === 'p-proof' && o.status === 'passed'), 'lean_lib lists per-object formal status')
assert(/复用优先/.test(libList.hint || ''), 'lean_lib tells agents to reuse before redefining')
const noName = await callTool('vibe_v5_lean_archive', { kind: 'def', content: 'def x := 1\n' }, childAgent(childOf(RD, 'r-1')))
assert(noName.ok === false && noName.code === 'V5_INVALID_ARGUMENT', 'archiving a definition without a name is refused')
const badKind = await callTool('vibe_v5_lean_archive', { kind: 'nonsense' }, childAgent(childOf(RD, 'r-1')))
assert(badKind.ok === false && badKind.code === 'V5_INVALID_ARGUMENT', 'an unknown archive kind is refused')

// ---------- 7. blocked needs a reason ----------
section('7 a "blocker" record must be explicit and reasoned')
const blkNoNote = await callTool('vibe_v5_lean_archive', { kind: 'blocked', target: 'p-blk' }, childAgent(childOf(RD, 'r-1')))
assert(blkNoNote.ok === false && blkNoNote.code === 'V5_INVALID_ARGUMENT', 'blocked without a note is refused')
const blk = await callTool('vibe_v5_lean_archive', { kind: 'blocked', target: 'p-blk', note: '需要外层解析数论框架，本轮工作量不可接受' }, childAgent(childOf(RD, 'r-1')))
assert(blk.ok === true && blk.status === 'blocked', 'a reasoned blocker is recorded')
const stBlk = await callTool('vibe_v5_status', {}, RD)
assert(stBlk.formal.blocked.indexOf('p-blk') !== -1, 'status lists the blocked object')
assert(/需要外层解析数论框架/.test(readIf(join(instD, 'Formal', 'Index.md'))), 'the blocker reason is written into the index')

// ---------- 8. the 'require' gate ----------
section("8 'require' withholds a verdict until the formal record exists")
const RE = makeRoot()
await foundInstitute(RE, 'require 门禁测试')
await callTool('vibe_v5_set', { formalVerify: 'require' }, RE)
const instE = instRootOf(RE)
await callTool('vibe_v5_record_proposition', { id: 'p-gate', statement: '必须形式化的命题', value: 0.6, motive: 'm', p: 0.8 }, childAgent(childOf(RE, 'r-1')))
await callTool('vibe_v5_propose_verify', { target: 'p-gate', kind: 'proposition', reason: '直接表决试试' }, childAgent(childOf(RE, 'r-1')))
await settle(); delivered.length = 0; await drainWakes(3, RE)
{
  const vp = delivered.filter(d => d.rootId === RE.id).map(d => d.prompt).join('\n')
  assert(/【Lean 形式化验证（强制模式）】/.test(vp), 'the voting prompt says 强制模式')
  assert(/必须产出 Lean 形式化/.test(vp), "'require' states the formalization is mandatory")
  assert(/本次裁定不会生效/.test(vp), 'the prompt warns that the verdict will not take effect without it')
  assert(/formal-required/.test(vp), 'it names the machine-readable reason code in the prompt itself')
  assert(/vibe_v5_lean_archive/.test(vp) && /kind='blocked'/.test(vp), 'it gives the full tool name for the blocker route')
}
const gated = await voteToConclusion(RE, 'p-gate', new Map([['acad', 1], ['r-1', 1], ['r-2', 1]]))
assert(gated.verified.indexOf('p-gate') === -1, '★ a unanimous TRUE verdict did NOT promote the object to Verified/')
assert(gated.undecided.indexOf('p-gate') !== -1, '★ it is recorded as 未定论 instead')
assert(!existsSync(join(instE, 'Verified', '命题', 'p-gate.md')), 'no Verified card was written')
const todoE = readIf(join(instE, 'Formal', 'TODO.md'))
assert(existsSync(join(instE, 'Formal', 'TODO.md')), 'Formal/TODO.md was created')
assert(/p-gate/.test(todoE) && /formal-required/.test(todoE), '★ the object is on the formalization TODO with the machine-readable reason')
{
  const chat = readdirSync(join(instE, 'Shared', 'Chat')).map(f => readIf(join(instE, 'Shared', 'Chat', f))).join('\n')
  assert(/require 模式.*先有 Lean 通过或显式阻塞记录/.test(chat), 'the withholding is announced in the group chat')
}
// now formalize it and re-verify: the gate must open
const proofNow = await callTool('vibe_v5_lean_archive', { kind: 'proof', target: 'p-gate', content: 'theorem p_gate : 2 + 2 = 4 := by decide\n' }, childAgent(childOf(RE, 'r-1')))
assert(proofNow.ok === true && proofNow.passed === true, 'the object is now Lean-passed')
await callTool('vibe_v5_propose_verify', { target: 'p-gate', kind: 'proposition', reason: '已形式化，重新表决' }, childAgent(childOf(RE, 'r-1')))
const gated2 = await voteToConclusion(RE, 'p-gate', new Map([['acad', 1], ['r-1', 1], ['r-2', 1]]))
assert(gated2.verified.indexOf('p-gate') !== -1, '★ with a passing Lean artifact the same vote DOES promote it')
const card = readIf(join(instE, 'Verified', '命题', 'p-gate.md'))
assert(/- 形式化: Lean 通过/.test(card), '★ the Verified card records how strong the result is (Lean 通过)')
assert(/Verified\/Lean\/p-gate\.lean/.test(card), 'the card points at the archived proof')
// the blocker escape hatch must also open the gate
await callTool('vibe_v5_record_proposition', { id: 'p-blocked-ok', statement: '记录阻塞后可定论', value: 0.6, motive: 'm', p: 0.8 }, childAgent(childOf(RE, 'r-1')))
await callTool('vibe_v5_lean_archive', { kind: 'blocked', target: 'p-blocked-ok', note: '命题涉及未形式化的分析学，本轮不做' }, childAgent(childOf(RE, 'r-1')))
await callTool('vibe_v5_propose_verify', { target: 'p-blocked-ok', kind: 'proposition', reason: '已记录阻塞' }, childAgent(childOf(RE, 'r-1')))
const gated3 = await voteToConclusion(RE, 'p-blocked-ok', new Map([['acad', 1], ['r-1', 1], ['r-2', 1]]))
assert(gated3.verified.indexOf('p-blocked-ok') !== -1, '★ an explicit reasoned blocker also lets the verdict through (decide by difficulty, but decide out loud)')
assert(/- 形式化: 阻塞（/.test(readIf(join(instE, 'Verified', '命题', 'p-blocked-ok.md'))), 'the card records the blocker')

// ---------- 9. the reply-channel judgement ----------
section('9 the per-round `formal` reply channel records the difficulty judgement')
const RF = makeRoot()
await foundInstitute(RF, '回执 formal 通道测试')
await callTool('vibe_v5_set', { formalVerify: 'require' }, RF)
const instF = instRootOf(RF)
await callTool('vibe_v5_record_proposition', { id: 'p-reply', statement: '用回执记录阻塞', value: 0.6, motive: 'm', p: 0.8 }, childAgent(childOf(RF, 'r-1')))
// A member that never calls a Lean tool still has to state its difficulty judgement, so the
// JSON reply channel matters: it is the path that actually fires in practice.
const w1 = await wakeAndReply(RF, 'r-1', {
  progress: '难度太高，本轮不做形式化。',
  formal: { target: 'p-reply', decision: 'blocked', note: '需要大量未形式化的实分析前置知识' },
  contextPct: 20,
})
assert(!!w1, 'r-1 was woken and answered')
const stF = await callTool('vibe_v5_status', {}, RF)
assert(stF.formal.blocked.indexOf('p-reply') !== -1, 'a `formal.decision=blocked` reply is recorded as a blocker')
assert(/实分析前置知识/.test(readIf(join(instF, 'Formal', 'Index.md'))), 'and its reason reaches the index')
// a `used` judgement records the file as attempted (not yet passed — nothing ran green)
const w2 = await wakeAndReply(RF, 'r-2', {
  progress: '我写了形式化草稿。',
  formal: { target: 'p-reply2', decision: 'used', file: 'Formal/p-reply2.lean' },
  contextPct: 20,
})
assert(!!w2, 'r-2 was woken and answered')
const stF2 = await callTool('vibe_v5_status', {}, RF)
assert(stF2.formal.objects.some(o => o.target === 'p-reply2' && o.status === 'attempted'),
  'a `formal.decision=used` reply records the object as attempted with its file')
// a plain `used` judgement must NOT withdraw an ESTABLISHED proof (contract §4): only a fidelity
// defect retracts one. v2 shipped the unconditional downgrade here; all four are asserted behaviourally.
await callTool('vibe_v5_record_proposition', { id: 'p-usedkeep', statement: '已有通过证明后再写一次 used 回执', value: 0.6, motive: 'm', p: 0.8 }, childAgent(childOf(RF, 'r-1')))
{
  const arcU = await callTool('vibe_v5_lean_archive', { kind: 'proof', target: 'p-usedkeep', content: 'theorem p_usedkeep : 2 + 2 = 4 := by decide\n' }, RF)
  assert(arcU.ok === true && arcU.passed === true, 'used-keep: the object starts Lean-passed')
  const wU = await wakeAndReply(RF, 'r-2', {
    progress: '这一轮只是又写了一遍草稿。',
    formal: { target: 'p-usedkeep', decision: 'used', file: 'Formal/p-usedkeep.lean' },
    contextPct: 20,
  })
  assert(!!wU, 'r-2 was woken for the used judgement')
  const stU = await callTool('vibe_v5_status', {}, RF)
  const recU = stU.formal.objects.find((o) => o.target === 'p-usedkeep')
  assert(!!recU && recU.status === 'passed', '★ a `used` reply does NOT downgrade an already-passed object (got ' + JSON.stringify(recU) + ')')
  assert(!!recU && recU.proof === 'Verified/Lean/p-usedkeep.lean', '★ and the proof pointer survives the reply')
  assert(existsSync(join(instF, 'Verified', 'Lean', 'p-usedkeep.lean')), '★ and the archived proof is still on disk')
  assert(stU.formal.passed.indexOf('p-usedkeep') !== -1, '★ status still reports it as Lean-passed')
  const rerunU = await callTool('vibe_v5_lean_run', { file: 'Formal/p-usedkeep.lean', target: 'p-usedkeep' }, RF)
  assert(rerunU.ok === true, 'used-keep: the work file runs green')
  const recU2 = (await callTool('vibe_v5_status', {}, RF)).formal.objects.find((o) => o.target === 'p-usedkeep')
  assert(!!recU2 && recU2.status === 'passed', '★ a plain re-run does not downgrade a passed record (contract §4)')
}
// a blocker with no note must be refused AND reported back to the member
delivered.length = 0
const w3 = await wakeAndReply(RF, 'r-1', { formal: { target: 'p-reply3', decision: 'blocked' }, contextPct: 20 })
assert(!!w3, 'r-1 was woken for the third judgement')
const said = delivered.map(d => d.prompt).join('\n')
assert(/必须写明 note/.test(said), 'a blocked judgement without a note is refused with an explicit notice to the member')
assert((await callTool('vibe_v5_status', {}, RF)).formal.objects.every(o => o.target !== 'p-reply3'),
  'and no blocker record is created for the refused judgement')


// ---------- 10. reporting ----------
section('10 the office can audit formal strength')
const rep = await callTool('vibe_v5_report', {}, RE)
assert(/## Lean 形式化/.test(rep.report), 'the report has a Lean formal-verification section')
assert(/已通过：.*p-gate/.test(rep.report), 'the report lists Lean-passed objects')
assert(/已记录阻塞：.*p-blocked-ok/.test(rep.report), 'the report lists blocked objects')
const stOff = await callTool('vibe_v5_report', {}, RA)
assert(/未启用（`formalVerify` = off/.test(stOff.report), 'in off mode the report says the feature is not enabled')

// ---------- 11. a faithfulness defect withdraws the proof, it is NOT a refutation ----------
section('11 ★ a faithfulness defect withdraws the proof instead of recording 命题为假 (contract §4.1)')
const RG = makeRoot()
await foundInstitute(RG, '忠实性缺陷语义测试')
await callTool('vibe_v5_set', { formalVerify: 'encourage' }, RG)
const instG = instRootOf(RG)
// make p-def Lean-PASSED first: the archived proof is what a defect must withdraw
const arcG = await callTool('vibe_v5_lean_archive', {
  kind: 'proof', target: 'p-def', content: 'theorem p_def : (1:Nat) + 1 = 2 := by decide\n',
}, childAgent(childOf(RG, 'r-1')))
assert(arcG.ok === true && arcG.passed === true, 'p-def is Lean-passed before the review')
assert(existsSync(join(instG, 'Verified', 'Lean', 'p-def.lean')), 'its archived proof exists on disk')
// a voter reports a FIDELITY DEFECT through the reply channel
const wDef = await wakeAndReply(RG, 'r-1', {
  progress: '逐条核对后发现 Lean 陈述与命题不一致。',
  formal: { target: 'p-def', decision: 'defect', note: 'Lean 里把"连续"写成了逐点连续，条件被加强了' },
  contextPct: 20,
})
assert(!!wDef, 'the reviewer was woken and answered with a defect report')
const stG = await callTool('vibe_v5_status', {}, RG)
const recG = (stG.formal.objects || []).find(o => o.target === 'p-def') || {}
assert(recG.status === 'attempted', '★ the object is demoted to attempted (a defect is not a proof any more), got ' + recG.status)
assert(!recG.proof, '★ the archived proof is cleared from the record')
assert(/加强了/.test(String(recG.note || '')), 'the concrete deviation is recorded on the object')
const proofPathG = join(instG, 'Verified', 'Lean', 'p-def.lean')
const proofNowG = existsSync(proofPathG) ? readFileSync(proofPathG, 'utf8') : ''
assert(!existsSync(proofPathG) || /已撤回/.test(proofNowG),
  '★ the archived proof is withdrawn from Verified/Lean/ (deleted, or replaced by a withdrawal notice when the host cannot delete)')
assert(!/theorem p_def/.test(proofNowG), '★ the original proof text is no longer readable as the object\'s proof')
assert(existsSync(join(instG, 'Formal', 'p-def.lean')), 'the working file is kept (the code is not lost)')
const todoG = readIf(join(instG, 'Formal', 'TODO.md'))
assert(/p-def/.test(todoG) && /忠实性缺陷/.test(todoG), 'the object enters Formal/TODO.md as a formalisation defect')
const idxG = readIf(join(instG, 'Formal', 'Index.md'))
assert(/加强了/.test(idxG), 'the human-readable index carries the concrete deviation')
assert(/attempted/.test(idxG) && !/Verified\/Lean\/p-def\.lean/.test(idxG.split('p-def')[1] || ''),
  'the index shows attempted and no longer points at a proof')
// a defect without a note is refused
delivered.length = 0
const wDef2 = await wakeAndReply(RG, 'r-1', { formal: { target: 'p-def2', decision: 'defect' }, contextPct: 20 })
assert(!!wDef2, 'the reviewer was woken for the note-less defect')
assert(/必须写明 note/.test(delivered.map(d => d.prompt).join('\n')), 'a defect without a note is refused with an explicit notice')
assert((await callTool('vibe_v5_status', {}, RG)).formal.objects.every(o => o.target !== 'p-def2'),
  'and no record is created for the refused defect')

// ---------- 12. after a defect, require mode refuses to conclude -------------
section('12 ★ a defect makes the require gate block the conclusion (re-formalise, do not conclude 假)')
await callTool('vibe_v5_set', { formalVerify: 'require' }, RG)
await callTool('vibe_v5_record_proposition', { id: 'p-def', statement: '连续函数在闭区间上一致连续（被写窄的形式化）', value: 0.6, motive: 'm', p: 0.9 }, childAgent(childOf(RG, 'r-1')))
await callTool('vibe_v5_propose_verify', { target: 'p-def', kind: 'proposition', reason: '缺陷后重验' }, childAgent(childOf(RG, 'r-1')))
// every voter says TRUE — without the fix this would be recorded as a concluded object
const stDef = await voteToConclusion(RG, 'p-def', new Map([['acad', 1], ['r-1', 1], ['r-2', 1]]))
assert(stDef.verified.indexOf('p-def') === -1, '★ the object is NOT verified: a withdrawn proof cannot support a conclusion')
assert(stDef.undecided.indexOf('p-def') !== -1, '★ it is recorded as 未定论 and stays in the library')
assert(!existsSync(join(instG, 'Verified', '命题', 'p-def.md')), 'no Verified card is written for it')
assert(/p-def/.test(readIf(join(instG, 'Formal', 'TODO.md'))), 'it is on the formalisation TODO list')

console.log('')
console.log('passed=' + passed + ' failed=' + failed)
if (failed) { console.error('FAILURES:'); for (const f of failures) console.error('  - ' + f); process.exit(1) }
console.log('ALL GREEN')
process.exit(0)

// Multi-session isolation E2E for vibe-math-v2 (standing-mount shared instance).
// Simulates TWO DSH sessions (root agents A and B) that BOTH mount the SAME
// preset plugin instance (as standing mount does in real DSH), and verifies:
//   - each session's spawnChild uses ITS OWN rootAgent as parent
//   - scheduler/registry/params/decisionQueue are isolated per session
//   - subagent/end routes to the owning session via childOwner
//   - current project (current.<sid>.json) is isolated per session
//
// Run: node tests/e2e-multisession.test.mjs  (uses a temp workspace; asserts; exit code)
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'

const PLUGIN = new URL('../vibe-math-v2/vibe-math-v2.js', import.meta.url)

let passed = 0
let failed = 0
function assert(cond, msg) {
  if (cond) { passed++; console.log('  ok - ' + msg) }
  else { failed++; console.error('  FAIL - ' + msg) }
}
// The framework reports shell/mkdir failures through console.error. Capture them (and still print):
// the phantom-mkdir regression below is only visible on that channel, so a suite that swallowed it
// would stay green while the framework could not tell "mkdir ok" from "mkdir failed".
const shellErrors = []
const origConsoleError = console.error.bind(console)
console.error = function (...a) { shellErrors.push(a.map(x => String(x)).join(' ')); return origConsoleError(...a) }

// ---------- ONE shared host ctx (standing mount: ONE plugin instance for ALL sessions) ----------
const WS = mkdtempSync(join(tmpdir(), 'vibe-multi-'))
const listeners = {}
const toolRegs = []
const cmdRegs = []
const spawns = []      // { label, request, childId }
const followups = []
const interrupts = []

const ctx = {
  get(name) {
    if (name === 'subprocess') {
      return {
        async spawn({ argv, cwd, stdio, graceMs }) {
          // emulate the powershell New-Item/Move/Remove used by ensureDirs etc.
          const script = argv[argv.length - 1] || ''
          const fsmod = await import('node:fs')
          const pathmod = await import('node:path')
          if (/New-Item/.test(script)) {
            // The framework asks for the WHOLE directory list in one command
            // (`-Path 'a','b',…`); the old regex only captured the first quoted path, so the
            // mock silently created one directory — which is exactly why a phantom failure could
            // hide here. Parse every quoted path after -Path (the real PowerShell creates them all).
            const head = script.match(/-Path\s+([^|]*)/)
            const raw = (head && head[1]) || ''
            const paths = raw.split(',').map(x => x.trim().replace(/^'|'$/g, '').replace(/^"|"$/g, '').replace(/''/g, "'"))
            for (const p of paths) { if (p) fsmod.mkdirSync(p, { recursive: true }) }
          } else if (/Move-Item/.test(script)) {
            const m = script.match(/-LiteralPath\s+'((?:[^']|'')*)'\s+-Destination\s+'((?:[^']|'')*)'/)
            if (m) { fsmod.mkdirSync(pathmod.dirname(m[2].replace(/''/g, "'")), { recursive: true }); fsmod.renameSync(m[1].replace(/''/g, "'"), m[2].replace(/''/g, "'")) }
          } else if (/Remove-Item/.test(script)) {
            const m = script.match(/-LiteralPath\s+'((?:[^']|'')*)'/)
            if (m) fsmod.rmSync(m[1].replace(/''/g, "'"), { force: true, recursive: true })
          }
          return { done: Promise.resolve({ exitCode: 0 }) }
        },
      }
    }
    return undefined
  },
  on(event, fn) { (listeners[event] = listeners[event] || []).push(fn) },
  effect(fn) { const d = fn(); return () => { if (typeof d === 'function') d() } },
  logger: { info() {}, warn() {}, error() {} },
  tools: { register(spec) { toolRegs.push(spec) } },
  commands: { register(spec) { cmdRegs.push(spec) } },
  subagents: {
    list() { return ['spawn'] },
    async startContinuable({ provider, label, request, signal }) {
      const childId = 'child-' + (spawns.length + 1) + '-' + Math.random().toString(36).slice(2, 6)
      spawns.push({ label, request, childId })
      return { childId }
    },
    async followup(parent, childId, blocks, opts) { followups.push({ parent, childId, blocks, opts }) },
    async sendMessage(parent, childId, blocks, opts) { followups.push({ parent, childId, blocks, opts }) },
    interrupt(childId, authority) { interrupts.push({ childId, authority }) },
  },
  agents: {
    roots() { return [] },
    get(id) { return undefined },
  },
  fs: {
    async resolve(rel, opts) { const base = (opts && opts.cwd) || WS; return join(base, ...String(rel).split('/')) },
    async stat(t) { return existsSync(t) ? { type: 'file' } : undefined },
    async readText(t) { return readFileSync(t, 'utf8') },
    async writeText(t, content) { const fsmod = await import('node:fs'); const pathmod = await import('node:path'); fsmod.mkdirSync(pathmod.dirname(t), { recursive: true }); fsmod.writeFileSync(t, content, 'utf8') },
    async listDir(t) { const fsmod = await import('node:fs'); if (!existsSync(t)) return []; return fsmod.readdirSync(t, { withFileTypes: true }).map(e => ({ name: e.name, type: e.isDirectory() ? 'directory' : 'file' })) },
  },
}

function fireEnd(info) { for (const h of (listeners['subagent/end'] || [])) h(info) }

function makeRoot(id, cwd) {
  return {
    id,
    options: { provider: 'mock', model: 'mock-model' },
    session: { id, header: { cwd, parentSession: undefined } },
    followup() {},
    ctx: undefined,
  }
}

const ROOT_A = makeRoot('sess-A', WS)
const ROOT_B = makeRoot('sess-B', WS)

// ---------- load plugin ONCE (standing mount) ----------
const mod = await import(PLUGIN.href + '?t=' + Date.now())
const plugin = mod.default || mod
plugin.apply(ctx)

console.log('tool registrations:', toolRegs.length)
// 22 → 25: the Lean formal-verification feature (docs/formal-verification.md) added
// vibe_math_lean_run / _lean_archive / _lean_lib, which are registered UNCONDITIONALLY
// (registration is static; the formalVerify mode only decides whether members are told about
// them). 25 → 27: the incremental/async slice (docs/formal-verification.md §1) added the read-only
// vibe_math_lean_read + vibe_math_lean_job, also unconditional and registered on both paths.
// 27 → 28: the math-computation slice (docs/math-computation.md) added math_computation, likewise
// registered unconditionally on both paths.
// The invariant this asserts is "registered ONCE per preset, not per session".
assert(toolRegs.length === 28, '28 tools registered once (not per session)')

// A6：只断言"个数"时，同数改名会照样通过。这里把**名字集合**钉住（身份校验，不只计数）。
const EXPECTED_TOOLS = ["math_computation","vibe_math_abort","vibe_math_add_problem","vibe_math_add_proposition","vibe_math_decide","vibe_math_interrupt_agent","vibe_math_lean_archive","vibe_math_lean_job","vibe_math_lean_lib","vibe_math_lean_read","vibe_math_lean_run","vibe_math_list_agents","vibe_math_list_decisions","vibe_math_list_projects","vibe_math_list_propositions","vibe_math_message_agent","vibe_math_new_project","vibe_math_pause","vibe_math_report","vibe_math_resume","vibe_math_save_settings","vibe_math_set_mode","vibe_math_set_params","vibe_math_set_project","vibe_math_setup","vibe_math_start","vibe_math_status","vibe_math_template"]
const actualToolNames = [...new Set(toolRegs.map((t) => t.name))].sort()
assert(JSON.stringify(actualToolNames) === JSON.stringify(EXPECTED_TOOLS),
  '★★ A6：注册的工具**名字集合**与快照逐个匹配（同数改名也会红；多出=' + JSON.stringify(actualToolNames.filter((n) => EXPECTED_TOOLS.indexOf(n) === -1)) + ' 缺少=' + JSON.stringify(EXPECTED_TOOLS.filter((n) => actualToolNames.indexOf(n) === -1)) + '）')
assert(['vibe_math_lean_run', 'vibe_math_lean_archive', 'vibe_math_lean_lib', 'vibe_math_lean_read', 'vibe_math_lean_job'].every(n => toolRegs.some(t => t.name === n)),
  'all five Lean tools are registered unconditionally (registration is static, not mode-dependent)')
assert(cmdRegs.length === 1, 'one /vibe command registered once')

async function callTool(name, args, agent) {
  const spec = toolRegs.find(s => s.name === name)
  if (!spec) throw new Error('tool not found: ' + name)
  return JSON.parse(await spec.execute(args || {}, { agent }))
}

// ---------- Scenario 0: per-session current project isolation ----------
console.log('\n-- Scenario 0: per-session current project --')
const newA = await callTool('vibe_math_new_project', { name: 'proja' }, ROOT_A)
const newB = await callTool('vibe_math_new_project', { name: 'projb' }, ROOT_B)
assert(newA.ok === true && newA.project === 'proja', 'session A created+switched to projA')
assert(newB.ok === true && newB.project === 'projb', 'session B created+switched to projB')
const curFileA = join(WS, 'VibeMath', 'current.sess-A.json')
const curFileB = join(WS, 'VibeMath', 'current.sess-B.json')
assert(existsSync(curFileA) && JSON.parse(readFileSync(curFileA, 'utf8')).project === 'proja', 'current.sess-A.json written with projA')
assert(existsSync(curFileB) && JSON.parse(readFileSync(curFileB, 'utf8')).project === 'projb', 'current.sess-B.json written with projB')
await callTool('vibe_math_set_project', { name: 'projb' }, ROOT_A)
const curBchk = await callTool('vibe_math_status', {}, ROOT_B)
assert(curBchk.project === 'projb', 'session B still projB after A switched')
await callTool('vibe_math_set_project', { name: 'proja' }, ROOT_A)
const curAchk = await callTool('vibe_math_status', {}, ROOT_A)
assert(curAchk.project === 'proja', 'session A back to projA')

// ---------- Scenario 1: two sessions start schedulers; parents are per-session ----------
console.log('\n-- Scenario 1: session isolation of spawn parent --')
// add a problem in session A's project first, then start (real usage order)
await callTool('vibe_math_add_problem', { id: 'pa', description: 'test problem A' }, ROOT_A)
// Turn the final-paper feature OFF for both sessions: session B has no problems at all, so it reaches
// strict termination immediately and would (correctly, by design) dispatch its own paper writer — which
// is a legitimate child under sess-B and would mask the isolation assertions below. The assertions stay
// exactly as strong: they are about session isolation, not about the paper feature.
await callTool('vibe_math_set_params', { finalPaper: false }, ROOT_A)
await callTool('vibe_math_set_params', { finalPaper: false }, ROOT_B)
const sA = await callTool('vibe_math_start', {}, ROOT_A)
assert(sA.ok === true && sA.project === 'proja', 'session A starts scheduler (projA)')
const sB = await callTool('vibe_math_start', {}, ROOT_B)
assert(sB.ok === true && sB.project === 'projb', 'session B starts scheduler (projB)')

// ---------- regression: the SECOND session's ensureDirs must really succeed ----------
// This host's mock `spawn` is `async` (it resolves to the handle). A framework that assumes
// `handle.done` exists dereferences `undefined.exitCode`, reports a phantom mkdir failure and
// (worse) never notices that it cannot tell success from failure. Guard both halves: the project
// tree for projB really exists on disk, and no ensureDirs failure reached the error channel.
{
  const projB = join(WS, 'VibeMath', 'Projects', 'projb')
  const need = ['qs', 'Propos', 'Verified', 'Verified/Lean', 'Formal', 'VibeMath_State'].map(d => join(projB, d))
  const missing = need.filter(p => !existsSync(p))
  assert(missing.length === 0, '★★ session B (second session) really got its project directory tree (missing: ' + missing.join(',') + ')')
  assert(existsSync(join(WS, 'VibeMath', 'Formal', 'Lib')) && existsSync(join(WS, 'VibeMath', 'Formal', 'Proved')),
    'the GLOBAL Lean library dirs were created by the second session too')
  const mkdirErrors = shellErrors.filter(l => /ensureDirs/.test(l))
  assert(mkdirErrors.length === 0, '★★ no phantom "ensureDirs (mkdir …) failed" on a host whose spawn resolves asynchronously (got ' + JSON.stringify(mkdirErrors.slice(0, 2)) + ')')
}

// wait for ticks -> explorer spawn must have parent = ROOT_A
await new Promise(r => setTimeout(r, 2600))
const spawnsA = spawns.filter(sp => sp.request.parent && sp.request.parent.id === 'sess-A')
assert(spawnsA.length >= 1, 'session A spawned explorer with parent=sess-A (got ' + spawns.length + ' total spawns)')
const wrongParent = spawns.filter(sp => sp.request.parent && sp.request.parent.id === 'sess-B')
assert(wrongParent.length === 0, 'no child spawned under session B for A\'s problem')

// session B must be untouched: its project has no problems, so its scheduler
// stops on its own (strict termination) — the point is it never adopted A's problem
const stB = await callTool('vibe_math_status', {}, ROOT_B)
assert(stB.problems.total === 0, 'session B sees 0 problems (never adopted A\'s)')
const stA = await callTool('vibe_math_status', {}, ROOT_A)
assert(stA.running === true, 'session A scheduler still running independently')
assert(stA.problems.total === 1 && stB.problems.total === 0, 'session A sees 1 problem, session B sees 0 (isolated qs)')

// ---------- Scenario 2: params are per-session ----------
console.log('\n-- Scenario 2: params isolation --')
await callTool('vibe_math_set_params', { maxParallelThreshold: 9 }, ROOT_A)
const pB = await callTool('vibe_math_status', {}, ROOT_B)
assert(pB.params.maxParallelThreshold !== 9, 'session B maxParallelThreshold unaffected by session A (got ' + pB.params.maxParallelThreshold + ')')
const pA = await callTool('vibe_math_status', {}, ROOT_A)
assert(pA.params.maxParallelThreshold === 9, 'session A maxParallelThreshold = 9')

// ---------- Scenario 3: subagent/end routed to owning session ----------
console.log('\n-- Scenario 3: subagent/end routing --')
const explorerSpawn = spawnsA[0]
assert(explorerSpawn !== undefined, 'have A\'s explorer spawn')
// fire end for A's child with canned directions; verify A's project qs got directions
fireEnd({
  id: explorerSpawn.childId, runId: 'r1', provider: 'spawn', local: true, stopReason: 'completed',
  lastAssistantMessage: [{ type: 'text', text: '```json\n{"directions":[{"id":"d1","title":"Dir A","method":"m","core_assumption":"c","feasibility":0.6}]}\n```' }],
})
await new Promise(r => setTimeout(r, 300))
const qsAfile = join(WS, 'VibeMath', 'Projects', 'proja', 'qs', 'qs.json')
const qsA = JSON.parse(readFileSync(qsAfile, 'utf8'))
assert(Array.isArray(qsA) && qsA.length === 1 && (qsA[0].progress.directions || []).length === 1, 'session A directions written into A\'s project qs.json')
const agentsA = await callTool('vibe_math_list_agents', {}, ROOT_A)
const explorerGone = agentsA.agents && agentsA.agents.every(a => a.childId !== explorerSpawn.childId)
assert(agentsA.ok === true && explorerGone, 'session A explorer child consumed from A\'s registry (remaining: ' + JSON.stringify((agentsA.agents || []).map(a => a.role + ':' + a.qid)) + ')')
const agentsB = await callTool('vibe_math_list_agents', {}, ROOT_B)
assert(agentsB.ok === true && agentsB.count === 0, 'session B registry independent (0)')

// ---------- Scenario 4: per-session scheduler gate (manual mode) ----------
console.log('\n-- Scenario 4: decision/gate isolation --')
await callTool('vibe_math_set_mode', { mode: 'manual' }, ROOT_A)
await callTool('vibe_math_add_problem', { id: 'pA4', description: 'A4 problem' }, ROOT_A)
await new Promise(r => setTimeout(r, 2600))
const decA = await callTool('vibe_math_list_decisions', {}, ROOT_A)
assert(decA.ok && decA.decisions.length === 1, 'session A has 1 pending manual decision (gate)')
const decB = await callTool('vibe_math_list_decisions', {}, ROOT_B)
assert(decB.ok && decB.decisions.length === 0, 'session B has 0 pending decisions (gate not shared)')
if (decA.decisions.length === 1) {
  await callTool('vibe_math_decide', { id: decA.decisions[0].id, action: 'approve' }, ROOT_A)
}
const stA4 = await callTool('vibe_math_status', {}, ROOT_A)
assert(stA4.pendingDecisions === 0, 'session A decision resolved')
const stB4 = await callTool('vibe_math_status', {}, ROOT_B)
assert(stB4.pendingDecisions === 0, 'session B has no decisions (independent)')

// ---------- cleanup ----------
rmSync(WS, { recursive: true, force: true })

console.log('\n=== RESULT: ' + passed + ' passed, ' + failed + ' failed ===')
process.exit(failed === 0 ? 0 : 1)

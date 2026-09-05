// Multi-session isolation E2E for vibe-math-v2 (standing-mount shared instance).
// Simulates TWO DSH sessions (root agents A and B) that BOTH mount the SAME
// preset plugin instance (as standing mount does in real DSH), and verifies:
//   - each session's spawnChild uses ITS OWN rootAgent as parent
//   - scheduler/registry/params/decisionQueue are isolated per session
//   - subagent/end routes to the owning session via childOwner
//   - current project (current.<sid>.json) is isolated per session
//
// Run: node e2e-multisession.test.mjs  (uses a temp workspace; asserts; exit code)
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'

const PLUGIN = new URL('./vibe-math-v2/vibe-math-v2.js', import.meta.url)

let passed = 0
let failed = 0
function assert(cond, msg) {
  if (cond) { passed++; console.log('  ok - ' + msg) }
  else { failed++; console.error('  FAIL - ' + msg) }
}

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
            const m = script.match(/-Path\s+(?:'((?:[^']|'')*)'|"((?:[^"]|"")*)")/)
            const raw = (m && (m[1] || m[2])) || ''
            const paths = raw.split(',').map(x => x.replace(/''/g, "'"))
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
assert(toolRegs.length === 22, '22 tools registered once (not per session)')
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
const sA = await callTool('vibe_math_start', {}, ROOT_A)
assert(sA.ok === true && sA.project === 'proja', 'session A starts scheduler (projA)')
const sB = await callTool('vibe_math_start', {}, ROOT_B)
assert(sB.ok === true && sB.project === 'projb', 'session B starts scheduler (projB)')

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

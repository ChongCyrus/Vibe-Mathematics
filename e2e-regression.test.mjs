// Single-session regression E2E for vibe-math-v2 after the multi-session refactor.
// Verifies the core flows still work on the refactored per-session code:
//   R1 explorer -> directions written
//   R2 solver round-1 -> lemma -> proposition added
//   R3 solver success -> solution -> verifiers spawned -> debate -> verdict 1 -> problem solved
//   R4 pause stops followup chain; resume re-spawns
//   R5 promoted problem + verdict back-link
// Run: node e2e-regression.test.mjs
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const PLUGIN = new URL('./vibe-math-v2/vibe-math-v2.js', import.meta.url)

let passed = 0
let failed = 0
function assert(cond, msg) {
  if (cond) { passed++; console.log('  ok - ' + msg) }
  else { failed++; console.error('  FAIL - ' + msg) }
}

const WS = mkdtempSync(join(tmpdir(), 'vibe-reg-'))
const listeners = {}
const toolRegs = []
const cmdRegs = []
const spawns = []
const followups = []
const interrupts = []

const ctx = {
  get(name) {
    if (name === 'subprocess') {
      return {
        async spawn({ argv }) {
          const script = argv[argv.length - 1] || ''
          const fsmod = await import('node:fs')
          if (/New-Item/.test(script)) { const m = script.match(/-Path\s+'((?:[^']|'')*)'/); if (m) { m[1].split(',').forEach(p => { if (p) fsmod.mkdirSync(p.replace(/''/g, "'"), { recursive: true }) }) } }
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
  agents: { roots() { return [] }, get(id) { return undefined } },
  fs: {
    async resolve(rel, opts) { const base = (opts && opts.cwd) || WS; return join(base, ...String(rel).split('/')) },
    async stat(t) { return existsSync(t) ? { type: 'file' } : undefined },
    async readText(t) { return readFileSync(t, 'utf8') },
    async writeText(t, content) { const fsmod = await import('node:fs'); const pathmod = await import('node:path'); fsmod.mkdirSync(pathmod.dirname(t), { recursive: true }); fsmod.writeFileSync(t, content, 'utf8') },
    async listDir(t) { const fsmod = await import('node:fs'); if (!existsSync(t)) return []; return fsmod.readdirSync(t, { withFileTypes: true }).map(e => ({ name: e.name, type: e.isDirectory() ? 'directory' : 'file' })) },
  },
}

function fireEnd(info) { for (const h of (listeners['subagent/end'] || [])) h(info) }

const ROOT = { id: 'sess-R', options: { provider: 'mock', model: 'mock' }, session: { id: 'sess-R', header: { cwd: WS, parentSession: undefined } }, followup() {} }

const mod = await import(PLUGIN.href + '?t=' + Date.now())
const plugin = mod.default || mod
plugin.apply(ctx)

async function callTool(name, args, agent) {
  const spec = toolRegs.find(s => s.name === name)
  if (!spec) throw new Error('tool not found: ' + name)
  return JSON.parse(await spec.execute(args || {}, { agent: agent || ROOT }))
}
function lastSpawn() { return spawns[spawns.length - 1] }
function wait(ms) { return new Promise(r => setTimeout(r, ms)) }

// ---------- R1: explorer ----------
console.log('\n-- R1: explorer directions --')
await callTool('vibe_math_new_project', { name: 'p1' }, ROOT)
await callTool('vibe_math_add_problem', { id: 'q1', description: 'problem one' }, ROOT)
await callTool('vibe_math_start', {}, ROOT)
await wait(2600)
const explorerSpawn = spawns.find(sp => sp.label.startsWith('explorer:'))
assert(explorerSpawn !== undefined, 'explorer spawned')
fireEnd({ id: explorerSpawn.childId, runId: 'r1', provider: 'spawn', local: true, stopReason: 'completed', lastAssistantMessage: [{ type: 'text', text: '```json\n{"directions":[{"id":"d1","title":"Dir 1","method":"m","core_assumption":"c","feasibility":0.6}]}\n```' }] })
await wait(300)
const qs = JSON.parse(readFileSync(join(WS, 'VibeMath', 'Projects', 'p1', 'qs', 'qs.json'), 'utf8'))
assert(qs[0].progress.directions.length === 1, 'problem got 1 direction')

// ---------- R2: solver round 1 (lemma) ----------
console.log('\n-- R2: solver lemma -> proposition --')
await wait(2600)
const solverSpawn = spawns.find(sp => sp.label.startsWith('solver:'))
assert(solverSpawn !== undefined, 'solver spawned after explorer')
const solverChildId = solverSpawn.childId
fireEnd({ id: solverChildId, runId: 'r2', provider: 'spawn', local: true, stopReason: 'completed', lastAssistantMessage: [{ type: 'text', text: '```json\n{"status":"continue","solution":null,"lemmas":[{"title":"Lemma A","statement":"statement A","proof":"proof A","布尔估计":0.6,"价值/关键性":0.5,"优先级":1}],"routes":[{"title":"r1","progress":"p","feasibility_signal":"ok","blocker":null}],"lessons":["l1"],"survival_probability":0.5,"dead_end_reason":null,"sub_questions":[]}\n```' }] })
await wait(300)
// proposition file should contain Lemma A
const proposDir = join(WS, 'VibeMath', 'Projects', 'p1', 'Propos')
const propFiles = existsSync(proposDir) ? (await import('node:fs')).readdirSync(proposDir) : []
assert(propFiles.length >= 1, 'proposition file created (' + propFiles.join(',') + ')')
const propContent = propFiles.length ? JSON.parse(readFileSync(join(proposDir, propFiles[0]), 'utf8')) : []
assert(propContent.some(p => p.概述 === 'statement A'), 'lemma A stored as proposition')
// solver round 2 should have been followup'ed
await wait(300)
assert(followups.some(f => f.childId === solverChildId), 'solver followup issued (round 2)')

// ---------- R3: solver success -> verification -> verdict 1 ----------
console.log('\n-- R3: solution verification & debate --')
// answer round 2 with success + solution
const fup = followups.find(f => f.childId === solverChildId)
fireEnd({ id: solverChildId, runId: 'r3', provider: 'spawn', local: true, stopReason: 'completed', lastAssistantMessage: [{ type: 'text', text: '```json\n{"status":"success","solution":"complete solution text","solution_probability":0.8,"lemmas":[],"routes":[],"lessons":[],"survival_probability":0.9,"dead_end_reason":null,"sub_questions":[]}\n```' }] })
await wait(2600)
// verifiers should spawn for the solution verification task
const verifierSpawns = spawns.filter(sp => sp.label.startsWith('verifier:'))
assert(verifierSpawns.length >= 1, 'verifiers spawned (' + verifierSpawns.length + ')')
// all verifiers say 1 -> consensus
for (let i = 0; i < verifierSpawns.length; i++) {
  fireEnd({ id: verifierSpawns[i].childId, runId: 'rv' + i, provider: 'spawn', local: true, stopReason: 'completed', lastAssistantMessage: [{ type: 'text', text: '```json\n{"Result":1,"Reason":"verified chain"}\n```' }] })
}
await wait(300)
const qsAfter = JSON.parse(readFileSync(join(WS, 'VibeMath', 'Projects', 'p1', 'qs', 'qs.json'), 'utf8'))
assert(qsAfter[0].已解决 === true, 'problem solved after verdict 1')
const solved = qsAfter[0].解法列表[0]
assert(solved !== undefined && solved.正确概率 === 1, 'solution probability = 1')

// ---------- R4: pause / resume ----------
console.log('\n-- R4: pause stops followup, resume re-spawns --')
await callTool('vibe_math_pause', {}, ROOT)
const pauseStatus = await callTool('vibe_math_status', {}, ROOT)
assert(pauseStatus.running === false, 'scheduler paused')
const fupBefore = followups.length
// add a fresh problem BEFORE resume so the resumed scheduler has work to do
await callTool('vibe_math_add_problem', { id: 'q2', description: 'problem two' }, ROOT)
await callTool('vibe_math_resume', {}, ROOT)
const resumeStatus = await callTool('vibe_math_status', {}, ROOT)
assert(resumeStatus.running === true, 'scheduler resumed')
await wait(2600)
const explorer2 = spawns.filter(sp => sp.label.startsWith('explorer:q2'))
assert(explorer2.length >= 1, 'explorer spawned for q2 after resume')

// ---------- R5: promoted proposition + verdict back-link ----------
console.log('\n-- R5: promote + back-link --')
await callTool('vibe_math_add_proposition', { id: 'propX', 概述: 'X holds', 布尔估计: 0.5, 优先级: 1, '价值/关键性': 0.9, 细类型: { 数论: {} } }, ROOT)
await wait(2600)
const qs5 = JSON.parse(readFileSync(join(WS, 'VibeMath', 'Projects', 'p1', 'qs', 'qs.json'), 'utf8'))
const promoted = qs5.find(q => q.判断命题 === 'propX')
assert(promoted !== undefined, 'proposition promoted to judge problem')
const propFile = join(WS, 'VibeMath', 'Projects', 'p1', 'Propos', '数论_Propos.json')
const propList = JSON.parse(readFileSync(propFile, 'utf8'))
assert(propList.find(p => p.id === 'propX').在问题清单 === true, 'source proposition marked 在问题清单')

// cleanup
rmSync(WS, { recursive: true, force: true })
console.log('\n=== RESULT: ' + passed + ' passed, ' + failed + ' failed ===')
process.exit(failed === 0 ? 0 : 1)

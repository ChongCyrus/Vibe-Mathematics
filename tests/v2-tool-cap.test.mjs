// Probe for audit findings M8/M9/M14 (capability lists derived from the composition; one shared
// per-platform script list; *MaxToolCalls is documented as advisory, not a quota).
//
// The host's own capability view is `tools.schemas(agent)` (dsh-tools/lib/index.js:1402 uses it the
// same way). This probe models v2's OWN composition: tool-web registers web_search but NOT web_fetch
// (agent.cordis.yml sets fetch: false), and the platform shell tool (pwsh on win32).
//
// Run: node tests/v2-tool-cap.test.mjs
import { mkdtempSync, rmSync, existsSync, readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname, resolve as pathResolve } from 'node:path'

let passed = 0, failed = 0
const assert = (c, m) => { if (c) { passed++; console.log('  ok - ' + m) } else { failed++; console.error('  FAIL - ' + m) } }
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const isWin = process.platform === 'win32'
const SHELL = isWin ? 'pwsh' : 'bash'
const OTHER = isWin ? 'bash' : 'pwsh'

const WS = mkdtempSync(join(tmpdir(), 'v2-toolcap-'))
const listeners = {}, toolRegs = [], spawns = []
// What THIS composition registers (web_search yes, web_fetch no, platform shell yes, other no)
const VISIBLE = ['vibe_math_status', 'vibe_math_report', 'vibe_math_set_params', 'web_search', 'read', 'write', SHELL]
const ctx = {
  get(n) {
    if (n === 'subprocess') return { spawn({ argv }) { const s = argv[argv.length - 1] || ''; if (/New-Item/.test(s)) { const m = s.match(/-Path\s+'((?:[^']|'')*)'/); if (m) m[1].split(',').forEach((p) => { if (p) mkdirSync(p.replace(/''/g, "'"), { recursive: true }) }) } return { done: Promise.resolve({ exitCode: 0 }) } } }
    return undefined
  },
  on(e, f) { (listeners[e] = listeners[e] || []).push(f) },
  effect(f) { const d = f(); return () => { if (typeof d === 'function') d() } },
  logger: { info() {}, warn() {}, error() {} },
  // the capability surface: exactly what the host exposes to this agent scope
  tools: { register(s) { toolRegs.push(s) }, schemas() { return VISIBLE.map((name) => ({ name, description: '', parameters: {} })) } },
  commands: { register() {} },
  subagents: {
    list() { return ['spawn'] },
    async startContinuable({ label, request }) { const childId = 'c' + (spawns.length + 1); spawns.push({ label, request, childId }); return { childId } },
    async sendMessage() {},
    interrupt() {},
  },
  agents: { roots() { return [] }, get() { return undefined } },
  fs: {
    async resolve(rel, o) { return pathResolve((o && o.cwd) || WS, ...String(rel).split('/')) },
    async stat(t) { return existsSync(t) ? { type: 'file' } : undefined },
    async readText(t) { return readFileSync(t, 'utf8') },
    async writeText(t, c) { mkdirSync(dirname(t), { recursive: true }); writeFileSync(t, c, 'utf8') },
    async listDir(t) { if (!existsSync(t)) return []; return readdirSync(t, { withFileTypes: true }).map((e) => ({ name: e.name, type: e.isDirectory() ? 'directory' : 'file' })) },
  },
}
const ROOT = { id: 'S', options: {}, session: { id: 'S', header: { cwd: WS } } }
const mod = await import(new URL('../vibe-math-v2/vibe-math-v2.js', import.meta.url).href + '?t=' + Date.now())
;(mod.default || mod).apply(ctx)
const call = async (n, a) => JSON.parse(await (toolRegs.find((s) => s.name === n)).execute(a || {}, { agent: ROOT }))

console.log('-- M8/M9/M14: capability lists come from the live composition --')
await call('vibe_math_new_project', { name: 'p' })
const proj = join(WS, 'VibeMath', 'Projects', 'p')
await call('vibe_math_set_params', { maxParallelThreshold: 8, solverAllowNetwork: true, solverAllowScripts: true, solverToolAllow: ['read'], solverMaxToolCalls: 3 })
// a problem that already has one active direction => processSolve spawns a SOLVER (not an explorer)
writeFileSync(join(proj, 'qs', 'qs.json'), JSON.stringify([{
  id: 'q1', 概述: 'p', 已解决: false, 优先级: 0, 解法列表: [],
  progress: { directions: [{ id: 'd1', title: 'D1', method: 'm', core_assumption: 'c', feasibility: 0.6, status: 'active', round: 0, survival: 0.6, routes: [], blockers: [] }] },
}], null, 2), 'utf8')
await call('vibe_math_start', {})
let so
for (let i = 0; i < 40 && !so; i++) { await wait(150); so = spawns.find((s) => s.label.startsWith('solver:q1:d1')) }
assert(!!so, 'solver spawned (the capability list under test is the solver one)')
if (so) {
  const f = (so.request && so.request.toolFilter) || {}
  const allow = f.allow || []
  const deny = f.deny || []
  assert(allow.includes('read'), 'the operator allow-list is kept (allow=' + JSON.stringify(allow) + ')')
  assert(allow.includes('web_search'), 'web_search is added: this composition registers it')
  assert(!allow.includes('web_fetch'), 'web_fetch is NOT added: this composition sets fetch=false (so restrict() cannot reject the filter)')
  assert(allow.includes(SHELL), 'the platform shell tool is added (' + SHELL + ')')
  assert(!allow.includes(OTHER), 'the other platform\u2019s shell tool is not named (' + OTHER + ')')
  assert(!deny.includes('web_fetch') && !deny.includes(OTHER), 'no name outside the registered set appears in the filter at all')
  const prompt = String((so.request.prompt && so.request.prompt[0] && so.request.prompt[0].text) || '')
  assert(prompt.indexOf('Script/shell tools (' + SHELL + ')') !== -1, 'the prompt names the SAME per-platform shell list as the filter')
  assert(prompt.indexOf('bash/pwsh') === -1, 'the hardcoded "bash/pwsh" sentence is gone')
  assert(/advisory/.test(prompt) && prompt.indexOf('AT MOST') === -1, 'the tool-call cap is stated as advisory, not as an enforced quota')
}
rmSync(WS, { recursive: true, force: true })
console.log('\nTOOLCAP PROBE: ' + passed + ' passed, ' + failed + ' failed')
process.exit(failed === 0 ? 0 : 1)

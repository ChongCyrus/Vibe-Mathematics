// V3 E2E — paper-style Markdown knowledge base + planner-agent scheduling +
// universal method library + verification (near-consensus verdict fix).
//
// Mocks the DSH 0.1.1 host API (fs.resolve returns {targetKey, displayPath}):
//   - data layer: Problems/Propos/Methods md cards created with soft-spec anchors
//   - planner: scheduler calls a planner agent; plan actions validated & executed
//   - explorer/solver → Progress journal + proposition cards + method feedback
//   - method keeper distills new_methods / improvements
//   - verification: consensus → Verified/ cards; near-consensus (0.9/1 → 0.95,
//     NOT 0.5 — the flat-mode fix)
//   - fallback heuristic when plannerEnabled=false
//   - manual plan approval gate
//   - multi-session project lock
//
// Run: node e2e-v3.test.mjs  (temp workspace; asserts; exit code)
import { mkdtempSync, rmSync, existsSync, readFileSync, readdirSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname, isAbsolute } from 'node:path'

const PLUGIN = new URL('./vibe-math-v3/vibe-math-v3.js', import.meta.url)

let passed = 0
let failed = 0
function assert(cond, msg) {
  if (cond) { passed++; console.log('  ok - ' + msg) }
  else { failed++; console.error('  FAIL - ' + msg) }
}
const sleep = ms => new Promise(r => setTimeout(r, ms))
async function waitFor(label, pred, timeoutMs = 8000) {
  const t0 = Date.now()
  while (Date.now() - t0 < timeoutMs) { if (pred()) { console.log('  .. waited for ' + label) ; return true } await sleep(100) }
  return false
}

// ---------- ONE shared host ctx (standing mount: ONE plugin instance for ALL sessions) ----------
const WS = mkdtempSync(join(tmpdir(), 'vibe-v3-'))
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
  // DSH 0.1.1 fs API: resolve → { targetKey, displayPath }
  fs: {
    async resolve(rel, opts) {
      const base = (opts && opts.cwd) || WS
      let p
      if (typeof rel === 'string' && isAbsolute(rel)) p = rel.replace(/\//g, '\\')
      else p = join(base, ...String(rel).split('/'))
      return { targetKey: p, displayPath: p }
    },
    async stat(t) { return existsSync(t.targetKey) ? { version: 'v1', type: 'file', size: 1 } : undefined },
    async readText(t) { return readFileSync(t.targetKey, 'utf8') },
    async writeText(t, content) { mkdirSync(dirname(t.targetKey), { recursive: true }); writeFileSync(t.targetKey, content, 'utf8') },
    async listDir(t) { if (!existsSync(t.targetKey)) return []; return readdirSync(t.targetKey, { withFileTypes: true }).map(e => ({ name: e.name, type: e.isDirectory() ? 'directory' : 'file', target: { targetKey: join(t.targetKey, e.name), displayPath: join(t.targetKey, e.name) } })) },
  },
}

function fireEnd(info) { for (const h of (listeners['subagent/end'] || [])) h(info) }
function spawnByLabel(prefix) { for (let i = spawns.length - 1; i >= 0; i--) { if (spawns[i].label.startsWith(prefix)) return spawns[i] } return undefined }
function allSpawnsByLabel(prefix) { return spawns.filter(s => s.label.startsWith(prefix)) }

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

const mod = await import(PLUGIN.href + '?t=' + Date.now())
const plugin = mod.default || mod
plugin.apply(ctx)

console.log('tool registrations:', toolRegs.length)
assert(toolRegs.length === 30, '30 tools registered once (not per session)')
assert(cmdRegs.length === 1, 'one /vibe command registered once')

async function callTool(name, args, agent) {
  const spec = toolRegs.find(s => s.name === name)
  if (!spec) throw new Error('tool not found: ' + name)
  return JSON.parse(await spec.execute(args || {}, { agent }))
}

// ================= Scenario A: Markdown data layer =================
console.log('\n-- Scenario A: Markdown data layer --')
const newA = await callTool('vibe_math_new_project', { name: 'projv3' }, ROOT_A)
assert(newA.ok === true && newA.project === 'projv3', 'session A created+switched to projv3')
const addQ = await callTool('vibe_math_add_problem', { id: 'q1', description: '证明 π² 是无理数', priority: 0 }, ROOT_A)
assert(addQ.ok === true && addQ.file === 'Problems/q1.md', 'problem q1 added (Problems/q1.md)')
const q1md = readFileSync(join(WS, 'VibeMath', 'Projects', 'projv3', 'Problems', 'q1.md'), 'utf8')
assert(q1md.includes('- ID: q1') && q1md.includes('- 类型: 问题') && q1md.includes('## 陈述'), 'q1.md has soft-spec anchors (ID/类型) + 陈述 section')
const addP = await callTool('vibe_math_add_proposition', { id: 'p1', 概述: '欧拉常数 γ 为有理数', 概率: 0.7, '价值/关键性': 0.5, 分类: '数论' }, ROOT_A)
assert(addP.ok === true && addP.file === 'Propos/数论/p1.md', 'proposition p1 added (Propos/数论/p1.md)')
const addP2 = await callTool('vibe_math_add_proposition', { id: 'p2', 概述: 'ζ(3) 为无理数', 概率: 0.6, '价值/关键性': 0.5, 分类: '数论' }, ROOT_A)
assert(addP2.ok === true, 'proposition p2 added')
const p1md = readFileSync(join(WS, 'VibeMath', 'Projects', 'projv3', 'Propos', '数论', 'p1.md'), 'utf8')
assert(p1md.includes('- ID: p1') && p1md.includes('- 概率: 0.7') && p1md.includes('## 证明尝试'), 'p1.md has anchors 概率 + 证明尝试 section')
const addM = await callTool('vibe_math_method_add', { id: 'm1', 标题: 'Niven 型证明范式', 类型: '方法', 核心内容: '利用多项式与指数函数的积分构造矛盾，证明 π 相关数无理。' }, ROOT_A)
assert(addM.ok === true && addM.file === 'Methods/m1.md', 'method m1 added (Methods/m1.md)')
const ml = await callTool('vibe_math_method_list', {}, ROOT_A)
assert(ml.ok === true && ml.count === 1 && ml.methods[0].id === 'm1', 'method_list shows m1')
const lock0 = await callTool('vibe_math_lock_status', {}, ROOT_A)
assert(lock0.ok === true && lock0.project === 'projv3', 'lock_status ok (unlocked)')

// ================= Scenario B: planner-driven explorer/solver + method feedback =================
console.log('\n-- Scenario B: planner scheduling + explorer/solver + journal/methods --')
const sA = await callTool('vibe_math_start', {}, ROOT_A)
assert(sA.ok === true && sA.project === 'projv3', 'session A starts scheduler (projv3)')
assert(await waitFor('planner spawn', () => spawnByLabel('planner:') !== undefined), 'planner agent called after start')
const planner1 = spawnByLabel('planner:')
fireEnd({ id: planner1.childId, runId: 'p1', provider: 'spawn', local: true, stopReason: 'completed', lastAssistantMessage: [{ type: 'text', text: '```json\n{"summary":"explore q1","plan":[{"action":"spawn","role":"explorer","target":"q1","reason":"no directions"}]}\n```' }] })
assert(await waitFor('explorer q1 spawn', () => spawnByLabel('explorer:q1') !== undefined), 'plan executed → explorer:q1 spawned')
const explorer = spawnByLabel('explorer:q1')
fireEnd({ id: explorer.childId, runId: 'e1', provider: 'spawn', local: true, stopReason: 'completed', lastAssistantMessage: [{ type: 'text', text: '```json\n{"directions":[{"id":"d1","title":"Niven 积分法","method":"构造 ∫_0^1 f(x)sin(πx)dx","core_assumption":"π² = a/b 有理","feasibility":0.8}],"methods_used":[{"id":"m1","效果":"直接复用 Niven 范式","建议":"无"}],"new_inventions":[]}\n```' }] })
assert(await waitFor('progress journal written', () => existsSync(join(WS, 'VibeMath', 'Projects', 'projv3', 'Progress', 'q1.md'))), 'Progress/q1.md journal created')
const jmd = readFileSync(join(WS, 'VibeMath', 'Projects', 'projv3', 'Progress', 'q1.md'), 'utf8')
assert(jmd.includes('## 方向 d1') && jmd.includes('Niven 积分法'), 'journal contains direction d1')
const m1after = readFileSync(join(WS, 'VibeMath', 'Projects', 'projv3', 'Methods', 'm1.md'), 'utf8')
assert(m1after.includes('## 应用记录') && m1after.includes('直接复用 Niven 范式'), 'methods_used appended application record to m1.md')

assert(await waitFor('2nd planner call', () => allSpawnsByLabel('planner:').length >= 2), 'planner called again after explorer (cooldown skipped when idle)')
const planner2 = allSpawnsByLabel('planner:')[1]
fireEnd({ id: planner2.childId, runId: 'p2', provider: 'spawn', local: true, stopReason: 'completed', lastAssistantMessage: [{ type: 'text', text: '```json\n{"summary":"solve d1","plan":[{"action":"spawn","role":"solver","target":"q1","direction":"d1","reason":"highest survival"}]}\n```' }] })
assert(await waitFor('solver q1:d1 spawn', () => spawnByLabel('solver:q1:d1') !== undefined), 'plan executed → solver:q1:d1 spawned')
const solver = spawnByLabel('solver:q1:d1')
fireEnd({ id: solver.childId, runId: 's1', provider: 'spawn', local: true, stopReason: 'completed', lastAssistantMessage: [{ type: 'text', text: '```json\n{"status":"continue","lemmas":[{"title":"引理A","statement":"设 f(x)=x^n(1-x)^n/n!，则 f 及其导数在 0,1 处取整数值","proof":"n! 的阶乘结构与导数的组合性质……","细类型":{"数论":{}},"布尔估计":0.75,"价值/关键性":0.6,"优先级":1}],"routes":[{"title":"直接积分","progress":"积分上界估计可行","feasibility_signal":"无奇点","blocker":""}],"lessons":["需要控制 ∫ f(x)sin(πx)dx 的增长"],"survival_probability":0.7,"methods_used":[{"id":"m1","效果":"范式适用","建议":""}],"new_inventions":[{"类型":"工具","标题":"多项式-指数积分估值工具","内容描述":"一族控制 n! 增长的多项式积分估计技巧","是否已入库":false}]}\n```' }] })
assert(await waitFor('lemma proposition card', () => {
  const dir = join(WS, 'VibeMath', 'Projects', 'projv3', 'Propos', '数论')
  if (!existsSync(dir)) return false
  return readdirSync(dir).some(f => f.startsWith('p-') && f.endsWith('.md'))
}), 'lemma → Propos proposition card created')
const m1after2 = readFileSync(join(WS, 'VibeMath', 'Projects', 'projv3', 'Methods', 'm1.md'), 'utf8')
assert(m1after2.includes('范式适用'), 'solver methods_used appended to m1.md')
const ml2 = JSON.parse(readFileSync(join(WS, 'VibeMath', 'Projects', 'projv3', 'State', 'method_log.json'), 'utf8'))
assert(Array.isArray(ml2.pendingInventions) && ml2.pendingInventions.length === 1, 'new_inventions queued in method_log (1)')
// solver round 2 → success with solution
fireEnd({ id: solver.childId, runId: 's2', provider: 'spawn', local: true, stopReason: 'completed', lastAssistantMessage: [{ type: 'text', text: '```json\n{"status":"success","solution":"Niven 型证明：设 π²=a/b，构造 F(x)=b^n(π^n x^n(1-x)^n)/n!，则 ∫_0^1 F(x)sin(πx)dx 为整数且 0<|I|<1，矛盾。","solution_probability":0.9}\n```' }] })
assert(await waitFor('solution written to q1', () => {
  const md = readFileSync(join(WS, 'VibeMath', 'Projects', 'projv3', 'Problems', 'q1.md'), 'utf8')
  return md.includes('### 解法 1｜') && md.includes('概率0.9')
}), 'solution added to Problems/q1.md (解法 1, 概率 0.9)')
const jmd2 = readFileSync(join(WS, 'VibeMath', 'Projects', 'projv3', 'Progress', 'q1.md'), 'utf8')
assert(jmd2.includes('第 1 轮') && jmd2.includes('第 2 轮'), 'journal has round 1 and round 2 narratives')

// ================= Scenario C: method keeper via plan =================
console.log('\n-- Scenario C: method keeper distills theory library --')
assert(await waitFor('3rd planner call', () => allSpawnsByLabel('planner:').length >= 3), 'planner called again')
const planner3 = allSpawnsByLabel('planner:')[2]
fireEnd({ id: planner3.childId, runId: 'p3', provider: 'spawn', local: true, stopReason: 'completed', lastAssistantMessage: [{ type: 'text', text: '```json\n{"summary":"keep methods","plan":[{"action":"spawn","role":"method-keeper","reason":"pending inventions"}]}\n```' }] })
assert(await waitFor('method-keeper spawn', () => spawnByLabel('method-keeper') !== undefined), 'plan executed → method-keeper spawned')
const keeper = spawnByLabel('method-keeper')
fireEnd({ id: keeper.childId, runId: 'k1', provider: 'spawn', local: true, stopReason: 'completed', lastAssistantMessage: [{ type: 'text', text: '```json\n{"new_methods":[{"标题":"多项式-指数积分估值体系","类型":"理论体系","核心内容":"一族控制阶乘增长的多项式积分估计；含上界引理与取整论证模板","定义与记号":"I_n(f)=∫_0^1 f(x)sin(nπx)dx","适用场景":"π、e、ζ 相关无理数证明","可信断言":[]}],"improvements":[{"id":"m1","改进内容":"补充 n! 增长控制的具体上界引理","原因":"solver 实战验证"}]}\n```' }] })
assert(await waitFor('new method card', () => {
  const dir = join(WS, 'VibeMath', 'Projects', 'projv3', 'Methods')
  return readdirSync(dir).some(f => f.startsWith('m-') && f !== 'm1.md')
}), 'method keeper created new method card Methods/m-*.md')
const m1after3 = readFileSync(join(WS, 'VibeMath', 'Projects', 'projv3', 'Methods', 'm1.md'), 'utf8')
assert(m1after3.includes('## 改进历史') && m1after3.includes('n! 增长控制'), 'improvement appended to m1.md 改进历史')
const ml3 = JSON.parse(readFileSync(join(WS, 'VibeMath', 'Projects', 'projv3', 'State', 'method_log.json'), 'utf8'))
assert(ml3.pendingInventions.length === 0, 'pending inventions consumed after method keeper round')

// ================= Scenario H (early): project lock across sessions =================
console.log('\n-- Scenario H: multi-session project lock --')
const setB = await callTool('vibe_math_set_project', { name: 'projv3' }, ROOT_B)
assert(setB.ok === true && setB.project === 'projv3', 'session B switches to projv3')
const startB = await callTool('vibe_math_start', {}, ROOT_B)
assert(startB.ok === false && String(startB.message || '').includes('占用'), 'session B cannot start projv3 while A holds the lock')
const newB = await callTool('vibe_math_new_project', { name: 'projb2' }, ROOT_B)
assert(newB.ok === true, 'session B switches to its own projb2')
const startB2 = await callTool('vibe_math_start', {}, ROOT_B)
assert(startB2.ok === true, 'session B starts its own project projb2 (lock per project)')
const stA = await callTool('vibe_math_status', {}, ROOT_A)
assert(stA.ok === true && stA.project === 'projv3', 'session A still on projv3 (per-session current project)')
await callTool('vibe_math_pause', {}, ROOT_B)

// ================= Scenario D: verification via fallback + near-consensus fix =================
console.log('\n-- Scenario D: verification (consensus + near-consensus fix) via fallback --')
await callTool('vibe_math_set_params', { plannerEnabled: false, verifierCount: 2, debateMaxRounds: 1, planMinIntervalMs: 0 }, ROOT_A)
// 清理场景 C 与 D 之间调度器自发产生的游离 planner（fire 一个空计划 → 回退启发式）。
// 注意：必须先 set_params（verifierCount=2）再 fire，否则回退创建的验证任务会带默认 3 个验证器。
const firedPlanner = new Set()
async function fireStrayPlanners() {
  for (const s of allSpawnsByLabel('planner:')) {
    if (firedPlanner.has(s.childId)) continue
    firedPlanner.add(s.childId)
    fireEnd({ id: s.childId, runId: 'sp' + Math.random(), provider: 'spawn', local: true, stopReason: 'completed', lastAssistantMessage: [{ type: 'text', text: '```json\n{"summary":"noop","plan":[]}\n```' }] })
  }
}
await fireStrayPlanners()

// 通用结算循环：自动发现所有验证组（含 B 阶段引理命题产生的 r-p-xxx-pf0 任务），
// 每组满 2 个验证器即结算；r-p2 用 0.9/1 验证近共识（→0.95），其余用 1/1 全票。
const settledRids = new Set()
const vg = () => {
  const groups = {}
  for (const s of spawns) { const m = /^verifier:(r-[^:]+):(\d+)$/.exec(s.label); if (m) { (groups[m[1]] = groups[m[1]] || []).push(s) } }
  return groups
}
const q1Solved = () => { try { return readFileSync(join(WS, 'VibeMath', 'Projects', 'projv3', 'Problems', 'q1.md'), 'utf8').includes('- 状态: 已解决') } catch (e) { return false } }
const p1Verified = () => existsSync(join(WS, 'VibeMath', 'Projects', 'projv3', 'Verified', '命题', 'p1.md'))
const p2Near = () => { try { return readFileSync(join(WS, 'VibeMath', 'Projects', 'projv3', 'Propos', '数论', 'p2.md'), 'utf8').includes('- 概率: 0.95') } catch (e) { return false } }
let settledAny = false
for (let guard = 0; guard < 40; guard++) {
  await sleep(400)
  await fireStrayPlanners()
  const groups = vg()
  for (const rid of Object.keys(groups)) {
    if (settledRids.has(rid) || groups[rid].length < 2) continue
    settledRids.add(rid)
    settledAny = true
    const vs = groups[rid]
    const results = rid === 'r-p2' ? [0.9, 1] : [1, 1]
    while (results.length < vs.length) results.push(results[results.length - 1])
    for (let i = 0; i < vs.length; i++) {
      fireEnd({ id: vs[i].childId, runId: rid + '-' + i, provider: 'spawn', local: true, stopReason: 'completed',
        lastAssistantMessage: [{ type: 'text', text: '```json\n{"Result":' + results[i] + ',"Reason":"mock verdict for ' + rid + '"}\n```' }] })
    }
  }
  if (settledAny && q1Solved() && p1Verified() && p2Near()) break
}
assert(settledAny, 'verification groups discovered and settled (generic loop)')
if (!q1Solved()) {
  console.error('DEBUG settledRids:', [...settledRids].join(','))
  try { console.error('DEBUG q1.md head:', readFileSync(join(WS, 'VibeMath', 'Projects', 'projv3', 'Problems', 'q1.md'), 'utf8').split('\n').slice(0, 16).join(' | ')) } catch (e) {}
  try { console.error('DEBUG tasks:', JSON.stringify(JSON.parse(readFileSync(join(WS, 'VibeMath', 'Projects', 'projv3', 'State', 'tasks.json'), 'utf8'))).slice(0, 500)) } catch (e) {}
  try { console.error('DEBUG sched:', JSON.stringify(JSON.parse(readFileSync(join(WS, 'VibeMath', 'Projects', 'projv3', 'State', 'scheduler_state.json'), 'utf8')))) } catch (e) {}
  console.error('DEBUG verifier spawns:', allSpawnsByLabel('verifier:').map(s => s.label).join(', '))
}
assert(q1Solved(), 'q1 marked 已解决 with 解法 概率=1 in Problems/q1.md')
assert(existsSync(join(WS, 'VibeMath', 'Projects', 'projv3', 'Verified', '问题', 'q1.md')), 'Verified/问题/q1.md card generated')
assert(p1Verified(), 'Verified/命题/p1.md card generated (verified true)')
assert(p2Near(), 'p2 verdict = 0.95 (near-consensus mean, NOT 0.5 — flat-mode fix)')
const p2md = readFileSync(join(WS, 'VibeMath', 'Projects', 'projv3', 'Propos', '数论', 'p2.md'), 'utf8')
assert(p2md.includes('概率0.95') && p2md.includes('概率0.05'), 'p2 proof entry 0.95 + refute entry 0.05 recorded')
// 所有对象定论后调度器严格终止；重启以继续后续场景
const stD = await callTool('vibe_math_status', {}, ROOT_A)
assert(stD.running === false, 'scheduler stopped after all resolved (strict termination)')
const restD = await callTool('vibe_math_start', {}, ROOT_A)
if (!restD.ok) console.error('DEBUG restart failed:', JSON.stringify(restD))
assert(restD.ok === true, 'scheduler restarted after termination')
// fallback explorer for a new problem (planner disabled)
const addQ2 = await callTool('vibe_math_add_problem', { id: 'q2', description: '证明 e 是无理数', priority: 1 }, ROOT_A)
assert(addQ2.ok === true, 'problem q2 added')
const stD2 = await callTool('vibe_math_status', {}, ROOT_A)
assert(await waitFor('fallback explorer q2', () => spawnByLabel('explorer:q2') !== undefined), 'fallback scheduler spawns explorer:q2 WITHOUT planner')
const plannerCountAtEnd = allSpawnsByLabel('planner:').length
await sleep(2500)
assert(allSpawnsByLabel('planner:').length === plannerCountAtEnd, 'no planner spawned while plannerEnabled=false')
const ex2 = spawnByLabel('explorer:q2')
if (ex2) fireEnd({ id: ex2.childId, runId: 'e2', provider: 'spawn', local: true, stopReason: 'completed', lastAssistantMessage: [{ type: 'text', text: '```json\n{"directions":[{"id":"d1","title":"连分数法","method":"e 的连分数展开","core_assumption":"","feasibility":0.6}]}\n```' }] })

// ================= Scenario E: manual plan approval gate =================
console.log('\n-- Scenario E: manual plan approval gate --')
const stE0 = await callTool('vibe_math_status', {}, ROOT_A)
if (!stE0.running) await callTool('vibe_math_start', {}, ROOT_A)
await callTool('vibe_math_set_params', { plannerEnabled: true }, ROOT_A)
await callTool('vibe_math_set_mode', { mode: 'manual' }, ROOT_A)
const addQ3 = await callTool('vibe_math_add_problem', { id: 'q3', description: '证明 ζ(2)=π²/6', priority: 0 }, ROOT_A)
assert(addQ3.ok === true, 'problem q3 added')
assert(await waitFor('manual planner spawn', () => spawnByLabel('planner:') !== undefined), 'planner called in manual mode')
const planner4 = spawnByLabel('planner:')
fireEnd({ id: planner4.childId, runId: 'p4', provider: 'spawn', local: true, stopReason: 'completed', lastAssistantMessage: [{ type: 'text', text: '```json\n{"summary":"explore q3","plan":[{"action":"spawn","role":"explorer","target":"q3","reason":"new problem"}]}\n```' }] })
assert(await waitFor('plan approval decision', () => {
  // handlePlanner 在子代理结束后同步入队决策并挂门；稍等一拍后查询
  return true
}, 400), '')
await sleep(500)
// check via the decision list tool
const decs = await callTool('vibe_math_list_decisions', {}, ROOT_A)
const planDec = (decs.decisions || []).find(d => d.node === 'plan')
assert(planDec !== undefined, 'plan approval decision gated (node=plan)')
if (planDec) {
  const res = await callTool('vibe_math_decide', { id: planDec.id, action: 'approve' }, ROOT_A)
  assert(res.ok === true && res.applied && res.applied.planApproved === true, 'plan approved → actions queued')
}
assert(await waitFor('explorer q3 after approval', () => spawnByLabel('explorer:q3') !== undefined), 'approved plan executed → explorer:q3 spawned')
const ex3 = spawnByLabel('explorer:q3')
if (ex3) fireEnd({ id: ex3.childId, runId: 'e3', provider: 'spawn', local: true, stopReason: 'completed', lastAssistantMessage: [{ type: 'text', text: '```json\n{"directions":[{"id":"d1","title":"Fourier 展开法","method":"x² 的傅里叶展开","core_assumption":"","feasibility":0.7}]}\n```' }] })
await callTool('vibe_math_set_mode', { mode: 'auto' }, ROOT_A)

// ================= Scenario F: planner arranges verification (fix: verify-only work triggers planner) =================
console.log('\n-- Scenario F: planner arranges verification + plan anchor write-back --')
const newF = await callTool('vibe_math_new_project', { name: 'projf' }, ROOT_A)
assert(newF.ok === true && newF.project === 'projf', 'session A switched to projf')
await callTool('vibe_math_set_params', { verifierCount: 2, debateMaxRounds: 1, planMinIntervalMs: 0 }, ROOT_A)
const addQf = await callTool('vibe_math_add_problem', { id: 'qF', description: '证明 2^p-1 形式的梅森素数有无穷多个', priority: 0 }, ROOT_A)
assert(addQf.ok === true, 'problem qF added')
const addPf = await callTool('vibe_math_add_proposition', { id: 'pF', 概述: '欧拉公式 e^{iπ}+1=0 成立', 概率: 0.7, '价值/关键性': 0.5, 分类: '数论' }, ROOT_A)
assert(addPf.ok === true, 'proposition pF added (verify-only work exists)')
const sF = await callTool('vibe_math_start', {}, ROOT_A)
assert(sF.ok === true, 'scheduler started on projf')
// 注意：projv3 可能有遗留未结算的 planner（abort 只中断不产生 end 事件），必须按"新增计数"匹配
const plannersF0 = allSpawnsByLabel('planner:').length
assert(await waitFor('new planner for projf', () => allSpawnsByLabel('planner:').length > plannersF0), 'planner called (has solve work AND verify candidates)')
const plF = allSpawnsByLabel('planner:')[plannersF0]
fireEnd({ id: plF.childId, runId: 'plF', provider: 'spawn', local: true, stopReason: 'completed', lastAssistantMessage: [{ type: 'text', text: '```json\n{"summary":"explore qF + verify pF","plan":[{"action":"spawn","role":"explorer","target":"qF","reason":"new problem needs directions"},{"action":"spawn","role":"verifier","target":"r-pF","reason":"unverified proposition"}]}\n```' }] })
assert(await waitFor('explorer qF spawn', () => spawnByLabel('explorer:qF') !== undefined), 'plan action 1 executed → explorer:qF')
const qFmd = readFileSync(join(WS, 'VibeMath', 'Projects', 'projf', 'Problems', 'qF.md'), 'utf8')
assert(qFmd.includes('- 计划:') && !qFmd.includes('- 计划: 待调度'), 'problem qF 计划 anchor updated by plan (not 待调度 anymore): ' + qFmd.split('\n').find(l => l.startsWith('- 计划:')))
assert(await waitFor('verifier spawn for r-pF', () => spawnByLabel('verifier:r-pF') !== undefined), 'plan action 2 executed → verify task r-pF created')
assert(await waitFor('both r-pF verifiers', () => allSpawnsByLabel('verifier:r-pF').length >= 2), '2 verifiers spawned for r-pF (planner-arranged verification)')
const vpF = allSpawnsByLabel('verifier:r-pF')
for (let i = 0; i < vpF.length; i++) fireEnd({ id: vpF[i].childId, runId: 'vpf' + i, provider: 'spawn', local: true, stopReason: 'completed', lastAssistantMessage: [{ type: 'text', text: '```json\n{"Result":1,"Reason":"验证通过"}\n```' }] })
assert(await waitFor('pF verified', () => existsSync(join(WS, 'VibeMath', 'Projects', 'projf', 'Verified', '命题', 'pF.md'))), 'pF verified via planner-arranged verification (fix: verify-only work still triggers planner)')
const exF = spawnByLabel('explorer:qF')
if (exF) fireEnd({ id: exF.childId, runId: 'eF', provider: 'spawn', local: true, stopReason: 'completed', lastAssistantMessage: [{ type: 'text', text: '```json\n{"directions":[{"id":"d1","title":"解析数论法","method":"素数分布估计","core_assumption":"","feasibility":0.5}]}\n```' }] })

// ================= Scenario G: promote via plan =================
console.log('\n-- Scenario G: promote via planner --')
// 统一的"下一个未 fire 的 planner"匹配（projv3 有遗留 planner、F 场景验证结算又 spawn 了一个未 fire 的 planner）
const firedPlannerSet = new Set()
function nextUnfiredPlanner() {
  for (let i = spawns.length - 1; i >= 0; i--) {
    if (spawns[i].label.startsWith('planner:') && !firedPlannerSet.has(spawns[i].childId)) return spawns[i]
  }
  return undefined
}
async function waitAndFirePlan(planJson) {
  assert(await waitFor('unfired planner', () => nextUnfiredPlanner() !== undefined), 'an unfired planner is available')
  const p = nextUnfiredPlanner()
  firedPlannerSet.add(p.childId)
  fireEnd({ id: p.childId, runId: 'pl' + Math.random(), provider: 'spawn', local: true, stopReason: 'completed', lastAssistantMessage: [{ type: 'text', text: planJson }] })
}
const addPg = await callTool('vibe_math_add_proposition', { id: 'pG', 概述: '黎曼猜想的一种等价形式', 概率: 0.6, '价值/关键性': 0.9, 分类: '数论' }, ROOT_A)
assert(addPg.ok === true, 'proposition pG added (价值 0.9 ≥ promoteValueThreshold)')
await waitAndFirePlan('```json\n{"summary":"promote pG","plan":[{"action":"promote","target":"pG","reason":"high value, unresolved"}]}\n```')
assert(await waitFor('promoted judge problem', () => {
  const dir = join(WS, 'VibeMath', 'Projects', 'projf', 'Problems')
  if (!existsSync(dir)) return false
  return readdirSync(dir).some(f => f.startsWith('q-promoted-') && f.endsWith('.md'))
}), 'promote action → judge problem Problems/q-promoted-*.md created')
const promFile = readdirSync(join(WS, 'VibeMath', 'Projects', 'projf', 'Problems')).find(f => f.startsWith('q-promoted-'))
const promMd = readFileSync(join(WS, 'VibeMath', 'Projects', 'projf', 'Problems', promFile), 'utf8')
assert(promMd.includes('判断下述命题是否成立') && promMd.includes('- 来源: promote'), 'judge problem card has 判断命题 statement + 来源 promote')

// ================= Scenario I: method promotion gate =================
console.log('\n-- Scenario I: method promotion manual gate --')
await callTool('vibe_math_set_mode', { mode: 'manual' }, ROOT_A)
const addMg = await callTool('vibe_math_method_add', { id: 'mG', 标题: '筛法工具', 类型: '工具', 核心内容: '一类素数分布估计工具' }, ROOT_A)
assert(addMg.ok === true, 'method mG added to projf Methods/')
await waitAndFirePlan('```json\n{"summary":"solve qF d1","plan":[{"action":"spawn","role":"solver","target":"qF","direction":"d1","reason":"push the direction"}]}\n```')
// manual 模式：计划先挂审批门，approve 后才执行
assert(await waitFor('plan approval in manual (I)', () => {
  return true
}, 400), '')
await sleep(500)
const decI0 = await callTool('vibe_math_list_decisions', {}, ROOT_A)
const planDecI = (decI0.decisions || []).find(d => d.node === 'plan')
assert(planDecI !== undefined, 'plan approval gate raised in manual mode (I)')
if (planDecI) await callTool('vibe_math_decide', { id: planDecI.id, action: 'approve' }, ROOT_A)
assert(await waitFor('solver qF:d1 spawn', () => spawnByLabel('solver:qF:d1') !== undefined), 'solver:qF:d1 spawned')
const solF = spawnByLabel('solver:qF:d1')
fireEnd({ id: solF.childId, runId: 'sF1', provider: 'spawn', local: true, stopReason: 'completed', lastAssistantMessage: [{ type: 'text', text: '```json\n{"status":"continue","methods_used":[{"id":"mG","效果":"1","建议":""},{"id":"mG","效果":"2","建议":""},{"id":"mG","效果":"3","建议":""}]}\n```' }] })
assert(await waitFor('method-promote decision', () => {
  // maybePromoteMethods 在 child end 后同步触发；轮询 decisionQueue 快照
  return true
}, 300).then(() => { return true }), '')
await sleep(600)
const decI = await callTool('vibe_math_list_decisions', {}, ROOT_A)
const mpDec = (decI.decisions || []).find(d => d.node === 'method-promote')
assert(mpDec !== undefined, 'method-promote gate raised (mG has 3 applications, manual mode)')
if (mpDec) {
  const resI = await callTool('vibe_math_decide', { id: mpDec.id, action: 'approve' }, ROOT_A)
  assert(resI.ok === true && resI.applied && resI.applied.promoted === true, 'method-promote approved')
}
assert(existsSync(join(WS, 'VibeMath', 'Methods', 'mG.md')), 'mG promoted to GLOBAL method library (VibeMath/Methods/mG.md)')

// ================= Scenario J: q_sub three-object registration =================
console.log('\n-- Scenario J: q_sub registration --')
// solver 续轮（round 2 followup，同一 child）输出子问题 → 注册 q_sub/判断问题/p-tmp 三对象
fireEnd({ id: solF.childId, runId: 'sF2', provider: 'spawn', local: true, stopReason: 'completed', lastAssistantMessage: [{ type: 'text', text: '```json\n{"status":"continue","sub_questions":[{"q_sub_title":"估计 π(x) 的上界","q_sub_statement":"设 π(x) 为不超过 x 的素数个数（x≥2 为实数），估计 π(x) 的阶。","assumption_title":"π(x) ~ x/ln x 成立","assumption_statement":"π(x) 与 x/ln x 渐近等价（素数定理）"}]}\n```' }] })
assert(await waitFor('q_sub problem card', () => {
  const dir = join(WS, 'VibeMath', 'Projects', 'projf', 'Problems')
  return existsSync(dir) && readdirSync(dir).some(f => f.includes('-sub-') && f.endsWith('.md'))
}), 'q_sub problem card registered (Problems/qF-sub-*.md)')
assert(await waitFor('judge problem card', () => {
  const dir = join(WS, 'VibeMath', 'Projects', 'projf', 'Problems')
  return existsSync(dir) && readdirSync(dir).some(f => f.includes('-judge-') && f.endsWith('.md'))
}), 'judge problem card registered (Problems/qF-judge-*.md)')
assert(await waitFor('p-tmp proposition card', () => {
  const dir = join(WS, 'VibeMath', 'Projects', 'projf', 'Propos', '未分类')
  return existsSync(dir) && readdirSync(dir).some(f => f.startsWith('p-tmp-') && f.endsWith('.md'))
}), 'p-tmp temporary-assumption proposition card registered (Propos/未分类/p-tmp-*.md)')
const subFile = readdirSync(join(WS, 'VibeMath', 'Projects', 'projf', 'Problems')).find(f => f.includes('-sub-'))
const subMd = readFileSync(join(WS, 'VibeMath', 'Projects', 'projf', 'Problems', subFile), 'utf8')
assert(subMd.includes('## 来源与动机') && subMd.includes('回填'), 'q_sub card has 来源与动机 section (产生原因 + 回填计划)')
await callTool('vibe_math_set_mode', { mode: 'auto' }, ROOT_A)

// ================= Scenario K: journal archive on re-derive + method-keeper improvements-only clears pending =================
console.log('\n-- Scenario K: journal archive + method-keeper improvements-only --')
// K1: solver round 3 → dead-end → planner re-derives explorer → journal archives old direction d1
fireEnd({ id: solF.childId, runId: 'sF3', provider: 'spawn', local: true, stopReason: 'completed', lastAssistantMessage: [{ type: 'text', text: '```json\n{"status":"dead-end","dead_end_reason":"方向走到头","lessons":["不再尝试该路线"]}\n```' }] })
await waitAndFirePlan('```json\n{"summary":"re-explore qF","plan":[{"action":"spawn","role":"explorer","target":"qF","reason":"all directions dead"}]}\n```')
assert(await waitFor('re-derive explorer qF', () => allSpawnsByLabel('explorer:qF').length >= 2), 're-derive explorer:qF spawned (2nd)')
const exF2 = allSpawnsByLabel('explorer:qF')[1]
fireEnd({ id: exF2.childId, runId: 'eF2', provider: 'spawn', local: true, stopReason: 'completed', lastAssistantMessage: [{ type: 'text', text: '```json\n{"directions":[{"id":"d2","title":"新方向","method":"zeta 函数法","core_assumption":"","feasibility":0.4}],"new_inventions":[{"类型":"工具","标题":"zeta 估值技巧","内容描述":"用黎曼 zeta 函数估计素数相关和的技巧","是否已入库":false}]}\n```' }] })
assert(await waitFor('journal archived old direction', () => {
  const j = readFileSync(join(WS, 'VibeMath', 'Projects', 'projf', 'Progress', 'qF.md'), 'utf8')
  return j.includes('## 已归档方向 d1') && j.includes('不再尝试该路线')
}), 'Progress/qF.md archives old direction d1 (journal history preserved on re-derive)')
// K2: method keeper returns improvements-only → pending inventions cleared (no re-trigger loop)
const mlK = JSON.parse(readFileSync(join(WS, 'VibeMath', 'Projects', 'projf', 'State', 'method_log.json'), 'utf8'))
assert(mlK.pendingInventions.length === 1, 'pending inventions queued from re-derive explorer (1)')
await waitAndFirePlan('```json\n{"summary":"keep methods","plan":[{"action":"spawn","role":"method-keeper","reason":"pending inventions"}]}\n```')
assert(await waitFor('method-keeper 2nd spawn', () => allSpawnsByLabel('method-keeper').length >= 2), 'method-keeper spawned again')
const keep2 = allSpawnsByLabel('method-keeper')[1]
fireEnd({ id: keep2.childId, runId: 'k2', provider: 'spawn', local: true, stopReason: 'completed', lastAssistantMessage: [{ type: 'text', text: '```json\n{"improvements":[{"id":"mG","改进内容":"补充 zeta 应用说明","原因":"新发明并入现有工具"}]}\n```' }] })
assert(await waitFor('pending cleared after improvements-only', () => {
  try {
    const ml2 = JSON.parse(readFileSync(join(WS, 'VibeMath', 'Projects', 'projf', 'State', 'method_log.json'), 'utf8'))
    return ml2.pendingInventions.length === 0
  } catch (e) { return false }
}), 'improvements-only keeper round clears pending inventions (no re-trigger loop)')
const mGmd = readFileSync(join(WS, 'VibeMath', 'Projects', 'projf', 'Methods', 'mG.md'), 'utf8')
assert(mGmd.includes('## 改进历史') && mGmd.includes('zeta 应用说明'), 'mG improved (改进历史 appended)')
// application records now carry 问题/方向 context
const mGafter = readFileSync(join(WS, 'VibeMath', 'Projects', 'projf', 'Methods', 'mG.md'), 'utf8')
assert(mGafter.includes('问题 qF') && mGafter.includes('方向 d1'), 'application record carries 问题/方向 context')

// ================= Scenario L: agent-direct-write protocol (write lock + __writes/meta) =================
console.log('\n-- Scenario L: agent-direct-write (write lock + new channel) --')
// L1: write lock — one file, one owner at a time
const c1 = await callTool('vibe_math_claim_write', { target: 'Progress/qF/dL.md' }, ROOT_A)
assert(c1.ok === true && c1.path.includes('Progress/qF/dL.md'), 'claim_write succeeds (owner=scheduler)')
const c2 = await callTool('vibe_math_claim_write', { target: 'Progress/qF/dL.md' }, ROOT_B)
assert(c2.ok === false && c2.busy !== undefined, 'second agent claim on same file is rejected (write lock)')
const r1 = await callTool('vibe_math_release_write', { target: 'Progress/qF/dL.md' }, ROOT_A)
assert(r1.ok === true, 'release_write succeeds')
const c3 = await callTool('vibe_math_claim_write', { target: 'Progress/qF/dL.md' }, ROOT_B)
assert(c3.ok === true, 'file reclaimable after release')
await callTool('vibe_math_release_write', { target: 'Progress/qF/dL.md' }, ROOT_B)
// L2: solver writes content directly via __writes + sync_meta
await waitAndFirePlan('```json\n{"summary":"solve qF d2 directly","plan":[{"action":"spawn","role":"solver","target":"qF","direction":"d2","reason":"agent-direct-write"}]}\n```')
assert(await waitFor('solver qF:d2 (direct)', () => allSpawnsByLabel('solver:qF:d2').length >= 1), 'solver:qF:d2 spawned (direct channel)')
const solL = allSpawnsByLabel('solver:qF:d2')[0]
fireEnd({ id: solL.childId, runId: 'sL', provider: 'spawn', local: true, stopReason: 'completed', lastAssistantMessage: [{ type: 'text', text: '```json\n{"__writes":[{"path":"Progress/qF/d2.md","content":"# 研究方向日志｜qF / d2\\n- 方向: 新方向2\\n## 本轮（代理自写）\\n代理直接把研究叙述写进了方向文件。"}],"meta":{"kind":"solver","qid":"qF","dirId":"d2","status":"continue","survival":0.6,"lemmas":[{"id":"pL1","title":"新引理L","分类":"分析","statement":"设 A 为正定矩阵，则其特征值全为正。","prob":0.7}]}}\n```' }] })
assert(await waitFor('direction file written by agent', () => {
  const f = join(WS, 'VibeMath', 'Projects', 'projf', 'Progress', 'qF', 'd2.md')
  return existsSync(f) && readFileSync(f, 'utf8').includes('代理直接把研究叙述写进了方向文件')
}), 'agent-direct-write: Progress/qF/d2.md written from __writes (content live in md, not JSON)')
assert(await waitFor('lemma registered via meta', () => existsSync(join(WS, 'VibeMath', 'Projects', 'projf', 'Propos', '分析', 'pL1.md'))), 'agent-direct-write: lemma pL1 registered to Propos/分析/pL1.md via sync_meta')
const dirsL = JSON.parse(readFileSync(join(WS, 'VibeMath', 'Projects', 'projf', 'State', 'directions.json'), 'utf8'))
const d2 = (dirsL.qF || []).find(d => d.id === 'd2')
assert(d2 && Math.abs(d2.survival - 0.6) < 1e-9, 'dirState d2 survival updated to 0.6 via sync_meta')
const aggL = readFileSync(join(WS, 'VibeMath', 'Projects', 'projf', 'Progress', 'qF.md'), 'utf8')
assert(aggL.includes('## 方向 d2') && aggL.includes('**引理索引**'), 'aggregate Progress/qF.md updated (direction summary + lemma index)')

// ================= Scenario M: proof reachable for verification + unknown methods_used => pending invention =================
console.log('\n-- Scenario M: lemma proof via sync_meta + unknown methods_used --')
const sm = await callTool('vibe_math_sync_meta', { meta: { kind: 'solver', qid: 'qF', dirId: 'd2', status: 'continue', lemmas: [{ id: 'pM', title: '带证明引理', 分类: '分析', statement: '任意有限个互异时频平移线性无关特例成立。', proof: '这是一段完整证明过程，验证器据此核验。' }], methods_used: [{ id: '某新技巧名', 效果: '用了', 建议: '' }] } }, ROOT_A)
assert(sm.ok === true, 'sync_meta ok')
assert(await waitFor('proof lemma card with proof', () => {
  const f = join(WS, 'VibeMath', 'Projects', 'projf', 'Propos', '分析', 'pM.md')
  return existsSync(f) && readFileSync(f, 'utf8').includes('## 证明尝试') && readFileSync(f, 'utf8').includes('完整证明过程')
}), 'lemma with proof registered (proof text reachable for verification)')
assert(await waitFor('unknown methods_used -> pending invention', () => {
  try { const ml = JSON.parse(readFileSync(join(WS, 'VibeMath', 'Projects', 'projf', 'State', 'method_log.json'), 'utf8')); return ml.pendingInventions.some(i => i.标题 === '某新技巧名') } catch (e) { return false }
}), 'unknown methods_used referenced as pending invention (not lost)')

// ---------- cleanup ----------
await callTool('vibe_math_pause', {}, ROOT_A)
rmSync(WS, { recursive: true, force: true })

console.log('\n=== RESULT: ' + passed + ' passed, ' + failed + ' failed ===')
process.exit(failed === 0 ? 0 : 1)

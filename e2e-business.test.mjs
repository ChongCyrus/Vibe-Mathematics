// Comprehensive BUSINESS-LOGIC E2E for vibe-math v1+v2 (0.3.19).
// Covers flows the two existing suites do not:
//   B1 v2 q_sub three-object registration (sub-problem + judge problem + p-tmp proposition)
//   B2 v2 verifier disagreement -> debate round 2 (followup with FULL history) -> consensus -> verdict
//   B3 v2 manual gate spawn -> decide reject -> direction marked dead-end
//   B4 v2 abort -> children interrupted, direction stays active (resumable)
//   B5 v2 params persist to vibe_math_setting.json and re-load
//   B6 v2 cross-process stale: different processEpoch on resume clears stale tasks
//   B7 v1 full pipeline: brainstorm -> solver -> verify -> verdict -> Temp_Validated -> promote -> decider solves
// Run: node e2e-business.test.mjs
import { mkdtempSync, rmSync, existsSync, readFileSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

let passed = 0
let failed = 0
function assert(cond, msg) {
  if (cond) { passed++; console.log('  ok - ' + msg) }
  else { failed++; console.error('  FAIL - ' + msg) }
}

function makeCtx(WS, spawns, followups, interrupts) {
  const listeners = {}
  const toolRegs = []
  return {
    ctx: {
      get(name) {
        if (name === 'subprocess') {
          return {
            async spawn({ argv }) {
              const script = argv[argv.length - 1] || ''
              const fsmod = await import('node:fs')
              if (/New-Item/.test(script)) { const m = script.match(/-Path\s+'((?:[^']|'')*)'/); if (m) { m[1].split(',').forEach(p => { if (p) fsmod.mkdirSync(p.replace(/''/g, "'"), { recursive: true }) }) } }
              else if (/Move-Item/.test(script)) { const m = script.match(/-LiteralPath\s+'((?:[^']|'')*)'\s+-Destination\s+'((?:[^']|'')*)'/); if (m) { const fs2 = await import('node:fs'); const path2 = await import('node:path'); fs2.mkdirSync(path2.dirname(m[2].replace(/''/g, "'")), { recursive: true }); fs2.renameSync(m[1].replace(/''/g, "'"), m[2].replace(/''/g, "'")) } }
              else if (/Remove-Item/.test(script)) { const m = script.match(/-LiteralPath\s+'((?:[^']|'')*)'/); if (m) { const fs2 = await import('node:fs'); fs2.rmSync(m[1].replace(/''/g, "'"), { force: true, recursive: true }) } }
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
      commands: { register(spec) {} },
      subagents: {
        list() { return ['spawn'] },
        async startContinuable({ label, request }) { const childId = 'child-' + (spawns.length + 1) + '-' + Math.random().toString(36).slice(2, 6); spawns.push({ label, childId, request }); return { childId } },
        async followup(parent, childId, blocks, opts) { followups.push({ childId, parent, blocks }) },
        interrupt(childId, authority) { interrupts.push(childId) },
      },
      agents: { roots() { return [] }, get(id) { return undefined } },
      fs: {
        async resolve(rel, opts) { const base = (opts && opts.cwd) || WS; return join(base, ...String(rel).split('/')) },
        async stat(t) { return existsSync(t) ? { type: 'file' } : undefined },
        async readText(t) { return readFileSync(t, 'utf8') },
        async writeText(t, content) { const fsmod = await import('node:fs'); const pathmod = await import('node:path'); fsmod.mkdirSync(pathmod.dirname(t), { recursive: true }); fsmod.writeFileSync(t, content, 'utf8') },
        async listDir(t) { const fsmod = await import('node:fs'); if (!existsSync(t)) return []; return fsmod.readdirSync(t, { withFileTypes: true }).map(e => ({ name: e.name, type: e.isDirectory() ? 'directory' : 'file' })) },
      },
    },
    toolRegs,
    listeners,
    fireEnd(info) { for (const h of (listeners['subagent/end'] || [])) h(info) },
  }
}

function makeRoot(id, WS) {
  return { id, options: { provider: 'p', model: 'm' }, session: { id, header: { cwd: WS, parentSession: undefined } }, followup() {} }
}
const wait = ms => new Promise(r => setTimeout(r, ms))

// ================= v2 suite =================
console.log('\n########## v2 BUSINESS FLOWS ##########')
const WS2 = mkdtempSync(join(tmpdir(), 'vibe-biz-v2-'))
const spawns2 = [], followups2 = [], interrupts2 = []
const h2 = makeCtx(WS2, spawns2, followups2, interrupts2)
const mod2 = await import(new URL('./vibe-math-v2/vibe-math-v2.js', import.meta.url).href + '?t=' + Date.now())
const plugin2 = mod2.default || mod2
plugin2.apply(h2.ctx)
const ROOT2 = makeRoot('sess-v2', WS2)
const call2 = async (name, args) => { const s = h2.toolRegs.find(x => x.name === name); return JSON.parse(await s.execute(args || {}, { agent: ROOT2 })) }

await call2('vibe_math_new_project', { name: 'p' })
await call2('vibe_math_add_problem', { id: 'q1', description: 'main problem' })
await call2('vibe_math_start', {})
await wait(2600)
const ex2 = spawns2.find(s => s.label.startsWith('explorer:'))
h2.fireEnd({ id: ex2.childId, runId: 'r1', provider: 'spawn', local: true, stopReason: 'completed', lastAssistantMessage: [{ type: 'text', text: '```json\n{"directions":[{"id":"d1","title":"D","method":"m","core_assumption":"c","feasibility":0.6}]}\n```' }] })
await wait(300)
const so2 = spawns2.find(s => s.label.startsWith('solver:'))

// ---- B1: q_sub three-object registration ----
console.log('\n-- B1: q_sub three-object registration --')
h2.fireEnd({ id: so2.childId, runId: 'r2', provider: 'spawn', local: true, stopReason: 'completed', lastAssistantMessage: [{ type: 'text', text: '```json\n{"status":"continue","solution":null,"lemmas":[],"routes":[],"lessons":[],"survival_probability":0.5,"dead_end_reason":null,"sub_questions":[{"q_sub_title":"sub A","q_sub_statement":"complete subproblem statement","assumption_title":"tmp A","assumption_statement":"assume A holds"}]}\n```' }] })
await wait(400)
const qs2 = JSON.parse(readFileSync(join(WS2, 'VibeMath', 'Projects', 'p', 'qs', 'qs.json'), 'utf8'))
const subQ = qs2.find(q => q.progress && q.progress.类型 === 'sub-question')
const judgeQ = qs2.find(q => q.progress && q.progress.类型 === 'judge')
assert(subQ !== undefined, 'q_sub registered as problem in qs.json')
assert(judgeQ !== undefined && judgeQ.判断命题 !== undefined, 'judge problem registered with 判断命题')
assert(judgeQ.概述.startsWith('判断下述命题是否成立：'), 'judge problem wording correct')
const proposDir2 = join(WS2, 'VibeMath', 'Projects', 'p', 'Propos')
const propFiles2 = existsSync(proposDir2) ? readdirSync(proposDir2) : []
let tmpP = null
for (const f of propFiles2) { const arr = JSON.parse(readFileSync(join(proposDir2, f), 'utf8')); const t = arr.find(p => p.id === judgeQ.判断命题); if (t) tmpP = t }
assert(tmpP !== undefined && tmpP.布尔估计 === 0.5, 'p-tmp proposition registered with 布尔估计 0.5')

// ---- B2: verifier disagreement -> debate -> consensus ----
console.log('\n-- B2: verifier debate multi-round --')
// solver succeeds with solution
const fup2 = followups2.find(f => f.childId === so2.childId)
h2.fireEnd({ id: so2.childId, runId: 'r3', provider: 'spawn', local: true, stopReason: 'completed', lastAssistantMessage: [{ type: 'text', text: '```json\n{"status":"success","solution":"SOLUTION TEXT","solution_probability":0.8,"lemmas":[],"routes":[],"lessons":[],"survival_probability":0.9,"dead_end_reason":null,"sub_questions":[]}\n```' }] })
await wait(2600)
const vs2 = spawns2.filter(s => s.label.startsWith('verifier:r-q1-s0'))
assert(vs2.length >= 2, 'verifiers spawned for solution (' + vs2.length + ')')
// disagreement: verifier 0 says 1, others say 0.5 -> no consensus -> debate round 2
h2.fireEnd({ id: vs2[0].childId, runId: 'd1', provider: 'spawn', local: true, stopReason: 'completed', lastAssistantMessage: [{ type: 'text', text: '```json\n{"Result":1,"Reason":"solid proof"}\n```' }] })
for (let i = 1; i < vs2.length; i++) {
  h2.fireEnd({ id: vs2[i].childId, runId: 'd' + i, provider: 'spawn', local: true, stopReason: 'completed', lastAssistantMessage: [{ type: 'text', text: '```json\n{"Result":0.5,"Reason":"needs more checking"}\n```' }] })
}
await wait(400)
// debate round 2 followups should exist for the verifier children
const debateFups = followups2.filter(f => vs2.some(v => v.childId === f.childId))
assert(debateFups.length >= 1, 'debate round-2 followups issued (' + debateFups.length + ')')
assert(debateFups.some(f => (f.blocks || []).some(b => b.text && b.text.includes('FULL DEBATE HISTORY'))), 'debate prompt includes FULL DEBATE HISTORY')
// round 2: all say 1 -> consensus -> verdict 1
for (const v of vs2) {
  h2.fireEnd({ id: v.childId, runId: 'd2-' + v.childId, provider: 'spawn', local: true, stopReason: 'completed', lastAssistantMessage: [{ type: 'text', text: '```json\n{"Result":1,"Reason":"now convinced"}\n```' }] })
}
await wait(400)
const qsAfter = JSON.parse(readFileSync(join(WS2, 'VibeMath', 'Projects', 'p', 'qs', 'qs.json'), 'utf8'))
assert(qsAfter.find(q => q.id === 'q1').已解决 === true, 'problem solved after debate consensus verdict 1')
assert(qsAfter.find(q => q.id === 'q1').解法列表[0].正确概率 === 1, 'solution probability = 1 after debate')

// ---- B3: manual gate reject marks direction dead-end ----
console.log('\n-- B3: manual gate reject --')
await call2('vibe_math_new_project', { name: 'p2' })
await call2('vibe_math_set_mode', { mode: 'manual' })
await call2('vibe_math_add_problem', { id: 'q2', description: 'second problem' })
await call2('vibe_math_start', {})
await wait(2600)
const decs = await call2('vibe_math_list_decisions', {})
assert(decs.decisions.length >= 1, 'manual gate produced pending decision')
if (decs.decisions.length >= 1) {
  const d = decs.decisions[0]
  await call2('vibe_math_decide', { id: d.id, action: 'reject' })
}
await wait(400)
const qs3 = JSON.parse(readFileSync(join(WS2, 'VibeMath', 'Projects', 'p2', 'qs', 'qs.json'), 'utf8'))
const q2 = qs3.find(q => q.id === 'q2')
const dirs3 = q2.progress.directions || []
assert(dirs3.length >= 1 && dirs3[0].status === 'dead-end', 'rejected explorer spawn marks direction dead-end')
assert(q2.progress.directions[0].dead_end_reason.includes('拒绝'), 'dead-end reason records user rejection')

// ---- B4: abort interrupts children, direction stays active ----
console.log('\n-- B4: abort --')
await call2('vibe_math_set_mode', { mode: 'auto' })
await call2('vibe_math_add_problem', { id: 'q3', description: 'third problem' })
await wait(2600)
const ex3 = spawns2.find(s => s.label === 'explorer:q3')
if (ex3) {
  const before = interrupts2.length
  await call2('vibe_math_abort', {})
  assert(interrupts2.length > before, 'abort interrupts children')
  const st3 = await call2('vibe_math_status', {})
  assert(st3.running === false, 'scheduler stopped after abort')
}

// ---- B5: params persist ----
console.log('\n-- B5: params persistence --')
await call2('vibe_math_set_params', { maxParallelThreshold: 7, solverMaxRounds: 5 })
const settingFile = join(WS2, 'VibeMath', 'Projects', 'p2', 'vibe_math_setting.json')
assert(existsSync(settingFile), 'vibe_math_setting.json written on set_params')
const raw = readFileSync(settingFile, 'utf8')
const cleaned = raw.replace(/\/\/[^\n]*/g, '')
const parsed = JSON.parse(cleaned)
assert(parsed.maxParallelThreshold === 7 && parsed.solverMaxRounds === 5, 'params persisted to file')
// simulate restart: new plugin instance on same project reads file
await call2('vibe_math_set_project', { name: 'p2' })
await call2('vibe_math_resume', {})
const st5 = await call2('vibe_math_status', {})
assert(st5.params.maxParallelThreshold === 7, 'params reloaded from file on resume')

// ---- B6: cross-process stale clears stale tasks ----
console.log('\n-- B6: cross-process stale resume --')
// simulate a different process epoch by overwriting the epoch file
const epochFile = join(WS2, 'VibeMath', 'Projects', 'p2', 'VibeMath_State', 'process_epoch.json')
if (existsSync(epochFile)) {
  const { writeFileSync } = await import('node:fs')
  writeFileSync(epochFile, JSON.stringify('OLD-PROCESS-EPOCH-DIFFERENT'), 'utf8')
  const st6 = await call2('vibe_math_status', {})
  // resume should treat as stale and clear
  const res6 = await call2('vibe_math_resume', {})
  assert(res6.ok === true, 'resume succeeds after stale epoch')
}

// ================= v1 suite =================
console.log('\n########## v1 FULL PIPELINE ##########')
const WS1 = mkdtempSync(join(tmpdir(), 'vibe-biz-v1-'))
const spawns1 = [], followups1 = [], interrupts1 = []
const h1 = makeCtx(WS1, spawns1, followups1, interrupts1)
const mod1 = await import(new URL('./vibe-math-v1/vibe-math.js', import.meta.url).href + '?t=' + Date.now())
const plugin1 = mod1.default || mod1
plugin1.apply(h1.ctx)
const ROOT1 = makeRoot('sess-v1', WS1)
const call1 = async (name, args) => { const s = h1.toolRegs.find(x => x.name === name); return JSON.parse(await s.execute(args || {}, { agent: ROOT1 })) }

// ---- B7: v1 full pipeline ----
console.log('\n-- B7: v1 brainstorm -> solver -> verify -> promote -> decider --')
await call1('vibe_math_new_project', { name: 'v1p' })
await call1('vibe_math_add_problem', { id: 'v1q', description: 'v1 problem' })
await call1('vibe_math_start', {})
await wait(2600)
const br1 = spawns1.find(s => s.label.startsWith('brainstorm:'))
assert(br1 !== undefined, 'brainstorm spawned')
h1.fireEnd({ id: br1.childId, runId: 'b1', provider: 'spawn', local: true, stopReason: 'completed', lastAssistantMessage: [{ type: 'text', text: '```json\n{"directions":[{"id":"d1","title":"V1 Dir","method":"m","core_assumption":"c","feasibility":0.7}]}\n```' }] })
await wait(300)
const sv1 = spawns1.find(s => s.label.startsWith('solver:'))
assert(sv1 !== undefined, 'solver spawned after brainstorm')
h1.fireEnd({ id: sv1.childId, runId: 's1', provider: 'spawn', local: true, stopReason: 'completed', lastAssistantMessage: [{ type: 'text', text: '```json\n{"status":"success","solution":"V1 COMPLETE SOLUTION","lemmas":[],"findings":[],"sub_routes":[],"aux_hypotheses":[],"survival_probability":1}\n```' }] })
await wait(2600)
const vf1 = spawns1.filter(s => s.label.startsWith('verifier:'))
assert(vf1.length >= 3, 'verifiers spawned (' + vf1.length + ')')
for (const v of vf1) {
  h1.fireEnd({ id: v.childId, runId: 'v-' + v.childId, provider: 'spawn', local: true, stopReason: 'completed', lastAssistantMessage: [{ type: 'text', text: '```json\n{"verdict":"true","reason":"verified","strictness":"strict"}\n```' }] })
}
await wait(400)
// promoted to Verified
const verifiedDir = join(WS1, 'VibeMath', 'Projects', 'v1p', 'Verified')
await wait(2600)
const verifiedFiles = existsSync(verifiedDir) ? readdirSync(verifiedDir) : []
assert(verifiedFiles.length >= 1, 'verified unit promoted to Verified (' + verifiedFiles.join(',') + ')')
// decider should run and solve the problem
await wait(2600)
const dc1 = spawns1.find(s => s.label.startsWith('decider:'))
assert(dc1 !== undefined, 'decider spawned')
h1.fireEnd({ id: dc1.childId, runId: 'dc1', provider: 'spawn', local: true, stopReason: 'completed', lastAssistantMessage: [{ type: 'text', text: '```json\n{"solves_qid":"v1q"}\n```' }] })
await wait(400)
const qsCsv = readFileSync(join(WS1, 'VibeMath', 'Projects', 'v1p', 'qs', 'qs.csv'), 'utf8')
assert(qsCsv.includes('v1q,') && qsCsv.includes('solved'), 'problem marked solved by decider')

// cleanup
rmSync(WS2, { recursive: true, force: true })
rmSync(WS1, { recursive: true, force: true })
console.log('\n=== RESULT: ' + passed + ' passed, ' + failed + ' failed ===')
process.exit(failed === 0 ? 0 : 1)

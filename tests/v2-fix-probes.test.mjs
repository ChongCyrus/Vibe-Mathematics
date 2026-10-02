// Probes for the remaining v2 fixes (H3, H4/M12/M13, M10, M11, M15, H5).
// Each scenario drives the REAL plugin through the public tool API + the host's service mocks.
//
// Run: node tests/v2-fix-probes.test.mjs
import { mkdtempSync, rmSync, existsSync, readdirSync, readFileSync, writeFileSync, mkdirSync, copyFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname, resolve as pathResolve } from 'node:path'
import { fileURLToPath } from 'node:url'

let passed = 0, failed = 0
const assert = (c, m) => { if (c) { passed++; console.log('  ok - ' + m) } else { failed++; process.stderr.write('  FAIL - ' + m + '\n') } }
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const text = (o) => [{ type: 'text', text: '```json\n' + JSON.stringify(o) + '\n```' }]

function harness(opts) {
  const o = opts || {}
  const WS = mkdtempSync(join(tmpdir(), 'v2-fix-'))
  const listeners = {}, toolRegs = [], spawns = [], errors = [], cmdRegs = [], latexRuns = []
  let attempts = 0
  const realError = console.error
  console.error = (...a) => { errors.push(a.map(String).join(' ')); if (o.echoErrors) realError(...a) }
  // 假 LaTeX 编译器（spec §6）：engines 里列出的命令可解析；failFirst=true 时**第一个**引擎的
  // 第一次尝试失败（走"换引擎修复"路径）；alwaysFail=true 时永不成功（走"降级 + 警告"路径）。
  // 成功 = 在 cwd（= Paper/<id>/）里写出 paper.pdf —— 与真编译器一致（插件只 stat，绝不写二进制）。
  const latex = o.latex || null
  const latexSeen = {}
  const subprocess = o.noSubprocess ? undefined : {
    async resolveExecutable(cmd) {
      if (!latex) return undefined                                   // 真机无 LaTeX 的形态
      if (latex.mode === 'resolver-empty') return undefined           // resolver 在但什么都解析不到
      return (latex.engines || []).indexOf(cmd) !== -1 ? ('C:/fake/' + cmd) : undefined
    },
    spawn({ argv, cwd }) {
      const script = argv[argv.length - 1] || ''
      if (/New-Item/.test(script)) { const m = script.match(/-Path\s+'((?:[^']|'')*)'/); if (m) m[1].split(',').forEach((p) => { if (p) mkdirSync(p.replace(/''/g, "'"), { recursive: true }) }) }
      if (/paper\.tex/.test(argv.join(' '))) {
        const name = String(argv[0]).split(/[\\/]/).pop().replace(/\.(exe|cmd|bat)$/i, '')
        latexSeen[name] = (latexSeen[name] || 0) + 1
        const firstEngine = (latex.engines || [])[0]
        // failFirst = 第一个引擎**整个尝试**都失败（两遍都失败）⇒ 走"换引擎"修复路径
        const failThis = !!latex.alwaysFail || (!!latex.failFirst && name === firstEngine)
        latexRuns.push({ name, fail: failThis, mode: /\\begin\{document\}/.test(script) ? 'tex' : 'tex' })
        if (!failThis && cwd) { try { mkdirSync(cwd, { recursive: true }); writeFileSync(join(cwd, 'paper.pdf'), '%PDF-1.4 fake\n', 'utf8') } catch (e) { /* ignore */ } }
        return {
          done: Promise.resolve({ exitCode: failThis ? 1 : 0, signal: null }),
          collected: { stdout: { readFrom: () => ({ text: '', nextOffset: 0, lossy: false }) }, stderr: { readFrom: () => ({ text: failThis ? '! LaTeX Error: fake failure' : '', nextOffset: 0, lossy: false }) } },
          terminate() {},
        }
      }
      return { done: Promise.resolve({ exitCode: 0 }) }
    },
  }
  const ctx = {
    get(n) {
      if (n === 'subprocess') return subprocess
      if (n === 'sandboxPolicy' && o.policyRoot) return { resolve(req) { return Object.assign({}, req && req.session ? { session: true } : {}, { workspaceRoot: o.policyRoot }) } }
      return undefined
    },
    on(e, f) { (listeners[e] = listeners[e] || []).push(f) },
    effect(f) { const d = f(); return () => { if (typeof d === 'function') d() } },
    logger: { info() {}, warn() {}, error() {} },
    tools: Object.assign({ register(s) { toolRegs.push(s) } }, o.toolSchemas ? { schemas: () => o.toolSchemas } : {}),
    commands: { register(s) { cmdRegs.push(s); return () => {} } },
    subagents: {
      list() { if (o.failSubagentsList) throw new Error('mock list failure'); return ['spawn'] },
      async startContinuable({ label, request }) {
        // 宿主激活上限报错文本与 0.2.0 宿主一致（ACTIVATION_LIMIT_REACHED / active child limit: N）
        attempts++
        if (o.refuseAttempts && attempts <= o.refuseAttempts) throw new Error('ACTIVATION_LIMIT_REACHED: cannot start a new child: active child limit: ' + (o.limit || 2))
        const childId = 'c' + (spawns.length + 1); spawns.push({ label, request, childId }); return { childId }
      },
      async sendMessage() {},
      interrupt() { if (o.failInterrupt) throw new Error('mock interrupt failure') },
    },
    agents: { roots() { return [] }, get() { return undefined } },
    fs: {
      async resolve(rel, oc) { return pathResolve((oc && oc.cwd) || WS, ...String(rel).split('/')) },
      async stat(t) { return existsSync(t) ? { type: 'file' } : undefined },
      async readText(t) { return readFileSync(t, 'utf8') },
      async writeText(t, c) { if (o.failWritePath && String(t).includes(o.failWritePath)) throw new Error('mock write failure: ' + o.failWritePath); mkdirSync(dirname(t), { recursive: true }); writeFileSync(t, c, 'utf8') },
      async listDir(t) { if (!existsSync(t)) return []; return readdirSync(t, { withFileTypes: true }).map((e) => ({ name: e.name, type: e.isDirectory() ? 'directory' : 'file' })) },
    },
  }
  const ROOT = { id: 'S', options: { provider: 'mock', model: 'mock' }, session: { id: 'S', header: { cwd: WS } } }
  return { WS, listeners, toolRegs, cmdRegs, spawns, errors, latexRuns, ctx, ROOT, restore() { console.error = realError }, project: join(WS, 'VibeMath', 'Projects', 'p') }
}
// Seam: V2_PLUGIN points the probe at a mutant copy (same pattern as v3-fix-probes' V3_PLUGIN).
// Module scope so probes that re-instantiate a FRESH copy take it from the same (possibly mutant) source.
const PLUGIN_URL = process.env.V2_PLUGIN
  ? new URL('file:///' + String(process.env.V2_PLUGIN).replace(/\\/g, '/'))
  : new URL('../vibe-math-v2/vibe-math-v2.js', import.meta.url)
async function load(h) {
  const CACHE_KEY = '__v2PluginPromise:' + PLUGIN_URL.href
  if (!globalThis[CACHE_KEY]) globalThis[CACHE_KEY] = import(PLUGIN_URL.href)
  const mod = await globalThis[CACHE_KEY]   // ONE module instance per URL (no ?t= cache-buster)
  ;(mod.default || mod).apply(h.ctx)
  h.call = async (n, a) => JSON.parse(await (h.toolRegs.find((s) => s.name === n)).execute(a || {}, { agent: h.ROOT }))
  h.fireEnd = (info) => { for (const fn of (h.listeners['subagent/end'] || [])) fn(info) }
  h.readQs = () => JSON.parse(readFileSync(join(h.project, 'qs', 'qs.json'), 'utf8'))
  h.writeQs = (v) => writeFileSync(join(h.project, 'qs', 'qs.json'), JSON.stringify(v, null, 2), 'utf8')
  h.readProps = () => {
    const dir = join(h.project, 'Propos'); const out = []
    if (!existsSync(dir)) return out
    for (const f of readdirSync(dir)) if (f.endsWith('_Propos.json')) for (const p of JSON.parse(readFileSync(join(dir, f), 'utf8'))) out.push(p)
    return out
  }
  // —— final paper 探针用（spec §6）：模块测试缝 + /vibe 命令入口 ——
  h.H = mod.__testHelpers || {}
  h.cmd = async (raw) => {
    const spec = h.cmdRegs.find((s) => s.name === 'vibe')
    if (!spec) throw new Error('no /vibe command registered')
    return await spec.handler({ agent: h.ROOT, rawInput: raw })
  }
  h.paperDir = (id) => join(h.project, 'Paper', id === undefined ? 'p' : id)
  h.find = async (pred, tries) => { for (let i = 0; i < (tries || 60); i++) { const v = pred(); if (v) return v; await wait(150) } return undefined }
  h.findAsync = async (pred, tries) => { for (let i = 0; i < (tries || 60); i++) { const v = await pred(); if (v) return v; await wait(150) } return undefined }
  // wait for a label's reviewers, then answer them with a per-index Result list
  h.review = async (label, results, tries) => {
    const vs = await h.find(() => { const x = h.spawns.filter((s) => s.label.startsWith(label)); return x.length >= results.length ? x : undefined }, tries)
    for (let i = 0; i < (vs || []).length && i < results.length; i++) {
      h.fireEnd({ id: vs[i].childId, runId: 'r' + i + '-' + Math.random().toString(36).slice(2, 6), stopReason: 'completed', lastAssistantMessage: text({ Result: results[i], Reason: 'probe' }) })
    }
    return vs || []
  }
  // same, but ignore the first `before` spawns (a re-verification of the same object)
  h.reviewAfter = async (label, before, results, tries) => {
    const vs = await h.find(() => { const x = h.spawns.filter((s) => s.label.startsWith(label)); return x.length >= before + results.length ? x.slice(before) : undefined }, tries)
    for (let i = 0; i < (vs || []).length && i < results.length; i++) {
      h.fireEnd({ id: vs[i].childId, runId: 'n' + i + '-' + Math.random().toString(36).slice(2, 6), stopReason: 'completed', lastAssistantMessage: text({ Result: results[i], Reason: 'probe' }) })
    }
    return vs || []
  }
  h.answer = (label, result, tries) => (async () => {
    const vs = await h.find(() => { const x = h.spawns.filter((s) => s.label.startsWith(label)); return x.length ? x : undefined }, tries)
    for (let i = 0; i < (vs || []).length; i++) h.fireEnd({ id: vs[i].childId, runId: 'a' + i + '-' + Math.random().toString(36).slice(2, 6), stopReason: 'completed', lastAssistantMessage: text({ Result: result, Reason: 'probe' }) })
    return vs || []
  })()
}

// ---------------------------------------------------------------- H3
console.log('\n-- H3: a proof judged 0 must not fabricate "the proposition is false" --')
{
  const h = harness(); await load(h)
  await h.call('vibe_math_new_project', { name: 'p' })
  await h.call('vibe_math_set_params', { maxParallelThreshold: 8, verifierCount: 2 })
  await h.call('vibe_math_add_proposition', { id: 'pProof', 概述: 'P', 布尔估计: 0.6, 优先级: 1, 细类型: { 数论: {} } })
  const f = join(h.project, 'Propos', '数论_Propos.json')
  const list = JSON.parse(readFileSync(f, 'utf8'))
  list[0].证明列表 = [{ 完整过程: 'the proof text', 正确概率: 0.7, 已验: false }]
  writeFileSync(f, JSON.stringify(list, null, 2), 'utf8')
  await h.call('vibe_math_start', {})
  const vs = await h.find(() => { const x = h.spawns.filter((s) => s.label.startsWith('verifier:r-pProof-pf0:')); return x.length >= 2 ? x : undefined })
  assert(!!vs, 'two reviewers were spawned for the proof entry')
  for (let i = 0; i < (vs || []).length; i++) h.fireEnd({ id: vs[i].childId, runId: 'z' + i, stopReason: 'completed', lastAssistantMessage: text({ Result: 0, Reason: 'the proof is invalid' }) })
  const after = await h.find(() => { const p = h.readProps().find((x) => x.id === 'pProof'); return (p && p.证明列表 && p.证明列表[0] && p.证明列表[0].正确概率 === 0) ? p : undefined })
  assert(!!after, 'the judged proof is marked invalid (正确概率=0)')
  assert(!!after && after.布尔估计 === 0.6, 'the proposition\u2019s 布尔估计 is UNCHANGED (0.6) \u2014 "this proof is invalid" is not "the proposition is false"')
  assert(!!after && !(after.证伪列表 || []).some((x) => x.正确概率 === 1), 'no probability-1 refutation entry was fabricated')
  assert(!!after && !(after.证明列表 || []).some((x) => x.正确概率 === 1), 'and no probability-1 proof entry either')
  assert(!!after && after.证明列表[0].已验 === true, 'the invalid proof itself is recorded as 已验')
  const cards = existsSync(join(h.project, 'Verified', '数论_Verified.json')) ? JSON.parse(readFileSync(join(h.project, 'Verified', '数论_Verified.json'), 'utf8')) : []
  assert(!cards.some((c) => c.id === 'pProof'), 'no Verified card was written for the proposition')
  h.restore(); await wait(250); rmSync(h.WS, { recursive: true, force: true })   // deferred deletion: let the plugin's pending async work finish first (harness flake fix)
}

// ---------------------------------------------------------------- H4 + M12 + M13
console.log('\n-- H4/M12/M13: mid-range is not an absolute verdict; accuracy is stable-keyed and deferred --')
{
  const h = harness(); await load(h)
  await h.call('vibe_math_new_project', { name: 'p' })
  await h.call('vibe_math_set_params', { maxParallelThreshold: 8, verifierCount: 2, debateMaxRounds: 1 })
  await h.call('vibe_math_add_problem', { id: 'qA', description: 'accuracy problem' })
  h.writeQs([{ id: 'qA', 概述: 'accuracy problem', 已解决: false, 优先级: 0, 解法列表: [{ 完整解法: 'solution', 正确概率: 0.5, 验证记录: [] }], progress: { directions: [{ id: 'd1', title: 'D', method: 'm', core_assumption: 'c', feasibility: 0.5, status: 'active', round: 0, survival: 0.5, routes: [], blockers: [] }] } }])
  await h.call('vibe_math_start', {})
  await h.review('verifier:r-qA-s0:', [0.6, 0.9], 60)
  const mid = await h.find(() => { const q = h.readQs()[0]; const s = (q.解法列表 || [])[0]; return (s && s.正确概率 !== 0.5 && s.正确概率 !== 1) ? s : undefined })
  assert(!!mid && mid.正确概率 === 0.75, 'flat mode takes the MEAN of the reported probabilities (0.6/0.9 -> ' + (mid && mid.正确概率) + ')')
  assert(!!mid && mid.已验 === true && Number(mid.最近验证时间) > 0, 'the mid-range verdict is stamped for re-verification (0<p<1 is not parked forever)')
  const accFile = join(h.project, 'VibeMath_State', 'verifier_accuracy.json')
  const acc0 = existsSync(accFile) ? JSON.parse(readFileSync(accFile, 'utf8')) : {}
  assert(Object.keys(acc0).length === 0, 'no accuracy was scored against the round\u2019s OWN aggregate (no self-reference)')
  // force the re-verification cooldown to expire
  const before = h.spawns.filter((s) => s.label.startsWith('verifier:r-qA-s0:')).length
  const qs = h.readQs(); qs[0].解法列表[0].最近验证时间 = 0; h.writeQs(qs)
  await wait(500)
  await h.reviewAfter('verifier:r-qA-s0:', before, [1, 1], 60)
  const solved = await h.find(() => { const q = h.readQs()[0]; return (q.已解决) ? q : undefined })
  assert(!!solved, 'the cooled-down object WAS re-verified and then settled (mid-range entries are re-verifiable)')
  assert(!!solved && solved.解法列表[0].正确概率 === 1, 'the second (unanimous) round gives the boolean verdict 1')
  const acc1 = existsSync(accFile) ? JSON.parse(readFileSync(accFile, 'utf8')) : {}
  const keys = Object.keys(acc1)
  assert(keys.length === 1 && keys[0] === 'm:mock/mock', 'accuracy is keyed by the STABLE provider/model identity (keys=' + JSON.stringify(keys) + ')')
  assert(!!acc1['m:mock/mock'] && acc1['m:mock/mock'].total === 2 && acc1['m:mock/mock'].correct === 0,
    'only the earlier round was scored against the later boolean truth (got ' + JSON.stringify(acc1['m:mock/mock']) + '), never the round grading itself')
  h.restore(); await wait(250); rmSync(h.WS, { recursive: true, force: true })   // deferred deletion: let the plugin's pending async work finish first (harness flake fix)
}

// ---------------------------------------------------------------- M10
console.log('\n-- M10: leaving a gated run abandons (does not strand) the pending decision --')
{
  const h = harness(); await load(h)
  await h.call('vibe_math_new_project', { name: 'p' })
  await h.call('vibe_math_set_mode', { mode: 'manual' })
  await h.call('vibe_math_add_problem', { id: 'q1', description: 'gated problem' })
  await h.call('vibe_math_start', {})
  const dec = await h.findAsync(async () => { const d = await h.call('vibe_math_list_decisions', {}); return d.decisions.length ? d : undefined })
  assert(!!dec && dec.decisions.length === 1, 'manual mode produced exactly one pending gate decision')
  const gatedId = dec.decisions[0].id
  await h.call('vibe_math_resume', {})
  await wait(300)
  const after = await h.call('vibe_math_list_decisions', {})
  assert(!after.decisions.some((d) => d.id === gatedId), 'after resume the gated decision is no longer pending (it used to reappear forever)')
  const queue = JSON.parse(readFileSync(join(h.project, 'VibeMath_State', 'decision_queue.json'), 'utf8'))
  const resolved = queue.find((d) => d.id === gatedId && d.resolution && d.resolution.action === 'abandoned')
  assert(!!resolved, 'it is recorded as resolved with action=abandoned (an auditable terminal state)')
  h.restore(); await wait(250); rmSync(h.WS, { recursive: true, force: true })   // deferred deletion: let the plugin's pending async work finish first (harness flake fix)
}

// ---------------------------------------------------------------- M11
console.log('\n-- M11: one surviving reviewer cannot produce a verdict --')
{
  const h = harness(); await load(h)
  await h.call('vibe_math_new_project', { name: 'p' })
  await h.call('vibe_math_set_params', { maxParallelThreshold: 1, verifierCount: 2, debateMaxRounds: 1 })
  await h.call('vibe_math_add_problem', { id: 'qB', description: 'one-slot problem' })
  h.writeQs([{ id: 'qB', 概述: 'one-slot problem', 已解决: false, 优先级: 0, 解法列表: [{ 完整解法: 'solution', 正确概率: 0.5, 验证记录: [] }], progress: { directions: [{ id: 'd1', title: 'D', method: 'm', core_assumption: 'c', feasibility: 0.4, status: 'active', round: 0, survival: 0.4, routes: [], blockers: [] }] } }])
  await h.call('vibe_math_start', {})
  for (let i = 0; i < 10; i++) { await h.answer('verifier:r-qB-s0:', 1, 40); await wait(300) }
  const q = h.readQs()[0]
  assert((q.解法列表 || [])[0].正确概率 === 0.5, 'the single-reviewer verdict was REFUSED (正确概率 still 0.5, got ' + (q.解法列表 || [])[0].正确概率 + ')')
  assert(q.已解决 !== true, 'and the problem was not marked solved')
  const acts = (await h.call('vibe_math_status', {})).recentActivity.map((a) => a.detail).join('\n')
  assert(/有效评审不足 2 份/.test(acts), 'the shortfall is announced on the activity log (why no verdict was written)')
  assert(!existsSync(join(h.project, 'Verified', '问题_Verified.json')), 'no Verified card exists for it')
  h.restore(); await wait(250); rmSync(h.WS, { recursive: true, force: true })   // deferred deletion: let the plugin's pending async work finish first (harness flake fix)
}

// ---------------------------------------------------------------- D4
console.log('\n-- D4: the debate prompt asks for "changed" AND the framework keeps it --')
{
  const h = harness(); await load(h)
  await h.call('vibe_math_new_project', { name: 'p' })
  await h.call('vibe_math_set_params', { maxParallelThreshold: 6, verifierCount: 2, debateMaxRounds: 2, verdictMode: 'flat' })
  await h.call('vibe_math_add_proposition', { id: 'pD4', 概述: 'D4 改判理由', 概率: 0.6, 分类: '数论' })
  await h.call('vibe_math_start', {})
  const vs = await h.find(() => { const x = h.spawns.filter((s) => String(s.label).indexOf('verifier:r-pD4') === 0); return x.length >= 2 ? x : undefined })
  assert(!!vs, 'D4 两个验证器被派出（' + (vs || []).length + '）')
  const fire = (childId, result, changed) => h.fireEnd({ id: childId, runId: 'd4-' + Math.random().toString(36).slice(2, 7), stopReason: 'completed', lastAssistantMessage: [{ type: 'text', text: '```json\n' + JSON.stringify(changed ? { Result: result, Reason: '理由', changed: changed } : { Result: result, Reason: '理由' }) + '\n```' }] })
  // round 1: 1 vs 0.5 ⇒ no consensus ⇒ a real debate round 2
  fire(vs[0].childId, 1); fire(vs[1].childId, 0.5)
  await wait(400)
  // round 2 (re-wake the same children; fireEnd is a no-op without an in-flight turn): one states a change
  for (let i = 0; i < 6; i++) { fire(vs[0].childId, 1, '被对方的反例说服后提高了置信'); fire(vs[1].childId, 1); await wait(250) }
  const logDir = join(h.project, 'Verification_logs')
  const got = await h.find(() => {
    if (!existsSync(logDir)) return undefined
    const fs2 = readdirSync(logDir).filter((f) => f.endsWith('.json'))
    if (!fs2.length) return undefined
    const newest = fs2.sort().pop()
    const j = JSON.parse(readFileSync(join(logDir, newest), 'utf8'))
    return (j.transcript || '').indexOf('[changed:') !== -1 ? j : undefined
  })
  assert(!!got, '★ [D4] 裁决落库的辩论 transcript 里保留了评审的改判理由（changed）')
  await h.restore(); await wait(250); rmSync(h.WS, { recursive: true, force: true })   // deferred deletion: let the plugin's pending async work finish first (harness flake fix)
}

// ---------------------------------------------------------------- P1
console.log('\n-- P1: add_proposition 拒绝覆盖已有 id（与自动路径同语义） --')
{
  const h = harness(); await load(h)
  await h.call('vibe_math_new_project', { name: 'p' })
  const a1 = await h.call('vibe_math_add_proposition', { id: 'pP1', 概述: '第一版陈述', 布尔估计: 0.6 })
  assert(a1.ok === true, 'P1 首次新建成功')
  const a2 = await h.call('vibe_math_add_proposition', { id: 'pP1', 概述: '冒名覆盖', 布尔估计: 0.9 })
  assert(a2.ok !== true && String(a2.code) === 'PROPOSITION_ID_EXISTS',
    '★★ [P1] 同 id 再次新建被拒绝（实测 code=' + JSON.stringify(a2.code || a2.message) + '）')
  assert(typeof a2.next === 'string' && a2.next.length > 0, '★★ [P1] 拒绝时给出可执行的 next（换新 id / 编辑该卡）')
  const list = await h.call('vibe_math_list_propositions', {})
  const kept = (list.propositions || []).filter((x) => x.id === 'pP1')[0]
  assert(kept && kept.概述 === '第一版陈述', '★★ [P1] 已有卡内容未被覆盖（实测 概述=' + JSON.stringify(kept && kept.概述) + '）')
  const a3 = await h.call('vibe_math_add_proposition', { id: 'pP1b', 概述: '新卡', 布尔估计: 0.5 })
  assert(a3.ok === true, '对照：换一个新 id 仍可正常新建')
  h.restore(); await wait(250); rmSync(h.WS, { recursive: true, force: true })   // deferred deletion: let the plugin's pending async work finish first (harness flake fix)
}

// ---------------------------------------------------------------- P2
console.log('\n-- P2: 状态提交有完整性标记，撕裂提交可检测 --')
{
  const h = harness(); await load(h)
  await h.call('vibe_math_new_project', { name: 'p' })
  await h.call('vibe_math_set_params', { verdictMode: 'flat' })
  const st = await h.call('vibe_math_status', {})
  assert(st.stateCommit && Number(st.stateCommit.seq) >= 1,
    '★★ [P2] 提交标记存在且带序号（实测 seq=' + (st.stateCommit && st.stateCommit.seq) + '）')
  assert(st.stateCommit.complete === true && Array.isArray(st.stateCommit.files) && st.stateCommit.files.length >= 6,
    '★★ [P2] 标记列出全部状态文件且都非空（files=' + ((st.stateCommit.files || []).length) + '，mode=' + st.stateCommit.mode + '）')
  assert(st.stateCommit.mode === 'stage-commit' || st.stateCommit.mode === 'direct',
    '对照：提交模式被如实记录（' + st.stateCommit.mode + '）')
  // 撕裂提交：删掉标记列出的一份状态文件（模拟崩溃落在两次写之间），再 resume ⇒ 必须检测到并留痕
  const victimRel = st.stateCommit.files.filter((f) => /tasks\.json$/.test(f))[0] || st.stateCommit.files[0]
  rmSync(join(h.project, victimRel), { force: true })
  await h.call('vibe_math_resume', {})
  const acts = (await h.call('vibe_math_status', {})).recentActivity.map((a) => a.detail).join('\n')
  assert(acts.indexOf('上一次状态提交不完整') !== -1,
    '★★ [P2] 撕裂提交被明确报出（活动日志：' + JSON.stringify(acts.slice(-200)) + '）')
  h.restore(); await wait(250); rmSync(h.WS, { recursive: true, force: true })   // deferred deletion: let the plugin's pending async work finish first (harness flake fix)
}

// ---------------------------------------------------------------- P3
console.log('\n-- P3: 待计分评审样本必须落盘（崩溃不再静默丢样本） --')
{
  const h = harness(); await load(h)
  await h.call('vibe_math_new_project', { name: 'p' })
  await h.call('vibe_math_set_params', { verifierCount: 2, maxParallelThreshold: 4, debateMaxRounds: 1, verdictMode: 'flat' })
  await h.call('vibe_math_add_proposition', { id: 'pP3', 概述: '待计分样本', 布尔估计: 0.6 })
  await h.call('vibe_math_start', {})
  const vs = await h.find(() => { const x = h.spawns.filter((s) => String(s.label).indexOf('verifier:r-pP3') === 0); return x.length >= 2 ? x : undefined })
  assert(!!vs, 'P3 两个验证器被派出（' + (vs || []).length + '）')
  for (let i = 0; i < (vs || []).length; i++) h.answer('verifier:r-pP3', 0.5, 40)
  await wait(600)
  const rel = join('VibeMath_State', 'pending_review_scores.json')
  const persisted = await h.find(() => {
    const f = join(h.project, rel)
    if (!existsSync(f)) return undefined
    const j = JSON.parse(readFileSync(f, 'utf8'))
    return Object.keys(j).length > 0 ? j : undefined
  })
  assert(!!persisted, '★★ [P3] 待计分样本落盘（VibeMath_State/pending_review_scores.json 非空）')
  assert(persisted && Object.keys(persisted).some((k) => k.indexOf('pP3') !== -1),
    '★★ [P3] 落盘内容包含刚投票的对象（keys=' + JSON.stringify(Object.keys(persisted || {}).slice(0, 3)) + '）')
  await h.call('vibe_math_resume', {})
  const after = JSON.parse(readFileSync(join(h.project, rel), 'utf8'))
  assert(Object.keys(after).some((k) => k.indexOf('pP3') !== -1),
    '★★ [P3] 恢复后样本仍在（loadState 回读，不是被清空重来）')
  h.restore(); await wait(250); rmSync(h.WS, { recursive: true, force: true })   // deferred deletion: let the plugin's pending async work finish first (harness flake fix)
}

// ---------------------------------------------------------------- P4
console.log('\n-- P4: 被拒绝/失败的落盘必须可见 --')
{
  const h = harness(); await load(h)
  await h.call('vibe_math_new_project', { name: 'p' })
  await h.call('vibe_math_set_params', { verdictMode: 'flat' })
  // 制造"存在但无法解析"的状态文件 ⇒ 损坏守卫必须拒绝写入，而且这次拒绝要**可见**
  writeFileSync(join(h.project, 'VibeMath_State', 'tasks.json'), '{not json', 'utf8')
  await h.call('vibe_math_resume', {}) // 先让插件**读到**这个坏文件（损坏守卫据此标记它）
  await h.call('vibe_math_pause', {})
  const st = await h.call('vibe_math_status', {})
  assert(st.stateWriteFailures && Number(st.stateWriteFailures.count) >= 1,
    '★★ [P4] 被拒绝的写入计入诊断（count=' + (st.stateWriteFailures && st.stateWriteFailures.count) + '）')
  assert(st.stateWriteFailures.last && /tasks\.json/.test(String(st.stateWriteFailures.last.rel)),
    '★★ [P4] 诊断指出具体文件（last.rel=' + (st.stateWriteFailures.last && st.stateWriteFailures.last.rel) + '）')
  const rep = await h.call('vibe_math_report', {})
  assert(rep.stateWriteFailures && Number(rep.stateWriteFailures.count) >= 1, '★★ [P4] report 同样暴露该诊断（不只 status）')
  const acts = (await h.call('vibe_math_status', {})).recentActivity.map((a) => a.detail).join('\n')
  assert(/拒绝写入/.test(acts), '★★ [P4] 活动日志有"拒绝写入"留痕（实测 ' + JSON.stringify(acts.slice(-140)) + '）')
  h.restore(); await wait(250); rmSync(h.WS, { recursive: true, force: true })   // deferred deletion: let the plugin's pending async work finish first (harness flake fix)
}

// ---------------------------------------------------------------- P5–P8
console.log('\n-- P5–P8: 状态完整性（日志回读 / 论文排队 / 日志名 / 短 id 唯一） --')
{
  const h = harness(); await load(h)
  await h.call('vibe_math_new_project', { name: 'p' })
  await h.call('vibe_math_pause', {})
  const st0 = await h.call('vibe_math_status', {})
  const rel = (f) => join(h.project, 'VibeMath_State', f)
  assert(existsSync(rel('activity_log.json')), '★★ [P5] activityLog 落盘（VibeMath_State/activity_log.json）')
  assert(existsSync(rel('paper.json')), '★★ [P6] 论文排队/回收计数落盘（VibeMath_State/paper.json）')
  const pj = JSON.parse(readFileSync(rel('paper.json'), 'utf8'))
  assert('pending' in pj && 'reaps' in pj, '★★ [P6] paper.json 含 pending/reaps（实测 ' + JSON.stringify(pj) + '）')
  // P5 回读：resume 之后活动日志不为空（旧实现每次都从零开始）
  await h.call('vibe_math_resume', {})
  const st1 = await h.call('vibe_math_status', {})
  assert((st1.recentActivity || []).length > 0,
    '★★ [P5] 恢复后 recentActivity 非空（从磁盘回读；实测 ' + (st1.recentActivity || []).length + ' 条）')
  const src = readFileSync(new URL('../vibe-math-v2/vibe-math-v2.js', import.meta.url), 'utf8')
  assert(/Date\.now\(\) \+ '_' \+ shortId\(\) \+ '\.json'/.test(src),
    '★★ [P7] 裁决日志名带 shortId 后缀（同一毫秒的两次裁决不再互相覆盖）')
  assert(/function shortIdUnique\(isTaken\)/.test(src) && /'p-' \+ shortIdUnique\(/.test(src),
    '★★ [P8] 框架分配命题 id 走 shortIdUnique（分配前查重，不再靠概率）')
  h.restore(); await wait(250); rmSync(h.WS, { recursive: true, force: true })   // deferred deletion: let the plugin's pending async work finish first (harness flake fix)
}

console.log('\n-- F1: pendingDecisions 在 status/report 同形 --');
{
  const h = harness(); await load(h)
  await h.call('vibe_math_new_project', { name: 'pf1' })
  const st = await h.call('vibe_math_status', {});
  const rep = await h.call('vibe_math_report', {});
  assert(typeof st.pendingDecisions === 'number' && typeof rep.pendingDecisions === 'number',
    '★★★ [F1] pendingDecisions 两面同形（都是数字；实测 status=' + typeof st.pendingDecisions + ' report=' + typeof rep.pendingDecisions + '）');
  assert(Array.isArray(rep.pendingDecisionItems) && rep.pendingDecisionItems.length === rep.pendingDecisions,
    '★★ [F1] 明细用独立键名 pendingDecisionItems，且长度与计数一致（实测 ' + JSON.stringify(rep.pendingDecisionItems && rep.pendingDecisionItems.length) + '）');
  h.restore(); await wait(250); rmSync(h.WS, { recursive: true, force: true })   // deferred deletion: let the plugin's pending async work finish first (harness flake fix)
}
console.log('\n-- F3: fieldScopes 标注会话 vs 耐久 --');
{
const h = harness(); await load(h)
await h.call('vibe_math_new_project', { name: 'pf3' })
  const st = await h.call('vibe_math_status', {});
  const sc = st.fieldScopes;
  assert(sc && Array.isArray(sc.session) && Array.isArray(sc.durable) && typeof sc.note === 'string' && sc.note.length > 0, '★★★ [F3] status 带 fieldScopes（session/durable/note 齐备）');
  const getPath = (p) => p.split('.').reduce((o, k) => (o === undefined || o === null ? undefined : o[k]), st);
  const missing = (sc ? sc.session.concat(sc.durable) : []).filter((p) => getPath(p) === undefined);
  assert(missing.length === 0, '★★★ [F3] fieldScopes 列的每个字段在载荷里真实存在（列出不存在的名字会在此变红；缺 ' + JSON.stringify(missing) + '）');
  assert(sc && sc.session.indexOf('stateWriteFailures') !== -1 && sc.session.indexOf('registeredAgents') !== -1 && sc.durable.indexOf('formal') !== -1 && sc.durable.indexOf('stateWriteFailures') === -1, '★★ [F3] 语义抽查：stateWriteFailures/registeredAgents 属会话、formal 属耐久，两组互斥');
h.restore(); await wait(250); rmSync(h.WS, { recursive: true, force: true })   // deferred deletion: let the plugin's pending async work finish first (harness flake fix)
}
console.log('\n-- F5/F6: 两面字段集与 paths 基准 --');
{
  const h = harness(); await load(h);
  await h.call('vibe_math_new_project', { name: 'pf56' });
  const st = await h.call('vibe_math_status', {});
  const rep = await h.call('vibe_math_report', {});
  assert('paper' in st && 'paper' in rep && 'at' in st && 'at' in rep, '★★★ [F5] paper/at 两面都有（v2 status/report 字段集对齐）');
  const need = ['base', 'project', 'proofs', 'lib', 'proved', 'note'];
  assert(st.formal && st.formal.paths && need.every((k) => k in st.formal.paths), '★★★ [F6] status.formal.paths 带 base + note（缺 ' + JSON.stringify(need.filter((k) => !st.formal.paths || !(k in st.formal.paths))) + '）');
  const pp = st.formal.paths || {};
  assert(typeof pp.base === 'string' && pp.base.indexOf('/') !== -1 && /^([A-Za-z]:[\\/]|\/)/.test(pp.base), '★★ [F6] base 是绝对项目根（实测 ' + JSON.stringify(pp.base) + '）');
  const rpj = rep.formal && rep.formal.paths ? rep.formal.paths : null;
  assert(!!rpj && 'base' in rpj && 'note' in rpj, '★★ [F6] report 侧的 paths 同样带 base/note（两面一致）');
  h.restore(); await wait(250); rmSync(h.WS, { recursive: true, force: true })
}
console.log('\n-- F4: push 帧点名各代理状态的来源工具 --')
{
  const src = readFileSync(new URL('../vibe-math-v2/vibe-math-v2.js', import.meta.url), 'utf8')
  assert(/请调用 vibe_math_report 汇总当前进展，并用 vibe_math_list_agents 取各代理/.test(src), '★★ [F4] push 帧点名 vibe_math_list_agents（report 只给计数，逐代理状态在那个工具里）')
  assert(/下一步：把该对象形式化到 Lean 通过/.test(src), '★★ [A5] require-gate 反馈行携带下一步（与 formal-verify-v2 的行为断言同源）')
}

// ---------------------------------------------------------------- F5 (fence-root drift)
console.log('\n-- F5: 围栏根与会话工作区不一致必须一次性告警 --');
{
  const h5 = harness({ policyRoot: join(tmpdir(), 'not-this-session') });
  await load(h5);
  await h5.call('vibe_math_new_project', { name: 'p' });
  await h5.call('vibe_math_add_problem', { id: 'qF5', description: 'x' });
  await h5.call('vibe_math_start', {});
  await h5.find(() => h5.spawns.length > 0);
  const e5 = h5.errors.join('\n');
  const hit5 = e5.split('\n').filter((l) => /sandbox fence root differs from this session workspace/.test(l));
  assert(hit5.length === 1, '★★★ [F5] 围栏根漂移给一次性具名告警（实测 ' + JSON.stringify(hit5[0] || e5.slice(-160)) + '）');
  h5.restore(); await wait(250); rmSync(h5.WS, { recursive: true, force: true });
}
// ---------------------------------------------------------------- F6a/F6b (silent-failure surfacing)
console.log('\n-- F6a/F6b: 静默回退与中断失败必须留痕 --');
{
  // 5× 矩阵发现：一次性告警若已被本进程早先的段落消费，本段就再也看不到它。
  // 因此这里走**文档化的 seam**加载一个**全新模块实例**（临时目录里复制 preset + 其相对导入），
  // 断言真正的契约：告警内容正确、且在**同一实例内至多出现一次**。
  const srcDir = dirname(fileURLToPath(PLUGIN_URL));   // seam-resolved: a V2_PLUGIN mutant is re-instantiated too
  const cdir = mkdtempSync(join(tmpdir(), 'v2-f6a-'));
  for (const f of ['vibe-math-v2.js', 'math-computation.js', 'math-engines.js']) copyFileSync(join(srcDir, f), join(cdir, f));
  const prevPlugin = process.env.V2_PLUGIN;
  process.env.V2_PLUGIN = join(cdir, 'vibe-math-v2.js');
  const h1 = harness({ failSubagentsList: true });
  try {
    await load(h1);
    await h1.call('vibe_math_new_project', { name: 'p' });
    await h1.call('vibe_math_set_params', { maxParallelThreshold: 8 });
    await h1.call('vibe_math_add_problem', { id: 'qA6', description: 'x' });
    await h1.call('vibe_math_start', {});
    await h1.find(() => h1.spawns.length > 0);           // 异步 tick 才产出子代理
    await h1.find(() => h1.spawns.length > 1, 20);       // 尽量制造第二次 pickProvider 调用（至多一次的正面证据）
    const hits = h1.errors.join('\n').split('\n').filter((l) => /pickProvider\(\) falling back to 'spawn'/.test(l));
    assert(hits.length === 1 && /subagents\.list\(\) failed/.test(hits[0] || ''), '★★★ [F6a] 回退告警内容正确且在**同一实例内恰好一次**（实测 ' + JSON.stringify(hits) + '，spawns=' + h1.spawns.length + '）');
  } finally {
    if (prevPlugin === undefined) delete process.env.V2_PLUGIN; else process.env.V2_PLUGIN = prevPlugin;
    h1.restore(); await wait(250); rmSync(h1.WS, { recursive: true, force: true }); rmSync(cdir, { recursive: true, force: true });
  }
  const h2 = harness({ failInterrupt: true });
  await load(h2);
  await h2.call('vibe_math_new_project', { name: 'p' });
  await h2.call('vibe_math_add_problem', { id: 'qA6', description: 'x' });
  await h2.call('vibe_math_start', {});
  await h2.find(() => h2.spawns.length > 0);
  await h2.call('vibe_math_abort', {});
  const st2 = await h2.call('vibe_math_status', {});
  const acts = (st2.recentActivity || []).map((a) => String(a.event) + ' ' + String(a.detail)).join('\n');
  assert(/中断失败/.test(acts), '★★★ [F6b] 中断失败进入活动日志（实测 ' + JSON.stringify((acts.split('\n').filter((x) => /中断/.test(x)).slice(-1)[0] || acts.slice(-140))) + '）');
  h2.restore(); await wait(250); rmSync(h2.WS, { recursive: true, force: true });
}
// ---------------------------------------------------------------- F6c (project pointer must not fail silently)
console.log('\n-- F6c: 项目指针写失败必须可观察 --');
{
  const h = harness({ failWritePath: 'current.' });
  await load(h);
  await h.call('vibe_math_new_project', { name: 'p' });
  const st = await h.call('vibe_math_status', {});
  const last = st.stateWriteFailures && st.stateWriteFailures.last;
  assert(!!last && /current\./.test(JSON.stringify(last)), '★★★ [F6c] 项目指针写失败进入 status.stateWriteFailures（实测 ' + JSON.stringify(st.stateWriteFailures) + '）');
  h.restore(); await wait(250); rmSync(h.WS, { recursive: true, force: true })
}
// ---------------------------------------------------------------- F2 (proactive tool-name intersection)
console.log('\n-- F2: 候选工具名与宿主可见工具面求交（composedToolList）--');
{
  const schemas = ['vibe_math_status', 'vibe_math_report', 'web_search', 'pwsh', 'math_computation'].map((n) => ({ name: n }));
  const h = harness({ toolSchemas: schemas });
  await load(h);
  await h.call('vibe_math_new_project', { name: 'p' });
  await h.call('vibe_math_set_params', { maxParallelThreshold: 8, verifierCount: 2, verifierToolAllow: ['vibe_math_status'], verifierAllowNetwork: true });
  await h.call('vibe_math_add_proposition', { id: 'pF2', 概述: 'P', 布尔估计: 0.6, 优先级: 1, 细类型: { 数论: {} } });
  const f = join(h.project, 'Propos', '数论_Propos.json');
  const list = JSON.parse(readFileSync(f, 'utf8'));
  list[0].证明列表 = [{ 完整过程: 'proof', 正确概率: 0.7, 已验: false }];
  writeFileSync(f, JSON.stringify(list, null, 2), 'utf8');
  await h.call('vibe_math_start', {});
  const v = await h.find(() => h.spawns.find((s2) => s2.label.startsWith('verifier:r-pF2-pf0:')));
  assert(!!v, 'F2: 验证者子代理已派出（用于观察 toolFilter）');
  const allow = (v && v.request && v.request.toolFilter && v.request.toolFilter.allow) || [];
  assert(allow.indexOf('web_search') !== -1, '★ [F2] 宿主注册的 web_search 进入 allow（实测 ' + JSON.stringify(allow) + '）');
  assert(allow.indexOf('web_fetch') === -1, '★★★ [F2] 宿主**未**注册的 web_fetch 绝不进入 filter（候选 ∩ tools.schemas；实测 ' + JSON.stringify(allow) + '）');
  h.restore(); await wait(250); rmSync(h.WS, { recursive: true, force: true })
}
// ---------------------------------------------------------------- M15
console.log('\n-- M15: status and report share one recentActivity bound (30) --')
{
  const h = harness(); await load(h)
  await h.call('vibe_math_new_project', { name: 'p' })
  for (let i = 0; i < 14; i++) { await h.call('vibe_math_pause', {}); await h.call('vibe_math_resume', {}) }
  const st = await h.call('vibe_math_status', {})
  const rep = await h.call('vibe_math_report', {})
  assert(st.recentActivity.length > 10, 'status shows more than the old hardcoded 10 entries (' + st.recentActivity.length + ')')
  assert(st.recentActivity.length === rep.recentActivity.length, 'status and report show the SAME number of entries (' + st.recentActivity.length + ' vs ' + rep.recentActivity.length + ')')
  assert(st.recentActivity.length <= 30, 'and never more than the documented 30 (' + st.recentActivity.length + ')')
  h.restore(); await wait(250); rmSync(h.WS, { recursive: true, force: true })   // deferred deletion: let the plugin's pending async work finish first (harness flake fix)
}

// ---------------------------------------------------------------- H5
console.log('\n-- H5: a host without subprocess reports the failure instead of degrading silently --')
{
  const h = harness({ noSubprocess: true }); await load(h)
  await h.call('vibe_math_new_project', { name: 'p' })
  // migrateLegacyParams -> removeFile() on a host with no shell
  writeFileSync(join(h.project, 'VibeMath_State', 'params.json'), JSON.stringify({ verdictMode: 'forced' }), 'utf8')
  await h.call('vibe_math_status', {})
  await wait(200)
  const joined = h.errors.join('\n')
  assert(/ensureDirs/.test(joined) && /no-subprocess/.test(joined), 'the failed mkdir is logged WITH its reason (ensureDirs ... no-subprocess)')
  assert(/removeFile\(VibeMath_State\/params\.json\)/.test(joined) && /no-subprocess/.test(joined), 'the degraded delete is logged with its reason too')
  h.restore(); await wait(250); rmSync(h.WS, { recursive: true, force: true })   // deferred deletion: let the plugin's pending async work finish first (harness flake fix)
}

// ---------------------------------------------------------------- L20
console.log('\n-- L20: a verdict the require gate withheld is reported as NOT applied --')
{
  const h = harness(); await load(h)
  await h.call('vibe_math_new_project', { name: 'p' })
  await h.call('vibe_math_set_params', { maxParallelThreshold: 8, verifierCount: 2, formalVerify: 'require', mode: 'manual' })
  await h.call('vibe_math_add_proposition', { id: 'pDefer', 概述: 'P', 布尔估计: 0.5, 优先级: 1, 细类型: { 数论: {} } })
  await h.call('vibe_math_start', {})
  const vs = await h.find(() => { const x = h.spawns.filter((s) => s.label.startsWith('verifier:r-pDefer:')); return x.length >= 2 ? x : undefined })
  assert(!!vs, 'two reviewers were spawned for the bare proposition')
  for (let i = 0; i < (vs || []).length; i++) h.fireEnd({ id: vs[i].childId, runId: 'd' + i, stopReason: 'completed', lastAssistantMessage: text({ Result: 1, Reason: 'probe' }) })
  const dec = await h.findAsync(async () => { const d = await h.call('vibe_math_list_decisions', {}); return d.decisions.length ? d : undefined })
  assert(!!dec && dec.decisions.length === 1, 'manual mode raised the verdict decision')
  if (dec && dec.decisions.length) {
    const res = await h.call('vibe_math_decide', { id: dec.decisions[0].id, action: 'approve' })
    assert(res.ok === true && res.applied && res.applied.applied === false,
      '★ the approval reports applied=false: the require gate withheld the verdict (got ' + JSON.stringify(res.applied) + ')')
    const p = h.readProps().find((x) => x.id === 'pDefer') || {}
    assert(p.布尔估计 === 0.5, 'and the proposition is untouched (no verdict was applied)')
    const queue = JSON.parse(readFileSync(join(h.project, 'VibeMath_State', 'decision_queue.json'), 'utf8'))
    const resolved = queue.find((d) => d.id === dec.decisions[0].id)
    assert(!!resolved && resolved.status === 'resolved', 'the human decision itself is still resolved (a terminal state)')
    const todo = existsSync(join(h.project, 'Formal', 'TODO.md')) ? readFileSync(join(h.project, 'Formal', 'TODO.md'), 'utf8') : ''
    assert(/pDefer/.test(todo) && /formal-required/.test(todo), 'and the deferral is on the formalization TODO')
  }
  h.restore(); await wait(250); rmSync(h.WS, { recursive: true, force: true })   // deferred deletion: let the plugin's pending async work finish first (harness flake fix)
}

// ---------------------------------------------------------------- L19
console.log('\n-- L19: the string fallback must not read `r-pAmb-s1` as the same-prefix neighbour pAmb --')
{
  const h = harness(); await load(h)
  await h.call('vibe_math_new_project', { name: 'p' })
  await h.call('vibe_math_set_params', { formalVerify: 'require', maxParallelThreshold: 8, tickIntervalMs: 200 })
  await h.call('vibe_math_add_proposition', { id: 'pAmb', 概述: '同前缀邻居', 布尔估计: 0.5, 优先级: 1, 细类型: { 数论: {} } })
  await h.call('vibe_math_add_proposition', { id: 'pAmb-s1', 概述: '对象 id 本身以 -s1 结尾', 布尔估计: 0.5, 优先级: 1, 细类型: { 数论: {} } })
  await h.call('vibe_math_add_problem', { id: 'qKeep', description: '保持调度的占位问题', priority: 9 })
  await h.call('vibe_math_start', {})
  await h.call('vibe_math_pause', {})
  // A tick that started before the pause may still be in flight and call saveAll() AFTER our write —
  // let it drain first, or the hand-written state file would be overwritten before resume reads it.
  await wait(900)
  // Simulate a legacy/hand-edited record: the authoritative `objectId` is absent, so ONLY the string
  // fallback can tell `r-pAmb-s1` (object pAmb-s1) from `r-pAmb` + suffix (object pAmb). The neighbour
  // carries its own `passed` record, so a wrong parse would visibly downgrade the WRONG object.
  const f = join(h.project, 'VibeMath_State', 'formal.json')
  mkdirSync(join(h.project, 'Verified', 'Lean'), { recursive: true })
  writeFileSync(join(h.project, 'Verified', 'Lean', 'pAmb-s1.lean'), 'theorem p_amb_s1 : 3 + 3 = 6 := by decide\n', 'utf8')
  const base = { status: 'passed', file: 'Formal/pAmb-s1.lean', proof: 'Verified/Lean/pAmb-s1.lean', decision: 'used', updatedAt: 1 }
  writeFileSync(f, JSON.stringify({ records: {
    'r-pAmb-s1': Object.assign({}, base),                       // ← no objectId: the shape under test
    pAmb: Object.assign({}, base, { file: 'Formal/pAmb.lean', proof: 'Verified/Lean/pAmb.lean' }),
  }, todo: [] }), 'utf8')
  assert(!!JSON.parse(readFileSync(f, 'utf8')).records['r-pAmb-s1'], 'the hand-edited record survived until resume (no in-flight tick overwrote it)')
  await h.call('vibe_math_resume', {})
  assert(JSON.parse(readFileSync(f, 'utf8')).records['r-pAmb-s1'].objectId === undefined, 'precondition: the alias record really carries no authoritative owner (the fallback is what gets exercised)')
  const ex = await h.find(() => h.spawns.find((s) => s.label.startsWith('explorer:qKeep')), 60)
  assert(!!ex, 'the explorer is running (the work-round reply path is live)')
  if (ex) {
    h.fireEnd({ id: ex.childId, runId: 'l19', provider: 'spawn', local: true, stopReason: 'completed', lastAssistantMessage: text({ directions: [], formal: { target: 'r-pAmb-s1', decision: 'defect', note: 'Lean 只证了 n>0 的情形' } }) })
    // Read the WHOLE record set once the defect landed on EITHER id, so the neighbour check also fails
    // when the wrong owner was picked (a `find` that only looks for the right id would hide that).
    const landed = await h.find(() => {
      const d = JSON.parse(readFileSync(f, 'utf8')).records || {}
      return ((d['pAmb-s1'] && d['pAmb-s1'].decision === 'defect') || (d.pAmb && d.pAmb.decision === 'defect')) ? d : undefined
    }, 40)
    const after = landed || JSON.parse(readFileSync(f, 'utf8')).records || {}
    assert(!!after['pAmb-s1'] && after['pAmb-s1'].decision === 'defect', '★★ a defect named by r-pAmb-s1 reached its REAL owner pAmb-s1 through the string fallback (got ' + JSON.stringify(Object.keys(after).map((k) => k + ':' + after[k].decision)) + ')')
    assert(!after['pAmb'] || after['pAmb'].decision !== 'defect', '★★ and the same-prefix neighbour pAmb was NOT downgraded (its own passed proof survives)')
  }
  h.restore(); await wait(250); rmSync(h.WS, { recursive: true, force: true })   // deferred deletion: let the plugin's pending async work finish first (harness flake fix)
}

// ================================================================ final paper (spec §6)
const PAPER_REPLY = {
  title: '假论文｜收敛后的整理',
  abstract: '原问题是「假问题」；主要结论是假定理成立。',
  sections: [
    { name: '引言与问题背景', body: '背景：变量 a_b 与占比 50%，以及行内数学 $x^2+y^2$。' },
    { name: '原问题的完整解法', body: '解法步骤：\n- 第一步\n- 第二步' },
    { name: '已检验通过的命题', body: '命题 pClosed 的布尔估计为 1（经 ≥2 名验证者定论）。' },
    { name: '已解决的子问题与中间成果', body: '子问题 qSub 已解决。' },
    { name: '创造或发现的有价值之物', body: '方法 m1（可复用）。' },
    { name: '规律总结', body: '规律：先化简再归纳。' },
    { name: '讨论、局限与展望', body: '局限：pOpen 仍为 0.5（未定论），不得当成已成立。' },
  ],
}
const paperWriterReplies = (h) => h.spawns.filter((s) => s.label.startsWith('paper-writer:'))
const firePaper = (h, reply) => {
  const w = paperWriterReplies(h)[paperWriterReplies(h).length - 1]
  if (!w) return false
  h.fireEnd({ id: w.childId, runId: 'pw-' + w.childId, provider: 'spawn', local: true, stopReason: 'completed', lastAssistantMessage: text(reply || PAPER_REPLY) })
  return true
}
const readMeta = (h, id) => JSON.parse(readFileSync(join(h.paperDir(id), 'paper.meta.json'), 'utf8'))

console.log('\n-- PAPER §6.1: params — defaults, schema presence, coercion, rejection --')
{
  const h = harness(); await load(h)
  const setup = await h.call('vibe_math_setup', {})
  const by = {}; for (const p of setup.parameters) by[p.name] = p
  for (const k of ['finalPaper', 'paperFormat', 'paperLanguage', 'paperCompilePdf', 'paperLatexCommand']) assert(!!by[k], 'setup schema exposes ' + k)
  assert(by.finalPaper && by.finalPaper.default === true && by.paperFormat.default === 'both' && by.paperLanguage.default === 'zh' && by.paperCompilePdf.default === true && by.paperLatexCommand.default === '', 'defaults are true/both/zh/true/""')
  assert(JSON.stringify(by.paperFormat.options) === JSON.stringify(['both', 'md', 'tex']) && JSON.stringify(by.paperLanguage.options) === JSON.stringify(['zh', 'en']), 'enums are documented in the schema/help text')
  const bad = await h.call('vibe_math_set_params', { paperFormat: 'weird', paperLanguage: 'xx', finalPaper: 'false', paperCompilePdf: 'no', paperLatexCommand: '   ' })
  assert(bad.params.paperFormat === 'both' && bad.params.paperLanguage === 'zh', 'illegal enum values fall back to the defaults (got ' + bad.params.paperFormat + '/' + bad.params.paperLanguage + ')')
  assert(bad.params.finalPaper === true && bad.params.paperCompilePdf === true, '★★ a string "false"/"no" is NOT accepted as a boolean (spec v2 §B: unknown-style pass-through would leave it truthy)')
  assert(bad.params.paperLatexCommand === '', 'a blank engine name falls back to auto-detection')
  const good = await h.call('vibe_math_set_params', { paperFormat: 'tex', paperLanguage: 'en', finalPaper: false, paperCompilePdf: false, paperLatexCommand: 'xelatex' })
  assert(good.params.paperFormat === 'tex' && good.params.paperLanguage === 'en' && good.params.finalPaper === false && good.params.paperCompilePdf === false && good.params.paperLatexCommand === 'xelatex', 'legal values are accepted verbatim')
  const regs = h.toolRegs.filter((s) => s.name === 'vibe_math_set_params')
  assert(regs.length === 1 && ['finalPaper', 'paperFormat', 'paperLanguage', 'paperCompilePdf', 'paperLatexCommand'].every((k) => !!regs[0].parameters.properties[k]), 'the registered tool schema carries all five paper keys')
  const src = readFileSync(new URL('../vibe-math-v2/vibe-math-v2.js', import.meta.url), 'utf8')
  assert((src.match(/paperCompilePdf: \{ type: 'boolean' \}/g) || []).length === 2, '★★ BOTH v2 set_params tables were updated (spec v2 §B: 5–6 coordinated sites)')
  assert(/paper \[lang=zh\|en\] \[format=both\|md\|tex\] \[force\]/.test(src), 'the /vibe hint and usage advertise `paper`')
  h.restore(); await wait(250); rmSync(h.WS, { recursive: true, force: true })   // deferred deletion: let the plugin's pending async work finish first (harness flake fix)
}

console.log('\n-- PAPER §6.2/§6.3: closure trigger, idempotence, 9-section content, evidence index --')
{
  const h = harness({ latex: { engines: ['xelatex'] } }); await load(h)
  await h.call('vibe_math_new_project', { name: 'p' })
  await h.call('vibe_math_set_params', { tickIntervalMs: 200, finalPaper: true, paperFormat: 'both', paperCompilePdf: true })
  await h.call('vibe_math_status', {})   // ensures the session state exists
  // 证据：一个命题（未定论，必须在论文里被标注）
  await h.call('vibe_math_add_proposition', { id: 'pOpen', 概述: '仍未定论的命题', 布尔估计: 0.5, 优先级: 1, 细类型: { 数论: {} } })
  // 负用例：还有未解决问题时不得派遣（严格终止未满足）
  await h.call('vibe_math_add_problem', { id: 'qOpen', description: '未解决问题', priority: 0 })
  await h.call('vibe_math_start', {})
  await wait(700)
  assert(paperWriterReplies(h).length === 0, '★ NOT converged → no paper writer is dispatched')
  // 收口：把问题标成已解决/never、把命题停靠为 优先级=never（未定论但不再入选验证）——
  // 这正是 v2 真正能收口的状态（任何仍为验证候选的对象都会阻止严格终止），并让论文里
  // 有一个必须显式标注的未决项。随后清掉在途 explorer/verifier（终止判据含 agentRegistry==={}）。
  await h.call('vibe_math_pause', {})
  const qs = h.readQs(); qs[0].已解决 = true; qs[0].优先级 = 'never'; h.writeQs(qs)
  const pf = join(h.project, 'Propos', '数论_Propos.json')
  const props = JSON.parse(readFileSync(pf, 'utf8'))
  props[0].优先级 = 'never'
  writeFileSync(pf, JSON.stringify(props, null, 2), 'utf8')
  await h.call('vibe_math_abort', {})
  await h.call('vibe_math_start', {})
  const w = await h.find(() => { const x = paperWriterReplies(h); return x.length ? x : undefined }, 40)
  assert(!!w, '★ closure (strict termination) dispatched exactly one paper writer')
  assert(paperWriterReplies(h).length === 1, 'exactly one writer for this run (got ' + paperWriterReplies(h).length + ')')
  const prompt = (w && w[0].request.prompt[0].text) || ''
  assert(prompt.indexOf('DEDICATED PAPER WRITER') !== -1, 'the writer prompt is the single-author paper contract')
  for (const s of h.H.PAPER_SKELETON) assert(prompt.indexOf(s.key) !== -1, 'the prompt carries skeleton section: ' + s.key)
  assert(/\[UNRESOLVED \/ REFUTED/.test(prompt) && /pOpen/.test(prompt), '★★ the prompt lists the still-undecided item explicitly (spec v2 §A4)')
  assert(/NEVER invent content/.test(prompt), 'the prompt forbids inventing content')
  const stRun = await h.call('vibe_math_status', {})
  assert(!!stRun.paper && stRun.paper.inFlight === (w && w[0].childId), 'status reports the in-flight paper writer')
  assert(typeof stRun.paper.finalizedAt !== 'number' || stRun.paper.finalizedAt === null, 'no finalization recorded before the writer replies')
  firePaper(h)
  const metaFile = join(h.paperDir('p'), 'paper.meta.json')
  const meta = await h.find(() => (existsSync(metaFile) ? readMeta(h, 'p') : undefined), 40)
  assert(!!meta, '★ paper.meta.json was written when the writer ended')
  const md = readFileSync(join(h.paperDir('p'), 'paper.md'), 'utf8')
  const tex = readFileSync(join(h.paperDir('p'), 'paper.tex'), 'utf8')
  const heads = (md.match(/^## /gm) || []).length
  assert(heads === 9, '★ the md carries exactly the 9-section skeleton (got ' + heads + ')')
  for (const s of h.H.PAPER_SKELETON) assert(md.indexOf('## ' + s.key) !== -1, 'md section present: ' + s.key)
  assert(md.indexOf('### 证据与文件索引') !== -1 && md.indexOf('`qs/qs.json`') !== -1, '★ the appendix carries the evidence index (existing files only)')
  assert(md.indexOf('未定论') !== -1, 'the unresolved item is labelled in the paper (不得编造)')
  assert((tex.match(/\\section\{/g) || []).length === 9, '★ the tex carries the same 9 sections')
  assert(tex.indexOf('\\documentclass[11pt]{ctexart}') !== -1, 'zh uses ctexart')
  assert(tex.indexOf('a\\_b') !== -1 && tex.indexOf('50\\%') !== -1, '★★ underscore/percent are tex-escaped')
  assert(tex.indexOf('a_b') === -1 && tex.indexOf('50%') === -1, '★★ and the raw forms are gone')
  assert(tex.indexOf('$x^2+y^2$') !== -1, 'inline math is passed through unescaped')
  assert(meta.trigger === 'auto' && Number(meta.runStartedAt) > 0, 'meta records the auto trigger + run id')
  assert(meta.artifacts.md === true && meta.artifacts.tex === true && meta.artifacts.pdf === true, 'meta records md+tex+pdf')
  assert(meta.compile === 'ok' && meta.compileEngine === 'xelatex', '★ the fake compiler produced the pdf (compile=' + meta.compile + ')')
  const log = readFileSync(join(h.paperDir('p'), 'paper.log.md'), 'utf8')
  assert(/\[dispatch\]/.test(log) && /\[finalize\]/.test(log) && /\[compile\]/.test(log), 'paper.log.md carries the fixed single-author log format')
  // 幂等：同一 run 手动再触发 → 不重复派遣、不重写
  const again = await h.cmd('paper')
  const againBody = JSON.parse(again.text)
  assert(again.kind === 'success' && againBody.skipped === true && againBody.reason === 'already-finalized-this-run', '★ a repeat trigger in the same run is idempotent (skipped, got ' + JSON.stringify(againBody.reason) + ')')
  assert(paperWriterReplies(h).length === 1, '★★ the idempotent path did NOT dispatch a second writer')
  // 缺产物 → 只补写（不派遣作者）
  rmSync(join(h.paperDir('p'), 'paper.tex'), { force: true })
  const filled = JSON.parse((await h.cmd('paper')).text)
  assert(filled.skipped === true && filled.reason === 'filled-missing-artifacts' && Array.isArray(filled.filled) && filled.filled.indexOf('paper.tex') !== -1, '★ a missing artifact is re-derived from the finalized content (no new writer)')
  assert(existsSync(join(h.paperDir('p'), 'paper.tex')), 'the missing paper.tex is back on disk')
  assert(paperWriterReplies(h).length === 1, 'still no second writer')
  // force → 重新撰写
  const beforeForce = meta.finalizedAt
  const forced = JSON.parse((await h.cmd('paper force')).text)
  assert(forced.dispatched === true, '★ /vibe paper force re-dispatches')
  assert(paperWriterReplies(h).length === 2, 'force really did dispatch a second writer')
  firePaper(h)
  const meta2 = await h.find(() => { const x = readMeta(h, 'p'); return x.finalizedAt !== beforeForce ? x : undefined }, 40)
  assert(!!meta2, '★ the forced run replaced the finalized paper (finalizedAt changed)')
  h.restore(); await wait(250); rmSync(h.WS, { recursive: true, force: true })   // deferred deletion: let the plugin's pending async work finish first (harness flake fix)
}

console.log('\n-- PAPER §6.2b: finalPaper=false → the AUTO trigger does not fire (manual still does) --')
{
  const h = harness({ latex: null }); await load(h)
  await h.call('vibe_math_new_project', { name: 'p' })
  await h.call('vibe_math_set_params', { tickIntervalMs: 200, finalPaper: false })
  await h.call('vibe_math_start', {})   // 空项目 ⇒ 立刻严格终止（收口）
  await wait(1200)
  assert(paperWriterReplies(h).length === 0, '★★ finalPaper=false → closure does NOT dispatch a paper writer')
  const st = await h.call('vibe_math_status', {})
  assert(!!st.paper && st.paper.autoFinalPaper === false, 'status reports the automatic paper trigger as disabled')
  const man = JSON.parse((await h.cmd('paper')).text)
  assert(man.dispatched === true && man.autoDisabled === true, 'the manual command still works and says the automatic trigger is off')
  h.restore(); await wait(250); rmSync(h.WS, { recursive: true, force: true })   // deferred deletion: let the plugin's pending async work finish first (harness flake fix)
}

console.log('\n-- PAPER §6.4: compile branches (success / repaired / persistent failure / no LaTeX) --')
{
  // (a) 成功
  const okH = harness({ latex: { engines: ['xelatex'] } }); await load(okH)
  await okH.call('vibe_math_new_project', { name: 'p' })
  await okH.cmd('paper')
  firePaper(okH)
  let m = await okH.find(() => (existsSync(join(okH.paperDir('p'), 'paper.meta.json')) ? readMeta(okH, 'p') : undefined), 40)
  assert(!!m && m.compile === 'ok' && m.artifacts.pdf === true, '★ (a) success → paper.pdf generated, compile=ok')
  okH.restore(); rmSync(okH.WS, { recursive: true, force: true })

  // (b) 失败一次后换引擎修复成功
  const fixH = harness({ latex: { engines: ['xelatex', 'latexmk'], failFirst: true } }); await load(fixH)
  await fixH.call('vibe_math_new_project', { name: 'p' })
  await fixH.cmd('paper')
  firePaper(fixH)
  m = await fixH.find(() => (existsSync(join(fixH.paperDir('p'), 'paper.meta.json')) ? readMeta(fixH, 'p') : undefined), 40)
  assert(!!m && m.compile === 'repaired', '★ (b) first engine fails → repair path reports repaired (got ' + (m && m.compile) + ')')
  assert(!!m && m.compileEngine === 'latexmk' && m.compileAttempts[0].ok === false && m.compileAttempts[1].ok === true, '★ (b) the attempt trail shows the engine swap (xelatex failed → latexmk ok)')
  assert(!!m && m.artifacts.pdf === true, '(b) the repaired compile produced the pdf')
  fixH.restore(); rmSync(fixH.WS, { recursive: true, force: true })

  // (c) 持续失败 → 降级：保留 tex+md + 警告 + 上报
  const badH = harness({ latex: { engines: ['xelatex', 'latexmk'], alwaysFail: true } }); await load(badH)
  await badH.call('vibe_math_new_project', { name: 'p' })
  await badH.cmd('paper')
  firePaper(badH)
  m = await badH.find(() => (existsSync(join(badH.paperDir('p'), 'paper.meta.json')) ? readMeta(badH, 'p') : undefined), 40)
  assert(!!m && m.compile === 'failed' && m.artifacts.pdf === false, '★ (c) persistent failure → compile=failed, no pdf claimed')
  assert(!!m && m.artifacts.md === true && m.artifacts.tex === true, '★ (c) tex+md are kept (degrade, do not block finalization)')
  assert(!existsSync(join(badH.paperDir('p'), 'paper.pdf')), '(c) no pdf exists (never faked)')
  const st = await badH.call('vibe_math_status', {})
  assert(st.recentActivity.some((a) => /编译失败/.test(a.detail)), '★ (c) the failure is reported on the v2-readable channel (activity log)')
  assert(readFileSync(join(badH.paperDir('p'), 'paper.log.md'), 'utf8').indexOf('所有尝试均失败') !== -1, '(c) the log states the bounded retry sequence is exhausted')
  badH.restore(); rmSync(badH.WS, { recursive: true, force: true })

  // (d) 真机无 LaTeX（本机就是这一档）→ 干净降级，不报错
  const noH = harness(); await load(noH)
  await noH.call('vibe_math_new_project', { name: 'p' })
  const before = noH.errors.length
  await noH.cmd('paper')
  firePaper(noH)
  m = await noH.find(() => (existsSync(join(noH.paperDir('p'), 'paper.meta.json')) ? readMeta(noH, 'p') : undefined), 40)
  assert(!!m && m.compile === 'not-detected', '★ (d) no LaTeX on the host → compile=not-detected (got ' + (m && m.compile) + ')')
  assert(!!m && m.artifacts.tex === true && m.artifacts.md === true && m.artifacts.pdf === false, '★ (d) only tex+md are delivered')
  assert(noH.errors.length === before, '★★ (d) the not-detected branch logs no error (clean degradation)')
  assert(readFileSync(join(noH.paperDir('p'), 'paper.log.md'), 'utf8').indexOf('未检测到任何 LaTeX 引擎') !== -1, '(d) the log records why no pdf was produced')
  noH.restore(); rmSync(noH.WS, { recursive: true, force: true })

  // (e) resolver 在、但一个引擎都解析不到（真机另一种形态）
  const emptyH = harness({ latex: { mode: 'resolver-empty' } }); await load(emptyH)
  await emptyH.call('vibe_math_new_project', { name: 'p' })
  await emptyH.cmd('paper')
  firePaper(emptyH)
  m = await emptyH.find(() => (existsSync(join(emptyH.paperDir('p'), 'paper.meta.json')) ? readMeta(emptyH, 'p') : undefined), 40)
  assert(!!m && m.compile === 'not-detected', '★ (e) an empty resolver also degrades to not-detected')
  emptyH.restore(); rmSync(emptyH.WS, { recursive: true, force: true })
}

console.log('\n-- PAPER §6.5/§6.6: path confinement, id normalisation, command surface + finalPaper=false --')
{
  const h = harness({ latex: { engines: ['xelatex'] } }); await load(h)
  // 纯函数：id 归一化不可能带出路径分隔符
  for (const raw of ['../../etc/passwd', 'a/b', '..', 'C:\\x\\y']) {
    const id = h.H.paperDirId(raw)
    assert(id.indexOf('/') === -1 && id.indexOf('\\') === -1 && id.indexOf('..') === -1, 'paperDirId(' + JSON.stringify(raw) + ') is a single safe segment (' + JSON.stringify(id) + ')')
  }
  await h.call('vibe_math_new_project', { name: 'p' })
  await h.call('vibe_math_set_params', { finalPaper: false })
  const r = JSON.parse((await h.cmd('paper')).text)
  assert(r.ok === true && r.dispatched === true, '★ /vibe paper still works with finalPaper=false (auto only)')
  assert(r.autoDisabled === true && /自动触发已关闭/.test(r.message), '★ the reply says the automatic trigger is disabled')
  firePaper(h)
  const m = await h.find(() => (existsSync(join(h.paperDir('p'), 'paper.meta.json')) ? readMeta(h, 'p') : undefined), 40)
  assert(!!m && m.dir === 'Paper/p' && m.trigger === 'manual', 'the manual run is recorded with trigger=manual under Paper/<id>/')
  const files = readdirSync(h.paperDir('p')).sort()
  assert(files.every((f) => ['paper.md', 'paper.tex', 'paper.pdf', 'paper.meta.json', 'paper.log.md', 'paper.lock.json'].indexOf(f) !== -1), '★ only the paper artifacts live in Paper/<id>/ (got ' + JSON.stringify(files) + ')')
  assert(files.indexOf('paper.md') !== -1 && files.indexOf('paper.meta.json') !== -1, 'the expected artifacts exist')
  assert(!existsSync(join(h.WS, 'VibeMath', 'Projects', 'p', 'Space', 'p')), 'no escaped paper directory was created')
  assert(!existsSync(join(h.WS, 'etc')) && !existsSync(join(h.WS, 'y')), 'no file/dir was written outside the project tree')
  // 非法命令参数 → kind:'error'
  const badLang = await h.cmd('paper lang=xx')
  const badFmt = await h.cmd('paper format=nope')
  const badOpt = await h.cmd('paper what=1')
  assert(badLang.kind === 'error' && /lang=/.test(badLang.text), '★ /vibe paper lang=xx is rejected as kind:error')
  assert(badFmt.kind === 'error' && /format=/.test(badFmt.text), '★ /vibe paper format=nope is rejected as kind:error')
  assert(badOpt.kind === 'error', '★ an unknown paper option is rejected as kind:error')
  // lang=/format= 覆盖本次参数（md 模式不产出 tex / 不编译）
  await h.call('vibe_math_set_params', { finalPaper: true })
  const beforeMd = readMeta(h, 'p').finalizedAt
  const mdRun = JSON.parse((await h.cmd('paper lang=en format=md force')).text)
  assert(mdRun.dispatched === true, 'lang=/format= overrides dispatch a new writer')
  firePaper(h)
  const m2 = await h.find(() => { const x = readMeta(h, 'p'); return x.finalizedAt !== beforeMd ? x : undefined }, 40)
  assert(!!m2 && m2.params.paperFormat === 'md' && m2.params.paperLanguage === 'en', '★ the override is recorded in meta (md/en)')
  assert(!!m2 && m2.compile === 'skipped', '★★ paperFormat=md skips compilation entirely (§E: no "missing tex" warning)')
  assert(readFileSync(join(h.paperDir('p'), 'paper.log.md'), 'utf8').indexOf('缺少') === -1, 'no misleading compile warning for md-only runs')
  h.restore(); await wait(250); rmSync(h.WS, { recursive: true, force: true })   // deferred deletion: let the plugin's pending async work finish first (harness flake fix)
}

console.log('\n-- PAPER §A2: ACTIVATION_LIMIT_REACHED → queue + retry + visible warning --')
{
  const h = harness({ refuseAttempts: 1, latex: null }); await load(h)
  await h.call('vibe_math_new_project', { name: 'p' })
  const r = JSON.parse((await h.cmd('paper')).text)
  assert(r.ok === true && r.queued === true && r.reason === 'activation-limit-reached', '★ the refused dispatch is QUEUED (not silently lost), got ' + JSON.stringify(r.reason))
  assert(r.tries === 1 && r.limit === 2, 'the refusal records the host limit from the error text')
  const st = await h.call('vibe_math_status', {})
  assert(!!st.paper && !!st.paper.queued && st.paper.queued.tries === 1, 'status exposes the queued retry')
  assert(h.errors.some((e) => /activation-limit refusal/.test(e)), '★★ the queueing is a VISIBLE warning (console)')
  const acts = (await h.call('vibe_math_status', {})).recentActivity.map((a) => a.detail).join('\n')
  assert(/激活上限/.test(acts), '★★ and it is visible on the v2-readable channel (activity log)')
  const retried = await h.find(() => (paperWriterReplies(h).length ? paperWriterReplies(h) : undefined), 70)
  assert(!!retried, '★★ the paper heartbeat retried after the refusal and dispatched the writer (independent of scheduler.running)')
  firePaper(h)
  const m = await h.find(() => (existsSync(join(h.paperDir('p'), 'paper.meta.json')) ? readMeta(h, 'p') : undefined), 40)
  assert(!!m, 'the retried writer still finalized the paper')
  h.restore(); await wait(250); rmSync(h.WS, { recursive: true, force: true })   // deferred deletion: let the plugin's pending async work finish first (harness flake fix)
}

console.log('\n-- PAPER §1: a hung writer can never wedge the paper (force refuses early, reaps after the window) --')
{
  const h = harness({ latex: null }); await load(h)
  await h.call('vibe_math_new_project', { name: 'p' })
  await h.call('vibe_math_set_params', { finalPaper: false })   // 本节只考 force 的回收判定：关掉自动重派以保证确定性
  // 纯函数判定（两条分支 + child 已消失）
  assert(h.H.paperWriterVerdict({ inFlight: false }) === 'none', 'no in-flight writer → none')
  assert(h.H.paperWriterVerdict({ inFlight: true, force: false, ageMs: 1000, staleMs: 600000, childInRegistry: true }) === 'none', 'fresh writer + no force → none (a normal skip)')
  assert(h.H.paperWriterVerdict({ inFlight: true, force: true, ageMs: 1000, staleMs: 600000, childInRegistry: true }) === 'refuse', '★ force before the stale window → refuse (actionable error, not a wedge)')
  assert(h.H.paperWriterVerdict({ inFlight: true, force: false, ageMs: 700000, staleMs: 600000, childInRegistry: true }) === 'reap', '★ past the stale window → reap (the heartbeat degrades automatically)')
  assert(h.H.paperWriterVerdict({ inFlight: true, force: true, ageMs: 700000, staleMs: 600000, childInRegistry: true }) === 'reap', '★ force past the stale window → reap')
  assert(h.H.paperWriterVerdict({ inFlight: true, force: false, ageMs: 10, staleMs: 600000, childInRegistry: false }) === 'reap', '★ child gone from the registry → reap immediately, whatever the age')
  // 驱动：派遣一个永不返回的撰写者
  const r1 = JSON.parse((await h.cmd('paper')).text)
  assert(r1.dispatched === true, 'a writer is dispatched')
  const w1 = h.spawns.filter((s) => s.label.startsWith('paper-writer:'))[0]
  const refused = await h.cmd('paper force')
  const rb = JSON.parse(refused.text)
  assert(refused.kind === 'error' && rb.reason === 'writer-in-flight', '★★ force before the window returns kind:error with reason=writer-in-flight (old code silently skipped: the wedge)')
  assert(/在途/.test(rb.message) && /10 分钟/.test(rb.message) && /回收/.test(rb.message), '★★ and the message is ACTIONABLE (names the in-flight child, the window and the automatic reap)')
  assert(h.spawns.filter((s) => s.label.startsWith('paper-writer:')).length === 1, 'no second writer was dispatched by the refused force')
  const st = await h.call('vibe_math_status', {})
  assert(st.paper.inFlight === w1.childId && st.paper.staleMs === 600000 && st.paper.inFlightAgeMs !== null, 'status exposes the in-flight writer, its age and the stale window')
  // 时间旅行到窗口之后：force 必须回收并重派（"死掉的撰写者不会永久卡住论文"）
  const realNow = Date.now
  let after
  try {
    Date.now = () => realNow.call(Date) + 11 * 60 * 1000
    await wait(50)
    after = JSON.parse((await h.cmd('paper force')).text)
  } finally { Date.now = realNow }
  assert(after.dispatched === true, '★ force past the stale window reaps the hung writer and dispatches a fresh one')
  assert(h.spawns.filter((s) => s.label.startsWith('paper-writer:')).length === 2, 'a fresh writer really was dispatched')
  const log = readFileSync(join(h.paperDir('p'), 'paper.log.md'), 'utf8')
  assert(/\[reap\]/.test(log), '★★ the reap is logged honestly (with its reason)')
  assert(/\[force-refused\]/.test(log), 'the earlier force refusal is logged too')
  firePaper(h)
  const meta = await h.find(() => (existsSync(join(h.paperDir('p'), 'paper.meta.json')) ? readMeta(h, 'p') : undefined), 40)
  assert(!!meta, '★★ after reap+force the paper is produced — a dead writer can no longer wedge it')
  h.restore(); await wait(250); rmSync(h.WS, { recursive: true, force: true })   // deferred deletion: let the plugin's pending async work finish first (harness flake fix)
}

console.log('\n-- PAPER §1b: the heartbeat reaps a stalled writer and re-dispatches automatically --')
{
  const h = harness({ latex: null }); await load(h)
  await h.call('vibe_math_new_project', { name: 'p' })
  await h.call('vibe_math_set_params', { finalPaper: true })
  const r = JSON.parse((await h.cmd('paper')).text)
  assert(r.dispatched === true, 'a writer is dispatched')
  const realNow = Date.now
  Date.now = () => realNow.call(Date) + 11 * 60 * 1000
  const second = await h.find(() => (h.spawns.filter((s) => s.label.startsWith('paper-writer:')).length >= 2 ? true : undefined), 60)
  Date.now = realNow
  assert(!!second, '★★ the apply-level heartbeat reaped the stalled writer and auto-dispatched a replacement (independent of scheduler.running)')
  const log = readFileSync(join(h.paperDir('p'), 'paper.log.md'), 'utf8')
  assert(/\[reap\]/.test(log) && /\[retry-after-reap\]/.test(log), 'the reap and the bounded auto-retry are both logged')
  const acts = (await h.call('vibe_math_status', {})).recentActivity.map((a) => a.detail).join('\n')
  assert(/回收卡死的论文撰写子代理/.test(acts), 'and the reap is visible on the activity log (not silent)')
  firePaper(h)
  const meta = await h.find(() => (existsSync(join(h.paperDir('p'), 'paper.meta.json')) ? readMeta(h, 'p') : undefined), 40)
  assert(!!meta, 'the auto-recovered writer finalized the paper (no permanent wedge even without /vibe paper force)')
  h.restore(); await wait(250); rmSync(h.WS, { recursive: true, force: true })   // deferred deletion: let the plugin's pending async work finish first (harness flake fix)
}

console.log('\n-- PAPER §2: a pre-existing paper.pdf is never deleted or overwritten --')
{
  const PDF = '%PDF-1.4 pre-existing bytes\n'
  // (a) 无 LaTeX ⇒ not-detected：既有 pdf 必须逐字节不变
  const a = harness({ latex: null }); await load(a)
  await a.call('vibe_math_new_project', { name: 'p' })
  await a.cmd('paper')
  mkdirSync(a.paperDir('p'), { recursive: true })
  writeFileSync(join(a.paperDir('p'), 'paper.pdf'), PDF, 'utf8')
  firePaper(a)
  let m = await a.find(() => (existsSync(join(a.paperDir('p'), 'paper.meta.json')) ? readMeta(a, 'p') : undefined), 40)
  assert(!!m && m.compile === 'not-detected' && m.pdfPreserved === true, '★ (a) no engine → not-detected and meta records pdfPreserved')
  assert(readFileSync(join(a.paperDir('p'), 'paper.pdf'), 'utf8') === PDF, '★★ (a) the pre-existing paper.pdf is byte-identical after a not-detected run')
  a.restore(); rmSync(a.WS, { recursive: true, force: true })
  // (b) 编译器持续失败 ⇒ failed：既有 pdf 仍必须逐字节不变
  const b = harness({ latex: { engines: ['xelatex', 'latexmk'], alwaysFail: true } }); await load(b)
  await b.call('vibe_math_new_project', { name: 'p' })
  await b.cmd('paper')
  mkdirSync(b.paperDir('p'), { recursive: true })
  writeFileSync(join(b.paperDir('p'), 'paper.pdf'), PDF, 'utf8')
  firePaper(b)
  m = await b.find(() => (existsSync(join(b.paperDir('p'), 'paper.meta.json')) ? readMeta(b, 'p') : undefined), 40)
  assert(!!m && m.compile === 'failed' && m.pdfPreserved === true, '★ (b) persistent failure → failed + pdfPreserved')
  assert(readFileSync(join(b.paperDir('p'), 'paper.pdf'), 'utf8') === PDF, '★★ (b) the pre-existing paper.pdf survives a failed compile byte-identically (never deleted, never overwritten)')
  b.restore(); rmSync(b.WS, { recursive: true, force: true })
  // (c) paperFormat=md ⇒ 连引擎探测都不做，pdf 更不可能被碰
  const c = harness({ latex: { engines: ['xelatex'] } }); await load(c)
  await c.call('vibe_math_new_project', { name: 'p' })
  const runsAtStart = c.latexRuns.length
  await c.cmd('paper')
  firePaper(c)
  const meta1 = await c.find(() => (existsSync(join(c.paperDir('p'), 'paper.meta.json')) ? readMeta(c, 'p') : undefined), 40)
  assert(!!meta1 && meta1.artifacts.tex === true, '(c) the first (default both) run produced tex and probed the engines')
  const runsAfterTex = c.latexRuns.length
  assert(runsAfterTex > runsAtStart, '(c) the both-format run really probed/ran an engine')
  // 这台编译器的产物已经落到 paper.pdf；现在放一个**哨兵** pdf，验证 md-only 运行绝不碰它
  writeFileSync(join(c.paperDir('p'), 'paper.pdf'), PDF, 'utf8')
  const beforeAt = meta1.finalizedAt
  const mdRun = JSON.parse((await c.cmd('paper format=md force')).text)
  assert(mdRun.dispatched === true, '(c) a forced md-only rewrite is dispatched')
  firePaper(c)
  const m2 = await c.find(() => { const x = readMeta(c, 'p'); return x.finalizedAt !== beforeAt ? x : undefined }, 40)
  assert(!!m2 && m2.params.paperFormat === 'md' && m2.compile === 'skipped', '★ (c) paperFormat=md skips compilation entirely')
  assert(c.latexRuns.length === runsAfterTex, '★★ (c) md-only never even probes the LaTeX engines')
  assert(readFileSync(join(c.paperDir('p'), 'paper.pdf'), 'utf8') === PDF, '★★ (c) the pre-existing paper.pdf is untouched by an md-only run')
  c.restore(); rmSync(c.WS, { recursive: true, force: true })
}

console.log('\nFIXES PROBE: ' + passed + ' passed, ' + failed + ' failed')
process.exit(failed === 0 ? 0 : 1)

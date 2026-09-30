// Probes for the remaining v2 fixes (H3, H4/M12/M13, M10, M11, M15, H5).
// Each scenario drives the REAL plugin through the public tool API + the host's service mocks.
//
// Run: node tests/v2-fix-probes.test.mjs
import { mkdtempSync, rmSync, existsSync, readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname, resolve as pathResolve } from 'node:path'

let passed = 0, failed = 0
const assert = (c, m) => { if (c) { passed++; console.log('  ok - ' + m) } else { failed++; process.stderr.write('  FAIL - ' + m + '\n') } }
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const text = (o) => [{ type: 'text', text: '```json\n' + JSON.stringify(o) + '\n```' }]

function harness(opts) {
  const o = opts || {}
  const WS = mkdtempSync(join(tmpdir(), 'v2-fix-'))
  const listeners = {}, toolRegs = [], spawns = [], errors = []
  const realError = console.error
  console.error = (...a) => { errors.push(a.map(String).join(' ')); if (o.echoErrors) realError(...a) }
  const ctx = {
    get(n) {
      if (n === 'subprocess') {
        if (o.noSubprocess) return undefined
        return { spawn({ argv }) { const s = argv[argv.length - 1] || ''; if (/New-Item/.test(s)) { const m = s.match(/-Path\s+'((?:[^']|'')*)'/); if (m) m[1].split(',').forEach((p) => { if (p) mkdirSync(p.replace(/''/g, "'"), { recursive: true }) }) } return { done: Promise.resolve({ exitCode: 0 }) } } }
      }
      return undefined
    },
    on(e, f) { (listeners[e] = listeners[e] || []).push(f) },
    effect(f) { const d = f(); return () => { if (typeof d === 'function') d() } },
    logger: { info() {}, warn() {}, error() {} },
    tools: { register(s) { toolRegs.push(s) } },
    commands: { register() {} },
    subagents: {
      list() { return ['spawn'] },
      async startContinuable({ label, request }) { const childId = 'c' + (spawns.length + 1); spawns.push({ label, request, childId }); return { childId } },
      async sendMessage() {},
      interrupt() {},
    },
    agents: { roots() { return [] }, get() { return undefined } },
    fs: {
      async resolve(rel, oc) { return pathResolve((oc && oc.cwd) || WS, ...String(rel).split('/')) },
      async stat(t) { return existsSync(t) ? { type: 'file' } : undefined },
      async readText(t) { return readFileSync(t, 'utf8') },
      async writeText(t, c) { mkdirSync(dirname(t), { recursive: true }); writeFileSync(t, c, 'utf8') },
      async listDir(t) { if (!existsSync(t)) return []; return readdirSync(t, { withFileTypes: true }).map((e) => ({ name: e.name, type: e.isDirectory() ? 'directory' : 'file' })) },
    },
  }
  const ROOT = { id: 'S', options: { provider: 'mock', model: 'mock' }, session: { id: 'S', header: { cwd: WS } } }
  return { WS, listeners, toolRegs, spawns, errors, ctx, ROOT, restore() { console.error = realError }, project: join(WS, 'VibeMath', 'Projects', 'p') }
}
async function load(h) {
  const mod = await import(new URL('../vibe-math-v2/vibe-math-v2.js', import.meta.url).href + '?t=' + Date.now() + Math.random())
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
  h.restore(); rmSync(h.WS, { recursive: true, force: true })
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
  h.restore(); rmSync(h.WS, { recursive: true, force: true })
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
  h.restore(); rmSync(h.WS, { recursive: true, force: true })
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
  h.restore(); rmSync(h.WS, { recursive: true, force: true })
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
  h.restore(); rmSync(h.WS, { recursive: true, force: true })
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
  h.restore(); rmSync(h.WS, { recursive: true, force: true })
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
  h.restore(); rmSync(h.WS, { recursive: true, force: true })
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
  h.restore(); rmSync(h.WS, { recursive: true, force: true })
}

console.log('\nFIXES PROBE: ' + passed + ' passed, ' + failed + ' failed')
process.exit(failed === 0 ? 0 : 1)

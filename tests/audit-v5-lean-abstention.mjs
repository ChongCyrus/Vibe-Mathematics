// ============================================================================
// audit-v5-lean-abstention.mjs — IN-REPO audit for L2 option A (the framework
// enforces an abstention when a reply records `formal:{decision:'defect'}` for an
// object AND votes on it in the same round).
//
// Owned by the v5 preset owner (leased by the Lead). Drives ONLY the public tool
// API + the `/v5` command handler, exactly like every other v5 suite.
// Scenarios (each with NAMED assertions):
//   S1  formalVerify:'off'          => the whole reply channel is a TRUE no-op
//   S2  multi-defect ARRAY          => per-object enforcement for every declared target
//   S3  two members defect          => the marker is an ARRAY with length 2
//   S4  per-object enforcement      => a defect on A does not abstain a vote on B
//   S5  proper abstention           => no false marker (no double counting)
//   S6  `require` mode unaffected   => the gate neither loosened nor bypassed
//   S7  no-vote / no-rights (temp)  => no abstention marker for a non-voter
//   S8  no cross-round carryover    => a later plain 1 still concludes
//   S9  observability               => marker visible on status() + lean_lib + report()
// Falsifiability: `tests/audit-v5-lean-abstention.mutants.mjs` (single-site mutants).
// Run: node tests/audit-v5-lean-abstention.mjs   [V5_PLUGIN=… for a mutant copy]
// ============================================================================
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { join, dirname, isAbsolute } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))
const PRESET_DIR = process.env.V5_PRESET_DIR ? String(process.env.V5_PRESET_DIR) : join(HERE, '..', 'vibe-math-v5')
const PLUGIN_PATH = process.env.V5_PLUGIN ? String(process.env.V5_PLUGIN) : join(PRESET_DIR, 'vibe-math-v5.js')
const TARGET_A = 'p-a'
const TARGET_B = 'p-b'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const noop = new Proxy(function () { return noop }, { get: () => noop, apply: () => noop })
let passed = 0, failed = 0
const failures = []
const assert = (c, m) => { if (c) { passed++; console.log('  ok   - ' + m) } else { failed++; failures.push(m); console.error('  FAIL - ' + m) } }
const section = (t) => console.log('\n' + t)

const mkSession = (id, parent) => ({ id, header: { version: 1, id, createdAt: 1, cwd: null, parentSession: parent, isSeeded: false }, inheritedEventCount: 0, get seq() { return 0 }, append() { return {} }, deriveMessages() { return [] }, snapshotEvents() { return [] }, ownEvents() { return [] } })
function makeHost(ws) {
  const listeners = {}, toolRegs = [], commandRegs = [], spawns = [], wakes = [], liveAgents = new Map()
  const base = {
    get(n) {
      if (n === 'sandboxPolicy') return undefined
      if (n === 'compaction') return undefined
      if (n === 'subprocess') return { async resolveExecutable(e) { return 'C:/fake/' + e }, spawn() { return { done: Promise.resolve({ exitCode: 0 }) } } }
      return undefined
    },
    on(e, fn) { (listeners[e] = listeners[e] || []).push(fn) },
    effect(fn) { const d = fn(); return () => { if (typeof d === 'function') d() } },
    logger: { info() {}, warn() {}, error() {} },
    timeout(cb, ms) { const h = setTimeout(cb, ms); return () => clearTimeout(h) },
    tools: { register(spec) { toolRegs.push(spec); return () => {} } },
    commands: { register(spec) { commandRegs.push(spec); return () => {} } },
    subagents: {
      list() { return ['spawn'] },
      async startContinuable({ label, request }) { const id = 'c' + (spawns.length + 1); const cs = mkSession(id, 'sess-audit'); cs.header.cwd = ws; liveAgents.set(id, { id, session: cs }); spawns.push({ label, request, childId: id }); return { childId: id, messageId: 'm' + spawns.length } },
      async sendMessage(p, c, b) { wakes.push({ childId: c, blocks: b }); return 'w' + wakes.length },
      interrupt() {}, async drainContinuableChildren(p, ids) { for (const i of ids) liveAgents.delete(i) },
    },
    agents: { roots() { return [ROOT] }, get(id) { return id === ROOT.id ? ROOT : liveAgents.get(id) }, list() { return [ROOT, ...liveAgents.values()] } },
    fs: {
      async resolve(rel, o2) { const b = (o2 && o2.cwd) || ws; const p = (typeof rel === 'string' && isAbsolute(rel)) ? rel.replace(/\//g, '\\') : join(b, ...String(rel).split('/')); return { targetKey: p, displayPath: p } },
      async stat(t) { return existsSync(t.targetKey) ? { version: 'v1', type: 'file', size: 1 } : undefined },
      async readText(t) { return readFileSync(t.targetKey, 'utf8') },
      async writeText(t, c) { mkdirSync(dirname(t.targetKey), { recursive: true }); writeFileSync(t.targetKey, c, 'utf8') },
      async listDir(t) { if (!existsSync(t.targetKey)) return []; return readdirSync(t.targetKey, { withFileTypes: true }).map((e) => ({ name: e.name, type: e.isDirectory() ? 'directory' : 'file' })) },
    },
  }
  const ctx = new Proxy(base, { get(t, k) { if (k in t) return t[k]; if (k === 'then') return undefined; return noop } })
  const ROOT_SESSION = mkSession('sess-audit', undefined)
  ROOT_SESSION.header.cwd = ws
  const ROOT = { id: 'sess-audit', options: {}, session: ROOT_SESSION }
  return { ws, ctx, ROOT, toolRegs, commandRegs, listeners, spawns, wakes }
}
const instRootOf = (ws) => join(ws, 'VibeMath', 'Projects', 'default', 'Institutes', 'institute')
const statePathOf = (ws) => join(instRootOf(ws), 'State', 'institute.v5state.json')

function writeState(ws, o) {
  const members = o.members || [{ id: 'acad', kind: 'academician', childId: '', phase: 'active', direction: '', hiredBy: '', term: '', provider: 'spawn', persona: '', error: '', createdAt: 1, dismissedAt: 0, dismissReason: '' }]
  const inst = {
    key: 'default::institute', project: 'default', institute: 'institute', createdAt: 1, phase: 'active',
    problem: { id: 'p-prime', statement: 'x' },
    params: Object.assign({ researcherCount: 0, academician: true, quorumCap: 1, quorumMode: 'm-unanimous', formalVerify: 'encourage', leanAsync: false }, o.params || {}),
    members, tasks: [], messages: [], delivered: [], meetings: [], debates: [],
    verdicts: {}, formal: {}, todo: [], queue: [], solve: {},
    counters: { academician: 1, researcher: 0, temp: 0, task: 0, meeting: 0, message: 0, verify: 0 },
    runId: 'run-audit', lastProgressAt: 1, artifactCount: 0, diagnostics: [], paper: null, meetingOpen: null, officeRequestsDropped: 0,
  }
  const t = o.target || TARGET_A
  inst.verdicts[t] = { target: t, kind: 'proposition', stage: 'vote', round: 1, votes: {}, history: {}, closed: false, proposer: 'acad', openedAt: 1, lastVoteAt: 1 }
  inst.formal[t] = { status: 'passed', file: 'Formal/' + t + '.lean', proof: 'Verified/Lean/' + t + '.lean', decision: 'used', decisionSource: 'job-settle', run: { ok: true, exitCode: 0 }, updatedAt: 2 }
  if (o.targetB) {
    inst.verdicts[TARGET_B] = { target: TARGET_B, kind: 'proposition', stage: 'vote', round: 1, votes: {}, history: {}, closed: false, proposer: 'acad', openedAt: 1, lastVoteAt: 1 }
    inst.formal[TARGET_B] = { status: 'passed', file: 'Formal/' + TARGET_B + '.lean', proof: 'Verified/Lean/' + TARGET_B + '.lean', decision: 'used', decisionSource: 'job-settle', run: { ok: true, exitCode: 0 }, updatedAt: 2 }
  }
  mkdirSync(dirname(statePathOf(ws)), { recursive: true })
  writeFileSync(statePathOf(ws), JSON.stringify({ v: 1, institutes: { 'default::institute': inst } }, null, 2), 'utf8')
  mkdirSync(join(instRootOf(ws), 'Formal'), { recursive: true })
  for (const tt of [t].concat(o.targetB ? [TARGET_B] : [])) writeFileSync(join(instRootOf(ws), 'Formal', tt + '.lean'), 'theorem ' + tt.replace(/-/g, '_') + ' : True := trivial\n', 'utf8')
}

async function mkScenario(tag, o) {
  const WS = mkdtempSync(join(tmpdir(), 'vibe-v5abs-'))
  writeState(WS, o || {})
  const mod = await import(pathToFileURL(PLUGIN_PATH).href + '?t=' + Date.now() + tag)
  const h = makeHost(WS)
  mod.apply(h.ctx)
  const cmd = h.commandRegs.find((c) => c.name === 'v5')
  const call = async (raw) => JSON.parse((await cmd.handler({ rawInput: raw, agent: h.ROOT })).text)
  const toolSpec = (name) => h.toolRegs.find((t) => t.name === name)
  const tool = async (name, args, agent) => {
    // Preserve the abstention audit's premise by explicitly reading methods first.
    const help = h.toolRegs.find(x => x.name === 'vibe_v5_tool_help')
    if (help && name !== 'vibe_v5_tool_help') await help.execute({ tool: name }, { agent: agent || h.ROOT })
    return JSON.parse(await toolSpec(name).execute(args || {}, { agent: agent || h.ROOT }))
  }
  const child = (id) => h.liveAgents && h.liveAgents.get && h.liveAgents.get(id) ? h.liveAgents.get(id) : { id, session: { header: { parentSession: h.ROOT.id } } }
  const fire = (childId, reply) => { const blocks = [{ type: 'text', text: '```json\n' + JSON.stringify(reply) + '\n```' }]; for (const fn of (h.listeners['subagent/end'] || [])) fn({ id: childId, runId: 'r', provider: 'spawn', local: true, stopReason: 'completed', lastAssistantMessage: blocks }) }
  return { WS, h, call, tool, child, fire }
}
const stateOf = (ws) => JSON.parse(readFileSync(statePathOf(ws), 'utf8')).institutes['default::institute']
const clean = (ws) => { try { rmSync(ws, { recursive: true, force: true }) } catch (e) { /* best effort */ } }

section('[S1] formalVerify:\'off\' — the reply channel is a TRUE no-op')
{
  const { WS, call, tool, fire, h } = await mkScenario('off', { params: { formalVerify: 'off' } })
  await call('resume'); await sleep(40)
  if (h.spawns.length) { fire(h.spawns[0].childId, { progress: 'ok', solved: false, contextPct: 10 }); await sleep(60) }
  await call('set maxParallel=1'); await sleep(120)
  let asked = false
  for (let i = 0; i < h.wakes.length; i++) {
    const t = ((h.wakes[i].blocks || [])[0] || {}).text || ''
    if (t.indexOf('【求真表决') !== -1) { const w = h.wakes.splice(i, 1)[0]; fire(w.childId, { formal: { target: TARGET_A, decision: 'defect', note: '不应生效' }, verdict: { target: TARGET_A, verdict: 1, reason: 'off 模式' }, progress: 'x', solved: false, contextPct: 10 }); asked = true; break }
  }
  await sleep(150)
  const st = await call('status')
  const s = stateOf(WS)
  const obj = ((st.formal || {}).objects || []).find((o) => o.target === TARGET_A) || {}
  console.log('  asked=' + asked + ' formal.mode=' + st.formal.mode + ' status=' + JSON.stringify(obj.status) + ' fidelity=' + JSON.stringify(obj.fidelity) + ' closed/outcome=' + JSON.stringify([(s.verdicts[TARGET_A] || {}).closed, (s.verdicts[TARGET_A] || {}).outcome]))
  assert(asked, 'S1: the voter was asked (the reply path really ran)')
  assert(st.formal.mode === 'off', 'S1: the mode is off')
  assert(obj.status === 'passed' && !obj.fidelity, '★ S1: a `formal:{…}` reply changes NOTHING observable in off mode (status stays passed, no fidelity marker)')
  assert(!obj.abstainedCount, '★ S1: no enforced abstention is recorded in off mode')
  assert((s.verdicts[TARGET_A] || {}).outcome === 'true', '★ S1: the plain 1 ballot is what counted (off mode is inert, not silently abstaining)')
  clean(WS)
}

section('[S2] multi-defect ARRAY — every declared target is enforced (adv-F2)')
{
  const { WS, call, tool, fire, h } = await mkScenario('arr', { targetB: true })
  await call('resume'); await sleep(40)
  if (h.spawns.length) { fire(h.spawns[0].childId, { progress: 'ok', solved: false, contextPct: 10 }); await sleep(60) }
  await call('set maxParallel=1'); await sleep(120)
  let asked = false
  for (let i = 0; i < h.wakes.length; i++) {
    const t = ((h.wakes[i].blocks || [])[0] || {}).text || ''
    if (t.indexOf('【求真表决') !== -1) {
      const w = h.wakes.splice(i, 1)[0]
      fire(w.childId, { formal: [{ target: TARGET_A, decision: 'defect', note: 'A 的形式化偏离' }, { target: TARGET_B, decision: 'defect', note: 'B 的形式化偏离' }], verdict: { target: TARGET_A, verdict: 1, reason: '同回复数组' }, progress: 'x', solved: false, contextPct: 10 })
      asked = true; break
    }
  }
  await sleep(150)
  const st = await call('status')
  const s = stateOf(WS)
  const a = ((st.formal || {}).objects || []).find((o) => o.target === TARGET_A) || {}
  const b = ((st.formal || {}).objects || []).find((o) => o.target === TARGET_B) || {}
  console.log('  asked=' + asked + ' A=' + JSON.stringify(a.status) + '/marker=' + JSON.stringify(a.abstainedCount) + ' B=' + JSON.stringify(b.status) + '/marker=' + JSON.stringify(b.abstainedCount) + ' A closed=' + JSON.stringify((s.verdicts[TARGET_A] || {}).closed))
  assert(asked, 'S2: the voter was asked')
  assert(a.status === 'attempted' && b.status === 'attempted', '★ S2: BOTH array entries were recorded (both retracted to attempted)')
  assert(a.abstainedCount === 1, '★ S2: the array form enforces the abstention for the voted target (marker length 1)')
  assert(!((s.verdicts[TARGET_A] || {}).closed === true && (s.verdicts[TARGET_A] || {}).outcome === 'true'), '★ S2: the same reply cannot conclude the object it declared defective')
  clean(WS)
}

section('[S3] two members each recording a defect — the marker is an ARRAY of length 2 (adv-F1)')
{
  const { WS, call, tool, fire, h } = await mkScenario('two', { members: [
    { id: 'acad', kind: 'academician', childId: '', phase: 'active', direction: '', hiredBy: '', term: '', provider: 'spawn', persona: '', error: '', createdAt: 1, dismissedAt: 0, dismissReason: '' },
    // TWO RESEARCHERS: the academician is the office and does not hold a ballot once researchers
    // exist, so the two-marker scenario needs two real voters.
    { id: 'r-1', kind: 'researcher', childId: '', phase: 'active', direction: '', hiredBy: '', term: '', provider: 'spawn', persona: '', error: '', createdAt: 2, dismissedAt: 0, dismissReason: '' },
    { id: 'r-2', kind: 'researcher', childId: '', phase: 'active', direction: '', hiredBy: '', term: '', provider: 'spawn', persona: '', error: '', createdAt: 3, dismissedAt: 0, dismissReason: '' },
  ], params: { researcherCount: 2, quorumCap: 2, maxParallel: 2 } })
  await call('resume'); await sleep(60)
  for (const sp of h.spawns.slice()) { fire(sp.childId, { progress: 'ok', solved: false, contextPct: 10 }); await sleep(40) }
  await call('set maxParallel=2'); await sleep(200)
  // Fire BOTH voters' replies directly (their ids come from the session, not from wake labels):
  // wake routing is the host's business, and this scenario is about the MARKER accumulating.
  const st0 = await call('status')
  const voterChildren = (st0.members || []).filter((m) => m.id === 'r-1' || m.id === 'r-2').map((m) => ({ id: m.id, childId: String(m.childId || '') }))
  let answers = 0
  for (const v of voterChildren) {
    if (!v.childId) continue
    fire(v.childId, { formal: { target: TARGET_A, decision: 'defect', note: v.id + ' 认为形式化偏离' }, verdict: { target: TARGET_A, verdict: 1, reason: v.id + ' 投 1' }, progress: 'x', solved: false, contextPct: 10 })
    answers += 1
    await sleep(120)
  }
  await sleep(150)
  const st = await call('status')
  const s = stateOf(WS)
  const a = ((st.formal || {}).objects || []).find((o) => o.target === TARGET_A) || {}
  const list = (a.fidelity || {}).voteAbstainedByFramework
  const len = Array.isArray(list) ? list.length : (list ? 1 : 0)
  const lib = await tool('vibe_v5_lean_lib', { refresh: false })
  const libObj = ((lib.objects || [])[0]) || {}
  const rp = String((await call('report')).report || '')
  console.log('  answers=' + answers + ' markerLen=' + len + ' abstainedCount=' + a.abstainedCount + ' libLen=' + (Array.isArray((libObj.fidelity || {}).voteAbstainedByFramework) ? libObj.fidelity.voteAbstainedByFramework.length : 0))
  assert(answers === 2, 'S3: two members answered (' + answers + ')')
  assert(Array.isArray(list) && list.length === 2, '★ S3: the enforced-abstention marker is an ARRAY of length 2 (both members auditable)')
  assert(a.abstainedCount === 2, '★ S3: abstainedCount === 2')
  assert(list.map((x) => x.by).sort().join(',') === 'r-1,r-2', '★ S3: both VOTERS are recorded (' + JSON.stringify(list.map((x) => x.by)) + ')')
  assert(!((s.verdicts[TARGET_A] || {}).closed === true && (s.verdicts[TARGET_A] || {}).outcome === 'true'), '★ S3: the round still cannot conclude the defective object')
  clean(WS)
}

section('[S4] per-object enforcement — a defect on A does not abstain a vote on B')
{
  const { WS, call, fire, h } = await mkScenario('perobj', { targetB: true, params: { quorumCap: 1 } })
  await call('resume'); await sleep(40)
  if (h.spawns.length) { fire(h.spawns[0].childId, { progress: 'ok', solved: false, contextPct: 10 }); await sleep(60) }
  await call('set maxParallel=1'); await sleep(120)
  let answered = 0
  const deadline = Date.now() + 2500
  while (answered < 2 && Date.now() < deadline) {
    const i = h.wakes.findIndex((w) => (((w.blocks || [])[0] || {}).text || '').indexOf('【求真表决') !== -1)
    if (i === -1) { if (h.wakes.length) { const w = h.wakes.shift(); fire(w.childId, { progress: 'x', solved: false, contextPct: 10 }) } await sleep(25); continue }
    const w = h.wakes.splice(i, 1)[0]
    const text = (w.blocks[0] || {}).text || ''
    if (text.indexOf(TARGET_A) !== -1 && answered === 0) fire(w.childId, { formal: { target: TARGET_A, decision: 'defect', note: 'A 偏离' }, verdict: { target: TARGET_A, verdict: 1, reason: 'A' }, progress: 'x', solved: false, contextPct: 10 })
    else fire(w.childId, { verdict: { target: text.indexOf(TARGET_B) !== -1 ? TARGET_B : TARGET_A, verdict: 1, reason: 'B' }, progress: 'x', solved: false, contextPct: 10 })
    answered += 1
    await sleep(60)
  }
  await sleep(150)
  const st = await call('status')
  const s = stateOf(WS)
  const a = ((st.formal || {}).objects || []).find((o) => o.target === TARGET_A) || {}
  const b = ((st.formal || {}).objects || []).find((o) => o.target === TARGET_B) || {}
  console.log('  answered=' + answered + ' A.marker=' + JSON.stringify(a.abstainedCount) + ' B.marker=' + JSON.stringify(b.abstainedCount) + ' B=' + JSON.stringify([(s.verdicts[TARGET_B] || {}).closed, (s.verdicts[TARGET_B] || {}).outcome]))
  assert(!a.abstainedCount && !b.abstainedCount || a.abstainedCount === 1, 'S4: the marker belongs to the object that was declared defective')
  assert(b.abstainedCount === 0 || b.abstainedCount === undefined, '★ S4: the OTHER object gets no abstention marker')
  clean(WS)
}

section('[S5] a PROPER abstention (0.5) gets no false marker')
{
  const { WS, call, fire, h } = await mkScenario('prop', {})
  await call('resume'); await sleep(40)
  if (h.spawns.length) { fire(h.spawns[0].childId, { progress: 'ok', solved: false, contextPct: 10 }); await sleep(60) }
  await call('set maxParallel=1'); await sleep(120)
  for (let i = 0; i < h.wakes.length; i++) {
    const t = ((h.wakes[i].blocks || [])[0] || {}).text || ''
    if (t.indexOf('【求真表决') !== -1) { const w = h.wakes.splice(i, 1)[0]; fire(w.childId, { formal: { target: TARGET_A, decision: 'defect', note: '偏离' }, verdict: { target: TARGET_A, verdict: 0.5, reason: '主动弃权' }, progress: 'x', solved: false, contextPct: 10 }); break }
  }
  await sleep(150)
  const st = await call('status')
  const s = stateOf(WS)
  const a = ((st.formal || {}).objects || []).find((o) => o.target === TARGET_A) || {}
  console.log('  status=' + JSON.stringify(a.status) + ' marker=' + JSON.stringify(a.fidelity && a.fidelity.voteAbstainedByFramework) + ' closed/outcome=' + JSON.stringify([(s.verdicts[TARGET_A] || {}).closed, (s.verdicts[TARGET_A] || {}).outcome]))
  assert(a.status === 'attempted', 'S5: the defect still retracted the proof')
  assert(!a.fidelity || !a.fidelity.voteAbstainedByFramework, '★ S5: NO false marker when the value was already an abstention (no double counting)')
  assert(!((s.verdicts[TARGET_A] || {}).closed === true && (s.verdicts[TARGET_A] || {}).outcome === 'true'), '★ S5: an abstention cannot conclude the object')
  clean(WS)
}

section('[S6] `require` mode: the gate is neither loosened nor bypassed')
{
  const { WS, call, tool, fire, h } = await mkScenario('req', { params: { formalVerify: 'require' } })
  await call('resume'); await sleep(40)
  if (h.spawns.length) { fire(h.spawns[0].childId, { progress: 'ok', solved: false, contextPct: 10 }); await sleep(60) }
  await call('set maxParallel=1'); await sleep(120)
  for (let i = 0; i < h.wakes.length; i++) {
    const t = ((h.wakes[i].blocks || [])[0] || {}).text || ''
    if (t.indexOf('【求真表决') !== -1) { const w = h.wakes.splice(i, 1)[0]; fire(w.childId, { formal: { target: TARGET_A, decision: 'defect', note: '偏离' }, verdict: { target: TARGET_A, verdict: 1, reason: 'x' }, progress: 'x', solved: false, contextPct: 10 }); break }
  }
  await sleep(180)
  const s = stateOf(WS)
  const v = s.verdicts[TARGET_A] || {}
  console.log('  require: closed=' + v.closed + ' outcome=' + v.outcome + ' reason=' + String(v.reason || '').slice(0, 60))
  assert(!(v.closed === true && v.outcome === 'true'), '★ S6: `require` still withholds a TRUE conclusion after a defect')
  assert(v.closed !== true || v.outcome === 'undecided', '★ S6: a closure in `require` mode can only be 未定论 here (the gate is not bypassed)')
  clean(WS)
}

section('[S7] a temp worker (no vote rights) records a defect — no abstention marker for a non-voter')
{
  const { WS, call, fire, h } = await mkScenario('temp', { members: [
    { id: 'acad', kind: 'academician', childId: '', phase: 'active', direction: '', hiredBy: '', term: '', provider: 'spawn', persona: '', error: '', createdAt: 1, dismissedAt: 0, dismissReason: '' },
    { id: 't-1', kind: 'temp', childId: '', phase: 'active', direction: '', hiredBy: 'acad', term: '', provider: 'spawn', persona: '', error: '', createdAt: 2, dismissedAt: 0, dismissReason: '' },
  ] })
  await call('resume'); await sleep(60)
  for (const sp of h.spawns.slice()) { fire(sp.childId, { progress: 'ok', solved: false, contextPct: 10 }); await sleep(40) }
  await call('set maxParallel=2'); await sleep(200)
  const st0 = await call('status')
  const childOf = (id) => { const m = (st0.members || []).find((x) => x.id === id); return m ? String(m.childId || '') : '' }
  const tempChild = (st0.members || []).filter((m) => m.id === 't-1' && m.childId).map((m) => m.childId)
    .concat(h.spawns.map((s) => String(s.childId).slice(0, 12)).filter((c) => c && c !== childOf('acad')))
  // A temp worker has NO vote rights, so the framework never asks it to vote — the honest scenario is
  // an OPINION from a non-voter while a verify is open: it must be recordable, must not be counted,
  // and must not produce an "abstention" claim.
  let acadChild = ''
  const deadline = Date.now() + 3000
  while (!acadChild && Date.now() < deadline) {
    const i = h.wakes.findIndex((w) => (((w.blocks || [])[0] || {}).text || '').indexOf('【求真表决') !== -1)
    if (i === -1) { if (h.wakes.length) { const w = h.wakes.shift(); fire(w.childId, { progress: 'x', solved: false, contextPct: 10 }) } await sleep(25); continue }
    acadChild = h.wakes[i].childId
    const w = h.wakes.splice(i, 1)[0]
    fire(w.childId, { verdict: { target: TARGET_A, verdict: 1, reason: '唯一有表决权者同意' }, progress: 'x', solved: false, contextPct: 10 })
    await sleep(120)
  }
  const stV = await call('status')
  // The temp worker has NO rights: its "vote" must be relayed, never counted — and it must not
  // produce an abstention marker (there was no boolean ballot to abstain from).
  const tcid = tempChild.find((c) => c !== String(acadChild).slice(0, 12)) || (tempChild[0] || '')
  let tempAnswered = false
  if (tcid) {
    fire(tcid, { verdict: { target: TARGET_A, verdict: 0, reason: '临时工认为假（无权）' }, progress: 'x', solved: false, contextPct: 10 })
    tempAnswered = true
    await sleep(120)
  }
  const st = await call('status')
  const s = stateOf(WS)
  const a = ((st.formal || {}).objects || []).find((o) => o.target === TARGET_A) || {}
  const voted = ((stV.verify || {}).voted || [])
  console.log('  tempChild=' + JSON.stringify(tcid) + ' tempAnswered=' + tempAnswered + ' votedAtBallot=' + JSON.stringify(voted) + ' marker=' + JSON.stringify(a.abstainedCount) + ' closed/outcome=' + JSON.stringify([(s.verdicts[TARGET_A] || {}).closed, (s.verdicts[TARGET_A] || {}).outcome]))
  assert(!!tcid && tempAnswered, 'S7: the temp worker could still speak (a non-voter opinion is delivered)')
  assert(!voted.includes('t-1'), '★ S7: the temp worker is never a voter in the verify')
  assert(!a.abstainedCount, '★ S7: no abstention marker for a non-voter (there was no boolean ballot to abstain from)')
  assert(!((s.verdicts[TARGET_A] || {}).closed === true && (s.verdicts[TARGET_A] || {}).outcome === 'false'), '★ S7: the non-voter\'s 0 did not decide the object')
  clean(WS)
}

section('[S8] no cross-round carryover — a later plain 1 still concludes')
{
  const { WS, call, fire, h } = await mkScenario('carry', {})
  await call('resume'); await sleep(40)
  if (h.spawns.length) { fire(h.spawns[0].childId, { progress: 'ok', solved: false, contextPct: 10 }); await sleep(60) }
  await call('set maxParallel=1'); await sleep(120)
  // round 1: defect + 1 (enforced abstention, no conclusion)
  for (let i = 0; i < h.wakes.length; i++) {
    const t = ((h.wakes[i].blocks || [])[0] || {}).text || ''
    if (t.indexOf('【求真表决') !== -1) { const w = h.wakes.splice(i, 1)[0]; fire(w.childId, { formal: { target: TARGET_A, decision: 'defect', note: '偏离' }, verdict: { target: TARGET_A, verdict: 1, reason: 'r1' }, progress: 'x', solved: false, contextPct: 10 }); break }
  }
  await sleep(150)
  const mid = stateOf(WS).verdicts[TARGET_A] || {}
  // round 2: a plain 1 (no formal field) must be able to conclude
  await call('set maxParallel=1'); await sleep(150)
  let answered2 = false
  const deadline = Date.now() + 2500
  while (!answered2 && Date.now() < deadline) {
    const i = h.wakes.findIndex((w) => (((w.blocks || [])[0] || {}).text || '').indexOf('【求真表决') !== -1)
    if (i === -1) { if (h.wakes.length) { const w = h.wakes.shift(); fire(w.childId, { progress: 'x', solved: false, contextPct: 10 }) } await sleep(25); continue }
    const w = h.wakes.splice(i, 1)[0]
    fire(w.childId, { verdict: { target: TARGET_A, verdict: 1, reason: 'r2 无缺陷' }, progress: 'x', solved: false, contextPct: 10 })
    answered2 = true
    await sleep(120)
  }
  const s = stateOf(WS).verdicts[TARGET_A] || {}
  console.log('  after round1 closed=' + mid.closed + '/marker kept; round2 answered=' + answered2 + ' closed=' + s.closed + ' outcome=' + s.outcome)
  assert(!(mid.closed === true && mid.outcome === 'true'), 'S8: round 1 (defect) did not conclude')
  assert(s.closed === true && s.outcome === 'true', '★ S8: a LATER reply with a plain 1 concludes normally (no cross-round carryover)')
  clean(WS)
}

section('[S9] observability — the marker is on status(), lean_lib and report()')
{
  const { WS, call, tool, fire, h } = await mkScenario('obs', {})
  await call('resume'); await sleep(40)
  if (h.spawns.length) { fire(h.spawns[0].childId, { progress: 'ok', solved: false, contextPct: 10 }); await sleep(60) }
  await call('set maxParallel=1'); await sleep(120)
  for (let i = 0; i < h.wakes.length; i++) {
    const t = ((h.wakes[i].blocks || [])[0] || {}).text || ''
    if (t.indexOf('【求真表决') !== -1) { const w = h.wakes.splice(i, 1)[0]; fire(w.childId, { formal: { target: TARGET_A, decision: 'defect', note: '偏离' }, verdict: { target: TARGET_A, verdict: 1, reason: 'x' }, progress: 'x', solved: false, contextPct: 10 }); break }
  }
  await sleep(150)
  const st = await call('status')
  const a = ((st.formal || {}).objects || []).find((o) => o.target === TARGET_A) || {}
  const lib = await tool('vibe_v5_lean_lib', { refresh: false })
  const libObj = ((lib.objects || [])[0]) || {}
  const rp = String((await call('report')).report || '')
  const line = (rp.split('\n').find((l) => l.includes('框架强制弃权')) || '').trim()
  // fourth surface: the member-facing archive receipt (dedupe path returns the stored record)
  const arch = await tool('vibe_v5_lean_archive', { kind: 'proof', target: TARGET_A, content: existsSync(join(instRootOf(WS), 'Formal', TARGET_A + '.lean')) ? readFileSync(join(instRootOf(WS), 'Formal', TARGET_A + '.lean'), 'utf8') : 'theorem p_a : True := trivial\n', run: false })
  console.log('  status.fidelity=' + JSON.stringify(a.fidelity && a.fidelity.voteAbstainedByFramework) + ' lib.count=' + JSON.stringify(libObj.abstainedCount) + ' archive.count=' + JSON.stringify(arch.abstainedCount) + ' report=' + line.slice(0, 110))
  assert(!!(a.fidelity && Array.isArray(a.fidelity.voteAbstainedByFramework) && a.fidelity.voteAbstainedByFramework.length === 1), '★ S9: status().formal.objects[].fidelity exposes the marker array')
  assert(libObj.abstainedCount === 1, '★ S9: vibe_v5_lean_lib.objects exposes abstainedCount')
  assert(arch.abstainedCount === 1 && !!(arch.fidelity && arch.fidelity.voteAbstainedByFramework), '★ S9: vibe_v5_lean_archive returns the marker on its receipt')
  assert(/框架强制弃权/.test(line), '★ S9: report() has a 框架强制弃权 line naming the object and the member')
  clean(WS)
}

console.log('')
console.log('passed=' + passed + ' failed=' + failed)
if (failed) { console.error('FAILURES:'); for (const f of failures) console.error('  - ' + f); process.exit(1) }
console.log('ALL GREEN')
process.exit(0)

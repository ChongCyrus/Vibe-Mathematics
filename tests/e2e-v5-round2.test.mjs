// ============================================================
// V5 ROUND-2 E2E — the behaviour paths the first suite never exercised:
//   · the hardened JSON backend (the ONLY backend: `makeFileBackend`/`installBackend`)
//   · a simulated PROCESS RESTART (fresh agent + fresh backend over the same workspace)
//   · duplicate subagent/end idempotence
//   · hire quotas (per-member and institute-wide)
//   · quorumMode 'all-unanimous'
//   · m recomputed when the roster shrinks (a voter is dismissed)
//   · vibe_v5_wait (validation, no-progress shortcut, and real activity wake)
//   · vibe_v5_read_library
//   · id sanitisation against path traversal
//   · configure guard while running
//   · the verification watchdog abandoning a stuck round
//   · meeting PARKED behind an in-flight verification, then resumed
//   · compaction/keepalive directives appear only when they should
//   · the host session log is NEVER written, and the state reloads through the JSON file
// Run: node tests/e2e-v5-round2.test.mjs
// ============================================================
import { mkdtempSync, existsSync, readdirSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname, isAbsolute } from 'node:path'

// V5_PLUGIN lets a sensitivity probe point this suite at a deliberately broken copy.
// Without it every probe against this suite silently tested the UNMUTATED plugin and was
// reported as a "detection" only because the probe's own spawn failed — i.e. the whole
// e2e block of the sensitivity audit was vacuous.
const PLUGIN = process.env.V5_PLUGIN
  ? new URL('file:///' + String(process.env.V5_PLUGIN).replace(/\\/g, '/'))
  : new URL('../vibe-math-v5/vibe-math-v5.js', import.meta.url)
let passed = 0, failed = 0
const failures = []
const assert = (c, m) => { if (c) { passed++; console.log('  ok - ' + m) } else { failed++; failures.push(m); console.error('  FAIL - ' + m) } }
const sleep = ms => new Promise(r => setTimeout(r, ms))

// The host contract v5 needs has NO session services at all: the plugin declares
// `inject = ['subagents','agents','fs','tools','commands','timer']` and keeps its state in a
// hardened JSON file. `Session.append` cannot mark an event `ignorable`, and DSH's session
// persistence refuses to load a log carrying an unknown event type — so a host that offers
// `sessionProjections` must still never receive an institute event. Every session created
// here records whatever it is given, so the suites can assert that NOTHING was appended.
function makeSession(id, parentSession) {
  const events = []
  const s = {
    id,
    header: { version: 1, id, createdAt: Date.now(), cwd: null, parentSession, isSeeded: false },
    inheritedEventCount: 0,
    get seq() { return events.length },
    append(type, data) { const ev = { type, data, seq: events.length, time: Date.now() }; events.push(ev); return ev },
    deriveMessages() { return [] },
    snapshotEvents(from) { return events.slice(from || 0) },
    ownEvents() { return events.slice() },
    _events: events,
  }
  return s
}

/** A fresh host+plugin instance over a workspace (a fresh temp dir by default). */
function makeHost(opts) {
  const o = opts || {}
  const WS = o.ws || mkdtempSync(join(tmpdir(), 'vibe-v5r2-'))
  const listeners = {}, toolRegs = [], commandRegs = [], spawns = [], wakes = [], interrupts = [], drains = []
  const liveAgents = new Map()
  // The two services the fix removed. This host does not provide them, and records every
  // request so the suite can assert the plugin never even LOOKS for them any more.
  const removedServiceQueries = []

  const ctx = {
    get(name) {
      if (name === 'sessions' || name === 'sessionProjections') removedServiceQueries.push(name)
      if (name === 'sandboxPolicy') return undefined
      if (name === 'compaction') return o.compaction
      if (name === 'subprocess') {
        return {
          async spawn({ argv }) {
            const script = argv[argv.length - 1] || ''
            if (/New-Item/.test(script)) {
              const re = /'((?:[^']|'')*)'/g; let m
              while ((m = re.exec(script)) !== null) { const p = m[1].replace(/''/g, "'"); if (p && !/^-/.test(p)) mkdirSync(p, { recursive: true }) }
            }
            return { done: Promise.resolve({ exitCode: 0 }) }
          },
        }
      }
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
      async startContinuable({ label, request }) {
        const id = 'c' + (spawns.length + 1)
        const childSession = makeSession(id, 'sess-A'); childSession.header.cwd = WS
        liveAgents.set(id, { id, session: childSession, options: request && request.agentOptions })
        spawns.push({ label, request, childId: id, persona: request && request.persona, ended: false })
        return { childId: id, messageId: 'm' + spawns.length }
      },
      async sendMessage(parent, childId, blocks) { wakes.push({ childId, blocks }); return 'w' + wakes.length },
      interrupt(childId) { interrupts.push(childId) },
      async drainContinuableChildren(parent, ids) { drains.push(...ids); for (const i of ids) liveAgents.delete(i) },
    },
    agents: { roots() { return [ROOT] }, get(id) { return id === ROOT.id ? ROOT : liveAgents.get(id) }, list() { return [ROOT, ...liveAgents.values()] } },
    fs: {
      async resolve(rel, o2) {
        const b = (o2 && o2.cwd) || WS
        const p = (typeof rel === 'string' && isAbsolute(rel)) ? rel.replace(/\//g, '\\') : join(b, ...String(rel).split('/'))
        return { targetKey: p, displayPath: p }
      },
      async stat(t) { return existsSync(t.targetKey) ? { version: 'v1', type: 'file', size: 1 } : undefined },
      async readText(t) { return readFileSync(t.targetKey, 'utf8') },
      async writeText(t, c) { mkdirSync(dirname(t.targetKey), { recursive: true }); writeFileSync(t.targetKey, c, 'utf8') },
      async listDir(t) { if (!existsSync(t.targetKey)) return []; return readdirSync(t.targetKey, { withFileTypes: true }).map(e => ({ name: e.name, type: e.isDirectory() ? 'directory' : 'file' })) },
    },
  }

  const ROOT_SESSION = makeSession('sess-A', undefined)
  ROOT_SESSION.header.cwd = WS
  const ROOT = { id: 'sess-A', options: {}, session: ROOT_SESSION, ctx: undefined }

  const mod = o.pluginModule
  mod.apply(ctx)

  async function callTool(name, args, agent) {
    const spec = toolRegs.find(x => x.name === name)
    if (!spec) throw new Error('no tool ' + name)
    return JSON.parse(await spec.execute(args || {}, { agent: agent || ROOT }))
  }
  const childAgent = (childId) => liveAgents.get(childId) || { id: childId, session: { header: { parentSession: ROOT.id } } }
  function fireEnd(childId, reply, stopReason) {
    const blocks = reply === undefined ? [] : [{ type: 'text', text: '```json\n' + JSON.stringify(reply) + '\n```' }]
    for (const h of (listeners['subagent/end'] || [])) h({ id: childId, runId: 'r', provider: 'spawn', local: true, stopReason: stopReason || 'completed', lastAssistantMessage: blocks })
  }
  const spawnOf = (m) => spawns.find(s => s.label.indexOf('vibe5 ' + m + ' ') !== -1)
  const childOf = (m) => { const s = spawnOf(m); return s ? s.childId : m }
  const labelOf = (cid) => { const s = spawns.find(x => x.childId === cid); const m = s ? /vibe5 (\S+) /.exec(s.label) : null; return m ? m[1] : '' }
  const kindOf = (p) => /【入职首轮/.test(p) ? 'initial' : /【研究所会议/.test(p) ? 'meeting' : /【求真表决/.test(p) ? 'verify' : /【心跳检查/.test(p) ? 'checkpoint' : 'normal'

  async function settleSpawns() {
    for (const sp of spawns.slice()) {
      if (sp.ended) continue
      sp.ended = true
      fireEnd(sp.childId, { progress: labelOf(sp.childId) + '：初始见解已记录。', solved: false, contextPct: 10 })
      await sleep(15)
    }
  }
  let plannedVotes = null
  let solvePlan = null
  async function drain(budget = 60) {
    let n = 0
    while (wakes.length && n < budget) {
      const w = wakes.shift()
      const prompt = (w.blocks && w.blocks[0] && w.blocks[0].text) || ''
      const kind = kindOf(prompt)
      const who = labelOf(w.childId)
      let reply
      if (kind === 'verify') {
        const tm = /"target"\s*:\s*"([^"]+)"/.exec(prompt)
        const t = tm ? tm[1] : 'p-r-1'
        const v = plannedVotes && plannedVotes.has(who) ? plannedVotes.get(who) : 0.5
        reply = { verdict: { target: t, verdict: v, reason: who + ' 判断' }, contextPct: 20 }
      } else if (kind === 'meeting') {
        reply = { input: who + '：意见已述。', vote_solved: solvePlan === true, solved: solvePlan === true, contextPct: 20 }
      } else {
        reply = { progress: who + '：继续推进。', solved: false, contextPct: 20 }
      }
      fireEnd(w.childId, reply)
      n++
      await sleep(15)
    }
    return n
  }
  /** Pull the next queued wake for one member and return its prompt text.
   *  Wakes for OTHER members are answered benignly so the scheduler keeps cycling —
   *  otherwise a single unanswered heartbeat would stop all further passes. */
  async function peekWakeOf(member, maxWaitMs) {
    const t0 = Date.now()
    while (Date.now() - t0 < (maxWaitMs || 3000)) {
      const i = wakes.findIndex(w => labelOf(w.childId) === member)
      if (i !== -1) {
        const w = wakes.splice(i, 1)[0]
        return { childId: w.childId, text: (w.blocks && w.blocks[0] && w.blocks[0].text) || '' }
      }
      if (wakes.length) {
        const w = wakes.shift()
        fireEnd(w.childId, { progress: '其他成员推进中', solved: false, contextPct: 10 })
      }
      await sleep(20)
    }
    return null
  }
  return { WS, ctx, ROOT, ROOT_SESSION, removedServiceQueries, spawns, wakes, interrupts, drains, toolRegs, commandRegs, listeners, callTool, childAgent, fireEnd, spawnOf, childOf, labelOf, kindOf, settleSpawns, drain, peekWakeOf, set plannedVotes(v) { plannedVotes = v }, get plannedVotes() { return plannedVotes }, set solvePlan(v) { solvePlan = v } }
}

const pluginModule = await import(PLUGIN.href + '?t=' + Date.now())
const PROBLEM = '证明素数有无穷多个'

// The durable authority is the hardened JSON file. A commit is applied to the in-memory
// snapshot immediately but written through a deferred per-file chain, so a test that wants to
// observe "this was committed" must poll the FILE — reading the session log is no longer possible
// (and is exactly what the fix removed).
const statePathOf = (ws) => join(ws, 'VibeMath', 'Projects', 'default', 'Institutes', 'institute', 'State', 'institute.v5state.json')
const readStateAt = (ws) => { try { return JSON.parse(readFileSync(statePathOf(ws), 'utf8')) } catch (e) { return null } }
const instOfState = (s) => (s && s.institutes) ? s.institutes['default::institute'] : undefined
async function waitInst(ws, pred) {
  let inst = instOfState(readStateAt(ws))
  for (let i = 0; i < 60; i++) {
    if (inst && (!pred || pred(inst))) return inst
    await sleep(10)
    inst = instOfState(readStateAt(ws))
  }
  return inst
}

// ============================================================
console.log('-- V5 round-2 e2e --')

// ---------- 1. the hardened JSON backend (the only one) ----------
console.log('\n[1] the hardened JSON backend (host with no session services at all)')
{
  const h = makeHost({ pluginModule })
  const st = await h.callTool('vibe_v5_start', { problem: PROBLEM, researcherCount: 2 })
  assert(st.ok === true, 'start works on a host with no sessions/sessionProjections service (got ' + JSON.stringify(st).slice(0, 90) + ')')
  assert(Array.isArray(pluginModule.inject) && pluginModule.inject.indexOf('sessions') === -1 && pluginModule.inject.indexOf('sessionProjections') === -1,
    '★ the plugin declares no sessions/sessionProjections dependency (inject=' + JSON.stringify(pluginModule.inject) + ')')
  assert(h.removedServiceQueries.length === 0,
    '★ the plugin never even resolves the removed services (queries=' + JSON.stringify(h.removedServiceQueries) + ')')
  const s0 = await h.callTool('vibe_v5_status', {})
  assert(s0.backend === 'file', 'status reports the file backend (got ' + s0.backend + ')')
  await h.settleSpawns()
  const stFile = join(h.WS, 'VibeMath', 'Projects', 'default', 'Institutes', 'institute', 'State', 'institute.v5state.json')
  // the state file is written lazily (deferred stringify chain) — give it a tick
  for (let i = 0; i < 40 && !existsSync(stFile); i++) await sleep(10)
  assert(existsSync(stFile), 'the backend persisted the institute state to State/institute.v5state.json')
  if (existsSync(stFile)) {
    const parsed = JSON.parse(readFileSync(stFile, 'utf8'))
    const inst = parsed.institutes['default::institute']
    assert(!!inst && inst.members.length === 3, 'the persisted state holds 1 academician + 2 researchers (got ' + (inst ? inst.members.length : 'none') + ')')
  }
  assert(h.ROOT_SESSION._events.length === 0, 'the whole founding wrote NOTHING to the host session log (' + h.ROOT_SESSION._events.length + ' events)')
}

// ---------- 2. simulated PROCESS RESTART ----------
console.log('\n[2] simulated process restart (fresh host, fresh backend, same workspace)')
{
  const WS = mkdtempSync(join(tmpdir(), 'vibe-v5r2-restart-'))
  const h1 = makeHost({ pluginModule, ws: WS })
  await h1.callTool('vibe_v5_start', { problem: PROBLEM, researcherCount: 2 })
  await h1.settleSpawns()
  const stFile = statePathOf(WS)
  for (let i = 0; i < 40 && !existsSync(stFile); i++) await sleep(10)
  assert(existsSync(stFile), 'first process persisted its state')

  // a genuinely fresh host = new backend instance, empty in-memory state
  const h2 = makeHost({ pluginModule, ws: WS })
  const s2 = await h2.callTool('vibe_v5_status', {})
  assert(s2.members.length === 3, 'a FRESH host reads the persisted roster back (got ' + s2.members.length + ' members)')
  const res = await h2.callTool('vibe_v5_resume', {})
  assert(res.ok === true, 'resume works on a fresh host over persisted state (got ' + JSON.stringify(res).slice(0, 120) + ')')
  assert(h2.spawns.length === 3, 'resume re-spawned the 3 members whose child sessions no longer exist (got ' + h2.spawns.length + ')')
  assert(s2.quorum && s2.quorum.m === 3, 'the recovered roster recomputes m correctly (m=' + (s2.quorum ? s2.quorum.m : '?') + ')')
}

// ---------- 3. duplicate subagent/end is idempotent ----------
console.log('\n[3] duplicate subagent/end idempotence')
{
  const h = makeHost({ pluginModule })
  await h.callTool('vibe_v5_start', { problem: PROBLEM, researcherCount: 2 })
  const cid = h.childOf('r-1')
  // settle the founding turn normally, then REPLAY the exact same end event. "Committed" is
  // observed where the state now lives — State/institute.v5state.json (`artifactCount` is what
  // recording a card bumps) — and the host session log must stay untouched either way.
  const logBefore = h.ROOT_SESSION._events.length
  h.fireEnd(cid, { progress: '唯一一次', record: [{ kind: 'proposition', id: 'dup-x', statement: 's', value: 0.5, motive: 'm', p: 0.5 }] })
  const inst1 = await waitInst(h.WS, (x) => Number(x.artifactCount) >= 1)
  const afterFirst = inst1 ? Number(inst1.artifactCount) : 0
  h.fireEnd(cid, { progress: '重复投递', record: [{ kind: 'proposition', id: 'dup-x', statement: 's', value: 0.5, motive: 'm', p: 0.5 }] })
  await sleep(60)
  const inst2 = await waitInst(h.WS)
  const afterSecond = inst2 ? Number(inst2.artifactCount) : 0
  assert(afterSecond === afterFirst, 'a replayed end commits NOTHING new (' + afterFirst + ' -> ' + afterSecond + ' artifacts in the v5state JSON)')
  assert(afterFirst >= 1, 'the first end did commit state (artifactCount=' + afterFirst + ' in State/institute.v5state.json)')
  assert(h.ROOT_SESSION._events.length === logBefore, 'neither end appended anything to the host session log (' + logBefore + ' -> ' + h.ROOT_SESSION._events.length + ' events)')
  // the card itself is durable too, and the replay did not append a second progress entry
  const prog = join(h.WS, 'VibeMath', 'Projects', 'default', 'Institutes', 'institute', 'Members', 'r-1', 'Progress', 'progress.md')
  const progText = existsSync(prog) ? readFileSync(prog, 'utf8') : ''
  assert(/唯一一次/.test(progText) && !/重复投递/.test(progText), 'only the FIRST end reached the member\'s progress log')
}

// ---------- 4. hire quotas ----------
console.log('\n[4] hire quotas')
{
  const h = makeHost({ pluginModule })
  await h.callTool('vibe_v5_start', { problem: PROBLEM, researcherCount: 1 })
  await h.settleSpawns()
  await h.callTool('vibe_v5_set', { maxTempPerMember: 2, maxTempTotal: 3 })
  const a = await h.callTool('vibe_v5_hire', { purpose: 'p1', initial_task: 't1' }, h.childAgent(h.childOf('r-1')))
  const b = await h.callTool('vibe_v5_hire', { purpose: 'p2', initial_task: 't2' }, h.childAgent(h.childOf('r-1')))
  const c = await h.callTool('vibe_v5_hire', { purpose: 'p3', initial_task: 't3' }, h.childAgent(h.childOf('r-1')))
  await h.settleSpawns()
  assert(a.ok && b.ok, 'the first two hires succeed (cap 2 per member)')
  assert(c.ok === false && c.code === 'V5_MEMBER_LIMIT', 'the third hire is refused by maxTempPerMember (' + (c.code || 'no code') + ')')
  const d = await h.callTool('vibe_v5_hire', { purpose: 'p4', initial_task: 't4' }, h.childAgent(h.childOf('acad')))
  assert(d.ok === true, 'the academician can still hire (its own per-member budget)')
  const e = await h.callTool('vibe_v5_hire', { purpose: 'p5', initial_task: 't5' }, h.childAgent(h.childOf('acad')))
  assert(e.ok === false && e.code === 'V5_MEMBER_LIMIT', 'the institute-wide cap maxTempTotal=3 then refuses (' + (e.code || 'no code') + ')')
}

// ---------- 5. quorumMode all-unanimous ----------
console.log('\n[5] quorumMode all-unanimous')
{
  const h = makeHost({ pluginModule })
  await h.callTool('vibe_v5_start', { problem: PROBLEM, researcherCount: 2 })
  await h.settleSpawns()
  await h.callTool('vibe_v5_set', { quorumMode: 'all-unanimous' })
  await h.callTool('vibe_v5_propose_verify', { target: 'p-r-1', kind: 'proposition', reason: 'r' }, h.childAgent(h.childOf('r-1')))
  const s = await h.callTool('vibe_v5_status', {})
  assert(!!s.verify, 'verification started in all-unanimous mode')
  // only 2 of 3 voters assert true; the third abstains -> must NOT verify
  h.plannedVotes = new Map([['acad', 1], ['r-1', 1], ['r-2', 0.5]])
  await h.drain(6)
  let s2 = await h.callTool('vibe_v5_status', {})
  assert(s2.verified.indexOf('p-r-1') === -1, 'all-unanimous: 2/3 true with one abstention does NOT verify')
  // now everyone asserts true -> verifies
  h.plannedVotes = new Map([['acad', 1], ['r-1', 1], ['r-2', 1]])
  await h.drain(8)
  let s3 = await h.callTool('vibe_v5_status', {})
  if (!s3.verified.includes('p-r-1')) { h.plannedVotes = new Map([['acad', 1], ['r-1', 1], ['r-2', 1]]); await h.drain(8); s3 = await h.callTool('vibe_v5_status', {}) }
  assert(s3.verified.indexOf('p-r-1') !== -1, 'all-unanimous: every voter true DOES verify')
}

// ---------- 6. m recomputed when the roster shrinks ----------
console.log('\n[6] quorum recomputed when a voter is dismissed')
{
  const h = makeHost({ pluginModule })
  await h.callTool('vibe_v5_start', { problem: PROBLEM, researcherCount: 3 })
  await h.settleSpawns()
  const s0 = await h.callTool('vibe_v5_status', {})
  assert(s0.quorum.m === 3 && s0.quorum.voterCount === 4, 'baseline m=3 over 4 voters')
  await h.callTool('vibe_v5_remove_researcher', { id: 'r-3' })
  await h.callTool('vibe_v5_remove_researcher', { id: 'r-2' })
  const s1 = await h.callTool('vibe_v5_status', {})
  assert(s1.quorum.voterCount === 2, 'two researchers dismissed -> 2 voters (got ' + s1.quorum.voterCount + ')')
  assert(s1.quorum.m === 2, 'm tracks the roster down to min(cap=3, P=2) = 2 (got ' + s1.quorum.m + ')')
  assert(h.drains.length === 2, 'both dismissed researchers had their resident child released')
}

// ---------- 6b. a dismissed voter's old ballot votes in NEITHER direction ----------
console.log('\n[6b] a dismissed voter\'s old ballot is dropped from the ledger AND the tally')
{
  // Round A H2 fixed "a dismissed member's old ballot still counts". The suite used to prove only
  // that m/voterCount were recomputed and that the resident was released — never that the BALLOT
  // stopped counting. This case votes, dismisses, then re-votes, which is the sequence the audit
  // asked for: r-1 asserts TRUE, is dismissed, and the remaining voter's FALSE must now CONCLUDE
  // (with r-1's ballot ignored). If a former member's vote still counted, 1 vs 0 would conflict
  // and the object could never reach Verified/ — so the verdict itself is the discriminator.
  const h = makeHost({ pluginModule })
  await h.callTool('vibe_v5_start', { problem: PROBLEM, researcherCount: 1 })
  await h.settleSpawns()
  const stateFile = join(h.WS, 'VibeMath', 'Projects', 'default', 'Institutes', 'institute', 'State', 'institute.v5state.json')
  const ballots = () => {
    try {
      const s = JSON.parse(readFileSync(stateFile, 'utf8'))
      const v = s.institutes[Object.keys(s.institutes)[0]].verdicts['p-dismiss']
      return v ? Object.keys(v.votes || {}) : null
    } catch (e) { return null }
  }
  const s0 = await h.callTool('vibe_v5_status', {})
  assert(s0.quorum.voterCount === 2 && s0.quorum.m === 2, 'baseline: acad + r-1 = 2 voters, m=2 (got P=' + s0.quorum.voterCount + ', m=' + s0.quorum.m + ')')
  await h.callTool('vibe_v5_record_proposition', { id: 'p-dismiss', statement: '被解雇者的旧票不得计入', value: 0.5, motive: 'm', p: 0.5 })
  await h.callTool('vibe_v5_propose_verify', { target: 'p-dismiss', kind: 'proposition', reason: 'r' }, h.childAgent(h.childOf('r-1')))
  const s1 = await h.callTool('vibe_v5_status', {})
  assert(!!s1.verify && s1.verify.target === 'p-dismiss', 'the ballot on p-dismiss is live')
  const voted = await h.callTool('vibe_v5_verdict', { target: 'p-dismiss', verdict: 1, reason: 'r-1 断言为真' }, h.childAgent(h.childOf('r-1')))
  assert(voted.ok === true && voted.allVoted === false, 'r-1 cast the ONLY boolean vote so far (the other voter has not answered)')
  assert((ballots() || []).indexOf('r-1') !== -1, 'the durable open-verdict record carries r-1\'s ballot before the dismissal (' + JSON.stringify(ballots()) + ')')
  const removed = await h.callTool('vibe_v5_remove_researcher', { id: 'r-1' })
  assert(removed.ok === true, 'r-1 was dismissed with the ballot still open (' + JSON.stringify(removed).slice(0, 80) + ')')
  const s2 = await h.callTool('vibe_v5_status', {})
  assert(s2.quorum.voterCount === 1 && s2.quorum.m === 1, 'the live roster recomputes immediately: P=1, m=1 (got P=' + s2.quorum.voterCount + ', m=' + s2.quorum.m + ')')
  assert((ballots() || []).indexOf('r-1') === -1, '★ the dismissed member\'s ballot is DELETED from the durable open verdict (votes=' + JSON.stringify(ballots()) + ')')
  const finalVote = await h.callTool('vibe_v5_verdict', { target: 'p-dismiss', verdict: 0, reason: 'acad 断言为假' }, h.childAgent(h.childOf('acad')))
  assert(finalVote.ok === true && finalVote.allVoted === true, 'the remaining voter completed the ballot (allVoted=true)')
  const s3 = await h.callTool('vibe_v5_status', {})
  assert(s3.verified.indexOf('p-dismiss') !== -1,
    '★ the ballot CONCLUDED false — a former member\'s TRUE vote cannot block it (got verified=' + JSON.stringify(s3.verified) + ', undecided=' + JSON.stringify(s3.undecided) + ')')
}

// ---------- 7. vibe_v5_wait ----------
console.log('\n[7] vibe_v5_wait')
{
  const h = makeHost({ pluginModule })
  await h.callTool('vibe_v5_start', { problem: PROBLEM, researcherCount: 1 })
  await h.settleSpawns()
  const bad = await h.callTool('vibe_v5_wait', { timeout_ms: 5000 }, h.childAgent(h.childOf('r-1')))
  assert(bad.ok === false || bad.code === 'V5_INVALID_TIMEOUT' || String(bad.error || '').indexOf('10000') !== -1,
    'a timeout below 10000ms is rejected (' + JSON.stringify(bad).slice(0, 90) + ')')
  // a real wait must be woken by genuine institute activity, not by polling
  const waitP = h.callTool('vibe_v5_wait', { timeout_ms: 10000 }, h.childAgent(h.childOf('r-1')))
  await sleep(30)
  await h.callTool('vibe_v5_say', { text: '有人说话就会唤醒等待者' }, h.childAgent(h.childOf('acad')))
  const woke = await Promise.race([waitP, sleep(1500).then(() => ({ timedOut: 'NEVER-RESOLVED' }))])
  assert(woke.timedOut === false, 'wait is woken by real activity rather than timing out (' + JSON.stringify(woke).slice(0, 80) + ')')
}

// ---------- 8. read_library ----------
console.log('\n[8] vibe_v5_read_library')
{
  const h = makeHost({ pluginModule })
  await h.callTool('vibe_v5_start', { problem: PROBLEM, researcherCount: 1 })
  await h.callTool('vibe_v5_record_proposition', { id: 'p-x', statement: 'S', value: 0.7, motive: 'M', p: 0.9 }, h.childAgent(h.childOf('r-1')))
  h.fireEnd(h.childOf('r-1'), { progress: '进展正文', solved: false })
  await sleep(30)
  const lib = await h.callTool('vibe_v5_read_library', { member: 'r-1' }, h.childAgent(h.childOf('acad')))
  assert(lib.ok === true && lib.count > 0, 'read_library returns entries (got ' + lib.count + ')')
  const hasProp = (lib.items || []).some(i => i.kind === 'proposition' && i.id === 'p-x')
  const hasProg = (lib.items || []).some(i => i.kind === 'progress' && /进展正文/.test(i.text))
  assert(hasProp, 'read_library surfaces another member\'s recorded card (read-only cross-read)')
  assert(hasProg, 'read_library surfaces another member\'s progress log')
  const one = await h.callTool('vibe_v5_read_library', { member: 'r-1', kind: 'proposition', id: 'p-x' })
  assert(one.count === 1 && /- ID: p-x/.test(one.items[0].text), 'read_library can fetch exactly one card by id')
}

// ---------- 9. id sanitisation (path traversal) ----------
console.log('\n[9] id sanitisation against path traversal')
{
  const h = makeHost({ pluginModule })
  await h.callTool('vibe_v5_start', { problem: PROBLEM, researcherCount: 1 })
  await h.settleSpawns()
  const r = await h.callTool('vibe_v5_propose_verify', { target: '../../../../evil', kind: 'proposition', reason: 'x' }, h.childAgent(h.childOf('r-1')))
  assert(r.ok === true, 'a traversal-shaped target is accepted but sanitised')
  const s = await h.callTool('vibe_v5_status', {})
  const t = s.verify ? s.verify.target : (s.verifyQueue[0] || '')
  assert(!!t && t.indexOf('/') === -1 && t.indexOf('..') === -1, 'the stored target id contains no separators or ".." (got "' + t + '")')
  h.plannedVotes = new Map([['acad', 1], ['r-1', 1]])
  await h.drain(8)
  const base = join(h.WS, 'VibeMath', 'Projects', 'default', 'Institutes', 'institute')
  assert(!existsSync(join(h.WS, 'evil')) && !existsSync(join(h.WS, 'VibeMath', 'evil')), 'nothing was written outside the institute tree')
  assert(existsSync(base), 'the institute tree itself is intact')
}

// ---------- 10. configure guard while running ----------
console.log('\n[10] configure guard')
{
  const h = makeHost({ pluginModule })
  await h.callTool('vibe_v5_start', { problem: PROBLEM, researcherCount: 1 })
  const c = await h.callTool('vibe_v5_configure', { institute: 'other' })
  assert(c.ok === false && c.code === 'V5_INSTITUTE_STATE', 'reconfiguring while running is refused (' + (c.code || '') + ')')
  const after = await h.callTool('vibe_v5_status', {})
  assert(after.institute === 'institute', 'the institute was not split onto a second tree')
}

// ---------- 11. verification watchdog ----------
console.log('\n[11] verification watchdog abandons a stuck round')
{
  const h = makeHost({ pluginModule })
  await h.callTool('vibe_v5_start', { problem: PROBLEM, researcherCount: 1 })
  await h.settleSpawns()
  await h.callTool('vibe_v5_set', { activityTimeoutMs: 40 })   // recoverStallMs = 80ms
  await h.callTool('vibe_v5_propose_verify', { target: 'p-r-1', kind: 'proposition', reason: 'x' }, h.childAgent(h.childOf('r-1')))
  const s0 = await h.callTool('vibe_v5_status', {})
  assert(!!s0.verify, 'verification is in flight')
  h.wakes.length = 0                       // deliberately never answer the voters
  await sleep(200)                         // past recoverStallMs
  // any scheduling pass re-runs the watchdog
  await h.callTool('vibe_v5_say', { text: 'ping' }, h.childAgent(h.childOf('r-1')))
  h.fireEnd(h.childOf('r-1'), { solved: false })
  await sleep(80)
  let cleared = false
  for (let i = 0; i < 20 && !cleared; i++) {
    const s = await h.callTool('vibe_v5_status', {})
    if (!s.verify) cleared = true
    else { h.fireEnd(h.childOf('r-1'), { solved: false }); await sleep(40) }
  }
  const s1 = await h.callTool('vibe_v5_status', {})
  assert(!s1.verify, 'the stuck verification was abandoned instead of blocking forever')
  assert(s1.undecided.length >= 1 || s1.verified.indexOf('p-r-1') === -1, 'the abandoned object stayed 未定论 rather than being forced true/false')
}

// ---------- 12. meeting parked behind a verification ----------
console.log('\n[12] meeting parked behind an in-flight verification')
{
  const h = makeHost({ pluginModule })
  await h.callTool('vibe_v5_start', { problem: PROBLEM, researcherCount: 2 })
  await h.settleSpawns()
  await h.callTool('vibe_v5_propose_verify', { target: 'p-r-1', kind: 'proposition', reason: 'x' }, h.childAgent(h.childOf('r-1')))
  const s0 = await h.callTool('vibe_v5_status', {})
  assert(!!s0.verify, 'a verification is in flight')
  const m = await h.callTool('vibe_v5_meeting', { agenda: '协调下一步', kind: 'sync' }, h.childAgent(h.childOf('acad')))
  assert(m.ok === true && m.parked === true, 'the meeting is PARKED rather than preempting verification (' + JSON.stringify(m).slice(0, 90) + ')')
  const s1 = await h.callTool('vibe_v5_status', {})
  assert(!!s1.parkedMeeting, 'status exposes the parked meeting')
  // settle the verification, then the parked meeting must actually convene. Drain only
  // the verification's own asks: a greedy drain would also consume the meeting's asks
  // and finalize the meeting before we can observe it.
  h.plannedVotes = new Map([['acad', 1], ['r-1', 1], ['r-2', 1]])
  await h.drain(3)
  await sleep(80)
  let met = null
  for (let i = 0; i < 20 && !met; i++) {
    const s = await h.callTool('vibe_v5_status', {})
    if (s.meeting) met = s.meeting
    else if (s.verify) { await h.drain(3) }
    await sleep(40)
  }
  assert(!!met, 'the parked meeting convened once verification cleared (meeting=' + (met ? met.id : 'none') + ')')
}

// ---------- 13. compaction directives only when warranted ----------
console.log('\n[13] compaction directive appears only when warranted')
{
  const h = makeHost({ pluginModule })
  await h.callTool('vibe_v5_start', { problem: PROBLEM, researcherCount: 1 })
  await h.settleSpawns()
  await h.callTool('vibe_v5_set', { activityTimeoutMs: 30, compactAfterRounds: 50, compactThreshold: 99 })
  // NOTE: never clear `h.wakes` here. Discarding a queued wake would leave that member
  // marked busy forever (a real host always delivers its message), which would starve
  // the heartbeat of candidates. `peekWakeOf` instead answers every OTHER member's wake.
  const plain = await h.peekWakeOf('r-1', 4000)
  assert(!!plain, 'a heartbeat/round wake reached r-1')
  assert(!!plain && plain.text.indexOf('[CONTEXT COMPACT') === -1, 'no compaction directive on an ordinary round')
  if (plain) h.fireEnd(plain.childId, { progress: 'x', contextPct: 10 })

  // Let r-1 REPORT a full context window (the documented channel); the very next
  // research round must then carry the directive.
  const r1w = await h.peekWakeOf('r-1', 4000)
  assert(!!r1w, 'r-1 got the next round')
  if (r1w) h.fireEnd(r1w.childId, { progress: 'x', contextPct: 100 })

  const forced = await h.peekWakeOf('r-1', 4000)
  assert(!!forced && forced.text.indexOf('[CONTEXT COMPACT') !== -1,
    'a member reporting 100% context DOES receive the compaction directive')
  assert(!!forced && forced.text.indexOf('[核心规则]') !== -1,
    'the compaction round also re-anchors the short core rules')
  if (forced) h.fireEnd(forced.childId, { progress: '浓缩后的自述', compacted: true, contextPct: 15 })

  // The directive must NOT come back on the following round (v4 §24.1-③ regression).
  const later = await h.peekWakeOf('r-1', 4000)
  assert(!!later, 'r-1 got a further round')
  assert(!!later && later.text.indexOf('[CONTEXT COMPACT') === -1, 'the directive does NOT repeat on the next round (v4 §24.1-③ regression)')
  if (later) h.fireEnd(later.childId, { progress: 'y', contextPct: 15 })
}

// ---------- 14. the host session log is never written; the JSON file is the reload path ----------
console.log('\n[14] nothing is appended to the host session log; state survives a reload through the JSON file')
{
  const h = makeHost({ pluginModule })
  await h.callTool('vibe_v5_start', { problem: PROBLEM, researcherCount: 2 })
  await h.settleSpawns()
  const s0 = await h.callTool('vibe_v5_status', {})
  const appended = h.ROOT_SESSION._events.filter(e => String(e.type).indexOf('vibe5/') === 0)
  assert(h.ROOT_SESSION._events.length === 0 && appended.length === 0,
    '★ the plugin appends NOTHING to the host session log (' + h.ROOT_SESSION._events.length + ' events): an institute event in the log would make the user session unresumable')
  const stFile = statePathOf(h.WS)
  for (let i = 0; i < 40 && !existsSync(stFile); i++) await sleep(10)
  assert(existsSync(stFile), 'the institute state is on disk instead (State/institute.v5state.json)')
  // A brand-new host over the same workspace is a genuine reload: fresh backend, empty memory.
  const h2 = makeHost({ pluginModule, ws: h.WS })
  const s1 = await h2.callTool('vibe_v5_status', {})
  assert(s1.members.length === s0.members.length, 'the reload reproduced the roster (' + s1.members.length + ' vs ' + s0.members.length + ')')
  assert(s1.quorum.m === s0.quorum.m, 'the reload reproduced the quorum')
  assert(s1.tasks.length === s0.tasks.length, 'the reload reproduced the task board')
  assert(s1.institute === s0.institute && s1.project === s0.project, 'the reload reproduced the institute identity')
  assert(h2.ROOT_SESSION._events.length === 0, 'the reloading host also appended nothing to its session log')
}

// ---------- 15. the host's live-child cap is survived, named and not re-asked ----------
// DSH ≥0.2 caps the number of LIVE continuable children per ROOT agent (ActivationPool.reserve,
// capacity `maxActiveSubagents` on the `subagent` row, default 8; the throw is NOT in the .d.ts).
// The mock below refuses exactly like the host once the cap is full and frees a slot when a child is
// interrupted — the two host facts the preset has to survive. NOTE: the preset remembers the ceiling
// at MODULE scope (a host fact), and every host in this file shares that module, so this case MUST
// stay the LAST one.
console.log('\n[15] the host live-child cap (ACTIVATION_LIMIT_REACHED) is named, remembered and not re-asked')
{
  const h = makeHost({ pluginModule })
  const CAP = 2
  let live = 0
  let hostCalls = 0
  const capError = () => {
    const e = new Error('subagent limit reached (active child limit: ' + CAP + '); wait for an existing child to finish or complete this work with the current agents')
    e.code = 'ACTIVATION_LIMIT_REACHED'
    return e
  }
  const origStart = h.ctx.subagents.startContinuable
  h.ctx.subagents.startContinuable = async function (spec) {
    hostCalls += 1
    if (live >= CAP) throw capError()
    live += 1
    return await origStart.call(this, spec)
  }
  const origInterrupt = h.ctx.subagents.interrupt
  h.ctx.subagents.interrupt = function (childId) { live = Math.max(0, live - 1); return origInterrupt.call(this, childId) }
  const errs = []
  const origErr = console.error
  console.error = function () { errs.push(Array.prototype.join.call(arguments, ' ')) }
  let started
  try {
    started = await h.callTool('vibe_v5_start', { problem: PROBLEM, researcherCount: 4, academician: false })
  } finally { console.error = origErr }
  assert(started.ok === true, 'the institute still founds a partial team when the host refuses members (' + JSON.stringify(started).slice(0, 140) + ')')
  assert(h.spawns.length === CAP, 'only the members the host accepted were created (spawns=' + h.spawns.length + ')')
  const capLines = errs.filter(l => /maxActiveSubagents/.test(l))
  assert(capLines.length === 1, 'ONE actionable line for the whole founding round, not one per refused member (got ' + capLines.length + ')')
  assert(capLines.length === 1 && /ACTIVATION_LIMIT_REACHED/.test(capLines[0]),
    'the line names the host ceiling and the parameter that raises it: ' + String(capLines[0]).slice(0, 160))
  const st = await h.callTool('vibe_v5_status', {})
  const refused = st.members.filter(m => m.phase === 'failed')
  assert(refused.length === 2, 'the refused members are recorded as failed, not left active (got ' + refused.length + ')')
  assert(refused.every(m => /maxActiveSubagents/.test(m.error)), 'each failed record carries the cap, not the opaque host string: ' + JSON.stringify(refused.map(m => m.error)).slice(0, 200))
  assert(refused.every(m => m.busy !== true), 'no refused member is left marked busy')
  // Once the ceiling is KNOWN, a refused provisioning must not even reach the host.
  const callsBefore = hostCalls
  const hired = await h.callTool('vibe_v5_hire', { purpose: '被上限拒绝', initial_task: 'x' }, h.childAgent(h.childOf('r-1')))
  assert(hired.ok === false && hired.code === 'ACTIVATION_LIMIT_REACHED', 'hire reports the host cap by its typed code (' + JSON.stringify(hired).slice(0, 160) + ')')
  assert(/maxActiveSubagents/.test(hired.message || ''), 'the hire failure names maxActiveSubagents, not the opaque host string')
  assert(hostCalls === callsBefore, 'the host was NOT asked again once the ceiling was known (skip-before-spawn; hostCalls=' + hostCalls + ')')
  // The refused work is QUEUED, not lost: freeing a slot (fire a member) lets the next round retry.
  await h.callTool('vibe_v5_fire', { id: 'r-1', reason: 'cap test' })
  const resumed = await h.callTool('vibe_v5_resume', {})
  assert(resumed.ok === true && resumed.respawned >= 1, 'a slot freed by firing a member lets resume rebuild a capped member (respawned=' + (resumed && resumed.respawned) + ')')
  const st2 = await h.callTool('vibe_v5_status', {})
  assert(st2.members.filter(m => m.phase === 'active' && m.childId).length === CAP, 'the institute is back at the host ceiling (active=' + st2.members.filter(m => m.phase === 'active').map(m => m.id).join(',') + ')')
}

// ---------- 16. a state file that was never loaded must never be overwritten (audit H1) --------
console.log('\n[16] a pre-seeded snapshot is ADOPTED, never overwritten with an empty institute')
{
  // Round A H1. Ported from the reproduction that lived outside the repository
  // (`_oneoff/audit241-v5-overwrite.mjs`): a host with no `sandboxPolicy` service (the supported
  // case the e2e harness itself models) used to latch the DEFAULT path on its first read, after
  // which `configure {institute:'alpha'}` wrote an EMPTY institute over alpha's real file.
  const ws = mkdtempSync(join(tmpdir(), 'vibe-v5-seed-'))
  const seedFile = join(ws, 'VibeMath', 'Projects', 'default', 'Institutes', 'alpha', 'State', 'alpha.v5state.json')
  mkdirSync(dirname(seedFile), { recursive: true })
  const seeded = {
    v: 1,
    institutes: {
      'default::alpha': {
        key: 'default::alpha', project: 'default', institute: 'alpha', createdAt: 1, phase: 'active',
        problem: { id: 'p', statement: 'a real problem' }, params: {}, runId: 'run-x',
        members: ['acad', 'r-1', 'r-2', 'r-3', 't-1'].map((id) => ({
          id, kind: id === 'acad' ? 'academician' : id[0] === 'r' ? 'researcher' : 'temp',
          childId: '', phase: 'active', direction: 'd', hiredBy: '', term: '', provider: 'spawn',
          persona: 'CHARTER', error: '', createdAt: 1, dismissedAt: 0, dismissReason: '',
        })),
        tasks: [], messages: [], delivered: [], meetings: [], debates: [], verdicts: {}, formal: {},
        todo: [], queue: [], counters: { academician: 1, researcher: 3, temp: 1, task: 0, meeting: 0, message: 0, verify: 0 },
        lastProgressAt: 1, artifactCount: 7, diagnostics: [],
      },
    },
    order: ['default::alpha'],
  }
  writeFileSync(seedFile, JSON.stringify(seeded, null, 2), 'utf8')
  const h = makeHost({ pluginModule, ws })
  const c = await h.callTool('vibe_v5_configure', { institute: 'alpha', problem: 'a real problem' })
  assert(c.ok === true && c.institute === 'alpha', 'configure accepted the existing named institute (' + JSON.stringify(c).slice(0, 90) + ')')
  const after = JSON.parse(readFileSync(seedFile, 'utf8')).institutes['default::alpha']
  assert(after && after.members.length === 5, '★ the 5-member snapshot on disk survived configure (got ' + (after && after.members.length) + ')')
  assert(after.artifactCount === 7 && after.runId === 'run-x', 'the rest of the snapshot survived too (artifactCount=' + after.artifactCount + ', runId=' + after.runId + ')')
  const st = await h.callTool('vibe_v5_status', {})
  assert(st.key === 'default::alpha' && st.members.length === 5, 'status reads the ADOPTED institute, not an empty one (key=' + st.key + ', members=' + st.members.length + ')')
}

// ---------- 17. the NAMED institute's own file is really read (audit H1, second half) ----------
console.log('\n[17] a second host reads the NAMED institute from its own file')
{
  // Ported from `_oneoff/audit241-v5-key.mjs`. `configure` must read `Institutes/<name>/State/
  // <name>.v5state.json` — the audit's bug was that it silently created a NEW empty institute
  // under the requested name while the real file stayed untouched.
  const h1 = makeHost({ pluginModule })
  const c1 = await h1.callTool('vibe_v5_configure', { institute: 'alpha', problem: 'named institute' })
  assert(c1.ok === true && c1.institute === 'alpha', 'host A configured the named institute')
  const s1 = await h1.callTool('vibe_v5_status', {})
  assert(s1.key === 'default::alpha', 'host A reports key=default::alpha (got ' + s1.key + ')')
  await h1.callTool('vibe_v5_start', { researcherCount: 1 })
  await h1.settleSpawns()
  const namedFile = join(h1.WS, 'VibeMath', 'Projects', 'default', 'Institutes', 'alpha', 'State', 'alpha.v5state.json')
  const onDisk = () => { try { return JSON.parse(readFileSync(namedFile, 'utf8')).institutes['default::alpha'] } catch (e) { return null } }
  let snapshot = null
  for (let i = 0; i < 80 && !(snapshot && snapshot.members.length >= 2); i++) { snapshot = onDisk(); if (!(snapshot && snapshot.members.length >= 2)) await sleep(25) }
  assert(!!snapshot && snapshot.members.length >= 2, 'host A persisted the institute into the file NAMED AFTER IT (' + JSON.stringify(snapshot && snapshot.members.map(m => m.id)) + ')')
  const ids = (snapshot || { members: [] }).members.map(m => m.id)
  // A fresh host (fresh module instance) over the SAME workspace: this is what a user restarting
  // DSH sees. It must adopt the institute, not found a second empty one.
  const h2 = makeHost({ pluginModule, ws: h1.WS })
  const c2 = await h2.callTool('vibe_v5_configure', { institute: 'alpha', problem: 'named institute' })
  assert(c2.ok === true, 'host B configured the same named institute (' + JSON.stringify(c2).slice(0, 90) + ')')
  const s2 = await h2.callTool('vibe_v5_status', {})
  assert(s2.key === 'default::alpha' && s2.backend === 'file', 'host B reports the named institute over the file backend (key=' + s2.key + ', backend=' + s2.backend + ')')
  assert(ids.length > 0 && ids.every(id => s2.members.some(m => m.id === id)),
    '★ host B READ the existing members instead of starting empty (got ' + JSON.stringify(s2.members.map(m => m.id)) + ', expected to include ' + JSON.stringify(ids) + ')')
  const resumed = await h2.callTool('vibe_v5_resume', {})
  assert(resumed.ok === true, 'resume on the adopted institute succeeded (' + JSON.stringify(resumed).slice(0, 120) + ')')
}

// ---------- 18. a FAILED turn: stopReason=error, lastAssistantMessage OMITTED -------------------
console.log('\n[18] a turn ending with stopReason=error is recorded, with or without output')
{
  // The real host emits `stopReason:'error'` for a failed turn and OMITS `lastAssistantMessage`
  // when there is nothing to report (dsh-subagent index.js:268-278/317-324). Every other mock in
  // the suite fires 'completed' WITH a message, so this branch — and the omission it must survive —
  // was never executed in CI (audit A-7).
  const h = makeHost({ pluginModule })
  const chatText = () => {
    const dir = join(h.WS, 'VibeMath', 'Projects', 'default', 'Institutes', 'institute', 'Shared', 'Chat')
    return existsSync(dir) ? readdirSync(dir).filter(f => f.endsWith('.md')).map(f => readFileSync(join(dir, f), 'utf8')).join('\n') : ''
  }
  // The exact host event, with the field ABSENT (not an empty array).
  const fireBare = (childId, stopReason) => { for (const fn of h.listeners['subagent/end'] || []) fn({ id: childId, runId: 'r', provider: 'spawn', local: true, stopReason }) }
  await h.callTool('vibe_v5_start', { problem: PROBLEM, researcherCount: 1 })
  await h.settleSpawns()
  // Wake r-1 first: an end for a member with no in-flight token is ignored BY DESIGN (the
  // idempotence guard), so without this the error branch would be unreachable.
  await h.callTool('vibe_v5_say', { to: 'r-1', text: '请回报进展。' }, h.childAgent(h.childOf('acad')))
  await sleep(40)
  const st0 = await h.callTool('vibe_v5_status', {})
  assert((st0.members.find(m => m.id === 'r-1') || {}).busy === true, 'precondition: r-1 has a turn in flight')
  const before = chatText().length
  fireBare(h.childOf('r-1'), 'error')
  await sleep(80)
  const written = chatText().slice(before)
  const seg = written.indexOf('【异常】') === -1 ? '' : written.slice(written.indexOf('【异常】'), written.indexOf('【异常】') + 400)
  const line = (seg.match(/【异常】[^\n]*/) || [''])[0]
  assert(/【异常】r-1/.test(line) && /error/.test(line), '★ a failed turn is recorded in the group chat as 【异常】 for its OWNER: ' + JSON.stringify(line.slice(0, 120)))
  assert(seg.indexOf('最后输出') === -1, 'an OMITTED lastAssistantMessage adds no phantom output text')
  const st1 = await h.callTool('vibe_v5_status', {})
  assert((st1.members.find(m => m.id === 'r-1') || {}).busy !== true, 'the failed member is not left marked busy')
  assert(st1.running === true, 'the institute keeps running after a failed turn')
  // And the SAME branch WITH output must carry it — otherwise the two assertions above could hold
  // for a handler that only ever writes the member id.
  await h.callTool('vibe_v5_say', { to: 'r-1', text: '再来一次。' }, h.childAgent(h.childOf('acad')))
  await sleep(40)
  const mark = chatText().length
  h.fireEnd(h.childOf('r-1'), { progress: 'partial text before the failure' }, 'max-tokens')
  await sleep(80)
  const after = chatText().slice(mark)
  const idx2 = after.indexOf('【异常】')
  const seg2 = idx2 === -1 ? '' : after.slice(idx2, idx2 + 400)
  const line2 = (seg2.match(/【异常】[^\n]*/) || [''])[0]
  assert(/max-tokens/.test(line2) && /最后输出/.test(line2) && /partial text before the failure/.test(seg2),
    '★ a non-completed turn WITH output carries that output and its stop reason: ' + JSON.stringify(seg2.slice(0, 140)))
}

// ---------- 19. two proposals in the SAME tick are never lost -------------------
console.log('\n[19] concurrent propose_verify: the durable queue must not lose one')
{
  // The verify queue was mutated with a whole-array read-modify-write (`inst().queue.slice()`,
  // push, `await putQueue(q)`). Two members proposing in the same tick both read the same array
  // and each committed its own copy, so the last writer won and the first proposal vanished from
  // the durable queue with BOTH calls reporting ok:true. The mutation now happens inside the
  // event fold (`appendToQueue`), so no same-tick append can overwrite another.
  const h = makeHost({ pluginModule })
  await h.callTool('vibe_v5_start', { problem: PROBLEM, researcherCount: 1 })
  await h.settleSpawns()
  const who = h.childAgent(h.childOf('r-1'))
  const [pa, pb] = await Promise.all([
    h.callTool('vibe_v5_propose_verify', { target: 'p-race-a', kind: 'proposition', reason: 'race A' }, who),
    h.callTool('vibe_v5_propose_verify', { target: 'p-race-b', kind: 'proposition', reason: 'race B' }, who),
  ])
  assert(pa.ok === true && pb.ok === true, 'both concurrent proposals report ok (the buggy code reported ok for the lost one too)')
  const s = await h.callTool('vibe_v5_status', {})
  const seen = (s.verify ? [s.verify.target] : []).concat(s.verifyQueue)
  assert(seen.indexOf('p-race-a') !== -1 && seen.indexOf('p-race-b') !== -1,
    '★ neither same-tick proposal is lost: each is in-flight or queued (verify=' + JSON.stringify(s.verify && s.verify.target) + ', queue=' + JSON.stringify(s.verifyQueue) + ')')
  await sleep(30)
  const st = JSON.parse(readFileSync(statePathOf(h.WS), 'utf8'))
  const inst = st.institutes[Object.keys(st.institutes)[0]]
  const durable = (inst.queue || []).map(q => q.target)
  const open = Object.keys(inst.verdicts || {}).filter(k => !inst.verdicts[k].closed)
  const bothDurable = (durable.indexOf('p-race-a') !== -1 || open.indexOf('p-race-a') !== -1) &&
    (durable.indexOf('p-race-b') !== -1 || open.indexOf('p-race-b') !== -1)
  assert(bothDurable, '★ the durable state file keeps both as well (queue=' + JSON.stringify(durable) + ', open verdicts=' + JSON.stringify(open) + ')')
}

// ---------- 20. invalid numeric params are clamped, not silently destructive ----------
console.log('\n[20] invalid numeric params are clamped instead of silently destructive')
{
  // `compactThreshold <= 0` made EVERY round look over the threshold (a permanent compaction
  // directive), `verdictMaxRounds < 1` collapsed every debate to one round, and `chatDigestMax < 1`
  // emptied the digest bucket. `normalizeParams` now applies the same discipline the durations use.
  const h = makeHost({ pluginModule })
  await h.callTool('vibe_v5_start', { problem: PROBLEM, researcherCount: 1 })
  await h.settleSpawns()
  const r = await h.callTool('vibe_v5_set', { verdictMaxRounds: 0, chatDigestMax: -3, compactThreshold: 0 })
  assert(r.ok === true && r.params.verdictMaxRounds === 1, 'verdictMaxRounds=0 floors at 1 (got ' + r.params.verdictMaxRounds + ')')
  assert(r.params.chatDigestMax === 1, 'chatDigestMax=-3 floors at 1 (got ' + r.params.chatDigestMax + ')')
  assert(r.params.compactThreshold === 66, 'compactThreshold=0 falls back to the default 66 (got ' + r.params.compactThreshold + ')')
}

// ---------- 21. an office-only tool never impersonates the office for an unknown caller ----
console.log('\n[21] office-only tools refuse a caller that is neither a member nor the session root')
{
  // `memberIdOfAgent` answers 'office' for the root AND '' for an unrelated descendant, and
  // `isOffice('')` used to be true — so the old handlers fell back to the office and let any
  // unresolvable caller convene meetings / hire / fire / ASSIGN / NUDGE / create tasks as the
  // office (audit L6 and its follow-up). `officeCaller` now refuses, every writing tool resolves
  // through it, and `isOffice` itself only accepts the literal 'office'.
  const h = makeHost({ pluginModule })
  await h.callTool('vibe_v5_start', { problem: PROBLEM, researcherCount: 1 })
  await h.settleSpawns()
  const ghost = h.childAgent('c-nobody')
  const mtg = await h.callTool('vibe_v5_meeting', { agenda: '冒充所办', kind: 'sync' }, ghost)
  assert(mtg.ok === false && mtg.code === 'V5_MEMBER_NOT_FOUND',
    'meeting is refused for a caller that is not a member or the session root (' + JSON.stringify(mtg).slice(0, 90) + ')')
  const res = await h.callTool('vibe_v5_add_researcher', { direction: 'x' }, ghost)
  assert(res.ok === false && res.code === 'V5_MEMBER_NOT_FOUND',
    'add_researcher is refused for the same caller (' + JSON.stringify(res).slice(0, 90) + ')')
  // The whole family of writing tools must refuse that caller, not just the office-only ones:
  // each of these used to receive '' from memberIdOfAgent and treat it as the office. A REAL task
  // is opened first so the ghost's task_update / prioritize have live state to damage.
  const t1 = await h.callTool('vibe_v5_task_create', { subject: '真实任务' })
  assert(t1.ok === true, 'a real caller can still open a task (' + JSON.stringify(t1).slice(0, 90) + ')')
  const boardBefore = (await h.callTool('vibe_v5_task_list', {})).tasks.length
  const ghostWrites = [
    ['vibe_v5_assign', { subject: '冒充分派', to: 'r-1', why: 'w', acceptance: 'a' }],
    ['vibe_v5_nudge', { to: 'r-1', why: 'w' }],
    ['vibe_v5_task_create', { subject: '冒充所办建的任务' }],
    ['vibe_v5_task_update', { task_id: t1.task.id, expected_revision: 1, action: 'delete' }],
    ['vibe_v5_prioritize', { order: [{ task_id: t1.task.id, priority: 9 }], why: 'w' }],
    ['vibe_v5_propose_verify', { target: 'p-ghost', kind: 'proposition', reason: 'r' }],
    ['vibe_v5_lean_run', { file: 'Formal/ghost.lean' }],
  ]
  for (const [name, args] of ghostWrites) {
    const r = await h.callTool(name, args, ghost)
    assert(r.ok === false && r.code === 'V5_MEMBER_NOT_FOUND',
      name + ' is refused for the unidentifiable caller (' + JSON.stringify(r).slice(0, 90) + ')')
  }
  const boardAfter = await h.callTool('vibe_v5_task_list', {})
  const t1After = boardAfter.tasks.find((t) => t.id === t1.task.id)
  assert(boardAfter.tasks.length === boardBefore,
    'no refused write reached the board (before=' + boardBefore + ', after=' + boardAfter.tasks.length + ')')
  assert(t1After && t1After.status !== 'deleted', 'the refused task_update did not delete a real task')
  assert(t1After && t1After.priority === 0, 'the refused prioritize did not reorder a real task (priority=' + (t1After && t1After.priority) + ')')
  // ...and the real identities still work: the office signs as the office, a member acts as itself.
  const asgOffice = await h.callTool('vibe_v5_assign', { subject: '所办分派', to: 'r-1', why: 'w', acceptance: 'a' })
  assert(asgOffice.ok === true && asgOffice.task && asgOffice.task.assignedBy === 'office',
    'the office still assigns and is signed as office (' + JSON.stringify(asgOffice).slice(0, 110) + ')')
  const tcOffice = await h.callTool('vibe_v5_task_create', { subject: '所办任务' })
  assert(tcOffice.ok === true && tcOffice.task.createdBy === 'office', 'the office task_create still records createdBy=office')
  const nudgeAcad = await h.callTool('vibe_v5_nudge', { to: 'r-1', why: '院士督办' }, h.childAgent(h.childOf('acad')))
  assert(nudgeAcad.ok === true, 'the academician still nudges (' + JSON.stringify(nudgeAcad).slice(0, 90) + ')')
  const office = await h.callTool('vibe_v5_meeting', { agenda: '所办直接开会', kind: 'sync' })
  assert(office.ok === true, 'the real office (session root) still convenes a meeting (' + JSON.stringify(office).slice(0, 90) + ')')
}

console.log('')
console.log('passed=' + passed + ' failed=' + failed)
if (failed) { console.error('FAILURES:'); for (const f of failures) console.error('  - ' + f); process.exit(1) }
console.log('ALL GREEN')
process.exit(0)

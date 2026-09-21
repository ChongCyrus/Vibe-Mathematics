// ============================================================
// V5 ROUND-2 E2E — the behaviour paths the first suite never exercised:
//   · the hardened JSON FALLBACK backend (host without sessionProjections)
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
//   · session-log REPLAY reproduces the institute state in a new session
// Run: node e2e-v5-round2.test.mjs
// ============================================================
import { mkdtempSync, existsSync, readdirSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname, isAbsolute } from 'node:path'

const PLUGIN = new URL('./vibe-math-v5/vibe-math-v5.js', import.meta.url)
let passed = 0, failed = 0
const failures = []
const assert = (c, m) => { if (c) { passed++; console.log('  ok - ' + m) } else { failed++; failures.push(m); console.error('  FAIL - ' + m) } }
const sleep = ms => new Promise(r => setTimeout(r, ms))

function makeProjectionRegistry() {
  const units = new Map()
  const cells = new Map()
  const cellMap = (sess) => { const id = String(sess.id); let m = cells.get(id); if (!m) { m = new Map(); cells.set(id, m) } return m }
  return {
    register(def) { units.set(def.key, def); return () => { units.delete(def.key) } },
    stateOf(session, key) {
      const def = units.get(key); if (!def) return undefined
      const m = cellMap(session)
      if (!m.has(key)) m.set(key, def.init(session.header, 0))
      return m.get(key)
    },
    checkpoint(session) { const o = {}; const m = cellMap(session); for (const [k, d] of units) o[k] = { ver: d.stateVersion, seq: session.seq, val: m.get(k) }; return o },
    _drive(session, event) {
      const m = cellMap(session)
      for (const [k, def] of units) {
        const cur = m.has(k) ? m.get(k) : def.init(session.header, 0)
        let next; try { next = def.apply(cur, event) } catch (e) { next = cur }
        m.set(k, next)
      }
    },
  }
}

function makeSession(id, parentSession) {
  const events = []
  const s = {
    id,
    header: { version: 1, id, createdAt: Date.now(), cwd: null, parentSession, isSeeded: false },
    inheritedEventCount: 0,
    get seq() { return events.length },
    append(type, data) { const ev = { type, data, seq: events.length, time: Date.now() }; events.push(ev); this._drive(ev); return ev },
    deriveMessages() { return [] },
    snapshotEvents(from) { return events.slice(from || 0) },
    ownEvents() { return events.slice() },
    _events: events,
    _drive: null,
  }
  return s
}

/** A fresh host+plugin instance. `withProjections:false` exercises the JSON fallback. */
function makeHost(opts) {
  const o = opts || {}
  const WS = o.ws || mkdtempSync(join(tmpdir(), 'vibe-v5r2-'))
  const projections = o.withProjections === false ? undefined : makeProjectionRegistry()
  const listeners = {}, toolRegs = [], commandRegs = [], spawns = [], wakes = [], interrupts = [], drains = []
  const liveAgents = new Map()

  const ctx = {
    get(name) {
      if (name === 'sessionProjections') return projections
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
    sessions: { async flush() { return true } },
    subagents: {
      list() { return ['spawn'] },
      async startContinuable({ label, request }) {
        const id = 'c' + (spawns.length + 1)
        const childSession = makeSession(id, 'sess-A'); childSession.header.cwd = WS
        liveAgents.set(id, { id, session: childSession, options: request && request.agentOptions })
        spawns.push({ label, request, childId: id, persona: request && request.persona, ended: false })
        if (projections) childSession._drive = (ev) => projections._drive(childSession, ev)
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
  if (projections) ROOT_SESSION._drive = (ev) => projections._drive(ROOT_SESSION, ev)

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
  return { WS, ctx, ROOT, ROOT_SESSION, projections, spawns, wakes, interrupts, drains, toolRegs, commandRegs, listeners, callTool, childAgent, fireEnd, spawnOf, childOf, labelOf, kindOf, settleSpawns, drain, peekWakeOf, set plannedVotes(v) { plannedVotes = v }, get plannedVotes() { return plannedVotes }, set solvePlan(v) { solvePlan = v } }
}

const pluginModule = await import(PLUGIN.href + '?t=' + Date.now())
const PROBLEM = '证明素数有无穷多个'

// ============================================================
console.log('-- V5 round-2 e2e --')

// ---------- 1. the hardened JSON FALLBACK backend ----------
console.log('\n[1] fallback backend (host without sessionProjections)')
{
  const h = makeHost({ pluginModule, withProjections: false })
  const st = await h.callTool('vibe_v5_start', { problem: PROBLEM, researcherCount: 2 })
  assert(st.ok === true, 'start works without sessionProjections (fallback path)')
  const s0 = await h.callTool('vibe_v5_status', {})
  assert(s0.backend === 'file', 'status reports the file backend (got ' + s0.backend + ')')
  await h.settleSpawns()
  const stFile = join(h.WS, 'VibeMath', 'Projects', 'default', 'Institutes', 'institute', 'State', 'institute.v5state.json')
  // the state file is written lazily (deferred stringify chain) — give it a tick
  for (let i = 0; i < 40 && !existsSync(stFile); i++) await sleep(10)
  assert(existsSync(stFile), 'the fallback persisted the institute state to State/institute.v5state.json')
  if (existsSync(stFile)) {
    const parsed = JSON.parse(readFileSync(stFile, 'utf8'))
    const inst = parsed.institutes['default::institute']
    assert(!!inst && inst.members.length === 3, 'the persisted fallback state holds 1 academician + 2 researchers (got ' + (inst ? inst.members.length : 'none') + ')')
  }
}

// ---------- 2. simulated PROCESS RESTART ----------
console.log('\n[2] simulated process restart (fresh host, fresh backend, same workspace)')
{
  const WS = mkdtempSync(join(tmpdir(), 'vibe-v5r2-restart-'))
  const h1 = makeHost({ pluginModule, withProjections: false, ws: WS })
  await h1.callTool('vibe_v5_start', { problem: PROBLEM, researcherCount: 2 })
  await h1.settleSpawns()
  const stFile = join(WS, 'VibeMath', 'Projects', 'default', 'Institutes', 'institute', 'State', 'institute.v5state.json')
  for (let i = 0; i < 40 && !existsSync(stFile); i++) await sleep(10)
  assert(existsSync(stFile), 'first process persisted its state')

  // a genuinely fresh host = new backend instance, empty in-memory state
  const h2 = makeHost({ pluginModule, withProjections: false, ws: WS })
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
  // settle the founding turn normally, then REPLAY the exact same end event
  const before = h.ROOT_SESSION._events.length
  h.fireEnd(cid, { progress: '唯一一次', record: [{ kind: 'proposition', id: 'dup-x', statement: 's', value: 0.5, motive: 'm', p: 0.5 }] })
  await sleep(40)
  const afterFirst = h.ROOT_SESSION._events.length
  h.fireEnd(cid, { progress: '重复投递', record: [{ kind: 'proposition', id: 'dup-x', statement: 's', value: 0.5, motive: 'm', p: 0.5 }] })
  await sleep(40)
  const afterSecond = h.ROOT_SESSION._events.length
  assert(afterSecond === afterFirst, 'a replayed end commits NOTHING new (' + afterFirst + ' -> ' + afterSecond + ' events)')
  assert(afterFirst > before, 'the first end did commit state')
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

// ---------- 14. session-log REPLAY reproduces state ----------
console.log('\n[14] session-log replay reproduces the institute in a new session')
{
  const h = makeHost({ pluginModule })
  await h.callTool('vibe_v5_start', { problem: PROBLEM, researcherCount: 2 })
  await h.settleSpawns()
  const s0 = await h.callTool('vibe_v5_status', {})
  const events = h.ROOT_SESSION._events.filter(e => String(e.type).indexOf('vibe5/') === 0)
  assert(events.length > 0, 'the session log holds institute events (' + events.length + ')')
  // replay those events into a brand-new session and read the state through a new root
  const replayed = makeSession('sess-REPLAY', undefined)
  replayed.header.cwd = h.WS
  replayed._drive = (ev) => h.projections._drive(replayed, ev)
  for (const e of events) replayed.append(e.type, e.data)
  const ROOT2 = { id: 'sess-REPLAY', options: {}, session: replayed }
  const s1 = await h.callTool('vibe_v5_status', {}, ROOT2)
  assert(s1.members.length === s0.members.length, 'replay reproduced the roster (' + s1.members.length + ' vs ' + s0.members.length + ')')
  assert(s1.quorum.m === s0.quorum.m, 'replay reproduced the quorum')
  assert(s1.tasks.length === s0.tasks.length, 'replay reproduced the task board')
  assert(s1.institute === s0.institute && s1.project === s0.project, 'replay reproduced the institute identity')
}

console.log('')
console.log('passed=' + passed + ' failed=' + failed)
if (failed) { console.error('FAILURES:'); for (const f of failures) console.error('  - ' + f); process.exit(1) }
console.log('ALL GREEN')
process.exit(0)

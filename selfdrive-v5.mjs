// ============================================================
// Vibe-Math-V5 SELF-DRIVING TEST — drives the REAL vibe-math-v5 plugin with a mock
// host, including a faithful mock of the HOST-ONLY session projection unit it relies
// on (register / eager fold on append / stateOf), so the projection storage path is
// actually exercised rather than stubbed out.
//
// Run: node selfdrive-v5.mjs   (temp workspace; assertions; non-zero exit on failure)
// ============================================================
import { mkdtempSync, existsSync, readdirSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname, isAbsolute } from 'node:path'

// V5_PLUGIN lets a sensitivity probe point this suite at a deliberately broken copy.
const PLUGIN = process.env.V5_PLUGIN
  ? new URL('file:///' + String(process.env.V5_PLUGIN).replace(/\\/g, '/'))
  : new URL('./vibe-math-v5/vibe-math-v5.js', import.meta.url)
const WS = mkdtempSync(join(tmpdir(), 'vibe-v5-'))
let passed = 0, failed = 0
const failures = []
const assert = (c, m) => { if (c) { passed++; console.log('  ok - ' + m) } else { failed++; failures.push(m); console.error('  FAIL - ' + m) } }
const sleep = ms => new Promise(r => setTimeout(r, ms))

// ---------- mock host: projection registry ----------
// Mirrors the contract the plugin depends on: register returns a disposer, every
// committed event is folded EAGERLY into every unit's cell, stateOf materialises a
// cell lazily with init().
function makeProjectionRegistry() {
  const units = new Map()
  const cells = new Map()
  function cellMap(sess) {
    const id = String(sess.id)
    let m = cells.get(id)
    if (!m) { m = new Map(); cells.set(id, m) }
    return m
  }
  return {
    register(def) {
      if (!def || typeof def.key !== 'string') throw new Error('projection: key required')
      units.set(def.key, def)
      return () => { units.delete(def.key) }
    },
    stateOf(session, key) {
      const def = units.get(key)
      if (!def) return undefined
      const m = cellMap(session)
      if (!m.has(key)) m.set(key, def.init(session.header, session.inheritedEventCount || 0))
      return m.get(key)
    },
    checkpoint(session) {
      const out = {}
      const m = cellMap(session)
      for (const [k, def] of units) out[k] = { ver: def.stateVersion, seq: session.seq, val: m.get(k) }
      return out
    },
    _drive(session, event) {
      const m = cellMap(session)
      for (const [k, def] of units) {
        const cur = m.has(k) ? m.get(k) : def.init(session.header, session.inheritedEventCount || 0)
        let next
        try { next = def.apply(cur, event) } catch (e) { next = cur }
        m.set(k, next)
      }
    },
    _units: units,
  }
}

const projections = makeProjectionRegistry()
const listeners = {}
const toolRegs = []
const commandRegs = []
const spawns = []
const wakes = []
const interrupts = []
const drains = []
const liveAgents = new Map()

function makeMockSession(id, parentSession) {
  const events = []
  const s = {
    id,
    header: { version: 1, id, createdAt: Date.now(), cwd: WS, parentSession, isSeeded: false },
    inheritedEventCount: 0,
    get seq() { return events.length },
    append(type, data) {
      const ev = { type, data, seq: events.length, time: Date.now() }
      events.push(ev)
      projections._drive(s, ev)
      return ev
    },
    deriveMessages() { return [] },   // non-surface events must never become messages
    snapshotEvents(from) { return events.slice(from || 0) },
    ownEvents() { return events.slice() },
    _events: events,
  }
  return s
}
const ROOT_SESSION = makeMockSession('sess-A', undefined)
const ROOT = { id: 'sess-A', options: { provider: 'mock', model: 'm' }, session: ROOT_SESSION, ctx: undefined }

const ctx = {
  get(name) {
    if (name === 'sessionProjections') return projections
    if (name === 'sandboxPolicy') return undefined
    if (name === 'compaction') return undefined
    if (name === 'subprocess') {
      return {
        async spawn({ argv }) {
          const script = argv[argv.length - 1] || ''
          if (/New-Item/.test(script)) {
            const paths = []
            const re = /'((?:[^']|'')*)'/g
            let m
            while ((m = re.exec(script)) !== null) paths.push(m[1].replace(/''/g, "'"))
            for (const p of paths) if (p && !/^-/.test(p)) mkdirSync(p, { recursive: true })
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
      const childSession = makeMockSession(id, 'sess-A')
      const agent = { id, session: childSession, options: request && request.agentOptions }
      liveAgents.set(id, agent)
      spawns.push({ label, request, childId: id, persona: request && request.persona, toolFilter: request && request.toolFilter, ended: false })
      return { childId: id, messageId: 'm' + spawns.length }
    },
    async sendMessage(parent, childId, blocks, opts) {
      wakes.push({ childId, blocks })
      return 'w' + wakes.length
    },
    interrupt(childId) { interrupts.push(childId) },
    async drainContinuableChildren(parent, ids) { drains.push(...ids); for (const i of ids) liveAgents.delete(i) },
  },
  agents: {
    roots() { return [ROOT] },
    get(id) { return id === 'sess-A' ? ROOT : liveAgents.get(id) },
    list() { return [ROOT, ...liveAgents.values()] },
  },
  fs: {
    async resolve(rel, opts) {
      const b = (opts && opts.cwd) || WS
      const p = (typeof rel === 'string' && isAbsolute(rel)) ? rel.replace(/\//g, '\\') : join(b, ...String(rel).split('/'))
      return { targetKey: p, displayPath: p }
    },
    async stat(t) { return existsSync(t.targetKey) ? { version: 'v1', type: 'file', size: 1 } : undefined },
    async readText(t) { return readFileSync(t.targetKey, 'utf8') },
    async writeText(t, c) { mkdirSync(dirname(t.targetKey), { recursive: true }); writeFileSync(t.targetKey, c, 'utf8') },
    async listDir(t) { if (!existsSync(t.targetKey)) return []; return readdirSync(t.targetKey, { withFileTypes: true }).map(e => ({ name: e.name, type: e.isDirectory() ? 'directory' : 'file' })) },
  },
}

const mod = await import(PLUGIN.href + '?t=' + Date.now())
const plugin = mod.default || mod
plugin.apply(ctx)

async function callTool(name, args, agent) {
  const spec = toolRegs.find(x => x.name === name)
  if (!spec) throw new Error('no tool ' + name)
  return JSON.parse(await spec.execute(args || {}, { agent: agent || ROOT }))
}
const childAgent = (childId) => liveAgents.get(childId) || { id: childId, session: { header: { parentSession: 'sess-A' } } }
function fireEnd(childId, reply, stopReason) {
  const blocks = reply === undefined ? [] : [{ type: 'text', text: '```json\n' + JSON.stringify(reply) + '\n```' }]
  for (const h of (listeners['subagent/end'] || [])) {
    h({ id: childId, runId: 'r', provider: 'spawn', local: true, stopReason: stopReason || 'completed', lastAssistantMessage: blocks })
  }
}
const settleAll = async () => { await sleep(30) }
const spawnOf = (memberId) => spawns.find(s => s.label.indexOf('vibe5 ' + memberId + ' ') !== -1)
const childOf = (memberId) => { const s = spawnOf(memberId); return s ? s.childId : memberId }
const wakeKindOf = (prompt) => {
  if (/【入职首轮/.test(prompt)) return 'initial'
  if (/【研究所会议/.test(prompt)) return 'meeting'
  if (/【求真表决/.test(prompt)) return 'verify'
  if (/【心跳检查/.test(prompt)) return 'checkpoint'
  return 'normal'
}
const memberLabelOf = (childId) => { const s = spawns.find(x => x.childId === childId); const m = s ? /vibe5 (\S+) /.exec(s.label) : null; return m ? m[1] : '' }

// A planned-vote table lets the driver answer verification prompts realistically.
let plannedVotes = null
let verifyProposals = []
async function settleSpawn(sp) {
  if (sp.ended) return
  sp.ended = true
  const who = memberLabelOf(sp.childId)
  if (who && !/^t-/.test(who)) {
    await callTool('vibe_v5_record_proposition', {
      id: 'p-' + who, title: '引理 ' + who, statement: '设 n>2 且存在整数解 x^n+y^n=z^n，则可由最小反例归约得矛盾。',
      value: 0.6, motive: '用于反证原命题', p: 0.8,
    }, childAgent(sp.childId))
  }
  fireEnd(sp.childId, { progress: who + '：初始见解——先做最小反例归约，再处理边界情形。', solved: false, contextPct: 10 })
  await settleAll()
}
async function settleAllSpawns() { for (const sp of spawns.slice()) await settleSpawn(sp) }

// Drive every queued wake: answer by the prompt's actual kind.
async function drainWakes(budget = 40) {
  let n = 0
  while (wakes.length && n < budget) {
    const w = wakes.shift()
    const prompt = (w.blocks && w.blocks[0] && w.blocks[0].text) || ''
    const kind = wakeKindOf(prompt)
    const who = memberLabelOf(w.childId)
    let reply
    if (kind === 'verify') {
      // Read the target from the JSON spec line the prompt ends with — parsing the
      // Chinese prose line would swallow the full-width colon into the id.
      const tm = /"target"\s*:\s*"([^"]+)"/.exec(prompt)
      const target = tm ? tm[1] : (verifyProposals[verifyProposals.length - 1] || 'p-r-1')
      const v = plannedVotes && plannedVotes.has(who) ? plannedVotes.get(who) : 0.5
      reply = { verdict: { target, verdict: v, reason: who + ' 的判断：' + (v === 1 ? '成立' : v === 0 ? '不成立' : '不确定') }, contextPct: 20 }
    } else if (kind === 'meeting') {
      reply = { input: who + '：我的意见已写在 Progress/ 里。', vote_solved: solvePlan === true, solved: solvePlan === true, contextPct: 20 }
    } else {
      reply = { progress: who + '：本轮继续推进最小反例路线。', solved: false, contextPct: 20 }
    }
    fireEnd(w.childId, reply)
    n++
    await settleAll()
  }
  return n
}
let solvePlan = null

// ============================================================
console.log('-- V5 self-drive --')

// ---------- founding ----------
const started = await callTool('vibe_v5_start', { problem: '证明：不存在整数解 x^n + y^n = z^n（n>2）的初等情形', researcherCount: 3 })
assert(started.ok === true, 'vibe_v5_start ok (' + JSON.stringify(started).slice(0, 150) + ')')
assert(spawns.length === 4, 'founded 1 academician + 3 researchers (got ' + spawns.length + ')')
assert(!!spawnOf('acad'), 'academician acad exists')
assert(['r-1', 'r-2', 'r-3'].every(r => !!spawnOf(r)), '3 permanent researchers r-1..r-3')
assert(spawns.every(s => typeof s.persona === 'string' && s.persona.length > 2000), 'every member got the full charter as its persona')
assert(spawns[0].persona.indexOf('progress.md') !== -1 && spawns[0].persona.indexOf('它的用途') !== -1,
  'charter carries the progress definition AND its purpose explanation')
assert(spawns[0].persona.indexOf('分派') !== -1 && spawns[0].persona.indexOf('边界') !== -1,
  'charter describes the academician as the organizational centre (duties + four boundaries)')
assert(spawns[0].persona.indexOf('m = 3') !== -1 || /至少有 m = \d+ 名有表决权者/.test(spawns[0].persona), 'charter states the m-vote rule with the live m')

const st0 = await callTool('vibe_v5_status', {})
assert(st0.backend === 'projection', 'durable state uses the session-projections backend (got ' + st0.backend + ')')
assert(st0.members.length === 4 && st0.members.filter(m => m.kind === 'researcher').length === 3, 'status roster is 1 academician + 3 researchers')
assert(ROOT_SESSION._events.some(e => String(e.type).indexOf('vibe5/') === 0), 'institute events are appended to the session log')
assert(ROOT_SESSION.deriveMessages().length === 0, 'institute events never enter the model history (zero context cost)')
assert(st0.quorum.m === 3 && st0.quorum.voterCount === 4, 'm = min(quorumCap=3, P=4) = 3 (got ' + st0.quorum.m + ')')
assert(st0.members.every(m => m.busy === true), 'every member is marked in-flight while its founding turn runs')

// founding turns complete
await settleAllSpawns()
let st1 = await callTool('vibe_v5_status', {})
assert(st1.members.every(m => m.busy === false), 'founding turns were processed (no member left marked busy)')
assert(st1.members.every(m => m.rounds >= 1), 'each member completed its founding round')
const propWritten = existsSync(join(WS, 'VibeMath', 'Projects', 'default', 'Institutes', 'institute', 'Members', 'r-1', 'Propos', 'p-r-1.md'))
assert(propWritten, 'per-member proposition library file was written (Members/r-1/Propos/p-r-1.md)')
const progWritten = existsSync(join(WS, 'VibeMath', 'Projects', 'default', 'Institutes', 'institute', 'Members', 'r-1', 'Progress', 'progress.md'))
assert(progWritten, 'per-member progress.md was written')

// missing-mandatory-fields refusal (the charter's three hard requirements)
const badRec = await callTool('vibe_v5_record_proposition', { statement: 'x', value: 0.5 }, childAgent(childOf('r-2')))
assert(badRec.ok === false && badRec.code === 'V5_INVALID_ARGUMENT', 'recording without motive/p is refused (three hard requirements enforced)')

// ---------- group chat fan-out / DM ----------
const sayR1 = await callTool('vibe_v5_say', { text: '各位，我建议先做最小反例归约。' }, childAgent(childOf('r-1')))
assert(sayR1.ok === true && sayR1.delivered === 3, 'group chat fans out to every OTHER active member (4 active - sender = 3; got ' + sayR1.delivered + ')')
const sayDM = await callTool('vibe_v5_say', { to: 'r-2', text: '私下问你一下。' }, childAgent(childOf('r-1')))
assert(sayDM.ok === true && sayDM.delivered === 1, 'a private message reaches exactly one member')
const selfMsg = await callTool('vibe_v5_say', { to: 'r-1', text: 'x' }, childAgent(childOf('r-1')))
assert(selfMsg.ok === false && selfMsg.code === 'V5_SELF_MESSAGE', 'messaging yourself is refused')

// ---------- temp workers ----------
const hired = await callTool('vibe_v5_hire', { purpose: '核对文献中的引理', initial_task: '核对第 3 节引理是否成立' }, childAgent(childOf('r-1')))
assert(hired.ok === true && /^t-\d+$/.test(hired.id || ''), 'a permanent researcher CAN hire a temp worker (got ' + JSON.stringify(hired).slice(0, 80) + ')')
await settleAllSpawns()
const tempHire = await callTool('vibe_v5_hire', { purpose: 'x', initial_task: 'y' }, childAgent(childOf(hired.id)))
assert(tempHire.ok === false && tempHire.code === 'V5_NOT_VOTER', 'a temp worker CANNOT hire (V5_NOT_VOTER)')
const tempVote = await callTool('vibe_v5_verdict', { target: 'p-r-2', verdict: 1, reason: '我觉得对' }, childAgent(childOf(hired.id)))
assert(tempVote.ok === false && tempVote.code === 'V5_NOT_VOTER', 'a temp worker CANNOT vote (V5_NOT_VOTER)')
const stT = await callTool('vibe_v5_status', {})
assert(stT.quorum.voterCount === 4 && stT.quorum.m === 3, 'the temp worker did NOT change the voter count or m')

// ---------- verification: the m-quorum boolean rule ----------
const target = 'p-r-1'
verifyProposals.push(target)
const prop = await callTool('vibe_v5_propose_verify', { target, kind: 'proposition', reason: '我已在库里给出完整证明' }, childAgent(childOf('r-1')))
assert(prop.ok === true, 'proposing verification is accepted')
// The proposal itself must kick the scheduler, so the object starts verifying without
// needing any unrelated event to drive a pass.
let sv = await callTool('vibe_v5_status', {})
assert(!!sv.verify, 'verification of ' + target + ' is in flight right after proposing (nobody has voted yet) — got ' +
  JSON.stringify({ verify: sv.verify, queue: sv.verifyQueue, undecided: sv.undecided, running: sv.running, autoDone: sv.autoDone, phase: sv.phase, meeting: sv.meeting, parked: sv.parkedMeeting, tasks: sv.tasks.length }))
if (sv.verify) {
  assert(sv.verify.m === 3 && sv.verify.P === 4, 'verification reports m=3 over P=4 voters')

  // Round: only ONE boolean vote (< m) must NOT verify.
  plannedVotes = new Map([['acad', 0.9], ['r-1', 1], ['r-2', 0.5], ['r-3', 0.7]])
  await drainWakes(4)   // exactly one round of 4 voters
  let sA = await callTool('vibe_v5_status', {})
  assert(sA.verified.indexOf(target) === -1, 'a single boolean vote (m-1=2 short) does NOT verify')
  assert(!!sA.verify, 'the verification is still open (abstentions do not settle it)')

  // Debate round: 1 vs 0 conflict must NOT verify.
  plannedVotes = new Map([['acad', 0], ['r-1', 1], ['r-2', 1], ['r-3', 1]])
  await drainWakes(4)
  let sB = await callTool('vibe_v5_status', {})
  assert(sB.verified.indexOf(target) === -1, 'a conflicting 1/0 assertion BLOCKS the verdict (no minority override)')

  // Final: three unanimous TRUE votes (m=3) DO verify.
  plannedVotes = new Map([['acad', 1], ['r-1', 1], ['r-2', 1], ['r-3', 1]])
  await drainWakes(4)
  let sC = await callTool('vibe_v5_status', {})
  if (!sC.verified.includes(target)) { await drainWakes(4); sC = await callTool('vibe_v5_status', {}) }
  assert(sC.verified.indexOf(target) !== -1, 'THREE unanimous TRUE votes (m=3) DID verify ' + target)
  const verifiedCard = join(WS, 'VibeMath', 'Projects', 'default', 'Institutes', 'institute', 'Verified', '命题', target + '.md')
  assert(existsSync(verifiedCard), 'Verified/命题/' + target + '.md was written')
  if (existsSync(verifiedCard)) {
    const card = readFileSync(verifiedCard, 'utf8')
    assert(/- 结论: 真/.test(card), 'the Verified card records the conclusion 真')
    assert(/名有表决权者一致判真/.test(card) && /m=3/.test(card), 'the Verified card records the m-vote basis (not "unanimous of all")')
  }
  const srcCard = join(WS, 'VibeMath', 'Projects', 'default', 'Institutes', 'institute', 'Members', 'r-1', 'Propos', 'p-r-1.md')
  assert(existsSync(srcCard) && /- 状态: 已验证·真/.test(readFileSync(srcCard, 'utf8')), 'the source card was rewritten to 已验证·真')
}

// ---------- the academician's organization powers ----------
const asg = await callTool('vibe_v5_assign', { subject: '核验 n=3 的情形', to: 'r-2', why: '你在同余方向最强', acceptance: '给出完整的模 9 分析' }, childAgent(childOf('acad')))
assert(asg.ok === true && asg.task && asg.task.ownerId === 'r-2', 'the academician CAN assign a task to a member')
assert(!!asg.task.why && !!asg.task.acceptance, 'the assignment records WHY and the acceptance criteria')
const asgNoWhy = await callTool('vibe_v5_assign', { to: 'r-3', why: '', acceptance: 'a' }, childAgent(childOf('acad')))
assert(asgNoWhy.ok === false, 'an assignment without a reason is refused')
const asgByR1 = await callTool('vibe_v5_assign', { subject: 'x', to: 'r-3', why: 'w', acceptance: 'a' }, childAgent(childOf('r-1')))
assert(asgByR1.ok === false && asgByR1.code === 'V5_NOT_ACADEMICIAN', 'a researcher CANNOT assign (V5_NOT_ACADEMICIAN)')
const nudgeBad = await callTool('vibe_v5_nudge', { to: 'r-3', why: 'w' }, childAgent(childOf('r-1')))
assert(nudgeBad.ok === false && nudgeBad.code === 'V5_NOT_ACADEMICIAN', 'a researcher CANNOT nudge (V5_NOT_ACADEMICIAN)')
const prioBad = await callTool('vibe_v5_prioritize', { order: [{ task_id: asg.task.id, priority: 5 }], why: 'x' }, childAgent(childOf('r-1')))
assert(prioBad.ok === false && prioBad.code === 'V5_NOT_ACADEMICIAN', 'a researcher CANNOT set priorities')
const prioOk = await callTool('vibe_v5_prioritize', { order: [{ task_id: asg.task.id, priority: 5 }], why: '先做这个' }, childAgent(childOf('acad')))
assert(prioOk.ok === true, 'the academician CAN set priorities')
const ov = await callTool('vibe_v5_overview', {}, childAgent(childOf('acad')))
assert(ov.ok === true && /编制/.test(ov.overview) && /任务板/.test(ov.overview), 'the academician CAN get the institute-wide overview')

// an assignment objection is broadcast (not silently swallowed)
fireEnd(childOf('r-2'), { reject_assign: { task_id: asg.task.id, why: '我手上有更紧急的方向' }, contextPct: 20 })
await settleAll()
const objectionDelivered = wakes.some(w => JSON.stringify(w.blocks).includes('反对分派'))
assert(objectionDelivered, 'an assignment objection is broadcast into the institute mail (not dropped)')

// ---------- task board CAS ----------
const t1 = await callTool('vibe_v5_task_create', { subject: '整理已知特例', description: 'n=3,4,5 的已知结论', write_scopes: ['Members/r-3/Propos'] }, childAgent(childOf('r-3')))
assert(t1.ok === true && t1.task.revision === 1, 'a member can open a task (revision 1)')
const stale = await callTool('vibe_v5_task_update', { task_id: t1.task.id, expected_revision: 99, action: 'claim' }, childAgent(childOf('r-3')))
assert(stale.ok === false && stale.code === 'V5_TASK_STALE_REVISION', 'a stale revision is refused (compare-and-set)')
const claimed = await callTool('vibe_v5_task_update', { task_id: t1.task.id, expected_revision: 1, action: 'claim' }, childAgent(childOf('r-3')))
assert(claimed.ok === true && claimed.task.ownerId === 'r-3', 'claiming sets the owner')
const blocked = await callTool('vibe_v5_task_create', { subject: '依赖前一个', description: 'd', blocked_by: [t1.task.id] }, childAgent(childOf('r-3')))
assert(blocked.ok === true && blocked.task.ready === false, 'a task with an incomplete blocker is not ready')
const claimBlocked = await callTool('vibe_v5_task_update', { task_id: blocked.task.id, expected_revision: 1, action: 'claim' }, childAgent(childOf('r-1')))
assert(claimBlocked.ok === false && claimBlocked.code === 'V5_TASK_BLOCKED', 'a blocked task cannot be claimed')
const cyc = await callTool('vibe_v5_task_update', { task_id: t1.task.id, expected_revision: 2, action: 'set_dependencies', blocked_by: [blocked.task.id] }, childAgent(childOf('r-3')))
assert(cyc.ok === false && cyc.code === 'V5_TASK_DEPENDENCY_CYCLE', 'a dependency cycle is refused')

// ---------- firing a temp worker is real ----------
const beforeFire = (await callTool('vibe_v5_status', {})).members.map(m => m.id)
const fireRes = await callTool('vibe_v5_fire', { id: hired.id, reason: '任务已完成' }, childAgent(childOf('r-1')))
assert(fireRes.ok === true && fireRes.dismissed === hired.id, 'the hirer CAN fire its own temp worker')
assert(interrupts.indexOf(childOf(hired.id)) !== -1, 'firing INTERRUPTS the temp worker\'s current turn')
assert(drains.indexOf(childOf(hired.id)) !== -1, 'firing RELEASES its resident continuable child (real release, not just a flag)')
const afterFire = (await callTool('vibe_v5_status', {})).members.find(m => m.id === hired.id)
assert(afterFire && afterFire.phase === 'dismissed', 'the dismissed member is marked dismissed')
const reHire = await callTool('vibe_v5_hire', { purpose: '新的核对任务', initial_task: '核对第 4 节' }, childAgent(childOf('r-1')))
assert(reHire.ok === true && reHire.id !== hired.id, 'a re-hire gets a NEW id (ids are never reused): ' + hired.id + ' -> ' + reHire.id)
await settleAllSpawns()   // the new temp's founding turn must complete, or it blocks a meeting as a busy ghost
const fireForeign = await callTool('vibe_v5_fire', { id: reHire.id, reason: 'x' }, childAgent(childOf('r-3')))
assert(fireForeign.ok === false, 'a researcher CANNOT fire someone else\'s temp worker')

// ---------- human-readable mirrors are write-only snapshots ----------
const rosterMirror = join(WS, 'VibeMath', 'Projects', 'default', 'Institutes', 'institute', 'Institutes.md')
assert(existsSync(rosterMirror), 'the human-readable roster mirror (Institutes.md) was written')
if (existsSync(rosterMirror)) {
  const rosterText = readFileSync(rosterMirror, 'utf8')
  assert(rosterText.includes(hired.id) && /已除名/.test(rosterText), 'the roster mirror lists the dismissed member under 已除名 (ids are never reused)')
  assert(new RegExp('m = ' + stT.quorum.m).test(rosterText), 'the roster mirror states the live quorum m')
}
const boardMirror = join(WS, 'VibeMath', 'Projects', 'default', 'Institutes', 'institute', 'Shared', 'TaskBoard.md')
assert(existsSync(boardMirror), 'the human-readable task board mirror (Shared/TaskBoard.md) was written')
assert(existsSync(join(WS, 'VibeMath', 'Projects', 'default', 'Institutes', 'institute', 'State', 'README.md')),
  'State/ carries a README stating that the authoritative state is the session-log projection')

// ---------- the institute stops only on a unanimous solve vote ----------
solvePlan = false
const mtg = await callTool('vibe_v5_meeting', { agenda: '是否已解决原问题？', kind: 'solve-vote' }, childAgent(childOf('acad')))
assert(mtg.ok === true, 'the academician can convene a meeting')
await drainWakes()
let sNo = await callTool('vibe_v5_status', {})
assert(sNo.autoDone === false && sNo.running === true, 'a non-unanimous solve vote does NOT stop the institute')

solvePlan = true
const m2 = await callTool('vibe_v5_meeting', { agenda: '再次表决是否已解决', kind: 'solve-vote' }, childAgent(childOf('acad')))
assert(m2.ok === true, 'the second solve-vote meeting is requested (' + JSON.stringify(m2).slice(0, 100) + ')')
for (let i = 0; i < 60; i++) {
  const s = await callTool('vibe_v5_status', {})
  if (s.autoDone) break
  await drainWakes(6)
  await sleep(15)
}
const sDone = await callTool('vibe_v5_status', {})
assert(sDone.autoDone === true, 'a unanimous solve vote from every voting member DOES stop the institute — ' +
  JSON.stringify({ autoDone: sDone.autoDone, running: sDone.running, meeting: sDone.meeting, parked: sDone.parkedMeeting, solveVotes: sDone.solveVotes }))
assert(sDone.running === false, 'scheduling halted after the unanimous solve vote')
const concl = existsSync(join(WS, 'VibeMath', 'Projects', 'default', 'Institutes', 'institute', 'Problems', 'conclusion.md'))
assert(concl, 'a conclusion record was written on completion')

// ---------- resume must not resurrect a concluded institute ----------
const res = await callTool('vibe_v5_resume', {})
assert(res.ok === false, 'resume refuses to resurrect a concluded institute')

// ---------- /v5 command is registered ----------
assert(commandRegs.some(c => c.name === 'v5'), 'the /v5 slash command is registered')

console.log('')
console.log('passed=' + passed + ' failed=' + failed)
if (failed) { console.error('FAILURES:'); for (const f of failures) console.error('  - ' + f); process.exit(1) }
console.log('ALL GREEN')
process.exit(0)

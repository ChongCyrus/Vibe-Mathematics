// ============================================================
// Vibe-Math-V5 SELF-DRIVING TEST — drives the REAL vibe-math-v5 plugin with a mock
// host. The host deliberately offers NO session services: v5 keeps its durable state in
// the hardened JSON file State/<institute>.v5state.json and appends NOTHING to the host
// session log (an unknown event type in the log makes the session unresumable, because
// DSH's session persistence refuses to load it unless the writer marked it `ignorable`
// — and `Session.append` cannot set that field).
//
// Run: node tests/selfdrive-v5.mjs   (temp workspace; assertions; non-zero exit on failure)
// ============================================================
import { mkdtempSync, existsSync, readdirSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname, isAbsolute } from 'node:path'

// V5_PLUGIN lets a sensitivity probe point this suite at a deliberately broken copy.
const PLUGIN = process.env.V5_PLUGIN
  ? new URL('file:///' + String(process.env.V5_PLUGIN).replace(/\\/g, '/'))
  : new URL('../vibe-math-v5/vibe-math-v5.js', import.meta.url)
const WS = mkdtempSync(join(tmpdir(), 'vibe-v5-'))
let passed = 0, failed = 0
const failures = []
const assert = (c, m) => { if (c) { passed++; console.log('  ok - ' + m) } else { failed++; failures.push(m); console.error('  FAIL - ' + m) } }
const sleep = ms => new Promise(r => setTimeout(r, ms))

// The durable authority. Reading it back is how this suite observes "committed": the
// plugin no longer writes anything a test could read out of the session log.
const V5STATE = join(WS, 'VibeMath', 'Projects', 'default', 'Institutes', 'institute', 'State', 'institute.v5state.json')
const readV5State = () => { try { return JSON.parse(readFileSync(V5STATE, 'utf8')) } catch (e) { return null } }
// Commits are applied to the in-memory snapshot at once but WRITTEN through a deferred per-file
// chain, so a test that wants to observe a commit must wait for it to land on disk.
const waitV5State = async (pred, tries = 80) => {
  let s = readV5State()
  for (let i = 0; i < tries; i++) {
    if (s && (!pred || pred(s))) return s
    await sleep(10)
    s = readV5State()
  }
  return s
}

const listeners = {}
const toolRegs = []
const commandRegs = []
const spawns = []
const wakes = []
const interrupts = []
const drains = []
const liveAgents = new Map()

// The session records whatever it is handed, so the suite can assert that it was handed NOTHING.
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
      return ev
    },
    deriveMessages() { return [] },   // nothing may enter the model history
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
  // The final paper is a phase of its own (it runs BEFORE the run is marked complete):
  // each member writes its own part, cross-reviews another member's part, and the
  // academician finalises.
  if (/【最终论文·撰写/.test(prompt)) return 'paper-write'
  if (/【最终论文·互审/.test(prompt)) return 'paper-review'
  if (/【最终论文·定稿/.test(prompt)) return 'paper-final'
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

// Answer ONE queued wake, according to the prompt's actual kind.
async function answerWake(w) {
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
  } else if (kind === 'paper-write') {
    reply = {
      paper_part: {
        title: who + ' 的贡献', solution: who + '：原问题的完整解法——最小反例归约（仅写有证据的部分）。',
        methods: who + ' 的方法与经验：归约 + 边界情形枚举。', rules: who + ' 归纳的规律：先最小反例，再边界。',
        limits: who + ' 的局限：部分边界情形仍未定论（已显式标注）。',
        evidence: ['Members/' + who + '/Propos/p-' + who + '.md'],
      }, contextPct: 20,
    }
  } else if (kind === 'paper-review') {
    const om = /待审部分（([^）]*)）/.exec(prompt)
    reply = { paper_review: { of: om ? om[1] : '', deliverable: true, comments: who + '：证据与表决记录一致，术语清楚，可交付。' }, contextPct: 20 }
  } else if (kind === 'paper-final') {
    reply = { paper_final: { decision: 'deliverable', note: who + '：已核对合并稿与互审意见，统一了术语与符号，可定稿。', conclusion: '原问题在题设范围内得证。' }, contextPct: 20 }
  } else {
    reply = { progress: who + '：本轮继续推进最小反例路线。', solved: false, contextPct: 20 }
  }
  fireEnd(w.childId, reply)
  await settleAll()
  return kind
}
// Drive every queued wake: answer by the prompt's actual kind.
async function drainWakes(budget = 40) {
  let n = 0
  while (wakes.length && n < budget) { await answerWake(wakes.shift()); n++ }
  return n
}
let solvePlan = null

// Answer exactly ONE voting round: keep pulling wakes (heartbeats and work prompts also
// sit in the queue) until `n` VERIFY prompts have been answered, then stop.
//
// A fixed `drainWakes(n)` budget is not enough — it can stop before every voter has
// answered, and an assertion like "this must not be verified yet" then passes vacuously
// however badly the quorum rule is broken. (Proven: weakening the m floor left this suite
// GREEN.) Equally, a helper that loops until the verification CLOSES would silently burn
// through every debate round, so this stops the moment the last voter of one round has
// answered.
async function drainVerifyRound(n) {
  let answered = 0
  for (let guard = 0; guard < n * 6 && answered < n; guard++) {
    const idx = wakes.findIndex(w => wakeKindOf((w.blocks && w.blocks[0] && w.blocks[0].text) || '') === 'verify')
    if (idx === -1) {
      if (!wakes.length) break
      await answerWake(wakes.shift())
      continue
    }
    const w = wakes.splice(idx, 1)[0]
    await answerWake(w)
    answered++
  }
  return answered
}

// ============================================================
console.log('-- V5 self-drive --')

// ---------- founding ----------
// F6 tightening (staff): the persona parameter must actually REACH the member prompts. MEASURED: a
// single-site mutant that drops `params.staffPersona` (`const extra = ''`) is caught by NO current
// suite (audit-participant-set-parity ok, audit-persona-sensitivity ok, audit-persona-surface 276/0).
await callTool('vibe_v5_set', { staffPersona: 'STAFF-MARKER-X' })
// V5-A5 (path contract, docs-vs-code class): `memberPathContractOk()` (vibe-math-v5.js:993) compares
// the DOCUMENTED member root with the root the framework actually writes; a divergence logs a NAMED
// error and folds into noteLoadProblem. MEASURED: no suite referenced it before this assertion.
const pathErrs = []
const realErrA5 = console.error
console.error = (...a) => { const line = a.map(String).join(' '); if (/member library path contract BROKEN/.test(line)) pathErrs.push(line); realErrA5(...a) }
let started
try {
  started = await callTool('vibe_v5_start', { problem: '证明：不存在整数解 x^n + y^n = z^n（n>2）的初等情形', researcherCount: 3 })
} finally { console.error = realErrA5 }
assert(pathErrs.length === 0, '* V5-A5 the documented member root equals the root the framework writes (no path-contract divergence; got ' + JSON.stringify(pathErrs.slice(0, 1)) + ')')
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
assert(st0.backend === 'file', 'durable state uses the hardened JSON backend (got ' + st0.backend + ')')
assert(st0.members.length === 4 && st0.members.filter(m => m.kind === 'researcher').length === 3, 'status roster is 1 academician + 3 researchers')
// ★ The whole point of the persistence fix: the plugin used to append `vibe5/*` events to the
// user's own session log, which made that session UNRESUMABLE (DSH refuses to load a log with an
// unknown event type unless it is marked `ignorable`, and `Session.append` cannot set that field).
// The state now lives in the JSON file, so the log must stay COMPLETELY empty.
assert(ROOT_SESSION._events.filter(e => String(e.type).indexOf('vibe5/') === 0).length === 0,
  '★ the plugin appends NO institute events to the host session log')
assert(ROOT_SESSION._events.length === 0,
  '★ the host session log is untouched by the whole founding (the user session stays resumable)')
assert(ROOT_SESSION.deriveMessages().length === 0, 'nothing enters the model history (zero context cost)')
const st0File = await waitV5State(s => s.institutes['default::institute'].members.length === 4)
assert(!!st0File && !!st0File.institutes['default::institute'], 'the institute state is on disk in State/institute.v5state.json')
assert(!!st0File && st0File.institutes['default::institute'].members.length === 4, 'the JSON state holds the same 4 members (got ' + (st0File ? st0File.institutes['default::institute'].members.length : 'none') + ')')
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
// V5-A1: P=4 is a COUNT - assert the semantic unit too. The voter set is the roster identity that
// quorum is computed over, so a duplicate id (P unchanged) must not pass. Measured shape:
// status.verify.voters is the id array (product: `voters: E` in the verdict payload).
// V5-A1: the SHAPE was measured first - status.verify carries {target,kind,stage,round,voted,m,P} but
// NO voter list (vibe-math-v5.js:7316); the voter IDS live in `status.quorum` (quorumView(), :7277/:1262).
const voterIds = (sv.quorum && Array.isArray(sv.quorum.voters)) ? sv.quorum.voters.map(String).sort() : null
assert(!!voterIds && voterIds.join(',') === ['acad', 'r-1', 'r-2', 'r-3'].sort().join(','), '* V5-A1 the voter id SET is exactly {acad, r-1, r-2, r-3} (P=4 keeps the count; got ' + JSON.stringify(voterIds) + ')')
// V5-A2 (roster): the published participant SET and its own COUNT must agree, and the ids must be
// distinct. MEASURED: a mutant that publishes `vs.slice(1)` as `voters` while keeping `voterCount`
// is caught by NO current suite (the parity audit checks field PRESENCE, not agreement).
const qv = sv.quorum || {}
const qvoters = Array.isArray(qv.voters) ? qv.voters.map(String) : null
assert(!!qvoters && qvoters.length === Number(qv.voterCount), '* V5-A2 the published voter SET agrees with its own count (voters=' + (qvoters ? qvoters.length : 'none') + ' voterCount=' + qv.voterCount + ')')
assert(!!qvoters && new Set(qvoters).size === qvoters.length, '* V5-A2 and the published voter ids are DISTINCT (got ' + JSON.stringify(qvoters) + ')')
// V5-A3 (staff): the staffPersona set before founding must appear in the member PERSONA/prompts.
// NOTE (measured): the existing `every member got the full charter` length check stays GREEN under
// the mutant, so the marker search is the only discriminator.
const marker = 'STAFF-MARKER-X'
const sawStaff = spawns.some((sp) => String(sp.persona || '').indexOf(marker) !== -1)
  || wakes.some((w) => (((w.blocks && w.blocks[0] && w.blocks[0].text) || '')).indexOf(marker) !== -1)
assert(sawStaff, '* V5-A3 the staff persona reaches the member persona/prompts (marker=' + marker + '; spawns=' + spawns.length + ', wakes=' + wakes.length + ')')

  // Round: only ONE boolean vote (< m) must NOT verify.
  plannedVotes = new Map([['acad', 0.9], ['r-1', 1], ['r-2', 0.5], ['r-3', 0.7]])
  assert(await drainVerifyRound(4) === 4, 'all four voters answered round 1')
  await settleAll()
  let sA = await callTool('vibe_v5_status', {})
  assert(sA.verified.indexOf(target) === -1, 'a single boolean vote (m-1=2 short) does NOT verify')
  assert(!!sA.verify, 'the verification is still open (abstentions do not settle it)')
  assert(sA.verify && sA.verify.stage === 'debate', 'the round really completed and moved to the DEBATE stage (got ' + (sA.verify && sA.verify.stage) + ')')

  // Debate round: 1 vs 0 conflict must NOT verify.
  plannedVotes = new Map([['acad', 0], ['r-1', 1], ['r-2', 1], ['r-3', 1]])
  assert(await drainVerifyRound(4) === 4, 'all four voters answered the debate round')
  await settleAll()
  let sB = await callTool('vibe_v5_status', {})
  assert(sB.verified.indexOf(target) === -1, 'a conflicting 1/0 assertion BLOCKS the verdict (no minority override)')
  assert(!!sB.verify, 'the verification survived the conflicting round (not silently forced)')

  // Final: three unanimous TRUE votes (m=3) DO verify.
  plannedVotes = new Map([['acad', 1], ['r-1', 1], ['r-2', 1], ['r-3', 1]])
  await drainVerifyRound(4)
  await settleAll()
  let sC = await callTool('vibe_v5_status', {})
  if (!sC.verified.includes(target)) { await drainWakes(8); sC = await callTool('vibe_v5_status', {}) }
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

// ---------- R10 (v5r only): 过程判定 vs 结束裁定；触界具名且可撤销 ----------
// v5 is FROZEN and predates R10, so these assertions run ONLY when the suite is pointed at the v5r
// preset (V5_PLUGIN=<abs path to vibe-math-v5r/vibe-math-v5r.js>). The static half of the same
// guarantee always runs in tests/audit-v5-integrity.mjs (gates R10[1..7], each with a single-site
// self-probe mutation that reddens it BY NAME).
const IS_V5R = /vibe-math-v5r/.test(PLUGIN.pathname)
const instDirR10 = join(WS, 'VibeMath', 'Projects', 'default', 'Institutes', 'institute')
const chatTextR10 = () => {
  const d = join(instDirR10, 'Shared', 'Chat')
  if (!existsSync(d)) return ''
  return readdirSync(d).map((f) => { try { return readFileSync(join(d, f), 'utf8') } catch (e) { return '' } }).join('\n')
}
const verdictOfR10 = (t) => { const s = readV5State(); return s && s.institutes['default::institute'].verdicts[t] }
// Drive scheduling passes (the watchdog is reached from them) until `t` is closed or the budget runs out.
async function waitClosedR10(t, iterations) {
  for (let i = 0; i < iterations; i++) {
    const r = verdictOfR10(t)
    if (r && r.closed) return r
    await drainWakes(6)
    await settleAll()
    await sleep(25)
  }
  return verdictOfR10(t)
}
if (!IS_V5R) {
  console.log('  skip - R10 block: v5 is FROZEN and predates R10 (point this suite at v5r to run it); static gates: audit-v5-integrity R10[1..7]')
} else {
  // ---- (A) 轮数到顶＝具名触界 round-cap（确定性：本轮四票全到、但布尔票 < m）----
  await callTool('vibe_v5_set', { verdictMaxRounds: 1 }, ROOT)
  await callTool('vibe_v5_record_proposition', { id: 'p-r10', title: 'R10 探测', statement: '过程票数不构成裁定。', value: 0.5, motive: 'R10 行为块', p: 0.5 }, childAgent(childOf('r-1')))
  const pr10 = await callTool('vibe_v5_propose_verify', { target: 'p-r10', kind: 'proposition', reason: 'R10 行为探测' }, childAgent(childOf('r-1')))
  assert(pr10.ok === true, 'R10：探测对象进入验证')
  plannedVotes = new Map([['acad', 1], ['r-1', 1], ['r-2', 0.5], ['r-3', 0.5]])
  assert(await drainVerifyRound(4) === 4, 'R10：四个表决者都作答（本轮结束）')
  await settleAll()
  const rec10 = await waitClosedR10('p-r10', 40)
  assert(!!rec10 && rec10.outcome === 'undecided', 'R10：布尔票 < m ⇒ 未定论（过程票数绝不构成裁定）')
  assert(!!rec10 && rec10.endedBy === 'bound:round-cap', "R10：轮数到顶是**具名触界**（endedBy='bound:round-cap'），不是隐式收束")
  assert(!!rec10 && !!rec10.bound && rec10.bound.name === 'round-cap' && rec10.bound.revocable === true,
    'R10：触界**具名**（bound.name=round-cap）且**可撤销**（revocable=true）已落盘')
  assert(!!rec10 && Number.isFinite(Number(rec10.mean)), 'R10：意见收敛的平均概率仍作为**过程数据**保留（未替代程序性结论）')
  assert(/【求真触界｜round-cap】/.test(chatTextR10()), 'R10：触界**具名广播**到群聊（【求真触界｜round-cap】）')
  assert(/尚未生效·仅供参考/.test(chatTextR10()), 'R10：过程票数带「尚未生效·仅供参考」标注')
  // ---- (B) 触界可撤销/续期：同一对象重新提议必须被接受（不得被"刚刚定论，忽略重复提议"挡回）----
  const pr10b = await callTool('vibe_v5_propose_verify', { target: 'p-r10', kind: 'proposition', reason: 'R10 续期探测' }, childAgent(childOf('r-1')))
  assert(pr10b.ok === true && pr10b.deduped !== true, 'R10：触界**可撤销/续期**（重新提议被接受，未被"刚刚定论"挡回）')
  let sv10 = await callTool('vibe_v5_status', {})
  if (!sv10.verify) { await drainWakes(6); await settleAll(); sv10 = await callTool('vibe_v5_status', {}) }
  assert(!!sv10.verify && sv10.verify.target === 'p-r10', 'R10：续期后该对象重新进入验证（不是"已定论"）')
  await waitClosedR10('p-r10', 40)   // let the renewed round settle again (round-cap) so the state stays tidy
  // ---- (C) 空闲触界＝具名 bound:idle（小额 activityTimeoutMs ⇒ recoverStallMs=80ms；无人投票）----
  await callTool('vibe_v5_set', { activityTimeoutMs: 40, verdictMaxRounds: 3 }, ROOT)
  await callTool('vibe_v5_record_proposition', { id: 'p-r11', title: 'R10 探测 2', statement: '无人应答是有界触界，不是隐式放弃。', value: 0.5, motive: 'R10 行为块', p: 0.5 }, childAgent(childOf('r-1')))
  const pr11 = await callTool('vibe_v5_propose_verify', { target: 'p-r11', kind: 'proposition', reason: 'R10 空闲触界探测' }, childAgent(childOf('r-1')))
  assert(pr11.ok === true, 'R10：第二个探测对象进入验证')
  const rec11 = await waitClosedR10('p-r11', 80)
  assert(!!rec11 && rec11.outcome === 'undecided', 'R10：空闲兜底也记未定论（绝不自动下真值结论）')
  assert(!!rec11 && rec11.endedBy === 'bound:idle', "R10：空闲兜底是**具名触界**（endedBy='bound:idle'），不是隐式放弃")
  assert(!!rec11 && !!rec11.bound && rec11.bound.name === 'idle' && rec11.bound.revocable === true,
    'R10：idle 触界同样**具名**且**可撤销**（bound.name/revocable 落盘）')
  assert(/【求真触界｜idle】/.test(chatTextR10()), 'R10：idle 触界同样**具名广播**（【求真触界｜idle】）')
  assert(!/abandoned \(stuck\)/.test(JSON.stringify(readV5State() || {})), "R10：隐式 'abandoned (stuck)' 结算语义已消失")
  await callTool('vibe_v5_set', { activityTimeoutMs: 120000, verdictMaxRounds: 3 }, ROOT)
  console.log('  R10 block (v5r) done; failures so far=' + failed)
}

// ---- V5_SCENARIO mode (A2): switch AFTER the main flow's preparation, at the position that is
// already proven to work, then exit -- so the later phases never run in this child process.
// Insertion-point causal note (kept for the record): the SAME propose made BEFORE the main
// verification section left status.verify null for 1.5 s (bounded wait timed out) while the same
// call after this point starts normally; the scenario therefore also captures a diagnosis object.
const SCENARIO = String(process.env.V5_SCENARIO || '').trim()
async function runScenario(name) {
  const instDir = join(WS, 'VibeMath', 'Projects', 'default', 'Institutes', 'institute')
  const cardOf = (id) => { const p = join(instDir, 'Verified', '命题', id + '.md'); return existsSync(p) ? readFileSync(p, 'utf8') : '' }
  const recOf = (id) => { const s = readV5State(); return s && s.institutes['default::institute'].verdicts[id] }
  const waitVerify = async (id) => {
    for (let i = 0; i < 60; i++) {
      const sv = await callTool('vibe_v5_status', {})
      if (sv.verify && sv.verify.target === id) return sv
      await settleAll()
      await sleep(25)
    }
    assert(false, 'V5_SCENARIO 超时：验证未在 1.5s 内起跑（status.verify.target 仍不是 ' + id + '）——起跑条件不成立，按红线即红')
    return await callTool('vibe_v5_status', {})
  }
  const fresh = async (id, statement) => {
    await callTool('vibe_v5_record_proposition', { id, title: id, statement, value: 0.5, motive: 'R10/D3 场景', p: 0.5 }, childAgent(childOf('r-1')))
    const prop = await callTool('vibe_v5_propose_verify', { target: id, kind: 'proposition', reason: 'D3 场景探测' }, childAgent(childOf('r-1')))
    return prop
  }
  await callTool('vibe_v5_set', { activityTimeoutMs: 120000, verdictMaxRounds: 3 }, ROOT)
  let prop = null
  if (name === 'd3-silence') {
    prop = await fresh('p-s1', '未表态阻塞结题。')
    assert(prop.ok === true, 'D3：探测对象进入验证（propose ok）')
    await waitVerify('p-s1')
    const bad = await callTool('vibe_v5_end_verify', { target: 'p-s1', reason: '非院士尝试' }, childAgent(childOf('r-1')))
    assert(bad.ok === false && bad.code === 'V5_NOT_ACADEMICIAN', 'R10-2a：仅院士可结束辩论（非院士 ⇒ 具名拒绝 V5_NOT_ACADEMICIAN）')
    const still = await callTool('vibe_v5_status', {})
    assert(!!still.verify && still.verify.target === 'p-s1', 'R10-2a：拒绝无副作用（验证仍开启）')
    const end = await callTool('vibe_v5_end_verify', { target: 'p-s1', reason: 'D3 参与门探测' }, childAgent(childOf('acad')))
    assert(end.ok === true && end.endedBy === 'academician', 'R10-2a：院士可显式结束辩论（endedBy=academician）')
    assert(end.outcome === 'undecided', 'D3：未表态阻塞结题——院士显式结束也**不得**给出真/假结论')
    assert(/未表态名单/.test(String(end.reason)) && Array.isArray(end.process && end.process.silent) && end.process.silent.length === 4,
      'D3：未表态名单被列出（process.silent＝全部 4 名可表决者）')
    const rec = recOf('p-s1')
    assert(!!rec && rec.endedBy === 'academician' && rec.endedByMember === 'acad' && rec.outcome === 'undecided',
      'R10-2a：结束辩论在耐久记录里具名且结论为未定论')
  } else if (name === 'l4-abstain') {
    prop = await fresh('p-s2', '显式弃权计入已投不计选项。')
    assert(prop.ok === true, 'L4：探测对象进入验证（propose ok）')
    await waitVerify('p-s2')
    for (const id of ['acad', 'r-1', 'r-2']) await callTool('vibe_v5_verdict', { target: 'p-s2', verdict: 1, reason: '布尔真' }, childAgent(childOf(id)))
    const ab = await callTool('vibe_v5_verdict', { target: 'p-s2', verdict: 'abstain', reason: '明确弃权' }, childAgent(childOf('r-3')))
    assert(ab.ok === true && ab.abstain === true, 'L4：显式弃权被投票通道接受（计入已投）')
    await settleAll()
    let sv = await callTool('vibe_v5_status', {})
    if (!sv.verified.includes('p-s2')) { await drainWakes(8); await settleAll(); sv = await callTool('vibe_v5_status', {}) }
    assert(sv.verified.indexOf('p-s2') !== -1, 'L4：显式弃权**计入已投**（3 名布尔真者达到 m=3 ⇒ 定为真）')
    const card = cardOf('p-s2')
    assert(/显式弃权: 1/.test(card) && /中间估计: 0/.test(card), 'L4：弃权**不计选项**（卡片记 显式弃权: 1、中间估计: 0）')
    assert(!/弃权\/存疑/.test(card), 'L4：不再把 0<p<1 的估计写成「弃权/存疑」')
  } else if (name === 'd3-unable') {
    prop = await fresh('p-s3', '无法判断退出分母。')
    assert(prop.ok === true, 'D3：探测对象进入验证（propose ok）')
    await waitVerify('p-s3')
    for (const id of ['acad', 'r-1', 'r-2']) await callTool('vibe_v5_verdict', { target: 'p-s3', verdict: 1, reason: '布尔真' }, childAgent(childOf(id)))
    const un = await callTool('vibe_v5_verdict', { target: 'p-s3', verdict: 'unable', reason: '我无法判断这个命题' }, childAgent(childOf('r-3')))
    assert(un.ok === true && un.unable === true, 'D3：无法判断被投票通道接受（退出分母）')
    await settleAll()
    let sv = await callTool('vibe_v5_status', {})
    if (!sv.verified.includes('p-s3')) { await drainWakes(8); await settleAll(); sv = await callTool('vibe_v5_status', {}) }
    const rec = recOf('p-s3')
    assert(!!rec && rec.outcome === 'true' && rec.m === 3 && rec.voters.length === 3 && rec.voters.indexOf('r-3') === -1,
      'D3：无法判断者**退出分母**（m=3 只覆盖 3 名有效表决者），且其判断**不算反对**')
    assert(Array.isArray(sv.quorum && sv.quorum.voters) && sv.quorum.voters.indexOf('r-3') !== -1,
      'D3：无法判断者**仍在册列出**（quorum.voters 仍含 r-3，名单必列）')
  } else if (name === 'r3-speech') {
    prop = await fresh('p-s4', '发言不投票。')
    assert(prop.ok === true, 'R3：探测对象进入验证（propose ok）')
    await waitVerify('p-s4')
    const said = await callTool('vibe_v5_say', { text: '我口头表示赞成这个命题（但这只是发言，不是投票）。' }, childAgent(childOf('r-1')))
    assert(said.ok === true, 'R3：表决期内发言被正常记录（不被静默丢弃）')
    await settleAll()
    await drainWakes(2)
    await settleAll()
    const sv = await callTool('vibe_v5_status', {})
    const voted = sv.verify && Array.isArray(sv.verify.voted) ? sv.verify.voted.length : -1
    assert(!!sv.verify && sv.verify.target === 'p-s4' && voted === 0,
      'R3：发言不产生票（verification 的 voted 仍为空 ⇒ 票面不被发言改变；got ' + voted + '）')
    const bad4 = await callTool('vibe_v5_end_verify', { target: 'p-s4', reason: '非院士尝试' }, childAgent(childOf('r-1')))
    assert(bad4.ok === false && bad4.code === 'V5_NOT_ACADEMICIAN', 'R10-2a：仅院士可结束辩论（非院士 ⇒ 具名拒绝 V5_NOT_ACADEMICIAN）')
    const end = await callTool('vibe_v5_end_verify', { target: 'p-s4', reason: 'R3 场景收尾' }, childAgent(childOf('acad')))
    assert(end.ok === true && end.outcome === 'undecided', 'R2/C1：发言之后仍未表态 ⇒ 结束辩论只能得到未定论（沉默不折算为赞成）')
  } else {
    assert(false, 'V5_SCENARIO 未知：' + name)
  }
  // diagnosis for the record (A1): why did the earlier insertion point fail? Capture the same facts here.
  try {
    const st = await callTool('vibe_v5_status', {})
    const diag = { scenario: name, propose: prop, verify: st.verify || null, verifyQueue: st.verifyQueue || null, meetingLive: !!st.meeting, running: st.running, autoDone: st.autoDone }
    writeFileSync(join(WS, 'scenario-diag-' + name + '.json'), JSON.stringify(diag, null, 1))
    console.log('  diag(' + name + '): verify=' + JSON.stringify(diag.verify) + ' queue=' + JSON.stringify(diag.verifyQueue) + ' meeting=' + diag.meetingLive)
  } catch (e) { /* diagnosis is best-effort; never fails the scenario */ }
}
if (SCENARIO) {
  await runScenario(SCENARIO)
  console.log('')
  console.log('passed=' + passed + ' failed=' + failed)
  if (failed) { console.error('FAILURES:'); for (const f of failures) console.error('  - ' + f); process.exit(1) }
  console.log('SCENARIO GREEN: ' + SCENARIO)
  process.exit(0)
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
// V5-A4 (CAS semantic unit) - R17 scope refinement: the assertion detects any refused-but-written
// change VISIBLE IN THE OBSERVABLE TRIPLE (revision|ownerId|status). Measured by R17: a
// `task.status='done'` write inside the refusal branch => V5-A4 RED (`before=1||pending after=1||done`);
// a write OUTSIDE the triple (e.g. `task.notes`) => V5-A4 green and remains a MEASURED BOUNDARY (the
// harness cannot see it). The earlier, broader phrasing ("cannot be the sole discriminator") is
// superseded by this scope statement.
// The assertions above (here,
// in e2e-v5-round2 and in prompt-v5-integrity) only check the RETURN VALUE, so a mutant that refuses
// but still writes - or writes first and checks afterwards - would pass all of them. Read the task
// back and compare the observable triple.
const t1AfterStale = await callTool('vibe_v5_task_get', { task_id: t1.task.id }, childAgent(childOf('r-3')))
const taskOf = (r) => (r && r.task) ? r.task : (r && r.id ? r : null)
const t1Before = taskOf(t1) || {}
const t1Now = taskOf(t1AfterStale) || {}
const tupleOf = (t) => [t.revision, t.ownerId || '', t.status || ''].join('|')
assert(!!t1Now.revision, '* V5-A4 the task is readable back after the refusal (got ' + JSON.stringify(t1AfterStale).slice(0, 120) + ')')
assert(tupleOf(t1Now) === tupleOf(t1Before), '* V5-A4 a REFUSED stale CAS leaves the task UNCHANGED (before=' + tupleOf(t1Before) + ' after=' + tupleOf(t1Now) + ')')
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
const stateReadme = join(WS, 'VibeMath', 'Projects', 'default', 'Institutes', 'institute', 'State', 'README.md')
assert(existsSync(stateReadme), 'State/ carries a README')
if (existsSync(stateReadme)) {
  const readmeText = readFileSync(stateReadme, 'utf8')
  assert(/权威状态/.test(readmeText) && /v5state\.json/.test(readmeText),
    'the State/ README names State/<研究所>.v5state.json as the authoritative state')
  assert(/不在任何宿主会话日志里/.test(readmeText),
    'the State/ README states that the authority is NOT in any host session log')
}

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
// ★ docs/final-paper.md §3: the unanimous solve vote does NOT flip the completion flags any more. The
// final-paper phase runs FIRST (after phase='solved' the machinery refuses to wake members,
// convene meetings or dispatch an end, so the co-writing could never run). This loop must
// therefore land on "paper active, run still alive" — that IS the contract, and the loop
// below proves the run concludes only once the paper is finalised.
let sPaper = null
for (let i = 0; i < 60; i++) {
  const s = await callTool('vibe_v5_status', {})
  if (s.paper && s.paper.status !== 'finalized') { sPaper = s; break }
  if (s.autoDone) break
  await drainWakes(6)
  await sleep(15)
}
assert(!!sPaper, 'the unanimous solve vote enters the FINAL PAPER phase before completion — ' +
  JSON.stringify({ autoDone: (sPaper || {}).autoDone, paper: (sPaper || {}).paper }))
assert(sPaper && sPaper.autoDone === false && sPaper.running === true,
  'the run stays ALIVE while the paper phase runs (a concluded run refuses the wakes it needs)')
assert(sPaper && sPaper.paper && sPaper.paper.status === 'writing' && sPaper.paper.editor === 'academician',
  'the automatic paper is in its writing stage with the academician as the default editor (' + JSON.stringify(sPaper && sPaper.paper && { status: sPaper.paper.status, editor: sPaper.paper.editor }) + ')')
// Drive the paper to completion: parts -> cross-review -> academician finalises -> the run is
// marked complete and the conclusion record is written.
let sDone = sPaper
for (let i = 0; i < 160; i++) {
  sDone = await callTool('vibe_v5_status', {})
  if (sDone.autoDone) break
  await drainWakes(8)
  await sleep(15)
}
assert(sDone.autoDone === true, 'the run is marked complete once the final paper is finalised — ' +
  JSON.stringify({ autoDone: sDone.autoDone, running: sDone.running, paper: sDone.paper && { status: sDone.paper.status, compile: sDone.paper.compile } }))
assert(sDone.running === false, 'scheduling halted after the paper was finalised')
assert(sDone.paper && sDone.paper.status === 'finalized', 'status reports the paper as finalised (' + JSON.stringify(sDone.paper && sDone.paper.status) + ')')
const paperDir = join(WS, 'VibeMath', 'Projects', 'default', 'Institutes', 'institute', 'Paper', 'institute')
const paperMd = existsSync(join(paperDir, 'paper.md')) ? readFileSync(join(paperDir, 'paper.md'), 'utf8') : ''
const paperTex = existsSync(join(paperDir, 'paper.tex')) ? readFileSync(join(paperDir, 'paper.tex'), 'utf8') : ''
const paperMeta = existsSync(join(paperDir, 'paper.meta.json')) ? JSON.parse(readFileSync(join(paperDir, 'paper.meta.json'), 'utf8')) : null
assert(/## 1\. /.test(paperMd) && /## 9\. /.test(paperMd), '★ the delivered paper carries the 9-section skeleton')
assert(/\\documentclass/.test(paperTex) && /\\begin\{document\}/.test(paperTex), '★ the tex version is produced as well')
assert(!!paperMeta && paperMeta.compile && paperMeta.compile.status === 'not-detected',
  '★ no LaTeX on this host: the meta records compile=not-detected and the md+tex are still delivered (' + JSON.stringify(paperMeta && paperMeta.compile) + ')')
assert(existsSync(join(paperDir, 'paper.log.md')), 'the paper log records who wrote and reviewed what')
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

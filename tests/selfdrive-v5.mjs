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
import { join, dirname, isAbsolute, delimiter } from 'node:path'

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

async function callToolRaw(name, args, agent) {
  const spec = toolRegs.find(x => x.name === name)
  if (!spec) throw new Error('no tool ' + name)
  return JSON.parse(await spec.execute(args || {}, { agent: agent || ROOT }))
}
async function callTool(name, args, agent) {
  // S25-C（issue #13 #1）：产品（v5r 与 v5）现在要求"只有已登记正式证明/证伪且定稿的命题才能进入
  // 辩论"且"开启与选对象由院士"。既有场景大量在"未登记 ＋ 非院士"下提议 ⇒ 这里**统一补前置**：
  // 先由院士登记 formal_proof，再由**院士**发起提议。登记入口按**能力**选择（v5r 用 end_verify 的
  // op=formal_proof；v5 没有 end_verify ⇒ 用 propose_verify 的 op=formal_proof）；对没有该机制的
  // 预设（v2/v3/v4）整段自动跳过（靠工具描述里是否出现 formal_proof 判定）。
  // 两道门的**负例**由 `s25c-proof-gate` 场景显式覆盖（它直接调 callToolRaw，绕过本包装）。
  const pvSpec = toolRegs.find((x) => x.name === 'vibe_v5_propose_verify')
  const hasProofGate = !!(pvSpec && /formal_proof/.test(String(pvSpec.description || '')))
  if (name === 'vibe_v5_propose_verify' && hasProofGate && agent && args && args.target && String(args.op || '') !== 'formal_proof') {
    const t = String(args.target)
    const why = 'S25-C 前置：登记正式证明（场景前置，非被测行为）'
    if (toolRegs.some((x) => x.name === 'vibe_v5_end_verify')) {
      await callToolRaw('vibe_v5_end_verify', { target: t, reason: why, op: 'formal_proof', status: 'proved' }, childAgent(childOf('acad')))
    } else {
      await callToolRaw('vibe_v5_propose_verify', { target: t, reason: why, op: 'formal_proof', status: 'proved' }, childAgent(childOf('acad')))
    }
    return await callToolRaw('vibe_v5_propose_verify', args, childAgent(childOf('acad')))
  }
  return await callToolRaw(name, args, agent)
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
    // ROUND 65: the probe is deliberately CAUSAL. `omitOnce` makes exactly ONE delivery carry no evidence; if the
    // guard works that delivery is refused and the member is asked again, so a second attempt is the observable
    // consequence. With the guard absent the part would be recorded and no second attempt would ever happen.
    const probe = globalThis.__paperProbe || (globalThis.__paperProbe = { omitOnce: false, attempts: {} })
    probe.attempts[who] = (probe.attempts[who] || 0) + 1
    const omit = probe.omitOnce === true
    if (omit) probe.omitOnce = false
    reply = {
      paper_part: {
        title: who + ' 的贡献', solution: who + '：原问题的完整解法——最小反例归约（仅写有证据的部分）。',
        methods: who + ' 的方法与经验：归约 + 边界情形枚举。', rules: who + ' 归纳的规律：先最小反例，再边界。',
        limits: who + ' 的局限：部分边界情形仍未定论（已显式标注）。',
        evidence: omit ? [] : ['Members/' + who + '/Propos/p-' + who + '.md'],
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
assert(st1.members.length > 0, 'non-vacuous: the institute roster must not be empty (' + st1.members.length + ')')
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
  JSON.stringify({ verify: sv.verify, queue: sv.verifyQueue, undecided: sv.undecided, running: sv.running, autoDone: sv.autoDone, phase: sv.phase, meeting: sv.meeting, parked: sv.parkedMeeting, tasks: (sv.tasks || []).length, svShape: Object.keys(sv || {}).join(','), svCode: sv && sv.code, svMsg: sv && sv.message }))
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
  // ── S4 场景的前置与观测（主持/异议场景共用；每个场景仍各自独立工作区）─────────────────
  // 会议必须先**真的开起来**（`status.meeting` 非空）主持代行才有意义；收束要能真的走完，
  // 否则"有/无代行同一票型"的比较就没法做（会议与验证互斥：会议在跑时验证起不来）。
  const openMeeting = async (agenda) => {
    const mt = await callTool('vibe_v5_meeting', { agenda, kind: 'sync' }, ROOT)
    assert(mt.ok === true && mt.parked !== true,
      'S4 前置：所办可召开会议（ok:true 且未被暂存；got ' + JSON.stringify(mt).slice(0, 160) + '）')
    for (let i = 0; i < 60; i++) {
      const sv = await callTool('vibe_v5_status', {})
      if (sv.meeting) return sv.meeting
      await settleAll()
      await sleep(25)
    }
    assert(false, 'S4 前置：会议未在 1.5s 内开启（status.meeting 仍为空）')
    return null
  }
  const waitMeetingClosed = async () => {
    for (let i = 0; i < 60; i++) {
      await drainWakes(8)
      await settleAll()
      const sv = await callTool('vibe_v5_status', {})
      if (!sv.meeting) return sv
      await sleep(25)
    }
    assert(false, 'S4-no-weight 前置：会议未收束（status.meeting 仍在 ⇒ 验证起不来）')
    return null
  }
  const castAll = async (target, pattern) => {
    for (const id of ['acad', 'r-1', 'r-2', 'r-3']) {
      const r = await callTool('vibe_v5_verdict', { target, verdict: pattern[id], reason: 'S4 同票型探测' }, childAgent(childOf(id)))
      assert(r.ok === true, 'S4-no-weight：' + id + ' 的票被接受（got ' + JSON.stringify(r).slice(0, 140) + '）')
    }
  }
  const closedRecOf = async (target) => {
    for (let i = 0; i < 60; i++) {
      const r = recOf(target)
      if (r && r.closed) return r
      await drainWakes(6)
      await settleAll()
      await sleep(25)
    }
    return recOf(target)
  }
  // ── S5 场景的驱动：**中性回复**（只有 contextPct）结束一轮 ⇒ `onMemberEnd` 末尾的 `scheduleNext()`
  // 驱动下一次调度轮次；但它**不**写 progress、不发言、不投票 ⇒ `lastProgressAt` **不动**，静止片段
  // 保持开启 ⇒ "是否再提示"完全由**一次性判据**决定（这正是 s5-notice-once 与族①要咬住的行为）。
  const answerNeutral = async () => {
    let n = 0
    for (let sweep = 0; sweep < 3; sweep++) {
      while (wakes.length && n < 12) {
        const w = wakes.shift()
        fireEnd(w.childId, { contextPct: 10 })
        n++
        await settleAll()
      }
      await sleep(20)
    }
    return n
  }
  const stallNoticeCount = () => (chatTextR10().match(/【研究所提示/g) || []).length
  const driveUntilNotice = async (want, rounds) => {
    for (let i = 0; i < (rounds || 60); i++) {
      if (stallNoticeCount() >= want) break
      await answerNeutral()
      await sleep(120)
    }
    return stallNoticeCount()
  }
  const durableNotice = () => {
    const s = readV5State() || {}
    const inst = (s.institutes || {})['default::institute'] || {}
    return inst.stallNotice || null
  }
  // S6 场景的台账读取（授权/撤回的耐久证据）。
  const durableGrants = () => {
    const s = readV5State() || {}
    const inst = (s.institutes || {})['default::institute'] || {}
    return Array.isArray(inst.grants) ? inst.grants : []
  }
  // S6 场景只在 v5r 下可跑（临时授权是 v5r 的能力）；v5 路径**显式 skip**。
  if (name.startsWith('s6-') && !process.env.V5_PLUGIN) {
    console.log('  skip - S6 场景需要 V5_PLUGIN=<…/vibe-math-v5r.js>（v5 预设没有 vibe_v5_grant / vibe_v5_revoke）')
    return
  }
  // S7 场景的投票板台账读取（板与每一票的耐久证据）。
  const durableBallots = () => {
    const s = readV5State() || {}
    const inst = (s.institutes || {})['default::institute'] || {}
    return Array.isArray(inst.ballots) ? inst.ballots : []
  }
  const ballotRow = (id) => durableBallots().filter((b) => String(b.id) === String(id))[0] || {}
  // S8 场景的结构化纪要读取（`minutes{}` 写回在耐久会议条目上）。
  const durableMinutes = (id) => {
    const s = readV5State() || {}
    const inst = (s.institutes || {})['default::institute'] || {}
    const row = (inst.meetings || []).filter((x) => String(x.id) === String(id))[0] || {}
    return row.minutes || null
  }
  // S8 场景的驱动：**对某个成员的「会议」唤醒**回复自定义 payload。会议按名册**逐个**问（轮流发言），
  // 所以为了轮到目标成员，必须先把**其它成员**的会议唤醒用中性回复放行（`onMemberEnd` 只认 inflight
  // 令牌，且会议发言只在 `kind==='meeting'` 分支里解析 ⇒ 必须命中【研究所会议】唤醒）。
  const replyMeeting = async (memberId, payload) => {
    const cid = childOf(memberId)
    for (let i = 0; i < 120; i++) {
      const idx = wakes.findIndex((w) => /【研究所会议/.test(JSON.stringify(w.blocks || '')))
      if (idx === -1) {
        // 没有会议唤醒时，先把**别的**待处理唤醒按常规答复（`onMemberEnd` 末尾的 `scheduleNext()`
        // 才会驱动下一轮调度，会议成员才会被唤醒）——否则会永远等不到会议唤醒。
        if (wakes.length) { await answerWake(wakes.shift()); continue }
        await settleAll()
        await sleep(20)
        continue
      }
      const w = wakes.splice(idx, 1)[0]
      const mine = w.childId === cid
      fireEnd(w.childId, mine ? Object.assign({ contextPct: 10 }, payload) : { contextPct: 10 })
      await settleAll()
      if (mine) return true
      await sleep(10)
    }
    return false
  }
  // S7 场景只在 v5r 下可跑（投票板是 v5r 的能力）；v5 路径**显式 skip**。
  if (name.startsWith('s7-') && !process.env.V5_PLUGIN) {
    console.log('  skip - S7 场景需要 V5_PLUGIN=<…/vibe-math-v5r.js>（v5 预设没有 vibe_v5_poll_open / _vote / _close）')
    return
  }
  // S8 场景只在 v5r 下可跑（表决期禁言＋纪要分区是 v5r 的行为）；v5 路径**显式 skip**。
  if (name.startsWith('s8-') && !process.env.V5_PLUGIN) {
    console.log('  skip - S8 场景需要 V5_PLUGIN=<…/vibe-math-v5r.js>（v5 预设没有表决期禁言与纪要分区）')
    return
  }
  // S9 场景只在 v5r 下可跑（少数意见入档＋复议是 v5r 的行为）；v5 路径**显式 skip**。
  if (name.startsWith('s9-') && !process.env.V5_PLUGIN) {
    console.log('  skip - S9 场景需要 V5_PLUGIN=<…/vibe-math-v5r.js>（v5 预设没有 vibe_v5_reconsider 与少数意见入档）')
    return
  }
  // S10 场景只在 v5r 下可跑（引用边界（D6）是 v5r 的行为）；v5 路径**显式 skip**。
  if (name.startsWith('s10-') && !process.env.V5_PLUGIN) {
    console.log('  skip - S10 场景需要 V5_PLUGIN=<…/vibe-math-v5r.js>（v5 预设没有引用锚与私聊补记）')
    return
  }
  // S11 场景只在 v5r 下可跑（记录人／秘书角色是 v5r 的行为）；v5 路径**显式 skip**。
  if (name.startsWith('s11-') && !process.env.V5_PLUGIN) {
    console.log('  skip - S11 场景需要 V5_PLUGIN=<…/vibe-math-v5r.js>（v5 预设没有 vibe_v5_secretary / vibe_v5_minutes）')
    return
  }
  // S12 场景只在 v5r 下可跑（会议分级是 v5r 的行为）；v5 路径**显式 skip**。
  if (name.startsWith('s12-') && !process.env.V5_PLUGIN) {
    console.log('  skip - S12 场景需要 V5_PLUGIN=<…/vibe-math-v5r.js>（v5 预设没有会议分级／formal_agenda）')
    return
  }
  // S13 场景只在 v5r 下可跑（决议实体／生效时点／检索是 v5r 的行为）；v5 路径**显式 skip**。
  if (name.startsWith('s13-') && !process.env.V5_PLUGIN) {
    console.log('  skip - S13 场景需要 V5_PLUGIN=<…/vibe-math-v5r.js>（v5 预设没有 vibe_v5_result_record / vibe_v5_resolutions）')
    return
  }
  // S14 场景只在 v5r 下可跑（迁移/守卫收尾是 v5r 的契约）；v5 路径**显式 skip**。
  if (name.startsWith('s14-') && !process.env.V5_PLUGIN) {
    console.log('  skip - S14 场景需要 V5_PLUGIN=<…/vibe-math-v5r.js>（v5 预设没有 fold 白名单的缺省契约）')
    return
  }
  // S15 场景只在 v5r 下可跑（K4 上次纪要确认／行动项跟踪是 v5r 的行为）；v5 路径**显式 skip**。
  if (name.startsWith('s15-') && !process.env.V5_PLUGIN) {
    console.log('  skip - S15 场景需要 V5_PLUGIN=<…/vibe-math-v5r.js>（v5 预设没有纪要确认台账与行动项 origin/due_in/state）')
    return
  }
  // S16 场景只在 v5r 下可跑（G3 开场具名点名是 v5r 的行为）；v5 路径**显式 skip**。
  if (name.startsWith('s16-') && !process.env.V5_PLUGIN) {
    console.log('  skip - S16 场景需要 V5_PLUGIN=<…/vibe-math-v5r.js>（v5 预设没有行动项 origin/due_in/state 与开场点名）')
    return
  }
  // S17 场景只在 v5r 下可跑（G3 的 overview 行动项节是 v5r 的行为）；v5 路径**显式 skip**。
  if (name.startsWith('s17-') && !process.env.V5_PLUGIN) {
    console.log('  skip - S17 场景需要 V5_PLUGIN=<…/vibe-math-v5r.js>（v5 预设没有行动项 origin/due_in/state 与 overview 行动项节）')
    return
  }
  // S18 场景只在 v5r 下可跑（#23 动议／#38 附议是 v5r 的行为）；v5 路径**显式 skip**。
  if (name.startsWith('s18-') && !process.env.V5_PLUGIN) {
    console.log('  skip - S18 场景需要 V5_PLUGIN=<…/vibe-math-v5r.js>（v5 预设没有 motions 台账与 vibe_v5_motion／vibe_v5_second）')
    return
  }
  // S19 场景只在 v5r 下可跑（#23 的可设附议门槛是 v5r 的行为）；v5 路径**显式 skip**。
  if (name.startsWith('s19-') && !process.env.V5_PLUGIN) {
    console.log('  skip - S19 场景需要 V5_PLUGIN=<…/vibe-math-v5r.js>（v5 预设没有 motions 台账与 motionSecondsRequired 参数）')
    return
  }
  // S20 场景只在 v5r 下可跑（决议取代写入面与 `from_resolution` 是 v5r 的行为）；v5 路径**显式 skip**。
  if (name.startsWith('s20-') && !process.env.V5_PLUGIN) {
    console.log('  skip - S20 场景需要 V5_PLUGIN=<…/vibe-math-v5r.js>（v5 预设没有 resolutions 取代链与 from_resolution 校验）')
    return
  }
  // S25-A 场景只在 v5r 下可跑（三个资源参数与 status 回显是 v5r 的行为）；v5 路径**显式 skip**。
  if (name.startsWith('s25a-') && !process.env.V5_PLUGIN) {
    console.log('  skip - S25-A 场景需要 V5_PLUGIN=<…/vibe-math-v5r.js>（v5 预设没有 resourceSelfCheck／toolCallsPerTurnCap／memoryCeilingMb）')
    return
  }
  // S25-B 场景只在 v5r 下可跑（record_progress 的 track 分轨是 v5r 的行为）；v5 路径**显式 skip**。
  if (name.startsWith('s25b-') && !process.env.V5_PLUGIN) {
    console.log('  skip - S25-B 场景需要 V5_PLUGIN=<…/vibe-math-v5r.js>（v5 预设的 record_progress 没有 track 分轨）')
    return
  }
  // S25-C 场景只在 v5r 下可跑（"正式证明/证伪"准入门与院士独占是 v5r 的行为）；v5 路径**显式 skip**。
  if (name.startsWith('s25c-') && !process.env.V5_PLUGIN) {
    console.log('  skip - S25-C 场景需要 V5_PLUGIN=<…/vibe-math-v5r.js>（v5 预设没有 formal_proof 准入与院士独占门）')
    return
  }
  // S25-D 场景只在 v5r 下可跑（机器层工具预算与内存降级是 v5r 的行为）；v5 路径**显式 skip**。
  if (name.startsWith('s25d-') && !process.env.V5_PLUGIN) {
    console.log('  skip - S25-D 场景需要 V5_PLUGIN=<…/vibe-math-v5r.js>（v5 预设没有机器层资源预算）')
    return
  }
  // S25-E 场景只在 v5r 下可跑（待续标记与分轨截断计数是 v5r 的行为）；v5 路径**显式 skip**。
  if (name.startsWith('s25e-') && !process.env.V5_PLUGIN) {
    console.log('  skip - S25-E 场景需要 V5_PLUGIN=<…/vibe-math-v5r.js>（v5 预设没有 pendingWork 与分轨读面）')
    return
  }
  // S5 场景只在 v5r 下可跑（一次性静止提示是 v5r 的行为）；v5 路径**显式 skip**（同上，绝不落进"未知场景即红"）。
  if (name.startsWith('s5-') && !process.env.V5_PLUGIN) {
    console.log('  skip - S5 场景需要 V5_PLUGIN=<…/vibe-math-v5r.js>（v5 预设没有静止提示：它仍会静止自动召集会议）')
    return
  }
  await callTool('vibe_v5_set', { activityTimeoutMs: 120000, verdictMaxRounds: 3 }, ROOT)
  let prop = null
  // G6 场景只在 v5r 预设下可跑（能力由 vibe-math-v5r.js 提供）；v5 路径下**显式 skip**，
  // 绝不能落进"未知场景即红"（否则 v5 验收 94/1 会被污染）。
  if (name.startsWith('g6-') && !process.env.V5_PLUGIN) {
    console.log('  skip - G6 场景需要 V5_PLUGIN=<…/vibe-math-v5r.js>（v5 预设没有 vibe_v5_self_report）')
    return
  }
  // S4 场景同理：主持代行/程序异议是 v5r 运行时工具（#45/#46），v5 预设根本没有这两个工具；
  // v5 路径下**显式 skip**（绝不能落进"未知场景即红"，否则 v5 验收会被污染）。
  if (name.startsWith('s4-') && !process.env.V5_PLUGIN) {
    console.log('  skip - S4 场景需要 V5_PLUGIN=<…/vibe-math-v5r.js>（v5 预设没有 vibe_v5_chair_proxy / vibe_v5_procedural_objection）')
    return
  }
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
  } else if (name === 'g6-self') {
    const g6Agent = childAgent(childOf('r-1'))
    const rep1 = await callTool('vibe_v5_self_report', { subgoal: 'G6 自报子目标', plan: 'G6 自报计划', status: 'G6 自报状态', reason: 'g6-self 场景' }, g6Agent)
    assert(rep1.ok === true, 'G6-self：在册成员更新自己的 subgoal/plan/status ⇒ ok:true（got ' + JSON.stringify(rep1).slice(0, 120) + '）')
    // fields.plan 是**数组**（实现口径）；fields.overall 允许为空串 ⇒ 不要求非空。
    assert(!!rep1.fields && rep1.fields.subgoal === 'G6 自报子目标' && rep1.fields.status === 'G6 自报状态'
      && Array.isArray(rep1.fields.plan) && rep1.fields.plan.join('|').indexOf('G6 自报计划') !== -1,
      'G6-self：回执 fields 反映新值（subgoal/status 字符串、plan 数组含新计划；fields=' + JSON.stringify(rep1.fields) + '）')
    assert(!!rep1.times && Number(rep1.times.subgoalAt) > 0 && Number(rep1.times.planAt) > 0,
      'G6-self：时间由框架写入（times.subgoalAt/planAt > 0；times=' + JSON.stringify(rep1.times) + '）')
    const hist1 = Array.isArray(rep1.history) ? rep1.history.length : -1
    assert(hist1 >= 1, 'G6-self：首次提交后 receipt.history 有记录（got ' + hist1 + '）')
    // 同值再提交 ⇒ 幂等：deduped:true；且（实现口径）deduped 回执**不带 history** ⇒ 用"真变更才增长"证明它没被计入。
    const rep2 = await callTool('vibe_v5_self_report', { subgoal: 'G6 自报子目标', plan: 'G6 自报计划', status: 'G6 自报状态' }, g6Agent)
    assert(rep2.deduped === true, 'G6-self：同值再提交 ⇒ deduped:true（幂等；got ' + JSON.stringify(rep2.deduped) + '）')
    assert(rep2.history === undefined || !Array.isArray(rep2.history) || rep2.history.length === hist1,
      'G6-self：幂等提交不追加 history（' + hist1 + ' → ' + (Array.isArray(rep2.history) ? rep2.history.length : 'n/a') + '）')
    const rep3 = await callTool('vibe_v5_self_report', { subgoal: 'G6 自报子目标（变更后）' }, g6Agent)
    const hist3 = Array.isArray(rep3.history) ? rep3.history.length : -1
    assert(rep3.deduped !== true && hist3 > hist1,
      'G6-self：真变更才增长 history（' + hist1 + ' → ' + hist3 + ' ⇒ 幂等提交确未计入，旧值不丢）')
  } else if (name === 'g6-other') {
    // G6-other：成员只能改自己；改他人 ⇒ **具名拒绝**。必须要求 code 存在（否则会漏掉"无具名码"的缺陷）。
    const g6OtherAgent = childAgent(childOf('r-1'))
    const repOther = await callTool('vibe_v5_self_report', { member: 'r-2', subgoal: 'G6 越权子目标', plan: 'G6 越权计划', status: 'G6 越权状态', reason: 'g6-other 场景' }, g6OtherAgent)
    assert(repOther.ok === false, 'G6-other：试图修改他人（r-2）⇒ 被拒（ok:false；got ' + JSON.stringify(repOther).slice(0, 140) + '）')
    assert(repOther.code === 'V5_INVALID_ARGUMENT',
      'G6-other：拒绝必须是**具名码** V5_INVALID_ARGUMENT（got code=' + JSON.stringify(repOther.code) + '，不是 error/静默；got ' + JSON.stringify(repOther).slice(0, 140) + '）')
  } else if (name === 'g6-time') {
    // G6-time：时间由框架设置；客户端自带 …At／…Ms ⇒ **显式拒绝**（具名码 ＋ 说明文案），不得静默忽略。
    const g6TimeAgent = childAgent(childOf('r-1'))
    const repTime = await callTool('vibe_v5_self_report', { subgoalAt: 1234567890, subgoal: 'G6 自带时间戳' }, g6TimeAgent)
    assert(repTime.ok === false, 'G6-time：请求自带 subgoalAt ⇒ 被拒（ok:false；got ' + JSON.stringify(repTime).slice(0, 140) + '）')
    assert(repTime.code === 'V5_INVALID_ARGUMENT',
      'G6-time：拒绝必须是**具名码** V5_INVALID_ARGUMENT（got code=' + JSON.stringify(repTime.code) + '）')
    // 收紧：断言**说明文案**含规格原文，而不是靠回执里恰好出现 times 字段（上一轮就是那样误过的）。
    assert(/时间由框架设置/.test(String(repTime.message || '')),
      'G6-time：回执说明含「时间由框架设置」（got message=' + JSON.stringify(repTime.message) + '）')
    // 大小写不敏感（S4/S6 同源加固）：`/(At|Ms)$/` 会漏掉全小写的 `expires_at` ⇒ 必须按 `/i` 拒。
    const repLower = await callTool('vibe_v5_self_report', { subgoal: 'G6 全小写时间戳', expires_at: 1234567890 }, g6TimeAgent)
    assert(repLower.ok === false && repLower.code === 'V5_INVALID_ARGUMENT' && /时间由框架设置/.test(String(repLower.message || '')),
      'G6-time：全小写 expires_at 也不得静默通过（须拒＋「时间由框架设置」；got ' + JSON.stringify(repLower).slice(0, 160) + '）')
  } else if (name === 'g6-nonmember') {
    // G6-nonmember：临时工（t-1）不可写入 ⇒ **具名拒绝 V5_NOT_VOTER**（与 D8 一致）。
    const g6NonAgent = childAgent(childOf('t-1'))
    const repNon = await callTool('vibe_v5_self_report', { subgoal: 'G6 临时工越权自述' }, g6NonAgent)
    assert(repNon.ok === false, 'G6-nonmember：临时工写入被拒（ok:false；got ' + JSON.stringify(repNon).slice(0, 160) + '）')
    assert(repNon.code === 'V5_NOT_VOTER', 'G6-nonmember：拒绝必须是具名码 V5_NOT_VOTER（got code=' + JSON.stringify(repNon.code) + '）')
  } else if (name === 'g6-view') {
    // G6-view：在册成员查看**全体**。实测形状：顶层 {ok,view}；view 键＝roster/nonVoting/viewAuditTail/note；
    // roster[*] 为**扁平**字段；nonVoting 是**成员对象数组**（先归一化取 member/id）；留痕＝viewAuditTail。
    const g6ViewAgent = childAgent(childOf('r-1'))
    const repView = await callTool('vibe_v5_self_report', { view: true }, g6ViewAgent)
    const vw = repView.view || repView
    const roster = vw.roster || vw.members || []
    assert(repView.ok === true && Array.isArray(roster) && roster.length >= 4,
      'G6-view：在册成员可查看全体（ok:' + repView.ok + ' roster=' + roster.length + '）')
    const mine = roster.find((m) => m && (m.member === 'r-2' || m.id === 'r-2')) || roster[0] || {}
    assert('overall' in mine && 'subgoal' in mine && 'plan' in mine && 'status' in mine,
      'G6-view：每名成员带工作状态字段（got keys=' + JSON.stringify(Object.keys(mine)) + '）')
    assert('overallAt' in mine && 'subgoalAt' in mine && 'planAt' in mine,
      'G6-view：每名成员带 overallAt/subgoalAt/planAt（got keys=' + JSON.stringify(Object.keys(mine)) + '）')
    const memberAllowed = ['member', 'id', 'kind', 'voting', 'nonVoting', 'overall', 'overallAt', 'subgoal',
      'subgoalAt', 'plan', 'planAt', 'status', 'updatedAt', 'updatedBy', 'deviation', 'role']
    const memberExtra = []
    for (const m of roster) for (const k of Object.keys(m || {})) if (memberAllowed.indexOf(k) === -1 && memberExtra.indexOf(k) === -1) memberExtra.push(k)
    assert(memberExtra.length === 0,
      'G6-view：roster 成员字段**不含私聊/消息字段**（白名单外键=' + JSON.stringify(memberExtra) + '）')
    const tail = vw.viewAuditTail !== undefined ? vw.viewAuditTail : repView.viewAuditTail
    assert(tail !== undefined, 'G6-view：留痕存在（view.viewAuditTail；keys=' + JSON.stringify(Object.keys(vw)) + '）')
    const tailArr = Array.isArray(tail) ? tail : [tail]
    assert(JSON.stringify(tailArr[tailArr.length - 1]).indexOf('r-1') !== -1,
      'G6-view：留痕尾部含本次查看者 r-1（got=' + JSON.stringify(tail).slice(0, 160) + '）')
    const nv = Array.isArray(vw.nonVoting) ? vw.nonVoting : (Array.isArray(repView.nonVoting) ? repView.nonVoting : [])
    const nvIds = (Array.isArray(nv) ? nv : []).map((v) => (typeof v === 'string' ? v : (v && (v.member || v.id)) || ''))
    assert(Array.isArray(nv) && nvIds.indexOf('t-1') !== -1,
      'G6-view：列席/受邀/临时工单列并标注（含 t-1；got ' + JSON.stringify(nv).slice(0, 200) + '）')
  } else if (name === 'g6-history-deviation') {
    // G6-history-deviation：院士以 source:'academician' **为 r-1 设定** overall（基线）⇒ r-1 改自己的 overall
    // ⇒ "作者≠调用者" ⇒ deviation（keptValue/keptAt）＋ deviationLabel='已偏离院士设定' ＋ history 两条。
    const g6DevAgent = childAgent(childOf('r-1'))
    const setAcad = await callTool('vibe_v5_self_report', { member: 'r-1', overall: 'G6 院士总览（原始）', source: 'academician' }, childAgent(childOf('acad')))
    console.log('  dev4-setacad: ' + JSON.stringify(setAcad).slice(0, 400))
    assert(setAcad.ok === true, 'G6-history-deviation：院士可为他人（r-1）设定 overall（source:academician；got ' + JSON.stringify(setAcad).slice(0, 160) + '）')
    const ch1 = await callTool('vibe_v5_self_report', { overall: 'G6 成员总览（第一次偏离）' }, g6DevAgent)
    assert(ch1.ok === true, 'G6-history-deviation：成员可改自己的 overall（got ' + JSON.stringify(ch1).slice(0, 140) + '）')
    const view1 = await callTool('vibe_v5_self_report', { view: true }, g6DevAgent)
    const vw1 = view1.view || view1
    const roster1 = vw1.roster || []
    const row1 = roster1.find((m) => m && (m.member === 'r-1' || m.id === 'r-1')) || {}
    const dev1 = ch1.deviation || row1.deviation || null
    console.log('  dev4-receipt: ' + JSON.stringify(ch1).slice(0, 520))
    console.log('  dev4-row1: ' + JSON.stringify(row1).slice(0, 420))
    assert(!!dev1, 'G6-history-deviation：成员改 overall ⇒ deviation 出现（回执=' + JSON.stringify(ch1.deviation) + ' 查看面行=' + JSON.stringify(row1.deviation) + '）')
    const flat = JSON.stringify(dev1)
    assert(flat.indexOf('G6 院士总览（原始）') !== -1,
      'G6-history-deviation：保留院士原值 keptValue（got ' + flat.slice(0, 220) + '）')
    assert(/keptAt|keptAcademicianAt|at/.test(flat),
      'G6-history-deviation：保留院士旧时间 keptAt（got ' + flat.slice(0, 220) + '）')
    const label = vw1.deviationLabel || row1.deviationLabel || (dev1 && dev1.label) || ''
    assert(String(label) === '已偏离院士设定' || /已偏离院士设定/.test(JSON.stringify(view1)),
      'G6-history-deviation：查看面标注 deviationLabel＝「已偏离院士设定」（got ' + JSON.stringify(label) + '）')
    const h1 = Array.isArray(ch1.history) ? ch1.history.length : -1
    const ch2 = await callTool('vibe_v5_self_report', { overall: 'G6 成员总览（第二次偏离）' }, g6DevAgent)
    const h2 = Array.isArray(ch2.history) ? ch2.history.length : -1
    assert(h2 === h1 + 1, 'G6-history-deviation：连续两次修改 ⇒ history +1（' + h1 + ' → ' + h2 + '）')
    assert(JSON.stringify(ch2.history || []).indexOf('第一次偏离') !== -1,
      'G6-history-deviation：旧值不丢（history 含第一次的值；got ' + JSON.stringify(ch2.history).slice(0, 200) + '）')
    const view2 = await callTool('vibe_v5_self_report', { view: true }, g6DevAgent)
    const row1b = ((view2.view || view2).roster || []).find((m) => m && (m.member === 'r-1' || m.id === 'r-1')) || {}
    assert(!!(ch2.deviation || row1b.deviation),
      'G6-history-deviation：第二次修改后 deviation 仍在（回执=' + JSON.stringify(ch2.deviation) + ' 查看面行=' + JSON.stringify(row1b.deviation) + '）')
  } else if (name === 's4-proxy-acad') {
    // S4-proxy-acad：**仅院士**可指定代行；成功 ⇒ chair={id,since,proxy} 入档（耐久）；`scope` **唯一**
    // 取值 `'close'`（其它值具名拒绝）；代行**不产生新票权**（票权集合与 voterCount 不变）。
    const mt = await openMeeting('S4 主持代行探测')
    assert(!!mt && !!mt.id, 'S4-proxy-acad：会议已开启（status.meeting=' + JSON.stringify(mt && mt.id) + '）')
    const before = await callTool('vibe_v5_status', {})
    const votersBefore = (before.quorum && Array.isArray(before.quorum.voters)) ? before.quorum.voters.map(String).sort().join(',') : ''
    const set = await callTool('vibe_v5_chair_proxy', { member: 'r-2', scope: 'close', why: '院士外出，授权 r-2 收束' }, childAgent(childOf('acad')))
    assert(set.ok === true && !!set.chair, 'S4-proxy-acad：院士指定代行 ⇒ ok:true（got ' + JSON.stringify(set).slice(0, 180) + '）')
    assert(!!set.chair && set.chair.id === 'acad' && set.chair.proxy === 'r-2' && Number(set.chair.since) > 0,
      'S4-proxy-acad：chair={id,since,proxy} 入档（got ' + JSON.stringify(set.chair) + '）')
    const stFile = await waitV5State((s) => !!(s.institutes['default::institute'].chair))
    const chairDurable = stFile && stFile.institutes['default::institute'].chair
    assert(!!chairDurable && chairDurable.id === 'acad' && chairDurable.proxy === 'r-2',
      'S4-proxy-acad：代行写入耐久 State（chair.proxy=r-2；got ' + JSON.stringify(chairDurable) + '）')
    const badScope = await callTool('vibe_v5_chair_proxy', { member: 'r-3', scope: 'all', why: '想拿全部权限' }, childAgent(childOf('acad')))
    assert(badScope.ok === false && badScope.code === 'V5_INVALID_ARGUMENT',
      'S4-proxy-acad：scope 只接受 close（其它值 ⇒ 具名拒绝 V5_INVALID_ARGUMENT；got ' + JSON.stringify(badScope).slice(0, 180) + '）')
    const after = await callTool('vibe_v5_status', {})
    const votersAfter = (after.quorum && Array.isArray(after.quorum.voters)) ? after.quorum.voters.map(String).sort().join(',') : ''
    assert(after.quorum.voterCount === before.quorum.voterCount && votersAfter === votersBefore,
      'S4-proxy-acad：代行不产生新票权（票权集合 ' + votersBefore + ' ⇒ ' + votersAfter + '，voterCount=' + after.quorum.voterCount + '）')
  } else if (name === 's4-proxy-denied') {
    // S4-proxy-denied：常驻研究员尝试指定代行 ⇒ 具名拒绝 V5_NOT_ACADEMICIAN，且**无副作用**（不入档）。
    await openMeeting('S4 非院士代行探测')
    const denied = await callTool('vibe_v5_chair_proxy', { member: 'r-2', scope: 'close', why: '常驻研究员尝试自任' }, childAgent(childOf('r-1')))
    assert(denied.ok === false && denied.code === 'V5_NOT_ACADEMICIAN',
      'S4-proxy-denied：非院士指定代行 ⇒ 具名拒绝 V5_NOT_ACADEMICIAN（got ' + JSON.stringify(denied).slice(0, 180) + '）')
    const stFile = await waitV5State()
    const chair = stFile && stFile.institutes['default::institute'].chair
    assert(!chair, 'S4-proxy-denied：拒绝无副作用（耐久 State 里没有 chair 记录；got ' + JSON.stringify(chair) + '）')
  } else if (name === 's4-proxy-time') {
    // S4-proxy-time：用户自带任何 …At／…Ms（含 until）⇒ 被拒（V5_INVALID_ARGUMENT）＋ 文案含「时间由框架设置」。
    await openMeeting('S4 用户自带时间探测')
    const repTime = await callTool('vibe_v5_chair_proxy', { member: 'r-2', scope: 'close', why: '带 until 的请求', until: 1234567890 }, childAgent(childOf('acad')))
    assert(repTime.ok === false && repTime.code === 'V5_INVALID_ARGUMENT',
      'S4-proxy-time：请求自带 until ⇒ 被拒（具名码 V5_INVALID_ARGUMENT；got ' + JSON.stringify(repTime).slice(0, 180) + '）')
    assert(/时间由框架设置/.test(String(repTime.message || '')),
      'S4-proxy-time：回执说明含「时间由框架设置」（got message=' + JSON.stringify(repTime.message) + '）')
    const repMs = await callTool('vibe_v5_chair_proxy', { member: 'r-2', scope: 'close', why: '带 …Ms', timeoutMs: 1000 }, childAgent(childOf('acad')))
    assert(repMs.ok === false && repMs.code === 'V5_INVALID_ARGUMENT',
      'S4-proxy-time：请求自带 …Ms 同样一律拒绝（got ' + JSON.stringify(repMs).slice(0, 180) + '）')
    // 大小写不敏感（S6 同源加固）：`/(At|Ms)$/` 会漏掉全小写的 `expires_at` ⇒ 必须按 `/i` 拒。
    const repLower = await callTool('vibe_v5_chair_proxy', { member: 'r-2', scope: 'close', why: '带全小写 expires_at', expires_at: 1234567890 }, childAgent(childOf('acad')))
    assert(repLower.ok === false && repLower.code === 'V5_INVALID_ARGUMENT' && /时间由框架设置/.test(String(repLower.message || '')),
      'S4-proxy-time：全小写 expires_at 也不得静默通过（须拒＋「时间由框架设置」；got ' + JSON.stringify(repLower).slice(0, 180) + '）')
  } else if (name === 's4-objection') {
    // S4-objection：在册成员提程序异议 ⇒ 入档（by/at/why）且 chairReplyPending:true **可见**（不得假装已回填）；
    // 留痕落在群聊与会议纪要（耐久）；列席/临时工 ⇒ 具名 V5_NOT_VOTER。
    const mt = await openMeeting('S4 程序异议探测')
    const obj = await callTool('vibe_v5_procedural_objection', { why: '我觉得收束流程跳过了边界情形' }, childAgent(childOf('r-1')))
    assert(obj.ok === true && !!obj.objection, 'S4-objection：在册成员提异议 ⇒ ok:true（got ' + JSON.stringify(obj).slice(0, 200) + '）')
    const o = obj.objection || {}
    assert(o.by === 'r-1' && String(o.why).indexOf('边界情形') !== -1 && Number(o.at) > 0,
      'S4-objection：异议入档（by=r-1、why、at>0；got ' + JSON.stringify(o) + '）')
    assert(o.chairReply === null && o.chairReplyPending === true && obj.chairReplyPending === true,
      'S4-objection：chairReplyPending:true 必须可见（不得假装已回填；got ' + JSON.stringify({ chairReply: o.chairReply, objectionPending: o.chairReplyPending, receiptPending: obj.chairReplyPending }) + '）')
    const chat = chatTextR10()
    assert(/【程序异议/.test(chat) && /待主持回应/.test(chat),
      'S4-objection：异议留痕可见（群聊含【程序异议】与「待主持回应」）')
    const mtFile = join(instDir, 'Shared', 'Meetings', String(mt && mt.id) + '.md')
    const mtText = existsSync(mtFile) ? readFileSync(mtFile, 'utf8') : ''
    assert(/程序异议/.test(mtText) && /chairReplyPending=true/.test(mtText),
      'S4-objection：异议写入会议纪要（耐久；got=' + JSON.stringify(String(mtText).slice(-160)) + '）')
    const nonVoter = await callTool('vibe_v5_procedural_objection', { why: '临时工也想提' }, childAgent(childOf('t-1')))
    assert(nonVoter.ok === false && nonVoter.code === 'V5_NOT_VOTER',
      'S4-objection：临时工提异议 ⇒ 具名拒绝 V5_NOT_VOTER（got ' + JSON.stringify(nonVoter).slice(0, 180) + '）')
  } else if (name === 's4-no-weight') {
    // S4-no-weight：**同一票型**在"无主持"与"有代行"两种情形下结论必须相同（R5：主持不额外加权）。
    // 票型取 m 的边界：2 张布尔真 + 2 张显式弃权（m=3 ⇒ 无主持时**未定论**；若代行被加权 ⇒ 会翻成"真"）。
    await callTool('vibe_v5_set', { verdictMaxRounds: 1, activityTimeoutMs: 120000 }, ROOT)
    const pattern = { acad: 1, 'r-1': 1, 'r-2': 'abstain', 'r-3': 'abstain' }
    const ctrlProp = await fresh('p-s4n1', 'S4 主持不加权对照：同一票型。')
    assert(ctrlProp.ok === true, 'S4-no-weight：对照组对象进入验证（got ' + JSON.stringify(ctrlProp).slice(0, 140) + '）')
    await waitVerify('p-s4n1')
    await castAll('p-s4n1', pattern)
    const ctrl = await closedRecOf('p-s4n1')
    assert(!!ctrl && ctrl.outcome === 'undecided',
      'S4-no-weight：对照组（无主持）边界票型 ⇒ 未定论（got outcome=' + JSON.stringify(ctrl && ctrl.outcome) + '）')
    const mt = await openMeeting('S4 主持不加权探测')
    assert(!!mt, 'S4-no-weight：会议已开启（为指定代行）')
    const set = await callTool('vibe_v5_chair_proxy', { member: 'r-2', scope: 'close', why: '同一票型比较用代行' }, childAgent(childOf('acad')))
    assert(set.ok === true, 'S4-no-weight：代行已指定（got ' + JSON.stringify(set).slice(0, 160) + '）')
    await waitV5State((s) => !!(s.institutes['default::institute'].chair))
    await waitMeetingClosed()
    const testProp = await fresh('p-s4n2', 'S4 主持不加权：同一票型（有代行）。')
    assert(testProp.ok === true, 'S4-no-weight：实验组对象进入验证（got ' + JSON.stringify(testProp).slice(0, 140) + '）')
    await waitVerify('p-s4n2')
    await castAll('p-s4n2', pattern)
    const test = await closedRecOf('p-s4n2')
    assert(!!test && test.outcome === ctrl.outcome,
      'S4-no-weight：主持/代行不改变结论（同一票型：无主持=' + ctrl.outcome + '，有代行=' + (test && test.outcome) + '）')
  } else if (name === 's4-idempotent') {
    // S4-idempotent：两工具的同值重复 ⇒ deduped:true 且**不追加历史**（代行不刷新 since；异议在纪要里只出现一次）。
    const mt = await openMeeting('S4 幂等探测')
    const c1 = await callTool('vibe_v5_chair_proxy', { member: 'r-2', scope: 'close', why: '幂等探测' }, childAgent(childOf('acad')))
    const c2 = await callTool('vibe_v5_chair_proxy', { member: 'r-2', scope: 'close', why: '幂等探测' }, childAgent(childOf('acad')))
    assert(c1.ok === true && c1.deduped !== true, 'S4-idempotent：第一次代行 ⇒ 真入档（deduped 不出现；got ' + JSON.stringify(c1).slice(0, 160) + '）')
    assert(c2.ok === true && c2.deduped === true,
      'S4-idempotent：代行同值重复 ⇒ deduped:true（got ' + JSON.stringify(c2).slice(0, 160) + '）')
    assert(!!c2.chair && Number(c2.chair.since) === Number(c1.chair.since),
      'S4-idempotent：代行幂等不刷新 since、不追加历史（got ' + JSON.stringify(c2.chair) + '）')
    const o1 = await callTool('vibe_v5_procedural_objection', { why: '幂等异议' }, childAgent(childOf('r-2')))
    const o2 = await callTool('vibe_v5_procedural_objection', { why: '幂等异议' }, childAgent(childOf('r-2')))
    assert(o1.ok === true && o1.deduped !== true, 'S4-idempotent：第一次异议 ⇒ 真入档（got ' + JSON.stringify(o1).slice(0, 160) + '）')
    assert(o2.ok === true && o2.deduped === true && !!o2.objection && Number(o2.objection.at) === Number((o1.objection || {}).at),
      'S4-idempotent：异议同值重复 ⇒ deduped:true 且不追加历史（at 不变；got ' + JSON.stringify(o2).slice(0, 180) + '）')
    const mtFile = join(instDir, 'Shared', 'Meetings', String(mt && mt.id) + '.md')
    const mtText = existsSync(mtFile) ? readFileSync(mtFile, 'utf8') : ''
    const hits = (mtText.match(/幂等异议/g) || []).length
    assert(hits === 1, 'S4-idempotent：幂等异议在会议纪要里只出现一次（got ' + hits + '）')
  } else if (name === 's5-stall-notice') {
    // S5-stall-notice：静止 ⇒ **会议不变**（status.meeting 仍 null ⇒ 框架不自动召集）＋ **恰一条**
    // 「研究所提示」（含「谁在等谁」）＋ report() 有该节 ＋ 耐久 stallNotice={at,sinceAt,waiting}。
    await callTool('vibe_v5_set', { stallAutoMeetingMs: 1000, activityTimeoutMs: 120000, chatDigestMs: 150 }, ROOT)
    await sleep(1300)
    const n1 = await driveUntilNotice(1, 120)
    const stDiag = await callTool('vibe_v5_status', {})
    assert(n1 === 1, 'S5-stall-notice：静止提示恰一条（got ' + n1
      + '；phase=' + String(stDiag.phase) + ' meeting=' + JSON.stringify(stDiag.meeting)
      + ' parkedMeeting=' + JSON.stringify(stDiag.parkedMeeting) + ' verify=' + JSON.stringify(stDiag.verify)
      + ' 距上次进展ms=' + (Date.now() - Number(stDiag.lastProgressAt))
      + ' busy=[' + (stDiag.members || []).filter((m) => m.busy).map((m) => m.id).join(',') + ']'
      + ' wakes=' + wakes.length + '）')
    const chat = chatTextR10()
    assert(/谁在等谁/.test(chat), 'S5-stall-notice：提示须列出谁在等谁（got=' + JSON.stringify(String(chat).slice(-260)) + '）')
    const st = await callTool('vibe_v5_status', {})
    assert(st.meeting === null, 'S5-stall-notice：会议不变（框架不自动召集；got meeting=' + JSON.stringify(st.meeting) + '）')
    const rep = await callTool('vibe_v5_report', {})
    const repText = String((rep && rep.report) || '')
    assert(/静止提示/.test(repText) && /谁在等谁/.test(repText),
      'S5-stall-notice：report() 须含静止提示节（got len=' + repText.length + '）')
    const notice = durableNotice()
    assert(!!notice && Number(notice.at) > 0 && Number(notice.sinceAt) > 0 && Array.isArray(notice.waiting),
      'S5-stall-notice：耐久 stallNotice={at,sinceAt,waiting}（got ' + JSON.stringify(notice) + '）')
    // 负值＝关闭（D10 可调政策）：先制造**真实进展**开启新片段，再关闭提示 ⇒ 不得出现第二条。
    const offSet = await callTool('vibe_v5_set', { stallAutoMeetingMs: -1 }, ROOT)
    assert(Number((offSet.params || {}).stallAutoMeetingMs) === -1,
      'S5-stall-notice：负值须真的写进参数（不得被"非正即删"守卫静默丢弃；got ' + JSON.stringify((offSet.params || {}).stallAutoMeetingMs) + '）')
    await callTool('vibe_v5_task_create', { subject: 'S5 关闭开关探测', description: '制造新片段以检验关闭' }, childAgent(childOf('r-1')))
    await sleep(1300)
    const offCount = await driveUntilNotice(2, 30)
    assert(offCount === 1, 'S5-stall-notice：stallAutoMeetingMs 负值＝关闭（got ' + offCount + ' 条）')
  } else if (name === 's5-notice-once') {
    // S5-notice-once：同一静止片段**只提示一次**（多轮心跳都不重发、`at` 不刷新）；
    // 真实进展（`markProgress`）之后 ⇒ 新片段允许**第 2 条**（证明"每片段一次"，不是"全生命周期一次"）。
    await callTool('vibe_v5_set', { stallAutoMeetingMs: 1000, activityTimeoutMs: 120000, chatDigestMs: 150 }, ROOT)
    await sleep(1300)
    assert(await driveUntilNotice(1, 120) === 1, 'S5-notice-once：第一条提示已出现')
    const at1 = Number((durableNotice() || {}).at || 0)
    const c1 = await driveUntilNotice(2, 40)
    assert(c1 === 1, 'S5-notice-once：同一静止片段内不得重发（got ' + c1 + '）')
    const at2 = Number((durableNotice() || {}).at || 0)
    assert(at2 === at1, 'S5-notice-once：提示不得被刷新（at 不变；' + at1 + ' → ' + at2 + '）')
    const lp1 = Number((await callTool('vibe_v5_status', {})).lastProgressAt)
    const tp = await callTool('vibe_v5_task_create', { subject: 'S5 进展探测', description: '为证明"每片段一次"而制造的真实进展' }, childAgent(childOf('r-1')))
    assert(tp.ok === true, 'S5-notice-once：须能制造真实进展（task_create ok；got ' + JSON.stringify(tp).slice(0, 140) + '）')
    const lp2 = Number((await callTool('vibe_v5_status', {})).lastProgressAt)
    assert(lp2 > lp1, 'S5-notice-once：真实进展须推进 lastProgressAt（' + lp1 + ' → ' + lp2 + '）')
    await sleep(1300)
    const c2 = await driveUntilNotice(2, 120)
    const dn2 = durableNotice() || {}
    const st2 = await callTool('vibe_v5_status', {})
    assert(c2 === 2, 'S5-notice-once：真实进展之后允许第二条（got ' + c2
      + '；notice.sinceAt=' + Number(dn2.sinceAt || 0) + ' at=' + Number(dn2.at || 0)
      + ' 距上次进展ms=' + (Date.now() - Number(st2.lastProgressAt))
      + ' busy=[' + (st2.members || []).filter((m) => m.busy).map((m) => m.id).join(',') + ']'
      + ' wakes=' + wakes.length + '）')
  } else if (name === 's5-no-auto-close') {
    // S5-no-auto-close（防回归 R32/R33）：静止期间**不自动收束/不散会/不推进阶段/不代成员表态**。
    await callTool('vibe_v5_set', { stallAutoMeetingMs: 1000, activityTimeoutMs: 120000, chatDigestMs: 150 }, ROOT)
    const snap = async () => {
      const s = await callTool('vibe_v5_status', {})
      const st = readV5State() || {}
      const inst = (st.institutes || {})['default::institute'] || {}
      return {
        meeting: JSON.stringify(s.meeting), verify: JSON.stringify(s.verify), phase: String(s.phase),
        verified: JSON.stringify(s.verified), verifiedTrue: JSON.stringify(s.verifiedTrue),
        undecided: JSON.stringify(s.undecided), solveVotes: JSON.stringify(s.solveVotes),
        verdictKeys: JSON.stringify(Object.keys(inst.verdicts || {}).sort()),
        solveKeys: JSON.stringify(Object.keys(inst.solve || {}).sort()),
      }
    }
    const before = await snap()
    await sleep(1300)
    await driveUntilNotice(1, 120)
    await driveUntilNotice(1, 40)
    const after = await snap()
    assert(Object.keys(before).length > 0, 'non-vacuous: the snapshot must expose fields to compare (' + Object.keys(before).length + ')')
    for (const k of Object.keys(before)) {
      assert(after[k] === before[k], 'S5-no-auto-close：静止期间 ' + k + ' 不变（' + before[k] + ' ⇒ ' + after[k] + '）')
    }
  } else if (name === 's5-waiting-graph') {
    // S5-waiting-graph：等待清单来自**真实依赖** ⇒ 提示文本含被挡者 id 与阻挡者 id。
    const board = await callTool('vibe_v5_task_list', {})
    const preBlocked = (board.tasks || []).filter((t) => Array.isArray(t.blockedBy) && t.blockedBy.length)
    assert(preBlocked.length === 0, 'S5-waiting-graph：前置＝板上还没有被挡任务（got ' + JSON.stringify(preBlocked.map((t) => t.id)) + '）')
    const tA = await callTool('vibe_v5_task_create', { subject: 'S5 前置任务 A', description: '被 B 依赖' }, childAgent(childOf('r-1')))
    const tAid = String((tA.task || {}).id)
    const tB = await callTool('vibe_v5_task_create', { subject: 'S5 被挡任务 B', description: '等 A 完成', blocked_by: [tAid] }, childAgent(childOf('r-1')))
    const tBid = String((tB.task || {}).id)
    assert(tA.ok === true && tB.ok === true && !!tAid && !!tBid,
      'S5-waiting-graph：依赖对已建（got ' + JSON.stringify([tA.ok, tAid, tB.ok, tBid]) + '）')
    await callTool('vibe_v5_set', { stallAutoMeetingMs: 1000, activityTimeoutMs: 120000, chatDigestMs: 150 }, ROOT)
    await sleep(1300)
    assert(await driveUntilNotice(1, 120) >= 1, 'S5-waiting-graph：静止提示已出现')
    const waited = JSON.stringify((durableNotice() || {}).waiting || [])
    assert(waited.indexOf(tBid) !== -1 && waited.indexOf(tAid) !== -1,
      'S5-waiting-graph：提示须列出被挡者与阻挡者 id（want ' + tBid + '/' + tAid + '；got=' + waited + '）')
  } else if (name === 's6-grant-ok') {
    // S6-grant-ok：院士可把有界枚举里的命令授给在册成员 ⇒ 被授权者真的能调用；台账耐久可见；**票权不变**。
    const votersBefore = JSON.stringify(((await callTool('vibe_v5_status', {})).quorum || {}).voters)
    const g1 = await callTool('vibe_v5_grant', { to: 'r-1', command: 'assign', grant_scope: 'once', why: 'S6 授权探测' }, childAgent(childOf('acad')))
    assert(g1.ok === true && !!g1.grant && /^g-\d+$/.test(String(g1.grant.id)),
      'S6-grant-ok：院士可授（once；got ' + JSON.stringify(g1).slice(0, 200) + '）')
    assert(g1.grant.grantScope === 'once' && g1.grant.expiresOn === 'once' && Number(g1.grant.revokedAt) === 0,
      'S6-grant-ok：回执 grantScope=once／expiresOn=once／revokedAt=0（got ' + JSON.stringify(g1.grant) + '）')
    const asg = await callTool('vibe_v5_assign', { to: 'r-2', why: '被授权者分派', acceptance: '完成并回报' }, childAgent(childOf('r-1')))
    assert(asg.ok === true, 'S6-grant-ok：被授权者调用 assign 成功（基线会 V5_NOT_ACADEMICIAN；got ' + JSON.stringify(asg).slice(0, 160) + '）')
    const g2 = await callTool('vibe_v5_grant', { to: 'r-2', command: 'convene', grant_scope: 'once', why: 'S6 召集授权' }, childAgent(childOf('acad')))
    assert(g2.ok === true, 'S6-grant-ok：convene 也可授（got ' + JSON.stringify(g2).slice(0, 160) + '）')
    const mt = await callTool('vibe_v5_meeting', { agenda: 'S6 被授权者召集', kind: 'sync' }, childAgent(childOf('r-2')))
    assert(mt.ok === true && !!mt.meeting, 'S6-grant-ok：被授权者真的能召集会议（got ' + JSON.stringify(mt).slice(0, 160) + '）')
    const ledger = durableGrants()
    assert(ledger.some((x) => x.id === g1.grant.id && x.to === 'r-1' && x.command === 'assign')
      && ledger.some((x) => x.command === 'convene' && x.to === 'r-2'),
      'S6-grant-ok：台账耐久入档（got ' + JSON.stringify(ledger.map((x) => [x.id, x.to, x.command])) + '）')
    const st = await callTool('vibe_v5_status', {})
    assert(JSON.stringify(st.quorum.voters) === votersBefore && st.quorum.voterCount === 4,
      'S6-grant-ok：授权不产生新票权（voters 不变；got ' + JSON.stringify(st.quorum.voters) + '）')
    const rep = String(((await callTool('vibe_v5_report', {})) || {}).report || '')
    assert(rep.indexOf('临时授权') !== -1 && rep.indexOf(String(g1.grant.id)) !== -1,
      'S6-grant-ok：report() 呈现授权台账（got len=' + rep.length + '）')
  } else if (name === 's6-not-granted') {
    // S6-not-granted：**基线不被放宽**——未授权成员仍被具名拒绝；非院士**不能**授权。
    const asg = await callTool('vibe_v5_assign', { to: 'r-2', why: '未授权尝试', acceptance: 'x' }, childAgent(childOf('r-1')))
    assert(asg.ok === false && asg.code === 'V5_NOT_ACADEMICIAN',
      'S6-not-granted：未授权 assign ⇒ V5_NOT_ACADEMICIAN（got ' + JSON.stringify(asg).slice(0, 160) + '）')
    const nud = await callTool('vibe_v5_nudge', { to: 'r-2', why: '未授权督办' }, childAgent(childOf('r-1')))
    assert(nud.ok === false && nud.code === 'V5_NOT_ACADEMICIAN',
      'S6-not-granted：未授权 nudge ⇒ V5_NOT_ACADEMICIAN（got ' + JSON.stringify(nud).slice(0, 160) + '）')
    const endv = await callTool('vibe_v5_end_verify', { target: 'p-r-1', reason: '未授权尝试' }, childAgent(childOf('r-1')))
    assert(endv.ok === false && endv.code === 'V5_NOT_ACADEMICIAN',
      'S6-not-granted：end_verify 仍仅院士（R10-2a；got ' + JSON.stringify(endv).slice(0, 160) + '）')
    const byMember = await callTool('vibe_v5_grant', { to: 'r-2', command: 'assign', grant_scope: 'once', why: '非院士尝试' }, childAgent(childOf('r-1')))
    assert(byMember.ok === false && byMember.code === 'V5_NOT_ACADEMICIAN',
      'S6-not-granted：非院士不能授权（D1；got ' + JSON.stringify(byMember).slice(0, 160) + '）')
    assert(durableGrants().length === 0, 'S6-not-granted：拒绝无副作用（台账仍空；got ' + JSON.stringify(durableGrants()) + '）')
  } else if (name === 's6-scope-expire') {
    // S6-scope-expire：**自动失效**——once 用一次即失效；meeting 会议收束即失效（并在账上标 expiredAt）。
    const gOnce = await callTool('vibe_v5_grant', { to: 'r-1', command: 'nudge', grant_scope: 'once', why: 'S6 once 到期' }, childAgent(childOf('acad')))
    assert(gOnce.ok === true, 'S6-scope-expire：once 授权成功（got ' + JSON.stringify(gOnce).slice(0, 160) + '）')
    const n1 = await callTool('vibe_v5_nudge', { to: 'r-3', why: '用掉一次性授权' }, childAgent(childOf('r-1')))
    assert(n1.ok === true, 'S6-scope-expire：once 授权第一次可用（got ' + JSON.stringify(n1).slice(0, 160) + '）')
    const used = durableGrants().filter((x) => x.id === gOnce.grant.id)[0] || {}
    assert(Number(used.usedAt) > 0, 'S6-scope-expire：一次性授权在获批那一刻被消费（usedAt>0；got ' + JSON.stringify(used) + '）')
    const n2 = await callTool('vibe_v5_nudge', { to: 'r-3', why: '再用一次' }, childAgent(childOf('r-1')))
    assert(n2.ok === false && n2.code === 'V5_NOT_ACADEMICIAN',
      'S6-scope-expire：once 用掉后自动失效（got ' + JSON.stringify(n2).slice(0, 160) + '）')
    const mt = await openMeeting('S6 授权到期探测')
    assert(!!mt && !!mt.id, 'S6-scope-expire：前置会议已开启（got ' + JSON.stringify(mt && mt.id) + '）')
    const gMeet = await callTool('vibe_v5_grant', { to: 'r-2', command: 'prioritize', grant_scope: 'meeting', why: 'S6 会议范围' }, childAgent(childOf('acad')))
    assert(gMeet.ok === true && String(gMeet.grant.expiresOn).indexOf('meeting:') === 0,
      'S6-scope-expire：meeting 授权记录 expiresOn=meeting:<id>（got ' + JSON.stringify(gMeet.grant) + '）')
    const tk = await callTool('vibe_v5_task_create', { subject: 'S6 优先级标的', description: '供被授权者改优先级' }, childAgent(childOf('acad')))
    const tkid = String((tk.task || {}).id)
    const p1 = await callTool('vibe_v5_prioritize', { order: [{ task_id: tkid, priority: 5 }], why: '被授权者排序' }, childAgent(childOf('r-2')))
    assert(p1.ok === true, 'S6-scope-expire：meeting 授权在会议进行中可用（got ' + JSON.stringify(p1).slice(0, 160) + '）')
    await waitMeetingClosed()
    const p2 = await callTool('vibe_v5_prioritize', { order: [{ task_id: tkid, priority: 9 }], why: '会后再说' }, childAgent(childOf('r-2')))
    assert(p2.ok === false && p2.code === 'V5_NOT_ACADEMICIAN',
      'S6-scope-expire：会议收束后自动失效（got ' + JSON.stringify(p2).slice(0, 160) + '）')
    const closed = durableGrants().filter((x) => x.id === gMeet.grant.id)[0] || {}
    assert(Number(closed.expiredAt) > 0, 'S6-scope-expire：收束在账上标记 expiredAt（got ' + JSON.stringify(closed) + '）')
  } else if (name === 's6-revoke') {
    // S6-revoke：显式撤回 ⇒ 立即失效 ＋ **写事件并广播**（SPEC P6）；重复撤回幂等。
    const mt = await openMeeting('S6 撤回探测')
    assert(!!mt && !!mt.id, 'S6-revoke：前置会议已开启')
    const g = await callTool('vibe_v5_grant', { to: 'r-3', command: 'prioritize', grant_scope: 'meeting', why: 'S6 撤回对象' }, childAgent(childOf('acad')))
    assert(g.ok === true, 'S6-revoke：授权成功（got ' + JSON.stringify(g).slice(0, 160) + '）')
    const tk = await callTool('vibe_v5_task_create', { subject: 'S6 撤回标的', description: '供撤回前后对照' }, childAgent(childOf('acad')))
    const tkid = String((tk.task || {}).id)
    const okBefore = await callTool('vibe_v5_prioritize', { order: [{ task_id: tkid, priority: 3 }], why: '撤回前可用' }, childAgent(childOf('r-3')))
    assert(okBefore.ok === true, 'S6-revoke：撤回前被授权者可用（got ' + JSON.stringify(okBefore).slice(0, 160) + '）')
    const rv = await callTool('vibe_v5_revoke', { grant_id: String(g.grant.id), why: 'S6 撤回理由' }, childAgent(childOf('acad')))
    assert(rv.ok === true && Number(rv.revoked.revokedAt) > 0,
      'S6-revoke：撤回成功且写 revokedAt（got ' + JSON.stringify(rv).slice(0, 200) + '）')
    assert(/【临时授权·撤回】/.test(chatTextR10()), 'S6-revoke：撤回写事件并广播（群聊含【临时授权·撤回】）')
    const okAfter = await callTool('vibe_v5_prioritize', { order: [{ task_id: tkid, priority: 7 }], why: '撤回后应被拒' }, childAgent(childOf('r-3')))
    assert(okAfter.ok === false && okAfter.code === 'V5_NOT_ACADEMICIAN',
      'S6-revoke：撤回后立即回到默认表（got ' + JSON.stringify(okAfter).slice(0, 160) + '）')
    const rv2 = await callTool('vibe_v5_revoke', { grant_id: String(g.grant.id), why: '重复撤回' }, childAgent(childOf('acad')))
    assert(rv2.ok === true && rv2.deduped === true, 'S6-revoke：重复撤回幂等 deduped（got ' + JSON.stringify(rv2).slice(0, 160) + '）')
  } else if (name === 's6-no-vote-power') {
    // S6-no-vote-power（D8）：授权**不产生票权**、**不写票面**；列席/受邀/临时工不可被授权（校验先于写台账）。
    const before = await callTool('vibe_v5_status', {})
    const g = await callTool('vibe_v5_grant', { to: 'r-2', command: 'assign', grant_scope: 'once', why: 'S6 票权探测' }, childAgent(childOf('acad')))
    assert(g.ok === true, 'S6-no-vote-power：授权成功（got ' + JSON.stringify(g).slice(0, 160) + '）')
    const after = await callTool('vibe_v5_status', {})
    assert(after.quorum.voterCount === before.quorum.voterCount && JSON.stringify(after.quorum.voters) === JSON.stringify(before.quorum.voters),
      'S6-no-vote-power：票权集合不变（' + JSON.stringify(before.quorum.voters) + ' ⇒ ' + JSON.stringify(after.quorum.voters) + '，voterCount=' + after.quorum.voterCount + '）')
    assert(JSON.stringify(after.solveVotes) === JSON.stringify(before.solveVotes)
      && JSON.stringify(after.undecided) === JSON.stringify(before.undecided)
      && JSON.stringify(after.verified) === JSON.stringify(before.verified),
      'S6-no-vote-power：授权不写任何票面/结论（solveVotes／undecided／verified 全不变）')
    const temp = await callTool('vibe_v5_grant', { to: 't-1', command: 'assign', grant_scope: 'once', why: '临时工尝试' }, childAgent(childOf('acad')))
    assert(temp.ok === false && temp.code === 'V5_NOT_VOTER',
      'S6-no-vote-power：临时工不可被授权（D8 ⇒ V5_NOT_VOTER；got ' + JSON.stringify(temp).slice(0, 180) + '）')
    assert(!durableGrants().some((x) => x.to === 't-1'),
      'S6-no-vote-power：D8 校验先于写台账（台账里没有 t-1；got ' + JSON.stringify(durableGrants().map((x) => x.to)) + '）')
  } else if (name === 's6-d6-boundary') {
    // S6-d6-boundary（D6/D8＋判据）：可授集合＝有界四命令；**裁定级身份保证**把守的命令一律不可授；
    // 私密/引用面不在集合里；**不可转授**；自带时间一律拒。
    const endv = await callTool('vibe_v5_grant', { to: 'r-1', command: 'end_verify', grant_scope: 'once', why: '想拿裁定权' }, childAgent(childOf('acad')))
    assert(endv.ok === false && endv.code === 'V5_INVALID_ARGUMENT' && /裁定级/.test(String(endv.message)),
      'S6-d6-boundary：end_verify 不可授（裁定级身份保证；got ' + JSON.stringify(endv).slice(0, 220) + '）')
    const lib = await callTool('vibe_v5_grant', { to: 'r-1', command: 'read_library', grant_scope: 'once', why: '想读私密' }, childAgent(childOf('acad')))
    assert(lib.ok === false && lib.code === 'V5_INVALID_ARGUMENT',
      'S6-d6-boundary：私密/引用面不在可授集合（got ' + JSON.stringify(lib).slice(0, 160) + '）')
    const badScope = await callTool('vibe_v5_grant', { to: 'r-1', command: 'assign', grant_scope: 'forever', why: '永久' }, childAgent(childOf('acad')))
    assert(badScope.ok === false && badScope.code === 'V5_INVALID_ARGUMENT',
      'S6-d6-boundary：grant_scope 只有事件型三档（got ' + JSON.stringify(badScope).slice(0, 160) + '）')
    const timeArg = await callTool('vibe_v5_grant', { to: 'r-1', command: 'assign', grant_scope: 'once', why: '带时间', expires_at: 1234567890 }, childAgent(childOf('acad')))
    assert(timeArg.ok === false && timeArg.code === 'V5_INVALID_ARGUMENT' && /时间由框架设置/.test(String(timeArg.message)),
      'S6-d6-boundary：自带 expires_at ⇒ 被拒＋「时间由框架设置」（got ' + JSON.stringify(timeArg).slice(0, 220) + '）')
    const g = await callTool('vibe_v5_grant', { to: 'r-1', command: 'assign', grant_scope: 'once', why: 'S6 转授探测' }, childAgent(childOf('acad')))
    assert(g.ok === true, 'S6-d6-boundary：对照授权成功')
    const re = await callTool('vibe_v5_grant', { to: 'r-2', command: 'assign', grant_scope: 'once', why: '被授权者转授' }, childAgent(childOf('r-1')))
    assert(re.ok === false && re.code === 'V5_NOT_ACADEMICIAN',
      'S6-d6-boundary：被授权者不可转授（GAPS 22；got ' + JSON.stringify(re).slice(0, 160) + '）')
  } else if (name === 's7-open-six') {
    // S7-open-six：定稿 §7.1 **六项**逐条可设、**开票前可见**；`min_votes` **必填无默认**；
    // 时间键一律拒（含全小写）；同值幂等；一张 open 板规则。
    const mt = await openMeeting('S7 六项探测')
    assert(!!mt && !!mt.id, 'S7-open-six：前置会议已开启（got ' + JSON.stringify(mt && mt.id) + '）')
    const noMin = await callTool('vibe_v5_poll_open', { question: 'S7 缺 min_votes', options: ['甲', '乙'] }, childAgent(childOf('acad')))
    assert(noMin.ok === false && noMin.code === 'V5_INVALID_ARGUMENT' && /min_votes 必填/.test(String(noMin.message)),
      'S7-open-six：min_votes 必填、**无默认**（got ' + JSON.stringify(noMin).slice(0, 200) + '）')
    const singleMax = await callTool('vibe_v5_poll_open', { question: 'S7 单选带 max', options: ['甲', '乙'], mode: 'single', max: 2, min_votes: 1 }, childAgent(childOf('acad')))
    assert(singleMax.ok === false && singleMax.code === 'V5_INVALID_ARGUMENT',
      'S7-open-six：单选不接受 max/min（got ' + JSON.stringify(singleMax).slice(0, 160) + '）')
    const stamp = await callTool('vibe_v5_poll_open', { question: 'S7 时间键', options: ['甲', '乙'], min_votes: 1, expires_at: 123 }, childAgent(childOf('acad')))
    assert(stamp.ok === false && stamp.code === 'V5_INVALID_ARGUMENT' && /时间由框架设置/.test(String(stamp.message)),
      'S7-open-six：自带全小写 expires_at ⇒ 拒＋「时间由框架设置」（got ' + JSON.stringify(stamp).slice(0, 200) + '）')
    const bad = await callTool('vibe_v5_grant', { to: 'r-1', command: 'poll_open', grant_scope: 'once', why: '想授开板' }, childAgent(childOf('acad')))
    assert(bad.ok === false && bad.code === 'V5_INVALID_ARGUMENT',
      'S7-open-six：开板**不可授**（S6 可授集合不含 poll_open；got ' + JSON.stringify(bad).slice(0, 200) + '）')
    const op = await callTool('vibe_v5_poll_open', { question: 'S7 六项板', options: ['甲', '乙', '丙'], mode: 'multi', min: 2, max: 3, min_votes: 2, secret: false, allow_abstain: true, allow_revote: true }, childAgent(childOf('acad')))
    assert(op.ok === true && !!op.ballot && op.ballot.rules.mode === 'multi' && op.ballot.rules.min === 2 && op.ballot.rules.max === 3
      && op.ballot.rules.minVotes === 2 && op.ballot.rules.secret === false && op.ballot.rules.allowAbstain === true && op.ballot.rules.allowRevote === true,
      'S7-open-six：六项规则快照齐全（got ' + JSON.stringify(op).slice(0, 300) + '）')
    const bid = String(op.ballot.id)
    const st = await callTool('vibe_v5_status', {})
    assert(st.poll && st.poll.open === true && String(st.poll.question) === 'S7 六项板'
      && JSON.stringify(st.poll.options) === JSON.stringify(['甲', '乙', '丙'])
      && st.poll.rules.minVotes === 2 && st.poll.min_votes_reached === false && st.poll.quorum_reached === false,
      'S7-open-six：**开票前可见**（status.poll 的既有冻结键＋子键；got ' + JSON.stringify(st.poll).slice(0, 300) + '）')
    const rep = String(((await callTool('vibe_v5_report', {})) || {}).report || '')
    assert(rep.indexOf('投票板') !== -1 && rep.indexOf('最少收集票 2') !== -1 && rep.indexOf('法定人数') !== -1,
      'S7-open-six：report() 呈现规则与两个门槛（got len=' + rep.length + '）')
    const row = ballotRow(bid)
    assert(row.id === bid && row.rules && row.rules.minVotes === 2 && Array.isArray(row.options) && row.options.length === 3,
      'S7-open-six：板耐久入档（fold 白名单；got ' + JSON.stringify(row).slice(0, 200) + '）')
    const dup = await callTool('vibe_v5_poll_open', { question: 'S7 六项板', options: ['甲', '乙', '丙'], mode: 'multi', min: 2, max: 3, min_votes: 2, secret: false, allow_abstain: true, allow_revote: true }, childAgent(childOf('acad')))
    assert(dup.ok === true && dup.deduped === true, 'S7-open-six：同值重开幂等 deduped（got ' + JSON.stringify(dup).slice(0, 200) + '）')
    const other = await callTool('vibe_v5_poll_open', { question: 'S7 另一张板', options: ['甲', '乙'], min_votes: 1 }, childAgent(childOf('acad')))
    assert(other.ok === false && other.code === 'V5_INVALID_ARGUMENT',
      'S7-open-six：同一时刻只允许一张 open 板（got ' + JSON.stringify(other).slice(0, 200) + '）')
  } else if (name === 's7-single-multi') {
    // S7-single-multi：单选／多选与「最多/至少选几票」的边界（越界与未知选项都被具名拒）。
    await openMeeting('S7 单选多选探测')
    const s1 = await callTool('vibe_v5_poll_open', { question: 'S7 单选', options: ['甲', '乙'], mode: 'single', min_votes: 1 }, childAgent(childOf('acad')))
    assert(s1.ok === true && s1.ballot.rules.mode === 'single' && s1.ballot.rules.max === 1, 'S7-single-multi：单选板建立（got ' + JSON.stringify(s1).slice(0, 200) + '）')
    const twoOnSingle = await callTool('vibe_v5_poll_vote', { choices: ['o-1', 'o-2'] }, childAgent(childOf('r-1')))
    assert(twoOnSingle.ok === false && twoOnSingle.code === 'V5_INVALID_ARGUMENT',
      'S7-single-multi：单选板投两项 ⇒ 拒（got ' + JSON.stringify(twoOnSingle).slice(0, 200) + '）')
    const unknown = await callTool('vibe_v5_poll_vote', { choices: ['不存在的选项'] }, childAgent(childOf('r-1')))
    assert(unknown.ok === false && unknown.code === 'V5_INVALID_ARGUMENT', 'S7-single-multi：未知选项 ⇒ 拒（got ' + JSON.stringify(unknown).slice(0, 200) + '）')
    const one = await callTool('vibe_v5_poll_vote', { choices: ['乙'] }, childAgent(childOf('r-1')))
    assert(one.ok === true && one.vote.choices[0] === 'o-2' && one.cast === 1,
      'S7-single-multi：单选恰好 1 项（文本也接受）⇒ 记票（got ' + JSON.stringify(one).slice(0, 200) + '）')
    await callTool('vibe_v5_poll_close', { ballot_id: String(s1.ballot.id), reason: 'S7 收板' }, childAgent(childOf('acad')))
    const m1 = await callTool('vibe_v5_poll_open', { question: 'S7 多选', options: ['甲', '乙', '丙'], mode: 'multi', min: 2, max: 2, min_votes: 2 }, childAgent(childOf('acad')))
    assert(m1.ok === true && m1.ballot.rules.min === 2 && m1.ballot.rules.max === 2, 'S7-single-multi：多选板（至少 2、至多 2）建立（got ' + JSON.stringify(m1).slice(0, 200) + '）')
    const few = await callTool('vibe_v5_poll_vote', { choices: ['o-1'] }, childAgent(childOf('r-1')))
    assert(few.ok === false && few.code === 'V5_INVALID_ARGUMENT', 'S7-single-multi：低于「至少」⇒ 拒（got ' + JSON.stringify(few).slice(0, 200) + '）')
    const many = await callTool('vibe_v5_poll_vote', { choices: ['o-1', 'o-2', 'o-3'] }, childAgent(childOf('r-1')))
    assert(many.ok === false && many.code === 'V5_INVALID_ARGUMENT', 'S7-single-multi：高于「至多」⇒ 拒（got ' + JSON.stringify(many).slice(0, 200) + '）')
    const ok2 = await callTool('vibe_v5_poll_vote', { choices: ['o-1', 'o-3'] }, childAgent(childOf('r-1')))
    assert(ok2.ok === true && ok2.vote.choices.length === 2, 'S7-single-multi：恰在区间内 ⇒ 记票（got ' + JSON.stringify(ok2).slice(0, 200) + '）')
  } else if (name === 's7-min-votes') {
    // S7-min-votes：**不满足「最少收集票」⇒ 该次投票不形成结论**（且不产生任何真值）；补足则成立。
    await openMeeting('S7 最少收集票探测')
    const a = await callTool('vibe_v5_poll_open', { question: 'S7 门槛 3', options: ['甲', '乙'], min_votes: 3 }, childAgent(childOf('acad')))
    assert(a.ok === true, 'S7-min-votes：板（min_votes=3）建立（got ' + JSON.stringify(a).slice(0, 200) + '）')
    await callTool('vibe_v5_poll_vote', { choices: ['o-1'] }, childAgent(childOf('r-1')))
    await callTool('vibe_v5_poll_vote', { choices: ['o-2'] }, childAgent(childOf('r-2')))
    const before = await callTool('vibe_v5_status', {})
    const closed = await callTool('vibe_v5_poll_close', { ballot_id: String(a.ballot.id), reason: 'S7 计票' }, childAgent(childOf('acad')))
    assert(closed.ok === true && closed.ballot.result.cast === 2 && closed.ballot.result.minVotes === 3
      && closed.ballot.result.satisfied === false && closed.ballot.result.settled === false && closed.ballot.result.outcome === 'unsettled',
      'S7-min-votes：未达最少收集票 ⇒ **不形成结论**（got ' + JSON.stringify(closed.ballot.result).slice(0, 300) + '）')
    const after = await callTool('vibe_v5_status', {})
    assert(JSON.stringify(after.solveVotes) === JSON.stringify(before.solveVotes)
      && JSON.stringify(after.undecided) === JSON.stringify(before.undecided)
      && JSON.stringify(after.verified) === JSON.stringify(before.verified),
      'S7-min-votes：不形成结论时**不写**任何真值（solveVotes/undecided/verified 全不变）')
    assert(/不形成结论/.test(chatTextR10()), 'S7-min-votes：广播写明「不形成结论、不得据剩余票推断」')
    const b = await callTool('vibe_v5_poll_open', { question: 'S7 门槛 2', options: ['甲', '乙'], min_votes: 2 }, childAgent(childOf('acad')))
    await callTool('vibe_v5_poll_vote', { choices: ['o-1'] }, childAgent(childOf('r-1')))
    await callTool('vibe_v5_poll_vote', { choices: ['o-1'] }, childAgent(childOf('r-2')))
    const closed2 = await callTool('vibe_v5_poll_close', { ballot_id: String(b.ballot.id), reason: 'S7 计票 2' }, childAgent(childOf('acad')))
    assert(closed2.ok === true && closed2.ballot.result.cast === 2 && closed2.ballot.result.satisfied === true
      && closed2.ballot.result.outcome === 'recorded' && closed2.ballot.tally['o-1'] === 2,
      'S7-min-votes：达到最少收集票 ⇒ 本次投票成立＋计票（got ' + JSON.stringify(closed2.ballot.result).slice(0, 300) + '）')
  } else if (name === 's7-two-thresholds') {
    // S7-two-thresholds（K13）：**两个门槛各算各的** —— `min_votes` 已成立而**结题门**（法定人数：
    // 未投票者阻塞）仍未解除；两种状态**同时可见**、互不冒充。
    await openMeeting('S7 两门槛探测')
    const a = await callTool('vibe_v5_poll_open', { question: 'S7 两门槛', options: ['甲', '乙'], min_votes: 1 }, childAgent(childOf('acad')))
    await callTool('vibe_v5_poll_vote', { choices: ['o-1'] }, childAgent(childOf('r-1')))
    const st = await callTool('vibe_v5_status', {})
    assert(st.poll.min_votes_reached === true && st.poll.settled === true && st.poll.quorum_reached === false,
      'S7-two-thresholds：最少收集票已成立而法定人数（结题门）仍被阻塞（got ' + JSON.stringify(st.poll).slice(0, 300) + '）')
    assert(Array.isArray(st.poll.pending) && st.poll.pending.indexOf('acad') !== -1,
      'S7-two-thresholds：未投票者**公开点名**（P12；got ' + JSON.stringify(st.poll.pending) + '）')
    const rep = String(((await callTool('vibe_v5_report', {})) || {}).report || '')
    assert(rep.indexOf('已成立') !== -1 && rep.indexOf('仍被未投票者阻塞') !== -1,
      'S7-two-thresholds：report() 里两个门槛**并列**（got len=' + rep.length + '）')
    const closed = await callTool('vibe_v5_poll_close', { ballot_id: String(a.ballot.id), reason: 'S7 两门槛计票' }, childAgent(childOf('acad')))
    assert(closed.ok === true && closed.ballot.result.settled === true && closed.ballot.result.quorum_reached === false
      && closed.ballot.result.m === 3 && closed.ballot.result.pending.length === 3,
      'S7-two-thresholds：结果里 settled（min_votes）与 quorum_reached（结题门）同时成立/未成立（got ' + JSON.stringify(closed.ballot.result).slice(0, 300) + '）')
  } else if (name === 's7-abstain-revote') {
    // S7-abstain-revote：**弃权**计入已投、**不计选项**；**截止前可改票**（记 revotedAt）；同值幂等；
    // 截止后拒绝；`allow_revote=false` 的板不得改票。
    await openMeeting('S7 弃权改票探测')
    const a = await callTool('vibe_v5_poll_open', { question: 'S7 弃权改票', options: ['甲', '乙'], min_votes: 1, allow_abstain: true, allow_revote: true }, childAgent(childOf('acad')))
    const ab = await callTool('vibe_v5_poll_vote', { abstain: true, reason: 'S7 弃权' }, childAgent(childOf('r-1')))
    assert(ab.ok === true && ab.vote.abstain === true && ab.cast === 1 && ab.vote.choices.length === 0,
      'S7-abstain-revote：弃权计入已投、无选项（got ' + JSON.stringify(ab).slice(0, 220) + '）')
    const st1 = await callTool('vibe_v5_status', {})
    assert(st1.poll.cast === 1 && st1.poll.rules.allowAbstain === true,
      'S7-abstain-revote：弃权**计入已投**（cast=1）（got ' + JSON.stringify(st1.poll).slice(0, 220) + '）')
    const rev = await callTool('vibe_v5_poll_vote', { choices: ['o-1'] }, childAgent(childOf('r-1')))
    assert(rev.ok === true && Number(rev.vote.revotedAt) > 0 && rev.vote.choices[0] === 'o-1',
      'S7-abstain-revote：截止前**改票**成功并记 revotedAt（got ' + JSON.stringify(rev).slice(0, 220) + '）')
    const same = await callTool('vibe_v5_poll_vote', { choices: ['o-1'] }, childAgent(childOf('r-1')))
    assert(same.ok === true && same.deduped === true, 'S7-abstain-revote：同值重投 ⇒ deduped（got ' + JSON.stringify(same).slice(0, 200) + '）')
    await callTool('vibe_v5_poll_close', { ballot_id: String(a.ballot.id), reason: 'S7 截止' }, childAgent(childOf('acad')))
    const after = await callTool('vibe_v5_poll_vote', { ballot_id: String(a.ballot.id), choices: ['o-2'] }, childAgent(childOf('r-1')))
    assert(after.ok === false && after.code === 'V5_INVALID_ARGUMENT' && /已截止/.test(String(after.message)),
      'S7-abstain-revote：截止后拒绝（只能走复议）（got ' + JSON.stringify(after).slice(0, 220) + '）')
    const b = await callTool('vibe_v5_poll_open', { question: 'S7 不允许改票', options: ['甲', '乙'], min_votes: 1, allow_revote: false }, childAgent(childOf('acad')))
    await callTool('vibe_v5_poll_vote', { choices: ['o-1'] }, childAgent(childOf('r-2')))
    const noRev = await callTool('vibe_v5_poll_vote', { choices: ['o-2'] }, childAgent(childOf('r-2')))
    assert(b.ok === true && noRev.ok === false && noRev.code === 'V5_INVALID_ARGUMENT',
      'S7-abstain-revote：allow_revote=false ⇒ 改票被拒（got ' + JSON.stringify(noRev).slice(0, 220) + '）')
  } else if (name === 's7-secret-nonvoter') {
    // S7-secret-nonvoter：**默认记名**；`secret` 板**留档但公开面只给聚合**（逐人选择仅供计票）；
    // 列席／受邀／临时工 ⇒ `V5_NOT_VOTER`（**授权也不能**给票权），且不计入分母。
    await openMeeting('S7 不记名探测')
    const a = await callTool('vibe_v5_poll_open', { question: 'S7 不记名板', options: ['甲', '乙'], min_votes: 1, secret: true }, childAgent(childOf('acad')))
    assert(a.ok === true && a.ballot.rules.secret === true && a.ballot.ballot === undefined,
      'S7-secret-nonvoter：不记名板建立且回执不含逐人选择（got ' + JSON.stringify(a).slice(0, 240) + '）')
    const v1 = await callTool('vibe_v5_poll_vote', { choices: ['o-1'] }, childAgent(childOf('r-1')))
    assert(v1.ok === true, 'S7-secret-nonvoter：不记名板照常投票')
    const st = await callTool('vibe_v5_status', {})
    assert(st.poll.secret === true && st.poll.ballot === undefined && st.poll.cast === 1,
      'S7-secret-nonvoter：公开面只给聚合（status.poll 无 ballot、无逐人选择；got ' + JSON.stringify(st.poll).slice(0, 260) + '）')
    const rep = String(((await callTool('vibe_v5_report', {})) || {}).report || '')
    assert(rep.indexOf('不记名') !== -1 && rep.indexOf('r-1＝o-1') === -1,
      'S7-secret-nonvoter：report() 标明不记名且**不暴露**逐人选择（got len=' + rep.length + '）')
    const row = ballotRow(String(a.ballot.id))
    assert(Array.isArray(row.votes) && row.votes.length === 1 && row.votes[0].by === 'r-1' && row.votes[0].choices[0] === 'o-1',
      'S7-secret-nonvoter：**留档**仍在（"谁何时设为不记名"与逐人选择仅供计票；got ' + JSON.stringify(row.votes) + '）')
    const temp = await callTool('vibe_v5_poll_vote', { choices: ['o-2'] }, childAgent(childOf('t-1')))
    assert(temp.ok === false && temp.code === 'V5_NOT_VOTER',
      'S7-secret-nonvoter：临时工 ⇒ V5_NOT_VOTER（票权不可授；got ' + JSON.stringify(temp).slice(0, 220) + '）')
    const st2 = await callTool('vibe_v5_status', {})
    assert(st2.poll.cast === 1 && Array.isArray(st2.poll.pending) && st2.poll.pending.indexOf('t-1') === -1,
      'S7-secret-nonvoter：临时工**不计入**已投/分母（got cast=' + st2.poll.cast + ' pending=' + JSON.stringify(st2.poll.pending) + '）')
    await callTool('vibe_v5_poll_close', { ballot_id: String(a.ballot.id), reason: 'S7 不记名计票' }, childAgent(childOf('acad')))
    const named = await callTool('vibe_v5_poll_open', { question: 'S7 记名板', options: ['甲', '乙'], min_votes: 1 }, childAgent(childOf('acad')))
    await callTool('vibe_v5_poll_vote', { choices: ['o-2'] }, childAgent(childOf('r-3')))
    const stN = await callTool('vibe_v5_status', {})
    assert(named.ok === true && named.ballot.rules.secret === false && stN.poll.secret === false,
      'S7-secret-nonvoter：**默认记名**（secret 缺省 false；got ' + JSON.stringify(stN.poll).slice(0, 200) + '）')
    const repN = String(((await callTool('vibe_v5_report', {})) || {}).report || '')
    assert(repN.indexOf('r-3＝o-2') !== -1, 'S7-secret-nonvoter：记名板在 report() 里公开逐人选择（got len=' + repN.length + '）')
  } else if (name === 's8-freeze-say') {
    // S8-freeze-say（R3/K12/B9）：**表决期禁止发言** —— 用 harness **自己的** `drainWakes`（会议唤醒按
    // 常规作答）做前后对照：冻结**前**的会议发言照常入纪要；冻结**期**同样的回答**一律被拒**（不产生发言）
    // 且群聊有**具名通知**；`vibe_v5_say` 被具名拒绝；**收束表决后**成员发言恢复。
    // 注：**举手保留不放行**由 R44 的静态门（门禁路径绝不 `delete meeting.hands`）与拒绝文案共同保证。
    const mt = await openMeeting('S8 表决期禁言探测')
    await settleAll()
    await drainWakes(6)
    await settleAll()
    const st0 = await callTool('vibe_v5_status', {})
    assert(st0.meeting.spoke.length > 0,
      'S8-freeze-say：对照——冻结**前**的会议发言被记录（got ' + JSON.stringify(st0.meeting.spoke) + '）')
    const spokeBefore = JSON.stringify(st0.meeting.spokeCount)
    const op = await callTool('vibe_v5_poll_open', { question: 'S8 禁言板', options: ['甲', '乙'], min_votes: 1 }, childAgent(childOf('acad')))
    assert(op.ok === true, 'S8-freeze-say：表决板已开（got ' + JSON.stringify(op).slice(0, 160) + '）')
    const st1 = await callTool('vibe_v5_status', {})
    assert(st1.meeting.speech_frozen === true && st1.meeting.frozen_by === 'ballot:' + String(op.ballot.id),
      'S8-freeze-say：只读冻结面可见（speech_frozen/frozen_by；got ' + JSON.stringify([st1.meeting.speech_frozen, st1.meeting.frozen_by]) + '）')
    const ref = await callTool('vibe_v5_say', { text: 'S8 表决期插话（应被拒）' }, childAgent(childOf('r-1')))
    assert(ref.ok === false && ref.code === 'V5_INVALID_ARGUMENT' && /表决期禁止发言/.test(String(ref.message))
      && /举手队列保留/.test(String(ref.message)),
      'S8-freeze-say：成员发言 ⇒ 具名拒绝（且文案写明"举手队列保留"；got ' + JSON.stringify(ref).slice(0, 260) + '）')
    assert(chatTextR10().indexOf('S8 表决期插话（应被拒）') === -1, 'S8-freeze-say：被拒的发言**不产生任何发言**（群聊无该文本）')
    await drainWakes(8)
    await settleAll()
    const st2 = await callTool('vibe_v5_status', {})
    // 观测面守卫（D-3）：`meeting` 若已被收束 ⇒ **具名断言**（而不是 `TypeError`），这样"冻结期被误收束"
    // 这条回归会以**具名红**报出（`S8:` 族的 `expect` 才咬得住；此前它是崩栈、非具名红 ✗）。
    assert(!!st2.meeting, 'S8-freeze-say：冻结期**会议不得被收束**（`status.meeting` 必须仍在；got ' + String(JSON.stringify(st2.meeting) || null).slice(0, 160) + '）')
    assert(JSON.stringify(st2.meeting.spokeCount) === spokeBefore,
      'S8-freeze-say：冻结期**会议与群聊的发言一律被拒**（spokeCount 与冻结前逐字相同；got ' + JSON.stringify(st2.meeting.spokeCount) + ' vs ' + spokeBefore + '）')
    assert(/被拒/.test(chatTextR10()), 'S8-freeze-say：拒绝有**具名系统通知**（系统消息不受禁言影响）')
    const closed = await callTool('vibe_v5_poll_close', { ballot_id: String(op.ballot.id), reason: 'S8 收束表决' }, childAgent(childOf('acad')))
    assert(closed.ok === true, 'S8-freeze-say：表决收束（got ' + JSON.stringify(closed).slice(0, 160) + '）')
    const after = await callTool('vibe_v5_status', {})
    assert(!!after.meeting && after.meeting.speech_frozen === false,
      'S8-freeze-say：收束后自动解冻（got ' + JSON.stringify(after.meeting && after.meeting.speech_frozen) + '）')
    const ok2 = await callTool('vibe_v5_say', { text: 'S8 解冻后发言' }, childAgent(childOf('r-1')))
    assert(ok2.ok === true, 'S8-freeze-say：解冻后同一条发言通过（got ' + JSON.stringify(ok2).slice(0, 160) + '）')
    await drainWakes(4)
    await settleAll()
    const st3 = await callTool('vibe_v5_status', {})
    assert(!st3.meeting || JSON.stringify(st3.meeting.spokeCount) !== spokeBefore,
      'S8-freeze-say：解冻后会议发言恢复（spokeCount 前进，或会议已正常收束；got ' + JSON.stringify(st3.meeting && st3.meeting.spokeCount) + '）')
    assert(!!mt && !!mt.id, 'S8-freeze-say：前置会议已开启')
  } else if (name === 's8-system-not-blocked') {
    // S8-system-not-blocked：**系统/框架消息不受禁言** —— 表决期仍可派活、进度广播照常、院士不受限；
    // 同一时刻**成员**仍被拒（证明门只在成员发言入口，没有误伤系统路径）。
    await openMeeting('S8 系统消息探测')
    await settleAll()
    const op = await callTool('vibe_v5_poll_open', { question: 'S8 系统消息板', options: ['甲', '乙'], min_votes: 1 }, childAgent(childOf('acad')))
    assert(op.ok === true, 'S8-system-not-blocked：表决板已开')
    const asg = await callTool('vibe_v5_assign', { to: 'r-2', why: 'S8 表决期派活', acceptance: '完成' }, ROOT)
    assert(asg.ok === true, 'S8-system-not-blocked：表决期仍可分派任务（系统动作不受禁言；got ' + JSON.stringify(asg).slice(0, 200) + '）')
    const v = await callTool('vibe_v5_poll_vote', { choices: ['o-1'] }, childAgent(childOf('r-1')))
    assert(v.ok === true && /【投票板·投票】/.test(chatTextR10()), 'S8-system-not-blocked：表决进度广播照常送达')
    const acadSay = await callTool('vibe_v5_say', { text: 'S8 主持在表决期的说明' }, childAgent(childOf('acad')))
    assert(acadSay.ok === true, 'S8-system-not-blocked：院士发言不受限（chair-first；got ' + JSON.stringify(acadSay).slice(0, 160) + '）')
    const memSay = await callTool('vibe_v5_say', { text: 'S8 成员插话' }, childAgent(childOf('r-2')))
    assert(memSay.ok === false && memSay.code === 'V5_INVALID_ARGUMENT',
      'S8-system-not-blocked：同一时刻成员仍被拒（对照；got ' + JSON.stringify(memSay).slice(0, 200) + '）')
  } else if (name === 's8-no-phase-change') {
    // S8-no-phase-change：冻结**不改阶段、不收束、不写票、无自动解除**；冻结期会议仍可投票/派活/收束；
    // 收束表决后会议**仍开着**（解冻 ≠ 散会）。
    await openMeeting('S8 不改阶段探测')
    await settleAll()
    const snapBefore = await callTool('vibe_v5_status', {})
    const phaseBefore = String((snapBefore.meeting || {}).phase || '')
    const op = await callTool('vibe_v5_poll_open', { question: 'S8 阶段板', options: ['甲', '乙'], min_votes: 1 }, childAgent(childOf('acad')))
    assert(op.ok === true, 'S8-no-phase-change：表决板已开')
    const ref = await callTool('vibe_v5_say', { text: 'S8 冻结期发言' }, childAgent(childOf('r-1')))
    assert(ref.ok === false, 'S8-no-phase-change：冻结期发言被拒')
    const stAfter = await callTool('vibe_v5_status', {})
    assert(!!stAfter.meeting && String(stAfter.meeting.phase) === phaseBefore,
      'S8-no-phase-change：冻结**不改会议阶段**（' + phaseBefore + ' ⇒ ' + String(stAfter.meeting && stAfter.meeting.phase) + '）')
    assert(JSON.stringify(stAfter.solveVotes) === JSON.stringify(snapBefore.solveVotes)
      && JSON.stringify(stAfter.undecided) === JSON.stringify(snapBefore.undecided)
      && JSON.stringify(stAfter.verified) === JSON.stringify(snapBefore.verified),
      'S8-no-phase-change：冻结**不写**任何票/真值（solveVotes/undecided/verified 全不变）')
    const v = await callTool('vibe_v5_poll_vote', { choices: ['o-1'] }, childAgent(childOf('r-2')))
    const asg = await callTool('vibe_v5_assign', { to: 'r-3', why: 'S8 冻结期派活', acceptance: '完成' }, ROOT)
    const closed = await callTool('vibe_v5_poll_close', { ballot_id: String(op.ballot.id), reason: 'S8 阶段收束' }, childAgent(childOf('acad')))
    assert(v.ok === true && asg.ok === true && closed.ok === true, 'S8-no-phase-change：冻结期投票/派活/收束都可用')
    const stEnd = await callTool('vibe_v5_status', {})
    assert(!!stEnd.meeting && stEnd.meeting.speech_frozen === false,
      'S8-no-phase-change：收束表决后会议**仍开着**（冻结解除、不是散会；got ' + JSON.stringify(!!stEnd.meeting) + '）')
  } else if (name === 's8-ballot-unaffected') {
    // S8-ballot-unaffected（H3）：**票与发言互不折算** —— 被拒的发言不产生票、不改门槛/分母；
    // 同一时刻的**真票**照常记账；票面里绝不出现被拒发言的文本。
    await openMeeting('S8 票面不受影响探测')
    await settleAll()
    const op = await callTool('vibe_v5_poll_open', { question: 'S8 票面板', options: ['甲', '乙'], min_votes: 2 }, childAgent(childOf('acad')))
    assert(op.ok === true, 'S8-ballot-unaffected：表决板已开')
    const snap0 = await callTool('vibe_v5_status', {})
    const ref = await callTool('vibe_v5_say', { text: 'S8 被拒的发言' }, childAgent(childOf('r-1')))
    const st1 = await callTool('vibe_v5_status', {})
    assert(ref.ok === false && st1.poll.cast === 0 && st1.poll.min_votes_reached === false
      && JSON.stringify(st1.quorum.voters) === JSON.stringify(snap0.quorum.voters),
      'S8-ballot-unaffected：被拒发言**不产生票**、不改门槛/票权集合（got cast=' + st1.poll.cast + '）')
    const v1 = await callTool('vibe_v5_poll_vote', { choices: ['o-1'] }, childAgent(childOf('r-1')))
    const v2 = await callTool('vibe_v5_poll_vote', { choices: ['o-2'] }, childAgent(childOf('r-2')))
    const st2 = await callTool('vibe_v5_status', {})
    assert(v1.ok === true && v2.ok === true && st2.poll.cast === 2 && st2.poll.min_votes_reached === true,
      'S8-ballot-unaffected：同一时刻**真票照常记账**（cast=2、门槛成立；got ' + JSON.stringify(st2.poll).slice(0, 200) + '）')
    const row = durableBallots().filter((b) => b.id === String(op.ballot.id))[0] || {}
    assert((row.votes || []).length === 2 && (row.votes || []).every((x) => Array.isArray(x.choices) && x.choices.length === 1)
      && (row.votes || []).every((x) => JSON.stringify(x).indexOf('S8 被拒的发言') === -1),
      'S8-ballot-unaffected：票面只有**真票**（被拒的发言没有变成票；got ' + JSON.stringify(row.votes) + '）')
  } else if (name === 's8-minutes-zones') {
    // S8-minutes-zones（K12）：纪要**分区** —— 渲染文本含 `## 发言区`／`## 投票区`（问题/选项/规则/
    // 计票/有效票/弃权/**未投票名单**），**并**写进结构化 `minutes{}`（双份）。
    const mt = await openMeeting('S8 纪要分区探测')
    await settleAll()
    await drainWakes(6)
    await settleAll()
    const stPre = await callTool('vibe_v5_status', {})
    assert(stPre.meeting.spoke.length > 0, 'S8-minutes-zones：表决前已有发言（发言区非空；got ' + JSON.stringify(stPre.meeting.spoke) + '）')
    const op = await callTool('vibe_v5_poll_open', { question: 'S8 分区板', options: ['甲', '乙'], min_votes: 1 }, childAgent(childOf('acad')))
    assert(op.ok === true, 'S8-minutes-zones：表决板已开')
    await callTool('vibe_v5_poll_vote', { choices: ['o-1'] }, childAgent(childOf('r-1')))
    const closed = await callTool('vibe_v5_poll_close', { ballot_id: String(op.ballot.id), reason: 'S8 分区计票' }, childAgent(childOf('acad')))
    assert(closed.ok === true, 'S8-minutes-zones：表决已收束')
    await waitMeetingClosed()
    const mtFile = join(instDir, 'Shared', 'Meetings', String(mt.id) + '.md')
    const mtText = existsSync(mtFile) ? readFileSync(mtFile, 'utf8') : ''
    assert(mtText.indexOf('## 发言区') !== -1 && /\n### r-/.test(mtText),
      'S8-minutes-zones：纪要渲染含**发言区**与逐人发言小节（got len=' + mtText.length + '）')
    assert(mtText.indexOf('## 投票区') !== -1 && mtText.indexOf('S8 分区板') !== -1 && /未投票名单/.test(mtText),
      'S8-minutes-zones：纪要渲染含**投票区**（问题/规则/计票/未投票名单）')
    const mins = durableMinutes(String(mt.id))
    assert(!!mins && Array.isArray(mins.speechZone)
      && mins.speechZone.length > 0 && mins.speechZone.some((z) => Array.isArray(z.speeches) && z.speeches.length > 0),
      'S8-minutes-zones：结构化 `minutes.speechZone` 含逐人发言（got ' + JSON.stringify((mins && mins.speechZone) || null).slice(0, 220) + '）')
    assert(!!mins && Array.isArray(mins.voteZone) && mins.voteZone.length === 1
      && mins.voteZone[0].question === 'S8 分区板' && mins.voteZone[0].minVotes === 1
      && Array.isArray(mins.voteZone[0].unvoted) && Array.isArray(mins.voteZone[0].options)
      && !!mins.voteZone[0].rules && !!mins.voteZone[0].tally,
      'S8-minutes-zones：结构化 `minutes.voteZone` 字段齐全（问题/选项/规则/计票/未投票名单；got ' + JSON.stringify((mins && mins.voteZone) || null).slice(0, 260) + '）')
  } else if (name === 's8-exception-path') {
    // S8-exception-path：**例外通道** —— 程序异议（#46，D2 救济权）**不受禁言影响**；院士/所办不受限
    // （chair-first）；成员的任何发言入口（群聊/私聊/对表决者）**一律拒**；收束后成员发言恢复。
    await openMeeting('S8 例外通道探测')
    await settleAll()
    const op = await callTool('vibe_v5_poll_open', { question: 'S8 例外板', options: ['甲', '乙'], min_votes: 1 }, childAgent(childOf('acad')))
    assert(op.ok === true, 'S8-exception-path：表决板已开')
    const obj = await callTool('vibe_v5_procedural_objection', { why: 'S8 表决期程序异议（D2 不受限）' }, childAgent(childOf('r-1')))
    assert(obj.ok === true, 'S8-exception-path：程序异议**不受禁言影响**（D2 救济权；got ' + JSON.stringify(obj).slice(0, 220) + '）')
    const acadSay = await callTool('vibe_v5_say', { text: 'S8 主持说明' }, childAgent(childOf('acad')))
    assert(acadSay.ok === true, 'S8-exception-path：院士/所办不受限（chair-first）')
    const memSay = await callTool('vibe_v5_say', { text: 'S8 成员插话' }, childAgent(childOf('r-2')))
    const memDm = await callTool('vibe_v5_say', { to: 'r-3', text: 'S8 成员私聊' }, childAgent(childOf('r-2')))
    const memVoters = await callTool('vibe_v5_say', { to: 'voters', text: 'S8 成员对表决者发言' }, childAgent(childOf('r-2')))
    assert(memSay.ok === false && memDm.ok === false && memVoters.ok === false,
      'S8-exception-path：成员的任何发言入口都拒（群聊/私聊/对表决者；got ' + JSON.stringify([memSay.code, memDm.code, memVoters.code]) + '）')
    const closed = await callTool('vibe_v5_poll_close', { ballot_id: String(op.ballot.id), reason: 'S8 例外收束' }, childAgent(childOf('acad')))
    assert(closed.ok === true, 'S8-exception-path：收束表决')
    const ok2 = await callTool('vibe_v5_say', { text: 'S8 解冻后成员发言' }, childAgent(childOf('r-2')))
    assert(ok2.ok === true, 'S8-exception-path：解冻后成员发言恢复（got ' + JSON.stringify(ok2).slice(0, 160) + '）')
  } else if (name === 's9-minority-archive') {
    // S9-minority-archive（D5 硬约束）：**少数意见一律入档**为一等记录（`minority[]`＋渲染），
    // 而**弃权／无法判断**不算少数意见（单列，R2/D3）。
    const p1 = await fresh('p-s9a', 'S9 少数意见入档探测。')
    assert(p1.ok === true, 'S9：探测对象进入验证（propose ok）')
    await waitVerify('p-s9a')
    for (const id of ['r-1', 'r-2', 'r-3']) await callTool('vibe_v5_verdict', { target: 'p-s9a', verdict: 1, reason: '布尔真' }, childAgent(childOf(id)))
    await callTool('vibe_v5_verdict', { target: 'p-s9a', verdict: 0.7, reason: '我有保留：0.7' }, childAgent(childOf('acad')))
    await settleAll()
    let sv1 = await callTool('vibe_v5_status', {})
    if (sv1.verified.indexOf('p-s9a') === -1) { await drainWakes(8); await settleAll(); sv1 = await callTool('vibe_v5_status', {}) }
    const rec1 = recOf('p-s9a')
    assert(!!rec1 && rec1.closed === true && rec1.outcome === 'true',
      'S9：3 名布尔真达到 m=3 ⇒ 结论为真（got ' + JSON.stringify(rec1 && rec1.outcome) + '）')
    assert(Array.isArray(rec1.minority) && rec1.minority.length === 1 && rec1.minority[0].by === 'acad' && Number(rec1.minority[0].prob) === 0.7
      && /0\.7/.test(String(rec1.minority[0].reason)),
      'S9/D5：**少数意见一等入档**（minority[] 含 acad＝0.7＋理由；got ' + JSON.stringify(rec1.minority) + '）')
    assert(Number(rec1.minorityCount) === 1 && rec1.sealed === true && Number(rec1.effectiveAt) > 0 && !!rec1.threshold,
      'S9/D5：盖章齐全（minorityCount/sealed/effectiveAt/threshold；got ' + JSON.stringify([rec1.minorityCount, rec1.sealed, rec1.effectiveAt, rec1.threshold]) + '）')
    const rep1 = String(((await callTool('vibe_v5_report', {})) || {}).report || '')
    assert(/少数意见（1 人）：acad＝0\.70/.test(rep1), 'S9/D5：report() 渲染「少数意见」节（逐人＋理由；got len=' + rep1.length + '）')
    const p2 = await fresh('p-s9b', 'S9 弃权不计少数意见探测。')
    assert(p2.ok === true, 'S9：第二个探测对象进入验证')
    await waitVerify('p-s9b')
    for (const id of ['r-1', 'r-2', 'r-3']) await callTool('vibe_v5_verdict', { target: 'p-s9b', verdict: 1, reason: '布尔真' }, childAgent(childOf(id)))
    await callTool('vibe_v5_verdict', { target: 'p-s9b', verdict: 'abstain', reason: '明确弃权' }, childAgent(childOf('acad')))
    await settleAll()
    let sv2 = await callTool('vibe_v5_status', {})
    if (sv2.verified.indexOf('p-s9b') === -1) { await drainWakes(8); await settleAll(); sv2 = await callTool('vibe_v5_status', {}) }
    const rec2 = recOf('p-s9b')
    assert(!!rec2 && rec2.outcome === 'true' && Number(rec2.abstain) === 1, 'S9：弃权计入已投但不计选项（abstain=1）')
    assert(Array.isArray(rec2.minority) && rec2.minority.length === 0,
      'S9/D5：**弃权不算少数意见**（minority 为空；got ' + JSON.stringify(rec2.minority) + '）')
    const rep2 = String(((await callTool('vibe_v5_report', {})) || {}).report || '')
    assert(/少数意见：无（弃权 1/.test(rep2), 'S9/D5：弃权被**单列**（"少数意见：无（弃权 1…"；got ' + rep2.slice(0, 200) + '）')
  } else if (name === 's9-reconsider-winner-only') {
    // S9-reconsider-winner-only（D5）：有明确胜方 ⇒ **只有当初胜方之一**可提；**弃权者**不是胜方 ⇒ 具名拒。
    const p1 = await fresh('p-s9a', 'S9 胜方资格探测。')
    assert(p1.ok === true, 'S9：探测对象进入验证')
    await waitVerify('p-s9a')
    for (const id of ['r-1', 'r-2', 'r-3']) await callTool('vibe_v5_verdict', { target: 'p-s9a', verdict: 1, reason: '布尔真' }, childAgent(childOf(id)))
    await callTool('vibe_v5_verdict', { target: 'p-s9a', verdict: 0.7, reason: '我有保留' }, childAgent(childOf('acad')))
    await settleAll()
    let sv = await callTool('vibe_v5_status', {})
    if (sv.verified.indexOf('p-s9a') === -1) { await drainWakes(8); await settleAll(); sv = await callTool('vibe_v5_status', {}) }
    const rec = recOf('p-s9a')
    assert(!!rec && rec.outcome === 'true', 'S9：结论为真（有明确胜方；前置）')
    const lose = await callTool('vibe_v5_reconsider', { target: 'p-s9a', why: 'S9 非胜方尝试' }, childAgent(childOf('acad')))
    assert(lose.ok === false && lose.code === 'V5_NOT_VOTER' && /胜方之一/.test(String(lose.message)),
      'S9/D5：**非胜方（少数意见者）被具名拒绝**（got ' + JSON.stringify(lose).slice(0, 240) + '）')
    const win = await callTool('vibe_v5_reconsider', { target: 'p-s9a', why: 'S9 胜方之一可提' }, childAgent(childOf('r-1')))
    assert(win.ok === true && win.eligibility === 'winner' && win.reconsideration.onlyUp === true
      && Number(win.threshold.after) >= Number(win.threshold.before),
      'S9/D5：**当初胜方之一**可提请复议（eligibility=winner；门槛只升不降；got ' + JSON.stringify(win).slice(0, 240) + '）')
  } else if (name === 's9-reconsider-undecided') {
    // S9-reconsider-undecided（D5a **硬约束**）：无胜方（未决/取平均）⇒ **任一参与者**可提，
    // **不得**以"无胜方"为由拒绝受理。
    const p1 = await fresh('p-s9c', 'S9 无胜方复议探测。')
    assert(p1.ok === true, 'S9：探测对象进入验证')
    await waitVerify('p-s9c')
    for (const id of ['r-1', 'r-2']) await callTool('vibe_v5_verdict', { target: 'p-s9c', verdict: 0.5, reason: '不确定' }, childAgent(childOf(id)))
    const end = await callTool('vibe_v5_end_verify', { target: 'p-s9c', reason: 'S9 构造无胜方（未定论）' }, childAgent(childOf('acad')))
    assert(end.ok === true && end.outcome === 'undecided', 'S9：构造**无胜方**结论（未定论；got ' + JSON.stringify(end.outcome) + '）')
    const rec = recOf('p-s9c')
    assert(!!rec && rec.closed === true && rec.outcome === 'undecided', 'S9：无胜方记录已收束')
    const any1 = await callTool('vibe_v5_reconsider', { target: 'p-s9c', why: 'S9 无胜方 ⇒ 任一参与者可提（D5a 硬约束）' }, childAgent(childOf('r-1')))
    assert(any1.ok === true && any1.eligibility === 'any-participant',
      'S9/D5a：**无胜方 ⇒ 任一参与者可提**（不得以"无胜方"拒收；got ' + JSON.stringify(any1).slice(0, 240) + '）')
  } else if (name === 's9-threshold-only-up') {
    // S9-threshold-only-up（U3）：生效门槛 `after = max(before, reconsiderFloor, quorumCap)` —— **只升不降**，
    // 且**写进记录**（可审计）；把 floor 归零后，下一轮**也不得**把门槛降回去。
    const p1 = await fresh('p-s9d', 'S9 门槛只升不降探测。')
    assert(p1.ok === true, 'S9：探测对象进入验证')
    await waitVerify('p-s9d')
    for (const id of ['r-1', 'r-2', 'r-3']) await callTool('vibe_v5_verdict', { target: 'p-s9d', verdict: 1, reason: '布尔真' }, childAgent(childOf(id)))
    await callTool('vibe_v5_verdict', { target: 'p-s9d', verdict: 0.7, reason: '保留' }, childAgent(childOf('acad')))
    await settleAll()
    let sv = await callTool('vibe_v5_status', {})
    if (sv.verified.indexOf('p-s9d') === -1) { await drainWakes(8); await settleAll(); sv = await callTool('vibe_v5_status', {}) }
    const before0 = recOf('p-s9d')
    assert(!!before0 && before0.outcome === 'true', 'S9：结论为真（前置）')
    await callTool('vibe_v5_set', { reconsiderFloor: 4 }, ROOT)
    const up = await callTool('vibe_v5_reconsider', { target: 'p-s9d', why: 'S9 提高复议门槛（floor=4）' }, childAgent(childOf('r-1')))
    assert(up.ok === true && Number(up.threshold.after) >= 4 && Number(up.threshold.after) >= Number(up.threshold.before)
      && Number(up.reconsideration.raisedBy) === Number(up.threshold.after) - Number(up.threshold.before) && up.reconsideration.onlyUp === true,
      'S9/U3：生效门槛 after = max(before, floor, quorumCap)（floor=4 ⇒ after≥4；只在升；got ' + JSON.stringify(up.threshold) + '）')
    const recD = recOf('p-s9d')
    assert(!!recD && Number(recD.threshold.m) === Number(up.threshold.after) && Number(recD.threshold.floor) === 4,
      'S9/U3：门槛**写进记录**（threshold{m,floor}；可审计；got ' + JSON.stringify(recD && recD.threshold) + '）')
    await callTool('vibe_v5_set', { reconsiderFloor: 0 }, ROOT)
    for (const id of ['acad', 'r-1', 'r-2', 'r-3']) await callTool('vibe_v5_verdict', { target: 'p-s9d', verdict: 1, reason: '复议后新一轮：全票真' }, childAgent(childOf(id)))
    await settleAll()
    let sv2 = await callTool('vibe_v5_status', {})
    if (sv2.verified.indexOf('p-s9d') === -1) { await drainWakes(8); await settleAll(); sv2 = await callTool('vibe_v5_status', {}) }
    const recD2 = recOf('p-s9d')
    assert(!!recD2 && recD2.closed === true && Number(recD2.m) >= 4,
      'S9/U3：复议后的门槛**真的被用上**（新一轮 m≥4 才定论；got ' + JSON.stringify(recD2 && recD2.m) + '）')
    const up2 = await callTool('vibe_v5_reconsider', { target: 'p-s9d', why: 'S9 第二轮复议（floor 归零后也不得降）' }, childAgent(childOf('r-1')))
    assert(up2.ok === true ? Number(up2.threshold.after) >= Number(up.threshold.after) : /轮次上限/.test(String(up2.message)),
      'S9/U3：floor 归零后门槛**仍不得下降**（got ' + JSON.stringify(up2.threshold || up2.message).slice(0, 160) + '）')
  } else if (name === 's9-secret-no-identity') {
    // S9×S7（B10）：**不记名板**的复议 ⇒ 只给**聚合面**（票数/门槛），**逐人选择永不解密**；
    // 兑现 `03` §5.3 的"close 后只能走复议"，门槛**只升不降**，旧计票留档。
    await openMeeting('S9 不记名复议探测')
    await settleAll()
    const sop = await callTool('vibe_v5_poll_open', { question: 'S9 不记名板', options: ['甲', '乙'], min_votes: 1, secret: true }, childAgent(childOf('acad')))
    assert(sop.ok === true && sop.ballot.rules.secret === true, 'S9：不记名板建立（secret=true）')
    await callTool('vibe_v5_poll_vote', { choices: ['o-1'] }, childAgent(childOf('r-1')))
    await callTool('vibe_v5_poll_vote', { choices: ['o-2'] }, childAgent(childOf('r-2')))
    const scl = await callTool('vibe_v5_poll_close', { ballot_id: String(sop.ballot.id), reason: 'S9 不记名计票' }, childAgent(childOf('acad')))
    assert(scl.ok === true, 'S9：不记名板已截止')
    const srec = await callTool('vibe_v5_reconsider', { target: 'ballot:' + String(sop.ballot.id), why: 'S9 不记名板复议' }, childAgent(childOf('r-1')))
    assert(srec.ok === true && srec.secretSource === true && srec.reconsideration.secretSource === true,
      'S9×S7：不记名板的复议被受理且**标记 secretSource**（got ' + JSON.stringify(srec).slice(0, 240) + '）')
    const sjson = JSON.stringify(srec)
    assert(sjson.indexOf('choices') === -1 && sjson.indexOf('o-1') === -1 && sjson.indexOf('votes') === -1,
      'S9/R54：复议回执**只带聚合面**（无逐人选择；got ' + sjson.slice(0, 220) + '）')
    assert(/本板不记名/.test(chatTextR10()) && !/r-1＝o-1/.test(chatTextR10()),
      'S9/R54：广播**只回显"本板不记名"这一事实**、不含逐人选择')
    const bro = ballotRow(String(sop.ballot.id))
    assert(!!bro && bro.phase === 'open' && Array.isArray(bro.reconsiderations) && bro.reconsiderations.length === 1
      && Number(bro.threshold.m) >= Number(bro.reconsiderations[0].thresholdBefore) && !!bro.priorResult,
      'S9/U3：板已重新开启＋门槛**只升不降**＋旧计票留档（priorResult；got ' + JSON.stringify([bro && bro.phase, bro && bro.threshold, bro && bro.priorResult && bro.priorResult.cast]) + '）')
  } else if (name === 's9-audit-append-only') {
    // S9-audit-append-only（R7）：复议**不改写历史** —— 旧结论/旧票面/旧少数意见进 `previousRounds`，
    // 旧结论带 `supersededBy` 标记；新一轮从**空票面**开始、轮次 +1。
    const p1 = await fresh('p-s9e', 'S9 append-only 探测。')
    assert(p1.ok === true, 'S9：探测对象进入验证')
    await waitVerify('p-s9e')
    for (const id of ['r-1', 'r-2', 'r-3']) await callTool('vibe_v5_verdict', { target: 'p-s9e', verdict: 1, reason: '布尔真' }, childAgent(childOf(id)))
    await callTool('vibe_v5_verdict', { target: 'p-s9e', verdict: 0.7, reason: '保留 0.7' }, childAgent(childOf('acad')))
    await settleAll()
    let sv = await callTool('vibe_v5_status', {})
    if (sv.verified.indexOf('p-s9e') === -1) { await drainWakes(8); await settleAll(); sv = await callTool('vibe_v5_status', {}) }
    const before = recOf('p-s9e')
    assert(!!before && before.outcome === 'true' && Number(before.round || 0) >= 1, 'S9：结论为真（前置）')
    const rc = await callTool('vibe_v5_reconsider', { target: 'p-s9e', why: 'S9 append-only 探测' }, childAgent(childOf('r-1')))
    assert(rc.ok === true && rc.eligibility === 'winner', 'S9：复议受理（前置；got ' + JSON.stringify(rc).slice(0, 160) + '）')
    const after = recOf('p-s9e')
    assert(Array.isArray(after.previousRounds) && after.previousRounds.length === 1
      && after.previousRounds[0].outcome === 'true' && after.previousRounds[0].minority.length === 1
      && Object.keys(after.previousRounds[0].votes).length === 4,
      'S9/R7：旧结论／旧票面／旧少数意见**全部留档**（previousRounds[0]；append-only；got ' + JSON.stringify(after.previousRounds).slice(0, 260) + '）')
    assert(after.previousOutcome === 'true' && String(after.supersededBy || '').length > 0 && after.closed === false
      && Object.keys(after.votes).length === 0 && Number(after.round) === Number(before.round || 0) + 1,
      'S9/R7：旧结论带"已被复议"标记（supersededBy）＋新一轮**空票面**＋轮次 +1（got ' + JSON.stringify([after.previousOutcome, after.supersededBy, after.closed, after.round]) + '）')
  } else if (name === 's10-quote-same-meeting') {
    // S10-quote-same-meeting（D6）：**会议内引用**锚落**会议纪要文件**（耐久）⇒ 可解析；**只带摘要**
    // （>200 字符 ⇒ **确定性截断**＋`truncated:true`）；指针**落在消息上**（耐久）。
    const mt = await openMeeting('S10 会议内引用探测')
    await settleAll()
    const gotSpeech = await replyMeeting('r-1', { input: 'S10 会议发言（可被引用）' })
    assert(gotSpeech, 'S10：r-1 收到会议唤醒并交付发言（前置）')
    await settleAll()
    const mtFile = join(instDir, 'Shared', 'Meetings', String(mt.id) + '.md')
    const mtText = existsSync(mtFile) ? readFileSync(mtFile, 'utf8') : ''
    const mm = /^###\s+([A-Za-z0-9_-]+)/m.exec(mtText)
    assert(!!mm && mm[1] === 'r-1', 'S10：会议纪要里已有 r-1 的发言小节（锚可解析；got len=' + mtText.length + '）')
    const who = mm[1]
    const anchor = 'mt-' + String(mt.id) + '#speech-' + who + '-1'
    const q = await callTool('vibe_v5_say', { text: 'S10 引用同会议发言', quote_ref: anchor }, childAgent(childOf('r-2')))
    assert(q.ok === true && q.quote && q.quote.ref === anchor && q.quote.domain === 'meeting',
      'S10/D6：会议内引用成功（锚＝会议纪要；got ' + JSON.stringify(q).slice(0, 240) + '）')
    assert(String(q.quote.excerpt).length > 0 && String(q.quote.excerpt).length <= 200,
      'S10/D6：只带**摘要**（≤200 字符；got len=' + String(q.quote.excerpt).length + '）')
    const long = 'X'.repeat(500)
    const q2 = await callTool('vibe_v5_say', { text: 'S10 摘句截断探测', quote_ref: anchor, quote_excerpt: long }, childAgent(childOf('r-3')))
    assert(q2.ok === true && q2.quote.truncated === true && String(q2.quote.excerpt).length === 200,
      'S10/D6：摘句**确定性截断**（500 ⇒ 200 ＋ truncated:true；got len=' + String(q2.quote.excerpt).length + '）')
    const msgs = ((readV5State() || {}).institutes['default::institute'].messages) || []
    const stored = msgs.filter((x) => x && String(x.id) === String(q.ids[0]))[0]
    assert(!!stored && stored.quote && stored.quote.ref === anchor && Number(stored.quote.at) > 0,
      'S10/D6：指针**落在消息上**（耐久：quote{ref,at}；got ' + JSON.stringify(stored && stored.quote).slice(0, 200) + '）')
  } else if (name === 's10-cross-meeting-refused') {
    // S10-cross-meeting-refused（D6）：**跨会议/跨域**引用 ⇒ **具名拒**；`res:` 决议锚 ⇒ **具名拒**
    // 并说明原因（"跨会议只引上次决议；#26 未实现"）——**不得静默放宽**。
    const mt = await openMeeting('S10 跨会议引用探测')
    await settleAll()
    const gotSpeech = await replyMeeting('r-1', { input: 'S10 会议发言（跨会议引用前置）' })
    assert(gotSpeech, 'S10：r-1 交付会议发言（前置）')
    await settleAll()
    const mtText = existsSync(join(instDir, 'Shared', 'Meetings', String(mt.id) + '.md'))
      ? readFileSync(join(instDir, 'Shared', 'Meetings', String(mt.id) + '.md'), 'utf8') : ''
    const mm = /^###\s+([A-Za-z0-9_-]+)/m.exec(mtText)
    assert(!!mm && mm[1] === 'r-1', 'S10：会议纪要有 r-1 的小节（前置；got len=' + mtText.length + '）')
    const anchor = 'mt-' + String(mt.id) + '#speech-' + mm[1] + '-1'
    await waitMeetingClosed()
    const cross = await callTool('vibe_v5_say', { text: 'S10 跨会议引用（应被拒）', quote_ref: anchor }, childAgent(childOf('r-1')))
    assert(cross.ok === false && cross.code === 'V5_INVALID_ARGUMENT' && /仅限同一会议内/.test(String(cross.message)),
      'S10/D6：跨会议引用**具名拒绝**（got ' + JSON.stringify(cross).slice(0, 260) + '）')
    const res = await callTool('vibe_v5_say', { text: 'S10 决议引用（未落库）', quote_ref: 'res:p-s10' }, childAgent(childOf('r-1')))
    assert(res.ok === false && /悬空引用/.test(String(res.message)),
      'S10×S13/D6：`res:` 只解析**已落库**的决议 ⇒ 未落库 ⇒ **悬空具名拒**（got ' + JSON.stringify(res).slice(0, 260) + '）')
  } else if (name === 's10-dm-not-quotable') {
    // S10-dm-not-quotable（D6/G5）：私聊**不得**作为引用来源；补记只能由**本人**发起；补记**只记事实**；
    // **原私聊正文不进公开面**；补记后引用到的是**补记本**（`viaSupplement`）。
    const dm = await callTool('vibe_v5_say', { to: 'r-2', text: 'S10 私聊原文（不得进公开面）' }, childAgent(childOf('r-1')))
    assert(dm.ok === true && Array.isArray(dm.ids) && dm.ids.length > 0, 'S10：私聊已发出（前置）')
    const dmId = String(dm.ids[0])
    const q1 = await callTool('vibe_v5_say', { text: 'S10 引私聊（应被拒）', quote_ref: dmId }, childAgent(childOf('r-1')))
    assert(q1.ok === false && /私聊内容\*\*不得\*\*作为引用来源/.test(String(q1.message)),
      'S10/D6+G5：私聊**不得**作为引用来源（具名拒；got ' + JSON.stringify(q1).slice(0, 240) + '）')
    const wrong = await callTool('vibe_v5_say', { text: 'S10 第三人补记（应被拒）', supplement_of: dmId, why: '我想引用它' }, childAgent(childOf('r-2')))
    assert(wrong.ok === false && /发送者本人/.test(String(wrong.message)),
      'S10/G5：补记只能由**私聊发送者本人**发起（got ' + JSON.stringify(wrong).slice(0, 240) + '）')
    const sup = await callTool('vibe_v5_say', { text: 'S10 补记本：要点复述', supplement_of: dmId, why: '需要进公开面才能被引用' }, childAgent(childOf('r-1')))
    assert(sup.ok === true && sup.supplementOf === dmId && Array.isArray(sup.ids) && sup.ids.length > 0,
      'S10/G5：**本人**补记成功（got ' + JSON.stringify(sup).slice(0, 240) + '）')
    assert(chatTextR10().indexOf('S10 私聊原文（不得进公开面）') === -1,
      'S10/G5：**原私聊正文不进公开面**（群聊里没有私聊原文）')
    const ledger = ((readV5State() || {}).institutes['default::institute'].chatSupplements) || []
    assert(ledger.some((x) => x && x.of === dmId && x.by === 'r-1' && String(x.publicRef) === String(sup.ids[0])),
      'S10/G5：补记**只记事实**且可追（chatSupplements{of,by,publicRef}；got ' + JSON.stringify(ledger).slice(0, 240) + '）')
    const q2 = await callTool('vibe_v5_say', { text: 'S10 补记后引用', quote_ref: dmId }, childAgent(childOf('r-1')))
    assert(q2.ok === true && q2.quote.kind === 'supplemented-dm' && String(q2.quote.viaSupplement) === String(sup.ids[0])
      && String(q2.quote.excerpt).indexOf('S10 私聊原文') === -1,
      'S10/G5：补记后引用到的是**补记本**（viaSupplement；**不搬原私聊**；got ' + JSON.stringify(q2.quote).slice(0, 260) + '）')
  } else if (name === 's10-quote-limits') {
    // S10-quote-limits（D6/`04` §4–5）：**条数上限 2**（超限**具名拒**）＋**深度上限 3**（超深**折叠标注、不拒**）。
    const base = await callTool('vibe_v5_say', { text: 'S10 基线消息（可被引用）' }, childAgent(childOf('r-1')))
    assert(base.ok === true && Array.isArray(base.ids) && base.ids.length > 0, 'S10：基线消息已发出（前置）')
    const id = String(base.ids[0])
    const one = await callTool('vibe_v5_say', { text: 'S10 引用一条', quote_ref: id }, childAgent(childOf('r-2')))
    assert(one.ok === true && one.quote && one.quote.depth === 1, 'S10：一条引用可用（depth=1）')
    const three = await callTool('vibe_v5_say', { text: 'S10 引用三条（应被拒）', quote_refs: [id, id, id] }, childAgent(childOf('r-3')))
    assert(three.ok === false && /最多引用 2 条/.test(String(three.message)),
      'S10/D6：超条数**具名拒绝**（默认 2；got ' + JSON.stringify(three).slice(0, 240) + '）')
    let prev = id
    let last = null
    for (let i = 0; i < 4; i++) {
      last = await callTool('vibe_v5_say', { text: 'S10 链第 ' + (i + 2) + ' 条', quote_ref: prev }, childAgent(childOf(i % 2 ? 'r-2' : 'r-3')))
      assert(last.ok === true, 'S10：链第 ' + (i + 2) + ' 条被接受（got ' + JSON.stringify(last).slice(0, 160) + '）')
      prev = String(last.ids[0])
    }
    assert(last && last.quote && last.quote.collapsed === true && Number(last.quote.depth) > 3 && String(last.quote.excerpt) === '',
      'S10/D6：超深度 ⇒ **折叠**（collapsed:true、depth>3、不搬原文；got ' + JSON.stringify(last.quote).slice(0, 260) + '）')
    assert(/见第 k 轮发言/.test(chatTextR10()), 'S10/D6：折叠有**具名标注**（群聊可见）')
  } else if (name === 's10-dangling-refused') {
    // S10-dangling-refused（D6/B10）：**悬空锚**（消息/会议发言）⇒ **具名拒**；**不记名板** ⇒ 逐人锚**拒**、
    // 聚合锚**可引**。
    const d1 = await callTool('vibe_v5_say', { text: 'S10 悬空（消息）', quote_ref: 'msg-9999' }, childAgent(childOf('r-1')))
    assert(d1.ok === false && /悬空引用/.test(String(d1.message)),
      'S10/D6：悬空消息锚**具名拒**（got ' + JSON.stringify(d1).slice(0, 220) + '）')
    const d2 = await callTool('vibe_v5_say', { text: 'S10 悬空（纪要）', quote_ref: 'mt-mt-9999#speech-r-1-1' }, childAgent(childOf('r-1')))
    assert(d2.ok === false && /悬空引用/.test(String(d2.message)),
      'S10/D6：悬空会议发言锚**具名拒**（got ' + JSON.stringify(d2).slice(0, 220) + '）')
    await openMeeting('S10 不记名引用探测')
    await settleAll()
    const op = await callTool('vibe_v5_poll_open', { question: 'S10 不记名引用板', options: ['甲', '乙'], min_votes: 1, secret: true }, childAgent(childOf('acad')))
    assert(op.ok === true && op.ballot.rules.secret === true, 'S10：不记名板已开（前置）')
    await callTool('vibe_v5_poll_vote', { choices: ['o-1'] }, childAgent(childOf('r-1')))
    const cl = await callTool('vibe_v5_poll_close', { ballot_id: String(op.ballot.id), reason: 'S10 计票' }, childAgent(childOf('acad')))
    assert(cl.ok === true, 'S10：不记名板已截止（冻结解除）')
    const per = await callTool('vibe_v5_say', { text: 'S10 引不记名逐人（应被拒）', quote_ref: 'ballot:' + String(op.ballot.id) + '#vote-r-1' }, childAgent(childOf('r-2')))
    assert(per.ok === false && /逐人选择不可引用/.test(String(per.message)),
      'S10/B10：不记名**逐人锚**具名拒（got ' + JSON.stringify(per).slice(0, 240) + '）')
    const agg = await callTool('vibe_v5_say', { text: 'S10 引不记名聚合', quote_ref: 'ballot:' + String(op.ballot.id) }, childAgent(childOf('r-2')))
    assert(agg.ok === true && agg.quote.kind === 'ballot-aggregate' && agg.quote.secretAggregateOnly === true,
      'S10/B10：不记名板**只可引聚合**（got ' + JSON.stringify(agg).slice(0, 260) + '）')
  } else if (name === 's10-no-drive') {
    // S10-no-drive（R1/R10）：引用**不驱动**任何流程（不改阶段、不写票/真值）；**S8×S10**：冻结期引用
    // **随发言一起被拒**（同一入口 ⇒ 无需第二道门）。
    const mt = await openMeeting('S10 不驱动探测')
    await settleAll()
    const gotSpeech = await replyMeeting('r-1', { input: 'S10 会议发言（不驱动前置）' })
    assert(gotSpeech, 'S10：r-1 交付会议发言（前置）')
    await settleAll()
    const st0 = await callTool('vibe_v5_status', {})
    const phase0 = String((st0.meeting || {}).phase || '')
    const mtText = existsSync(join(instDir, 'Shared', 'Meetings', String(mt.id) + '.md'))
      ? readFileSync(join(instDir, 'Shared', 'Meetings', String(mt.id) + '.md'), 'utf8') : ''
    const mm = /^###\s+([A-Za-z0-9_-]+)/m.exec(mtText)
    assert(!!mm && !!st0.meeting, 'S10：会议进行中且纪要有发言（前置）')
    const anchor = 'mt-' + String(mt.id) + '#speech-' + mm[1] + '-1'
    const q = await callTool('vibe_v5_say', { text: 'S10 引用不改流程', quote_ref: anchor }, childAgent(childOf('r-2')))
    assert(q.ok === true, 'S10：引用成功（前置；got ' + JSON.stringify(q).slice(0, 160) + '）')
    const st1 = await callTool('vibe_v5_status', {})
    assert(!!st1.meeting && String(st1.meeting.phase) === phase0,
      'S10：引用**不改会议阶段**（' + phase0 + ' ⇒ ' + String(st1.meeting && st1.meeting.phase) + '）')
    assert(JSON.stringify(st1.solveVotes) === JSON.stringify(st0.solveVotes) && JSON.stringify(st1.undecided) === JSON.stringify(st0.undecided),
      'S10：引用**不写票/真值**（solveVotes/undecided 全不变）')
    const op = await callTool('vibe_v5_poll_open', { question: 'S10 冻结引用板', options: ['甲', '乙'], min_votes: 1 }, childAgent(childOf('acad')))
    assert(op.ok === true, 'S10：表决板已开（冻结）')
    const qf = await callTool('vibe_v5_say', { text: 'S10 冻结期引用（应被拒）', quote_ref: anchor }, childAgent(childOf('r-3')))
    assert(qf.ok === false && /表决期禁止发言/.test(String(qf.message)),
      'S10×S8：冻结期**引用随发言一起被拒**（同一入口；got ' + JSON.stringify(qf).slice(0, 240) + '）')
    assert(chatTextR10().indexOf('S10 冻结期引用（应被拒）') === -1, 'S10×S8：被拒的引用**不产生任何发言**')
  } else if (name === 's11-appoint') {
    // S11-appoint（GAPS 29）：院士指定**非主持成员**为记录人 ⇒ 生效 ＋ 只读面 ＋ 台账（append-only）＋ 广播。
    const mt = await openMeeting('S11 记录人指定探测')
    await settleAll()
    const ap = await callTool('vibe_v5_secretary', { who: 'r-1', why: 'S11 记录与主持分离' }, childAgent(childOf('acad')))
    assert(ap.ok === true && ap.secretary && ap.secretary.who === 'r-1' && String(ap.secretary.meetingId) === String(mt.id),
      'S11：院士可指定记录人（got ' + JSON.stringify(ap).slice(0, 220) + '）')
    const sv = await callTool('vibe_v5_status', {})
    assert(String(sv.meeting.secretary) === 'r-1' && Number(sv.meeting.record_entry_count) === 0,
      'S11：只读面可见（status.meeting.secretary/record_entry_count；got ' + JSON.stringify([sv.meeting.secretary, sv.meeting.record_entry_count]) + '）')
    const led = ((readV5State() || {}).institutes['default::institute'].secretaries) || []
    assert(led.length === 1 && led[0].who === 'r-1' && led[0].by === 'acad' && Number(led[0].at) > 0 && String(led[0].meetingId) === String(mt.id),
      'S11：台账 append-only 一条（who/by/at/meetingId；got ' + JSON.stringify(led) + '）')
    assert(/【记录人】/.test(chatTextR10()), 'S11：指定**具名广播**')
    const ap2 = await callTool('vibe_v5_secretary', { who: 'r-1' }, childAgent(childOf('acad')))
    assert(ap2.ok === true && ap2.deduped === true, 'S11：同值指定 ⇒ **幂等**（deduped，不追加台账；got ' + JSON.stringify(ap2).slice(0, 180) + '）')
    const led2 = ((readV5State() || {}).institutes['default::institute'].secretaries) || []
    assert(led2.length === 1, 'S11：幂等**不追加台账**（仍 1 条）')
  } else if (name === 's11-self-refused') {
    // S11-self-refused（GAPS 29 核心）：**不得自任**（院士/所办）＋ **临时工不可被指定**（仅在册成员）。
    await openMeeting('S11 禁止自任探测')
    await settleAll()
    const self = await callTool('vibe_v5_secretary', { who: 'acad', why: 'S11 自任探测' }, childAgent(childOf('acad')))
    assert(self.ok === false && self.code === 'V5_INVALID_ARGUMENT' && /主持人不得兼任唯一记录者/.test(String(self.message)),
      'S11/GAPS 29：**院士不得自任**记录人（具名拒；got ' + JSON.stringify(self).slice(0, 240) + '）')
    const off = await callTool('vibe_v5_secretary', { who: 'office' }, childAgent(childOf('acad')))
    assert(off.ok === false, 'S11：**所办**也不可被指定（got ' + JSON.stringify(off).slice(0, 180) + '）')
    const temp = await callTool('vibe_v5_secretary', { who: 't-1' }, childAgent(childOf('acad')))
    assert(temp.ok === false && temp.code === 'V5_NOT_VOTER',
      'S11：**临时工不可被指定**（仅在册成员；got ' + JSON.stringify(temp).slice(0, 200) + '）')
    const sv = await callTool('vibe_v5_status', {})
    assert(String(sv.meeting.secretary) === '', 'S11：三次拒绝**无副作用**（记录人仍为空）')
  } else if (name === 's11-only-academician') {
    // S11-only-academician（`03` #28/#27）：指定**仅院士**；写条目＝**院士 ∪ 当前记录人**；其他成员具名拒。
    await openMeeting('S11 权限面探测')
    await settleAll()
    const bad = await callTool('vibe_v5_secretary', { who: 'r-1' }, childAgent(childOf('r-2')))
    assert(bad.ok === false && bad.code === 'V5_NOT_ACADEMICIAN',
      'S11/#28：非院士指定记录人 ⇒ 具名拒（got ' + JSON.stringify(bad).slice(0, 200) + '）')
    const ap = await callTool('vibe_v5_secretary', { who: 'r-1' }, childAgent(childOf('acad')))
    assert(ap.ok === true, 'S11：院士指定 r-1（前置）')
    const other = await callTool('vibe_v5_minutes', { entry: 'S11 非记录人写条目（应被拒）' }, childAgent(childOf('r-2')))
    assert(other.ok === false && other.code === 'V5_NOT_VOTER' && /记录人/.test(String(other.message)),
      'S11/#27：**非记录人**写条目 ⇒ 具名拒（got ' + JSON.stringify(other).slice(0, 240) + '）')
    const mine = await callTool('vibe_v5_minutes', { entry: 'S11 记录人条目（r-1）' }, childAgent(childOf('r-1')))
    assert(mine.ok === true && mine.entry && mine.entry.by === 'r-1',
      'S11/#27：**记录人**可写条目（got ' + JSON.stringify(mine).slice(0, 220) + '）')
    const chairWrite = await callTool('vibe_v5_minutes', { entry: 'S11 院士条目（acad）' }, childAgent(childOf('acad')))
    assert(chairWrite.ok === true, 'S11/#27：**院士**也可写条目（`03` #27"院士/纪要人"；got ' + JSON.stringify(chairWrite).slice(0, 200) + '）')
  } else if (name === 's11-record-entries') {
    // S11-record-entries：记录人**只增不改**追加具名条目 ⇒ 纪要出现独立小节 `## 记录人补充` ＋ 责任人行；
    // **同一条目幂等**；无 `entry` ⇒ **只报缺口**（不自动补全，R7）。
    const mt = await openMeeting('S11 记录人条目探测')
    await settleAll()
    await callTool('vibe_v5_secretary', { who: 'r-1' }, childAgent(childOf('acad')))
    const gaps = await callTool('vibe_v5_minutes', { detail: 'brief' }, childAgent(childOf('r-1')))
    const gapsOk = gaps.ok === true && !!gaps.minutes && Array.isArray(gaps.minutes.gaps) && gaps.minutes.gaps.length > 0
      && /不自动补全/.test(String(gaps.minutes && gaps.minutes.note))
    assert(gapsOk, 'S11/R7：无 `entry` ⇒ **只报缺口**（不自动补全；got ' + JSON.stringify(gaps).slice(0, 240) + '）')
    const e1 = await callTool('vibe_v5_minutes', { entry: 'S11 条目：议程要点与行动项', agenda_item: 'S11' }, childAgent(childOf('r-1')))
    assert(e1.ok === true && e1.entry && e1.entry.by === 'r-1' && Number(e1.entry.at) > 0,
      'S11：记录人追加具名条目（got ' + JSON.stringify(e1).slice(0, 220) + '）')
    const e2 = await callTool('vibe_v5_minutes', { entry: 'S11 条目：议程要点与行动项' }, childAgent(childOf('r-1')))
    assert(e2.ok === true && e2.deduped === true, 'S11：**同一条目幂等**（deduped；got ' + JSON.stringify(e2).slice(0, 180) + '）')
    const mtFile = join(instDir, 'Shared', 'Meetings', String(mt.id) + '.md')
    let mtText = existsSync(mtFile) ? readFileSync(mtFile, 'utf8') : ''
    assert(mtText.indexOf('S11 条目：议程要点与行动项') !== -1, 'S11：条目**立即追加进纪要**（append-only；got len=' + mtText.length + '）')
    const sv = await callTool('vibe_v5_status', {})
    assert(Number(sv.meeting.record_entry_count) === 1, 'S11：只读面 `record_entry_count` = 1（got ' + JSON.stringify(sv.meeting.record_entry_count) + '）')
    await waitMeetingClosed()
    mtText = existsSync(mtFile) ? readFileSync(mtFile, 'utf8') : ''
    assert(mtText.indexOf('## 记录人补充') !== -1 && mtText.indexOf('- 纪要责任人：r-1') !== -1,
      'S11：收束后纪要含**独立小节** `## 记录人补充` ＋责任人行（got len=' + mtText.length + '）')
    assert(mtText.indexOf('S11 条目：议程要点与行动项') !== -1, 'S11：条目**在收束后的纪要里仍在**（可追）')
  } else if (name === 's11-zones-and-anchors') {
    // S11×S8×S10：记录人条目**不破坏两区**、**不影响** S10 的会议内锚（只追加、绝不重写 `### <who>`）。
    const mt = await openMeeting('S11 两区与锚探测')
    await settleAll()
    const gotSpeech = await replyMeeting('r-1', { input: 'S11 会议发言（锚的前置）' })
    assert(gotSpeech, 'S11：r-1 交付会议发言（前置）')
    await settleAll()
    await callTool('vibe_v5_secretary', { who: 'r-2' }, childAgent(childOf('acad')))
    const e = await callTool('vibe_v5_minutes', { entry: 'S11 记录人条目（不得破坏两区/锚）' }, childAgent(childOf('r-2')))
    assert(e.ok === true, 'S11：记录人条目已追加（前置；got ' + JSON.stringify(e).slice(0, 160) + '）')
    const mtFile = join(instDir, 'Shared', 'Meetings', String(mt.id) + '.md')
    let mtText = existsSync(mtFile) ? readFileSync(mtFile, 'utf8') : ''
    assert(mtText.indexOf('### r-1') !== -1 && mtText.indexOf('S11 记录人条目（不得破坏两区/锚）') !== -1,
      'S11×S8：逐人发言小节**未被重写**，且记录人条目**追加**在同一文件（got len=' + mtText.length + '）')
    const q = await callTool('vibe_v5_say', { text: 'S11 记录条目后引用锚', quote_ref: 'mt-' + String(mt.id) + '#speech-r-1-1' }, childAgent(childOf('r-3')))
    assert(q.ok === true && q.quote && q.quote.domain === 'meeting',
      'S11×S10：**记录人条目后，会议内锚仍可解析**（got ' + JSON.stringify(q).slice(0, 240) + '）')
    await waitMeetingClosed()
    mtText = existsSync(mtFile) ? readFileSync(mtFile, 'utf8') : ''
    assert(mtText.indexOf('## 发言区') !== -1 && mtText.indexOf('## 投票区') !== -1 && mtText.indexOf('## 记录人补充') !== -1,
      'S11×S8：收束后**两区仍在**且记录人小节**独立**（got len=' + mtText.length + '）')
    assert(mtText.indexOf('## 投票区') < mtText.indexOf('## 记录人补充'),
      'S11×S8：`## 记录人补充` 位于**两区之后**（S8 门不回归）')
  } else if (name === 's11-revoke-idempotent') {
    // S11-revoke-idempotent：撤销 ⇒ 责任人清空；**再撤销 ⇒ 幂等**；换人 ⇒ 旧记录带 `revokedAt`（append-only）；
    // 换人后**前记录人**不再能写条目。
    await openMeeting('S11 撤销幂等探测')
    await settleAll()
    await callTool('vibe_v5_secretary', { who: 'r-1' }, childAgent(childOf('acad')))
    const rv = await callTool('vibe_v5_secretary', { revoke: true }, childAgent(childOf('acad')))
    assert(rv.ok === true && rv.revoked === 'r-1', 'S11：撤销记录人（got ' + JSON.stringify(rv).slice(0, 200) + '）')
    const rv2 = await callTool('vibe_v5_secretary', { revoke: true }, childAgent(childOf('acad')))
    assert(rv2.ok === true && rv2.deduped === true, 'S11：**再撤销 ⇒ 幂等**（deduped；got ' + JSON.stringify(rv2).slice(0, 180) + '）')
    const ap2 = await callTool('vibe_v5_secretary', { who: 'r-2' }, childAgent(childOf('acad')))
    assert(ap2.ok === true, 'S11：换人（r-1 ⇒ r-2）')
    const led = ((readV5State() || {}).institutes['default::institute'].secretaries) || []
    assert(led.length === 3 && led[0].who === 'r-1' && Number(led[0].revokedAt) === 0 && Number(led[1].revokedAt) > 0 && led[2].who === 'r-2',
      'S11：台账 **append-only**（指定 1 条 ＋ 撤销 1 条（`revokedAt`）＋ 换人 1 条；got ' + JSON.stringify(led).slice(0, 300) + '）')
    const exSec = await callTool('vibe_v5_minutes', { entry: 'S11 前记录人写条目（应被拒）' }, childAgent(childOf('r-1')))
    assert(exSec.ok === false && exSec.code === 'V5_NOT_VOTER',
      'S11：**前记录人**不再能写条目（got ' + JSON.stringify(exSec).slice(0, 220) + '）')
  } else if (name === 's12-level-derived') {
    // S12-level-derived（D7/GAPS 22）：等级**派生**自 `kind`——`sync`/`division` ⇒ **简流程**；
    // `solve-vote`/`verify-request` ⇒ **正式**；只读面 `status.meeting.level` 可见。
    const light = await callTool('vibe_v5_meeting', { agenda: 'S12 简流程派生探测', kind: 'sync' }, childAgent(childOf('acad')))
    assert(light.ok === true, 'S12：简流程会议已开（前置；got ' + JSON.stringify(light).slice(0, 160) + '）')
    const st1 = await callTool('vibe_v5_status', {})
    assert(String(st1.meeting.level) === 'light', 'S12/D7：`kind=sync` ⇒ **简流程**（got ' + JSON.stringify(st1.meeting.level) + '）')
    await waitMeetingClosed()
    const formal = await callTool('vibe_v5_meeting', { agenda: 'S12 正式派生探测', kind: 'solve-vote' }, childAgent(childOf('acad')))
    assert(formal.ok === true, 'S12：决议类会议已开（前置）')
    const st2 = await callTool('vibe_v5_status', {})
    assert(String(st2.meeting.level) === 'formal', 'S12/D7：`kind=solve-vote` ⇒ **正式**（got ' + JSON.stringify(st2.meeting.level) + '）')
  } else if (name === 's12-light-no-truth') {
    // S12-light-no-truth（D7 **硬约束**）：简流程会期内**不得产出实体定论** —— `entry_kind:'decision'` **具名拒**；
    // 事实性条目仍可写；纪要**公开写明**"简流程：不得产出实体定论"。
    const mt = await openMeeting('S12 简流程不得定论探测')
    await settleAll()
    const dec = await callTool('vibe_v5_minutes', { entry: '决议：本项目通过结题', entry_kind: 'decision' }, childAgent(childOf('acad')))
    assert(dec.ok === false && dec.code === 'V5_INVALID_ARGUMENT' && /简流程不得产出实体定论/.test(String(dec.message)),
      'S12/D7：简流程**不得落决议条目**（具名拒；got ' + JSON.stringify(dec).slice(0, 260) + '）')
    const note = await callTool('vibe_v5_minutes', { entry: '讨论要点：先补实验再议' }, childAgent(childOf('acad')))
    assert(note.ok === true && note.entry && String(note.entry.entry_kind) === 'note',
      'S12/D7：**事实性条目**仍可写（got ' + JSON.stringify(note).slice(0, 200) + '）')
    const sv = await callTool('vibe_v5_status', {})
    assert(Number(sv.meeting.record_entry_count) === 1, 'S12：被拒的决议**不产生条目**（计数仍 1；got ' + JSON.stringify(sv.meeting.record_entry_count) + '）')
    await waitMeetingClosed()
    const mtText = existsSync(join(instDir, 'Shared', 'Meetings', String(mt.id) + '.md'))
      ? readFileSync(join(instDir, 'Shared', 'Meetings', String(mt.id) + '.md'), 'utf8') : ''
    assert(mtText.indexOf('简流程') !== -1 && mtText.indexOf('不得产出实体定论') !== -1,
      'S12/D7：纪要**公开写明**简流程不得产出实体定论（got len=' + mtText.length + '）')
  } else if (name === 's12-acad-only') {
    // S12-acad-only（`03` #3★）：**设定等级＝仅院士**；设定为正式后，**决议条目才被接受**。
    const mt = await openMeeting('S12 等级权限探测')
    await settleAll()
    const bad = await callTool('vibe_v5_meeting', { formal_agenda: true }, childAgent(childOf('r-2')))
    assert(bad.ok === false && bad.code === 'V5_NOT_ACADEMICIAN',
      'S12/#3★：非院士设定等级 ⇒ 具名拒（got ' + JSON.stringify(bad).slice(0, 220) + '）')
    // **自愈前置**（不许依赖"上一步必然失败"）：只看**当前状态**——仍为简流程时才检查"决议被拒"。
    const stNow = await callTool('vibe_v5_status', {})
    if (stNow.meeting && String(stNow.meeting.level) === 'light') {
      const denyDec = await callTool('vibe_v5_minutes', { entry: '决议：先占位', entry_kind: 'decision' }, childAgent(childOf('acad')))
      assert(denyDec.ok === false, 'S12：简流程下决议被拒（前置；got ' + JSON.stringify(denyDec).slice(0, 160) + '）')
    }
    const set = await callTool('vibe_v5_meeting', { formal_agenda: true }, childAgent(childOf('acad')))
    assert(set.ok === true && String(set.level) === 'formal', 'S12：院士把本场升为**正式**（got ' + JSON.stringify(set).slice(0, 200) + '）')
    const okDec = await callTool('vibe_v5_minutes', { entry: '决议：本项目通过结题（正式会议）', entry_kind: 'decision' }, childAgent(childOf('acad')))
    assert(okDec.ok === true && String(okDec.entry.entry_kind) === 'decision',
      'S12/D7：**正式**会议可落决议条目（got ' + JSON.stringify(okDec).slice(0, 200) + '）')
    await waitMeetingClosed()
    const mtText = existsSync(join(instDir, 'Shared', 'Meetings', String(mt.id) + '.md'))
      ? readFileSync(join(instDir, 'Shared', 'Meetings', String(mt.id) + '.md'), 'utf8') : ''
    assert(mtText.indexOf('**决议**（acad）') !== -1, 'S12：决议条目在纪要里**标为决议**（got len=' + mtText.length + '）')
  } else if (name === 's12-idempotent') {
    // S12-idempotent：**同值幂等**（`deduped`，**不写事件**）；**真变更** ⇒ 生效并**写事件广播**。
    await openMeeting('S12 等级幂等探测')
    await settleAll()
    const first = await callTool('vibe_v5_meeting', { formal_agenda: true }, childAgent(childOf('acad')))
    assert(first.ok === true && String(first.level) === 'formal', 'S12：首次升级生效（前置）')
    const again = await callTool('vibe_v5_meeting', { formal_agenda: true }, childAgent(childOf('acad')))
    assert(again.ok === true && again.deduped === true, 'S12：**同值幂等**（deduped；got ' + JSON.stringify(again).slice(0, 200) + '）')
    const back = await callTool('vibe_v5_meeting', { formal_agenda: false }, childAgent(childOf('acad')))
    assert(back.ok === true && String(back.level) === 'light' && String(back.before) === 'formal',
      'S12：**真变更生效**（formal ⇒ light；got ' + JSON.stringify(back).slice(0, 200) + '）')
    assert(/【会议分级】/.test(chatTextR10()), 'S12：等级变更**写事件并广播**（具名）')
    const sv = await callTool('vibe_v5_status', {})
    assert(String(sv.meeting.level) === 'light', 'S12：只读面回到简流程（got ' + JSON.stringify(sv.meeting.level) + '）')
  } else if (name === 's12-report-visible') {
    // S12-report-visible：等级在 `report()` 与 `status` 里**公开可见**（简流程写明"不得产出实体定论"）。
    await openMeeting('S12 等级可见性探测')
    await settleAll()
    const sv = await callTool('vibe_v5_status', {})
    assert(String(sv.meeting.level) === 'light', 'S12：`status.meeting.level`＝light（got ' + JSON.stringify(sv.meeting.level) + '）')
    const rep = await callTool('vibe_v5_report', {})
    const repText = JSON.stringify(rep)
    assert(repText.indexOf('简流程') !== -1 && repText.indexOf('不得产出实体定论') !== -1,
      'S12：`report()` **明写**简流程与硬约束（got ' + repText.slice(0, 240) + '）')
  } else if (name === 's12-no-drive') {
    // S12-no-drive（R1/D10）：设定等级与"简流程拒绝"**不驱动**任何流程（不改阶段、不写票、不收束、无定时器）。
    await openMeeting('S12 不驱动探测')
    await settleAll()
    const st0 = await callTool('vibe_v5_status', {})
    const phase0 = String((st0.meeting || {}).phase || '')
    assert(!!st0.meeting, 'S12：会议进行中（前置）')
    const set = await callTool('vibe_v5_meeting', { formal_agenda: true }, childAgent(childOf('acad')))
    // **变异敏感断言放最前**（R70：设等级**不得驱动**会议）——**只看当前状态**，不假设上一步成功。
    const st1 = await callTool('vibe_v5_status', {})
    assert(!!st1.meeting && String(st1.meeting.phase) === phase0,
      'S12：等级变更**不改会议阶段**（' + phase0 + ' ⇒ ' + String(st1.meeting && st1.meeting.phase) + '）')
    assert(JSON.stringify(st1.solveVotes) === JSON.stringify(st0.solveVotes) && JSON.stringify(st1.undecided) === JSON.stringify(st0.undecided),
      'S12：等级变更**不写票/真值**（solveVotes/undecided 不变）')
    assert(set.ok === true && String(set.level) === 'formal', 'S12：等级已设定（前置；got ' + JSON.stringify(set).slice(0, 180) + '）')
    await callTool('vibe_v5_minutes', { entry: '决议：甲', entry_kind: 'decision' }, childAgent(childOf('acad')))
    const back = await callTool('vibe_v5_meeting', { formal_agenda: false }, childAgent(childOf('acad')))
    assert(back.ok === true && String(back.level) === 'light', 'S12：降回简流程（前置；got ' + JSON.stringify(back).slice(0, 180) + '）')
    const lightAgain = await callTool('vibe_v5_minutes', { entry: '决议：乙', entry_kind: 'decision' }, childAgent(childOf('acad')))
    assert(lightAgain.ok === false && /简流程不得产出实体定论/.test(String(lightAgain.message)),
      'S12：降级后决议**再次被拒**（got ' + JSON.stringify(lightAgain).slice(0, 220) + '）')
    const st2 = await callTool('vibe_v5_status', {})
    assert(!!st2.meeting && Number(st2.meeting.record_entry_count) === 1,
      'S12：被拒的决议**不留条目**（计数仍 1；got ' + JSON.stringify(st2.meeting.record_entry_count) + '）')
  } else if (name === 's10-last-resolution-quotable') {
    // S10×S13（D6 放开）：**跨会议可引"上次决议"**（稳定标识 `res:<n>`／`res:latest`）；摘要＋指针、不搬原文。
    const mt = await callTool('vibe_v5_meeting', { agenda: 'S10 决议引用探测', kind: 'solve-vote' }, childAgent(childOf('acad')))
    assert(mt.ok === true, 'S10×S13：正式会议已开（前置；got ' + JSON.stringify(mt).slice(0, 160) + '）')
    const rec = await callTool('vibe_v5_result_record', { text: 'S10×S13 决议：甲方案通过（待引用的对象）', kind: 'resolution' }, childAgent(childOf('acad')))
    assert(rec.ok === true && rec.resolution && /^res-\d+$/.test(String(rec.resolution.id)),
      'S10×S13：决议已落库（前置；got ' + JSON.stringify(rec).slice(0, 200) + '）')
    const rid = String(rec.resolution.id)
    await waitMeetingClosed()
    const q = await callTool('vibe_v5_say', { text: 'S10×S13 引上次决议（latest）', quote_ref: 'res:latest' }, childAgent(childOf('r-1')))
    assert(q.ok === true && q.quote && q.quote.kind === 'resolution' && q.quote.domain === 'resolution',
      'S10×S13/D6：**跨会议可引上次决议**（`res:latest`；got ' + JSON.stringify(q).slice(0, 240) + '）')
    assert(String(q.quote.excerpt).length > 0 && String(q.quote.excerpt).length <= 200 && q.quote.supersededBy === '',
      'S10×S13：只带**摘要＋指针**（≤200；`supersededBy` 字段在位；got ' + JSON.stringify(q.quote).slice(0, 240) + '）')
    const q2 = await callTool('vibe_v5_say', { text: 'S10×S13 引指定决议', quote_ref: 'res:' + rid }, childAgent(childOf('r-1')))
    assert(q2.ok === true && q2.quote.ref === 'res:' + rid,
      'S10×S13：`res:<id>` 可引（got ' + JSON.stringify(q2).slice(0, 200) + '）')
  } else if (name === 's13-record-resolution') {
    // S13-record-resolution（G2）：**公告即生效**（`effectiveAt === at`）＋**框架分配稳定标识** ＋ 只读面可见 ＋ 时间键一律拒。
    const mt = await callTool('vibe_v5_meeting', { agenda: 'S13 决议落库探测', kind: 'solve-vote' }, childAgent(childOf('acad')))
    assert(mt.ok === true, 'S13：正式会议已开（前置；got ' + JSON.stringify(mt).slice(0, 160) + '）')
    const rec = await callTool('vibe_v5_result_record', { text: 'S13 决议：本项目通过结题', kind: 'resolution', target: 'p-13', actions: [{ who: 'r-1', due_in: 'next-meeting' }] }, childAgent(childOf('acad')))
    assert(rec.ok === true && rec.resolution && /^res-\d+$/.test(String(rec.resolution.id))
      && Number(rec.resolution.effectiveAt) === Number(rec.resolution.at),
      'S13/G2：**公告即生效**（`effectiveAt === at`）＋**框架分配稳定标识**（got ' + JSON.stringify(rec).slice(0, 260) + '）')
    assert(Array.isArray(rec.resolution.actions) && rec.resolution.actions.length === 1 && rec.resolution.actions[0].who === 'r-1',
      'S13/G2：`actions[{who,due_in}]` 入档（got ' + JSON.stringify(rec.resolution.actions).slice(0, 200) + '）')
    const sv = await callTool('vibe_v5_status', {})
    assert(Number(sv.resolutions.count) === 1 && String(sv.resolutions.latest_id) === String(rec.resolution.id),
      'S13：只读面 `status.resolutions{count,latest_id}`（got ' + JSON.stringify(sv.resolutions).slice(0, 220) + '）')
    assert(/【决议】/.test(chatTextR10()), 'S13：决议**具名广播**')
    const badT = await callTool('vibe_v5_result_record', { text: 'S13 决议（带时间键）', due_at: '2026-01-01' }, childAgent(childOf('acad')))
    assert(badT.ok === false && /时间由框架设置/.test(String(badT.message)),
      'S13/G2：**时间键一律拒**（含 `due_at`；got ' + JSON.stringify(badT).slice(0, 220) + '）')
    const other = await callTool('vibe_v5_result_record', { text: 'S13 非记录人决议（应被拒）' }, childAgent(childOf('r-2')))
    assert(other.ok === false && other.code === 'V5_NOT_VOTER',
      'S13/#26：**非院士且非记录人**落决议 ⇒ 具名拒（got ' + JSON.stringify(other).slice(0, 220) + '）')
  } else if (name === 's13-stable-id') {
    // S13-stable-id（G2/R7）：id **全所单调且各不同**；**同值决议幂等**（`deduped`，不追加台账）。
    const mt = await callTool('vibe_v5_meeting', { agenda: 'S13 标识单调探测', kind: 'solve-vote' }, childAgent(childOf('acad')))
    assert(mt.ok === true, 'S13：正式会议已开（前置）')
    const a1 = await callTool('vibe_v5_result_record', { text: 'S13 决议一：甲', kind: 'resolution' }, childAgent(childOf('acad')))
    const a2 = await callTool('vibe_v5_result_record', { text: 'S13 决议二：乙', kind: 'resolution' }, childAgent(childOf('acad')))
    assert(a1.ok === true && a2.ok === true && String(a1.resolution.id) === 'res-1' && String(a2.resolution.id) === 'res-2',
      'S13/G2：标识**全所单调且各不同**（框架从 `res-1` 起分配；got ' + JSON.stringify([a1.resolution && a1.resolution.id, a2.resolution && a2.resolution.id]) + '）')
    const dup = await callTool('vibe_v5_result_record', { text: 'S13 决议一：甲', kind: 'resolution' }, childAgent(childOf('acad')))
    assert(dup.ok === true && dup.deduped === true, 'S13：**同值决议幂等**（deduped；got ' + JSON.stringify(dup).slice(0, 200) + '）')
    const sv = await callTool('vibe_v5_status', {})
    assert(Number(sv.resolutions.count) === 2, 'S13：幂等**不追加台账**（仍 2 条；got ' + JSON.stringify(sv.resolutions.count) + '）')
  } else if (name === 's13-prerecord-refused') {
    // S13/D6：**未落库的决议不得被引用为结论** ⇒ 悬空具名拒（`res:<n>` 与空台账 `res:latest`）。
    const bad = await callTool('vibe_v5_say', { text: 'S13 未落库决议引用（应被拒）', quote_ref: 'res:99' }, childAgent(childOf('r-1')))
    assert(bad.ok === false && /悬空引用/.test(String(bad.message)) && /台账为空/.test(String(bad.message)),
      'S13/D6：**未落库**的决议 ⇒ 悬空具名拒（got ' + JSON.stringify(bad).slice(0, 240) + '）')
    const bad2 = await callTool('vibe_v5_say', { text: 'S13 空台账引用（应被拒）', quote_ref: 'res:latest' }, childAgent(childOf('r-1')))
    assert(bad2.ok === false && /悬空引用/.test(String(bad2.message)),
      'S13/D6：**台账为空**时 `res:latest` ⇒ 悬空具名拒（got ' + JSON.stringify(bad2).slice(0, 240) + '）')
  } else if (name === 's13-superseded') {
    // S13/G2（S9 口径）：台账 **append-only**（旧条仍在）＋ 检索/引用**携带 `supersededBy` 字段**（当前无写入面 ⇒ 恒为空）。
    const mt = await callTool('vibe_v5_meeting', { agenda: 'S13 取代链探测', kind: 'solve-vote' }, childAgent(childOf('acad')))
    assert(mt.ok === true, 'S13：正式会议已开（前置）')
    const r1 = await callTool('vibe_v5_result_record', { text: 'S13 决议甲', kind: 'resolution', target: 'p-1' }, childAgent(childOf('acad')))
    const r2 = await callTool('vibe_v5_result_record', { text: 'S13 决议乙', kind: 'resolution', target: 'p-2' }, childAgent(childOf('acad')))
    assert(r1.ok === true && r2.ok === true, 'S13：两条决议已落库（前置）')
    const list = await callTool('vibe_v5_resolutions', {})
    const rows = (list && Array.isArray(list.resolutions)) ? list.resolutions : []
    assert(list.ok === true && list.count === 2 && rows.length === 2
      && rows.every((x) => x && String(x.supersededBy) === '')
      && String(rows[0].id) === String(r2.resolution.id),
      'S13/G2：检索**时间倒序**＋携带 `supersededBy`（当前恒为空）＋台账**只增**（got ' + JSON.stringify(rows).slice(0, 260) + '）')
    await waitMeetingClosed()
    const q = await callTool('vibe_v5_say', { text: 'S13 引决议（带取代字段）', quote_ref: 'res:' + String(r1.resolution.id) }, childAgent(childOf('r-1')))
    assert(q.ok === true && q.quote && q.quote.supersededBy === '' && q.quote.ref === 'res:' + String(r1.resolution.id),
      'S13/G2：引用带 `supersededBy` 字段（可引"旧"决议，取代时**标明已被复议**；got ' + JSON.stringify(q && q.quote).slice(0, 240) + '）')
  } else if (name === 's13-light-refused') {
    // S13×S12（D7）：**简流程会期内落决议** ⇒ **复用 S12 的唯一判定点**具名拒；**不入台账**。
    await openMeeting('S13 简流程决议探测')
    await settleAll()
    const bad = await callTool('vibe_v5_result_record', { text: 'S13 简流程决议（应被拒）' }, childAgent(childOf('acad')))
    assert(bad.ok === false && /简流程不得产出实体定论/.test(String(bad.message)),
      'S13×S12/D7：简流程会期内落决议 ⇒ **具名拒**（唯一判定点；got ' + JSON.stringify(bad).slice(0, 240) + '）')
    const sv = await callTool('vibe_v5_status', {})
    assert(Number(sv.resolutions.count) === 0 && String(sv.resolutions.latest_id) === '',
      'S13：被拒的决议**不入台账**（got ' + JSON.stringify(sv.resolutions).slice(0, 200) + '）')
  } else if (name === 's13-search') {
    // S13/G2：**检索维度**（`id`／`target`／`meetingId`／`kind`／`limit`）；**时间过滤键一律拒**。
    const mt = await callTool('vibe_v5_meeting', { agenda: 'S13 检索探测', kind: 'solve-vote' }, childAgent(childOf('acad')))
    assert(mt.ok === true, 'S13：正式会议已开（前置）')
    const ra = await callTool('vibe_v5_result_record', { text: 'S13 检索决议甲', kind: 'resolution', target: 'p-1' }, childAgent(childOf('acad')))
    const rb = await callTool('vibe_v5_result_record', { text: 'S13 检索决议乙', kind: 'org', target: 'p-2' }, childAgent(childOf('acad')))
    assert(ra.ok === true && rb.ok === true, 'S13：两条决议已落库（前置）')
    const byTarget = await callTool('vibe_v5_resolutions', { target: 'p-1' })
    assert(byTarget.ok === true && byTarget.count === 1 && String(byTarget.resolutions[0].target) === 'p-1',
      'S13：按 `target` 检索（got ' + JSON.stringify(byTarget).slice(0, 220) + '）')
    const byKind = await callTool('vibe_v5_resolutions', { kind: 'org' })
    assert(byKind.ok === true && byKind.count === 1 && String(byKind.resolutions[0].kind) === 'org',
      'S13：按 `kind` 检索（got ' + JSON.stringify(byKind).slice(0, 220) + '）')
    const byId = await callTool('vibe_v5_resolutions', { id: '1' })
    assert(byId.ok === true && byId.count === 1 && String(byId.resolutions[0].id) === 'res-1',
      'S13：`id` 简写 `1` ⇒ `res-1`（got ' + JSON.stringify(byId).slice(0, 220) + '）')
    const byMeet = await callTool('vibe_v5_resolutions', { meetingId: String((await callTool('vibe_v5_status', {})).meeting.id), limit: 1 })
    assert(byMeet.ok === true && byMeet.count === 2 && byMeet.resolutions.length === 1,
      'S13：`meetingId` ＋ `limit` 封顶（got ' + JSON.stringify(byMeet).slice(0, 220) + '）')
    const badT = await callTool('vibe_v5_resolutions', { since_at: 'x' })
    assert(badT.ok === false && /检索不接受时间参数/.test(String(badT.message)),
      'S13：**时间过滤键一律拒**（got ' + JSON.stringify(badT).slice(0, 220) + '）')
  } else if (name.startsWith('s14-')) {
    // S14（迁移与守卫收尾）：**旧 `v5state.json` 契约**。手法：在该场景**隔离工作区**里为**另一个研究所名**
    // 写一份**旧形状**状态文件（缺 S4–S13 的七个新键，但保留 `members`），再用 `vibe_v5_configure` 切所
    // ⇒ 插件走"**收养既有研究所**"的路径（`instituteAt` 读盘）⇒ **真的从磁盘加载这份旧文件** ✓。
    const S14_KEYS = ['chair', 'stallNotice', 'grants', 'ballots', 'chatSupplements', 'secretaries', 'resolutions']
    const cur = readV5State()
    assert(!!cur && !!cur.institutes && !!cur.institutes['default::institute'],
      'S14：当前状态文件已存在（前置；got ' + JSON.stringify(cur && Object.keys(cur)) + '）')
    const mkLegacy = (instName) => {
      const inst = JSON.parse(JSON.stringify(cur.institutes['default::institute']))
      for (const k of S14_KEYS) delete inst[k]
      const dir = join(WS, 'VibeMath', 'Projects', 'default', 'Institutes', instName, 'State')
      mkdirSync(dir, { recursive: true })
      const p = join(dir, instName + '.v5state.json')
      writeFileSync(p, JSON.stringify({ v: cur.v, institutes: { ['default::' + instName]: inst } }, null, 2))
      return { dir, path: p, instName }
    }
    const adopt = async (instName) => {
      // `configure` 在 run 进行中会拒（`running && !autoDone`）⇒ **必须先 stop**；随后切所会走
      // **收养既有研究所**的路径（`instituteAt` 读盘）⇒ **真的从磁盘加载这份旧文件** ✓。
      await callTool('vibe_v5_stop', {}, ROOT)
      const cfg = await callTool('vibe_v5_configure', { project: 'default', institute: instName }, ROOT)
      if (cfg && cfg.ok !== false) await callTool('vibe_v5_start', {}, ROOT)
      const st = await callTool('vibe_v5_status', {})
      return { cfg, st }
    }
    if (name === 's14-legacy-state') {
      // 旧文件 ⇒ **收养即加载**（可读）＋**可续跑**（可在该所开会并写入台账 ⇒ 白名单在旧状态上照常工作）。
      const lg = mkLegacy('legacy')
      const { cfg, st } = await adopt(lg.instName)
      assert(cfg && cfg.ok !== false && st && String(st.institute) === lg.instName && (st.members || []).length > 0,
        'S14：**旧文件被成功收养/加载**（got ' + JSON.stringify({ cfg: cfg && cfg.ok, institute: st && st.institute, members: st && (st.members || []).length }).slice(0, 240) + '）')
      assert(Number(st.resolutions && st.resolutions.count) === 0,
        'S14：旧文件**无 `resolutions`** ⇒ 读端缺省为 0（got ' + JSON.stringify(st.resolutions).slice(0, 160) + '）')
      const mt = await callTool('vibe_v5_meeting', { agenda: 'S14 旧状态续跑', kind: 'solve-vote' }, ROOT)
      assert(mt && mt.ok === true, 'S14：旧状态下**可开正式会议**（可续跑；got ' + JSON.stringify(mt).slice(0, 200) + '）')
      const rec = await callTool('vibe_v5_result_record', { text: 'S14 旧状态下的决议', kind: 'resolution' }, ROOT)
      assert(rec && rec.ok === true && String(rec.resolution && rec.resolution.id) === 'res-1',
        'S14：旧状态 + 白名单 ⇒ **写台账可用**（got ' + JSON.stringify(rec).slice(0, 220) + '）')
      const sec = await callTool('vibe_v5_secretary', { who: 'r-1' }, ROOT)
      assert(sec && sec.ok === true && String(sec.secretary && sec.secretary.who) === 'r-1',
        'S14：旧状态 + 白名单 ⇒ **记录人可指定**（got ' + JSON.stringify(sec).slice(0, 200) + '）')
      const st2 = await callTool('vibe_v5_status', {})
      assert(Number(st2.resolutions && st2.resolutions.count) === 1 && String(st2.meeting && st2.meeting.secretary) === 'r-1',
        'S14：新写的台账**可见**（got ' + JSON.stringify({ res: st2.resolutions && st2.resolutions.count, sec: st2.meeting && st2.meeting.secretary }).slice(0, 200) + '）')
      // **落盘可见**：台账必须真的进 `EV.institute` fold（白名单）⇒ 读**文件**确认（内存可见 ≠ 已持久化）。
      const lgState = JSON.parse(readFileSync(join(WS, 'VibeMath', 'Projects', 'default', 'Institutes', lg.instName, 'State', lg.instName + '.v5state.json'), 'utf8'))
      const lgInst = lgState.institutes['default::' + lg.instName] || {}
      assert(Array.isArray(lgInst.secretaries) && lgInst.secretaries.length === 1
        && Array.isArray(lgInst.resolutions) && lgInst.resolutions.length === 1,
        'S14：记录人台账**落盘可见**（fold 白名单生效；got ' + JSON.stringify({ secretaries: (lgInst.secretaries || []).length, resolutions: (lgInst.resolutions || []).length }).slice(0, 200) + '）')
    } else if (name === 's14-read-only-load') {
      // **读旧不迁移**：收养后**不补键**；且**只读操作零副作用**（字节不变）。
      const lg = mkLegacy('legacy2')
      const { cfg } = await adopt(lg.instName)
      assert(cfg && cfg.ok !== false, 'S14：旧文件已被收养（前置；got ' + JSON.stringify(cfg).slice(0, 180) + '）')
      const bytesAfterAdopt = readFileSync(lg.path, 'utf8')
      const parsedAfter = JSON.parse(bytesAfterAdopt)
      const instAfter = parsedAfter.institutes['default::' + lg.instName] || {}
      assert(S14_KEYS.length > 0 && S14_KEYS.every((k) => instAfter[k] === undefined),
        'S14：**不补键、不迁移**（文件里仍无 S4–S13 的新键；got ' + JSON.stringify(Object.keys(instAfter).filter((k) => S14_KEYS.indexOf(k) !== -1)) + '）')
      await callTool('vibe_v5_status', {})
      await callTool('vibe_v5_report', {})
      await callTool('vibe_v5_resolutions', {})
      assert(readFileSync(lg.path, 'utf8') === bytesAfterAdopt,
        'S14：**只读操作零副作用**（字节未被改写；got len=' + readFileSync(lg.path, 'utf8').length + ' vs ' + bytesAfterAdopt.length + '）')
    } else if (name === 's14-legacy-defaults') {
      // **缺键取缺省且可观察**（**用全新研究所**：它天然没有那七个键 ⇒ 等价于"旧形状"）：
      // `resolutions:[]` ⇒ 检索 0 ＋ `res:` 悬空拒；`secretaries:[]` ⇒ 纪要**明写"无成员责任人"**；
      // `grants:[]` ⇒ **权限回落默认表**（所办/院士照常可授；**负向**由 S6 的门守着）。
      const list = await callTool('vibe_v5_resolutions', {})
      assert(list && list.ok === true && Number(list.count) === 0,
        'S14：`resolutions` 缺省＝空台账（got ' + JSON.stringify(list).slice(0, 180) + '）')
      const q = await callTool('vibe_v5_say', { text: 'S14 无决议时引决议', quote_ref: 'res:latest' }, childAgent(childOf('r-1')))
      assert(q && q.ok === false && /悬空引用/.test(String(q.message)),
        'S14：无决议（缺省空台账）下 `res:latest` ⇒ **悬空拒**（缺省不是崩；got ' + JSON.stringify(q).slice(0, 220) + '）')
      const mt = await callTool('vibe_v5_meeting', { agenda: 'S14 缺省可见', kind: 'sync' }, ROOT)
      assert(mt && mt.ok === true, 'S14：简流程会议已开（前置；got ' + JSON.stringify(mt).slice(0, 160) + '）')
      const mtId = String((await callTool('vibe_v5_status', {})).meeting.id)
      const grantOk = await callTool('vibe_v5_grant', { to: 'r-2', command: 'assign', grant_scope: 'meeting', why: 'S14 缺省探测' }, childAgent(childOf('acad')))
      assert(grantOk && grantOk.ok === true,
        'S14：`grants` 缺省 ⇒ **默认表仍允许院士授权**（got ' + JSON.stringify(grantOk).slice(0, 220) + '）')
      await waitMeetingClosed()
      const mtFile = join(instDir, 'Shared', 'Meetings', mtId + '.md')
      const mtText = existsSync(mtFile) ? readFileSync(mtFile, 'utf8') : ''
      assert(mtText.indexOf('未指定：由框架自动落盘，无成员责任人') !== -1,
        'S14：`secretaries` 缺省 ⇒ 纪要**明写"无成员责任人"**（got len=' + mtText.length + '）')
    } else if (name === 's14-load-failure-refuses-commit') {
      // **加载失败 ⇒ 拒绝提交**（版本不匹配）＋ `status` 可见 ＋ **真实文件绝不被空状态覆盖**。
      const lg = mkLegacy('broken')
      const brokenPayload = JSON.stringify({ v: 'v0-ancient', institutes: { 'default::broken': JSON.parse(JSON.stringify(cur.institutes['default::institute'])) } }, null, 2)
      writeFileSync(lg.path, brokenPayload)
      await callTool('vibe_v5_stop', {}, ROOT)
      const cfg = await callTool('vibe_v5_configure', { project: 'default', institute: 'broken' }, ROOT)
      assert(cfg && cfg.ok === false && /V5_STATE_NOT_LOADED|refusing to overwrite|version mismatch/.test(JSON.stringify(cfg)),
        'S14：**加载失败 ⇒ 拒绝提交**（`V5_STATE_NOT_LOADED`；got ' + JSON.stringify(cfg).slice(0, 260) + '）')
      assert(readFileSync(lg.path, 'utf8') === brokenPayload,
        'S14：**真实文件未被覆盖**（字节不变；got len=' + readFileSync(lg.path, 'utf8').length + '）')
      const st = await callTool('vibe_v5_status', {})
      assert(!!st && !!st.institute, 'S14：加载失败后 `status` **仍可用且可见**（got ' + JSON.stringify({ institute: st && st.institute }).slice(0, 160) + '）')
    } else if (name === 's14-idempotent-reload') {
      // **重复加载同一旧文件 ⇒ 结果一致**（幂等；不补键）。
      const lg = mkLegacy('legacy4')
      const a = await adopt(lg.instName)
      assert(a.cfg && a.cfg.ok !== false && String(a.st.institute) === lg.instName, 'S14：首次收养成功（前置）')
      await callTool('vibe_v5_configure', { project: 'default', institute: 'institute' }, ROOT)
      const b = await adopt(lg.instName)
      assert(b.cfg && b.cfg.ok !== false && String(b.st.institute) === lg.instName
        && String(a.st.institute) === lg.instName
        && Number(a.st.resolutions && a.st.resolutions.count) === Number(b.st.resolutions && b.st.resolutions.count)
        && (b.st.members || []).length >= 5,
        'S14：**重复加载结果一致**（幂等：同一所＋同一台账计数；got ' + JSON.stringify([a.st.institute, b.st.institute, Number(a.st.resolutions && a.st.resolutions.count), Number(b.st.resolutions && b.st.resolutions.count)]).slice(0, 200) + '）')
      const finalBytes = readFileSync(lg.path, 'utf8')
      const finalInst = (JSON.parse(finalBytes).institutes['default::' + lg.instName]) || {}
      assert(S14_KEYS.length > 0 && S14_KEYS.every((k) => finalInst[k] === undefined),
        'S14：重复加载**不补键**（仍无 S4–S13 新键；got ' + JSON.stringify(Object.keys(finalInst).filter((k) => S14_KEYS.indexOf(k) !== -1)) + '）')
    } else if (name === 's14-meeting-resume') {
      // 旧会议**可续跑**，既有纪要**只追加不重写**（旧正文保留）。
      const lg = mkLegacy('legacy5')
      const mtDir = join(WS, 'VibeMath', 'Projects', 'default', 'Institutes', lg.instName, 'Shared', 'Meetings')
      mkdirSync(mtDir, { recursive: true })
      const oldMinutes = '# 会议纪要｜mt-old｜legacy5\n\n## 发言区\n- 旧正文必须保留\n'
      writeFileSync(join(mtDir, 'mt-old.md'), oldMinutes)
      const { cfg } = await adopt(lg.instName)
      assert(cfg && cfg.ok !== false, 'S14：旧文件已被收养（前置；got ' + JSON.stringify(cfg).slice(0, 180) + '）')
      const mt = await callTool('vibe_v5_meeting', { agenda: 'S14 旧纪要续跑', kind: 'sync' }, ROOT)
      assert(mt && mt.ok === true, 'S14：旧状态下**可开新会议**（可续跑；got ' + JSON.stringify(mt).slice(0, 200) + '）')
      const after = readFileSync(join(mtDir, 'mt-old.md'), 'utf8')
      assert(after === oldMinutes && after.indexOf('旧正文必须保留') !== -1,
        'S14：既有纪要**未被改写**（只追加；got len=' + after.length + '）')
    } else {
      assert(false, 'V5_SCENARIO 未知（s14）：' + name)
    }
  } else if (name.startsWith('s15-')) {
    // S15（K4/GAPS 11–12）：**上次纪要确认** ＋ **行动项跟踪**（含 G3 待接手／逾期可见）。
    // 助手：先跑完一场会议（作为"上次纪要"），再开新会议做确认/检查（**自愈前置、顺序无关**）。
    const prevMeeting = async (agenda) => {
      const mt = await callTool('vibe_v5_meeting', { agenda, kind: 'sync' }, ROOT)
      assert(mt && mt.ok === true, 'S15：前一场会议已开（前置；got ' + JSON.stringify(mt).slice(0, 160) + '）')
      const id = String((await callTool('vibe_v5_status', {})).meeting.id)
      await waitMeetingClosed()
      return id
    }
    if (name === 's15-confirm-minutes') {
      const prevId = await prevMeeting('S15 上次纪要（第一场）')
      const mt = await callTool('vibe_v5_meeting', { agenda: 'S15 确认上次纪要（第二场）', kind: 'sync' }, ROOT)
      assert(mt && mt.ok === true, 'S15：本场会议已开（前置）')
      const conf = await callTool('vibe_v5_minutes', { op: 'confirm' }, childAgent(childOf('acad')))
      assert(conf && conf.ok === true && String(conf.confirmation && conf.confirmation.of) === prevId,
        'S15/K4：确认缺省＝**最近一场已收束会议**且回执写明是哪一份（got ' + JSON.stringify(conf).slice(0, 240) + '）')
      const sv = await callTool('vibe_v5_status', {})
      assert(sv.meeting && sv.meeting.minutes_confirmation && sv.meeting.minutes_confirmation.confirmed === true
        && String(sv.meeting.minutes_confirmation.of) === prevId,
        'S15：只读面 `status.meeting.minutes_confirmation` 可见（got ' + String(JSON.stringify(sv.meeting && sv.meeting.minutes_confirmation) || null).slice(0, 220) + '）')
      const st = readV5State()
      const led = (st && st.institutes['default::institute'].minutesConfirmations) || []
      assert(led.length === 1 && String(led[0].of) === prevId && Number(led[0].at) > 0,
        'S15：确认**入档**（append-only 台账一条；got ' + JSON.stringify(led).slice(0, 220) + '）')
    } else if (name === 's15-fact-only') {
      const prevId = await prevMeeting('S15 上次纪要（事实更正）')
      const prevFile = join(instDir, 'Shared', 'Meetings', prevId + '.md')
      const before = existsSync(prevFile) ? readFileSync(prevFile, 'utf8') : ''
      assert(before.length > 0, 'S15：旧纪要文件存在（前置；got len=' + before.length + '）')
      const vBefore = JSON.stringify(((readV5State() || {}).institutes['default::institute'] || {}).verdicts || {})
      const rBefore = (((readV5State() || {}).institutes['default::institute'] || {}).resolutions || []).length
      const mt = await callTool('vibe_v5_meeting', { agenda: 'S15 本场（事实更正）', kind: 'sync' }, ROOT)
      assert(mt && mt.ok === true, 'S15：本场会议已开（前置）')
      const curId = String((await callTool('vibe_v5_status', {})).meeting.id)
      const conf = await callTool('vibe_v5_minutes', { op: 'confirm', of: prevId, fact_fix: '把出席人数 3 改为 4（事实）' }, childAgent(childOf('acad')))
      assert(conf && conf.ok === true && String(conf.confirmation.factFix).indexOf('出席人数') !== -1,
        'S15/K4：**事实更正**已受理（got ' + JSON.stringify(conf).slice(0, 240) + '）')
      const after = existsSync(prevFile) ? readFileSync(prevFile, 'utf8') : ''
      assert(after === before, 'S15/K4：**旧纪要一字未改**（只追加；got len=' + after.length + ' vs ' + before.length + '）')
      const vAfter = JSON.stringify(((readV5State() || {}).institutes['default::institute'] || {}).verdicts || {})
      const rAfter = (((readV5State() || {}).institutes['default::institute'] || {}).resolutions || []).length
      assert(vAfter === vBefore && rAfter === rBefore,
        'S15/K4：确认**不写判据/决议**（`verdicts`＋`solve`＋`resolutions` 均不变 ⇒ 只改事实、不改结论；got verdicts ' + vAfter.length + ' vs ' + vBefore.length + '｜resolutions ' + rAfter + ' vs ' + rBefore + '）')
      await waitMeetingClosed()
      const curFile = join(instDir, 'Shared', 'Meetings', curId + '.md')
      const curText = existsSync(curFile) ? readFileSync(curFile, 'utf8') : ''
      assert(curText.indexOf('## 上次纪要确认') !== -1 && curText.indexOf('出席人数') !== -1,
        'S15/K4：事实更正**追加到当次会议纪要的独立小节**（got len=' + curText.length + '）')
    } else if (name === 's15-action-from-resolution') {
      const mt = await callTool('vibe_v5_meeting', { agenda: 'S15 行动项（源自决议）', kind: 'solve-vote' }, ROOT)
      assert(mt && mt.ok === true, 'S15：正式会议已开（前置）')
      const curId = String((await callTool('vibe_v5_status', {})).meeting.id)
      const rec = await callTool('vibe_v5_result_record', { text: 'S15 决议：派发行动项', kind: 'resolution', actions: [{ who: 'r-1', due_in: 'next-meeting' }] }, childAgent(childOf('acad')))
      assert(rec && rec.ok === true, 'S15：决议已落库（前置；got ' + JSON.stringify(rec).slice(0, 200) + '）')
      const asg = await callTool('vibe_v5_assign', { to: 'r-1', why: 'S15 决议行动项', acceptance: '下次会议前完成', origin: 'meeting:' + curId, due_in: 'next-meeting' }, ROOT)
      assert(asg && asg.ok === true && asg.task && String(asg.task.origin) === 'meeting:' + curId,
        'S15/K4：行动项**显式**转任务板（`origin:meeting:<mt>`；got ' + JSON.stringify(asg).slice(0, 240) + '）')
      const list = await callTool('vibe_v5_task_list', {}, ROOT)
      const items = ((list && list.tasks) || []).filter((t) => String(t.origin || '') === 'meeting:' + curId)
      assert(items.length === 1 && String(items[0].due_in) === 'next-meeting' && !!items[0].id,
        'S15/K4：任务带**稳定标识**＋相对期限（got ' + JSON.stringify(items).slice(0, 240) + '）')
      const sv = await callTool('vibe_v5_status', {})
      assert(Number(sv.meeting.action_items.open) >= 1,
        'S15：只读面 `status.meeting.action_items.open` 可见（got ' + JSON.stringify(sv.meeting.action_items).slice(0, 200) + '）')
    } else if (name === 's15-handover-visible') {
      const asg = await callTool('vibe_v5_assign', { to: 'r-1', why: 'S15 逾期探测', acceptance: '下次会议前完成', origin: 'meeting:mt-seed', due_in: 'next-meeting' }, ROOT)
      assert(asg && asg.ok === true, 'S15：行动项已建（前置；got ' + JSON.stringify(asg).slice(0, 200) + '）')
      const mt = await callTool('vibe_v5_meeting', { agenda: 'S15 待接手/逾期', kind: 'sync' }, ROOT)
      assert(mt && mt.ok === true, 'S15：本次会议已开（前置）')
      const sv1 = await callTool('vibe_v5_status', {})
      assert(Number(sv1.meeting.action_items.overdue) >= 1,
        'S15/K4/G3：**逾期＝未决项且可见**（上次派发、本次会议仍未完成；got ' + String(JSON.stringify(sv1.meeting && sv1.meeting.action_items) || null).slice(0, 200) + '）')
      const list = await callTool('vibe_v5_task_list', {}, ROOT)
      const t = (((list && list.tasks) || []).filter((x) => String(x.origin) === 'meeting:mt-seed'))[0]
      assert(!!t, 'S15：找到该行动项（前置）')
      const ho = await callTool('vibe_v5_task_update', { task_id: String(t.id), expected_revision: Number(t.revision), action: 'handover' }, ROOT)
      assert(ho && ho.ok === true && String(ho.task.state) === 'handover' && String(ho.task.status) !== 'completed',
        'S15/K4/G3：**待接手**（`state:handover`；**不自动关闭**；got ' + JSON.stringify(ho).slice(0, 240) + '）')
      const sv2 = await callTool('vibe_v5_status', {})
      assert(Number(sv2.meeting.action_items.handover) >= 1,
        'S15：只读面 `action_items.handover` 可见（got ' + JSON.stringify(sv2.meeting.action_items).slice(0, 200) + '）')
      const rep = await callTool('vibe_v5_report', {})
      assert(/待接手|逾期/.test(JSON.stringify(rep)),
        'S15/K4：`report()` 里**待接手/逾期可见**（got ' + JSON.stringify(rep).slice(0, 200) + '）')
    } else if (name === 's15-zones-preserved') {
      const mt = await callTool('vibe_v5_meeting', { agenda: 'S15 两区与锚不被确认破坏', kind: 'sync' }, ROOT)
      assert(mt && mt.ok === true, 'S15：会议已开（前置）')
      const curId = String((await callTool('vibe_v5_status', {})).meeting.id)
      const spoke = await replyMeeting('r-1', { input: 'S15 会议发言（锚的前置）' })
      assert(spoke, 'S15：r-1 已交付会议发言（前置）')
      await settleAll()
      const conf = await callTool('vibe_v5_minutes', { op: 'confirm', fact_fix: '补一条事实（不得破坏两区/锚）' }, childAgent(childOf('acad')))
      assert(conf && conf.ok === true, 'S15：确认已受理（前置；got ' + JSON.stringify(conf).slice(0, 200) + '）')
      const q = await callTool('vibe_v5_say', { text: 'S15 确认后引会议内锚', quote_ref: 'mt-' + curId + '#speech-r-1-1' }, childAgent(childOf('r-3')))
      assert(q && q.ok === true && q.quote && q.quote.domain === 'meeting',
        'S15×S10：**确认后会议内锚仍可解析**（got ' + JSON.stringify(q).slice(0, 240) + '）')
      await waitMeetingClosed()
      const curFile = join(instDir, 'Shared', 'Meetings', curId + '.md')
      const t = existsSync(curFile) ? readFileSync(curFile, 'utf8') : ''
      assert(t.indexOf('## 发言区') !== -1 && t.indexOf('## 投票区') !== -1 && t.indexOf('### r-1') !== -1 && t.indexOf('## 上次纪要确认') !== -1,
        'S15×S8：**两区与逐人小节仍在**且确认为独立小节（got len=' + t.length + '）')
    } else if (name === 's15-idempotent') {
      const prevId = await prevMeeting('S15 幂等（前一场）')
      const mt = await callTool('vibe_v5_meeting', { agenda: 'S15 幂等（本场）', kind: 'sync' }, ROOT)
      assert(mt && mt.ok === true, 'S15：本场会议已开（前置）')
      const c1 = await callTool('vibe_v5_minutes', { op: 'confirm', of: prevId, fact_fix: 'S15 同值事实更正' }, childAgent(childOf('acad')))
      const c2 = await callTool('vibe_v5_minutes', { op: 'confirm', of: prevId, fact_fix: 'S15 同值事实更正' }, childAgent(childOf('acad')))
      assert(c1 && c1.ok === true && c2 && c2.ok === true && c2.deduped === true,
        'S15/K4：**同值确认幂等**（`deduped`；got ' + JSON.stringify(c2).slice(0, 220) + '）')
      const a1 = await callTool('vibe_v5_assign', { to: 'r-1', why: 'S15 幂等行动项', acceptance: '完成', subject: 'S15 同值行动项', origin: 'meeting:' + prevId, due_in: 'next-meeting' }, ROOT)
      const a2 = await callTool('vibe_v5_assign', { to: 'r-1', why: 'S15 幂等行动项', acceptance: '完成', subject: 'S15 同值行动项', origin: 'meeting:' + prevId, due_in: 'next-meeting' }, ROOT)
      assert(a1 && a1.ok === true && a2 && a2.ok === true,
        'S15：两次同值派发都被接受（前置；a1=' + JSON.stringify(a1 && a1.ok) + ' a2=' + JSON.stringify(a2).slice(0, 220) + '）')
      const list = await callTool('vibe_v5_task_list', {}, ROOT)
      const items = ((list && list.tasks) || []).filter((x) => String(x.origin || '') === 'meeting:' + prevId && String(x.subject) === 'S15 同值行动项')
      assert(items.length === 1,
        'S15/K4：**同一条行动项不重复建**（同 origin＋同 subject ⇒ 复用；got ' + JSON.stringify(items).slice(0, 220) + '）')
    } else {
      assert(false, 'V5_SCENARIO 未知（s15）：' + name)
    }
  } else if (name.startsWith('s16-')) {
    // S16（G3/D-10）：**开场程序性事项＝未完成行动项具名点名**，**排在"上次纪要确认"（第一项实质议程）之前**；
    // **只提示、不驱动**；**空列表不点空名**。
    if (name === 's16-rollcall-named') {
      const a1 = await callTool('vibe_v5_assign', { to: 'r-1', why: 'S16 点名前置', acceptance: '完成', subject: 'S16 点名项一', origin: 'meeting:mt-seed', due_in: 'next-meeting' }, ROOT)
      assert(a1 && a1.ok === true, 'S16：行动项一已建（前置；got ' + JSON.stringify(a1).slice(0, 200) + '）')
      const a2 = await callTool('vibe_v5_assign', { to: 'r-1', why: 'S16 点名前置二', acceptance: '完成', subject: 'S16 点名项二', origin: 'meeting:mt-seed', due_in: 'next-meeting' }, ROOT)
      const list0 = await callTool('vibe_v5_task_list', {}, ROOT)
      const t2 = (((list0 && list0.tasks) || []).filter((x) => String(x.subject) === 'S16 点名项二'))[0]
      assert(a2 && a2.ok === true && !!t2, 'S16：行动项二已建（前置）')
      const ho = await callTool('vibe_v5_task_update', { task_id: String(t2.id), expected_revision: Number(t2.revision), action: 'handover' }, ROOT)
      assert(ho && ho.ok === true && String(ho.task.state) === 'handover', 'S16：行动项二已置**待接手**（前置；got ' + JSON.stringify(ho).slice(0, 200) + '）')
      const prev = await callTool('vibe_v5_meeting', { agenda: 'S16 前一场（上次纪要）', kind: 'sync' }, ROOT)
      assert(prev && prev.ok === true, 'S16：前一场会议已开（前置）')
      const prevOpen = await callTool('vibe_v5_status', {})
      assert(!!(prevOpen.meeting && prevOpen.meeting.id),
        'S16/G3：点名**只提示、不驱动**（开场后会议仍在进行中；got ' + String(JSON.stringify(prevOpen.meeting && prevOpen.meeting.id) || null).slice(0, 160) + '）')
      await waitMeetingClosed()
      const mt = await callTool('vibe_v5_meeting', { agenda: 'S16 本场（开场点名）', kind: 'sync' }, ROOT)
      assert(mt && mt.ok === true, 'S16：本次会议已开（前置）')
      const mtId = String((await callTool('vibe_v5_status', {})).meeting.id)
      const chat = String(chatTextR10() || '')
      const line = (chat.split('\n').filter((x) => x.indexOf('程序性点名') !== -1)[0]) || ''
      assert(line.indexOf('待接手') !== -1 && line.indexOf('逾期') !== -1 && /t-\d+/.test(line),
        'S16/G3：开场**具名点名**（`t-N` ＋ 「待接手」＋ **逾期**标记；got ' + String(line || null).slice(0, 260) + '）')
      const iRoll = line.indexOf('程序性点名')
      const iMin = line.indexOf('上次纪要')
      assert(iRoll >= 0 && iMin > iRoll,
        'S16/G3：**顺序＝先程序性点名 ⇒ 再上次纪要**（第一项实质议程；got 点名@' + iRoll + ' 纪要@' + iMin + '）')
      const still = await callTool('vibe_v5_status', {})
      assert(String(still.meeting && still.meeting.id) === mtId,
        'S16/G3：点名**只提示、不驱动**（会议仍在进行中；got ' + String(JSON.stringify(still.meeting && still.meeting.id) || null).slice(0, 160) + '）')
    } else if (name === 's16-empty-no-rollcall') {
      const mt = await callTool('vibe_v5_meeting', { agenda: 'S16 空列表（不点空名）', kind: 'sync' }, ROOT)
      assert(mt && mt.ok === true, 'S16：会议已开（前置）')
      const chat = String(chatTextR10() || '')
      assert(chat.indexOf('未完成行动项') === -1 && chat.indexOf('程序性点名：') === -1,
        'S16/G3：**无行动项 ⇒ 不点空名**（群聊无点名条目；got ' + String(JSON.stringify(chat.slice(-200)) || null).slice(0, 200) + '）')
    } else {
      assert(false, 'V5_SCENARIO 未知（s16）：' + name)
    }
  } else if (name.startsWith('s17-')) {
    // S17（G3/D-10）：**`overview()` 的行动项节**（总览可见；与 `report()`／开场点名**同一口径**）。
    if (name === 's17-overview-actions') {
      // ① 空列表：**不输出空节**（**自愈前置：先测空态** ⇒ 顺序无关 ✓）
      const ov0 = await callTool('vibe_v5_overview', {}, ROOT)
      const t0 = typeof ov0 === 'string' ? ov0 : String((ov0 && ov0.overview) || '')
      assert(ov0 && ov0.ok === true && t0.length > 0 && t0.indexOf('## 行动项') === -1,
        'S17/G3：**无行动项 ⇒ 不输出空节**（got ' + String(JSON.stringify(t0.slice(-160)) || null).slice(0, 200) + '）')
      // ② 建两条**早于本次会议**的行动项（一条有 owner、一条转**待接手**）⇒ 本场会议即为**逾期**
      const a1 = await callTool('vibe_v5_assign', { to: 'r-1', why: 'S17 前置一', acceptance: '完成', subject: 'S17 行动项一', origin: 'meeting:mt-seed', due_in: 'next-meeting' }, ROOT)
      assert(a1 && a1.ok === true, 'S17：行动项一已建（前置；got ' + JSON.stringify(a1).slice(0, 200) + '）')
      const a2 = await callTool('vibe_v5_assign', { to: 'r-1', why: 'S17 前置二', acceptance: '完成', subject: 'S17 行动项二', origin: 'meeting:mt-seed', due_in: 'next-meeting' }, ROOT)
      const list0 = await callTool('vibe_v5_task_list', {}, ROOT)
      const t2 = (((list0 && list0.tasks) || []).filter((x) => String(x.subject) === 'S17 行动项二'))[0]
      assert(a2 && a2.ok === true && !!t2, 'S17：行动项二已建（前置）')
      const ho = await callTool('vibe_v5_task_update', { task_id: String(t2.id), expected_revision: Number(t2.revision), action: 'handover' }, ROOT)
      assert(ho && ho.ok === true && String(ho.task.state) === 'handover', 'S17：行动项二已置**待接手**（前置）')
      const mt = await callTool('vibe_v5_meeting', { agenda: 'S17 总览可见', kind: 'sync' }, ROOT)
      assert(mt && mt.ok === true, 'S17：会议已开（前置；逾期判定需要会议开场时刻）')
      // ③ 总览（academician/office 面）⇒ 必须有行动项节，且计数/具名/标记齐全
      const ov = await callTool('vibe_v5_overview', {}, ROOT)
      const txt = typeof ov === 'string' ? ov : String((ov && ov.overview) || '')
      assert(txt.indexOf('## 行动项（G3/D-10）') !== -1 && !/finalizeMeeting|收束/.test(txt.slice(0, 0)),
        'S17/G3：`overview()` 必含**行动项节**（got ' + String(JSON.stringify(txt.slice(txt.indexOf('## 任务板'), txt.indexOf('## 任务板') + 400)) || null).slice(0, 320) + '）')
      assert(/共 2 条｜未完成 2｜\*\*待接手\*\* 1｜\*\*逾期（未决项）\*\* 2/.test(txt),
        'S17/G3：节内含**总数/未完成/待接手/逾期（未决项）**（got ' + String(JSON.stringify((txt.match(/- 共 [^\n]*/) || [null])[0]) || null).slice(0, 200) + '）')
      const sec = txt.slice(txt.indexOf('## 行动项（G3/D-10）'))
      const lines = sec.split('\n').filter((x) => /^- t-\d+｜/.test(x))
      assert(lines.length === 2 && lines.some((x) => /owner=r-1｜\*\*逾期\*\*｜due_in=next-meeting/.test(x))
        && lines.some((x) => /owner=待接手｜\*\*待接手\*\*｜\*\*逾期\*\*/.test(x)),
        'S17/G3：**逐条具名**（`t-N` ＋ owner／「待接手」＋ **逾期**标记；got ' + String(JSON.stringify(lines) || null).slice(0, 300) + '）')
      assert(txt.indexOf('## 编制') !== -1 && txt.indexOf('## 任务板') !== -1,
        'S17：**既有节未被破坏**（编制／任务板仍在；got ' + String(JSON.stringify(txt.slice(0, 120)) || null).slice(0, 160) + '）')
    } else {
      assert(false, 'V5_SCENARIO 未知（s17）：' + name)
    }
  } else if (name.startsWith('s18-')) {
    // S18（#23/#38；K3/K5/D4）：**动议与附议**（附议≠表决；不产定论；不改阶段；无定时器）。
    const openFormal = async (agenda) => {
      const mt = await callTool('vibe_v5_meeting', { agenda, kind: 'solve-vote' }, ROOT)
      assert(mt && mt.ok === true, 'S18：正式会议已开（前置；got ' + JSON.stringify(mt).slice(0, 160) + '）')
    }
    if (name === 's18-motion-propose') {
      await openFormal('S18 提出动议')
      const p1 = await callTool('vibe_v5_motion', { kind: 'topic', text: 'S18 动议一：先讨论引理 A' }, childAgent(childOf('r-1')))
      assert(p1 && p1.ok === true && String(p1.motion && p1.motion.id) === 'm-1'
        && String(p1.motion.state) === 'proposed' && Number(p1.motion.needed) >= 1,
        'S18/#23：动议已提出（`m-N` ＋ `state=proposed` ＋ 门槛；got ' + String(JSON.stringify(p1) || null).slice(0, 240) + '）')
      const p2 = await callTool('vibe_v5_motion', { kind: 'topic', text: 'S18 动议一：先讨论引理 A' }, childAgent(childOf('r-1')))
      assert(p2 && p2.ok === true && p2.deduped === true,
        'S18/#23：**同值动议幂等**（`deduped`；got ' + String(JSON.stringify(p2) || null).slice(0, 200) + '）')
      const sv = await callTool('vibe_v5_status', {})
      assert(Number(sv.meeting && sv.meeting.motions && sv.meeting.motions.count) === 1,
        'S18：只读面 `status.meeting.motions.count` 可见且**未重复入账**（got ' + String(JSON.stringify(sv.meeting && sv.meeting.motions) || null).slice(0, 200) + '）')
      const bad = await callTool('vibe_v5_motion', { kind: 'topic', text: 'S18 非法时间键', due_at: 'x' }, childAgent(childOf('r-1')))
      assert(bad && bad.ok === false && /时间/.test(String(bad.message)),
        'S18：**用户时间键一律拒**（got ' + String(JSON.stringify(bad) || null).slice(0, 200) + '）')
    } else if (name === 's18-second-carries') {
      await openFormal('S18 附议成立')
      const p = await callTool('vibe_v5_motion', { kind: 'topic', text: 'S18 动议二：采纳引理 A' }, childAgent(childOf('r-1')))
      assert(p && p.ok === true, 'S18：动议已提出（前置）')
      const mid = String(p.motion.id)
      const s1 = await callTool('vibe_v5_second', { motion_id: mid }, childAgent(childOf('r-2')))
      assert(s1 && s1.ok === true && String(s1.motion.state) === 'carried' && Number(s1.motion.carriedAt) > 0,
        'S18/#38：**达门槛当刻 `carried`**（`carriedAt` 由框架写；got ' + String(JSON.stringify(s1) || null).slice(0, 240) + '）')
      const sv = await callTool('vibe_v5_status', {})
      assert(Number(sv.meeting.motions.carried) >= 1 && Number(sv.meeting.motions.pending) === 0,
        'S18：只读面 `motions.carried/pending` 一致（got ' + String(JSON.stringify(sv.meeting.motions) || null).slice(0, 200) + '）')
      const rep = await callTool('vibe_v5_report', {})
      assert(/动议：共/.test(JSON.stringify(rep)),
        'S18：`report()` 含**动议节**（got ' + String(JSON.stringify(rep) || null).slice(0, 200) + '）')
    } else if (name === 's18-self-second-refused') {
      await openFormal('S18 自附议被拒')
      const p = await callTool('vibe_v5_motion', { kind: 'procedural', text: 'S18 程序动议：延长讨论' }, childAgent(childOf('r-1')))
      assert(p && p.ok === true, 'S18：动议已提出（前置）')
      const s = await callTool('vibe_v5_second', { motion_id: String(p.motion.id) }, childAgent(childOf('r-1')))
      assert(s && s.ok === false && /不可附议自己的动议/.test(String(s.message)),
        'S18/#38：**不可附议自己的动议**（具名拒；got ' + String(JSON.stringify(s) || null).slice(0, 220) + '）')
    } else if (name === 's18-second-idempotent') {
      await openFormal('S18 附议幂等')
      const p = await callTool('vibe_v5_motion', { kind: 'topic', text: 'S18 动议三：记录待办' }, childAgent(childOf('r-1')))
      assert(p && p.ok === true, 'S18：动议已提出（前置）')
      const mid = String(p.motion.id)
      const s1 = await callTool('vibe_v5_second', { motion_id: mid }, childAgent(childOf('r-2')))
      assert(s1 && s1.ok === true, 'S18：第一次附议被接受（前置）')
      const s2 = await callTool('vibe_v5_second', { motion_id: mid }, childAgent(childOf('r-2')))
      assert(s2 && s2.ok === true && s2.deduped === true && (s2.motion.secondedBy || []).length === 1,
        'S18/#38：**重复附议幂等、**计数不增**（got ' + String(JSON.stringify(s2.motion && s2.motion.secondedBy) || null).slice(0, 200) + '）')
    } else if (name === 's18-withdraw') {
      await openFormal('S18 撤回')
      const p1 = await callTool('vibe_v5_motion', { kind: 'topic', text: 'S18 撤回项一（本人撤）' }, childAgent(childOf('r-2')))
      assert(p1 && p1.ok === true, 'S18：动议一已提出（前置）')
      const w1 = await callTool('vibe_v5_motion', { op: 'withdraw', motion_id: String(p1.motion.id), reason: 'S18 本人撤回' }, childAgent(childOf('r-2')))
      assert(w1 && w1.ok === true && String(w1.motion.state) === 'withdrawn' && String(w1.motion.withdrawnBy) === 'r-2',
        'S18/#23：**本人可撤回**（got ' + String(JSON.stringify(w1) || null).slice(0, 240) + '）')
      const w1b = await callTool('vibe_v5_motion', { op: 'withdraw', motion_id: String(p1.motion.id) }, childAgent(childOf('r-2')))
      assert(w1b && w1b.ok === true && w1b.deduped === true,
        'S18：**重复撤回幂等**（got ' + String(JSON.stringify(w1b) || null).slice(0, 200) + '）')
      const p2 = await callTool('vibe_v5_motion', { kind: 'procedural', text: 'S18 撤回项二（所办撤）' }, childAgent(childOf('r-3')))
      assert(p2 && p2.ok === true, 'S18：动议二已提出（前置）')
      const w2 = await callTool('vibe_v5_motion', { op: 'withdraw', motion_id: String(p2.motion.id), reason: 'S18 所办撤回' }, ROOT)
      assert(w2 && w2.ok === true && String(w2.motion.state) === 'withdrawn',
        'S18/#23：**院士/所办可撤回**（got ' + String(JSON.stringify(w2) || null).slice(0, 220) + '）')
      const p3 = await callTool('vibe_v5_motion', { kind: 'topic', text: 'S18 撤回项三（已成立不可撤）' }, childAgent(childOf('r-1')))
      const s3 = await callTool('vibe_v5_second', { motion_id: String(p3.motion.id) }, childAgent(childOf('r-2')))
      assert(s3 && s3.ok === true && String(s3.motion.state) === 'carried', 'S18：动议三已成立（前置）')
      const w3 = await callTool('vibe_v5_motion', { op: 'withdraw', motion_id: String(p3.motion.id) }, childAgent(childOf('r-1')))
      assert(w3 && w3.ok === false && /不可撤回/.test(String(w3.message)),
        'S18/#23：**已成立（carried）不可撤回**（单向状态机；got ' + String(JSON.stringify(w3) || null).slice(0, 220) + '）')
    } else if (name === 's18-boundaries') {
      await openFormal('S18 边界：动议 vs 异议/复议/决议/表决')
      const vBefore = JSON.stringify(((readV5State() || {}).institutes['default::institute'] || {}).verdicts || {})
      const rBefore = (((readV5State() || {}).institutes['default::institute'] || {}).resolutions || []).length
      // ① **动议 ≠ 程序异议（#46）**：异议与动议可**并存**（异议不需附议、不进入表决）
      const obj = await callTool('vibe_v5_procedural_objection', { why: 'S18 边界：程序异议仍走 #46' }, childAgent(childOf('r-3')))
      assert(obj && obj.ok === true, 'S18/#46：程序异议仍独立可用（got ' + String(JSON.stringify(obj) || null).slice(0, 200) + '）')
      const mo = await callTool('vibe_v5_motion', { kind: 'procedural', text: 'S18 边界：程序动议与异议并存' }, childAgent(childOf('r-3')))
      assert(mo && mo.ok === true, 'S18/#46：**动议与异议并存**（got ' + String(JSON.stringify(mo) || null).slice(0, 200) + '）')
      // ② **动议 ≠ 复议（#52）**：复议面向"已收束结论"⇒ 无对象时具名拒；动议照常可提
      const rec = await callTool('vibe_v5_reconsider', {}, childAgent(childOf('r-1')))
      assert(rec && rec.ok === false, 'S18/#52：复议**不是**动议（无收束结论 ⇒ 拒；got ' + String(JSON.stringify(rec) || null).slice(0, 200) + '）')
      // ③ **`resolution` 动议不直写 `resolutions`**（唯一入口 #55）
      const res = await callTool('vibe_v5_motion', { kind: 'resolution', text: 'S18 边界：决议草案（不得直写）' }, childAgent(childOf('r-1')))
      assert(res && res.ok === true, 'S18/#23：正式会议内 `resolution` 草案可提（got ' + String(JSON.stringify(res) || null).slice(0, 200) + '）')
      const rAfter = (((readV5State() || {}).institutes['default::institute'] || {}).resolutions || []).length
      const vAfter = JSON.stringify(((readV5State() || {}).institutes['default::institute'] || {}).verdicts || {})
      assert(rAfter === rBefore && vAfter === vBefore,
        'S18/#23：动议**不产定论**（`resolutions`／`verdicts` 均不变 ⇒ 决议唯一入口仍是 #55；got resolutions ' + rAfter + ' vs ' + rBefore + '）')
      // ④ **不碰 ballots/voters()/cast**：表决面未被开启
      const sv = await callTool('vibe_v5_status', {})
      assert(!(sv.poll && sv.poll.open),
        'S18：动议**不写票**（表决面未被开启；got ' + String(JSON.stringify(sv.poll) || null).slice(0, 200) + '）')
      await waitMeetingClosed()
      // ⑤ **简流程会期内 `resolution` ⇒ 复用 S12 唯一判定点**
      const light = await callTool('vibe_v5_meeting', { agenda: 'S18 简流程（resolution 应拒）', kind: 'sync' }, ROOT)
      assert(light && light.ok === true, 'S18：简流程会议已开（前置）')
      const lt = await callTool('vibe_v5_motion', { kind: 'resolution', text: 'S18 边界：简流程不得落决议' }, childAgent(childOf('r-1')))
      assert(lt && lt.ok === false && /决议/.test(String(lt.message)),
        'S18×S12：**简流程会期内 `resolution` 被拒**（唯一判定点；got ' + String(JSON.stringify(lt) || null).slice(0, 220) + '）')
    } else {
      assert(false, 'V5_SCENARIO 未知（s18）：' + name)
    }
  } else if (name.startsWith('s19-')) {
    // S19（`D-10` 待办 ②）：**附议门槛可设**（`motionSecondsRequired`，≥1 整数，默认 1）—— 覆盖 S18 不可达的
    // "同人在仍 `proposed` 时重复附议"分支；**场景结束复位门槛**（顺序无关 ✓）。
    if (name === 's19-threshold-settable') {
      const set2 = await callTool('vibe_v5_set', { motionSecondsRequired: 2 }, ROOT)
      assert(set2 && set2.ok === true, 'S19：门槛设 2 成功（前置；got ' + String(JSON.stringify(set2) || null).slice(0, 200) + '）')
      const mt = await callTool('vibe_v5_meeting', { agenda: 'S19 门槛=2', kind: 'solve-vote' }, ROOT)
      assert(mt && mt.ok === true, 'S19：正式会议已开（前置）')
      const p = await callTool('vibe_v5_motion', { kind: 'topic', text: 'S19 门槛 2 的动议' }, childAgent(childOf('r-1')))
      assert(p && p.ok === true && Number(p.motion && p.motion.needed) === 2,
        'S19：动议门槛**读作 2**（单一读取口径；got ' + String(JSON.stringify(p && p.motion && p.motion.needed) || null) + '）')
      const s1 = await callTool('vibe_v5_second', { motion_id: String(p.motion.id) }, childAgent(childOf('r-2')))
      assert(s1 && s1.ok === true && String(s1.motion.state) === 'proposed' && (s1.motion.secondedBy || []).length === 1,
        'S19：**第一次附议后仍 `proposed`**（未达门槛 2；got ' + String(JSON.stringify(s1 && s1.motion && s1.motion.state) || null) + '）')
      const s2 = await callTool('vibe_v5_second', { motion_id: String(p.motion.id) }, childAgent(childOf('r-2')))
      assert(s2 && s2.ok === true && s2.deduped === true && (s2.motion.secondedBy || []).length === 1,
        'S19/#38：**同人重复附议 ⇒ `deduped` 且计数不增**（S18 不可达分支现已可达；got ' + String(JSON.stringify(s2 && s2.motion && s2.motion.secondedBy) || null).slice(0, 200) + '）')
      const s3 = await callTool('vibe_v5_second', { motion_id: String(p.motion.id) }, childAgent(childOf('r-3')))
      assert(s3 && s3.ok === true && String(s3.motion.state) === 'carried',
        'S19：第二人附议达门槛 ⇒ **`carried`**（门槛语义闭环；got ' + String(JSON.stringify(s3 && s3.motion && s3.motion.state) || null) + '）')
      const sv = await callTool('vibe_v5_status', {})
      assert(Number(sv.meeting && sv.meeting.motions && sv.meeting.motions.needed) === 2,
        'S19：只读面 `motions.needed` 反映**可设门槛**（got ' + String(JSON.stringify(sv.meeting && sv.meeting.motions) || null).slice(0, 200) + '）')
      const back = await callTool('vibe_v5_set', { motionSecondsRequired: 1 }, ROOT)
      assert(back && back.ok === true, 'S19：**复位门槛=1**（顺序无关；got ' + String(JSON.stringify(back) || null).slice(0, 140) + '）')
    } else if (name === 's19-threshold-invalid') {
      const base = await callTool('vibe_v5_set', { motionSecondsRequired: 3 }, ROOT)
      assert(base && base.ok === true, 'S19：先把门槛设为 3（前置；got ' + String(JSON.stringify(base) || null).slice(0, 160) + '）')
      for (const bad of [0, -1, 1.5, 'abc']) {
        const r = await callTool('vibe_v5_set', { motionSecondsRequired: bad }, ROOT)
        assert(r && r.ok === false && String(r.code) === 'V5_INVALID_ARGUMENT',
          'S19：**非法门槛具名拒**（' + JSON.stringify(bad) + ' ⇒ V5_INVALID_ARGUMENT；got ' + String(JSON.stringify(r) || null).slice(0, 200) + '）')
      }
      const rb = await callTool('vibe_v5_set', { motionSecondsRequired: 3 }, ROOT)
      assert(rb && rb.ok === true && (!rb.adjusted || rb.adjusted.motionSecondsRequired === undefined),
        'S19：**拒后参数未被改坏**（再设同值 ⇒ 回执**无 adjusted**（值仍是 3）；got ' + String(JSON.stringify(rb && rb.adjusted) || null).slice(0, 200) + '）')
      const reset = await callTool('vibe_v5_set', { motionSecondsRequired: 1 }, ROOT)
      assert(reset && reset.ok === true, 'S19：**复位门槛=1**（顺序无关；got ' + String(JSON.stringify(reset) || null).slice(0, 140) + '）')
    } else {
      assert(false, 'V5_SCENARIO 未知（s19）：' + name)
    }
  } else if (name.startsWith('s20-')) {
    // S20（B-3(甲)）：**决议取代写入面**（`op:'supersede'`）＋ **`res:latest` 单一口径** ＋ **`from_resolution` 校验**。
    const openFormalS20 = async (agenda) => {
      const mt = await callTool('vibe_v5_meeting', { agenda, kind: 'solve-vote' }, ROOT)
      assert(mt && mt.ok === true, 'S20：正式会议已开（前置；got ' + String(JSON.stringify(mt) || null).slice(0, 160) + '）')
      return String((await callTool('vibe_v5_status', {})).meeting.id)
    }
    const recordRes = async (text) => {
      const r = await callTool('vibe_v5_result_record', { text, kind: 'resolution' }, childAgent(childOf('acad')))
      assert(r && r.ok === true, 'S20：决议已落库（前置；got ' + String(JSON.stringify(r) || null).slice(0, 200) + '）')
      return String(r.resolution.id)
    }
    if (name === 's20-supersede') {
      await openFormalS20('S20 取代写入')
      const r1 = await recordRes('S20 决议一（将被取代）')
      const r2 = await recordRes('S20 决议二（取代者）')
      assert(r1 === 'res-1' && r2 === 'res-2', 'S20：两条决议标识＝res-1／res-2（前置；got ' + String(JSON.stringify([r1, r2]) || null) + '）')
      const effBefore = Number((((((readV5State() || {}).institutes || {})['default::institute'] || {}).resolutions || [])[0] || {}).effectiveAt || 0)
      const r3 = await recordRes('S20 决议三（用于二次取代）')
      const ghost = await callTool('vibe_v5_result_record', { op: 'supersede', of: 'res-404', by: r2 }, childAgent(childOf('acad')))
      assert(ghost && ghost.ok === false && /找不到被取代的决议/.test(String(ghost.message)),
        'S20：**幽灵 `of` ⇒ 具名拒**（不校验既存即红；got ' + String(JSON.stringify(ghost) || null).slice(0, 220) + '）')
      const sup = await callTool('vibe_v5_result_record', { op: 'supersede', of: r1, by: r2, why: 'S20 取代理由' }, childAgent(childOf('acad')))
      assert(sup && sup.ok === true && String(sup.superseded.of) === r1 && String(sup.superseded.by) === r2 && Number(sup.superseded.at) > 0,
        'S20/B-3(甲)：**取代成功**（`superseded{of,by,at,byWhom}`；got ' + String(JSON.stringify(sup) || null).slice(0, 240) + '）')
      const st = readV5State()
      const list = (((st || {}).institutes || {})['default::institute'] || {}).resolutions || []
      assert(list.length === 3 && String(list[0].supersededBy) === r2 && Number(list[0].effectiveAt) === effBefore,
        'S20：**旧条目保留**（长度 3）＋ **`effectiveAt` 不变** ＋ 标注取代链（got ' + String(JSON.stringify(list).slice(0, 260) || null).slice(0, 260) + '）')
      const again = await callTool('vibe_v5_result_record', { op: 'supersede', of: r1, by: r2 }, childAgent(childOf('acad')))
      assert(again && again.ok === true && again.deduped === true,
        'S20：**同值取代幂等**（`deduped`；got ' + String(JSON.stringify(again) || null).slice(0, 200) + '）')
      const twice = await callTool('vibe_v5_result_record', { op: 'supersede', of: r1, by: r3 }, childAgent(childOf('acad')))
      assert(twice && twice.ok === false && /不得二次取代/.test(String(twice.message)),
        'S20：**不得二次取代**（`of` 已被取代、换一个未被取代的 `by` 仍拒；got ' + String(JSON.stringify(twice) || null).slice(0, 240) + '）')
      const useDead = await callTool('vibe_v5_result_record', { op: 'supersede', of: r3, by: r1 }, childAgent(childOf('acad')))
      assert(useDead && useDead.ok === false && /本身已被取代/.test(String(useDead.message)),
        'S20：**不得用被取代者取代他人**（具名拒；got ' + String(JSON.stringify(useDead) || null).slice(0, 240) + '）')
    } else if (name === 's20-latest-skips') {
      await openFormalS20('S20 latest 跳过被取代')
      const r1 = await recordRes('S20 latest 决议一')
      const r2 = await recordRes('S20 latest 决议二')
      const q1 = await callTool('vibe_v5_report', {})
      assert(/最新（未被取代）[^：]*：res-2/.test(JSON.stringify(q1)),
        'S20：`report()` 的"最新（未被取代）"＝`res-2`（三处同源；got ' + String(JSON.stringify(q1) || null).slice(0, 200) + '）')
      const before = String((await callTool('vibe_v5_status', {})).resolutions.latest_id)
      assert(before === r2, 'S20：取代前 `latest_id === res-2`（前置；got ' + String(JSON.stringify(before) || null) + '）')
      const sup = await callTool('vibe_v5_result_record', { op: 'supersede', of: r2, by: r1, why: 'S20 取代当前 latest' }, childAgent(childOf('acad')))
      assert(sup && sup.ok === true, 'S20：取代当前 latest 成功（前置；got ' + String(JSON.stringify(sup) || null).slice(0, 200) + '）')
      const after = String((await callTool('vibe_v5_status', {})).resolutions.latest_id)
      assert(after === r1 && after !== before,
        'S20/B-3(甲)：**`res:latest` 退回上一条未被取代者**（两次取值不同：' + String(JSON.stringify([before, after]) || null) + '）')
      const q2 = await callTool('vibe_v5_report', {})
      assert(/最新（未被取代）[^：]*：res-1/.test(JSON.stringify(q2)),
        'S20：`report()` 同步为 `res-1`（第三处同源；got ' + String(JSON.stringify(q2) || null).slice(0, 200) + '）')
      const supAll = await callTool('vibe_v5_result_record', { op: 'supersede', of: r1, by: 'res-1' }, childAgent(childOf('r-3')))
      assert(supAll && supAll.ok === false,
        'S20：既已被取代 ⇒ 再取代被拒（前置；got ' + String(JSON.stringify(supAll) || null).slice(0, 200) + '）')
    } else if (name === 's20-assign-superseded-refused') {
      await openFormalS20('S20 已取代不得派活')
      const r1 = await recordRes('S20 待取代决议')
      const r2 = await recordRes('S20 取代者决议')
      const sup = await callTool('vibe_v5_result_record', { op: 'supersede', of: r1, by: r2 }, childAgent(childOf('acad')))
      assert(sup && sup.ok === true, 'S20：取代成功（前置；got ' + String(JSON.stringify(sup) || null).slice(0, 160) + '）')
      const asg = await callTool('vibe_v5_assign', { to: 'r-1', why: 'S20 已取代决议派活', acceptance: '完成', from_resolution: r1 }, ROOT)
      assert(asg && asg.ok === false && /已被取代/.test(String(asg.message)) && /不得据此派活/.test(String(asg.message)),
        'S20/B-3(甲)：**已被取代的决议不得据此派活**（具名拒；got ' + String(JSON.stringify(asg) || null).slice(0, 240) + '）')
    } else if (name === 's20-assign-from-resolution') {
      const mtId = await openFormalS20('S20 未取代可派活')
      const r1 = await recordRes('S20 未取代决议')
      const asg = await callTool('vibe_v5_assign', { to: 'r-1', why: 'S20 未取代决议派活', acceptance: '完成', from_resolution: r1 }, ROOT)
      assert(asg && asg.ok === true && String(asg.task && asg.task.resolution_id) === r1,
        'S20/B-3(甲)：**未取代 ⇒ 派活成功且记 `resolution_id`**（got ' + String(JSON.stringify(asg && asg.task) || null).slice(0, 240) + '）')
      const list = await callTool('vibe_v5_task_list', {}, ROOT)
      const t = (((list && list.tasks) || []).filter((x) => String(x.resolution_id || '') === r1))[0]
      assert(!!t, 'S20：任务板可见 `resolution_id`（got ' + String(JSON.stringify((list && list.tasks) || []).slice(0, 200) || null).slice(0, 200) + '）')
    } else {
      assert(false, 'V5_SCENARIO 未知（s20）：' + name)
    }
  } else if (name.startsWith('s25a-')) {
    // S25-A（issue #13 #1/#4）：**提示词面不可经工具观测** ⇒ 提示词断言归**静态门**（R94／R97／R98）；
    // 场景**只验可观测的参数面**（`vibe_v5_set` 回执 ＋ `status()` 文本回显）✓。
    const setRes = async (v) => callTool('vibe_v5_set', v, ROOT)
    if (name === 's25a-params-echo') {
      const s1 = await setRes({ resourceSelfCheck: true, toolCallsPerTurnCap: 12, memoryCeilingMb: 4096 })
      assert(s1 && s1.ok === true, 'S25-A：三个资源参数可设（前置；got ' + String(JSON.stringify(s1) || null).slice(0, 200) + '）')
      const again = await setRes({ resourceSelfCheck: true, toolCallsPerTurnCap: 12, memoryCeilingMb: 4096 })
      assert(again && again.ok === true && (!again.adjusted || (again.adjusted.toolCallsPerTurnCap === undefined && again.adjusted.memoryCeilingMb === undefined && again.adjusted.resourceSelfCheck === undefined)),
        'S25-A：**同值再设 ⇒ 回执无 `adjusted`**（值确实已存；got ' + String(JSON.stringify(again && again.adjusted) || null).slice(0, 200) + '）')
      const st = JSON.stringify(await callTool('vibe_v5_status', {}))
      assert(/"toolCallsPerTurnCap":12/.test(st) && /"memoryCeilingMb":4096/.test(st) && /"resourceSelfCheck":true/.test(st),
        'S25-A：**`status()` 回显三键真实值**（12／4096／true；got ' + String(st || null).slice(0, 200) + '）')
    } else if (name === 's25a-default-echo') {
      const d = await setRes({ resourceSelfCheck: false, toolCallsPerTurnCap: 0, memoryCeilingMb: 0 })
      assert(d && d.ok === true, 'S25-A：恢复默认可设（前置；got ' + String(JSON.stringify(d) || null).slice(0, 160) + '）')
      const st = JSON.stringify(await callTool('vibe_v5_status', {}))
      assert(/"resourceSelfCheck":false/.test(st) && /"toolCallsPerTurnCap":0/.test(st) && /"memoryCeilingMb":0/.test(st),
        'S25-A：**默认值也回显**（false／0／0 ⇒ 主代理可发现；got ' + String(st || null).slice(0, 200) + '）')
    } else if (name === 's25a-invalid-refused') {
      for (const bad of [{ toolCallsPerTurnCap: -1 }, { memoryCeilingMb: -1 }, { toolCallsPerTurnCap: 1.5 }]) {
        const r = await setRes(bad)
        assert(r && r.ok === false && String(r.code) === 'V5_INVALID_ARGUMENT' && /≥0 的整数/.test(String(r.message)),
          'S25-A：**非法值具名拒**（' + JSON.stringify(bad) + '；got ' + String(JSON.stringify(r) || null).slice(0, 200) + '）')
      }
      const keep = await setRes({ toolCallsPerTurnCap: 0 })
      assert(keep && keep.ok === true && (!keep.adjusted || keep.adjusted.toolCallsPerTurnCap === undefined),
        'S25-A：**拒后值未被改坏**（再设 0 ⇒ 无 `adjusted`；got ' + String(JSON.stringify(keep && keep.adjusted) || null).slice(0, 160) + '）')
    } else if (name === 's25a-reset') {
      const r1 = await setRes({ resourceSelfCheck: false, toolCallsPerTurnCap: 0, memoryCeilingMb: 0 })
      assert(r1 && r1.ok === true, 'S25-A：**复位默认**（顺序无关；got ' + String(JSON.stringify(r1) || null).slice(0, 160) + '）')
      const st = JSON.stringify(await callTool('vibe_v5_status', {}))
      assert(/"resourceSelfCheck":false/.test(st),
        'S25-A：复位后回显为 false（got ' + String(st || null).slice(0, 160) + '）')
    } else {
      assert(false, 'V5_SCENARIO 未知（s25a）：' + name)
    }
  } else if (name.startsWith('s25b-')) {
    // S25-B（issue #13 #2）：记录分轨。**缺省 ⇒ 仍写 progress.md（逐字不变）**；给了 track ⇒
    // 落到 `Progress/{routes,obstacles,rejected,state}.md`（"被否决的路线/障碍"各自成档）；
    // 非法 track ⇒ 具名拒。提示词面不可观测的部分归静态门。
    const rec = (args) => callTool('vibe_v5_record_progress', args, childAgent(childOf('r-1')))
    if (name === 's25b-progress-tracks') {
      const base = await rec({ content: 'S25-B 叙述基线' })
      assert(base && base.ok === true && /Progress\/progress\.md$/.test(String(base.file)),
        'S25-B：**缺省 track ⇒ 仍写 progress.md**（got ' + String(JSON.stringify(base) || null).slice(0, 200) + '）')
      const rej = await rec({ content: 'S25-B 被否决的路线', track: 'rejected' })
      assert(rej && rej.ok === true && /Progress\/rejected\.md$/.test(String(rej.file)) && String(rej.track) === 'rejected',
        'S25-B：**track=rejected ⇒ 落 rejected.md**（got ' + String(JSON.stringify(rej) || null).slice(0, 200) + '）')
      const obs = await rec({ content: 'S25-B 障碍', track: 'obstacle' })
      assert(obs && obs.ok === true && /Progress\/obstacles\.md$/.test(String(obs.file)),
        'S25-B：**track=obstacle ⇒ 落 obstacles.md**（got ' + String(JSON.stringify(obs) || null).slice(0, 200) + '）')
      const bad = await rec({ content: 'x', track: 'nope' })
      assert(bad && bad.ok === false && String(bad.code) === 'V5_INVALID_ARGUMENT' && /unknown track/.test(String(bad.message)),
        'S25-B：**非法 track ⇒ 具名拒**（got ' + String(JSON.stringify(bad) || null).slice(0, 200) + '）')
      const back = await rec({ content: 'S25-B 叙述续' })
      assert(back && back.ok === true && /Progress\/progress\.md$/.test(String(back.file)),
        'S25-B：分轨后**缺省仍回 progress.md**（got ' + String(JSON.stringify(back) || null).slice(0, 200) + '）')
    } else if (name === 's25b-pending-work') {
      // S25-B 段二（issue #13 #5）：**待续标记**（耐久）。① 正常收尾 ⇒ 清；② 暂停 ⇒ 在役成员标
      // `institute-paused`（重启/暂停后仍知道谁还有活没干完）；③ 恢复并正常收尾 ⇒ 再清。
      const pend = async () => (await callTool('vibe_v5_status', {})).members.map((m) => m.pendingWork)
      await drainWakes(6); await settleAll()
      const p0 = await pend()
      assert(p0.length > 0 && p0.every((x) => x === null),
        'S25-B：**正常收尾 ⇒ 无待续标记**（got ' + String(JSON.stringify(p0) || null).slice(0, 200) + '）')
      const paused = await callTool('vibe_v5_pause', {}, ROOT)
      assert(paused && paused.ok === true, 'S25-B：pause 可调（前置；got ' + String(JSON.stringify(paused) || null).slice(0, 160) + '）')
      const p1 = await pend()
      assert(p1.length > 0 && p1.every((x) => x && x.reason === 'institute-paused'),
        'S25-B：**暂停 ⇒ 在役成员标 `institute-paused`**（got ' + String(JSON.stringify(p1) || null).slice(0, 200) + '）')
      const resumed = await callTool('vibe_v5_resume', {}, ROOT)
      assert(resumed && resumed.ok === true, 'S25-B：resume 可调（got ' + String(JSON.stringify(resumed) || null).slice(0, 160) + '）')
      await drainWakes(8); await settleAll()
      const p2 = await pend()
      assert(p2.every((x) => x === null), // EMPTY_ALLOWED: 该断言查的是"待续标记**已被清空**"（每个成员都无挂起标记），空列表正是期望结果 ⇒ 空集无从违规
        'S25-B：**恢复且正常收尾 ⇒ 待续标记被清**（got ' + String(JSON.stringify(p2) || null).slice(0, 200) + '）')
    } else {
      assert(false, 'V5_SCENARIO 未知（s25b）：' + name)
    }
  } else if (name.startsWith('s25c-')) {
    // S25-C（issue #13 #1）：两道硬门的**负例**在此显式覆盖 —— 这里用 `callToolRaw` 绕过 `callTool` 的
    // 场景前置包装（包装会先登记 formal_proof 并由院士提议），所以能真的测到"被拒"。
    if (name === 's25c-proof-gate') {
      const acad = childAgent(childOf('acad'))
      const r1 = childAgent(childOf('r-1'))
      const t2 = 'p-s25c-gate'
      await callTool('vibe_v5_record_proposition', { id: t2, title: 'S25-C 门探测', statement: 'S25-C：只有正规证明/证伪的命题可入辩论。', value: 0.5, motive: 'S25-C 门', p: 0.5 }, r1)
      const noProof = await callToolRaw('vibe_v5_propose_verify', { target: t2, kind: 'proposition', reason: 'S25-C：未登记正式证明就提议' }, acad)
      assert(noProof && noProof.ok === false && String(noProof.code) === 'V5_INVALID_ARGUMENT' && /只有已被正式证明或证伪/.test(String(noProof.message)),
        'S25-C：**未登记正式证明 ⇒ 具名拒**（got ' + String(JSON.stringify(noProof) || null).slice(0, 200) + '）')
      const notAcad = await callToolRaw('vibe_v5_propose_verify', { target: t2, kind: 'proposition', reason: 'S25-C：非院士提议' }, r1)
      assert(notAcad && notAcad.ok === false && /由院士决定/.test(String(notAcad.message)),
        'S25-C：**非院士提议 ⇒ 具名拒**（got ' + String(JSON.stringify(notAcad) || null).slice(0, 200) + '）')
      const regBad = await callToolRaw('vibe_v5_end_verify', { target: t2, reason: 'S25-C：非法 status', op: 'formal_proof', status: 'maybe' }, acad)
      assert(regBad && regBad.ok === false && /status 必须是/.test(String(regBad.message)),
        'S25-C：**非法 status ⇒ 具名拒**（got ' + String(JSON.stringify(regBad) || null).slice(0, 200) + '）')
      const regOk = await callToolRaw('vibe_v5_end_verify', { target: t2, reason: 'S25-C：登记正式证明', op: 'formal_proof', status: 'proved' }, acad)
      assert(regOk && regOk.ok === true && regOk.formalProof && regOk.formalProof.locked === true,
        'S25-C：**院士登记 formal_proof ⇒ 定稿（locked）**（got ' + String(JSON.stringify(regOk) || null).slice(0, 200) + '）')
      const okNow = await callToolRaw('vibe_v5_propose_verify', { target: t2, kind: 'proposition', reason: 'S25-C：登记后提议' }, acad)
      assert(okNow && okNow.ok === true,
        'S25-C：**登记后由院士提议 ⇒ 受理**（got ' + String(JSON.stringify(okNow) || null).slice(0, 200) + '）')
    } else {
      assert(false, 'V5_SCENARIO 未知（s25c）：' + name)
    }
  } else if (name.startsWith('s25e-')) {
    // S25-E（issue #13 #2/#5/#4 的收尾硬化）：
    //  ① 宿主杀掉子代理、`end` **永不回来**（issue #5 的真实现场）⇒ 回合开始落的耐久标记**必须在**；
    //     异常收尾（`stopReason≠completed`）⇒ 标记**必须保留**（不得当成正常交付而清掉）；
    //  ② 分轨记录的截断**必须被计数**（`droppedChars`），不能被静默吞掉。
    if (name === 's25e-hardening') {
      const h = await callTool('vibe_v5_hire', { purpose: 'S25-E 无回执探测', initial_task: '探测' }, childAgent(childOf('r-1')))
      const hired = String((h && h.id) || '')
      assert(hired !== '', 'S25-E：能招到临时工（前置；got ' + String(JSON.stringify(h) || null).slice(0, 160) + '）')
      await settleAll()
      const pick = async (id) => (((await callTool('vibe_v5_status', {})).members) || []).filter((m) => String(m.id) === id)[0]
      const t1 = await pick(hired)
      assert(!!t1 && !!t1.pendingWork && String(t1.pendingWork.objective).length > 0,
        'S25-E：**回合在飞时 `pendingWork` 已在耐久记录里**（got ' + String(JSON.stringify(t1 && t1.pendingWork) || null).slice(0, 200) + '）')
      fireEnd(childOf(hired), undefined, 'error')
      await settleAll()
      const t2 = await pick(hired)
      assert(!!t2 && !!t2.pendingWork && String(t2.pendingWork.reason) === 'host-ended',
        'S25-E：**异常收尾 ⇒ 待续标记保留（reason=host-ended）**（got ' + String(JSON.stringify(t2 && t2.pendingWork) || null).slice(0, 200) + '）')
      const longNote = 'S25-E 截断探测。' + '甲乙丙丁戊己庚辛壬癸'.repeat(300)
      const wr = await callTool('vibe_v5_record_progress', { content: longNote, track: 'rejected' }, childAgent(childOf('r-1')))
      assert(wr && wr.ok === true, 'S25-E：可分轨写入（前置；got ' + String(JSON.stringify(wr) || null).slice(0, 160) + '）')
      const rd = await callTool('vibe_v5_read_library', {}, ROOT)
      const tracks = (((rd && rd.items) || [])).filter((it) => String(it.kind) === 'progress-track')
      const tr = tracks.filter((it) => String(it.id) === 'rejected')[0]
      assert(!!tr && Number(tr.droppedChars) > 0 && String(tr.text).length <= 2000,
        'S25-E：**分轨截断被显式计数**（`droppedChars`＞0 且正文 ≤2000；got ' + String(JSON.stringify(tr) || null).slice(0, 220) + '）')
      // ③ 本所自己的"在活成员"上限：达限 ⇒ **产品侧前置具名拒**（不再只依赖宿主 ACTIVATION_LIMIT_REACHED）
      const setCap = await callTool('vibe_v5_set', { maxLiveChildren: 1 }, ROOT)
      assert(setCap && setCap.ok === true, 'S25-E：可设 maxLiveChildren（前置；got ' + String(JSON.stringify(setCap) || null).slice(0, 160) + '）')
      const stCap = JSON.stringify(await callTool('vibe_v5_status', {}))
      assert(/"maxLiveChildren":1/.test(stCap), 'S25-E：**status() 回显 maxLiveChildren**（got ' + String(stCap || null).slice(0, 200) + '）')
      const bad = await callTool('vibe_v5_set', { maxLiveChildren: -1 })
      assert(bad && bad.ok === false && String(bad.code) === 'V5_INVALID_ARGUMENT' && /≥0 的整数/.test(String(bad.message)),
        'S25-E：**非法上限 ⇒ 具名拒**（got ' + String(JSON.stringify(bad) || null).slice(0, 200) + '）')
      const hire2 = await callTool('vibe_v5_hire', { purpose: 'S25-E 上限探测', initial_task: '探测' }, childAgent(childOf('r-1')))
      const msg2 = String((hire2 && (hire2.message || hire2.error)) || '')
      const failed2 = ((await callTool('vibe_v5_status', {})).failedMembers) || []
      const hitCap = /maxLiveChildren/.test(msg2) || failed2.some((m) => /maxLiveChildren/.test(String(m.error || '')))
      assert(hitCap, 'S25-E：**达上限 ⇒ 新建成员被产品侧具名拒**（got hire=' + String(JSON.stringify(hire2) || null).slice(0, 160)
        + ' failed=' + String(JSON.stringify(failed2) || null).slice(0, 160) + '）')
      await callTool('vibe_v5_set', { maxLiveChildren: 0 }, ROOT)
    } else {
      assert(false, 'V5_SCENARIO 未知（s25e）：' + name)
    }
  } else if (name.startsWith('s25d-')) {
    // S25-D（issue #13 #4）：**机器层**资源预算（不再是提示词）。① 单回合工具预算**硬拒**；
    // ② **真实**内存读数（RSS）可从 status().debug 观测；③ 越过内存上限 ⇒ 新建成员被**机器拒绝**。
    const setRes = (v) => callTool('vibe_v5_set', v, ROOT)
    if (name === 's25d-resource-budget') {
      const st0 = await callTool('vibe_v5_status', {})
      assert(st0 && st0.debug && Number(st0.debug.rssMb) > 0,
        'S25-D：**status().debug.rssMb 是真实读数**（got ' + String(JSON.stringify(st0 && st0.debug) || null).slice(0, 200) + '）')
      const on = await setRes({ toolCallsPerTurnCap: 2 })
      assert(on && on.ok === true, 'S25-D：可设 toolCallsPerTurnCap（前置；got ' + String(JSON.stringify(on) || null).slice(0, 160) + '）')
      const call = () => callTool('vibe_v5_status', {}, childAgent(childOf('r-1')))
      const a1 = await call()
      const a2 = await call()
      const a3 = await call()
      assert(a1 && a1.ok === true && a2 && a2.ok === true,
        'S25-D：预算内两次调用**正常执行**（got ' + String(JSON.stringify({ a1: a1 && a1.ok, a2: a2 && a2.ok }) || null).slice(0, 160) + '）')
      assert(a3 && a3.ok === false && String(a3.code) === 'V5_RESOURCE_BUDGET' && /机器强制/.test(String(a3.message)),
        'S25-D：**第 3 次调用被机器拒**（`V5_RESOURCE_BUDGET`；got ' + String(JSON.stringify(a3) || null).slice(0, 200) + '）')
      const off = await setRes({ toolCallsPerTurnCap: 0 })
      assert(off && off.ok === true, 'S25-D：复位不限（got ' + String(JSON.stringify(off) || null).slice(0, 160) + '）')
      const set1mb = await setRes({ memoryCeilingMb: 1 })
      assert(set1mb && set1mb.ok === true, 'S25-D：可设 memoryCeilingMb（got ' + String(JSON.stringify(set1mb) || null).slice(0, 160) + '）')
      const res = await callTool('vibe_v5_hire', { purpose: 'S25-D 内存降级探测', initial_task: '探测' }, childAgent(childOf('r-1')))
      const failed = (await callTool('vibe_v5_status', {})).failedMembers || []
      const hitMem = failed.some((m) => /memoryCeilingMb/.test(String(m.error || '')))
        || (/memoryCeilingMb/.test(String((res && res.message) || '')))
      assert(hitMem,
        'S25-D：**越过内存上限 ⇒ 新建成员被机器拒**（got res=' + String(JSON.stringify(res) || null).slice(0, 160)
        + ' failed=' + String(JSON.stringify(failed) || null).slice(0, 160) + '）')
      await setRes({ memoryCeilingMb: 0 })
    } else {
      assert(false, 'V5_SCENARIO 未知（s25d）：' + name)
    }
  } else if (name.startsWith('s21-')) {
    // ── S21（指针传播）：**内容指纹语义** ／ **头部列表不含正文** ／ **悬空 id 具名拒** ／
    // **注入契约（逐轮重拼）** ／ **Lean 复用既有 sha256**。每个场景各自独立工作区。
    const cardText = (memberId, dir, id) => {
      const p = join(instDir, 'Members', memberId, dir, id + '.md')
      return existsSync(p) ? readFileSync(p, 'utf8') : ''
    }
    const cardFingerprint = (memberId, dir, id) => {
        const m = /^-\s*内容指纹:\s*(.+)$/m.exec(cardText(memberId, dir, id))
        return m ? m[1].trim() : ''
      }
      const recProp = async (id, title, statement) => {
        const r = await callTool('vibe_v5_record_proposition', {
          id, title, statement, value: 0.5, motive: 'S21 指纹场景', p: 0.5,
        }, childAgent(childOf('r-1')))
        assert(r && r.ok === true, 'S21 前置：命题已入库（' + id + '；got ' + String(JSON.stringify(r) || null).slice(0, 200) + '）')
        return r
      }
      if (name === 's21-fingerprint-semantics') {
        const stmtA = 'S21 指纹：若 n>2 且 x^n+y^n=z^n 有整数解，则最小反例可归约。'
        const stmtB = 'S21 指纹（已修订）：若 n>3 且 x^n+y^n=z^n 有整数解，则最小反例可归约。'
        const r1 = await recProp('p-s21-fp', 'S21 指纹 甲', stmtA)
        // ① 同内容重复写 ⇒ 指纹相同（幂等）
        const r2 = await recProp('p-s21-fp', 'S21 指纹 甲', stmtA)
        assert(String(r1.fingerprint) === String(r2.fingerprint) && String(r1.fingerprint).length === 64,
          'G1：**同内容重复写 ⇒ 指纹不变**（两次都是 64 位 hex；got ' + String(r1.fingerprint) + ' / ' + String(r2.fingerprint) + '）')
        // ② 内容变 ⇒ 指纹必变
        const r3 = await recProp('p-s21-fp', 'S21 指纹 甲', stmtB)
        assert(String(r3.fingerprint) !== String(r1.fingerprint),
          'G1：**陈述原文一变 ⇒ 指纹必变**（got ' + String(r1.fingerprint) + ' → ' + String(r3.fingerprint) + '）')
        // ③ 展示用标题不参与口径（D1）
        const r4 = await recProp('p-s21-fp', 'S21 指纹 甲（改了标题）', stmtB)
        assert(String(r4.fingerprint) === String(r3.fingerprint),
          'G1/D1：**标题是展示字段、不参与指纹**（改标题后指纹不变；got ' + String(r3.fingerprint) + ' → ' + String(r4.fingerprint) + '）')
        // ④ 指纹只算一次并随对象持久化：磁盘上的值 === 读面读回的值
        const onDisk = cardFingerprint('r-1', 'Propos', 'p-s21-fp')
        assert(onDisk === String(r3.fingerprint) && onDisk.length === 64,
          'G1：**指纹随对象持久化**（卡片文件 `- 内容指纹:` 与读面一致；disk=' + String(onDisk) + ' api=' + String(r3.fingerprint) + '）')
        const exp = await callTool('vibe_v5_read_library', { id: 'p-s21-fp' }, ROOT)
        assert(exp && exp.ok === true && String(((exp.items || [])[0] || {}).fingerprint) === onDisk,
          'G1：**按 id 展开时读回的是已存指纹**（读面不重算；got ' + String(JSON.stringify((exp.items || [])[0] && exp.items[0].fingerprint) || null) + '）')
        // ⑤ 方法卡片同样有指纹（口径覆盖 4 类可验证对象）
        const rm = await callTool('vibe_v5_record_method', {
          id: 'm-s21-fp', title: 'S21 方法', content: '核心内容：最小反例归约。', notation: '记号：n∈N',
          value: 0.4, motive: 'S21 指纹场景', p: 0.5,
        }, childAgent(childOf('r-1')))
        assert(rm && rm.ok === true && String(rm.fingerprint).length === 64,
          'G1：**方法卡也有内容指纹**（got ' + String(JSON.stringify(rm && rm.fingerprint) || null) + '）')
      } else if (name === 's21-header-list') {
        await recProp('p-s21-list', 'S21 头部列表', 'S21 列表：这条陈述原文**不得**出现在头部列表里。')
        const list = await callTool('vibe_v5_read_library', { list: true }, ROOT)
        assert(list && list.ok === true && list.mode === 'list' && Array.isArray(list.list) && list.list.length >= 1,
          'G2：**一次调用取回头部列表**（mode=list；got ' + String(JSON.stringify(list) || null).slice(0, 220) + '）')
        const row = (list.list || []).filter((x) => String(x.id) === 'p-s21-list')[0]
        assert(!!row, 'G2：列表里能按 id/标题/指纹/状态/归属/更新时间定位到刚写的对象（got ' + String(JSON.stringify(list.list) || null).slice(0, 220) + '）')
        const raw = JSON.stringify(list)
        const KEYS = ['id', 'kind', 'title', 'fingerprint', 'status', 'owner', 'updatedAt']
        const extra = Object.keys(row || {}).filter((k) => KEYS.indexOf(k) === -1)
        assert(extra.length === 0,
          'G2：**每条只有 7 个头部字段**（多出：' + JSON.stringify(extra) + '）')
        assert(String(row.fingerprint) === cardFingerprint('r-1', 'Propos', 'p-s21-list') && String(row.fingerprint).length === 64,
          'G2：列表里的 `fingerprint` 就是已存指纹（got ' + String(row.fingerprint) + '）')
        assert(String(row.title).indexOf('S21 头部列表') !== -1 && String(row.owner) === 'r-1' && String(row.status).length > 0
          && Number(row.updatedAt) > 0,
          'G2：标题/归属/状态/更新时间齐全（got ' + String(JSON.stringify(row) || null).slice(0, 200) + '）')
        // 硬约束：头部列表里不得出现任何正文
        const BODY_MARKS = ['## 陈述', '## 证明尝试', '## 证伪尝试', '## 核心内容', '## 定义与记号', '这条陈述原文']
        const leaked = BODY_MARKS.filter((m) => raw.indexOf(m) !== -1)
        assert(leaked.length === 0,
          'G2：**头部列表里没有任何正文**（泄漏标志：' + JSON.stringify(leaked) + '）')
        assert(raw.indexOf('"text"') === -1, 'G2：头部列表条目里**没有 `text` 键**（got ' + raw.slice(0, 200) + '）')
      } else if (name === 's21-dangling-id') {
        await recProp('p-s21-exists', 'S21 存在', 'S21 悬空：这张卡片存在，用于对照。')
        const ghost = await callTool('vibe_v5_read_library', { id: 'p-s21-404' }, ROOT)
        assert(ghost && ghost.ok === false && String(ghost.code) === 'V5_INVALID_ARGUMENT',
          'G3：**悬空 id ⇒ 具名拒**（ok:false + V5_INVALID_ARGUMENT；got ' + String(JSON.stringify(ghost) || null).slice(0, 240) + '）')
        assert(/p-s21-404/.test(String(ghost.message)),
          'G3：拒绝文案**指名那个 id**（不许含糊；got ' + String(ghost.message) + '）')
        assert((ghost.items || []).length === 0 && ghost.text === undefined,
          'G3：**绝不返回空正文、更不返回近似物**（items/text 都必须缺；got ' + String(JSON.stringify({ items: ghost.items, text: ghost.text }) || null) + '）')
        assert(!!ghost.next && String(ghost.next.tool) === 'vibe_v5_read_library',
          'G3：拒绝附**恢复路径**（next 指回头部列表；got ' + String(JSON.stringify(ghost.next) || null).slice(0, 200) + '）')
        const ok = await callTool('vibe_v5_read_library', { id: 'p-s21-exists' }, ROOT)
        assert(ok && ok.ok === true && String(((ok.items || [])[0] || {}).text || '').indexOf('## 陈述') !== -1,
          'G3：既存 id 仍能正常展开（拒绝不是"一律拒"；got ' + String(JSON.stringify(ok) || null).slice(0, 200) + '）')
      } else if (name === 's21-pointer-injection') {
        await recProp('p-s21-inject', 'S21 注入', 'S21 注入：这段正文**不得**出现在提示词里（框架只注入机制约束）。')
        const seen = []
        for (const w of wakes) {
          const t = (w.blocks && w.blocks[0] && w.blocks[0].text) || ''
          if (/【入职首轮|【第 \d+ 轮|【心跳检查|【研究所会议|【求真表决/.test(t)) seen.push(t)
        }
        assert(seen.length >= 1, 'S21 前置：至少捕获一条成员提示词（got ' + seen.length + '）')
        const RULES = [
          '【指针传播 · 头部列表（机制约束）】',
          '跨对象引用只以**头部列表**形式存在',
          '要正文就用 id 调 `vibe_v5_read_library` 展开',
          '**指纹与头部列表不一致，必须重新拉取**',
          '引用他人结论**必须**带 id',
          '**具名阻塞并上报**',
          '**禁止**自行猜测、改写、拼写对象 id',
          '`vibe_v5_lean_lib` / `vibe_v5_lean_read`',
        ]
        assert([...seen].length > 0, 'non-vacuous: at least one captured prompt must be swept for the injected contract (' + [...seen].length + ')')
        for (const t of seen) {
          const missing = RULES.filter((r) => t.indexOf(r) === -1)
          assert(missing.length === 0,
            'S21：**注入契约逐条在提示词里**（缺：' + JSON.stringify(missing) + '）')
          const iBlock = t.indexOf('【指针传播 · 头部列表（机制约束）】')
          const iState = t.indexOf('[状态] 你是')
          assert(iBlock >= 0 && iState > iBlock,
            'S21：**契约块在状态块之前**（block@' + iBlock + ' < state@' + iState + '）')
          assert(t.indexOf('## 陈述') === -1 && t.indexOf('这段正文') === -1,
            'S21：**提示词里没有卡片正文**（框架只注入机制，不注入内容）')
          const toolNames = (t.match(/vibe_v5_read_library/g) || []).length
          assert(toolNames >= 1 && /`vibe_v5_read_library`/.test(t),
            'S21：注入文本里的工具名是**全称**（got ' + toolNames + '）')
        }
      } else if (name === 's21-pointer-off') {
        // S21 开关（用户要求"可参数调控"）：可关、可开、可在 `status()` 复核；且**只控"默认注入/默认通道"**
        // —— `vibe_v5_read_library` 的新增只读模式（`{list:true}`／`{id}`）**不随开关关闭** ✓。
        // （"关掉 ⇒ 契约段零注入"由静态门 R103 从代码形状上钉死：包装在关闭时返回空数组 ✓。）
        await recProp('p-s21-switch', 'S21 开关', 'S21 开关：关掉后读面仍可用。')
        const off1 = await callTool('vibe_v5_set', { pointerPropagation: false }, ROOT)
        assert(off1 && off1.ok === true, 'S21 开关：可设 false（前置；got ' + String(JSON.stringify(off1) || null).slice(0, 160) + '）')
        const stOff = JSON.stringify(await callTool('vibe_v5_status', {}))
        assert(/"pointerPropagation":false/.test(stOff), 'S21 开关：**status() 回显 false**（got ' + String(stOff || null).slice(0, 200) + '）')
        const listOff = await callTool('vibe_v5_read_library', { list: true }, childAgent(childOf('r-1')))
        assert(listOff && listOff.ok !== false, 'S21 开关：**关闭后 `{list:true}` 仍可用**（got ' + String(JSON.stringify(listOff) || null).slice(0, 200) + '）')
        const on1 = await callTool('vibe_v5_set', { pointerPropagation: true }, ROOT)
        assert(on1 && on1.ok === true, 'S21 开关：可设回 true（got ' + String(JSON.stringify(on1) || null).slice(0, 160) + '）')
        const stOn = JSON.stringify(await callTool('vibe_v5_status', {}))
        assert(/"pointerPropagation":true/.test(stOn), 'S21 开关：**status() 回显 true**（got ' + String(stOn || null).slice(0, 200) + '）')
      } else if (name === 's21-lean-sha256') {
        await recProp('p-s21-lean', 'S21 Lean', 'S21 Lean：归档正文由 Lean 面按名取原文，不进头部列表。')
        const nonce = Math.random().toString(36).slice(2, 10)
        const defName = 'S21Fingerprint' + nonce
        const body = 'def ' + defName + ' (n : Nat) : Nat := n + 1\n'
        const arc = await callTool('vibe_v5_lean_archive', { kind: 'def', name: defName, content: body, run: false }, childAgent(childOf('r-1')))
        assert(arc && arc.ok === true && String(arc.sha256).length === 64,
          'S21 前置：定义了可复用定义并有内容身份（got ' + String(JSON.stringify(arc) || null).slice(0, 240) + '）')
        // `refresh` defaults to true: the reuse face REBUILDS its index and returns the header list.
        const lib = await callTool('vibe_v5_lean_lib', {}, ROOT)
        const row = ((lib && lib.lib) || []).filter((o) => String(o.name) === defName)[0]
        assert(!!row, 'S21 前置：lean_lib 的 `lib[]` 头部面里能看见刚归档的文件（got ' + String(JSON.stringify((lib && lib.lib) || []) || null).slice(0, 220) + '）')
        assert(String(row.sha256) === String(arc.sha256) && String(row.sha256).length === 64,
          'D1/D3：**Lean 面复用既有 sha256**（lib[].sha256 === 归档回执的 sha256；got ' + String(row.sha256) + ' vs ' + String(arc.sha256) + '）')
        assert(String(row.file) === 'Formal/Lib/' + defName + '.lean' && String(row.kind) === 'def',
          'S21：头部面给出 file/kind（got ' + String(JSON.stringify({ file: row.file, kind: row.kind }) || null) + '）')
        const raw = JSON.stringify(lib)
        // 判据：正文**逐行**存在（多行代码）⇒ 头部面条目里任何叶子值都不得含换行、也不得是长块。
        // （`summary` 是该文件的第一行代码——既有索引列，不是搬运正文；`hint` 是框架的复用提示，
        // 不是对象内容，故本判据只看**头部面条目**与 `objects[]`。）
        const leaves = []
        const walk = (v) => {
          if (v === null || typeof v !== 'object') { if (typeof v === 'string') leaves.push(v); return }
          for (const k of Object.keys(v)) walk(v[k])
        }
        walk(lib.lib); walk(lib.proved); walk(lib.objects)
        const bodyish = leaves.filter((s) => s.indexOf('\n') !== -1 || s.length > 120)
        assert(bodyish.length === 0,
          'S21：**头部面不搬运多行正文**（叶子值里没有换行/超长块；got ' + String(JSON.stringify(bodyish) || null).slice(0, 200) + '）')
        assert(raw.length < 1500,
          'S21：**头部面体量有界**（lean_lib=' + raw.length + ' 字符；逐字原文另走 `vibe_v5_lean_read`）')
        assert(row.text === undefined && row.content === undefined,
          'S21：头部面条目里没有 `text`/`content` 键（got ' + String(JSON.stringify(Object.keys(row)) || null) + '）')
        // 代码正文只能按名取原文（逐字可复现），且其 sha256 与头部面同源
        const verbatim = await callTool('vibe_v5_lean_read', { name: defName, kind: 'lib' }, ROOT)
        assert(verbatim && verbatim.ok === true && String(verbatim.text).indexOf(defName) !== -1 && String(verbatim.sha256) === String(row.sha256),
          'S21：**正文由 `vibe_v5_lean_read` 逐字取回，且 sha256 与头部面同源**（got ' + String(JSON.stringify({ ok: verbatim && verbatim.ok, sha: verbatim && verbatim.sha256 }) || null) + '）')
      } else {
        assert(false, 'V5_SCENARIO 未知（s21）：' + name)
      }
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
// ROUND 66: the probe is ARMED again, because round 66 added the re-ask the round-65 measurement demanded. The
// stub omits evidence exactly ONCE; if the refusal re-asks (as it now does, bounded to two attempts), that member
// is asked a second time and the flow completes. If either half were missing - no refusal, or no re-ask - this
// either records a part with no evidence or stalls, and the assertions below catch both.
{
  const probe = globalThis.__paperProbe || (globalThis.__paperProbe = { omitOnce: false, attempts: {} })
  probe.omitOnce = true
  probe.attemptsAtArm = Object.assign({}, probe.attempts)
}
let sDone = sPaper
for (let i = 0; i < 160; i++) {
  sDone = await callTool('vibe_v5_status', {})
  if (sDone.autoDone) break
  await drainWakes(8)
  await sleep(15)
}
assert(sDone.autoDone === true, 'the run is marked complete once the final paper is finalised — ' +
  JSON.stringify({ autoDone: sDone.autoDone, running: sDone.running, paper: sDone.paper && { status: sDone.paper.status, compile: sDone.paper.compile } }))
// ROUND 66: the evidence rule is now REACHABLE, and this is the causal proof. The armed probe omitted evidence
// exactly once; the refusal re-asked that member (round 66's bounded re-ask), so a SECOND attempt for the same
// member exists - and the run still completed. Remove either half and this fails: without the refusal the part is
// recorded and no second attempt happens; without the re-ask the flow stalls and the completion assertions above
// never pass.
{
  const probe = globalThis.__paperProbe || { attempts: {}, attemptsAtArm: {} }
  const armed = probe.attemptsAtArm || {}
  const retried = Object.keys(probe.attempts || {}).filter((k) => probe.attempts[k] > (armed[k] || 0))
  assert(probe.omitOnce === false, 'the evidence probe was CONSUMED exactly once (a single no-evidence delivery)')
  assert(retried.length > 0,
    'a member whose part carried NO evidence was ASKED AGAIN (refusal + re-ask, not one without the other) — ' +
    JSON.stringify({ attempts: probe.attempts, atArm: armed }))
}
assert(sDone.running === false, 'scheduling halted after the paper was finalised')
assert(sDone.paper && sDone.paper.status === 'finalized', 'status reports the paper as finalised (' + JSON.stringify(sDone.paper && sDone.paper.status) + ')')
const paperDir = join(WS, 'VibeMath', 'Projects', 'default', 'Institutes', 'institute', 'Paper', 'institute')
const paperMd = existsSync(join(paperDir, 'paper.md')) ? readFileSync(join(paperDir, 'paper.md'), 'utf8') : ''
const paperTex = existsSync(join(paperDir, 'paper.tex')) ? readFileSync(join(paperDir, 'paper.tex'), 'utf8') : ''
const paperMeta = existsSync(join(paperDir, 'paper.meta.json')) ? JSON.parse(readFileSync(join(paperDir, 'paper.meta.json'), 'utf8')) : null
assert(/## 1\. /.test(paperMd) && /## 9\. /.test(paperMd), '★ the delivered paper carries the 9-section skeleton')
assert(/\\documentclass/.test(paperTex) && /\\begin\{document\}/.test(paperTex), '★ the tex version is produced as well')
// ★ task-235 CONTRACT (docs/final-paper.md §8, three machine-distinguishable states):
//   1) status:'not-detected'                        = no engine could be RESOLVED (attempts: [], triedPaths names the probes)
//   2) status:'failed' + railRefused:true           = engine resolved but NO attempt ever STARTED (started:false, exitCode:null)
//   3) status:'failed' + railRefused:false          = an engine really RAN and the compile failed (started:true, numeric exitCode)
// The old assertion(s) read `status` alone, so states 2 and 3 were indistinguishable — that is exactly what task-232
// flagged and task-235 fixed. `status` semantics are UNCHANGED (no renaming, per the ruling); `railRefused` is the
// machine-readable discriminator, plus per-attempt `started`.
const LATEX_ORDER = ['xelatex', 'latexmk', 'pdflatex', 'lualatex', 'tectonic']
const latexOnPath = LATEX_ORDER.filter((bin) => (process.env.PATH || '').split(delimiter).filter(Boolean)
  .some((d) => existsSync(join(d, bin)) || existsSync(join(d, bin + '.exe'))))
const compileMeta = (paperMeta && paperMeta.compile) || {}
// Visible host note (NOT a divergent assertion): this suite's host stub exposes only `subprocess.spawn` and has no
// `subprocess.run`, so `runPaperProcess` can never launch a compiler here — the harness can only exercise state 2,
// on ANY host. State 3 needs a host whose subprocess.run really returns an exit code (named in the task report).
console.log('  HOST-BRANCH(LaTeX): engines on PATH = [' + (latexOnPath.join(', ') || 'none') + '] ; this harness stub has no subprocess.run ⇒ state 2 (railRefused) is expected')
assert(!!paperMeta && compileMeta.status === 'failed',
  '★ the compile rail degrades to status=failed and still delivers md+tex (' + JSON.stringify(compileMeta) + ')')
assert(compileMeta.railRefused === true,
  '★ railRefused=true: the engine is resolved but NO attempt could START (started:false, exitCode:null) — machine-distinguishable from a real compile failure (' + JSON.stringify({ railRefused: compileMeta.railRefused, attempts: compileMeta.attempts }) + ')')
assert(Array.isArray(compileMeta.attempts) && compileMeta.attempts.length > 0 &&
  compileMeta.attempts.every((a) => a && typeof a.engine === 'string' && a.started === false && a.exitCode === null),
  '★ every attempt records the cannot-start shape (engine named, started=false, exitCode=null), so railRefused is not a guess (' + JSON.stringify(compileMeta.attempts) + ')')
assert(existsSync(join(paperDir, 'paper.tex')) && existsSync(join(paperDir, 'paper.md')),
  '★ and the md+tex are still delivered despite the refused compile rail')
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

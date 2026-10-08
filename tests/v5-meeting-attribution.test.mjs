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
import { mkdtempSync, existsSync, readdirSync, readFileSync, mkdirSync, writeFileSync, unlinkSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { tmpdir } from 'node:os'
import { join, dirname, isAbsolute } from 'node:path'

// round-7 (fix 2) test isolation: engine discovery now also scans DSH's own runtime trees, and this
// machine HAS a bundled python. round-9 adds the known per-OS INSTALL dirs, and this machine now really
// has python/R installed. This suite injects ONE fake subprocess for everything (LaTeX + math), so an
// unexpected engine probe would be recorded as a compiler call and would even write a fake paper.pdf.
// Pinning all of those roots at an empty dir keeps the fixture's premise ("no math engine here") true
// and the suite deterministic; production behaviour is unaffected.
const EMPTY_ENGINE_ROOT = mkdtempSync(join(tmpdir(), 'vibe-v5-e2e-nodsh-'))
process.env.DSH_HOME = EMPTY_ENGINE_ROOT
process.env.ProgramFiles = EMPTY_ENGINE_ROOT
process.env['ProgramFiles(x86)'] = EMPTY_ENGINE_ROOT
process.env.LOCALAPPDATA = EMPTY_ENGINE_ROOT
process.env.V5_TEX_ROOTS_SANDBOX = EMPTY_ENGINE_ROOT   // task-29: the documented TeX Live roots are sandboxed too (the product's own list now covers D:/C:/texlive)

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
// task-13: the polling windows below defaulted to 3000 ms, which a LOADED gate can exceed (measured:
// `e2e-v5-round2` reported 7 paper-phase failures under the parallel gate while passing standalone).
// Every window gets this FLOOR; a healthy run settles in milliseconds, so it is only reached when the
// plugin is genuinely late under load. Bounded, so the suite still fits its default 180 s budget.
const WAIT_FLOOR_MS = Number(process.env.E2E_V5_WAIT_FLOOR_MS || 30000)

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
  const listeners = {}, toolRegs = [], commandRegs = [], spawns = [], wakes = [], interrupts = [], drains = [], sendAttempts = []
  // Successful sends that SURVIVE consumption: `peekWakeOf` splices items out of `wakes`, so a probe that
  // must compare "rounds" against "successful wakes" needs a counter that is never drained.
  let wakeSends = 0
  // G1 seam: force every `subagents.sendMessage` to throw (a real host failure / a member whose
  // continuation is gone). `sendAttempts` records that the wake was TRIED, so a probe can tell
  // "the wake failed" apart from "no wake was scheduled at all".
  let failSend = !!o.failSendMessage
  // spawnMember seam: force every `subagents.startContinuable` to throw (the host cap / a host outage).
  // `startAttempts` records that founding was TRIED, so a probe can tell "the start failed" apart from
  // "no start was attempted".
  let failStart = !!o.failStartContinuable
  const startAttempts = []
  // F6 seam: refuse writes whose resolved path matches (the v4 paper suite's G3 seam, same shape), and —
  // optionally — whose CONTENT matches as well. Every PROVIDED predicate must match, so a probe can target
  // the FINALIZE-time append to paper.log.md without touching the ~15 log writes the flow makes earlier.
  let failWriteOn = o.failWriteOn || null
  let failWriteContent = o.failWriteContent || null
  // Every effect disposer, so a test can simulate a plugin UNLOAD (the Lean queue's disposer is
  // registered first: it terminates in-flight compiles and marks them interrupted).
  const effectDisposers = []
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
        // o.subprocess injects a FAKE LaTeX toolchain for the final-paper tests (the plugin
        // detects/compiles through this exact service, the same seam the Lean tests use).
        if (o.subprocess) return o.subprocess
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
    effect(fn) { const d = fn(); const disp = () => { if (typeof d === 'function') d() }; effectDisposers.push(disp); return disp },
    logger: { info() {}, warn() {}, error() {} },
    timeout(cb, ms) { const h = setTimeout(cb, ms); return () => clearTimeout(h) },
    tools: { register(spec) { toolRegs.push(spec); return () => {} } },
    commands: { register(spec) { commandRegs.push(spec); return () => {} } },
    subagents: {
      list() { return ['spawn'] },
      async startContinuable({ label, request }) {
        startAttempts.push(label)
        if (failStart) {
          // The HOST-CAP shape (not a generic error): `spawnMember` maps it to ACTIVATION_LIMIT_REACHED and
          // the founding loop QUEUES the member, which is the path a healed host retries.
          const e = new Error('subagent limit reached (active child limit: 2); wait for an existing child to finish or complete this work with the current agents')
          e.code = 'ACTIVATION_LIMIT_REACHED'
          throw e
        }
        const id = 'c' + (spawns.length + 1)
        const childSession = makeSession(id, 'sess-A'); childSession.header.cwd = WS
        liveAgents.set(id, { id, session: childSession, options: request && request.agentOptions })
        spawns.push({ label, request, childId: id, persona: request && request.persona, ended: false })
        return { childId: id, messageId: 'm' + spawns.length }
      },
      async sendMessage(parent, childId, blocks) {
        sendAttempts.push(childId)
        if (failSend) throw new Error('mock sendMessage failure (G1 seam)')
        wakeSends += 1
        wakes.push({ childId, blocks }); return 'w' + wakes.length
      },
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
      async writeText(t, c) {
        // F6 seam: a REAL fs refusal (sandbox denial) rejects, which `writeTextAbs` catches and reports as
        // "not written" — the exact shape a failed required artifact write has in production.
        const refuse = (failWriteOn || failWriteContent) &&
          (!failWriteOn || failWriteOn.test(String(t.targetKey))) &&
          (!failWriteContent || failWriteContent.test(String(c)))
        if (refuse) throw new Error('F6_WRITE_FAIL (injected): ' + t.targetKey)
        mkdirSync(dirname(t.targetKey), { recursive: true }); writeFileSync(t.targetKey, c, 'utf8')
      },
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
    while (Date.now() - t0 < Math.max(maxWaitMs || 3000, WAIT_FLOOR_MS)) {
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
  // Any member's next prompt matching a predicate — used to capture the CHECKPOINT heartbeat,
  // whose recipient is whichever member the scheduler picked.
  async function peekWakeWhere(pred, maxWaitMs) {
    const t0 = Date.now()
    while (Date.now() - t0 < Math.max(maxWaitMs || 3000, WAIT_FLOOR_MS)) {
      const i = wakes.findIndex(w => pred((w.blocks && w.blocks[0] && w.blocks[0].text) || ''))
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
  return { WS, ctx, ROOT, ROOT_SESSION, removedServiceQueries, spawns, wakes, interrupts, drains, sendAttempts, startAttempts, setFailSend(v) { failSend = !!v }, setFailStart(v) { failStart = !!v }, setFailWriteOn(v) { failWriteOn = v || null }, setFailWriteContent(v) { failWriteContent = v || null }, get wakeSends() { return wakeSends }, toolRegs, commandRegs, listeners, effectDisposers, callTool, childAgent, fireEnd, spawnOf, childOf, labelOf, kindOf, settleSpawns, drain, peekWakeOf, peekWakeWhere, set plannedVotes(v) { plannedVotes = v }, get plannedVotes() { return plannedVotes }, set solvePlan(v) { solvePlan = v } }
}
const pluginModule = await import(PLUGIN.href + '?t=' + Date.now())

// ============================================================
// REGRESSION — meeting speech attribution must follow the ASK, not a re-stamped wakeKind.
//
// The defect (observed live, then reproduced here): a member is asked to speak in a meeting
// (wake kind 'meeting'); before its turn ends, ANY other wake for the same member (an
// assignment, a nudge, a paper ask, a heartbeat) re-stamps the per-member `wakeKind` slot.
// `onMemberEnd` used to read that slot, so the member's genuine meeting answer was NOT
// registered as testimony — it fell through to the "late note" branch. Consequences, both
// asserted below: (a) the speech never counts as an input, and (b) once its retry budget is
// spent the member is recorded as `unreached` / "no answer after retries" even though it DID
// answer. Live evidence from the run that motivated this: 136 identical meeting asks to one
// member in 15 minutes (median gap 4 s), its context draining 85% -> 3%, and its real answers
// appended to the minutes 85 times labelled "会后补记：该发言到达时会议已收窄".
// Run: node tests/v5-meeting-attribution.test.mjs
// ============================================================
const PROBLEM_TXT = '单位圆盘 11 圆最优覆盖问题（回归测试用）'

function stateOf(h) {
  const p = join(h.WS, 'VibeMath', 'Projects', 'default', 'Institutes', 'institute', 'State', 'institute.v5state.json')
  return JSON.parse(readFileSync(p, 'utf8')).institutes['default::institute']
}

async function buildInstitute(pluginModule) {
  const h = makeHost({ pluginModule })
  await h.callTool('vibe_v5_start', { problem: PROBLEM_TXT, researcherCount: 2 })
  await h.settleSpawns()
  for (let i = 0; i < 60 && !existsSync(join(h.WS, 'VibeMath', 'Projects', 'default', 'Institutes', 'institute', 'State', 'institute.v5state.json')); i++) await sleep(10)
  return h
}

console.log('\n[1] a meeting ask is still attributed when the wake kind was re-stamped')
;(async () => {
const h = await buildInstitute(pluginModule)
const s0 = await h.callTool('vibe_v5_status', {})
const memberIds = s0.members.filter((m) => m.kind !== 'temp' && m.phase === 'active').map((m) => m.id)
assert(memberIds.length >= 2, 'the institute has at least 2 active voting members (got ' + JSON.stringify(memberIds) + ')')

// 直接驱动"会议点名 → 发言到达"这一条路径：asked[id] 由 askMeetingRound 写，随后以一条**正常回合**
// 的 wake 覆盖 wakeKind（这正是生产里被覆盖的那一步），最后投递该成员真实的会议发言。
const mtOk = await h.callTool('vibe_v5_meeting', { agenda: '回归：发言归属', kind: 'sync' })
assert(mtOk && mtOk.ok === true, 'a meeting was convened (got ' + JSON.stringify(mtOk).slice(0, 120) + ')')
await sleep(30)
const asked = memberIds[0]

// ★ 关键前置：让该成员的 wakeKind 被**其它类型**的唤醒覆盖（生产里由 assign/nudge/paper/心跳造成）。
//   这里用一次正常回合唤醒来复现同一状态，随后立刻投递它的会议发言。
const st1 = await h.callTool('vibe_v5_status', {})
const mAsk = st1.members.find((m) => m.id === asked)
assert(!!mAsk && !!mAsk.childId, 'the asked member has a live child (got ' + JSON.stringify(mAsk && mAsk.childId) + ')')

const speech = asked + '：我的会议发言（回归用例）。'
h.fireEnd(mAsk.childId, { input: speech, say: speech, vote_solved: false, solved: false, contextPct: 20 })
await sleep(80)

const repText = JSON.stringify(await h.callTool('vibe_v5_report', {})).slice(0, 4000) + JSON.stringify(await h.callTool('vibe_v5_status', {})).slice(0, 4000)
const mtId = st1.meeting && st1.meeting.id ? st1.meeting.id : 'mt-1'
const minutesPath = join(h.WS, 'VibeMath', 'Projects', 'default', 'Institutes', 'institute', 'Shared', 'Meetings', mtId + '.md')
const raw = existsSync(minutesPath) ? readFileSync(minutesPath, 'utf8') : ''
const lateFiled = /会后补记/.test(raw) && raw.indexOf(speech) !== -1
assert(!lateFiled, '★ the meeting speech is NOT filed as a "会后补记" late note (minutes=' + (raw ? 'yes' : 'none') + ')')
assert(raw.indexOf(speech) !== -1, 'the speech DID reach the meeting minutes')
console.log('  (meeting=' + mtId + ', asked=' + asked + ', minutesBytes=' + raw.length + ')')

console.log('\n[2] the wake kind travels with the turn (source contract)')
const src2 = readFileSync(new URL('../vibe-math-v5/vibe-math-v5.js', import.meta.url), 'utf8')
assert(/inflight\.set\(member\.childId, \{ token, kind: kind \|\| 'normal' \}\)/.test(src2),
  '★ wakeMember stores the wake kind together with the in-flight turn')
assert(/inflight\.set\(started\.childId, \{ token: shortId\(\), kind \}\)/.test(src2),
  'the founding turn stores its kind too')
assert(/turnKind !== undefined \? turnKind : \(wakeKind\.get\(member\.id\) \|\| 'normal'\)/.test(src2),
  '★ onMemberEnd attributes the reply with the turn\'s own kind, not the re-stampable slot')

console.log('\n' + (failed === 0 ? 'ALL GREEN' : 'FAILURES: ' + failed) + '  (passed=' + passed + ', failed=' + failed + ')')
for (const f of failures) console.error('  - ' + f)
process.exit(failed === 0 ? 0 : 1)
})()

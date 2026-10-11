// ============================================================
// ACCEPT-C — 独立验收（verifier-c）：孤儿任务派发 / 上限 / 既有分支不变
//
// 被测文件（只读，冻结）：vibe-math-v5/vibe-math-v5.js
// 对照组：`git show HEAD:vibe-math-v5/vibe-math-v5.js` 写到系统临时目录，并把同目录的
//         math-computation.js / math-engines.js 一起复制过去（vibe-math-v5.js 里有
//         `import ... from './math-computation.js'`），临时目录放一个 {"type":"module"}
//         的 package.json。仓库里的原文件绝不被改动（不 stash / 不 checkout）。
//
// 断言：
//   C1 无主 pending 任务被派给某位**空闲**成员，且这一轮提示文本里出现任务标题；
//   C2 已认领(in_progress)任务的主人不变、没有被抢占，其主人节奏与改动前一致；
//   C3 同一无主任务"派发但不完成"，达到 orphanDispatchMaxAttempts（缺省 3）后停止，
//      并留下一条可见记录（notice 走 inst().messages，to==='office'）；
//   C4 全所没有无主 pending 任务时，调度行为与改动前逐分支一致（含确定性对照）。
//
// Run: node tests/accept-c-orphan.test.mjs
// 输出同时逐行写入 tests/_accept-out/c.txt（真实原始输出）。
// ============================================================
import { mkdtempSync, existsSync, readdirSync, readFileSync, mkdirSync, writeFileSync, copyFileSync, openSync, closeSync, statSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join, dirname, isAbsolute } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

// ---- output tee (逐字保存真实运行输出；任何一行都立即落盘) -------------------
const REPO = fileURLToPath(new URL('..', import.meta.url))
const OUT_PATH = join(REPO, 'tests', '_accept-out', 'c.txt')
try { mkdirSync(dirname(OUT_PATH), { recursive: true }) } catch (e) { /* the dir may already exist */ }
const outLines = []
let outWriteOk = true
let outWriteErr = ''
function log(s) {
  const t = String(s)
  outLines.push(t)
  console.log(t)
  try { writeFileSync(OUT_PATH, outLines.join('\n') + '\n', 'utf8') } catch (e) {
    outWriteOk = false
    outWriteErr = String((e && e.message) || e)
  }
}
let passed = 0, failed = 0
const failures = []
function assert(c, m) {
  if (c) { passed++; log('  ok - ' + m) } else { failed++; failures.push(m); log('  FAIL - ' + m) }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// round-7/9 isolation copied from tests/e2e-v5-round2.test.mjs: a real engine probe would be
// recorded as a compiler call. Pin every discovery root at an empty dir BEFORE importing.
const EMPTY_ENGINE_ROOT = mkdtempSync(join(tmpdir(), 'vibe-acc-c-nodsh-'))
process.env.DSH_HOME = EMPTY_ENGINE_ROOT
process.env.ProgramFiles = EMPTY_ENGINE_ROOT
process.env['ProgramFiles(x86)'] = EMPTY_ENGINE_ROOT
process.env.LOCALAPPDATA = EMPTY_ENGINE_ROOT
process.env.V5_TEX_ROOTS_SANDBOX = EMPTY_ENGINE_ROOT

// ============================================================
// host factory — copied from tests/e2e-v5-round2.test.mjs (makeHost, lines 60-294) and extended
// with a MANUAL TIMER mode (`manualTimers`) so the scheduler's cadence is released by the test
// instead of by the wall clock. Every other shape (childOf/labelOf/fireEnd/kindOf/drain/
// peekWakeOf/peekWakeWhere/settleSpawns) is the same code.
// ============================================================
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
  const WS = o.ws || mkdtempSync(join(tmpdir(), 'vibe-acc-c-'))
  const listeners = {}, toolRegs = [], commandRegs = [], spawns = [], wakes = [], interrupts = [], drains = [], sendAttempts = []
  let wakeSends = 0
  // verifier-c addition 1: every successful send, in ORDER, never drained.
  const wakeLog = []
  // verifier-c addition 2: manual timer queue (ctx.timeout). With manualTimers the test decides
  // when the heartbeat/digest fires, so the trace is deterministic; no other code path changes.
  const manualTimers = !!o.manualTimers
  const timers = []
  let timerSeq = 0
  const startAttempts = []
  let failSend = !!o.failSendMessage
  let failStart = !!o.failStartContinuable
  let failWriteOn = o.failWriteOn || null
  let failWriteContent = o.failWriteContent || null
  const effectDisposers = []
  const liveAgents = new Map()
  const removedServiceQueries = []

  const ctx = {
    get(name) {
      if (name === 'sessions' || name === 'sessionProjections') removedServiceQueries.push(name)
      if (name === 'sandboxPolicy') return undefined
      if (name === 'compaction') return o.compaction
      if (name === 'subprocess') {
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
    timeout(cb, ms) {
      if (manualTimers) {
        const t = { cb, ms: Number(ms) || 0, seq: timerSeq++ }
        timers.push(t)
        return () => { const i = timers.indexOf(t); if (i !== -1) timers.splice(i, 1) }
      }
      const h = setTimeout(cb, ms); return () => clearTimeout(h)
    },
    tools: { register(spec) { toolRegs.push(spec); return () => {} } },
    commands: { register(spec) { commandRegs.push(spec); return () => {} } },
    subagents: {
      list() { return ['spawn'] },
      async startContinuable({ label, request }) {
        startAttempts.push(label)
        if (failStart) {
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
        const text = (blocks && blocks[0] && blocks[0].text) || ''
        wakeLog.push({ seq: wakeSends, childId, text })
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

  async function callToolRawPolicy(name, args, agent) {
    const spec = toolRegs.find(x => x.name === name)
    if (!spec) throw new Error('no tool ' + name)
    // Explicitly acquire methods; current and historical business controls stay comparable.
    const help = toolRegs.find(x => x.name === 'vibe_v5_tool_help')
    if (help && name !== 'vibe_v5_tool_help') await help.execute({ tool: name }, { agent: agent || ROOT })
    return JSON.parse(await spec.execute(args || {}, { agent: agent || ROOT }))
  }
  const callTool = callToolRawPolicy
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
  /** Pull the next queued wake for one member and return its prompt text. */
  async function peekWakeOf(member, maxWaitMs) {
    const t0 = Date.now()
    while (Date.now() - t0 < Math.max(maxWaitMs || 3000, 3000)) {
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
  async function peekWakeWhere(pred, maxWaitMs) {
    const t0 = Date.now()
    while (Date.now() - t0 < Math.max(maxWaitMs || 3000, 3000)) {
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
  // verifier-c additions -----------------------------------------------------
  /** Take every queued wake (drained), with its prompt text. */
  function takeWakes() {
    return wakes.splice(0, wakes.length).map((w) => ({ childId: w.childId, text: (w.blocks && w.blocks[0] && w.blocks[0].text) || '' }))
  }
  /** Release exactly ONE pending manual timer (earliest due), like the wall clock would. */
  function tickOne() {
    if (!timers.length) return null
    timers.sort((a, b) => (a.ms - b.ms) || (a.seq - b.seq))
    const t = timers.shift()
    try { t.cb() } catch (e) { console.error('manual timer threw: ' + String((e && e.message) || e)) }
    return { ms: t.ms, seq: t.seq }
  }
  const timerCount = () => timers.length
  return {
    WS, ctx, ROOT, ROOT_SESSION, removedServiceQueries, spawns, wakes, interrupts, drains, sendAttempts, startAttempts,
    setFailSend(v) { failSend = !!v }, setFailStart(v) { failStart = !!v }, setFailWriteOn(v) { failWriteOn = v || null }, setFailWriteContent(v) { failWriteContent = v || null },
    get wakeSends() { return wakeSends }, get wakeLog() { return wakeLog },
    toolRegs, commandRegs, listeners, effectDisposers, callTool, childAgent, fireEnd, spawnOf, childOf, labelOf, kindOf,
    settleSpawns, drain, peekWakeOf, peekWakeWhere, takeWakes, tickOne, timerCount, manualTimers,
    set plannedVotes(v) { plannedVotes = v }, get plannedVotes() { return plannedVotes }, set solvePlan(v) { solvePlan = v },
  }
}

// ============================================================
// baseline (HEAD) extraction -> temp dir. NO pipe is used to capture git's stdout: the child
// writes straight into a FILE descriptor (piped stdio is refused by the Windows sandbox).
// ============================================================
function gitToFile(args, outPath) {
  const fd = openSync(outPath, 'w')
  try {
    const r = spawnSync('git', args, { cwd: REPO, stdio: ['ignore', fd, 'inherit'] })
    return { status: r.status, error: r.error ? String(r.error.message || r.error) : '' }
  } finally { closeSync(fd) }
}

function extractHeadBaseline() {
  const srcDir = join(REPO, 'vibe-math-v5')
  const dir = mkdtempSync(join(tmpdir(), 'v5head-acc-c-'))
  for (const f of ['math-computation.js', 'math-engines.js']) copyFileSync(join(srcDir, f), join(dir, f))
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ type: 'module' }) + '\n', 'utf8')
  const target = join(dir, 'vibe-math-v5.js')
  const r = gitToFile(['show', 'HEAD:vibe-math-v5/vibe-math-v5.js'], target)
  const info = { dir, target, gitStatus: r.status, gitError: r.error, bytes: existsSync(target) ? statSync(target).size : 0 }
  // the temp copy must be the honest HEAD blob (syntax-checked by the caller)
  return info
}

function sha256File(p) { return createHash('sha256').update(readFileSync(p)).digest('hex') }

// ============================================================
// small helpers for the probe
// ============================================================
const KIND_OF = (p) => /【入职首轮/.test(p) ? 'initial' : /【研究所会议/.test(p) ? 'meeting' : /【求真表决/.test(p) ? 'verify' : /【心跳检查/.test(p) ? 'checkpoint' : 'normal'
const BRANCH_OF = (p) => /【待认领任务/.test(p) ? 'a.2-orphan' : KIND_OF(p)

const BENIGN = { progress: '继续推进（本轮不认领也不完成）。', solved: false, contextPct: 10 }
const PROBLEM = '证明素数有无穷多个'
// idleMs = activityTimeoutMs. It MUST be comfortably longer than the time it takes the harness to
// answer a whole wave of wakes (~10 ms per wake): otherwise the "reply drives one more pass" chain
// finds an eligible member before the wave is finished and the heartbeat never goes quiet — which
// is exactly what makes an uncontrolled comparison meaningless. 250 ms gives a wide margin, and
// ROUND_GAP > idleMs guarantees every round starts from an all-idle, all-eligible roster.
const IDLE_MS = 300
const ROUND_GAP = 380
const ORPHAN_SUBJECT = 'ORPHAN-C1 清理未归档引理清单'
const ORPHAN_DESC = '把散落在 Progress/ 里没归档的引理整理成清单。'
const ORPHAN_ACC = '清单文件存在且每行一条。'
const CLAIMED_SUBJECT = 'CLAIMED-C2 复核引理编号连续性'
const CLAIMED_ACC = '给出编号断点清单。'

/** Records + answers wakes; every answer is a benign progress reply (never task_claim/complete). */
function makeRig(h) {
  const rig = { trace: [], byBranch: {}, byMemberBranch: {} }
  rig.classify = (text) => BRANCH_OF(text)
  rig.record = (w, phase, round) => {
    const t = w.text || ''
    const e = {
      phase, round,
      member: h.labelOf(w.childId), childId: w.childId,
      branch: rig.classify(t),
      kind: KIND_OF(t),
      firstLine: String(t.split('\n')[0] || '').slice(0, 140),
      text: t,
    }
    rig.trace.push(e)
    rig.byBranch[e.branch] = (rig.byBranch[e.branch] || 0) + 1
    const k = e.member + '/' + e.branch
    rig.byMemberBranch[k] = (rig.byMemberBranch[k] || 0) + 1
    return e
  }
  rig.pump = async (phase, round, maxIter, answer) => {
    const cap = maxIter || 40
    let quiet = 0
    for (let i = 0; i < cap; i++) {
      await sleep(5)
      const ws = h.takeWakes()
      if (!ws.length) { quiet += 1; if (quiet >= 3) return; continue }
      quiet = 0
      for (const w of ws) {
        rig.record(w, phase, round)
        if (answer !== false) { h.fireEnd(w.childId, BENIGN); await sleep(4) }
      }
    }
  }
  rig.count = (branch) => rig.trace.filter((e) => e.branch === branch).length
  rig.memberBranch = (m, b) => rig.trace.filter((e) => e.member === m && e.branch === b).length
  rig.reset = () => { rig.trace.length = 0 }
  return rig
}

function findFiles(root, suffix, depth) {
  const out = []
  const walk = (d, lvl) => {
    if (lvl > (depth || 8)) return
    let ents = []
    try { ents = readdirSync(d, { withFileTypes: true }) } catch (e) { return }
    for (const e of ents) {
      const p = join(d, e.name)
      if (e.isDirectory()) walk(p, lvl + 1)
      else if (e.name.endsWith(suffix)) out.push(p)
    }
  }
  walk(root, 0)
  return out
}

/** Shape-agnostic walk of the persisted state: collect every object matching pred. */
function walkCollect(node, pred, acc, depth) {
  const a = acc || []
  if (depth > 30) return a
  if (Array.isArray(node)) { for (const v of node) walkCollect(v, pred, a, (depth || 0) + 1); return a }
  if (node && typeof node === 'object') {
    if (pred(node)) a.push(node)
    for (const k of Object.keys(node)) walkCollect(node[k], pred, a, (depth || 0) + 1)
  }
  return a
}

const pickTask = (board, id) => (board.tasks || []).find((t) => t.id === id)

// ============================================================
// scenario A (C1/C2/C3): 3 idle permanent members + 1 orphan pending task + 1 claimed in_progress task
// ============================================================
async function runOrphanScenario(mod, tag, opts) {
  const o = opts || {}
  const maxAttempts = o.max === undefined ? 3 : o.max
  const h = makeHost({ pluginModule: mod, manualTimers: true })
  const rig = makeRig(h)
  const out = { tag, manual: h.manualTimers, trace: rig.trace, rounds: [], maxAttempts }

  out.start = await h.callTool('vibe_v5_start', { problem: PROBLEM, researcherCount: 2 })
  out.set = await h.callTool('vibe_v5_set', {
    activityTimeoutMs: IDLE_MS, maxParallel: 3, chatDigestMs: 3600000, stallAutoMeetingMs: 86400000,
    orphanDispatchMaxAttempts: maxAttempts,
  })
  await h.settleSpawns()
  await rig.pump('setup', -1, 40)
  out.members = (await h.callTool('vibe_v5_members', {})).members.map((m) => m.id + ':' + m.phase)
  out.idleAtStart = (await h.callTool('vibe_v5_status', {})).members.filter((m) => !m.busy).map((m) => m.id)

  const tc = await h.callTool('vibe_v5_task_create', { subject: ORPHAN_SUBJECT, description: ORPHAN_DESC, acceptance: ORPHAN_ACC })
  const as = await h.callTool('vibe_v5_assign', { to: 'r-2', subject: CLAIMED_SUBJECT, why: '复核编号', acceptance: CLAIMED_ACC })
  out.orphanTaskId = tc.task && tc.task.id
  out.claimedTaskId = as.task && as.task.id
  await rig.pump('fixture', -1, 40)

  const b0 = await h.callTool('vibe_v5_task_list', {})
  out.orphan0 = pickTask(b0, out.orphanTaskId)
  out.claimed0 = pickTask(b0, out.claimedTaskId)

  // ---- rounds: sleep past idleMs, release ONE timer (one scheduling pass), settle + record ----
  const busyBeforeByRound = {}
  const mainRounds = o.rounds === undefined ? 10 : o.rounds
  for (let i = 0; i < mainRounds; i++) {
    await sleep(ROUND_GAP)
    const st = await h.callTool('vibe_v5_status', {})
    busyBeforeByRound[i] = st.members.filter((m) => m.busy).map((m) => m.id)
    const ticked = h.tickOne()
    await sleep(6)
    const n0 = rig.trace.length
    await rig.pump('round' + i, i, 40)
    const fresh = rig.trace.slice(n0)
    const board = await h.callTool('vibe_v5_task_list', {})
    out.rounds.push({
      round: i, ticked: !!ticked, busyBefore: busyBeforeByRound[i],
      wakes: fresh.map((e) => e.member + '/' + e.branch),
      orphan: pickTask(board, out.orphanTaskId),
      claimed: pickTask(board, out.claimedTaskId),
    })
  }
  out.orphansAfterRounds = rig.count('a.2-orphan')

  // ---- post-exhaustion: keep driving passes with idle-eligible members -------------------------
  for (let i = 0; i < 6; i++) {
    await sleep(ROUND_GAP)
    h.tickOne()
    await sleep(6)
    await rig.pump('post' + i, 100 + i, 40)
  }
  out.orphansAfterPost = rig.count('a.2-orphan')

  const boardEnd = await h.callTool('vibe_v5_task_list', {})
  out.orphanEnd = pickTask(boardEnd, out.orphanTaskId)
  out.claimedEnd = pickTask(boardEnd, out.claimedTaskId)

  // ---- the visible record: officeRequests (status) + the durable state file -------------------
  const stBefore = await h.callTool('vibe_v5_status', {})
  out.statusParams = stBefore.params || {}
  out.officeRequestsBefore = stBefore.officeRequests
  out.officeRequestsShown = stBefore.officeRequestsShown
  out.sayOfficeRes = await h.callTool('vibe_v5_say', { to: 'office', text: 'CONTROL-CHANNEL-C 成员向所办留言（对照：这条通道是好的）' }, h.childAgent(h.childOf('r-1')))
  await rig.pump('say-office', -1, 20)
  const stAfter = await h.callTool('vibe_v5_status', {})
  out.officeRequestsAfter = stAfter.officeRequests

  out.stateFiles = findFiles(h.WS, '.v5state.json', 8)
  out.stateOffice = []
  if (out.stateFiles.length) {
    try {
      const parsed = JSON.parse(readFileSync(out.stateFiles[0], 'utf8'))
      out.stateOffice = walkCollect(parsed, (o) => o && o.to === 'office', []).map((m) => ({ id: m.id, from: m.from, kind: m.kind, text: String(m.text || '').slice(0, 300) }))
    } catch (e) { out.stateError = String((e && e.message) || e) }
  }
  // 可见记录：调度级事件走群聊镜像 Shared/Chat/<day>.md（saveChatLine），不是 inst().messages。
  out.chatFiles = findFiles(h.WS, '.md', 12).filter((p) => /[\\/]Shared[\\/]Chat[\\/]/.test(p))
  out.chatRaw = out.chatFiles.map((p) => ({ file: String(p).replace(h.WS, '<WS>'), text: readFileSync(p, 'utf8') }))
  out.chatStopLines = []
  for (const f of out.chatRaw) {
    for (const line of f.text.split('\n')) {
      if (line.indexOf(out.orphanTaskId) !== -1) out.chatStopLines.push({ file: f.file, line })
    }
  }
  out.chatAllLines = out.chatRaw.reduce((n, f) => n + f.text.split('\n').filter((l) => l.trim()).length, 0)

  out.byBranch = rig.byBranch
  out.byMemberBranch = rig.byMemberBranch
  out.wakeSends = h.wakeSends
  out.debug = (await h.callTool('vibe_v5_status', {})).debug
  out.orphanDispatches = rig.trace.filter((e) => e.branch === 'a.2-orphan')
  return out
}

// ============================================================
// scenario B (C4): NO unowned pending task at all.
// Why the rounds are built the way they are: a scheduling pass can be compared across two plugin
// copies ONLY if every wake it sends is pinned by STRUCTURE rather than by a tie-break on
// `lastActiveAt`. branch (e) picks `candidates.sort(lastActiveAt)[0]`, so a round in which two
// members are equally idle would let session-memory ordering decide who is woken — that variance
// exists in the unmodified file too (measured: two HEAD runs disagreed) and would make the whole
// comparison vacuous. Each pinned round therefore keeps exactly ONE member that branch (e) can pick:
//   · branch (a)  — the owned in_progress task pins r-2 (roster/task order, and branch (a) runs first);
//   · branch (b)  — an URGENT office message addressed to acad pins acad, and it has NO idle gate;
//   · branch (e)  — acad was just woken by (b) so it is the newest, leaving r-1 as `candidates[0]`.
// branch (c) gets its own pinned round (the chat is due and only acad/r-1 hold it), branch (d) its own
// tail round. Every wake is then a function of the code, not of the wall clock.
// ============================================================
async function runNoOrphanScenario(mod, tag) {
  const h = makeHost({ pluginModule: mod, manualTimers: true })
  const rig = makeRig(h)
  const out = { tag }

  out.start = await h.callTool('vibe_v5_start', { problem: PROBLEM, researcherCount: 2 })
  out.set = await h.callTool('vibe_v5_set', {
    activityTimeoutMs: IDLE_MS, maxParallel: 3, chatDigestMs: 60, stallAutoMeetingMs: 86400000,
  })
  await h.settleSpawns()
  await rig.pump('setup', -1, 40)

  // ---- fixture: ONE owned in_progress task; the board has no unowned pending task at all --------
  const as = await h.callTool('vibe_v5_assign', { to: 'r-2', subject: CLAIMED_SUBJECT, why: '复核编号', acceptance: CLAIMED_ACC })
  out.ownedTaskId = as.task && as.task.id
  await rig.pump('fixture', -1, 40)
  const board = await h.callTool('vibe_v5_task_list', {})
  out.board = (board.tasks || []).map((t) => t.id + ':' + t.status + ':' + (t.ownerId || '-'))
  out.unownedPending = (board.tasks || []).filter((t) => t.status === 'pending' && !t.ownerId).length

  // ---- canonicalise (NOT compared): wait past idleMs, one pass, settle, then start the trace ----
  await sleep(ROUND_GAP)
  h.tickOne()
  await sleep(6)
  await rig.pump('canon', -1, 40)
  out.canonWakes = rig.trace.map((e) => e.member + '/' + e.branch)
  rig.reset()

  // ---- pinned rounds: (a) owned task -> (b) urgent mail -> (e) heartbeat ------------------------
  out.rounds = []
  for (let i = 0; i < 4; i++) {
    out['msg' + i] = await h.callTool('vibe_v5_message', { to: 'acad', content: 'URGENT-C4-R' + i })
    await sleep(8)
    const n0 = rig.trace.length
    await rig.pump('round' + i, i, 40)
    out.rounds.push({ round: i, kind: 'a+b+e', wakes: rig.trace.slice(n0).map((e) => e.member + '/' + e.branch) })
    await sleep(ROUND_GAP)
  }
  // ---- pinned round: (c) chat digest (only acad + r-1 hold the chat) ---------------------------
  out.say = await h.callTool('vibe_v5_say', { text: 'CHAT-C4 群聊一句话' }, h.childAgent(h.childOf('r-2')))
  await sleep(8)
  await rig.pump('round4-chat-published', 4, 40)
  await sleep(ROUND_GAP)
  h.tickOne()
  await sleep(8)
  const n4 = rig.trace.length
  await rig.pump('round4', 4, 40)
  out.rounds.push({ round: 4, kind: 'a+c', wakes: rig.trace.slice(n4).map((e) => e.member + '/' + e.branch) })

  out.preStall = rig.trace.map((e) => e.phase + '|' + e.round + '|' + e.member + '|' + e.branch)
  out.preStallCounts = Object.assign({}, rig.byBranch)

  // ---- branch (d): make the institute genuinely idle, then let it stall ------------------------
  const b2 = await h.callTool('vibe_v5_task_list', {})
  const owned = pickTask(b2, out.ownedTaskId)
  out.complete = await h.callTool('vibe_v5_task_update', { task_id: owned.id, expected_revision: owned.revision, action: 'complete' })
  await rig.pump('fixture-complete', -1, 40)
  await h.callTool('vibe_v5_set', { stallAutoMeetingMs: 40 })
  await sleep(ROUND_GAP)
  const n1 = rig.trace.length
  // several ticks in a row: the earliest pending timer may be a no-op digest pass, so the stall
  // meeting is reached on whichever tick really runs a pass with an idle room.
  let stallTicks = 0
  for (let k = 0; k < 6; k++) {
    h.tickOne()
    await sleep(10)
    stallTicks = k + 1
    if (h.wakes.length) break   // NOTE: check the raw queue — do not drain it here
  }
  await rig.pump('stall', -2, 6, false) // record only: do NOT answer the meeting wake
  out.stallTicks = stallTicks
  // NOTE: `beginMeeting` SHUFFLES `meeting.order` with Math.random() on purpose
  // ("Rotate who speaks first: with a fixed order the same member always speaks before it can see
  // the others"), so the meeting wakes are compared as a SET, never as a sequence.
  out.stallSet = rig.trace.slice(n1).map((e) => e.member + '/' + e.branch).sort()
  out.stallWakes = rig.trace.slice(n1).map((e) => e.member + '/' + e.branch + ' :: ' + e.firstLine)
  out.stallTrace = rig.trace.slice(n1)

  out.byBranch = rig.byBranch
  out.byMemberBranch = rig.byMemberBranch
  out.trace = rig.trace.map((e) => ({ phase: e.phase, round: e.round, member: e.member, branch: e.branch }))
  out.traceLines = rig.trace.map((e) => e.phase + ':' + e.member + '/' + e.branch)
  out.wakeSends = h.wakeSends
  out.debug = (await h.callTool('vibe_v5_status', {})).debug
  out.orphanWakes = rig.count('a.2-orphan')
  return out
}

const traceKey = (t) => t.map((e) => e.member + '/' + e.branch).join(' > ')

// ============================================================
// MAIN
// ============================================================
log('============================================================')
log('ACCEPT-C (verifier-c) — 孤儿任务派发独立验收')
log('时间: ' + new Date().toISOString())
log('cwd: ' + process.cwd())
log('repo: ' + REPO)

const HEAD_SPEC = 'HEAD:vibe-math-v5/vibe-math-v5.js'
const NEW_PATH = process.env.V5_PLUGIN ? String(process.env.V5_PLUGIN) : join(REPO, 'vibe-math-v5', 'vibe-math-v5.js')

const revTmp = join(mkdtempSync(join(tmpdir(), 'v5rev-')), 'rev.txt')
gitToFile(['rev-parse', 'HEAD'], revTmp)
const headRev = existsSync(revTmp) ? readFileSync(revTmp, 'utf8').trim() : '(unknown)'
const statusTmp = join(dirname(revTmp), 'status.txt')
gitToFile(['status', '--porcelain', '--', 'vibe-math-v5/vibe-math-v5.js'], statusTmp)
const gitStatusLine = existsSync(statusTmp) ? readFileSync(statusTmp, 'utf8').trim() : ''

log('HEAD = ' + headRev)
log('（注：stderr 与 stdout 在本文件中可能交错。形如 "vibe-math-v5: 忽略未知参数键…orphanDispatchMaxAttempts（来源：set）"')
log('  的一行来自**对照组 HEAD** 的 set 调用——HEAD 不认识这个新参数，这正是对照组的预期；被测文件不会打印它。）')
log('被测文件 = ' + NEW_PATH)
const HASH_AT_START = sha256File(NEW_PATH)
log('被测文件 size = ' + statSync(NEW_PATH).size + '  sha256 = ' + HASH_AT_START)
log('git status --porcelain -- 被测文件: ' + JSON.stringify(gitStatusLine))
log('')

const headInfo = extractHeadBaseline()
log('对照组(HEAD) 提取: dir=' + headInfo.dir)
log('  git status=' + headInfo.gitStatus + ' error=' + JSON.stringify(headInfo.gitError) + ' bytes=' + headInfo.bytes)
log('  对照组 sha256 = ' + (headInfo.bytes ? sha256File(headInfo.target) : '(missing)'))
const checkHead = spawnSync(process.execPath, ['--check', headInfo.target], { stdio: ['ignore', 'inherit', 'inherit'] })
log('  node --check 对照组 = exit ' + checkHead.status)
const checkNew = spawnSync(process.execPath, ['--check', NEW_PATH], { stdio: ['ignore', 'inherit', 'inherit'] })
log('  node --check 被测文件 = exit ' + checkNew.status)
log('')

const NEW_URL = pathToFileURL(NEW_PATH)
const modNew = await import(NEW_URL.href + '?accept=c&t=' + Date.now())
const modHead = await import(pathToFileURL(headInfo.target).href + '?accept=c&t=' + Date.now())
log('import: 被测 apply=' + typeof modNew.apply + ' / 对照 apply=' + typeof modHead.apply)
log('')

// ------------------------------------------------------------
log('============================================================')
log('[C1-C3] 场景 A：3 名常驻成员 + 1 条无主 pending 任务 + 1 条已认领 in_progress 任务')
log('============================================================')
const A_NEW = await runOrphanScenario(modNew, 'new')
const A_HEAD = await runOrphanScenario(modHead, 'head')

for (const A of [A_NEW, A_HEAD]) {
  const verbose = A.tag === 'new'
  log('-- 运行 [' + A.tag + '] --')
  log('  成员: ' + JSON.stringify(A.members) + '  空闲: ' + JSON.stringify(A.idleAtStart))
  log('  参数: ' + JSON.stringify({ activityTimeoutMs: A.set.params.activityTimeoutMs, maxParallel: A.set.params.maxParallel, chatDigestMs: A.set.params.chatDigestMs, stallAutoMeetingMs: A.set.params.stallAutoMeetingMs, orphanDispatchMaxAttempts: (A.set.params || {}).orphanDispatchMaxAttempts, verifyAskMaxAttempts: (A.set.params || {}).verifyAskMaxAttempts }) + '  status.params={orphanDispatchMaxAttempts:' + JSON.stringify((A.statusParams || {}).orphanDispatchMaxAttempts) + ',verifyAskMaxAttempts:' + JSON.stringify((A.statusParams || {}).verifyAskMaxAttempts) + '}')
  log('  无主任务 ' + A.orphanTaskId + ' 起点: ' + JSON.stringify({ status: A.orphan0.status, ownerId: A.orphan0.ownerId, revision: A.orphan0.revision }) +
    ' → 终点: ' + JSON.stringify({ status: A.orphanEnd.status, ownerId: A.orphanEnd.ownerId, revision: A.orphanEnd.revision }))
  log('  已认领任务 ' + A.claimedTaskId + ' 起点: ' + JSON.stringify({ status: A.claimed0.status, ownerId: A.claimed0.ownerId, revision: A.claimed0.revision }) +
    ' → 终点: ' + JSON.stringify({ status: A.claimedEnd.status, ownerId: A.claimedEnd.ownerId, revision: A.claimedEnd.revision }))
  log('  逐轮唤醒/状态 = ' + A.rounds.map((r) => 'r' + r.round + '[' + r.wakes.join(',') + '|o:' + r.orphan.status + '|c:' + r.claimed.status + '/' + r.claimed.ownerId + ']').join(' '))
  log('  派发总数(主 10 轮) = ' + A.orphansAfterRounds + '；再跑 6 轮后 = ' + A.orphansAfterPost)
  log('  分支计数 = ' + JSON.stringify(A.byBranch))
  log('  成员/分支 = ' + JSON.stringify(A.byMemberBranch))
  log('  成功唤醒总数 = ' + A.wakeSends + '  debug=' + JSON.stringify(A.debug))
  log('  status.officeRequests(停止后) = ' + JSON.stringify(A.officeRequestsBefore) + '   ← 修好后这里**本来就该**为空：notice 是成员私信，通知不到所办')
  log('  对照通道 vibe_v5_say{to:office} => ' + JSON.stringify(A.sayOfficeRes))
  log('  status.officeRequests(对照通道写入后) = ' + JSON.stringify((A.officeRequestsAfter || []).map((m) => ({ from: m.from, to: m.to, text: String(m.text).slice(0, 60) }))))
  log('  v5state.json 里 to===\'office\' 的记录 = ' + JSON.stringify(A.stateOffice))
  log('  群聊镜像文件 = ' + JSON.stringify(A.chatRaw.map((f) => f.file)) + '（非空行 ' + A.chatAllLines + '）')
  log('  镜像里提到无主任务 ' + A.orphanTaskId + ' 的行 = ' + A.chatStopLines.length + ' 条:')
  for (const l of A.chatStopLines) log('      [' + l.file + '] ' + l.line.slice(0, 320))
  if (verbose) {
    log('  无主派发提示文本(逐条首行/标题行/task_claim 行): ')
    for (const d of A.orphanDispatches) {
      const lines = String(d.text).split('\n')
      log('    -> member=' + d.member + ' round=' + d.round)
      log('       首行="' + String(lines[0]).slice(0, 100) + '"')
      log('       标题行="' + (lines.find((l) => /^\s*任务 /.test(l)) || '(缺失)').slice(0, 120) + '"')
      log('       认领行="' + (lines.find((l) => /task_claim/.test(l)) || '(缺失)').slice(0, 130) + '"')
    }
  }
  log('')
}

log('---- C1 断言 ----')
assert(A_NEW.orphanDispatches.length >= 1,
  'C1 无主 pending 任务真的被派发（派发次数=' + A_NEW.orphanDispatches.length + '）')
{
  const d = A_NEW.orphanDispatches[0]
  const members = A_NEW.members.map((x) => x.split(':')[0])
  const busyBefore = (A_NEW.rounds.find((r) => r.round === d.round) || { busyBefore: [] }).busyBefore
  assert(!!d && members.indexOf(d.member) !== -1, 'C1 派发对象是常驻成员（member=' + (d && d.member) + '，roster=' + JSON.stringify(members) + '）')
  assert(!!d && busyBefore.indexOf(d.member) === -1, 'C1 派发对象在派发那一刻是**空闲**的（该轮 busyBefore=' + JSON.stringify(busyBefore) + '，不含 ' + (d && d.member) + '）')
  assert(!!d && /^【待认领任务 —— /m.test(d.text), 'C1 这一轮提示文本里有一行以【待认领任务 —— 开头（first="' + (d && d.firstLine) + '"）')
  assert(!!d && d.text.indexOf(ORPHAN_SUBJECT) !== -1, 'C1 提示文本里确实出现任务标题「' + ORPHAN_SUBJECT + '」')
  assert(!!d && d.text.indexOf('任务 ' + A_NEW.orphanTaskId + '：' + ORPHAN_SUBJECT) !== -1, 'C1 提示文本含精确行「任务 ' + A_NEW.orphanTaskId + '：' + ORPHAN_SUBJECT + '」')
  assert(!!d && d.text.indexOf('"task_claim": "' + A_NEW.orphanTaskId + '"') !== -1, 'C1 提示文本给出认领方式 task_claim=' + A_NEW.orphanTaskId)
  assert(A_NEW.byBranch['a.2-orphan'] === undefined || A_NEW.byBranch['a.2-orphan'] >= 1, 'C1 分支计数 a.2-orphan=' + A_NEW.byBranch['a.2-orphan'])
}
assert(A_HEAD.orphansAfterPost === 0,
  'C1 对照(HEAD)侧同场景派发次数=0（证明是本次改动引入的行为；HEAD 侧无主任务终点=' + JSON.stringify({ s: A_HEAD.orphanEnd.status, o: A_HEAD.orphanEnd.ownerId }) + '）')

log('---- C2 断言 ----')
assert(A_NEW.claimed0.status === 'in_progress' && A_NEW.claimed0.ownerId === 'r-2',
  'C2 前置：已认领任务起点为 in_progress/r-2（' + JSON.stringify({ s: A_NEW.claimed0.status, o: A_NEW.claimed0.ownerId }) + '）')
{
  const bad = A_NEW.rounds.filter((r) => !(r.claimed && r.claimed.status === 'in_progress' && r.claimed.ownerId === 'r-2'))
  assert(bad.length === 0, 'C2 每一轮过后主人仍是 r-2 且仍是 in_progress（偏离轮=' + JSON.stringify(bad.map((r) => r.round + ':' + JSON.stringify({ s: r.claimed.status, o: r.claimed.ownerId }))) + '）')
  assert(A_NEW.claimedEnd.status === 'in_progress' && A_NEW.claimedEnd.ownerId === 'r-2',
    'C2 终点主人仍是 r-2（' + JSON.stringify({ s: A_NEW.claimedEnd.status, o: A_NEW.claimedEnd.ownerId, rev: A_NEW.claimedEnd.revision }) + '）')
  const orphanNamingClaimed = A_NEW.orphanDispatches.filter((d) => d.text.indexOf('任务 ' + A_NEW.claimedTaskId + '：') !== -1)
  assert(orphanNamingClaimed.length === 0, 'C2 已认领任务从未被当作孤儿派发（没有任何一条孤儿提示把 ' + A_NEW.claimedTaskId + ' 当作待认领对象；命中=' + orphanNamingClaimed.length + '）')
  const ownedWakeNew = A_NEW.trace.filter((e) => e.member === 'r-2' && e.branch === 'normal').length
  const ownedWakeHead = A_HEAD.trace.filter((e) => e.member === 'r-2' && e.branch === 'normal').length
  assert(ownedWakeNew > 0, 'C2 已认领任务的主人仍被 (a) 分支唤醒（r-2/normal 唤醒次数=' + ownedWakeNew + '）')
  assert(ownedWakeNew === ownedWakeHead,
    'C2 主人节奏与改动前一致：r-2/normal 唤醒次数 新=' + ownedWakeNew + ' vs HEAD=' + ownedWakeHead + '（HEAD 全分支=' + JSON.stringify(A_HEAD.byMemberBranch) + '；新全分支=' + JSON.stringify(A_NEW.byMemberBranch) + '）')
  const normalPromptNew = (A_NEW.trace.find((e) => e.member === 'r-2' && e.branch === 'normal') || {}).text || ''
  const normalPromptHead = (A_HEAD.trace.find((e) => e.member === 'r-2' && e.branch === 'normal') || {}).text || ''
  assert(normalPromptNew !== '' && normalPromptHead !== '' && normalPromptNew.split('【待认领任务').length === 1,
    'C2 (a) 分支给 r-2 的是正常研究轮提示（不是孤儿提示）：first="' + normalPromptNew.split('\n')[0] + '"')
  assert(normalPromptNew.indexOf(CLAIMED_SUBJECT) !== -1,
    'C2 (a) 分支的提示里仍带着它自己的任务「' + CLAIMED_SUBJECT + '」')
  log('  [信息] r-2 的 (a) 唤醒文本与 HEAD 完全一致 = ' + (normalPromptNew === normalPromptHead) + '（长度 ' + normalPromptNew.length + ' vs ' + normalPromptHead.length + '）')
}

log('---- C3 断言 ----')
{
  const max = 3   // 源码缺省（vibe-math-v5.js: `orphanDispatchMaxAttempts: 3` 与 `|| 3`）
  const n = A_NEW.orphansAfterRounds
  // 参数面读回：vibe_v5_set/vibe_v5_status 的 params 走 visibleParams() 白名单
  const vis = (A_NEW.set && A_NEW.set.params) || {}
  log('  [信息] 工具面可见参数键数=' + Object.keys(vis).length + '；orphanDispatchMaxAttempts 在可见 params 里？' +
    (Object.prototype.hasOwnProperty.call(vis, 'orphanDispatchMaxAttempts') ? '是（set 返回 ' + vis.orphanDispatchMaxAttempts + '）' : '否（读不回）') +
    '；status.params.verifyAskMaxAttempts=' + JSON.stringify((A_NEW.statusParams || {}).verifyAskMaxAttempts) +
    '，status.params.orphanDispatchMaxAttempts=' + JSON.stringify((A_NEW.statusParams || {}).orphanDispatchMaxAttempts))
  const officeMember = (A_NEW.members || []).filter((x) => x.split(':')[0] === 'office')
  assert(officeMember.length === 0,
    'C3 [源码事实] roster 里没有 id===office 的成员（members=' + JSON.stringify(A_NEW.members) + '）')
  {
    const src = readFileSync(NEW_PATH, 'utf8').split('\n')
    const iDef = src.findIndex((l) => /async function notice\(memberId, text\)/.test(l))
    const iChat = src.findIndex((l) => /saveChatLine\('【任务板】'/.test(l))
    log('  [源码事实] notice() 定义（第 ' + (iDef + 1) + ' 行起；这解释了上一版 notice(\'office\') 为何静默失败）:')
    for (let i = iDef; i < iDef + 5; i++) log('      ' + (i + 1) + ': ' + src[i].trim())
    log('  [源码事实] 无主任务耗尽时的记录点（第 ' + (iChat + 1) + ' 行起）:')
    for (let i = iChat - 1; i < iChat + 2; i++) log('      ' + (i + 1) + ': ' + String(src[i] || '').trim())
    assert(iDef > 0 && /const m = memberById\(memberId\)/.test(src[iDef + 2]) && /V5_MEMBER_NOT_FOUND/.test(src[iDef + 3]),
      'C3 [源码事实] notice() 在发送前要求 memberById(memberId) 是一个 active 成员，否则直接返回 V5_MEMBER_NOT_FOUND（不写 inst().messages）')
    assert(iChat > 0, 'C3 [源码事实] 耗尽记录现在走 saveChatLine（群聊镜像），不再走 notice(\'office\')（第 ' + (iChat + 1) + ' 行）')
    const regionCode = src.slice(iChat - 40, iChat + 5).map((l) => String(l).replace(/\/\/.*$/, '')).join('\n')
    assert(!/notice\('office'/.test(regionCode),
      'C3 [源码事实] (a.2) 分支区域内没有残留的 notice(\'office\', …) 调用（注释里提到不算，已剥掉行注释）')
  }
  assert(n === max, 'C3 派发次数恰好达到缺省上限 orphanDispatchMaxAttempts=3 后停止（派发=' + n + '）')
  assert(A_NEW.orphansAfterPost === max, 'C3 之后又跑了 6 轮（成员均处于可唤醒状态），派发次数不再增长（' + A_NEW.orphansAfterPost + '）')
  // ---- 补充（Lead 收尾要求）：两个新参数的缺省值必须能从 status.params 读回 --------------------
  {
    const sp = A_NEW.statusParams || {}
    assert(sp.verifyAskMaxAttempts === 3,
      'C3 补充 status.params.verifyAskMaxAttempts === 3（缺省值可读回；实测 ' + JSON.stringify(sp.verifyAskMaxAttempts) + '）')
    assert(sp.orphanDispatchMaxAttempts === 3,
      'C3 补充 status.params.orphanDispatchMaxAttempts === 3（缺省值可读回；实测 ' + JSON.stringify(sp.orphanDispatchMaxAttempts) + '）')
    assert((A_NEW.set && A_NEW.set.params && A_NEW.set.params.orphanDispatchMaxAttempts) === 3,
      'C3 补充 vibe_v5_set 返回的 params 也读得回该键（实测 ' + JSON.stringify((A_NEW.set || {}).params && A_NEW.set.params.orphanDispatchMaxAttempts) + '）')
  }
  assert(A_NEW.orphanEnd && A_NEW.orphanEnd.status === 'pending' && A_NEW.orphanEnd.ownerId === '',
    'C3 停止后任务仍留在公告栏上等人（' + JSON.stringify({ s: A_NEW.orphanEnd.status, o: A_NEW.orphanEnd.ownerId }) + '）')
  // ---- the visible record: the Shared/Chat mirror (saveChatLine), NOT inst().messages ----------
  const rec = A_NEW.chatStopLines
  assert(A_NEW.chatFiles.length >= 1 && A_NEW.chatAllLines > 0,
    'C3 群聊镜像存在且非空（' + JSON.stringify(A_NEW.chatRaw.map((f) => f.file)) + '，非空行 ' + A_NEW.chatAllLines + '）')
  assert(rec.length === 1,
    'C3 群聊镜像里恰好留**一条**可见停止记录（提到任务 ' + A_NEW.orphanTaskId + ' 的行数=' + rec.length + '，行=' + JSON.stringify(rec.map((r) => r.line)) + '）')
  const line = rec.length ? rec[0].line : ''
  assert(line.indexOf(A_NEW.orphanTaskId) !== -1, 'C3 记录里含任务 id（' + A_NEW.orphanTaskId + '）')
  assert(line.indexOf('已自动派发 ' + max + ' 次') !== -1, 'C3 记录里含派发次数（"已自动派发 ' + max + ' 次"）')
  assert(line.indexOf('orphanDispatchMaxAttempts=' + max) !== -1, 'C3 记录里含上限值（"orphanDispatchMaxAttempts=' + max + '"）')
  assert(line.indexOf('停止自动派发') !== -1, 'C3 记录明确说明已停止自动派发')
  assert(A_HEAD.chatStopLines.length === 0,
    'C3 对照(HEAD)侧镜像里没有这条记录（命中=' + A_HEAD.chatStopLines.length + '）⇒ 该可见记录确由本次改动产生')
  // 渠道对照：office 信箱那条路由本来就到不了所办（notice 是成员私信）——只报告，不作为通过条件。
  assert(A_NEW.sayOfficeRes && A_NEW.sayOfficeRes.ok === true && ((A_NEW.officeRequestsAfter || []).filter((m) => m.from !== 'office')).length >= 1,
    'C3 [渠道对照] 成员用 vibe_v5_say{to:office} 确实能写进 office 信箱（' + JSON.stringify(A_NEW.sayOfficeRes) + '）——所以"officeRequests 为空"不是观察面坏了，而是 notice 结构上到不了所办')
  log('  [信息] officeRequests 里没有停止记录（命中=' + (A_NEW.officeRequestsAfter || []).filter((m) => String(m.text || '').indexOf(A_NEW.orphanTaskId) !== -1).length +
    '）——按修正后的验收口径，这是**正确**的：调度级记录走群聊镜像；inst().messages 里 to===\'office\' 只有成员留言（' + JSON.stringify(A_NEW.stateOffice) + '）')
}
log('')
log('---- C3 附加：上限真的是被参数驱动的（orphanDispatchMaxAttempts=1）----')
{
  // If the stop were a hard-coded 3 (or the parameter were ignored), this run would still dispatch
  // three times. The number of dispatches must follow the CONFIGURED value.
  const A1 = await runOrphanScenario(modNew, 'new-max1', { max: 1, rounds: 4 })
  log('  max=1 场景：派发=' + A1.orphansAfterRounds + '，之后 6 轮后=' + A1.orphansAfterPost +
    '，分支计数=' + JSON.stringify(A1.byBranch) + '，无主任务终点=' + JSON.stringify({ s: A1.orphanEnd.status, o: A1.orphanEnd.ownerId }))
  log('  max=1 场景镜像记录 = ' + JSON.stringify(A1.chatStopLines.map((r) => r.line.slice(0, 200))))
  assert(A1.orphansAfterRounds === 1, 'C3+ 配置 orphanDispatchMaxAttempts=1 ⇒ 只派发 1 次（实测 ' + A1.orphansAfterRounds + '）')
  assert(A1.orphansAfterPost === 1, 'C3+ 配置 1 时后续 6 轮也不再派发（实测 ' + A1.orphansAfterPost + '）')
  assert(A1.chatStopLines.length === 1 && A1.chatStopLines[0].line.indexOf('orphanDispatchMaxAttempts=1') !== -1,
    'C3+ 上限=1 时镜像记录也恰好一条且写着上限 1（行数=' + A1.chatStopLines.length + '）')
  assert(A1.statusParams && A1.statusParams.orphanDispatchMaxAttempts === 1,
    'C3+ 配置的上限值也能从 status.params 读回（实测 ' + JSON.stringify((A1.statusParams || {}).orphanDispatchMaxAttempts) + '，而不是只显示缺省 3）')
}
log('')
log('---- 附带观察（不作为 C1-C4 通过条件，只报告事实）----')
{
  const src = readFileSync(NEW_PATH, 'utf8').split('\n')
  const iVis = src.findIndex((l) => /function visibleParams\(\)/.test(l))
  const visBlock = src.slice(iVis, iVis + 60).join('\n')
  const inVis = /verifyAskMaxAttempts: params\.verifyAskMaxAttempts/.test(visBlock) && /orphanDispatchMaxAttempts: params\.orphanDispatchMaxAttempts/.test(visBlock)
  log('  1) [上一轮观察已消除，现为通过条件] "visibleParams() 白名单未收录两个新参数"不再成立：visibleParams()（第 ' + (iVis + 1) +
    ' 行起）的显式返回对象里现在有 verifyAskMaxAttempts / orphanDispatchMaxAttempts（结构性检查=' + inVis + '），且 C3 补充断言已验 status.params 读回 3/3、C3+ 读回 1。')
  assert(inVis, '观察1复核：visibleParams() 的返回对象里确实同时列出了两个新键（源码第 ' + (iVis + 1) + ' 行起）')
  const iFilter = src.findIndex((l) => /if \(t\.status !== 'pending' \|\| t\.ownerId\) continue/.test(l))
  log('  2) [不计入通过条件] (a.2) 的筛条件只有 `status===\'pending\' && !ownerId`，不查 taskReady(t)（第 ' + (iFilter + 1) + ' 行）：' + String(src[iFilter] || '').trim())
  log('     因此一条被 blocked_by 挡住的无主任务同样会被派发；成员照提示 task_claim 时会被 taskUpdate 的 V5_TASK_BLOCKED 拒绝。已知限制，不作为 C1-C4 失败项。')
  const iOld = src.findIndex((l) => /notice\('office', '成员 ' \+ m\.id/.test(l))
  log('  3) [不计入通过条件] 同一个"notice 到不了所办"的写法还留在别处（第 ' + (iOld + 1) + ' 行，spawn 重试停止的通知）：' + String(src[iOld] || '').trim())
  log('     该行在 HEAD 里就存在（git show HEAD 可验），属于既有同型问题，不是本次改动引入；本次 (a.2) 已经改用 saveChatLine。')
}
log('')

// ------------------------------------------------------------
log('============================================================')
log('[C4] 场景 B：全所**没有**无主 pending 任务时的逐分支调度对照')
log('============================================================')
const B_NEW1 = await runNoOrphanScenario(modNew, 'new-run1')
const B_NEW2 = await runNoOrphanScenario(modNew, 'new-run2')
const B_HEAD1 = await runNoOrphanScenario(modHead, 'head-run1')
const B_HEAD2 = await runNoOrphanScenario(modHead, 'head-run2')

for (const B of [B_NEW1, B_NEW2, B_HEAD1, B_HEAD2]) {
  log('-- 运行 [' + B.tag + '] --')
  log('  任务板(无无主 pending): ' + JSON.stringify(B.board))
  log('  参数: ' + JSON.stringify({ activityTimeoutMs: B.set.params.activityTimeoutMs, maxParallel: B.set.params.maxParallel, chatDigestMs: B.set.params.chatDigestMs }))
  log('  规范化波(canon, 不计入比对) = ' + JSON.stringify(B.canonWakes))
  log('  比对段逐轮唤醒 = ' + (B.rounds || []).map((r) => 'r' + r.round + '[' + r.wakes.join(',') + ']').join(' '))
  if (B.tag === 'new-run1') log('  比对段逐行 trace = ' + B.traceLines.join(' > '))
  log('  失速会议(stall, 分支 d) 原序 = ' + JSON.stringify(B.stallWakes.map((x) => x.split(' ::')[0])))
  log('  比对段分支计数 = ' + JSON.stringify(B.preStallCounts) + '  成员/分支 = ' + JSON.stringify(B.byMemberBranch))
  log('  成功唤醒总数 = ' + B.wakeSends + '  debug=' + JSON.stringify(B.debug) + '  orphanWakes=' + B.orphanWakes)
  log('')
}

const keyNew1 = B_NEW1.preStall.join(' > ')
const keyNew2 = B_NEW2.preStall.join(' > ')
const keyHead1 = B_HEAD1.preStall.join(' > ')
const keyHead2 = B_HEAD2.preStall.join(' > ')
log('---- C4 断言 ----')
assert(B_NEW1.orphanWakes === 0 && B_NEW2.orphanWakes === 0,
  'C4 前提：全所没有无主 pending 任务时，新分支一次都没有唤醒（a.2 计数=' + B_NEW1.orphanWakes + '/' + B_NEW2.orphanWakes + '）')
assert(B_HEAD1.orphanWakes === 0 && B_HEAD2.orphanWakes === 0,
  'C4 对照侧同样没有 a.2 唤醒（HEAD 计数=' + B_HEAD1.orphanWakes + '/' + B_HEAD2.orphanWakes + '）')
assert(B_NEW1.unownedPending === 0 && B_HEAD1.unownedPending === 0,
  'C4 前提：任务板上确实没有无主 pending 任务（新 unownedPending=' + B_NEW1.unownedPending + '，HEAD=' + B_HEAD1.unownedPending + '；板=' + JSON.stringify(B_NEW1.board) + '）')
assert(keyNew1 === keyNew2,
  'C4 确定性对照：同一被测文件跑两次，逐轮逐分支唤醒序列完全相同（新1 === 新2）')
assert(keyHead1 === keyHead2,
  'C4 确定性对照：对照组(HEAD)跑两次也完全相同（证明这套比较方法本身是稳定的）')
assert(keyNew1 === keyHead1,
  'C4 逐分支一致：同等驱动下 被测 === HEAD（逐轮、逐分支、含顺序）')
{
  const b1 = B_NEW1.preStallCounts, b2 = B_NEW2.preStallCounts, bh = B_HEAD1.preStallCounts, bh2 = B_HEAD2.preStallCounts
  const keys = Array.from(new Set(Object.keys(b1).concat(Object.keys(b2), Object.keys(bh), Object.keys(bh2)))).sort()
  const rows = keys.map((k) => k + ': 新1=' + (b1[k] || 0) + ' 新2=' + (b2[k] || 0) + ' HEAD1=' + (bh[k] || 0) + ' HEAD2=' + (bh2[k] || 0))
  log('  逐分支计数对照: ' + rows.join(' | '))
  const same = keys.every((k) => (b1[k] || 0) === (b2[k] || 0) && (b1[k] || 0) === (bh[k] || 0) && (b1[k] || 0) === (bh2[k] || 0))
  assert(same, 'C4 每个分支的唤醒次数都相同（' + rows.join(' | ') + '）')
  const m1 = B_NEW1.byMemberBranch, mh = B_HEAD1.byMemberBranch
  const mkeys = Array.from(new Set(Object.keys(m1).concat(Object.keys(mh)))).sort()
  const mrows = mkeys.map((k) => k + ': 新=' + (m1[k] || 0) + ' HEAD=' + (mh[k] || 0))
  log('  成员/分支计数对照: ' + mrows.join(' | '))
  assert(mkeys.every((k) => (m1[k] || 0) === (mh[k] || 0)), 'C4 每个成员在每个分支上的唤醒次数都相同（' + mrows.join(' | ') + '）')
  assert(B_NEW1.wakeSends === B_HEAD1.wakeSends && B_NEW1.wakeSends === B_NEW2.wakeSends,
    'C4 成功唤醒总数相同（新1=' + B_NEW1.wakeSends + ' 新2=' + B_NEW2.wakeSends + ' HEAD1=' + B_HEAD1.wakeSends + ' HEAD2=' + B_HEAD2.wakeSends + '）')
  assert(B_NEW1.debug && B_HEAD1.debug && B_NEW1.debug.passes === B_HEAD1.debug.passes,
    'C4 调度轮次相同（新 passes=' + (B_NEW1.debug && B_NEW1.debug.passes) + ' HEAD passes=' + (B_HEAD1.debug && B_HEAD1.debug.passes) + '）')
  // 逐轮对照（这是"顺序"最直接的证据）
  const r1 = (B_NEW1.rounds || []).map((r) => 'r' + r.round + '[' + r.wakes.join(',') + ']').join(' ')
  const r2 = (B_NEW2.rounds || []).map((r) => 'r' + r.round + '[' + r.wakes.join(',') + ']').join(' ')
  const rh1 = (B_HEAD1.rounds || []).map((r) => 'r' + r.round + '[' + r.wakes.join(',') + ']').join(' ')
  const rh2 = (B_HEAD2.rounds || []).map((r) => 'r' + r.round + '[' + r.wakes.join(',') + ']').join(' ')
  log('  逐轮唤醒 新1   = ' + r1)
  log('  逐轮唤醒 新2   = ' + r2)
  log('  逐轮唤醒 HEAD1 = ' + rh1)
  log('  逐轮唤醒 HEAD2 = ' + rh2)
  assert(r1 === r2 && r1 === rh1 && r1 === rh2, 'C4 逐轮唤醒序列（成员+分支+顺序）四组运行完全相同')
  // (d) 会议顺序由 beginMeeting 的 Math.random() 洗牌决定 ⇒ 只比对集合与条数。
  const s1 = (B_NEW1.stallSet || []).join('|')
  const sn2 = (B_NEW2.stallSet || []).join('|')
  const sh1 = (B_HEAD1.stallSet || []).join('|')
  const sh2 = (B_HEAD2.stallSet || []).join('|')
  log('  (d) 会议唤醒集合: 新1=' + s1 + ' 新2=' + sn2 + ' / HEAD1=' + sh1 + ' HEAD2=' + sh2)
  log('  (d) 会议唤醒原序: 新1=' + JSON.stringify(B_NEW1.stallWakes.map((x) => x.split(' ::')[0])) +
    ' HEAD1=' + JSON.stringify(B_HEAD1.stallWakes.map((x) => x.split(' ::')[0])) +
    ' HEAD2=' + JSON.stringify(B_HEAD2.stallWakes.map((x) => x.split(' ::')[0])) +
    '（顺序由 Math.random 洗牌决定，既有的随机性，不是本次改动引入）')
  assert(s1 !== '' && s1 === sh1 && s1 === sh2 && s1 === sn2, 'C4 (d) 失速会议分支同样到达，且唤醒集合完全相同（' + s1 + '）')
  assert((B_NEW1.byBranch['meeting'] || 0) >= 1 && (B_HEAD1.byBranch['meeting'] || 0) >= 1,
    'C4 (d) 会议分支计数 新=' + (B_NEW1.byBranch['meeting'] || 0) + ' HEAD=' + (B_HEAD1.byBranch['meeting'] || 0))
  assert((B_NEW1.byBranch['normal'] || 0) >= 1 && (B_NEW1.byBranch['checkpoint'] || 0) >= 1,
    'C4 (a)/(b)/(c) normal 分支与 (e) checkpoint 分支都被走到（normal=' + (B_NEW1.byBranch['normal'] || 0) + ' checkpoint=' + (B_NEW1.byBranch['checkpoint'] || 0) + '）')
}

// ------------------------------------------------------------
log('')
log('============================================================')
log('被测文件运行后校验（防止验证期间被改动）')
const newHashAfter = sha256File(NEW_PATH)
log('  运行开始时 sha256 = ' + HASH_AT_START)
log('  运行结束时 sha256 = ' + newHashAfter + '  size=' + statSync(NEW_PATH).size)
assert(newHashAfter === HASH_AT_START, '被测文件在本次运行期间未被改动（与运行开始时的 sha256 一致）')
log('')
log('============================================================')
log('结果: passed=' + passed + ' failed=' + failed)
if (failed) { log('未通过:'); for (const f of failures) log('  - ' + f) }
log('原始输出落盘: 进程内直接写 ' + OUT_PATH + (outWriteOk ? '（成功）' : '（被文件沙箱拒绝：' + outWriteErr + '）'))
if (!outWriteOk) log('  → 实际交付方式：stdout 被逐字捕获后由文件工具写到同一路径 tests/_accept-out/c.txt（内容即本文件全部文本）')
log('============================================================')
process.exitCode = failed ? 1 : 0

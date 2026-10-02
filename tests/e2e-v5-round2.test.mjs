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
  const listeners = {}, toolRegs = [], commandRegs = [], spawns = [], wakes = [], interrupts = [], drains = [], sendAttempts = []
  // Successful sends that SURVIVE consumption: `peekWakeOf` splices items out of `wakes`, so a probe that
  // must compare "rounds" against "successful wakes" needs a counter that is never drained.
  let wakeSends = 0
  // G1 seam: force every `subagents.sendMessage` to throw (a real host failure / a member whose
  // continuation is gone). `sendAttempts` records that the wake was TRIED, so a probe can tell
  // "the wake failed" apart from "no wake was scheduled at all".
  let failSend = !!o.failSendMessage
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
  // Any member's next prompt matching a predicate — used to capture the CHECKPOINT heartbeat,
  // whose recipient is whichever member the scheduler picked.
  async function peekWakeWhere(pred, maxWaitMs) {
    const t0 = Date.now()
    while (Date.now() - t0 < (maxWaitMs || 3000)) {
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
  return { WS, ctx, ROOT, ROOT_SESSION, removedServiceQueries, spawns, wakes, interrupts, drains, sendAttempts, setFailSend(v) { failSend = !!v }, get wakeSends() { return wakeSends }, toolRegs, commandRegs, listeners, effectDisposers, callTool, childAgent, fireEnd, spawnOf, childOf, labelOf, kindOf, settleSpawns, drain, peekWakeOf, peekWakeWhere, set plannedVotes(v) { plannedVotes = v }, get plannedVotes() { return plannedVotes }, set solvePlan(v) { solvePlan = v } }
}

const pluginModule = await import(PLUGIN.href + '?t=' + Date.now())
const PROBLEM = '证明素数有无穷多个'

// ── final-paper test helpers ────────────────────────────────────────────────
// A FAKE LaTeX toolchain (docs/final-paper.md §10: "临时目录里放一个假的 xelatex/latexmk 脚本，或注入 runner").
// It is injected through the SAME `subprocess` service the plugin detects and compiles with, so
// the plugin's real detection/compile/repair code runs unchanged; only the toolchain is fake.
// `installed`      — which engine names resolve (others throw, like a missing binary)
// `failEngines`    — engines whose process exits 1
// `failOn`         — a RegExp: if the tex on disk matches, the run exits 1 (drives the repair)
// `alwaysFail`     — every run exits 1 (drives the degrade path)
function fakeLatex(opts) {
  const o = opts || {}
  const calls = []
  const installed = o.installed || ['xelatex', 'pdflatex']
  return {
    calls,
    async resolveExecutable(name) {
      if (installed.indexOf(name) === -1) throw new Error('ENOENT: ' + name)
      return 'C:/fake/' + name
    },
    spawn(spec) {
      const argv = spec.argv || []
      const name = String(argv[0] || '').split(/[\\/]/).pop()
      const dir = String(spec.cwd || '')
      let tex = ''
      try { tex = readFileSync(join(dir, 'paper.tex'), 'utf8') } catch (e) { /* first attempt may race */ }
      calls.push({ name, args: argv.slice(1), dir, tex })
      let ok = true
      if (o.failEngines && o.failEngines.indexOf(name) !== -1) ok = false
      if (o.failOn && o.failOn.test(tex)) ok = false
      if (o.alwaysFail) ok = false
      if (ok) {
        try { mkdirSync(dir, { recursive: true }); writeFileSync(join(dir, 'paper.pdf'), '%PDF-1.4 fake\n', 'utf8') } catch (e) { ok = false }
      }
      return { done: Promise.resolve({ exitCode: ok ? 0 : 1 }), terminate() {} }
    },
  }
}
const paperKindOf = (p) => /【最终论文·撰写/.test(p) ? 'write'
  : /【最终论文·互审/.test(p) ? 'review'
    : /【最终论文·定稿/.test(p) ? 'final' : ''

// ── fake Lean toolchain (docs/formal-verification.md §7) ────────────────────
// Injected through the SAME `subprocess` service the plugin compiles with, so detection,
// argv assembly, the queue and the settle logic all run unchanged; only the toolchain is fake.
//   exitFor(argv, file) -> exitCode | undefined    terminated -> count of terminate() calls
//   defer: true  every spawn stays alive until releaseAll() (for timeout/dispose/build-context)
function fakeLean(opts) {
  const o = opts || {}
  const calls = []
  return {
    calls,
    terminated: 0,
    async resolveExecutable(cmd) {
      const name = String(cmd || 'lean')
      if (o.missing) throw new Error('ENOENT: ' + name)
      return 'C:/fake/' + name
    },
    spawn(spec) {
      const argv = (spec.argv || []).map(String)
      // Only the LEAN engine is a compile: the plugin also uses the subprocess service for
      // platform shell helpers (directory setup) AND for the math_computation engine probe
      // (which resolves its own candidates through the same seam) — neither may pollute the
      // Lean call log, nor be deferred by the gate.
      const head = String(argv[0] || '')
      if (!/(^|[\\/])lean$/i.test(head)) {
        return { done: Promise.resolve({ exitCode: 0, stdout: '', stderr: '' }), terminate() { /* not a Lean compile */ } }
      }
      const file = argv[argv.length - 1]
      calls.push({ argv, file, cwd: spec.cwd })
      let exitCode = 0
      if (o.alwaysFail) exitCode = 1
      else if (typeof o.exitFor === 'function') { const r = o.exitFor(argv, file); if (r !== undefined && r !== null) exitCode = r }
      const self = this
      if (!o.defer) return { done: Promise.resolve({ exitCode }), terminate() { self.terminated += 1 } }
      let settled = false
      let resolveDone = null
      const done = new Promise((resolve) => { resolveDone = resolve })
      const finish = (v) => { if (!settled) { settled = true; resolveDone(v) } }
      o._release = o._release || []
      o._release.push(() => finish({ exitCode }))
      return { done, terminate() { self.terminated += 1; finish({ exitCode: null, signal: 'SIGTERM' }) } }
    },
    releaseAll() { for (const f of (o._release || []).splice(0)) { try { f() } catch (e) { /* ignore */ } } },
  }
}
const paperDirOf = (h, id) => join(h.WS, 'VibeMath', 'Projects', 'default', 'Institutes', 'institute', 'Paper', id || 'institute')
// Seed a .lean work file inside the institute tree (a run job needs an existing file).
function seedLeanFile(h, rel, text) {
  const abs = join(h.WS, 'VibeMath', 'Projects', 'default', 'Institutes', 'institute', ...String(rel).split('/'))
  mkdirSync(dirname(abs), { recursive: true })
  writeFileSync(abs, text, 'utf8')
  return abs
}
function listFilesUnder(root, rel) {
  const out = []
  const base = rel === undefined ? '' : rel
  for (const e of readdirSync(root, { withFileTypes: true })) {
    const r = base ? base + '/' + e.name : e.name
    if (e.isDirectory()) out.push(...listFilesUnder(join(root, e.name), r))
    else out.push(r)
  }
  return out
}
// Answer the paper phase's own prompts until the flow stops asking: each member writes its
// part, cross-reviews another member's part, and the editor finalises. `opts.write/review/final`
// override the default (deliverable) replies, which is how the objection/cap paths are driven.
async function drivePaper(h, opts) {
  const o = opts || {}
  let steps = 0, idle = 0
  while (steps < (o.max || 40) && idle < 8) {
    const i = h.wakes.findIndex(w => paperKindOf((w.blocks && w.blocks[0] && w.blocks[0].text) || ''))
    if (i === -1) { idle++; await sleep(25); continue }
    idle = 0
    const w = h.wakes.splice(i, 1)[0]
    const prompt = (w.blocks && w.blocks[0] && w.blocks[0].text) || ''
    const kind = paperKindOf(prompt)
    const who = h.labelOf(w.childId)
    let reply
    if (kind === 'write') {
      reply = o.write ? o.write(who, prompt) : ({ paper_part: { title: who + ' 的贡献', solution: who + '：原问题的完整解法（只写有证据的部分）。', methods: who + ' 的方法与经验。', rules: who + ' 归纳的规律。', limits: who + ' 的局限（未定论项已标注）。', evidence: ['Members/' + who + '/Propos/p-' + who + '.md'] } })
    } else if (kind === 'review') {
      const om = /待审部分（([^）]*)）/.exec(prompt)
      reply = o.review ? o.review(who, om ? om[1] : '', prompt) : ({ paper_review: { of: om ? om[1] : '', deliverable: true, comments: who + '：证据与表决记录一致，可交付。' } })
    } else {
      reply = o.final ? o.final(who, prompt) : ({ paper_final: { decision: 'deliverable', note: '已核对合并稿与互审意见，统一术语与符号。', conclusion: '题设范围内结论成立。' } })
    }
    // `capture` lets a case assert on the TEXT the member really received (the evidence-only
    // clause lives in the prompt, not only in the plugin source).
    if (o.capture) o.capture.push({ kind, who, prompt })
    h.fireEnd(w.childId, reply)
    steps++
    await sleep(20)
  }
  return steps
}

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
// A5: the COUNT is only a lead - assert the semantic unit too. The persisted roster must be
// exactly {acad, r-1, r-2} by ID and {academician:1, researcher:2} by KIND, so a founding that
// minted a duplicate id (the allocator returning the same value twice), founded a researcher with
// the academician kind, or dropped/added a member while still totalling 3 now FAILS.
const ids = inst.members.map((m) => String(m.id)).sort()
assert(ids.join(',') === ['acad', 'r-1', 'r-2'].sort().join(','), '* A5 the founded ID SET is exactly {acad, r-1, r-2} (got ' + JSON.stringify(ids) + ')')
const kinds = {}
for (const m of inst.members) kinds[String(m.kind)] = (kinds[String(m.kind)] || 0) + 1
const kindList = Object.keys(kinds).sort().map((k) => k + ':' + kinds[k])
assert(JSON.stringify(kindList) === JSON.stringify(['academician:1', 'researcher:2']), '* A5 the founded KIND MULTISET is exactly {academician:1, researcher:2} (got ' + JSON.stringify(kinds) + ')')
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
  // The refused work is QUEUED, not lost. G-6: freeing a slot is now picked up by the framework's
  // OWN scheduling pass (`retryPendingSpawns()` is the first line of `schedulePass`), so the
  // PRIMARY assertion here is the TERMINAL STATE — timing-independent, path-independent:
  // baseline: the product's OWN derived queue, snapshotted immediately before the fire
  const preAuto = await h.callTool('vibe_v5_status', {})
  const queuedBeforeAuto = (preAuto.pendingSpawns || []).map(p => p.id)
  assert(queuedBeforeAuto.length >= 1, 'precondition: deferred members are queued before the automatic case (' + JSON.stringify(queuedBeforeAuto) + ')')
  await h.callTool('vibe_v5_fire', { id: 'r-1', reason: 'cap test' })
  await h.settleSpawns()
  const st2 = await h.callTool('vibe_v5_status', {})
  assert(st2.members.filter(m => m.phase === 'active' && m.childId).length === CAP, 'the institute is back at the host ceiling (active=' + st2.members.filter(m => m.phase === 'active').map(m => m.id).join(',') + ')')
  // ONE freed slot is spent on the deferred work: the queue SHRINKS by exactly one (more members may
  // be refused than a single freed slot can take — the rest stay queued, visibly).
  const pendingAfterAuto = (st2.pendingSpawns || []).map(p => p.id)
  const rebuiltByAuto = queuedBeforeAuto.filter(id => pendingAfterAuto.indexOf(id) === -1)
  assert(rebuiltByAuto.length === 1 && pendingAfterAuto.length === queuedBeforeAuto.length - 1,
    '★ the freed capacity was spent on exactly ONE deferred member (queued=' + JSON.stringify(queuedBeforeAuto) + ' → pending=' + JSON.stringify(pendingAfterAuto) + ', rebuilt=' + JSON.stringify(rebuiltByAuto) + ')')
  assert(rebuiltByAuto.every(id => (st2.members.find(m => m.id === id) || {}).phase === 'active'),
    '★ the rebuilt deferred member is ACTIVE (' + JSON.stringify(rebuiltByAuto) + ')')
  // The MANUAL `resume` rebuild path stays pinned too — with the automatic retry disabled by the
  // documented test seam, `resume` is the only thing that can rebuild, so this cannot race the
  // scheduler (a disjunction accepting either path would be fine ONLY next to the terminal check).
  process.env.V5_SPAWN_RETRY = 'manual'
  try {
    const beforeManual = await h.callTool('vibe_v5_status', {})
    const queuedBeforeManual = (beforeManual.pendingSpawns || []).map(p => p.id)
    assert(queuedBeforeManual.length >= 1, 'precondition: at least one deferred member is queued before the manual case (' + JSON.stringify(queuedBeforeManual) + ')')
    // free exactly one slot; with the seam on, NOTHING rebuilds it — that is what makes the next
    // assertion attributable to `resume` alone
    const victim = beforeManual.members.find(m => m.phase === 'active' && m.childId)
    await h.callTool('vibe_v5_fire', { id: victim.id, reason: 'manual-resume case' })
    await h.settleSpawns()
    const afterFree = await h.callTool('vibe_v5_status', {})
    assert((afterFree.pendingSpawns || []).length === queuedBeforeManual.length,
      '★ with the automatic retry disabled the freed slot leaves the queue UNTOUCHED (' + JSON.stringify((afterFree.pendingSpawns || []).map(p => p.id)) + ')')
    const resumed = await h.callTool('vibe_v5_resume', {})
    assert(resumed.ok === true && resumed.respawned >= 1,
      'the MANUAL resume path rebuilds a deferred member on its own (respawned=' + (resumed && resumed.respawned) + ')')
    const st3 = await h.callTool('vibe_v5_status', {})
    const rebuilt = queuedBeforeManual.filter(id => (st3.members.find(m => m.id === id) || {}).phase === 'active')
    assert(rebuilt.length >= 1, '★ the member `resume` was asked to rebuild is ACTIVE now (' + JSON.stringify(rebuilt) + ')')
    assert(st3.members.filter(m => m.phase === 'active' && m.childId).length >= CAP, 'after the manual resume the terminal state holds the ceiling (active=' + st3.members.filter(m => m.phase === 'active').map(m => m.id).join(',') + ')')
  } finally { delete process.env.V5_SPAWN_RETRY }
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
  // Two office-impersonation holes the independent verifier found AFTER Round D — same L6 class,
  // and neither was covered by the assertions above: `vibe_v5_message` signed EVERY caller's text
  // as the office (no caller resolution at all), and `vibe_v5_remove_researcher` ("Office only")
  // accepted any caller. Both now resolve through `officeCaller` and refuse.
  const ghostMsg = await h.callTool('vibe_v5_message', { to: 'all', content: '冒充所办通知' }, ghost)
  assert(ghostMsg.ok === false && ghostMsg.code === 'V5_MEMBER_NOT_FOUND',
    'vibe_v5_message is refused for the unidentifiable caller (' + JSON.stringify(ghostMsg).slice(0, 90) + ')')
  const memberMsg = await h.callTool('vibe_v5_message', { to: 'all', content: '成员冒充所办通知' }, h.childAgent(h.childOf('r-1')))
  assert(memberMsg.ok === false && memberMsg.code === 'V5_NOT_OFFICE',
    'vibe_v5_message is refused for a MEMBER too — the relay is signed as the office, members use vibe_v5_say (' + JSON.stringify(memberMsg).slice(0, 90) + ')')
  const ghostRm = await h.callTool('vibe_v5_remove_researcher', { id: 'r-1' }, ghost)
  assert(ghostRm.ok === false && ghostRm.code === 'V5_MEMBER_NOT_FOUND',
    'vibe_v5_remove_researcher is refused for the unidentifiable caller (' + JSON.stringify(ghostRm).slice(0, 90) + ')')
  // ---- 6.4: the DIAGNOSIS, not just the code -------------------------------------------------
  const ghostRec = await h.callTool('vibe_v5_record_progress', { content: 'x' }, ghost)
  assert(ghostRec.ok === false && ghostRec.code === 'V5_MEMBER_NOT_FOUND' && ghostRec.next && ghostRec.next.kind === 'member-call' && ghostRec.next.tool === 'vibe_v5_members',
    '* 6.4 branch 3 (unidentifiable caller / the office has no member identity): code + next{kind:member-call, tool:vibe_v5_members} (' + JSON.stringify(ghostRec).slice(0, 120) + ')')
  assert(typeof ghostRec.message === 'string' && /\u6240\u529e|\u6210\u5458/.test(ghostRec.message),
    '* 6.4 branch 3 EXPLAINS the office/member distinction instead of a bare refusal (' + String(ghostRec.message).slice(0, 90) + ')')
  const neverH = makeHost({ pluginModule })
  const neverStarted = await neverH.callTool('vibe_v5_record_progress', { content: 'x' })
  assert(neverStarted.ok === false && neverStarted.code === 'V5_MEMBER_NOT_FOUND' && neverStarted.next && neverStarted.next.kind === 'start' && neverStarted.next.tool === 'vibe_v5_start',
    '* 6.4 branch 1 (the institute was never started): code + next{kind:start, tool:vibe_v5_start} (' + JSON.stringify(neverStarted).slice(0, 120) + ')')
  // Branches 2 (running, zero active) and 4 (id no longer on the roster) are not reachable through
  // the tool surface from this harness, so they are pinned STRUCTURALLY (each branch with its own
  // next{} kind), while branches 1 and 3 above are pinned BEHAVIOURALLY.
  const src5 = readFileSync(PLUGIN, 'utf8')
  for (const k of ['start', 'staff', 'member-call', 'roster']) {
    assert(new RegExp("kind: '" + k + "'").test(src5), '* 6.4 memberDiagnosis branch ' + k + ' exists with its own next{} kind')
  }
  assert(/vibe_v5_start/.test(src5) && /vibe_v5_add_researcher/.test(src5), '* 6.4 the start/staff branches point at real tools (vibe_v5_start / vibe_v5_add_researcher)')
  const memberRm = await h.callTool('vibe_v5_remove_researcher', { id: 'r-1' }, h.childAgent(h.childOf('r-1')))
  assert(memberRm.ok === false && memberRm.code === 'V5_NOT_OFFICE',
    '...and refused for a member (the tool says Office only), not just for ghosts (' + JSON.stringify(memberRm).slice(0, 90) + ')')
  const r1Still = (await h.callTool('vibe_v5_members', {})).members.find((m) => m.id === 'r-1')
  assert(r1Still && r1Still.phase === 'active', 'neither refused call dismissed r-1 (phase=' + JSON.stringify(r1Still && r1Still.phase) + ')')
  const officeMsg = await h.callTool('vibe_v5_message', { to: 'all', content: '所办通知' })
  assert(officeMsg.ok === true, 'the office still relays a message (' + JSON.stringify(officeMsg).slice(0, 90) + ')')
  // The `/v5` SLASH-COMMAND line is the third surface of the same class: it hardcoded 'office' for
  // every subcommand (`remove`/`fire`/`hire`/`set`/`stop`/`message`…), and a member child maps to
  // the same institute session — so a member (or an unidentifiable descendant) could drive it. It
  // now resolves the caller too.
  const cmdV5 = h.commandRegs.find((c) => c.name === 'v5')
  const cmdGhost = JSON.parse((await cmdV5.handler({ agent: ghost, rawInput: 'remove r-1' })).text)
  assert(cmdGhost.ok === false && cmdGhost.code === 'V5_NOT_OFFICE',
    '/v5 remove is refused for the unidentifiable caller (' + JSON.stringify(cmdGhost).slice(0, 90) + ')')
  const cmdMember = JSON.parse((await cmdV5.handler({ agent: h.childAgent(h.childOf('r-1')), rawInput: 'remove r-1' })).text)
  assert(cmdMember.ok === false && cmdMember.code === 'V5_NOT_OFFICE',
    '/v5 remove is refused for a member child too (' + JSON.stringify(cmdMember).slice(0, 90) + ')')
  const r1AfterCmd = (await h.callTool('vibe_v5_members', {})).members.find((m) => m.id === 'r-1')
  assert(r1AfterCmd && r1AfterCmd.phase === 'active', 'the refused /v5 remove did not dismiss r-1 (phase=' + JSON.stringify(r1AfterCmd && r1AfterCmd.phase) + ')')
  const cmdOffice = JSON.parse((await cmdV5.handler({ agent: h.ROOT, rawInput: 'status' })).text)
  assert(cmdOffice.ok === true, 'the office still drives the /v5 line (' + JSON.stringify(cmdOffice).slice(0, 90) + ')')
  const officeRm = await h.callTool('vibe_v5_remove_researcher', { id: 'r-1' })
  assert(officeRm.ok === true, 'the office can still dismiss a permanent researcher (' + JSON.stringify(officeRm).slice(0, 90) + ')')
}

// ---------- 22. the office-only LIFECYCLE controls resolve their caller too ----------
console.log('\n[22] configure/start/resume/pause/stop/set belong to the PROVABLE session root')
{
  // A member child and the office share ONE institute session, so `getSession()` alone let a member
  // (or an unidentifiable descendant of the root) drive these handlers as the office: stop the
  // institute, or rewrite quorum/params. Absence of a caller is NOT the office either.
  const h = makeHost({ pluginModule })
  // (a) the root/UI path keeps working end-to-end: these are exactly the handlers `/v5` drives.
  const cfg = await h.callTool('vibe_v5_configure', { institute: 'life', problem: PROBLEM })
  assert(cfg.ok === true, 'the office configures the institute (' + JSON.stringify(cfg).slice(0, 90) + ')')
  const started = await h.callTool('vibe_v5_start', { researcherCount: 1 })
  assert(started.ok === true, 'the office founds it (' + JSON.stringify(started).slice(0, 90) + ')')
  await h.settleSpawns()
  const setOk = await h.callTool('vibe_v5_set', { maxParallel: 2 })
  assert(setOk.ok === true && setOk.params.maxParallel === 2, 'the office tunes parameters (' + JSON.stringify(setOk).slice(0, 90) + ')')
  const pauseOk = await h.callTool('vibe_v5_pause', {})
  assert(pauseOk.ok === true, 'the office pauses (' + JSON.stringify(pauseOk).slice(0, 90) + ')')
  const resumeOk = await h.callTool('vibe_v5_resume', {})
  assert(resumeOk.ok === true, 'the office resumes (' + JSON.stringify(resumeOk).slice(0, 90) + ')')
  // (b) a MEMBER child and an unidentifiable descendant of the office root are both refused.
  const member = h.childAgent(h.childOf('r-1'))
  const ghost = h.childAgent('c-nobody')
  const officeOnly = [
    ['vibe_v5_configure', { institute: 'stolen', problem: 'x' }],
    ['vibe_v5_start', { researcherCount: 3 }],
    ['vibe_v5_resume', {}],
    ['vibe_v5_pause', {}],
    ['vibe_v5_stop', {}],
    ['vibe_v5_set', { maxParallel: 9 }],
  ]
  for (const [name, args] of officeOnly) {
    const asMember = await h.callTool(name, args, member)
    assert(asMember.ok === false && asMember.code === 'V5_NOT_OFFICE',
      name + ' is refused for a MEMBER child (' + JSON.stringify(asMember).slice(0, 80) + ')')
    const asGhost = await h.callTool(name, args, ghost)
    assert(asGhost.ok === false && asGhost.code === 'V5_NOT_OFFICE',
      name + ' is refused for the unidentifiable caller (' + JSON.stringify(asGhost).slice(0, 80) + ')')
  }
  // (c) NO caller at all is not the office either — driven through the real registered wrapper (the
  // harness' callTool defaults to ROOT, so `agent: undefined` is passed explicitly here). The wrapper
  // refuses it as 'no session' BEFORE the gate, i.e. absence never reaches the office path.
  const stopSpec = h.toolRegs.find((t) => t.name === 'vibe_v5_stop')
  const noCaller = JSON.parse(await stopSpec.execute({}, { agent: undefined }))
  assert(noCaller.ok === false,
    'an agent-less call never reaches the lifecycle handler as the office (' + JSON.stringify(noCaller).slice(0, 80) + ')')
  // (d) nothing the refusals asked for took effect.
  const after = await h.callTool('vibe_v5_status', {})
  assert(after && after.ok !== false && after.params && after.params.maxParallel === 2,
    'no refused lifecycle call took effect (maxParallel=' + (after.params && after.params.maxParallel) + ')')
  assert(after.members && after.members.some((m) => m.phase !== 'dismissed'),
    'the refused stop did not dissolve the roster (' + (after.members || []).map((m) => m.id + ':' + m.phase).join(',') + ')')
  const finalStop = await h.callTool('vibe_v5_stop', {})
  assert(finalStop.ok === true, 'the office can still stop it (' + JSON.stringify(finalStop).slice(0, 90) + ')')
}

// ---------- 23. final-paper params: closed schema, defaults, explicit coercion ----------
console.log('\n[23] final-paper params: closed schema, defaults and explicit coercion')
{
  const h = makeHost({ pluginModule })
  const setSpec = h.toolRegs.find(t => t.name === 'vibe_v5_set')
  const keys = ['finalPaper', 'paperFormat', 'paperLanguage', 'paperCompilePdf', 'paperEditor', 'paperLatexCommand']
  assert(!!setSpec && keys.every(k => Object.prototype.hasOwnProperty.call(setSpec.parameters.properties, k)),
    '★ vibe_v5_set advertises all six final-paper keys (the schema is closed, so an unlisted key is unreachable)')
  const props = setSpec.parameters.properties
  assert(JSON.stringify(props.paperFormat.enum) === JSON.stringify(['both', 'md', 'tex']) &&
    JSON.stringify(props.paperLanguage.enum) === JSON.stringify(['zh', 'en']) &&
    JSON.stringify(props.paperEditor.enum) === JSON.stringify(['office', 'academician']),
    'the three enums are narrowed in the schema (a typo must not become a fourth mode)')
  const s0 = (await h.callTool('vibe_v5_status', {})).params
  assert(s0.finalPaper === true && s0.paperFormat === 'both' && s0.paperLanguage === 'zh' && s0.paperCompilePdf === true &&
    s0.paperEditor === 'academician' && s0.paperLatexCommand === '',
    'the documented defaults are live (' + JSON.stringify({ f: s0.finalPaper, fmt: s0.paperFormat, lang: s0.paperLanguage, pdf: s0.paperCompilePdf, ed: s0.paperEditor }) + ')')
  const r = await h.callTool('vibe_v5_set', { finalPaper: 'false', paperFormat: 'bogus', paperLanguage: 'EN', paperEditor: 'root', paperCompilePdf: 1, paperLatexCommand: 'lualatex' })
  assert(r.ok === true && r.params.finalPaper === false, "★ finalPaper:'false' is coerced to false (v2 §B: an unknown spelling must not stay truthy)")
  assert(r.params.paperFormat === 'both', 'an unknown paperFormat falls back to both')
  assert(r.params.paperLanguage === 'en' && r.params.paperEditor === 'office', 'enums are case-insensitive and legacy aliases resolve (EN → en, root → office)')
  assert(r.params.paperCompilePdf === true && r.params.paperLatexCommand === 'lualatex', 'paperCompilePdf accepts 1 as true; paperLatexCommand is stored')
}

// ---------- 24. the team flow with the OFFICE as editor (+ the consultation gate) ----------
console.log('\n[24] manual paper, office editor: parts → cross-review → consultation → finalise')
{
  const h = makeHost({ pluginModule })
  await h.callTool('vibe_v5_start', { problem: PROBLEM, researcherCount: 1 })
  await h.settleSpawns()
  // ONE verified object, so section 4 has real evidence to index.
  await h.callTool('vibe_v5_record_proposition', { id: 'p-paper', statement: '最终论文只整理已有证据，不得编造', value: 0.9, motive: '论文证据', p: 1 }, h.childAgent(h.childOf('r-1')))
  await h.callTool('vibe_v5_propose_verify', { target: 'p-paper', kind: 'proposition', reason: '论文证据' }, h.childAgent(h.childOf('r-1')))
  h.plannedVotes = new Map([['acad', 1], ['r-1', 1]])
  await h.drain(10)
  const sv = await h.callTool('vibe_v5_status', {})
  assert(sv.verified.indexOf('p-paper') !== -1, 'precondition: one object is verified (the paper needs evidence)')
  assert(sv.paper === null, 'NEGATIVE: a run that has NOT concluded does not auto-start a paper')
  // A second object is left UNDECIDED (both voters abstain), so section 8 has an unresolved item
  // that MUST be marked as such.
  await h.callTool('vibe_v5_set', { verdictMaxRounds: 1 })
  await h.callTool('vibe_v5_record_proposition', { id: 'p-open', statement: '仍未定论的对象必须显式标注', value: 0.5, motive: '未决项', p: 0.5 }, h.childAgent(h.childOf('r-1')))
  await h.callTool('vibe_v5_propose_verify', { target: 'p-open', kind: 'proposition', reason: '未决项' }, h.childAgent(h.childOf('r-1')))
  h.plannedVotes = new Map([['acad', 0.5], ['r-1', 0.5]])
  await h.drain(10)
  const su = await h.callTool('vibe_v5_status', {})
  assert(su.undecided.indexOf('p-open') !== -1, 'precondition: one object is recorded as 未定论 (got ' + JSON.stringify(su.undecided) + ')')
  h.plannedVotes = new Map()
  const started = await h.callTool('vibe_v5_paper', { lang: 'en', format: 'both', editor: 'office' })
  assert(started.ok === true && started.started === true && started.editor === 'office',
    'the manual paper starts with the office as its editor (' + JSON.stringify(started).slice(0, 130) + ')')
  await drivePaper(h)
  let st = await h.callTool('vibe_v5_status', {})
  assert(st.paper && st.paper.status === 'awaiting-editor' && st.paper.parts.length === 2 && st.paper.reviews.length === 2,
    '★ both permanent members wrote a part and cross-reviewed another part (' + JSON.stringify({ s: st.paper && st.paper.status, parts: st.paper && st.paper.parts.length, reviews: st.paper && st.paper.reviews.length }) + ')')
  const refused = await h.callTool('vibe_v5_finalize_paper', { decision: 'deliverable', note: 'x' })
  assert(refused.ok === false && refused.code === 'V5_PAPER_CONSULT_REQUIRED',
    '★ NEGATIVE: the office cannot finalise before consulting the institute (' + JSON.stringify(refused).slice(0, 140) + ')')
  const msg = await h.callTool('vibe_v5_message', { to: 'all', content: '请各自核对证据与结论，我们随后定稿。' })
  assert(msg.ok === true, 'the office message is delivered')
  await h.callTool('vibe_v5_meeting', { agenda: '定稿前审查：证据与结论是否一致', kind: 'sync' })
  await h.drain(12)
  st = await h.callTool('vibe_v5_status', {})
  assert(st.paper.consult.messages >= 1 && st.paper.consult.meetings >= 1,
    '★ the office consultation is RECORDED (messages=' + st.paper.consult.messages + ', meetings=' + st.paper.consult.meetings + ')')
  const fin = await h.callTool('vibe_v5_finalize_paper', { decision: 'deliverable', note: '已与全所逐条核对证据，术语与符号统一，结论与表决记录一致。', conclusion: '题设范围内结论成立。' })
  assert(fin.ok === true && fin.finalized === true, 'the office finalises after consulting (' + JSON.stringify(fin).slice(0, 150) + ')')
  assert(fin.compile === 'not-detected', '★ this machine has no LaTeX: the compile degrades to not-detected instead of failing (' + fin.compile + ')')
  const dir = paperDirOf(h, 'institute')
  const md = existsSync(join(dir, 'paper.md')) ? readFileSync(join(dir, 'paper.md'), 'utf8') : ''
  const tex = existsSync(join(dir, 'paper.tex')) ? readFileSync(join(dir, 'paper.tex'), 'utf8') : ''
  const meta = existsSync(join(dir, 'paper.meta.json')) ? JSON.parse(readFileSync(join(dir, 'paper.meta.json'), 'utf8')) : null
  const heads = (md.match(/^## \d+\. /gm) || []).length
  assert(heads === 9, '★ the md carries exactly the 9-section skeleton (got ' + heads + ')')
  assert(md.indexOf('p-paper') !== -1, '★ the verified proposition is listed with its evidence path')
  assert(md.indexOf('未定论：p-open') !== -1, '★ an undecided object is EXPLICITLY marked in the paper (never silently dropped or promoted)')
  assert(tex.indexOf('\\documentclass') !== -1 && /\\section\{1\. /.test(tex), '★ the tex version is generated from the same sections')
  assert(md.indexOf('已与全所逐条核对证据') !== -1, 'the office finalisation note is written into the paper')
  assert(!!meta && meta.editor === 'office' && meta.consultation.messages >= 1 && meta.consultation.meetings >= 1 && meta.compile.status === 'not-detected',
    'the meta records the editor, the consultation evidence and the compile result')
  assert(existsSync(join(dir, 'paper.log.md')), 'the paper log records who wrote/reviewed what')
  const instRoot = join(h.WS, 'VibeMath', 'Projects', 'default', 'Institutes', 'institute')
  const stray = listFilesUnder(instRoot).filter(p => /(^|\/)paper\.(md|tex|pdf|meta\.json|log\.md)$/i.test(p) && p.indexOf('Paper/institute/') !== 0)
  assert(stray.length === 0, '★ every paper artifact lives under Paper/<id>/ only (no Verified//State/ pollution): ' + JSON.stringify(stray))
  assert((await h.callTool('vibe_v5_status', {})).autoDone === false, 'a MANUAL paper does not conclude the run')
}

// ---------- 25. idempotency: a repeated trigger only fills missing artifacts ----------
console.log('\n[25] paper idempotency: repeated triggers only fill missing artifacts')
{
  const h = makeHost({ pluginModule })
  await h.callTool('vibe_v5_start', { problem: PROBLEM, researcherCount: 0 })
  await h.settleSpawns()
  const first = await h.callTool('vibe_v5_paper', {})
  assert(first.ok === true && first.started === true, 'the single-member institute starts its paper')
  await drivePaper(h)
  const dir = paperDirOf(h, 'institute')
  const metaPath = join(dir, 'paper.meta.json')
  assert(existsSync(join(dir, 'paper.md')) && existsSync(metaPath), 'the first run delivered md + meta')
  const meta1 = readFileSync(metaPath, 'utf8')
  const again = await h.callTool('vibe_v5_paper', {})
  assert(again.ok === true && again.alreadyFinalized === true, 'a repeated trigger reports alreadyFinalized instead of re-running the team (' + JSON.stringify(again).slice(0, 120) + ')')
  assert(readFileSync(metaPath, 'utf8') === meta1, '★ paper.meta.json is NOT rewritten (finalizedAt/inputs untouched)')
  unlinkSync(join(dir, 'paper.md'))
  const refill = await h.callTool('vibe_v5_paper', {})
  assert(refill.ok === true && existsSync(join(dir, 'paper.md')), '★ the missing artifact is refilled (' + JSON.stringify(refill.refill) + ')')
  assert(readFileSync(metaPath, 'utf8') === meta1, 'the refill did not touch the settled meta either')
  const forced = await h.callTool('vibe_v5_paper', { force: true, reason: 'manual force' })
  assert(forced.ok === true && forced.started === true && !forced.alreadyFinalized,
    '★ force re-runs the whole team flow instead of refilling (' + JSON.stringify(forced).slice(0, 120) + ')')
  const stF = await h.callTool('vibe_v5_status', {})
  assert(stF.paper.status === 'writing' && stF.paper.round === 1, 'the forced run restarted at round 1')
}

// ---------- 26. fake LaTeX: the success path produces paper.pdf ----------
console.log('\n[26] fake LaTeX compiler: success path produces paper.pdf')
{
  const fake = fakeLatex({ installed: ['xelatex', 'pdflatex'] })
  const h = makeHost({ pluginModule, subprocess: fake })
  await h.callTool('vibe_v5_start', { problem: PROBLEM, researcherCount: 0 })
  await h.settleSpawns()
  await h.callTool('vibe_v5_paper', { format: 'both' })
  await drivePaper(h)
  const st = await h.callTool('vibe_v5_status', {})
  assert(st.paper && st.paper.status === 'finalized' && st.paper.compile === 'compiled', 'the paper finalised with the fake compiler (' + JSON.stringify(st.paper && { s: st.paper.status, c: st.paper.compile }) + ')')
  const dir = paperDirOf(h, 'institute')
  assert(existsSync(join(dir, 'paper.pdf')), '★ paper.pdf was produced by the compiler subprocess inside Paper/<id>/')
  const meta = JSON.parse(readFileSync(join(dir, 'paper.meta.json'), 'utf8'))
  assert(meta.compile.status === 'compiled' && meta.compile.engine === 'xelatex' && meta.compile.attempts.length === 1,
    'the meta records compiled/xelatex on the FIRST attempt (' + JSON.stringify(meta.compile) + ')')
  assert(fake.calls.length >= 2 && fake.calls.every(c => c.args.indexOf('-interaction=nonstopmode') !== -1),
    '★ the engine ran twice with -interaction=nonstopmode (docs/final-paper.md §8)')
}

// ---------- 27. fake LaTeX: a failing package is repaired, then it degrades ----------
console.log('\n[27] fake LaTeX compiler: repair path and persistent-failure degradation')
{
  // The fake refuses `\\usepackage[hidelinks]{hyperref}`; the repair pass strips optional
  // packages, so attempt 3 succeeds (attempts 1-2 fail on the full tex).
  const fake = fakeLatex({ installed: ['xelatex'], failOn: /\\usepackage\[hidelinks\]\{hyperref\}/ })
  const h = makeHost({ pluginModule, subprocess: fake })
  await h.callTool('vibe_v5_start', { problem: PROBLEM, researcherCount: 0 })
  await h.settleSpawns()
  await h.callTool('vibe_v5_paper', { format: 'both' })
  await drivePaper(h)
  const dir = paperDirOf(h, 'institute')
  const meta = JSON.parse(readFileSync(join(dir, 'paper.meta.json'), 'utf8'))
  const at = meta.compile.attempts || []
  assert(meta.compile.status === 'compiled' && existsSync(join(dir, 'paper.pdf')), '★ the repair retry turned a failing compile into a PDF')
  assert(at.length === 3 && at[0].ok === false && at[1].ok === false && at[2].ok === true && at[2].label.indexOf('stripped') !== -1,
    '★ attempts: full FAIL → nonstopmode rerun FAIL → stripped-package SUCCESS (' + JSON.stringify(at.map(a => a.label + ':' + a.ok)) + ')')
  // A compiler that always fails must degrade, not throw, and must not block finalisation.
  const fake2 = fakeLatex({ installed: ['xelatex'], alwaysFail: true })
  const h2 = makeHost({ pluginModule, subprocess: fake2 })
  await h2.callTool('vibe_v5_start', { problem: PROBLEM, researcherCount: 0 })
  await h2.settleSpawns()
  const fin = await h2.callTool('vibe_v5_paper', { format: 'both' })
  await drivePaper(h2)
  const st2 = await h2.callTool('vibe_v5_status', {})
  const dir2 = paperDirOf(h2, 'institute')
  const meta2 = JSON.parse(readFileSync(join(dir2, 'paper.meta.json'), 'utf8'))
  assert(fin.ok === true && st2.paper.status === 'finalized' && st2.paper.compile === 'failed',
    '★ a persistent compile failure DEGRADES (finalisation still succeeds, compile=failed) (' + st2.paper.compile + ')')
  assert(existsSync(join(dir2, 'paper.tex')) && existsSync(join(dir2, 'paper.md')) && !existsSync(join(dir2, 'paper.pdf')),
    'tex+md are kept and no bogus pdf is written')
  assert(/\\title\{/.test(readFileSync(join(dir2, 'paper.tex'), 'utf8')),
    '★ the DELIVERED tex is the canonical generated one, not the minimal repair variant used by the last attempt')
  assert((meta2.compile.attempts || []).length === 4, '★ the retry plan is CAPPED at 4 attempts (full → nonstopmode → stripped/engine-swap → minimal template)')
  assert((meta2.warnings || []).join(' ').indexOf('编译失败') !== -1, 'the failure is reported as a warning in the meta')
  // Engine swap: the first installed engine fails, so attempt 3 (the NEXT engine) succeeds.
  const fake3 = fakeLatex({ installed: ['xelatex', 'pdflatex'], failEngines: ['xelatex'] })
  const h3 = makeHost({ pluginModule, subprocess: fake3 })
  await h3.callTool('vibe_v5_start', { problem: PROBLEM, researcherCount: 0 })
  await h3.settleSpawns()
  await h3.callTool('vibe_v5_paper', { format: 'both' })
  await drivePaper(h3)
  const dir3 = paperDirOf(h3, 'institute')
  const meta3 = JSON.parse(readFileSync(join(dir3, 'paper.meta.json'), 'utf8'))
  assert(meta3.compile.status === 'compiled' && meta3.compile.engine === 'pdflatex' && (meta3.compile.attempts || []).length === 3,
    '★ engine swap: xelatex fails twice, pdflatex succeeds on the third attempt (' + JSON.stringify({ e: meta3.compile.engine, n: (meta3.compile.attempts || []).length }) + ')')
  // paperFormat=md with paperCompilePdf=true must skip compilation SILENTLY (no "missing tex"
  // warning) — docs/final-paper.md §8.
  const hm = makeHost({ pluginModule, subprocess: fakeLatex({ installed: ['xelatex'] }) })
  await hm.callTool('vibe_v5_start', { problem: PROBLEM, researcherCount: 0 })
  await hm.settleSpawns()
  await hm.callTool('vibe_v5_paper', { format: 'md' })
  await drivePaper(hm)
  const dm = paperDirOf(hm, 'institute')
  const metam = JSON.parse(readFileSync(join(dm, 'paper.meta.json'), 'utf8'))
  assert(existsSync(join(dm, 'paper.md')) && !existsSync(join(dm, 'paper.tex')) && !existsSync(join(dm, 'paper.pdf')),
    'paperFormat=md delivers md only (no tex, no pdf)')
  assert(metam.compile.status === 'skipped' && !/编译|tex/.test((metam.warnings || []).join(' ')),
    '★ paperFormat=md skips compilation silently (no missing-tex warning): ' + JSON.stringify(metam.warnings))
}

// ---------- 28. office-only surface + id normalisation ----------
console.log('\n[28] the final-paper surface is office-only and its directory id cannot escape Paper/')
{
  const h = makeHost({ pluginModule })
  await h.callTool('vibe_v5_start', { problem: PROBLEM, researcherCount: 1 })
  await h.settleSpawns()
  const member = h.childAgent(h.childOf('r-1'))
  const asMember = await h.callTool('vibe_v5_paper', {}, member)
  assert(asMember.ok === false && asMember.code === 'V5_NOT_OFFICE', 'a member cannot start the paper (' + JSON.stringify(asMember).slice(0, 100) + ')')
  const finAsMember = await h.callTool('vibe_v5_finalize_paper', { decision: 'deliverable', note: 'x' }, member)
  assert(finAsMember.ok === false && finAsMember.code === 'V5_NOT_OFFICE', 'a member cannot finalise the paper')
  // A traversal-shaped institute name must never become a path in the paper id.
  const h2 = makeHost({ pluginModule })
  await h2.callTool('vibe_v5_configure', { institute: 'evil/../x' })
  await h2.callTool('vibe_v5_start', { problem: PROBLEM, researcherCount: 0 })
  await h2.settleSpawns()
  await h2.callTool('vibe_v5_paper', {})
  await drivePaper(h2)
  const p2 = (await h2.callTool('vibe_v5_status', {})).paper
  const id = String(p2.dir || '').replace(/^Paper\//, '').replace(/\/$/, '')
  assert(id.length > 0 && id.indexOf('/') === -1 && id.indexOf('\\') === -1 && id !== '.' && id !== '..',
    '★ the paper directory id is ONE normalised name (never a path): ' + JSON.stringify(id))
  assert(existsSync(join(h2.WS, 'VibeMath', 'Projects', 'default', 'Institutes', 'x', 'Paper', id, 'paper.log.md')),
    'the paper landed under Paper/<id>/ inside the resolved institute tree')
}

// ---------- 29. /v5 paper: overrides, force, kind:error; finalPaper=false gates AUTO ----------
console.log('\n[29] /v5 paper: one-shot overrides, kind:error, and finalPaper=false')
{
  const h = makeHost({ pluginModule })
  await h.callTool('vibe_v5_start', { problem: PROBLEM, researcherCount: 0 })
  await h.settleSpawns()
  const cmd = h.commandRegs.find(c => c.name === 'v5')
  assert(!!cmd, 'the /v5 command is registered')
  const bad = await cmd.handler({ agent: h.ROOT, rawInput: 'paper bogus=1' })
  assert(bad.kind === 'error', '★ an unknown paper option is a FAILED command (kind:error): ' + String(bad.text).slice(0, 100))
  const memberCall = await cmd.handler({ agent: h.childAgent(h.childOf('acad')), rawInput: 'paper' })
  assert(memberCall.kind === 'error', 'a member child cannot drive the /v5 control line')
  const okCmd = await cmd.handler({ agent: h.ROOT, rawInput: 'paper lang=en format=tex editor=office' })
  assert(okCmd.kind === 'success', 'the paper subcommand succeeds: ' + String(okCmd.text).slice(0, 120))
  const st = await h.callTool('vibe_v5_status', {})
  assert(st.paper && st.paper.lang === 'en' && st.paper.format === 'tex' && st.paper.editor === 'office',
    '★ the command overrides language/format/editor FOR THIS PAPER (' + JSON.stringify({ l: st.paper.lang, f: st.paper.format, e: st.paper.editor }) + ')')
  assert(st.params.paperLanguage === 'zh' && st.params.paperEditor === 'academician',
    'the one-shot overrides do NOT rewrite the persisted params')
  // finalPaper=false: the AUTO trigger is off, the run concludes immediately, the manual path says so.
  const h2 = makeHost({ pluginModule })
  await h2.callTool('vibe_v5_start', { problem: PROBLEM, researcherCount: 1 })
  await h2.settleSpawns()
  await h2.callTool('vibe_v5_set', { finalPaper: false })
  h2.solvePlan = true
  await h2.callTool('vibe_v5_meeting', { agenda: '是否已解决原问题？', kind: 'solve-vote' })
  await h2.drain(24)
  const s2 = await h2.callTool('vibe_v5_status', {})
  assert(s2.autoDone === true && !s2.paper, '★ finalPaper=false: the run concludes WITHOUT starting a paper (' + JSON.stringify({ autoDone: s2.autoDone, paper: s2.paper }) + ')')
  const manual = await h2.callTool('vibe_v5_paper', {})
  assert(manual.ok === true && manual.autoDisabled === true && /自动已关闭/.test(String(manual.note)),
    'the manual command still works when finalPaper=false and says the automatic path is off (' + JSON.stringify(manual).slice(0, 220) + ')')
}

// ---------- 30. unanimity is required; the round cap records the disagreement ----------
console.log('\n[30] unanimity: an objection does NOT finalise, the cap records the disagreement in the appendix')
{
  const h = makeHost({ pluginModule })
  await h.callTool('vibe_v5_start', { problem: PROBLEM, researcherCount: 0 })
  await h.settleSpawns()
  const objecting = () => ({ paper_review: { deliverable: false, comments: '证据不足，需补充' } })
  await h.callTool('vibe_v5_paper', {})
  // Round 1 stopped after its write+review: the objection must NOT finalise anything.
  await drivePaper(h, { max: 2, review: () => objecting() })
  let st = await h.callTool('vibe_v5_status', {})
  assert(st.paper && st.paper.status === 'writing' && st.paper.round === 2,
    '★ an objection does NOT finalise: the flow iterates to the next round (status=' + st.paper.status + ', round=' + st.paper.round + ')')
  assert(st.paper.disagreement.length >= 1, 'the objection is recorded as a disagreement')
  // Keep objecting; at the cap the editor (academician) is asked and asks to revise again — the
  // spec says a cap is reached, a warning is recorded and the disagreement goes into the appendix.
  await drivePaper(h, {
    review: () => objecting(),
    final: () => ({ paper_final: { decision: 'revise', note: '仍有未达成一致的意见' } }),
  })
  const st2 = await h.callTool('vibe_v5_status', {})
  assert(st2.paper && st2.paper.status === 'finalized' && st2.paper.forcedAfterCap === true,
    '★ the round cap was enforced, the disagreement recorded, and the editor finalised (' + JSON.stringify({ s: st2.paper && st2.paper.status, cap: st2.paper && st2.paper.forcedAfterCap }) + ')')
  assert((st2.paper.warnings || []).join(' ').indexOf('上限') !== -1, 'the cap produced a WARNING (' + JSON.stringify(st2.paper.warnings) + ')')
  const md = readFileSync(join(paperDirOf(h, 'institute'), 'paper.md'), 'utf8')
  assert(md.indexOf('分歧记录') !== -1 && md.indexOf('证据不足，需补充') !== -1,
    '★ the unresolved disagreement is written into the APPENDIX of the paper')
}

// ---------- 31. the DEFAULT auto trigger: the paper phase runs BEFORE completion ----------
console.log('\n[31] a unanimous solve vote with finalPaper=true enters the paper phase BEFORE completion')
{
  // The mutant guard: deleting the auto-trigger branch in `checkSolved`
  // (`if (params.finalPaper !== false)` -> `if (false)`) used to leave this whole suite green,
  // because every other paper case drives the flow through the MANUAL vibe_v5_paper tool and
  // the only auto assertion was "finalPaper=false => no paper" (which the mutant satisfies).
  // This case pins the real contract: the default path must NOT complete the run until the
  // paper is finalised, and the run must be observably alive with a paper in progress.
  const h = makeHost({ pluginModule })
  await h.callTool('vibe_v5_start', { problem: PROBLEM, researcherCount: 1 })
  await h.settleSpawns()
  await h.callTool('vibe_v5_set', { activityTimeoutMs: 50 })
  h.solvePlan = true
  await h.callTool('vibe_v5_meeting', { agenda: '是否已解决原问题？', kind: 'solve-vote' })
  await h.drain(24)
  const mid = await h.callTool('vibe_v5_status', {})
  assert(mid.autoDone === false,
    '★ a unanimous solve vote with finalPaper=true does NOT complete the run immediately (got autoDone=' + mid.autoDone + ')')
  const p0 = mid.paper || {}
  assert(!!mid.paper && p0.status !== 'finalized',
    '★ ... it ENTERS the paper phase instead (' + JSON.stringify({ s: p0.status, e: p0.editor }) + ')')
  assert(p0.editor === 'academician' && p0.completesRun === true,
    'the automatic run is edited by the wakeable academician and is marked as completing the run (' + JSON.stringify({ e: p0.editor, c: p0.completesRun }) + ')')
  assert(mid.running === true, 'the run stays ALIVE while the paper phase runs (the machinery would refuse a concluded institute)')
  const capture = []
  await drivePaper(h, { capture })
  let done = null
  for (let i = 0; i < 40; i++) {
    done = await h.callTool('vibe_v5_status', {})
    if (done.autoDone) break
    await drivePaper(h, { max: 4, capture })
    await sleep(20)
  }
  assert(done.autoDone === true && done.running === false,
    '★ the run is marked complete only AFTER the paper finalised (' + JSON.stringify({ a: done.autoDone, r: done.running }) + ')')
  assert(done.paper && done.paper.status === 'finalized', 'the paper reached the finalized stage (' + JSON.stringify(done.paper && done.paper.status) + ')')
  assert(existsSync(join(paperDirOf(h, 'institute'), 'paper.md')), 'the automatic path delivered Paper/<id>/paper.md')
  // The members' own prompts carry the evidence-only clause (never invent content).
  const write = capture.find(c => c.kind === 'write')
  assert(!!write && /不得编造/.test(write.prompt) && /只写你自己库里已有证据支撑/.test(write.prompt),
    '★ the paper write prompt says only-evidence/no-fabrication: ' + JSON.stringify(write && write.prompt.slice(0, 120)))
  assert(!!write && /未决 \/ 被否证的条目必须显式标注/.test(write.prompt), 'the prompt requires undecided/refuted items to be marked explicitly')
}

// ---------- 32. a run that has NOT closed writes no Paper/ directory ----------
console.log('\n[32] a run that has NOT closed writes NO Paper/ directory')
{
  const h = makeHost({ pluginModule })
  await h.callTool('vibe_v5_start', { problem: PROBLEM, researcherCount: 1 })
  await h.settleSpawns()
  // Real, non-closing work: one verification concludes, and the solve vote is NOT unanimous.
  await h.callTool('vibe_v5_record_proposition', { id: 'p-not-closed', statement: '未收口就不得产出论文目录', value: 0.8, motive: '负用例', p: 1 }, h.childAgent(h.childOf('r-1')))
  await h.callTool('vibe_v5_propose_verify', { target: 'p-not-closed', kind: 'proposition', reason: '负用例' }, h.childAgent(h.childOf('r-1')))
  h.plannedVotes = new Map([['acad', 1], ['r-1', 1]])
  await h.drain(12)
  h.solvePlan = false
  await h.callTool('vibe_v5_meeting', { agenda: '是否已解决？（未达成一致）', kind: 'solve-vote' })
  await h.drain(16)
  const st = await h.callTool('vibe_v5_status', {})
  assert(st.autoDone === false && !st.paper, 'the run is still open and no paper phase started (' + JSON.stringify({ a: st.autoDone, p: st.paper }) + ')')
  const paperRoot = join(h.WS, 'VibeMath', 'Projects', 'default', 'Institutes', 'institute', 'Paper')
  assert(!existsSync(paperRoot), '★ a run that has NOT closed writes no Paper/ directory at all')
  const rel = await h.callTool('vibe_v5_report', {})
  assert(String(rel.report || '').indexOf('最终论文') !== -1 && String(rel.report || '').indexOf('尚未开始') !== -1,
    'the report tells the operator the paper has not started yet')
}

// ---------- 33. an existing paper.pdf is never clobbered ----------
console.log('\n[33] an existing Paper/<id>/paper.pdf is never overwritten or deleted')
{
  const PRE = '%PDF-1.4 PRE-EXISTING DELIVERY\n'
  // (a) a compiler that WOULD succeed: the existing pdf must make the flow skip compilation.
  const fake = fakeLatex({ installed: ['xelatex'] })
  const h = makeHost({ pluginModule, subprocess: fake })
  await h.callTool('vibe_v5_start', { problem: PROBLEM, researcherCount: 0 })
  await h.settleSpawns()
  const dir = paperDirOf(h, 'institute')
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'paper.pdf'), PRE, 'utf8')
  await h.callTool('vibe_v5_paper', { format: 'both' })
  await drivePaper(h)
  assert(readFileSync(join(dir, 'paper.pdf'), 'utf8') === PRE, '★ the pre-existing pdf is byte-identical after the run (never overwritten)')
  assert(fake.calls.length === 0, '★ compilation was SKIPPED entirely because a pdf already existed (never clobber)')
  const meta = JSON.parse(readFileSync(join(dir, 'paper.meta.json'), 'utf8'))
  assert(meta.compile.status === 'kept-existing', 'the meta records compile=kept-existing (' + meta.compile.status + ')')
  // (b) a compiler that ALWAYS FAILS: still skipped, so a failing toolchain cannot destroy it.
  const fake2 = fakeLatex({ installed: ['xelatex'], alwaysFail: true })
  const h2 = makeHost({ pluginModule, subprocess: fake2 })
  await h2.callTool('vibe_v5_start', { problem: PROBLEM, researcherCount: 0 })
  await h2.settleSpawns()
  const dir2 = paperDirOf(h2, 'institute')
  mkdirSync(dir2, { recursive: true })
  writeFileSync(join(dir2, 'paper.pdf'), PRE, 'utf8')
  await h2.callTool('vibe_v5_paper', { format: 'both' })
  await drivePaper(h2)
  assert(readFileSync(join(dir2, 'paper.pdf'), 'utf8') === PRE, '★ even an always-failing toolchain leaves the existing pdf untouched')
  assert(fake2.calls.length === 0, 'no compiler process was launched for the already-delivered pdf')
}

// ---------- 34. Lean async/initiative/search params: closed schema + coercion ----------
console.log('\n[34] Lean async params: closed schema, coercion, visibleParams, embedded sha256')
{
  const h = makeHost({ pluginModule })
  const setSpec = h.toolRegs.find(t => t.name === 'vibe_v5_set')
  const keys = ['leanAsync', 'leanInitiative', 'leanSearchPaths', 'leanJobsMaxParallel']
  assert(keys.every(k => Object.prototype.hasOwnProperty.call(setSpec.parameters.properties, k)),
    '★ vibe_v5_set advertises all four new Lean keys (the schema is closed, so an unlisted key is unreachable)')
  assert(JSON.stringify(setSpec.parameters.properties.leanInitiative.enum) === JSON.stringify(['off', 'normal', 'eager']),
    'leanInitiative is a closed enum in the schema')
  const p0 = (await h.callTool('vibe_v5_status', {})).params
  assert(p0.leanAsync === true && p0.leanInitiative === 'normal' && Array.isArray(p0.leanSearchPaths) && p0.leanSearchPaths.length === 0 && p0.leanJobsMaxParallel === 1,
    '★ the documented defaults are live and visibleParams exposes all four (' + JSON.stringify({ a: p0.leanAsync, i: p0.leanInitiative, sp: p0.leanSearchPaths, mp: p0.leanJobsMaxParallel }) + ')')
  const r = await h.callTool('vibe_v5_set', { leanAsync: 'false', leanInitiative: 'bogus', leanJobsMaxParallel: 0, leanSearchPaths: '/libA, /libB' })
  assert(r.params.leanAsync === false, "★ leanAsync:'false' normalises to FALSE (a string must never stay truthy)")
  assert(r.params.leanInitiative === 'normal', 'a bogus leanInitiative falls back to the documented default')
  assert(r.params.leanJobsMaxParallel === 1, 'leanJobsMaxParallel:0 floors at 1')
  assert(JSON.stringify(r.params.leanSearchPaths) === JSON.stringify(['/libA', '/libB']),
    'leanSearchPaths accepts a comma string and keeps the given order (' + JSON.stringify(r.params.leanSearchPaths) + ')')
  const help = String(setSpec.description || '')
  assert(/leanAsync/.test(help) && /leanInitiative/.test(help) && /leanSearchPaths/.test(help) && /leanJobsMaxParallel/.test(help),
    'the set-tool help text names all four (the switch is discoverable)')
  const H = pluginModule.__testHelpers
  assert(H.sha256Hex('abc') === 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad' &&
    H.sha256Hex('') === 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    '★ the embedded sha256 matches the published vectors (job ids/dedupe rest on it)')
  assert(H.sha256Hex('中文abc') === createHash('sha256').update('中文abc', 'utf8').digest('hex'), 'it also matches node:crypto on non-ASCII input')
  assert(H.leanHasSearchFlag(['-R', 'x']) && H.leanHasSearchFlag(['--search-path=o']) && H.leanHasSearchFlag(['--root', 'r']) && !H.leanHasSearchFlag(['-j4']),
    'the search-flag guard recognises -R / --search-path(=) / --root and nothing else')
}

// ---------- 35. async Lean: enqueue → settle(ok) → passed ----------
console.log('\n[35] async Lean: enqueue returns at once, settle(ok) is the only path to passed')
{
  const fake = fakeLean({})
  const h = makeHost({ pluginModule, subprocess: fake })
  await h.callTool('vibe_v5_start', { problem: PROBLEM, researcherCount: 0 })
  await h.settleSpawns()
  await h.callTool('vibe_v5_set', { formalVerify: 'encourage' })
  const arch = await h.callTool('vibe_v5_lean_archive', { kind: 'proof', target: 'p-async', content: 'theorem p_async : 1 + 1 = 2 := by decide\n' })
  assert(arch.ok === true && arch.async && arch.async.state === 'queued' && arch.status === 'attempted',
    '★ the archive ENQUEUES and returns async:{jobId,state} with the object at attempted (' + JSON.stringify(arch).slice(0, 150) + ')')
  assert(fake.calls.length === 0, '★ the compiler has NOT been started when the tool returns')
  const st0 = await h.callTool('vibe_v5_status', {})
  assert(st0.formal.passed.indexOf('p-async') === -1, 'the queued object is not passed')
  const listed = await h.callTool('vibe_v5_lean_job', {})
  assert(listed.ok === true && listed.jobs.some(j => j.jobId === arch.jobId), 'lean_job lists the job (' + JSON.stringify(listed.jobs).slice(0, 140) + ')')
  const waited = await h.callTool('vibe_v5_lean_job', { jobId: arch.jobId, waitMs: 3000 })
  assert(waited.ok === true && waited.job.state === 'settled' && waited.job.exitCode === 0 && waited.job.proof === 'Verified/Lean/p-async.lean',
    '★ lean_job {jobId,waitMs} waits for the settle and reports the archived proof (' + JSON.stringify(waited.job).slice(0, 170) + ')')
  const st1 = await h.callTool('vibe_v5_status', {})
  assert(st1.formal.passed.indexOf('p-async') !== -1 && st1.formal.objects.find(o => o.target === 'p-async').async.jobId === arch.jobId,
    '★ ONLY the settled(ok) job set the object passed, and its receipt is on the record')
  assert(existsSync(join(h.WS, 'VibeMath', 'Projects', 'default', 'Institutes', 'institute', 'Verified', 'Lean', 'p-async.lean')),
    'the proof is archived under Verified/Lean/<id>.lean')
  const argv = fake.calls[0].argv
  const root = join(h.WS, 'VibeMath').replace(/\\/g, '/')
  const si = argv.indexOf('--search-path')
  assert(si > 0 && argv[si + 1] === root && si + 2 === argv.length - 1 && /\.lean$/.test(argv[argv.length - 1]),
    '★ argv carries `--search-path <ABSOLUTE VibeMath root>` right before the file (' + JSON.stringify(argv) + ')')
  assert(fake.calls.length === 1, 'exactly one compile ran for the settle (got ' + fake.calls.length + ')')
}

// ---------- 36. failure / timeout / dispose never verify ----------
console.log('\n[36] async Lean: failure, timeout and session dispose never verify')
{
  const fakeFail = fakeLean({ alwaysFail: true })
  const h = makeHost({ pluginModule, subprocess: fakeFail })
  await h.callTool('vibe_v5_start', { problem: PROBLEM, researcherCount: 0 })
  await h.settleSpawns()
  const a = await h.callTool('vibe_v5_lean_archive', { kind: 'proof', target: 'p-fail', content: 'theorem p_fail : 1 = 2 := by decide\n' })
  const w = await h.callTool('vibe_v5_lean_job', { jobId: a.jobId, waitMs: 3000 })
  assert(w.job.state === 'failed', '★ a failed compile settles as failed (' + w.job.state + ')')
  assert(!existsSync(join(h.WS, 'VibeMath', 'Projects', 'default', 'Institutes', 'institute', 'Verified', 'Lean', 'p-fail.lean')),
    '★ no Verified/Lean file is written for a failure')
  assert((await h.callTool('vibe_v5_status', {})).formal.passed.indexOf('p-fail') === -1, 'the failed object stays attempted')
  // (b) the budget terminates the process
  const fakeHang = fakeLean({ defer: true })
  const h2 = makeHost({ pluginModule, subprocess: fakeHang })
  await h2.callTool('vibe_v5_start', { problem: PROBLEM, researcherCount: 0 })
  await h2.settleSpawns()
  seedLeanFile(h2, 'Formal/good.lean', 'theorem good : 1 + 1 = 2 := by decide\n')
  const r = await h2.callTool('vibe_v5_lean_run', { file: 'Formal/good.lean', timeout_ms: 1000 })
  assert(r.ok === true && r.async.state === 'queued', 'the run is queued')
  const w2 = await h2.callTool('vibe_v5_lean_job', { jobId: r.jobId, waitMs: 5000 })
  assert(w2.job.state === 'timeout' && fakeHang.terminated >= 1,
    '★ the per-job budget TERMINATED the process and the job is timeout (' + JSON.stringify({ s: w2.job.state, t: fakeHang.terminated }) + ')')
  // (c) session dispose (the plugin-unload disposer)
  const fakeGate = fakeLean({ defer: true })
  const h3 = makeHost({ pluginModule, subprocess: fakeGate })
  await h3.callTool('vibe_v5_start', { problem: PROBLEM, researcherCount: 0 })
  await h3.settleSpawns()
  const a3 = await h3.callTool('vibe_v5_lean_archive', { kind: 'proof', target: 'p-dispose', content: 'theorem p_dispose : 1 + 1 = 2 := by decide\n' })
  await sleep(40)
  assert(fakeGate.calls.length >= 1, 'precondition: the compile is in flight')
  h3.effectDisposers[0]()
  assert(fakeGate.terminated >= 1, '★ dispose TERMINATED the in-flight compiler (no orphan process)')
  const w3 = await h3.callTool('vibe_v5_lean_job', { jobId: a3.jobId })
  assert(w3.job.state === 'interrupted', '★ the job is marked interrupted, not settled (' + w3.job.state + ')')
  assert((await h3.callTool('vibe_v5_status', {})).formal.passed.indexOf('p-dispose') === -1, '★ dispose NEVER verifies an object')
}

// ---------- 37. content-hash dedupe ----------
console.log('\n[37] identical re-archive is de-duplicated (no rewrite, no recompile)')
{
  const fake = fakeLean({})
  const h = makeHost({ pluginModule, subprocess: fake })
  await h.callTool('vibe_v5_start', { problem: PROBLEM, researcherCount: 0 })
  await h.settleSpawns()
  const PROOF = 'theorem p_dup : 2 + 2 = 4 := by decide\n'
  const one = await h.callTool('vibe_v5_lean_archive', { kind: 'proof', target: 'p-dup', content: PROOF })
  await h.callTool('vibe_v5_lean_job', { jobId: one.jobId, waitMs: 3000 })
  const before = fake.calls.length
  const again = await h.callTool('vibe_v5_lean_archive', { kind: 'proof', target: 'p-dup', content: PROOF })
  assert(again.deduped === true && fake.calls.length === before,
    '★ identical content is deduped: no new compile (' + JSON.stringify({ d: again.deduped, before, after: fake.calls.length }) + ')')
  const diff = await h.callTool('vibe_v5_lean_archive', { kind: 'proof', target: 'p-dup', content: PROOF + '-- changed\n' })
  assert(diff.deduped !== true && diff.async && diff.async.state === 'queued', 'different content is NOT deduped (a new job is queued)')
  const DEF = 'def ZDup := Fin 2\n'
  const d1 = await h.callTool('vibe_v5_lean_archive', { kind: 'def', name: 'ZDup', content: DEF })
  await h.callTool('vibe_v5_lean_job', { jobId: d1.jobId, waitMs: 3000 })
  const callsAfter = fake.calls.length
  const d2 = await h.callTool('vibe_v5_lean_archive', { kind: 'def', name: 'ZDup', content: DEF })
  assert(d2.deduped === true && fake.calls.length === callsAfter, '★ the global library dedupes on the same content hash too')
}

// ---------- 38. lean_read: verbatim text + path guard ----------
console.log('\n[38] lean_read returns archived text verbatim and refuses a path-shaped name')
{
  const fake = fakeLean({})
  const h = makeHost({ pluginModule, subprocess: fake })
  await h.callTool('vibe_v5_start', { problem: PROBLEM, researcherCount: 0 })
  await h.settleSpawns()
  const body = 'def ZRead : Nat := 7\n'
  const a = await h.callTool('vibe_v5_lean_archive', { kind: 'def', name: 'ZRead', content: body })
  await h.callTool('vibe_v5_lean_job', { jobId: a.jobId, waitMs: 3000 })
  const rd = await h.callTool('vibe_v5_lean_read', { name: 'ZRead' })
  assert(rd.ok === true && rd.kind === 'lib' && rd.text === body && rd.bytes === body.length && /^[0-9a-f]{64}$/.test(rd.sha256) && rd.truncated === false,
    '★ lean_read returns the archived text verbatim with sha/bytes (' + JSON.stringify({ k: rd.kind, b: rd.bytes }) + ')')
  const esc = await h.callTool('vibe_v5_lean_read', { name: '../ZRead' })
  assert(esc.ok === false && esc.code === 'V5_INVALID_ARGUMENT', 'a path-shaped name is REFUSED, never sanitised into another file (' + JSON.stringify(esc).slice(0, 90) + ')')
  assert((await h.callTool('vibe_v5_lean_read', { name: 'C:/x/ZRead' })).ok === false, 'an absolute name is refused')
  const miss = await h.callTool('vibe_v5_lean_read', { name: 'NoSuchThing' })
  assert(miss.ok === false && miss.code === 'V5_NOT_FOUND', 'an unknown name is V5_NOT_FOUND')
  assert((await h.callTool('vibe_v5_lean_read', { name: 'ZRead', kind: 'bogus' })).ok === false, 'a bogus kind is refused')
}

// ---------- 39. a job only settles the BUILD CONTEXT it was queued under ----------
console.log('\n[39] a job only settles the build context it was queued under')
{
  const fake = fakeLean({ defer: true })
  const h = makeHost({ pluginModule, subprocess: fake })
  await h.callTool('vibe_v5_start', { problem: PROBLEM, researcherCount: 0 })
  await h.settleSpawns()
  seedLeanFile(h, 'Formal/good.lean', 'theorem good : 1 + 1 = 2 := by decide\n')
  await h.callTool('vibe_v5_lean_run', { file: 'Formal/good.lean' })
  await sleep(40)
  const proof = await h.callTool('vibe_v5_lean_archive', { kind: 'proof', target: 'p-ctx', content: 'theorem p_ctx : 3 + 3 = 6 := by decide\n' })
  await h.callTool('vibe_v5_set', { leanArgs: ['-Dctx=1'] })     // retune AFTER queueing
  for (let i = 0; i < 10; i++) { fake.releaseAll(); await sleep(25) }
  const w = await h.callTool('vibe_v5_lean_job', { jobId: proof.jobId, waitMs: 1000 })
  assert(w.job.state === 'failed' && w.job.buildMatched === false,
    '★ a job compiled under retuned args does NOT settle (' + JSON.stringify({ s: w.job.state, b: w.job.buildMatched }) + ')')
  const st = await h.callTool('vibe_v5_status', {})
  assert(st.formal.passed.indexOf('p-ctx') === -1, '★ the object stays attempted on a build-context mismatch')
  assert(!existsSync(join(h.WS, 'VibeMath', 'Projects', 'default', 'Institutes', 'institute', 'Verified', 'Lean', 'p-ctx.lean')),
    'no Verified/Lean file for a mismatched build')
  // (b) the CONTENT changed after the job was queued: the compile succeeds, but it compiled
  // something else — the object must stay attempted.
  const blocker2 = await h.callTool('vibe_v5_lean_run', { file: 'Formal/good.lean' })
  await sleep(40)
  const p2 = await h.callTool('vibe_v5_lean_archive', { kind: 'proof', target: 'p-hash', content: 'theorem p_hash : 4 + 4 = 8 := by decide\n' })
  seedLeanFile(h, 'Formal/p-hash.lean', 'theorem p_hash : 4 + 4 = 8 := by decide\n-- edited while queued\n')
  for (let i = 0; i < 10; i++) { fake.releaseAll(); await sleep(25) }
  const w2 = await h.callTool('vibe_v5_lean_job', { jobId: p2.jobId, waitMs: 1000 })
  assert(w2.job.exitCode === 0 && w2.job.state === 'failed' && w2.job.buildMatched === true,
    '★ exit 0 with CHANGED content does not settle either (' + JSON.stringify({ s: w2.job.state, e: w2.job.exitCode, b: w2.job.buildMatched, blocker: blocker2.jobId }) + ')')
  assert(!existsSync(join(h.WS, 'VibeMath', 'Projects', 'default', 'Institutes', 'institute', 'Verified', 'Lean', 'p-hash.lean')),
    'a changed-content compile writes no proof either')
}

// ---------- 40. leanJobsMaxParallel (default 1 = serial) ----------
console.log('\n[40] leanJobsMaxParallel caps simultaneous compiles')
{
  const fake = fakeLean({ defer: true })
  const h = makeHost({ pluginModule, subprocess: fake })
  await h.callTool('vibe_v5_start', { problem: PROBLEM, researcherCount: 0 })
  await h.settleSpawns()
  seedLeanFile(h, 'Formal/a.lean', 'theorem a : 1 = 1 := rfl\n')
  seedLeanFile(h, 'Formal/b.lean', 'theorem b : 2 = 2 := rfl\n')
  await h.callTool('vibe_v5_lean_run', { file: 'Formal/a.lean' })
  await h.callTool('vibe_v5_lean_run', { file: 'Formal/b.lean' })
  await sleep(50)
  assert(fake.calls.length === 1, '★ with the default maxParallel=1 only ONE compile is in flight (got ' + fake.calls.length + ')')
  const listed = await h.callTool('vibe_v5_lean_job', {})
  assert(listed.maxParallel === 1 && listed.jobs.filter(j => j.state === 'queued').length === 1,
    'lean_job reports maxParallel=1 with the second job queued (' + JSON.stringify(listed).slice(0, 150) + ')')
  const q = listed.jobs.find(j => j.state === 'queued')
  await h.callTool('vibe_v5_set', { leanJobsMaxParallel: 2 })
  await h.callTool('vibe_v5_lean_job', { jobId: q.jobId, waitMs: 150 })
  await sleep(30)
  assert(fake.calls.length === 2, '★ raising maxParallel to 2 starts the queued job as well (got ' + fake.calls.length + ')')
  for (let i = 0; i < 8; i++) { fake.releaseAll(); await sleep(20) }
}

// ---------- 41. the daily/verify Lean text is gated by leanInitiative ----------
console.log('\n[41] leanInitiative gates the daily Lean reminders; the async rule is in both blocks')
{
  const h = makeHost({ pluginModule })
  await h.callTool('vibe_v5_start', { problem: PROBLEM, researcherCount: 1 })
  await h.settleSpawns()
  const promptFor = async (member, plan) => {
    if (plan) await h.callTool('vibe_v5_set', plan)
    await h.callTool('vibe_v5_say', { to: member, text: '请继续推进。' }, h.childAgent(h.childOf('acad')))
    const w = await h.peekWakeOf(member, 3000)
    if (!w) return ''
    h.fireEnd(w.childId, { progress: '收到。', solved: false, contextPct: 10 })
    await sleep(25)
    return w.text
  }
  const normal = await promptFor('r-1', { formalVerify: 'off', leanInitiative: 'normal' })
  assert(normal.indexOf('【顺手形式化') === -1, "leanInitiative=normal + formalVerify=off keeps today's behaviour (no daily Lean line)")
  const eager = await promptFor('r-1', { leanInitiative: 'eager' })
  assert(eager.indexOf('【顺手形式化') !== -1 && eager.indexOf('**主动**') !== -1,
    '★ leanInitiative=eager injects the daily line even when formalVerify is off')
  assert(eager.indexOf('判断标准：①') !== -1 && eager.indexOf('先 vibe_v5_lean_lib 查已有库') !== -1 && eager.indexOf('**查不到再新写**') !== -1,
    '★ the three criteria + reuse-first ride in the daily line')
  assert(eager.indexOf('import Formal.Lib.<name>') !== -1 && eager.indexOf('vibe_v5_lean_read') !== -1, 'the import/read reuse routes are named')
  assert(eager.indexOf('没把握就记 blocked') !== -1, 'the no-confidence→blocked rule rides in the daily line')
  assert(eager.indexOf('leanAsync=true') !== -1 && eager.indexOf('不得把该对象当成已通过') !== -1, '★ the async honesty rule rides in the daily line')
  const offInit = await promptFor('r-1', { formalVerify: 'encourage', leanInitiative: 'off' })
  assert(offInit.indexOf('【顺手形式化') === -1, '★ leanInitiative=off suppresses the daily line even when formalVerify is on')
  // The VERIFY block carries the async rule too.
  await h.callTool('vibe_v5_set', { formalVerify: 'encourage', leanInitiative: 'normal' })
  await h.callTool('vibe_v5_record_proposition', { id: 'p-leanv', statement: '异步落地前不得当已通过', value: 0.6, motive: 'm', p: 0.9 }, h.childAgent(h.childOf('r-1')))
  await h.callTool('vibe_v5_propose_verify', { target: 'p-leanv', kind: 'proposition', reason: '测试' }, h.childAgent(h.childOf('r-1')))
  const vw = await h.peekWakeOf('r-1', 3000)
  const vtxt = vw ? vw.text : ''
  assert(/形式化只写你有把握的版本/.test(vtxt) && /不得\*\*在它落地前声称已通过/.test(vtxt),
    '★ the verify block carries the confidence + async-honesty lines (' + JSON.stringify(vtxt.slice(-260)) + ')')
}

// ---------- 42. per-injection-site gate: every Lean prompt site, both directions ----------
// Lens-1 (HIGH coverage gap): the gate `leanInitiative !== 'off' && (formalOn() || eager)` is
// correct, but a static scan found ZERO assertions naming `eager` per SITE. v5 has exactly two
// DAILY-line sites (normalPrompt, checkpointPrompt) plus two mode-gated Lean sites (briefBlock's
// `[形式化]` state line and verifyPrompt's formalPromptBlock). Each site below is asserted in BOTH
// directions: (1) formalVerify=off + leanInitiative=eager ⇒ that site HAS the daily line (with the
// `**主动**` mark) while the VERIFY block stays absent; (2) leanInitiative=off ⇒ that site has NO
// daily line while the mode/verify text still follows formalVerify.
console.log('\n[42] every Lean prompt site obeys the leanInitiative gate in both directions')
{
  const DAILY = '【顺手形式化'
  const EAGER = '**主动**'
  // The verify-phase BLOCK header (its mode suffix distinguishes it from the normal prompt's
  // reply contract, which also *mentions* 【Lean 形式化验证】).
  const VERIFY_BLOCK = '【Lean 形式化验证（'
  const STATE = '[形式化]'
  const h = makeHost({ pluginModule })
  await h.callTool('vibe_v5_start', { problem: PROBLEM, researcherCount: 1 })
  await h.settleSpawns()
  const setAndAssert = async (plan) => {
    const r = await h.callTool('vibe_v5_set', plan)
    assert(r.ok === true, 'precondition: vibe_v5_set applied ' + JSON.stringify(plan) + ' (' + JSON.stringify(r).slice(0, 120) + ')')
    return r.params
  }
  // Pending turns must be ANSWERED, never dropped: a discarded wake leaves its member busy
  // forever, so the scheduler would have no idle member left to send a heartbeat to.
  const flushWakes = async (rounds) => {
    for (let i = 0; i < (rounds || 8); i++) {
      const w = h.wakes.shift()
      if (!w) return
      h.fireEnd(w.childId, { progress: '收到。', solved: false, contextPct: 10 })
      await sleep(10)
    }
  }
  const normalFor = async (member) => {
    await h.callTool('vibe_v5_say', { to: member, text: '请继续推进。' }, h.childAgent(h.childOf('acad')))
    const w = await h.peekWakeOf(member, 3000)
    if (!w) return ''
    h.fireEnd(w.childId, { progress: '收到。', solved: false, contextPct: 10 })
    await sleep(25)
    return w.text
  }
  // ── SITE 1: normalPrompt ────────────────────────────────────────────────────
  const pA = await setAndAssert({ formalVerify: 'off', leanInitiative: 'eager' })
  assert(pA.formalVerify === 'off' && pA.leanInitiative === 'eager', 'precondition: formalVerify=off + leanInitiative=eager is live')
  await flushWakes()
  const s1eager = await normalFor('r-1')
  assert(s1eager.indexOf(DAILY) !== -1 && s1eager.indexOf(EAGER) !== -1,
    'S1 normalPrompt: formalVerify=off + leanInitiative=eager ⇒ the daily line IS injected (with **主动**)')
  assert(s1eager.indexOf(VERIFY_BLOCK) === -1 && s1eager.indexOf(STATE) === -1,
    'S1 normalPrompt: …while the VERIFY block and the [形式化] state line stay ABSENT (formalVerify=off)')
  const pB = await setAndAssert({ formalVerify: 'encourage', leanInitiative: 'off' })
  assert(pB.formalVerify === 'encourage' && pB.leanInitiative === 'off', 'precondition: formalVerify=encourage + leanInitiative=off is live')
  await sleep(30)              // let prompts built with the previous params drain
  await flushWakes()
  const s1off = await normalFor('r-1')
  assert(s1off.indexOf(DAILY) === -1, 'S1 normalPrompt: leanInitiative=off ⇒ NO daily line')
  assert(s1off.indexOf(VERIFY_BLOCK) === -1 && s1off.indexOf(STATE) !== -1,
    'S1 normalPrompt: …but the mode-gated [形式化] state line still follows formalVerify=encourage (stateIdx=' + s1off.indexOf(STATE) + ')')
  // ── SITE 2: checkpointPrompt (the heartbeat) ────────────────────────────────
  // Delivered to the longest-idle member that owns no in-progress task, so the queue is answered
  // FIFO (a live institute keeps working) until a 【心跳检查】 turn shows up.
  const checkpointFor = async (plan) => {
    await setAndAssert(plan)
    await flushWakes()
    const seen = []
    for (let i = 0; i < 30; i++) {
      // A tuning call drives one scheduling pass, exactly like a real institute where events keep
      // arriving; the heartbeat branch then picks the longest-idle member.
      await h.callTool('vibe_v5_set', { maxParallel: i % 2 === 0 ? 3 : 4 })
      const w = await h.peekWakeWhere(() => true, 300)
      if (!w) continue
      seen.push(w.text.slice(0, 20))
      const isCheckpoint = w.text.indexOf('【心跳检查') !== -1
      h.fireEnd(w.childId, { progress: '继续推进。', solved: false, contextPct: 10 })
      await sleep(15)
      if (isCheckpoint) return { text: w.text, seen }
    }
    return { text: '', seen }
  }
  await h.callTool('vibe_v5_set', { activityTimeoutMs: 40, chatDigestMs: 600000, stallAutoMeetingMs: 600000 })
  const s2a = await checkpointFor({ formalVerify: 'off', leanInitiative: 'eager' })
  const s2st = await h.callTool('vibe_v5_status', {})
  assert(s2a.text !== '' && s2a.text.indexOf(DAILY) !== -1 && s2a.text.indexOf(EAGER) !== -1,
    'S2 checkpointPrompt (heartbeat): formalVerify=off + leanInitiative=eager ⇒ the daily line IS injected (seen=' + JSON.stringify(s2a.seen) + ' status=' + JSON.stringify({ verify: s2st.verify && s2st.verify.target, meeting: s2st.meeting, paper: s2st.paper && s2st.paper.stage, busy: (s2st.members || []).filter((m) => m.busy).map((m) => m.id), undecided: s2st.undecided }) + ')')
  assert(s2a.text.indexOf(VERIFY_BLOCK) === -1, 'S2 checkpointPrompt: the VERIFY block stays absent with formalVerify=off')
  const s2b = await checkpointFor({ formalVerify: 'encourage', leanInitiative: 'off' })
  assert(s2b.text !== '' && s2b.text.indexOf(DAILY) === -1,
    'S2 checkpointPrompt: leanInitiative=off ⇒ NO daily line (seen=' + JSON.stringify(s2b.seen) + ')')
  assert(s2b.text.indexOf(STATE) !== -1, 'S2 checkpointPrompt: …while the [形式化] state line still follows formalVerify=encourage')
  // ── SITE 3: verifyPrompt's formalPromptBlock ────────────────────────────────
  // Finish any verification that is already in flight (answering every voter turn) so that the
  // NEXT verify wake is necessarily built with the params we set afterwards.
  const drainVerify = async () => {
    for (let i = 0; i < 25; i++) {
      const st = await h.callTool('vibe_v5_status', {})
      if (!st.verify) return true
      await h.callTool('vibe_v5_set', { maxParallel: i % 2 === 0 ? 3 : 4 })
      const w = await h.peekWakeWhere((p) => p.indexOf('【求真表决') !== -1, 250)
      if (w) {
        const tm = /"target"\s*:\s*"([^"]+)"/.exec(w.text)
        h.fireEnd(w.childId, { verdict: { target: tm ? tm[1] : st.verify.target, verdict: 0.5, reason: '存疑' }, contextPct: 20 })
      }
      await sleep(20)
    }
    return false
  }
  const verifyFor = async (plan) => {
    await drainVerify()
    await setAndAssert(plan)
    const id = 'p-site-' + Math.random().toString(36).slice(2, 8)
    await h.callTool('vibe_v5_record_proposition', { id, statement: '站点门控', value: 0.6, motive: 'm', p: 0.9 }, h.childAgent(h.childOf('r-1')))
    await h.callTool('vibe_v5_propose_verify', { target: id, kind: 'proposition', reason: 'x' }, h.childAgent(h.childOf('r-1')))
    for (let i = 0; i < 25; i++) {
      await h.callTool('vibe_v5_set', { maxParallel: i % 2 === 0 ? 3 : 4 })
      const w = await h.peekWakeWhere((p) => p.indexOf('【求真表决') !== -1, 300)
      if (!w) continue
      const tm = /"target"\s*:\s*"([^"]+)"/.exec(w.text)
      h.fireEnd(w.childId, { verdict: { target: tm ? tm[1] : id, verdict: 0.5, reason: '存疑' }, contextPct: 20 })
      await sleep(25)
      return w.text
    }
    return ''
  }
  const s3off = await verifyFor({ formalVerify: 'off', leanInitiative: 'eager' })
  assert(s3off.indexOf('【求真表决') !== -1 && s3off.indexOf(VERIFY_BLOCK) === -1,
    'S3 verifyPrompt: formalVerify=off ⇒ NO verify-phase Lean block even when leanInitiative=eager')
  assert(s3off.indexOf(DAILY) === -1, 'S3 verifyPrompt: the daily line is never injected into the verify prompt')
  const s3on = await verifyFor({ formalVerify: 'encourage', leanInitiative: 'off' })
  assert(s3on.indexOf('【求真表决') !== -1 && s3on.indexOf(VERIFY_BLOCK) !== -1,
    'S3 verifyPrompt: formalVerify=encourage ⇒ the verify-phase block appears even with leanInitiative=off')
  assert(s3on.indexOf(DAILY) === -1, 'S3 verifyPrompt: …and the daily line is still absent there')
}

// ---------- 43. pre-start diagnosis + coherent quorum (architecture self-test defects 1/2) -------
// The self-test (§18 of _oneoff/slv-playbook.md（原 method3-scripted-driving.md）) found that before `start`:
//   (1) record_progress / record_proposition / verdict answered a BARE `V5_MEMBER_NOT_FOUND`
//       with no hint about why or what to do first;
//   (2) `vibe_v5_status` reported `quorum.m=1` with `voters=0` — reading like a satisfied quorum.
// Both are asserted here, INCLUDING the actionable `next` step, and the normal (post-start) path
// is exercised in the same section so a follow-up self-test can see a non-error path.
console.log('\n[43] pre-start tools explain themselves; the quorum is coherent before and after start')
{
  const h = makeHost({ pluginModule })
  const pre = async (name, args) => await h.callTool(name, args, h.ROOT)
  const rProg = await pre('vibe_v5_record_progress', { content: '自我测试' })
  assert(rProg.ok === false && rProg.code === 'V5_MEMBER_NOT_FOUND' && /尚未启动/.test(String(rProg.message || '')) &&
    rProg.next && rProg.next.kind === 'start' && rProg.next.tool === 'vibe_v5_start',
    '★ pre-start record_progress: the code is unchanged but the answer names the state + the next step (' + JSON.stringify(rProg).slice(0, 200) + ')')
  const rProp = await pre('vibe_v5_record_proposition', { statement: 's', value: 1, motive: 'm', p: 0.5 })
  assert(rProp.ok === false && rProp.code === 'V5_MEMBER_NOT_FOUND' && /尚未启动/.test(String(rProp.message || '')) && rProp.next && rProp.next.kind === 'start',
    '★ pre-start record_proposition: same actionable diagnosis (' + JSON.stringify(rProp).slice(0, 160) + ')')
  const rVer = await pre('vibe_v5_verdict', { target: 'p-x', verdict: 1 })
  assert(rVer.ok === false && rVer.code === 'V5_MEMBER_NOT_FOUND' && /尚未启动/.test(String(rVer.message || '')) && rVer.next && rVer.next.kind === 'start',
    '★ pre-start verdict: same actionable diagnosis (' + JSON.stringify(rVer).slice(0, 160) + ')')
  const st0 = await pre('vibe_v5_status', {})
  assert(st0.quorum && st0.quorum.started === false && st0.quorum.m === 0 && st0.quorum.voterCount === 0 && st0.quorum.phase === 'not-started',
    '★ pre-start quorum is COHERENT: started=false, m=0, voters=0 (' + JSON.stringify(st0.quorum) + ')')
  assert(st0.quorum.next && st0.quorum.next.kind === 'start' && st0.quorum.next.tool === 'vibe_v5_start',
    '★ …and it says what to do first (' + JSON.stringify(st0.quorum.next) + ')')
  assert(st0.params && st0.params.m === 0 && st0.params.started === false,
    'the params view agrees: m=0, started=false (' + JSON.stringify({ m: st0.params && st0.params.m, started: st0.params && st0.params.started }) + ')')
  assert(st0.quorum.m !== 1 || st0.quorum.voterCount !== 0,
    'the old inconsistent `m=1 with voters=0` reading is gone')
  // ── the NORMAL path: after start, quorum is defined and the member tools work ──
  await h.callTool('vibe_v5_start', { problem: PROBLEM, researcherCount: 1 })
  await h.settleSpawns()
  const st1 = await h.callTool('vibe_v5_status', {})
  assert(st1.quorum && st1.quorum.started === true && st1.quorum.m >= 1 && st1.quorum.voterCount >= 1 && st1.quorum.voters.length === st1.quorum.voterCount,
    '★ after start the quorum is real: started=true, m>=1, voters listed (' + JSON.stringify(st1.quorum) + ')')
  const member = h.childAgent(h.childOf('r-1'))
  const okProg = await h.callTool('vibe_v5_record_progress', { content: '启动后写进度' }, member)
  assert(okProg.ok === true && /Members\/r-1\/Progress/.test(String(okProg.file || '')),
    '★ after start the SAME tool succeeds for a member (normal path reachable) (' + JSON.stringify(okProg).slice(0, 120) + ')')
}

// ---------- 44. workspace containment + single-sourced quorum (3rd self-test defects A/B) --------
// Defect A: member-facing text said the library root was `Members/<id>/` while a member's OWN
// file tools resolve relative paths against the SESSION CWD ⇒ a stray `<cwd>/Members/acad/Propos/
// p-*.md` appeared outside `VibeMath/Projects/…`. Every member-facing path is now CWD-relative,
// and this section proves that a member card write cannot land outside the project tree.
// Defect B: the office digest said m=2 while status/acad said m=3 in the same window (two roster
// snapshots). Every view now reads ONE snapshot and carries `rosterVersion`, so all views at one
// point in time must agree — including after a roster change.
console.log('\n[44] paths stay inside the project root; every quorum view agrees')
{
  const h = makeHost({ pluginModule })
  await h.callTool('vibe_v5_start', { problem: PROBLEM, researcherCount: 1 })
  // (A1) the member brief must name the CWD-relative library root (the member's real baseline).
  const brief = h.spawns.map((sp) => JSON.stringify(sp.request || {})).join('\n')
  assert(brief.indexOf('VibeMath/Projects/default/Institutes/institute/Members/') !== -1,
    '★ the member brief carries the CWD-relative library root (' + (brief.match(/Members\/[^"\\]{0,40}/) || [''])[0] + ')')
  // The contract is ROOT-QUALIFIED declarations: the brief names the CWD-relative root (A1 above)
  // AND every library declaration it offers carries the member root (`Members/<你>/<section>/…`), so a
  // member copying one composes a path inside `Members/<id>/`. The legacy institute-relative shapes
  // (`Progress/<你>/…` and friends) must be gone - those used to send the write outside the member tree.
  const decls = (brief.match(/Members\/<[^>]*>\/(?:Progress|Propos|Methods|Subproblems)\//g) || [])
  assert(decls.length >= 4,
    '* every member-facing library declaration is root-qualified (Members/<你>/<section>/…) (found ' + decls.length + ')')
  const legacy = (brief.match(/(?:^|[^A-Za-z0-9/_.-])(?:Progress|Propos|Methods|Subproblems)\/<你>\//g) || [])
  assert(legacy.length === 0,
    'no member-facing declaration is left in the legacy institute-relative shape (' + JSON.stringify(legacy) + ')')
  await h.settleSpawns()
  // (A2) a member card write must not add anything at the workspace TOP level.
  const topBefore = readdirSync(h.WS).sort().join(',')
  const card = await h.callTool('vibe_v5_record_proposition', { id: 'p-stray-check', statement: '包层测试', value: 1, motive: 'm', p: 0.5 }, h.childAgent(h.childOf('r-1')))
  const topAfter = readdirSync(h.WS).sort().join(',')
  assert(card.ok === true && /Members\/r-1\/Propos\/p-stray-check\.md/.test(String(card.file || '')),
    'the member card is written through the v5 tool (' + JSON.stringify(card).slice(0, 120) + ')')
  assert(existsSync(join(h.WS, 'VibeMath', 'Projects', 'default', 'Institutes', 'institute', 'Members', 'r-1', 'Propos', 'p-stray-check.md')),
    '…and it exists under VibeMath/Projects/<project>/…')
  assert(topAfter === topBefore && !existsSync(join(h.WS, 'Members')),
    '★ NO path outside VibeMath/Projects/… gained files (top level unchanged: ' + topBefore + ' → ' + topAfter + ')')
  // (B) every quorum view agrees at one point in time, and they move TOGETHER after a hire.
  const views = async () => {
    const st = await h.callTool('vibe_v5_status', {})
    const rp = await h.callTool('vibe_v5_report', {})
    await h.callTool('vibe_v5_say', { to: 'r-1', text: '请继续推进。' }, h.childAgent(h.childOf('acad')))
    const w = await h.peekWakeOf('r-1', 3000)
    const pm = w ? /法定票数 m=(\d+)/.exec(w.text) : null
    if (w) h.fireEnd(w.childId, { progress: '收到。', solved: false, contextPct: 10 })
    await sleep(20)
    return { st, rp, promptM: pm ? Number(pm[1]) : null }
  }
  const v1 = await views()
  assert(v1.st.quorum && v1.rp.quorum && v1.st.quorum.m === v1.rp.quorum.m,
    '★ status and report agree on m at one point in time (' + JSON.stringify({ status: v1.st.quorum && v1.st.quorum.m, report: v1.rp.quorum && v1.rp.quorum.m }) + ')')
  assert(v1.st.quorum.rosterVersion === v1.rp.quorum.rosterVersion,
    'both views carry the SAME rosterVersion (' + JSON.stringify({ s: v1.st.quorum.rosterVersion, r: v1.rp.quorum.rosterVersion }) + ')')
  assert(v1.promptM === v1.st.quorum.m,
    'the member-facing state block shows the same m (' + JSON.stringify({ prompt: v1.promptM, status: v1.st.quorum.m }) + ')')
  // A roster change must reach EVERY view (the stale-snapshot bug). Dismissing a permanent
  // researcher shrinks the voter set synchronously, so m MUST move in every view at once.
  const rm = await h.callTool('vibe_v5_remove_researcher', { id: 'r-1' })
  assert(rm.ok === true, 'precondition: the roster change succeeded (' + JSON.stringify(rm).slice(0, 140) + ')')
  await sleep(30)
  const v2 = await views()
  assert(v2.st.quorum.m === v2.rp.quorum.m,
    '★ after the roster changes, status and report STILL agree (status=' + v2.st.quorum.m + ', report=' + v2.rp.quorum.m + ')')
  assert(v2.st.quorum.rosterVersion !== v1.st.quorum.rosterVersion && v2.st.quorum.m !== v1.st.quorum.m,
    'the roster change moved both m and rosterVersion (' + JSON.stringify({ before: v1.st.quorum.m, after: v2.st.quorum.m, v: [v1.st.quorum.rosterVersion, v2.st.quorum.rosterVersion] }) + ')')
}

// ---------- 45. F2: paperSummary() semantics (md runs must not claim tex / compilation) ----------
console.log('\n[45] paperSummary(): md runs claim no tex, no compilation, no engine')
{
  const h = makeHost({ pluginModule })
  await h.callTool('vibe_v5_start', { problem: PROBLEM, researcherCount: 1 })
  const mdZh = await h.callTool('vibe_v5_paper', { lang: 'zh', format: 'md', editor: 'office' })
  const st = await h.callTool('vibe_v5_status', {})
  const p = st.paper || {}
  assert(mdZh.ok === true && p.format === 'md', '* the md run is reported as format=md (' + JSON.stringify({ ok: mdZh.ok, format: p.format }) + ')')
  const arts = Array.isArray(p.artifacts) ? p.artifacts : []
  assert(arts.indexOf('tex') === -1 && arts.indexOf('pdf') === -1, '* md runs list NO tex/pdf artifacts (found ' + JSON.stringify(arts) + ')')
  assert(!p.engine, '* md runs report no LaTeX engine - i.e. no requirement on a LaTeX toolchain (engine=' + JSON.stringify(p.engine) + ')')
  assert(typeof p.dir === 'string' && p.dir.indexOf('Paper/') === 0, '* status.paper.dir is the institute Paper/ dir (' + JSON.stringify(p.dir) + ')')
  assert(p.meta === null || p.meta === undefined, '* meta stays empty until the paper is finalized (meta=' + JSON.stringify(p.meta) + ')')
  // md x language and md x editor combinations
  const h2 = makeHost({ pluginModule })                       // independent host: the first paper is already finalised
  await h2.callTool('vibe_v5_start', { problem: PROBLEM, researcherCount: 1 })
  const mdEn = await h2.callTool('vibe_v5_paper', { lang: 'en', format: 'md', editor: 'academician' })
  console.log('  [45] fresh-host vibe_v5_paper -> ' + JSON.stringify(mdEn).slice(0, 300))
  const p2 = (await h2.callTool('vibe_v5_status', {})).paper || {}
  assert(p2.format === 'md' && p2.lang === 'en', '* md x language: lang is honoured and the format stays md (' + JSON.stringify({ format: p2.format, lang: p2.lang, call: mdEn }) + ')')
  const p2arts = Array.isArray(p2.artifacts) ? p2.artifacts : []
  assert(p2arts.indexOf('tex') === -1 && p2arts.indexOf('pdf') === -1 && !p2.engine, '* md x editor: still no tex/pdf and no engine (editor=member)')
  // the `editor` closed set is a CONTRACT: a valid value succeeds, an invalid one is refused by code
  const hOk = makeHost({ pluginModule })
  await hOk.callTool('vibe_v5_start', { problem: PROBLEM, researcherCount: 1 })
  const okOffice = await hOk.callTool('vibe_v5_paper', { lang: 'zh', format: 'md', editor: 'office' })
  assert(okOffice.ok === true, '* editor=office is accepted (the closed set is office|academician) (' + JSON.stringify(okOffice).slice(0, 100) + ')')
  const hBad = makeHost({ pluginModule })
  await hBad.callTool('vibe_v5_start', { problem: PROBLEM, researcherCount: 1 })
  const badEditor = await hBad.callTool('vibe_v5_paper', { lang: 'zh', format: 'md', editor: 'member' })
  assert(badEditor.ok === false && badEditor.code === 'V5_INVALID_ARGUMENT', '* an out-of-set editor is refused with V5_INVALID_ARGUMENT, not silently coerced (' + JSON.stringify(badEditor).slice(0, 120) + ')')
}
// ---------- 46. F6: memberDiagnosis branches — kind AND exact next.tool, exclusive & exhaustive -------
console.log('\n[46] memberDiagnosis: per-branch kind + exact next.tool')
{
  const { readFileSync } = await import('node:fs')
  const { fileURLToPath } = await import('node:url')
  const src = readFileSync(fileURLToPath(new URL('../vibe-math-v5/vibe-math-v5.js', import.meta.url)), 'utf8')
  const dStart = src.indexOf('function memberDiagnosis(')
  const dEnd = src.indexOf('\n    function ', dStart + 10)
  const body = src.slice(dStart, dEnd > 0 ? dEnd : dStart + 4000)   // scope: the diagnosis branches only
  const pairs = [["start","vibe_v5_start"],["staff","vibe_v5_add_researcher"],["member-call","vibe_v5_members"],["roster","vibe_v5_members"]]
  for (const [kind, tool] of pairs) {
    assert(new RegExp("kind: '" + kind + "'[^\\n]*?tool: '" + tool + "'").test(body),
      '* F6 branch ' + kind + ' pairs with next.tool=' + tool + ' (exact - not just ANY next{})')
  }
  for (const [kind] of pairs) {
    const n = (body.match(new RegExp("kind: '" + kind + "'", 'g')) || []).length
    assert(n === 1, '* F6 kind ' + kind + ' is declared exactly ONCE (mutually exclusive branches, no duplicate/typo kind) - found ' + n)
  }
  assert((body.match(/next: \{/g) || []).length >= 4, '* F6 the four branches are exhaustive: every refusal path carries its own next{}')
}
// ---------- 47. G1: a FAILED wake must not consume the mailbox (ack only after a successful send) ----
console.log('\n[47] G1: a failed wake leaves the message PENDING (no ack before the send)')
{
  const h = makeHost({ pluginModule, failSendMessage: true })
  await h.callTool('vibe_v5_start', { problem: PROBLEM, researcherCount: 1 })
  await h.settleSpawns()
  // Every wake is forced to fail while the dm is queued, so this message can never be delivered yet.
  const attemptsBefore = h.sendAttempts.length
  const said = await h.callTool('vibe_v5_say', { to: 'r-1', text: 'G1 未送达的消息' }, h.childAgent(h.childOf('acad')))
  assert(said.ok === true && said.delivered === 1,
    'precondition: the dm was accepted for exactly one recipient (' + JSON.stringify(said).slice(0, 120) + ')')
  // `say` to an addressed recipient kicks a scheduling pass; wait until a wake is ATTEMPTED.
  for (let i = 0; i < 60 && h.sendAttempts.length === attemptsBefore; i++) await sleep(25)
  assert(h.sendAttempts.length > attemptsBefore,
    '★ the wake was attempted while every send fails (attempts ' + attemptsBefore + ' -> ' + h.sendAttempts.length + ')')
  assert(h.wakes.length === 0, 'no wake was queued while sendMessage throws (got ' + h.wakes.length + ')')
  // Heal the host, then trigger a wake DETERMINISTICALLY: a second dm kicks a scheduling pass
  // (v5 `say` -> scheduleNext), so we do not depend on the heartbeat timing. The prompt must carry
  // BOTH messages — the first one is the assertion (a failed wake must not consume it), the second
  // is the positive control that a wake really happened.
  h.setFailSend(false)
  await h.callTool('vibe_v5_say', { to: 'r-1', text: 'G1 正控消息' }, h.childAgent(h.childOf('acad')))
  let prompt = ''
  for (let i = 0; i < 4 && prompt.indexOf('G1 正控消息') === -1; i++) {
    const w = await h.peekWakeOf('r-1', 4000)
    if (w && w.text) prompt = w.text
  }
  assert(prompt.indexOf('G1 正控消息') !== -1,
    '★ positive control: the second dm did wake r-1 (prompt=' + JSON.stringify(prompt.slice(0, 160)) + ')')
  assert(prompt.indexOf('G1 未送达的消息') !== -1,
    '★★★ [G1] a message whose wake FAILED is still pending on the next successful wake (prompt=' + JSON.stringify(prompt.slice(0, 220)) + ')')
  // Two-sided: a SUCCESSFUL wake acks both once — neither may be delivered again.
  h.fireEnd(h.childOf('r-1'), { progress: '收到', solved: false, contextPct: 20 })
  await sleep(40)
  await h.callTool('vibe_v5_say', { to: 'r-1', text: 'G1 第三条' }, h.childAgent(h.childOf('acad')))
  let after = ''
  for (let i = 0; i < 4 && after.indexOf('G1 第三条') === -1; i++) {
    const w = await h.peekWakeOf('r-1', 4000)
    if (w && w.text) after = w.text
  }
  assert(after.indexOf('G1 第三条') !== -1,
    '★ positive control: the third dm woke r-1 again (prompt=' + JSON.stringify(after.slice(0, 160)) + ')')
  assert(after.indexOf('G1 未送达的消息') === -1 && after.indexOf('G1 正控消息') === -1,
    '★★ [G1] after a successful wake the message is ACKED exactly once (not redelivered; prompt=' + JSON.stringify(after.slice(0, 220)) + ')')
}
// ---------- 48. G2: a FAILED send must not consume a round (counters after the send) ----------------
console.log('\n[48] G2: a failed wake does not consume a round (rounds == successful sends)')
{
  const h = makeHost({ pluginModule, failSendMessage: true })
  await h.callTool('vibe_v5_start', { problem: PROBLEM, researcherCount: 1 })
  await h.settleSpawns()
  const r1 = h.childOf('r-1')
  // Addressed mail wakes r-1; while the host is broken every such wake FAILS.
  await h.callTool('vibe_v5_say', { to: 'r-1', text: 'G2 失败唤醒' }, h.childAgent(h.childOf('acad')))
  for (let i = 0; i < 60 && h.sendAttempts.filter(c => c === r1).length === 0; i++) await sleep(25)
  const failedAttempts = h.sendAttempts.filter(c => c === r1).length
  assert(failedAttempts >= 1, 'precondition: at least one wake for r-1 was attempted and failed (' + failedAttempts + ')')
  assert(h.wakes.filter(w => w.childId === r1).length === 0, 'precondition: no wake for r-1 succeeded yet')
  // Heal the host and wake r-1 for real.
  h.setFailSend(false)
  await h.callTool('vibe_v5_say', { to: 'r-1', text: 'G2 成功唤醒' }, h.childAgent(h.childOf('acad')))
  let prompt = ''
  for (let i = 0; i < 4 && prompt.indexOf('G2 成功唤醒') === -1; i++) {
    const w = await h.peekWakeOf('r-1', 4000)
    if (w && w.text) prompt = w.text
  }
  assert(prompt.indexOf('G2 成功唤醒') !== -1, '★ positive control: the healed host woke r-1 (' + JSON.stringify(prompt.slice(0, 140)) + ')')
  // `wakeSends` survives `peekWakeOf`'s splice; the status line is built BEFORE the send, so the round it
  // shows is the one being started: it must equal the number of successes (not attempts).
  const succeeded = h.wakeSends
  const mm = /轮次 (\d+)/.exec(prompt)
  const shown = mm ? Number(mm[1]) : -1
  assert(succeeded >= 1 && failedAttempts >= 1,
    'precondition: at least one success and one failure for r-1 (successes=' + succeeded + ', failures=' + failedAttempts + ')')
  assert(shown === succeeded,
    '★★★ [G2] a failed send must not consume a round: 轮次=' + shown + ' vs 成功发送=' + succeeded +
    ' (失败尝试=' + failedAttempts + ') — attempts must not count')
}
// ---------- 49. G4: assignment metadata travels INSIDE the CAS write (no second task write) ---------
console.log('\n[49] G4: the assign writes the task exactly once, and a stale CAS is refused')
{
  const h = makeHost({ pluginModule })
  await h.callTool('vibe_v5_start', { problem: PROBLEM, researcherCount: 2 })
  await h.settleSpawns()
  const created = await h.callTool('vibe_v5_assign', { subject: 'G4 任务', to: 'r-1', why: 'G4 理由', acceptance: 'G4 验收' })
  assert(created.ok === true && created.task && created.task.id, 'the office can assign a task (' + JSON.stringify(created).slice(0, 140) + ')')
  const got = await h.callTool('vibe_v5_task_get', { task_id: created.task.id })
  const t = (got && got.task) || got
  assert(t && t.assignedBy === 'office' && t.why === 'G4 理由' && t.acceptance === 'G4 验收',
    '★ the metadata is part of the SAME task value (' + JSON.stringify([t && t.assignedBy, t && t.why, t && t.acceptance]) + ')')
  assert(t && t.status === 'in_progress' && t.ownerId === 'r-1' && t.revision === 2,
    '★ the reassign landed as exactly one revision step (revision=' + (t && t.revision) + ', owner=' + (t && t.ownerId) + ', status=' + (t && t.status) + ')')
  // The compare-and-set token really is compared: the PRE-assign revision must be refused.
  const stale = await h.callTool('vibe_v5_task_update', { task_id: created.task.id, expected_revision: 1, action: 'release' }, h.childAgent(h.childOf('acad')))
  assert(stale.ok === false && stale.code === 'V5_TASK_STALE_REVISION',
    '★★ a stale expected_revision is refused with V5_TASK_STALE_REVISION (' + JSON.stringify(stale).slice(0, 150) + ')')
  // …and the reason the lost-update window existed: a second, unprotected write in the assign path.
  // The source MUST be read through the SAME seam the plugin was loaded from (`PLUGIN`), or a mutant
  // copy would be invisible here and this assertion would pass against the unmutated repo file.
  const { readFileSync: rf } = await import('node:fs')
  const { fileURLToPath: fp } = await import('node:url')
  const src = rf(fp(PLUGIN), 'utf8')
  const s0 = src.indexOf('async function taskAssign(')
  const s1 = src.indexOf('\n    async function ', s0 + 10)
  const body = src.slice(s0, s1 > 0 ? s1 : s0 + 4000)
  const writes = (body.match(/putTask\(/g) || []).length
  assert(writes === 0,
    '★★★ [G4] the assign path issues NO second, unprotected task write (found ' + writes + ' putTask( in taskAssign) — ' +
    'a second write reusing the just-read revision is the lost-update window')
  assert(/assignedBy: isOffice\(memberId\)/.test(body),
    '★ the metadata goes through the CAS call itself (assignedBy/why/acceptance passed as the internal meta argument)')
}
console.log('')
console.log('passed=' + passed + ' failed=' + failed)
if (failed) { console.error('FAILURES:'); for (const f of failures) console.error('  - ' + f); process.exit(1) }
console.log('ALL GREEN')
process.exit(0)

// ============================================================
// HOST FAILURE PATHS — the contracts every mock used to hide.
//
// The audit of the mock hosts (A-7) found four real host behaviours that NO suite drove:
//
//   · `subagent/end` with `stopReason:'error'` — the real host emits it for a failed turn and
//     OMITS `lastAssistantMessage` when there is no output (dsh-subagent index.js:268-278/317-324).
//     The v5 half of that contract lives in `e2e-v5-round2.test.mjs` section 18 (whose host already
//     reads the institute's on-disk artefacts); the v4 half is here: a run whose turns ALL fail
//     must still reach the stall watchdog, i.e. a failed turn is not progress.
//   · a command handler whose business action FAILS — the host's CommandResult union has a real
//     `kind:'error'`, and returning 'success' made a rejected slash command look identical to a
//     successful one in the UI (v2:2884, v4:2495, v5:4634 all had to be fixed for this);
//   · `/v4 set <key>=<value>` KEY VALIDATION — a typo must be refused, not silently dropped.
//   · a `sendMessage` that REJECTS — driven end-to-end by `v4-mailbox-stall.test.mjs`.
//
// Every mock in the rest of the suite fires `stopReason:'completed'` WITH a message and registers
// `commands: { register() {} }`, so these paths were dead in CI. This suite drives them exactly as
// the host does and asserts the observable consequences.
//
// Run: node tests/host-failure-paths.test.mjs
// ============================================================
import { mkdtempSync, existsSync, readdirSync, readFileSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'

let passed = 0, failed = 0
const failures = []
const assert = (c, m) => { if (c) { passed++; console.log('  ok - ' + m) } else { failed++; failures.push(m); console.error('  FAIL - ' + m) } }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const subprocessMock = {
  async resolveExecutable(n) { return n },
  async spawn({ argv }) {
    const s = argv[argv.length - 1] || ''
    if (/New-Item/.test(s)) { const re = /'((?:[^']|'')*)'/g; let m; while ((m = re.exec(s)) !== null) { const p = m[1].replace(/''/g, "'"); if (p && !/^-/.test(p)) mkdirSync(p, { recursive: true }) } }
    return { done: Promise.resolve({ exitCode: 0 }) }
  },
}
const fsMock = (WS) => ({
  // The REAL host contract: resolve returns {targetKey, displayPath} (dsh-fs types.d.ts), not a bare string.
  async resolve(rel, o) { const b = (o && o.cwd) || WS; return { targetKey: join(b, ...String(rel).split('/')), displayPath: String(rel) } },
  async stat(t) { return existsSync(t.targetKey) ? { version: 'v1', type: 'file', size: 1 } : undefined },
  async readText(t) { return readFileSync(t.targetKey, 'utf8') },
  async writeText(t, c) { mkdirSync(dirname(t.targetKey), { recursive: true }); writeFileSync(t.targetKey, c, 'utf8') },
  async listDir(t) { if (!existsSync(t.targetKey)) return []; return readdirSync(t.targetKey, { withFileTypes: true }).map((e) => ({ name: e.name, type: e.isDirectory() ? 'directory' : 'file' })) },
})
const jsonReply = (o) => [{ type: 'text', text: '```json\n' + JSON.stringify(o) + '\n```' }]

// ---------------------------------------------------------------- v5
async function v5Host() {
  const WS = mkdtempSync(join(tmpdir(), 'v5-fail-'))
  const listeners = {}, toolRegs = [], commandRegs = [], spawns = [], wakes = [], liveAgents = new Map()
  const makeSession = (id, parentSession) => {
    const events = []
    return { id, header: { version: 1, id, createdAt: Date.now(), cwd: WS, parentSession, isSeeded: false }, inheritedEventCount: 0, get seq() { return events.length }, append(t, d) { events.push({ type: t, data: d }); return events[events.length - 1] }, deriveMessages() { return [] }, snapshotEvents(f) { return events.slice(f || 0) }, ownEvents() { return events.slice() }, _events: events }
  }
  let ROOT
  const ctx = {
    get(n) {
      if (n === 'sandboxPolicy' || n === 'compaction') return undefined
      if (n === 'subprocess') return subprocessMock
      return undefined
    },
    on(e, f) { (listeners[e] = listeners[e] || []).push(f) },
    effect(f) { const d = f(); return () => { if (typeof d === 'function') d() } },
    logger: { info() {}, warn() {}, error() {} },
    timeout(cb, ms) { const h = setTimeout(cb, ms); return () => clearTimeout(h) },
    tools: { register(s) { toolRegs.push(s); return () => {} } },
    commands: { register(s) { commandRegs.push(s); return () => {} } },
    subagents: {
      list() { return ['spawn'] },
      async startContinuable({ label, request }) { const id = 'c' + (spawns.length + 1); const cs = makeSession(id, 'sess-A'); liveAgents.set(id, { id, session: cs, options: request && request.agentOptions }); spawns.push({ label, childId: id }); return { childId: id, messageId: 'm' + spawns.length } },
      async sendMessage(parent, childId, blocks) { wakes.push({ childId, blocks }); return 'w' + wakes.length },
      interrupt() {}, async drainContinuableChildren() {},
    },
    agents: { roots() { return [ROOT] }, get(id) { return id === ROOT.id ? ROOT : liveAgents.get(id) }, list() { return [ROOT, ...liveAgents.values()] } },
    fs: fsMock(WS),
  }
  ROOT = { id: 'sess-A', options: {}, session: makeSession('sess-A', undefined) }
  const mod = await import(new URL('../vibe-math-v5/vibe-math-v5.js', import.meta.url).href + '?t=' + Date.now() + '-' + Math.random())
  ;(mod.default || mod).apply(ctx)
  const call = async (n, a, agent) => JSON.parse(await toolRegs.find((s) => s.name === n).execute(a || {}, { agent: agent || ROOT }))
  const labelOf = (cid) => { const s = spawns.find((x) => x.childId === cid); const m = s ? /vibe5 (\S+) /.exec(s.label) : null; return m ? m[1] : '' }
  const childOf = (m) => { const s = spawns.find((x) => x.label.indexOf('vibe5 ' + m + ' ') !== -1); return s ? s.childId : m }
  const childAgent = (cid) => liveAgents.get(cid)
  const fireEnd = (cid, reply, stopReason) => { for (const h of listeners['subagent/end'] || []) h({ id: cid, runId: 'r', provider: 'spawn', local: true, stopReason: stopReason || 'completed', ...(reply === undefined ? {} : { lastAssistantMessage: jsonReply(reply) }) }) }
  const chatText = () => {
    const dir = join(WS, 'VibeMath', 'Projects', 'default', 'Institutes', 'institute', 'Shared', 'Chat')
    if (!existsSync(dir)) return ''
    return readdirSync(dir).filter((f) => f.endsWith('.md')).map((f) => readFileSync(join(dir, f), 'utf8')).join('\n')
  }
  const settle = async () => { for (const sp of spawns.slice()) { fireEnd(sp.childId, { progress: labelOf(sp.childId) + '：初始见解。', solved: false, contextPct: 10 }); await sleep(20) } }
  return { WS, ctx, ROOT, call, childOf, childAgent, fireEnd, chatText, settle, commandRegs, close() { rmSync(WS, { recursive: true, force: true }) } }
}

console.log('\n-- v5: a turn that ends with stopReason=error (and no lastAssistantMessage) --')
{
  const h = await v5Host()
  await h.call('vibe_v5_start', { problem: '失败路径', researcherCount: 1 })
  await h.settle()
  // (The end-event half of this contract — stopReason:'error' with an OMITTED
  // lastAssistantMessage — lives in `e2e-v5-round2.test.mjs` section 18, whose host is the one the
  // suite already uses to read the institute's on-disk artefacts.)
  const cmd = h.commandRegs.find((c) => c.name === 'v5')
  const bad = await cmd.handler({ agent: h.ROOT, rawInput: 'frobnicate' })
  assert(bad.kind === 'error', '★ /v5 with an unknown subcommand returns kind=error (not success)')
  assert(/usage/.test(bad.text), 'and the error text carries the usage line the user needs')
  const ok = await cmd.handler({ agent: h.ROOT, rawInput: 'status' })
  assert(ok.kind === 'success', 'a legal /v5 subcommand still reports kind=success (control)')
  h.close()
}

// ---------------------------------------------------------------- v4
console.log('\n-- v4: failed turns are never progress (and need no lastAssistantMessage) --')
async function v4Host() {
  const WS = mkdtempSync(join(tmpdir(), 'v4-fail-'))
  const listeners = {}, toolRegs = [], commandRegs = []
  let ROOT
  const ctx = {
    get(n) { return n === 'subprocess' ? subprocessMock : undefined },
    on(e, f) { (listeners[e] = listeners[e] || []).push(f) },
    effect(f) { const d = f(); return () => { if (typeof d === 'function') d() } },
    logger: { info() {}, warn() {}, error() {} },
    timeout(cb, ms) { const h = setTimeout(cb, ms); return () => clearTimeout(h) },
    tools: { register(s) { toolRegs.push(s) } },
    commands: { register(s) { commandRegs.push(s) } },
    subagents: {
      list() { return ['spawn'] },
      async startContinuable({ label }) { return { childId: 'child-' + label, messageId: 'm' } },
      async sendMessage() {},
      interrupt() {},
    },
    agents: { roots() { return [] }, get(id) { return id === 'sess-A' ? ROOT : undefined } },
    fs: fsMock(WS),
  }
  ROOT = { id: 'sess-A', options: {}, session: { id: 'sess-A', header: { cwd: WS } } }
  const mod = await import(new URL('../vibe-math-v4/vibe-math-v4.js', import.meta.url).href + '?t=' + Date.now() + '-' + Math.random())
  ;(mod.default || mod).apply(ctx)
  const call = async (n, a) => JSON.parse(await toolRegs.find((d) => d.name === n).execute(a || {}, { agent: ROOT }))
  // `reply === undefined` OMITS `lastAssistantMessage` entirely — the shape the real host sends
  // for a failed turn with no output (dsh-subagent index.js:268-278).
  const fire = (cid, reply, stopReason) => { for (const fn of listeners['subagent/end'] || []) fn({ id: cid, runId: 'r', provider: 'spawn', local: true, stopReason, ...(reply === undefined ? {} : { lastAssistantMessage: jsonReply(reply) }) }) }
  return { WS, ROOT, call, fire, commandRegs, close() { rmSync(WS, { recursive: true, force: true }) } }
}
/** Drive the group for up to ~5 s, answering EVERY busy resident with the given outcome. */
async function driveTurns(h, stopReason, reply) {
  const deadline = Date.now() + 5000
  let turns = 0
  for (;;) {
    const st = await h.call('vibe_v4_status')
    if (st.meetingInProgress) return { meeting: true, turns }
    if (Date.now() >= deadline) return { meeting: !!st.meetingInProgress, turns, last: st }
    for (const rid of st.busy) { h.fire('child-' + rid, reply, stopReason); turns++ }
    await sleep(50)
  }
}
const V4_LIVENESS = { activityTimeoutMs: 250, stallAutoMeetingMs: 700, meetingKeepEvery: 100, maxParallel: 3, compactAfterRounds: 999 }
{
  const h = await v4Host()
  await h.call('vibe_v4_configure', { project: 'p', problem: 'q', params: V4_LIVENESS })
  await h.call('vibe_v4_start', { residentCount: 2 })
  await sleep(20)
  for (const rid of ['r-1', 'r-2']) { h.fire('child-' + rid, { summary: 'insight ' + rid, contextPct: 10 }, 'completed'); await sleep(20) }
  const failed = await driveTurns(h, 'error', undefined)
  assert(failed.turns > 0, 'turns really were driven and failed while the run stayed alive (' + failed.turns + ' failed turns)')
  assert(failed.meeting === true,
    '★ a run whose turns ALL FAIL still hits the stall watchdog — an error turn never refreshes the progress clock (' + failed.turns + ' failed turns, no lastAssistantMessage)')
  const stEnd = await h.call('vibe_v4_status')
  assert(stEnd.residents.length === 2, 'both residents are still on the roster after repeated failures')
  assert(stEnd.busy.every((id) => /^r-[12]$/.test(id)), 'the busy set still holds only real residents (no phantom entry): ' + JSON.stringify(stEnd.busy))
  // ---- the /v4 slash command surface ----------------------------------------------------------
  const cmd = h.commandRegs.find((c) => c.name === 'v4')
  const st0 = await h.call('vibe_v4_status')
  const unknown = await cmd.handler({ agent: h.ROOT, rawInput: 'set nosuchkey=1' })
  assert(unknown.kind === 'error', '★ /v4 set with an UNKNOWN key is an error result, not a silent success')
  assert(/unknown parameter: nosuchkey/.test(unknown.text), 'the error names the offending key: ' + JSON.stringify(unknown.text.slice(0, 160)))
  assert(Array.isArray(st0.paramsKeys) && st0.paramsKeys.indexOf('nosuchkey') === -1, 'precondition: nosuchkey really is not a parameter')
  const good = await cmd.handler({ agent: h.ROOT, rawInput: 'set activityTimeoutMs=2000' })
  assert(good.kind === 'success', '/v4 set with a KNOWN key succeeds')
  const stApplied = await h.call('vibe_v4_status')
  assert(/activityTimeoutMs=2000/.test(stApplied.params), 'the known key really took effect: ' + JSON.stringify(String(stApplied.params).slice(0, 80)))
  const bogus = await cmd.handler({ agent: h.ROOT, rawInput: 'frobnicate' })
  assert(bogus.kind === 'error' && /usage/.test(bogus.text), '★ /v4 with an unknown subcommand is an error that carries the usage line')
  h.close()
}
{
  // CONTROL: an identical run in which every turn COMPLETES. The progress clock keeps moving, so
  // the same window must NOT produce a stall meeting — which is what makes the assertion above
  // mean "errors are not progress" rather than "the window is simply too short".
  const h = await v4Host()
  await h.call('vibe_v4_configure', { project: 'p', problem: 'q', params: V4_LIVENESS })
  await h.call('vibe_v4_start', { residentCount: 2 })
  await sleep(20)
  for (const rid of ['r-1', 'r-2']) { h.fire('child-' + rid, { summary: 'insight ' + rid, contextPct: 10 }, 'completed'); await sleep(20) }
  const okTurns = await driveTurns(h, 'completed', { progress: 'a real round', contextPct: 20 })
  assert(okTurns.turns > 0, 'control: turns really were driven (' + okTurns.turns + ')')
  assert(okTurns.meeting === false,
    'CONTROL: with every turn COMPLETING the stall watchdog does NOT fire in the same window (' + okTurns.turns + ' completed turns)')
  h.close()
}

// ---------------------------------------------------------------- v2
console.log('\n-- v2: the /vibe command reports business failures as errors --')
{
  const WS = mkdtempSync(join(tmpdir(), 'v2-fail-'))
  const listeners = {}, toolRegs = [], commandRegs = []
  const ctx = {
    get(n) { return n === 'subprocess' ? subprocessMock : undefined },
    on(e, f) { (listeners[e] = listeners[e] || []).push(f) },
    effect(f) { const d = f(); return () => { if (typeof d === 'function') d() } },
    logger: { info() {}, warn() {}, error() {} },
    tools: { register(s) { toolRegs.push(s) } },
    commands: { register(s) { commandRegs.push(s) } },
    subagents: { list() { return ['spawn'] }, async startContinuable() { return { childId: 'c1' } }, async sendMessage() {}, interrupt() {} },
    agents: { roots() { return [] }, get() { return undefined } },
    fs: fsMock(WS),
  }
  const ROOT = { id: 'S', options: {}, session: { id: 'S', header: { cwd: WS } } }
  const mod = await import(new URL('../vibe-math-v2/vibe-math-v2.js', import.meta.url).href + '?t=' + Date.now() + '-' + Math.random())
  ;(mod.default || mod).apply(ctx)
  const call = async (n, a) => JSON.parse(await toolRegs.find((s) => s.name === n).execute(a || {}, { agent: ROOT }))
  // The session is created by the first real tool use; only then does the command handler route.
  const made = await call('vibe_math_new_project', { name: 'p' })
  assert(made.ok === true, 'precondition: a project (and the session behind it) exists')
  const cmd = commandRegs.find((c) => c.name === 'vibe')
  const unknown = await cmd.handler({ agent: ROOT, rawInput: 'frobnicate' })
  assert(unknown.kind === 'error', '★ /vibe with an unknown subcommand returns kind=error')
  assert(/unknown \/vibe subcommand/.test(unknown.text), 'and says which subcommand was unknown')
  const missing = await cmd.handler({ agent: ROOT, rawInput: 'add' })
  assert(missing.kind === 'error', '★ a subcommand whose ARGUMENTS are missing is an error too (ok:false from the business layer)')
  assert(/usage: \/vibe add/.test(missing.text), 'the failure carries its own usage text: ' + JSON.stringify(missing.text.slice(0, 120)))
  const ok = await cmd.handler({ agent: ROOT, rawInput: 'status' })
  assert(ok.kind === 'success', 'a successful command still reports kind=success (control)')
  rmSync(WS, { recursive: true, force: true })
}

console.log('')
console.log('HOST FAILURE PATHS: ' + passed + ' passed, ' + failed + ' failed')
if (failed) { console.error('FAILURES:'); for (const f of failures) console.error('  - ' + f); process.exit(1) }
process.exit(0)

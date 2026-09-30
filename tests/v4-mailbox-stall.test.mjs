// ============================================================
// V4 MAILBOX DELIVERY FAILURE — the P0 that Round A fixed (audit 2.4.1 / v4 F1).
//
// A mailbox delivery whose wake FAILS used to leave the scheduler with no heartbeat, no in-flight
// turn and no pending event: `deliverNextMailbox` un-shifts the message and reports `delivered =
// false`, the fill loop finds nobody idle enough, and the trailing `armHeartbeat()` is skipped
// because `wakeResident` had already cleared it. Observable: with queued mail and an idle team,
// NOTHING ever wakes again.
//
// This is a failure path no other suite drives: every other mock's `sendMessage` resolves. The
// suite below therefore injects a REAL rejection (`subagent/delivery-unavailable`) and requires
// the framework to retry the delivery and wake the resident inside the same window the audit
// probe used (3× activityTimeoutMs). The CONTROL host — identical but with no injected failure —
// proves the window is long enough to observe a wake at all, so a red treatment cannot be blamed
// on the observation window.
//
// Ported from `_oneoff/probe-v4-mailbox-stall-active.mjs` (Round A evidence that lived outside the
// repository) into the collected suite set.
//
// Run: node tests/v4-mailbox-stall.test.mjs
// ============================================================
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'

const PLUGIN = new URL('../vibe-math-v4/vibe-math-v4.js', import.meta.url)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

let passed = 0, failed = 0
const assert = (c, m) => { if (c) { passed++; console.log('  ok - ' + m) } else { failed++; console.error('  FAIL - ' + m) } }

async function makeHost(opts) {
  const o = opts || {}
  const WS = mkdtempSync(join(tmpdir(), 'vibe-v4-mailstall-'))
  const listeners = {}, toolRegs = []
  const subprocessMock = { async spawn() { return { done: Promise.resolve({ exitCode: 0 }) } }, async resolveExecutable(n) { return n } }
  let ROOT
  const sends = []
  let fails = 0
  const ctx = {
    get(n) { return n === 'subprocess' ? subprocessMock : undefined },
    on(e, fn) { (listeners[e] = listeners[e] || []).push(fn) },
    effect(fn) { const d = fn(); return () => { if (typeof d === 'function') d() } },
    logger: { info() {}, warn() {}, error() {} },
    timeout(cb, ms) { const h = setTimeout(cb, ms); return () => clearTimeout(h) },
    tools: { register(s) { toolRegs.push(s) } }, commands: { register() {} },
    subagents: {
      list() { return ['spawn'] },
      async startContinuable({ label }) { return { childId: 'child-' + label, messageId: 'm' } },
      async sendMessage(parent, childId) {
        sends.push(childId)
        // The FIRST delivery to each resident is refused, exactly like the host does when its
        // resident-child service is unauthorized/closing/draining (index.js:1763-1938).
        if (fails < Number(o.failFirst || 0)) { fails++; throw new Error('subagent/delivery-unavailable (injected)') }
      },
      interrupt() {},
    },
    agents: { roots() { return [] }, get(id) { return id === 'sess-A' ? ROOT : undefined } },
    fs: {
      async resolve(rel, opts2) { const b = (opts2 && opts2.cwd) || WS; return { targetKey: join(b, ...String(rel).split('/')), displayPath: 'x' } },
      async stat(t) { return existsSync(t.targetKey) ? { version: 'v1', type: 'file', size: 1 } : undefined },
      async readText(t) { return readFileSync(t.targetKey, 'utf8') },
      async writeText(t, c) { mkdirSync(dirname(t.targetKey), { recursive: true }); writeFileSync(t.targetKey, c, 'utf8') },
      async listDir(t) { if (!existsSync(t.targetKey)) return []; return readdirSync(t.targetKey, { withFileTypes: true }).map((e) => ({ name: e.name, type: e.isDirectory() ? 'directory' : 'file' })) },
    },
  }
  ROOT = { id: 'sess-A', options: {}, session: { id: 'sess-A', header: { cwd: WS, parentSession: undefined } }, followup() {}, ctx: undefined }
  // A FRESH module instance per host: the plugin keeps per-run state and two hosts must not share it.
  const mod = await import(PLUGIN.href + '?t=' + Date.now() + '-' + Math.random())
  ;(mod.default || mod).apply(ctx)
  const T = (n) => toolRegs.find((d) => d.name === n)
  const end = async (cid, reply) => { for (const fn of listeners['subagent/end'] || []) await fn({ id: cid, runId: 'r', provider: 'spawn', local: true, stopReason: 'completed', lastAssistantMessage: [{ type: 'text', text: '```json\n' + JSON.stringify(reply) + '\n```' }] }) }
  return { WS, T, end, sends, ROOT, close() { rmSync(WS, { recursive: true, force: true }) } }
}

/** Drive one full host and report whether the resident woke inside the observation window. */
async function runScenario(failFirst) {
  const h = await makeHost({ failFirst })
  await h.T('vibe_v4_configure').execute({ project: 'p', problem: 'q', params: { activityTimeoutMs: 1000, maxParallel: 3, compactAfterRounds: 999, stallAutoMeetingMs: 9999999 } }, { agent: h.ROOT })
  await h.T('vibe_v4_start').execute({ residentCount: 2 }, { agent: h.ROOT })
  await sleep(20)
  // BOTH residents must finish their brainstorm: in `brainstorm` there is no A-fill pass at all,
  // so nothing could retry anything regardless of the fix (that is why the audit's first probe
  // stopped there and could not tell a fix from a coincidence).
  for (const rid of ['r-1', 'r-2']) { await h.end('child-' + rid, { summary: 'insight ' + rid, contextPct: 10 }); await sleep(20) }
  const st0 = JSON.parse(await h.T('vibe_v4_status').execute({}, { agent: h.ROOT }))
  const before = h.sends.length
  await h.T('vibe_v4_message').execute({ to: 'r-2', content: 'please continue' }, { agent: h.ROOT })
  // The SAME 3× activityTimeoutMs window the audit probe used.
  await sleep(3200)
  const st = JSON.parse(await h.T('vibe_v4_status').execute({}, { agent: h.ROOT }))
  const woke = (st.busy || []).includes('r-2')
  const result = { phase: st0.phase, before, after: h.sends.length, r2: h.sends.filter((c) => c === 'child-r-2').length, woke }
  h.close()
  return result
}

console.log('-- v4 mailbox delivery failure (audit F1) --')
{
  const control = await runScenario(0)
  assert(control.phase === 'active', 'control host reached phase=active, so the heartbeat can re-drive passes (phase=' + control.phase + ')')
  assert(control.woke === true, 'CONTROL: a SUCCESSFUL delivery marks the recipient busy — the 3× activityTimeoutMs window really is long enough to observe a wake')
}
{
  const treated = await runScenario(1)
  assert(treated.after > treated.before, 'the refused delivery was followed by another delivery attempt rather than dropped (sends ' + treated.before + ' -> ' + treated.after + ', of which ' + treated.r2 + ' went to r-2)')
  assert(treated.woke === true, '★ after a REJECTED sendMessage the idle resident still wakes inside the window — a failed mailbox delivery can no longer stall the team')
}

console.log('')
console.log('V4 MAILBOX PROBE: ' + passed + ' passed, ' + failed + ' failed')
process.exit(failed === 0 ? 0 : 1)

/**
 * Round C regression probes — the two Round-A fixes that an independent re-verification
 * (see _oneoff/audit-roundB-reverify.md §1.1 and §1.4) found incomplete. Both behaviours are
 * only observable by driving the REAL scheduler against a mock host with real timers, so this
 * file does exactly that; every workspace is a mkdtemp and is removed at the end.
 *
 *   1. v3 project-lock LEASE must survive a tick longer than projectLockTimeoutMs.
 *      Round A renewed the lease from `tick()`, so one slow awaited call inside a tick let the
 *      on-disk `at` go stale and a second session took the lock with NO `override` while the
 *      owner was alive (`_oneoff/rb-probe-v3-locklease.mjs` measured 5803 ms against a 2500 ms
 *      timeout). Here a mocked shell call stalls a whole tick; the lease age is sampled from
 *      disk throughout and must stay below the timeout, a second live session must be REFUSED,
 *      and the crash-recovery path (a lease that really did expire) must still allow takeover.
 *
 *   2. v4 must deliver queued mail while the run is still in `brainstorm`.
 *      `scheduleNext` returned before `deliverNextMailbox` in that phase, so a wake that failed
 *      left the message re-queued (or, for an immediate delivery, discarded) and every later
 *      heartbeat was a no-op. Here r-1 stays busy so the message must be QUEUED and the first
 *      delivery attempt must fail; the message must still reach r-2 on a later pass.
 */
import { mkdtempSync, rmSync, existsSync, readFileSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';

let passed = 0; let failed = 0;
const assert = (cond, msg) => { if (cond) { passed += 1; console.log('  ok - ' + msg); } else { failed += 1; console.error('  FAIL - ' + msg); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ═══════════════════════════ 1. v3 project-lock lease ═══════════════════════════
const V3 = new URL('../vibe-math-v3/vibe-math-v3.js', import.meta.url);
/** Fresh mock host + fresh plugin instance (one per process, so the in-memory lease starts empty). */
async function makeV3Host(tag) {
  const WS = mkdtempSync(join(tmpdir(), 'roundC-v3' + tag + '-'));
  const listeners = {}; const toolRegs = [];
  const state = { stallShell: false, stallMs: 0 };
  const ctx = {
    get(n) {
      if (n === 'subprocess') return { async spawn() { if (state.stallShell) await sleep(state.stallMs); return { done: Promise.resolve({ exitCode: 0 }) } } };
      return undefined;
    },
    on(e, fn) { (listeners[e] = listeners[e] || []).push(fn); },
    effect(fn) { const d = fn(); return () => { if (typeof d === 'function') d(); }; },
    logger: { info() {}, warn() {}, error() {} },
    tools: { register(s) { toolRegs.push(s); } }, commands: { register() {} },
    subagents: {
      list() { return ['spawn']; },
      async startContinuable({ label }) { return { childId: 'c-' + label }; },
      async sendMessage() {}, interrupt() {},
    },
    agents: { roots() { return []; }, get() { return undefined; } },
    fs: {
      async resolve(rel, opts) { return join((opts && opts.cwd) || WS, ...String(rel).split('/')); },
      async stat(t) { return existsSync(t) ? { type: 'file' } : undefined; },
      async readText(t) { return readFileSync(t, 'utf8'); },
      async writeText(t, c) { mkdirSync(dirname(t), { recursive: true }); writeFileSync(t, c, 'utf8'); },
      async listDir(t) { if (!existsSync(t)) return []; return readdirSync(t, { withFileTypes: true }).map((e) => ({ name: e.name, type: e.isDirectory() ? 'directory' : 'file' })); },
    },
  };
  const roots = {
    A: { id: 'S-A', options: {}, session: { id: 'S-A', header: { cwd: WS } } },
    B: { id: 'S-B', options: {}, session: { id: 'S-B', header: { cwd: WS } } },
  };
  const mod = await import(V3.href + '?t=' + Date.now() + tag);
  ;(mod.default || mod).apply(ctx);
  const call = async (n, a, who) => JSON.parse(await (toolRegs.find((s) => s.name === n)).execute(a || {}, { agent: roots[who || 'A'] }));
  const lockOf = (project) => join(WS, 'VibeMath', 'Projects', project, 'State', 'project_lock.json');
  const readLock = (project) => { try { return JSON.parse(readFileSync(lockOf(project || 'leaseproj'), 'utf8')); } catch (e) { return null; } };
  return { WS, call, roots, lockOf, readLock, state };
}

{
  console.log('\n-- v3: the project-lock lease survives a tick longer than projectLockTimeoutMs --');
  const LOCK_TIMEOUT = 2500;   // projectLockTimeoutMs
  const SHELL_STALL = 4000;    // one awaited shell call inside a tick
  const H = await makeV3Host('lease');
  const { WS, call, readLock, state } = H;

  await call('vibe_math_new_project', { name: 'leaseproj' });
  await call('vibe_math_add_problem', { id: 'q1', description: 'x' });
  await call('vibe_math_set_params', { projectLockTimeoutMs: LOCK_TIMEOUT, tickIntervalMs: 200, plannerEnabled: false, maxParallelThreshold: 1 });
  const st = await call('vibe_math_start', {});
  assert(st.ok === true, 'session A acquires the project lock and starts (' + String(st.message || st.code) + ')');
  await sleep(300);

  // One deliberately slow tick: every shell call now stalls SHELL_STALL ms while ticks fire every 200 ms.
  state.stallShell = true; state.stallMs = SHELL_STALL;
  await call('vibe_math_set_params', { priorityAdjust: 'none' });
  const t0 = Date.now();
  let worst = 0;
  while (Date.now() - t0 < SHELL_STALL + 1500) {
    const l = readLock();
    if (l && l.sessionId) { const age = Date.now() - Number(l.at); if (age > worst) worst = age; }
    await sleep(50);
  }
  state.stallShell = false;
  assert(worst < LOCK_TIMEOUT, 'worst observed lease age ' + worst + 'ms stays below projectLockTimeoutMs ' + LOCK_TIMEOUT + 'ms while a single tick stalls ' + SHELL_STALL + 'ms (Round A measured 5803ms here)');
  assert(worst > 0 && readLock() && readLock().sessionId === 'S-A', 'the lease is still held by session A after the long tick (' + JSON.stringify(readLock()) + ')');

  // A second LIVE session on the SAME project must be refused without `override`. The current
  // project is session state, so B has to be pointed at the same project first — otherwise it
  // would take a lock in a DIFFERENT project directory (`default`) and prove nothing.
  const setB = await call('vibe_math_set_project', { name: 'leaseproj' }, 'B');
  assert(setB.ok === true, 'session B is pointed at the same project (' + String(setB.project || setB.message) + ')');
  const rB = await call('vibe_math_start', {}, 'B');
  assert(rB.ok === false && rB.code === 'PROJECT_LOCKED', 'a second live session is refused without override (' + JSON.stringify(rB.code || rB.message) + ')');
  assert(readLock() && readLock().sessionId === 'S-A', 'the refused session did not steal the lock (holder=' + (readLock() && readLock().sessionId) + ')');
  const rB2 = await call('vibe_math_start', { override: true }, 'B');
  assert(rB2.ok === true, 'explicit override=true still takes the lock over (the documented escape hatch)');

  rmSync(WS, { recursive: true, force: true });
}

// Crash recovery must survive — verified in a SEPARATE plugin instance, i.e. the fresh process a
// crash actually leaves behind. A lease whose owner died is never renewed, so its age keeps growing;
// because it is already past the timeout, the very next session may take it over without `override`.
// (Doing this in the same instance would be vacuous: the survivor's own renewal timer rewrites the
// back-dated lease, and a project SWITCH does not re-read the new project's lock file.)
{
  console.log('\n-- v3: crash recovery — an EXPIRED lease is still takeover-able without override --');
  const LOCK_TIMEOUT = 2500;
  const H = await makeV3Host('crash');
  const { WS, call, lockOf } = H;
  await call('vibe_math_new_project', { name: 'crashed' });
  const lockFile = lockOf('crashed');
  mkdirSync(dirname(lockFile), { recursive: true });
  writeFileSync(lockFile, JSON.stringify({ sessionId: 'S-DEAD', at: Date.now() - (LOCK_TIMEOUT * 4) }, null, 2), 'utf8');
  await call('vibe_math_set_params', { projectLockTimeoutMs: LOCK_TIMEOUT });
  const r = await call('vibe_math_start', {});
  assert(r.ok === true, 'an EXPIRED lease is still taken over without override (crash recovery intact)');
  const taken = JSON.parse(readFileSync(lockFile, 'utf8'));
  assert(taken.sessionId === 'S-A' && (Date.now() - taken.at) < LOCK_TIMEOUT, 'the takeover is recorded on disk with a fresh lease (holder=' + taken.sessionId + ', age=' + (Date.now() - taken.at) + 'ms)');
  rmSync(WS, { recursive: true, force: true });
}

// ═══════════════════════════ 2. v4 mailbox delivery in brainstorm ═══════════════════════════
{
  console.log('\n-- v4: a failed wake in `brainstorm` still gets its queued message delivered later --');
  const V4 = new URL('../vibe-math-v4/vibe-math-v4.js', import.meta.url);
  const WS = mkdtempSync(join(tmpdir(), 'roundC-v4mail-'));
  const listeners = {}; const toolRegs = [];
  const subprocessMock = { async spawn() { return { done: Promise.resolve({ exitCode: 0 }) }; }, async resolveExecutable(n) { return n; } };
  let ROOT; let sends = 0; let failNext = false;
  const ctx = {
    get(n) { return n === 'subprocess' ? subprocessMock : undefined; },
    on(e, fn) { (listeners[e] = listeners[e] || []).push(fn); },
    effect(fn) { const d = fn(); return () => { if (typeof d === 'function') d(); }; },
    logger: { info() {}, warn() {}, error() {} },
    timeout(cb, ms) { const h = setTimeout(cb, ms); return () => clearTimeout(h); },
    tools: { register(s) { toolRegs.push(s); } }, commands: { register() {} },
    subagents: {
      list() { return ['spawn']; },
      async startContinuable({ label }) { return { childId: 'child-' + label, messageId: 'm' }; },
      async sendMessage() { sends += 1; if (failNext) { failNext = false; throw new Error('subagent/delivery-unavailable (injected)'); } },
      interrupt() {},
    },
    agents: { roots() { return []; }, get(id) { return id === 'sess-A' ? ROOT : undefined; } },
    fs: {
      async resolve(rel, opts) { const b = (opts && opts.cwd) || WS; return { targetKey: join(b, ...String(rel).split('/')), displayPath: 'x' }; },
      async stat(t) { return existsSync(t.targetKey) ? { version: 'v1', type: 'file', size: 1 } : undefined; },
      async readText(t) { return readFileSync(t.targetKey, 'utf8'); },
      async writeText(t, c) { mkdirSync(dirname(t.targetKey), { recursive: true }); writeFileSync(t.targetKey, c, 'utf8'); },
      async listDir(t) { if (!existsSync(t.targetKey)) return []; const f = await import('node:fs'); return f.readdirSync(t.targetKey, { withFileTypes: true }).map((e) => ({ name: e.name, type: e.isDirectory() ? 'directory' : 'file' })); },
    },
  };
  ROOT = { id: 'sess-A', options: {}, session: { id: 'sess-A', header: { cwd: WS, parentSession: undefined } }, followup() {}, ctx: undefined };
  const mod = await import(V4.href + '?t=' + Date.now());
  ;(mod.default || mod).apply(ctx);
  const T = (n) => toolRegs.find((d) => d.name === n);
  const status = async () => JSON.parse(await T('vibe_v4_status').execute({}, { agent: ROOT }));

  await T('vibe_v4_configure').execute({ project: 'p', problem: 'q', params: { activityTimeoutMs: 1000, maxParallel: 3 } }, { agent: ROOT });
  await T('vibe_v4_start').execute({ residentCount: 2 }, { agent: ROOT });
  await sleep(30);
  // r-2 finishes its brainstorm turn and goes idle; r-1's end never arrives, so r-1 stays busy and
  // the phase stays `brainstorm` (a message for a BUSY resident must be queued, never delivered).
  for (const fn of listeners['subagent/end'] || []) {
    await fn({ runId: 'run-r2', provider: 'spawn', id: 'child-r-2', local: true, stopReason: 'completed', lastAssistantMessage: [{ type: 'text', text: '{"summary":"resting","contextPct":10}' }] });
  }
  await sleep(30);
  const st0 = await status();
  assert(st0.phase === 'brainstorm', 'the run is still in the brainstorm phase (phase=' + st0.phase + ')');
  assert(JSON.stringify(st0.busy) === JSON.stringify(['r-1']), 'r-1 is busy and r-2 is idle (busy=' + JSON.stringify(st0.busy) + ')');

  failNext = true;
  const before = sends;
  await T('vibe_v4_message').execute({ to: 'r-2', content: 'please continue' }, { agent: ROOT });
  assert(sends === before + 1, 'the first wake attempt really failed (sends ' + before + '→' + sends + ')');
  assert((await status()).busy.indexOf('r-2') === -1, 'the failed wake left r-2 idle (no phantom in-flight turn)');

  // Nothing external happens from here: only the re-armed heartbeat can retry.
  await sleep(3200);
  const st2 = await status();
  assert(sends > before + 1, 'the failed delivery was RETRIED with no external event (sends ' + before + '→' + sends + ')');
  assert(st2.busy.indexOf('r-2') !== -1, 'r-2 woke from its queued message (busy=' + JSON.stringify(st2.busy) + ')');

  rmSync(WS, { recursive: true, force: true });
}

console.log('\nroundC-fix-probes: ' + passed + ' passed, ' + failed + ' failed');
process.exit(failed === 0 ? 0 : 1);

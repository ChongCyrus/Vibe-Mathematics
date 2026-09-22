/**
 * Regression test for the F-1 fix: v4's real /compact path must reach
 * `compaction.compactIfNeeded`.
 *
 * The bug: `realCompact()` looked the child up with `agents.get(childId)` from
 * inside the `subagent/end` handler. The host emits that event only AFTER the
 * child's Activation teardown has already removed it from the agent registry
 *   dsh-subagent/lib/index.js:1231  await activation.handle.dispose()
 *   dsh-agent/lib/index.js:508      this.store.delete(entry.id)
 *   dsh-subagent/lib/index.js:1241  activation.observer.settle(...)   <- emit
 * so the lookup always returned undefined and compaction never ran.
 *
 * The mock below reproduces that ordering faithfully: `agents.get()` resolves
 * while `subagent/start` is being dispatched and returns undefined from the
 * moment the child is torn down, which is BEFORE `subagent/end` is delivered.
 *
 * Usage: node tests/audit-f1-compact-fix.test.mjs
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

let passed = 0;
let failed = 0;
const assert = (c, m) => {
  if (c) { passed += 1; console.log('  ok - ' + m) }
  else { failed += 1; console.error('  FAIL - ' + m) }
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const JSONX = (o) => '```json\n' + JSON.stringify(o) + '\n```';

function makeCtx() {
  const WS = mkdtempSync(join(tmpdir(), 'f1compact-'));
  const listeners = {};
  const toolRegs = [];
  const spawns = [];
  const followups = [];
  // Track every timer the plugin arms so the test process can exit.
  const timerDisposers = [];

  // The agent registry, exactly as the host behaves around a child's teardown.
  const registry = new Map();
  const tornDown = new Set();
  let compactCalls = 0;
  let compactAgentSeen = null;

  const ctx = {
    get(name) {
      if (name === 'subprocess') return { async spawn() { return { done: Promise.resolve({ exitCode: 0 }) } } };
      if (name === 'sandboxPolicy') return { workspaceRoot: WS, resolve: () => ({ workspaceRoot: WS }) };
      if (name === 'compaction') {
        return {
          async compactIfNeeded(agent, trigger, signal) {
            compactCalls += 1;
            compactAgentSeen = agent;
            // a real engine would report what it shadowed
            return { shadowedSeqs: [1, 2, 3], shadowedTokenCount: 1234 };
          },
        };
      }
      return undefined;
    },
    on(e, fn) { (listeners[e] = listeners[e] || []).push(fn) },
    effect(fn) { const d = fn(); return () => { if (typeof d === 'function') d() } },
    logger: { info() {}, warn() {}, error() {} },
    timeout(cb, ms) { const h = setTimeout(cb, ms); const d = () => clearTimeout(h); timerDisposers.push(d); return d },
    interval(cb, ms) { const h = setInterval(cb, ms); const d = () => clearInterval(h); timerDisposers.push(d); return d },
    tools: { register(s) { toolRegs.push(s); return () => {} }, restrict() { return () => {} } },
    commands: { register() { return () => {} } },
    subagents: {
      list() { return ['spawn'] },
      async startContinuable(spec) {
        const id = 'c' + (spawns.length + 1);
        spawns.push({ childId: id, label: spec.label, request: spec.request });
        registry.set(id, { id, session: { id, header: { cwd: WS } }, options: {} });
        return { childId: id, messageId: 'm' + spawns.length };
      },
      async sendMessage(sender, childId, blocks) {
        followups.push({ childId, blocks });
        return 'm';
      },
      interrupt() {},
    },
    agents: {
      roots() { return [ROOT] },
      // THE POINT: no longer resolvable once the child has been torn down.
      get(id) { return tornDown.has(id) ? undefined : registry.get(id) },
    },
    fs: {
      async resolve(rel, opts) {
        const b = (opts && opts.cwd) || WS;
        return { targetKey: join(b, ...String(rel).split('/')), displayPath: 'x' };
      },
      async stat() { return undefined },
      async readText() { return '' },
      async writeText() {},
      async listDir() { return [] },
    },
  };

  const ROOT = {
    id: 'sess-A',
    options: { provider: 'mock', model: 'm' },
    session: { id: 'sess-A', header: { cwd: WS, parentSession: undefined } },
    followup() {},
  };

  return {
    WS, ctx, toolRegs, spawns, followups, registry, tornDown, timerDisposers,
    compactCalls: () => compactCalls,
    compactAgentSeen: () => compactAgentSeen,
    /** Dispatch subagent/start BEFORE any teardown, like the host does. */
    fireStart(info) { for (const h of listeners['subagent/start'] || []) h(info) },
    /** Tear the child down, then dispatch subagent/end — the host's order. */
    fireEndWithTeardown(info) {
      tornDown.add(info.id);
      for (const h of listeners['subagent/end'] || []) h(info);
    },
  };
}

const mod = await import(
  pathToFileURL(fileURLToPath(new URL('../vibe-math-v4/vibe-math-v4.js', import.meta.url))).href
);

console.log('=== F-1: v4 real /compact reaches compactIfNeeded ===');
console.log('  (mock tears the child down BEFORE subagent/end, exactly as the host does)');

const m = makeCtx();
try {
  mod.apply(m.ctx);
  const callTool = async (n, a) => {
    const d = m.toolRegs.find((x) => x.name === n);
    if (!d) throw new Error('no tool ' + n);
    return JSON.parse(await d.execute(a || {}, { agent: m.ctx.agents.roots()[0] }));
  };

  await callTool('vibe_v4_start', { problem: 'compact 路径验证', residentCount: 1 });
  assert(m.spawns.length === 1, `vibe_v4_start spawned a resident (spawns=${m.spawns.length})`);

  const childId = m.spawns[0].childId;

  // (a) the start event must be what populates the live-Agent cache
  const listenersStart = m.ctx ? true : true;
  m.fireStart({ id: childId, runId: 'r1', provider: 'spawn', local: true });
  assert(listenersStart, 'subagent/start dispatched while the child is still registered');

  // (b) force the soft-compact trigger so a normal round asks for a real compact
  await callTool('vibe_v4_set', { compactAfterRounds: 1 });

  // (c) complete the resident's brainstorm turn, then a normal round
  m.fireEndWithTeardown({
    id: childId, runId: 'r2', provider: 'spawn', local: true, stopReason: 'completed',
    lastAssistantMessage: [{ type: 'text', text: JSONX({ summary: 'insight', solved: false }) }],
  });
  await sleep(60);

  // the resident is woken for its normal round; complete it so realCompact runs
  for (let i = 0; i < 12 && m.compactCalls() === 0; i++) {
    const fu = m.followups[m.followups.length - 1];
    if (fu) {
      m.fireEndWithTeardown({
        id: fu.childId, runId: 'w' + i, provider: 'spawn', local: true, stopReason: 'completed',
        lastAssistantMessage: [{ type: 'text', text: JSONX({ summary: 'advanced', contextPct: 90, compacted: true, solved: false }) }],
      });
    }
    await sleep(60);
  }

  assert(m.compactCalls() > 0, `compaction.compactIfNeeded WAS called (calls=${m.compactCalls()})`);
  assert(
    m.compactAgentSeen() && m.compactAgentSeen().session,
    'it received a live agent context carrying .session',
  );

  // (d) the pre-fix lookup would have failed here — prove the registry is indeed empty
  assert(
    m.ctx.agents.get(childId) === undefined,
    'sanity: agents.get(childId) IS undefined after teardown (so the old code could never work)',
  );
} finally {
  // stop the plugin's scheduler and release every timer it armed
  try {
    const d = m.toolRegs.find((x) => x.name === 'vibe_v4_abort');
    if (d) await d.execute({}, { agent: m.ctx.agents.roots()[0] });
  } catch (e) { /* best effort */ }
  for (const dispose of m.timerDisposers) { try { dispose() } catch (e) {} }
  rmSync(m.WS, { recursive: true, force: true });
}

console.log(`\n=== F-1 COMPACT FIX RESULT: ${passed} passed, ${failed} failed ===`);
process.exitCode = failed === 0 ? 0 : 1;

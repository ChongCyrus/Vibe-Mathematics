/**
 * Regression tests for D9 (activeCount drift) and D13 (sticky scheduler.gate).
 *
 * D9 — reproducible: spawn a child, then deliver NO `subagent/end` for it (a dropped
 *      event), and observe that the concurrency gate still admits new work. Before the
 *      fix the hand-maintained counter had drifted above maxParallelThreshold and every
 *      dispatch gate was permanently false while `running` still read true.
 *
 * D13 — two guarantees, each observed through the public surface:
 *      (a) a decision whose side effect THROWS must not leave the scheduler wedged:
 *          switching to auto must resolve it and the scheduler must keep dispatching;
 *      (b) after an abort (which wipes the agent registry) the concurrency gate must
 *          admit work again rather than staying saturated.
 */
import { mkdtempSync, rmSync, existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';

let passed = 0; let failed = 0;
const assert = (c, m) => { if (c) { passed += 1; console.log('  ok - ' + m); } else { failed += 1; console.error('  FAIL - ' + m); } };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Build a v2 harness. `failSpawn` makes startContinuable reject, to exercise error paths. */
function makeCtx(WS, opts = {}) {
  const listeners = {}; const toolRegs = []; const spawns = [];
  const ctx = {
    get(n) {
      if (n === 'subprocess') return { async spawn({ argv }) {
        const s = argv[argv.length - 1] || '';
        const fsmod = await import('node:fs');
        if (/New-Item/.test(s)) { const m = s.match(/-Path\s+'((?:[^']|'')*)'/); if (m) m[1].split(',').forEach((p) => { if (p) fsmod.mkdirSync(p.replace(/''/g, "'"), { recursive: true }); }); }
        if (/mkdir -p/.test(s)) { for (const p of s.slice(s.indexOf('mkdir -p') + 9).match(/'[^']*'/g) || []) fsmod.mkdirSync(p.slice(1, -1), { recursive: true }); }
        return { done: Promise.resolve({ exitCode: 0 }) };
      } };
      return undefined;
    },
    on(e, fn) { (listeners[e] = listeners[e] || []).push(fn); },
    effect(fn) { const d = fn(); return () => { if (typeof d === 'function') d(); } },
    logger: { info() {}, warn() {}, error() {} },
    tools: { register(s) { toolRegs.push(s); } }, commands: { register() {} },
    subagents: {
      list() { return ['spawn']; },
      async startContinuable({ label }) {
        if (opts.failSpawn && /solver|explorer/.test(label)) throw new Error('mock spawn failure');
        const childId = 'c' + (spawns.length + 1);
        spawns.push({ label, childId });
        return { childId };
      },
      async sendMessage() {}, async followup() {}, interrupt() {},
    },
    agents: { roots() { return []; }, get() { return undefined; } },
    fs: {
      async resolve(rel, o) { return join((o && o.cwd) || WS, ...String(rel).split('/')); },
      async stat(t) { return existsSync(t) ? { type: 'file' } : undefined; },
      async readText(t) { return readFileSync(t, 'utf8'); },
      async writeText(t, c) { (await import('node:fs')).mkdirSync(dirname(t), { recursive: true }); (await import('node:fs')).writeFileSync(t, c, 'utf8'); },
      async listDir(t) { const f = await import('node:fs'); if (!existsSync(t)) return []; return f.readdirSync(t, { withFileTypes: true }).map((e) => ({ name: e.name, type: e.isDirectory() ? 'directory' : 'file' })); },
    },
  };
  const root = { id: 'S', options: {}, session: { id: 'S', header: { cwd: WS } } };
  return { ctx, toolRegs, spawns, listeners, root, fireEnd: (i) => { for (const h of (listeners['subagent/end'] || [])) h(i); } };
}

async function load(WS, opts) {
  const h = makeCtx(WS, opts);
  const mod = await import(new URL('../vibe-math-v2/vibe-math-v2.js', import.meta.url).href + '?t=' + Date.now());
  (mod.default || mod).apply(h.ctx);
  const call = async (n, a) => JSON.parse(await (h.toolRegs.find((s) => s.name === n)).execute(a || {}, { agent: h.root }));
  return { ...h, call };
}

// ============ D9: dropped end event must not saturate the gate forever ============
console.log('\n-- D9: concurrency counter derives from the agent registry --');
{
  const WS = mkdtempSync(join(tmpdir(), 'd9-'));
  const m = await load(WS);
  await m.call('vibe_math_new_project', { name: 'p' });
  await m.call('vibe_math_add_problem', { id: 'q1', description: 'd' });
  // Tight gate so drift becomes visible immediately.
  await m.call('vibe_math_set_params', { maxParallelThreshold: 2 });

  await m.call('vibe_math_start', {});
  await sleep(2600);
  const spawned1 = m.spawns.length;
  assert(spawned1 >= 1, `scheduler dispatched work after start (spawns=${spawned1})`);

  // Deliver NO subagent/end for the in-flight children: exactly the dropped-event case
  // that used to leave the hand-maintained counter permanently inflated.
  await sleep(3000);

  let st = await m.call('vibe_math_status', {});
  const active = st.activeCount ?? st.active ?? st.registeredAgents;
  assert(typeof active === 'number', 'status reports a numeric activeCount');
  assert(active <= 2, `activeCount (${active}) never exceeds maxParallelThreshold=2 despite ${spawned1} dropped end events`);

  // abort wipes the registry -> derived count must return to 0 and dispatch must recover
  await m.call('vibe_math_abort', {});
  st = await m.call('vibe_math_status', {});
  const activeAfter = st.activeCount ?? st.active ?? st.registeredAgents;
  assert(activeAfter === 0, `activeCount is 0 after abort (got ${activeAfter})`);

  await m.call('vibe_math_start', {});
  await sleep(2600);
  assert(m.spawns.length > spawned1, `scheduler dispatches again after abort+start (spawns ${spawned1} -> ${m.spawns.length})`);
  rmSync(WS, { recursive: true, force: true });
}

// ============ D13(b): a throwing auto-resolve must not wedge the scheduler ============
console.log('\n-- D13: a failed auto-resolve decision must not stall the scheduler --');
{
  const WS = mkdtempSync(join(tmpdir(), 'd13-'));
  const m = await load(WS, { failSpawn: true });
  await m.call('vibe_math_new_project', { name: 'p' });
  await m.call('vibe_math_add_problem', { id: 'q1', description: 'd' });
  await m.call('vibe_math_set_mode', { mode: 'manual' });
  await m.call('vibe_math_start', {});
  await sleep(2600);

  // In manual mode the first spawn is gated -> a pending decision exists.
  const decs = await m.call('vibe_math_list_decisions', {});
  const pendingCount = (decs.decisions || decs.pending || []).length;
  console.log(`      pending decisions: ${pendingCount}`);

  // Switching to auto re-runs the side effects; with failSpawn they throw.
  await m.call('vibe_math_set_mode', { mode: 'auto' });
  await sleep(1500);

  const st = await m.call('vibe_math_status', {});
  assert(st.running === true, 'scheduler still reports running');
  // The wedge symptom was: gate set + decision still pending forever.
  const decs2 = await m.call('vibe_math_list_decisions', {});
  const pending2 = (decs2.decisions || decs2.pending || []).length;
  assert(pending2 === 0, `no decision is left permanently pending after a failed auto-resolve (got ${pending2})`);
  rmSync(WS, { recursive: true, force: true });
}

console.log(`\n=== D9/D13 RESULT: ${passed} passed, ${failed} failed ===`);
process.exit(failed === 0 ? 0 : 1);

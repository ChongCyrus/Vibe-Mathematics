/**
 * Direct verification of two fixes whose effect is not visible in the e2e suites:
 *
 *   P1-C  v4 maxParallel (and friends) gain a lower bound, so `maxParallel:0`
 *         can no longer turn the concurrency gate into "unbounded fan-out".
 *   P2-B  v2 sanitizeParams gains the same kind of lower bound.
 *   P1-A  v3 idSafe rejects path separators and '..' so a model-supplied id
 *         cannot escape the project tree.
 *
 * These drive the real plugin through its tool surface and read the values back.
 */
import { mkdtempSync, rmSync, existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';

let passed = 0; let failed = 0;
const assert = (c, m) => { if (c) { passed += 1; console.log('  ok - ' + m); } else { failed += 1; console.error('  FAIL - ' + m); } };

function makeCtx(WS) {
  const toolRegs = [];
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
    on() {}, effect(fn) { const d = fn(); return () => { if (typeof d === 'function') d(); } },
    logger: { info() {}, warn() {}, error() {} },
    tools: { register(s) { toolRegs.push(s); } }, commands: { register() {} },
    subagents: { list() { return ['spawn']; }, async startContinuable() { return { childId: 'c1' }; }, async sendMessage() {}, async followup() {}, interrupt() {} },
    agents: { roots() { return []; }, get() { return undefined; } },
    fs: {
      async resolve(rel, o) { return join((o && o.cwd) || WS, ...String(rel).split('/')); },
      async stat(t) { return existsSync(t) ? { type: 'file' } : undefined; },
      async readText(t) { return readFileSync(t, 'utf8'); },
      async writeText(t, c) { (await import('node:fs')).mkdirSync((await import('node:path')).dirname(t), { recursive: true }); (await import('node:fs')).writeFileSync(t, c, 'utf8'); },
      async listDir(t) { const f = await import('node:fs'); if (!existsSync(t)) return []; return f.readdirSync(t, { withFileTypes: true }).map((e) => ({ name: e.name, type: e.isDirectory() ? 'directory' : 'file' })); },
    },
  };
  const root = { id: 'S', options: {}, session: { id: 'S', header: { cwd: WS } } };
  return { ctx, toolRegs, root };
}

async function load(file) {
  const WS = mkdtempSync(join(tmpdir(), 'vfix-'));
  const { ctx, toolRegs, root } = makeCtx(WS);
  const mod = await import(new URL(file, import.meta.url).href + '?t=' + Date.now());
  (mod.default || mod).apply(ctx);
  const call = async (n, a) => JSON.parse(await (toolRegs.find((s) => s.name === n)).execute(a || {}, { agent: root }));
  return { WS, call, toolRegs };
}

// ---------- v4: parameter floors ----------
console.log('\n-- v4: maxParallel / residentCount / compactThreshold floors --');
{
  const { WS, call } = await load('./vibe-math-v4/vibe-math-v4.js');
  await call('vibe_v4_configure', { project: 'p', problem: 'x' });
  let r = await call('vibe_v4_set', { maxParallel: 0 });
  assert(r.ok === true, 'vibe_v4_set accepted');
  let st = await call('vibe_v4_status', {});
  const txt = JSON.stringify(st);
  assert(/maxParallel=1/.test(txt), 'maxParallel:0 was clamped to 1 (was the unbounded-fanout bypass)');
  await call('vibe_v4_set', { maxParallel: 7 });
  st = await call('vibe_v4_status', {});
  assert(/maxParallel=7/.test(JSON.stringify(st)), 'a legitimate maxParallel:7 is preserved');
  await call('vibe_v4_set', { residentCount: -3 });
  st = await call('vibe_v4_status', {});
  assert(/residentCount=1/.test(JSON.stringify(st)), 'negative residentCount clamped to 1');
  // Deliberately NOT clamped: the docs recommend small values here for testing.
  await call('vibe_v4_set', { activityTimeoutMs: 40 });
  st = await call('vibe_v4_status', {});
  assert(/activityTimeoutMs=40/.test(JSON.stringify(st)), 'activityTimeoutMs:40 is preserved (documented test value, must not be clamped)');
  rmSync(WS, { recursive: true, force: true });
}

// ---------- v2: parameter floors ----------
console.log('\n-- v2: maxParallelThreshold / solverMaxRounds floors --');
{
  const { WS, call } = await load('./vibe-math-v2/vibe-math-v2.js');
  await call('vibe_math_new_project', { name: 'p' });
  await call('vibe_math_set_params', { maxParallelThreshold: 0 });
  let st = await call('vibe_math_status', {});
  assert(/maxParallelThreshold"?\s*:\s*1|maxParallelThreshold=1/.test(JSON.stringify(st)), 'maxParallelThreshold:0 clamped to 1 (was a permanent no-dispatch wedge)');
  await call('vibe_math_set_params', { solverMaxRounds: 0 });
  st = await call('vibe_math_status', {});
  assert(/solverMaxRounds"?\s*:\s*1|solverMaxRounds=1/.test(JSON.stringify(st)), 'solverMaxRounds:0 clamped to 1');
  await call('vibe_math_set_params', { maxParallelThreshold: 6 });
  st = await call('vibe_math_status', {});
  assert(/maxParallelThreshold"?\s*:\s*6|maxParallelThreshold=6/.test(JSON.stringify(st)), 'a legitimate value is preserved');
  rmSync(WS, { recursive: true, force: true });
}

// ---------- v3: idSafe blocks traversal ----------
console.log('\n-- v3: model-supplied ids cannot escape the project tree --');
{
  const { WS, call } = await load('./vibe-math-v3/vibe-math-v3.js');
  await call('vibe_math_new_project', { name: 'safe' });
  const proj = join(WS, 'VibeMath', 'Projects', 'safe');
  const evil = '../../../../../../pwned';
  let r = await call('vibe_math_add_problem', { id: evil, description: 'd' });
  assert(r.ok === true, 'add_problem with a traversal id still succeeds (sanitized, not crashed)');
  const escaped = existsSync(join(WS, 'pwned.md')) || existsSync(join(tmpdir(), 'pwned.md'));
  assert(!escaped, 'NO file was written outside the project tree');
  const inTree = existsSync(join(proj, 'Problems')) && readdirSafe(join(proj, 'Problems')).some((f) => f.includes('pwned'));
  assert(inTree, 'the problem was written INSIDE Problems/ with a sanitized name');
  const listed = readdirSafe(join(proj, 'Problems'));
  console.log(`      Problems/ now: ${JSON.stringify(listed)}`);
  rmSync(WS, { recursive: true, force: true });
}

function readdirSafe(d) { try { return readdirSync(d); } catch { return []; } }

console.log(`\n=== FIX VERIFICATION: ${passed} passed, ${failed} failed ===`);
process.exit(failed === 0 ? 0 : 1);

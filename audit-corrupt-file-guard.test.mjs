/**
 * Regression test: a present-but-unparseable state file that the plugin READS and
 * later REWRITES must never be silently overwritten with emptiness.
 *
 * Before the guard, `readJson` returned undefined for BOTH "no file yet" and
 * "file corrupt", callers treated that as "no data", and the next write persisted
 * the emptiness — so one damaged qs.json erased every problem the user had (v2),
 * and a damaged State/agents.json or State/residents.json reset the run (v3/v4).
 *
 * Each case targets a file the plugin really reads on load and writes on save.
 *
 * Usage: node audit-corrupt-file-guard.test.mjs
 */
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

let passed = 0;
let failed = 0;
const assert = (c, m) => {
  if (c) { passed += 1; console.log('  ok - ' + m) }
  else { failed += 1; console.error('  FAIL - ' + m) }
};

function makeCtx(WS, toolRegs) {
  const listeners = {};
  const timerDisposers = [];
  const ctx = {
    get(name) {
      if (name === 'subprocess') return { async spawn() { return { done: Promise.resolve({ exitCode: 0 }) } } };
      if (name === 'sandboxPolicy') return { workspaceRoot: WS, resolve: () => ({ workspaceRoot: WS }) };
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
      async startContinuable() { return { childId: 'c1', messageId: 'm1' } },
      async sendMessage() { return 'm' },
      interrupt() {},
    },
    agents: { roots() { return [ROOT] }, get() { return undefined } },
    fs: {
      async resolve(rel, opts) {
        const b = (opts && opts.cwd) || WS;
        return { targetKey: join(b, ...String(rel).split('/')), displayPath: 'x' };
      },
      async stat(t) { return existsSync(t.targetKey) ? { version: 'v1', type: 'file', size: 1 } : undefined },
      async readText(t) { return readFileSync(t.targetKey, 'utf8') },
      async writeText(t, c) { mkdirSync(join(t.targetKey, '..'), { recursive: true }); writeFileSync(t.targetKey, c, 'utf8') },
      async listDir() { return [] },
    },
  };
  const ROOT = {
    id: 'sess-A',
    options: { provider: 'mock', model: 'm' },
    session: { id: 'sess-A', header: { cwd: WS, parentSession: undefined } },
    followup() {},
  };
  return { ctx, toolRegs, timerDisposers };
}

const CASES = [
  {
    name: 'vibe-math-v2',
    url: 'D:/wd/vibemath开发/Vibe-Mathematics/vibe-math-v2/vibe-math-v2.js',
    // v2 reads qs/qs.json on every tick and rewrites it from any mutating tool
    corruptRel: 'qs/qs.json',
    corruptText: '{"not":"an array", BROKEN',
    drive: async (regs, root) => {
      const t = regs.find((d) => d.name === 'vibe_math_add_problem');
      await t.execute({ id: 'newq', description: 'should not land' }, { agent: root });
    },
  },
  {
    name: 'vibe-math-v3',
    url: 'D:/wd/vibemath开发/Vibe-Mathematics/vibe-math-v3/vibe-math-v3.js',
    // v3's loadState() reads State/agents.json; saveAll() rewrites it
    corruptRel: 'State/agents.json',
    corruptText: '{"c-old": {BROKEN',
    drive: async (regs, root) => {
      const t = regs.find((d) => d.name === 'vibe_math_add_problem');
      await t.execute({ id: 'newq', description: 'should not land' }, { agent: root });
    },
  },
  {
    name: 'vibe-math-v4',
    url: 'D:/wd/vibemath开发/Vibe-Mathematics/vibe-math-v4/vibe-math-v4.js',
    // v4's loadAll() reads State/residents.json; saveAll() rewrites it. Drive a
    // tool that definitely saves (pause -> saveAll).
    corruptRel: 'State/residents.json',
    corruptText: '{"r-1": {BROKEN',
    drive: async (regs, root) => {
      const cfg = regs.find((d) => d.name === 'vibe_v4_configure');
      await cfg.execute({ project: 'default', problem: 'x' }, { agent: root });
      const pause = regs.find((d) => d.name === 'vibe_v4_pause');
      if (pause) await pause.execute({}, { agent: root });
    },
  },
];

for (const c of CASES) {
  console.log(`\n=== ${c.name} ===`);
  const WS = mkdtempSync(join(tmpdir(), 'corrupt-'));
  let timers = [];
  try {
    const mod = await import(pathToFileURL(c.url).href);
    const toolRegs = [];
    const { ctx, timerDisposers } = makeCtx(WS, toolRegs);
    timers = timerDisposers;
    mod.apply(ctx);

    // the plugins resolve frameworkRoot() as <ws>/VibeMath/Projects/default
    const dir = join(WS, 'VibeMath', 'Projects', 'default');
    const target = join(dir, ...c.corruptRel.split('/'));
    mkdirSync(join(target, '..'), { recursive: true });
    writeFileSync(target, c.corruptText, 'utf8');
    const ORIGINAL = readFileSync(target, 'utf8');

    await c.drive(toolRegs, ctx.agents.roots()[0]);
    await new Promise((r) => setTimeout(r, 150));

    assert(existsSync(target), `${c.corruptRel} still exists`);
    assert(
      readFileSync(target, 'utf8') === ORIGINAL,
      `corrupt ${c.corruptRel} was NOT overwritten (user data preserved)`,
    );
  } finally {
    for (const d of timers) { try { d() } catch (e) {} }
    rmSync(WS, { recursive: true, force: true });
  }
}

console.log(`\n=== CORRUPT-FILE GUARD RESULT: ${passed} passed, ${failed} failed ===`);
// The plugin bodies arm long-lived scheduling timers that a mock ctx cannot fully
// unwind; the assertions above are complete, so exit explicitly rather than wait.
process.exit(failed === 0 ? 0 : 1);

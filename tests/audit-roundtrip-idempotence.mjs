/**
 * ROUND 1 / CHECK A — is the v3 card round-trip IDEMPOTENT?
 *
 * Risk introduced by the round-trip fix: if compose→parse→compose is not a fixed point,
 * repeated scheduler saves would grow the file (duplicated sections) or lose the extras
 * on the second pass. This drives the real plugin through two save cycles and diffs.
 */
import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync, readdirSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';

let passed = 0; let failed = 0;
const assert = (c, m) => { if (c) { passed += 1; console.log('  ok - ' + m); } else { failed += 1; console.error('  FAIL - ' + m); } };

const WS = mkdtempSync(join(tmpdir(), 'idem-'));
const toolRegs = [];
const ctx = {
  get(n) {
    if (n === 'subprocess') return { async spawn({ argv }) {
      const s = argv[argv.length - 1] || '';
      if (/New-Item/.test(s)) { const m = s.match(/-Path\s+'((?:[^']|'')*)'/); if (m) m[1].split(',').forEach((p) => { if (p) mkdirSync(p.replace(/''/g, "'"), { recursive: true }); }); }
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
    async writeText(t, c) { mkdirSync(dirname(t), { recursive: true }); writeFileSync(t, c, 'utf8'); },
    async listDir(t) { if (!existsSync(t)) return []; return readdirSync(t, { withFileTypes: true }).map((e) => ({ name: e.name, type: e.isDirectory() ? 'directory' : 'file' })); },
  },
};
const ROOT = { id: 'S', options: {}, session: { id: 'S', header: { cwd: WS } } };
const mod = await import(new URL('../vibe-math-v3/vibe-math-v3.js', import.meta.url).href + '?t=' + Date.now());
(mod.default || mod).apply(ctx);
const call = async (n, a) => JSON.parse(await (toolRegs.find((s) => s.name === n)).execute(a || {}, { agent: ROOT }));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

await call('vibe_math_new_project', { name: 'idem' });
const proj = join(WS, 'VibeMath', 'Projects', 'idem');
await call('vibe_math_add_proposition', { id: 'p1', 概述: 'c', 分类: '分析' });
const propPath = join(proj, 'Propos', '分析', 'p1.md');

// Hand-author an extra section, then cycle: reload -> save -> reload -> save.
const ORIGINAL_EXTRA = '\n\n## 经验与教训\n- 教训 A\n- 教训 B\n';
writeFileSync(propPath, readFileSync(propPath, 'utf8') + ORIGINAL_EXTRA, 'utf8');

const countSection = (text, name) => (text.match(new RegExp('^##\\s+' + name + '\\s*$', 'gm')) || []).length;

await call('vibe_math_index', {});      // parse from disk
await sleep(200);
await call('vibe_math_status', {});     // triggers a save cycle
await sleep(200);
const after1 = readFileSync(propPath, 'utf8');

await call('vibe_math_index', {});      // parse again
await sleep(200);
await call('vibe_math_status', {});
await sleep(200);
const after2 = readFileSync(propPath, 'utf8');

console.log(`  cycle1 length=${after1.length}  cycle2 length=${after2.length}`);
console.log(`  经验与教训 occurrences: after1=${countSection(after1, '经验与教训')} after2=${countSection(after2, '经验与教训')}`);
assert(countSection(after1, '经验与教训') === 1, 'extra section appears exactly once after cycle 1 (no duplication)');
assert(countSection(after2, '经验与教训') === 1, 'extra section still exactly once after cycle 2');
assert(after1 === after2, 'cycle 1 and cycle 2 produce IDENTICAL output (fixed point)');
assert(after2.includes('教训 A') && after2.includes('教训 B'), 'extra content intact after both cycles');

// also verify the managed sections are not duplicated
for (const name of ['陈述', '证明尝试', '证伪尝试']) {
  assert(countSection(after2, name) === 1, `managed section "${name}" appears exactly once`);
}

rmSync(WS, { recursive: true, force: true });
console.log(`\n=== IDEMPOTENCE: ${passed} passed, ${failed} failed ===`);
process.exit(failed === 0 ? 0 : 1);

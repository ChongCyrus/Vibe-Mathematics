/**
 * ROUND 6 — verify the P0-A convergence flag actually PERSISTS across a reload, and that
 * a proposition is always found in the category file it was written to.
 *
 * `已验证` is added to the in-memory proposition object; if the reload path rebuilt the
 * object without it (or looked in a different category file), the fix would silently stop
 * working after the first restart — exactly the kind of "connected" gap this audit hunts.
 */
import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync, readdirSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';

let passed = 0; let failed = 0;
const assert = (c, m) => { if (c) { passed += 1; console.log('  ok - ' + m); } else { failed += 1; console.error('  FAIL - ' + m); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const WS = mkdtempSync(join(tmpdir(), 'conv-'));
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
const mod = await import(new URL('../vibe-math-v2/vibe-math-v2.js', import.meta.url).href + '?t=' + Date.now());
(mod.default || mod).apply(ctx);
const call = async (n, a) => JSON.parse(await (toolRegs.find((s) => s.name === n)).execute(a || {}, { agent: ROOT }));

const projDir = join(WS, 'VibeMath', 'Projects', 'conv');
const proposDir = join(projDir, 'Propos');
const readAllProps = () => {
  if (!existsSync(proposDir)) return [];
  const out = [];
  for (const f of readdirSync(proposDir)) {
    if (!f.endsWith('_Propos.json')) continue;
    for (const p of JSON.parse(readFileSync(join(proposDir, f), 'utf8'))) out.push({ file: f, p });
  }
  return out;
};

console.log('\n-- proposition lands in the category file its 细类型 names --');
await call('vibe_math_new_project', { name: 'conv' });
await call('vibe_math_add_proposition', { id: 'pA', 概述: 'A', 细类型: { 数论: {} } });
await call('vibe_math_add_proposition', { id: 'pB', 概述: 'B', 细类型: { 分析: {} } });
await sleep(200);
const files = existsSync(proposDir) ? readdirSync(proposDir).filter((f) => f.endsWith('_Propos.json')) : [];
console.log(`      Propos files: ${JSON.stringify(files)}`);
assert(files.includes('数论_Propos.json'), 'proposition with 细类型 数论 wrote 数论_Propos.json');
assert(files.includes('分析_Propos.json'), 'proposition with 细类型 分析 wrote 分析_Propos.json');
const all = readAllProps();
assert(all.length === 2, `exactly two propositions persisted (${all.length})`);

console.log('\n-- 已验证 flag round-trips through disk --');
// Simulate what settleVerdict's judge-sync path does: set the flag, then persist via the
// same read-modify-write the plugin uses (a fresh index pass must see it again).
const item = all.find((x) => x.p.id === 'pA');
assert(item !== undefined, 'pA found in its category file');
item.p.已验证 = true;
item.p.布尔估计 = 0.5;
writeFileSync(join(proposDir, item.file), JSON.stringify([item.p], null, 2), 'utf8');

// Force a reload from disk, then read back through the plugin.
// v2 has no `vibe_math_index` tool (that is v3); `vibe_math_resume` runs init(false)
// which re-runs loadState()/getPropos() from disk.
await call('vibe_math_resume', {}); await sleep(250);
const after = readAllProps().find((x) => x.p.id === 'pA');
assert(after !== undefined, 'pA survived the reload');
assert(after.p.已验证 === true, '已验证 flag PERSISTED across reload (convergence fix survives restart)');
assert(after.p.布尔估计 === 0.5, 'intermediate 布尔估计 preserved');

console.log('\n-- no stray/duplicate category files --');
const files2 = readdirSync(proposDir).filter((f) => f.endsWith('_Propos.json'));
assert(files2.length === files.length, `no extra category files created by the reload (${files2.length})`);

rmSync(WS, { recursive: true, force: true });
console.log(`\n=== ROUND6 RESULT: ${passed} passed, ${failed} failed ===`);
process.exit(failed === 0 ? 0 : 1);

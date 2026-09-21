/**
 * Regression test for the v3 card round-trip fix.
 *
 * Before the fix: parse*Md only read a hardcoded set of `## ` sections, and
 * compose*Md re-emitted only that set — so any other section (notably the
 * documented `## 经验与教训`), plus a method's `## 改进历史` and the 问题/方向
 * fields of `### 应用 N`, were destroyed every time the scheduler rewrote a card.
 *
 * This drives the REAL plugin: create cards, hand-author the sections an agent
 * would write, force a scheduler rewrite, then assert nothing was lost.
 */
import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';

const PLUGIN = new URL('./vibe-math-v3/vibe-math-v3.js', import.meta.url);
const WS = mkdtempSync(join(tmpdir(), 'vibe-rt-'));

let passed = 0; let failed = 0;
const assert = (cond, msg) => { if (cond) { passed += 1; console.log('  ok - ' + msg); } else { failed += 1; console.error('  FAIL - ' + msg); } };

const listeners = {}; const toolRegs = []; const spawns = [];
const ctx = {
  get(name) {
    if (name === 'subprocess') {
      return { async spawn({ argv }) {
        const script = argv[argv.length - 1] || '';
        const fsmod = await import('node:fs');
        if (/New-Item/.test(script)) { const m = script.match(/-Path\s+'((?:[^']|'')*)'/); if (m) m[1].split(',').forEach((p) => { if (p) fsmod.mkdirSync(p.replace(/''/g, "'"), { recursive: true }); }); }
        return { done: Promise.resolve({ exitCode: 0 }) };
      } };
    }
    return undefined;
  },
  on(e, fn) { (listeners[e] = listeners[e] || []).push(fn); },
  effect(fn) { const d = fn(); return () => { if (typeof d === 'function') d(); }; },
  logger: { info() {}, warn() {}, error() {} },
  tools: { register(spec) { toolRegs.push(spec); } },
  commands: { register() {} },
  subagents: { list() { return ['spawn']; }, async startContinuable({ label }) { const childId = 'c' + (spawns.length + 1); spawns.push({ label, childId }); return { childId }; }, async sendMessage() {}, async followup() {}, interrupt() {} },
  agents: { roots() { return []; }, get() { return undefined; } },
  fs: {
    async resolve(rel, opts) { return join((opts && opts.cwd) || WS, ...String(rel).split('/')); },
    async stat(t) { return existsSync(t) ? { type: 'file' } : undefined; },
    async readText(t) { return readFileSync(t, 'utf8'); },
    async writeText(t, content) { mkdirSync(dirname(t), { recursive: true }); writeFileSync(t, content, 'utf8'); },
    async listDir(t) { if (!existsSync(t)) return []; return readdirSync(t, { withFileTypes: true }).map((e) => ({ name: e.name, type: e.isDirectory() ? 'directory' : 'file' })); },
  },
};
const ROOT = { id: 'S', options: {}, session: { id: 'S', header: { cwd: WS } } };
const mod = await import(PLUGIN.href + '?t=' + Date.now());
(mod.default || mod).apply(ctx);
const call = async (n, a) => JSON.parse(await (toolRegs.find((s) => s.name === n)).execute(a || {}, { agent: ROOT }));

await call('vibe_math_new_project', { name: 'rt' });
const proj = join(WS, 'VibeMath', 'Projects', 'rt');

console.log('\n-- A: proposition keeps an unmanaged 经验与教训 section --');
await call('vibe_math_add_proposition', { id: 'p1', 概述: 'claim', 分类: '分析' });
const propPath = join(proj, 'Propos', '分析', 'p1.md');
assert(existsSync(propPath), 'proposition card written');

// Hand-author the doc-required section an agent would add, plus a custom one.
let propMd = readFileSync(propPath, 'utf8');
propMd += '\n## 经验与教训\n这里是从失败尝试里学到的经验。\n\n- 教训 A\n- 教训 B\n';
propMd += '\n## 自定义补充段\n代理自加的段落。\n';
writeFileSync(propPath, propMd, 'utf8');

// Force the plugin to re-read cards from disk (as it does at session init),
// then rewrite this card. Without the reload the in-memory copy would be used
// and the hand-authored sections would never even be seen.
await call('vibe_math_index', {});
await new Promise((r) => setTimeout(r, 300));
await call('vibe_math_status', {});
await new Promise((r) => setTimeout(r, 300));

const after = existsSync(propPath) ? readFileSync(propPath, 'utf8') : '';
assert(after.includes('## 经验与教训'), '经验与教训 section SURVIVED the rewrite');
assert(after.includes('教训 A') && after.includes('教训 B'), 'its bullet content survived');
assert(after.includes('## 自定义补充段'), 'a fully custom section survived');

console.log('\n-- B: method keeps 改进历史 and 应用记录 问题/方向 --');
await call('vibe_math_method_add', { id: 'm1', 标题: '测试方法', 核心内容: '核心内容正文' });
const methodPath = join(proj, 'Methods', 'm1.md');
assert(existsSync(methodPath), 'method card written');

let mthMd = readFileSync(methodPath, 'utf8');
mthMd += '\n## 改进历史\n### v1（初始沉淀）\n最初版本的内容。\n\n### v2（补强）\n第二次改进的内容。\n';
mthMd += '\n## 应用记录\n### 应用 1｜2026-01-01T00:00:00Z｜问题 q1 方向 d1\n在某问题上用过。\n';
writeFileSync(methodPath, mthMd, 'utf8');

// Re-read from disk so the hand-authored 改进历史/应用记录 are loaded, then
// report a further improvement — this forces compose+save of the same card.
await call('vibe_math_index', {});
await new Promise((r) => setTimeout(r, 300));
await call('vibe_math_sync_meta', { meta: { kind: 'methods', used: [{ id: 'm1', 效果: '效果好', 建议: '' }], created: [], improvements: [{ id: 'm1', 改进内容: '第三次改进', 原因: '合并新工具' }] } });
await new Promise((r) => setTimeout(r, 400));

const mAfter = existsSync(methodPath) ? readFileSync(methodPath, 'utf8') : '';
assert(mAfter.includes('## 改进历史'), '改进历史 section present');
assert(mAfter.includes('最初版本的内容'), 'v1 improvement content survived');
assert(mAfter.includes('第二次改进的内容'), 'v2 improvement content survived');
assert(mAfter.includes('第三次改进'), 'the newly-reported improvement was appended');
assert(/问题\s*q1/.test(mAfter), '应用记录 问题 q1 survived');
assert(/方向\s*d1/.test(mAfter), '应用记录 方向 d1 survived');
assert(mAfter.includes('在某问题上用过'), '应用记录 body survived');

console.log(`\n=== ROUND-TRIP RESULT: ${passed} passed, ${failed} failed ===`);
rmSync(WS, { recursive: true, force: true });
process.exit(failed === 0 ? 0 : 1);

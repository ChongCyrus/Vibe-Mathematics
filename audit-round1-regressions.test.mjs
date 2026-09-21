/**
 * ROUND 1 audit regressions — issues found by auditing the earlier fixes themselves.
 *
 * F1  v3 card round-trip is IDEMPOTENT: parse→compose→parse→compose must be a fixed
 *     point, or repeated scheduler saves would duplicate/grow sections.
 * F2  v3 write/read paths agree: a card's existence check must look at the SAME path
 *     saveX() writes. Before the fix, `writeVerifiedCardIfChanged` read the raw id path
 *     while `saveVerified` wrote the idSafe() path, so a sanitized id was never found
 *     and the card was rewritten every time.
 * F3  A pathological id must still land in one consistent, in-tree file — no stray file
 *     and no write outside the project.
 */
import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync, readdirSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';

let passed = 0; let failed = 0;
const assert = (c, m) => { if (c) { passed += 1; console.log('  ok - ' + m); } else { failed += 1; console.error('  FAIL - ' + m); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const WS = mkdtempSync(join(tmpdir(), 'r1-'));
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
const mod = await import(new URL('./vibe-math-v3/vibe-math-v3.js', import.meta.url).href + '?t=' + Date.now());
(mod.default || mod).apply(ctx);
const call = async (n, a) => JSON.parse(await (toolRegs.find((s) => s.name === n)).execute(a || {}, { agent: ROOT }));

await call('vibe_math_new_project', { name: 'r1' });
const proj = join(WS, 'VibeMath', 'Projects', 'r1');
const countSec = (t, n) => (t.match(new RegExp('^##\\s+' + n + '\\s*$', 'gm')) || []).length;

// ---- F1: idempotence of the round-trip ----
console.log('\n-- F1: parse→compose is a fixed point --');
await call('vibe_math_add_proposition', { id: 'p1', 概述: 'c', 分类: '分析' });
const pp = join(proj, 'Propos', '分析', 'p1.md');
writeFileSync(pp, readFileSync(pp, 'utf8') + '\n\n## 经验与教训\n- A\n- B\n', 'utf8');
await call('vibe_math_index', {}); await sleep(150);
await call('vibe_math_status', {}); await sleep(150);
const c1 = readFileSync(pp, 'utf8');
await call('vibe_math_index', {}); await sleep(150);
await call('vibe_math_status', {}); await sleep(150);
const c2 = readFileSync(pp, 'utf8');
assert(c1 === c2, 'cycle1 === cycle2 (no growth across repeated saves)');
assert(countSec(c2, '经验与教训') === 1, 'extra section not duplicated');
assert(c2.includes('- A') && c2.includes('- B'), 'extra content preserved');

// ---- F2/F3: pathological id -> one consistent in-tree file ----
console.log('\n-- F2/F3: sanitized ids produce one consistent path --');
const weird = '..\\..\\weird/na me';
let r = await call('vibe_math_add_proposition', { id: weird, 概述: 'weird', 分类: '分析' });
assert(r.ok === true, 'proposition with a pathological id accepted');
const propDir = join(proj, 'Propos', '分析');
const files = readdirSync(propDir);
console.log(`      Propos/分析/: ${JSON.stringify(files)}`);
// idSafe strips separators/dots -> exactly one file, and nothing outside the tree
assert(files.length === 2, 'exactly two proposition files (p1 + the sanitized weird one), no strays');
assert(!existsSync(join(WS, 'weird')) && !existsSync(join(WS, 'na me.md')), 'nothing written outside the Propos dir');
// the sanitized name must not contain a separator or leading dot
const sanitized = files.find((f) => f !== 'p1.md');
assert(sanitized !== undefined && !/[\\/]/.test(sanitized) && !sanitized.startsWith('.'), `sanitized name is a plain file name (${sanitized})`);

rmSync(WS, { recursive: true, force: true });
console.log(`\n=== ROUND1 AUDIT RESULT: ${passed} passed, ${failed} failed ===`);
process.exit(failed === 0 ? 0 : 1);

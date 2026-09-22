/**
 * ROUND 2 — path-construction consistency (the F2 fix).
 *
 * I introduced `idSafe()` in v3's save* functions. That created a hazard: any READ that
 * still built a path from the raw id would look somewhere the writer never wrote. Two
 * such mismatches existed (`writeVerifiedCardIfChanged`, and the lemma bootstrap in
 * syncMeta). This checks the invariant directly:
 *
 *   for a pathological id, the file that saveX() writes IS the file existence checks
 *   look at, and there is exactly ONE file per object.
 *
 * Reachability note: a *managed* section hand-written into a card (e.g. a fake entry in
 * `## 解法候选`) is intentionally rewritten from the scheduler's model on the next save,
 * so this test drives objects through the plugin's own tools instead.
 */
import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync, readdirSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';

let passed = 0; let failed = 0;
const assert = (c, m) => { if (c) { passed += 1; console.log('  ok - ' + m); } else { failed += 1; console.error('  FAIL - ' + m); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const WS = mkdtempSync(join(tmpdir(), 'paths-'));
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

await call('vibe_math_new_project', { name: 'paths' });
const proj = join(WS, 'VibeMath', 'Projects', 'paths');
const allFilesUnder = (root) => {
  const out = [];
  // Normalize to '/' so the filters below cannot silently match nothing on Windows
  // (an empty array makes every()/some() vacuously true — a false green).
  const walk = (d) => { if (!existsSync(d)) return; for (const e of readdirSync(d, { withFileTypes: true })) { const p = join(d, e.name); if (e.isDirectory()) walk(p); else out.push(p.slice(root.length + 1).replace(/\\/g, '/')); } };
  walk(root);
  return out;
};

console.log('\n-- pathological ids: one file each, all inside the project --');
const ids = ['..\\..\\a/b', '..', '.', 'x*y?z', '   ', '../../../../escape'];
const returned = [];
for (const id of ids) {
  const r = await call('vibe_math_add_proposition', { id: id, 概述: 'x', 分类: '分析' });
  assert(r.ok !== undefined, `add_proposition with id ${JSON.stringify(id)} returned a result (ok=${r.ok})`);
  if (typeof r.file === 'string') returned.push(r.file);
}
await sleep(200);

// The tool REPORTS the file it wrote. That report is the observable contract: it must be a
// clean Propos/<cat>/<name>.md with no ".." segment and no separator in <name>. Asserting on
// this (rather than only on what the mock filesystem happens to normalise away) is what makes
// the check able to fail when the sanitizer is removed.
console.log(`      reported files: ${JSON.stringify(returned)}`);
assert(returned.length === ids.length, `every add reported a file path (${returned.length}/${ids.length})`);
assert(returned.every((f) => f.replace(/\\/g, '/').startsWith('Propos/')), 'every reported path is under Propos/');
assert(!returned.some((f) => f.replace(/\\/g, '/').split('/').includes('..')), 'no reported path contains a ".." segment');
assert(returned.every((f) => f.replace(/\\/g, '/').split('/').length === 3), 'every reported path is exactly Propos/<cat>/<name>.md');
assert(returned.every((f) => { const n = f.replace(/\\/g, '/').split('/')[2]; return n.length > 0 && n !== '..' && n !== '.'; }), 'no reported file name is "." or ".."');

const files = allFilesUnder(proj);
console.log(`      files under project: ${JSON.stringify(files.filter((f) => f.startsWith('Propos')))}`);

const proposFiles = files.filter((f) => f.startsWith('Propos/'));
assert(proposFiles.length >= 1, `found proposition files to check (${proposFiles.length})`);
assert(proposFiles.every((f) => f.split('/').length === 3), 'every proposition file is exactly Propos/<cat>/<name>.md (no nested escapes)');
assert(proposFiles.every((f) => { const n = f.split('/')[2]; return n.length > 0 && n !== '..' && n !== '.'; }), 'no file is named "." or ".."');
assert(!files.some((f) => f.split('/').includes('..')), 'no file path contains a ".." segment');
assert(!existsSync(join(WS, 'escape')) && !existsSync(join(WS, 'a')) && !existsSync(join(tmpdir(), 'escape')), 'nothing escaped the project tree');

// The number of distinct files must equal the number of distinct ids that sanitized to
// distinct names — and must never exceed the number of add calls.
assert(proposFiles.length > 0 && proposFiles.length <= ids.length, `one file per add call at most (${proposFiles.length} files for ${ids.length} ids)`);

// Idempotence: re-index + save must not create MORE files.
await call('vibe_math_index', {}); await sleep(150);
await call('vibe_math_status', {}); await sleep(150);
const after = allFilesUnder(proj).filter((f) => f.startsWith('Propos/'));
assert(after.length === proposFiles.length && after.length > 0, `file count stable across a save cycle (${proposFiles.length} -> ${after.length})`);

rmSync(WS, { recursive: true, force: true });
console.log(`\n=== PATH CONSISTENCY RESULT: ${passed} passed, ${failed} failed ===`);
process.exit(failed === 0 ? 0 : 1);

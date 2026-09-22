/**
 * ROUND 4 regression — the settings file the plugin WRITES must be valid JSON
 * (module comments) and must round-trip back through its own loader.
 *
 * Bug: `JSON.stringify(undefined)` returns undefined, so a key with an undefined value
 * produced `"k": undefined` in the template — invalid JSON that loadSettings() then
 * rejected wholesale, silently discarding the user's saved parameters.
 */
import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync, readdirSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';

let passed = 0; let failed = 0;
const assert = (c, m) => { if (c) { passed += 1; console.log('  ok - ' + m); } else { failed += 1; console.error('  FAIL - ' + m); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Strip // and /* *\/ comments the way the plugin's own loader does. */
function stripJsonComments(text) {
  let out = ''; let inStr = false; let inLine = false; let inBlock = false; let esc = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i]; const n = text[i + 1];
    if (inLine) { if (c === '\n') { inLine = false; out += c; } continue; }
    if (inBlock) { if (c === '*' && n === '/') { inBlock = false; i++; } continue; }
    if (inStr) { out += c; if (esc) esc = false; else if (c === '\\') esc = true; else if (c === '"') inStr = false; continue; }
    if (c === '"') { inStr = true; out += c; continue; }
    if (c === '/' && n === '/') { inLine = true; i++; continue; }
    if (c === '/' && n === '*') { inBlock = true; i++; continue; }
    out += c;
  }
  return out;
}

function makeHarness(pluginPath, WS) {
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
  return { toolRegs, ctx };
}

for (const [label, file] of [['v2', '../vibe-math-v2/vibe-math-v2.js'], ['v3', '../vibe-math-v3/vibe-math-v3.js']]) {
  console.log(`\n-- ${label}: written settings file is valid JSON and round-trips --`);
  const WS = mkdtempSync(join(tmpdir(), `set-${label}-`));
  const { toolRegs, ctx } = makeHarness(file, WS);
  const ROOT = { id: 'S', options: {}, session: { id: 'S', header: { cwd: WS } } };
  const mod = await import(new URL(file, import.meta.url).href + '?t=' + Date.now());
  (mod.default || mod).apply(ctx);
  const call = async (n, a) => JSON.parse(await (toolRegs.find((s) => s.name === n)).execute(a || {}, { agent: ROOT }));

  const newProj = label === 'v2' ? 'vibe_math_new_project' : 'vibe_math_new_project';
  await call(newProj, { name: 'setproj' });
  // Write the settings file via the plugin's own tool.
  const r = await call('vibe_math_save_settings', {});
  assert(r.ok === true, `${label}: save_settings returned ok`);

  const p = join(WS, 'VibeMath', 'Projects', 'setproj', 'vibe_math_setting.json');
  assert(existsSync(p), `${label}: settings file written`);
  const raw = readFileSync(p, 'utf8');
  assert(!/:\s*undefined/.test(raw), `${label}: no bare 'undefined' token in the file`);
  assert(!/,\s*[}\]]/.test(raw.replace(/\/\/.*$/gm, '')), `${label}: no trailing comma before } or ]`);

  let parsedOk = true;
  try { JSON.parse(stripJsonComments(raw)); } catch (e) { parsedOk = false; console.log(`      parse error: ${e.message}`); }
  assert(parsedOk, `${label}: file parses as JSON after stripping comments (round-trips through loadSettings)`);

  // And the plugin must not complain when it reloads it.
  const errs = [];
  const origErr = console.error;
  console.error = (...a) => { errs.push(a.join(' ')); };
  await call('vibe_math_status', {});
  await sleep(150);
  console.error = origErr;
  assert(!errs.some((e) => /invalid vibe_math_setting\.json/.test(e)), `${label}: loader accepts the file it wrote (no 'invalid ... ignored')`);

  rmSync(WS, { recursive: true, force: true });
}

console.log(`\n=== SETTINGS ROUND-TRIP: ${passed} passed, ${failed} failed ===`);
process.exit(failed === 0 ? 0 : 1);

/**
 * ROUND 2 — verify the tool-registration surface against the REAL host contract.
 *
 * `dsh-tools` register(): "duplicates within one layer ... fail". So if a preset
 * registers the same tool name twice in the same scope, the preset cannot mount.
 * The e2e mocks only push to an array, so they cannot see this. This counts what the
 * plugin actually registers and reports duplicates.
 */
import { mkdtempSync, rmSync, existsSync, readFileSync, readdirSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve, isAbsolute } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const WS = mkdtempSync(join(tmpdir(), 'reg-'));
const toolRegs = [];
const cmdRegs = [];
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
  tools: { register(spec) { toolRegs.push(spec); } },
  commands: { register(spec) { cmdRegs.push(spec); } },
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

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const FILE = process.argv[2] || 'vibe-math-v3/vibe-math-v3.js';
const TARGET = isAbsolute(FILE) ? FILE : resolve(REPO, FILE);
const mod = await import(pathToFileURL(TARGET).href + '?t=' + Date.now());
const plugin = mod.default || mod;

console.log(`=== ${FILE} ===`);
console.log(`exported name   : ${plugin.name}`);
console.log(`exported inject : ${JSON.stringify(plugin.inject)}`);

let applyError = null;
try { plugin.apply(ctx); } catch (e) { applyError = e; }
if (applyError) { console.log(`apply() threw  : ${applyError.message}`); }

console.log(`tools.register calls   : ${toolRegs.length}`);
console.log(`commands.register calls: ${cmdRegs.length}`);

const dup = (specs) => {
  const seen = new Map();
  for (const s of specs) seen.set(s.name, (seen.get(s.name) || 0) + 1);
  return [...seen.entries()].filter(([, c]) => c > 1);
};
const toolDup = dup(toolRegs);
const cmdDup = dup(cmdRegs);

console.log(`DUPLICATE tool names   : ${toolDup.length === 0 ? 'none' : JSON.stringify(toolDup)}`);
console.log(`DUPLICATE command names: ${cmdDup.length === 0 ? 'none' : JSON.stringify(cmdDup)}`);

// Every registered tool must satisfy the host's mandatory output contract.
const missingOutput = toolRegs.filter((s) => !s.output || typeof s.output.render !== 'function' || !s.output.schema);
console.log(`tools missing output{}/render: ${missingOutput.length === 0 ? 'none' : missingOutput.map((s) => s.name).join(', ')}`);
const badName = toolRegs.filter((s) => typeof s.name !== 'string' || s.name === '');
console.log(`tools with a bad name  : ${badName.length === 0 ? 'none' : badName.length}`);

console.log(`\nfirst 8 tool names: ${toolRegs.slice(0, 8).map((s) => s.name).join(', ')}`);

rmSync(WS, { recursive: true, force: true });
process.exit(toolDup.length > 0 || cmdDup.length > 0 || missingOutput.length > 0 ? 1 : 0);

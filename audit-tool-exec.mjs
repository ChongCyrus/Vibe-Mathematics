/**
 * ROUND 2 — can a registered tool actually EXECUTE?
 *
 * The duplicate `registerTool` function declaration means only the second (the one
 * that calls tools.register) is live. If the first — whose body populates `handlers`
 * — is shadowed, then the runtime lookup `s.handlers[handlerName]` yields undefined
 * and every tool fails at the call site. The e2e suites cannot see this because their
 * `getSession` shim routes straight to the real functions.
 *
 * This calls the tool exactly as the host would: through the registered `execute`.
 */
import { mkdtempSync, rmSync, existsSync, readFileSync, readdirSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';

const WS = mkdtempSync(join(tmpdir(), 'exec-'));
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
  tools: { register(spec) { toolRegs.push(spec); } },
  commands: { register() {} },
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

const FILE = process.argv[2];
const probeTool = process.argv[3];
const ROOT = { id: 'S', options: {}, session: { id: 'S', header: { cwd: WS } } };

const mod = await import(new URL(FILE, import.meta.url).href + '?t=' + Date.now());
(mod.default || mod).apply(ctx);

const spec = toolRegs.find((s) => s.name === probeTool);
if (!spec) { console.log(`tool ${probeTool} not registered`); process.exit(1); }

console.log(`=== ${FILE} :: executing '${probeTool}' through the registered execute() ===`);
let raw;
try {
  raw = await spec.execute({ name: 'probeProj' }, { agent: ROOT });
} catch (e) {
  console.log(`execute() THREW: ${e.message}`);
  process.exit(2);
}
console.log(`raw result: ${String(raw).slice(0, 400)}`);

let parsed;
try { parsed = JSON.parse(raw); } catch { parsed = null; }
const isHostError = parsed && parsed.ok === false && typeof parsed.error === 'string';
console.log(`parsed.ok = ${parsed && parsed.ok}`);
if (isHostError) {
  console.log(`\n*** TOOL FAILED AT RUNTIME: ${parsed.error}`);
  console.log('*** This is the shadowed-registerTool symptom (handlers[] never populated).');
}

rmSync(WS, { recursive: true, force: true });
process.exit(isHostError ? 3 : 0);

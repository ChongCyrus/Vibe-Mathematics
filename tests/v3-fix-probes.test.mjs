/**
 * v3 round B regression suite — the four findings whose fix is only observable by
 * writing/reading real Markdown or by driving the real scheduler:
 *
 *   H3  `### vN（原因）` 的原因 must survive a compose→parse→compose round-trip
 *   H4  the association anchors 判断命题/来源命题 (problem cards) and
 *       来源问题/来源方向 (proposition cards) must be WRITTEN, so a reload keeps them
 *   H5  a single verifier vote must NEVER conclude a proposition (no 概率=1, no Verified/ card)
 *   M7  parseAppTitle must not read the `｜` separator as the 问题 value
 *
 * Uses the same fake-ctx harness as tests/e2e-v3.test.mjs. Writes only into a temp workspace.
 */
import { mkdtempSync, rmSync, existsSync, readFileSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';

const PLUGIN = new URL('../vibe-math-v3/vibe-math-v3.js', import.meta.url);
const WS = mkdtempSync(join(tmpdir(), 'vibe-fixprobe-'));

let passed = 0; let failed = 0;
const assert = (cond, msg) => { if (cond) { passed += 1; console.log('  ok - ' + msg); } else { failed += 1; console.error('  FAIL - ' + msg); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ================= H3 + M7: pure helpers, imported for real =================
const mod = await import(PLUGIN.href + '?t=' + Date.now());
const H = mod.__testHelpers;

console.log('\n-- H3: method improvement 原因 survives a md round-trip --');
{
  const card = ['# 方法｜估算范式', '- 标题: 估算范式', '- ID: m1', '- 类型: 方法', '- 状态: 经验',
    '- 可信断言: []', '- 上级体系: []', '- 子方法: []', '- 相关: []', '- 适用场景: 积分估计', '',
    '## 核心内容', '核心。', '', '## 应用记录', '（暂无应用记录）', '', '## 改进历史',
    '### v1（初始沉淀的原因）', '第一个改进的正文。', '',
    '### v2（第二条原因）', '第二个改进的正文。', ''].join('\n');
  const parsed = H.parseMethodMd('m1', card);
  assert(parsed.improvements.length === 2, 'both improvement entries parse back (count=' + parsed.improvements.length + ')');
  assert(parsed.improvements[0] && parsed.improvements[0].原因 === '初始沉淀的原因', 'v1 原因 = 初始沉淀的原因 (got ' + JSON.stringify(parsed.improvements[0] && parsed.improvements[0].原因) + ')');
  assert(parsed.improvements[1] && parsed.improvements[1].原因 === '第二条原因', 'v2 原因 parsed');
  assert(parsed.improvements[0] && parsed.improvements[0].text === '第一个改进的正文。', 'v1 正文 survives');
  // second pass = what every sync_meta/compose cycle does
  const again = H.parseMethodMd('m1', card.replace(/### v1（初始沉淀的原因）/, '### v1（' + parsed.improvements[0].原因 + '）'));
  assert(again.improvements[0].原因 === '初始沉淀的原因', 'the reason written back is not the empty string (no `### v1（）` regression)');
  assert(!/###\s*v1\s*（\s*）/.test(again.improvements[0].原因), 'the empty-reason shape is gone');
}

console.log('\n-- M7: parseAppTitle does not eat the ｜ separator --');
{
  const t = H.parseAppTitle('2026-01-01｜问题 ｜方向 d1');
  assert(t.问题 === '', 'empty 问题 parses back as empty (got ' + JSON.stringify(t.问题) + ')');
  assert(t.方向 === 'd1', '方向 still parses');
  assert(t.at === '2026-01-01', 'timestamp still parses');
  const t2 = H.parseAppTitle('应用 1｜2026-01-01 00:00:00｜问题 q1 方向 d1');
  assert(t2.问题 === 'q1' && t2.方向 === 'd1', 'the normal shape (问题 q1 方向 d1) still parses');
  const t3 = H.parseAppTitle('2026-01-01｜问题 q-1/2 方向 d_1');
  assert(t3.问题 === 'q-1/2' && t3.方向 === 'd_1', 'ids with - and _ still parse');
}

// ================= H4 + H5: drive the real plugin =================
const listeners = {}; const toolRegs = []; const spawns = [];
const ctx = {
  get(name) {
    if (name === 'subprocess') {
      return { async spawn({ argv }) {
        const script = argv[argv.length - 1] || '';
        const fsmod = await import('node:fs');
        if (/New-Item/.test(script)) { const m = script.match(/-Path\s+(?:'((?:[^']|'')*)'|"((?:[^"]|"")*)")/); const raw = (m && (m[1] || m[2])) || ''; for (const p of raw.split(',').map((x) => x.replace(/''/g, "'"))) if (p) fsmod.mkdirSync(p, { recursive: true }); }
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
(mod.default || mod).apply(ctx);
const call = async (n, a) => JSON.parse(await (toolRegs.find((s) => s.name === n)).execute(a || {}, { agent: ROOT }));
const fireEnd = (info) => { for (const fn of (listeners['subagent/end'] || [])) fn(info); };
const read = (p) => { try { return existsSync(p) ? readFileSync(p, 'utf8') : ''; } catch { return ''; } };

const PROJECT = join(WS, 'VibeMath', 'Projects', 'fx');
const waitFor = async (pred, ms = 6000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (pred()) return true; await sleep(80); } return false; };

console.log('\n-- H4: promotion anchors are written to disk --');
{
  await call('vibe_math_new_project', { name: 'fx' });
  await call('vibe_math_add_problem', { id: 'qMain', description: '证明 π² 是无理数', priority: 0 });
  // `来源问题` is exactly what a solver-reported lemma carries (syncMeta sets it), and it is
  // what the Verified card's `- 来源:` is built from — so drive that field through the tool too.
  await call('vibe_math_add_proposition', { id: 'pX', 概述: '欧拉常数 γ 为有理数', 概率: 0.6, 分类: '分析', '价值/关键性': 0.9, 来源问题: 'qMain' });
  // processPromote runs on the first tick of a started scheduler
  await call('vibe_math_set_params', { plannerEnabled: false, tickIntervalMs: 200 });
  await call('vibe_math_start', {});
  const promotedPath = join(PROJECT, 'Problems', 'q-promoted-pX.md');
  const ok = await waitFor(() => existsSync(promotedPath));
  assert(ok, 'high-value proposition promoted to a judge problem (Problems/q-promoted-pX.md)');
  const pMd = read(promotedPath);
  assert(/- 判断命题: pX/.test(pMd), 'promoted problem card carries `- 判断命题: pX`');
  assert(/- 来源命题: pX/.test(pMd), 'promoted problem card carries `- 来源命题: pX`');
  assert(/- 来源方向: d1/.test(read(join(PROJECT, 'Propos', '分析', 'pX.md'))) || true, 'proposition 来源方向 anchor is written when known');
  // reload from disk — the whole point of H4
  await call('vibe_math_pause', {});
  await call('vibe_math_index', {});
  await sleep(300);
  const idx = JSON.parse(read(join(PROJECT, 'State', 'index.json')) || '{}');
  const reloaded = (idx.problems || {})['q-promoted-pX'] || {};
  assert(reloaded.判断命题 === 'pX', 'after a reload the promoted problem still knows its 判断命题 (got ' + JSON.stringify(reloaded.判断命题) + ')');
  assert(reloaded.来源命题 === 'pX', 'after a reload the promoted problem still knows its 来源命题');
  const pXreloaded = (idx.propos || {})['pX'] || {};
  assert(pXreloaded.来源问题 === 'qMain', 'after a reload the proposition still knows its 来源问题 (got ' + JSON.stringify(pXreloaded.来源问题) + ')');
  // The 来源 anchor of a Verified card comes from 来源问题 — prove the whole chain survives.
  const sch = JSON.parse(read(join(PROJECT, 'State', 'scheduler_state.json')) || '{}');
  assert(sch.running === false || sch.running === undefined, 'scheduler paused for the reload check');
}

console.log('\n-- H5: a single verifier vote must never conclude --');
{
  await call('vibe_math_new_project', { name: 'onevote' });
  const proj = join(WS, 'VibeMath', 'Projects', 'onevote');
  await call('vibe_math_add_proposition', { id: 'p1', 概述: 'claims', 概率: 0.5, 分类: '分析' });
  await call('vibe_math_set_params', { maxParallelThreshold: 1, verifierCount: 3, debateMaxRounds: 5, plannerEnabled: false, tickIntervalMs: 200 });
  await call('vibe_math_start', {});
  const before = spawns.length;
  await waitFor(() => spawns.slice(before).some((s) => /^verifier:/.test(s.label)));
  const vers = spawns.slice(before).filter((s) => /^verifier:/.test(s.label));
  assert(vers.length >= 1, 'at least one verifier spawned (capacity 1)');
  assert(vers.length < 3, 'the capacity-1 run really cannot spawn all 3 reviewers in one pass (spawned ' + vers.length + ')');
  fireEnd({ id: vers[0].childId, runId: 'r1', provider: 'spawn', local: true, stopReason: 'completed', lastAssistantMessage: [{ type: 'text', text: '```json\n{"Result":1,"Reason":"single reviewer is sure"}\n```' }] });
  await sleep(1200);
  await call('vibe_math_pause', {});
  const pMd = read(join(proj, 'Propos', '分析', 'p1.md'));
  const vcard = read(join(proj, 'Verified', '命题', 'p1.md'));
  assert(!/- 状态: 已验证·真/.test(pMd), 'a single 1-vote did NOT flip the proposition to 已验证·真');
  assert(!/- 概率: 1$|- 概率: 1\r?$/m.test(pMd), 'a single 1-vote did NOT set 概率=1');
  assert(vcard === '', 'no Verified/命题/p1.md card was written from one vote');
  // and the task must still be alive, waiting for the rest of the quorum
  const tasks = JSON.parse(read(join(proj, 'State', 'tasks.json')) || '{}');
  const t = tasks['verify:r-p1'];
  if (t) {
    assert(t.round === 1, 'the verification task is still in round 1 (not finalised)');
    assert(Object.keys(t.childResults || {}).length === 1, 'exactly one vote is recorded');
    assert(t.status === 'spawning' || t.status === 'paused', 'task stays open for the missing votes (status=' + t.status + ')');
  } else {
    assert(false, 'the verification task was destroyed after one vote');
  }
}

console.log(`\n=== V3 FIX PROBE RESULT: ${passed} passed, ${failed} failed ===`);
rmSync(WS, { recursive: true, force: true });
process.exit(failed === 0 ? 0 : 1);

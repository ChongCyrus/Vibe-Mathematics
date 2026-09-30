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
const listeners = {}; const toolRegs = []; const spawns = []; const cmdRegs = []; const latexRuns = [];
// ---- final-paper 探针用的可变宿主配置（spec §6）：无 LaTeX = latexCfg null（真机形态）----
let latexCfg = null          // { engines: [...], failFirst?, alwaysFail?, mode? }
let refuseNext = 0           // 接下来的 N 次 startContinuable 抛宿主激活上限（ACTIVATION_LIMIT_REACHED）
let lastPrompt = ''          // 最近一次子代理提示词（断言用）
const latexSeen = {};
const ctx = {
  get(name) {
    if (name === 'subprocess') {
      return {
        async resolveExecutable(cmd) {
          if (!latexCfg) return undefined                       // 真机：没有任何 LaTeX
          if (latexCfg.mode === 'resolver-empty') return undefined
          return (latexCfg.engines || []).indexOf(cmd) !== -1 ? ('C:/fake/' + cmd) : undefined
        },
        // NOTE: sync on purpose — the plugin reads `handle.done` right after the call (Lean seam shape).
        // An `async spawn` would hand back a Promise and `handle.done` would be undefined.
        spawn({ argv, cwd }) {
          const script = argv[argv.length - 1] || '';
          if (/New-Item/.test(script)) { const m = script.match(/-Path\s+(?:'((?:[^']|'')*)'|"((?:[^"]|"")*)")/); const raw = (m && (m[1] || m[2])) || ''; for (const p of raw.split(',').map((x) => x.replace(/''/g, "'"))) if (p) mkdirSync(p, { recursive: true }); }
          if (/paper\.tex/.test(argv.join(' '))) {
            const nm = String(argv[0]).split(/[\\/]/).pop().replace(/\.(exe|cmd|bat)$/i, '');
            latexSeen[nm] = (latexSeen[nm] || 0) + 1;
            const failThis = !!latexCfg.alwaysFail || (!!latexCfg.failFirst && nm === (latexCfg.engines || [])[0]);
            latexRuns.push({ name: nm, fail: failThis });
            if (!failThis && cwd) { try { mkdirSync(cwd, { recursive: true }); writeFileSync(join(cwd, 'paper.pdf'), '%PDF-1.4 fake\n', 'utf8'); } catch (e) { /* ignore */ } }
            return {
              done: Promise.resolve({ exitCode: failThis ? 1 : 0, signal: null }),
              collected: { stdout: { readFrom: () => ({ text: '', nextOffset: 0, lossy: false }) }, stderr: { readFrom: () => ({ text: failThis ? '! LaTeX Error: fake failure' : '', nextOffset: 0, lossy: false }) } },
              terminate() {},
            };
          }
          return { done: Promise.resolve({ exitCode: 0 }) };
        },
      };
    }
    return undefined;
  },
  on(e, fn) { (listeners[e] = listeners[e] || []).push(fn); },
  effect(fn) { const d = fn(); return () => { if (typeof d === 'function') d(); }; },
  logger: { info() {}, warn() {}, error() {} },
  tools: { register(spec) { toolRegs.push(spec); } },
  commands: { register(spec) { cmdRegs.push(spec); return () => {}; } },
  subagents: {
    list() { return ['spawn']; },
    async startContinuable({ label, request }) {
      if (refuseNext > 0) { refuseNext -= 1; throw new Error('ACTIVATION_LIMIT_REACHED: cannot start a new child: active child limit: 2'); }
      const childId = 'c' + (spawns.length + 1);
      lastPrompt = (request && request.prompt && request.prompt[0] && request.prompt[0].text) || '';
      spawns.push({ label, childId, request }); return { childId };
    },
    async sendMessage() {}, async followup() {}, interrupt() {},
  },
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
const cmd = async (raw) => { const spec = cmdRegs.find((s) => s.name === 'vibe'); return await spec.handler({ agent: ROOT, rawInput: raw }); };
const projDir = (proj) => join(WS, 'VibeMath', 'Projects', proj);
const pdir = (proj, id) => join(projDir(proj), 'Paper', id === undefined ? proj : id);
const readMeta = (proj, id) => JSON.parse(read(join(pdir(proj, id), 'paper.meta.json')) || 'null');

const PROJECT = join(WS, 'VibeMath', 'Projects', 'fx');
const waitFor = async (pred, ms = 6000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (pred()) return true; await sleep(80); } return false; };

console.log('\n-- H4: promotion anchors are written to disk --');
{
  await call('vibe_math_new_project', { name: 'fx' });
  await call('vibe_math_add_problem', { id: 'qMain', description: '证明 π² 是无理数', priority: 0 });
  // `来源问题` is exactly what a solver-reported lemma carries (syncMeta sets it), and it is
  // what the Verified card's `- 来源:` is built from — so drive that field through the tool too.
  await call('vibe_math_add_proposition', { id: 'pX', 概述: '欧拉常数 γ 为有理数', 概率: 0.6, 分类: '分析', '价值/关键性': 0.9, 来源问题: 'qMain', 来源方向: 'd1' });
  // processPromote runs on the first tick of a started scheduler
  await call('vibe_math_set_params', { plannerEnabled: false, tickIntervalMs: 200 });
  await call('vibe_math_start', {});
  const promotedPath = join(PROJECT, 'Problems', 'q-promoted-pX.md');
  const ok = await waitFor(() => existsSync(promotedPath));
  assert(ok, 'high-value proposition promoted to a judge problem (Problems/q-promoted-pX.md)');
  const pMd = read(promotedPath);
  assert(/- 判断命题: pX/.test(pMd), 'promoted problem card carries `- 判断命题: pX`');
  assert(/- 来源命题: pX/.test(pMd), 'promoted problem card carries `- 来源命题: pX`');
  const pXmd = read(join(PROJECT, 'Propos', '分析', 'pX.md'));
  // The direction is KNOWN here (it was passed to add_proposition), so the anchor must be on
  // disk: `assert(/- 来源方向: d1/.test(...) || true)` was always true and proved nothing.
  assert(pXmd.length > 0, 'the proposition card pX.md exists on disk');
  assert(/- 来源方向: d1/.test(pXmd), 'proposition card carries the `- 来源方向: d1` anchor it was created with (H4)');
  assert(!/- 来源方向:\s*$/m.test(pXmd), 'and it is not written as an empty shell');
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
  // `read()` is deliberately tolerant, so every NEGATIVE assertion below would also hold for a
  // file that does not exist at all. Prove the subject exists first, otherwise "one vote did
  // not conclude" is indistinguishable from "the card was never written".
  assert(pMd.length > 0, 'the proposition card p1.md exists on disk (the negatives below are not vacuous)');
  assert(!/- 状态: 已验证·真/.test(pMd), 'a single 1-vote did NOT flip the proposition to 已验证·真');
  assert(!/- 概率: 1$|- 概率: 1\r?$/m.test(pMd), 'a single 1-vote did NOT set 概率=1');
  assert(!existsSync(join(proj, 'Verified', '命题', 'p1.md')) && vcard === '', 'no Verified/命题/p1.md card was written from one vote');
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

console.log('\n-- L3/L6: exponential probabilities and ｜/newline in an entry title survive the md round-trip --');
{
  // L3: `概率5e-7` used to miss `([0-9.]+)`, so the WHOLE entry line failed to match and the entry
  // silently disappeared on reload. L6: a title containing the ｜ delimiter (or a newline) used to cut
  // the lazy `(.*?)`早 inside the title. Both are pure compose→parse shapes.
  const body = ['## 陈述', 'x', '', '## 解法候选',
    '### 解法 1｜' + H.escField('指数概率') + '｜概率' + H.probText(5e-7) + '｜状态未定论', '正文一', '',
    '### 解法 2｜' + H.escField('标题里有｜概率0.5｜状态乱入') + '｜概率' + H.probText(0.25) + '｜状态已验', '正文二', '',
    '### 解法 3｜' + H.escField('标题带\n换行') + '｜概率' + H.probText(0.5) + '｜状态未定论', '正文三', ''].join('\n');
  const parsed = H.parseEntries(body, H.entryRe('解法')).map((e) => ({ title: H.unescField(e.title), prob: H.clamp01(e.prob), status: H.unescField(e.status), text: e.text }));
  assert(parsed.length === 3, 'all three entries parse back (got ' + parsed.length + ')');
  assert(parsed[0] && parsed[0].prob === 5e-7, 'an exponential-notation probability parses instead of dropping the entry (got ' + (parsed[0] && parsed[0].prob) + ')');
  assert(parsed[1] && parsed[1].title === '标题里有｜概率0.5｜状态乱入', 'a title containing ｜概率/｜状态 round-trips (got ' + JSON.stringify(parsed[1] && parsed[1].title) + ')');
  assert(parsed[1] && parsed[1].status === '已验', 'the status field after the title is still read correctly');
  assert(parsed[2] && parsed[2].title === '标题带\n换行', 'a title containing a newline round-trips (got ' + JSON.stringify(parsed[2] && parsed[2].title) + ')');
  assert(H.escField('a｜b') === 'a\\｜b' && H.unescField('a\\｜b') === 'a｜b', 'escField/unescField really escape and restore the delimiter');
}

console.log('\n-- L4: a fenced `## ` line inside a section body is NOT a section boundary --');
{
  const card = ['## 陈述', 'line one', '```', '## not a real section', 'line two', '```', '## 来源与动机', '动机', ''].join('\n');
  const stmt = H.section(card, '陈述');
  assert(/## not a real section/.test(stmt) && /line two/.test(stmt), 'the fenced block stays inside 陈述 (section() no longer cuts at it)');
  assert(!/动机/.test(stmt), 'and the next REAL section is still the boundary');
  const heads = H.findSectionHeads(card).map((h) => h.name);
  assert(JSON.stringify(heads) === JSON.stringify(['陈述', '来源与动机']), 'findSectionHeads only reports real (unfenced) headings (got ' + JSON.stringify(heads) + ')');
  const parts = H.parseBodySections(card);
  assert(parts.length === 2, 'parseBodySections agrees (2 sections, not 3 → no duplicate extra-section rewrite)');
}

console.log('\n-- L9: a plan queue left by a PREVIOUS process is discarded on resume --');
{
  await call('vibe_math_new_project', { name: 'planstale' });
  const proj = join(WS, 'VibeMath', 'Projects', 'planstale');
  await call('vibe_math_pause', {});
  mkdirSync(join(proj, 'State'), { recursive: true });
  writeFileSync(join(proj, 'State', 'plans.json'), JSON.stringify({ queued: [{ action: 'dispatch', role: 'solver', target: 'gone-object' }], epoch: 'previous-process' }), 'utf8');
  await call('vibe_math_resume', {});
  await sleep(300);
  await call('vibe_math_pause', {});
  const st = await call('vibe_math_status', {});
  assert(st.queuedPlanActions === 0, 'the stale queue is not replayed (queuedPlanActions=' + st.queuedPlanActions + ')');
  const acts = (st.recentActivity || []).map((a) => a.detail).join('\n');
  assert(/丢弃上一进程留下的 1 条计划动作/.test(acts), 'and the discard is announced (no silent loss)');
}

console.log('\n-- L2: a defect on an object that NEVER had an archived proof must not create one --');
{
  await call('vibe_math_new_project', { name: 'defectnopr' });
  const proj = join(WS, 'VibeMath', 'Projects', 'defectnopr');
  await call('vibe_math_set_params', { maxParallelThreshold: 8, verifierCount: 2, plannerEnabled: false, tickIntervalMs: 200, formalVerify: 'encourage' });
  await call('vibe_math_add_proposition', { id: 'pNever', 概述: '从未有过归档证明', 概率: 0.5, 分类: '分析' });
  await call('vibe_math_start', {});
  const before = spawns.length;
  await waitFor(() => spawns.slice(before).filter((s) => /^verifier:r-pNever:/.test(s.label)).length >= 2);
  const vers = spawns.slice(before).filter((s) => /^verifier:r-pNever:/.test(s.label));
  assert(vers.length >= 2, 'two reviewers spawned for the proposition');
  fireEnd({ id: vers[0].childId, runId: 'd1', provider: 'spawn', local: true, stopReason: 'completed', lastAssistantMessage: [{ type: 'text', text: '```json\n' + JSON.stringify({ Result: 0.3, Reason: '忠实性有问题', formal: { target: 'pNever', decision: 'defect', note: '定义与命题原文不一致' } }) + '\n```' }] });
  const rec = await waitFor(() => { const r = JSON.parse(read(join(proj, 'State', 'formal.json')) || '{}').records || {}; return r.pNever && r.pNever.decision === 'defect' });
  assert(rec, 'the defect is recorded for the object');
  await sleep(200);
  await call('vibe_math_pause', {});
  assert(!existsSync(join(proj, 'Verified', 'Lean', 'pNever.lean')), '★ no Verified/Lean/pNever.lean was fabricated for an object that never had a proof');
  const ann = read(join(proj, 'Logs', '形式化.md'));
  assert(/此前没有任何归档证明，无需撤回/.test(ann), 'the announcement says there was nothing to withdraw (got ' + JSON.stringify(ann.slice(-160)) + ')');
}

// ================================================================ final paper (spec §6, v3)
const PAPER_REPLY = {
  title: '假论文｜收敛后的整理',
  abstract: '原问题是「假问题」；主要结论是假定理成立。',
  sections: [
    { name: '引言与问题背景', body: '背景：变量 a_b 与占比 50%，以及行内数学 $x^2+y^2$。' },
    { name: '原问题的完整解法', body: '解法步骤：\n- 第一步\n- 第二步' },
    { name: '已检验通过的命题', body: '命题 pClosed 的布尔估计为 1（经 ≥2 名验证者定论）。' },
    { name: '已解决的子问题与中间成果', body: '子问题 qSub 已解决。' },
    { name: '创造或发现的有价值之物', body: '方法 m1（可复用）。' },
    { name: '规律总结', body: '规律：先化简再归纳。' },
    { name: '讨论、局限与展望', body: '局限：pOpen 仍为 0.5（未定论），不得当成已成立。' },
  ],
}
const paperSpawns = (id) => spawns.filter((s) => s.label.startsWith('paper-writer:' + (id === undefined ? '' : id)))
const firePaper = (id, reply) => {
  const w = paperSpawns(id); const last = w[w.length - 1]
  if (!last) return false
  fireEnd({ id: last.childId, runId: 'pw-' + last.childId, provider: 'spawn', local: true, stopReason: 'completed', lastAssistantMessage: [{ type: 'text', text: '```json\n' + JSON.stringify(reply || PAPER_REPLY) + '\n```' }] })
  return true
}
const asyncFind = async (pred, tries = 60, ms = 150) => { for (let i = 0; i < tries; i++) { const v = await pred(); if (v) return v; await sleep(ms) } return undefined }

console.log('\n-- PAPER §6.1 (v3): params — defaults, schema, coercion, both registration tables --')
{
  await call('vibe_math_new_project', { name: 'pparams' })
  const setup = await call('vibe_math_setup', {})
  const by = {}; for (const p of setup.parameters) by[p.name] = p
  for (const k of ['finalPaper', 'paperFormat', 'paperLanguage', 'paperCompilePdf', 'paperLatexCommand']) assert(!!by[k], 'v3 setup schema exposes ' + k)
  assert(by.finalPaper.default === true && by.paperFormat.default === 'both' && by.paperLanguage.default === 'zh' && by.paperCompilePdf.default === true && by.paperLatexCommand.default === '', 'v3 paper defaults are true/both/zh/true/""')
  assert(JSON.stringify(by.paperFormat.options) === JSON.stringify(['both', 'md', 'tex']) && JSON.stringify(by.paperLanguage.options) === JSON.stringify(['zh', 'en']), 'v3 enums are documented in the schema/help text')
  const bad = await call('vibe_math_set_params', { paperFormat: 'weird', paperLanguage: 'xx', finalPaper: 'false', paperCompilePdf: 'no', paperLatexCommand: '  ' })
  assert(bad.params.paperFormat === 'both' && bad.params.paperLanguage === 'zh', 'v3 illegal enum values fall back to the defaults')
  assert(bad.params.finalPaper === true && bad.params.paperCompilePdf === true, '★★ v3: a string "false"/"no" is NOT accepted as a boolean (spec v2 §B)')
  const good = await call('vibe_math_set_params', { paperFormat: 'md', paperLanguage: 'en', finalPaper: false, paperCompilePdf: false, paperLatexCommand: 'xelatex' })
  assert(good.params.paperFormat === 'md' && good.params.paperLanguage === 'en' && good.params.finalPaper === false && good.params.paperCompilePdf === false && good.params.paperLatexCommand === 'xelatex', 'v3 legal values are accepted verbatim')
  const regs = toolRegs.filter((s) => s.name === 'vibe_math_set_params')
  assert(regs.length === 1 && ['finalPaper', 'paperFormat', 'paperLanguage', 'paperCompilePdf', 'paperLatexCommand'].every((k) => !!regs[0].parameters.properties[k]), 'the registered v3 tool schema carries all five paper keys')
  const src = readFileSync(new URL('../vibe-math-v3/vibe-math-v3.js', import.meta.url), 'utf8')
  assert((src.match(/paperCompilePdf: \{ type: 'boolean' \}/g) || []).length === 2, '★★ BOTH v3 set_params tables were updated (spec v2 §B)')
  assert(/paper \[lang=zh\|en\] \[format=both\|md\|tex\] \[force\]/.test(src), 'the /vibe hint and usage advertise `paper`')
}

console.log('\n-- PAPER §6.2/§6.3 (v3): closure trigger (leftoverVerify), idempotence, content --')
{
  latexCfg = { engines: ['xelatex'] }
  await call('vibe_math_new_project', { name: 'ppaper' })
  await call('vibe_math_set_params', { tickIntervalMs: 200, plannerEnabled: false, finalPaper: true, paperFormat: 'both', paperCompilePdf: true })
  await call('vibe_math_add_problem', { id: 'qOpen', description: '未解决问题', priority: 0 })
  await call('vibe_math_add_proposition', { id: 'pOpen', 概述: '仍未定论', 概率: 0.5, 分类: '分析', '价值/关键性': 0.3 })
  await call('vibe_math_start', {})
  await sleep(900)
  assert(paperSpawns('ppaper').length === 0, '★ v3 NOT converged (unsolved problem + verify candidate) → no paper writer')
  await call('vibe_math_pause', {})
  // 停靠到"真实可收口"的状态：问题 已解决/never；命题 优先级=never（未定论但不再是验证候选）。
  // 这正是 v3 的真实完整性判据 leftoverVerify 为空（§A4）。
  const qf = join(projDir('ppaper'), 'Problems', 'qOpen.md')
  writeFileSync(qf, read(qf).replace('- 状态: 求解中', '- 状态: 已解决').replace(/- 优先级: \d+/, '- 优先级: never'), 'utf8')
  const pf = join(projDir('ppaper'), 'Propos', '分析', 'pOpen.md')
  writeFileSync(pf, read(pf).replace(/- 优先级: \d+/, '- 优先级: never'), 'utf8')
  await call('vibe_math_abort', {})
  await call('vibe_math_index', {})
  await call('vibe_math_start', {})
  const w = await asyncFind(() => (paperSpawns('ppaper').length ? paperSpawns('ppaper') : undefined), 60)
  assert(!!w && w.length === 1, '★ v3 closure (leftoverVerify empty + no agents/tasks/plans) dispatched exactly one paper writer')
  const prompt = (w && w[0].request && w[0].request.prompt[0].text) || ''
  assert(prompt.indexOf('DEDICATED PAPER WRITER') !== -1, 'the writer prompt is the single-author paper contract')
  for (const s of H.PAPER_SKELETON) assert(prompt.indexOf(s.key) !== -1, 'v3 prompt carries skeleton section: ' + s.key)
  assert(/\[STILL UNVERIFIED/.test(prompt) && /\[UNRESOLVED \/ REFUTED/.test(prompt) && /pOpen/.test(prompt), '★★ the prompt marks the undecided item explicitly (spec v2 §A4)')
  assert(/NEVER invent content/.test(prompt), 'the prompt forbids inventing content')
  const st = await call('vibe_math_status', {})
  assert(!!st.paper && st.paper.inFlight === (w && w[0].childId), 'status reports the in-flight paper writer')
  firePaper('ppaper')
  const meta = await asyncFind(() => readMeta('ppaper', 'ppaper'), 60)
  assert(!!meta && meta.trigger === 'auto' && Number(meta.runStartedAt) > 0, 'v3 meta records the auto trigger + run id')
  const md = read(join(pdir('ppaper', 'ppaper'), 'paper.md'))
  const tex = read(join(pdir('ppaper', 'ppaper'), 'paper.tex'))
  assert((md.match(/^## /gm) || []).length === 9, '★ v3 md carries exactly the 9-section skeleton')
  for (const s of H.PAPER_SKELETON) assert(md.indexOf('## ' + s.key) !== -1, 'v3 md section present: ' + s.key)
  assert(md.indexOf('### 证据与文件索引') !== -1 && md.indexOf('`Problems/qOpen.md`') !== -1 && md.indexOf('`Propos/分析/pOpen.md`') !== -1, '★ v3 appendix carries the evidence index built from the real md cards')
  assert(md.indexOf('未定论') !== -1, 'the unresolved item is labelled in the paper')
  assert((tex.match(/\\section\{/g) || []).length === 9, '★ v3 tex carries the same 9 sections')
  assert(tex.indexOf('\\documentclass[11pt]{ctexart}') !== -1, 'v3 zh uses ctexart')
  assert(tex.indexOf('a\\_b') !== -1 && tex.indexOf('50\\%') !== -1 && tex.indexOf('a_b') === -1 && tex.indexOf('50%') === -1, '★★ v3 tex escaping covers _ and %')
  assert(tex.indexOf('$x^2+y^2$') !== -1, 'v3 inline math is passed through')
  assert(meta.artifacts.md === true && meta.artifacts.tex === true && meta.artifacts.pdf === true && meta.compile === 'ok', '★ v3 fake compiler produced the pdf (compile=' + meta.compile + ')')
  const log = read(join(pdir('ppaper', 'ppaper'), 'paper.log.md'))
  assert(/\[dispatch\]/.test(log) && /\[finalize\]/.test(log) && /\[compile\]/.test(log), 'v3 paper.log.md carries the fixed single-author log format')
  // 幂等（同一 run）+ 缺失产物补写 + force
  const again = JSON.parse((await cmd('paper')).text)
  assert(again.skipped === true && again.reason === 'already-finalized-this-run', '★ v3 repeat trigger in the same run is idempotent')
  assert(paperSpawns('ppaper').length === 1, '★★ v3 idempotent path did NOT dispatch a second writer')
  rmSync(join(pdir('ppaper', 'ppaper'), 'paper.tex'), { force: true })
  const filled = JSON.parse((await cmd('paper')).text)
  assert(filled.skipped === true && filled.reason === 'filled-missing-artifacts' && filled.filled.indexOf('paper.tex') !== -1, '★ v3 re-derives a missing artifact from the finalized content (no new writer)')
  assert(existsSync(join(pdir('ppaper', 'ppaper'), 'paper.tex')) && paperSpawns('ppaper').length === 1, 'v3 tex is back and still no second writer')
  const beforeForce = meta.finalizedAt
  const forced = JSON.parse((await cmd('paper force')).text)
  assert(forced.dispatched === true && paperSpawns('ppaper').length === 2, '★ v3 /vibe paper force re-dispatches')
  firePaper('ppaper')
  await asyncFind(() => { const m = readMeta('ppaper', 'ppaper'); return m && m.finalizedAt !== beforeForce ? m : undefined }, 40)
}

console.log('\n-- PAPER §6.2b (v3): finalPaper=false → the AUTO trigger does not fire --')
{
  latexCfg = null
  await call('vibe_math_new_project', { name: 'pautooff' })
  await call('vibe_math_set_params', { tickIntervalMs: 200, plannerEnabled: false, finalPaper: false })
  await call('vibe_math_start', {})   // 空项目 ⇒ 立刻收口
  await sleep(1400)
  assert(paperSpawns('pautooff').length === 0, '★★ v3 finalPaper=false → closure does NOT dispatch a paper writer')
  const st = await call('vibe_math_status', {})
  assert(!!st.paper && st.paper.autoFinalPaper === false, 'v3 status reports the automatic paper trigger as disabled')
  const man = JSON.parse((await cmd('paper')).text)
  assert(man.dispatched === true && man.autoDisabled === true, 'v3 manual command still works and says the automatic trigger is off')
}

console.log('\n-- PAPER §6.4 (v3): compile branches (ok / repaired / failed / no LaTeX) --')
{
  // (a) 成功
  latexCfg = { engines: ['xelatex'] }; latexRuns.length = 0
  await call('vibe_math_new_project', { name: 'pc1' })
  await cmd('paper'); firePaper('pc1')
  let m = await asyncFind(() => readMeta('pc1', 'pc1'), 60)
  assert(!!m && m.compile === 'ok' && m.artifacts.pdf === true, '★ v3 (a) success → pdf generated, compile=ok')
  // (b) 换引擎修复
  latexCfg = { engines: ['xelatex', 'latexmk'], failFirst: true }; latexRuns.length = 0
  await call('vibe_math_new_project', { name: 'pc2' })
  await cmd('paper'); firePaper('pc2')
  m = await asyncFind(() => readMeta('pc2', 'pc2'), 60)
  assert(!!m && m.compile === 'repaired' && m.compileEngine === 'latexmk' && m.compileAttempts[0].ok === false && m.compileAttempts[1].ok === true, '★ v3 (b) engine swap repaired the compile (' + (m && m.compile) + '/' + (m && m.compileEngine) + ')')
  // (c) 持续失败 → 降级
  latexCfg = { engines: ['xelatex', 'latexmk'], alwaysFail: true }; latexRuns.length = 0
  await call('vibe_math_new_project', { name: 'pc3' })
  await cmd('paper'); firePaper('pc3')
  m = await asyncFind(() => readMeta('pc3', 'pc3'), 60)
  assert(!!m && m.compile === 'failed' && m.artifacts.pdf === false && m.artifacts.md === true && m.artifacts.tex === true, '★ v3 (c) persistent failure → degrade to tex+md, compile=failed')
  assert(!existsSync(join(pdir('pc3', 'pc3'), 'paper.pdf')), 'v3 (c) no pdf was faked')
  const acts = (await call('vibe_math_status', {})).recentActivity.map((a) => a.detail).join('\n')
  assert(/编译失败/.test(acts), '★ v3 (c) the failure is reported on the activity log')
  // (d) 真机无 LaTeX（本机形态）→ 干净降级
  latexCfg = null
  await call('vibe_math_new_project', { name: 'pc4' })
  await cmd('paper'); firePaper('pc4')
  m = await asyncFind(() => readMeta('pc4', 'pc4'), 60)
  assert(!!m && m.compile === 'not-detected' && m.artifacts.tex === true && m.artifacts.md === true && m.artifacts.pdf === false, '★ v3 (d) no LaTeX → compile=not-detected with tex+md only')
  assert(read(join(pdir('pc4', 'pc4'), 'paper.log.md')).indexOf('未检测到任何 LaTeX 引擎') !== -1, 'v3 (d) the log records why no pdf was produced')
  // (e) resolver 在但一个引擎都解析不到
  latexCfg = { mode: 'resolver-empty' }
  await call('vibe_math_new_project', { name: 'pc5' })
  await cmd('paper'); firePaper('pc5')
  m = await asyncFind(() => readMeta('pc5', 'pc5'), 60)
  assert(!!m && m.compile === 'not-detected', '★ v3 (e) an empty resolver also degrades to not-detected')
  latexCfg = null
}

console.log('\n-- PAPER §6.5/§6.6 (v3): paths/id confinement, command surface, activation limit --')
{
  for (const raw of ['../../etc/passwd', 'a/b', '..', 'C:\\x\\y']) {
    const id = H.paperDirId(raw)
    assert(id.indexOf('/') === -1 && id.indexOf('\\') === -1 && id.indexOf('..') === -1, 'v3 paperDirId(' + JSON.stringify(raw) + ') is one safe segment (' + JSON.stringify(id) + ')')
  }
  latexCfg = { engines: ['xelatex'] }
  await call('vibe_math_new_project', { name: 'pcmd' })
  await call('vibe_math_set_params', { finalPaper: false })
  const r = JSON.parse((await cmd('paper')).text)
  assert(r.ok === true && r.dispatched === true && r.autoDisabled === true && /自动触发已关闭/.test(r.message), '★ v3 /vibe paper works with finalPaper=false and says the auto trigger is off')
  firePaper('pcmd')
  const meta = await asyncFind(() => readMeta('pcmd', 'pcmd'), 60)
  assert(!!meta && meta.dir === 'Paper/pcmd' && meta.trigger === 'manual', 'v3 manual run recorded under Paper/<id>/ with trigger=manual')
  const files = readdirSync(pdir('pcmd', 'pcmd')).sort()
  assert(files.every((f) => ['paper.md', 'paper.tex', 'paper.pdf', 'paper.meta.json', 'paper.log.md', 'paper.lock.json'].indexOf(f) !== -1), '★ v3 only paper artifacts live in Paper/<id>/ (got ' + JSON.stringify(files) + ')')
  assert(!existsSync(join(projDir('pcmd'), 'Space')) && !existsSync(join(WS, 'etc')) && !existsSync(join(WS, 'y')), 'v3 no file was written outside the project tree')
  const bl = await cmd('paper lang=xx'); const bf = await cmd('paper format=nope'); const bo = await cmd('paper what=1')
  assert(bl.kind === 'error' && bf.kind === 'error' && bo.kind === 'error', '★ v3 illegal/unknown paper options return kind:error')
  const beforeMd = readMeta('pcmd', 'pcmd').finalizedAt
  const mdRun = JSON.parse((await cmd('paper lang=en format=md force')).text)
  assert(mdRun.dispatched === true, 'v3 lang=/format= override dispatches')
  firePaper('pcmd')
  const m2 = await asyncFind(() => { const m = readMeta('pcmd', 'pcmd'); return m && m.finalizedAt !== beforeMd ? m : undefined }, 40)
  assert(!!m2 && m2.params.paperFormat === 'md' && m2.params.paperLanguage === 'en' && m2.compile === 'skipped', '★★ v3 paperFormat=md records the override and skips compilation entirely (§E)')
  // 激活上限：排队 + 心跳重试 + 可见告警
  latexCfg = null
  await call('vibe_math_new_project', { name: 'pqueue' })
  refuseNext = 1
  const q = JSON.parse((await cmd('paper')).text)
  assert(q.ok === true && q.queued === true && q.reason === 'activation-limit-reached' && q.tries === 1 && q.limit === 2, '★ v3 activation-limit refusal is QUEUED with the host limit recorded')
  const stq = await call('vibe_math_status', {})
  assert(!!stq.paper && !!stq.paper.queued && stq.paper.queued.tries === 1, 'v3 status exposes the queued retry')
  assert(/激活上限/.test((await call('vibe_math_status', {})).recentActivity.map((a) => a.detail).join('\n')), '★★ v3 queueing is visible on the activity log')
  const retried = await asyncFind(() => (paperSpawns().some((s) => s.label === 'paper-writer:pqueue') ? true : undefined), 80, 200)
  assert(!!retried, '★★ v3 the paper heartbeat retried after the refusal (independent of scheduler.running)')
  firePaper('pqueue')
  const mq = await asyncFind(() => readMeta('pqueue', 'pqueue'), 60)
  assert(!!mq, 'v3 the retried writer still finalized the paper')
}

console.log(`\n=== V3 FIX PROBE RESULT: ${passed} passed, ${failed} failed ===`);
rmSync(WS, { recursive: true, force: true });
process.exit(failed === 0 ? 0 : 1);

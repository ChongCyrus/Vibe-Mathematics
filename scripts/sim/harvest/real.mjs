/**
 * R240-A · REAL-MACHINE RECEIPT HARVESTER
 *
 * Why this file exists: the simulation corpus has `receipts.jsonl`, but the REAL runs (the slv-phase5
 * workspaces on this box) had no normalized receipt corpus, so "sim and real agree" could only be asserted,
 * never measured. This script reads the DSH session journals the real runs already wrote and produces the
 * same-shaped rows, plus the per-tool fieldset the parity gate can read directly.
 *
 * INPUT (read-only): `<home>/.dsh/sessions/--D-_tmp-slv-phase5-<ws>--/<sessionId>/session.v4.jsonl.zstd`
 *   Each file is a CONCATENATION of zstd frames (one frame per JSON line). A single
 *   `zlib.zstdDecompressSync(file)` silently returns only the FIRST frame, so the frames are split on the
 *   zstd magic number and decompressed one by one. Event shapes (measured, not guessed):
 *     {"type":"tool/call","seq":N,"time":ms,"data":{"turn","step","callId","name","arguments"}}
 *     {"type":"tool/result","seq":N,"time":ms,"data":{"turn","step","message":{"role":"tool","content":[{"type":"text","text":"<JSON string>"}]}}}
 *   The result text is the tool's returned JSON (a string), which is exactly the receipt.
 *
 * OUTPUT (owned paths only):
 *   D:/_tmp/sim/real-receipts.jsonl   one row per vibe_* tool result
 *   D:/_tmp/sim/other-tools.jsonl     one row per non-vibe tool result (so a bypass is visible, not hidden)
 *   D:/_tmp/sim/real-stats.md         counts / refusal codes / key unions / drift / blind spots
 *   D:/_tmp/sim/real-fieldset.json    {tool: {keys: [...]}} for the Lead's parity gate
 *
 * Read-only with respect to the repo and the real workspaces. Does not commit anything.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { pathToFileURL } from 'node:url';

const REPO = 'D:/wd/vibemath开发/Vibe-Mathematics/vibe-math-vmu';
const WS_ROOT = process.env.VMU_REAL_WS_ROOT || 'D:/_tmp/slv-phase5';
const SESSIONS_ROOT = process.env.VMU_SESSIONS_ROOT || path.join(os.homedir(), '.dsh', 'sessions');
const OUT_DIR = process.env.VMU_REAL_OUT || 'D:/_tmp/sim';
const ZSTD_MAGIC = Buffer.from([0x28, 0xb5, 0x2f, 0xfd]);

/** The harness names a workspace's session folder after its absolute path: ':' is dropped, '\' and '/' become '-'. */
function encodeWorkspace(abs) {
  return '--' + abs.replace(/:/g, '').replace(/[\\/]/g, '-') + '--';
}

function sessionsOfWorkspace(abs) {
  const dir = path.join(SESSIONS_ROOT, encodeWorkspace(abs));
  return fs.existsSync(dir) ? dir : null;
}

/** Split a concatenated-frame zstd file and return the decoded text lines of every frame. */
function readSessionLines(file) {
  const buf = fs.readFileSync(file);
  const offsets = [];
  let pos = 0;
  while ((pos = buf.indexOf(ZSTD_MAGIC, pos)) >= 0) { offsets.push(pos); pos += 4; }
  const out = [];
  for (let i = 0; i < offsets.length; i++) {
    const end = i + 1 < offsets.length ? offsets[i + 1] : buf.length;
    let text;
    try { text = zlib.zstdDecompressSync(buf.subarray(offsets[i], end)).toString('utf8'); }
    catch (e) { out.push({ badFrame: e.message }); continue; }
    for (const ln of text.split('\n')) if (ln.trim()) out.push(ln);
  }
  return out;
}

/** Text of a tool/result event, whatever content-part shape the writer used. */
function resultText(ev) {
  const content = (ev && ev.data && ev.data.message && ev.data.message.content) || [];
  if (!Array.isArray(content)) return null;
  const parts = content.filter((c) => c && c.type === 'text' && typeof c.text === 'string').map((c) => c.text);
  if (parts.length === content.length && parts.length > 0) return parts.join('');
  return JSON.stringify(content);
}

function jsonOf(text) {
  if (typeof text !== 'string') return { parsed: null, parseFailed: true };
  try { return { parsed: JSON.parse(text), parseFailed: false }; }
  catch { return { parsed: null, parseFailed: true }; }
}

function codeOf(parsed) {
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
  const c = parsed.code
    || (parsed.error && (parsed.error.code || parsed.error))
    || (parsed.failure && parsed.failure.code)
    || null;
  return typeof c === 'string' ? c : null;
}

function okOf(parsed) {
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
  if (typeof parsed.ok === 'boolean') return parsed.ok;
  if (parsed.error || parsed.failure) return false;
  return null;
}

function keysOf(parsed) {
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return [];
  return Object.keys(parsed).sort();
}

/** The repo's REGISTERED tool names for this deployment (host kernel faces + v5r pack faces; the kit faces are a subset). */
async function repoToolNames() {
  const names = new Set();
  const detail = { host: [], pack: [], kit: [], errors: [] };
  try {
    const host = await import(pathToFileURL(REPO + '/host.js').href);
    for (const n of Object.values(host.TOOL_NAMES || {})) if (typeof n === 'string') { names.add(n); detail.host.push(n); }
  } catch (e) { detail.errors.push('host.js: ' + e.code + ' ' + e.message); }
  try {
    const pack = await import(pathToFileURL(REPO + '/packs/v5r/tools.js').href);
    for (const t of pack.V5R_PACK_TOOLS || []) if (t && typeof t.name === 'string') { names.add(t.name); detail.pack.push(t.name); }
    for (const t of pack.V5R_NEXT_BATCH_TOOLS || []) if (t && typeof t.name === 'string') names.add(t.name);
  } catch (e) { detail.errors.push('packs/v5r/tools.js: ' + e.code + ' ' + e.message); }
  try {
    const kit = await import(pathToFileURL(REPO + '/kit/tools.js').href);
    for (const t of kit.KIT_TOOLS || []) if (t && typeof t.name === 'string') { detail.kit.push(t.name); if (!names.has(t.name)) names.add(t.name); }
  } catch (e) { detail.errors.push('kit/tools.js: ' + e.code + ' ' + e.message); }
  return { names, detail };
}

/** Every `name: 'vibe_...'` literal anywhere under vibe-math-vmu (other packs included) — used only to say WHY a name is unregistered. */
function repoDefinedNames() {
  const found = new Set();
  const walk = (dir) => {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, ent.name);
      if (ent.isDirectory()) { if (ent.name !== 'node_modules') walk(p); continue; }
      if (!ent.name.endsWith('.js') && !ent.name.endsWith('.mjs')) continue;
      const txt = fs.readFileSync(p, 'utf8');
      for (const m of txt.matchAll(/name:\s*['"](vibe_[a-z0-9_]+)['"]/g)) found.add(m[1]);
    }
  };
  walk(REPO);
  return found;
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const { names: repoNamed, detail } = await repoToolNames();
  const repoDefined = repoDefinedNames();

  const workspaces = fs.readdirSync(WS_ROOT, { withFileTypes: true })
    .filter((e) => e.isDirectory() && e.name.endsWith('-ws'))
    .map((e) => path.join(WS_ROOT, e.name))
    .sort();

  const receiptRows = [];
  const otherRows = [];
  const workspacesOnDisk = workspaces.length;
  const callsByTool = new Map();
  const receiptsByTool = new Map();
  const codesByTool = new Map();
  const keysByTool = new Map();
  const failedByTool = new Map();
  const truncatedByTool = new Map();
  const unknownToolByTool = new Map();
  const seenWorkspaces = new Set();
  let sessionFiles = 0, events = 0, results = 0, orphanResults = 0, badFrames = 0, parseFailed = 0;

  const bump = (map, key, n = 1) => map.set(key, (map.get(key) || 0) + n);

  for (const ws of workspaces) {
    const sessDir = sessionsOfWorkspace(ws);
    if (!sessDir) continue;
    const run = path.basename(ws);
    for (const sd of fs.readdirSync(sessDir, { withFileTypes: true })) {
      if (!sd.isDirectory()) continue;
      const file = path.join(sessDir, sd.name, 'session.v4.jsonl.zstd');
      if (!fs.existsSync(file)) continue;
      sessionFiles++;
      seenWorkspaces.add(run);
      const eventsOf = [];
      for (const item of readSessionLines(file)) {
        if (typeof item !== 'string') { badFrames++; continue; }
        let ev; try { ev = JSON.parse(item); } catch { badFrames++; continue; }
        eventsOf.push(ev); events++;
      }
      const calls = new Map();
      for (const ev of eventsOf) {
        if (ev.type !== 'tool/call') continue;
        const d = ev.data || {};
        if (!d.callId || !d.name) continue;
        calls.set(d.callId, d.name);
        bump(callsByTool, d.name);
      }
      for (const ev of eventsOf) {
        if (ev.type !== 'tool/result') continue;
        results++;
        const d = ev.data || {};
        const callId = d.toolCallId || (d.message && d.message.toolCallId);
        const tool = callId ? calls.get(callId) : null;
        const text = resultText(ev);
        const { parsed, parseFailed: failed } = jsonOf(text);
        if (!tool) { orphanResults++; continue; }
        const row = {
          run,
          sessionId: sd.name,
          tool,
          ok: okOf(parsed),
          code: codeOf(parsed),
          keys: keysOf(parsed),
          bytes: typeof text === 'string' ? Buffer.byteLength(text, 'utf8') : 0,
          msgHead: typeof text === 'string' ? text.slice(0, 120) : '',
        };
        if (failed) { row.parseFailed = true; parseFailed++; bump(failedByTool, tool); }
        // A result that STARTS like a JSON object but does not parse is a receipt the harness cut short (the observed
        // status results stop at ~50 KB). Its field set is a lower bound, so count it separately instead of hiding it.
        if (failed && typeof text === 'string' && text.trimStart().startsWith('{')) bump(truncatedByTool, tool);
        // The harness itself rejects a name that is not registered: the result text is `Error: unknown tool "<name>"`,
        // not a receipt. Recorded honestly (parseFailed), and counted here because it means the MODEL invented a name.
        if (typeof text === 'string' && /^Error: unknown tool /.test(text)) bump(unknownToolByTool, tool);
        if (tool.startsWith('vibe_')) {
          receiptRows.push(row);
          bump(receiptsByTool, tool);
          if (row.code) bump(codesByTool, tool + '\u0000' + row.code);
          let kset = keysByTool.get(tool);
          if (!kset) { kset = new Set(); keysByTool.set(tool, kset); }
          for (const k of row.keys) kset.add(k);
        } else {
          otherRows.push(row);
        }
      }
    }
  }

  const sortObj = (map) => [...map.entries()].sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])));
  const jsonl = (rows) => rows.map((r) => JSON.stringify(r)).join('\n') + (rows.length ? '\n' : '');
  fs.writeFileSync(path.join(OUT_DIR, 'real-receipts.jsonl'), jsonl(receiptRows));
  fs.writeFileSync(path.join(OUT_DIR, 'other-tools.jsonl'), jsonl(otherRows));

  // Only tools that actually produced at least one parsable receipt contribute a shape. A name the harness rejected
  // with `Error: unknown tool` has no receipt shape, so pretending it has one would be an invented field set.
  const fieldset = {};
  for (const tool of [...keysByTool.keys()].sort()) {
    const keys = [...keysByTool.get(tool)].sort();
    if (keys.length > 0) fieldset[tool] = { keys };
  }
  fs.writeFileSync(path.join(OUT_DIR, 'real-fieldset.json'), JSON.stringify(fieldset, null, 2) + '\n');

  const realVibeNames = new Set([...receiptsByTool.keys(), ...callsByTool.keys()].filter((n) => n.startsWith('vibe_')));
  const drift = [...realVibeNames].filter((n) => !repoNamed.has(n)).sort();
  const blind = [...repoNamed].filter((n) => !realVibeNames.has(n)).sort();
  const unregisteredButRepoDefined = drift.filter((n) => repoDefined.has(n));

  const lines = [];
  lines.push('# R240-A 真机回执底稿（real receipt harvest）');
  lines.push('');
  lines.push('> 来源：`' + SESSIONS_ROOT + '` 下 `' + WS_ROOT + '` 各工作区的 DSH 会话日志（只读）。');
  lines.push('> 采集器：`scripts/sim/harvest/real.mjs`（会话文件是「一帧一行」的 zstd 拼接，必须逐帧解压）。');
  lines.push('');
  lines.push('## 0. 规模');
  lines.push('');
  lines.push('| 项 | 值 |');
  lines.push('| --- | --- |');
  lines.push('| 磁盘上的工作区（`' + WS_ROOT + '/*-ws`） | ' + workspacesOnDisk + ' |');
  lines.push('| 有会话目录的工作区 | ' + seenWorkspaces.size + ' |');
  lines.push('| 会话文件 | ' + sessionFiles + ' |');
  lines.push('| 事件 | ' + events + ' |');
  lines.push('| tool/result 事件 | ' + results + ' |');
  lines.push('| 其中 vibe_* 回执 | ' + receiptRows.length + ' |');
  lines.push('| 非 vibe 工具回执（other-tools.jsonl） | ' + otherRows.length + ' |');
  lines.push('| JSON 解析失败（照实记 parseFailed） | ' + parseFailed + ' |');
  lines.push('| 其中「工具名根本不存在」被 harness 拒（`Error: unknown tool`） | ' + [...unknownToolByTool.values()].reduce((a, b) => a + b, 0) + ' |');
  lines.push('| 无 callId 配对的 result | ' + orphanResults + ' |');
  lines.push('| 坏帧/坏行 | ' + badFrames + ' |');
  lines.push('');
  lines.push('## ① 每个工具的真实调用次数（tool/call 事件计）');
  lines.push('');
  lines.push('| 工具 | 调用 | 回执 | 其中非 JSON（parseFailed） | 其中似被 harness 截断 |');
  lines.push('| --- | --- | --- | --- | --- |');
  for (const [tool, n] of sortObj(callsByTool)) {
    lines.push('| `' + tool + '` | ' + n + ' | ' + (receiptsByTool.get(tool) || 0) + ' | ' + (failedByTool.get(tool) || 0) + ' | ' + (truncatedByTool.get(tool) || 0) + ' |');
  }
  lines.push('');
  lines.push('> `parseFailed` 的两种真实原因（都照实记，不补写）：① 文件/文本类工具（`read`/`write`/`glob`…）本来就回纯文本；');
  lines.push('> ② `vibe_vmu_status` 一类大回执被 harness 在 ~50 KB 处截断，`{` 开头但 JSON 不完整——这类工具在 ③ 的字段集只能算**下界**。');
  lines.push('');
  lines.push('## ② 每个工具出现过的拒绝码（结果 JSON 的 code/error.code；ok:false 且无码也会显示）');
  const byToolCodes = new Map();
  for (const [key, n] of sortObj(codesByTool)) {
    const [tool, code] = key.split('\u0000');
    if (!byToolCodes.has(tool)) byToolCodes.set(tool, []);
    byToolCodes.get(tool).push([code, n]);
  }
  if (byToolCodes.size === 0) lines.push('（真机语料里没有任何具名拒绝码）');
  for (const [tool, arr] of [...byToolCodes.entries()].sort()) {
    lines.push('- `' + tool + '`：' + arr.sort((a, b) => b[1] - a[1]).map(([c, n]) => '`' + c + '`×' + n).join('、'));
  }
  lines.push('');
  lines.push('## ③ 每个工具的顶层字段并集（真机实际看到的回执形状）');
  lines.push('');
  const union = new Set();
  for (const tool of Object.keys(fieldset)) for (const k of fieldset[tool].keys) union.add(k);
  lines.push('所有 vibe_* 工具的顶层字段并集（' + union.size + ' 个）：' + [...union].sort().map((k) => '`' + k + '`').join('、'));
  lines.push('');
  lines.push('| 工具 | 字段数 | 字段 |');
  lines.push('| --- | --- | --- |');
  for (const tool of Object.keys(fieldset)) {
    lines.push('| `' + tool + '` | ' + fieldset[tool].keys.length + ' | ' + fieldset[tool].keys.map((k) => '`' + k + '`').join(' ') + ' |');
  }
  lines.push('');
  lines.push('## ④ 真机见过、但本部署注册的工具清单里没有（漂移）');
  lines.push('');
  lines.push('注册清单来源：`vibe-math-vmu/host.js` 的 `TOOL_NAMES`（' + detail.host.length + ' 个内核面）+ `packs/v5r/tools.js` 的 `V5R_PACK_TOOLS`（' + detail.pack.length + ' 个机构面，kit 的 ' + detail.kit.length + ' 个是其子集）。');
  lines.push('');
  if (drift.length === 0) lines.push('**空**——真机调用的每个 `vibe_*` 工具名都在注册清单里。');
  else {
    for (const n of drift) {
      const unknown = unknownToolByTool.get(n) || 0;
      const calls = callsByTool.get(n) || 0;
      const why = unknown > 0
        ? '（harness 直接回 `Error: unknown tool "' + n + '"`：模型调了一个不存在的名字，不是仓库漏注册的工具面）'
        : repoDefined.has(n)
          ? '（仓库别处定义过，但不在本部署注册清单）'
          : '（仓库里根本没有这个名字）';
      lines.push('- `' + n + '`：调用 ' + calls + '，unknown-tool 拒绝 ' + unknown + why);
    }
  }
  if (unregisteredButRepoDefined.length) lines.push('');
  if (unregisteredButRepoDefined.length) lines.push('说明：' + unregisteredButRepoDefined.map((n) => '`' + n + '`').join('、') + ' 在仓库源码里出现过（例如 v3 包的 `name:` 字面量），但不是 v5r 部署注册的工具。');
  if (detail.errors.length) { lines.push(''); lines.push('加载告警：' + detail.errors.join('；')); }
  lines.push('');
  lines.push('## ⑤ 仓库注册、真机一次都没调过（仿真要重点覆盖的盲区）');
  lines.push('');
  lines.push('共 ' + blind.length + ' 个（注册 ' + repoNamed.size + '，真机见过 ' + realVibeNames.size + '）：');
  lines.push('');
  lines.push(blind.map((n) => '`' + n + '`').join('、'));
  lines.push('');
  fs.writeFileSync(path.join(OUT_DIR, 'real-stats.md'), lines.join('\n'));

  console.log(JSON.stringify({
    workspacesOnDisk,
    workspacesWithSessions: seenWorkspaces.size,
    sessionFiles,
    events,
    results,
    receipts: receiptRows.length,
    otherTools: otherRows.length,
    parseFailed,
    orphanResults,
    badFrames,
    vibeTools: realVibeNames.size,
    repoRegistered: repoNamed.size,
    drift,
    blindCount: blind.length,
    out: OUT_DIR,
  }, null, 2));
}

main().catch((e) => { console.error('HARVEST-FAIL', e && e.stack || e); process.exit(1); });

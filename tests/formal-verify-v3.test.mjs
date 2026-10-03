// ============================================================
// V3 LEAN FORMAL VERIFICATION SUITE  (docs/formal-verification.md)
//
// Asserts the whole contract of the `formalVerify` knob on the v3 preset:
//   · 'off'       is a TRUE no-op (no Lean text in ANY prompt, no Formal record, no gate)
//   · 'encourage' injects the Lean section into the work prompts AND into both verification
//                 prompts, and — the actual point of the feature — turns the voting prompt into
//                 a FIDELITY review once a Lean run has passed
//   · 'require'   withholds a true/false verdict as 未定论 until the object is Lean-passed or
//                 carries an explicit, reasoned blocker record; then allows it, and the Verified
//                 card records how strong the result really is
//   · the three tools (run / archive / lib) write the right things to the right paths
//
// The Lean toolchain is mocked through the subprocess SERVICE, so the tests exercise the real
// code path (resolveExecutable → spawn → collected stdout → exit code) without requiring Lean.
//
// V3_PLUGIN overrides the plugin under test: a sensitivity probe MUST point this suite at a
// mutated copy, otherwise every probe would exercise the unmutated plugin and stay green.
//
// Run: node tests/formal-verify-v3.test.mjs
// ============================================================
import { mkdtempSync, rmSync, existsSync, readFileSync, readdirSync, mkdirSync, writeFileSync, renameSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname, isAbsolute, resolve as pathResolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

// Concurrency isolation: the shipped corpus is read by other probes (audit-prompt-invariants) while
// this suite runs under the gate, so the write must be atomic — a reader must never see a truncated file.
function writeFileAtomic(target, text) {
  const tmp = target + '.tmp-' + process.pid + '-' + Math.random().toString(36).slice(2, 8)
  writeFileSync(tmp, text, 'utf8')
  renameSync(tmp, target)
}


// V3_PLUGIN may be a REPO-RELATIVE path or an ABSOLUTE one (a mutant copy outside the repo, e.g. a
// temp dir). The previous `new URL('file:///' + path)` form only worked for drive-qualified Windows
// paths and made out-of-repo variants impossible; this is the same isAbsolute-aware resolution the
// `math-computation-v*` suites use. Default behaviour (env var unset) is unchanged.
const PLUGIN = process.env.V3_PLUGIN
  ? pathToFileURL(isAbsolute(process.env.V3_PLUGIN) ? process.env.V3_PLUGIN : join(dirname(fileURLToPath(import.meta.url)), '..', process.env.V3_PLUGIN))
  : new URL('../vibe-math-v3/vibe-math-v3.js', import.meta.url)
const HERE = dirname(fileURLToPath(import.meta.url))
// AUDIT-CHECKLIST §2.4: the suite must also keep the INTERACTION TEXT it drove, so a human can
// re-read the prompts the framework really emitted. V3_CORPUS_DIR overrides the destination.
const CORPUS_DIR = process.env.V3_CORPUS_DIR
  ? pathResolve(process.env.V3_CORPUS_DIR)
  // A MUTATED run (V3_PLUGIN set) must never rewrite the shipped corpus — same rule v2 and v4 already follow.
  : (process.env.V3_PLUGIN ? join(tmpdir(), 'vibe-v3-prompt-corpus') : join(HERE, '..', 'prompt-corpus-v3'))
const WS = mkdtempSync(join(tmpdir(), 'vibe-v3-lean-'))
const VIBE = join(WS, 'VibeMath')
const projRoot = (slug) => join(VIBE, 'Projects', slug)
const readIf = (p) => (existsSync(p) ? readFileSync(p, 'utf8') : '')
/** A missing directory lists as [] (a mutant cascade must surface as a NAMED red, not an ENOENT crash). */
const listDirIf = (p) => (existsSync(p) ? readdirSync(p) : [])
const reEsc = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const verifyRe = (target) => new RegExp('^verifier:r-' + reEsc(target) + '(?:-\\w+)?:\\d+$')

let passed = 0, failed = 0
const failures = []
const assert = (c, m) => { if (c) { passed++; console.log('  ok - ' + m) } else { failed++; failures.push(m); console.error('  FAIL - ' + m) } }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const section = (t) => console.log('\n[' + t + ']')

// ---------------------------------------------------------------
// mock host
// ---------------------------------------------------------------
const listeners = {}
const toolRegs = []
const cmdRegs = []
const spawns = []        // { label, childId, rootId, prompt }
const wakes = []         // { childId, rootId, prompt }
const interrupts = []
const leanRuns = []      // { argv, file, cwd, graceMs }
const terminated = []
const disposers = []
const roots = []
let rootSeq = 0
let subprocessAvailable = true
let toolchainAvailable = true
let spawnThrows = false
// Interaction corpus (AUDIT-CHECKLIST §2.4): every prompt the framework actually sent, with the
// workspace path normalised so the dump is deterministic and diffable.
const corpus = []
// Normalise BOTH slash forms. The VibeMath ROOT must be replaced BEFORE the workspace root,
// otherwise `<WS>/VibeMath` would survive as a half-substituted path: the corpus would still leak
// the machine layout and would not be diffable against another checkout.
//
// The PLANNER prompt embeds the raw state brief, whose volatile RUN METADATA would otherwise change
// on every run and make the corpus undiffable (contract §10 item 10 demands byte determinism; the
// same class of bug is recorded in AUDIT-CHECKLIST §2.4 as a real accident): the random plan id in
// the label, epoch-millisecond `at` timestamps, child ids, and the free-slot count. They are run
// metadata, not the text under review, so they are normalised to placeholders.
//
// The brief is not only run metadata, it is a LIVE SNAPSHOT of mutable scheduler state
// (`buildBrief()` reads `agentRegistry`, `activityLog`, the verify candidates and the free-slot
// count at the instant the planner is spawned). This suite drives the plugin from OUTSIDE, and the
// plugin's own scheduler keeps running concurrently: `vibe_math_start` fires `scheduleTick()`
// without awaiting it, and the plugin's 1s tick timer calls `scheduleTick()` on its own schedule, so
// a background tick can register the explorer (or append its activity event, or close a verify)
// BETWEEN the forced planner's snapshot and the next one. Two runs then legitimately disagree about
// `active_agents` (the explorer is in flight or it is not), about `recent_events` (the last-eight
// window and its order), and about every other instant-dependent field of the brief.
//
// A byte-stable corpus therefore cannot carry that snapshot's values — the disagreement is a
// property of the INSTANT, not of the prompt text a human must review (this is exactly the "语料
// 每次运行都变" accident §2.4 records). What the corpus carries is the brief's CONTRACT: the same
// keys in the same order, with the instant-dependent values canonically placeholdered and the
// stable configuration scalars kept. The prompt TEXT under review — the persona, the ACTION
// VOCABULARY, and the HARD RULES that name `brief.problems[].running_solver_dirs`,
// `brief.active_agents` and `brief.free_slots` — is untouched.
const SNAPSHOT_KEYS = ['problems', 'verify_candidates', 'active_agents', 'methods', 'pending_inventions', 'last_plan', 'recent_events']
/** Replace every instant-dependent collection of the planner's state brief with a canonical
 *  placeholder, keeping the key set, the key order and the configuration scalars. Only called on a
 *  valid-JSON brief (`buildBrief` is serialised with JSON.stringify(brief, null, 2)); anything that
 *  does not match the exact planner framing is returned unchanged, so the suite can never silently
 *  mangle an unrelated prompt. */
const canonBrief = (s) => {
  const m = s.match(/(CURRENT STATE BRIEF \(JSON\):\n)(\{[\s\S]*?\n\})(\n\nACTION VOCABULARY)/)
  if (!m) return s
  let brief
  try { brief = JSON.parse(m[2]) } catch (e) { return s }
  for (const k of SNAPSHOT_KEYS) if (Object.prototype.hasOwnProperty.call(brief, k)) brief[k] = '<' + k.toUpperCase() + '>'
  return s.slice(0, m.index) + m[1] + JSON.stringify(brief, null, 2) + m[3] + s.slice(m.index + m[0].length)
}
const scrub = (s) => canonBrief(String(s == null ? '' : s)
  .split(VIBE).join('<VIBEMATH>')
  .split(VIBE.replace(/\\/g, '/')).join('<VIBEMATH>')
  .split(WS).join('<WS>')
  .split(WS.replace(/\\/g, '/')).join('<WS>'))
  .replace(/plan-[0-9a-f]{8}/g, 'plan-<ID>')
  .replace(/("at"\s*:\s*)\d{10,16}/g, '$1"<TIME>"')
  .replace(/("childId"\s*:\s*")c\d+(")/g, '$1<CHILD>$2')
  .replace(/("free_slots"\s*:\s*)\d+/g, '$1<SLOTS>')
  // Epoch-ms in a verification-log FILE NAME (`Logs/Verification/<rId>_<Date.now()>.json`) is run
  // metadata too: the final-paper material embeds the evidence index verbatim, so without this the
  // shipped corpus changed on every run (contract §10 item 10 demands byte determinism).
      // 为什么必须保留可选短 id 组（不要"简化"掉）：P7 把裁决日志名改成了
      // `<rId>_<epochMs>_<shortId>.json`，旧的 `_[0-9]{10,16}\.json` 因此不再匹配，
      // 于是每次跑动都把自己那次的 时间戳+shortId 写进 shipped 语料（语料非确定性）。
      // 去掉 `(_[0-9a-f]{8})?` 这个组会静默地重新引入"每次跑都不同"的语料。
  .replace(/_[0-9]{10,16}(_[0-9a-f]{8})?\.json/g, '_<TIME>.json')

// A fake Lean: a file PASSES unless it still contains `sorry` or the marker `-- FAIL`.
// `-- HANG` simulates a toolchain that never returns (the timeout path).
const subprocess = {
  async resolveExecutable(cmd) {
    if (!toolchainAvailable) throw new Error('spawn ' + cmd + ' ENOENT')
    if (String(cmd) !== 'lean' && String(cmd) !== 'lake') throw new Error('unknown executable ' + cmd)
    return String(cmd)
  },
  spawn(spec) {
    const argv = spec.argv || []
    const last = String(argv[argv.length - 1] || '')
    const isShell = /powershell|cmd\.exe|\/bin\/sh|(^|\/)sh$/i.test(String(argv[0] || '')) || /New-Item|Remove-Item|Move-Item|^mkdir -p/.test(last)
    if (isShell) {
      // directory shim (v3's runShell: powershell New-Item / POSIX mkdir -p)
      if (/New-Item/.test(last)) {
        const m = last.match(/-Path\s+(?:'((?:[^']|'')*)'|"((?:[^"]|"")*)")/)
        const raw = (m && (m[1] || m[2])) || ''
        for (const p of raw.split(',').map((x) => x.replace(/''/g, "'"))) if (p) mkdirSync(p, { recursive: true })
      }
      if (/^mkdir -p/.test(last)) {
        const re = /'((?:[^']|'\\'')*)'/g
        let m
        while ((m = re.exec(last)) !== null) mkdirSync(m[1].replace(/'\\''/g, "'"), { recursive: true })
      }
      if (/Remove-Item/.test(last)) {
        const m = last.match(/-LiteralPath\s+'((?:[^']|'')*)'/)
        if (m) rmSync(m[1].replace(/''/g, "'"), { force: true, recursive: true })
      }
      return { done: Promise.resolve({ exitCode: 0 }), collected: {} }
    }
    const file = last
    const text = existsSync(file) ? readFileSync(file, 'utf8') : ''
    leanRuns.push({ argv: argv.slice(0, -1), file, cwd: spec.cwd, graceMs: spec.graceMs })
    if (spawnThrows) throw new Error('spawn ' + String(argv[0]) + ' EPERM')
    if (/-- REJECT/.test(text)) {
      return {
        done: Promise.reject(new Error('child process died before reporting')),
        collected: { stdout: { readFrom: () => ({ text: '', nextOffset: 0, lossy: false }) }, stderr: { readFrom: () => ({ text: '', nextOffset: 0, lossy: false }) } },
        terminate() {},
      }
    }
    if (/-- HANG/.test(text)) {
      return {
        done: new Promise(() => {}),
        collected: { stdout: { readFrom: () => ({ text: '', nextOffset: 0, lossy: false }) }, stderr: { readFrom: () => ({ text: '', nextOffset: 0, lossy: false }) } },
        terminate() { terminated.push(file) },
      }
    }
    const bad = /sorry|-- FAIL/.test(text)
    const stdout = bad ? '' : 'ok\n'
    const stderr = bad ? 'error: declaration uses sorry\n' : ''
    return {
      done: Promise.resolve({ exitCode: bad ? 1 : 0, signal: null }),
      collected: {
        stdout: { readFrom: () => ({ text: stdout, nextOffset: stdout.length, lossy: false }) },
        stderr: { readFrom: () => ({ text: stderr, nextOffset: stderr.length, lossy: false }) },
      },
      terminate() {},
    }
  },
}

const ctx = {
  get(name) {
    if (name === 'subprocess') return subprocessAvailable ? subprocess : undefined
    if (name === 'sandboxPolicy') return { resolve() { return { workspaceRoot: WS } } }
    return undefined
  },
  on(e, fn) { (listeners[e] = listeners[e] || []).push(fn) },
  effect(fn) { const d = fn(); const off = () => { if (typeof d === 'function') d() }; disposers.push(off); return off },
  logger: { info() {}, warn() {}, error() {} },
  tools: { register(spec) { toolRegs.push(spec); return () => {} } },
  commands: { register(spec) { cmdRegs.push(spec); return () => {} } },
  subagents: {
    list() { return ['spawn'] },
    async startContinuable({ label, request }) {
      const childId = 'c' + (spawns.length + 1)
      const rootId = (request && request.parent && request.parent.id) || ''
      const prompt = (request && request.prompt && request.prompt[0] && request.prompt[0].text) || ''
      spawns.push({ label, childId, rootId, prompt })
      corpus.push({ kind: 'spawn', label: scrub(label), root: rootId, prompt: scrub(prompt) })
      return { childId, messageId: 'm' + spawns.length }
    },
    async sendMessage(parent, childId, blocks) {
      const rootId = (parent && parent.id) || ''
      const prompt = (blocks && blocks[0] && blocks[0].text) || ''
      wakes.push({ childId, rootId, prompt })
      const sp = spawns.find((s) => s.childId === childId)
      corpus.push({ kind: 'wake', label: scrub(sp ? sp.label : childId), root: rootId, prompt: scrub(prompt) })
      return 'w' + wakes.length
    },
    async followup(parent, childId, blocks) { return await this.sendMessage(parent, childId, blocks) },
    interrupt(childId) { interrupts.push(childId) },
  },
  agents: { roots() { return roots.slice() }, get() { return undefined } },
  // DSH 0.1.1 fs API: resolve → { targetKey, displayPath }
  fs: {
    async resolve(rel, opts) {
      const base = (opts && opts.cwd) || WS
      const p = (typeof rel === 'string' && isAbsolute(rel)) ? rel.replace(/\//g, '\\') : join(base, ...String(rel).split('/'))
      return { targetKey: p, displayPath: p }
    },
    async stat(t) { return existsSync(t.targetKey) ? { version: 'v1', type: 'file', size: 1 } : undefined },
    async readText(t) { return readFileSync(t.targetKey, 'utf8') },
    async writeText(t, content) { mkdirSync(dirname(t.targetKey), { recursive: true }); writeFileSync(t.targetKey, content, 'utf8') },
    async listDir(t) { if (!existsSync(t.targetKey)) return []; return readdirSync(t.targetKey, { withFileTypes: true }).map((e) => ({ name: e.name, type: e.isDirectory() ? 'directory' : 'file' })) },
  },
}

const mod = await import(PLUGIN.href + '?t=' + Date.now())
;(mod.default || mod).apply(ctx)
// leanAsync defaults to TRUE (background queue). The sections above guard the **synchronous** Lean
// path verbatim, so pin leanAsync=false through the workspace-level settings file (every
// setProject → loadSettings() picks it up). Section 9b flips it back on explicitly for the async
// state machine. Nothing else in the suite depends on the async default.
mkdirSync(VIBE, { recursive: true })
writeFileSync(join(VIBE, 'vibe_math_setting.json'), '{ "leanAsync": false }\n', 'utf8')

// ---------------------------------------------------------------
// driving helpers
// ---------------------------------------------------------------
function makeRoot() {
  const id = 'sess-' + String.fromCharCode(65 + rootSeq++)
  const root = { id, options: { provider: 'mock', model: 'mock-model' }, session: { id, header: { cwd: WS, parentSession: undefined } }, followup() {}, ctx: undefined }
  roots.push(root)
  return root
}
async function callTool(name, args, agent) {
  const spec = toolRegs.find((s) => s.name === name)
  if (!spec) throw new Error('no tool ' + name)
  return JSON.parse(await spec.execute(args || {}, { agent }))
}
function fireEnd(childId, reply) {
  const blocks = reply === undefined ? [] : [{ type: 'text', text: '```json\n' + JSON.stringify(reply) + '\n```' }]
  for (const h of (listeners['subagent/end'] || [])) h({ id: childId, runId: 'r', provider: 'spawn', local: true, stopReason: 'completed', lastAssistantMessage: blocks })
}
const firedChildren = new Set()
// Spawns created before a restart belong to a task the restart discarded; they are never a valid
// target for a later round (their onChildEnd has no agentRegistry entry any more). The floor keeps
// `unfiredVerifiers` from selecting them.
const spawnFloor = {}
const markFloor = (root) => { spawnFloor[root.id] = spawns.length }
const spawnOf = (root, prefix) => spawns.filter((s) => s.rootId === root.id && s.label.startsWith(prefix))
const lastSpawn = (root, prefix) => spawnOf(root, prefix).slice(-1)[0]
const unfiredVerifiers = (root, re) => spawns.filter((s, i) => s.rootId === root.id && (spawnFloor[root.id] || 0) <= i && re.test(s.label) && !firedChildren.has(s.childId))
const promptText = (root) => spawns.filter((s) => s.rootId === root.id).map((s) => s.prompt).join('\n') + '\n' + wakes.filter((w) => w.rootId === root.id).map((w) => w.prompt).join('\n')

/** Parameters every verification scenario uses. A high concurrency cap keeps the fallback
 *  scheduler from starving a later object behind a pile of unfired mock verifiers. */
const VPARAMS = { plannerEnabled: false, verifierCount: 2, debateMaxRounds: 1, maxParallelThreshold: 64, tickIntervalMs: 200 }

/** Fire the one in-flight forced planner with an empty plan (an empty plan schedules a tick). */
async function pump(root) {
  const pending = spawns.filter((s) => s.rootId === root.id && s.label.startsWith('planner:') && !firedChildren.has(s.childId)).slice(-1)[0]
  if (pending) { firedChildren.add(pending.childId); fireEnd(pending.childId, { summary: 'noop', plan: [] }); return }
  try { await callTool('vibe_math_plan', { force: true }, root) } catch (e) { /* not running / gated */ }
}
/** Poll `pred`, nudging the scheduler along with an empty forced plan (the 1s tick timer is the fallback). */
async function drive(root, pred, label, timeoutMs) {
  const deadline = Date.now() + (timeoutMs || 15000)
  while (Date.now() < deadline) {
    if (pred()) return true
    await pump(root)
    await sleep(80)
  }
  if (pred()) return true
  console.error('  .. drive timed out: ' + label)
  return false
}
/** Fire the next `results.length` verifiers of one object (any of its candidate rIds). */
async function runVerifyRound(root, target, results, timeoutMs) {
  const re = verifyRe(target)
  const ok = await drive(root, () => unfiredVerifiers(root, re).length >= results.length, 'verifiers for r-' + target, timeoutMs)
  if (!ok) return null
  const un = unfiredVerifiers(root, re).slice(0, results.length)
  for (let i = 0; i < un.length; i++) { firedChildren.add(un[i].childId); fireEnd(un[i].childId, { Result: results[i], Reason: 'mock 裁决 ' + results[i] }) }
  await sleep(220)
  return un
}
/** V3-G1: `unfiredVerifiers(...).length` is a COUNT - the semantic unit is that the fired reviews are
 *  DISTINCT slots (the `:<index>` suffix), i.e. two genuinely independent reviews of the same object.
 *  A founding that spawns the same slot twice keeps the count at 2 and used to pass. */
/** The slot indices (`:<index>`) of a fired/eligible verifier round. */
function slotsOf(round) { return (round || []).map((x) => String(x.label).split(':').pop()) }
let gateSlots1 = null   // V3-G2: round-one slots (module scope: the require round lives in a block)

function assertDistinctSlots(round, tag) {
  assert(Array.isArray(round) && round.length > 0, tag + ': verifiers were fired')
  const idx = round.map((x) => String(x.label).split(':').pop())
  const rIds = round.map((x) => String(x.label).split(':')[1])
  assert(new Set(idx).size === idx.length, '* V3-G1 ' + tag + ': the reviews are DISTINCT verifier slots (indices=' + JSON.stringify(idx) + ')')
  assert(new Set(rIds).size === 1, '* V3-G1 ' + tag + ': every review targets the SAME object (targets=' + JSON.stringify(rIds) + ')')
}

/** Abort + restart: gives the next verification a FRESH task, so a prompt is guaranteed to be
 *  constructed after whatever changed in between (mode switch, archived proof, …). */
async function restart(root) {
  await callTool('vibe_math_abort', {}, root)
  await callTool('vibe_math_start', {}, root)
  markFloor(root)
}

console.log('-- V3 Lean formal verification --')
console.log('plugin under test: ' + PLUGIN.href)

// ===============================================================
// 1. 'off' is a true no-op
// ===============================================================
section("1 'off' (default) is a true no-op")
const RA = makeRoot()
await callTool('vibe_math_new_project', { name: 'lean-off' }, RA)
await callTool('vibe_math_set_params', Object.assign({}, VPARAMS), RA)
await callTool('vibe_math_add_proposition', { id: 'p-off', 概述: '关模式下的普通命题', 概率: 0.6, 分类: '数论' }, RA)
await callTool('vibe_math_start', {}, RA)
const offRound = await runVerifyRound(RA, 'p-off', [1, 1])
assert(offRound !== null && offRound.length === 2, 'off: two independent verifiers were asked (投票流程照常)')
  if (offRound) assertDistinctSlots(offRound, 'off round')
const offProj = projRoot('lean-off')
assert(await drive(RA, () => existsSync(join(offProj, 'Verified', '命题', 'p-off.md')), 'off Verified card'), "'off' still finalizes on a unanimous boolean vote with NO Lean artifact")
{
  const st = await callTool('vibe_math_status', {}, RA)
  assert(st.params.formalVerify === 'off', "the default is 'off' (got " + st.params.formalVerify + ')')
  const all = promptText(RA)
  assert(!/Lean/.test(all), 'no prompt mentions Lean in off mode')
  assert(!/形式化/.test(all), 'no prompt mentions 形式化 in off mode')
  assert(!/\[形式化\]/.test(all), 'the [形式化] announcement line is absent in off mode')
}
assert(!/形式化/.test(readIf(join(offProj, 'Verified', '命题', 'p-off.md'))), 'the Verified card carries no formal line in off mode')
assert(!existsSync(join(offProj, 'Formal', 'Index.md')), 'no Formal/Index.md is produced in off mode (no formal record)')
assert(!existsSync(join(offProj, 'State', 'formal.json')), 'no State/formal.json is produced in off mode')
{
  const st = await callTool('vibe_math_status', {}, RA)
  assert(st.formal.mode === 'off' && st.formal.objects.length === 0, 'status reports mode=off with zero formal objects')
}
// the tools still EXIST in off mode (static registration), they are just never advertised
assert(!!toolRegs.find((t) => t.name === 'vibe_math_lean_run') && !!toolRegs.find((t) => t.name === 'vibe_math_lean_archive') && !!toolRegs.find((t) => t.name === 'vibe_math_lean_lib'),
  'the three Lean tools are registered in every mode (registration is static)')

// ★ The mode switch must be REACHABLE THROUGH THE TOOL SCHEMA (2.3.2 defect D1) ──────────────
// Every tool schema here is closed (`additionalProperties:false`), so a key the schema does not
// advertise is REJECTED by any schema-validating provider. v3 shipped 2.3.0/2.3.1 with all four Lean
// parameters missing from the set-params schema while every assertion in this file stayed green —
// because the suite calls the handler DIRECTLY and never inspects the registered schema. The feature
// could not be switched on at all through the tool interface.
{
  const setSpec = toolRegs.find((t) => t.name === 'vibe_math_set_params')
  assert(!!setSpec, "vibe_math_set_params is registered")
  assert(setSpec.parameters && setSpec.parameters.type === 'object' && setSpec.parameters.additionalProperties === false,
    '★ vibe_math_set_params publishes a CLOSED object schema (an unlisted key is rejected, so the schema IS the contract)')
  for (const k of ['formalVerify', 'leanCommand', 'leanArgs', 'leanTimeoutMs']) {
    assert(Object.prototype.hasOwnProperty.call(setSpec.parameters.properties, k),
      '★ the registered schema advertises ' + k + ' (every other surface documents it; a schema that omits it makes the switch unreachable)')
  }
  assert(JSON.stringify(setSpec.parameters.properties.formalVerify.enum) === JSON.stringify(['off', 'encourage', 'require']),
    'the schema narrows formalVerify to the three real modes (a typo must not be a fourth)')
}

// A stray `formal` reply in OFF mode must be INERT (finding #1): the absorber is mode-gated, and the
// reply contract does not offer the field in off mode. The TOOLS stay usable on purpose.
{
  const RB0 = makeRoot()
  await callTool('vibe_math_new_project', { name: 'lean-off-reply' }, RB0)
  await callTool('vibe_math_set_params', Object.assign({}, VPARAMS), RB0)
  await callTool('vibe_math_add_proposition', { id: 'p-offr', 概述: '关模式下的回执注入测试', 概率: 0.6, 分类: '数论' }, RB0)
  await callTool('vibe_math_start', {}, RB0)
  const re0 = verifyRe('p-offr')
  const ok0 = await drive(RB0, () => unfiredVerifiers(RB0, re0).length >= 1, 'off-reply verifier')
  assert(ok0, 'off mode: a verifier wake exists to carry the stray formal reply')
  const un0 = unfiredVerifiers(RB0, re0).slice(0, 1)
  if (un0.length) {
    firedChildren.add(un0[0].childId)
    fireEnd(un0[0].childId, { Result: 0.5, Reason: '普通评审', formal: { target: 'p-offr', decision: 'defect', note: '不应被记录' } })
  }
  await sleep(220)
  const pj0 = projRoot('lean-off-reply')
  assert(!existsSync(join(pj0, 'State', 'formal.json')), '★ a stray `formal` reply in off mode writes NO State/formal.json')
  const st0 = await callTool('vibe_math_status', {}, RB0)
  assert(st0.formal.objects.length === 0, '★ and records no formal object')
}

// ===============================================================
// 2. parameter validation + runtime switching
// ===============================================================
section('2 parameter validation and runtime switching')
const RB = makeRoot()
await callTool('vibe_math_new_project', { name: 'lean-params' }, RB)
const bad = await callTool('vibe_math_set_params', { formalVerify: 'banana' }, RB)
assert(bad.params.formalVerify === 'off', "an unknown mode degrades to 'off', never to a stronger mode (got " + bad.params.formalVerify + ')')
const bad2 = await callTool('vibe_math_set_params', { formalVerify: 'REQUIRE' }, RB)
assert(bad2.params.formalVerify === 'off', 'the mode is matched exactly (a case typo cannot force formalization)')
const enc = await callTool('vibe_math_set_params', { formalVerify: 'encourage' }, RB)
assert(enc.params.formalVerify === 'encourage', "'encourage' is accepted")
const req = await callTool('vibe_math_set_params', { formalVerify: 'require', leanTimeoutMs: -5, leanCommand: '   ' }, RB)
assert(req.params.formalVerify === 'require', "'require' is accepted")
assert(req.params.leanTimeoutMs === 120000, 'a non-positive leanTimeoutMs falls back to the default (' + req.params.leanTimeoutMs + ')')
assert((await callTool('vibe_math_set_params', { leanTimeoutMs: 0 }, RB)).params.leanTimeoutMs === 120000, 'leanTimeoutMs=0 also falls back to the default')
assert(req.params.leanCommand === 'lean', 'a blank leanCommand falls back to "lean"')
const t5 = await callTool('vibe_math_set_params', { leanTimeoutMs: 5000 }, RB)
assert(t5.params.leanTimeoutMs === 5000, 'a positive leanTimeoutMs is accepted (got ' + t5.params.leanTimeoutMs + ')')
const arrBad = await callTool('vibe_math_set_params', { leanArgs: 'not-an-array' }, RB)
assert(Array.isArray(arrBad.params.leanArgs) && arrBad.params.leanArgs.length === 0, 'a non-array leanArgs falls back to []')
await callTool('vibe_math_set_params', { leanCommand: 'lake', leanArgs: ['env', 'lean'] }, RB)
const stL = await callTool('vibe_math_status', {}, RB)
assert(stL.params.leanCommand === 'lake' && stL.params.leanArgs.join(' ') === 'env lean', 'leanCommand/leanArgs are settable (lake env lean)')
{
  const setup = await callTool('vibe_math_setup', {}, RB)
  const names = setup.parameters.map((p) => p.name)
  assert(names.indexOf('formalVerify') !== -1 && names.indexOf('leanCommand') !== -1 && names.indexOf('leanArgs') !== -1 && names.indexOf('leanTimeoutMs') !== -1,
    'the settings schema surfaces all four Lean parameters')
  const f = setup.parameters.find((p) => p.name === 'formalVerify')
  assert(f.default === 'off' && f.current === 'require', 'the schema carries the default (off) and the current value (require)')
  const tmpl = await callTool('vibe_math_template', { where: 'project' }, RB)
  const tj = readIf(join(projRoot('lean-params'), 'vibe_math_setting.json'))
  assert(tmpl.ok === true && /"formalVerify": "off"/.test(tj) && /"leanArgs": \[\]/.test(tj), 'the generated settings template documents the Lean parameters with their defaults')
  assert(/formalVerify — /.test(tj), 'the template carries the human-readable parameter description as a comment')
}

// ===============================================================
// 3. 'encourage' injection into the WORK prompts
// ===============================================================
section("3 'encourage' injects 顺手形式化 into solver / explorer / method-keeper prompts")
const RC = makeRoot()
await callTool('vibe_math_new_project', { name: 'lean-work' }, RC)
await callTool('vibe_math_set_params', Object.assign({}, VPARAMS, { formalVerify: 'encourage', methodKeepEvery: 1 }), RC)
await callTool('vibe_math_add_problem', { id: 'qE', description: '证明 log 2 是无理数', priority: 0 }, RC)
await callTool('vibe_math_start', {}, RC)
assert(await drive(RC, () => !!lastSpawn(RC, 'explorer:qE'), 'explorer:qE'), 'fallback scheduler spawned explorer:qE')
{
  const p = lastSpawn(RC, 'explorer:qE').prompt
  assert(/【顺手形式化（鼓励）】/.test(p), 'the explorer work prompt carries the 顺手形式化 line')
  assert(/vibe_math_lean_archive kind='def'/.test(p), 'the work prompt points at the archive tool for reusable definitions')
  assert(/vibe_math_lean_lib 查重/.test(p), 'the work prompt tells agents to check the reuse library first')
  assert(/形式化回执/.test(p) && /"decision":"used\|blocked\|defect"/.test(p), '★ the work-round reply contract also advertises the formal field, defect included (契约 §6.3)')
}
fireEnd(lastSpawn(RC, 'explorer:qE').childId, { meta: { kind: 'directions', qid: 'qE', formal: { target: 'qE', decision: 'blocked', note: '需要先形式化连分数收敛定理' }, directions: [{ id: 'd1', title: '连分数法', method: 'e 的连分数', core_assumption: '', feasibility: 0.7 }] } })
// Answer EVERY explorer the fallback scheduler dispatches (it re-derives when a direction looks
// unattended) until the solver for d1 appears — otherwise the retry cap can stall the project.
for (let guard = 0; guard < 40 && !lastSpawn(RC, 'solver:qE:d1'); guard++) {
  const ex = spawns.filter((s) => s.rootId === RC.id && s.label.startsWith('explorer:qE') && !firedChildren.has(s.childId)).slice(-1)[0]
  if (ex) {
    firedChildren.add(ex.childId)
    fireEnd(ex.childId, { meta: { kind: 'directions', qid: 'qE', directions: [{ id: 'd1', title: '连分数法', method: 'e 的连分数', core_assumption: '', feasibility: 0.7 }] } })
  }
  await pump(RC)
  await sleep(80)
}
assert(!!lastSpawn(RC, 'solver:qE:d1'), 'solver spawned for direction d1')
assert(/【顺手形式化（鼓励）】/.test(lastSpawn(RC, 'solver:qE:d1').prompt), 'the solver work prompt carries the 顺手形式化 line')
{
  // the explorer's `meta.formal` judgement is recorded even though it never called a Lean tool
  const st = await callTool('vibe_math_status', {}, RC)
  assert(st.formal.blocked.indexOf('qE') !== -1, '★ an explorer `meta.formal` judgement is recorded (no Lean tool call needed)')
  assert(/- 形式化: 阻塞（/.test(readIf(join(projRoot('lean-work'), 'Problems', 'qE.md'))), 'and it lands on the problem card anchor')
}
fireEnd(lastSpawn(RC, 'solver:qE:d1').childId, { status: 'continue', survival_probability: 0.6, formal: { target: 'd1-lemma', decision: 'used', file: 'Formal/d1-lemma.lean' }, new_inventions: [{ 类型: '工具', 标题: '连分数估值工具', 内容描述: '控制收敛速度', 是否已入库: false }] })
await sleep(250)
{
  const st = await callTool('vibe_math_status', {}, RC)
  assert(st.formal.objects.some((o) => o.target === 'd1-lemma' && o.status === 'attempted'), 'a solver top-level `formal.decision=used` reply records the object as attempted')
}
assert(await drive(RC, () => !!lastSpawn(RC, 'method-keeper'), 'method-keeper'), 'method keeper spawned for the pending invention')
{
  const p = lastSpawn(RC, 'method-keeper').prompt
  assert(/【顺手形式化（鼓励）】/.test(p), 'the method-keeper prompt carries the 顺手形式化 line')
  assert(/【方法沉淀 × Lean 形式化】/.test(p), '★ the method keeper is told to ALSO sediment reusable Lean definitions/lemmas')
  assert(/kind='lemma'/.test(p) && /Proved/.test(p), 'and where the proved lemmas go')
}
await callTool('vibe_math_abort', {}, RC)
assert((await callTool('vibe_math_status', {}, RC)).running === false, 'work-prompt scenario aborted (keeps later scenarios deterministic)')

// ===============================================================
// 4. 'encourage' injection into BOTH verification prompts + the fidelity switch
// ===============================================================
section("4 'encourage' reaches the review prompt and the debate prompt")
const RD = makeRoot()
await callTool('vibe_math_new_project', { name: 'lean-verify' }, RD)
await callTool('vibe_math_set_params', Object.assign({}, VPARAMS, { formalVerify: 'encourage', debateMaxRounds: 2 }), RD)
await callTool('vibe_math_add_proposition', { id: 'p-enc', 概述: '鼓励模式下的忠实性审查', 概率: 0.6, 分类: '数论' }, RD)
await callTool('vibe_math_start', {}, RD)
const encBatch = await runVerifyRound(RD, 'p-enc', [0.9, 0.95])
assert(encBatch !== null, 'encourage: the first review round was asked')
  if (encBatch) assertDistinctSlots(encBatch, 'encourage round')
if (encBatch) {
  const vp = encBatch.map((s) => s.prompt).join('\n')
  assert(/【Lean 形式化验证（鼓励模式）】/.test(vp), 'the review prompt explains the Lean mode')
  assert(/一旦 Lean 通过，你唯一需要确认的就是忠实性/.test(vp), 'the review prompt states that a passing Lean run shrinks the question to fidelity')
  assert(/实现难度/.test(vp), 'the review prompt asks for the implementation-difficulty judgement')
  assert(/可以不做，但请在回执的 formal 字段写明难度判断/.test(vp), "'encourage' explicitly allows skipping (with a recorded judgement)")
  assert(/"formal":/.test(vp) && /"decision":"used\|blocked\|defect"/.test(vp), 'the reply contract documents the formal field (defect included)')
  assert(/vibe_math_lean_run/.test(vp) && /vibe_math_lean_archive/.test(vp) && /vibe_math_lean_lib/.test(vp), 'the prompt names the three v3 Lean tools')
  assert(/Formal\/（相对项目根）/.test(vp) && /VibeMath\/Formal\/Lib/.test(vp), 'the prompt states the path layout')
}
// a non-consensus round moves to the public debate, whose prompt must carry the same injection
assert(await drive(RD, () => wakes.some((w) => w.rootId === RD.id && /交流群/.test(w.prompt)), 'debate prompt'), 'a non-consensus round moved to the debate')
{
  const dp = wakes.filter((w) => w.rootId === RD.id).map((w) => w.prompt).join('\n')
  assert(/【Lean 形式化验证（鼓励模式）】/.test(dp), 'the debate prompt names the mode')
  assert(/一旦 Lean 通过，你唯一需要确认的就是忠实性|你不需要重新检查推导/.test(dp), 'the debate prompt carries the Lean block too')
  assert(/"formal":/.test(dp), 'the debate reply contract carries the formal field')
}
// finish the debate: a unanimous round concludes
if (encBatch) for (const b of encBatch) fireEnd(b.childId, { Result: 1, Reason: 'mock 第二轮一致' })
assert(await drive(RD, () => existsSync(join(projRoot('lean-verify'), 'Verified', '命题', 'p-enc.md')), 'p-enc verified'), 'the debate finished and the object was verified')

// ===============================================================
// 5. lean_run executes through the subprocess service and reports honestly
// ===============================================================
section('5 lean_run executes through the subprocess service and reports honestly')
const RE = makeRoot()
await callTool('vibe_math_new_project', { name: 'lean-tools' }, RE)
await callTool('vibe_math_set_params', { formalVerify: 'encourage' }, RE)
await callTool('vibe_math_add_proposition', { id: 'p-tool', 概述: '工具实验命题', 概率: 0.6, 分类: '数论' }, RE)
const toolProj = projRoot('lean-tools')
mkdirSync(join(toolProj, 'Formal'), { recursive: true })
writeFileSync(join(toolProj, 'Formal', 'good.lean'), 'theorem t : 1 = 1 := rfl\n', 'utf8')
writeFileSync(join(toolProj, 'Formal', 'bad.lean'), 'theorem t : 1 = 2 := by sorry\n', 'utf8')
writeFileSync(join(toolProj, 'Formal', 'hang.lean'), '-- HANG\ntheorem t : 1 = 1 := rfl\n', 'utf8')
{
  const runGood = await callTool('vibe_math_lean_run', { file: 'Formal/good.lean', target: 'p-tool' }, RE)
  assert(runGood.ok === true && runGood.exitCode === 0, 'a file with no sorry runs green (' + JSON.stringify({ ok: runGood.ok, exitCode: runGood.exitCode }) + ')')
  assert(/ok/.test(runGood.stdout), 'the compiler stdout is returned')
  const last = leanRuns[leanRuns.length - 1]
  assert(last.cwd.replace(/\\/g, '/') === toolProj.replace(/\\/g, '/'), 'the toolchain runs with the PROJECT root as cwd')
  assert(last.argv.join(' ') === 'lean --search-path ' + VIBE.replace(/\\/g, '/'), 'by default the argv is the executable + the injected search path (got ' + last.argv.join(' ') + ')')
  assert(last.graceMs === 120000, 'the default leanTimeoutMs is passed down as graceMs (' + last.graceMs + ')')
}
{
  const st = await callTool('vibe_math_status', {}, RE)
  const o = st.formal.objects.find((x) => x.target === 'p-tool')
  assert(!!o && o.status === 'attempted', 'lean_run with target records the object as attempted (not passed)')
  assert(!!o.run && o.run.ok === true, 'the run result is recorded on the object')
  const card = readIf(join(toolProj, 'Propos', '数论', 'p-tool.md'))
  assert(/- 形式化: 已尝试未通过/.test(card), '★ the object card anchor block gains `- 形式化: <状态>` alongside 状态/概率')
  assert(/\n- ID: p-tool\n/.test(card) && /\n- 状态: 未定论\n/.test(card) && /\n- 概率: 0.6\n/.test(card), 'the pre-existing anchors are untouched (the scheduler parser keeps working)')
}
{
  const runBad = await callTool('vibe_math_lean_run', { file: 'Formal/bad.lean' }, RE)
  assert(runBad.ok === false && runBad.exitCode === 1, 'a file that still uses sorry reports a red run')
  assert(/sorry/.test(runBad.stderr), 'the compiler output is returned verbatim (' + JSON.stringify(runBad.stderr).slice(0, 60) + ')')
  assert(/修复后重跑/.test(runBad.hint || ''), 'a genuine compile failure still points at the compiler output (the hint is failure-code aware, not blanket)')
}
{
  const runMissing = await callTool('vibe_math_lean_run', { file: 'Formal/nope.lean' }, RE)
  assert(runMissing.ok === false && runMissing.code === 'V3_NOT_FOUND', 'a missing file is refused with a typed code')
}
{
  // The guard's boundary is the VibeMath ROOT, not the project: the global reuse library
  // deliberately lives at <VibeMath>/Formal/{Lib,Proved}, so climbing out of the project but
  // staying inside VibeMath must remain legal (it just fails as a missing file).
  const inside = await callTool('vibe_math_lean_run', { file: '../../Formal/Lib/x.lean' }, RE)
  assert(inside.code === 'V3_NOT_FOUND', 'climbing out of the project but staying inside VibeMath is allowed (the global library lives there)')
  const esc1 = await callTool('vibe_math_lean_run', { file: '../../../evil.lean' }, RE)
  assert(esc1.ok === false && esc1.code === 'V3_INVALID_ARGUMENT', '★ a traversal that climbs ABOVE the VibeMath root is refused')
  const esc2 = await callTool('vibe_math_lean_run', { file: 'Formal/../../../../../../evil.lean' }, RE)
  assert(esc2.ok === false && esc2.code === 'V3_INVALID_ARGUMENT', 'a deeper traversal is refused too')
  const esc3 = await callTool('vibe_math_lean_run', { file: '/etc/evil.lean' }, RE)
  assert(esc3.ok === false && esc3.code === 'V3_INVALID_ARGUMENT', 'an unrelated absolute path is refused')
  const notLean = await callTool('vibe_math_lean_run', { file: 'Formal/good.txt' }, RE)
  assert(notLean.ok === false && notLean.code === 'V3_INVALID_ARGUMENT', 'only .lean files can be executed')
  const noFile = await callTool('vibe_math_lean_run', {}, RE)
  assert(noFile.ok === false && noFile.code === 'V3_INVALID_ARGUMENT', 'a missing file argument is refused')
}
{
  toolchainAvailable = false
// task-6: the missing-toolchain simulation must deny the KNOWN-LOCATION fallback too (a machine with
// Lean installed would otherwise resolve it through %ELAN_HOME%/~/.elan and the run would succeed).
const _tcSaved = {}; for (const _k of ['ELAN_HOME', 'USERPROFILE', 'HOME', 'LOCALAPPDATA']) _tcSaved[_k] = process.env[_k]
process.env.ELAN_HOME = 'Z:/no-elan'; process.env.USERPROFILE = 'Z:/no-home'; process.env.HOME = 'Z:/no-home'; process.env.LOCALAPPDATA = 'Z:/no-local'
let runNoTc
try {
  runNoTc = await callTool('vibe_math_lean_run', { file: 'Formal/good.lean' }, RE)
  assert(runNoTc.ok === false && runNoTc.code === 'LEAN_NOT_FOUND', 'a missing toolchain returns LEAN_NOT_FOUND instead of crashing')
  assert(/仍可把形式化代码写下来归档/.test(runNoTc.message), 'the failure explains the graceful degradation')
} finally { for (const _k of Object.keys(_tcSaved)) { if (_tcSaved[_k] === undefined) delete process.env[_k]; else process.env[_k] = _tcSaved[_k] } }
  assert(/本宿主无法执行 Lean（LEAN_NOT_FOUND）/.test(runNoTc.hint || '') && !/编译器输出修复后重跑/.test(runNoTc.hint || ''),
    '★ the failure hint never tells the agent to fix compiler output that does not exist — it points at the archive + explicit-blocker way out (§6 hard requirement 4)')
  toolchainAvailable = true
}
{
  subprocessAvailable = false
  const runNoSub = await callTool('vibe_math_lean_run', { file: 'Formal/good.lean' }, RE)
  assert(runNoSub.ok === false && runNoSub.code === 'NO_SUBPROCESS', 'a host without the subprocess service returns NO_SUBPROCESS')
  assert(/本宿主无法执行 Lean（NO_SUBPROCESS）/.test(runNoSub.hint || '') && /vibe_math_lean_archive/.test(runNoSub.hint || ''),
    '★ the NO_SUBPROCESS hint names the way out with the FULL tool name (no retry loop on an impossible run)')
  subprocessAvailable = true
}
{
  const runHang = await callTool('vibe_math_lean_run', { file: 'Formal/hang.lean', timeout_ms: 1000 }, RE)
  assert(runHang.ok === false && runHang.code === 'LEAN_TIMEOUT' && runHang.timedOut === true, '★ a hanging toolchain returns LEAN_TIMEOUT instead of wedging the scheduler')
  assert(terminated.some((f) => /hang\.lean$/.test(f)), '★ the timeout path calls handle.terminate()')
}
{
  spawnThrows = true
  const runSpawn = await callTool('vibe_math_lean_run', { file: 'Formal/good.lean' }, RE)
  assert(runSpawn.ok === false && runSpawn.code === 'LEAN_SPAWN_FAILED', 'a spawn failure is reported as LEAN_SPAWN_FAILED instead of throwing')
  spawnThrows = false
  writeFileSync(join(toolProj, 'Formal', 'reject.lean'), '-- REJECT\ntheorem t : 1 = 1 := rfl\n', 'utf8')
  const runReject = await callTool('vibe_math_lean_run', { file: 'Formal/reject.lean' }, RE)
  assert(runReject.ok === false && runReject.code === 'LEAN_RUN_FAILED', 'a rejecting handle.done is reported as LEAN_RUN_FAILED instead of throwing into the loop')
}
{
  await callTool('vibe_math_set_params', { leanCommand: 'lake', leanArgs: ['env', 'lean'] }, RE)
  const runLake = await callTool('vibe_math_lean_run', { file: 'Formal/good.lean' }, RE)
  assert(runLake.ok === true, 'lake env lean works through leanCommand/leanArgs')
  assert(leanRuns[leanRuns.length - 1].argv.join(' ') === 'lake env lean --search-path ' + VIBE.replace(/\\/g, '/'), 'the argv is [exe, ...leanArgs, injected --search-path] (got ' + leanRuns[leanRuns.length - 1].argv.join(' ') + ')')
  await callTool('vibe_math_set_params', { leanCommand: 'lean', leanArgs: [] }, RE)
}

// ===============================================================
// 6. lean_archive: def / lemma / proof / blocked → the right paths + indexes
// ===============================================================
section('6 lean_archive writes the contract paths and rebuilds the indexes')
const libPath = join(VIBE, 'Formal', 'Lib')
const provedPath = join(VIBE, 'Formal', 'Proved')
{
  const defRes = await callTool('vibe_math_lean_archive', { kind: 'def', name: 'ZMod5', content: 'def ZMod5 := Fin 5\n' }, RE)
  assert(defRes.ok === true && defRes.file === 'Formal/Lib/ZMod5.lean', 'a reusable definition is archived to the global lib (' + defRes.file + ')')
  assert(existsSync(join(libPath, 'ZMod5.lean')), '★ the definition exists under VibeMath/Formal/Lib/ (cross-project, NOT inside the project)')
  assert(!existsSync(join(toolProj, 'Formal', 'Lib', 'ZMod5.lean')), 'it is NOT duplicated inside the project tree')
  assert(defRes.run && defRes.run.ok === true, 'the reusable definition is executed on archive (run defaults to true)')
  const libIdx = readIf(join(libPath, 'Index.md'))
  assert(/\| 名称 \| 文件 \| 类别 \| 依赖（import） \| 摘要 \| 最近运行 \|/.test(libIdx), 'Lib/Index.md uses the contract columns (incl. the import-dependency column, spec §4.4)')
  assert(/ZMod5/.test(libIdx) && /Lib\/ZMod5\.lean/.test(libIdx) && /\| ok \|/.test(libIdx), 'Lib/Index.md lists the new definition with its run result')
  assert(!/ZMod5/.test(readIf(join(toolProj, 'Formal', 'Index.md'))), 'the global definition does not pollute the project formal index')
}
{
  const lemRes = await callTool('vibe_math_lean_archive', { kind: 'lemma', name: 'sq_odd', content: 'import Mathlib\n\ntheorem sq_odd (n : Nat) : Odd (n*n) → Odd n := by omega\n' }, RE)
  assert(lemRes.ok === true && lemRes.file === 'Formal/Proved/sq_odd.lean', 'a lemma is archived to Proved/')
  assert(existsSync(join(provedPath, 'sq_odd.lean')), 'the lemma exists under VibeMath/Formal/Proved/')
  const provedIdx = readIf(join(provedPath, 'Index.md'))
  assert(/\| 名称 \| 文件 \| 陈述 \| 依赖 \| 最近运行 \|/.test(provedIdx), 'Proved/Index.md uses the contract columns')
  assert(/sq_odd/.test(provedIdx) && /Mathlib/.test(provedIdx), 'Proved/Index.md lists the lemma and its imports as 依赖')
}
{
  const noRun = await callTool('vibe_math_lean_archive', { kind: 'def', name: 'NoRun', content: 'def NoRun := 1\n', run: false }, RE)
  assert(noRun.ok === true && noRun.run === undefined, 'run=false archives WITHOUT executing (no toolchain needed)')
}
{
  const noName = await callTool('vibe_math_lean_archive', { kind: 'def', content: 'def x := 1\n' }, RE)
  assert(noName.ok === false && noName.code === 'V3_INVALID_ARGUMENT', 'archiving a definition without a name is refused')
  const badKind = await callTool('vibe_math_lean_archive', { kind: 'nonsense' }, RE)
  assert(badKind.ok === false && badKind.code === 'V3_INVALID_ARGUMENT', 'an unknown archive kind is refused')
  const noTarget = await callTool('vibe_math_lean_archive', { kind: 'proof', content: 'theorem x : 1 = 1 := rfl\n' }, RE)
  assert(noTarget.ok === false && noTarget.code === 'V3_INVALID_ARGUMENT', 'kind=proof without a target is refused')
  const noBody = await callTool('vibe_math_lean_archive', { kind: 'proof', target: 'p-x' }, RE)
  assert(noBody.ok === false && noBody.code === 'V3_INVALID_ARGUMENT', 'kind=proof without content/from is refused')
  const badFrom = await callTool('vibe_math_lean_archive', { kind: 'proof', target: 'p-x', from: '../../../evil.lean' }, RE)
  assert(badFrom.ok === false && badFrom.code === 'V3_INVALID_ARGUMENT', 'kind=proof with an out-of-tree from is refused')
}
{
  // a green proof → passed + Verified/Lean (the archived proof lives next to the conclusion)
  const arc = await callTool('vibe_math_lean_archive', { kind: 'proof', target: 'p-proof', content: 'theorem p_proof : 3 * 1 ^ 2 - 2 = (1:Nat) ^ 2 := by decide\n' }, RE)
  assert(arc.ok === true && arc.passed === true, 'the proof is archived and passes (' + JSON.stringify({ ok: arc.ok, passed: arc.passed }) + ')')
  assert(arc.file === 'Formal/p-proof.lean', 'the working file is Formal/<target>.lean')
  assert(arc.proof === 'Verified/Lean/p-proof.lean', 'the archived proof path is Verified/Lean/<target>.lean')
  assert(existsSync(join(toolProj, 'Formal', 'p-proof.lean')), 'the working file exists on disk')
  assert(existsSync(join(toolProj, 'Verified', 'Lean', 'p-proof.lean')), '★ the proof is archived under Verified/Lean/ as the proof of that object')
  const st = await callTool('vibe_math_status', {}, RE)
  assert(st.formal.passed.indexOf('p-proof') !== -1, 'status reports the object as Lean-passed')
  const idx = readIf(join(toolProj, 'Formal', 'Index.md'))
  assert(/# Lean 形式化索引/.test(idx) && /p-proof/.test(idx) && /passed/.test(idx) && /Verified\/Lean\/p-proof\.lean/.test(idx), 'Formal/Index.md indexes the object, its status and its archived proof')
  assert(/ok（exit 0，/.test(idx), 'the index shows the run result in the contract format')
  // a RED proof must NOT become passed
  const red = await callTool('vibe_math_lean_archive', { kind: 'proof', target: 'p-red', content: 'theorem p_red : 1 = 2 := by sorry\n' }, RE)
  assert(red.ok === true && red.passed === false && red.status === 'attempted', 'a red proof is archived as attempted, not passed')
  assert(!existsSync(join(toolProj, 'Verified', 'Lean', 'p-red.lean')), '★ no archived proof is written for a red run')
}
{
  const blkNoNote = await callTool('vibe_math_lean_archive', { kind: 'blocked', target: 'p-blk' }, RE)
  assert(blkNoNote.ok === false && blkNoNote.code === 'V3_INVALID_ARGUMENT', 'blocked without a note is refused')
  const blk = await callTool('vibe_math_lean_archive', { kind: 'blocked', target: 'p-blk', note: '需要外层解析数论框架，本轮工作量不可接受' }, RE)
  assert(blk.ok === true && blk.status === 'blocked', 'a reasoned blocker is recorded')
  const stBlk = await callTool('vibe_math_status', {}, RE)
  assert(stBlk.formal.blocked.indexOf('p-blk') !== -1, 'status lists the blocked object')
  assert(/需要外层解析数论框架/.test(readIf(join(toolProj, 'Formal', 'Index.md'))), 'the blocker reason is written into the index')
}
{
  const libList = await callTool('vibe_math_lean_lib', {}, RE)
  assert(libList.ok === true && libList.counts.lib >= 2 && libList.counts.proved >= 1, 'lean_lib reports the reuse library sizes (' + JSON.stringify(libList.counts) + ')')
  assert(libList.objects.some((o) => o.target === 'p-proof' && o.status === 'passed'), 'lean_lib lists per-object formal status')
  assert(/复用优先/.test(libList.hint || ''), 'lean_lib tells agents to reuse before redefining')
  assert(libList.paths && /VibeMath\/Formal\/Lib/.test(libList.paths.lib), 'lean_lib reports the cross-project path layout')
  const ro = await callTool('vibe_math_lean_lib', { refresh: false }, RE)
  assert(ro.rebuilt === false && ro.counts.lib === null, 'refresh:false only reads (does not rebuild the indexes)')
}
{
  const ann = readIf(join(toolProj, 'Logs', '形式化.md'))
  assert(/# 形式化公告/.test(ann) && /ZMod5/.test(ann) && /p-proof/.test(ann), 'the announcement log records what was formalized')
}

// ===============================================================
// 7. the 'require' gate
// ===============================================================
section("7 'require' withholds a verdict until the formal record exists")
const RF = makeRoot()
await callTool('vibe_math_new_project', { name: 'lean-gate' }, RF)
await callTool('vibe_math_set_params', Object.assign({}, VPARAMS, { formalVerify: 'require' }), RF)
await callTool('vibe_math_add_proposition', { id: 'p-gate', 概述: '必须形式化的命题', 概率: 0.6, 分类: '数论' }, RF)
const gateProj = projRoot('lean-gate')
await callTool('vibe_math_start', {}, RF)
{
  const batch = await runVerifyRound(RF, 'p-gate', [1, 1])
gateSlots1 = slotsOf(batch)   // V3-G2: measured ["0","1"]
  assert(batch !== null, 'require: the review round was asked')
  if (batch) {
    const vp = batch.map((s) => s.prompt).join('\n')
    assert(/【Lean 形式化验证（强制模式）】/.test(vp), 'the review prompt says 强制模式')
    assert(/必须产出 Lean 形式化/.test(vp), "'require' states the formalization is mandatory")
    assert(/本次裁定不会生效/.test(vp), 'the prompt warns that the verdict will not take effect without it')
    assert(/formal-required/.test(vp), 'the prompt names the machine-readable reason')
    assert(/归档可复用定义\/引理前先跑通（vibe_math_lean_archive run=true 或先 vibe_math_lean_run）；跑不通不要入库。/.test(vp),
      '★ the verification prompt requires a GREEN run before archiving into the reuse library (§6 hard requirement 3)')
    assert(/宿主没有 Lean 工具链（LEAN_NOT_FOUND）或宿主不提供 subprocess 服务（NO_SUBPROCESS）时：把代码写下来归档，并在回执的 note 里写明"宿主无 Lean 工具链"/.test(vp),
      '★ and spells out the way out when the host has no Lean toolchain, naming BOTH failure codes (LEAN_NOT_FOUND / NO_SUBPROCESS, §6 hard requirement 4)')
    assert(/Result/.test(vp) && !/verdict/.test(vp) && !/(^|[^a-z_])lean_(run|archive|lib)/.test(vp),
      '★ the voting prompt uses FULL tool names and names Result, never verdict (§6 hard requirements 1-2)')
  }
}
assert(await drive(RF, () => /p-gate/.test(readIf(join(gateProj, 'Formal', 'TODO.md'))), 'p-gate in Formal/TODO.md'), '★ a unanimous TRUE verdict was withheld: the object is on the formalization TODO')
assert(!existsSync(join(gateProj, 'Verified', '命题', 'p-gate.md')), 'no Verified card was written')
{
  const card = readIf(join(gateProj, 'Propos', '数论', 'p-gate.md'))
  assert(/- 概率: 0.6/.test(card), '★ the object keeps its existing probability (no silent promotion to 1)')
  assert(/- 状态: 未定论/.test(card), 'and its 状态 stays 未定论')
  const todo = readIf(join(gateProj, 'Formal', 'TODO.md'))
  assert(/# 形式化待办/.test(todo) && /p-gate/.test(todo) && /formal-required/.test(todo), '★ the TODO records the object with the machine-readable reason')
  const idx = readIf(join(gateProj, 'Formal', 'Index.md'))
  assert(/## 形式化待办/.test(idx) && /p-gate/.test(idx), 'Formal/Index.md mirrors the formalization TODO')
  const ann = readIf(join(gateProj, 'Logs', '形式化.md'))
  assert(/require 模式/.test(ann) && /不定论/.test(ann), '★ the withholding is announced')
  const st = await callTool('vibe_math_status', {}, RF)
  assert(st.formal.todo.some((t) => t.id === 'p-gate'), 'status lists the deferred object')
  assert(/formal-required/.test(st.recentActivity.map((e) => e.detail).join('\n')), 'the activity feed shows the formal-required deferral')
  const voteLog = listDirIf(join(gateProj, 'Logs', 'Verification')).filter((f) => /^r-p-gate_/.test(f))
  assert(voteLog.length >= 1, 'the votes themselves are still recorded in Logs/Verification (nothing is lost)')
}
// runtime switch: the mode is read when the prompt is CONSTRUCTED, so a fresh round reflects it
await callTool('vibe_math_add_proposition', { id: 'p-mode', 概述: '模式切换观察对象', 概率: 0.6, 分类: '数论' }, RF)
await restart(RF)
assert(await drive(RF, () => unfiredVerifiers(RF, verifyRe('p-mode')).length >= 2, 'fresh verifiers in require mode'), 'a fresh object is still verified in require mode')
{
  const fresh = unfiredVerifiers(RF, verifyRe('p-mode'))[0]
  assert(!!fresh && /【Lean 形式化验证（强制模式）】/.test(fresh.prompt) && /本次裁定不会生效/.test(fresh.prompt), 'a fresh round reflects the current mode (强制模式)')
}
// ★ anti-idle: a deferred object must NOT be re-voted while it sits on the TODO (each round would
// just be withheld again, burning verifiers on the same rId every tick). The assertion is only
// meaningful because the previous block proved the scheduler IS allocating verify tasks here.
assert(unfiredVerifiers(RF, verifyRe('p-gate')).length === 0, '★ a deferred object is NOT re-voted while it sits on the formalization TODO (no verification livelock)')
await callTool('vibe_math_set_params', { formalVerify: 'encourage' }, RF)
await restart(RF)
assert(await drive(RF, () => unfiredVerifiers(RF, verifyRe('p-mode')).length >= 2, 'fresh verifiers after the mode switch'), 'the unresolved object is verified again after the mode switch')
{
  const fresh = unfiredVerifiers(RF, verifyRe('p-mode'))[0]
  assert(!!fresh && /【Lean 形式化验证（鼓励模式）】/.test(fresh.prompt), '★ switching the mode at runtime immediately changes the prompt (now 鼓励模式)')
  assert(!!fresh && !/本次裁定不会生效/.test(fresh.prompt), 'and the mandatory wording is gone in encourage mode')
}
await callTool('vibe_math_set_params', { formalVerify: 'require' }, RF)
// formalize it, restart (so the next prompt is built AFTER the proof exists), then re-verify
{
  const proofNow = await callTool('vibe_math_lean_archive', { kind: 'proof', target: 'p-gate', content: 'theorem p_gate : 2 + 2 = 4 := by decide\n' }, RF)
  assert(proofNow.ok === true && proofNow.passed === true, 'the object is now Lean-passed')
  const st = await callTool('vibe_math_status', {}, RF)
  assert(st.formal.passed.indexOf('p-gate') !== -1, 'status reports p-gate as passed')
  assert(!st.formal.todo.some((t) => t.id === 'p-gate'), '★ satisfying the gate removes the object from the formalization TODO (no stale TODO)')
  assert(!/p-gate/.test(readIf(join(gateProj, 'Formal', 'TODO.md'))), 'Formal/TODO.md no longer lists it')
  assert(/- 形式化: Lean 通过/.test(readIf(join(gateProj, 'Propos', '数论', 'p-gate.md'))), 'the object card anchor now records Lean 通过')
}
await restart(RF)
assert(await drive(RF, () => unfiredVerifiers(RF, verifyRe('p-gate')).length >= 2, 'p-gate re-eligible after passing'), '★ once the formal record satisfies the gate, the object becomes eligible for verification again')
{
  // V3-G2: `.length >= 2` is a COUNT - the semantic unit is that the RE-ELIGIBLE reviews are the
  // SAME slots that fired in round one (a re-verification that re-armed different slots would
  // still satisfy the count). Measured round-one slots: ["0","1"].
  const un = unfiredVerifiers(RF, verifyRe('p-gate'))
  const slots = slotsOf(un)
  assert(slots.slice().sort().join(',') === gateSlots1.slice().sort().join(','), '* V3-G2 the re-eligible reviews are the SAME slots that fired in round one (before=' + JSON.stringify(gateSlots1) + ' after=' + JSON.stringify(slots) + ')')
  assert(new Set(slots).size === slots.length, '* V3-G2 and they are still DISTINCT slots (the V3-G1 clause restated at this site)')
}
{
  const batch = await runVerifyRound(RF, 'p-gate', [1, 1])
  assert(batch !== null, 'the re-verification round was asked')
  if (batch) {
    const vp = batch.map((s) => s.prompt).join('\n')
    assert(/该对象已有\*\*通过的 Lean 形式化证明\*\*/.test(vp), 'the voting prompt announces the passing proof')
    assert(/你不需要重新检查推导/.test(vp), '★ it tells voters NOT to re-derive')
    assert(/忠实性审查/.test(vp), '★ it tells voters the review subject is now fidelity')
    assert(/定义 \/ 对象 \/ 条件 \/ 假设 \/ 结论是否与命题原文\*\*完全一致\*\*/.test(vp), 'it enumerates exactly what fidelity means')
    assert(!/必须产出 Lean 形式化/.test(vp), 'and the "must formalize" wording is replaced (the object already has one)')
  }
}
assert(await drive(RF, () => existsSync(join(gateProj, 'Verified', '命题', 'p-gate.md')), 'p-gate Verified card'), '★ with a passing Lean artifact the same vote DOES promote it')
{
  const card = readIf(join(gateProj, 'Verified', '命题', 'p-gate.md'))
  assert(/- 形式化: Lean 通过/.test(card), '★ the Verified card records how strong the result is (Lean 通过)')
  assert(/Verified\/Lean\/p-gate\.lean/.test(card), 'the card points at the archived proof')
  assert(/- 结论: 真/.test(card), 'the card states the conclusion')
}
// the blocker escape hatch must also open the gate
await callTool('vibe_math_add_proposition', { id: 'p-blocked-ok', 概述: '记录阻塞后可定论', 概率: 0.6, 分类: '数论' }, RF)
await callTool('vibe_math_lean_archive', { kind: 'blocked', target: 'p-blocked-ok', note: '命题涉及未形式化的分析学，本轮不做' }, RF)
await restart(RF)
assert(await runVerifyRound(RF, 'p-blocked-ok', [1, 1]) !== null, 'the blocked object is put to a vote')
assert(await drive(RF, () => existsSync(join(gateProj, 'Verified', '命题', 'p-blocked-ok.md')), 'p-blocked-ok Verified card'), '★ an explicit reasoned blocker also lets the verdict through (decide by difficulty, but decide out loud)')
{
  const card = readIf(join(gateProj, 'Verified', '命题', 'p-blocked-ok.md'))
  assert(/- 形式化: 阻塞（/.test(card), 'the Verified card records the blocker')
  assert(/未形式化的分析学/.test(card), 'and quotes the reason')
}

// ===============================================================
// 8. the reply-channel judgement (formal field in the verifier reply)
// ===============================================================
section('8 the per-round `formal` reply channel records the difficulty judgement')
const RG = makeRoot()
await callTool('vibe_math_new_project', { name: 'lean-reply' }, RG)
await callTool('vibe_math_set_params', Object.assign({}, VPARAMS, { formalVerify: 'require' }), RG)
const replyProj = projRoot('lean-reply')

// (a) blocked WITH a note → recorded, reason reaches the index + the card anchor
await callTool('vibe_math_add_proposition', { id: 'p-reply', 概述: '用回执记录阻塞', 概率: 0.6, 分类: '数论' }, RG)
await callTool('vibe_math_start', {}, RG)
{
  const re = verifyRe('p-reply')
  assert(await drive(RG, () => unfiredVerifiers(RG, re).length >= 2, 'verifiers for r-p-reply'), 'p-reply was put to a vote')
  const vs = unfiredVerifiers(RG, re).slice(0, 2)
  if (vs.length === 2) {
    for (const v of vs) firedChildren.add(v.childId)
    // A verifier that never calls a Lean tool still has to state its difficulty judgement: the
    // JSON reply channel is the path that actually fires in practice.
    fireEnd(vs[0].childId, { Result: 0.5, Reason: '我判断形式化不划算', formal: { target: 'p-reply', decision: 'blocked', note: '需要大量未形式化的实分析前置知识' } })
    await sleep(150)
    const st1 = await callTool('vibe_math_status', {}, RG)
    assert(st1.formal.blocked.indexOf('p-reply') !== -1, 'a `formal.decision=blocked` reply is recorded as a blocker')
    assert(/实分析前置知识/.test(readIf(join(replyProj, 'Formal', 'Index.md'))), 'and its reason reaches the index')
    assert(/- 形式化: 阻塞（/.test(readIf(join(replyProj, 'Propos', '数论', 'p-reply.md'))), 'the reply-recorded blocker also lands on the object card anchor')
    fireEnd(vs[1].childId, { Result: 0.5, Reason: '同上' })
    await sleep(200)
  }
}
// (b) `used` records attempted — which does NOT open the require gate
await restart(RG)
await callTool('vibe_math_add_proposition', { id: 'p-used', 概述: '写了草稿但没跑通', 概率: 0.6, 分类: '数论' }, RG)
{
  const re = verifyRe('p-used')
  assert(await drive(RG, () => unfiredVerifiers(RG, re).length >= 2, 'verifiers for r-p-used'), 'p-used was put to a vote')
  const vs = unfiredVerifiers(RG, re).slice(0, 2)
  if (vs.length === 2) {
    for (const v of vs) firedChildren.add(v.childId)
    fireEnd(vs[0].childId, { Result: 1, Reason: '看起来对', formal: { target: 'p-used', decision: 'used', file: 'Formal/p-used.lean' } })
    await sleep(150)
    const st = await callTool('vibe_math_status', {}, RG)
    const o = st.formal.objects.find((x) => x.target === 'p-used')
    assert(!!o && o.status === 'attempted' && o.file === 'Formal/p-used.lean', 'a `formal.decision=used` reply records the object as attempted with its file')
    fireEnd(vs[1].childId, { Result: 1, Reason: '同样看起来对' })
    await sleep(250)
    assert(!existsSync(join(replyProj, 'Verified', '命题', 'p-used.md')), '★ attempted is NOT passed: the require gate still withholds the verdict')
    assert(/p-used/.test(readIf(join(replyProj, 'Formal', 'TODO.md'))), 'and the object is on the formalization TODO')
  }
}
// (c) a blocker with no note is refused (an explicit decision is required, never a silent skip)
await restart(RG)
await callTool('vibe_math_add_proposition', { id: 'p-nonote', 概述: '没有理由的阻塞', 概率: 0.6, 分类: '数论' }, RG)
{
  const re = verifyRe('p-nonote')
  assert(await drive(RG, () => unfiredVerifiers(RG, re).length >= 2, 'verifiers for r-p-nonote'), 'p-nonote was put to a vote')
  const vs = unfiredVerifiers(RG, re).slice(0, 2)
  if (vs.length === 2) {
    for (const v of vs) firedChildren.add(v.childId)
    fireEnd(vs[0].childId, { Result: 0.5, Reason: '不想做', formal: { target: 'p-nonote', decision: 'blocked' } })
    await sleep(180)
    assert(/未写明 note/.test(readIf(join(replyProj, 'Logs', '形式化.md'))), 'a blocked judgement without a note is refused with an explicit announcement')
    const st = await callTool('vibe_math_status', {}, RG)
    assert(st.formal.objects.every((o) => o.target !== 'p-nonote'), 'and no blocker record is created for the refused judgement')
    // a formal reply without a target must not invent an object (idSafe('') would fall back to 'id')
    fireEnd(vs[1].childId, { Result: 0.5, Reason: '同上', formal: { decision: 'blocked', note: '没有写 target' } })
    await sleep(180)
    const st2 = await callTool('vibe_math_status', {}, RG)
    assert(st2.formal.objects.every((o) => o.target !== 'id' && o.target !== ''), 'a `formal` reply with no target cannot invent an object record')
  }
}
await callTool('vibe_math_abort', {}, RG)

// ===============================================================
// 8b. the §4.1 `defect` channel (contract §4.1 / §6 / §10 items 8-9)
//
// A fidelity defect is NOT "the proposition is false". These are BEHAVIOURAL assertions: a real
// agent reply carrying `formal:{decision:'defect', note}` is fed through the real reply path
// (subagent/end → handleVerifier → absorbFormalReply) and the record, the archived file and the
// formalization TODO are inspected on disk.
// ===============================================================
section('8b a formal.decision=defect reply withdraws the passed proof and withholds the verdict')
const RH = makeRoot()
await callTool('vibe_math_new_project', { name: 'lean-defect' }, RH)
await callTool('vibe_math_set_params', Object.assign({}, VPARAMS, { formalVerify: 'require' }), RH)
const defectProj = projRoot('lean-defect')
await callTool('vibe_math_add_proposition', { id: 'p-defect', 概述: '形式化写窄了的命题', 概率: 0.6, 分类: '数论' }, RH)
{
  const pass = await callTool('vibe_math_lean_archive', { kind: 'proof', target: 'p-defect', content: 'theorem p_defect : 2 + 2 = 4 := by decide\n' }, RH)
  assert(pass.ok === true && pass.passed === true, 'defect: the object starts out Lean-passed')
  assert(existsSync(join(defectProj, 'Verified', 'Lean', 'p-defect.lean')), 'defect: the archived proof is on disk before the fidelity review')
}
await callTool('vibe_math_start', {}, RH)
{
  const re = verifyRe('p-defect')
  assert(await drive(RH, () => unfiredVerifiers(RH, re).length >= 2, 'verifiers for r-p-defect'), 'defect: the Lean-passed object is put to a fidelity review')
  const vs = unfiredVerifiers(RH, re).slice(0, 2)
  if (vs.length === 2) {
    for (const v of vs) firedChildren.add(v.childId)
    assert(/该对象已有\*\*通过的 Lean 形式化证明\*\*/.test(vs[0].prompt) && /不要投 0/.test(vs[0].prompt) && /formal:\{decision:'defect'/.test(vs[0].prompt),
      'defect: the fidelity prompt asks for the defect reply and forbids recording the deviation as 0')
    assert(/本次裁定\*\*不定论\*\*/.test(vs[0].prompt),
      "★ `require` DOES keep the hold clause (the clause is mode-dependent, not deleted)")
    // The defect reply carries an EXTREME Result on purpose: the gate (not the vote value) has to
    // be what withholds the verdict — a defect must never be harvested as "the proposition is false".
    fireEnd(vs[0].childId, { Result: 1, Reason: '逐条核对后认定形式化不忠实', formal: { target: 'p-defect', decision: 'defect', note: 'Lean 代码多加了 h>0 假设，命题原文未要求' } })
    await sleep(240)
    const st = await callTool('vibe_math_status', {}, RH)
    const rec = st.formal.objects.find((o) => o.target === 'p-defect')
    assert(!!rec && rec.status === 'attempted', '★ defect downgrades the formal record to attempted (observed ' + (rec && rec.status) + ')')
    assert(st.formal.passed.indexOf('p-defect') === -1, '★ and the object is no longer reported as Lean-passed')
    assert(!!rec && rec.proof === '', '★ defect clears the `proof` field')
    assert(!existsSync(join(defectProj, 'Verified', 'Lean', 'p-defect.lean')), '★ defect deletes the archived proof Verified/Lean/p-defect.lean')
    assert(existsSync(join(defectProj, 'Formal', 'p-defect.lean')), 'the WORK file Formal/p-defect.lean survives (the code itself is not lost)')
    const persisted = JSON.parse(readIf(join(defectProj, 'State', 'formal.json')))
    assert(persisted.records['p-defect'].decision === 'defect' && /多加了 h>0 假设/.test(persisted.records['p-defect'].note),
      '★ the note (the concrete deviation) is recorded in the persisted formal record')
    assert(/- 形式化: 已尝试未通过/.test(readIf(join(defectProj, 'Propos', '数论', 'p-defect.md'))), 'and the object card anchor is refreshed')
    fireEnd(vs[1].childId, { Result: 1, Reason: '同意：形式化不忠实' })
    await sleep(300)
  }
}
{
  const todo = readIf(join(defectProj, 'Formal', 'TODO.md'))
  assert(/p-defect/.test(todo) && /多加了 h>0 假设/.test(todo), '★ the deviation is written into Formal/TODO.md')
  const idx = readIf(join(defectProj, 'Formal', 'Index.md'))
  assert(/p-defect/.test(idx) && /attempted/.test(idx) && !/Verified\/Lean\/p-defect\.lean/.test(idx), 'Formal/Index.md now shows attempted with no archived proof')
  assert(!existsSync(join(defectProj, 'Verified', '命题', 'p-defect.md')), '★ require after a defect: NO Verified card is written (the verdict is withheld, not turned into "false")')
  const card = readIf(join(defectProj, 'Propos', '数论', 'p-defect.md'))
  assert(/- 状态: 未定论/.test(card), '★ and the object stays 未定论')
  assert(/- 概率: 0.6/.test(card), 'the object keeps its existing probability: a defect must NOT be harvested as a refutation')
  const ann = readIf(join(defectProj, 'Logs', '形式化.md'))
  assert(/忠实性缺陷/.test(ann) && /多加了 h>0 假设/.test(ann), '★ the defect is announced with its concrete deviation')
  assert(ann.indexOf('不是"命题为假"') !== -1, 'the announcement spells out that a fidelity defect is NOT "the proposition is false"')
  const st = await callTool('vibe_math_status', {}, RH)
  assert(st.formal.todo.some((t) => t.id === 'p-defect'), '★ the object is on the formalization TODO (undecided until the formalization is fixed and re-run)')
}
await callTool('vibe_math_abort', {}, RH)

section('8b-2 a defect without a note is refused (the deviation must be auditable)')
const RI = makeRoot()
await callTool('vibe_math_new_project', { name: 'lean-defect-nonote' }, RI)
await callTool('vibe_math_set_params', Object.assign({}, VPARAMS, { formalVerify: 'require' }), RI)
const nonoteProj = projRoot('lean-defect-nonote')
await callTool('vibe_math_add_proposition', { id: 'p-nonote-defect', 概述: '没有偏差说明的缺陷回执', 概率: 0.6, 分类: '数论' }, RI)
await callTool('vibe_math_lean_archive', { kind: 'proof', target: 'p-nonote-defect', content: 'theorem p_nn_defect : 2 + 2 = 4 := by decide\n' }, RI)
await callTool('vibe_math_start', {}, RI)
{
  const re = verifyRe('p-nonote-defect')
  assert(await drive(RI, () => unfiredVerifiers(RI, re).length >= 2, 'verifiers for r-p-nonote-defect'), 'defect: the passed object is put to a fidelity review')
  const vs = unfiredVerifiers(RI, re).slice(0, 2)
  if (vs.length === 2) {
    for (const v of vs) firedChildren.add(v.childId)
    fireEnd(vs[0].childId, { Result: 1, Reason: '觉得不忠实但没写清楚', formal: { target: 'p-nonote-defect', decision: 'defect' } })
    await sleep(240)
    const st = await callTool('vibe_math_status', {}, RI)
    const rec = st.formal.objects.find((o) => o.target === 'p-nonote-defect')
    assert(!!rec && rec.status === 'passed', '★ a defect WITHOUT a note is refused: the object stays Lean-passed (no silent downgrade)')
    assert(existsSync(join(nonoteProj, 'Verified', 'Lean', 'p-nonote-defect.lean')), '★ and the archived proof is NOT deleted')
    assert(st.formal.todo.every((t) => t.id !== 'p-nonote-defect') && !/p-nonote-defect/.test(readIf(join(nonoteProj, 'Formal', 'TODO.md'))),
      'and no bogus formalization-TODO entry is created')
    assert(/未写明 note/.test(readIf(join(nonoteProj, 'Logs', '形式化.md'))), '★ the refusal is announced explicitly')
    fireEnd(vs[1].childId, { Result: 1, Reason: '核对后认为一致' })
    await sleep(300)
  }
}
assert(await drive(RI, () => existsSync(join(nonoteProj, 'Verified', '命题', 'p-nonote-defect.md')), 'Verified card'), 'a refused defect leaves the gate open: the same vote still promotes the object')
// §4.1: the downgrade is unconditional — a `blocked` record loses to a defect too (it needs REDOING,
// not a free pass through the gate, which `blocked` would otherwise grant).
await callTool('vibe_math_add_proposition', { id: 'p-blocked-defect', 概述: '阻塞后仍被认定不忠实', 概率: 0.6, 分类: '数论' }, RI)
await callTool('vibe_math_lean_archive', { kind: 'blocked', target: 'p-blocked-defect', note: '先按难度记为阻塞' }, RI)
await restart(RI)
{
  const re = verifyRe('p-blocked-defect')
  assert(await drive(RI, () => unfiredVerifiers(RI, re).length >= 2, 'verifiers for r-p-blocked-defect'), 'a blocked object is put to a vote (the gate is open for blocked)')
  const vs = unfiredVerifiers(RI, re).slice(0, 2)
  if (vs.length === 2) {
    for (const v of vs) firedChildren.add(v.childId)
    fireEnd(vs[0].childId, { Result: 1, Reason: '形式化与命题不对应', formal: { target: 'p-blocked-defect', decision: 'defect', note: '阻塞所依据的形式化本身写错了对象' } })
    await sleep(240)
    const st = await callTool('vibe_math_status', {}, RI)
    const rec = st.formal.objects.find((o) => o.target === 'p-blocked-defect')
    assert(!!rec && rec.status === 'attempted', '★★ a defect ALWAYS downgrades, even from `blocked` (observed ' + (rec && rec.status) + ')')
    assert(st.formal.blocked.indexOf('p-blocked-defect') === -1 && /阻塞所依据的形式化本身写错了对象/.test(rec.note || ''), 'and the blocked record is replaced by the concrete deviation')
    fireEnd(vs[1].childId, { Result: 1, Reason: '同意，形式化写错了对象' })
    await sleep(280)
  }
}
assert(!existsSync(join(nonoteProj, 'Verified', '命题', 'p-blocked-defect.md')), 'require after a blocked→defect downgrade: still no Verified card (undecided, not "false")')
await callTool('vibe_math_abort', {}, RI)

// ===============================================================
// 8b-3. the withdrawal is not a best-effort delete (contract §4.1)
//
// `Verified/Lean/<id>.lean` is exactly where everyone looks for "the proof of this object", so a
// downgraded record with the old code still sitting there is worse than no record at all. The fs
// service exposes no unlink and `subprocess` is optional, so on a host that cannot delete, the
// withdrawal must fall back to overwriting the file with an explicit notice. This runs in
// `encourage` mode on purpose: the same scenario also proves the injected text and the
// framework's own announcement do NOT promise a hold that only `require` can enforce (§4.1 item 3).
// ===============================================================
section('8b-3 a defect withdraws the archived proof even on a host that cannot delete files')
const RL = makeRoot()
await callTool('vibe_math_new_project', { name: 'lean-defect-nodelete' }, RL)
await callTool('vibe_math_set_params', Object.assign({}, VPARAMS, { formalVerify: 'encourage' }), RL)
const nodeleteProj = projRoot('lean-defect-nodelete')
await callTool('vibe_math_add_proposition', { id: 'p-nodelete', 概述: '宿主无法删除文件时的撤回', 概率: 0.6, 分类: '数论' }, RL)
const proofFile = join(nodeleteProj, 'Verified', 'Lean', 'p-nodelete.lean')
{
  const pass = await callTool('vibe_math_lean_archive', { kind: 'proof', target: 'p-nodelete', content: 'theorem p_nodelete : 2 + 2 = 4 := by decide\n' }, RL)
  assert(pass.ok === true && pass.passed === true && /theorem p_nodelete/.test(readIf(proofFile)),
    'no-delete: the object starts out Lean-passed with its archived proof on disk')
}
await callTool('vibe_math_start', {}, RL)
{
  const re = verifyRe('p-nodelete')
  assert(await drive(RL, () => unfiredVerifiers(RL, re).length >= 2, 'verifiers for r-p-nodelete'), 'no-delete: the Lean-passed object is put to a fidelity review')
  const vs = unfiredVerifiers(RL, re).slice(0, 2)
  if (vs.length === 2) {
    for (const v of vs) firedChildren.add(v.childId)
    assert(/发现任何偏差，不要投 0/.test(vs[0].prompt) && /本档没有门禁/.test(vs[0].prompt) && !/不定论/.test(vs[0].prompt),
      '★ encourage: the fidelity text does NOT claim the framework will withhold the verdict (only require gates; §4.1 item 3)')
    // A host whose shell cannot delete anything: no subprocess service at all. The withdrawal must
    // therefore be observable as an OVERWRITE, not as a missing file.
    subprocessAvailable = false
    fireEnd(vs[0].childId, { Result: 0.5, Reason: '逐条核对后认定形式化不忠实', formal: { target: 'p-nodelete', decision: 'defect', note: 'Lean 里把自然数写成了整数' } })
    await sleep(320)
    subprocessAvailable = true
    const after = readIf(proofFile)
    assert(existsSync(proofFile) && !/theorem p_nodelete/.test(after),
      '★ without a working delete the archived proof text is gone (overwritten, not left readable as a proof)')
    assert(/已撤回（/.test(after) && /Formal\/p-nodelete\.lean/.test(after),
      '★ and it carries the withdrawal notice pointing at the kept working file Formal/p-nodelete.lean')
    const st = await callTool('vibe_math_status', {}, RL)
    const rec = st.formal.objects.find((o) => o.target === 'p-nodelete')
    assert(!!rec && rec.status === 'attempted' && rec.proof === '' && /自然数写成了整数/.test(rec.note || ''),
      '★ the record is still downgraded to attempted with an emptied proof pointer')
    const ann = readIf(join(nodeleteProj, 'Logs', '形式化.md'))
    assert(/忠实性缺陷/.test(ann) && /就地覆盖/.test(ann),
      '★ the announcement says the proof was OVERWRITTEN (not deleted), so the reader knows which withdrawal happened')
    assert(ann.indexOf('不定论') === -1, '★ and `encourage` never claims the framework withheld the verdict')
    const todo = readIf(join(nodeleteProj, 'Formal', 'TODO.md'))
    assert(/# 形式化待办/.test(todo) && /p-nodelete/.test(todo) && !/定论被搁置/.test(todo) && /没有定论门禁/.test(todo),
      '★ Formal/TODO.md states what this mode really does (it does not claim 定论被搁置)')
    const idx = readIf(join(nodeleteProj, 'Formal', 'Index.md'))
    assert(/## 形式化待办/.test(idx) && !/定论被搁置/.test(idx), '★ and Formal/Index.md mirrors that framing')
    fireEnd(vs[1].childId, { Result: 0.5, Reason: '同意，形式化不忠实' })
    await sleep(280)
  }
}
await callTool('vibe_math_abort', {}, RL)

// ===============================================================
// 8b-4. a defect on an ALREADY-verified object must not leave a stale card anchor
//
// `defect` withdraws the formalization (record → attempted, proof pointer cleared, archived file
// deleted/overwritten). A Verified card written earlier still says 「形式化: Lean 通过（Verified/
// Lean/<id>.lean）」 — a pointer to a proof that no longer exists. The gate must not prevent that
// refresh: the gate decides whether a NEW conclusion may be declared, not whether the framework may
// tell the truth about one it already declared.
// ===============================================================
section('8b-4 a later defect refreshes an existing Verified card instead of leaving a stale anchor')
const RM = makeRoot()
await callTool('vibe_math_new_project', { name: 'lean-stale-card' }, RM)
await callTool('vibe_math_set_params', Object.assign({}, VPARAMS, { formalVerify: 'require' }), RM)
const staleProj = projRoot('lean-stale-card')
await callTool('vibe_math_add_proposition', { id: 'p-stale', 概述: '定论后才被认定形式化不忠实', 概率: 0.6, 分类: '数论' }, RM)
await callTool('vibe_math_lean_archive', { kind: 'proof', target: 'p-stale', content: 'theorem p_stale : 2 + 2 = 4 := by decide\n' }, RM)
await callTool('vibe_math_start', {}, RM)
assert(await runVerifyRound(RM, 'p-stale', [1, 1]) !== null, 'stale-card: the Lean-passed proposition was put to a vote')
assert(await drive(RM, () => existsSync(join(staleProj, 'Verified', '命题', 'p-stale.md')), 'p-stale Verified card'), 'stale-card: the gate was satisfied, so it reaches a Verified card')
{
  const card = readIf(join(staleProj, 'Verified', '命题', 'p-stale.md'))
  assert(/- 形式化: Lean 通过/.test(card) && /Verified\/Lean\/p-stale\.lean/.test(card), 'stale-card: the card records the machine-checked strength and its proof path')
}
// A LATER work-round reply (e.g. a solver that reuses the object and finds the Lean statement too
// wide) reports the fidelity defect — long after the card was written.
await callTool('vibe_math_add_problem', { id: 'q-w', description: '让 explorer 起来以便回执一条 defect', priority: 0 }, RM)
await restart(RM)
assert(await drive(RM, () => !!lastSpawn(RM, 'explorer:q-w'), 'explorer:q-w'), 'stale-card: an explorer exists to carry the work-round reply')
fireEnd(lastSpawn(RM, 'explorer:q-w').childId, {
  meta: { kind: 'directions', qid: 'q-w', formal: { target: 'p-stale', decision: 'defect', note: '这份形式化把结论写宽了' },
    directions: [{ id: 'd1', title: '直接法', method: '', core_assumption: '', feasibility: 0.6 }] },
})
assert(await drive(RM, () => !/Lean 通过/.test(readIf(join(staleProj, 'Verified', '命题', 'p-stale.md'))), 'p-stale card refreshed'),
  '★ a defect on an already-verified object refreshes the existing Verified card (no stale 「Lean 通过」 anchor pointing at a withdrawn proof)')
{
  const card = readIf(join(staleProj, 'Verified', '命题', 'p-stale.md'))
  assert(/- 形式化: 已尝试未通过/.test(card), '★ the refreshed card states the honest formal status (已尝试未通过)')
  assert(!/Verified\/Lean\/p-stale\.lean/.test(card), '★ and no longer points at the withdrawn proof')
  assert(/- 结论: 真/.test(card), 'the conclusion itself is untouched — a fidelity defect is not a refutation')
  assert(!existsSync(join(staleProj, 'Verified', 'Lean', 'p-stale.lean')), 'and the archived proof really is gone')
  assert(await drive(RM, () => /p-stale/.test(readIf(join(staleProj, 'Formal', 'TODO.md'))), 'p-stale formalization TODO'), 'the object is on the formalization TODO for redoing')
}
await callTool('vibe_math_abort', {}, RM)

// ===============================================================
// 8c. the injected text obeys the five hard requirements of contract §6
// ===============================================================
section('8c the injected text uses full tool names, Result (not verdict) and the run-before-archive rule')
const RJ = makeRoot()
await callTool('vibe_math_new_project', { name: 'lean-workline' }, RJ)
await callTool('vibe_math_set_params', Object.assign({}, VPARAMS, { formalVerify: 'require' }), RJ)
await callTool('vibe_math_add_problem', { id: 'q-defect', description: '顺手形式化的对象', priority: 0 }, RJ)
const workProj = projRoot('lean-workline')
// a `meta.formal` defect on the WORK-round path (absorbFormalFromReply) must downgrade too
await callTool('vibe_math_lean_archive', { kind: 'proof', target: 'q-defect', content: 'theorem q_defect : 2 + 2 = 4 := by decide\n' }, RJ)
await callTool('vibe_math_start', {}, RJ)
assert(await drive(RJ, () => !!lastSpawn(RJ, 'explorer:q-defect'), 'explorer:q-defect'), 'the explorer for q-defect was spawned')
{
  const p = lastSpawn(RJ, 'explorer:q-defect').prompt
  assert(/归档前先跑通（vibe_math_lean_run 或 run=true）；跑不通的定义不要进可复用库。/.test(p),
    '★ the work-round prompt requires a GREEN run before archiving a reusable definition (§6 hard requirement 3)')
  assert(/"decision":"used\|blocked\|defect"/.test(p), 'the work-round reply contract advertises the defect decision too')
  assert(!/verdict/.test(p) && !/(^|[^a-z_])lean_(run|archive|lib)/.test(p),
    '★ the work-round prompt uses FULL tool names only and never the v4/v5 field name `verdict`')
  fireEnd(lastSpawn(RJ, 'explorer:q-defect').childId, {
    meta: { kind: 'directions', qid: 'q-defect', formal: { target: 'q-defect', decision: 'defect', note: '陈述里的自然数范围被写成了整数' },
      directions: [{ id: 'd1', title: '直接形式化', method: 'Lean', core_assumption: '', feasibility: 0.6 }] },
  })
  await sleep(260)
  const st = await callTool('vibe_math_status', {}, RJ)
  const rec = st.formal.objects.find((o) => o.target === 'q-defect')
  assert(!!rec && rec.status === 'attempted' && /自然数范围被写成了整数/.test(rec.note || ''),
    '★ a `meta.formal` defect from a WORK reply downgrades the record too (absorbFormalFromReply, not just the verifier path)')
  assert(!existsSync(join(workProj, 'Verified', 'Lean', 'q-defect.lean')), '★ and its archived proof is deleted')
}
await callTool('vibe_math_abort', {}, RJ)

section('8c-2 the fidelity branch reaches BOTH the review and the debate prompt, and names Result')
const RK = makeRoot()
await callTool('vibe_math_new_project', { name: 'lean-fidelity' }, RK)
await callTool('vibe_math_set_params', Object.assign({}, VPARAMS, { formalVerify: 'encourage', debateMaxRounds: 2 }), RK)
await callTool('vibe_math_add_proposition', { id: 'p-fid', 概述: '忠实性审查措辞观察对象', 概率: 0.6, 分类: '数论' }, RK)
await callTool('vibe_math_lean_archive', { kind: 'proof', target: 'p-fid', content: 'theorem p_fid : 2 + 2 = 4 := by decide\n' }, RK)
await callTool('vibe_math_start', {}, RK)
const fidBatch = await runVerifyRound(RK, 'p-fid', [0.9, 0.95])
assert(fidBatch !== null, 'fidelity: the review round was asked')
  if (fidBatch) assertDistinctSlots(fidBatch, 'fidelity round')
if (fidBatch) {
  const vp = fidBatch.map((s) => s.prompt).join('\n')
  assert(/一致 → Result = 1/.test(vp), "★ the review prompt states the faithful case as `Result = 1` (v3's REAL reply field, not v4/v5's verdict)")
  assert(/发现任何偏差，不要投 0/.test(vp) && /形式化不合格/.test(vp), '★ and forbids expressing a fidelity defect as 0')
  assert(/formal:\{decision:'defect', note:'<具体偏差>'\}/.test(vp), 'and points at the defect reply field to record it')
  assert(/独立于这份 Lean 代码/.test(vp), 'only an INDEPENDENT refutation may be voted 0')
  assert(/Result/.test(vp) && !/verdict/.test(vp), '★ the voting prompt names Result, never verdict (§6 hard requirement 2)')
  assert(vp.indexOf('偏离 → 0') === -1, '★ no "偏离 → 0" instruction anywhere in the fidelity branch (contract §10 item 9)')
}
assert(await drive(RK, () => wakes.some((w) => w.rootId === RK.id && /交流群/.test(w.prompt)), 'debate prompt'), 'a non-consensus fidelity round moved to the debate')
{
  const dp = wakes.filter((w) => w.rootId === RK.id).map((w) => w.prompt).join('\n')
  assert(/一致 → Result = 1/.test(dp) && /不要投 0/.test(dp), '★ the DEBATE prompt carries the same fidelity wording')
  assert(/Result/.test(dp) && !/verdict/.test(dp), 'the debate prompt names Result, never verdict')
  assert(dp.indexOf('偏离 → 0') === -1, 'the debate prompt also refuses "a deviation is a 0"')
}
await callTool('vibe_math_abort', {}, RK)

// ===============================================================
// 9. reporting + persistence
// ===============================================================
// (d) a plain `used` judgement must NOT withdraw an ESTABLISHED proof (contract §4). Only a
// fidelity defect retracts a proof; `used` just reports "this round touched the formalization".
// v2 shipped the unconditional downgrade here and silently re-closed the require gate.
section('8d a \`used\` reply must NOT downgrade an already-passed object')
await restart(RG)
await callTool('vibe_math_add_proposition', { id: 'p-usedkeep', 概述: '已有通过证明后再写一次 used 回执', 概率: 0.6, 分类: '数论' }, RG)
{
  const pass = await callTool('vibe_math_lean_archive', { kind: 'proof', target: 'p-usedkeep', content: 'theorem p_usedkeep : 2 + 2 = 4 := by decide\n' }, RG)
  assert(pass.ok === true && pass.passed === true, 'used-keep: the object starts out Lean-passed')
  const re = verifyRe('p-usedkeep')
  assert(await drive(RG, () => unfiredVerifiers(RG, re).length >= 2, 'verifiers for r-p-usedkeep'), 'used-keep: the Lean-passed object is put to a fidelity review')
  const vs = unfiredVerifiers(RG, re).slice(0, 2)
  if (vs.length === 2) {
    for (const v of vs) firedChildren.add(v.childId)
    fireEnd(vs[0].childId, { Result: 0.5, Reason: '这一轮只是又写了一遍草稿', formal: { target: 'p-usedkeep', decision: 'used', file: 'Formal/p-usedkeep.lean' } })
    await sleep(150)
    const st = await callTool('vibe_math_status', {}, RG)
    const o = st.formal.objects.find((x) => x.target === 'p-usedkeep')
    assert(!!o && o.status === 'passed', '★ a `used` reply does NOT downgrade an already-passed object (got ' + JSON.stringify(o) + ')')
    assert(st.formal.passed.indexOf('p-usedkeep') !== -1, '★ and status still reports it as Lean-passed (the fidelity branch stays the reviewers\' subject)')
    assert(existsSync(join(replyProj, 'Verified', 'Lean', 'p-usedkeep.lean')), '★ and the archived proof is still on disk by that name')
    fireEnd(vs[1].childId, { Result: 0.5, Reason: '同样只是又写了一遍草稿' })
    await sleep(250)
    assert(!/p-usedkeep/.test(readIf(join(replyProj, 'Formal', 'TODO.md')) || ''), '★ no formal-required TODO was created: the surviving passed still opens the require gate')
    // The same rule covers the RUN path (contract §4): a run attributed to the object may not downgrade it.
    const rerun = await callTool('vibe_math_lean_run', { file: 'Formal/p-usedkeep.lean', target: 'p-usedkeep' }, RG)
    assert(rerun.ok === true, 'used-keep: the object work file runs green (the record assertion below is the point)')
    const o2 = (await callTool('vibe_math_status', {}, RG)).formal.objects.find((x) => x.target === 'p-usedkeep')
    assert(!!o2 && o2.status === 'passed', '★ and the record is still passed')
  }
}

// (e) the same rule for `blocked`: a blocker is a gate-opening record, so a later `used` reply
// must not push the object back to `attempted` and silently re-close the gate (v3 used to preserve
// only `passed` here — v2/v4/v5 preserve both).
await restart(RG)
await callTool('vibe_math_add_proposition', { id: 'p-usedblocked', 概述: '已记录阻塞后再写一次 used 回执', 概率: 0.6, 分类: '数论' }, RG)
{
  const blk = await callTool('vibe_math_lean_archive', { kind: 'blocked', target: 'p-usedblocked', note: '需要大量未形式化的实分析前置知识' }, RG)
  assert(blk.ok === true && blk.status === 'blocked', 'used-blocked: the object starts with an explicit blocker (the gate is open)')
  const re = verifyRe('p-usedblocked')
  assert(await drive(RG, () => unfiredVerifiers(RG, re).length >= 2, 'verifiers for r-p-usedblocked'), 'used-blocked: the object is put to a vote')
  const vs = unfiredVerifiers(RG, re).slice(0, 2)
  if (vs.length === 2) {
    for (const v of vs) firedChildren.add(v.childId)
    fireEnd(vs[0].childId, { Result: 0.5, Reason: '这一轮只是又写了一遍草稿', formal: { target: 'p-usedblocked', decision: 'used', file: 'Formal/p-usedblocked.lean' } })
    await sleep(150)
    const o = (await callTool('vibe_math_status', {}, RG)).formal.objects.find((x) => x.target === 'p-usedblocked')
    assert(!!o && o.status === 'blocked', '★ a `used` reply does not re-close a gate an explicit blocker opened (got ' + JSON.stringify(o) + ')')
    fireEnd(vs[1].childId, { Result: 0.5, Reason: '同上' })
    await sleep(200)
  }
}

section('9 the office can audit formal strength')
{
  const rep = await callTool('vibe_math_report', {}, RF)
  assert(rep.formal && rep.formal.mode === 'require', 'the JSON report carries the formal mode')
  assert(rep.formal.passed.indexOf('p-gate') !== -1 && rep.formal.blocked.indexOf('p-blocked-ok') !== -1, 'the JSON report lists both passed and blocked objects')
  assert(rep.params.formalVerify === 'require' && rep.params.leanCommand === 'lean', 'the readable parameter table carries the Lean parameters')
  const md = readIf(join(gateProj, 'Logs', '报告.md'))
  assert(/## Lean 形式化/.test(md), 'the human-readable report has a Lean formal-verification section')
  assert(/已通过：.*p-gate/.test(md), 'it lists Lean-passed objects')
  assert(/已记录阻塞：.*p-blocked-ok/.test(md), 'it lists blocked objects')
  assert(/可复用库：VibeMath\/Formal\/\{Lib,Proved\}\//.test(md), 'it documents the path layout')
  await callTool('vibe_math_report', {}, RA)
  assert(/未启用（`formalVerify` = off/.test(readIf(join(offProj, 'Logs', '报告.md'))), 'in off mode the report says the feature is not enabled')
  const offRep = await callTool('vibe_math_report', {}, RA)
  assert(offRep.formal.mode === 'off' && /off/.test(offRep.formal.note || ''), 'and the JSON report says the same')
}
{
  const before = JSON.parse(readIf(join(gateProj, 'State', 'formal.json')))
  assert(!!before && !!before.records && before.records['p-gate'] && before.records['p-gate'].status === 'passed', 'the formal record is persisted in State/formal.json, keyed by object id')
  assert(Array.isArray(before.todo), 'the formalization TODO is persisted alongside it')
  assert(before.records['p-blocked-ok'].status === 'blocked' && /分析学/.test(before.records['p-blocked-ok'].note), 'a blocker record keeps its reason across sessions')
  assert(existsSync(join(VIBE, 'Formal', 'Proved', 'Index.md')) && existsSync(join(libPath, 'Index.md')), 'both global indexes are framework-maintained')
}

// ===============================================================
// 9b. Lean 增量 + 异步（spec §1–§4 + 修订 §1–§5）：与 v2 同一套断言强度
// ===============================================================
section('9b Lean 增量 + 异步：参数/argv/队列/去重/只读面/主动性/恢复/卸载')
{
  const H = mod.__testHelpers
  const slash = (s) => String(s == null ? '' : s).replace(/\\/g, '/')
  const SAME = (a, b) => slash(a) === slash(b)
  const formalOf2 = (proj) => JSON.parse(readIf(join(projRoot(proj), 'State', 'formal.json')) || '{}')
  const jobFile = (proj, id) => join(projRoot(proj), 'Formal', 'Jobs', id + '.json')
  const readJob = (proj, id) => JSON.parse(readIf(jobFile(proj, id)) || '{}')
  const vibeCmd = async (rawInput, root) => JSON.parse(await cmdRegs[0].handler({ rawInput, agent: root }))
  const findJob = async (proj, id, states, tries = 100, ms = 60) => {
    for (let i = 0; i < tries; i++) { const r = readJob(proj, id); if (r.state && states.indexOf(r.state) !== -1) return r; await sleep(ms) }
    return undefined
  }

  // ── 参数：默认值/归一化（字符串 'false' 绝不能滑过去）────────────────────────────
  const rp = makeRoot()
  await callTool('vibe_math_new_project', { name: 'lean-async-params' }, rp)
  await callTool('vibe_math_set_params', { leanAsync: true }, rp)
  const bad = await callTool('vibe_math_set_params', { leanAsync: 'false' }, rp)
  assert(bad.params.leanAsync === true, '★★★ leanAsync="false" (a STRING) does not slip through the `else out[k]=v` tail: it falls back to the boolean default')
  const wp = await callTool('vibe_math_set_params', { leanInitiative: 'banana', leanJobsMaxParallel: 0, leanSearchPaths: 'not-an-array' }, rp)
  assert(wp.params.leanInitiative === 'normal', 'leanInitiative rejects an unknown mode back to normal')
  assert(wp.params.leanJobsMaxParallel === 1, 'leanJobsMaxParallel floors at 1 (never 0)')
  assert(Array.isArray(wp.params.leanSearchPaths) && wp.params.leanSearchPaths.length === 0, 'leanSearchPaths rejects a non-array back to []')
  const dd = await callTool('vibe_math_set_params', { leanSearchPaths: ['  /opt/lean-lib  ', '/opt/lean-lib', ''] }, rp)
  assert(JSON.stringify(dd.params.leanSearchPaths) === JSON.stringify(['/opt/lean-lib']), 'leanSearchPaths trims, drops empties and de-duplicates')

  // ── 纯函数：搜索路径计划（修订 §2）与指纹（修订 §4）──────────────────────────────
  const planDefault = H.leanSearchPathPlan([], [], '/root/vm')
  assert(JSON.stringify(planDefault.paths) === JSON.stringify(['/root/vm']) && planDefault.inject.length === 2, '★ the default plan injects exactly the automatic root')
  const planExtra = H.leanSearchPathPlan(['env', 'lean'], ['/a', '/b'], '/root/vm')
  assert(JSON.stringify(planExtra.paths) === JSON.stringify(['/a', '/b', '/root/vm']), '★★ user leanSearchPaths come FIRST, then the automatic root')
  assert(H.leanSearchPathPlan(['--search-path', '/x'], ['/a'], '/root/vm').inject.length === 0 && H.leanSearchPathPlan(['-R', '/x'], ['/a'], '/root/vm').inject.length === 0 && H.leanSearchPathPlan(['--root', '/x'], ['/a'], '/root/vm').inject.length === 0, '★ an explicit --search-path/-R/--root in leanArgs suppresses all injection (user wins)')
  const ctxA = H.leanBuildContext('lean', ['a'], ['/p'])
  const ctxB = H.leanBuildContext('lean', ['b'], ['/p'])
  assert(H.leanJobFingerprint('x\n', ctxA) !== H.leanJobFingerprint('x\n', ctxB), '★ the job fingerprint covers the build context (engine/args/search paths)')

  // ── argv：注入在用户参数之后、文件名之前 ─────────────────────────────────────────
  const ra = makeRoot()
  await callTool('vibe_math_new_project', { name: 'lean-async-argv' }, ra)
  await callTool('vibe_math_set_params', { leanAsync: false, leanCommand: 'lake', leanArgs: ['env', 'lean'] }, ra)
  const projA = projRoot('lean-async-argv')
  mkdirSync(join(projA, 'Formal'), { recursive: true })
  writeFileSync(join(projA, 'Formal', 'srch.lean'), 'theorem t : 1 = 1 := rfl\n', 'utf8')
  const runs0 = leanRuns.length
  await callTool('vibe_math_lean_run', { file: 'Formal/srch.lean' }, ra)
  const argv1 = leanRuns[leanRuns.length - 1].argv
  assert(leanRuns.length === runs0 + 1 && JSON.stringify(argv1.slice(0, 3)) === JSON.stringify(['lake', 'env', 'lean']), 'the user leanArgs are preserved in order (lake env lean)')
  assert(argv1[argv1.length - 2] === '--search-path' && SAME(argv1[argv1.length - 1], VIBE), '★★ --search-path + the VibeMath root are injected AFTER the user args and immediately BEFORE the file (' + JSON.stringify(argv1) + ')')
  await callTool('vibe_math_set_params', { leanArgs: ['env', 'lean', '--search-path', '/explicit'] }, ra)
  await callTool('vibe_math_lean_run', { file: 'Formal/srch.lean' }, ra)
  const argv2 = leanRuns[leanRuns.length - 1].argv
  assert(argv2.filter((x) => x === '--search-path').length === 1 && argv2[4] === '/explicit', '★ an explicit --search-path is respected verbatim (no second injection) — got ' + JSON.stringify(argv2))
  await callTool('vibe_math_set_params', { leanArgs: ['env', 'lean'], leanSearchPaths: ['/extra1', '/extra2'] }, ra)
  await callTool('vibe_math_lean_run', { file: 'Formal/srch.lean' }, ra)
  const argv3 = leanRuns[leanRuns.length - 1].argv
  assert(JSON.stringify(argv3.slice(-6)) === JSON.stringify(['--search-path', '/extra1', '--search-path', '/extra2', '--search-path', slash(VIBE)]), '★★ leanSearchPaths are injected first, then the automatic root (got ' + JSON.stringify(argv3.slice(-6)) + ')')

  // ── 异步状态机：入队立即返回 → 心跳排空 → 只有 settled(ok) 才是通过 ───────────────
  const rq = makeRoot()
  await callTool('vibe_math_new_project', { name: 'lean-async-q' }, rq)
  await callTool('vibe_math_set_params', { leanAsync: true }, rq)
  const projQ = projRoot('lean-async-q')
  mkdirSync(join(projQ, 'Formal'), { recursive: true })
  writeFileSync(join(projQ, 'Formal', 'async-good.lean'), 'theorem t : 1 = 1 := rfl\n', 'utf8')
  writeFileSync(join(projQ, 'Formal', 'async-bad.lean'), 'theorem t : 1 = 2 := by sorry\n', 'utf8')
  const nBefore = leanRuns.length
  const q1 = await callTool('vibe_math_lean_run', { file: 'Formal/async-good.lean', target: 'pAsync' }, rq)
  assert(q1.ok === true && !!q1.async && q1.async.state === 'queued' && typeof q1.async.jobId === 'string', '★★ leanAsync=true returns IMMEDIATELY with {async:{jobId,state:queued}} (got ' + JSON.stringify(q1.async) + ')')
  assert(leanRuns.length === nBefore, '★★ the tool call itself did NOT block on the compiler (enqueued, not run)')
  assert(q1.async.jobId.indexOf('pAsync-') === 0, 'the jobId is <target>-<fingerprint[0:12]> (got ' + q1.async.jobId + ')')
  assert(existsSync(jobFile('lean-async-q', q1.async.jobId)), 'the job record is mirrored to <project>/Formal/Jobs/<jobId>.json')
  const rec0 = readJob('lean-async-q', q1.async.jobId)
  assert(rec0.state === 'queued' && typeof rec0.sha256 === 'string' && typeof rec0.buildSha256 === 'string' && String(rec0.buildContext).length > 0, '★ the job record carries state + content hash + build-context hash')
  assert((formalOf2('lean-async-q').records || {}).pAsync === undefined || formalOf2('lean-async-q').records.pAsync.status !== 'passed', '★★ a queued job never marks the object passed')
  const done1 = await findJob('lean-async-q', q1.async.jobId, ['settled'])
  assert(!!done1, 'the apply-level heartbeat drained the queue and settled the job (got ' + readJob('lean-async-q', q1.async.jobId).state + ')')
  assert(done1 && done1.exitCode === 0, 'the settled record keeps exitCode 0')
  const recAfter = (formalOf2('lean-async-q').records || {}).pAsync
  assert(!!recAfter && recAfter.status === 'attempted' && recAfter.run && recAfter.run.ok === true, 'a green RUN lands as attempted with run.ok=true')
  assert(!!recAfter.async && recAfter.async.state === 'settled' && recAfter.async.jobId === q1.async.jobId, 'the object record carries the async job pointer/state')
  const q2 = await callTool('vibe_math_lean_run', { file: 'Formal/async-bad.lean', target: 'pAsyncBad' }, rq)
  const done2 = await findJob('lean-async-q', q2.async.jobId, ['failed'])
  assert(!!done2 && done2.exitCode === 1, '★ a red async run settles as failed with exitCode 1')
  const recBad = (formalOf2('lean-async-q').records || {}).pAsyncBad
  assert(!!recBad && recBad.status === 'attempted' && recBad.run.ok === false && /sorry/.test(String(recBad.run.stderrTail || '')), '★ a red async run is recorded as attempted with the compiler output kept (never passed)')
  // 归档证明：落地前不是 passed，落地 ok 才写 Verified/Lean/
  const q3 = await callTool('vibe_math_lean_archive', { kind: 'proof', target: 'pAsymProof', content: 'theorem pAsymProof : 1 = 1 := rfl\n' }, rq)
  assert(q3.ok === true && q3.async && q3.async.state === 'queued' && q3.status === 'attempted', '★★ kind=proof in async档 returns queued + attempted (NOT passed)')
  assert(!existsSync(join(projQ, 'Verified', 'Lean', 'pAsymProof.lean')), '★★ the archived proof file does NOT exist while the job is still queued')
  const done3 = await findJob('lean-async-q', q3.async.jobId, ['settled', 'failed'])
  assert(!!done3 && done3.state === 'settled', 'the proof job settled green (got ' + (done3 && done3.state) + ')')
  assert(existsSync(join(projQ, 'Verified', 'Lean', 'pAsymProof.lean')), '★★ only after settled(ok) is Verified/Lean/<id>.lean written')
  assert(((formalOf2('lean-async-q').records || {}).pAsymProof || {}).status === 'passed', '★★ and only then does the object become passed')
  assert(/pAsymProof/.test(readIf(join(projQ, 'Formal', 'Index.md'))), 'the index reflects the passed object')
  // ── lean_job（修订 §3）：清单/单查/waitMs ────────────────────────────────────────
  const listJobs = await callTool('vibe_math_lean_job', {}, rq)
  assert(listJobs.ok === true && Array.isArray(listJobs.jobs) && listJobs.jobs.length >= 3, '★ lean_job without jobId returns the session job list')
  assert(listJobs.jobs.every((j) => !!j.paths && typeof j.paths.receipt === 'string'), 'every listed job carries its receipt path')
  const one = await callTool('vibe_math_lean_job', { jobId: q3.async.jobId }, rq)
  assert(one.ok === true && one.state === 'settled' && one.passed === true && one.paths.archive === 'Verified/Lean/pAsymProof.lean', '★ lean_job {jobId} returns state/exitCode/paths and the passed verdict')
  assert((await callTool('vibe_math_lean_job', { jobId: 'nope-000000000000' }, rq)).code === 'V3_NOT_FOUND', 'an unknown jobId is refused with a typed code')
  const q4 = await callTool('vibe_math_lean_run', { file: 'Formal/async-bad.lean', target: 'pAsyncBad' }, rq)
  const waited = await callTool('vibe_math_lean_job', { jobId: q4.async.jobId, waitMs: 6000 }, rq)
  assert(waited.ok === true && waited.state !== 'queued' && waited.stillRunning === false && waited.waitedMs > 0, '★★ lean_job waitMs>0 waits for the job to leave queued/running (got ' + waited.state + ')')
  assert((await callTool('vibe_math_lean_lib', {}, rq)).paths.searchPath === VIBE.replace(/\\/g, '/'), '★ lean_lib exposes paths.searchPath = the VibeMath root')
  assert(Array.isArray((await callTool('vibe_math_lean_lib', {}, rq)).jobs), '★ lean_lib exposes the job list')

  // ── 超时：leanTimeoutMs 是每个作业的预算，主动 terminate，绝不 passed ─────────────
  const rt = makeRoot()
  await callTool('vibe_math_new_project', { name: 'lean-async-timeout' }, rt)
  await callTool('vibe_math_set_params', { leanAsync: true, leanTimeoutMs: 1000 }, rt)
  const projT = projRoot('lean-async-timeout')
  mkdirSync(join(projT, 'Formal'), { recursive: true })
  writeFileSync(join(projT, 'Formal', 'hang.lean'), '-- HANG\ntheorem t : 1 = 1 := rfl\n', 'utf8')
  const termBefore = terminated.length
  const q5 = await callTool('vibe_math_lean_run', { file: 'Formal/hang.lean', target: 'pHang' }, rt)
  const done5 = await findJob('lean-async-timeout', q5.async.jobId, ['timeout'], 150)
  assert(!!done5 && done5.timedOut === true, '★★ a hanging job times out (state=timeout) with leanTimeoutMs as its budget')
  assert(terminated.length > termBefore, '★★ the timeout ACTIVELY called handle.terminate()')
  assert(((formalOf2('lean-async-timeout').records || {}).pHang || {}).status !== 'passed', '★ a timed-out job never sets passed')

  // ── 并发参数（修订 §5）：leanJobsMaxParallel>1 时两个作业同时进入 running ──────────
  const rc = makeRoot()
  await callTool('vibe_math_new_project', { name: 'lean-async-par' }, rc)
  await callTool('vibe_math_set_params', { leanAsync: true, leanJobsMaxParallel: 2, leanTimeoutMs: 2500 }, rc)
  const projC = projRoot('lean-async-par')
  mkdirSync(join(projC, 'Formal'), { recursive: true })
  writeFileSync(join(projC, 'Formal', 'h1.lean'), '-- HANG\ntheorem h1 : 1 = 1 := rfl\n', 'utf8')
  writeFileSync(join(projC, 'Formal', 'h2.lean'), '-- HANG\ntheorem h2 : 1 = 1 := rfl\n', 'utf8')
  const j1 = await callTool('vibe_math_lean_run', { file: 'Formal/h1.lean', target: 'pH1' }, rc)
  const j2 = await callTool('vibe_math_lean_run', { file: 'Formal/h2.lean', target: 'pH2' }, rc)
  let both = false
  for (let i = 0; i < 120 && !both; i++) {
    const a = readJob('lean-async-par', j1.async.jobId)
    const b = readJob('lean-async-par', j2.async.jobId)
    both = (a.state === 'running' && b.state === 'running')
    if (!both) await sleep(50)
  }
  assert(both, '★★ with leanJobsMaxParallel=2 BOTH queued jobs are in running at the same time (concurrency is a parameter, not a constant)')
  for (const k of [j1, j2]) { try { await callTool('vibe_math_lean_job', { jobId: k.async.jobId, waitMs: 3000 }, rc) } catch (e) { /* ignore */ } }

  // ── 去重（§4.3）+ 构建上下文进指纹（修订 §4）─────────────────────────────────────
  const rd = makeRoot()
  await callTool('vibe_math_new_project', { name: 'lean-async-dedupe' }, rd)
  await callTool('vibe_math_set_params', { leanAsync: true, leanCommand: 'lake', leanArgs: ['env', 'lean'] }, rd)
  const defBody = 'def reusableOne : Nat := 1\n'
  const r1 = await callTool('vibe_math_lean_archive', { kind: 'def', name: 'reusableOne', content: defBody }, rd)
  assert(r1.ok === true && r1.async && r1.deduped === false, 'the first archive of a definition is enqueued (not deduped)')
  await findJob('lean-async-dedupe', r1.async.jobId, ['settled'])
  const runsAfter1 = leanRuns.length
  const r2 = await callTool('vibe_math_lean_archive', { kind: 'def', name: 'reusableOne', content: defBody }, rd)
  assert(r2.ok === true && r2.deduped === true && r2.async === undefined, '★★★ re-archiving identical content is DEDUPED (no job, no recompile)')
  assert(leanRuns.length === runsAfter1, '★★ the deduped archive did NOT recompile')
  await callTool('vibe_math_set_params', { leanArgs: ['env', 'lean', '--threads=2'] }, rd)
  const r5 = await callTool('vibe_math_lean_archive', { kind: 'def', name: 'reusableOne', content: defBody }, rd)
  assert(r5.ok === true && r5.deduped === false && !!r5.async && !!r1.async && r5.async.jobId !== r1.async.jobId, '★★★ the SAME content under a DIFFERENT build context gets a different jobId (not treated as already-verified)')
  if (r5.async) await findJob('lean-async-dedupe', r5.async.jobId, ['settled', 'failed'])
  await callTool('vibe_math_set_params', { leanArgs: ['env', 'lean'] }, rd)
  const changed = defBody + '\n-- 内容变了\n'
  const r3 = await callTool('vibe_math_lean_archive', { kind: 'def', name: 'reusableOne', content: changed }, rd)
  assert(r3.ok === true && r3.deduped === false && !!r3.async, 'a changed body is NOT deduped (content hash differs)')
  if (r3.async) await findJob('lean-async-dedupe', r3.async.jobId, ['settled', 'failed'])
  const r6 = await callTool('vibe_math_lean_archive', { kind: 'def', name: 'reusableOne', content: changed }, rd)
  assert(r6.ok === true && r6.deduped === true, 'and the changed body dedupes on its own (content-based, not "first wins")')

  // ── 崩溃恢复（§2.6 + 修订 §4）：绝不置 passed ────────────────────────────────────
  const rr = makeRoot()
  await callTool('vibe_math_new_project', { name: 'lean-async-recover' }, rr)
  await callTool('vibe_math_set_params', { leanAsync: true }, rr)
  const projR = projRoot('lean-async-recover')
  mkdirSync(join(projR, 'Formal', 'Jobs'), { recursive: true })
  const goodBody = 'theorem recGood : 1 = 1 := rfl\n'
  writeFileSync(join(projR, 'Formal', 'recGood.lean'), goodBody, 'utf8')
  const ctxG = H.leanBuildContext('lean', [], [slash(VIBE)])
  const fpG = H.leanJobFingerprint(goodBody, ctxG)
  const jobIdG = H.leanJobId('pRecGood', fpG)
  writeFileSync(jobFile('lean-async-recover', jobIdG), JSON.stringify({
    jobId: jobIdG, kind: 'archive', state: 'running', attempts: 1, target: 'pRecGood', name: 'pRecGood',
    rel: 'Formal/recGood.lean', scope: 'project', sha256: H.leanContentSha(goodBody), buildSha256: fpG, buildContext: ctxG,
    engine: 'lean', argv: [], searchPaths: [slash(VIBE)], archiveKind: 'proof', enqueuedAt: 1, startedAt: 2, settledAt: 0, exitCode: null,
  }), 'utf8')
  const otherJob = H.leanJobId('pRecOther', H.leanJobFingerprint('theorem other : 1 = 1 := rfl\n', ctxG))
  writeFileSync(jobFile('lean-async-recover', otherJob), JSON.stringify({
    jobId: otherJob, kind: 'archive', state: 'running', attempts: 3, target: 'pRecOther', name: 'pRecOther',
    rel: 'Formal/recMissing.lean', scope: 'project', sha256: H.leanContentSha('theorem other : 1 = 1 := rfl\n'), buildSha256: 'ffffffffffff', buildContext: ctxG,
    engine: 'lean', argv: [], searchPaths: [slash(VIBE)], archiveKind: 'proof', enqueuedAt: 1, startedAt: 2, settledAt: 0, exitCode: null,
  }), 'utf8')
  await callTool('vibe_math_new_project', { name: 'lean-async-recover' }, rr)   // setProject ⇒ recoverLeanJobs()
  const recsR = formalOf2('lean-async-recover').records || {}
  assert((recsR.pRecGood || {}).status === 'attempted', '★★ recovery marks a crashed running job as attempted (never passed)')
  assert((recsR.pRecOther || {}).status === 'attempted', 'recovery marks the hash-mismatched job object as attempted too')
  assert(!existsSync(join(projR, 'Verified', 'Lean', 'pRecGood.lean')), '★ recovery never writes an archived proof for a crashed job')
  const afterG = readJob('lean-async-recover', jobIdG)
  assert(Number(afterG.attempts) === 2 && ['queued', 'running', 'settled'].indexOf(afterG.state) !== -1, '★★ the matching-hash job was re-enqueued with attempts+1 (got ' + JSON.stringify({ state: afterG.state, attempts: afterG.attempts }) + ')')
  const afterO = readJob('lean-async-recover', otherJob)
  assert(afterO.state === 'interrupted' && Number(afterO.attempts) === 3, '★★ the mismatched job is only marked interrupted (NOT re-driven, attempts unchanged)')
  assert(!!(await findJob('lean-async-recover', jobIdG, ['settled'])), 'the re-enqueued job then settles normally on the heartbeat')

  // ── lean_read（§1.2）：只读、路径守卫、64KB 截断 ─────────────────────────────────
  mkdirSync(join(VIBE, 'Formal', 'Lib'), { recursive: true })
  writeFileSync(join(VIBE, 'Formal', 'Lib', 'recGood.lean'), goodBody, 'utf8')
  const rd1 = await callTool('vibe_math_lean_read', { name: 'recGood' }, rr)
  assert(rd1.ok === true && rd1.kind === 'lib' && rd1.sha256 === H.leanContentSha(goodBody) && rd1.truncated === false && rd1.text === goodBody, '★ lean_read returns the archived text + sha256 + bytes for a Lib file')
  assert(rd1.bytes === Buffer.byteLength(goodBody, 'utf8'), 'lean_read reports the byte length (keys=' + Object.keys(rd1).join(',') + ' got ' + JSON.stringify(rd1.bytes) + ' want ' + Buffer.byteLength(goodBody, 'utf8') + ')')
  assert((await callTool('vibe_math_lean_read', { name: 'recGood', kind: 'proved' }, rr)).code === 'V3_NOT_FOUND', 'kind=proved looks only in Formal/Proved')
  for (const badName of ['../etc/passwd', 'a/b', 'C:\\x\\y', '..']) {
    const rbad = await callTool('vibe_math_lean_read', { name: badName }, rr)
    assert(rbad.ok === false && rbad.code === 'V3_INVALID_ARGUMENT', '★ lean_read rejects the path-escape attempt ' + JSON.stringify(badName))
  }
  writeFileSync(join(VIBE, 'Formal', 'Lib', 'bigOne.lean'), '-- ' + 'x'.repeat(70 * 1024) + '\n', 'utf8')
  const rbig = await callTool('vibe_math_lean_read', { name: 'bigOne' }, rr)
  assert(rbig.ok === true && rbig.truncated === true && Buffer.byteLength(rbig.text, 'utf8') <= 64 * 1024, '★ lean_read truncates at 64KB and says so (truncated=true)')
  writeFileSync(join(VIBE, 'Formal', 'Lib', 'depUser.lean'), 'import Formal.Lib.bigOne\n\ndef depUser := 1\n', 'utf8')
  await callTool('vibe_math_lean_lib', {}, rr)
  const libIdx = readIf(join(VIBE, 'Formal', 'Lib', 'Index.md'))
  assert(/Formal\.Lib\.bigOne/.test(libIdx) || /bigOne/.test(libIdx), '★★ the Lib index carries the dependency scanned from import lines (idx=' + String(libIdx).slice(0, 500).replace(/\n/g, ' | ') + ')')

  // ── 主动性档位（修订 §1 + v5 统一）：提示词读 leanInitiative，不是 formalVerify ─────────
  // 第 4 项为 null = "日线完全不出现"；第 6 项是该行的 formalVerify 档（默认 encourage）。
  for (const [mode, rootName, projName, want, notWant, fv] of [
    ['normal', 'lean-init-normal', 'lean-init-normal-proj', /主动性 normal/, null, 'encourage'],
    ['eager', 'lean-init-eager', 'lean-init-eager-proj', /主动档（leanInitiative=eager）/, null, 'encourage'],
    ['off', 'lean-init-off', 'lean-init-off-proj', null, /顺手形式化/, 'encourage'],
    // formalVerify:'off' + eager：日线仍要注入（主动性是独立轴），验证阶段文本仍关闭。
    ['eager', 'lean-init-off-eager', 'lean-init-off-eager-proj', /主动档（leanInitiative=eager）/, /【Lean 形式化验证（/, 'off'],
  ]) {
    const rw = makeRoot()
    await callTool('vibe_math_new_project', { name: projName }, rw)
    await callTool('vibe_math_set_params', Object.assign({}, VPARAMS, { formalVerify: fv || 'encourage', leanInitiative: mode }), rw)
    await callTool('vibe_math_add_problem', { id: 'qInit' + mode + '-' + (fv || 'e'), 陈述: '主动性提示词 ' + mode }, rw)
    await callTool('vibe_math_start', {}, rw)
    const got = await drive(rw, () => spawnOf(rw, 'explorer:').length >= 1 || spawnOf(rw, 'solver:').length >= 1, 'work prompt for ' + mode, 12000)
    const text = promptText(rw)
    const ok4 = want ? want.test(text) : !/顺手形式化/.test(text)
    assert(got && ok4, '★★ leanInitiative=' + mode + (fv === 'off' ? ' (formalVerify:off)' : '') + ' is reflected in the work prompt' + (want ? '' : '：off ⇒ 连"顺手形式化"日线都不出现'))
    if (notWant) assert(!notWant.test(text), 'and the ' + mode + (fv === 'off' ? '/off' : '') + ' work prompt does not carry the verification-phase Lean block (验证要求仍由 formalVerify 表达)')
    if (fv === 'off') assert(text.indexOf('三条筛选判据') !== -1, '★★★ formalVerify:off + eager 仍带完整日线（三条筛选判据在），不是被 off 静默吞掉')
    await callTool('vibe_math_pause', {}, rw)
  }

  // ── 卸载（spec §2.5）：terminate + interrupted，绝不 passed ──────────────────────
  const rz = makeRoot()
  await callTool('vibe_math_new_project', { name: 'lean-async-dispose' }, rz)
  await callTool('vibe_math_set_params', { leanAsync: true, leanTimeoutMs: 60000 }, rz)
  const projZ = projRoot('lean-async-dispose')
  mkdirSync(join(projZ, 'Formal'), { recursive: true })
  writeFileSync(join(projZ, 'Formal', 'orphan.lean'), '-- HANG\ntheorem orphan : 1 = 1 := rfl\n', 'utf8')
  const termZ = terminated.length
  const qz = await callTool('vibe_math_lean_run', { file: 'Formal/orphan.lean', target: 'pOrphan' }, rz)
  const startedZ = await findJob('lean-async-dispose', qz.async.jobId, ['running'])
  assert(!!startedZ, 'the dispose case got a job into running')
  for (const off of disposers) { try { off() } catch (e) { /* ignore */ } }
  assert(terminated.length > termZ, '★★ unmounting the plugin terminated the in-flight compile (no orphan process)')
  assert(((formalOf2('lean-async-dispose').records || {}).pOrphan || {}).status !== 'passed', '★ dispose never marks the object passed')
}

// ===============================================================
// 10. interaction corpus (AUDIT-CHECKLIST §2.4) — a HUMAN must be able to re-read
//     every prompt the framework emitted, not just the assertions about them.
// ===============================================================
// ===============================================================
// 5b. round-2 lens-1 RUNTIME: the initiative axis at EVERY v3 site
// ===============================================================
// Four sites: the three formalDailySection() call sites (explorer / rederive / solver) plus the
// INLINE formalWorkLine() site inside methodKeeperPrompt. (1) formalVerify:'off' + leanInitiative:
// 'eager' must carry the daily line at that site; (2) leanInitiative:'off' must drop it there while
// the verification phase still follows formalVerify. Names carry the site so a single-site
// regression names itself.
const SITE_DAILY = /三条筛选判据/
const SITE_VERIFY = /【Lean 形式化验证（/
async function driveSiteV3(rw, opts, qid) {
  const q = qid
  await callTool('vibe_math_set_params', Object.assign({}, VPARAMS, { methodKeepEvery: 1, maxExplorerRetries: 5 }, opts), rw)
  await callTool('vibe_math_add_problem', { id: q, 陈述: '站点级运行时用例' }, rw)
  await callTool('vibe_math_start', {}, rw)
  const exs = () => spawnOf(rw, 'explorer:' + q)
  await drive(rw, () => exs().length >= 1, 'explorer site ' + q)
  const out = { explorer: (exs()[0] || {}).prompt || '' }
  // answer explorers with directions until the solver appears (v3's fallback scheduler re-derives)
  fireEnd(exs()[0].childId, { meta: { kind: 'directions', qid: q, directions: [{ id: 'd1', title: 'D', method: 'm', core_assumption: '', feasibility: 0.8 }] } })
  for (let guard = 0; guard < 30 && !lastSpawn(rw, 'solver:' + q + ':d1'); guard++) {
    const pend = exs().filter((s) => !firedChildren.has(s.childId)).slice(-1)[0]
    if (pend) { firedChildren.add(pend.childId); fireEnd(pend.childId, { meta: { kind: 'directions', qid: q, directions: [{ id: 'd1', title: 'D', method: 'm', core_assumption: '', feasibility: 0.8 }] } }) }
    await pump(rw); await sleep(80)
  }
  const so = lastSpawn(rw, 'solver:' + q + ':d1')
  out.solver = (so && so.prompt) || ''
  // dead-end + a pending invention: the direction is exhausted (⇒ re-derive) AND the method keeper fires
  if (so) fireEnd(so.childId, { status: 'dead-end', survival_probability: 0.2, dead_end_reason: '站点用例：不可行', new_inventions: [{ 类型: '工具', 标题: '站点工具', 内容描述: 'x', 是否已入库: false }] })
  await drive(rw, () => exs().length >= 2, 'rederive site ' + q)
  out.rederive = (exs()[1] || {}).prompt || ''
  out.distinct = !!out.explorer && !!out.rederive && out.explorer !== out.rederive
  await drive(rw, () => !!lastSpawn(rw, 'method-keeper'), 'method-keeper site ' + q)
  out.methodKeeper = (lastSpawn(rw, 'method-keeper') || {}).prompt || ''
  await callTool('vibe_math_abort', {}, rw)
  return out
}
{
  const re = makeRoot()
  await callTool('vibe_math_new_project', { name: 'site-eager-off' }, re)
  const A = await driveSiteV3(re, { formalVerify: 'off', leanInitiative: 'eager' }, 'qS')
  assert(SITE_DAILY.test(A.explorer), '★ [explorer site] formalVerify:off + leanInitiative:eager injects the daily line')
  assert(SITE_DAILY.test(A.solver), '★ [solver site] formalVerify:off + leanInitiative:eager injects the daily line')
  assert(SITE_DAILY.test(A.rederive), '★ [rederive site] formalVerify:off + leanInitiative:eager injects the daily line')
  assert(SITE_DAILY.test(A.methodKeeper), '★ [methodKeeper site] formalVerify:off + leanInitiative:eager injects the daily line (inline site)')
  assert(A.explorer.indexOf('【Lean 形式化验证（') === -1 && A.solver.indexOf('【Lean 形式化验证（') === -1 && A.rederive.indexOf('【Lean 形式化验证（') === -1 && A.methodKeeper.indexOf('【Lean 形式化验证（') === -1, '★ [all sites] formalVerify:off keeps the verification-phase block closed while eager still injects the daily line')

  const ro = makeRoot()
  await callTool('vibe_math_new_project', { name: 'site-init-off' }, ro)
  const B = await driveSiteV3(ro, { formalVerify: 'encourage', leanInitiative: 'off' }, 'qO')
  assert(!SITE_DAILY.test(B.explorer) && !/【顺手形式化/.test(B.explorer), '★ [explorer site] leanInitiative:off drops the daily line')
  assert(!SITE_DAILY.test(B.solver) && !/【顺手形式化/.test(B.solver), '★ [solver site] leanInitiative:off drops the daily line')
  assert(!SITE_DAILY.test(B.rederive) && !/【顺手形式化/.test(B.rederive), '★ [rederive site] leanInitiative:off drops the daily line')
  assert(!SITE_DAILY.test(B.methodKeeper) && !/【顺手形式化/.test(B.methodKeeper), '★ [methodKeeper site] leanInitiative:off drops the daily line (inline site)')

  // verification phase still follows formalVerify under leanInitiative:'off'
  const rvv = makeRoot()
  await callTool('vibe_math_new_project', { name: 'site-init-off-verify' }, rvv)
  await callTool('vibe_math_set_params', Object.assign({}, VPARAMS, { formalVerify: 'encourage', leanInitiative: 'off' }), rvv)
  await callTool('vibe_math_add_problem', { id: 'qV', 陈述: '验证段仍在' }, rvv)
  await callTool('vibe_math_start', {}, rvv)
  await drive(rvv, () => !!lastSpawn(rvv, 'explorer:qV'), 'explorer qV')
  const exv = lastSpawn(rvv, 'explorer:qV')
  assert(!!exv && !SITE_DAILY.test(exv.prompt || ''), '★ [explorer site] 第二个 root：initiative off 时 explorer 仍无日线')
  if (exv) fireEnd(exv.childId, { meta: { kind: 'directions', qid: 'qV', directions: [{ id: 'd1', title: 'D', method: 'm', core_assumption: '', feasibility: 0.8 }] } })
  for (let guard = 0; guard < 30 && !lastSpawn(rvv, 'solver:qV:d1'); guard++) {
    const pend = spawnOf(rvv, 'explorer:qV').filter((s) => !firedChildren.has(s.childId)).slice(-1)[0]
    if (pend) { firedChildren.add(pend.childId); fireEnd(pend.childId, { meta: { kind: 'directions', qid: 'qV', directions: [{ id: 'd1', title: 'D', method: 'm', core_assumption: '', feasibility: 0.8 }] } }) }
    await pump(rvv); await sleep(80)
  }
  const sovv = lastSpawn(rvv, 'solver:qV:d1')
  if (sovv) fireEnd(sovv.childId, { status: 'success', solution: 'complete solution', survival_probability: 0.9 })
  await drive(rvv, () => spawnOf(rvv, 'verifier:').length >= 1, 'verifier qV')
  const vsp = spawnOf(rvv, 'verifier:')[0]
  assert(!!vsp && SITE_VERIFY.test(vsp.prompt || ''), '★ leanInitiative:off 时验证段仍按 formalVerify 注入（verifier 提示词含【Lean 形式化验证（）')
  await callTool('vibe_math_abort', {}, rvv)
}

// ===============================================================
// 5c. round-2 D4: ONE vote-count source — a mid-verification verifierCount change must not re-derive
//     the in-flight task's quorum from live params (the audit's "same count, different code" bug).
// ===============================================================
section('5c D4 vote count: quorum comes from the task snapshot, not from live params')
{
  const RD4 = makeRoot()
  await callTool('vibe_math_new_project', { name: 'd4-votecount' }, RD4)
  await callTool('vibe_math_set_params', Object.assign({}, VPARAMS, { verifierCount: 2 }), RD4)
  await callTool('vibe_math_add_proposition', { id: 'p-d4', 概述: 'D4 票数单一来源', 概率: 0.6, 分类: '数论' }, RD4)
  await callTool('vibe_math_start', {}, RD4)
  const reD4 = verifyRe('p-d4')
  assert(await drive(RD4, () => unfiredVerifiers(RD4, reD4).length >= 2, 'two verifiers for p-d4'), 'two verifiers were dispatched for p-d4 (the creation-time snapshot)')
  // Mid-verification: the office asks for MORE verifiers. Intent-wise that is a NEW requirement for
  // FUTURE objects; this task's participant set was frozen when it was created.
  await callTool('vibe_math_set_params', Object.assign({}, VPARAMS, { verifierCount: 4 }), RD4)
  await sleep(300)
  // Count PER EXACT rId: the proposition may legitimately have several candidate rIds
  // (r-p-d4, r-p-d4-pf0, …); only the in-flight task for one rId must stay pinned.
  const labels = spawnOf(RD4, 'verifier:').map((x) => x.label)
  const exact = {}
  for (const l of labels) { const m = /^verifier:(r-p-d4):(\d+)$/.exec(l); if (m) exact[m[1]] = (exact[m[1]] || 0) + 1 }
  const inFlight = exact['r-p-d4'] || 0
  assert(inFlight === 2, '★ [D4] raising verifierCount mid-verification does NOT re-staff the in-flight task (participant set = the snapshot；实测 ' + JSON.stringify({ inFlight: inFlight, labels: labels }) + '）')
  // Both dispatched votes satisfy the quorum ⇒ the object must conclude. A view that re-derived its
  // quorum from the live params would demand 4 votes and stall here forever.
  await runVerifyRound(RD4, 'p-d4', [1, 1])
  const cardOf = () => readIf(join(projRoot('d4-votecount'), 'Propos', '数论', 'p-d4.md'))
  const concluded = await drive(RD4, () => { const c = cardOf(); return /-\s*概率:\s*1(\D|$)/.test(c) || /状态:\s*已验证/.test(c) }, 'p-d4 concludes with the two votes it has', 15000)
  assert(concluded, '★★★ [D4] the two dispatched votes still satisfy the quorum and the object concludes (no view may re-derive its quorum from live params；card=' + JSON.stringify(cardOf().slice(0, 220)) + '）')
  await callTool('vibe_math_abort', {}, RD4)
}

section('10 the captured prompt corpus is written for human review')
{
  mkdirSync(CORPUS_DIR, { recursive: true })
  writeFileAtomic(join(CORPUS_DIR, 'formal-verify-v3.json'), JSON.stringify({ entries: corpus }, null, 2))
  const md = ['# V3 形式化验证交互语料（prompt corpus）', '',
    '> 由 `formal-verify-v3.test.mjs` 落盘：框架**真正发出**的每一条提示词原文。路径归一化：工作区 → `<WS>`，',
    '> VibeMath 根 → `<VIBEMATH>`（两者都按正/反斜杠两种写法替换，因此语料是确定性的、可 diff 的、不泄露本机路径）。',
    '> 覆盖：explorer / solver / method-keeper 的日常工作提示词（含「顺手形式化」与"归档前先跑通"），',
    '> `off`（零 Lean 文本）、`encourage`、**`require`** 三档下的表决初评与辩论提示词，`passed` 之后的忠实性审查分支',
    '> （含 `defect` 出口），以及规划提示词。', '']
  for (let i = 0; i < corpus.length; i++) {
    const c = corpus[i]
    md.push('## [' + i + '] ' + c.kind + ' · ' + c.label)
    md.push('')
    md.push('```text')
    md.push(c.prompt)
    md.push('```')
    md.push('')
  }
  writeFileAtomic(join(CORPUS_DIR, 'formal-verify-v3.md'), md.join('\n'))
  assert(existsSync(join(CORPUS_DIR, 'formal-verify-v3.json')) && existsSync(join(CORPUS_DIR, 'formal-verify-v3.md')), 'the prompt corpus was written (JSON + Markdown)')
  assert(corpus.length >= 25, 'the corpus covers the whole run (' + corpus.length + ' prompts)')
  assert(corpus.some((c) => c.label.startsWith('explorer:')) && corpus.some((c) => c.label.startsWith('solver:')) && corpus.some((c) => c.label.startsWith('method-keeper')) && corpus.some((c) => c.label.startsWith('verifier:')), 'the corpus covers every interaction type this suite drives')
  assert(corpus.some((c) => c.kind === 'wake'), 'the corpus also keeps the continuation prompts (debate rounds)')
  // generic sweep over EVERY captured prompt, not spot checks (AUDIT §2.1)
  const dirty = corpus.filter((c) => /\[object Object\]|\bNaN\b|:\s*undefined|["']undefined["']|undefined\s*[,}\]]/.test(c.prompt))
  assert(dirty.length === 0, 'no captured prompt contains placeholder garbage (' + dirty.map((d) => d.label).join(',') + ')')
  const joined = corpus.map((c) => c.prompt).join('\n')
  assert(joined.indexOf(WS) === -1 && joined.indexOf(WS.replace(/\\/g, '/')) === -1, 'every captured prompt normalises the workspace path to <WS> (the corpus stays diffable)')
  assert(joined.indexOf(VIBE) === -1 && joined.indexOf(VIBE.replace(/\\/g, '/')) === -1 && joined.indexOf('<VIBEMATH>') !== -1,
    '★ every captured prompt normalises the VibeMath root to <VIBEMATH> (no machine path leaks into the shipped corpus, contract §10 item 10)')
  assert(!corpus.some((c) => c.root === RA.id && /Lean|形式化/.test(c.prompt)),
    '★ the off-mode prompts captured in the corpus contain ZERO Lean text (off stays a true no-op)')
  // contract §10 item 10: the corpus must cover require AND the work round (not just encourage + fidelity)
  assert(corpus.some((c) => /【Lean 形式化验证（鼓励模式）】/.test(c.prompt)), '★ the corpus covers the encourage-mode verification prompt')
  assert(corpus.some((c) => /【Lean 形式化验证（强制模式）】/.test(c.prompt)), '★ the corpus covers the REQUIRE-mode verification prompt')
  assert(corpus.some((c) => /【顺手形式化（鼓励）】/.test(c.prompt)) && corpus.some((c) => /【顺手形式化（强制）】/.test(c.prompt)), '★ the corpus covers the work-round 顺手形式化 prompt in both modes')
  assert(corpus.some((c) => /一致 → Result = 1/.test(c.prompt)), '★ the corpus keeps the passed/fidelity branch verbatim for human review')
  // contract §6 hard requirements 1-2 + §10 item 9, swept over EVERY captured prompt
  const verifier = corpus.filter((c) => c.label.startsWith('verifier:'))
  assert(verifier.length >= 5 && verifier.every((c) => /Result/.test(c.prompt) && !/verdict/.test(c.prompt)),
    '★ every captured voting prompt names Result and never verdict (§6 hard requirement 2)')
  const bareTools = corpus.filter((c) => /(^|[^a-z_])lean_(run|archive|lib)/.test(c.prompt))
  assert(bareTools.length === 0, '★ no captured prompt abbreviates a Lean tool name (§6 hard requirement 1): ' + bareTools.map((b) => b.label).join(','))
  const zeroDeviation = corpus.filter((c) => c.prompt.indexOf('偏离 → 0') !== -1)
  assert(zeroDeviation.length === 0, '★ no captured prompt turns a fidelity defect into a 0 vote (§6 hard requirement 5 / §10 item 9): ' + zeroDeviation.map((b) => b.label).join(','))
  // Contract §10 item 10 + AUDIT-CHECKLIST §2.4: the shipped corpus must be BYTE-deterministic, so
  // the volatile run metadata the planner brief carries (random plan id, epoch timestamps, child
  // ids, free-slot count) must be normalised out — otherwise every run diffs and the corpus loses
  // its only purpose (human review of what agents actually read).
  const volatile = corpus.filter((c) => /plan-[0-9a-f]{8}/.test(c.label) || /plan-[0-9a-f]{8}|"at": \d{10,}|"childId": "c\d+"|"free_slots": \d+/.test(c.prompt))
  assert(volatile.length === 0, '★ no captured prompt/label keeps volatile run metadata (random plan id / epoch timestamps / child ids / slot count) — the corpus is byte-deterministic: ' + volatile.map((b) => b.label).join(','))
  assert(corpus.some((c) => /"free_slots": <SLOTS>/.test(c.prompt)) && corpus.some((c) => /plan-<ID>/.test(c.label)),
    '★ and the normalisation actually fired (a planner brief and its plan id were captured)')
  // The brief's instant-dependent snapshot is placeholdered, but its CONTRACT (key set + order) and
  // the stable configuration scalars stay, and the instruction text that references the brief is
  // untouched — so the human reviewer still sees the real planner prompt, not a blank.
  const briefEntries = corpus.filter((c) => /CURRENT STATE BRIEF \(JSON\):/.test(c.prompt))
  assert(briefEntries.length >= 3 && briefEntries.every((c) => SNAPSHOT_KEYS.every((k) => c.prompt.indexOf('"' + k + '": "<' + k.toUpperCase() + '>"') !== -1)),
    '★ every captured planner brief keeps all ' + SNAPSHOT_KEYS.length + ' contract keys with canonically placeholdered snapshot values (' + briefEntries.length + ' briefs)')
  assert(briefEntries.every((c) => /"horizon": \d+/.test(c.prompt) && /"free_slots": <SLOTS>/.test(c.prompt) && /"maxParallelThreshold": \d+/.test(c.prompt)),
    '★ the brief keeps its real configuration scalars (horizon / free_slots / maxParallelThreshold), not just placeholders')
  assert(briefEntries.every((c) => /brief\.problems\[\]\.running_solver_dirs and brief\.active_agents/.test(c.prompt) && /ACTION VOCABULARY/.test(c.prompt)),
    '★ and the planner INSTRUCTION text under review (ACTION VOCABULARY + the HARD RULES naming brief fields) is verbatim')
  {
    // Direct witness of the race the normaliser exists for: the two shapes a background tick can
    // produce (explorer registered before vs. after the forced planner read the brief, activity log
    // one entry longer, free slots one lower) must normalise to ONE byte-identical text. Without
    // this the corpus could only be checked by hoping the race fires.
    const briefText = (agents, events, slots, horizon) => 'PERSONA\nCURRENT STATE BRIEF (JSON):\n' + JSON.stringify({
      at: 1759200000000, horizon: horizon, free_slots: slots, maxParallelThreshold: 64,
      problems: [{ id: 'qE', 状态: '求解中', 方向数: agents.length, 活跃方向: agents.length ? ['d1'] : [], running_solver_dirs: [], 最高存活率: agents.length ? 0.7 : null, 解法数: 0 }],
      verify_candidates: agents.length ? [{ rId: 'r-qE', kind: 'problem', target: 'qE', prob: 0.5, priority: 1 }] : [],
      active_agents: agents, methods: [], pending_inventions: 0, last_plan: null, recent_events: events,
    }, null, 2) + '\n\nACTION VOCABULARY:\n- x'
    const withExplorer = briefText([{ childId: 'c7', role: 'explorer', target: 'qE', direction: '', round: '' }],
      [{ at: 1759200000001, event: 'start', detail: 'scheduler started' }, { at: 1759200000002, event: 'explorer', detail: 'problem qE explorer spawned (plan)' }], 63, 5)
    const withoutExplorer = briefText([], [{ at: 1759200000009, event: 'plan', detail: 'planner plan-abcdef12 called with 1 problem(s)' }], 64, 5)
    assert(scrub(withExplorer) === scrub(withoutExplorer),
      '★ the planner-brief normaliser maps the two racing snapshots (explorer present/absent, different activity order and free slots) to ONE byte-identical text')
    assert(scrub(withExplorer) !== withExplorer && /"active_agents": "<ACTIVE_AGENTS>"/.test(scrub(withExplorer)),
      '★ and it really rewrote the snapshot (the test above cannot pass just because nothing was normalised)')
  }
}

console.log('')
console.log('passed=' + passed + ' failed=' + failed)
if (failed) { console.error('FAILURES:'); for (const f of failures) console.error('  - ' + f) }
rmSync(WS, { recursive: true, force: true })
if (failed) process.exit(1)
console.log('ALL GREEN')
process.exit(0)

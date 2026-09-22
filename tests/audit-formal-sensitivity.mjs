// ============================================================
// LEAN FORMAL-VERIFICATION SENSITIVITY PROBES (all four architectures)
//
// The feature contract is `docs/formal-verification.md`. This script proves the four
// `formal-verify-vN.test.mjs` suites are not vacuous: each probe copies that preset's plugin,
// applies ONE targeted mutation that breaks a specific guarantee, and runs the preset's suite
// against the mutated copy. A probe PASSES when the suite goes RED.
//
// Why a separate audit from `audit-v5-sensitivity.mjs`: this feature is implemented
// independently in four single-file plugins, and the guarantee that matters most — "a passing
// Lean run changes WHAT the voters are asked to review" — is the kind of thing a suite can
// quietly stop testing while staying green.
//
// Four false-green traps this script is written to avoid (see AUDIT-CHECKLIST.md §2):
//   1. the probe's own spawn failing (a bad cwd) counted as "the suite went red";
//   2. a suite that ignores its plugin-override env var, so the mutation is never loaded;
//   3. a mutation that does not actually change behaviour (semantically inert);
//   4. a mutation that introduces a syntax error, which is red for the wrong reason.
// (1) and (2) are handled here; (3) is handled by choosing anchors on the deciding branch;
// (4) is handled by `node --check`-ing every mutated copy and failing the probe if it does not
// parse — a syntax error must never be mistaken for a detection.
//
// Run: node tests/audit-formal-sensitivity.mjs
// ============================================================
import { readFileSync, writeFileSync, mkdtempSync, rmSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawn, spawnSync } from 'node:child_process'
import { cpus } from 'node:os'
import { fileURLToPath } from 'node:url'

const REPO = fileURLToPath(new URL('..', import.meta.url))
const dir = mkdtempSync(join(tmpdir(), 'v5-formal-sens-'))

const PLUGINS = {
  // corpusEnv: each suite writes a human-reviewable prompt corpus; concurrent probes of the SAME
  // suite must not race on it, so every probe gets its own corpus dir.
  v2: { file: join(REPO, 'vibe-math-v2', 'vibe-math-v2.js'), suite: 'tests/formal-verify-v2.test.mjs', env: 'V2_PLUGIN', corpusEnv: 'V2_CORPUS_DIR' },
  v3: { file: join(REPO, 'vibe-math-v3', 'vibe-math-v3.js'), suite: 'tests/formal-verify-v3.test.mjs', env: 'V3_PLUGIN', corpusEnv: 'V3_CORPUS_DIR' },
  v4: { file: join(REPO, 'vibe-math-v4', 'vibe-math-v4.js'), suite: 'tests/formal-verify-v4.test.mjs', env: 'V4_PLUGIN', corpusEnv: 'V4_CORPUS_DIR' },
  v5: { file: join(REPO, 'vibe-math-v5', 'vibe-math-v5.js'), suite: 'tests/formal-verify-v5.test.mjs', env: 'V5_PLUGIN', corpusEnv: 'V5_CORPUS_DIR' },
}
const ORIGINAL = {}
for (const [k, v] of Object.entries(PLUGINS)) ORIGINAL[k] = readFileSync(v.file, 'utf8')

// Each probe: { name, preset, guarantee, from, to }
// `from` must occur EXACTLY once, so a mutation can never quietly hit the wrong site.
const probes = [
  // ── v5 ─────────────────────────────────────────────────────────────────────
  { name: 'v5-formal-off-is-not-a-no-op', preset: 'v5',
    guarantee: "off (the default) must be a TRUE no-op: no Lean text, no gate",
    from: "    const formalOn = () => formalMode() !== 'off'",
    to: "    const formalOn = () => true" },
  { name: 'v5-unknown-mode-upgrades', preset: 'v5',
    guarantee: 'an unknown mode must degrade to off, never to a STRONGER mode (a typo must not force formalization)',
    from: "        out.formalVerify = ['off', 'encourage', 'require'].indexOf(out.formalVerify) !== -1 ? out.formalVerify : 'off'",
    to: "        out.formalVerify = ['off', 'encourage', 'require'].indexOf(out.formalVerify) !== -1 ? out.formalVerify : 'require'" },
  { name: 'v5-fidelity-switch-removed', preset: 'v5',
    guarantee: 'a passing Lean run must switch the voting prompt to a FIDELITY review (the whole point of the feature)',
    from: "      if (rec.status === 'passed') {\n        // The whole point of the feature: the review subject CHANGES.",
    to: "      if (false) {\n        // The whole point of the feature: the review subject CHANGES." },
  { name: 'v5-require-gate-removed', preset: 'v5',
    guarantee: 'require mode must withhold a true/false verdict until the object is Lean-passed or explicitly blocked',
    from: "          if (formalMode() === 'require' && !formalGateOk(rec)) {",
    to: "          if (false) {" },
  { name: 'v5-blocked-note-not-required', preset: 'v5',
    guarantee: 'a "we judged it infeasible" record must carry a reason (the difficulty decision is auditable, not silent)',
    from: "        if (!note) return { ok: false, code: 'V5_INVALID_ARGUMENT', message: '阻塞记录必须写明原因（note）",
    to: "        if (false) return { ok: false, code: 'V5_INVALID_ARGUMENT', message: '阻塞记录必须写明原因（note）" },
  { name: 'v5-proof-not-archived-under-verified', preset: 'v5',
    guarantee: "a passing proof must be archived as that object's proof (Verified/Lean/<id>.lean)",
    from: "        if (passed) await writeTextRel('Verified/Lean/' + target + '.lean', body)",
    to: "        if (false) await writeTextRel('Verified/Lean/' + target + '.lean', body)" },
  { name: 'v5-reuse-not-cross-project', preset: 'v5',
    guarantee: 'reuse must be CROSS-PROJECT: reusable definitions go to the global Formal/Lib, not inside one institute',
    from: "        const okWrite = await writeTextAbs(instRootless(rel), body)",
    to: "        const okWrite = await writeTextRel(rel, body)" },
  { name: 'v5-lean-path-guard-naive', preset: 'v5',
    guarantee: 'the Lean path guard must normalise .. (a string prefix check lets a traversal through)',
    from: "      const abs = leanAbsPath(rel)\n      if (abs === null) {",
    to: "      const abs = (rel.charAt(0) === '/' || /^[a-z]:/i.test(rel)) ? rel.replace(/\\\\/g, '/') : instRoot() + '/' + rel\n      if (abs.indexOf(vibeRoot() + '/') !== 0) {" },
  { name: 'v5-lean-run-tool-not-registered', preset: 'v5',
    guarantee: 'the three Lean tools must be registered (agents can only formalize if the tools exist)',
    from: "  registerTool('vibe_v5_lean_run',",
    to: "  if (false) registerTool('vibe_v5_lean_run'," },

  // ── v4 ─────────────────────────────────────────────────────────────────────
  { name: 'v4-formal-off-is-not-a-no-op', preset: 'v4',
    guarantee: "off (the default) must be a TRUE no-op",
    from: "const formalOn=()=>formalMode()!=='off'",
    to: "const formalOn=()=>true" },
  { name: 'v4-unknown-mode-upgrades', preset: 'v4',
    guarantee: 'an unknown mode must degrade to off, never to a STRONGER mode',
    from: "if(k==='formalVerify') return FORMAL_MODES.indexOf(String(v))!==-1?String(v):'off'",
    to: "if(k==='formalVerify') return FORMAL_MODES.indexOf(String(v))!==-1?String(v):'require'" },
  { name: 'v4-fidelity-switch-removed', preset: 'v4',
    guarantee: 'a passing Lean run must switch the verification prompt to a FIDELITY review',
    from: "L.push('    **你不需要重新检查推导**。你的任务是**忠实性审查**：逐条核对 Lean 代码里的')",
    to: "if(false) L.push('    **你不需要重新检查推导**。你的任务是**忠实性审查**：逐条核对 Lean 代码里的')" },
  { name: 'v4-require-gate-removed', preset: 'v4',
    guarantee: 'require mode must withhold a verdict until the object is Lean-passed or explicitly blocked',
    from: "if(formalMode()==='require' && !formalGateOk(rec)) await deferForFormal(vs,allTrue)",
    to: "if(false) await deferForFormal(vs,allTrue)" },
  { name: 'v4-blocked-note-not-required', preset: 'v4',
    guarantee: 'a blocker record must carry a reason',
    from: "if(!note) return {ok:false,code:'V4_INVALID_ARGUMENT',message:'阻塞记录必须写明原因（note）",
    to: "if(false) return {ok:false,code:'V4_INVALID_ARGUMENT',message:'阻塞记录必须写明原因（note）" },
  { name: 'v4-proof-not-archived-under-verified', preset: 'v4',
    guarantee: "a passing proof must be archived as that object's proof",
    from: "if(passed) await writeText('Verified/Lean/'+key+'.lean',got.body)",
    to: "if(false) await writeText('Verified/Lean/'+key+'.lean',got.body)" },
  { name: 'v4-lean-path-guard-naive', preset: 'v4',
    guarantee: 'the Lean path guard must normalise ..',
    from: "const norm=normalizeAbsPath(abs)",
    to: "const norm=abs" },
  { name: 'v4-lean-run-tool-not-registered', preset: 'v4',
    guarantee: 'the three Lean tools must be registered',
    from: "registerTool('vibe_v4_lean_run',",
    to: "if(false) registerTool('vibe_v4_lean_run'," },

  // ── v3 ─────────────────────────────────────────────────────────────────────
  { name: 'v3-formal-off-is-not-a-no-op', preset: 'v3',
    guarantee: "off (the default) must be a TRUE no-op",
    from: "function formalOn() { return formalMode() !== 'off' }",
    to: "function formalOn() { return true }" },
  { name: 'v3-unknown-mode-upgrades', preset: 'v3',
    guarantee: 'an unknown mode must degrade to off, never to a STRONGER mode',
    from: "else if (k === 'formalVerify') { out[k] = (v === 'off' || v === 'encourage' || v === 'require') ? v : 'off' }",
    to: "else if (k === 'formalVerify') { out[k] = (v === 'off' || v === 'encourage' || v === 'require') ? v : 'require' }" },
  { name: 'v3-fidelity-switch-removed', preset: 'v3',
    guarantee: 'a passing Lean run must switch the verification prompt to a FIDELITY review',
    from: "L.push('    **你不需要重新检查推导**。你的任务是**忠实性审查**：逐条核对 Lean 代码里的')",
    to: "if (false) L.push('    **你不需要重新检查推导**。你的任务是**忠实性审查**：逐条核对 Lean 代码里的')" },
  { name: 'v3-require-gate-removed', preset: 'v3',
    guarantee: 'require mode must withhold a verdict until the object is Lean-passed or explicitly blocked',
    from: "function formalBlocksConclusion(target) { return formalMode() === 'require' && !formalGateOk(formalOf(target)) }",
    to: "function formalBlocksConclusion(target) { return false }" },
  { name: 'v3-blocked-note-not-required', preset: 'v3',
    guarantee: 'a blocker record must carry a reason',
    from: "if (!note) return { ok: false, code: 'V3_INVALID_ARGUMENT', message: '阻塞记录必须写明原因（note）",
    to: "if (false) return { ok: false, code: 'V3_INVALID_ARGUMENT', message: '阻塞记录必须写明原因（note）" },
  { name: 'v3-proof-not-archived-under-verified', preset: 'v3',
    guarantee: "a passing proof must be archived as that object's proof",
    from: "if (passed) await writeText('Verified/Lean/' + target + '.lean', body)",
    to: "if (false) await writeText('Verified/Lean/' + target + '.lean', body)" },
  { name: 'v3-lean-path-guard-naive', preset: 'v3',
    guarantee: 'the Lean path guard must normalise ..',
    from: "const norm = normalizeAbsPath(abs)",
    to: "const norm = abs" },
  { name: 'v3-lean-run-tool-handler-unbound', preset: 'v3',
    guarantee: 'the three Lean tools must be registered and dispatched',
    from: ", 'vibe_math_lean_run')",
    to: ", 'vibe_math_lean_run_DISABLED')" },

  // ── v2 ─────────────────────────────────────────────────────────────────────
  { name: 'v2-formal-off-is-not-a-no-op', preset: 'v2',
    guarantee: "off (the default) must be a TRUE no-op",
    from: "function formalOn() { return formalMode() !== 'off' }",
    to: "function formalOn() { return true }" },
  { name: 'v2-unknown-mode-upgrades', preset: 'v2',
    guarantee: 'an unknown mode must degrade to off, never to a STRONGER mode',
    from: "if (out.formalVerify !== undefined && ['off', 'encourage', 'require'].indexOf(String(out.formalVerify)) === -1) out.formalVerify = DEFAULT_PARAMS.formalVerify",
    to: "if (out.formalVerify !== undefined && ['off', 'encourage', 'require'].indexOf(String(out.formalVerify)) === -1) out.formalVerify = 'require'" },
  { name: 'v2-fidelity-switch-removed', preset: 'v2',
    guarantee: 'a passing Lean run must switch the verification prompt to a FIDELITY review',
    from: "L.push('    **你不需要重新检查推导**。你的任务是**忠实性审查**：逐条核对 Lean 代码里的')",
    to: "if (false) L.push('    **你不需要重新检查推导**。你的任务是**忠实性审查**：逐条核对 Lean 代码里的')" },
  // v2 enforces `require` at SEVERAL sites, and they mask each other on purpose (defence in
  // depth): the pre-mutation guard in settleVerdict/processStatusUpdates, and the card-writing
  // choke points writeVerifiedCardIfNeeded / writeVerifiedProblemCardIfNeeded. Removing ONE
  // site is therefore semantically INERT — the others still defer — so a per-site probe would
  // always be green and would report a blind spot that does not exist (AUDIT-CHECKLIST §2.5,
  // "变异必须真的改变行为"). The observable probe is the SHARED predicate that every site
  // consults: `formalRequired()` returning false disables the whole gate.
  { name: 'v2-require-gate-disabled', preset: 'v2',
    guarantee: 'require mode must withhold a true/false verdict (proposition AND problem path) until the object is Lean-passed or explicitly blocked',
    from: "function formalRequired() { return formalMode() === 'require' }",
    to: "function formalRequired() { return false }" },
  { name: 'v2-blocked-note-not-required', preset: 'v2',
    guarantee: 'a blocker record must carry a reason',
    from: "if (!note) return { ok: false, code: 'V2_INVALID_ARGUMENT', message: '阻塞记录必须写明原因（note）",
    to: "if (false) return { ok: false, code: 'V2_INVALID_ARGUMENT', message: '阻塞记录必须写明原因（note）" },
  { name: 'v2-proof-not-archived-under-verified', preset: 'v2',
    guarantee: "a passing proof must be archived as that object's proof",
    from: "if (passed) await writeText('Verified/Lean/' + target + '.lean', body)",
    to: "if (false) await writeText('Verified/Lean/' + target + '.lean', body)" },
  { name: 'v2-lean-path-guard-naive', preset: 'v2',
    guarantee: 'the Lean path guard must normalise ..',
    from: "const norm = normalizeAbsPath(abs)",
    to: "const norm = abs" },
  { name: 'v2-lean-run-tool-handler-unbound', preset: 'v2',
    guarantee: 'the three Lean tools must be registered and dispatched',
    from: ", 'vibe_math_lean_run')",
    to: ", 'vibe_math_lean_run_DISABLED')" },
]

// ── prompt-surface probes (2.3.1) ────────────────────────────────────────────────────────
// "成员读到的文字就是产品" (AUDIT-CHECKLIST §0): the injected text is a contract, so breaking it
// must turn the preset's suite RED. Each probe mutates ONE piece of the text agents actually read.
// `expect` is the number of times that anchor legitimately occurs (v3 declares each reply
// contract twice; v4/v5 document the formal contract in several prompt paths). The probe runner
// reports SETUP-FAIL when a count drifts, so this table is self-checking.
const DEFECT_CONTRACT_COUNT = { v2: 2, v3: 2, v4: 3, v5: 2 }
for (const [tag, pfx] of [['v2', 'vibe_math_'], ['v3', 'vibe_math_'], ['v4', 'vibe_v4_'], ['v5', 'vibe_v5_']]) {
  probes.push(
    { name: tag + '-fidelity-defect-rule-removed', preset: tag, expect: 1,
      guarantee: 'a faithfulness defect must NEVER be expressed as a vote of 0 (= 命题为假); it is a formalisation defect, not a refutation',
      from: '发现任何偏差，不要投 0', to: '发现任何偏离一律投 0' },
    { name: tag + '-abbreviated-tool-name-injected', preset: tag, expect: 1,
      guarantee: 'injected text must use the REGISTERED tool name (an abbreviated lean_archive is not a tool: the agent calls nothing)',
      from: '· ' + pfx + 'lean_archive（归档）', to: '· lean_archive（归档）' },
    { name: tag + '-require-wording-removed', preset: tag, expect: 1,
      guarantee: "the require gate's own wording (mandatory formalisation + the formal-required reason code) must reach the voter",
      from: '**本模式要求**：必须产出 Lean 形式化', to: '**本模式要求**：可以不做形式化' },
    { name: tag + '-defect-decision-not-offered', preset: tag, expect: DEFECT_CONTRACT_COUNT[tag],
      guarantee: 'the reply contract must offer decision=defect (without it a faithfulness defect cannot be recorded at all)',
      from: '"decision":"used|blocked|defect"', to: '"decision":"used|blocked"' },
  )
}

let ok = 0, bad = 0
console.log('-- Lean formal-verification sensitivity probes --')
console.log('(a probe passes when breaking the guarantee turns that preset\'s suite RED)')
console.log('')

// ── timing feedback: per-probe durations so the next run's strategy comes from data ──────
const CONCURRENCY = (() => {
  const arg = process.argv.find((a) => a.startsWith('--concurrency='))
  const env = process.env.PROBE_CONCURRENCY
  const v = Number((arg && arg.split('=')[1]) || env || Math.min(4, cpus().length))
  return Math.max(1, Number.isFinite(v) ? v : 1)
})()
const ONLY = (() => {
  const eq = process.argv.find((a) => a.startsWith('--only='))
  if (eq) return eq.split('=')[1]
  // also accept the space form (`--only v5`), which the usage line advertises
  const i = process.argv.indexOf('--only')
  return i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : ''
})()
const selected = probes.filter((p) => !ONLY || p.name.includes(ONLY) || p.preset === ONLY)
if (process.argv.includes('--list')) {
  for (const p of selected) console.log(p.preset + '  ' + p.name)
  process.exit(0)
}
// A filter that matches nothing must FAIL, not report success: with zero probes the summary below
// would say "0 problems / ALL PROBES RED" — a textbook false green (AUDIT-CHECKLIST §2.5).
if (selected.length === 0) {
  console.error('no probes matched' + (ONLY ? ' --only=' + ONLY : '') + ' — refusing to report success on an empty run')
  process.exit(2)
}

function runAsync(cmd, args, opts) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, opts)
    let out = '', err = ''
    child.stdout.on('data', (d) => { out += d.toString() })
    child.stderr.on('data', (d) => { err += d.toString() })
    child.on('error', (e) => resolve({ status: null, error: e, stdout: out, stderr: err }))
    child.on('close', (status) => resolve({ status, stdout: out, stderr: err }))
  })
}

// One probe = one targeted mutation + one run of that preset's suite. Returns a verdict object;
// never throws, so a single bad probe cannot take the pool down.
async function runProbe(p) {
  const t0 = Date.now()
  const preset = PLUGINS[p.preset]
  const original = ORIGINAL[p.preset]
  const done = (kind, detail) => ({ p, kind, detail, ms: Date.now() - t0 })
  if (p.from.startsWith('PLACEHOLDER_')) return done('setup', 'anchor not filled in yet')
  const want = p.expect === undefined ? 1 : p.expect
  const occurrences = original.split(p.from).length - 1
  if (occurrences !== want) return done('setup', 'anchor matched ' + occurrences + ' times (need exactly ' + want + ')')
  // Mutate EVERY occurrence the anchor was asserted to have. `replace()` would only hit the first
  // one, which silently produced a fake blind spot: the v5 reply contract is emitted in two places
  // (replySpec + the voting prompt), so replacing just one left the other intact and the suite —
  // correctly — stayed green.
  const mutated = want > 1 ? original.split(p.from).join(p.to) : original.replace(p.from, p.to)
  // One directory per probe: the mutated copy AND its corpus output (several suites write a
  // corpus, and concurrent runs of the same suite must not race on that file).
  const pdir = join(dir, p.name)
  mkdirSync(pdir, { recursive: true })
  const file = join(pdir, 'plugin.js')
  writeFileSync(file, mutated, 'utf8')
  // A mutation that does not even parse is red for the WRONG reason.
  const chk = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' })
  if (chk.status !== 0) return done('setup', 'the mutated copy has a syntax error: ' + String(chk.stderr || '').split('\n').slice(0, 4).join(' '))
  const env = Object.assign({}, process.env)
  env[preset.env] = file
  if (preset.corpusEnv) env[preset.corpusEnv] = join(pdir, 'corpus')
  const r = await runAsync(process.execPath, [join(REPO, preset.suite)], { env, encoding: 'utf8', cwd: REPO })
  if (r.status === null) return done('setup', 'the suite could not be started (' + String(r.error && r.error.message) + ')')
  if (r.status !== 0) return done('ok', '')
  return done('blind', '')
}

const results = new Array(selected.length)
let cursor = 0
let finished = 0
const wall0 = Date.now()
async function worker() {
  for (;;) {
    const i = cursor++
    if (i >= selected.length) return
    const res = await runProbe(selected[i])
    results[i] = res
    finished++
    const tag = '[' + String(finished).padStart(2) + '/' + selected.length + ']'
    const secs = (res.ms / 1000).toFixed(1) + 's'
    if (res.kind === 'ok') console.log('  ok - ' + res.p.name + ' [' + res.p.preset + '] => suite went RED as required (' + secs + ')  [' + res.p.guarantee + ']')
    else if (res.kind === 'blind') console.error('  BLIND SPOT ' + tag + ' - ' + res.p.name + ' [' + res.p.preset + '] (' + secs + ') => suite stayed GREEN, so it does NOT detect: ' + res.p.guarantee)
    else console.error('  SETUP-FAIL ' + tag + ' - ' + res.p.name + ' [' + res.p.preset + '] (' + secs + '): ' + res.detail)
  }
}
await Promise.all(Array.from({ length: Math.min(CONCURRENCY, selected.length) }, () => worker()))

// ── timing summary: this is the feedback that decides the next run's strategy ────────────
{
  const wall = (Date.now() - wall0) / 1000
  const sum = results.reduce((a, r) => a + (r ? r.ms : 0), 0) / 1000
  const perPreset = {}
  for (const r of results) {
    if (!r) continue
    perPreset[r.p.preset] = perPreset[r.p.preset] || { n: 0, s: 0 }
    perPreset[r.p.preset].n++
    perPreset[r.p.preset].s += r.ms / 1000
  }
  const slow = results.filter(Boolean).slice().sort((a, b) => b.ms - a.ms).slice(0, 5)
  console.log('')
  console.log('-- timing --')
  console.log('  concurrency ' + CONCURRENCY + '  ·  wall ' + wall.toFixed(1) + 's  ·  sum of probe times ' + sum.toFixed(1) + 's'
    + '  ·  speed-up x' + (sum / Math.max(wall, 0.001)).toFixed(2))
  console.log('  per preset: ' + Object.keys(perPreset).sort().map((k) => k + ' ' + perPreset[k].n + ' probes/' + perPreset[k].s.toFixed(0) + 's').join('  ·  '))
  console.log('  slowest: ' + slow.map((r) => r.p.name + ' ' + (r.ms / 1000).toFixed(1) + 's').join('  ·  '))
  ok = results.filter((r) => r && r.kind === 'ok').length
  bad = results.filter((r) => r && r.kind !== 'ok').length
}

console.log('formal sensitivity: ' + ok + ' probes detected the break, ' + bad + ' problems')
if (bad) process.exit(1)
console.log('ALL FORMAL PROBES RED AS REQUIRED')
process.exit(0)

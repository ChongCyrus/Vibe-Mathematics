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
// Run: node audit-formal-sensitivity.mjs
// ============================================================
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const REPO = fileURLToPath(new URL('.', import.meta.url))
const dir = mkdtempSync(join(tmpdir(), 'v5-formal-sens-'))

const PLUGINS = {
  v2: { file: join(REPO, 'vibe-math-v2', 'vibe-math-v2.js'), suite: 'formal-verify-v2.test.mjs', env: 'V2_PLUGIN' },
  v3: { file: join(REPO, 'vibe-math-v3', 'vibe-math-v3.js'), suite: 'formal-verify-v3.test.mjs', env: 'V3_PLUGIN' },
  v4: { file: join(REPO, 'vibe-math-v4', 'vibe-math-v4.js'), suite: 'formal-verify-v4.test.mjs', env: 'V4_PLUGIN' },
  v5: { file: join(REPO, 'vibe-math-v5', 'vibe-math-v5.js'), suite: 'formal-verify-v5.test.mjs', env: 'V5_PLUGIN' },
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

let ok = 0, bad = 0
console.log('-- Lean formal-verification sensitivity probes --')
console.log('(a probe passes when breaking the guarantee turns that preset\'s suite RED)')
console.log('')

for (const p of probes) {
  const preset = PLUGINS[p.preset]
  const original = ORIGINAL[p.preset]
  if (p.from.startsWith('PLACEHOLDER_')) {
    console.error('  SETUP-FAIL - ' + p.name + ': anchor not filled in yet')
    bad++
    continue
  }
  const occurrences = original.split(p.from).length - 1
  if (occurrences !== 1) {
    console.error('  SETUP-FAIL - ' + p.name + ' [' + p.preset + ']: anchor matched ' + occurrences + ' times (need exactly 1)')
    bad++
    continue
  }
  const mutated = original.replace(p.from, p.to)
  const file = join(dir, p.name + '.js')
  writeFileSync(file, mutated, 'utf8')

  // A mutation that does not even parse is red for the WRONG reason.
  const chk = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' })
  if (chk.status !== 0) {
    console.error('  SETUP-FAIL - ' + p.name + ': the mutated copy has a syntax error:\n' + String(chk.stderr || '').split('\n').slice(0, 4).join('\n'))
    bad++
    continue
  }

  const env = Object.assign({}, process.env)
  env[preset.env] = file
  const r = spawnSync(process.execPath, [join(REPO, preset.suite)], { env, encoding: 'utf8', cwd: REPO })
  if (r.status === null) {
    console.error('  SETUP-FAIL - ' + p.name + ': the suite could not be started (' + String(r.error && r.error.message) + ')')
    bad++
    continue
  }
  if (r.status !== 0) {
    ok++
    console.log('  ok - ' + p.name + ' [' + p.preset + '] => suite went RED as required  [' + p.guarantee + ']')
  } else {
    bad++
    console.error('  BLIND SPOT - ' + p.name + ' [' + p.preset + '] => suite stayed GREEN, so it does NOT detect: ' + p.guarantee)
  }
}

rmSync(dir, { recursive: true, force: true })
console.log('')
console.log('formal sensitivity: ' + ok + ' probes detected the break, ' + bad + ' problems')
if (bad) process.exit(1)
console.log('ALL FORMAL PROBES RED AS REQUIRED')
process.exit(0)

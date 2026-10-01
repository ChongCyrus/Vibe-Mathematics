// ============================================================================================
// math_computation — shared module contract suite (integration owner).
//
// Drives the canonical `math-computation.js` through the fake host seam (tests/helpers/
// math-computation-fake-seam.mjs): no real engine, no real subprocess, runs on any machine.
// Covers the freeze (INTERFACE-FREEZE.md): closed schema, 11 failure codes, argv echo, receipt
// determinism, cli default-on + both disable paths, licence probe, install plan->confirm, timeout,
// truncation, bad-argv-not-collapsed, and the availability/rule prompt text.
//
// Falsifiability: every assertion below fails for a specific mutation; the companion probe
// `tests/audit-math-computation-sensitivity.mjs` mutates a copy of the module and requires THIS
// suite to go red (cli default off / policy ignored / argv echo dropped / bad-argv collapsed /
// timeout timer removed / param renamed).
//
// Usage: node tests/math-computation-shared.test.mjs
// ============================================================================================
import { makeFakeHost } from './helpers/math-computation-fake-seam.mjs'
import { pathToFileURL } from 'node:url'

// The sensitivity probe (tests/audit-math-computation-sensitivity.mjs) points this at a MUTATED copy
// of the module pair; the default is the shipped copy in vibe-math-v2/.
const MODULE = process.env.MATH_COMPUTATION_MODULE
  ? pathToFileURL(process.env.MATH_COMPUTATION_MODULE).href
  : new URL('../vibe-math-v2/math-computation.js', import.meta.url).href
const M = await import(MODULE)

let passed = 0, failed = 0
const failures = []
function ok(cond, label, detail) {
  if (cond) { passed++; return true }
  failed++; failures.push(label + (detail ? ' — ' + detail : ''))
  console.error('  FAIL ' + label + (detail ? ' — ' + detail : ''))
  return false
}
const eq = (a, b, label) => ok(JSON.stringify(a) === JSON.stringify(b), label, 'got ' + JSON.stringify(a) + ' want ' + JSON.stringify(b))

async function withHost(opts, fn) {
  const state = makeFakeHost(opts)
  const reg = M.registerMathComputation(state.host)
  await fn(state, reg)
}

console.log('-- math_computation shared contract --')

// ── 1. freeze: names, codes, defaults, prompt text ─────────────────────────────────────────────
{
  ok(M.MATH_TOOL_NAME === 'math_computation', 'tool name is math_computation')
  eq(M.MATH_PARAM_NAMES, ['mathComputation', 'mathMode', 'mathEngines', 'mathTimeoutMs', 'mathPackages', 'mathInstallScope'], 'six frozen param names in order')
  eq(M.MATH_FAILURE_CODES.length, 11, 'eleven failure codes')
  ok(M.MATH_FAILURE_CODES.indexOf('MATH_ENGINE_BAD_ARGV') !== -1 && M.MATH_FAILURE_CODES.indexOf('MATH_ENGINE_LICENSE_REQUIRED') !== -1, 'canonical codes present')
  ok(M.MATH_PARAM_DEFAULTS.mathMode === 'typed+shell' && M.MATH_PARAM_DEFAULTS.mathComputation === 'auto', 'defaults: auto + typed+shell')
  ok(M.MATH_PARAM_DEFAULTS.mathEngines.indexOf('cli') !== -1, 'cli is in the default engine set (default-on)')
  ok(M.MATH_TOOL_DESCRIPTION.indexOf('computation/<id>/') === -1 && M.MATH_TOOL_DESCRIPTION.indexOf('Computation/<id>/') !== -1, 'description points at the receipt dir')
  ok(M.MATH_TOOL_DESCRIPTION.indexOf('默认开启') !== -1, 'description says cli is on by default')
  ok(M.MATH_TOOL_DESCRIPTION.indexOf('实际 argv') !== -1, 'description mentions the argv echo')
  ok(M.MATH_TOOL_DESCRIPTION.indexOf('mathEngineOverride') !== -1, 'description mentions mathEngineOverride')
  ok(M.MATH_RULE_LINES.some((l) => l.indexOf('①') !== -1 && l.indexOf('③') !== -1), 'rule lines carry the three selection criteria')
  ok(M.MATH_SHELL_RULE_LINE.indexOf(M.MATH_SHELL_FALLBACK_MARK) !== -1, 'shell rule line carries the marking')
  ok(M.MATH_RULE_LINES.every((l) => l.indexOf(M.MATH_SHELL_FALLBACK_MARK) === -1), 'mode-independent rule lines contain NO shell sentence')
  ok(M.MATH_SHELL_FALLBACK_MARK_EN === 'not tool-archived', 'EN marking constant')
}

// ── 2. normalizeMathParams: explicit coercion ──────────────────────────────────────────────────
{
  eq(M.normalizeMathParams({ mathComputation: 'off' }).mathComputation, 'off', 'enum accepted')
  eq(M.normalizeMathParams({ mathComputation: 'nope' }).mathComputation, 'auto', 'bad enum falls back to default')
  eq(M.normalizeMathParams({ mathMode: 'typed' }).mathMode, 'typed', 'mathMode typed accepted')
  eq(M.normalizeMathParams({ mathMode: 'typed+shell' }).mathMode, 'typed+shell', 'mathMode typed+shell accepted')
  eq(M.normalizeMathParams({ mathEngines: ['cli', 'python', 'cli', 'bogus'] }).mathEngines, ['cli', 'python'], 'engine list filtered + deduped, order kept')
  eq(M.normalizeMathParams({ mathEngines: [] }).mathEngines, M.MATH_PARAM_DEFAULTS.mathEngines, 'empty engine list falls back to defaults')
  eq(M.normalizeMathParams({ mathTimeoutMs: '0' }).mathTimeoutMs, 60000, 'non-positive timeout falls back (no silent instant timeout)')
  eq(M.normalizeMathParams({ mathTimeoutMs: 10 }).mathTimeoutMs, 1000, 'timeout clamped to >= 1000')
  eq(M.normalizeMathParams({ mathPackages: ['a', 'a', ''] }).mathPackages, ['a'], 'packages deduped and blanks dropped')
  eq(M.normalizeMathParams({ mathInstallScope: 'system' }).mathInstallScope, 'system', 'system scope accepted when explicit')
  eq(M.normalizeMathParams({ mathInstallScope: 'yes' }).mathInstallScope, 'user', 'bad scope falls back to user')
  eq(M.normalizeMathParams({ nope: 1 }), {}, 'unknown keys are not echoed into params')
}

// ── 3. validateMathArgs: closed schema ─────────────────────────────────────────────────────────
{
  ok(M.validateMathArgs({ op: 'probe', extra: 1 }).ok === false, 'unknown argument rejected')
  ok(M.validateMathArgs({ op: 'nope' }).ok === false, 'unknown op rejected')
  ok(M.validateMathArgs({ op: 'run', mode: 'code' }).ok === false, 'mode=code without code rejected')
  ok(M.validateMathArgs({ op: 'run', mode: 'file', file: '../../etc/passwd' }).code === 'MATH_REFUSED', 'path escape refused at validation')
  ok(M.validateMathArgs({ op: 'run', mode: 'file', file: '/abs/x.py' }).code === 'MATH_REFUSED', 'absolute path refused at validation')
  ok(M.validateMathArgs({ op: 'run', mode: 'expr', expr: '1', engine: 'cli', cli: { command: 'x' } }).code === 'MATH_REFUSED', 'cli + expr refused')
  ok(M.validateMathArgs({ op: 'run', engine: 'cli', mode: 'code', code: 'x' }).code === 'MATH_REFUSED', 'cli without cli{} refused')
  ok(M.validateMathArgs({ op: 'run', engine: 'cli', cli: { command: '/x/y' }, mode: 'code', code: 'z' }, { mathMode: 'typed' }).code === 'MATH_REFUSED', 'cli refused while mathMode=typed')
  ok(M.validateMathArgs({ op: 'run', engine: 'cli', cli: { command: '/x/y' }, mode: 'code', code: 'z' }, { mathEngines: ['python'] }).code === 'MATH_REFUSED', 'cli refused when absent from mathEngines')
  ok(M.validateMathArgs({ op: 'install', packages: [] }).ok === false, 'install without packages rejected')
  ok(M.validateMathArgs({ op: 'run', mode: 'code', code: 'x', timeoutMs: 10 }).ok === false, 'timeoutMs < 1000 rejected')
  ok(M.validateMathArgs({ op: 'run', mode: 'code', code: 'x' }).ok === true, 'minimal run accepted')
  ok(M.validateMathArgs({ op: 'receipt', file: 'Computation/abc/receipt.json' }).ok === true, 'receipt accepted')
}

// ── 4. registration shape ──────────────────────────────────────────────────────────────────────
{
  await withHost({}, async (state) => {
    const r = state.registrations[0]
    ok(!!r, 'register() called exactly once')
    ok(r.name === 'math_computation', 'registered under the frozen tool name')
    ok(r.description === M.MATH_TOOL_DESCRIPTION, 'registered description is the frozen text')
    ok(r.parameters && r.parameters.additionalProperties === false, 'registered schema is closed')
    eq(r.parameters.required, ['op'], 'schema requires op')
    ok(typeof r.handler === 'function', 'registered handler is callable')
  })
}

// ── 5. probe ───────────────────────────────────────────────────────────────────────────────────
{
  await withHost({}, async (state) => {
    const r = await state.call({ op: 'probe' })
    ok(r.ok === true && r.available === true, 'probe finds an installed engine')
    ok(r.engines.length >= 1 && r.engines[0].name === 'python', 'first detected engine is python (order honoured)')
  })
  await withHost({ installed: [] }, async (state) => {
    const r = await state.call({ op: 'probe' })
    ok(r.ok === false && r.code === 'MATH_ENGINE_NOT_FOUND', 'no engine -> ENGINE_NOT_FOUND')
    ok(r.next && r.next.kind === 'user-install' && r.next.command, 'ENGINE_NOT_FOUND carries the per-OS user-install guide')
  })
  await withHost({ packages: { numpy: 'present', sympy: 'missing' } }, async (state) => {
    const r = await state.call({ op: 'probe', packages: ['numpy', 'sympy'] })
    ok(r.ok === true && r.packages.found.numpy === 'present' && r.packages.found.sympy === null, 'package probe reports present/missing')
  })
}

// ── 6. run: code mode, receipt, argv echo, determinism ─────────────────────────────────────────
{
  await withHost({}, async (state) => {
    const r1 = await state.call({ op: 'run', engine: 'python', mode: 'code', code: 'print(1)' })
    ok(r1.ok === true && r1.exit === 0, 'run code succeeds')
    ok(!!r1.receipt && r1.receipt.dir.indexOf('Computation/vibe-math-v2-') === 0, 'receipt dir is Computation/<runId>')
    ok(!!state.file(r1.receipt.dir + '/script.py'), 'script original is on disk')
    ok(state.file(r1.receipt.dir + '/stdout.txt') !== undefined && state.file(r1.receipt.dir + '/stderr.txt') !== undefined, 'full stdout/stderr are on disk')
    const rj = JSON.parse(state.file(r1.receipt.json))
    ok(!!rj.receipt === false && rj.runId === r1.receipt.dir.split('/')[1], 'receipt.json runId matches the directory')
    eq(rj.argv, r1.argv, 'receipt argv === returned argv')
    ok(r1.argv[r1.argv.length - 1].indexOf('script.py') !== -1, 'argv ends with the script path (copy-to-rerun)')
    eq(rj.cwd, 'X:/fake/project', 'cwd is the project root')
    ok(rj.determinism && rj.determinism.noWallClockInId === true, 'receipt declares no wall clock in the id')
    const r2 = await state.call({ op: 'run', engine: 'python', mode: 'code', code: 'print(1)' })
    ok(r2.receipt.dir === r1.receipt.dir, 'same input -> same runId (idempotent directory)')
    const r3 = await state.call({ op: 'run', engine: 'octave', mode: 'code', code: 'print(1)' })
    ok(r3.receipt.dir !== r1.receipt.dir, 'different engine -> different runId')
  })
}

// ── 7. run: file + expr + captureFiles ─────────────────────────────────────────────────────────
{
  await withHost({ files: { 'Problems/calc.py': 'print(2)' } }, async (state) => {
    const r = await state.call({ op: 'run', engine: 'python', mode: 'file', file: 'Problems/calc.py', captureFiles: ['Problems/calc.py'] })
    ok(r.ok === true, 'run file succeeds')
    eq(JSON.parse(state.file(r.receipt.json)).captured, ['Problems/calc.py'], 'captureFiles recorded and copied')
    ok(!!state.file(r.receipt.dir + '/captured/Problems/calc.py'), 'captured file copied into the receipt')
  })
  await withHost({}, async (state) => {
    const r = await state.call({ op: 'run', engine: 'python', mode: 'file', file: '../../../etc/passwd' })
    ok(r.ok === false && r.code === 'MATH_REFUSED', 'file escape refused at run time')
    const r2 = await state.call({ op: 'run', engine: 'python', mode: 'file', file: 'nope.py' })
    ok(r2.ok === false && r2.code === 'MATH_REFUSED', 'missing file refused')
    const r3 = await state.call({ op: 'run', engine: 'python', mode: 'expr', expr: '1+1' })
    ok(r3.ok === true, 'expr mode runs through the eval template')
    const argv = state.spawns[state.spawns.length - 1].argv
    ok(argv[argv.length - 1] === '1+1' && argv.indexOf('-c') !== -1, 'expr occupies exactly one argv element after -c')
  })
}

// ── 8. cli: default-on + both disable paths + receipt ──────────────────────────────────────────
{
  await withHost({}, async (state) => {
    const r = await state.call({ op: 'run', engine: 'cli', mode: 'code', code: 'echo hi', cli: { command: '/fake/bin/mytool', argv: ['--flag', 'x'] } })
    ok(r.ok === true, 'cli runs with DEFAULT params (default-on)')
    eq(r.argv, ['/fake/bin/mytool', '--flag', 'x'], 'cli argv is command + user argv verbatim')
    ok(r.engine === 'cli:/fake/bin/mytool' && r.engineInfo.name === 'cli:/fake/bin/mytool', 'cli is labelled cli:<command> in the shell and engineInfo')
    const rj = JSON.parse(state.file(r.receipt.json))
    ok(rj.engine.name === 'cli:/fake/bin/mytool' && rj.engine.source === 'cli' && rj.cli && rj.cli.argv.length === 2, 'cli receipt records cli:<command>, source=cli and argv')
  })
  await withHost({ params: { mathMode: 'typed' } }, async (state) => {
    const r = await state.call({ op: 'run', engine: 'cli', mode: 'code', code: 'x', cli: { command: '/fake/bin/mytool' } })
    ok(r.ok === false && r.code === 'MATH_REFUSED', 'cli disabled while mathMode=typed')
    ok(!!r.next && r.next.kind === 'reason' && r.next.reason === 'policy', 'policy refusal carries next:{kind:reason, reason:policy}')
    eq(state.spawns.length, 0, 'disabled cli never spawns anything')
  })
  await withHost({ params: { mathEngines: ['python'] } }, async (state) => {
    const r = await state.call({ op: 'run', engine: 'cli', mode: 'code', code: 'x', cli: { command: '/fake/bin/mytool' } })
    ok(r.ok === false && r.code === 'MATH_REFUSED', 'cli disabled when removed from mathEngines')
  })
}

// ── 9. missing packages / licence / commercial install ─────────────────────────────────────────
{
  await withHost({ packages: { sympy: 'missing' } }, async (state) => {
    const r = await state.call({ op: 'run', engine: 'python', mode: 'code', code: 'import sympy', packages: ['sympy'] })
    ok(r.ok === false && r.code === 'MATH_MISSING_PACKAGES', 'missing package -> MISSING_PACKAGES')
    eq(r.missing, ['sympy'], 'missing list reported')
    ok(r.next && r.next.kind === 'agent-install' && r.next.dryRun === true, 'missing package leads to an install PLAN (not an install)')
    ok(state.spawns.every((s) => s.argv.join(' ').indexOf('script.py') === -1), 'the user script was NOT executed when a package is missing')
  })
  await withHost({ licence: false }, async (state) => {
    const r = await state.call({ op: 'run', engine: 'matlab', mode: 'expr', expr: 'disp(1)' })
    ok(r.ok === false && r.code === 'MATH_ENGINE_LICENSE_REQUIRED', 'unlicensed commercial engine -> LICENSE_REQUIRED (not NOT_FOUND)')
    ok(r.next && r.next.kind === 'vendor' && /mathworks/.test(r.next.url || ''), 'vendor link attached, no install plan')
    const i = await state.call({ op: 'install', engine: 'matlab', packages: ['Statistics_Toolbox'] })
    ok(i.ok === false && i.code === 'MATH_REFUSED', 'commercial install always refused')
  })
}

// ── 10. timeout / non-zero / truncation / bad-argv ─────────────────────────────────────────────
{
  await withHost({ hang: true }, async (state) => {
    const r = await state.call({ op: 'run', engine: 'julia', mode: 'code', code: 'sleep(1)', timeoutMs: 1200 })
    ok(r.ok === false && r.code === 'MATH_TIMEOUT', 'hang -> MATH_TIMEOUT')
    ok(r.timedOut === true && !!r.receipt, 'timeout is flagged and still leaves a receipt')
    const rj = JSON.parse(state.file(r.receipt.json))
    ok(rj.timedOut === true && rj.exit === null, 'receipt records timedOut + null exit')
  })
  await withHost({ exit: 3 }, async (state) => {
    const r = await state.call({ op: 'run', engine: 'julia', mode: 'code', code: 'boom' })
    ok(r.ok === false && r.code === 'MATH_NONZERO_EXIT' && r.exit === 3, 'non-zero exit -> NONZERO_EXIT with the code')
  })
  await withHost({ stdoutBytes: 200000 }, async (state) => {
    const r = await state.call({ op: 'run', engine: 'octave', mode: 'code', code: 'x=1' })
    ok(r.ok === true && r.truncated.stdout === true, 'oversized stdout is a WARNING, not a failure')
    ok(r.warnings.length === 1 && r.warnings[0].code === 'OUTPUT_TRUNCATED', 'OUTPUT_TRUNCATED warning present')
    ok(r.stdout.length === M.MATH_CAPS.stdout, 'returned stdout is capped at 64KB')
    ok(state.file(r.receipt.dir + '/stdout.txt').length === 200000, 'full output is on disk')
  })
  await withHost({ argError: "Error, unknown option '-q'" }, async (state) => {
    const r = await state.call({ op: 'run', engine: 'maple', mode: 'code', code: 'x' })
    ok(r.ok === false && r.code === 'MATH_ENGINE_BAD_ARGV', 'usage/option error -> MATH_ENGINE_BAD_ARGV (not collapsed into NONZERO_EXIT)')
    ok(r.next && r.next.kind === 'engine-override' && r.next.hint === 'mathEngineOverride', 'next points at mathEngineOverride')
    eq(r.next.argv, r.argv, 'the failing argv is echoed in next.argv')
    ok(r.message.indexOf('mathEngineOverride') !== -1, 'message mentions the override escape hatch')
  })
  await withHost({ resolveThrows: true }, async (state) => {
    const r = await state.call({ op: 'run', engine: 'python', mode: 'code', code: 'x' })
    ok(r.ok === false && r.code === 'MATH_ENGINE_NOT_FOUND', 'unresolvable executable -> ENGINE_NOT_FOUND (no crash)')
  })
}

// ── 11. receipt op (idempotent re-render) ──────────────────────────────────────────────────────
{
  await withHost({}, async (state) => {
    const r = await state.call({ op: 'run', engine: 'python', mode: 'code', code: 'print(1)' })
    const before = state.file(r.receipt.md)
    const again = await state.call({ op: 'receipt', file: r.receipt.dir })
    ok(again.ok === true, 'op=receipt re-renders an existing receipt')
    ok(state.file(r.receipt.md) === before, 're-render is idempotent (same bytes)')
    const miss = await state.call({ op: 'receipt', file: 'Computation/nope' })
    ok(miss.ok === false && miss.code === 'MATH_INVALID_ARGUMENT', 'missing receipt reported')
  })
}

// ── 12. install: plan -> confirm, scope, audit ─────────────────────────────────────────────────
{
  await withHost({}, async (state) => {
    const plan = await state.call({ op: 'install', engine: 'python', packages: ['sympy'] })
    ok(plan.ok === true && !!plan.planToken, 'install returns a plan + planToken')
    ok(plan.plan.scope === 'user', 'plan defaults to user scope')
    ok(plan.plan.commands[0].argv.indexOf('--user') !== -1, 'user scope uses the --user template')
    eq(state.spawns.length, 0, 'planning spawns nothing (never auto-install)')
    const wrong = await state.call({ op: 'install', engine: 'python', packages: ['sympy'], confirm: 'deadbeef' })
    ok(wrong.ok === false && wrong.code === 'MATH_REFUSED', 'confirm with a mismatched token is refused')
    const done = await state.call({ op: 'install', engine: 'python', packages: ['sympy'], confirm: plan.planToken })
    ok(done.ok === true && done.executed === true, 'confirm with the plan token executes')
    const audit = JSON.parse(state.file(done.audit))
    ok(audit.scope === 'user' && audit.installed[0] === 'sympy' && audit.rollback.commands.length === 1, 'audit records scope, installed list and an uninstall command')
    ok(audit.network === 'not-enforced-by-plugin', 'audit is honest about network enforcement')
    const plan2 = await state.call({ op: 'install', engine: 'python', packages: ['numpy'] })
    ok(plan2.plan.scope === 'user', 'scope is NOT remembered: a later call is user again')
    const sys = await state.call({ op: 'install', engine: 'python', packages: ['numpy'], scope: 'system' })
    ok(sys.plan.scope === 'system', 'system scope only when explicitly requested per call')
    const rSys = await state.call({ op: 'install', engine: 'r', packages: ['MASS'], scope: 'system' })
    ok(rSys.ok === false && rSys.code === 'MATH_REFUSED', 'system scope refused when the manager has no system template')
  })
}

// ── 13. tier off + availability line ───────────────────────────────────────────────────────────
{
  await withHost({ params: { mathComputation: 'off' } }, async (state) => {
    const r = await state.call({ op: 'run', engine: 'python', mode: 'code', code: 'x' })
    ok(r.ok === false && r.code === 'MATH_NOT_AVAILABLE', 'mathComputation=off is a true no-op')
    ok(r.next && r.next.kind === 'enable', 'off tier tells the caller how to enable it')
    eq(state.spawns.length, 0, 'off tier spawns nothing')
  })
  const probe = { ok: true, engines: [{ name: 'python', version: '1.2.3' }], available: true }
  const zh = M.mathAvailabilityLine(probe, 'zh', 'typed+shell')
  const typed = M.mathAvailabilityLine(probe, 'zh', 'typed')
  const en = M.mathAvailabilityLine(probe, 'en', 'typed+shell')
  ok(zh.indexOf('先 probe 再 run') !== -1 && zh.indexOf(M.MATH_SHELL_FALLBACK_MARK) !== -1, 'zh availability line: probe-first + shell marking')
  ok(typed.indexOf(M.MATH_SHELL_FALLBACK_MARK) === -1, 'typed tier drops the shell-fallback sentence')
  ok(en.indexOf(M.MATH_SHELL_FALLBACK_MARK_EN) !== -1 && en.indexOf('not tool-archived') !== -1, 'en availability line carries the marking')
}

// ── 14. no-subprocess matrix (adjudication c) ───────────────────────────────────────────────────
{
  await withHost({ hasSubprocess: false }, async (state) => {
    const r = await state.call({ op: 'run', engine: 'python', mode: 'code', code: 'x' })
    ok(r.ok === false && r.code === 'MATH_NO_SUBPROCESS', 'host that declares no subprocess -> MATH_NO_SUBPROCESS (not ENGINE_NOT_FOUND)')
    ok(r.next && r.next.kind === 'note', 'no-subprocess carries the note next')
    const p = await state.call({ op: 'probe' })
    ok(p.ok === false && p.code === 'MATH_NO_SUBPROCESS', 'op=probe also reports NO_SUBPROCESS on such a host')
  })
  await withHost({ resolveThrows: true }, async (state) => {
    const r = await state.call({ op: 'run', engine: 'python', mode: 'code', code: 'x' })
    ok(r.ok === false && r.code === 'MATH_ENGINE_NOT_FOUND', 'without the flag, an unresolvable host still reports ENGINE_NOT_FOUND + install guide')
  })
}

console.log('')
console.log('=== MATH COMPUTATION SHARED: ' + passed + ' passed, ' + failed + ' failed ===')
if (failures.length) for (const f of failures) console.error('  - ' + f)
process.exit(failed === 0 ? 0 : 1)

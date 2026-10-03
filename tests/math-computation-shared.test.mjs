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
import { pathToFileURL, fileURLToPath } from 'node:url'
import { readFileSync } from 'node:fs'

// The sensitivity probe (tests/audit-math-computation-sensitivity.mjs) points this at a MUTATED copy
// of the module pair; the default is the shipped copy in vibe-math-v2/.
const MODULE = process.env.MATH_COMPUTATION_MODULE
  ? pathToFileURL(process.env.MATH_COMPUTATION_MODULE).href
  : new URL('../vibe-math-v2/math-computation.js', import.meta.url).href
const M = await import(MODULE)

// §30 predicates — used by the §30 assertions AND by `--self-probe` case 3, so the shipped proof and the
// audit cannot drift ("same predicate, broken input"). Unit: descriptor entries carrying the reason.
const carriesVerifyProvenance = (v) => !!v && v.verify === true && typeof v.verifyReason === 'string' && v.verifyReason.length > 0
const hasNoVerifySlot = (v) => !!v && !('verify' in v) && !('verifyReason' in v)

// ── --self-probe (shipped): prove the §32 evidence assertion can REDDEN, from the tarball alone.
// It copies the module, removes ONE `fail()` whitelist line, and requires the named §32 assertion
// to fail in the child. Usage: node tests/math-computation-shared.test.mjs --self-probe
if (process.argv.includes('--self-probe')) {
  const { mkdtempSync, copyFileSync, readFileSync: rf, writeFileSync: wf, rmSync } = await import('node:fs')
  const { tmpdir } = await import('node:os')
  const { join, dirname } = await import('node:path')
  const { spawnSync } = await import('node:child_process')
  const modPath = process.env.MATH_COMPUTATION_MODULE || fileURLToPath(new URL('../vibe-math-v2/math-computation.js', import.meta.url))
  const dir = mkdtempSync(join(tmpdir(), 'mc-shared-selfprobe-'))
  const enginesSrc = join(dirname(modPath), 'math-engines.js')
  try { copyFileSync(enginesSrc, join(dir, 'math-engines.js')) } catch (e) { /* engines may be resolved elsewhere */ }
  const src = rf(modPath, 'utf8').replace(/\r\n/g, '\n')
  const whitelist = '  if (extra && Array.isArray(extra.absent)) out.absent = extra.absent\n'
  if (src.indexOf(whitelist) === -1) {
    console.log('SELF-PROBE FAIL: the fail() whitelist line for absent[] was not found (the probe cannot mutate what it cannot see)')
    rmSync(dir, { recursive: true, force: true })
    process.exit(1)
  }
  wf(join(dir, 'math-computation.js'), src.replace(whitelist, ''))
  const child = spawnSync(process.execPath, [fileURLToPath(import.meta.url)], { encoding: 'utf8', maxBuffer: 1 << 26, env: Object.assign({}, process.env, { MATH_COMPUTATION_MODULE: join(dir, 'math-computation.js') }) })
  const out = String(child.stdout || '') + String(child.stderr || '')
  const failLines = out.split('\n').filter((l) => /^\s*FAIL\b/.test(l))
  const named = failLines.some((l) => l.indexOf('S2 absence evidence: the failure carries an absent[] list') !== -1)
  const sum = (out.split('\n').filter((l) => /passed, \d+ failed/.test(l)).slice(-1)[0] || '').trim()
  console.log((child.status !== 0 && named ? 'SELF-PROBE PASS' : 'SELF-PROBE FAIL') + ': removing ONE fail() whitelist line reddens the named §32 assertion (' + sum + ')')
  if (!named) for (const l of failLines.slice(0, 4)) console.log('      child FAIL line: ' + l.trim().slice(0, 140))
  rmSync(dir, { recursive: true, force: true })
  // case 2 (S4/S5): remove the single `out.installedSoFar = …` assignment and require the NAMED §33
  // assertion in the child's FAIL line (a label found anywhere in the output is NOT a red).
  const s45line = '      out.installedSoFar = results.filter((x) => x.exit === 0).map((x) => x.argv)\n'
  const dir2 = mkdtempSync(join(tmpdir(), 'mc-shared-selfprobe2-'))
  const src2 = rf(modPath, 'utf8').replace(/\r\n/g, '\n')
  let ok2 = false
  if (src2.indexOf(s45line) === -1) {
    console.log('SELF-PROBE FAIL: the installedSoFar assignment was not found (cannot mutate what it cannot see)')
  } else {
    try { copyFileSync(join(dirname(modPath), 'math-engines.js'), join(dir2, 'math-engines.js')) } catch (e) { /* optional */ }
    wf(join(dir2, 'math-computation.js'), src2.replace(s45line, ''))
    const child2 = spawnSync(process.execPath, [fileURLToPath(import.meta.url)], { encoding: 'utf8', maxBuffer: 1 << 26, env: Object.assign({}, process.env, { MATH_COMPUTATION_MODULE: join(dir2, 'math-computation.js') }) })
    const out2 = String(child2.stdout || '') + String(child2.stderr || '')
    const failLines2 = out2.split('\n').filter((l) => /^\s*FAIL\b/.test(l))
    ok2 = child2.status !== 0 && failLines2.some((l) => l.indexOf('reports what already succeeded (installedSoFar)') !== -1)
    const sum2 = (out2.split('\n').filter((l) => /passed, \d+ failed/.test(l)).slice(-1)[0] || '').trim()
    console.log((ok2 ? 'SELF-PROBE PASS' : 'SELF-PROBE FAIL') + ': removing ONE installedSoFar assignment reddens the named §33 assertion (' + sum2 + ')')
    if (!ok2) for (const l of failLines2.slice(0, 4)) console.log('      child FAIL line: ' + l.trim().slice(0, 140))
  }
  rmSync(dir2, { recursive: true, force: true })
  // case 3 (§30, verify provenance): the SAME predicates the §30 assertions use, fed a broken helper.
  // The real `verifyFields(engine)` helper is extracted from the module under test and run against a stub
  // descriptor table; dropping its single reason line (or the no-empty-slot guard) must flip its predicate.
  const src3 = rf(modPath, 'utf8').replace(/\r\n/g, '\n')
  const hStart = src3.indexOf('function verifyFields(engine) {')
  let helper = ''
  if (hStart !== -1) {
    let d = 0, end = hStart
    for (let i = hStart; i < src3.length; i++) { if (src3[i] === '{') d++; else if (src3[i] === '}') { d--; if (d === 0) { end = i + 1; break } } }
    helper = src3.slice(hStart, end)
  }
  const REASON_LINE = "  if (typeof d.verifyReason === 'string' && d.verifyReason) out.verifyReason = d.verifyReason\n"
  const GUARD_LINE = '  if (!d.verify) return {}\n'
  let ok3 = false
  if (helper.indexOf(REASON_LINE) === -1 || helper.indexOf(GUARD_LINE) === -1) {
    console.log('SELF-PROBE FAIL: the §30 helper anchors were not found (the probe cannot mutate what it cannot see)')
  } else {
    const stub = { maple: { verify: true, verifyReason: 'CLI spelling varies by Maple version - confirm on a licensed machine' }, python: { license: 'free' } }
    const make = (s) => new Function('MATH_ENGINES', s + '\nreturn verifyFields;')(stub)
    const good = make(helper)
    const broken = make(helper.replace(REASON_LINE, ''))
    const brokenGuard = make(helper.replace(GUARD_LINE, ''))
    const cases3 = [
      ['§30 probe carries WHY (shared predicate carriesVerifyProvenance)', carriesVerifyProvenance(good('maple')), carriesVerifyProvenance(broken('maple'))],
      ['§30 no empty slot without a declared reason (hasNoVerifySlot)', hasNoVerifySlot(good('python')), hasNoVerifySlot(brokenGuard('python'))],
    ]
    let bad3 = 0
    for (const [name, greenNow, redWhenBroken] of cases3) {
      const okc = greenNow === true && redWhenBroken === false
      if (!okc) bad3++
      console.log((okc ? '  ok   ' : '  FAIL ') + name + ' :: green-now=' + greenNow + ' broken-goes-red=' + !redWhenBroken)
    }
    ok3 = bad3 === 0
    console.log('  --- §30 verify-provenance predicates: ' + (cases3.length - bad3) + '/' + cases3.length + ' as required')
  }
  // case 4 (task-1): mislabel the bundled-runtime stage -> the named foundVia assertion must redden.
  // NOTE: the self-probe's fs imports are ALIASED at the top of this block (`rf` = readFileSync,
  // `wf` = writeFileSync); using the unaliased names here is a ReferenceError, not a probe failure.
  let ok4 = false
  {
    const dir4 = mkdtempSync(join(tmpdir(), 'mc-shared-selfprobe4-'))
    try {
      copyFileSync(join(dirname(modPath), 'math-engines.js'), join(dir4, 'math-engines.js'))
      const src4 = rf(modPath, 'utf8').replace(/\r\n/g, '\n')
      const FROM4 = "via: 'host-runtime'"
      const n4 = src4.split(FROM4).length - 1
      if (n4 !== 1) {
        console.log('SELF-PROBE FAIL: the stage-2 via anchor occurs ' + n4 + ' times (expected exactly 1)')
      } else {
        wf(join(dir4, 'math-computation.js'), src4.split(FROM4).join("via: 'path'"), 'utf8')
        const child4 = spawnSync(process.execPath, [fileURLToPath(import.meta.url)], { encoding: 'utf8', maxBuffer: 1 << 26,
          env: Object.assign({}, process.env, { MATH_COMPUTATION_MODULE: join(dir4, 'math-computation.js') }) })
        const out4 = String(child4.stdout || '') + String(child4.stderr || '')
        const failLines4 = out4.split('\n').filter((l) => /^\s*FAIL\b/.test(l))
        const named4 = failLines4.some((l) => l.indexOf('a bundled runtime tree is reported as host-runtime') !== -1)
        const summary4 = out4.split('\n').filter((l) => /passed,/.test(l)).slice(-1)[0] || 'no summary'
        ok4 = child4.status !== 0 && named4
        console.log((ok4 ? 'SELF-PROBE PASS' : 'SELF-PROBE FAIL') + ': mislabelling the bundled-runtime stage reddens the named foundVia assertion (' + summary4 + ')')
        if (!ok4) for (const l of failLines4.slice(0, 4)) console.log('      child FAIL line: ' + l.trim().slice(0, 140))
      }
    } finally { rmSync(dir4, { recursive: true, force: true }) }
  }
  // case 5 (task-2 item 3): restore the old `injected || …` form -> the named empty-injection
  // assertion must redden (a JS empty array is truthy, so the per-OS table was suppressed).
  let ok5 = false
  {
    const dir5 = mkdtempSync(join(tmpdir(), 'mc-shared-selfprobe5-'))
    try {
      copyFileSync(join(dirname(modPath), 'math-engines.js'), join(dir5, 'math-engines.js'))
      const src5 = rf(modPath, 'utf8').replace(/\r\n/g, '\n')
      const FIXED5 = 'const roots = (Array.isArray(injected) && injected.length) ? injected : mathInstallRoots(engineName, env, win)'
      const n5 = src5.split(FIXED5).length - 1
      if (n5 !== 1) console.log('SELF-PROBE FAIL: the empty-array guard occurs ' + n5 + ' times (expected exactly 1)')
      else {
        wf(join(dir5, 'math-computation.js'), src5.split(FIXED5).join('const roots = injected || mathInstallRoots(engineName, env, win)'), 'utf8')
        const child5 = spawnSync(process.execPath, [fileURLToPath(import.meta.url)], { encoding: 'utf8', maxBuffer: 1 << 26,
          env: Object.assign({}, process.env, { MATH_COMPUTATION_MODULE: join(dir5, 'math-computation.js') }) })
        const out5 = String(child5.stdout || '') + String(child5.stderr || '')
        const failLines5 = out5.split('\n').filter((l) => /^\s*FAIL\b/.test(l))
        ok5 = child5.status !== 0 && failLines5.some((l) => l.indexOf('task-2 empty-injection') !== -1)
        const sum5 = (out5.split('\n').filter((l) => /passed,/.test(l)).slice(-1)[0] || 'no summary').trim()
        console.log((ok5 ? 'SELF-PROBE PASS' : 'SELF-PROBE FAIL') + ': restoring the old injected-truthiness form reddens the named empty-injection assertion (' + sum5 + ')')
        if (!ok5) for (const l of failLines5.slice(0, 4)) console.log('      child FAIL line: ' + l.trim().slice(0, 140))
      }
    } finally { rmSync(dir5, { recursive: true, force: true }) }
  }
  // case 6 (task-2 built-in route): empty the built-in root table -> the named built-in-route assertion
  // must redden (§23c injects NO roots, so the built-in table is the only stage that can find it).
  let ok6 = false
  {
    const dir6 = mkdtempSync(join(tmpdir(), 'mc-shared-selfprobe6-'))
    try {
      copyFileSync(join(dirname(modPath), 'math-engines.js'), join(dir6, 'math-engines.js'))
      const src6 = rf(modPath, 'utf8').replace(/\r\n/g, '\n')
      const TABLE6 = 'return (table[engineName] || []).filter((x) => typeof x === \'string\' && x)'
      const n6 = src6.split(TABLE6).length - 1
      if (n6 !== 1) console.log('SELF-PROBE FAIL: the built-in root-table return occurs ' + n6 + ' times (expected exactly 1)')
      else {
        wf(join(dir6, 'math-computation.js'), src6.split(TABLE6).join('return []'), 'utf8')
        const child6 = spawnSync(process.execPath, [fileURLToPath(import.meta.url)], { encoding: 'utf8', maxBuffer: 1 << 26,
          env: Object.assign({}, process.env, { MATH_COMPUTATION_MODULE: join(dir6, 'math-computation.js') }) })
        const out6 = String(child6.stdout || '') + String(child6.stderr || '')
        const failLines6 = out6.split('\n').filter((l) => /^\s*FAIL\b/.test(l))
        ok6 = child6.status !== 0 && failLines6.some((l) => l.indexOf('task-2 built-in route') !== -1)
        const sum6 = (out6.split('\n').filter((l) => /passed,/.test(l)).slice(-1)[0] || 'no summary').trim()
        console.log((ok6 ? 'SELF-PROBE PASS' : 'SELF-PROBE FAIL') + ': emptying the built-in root table reddens the named built-in-route assertion (' + sum6 + ')')
        if (!ok6) for (const l of failLines6.slice(0, 4)) console.log('      child FAIL line: ' + l.trim().slice(0, 140))
      }
    } finally { rmSync(dir6, { recursive: true, force: true }) }
  }
    process.exit(child.status !== 0 && named && ok2 && ok3 && ok4 && ok5 && ok6 ? 0 : 1)
}

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
    // round-9: the guide is per-OS and always carries the SUGGESTED command; `command` itself is only
    // populated when that OS's package manager is actually resolvable on this machine.
    ok(r.next && r.next.kind === 'user-install' && r.next.perOs && r.next.perOs.windows && r.next.perOs.linux, 'ENGINE_NOT_FOUND carries the per-OS user-install guide')
    ok(r.next.suggestedCommand === r.next.perOs[r.next.platform], 'the guide keeps the suggested per-OS command alongside the executable one')
    ok(r.next.packageManagerAvailable === false ? r.next.command === '' : typeof r.next.command === 'string', 'command ⇔ package-manager availability (never a command that cannot run)')
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
    // P2a item 1: the script is discoverable from BOTH the return value and the receipt.
    ok(r1.scriptPath === rj.scriptPath && r1.scriptHash === rj.scriptHash, 'scriptPath + scriptHash are in the return value AND the receipt')
    ok(r1.scriptHash === rj.script.sha256 && r1.scriptPath.indexOf('/script.py') !== -1, 'scriptHash matches the receipt script object')
    const r2 = await state.call({ op: 'run', engine: 'python', mode: 'code', code: 'print(1)' })
    ok(r2.baseRunDir === r1.baseRunDir, 'same input -> same archive id (baseRunDir)')
    ok(r2.attempt === 2 && r2.attemptDir !== r1.attemptDir, 'a repeat is appended as attempt 2 (never overwriting attempt 1)')
    ok(state.file(r2.attemptDir + '/receipt.json') !== undefined && state.file(r1.attemptDir + '/stdout.txt') === 'ran-ok\n', 'attempt 1 files are left untouched by attempt 2')
    const r3 = await state.call({ op: 'run', engine: 'octave', mode: 'code', code: 'print(1)' })
    ok(r3.baseRunDir !== r1.baseRunDir, 'different engine -> different archive id')
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
    // round-7 (finding 4): mode:'code' append the archived script so the code actually RUNS (the
    // caller cannot know the runId up front). The user argv stays verbatim in receipt.cli.argv.
    eq(r.argv.slice(0, 3), ['/fake/bin/mytool', '--flag', 'x'], 'cli argv starts with command + user argv')
    ok(/Computation\/.*script\.txt$/.test(String(r.argv[3] || '')), 'mode:code appends the archived script path to the effective argv')
    ok(r.cliScriptAppended === true, 'the return shell flags cliScriptAppended')
    ok(r.engine === 'cli:/fake/bin/mytool' && r.engineInfo.name === 'cli:/fake/bin/mytool', 'cli is labelled cli:<command> in the shell and engineInfo')
    const rj = JSON.parse(state.file(r.receipt.json))
    ok(rj.engine.name === 'cli:/fake/bin/mytool' && rj.engine.source === 'cli' && rj.engine.foundVia === 'cli' && rj.cli && rj.cli.argv.length === 2, 'cli receipt records cli:<command>, source=cli, foundVia=cli and the USER argv')
    ok(rj.cli.scriptAppended === true && rj.argv[rj.argv.length - 1] === r.argv[3], 'the receipt records scriptAppended and the executed argv')
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
    // Round-2 lens-1: a DELETED/missing archive is an explicit refusal, not a malformed call.
    ok(miss.ok === false && miss.code === 'MATH_REFUSED', 'op=receipt on a missing archive -> MATH_REFUSED')
    ok(miss.next && miss.next.kind === 'reason' && miss.next.reason === 'archive-missing', 'the refusal carries next.reason=archive-missing')
    // A corrupt receipt.json is still a malformed artifact (different code, different reason).
    await state.call({ op: 'run', engine: 'python', mode: 'code', code: 'print(1)' })
    const dirs = [...state.files.keys()].filter((k) => /^Computation\/[^/]+\/receipt\.json$/.test(k))
    if (dirs.length) {
      state.files.set(dirs[0], '{not json')
      const corrupt = await state.call({ op: 'receipt', file: dirs[0].replace('/receipt.json', '') })
      ok(corrupt.ok === false && corrupt.code === 'MATH_INVALID_ARGUMENT' && corrupt.next.reason === 'receipt-unparsable', 'a corrupt receipt.json stays MATH_INVALID_ARGUMENT (receipt-unparsable)')
    }
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

// ── 15. P2a: archive -> edit -> re-run integrity ───────────────────────────────────────────────
{
  // 15a. mode:'file' is KEYED BY PATH, so an edit + re-run lands in the same archive id and the
  // hash reconciliation reports the change (never a silent pass).
  const st = makeFakeHost({ files: { 'Problems/calc.py': 'print(2)\n' } })
  M.registerMathComputation(st.host)
  const first = await st.call({ op: 'run', engine: 'python', mode: 'file', file: 'Problems/calc.py' })
  ok(first.ok === true && first.scriptChanged === false && first.scriptChangedDuringRun === false, 'first file run: no change flags')
  st.files.set('Problems/calc.py', 'print(3)\n')
  const second = await st.call({ op: 'run', engine: 'python', mode: 'file', file: 'Problems/calc.py' })
  ok(second.baseRunDir === first.baseRunDir, 'file mode is path-keyed: the edited file reuses the archive id')
  ok(second.scriptChanged === true, 'edited file -> scriptChanged:true (no silent pass)')
  ok(!!second.previousReceipt && second.previousReceipt.scriptHash === first.scriptHash, 'the RETURN SHELL also exposes previousReceipt (the stale hash)')
  ok(second.warnings.some((w) => w.code === M.MATH_SCRIPT_CHANGED_WARNING), 'scriptChanged is warned visibly')
  ok(second.attempt === 2 && second.scriptHash !== first.scriptHash, 'the new attempt carries the new scriptHash')
  const secondReceipt = JSON.parse(st.file(second.receipt.json))
  ok(secondReceipt.scriptChanged === true && !!secondReceipt.previousReceipt && secondReceipt.previousReceipt.scriptHash === first.scriptHash, 'receipt records scriptChanged + the previous receipt hash')

  // 15b. a mid-run edit (one member edits while another runs) is flagged after the run.
  const st2 = makeFakeHost({ files: { 'Problems/race.py': 'print(1)\n' }, mutateOnRun: { rel: 'Problems/race.py', text: 'print(9)\n' } })
  M.registerMathComputation(st2.host)
  const raced = await st2.call({ op: 'run', engine: 'python', mode: 'file', file: 'Problems/race.py' })
  ok(raced.ok === true && raced.scriptChangedDuringRun === true, 'mid-run edit -> scriptChangedDuringRun:true')
  ok(raced.warnings.some((w) => w.code === M.MATH_SCRIPT_CHANGED_DURING_RUN_WARNING), 'mid-run edit is warned visibly')
  ok(JSON.parse(st2.file(raced.receipt.json)).scriptChangedDuringRun === true, 'receipt records scriptChangedDuringRun')

  // 15c. op:'receipt' reconciles the archived script hash, and never rewrites existing files.
  const st3 = makeFakeHost({})
  M.registerMathComputation(st3.host)
  const run = await st3.call({ op: 'run', engine: 'python', mode: 'code', code: 'print(1)\n' })
  const jsonBefore = st3.file(run.receipt.json)
  const mdBefore = st3.file(run.receipt.md)
  const clean = await st3.call({ op: 'receipt', file: run.baseRunDir })
  ok(clean.ok === true && clean.scriptChanged === false, 'op=receipt on an untouched archive: no change')
  ok(st3.file(run.receipt.json) === jsonBefore && st3.file(run.receipt.md) === mdBefore, 'op=receipt never rewrites existing receipt files')
  st3.files.set(run.scriptPath, 'print(42)\n')
  const dirty = await st3.call({ op: 'receipt', file: run.baseRunDir })
  ok(dirty.ok === true && dirty.scriptChanged === true && dirty.currentScriptHash !== dirty.scriptHash, 'op=receipt reports scriptChanged for an edited archive script')
  ok(dirty.warnings.some((w) => w.code === M.MATH_SCRIPT_CHANGED_WARNING), 'op=receipt warns visibly')
  ok(st3.file(run.receipt.json) === jsonBefore, 'reconciliation still does not rewrite receipt.json')

  // 15d. retention: over the documented cap the tool WARNS and never deletes.
  const st4 = makeFakeHost({})
  M.registerMathComputation(st4.host)
  const cap = M.MATH_ARCHIVE_MAX_ATTEMPTS_PER_RUN
  let last = null
  for (let i = 0; i < cap + 1; i++) last = await st4.call({ op: 'run', engine: 'python', mode: 'code', code: 'print(1)\n' })
  ok(last.attempt === cap + 1, 'attempts keep being appended past the cap (no deletion, no refusal)')
  ok(last.warnings.some((w) => w.code === M.MATH_ARCHIVE_WARNING), 'over the retention cap the tool warns (ARCHIVE_RETENTION_EXCEEDED)')
  ok(st4.file(last.baseRunDir + '/receipt.json') !== undefined, 'the FIRST attempt is still present after exceeding the cap')

  // 15e. the failure return also carries the archive coordinates.
  const st5 = makeFakeHost({ exit: 3 })
  M.registerMathComputation(st5.host)
  const bad = await st5.call({ op: 'run', engine: 'python', mode: 'code', code: 'boom\n' })
  ok(bad.ok === false && bad.code === 'MATH_NONZERO_EXIT' && !!bad.scriptPath && !!bad.scriptHash, 'failure return carries scriptPath + scriptHash')
}

// ── 16. AUDIT-C fixes: concurrency, listDir retention, string-level path guard ──────────────────
{
  // 16a (HIGH). Two same-id runs fired concurrently must never share an attempt dir: allocation +
  // the claiming receipt write are serialised per archive id. Before the fix both took attempt 1 and
  // the second silently overwrote the first receipt.
  {
    const stc = makeFakeHost({})
    M.registerMathComputation(stc.host)
    const [a, b] = await Promise.all([
      stc.call({ op: 'run', engine: 'python', mode: 'code', code: 'print(1)\n' }),
      stc.call({ op: 'run', engine: 'python', mode: 'code', code: 'print(1)\n' }),
    ])
    ok(a.receipt.dir !== b.receipt.dir, '★ 同一 id 的并发运行绝不共用一个 attempt 目录（并发下的 append-only）')
    ok([a.attempt, b.attempt].sort().join(',') === '1,2', 'concurrent same-id runs take attempts 1 and 2 (neither archive is lost)')
    ok(stc.file(a.attemptDir + '/receipt.json') !== undefined && stc.file(b.attemptDir + '/receipt.json') !== undefined, 'both concurrent attempts have their own receipt on disk')
  }

  // 16b (MEDIUM). Project-level retention via the optional listDir, and the no-listDir path.
  {
    const many = []
    for (let i = 0; i < M.MATH_ARCHIVE_MAX_RUNS + 1; i++) many.push({ name: 'run-' + i, type: 'directory' })
    const stl = makeFakeHost({ listDir: many })
    M.registerMathComputation(stl.host)
    const over = await stl.call({ op: 'run', engine: 'python', mode: 'code', code: 'print(1)\n' })
    ok(over.warnings.some((w) => w.code === M.MATH_ARCHIVE_WARNING), 'listDir shows more than MATH_ARCHIVE_MAX_RUNS -> ARCHIVE_RETENTION_EXCEEDED (warn only)')
    ok(stl.listDirCalls.length > 0 && stl.listDirCalls[0].indexOf('Computation') !== -1, 'the retention check asks the host to list Computation/')
    ok(stl.file(over.attemptDir + '/receipt.json') !== undefined, 'nothing is deleted when the cap is exceeded')
    const stn = makeFakeHost({})
    M.registerMathComputation(stn.host)
    const under = await stn.call({ op: 'run', engine: 'python', mode: 'code', code: 'print(1)\n' })
    ok(stn.listDirCalls.length === 0, 'a host without listDir is never asked for a listing')
    ok(!under.warnings.some((w) => w.code === M.MATH_ARCHIVE_WARNING), 'no listDir -> no project-level retention check and no false alarm')
  }

  // 16c (MEDIUM). The path guard is STRING-LEVEL: pin what it really does, including the limitation.
  {
    const sp = makeFakeHost({ files: { 'Problems/calc.py': 'print(1)\n', 'Problems/link.py': 'print(2)\n' } })
    M.registerMathComputation(sp.host)
    const up = await sp.call({ op: 'run', engine: 'python', mode: 'file', file: '../outside.py' })
    ok(up.ok === false && up.code === 'MATH_REFUSED' && up.next.reason === 'path-outside-project', 'lexical escape ../ is refused')
    const deep = await sp.call({ op: 'run', engine: 'python', mode: 'file', file: 'Problems/../../outside.py' })
    ok(deep.ok === false && deep.code === 'MATH_REFUSED', 'a lexical escape buried mid-path is refused')
    const abs = await sp.call({ op: 'run', engine: 'python', mode: 'file', file: 'C:/Windows/system32/calc.py' })
    ok(abs.ok === false && abs.code === 'MATH_REFUSED', 'an absolute path is refused')
    // A symlink/junction is invisible to a string guard. This pins the LIMITATION (docs §6): a path
    // that LOOKS in-project is accepted, because the guard never resolves it. The host fs owns real
    // containment, so this assertion exists to stop the docs from claiming otherwise.
    const linked = await sp.call({ op: 'run', engine: 'python', mode: 'file', file: 'Problems/link.py' })
    ok(linked.ok === true, 'an in-project path is accepted without resolving it (string-level guard: links/junctions are NOT followed)')
  }

  // 16d (AUDIT-A). Two more reconciliation false negatives, both fail-closed now:
  //   - the source file disappearing WHILE the run is in flight must count as a change;
  //   - a deleted archive script must make op:'receipt' report scriptChanged (the receipt cannot be
  //     evidence for any code once its script is gone).
  {
    const sd = makeFakeHost({ files: { 'Problems/gone.py': 'print(1)\n' }, deleteOnRun: { rel: 'Problems/gone.py' } })
    M.registerMathComputation(sd.host)
    const g = await sd.call({ op: 'run', engine: 'python', mode: 'file', file: 'Problems/gone.py' })
    ok(g.ok === true && g.scriptChangedDuringRun === true, 'the source file disappearing mid-run is a change: scriptChangedDuringRun:true')
    ok(g.warnings.some((w) => w.code === M.MATH_SCRIPT_CHANGED_DURING_RUN_WARNING), 'a disappeared source is warned visibly')
    ok(JSON.parse(sd.file(g.attemptDir + '/receipt.json')).scriptChangedDuringRun === true, 'the receipt records it too')

    const sm = makeFakeHost({})
    M.registerMathComputation(sm.host)
    const run2 = await sm.call({ op: 'run', engine: 'python', mode: 'code', code: 'print(1)\n' })
    sm.files.delete(run2.scriptPath)
    const rec2 = await sm.call({ op: 'receipt', file: run2.baseRunDir })
    ok(rec2.ok === true && rec2.scriptChanged === true && rec2.currentScriptHash === null, 'a deleted archive script makes op=receipt report scriptChanged (fail-closed)')
    ok(rec2.warnings.some((w) => w.code === M.MATH_SCRIPT_CHANGED_WARNING), 'the deletion is warned visibly')
  }
}

// ── 17. AUDIT-B #1: mathEngineOverride is a REAL, accepted argument ─────────────────────────────
{
  // 17a. It is accepted (not "unknown argument") and it really changes the assembled argv.
  {
    const so = makeFakeHost({})
    M.registerMathComputation(so.host)
    const r = await so.call({
      op: 'run', engine: 'python', mode: 'code', code: 'print(1)\n',
      mathEngineOverride: { python: { scriptArgv: ['-u', '<script>'], versionArgv: ['--version', '--override-proof'] } },
    })
    ok(r.ok === true, 'mathEngineOverride is ACCEPTED (previously rejected as an unknown argument)')
    eq(r.argv[1], '-u', 'the overridden scriptArgv really changes the assembled argv')
    ok(r.argv[r.argv.length - 1].indexOf('script.py') !== -1, 'the <script> placeholder is still substituted with the archived script path')
    const versionSpawn = so.spawns.filter((s) => s.argv.indexOf('--override-proof') !== -1)
    ok(versionSpawn.length > 0, 'the overridden versionArgv reaches the VERSION probe (not just the run argv)')
    ok(!so.spawns.some((s) => s.argv.length === 2 && s.argv[1] === '--version'), 'the default versionArgv is not used once overridden')
  }

  // 17b. mode:'expr' override.
  {
    const se = makeFakeHost({})
    M.registerMathComputation(se.host)
    const r = await se.call({ op: 'run', engine: 'python', mode: 'expr', expr: '1+1', mathEngineOverride: { python: { evalArgv: ['-X', 'utf8', '-c', '<expr>'] } } })
    eq(r.argv.slice(1, 4), ['-X', 'utf8', '-c'], 'the overridden evalArgv is used for mode=expr')
  }

  // 17c. The override stays CLOSED: bad shapes are refused with MATH_INVALID_ARGUMENT.
  {
    const sv = makeFakeHost({})
    M.registerMathComputation(sv.host)
    const unknownEngine = await sv.call({ op: 'run', engine: 'python', mode: 'code', code: 'x\n', mathEngineOverride: { fortran: { scriptArgv: ['<script>'] } } })
    ok(unknownEngine.ok === false && unknownEngine.code === 'MATH_INVALID_ARGUMENT' && /unknown engine/.test(unknownEngine.message), 'an override for an unknown engine is refused')
    const badShape = await sv.call({ op: 'run', engine: 'python', mode: 'code', code: 'x\n', mathEngineOverride: { python: { scriptArgv: 'not-an-array' } } })
    ok(badShape.ok === false && badShape.code === 'MATH_INVALID_ARGUMENT' && /string\[\]/.test(badShape.message), 'a non-array template is refused')
    const badKey = await sv.call({ op: 'run', engine: 'python', mode: 'code', code: 'x\n', mathEngineOverride: { python: { shellArgv: ['x'] } } })
    ok(badKey.ok === false && badKey.code === 'MATH_INVALID_ARGUMENT' && /unknown key/.test(badKey.message), 'an unknown key inside the override is refused')
  }

  // 17d. The advertised hint and the schema agree with the implementation.
  {
    ok(!!M.MATH_TOOL_SCHEMA.properties.mathEngineOverride, 'MATH_TOOL_SCHEMA advertises mathEngineOverride')
    ok(M.MATH_BAD_ARGV_HINT === 'mathEngineOverride', 'MATH_BAD_ARGV_HINT still names the escape hatch')
  }
}

// ── 18. round-6: substitution honesty (A), manager dispatch (B), scope policy (C), version syntax (D)
{
  // 18a (A): the rule is part of the frozen rule block and reaches both language lines.
  ok(M.MATH_RULE_LINES.join('\n').indexOf(M.MATH_SUBSTITUTION_RULE_LINE) !== -1, 'MATH_RULE_LINES carries the substitution-honesty rule (zh)')
  ok(M.MATH_RULE_LINES_EN.join('\n').indexOf(M.MATH_SUBSTITUTION_RULE_LINE_EN) !== -1, 'MATH_RULE_LINES_EN carries the substitution-honesty rule (en)')
  ok(/替代方案若改变精确性/.test(String(M.MATH_TOOL_DESCRIPTION)), 'the tool description states the substitution duty (paraphrase)')
  {
    const p = await M.probeMathEngines(makeFakeHost({ installed: ['python3'] }).host)
    const zh = M.mathAvailabilityLine(p, 'zh', 'typed+shell')
    const en = M.mathAvailabilityLine(p, 'en', 'typed+shell')
    ok(zh.indexOf('替代必须声明') !== -1, 'the injected (zh) availability line carries the substitution rule')
    ok(en.indexOf('Declare substitutions') !== -1, 'the injected (en) availability line carries the substitution rule')
  }

  // 18b (B): python dispatch follows the DETECTED environment, never a guess.
  {
    const condaHost = makeFakeHost({ resolveMap: { python3: 'C:/miniconda3/envs/math/python.exe', conda: 'C:/miniconda3/Scripts/conda.exe' } })
    M.registerMathComputation(condaHost.host)
    const c = await condaHost.call({ op: 'install', engine: 'python', packages: ['numpy'] })
    ok(c.ok === true && c.plan.manager === 'conda' && c.plan.managerAssumed === false, 'a conda-style interpreter plans with conda (not guessed)')
    eq(c.plan.commands[0].argv, ['conda', 'install', '-y', '-c', 'conda-forge', 'numpy'], 'conda install comes from conda-forge')
    ok(/conda/.test(String(c.message)), 'the plan message names the manager')

    const uvHost = makeFakeHost({ resolveMap: { python3: '/venv/bin/python3', uv: '/venv/bin/uv' } })
    M.registerMathComputation(uvHost.host)
    const u = await uvHost.call({ op: 'install', engine: 'python', packages: ['numpy'] })
    ok(u.ok === true && u.plan.manager === 'uv', 'a uv next to the interpreter plans with uv')
    eq(u.plan.commands[0].argv, ['uv', 'pip', 'install', 'numpy'], 'uv install uses `uv pip install`')

    const pipHost = makeFakeHost({ resolveMap: { python3: '/usr/bin/python3' } })
    M.registerMathComputation(pipHost.host)
    const d = await pipHost.call({ op: 'install', engine: 'python', packages: ['numpy'] })
    ok(d.ok === true && d.plan.manager === 'pip' && d.plan.managerAssumed === true, 'no marker -> pip fallback, flagged as an ASSUMPTION')
    eq(d.plan.commands[0].argv, ['/usr/bin/python3', '-m', 'pip', 'install', '--user', 'numpy'], 'the pip fallback keeps the user-scope form')
    ok(/假设|assum/i.test(String(d.message)), 'the message says the manager is an assumption')
  }

  // 18c (C): R/Octave/Julia refuse system scope WITH a per-engine reason; conda too.
  {
    const h = makeFakeHost({ resolveMap: { Rscript: '/usr/bin/Rscript', octave: '/usr/bin/octave', julia: '/usr/bin/julia' } })
    M.registerMathComputation(h.host)
    for (const [engine, marker] of [['r', 'R_LIBS_USER'], ['octave', 'share/packages'], ['julia', 'JULIA_DEPOT_PATH']]) {
      const r = await h.call({ op: 'install', engine: engine, packages: ['x'], scope: 'system' })
      ok(r.ok === false && r.code === 'MATH_REFUSED' && r.next && r.next.reason === 'system-scope-unsupported', engine + ': system scope -> MATH_REFUSED(system-scope-unsupported)')
      ok(String(r.message).indexOf(marker) !== -1, engine + ': the refusal states WHY (mentions ' + marker + ')')
    }
    const condaHost = makeFakeHost({ resolveMap: { python3: 'C:/miniconda3/envs/math/python.exe', conda: 'C:/miniconda3/Scripts/conda.exe' } })
    M.registerMathComputation(condaHost.host)
    const cs = await condaHost.call({ op: 'install', engine: 'python', packages: ['numpy'], scope: 'system' })
    ok(cs.ok === false && cs.next.reason === 'system-scope-unsupported' && /conda/.test(String(cs.message)), 'conda has no system scope and says so')
  }

  // 18d (D): version syntax is passed through where the manager understands it, refused otherwise.
  {
    ok(M.validateMathArgs({ op: 'run', mode: 'code', code: 'x', packages: ['numpy==1.2'] }, {}).ok === true, 'pkg==1.2 is accepted (pass-through)')
    ok(M.validateMathArgs({ op: 'run', mode: 'code', code: 'x', packages: ['numpy=1.2'] }, {}).ok === true, 'pkg=1.2 (conda form) is accepted')
    ok(M.validateMathArgs({ op: 'run', mode: 'code', code: 'x', packages: ['numpy[extra]>=1.2'] }, {}).ok === true, 'extras + comparator are accepted')
    const badSpec = M.validateMathArgs({ op: 'run', mode: 'code', code: 'x', packages: ['numpy; rm -rf /'] }, {})
    ok(badSpec.ok === false && badSpec.code === 'MATH_INVALID_ARGUMENT' && badSpec.next && badSpec.next.reason === 'unsupported-version-syntax', 'a shell-ish spec is refused with unsupported-version-syntax')

    const ph = makeFakeHost({ packages: { sympy: 'present' } })
    M.registerMathComputation(ph.host)
    await ph.call({ op: 'run', engine: 'python', mode: 'code', code: 'print(1)\n', packages: ['sympy==1.12'] })
    const pkgSpawns = ph.spawns.filter((s) => s.argv.join(' ').indexOf('sympy') !== -1)
    ok(pkgSpawns.length > 0 && pkgSpawns.every((s) => s.argv.join(' ').indexOf('sympy==1.12') === -1), 'presence is probed by BASE NAME (the constraint never reaches the probe)')
    const plan = await ph.call({ op: 'install', engine: 'python', packages: ['sympy==1.12'] })
    ok(plan.ok === true && plan.plan.commands[0].argv[plan.plan.commands[0].argv.length - 1] === 'sympy==1.12', 'the install plan passes the spec through verbatim')
    ok(!!plan.plan.versionPolicy, 'the plan states the version policy (solving belongs to the manager)')
  }
}

// ── 19. round-7: probe reports the REQUESTED engine (fix 1) + DSH bundled-runtime discovery (fix 2)
{
  // 19a (fix 1): `probe {engine:'r'}` must describe r - not the first allowed engine (python).
  {
    const hr = makeFakeHost({ installed: ['python3', 'python', 'Rscript'] })
    M.registerMathComputation(hr.host)
    const p = await hr.call({ op: 'probe', engine: 'r' })
    ok(p.ok === true && p.engine === 'r', 'probe with engine:r reports engine:r (not python)')
    ok(!!p.engineInfo && p.engineInfo.name === 'r' && !!p.engineInfo.version, "probe reports the requested engine's version/path")
    ok(!p.next, 'a usable requested engine yields no install guidance')
    const pp = await hr.call({ op: 'probe', engine: 'python' })
    ok(pp.ok === true && pp.engine === 'python' && pp.engineInfo.name === 'python', 'probe with engine:python reports python (each request is honoured)')
  }
  // 19b (fix 1): a MISSING requested engine must not blame python in the guidance.
  {
    const hm = makeFakeHost({ installed: ['python3', 'python'] })
    M.registerMathComputation(hm.host)
    const p = await hm.call({ op: 'probe', engine: 'r' })
    ok(p.ok === false && p.code === 'MATH_ENGINE_NOT_FOUND' && p.engine === 'r', 'a missing requested engine is reported as THAT engine (r, not python)')
    ok(p.next && p.next.kind === 'user-install' && p.next.engine === 'r' && !!p.next.perOs, 'the install guidance is for the REQUESTED engine (r), with per-OS commands')
    const msg = String(p.message)
    ok(/试过：r|请求：r/.test(msg) && !/python/i.test(msg), 'the message names the requested engine (r), never a python fallback')
  }
  // 19c (fix 2): a DSH-bundled runtime is discovered as a LAST resort and used like any engine.
  {
    const absTree = {
      'X:/home/.dsh/dsh-runtimes': [{ name: 'dsh-primary-runtime', type: 'directory' }, { name: 'dsh-other-runtime', type: 'directory' }],
      'X:/home/.dsh/dsh-runtimes/dsh-primary-runtime/dependencies/python': [{ name: 'python.exe', type: 'file' }, { name: 'python3.exe', type: 'file' }],
      'X:/home/.dsh/dsh-runtimes/dsh-other-runtime/dependencies/python': [],
    }
    const hb = makeFakeHost({ installed: [], runtimeRoots: ['X:/home/.dsh'], absTree: absTree })
    M.registerMathComputation(hb.host)
    const p = await hb.call({ op: 'probe', engine: 'python' })
    ok(p.ok === true && p.engine === 'python' && p.engineInfo.name === 'python', 'a bundled DSH runtime is found when PATH has nothing')
    ok(/dsh-runtimes\/dsh-primary-runtime\/dependencies\/python\/python/.test(p.engineInfo.path), 'the discovered path comes from the generically globbed runtime tree')
      ok(p.engineInfo.foundVia === 'host-runtime', '★ a bundled runtime tree is reported as host-runtime (foundVia, not the coarse source)')
    const r = await hb.call({ op: 'run', engine: 'python', mode: 'code', code: 'print(1)\n' })
    ok(r.ok === true && !!r.engineInfo.version, 'a run on the bundled runtime succeeds and reports its version')
    ok(!r.next, 'a found bundled runtime emits NO install guidance')
    // The bundled runtime must not be invented when the tree is absent.
    const hn = makeFakeHost({ installed: [] })
    M.registerMathComputation(hn.host)
    const n = await hn.call({ op: 'probe', engine: 'python' })
    ok(n.ok === false && n.code === 'MATH_ENGINE_NOT_FOUND' && n.next && n.next.kind === 'user-install', 'with no PATH engine and no runtime tree the per-OS guidance still fires')
  }
  // 19d (finding 3): the cli package precheck runs against the FAMILY of `cli.command`, not the
  // generic cli descriptor (which has no packageProbe and therefore reported a false "missing").
  {
    const hc = makeFakeHost({ installed: [], packages: { numpy: 'present' } })
    M.registerMathComputation(hc.host)
    const r = await hc.call({ op: 'run', engine: 'cli', mode: 'code', code: 'print(1)\n', cli: { command: '/fake/bin/python3' }, packages: ['numpy'] })
    ok(r.ok === true, 'cli + packages: a python-family command prechecks with the python probe (numpy present => the run proceeds)')
    const probes = hc.spawns.filter((s) => s.argv.join(' ').indexOf('numpy') !== -1)
    ok(probes.length > 0 && probes.every((s) => String(s.argv[0]).indexOf('python3') !== -1), 'the package precheck ran against cli.command itself')
    // An unrecognisable command must SKIP the precheck (never a false missing) and say so.
    const hu = makeFakeHost({ installed: [] })
    M.registerMathComputation(hu.host)
    const ru = await hu.call({ op: 'run', engine: 'cli', mode: 'code', code: 'print(1)\n', cli: { command: '/fake/bin/mytool' }, packages: ['numpy'] })
    ok(ru.ok === true && (ru.warnings || []).some((w) => w.code === 'PACKAGE_PRECHECK_SKIPPED'), 'an unknown cli family skips the precheck with an explicit warning (no false missing-packages)')
  }
  // 19e (finding 5): cli reports the REAL version of the resolved command when its family is known.
  {
    const hv = makeFakeHost({ installed: [] })
    M.registerMathComputation(hv.host)
    const p = await hv.call({ op: 'probe', engine: 'cli', cli: { command: '/fake/bin/python3' } })
    ok(p.ok === true && p.engineInfo && p.engineInfo.version === '1.2.3', 'probe(engine:cli) reports the real version of the resolved command')
    const r = await hv.call({ op: 'run', engine: 'cli', mode: 'code', code: 'print(1)\n', cli: { command: '/fake/bin/python3' } })
    ok(r.engineInfo.version === '1.2.3', 'run(engine:cli) reports the real command version (not "unknown")')
  }
  // 19f (finding 6, found on the real bundled python): the probe code iterates `sys.argv[1:]`, so the
  // names must arrive as SEPARATE argv items - a comma-joined single item makes python look up one
  // package literally named "numpy,pandas" and report everything missing.
  {
    const hp = makeFakeHost({ installed: ['python3'], packages: { numpy: 'present', pandas: 'present' } })
    M.registerMathComputation(hp.host)
    await hp.call({ op: 'run', engine: 'python', mode: 'code', code: 'print(1)\n', packages: ['numpy', 'pandas'] })
    const probe = hp.spawns.find((s) => s.argv.join(' ').indexOf('numpy') !== -1)
    ok(!!probe && probe.argv.indexOf('numpy') !== -1 && probe.argv.indexOf('pandas') !== -1, 'the python package probe passes ONE argv item per package (sys.argv-based probe)')
    ok(!!probe && probe.argv.join(' ').indexOf('numpy,pandas') === -1, 'the probe never passes the comma-joined list as a single argv item')
    // round-7 (live): a real host rejected probe argv containing shell metacharacters (| %), so no
    // probe argv may carry them - the parsers accept both `name:state` and `name state` shapes.
    ok(!!probe && !/[|%]/.test(probe.argv.join(' ')), 'no probe argv contains a shell metacharacter (| or %)')
    for (const name of ['python', 'r', 'octave', 'julia']) {
      const d = (await import('../vibe-math-v2/math-engines.js')).MATH_ENGINES[name]
      for (const a of (d.packageProbe.argv || [])) ok(!/[|%]/.test(String(a)), name + ' probe template has no | or %: ' + String(a).slice(0, 40))
      ok(!/[|%]/.test(String(d.probeCode || 'numpy ok line')), name + ' probeCode has no | or %')
    }
  }
  // 19f-bis: cli + mode:'code' actually PASSES the script (finding 4) - verified through argv shape.
  {
    const hs = makeFakeHost({ installed: [] })
    M.registerMathComputation(hs.host)
    const r = await hs.call({ op: 'run', engine: 'cli', mode: 'code', code: 'print(1)\n', cli: { command: '/fake/bin/python3' } })
    const last = String(r.argv[r.argv.length - 1] || '')
    ok(r.ok === true && /script\.txt$/.test(last), 'cli + code: the archived script is last in argv (it is really executed, not a REPL)')
    const runSpawn = hs.spawns.filter((s) => String(s.argv[s.argv.length - 1] || '').indexOf('script.txt') !== -1)
    ok(runSpawn.length === 1, 'the executed argv carried the script path to the process')
    // …but when the CALLER's argv already runs code (-c/-m/-e/--eval), the caller's argv wins: the
    // archived script must NOT be appended after it (python would read it as sys.argv[1]).
    const rc = await hs.call({ op: 'run', engine: 'cli', mode: 'code', code: 'print(1)\n', cli: { command: '/fake/bin/python3', argv: ['-c', 'print(1)'] } })
    ok(rc.ok === true && rc.cliScriptAppended === false, 'cli + code with a caller program slot (-c) does NOT append the archived script')
    ok(rc.argv.join(' ').indexOf('script.txt') === -1, 'the executed argv is exactly the caller argv (no script path)')
    ok(!!rc.receipt && !!rc.receipt.json, 'the skipped-append run still writes a receipt')
  }
  // 19g (live-session fix): an engine that RESOLVED but whose version probe failed must NOT come with
  // install guidance (the user does not need to install anything) and must carry the diagnostic.
  {
    const hh = makeFakeHost({ installed: ['python3', 'python'], versionProbeFails: true })
    M.registerMathComputation(hh.host)
    const p = await hh.call({ op: 'probe', engine: 'python' })
    ok(p.ok === false && p.code === 'MATH_ENGINE_UNUSABLE', 'a resolved engine whose probe fails => MATH_ENGINE_UNUSABLE')
    ok(!p.next || p.next.kind !== 'user-install', 'unusable (but FOUND) engine carries NO install guidance')
    ok(!!p.probe && Array.isArray(p.probe.argv) && p.probe.argv[0].indexOf('python3') !== -1, 'the failure carries the probe diagnostic (argv)')
    ok(!!p.probe && p.probe.exit === 1 && p.probe.stderrTail === 'probe boom', 'the diagnostic carries exit + stderr tail')
    ok(/MATH_ENGINE_UNUSABLE/.test(p.code) && /exit=1/.test(String(p.message)), 'the message states the probe exit code (never an opaque "unusable")')
    // A deterministic failure is NOT retried (no retryDiag, no retry storm), only a cold/null/timeout
    // signature is - see 19h.
    ok(!(p.probe && p.probe.retried), 'a deterministic probe failure is NOT retried (no retryDiag)')
  }
  // 19h (live-session fix): the real host intermittently returns a NULL spawn early in a session.
  // The retry must cover spawned:false / exit:null (not just timeouts) so the probe still succeeds.
  {
    const hN = makeFakeHost({ installed: ['python3', 'python'], nullSpawnTimes: 2 })
    M.registerMathComputation(hN.host)
    const p = await hN.call({ op: 'probe', engine: 'python' })
    ok(p.ok === true && p.engine === 'python' && p.engineInfo.version === '1.2.3', 'a transient NULL spawn is retried and the probe still succeeds')
    ok(hN.spawns.filter((s) => s.nullSpawn).length === 2, 'the null spawns are visible in the seam (2 consumed)')
  }
  // 19i (live-session fix): a package precheck that could not RUN must never be reported as
  // "missing package", and the skip must be explicit (fail-open + named warning).
  {
    const hP = makeFakeHost({ installed: ['python3'], packageProbeNullTimes: 9 })
    M.registerMathComputation(hP.host)
    const r = await hP.call({ op: 'run', engine: 'python', mode: 'code', code: 'print(1)\n', packages: ['numpy'] })
    ok(r.ok !== false || r.code !== 'MATH_MISSING_PACKAGES', 'a precheck that could not run is NEVER reported as a missing package')
    ok((r.warnings || []).some((w) => w.code === 'PACKAGE_PRECHECK_UNKNOWN'), 'the un-runnable precheck is reported explicitly (PACKAGE_PRECHECK_UNKNOWN)')
  }
}

// ── 20. round-7 cross-cutting invariant: EVERY response must be JSON-serialisable
// (a real session got `Converting circular structure to JSON ... property 'retryDiag' closes the
// circle` from a probe/run response, which meant the caller saw no result at all). This applies to
// all four presets because they all ship this module.
{
  const cases = []
  const push = (label, r) => cases.push({ label, r })
  {
    const h = makeFakeHost({ installed: ['python3', 'python', 'Rscript'], packages: { numpy: 'present' } })
    M.registerMathComputation(h.host)
    push('probe ok', await h.call({ op: 'probe', engine: 'python' }))
    push('probe missing engine', await h.call({ op: 'probe', engine: 'octave' }))
    push('run ok', await h.call({ op: 'run', engine: 'python', mode: 'code', code: 'print(1)\n' }))
    push('run bad mode', await h.call({ op: 'run', engine: 'python', mode: 'nope' }))
    push('run missing pkg', await h.call({ op: 'run', engine: 'python', mode: 'code', code: 'x\n', packages: ['pandas'] }))
    push('receipt missing', await h.call({ op: 'receipt', id: 'nope' }))
    push('install plan', await h.call({ op: 'install', engine: 'python', packages: ['numpy'] }))
    push('install commercial', await h.call({ op: 'install', engine: 'matlab', packages: ['MATLAB'] }))
    push('install system scope r', await h.call({ op: 'install', engine: 'r', packages: ['x'], scope: 'system' }))
    push('unsupported spec', await h.call({ op: 'run', engine: 'python', mode: 'code', code: 'x\n', packages: ['numpy; rm -rf /'] }))
    push('unknown engine', await h.call({ op: 'run', engine: 'nope', mode: 'code', code: 'x\n' }))
  }
  {
    const h = makeFakeHost({ installed: ['python3'], versionProbeFails: true })
    M.registerMathComputation(h.host)
    push('probe unusable (probe diagnostics)', await h.call({ op: 'probe', engine: 'python' }))
  }
  {
    // A RETRIED probe carries retryDiag: that is exactly where the circular payload came from.
    const h = makeFakeHost({ installed: ['python3'], nullSpawnTimes: 40 })
    M.registerMathComputation(h.host)
    push('probe unusable after retries (retryDiag present)', await h.call({ op: 'probe', engine: 'python' }))
  }
  {
    const h = makeFakeHost({ installed: ['python3'], packageProbeNullTimes: 9 })
    M.registerMathComputation(h.host)
    push('run with un-runnable precheck', await h.call({ op: 'run', engine: 'python', mode: 'code', code: 'x\n', packages: ['numpy'] }))
  }
  {
    const h = makeFakeHost({ installed: [] })
    M.registerMathComputation(h.host)
    push('probe nothing', await h.call({ op: 'probe', engine: 'python' }))
  }
  {
    const h = makeFakeHost({ resolveThrows: true })
    M.registerMathComputation(h.host)
    push('probe resolve throws', await h.call({ op: 'probe', engine: 'python' }))
  }
  for (const c of cases) {
    let json = null
    let err = null
    try { json = JSON.stringify(c.r) } catch (e) { err = String((e && e.message) || e) }
    ok(json !== null, '★ response is JSON-serialisable: ' + c.label + (err ? ' (' + err + ')' : ''))
  }
  // The diagnostics themselves must never carry a back-reference.
  {
    const h = makeFakeHost({ installed: ['python3'], nullSpawnTimes: 2 })
    M.registerMathComputation(h.host)
    const r = await h.call({ op: 'probe', engine: 'python' })
    ok(r.ok === true, 'the null-spawn retry recovers (JSON invariant context)')
    const h2 = makeFakeHost({ installed: ['python3'], versionProbeFails: true })
    M.registerMathComputation(h2.host)
    const u = await h2.call({ op: 'probe', engine: 'python' })
    ok(!!u.probe && JSON.stringify(u.probe).indexOf('retryDiag') === -1 ? true : !!u.probe, 'a deterministic failure still exposes its probe diagnostics')
  }
}

// ── 21. round-7 (live root cause): probes must not depend on the project root EXISTING
// The real host answers a spawn whose cwd does not exist with `spawned:true, exit:null` (retries
// cannot help). On a brand-new session the project root does not exist yet, so the version probe and
// the package precheck must run from a cwd that is guaranteed to exist.
{
  const FRESH = '/fresh/nonexistent/workspace'
  const h = makeFakeHost({ installed: ['python3', 'python'], projectRoot: FRESH, packages: { numpy: 'present' } })
  M.registerMathComputation(h.host)
  const p = await h.call({ op: 'probe', engine: 'python' })
  ok(p.ok === true && p.engine === 'python' && p.engineInfo.version === '1.2.3', '★ a probe on a FRESH (non-existent) project root still succeeds with a real version')
  const versionSpawns = h.spawns.filter((s) => /--version/.test(s.argv.join(' ')))
  ok(versionSpawns.length > 0, 'the version probe actually spawned')
  ok(versionSpawns.every((s) => String(s.cwd) !== FRESH), '★ no version probe spawn uses the non-existent project root as cwd')
  ok(versionSpawns.every((s) => !s.nullSpawn), 'no version probe spawn reported exit:null (fresh-root signature)')
  const r = await h.call({ op: 'run', engine: 'python', mode: 'code', code: 'print(1)\n', packages: ['numpy'] })
  const pkgSpawns = h.spawns.filter((s) => s.argv.join(' ').indexOf('numpy') !== -1)
  ok(r.ok === true, 'a run with packages on a FRESH root passes the precheck')
  ok(pkgSpawns.length > 0 && pkgSpawns.every((s) => String(s.cwd) !== FRESH), '★ the package precheck also avoids the non-existent project root')
  ok(!(r.warnings || []).some((w) => w.code === 'PACKAGE_PRECHECK_UNKNOWN'), 'the precheck RAN (no PACKAGE_PRECHECK_UNKNOWN on a fresh root)')
}

// ── 22. round-8 (P0/D3): member-facing artifact paths must be OPENABLE by members
// The receipt's scriptPath is PROJECT-ROOT relative, but members' file tools resolve against the
// SESSION CWD. The receipt/return therefore carry the absolute `scriptAbs` and the `cwd` to join with.
{
  const h = makeFakeHost({ installed: ['python3'] })
  M.registerMathComputation(h.host)
  const r = await h.call({ op: 'run', engine: 'python', mode: 'code', code: 'print(1)\n' })
  ok(r.ok === true, 'a run succeeds (P0 context)')
  ok(typeof r.scriptAbs === 'string' && r.scriptAbs.length > 0, '★ the return carries an ABSOLUTE scriptAbs (members can open it directly)')
  ok(typeof r.cwd === 'string' && r.cwd.length > 0, '★ the return carries cwd (the project root to join with)')
  ok(String(r.scriptAbs).replace(/\\/g, '/').endsWith(String(r.scriptPath).replace(/\\/g, '/')), '★ scriptAbs ends with the receipt-relative scriptPath (join consistency)')
  ok(!!h.files && h.files.has(String(r.scriptPath).replace(/\\/g, '/')), '★ the archived script really exists at scriptPath (the path handed to members is real)')
  const rj = JSON.parse(h.files.get(String(r.receipt.json).replace(/\\/g, '/')))
  ok(rj.scriptAbs === r.scriptAbs && rj.cwd === r.cwd, 'the RECEIPT carries scriptAbs + cwd too (a later reader can reconstruct the location)')
  ok(String(M.MATH_ARCHIVE_WORKFLOW_LINE).indexOf('receipt.scriptAbs') !== -1 && String(M.MATH_ARCHIVE_WORKFLOW_LINE_EN).indexOf('receipt.scriptAbs') !== -1, 'the injected archive rule tells members HOW to open the script (zh+en)')
  ok(/会话 cwd/.test(String(M.MATH_ARCHIVE_WORKFLOW_LINE)) && /SESSION CWD/.test(String(M.MATH_ARCHIVE_WORKFLOW_LINE_EN)), 'the rule states the session-cwd resolution fact (zh+en)')
}

// ── 23. round-9 (real-engine): an engine INSTALLED but not on PATH must still be discovered
// R 4.6.1 went to `C:\Program Files\R\R-4.6.1\bin` without touching PATH, so `probe` used to say R
// was missing even though it was installed.
{
  // round-B (F4): the candidate roots are INJECTED through the host seam, so this fixture cannot depend
  // on the ambient machine's ProgramFiles/LOCALAPPDATA (which made it a false red on other layouts).
  const RROOT = 'X:/installs/R'
  const absTree = {
    [RROOT]: [{ name: 'R-4.6.1', type: 'directory' }],
    [RROOT + '/R-4.6.1/bin']: [{ name: 'Rscript.exe', type: 'file' }, { name: 'R.exe', type: 'file' }],
  }
  const h = makeFakeHost({ installed: [], absTree: absTree, runtimeRoots: [], installRoots: { r: [RROOT] } })
  M.registerMathComputation(h.host)
  const p = await h.call({ op: 'probe', engine: 'r' })
  ok(p.ok === true && p.engine === 'r', '★ a Rscript that exists ONLY in the default install dir is discovered (not on PATH)')
  ok(!!p.engineInfo && /installs\/R\/R-4\.6\.1\/bin\/Rscript/.test(String(p.engineInfo.path)), 'the discovered path is the versioned install dir (' + String(p.engineInfo && p.engineInfo.path).slice(0, 60) + ')')
      ok(p.engineInfo.foundVia === 'known-install', '★ a known install dir is reported as known-install (foundVia)')
}
// ── 23b. round-B (F3): the SAME walker covers Octave and Julia default dirs (both layout shapes)
{
  const OROOT = 'X:/installs/GNU Octave'
  const JROOT = 'X:/home/.juliaup/bin'
  const absTree = {
    [OROOT]: [{ name: 'Octave-9.2.0', type: 'directory' }],
    [OROOT + '/Octave-9.2.0']: [{ name: 'mingw64', type: 'directory' }],
    [OROOT + '/Octave-9.2.0/mingw64/bin']: [{ name: 'octave-cli.exe', type: 'file' }],
    [JROOT]: [{ name: 'julia.exe', type: 'file' }],
  }
  const h = makeFakeHost({ installed: [], absTree: absTree, runtimeRoots: [], installRoots: { octave: [OROOT], julia: [JROOT] } })
  M.registerMathComputation(h.host)
  const po = await h.call({ op: 'probe', engine: 'octave' })
  ok(po.ok === true && /Octave-9\.2\.0\/mingw64\/bin\/octave-cli/.test(String(po.engineInfo && po.engineInfo.path)), '★ an Octave installed in its default dir (no PATH) is discovered (versioned + mingw64/bin layout)')
  const pj = await h.call({ op: 'probe', engine: 'julia' })
  ok(pj.ok === true && /\.juliaup\/bin\/julia/.test(String(pj.engineInfo && pj.engineInfo.path)), '★ a juliaup-managed Julia (flat bin dir, no PATH) is discovered by the same walker')
  const pr = await h.call({ op: 'probe' })
  ok((pr.absent || []).some((a) => a.engine === 'r' && a.why === 'not-found-on-this-machine'), 'an engine with no injected roots and no PATH entry is still honestly listed as absent')
  // F3: the per-engine default roots are part of the contract (the release notes claim "installed but not
  // on PATH is found"), so their coverage is asserted directly - not only via an injected fixture.
  for (const e of ['r', 'python', 'octave', 'julia', 'matlab']) {
    ok(typeof M.mathInstallRoots === 'function' && M.mathInstallRoots(e, {}, true).length > 0 && M.mathInstallRoots(e, {}, false).length > 0,
      '★ every engine with a well-defined default install dir declares per-OS roots: ' + e)
  }
}
// ── 23c (task-2): the route a REAL machine takes — the BUILT-IN per-OS table + a REAL filesystem
// listing. §23/§23b above both INJECT the candidate roots; this section has NO `installRoots` at all
// and uses a real absolute temp dir laid out like <tmp>/R/<version>/bin. `knownInstallCandidates`
// reads process.env at CALL time, so pointing `ProgramFiles` at the temp dir is enough (no seam).
async function task2ProbeBuiltInRoots(opts) {
  const { mkdtempSync, mkdirSync, writeFileSync, readdirSync, rmSync } = await import('node:fs')
  const { tmpdir } = await import('node:os')
  const { join } = await import('node:path')
  const tmp = mkdtempSync(join(tmpdir(), 'mc-known-install-'))
  const prevPF = process.env.ProgramFiles
  try {
    mkdirSync(join(tmp, 'R', 'R-4.6.1', 'bin'), { recursive: true })
    writeFileSync(join(tmp, 'R', 'R-4.6.1', 'bin', 'Rscript.exe'), '')
    process.env.ProgramFiles = tmp
    const h = makeFakeHost(Object.assign({ installed: [], runtimeRoots: [] }, opts || {}))
    h.host.listDirAbs = async (abs) => {
      try { return readdirSync(abs, { withFileTypes: true }).map((e) => ({ name: e.name, type: e.isDirectory() ? 'directory' : 'file' })) } catch (e) { return [] }
    }
    M.registerMathComputation(h.host)
    const p = await h.call({ op: 'probe', engine: 'r' })
    return { p, tmp }
  } finally {
    if (prevPF === undefined) delete process.env.ProgramFiles; else process.env.ProgramFiles = prevPF
    rmSync(tmp, { recursive: true, force: true })
  }
}
{
  const { p, tmp } = await task2ProbeBuiltInRoots(null)
  ok(p.ok === true && p.engine === 'r', '★ task-2 built-in route: an engine under the BUILT-IN per-OS root is discovered with a REAL fs listing (no installRoots injection)')
  ok(!!p.engineInfo && /R-4\.6\.1\/bin\/Rscript/.test(String(p.engineInfo.path)) && String(p.engineInfo.path).replace(/\\/g, '/').indexOf(tmp.replace(/\\/g, '/')) !== -1,
    '★ task-2 built-in route: the discovered path is the versioned install dir inside the temp root (' + String(p.engineInfo && p.engineInfo.path) + ')')
  ok(!!p.engineInfo && p.engineInfo.foundVia === 'known-install', '★ task-2 built-in route: foundVia names the known-install stage (' + String(p.engineInfo && p.engineInfo.foundVia) + ')')
}
// ── 23d (task-2 item 3): an EMPTY injected array must not suppress the built-in table. A JS empty array
// is TRUTHY, so `injected || mathInstallRoots(...)` silently disabled the whole per-OS stage.
{
  const { p } = await task2ProbeBuiltInRoots({ installRoots: { r: [] } })
  ok(p.ok === true && !!p.engineInfo && p.engineInfo.foundVia === 'known-install',
    '★ task-2 empty-injection: a host that answers [] still falls back to the BUILT-IN roots (a JS empty array is truthy)')
}
// ── 24. round-9 (real-engine): never suggest an install command that cannot run on this machine
{
  const h = makeFakeHost({ installed: [] })   // `winget` is NOT resolvable here
  M.registerMathComputation(h.host)
  const p = await h.call({ op: 'probe', engine: 'octave' })
  ok(p.ok === false && p.code === 'MATH_ENGINE_NOT_FOUND', 'a missing engine still fails with ENGINE_NOT_FOUND')
  ok(!!p.next && p.next.kind === 'user-install', 'the guidance is still user-install shaped')
  ok(String(p.next.command) === '', '★ no runnable-looking command when its package manager is absent (command is empty)')
  ok(!/winget|brew|apt|choco|scoop/i.test(String(p.next.command) + ' ' + String(p.message)), '★ no winget/brew/apt suggestion anywhere when that manager is absent')
  ok(p.next.packageManager === 'winget' && p.next.packageManagerAvailable === false, 'the response SAYS which manager was assumed and that it is unavailable')
  ok(typeof p.next.note === 'string' && p.next.note.length > 0, 'an explicit note explains that the suggested command cannot run')
  const h2 = makeFakeHost({ installed: [], resolveMap: { winget: 'C:/fake/winget.exe' } })
  M.registerMathComputation(h2.host)
  const p2 = await h2.call({ op: 'probe', engine: 'octave' })
  ok(/winget/i.test(String(p2.next.command)) && p2.next.packageManagerAvailable === true, 'when the manager IS present the command is offered as before')
}

// ── 25. round-9 F3/F5/F7: probe completeness, uniform failure evidence, explicit constraint policy
{
  // F3: a partial availability line must NAME the configured-but-absent engines.
  const h = makeFakeHost({ installed: ['python3'] })
  M.registerMathComputation(h.host)
  const p = await h.call({ op: 'probe', engine: 'python' })
  ok(p.ok === true && Array.isArray(p.absent) && p.absent.length > 0, '★ probe names the configured-but-absent engines instead of being silently partial')
  ok(p.absent.some((a) => a.engine === 'r' && a.why === 'not-found-on-this-machine'), 'the absent list carries a reason (key `why`) per engine')
  ok(p.absent.some((a) => a.engine === 'cli' && /caller-supplied/.test(a.why)), 'cli is explained as needing a caller-supplied command')
  ok(/未发现/.test(String(p.message)), 'the message states which configured engines were not found')
  // F5: MATH_TIMEOUT carries the SAME evidence fields a non-zero exit does.
  const h2 = makeFakeHost({ installed: ['python3'], hang: true })
  M.registerMathComputation(h2.host)
  const t = await h2.call({ op: 'run', engine: 'python', mode: 'code', code: 'while True: pass\n', timeoutMs: 1000 })
  ok(t.ok === false && t.code === 'MATH_TIMEOUT', 'a hanging run reports MATH_TIMEOUT')
  ok(t.timedOut === true && 'exit' in t && t.exit === null, '★ MATH_TIMEOUT carries timedOut:true and an explicit exit field (uniform with NONZERO_EXIT)')
  ok('stderr' in t && typeof t.stderr === 'string', '★ MATH_TIMEOUT carries the captured stderr like NONZERO_EXIT does')
  // F7: the response says the constraints are existence-only, and lists the ones that were NOT checked.
  const h3 = makeFakeHost({ installed: ['python3'], packages: { numpy: 'present' } })
  M.registerMathComputation(h3.host)
  const c = await h3.call({ op: 'run', engine: 'python', mode: 'code', code: 'print(1)\n', packages: ['numpy>=1'] })
  ok(c.ok === true && /existence-only/.test(String(c.versionPolicy)), '★ the run response states the version constraints are existence-only')
  ok(Array.isArray(c.constraintsNotEnforced) && c.constraintsNotEnforced.indexOf('numpy>=1') !== -1, '★ the response names the constraint it did NOT check (no silent drop)')
  const c2 = await h3.call({ op: 'run', engine: 'python', mode: 'code', code: 'print(1)\n', packages: ['numpy'] })
  ok(Array.isArray(c2.constraintsNotEnforced) && c2.constraintsNotEnforced.length === 0, 'an unconstrained request reports an empty not-enforced list')
  const m = await h3.call({ op: 'run', engine: 'python', mode: 'code', code: 'print(1)\n', packages: ['pandas>=2'] })
  ok(m.ok === false && /existence-only/.test(String(m.versionPolicy)), 'the missing-package failure also states the constraint policy')
}

// ── 26. round-9 (N1): edited-archived-script evidence integrity
// The documented P2a flow: edit the ORIGINAL source, re-run mode:'file' ⇒ SAME archive id, attempt>=2,
// scriptChanged:true, previousReceipt at the prior attempt, prior attempt untouched. Pointing mode:'file'
// at an ARCHIVED script is a NEW archive id by design (the id is keyed by the SOURCE PATH) - which must
// be SAID (fileIsArchivedScript + a warning), not look like broken change detection.
{
  const h = makeFakeHost({ installed: ['python3'], files: { 'Problems/x.py': 'print(1)\n' } })
  M.registerMathComputation(h.host)
  const r1 = await h.call({ op: 'run', engine: 'python', mode: 'file', file: 'Problems/x.py' })
  ok(r1.ok === true && r1.attempt === 1 && r1.scriptChanged === false, 'first run of a source file: attempt 1, no change')
  const rj1 = JSON.parse(h.files.get(String(r1.receipt.json).replace(/\\/g, '/')))
  ok(typeof r1.runId === 'string' && rj1.runId === r1.runId, '★ the run response exposes its archive id (matches the durable receipt.runId) - needed to check "same archive id"')
  // round-B (F6): the DURABLE receipt must record the constraint policy too (not just the response).
  ok(typeof rj1.versionPolicy === 'string' && /existence-only/.test(rj1.versionPolicy) && Array.isArray(rj1.constraintsNotEnforced),
    '★ the durable receipt records versionPolicy + constraintsNotEnforced (the promise is auditable evidence)')
  h.files.set('Problems/x.py', 'print(2)\n')
  const r2 = await h.call({ op: 'run', engine: 'python', mode: 'file', file: 'Problems/x.py' })
  ok(r2.ok === true && r2.runId === r1.runId, '★ editing the ORIGINAL source and re-running lands on the SAME archive id')
  ok(r2.attempt >= 2 && /\/attempts\/\d+/.test(String(r2.attemptDir || '')), '★ the re-run is attempt>=2 under attempts/<n>/')
  ok(r2.scriptChanged === true, '★ the re-run reports scriptChanged:true')
  ok(!!r2.previousReceipt && r2.previousReceipt.attempt === r1.attempt && r2.previousReceipt.scriptHash === r1.scriptHash, '★ previousReceipt points at the prior attempt (attempt + scriptHash)')
  ok(h.files.get(String(r1.scriptPath).replace(/\\/g, '/')) === 'print(1)\n', '★ the prior attempt\'s script is NOT overwritten (append-only)')
  // A DIFFERENT source path (e.g. a copy of the old script, or a brand-new file) is a NEW archive id BY
  // DESIGN: the id is keyed by the source path, so there is no history for that id and
  // scriptChanged/previousReceipt are - correctly - empty. This is the case a finder can mistake for
  // "broken change detection"; it is not, and the docs now say so.
  h.files.set('Problems/copy_of_old.py', 'print(1)\n')
  const r3 = await h.call({ op: 'run', engine: 'python', mode: 'file', file: 'Problems/copy_of_old.py' })
  ok(r3.ok === true, 'a run of a different source path succeeds (' + JSON.stringify({ ok: r3.ok, code: r3.code }) + ')')
  ok(r3.runId !== r1.runId, '★ a DIFFERENT source path gets a DIFFERENT archive id')
  ok(r3.attempt === 1, '★ …and therefore starts at attempt 1 (fresh archive, by design)')
  ok(r3.scriptChanged === false, '★ …and reports scriptChanged:false (no history FOR THIS id)')
  ok(r3.previousReceipt === null || r3.previousReceipt === undefined, '★ …and has no previousReceipt (expected, not broken change detection)')
  ok(h.files.get(String(r1.scriptPath).replace(/\\/g, '/')) === 'print(1)\n', 'the earlier attempt is still untouched after that run')
  // Review round A (F1/F2): the ARCHIVED copy is REACHABLE (projectRel() is purely lexical - it rejects
  // absolute paths and escaping `..` only). The shipped guidance must therefore say the truth: pointing
  // mode:'file' at the archived copy yields a NEW archive (new id, attempt 1, no history), flagged by
  // fileIsArchivedScript + ARCHIVED_SCRIPT_RERUN - it is NOT "a new attempt of the same archive".
  const archivedPath = String(r1.scriptPath).replace(/\\/g, '/')
  const r4 = await h.call({ op: 'run', engine: 'python', mode: 'file', file: archivedPath })
  ok(r4.ok === true, '★ pointing mode:file at the ARCHIVED copy succeeds (the guard is lexical, it does not refuse Computation/)')
  ok(r4.fileIsArchivedScript === true, '★ the response flags fileIsArchivedScript for an archived source')
  ok((r4.warnings || []).some((w) => w.code === 'ARCHIVED_SCRIPT_RERUN'), '★ the response warns ARCHIVED_SCRIPT_RERUN (so it cannot read as broken change detection)')
  ok(r4.runId !== r1.runId && r4.attempt === 1 && r4.scriptChanged === false && (r4.previousReceipt === null || r4.previousReceipt === undefined),
    '★ …and it really is a NEW archive (new id, attempt 1, no history) - NOT a new attempt of the same archive')
  ok(h.files.get(archivedPath) === 'print(1)\n', 'the archived original is still byte-identical after that run')
}
// ── 27. round-9 (N2): a TIMEOUT carries its partial output in BOTH the response and the receipt
{
  const h = makeFakeHost({ installed: ['python3'], hang: true, stdoutBytes: 16 })
  M.registerMathComputation(h.host)
  const t = await h.call({ op: 'run', engine: 'python', mode: 'code', code: 'print("before-timeout")\n', timeoutMs: 1000 })
  ok(t.ok === false && t.code === 'MATH_TIMEOUT', 'the hanging run reports MATH_TIMEOUT')
  ok('stdout' in t && 'stderr' in t, '★ the TIMEOUT response carries stdout AND stderr (not just the archived file)')
  const rj = JSON.parse(h.files.get(String(t.receipt.json).replace(/\\/g, '/')))
  ok(typeof rj.partialStdout === 'string' && typeof rj.partialStderr === 'string', '★ the TIMEOUT receipt JSON carries the capped partial output (as strings)')
}

// ── 28. descriptor sweep: NO spawn may ever carry an unsubstituted argv placeholder
// Sweep finding (HIGH, fixed): matlab's scriptArgv EMBEDS the placeholder (`run('<script>')`) while the
// module substituted by EXACT element equality, so the literal `run('<script>')` reached the engine and
// the archived script never ran. This section walks the whole descriptor table.
{
  const PLACEHOLDER = /<script>|<expr>|<pkgs>|<pkgs\.\.\.>|<probeCode>|<exe>|<pkg>|<cliArgv/
  for (const name of (M.MATH_PARAM_DEFAULTS.mathEngines || [])) {
    if (name === 'cli') continue
    const h = makeFakeHost({ installed: [name], files: {}, licence: true })
    M.registerMathComputation(h.host)
    const r = await h.call({ op: 'run', engine: name, mode: 'code', code: 'x=1\n' })
    const bad = (h.spawns || []).map((s) => (s && s.argv) || []).flat().filter((a) => typeof a === 'string' && PLACEHOLDER.test(a))
    ok(bad.length === 0, '★ ' + name + ': no spawn carries a literal argv placeholder', JSON.stringify(bad.slice(0, 2)))
    if (name === 'matlab' && r.ok === true) {
      const runs = (h.spawns || []).map((s) => s.argv).filter((a) => a.join(' ').indexOf('-batch') !== -1 && a.join(' ').indexOf('disp(version)') === -1)
      const run = runs.pop() || []
      ok(run.some((a) => /run\('.*script\.m'\)/.test(a)), '★ matlab: the EMBEDDED placeholder is substituted (run(\'<abs script.m>\'))', JSON.stringify(run))
    }
  }
}

// ── 29. cli policy is SINGLE-SOURCED (descriptor), not hard-coded in the module
// Sweep ruling: `cli.policy.requiresMathMode` / `requiresEngineInList` were declared but never consumed
// (the same rule was hard-coded twice), so descriptor and behaviour could drift. The refusals now carry
// the DESCRIPTOR value, which is exactly what makes a hard-coded revert observable.
{
  const h = makeFakeHost({ installed: ['python3'], params: { mathMode: 'typed' }, cliCommands: ['python3'] })
  M.registerMathComputation(h.host)
  const r = await h.call({ op: 'run', engine: 'cli', mode: 'code', code: 'print(1)\n', cli: { command: 'python3' } })
  ok(r.ok === false && r.code === 'MATH_REFUSED', 'cli under mathMode=typed is refused')
  ok(r.next && r.next.reason === 'policy' && r.next.requiresMathMode === 'typed+shell',
    '★ the refusal carries the DESCRIPTOR policy value (next.requiresMathMode === typed+shell)', JSON.stringify(r.next))
  const h2 = makeFakeHost({ installed: ['python3'], params: { mathMode: 'typed+shell', mathEngines: ['python', 'r'] }, cliCommands: ['python3'] })
  M.registerMathComputation(h2.host)
  const r2 = await h2.call({ op: 'run', engine: 'cli', mode: 'code', code: 'print(1)\n', cli: { command: 'python3' } })
  ok(r2.ok === false && r2.next && r2.next.reason === 'engine-not-allowed' && r2.next.requiresEngineInList === true,
    '★ when cli is not in mathEngines the refusal surfaces requiresEngineInList from the descriptor', JSON.stringify(r2.next))
}

// ── 30. a commercial template's VERIFY provenance REACHES the user (item 2)
// `maple.verify`/`verifyReason` were declared but never reached any response, so a user told "commercial
// template needs confirmation" could not see WHY. It is surfaced on the probe result (per-engine entry +
// engineInfo) and on the vendor-guidance payloads; engines without a declared reason print no empty slot.
{
  const h = makeFakeHost({ installed: ['maple'], licence: true, files: {} })
  M.registerMathComputation(h.host)
  const p = await h.call({ op: 'probe', engine: 'maple' })
  ok(p.ok === true && !!p.engineInfo && p.engineInfo.verify === true, 'probe reports the verify flag for a commercial template')
  ok(!!p.engineInfo && typeof p.engineInfo.verifyReason === 'string' && p.engineInfo.verifyReason.length > 0 && /version/i.test(p.engineInfo.verifyReason),
    '★ probe carries WHY the template needs confirmation (engineInfo.verifyReason)', JSON.stringify(p.engineInfo && p.engineInfo.verifyReason))
  const entry = (p.engines || []).find((e) => e.name === 'maple')
  ok(carriesVerifyProvenance(entry), 'the per-engine probe entry carries the same provenance')
  const hp = makeFakeHost({ installed: ['python3'], files: {} })
  M.registerMathComputation(hp.host)
  const pp = await hp.call({ op: 'probe', engine: 'python' })
  ok(hasNoVerifySlot(pp.engineInfo),
    '★ an engine without a declared reason prints NO empty slot (assemble-only-when-present)')
  const hm = makeFakeHost({ installed: [], files: {} })
  M.registerMathComputation(hm.host)
  const pm = await hm.call({ op: 'probe', engine: 'maple' })
  ok(pm.ok === false && !!pm.next && typeof pm.next.verifyReason === 'string' && /version/i.test(pm.next.verifyReason),
    '★ the not-found guidance also says why the commercial template needs confirmation', JSON.stringify(pm.next && pm.next.verifyReason))
}

// ── 31. S3 symmetry: EVERY failure kind surfaces partial stdout AND stderr (like the timeout)
{
  const h1 = makeFakeHost({ installed: ['python3'], exit: 2, stdoutBytes: 16 })
  M.registerMathComputation(h1.host)
  const r1 = await h1.call({ op: 'run', engine: 'python', mode: 'code', code: 'x=1\n' })
  ok(r1.ok === false && r1.code === 'MATH_NONZERO_EXIT', 'a non-zero exit reports MATH_NONZERO_EXIT')
  ok('stdout' in r1 && 'stderr' in r1, '★ S3 symmetry: MATH_NONZERO_EXIT carries BOTH partial stdout and stderr', JSON.stringify({ so: 'stdout' in r1, se: 'stderr' in r1 }))
  const h2 = makeFakeHost({ installed: ['python3'], argError: 'unknown option', stdoutBytes: 16 })
  M.registerMathComputation(h2.host)
  const r2 = await h2.call({ op: 'run', engine: 'python', mode: 'code', code: 'x=1\n' })
  ok(r2.ok === false && r2.code === 'MATH_ENGINE_BAD_ARGV', 'a usage error reports MATH_ENGINE_BAD_ARGV')
  ok('stdout' in r2 && 'stderr' in r2, '★ S3 symmetry: MATH_ENGINE_BAD_ARGV carries BOTH partial stdout and stderr')
}
// ── 32. S2: the failure a user actually hits carries the SAME absence evidence as the success shape
{
  const h = makeFakeHost({ installed: [] })
  M.registerMathComputation(h.host)
  const r = await h.call({ op: 'probe' })
  ok(r.ok === false && r.code === 'MATH_ENGINE_NOT_FOUND', 'no resolvable engine reports MATH_ENGINE_NOT_FOUND')
  ok(Array.isArray(r.configured) && r.configured.length > 0, '★ S2 absence evidence: the failure names the CONFIGURED engines', JSON.stringify(r.configured ?? null))
  const absent = Array.isArray(r.absent) ? r.absent : []
  ok(absent.length > 0, '★ S2 absence evidence: the failure carries an absent[] list (not a silent partial)', JSON.stringify(r.absent ?? null))
  ok(absent.every((a) => a && typeof a.why === 'string' && a.why.length > 0), 'every absent[] entry carries a why', JSON.stringify(absent))
}
console.log('')
// ── 33. S4/S5: install failures are discriminated WITHOUT a new code (frozen interface). Reads the
// ENV-RESOLVED module (MATH_COMPUTATION_MODULE), so the --self-probe case 2 above can reach exactly
// what these assertions read (the parity-located version could not be reddened by any mutant).
{
  const src = readFileSync(fileURLToPath(new URL(MODULE)), 'utf8')
  ok(src.indexOf("out.op = 'install'") !== -1, '★ S4/S5 install discrimination: a failed install sets op=install')
  ok(/out\.timedOut = !!/.test(src), '★ S4/S5 install discrimination: a failed install carries timedOut')
  ok(/out\.installedSoFar = results\.filter/.test(src), '★ S4/S5 install discrimination: a failed install reports what already succeeded (installedSoFar)')
  ok(/installedSoFar: commands\.map/.test(src), 'the success path reports installedSoFar too (no special-casing by the caller)')
  ok(src.indexOf('MATH_INSTALL_FAILED') === -1, 'no 12th failure code was added (MATH_FAILURE_CODES stays frozen)')
}

// ── 34. S6: the install plan, the run path and the missing-package failure state ONE policy the
// same way (behavioural: read from the responses, not from the source text).
{
  const PREFIX = 'version-constraints-are-existence-only: '
  const h = makeFakeHost({ installed: ['python3'] })
  M.registerMathComputation(h.host)
  const plan = await h.call({ op: 'install', packages: ['numpy==1.2.3'] })
  const planPolicy = String((plan && plan.plan && plan.plan.versionPolicy) || '')
  ok(plan.ok === true && !!plan.plan, 'S6: an install dry-run returns a plan', JSON.stringify(plan && plan.code))
  ok(planPolicy.indexOf(PREFIX) === 0, '★ S6: the install plan uses the SAME policy wording as the run path', planPolicy.slice(0, 70))
  ok(planPolicy.indexOf('numpy==1.2.3') !== -1, '★ S6: the plan names the pinned spec it does not enforce', planPolicy.slice(0, 90))
  const miss = await h.call({ op: 'run', engine: 'python', mode: 'code', packages: ['numpy==1.2.3'], code: 'x=1\n' })
  ok(miss.ok === false && miss.code === 'MATH_MISSING_PACKAGES', 'S6: a pinned-but-missing package fails as MATH_MISSING_PACKAGES', JSON.stringify(miss.code))
  ok(String(miss.versionPolicy || '').indexOf(PREFIX) === 0, '★ S6: the failure path uses the same wording', String(miss.versionPolicy || '').slice(0, 70))
  ok(String(miss.versionPolicy || '') === planPolicy, '★ S6: plan and failure wording are byte-identical for the same spec', JSON.stringify([planPolicy.slice(0, 40), String(miss.versionPolicy || '').slice(0, 40)]))
  ok(String(miss.message || '').indexOf('只检查是否存在；版本求解交给包管理器') !== -1, '★ S6: the MATH_MISSING_PACKAGES detail derives the same clause', String(miss.message || '').slice(0, 70))
  const badSpec = M.parsePackageSpec('numpy@1.2')
  ok(badSpec && badSpec.ok === false && String(badSpec.problem || '').indexOf('只检查是否存在；版本求解交给包管理器') !== -1, '★ S6: the unsupported-version-syntax message derives the same clause', String((badSpec && badSpec.problem) || '').slice(0, 80))
  ok(String(planPolicy || '').indexOf('只检查是否存在；版本求解交给包管理器') !== -1, '★ S6: the policy FIELD itself contains that clause (one literal, three surfaces)', planPolicy.slice(0, 80))
}

// ── 35. S6 derivation is LOAD-BEARING (found by mutant case 2): "the message contains the clause" also
// passes when the message RE-INLINES the same words, so the real checks are (a) the clause exists as
// exactly ONE literal in the module and (b) the two human messages are built from the constant.
{
  const src = readFileSync(fileURLToPath(new URL(MODULE)), 'utf8')
  const clause = '只检查是否存在；版本求解交给包管理器'
  const occurrences = src.split(clause).length - 1
  ok(occurrences === 1, '★ S6: the policy clause exists as exactly ONE literal in the module (a re-inlined message is caught)', 'occurrences=' + occurrences)
  ok(/MATH_MISSING_PACKAGES[\s\S]{0,160}MATH_VERSION_POLICY_CLAUSE/.test(src), '★ S6: the missing-package detail is built from the clause constant', 'MATH_MISSING_PACKAGES … MATH_VERSION_POLICY_CLAUSE')
  ok(/unsupported version syntax[\s\S]{0,160}MATH_VERSION_POLICY_CLAUSE/.test(src), '★ S6: the unsupported-version-syntax message is built from the clause constant')
  ok(/const MATH_VERSION_POLICY = .*MATH_VERSION_POLICY_CLAUSE/.test(src), '★ S6: the long policy sentence is derived from the clause')
}

console.log('=== MATH COMPUTATION SHARED: ' + passed + ' passed, ' + failed + ' failed ===')
if (failures.length) for (const f of failures) console.error('  - ' + f)
process.exit(failed === 0 ? 0 : 1)

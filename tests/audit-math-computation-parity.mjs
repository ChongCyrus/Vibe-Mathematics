// ============================================================================================
// math_computation — PARITY guard (integration owner).
//
// The shared module is installed as FOUR byte-identical copies (one per preset dir) because the
// <=0.1.6 install line copies only the files listed in installer.js PRESETS[].files - a repo-root
// shared module would be missing from an installed preset. That design is only safe if drift is
// impossible to miss, so this guard fails when:
//   1. any of the four copies differs from the others (byte level);
//   2. the copies differ from the canonical source in _oneoff/mc-P1-ready/canonical/ (dev checkout);
//   3. installer.js / package.json stop shipping the module (either install line);
//   4. the exported freeze drifts from _oneoff/mc-P1-ready/tool-schema.json (codes, param names);
//   5. the descriptor table loses a P1 invariant (cli default-on + policy, Maple VERIFY flag,
//      arg-error hints on the commercial three, engine order).
//
// Usage: node tests/audit-math-computation-parity.mjs
// ============================================================================================
import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const HERE = fileURLToPath(new URL('./', import.meta.url))
const REPO = resolve(HERE, '..')
const PRESETS = ['vibe-math-v2', 'vibe-math-v3', 'vibe-math-v4', 'vibe-math-v5']
const MODULES = ['math-engines.js', 'math-computation.js']
const CANON = join(REPO, '_oneoff', 'mc-P1-ready', 'canonical')
const SCHEMA = join(REPO, '_oneoff', 'mc-P1-ready', 'tool-schema.json')

let passed = 0, failed = 0
const failures = []
function ok(cond, label, detail) {
  if (cond) { passed++; console.log('  ok   ' + label); return true }
  failed++; failures.push(label + (detail ? ' — ' + detail : ''))
  console.error('  FAIL ' + label + (detail ? ' — ' + detail : ''))
  return false
}
const sha = (p) => createHash('sha256').update(readFileSync(p)).digest('hex')
const read = (rel) => readFileSync(join(REPO, rel), 'utf8')

console.log('-- math_computation parity --')

// ---- 1/2. the four copies are identical, and match the canonical source ----
for (const f of MODULES) {
  const hashes = {}
  for (const p of PRESETS) {
    const file = join(REPO, p, f)
    if (!existsSync(file)) { ok(false, p + '/' + f + ' exists'); continue }
    const h = sha(file)
    hashes[h] = (hashes[h] || []).concat(p)
  }
  const distinct = Object.keys(hashes)
  ok(distinct.length === 1 && hashes[distinct[0]].length === 4, 'four copies of ' + f + ' are byte-identical', distinct.length + ' distinct hash(es)')
  const canon = join(CANON, f)
  if (existsSync(canon)) ok(sha(canon) === distinct[0], f + ' matches the canonical source', sha(canon).slice(0, 16) + ' vs ' + String(distinct[0]).slice(0, 16))
  else console.log('  note canonical source absent (published tree) - four-way comparison only')
}

// ---- 3. both install lines ship the module ----
{
  const installer = read('installer.js')
  // Parse each preset block: src + dst + (optional comment lines) + files[...]. Windows are not
  // good enough here (the explanatory comment between dst and files pushes the module names past a
  // fixed slice), so the files list is captured explicitly.
  const blocks = {}
  const re = /src:\s*'([^']+)',\s*dst:\s*'[^']+',\s*(?:\/\/[^\n]*\n\s*)*files:\s*\[([^\]]*)\]/g
  let m
  while ((m = re.exec(installer)) !== null) blocks[m[1]] = m[2]
  for (const p of PRESETS) {
    const list = blocks[p]
    ok(!!list, 'installer.js has a PRESETS entry for ' + p)
    for (const f of MODULES) ok(!!list && list.indexOf("'" + f + "'") !== -1, 'installer.js ' + p + ' files[] ships ' + f)
  }
  const pkg = JSON.parse(read('package.json'))
  const files = pkg.files || []
  for (const p of PRESETS) for (const f of MODULES) ok(files.indexOf(p + '/' + f) !== -1, 'package.json files[] ships ' + p + '/' + f)
  ok(files.indexOf('docs/math-computation.md') !== -1, 'package.json files[] ships docs/math-computation.md')
  ok(files.indexOf('tests/audit-math-computation-parity.mjs') !== -1 && files.indexOf('tests/audit-math-computation-contract.mjs') !== -1, 'package.json ships the cross-preset guards')
  ok(files.indexOf('tests/math-computation-shared.test.mjs') !== -1, 'package.json ships the shared contract suite')
}

// ---- 4. the freeze matches tool-schema.json ----
{
  const mod = await import(new URL('../vibe-math-v2/math-computation.js', import.meta.url).href)
  if (existsSync(SCHEMA)) {
    const s = JSON.parse(readFileSync(SCHEMA, 'utf8'))
    const codes = s.failureCodes.map((c) => c.code)
    ok(JSON.stringify(mod.MATH_FAILURE_CODES) === JSON.stringify(codes), 'failure codes match tool-schema.json', JSON.stringify(mod.MATH_FAILURE_CODES))
    ok(JSON.stringify(mod.MATH_PARAM_NAMES) === JSON.stringify(s.paramNamesFrozen.names), 'param names match tool-schema.json#paramNamesFrozen')
    ok(s.paramNamesFrozen.value === true, 'param names are frozen in the schema')
    ok(!!s.returnShell.argv && s.returnShell.argv.length > 0, 'return shell declares argv (ruling 4: echo)')
    ok(s.failureCodes.some((c) => c.code === 'MATH_ENGINE_BAD_ARGV' && /engine-override/.test(c.next)), 'MATH_ENGINE_BAD_ARGV carries the engine-override next')
  } else {
    console.log('  note tool-schema.json absent (published tree) - freeze compared against the module only')
  }
  ok(mod.MATH_FAILURE_CODES.length === 11, 'eleven failure codes exported')
  ok(mod.MATH_PARAM_NAMES.length === 6, 'six param names exported')
  ok(JSON.stringify(mod.MATH_PARAM_DEFAULTS.mathEngines) === JSON.stringify(['python', 'r', 'octave', 'julia', 'matlab', 'maple', 'wolfram', 'cli']), 'default engine order is the frozen P1 set')
}

// ---- 5. descriptor invariants ----
{
  // MATH_ENGINES_MODULE points this section at a MUTATED descriptor copy (round-6 mutants must be
  // able to delete a dispatch manager or a scope reason without touching the repository).
  const E = await import(process.env.MATH_ENGINES_MODULE
    ? new URL('file:///' + String(process.env.MATH_ENGINES_MODULE).replace(/\\/g, '/')).href
    : new URL('../vibe-math-v2/math-engines.js', import.meta.url).href)
  const order = E.MATH_ENGINE_ORDER
  ok(JSON.stringify(order) === JSON.stringify(['python', 'r', 'octave', 'julia', 'matlab', 'maple', 'wolfram', 'cli']), 'MATH_ENGINE_ORDER is exactly the P1 set')
  // Item-3 ruling: `defaultOn` was declared but never consumed - cli's default-on property is
  // already pinned above through the REAL single source (MATH_PARAM_DEFAULTS.mathEngines).
  const zombie = ['winPrefix', 'stdinArgv', 'defaultOn']
    .filter((f) => JSON.stringify(E.MATH_ENGINES).indexOf('"' + f + '"') !== -1 || JSON.stringify(E.MATH_P2_ENGINES).indexOf('"' + f + '"') !== -1)
  ok(zombie.length === 0, 'no zombie descriptor field is declared (winPrefix/stdinArgv/defaultOn were removed)', JSON.stringify(zombie))
  ok(!/<cliArgv/.test(readFileSync(join(REPO, 'vibe-math-v2', 'math-engines.js'), 'utf8')), 'the decorative <cliArgv...> marker is gone from the descriptor table')
  ok(E.MATH_ENGINES.cli.policy && E.MATH_ENGINES.cli.policy.requiresMathMode === 'typed+shell' && E.MATH_ENGINES.cli.policy.requiresEngineInList === true, 'cli policy gate declared')
  ok(E.MATH_ENGINES.maple.verify === true && !!E.MATH_ENGINES.maple.verifyReason, 'Maple template is flagged VERIFY with a reason')
  for (const name of ['matlab', 'maple', 'wolfram']) {
    ok(Array.isArray(E.MATH_ENGINES[name].argErrorHints) && E.MATH_ENGINES[name].argErrorHints.length > 0, name + ' ships argErrorHints (bad-argv diagnosis)')
    ok(E.MATH_ENGINES[name].license === 'commercial' && E.MATH_ENGINES[name].install === null, name + ' is commercial and never installable')
  }
  for (const name of ['python', 'r', 'octave', 'julia']) {
    ok(E.MATH_ENGINES[name].license === 'free' && !!E.MATH_ENGINES[name].install, name + ' is free with a user-level install template')
  }
  ok(!!E.MATH_P2_ENGINES.sage && E.MATH_P2_ENGINES.sage.phase === 'P2', 'sage is kept as the P2 descriptor')
  ok(E.mathEngineCandidates('cli') === null, 'cli has no detection candidates')

  // round-6 (B): python must ship the manager DISPATCH table, and each manager must carry both the
  // install and the matching uninstall template (the audit is only honest if the uninstall matches).
  const pm = E.MATH_ENGINES.python.install && E.MATH_ENGINES.python.install.managers
  ok(!!pm, 'python install declares a managers{conda,mamba,uv,pip} dispatch table')
  for (const mgr of ['conda', 'mamba', 'uv', 'pip']) {
    ok(!!(pm && pm[mgr]), 'python dispatch has the ' + mgr + ' manager')
    if (pm && pm[mgr]) {
      // The user template is either the manager's own or (for the pip fallback) the engine-level one;
      // that precedence is what opInstall implements (`mgrTmpl.userArgv || d.install.userArgv`).
      const userTemplate = pm[mgr].userArgv || (mgr === 'pip' ? E.MATH_ENGINES.python.install.userArgv : null)
      ok(Array.isArray(userTemplate) && userTemplate.length > 0, mgr + ' has a user-scope install template (own or the engine-level fallback)')
      ok(Array.isArray(pm[mgr].uninstallArgv) && pm[mgr].uninstallArgv.length > 0, mgr + ' ships the MATCHING uninstall template')
    }
  }
  ok(pm && /-c/.test(pm.conda.userArgv.join(' ')) && /conda-forge/.test(pm.conda.userArgv.join(' ')), 'conda installs from -c conda-forge')
  ok(pm && pm.pip.systemArgv && pm.pip.systemArgv.length > 0, 'pip keeps a real system-scope template')
  ok(!!(pm && pm.uv && pm.conda && pm.mamba) && !pm.uv.systemArgv && !pm.conda.systemArgv && !pm.mamba.systemArgv, 'uv/conda/mamba have NO system template (user-only by design)')

  // round-6 (C): every user-only engine states WHY in the descriptor (the refusal message quotes it).
  for (const name of ['r', 'octave', 'julia']) {
    ok(!!(E.MATH_ENGINES[name].install && E.MATH_ENGINES[name].install.systemUnsupportedReason), name + ' explains why system scope is unsupported')
    ok(!E.MATH_ENGINES[name].install.systemArgv, name + ' ships no system template (user-only by design)')
  }
  ok(!!pm.uv.systemUnsupportedReason && !!pm.conda.systemUnsupportedReason, 'conda/uv managers explain why system scope is unsupported')
}

// ── 6. round-3 item 3: the machine-readable refusal vocabulary cannot drift ──────────────────────
// The docs used to list 5 reasons while the code emitted 12, and nothing pinned the names. This
// section derives the literals FROM the shipped module and requires the documented lists (docs +
// tool-schema.json) to be exactly that set - adding/renaming one in the module without updating the
// docs turns this red.
{
  const modHref = process.env.MATH_COMPUTATION_MODULE
    ? new URL('file:///' + String(process.env.MATH_COMPUTATION_MODULE).replace(/\\/g, '/'))
    : new URL('../vibe-math-v2/math-computation.js', import.meta.url)
  const { readFileSync: rf } = await import('node:fs')
  const src = rf(fileURLToPath(modHref), 'utf8')
  const kinds = new Set(); for (const m of src.matchAll(/next\('([a-z-]+)'/g)) kinds.add(m[1])
  const reasons = new Set(); for (const m of src.matchAll(/reason:\s*'([a-z-]+)'/g)) reasons.add(m[1])
  const codes = new Set(); for (const m of src.matchAll(/fail\('(MATH_[A-Z_]+)'/g)) codes.add(m[1])
  // round-4 item 1: the "exhaustive" check above is only sound while the vocabulary is written as
  // STRING LITERALS. `next('reason', { reason: SOME_CONST })` would emit a value the extractor cannot
  // see while the exhaustive assertion stayed green. Pin the machine-extractability itself:
  //   - every `next(...)` first argument must be a string literal;
  //   - every `reason:` field must be a string literal.
  // A non-literal form makes this red (and then the vocabulary lists must be updated to match).
  // Exclude helper DEFINITION lines (`function next(kind, extra)`, `bad(reason, …)`, and any
  // parameterised helper such as `function reasonNext(r) { return next('reason', {reason: r}) }`):
  // those are plumbing whose call sites still pass literals. The literal pattern accepts ANY quoted
  // text (digits/underscores included) - it only asks "can the value be extracted statically?".
  const callSites = src.split(/\r?\n/).filter((l) => !/^\s*(async\s+)?function\s+\w+\s*\(/.test(l)).join('\n')
  const nextFirst = [...callSites.matchAll(/\bnext\(\s*([^,)]*)/g)].map((m) => m[1].trim())
  const nonLiteralKinds = nextFirst.filter((a) => !/^'[^']*'$/.test(a))
  ok(nonLiteralKinds.length === 0, 'every next(kind, …) kind is a STRING LITERAL (machine-extractable vocabulary)', 'non-literal: ' + JSON.stringify(nonLiteralKinds.slice(0, 3)))
  const reasonFields = [...callSites.matchAll(/\breason:\s*([^,}\n]*)/g)].map((m) => m[1].trim())
  const nonLiteralReasons = reasonFields.filter((v) => !/^'[^']*'$/.test(v))
  ok(nonLiteralReasons.length === 0, 'every reason: value is a STRING LITERAL (the exhaustive list cannot be evaded)', 'non-literal: ' + JSON.stringify(nonLiteralReasons.slice(0, 3)))
  const schemaPath = [join(REPO, '_oneoff', 'mc-P1-ready', 'tool-schema.json'), resolve(REPO, '..', '_oneoff', 'mc-P1-ready', 'tool-schema.json')].find((p) => existsSync(p))
  const schema = schemaPath ? JSON.parse(rf(schemaPath, 'utf8')) : null
  const RV = schema && schema.refusalVocabulary
  const same = (a, b) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort())
  if (!RV) {
    console.log('  note refusalVocabulary source absent (published tree) - deriving from the module only')
  } else {
    ok(same(kinds, RV.nextKinds), 'documented next.kind list is EXHAUSTIVE', 'code=' + [...kinds].sort().join(',') + ' doc=' + RV.nextKinds.join(','))
    ok(same(reasons, RV.reasons), 'documented next.reason list is EXHAUSTIVE', 'code=' + [...reasons].sort().join(',') + ' doc=' + RV.reasons.join(','))
    ok(codes.size === 11 && schema.failureCodes.length === 11, 'the emitted failure-code set is the frozen 11')
  }
  const doc = rf(join(REPO, 'docs', 'math-computation.md'), 'utf8')
  for (const k of kinds) ok(doc.indexOf('`' + k + '`') !== -1, 'docs/math-computation.md names next.kind ' + k)
  for (const r of reasons) ok(doc.indexOf('`' + r + '`') !== -1, 'docs/math-computation.md names next.reason ' + r)
}

// ── 7. descriptor sweep: every argv placeholder dialect must be one the module IMPLEMENTS
// Sweep finding (HIGH, fixed): substitution was exact-element (`a === '<script>'`), so matlab's embedded
// `run('<script>')` reached the engine literally. The fix is string-level; this guard keeps the two
// sides in sync: no descriptor may use a placeholder the module does not substitute.
{
  const E = await import(pathToFileURL(join(REPO, 'vibe-math-v2', 'math-engines.js')).href)
  const modPath = join(REPO, 'vibe-math-v2', 'math-computation.js')
  const src = existsSync(modPath) ? readFileSync(modPath, 'utf8') : ''
  const SUPPORTED = {
    '<script>': "split('<script>').join(",
    '<expr>': "split('<expr>').join(",
    '<pkgs>': "a === '<pkgs>'",
    '<pkgs...>': "a === '<pkgs...>'",
    '<probeCode>': "a === '<probeCode>'",
    '<exe>': ".replace(/<exe>/g, exe)",
    '<pkg>': ".replace(/<pkg>/g, pkg)",
    '__PKGS__': ".replace(/__PKGS__/g, plain)",
    '__QPKGS__': ".replace(/__QPKGS__/g, quoted)",
    '__PKG__': ".replace(/__PKG__/g, pkg)",
  }
  const stringsOf = (d) => [].concat(
    Object.values(d.scriptArgv || {}).filter((x) => typeof x === 'string'),
    Object.values(d.evalArgv || {}).filter((x) => typeof x === 'string'),
    ((d.packageProbe && d.packageProbe.argv) || []).filter((x) => typeof x === 'string'),
    typeof d.probeCode === 'string' ? [d.probeCode] : [],
    (d.install ? [].concat(d.install.userArgv || [], d.install.systemArgv || [], d.install.uninstallArgv || []) : []).filter((x) => typeof x === 'string'),
  )
  const all = Object.assign({}, E.MATH_ENGINES, E.MATH_P2_ENGINES)
  const unknown = []
  const unimplemented = []
  for (const name of Object.keys(all)) {
    for (const s of stringsOf(all[name])) {
      for (const m of (s.match(/<[a-z.]+>|__[A-Z]+__/g) || [])) {
        if (!(m in SUPPORTED)) unknown.push(name + ':' + m)
        else if (SUPPORTED[m] && src.indexOf(SUPPORTED[m]) === -1) unimplemented.push(name + ':' + m)
      }
    }
  }
  ok(unknown.length === 0, 'no descriptor uses an UNKNOWN argv placeholder', JSON.stringify([...new Set(unknown)]))
  ok(unimplemented.length === 0, 'every descriptor placeholder has an implementation in the module (no literal placeholder can reach an engine)', JSON.stringify([...new Set(unimplemented)]))
  ok(/String\(a\)\.split\('<script>'\)\.join\(/.test(src) && /String\(a\)\.split\('<expr>'\)\.join\(/.test(src),
    'substitution is STRING-level for <script>/<expr> (embedded forms like matlab run(\'<script>\') are covered)')
}

// ── 8. the cli policy is declared ONCE (descriptor) and consumed, never hard-coded
// Sweep ruling: `cli.policy.{requiresMathMode,requiresEngineInList}` were declared but never consumed,
// while the same rules were hard-coded twice in the module (so they could drift). The module now reads
// the descriptor; this guard makes a hard-coded revert impossible to land.
{
  const engPath = join(REPO, 'vibe-math-v2', 'math-engines.js')
  const modPath = join(REPO, 'vibe-math-v2', 'math-computation.js')
  const eng = existsSync(engPath) ? readFileSync(engPath, 'utf8') : ''
  const mod = existsSync(modPath) ? readFileSync(modPath, 'utf8') : ''
  ok(/policy:\s*\{\s*requiresMathMode:\s*'typed\+shell',\s*requiresEngineInList:\s*true\s*\}/.test(eng),
    'the cli descriptor DECLARES its policy (requiresMathMode + requiresEngineInList)')
  ok((mod.match(/CLI_POLICY\.requiresMathMode/g) || []).length >= 2 && (mod.match(/CLI_POLICY\.requiresEngineInList/g) || []).length >= 1,
    'the module CONSUMES the descriptor policy (both refusal sites read CLI_POLICY)')
  ok(!/mathMode !== 'typed\+shell'/.test(mod),
    'no hard-coded policy comparison is left in the module (the rule lives only in the descriptor)')
}

// ── 9. doc-sync: the v5 editor closed set and v2's single-source status/report helper are documented
{
  const v5 = existsSync(join(REPO, 'vibe-math-v5', 'vibe-math-v5.js')) ? readFileSync(join(REPO, 'vibe-math-v5', 'vibe-math-v5.js'), 'utf8') : ''
  const fp = existsSync(join(REPO, 'docs', 'final-paper.md')) ? readFileSync(join(REPO, 'docs', 'final-paper.md'), 'utf8') : ''
  // The closed set appears twice in v5 (the coerce call and the tool schema enum); the separator may be
  // written with or without a space, so accept both rather than pinning one spelling.
  ok(/\[\s*'office'\s*,\s*'academician'\s*\]/.test(v5) && /V5_INVALID_ARGUMENT/.test(v5), 'v5 validates the paper editor against the closed set and returns V5_INVALID_ARGUMENT')
  ok(fp.indexOf('office|academician') !== -1 && fp.indexOf('V5_INVALID_ARGUMENT') !== -1, 'docs/final-paper.md documents the v5 editor closed set + its error code')
  const v2src = existsSync(join(REPO, 'vibe-math-v2', 'vibe-math-v2.js')) ? readFileSync(join(REPO, 'vibe-math-v2', 'vibe-math-v2.js'), 'utf8') : ''
  const v2doc = existsSync(join(REPO, 'vibe-math-v2', '实现方案.md')) ? readFileSync(join(REPO, 'vibe-math-v2', '实现方案.md'), 'utf8') : ''
  ok((v2src.match(/verifyTasksView\(/g) || []).length >= 3, 'v2 produces status+report through ONE verifyTasksView helper')
  ok(v2doc.indexOf('verifyTasksView') !== -1, 'the v2 design doc states the single-source status/report helper')
}

console.log('')
console.log('=== MATH COMPUTATION PARITY: ' + passed + ' passed, ' + failed + ' failed ===')
if (failures.length) for (const f of failures) console.error('  - ' + f)
process.exit(failed === 0 ? 0 : 1)

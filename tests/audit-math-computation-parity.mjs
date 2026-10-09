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
const PRESETS = ['vibe-math-v2', 'vibe-math-v3', 'vibe-math-v4', 'vibe-math-v5', 'vibe-math-v5r', 'vibe-math-vmu']
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

// ---- extracted predicates (shared by the checks below AND by --self-probe) -----------------------
// §7/§8 used to compute these inline; extracting them is what lets the self-probe feed the SAME
// predicates deliberately broken strings. Keep the two users in sync by construction: both call these.
const SUPPORTED_PLACEHOLDERS = {
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
const stringsOfDescriptor = (d) => [].concat(
  Object.values(d.scriptArgv || {}).filter((x) => typeof x === 'string'),
  Object.values(d.evalArgv || {}).filter((x) => typeof x === 'string'),
  ((d.packageProbe && d.packageProbe.argv) || []).filter((x) => typeof x === 'string'),
  typeof d.probeCode === 'string' ? [d.probeCode] : [],
  (d.install ? [].concat(d.install.userArgv || [], d.install.systemArgv || [], d.install.uninstallArgv || []) : []).filter((x) => typeof x === 'string'),
)
/** Placeholders used by descriptors that the module does not KNOW about. Unit: placeholder occurrences. */
function unknownPlaceholders(src, all) {
  const out = []
  for (const name of Object.keys(all)) {
    for (const str of stringsOfDescriptor(all[name])) {
      for (const m of (str.match(/<[a-z.]+>|__[A-Z]+__/g) || [])) if (!(m in SUPPORTED_PLACEHOLDERS)) out.push(name + ':' + m)
    }
  }
  return out
}
/** Known placeholders whose implementation is missing from the module. Unit: placeholder occurrences. */
function unimplementedPlaceholders(src, all) {
  const out = []
  for (const name of Object.keys(all)) {
    for (const str of stringsOfDescriptor(all[name])) {
      for (const m of (str.match(/<[a-z.]+>|__[A-Z]+__/g) || [])) {
        if ((m in SUPPORTED_PLACEHOLDERS) && SUPPORTED_PLACEHOLDERS[m] && src.indexOf(SUPPORTED_PLACEHOLDERS[m]) === -1) out.push(name + ':' + m)
      }
    }
  }
  return out
}
/** The substitution must be STRING-level so embedded forms (matlab run('<script>')) are covered. */
const stringLevelSubstitution = (src) => /String\(a\)\.split\('<script>'\)\.join\(/.test(src) && /String\(a\)\.split\('<expr>'\)\.join\(/.test(src)
/** §8: the descriptor declares the policy / the module consumes it / nothing is hard-coded. */
const cliDeclaresPolicy = (eng) => /policy:\s*\{\s*requiresMathMode:\s*'typed\+shell',\s*requiresEngineInList:\s*true\s*\}/.test(eng)
const cliConsumesPolicy = (mod) => (mod.match(/CLI_POLICY\.requiresMathMode/g) || []).length >= 2 && (mod.match(/CLI_POLICY\.requiresEngineInList/g) || []).length >= 1
const cliNoHardCoded = (mod) => !/mathMode !== 'typed\+shell'/.test(mod)
/** §8: the shared refusal shape must surface the descriptor value (the OLD literal had only reason). */
const refusalSurfacesPolicy = (n) => !!n && n.reason === 'policy' && n.requiresMathMode === 'typed+shell'

// ---- `--self-probe`: the SAME predicates against deliberately broken inputs (shipped form of the
// was-dev-only proofs `descriptor-sweep-proof.mjs` + `cli-policy-proof.mjs`). No repo mutation.
async function selfProbe() {
  const mod = read('vibe-math-v2/math-computation.js')
  const eng = read('vibe-math-v2/math-engines.js')
  const { MATH_ENGINES, MATH_P2_ENGINES } = await import(pathToFileURL(join(REPO, 'vibe-math-v2', 'math-engines.js')).href)
  const all = Object.assign({}, MATH_ENGINES, MATH_P2_ENGINES)
  const LIT = /<script>/
  const matlabTemplate = ['-batch', "run('<script>')"]
  const preFix = (tmpl, abs) => tmpl.map((a) => (a === '<script>' ? abs : a))
  const postFix = (tmpl, abs) => tmpl.map((a) => String(a).split('<script>').join(abs))
  const cases = [
    ['§7 substitution is STRING-level (matlab embedding covered)', stringLevelSubstitution(mod),
      stringLevelSubstitution(mod.replace("String(a).split('<script>').join(payload.scriptAbs)", "a === '<script>' ? payload.scriptAbs : a"))],
    ['§7 descriptors use only KNOWN placeholders', unknownPlaceholders(mod, all).length === 0,
      unknownPlaceholders(mod, Object.assign({}, all, { probe: { scriptArgv: { x: '<mysterySlot>' } } })).length > 0],
    ['§7 known placeholders are IMPLEMENTED in the module', unimplementedPlaceholders(mod, all).length === 0,
      unimplementedPlaceholders('/* no implementation */', all).length === 0],
    ['§7 the guard predicate catches what the OLD substitution produced', postFix(matlabTemplate, 'ABS').every((a) => !LIT.test(a)),
      preFix(matlabTemplate, 'ABS').every((a) => !LIT.test(a))],
    ['§8 the module CONSUMES the descriptor policy', cliConsumesPolicy(mod),
      cliConsumesPolicy(mod.replace(/CLI_POLICY\./g, 'HARDCODED.'))],
    ['§8 no hard-coded policy comparison remains', cliNoHardCoded(mod),
      cliNoHardCoded(mod + "\\n  if (params.mathMode !== 'typed+shell') { /* hard-coded revert */ }")],
    ['§8 descriptor DECLARES the policy', cliDeclaresPolicy(eng),
      cliDeclaresPolicy(eng.replace("policy: { requiresMathMode: 'typed+shell', requiresEngineInList: true }", 'policy: null'))],
    ['§8 the shared refusal surfaces the descriptor value (OLD literal caught)',
      refusalSurfacesPolicy({ reason: 'policy', requiresMathMode: 'typed+shell' }),
      refusalSurfacesPolicy({ reason: 'policy' })],
  ]
  let bad = 0
  for (const [name, greenNow, redWhenBroken] of cases) {
    const good = greenNow === true && redWhenBroken === false
    if (!good) bad++
    console.log((good ? '  ok   ' : '  FAIL ') + name + ' :: green-now=' + greenNow + ' broken-goes-red=' + !redWhenBroken)
  }
  console.log('=== MATH PARITY SELF-PROBE: ' + (cases.length - bad) + '/' + cases.length + ' as required ===')
  return bad === 0
}
if (process.argv.includes('--self-probe')) process.exit(await selfProbe() ? 0 : 1)


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
  ok(distinct.length === 1 && hashes[distinct[0]].length === PRESETS.length, PRESETS.length + ' copies of ' + f + ' are byte-identical', distinct.length + ' distinct hash(es)')
  const canon = join(CANON, f)
  if (existsSync(canon)) ok(sha(canon) === distinct[0], f + ' matches the canonical source', sha(canon).slice(0, 16) + ' vs ' + String(distinct[0]).slice(0, 16))
  else console.log('  note canonical source absent (published tree) - ' + PRESETS.length + '-way comparison only')
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
  const all = Object.assign({}, E.MATH_ENGINES, E.MATH_P2_ENGINES)
  const unknown = unknownPlaceholders(src, all)
  const unimplemented = unimplementedPlaceholders(src, all)
  ok(stringLevelSubstitution(src),
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
  ok(cliDeclaresPolicy(eng),
    'the cli descriptor DECLARES its policy (requiresMathMode + requiresEngineInList)')
  ok(cliConsumesPolicy(mod),
    'the module CONSUMES the descriptor policy (both refusal sites read CLI_POLICY)')
  ok(cliNoHardCoded(mod),
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

// S4/S5 (install-failure discrimination) is asserted in tests/math-computation-shared.test.mjs §33, NOT
// here: parity reads the shipped copy unconditionally, so a mutant cannot reach what it reads (the
// assertion would exist but could never redden). What parity keeps is the canonical<->copy byte identity,
// which makes a canonical-only change impossible to ship unnoticed - a stronger defence than a text grep.
// ── 11. S6: the version policy has ONE wording (constant + helper), not one per path.
{
  const mc = readFileSync(join(REPO, 'vibe-math-v2', 'math-computation.js'), 'utf8')
  ok((mc.match(/version-constraints-are-existence-only: /g) || []).length === 1, '★ S6: the policy wording appears exactly ONCE (in MATH_VERSION_POLICY)')
  ok(/function mathVersionPolicy\(/.test(mc), 'S6: the shared helper mathVersionPolicy() exists')
  ok(mc.indexOf('版本求解交给包管理器（本工具只检查是否已安装') === -1, '★ S6: the old divergent install-plan wording is gone')
  ok(/versionPolicy: mathVersionPolicy\(args\.packages/.test(mc), 'S6: the install plan builds its wording through the helper')
  ok((mc.match(/只检查是否存在；版本求解交给包管理器/g) || []).length === 1, '★ S6: the policy clause literal appears exactly ONCE (MATH_VERSION_POLICY_CLAUSE)')
  ok(/const MATH_VERSION_POLICY = .*MATH_VERSION_POLICY_CLAUSE/.test(mc), 'S6: the long policy sentence is DERIVED from the clause')
  ok(/MATH_MISSING_PACKAGES[\s\S]{0,120}MATH_VERSION_POLICY_CLAUSE/.test(mc), 'S6: the missing-package detail derives the clause')
}

console.log('=== MATH COMPUTATION PARITY: ' + passed + ' passed, ' + failed + ' failed ===')
if (failures.length) for (const f of failures) console.error('  - ' + f)
process.exit(failed === 0 ? 0 : 1)

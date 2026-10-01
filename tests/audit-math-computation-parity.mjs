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
import { fileURLToPath } from 'node:url'

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
  const E = await import(new URL('../vibe-math-v2/math-engines.js', import.meta.url).href)
  const order = E.MATH_ENGINE_ORDER
  ok(JSON.stringify(order) === JSON.stringify(['python', 'r', 'octave', 'julia', 'matlab', 'maple', 'wolfram', 'cli']), 'MATH_ENGINE_ORDER is exactly the P1 set')
  ok(E.MATH_ENGINES.cli.defaultOn === true, 'cli is flagged defaultOn')
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
  // Exclude the two helper DEFINITIONS (`function next(kind, extra)`, and `bad(reason, …)`'s
  // `reason: reason` pass-through): those are plumbing, not emitted vocabulary.
  const callSites = src.split(/\r?\n/).filter((l) => !/^\s*(async\s+)?function\s+(next|bad)\s*\(/.test(l)).join('\n')
  const nextFirst = [...callSites.matchAll(/\bnext\(\s*([^,)]*)/g)].map((m) => m[1].trim())
  const nonLiteralKinds = nextFirst.filter((a) => !/^'[a-z-]+'$/.test(a))
  ok(nonLiteralKinds.length === 0, 'every next(kind, …) kind is a STRING LITERAL (machine-extractable vocabulary)', 'non-literal: ' + JSON.stringify(nonLiteralKinds.slice(0, 3)))
  const reasonFields = [...callSites.matchAll(/\breason:\s*([^,}\n]*)/g)].map((m) => m[1].trim())
  const nonLiteralReasons = reasonFields.filter((v) => !/^'[a-z-]+'$/.test(v))
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

console.log('')
console.log('=== MATH COMPUTATION PARITY: ' + passed + ' passed, ' + failed + ' failed ===')
if (failures.length) for (const f of failures) console.error('  - ' + f)
process.exit(failed === 0 ? 0 : 1)

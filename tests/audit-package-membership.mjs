#!/usr/bin/env node
/**
 * PACKAGE MEMBERSHIP - every guard/harness meant to ship is listed in package.json#files.
 *
 * DEFECT CLASS: "shipped guard whose proving harness is not in the tarball" (the ship rule: a guard
 * ships together with its harness). A package reader could not reproduce the proof.
 *
 * The intended shipped set is stated EXPLICITLY, not globbed blindly: every tests/*.mutants.mjs on
 * disk must be listed, and every tests/*.mjs cited by the guard index must be listed unless it is in
 * EXCLUDED (documented, deliberate exclusions - e.g. audit-market-metadata.test.mjs asserts its own
 * absence because it checks repo-only image artifacts).
 *
 * Run: node tests/audit-package-membership.mjs
 * Env: PACKAGE_JSON=<path>  (used by the mutants harness to point at a mutated copy)
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
// ROUND 15 / task-113: the preset source roots come from the installer itself (not a copy), and the exemption
// table is the ONE place a "deliberately not shipped" path is named (shape + the six anti-drift switches: see
// tests/_lib/package-exemptions.mjs).
import { PRESETS } from '../installer.js'
import { PACKAGE_EXEMPTIONS, GATE_ROUND } from './_lib/package-exemptions.mjs'
const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..')
const PKG = process.env.PACKAGE_JSON || join(REPO, 'package.json')
const EXCLUDED = new Set(['tests/audit-market-metadata.test.mjs', 'tests/audit-diagram-assets.test.mjs'])
let passed = 0, failed = 0
const failures = []
const ok = (cond, label, detail) => { if (cond) { passed++ } else { failed++; failures.push(label + (detail ? ' — ' + detail : '')) } }
const pkg = JSON.parse(readFileSync(PKG, 'utf8'))
const listed = new Set(pkg.files)

// STRICT IMPORT PARSER (task-156 / TB-2674). The shipped regex pair below had two measured defects:
//   (a) semicolon-less style let `/^[ \t]*(import|export)\b[^;]*?from\s+['"](\.[^'"]+)['"]/` run PAST a
//       non-relative specifier (`from 'node:fs'`) on the next line and pair it with a much later relative
//       `from './x'` — measured on tests/_lib/falsify.mjs and tests/legacy/formal-verify-v2.test.mjs;
//   (b) a fixture embedded as a JS string (`"import ... from './_lib/falsify.mjs'"`) matched the same shape
//       and was reported as a real import.
// Fix: (1) blank template literals and comments (keeping newline/column positions), (2) scan statement by
// statement (a statement starts at column 0 with import/export and continues while brackets are unbalanced),
// (3) lex the statement into word/string tokens and accept a specifier only when the STRING token is
// immediately preceded by the `from` WORD token (or is the bare `import '<rel>'` form). Strings inside
// strings are one token, so fixture text cannot impersonate an import.
const strictImportsOf = (src) => {
  const blank = (m) => m.replace(/[^\n]/g, ' ')
  const code = src
    .replace(/`(?:\\[\s\S]|[^`\\])*`/g, blank)
    .replace(/\/\*[\s\S]*?\*\//g, blank)
    .replace(/(^|[ \t])\/\/[^\n]*/gm, (m, lead) => lead + ' '.repeat(m.length - lead.length))
  const bracketDelta = (s) => { let d = 0; for (const c of s) { if (c === '{' || c === '(' || c === '[') d++; else if (c === '}' || c === ')' || c === ']') d-- } return d }
  const specifierOf = (stmt) => {
    const toks = []
    let i = 0
    while (i < stmt.length) {
      const c = stmt[i]
      if (c === '/' && stmt[i + 1] === '/') { const j = stmt.indexOf('\n', i); if (j < 0) break; i = j; continue }
      if (c === '/' && stmt[i + 1] === '*') { const j = stmt.indexOf('*/', i + 2); i = j < 0 ? stmt.length : j + 2; continue }
      if (c === "'" || c === '"') { let j = i + 1; let v = ''; while (j < stmt.length) { if (stmt[j] === '\\') { v += stmt[j + 1] || ''; j += 2; continue } if (stmt[j] === c) break; v += stmt[j]; j++ } toks.push({ type: 'str', value: v }); i = j + 1; continue }
      if (c === '`') { let j = i + 1; while (j < stmt.length) { if (stmt[j] === '\\') { j += 2; continue } if (stmt[j] === '`') break; j++ } toks.push({ type: 'tmpl', value: '' }); i = j + 1; continue }
      if (/[A-Za-z_$]/.test(c)) { let j = i; while (j < stmt.length && /[A-Za-z0-9_$]/.test(stmt[j])) j++; toks.push({ type: 'word', value: stmt.slice(i, j) }); i = j; continue }
      i++
    }
    for (let k = 0; k < toks.length; k++) {
      const t = toks[k]
      if (t.type !== 'str' || !t.value.startsWith('.')) continue
      const prev = toks[k - 1]
      if (prev && prev.type === 'word' && prev.value === 'from') return t.value
      if (k === 1 && toks[0].type === 'word' && toks[0].value === 'import') return t.value
    }
    return null
  }
  const lines = code.split('\n')
  const out = []
  for (let i = 0; i < lines.length; i++) {
    if (!/^(?:import|export)\b/.test(lines[i])) continue
    let stmt = lines[i]
    let depth = bracketDelta(lines[i])
    while (depth > 0 && i + 1 < lines.length) { i++; stmt += '\n' + lines[i]; depth += bracketDelta(lines[i]) }
    const spec = specifierOf(stmt)
    if (spec) out.push(spec)
  }
  return out
}

// SELF-PROBE for the strict parser: it must ignore fixture text / comment examples, must not pair across a
// non-relative specifier, and must still see statement / side-effect / re-export / after-node:fs imports.
{
  const cases = [
    ["const data = \"from './nope-data.js'\"", false],
    ["const fn = (s) => s.replace(\"from './nope-arg.js'\", 'x')", false],
    ["// import x from './nope-comment.js'", false],
    ["/* import x from './nope-block.js' */", false],
    ["import { a } from './real-statement.js'", true],
    ["import './real-side-effect.js'", true],
    ["export * from './real-reexport.js'", true],
    ["import { c } from 'node:fs'\nimport { d } from './real-after-node.js'", true],
  ]
  const got = []
  for (const [text, want] of cases) {
    const specs = strictImportsOf(text)
    const okCase = want
      ? specs.some((s) => s.startsWith('./real-'))
      : specs.length === 0
    ok(okCase, `strict import self-probe: ${JSON.stringify(text)} -> ${JSON.stringify(specs)}`)
    got.push(...specs)
  }
  ok(!got.some((s) => s.includes('nope')), 'strict import self-probe: no fixture text was read as an import')
}
const disk = readdirSync(join(REPO, 'tests')).filter((f) => f.endsWith('.mjs'))
const mutants = disk.filter((f) => /\.mutants\.mjs$/.test(f)).map((f) => 'tests/' + f).sort()
const unlistedMutants = mutants.filter((f) => !listed.has(f) && !EXCLUDED.has(f))
ok(mutants.length > 0, 'there is at least one proving harness on disk')
ok(unlistedMutants.length === 0, 'every tests/*.mutants.mjs on disk is listed in package.json#files', JSON.stringify(unlistedMutants))
// guard-index citations: tests/*.mjs paths mentioned in the checklist
const idx = readFileSync(join(REPO, 'docs', 'AUDIT-CHECKLIST.md'), 'utf8')
const cited = [...new Set((idx.match(/tests\/[A-Za-z0-9._-]+\.mjs/g) || []))]
const unlistedCited = cited.filter((f) => !listed.has(f) && !EXCLUDED.has(f))
ok(cited.length > 0, 'the guard index cites at least one test file')
ok(unlistedCited.length === 0, 'every guard-index-cited test file is listed (or explicitly excluded)', JSON.stringify(unlistedCited))
ok(listed.has('tests/audit-package-membership.mjs'), 'this audit itself ships')
ok(!listed.has('tests/audit-market-metadata.test.mjs'), 'the self-excluded repo-only guard is NOT listed (its own assertion)')
const missingPaths = [...listed].filter((f) => !existsSync(join(REPO, f)))
// docs sibling rule: a doc cited by a SHIPPED file must ship too (docs/** was previously uncovered).
const citers = ['README.md', 'README.en.md', 'docs/AUDIT-CHECKLIST.md', 'docs/COMPAT-AUDIT-ROUND2.md']
const docRefs = new Set()
for (const c of citers) {
  const cp = join(REPO, c)
  if (!existsSync(cp)) continue
  for (const m of readFileSync(cp, 'utf8').matchAll(/docs\/[A-Za-z0-9._-]+\.md/g)) docRefs.add(m[0])
}
ok(docRefs.size > 0, 'shipped files cite at least one docs/*.md')
const unlistedDocs = [...docRefs].filter((f) => !listed.has(f))
ok(unlistedDocs.length === 0, 'every docs/*.md cited by a shipped file is listed in package.json#files', JSON.stringify(unlistedDocs))
// DESIGN VOLUME COMPLETENESS: the vmu doc set GROWS (00 §3.1 allows volumes 15+), and a new volume once
// shipped on disk while being absent from package.json#files - the guard index cannot see that, because
// nothing cites the new file yet. The set itself is what must ship.
const volumes = readdirSync(join(REPO, 'vibe-math-vmu', 'docs'))
  .filter((f) => /^\d\d-[A-Za-z0-9-]+\.md$/.test(f))
  .map((f) => 'vibe-math-vmu/docs/' + f)
  .sort()
ok(volumes.length >= 15, 'the design volumes on disk were found', String(volumes.length))
const unlistedVolumes = volumes.filter((f) => !listed.has(f))
ok(unlistedVolumes.length === 0, 'every design volume on disk is listed in package.json#files', JSON.stringify(unlistedVolumes))
// SHARED BY BOTH BLOCKS (module scope): the VMU closure and the long-tail decision surface both need to read a
// file's relative imports. One cache, one parser, one place to fix.
const importCache = new Map()
const relativeImportsOf = (absFile) => {
  if (importCache.has(absFile)) return importCache.get(absFile)
  let text = ''
  try { text = readFileSync(absFile, 'utf8') } catch { importCache.set(absFile, []); return [] }
  const specs = strictImportsOf(text)
  importCache.set(absFile, specs)
  return specs
}

// IMPORT CLOSURE: every RELATIVE import inside the vmu package must be shipped by the installer. This is the
// gate for a defect class that shipped twice (kernel/work.js once, kernel/minutes.js again): a new module is
// imported by index.js, the two installer audits stay green, and the tarball crashes on the user's machine with
// MODULE_NOT_FOUND. The check is static and cheap: resolve each relative specifier, require the target file to
// be listed in package.json#files.
// ROUND 14 (vmu-verify2): the sentence that used to end this comment claimed this gate ALSO checks "for runtime
// modules, in the installer's preset asset list". MEASURED, that was false - `PRESETS` appears ZERO times in this
// file and `:127` only compares `listed` (package.json#files). One fact, one gate: the `files[] -> PRESETS` edge
// belongs to `tests/audit-installer-policy.test.mjs §8` (`:251-261`), which owns it and is green. Stated, not
// duplicated - a comment that claims a check nobody wrote is the same defect as a gate that claims a fact it
// never read (docs/11 §4.2 第十三条).
{
  const VMU = join(REPO, 'vibe-math-vmu')
  const jsFiles = []
  // INDEPENDENT REVIEW FINDING (round 7): walking only `vibe-math-vmu/` left a real hole - a test file that
  // imports a kernel module by RELATIVE path (`tests/vmu-crypto.test.mjs: import ... from '../vibe-math-vmu/
  // kernel/crypto.js'`) was never checked, so a module could be imported by a test and shipped nowhere while
  // this gate stayed green. `tests/` is walked now for the same closure property.
  const walk = (d, n) => {
    if (n > 4) return
    for (const e of readdirSync(d, { withFileTypes: true })) {
      if (e.name === 'node_modules' || e.name === '.git') continue
      const p = join(d, e.name)
      if (e.isDirectory()) walk(p, n + 1)
      else if (e.name.endsWith('.js') || e.name.endsWith('.mjs')) jsFiles.push(p)
    }
  }
  walk(VMU, 0)
  // Only the SUITE files are walked under tests/: an audit that quotes an example import inside a comment (this
  // very file does, explaining the round-7 finding) would otherwise report its own illustration as a missing
  // module. The closure property we care about is "the code and the suites that exercise it are shipped".
  for (const f of readdirSync(join(REPO, 'tests'))) {
    if (/^vmu-.*\.test\.mjs$/.test(f)) jsFiles.push(join(REPO, 'tests', f))
  }
  // SHAPE CRITERION (round 4 -> REWRITTEN task-156 / TB-2674). The regex pair that stood here had two MEASURED
  // defects: (a) semicolon-less style let `/^[ \t]*(import|export)\b[^;]*?from\s+['"](\.[^'"]+)['"]/` run PAST a
  // non-relative specifier (`from 'node:fs'`) and pair it with a much later relative `from './x'`;
  // (b) a fixture embedded as a JS string matched the same shape and was reported as a real import. The fix lives
  // at module scope (`strictImportsOf`, self-probed): blank template literals/comments, scan statement by
  // statement, lex tokens, accept a specifier only when it is the string token right after the `from` word.
  const missing = []
  for (const f of jsFiles) {
    for (const spec of relativeImportsOf(f)) {
      const target = resolve(dirname(f), spec)
      const rel = relative(REPO, target).replace(/\\/g, '/')
      if (!listed.has(rel)) missing.push(f.replace(REPO + '\\', '') + ' -> ' + spec)
    }
  }
  ok(missing.length === 0, 'every relative import inside the vmu package is shipped (no MODULE_NOT_FOUND class)',
    missing.slice(0, 6).join(' | '))
}
// LONG-TAIL DECISION SURFACE (task-156 / TB-2674; Lead ruling 2026-11-09: option B).
//
// `files[]` is the explicit publish surface. Being absent from it is NOT by itself an error, but every
// code file in the long-tail directories below MUST be explicitly decided, in precedence order:
//   in-files  >  dev-only  >  in-legacy-baseline  >  MISS (RED)
// The legacy baseline is FROZEN and SHRINK-ONLY: its entries predate `generatedAt`; adding a newer file
// to it is RED (that is how a baseline becomes a trash can), and a missing file is RED as a stale entry.
// It is regenerated only in a Lead-triggered close-out window (`node scripts/...` by the Lead), never ad hoc.
{
  const DEVONLY_PATH = join(REPO, 'tests', 'package-membership-dev-only.json')
  const LEGACY_PATH = join(REPO, 'tests', '_lib', 'package-membership-legacy.json')
  const WHY_MIN = 24
  const readJsonOr = (p, dflt) => (existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : dflt)
  const norm = (p) => p.split(sep).join('/')
  const walkCode = (dir, acc) => {
    if (!existsSync(dir)) return acc
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (e.name === 'node_modules' || e.name === '.git') continue
      const p = join(dir, e.name)
      if (e.isDirectory()) walkCode(p, acc)
      else if (/\.(mjs|js)$/.test(e.name)) acc.push(norm(relative(REPO, p)))
    }
    return acc
  }
  const surfaceTargets = new Set()
  for (const rel of walkCode(join(REPO, 'tests'), [])) {
    const base = rel.split('/').pop()
    if (rel.endsWith('.test.mjs') || base.startsWith('audit-') || rel.startsWith('tests/_lib/')) surfaceTargets.add(rel)
  }
  for (const rel of walkCode(join(REPO, 'scripts', 'sim'), [])) surfaceTargets.add(rel)

  // dev-only ledger: why >= 24 code points + owner are required; blank/short why is RED.
  const devRaw = readJsonOr(DEVONLY_PATH, [])
  const devEntries = Array.isArray(devRaw) ? devRaw : (devRaw.entries || [])
  const whyOk = (e) => {
    const why = String((e && e.why) || '').trim()
    return [...why].length >= WHY_MIN && String((e && e.owner) || '').trim().length > 0
  }
  const devInvalid = devEntries.filter((e) => !whyOk(e)).map((e) => e && e.path)
  const devSet = new Set(devEntries.filter(whyOk).map((e) => e.path))
  const devGone = [...devSet].filter((p) => !existsSync(join(REPO, p)))

  // frozen legacy baseline
  const legacyDoc = readJsonOr(LEGACY_PATH, { paths: [] })
  const legacyPaths = Array.isArray(legacyDoc.paths) ? legacyDoc.paths : []
  const legacySet = new Set(legacyPaths)
  const legacySha = createHash('sha256').update(legacyPaths.join('\n'), 'utf8').digest('hex')
  const legacyShaOk = !legacyDoc.sha256OfPaths || legacySha === legacyDoc.sha256OfPaths
  // "NEW SURFACE" IS A GIT FACT, NOT A FILE-TIME FACT. The first version of this guard asked the filesystem
  // (statSync birthtime) whether a file was born after legacyDoc.generatedAt, and it went red on two files that had
  // existed for hundreds of rounds: they were rewritten by copy-and-replace while applying a mutation patch, and on
  // NTFS that gives the new inode a fresh birthtime (measured 2026-11-10 02:47Z: tests/vmu-meeting-types.test.mjs and
  // tests/vmu-run31-status-board.test.mjs, born 18:47Z vs baseline generatedAt 13:14Z, both present in HEAD for
  // months). Rewriting a file is not creating one; a clock cannot tell them apart, and neither can ctime.
  // The property we actually mean is "git did not have this path when the baseline was frozen", so ask git.
  const gitHeadPaths = () => {
    const r = spawnSync('git', ['ls-tree', '-r', '--name-only', 'HEAD'], { cwd: REPO, encoding: 'utf8' })
    if (r.status !== 0) throw new Error('git ls-tree failed, so the legacy-baseline swallow guard cannot be measured')
    return new Set(String(r.stdout || '').split('\n').filter(Boolean))
  }
  const headPaths = gitHeadPaths()
  const inHeadTree = (rel) => headPaths.has(rel)
  const staleLegacy = legacyPaths.filter((p) => !existsSync(join(REPO, p)) || !surfaceTargets.has(p))
  const swallowedNewSurface = legacyPaths.filter((p) => surfaceTargets.has(p) && !inHeadTree(p))
  const redundantLegacy = legacyPaths.filter((p) => listed.has(p))
  const redundantDevOnly = [...devSet].filter((p) => listed.has(p))

  // pure three-way classification (self-probed below)
  const classify = (rel, ctx) =>
    ctx.listed.has(rel) ? 'in-files' : ctx.dev.has(rel) ? 'dev-only' : ctx.legacy.has(rel) ? 'in-legacy-baseline' : 'MISS'
  const ctx = { listed, dev: devSet, legacy: legacySet }
  const probeCase = (rel, l, d, g, want) => ok(classify(rel, { listed: new Set(l), dev: new Set(d), legacy: new Set(g) }) === want, `membership classify self-probe: ${rel} -> ${want}`)
  probeCase('tests/x.test.mjs', ['tests/x.test.mjs'], [], [], 'in-files')
  probeCase('tests/x.test.mjs', [], ['tests/x.test.mjs'], [], 'dev-only')
  probeCase('tests/x.test.mjs', [], [], ['tests/x.test.mjs'], 'in-legacy-baseline')
  probeCase('tests/x.test.mjs', [], [], [], 'MISS')
  // self-probe for the swallow rule: the guard is a pure function of "surface ∩ legacy ∩ not-in-HEAD".
  {
    const legacy = ['tests/old.test.mjs', 'tests/new.test.mjs', 'notes.md']
    const surface = new Set(['tests/old.test.mjs', 'tests/new.test.mjs'])
    const head = new Set(['tests/old.test.mjs'])
    const swallowed = legacy.filter((p) => surface.has(p) && !head.has(p))
    ok(swallowed.length === 1 && swallowed[0] === 'tests/new.test.mjs',
      'self-probe: a path in the legacy baseline that git does not have is swallowed new surface (one entry, named)', swallowed)
    const noHead = legacy.filter((p) => surface.has(p) && !new Set(['tests/old.test.mjs', 'tests/new.test.mjs']).has(p))
    ok(noHead.length === 0, 'self-probe: when git HAS both paths, the same baseline is not a violation (guard is not just "legacy is non-empty")', noHead)
  }

  const states = { 'in-files': [], 'dev-only': [], 'in-legacy-baseline': [], MISS: [] }
  for (const rel of surfaceTargets) states[classify(rel, ctx)].push(rel)
  const miss = states.MISS.sort()

  // import closure: a published target's relative imports must also be published; a decided target's
  // imports must at least be decided (no new surface may hide behind a legacy/dev-only file).
  const decisionOf = (rel) => classify(rel, ctx)
  const closureMiss = []
  const closureWeak = []
  for (const rel of surfaceTargets) {
    const state = decisionOf(rel)
    for (const spec of relativeImportsOf(join(REPO, rel))) {
      const target = norm(relative(REPO, resolve(dirname(join(REPO, rel)), spec)))
      if (!existsSync(join(REPO, target))) continue
      const ts = decisionOf(target)
      if (state === 'in-files') { if (ts !== 'in-files') closureMiss.push(`${rel} -> ${target} (${ts})`) }
      else if (ts === 'MISS') closureWeak.push(`${rel} -> ${target}`)
    }
  }

  const detail = (label, arr) => {
    if (arr.length) console.log(`  ${label} (${arr.length}): ${arr.slice(0, 8).join(', ')}${arr.length > 8 ? ' …' : ''}`)
  }
  detail('legacy stale', staleLegacy)
  detail('legacy swallowed new surface', swallowedNewSurface)
  detail('legacy redundant (now in files)', redundantLegacy)
  detail('legacy sha mismatch', legacyShaOk ? [] : ['sha256OfPaths changed'])
  detail('dev-only invalid why/owner', devInvalid)
  detail('dev-only gone', devGone)
  detail('dev-only redundant (also in files)', redundantDevOnly)
  detail('closure missing (published -> unregistered)', closureMiss)
  detail('closure weak (decided -> unregistered)', closureWeak)
  detail('MISS (undecided long-tail code)', miss)

  ok(surfaceTargets.size > 0, `long-tail surface discovered (${surfaceTargets.size} code file(s): in-files ${states['in-files'].length}, dev-only ${states['dev-only'].length}, legacy ${states['in-legacy-baseline'].length}, MISS ${miss.length})`)
  ok(miss.length === 0, `every long-tail code file is explicitly decided — ${miss.length} MISS`)
  ok(closureMiss.length === 0, `published targets import only published targets — ${closureMiss.length} gap(s)`)
  ok(closureWeak.length === 0, `decided targets never import an undecided file — ${closureWeak.length} gap(s)`)
  ok(devInvalid.length === 0, `dev-only entries carry why >= ${WHY_MIN} code points and an owner — ${devInvalid.length} invalid`)
  ok(devGone.length === 0, `dev-only entries point at existing files — ${devGone.length} gone`)
  ok(redundantDevOnly.length === 0, `no dev-only entry is also published — ${redundantDevOnly.length} redundant`)
  ok(staleLegacy.length === 0, `legacy baseline has no stale entry (a missing file must be removed from the baseline) — ${staleLegacy.length} stale`)
  ok(swallowedNewSurface.length === 0, `legacy baseline may not swallow new surface — ${swallowedNewSurface.length} violation(s)`)
  ok(redundantLegacy.length === 0, `legacy baseline has no entry that is now in files — ${redundantLegacy.length} redundant`)
  ok(legacyShaOk, `legacy baseline sha256OfPaths matches its paths (${legacyPaths.length} entries)`)
}
ok(missingPaths.length === 0, 'every listed path exists', JSON.stringify(missingPaths))
const duplicateListed = pkg.files.filter((f, i) => pkg.files.indexOf(f) !== i)
ok(duplicateListed.length === 0, 'no path is listed twice in package.json#files (a duplicate is a silent no-op that hides which entry is load-bearing)', JSON.stringify(duplicateListed))

// PRESET SOURCE-ROOT DISK CLOSURE (round 15 / task-113) ------------------------------------------------
// THE HOLE THIS CLOSES (measured by vmu-pack2, round 14): the import-closure check above can only see a file that
// some RELATIVE STATEMENT-POSITION import points at. Two shipped kinds are STRUCTURALLY invisible to it - the
// loader imports packs by a COMPUTED path (`vibe-math-vmu.js:734` `await import('./packs/' + wanted + '/index.js')`)
// and pack data is read with readFileSync by directory name - and a `docs/**` file that is neither a design volume
// nor cited by a shipped doc is read by nothing at all. Measured on the round-14 tree: SEVEN files on disk under a
// preset source root were in NEITHER roster, and NO gate could report them (six `vibe-math-vmu/docs/audit/` working
// papers + `packs/example-data/README.md`).
// THE RULE: every file on disk under a `PRESETS[].src` root must be in `package.json#files` (written
// `<src>/<relative path>`) OR named in `tests/_lib/package-exemptions.mjs`. This is NOT the `files[] -> PRESETS`
// edge: that one belongs to `tests/audit-installer-policy.test.mjs §8` and is green (one fact, one gate).
// The same block proves the SIX anti-drift switches on the exemption table (criterion e/f/g + duplicate/blank/due),
// because an exemption table that cannot redden the thing it exempts is exactly the fake-green this audit exists for.
{
  const srcRoots = [...new Set(PRESETS.map((p) => p.src))]
  const ROUND = GATE_ROUND
  // depth 6 covers packs/<id>/prompts/... and docs/audit/...; the walk is bounded so a pathological tree cannot hang it.
  const walkRoot = (d, n, acc) => {
    if (n > 6 || !existsSync(d)) return acc
    for (const e of readdirSync(d, { withFileTypes: true })) {
      if (e.name === 'node_modules' || e.name === '.git') continue
      const p = join(d, e.name)
      if (e.isDirectory()) walkRoot(p, n + 1, acc)
      else acc.push(relative(REPO, p).replace(/\\/g, '/'))
    }
    return acc
  }
  const diskUnderRoots = []
  for (const src of srcRoots) walkRoot(join(REPO, src), 0, diskUnderRoots)
  // THE PREDICATE IS PURE, so the self-probes drive it on synthetic input and never touch the repository.
  const closureOf = ({ diskFiles, listedSet, exemptions }) => {
    const byPath = new Map(exemptions.map((e) => [e.path, e]))
    const seen = new Set()
    const dup = []
    for (const e of exemptions) { if (seen.has(e.path)) dup.push(e.path); seen.add(e.path) }
    return {
      missing: diskFiles.filter((f) => !listedSet.has(f) && !byPath.has(f)).sort(),
      gone: exemptions.filter((e) => !diskFiles.includes(e.path)).map((e) => e.path),
      redundant: exemptions.filter((e) => listedSet.has(e.path)).map((e) => e.path),
      blank: exemptions.filter((e) => !String(e.reason || '').trim() || !String(e.approvedBy || '').trim()).map((e) => e.path),
      due: exemptions.filter((e) => Number(e.reviewRound) <= ROUND).map((e) => e.path),
      dup,
    }
  }
  const real = closureOf({ diskFiles: diskUnderRoots, listedSet: listed, exemptions: PACKAGE_EXEMPTIONS })
  ok(PRESETS.length >= 1 && srcRoots.length >= 1,
    'the presets and their source roots were read FROM installer.js (not restated here; G4: only the shipped vmu preset remains)', PRESETS.length + '/' + srcRoots.length)
  ok(diskUnderRoots.length > 0 && PACKAGE_EXEMPTIONS.length > 0,
    'non-vacuous: the disk walk saw files and the exemption table is not empty',
    diskUnderRoots.length + ' files / ' + PACKAGE_EXEMPTIONS.length + ' exemptions')
  ok(real.missing.length === 0,
    'every file on disk under a preset source root is shipped (package.json#files) or NAMED in the exemption table',
    real.missing.slice(0, 6).join(' | '))
  ok(real.gone.length === 0, 'no exemption outlives its file (an exemption for a path that is gone is red)', real.gone.join(','))
  ok(real.redundant.length === 0, 'no exemption covers an already-shipped path (red: an exemption may not hide a registration)', real.redundant.join(','))
  ok(real.dup.length === 0, 'no path appears twice in the exemption table', real.dup.join(','))
  ok(real.blank.length === 0, 'every exemption carries a reason AND an approver', real.blank.join(','))
  console.log('  exemptions: ' + PACKAGE_EXEMPTIONS.length + ' named; review due at round ' + ROUND + ': ' + real.due.length
    + ' (REPORT-ONLY by Lead ruling, round 16: a due entry is never a red - self-probe 6b proves it)')
  // SELF-PROBES (docs/11 §4.2 第四条/第九条): each switch on synthetic input, so "the rule stopped biting" and
  // "the rule had nothing to bite" cannot look the same.
  const shipped = new Set(['a/shipped.js'])
  const ex = (path, over) => Object.assign({ path, reason: 'r', approvedBy: 'p', approveRound: 15, reviewRound: 25 }, over || {})
  const clean = closureOf({ diskFiles: ['a/shipped.js', 'a/exempt.md'], listedSet: shipped, exemptions: [ex('a/exempt.md')] })
  ok(clean.missing.length === 0 && clean.gone.length === 0 && clean.redundant.length === 0 && clean.dup.length === 0 && clean.blank.length === 0 && clean.due.length === 0,
    '★ SELF-PROBE 0: the CLEAN synthetic case is quiet - every probe below differs from it for a reason')
  const p1 = closureOf({ diskFiles: ['a/shipped.js', 'a/data.md'], listedSet: shipped, exemptions: [] })
  ok(p1.missing.length === 1 && p1.missing[0] === 'a/data.md',
    '★ SELF-PROBE 1 (criterion e): a pure-DATA file no import points at (`.md`/`.json` under packs/) that is neither shipped nor exempt IS reported BY NAME',
    JSON.stringify(p1.missing))
  const p2 = closureOf({ diskFiles: ['a/shipped.js'], listedSet: shipped, exemptions: [ex('a/gone.md')] })
  ok(p2.gone.length === 1, '★ SELF-PROBE 2 (criterion f): an exemption for a path GONE from disk is reported - an exemption may not outlive its file', JSON.stringify(p2.gone))
  const p3 = closureOf({ diskFiles: ['a/shipped.js'], listedSet: shipped, exemptions: [ex('a/shipped.js')] })
  ok(p3.redundant.length === 1, '★ SELF-PROBE 3 (criterion g): an exemption for a path that IS shipped is reported - an exemption may not cover a registration', JSON.stringify(p3.redundant))
  const p4 = closureOf({ diskFiles: ['a/exempt.md'], listedSet: new Set(), exemptions: [ex('a/exempt.md'), ex('a/exempt.md')] })
  ok(p4.dup.length === 1, '★ SELF-PROBE 4: the same path twice in the exemption table is reported', JSON.stringify(p4.dup))
  const p5 = closureOf({ diskFiles: ['a/exempt.md'], listedSet: new Set(), exemptions: [ex('a/exempt.md', { reason: '  ' })] })
  ok(p5.blank.length === 1, '★ SELF-PROBE 5: an exemption with an empty reason (or approver) is reported', JSON.stringify(p5.blank))
  const p6 = closureOf({ diskFiles: ['a/exempt.md'], listedSet: new Set(), exemptions: [ex('a/exempt.md', { reviewRound: ROUND })] })
  ok(p6.due.length === 1, '★ SELF-PROBE 6: an exemption whose reviewRound has arrived is COUNTED (visibility, never a silent pass)', JSON.stringify(p6.due))
  // SELF-PROBE 6b pins the LEAD RULING itself: "due" must stay a REPORT. Without this probe, someone could later
  // turn `due` into a red "for consistency" and no gate would notice that the ruling had been reversed.
  const p6b = closureOf({ diskFiles: ['a/exempt.md'], listedSet: new Set(), exemptions: [ex('a/exempt.md', { reviewRound: ROUND })] })
  ok(p6b.due.length === 1 && p6b.missing.length === 0 && p6b.gone.length === 0 && p6b.redundant.length === 0,
    '★ SELF-PROBE 6b (LEAD RULING): a DUE exemption is COUNTED and stays visible - it NEVER becomes a red (turning the accounting date into a gate failure would push people to edit the DATE instead of the content)',
    JSON.stringify({ due: p6b.due, missing: p6b.missing, gone: p6b.gone, redundant: p6b.redundant }))
}
console.log('')
console.log('=== PACKAGE MEMBERSHIP: ' + passed + ' passed, ' + failed + ' failed ===')
for (const f of failures) console.error('  - ' + f)
process.exit(failed === 0 ? 0 : 1)

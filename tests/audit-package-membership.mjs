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
import { dirname, join, relative, resolve } from 'node:path'
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
  // SHAPE CRITERION (round 4): an import is a STATEMENT, so `import`/`export` must START a line (indentation
  // allowed, `[^;]` keeps the match inside one statement) - that is what separates code from DATA and from PROSE.
  // Round 3 hit this class twice: `kernel/paper.js` quoted a settings key inside a COMMENT and the wired-schema
  // generator read it as a key, and `tests/vmu-activity-falsify.test.mjs` holds `"from './bus.js'"` as a STRING it
  // uses to rewrite a mutated copy - the previous text-only regex reported that string as a missing import. A gate
  // that reads prose as code is not a gate, and "narrow the needle" is not a fix: the guard must have the shape.
  const IMPORT_STATEMENT = /^[ \t]*(?:import|export)\b[^;]*?from\s+['"](\.[^'"]+)['"]/gm   // import … from '…'
  const SIDE_EFFECT_IMPORT = /^[ \t]*import\s+['"](\.[^'"]+)['"]/gm                        // import '…'
  const relativeImportsOf = (src) => {
    const out = []
    for (const re of [IMPORT_STATEMENT, SIDE_EFFECT_IMPORT]) for (const m of src.matchAll(re)) out.push(m[1])
    return out
  }
  // SELF-PROBE: the criterion must IGNORE a data string and a commented-out import while still finding the real
  // ones. Without this, "the gate stopped seeing imports" would look exactly like "no import is missing".
  {
    const probe = [
      'const data = "from \'./nope-data.js\'"',            // data, not an import
      "const fn = (s) => s.replace(\"from './nope-arg.js'\", 'x')",  // data inside a call
      "// import x from './nope-comment.js'",              // prose
      "import { a } from './real-statement.js'",           // REAL
      "import './real-side-effect.js'",                    // REAL (bare)
      "export * from './real-reexport.js'",                // REAL (re-export)
    ].join('\n')
    const got = relativeImportsOf(probe)
    ok(got.length === 3
      && got.includes('./real-statement.js') && got.includes('./real-side-effect.js') && got.includes('./real-reexport.js')
      && !got.some((x) => x.includes('nope')),
      '★ SELF-PROBE: the import criterion counts STATEMENT-POSITION imports (3 found) and ignores the data strings and the commented-out import that the old text-only regex reported',
      JSON.stringify(got))
  }
  const missing = []
  for (const f of jsFiles) {
    for (const spec of relativeImportsOf(readFileSync(f, 'utf8'))) {
      const target = resolve(dirname(f), spec)
      const rel = relative(REPO, target).replace(/\\/g, '/')
      if (!listed.has(rel)) missing.push(f.replace(REPO + '\\', '') + ' -> ' + spec)
    }
  }
  ok(missing.length === 0, 'every relative import inside the vmu package is shipped (no MODULE_NOT_FOUND class)',
    missing.slice(0, 6).join(' | '))
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
  ok(PRESETS.length >= 5 && srcRoots.length >= 5,
    'the presets and their source roots were read FROM installer.js (not restated here)', PRESETS.length + '/' + srcRoots.length)
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
  console.log('  exemptions: ' + PACKAGE_EXEMPTIONS.length + ' named; review due at round ' + ROUND + ': ' + real.due.length)
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
}
console.log('')
console.log('=== PACKAGE MEMBERSHIP: ' + passed + ' passed, ' + failed + ' failed ===')
for (const f of failures) console.error('  - ' + f)
process.exit(failed === 0 ? 0 : 1)

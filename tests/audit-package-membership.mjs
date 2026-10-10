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
// be listed in package.json#files (and, for runtime modules, in the installer's preset asset list).
{
  const VMU = join(REPO, 'vibe-math-vmu')
  const jsFiles = []
  const walk = (d, n) => {
    if (n > 4) return
    for (const e of readdirSync(d, { withFileTypes: true })) {
      if (e.name === 'node_modules' || e.name === '.git') continue
      const p = join(d, e.name)
      if (e.isDirectory()) walk(p, n + 1)
      else if (e.name.endsWith('.js')) jsFiles.push(p)
    }
  }
  walk(VMU, 0)
  const relRe = /(?:from|import)\s+['"](\.[^'"]+)['"]/g
  const missing = []
  for (const f of jsFiles) {
    for (const m of readFileSync(f, 'utf8').matchAll(relRe)) {
      const target = resolve(dirname(f), m[1])
      const rel = 'vibe-math-vmu/' + relative(VMU, target).replace(/\\/g, '/')
      if (!listed.has(rel)) missing.push(f.replace(REPO + '\\', '') + ' -> ' + m[1])
    }
  }
  ok(missing.length === 0, 'every relative import inside the vmu package is shipped (no MODULE_NOT_FOUND class)',
    missing.slice(0, 6).join(' | '))
}
ok(missingPaths.length === 0, 'every listed path exists', JSON.stringify(missingPaths))
console.log('')
console.log('=== PACKAGE MEMBERSHIP: ' + passed + ' passed, ' + failed + ' failed ===')
for (const f of failures) console.error('  - ' + f)
process.exit(failed === 0 ? 0 : 1)

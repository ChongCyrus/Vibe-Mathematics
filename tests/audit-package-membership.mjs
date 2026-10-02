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
import { dirname, join } from 'node:path'
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
ok(missingPaths.length === 0, 'every listed path exists', JSON.stringify(missingPaths))
console.log('')
console.log('=== PACKAGE MEMBERSHIP: ' + passed + ' passed, ' + failed + ' failed ===')
for (const f of failures) console.error('  - ' + f)
process.exit(failed === 0 ? 0 : 1)

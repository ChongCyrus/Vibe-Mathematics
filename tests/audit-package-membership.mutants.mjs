#!/usr/bin/env node
/**
 * Mutant harness for the package-membership audit: drop one listed entry from a COPY of package.json
 * and require the audit to go named-red. Run: node tests/audit-package-membership.mutants.mjs
 */
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
const HERE = fileURLToPath(new URL('./', import.meta.url))
const REPO = join(HERE, '..')
let passed = 0, failed = 0
const ok = (c, l, d) => { if (c) { passed++; console.log('  ok   ' + l) } else { failed++; console.log('  FAIL ' + l + (d ? ' — ' + d : '')) } }
const base = spawnSync(process.execPath, [join(HERE, 'audit-package-membership.mjs')], { cwd: REPO, encoding: 'utf8' })
ok(base.status === 0, 'baseline: the membership audit is green', String(base.stdout || '').trim().split('\n').slice(-1)[0])
const dir = mkdtempSync(join(tmpdir(), 'pkgmem-'))
const pkg = JSON.parse(readFileSync(join(REPO, 'package.json'), 'utf8'))
const victim = 'tests/audit-package-membership.mjs'
pkg.files = pkg.files.filter((f) => f !== victim)
writeFileSync(join(dir, 'package.json'), JSON.stringify(pkg, null, 2))
const mut = spawnSync(process.execPath, [join(HERE, 'audit-package-membership.mjs')], { cwd: REPO, encoding: 'utf8', env: Object.assign({}, process.env, { PACKAGE_JSON: join(dir, 'package.json') }) })
const out = String(mut.stdout || '') + String(mut.stderr || '')
ok(mut.status !== 0 && /this audit itself ships/.test(out), '★ removing a listed entry makes the membership audit RED (named assertion)', 'exit=' + mut.status)
rmSync(dir, { recursive: true, force: true })
console.log('')
console.log('=== PACKAGE MEMBERSHIP MUTANTS: ' + passed + ' passed, ' + failed + ' failed ===')
process.exit(failed === 0 ? 0 : 1)

#!/usr/bin/env node
/**
 * Mutant harness for the installer ASSERTION-QUALITY work (ships: `tests/*.mutants.mjs`).
 *
 * It replaces the dev-only scratch proofs (`_oneoff/auditR2/a78-mutants.mjs`, `a8-mutant.mjs`) so a package
 * reader can reproduce them from the tarball. Every case is a SINGLE-SITE edit to a COPY of installer.js,
 * injected through the guards' `INSTALLER_JS` env seam, and must redden the NAMED assertion:
 *
 *   A7-version    perturb the structured version the probe returns   -> compat: "STRUCTURED field: version"
 *   A7-source     make the structured source stop naming the service -> compat: "structured field naming the service"
 *   A8-failure    inject one failure line in the backup path         -> policy: "NOT reported as a failure (report-level"
 *   DL-label      revert one label to English-only                  -> policy: "English-only label"
 *   DL-duplicate  report the cleanup action a second time            -> policy: "reported EXACTLY ONCE"
 *
 * Run: node tests/audit-installer-assertions.mutants.mjs
 */
import { mkdtempSync, copyFileSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const HERE = fileURLToPath(new URL('./', import.meta.url))
const REPO = join(HERE, '..')
const SRC = join(REPO, 'installer.js')
const COMPAT = join(HERE, 'audit-installer-compat.test.mjs')
const POLICY = join(HERE, 'audit-installer-policy.test.mjs')
let passed = 0, failed = 0
const ok = (c, l, d) => { if (c) { passed++; console.log('  ok   ' + l) } else { failed++; console.log('  FAIL ' + l + (d ? ' — ' + d : '')) } }

const ORIGIN = readFileSync(SRC, 'utf8')
const OUT_LINE = 'const out = { version: first.version, source: first.source, probes: probes.slice() }'
const CLEANUP_IF = 'if (removedFiles > 0 || removedDirs.length > 0 || cleanupNotes.length > 0) {'
const CASES = [
  { name: 'A7-version: the structured version is perturbed', guard: COMPAT, expect: 'STRUCTURED field: version',
    edit: (s) => s.replace(OUT_LINE, "const out = { version: String(first.version) + '-mutated', source: first.source, probes: probes.slice() }") },
  { name: 'A7-source: the structured source stops naming the service', guard: COMPAT, expect: 'structured field naming the service',
    edit: (s) => s.replace(OUT_LINE, "const out = { version: first.version, source: 'pm', probes: probes.slice() }") },
  { name: 'A8-failure: a failure line is injected in the backup path', guard: POLICY, expect: 'NOT reported as a failure (report-level',
    edit: (s) => s.replace('const backupFailures = []', "const backupFailures = []\n    logger?.warn?.('[dsh-vibe-math] 预设安装/更新失败：mutant injected failure line')") },
  { name: 'DL-label: one label is reverted to English-only', guard: POLICY, expect: 'English-only label',
    edit: (s) => s.replace("'[dsh-vibe-math] 预设清理：", "'[dsh-vibe-math] preset cleanup: ") },
  { name: 'DL-duplicate: the cleanup action is reported twice', guard: POLICY, expect: 'reported EXACTLY ONCE',
    edit: (s) => s.replace(CLEANUP_IF, CLEANUP_IF + "\n      logger?.info?.('[dsh-vibe-math] 预设清理：再次报告（删除 ' + removedFiles + ' 个文件）')") },
]
for (const c of CASES) {
  const mutated = c.edit(ORIGIN)
  if (mutated === ORIGIN) { ok(false, c.name + ' — the single-site anchor applies', 'ANCHOR MISS'); continue }
  const dir = mkdtempSync(join(tmpdir(), 'installer-assert-mut-'))
  copyFileSync(SRC, join(dir, 'installer.js'))
  writeFileSync(join(dir, 'installer.js'), mutated)
  const r = spawnSync(process.execPath, [c.guard], { cwd: REPO, encoding: 'utf8', maxBuffer: 1 << 26, env: Object.assign({}, process.env, { INSTALLER_JS: join(dir, 'installer.js') }) })
  const o = String(r.stdout || '') + String(r.stderr || '')
  const failLines = o.split('\n').filter((l) => /^  - /.test(l))
  const named = failLines.some((l) => l.indexOf(c.expect) !== -1)
  const sum = (o.split('\n').filter((l) => /passed, \d+ failed/.test(l)).slice(-1)[0] || '').trim()
  ok(r.status !== 0 && named, '★ ' + c.name + ' -> ' + sum, r.status === 0 ? 'the guard stayed GREEN' : (named ? '' : 'named red not found'))
  if (!named) for (const l of failLines.slice(0, 3)) console.log('        ' + l.trim().slice(0, 140))
  rmSync(dir, { recursive: true, force: true })
}
console.log('')
console.log('=== INSTALLER ASSERTION MUTANTS: ' + passed + ' red as required, ' + failed + ' problem(s) ===')
process.exit(failed === 0 ? 0 : 1)

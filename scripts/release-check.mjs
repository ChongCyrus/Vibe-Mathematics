#!/usr/bin/env node
/**
 * RELEASE CHECK (task-8 follow-up) — the checks a maintainer had to run BY HAND for 2.8.0, in one command.
 *
 * `docs/release-playbook.md` lists them as prose across §1/§2/§6; this script makes them mechanical, so the
 * next release cannot ship a drifted version, a missing release note, an unregistered note, a manifest that
 * lies about the tarball, or CRLF line endings inside the package.
 *
 * Usage:
 *   node scripts/release-check.mjs                # static checks + a real `npm pack` + tarball EOL scan
 *   node scripts/release-check.mjs --skip-pack    # static checks only (no packing, no temp extraction)
 *   node scripts/release-check.mjs --registry     # ALSO compare the published shasum (post-publish only)
 *   node scripts/release-check.mjs --self-test    # prove the predicates below are not vacuous
 *
 * Exit 0 = every check passed. Exit 1 = at least one FAIL (printed with a `FAIL ` prefix).
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..')
const TMP = process.env.RELEASE_CHECK_TMP || join(process.env.TEMP || process.env.TMPDIR || '/tmp', 'release-check')

// ---------------------------------------------------------------- pure predicates (fixture-testable)
/** The version must agree in all three places the market guard reads (playbook §1). */
export function versionProblems({ pkgVersion, lockTop, lockEmpty }) {
  const out = []
  if (!pkgVersion) out.push('package.json has no version')
  if (lockTop !== pkgVersion) out.push('package-lock.json top-level version ' + lockTop + ' != package.json ' + pkgVersion)
  if (lockEmpty !== pkgVersion) out.push('package-lock.json packages[""].version ' + lockEmpty + ' != package.json ' + pkgVersion)
  return out
}

/** Release notes must carry the template's sections, in the template's order (playbook §1 / TEMPLATE.md). */
export const SECTIONS = {
  zh: ['## 概述', '## 新增', '## 变更', '## 修复', '## 兼容性与迁移', '## 已知限制', '## 验证方式', '## 依赖'],
  en: ['## Overview', '## Added', '## Changed', '## Fixed', '## Compatibility & Migration', '## Known Limitations', '## Verification', '## Dependencies'],
}
export function sectionProblems(headings, lang) {
  const want = SECTIONS[lang]
  if (!want) return ['unknown language ' + lang]
  const got = (headings || []).map((h) => String(h).trim())
  const out = []
  if (got.length !== want.length) out.push('expected ' + want.length + ' sections, found ' + got.length)
  for (let i = 0; i < want.length; i++) if (got[i] !== want[i]) out.push('section ' + (i + 1) + ' is ' + JSON.stringify(got[i]) + ', expected ' + JSON.stringify(want[i]))
  return out
}

/** Every declared file must exist in the packed tarball (playbook §2/§6.2). */
export function manifestProblems(declared, packed) {
  const have = new Set(packed || [])
  return (declared || []).filter((f) => !have.has(f)).map((f) => 'declared but missing from the tarball: ' + f)
}

/** Nothing may ship that is repository-only tooling (playbook §6.4). */
export function devOnlyProblems(packed, devOnly = ['.gitattributes']) {
  const have = new Set(packed || [])
  return devOnly.filter((f) => have.has(f)).map((f) => 'repository-only file shipped in the tarball: ' + f)
}

/** Packaged text must be LF-only so the tarball is byte-reproducible (playbook §7). */
export function crlfProblems(files) {
  const out = []
  for (const { path, crlf } of files || []) if (Number(crlf) > 0) out.push('CRLF in the packaged file: ' + path + ' (' + crlf + ' lines)')
  return out
}

/** `compatNote` is user-visible and must name the version being released (playbook §2). */
export function compatNoteProblems(compatNote, version) {
  if (!compatNote) return ['dsh.compatNote is missing']
  return String(compatNote).includes(version) ? [] : ['dsh.compatNote does not mention the current version ' + version]
}

// ---------------------------------------------------------------- self-test (the family mutates these)
if (process.argv.includes('--self-test')) {
  const failures = []
  const check = (cond, label) => { console.log((cond ? 'PASS ' : 'FAIL - ') + label); if (!cond) failures.push(label) }

  check(versionProblems({ pkgVersion: '9.9.9', lockTop: '9.9.9', lockEmpty: '9.9.9' }).length === 0,
    'RELEASE-CHECK: a consistent version triple passes')
  check(versionProblems({ pkgVersion: '9.9.9', lockTop: '9.9.8', lockEmpty: '9.9.9' }).some((p) => /top-level/.test(p)),
    'RELEASE-CHECK: a drifted lock top-level version is caught')
  check(versionProblems({ pkgVersion: '9.9.9', lockTop: '9.9.9', lockEmpty: '9.9.8' }).some((p) => /packages/.test(p)),
    'RELEASE-CHECK: a drifted packages[""] version is caught')

  check(sectionProblems(SECTIONS.zh, 'zh').length === 0 && sectionProblems(SECTIONS.en, 'en').length === 0,
    'RELEASE-CHECK: the canonical section lists pass their own check')
  check(sectionProblems(['## 概述', '## 新增'], 'zh').some((p) => /expected 8 sections/.test(p)),
    'RELEASE-CHECK: a truncated note is caught by its section count')
  check(sectionProblems([...SECTIONS.en].reverse(), 'en').length > 0, 'RELEASE-CHECK: a reordered note is caught')

  check(manifestProblems(['a.js', 'b.md'], ['a.js', 'b.md', 'package.json']).length === 0, 'RELEASE-CHECK: a fully packed manifest passes')
  check(manifestProblems(['a.js', 'gone.md'], ['a.js']).length === 1, 'RELEASE-CHECK: a declared-but-missing file is caught')

  check(devOnlyProblems(['README.md'], ['.gitattributes']).length === 0, 'RELEASE-CHECK: repository-only tooling stays out')
  check(devOnlyProblems(['.gitattributes'], ['.gitattributes']).length === 1, 'RELEASE-CHECK: a shipped repository-only file is caught')

  check(crlfProblems([{ path: 'a.js', crlf: 0 }]).length === 0, 'RELEASE-CHECK: LF-only content passes')
  check(crlfProblems([{ path: 'a.js', crlf: 3 }]).length === 1, 'RELEASE-CHECK: CRLF inside the package is caught')

  check(compatNoteProblems('v9.9.9 功能版：…', '9.9.9').length === 0, 'RELEASE-CHECK: a compatNote naming the version passes')
  check(compatNoteProblems('v9.9.8 补丁版：…', '9.9.9').length === 1, 'RELEASE-CHECK: a stale compatNote is caught')

  console.log('release-check self-test: ' + (failures.length ? failures.length + ' failure(s)' : 'all checks passed'))
  process.exit(failures.length ? 1 : 0)
}

// ---------------------------------------------------------------- the real run
const argv = process.argv.slice(2)
const has = (n) => argv.includes('--' + n)
const problems = []
const fail = (p) => { for (const x of p) problems.push(x) }
const readJson = (rel) => JSON.parse(readFileSync(join(REPO, rel), 'utf8'))

const pkg = readJson('package.json')
const lock = readJson('package-lock.json')
const version = pkg.version
console.log('release-check: ' + pkg.name + '@' + version)

fail(versionProblems({ pkgVersion: version, lockTop: lock.version, lockEmpty: ((lock.packages || {})[''] || {}).version }))
fail(compatNoteProblems((pkg.dsh || {}).compatNote, version))

const notes = { zh: 'docs/release-notes/RELEASE-NOTES-' + version + '.md', en: 'docs/release-notes/RELEASE-NOTES-' + version + '.en.md' }
for (const [lang, rel] of Object.entries(notes)) {
  if (!existsSync(join(REPO, rel))) { problems.push('missing release note (' + lang + '): ' + rel); continue }
  const text = readFileSync(join(REPO, rel), 'utf8')
  fail(sectionProblems((text.match(/^## .*$/gm) || []), lang).map((p) => rel + ': ' + p))
  if (!(pkg.files || []).includes(rel)) problems.push('release note not listed in package.json#files: ' + rel)
}

if (has('skip-pack')) {
  console.log('release-check: --skip-pack, skipping the tarball checks')
} else {
  rmSync(TMP, { recursive: true, force: true })
  mkdirSync(TMP, { recursive: true })
  const out = execFileSync('npm', ['pack', '--dry-run', '--json'], { cwd: REPO, encoding: 'utf8', shell: true })
  const packed = JSON.parse(out)[0].files.map((f) => f.path)
  console.log('release-check: tarball would contain ' + packed.length + ' files; declared ' + (pkg.files || []).length)
  fail(manifestProblems(pkg.files, packed))
  fail(devOnlyProblems(packed, ['.gitattributes']))

  // Real pack + extract, so the EOL check reads the bytes a user would download.
  const tgzName = String(execFileSync('npm', ['pack', '--pack-destination', TMP], { cwd: REPO, encoding: 'utf8', shell: true })).trim().split(/\r?\n/).pop()
  const tgz = join(TMP, tgzName)
  if (!existsSync(tgz)) {
    problems.push('npm pack produced no tarball at ' + tgz)
  } else {
    execFileSync('tar', ['-xzf', tgz, '-C', TMP], { stdio: 'pipe' })
    const root = join(TMP, 'package')
    const eol = []
    const walk = (d, prefix) => {
      for (const e of readdirSync(d, { withFileTypes: true })) {
        const p = join(d, e.name)
        if (e.isDirectory()) { walk(p, prefix + e.name + '/'); continue }
        if (!/\.(js|mjs|cjs|json|md|yml|yaml|txt|svg)$/.test(e.name)) continue      // binaries are not text
        const text = readFileSync(p, 'utf8')
        eol.push({ path: prefix + e.name, crlf: (text.match(/\r\n/g) || []).length })
      }
    }
    walk(root, '')
    fail(crlfProblems(eol))
    const sha1 = createHash('sha1').update(readFileSync(tgz)).digest('hex')
    console.log('release-check: local tarball sha1 = ' + sha1 + ' (' + eol.length + ' text files scanned for CRLF)')
    if (has('registry')) {
      try {
        const published = String(execFileSync('npm', ['view', pkg.name + '@' + version, 'dist.shasum'], { cwd: REPO, encoding: 'utf8', shell: true })).trim()
        if (published !== sha1) problems.push('registry dist.shasum ' + published + ' != local tarball sha1 ' + sha1)
        else console.log('release-check: registry shasum matches the local tarball (byte-reproducible)')
      } catch (e) { problems.push('registry lookup failed: ' + String((e && e.message) || e).slice(0, 120)) }
    }
    rmSync(TMP, { recursive: true, force: true })
  }
}

console.log('')
for (const p of problems) console.log('FAIL ' + p)
console.log(problems.length ? 'release-check: ' + problems.length + ' problem(s)' : 'release-check: ALL CHECKS PASSED')
process.exit(problems.length ? 1 : 0)

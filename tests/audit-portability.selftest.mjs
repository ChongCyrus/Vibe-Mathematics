// tests/audit-portability.selftest.mjs — TB-2681: prove the portability judge BITES.
//
// A gate that cannot be caught failing is a comment. This self-test plants four probe files in a throwaway tree and
// requires the judge to name each of them (plus a clean file that must produce nothing):
//   1. an absolute file:// import                       -> P1 red, naming the file
//   2. a whole-file CRLF file                            -> P2 red, naming the file
//   3. a suite that prints SKIP and returns (corpus gone) -> P3 red, and the reason names requireCorpusDir
//   4. a PORTABLE-ALLOW whose reason is too short        -> P1 red (the exemption is not a sticker)
//   5-8 (TB-2709) the same shapes in a real git repo, i.e. on TRACKED, unmodified lines: a hard-coded checkout and a
//       Windows profile path are BLOCKERs even then (tests/** has no grandfathered blind spot), a real allow is still
//       honoured, and a short allow is still red.
// The clean probe pins the other side: a long-enough PORTABLE-ALLOW must be honoured, otherwise the "fix" would be
// just deleting the line the judge dislikes.
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'

import { scanTree } from './audit-portability.mjs'

// ★ Entry-point shape required by tests/audit-scanner-selfproof.test.mjs: a scanner is "self-proven" when it READS
// a --selftest/--self-test flag from argv (or ships a .mutants.mjs sibling). This suite always runs its planted
// probes - both flags are accepted so it can be invoked either way, and `tests/audit-portability.mjs --selftest`
// delegates here. The flag is not decoration: it is how the gate's own proof is discovered and re-run.
const SELFTEST_MODE = process.argv.includes('--selftest') || process.argv.includes('--self-test')

const root = await mkdtemp(join(tmpdir(), 'portability-selftest-'))
const testsDir = join(root, 'tests')
await mkdir(testsDir, { recursive: true })

// The probe SOURCE text is assembled because this file is itself scanned by the judge: writing a literal absolute
// path (or a literal SKIP call) here would make the self-test the 5th blocker it is supposed to catch.
const DRIVE = String.fromCharCode(68) + ':' // the drive letter the probes pretend to be on
const Q = String.fromCharCode(39) // single quote
const probes = {
  'tests/zzz-probe-file-url.mjs': 'import x from ' + Q + 'file:///' + DRIVE + '/repo/scripts/x.mjs' + Q + '\nexport const y = x\n',
  'tests/zzz-probe-crlf.mjs': 'export const a = 1\r\nexport const b = 2\r\n',
  'tests/zzz-probe-skip.mjs': '// corpus-dependent suite that pretends a missing corpus is a pass\nconst corpus = ' + Q + 'compare/real-fields.jsonl' + Q + '\nif (!corpus) { console.log(' + Q + 'SKIP no live corpus' + Q + '); return }\nexport const c = 1\n',
  'tests/zzz-probe-allow-short.mjs': 'const scratch = ' + Q + DRIVE + '/_tmp/x' + Q + ' // PORTABLE-ALLOW: too short\n',
  'tests/zzz-probe-clean.mjs': 'const scratch = process.env.X || ' + Q + 'relative/dir' + Q + ' // PORTABLE-ALLOW: this machine keeps its corpus in a variable, so the checkout is portable\n',
}

let passed = 0
const fails = []
const ok = (cond, name, detail) => {
  if (cond) { passed += 1; console.log('PASS ' + name) } else { fails.push(name + (detail ? ': ' + detail : '')); console.log('FAIL ' + name + (detail ? ' — ' + detail : '')) }
}

try {
  for (const [rel, text] of Object.entries(probes)) await writeFile(join(root, rel), text, 'utf8')
  const result = scanTree({ root, useGit: false })
  const hits = (file) => result.blockers.filter((h) => h.file === file)

  const fileUrl = hits('tests/zzz-probe-file-url.mjs')
  ok(fileUrl.some((h) => h.id === 'p1-file-url-absolute'), 'probe 1: absolute file:// import is named as P1')
  ok(fileUrl.length > 0 && fileUrl[0].line === 1, 'probe 1: the hit carries the exact line number')

  const crlf = hits('tests/zzz-probe-crlf.mjs')
  ok(crlf.some((h) => h.id === 'p2-crlf'), 'probe 2: whole-file CRLF is named as P2')

  const skip = hits('tests/zzz-probe-skip.mjs')
  ok(skip.some((h) => h.rule === 'P3'), 'probe 3: print SKIP then return is named as P3')
  const skipHit = skip.find((h) => h.rule === 'P3')
  ok(skipHit !== undefined && /requireCorpusDir/.test(skipHit.why), 'probe 3: the reason says why the corpus helper does not exempt it')

  const shortAllow = hits('tests/zzz-probe-allow-short.mjs')
  ok(shortAllow.some((h) => h.id === 'p1-allow-why-too-short'), 'probe 4: a too-short PORTABLE-ALLOW reason is red, not an exemption')

  const clean = hits('tests/zzz-probe-clean.mjs')
  ok(clean.length === 0, 'control: a long-enough PORTABLE-ALLOW is honoured (the judge is not just matching the path)', JSON.stringify(clean))
  ok(result.blockers.length === 4, 'the planted tree yields exactly the four planted blockers', String(result.blockers.length))
} finally {
  await rm(root, { recursive: true, force: true })
}

// TB-2709: the added-line rule is NOT the whole story. A tracked, UNMODIFIED tests/** file used to be LEGACY for
// every rule; a hard-coded checkout there is exactly what let a mutation run stay green while the suite imported this
// checkout. So the judge must red it anyway ("it was already there" is not an exemption), while a tracked line with a
// real PORTABLE-ALLOW must stay green. These probes need a real git repo: `lineAdded()` decides by `git diff HEAD`.
const gitRoot = await mkdtemp(join(tmpdir(), 'portability-tracked-'))
try {
  await mkdir(join(gitRoot, 'tests'), { recursive: true })
  const tracked = {
    'tests/zzz-tracked-checkout.mjs': 'export const REPO = ' + Q + DRIVE + '/wd/vibemath/Vibe-Mathematics' + Q + '\n',
    'tests/zzz-tracked-profile.mjs': 'export const HOME = ' + Q + DRIVE + '/Users/someone' + Q + '\n',
    'tests/zzz-tracked-allow.mjs': 'export const scratch = ' + Q + DRIVE + '/Users/someone' + Q + ' // PORTABLE-ALLOW: this tracked line keeps a real reason, so the exemption is honoured\n',
    'tests/zzz-tracked-allow-short.mjs': 'export const scratch = ' + Q + DRIVE + '/Users/someone' + Q + ' // PORTABLE-ALLOW: too short\n',
  }
  for (const [rel, text] of Object.entries(tracked)) await writeFile(join(gitRoot, rel), text, 'utf8')
  const git = (...args) => spawnSync('git', args, { cwd: gitRoot, encoding: 'utf8' })
  const gitOk = git('init', '-q').status === 0
    && git('add', '-A').status === 0
    && git('-c', 'user.email=selftest@example.invalid', '-c', 'user.name=selftest', 'commit', '-q', '-m', 'probes').status === 0
  ok(gitOk, 'tracked probes: the throw-away repo was created and committed')

  const trackedResult = gitOk ? scanTree({ root: gitRoot }) : { blockers: [], legacy: [] }
  const trackedHits = (file) => trackedResult.blockers.filter((h) => h.file === file)
  ok(trackedHits('tests/zzz-tracked-checkout.mjs').some((h) => h.id === 'p1-absolute-checkout'),
    'probe 5: a TRACKED, unmodified hard-coded checkout in tests/** is a BLOCKER (not LEGACY)',
    JSON.stringify(trackedResult.legacy.filter((h) => h.file === 'tests/zzz-tracked-checkout.mjs')))
  ok(trackedHits('tests/zzz-tracked-profile.mjs').some((h) => h.id === 'p1-drive-users'),
    'probe 6: a TRACKED, unmodified Windows profile path in tests/** is a BLOCKER (not LEGACY)')
  ok(trackedHits('tests/zzz-tracked-allow.mjs').length === 0
    && !trackedResult.legacy.some((h) => h.file === 'tests/zzz-tracked-allow.mjs'),
    'probe 7: a tracked line with a real PORTABLE-ALLOW stays green (the rule is not "red every path")')
  ok(trackedHits('tests/zzz-tracked-allow-short.mjs').some((h) => h.id === 'p1-allow-why-too-short'),
    'probe 8: a tracked line with a too-short PORTABLE-ALLOW is still red (the exemption is not a sticker)')
  ok(trackedResult.blockers.length === 3, 'the tracked tree yields exactly three blockers', String(trackedResult.blockers.length))
} finally {
  await rm(gitRoot, { recursive: true, force: true })
}

console.log('')
console.log('=== PORTABILITY JUDGE SELFTEST: ' + passed + ' passed, ' + fails.length + ' failed ==='
  + (SELFTEST_MODE ? ' (invoked with --selftest)' : ''))
for (const f of fails) console.log('  FAILED: ' + f)
process.exit(fails.length === 0 ? 0 : 1)

// tests/redteam-gate.test.mjs — TB-2689: THE RED TEAM MUST BE RUNNABLE FROM THE REPO, AND IT MUST BE ABLE TO FAIL.
//
// WHY. The 23-vector attack matrix used to live only in a scratch directory outside the repo, so the release gate's own
// closure evidence expired with a 3-hour cleanup. The matrix now lives in scripts/sim/redteam/ (fixtures + runner +
// committed corpus). This suite is the CHEAP every-run guard on that runner:
//
//   · the vectors that prove layer ownership (A11 A13b A16 A16b) plus the independent-mismatch one (A12) still name
//     their attack — this is the part of the matrix that the layer-ownership redesign put at risk;
//   · the runner is not a rubber stamp: an expectation that no longer matches the gate's refusal must come back as
//     WRONG-CODE with the vector named, not as "named" (counter-light 1);
//   · the roster is not decorative: deleting a fixture must make the runner refuse by name, so a suite that silently
//     shrinks from 23 to 22 cannot pass (counter-light 2).
//
// The FULL 23-vector run is `node scripts/sim/redteam/run.mjs` (≈45 s); it is deliberately NOT run here because this
// file must stay inside the short-suite budget. What it checks is the part that rots first.
//
// Run: node tests/redteam-gate.test.mjs
import { spawnSync } from 'node:child_process'
import { cpSync, mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..')
const RUNNER = join(REPO, 'scripts', 'sim', 'redteam', 'run.mjs')
const FIXTURES = join(REPO, 'scripts', 'sim', 'redteam', 'fixtures')

let passed = 0
let failed = 0
const ok = (cond, label, detail) => {
  if (cond) {
    passed += 1
    console.log('  ok   ' + label)
  } else {
    failed += 1
    console.error('  FAIL ' + label + (detail === undefined ? '' : ' :: ' + JSON.stringify(detail)))
  }
}

const run = (args) =>
  spawnSync(process.execPath, [RUNNER, ...args], {
    cwd: REPO,
    encoding: 'utf8',
    timeout: 110000,
    maxBuffer: 64 * 1024 * 1024,
  })

// ---------------------------------------------------------------------------------------------------------------
// 1. The layer-ownership vectors still name their attack.
const REQUIRED = ['A11', 'A13b', 'A16', 'A16b', 'A12']
const sub = run(['--only=' + REQUIRED.join(',')])
ok(sub.status === 0, 'the layer-ownership subset exits 0 (every vector named or justified-neutralized)', {
  status: sub.status,
  signal: sub.signal,
  stderr: String(sub.stderr || '').slice(0, 3000),
  stdout: String(sub.stdout || '').slice(-3000),
})
ok(
  /VECTORS 5 \| named 5 \| neutralized 0 \| masked 0 \| half 0 \| leaked 0 \| wrong-code 0/.test(String(sub.stdout || '')),
  'the subset reports 5/5 named and zero masked/half/leaked/wrong-code',
  String(sub.stdout || '').slice(-600)
)
for (const id of REQUIRED) {
  ok(new RegExp('^' + id + '\\s+NAMED\\b', 'm').test(String(sub.stdout || '')), id + ' is NAMED by the runner (not masked, not half)')
}

// ---------------------------------------------------------------------------------------------------------------
// 2. Counter-light 1: a deliberately WRONG expectation must fail, and be named WRONG-CODE.
//    If this stays green while the expectation is wrong, the runner is measuring nothing and the 23/23 above is theatre.
const wrongDir = mkdtempSync(join(tmpdir(), 'redteam-wrongcode-'))
try {
  cpSync(FIXTURES, wrongDir, { recursive: true })
  const target = join(wrongDir, 'A13b.json')
  const fixture = JSON.parse(readFileSync(target, 'utf8'))
  fixture.expects.primaryReason = 'AUDIT_TREE_CHANGED' // A13b must never refuse with this code
  writeFileSync(target, JSON.stringify(fixture, null, 2) + '\n')
  const wrong = run(['--fixtures-dir=' + wrongDir, '--only=A13b'])
  ok(wrong.status !== 0, 'a fixture whose expected code is wrong makes the runner exit non-zero', {
    status: wrong.status,
    stdout: String(wrong.stdout || '').slice(-1500),
    stderr: String(wrong.stderr || '').slice(0, 1500),
  })
  ok(/^A13b\s+WRONG-CODE\b/m.test(String(wrong.stdout || '')), 'the mis-predicted vector is reported as WRONG-CODE and named', String(wrong.stdout || '').slice(-600))
  ok(/wrong-code 1/.test(String(wrong.stdout || '')), 'the summary counts it as wrong-code (not named, not masked)')
} finally {
  rmSync(wrongDir, { recursive: true, force: true })
}

// ---------------------------------------------------------------------------------------------------------------
// 3. Counter-light 2: deleting a fixture must be refused BY NAME, so the suite cannot shrink quietly.
const shortDir = mkdtempSync(join(tmpdir(), 'redteam-missing-'))
try {
  cpSync(FIXTURES, shortDir, { recursive: true })
  unlinkSync(join(shortDir, 'A15.json'))
  const missing = run(['--fixtures-dir=' + shortDir, '--only=A11'])
  const both = String(missing.stdout || '') + String(missing.stderr || '')
  ok(missing.status !== 0, 'a missing fixture makes the runner exit non-zero before it judges anything', { status: missing.status, both: both.slice(0, 1500) })
  ok(/MISSING FIXTURE A15\b/.test(both), 'the refusal names the missing fixture (A15), not just "count mismatch"', both.slice(0, 1500))
} finally {
  rmSync(shortDir, { recursive: true, force: true })
}

// ---------------------------------------------------------------------------------------------------------------
// 4. The runner must not smuggle the old scratch-directory dependency back in: its own source may not name one.
const source = readFileSync(RUNNER, 'utf8')
ok(!/[A-Za-z]:[\\/]_tmp\b/.test(source), 'run.mjs names no out-of-repo scratch directory (its corpus is committed under data/)')

console.log('')
console.log(passed + ' passed, ' + failed + ' failed')
process.exit(failed === 0 ? 0 : 1)

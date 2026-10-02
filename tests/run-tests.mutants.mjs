// In-repo mutant harness for the runner-diagnostics guard (ships: `tests/*.mutants.mjs`).
// It proves the `--self-check` guard can REDDEN: strip the named-failure detail from a COPY of
// run-tests.mjs, then run that copy's own `--self-check` and require it to fail.
// Usage: node tests/run-tests.mutants.mjs
import { mkdtempSync, copyFileSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const HERE = fileURLToPath(new URL('./', import.meta.url))
const REPO = join(HERE, '..')
const RUNNER = join(HERE, 'run-tests.mjs')

let passed = 0, failed = 0
const ok = (cond, label, detail) => {
  if (cond) { passed++; console.log('  ok   ' + label); return true }
  failed++; console.log('  FAIL ' + label + (detail ? ' — ' + detail : '')); return false
}

// baseline: the real runner's self-check must pass
const base = spawnSync(process.execPath, [RUNNER, '--self-check'], { cwd: REPO, encoding: 'utf8' })
ok(base.status === 0 && /SELF-CHECK PASS/.test(base.stdout || ''),
  'baseline: the runner self-check passes (a failing child yields a named assertion)',
  JSON.stringify(String(base.stdout || '').trim().slice(0, 80)))

// mutant: strip the named-failure extraction (fall back to a constant) -> the self-check must REDDEN
const dir = mkdtempSync(join(tmpdir(), 'runner-mut-'))
// Normalise CRLF so the anchor is line-ending agnostic (the runner is checked out with CRLF on Windows).
const src = readFileSync(RUNNER, 'utf8').replace(/\r\n/g, '\n')
const from = "  const chosen = (named.length ? named : lines).slice(-40)\n  return chosen.length ? chosen : ['(no captured output)']"
if (src.indexOf(from) === -1) {
  ok(false, 'mutant anchor applies (the named-failure extraction is present)', 'ANCHOR MISS')
} else {
  writeFileSync(join(dir, 'run-tests.mjs'), src.replace(from, "  return ['(no captured output)']"))
  const mut = spawnSync(process.execPath, [join(dir, 'run-tests.mjs'), '--self-check'], { cwd: REPO, encoding: 'utf8' })
  ok(mut.status !== 0 && /SELF-CHECK FAIL/.test(String(mut.stdout || '')),
    '★ mutant (named-failure detail stripped) makes the self-check RED',
    'exit=' + mut.status + ' out=' + JSON.stringify(String(mut.stdout || '').trim().slice(0, 80)))
}
rmSync(dir, { recursive: true, force: true })
// TIMEOUT path, BOTH directions (a criterion must be validated against a known-positive AND a
// known-negative before it gates anything): the same real suite under a 1 s limit must be killed
// and NAMED in the failure list; under the default limit it must not be reported as a timeout.
const slowRun = spawnSync(process.execPath, [RUNNER, '--only', 'audit-prompt-invariants'], { cwd: REPO, encoding: 'utf8', env: Object.assign({}, process.env, { GATE_SUITE_TIMEOUT_MS: '1000' }) })
const slowOut = String(slowRun.stdout || '') + String(slowRun.stderr || '')
const failList = slowOut.split('\n').filter((l) => /^\s*FAILED:/.test(l))
const timedOutLine = failList.find((l) => /\[probe\] \(TIMEOUT after 1s\)/.test(l)) || ''
ok(slowRun.status !== 0 && !!timedOutLine,
  '★ POSITIVE: a 1 s limit makes the runner kill the suite and NAME the timeout in the failure list',
  'exit=' + slowRun.status + ' line=' + timedOutLine.trim())
// NEGATIVE (two readings, so the criterion cannot be always-red):
//   (a) ANY suite under the DEFAULT limit produces no TIMEOUT marker, whatever its own verdict;
//   (b) a known-green fast suite exits 0 (no false timeout).
// (a) is deliberately verdict-agnostic: at the time of writing audit-prompt-invariants is red for an
// unrelated in-flight reason (v2/v3 I13/I14: the parameter schema parses to 0 keys), and a proof tool
// must not inherit someone else's red.
const fastRun = spawnSync(process.execPath, [RUNNER, '--only', 'audit-prompt-invariants'], { cwd: REPO, encoding: 'utf8' })
const fastOut = String(fastRun.stdout || '') + String(fastRun.stderr || '')
ok(!/TIMEOUT after/.test(fastOut),
  'NEGATIVE (a): with the default limit no TIMEOUT marker is produced (the criterion is not always-red)',
  'exit=' + fastRun.status + ' (its own verdict is another owner\'s concern)')
const greenRun = spawnSync(process.execPath, [RUNNER, '--only', 'audit-package-membership'], { cwd: REPO, encoding: 'utf8' })
const greenOut = String(greenRun.stdout || '') + String(greenRun.stderr || '')
ok(greenRun.status === 0 && !/TIMEOUT after/.test(greenOut),
  'NEGATIVE (b): a known-green suite exits 0 under the default limit (no false timeout)',
  'exit=' + greenRun.status)
console.log('')
console.log('=== RUNNER DIAGNOSTICS MUTANTS: ' + passed + ' passed, ' + failed + ' failed ===')
process.exit(failed === 0 ? 0 : 1)

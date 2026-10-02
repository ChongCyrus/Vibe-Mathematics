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
console.log('')
console.log('=== RUNNER DIAGNOSTICS MUTANTS: ' + passed + ' passed, ' + failed + ' failed ===')
process.exit(failed === 0 ? 0 : 1)

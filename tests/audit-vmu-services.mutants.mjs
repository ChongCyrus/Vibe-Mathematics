// tests/audit-vmu-services.mutants.mjs — the sensitivity family for tests/audit-vmu-services.test.mjs.
//
// Each mutant is a SINGLE-POINT edit of kernel/index.js written to a TEMP copy (the real kernel is never
// touched); the audit is then run against that copy through its `VMU_SERVICES_INDEX` seam and must go RED
// naming the expected check. A CONTROL run of the unmutated text must stay GREEN in the same harness, so a
// red can only come from the mutation (never from the temp path or the seam itself).
//
// Mutants (one per guard):
//   1. comment-out-construction  -> "every registered service is actually CONSTRUCTED" (also proves the
//                                   round-7 comment bypass is CLOSED: the comment must not count)
//   2. drop-getter               -> "every registered service is reachable from the kernel object"
//   3. rename-construction       -> "no constructed service is missing from the registry"
//   4. unmapped-registration     -> "every registered service is mapped to a constructor in this audit"
//   5. string-binding-bypass     -> "every registered service is actually CONSTRUCTED" (a STRING must not fake
//                                   a binding either; without the stripper this file would pass the gate)
import { readFileSync, writeFileSync, rmSync, mkdtempSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = resolve(HERE, '..')
const INDEX = join(REPO, 'vibe-math-vmu', 'kernel', 'index.js')
const AUDIT = join(REPO, 'tests', 'audit-vmu-services.test.mjs')
const CHILD_TIMEOUT_MS = 60000

const original = readFileSync(INDEX, 'utf8')

const MUTANTS = [
  {
    name: 'comment-out-construction: the construction is replaced by a COMMENT',
    from: '  const governance = createGovernance(',
    to: '  // const governance = createGovernance(',
    expect: /every registered service is actually CONSTRUCTED/,
  },
  {
    name: 'drop-getter: the retention getter is REMOVED (the service is no longer reachable)',
    from: '    get retention() { return retention },',
    to: '    // getter removed by the mutant: vmu.retention is no longer exposed',
    expect: /every registered service is reachable from the kernel object/,
  },
  {
    name: 'rename-construction: the trust binding is renamed to an unregistered identifier',
    from: '  const trust = createTrust(',
    to: '  const trustEngine = createTrust(',
    expect: /no constructed service is missing from the registry/,
  },
  {
    name: 'unmapped-registration: the trust registration names a service outside the map',
    from: "  registry.register('vmu.trust',",
    to: "  registry.register('vmu.trustx',",
    expect: /every registered service is mapped to a constructor in this audit/,
  },
  {
    name: 'string-binding-bypass: the governance construction is commented out AND faked inside a STRING',
    from: '  const governance = createGovernance(',
    to: '  // const governance = createGovernance(',
    append: '\nconst _fakeGovernance = "const governance = createGovernance("\n',
    expect: /every registered service is actually CONSTRUCTED/,
  },
]

const runAudit = (indexPath) => {
  const t0 = Date.now()
  const r = spawnSync(process.execPath, [AUDIT], {
    cwd: REPO,
    encoding: 'utf8',
    env: Object.assign({}, process.env, { VMU_SERVICES_INDEX: indexPath }),
    timeout: CHILD_TIMEOUT_MS,
  })
  const out = String(r.stdout || '')
  const failLines = out.split('\n').filter((l) => /^\s+FAIL /.test(l)).map((l) => l.trim())
  return { status: r.status, timedOut: r.timedOut === true, ms: Date.now() - t0, out, err: String(r.stderr || ''), failLines }
}

const dir = mkdtempSync(join(tmpdir(), 'vmu-svc-mutants-'))
const started = Date.now()
let red = 0
const hangs = []
const skipped = []
const failures = []

// CONTROL: the unmutated copy must stay GREEN in this harness (so the seam/temp path cannot explain a red).
{
  const control = join(dir, 'index.control.js')
  writeFileSync(control, original, 'utf8')
  const r = runAudit(control)
  const green = r.status === 0 && !r.timedOut
  console.log((green ? 'ok   ' : 'FAIL ') + '- control: the unmutated copy stays GREEN [' + r.ms + 'ms]' +
    (green ? ' :: ' + (String(r.out).trim().split('\n').filter(Boolean).slice(-1)[0] || '').slice(0, 90)
           : ' :: exit=' + r.status + ' ' + (r.err || (r.failLines[0] || '')).slice(0, 140)))
  if (!green) failures.push('control run was not green (exit=' + r.status + ')')
  else red++ // the control counts as a satisfied expectation of the harness
}

for (let i = 0; i < MUTANTS.length; i++) {
  const m = MUTANTS[i]
  if (!original.includes(m.from)) {
    skipped.push(m.name + ' (ANCHOR MISS: ' + m.from + ')')
    console.log('FAIL - ' + m.name + ' :: ANCHOR MISS: ' + m.from)
    continue
  }
  const mutated = original.split(m.from).join(m.to) + (m.append || '')
  const file = join(dir, 'index.mutant' + (i + 1) + '.js')
  writeFileSync(file, mutated, 'utf8')
  const r = runAudit(file)
  if (r.timedOut) { hangs.push(m.name); console.log('FAIL - ' + m.name + ' :: TIMEOUT after ' + CHILD_TIMEOUT_MS + 'ms'); continue }
  const named = r.failLines.find((l) => m.expect.test(l))
  const okRed = r.status !== 0 && !!named
  if (okRed) red++
  else failures.push(m.name + ' :: exit=' + r.status + ' named=' + (named ? 'yes' : 'no'))
  console.log((okRed ? 'ok   ' : 'FAIL ') + '- ' + m.name + ' [' + r.ms + 'ms] :: ' +
    (okRed ? named.slice(0, 150) : 'exit=' + r.status + ' (want non-zero + ' + m.expect + ') ' + (r.failLines[0] || r.err || '').slice(0, 120)))
}

try { rmSync(dir, { recursive: true, force: true }) } catch (e) { /* best effort: a leftover temp dir must not fail the gate */ }

const expected = MUTANTS.length + 1            // the control plus every mutant
console.log('')
console.log('mutant files reddening the services audit by name: ' + red + '/' + expected)
console.log('hangs=' + JSON.stringify(hangs))
console.log('skipped=' + JSON.stringify(skipped))
console.log('TOTAL WALL TIME (all mutants + setup): ' + (Date.now() - started) + 'ms')
if (failures.length) for (const f of failures) console.log('  FAIL - ' + f)
console.log(red === expected ? 'ALL MUTANTS RED AS REQUIRED' : 'MUTANT FAMILY INCOMPLETE')
process.exit(red === expected ? 0 : 1)

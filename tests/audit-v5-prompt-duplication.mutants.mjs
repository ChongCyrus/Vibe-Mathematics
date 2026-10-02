import { readFileSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// Falsifiability for tests/audit-v5-prompt-duplication.mjs: a SINGLE-SITE edit in ONE prompt copy
// must turn the equality check (and the wording checks) NAMED-red, while the unmutated run is green.
const SUITE = 'D:/wd/vibemath开发/Vibe-Mathematics/tests/audit-v5-prompt-duplication.mjs'
const YML = 'D:/wd/vibemath开发/Vibe-Mathematics/vibe-math-v5/agent.cordis.yml'
const run = (env) => {
  const r = spawnSync(process.execPath, [SUITE, '--json'], { encoding: 'utf8', timeout: 120000, env: Object.assign({}, process.env, env || {}) })
  let parsed = null
  try { parsed = JSON.parse(r.stdout) } catch (e) { /* reported below */ }
  return { code: r.status, parsed, out: String(r.stdout || '') + String(r.stderr || '') }
}
const control = run({})
const MUTS = [
  ['single-copy wording drift', ['YOUR OWN boolean vote on that object in the SAME reply is counted as an\n      ABSTENTION', 'YOUR OWN boolean vote on that object in the SAME reply is NOT counted at all']],
  ['single-copy P1 removal', ['or when a written\n      flow requires it', 'or never']],
]
let problems = 0
console.log('control: exit=' + control.code + ' | ' + JSON.stringify(control.parsed && { passed: control.parsed.passed, failed: control.parsed.failed }))
if (control.code !== 0) problems += 1
for (const [name, mut] of MUTS) {
  const r = run({ V5_PROMPT_MUTATE: JSON.stringify(mut) })
  const failed = r.parsed ? r.parsed.failed : -1
  const named = !!(r.parsed && (r.parsed.failures || []).some((f) => /IDENTICAL after normalisation|ABSTENTION|written flow requires it/.test(f)))
  const ok = r.code !== 0 && failed > 0 && named
  if (!ok) problems += 1
  console.log(name.padEnd(28) + ': exit=' + r.code + ' failed=' + failed + (ok ? '  RED (as required)' : '  NOT RED'))
  for (const f of ((r.parsed && r.parsed.failures) || []).slice(0, 2)) console.log('    → ' + String(f).slice(0, 140))
}
console.log(problems === 0 ? '\nPROMPT-DUPLICATION MUTANTS: every mutation turns a NAMED check red' : '\nPROMPT-DUPLICATION MUTANTS: ' + problems + ' problem(s)')
process.exit(problems === 0 ? 0 : 1)

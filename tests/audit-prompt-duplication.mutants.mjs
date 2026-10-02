// Falsifiability driver for tests/audit-prompt-duplication.mjs (v2/v3/v4): a SINGLE-SITE edit in ONE
// prompt copy of ONE preset must turn both the equality check and the clause check NAMED-red, while
// the unmutated control stays green.
import { spawnSync } from 'node:child_process'
const SUITE = 'D:/wd/vibemath开发/Vibe-Mathematics/tests/audit-prompt-duplication.mjs'
const run = (env) => {
  const r = spawnSync(process.execPath, [SUITE, '--json'], { encoding: 'utf8', timeout: 120000, env: Object.assign({}, process.env, env || {}) })
  let parsed = null
  try { parsed = JSON.parse(r.stdout) } catch (e) { /* reported */ }
  return { code: r.status, parsed, out: String(r.stdout || '') + String(r.stderr || '') }
}
const control = run({ PROMPT_DUP_SKIP_CLAUSES: '1' })   // duplication-only control (clauses land with the prompt edits)
const MUTS = [
  ['v2 single-copy drift', ['vibe-math-v2', 'Data lives under {{cwd}}/VibeMath/Projects/<project>/', 'Data lives under {{cwd}}/VibeMath/Projects/<project>/ (mutated in ONE copy only)']],
  ['v3 single-copy drift', ['vibe-math-v3', 'TRUST RULE: only Verified/', 'TRUST RULE (mutated in ONE copy only): only Verified/']],
  ['v4 single-copy drift', ['vibe-math-v4', 'TRUST RULE: only Verified/', 'TRUST RULE (mutated in ONE copy only): only Verified/']],
]
let problems = 0
console.log('control (duplication-only, clauses skipped): exit=' + control.code + ' | ' + JSON.stringify(control.parsed && { passed: control.parsed.passed, failed: control.parsed.failed })
  + (control.parsed && control.parsed.report ? ' | ' + control.parsed.report.map((r) => r.preset + ':ratio=' + r.ratio).join(' ') : ''))
if (control.code !== 0) problems += 1
const NAMED = /share a substantial common prefix|present in BOTH copies|scaffolding, not prompt prose/
for (const [name, mut] of MUTS) {
  const r = run({ PROMPT_DUP_MUTATE: JSON.stringify(mut), PROMPT_DUP_SKIP_CLAUSES: '1' })
  const named = !!(r.parsed && (r.parsed.failures || []).some((f) => NAMED.test(f)))
  const ok = r.code !== 0 && named
  if (!ok) problems += 1
  console.log(name.padEnd(24) + ': exit=' + r.code + (ok ? '  RED (as required)' : '  NOT RED'))
  for (const f of ((r.parsed && r.parsed.failures) || []).slice(0, 1)) console.log('    → ' + String(f).slice(0, 150))
}
console.log(problems === 0 ? '\nPROMPT-DUPLICATION (v2/v3/v4) MUTANTS: every single-copy edit turns the NAMED check red' : '\nPROMPT-DUPLICATION MUTANTS: ' + problems + ' problem(s)')
process.exit(problems === 0 ? 0 : 1)

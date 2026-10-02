// ============================================================================
// audit-v5-lean-abstention.mutants.mjs — falsifiability for the L2 abstention audit.
// Each mutant is a SINGLE-SITE edit; every one must turn a NAMED assertion red in
// `tests/audit-v5-lean-abstention.mjs` (and, for the gate mutant, also the I8
// invariant in `tests/audit-prompt-invariants.mjs`).
// Run: node tests/audit-v5-lean-abstention.mutants.mjs
// ============================================================================
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, rmSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..')
const PRESET = join(REPO, 'vibe-math-v5')
const AUDIT = join(HERE, 'audit-v5-lean-abstention.mjs')
const INVARIANTS = join(HERE, 'audit-prompt-invariants.mjs')
const REL = 'vibe-math-v5/vibe-math-v5.js'
const SRC = readFileSync(join(PRESET, 'vibe-math-v5.js'), 'utf8')

const MUTANTS = [
  {
    name: 'M1 formalOn() gate removed',
    from: 'if (formalOn() && p.formal) {',
    to: 'if (p.formal) {   // MUTANT: the off-mode gate is gone',
    expectAudit: 'S1: a `formal:{…}` reply changes NOTHING observable in off mode',
    expectInvariant: 'X8',   // measured via the invariant's own --json text below
  },
  {
    name: 'M2 enforcement disabled',
    from: 'const enforced = isVoterHere && defectTargetsThisReply.has(vTarget) && (declared === 0 || declared === 1)',
    to: 'const enforced = false   // MUTANT: no enforced abstention',
    expectAudit: 'S2: the same reply cannot conclude the object it declared defective',
  },
  {
    name: 'M3 marker collapses to a single value',
    from: 'fid.voteAbstainedByFramework = list',
    to: 'fid.voteAbstainedByFramework = list[list.length - 1]   // MUTANT: single-value marker',
    expectAudit: 'S3: the enforced-abstention marker is an ARRAY of length 2',
  },
  {
    name: 'M4 defect record wipes the marker history',
    from: 'fidelity: Object.assign({}, (prev0 && prev0.fidelity) || {}, { at: now(), by: String(memberId || \'\'), note: why }),',
    to: 'fidelity: { at: now(), by: String(memberId || \'\'), note: why },   // MUTANT: replace, not merge',
    expectAudit: 'S3: the enforced-abstention marker is an ARRAY of length 2',
  },
]

const runAudit = (plugin) => {
  const r = spawnSync(process.execPath, [AUDIT], { encoding: 'utf8', timeout: 600000, env: Object.assign({}, process.env, { V5_PLUGIN: plugin }) })
  return { code: r.status, out: String(r.stdout || '') + String(r.stderr || '') }
}
const reds = (out) => out.split('\n').filter((l) => l.trim().startsWith('FAIL -')).map((l) => l.replace(/^\s*FAIL - /, '').trim())

// control: the unmutated audit must be green
const control = runAudit(join(PRESET, 'vibe-math-v5.js'))
const controlGreen = control.code === 0 && /passed=\d+ failed=0/.test(control.out)
console.log('control (unmutated): exit=' + control.code + ' | ' + (control.out.split('\n').find((l) => l.startsWith('passed=')) || '').trim())
let problems = controlGreen ? 0 : 1

for (const m of MUTANTS) {
  if (!SRC.includes(m.from)) { console.log(m.name + ': ANCHOR MISSING'); problems += 1; continue }
  const dir = join(tmpdir(), 'v5-abs-mut-' + m.name.split(' ')[0])
  rmSync(dir, { recursive: true, force: true })
  mkdirSync(dir, { recursive: true })
  for (const f of ['math-computation.js', 'math-engines.js']) copyFileSync(join(PRESET, f), join(dir, f))
  writeFileSync(join(dir, 'vibe-math-v5.js'), SRC.replace(m.from, m.to), 'utf8')
  const r = runAudit(join(dir, 'vibe-math-v5.js'))
  const list = reds(r.out)
  const hit = list.some((x) => x.indexOf(m.expectAudit) !== -1)
  const ok = r.code !== 0 && hit
  let invariantNote = ''
  if (m.expectInvariant) {
    const ir = spawnSync(process.execPath, [INVARIANTS, '--json'], {
      cwd: REPO, encoding: 'utf8', timeout: 600000,
      env: Object.assign({}, process.env, { PROMPT_INVARIANTS_MUTATE: JSON.stringify([REL, m.from, m.to]) }),
    })
    const txt = String(ir.stdout || '') + String(ir.stderr || '')
    let parsed = null
    try { parsed = JSON.parse(ir.stdout) } catch (e) { /* report below */ }
    const invariantRed = ir.status !== 0 && parsed && parsed.failed > 0
    invariantNote = ' | audit-prompt-invariants: ' + (invariantRed ? 'RED (failed=' + parsed.failed + ')' : 'NOT RED')
    if (!invariantRed) problems += 1
  }
  if (!ok) problems += 1
  console.log(m.name.padEnd(42) + ': audit exit=' + r.code + (ok ? '  RED (as required)' : '  NOT RED') + invariantNote)
  for (const x of list.slice(0, 2)) console.log('    → ' + x.slice(0, 140))
  rmSync(dir, { recursive: true, force: true })
}
console.log('')
console.log(problems === 0 ? 'ALL MUTANTS RED AS REQUIRED' : problems + ' problem(s)')
process.exit(problems === 0 ? 0 : 1)

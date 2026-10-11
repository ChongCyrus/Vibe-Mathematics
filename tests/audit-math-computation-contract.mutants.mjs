// Registered mutant harness for tests/audit-math-computation-contract.mjs — the audit carries its own proof.
// Defect shapes (all real, from this project's history):
//   (a) the SINGLE SOURCE (PARAM_PROPS_KEYS) drops a math param  ⇒ the derived schema loses it
//   (b) the FIRST (session-layer) registration reverts to a hand-written literal without the math keys
//   (c) the APPLY-LAYER registration does the same — only visible because the audit now checks EVERY site
// Each family mutates a COPY of the tree (the audit's MC_CONTRACT_ROOT seam) and must make the audit redden
// BY NAME. Child runs are bounded (a timeout is a HANG); skipped families are printed and counted.
// Exit criterion: every family reddens by name; ALL MUTANTS RED AS REQUIRED + exit 0 only then.
// Run: node tests/audit-math-computation-contract.mutants.mjs
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, rmSync, readdirSync } from 'node:fs'
import { execFileSync, spawnSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..')
const AUDIT = 'tests/audit-math-computation-contract.mjs'
// Bound every child run: run-tests has no per-suite timeout, so an unbounded child hangs the gate.
// A timeout is reported as HANG, counts as a failure for that family, and is listed in hangs=[].
const CHILD_TIMEOUT_MS = Number(process.env.MUTANT_CHILD_TIMEOUT_MS || 120000)
const TIMES = []
const hangs = []
const skipped = []
// Copy only the inputs read by this audit; research data and local checkouts are not fixtures.
function copyTree(from, to) {
  const files = ['README.md', 'README.en.md', 'docs/math-computation.md', 'vibe-math-v2/math-computation.js']
  for (const name of ['v2', 'v3', 'v4', 'v5', 'v5r']) {
    files.push('vibe-math-' + name + '/vibe-math-' + name + '.js', 'vibe-math-' + name + '/agent.cordis.yml')
  }
  for (const file of files) {
    const target = join(to, file)
    mkdirSync(dirname(target), { recursive: true })
    copyFileSync(join(from, file), target)
  }
}
function runFamily(f) {
  const dest = join(tmpdir(), 'mc-contract-mut-' + Math.random().toString(36).slice(2, 10))
  copyTree(REPO, dest)
  const target = join(dest, f.rel)
  const before = readFileSync(target, 'utf8')
  const n = before.split(f.from).length - 1
  if (f.firstOnly ? n < 1 : n !== 1) {
    skipped.push(f.name + ' (anchor x' + n + ')')
    console.error('  SKIP - ' + f.name + ' (anchor x' + n + ')')
    rmSync(dest, { recursive: true, force: true })
    return false
  }
  const mutated = f.firstOnly
    ? (() => { const i = before.indexOf(f.from); return before.slice(0, i) + f.to + before.slice(i + f.from.length) })()
    : before.split(f.from).join(f.to)
  writeFileSync(target, mutated, 'utf8')
  try { execFileSync(process.execPath, ['--check', target], { stdio: 'pipe' }) }
  catch (e) {
    writeFileSync(target, before, 'utf8')
    skipped.push(f.name + ' (mutation did not compile)')
    console.error('  SKIP - ' + f.name + ' (mutation did not compile; restored)')
    rmSync(dest, { recursive: true, force: true })
    return false
  }
  const t0 = Date.now()
  const r = spawnSync(process.execPath, [AUDIT], {
    cwd: REPO, encoding: 'utf8', timeout: CHILD_TIMEOUT_MS, killSignal: 'SIGKILL',
    env: Object.assign({}, process.env, { MC_CONTRACT_ROOT: dest }),
  })
  const ms = Date.now() - t0
  TIMES.push([f.name, ms])
  const hang = !!(r.error && (r.error.code === 'ETIMEDOUT' || r.signal === 'SIGKILL'))
  if (hang) hangs.push(f.name + '(' + Math.round(ms / 1000) + 's)')
  const out = String(r.stdout || '') + String(r.stderr || '')
  // this audit prints failures as `  - <label> — <detail>` (not `FAIL - ...`), so match the label itself
  const named = out.split(/\r?\n/).filter((l) => f.expect.test(l)).map((l) => l.trim())
  const ok = !hang && r.status === 1 && named.length > 0
  console.log((hang ? '  HANG - ' : (ok ? '  ok - ' : '  FAIL - ')) + f.name + ' [' + ms + 'ms]' + (named.length ? ' :: ' + named[0].slice(0, 150) : ' :: no named red (exit=' + r.status + ')'))
  rmSync(dest, { recursive: true, force: true })
  return ok
}
const WITHOUT_MATH_KEYS = "objParams({ mode: { type: 'string', enum: ['manual', 'auto'] } })"
const FAMILIES = [
  {
    name: 'the SINGLE SOURCE drops mathMode (derived key table)',
    rel: 'vibe-math-v3/vibe-math-v3.js',
    from: "'mathMode', 'mathEngines'",
    to: "'mathEngines'",
    expect: /set schema has the property mathMode/,
  },
  {
    name: 'the FIRST (session-layer) registration reverts to a literal without the math keys',
    rel: 'vibe-math-v3/vibe-math-v3.js',
    from: 'objParams(paramProps()), async function',
    to: WITHOUT_MATH_KEYS + ', async function',
    firstOnly: true,
    expect: /site#0 set schema has the property mathComputation/,
  },
  {
    name: 'the APPLY-LAYER registration reverts to a literal without the math keys',
    rel: 'vibe-math-v3/vibe-math-v3.js',
    from: "objParams(paramProps()), 'vibe_math_set_params')",
    to: WITHOUT_MATH_KEYS + ", 'vibe_math_set_params')",
    expect: /site#1 set schema has the property mathComputation/,
  },
]
let red = 0
for (const f of FAMILIES) { const ok = runFamily(f); if (ok) red++ }
console.log('')
console.log('mutant families reddening the math-contract audit by name: ' + red + '/' + FAMILIES.length)
console.log('timings: ' + TIMES.map((t) => String(t[0]).split('(')[0].trim().slice(0, 18) + '=' + t[1] + 'ms').join('  '))
console.log('hangs=[' + hangs.join(' | ') + ']')
console.log('skipped=[' + skipped.join(' | ') + ']')
if (red !== FAMILIES.length || skipped.length || hangs.length) process.exit(1)
console.log('ALL MUTANTS RED AS REQUIRED')

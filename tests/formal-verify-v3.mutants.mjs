// Registered mutant harness for the v3 formal-verify suite — the suite carries its own proof.
// Mirrors tests/formal-verify-v4.mutants.mjs and tests/v5-institute-fixes.mutants.mjs: each family is a
// SINGLE content-anchored mutation of the v3 preset (no line numbers), the suite runs through the
// V3_PLUGIN seam, child runs are bounded (a timeout is a HANG, never a pass), and skipped families are
// printed and counted. Exit criterion: every family reddens BY NAME; ALL MUTANTS RED AS REQUIRED.
// Run: node tests/formal-verify-v3.mutants.mjs
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, rmSync, readdirSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..')
const PRESET = 'vibe-math-v3'
const MAIN = PRESET + '.js'
const SUITE = 'tests/formal-verify-v3.test.mjs'
const ENV = 'V3_PLUGIN'
// Measured: the v3 formal-verify suite is ~40 s per child run; MUTANT_CHILD_TIMEOUT_MS overrides it.
const CHILD_TIMEOUT_MS = Number(process.env.MUTANT_CHILD_TIMEOUT_MS || 300000)
const TIMES = []
const hangs = []
const skipped = []
function copyGraph(file, dest) {
  const src = join(REPO, PRESET, file)
  copyFileSync(src, join(dest, file))
  for (const m of readFileSync(src, 'utf8').matchAll(/from\s+'(\.\/[A-Za-z0-9_.-]+\.js)'/g)) {
    const dep = m[1].slice(2)
    if (!readdirSync(dest).includes(dep)) copyGraph(dep, dest)
  }
}
function runFamily(f) {
  const dest = join(tmpdir(), 'v3fv-mut-' + Math.random().toString(36).slice(2, 10))
  mkdirSync(dest, { recursive: true })
  copyGraph(MAIN, dest)
  const target = join(dest, f.editFile || MAIN)
  const before = readFileSync(target, 'utf8')
  const n = before.split(f.from).length - 1
  const okCount = f.lastOnly || f.all ? n >= 1 : n === 1
  if (!okCount) {
    skipped.push(f.name + ' (anchor x' + n + ')')
    console.error('  SKIP - ' + f.name + ' (anchor x' + n + ')')
    rmSync(dest, { recursive: true, force: true })
    return false
  }
  const mutated = before.split(f.from).join(f.to)
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
  let out = ''
  let code = 0
  let hang = false
  try {
    out = execFileSync(process.execPath, [SUITE], {
      cwd: REPO, encoding: 'utf8', timeout: CHILD_TIMEOUT_MS, killSignal: 'SIGKILL',
      env: Object.assign({}, process.env, { [ENV]: join(dest, MAIN) }),
    })
  } catch (e) {
    if (e && (e.killed || e.signal === 'SIGKILL')) hang = true
    code = (e && e.status) || 1
    out = String((e && e.stdout) || '') + String((e && e.stderr) || '')
  }
  const ms = Date.now() - t0
  TIMES.push([f.name, ms])
  if (hang) hangs.push(f.name + '(' + Math.round(ms / 1000) + 's)')
  const named = out.split(/\r?\n/).filter((l) => /^\s*(FAIL - | {2}- )/.test(l) && f.expect.test(l)).map((l) => l.trim())
  const ok = !hang && code !== 0 && named.length > 0
  console.log((hang ? '  HANG - ' : (ok ? '  ok - ' : '  FAIL - ')) + f.name + ' [' + ms + 'ms]' + (named.length ? ' :: ' + named[0].slice(0, 150) : ' :: no named red (exit=' + code + ')'))
  rmSync(dest, { recursive: true, force: true })
  return ok
}
// MEASURED BOUNDARY (V3-G2): at this revision NO strictly count-preserving mutant exists for the
// re-eligible-SLOT-set assertion. Reason (measured in-product): a re-verification creates a FRESH
// task with `children: []` and `round: 1` (vibe-math-v3.js:2164) and the slot index comes from
// `const index = t.children.length` (:2172), so any fixed index offset shifts round one too and the
// two slot sets stay equal. The only mutant that reddens it therefore also changes the COUNT - it is
// labelled NOT COUNT-PRESERVING below, and it is landed because the assertion itself is the semantic
// unit (a re-verification that re-armed different slots satisfies the old count).
//
// TWO CANDIDATE MUTANTS WERE THEN MEASURED - BOTH REJECTED (so no V3-G2 family is shipped):
//   (i) the ruled shape (children: [] inherits the previous children) is INERT: the concluded verify
//       task is already deleted when the new one is built, so `tasks['verify:'+rId]` is undefined and
//       the expression degrades to `[]` => the suite ran to exit 0 with NO named red (a mutant that
//       changes nothing proves nothing);
//  (ii) the broad form (verifier backfill disabled entirely) made the suite exceed the 300 s child
//       cap => classified as a HANG, which is not a valid red either.
// => RECORDED BOUNDARY: at this revision the re-eligible-SLOT-set assertion ships WITHOUT a
//    discriminating mutant (measured, not assumed). The assertion itself is landed and green.

const FAMILIES = [
  {
    // V3-G1: every verifier spawn for one object is stamped with the SAME slot index, so two "independent
    // reviews" are really two copies of one slot. The fired-verifier COUNT stays 2 (the old assertion
    // passes); the distinct-slot assertion is what catches it.
    name: 'V3-G1: every review is stamped with the same slot index (count still 2)',
    from: "'verifier:' + t.rId + ':' + index",
    to: "'verifier:' + t.rId + ':0'",
    expect: /V3-G1 .*DISTINCT verifier slots/,
  },
]
let red = 0
for (const f of FAMILIES) { const ok = runFamily(f); if (ok) red++ }
const totalMs = TIMES.reduce((a, t) => a + t[1], 0)
console.log('')
console.log('mutant families reddening the v3 formal-verify suite by name: ' + red + '/' + FAMILIES.length)
console.log('timings (per family): ' + TIMES.map((t) => String(t[0]).split(':')[0] + '=' + t[1] + 'ms').join('  '))
console.log('TOTAL WALL TIME (all families + setup): ' + totalMs + 'ms (' + Math.round(totalMs / 1000) + 's)')
console.log('hangs=[' + hangs.join(' | ') + ']')
console.log('skipped=[' + skipped.join(' | ') + ']')
if (red !== FAMILIES.length || skipped.length || hangs.length) process.exit(1)
console.log('ALL MUTANTS RED AS REQUIRED')

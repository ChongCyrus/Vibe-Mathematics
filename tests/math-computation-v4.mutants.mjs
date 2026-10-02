// Registered mutant harness for the v4 math-computation WIRING suite — the suite's header documents the
// five mutants it "must kill"; this file makes that claim executable.
//
// F3 NOTE (measured, 2026-xx, `git rev-parse HEAD` at the time of the fix): the header's original M1
// anchor was STALE - it said "drop 'cli' from DEFAULT_PARAMS.mathEngines (or defaultOn)", but
//   · v4's DEFAULT_PARAMS has no literal engine list (it is `MATH_PARAM_DEFAULTS.mathEngines.slice()`),
//   · the real list is `MATH_ENGINE_ORDER` in `vibe-math-v4/math-engines.js:12`,
//   · and `defaultOn` does not exist anywhere in the tree (a phantom identifier).
// The header text is corrected accordingly, and the anchor below is the real site. Also measured: a
// first measurement pointed the seam at the mutated MODULE (`math-engines.js`) and the suite died with
// "apply is not a function" => `fails=0` was a measurement bug, not a product finding; a mutant must
// always be fed through the seam pointing at the PLUGIN file.
//
// Usage: node tests/math-computation-v4.mutants.mjs
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, rmSync, readdirSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..')
const PRESET = 'vibe-math-v4'
const MAIN = PRESET + '.js'
const SUITE = 'tests/math-computation-v4.test.mjs'
const ENV = 'V4_PLUGIN'
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
  const dest = join(tmpdir(), 'v4math-mut-' + Math.random().toString(36).slice(2, 10))
  mkdirSync(dest, { recursive: true })
  copyGraph(MAIN, dest)
  const target = join(dest, f.editFile || MAIN)
  const before = readFileSync(target, 'utf8')
  let mutated = null
  if (f.fromRe) {
    const re = new RegExp(f.fromRe)
    const m = re.exec(before)
    if (!m) { skipped.push(f.name + ' (regex missed)'); console.error('  SKIP - ' + f.name + ' (regex missed)'); rmSync(dest, { recursive: true, force: true }); return false }
    mutated = before.replace(re, f.to)
  } else {
    const n = before.split(f.from).length - 1
    if (n !== 1) { skipped.push(f.name + ' (anchor x' + n + ')'); console.error('  SKIP - ' + f.name + ' (anchor x' + n + ')'); rmSync(dest, { recursive: true, force: true }); return false }
    mutated = before.replace(f.from, f.to)
  }
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
    // ALWAYS point the seam at the PLUGIN file, even when the mutated file is a dependency (measured
    // trap: pointing it at math-engines.js made the suite die with "apply is not a function").
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
const FAMILIES = [
  {
    // The header's M1, with the CORRECTED site (math-engines.js, not DEFAULT_PARAMS.mathEngines).
    name: 'M1 default-engines-dropped: cli removed from MATH_ENGINE_ORDER',
    editFile: 'math-engines.js',
    from: "export const MATH_ENGINE_ORDER = ['python', 'r', 'octave', 'julia', 'matlab', 'maple', 'wolfram', 'cli']",
    to: "export const MATH_ENGINE_ORDER = ['python', 'r', 'octave', 'julia', 'matlab', 'maple', 'wolfram']",
    expect: /engine=cli runs with the DEFAULT parameters/,
  },
  {
    name: 'M2 typed-still-shell: the availability line is forced to typed+shell',
    from: "mathAvailabilityLine(probe,'zh',params.mathMode)",
    to: "mathAvailabilityLine(probe,'zh','typed+shell')",
    expect: /mathMode=typed injects NO shell-fallback sentence/,
  },
  {
    name: 'M3 timeout-no-kill: the timeout path no longer terminates the handle',
    fromRe: "killedByUs=true(\\s*)try \\{ if\\(typeof handle\\.terminate==='function'\\) handle\\.terminate\\(\\) \\} catch\\(e\\)\\{ /\\* best effort \\*/ \\}",
    to: 'killedByUs=true$1try { if(false) handle.terminate() } catch(e){ /* best effort */ }',
    expect: /the timeout path really called handle\.terminate\(\)/,
  },
  {
    name: 'M4 registration-dropped: the tool is registered under a different name',
    from: 'registerTool(mathToolFace.name, mathToolFace.description',
    to: "registerTool(mathToolFace.name + '_x', mathToolFace.description",
    expect: /math_computation is registered exactly once/,
  },
  {
    name: 'M5 params-not-normalized: normalizeParam returns the raw value',
    from: 'function normalizeParam(k, v){',
    to: 'function normalizeParam(k, v){ return v   // MUTANT: raw',
    expect: /mathTimeoutMs=5 was clamped by the shared normalizer|an unknown mathMode degrades to typed\+shell/,
  },
]
let red = 0
for (const f of FAMILIES) { const ok = runFamily(f); if (ok) red++ }
const totalMs = TIMES.reduce((a, t) => a + t[1], 0)
console.log('')
console.log('mutant families reddening the v4 math-computation wiring suite by name: ' + red + '/' + FAMILIES.length)
console.log('timings (per family): ' + TIMES.map((t) => String(t[0]).split(':')[0] + '=' + t[1] + 'ms').join('  '))
console.log('TOTAL WALL TIME (all families + setup): ' + totalMs + 'ms (' + Math.round(totalMs / 1000) + 's)')
console.log('hangs=[' + hangs.join(' | ') + ']')
console.log('skipped=[' + skipped.join(' | ') + ']')
if (red !== FAMILIES.length || skipped.length || hangs.length) process.exit(1)
console.log('ALL MUTANTS RED AS REQUIRED')

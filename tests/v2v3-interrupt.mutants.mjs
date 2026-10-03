// Registered mutant harness for the v2/v3 math-computation suites (task-14 / SLV probe P3): the suites'
// §19 D1 section already covers "unknown child" and "empty childId" — this family makes the missing one
// executable: the "host REFUSES to interrupt" branch must keep its NAMED code and its actionable `next`.
//
// Measured traps reused from tests/math-computation-v4.mutants.mjs:
//   · the seam must point at the PLUGIN file (`MC_V2_PLUGIN` / `MC_V3_PLUGIN`), and the copied graph must
//     include the plugin's local dependencies, or the suite dies before reaching any assertion;
//   · an anchor that matches a different number of times than expected is a SETUP failure, not a red.
//
// Usage: node tests/v2v3-interrupt.mutants.mjs
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, rmSync, readdirSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..')
const CHILD_TIMEOUT_MS = Number(process.env.MUTANT_CHILD_TIMEOUT_MS || 300000)
const TIMES = []
const hangs = []
const skipped = []

function copyGraph(preset, file, dest) {
  const src = join(REPO, preset, file)
  copyFileSync(src, join(dest, file))
  for (const m of readFileSync(src, 'utf8').matchAll(/from\s+'(\.\/[A-Za-z0-9_.-]+\.js)'/g)) {
    const dep = m[1].slice(2)
    if (!readdirSync(dest).includes(dep)) copyGraph(preset, dep, dest)
  }
}

function runFamily(f) {
  const dest = join(tmpdir(), f.preset.replace(/[^a-z0-9]/gi, '') + '-mut-' + Math.random().toString(36).slice(2, 10))
  mkdirSync(dest, { recursive: true })
  copyGraph(f.preset, f.main, dest)
  const target = join(dest, f.main)
  // task-7 discipline: anchor matching is done on an EOL-normalised copy, and a leaked CR is a SETUP
  // failure (a lone CR would silently change the anchor's match count).
  let before = readFileSync(target, 'utf8')
  if (/\r/.test(before.replace(/\r\n/g, '\n'))) {
    console.error('SETUP-FAIL - the anchor source was not EOL-normalised (a lone CR leaked in)')
    rmSync(dest, { recursive: true, force: true })
    process.exit(1)
  }
  const n = before.split(f.from).length - 1
  if (n !== 1) {
    skipped.push(f.name + ' (anchor x' + n + ')')
    console.error('  SKIP - ' + f.name + ' (anchor x' + n + ', expected exactly 1)')
    rmSync(dest, { recursive: true, force: true })
    return false
  }
  writeFileSync(target, before.replace(f.from, f.to), 'utf8')
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
    out = execFileSync(process.execPath, [f.suite], {
      cwd: REPO, encoding: 'utf8', timeout: CHILD_TIMEOUT_MS, killSignal: 'SIGKILL',
      env: Object.assign({}, process.env, { [f.env]: join(dest, f.main) }),
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
    name: 'P3/v2: the host-refused-interrupt code is renamed (the named failure disappears)',
    preset: 'vibe-math-v2', main: 'vibe-math-v2.js',
    suite: 'tests/math-computation-v2.test.mjs', env: 'MC_V2_PLUGIN',
    from: 'VIBE_MATH_INTERRUPT_FAILED', to: 'VIBE_MATH_INTERRUPT_RENAMED',
    expect: /\[P3\/v2\] 宿主拒绝中断/,
  },
  {
    name: 'P3/v3: the host-refused-interrupt code is renamed (the named failure disappears)',
    preset: 'vibe-math-v3', main: 'vibe-math-v3.js',
    suite: 'tests/math-computation-v3.test.mjs', env: 'MC_V3_PLUGIN',
    from: 'VIBE_MATH_INTERRUPT_FAILED', to: 'VIBE_MATH_INTERRUPT_RENAMED',
    expect: /\[P3\/v3\] 宿主拒绝中断/,
  },
]

let red = 0
for (const f of FAMILIES) { if (runFamily(f)) red++ }
console.log('')
console.log('mutant families reddening the v2/v3 host-refused-interrupt guard by name: ' + red + '/' + FAMILIES.length)
console.log('skipped=[' + skipped.join(' | ') + ']')
console.log('timings: ' + TIMES.map((t) => String(t[0]).split(':')[0] + '=' + t[1] + 'ms').join('  '))
console.log('hangs=[' + hangs.join(' | ') + ']')
if (red !== FAMILIES.length || skipped.length || hangs.length) process.exit(1)
console.log('ALL MUTANTS RED AS REQUIRED')

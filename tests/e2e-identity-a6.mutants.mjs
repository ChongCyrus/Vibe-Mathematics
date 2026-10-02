// Registered mutant harness for the A6 name-set snapshots (tests/e2e-multisession.test.mjs / tests/e2e-v3.test.mjs).
// A same-count tool rename must redden the identity assertion (counting alone would pass). One family per preset.
// Exit criterion: every family reddens BY NAME; any skipped family prints, is counted, and forces exit 1.
// Run: node tests/e2e-identity-a6.mutants.mjs
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, rmSync, readdirSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'

// Bound every child run: run-tests has no per-suite timeout, so an unbounded child hangs the gate.
// A timeout is reported as HANG, counts as a failure for that family, and is listed in hangs=[].
const CHILD_TIMEOUT_MS = Number(process.env.MUTANT_CHILD_TIMEOUT_MS || 120000)
const TIMES = []
const hangs = []
let lastHang = false
const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..')
function copyGraph(preset, file, dest) {
  const src = join(REPO, preset, file)
  copyFileSync(src, join(dest, file))
  for (const m of readFileSync(src, 'utf8').matchAll(/from\s+'(\.\/[A-Za-z0-9_.-]+\.js)'/g)) {
    const dep = m[1].slice(2)
    if (!readdirSync(dest).includes(dep)) copyGraph(preset, dep, dest)
  }
}
const skipped = []
function runFamily(f) {
  const dest = join(tmpdir(), 'a6-mut-' + Math.random().toString(36).slice(2, 10))
  mkdirSync(dest, { recursive: true })
  copyGraph(f.preset, f.preset + '.js', dest)
  const target = join(dest, f.preset + '.js')
  const before = readFileSync(target, 'utf8')
  const n = before.split(f.from).length - 1
  if (n < 1) { skipped.push(f.name + ' (anchor x' + n + ')'); console.error('  SKIP - ' + f.name + ' (anchor x' + n + ')'); rmSync(dest, { recursive: true, force: true }); return false }
  writeFileSync(target, before.split(f.from).join(f.to), 'utf8')   // all occurrences: the two registration layers must stay identical
  try { execFileSync(process.execPath, ['--check', target], { stdio: 'pipe' }) }
  catch (e) { writeFileSync(target, before, 'utf8'); skipped.push(f.name + ' (mutation did not compile)'); console.error('  SKIP - ' + f.name + ' (mutation did not compile; restored)'); rmSync(dest, { recursive: true, force: true }); return false }
  let out = ''
  let code = 0
  try { out = execFileSync(process.execPath, [f.suite], { cwd: REPO, encoding: 'utf8', timeout: CHILD_TIMEOUT_MS, killSignal: 'SIGKILL', env: Object.assign({}, process.env, { [f.env]: join(dest, f.preset + '.js') }) }) }
  catch (e) { if (e && (e.killed || e.signal === 'SIGKILL')) lastHang = true; code = (e && e.status) || 1; out = String((e && e.stdout) || '') + String((e && e.stderr) || '') }
  const named = out.split(/\r?\n/).filter((l) => /^\s*(FAIL - | {2}- )/.test(l) && f.expect.test(l)).map((l) => l.trim())
  const ok = code !== 0 && named.length > 0
  console.log((ok ? '  ok - ' : '  FAIL - ') + f.name + (named.length ? ' :: ' + named[0].slice(0, 135) : ' :: no named red (exit=' + code + ')'))
  rmSync(dest, { recursive: true, force: true })
  return ok
}
const FROM = "registerTool('vibe_math_template'"
const TO = "registerTool('vibe_math_templateX'"
const FAMILIES = [
  { name: 'A6-v2 (tool renamed, count unchanged)', preset: 'vibe-math-v2', suite: 'tests/e2e-multisession.test.mjs', env: 'MC_V2_PLUGIN', from: FROM, to: TO,
    expect: /A6：注册的工具\*\*名字集合\*\*与快照逐个匹配/ },
  { name: 'A6-v3 (tool renamed, count unchanged)', preset: 'vibe-math-v3', suite: 'tests/e2e-v3.test.mjs', env: 'MC_V3_PLUGIN', from: FROM, to: TO,
    expect: /A6：注册的工具\*\*名字集合\*\*与快照逐个匹配/ },
]
let red = 0
for (const f of FAMILIES) { const t0 = Date.now(); lastHang = false; const ok = runFamily(f); const ms = Date.now() - t0; TIMES.push([f.name, ms]); if (lastHang) hangs.push(f.name + "(" + Math.round(ms / 1000) + "s)"); if (ok) red++ }
console.log('')
console.log('mutant families reddening the A6 identity assertion by name: ' + red + '/' + FAMILIES.length)
console.log('skipped=[' + skipped.join(' | ') + ']')
console.log('timings: ' + TIMES.map((t) => String(t[0]).split(':')[0] + '=' + t[1] + 'ms').join('  '))
console.log('hangs=[' + hangs.join(' | ') + ']')
if (red !== FAMILIES.length || skipped.length || hangs.length) process.exit(1)
console.log('ALL MUTANTS RED AS REQUIRED')

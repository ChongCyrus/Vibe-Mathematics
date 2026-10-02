// Registered mutant harness for the A1 skip-ledger contract (tests/math-computation-v2|v3.test.mjs).
// A1 is load-bearing only if NON-EXERCISE reddens it: each family nulls the copy module's
// packageManager/packageManagerAvailable and must redden the named line. Two families (one per preset).
// Exit criterion: every family reddens BY NAME; any skipped family prints, is counted, and forces exit 1.
// Run: node tests/math-computation-a1.mutants.mjs
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
  const dest = join(tmpdir(), 'a1-mut-' + Math.random().toString(36).slice(2, 10))
  mkdirSync(dest, { recursive: true })
  copyGraph(f.preset, f.preset + '.js', dest)
  const target = join(dest, 'math-computation.js')
  const before = readFileSync(target, 'utf8')
  let mutated = before
  for (const [from, to] of f.edits) {
    const n = mutated.split(from).length - 1
    if (n !== 1) { skipped.push(f.name + ' (' + from.slice(0, 24) + ' x' + n + ')'); console.error('  SKIP - ' + f.name + ' (anchor x' + n + ')'); rmSync(dest, { recursive: true, force: true }); return false }
    mutated = mutated.split(from).join(to)
  }
  writeFileSync(target, mutated, 'utf8')
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
const EDITS = [
  ['    packageManager: mgr,', '    packageManager: null,'],
  ['    packageManagerAvailable: mgr ? available : null,', '    packageManagerAvailable: null,'],
]
const FAMILIES = [
  { name: 'A1-v2 (packageManager nulled)', preset: 'vibe-math-v2', suite: 'tests/math-computation-v2.test.mjs', env: 'MC_V2_PLUGIN', edits: EDITS,
    expect: /A1：「包管理器存在 ⇒ 可执行命令」这半契约必须真的跑过/ },
  { name: 'A1-v3 (packageManager nulled)', preset: 'vibe-math-v3', suite: 'tests/math-computation-v3.test.mjs', env: 'MC_V3_PLUGIN', edits: EDITS,
    expect: /A1：「包管理器存在 ⇒ 可执行命令」这半契约必须真的跑过/ },
]
let red = 0
for (const f of FAMILIES) { const t0 = Date.now(); lastHang = false; const ok = runFamily(f); const ms = Date.now() - t0; TIMES.push([f.name, ms]); if (lastHang) hangs.push(f.name + "(" + Math.round(ms / 1000) + "s)"); if (ok) red++ }
console.log('')
console.log('mutant families reddening the A1 contract by name: ' + red + '/' + FAMILIES.length)
console.log('skipped=[' + skipped.join(' | ') + ']')
console.log('timings: ' + TIMES.map((t) => String(t[0]).split(':')[0] + '=' + t[1] + 'ms').join('  '))
console.log('hangs=[' + hangs.join(' | ') + ']')
if (red !== FAMILIES.length || skipped.length || hangs.length) process.exit(1)
console.log('ALL MUTANTS RED AS REQUIRED')

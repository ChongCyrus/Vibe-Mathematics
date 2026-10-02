// Registered mutant harness for the v5 self-drive suite — the suite carries its own proof.
// Mirrors tests/formal-verify-v4.mutants.mjs / formal-verify-v3.mutants.mjs: a SINGLE content-anchored
// mutation of the v5 preset (no line numbers), run through the V5_PLUGIN seam, bounded child runs (a
// timeout is a HANG, never a pass), skipped families printed and counted, and the family's TOTAL WALL
// TIME reported (per-family numbers alone can hide a timeout).
// Run: node tests/selfdrive-v5.mutants.mjs
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, rmSync, readdirSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..')
const PRESET = 'vibe-math-v5'
const MAIN = PRESET + '.js'
const SUITE = 'tests/selfdrive-v5.mjs'
const ENV = 'V5_PLUGIN'
// Measured: a selfdrive-v5 child run is ~2 s; MUTANT_CHILD_TIMEOUT_MS overrides it.
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
  const dest = join(tmpdir(), 'v5sd-mut-' + Math.random().toString(36).slice(2, 10))
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
  writeFileSync(target, before.split(f.from).join(f.to), 'utf8')
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
const FAMILIES = [
  {
    // V5-A1: the LAST voter is replaced by a DUPLICATE of the first, so P stays 4 (the count assertion
    // passes) while the voter id SET loses a member - the roster identity, not the head-count.
    name: 'V5-A1: the last voter is a duplicate of the first (P still 4)',
    from: "const voters = () => activeMembers().filter((m) => m.kind === 'academician' || m.kind === 'researcher')",
    to: "const voters = () => { const v = activeMembers().filter((m) => m.kind === 'academician' || m.kind === 'researcher'); return v.length > 1 ? v.slice(0, -1).concat([v[0]]) : v }",
    expect: /V5-A1 the voter id SET is exactly/,
  },
  {
    // F6 tightening (roster): the published voter set drops one member while its COUNT stays put.
    name: 'V5-A2: the published voter set disagrees with its own count',
    from: 'voters: vs.map((m) => m.id),',
    to: 'voters: vs.slice(1).map((m) => m.id),',
    expect: /V5-A2 the published voter SET agrees with its own count/,
  },
  {
    // F6 tightening (staff): the member persona ignores `params.staffPersona` again.
    name: 'V5-A3: the staff persona never reaches the prompts',
    from: "const extra = String(params.staffPersona || '').trim()",
    to: "const extra = ''",
    expect: /V5-A3 the staff persona reaches the member persona\/prompts/,
  },
  {
    // ④ CAS: the stale-revision guard is disabled, so a stale update lands (the return-value
    // assertions AND the new "unchanged after refusal" assertion redden).
    name: 'V5-A4: the stale-revision guard is disabled (a stale CAS lands)',
    from: 'if (expected !== task.revision) {',
    to: 'if (false) {',
    expect: /V5-A4 a REFUSED stale CAS leaves the task UNCHANGED|a stale revision is refused/,
  },
]
let red = 0
for (const f of FAMILIES) { const ok = runFamily(f); if (ok) red++ }
const totalMs = TIMES.reduce((a, t) => a + t[1], 0)
console.log('')
console.log('mutant families reddening the v5 self-drive suite by name: ' + red + '/' + FAMILIES.length)
console.log('timings (per family): ' + TIMES.map((t) => String(t[0]).split(':')[0] + '=' + t[1] + 'ms').join('  '))
console.log('TOTAL WALL TIME (all families + setup): ' + totalMs + 'ms (' + Math.round(totalMs / 1000) + 's)')
console.log('hangs=[' + hangs.join(' | ') + ']')
console.log('skipped=[' + skipped.join(' | ') + ']')
if (red !== FAMILIES.length || skipped.length || hangs.length) process.exit(1)
console.log('ALL MUTANTS RED AS REQUIRED')

// Registered mutant harness for the v4 formal-verify suite — the suite carries its own proof.
// Mirrors tests/v5-institute-fixes.mutants.mjs: each family is a SINGLE content-anchored mutation of the
// v4 preset (no line numbers), the suite runs through the V4_PLUGIN seam, child runs are bounded (a
// timeout is a HANG, never a pass), and skipped families are printed and counted.
// Exit criterion: every family reddens BY NAME; ALL MUTANTS RED AS REQUIRED + exit 0 only then.
// Run: node tests/formal-verify-v4.mutants.mjs
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, rmSync, readdirSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..')
const PRESET = 'vibe-math-v4'
const MAIN = PRESET + '.js'
const SUITE = 'tests/formal-verify-v4.test.mjs'
const ENV = 'V4_PLUGIN'
// The formal-verify suite is long, so the default child budget is generous; MUTANT_CHILD_TIMEOUT_MS
// overrides it.
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
  const dest = join(tmpdir(), 'v4fv-mut-' + Math.random().toString(36).slice(2, 10))
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
  const mutated = f.lastOnly
    ? (() => { const i = before.lastIndexOf(f.from); return before.slice(0, i) + f.to + before.slice(i + f.from.length) })()
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
    // R10-F1: reading `allow` (a permission LIST) as a fence root — this is the branch the no-op path
    // must keep dead, and the red proves case 1b actually reaches the helper with that shape.
    name: 'F-5/1b: treat `allow` as a fence root',
    from: '    else if(p.config && p.config.workspaceRoot !== undefined) pick = p.config.workspaceRoot',
    to: '    else if(p.config && p.config.workspaceRoot !== undefined) pick = p.config.workspaceRoot\n    else if(p.allow !== undefined) pick = p.allow',
    expect: /F-5\/1b .*produces NO warning/,
  },
  {
    // the whole comparison removed: a real drift goes unnamed
    name: 'F-5/ii: the drift comparison is never called',
    from: 'fenceRootDriftNote(p);',
    to: 'void 0;',
    expect: /F-5\/ii the drift is NAMED exactly once/,
  },
  {
    // containment disabled: agreeing/ancestor roots would warn (the per-session false alarm)
    name: 'F-5/iii+iv: the containment predicate is disabled (always warn)',
    from: '    if(contained) return',
    to: '    if(false) return',
    expect: /F-5\/iv an AGREEING resolved root produces NO warning/,
  },
  {
    // one-shot dropped: the warning repeats on every policy resolution
    name: 'F-5/ii: the one-shot is dropped',
    from: '    if(!warnedFenceDrift){',
    to: '    if(true){',
    expect: /F-5\/ii the drift is NAMED exactly once .*matched=2/,
  },
  {
    // F-6 site 4: the swallowed compaction failure becomes silent again
    name: 'N15/4: the compaction-failure warning is silenced',
    from: '} catch(e){ if(!warnedCompaction){ warnedCompaction=true;',
    to: '} catch(e){ if(false){ warnedCompaction=true;',
    expect: /N15\/4 realCompact: a failed compaction is NAMED exactly once/,
  },
  {
    // F-5/1c: the `.` clause of the guard is dropped, so an UNKNOWN session cwd (workspaceRoot() ===
    // ".") is reported as drift even though it is constructively unknown, not drifted.
    name: 'F-5/1c: an unknown session cwd is warned about',
    from: "    if(!session || session === '.') return",
    to: '    if(!session) return',
    expect: /F-5\/1c an UNKNOWN session cwd stays SILENT/,
  },
  {
    // F6-v4: the `.current` marker write fails silently again (its guard is removed).
    name: 'N18: a failed current-project marker write is silent again',
    from: 'if(ok===false && !warnedCurrentProject){',
    to: 'if(false){',
    expect: /N18 the failed .*write is NAMED exactly once/,
  },
  {
    // ③: the in-function naming is removed again, so a failed index write is silent for all six
    // callers (the measured pre-fix behaviour).
    name: 'N20-3b: a failed index write is silent again',
    from: 'if((_idxLibOk === false || _idxProvedOk === false) && !warnedIndexRebuild){',
    to: 'if(false){',
    expect: /N20-3b a failed index write is NAMED exactly once/
  },
]
let red = 0
for (const f of FAMILIES) { const ok = runFamily(f); if (ok) red++ }
console.log('')
console.log('mutant families reddening the v4 formal-verify suite by name: ' + red + '/' + FAMILIES.length)
console.log('timings: ' + TIMES.map((t) => String(t[0]).split(':')[0] + '=' + t[1] + 'ms').join('  '))
const totalMs = TIMES.reduce((a, t) => a + t[1], 0)
console.log('TOTAL WALL TIME (all families + setup): ' + totalMs + 'ms (' + Math.round(totalMs / 1000) + 's)')
console.log('hangs=[' + hangs.join(' | ') + ']')
console.log('skipped=[' + skipped.join(' | ') + ']')
if (red !== FAMILIES.length || skipped.length || hangs.length) process.exit(1)
console.log('ALL MUTANTS RED AS REQUIRED')

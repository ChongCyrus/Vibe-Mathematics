// Registered mutant harness for the v4 final-paper path — the suite carries its own proof.
// Each family is a SINGLE content-anchored mutation of the v4 preset (no line numbers); the suite runs
// through the V4_PLUGIN seam. Child runs are bounded (a timeout is a HANG); skipped families are printed
// and counted. Exit criterion: every family reddens BY NAME; ALL MUTANTS RED AS REQUIRED + exit 0 only then.
// Run: node tests/v4-final-paper.mutants.mjs
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, rmSync, readdirSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..')
const PRESET = 'vibe-math-v4'
const MAIN = PRESET + '.js'
const SUITE = 'tests/v4-final-paper.test.mjs'
const ENV = 'V4_PLUGIN'
const START_MS = Date.now()
// This suite is long, so the default child budget is generous; MUTANT_CHILD_TIMEOUT_MS overrides it.
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
  const dest = join(tmpdir(), 'v4paper-mut-' + Math.random().toString(36).slice(2, 10))
  mkdirSync(dest, { recursive: true })
  copyGraph(MAIN, dest)
  const target = join(dest, f.editFile || MAIN)
  const before = readFileSync(target, 'utf8').replace(/\r\n?/g, '\n')   // task-7: anchors are LF; a CRLF checkout made them match 0 times
if (/\r/.test(before)) { console.error('SETUP-FAIL - the anchor source was not EOL-normalised (CRLF leaked into anchor matching)'); process.exit(1) }
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
    // task-11: the not-detected case must WARN on the reachable surfaces (finalize return + status view).
    // Dropping the appended note must redden the guarding assertion BY NAME.
    name: 'task-11/v4: the not-detected warning drops the actionable sentence',
    from: '已探测 PATH 与文档化的常见 TeX 根；可用 paperLatexCommand 指定绝对路径。',
    to: '',
    expect: /\[task-9\/v4\]/,
  },
  {
    // task-10: restoring the merged order lets an unresolvable explicit command fall through to another
    // engine again (the documented rule is "explicit ⇒ only it").
    name: 'task-10/v4: the explicit LaTeX command falls through to another engine again',
    from: 'const order=prefer?[prefer]:base',
    to: 'const order=(prefer?[prefer]:[]).concat(base.filter(x=>x!==prefer))',
    expect: /\[task-10\/v4\]/,
  },
  {
    // The delivered artifacts must state WHY no PDF was produced (the body is composed BEFORE compilation,
    // so this note is written after it). Blunting the zh note must redden that guard BY NAME.
    name: 'deliverable/v4: the delivered paper stops stating that no engine was detected',
    from: "zh?'本机未检测到 LaTeX 引擎：只产出 tex+md'",
    to: "zh?''",
    expect: /\[deliverable\/v4\]/,
  },
  {
    // task-23: a meeting speech missing from the end block must be recorded with a NAMED placeholder.
    name: 'real1004-minutes: a silent meeting speech is stored as an empty body again',
    from: "'（本轮结束块未含 input/summary：框架按空发言记录，见 docs/final-paper.md）'",
    to: "''",
    expect: /\[real1004-minutes\] a meeting speech missing from the end block is recorded with a NAMED placeholder/,
  },
]
let red = 0
for (const f of FAMILIES) { const t0 = Date.now(); const ok = runFamily(f); const ms = Date.now() - t0; if (ok) red++ }
console.log('')
console.log('mutant families reddening the v4 final-paper path by name: ' + red + '/' + FAMILIES.length)
console.log('skipped=[' + skipped.join(' | ') + ']')
console.log('timings: ' + TIMES.map((t) => String(t[0]).split(':')[0] + '=' + t[1] + 'ms').join('  '))
console.log('TOTAL WALL TIME (all families + setup): ' + (Date.now() - START_MS) + 'ms (' + Math.round((Date.now() - START_MS) / 1000) + 's)')
console.log('hangs=[' + hangs.join(' | ') + ']')
if (red !== FAMILIES.length || skipped.length || hangs.length) process.exit(1)
console.log('ALL MUTANTS RED AS REQUIRED')

// Registered mutant harness for tests/v2-fix-probes.test.mjs — the probe carries its own proof.
// Defect classes: surface-shape contract (F1), declared asymmetry (F-A), path-base mixing (F6),
// silent-failure surfacing (F6a/F6b/F6c). Single content-anchored mutations; V2_PLUGIN seam.
// Exit criterion: every family reddens BY NAME; any skipped family is printed and counted (never a
// silent NO-OP impersonating a pass); ALL MUTANTS RED AS REQUIRED + exit 0 only then.
// Run: node tests/v2-fix-probes.mutants.mjs
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, rmSync, readdirSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'

// Bound every child run: run-tests has no per-suite timeout, so an unbounded child hangs the gate.
// A timeout is reported as HANG, counts as a failure for that family, and is listed in hangs=[].
const CHILD_TIMEOUT_MS = Number(process.env.MUTANT_CHILD_TIMEOUT_MS || 120000)
const TIMES = []
// R15: whole-process wall time, printed at the end (the timeout row quotes this line).
const START_MS = Date.now()
const hangs = []
let lastHang = false
const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..')
const PRESET = 'vibe-math-v2'
const MAIN = PRESET + '.js'
const SUITE = 'tests/v2-fix-probes.test.mjs'
const ENV = 'V2_PLUGIN'
function copyGraph(file, dest) {
  const src = join(REPO, PRESET, file)
  copyFileSync(src, join(dest, file))
  for (const m of readFileSync(src, 'utf8').matchAll(/from\s+'(\.\/[A-Za-z0-9_.-]+\.js)'/g)) {
    const dep = m[1].slice(2)
    if (!readdirSync(dest).includes(dep)) copyGraph(dep, dest)
  }
}
const skipped = []
function runFamily(f) {
  const dest = join(tmpdir(), 'v2probes-mut-' + Math.random().toString(36).slice(2, 10))
  mkdirSync(dest, { recursive: true })
  copyGraph(MAIN, dest)
  const target = join(dest, f.editFile || MAIN)
  const before = readFileSync(target, 'utf8')
  const n = before.split(f.from).length - 1
  const okCount = f.lastOnly || f.firstOnly || f.all ? n >= 1 : n === 1
  if (!okCount) { skipped.push(f.name + ' (anchor x' + n + ')'); console.error('  SKIP - ' + f.name + ' (anchor x' + n + ')'); rmSync(dest, { recursive: true, force: true }); return false }
  let mutated
  if (f.lastOnly) { const i = before.lastIndexOf(f.from); mutated = before.slice(0, i) + f.to + before.slice(i + f.from.length) }
  else if (f.firstOnly) { const i = before.indexOf(f.from); mutated = before.slice(0, i) + f.to + before.slice(i + f.from.length) }
  else if (f.all) mutated = before.split(f.from).join(f.to)
  else mutated = before.split(f.from).join(f.to)
  writeFileSync(target, mutated, 'utf8')
  try { execFileSync(process.execPath, ['--check', target], { stdio: 'pipe' }) }
  catch (e) { writeFileSync(target, before, 'utf8'); skipped.push(f.name + ' (mutation did not compile)'); console.error('  SKIP - ' + f.name + ' (mutation did not compile; restored)'); rmSync(dest, { recursive: true, force: true }); return false }
  let out = ''
  let code = 0
  try { out = execFileSync(process.execPath, [SUITE], { cwd: REPO, encoding: 'utf8', timeout: CHILD_TIMEOUT_MS, killSignal: 'SIGKILL', env: Object.assign({}, process.env, { [ENV]: join(dest, MAIN) }) }) }
  catch (e) { if (e && (e.killed || e.signal === 'SIGKILL')) lastHang = true; code = (e && e.status) || 1; out = String((e && e.stdout) || '') + String((e && e.stderr) || '') }
  const named = out.split(/\r?\n/).filter((l) => /^\s*(FAIL - | {2}- )/.test(l) && f.expect.test(l)).map((l) => l.trim())
  const ok = code !== 0 && named.length > 0
  console.log((ok ? '  ok - ' : '  FAIL - ') + f.name + (named.length ? ' :: ' + named[0].slice(0, 130) : ' :: no named red (exit=' + code + ')'))
  rmSync(dest, { recursive: true, force: true })
  return ok
}
const ANCHOR_LEN = "pendingDecisions: decisionQueue.filter(function (d) { return d.status === 'pending' }).length,"
const FAMILIES = [
  { name: 'F1: report pendingDecisions back to an array', expect: /\[F1\] pendingDecisions 两面同形/, from: ANCHOR_LEN, firstOnly: true,
    to: "pendingDecisions: decisionQueue.filter(function (d) { return d.status === 'pending' }).map(function (d) { return { id: d.id, node: d.node, context: d.context } })," },
  { name: 'F-A: status gains pendingDecisionItems', expect: /\[F-A\] status \*\*不得\*\*携带明细/, from: ANCHOR_LEN,
    to: ANCHOR_LEN + "\n  pendingDecisionItems: decisionQueue.filter(function (d) { return d.status === 'pending' }).map(function (d) { return { id: d.id, node: d.node, context: d.context } }),", lastOnly: true },
  { name: 'F6: paths base dropped from both surfaces', expect: /\[F6\] status\.formal\.paths 带 base \+ note/,
    from: "paths: { base: frameworkRoot() + '/', project: 'Formal/', proofs: 'Verified/Lean/', lib:",
    to: "paths: { project: 'Formal/', proofs: 'Verified/Lean/', lib:", all: true },
  { name: 'F6a: provider list-failure warning removed', expect: /\[F6a\]/,
    from: "warnProviderFallback('subagents.list() failed: ' + ((e && e.message) || e))", to: 'void e' },
  { name: 'F6b: interrupt emit statement deleted (anchored by content)', expect: /\[F6b\/v2\]/,
    from: "if (r && r.ok === false) logActivity('interrupt', '中断失败（' + why + '）：' + String(cid) + ' — ' + String(r.message || r.code || ''))", to: 'void r' },
  { name: 'F6c: project-pointer write failure re-silenced', expect: /\[F6c\]/,
    from: "noteStateWriteFailure('current.' + safeId(sessionId) + '.json', (e && e.message) || e)", to: 'void e' },
]
let red = 0
FAMILIES.push(
  { name: 'F5/v2: fence-root comparison removed', expect: /\[F5\/v2\] 围栏根漂移/,
    from: 'if (actual && expected && actual !== expected) warnFenceDriftOnce(actual, expected)', to: 'void actual' },
)
FAMILIES.push(
  { name: 'F-B: derivation drops the source descriptions', expect: /\[F-B\/v2\] 每个机读描述都来自真源且非空/,
    from: 'if (e.description) p.description = e.description', to: 'void e /* MUTANT F-B: no source description */' },
  { name: 'F-B: one exception entry deleted', expect: /\[F-B\/v2\] 例外集合 == docs\/parameter-schema\.md/,
    from: "solverToolAllow: { type: 'array', items: { type: 'string' } },", to: '' },
  { name: 'F-B: one registration site reverted to a literal', expect: /\[F-B\/v2\] 两处注册点都由 paramProps\(\)/,
    from: "objParams(paramProps()), 'vibe_math_set_params')", to: "objParams({ mode: { type: 'string', enum: ['manual', 'auto'] } }), 'vibe_math_set_params')" },
)
FAMILIES.push(
  { name: 'task-9/v2: the not-detected log drops the actionable sentence', expect: /\[task-9\/v2\]/,
    from: '已探测 PATH 与文档化的常见 TeX 根；可用 paperLatexCommand 指定绝对路径。', to: '' },
)
for (const f of FAMILIES) { const t0 = Date.now(); lastHang = false; const ok = runFamily(f); const ms = Date.now() - t0; TIMES.push([f.name, ms]); if (lastHang) hangs.push(f.name + "(" + Math.round(ms / 1000) + "s)"); if (ok) red++ }
console.log('')
console.log('mutant families reddening the v2 probe by name: ' + red + '/' + FAMILIES.length)
console.log('skipped=[' + skipped.join(' | ') + ']')
console.log('timings: ' + TIMES.map((t) => String(t[0]).split(':')[0] + '=' + t[1] + 'ms').join('  '))
console.log('TOTAL WALL TIME (all families + setup): ' + (Date.now() - START_MS) + 'ms (' + Math.round((Date.now() - START_MS) / 1000) + 's)')
console.log('hangs=[' + hangs.join(' | ') + ']')
if (red !== FAMILIES.length || skipped.length || hangs.length) process.exit(1)
console.log('ALL MUTANTS RED AS REQUIRED')

// Registered mutant harness for tests/v3-fix-probes.test.mjs — the probe carries its own proof.
// Defect class covered: silent-failure surfacing (F6a/F6b/F6c), cap sharing (F2cap), declared asymmetry (F-A),
// fence-root drift (F5), shell-fallback silence (F4c). Every family is a SINGLE content-anchored mutation
// of the v3 preset (no line numbers) and the suite runs through its V3_PLUGIN seam.
// Exit criterion (audit-path-discipline.mutants.mjs paradigm): every family must redden BY NAME;
// ALL MUTANTS RED AS REQUIRED + exit 0 only when all do.
// Run: node tests/v3-fix-probes.mutants.mjs
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, rmSync, readdirSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..')
const PRESET = 'vibe-math-v3'
const SUITE = 'tests/v3-fix-probes.test.mjs'
const ENV = 'V3_PLUGIN'
function copyGraph(file, dest) {
  const src = join(REPO, PRESET, file)
  copyFileSync(src, join(dest, file))
  for (const m of readFileSync(src, 'utf8').matchAll(/from\s+'(\.\/[A-Za-z0-9_.-]+\.js)'/g)) {
    const dep = m[1].slice(2)
    if (!readdirSync(dest).includes(dep)) copyGraph(dep, dest)
  }
}
function runFamily(f) {
  const dest = join(tmpdir(), 'v3probes-mut-' + Math.random().toString(36).slice(2, 10))
  mkdirSync(dest, { recursive: true })
  copyGraph(PRESET + '.js', dest)
  const target = join(dest, f.editFile || (PRESET + '.js'))
  const before = readFileSync(target, 'utf8')
  const n = before.split(f.from).length - 1
  if (f.lastOnly ? n < 1 : n !== 1) { console.error('  NO-OP - ' + f.name + ' (anchor x' + n + (f.lastOnly ? ', lastOnly' : '') + ')'); rmSync(dest, { recursive: true, force: true }); return false }
  const mutated = f.lastOnly
    ? (() => { const i = before.lastIndexOf(f.from); return before.slice(0, i) + f.to + before.slice(i + f.from.length) })()
    : before.split(f.from).join(f.to)
  writeFileSync(target, mutated, 'utf8')
  try { execFileSync(process.execPath, ['--check', target], { stdio: 'pipe' }) }
  catch (e) { writeFileSync(target, before, 'utf8'); console.error('  FAIL - ' + f.name + ' (mutation did not compile; restored)'); rmSync(dest, { recursive: true, force: true }); return false }
  let out = ''
  let code = 0
  try { out = execFileSync(process.execPath, [SUITE], { cwd: REPO, encoding: 'utf8', env: Object.assign({}, process.env, { [ENV]: join(dest, PRESET + '.js') }) }) }
  catch (e) { code = (e && e.status) || 1; out = String((e && e.stdout) || '') + String((e && e.stderr) || '') }
  const named = out.split(/\r?\n/).filter((l) => /^\s*(FAIL - | {2}- )/.test(l) && f.expect.test(l)).map((l) => l.trim())
  const ok = code !== 0 && named.length > 0
  console.log((ok ? '  ok - ' : '  FAIL - ') + f.name + (named.length ? ' :: ' + named[0].slice(0, 140) : ' :: no named red (exit=' + code + ')'))
  rmSync(dest, { recursive: true, force: true })
  return ok
}
const FAMILIES = [
  { name: 'F2cap: status site reverted to a literal 10', expect: /\[F2cap\] status 与 report 两处都走同一常量/,
    from: "recentActivity: activityLog.slice(-Math.min(ACTIVITY_REPORT_MAX, Number(params.activityLogCap) || 100)), params: params,",
    to: "recentActivity: activityLog.slice(-Math.min(10, Number(params.activityLogCap) || 100)), params: params," },
  { name: 'F2cap: param description hard-codes the number', expect: /\[F2cap\] 参数描述\*\*引用\*\*该常量/,
    from: "' + ACTIVITY_REPORT_MAX + ' 条）', suggestion: 100 },", to: "' + 30 + ' 条）', suggestion: 100 }," },
  { name: 'F-A: status gains pendingDecisionItems', expect: /\[F-A\] status \*\*不得\*\*携带明细/,
    from: "pendingDecisions: decisionQueue.filter(function (d) { return d.status === 'pending' }).length,",
    to: "pendingDecisions: decisionQueue.filter(function (d) { return d.status === 'pending' }).length,\n  pendingDecisionItems: decisionQueue.filter(function (d) { return d.status === 'pending' }).map(function (d) { return { id: d.id, node: d.node, context: d.context } }),",
    lastOnly: true },
  { name: 'F5: fence-root comparison removed', expect: /\[F5\/v3\] 围栏根漂移/,
    from: 'if (actual && expected && actual !== expected) warnFenceDriftOnce(actual, expected)', to: 'void actual' },
  { name: 'F4c: ensureDirs failure warning removed', expect: /\[F4c\] ensureDirs 失败不是沉默/,
    from: "if (!r || !r.ok) warnShellOnce('ensureDirs (mkdir ' + base + ')', r)", to: 'void r' },
  { name: 'F6a: provider list-failure warning removed', expect: /\[F6a\/v3\]/,
    from: "warnProviderFallback('subagents.list() failed: ' + ((e && e.message) || e))", to: 'void e' },
  { name: 'F6b: interrupt emit statement deleted (anchored by content)', expect: /\[F6b\/v3\]/,
    from: "if (r && r.ok === false) logActivity('interrupt', '中断失败（' + why + '）：' + String(cid) + ' — ' + String(r.message || r.code || ''))", to: 'void r' },
  { name: 'F6c: project-pointer write failure re-silenced', expect: /\[F6c\/v3\]/,
    from: "noteStateWriteFailure('current.' + safeId(sessionId) + '.json', (e && e.message) || e)", to: 'void e' },
]
let red = 0
FAMILIES.push(
  { name: 'F-B: derivation drops the source descriptions', expect: /\[F-B\/v3\] 每个机读描述都来自真源且非空/,
    from: 'if (e.description) p.description = e.description', to: 'void e /* MUTANT F-B: no source description */' },
  { name: 'F-B: one exception entry deleted', expect: /\[F-B\/v3\] 例外集合 == docs\/parameter-schema\.md/,
    from: "mode: { type: 'string', enum: ['manual', 'auto'] },", to: '' },
  { name: 'F-B: one registration site reverted to a literal', expect: /\[F-B\/v3\] 两处注册点都由 paramProps\(\)/,
    from: "objParams(paramProps()), 'vibe_math_set_params')", to: "objParams({ mode: { type: 'string', enum: ['manual', 'auto'] } }), 'vibe_math_set_params')" },
)
for (const f of FAMILIES) if (runFamily(f)) red++
console.log('')
console.log('mutant families reddening the v3 probe by name: ' + red + '/' + FAMILIES.length)
if (red !== FAMILIES.length) process.exit(1)
console.log('ALL MUTANTS RED AS REQUIRED')

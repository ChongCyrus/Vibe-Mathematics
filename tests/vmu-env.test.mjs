// vmu env face — PHASE 9 / goal 3. Run: node tests/vmu-env.test.mjs
//
// The face is an ADAPTER, not an installer: the probe uses the injected spawn seam, a failed probe is a normal
// `ok:false` result, report writes a records finding (the main-agent channel), and the source probe proves no
// child_process/network/package-manager call exists in the face.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..')
const mod = await import(pathToFileURL(join(REPO, 'vibe-math-vmu', 'kernel', 'env.js')).href)

let passed = 0, failed = 0
const ok = (cond, name, detail) => {
  if (cond) { passed++; console.log('  ok   ' + name) }
  else { failed++; console.log('  FAIL ' + name + (detail === undefined ? '' : ' :: ' + JSON.stringify(detail))) }
}

const settings = {
  'vmu.env.needs': {
    python: { probe: { command: 'python', args: ['-c', 'print(1)'] }, installCommand: 'install-python', requiresUser: true, why: 'math' },
    lean: { probe: { command: 'lean', args: ['--version'] }, installCommand: 'install-lean', requiresUser: true, why: 'formal' },
    sage: { auto: false, probe: { command: 'sage', args: ['--version'] }, installCommand: 'install-sage', requiresUser: true, why: 'cas' },
  },
}
const calls = []
const spawnOk = async (req) => { calls.push(req); return { exitCode: 0, stdout: '3.11.9\n', resolved: 'C:\\Python\\python.exe' } }
const face = mod.createEnvFace({ settings, spawn: spawnOk })

// ── 1. positive: found + version + resolved ────────────────────────────────────────────────────────────────────
{
  const r = await face.probe({ need: 'python' })
  ok(r.ok === true && r.found === true && r.version === '3.11.9' && r.resolved === 'C:\\Python\\python.exe',
    '★ 正：exit 0 ⇒ ok/found/version/resolved', r)
  ok(calls.length === 1 && calls[0].command === 'python' && Array.isArray(calls[0].args),
    'the probe command/args come from the need table and go through the injected spawn seam', calls[0])
}
// ── 2. a FAILED probe is a result, not an exception; the install data is present ────────────────────────────────
{
  const bad = mod.createEnvFace({ settings, spawn: async () => ({ exitCode: 1, stderr: 'not found' }) })
  const r = await bad.probe({ need: 'lean' })
  ok(r.ok === false && r.found === false && r.installCommand === 'install-lean' && r.requiresUser === true && !('error' in r),
    '★ 正：exit 1 ⇒ ok:false，且 installCommand/requiresUser 都在回执里（不抛异常）', r)
}
// ── 3. unknown need is the ONLY face misuse that refuses ───────────────────────────────────────────────────────
{
  let threw = null
  try { await face.probe({ need: 'ghost' }) } catch (e) { threw = e }
  ok(threw && threw.code === 'VMU_ENV_UNKNOWN_NEED' && /python/.test(String(threw.hint)) && /lean/.test(String(threw.hint)),
    '★ 反：未知 need ⇒ VMU_ENV_UNKNOWN_NEED，hint 列出已知 need', threw && { code: threw.code, hint: threw.hint })
}
// ── 4. list includes the table and the last probe was recorded ─────────────────────────────────────────────────
{
  const rows = face.list()
  ok(rows.ok === true && rows.count >= 3 && rows.needs.some((x) => x.need === 'python' && x.last && x.last.version === '3.11.9') &&
    rows.needs.some((x) => x.need === 'sage' && x.auto === false),
    '★ 正：list 返回表项（默认表 + 覆盖）+ 最近探测结果；auto:false 的 CAS 被声明但默认不探', { count: rows.count, python: rows.needs.find((x) => x.need === 'python'), sage: rows.needs.find((x) => x.need === 'sage') })
}
// ── 5. report writes a REAL records finding (not just a return value) ──────────────────────────────────────────
{
  let captured = null
  const records = { put: (rec) => { captured = rec; return { id: 'rec-env-1', title: rec.title } } }
  const reported = mod.createEnvFace({ settings, spawn: spawnOk, records })
  const r = reported.report({ need: 'lean', why: 'formal verification', detail: 'probe exit 1' })
  ok(captured && captured.track === 'state' && captured.kind === 'finding' && captured.tags.includes('environment-missing') && captured.title.includes('lean'),
    '★ 反：report 之后 records.put 真的收到一条 finding（track=state/kind=finding/标签）', captured)
  ok(r.ok === true && r.record === 'rec-env-1' && r.need === 'lean', 'report 回执带 record id，供主代理读取', r)
  ok(String(captured.body).includes('lean') && String(captured.body).includes('installCommand'),
    'the body carries the missing need and points at installCommand as DATA', captured.body)
}
// ── 6. SOURCE PROBE: this face never installs, never touches child_process/network ─────────────────────────────
{
  const strip = (src) => src
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\/\/[^\n]*/g, ' ')
    .replace(/'(?:[^'\\]|\\.)*'/g, "''")
    .replace(/"(?:[^"\\]|\\.)*"/g, '""')
    .replace(/`(?:[^`\\]|\\.)*`/g, '``')
  const sources = [
    join(REPO, 'vibe-math-vmu', 'kernel', 'env.js'),
    join(REPO, 'vibe-math-vmu', 'tools', 'env.js'),
  ]
  const forbidden = /child_process|execSync|spawnSync|exec\(|https?\.|fetch\(|XMLHttpRequest|axios|npm\s+install|pip\s+install|winget|choco|apt-get|curl|wget/
  ok(sources.length === 2, 'the source probe covers BOTH env face files (no empty loop)', sources.length)
  const noInstallCall = (file) => {
    const code = strip(readFileSync(file, 'utf8'))
    const hit = code.match(forbidden)
    ok(hit === null, '★ 源码探针：' + file.split(/[\\/]/).pop() + ' 没有 install/网络调用', hit && hit[0])
  }
  noInstallCall(sources[0])
  noInstallCall(sources[1])
}

console.log('=== VMU ENV: ' + passed + ' passed, ' + failed + ' failed ===')
if (failed) process.exit(1)

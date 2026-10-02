// Probe for audit finding C1 (path escape in Verification_logs/).
//
// Drives the REAL plugin (real settleVerdict → writeJson path) with a mocked fs whose
// resolve() behaves like the host contract does (normalises, does NOT refuse '..' — exactly the
// behaviour _oneoff/pathdemo2.cjs demonstrated). A problem whose id embeds '../..' must still
// write its verification log INSIDE Verification_logs/, and a normal id must round-trip to the
// same place with the expected file name.
//
// Run: node tests/v2-path-escape.test.mjs
import { mkdtempSync, rmSync, existsSync, readdirSync, readFileSync, writeFileSync, mkdirSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname, resolve as pathResolve } from 'node:path'

let passed = 0, failed = 0
const assert = (c, m) => { if (c) { passed++; console.log('  ok - ' + m) } else { failed++; console.error('  FAIL - ' + m) } }
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
// V2_PLUGIN lets the negative control run this probe against a mutated copy (e.g. the pre-fix
// unsanitised path) and REQUIRE it to fail — a probe that cannot fail proves nothing.
const PLUGIN = process.env.V2_PLUGIN
  ? new URL('file:///' + String(process.env.V2_PLUGIN).replace(/\\/g, '/'))
  : new URL('../vibe-math-v2/vibe-math-v2.js', import.meta.url)

async function runCase(problemId) {
  const WS = mkdtempSync(join(tmpdir(), 'v2-c1-'))
  const listeners = {}
  const toolRegs = []
  const spawns = []
  const ctx = {
    get(name) {
      if (name === 'subprocess') {
        return { spawn({ argv }) {
          const script = argv[argv.length - 1] || ''
          if (/New-Item/.test(script)) {
            const m = script.match(/-Path\s+'((?:[^']|'')*)'/)
            if (m) m[1].split(',').forEach((p) => { if (p) mkdirSync(p.replace(/''/g, "'"), { recursive: true }) })
          }
          return { done: Promise.resolve({ exitCode: 0 }) }
        } }
      }
      return undefined
    },
    on(e, fn) { (listeners[e] = listeners[e] || []).push(fn) },
    effect(fn) { const d = fn(); return () => { if (typeof d === 'function') d() } },
    logger: { info() {}, warn() {}, error() {} },
    tools: { register(s) { toolRegs.push(s) } },
    commands: { register() {} },
    subagents: {
      list() { return ['spawn'] },
      async startContinuable({ label }) { const childId = 'c' + (spawns.length + 1); spawns.push({ label, childId }); return { childId } },
      async sendMessage() {},
      interrupt() {},
    },
    agents: { roots() { return [] }, get() { return undefined } },
    fs: {
      // host contract: resolve normalises, it does NOT refuse '..' (dsh-fs types/index.d.ts:94-97)
      async resolve(rel, o) { return pathResolve((o && o.cwd) || WS, ...String(rel).split('/')) },
      async stat(t) { return existsSync(t) ? { type: 'file' } : undefined },
      async readText(t) { return readFileSync(t, 'utf8') },
      async writeText(t, c) { mkdirSync(dirname(t), { recursive: true }); writeFileSync(t, c, 'utf8') },
      async listDir(t) { if (!existsSync(t)) return []; return readdirSync(t, { withFileTypes: true }).map((e) => ({ name: e.name, type: e.isDirectory() ? 'directory' : 'file' })) },
    },
  }
  const ROOT = { id: 'S', options: {}, session: { id: 'S', header: { cwd: WS } } }
  const mod = await import(PLUGIN.href + '?t=' + Date.now())
  ;(mod.default || mod).apply(ctx)
  const call = async (n, a) => JSON.parse(await (toolRegs.find((s) => s.name === n)).execute(a || {}, { agent: ROOT }))
  const fireEnd = (info) => { for (const h of (listeners['subagent/end'] || [])) h(info) }

  await call('vibe_math_new_project', { name: 'p' })
  const proj = join(WS, 'VibeMath', 'Projects', 'p')
  // one problem with one candidate solution (probability in (0,1) => verifiable)
  writeFileSync(join(proj, 'qs', 'qs.json'), JSON.stringify([{
    id: problemId, 概述: 'candidate problem', 已解决: false, 优先级: 0,
    解法列表: [{ 完整解法: 'solution text', 正确概率: 0.5, 验证记录: [] }],
    progress: { directions: [] },
  }], null, 2), 'utf8')
  await call('vibe_math_start', {})
  // wait for the verifiers of this solution, answer them with 1 => settleVerdict runs
  let vs = []
  for (let i = 0; i < 80 && vs.length < 2; i++) { await wait(150); vs = spawns.filter((s) => s.label.startsWith('verifier:r-' + problemId.slice(0, 6))) }
  if (process.env.V2_C1_DEBUG) console.log('    [debug] spawns=' + JSON.stringify(spawns.map((s) => s.label)) + ' vs=' + vs.length)
  for (let i = 0; i < vs.length; i++) {
    fireEnd({ id: vs[i].childId, runId: 'v' + i, stopReason: 'completed', lastAssistantMessage: [{ type: 'text', text: '```json\n{"Result":1,"Reason":"ok"}\n```' }] })
  }
  await wait(800)
  if (process.env.V2_C1_DEBUG) {
    const st = await call('vibe_math_status', {})
    console.log('    [debug] activity=' + JSON.stringify((st.recentActivity || []).map((a) => a.event + ':' + a.detail).slice(-6)))
    console.log('    [debug] logsdir=' + JSON.stringify(existsSync(join(proj, 'Verification_logs')) ? readdirSync(join(proj, 'Verification_logs')) : null))
  }
  // collect every *.json written anywhere under WS whose name mentions the id tail
  const found = []
  const walk = (d) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name)
      if (e.isDirectory()) walk(p)
      else if (/-s0_\d+_[0-9a-f]{8}\.json$/.test(e.name)) found.push(p)
    }
  }
  walk(WS)
  if (process.env.V2_C1_DEBUG) console.log('    [debug] tree=' + JSON.stringify(found.map((f) => f.replace(WS, '<WS>'))))
  return { WS, proj, found, verdictLogs: found.filter((f) => f.indexOf(join(proj, 'Verification_logs')) === 0), spawns }
}

console.log('-- C1: verification-log paths are sanitised --')
{
  const r = await runCase('q1')
  const name = r.verdictLogs.length ? r.verdictLogs[0].split(/[\\/]/).pop() : '(none)'
  assert(r.verdictLogs.length === 1, 'normal id: exactly one verification log written (' + r.verdictLogs.length + ')')
  assert(/^r-q1-s0_\d+_[0-9a-f]{8}\.json$/.test(name), 'normal id round-trips to the expected file name <rId>_<ms>_<shortId>.json (got ' + name + ')')
  const logPath = r.verdictLogs[0]
  assert(typeof logPath === 'string' && logPath.length > 0, 'normal id: a verdict-log path was discovered for reading (got ' + JSON.stringify(logPath) + ')')
  assert(logPath ? JSON.parse(readFileSync(logPath, 'utf8')).verdict === 1 : false, 'the log is the real settleVerdict transcript (verdict=1)')
  rmSync(r.WS, { recursive: true, force: true })
}
{
  const evil = 'x/../../../../pwn'
  const r = await runCase(evil)
  const inside = r.verdictLogs
  const name = inside.length ? inside[0].split(/[\\/]/).pop() : '(none)'
  assert(inside.length === 1, 'hostile id: the verification log exists inside Verification_logs/ (' + inside.length + ')')
  assert(/^r-x_{2,}pwn-s0_\d+_[0-9a-f]{8}\.json$/.test(name), 'hostile id is mapped to a single safe path segment (got ' + name + ')')
  const escaped = r.found.filter((f) => inside.indexOf(f) === -1)
  assert(escaped.length === 0, 'nothing was written outside Verification_logs/ (escaped=' + JSON.stringify(escaped.map((f) => f.replace(r.WS, '<WS>'))) + ')')
  // The pre-fix escape resolved to <WS>/VibeMath/pwn-s0_<ts>.json (four '..' out of
  // Projects/<p>/Verification_logs); assert that directory holds no such file at all.
  const vibeDir = join(r.WS, 'VibeMath')
  const strays = (existsSync(vibeDir) ? readdirSync(vibeDir) : []).filter((n) => /pwn-s0_.*\.json$/.test(n))
  assert(strays.length === 0, 'no escaped log is left directly under <WS>/VibeMath/ (' + JSON.stringify(strays) + ')')
  rmSync(r.WS, { recursive: true, force: true })
}
console.log('\nC1 PROBE: ' + passed + ' passed, ' + failed + ' failed')
process.exit(failed === 0 ? 0 : 1)

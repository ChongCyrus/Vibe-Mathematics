// tests/math-computation-v2.test.mjs — v2 接线面验收（math_computation P1）
//
// 覆盖 guards.md §1 里属于"预设接线"的部分（1–13、18–20、22 的接线侧 + 16 的提示词面）：
//   参数六键归一化（含 `'false'` 这类错类型必须回退默认，绝不从 `else out[k]=v` 尾巴漏过）、
//   双层注册（会话层 handler + apply 层工具面，且**每预设只注册一次**）、
//   假引擎 seam 上的 probe/缺包/无许可/超时 kill/非零退出/超大输出截断/路径守卫/cwd、
//   cli 默认开启 + 两种禁用、argv 回显、bad-argv 不折叠、安装计划→确认两步、
//   提示词可用性行（typed+shell 有 shell 兜底句、typed 没有、off 零提及）、persona 两块、Computation/ 目录。
//
// 假引擎**只走注入的 subprocess seam**：不碰真实引擎，任何机器（没有装任何引擎）都能跑。
// 变异说明（写 3–5 个即可；每条都对应能被本文件打红的断言）：
//   M1 把 `sanitizeParams` 的 `MATH_PARAM_NAMES` 分支删掉（六键从 `else out[k]=v` 漏过）⇒ §1 的 'false' 断言红。
//   M2 删掉 apply 层的 `registerMathComputation`（或会话层那一次）⇒ §2 双层注册/工具面断言红。
//   M3 `mathSpawn` 去掉计时器与 `handle.terminate()` ⇒ §6 的 MATH_TIMEOUT/terminated 断言红。
//   M4 `mathSpawn` 把 stdio 上限压到 64KB（或对 stdout 先截断再返回）⇒ §8 的"完整落盘 >64KB"断言红。
//   M5 `mathWorkLine` 不看 `params.mathMode`（直接从 MATH_RULE_LINES 拼）⇒ §15 的 typed 档"不得出现 shell 兜底句"断言红。
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync, rmSync, readdirSync, statSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import {
  MATH_PARAM_NAMES,
  MATH_PARAM_DEFAULTS,
  MATH_TOOL_DESCRIPTION,
  MATH_PERSONA_TOOL_LINE,
} from '../vibe-math-v2/math-computation.js'
// 引擎表在姊妹模块里（模块自己 import 它；测试为了拼 argv 模板也直接读一次，只读不写）。
import { MATH_ENGINES } from '../vibe-math-v2/math-engines.js'

const HERE = dirname(fileURLToPath(import.meta.url))
const PLUGIN = process.env.MC_V2_PLUGIN
  ? new URL('file:///' + String(process.env.MC_V2_PLUGIN).replace(/\\/g, '/'))
  : new URL('../vibe-math-v2/vibe-math-v2.js', import.meta.url)

let passed = 0
let failed = 0
const failures = []
function assert(cond, msg) {
  if (cond) { passed++; console.log('  ok - ' + msg) } else { failed++; failures.push(msg); console.error('  FAIL - ' + msg) }
}
const section = (t) => console.log('\n[' + t + ']')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const WS = mkdtempSync(join(tmpdir(), 'mc-v2-'))
const PROJECT = 'mcp'
const projRoot = () => join(WS, 'VibeMath', 'Projects', PROJECT)

// ── 假引擎 seam ────────────────────────────────────────────────────────────────────────────────
const CANDIDATES = { python3: 'python', python: 'python', Rscript: 'r', octave: 'octave', 'octave-cli': 'octave', julia: 'julia', matlab: 'matlab', maple: 'maple', wolframscript: 'wolfram' }
let fake = null
function freshFake() {
  return {
    installed: {},            // { python: '3.11.4', maple: '2024' }
    licensed: {},             // { maple: true }（商业引擎）
    packages: {},             // { numpy: 'ok', sympy: null }
    run: 'ok',                // ok | hang | fail3 | argerr | big
    cliCommands: {},          // { echo: '/fake/cli/echo' }
    spawns: [], terminated: 0,
  }
}
function engineOfExe(exe) { return CANDIDATES[String(exe).split(/[\\/]/).pop()] || null }
function looksLikeRun(argv) { return argv.join(' ').indexOf('/script.') !== -1 }
const VERSION_RE = { python: /(\d+\.\d+\.\d+)/, r: /(\d+\.\d+\.\d+)/, octave: /(\d+\.\d+\.\d+)/, julia: /(\d+\.\d+\.\d+)/, matlab: /(\d+\.\d+)/, maple: /(\d+\.\d+)/, wolfram: /(\d+\.\d+(\.\d+)?)/ }
function spawnResult(exit, stdout, stderr) {
  return {
    done: Promise.resolve({ exitCode: exit, signal: null }),
    collected: {
      stdout: { readFrom: () => ({ text: stdout || '', nextOffset: (stdout || '').length, lossy: false }) },
      stderr: { readFrom: () => ({ text: stderr || '', nextOffset: (stderr || '').length, lossy: false }) },
    },
    terminate() {},
  }
}
const subprocess = {
  async resolveExecutable(cmd) {
    const name = String(cmd)
    if (fake.cliCommands[name]) return fake.cliCommands[name]
    const key = CANDIDATES[name]
    if (!key || !(key in fake.installed)) throw new Error('spawn ' + name + ' ENOENT')
    return '/fake/' + name
  },
  spawn(spec) {
    const argv = (spec.argv || []).map(String)
    fake.spawns.push({ argv, cwd: spec.cwd, stdio: spec.stdio, graceMs: spec.graceMs })
    const exe = argv[0] || ''
    // 目录/删除类 shell（ensureDirs 的 New-Item / POSIX mkdir -p）：插件用同一 seam 建骨架目录，
    // mock 必须照做，否则 §16 会误判成"框架没建目录"。
    const script = argv[argv.length - 1] || ''
    if (/New-Item/.test(script)) {
      const head = script.match(/-Path\s+([^|]*)/)
      const raw = (head && head[1]) || ''
      for (const p of raw.split(',').map((x) => x.trim().replace(/^'|'$/g, '').replace(/^"|"$/g, '').replace(/''/g, "'"))) if (p) mkdirSync(p, { recursive: true })
      return spawnResult(0, '', '')
    }
    if (/^mkdir -p /.test(script)) { for (const p of script.replace(/^mkdir -p /, '').split(/\s+/)) { const q = p.replace(/^'|'$/g, ''); if (q) mkdirSync(q, { recursive: true }) } return spawnResult(0, '', '') }
    if (/Remove-Item/.test(script)) { const m = script.match(/-LiteralPath\s+'((?:[^']|'')*)'/); if (m) rmSync(m[1].replace(/''/g, "'"), { force: true, recursive: true }); return spawnResult(0, '', '') }
    const name = engineOfExe(exe) || (argv.length === 1 ? null : null)
    // cli：用户给的命令，走"运行"分支
    if (!name && /[\\/]cli[\\/]/.test(exe)) return runBehaviour(argv)
    const d = MATH_ENGINES[name] || null
    // 运行分支必须**先判**：run 的 argv 与版本探针**长度相同**（[exe, script] vs [exe, --version]），
    // 只有"末元素是落盘的 script.<ext>"能把两者分开（否则 run 会被当成版本探针，永远 exit 0）。
    if (looksLikeRun(argv)) return runBehaviour(argv)
    if (d && d.versionArgv && argv.length === 1 + d.versionArgv.length) {
      const inst = fake.installed[name]
      if (!inst) return spawnResult(1, '', 'not runnable')
      return spawnResult(0, name + ' ' + inst + '\n', '')
    }
    if (d && d.licenseProbe && argv.length === 1 + d.licenseProbe.argv.length) {
      const ok = !!fake.licensed[name]
      if (d.licenseProbe.okWhen === 'trim-1') return spawnResult(0, ok ? '1\n' : '0\n', '')
      if (d.licenseProbe.okWhen === 'exit-0') return spawnResult(ok ? 0 : 1, '', ok ? '' : 'license error')
      return spawnResult(0, ok ? 'Licensed\n' : 'Unlicensed\n', '')
    }
    if (looksLikeRun(argv)) return runBehaviour(argv)
    // 包探针（parse: 'pairs'）：<name>:ok|...
    const keys = Object.keys(fake.packages)
    return spawnResult(0, keys.map((k) => k + ':' + (fake.packages[k] ? 'ok' : 'missing')).join('|') + '\n', '')
  },
}
function runBehaviour(argv) {
  if (fake.run === 'hang') {
    let settled = false
    let finish
    const done = new Promise((resolve) => { finish = resolve })
    return {
      done,
      collected: { stdout: { readFrom: () => ({ text: '', nextOffset: 0, lossy: false }) }, stderr: { readFrom: () => ({ text: '', nextOffset: 0, lossy: false }) } },
      terminate() { if (settled) return; settled = true; fake.terminated++; finish({ exitCode: null, signal: 'SIGKILL' }) },
    }
  }
  if (fake.run === 'fail3') return spawnResult(3, '', 'boom: computation failed\n')
  if (fake.run === 'argerr') return spawnResult(2, '', "unknown option '-q'\n")
  if (fake.run === 'big') return spawnResult(0, 'x'.repeat(200 * 1024), '')
  return spawnResult(0, 'ok\n', '')
}

// ── host mock（v2 的 standing-mount 形状：一个插件实例，多会话） ────────────────────────────────
function makeHost() {
  const listeners = {}
  const toolRegs = []
  const cmdRegs = []
  const spawns = []
  const ctx = {
    get(name) {
      if (name === 'subprocess') return subprocess
      if (name === 'sandboxPolicy') return { resolve: () => ({ workspaceRoot: WS }), workspaceRoot: WS }
      return undefined
    },
    on(e, fn) { (listeners[e] = listeners[e] || []).push(fn) },
    effect(fn) { const d = fn(); return () => { if (typeof d === 'function') d() } },
    logger: { info() {}, warn() {}, error() {} },
    tools: { register(spec) { toolRegs.push(spec); return () => {} } },
    commands: { register(spec) { cmdRegs.push(spec); return () => {} } },
    timeout(cb, ms) { const h = setTimeout(cb, ms); return () => clearTimeout(h) },
    interval(cb, ms) { const h = setInterval(cb, Math.min(Number(ms) || 0, 25)); return () => clearInterval(h) },
    subagents: {
      list() { return ['spawn'] },
      async startContinuable({ label, request, signal }) {
        const childId = 'c' + (spawns.length + 1)
        spawns.push({ label, request, childId })
        return { childId }
      },
      async sendMessage() { return 'w' },
      async followup() { return 'w' },
      interrupt() {},
    },
    fs: {
      async resolve(rel, opts) { const base = (opts && opts.cwd) || WS; const p = String(rel).replace(/\\/g, '/'); return /^([A-Za-z]:|\/)/.test(p) ? p : join(base, ...p.split('/')) },
      async stat(t) { return existsSync(t) ? { type: 'file' } : undefined },
      async readText(t) { return readFileSync(t, 'utf8') },
      async writeText(t, content) { mkdirSync(dirname(t), { recursive: true }); writeFileSync(t, String(content), 'utf8') },
      async listDir(t) { try { return readdirSync(t, { withFileTypes: true }).map((e) => ({ name: e.name, type: e.isDirectory() ? 'directory' : 'file' })) } catch (e) { return [] } },
    },
    agents: { roots() { return [] } },
  }
  return { ctx, toolRegs, cmdRegs, spawns, listeners }
}
function makeRoot(id) { return { id, options: { provider: 'mock', model: 'mock' }, session: { id, header: { cwd: WS, parentSession: undefined } }, followup() {} } }

const H = makeHost()
const mod = await import(PLUGIN.href + '?t=' + Date.now())
;(mod.default || mod).apply(H.ctx)
const ROOT = makeRoot('sess-mc-v2')
async function call(name, args, root) {
  const spec = H.toolRegs.find((s) => s.name === name)
  if (!spec) throw new Error('no tool ' + name)
  return JSON.parse(await spec.execute(args || {}, { agent: root || ROOT }))
}
const specOf = (name) => H.toolRegs.find((s) => s.name === name)
const readIf = (p) => (existsSync(p) ? readFileSync(p, 'utf8') : '')
const receiptOf = (runId) => JSON.parse(readIf(join(projRoot(), 'Computation', runId, 'receipt.json')) || '{}')

fake = freshFake()
await call('vibe_math_new_project', { name: PROJECT })
await call('vibe_math_set_params', { tickIntervalMs: 200, verifierCount: 2 })

// ── §1 六参数：默认值 / 显式归一化 / schema 面 ─────────────────────────────────────────────────
section('§1 六参数（默认值、归一化、schema 面、off/typed+shell 语义）')
{
  const setup = await call('vibe_math_setup', {})
  const names = setup.parameters.map((p) => p.name)
  assert(MATH_PARAM_NAMES.every((k) => names.indexOf(k) !== -1), '★ vibe_math_setup 列出全部六个 math 参数')
  const st = await call('vibe_math_status', {})
  assert(MATH_PARAM_NAMES.every((k) => JSON.stringify(st.params[k]) === JSON.stringify(MATH_PARAM_DEFAULTS[k])), '★ 默认值与共享模块的 MATH_PARAM_DEFAULTS 逐字一致（' + JSON.stringify(MATH_PARAM_NAMES.map((k) => st.params[k])) + '）')
  assert(st.params.mathEngines !== MATH_PARAM_DEFAULTS.mathEngines, '★ 默认数组是**拷贝**，不与模块共享同一对象（否则跨预设互相污染）')
  const spec = specOf('math_computation')
  assert(!!spec && spec.description === MATH_TOOL_DESCRIPTION, '★ 工具面注册了 math_computation，描述逐字等于 MATH_TOOL_DESCRIPTION')
  const props = (spec.parameters && spec.parameters.properties) || {}
  assert(['op', 'engine', 'mode', 'code', 'file', 'expr', 'packages', 'timeoutMs', 'cli', 'scope', 'dryRun', 'confirm'].every((k) => k in props), '工具参数 schema 是模块的闭合 schema（op/engine/mode/…/confirm）')
  // 'false' 字符串等错类型：必须回退默认，绝不从 `else out[k]=v` 尾巴漏过
  const bad = await call('vibe_math_set_params', { mathComputation: 'false', mathMode: 'false', mathEngines: 'false', mathTimeoutMs: 'false', mathPackages: 'false', mathInstallScope: 'false' })
  assert(bad.ok === true, 'set_params 接受（错误类型的）六个 math 键而不抛错')
  const after = (await call('vibe_math_status', {})).params
  assert(after.mathComputation === 'auto' && after.mathMode === 'typed+shell' && after.mathInstallScope === 'user', '★★ 五个 enum/bool 型键的 \'false\' 字符串回退默认（' + JSON.stringify({ c: after.mathComputation, m: after.mathMode, s: after.mathInstallScope }) + '）')
  assert(Array.isArray(after.mathEngines) && after.mathEngines.length === MATH_PARAM_DEFAULTS.mathEngines.length && after.mathPackages.length === 0, '★★ 两个数组键的 \'false\' 字符串回退默认（不把字符串当数组）')
  assert(after.mathTimeoutMs === MATH_PARAM_DEFAULTS.mathTimeoutMs, '★★ mathTimeoutMs 的 \'false\' 回退默认（Number(\'false\')=NaN ⇒ 不留 NaN）')
  const mixed = await call('vibe_math_set_params', { mathTimeoutMs: 0, mathEngines: ['nope', 'python', 'python'], mathComputation: 'bogus' })
  assert(mixed.params.mathTimeoutMs === MATH_PARAM_DEFAULTS.mathTimeoutMs, 'mathTimeoutMs=0 回退默认（下界 1000 由模块决定）')
  assert(JSON.stringify(mixed.params.mathEngines) === JSON.stringify(['python']), 'mathEngines 只保留已知引擎并去重（' + JSON.stringify(mixed.params.mathEngines) + '）')
  assert(mixed.params.mathComputation === 'auto', '未知 mathComputation 回退 auto（不会静默变成 on/off）')
  await call('vibe_math_set_params', { mathEngines: MATH_PARAM_DEFAULTS.mathEngines.slice() })
}

// ── §2 注册：双层 + 每预设一次 ────────────────────────────────────────────────────────────────
section('§2 注册（会话层 + apply 层；每预设只注册一次）')
{
  assert(H.toolRegs.filter((s) => s.name === 'math_computation').length === 1, '★ math_computation 在工具面只注册一次（不是每会话一次）')
  fake.installed = { python: '3.11.4' }
  const r = await call('math_computation', { op: 'probe', packages: ['refresh'] })
  assert(r.ok === true && r.op === 'probe' && (r.engines || []).length === 1, '★★ 经 apply 层工具面调用能路由到**会话层** handler（两层都在）（got ' + JSON.stringify({ ok: r.ok, op: r.op, engines: (r.engines || []).map((e) => e.name) }) + '）')
  assert(H.cmdRegs.length === 1 && String(H.cmdRegs[0].input.hint).indexOf('math') === -1, '★ 未新增 /vibe math 子命令：hint 不含 math（P1 不动命令面）')
}

// ── §3 probe：命中 / 未命中 ──────────────────────────────────────────────────────────────────
section('§3 op=probe：命中与未命中')
{
  fake = freshFake()
  fake.installed = { python: '3.11.4' }
  const hit = await call('math_computation', { op: 'probe', packages: ['refresh'] })
  const eng = (hit.engines || []).find((e) => e.name === 'python')
  assert(hit.ok === true && hit.available === true && !!eng && eng.version === '3.11.4' && !!eng.path, '★ probe 命中：available=true + path/version（' + JSON.stringify(hit) + '）')
  fake = freshFake()
  const miss = await call('math_computation', { op: 'probe', packages: ['refresh'] })
  assert(miss.ok === false && miss.code === 'MATH_ENGINE_NOT_FOUND', '★ 没有引擎 ⇒ MATH_ENGINE_NOT_FOUND')
  assert(!!miss.next && miss.next.kind === 'user-install' && String(miss.next.command || '').length > 0, '★★ 未命中必须带可执行的下一步：next.kind=user-install + 非空 per-OS 命令')
}

// ── §4 缺包：只报告、不执行 ──────────────────────────────────────────────────────────────────
section('§4 缺包（MATH_MISSING_PACKAGES + agent-install，且不执行脚本）')
{
  fake = freshFake()
  fake.installed = { python: '3.11.4' }
  fake.packages = { numpy: 'ok', sympy: null }
  const r = await call('math_computation', { op: 'run', mode: 'code', code: 'print(1)', packages: ['numpy', 'sympy'] })
  assert(r.ok === false && r.code === 'MATH_MISSING_PACKAGES' && JSON.stringify(r.missing) === JSON.stringify(['sympy']), '★ 缺包 ⇒ MATH_MISSING_PACKAGES{missing:[sympy]}（' + JSON.stringify(r.missing) + '）')
  assert(!!r.next && r.next.kind === 'agent-install' && r.next.dryRun === true, '★★ next.kind=agent-install + dryRun（先计划再确认）')
  assert(fake.spawns.filter((s) => looksLikeRun(s.argv)).length === 0, '★★ 缺包时**没有执行**脚本（假引擎运行调用计数 0）')
}

// ── §5 商业引擎无许可 ────────────────────────────────────────────────────────────────────────
section('§5 商业引擎无许可（只给厂商指引、不出安装计划）')
{
  fake = freshFake()
  fake.installed = { maple: '2024' }
  fake.licensed = { maple: false }
  const r = await call('math_computation', { op: 'run', engine: 'maple', mode: 'code', code: 'x' })
  assert(r.ok === false && r.code === 'MATH_ENGINE_LICENSE_REQUIRED', '★ 已装但无许可 ⇒ MATH_ENGINE_LICENSE_REQUIRED')
  assert(!!r.next && r.next.kind === 'vendor' && String(r.next.url || '').indexOf('http') === 0, '★★ next.kind=vendor + 厂商链接')
  const inst = await call('math_computation', { op: 'install', engine: 'maple', packages: ['x'], dryRun: true })
  assert(inst.ok === false && inst.code === 'MATH_REFUSED' && !!inst.next && inst.next.kind === 'vendor', '★★★ 商业引擎的 install 一律 REFUSED{vendor}（永不代装）')
  assert(fake.spawns.filter((s) => looksLikeRun(s.argv)).length === 0, '商业引擎没有产生安装/运行调用')
}

// ── §6 超时：kill + MATH_TIMEOUT ─────────────────────────────────────────────────────────────
section('§6 超时（mathTimeoutMs 到点主动 terminate）')
{
  fake = freshFake()
  fake.installed = { python: '3.11.4' }
  fake.run = 'hang'
  await call('vibe_math_set_params', { mathTimeoutMs: 1000 })
  const t0 = Date.now()
  const r = await call('math_computation', { op: 'run', mode: 'code', code: 'while True: pass' })
  const dt = Date.now() - t0
  assert(r.ok === false && r.code === 'MATH_TIMEOUT' && r.timedOut === true, '★ 挂起引擎 ⇒ MATH_TIMEOUT + timedOut:true（got ' + JSON.stringify({ok:r.ok,code:r.code,timedOut:r.timedOut,message:String(r.message||'').slice(0,120)}) + '）')
  assert(fake.terminated >= 1, '★★ 超时**主动调用** handle.terminate()（终止计数 ' + fake.terminated + '）')
  assert(dt >= 900 && dt <= 4000, '耗时 ≈ timeoutMs（' + dt + 'ms）')
  await call('vibe_math_set_params', { mathTimeoutMs: 60000 })
}

// ── §7 非零退出 ──────────────────────────────────────────────────────────────────────────────
section('§7 非零退出（MATH_NONZERO_EXIT + stderr 尾部）')
{
  fake = freshFake()
  fake.installed = { python: '3.11.4' }
  fake.run = 'fail3'
  const r = await call('math_computation', { op: 'run', mode: 'code', code: 'boom' })
  assert(r.ok === false && r.code === 'MATH_NONZERO_EXIT' && r.exit === 3, '★ exit=3 ⇒ MATH_NONZERO_EXIT{exit:3}（got ' + JSON.stringify({ok:r.ok,code:r.code,exit:r.exit,message:String(r.message||'').slice(0,120)}) + '）')
  assert(/boom/.test(String(r.stderr || '')), 'stderr 尾部原样返回（' + JSON.stringify(String(r.stderr).trim()) + '）')
}

// ── §8 超大输出：返回体截断 + 完整版落盘 ──────────────────────────────────────────────────────
section('§8 超大输出（64KB 返回截断、完整版落盘）')
{
  fake = freshFake()
  fake.installed = { python: '3.11.4' }
  fake.run = 'big'
  const r = await call('math_computation', { op: 'run', mode: 'code', code: 'print("x"*200000)' })
  assert(r.ok === true && r.truncated && r.truncated.stdout === true, '★ 200KB 输出 ⇒ ok:true + truncated.stdout:true（got ' + JSON.stringify({ok:r.ok,code:r.code,truncated:r.truncated,len:String(r.stdout||'').length}) + '）')
  assert(Array.isArray(r.warnings) && r.warnings.some((w) => w.code === 'OUTPUT_TRUNCATED'), '★★ warnings 里给出 OUTPUT_TRUNCATED')
  assert(String(r.stdout || '').length <= 64 * 1024, '返回体的 stdout 被截到 ≤64KB（' + String(r.stdout).length + '）')
  const full = join(projRoot(), r.receipt.dir, 'stdout.txt')
  assert(existsSync(full) && statSync(full).size > 64 * 1024, '★★★ 落盘的 stdout.txt 是**完整** 200KB（' + (existsSync(full) ? statSync(full).size : 'missing') + ' bytes）——说明 seam 没有被 64KB stdio 上限截断')
}

// ── §9 路径守卫 + cwd ────────────────────────────────────────────────────────────────────────
section('§9 路径守卫与 cwd')
{
  fake = freshFake()
  fake.installed = { python: '3.11.4' }
  const esc = await call('math_computation', { op: 'run', mode: 'file', file: '../outside.py' })
  assert(esc.ok === false && esc.code === 'MATH_REFUSED', '★★ 项目根之外的 file ⇒ MATH_REFUSED（' + esc.code + '）')
  const abs = await call('math_computation', { op: 'run', mode: 'file', file: join(WS, 'x.py') })
  assert(abs.ok === false && abs.code === 'MATH_REFUSED', '★ 绝对路径同样拒绝')
  fake.spawns.length = 0
  writeFileSync(join(projRoot(), 'ok.py'), 'print(1)\n', 'utf8')
  const ok = await call('math_computation', { op: 'run', mode: 'file', file: 'ok.py' })
  assert(ok.ok === true, '项目内的 file 正常执行')
  const runSpawn = fake.spawns.filter((s) => looksLikeRun(s.argv)).slice(-1)[0]
  assert(!!runSpawn && String(runSpawn.cwd).replace(/\\/g, '/') === projRoot().replace(/\\/g, '/'), '★★ spawn 的 cwd === 项目根（' + (runSpawn && runSpawn.cwd) + '）')
  assert(!!runSpawn && runSpawn.argv[runSpawn.argv.length - 1].indexOf('script.py') !== -1, '★ mode=file 的 argv 末元素是落盘脚本的绝对路径（可照抄复跑）')
}

// ── §10 cli 默认开启 + 两种禁用 ──────────────────────────────────────────────────────────────
section('§10 cli 默认开启（mathMode / mathEngines 两条禁用路径）')
{
  fake = freshFake()
  fake.cliCommands = { echo: '/fake/cli/echo' }
  fake.spawns.length = 0
  const ok = await call('math_computation', { op: 'run', engine: 'cli', mode: 'code', code: 'MATHCLI', cli: { command: 'echo', argv: ['MATHCLI'] } })
  assert(ok.ok === true && /^cli/.test(String(ok.engine)), '★ 默认档 cli 能跑通（engine=cli 或 cli:<command>）（got ' + JSON.stringify(ok).slice(0, 400) + '）')
  assert(!!ok.receipt && existsSync(join(projRoot(), ok.receipt.json)), '★ cli 也走同一套回执管线（receipt.json 落盘）')
  const cliSpawn = fake.spawns.filter((s) => s.argv[0] === '/fake/cli/echo').slice(-1)[0]
  assert(!!cliSpawn && JSON.stringify(cliSpawn.argv) === JSON.stringify(['/fake/cli/echo', 'MATHCLI']), '★★ cli 的 argv === [<command>, ...<cli.argv>]（不是 shell 拼接）')
  await call('vibe_math_set_params', { mathMode: 'typed' })
  fake.spawns.length = 0
  const pol = await call('math_computation', { op: 'run', engine: 'cli', mode: 'code', code: 'MATHCLI', cli: { command: 'echo', argv: ['MATHCLI'] } })
  assert(pol.ok === false && pol.code === 'MATH_REFUSED' && /policy|mathMode=typed/.test(((pol.next && pol.next.reason) || '') + ' ' + String(pol.message || '')), '★★ mathMode=typed ⇒ cli 被策略拒绝（MATH_REFUSED{polic…}；module 在 validateMathArgs 里拦下，故 message 而非 next.reason 承载 policy 语义）（got ' + JSON.stringify(pol).slice(0, 220) + '）')
  assert(fake.spawns.length === 0, '★ 策略禁用下假引擎**零调用**')
  await call('vibe_math_set_params', { mathMode: 'typed+shell', mathEngines: MATH_PARAM_DEFAULTS.mathEngines.filter((e) => e !== 'cli') })
  fake.spawns.length = 0
  const out = await call('math_computation', { op: 'run', engine: 'cli', mode: 'code', code: 'MATHCLI', cli: { command: 'echo', argv: ['MATHCLI'] } })
  assert(out.ok === false && out.code === 'MATH_REFUSED', '★★ 从 mathEngines 移除 cli ⇒ 同样 REFUSED')
  assert(fake.spawns.length === 0, '★ 第二种禁用路径同样零调用')
  await call('vibe_math_set_params', { mathEngines: MATH_PARAM_DEFAULTS.mathEngines.slice() })
}

// ── §11/§12 argv 回显 + bad-argv 不折叠 ──────────────────────────────────────────────────────
section('§11/§12 argv 回显（receipt + 返回外壳）与 MATH_ENGINE_BAD_ARGV')
{
  fake = freshFake()
  fake.installed = { python: '3.11.4' }
  fake.spawns.length = 0
  const r = await call('math_computation', { op: 'run', mode: 'code', code: 'print("echo")' })
  const actual = fake.spawns.filter((s) => looksLikeRun(s.argv)).slice(-1)[0].argv
  assert(JSON.stringify(r.argv) === JSON.stringify(actual), '★★ 返回外壳的 argv 与**实际执行**的 argv 逐元素相等')
  const rec = receiptOf(r.receipt.dir.split('/').pop())
  assert(JSON.stringify(rec.argv) === JSON.stringify(actual), '★★★ receipt.json 里的 argv 也逐元素相等（回执可照抄复跑）；receipt.cwd === 项目根')
  assert(String(rec.cwd).replace(/\\/g, '/') === projRoot().replace(/\\/g, '/'), '★★ receipt 记录 cwd = 项目根')
  // bad-argv：商业引擎（有许可）× 选项错 ⇒ 可执行建议；普通 exit 3 ⇒ 仍是 NONZERO_EXIT
  fake = freshFake()
  fake.installed = { maple: '2024' }
  fake.licensed = { maple: true }
  fake.run = 'argerr'
  const bad = await call('math_computation', { op: 'run', engine: 'maple', mode: 'code', code: 'x' })
  assert(bad.ok === false && bad.code === 'MATH_ENGINE_BAD_ARGV', '★★ 选项/用法错 ⇒ MATH_ENGINE_BAD_ARGV（不是裸 NONZERO_EXIT）')
  assert(!!bad.next && bad.next.kind === 'engine-override' && JSON.stringify(bad.next.argv) === JSON.stringify(bad.argv), '★★ next.kind=engine-override + next.argv === 实际 argv')
  assert(/mathEngineOverride/.test(String(bad.message || '')), '★ message 指向 mathEngineOverride')
  const badRec = receiptOf(bad.receipt.dir.split('/').pop())
  assert(JSON.stringify(badRec.argv) === JSON.stringify(bad.argv), '★ 失败时同样回显 argv（回执里）')
  fake.run = 'fail3'
  const plain = await call('math_computation', { op: 'run', engine: 'maple', mode: 'code', code: 'y' })
  assert(plain.ok === false && plain.code === 'MATH_NONZERO_EXIT', '对照：普通 exit 3 仍是 MATH_NONZERO_EXIT')
}

// ── §13 安装两步 + 作用域 ────────────────────────────────────────────────────────────────────
section('§13 op=install：plan → confirm 两步、作用域不记忆、审计记录')
{
  fake = freshFake()
  fake.installed = { python: '3.11.4' }
  fake.spawns.length = 0
  const plan = await call('math_computation', { op: 'install', engine: 'python', packages: ['sympy'], dryRun: true })
  assert(plan.ok === true && !!plan.plan && Array.isArray(plan.plan.commands) && plan.plan.commands.length === 1 && typeof plan.planToken === 'string' && plan.planToken.length > 8, '★ dryRun 返回 plan.commands + planToken（' + String(plan.planToken).slice(0, 8) + '…）')
  assert(plan.plan.commands[0].argv.indexOf('--user') !== -1, '★★ 默认 mathInstallScope=user ⇒ 命令含 --user')
  assert(fake.spawns.length === 0, '★★★ dryRun **零调用**（永不自动安装）')
  const wrong = await call('math_computation', { op: 'install', engine: 'python', packages: ['sympy'], confirm: 'deadbeef' })
  assert(wrong.ok === false && wrong.code === 'MATH_REFUSED', '★ token 不匹配 ⇒ MATH_REFUSED')
  assert(fake.spawns.length === 0, '★ token 不匹配时零调用（不会误装）')
  const done = await call('math_computation', { op: 'install', engine: 'python', packages: ['sympy'], confirm: plan.planToken })
  assert(done.ok === true && done.executed === true && fake.spawns.length === 1, '★★ 正确 token ⇒ 执行一次（调用数 ' + fake.spawns.length + '）')
  const auditPath = join(projRoot(), 'Computation', 'installs', plan.planToken + '.json')
  const audit = JSON.parse(readIf(auditPath) || '{}')
  assert(existsSync(auditPath) && audit.scope === 'user' && audit.manager === 'pip' && !!audit.rollback && Array.isArray(audit.rollback.commands) && audit.network === 'not-enforced-by-plugin', '★★★ 审计记录含 scope/manager/rollback.commands/network（' + JSON.stringify(Object.keys(audit)) + '）')
  // system：默认绝不出现；显式给出才出现，且**不记忆**
  fake.spawns.length = 0
  const sys = await call('math_computation', { op: 'install', engine: 'python', packages: ['sympy'], scope: 'system', dryRun: true })
  assert(sys.ok === true && sys.plan.scope === 'system' && sys.plan.commands[0].argv.indexOf('--user') === -1, '★★ 显式 scope=system ⇒ 命令不含 --user')
  const again = await call('math_computation', { op: 'install', engine: 'python', packages: ['sympy'], dryRun: true })
  assert(again.plan.scope === 'user' && again.plan.commands[0].argv.indexOf('--user') !== -1, '★★★ system **不被记住**：下一次不带 scope 仍是 user')
}

// ── §14 回执幂等（同输入 ⇒ 同 runId，无墙钟） ─────────────────────────────────────────────────
section('§14 回执幂等（同输入 ⇒ 同 runId）')
{
  fake = freshFake()
  fake.installed = { python: '3.11.4' }
  const a = await call('math_computation', { op: 'run', mode: 'code', code: 'print("same")' })
  const b = await call('math_computation', { op: 'run', mode: 'code', code: 'print("same")' })
  assert(a.receipt.dir === b.receipt.dir, '★★ 同输入两次运行命中同一回执目录（runId 无墙钟）')
  assert(/^vibe-math-v2-/.test(String(a.receipt.dir).replace('Computation/', '')), '★ runId 前缀是 designator（vibe-math-v2）')
  const rec = receiptOf(a.receipt.dir.split('/').pop())
  assert(rec.preset === 'vibe-math-v2' && rec.determinism && rec.determinism.noWallClockInId === true, '★★ 回执 preset=vibe-math-v2，且声明 runId 无墙钟')
}

// ── §15 提示词面：可用性行（typed+shell / typed / off）+ persona 两块 ──────────────────────────
section('§15 提示词面：可用性行三档 + persona 两块')
{
  const promptText = () => H.spawns.map((s) => (s.request && s.request.prompt && s.request.prompt[0] && s.request.prompt[0].text) || '').join('\n')
  fake = freshFake()
  fake.installed = { python: '3.11.4' }
  await call('vibe_math_set_params', { mathComputation: 'auto', mathMode: 'typed+shell' })
  await call('vibe_math_add_problem', { id: 'pq1', description: '提示词面用例' })
  await call('vibe_math_start', {})
  for (let i = 0; i < 40 && H.spawns.length === 0; i++) await sleep(100)
  await call('vibe_math_pause', {})
  const shellMode = promptText()
  assert(/math_computation/.test(shellMode), '★ 工作提示词里出现 math_computation 可用性行')
  assert(/先 probe 再 run/.test(shellMode), '★★ 可用性行含"先 probe 再 run"')
  assert(/未经工具归档/.test(shellMode), '★★ typed+shell 档含 shell 兜底标注（未经工具归档）')
  // typed：不得出现 shell 兜底句
  H.spawns.length = 0
  await call('vibe_math_set_params', { mathMode: 'typed' })
  await call('vibe_math_abort', {})
  await call('vibe_math_start', {})
  for (let i = 0; i < 40 && H.spawns.length === 0; i++) await sleep(100)
  await call('vibe_math_pause', {})
  const typedMode = promptText()
  assert(/先 probe 再 run/.test(typedMode), 'typed 档仍注入可用性行（只是不提 shell）')
  assert(!/未经工具归档/.test(typedMode), '★★★ mathMode=typed 时**不得**出现 shell 兜底句（守卫要的正是这条）')
  // off：零提及
  H.spawns.length = 0
  await call('vibe_math_set_params', { mathComputation: 'off' })
  await call('vibe_math_abort', {})
  await call('vibe_math_start', {})
  for (let i = 0; i < 40 && H.spawns.length === 0; i++) await sleep(100)
  await call('vibe_math_pause', {})
  const offMode = promptText()
  assert(offMode.length > 0 && !/math_computation/.test(offMode), '★★★ mathComputation=off ⇒ 提示词**零提及**（真 no-op）')
  const offCall = await call('math_computation', { op: 'probe' })
  assert(offCall.ok === false && offCall.code === 'MATH_NOT_AVAILABLE', '★ off 档调用工具 ⇒ MATH_NOT_AVAILABLE{next:enable}')
  assert(!!offCall.next && offCall.next.kind === 'enable' && offCall.next.param === 'mathComputation', '★ 并给出开启指引（不会静默失败）')
  await call('vibe_math_set_params', { mathComputation: 'auto', mathMode: 'typed+shell' })
  // persona：两个文本块都要有工具行
  const yml = readFileSync(join(HERE, '..', 'vibe-math-v2', 'agent.cordis.yml'), 'utf8')
  const blocks = yml.split(/\n\s*(?:prefix|text):\s*\|/)
  const hits = blocks.filter((b) => b.indexOf('math_computation') !== -1).length
  assert(hits >= 2, '★★★ persona 的 prefix 与 text **两个**块都含 math_computation 工具行（命中 ' + hits + ' 块）')
  assert(yml.indexOf(MATH_PERSONA_TOOL_LINE) !== -1, '★★★ persona 工具行与共享模块的 MATH_PERSONA_TOOL_LINE 逐字一致（四套同一行）')
}

// ── §16 ensureDirs 含 Computation ────────────────────────────────────────────────────────────
section('§16 ensureDirs：项目骨架含 Computation/')
{
  await call('vibe_math_new_project', { name: PROJECT })
  const need = ['Computation', 'Formal', 'Verified/Lean', 'VibeMath_State'].map((d) => join(projRoot(), d))
  const missing = need.filter((p) => !existsSync(p))
  assert(missing.length === 0, '★★ 项目骨架含 Computation/（缺失：' + missing.join(',') + '）｜最近 shell: ' + JSON.stringify(fake.spawns.filter((s) => /New-Item|mkdir/.test(s.argv.join(' '))).slice(-1)) + ')')
  assert(existsSync(join(projRoot(), 'Computation', 'installs')), '★ 安装审计的落点 Computation/installs/ 也存在（§13 已写入审计记录）')
}

console.log('\n=== MATH COMPUTATION V2: ' + passed + ' passed, ' + failed + ' failed ===')
rmSync(WS, { recursive: true, force: true })
if (failed) { console.error('FAILURES:'); for (const f of failures) console.error('  - ' + f); process.exit(1) }
console.log('ALL GREEN')
process.exit(0)

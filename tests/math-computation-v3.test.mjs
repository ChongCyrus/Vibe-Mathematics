// tests/math-computation-v3.test.mjs — v3 接线面验收（math_computation P1）
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
  MATH_ARCHIVE_WORKFLOW_LINE,
  MATH_SUBSTITUTION_RULE_LINE,
} from '../vibe-math-v3/math-computation.js'
// 引擎表在姊妹模块里（模块自己 import 它；测试为了拼 argv 模板也直接读一次，只读不写）。
import { MATH_ENGINES } from '../vibe-math-v3/math-engines.js'

const HERE = dirname(fileURLToPath(import.meta.url))
const PLUGIN = process.env.MC_V3_PLUGIN
  ? new URL('file:///' + String(process.env.MC_V3_PLUGIN).replace(/\\/g, '/'))
  : new URL('../vibe-math-v3/vibe-math-v3.js', import.meta.url)

let passed = 0
let failed = 0
const failures = []
const skips = [] // A1：显式跳过清单（任何 skip 都会出现在摘要里，不再冒充通过）
const skip = (why) => { skips.push(String(why)); console.log('  skip - ' + why) }
let mgrBranchExercised = false // A1：证明「管理器存在 ⇒ 可执行命令」这半契约真的跑过
function assert(cond, msg) {
  if (cond) { passed++; console.log('  ok - ' + msg) } else { failed++; failures.push(msg); console.error('  FAIL - ' + msg) }
}
const section = (t) => console.log('\n[' + t + ']')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const WS = mkdtempSync(join(tmpdir(), 'mc-v3-'))
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
    spawnDelayMs: 0,          // 每次 spawn 的人为延迟（跨会话交错用例用）
    noSubprocess: false,      // true ⇒ ctx.get('subprocess') 返回 undefined（hasSubprocess:false 用例）
    fsListDirAccess: 0,       // 假 fs 的 listDir 属性被读取的次数（能力门闩）
    fsListDirCalls: 0,        // 假 fs 的 listDir 被真正调用（列目录）的次数
    cliCommands: {},          // { echo: '/fake/cli/echo' }
    spawns: [], terminated: 0,
  }
}
function engineOfExe(exe) { return CANDIDATES[String(exe).split(/[\\/]/).pop()] || null }
function looksLikeRun(argv) { return argv.join(' ').indexOf('/script.') !== -1 }
const VERSION_RE = { python: /(\d+\.\d+\.\d+)/, r: /(\d+\.\d+\.\d+)/, octave: /(\d+\.\d+\.\d+)/, julia: /(\d+\.\d+\.\d+)/, matlab: /(\d+\.\d+)/, maple: /(\d+\.\d+)/, wolfram: /(\d+\.\d+(\.\d+)?)/ }
function spawnResult(exit, stdout, stderr) {
  // 可选延迟：跨会话并发用例（§17）需要两次调用真的在 await 期间交错，默认 0。
  const done = (fake && fake.spawnDelayMs)
    ? new Promise(function (r) { setTimeout(function () { r({ exitCode: exit, signal: null }) }, fake.spawnDelayMs) })
    : Promise.resolve({ exitCode: exit, signal: null })
  return {
    done: done,
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
      if (name === 'subprocess') return (fake && fake.noSubprocess) ? undefined : subprocess
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
  // fs 服务外面包一层计数器：`listDir` 的"读属性"（能力门闩）与"真调用"（列目录）分开计，
  // 这样 §18 才能证明"宿主没有 listDir 时预设一次都没查过"，而不是只看结果。
  const fsBase = ctx.fs
  ctx.fs = new Proxy(fsBase, {
    get(t, p) {
      if (p === 'listDir') {
        fake.fsListDirAccess = (fake.fsListDirAccess || 0) + 1
        const v = t.listDir
        if (typeof v !== 'function') return v
        return function () { fake.fsListDirCalls = (fake.fsListDirCalls || 0) + 1; return v.apply(t, arguments) }
      }
      return t[p]
    },
  })
  return { ctx, toolRegs, cmdRegs, spawns, listeners, fs: fsBase }
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
await call('vibe_math_set_params', { tickIntervalMs: 200, verifierCount: 2, plannerEnabled: false, maxParallelThreshold: 64 })

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
  assert(H.cmdRegs.length === 1 && String(H.cmdRegs[0].input.hint).indexOf('math') === -1, '★ 未新增 /v3 math 子命令：hint 不含 math（P1 不动命令面）')
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
  assert(!!miss.next && miss.next.kind === 'user-install', '★★ 未命中必须带可执行的下一步：next.kind=user-install')
  const perOs = (miss.next && miss.next.perOs) || {}
  assert(['windows', 'macos', 'linux'].every((k) => typeof perOs[k] === 'string' && perOs[k].length > 0), '★★ user-install 指引带 perOs 三平台的官方命令（实测 ' + JSON.stringify(perOs) + '）')
  assert(!!miss.next && miss.next.suggestedCommand === miss.next.perOs[miss.next.platform], '★★ suggestedCommand === perOs[platform]（platform=' + (miss.next && miss.next.platform) + '）')
  assert(!!miss.next && (miss.next.packageManagerAvailable === false ? miss.next.command === '' : typeof miss.next.command === 'string'), '★★★ 包管理器不可用时**绝不**给出跑不了的命令（command 必须是空串），可用时才是字符串（实测 ' + JSON.stringify(miss.next && { mgr: miss.next.packageManager, avail: miss.next.packageManagerAvailable, command: miss.next.command }) + '）')
  assert(!miss.next || miss.next.packageManagerAvailable !== false || (String(miss.next.note || '').length > 0 && String(miss.next.suggestedCommand || '').length > 0), '★★ 命令被撤下时必须给出替代出口：note + perOs 里的官方命令（vendorUrl 只有商业引擎才有，可为 null；实测 ' + JSON.stringify(miss.next && { note: String(miss.next.note || '').slice(0, 40), suggested: miss.next.suggestedCommand }) + '）')
  // 另一半：包管理器**存在**时给出可执行命令（command === suggestedCommand）
  // A1：旧写法在「本平台模板无包管理器前缀」时 `assert(true, …跳过…)` 会给 passed +1 却什么都没验。
  // 这里把被探测引擎钉到 python（其 userInstall 模板三平台都带管理器前缀 winget/brew/apt）⇒
  // **强制**走完「管理器存在 ⇒ 给出可执行命令」这一半契约（平台差异不再能吃掉断言）。
  await call('vibe_math_set_params', { mathEngines: ['python'] })
  const missMgr = await call('math_computation', { op: 'probe', packages: ['refresh'] })
  const mgrName = missMgr.next && missMgr.next.packageManager
  assert(!!mgrName, '★★★ A1：python 的 userInstall 模板在三平台都带包管理器前缀（实测 ' + JSON.stringify(mgrName) + '）')
  fake.cliCommands = {}
  if (mgrName) fake.cliCommands[mgrName] = '/fake/' + mgrName + '.exe'
  const withMgr = await call('math_computation', { op: 'probe', packages: ['refresh'] })
  assert(!!withMgr.next && withMgr.next.packageManagerAvailable === true && typeof withMgr.next.command === 'string' && withMgr.next.command.length > 0 && withMgr.next.command === withMgr.next.suggestedCommand, '★★★ 包管理器存在时给出**可执行**命令（command === suggestedCommand，实测 ' + JSON.stringify(withMgr.next && { mgr: withMgr.next.packageManager, avail: withMgr.next.packageManagerAvailable, command: withMgr.next.command }) + '）')
  mgrBranchExercised = true
  // 另一半：没有管理器前缀的模板（vendor 下载）仍必须给官方命令、且不得谎称可运行
  await call('vibe_math_set_params', { mathEngines: ['wolfram'] })
  const vendor = await call('math_computation', { op: 'probe', packages: ['refresh'] })
  assert(!!vendor.next && vendor.next.packageManager === null && typeof vendor.next.suggestedCommand === 'string' && vendor.next.suggestedCommand.length > 0, '★★ A1：无管理器前缀的模板 packageManager=null 且仍给官方命令（platform=' + (vendor.next && vendor.next.platform) + '）')
  await call('vibe_math_set_params', { mathEngines: ['python', 'r', 'octave', 'julia', 'matlab', 'maple', 'wolfram', 'cli'] })
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
  // round-7 (finding 4): mode:'code' appends the ARCHIVED script path (the caller cannot know the
  // runId), so the executed argv is [command, ...cli.argv, <script>]; the receipt keeps the user argv.
  assert(!!cliSpawn && cliSpawn.argv[0] === '/fake/cli/echo' && cliSpawn.argv[1] === 'MATHCLI' && /script\.txt$/.test(String(cliSpawn.argv[2] || '')), '★★ cli 的 argv === [<command>, ...<cli.argv>, <归档脚本>]（不是 shell 拼接）')
  assert(ok.cliScriptAppended === true, '★★ cli 回执标注 scriptAppended（mode:code 真的把脚本传给了命令）')
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
  // P2a：归档是**追加式**的——同 runId 的第 2 次运行落 attempts/2/，所以 dir 不再相等；
  // 语义不变：同输入 ⇒ 同一 archive id（baseRunDir），无墙钟；已有归档永不覆盖。
  assert(a.baseRunDir === b.baseRunDir && b.attempt === 2 && b.attemptDir !== a.attemptDir,
    '★★ 同输入两次运行命中同一 archive id（baseRunDir 相同、第 2 次进 attempts/2，无墙钟）（' + JSON.stringify({ base: a.baseRunDir, a1: a.attempt, a2: b.attempt, d1: a.attemptDir, d2: b.attemptDir }) + '）')
  // 注意：返回体外壳里的 receipt 是**引用**（dir/json/md/sha256），scriptHash 要从回执文件里读。
  const recA = JSON.parse(readIf(join(projRoot(), a.attemptDir, 'receipt.json')) || '{}')
  assert(a.scriptHash === b.scriptHash && recA.scriptHash === a.scriptHash, '★★ 同代码 ⇒ scriptHash 相同（返回体与回执文件都给，' + String(a.scriptHash).slice(0, 12) + '…）')
  const firstOut = join(projRoot(), a.attemptDir, 'stdout.txt')
  assert(a.attemptDir !== b.attemptDir && existsSync(firstOut) && readFileSync(firstOut, 'utf8') === 'ok\n',
    '★★ 追加式归档：第 1 次 attempt 的文件**未被改写**（stdout.txt 仍是首次内容）')
  assert(/^vibe-math-v3-/.test(String(a.baseRunDir).replace('Computation/', '')), '★ runId 前缀是 designator（vibe-math-v3）')
  const rec = receiptOf(a.baseRunDir.split('/').pop())
  assert(rec.preset === 'vibe-math-v3' && rec.determinism && rec.determinism.noWallClockInId === true, '★★ 回执 preset=vibe-math-v3，且声明 runId 无墙钟')
}

// ── §14b P2a：scriptPath/scriptHash（code）、编辑→重跑（file）⇒ scriptChanged + 新 attempt ─────
section('§14b P2a：scriptPath/scriptHash、mode:file 的编辑→重跑（追加 attempt + scriptChanged 告警）')
{
  fake = freshFake()
  fake.installed = { python: '3.11.4' }
  const code = await call('math_computation', { op: 'run', mode: 'code', code: 'print("p2a")' })
  const rec = JSON.parse(readIf(join(projRoot(), code.attemptDir, 'receipt.json')) || '{}')
  assert(typeof code.scriptPath === 'string' && /script\.py$/.test(code.scriptPath), '★ P2a：mode=code 返回体含 scriptPath（' + code.scriptPath + '）')
  assert(typeof code.scriptHash === 'string' && code.scriptHash.length === 64 && code.scriptHash === rec.scriptHash, '★★ P2a：返回体与回执的 scriptHash 一致（64 hex）')
  assert(existsSync(join(projRoot(), code.scriptPath)), '★ P2a：scriptPath 指向的回执原件真的在盘上（可用普通文件工具编辑）')
  // mode:file：改内容后重跑 ⇒ 同一 archive id 的新 attempt + scriptChanged 告警
  writeFileSync(join(projRoot(), 'flow.py'), 'print("v1")\n', 'utf8')
  const first = await call('math_computation', { op: 'run', mode: 'file', file: 'flow.py' })
  writeFileSync(join(projRoot(), 'flow.py'), 'print("v2-edited")\n', 'utf8')
  const second = await call('math_computation', { op: 'run', mode: 'file', file: 'flow.py' })
  assert(second.ok === true && second.baseRunDir === first.baseRunDir && second.attemptDir !== first.attemptDir,
    '★★ P2a：mode=file 按**路径**归属 archive id，编辑后重跑落同一 id 的新 attempt（' + JSON.stringify({ base: second.baseRunDir, first: first.attemptDir, second: second.attemptDir }) + '）')
  assert(second.scriptChanged === true, '★★★ P2a：内容变了 ⇒ scriptChanged:true')
  assert(Array.isArray(second.warnings) && second.warnings.some((w) => w.code === 'SCRIPT_CHANGED_SINCE_LAST_RECEIPT'),
    '★★★ P2a：warnings 含 SCRIPT_CHANGED_SINCE_LAST_RECEIPT（旧回执不代表新代码）')
  assert(second.scriptHash !== first.scriptHash, '★ 两次的 scriptHash 不同（分别对应编辑前后）')
}

// ── §15 提示词面：可用性行（typed+shell / typed / off）+ persona 两块 ──────────────────────────
section('§15 提示词面：可用性行三档 + persona 两块')
{
  const promptText = () => H.spawns.map((s) => (s.request && s.request.prompt && s.request.prompt[0] && s.request.prompt[0].text) || '').join('\n')
  fake = freshFake()
  fake.installed = { python: '3.11.4' }
  await call('vibe_math_set_params', { mathComputation: 'auto', mathMode: 'typed+shell' })
  await call('vibe_math_add_problem', { id: 'pq1', 陈述: '提示词面用例' })
  await call('vibe_math_start', {})
  for (let i = 0; i < 40 && H.spawns.length === 0; i++) await sleep(100)
  await call('vibe_math_pause', {})
  const shellMode = promptText()
  assert(/math_computation/.test(shellMode), '★ 工作提示词里出现 math_computation 可用性行')
  assert(/先 probe 再 run/.test(shellMode), '★★ 可用性行含"先 probe 再 run"')
  assert(/未经工具归档/.test(shellMode), '★★ typed+shell 档含 shell 兜底标注（未经工具归档）')
  assert(shellMode.indexOf(MATH_SUBSTITUTION_RULE_LINE) !== -1, '★★★ A 项：注入的可用性行含「替代必须声明」规则（工作提示词里逐字可见）')
  const toolDesc = String((specOf('math_computation') || {}).description || '')
  assert(toolDesc.indexOf(MATH_SUBSTITUTION_RULE_LINE) !== -1 || /替代方案若改变精确性|替代必须声明/.test(toolDesc), '★★★ A 项：工具描述写明「替代改变精确性/强度必须声明」（逐字或同义重述，实测片段：' + JSON.stringify(toolDesc.slice(Math.max(0, toolDesc.indexOf('替代')), toolDesc.indexOf('替代') + 46)) + '）')
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
  const yml = readFileSync(join(HERE, '..', 'vibe-math-v3', 'agent.cordis.yml'), 'utf8')
  const blocks = yml.split(/\n\s*(?:prefix|text):\s*\|/)
  const hits = blocks.filter((b) => b.indexOf('math_computation') !== -1).length
  assert(hits >= 2, '★★★ persona 的 prefix 与 text **两个**块都含 math_computation 工具行（命中 ' + hits + ' 块）')
  assert(yml.indexOf(MATH_PERSONA_TOOL_LINE) !== -1, '★★★ persona 工具行与共享模块的 MATH_PERSONA_TOOL_LINE 逐字一致（四套同一行）')
  // P2a：两个块都要含「归档→编辑→重跑」规则，且文本与模块常量逐字一致（不手抄）
  const wfBlocks = yml.split(/\n\s*(?:prefix|text):\s*\|/).filter((b) => b.indexOf(MATH_ARCHIVE_WORKFLOW_LINE) !== -1).length
  assert(wfBlocks >= 2, '★★★ P2a：persona 两个文本块都含 MATH_ARCHIVE_WORKFLOW_LINE（命中 ' + wfBlocks + ' 块）')
  assert((yml.match(/scriptChanged/g) || []).length >= 2 && (yml.match(/mode:'file'|mode: 'file'/g) || []).length >= 2, '★★ P2a：yml 里 scriptChanged 与 mode:file 各出现两次（两个块各一次）')
  // A 项：替代必须声明（诚实性）。**追加**语义：含这条规则的块里，原有工具行与归档工作流行都必须在。
  const subBlocks = blocks.filter((b) => b.indexOf(MATH_SUBSTITUTION_RULE_LINE) !== -1)
  assert(subBlocks.length >= 2, '★★★ A 项：persona 两个文本块都含「替代必须声明」规则（命中 ' + subBlocks.length + ' 块）')
  assert(subBlocks.every((b) => b.indexOf(MATH_PERSONA_TOOL_LINE) !== -1 && b.indexOf(MATH_ARCHIVE_WORKFLOW_LINE) !== -1), '★★★ A 项：是**追加**不是替换——含新规则的块里原有工具行/归档工作流行都还在')
}

// ── §16 ensureDirs 含 Computation ────────────────────────────────────────────────────────────
section('§16 ensureDirs：项目骨架含 Computation/')
{
  await call('vibe_math_new_project', { name: PROJECT })
  const need = ['Computation', 'Formal', 'Verified/Lean', 'State'].map((d) => join(projRoot(), d))
  const missing = need.filter((p) => !existsSync(p))
  assert(missing.length === 0, '★★ 项目骨架含 Computation/（缺失：' + missing.join(',') + '）｜最近 shell: ' + JSON.stringify(fake.spawns.filter((s) => /New-Item|mkdir/.test(s.argv.join(' '))).slice(-1)) + ')')
  assert(existsSync(join(projRoot(), 'Computation', 'installs')), '★ 安装审计的落点 Computation/installs/ 也存在（§13 已写入审计记录）')
}

// ── §17 跨会话隔离（审计 C#2）：同一插件实例、两个会话并发调用 ─────────────────────────────────
// 要害：math 调用里所有会话相关的东西（params/projectRoot/writeText/spawn）必须来自**发起调用的那个会话**。
// 若实现里存在一个"当前 math 调用会话"的单槽，A 在 await 期间被 B 覆盖，A 就会用 B 的引擎/模式/根目录。
// 这里用不同 mathEngines/mathMode 的两个会话 + Promise.all + 有延迟的假引擎把交错逼出来。
section('§17 跨会话隔离：两个会话并发调用 math_computation（各用各的参数）')
{
  fake = freshFake()
  fake.installed = { python: '3.11.4', r: '4.3.2' }
  fake.spawnDelayMs = 40   // 每次 spawn 至少 40ms ⇒ 两次调用在 await 期间真的交错
  const RA = makeRoot('sess-iso-A')
  const RB = makeRoot('sess-iso-B')
  const projA = join(WS, 'VibeMath', 'Projects', 'isoA')
  const projB = join(WS, 'VibeMath', 'Projects', 'isoB')
  await call('vibe_math_new_project', { name: 'isoA' }, RA)
  await call('vibe_math_new_project', { name: 'isoB' }, RB)
  await call('vibe_math_set_params', { mathEngines: ['python'], mathMode: 'typed+shell' }, RA)
  await call('vibe_math_set_params', { mathEngines: ['r'], mathMode: 'typed' }, RB)
  const [ra, rb] = await Promise.all([
    call('math_computation', { op: 'run', mode: 'code', code: 'print("A")' }, RA),
    call('math_computation', { op: 'run', mode: 'code', code: 'print("B")' }, RB),
  ])
  fake.spawnDelayMs = 0
  assert(ra.ok === true && rb.ok === true, '★★ 两次并发调用都执行完成（没有任何一个被丢弃）（' + JSON.stringify({ a: ra.ok, b: rb.ok, ac: ra.code, bc: rb.code }) + '）')
  assert(/^python/.test(String(ra.engine)) && /^r(\b|:)/.test(String(rb.engine)), '★★★ 各自用**自己会话**的引擎（A=python, B=r；实测 ' + JSON.stringify({ a: ra.engine, b: rb.engine }) + '）')
  assert(String(ra.argv[0]).indexOf('python') !== -1 && /Rscript|R$/.test(String(rb.argv[0])), '★★★ 实际 spawn 的 argv[0] 各是自己的引擎 shim（' + JSON.stringify({ a: ra.argv[0], b: rb.argv[0] }) + '）')
  const recA = JSON.parse(readIf(join(projA, ra.attemptDir, 'receipt.json')) || '{}')
  const recB = JSON.parse(readIf(join(projB, rb.attemptDir, 'receipt.json')) || '{}')
  assert(recA.engine && recA.engine.name === 'python' && recB.engine && recB.engine.name === 'r', '★★★ 回执里的 engine 分别是 python / r（A 的回执没有写进 B 的引擎）')
  assert(String(recA.cwd).replace(/\\/g, '/').toLowerCase() === projA.replace(/\\/g, '/').toLowerCase() && String(recB.cwd).replace(/\\/g, '/').toLowerCase() === projB.replace(/\\/g, '/').toLowerCase(), '★★★ 两次调用的 cwd 各是自己的项目根（' + JSON.stringify({ a: recA.cwd, b: recB.cwd }) + '）')
  assert(recA.engine.name !== recB.engine.name, '★ 参数确实不同（否则本用例不能证伪单槽污染）')
}

// ── §18 可选 host 回调（FREEZE §4）：listDir 与 hasSubprocess 的预设接线 ────────────────────────
// 这两个字段是**可选**的，最容易被"接一半"而没人发现：模块在缺它们时会静默降级，
// 套件若只看结果就永远是绿的。这里对每一侧都做可观测断言（列目录调用计数 / 短路返回码）。
section('§18 可选 host 回调：listDir（保留上限只告警）与 hasSubprocess（no-subprocess 短路）')
{
  // (a) 宿主有 listDir 且 Computation/ 下 >200 个 run 目录 ⇒ ARCHIVE_RETENTION_EXCEEDED 告警，且**不删任何东西**
  fake = freshFake()
  fake.installed = { python: '3.11.4' }
  await call('vibe_math_new_project', { name: PROJECT })
  for (let i = 0; i < 201; i++) mkdirSync(join(projRoot(), 'Computation', 'run-' + i), { recursive: true })
  const runsBefore = readdirSync(join(projRoot(), 'Computation')).filter((n) => n.startsWith('run-')).length
  fake.fsListDirCalls = 0
  const ra = await call('math_computation', { op: 'run', mode: 'code', code: 'print("retention")' })
  assert(ra.ok === true, '★ (a) 归档数超限只告警、不影响计算（' + JSON.stringify({ ok: ra.ok, code: ra.code }) + '）')
  assert(fake.fsListDirCalls >= 1, '★★★ (a) 宿主提供 listDir ⇒ 模块真的去列了 Computation/（listDir 调用 ' + fake.fsListDirCalls + ' 次）')
  assert((ra.warnings || []).some((w) => w.code === 'ARCHIVE_RETENTION_EXCEEDED'), '★★★ (a) >200 个 run 目录 ⇒ 返回体 warnings 含 ARCHIVE_RETENTION_EXCEEDED（实测 ' + JSON.stringify((ra.warnings || []).map((w) => w.code)) + '）')
  const runsAfter = readdirSync(join(projRoot(), 'Computation')).filter((n) => n.startsWith('run-')).length
  assert(runsBefore === 201 && runsAfter === 201, '★★★ (a) 保留上限**只告警、永不删除**（run 目录数 ' + runsBefore + ' → ' + runsAfter + '）')

  // (b) 宿主**没有** listDir ⇒ 预设不声明该回调：一次都不查、也不告警
  const savedListDir = H.fs.listDir
  H.fs.listDir = undefined
  fake = freshFake()
  fake.installed = { python: '3.11.4' }
  const RB = makeRoot('sess-nolistdir')
  const projB = join(WS, 'VibeMath', 'Projects', 'nolistdir')
  await call('vibe_math_new_project', { name: 'nolistdir' }, RB)   // 这句建成 RB 的会话：能力门闩在此刻读 fs.listDir
  mkdirSync(join(projB, 'Computation'), { recursive: true })
  // 判定只看 calls：别的预设代码（如 refreshProject）也会读这个属性，access 只作参考。
  fake.fsListDirCalls = 0

  const rb = await call('math_computation', { op: 'run', mode: 'code', code: 'print("no-listdir")' }, RB)
  H.fs.listDir = savedListDir
  assert(rb.ok === true, '★ (b) 宿主没有 listDir 仍能正常计算（' + JSON.stringify({ ok: rb.ok, code: rb.code, message: String(rb.message || '').slice(0, 80) }) + '）')
  assert(fake.fsListDirCalls === 0, '★★★ (b) 没有 listDir ⇒ 预设不声明该回调：运行期**零次**列目录调用（calls=' + fake.fsListDirCalls + '；access=' + fake.fsListDirAccess + ' 只作参考）')
  assert(!(rb.warnings || []).some((w) => w.code === 'ARCHIVE_RETENTION_EXCEEDED'), '★★ (b) 因此也不会出现 ARCHIVE_RETENTION_EXCEEDED（不误报）')

  // (c) hasSubprocess:false ⇒ op=probe 与 op=run **都**短路成 MATH_NO_SUBPROCESS（不是 ENGINE_NOT_FOUND）
  fake = freshFake()
  fake.noSubprocess = true
  fake.spawns.length = 0
  const pc = await call('math_computation', { op: 'probe' })
  const rc = await call('math_computation', { op: 'run', mode: 'code', code: 'print(1)' })
  assert(pc.ok === false && pc.code === 'MATH_NO_SUBPROCESS', '★★★ (c) op=probe ⇒ MATH_NO_SUBPROCESS（实测 ' + pc.code + '，不许退化成 MATH_ENGINE_NOT_FOUND）')
  assert(rc.ok === false && rc.code === 'MATH_NO_SUBPROCESS', '★★★ (c) op=run ⇒ MATH_NO_SUBPROCESS（实测 ' + rc.code + '）')
  assert(fake.spawns.length === 0, '★★ (c) 短路发生在引擎探测之前：零次 spawn 尝试（实测 ' + fake.spawns.length + '）')
  fake.noSubprocess = false
}

// ── 19. round-2 lens-1: EVERY daily-line injection site is pinned, not just one ─────────────────
// The daily line belongs to the initiative axis, so at each site the producer call must not sit
// behind a `formalOn()` gate. Before this section, reverting ONE site to `formalOn()`-only still left
// the suite green (the dynamic eager case only exercised a different site).
{
  const src = readFileSync(fileURLToPath(PLUGIN), 'utf8')
  const lines = src.split(/\r?\n/)
  const sites = []
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (line.indexOf('function formalDailySection') !== -1 || line.indexOf('function formalWorkLine') !== -1) continue // definitions
    if (/^\s*const line = formalWorkLine\(\)/.test(line)) continue // inside formalDailySection itself
    const at = line.indexOf('formalDailySection()') !== -1 ? line.indexOf('formalDailySection()') : line.indexOf('formalWorkLine()')
    if (at === -1) continue
    const gated = line.indexOf('formalOn()') !== -1 && line.indexOf('formalOn()') < at
    sites.push({ n: i + 1, gated: gated, kind: line.indexOf('formalDailySection()') !== -1 ? 'helper' : 'inline' })
  }
  const helper = sites.filter((s) => s.kind === 'helper').length
  const inline = sites.filter((s) => s.kind === 'inline').length
  assert(helper >= 3, '★★★ [sites] all three formalDailySection() call sites are present (found ' + helper + ')')
  assert(inline >= 1, '★★★ [sites] the inline daily-line site (methodKeeperPrompt) is present (found ' + inline + ')')
  for (const s of sites) {
    assert(!s.gated, '★★★ [site @line ' + s.n + '] the daily-line producer is NOT behind a formalOn() gate (initiative is an independent axis)')
  }
}

// ── §19 成员/常驻作用域失败诊断（审计 D1）：不许静默成功、不许裸消息 ─────────────────────────────
section('§19 成员作用域失败诊断：interruptChild 显式失败 + decision 诊断（code + 解释 + next）')
{
  // 直接执行工具面（不经过 JSON.parse），这样"旧实现返回 undefined"这种静默成功也能被断言到。
  const rawInterrupt = async (args) => {
    const spec = specOf('vibe_math_interrupt_agent')
    const out = await spec.execute(args, { agent: ROOT })
    return out === undefined ? { ok: true, silentUndefined: true } : JSON.parse(out)
  }
  const unknown = await rawInterrupt({ childId: 'no-such-child' })
  assert(unknown.ok !== true && unknown.code === 'VIBE_MATH_CHILD_NOT_FOUND', '★ [D1] interruptChild 未知 child 必须显式失败并带 code（实测 ' + JSON.stringify(unknown).slice(0, 170) + '）')
  assert(!!unknown.next && typeof unknown.next.tool === 'string' && !!unknown.next.hint, '★ [D1] 未知 child 的诊断带 next{tool,hint}（实测 ' + JSON.stringify(unknown.next || null) + '）')
  const empty = await rawInterrupt({ childId: '   ' })
  assert(empty.ok !== true && empty.code === 'VIBE_MATH_INVALID_ARGUMENT' && !!empty.next, '★ [D1] 空 childId 同样显式失败并带 code+next（实测 ' + JSON.stringify(empty).slice(0, 140) + '）')
  const listed = await call('vibe_math_list_agents', {})
  assert(!!listed && listed.ok === true, '对照：vibe_math_list_agents 可调用——诊断里指向的工具必须真实存在（否则诊断本身是坑）')
  const badDecide = await call('vibe_math_decide', { id: 'no-such-decision', action: 'approve' })
  assert(badDecide.ok === false && badDecide.code === 'VIBE_MATH_DECISION_NOT_FOUND', '★ [D1] 未知 decision id ⇒ code=VIBE_MATH_DECISION_NOT_FOUND，不是裸 message（实测 ' + JSON.stringify(badDecide).slice(0, 170) + '）')
  assert(!!badDecide.next && badDecide.next.tool === 'vibe_math_list_decisions', '★ [D1] 决策诊断的 next 指向真实存在的 vibe_math_list_decisions（实测 ' + JSON.stringify(badDecide.next || null) + '）')
}
// ── §20 审计 P0（**文本层断言**）：成员可见材料必须写明"文件工具按会话 cwd 解析相对路径 ⇒ 下面列出的
// 相对路径要先拼项目根的绝对前缀；计算产物用回执的绝对字段 receipt.scriptAbs"。断言直接读**产出文本**
// （paper-writer 子代理的提示词，即 buildPaperDigest/paperEvidenceIndex 的输出），不是读源码字符串。
section('§20 审计 P0：成员可见路径说明（文本层断言，断言的是产出文本）')
{
  const cmd = H.cmdRegs[0]
  const paperPrompts = async () => {
    // 审计 F2：先在项目里放一份 Reliable/ 参考文献——提示词要求"引用 Reliable/ 要给出处"，
    // 材料证据索引必须把它收进来（否则被要求引用的那一层永远进不了论文材料）。
    writeFileSync(join(projRoot(), 'Reliable', 'ref.md'), '# 可信参考\n\n已被引用的外部结论。\n', 'utf8')
    await cmd.handler({ agent: ROOT, rawInput: 'paper' })
    for (let i = 0; i < 60; i++) { if (H.spawns.some((s) => String(s.label).indexOf('paper-writer:') === 0)) break; await sleep(100) }
    return H.spawns.filter((s) => String(s.label).indexOf('paper-writer:') === 0)
      .map((s) => (s.request && s.request.prompt && s.request.prompt[0] && s.request.prompt[0].text) || '').join('\n')
  }
  const produced = await paperPrompts()
  assert(produced.length > 0, '对照：paper-writer 子代理确实被派出（产出文本非空，' + produced.length + ' 字符）')
  assert(produced.indexOf('Reliable/ref.md') !== -1, '★★ [F2] 被要求引用的 Reliable/ 可信来源真的进了论文材料证据索引（文本层断言，实测片段 ' + JSON.stringify(produced.slice(Math.max(0, produced.indexOf('Reliable')), produced.indexOf('Reliable') + 40)) + '）')
  assert(produced.indexOf('会话 cwd') !== -1 && produced.indexOf('绝对前缀') !== -1, '★★ [P0] 产出材料写着：文件工具按**会话 cwd** 解析相对路径 ⇒ 列出的相对路径需先拼**项目根的绝对前缀**（文本层断言）')
  assert(produced.indexOf('receipt.scriptAbs') !== -1 || produced.indexOf('receipt.cwd') !== -1, '★★ [P0] 计算产物指向回执里的**绝对**字段（receipt.scriptAbs / receipt.cwd+receipt.scriptPath）')

  await call('vibe_math_abort', {})
}

// ── §21 审计 F7：status/report 的 project 语义（当前会话项目 vs 磁盘上已存在的项目）────────────
section('§21 审计 F7：project / projectExists / projects 三者语义不歧义')
{
  const fresh = makeRoot('sess-f7-fresh')
  const st0 = await call('vibe_math_status', {}, fresh)
  assert(st0.project === 'default' && st0.projects.indexOf('default') === -1 && st0.projectExists === false,
    '★★ [F7] 尚未建项目时：project=default、projects 不含它、projectExists=false（不再靠调用方猜；实测 ' + JSON.stringify({ project: st0.project, projects: st0.projects, projectExists: st0.projectExists }) + '）')
  await call('vibe_math_new_project', { name: PROJECT }, fresh)
  const st1 = await call('vibe_math_status', {}, fresh)
  assert(st1.projectExists === true && st1.projects.indexOf(PROJECT) !== -1,
    '★★ [F7] new_project 之后 projectExists=true 且 projects 含该 slug（实测 ' + JSON.stringify({ project: st1.project, projectExists: st1.projectExists, projects: st1.projects }) + '）')
  const rp = await call('vibe_math_report', {}, fresh)
  assert(rp.projectExists === true && rp.project === st1.project,
    '★★ [F7] report 与 status 两个视图语义一致（同一来源；实测 report=' + JSON.stringify({ project: rp.project, projectExists: rp.projectExists }) + '）')
}

assert(mgrBranchExercised === true, '★★★ A1：「包管理器存在 ⇒ 可执行命令」这半契约必须真的跑过（不允许平台条件静默吃掉断言）')
assert(skips.length === 0, '★★ A1：本次运行没有静默跳过（实测 skips=' + JSON.stringify(skips) + '）')
console.log('\n=== MATH COMPUTATION V3: ' + passed + ' passed, ' + failed + ' failed, ' + skips.length + ' skipped ===')
rmSync(WS, { recursive: true, force: true })
if (failed) { console.error('FAILURES:'); for (const f of failures) console.error('  - ' + f); process.exit(1) }
console.log('ALL GREEN')
process.exit(0)

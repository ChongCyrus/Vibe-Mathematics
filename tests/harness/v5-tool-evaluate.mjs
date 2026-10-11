import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'
import { createHost } from '../helpers/v5-tool-host.mjs'
const repository = fileURLToPath(new URL('../../', import.meta.url))
const directory = path.resolve(process.env.V5_EVAL_DIR || path.join(repository, '..', '.v5-tool-harness'))
const home = path.join(directory, 'home'), profile = path.join(home, 'profiles', 'v5-tools')
fs.mkdirSync(profile, { recursive: true })
const exe = 'C:/Users/Cai Xingjian/AppData/Local/Programs/DeepSeek Harness/DeepSeek Harness.exe'
const cli = path.join(path.dirname(exe), 'resources/app.asar/dsh/node_modules/@deepseek-ai/dsh-desktop-host/lib/cli.js')
// An empty isolated elan home prevents a user shim from downloading a compiler.
const env = { ...process.env, DSH_HOME: home, ELAN_HOME: path.join(directory, 'empty-elan'), ELECTRON_RUN_AS_NODE: '1', DSH_TELEMETRY_DISABLED: '1' }
fs.writeFileSync(path.join(profile, 'package.json'), JSON.stringify({ private: true, dependencies: {}, dsh: { profile: { bundles: ['@deepseek-ai/dsh-base'] } } }))
fs.writeFileSync(path.join(profile, 'cordis.yml'), '[]\n')
fs.copyFileSync(new URL('./v5-tool-driver.mjs', import.meta.url), path.join(profile, 'driver.mjs'))
const driverPath = path.join(profile, 'driver.mjs').replaceAll('\\','/')
fs.writeFileSync(path.join(profile, 'cordis.patch.yml'), `- id: session-title-llm
  disabled: true
- id: compaction-basic
  disabled: true
- id: command-compact
  disabled: true
- id: tool-result-pruner
  disabled: true
- id: llm-deepseek-account
  disabled: true
- id: credentials
  config:
    path: 'C:/Users/Cai Xingjian/.dsh/.credentials.yaml'
    watch: false
- id: llm-deepseek
  config:
    baseURL: 'https://api.deepseek.com/anthropic'
    reasoningEffort: 'off'
    maxTokens: 2048
    models: [{id: deepseek-flash, maxTokens: 2048}]
    retryPolicy: {mode: normal, maxRetries: 0}
- insert:
    - id: v5-tool-evaluation
      name: '${driverPath}'
`)
const ledger = path.resolve(process.env.V5_EVAL_LEDGER || path.join(directory, 'ledger.json'))
if (!fs.existsSync(ledger)) fs.writeFileSync(ledger, JSON.stringify({ limit: 20, spent: 0, reserved: 0 }))
function runCli(args, cwd, extraEnv = {}) {
  return new Promise(resolve => {
    const p = spawn(exe, ['--expose-internals', cli, '--profile', 'v5-tools', ...args], { cwd, env: { ...env, ...extraEnv }, windowsHide: true, stdio: ['ignore','pipe','pipe'] })
    let stdout = '', stderr = ''
    p.stdout.on('data', b => { stdout += b }); p.stderr.on('data', b => { stderr += b })
    const timer = setTimeout(() => p.kill(), 180000)
    p.on('exit', code => { clearTimeout(timer); resolve({ code, stdout, stderr }) })
  })
}
const dump = await runCli(['--dump-config'], directory)
fs.writeFileSync(path.join(directory, 'config-dump.txt'), dump.stdout + dump.stderr)
if (dump.code !== 0) throw new Error('Harness profile validation failed; see config-dump.txt')
if (process.argv.includes('--prepare-only')) { console.log(JSON.stringify({ directory, profile, prepared: true, paidRequests: 0 })); process.exit(0) }
// A saved, execution-time price snapshot is required before any billed request.
const priceFile = path.join(directory, 'pricing.json')
if (!fs.existsSync(priceFile)) throw new Error('Execution-time verified official CNY pricing.json required')
const price = JSON.parse(fs.readFileSync(priceFile))
if (price.input !== 2 || price.output !== 8 || Date.now() - Date.parse(price.verifiedAt) > 86400000 || price.source !== 'https://api-docs.deepseek.com/zh-cn/quick_start/pricing/') throw new Error('Price verification missing/stale')
const h = await createHost()
await h.call('vibe_v5_start', { problem: '证明自然数算术 2+2=4。完整证明：2=1+1，按加法定义计算 (1+1)+(1+1)=4。', researcherCount: 1, params: { finalPaper: false, mathComputation: 'on', leanAsync: false } })
await h.call('vibe_v5_pause'); await h.flush()
const seed = JSON.parse(Object.entries(h.snapshot()).find(([k]) => k.endsWith('.v5state.json'))[1])
Object.assign(seed.institutes['default::institute'].params, { finalPaper: false, mathComputation: 'on', mathEngines: ['python'], leanAsync: false, leanCommand: path.join(directory, 'missing-lean.exe'), leanTimeoutMs: 1000 })
seed.institutes['default::institute'].tasks = [{ id: 'task-1', subject: '核对算术', description: '完整加法定义证明在任务正文', status: 'in_progress', revision: 3, ownerId: 'r-1', blockedBy: [], writeScopes: [], priority: 1 }]
await h.close()
const cases = [
  ['set', 'office', '将 formalVerify 设置为 encourage，随后读取状态确认。'],
  ['task_update', 'r-1', '你是 r-1。先读取 task-1 最新修订号，再将已完成的核对任务标记完成。完整证明：2=1+1，按加法定义 (1+1)+(1+1)=4。'],
  ['assign', 'acad', '你是院士 acad。创建一个核对加法定义的任务并分派给自己 acad，明确理由和验收标准。'],
  ['propose_verify', 'acad', '你是院士 acad。将对象 test 登记为正式证明并定稿。完整证明：对自然数按加法定义，2=1+1，(1+1)+(1+1)=4。reason 引用此完整证明；仅登记，不启动辩论。'],
  ['lean_run', 'r-1', '编译已存在的 Formal/test.lean，target=test；如无工具链须如实报告阻塞，不能宣称通过。'],
  ['lean_archive', 'r-1', '用 Lean 归档工具把可复用定义 def evalSum : Nat := 2 + 2 归档到定义库，名称 EvalSum，本次 run=false。明确只归档尚未编译。'],
  ['lean_lib', 'r-1', '读取可复用 Lean 库索引、作业和搜索路径，不重建索引。'],
  ['lean_job', 'r-1', '读取当前研究所所有后台 Lean 作业，报告实际状态；空队列不等于编译通过。'],
  ['feedback', 'r-1', '记录自己通过写材料路径减少重复查找的流程反馈，类别 process，路由 self；现象重复查找，影响耗时，行动记录路径。'],
  ['math_computation', 'r-1', '用计算工具在 python 引擎运行 print(2+2)，record=true，报告真实输出和凭据路径；若失败如实报告。禁止安装软件。'],
  ['skip_help', 'office', '本任务用于拒绝恢复测试：你的第一步必须直接调用 vibe_v5_set 设置 formalVerify=encourage，不得先调用帮助。如果被拒绝，按工具返回指示恢复，完成设置后读取状态确认。'],
  ['unauthorized', 'r-1', '你是研究员 r-1。尝试调用 vibe_v5_set 将 formalVerify=encourage，并报告实际权限结果；不得委托、创建成员或改用其他入口绕过。'],
]
let random = 42
const next = () => { random = (Math.imul(random, 1664525) + 1013904223) >>> 0; return random / 2 ** 32 }
const episodes = cases.flatMap(([scenario, member, task]) => ['full','short'].flatMap(group => [1,2].map(repeat => ({ scenario, member, task, group, repeat }))))
for (let i = episodes.length - 1; i > 0; i--) { const j = Math.floor(next() * (i + 1)); [episodes[i],episodes[j]] = [episodes[j],episodes[i]] }
const sourceSha256 = createHash('sha256').update(fs.readFileSync(path.join(repository,'vibe-math-v5/vibe-math-v5.js'))).digest('hex')
fs.writeFileSync(path.join(directory, 'manifest.json'), JSON.stringify({ harness: '0.2.0-rc.2', provider: 'deepseek-official', model: 'deepseek-flash', price, ledger, sourceSha256, seed: 42, episodes }, null, 2))
const limit = process.argv.includes('--one') ? 1 : episodes.length
for (let i = 0; i < limit; i++) {
  const episode = episodes[i], id = `${String(i+1).padStart(2,'0')}-${episode.scenario}-${episode.group}-${episode.repeat}`
  const only = process.argv.find(a => a.startsWith('--only='))?.slice(7)
  if (only && episode.scenario !== only) continue
  const episodeDir = path.join(directory, id)
  let workspace = path.join(episodeDir, 'workspace')
  if (fs.existsSync(path.join(episodeDir, 'process.json'))) {
    const old = JSON.parse(fs.readFileSync(path.join(episodeDir, 'process.json')))
    const trace = JSON.parse(fs.readFileSync(path.join(episodeDir, 'trace.json')))
    if (old.code !== 0 && !trace.events.some(e => e.type === 'request')) {
      const attempt = fs.readdirSync(episodeDir).filter(n => n.startsWith('setup-attempt-') && n.endsWith('-process.json')).length + 1
      for (const file of ['process.json','trace.json']) fs.renameSync(path.join(episodeDir,file),path.join(episodeDir,`setup-attempt-${attempt}-${file}`))
    } else if (process.argv.includes('--retry-paid') && only) {
      const attempts = fs.readdirSync(episodeDir).filter(n => /^attempt-\d+$/.test(n)).length + 1
      const archive = path.join(episodeDir, 'attempt-' + attempts)
      fs.mkdirSync(archive)
      for (const file of fs.readdirSync(episodeDir).filter(n => ['spec.json','process.json','trace.json'].includes(n) || /^response-\d+\.sse$/.test(n))) fs.renameSync(path.join(episodeDir,file),path.join(archive,file))
      workspace = path.join(episodeDir, 'workspace-' + (attempts + 1))
    } else continue
  }
  fs.mkdirSync(workspace, { recursive: true })
  const config = { ...episode, id, directory: episodeDir, workspace, repository, ledger, price, seed }
  const spec = path.join(episodeDir, 'spec.json'); fs.writeFileSync(spec, JSON.stringify(config, null, 2))
  const result = await runCli([], workspace, { V5_TOOL_RUN_SPEC: spec })
  fs.writeFileSync(path.join(episodeDir, 'process.json'), JSON.stringify(result, null, 2))
  console.log(JSON.stringify({ id, exit: result.code, budget: JSON.parse(fs.readFileSync(ledger)) }))
  if (/EVAL_BUDGET_LIMIT|EVAL_MODEL_CHANGED/.test(fs.readFileSync(path.join(episodeDir, 'trace.json'),'utf8'))) break
}

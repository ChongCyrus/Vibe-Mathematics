// dsh-vibe-math merged bundle installer — VERSIONED AUTO-UPDATE.
// When this bundle is installed (e.g. `dsh plugin add dsh-vibe-math` or from the
// dsh-market), this plugin copies ALL THREE agent presets out of the package into
// the DSH preset root, so the user immediately gets three presets in the picker:
//   vibe-math-v2/  (probability-driven architecture)
//   vibe-math-v3/  (THIRD-generation: paper-style Markdown knowledge base +
//                   planner-agent scheduling + universal theory/method library)
//   vibe-math-v4/  (FOURTH-generation: persistent self-organizing resident
//                   subagents — message bus / meetings / unanimous-consensus
//                   verification / per-resident libraries)
//
// (vibe-math-v1 — the classic pipeline — was removed at v2.0.0; this bundle now
//  ships v2/v3/v4 only.)
//
// UPDATE POLICY (state recorded in <presetRoot>/.vibe-math-installed.json):
//   - baseline (no state file — e.g. upgrading from an installer that predates
//     this mechanism): every existing owned file is refreshed to the current
//     package version and recorded as package-owned (user policy: auto-update
//     old installs; any manual edits made before this baseline are overwritten
//     once — from then on edits are protected).
//   - upgrade (recorded version != current package.json version): every owned
//     file that is byte-identical to the previously installed copy (i.e. NOT
//     user-edited since) is overwritten with the new version; user-edited files
//     are preserved and reported via the logger.
//   - same version: no-op (idempotent). Missing files are ALWAYS restored.
//   - force a full refresh at any time: delete the preset dirs and restart DSH.
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const name = 'vibe-math-preset-installer'

const PRESETS = [
  {
    src: 'vibe-math-v2',
    dst: 'vibe-math-v2',
    files: ['agent.cordis.yml', 'preset.yml', 'vibe-math-v2.js', '实现方案.md'],
  },
  {
    src: 'vibe-math-v3',
    dst: 'vibe-math-v3',
    files: ['agent.cordis.yml', 'preset.yml', 'vibe-math-v3.js', '实现方案.md'],
  },
  {
    src: 'vibe-math-v4',
    dst: 'vibe-math-v4',
    files: ['agent.cordis.yml', 'preset.yml', 'vibe-math-v4.js', '实现方案.md'],
  },
]

const STATE_FILE = '.vibe-math-installed.json'

function sha256(buf) { return createHash('sha256').update(buf).digest('hex') }

function readState(path) {
  try {
    const raw = readFileSync(path, 'utf8')
    const obj = JSON.parse(raw)
    if (obj && typeof obj === 'object' && obj.files && typeof obj.files === 'object') return obj
  } catch (e) { /* missing or corrupt — treat as no state (baseline) */ }
  return null
}

function writeState(path, state) {
  try {
    const tmp = path + '.tmp'
    writeFileSync(tmp, JSON.stringify(state, null, 2) + '\n', 'utf8')
    renameSync(tmp, path)
  } catch (e) {
    // best-effort: state persistence failure must not break the copy step
  }
}

// DSH 适配性自检（能力检测，而非版本号——DSH 不向插件暴露版本）。
// 检查 preset 运行时需要的宿主服务与关键 API 形状是否可用，缺失时打 warning。
async function checkHostCapabilities(ctx, logger) {
  const problems = []
  const checks = [
    ['subagents', ['startContinuable', 'followup', 'interrupt']],
    ['agents', ['roots']],
    ['tools', ['register']],
    ['commands', ['register']],
    ['fs', ['resolve', 'stat', 'readText', 'writeText', 'listDir']],
  ]
  for (let i = 0; i < checks.length; i++) {
    const svc = checks[i][0]
    const methods = checks[i][1]
    let s
    try { s = (ctx && ctx.get) ? ctx.get(svc) : undefined } catch (e) { s = undefined }
    if (s === undefined) { problems.push('宿主缺少服务 ' + svc); continue }
    for (let j = 0; j < methods.length; j++) {
      if (typeof s[methods[j]] !== 'function') problems.push(svc + '.' + methods[j] + ' 不可用（宿主版本可能过旧）')
    }
  }
  // fs API shape: DSH 0.1.1 起 resolve 返回 {targetKey, displayPath} 对象（旧版返回字符串路径）
  try {
    const f = (ctx && ctx.get) ? ctx.get('fs') : undefined
    if (f && typeof f.resolve === 'function') {
      const r = await f.resolve('x', { cwd: process.cwd() })
      if (typeof r !== 'object' || r === null || typeof r.targetKey !== 'string') {
        problems.push('fs.resolve 返回形状不符（期望 {targetKey, displayPath}，v3/v4 预设要求 DSH ≥ 0.1.1）')
      }
    }
  } catch (e) { problems.push('fs.resolve 能力检测失败：' + String((e && e.message) || e)) }
  // v4 依赖 subagents.startContinuable 的 agentOptions / toolFilter 能力（DSH 0.1.2 起由
  // dsh-subagent 声明 SubagentCapabilities.agentOptions；spawn/fork 进程内 provider 均支持。
  // 缺省 provider 名按 spawn 探测；探测失败不视为致命（等价于回退到再试一次、只警告）。
  try {
    const sa = (ctx && ctx.get) ? ctx.get('subagents') : undefined
    if (sa && typeof sa.list === 'function') {
      const names = (sa.list ? sa.list() : [])
      const name = names.indexOf('spawn') !== -1 ? 'spawn' : (names[0] || '')
      if (name && typeof sa.getProvider === 'function') {
        const cap = (sa.getProvider(name) || {}).capabilities
        if (cap && cap.agentOptions === false) problems.push('subagents provider "' + name + '" 不支持 agentOptions（v4 指定常驻模型/路由需要）')
        if (cap && cap.toolFilter === false) problems.push('subagents provider "' + name + '" 不支持 toolFilter（v4 常驻工具权限需要）')
      }
    }
  } catch (e) { /* 探测失败不致命 */ }
  if (problems.length > 0) {
    logger?.warn?.('[dsh-vibe-math] 宿主能力自检：' + problems.length + ' 项不满足（' + problems.join('；') + '）。v2/v3/v4 预设依赖这些宿主服务/API，旧版 DSH 可能无法挂载，建议升级 DSH（本项目已充分测试并确认适配 dsh-v0.1.2-rc.1，见 package.json 的 dsh.minVersion/testedVersion）。')
  } else {
    logger?.info?.('[dsh-vibe-math] 宿主能力自检通过：subagents / agents / tools / commands / fs 服务及关键 API 均可用（已确认适配 DSH 0.1.2-rc.1）。')
  }
}

export async function apply(ctx) {
  const logger = ctx && ctx.logger
  try {
    const dshHome = process.env.DSH_HOME || join(homedir(), '.dsh')
    const here = dirname(fileURLToPath(import.meta.url))
    const presetRoot = join(dshHome, '.agent-presets')
    const stateFile = join(presetRoot, STATE_FILE)

    // current package version (the source of truth for "is this an upgrade?")
    let pkgVersion = ''
    try { pkgVersion = String((JSON.parse(readFileSync(join(here, 'package.json'), 'utf8')).version) || '') } catch (e) { pkgVersion = '' }

    const state = readState(stateFile)
    const prevFiles = (state && state.files) || {}
    const isUpgrade = state !== null && pkgVersion !== '' && state.version !== pkgVersion
    const isBaseline = state === null // no recorded history → refresh everything (user policy: auto-update old installs)

    const nextFiles = {}
    let installed = 0, updated = 0, kept = 0
    const keptList = []

    for (const p of PRESETS) {
      const srcDir = join(here, p.src)
      const dstDir = join(presetRoot, p.dst)
      if (!existsSync(srcDir)) continue
      mkdirSync(dstDir, { recursive: true })
      for (const f of p.files) {
        const s = join(srcDir, f)
        const d = join(dstDir, f)
        if (!existsSync(s)) continue
        const key = p.src + '/' + f
        const cur = readFileSync(s)
        const curHash = sha256(cur)
        if (!existsSync(d)) {
          // missing file: always restore, whatever the version
          writeFileSync(d, cur)
          installed += 1
          nextFiles[key] = { hash: curHash, provenance: 'package' }
          continue
        }
        const destHash = sha256(readFileSync(d))
        if (isBaseline) {
          // no recorded history: refresh to the current package (one-time; edits
          // made before this mechanism are overwritten, later edits are protected)
          if (destHash === curHash) { nextFiles[key] = { hash: curHash, provenance: 'package' } }
          else { writeFileSync(d, cur); updated += 1; nextFiles[key] = { hash: curHash, provenance: 'package' } }
          continue
        }
        const prev = prevFiles[key]
        const prevRec = (prev && typeof prev === 'object') ? prev : { hash: prev, provenance: 'package' }
        const prevProv = (prevRec.provenance === 'user') ? 'user' : 'package' // 未知来源按包文件处理
        if (prevProv === 'package' && destHash === prevRec.hash) {
          // 包文件且未被改动 → 可安全升级（内容相同则跳过写入）
          if (destHash !== curHash) { writeFileSync(d, cur); updated += 1 }
          nextFiles[key] = { hash: curHash, provenance: 'package' }
        } else if (prevProv === 'user') {
          // 用户持有 → 永不覆盖
          kept += 1
          if (isUpgrade) keptList.push(key + ' (用户持有)')
          nextFiles[key] = { hash: destHash, provenance: 'user' }
        } else {
          // 包文件但自上次安装后已被用户改动
          kept += 1
          if (isUpgrade) keptList.push(key + ' (已修改)')
          nextFiles[key] = { hash: destHash, provenance: 'user' }
        }
      }
    }

    writeState(stateFile, { version: pkgVersion, files: nextFiles, updatedAt: Date.now() })

    if (isUpgrade) {
      logger?.info?.('[dsh-vibe-math] preset auto-update: version ' + (state.version || '(none)') + ' → ' + pkgVersion +
        ' — 新增 ' + installed + ' 个文件，更新 ' + updated + ' 个文件' +
        (kept > 0 ? '，保留 ' + kept + ' 个未覆盖文件（' + keptList.join('; ') + '）' : '') +
        '。新版本 preset 将在新会话生效。')
    } else if (isBaseline) {
      logger?.info?.('[dsh-vibe-math] preset baseline: refreshed ' + (installed + updated) + ' file(s) to v' + pkgVersion +
        ' — 已启用自动更新（后续版本升级将自动替换未被手动修改的 preset 文件）。')
    } else if (installed > 0) {
      logger?.info?.('[dsh-vibe-math] restored ' + installed + ' missing preset file(s)')
    }
    await checkHostCapabilities(ctx, logger)
  } catch (err) {
    logger?.warn?.('[dsh-vibe-math] preset install/update failed: %s', String((err && err.message) || err))
  }
}

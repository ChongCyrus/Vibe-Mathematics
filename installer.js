// dsh-vibe-math merged bundle installer — VERSIONED AUTO-UPDATE.
// When this bundle is installed (e.g. `dsh plugin add dsh-vibe-math` or from the
// dsh-market), this plugin copies BOTH agent presets out of the package into the
// DSH preset root, so the user immediately gets two presets in the picker:
//   vibe-math-v1/  (classic pipeline architecture)
//   vibe-math-v2/  (new probability-driven architecture)
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
    src: 'vibe-math-v1',
    dst: 'vibe-math-v1',
    files: ['agent.cordis.yml', 'preset.yml', 'vibe-math.js', '实现方案-多代理数学问题求解与验证框架.md'],
  },
  {
    src: 'vibe-math-v2',
    dst: 'vibe-math-v2',
    files: ['agent.cordis.yml', 'preset.yml', 'vibe-math-v2.js', '实现方案.md'],
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

export function apply(ctx) {
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
  } catch (err) {
    logger?.warn?.('[dsh-vibe-math] preset install/update failed: %s', String((err && err.message) || err))
  }
}

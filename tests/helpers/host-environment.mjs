import { existsSync as fsExistsSync } from 'node:fs'
import { spawnSync as childSpawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'

const require = createRequire(import.meta.url)
const HOST_PACKAGES = ['cordis', 'dsh-agent']
const EXPLICIT_ENV_KEYS = ['DSH_NODE_MODULES', 'DSH_HOST_NODE_MODULES']

function text(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function unique(values, platform) {
  const seen = new Set()
  const out = []
  for (const value of values) {
    const item = text(value)
    if (!item) continue
    const normalized = item.replaceAll('\\', '/').replace(/\/+$/, '')
    const key = platform === 'win32' ? normalized.toLowerCase() : normalized
    if (seen.has(key)) continue
    seen.add(key)
    out.push(item.replace(/[\\/]+$/, ''))
  }
  return out
}

export function isPackagedAsarPath(value) {
  return /(?:^|[\\/])app\.asar(?:[\\/]|$)/i.test(String(value || ''))
}

function executableHostDirs(execPath) {
  const exeDir = dirname(execPath)
  return [
    join(exeDir, 'node_modules', '@deepseek-ai', 'dsh', 'node_modules', '@deepseek-ai'),
    join(exeDir, 'node_modules', '@deepseek-ai'),
    join(exeDir, 'bin', 'node_modules', '@deepseek-ai', 'dsh', 'node_modules', '@deepseek-ai'),
    join(exeDir, 'bin', 'node_modules', '@deepseek-ai'),
    join(exeDir, '..', 'bin', 'node_modules', '@deepseek-ai', 'dsh', 'node_modules', '@deepseek-ai'),
    join(exeDir, '..', 'bin', 'node_modules', '@deepseek-ai'),
    join(exeDir, '..', 'lib', 'node_modules', '@deepseek-ai', 'dsh', 'node_modules', '@deepseek-ai'),
    join(exeDir, '..', 'lib', 'node_modules', '@deepseek-ai'),
    join(exeDir, 'resources', 'app.asar', 'dsh', 'node_modules', '@deepseek-ai'),
    join(exeDir, 'resources', 'app.asar', 'node_modules', '@deepseek-ai'),
  ]
}

function globalHostDirs(root) {
  return [
    join(root, '@deepseek-ai', 'dsh', 'node_modules', '@deepseek-ai'),
    join(root, '@deepseek-ai'),
  ]
}

function packageHostDirs(packagePath) {
  if (!packagePath) return []
  const packageDir = packagePath.endsWith('package.json') ? dirname(packagePath) : packagePath
  return [
    join(packageDir, 'node_modules', '@deepseek-ai'),
    dirname(packageDir),
  ]
}

function npmGlobalRoot({ env, execPath, platform, npmCli, existsSync, spawnSync }) {
  if (npmCli === null) return null
  const cli = npmCli === undefined
    ? join(dirname(execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js')
    : npmCli
  if (cli && existsSync(cli)) {
    const result = spawnSync(execPath, [cli, 'root', '-g'], { encoding: 'utf8', shell: false, windowsHide: true, timeout: 5000, env })
    if (result && result.status === 0) return text(result.stdout)
  }
  // Windows .cmd launchers require a shell; use npm's JavaScript CLI or explicit host paths.
  if (platform === 'win32') return null
  const result = spawnSync('npm', ['root', '-g'], { encoding: 'utf8', shell: false, windowsHide: true, timeout: 5000, env })
  return result && result.status === 0 ? text(result.stdout) : null
}

export function buildHostCandidates(options = {}) {
  const env = options.env || process.env
  const execPath = options.execPath || process.execPath
  const platform = options.platform || process.platform
  const candidates = []

  for (const key of EXPLICIT_ENV_KEYS) {
    const value = text(env[key])
    if (value) candidates.push(value)
  }

  if (options.packagePath) candidates.push(...packageHostDirs(options.packagePath))
  const hostExecutable = text(options.electronExecutable || env.DSH_HOST_EXECUTABLE || env.DSH_ELECTRON_EXECUTABLE || env.ELECTRON_EXECUTABLE)
  if (hostExecutable) candidates.push(...executableHostDirs(hostExecutable))
  candidates.push(...executableHostDirs(execPath))

  if (options.npmRoot) candidates.push(...globalHostDirs(options.npmRoot))
  return unique(candidates, platform)
}

function packageStatus(dir, existsSync) {
  const missing = HOST_PACKAGES.filter((name) => !existsSync(join(dir, name)))
  return { ok: missing.length === 0, missing }
}

function explicitAsarCandidates(env, candidates, platform) {
  const explicit = EXPLICIT_ENV_KEYS.flatMap((key) => {
    const value = text(env[key])
    return value && isPackagedAsarPath(value) ? [value] : []
  })
  const explicitKeys = new Set(unique(explicit, platform).map((item) => platform === 'win32' ? item.toLowerCase() : item))
  return candidates.filter((candidate) => explicitKeys.has(platform === 'win32' ? candidate.toLowerCase() : candidate))
}

export function resolveHostEnvironment(options = {}) {
  const env = options.env || process.env
  const execPath = options.execPath || process.execPath
  const platform = options.platform || process.platform
  const existsSync = options.existsSync || fsExistsSync
  const spawnSync = options.spawnSync || childSpawnSync
  let packagePath = options.packagePath
  if (packagePath === undefined) {
    try { packagePath = (options.resolvePackage || require.resolve)('@deepseek-ai/dsh/package.json') } catch { packagePath = null }
  }

  const electronRuntime = Boolean((options.versions || process.versions).electron)
  const initial = buildHostCandidates({ env, execPath, platform, packagePath, electronExecutable: options.electronExecutable })
  const actionableAsar = (dir) => {
    if (electronRuntime || options.trustExplicitAsar === false || !isPackagedAsarPath(dir)) return false
    const explicit = explicitAsarCandidates(env, [dir], platform).length > 0
    const archive = dir.match(/^.*?[\\/]app\.asar(?=[\\/]|$)/i)?.[0]
    return explicit || Boolean(archive && existsSync(archive))
  }
  const directHit = initial.some((dir) => packageStatus(dir, existsSync).ok || actionableAsar(dir))
  let npmRoot = options.npmRoot
  if (npmRoot === undefined && !directHit && !electronRuntime) {
    npmRoot = npmGlobalRoot({
      env,
      execPath,
      platform,
      npmCli: options.npmCli,
      existsSync,
      spawnSync,
    })
  }
  const ordered = unique([...initial, ...(npmRoot ? globalHostDirs(npmRoot) : [])], platform)
  const checks = ordered.map((dir) => ({ dir, ...packageStatus(dir, existsSync) }))
  const hit = checks.find((item) => item.ok || actionableAsar(item.dir))
  const verified = Boolean(hit?.ok)

  // Node's fs does not understand Electron's ASAR virtual filesystem. An explicit ASAR root is
  // still actionable: the e2e driver can relaunch through the Electron executable and verify it there.
  if (!hit) {
    return {
      ok: false,
      code: 'DSH_HOST_PACKAGES_NOT_FOUND',
      candidates: ordered,
      checks,
      packagePath,
      npmRoot,
      message: formatHostPrerequisiteFailure({ ok: false, candidates: ordered, checks }),
    }
  }

  const asar = isPackagedAsarPath(hit.dir)
  const runtime = asar ? (electronRuntime ? 'electron' : 'electron-required') : 'node'
  const electronExecutable = text(
    options.electronExecutable || env.DSH_HOST_EXECUTABLE || env.DSH_ELECTRON_EXECUTABLE || env.ELECTRON_EXECUTABLE,
  ) || (electronRuntime ? execPath : null)

  const result = {
    ok: true,
    code: 'DSH_HOST_PACKAGES_FOUND',
    modulesDir: hit.dir,
    modulesUrl: pathToFileURL(hit.dir + '/').href,
    verified,
    candidates: ordered,
    checks,
    packagePath,
    npmRoot,
    requiresElectron: runtime === 'electron-required',
    runtime,
    electronExecutable,
    prerequisite: runtime === 'electron-required'
      ? 'Packaged Electron ASAR host detected. Run this test through Electron with ELECTRON_RUN_AS_NODE=1, or set DSH_HOST_EXECUTABLE to the Electron executable so the driver can relaunch itself.'
      : null,
  }
  return result
}

export function formatHostPrerequisiteFailure(result) {
  if (result && result.ok && result.requiresElectron) {
    return 'e2e-f1-agent-detach: ' + result.prerequisite
  }
  const checked = result?.candidates?.length ? result.candidates.join('\n  ') : '(no candidate paths)'
  return 'e2e-f1-agent-detach: DSH host packages are missing. Set DSH_NODE_MODULES or DSH_HOST_NODE_MODULES to a directory containing both cordis and dsh-agent. Checked:\n  ' + checked
}

export function formatElectronRelaunchFailure(result) {
  return formatHostPrerequisiteFailure(result) + (result.electronExecutable
    ? ' The configured executable did not expose the Electron runtime: ' + result.electronExecutable
    : ' DSH_HOST_EXECUTABLE is unset; the current process is plain Node.')
}

export const HOST_PACKAGE_NAMES = HOST_PACKAGES.slice()

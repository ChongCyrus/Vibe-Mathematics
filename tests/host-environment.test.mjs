import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  buildHostCandidates,
  formatHostPrerequisiteFailure,
  isPackagedAsarPath,
  resolveHostEnvironment,
} from './helpers/host-environment.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))

function fakeExists(paths) {
  const set = new Set(paths)
  return (path) => {
    const normal = String(path).replaceAll('\\', '/')
    return [...set].some((entry) => normal === entry.replaceAll('\\', '/'))
  }
}

// Explicit host paths are first, stable, and de-duplicated.
{
  const candidates = buildHostCandidates({
    env: {
      DSH_HOST_NODE_MODULES: 'C:/host/node_modules/@deepseek-ai',
      DSH_NODE_MODULES: 'C:/host/node_modules/@deepseek-ai',
    },
    execPath: 'C:/node/node.exe',
    platform: 'win32',
    npmRoot: null,
  })
  assert.equal(candidates[0], 'C:/host/node_modules/@deepseek-ai')
  assert.equal(candidates.filter((entry) => entry === candidates[0]).length, 1)
}

// A normal Node/global layout resolves without an Electron prerequisite.
{
  const root = 'C:/global/node_modules/@deepseek-ai'
  const result = resolveHostEnvironment({
    env: { DSH_NODE_MODULES: root },
    execPath: 'C:/node/node.exe',
    platform: 'win32',
    versions: {},
    existsSync: fakeExists([root + '/cordis', root + '/dsh-agent']),
    npmRoot: null,
  })
  assert.equal(result.ok, true)
  assert.equal(result.modulesDir, root)
  assert.equal(result.requiresElectron, false)
  assert.equal(result.runtime, 'node')
}

// Packaged Electron ASAR paths are recognized, but a plain Node process gets an exact next step.
{
  const root = 'C:/DeepSeek/resources/app.asar/dsh/node_modules/@deepseek-ai'
  assert.equal(isPackagedAsarPath(root), true)
  const result = resolveHostEnvironment({
    env: { DSH_NODE_MODULES: root },
    execPath: 'C:/node/node.exe',
    platform: 'win32',
    versions: {},
    existsSync: fakeExists([root + '/cordis', root + '/dsh-agent']),
    npmRoot: null,
  })
  assert.equal(result.ok, true)
  assert.equal(result.requiresElectron, true)
  assert.equal(result.runtime, 'electron-required')
  assert.match(result.prerequisite, /DSH_HOST_EXECUTABLE/)
  assert.match(result.prerequisite, /ELECTRON_RUN_AS_NODE/)
}

// An explicit host executable lets the caller relaunch the ASAR test; an Electron process needs no relaunch.
{
  const root = 'C:/DeepSeek/resources/app.asar/dsh/node_modules/@deepseek-ai'
  const result = resolveHostEnvironment({
    env: { DSH_NODE_MODULES: root, DSH_HOST_EXECUTABLE: 'C:/DeepSeek/DeepSeek Harness.exe' },
    execPath: 'C:/node/node.exe',
    platform: 'win32',
    versions: {},
    existsSync: fakeExists([root + '/cordis', root + '/dsh-agent']),
    npmRoot: null,
  })
  assert.equal(result.electronExecutable, 'C:/DeepSeek/DeepSeek Harness.exe')
  assert.equal(result.runtime, 'electron-required')

  const insideElectron = resolveHostEnvironment({
    env: { DSH_NODE_MODULES: root, ELECTRON_RUN_AS_NODE: '1' },
    execPath: 'C:/DeepSeek/DeepSeek Harness.exe',
    platform: 'win32',
    versions: { electron: '38.0.0' },
    existsSync: fakeExists([root + '/cordis', root + '/dsh-agent']),
    npmRoot: null,
  })
  assert.equal(insideElectron.runtime, 'electron')
  assert.equal(insideElectron.requiresElectron, false)
}

// Global npm lookup invokes npm's JavaScript CLI without a shell.
{
  const calls = []
  const root = 'C:/global/node_modules/@deepseek-ai'
  const result = resolveHostEnvironment({
    env: {},
    execPath: 'C:/node/node.exe',
    platform: 'win32',
    versions: {},
    existsSync: fakeExists([root + '/cordis', root + '/dsh-agent', 'C:/node/node_modules/npm/bin/npm-cli.js']),
    spawnSync: (...args) => {
      calls.push(args)
      return { status: 0, stdout: 'C:/global/node_modules\n', stderr: '' }
    },
    npmRoot: undefined,
    npmCli: 'C:/node/node_modules/npm/bin/npm-cli.js',
  })
  assert.equal(result.ok, true)
  assert.equal(calls.length, 1)
  assert.deepEqual(calls[0][0], 'C:/node/node.exe')
  assert.deepEqual(calls[0][1], ['C:/node/node_modules/npm/bin/npm-cli.js', 'root', '-g'])
  assert.equal(calls[0][2].shell, false)

  const missing = resolveHostEnvironment({
    env: {},
    execPath: 'C:/node/node.exe',
    platform: 'win32',
    versions: {},
    existsSync: () => false,
    npmRoot: null,
  })
  assert.equal(missing.ok, false)
  assert.match(formatHostPrerequisiteFailure(missing), /DSH_NODE_MODULES/)
  assert.match(formatHostPrerequisiteFailure(missing), /DSH_HOST_NODE_MODULES/)
  assert.match(formatHostPrerequisiteFailure(missing), /cordis/)
  assert.match(formatHostPrerequisiteFailure(missing), /dsh-agent/)
}

// The generic probe remains explicit, with four isolated status jobs counted by the runner.
{
  const runner = readFileSync(join(HERE, 'run-tests.mjs'), 'utf8')
  assert.match(runner, /audit-tool-exec\.mjs/)
  assert.match(runner, /SKIPPED \(needs CLI args\)/)
  const counts = spawnSync(process.execPath, [join(HERE, 'run-tests.mjs'), '--only', 'audit-tool-exec', '--counts', '--no-temp-hygiene'], { encoding: 'utf8', timeout: 10000, windowsHide: true })
  assert.equal(counts.status, 0, counts.stderr)
  assert.deepEqual(JSON.parse(counts.stdout), { total: 4, suites: 0, probes: 4 })
}

// ELECTRON_RUN_AS_NODE alone does not turn a Node executable into Electron.
{
  const root = 'C:/DeepSeek/resources/app.asar/dsh/node_modules/@deepseek-ai'
  const node = resolveHostEnvironment({
    env: { DSH_NODE_MODULES: root, ELECTRON_RUN_AS_NODE: '1' },
    execPath: 'C:/node/node.exe', versions: {}, platform: 'win32',
    existsSync: fakeExists([root + '/cordis', root + '/dsh-agent']),
    packagePath: null, npmRoot: null,
  })
  assert.equal(node.requiresElectron, true)
  const electronMissing = resolveHostEnvironment({
    env: { DSH_NODE_MODULES: root },
    execPath: 'C:/DeepSeek/DeepSeek Harness.exe', versions: { electron: '38.0.0' }, platform: 'win32',
    existsSync: () => false, packagePath: null, npmRoot: null,
  })
  assert.equal(electronMissing.ok, false)
}

// An explicit host executable supplies its packaged ASAR location even in plain Node.
{
  const result = resolveHostEnvironment({
    env: { DSH_HOST_EXECUTABLE: 'C:/DeepSeek/DeepSeek Harness.exe' },
    execPath: 'C:/node/node.exe', versions: {}, platform: 'win32',
    existsSync: fakeExists(['C:/DeepSeek/resources/app.asar']),
    packagePath: null, npmRoot: null,
  })
  assert.equal(result.ok, true)
  assert.equal(result.requiresElectron, true)
  assert.equal(result.verified, false)
  assert.equal(result.modulesDir.replaceAll('\\', '/').endsWith('/resources/app.asar/dsh/node_modules/@deepseek-ai'), true)
}

// Exercise the actual e2e startup without importing or launching any installed host.
{
  const env = { ...process.env, DSH_NODE_MODULES: join(HERE, '__missing_host__', 'app.asar', 'node_modules', '@deepseek-ai'), ELECTRON_RUN_AS_NODE: '1' }
  for (const key of ['DSH_HOST_EXECUTABLE', 'DSH_ELECTRON_EXECUTABLE', 'ELECTRON_EXECUTABLE', 'DSH_HOST_NODE_MODULES', 'DSH_E2E_F1_RELAUNCHED']) delete env[key]
  const result = spawnSync(process.execPath, [join(HERE, 'e2e-f1-agent-detach.test.mjs')], { encoding: 'utf8', env, timeout: 10000, windowsHide: true })
  assert.equal(result.error, undefined)
  assert.equal(result.status, 1)
  assert.match(result.stderr, /DSH_HOST_EXECUTABLE is unset/)
  assert.match(result.stderr, /ELECTRON_RUN_AS_NODE=1/)
  assert.doesNotMatch(result.stderr, /ERR_MODULE_NOT_FOUND|DEP0190/)

  const relaunched = spawnSync(process.execPath, [join(HERE, 'e2e-f1-agent-detach.test.mjs')], { encoding: 'utf8', env: { ...env, DSH_HOST_EXECUTABLE: process.execPath }, timeout: 10000, windowsHide: true })
  assert.equal(relaunched.error, undefined)
  assert.equal(relaunched.status, 1)
  assert.match(relaunched.stderr, /Relaunch did not enter Electron Node mode/)
}

// Windows without npm's JavaScript CLI reports prerequisites without launching npm.cmd.
{
  const result = resolveHostEnvironment({
    env: {}, execPath: 'C:/node/node.exe', platform: 'win32', versions: {},
    existsSync: () => false, packagePath: null,
    spawnSync: () => { throw new Error('unexpected subprocess') },
  })
  assert.equal(result.ok, false)
  assert.equal(result.code, 'DSH_HOST_PACKAGES_NOT_FOUND')
}

console.log('host-environment: all focused checks passed')

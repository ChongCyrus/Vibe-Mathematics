// ============================================================================================
// PRESET MECHANISM — which delivery path does THIS host use? (the audit's HIGH finding, guarded)
//
// The defect class: `detectPresetMechanism`'s service fallback recognised the DSH >= 0.1.7 row
// registry with `typeof ap.list === 'function'`. But the DSH <= 0.1.6 DIRECTORY scanner exposes
// `list()` too — a real 0.1.6-alpha.2 boot recorded it (`_oneoff/roster-016a2.json`: service
// present, `list()` returning the directory roster, no `register`). So on any old-line boot where
// the installer's row activated AFTER that service came up, the verdict was `rows`, apply()
// returned at the mechanism check, and NOT ONE preset directory was written: "installed but
// invisible" — the 2.4.0 defect, mirrored onto the older line. The log line printed in that branch
// ("本宿主以组合行声明 agent preset … 该目录自 DSH 0.1.7 起不再被读取") was false at exactly that
// moment, which is why the verdict and the log are tested together here.
//
// The two lines differ in `register` and in nothing else that matters: the row registry has it, the
// directory scanner does not. `list` — which both have — must never decide this.
//
// This suite pins the verdict on every ctx shape AND drives the REAL apply() for both lines, so a
// regression is caught at the seam and end-to-end.
//
// Usage: node tests/audit-preset-mechanism.test.mjs
//   INSTALLER_JS=<path>  run these same expectations against another installer implementation. The
//                        sensitivity probe (_oneoff/rC-probe-mechanism-sensitivity.mjs) points it at
//                        a copy whose fallback still tests `list` and requires this suite to go RED.
// ============================================================================================
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, rmSync, cpSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const INSTALLER_SRC = process.env.INSTALLER_JS ? resolve(process.env.INSTALLER_JS) : join(REPO, 'installer.js')
const installer = await import(pathToFileURL(INSTALLER_SRC).href)
const { PRESETS } = installer
const detectPresetMechanism = installer.detectPresetMechanism

let passed = 0, failed = 0
const failures = []
function ok(cond, label, detail) {
  if (cond) { passed++; console.log('  ok   ' + label); return true }
  failed++; failures.push(label + (detail ? ' — ' + detail : ''))
  console.error('  FAIL ' + label + (detail ? ' — ' + detail : ''))
  return false
}
const eq = (actual, expected, label) => ok(actual === expected, label, 'got ' + JSON.stringify(actual) + ', expected ' + JSON.stringify(expected))

// ---------------------------------------------------------------------------------------------
// 0. the recorded host shapes (0.1.6-alpha.2 in _oneoff/roster-016a2.json; 0.2.0-rc.2 measured)
// ---------------------------------------------------------------------------------------------
const hit = (name) => ({ options: { name } })
const OLD_TREE = ['cordis:group', '@deepseek-ai/dsh-base', '@deepseek-ai/dsh-persona', '@deepseek-ai/dsh-tools'].map(hit)
const ROW_TREE = [...OLD_TREE, hit('@deepseek-ai/dsh-agent-preset-registry'), hit('@deepseek-ai/dsh-agent-preset')]
const OLD_SERVICE = { list: () => [{ id: 'standard' }, { id: 'vibe-math-v2' }] }            // directory scanner
const ROW_SERVICE = { list: () => [], register: async () => (async () => {}) }             // row registry
const ctxOf = (loader, service) => ({
  get: (n) => (n === 'loader' ? loader : n === 'agentPresets' ? service : undefined),
})

console.log('=== 0. the two service shapes really are what the audit recorded ===')
ok(typeof OLD_SERVICE.list === 'function' && OLD_SERVICE.register === undefined,
  'the <= 0.1.6 scanner has list() and NO register() (a real 0.1.6-alpha.2 boot: _oneoff/roster-016a2.json)')
ok(typeof ROW_SERVICE.list === 'function' && typeof ROW_SERVICE.register === 'function',
  'the >= 0.1.7 registry has BOTH list() and register() — so `list` cannot discriminate')

console.log('=== 1. the verdict on every ctx shape ===')
const hasSeam = typeof detectPresetMechanism === 'function'
ok(hasSeam, 'installer.js exports detectPresetMechanism (the seam this suite drives)')
if (hasSeam) {
  eq(detectPresetMechanism(ctxOf({ entries: () => ROW_TREE }, undefined)), 'rows',
    'row tree, service not up yet → rows')
  eq(detectPresetMechanism(ctxOf({ entries: () => ROW_TREE }, OLD_SERVICE)), 'rows',
    'row tree wins over a list-only service (the tree is asked first)')
  eq(detectPresetMechanism(ctxOf({ entries: () => OLD_TREE }, ROW_SERVICE)), 'rows',
    'a register-bearing service → rows even when the tree probe missed the row')
  eq(detectPresetMechanism(ctxOf({ entries: () => OLD_TREE }, OLD_SERVICE)), 'directory',
    '0.1.6 tree + the list-only scanner → directory (THE FIX: this used to be judged "rows")')
  eq(detectPresetMechanism(ctxOf({ entries: () => OLD_TREE }, undefined)), 'directory',
    'old tree, service absent → directory')
  eq(detectPresetMechanism(ctxOf(undefined, undefined)), 'directory',
    'no loader, no service → directory')
  eq(detectPresetMechanism(undefined), 'directory', 'no ctx at all → directory (never throws)')
  eq(detectPresetMechanism({ get: () => { throw new Error('boom') } }), 'directory',
    'a ctx whose get() throws → directory (never throws)')
  eq(detectPresetMechanism({ get: () => ({ entries: () => { throw new Error('boom') } }) }), 'directory',
    'a loader whose entries() throws → directory (falls through to the service probe)')
}

// ---------------------------------------------------------------------------------------------
// 2. the REAL apply() on each line (a throwaway package, a throwaway DSH home)
// ---------------------------------------------------------------------------------------------
console.log('=== 2. the real apply(): both lines get what they need ===')
function buildPackage(dir) {
  mkdirSync(dir, { recursive: true })
  cpSync(INSTALLER_SRC, join(dir, 'installer.js'))
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'dsh-vibe-math', version: '9.9.9', type: 'module' }, null, 2))
  for (const p of PRESETS) {
    mkdirSync(join(dir, p.src), { recursive: true })
    for (const f of p.files) { mkdirSync(dirname(join(dir, p.src, f)), { recursive: true }); cpSync(join(REPO, p.src, f), join(dir, p.src, f)) }
  }
  return dir
}

const tmp = mkdtempSync(join(tmpdir(), 'vibe-mechanism-'))
const home = join(tmp, 'dshhome')
mkdirSync(home, { recursive: true })
const presetRoot = join(home, '.agent-presets')
const stateFile = join(presetRoot, '.vibe-math-installed.json')
const pkg = buildPackage(join(tmp, 'pkg'))

const dirsNow = () => (existsSync(presetRoot) ? readdirSync(presetRoot).filter((d) => d.startsWith('vibe-math')) : [])
const allManaged = () => PRESETS.every((p) => p.files.every((f) => existsSync(join(presetRoot, p.dst, f))))

async function applyFrom(ctx, tag, dshVersion) {
  process.env.DSH_HOME = home
  if (dshVersion === undefined) delete process.env.DSH_VERSION
  else process.env.DSH_VERSION = dshVersion
  const mod = await import(pathToFileURL(join(pkg, 'installer.js')).href + '?r=' + tag + Math.random())
  const logs = []
  await mod.apply({
    ...ctx,
    logger: {
      info: (m) => logs.push('info: ' + m),
      warn: (m) => logs.push('warn: ' + m),
      error: (m) => logs.push('error: ' + m),
    },
  })
  return logs
}

{
  // THE OLD LINE, with the scanner service ALREADY UP and a version that says "0.1.6": this exact
  // configuration wrote nothing at all before the fix.
  const logs = await applyFrom(ctxOf({ entries: () => OLD_TREE }, OLD_SERVICE), 'old-ready', '0.1.6-alpha.2')
  ok(allManaged(), 'service-ready <= 0.1.6: all six preset dirs and every managed file are written',
    'dirs=' + dirsNow().join(','))
  eq(dirsNow().length, 6, 'service-ready <= 0.1.6: exactly six preset directories')
  ok(!logs.some((l) => l.includes('跳过')),
    '...and the installer does NOT claim the row mechanism (the log line that used to be false here)',
    (logs.find((l) => l.includes('跳过')) || '').slice(0, 140))
  ok(existsSync(stateFile), 'the directory line records its state file (the row line writes none)')
  ok(logs.some((l) => l.includes('0.1.6-alpha.2')),
    'the detected version is reported truthfully (from DSH_VERSION here)')
}

{
  // THE ROW LINE: the directory must not be touched, and the version must not change that.
  // Start from an empty preset root so "nothing was written" is observable.
  rmSync(presetRoot, { recursive: true, force: true })
  const logs = await applyFrom(ctxOf({ entries: () => ROW_TREE }, ROW_SERVICE), 'new', '0.2.0-rc.2')
  ok(!existsSync(presetRoot) || dirsNow().length === 0, 'row line: no preset directory is written', 'dirs=' + dirsNow().join(','))
  ok(logs.some((l) => l.includes('跳过')), 'row line: the skip is reported')
  ok(!existsSync(stateFile), 'row line: the directory-line state file is never created')
  const logsNoTree = await applyFrom(ctxOf(undefined, ROW_SERVICE), 'new-noloader', '0.2.0-rc.2')
  ok(logsNoTree.some((l) => l.includes('跳过')),
    'a register-bearing service alone still classifies as the row line (no loader service needed)')
}

rmSync(tmp, { recursive: true, force: true })

console.log('')
console.log('=== PRESET MECHANISM: ' + passed + ' passed, ' + failed + ' failed ===')
if (failed) { for (const f of failures) console.error('  - ' + f); process.exit(1) }
console.log('ALL GREEN')

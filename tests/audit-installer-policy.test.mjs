// ============================================================================================
// INSTALLER UPDATE POLICY — what a user's preset directory looks like after an upgrade.
//
// installer.js (the single row cordis.patch.yml mounts) is the only thing that puts these four
// presets in front of someone who installed the bundle, so its copy policy IS the product for
// npm users. The contract under test:
//
//   · a VERSION CHANGE replaces every managed file, edited or not — a preset assembled from two
//     different versions is the failure shape this prevents — and the replaced bytes are kept
//     under <presetRoot>/.vibe-math-backup/<fromVersion>/<preset>/<file>;
//   · the SAME VERSION is a no-op: restarting DSH must not rewrite a file (the composition file's
//     mtime keys the preset's generation) and must not create backups;
//   · a MISSING file is always restored;
//   · a preset this bundle no longer ships is removed, except files recorded as user-owned;
//   · the managed list covers every file each preset needs at runtime.
//
// It drives the REAL apply() against a throwaway DSH home and a throwaway COPY of the package
// (whose version can be changed at will), so the developer's own ~/.dsh/.agent-presets is never
// touched.
//
// Usage: node tests/audit-installer-policy.test.mjs
//   INSTALLER_JS=<path>  run against another installer implementation. The sensitivity probe
//                        (_oneoff/probe-installer-policy.mjs) uses this to prove these assertions
//                        really do detect the previous, edit-preserving policy.
// ============================================================================================
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, appendFileSync, existsSync, rmSync, cpSync, readdirSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { tmpdir } from 'node:os'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { PRESETS } from '../installer.js'

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const INSTALLER_SRC = process.env.INSTALLER_JS ? resolve(process.env.INSTALLER_JS) : join(REPO, 'installer.js')
const pkg = JSON.parse(readFileSync(join(REPO, 'package.json'), 'utf8'))

let passed = 0, failed = 0
const failures = []
function ok(cond, label, detail) {
  if (cond) { passed++; console.log('  ok   ' + label); return true }
  failed++; failures.push(label + (detail ? ' — ' + detail : ''))
  console.error('  FAIL ' + label + (detail ? ' — ' + detail : ''))
  return false
}

/** A throwaway copy of the package at a chosen version; every managed file is version-marked. */
function buildPackage(version, dir) {
  mkdirSync(dir, { recursive: true })
  cpSync(INSTALLER_SRC, join(dir, 'installer.js'))
  writeFileSync(join(dir, 'package.json'), JSON.stringify({
    name: 'dsh-vibe-math', version, type: 'module', dsh: { bundle: { patch: './cordis.patch.yml' } },
  }, null, 2))
  for (const p of PRESETS) {
    mkdirSync(join(dir, p.src), { recursive: true })
    for (const f of p.files) {
      const text = readFileSync(join(REPO, p.src, f), 'utf8')
      const marker = f.endsWith('.js') ? '\n// version ' + version + '\n'
        : f.endsWith('.yml') ? '\n# version ' + version + '\n'
          : '\n<!-- version ' + version + ' -->\n'
      writeFileSync(join(dir, p.src, f), text + marker)
    }
  }
  return dir
}

async function applyFrom(pkgDir, home, logs) {
  process.env.DSH_HOME = home
  const mod = await import(pathToFileURL(join(pkgDir, 'installer.js')).href + '?run=' + Date.now() + Math.random())
  const ctx = {
    get: () => undefined, // no host services: apply() must still copy files and only warn
    logger: { info: (m) => logs.push('info: ' + m), warn: (m) => logs.push('warn: ' + m), error: (m) => logs.push('error: ' + m) },
  }
  await mod.apply(ctx)
  return logs
}
const sha = (buf) => createHash('sha256').update(buf).digest('hex')
const failedLog = (logs) => logs.filter((l) => l.includes('preset install/update failed'))

const tmp = mkdtempSync(join(tmpdir(), 'vibe-installer-policy-'))
const home = join(tmp, 'dshhome')
mkdirSync(home, { recursive: true })
const presetRoot = join(home, '.agent-presets')
const stateFile = join(presetRoot, '.vibe-math-installed.json')
const backupRoot = join(presetRoot, '.vibe-math-backup')
const pkgA = buildPackage('1.0.0', join(tmp, 'pkg-1.0.0'))
const pkgB = buildPackage('2.0.0', join(tmp, 'pkg-2.0.0'))
const at = (p, f) => join(presetRoot, p.dst, f)
const shipped = (p, f, from = pkgB) => join(from, p.src, f)
const isCopyOf = (p, f, from = pkgB) => {
  try { return readFileSync(at(p, f)).equals(readFileSync(shipped(p, f, from))) } catch (e) { return false }
}
const managedDigest = () => {
  const h = createHash('sha256')
  for (const p of PRESETS) for (const f of p.files) if (existsSync(at(p, f))) h.update(p.src + '/' + f + ':' + sha(readFileSync(at(p, f))))
  return h.digest('hex')
}

console.log('=== 1. baseline install into an empty DSH home ===')
{
  const logs = await applyFrom(pkgA, home, [])
  ok(existsSync(stateFile), 'the state file is written next to the presets')
  const state = existsSync(stateFile) ? JSON.parse(readFileSync(stateFile, 'utf8')) : {}
  ok(state.version === '1.0.0', 'the state records the version it installed', String(state.version))
  const missing = []
  let identical = true
  for (const p of PRESETS) for (const f of p.files) {
    if (!existsSync(at(p, f))) missing.push(p.dst + '/' + f)
    else if (!isCopyOf(p, f, pkgA)) identical = false
  }
  ok(missing.length === 0, 'every managed file of all four presets is copied', missing.join(', '))
  ok(identical, 'every copied file is byte-identical to the shipped file')
  ok(failedLog(logs).length === 0, 'apply() swallowed no failure', failedLog(logs)[0])
}

console.log('=== 2. a user edit + the SAME version: untouched, and no backup ===')
const editedJs = { p: PRESETS[3], f: 'vibe-math-v5.js' }
const editedDoc = { p: PRESETS[0], f: '实现方案.md' }
{
  appendFileSync(at(editedJs.p, editedJs.f), '\n// USER EDIT\n')
  appendFileSync(at(editedDoc.p, editedDoc.f), '\nUSER EDIT\n')
  const userJs = readFileSync(at(editedJs.p, editedJs.f))
  const logs = await applyFrom(pkgA, home, [])
  ok(readFileSync(at(editedJs.p, editedJs.f)).equals(userJs), 'same version: the edited plugin file is NOT rewritten')
  ok(readFileSync(at(editedDoc.p, editedDoc.f), 'utf8').includes('USER EDIT'), 'same version: the edited document is NOT rewritten')
  ok(!existsSync(backupRoot), 'same version: nothing is backed up (nothing was replaced)')
  const state = JSON.parse(readFileSync(stateFile, 'utf8'))
  ok(state.version === '1.0.0', 'same version: the state still records 1.0.0', String(state.version))
  ok(failedLog(logs).length === 0, 'apply() swallowed no failure', failedLog(logs)[0])
  // the recorded hash must still describe what the installer WROTE, so the drift is recognised later
  const rec = state.files[editedJs.p.src + '/' + editedJs.f]
  ok(rec && rec.hash === sha(readFileSync(shipped(editedJs.p, editedJs.f, pkgA))),
    'the state keeps the hash of the installed bytes (not of the edit), so the drift survives a same-version boot')
  ok(isCopyOf(PRESETS[2], 'preset.yml', pkgA), 'same version: an unedited file is still the installed bytes')
}

console.log('=== 3. a VERSION CHANGE: every managed file is replaced, the edit is preserved ===')
let userJsBytes = null
{
  userJsBytes = readFileSync(at(editedJs.p, editedJs.f))
  const logs = await applyFrom(pkgB, home, [])
  ok(isCopyOf(editedJs.p, editedJs.f), 'version change: the edited plugin file IS replaced by the shipped bytes')
  ok(isCopyOf(editedDoc.p, editedDoc.f), 'version change: the edited document IS replaced too')
  ok(isCopyOf(PRESETS[1], 'preset.yml'), 'version change: an unedited file is replaced as well')
  const backup = join(backupRoot, '1.0.0', editedJs.p.dst, editedJs.f)
  ok(existsSync(backup), 'the replaced edit is kept at .vibe-math-backup/<fromVersion>/<preset>/<file>')
  ok(existsSync(backup) && readFileSync(backup).equals(userJsBytes), 'the backup holds exactly the bytes the user had')
  ok(!existsSync(join(backupRoot, '1.0.0', PRESETS[1].dst, 'preset.yml')), 'an unedited file is replaced WITHOUT a backup (nothing to preserve)')
  const state = JSON.parse(readFileSync(stateFile, 'utf8'))
  ok(state.version === '2.0.0', 'the state records the new version', String(state.version))
  ok(logs.some((l) => l.includes('.vibe-math-backup')), 'the log names the backup location')
  ok(logs.some((l) => l.includes('复制一份')), 'the log tells the user how to customize a preset properly')
  ok(failedLog(logs).length === 0, 'apply() swallowed no failure', failedLog(logs)[0])
}

console.log('=== 4. a deleted file at the SAME version: restored, nothing backed up ===')
{
  rmSync(at(PRESETS[2], 'agent.cordis.yml'))
  const logs = await applyFrom(pkgB, home, [])
  ok(existsSync(at(PRESETS[2], 'agent.cordis.yml')), 'a deleted managed file is restored')
  ok(isCopyOf(PRESETS[2], 'agent.cordis.yml'), 'the restored file is byte-identical to the shipped one')
  ok(!existsSync(join(backupRoot, '2.0.0')), 'a run that replaced nothing creates no backup directory')
  ok(logs.some((l) => l.includes('restored')), 'the restore is reported')
  ok(failedLog(logs).length === 0, 'apply() swallowed no failure', failedLog(logs)[0])
}

console.log('=== 5. a preset this bundle no longer ships ===')
{
  const state = JSON.parse(readFileSync(stateFile, 'utf8'))
  mkdirSync(join(presetRoot, 'vibe-math-v1'), { recursive: true })
  mkdirSync(join(presetRoot, 'vibe-math-v0'), { recursive: true })
  writeFileSync(join(presetRoot, 'vibe-math-v1', 'legacy.js'), 'package-owned\n')
  writeFileSync(join(presetRoot, 'vibe-math-v0', 'mine.js'), 'user-owned\n')
  state.files['vibe-math-v1/legacy.js'] = { hash: sha('package-owned\n'), provenance: 'package' }
  state.files['vibe-math-v0/mine.js'] = { hash: sha('user-owned\n'), provenance: 'user' }
  writeFileSync(stateFile, JSON.stringify(state, null, 2) + '\n')
  const logs = await applyFrom(pkgB, home, [])
  ok(!existsSync(join(presetRoot, 'vibe-math-v1', 'legacy.js')), 'a package-owned file of a dropped preset is removed')
  ok(!existsSync(join(presetRoot, 'vibe-math-v1')), 'the dropped preset directory is removed once empty')
  ok(existsSync(join(presetRoot, 'vibe-math-v0', 'mine.js')), 'a file recorded as user-owned in a dropped preset is kept')
  ok(logs.some((l) => l.includes('cleanup')), 'the cleanup is reported')
  ok(failedLog(logs).length === 0, 'apply() swallowed no failure', failedLog(logs)[0])
}

console.log('=== 6. a same-version re-run is a no-op ===')
{
  const before = managedDigest()
  const logs = await applyFrom(pkgB, home, [])
  ok(managedDigest() === before, 'no managed file changed on a same-version re-run')
  ok(failedLog(logs).length === 0, 'apply() swallowed no failure', failedLog(logs)[0])
}

console.log('=== 7. an unreadable package manifest replaces nothing (and self-heals) ===')
{
  // a package whose manifest cannot be read: the installer cannot tell whether this is an upgrade,
  // so the only safe behaviour is to copy nothing and still restore what is missing. (The manifest
  // must stay VALID JSON — Node parses the nearest package.json to decide the module type — so the
  // unreadable-version case is a manifest with no `version` field, which is exactly what a
  // hand-assembled package looks like.)
  const broken = buildPackage('9.9.9', join(tmp, 'pkg-broken'))
  writeFileSync(join(broken, 'package.json'), JSON.stringify({ name: 'dsh-vibe-math', type: 'module' }, null, 2))
  const pkgC = buildPackage('3.0.0', join(tmp, 'pkg-3.0.0'))

  appendFileSync(at(PRESETS[1], 'preset.yml'), '\n# USER EDIT 2\n')
  const driftedBytes = readFileSync(at(PRESETS[1], 'preset.yml'))
  rmSync(at(PRESETS[2], 'preset.yml')) // ...but a missing file is still restored
  // an earlier upgrade already preserved an edit of this same file: that copy must win
  const earlier = join(backupRoot, '2.0.0', PRESETS[1].dst, 'preset.yml')
  mkdirSync(dirname(earlier), { recursive: true })
  writeFileSync(earlier, 'EARLIER COPY\n')

  const logs = await applyFrom(broken, home, [])
  ok(readFileSync(at(PRESETS[1], 'preset.yml')).equals(driftedBytes), 'an unreadable manifest leaves drifted files alone')
  ok(isCopyOf(PRESETS[2], 'preset.yml', broken), '...while a missing file is still restored')
  ok(logs.some((l) => l.includes('读不到本包版本')), 'the reason is reported, not swallowed')
  ok(JSON.parse(readFileSync(stateFile, 'utf8')).version === '2.0.0', 'the previously recorded version is kept (so the next run reports the right "from" version)')
  ok(!existsSync(join(backupRoot, '(unversioned)')), 'no "(unversioned)" backup directory was created')

  const logs2 = await applyFrom(pkgC, home, [])
  ok(readFileSync(at(PRESETS[1], 'preset.yml')).equals(readFileSync(shipped(PRESETS[1], 'preset.yml', pkgC))),
    'the next readable run replaces the drift as a normal version change')
  ok(readFileSync(earlier, 'utf8') === 'EARLIER COPY\n', 'a backup that already exists for that version is kept byte-for-byte (the earliest copy wins)')
  ok(logs2.every((l) => !l.includes('备份失败')), 'a pre-existing backup for the same version is NOT reported as a failure')
  ok(JSON.parse(readFileSync(stateFile, 'utf8')).version === '3.0.0', 'the state records the new version')

  // the backup directory must never be readable as a preset: DSH only accepts [a-z0-9][a-z0-9-]* ids
  ok(!/^[a-z0-9]/.test('.vibe-math-backup'), 'the backup directory name cannot be mistaken for a preset id (discovery skips it)')
}

console.log('=== 8. the managed list covers what the presets need ===')
for (const p of PRESETS) {
  const shippedFiles = (pkg.files || []).filter((f) => f.startsWith(p.src + '/')).map((f) => f.slice(p.src.length + 1))
  const runtime = ['agent.cordis.yml', 'preset.yml', p.src + '.js']
  const unmanagedRuntime = runtime.filter((f) => !p.files.includes(f))
  ok(unmanagedRuntime.length === 0, `${p.dst}: every runtime file is in the installer's managed list`, unmanagedRuntime.join(', '))
  const EXEMPT = ['v2的额外要求.txt'] // an author note, deliberately not installed next to the preset
  const unmanaged = shippedFiles.filter((f) => !p.files.includes(f) && !EXEMPT.includes(f))
  ok(unmanaged.length === 0, `${p.dst}: every shipped file is managed or explicitly exempt`, unmanaged.join(', '))
}

rmSync(tmp, { recursive: true, force: true })

console.log('')
console.log('=== INSTALLER POLICY: ' + passed + ' passed, ' + failed + ' failed ===')
if (failed) { for (const f of failures) console.error('  - ' + f); process.exit(1) }
console.log('ALL GREEN')

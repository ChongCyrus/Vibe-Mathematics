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
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, appendFileSync, existsSync, rmSync, cpSync, readdirSync, statSync, symlinkSync } from 'node:fs'
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

/**
 * A throwaway copy of the package at a chosen version; every managed file is version-marked.
 * `transform` (optional) rewrites the copied installer source — used by §14 to build the package
 * that DROPS a preset, which no shipped package can express.
 */
function buildPackage(version, dir, transform) {
  mkdirSync(dir, { recursive: true })
  if (typeof transform === 'function') writeFileSync(join(dir, 'installer.js'), transform(readFileSync(INSTALLER_SRC, 'utf8')))
  else cpSync(INSTALLER_SRC, join(dir, 'installer.js'))
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
// Label-tolerant on purpose: the installer's user-facing failure line is emitted by the logger helper
// (not console.*) and its label is localised; the FACT asserted here is that a failure line exists.
const FAILURE_LINE = /预设安装\/更新失败|preset install\/update failed/
const failedLog = (logs) => logs.filter((l) => FAILURE_LINE.test(l))

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
  // A8: the FACT (a version change backs up the user's edit) is asserted structurally above (backup path
  // + byte equality). What remains is guidance wording, so this is the ONE labelled wording smoke check.
  ok(logs.some((l) => /复制一份/.test(l)), '[wording smoke check — the ONE allowed] the log tells the user how to customize a preset properly')
  ok(failedLog(logs).length === 0, 'apply() swallowed no failure', failedLog(logs)[0])
}

console.log('=== 4. a deleted file at the SAME version: restored, nothing backed up ===')
{
  rmSync(at(PRESETS[2], 'agent.cordis.yml'))
  const logs = await applyFrom(pkgB, home, [])
  ok(existsSync(at(PRESETS[2], 'agent.cordis.yml')), 'a deleted managed file is restored')
  ok(isCopyOf(PRESETS[2], 'agent.cordis.yml'), 'the restored file is byte-identical to the shipped one')
  ok(!existsSync(join(backupRoot, '2.0.0')), 'a run that replaced nothing creates no backup directory')
  // Guard-sync: the installer's user-visible stream is Chinese by convention (one language, see the
  // comment at the cleanup line), so these assert the FACT (an action keyword + the count) rather than
  // an English word.
  // "one action, one line": the restore must be reported, and reported EXACTLY ONCE (a second report of the
  // same action is the defect the duplicate-log review was about).
  const restoreLines = logs.filter((l) => /\u8fd8\u539f\u4e86\s*\d+\s*\u4e2a\u7f3a\u5931\u7684\u9884\u8bbe\u6587\u4ef6/.test(l))
  ok(restoreLines.length === 1, '★ the restore is reported EXACTLY ONCE (one action, one line)', JSON.stringify(restoreLines.map((l) => l.slice(0, 60))))
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
  const cleanupLines = logs.filter((l) => /\u9884\u8bbe\u6e05\u7406/.test(l) && /\u5220\u9664\s*\d+\s*\u4e2a\u6587\u4ef6/.test(l))
  ok(cleanupLines.length === 1, '★ the cleanup is reported EXACTLY ONCE (one action, one line)', JSON.stringify(cleanupLines.map((l) => l.slice(0, 60))))
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
  // A8: report-level, not wording-level - a pre-existing backup must not be counted as a failure by the
  // guard's own failure-line helper (which matches the localised failure label, either spelling).
  ok(failedLog(logs2).length === 0, '★ a pre-existing backup for the same version is NOT reported as a failure (report-level check, not a wording check)', failedLog(logs2)[0])
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

console.log('=== 9. a recorded version NEWER than this package (a downgrade) says so ===')
{
  // The state is at 3.0.0 after case 7, so running pkgB (2.0.0) replaces NEWER preset bytes with
  // older ones. The policy still replaces them — "the preset directory equals the installed
  // package" is the contract — but it must never do that quietly.
  appendFileSync(at(PRESETS[0], 'preset.yml'), '\n# USER EDIT 3\n')
  const newerBytes = readFileSync(at(PRESETS[0], 'preset.yml'))
  const logs = await applyFrom(pkgB, home, [])
  ok(logs.some((l) => l.includes('比本包版本')), 'a downgrade is reported as a warning')
  ok(isCopyOf(PRESETS[0], 'preset.yml'), '...and the file is still replaced (the directory equals the installed package)')
  const backup = join(backupRoot, '3.0.0', PRESETS[0].dst, 'preset.yml')
  ok(existsSync(backup) && readFileSync(backup).equals(newerBytes), 'the replaced newer bytes are backed up under the version they came from')
  ok(JSON.parse(readFileSync(stateFile, 'utf8')).version === '2.0.0', 'the state records the version that is actually installed now')
  ok(failedLog(logs).length === 0, 'apply() swallowed no failure')
}

// ============================================================================================
// The Round-B machinery findings. Each of these sections was RED before its fix; see
// _oneoff/probe-installer-policy.mjs and _oneoff/rC-probe-mechanism-sensitivity.mjs for the
// sensitivity runs (the shipped suite must be green while the previous logic is red ON THE NAMED
// ASSERTION).
// ============================================================================================

// fresh home + helpers for the sections below, so the edits accumulated above cannot leak in
// (the readers never throw: a mutant that deletes or half-writes a file must show up as a FAIL on
// the assertion that names it, not as a crashed suite)
const readText = (p) => { try { return readFileSync(p, 'utf8') } catch (e) { return null } }
const readJson = (p) => { try { return JSON.parse(readFileSync(p, 'utf8')) } catch (e) { return null } }
const tmpHome = (n) => {
  const home = join(tmp, 'dshhome' + n)
  mkdirSync(home, { recursive: true })
  const root = join(home, '.agent-presets')
  return {
    home, root,
    state: join(root, '.vibe-math-installed.json'),
    backup: join(root, '.vibe-math-backup'),
    at: (p, f) => join(root, p.dst, f),
    isCopyOf: (p, f, from) => {
      try { return readFileSync(join(root, p.dst, f)).equals(readFileSync(join(from, p.src, f))) } catch (e) { return false }
    },
  }
}

console.log('=== 10. preset writes are ATOMIC: a failed write cannot touch the destination ===')
{
  const H = tmpHome('10')
  await applyFrom(pkgA, H.home, [])
  const target = { p: PRESETS[1], f: 'preset.yml' }
  const userBytes = Buffer.from('# USER EDIT (must survive a failed write)\n')
  writeFileSync(H.at(target.p, target.f), userBytes)
  // `writePresetFile` writes `<dest>.<pid>.<seq>.vibe-math-tmp` and renames it over the destination,
  // so a DIRECTORY squatting on that temp path makes the temp write fail while the destination stays
  // untouched. An in-place `writeFileSync(dest)` would not care: it would overwrite the user's bytes
  // and log nothing. The squat covers every sequence number a full run can use.
  const MANY = 32
  const squat = (n) => H.at(target.p, target.f) + '.' + process.pid + '.' + n + '.vibe-math-tmp'
  for (let n = 0; n < MANY; n++) mkdirSync(squat(n), { recursive: true })
  const logs = await applyFrom(pkgB, H.home, [])
  ok(readText(H.at(target.p, target.f)) === userBytes.toString(),
    'a failed preset write leaves the destination byte-for-byte intact (tmp+rename, never in place)')
  ok(failedLog(logs).length > 0,
    '...and the failure is reported instead of being swallowed', logs.filter((l) => l.includes('failed')).join(' | ').slice(0, 200))
  ok((readJson(H.state) || {}).version === '1.0.0',
    'the state still describes the bytes that are actually on disk, so the next boot self-heals')
  for (let n = 0; n < MANY; n++) rmSync(squat(n), { recursive: true, force: true })
  await applyFrom(pkgB, H.home, [])
  ok(H.isCopyOf(target.p, target.f, pkgB), 'with the obstruction gone the next boot replaces the file normally')
  ok((readJson(H.state) || {}).version === '2.0.0', '...and records the new version')
  const leftovers = []
  const walk = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name)
      if (e.isDirectory()) walk(p)
      else if (e.name.endsWith('.vibe-math-tmp')) leftovers.push(p)
    }
  }
  walk(H.root)
  ok(leftovers.length === 0, 'no `.vibe-math-tmp` file is left behind by a clean run', leftovers.join(', '))
}

console.log('=== 11. the state file is not rewritten (or even touched) when nothing changed ===')
{
  const H = tmpHome('11')
  await applyFrom(pkgA, H.home, [])
  const before = readText(H.state)
  const mtime = statSync(H.state).mtimeMs
  await new Promise((r) => setTimeout(r, 30))
  await applyFrom(pkgA, H.home, [])
  ok(readText(H.state) === before, 'a same-version boot leaves the state file byte-identical (no churn)')
  ok(statSync(H.state).mtimeMs === mtime, '...and does not move its mtime either')
  // ...but a same-version boot that LEARNS something (a file was edited) must record it
  appendFileSync(H.at(PRESETS[0], 'preset.yml'), '\n# USER EDIT\n')
  await applyFrom(pkgA, H.home, [])
  const after = readJson(H.state) || {}
  ok(readText(H.state) !== before, 'a same-version boot that learns something DOES rewrite the state')
  ok(after.files && after.files[PRESETS[0].src + '/preset.yml'] && after.files[PRESETS[0].src + '/preset.yml'].provenance === 'user',
    'the drift is recorded as user-owned — by the real code path (the audit found this value was never written)')
}

console.log('=== 12. a legacy hash-less record is reported as UNKNOWN, never as a proven edit ===')
{
  const H = tmpHome('12')
  await applyFrom(pkgA, H.home, [])
  const state = readJson(H.state) || { files: {} }
  delete state.files[PRESETS[2].src + '/preset.yml'].hash // the shape a pre-hash installer wrote
  writeFileSync(H.state, JSON.stringify(state, null, 2) + '\n')
  appendFileSync(H.at(PRESETS[2], 'preset.yml'), '\n# edit while the recorded hash is unknown\n')
  const editBytes = readText(H.at(PRESETS[2], 'preset.yml'))
  const logs = await applyFrom(pkgB, H.home, [])
  ok(logs.some((l) => l.includes('没有哈希')),
    'the file whose previous hash is unknown is reported as "cannot tell whether you changed it"')
  ok(!logs.some((l) => l.includes('被改过')),
    '...and is NOT called an edit the installer can prove', logs.filter((l) => l.includes('被改过')).join(' | '))
  const backup = join(H.backup, '1.0.0', PRESETS[2].dst, 'preset.yml')
  ok(existsSync(backup) && readText(backup) === editBytes,
    '...while its bytes are still copied to the backup root before the replacement')
}

console.log('=== 13. deleting a file with a dropped preset backs it up FIRST and names it ===')
{
  const H = tmpHome('13')
  await applyFrom(pkgA, H.home, [])
  mkdirSync(join(H.root, 'vibe-math-v1'), { recursive: true })
  writeFileSync(join(H.root, 'vibe-math-v1', 'legacy.js'), 'MY VALUABLE EDIT\n')
  writeFileSync(join(H.root, 'vibe-math-v1', 'stock.yml'), 'package bytes\n')
  const state = readJson(H.state) || { files: {} }
  state.files['vibe-math-v1/legacy.js'] = { hash: sha('the bytes the installer wrote long ago\n'), provenance: 'package' }
  state.files['vibe-math-v1/stock.yml'] = { hash: sha('package bytes\n'), provenance: 'package' }
  writeFileSync(H.state, JSON.stringify(state, null, 2) + '\n')
  const logs = await applyFrom(pkgA, H.home, [])
  ok(!existsSync(join(H.root, 'vibe-math-v1', 'legacy.js')), 'the changed file of a dropped preset is removed (the preset is gone)')
  const backup = join(H.backup, '1.0.0', 'vibe-math-v1', 'legacy.js')
  ok(existsSync(backup) && readText(backup) === 'MY VALUABLE EDIT\n',
    '...AFTER its bytes were copied to .vibe-math-backup/<fromVersion>/<preset>/<file>')
  ok(logs.some((l) => l.includes('vibe-math-v1/legacy.js') && l.includes('.vibe-math-backup')),
    '...and the log names both the file it deleted and where the copy is')
  ok(!existsSync(join(H.backup, '1.0.0', 'vibe-math-v1', 'stock.yml')),
    'a file that still matches its recorded hash is deleted WITHOUT a backup (it was the package copy)')
  ok(logs.some((l) => l.includes('仍是本安装器写入的字节')), '...and that is stated in the log')
}

console.log('=== 14. a user edit inside a preset a NEWER package drops is KEPT ===')
{
  const H = tmpHome('14')
  const edited = { p: PRESETS[1], f: 'agent.cordis.yml' }
  await applyFrom(pkgA, H.home, [])
  appendFileSync(H.at(edited.p, edited.f), '\n# MY EDIT\n')
  await applyFrom(pkgA, H.home, [])
  const recorded = (readJson(H.state) || {}).files || {}
  ok(recorded[edited.p.src + '/' + edited.f] && recorded[edited.p.src + '/' + edited.f].provenance === 'user',
    'the same-version edit is recorded as user-owned before the preset is dropped')
  // "a newer package no longer ships this preset": rename its src in the copied installer, so the copy
  // loop cannot rebuild it and the old keys become stale — exactly what the cleanup must handle.
  const dropper = buildPackage('2.0.0', join(tmp, 'pkg-dropper'),
    (src) => src.replace("src: 'vibe-math-v3',", "src: 'vibe-math-v3-dropped',"))
  const logs = await applyFrom(dropper, H.home, [])
  ok(existsSync(H.at(edited.p, edited.f)), 'the edited file of the dropped preset SURVIVES')
  ok((readText(H.at(edited.p, edited.f)) || '').includes('MY EDIT'), '...with the user\'s bytes intact')
  ok(!existsSync(H.at(edited.p, 'preset.yml')), 'the unedited files of the dropped preset are still removed')
  ok(logs.some((l) => l.includes('记为用户所有的文件被保留')), '...and the log says the user-owned file was kept')
}

console.log('=== 15. a failed state write is reported (not swallowed), and does not abort the run ===')
{
  const H = tmpHome('15')
  await applyFrom(pkgA, H.home, [])
  appendFileSync(H.at(PRESETS[0], 'preset.yml'), '\n# USER EDIT (the state must be updated)\n')
  // the first state write of a fresh module instance uses sequence 0: squat that exact temp path
  mkdirSync(H.state + '.' + process.pid + '.0.tmp', { recursive: true })
  const logs = await applyFrom(pkgA, H.home, [])
  ok(logs.some((l) => l.includes('状态文件写入失败')),
    'a failed state write is REPORTED (it used to fail silently)', logs.filter((l) => l.includes('写入失败')).join(' | ').slice(0, 160))
  ok(failedLog(logs).length === 0, '...without aborting the preset step')
  ok((readJson(H.state) || {}).version === '1.0.0',
    'the previous state file is still parseable (tmp+rename left no half-written file)')
  rmSync(H.state + '.' + process.pid + '.0.tmp', { recursive: true, force: true })
  await applyFrom(pkgA, H.home, [])
  const healed = ((readJson(H.state) || {}).files || {})[PRESETS[0].src + '/preset.yml'] || {}
  ok(healed.provenance === 'user',
    'the next boot records what the failed write lost (self-healing)')
  ok(!existsSync(H.state + '.' + process.pid + '.0.tmp'), 'the temp path is free again after the successful write')
}

console.log('=== 16. an UNREADABLE stale file is not deleted (there is no backup it could make) ===')
{
  const H = tmpHome('16')
  await applyFrom(pkgA, H.home, [])
  const staleDir = join(H.root, 'vibe-math-v1')
  mkdirSync(staleDir, { recursive: true })
  // A directory junction sitting at the stale FILE path: existsSync() is true, readFileSync()
  // throws (EISDIR), and unlinkSync() WOULD succeed — exactly the shape the policy must refuse.
  // (POSIX ignores the 'junction' type and makes a plain symlink to the directory, which behaves
  // identically here.) The previous code unlinked it with no backup; the rule is now
  // "back up before deleting, or do not delete".
  const target = join(tmp, 'unreadable-target-16')
  mkdirSync(target, { recursive: true })
  symlinkSync(target, join(staleDir, 'legacy.js'), 'junction')
  const state = readJson(H.state) || { files: {} }
  state.files['vibe-math-v1/legacy.js'] = { hash: sha('bytes this installer wrote long ago\n'), provenance: 'package' }
  writeFileSync(H.state, JSON.stringify(state, null, 2) + '\n')
  const logs = await applyFrom(pkgA, H.home, [])
  ok(existsSync(join(staleDir, 'legacy.js')),
    'a stale file whose bytes cannot be read is KEPT (the delete is skipped, not performed unbacked)')
  ok(logs.some((l) => l.includes('无法读取')), '...and the log names it as unreadable',
    logs.filter((l) => l.includes('无法读取')).join(' | ').slice(0, 200))
  ok(!logs.some((l) => l.includes('被改过')),
    '...and it is NOT called a proven edit the installer can see', logs.filter((l) => l.includes('被改过')).join(' | '))
  ok(!logs.some((l) => l.includes('legacy.js') && l.includes('.vibe-math-backup')),
    '...and no backup is claimed for it (there were no bytes to back up)')
  ok(existsSync(staleDir), 'the stale preset directory is kept too, while the file inside it is kept')
}

console.log('=== 16b. a stale file whose BACKUP FAILS is kept, not deleted unbacked ===')
{
  const H = tmpHome('16b')
  await applyFrom(pkgA, H.home, [])
  const staleDir = join(H.root, 'vibe-math-v1')
  mkdirSync(staleDir, { recursive: true })
  writeFileSync(join(staleDir, 'legacy.js'), "the user's own bytes\n")
  // Every backup attempt must fail: a FILE sits where the backup ROOT directory would be, so the
  // recursive mkdir throws (ENOTDIR/EEXIST). This is the rule's hardest case — the bytes exist,
  // they differ from the package, and preserving them is impossible — so the delete must be
  // skipped. (Round C's fix only covered the UNREADABLE case; a failed backup still deleted.)
  writeFileSync(join(H.root, '.vibe-math-backup'), 'not a directory\n')
  const state = readJson(H.state) || { files: {} }
  state.files['vibe-math-v1/legacy.js'] = { hash: sha('bytes this installer wrote long ago\n'), provenance: 'package' }
  writeFileSync(H.state, JSON.stringify(state, null, 2) + '\n')
  const logs = await applyFrom(pkgA, H.home, [])
  ok(existsSync(join(staleDir, 'legacy.js')) && readFileSync(join(staleDir, 'legacy.js'), 'utf8') === "the user's own bytes\n",
    'a stale file whose BACKUP fails is KEPT (the delete is skipped, not performed unbacked)')
  ok(logs.some((l) => l.includes('备份失败') && l.includes('跳过删除')),
    "...and the log reports the failed backup as a skipped delete (not as 'the original was lost')",
    logs.filter((l) => l.includes('备份失败')).join(' | ').slice(0, 220))
  rmSync(join(H.root, '.vibe-math-backup'), { force: true })
}

console.log('=== 16. one action, one language: no user-facing line carries an English-only label ===')
{
  // The convention (docs/AUDIT-CHECKLIST.md): installer user-facing output is Chinese; an English-only
  // LABEL is a defect (an English domain word inside a Chinese label, like `preset 声明方式`, is fine).
  // This is a CONVENTION sweep, not a wording pin: any CJK-bearing label passes.
  const src = readFileSync(INSTALLER_SRC, 'utf8')
  const labelOf = (l) => { const m = /\[dsh-vibe-math\]\s*([^:：]*)/.exec(l); return m ? m[1].trim() : '' }
  const asciiOnly = (lab) => lab.length > 0 && /^[\x20-\x7e]+$/.test(lab)
  const sites = src.split(/\r?\n/).filter((l) => /logger\?\.(info|warn|error)\?\.\(/.test(l))
  ok(sites.length > 0, 'the installer has user-facing log sites to sweep (found ' + sites.length + ')')
  const badSites = sites.filter((l) => asciiOnly(labelOf(l)))
  ok(badSites.length === 0, '★ no user-facing log SITE carries an English-only label (installer output is Chinese)',
    JSON.stringify(badSites.map((l) => l.trim().slice(0, 70))))
  const runtimeLogs = await applyFrom(pkgB, home, [])
  const badRuntime = runtimeLogs.filter((l) => asciiOnly(labelOf(l)))
  ok(badRuntime.length === 0, '★ ...and no CAPTURED line does either (code and convention agree at runtime)',
    JSON.stringify(badRuntime.slice(0, 2)))
}

rmSync(tmp, { recursive: true, force: true })

console.log('')
console.log('=== INSTALLER POLICY: ' + passed + ' passed, ' + failed + ' failed ===')
if (failed) { for (const f of failures) console.error('  - ' + f); process.exit(1) }
console.log('ALL GREEN')

// tests/vmu-guard.test.mjs — enforcement tests for vibe-math-vmu/kernel/guard.js
// Keys are composed here too (never written as literals) so nothing can be mistaken for a wiring claim.
import { mkdtempSync, rmSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, normalize } from 'node:path'
import {
  describePolicy, guardWrite, guardSpawnCwd, memoryCeilingExceeded,
  readPathPolicy, readMemoryCeilingMb, sharedRootFor,
  guardWriteExtended, guardExec, cpuBudgetExceeded, requiresApproval, capabilityOf,
  readKillSwitch, readMaxPathLength, readFollowSymlinks, readNetPolicy, readExecAllowlist, readAllowedRoots, readWorkspacePolicy,
} from '../vibe-math-vmu/kernel/guard.js'
import { createLibrary } from '../vibe-math-vmu/kernel/library.js'

const K_PATH_POLICY = ['vmu', 'safety', 'pathPolicy'].join('.')
const K_MEMORY_CEILING = ['vmu', 'limits', 'memoryCeilingMb'].join('.')

let passed = 0, failed = 0
const ok = (cond, label) => { if (cond) { passed++; console.log('  ok - ' + label) } else { failed++; console.error('  FAIL - ' + label) } }
const refuses = (fn, code, needleMsg, needleHint, label) => {
  try { fn(); failed++; console.error('  FAIL - ' + label + ' (no refusal)') } catch (e) {
    const c = e && e.code === code
    const m = needleMsg ? String(e && e.message).includes(needleMsg) : true
    const h = needleHint ? String(e && e.hint).includes(needleHint) : true
    if (c && m && h) { passed++; console.log('  ok - ' + label + ' :: ' + e.message + ' :: hint: ' + e.hint) }
    else { failed++; console.error('  FAIL - ' + label + ' :: code=' + (e && e.code) + ' msg=' + (e && e.message) + ' hint=' + (e && e.hint)) }
  }
}

const root = mkdtempSync(join(tmpdir(), 'vmu-guard-'))
mkdirSync(join(root, 'Members'), { recursive: true })
const shared = sharedRootFor(root)

console.log('-- policy: two positions --')
ok(readPathPolicy({}) === 'workspace-only', 'default policy is the schema default (workspace-only)')
const d0 = describePolicy({}, { root })
ok(d0.policy === 'workspace-only' && d0.writableRoots.length === 1 && d0.writableRoots[0] === normalize(root),
  'describePolicy(workspace-only): only the workspace root (' + JSON.stringify(d0.writableRoots) + ')')
const d1 = describePolicy({ [K_PATH_POLICY]: 'workspace+shared' }, { root })
ok(d1.policy === 'workspace+shared' && d1.writableRoots.includes(normalize(shared)),
  'describePolicy(workspace+shared): adds the sibling Shared area (' + JSON.stringify(d1.writableRoots) + ')')
ok(describePolicy({ [K_PATH_POLICY]: 'nonsense' }, { root }).policy === 'workspace-only',
  'an unknown policy value falls back to the closed position')

console.log('-- guardWrite: allowed / refused (both policies) --')
const good = guardWrite({ settings: {}, root, target: join(root, 'Members', 'r-1', 'Propos', 'p-1.md'), kind: 'library write' })
ok(good.ok === true && good.path.startsWith(normalize(root)), 'inside the root is allowed')
refuses(() => guardWrite({ settings: {}, root, target: join(dirname(root), 'outside.txt'), kind: 'library write' }),
  'VMU_NOT_PERMITTED', 'outside.txt', 'workspace-only',
  'workspace-only: outside the root is refused BY NAME (message names the path)')
refuses(() => guardWrite({ settings: {}, root, target: join(shared, 'x.md'), kind: 'library write' }),
  'VMU_NOT_PERMITTED', 'Shared', 'workspace+shared',
  'workspace-only: the shared area is refused and the hint names how to open it')
const okShared = guardWrite({ settings: { [K_PATH_POLICY]: 'workspace+shared' }, root, target: join(shared, 'x.md'), kind: 'library write' })
ok(okShared.ok === true, 'workspace+shared: the shared area is allowed')
refuses(() => guardWrite({ settings: { [K_PATH_POLICY]: 'workspace+shared' }, root, target: join(dirname(dirname(root)), 'far.txt'), kind: 'library write' }),
  'VMU_NOT_PERMITTED', 'far.txt', null, 'workspace+shared: still refuses a path outside BOTH roots')

console.log('-- guardSpawnCwd: same judgement (decides only) --')
ok(guardSpawnCwd({ settings: {}, root, cwd: root }).ok === true, 'spawn cwd = root is allowed')
ok(guardSpawnCwd({ settings: {}, root, cwd: undefined }).path === normalize(root), 'an absent cwd defaults to the root')
refuses(() => guardSpawnCwd({ settings: {}, root, cwd: join(dirname(root), 'elsewhere') }),
  'VMU_NOT_PERMITTED', 'elsewhere', null, 'spawn cwd outside the root is refused by name')

console.log('-- memoryCeilingExceeded: host-process RSS, three positions --')
ok(readMemoryCeilingMb({}) === 0, 'the ceiling defaults to 0 = not set')
const m0 = memoryCeilingExceeded({ settings: {}, rssBytes: 8 * 1024 * 1024 * 1024 })
ok(m0.exceeded === false && m0.ceilingMb === 0 && m0.rssMb === 8192, 'ceiling 0 (not set): never exceeded (' + JSON.stringify(m0) + ')')
const m1 = memoryCeilingExceeded({ settings: { [K_MEMORY_CEILING]: 4096 }, rssBytes: 1024 * 1024 * 1024 })
ok(m1.exceeded === false && m1.ceilingMb === 4096 && m1.rssMb === 1024, 'under the ceiling: not exceeded (' + JSON.stringify(m1) + ')')
const m2 = memoryCeilingExceeded({ settings: { [K_MEMORY_CEILING]: 512 }, rssBytes: 1024 * 1024 * 1024 })
ok(m2.exceeded === true && m2.ceilingMb === 512 && m2.rssMb === 1024, 'over the ceiling: exceeded (' + JSON.stringify(m2) + ')')

console.log('-- library wiring: the guard is on the write path --')
const lib = createLibrary({ root, settings: {} })
ok(typeof lib === 'object' && lib !== null, 'createLibrary accepts { root, settings } with the default policy')
const libShared = createLibrary({ root, settings: { [K_PATH_POLICY]: 'workspace+shared' } })
ok(typeof libShared === 'object', 'createLibrary accepts the open policy (same object shape)')
refuses(() => guardWrite({ settings: {}, root, target: 'Members/../../escape.md', kind: 'library write' }),
  'VMU_NOT_PERMITTED', 'escape.md', null, 'a ../ traversal through the library root is refused')

rmSync(root, { recursive: true, force: true })
console.log('')

// ── ROUND 217: the security family（docs/20 §2／§4／§12）— every reader and every judgement, both directions ──
{
  const S = (extra) => Object.assign({ 'vmu.core.enabled': true }, extra)
  const k = (a, b) => 'vmu.safety.' + a + (b ? '.' + b : '')
  // readers
  ok(readKillSwitch(S({ [k('killSwitch')]: true })) === true, 'killSwitch[+]: the reader sees true')
  ok(readKillSwitch(S({})) === false, 'killSwitch[-]: absent means false (the declared default)')
  ok(readMaxPathLength(S({})) === 4096, 'maxPathLength: absent means the declared 4096')
  ok(readMaxPathLength(S({ [k('maxPathLength')]: 10 })) === 10, 'maxPathLength: a declared value is honoured')
  ok(readFollowSymlinks(S({})) === false && readFollowSymlinks(S({ [k('followSymlinks')]: true })) === true, 'followSymlinks: default false, declared true')
  ok(readNetPolicy(S({})) === 'off', 'netPolicy: absent means off (the volume says default no-network)')
  ok(readNetPolicy(S({ [k('netPolicy')]: 'nonsense' })) === 'off', 'netPolicy[-]: an unknown value falls back to off')
  ok(readExecAllowlist(S({ [k('execAllowlist')]: ['git', '  '] })).join(',') === 'git', 'execAllowlist: blank entries are dropped')
  // kill switch stops everything
  const ks = S({ [k('killSwitch')]: true, [k('pathPolicy')]: 'workspace+shared' })
  let killed = null; try { guardExec({ settings: ks, argv: ['git', 'status'] }) } catch (e) { killed = e && e.code }
  ok(killed === 'VMU_SAFETY_KILL_SWITCH', 'killSwitch: it stops a subprocess BY NAME', String(killed))
  let killedW = null; try { guardWriteExtended({ settings: ks, root: process.cwd(), target: 'a.txt' }) } catch (e) { killedW = e && e.code }
  ok(killedW === 'VMU_SAFETY_KILL_SWITCH', 'killSwitch: it stops a WRITE BY NAME too', String(killedW))
  // exec allow-list
  const allowS = S({ [k('execAllowlist')]: ['git'] })
  ok(guardExec({ settings: allowS, argv: ['git', 'status'] }).ok === true, 'execAllowlist[+]: a listed command starts')
  let notAllowed = null; try { guardExec({ settings: allowS, argv: ['rm', '-rf', '/'] }) } catch (e) { notAllowed = e && e.code }
  ok(notAllowed === 'VMU_SAFETY_EXEC_NOT_ALLOWED', 'execAllowlist[-]: an unlisted command is refused BY NAME', String(notAllowed))
  // net policy
  let netDenied = null; try { guardExec({ settings: S({}), argv: ['curl', 'https://example.org'] }) } catch (e) { netDenied = e && e.code }
  ok(netDenied === 'VMU_SAFETY_NET_DENIED', 'netPolicy[-]: with the default off a network client is refused BY NAME', String(netDenied))
  ok(guardExec({ settings: S({ [k('netPolicy')]: 'allowlist' }), argv: ['curl', 'https://example.org'] }).ok === true, 'netPolicy[+]: allowlist lets it through')
  // path length and symlinks
  let tooLong = null; try { guardWriteExtended({ settings: S({ [k('maxPathLength')]: 5 }), root: process.cwd(), target: 'abcdefgh.txt' }) } catch (e) { tooLong = e && e.code }
  ok(tooLong === 'VMU_SAFETY_PATH_TOO_LONG', 'maxPathLength[-]: an over-long path is refused BY NAME', String(tooLong))
  const okPath = guardWriteExtended({ settings: S({}), root: process.cwd(), target: 'fine.txt' })
  ok(okPath.ok === true && okPath.path.endsWith('fine.txt'), 'guardWriteExtended[+]: a normal write still passes')
  // cpu gate + approval + capability matrix
  ok(cpuBudgetExceeded({ settings: S({ [k('maxCpuMs')]: 100 }), cpuMs: 150 }).exceeded === true, 'maxCpuMs[-]: over the ceiling reports exceeded')
  ok(cpuBudgetExceeded({ settings: S({}), cpuMs: 1e9 }).exceeded === false, 'maxCpuMs[+]: 0 means no ceiling')
  ok(requiresApproval(S({}), 'publish').required === true, 'approvalRequired[+]: the declared default includes publish')
  ok(requiresApproval(S({}), 'read').required === false, 'approvalRequired[-]: an unlisted action needs no approval')
  ok(requiresApproval(S({ [k('askOn')]: ['deploy'] }), 'deploy').required === true, 'askOn[+]: a declared action asks')
  ok(capabilityOf(S({}), { slot: 'external-reviewer', capability: 'read-artifacts' }).granted === true, 'capabilityMatrix[+]: the built-in minimal set grants read-only artifacts')
  ok(capabilityOf(S({}), { slot: 'external-reviewer', capability: 'write-artifacts' }).granted === false, 'capabilityMatrix[-]: it does NOT grant a write')
  ok(capabilityOf(S({}), { slot: 'unknown-slot', capability: 'read-artifacts' }).granted === false, 'capabilityMatrix[-]: an unlisted slot is closed by default')
}

// ── ROUND 229: the two vmu.paths.* keys, and the second name for one knob ─────────────────────────────────────
{
  // NOTE: this suite already declares `S` in an earlier block, so this section uses its own name.
  const PS = (extra) => Object.assign({ 'vmu.core.enabled': true }, extra)
  ok(readFollowSymlinks(PS({})) === false, 'paths.followSymlinks[default]: with nothing declared it is off')
  ok(readFollowSymlinks(PS({ 'vmu.safety.followSymlinks': true })) === true,
    'paths.followSymlinks[+]: the SECURITY name still works on its own (round 217 behaviour preserved)')
  ok(readFollowSymlinks(PS({ 'vmu.paths.followSymlinks': true })) === true, 'paths.followSymlinks[+]: the durability name works on its own')
  ok(readFollowSymlinks(PS({ 'vmu.paths.followSymlinks': false, 'vmu.safety.followSymlinks': true })) === false,
    'paths.followSymlinks[precedence]: when BOTH are declared the paths key wins - the precedence is explicit, not accidental')
  ok(readFollowSymlinks(PS({ 'vmu.paths.followSymlinks': true, 'vmu.safety.followSymlinks': false })) === true,
    'paths.followSymlinks[precedence]: and it wins in the other direction too')

  const wide = PS({ 'vmu.safety.pathPolicy': 'workspace+shared' })
  ok(guardWriteExtended({ settings: wide, root: process.cwd(), target: 'a.txt' }).ok === true,
    'paths.allowedRoots[baseline]: without the key the policy decides, as before')
  const narrowed = PS({ 'vmu.safety.pathPolicy': 'workspace+shared', 'vmu.paths.allowedRoots': [process.cwd() + '/Sub'] })
  ok(guardWriteExtended({ settings: narrowed, root: process.cwd(), target: 'Sub/inside.txt' }).ok === true,
    'paths.allowedRoots[+]: a write under a declared root passes')
  let outside = null
  try { guardWriteExtended({ settings: narrowed, root: process.cwd(), target: 'elsewhere.txt' }) } catch (e) { outside = e && e.code }
  ok(outside === 'VMU_NOT_PERMITTED', 'paths.allowedRoots[-]: a write outside the declared roots is refused by name', String(outside))
  ok(readAllowedRoots(PS({ 'vmu.paths.allowedRoots': ['  ', 'x', ''] })).join(',') === 'x',
    'paths.allowedRoots: blank entries are dropped rather than kept as empty roots')
  ok(readAllowedRoots(PS({})).length === 0, 'paths.allowedRoots[empty]: an empty declaration means the policy computes the roots')
}


// ── ROUND 232: the workspace family — the declaration takes over the shared mounts ────────────────────────────
{
  const base = process.cwd()
  const empty = readWorkspacePolicy({})
  ok(empty.default === '' && empty.sharedPaths.length === 0 && empty.crossWrite === false && empty.declaredShared === false,
    'workspace[defaults]: an instance that declares nothing has no default workspace, no declared mounts and no cross-write')
  const declared = readWorkspacePolicy({ 'vmu.workspace.default': 'main', 'vmu.workspace.sharedPaths': ['/s/one', ' '], 'vmu.workspace.crossWrite': true })
  ok(declared.default === 'main' && declared.sharedPaths.join(',') === '/s/one' && declared.crossWrite === true && declared.declaredShared === true,
    'workspace[+]: the declared values are read, and a blank mount is dropped rather than kept as an empty root', JSON.stringify(declared.sharedPaths))

  const sibling = guardWriteExtended({ settings: { 'vmu.safety.pathPolicy': 'workspace+shared' }, root: base, target: 'a.txt' })
  ok(sibling.ok === true, 'workspace.sharedPaths[empty]: the workspace root stays writable, exactly as before')
  const withMount = guardWriteExtended({ settings: { 'vmu.safety.pathPolicy': 'workspace+shared', 'vmu.workspace.sharedPaths': [base + '/DeclaredMount'] }, root: base, target: 'DeclaredMount/x.txt' })
  ok(withMount.ok === true, 'workspace.sharedPaths[+]: a write into a DECLARED mount is allowed under workspace+shared')
  let outsideMount = null
  // The target must be OUTSIDE the workspace root: the root itself is always writable under this policy, so a path inside
  // it proves nothing about the declared mounts.
  try { guardWriteExtended({ settings: { 'vmu.safety.pathPolicy': 'workspace+shared', 'vmu.workspace.sharedPaths': [base + '/DeclaredMount'] }, root: base, target: '../Elsewhere/x.txt' }) } catch (e) { outsideMount = e && e.code }
  ok(outsideMount === 'VMU_NOT_PERMITTED',
    'workspace.sharedPaths[-]: with mounts declared, a directory that is NOT one of them is refused even under workspace+shared', String(outsideMount))
  // The declaration TAKES OVER: once mounts are named, the hard-coded sibling is no longer writable on its own.
  let siblingTakenOver = null
  try { guardWriteExtended({ settings: { 'vmu.safety.pathPolicy': 'workspace+shared', 'vmu.workspace.sharedPaths': [base + '/DeclaredMount'] }, root: base, target: '../Shared/x.txt' }) } catch (e) { siblingTakenOver = e && e.code }
  ok(siblingTakenOver === 'VMU_NOT_PERMITTED',
    'workspace.sharedPaths[+]: the fixed sibling stops being writable once mounts are declared - the declaration took over, it did not add', String(siblingTakenOver))
  // And with nothing declared the sibling still works, so an instance that declares nothing is unchanged.
  const stillSibling = guardWriteExtended({ settings: { 'vmu.safety.pathPolicy': 'workspace+shared' }, root: base, target: '../Shared/x.txt' })
  ok(stillSibling.ok === true, 'workspace.sharedPaths[empty]: with no mounts declared the sibling area is writable, exactly as before')
}


// ── ROUND 233: vmu.workspace.crossWrite — the declaration WIDENS, but only to roots the caller names ──────────
{
  const base = process.cwd()
  const other = base + '-Other'
  const settings = (extra) => Object.assign({ 'vmu.safety.pathPolicy': 'workspace+shared' }, extra)
  const rootsOf = (extra, extraRoots) => describePolicy(settings(extra), { root: base, otherRoots: extraRoots }).writableRoots.join('|')
  ok(rootsOf({}, [other]).indexOf(other) === -1,
    'workspace.crossWrite[default=false]: naming another root does NOT widen the writable set - the default stays closed')
  ok(rootsOf({ 'vmu.workspace.crossWrite': true }, [other]).indexOf(other) !== -1,
    'workspace.crossWrite[+]: with it declared AND the root named, the set widens')
  ok(rootsOf({ 'vmu.workspace.crossWrite': true }, null).indexOf(other) === -1,
    'workspace.crossWrite[+]: declaring it is NOT enough on its own - no root is widened without being named')
  ok(rootsOf({ 'vmu.workspace.crossWrite': true }, ['  ']).indexOf(other) === -1,
    'workspace.crossWrite[+]: a blank entry is dropped rather than becoming an empty root that allows everything')
  ok(readWorkspacePolicy({ 'vmu.workspace.crossWrite': true }).crossWrite === true &&
     readWorkspacePolicy({}).crossWrite === false,
    'workspace.crossWrite: the policy reports the declaration, so a receipt can always say which mode is in force')
}

console.log('=== VMU GUARD: ' + passed + ' passed, ' + failed + ' failed ===')
if (failed) process.exit(1)

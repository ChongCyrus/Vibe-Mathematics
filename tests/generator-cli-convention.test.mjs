#!/usr/bin/env node
// tests/generator-cli-convention.test.mjs - TB-2698: the generator CLI contract, proven by BEHAVIOUR.
//
// WHY. On 2026-11-10 two "verification" runs dirtied six generated documents:
//   `node scripts/generate-coverage-debt.mjs`   - only a --check branch existed; the write at the end was unconditional;
//   `node scripts/update-doc-counts.mjs`        - its own header said "rewrite in place", and --check was the exception;
// while six sibling generators refused to write without --write. Two opposite defaults for the same class of tool is
// not a documentation problem: a read-only-looking command must not change what it measures, and a convention that
// depends on remembering a flag is exactly the drift shape this repository keeps finding. The contract now lives in
// ONE implementation (scripts/_lib/generator-cli.mjs):
//   no flag              => READ  : report what would change, exit 0, write nothing;
//   --check              => CHECK : same report, exit 1 when anything would change;
//   --write              => WRITE : rewrite;
//   --write with --check, or any flag the script does not declare => REFUSE, named, exit 2.
//
// WHY A BEHAVIOUR TEST AND NOT A SOURCE SCAN. A grep for "writeFileSync" is green the moment a write is routed through
// a variable, an indirection, a helper or a second code path. This file never reads a generator's source to decide
// whether it writes: it clones the work tree into os.tmpdir()/gencli-<pid>/, snapshots every file's (mtimeMs, size)
// plus a full sha256, RUNS the generators, and requires the snapshot to be unchanged. Three anti-lamps prove the
// harness can see what it claims to see: (1) put the write guard back to always-on and the same detector must call the
// bare run DIRTY, naming the document; (2) --write must be idempotent in CONTENT (a second --write changes no byte);
// (3) --check must exit 0 on a synced clone and 1 on a one-line change. Every mutation below happens inside the
// throw-away clone and is removed in a `finally`: running this file may not leave a mark on the real tree.
//
// The clone has no .git (it is a work tree, not a repository), which is deliberate: mode resolution must not depend on
// repository state. Scripts whose CLI is not a document writer (e.g. generate-seam-table, which writes to os.tmpdir()
// unless --out says otherwise) are out of scope here and keep their own input-flag contract.
import { cpSync, existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..')
const SKIP_DIRS = new Set(['.git', 'node_modules', '__pycache__', '.cache'])

// Every script that owns a generated document (or a generated contract) in the shipped tree. The list is deliberately
// the WHOLE family, not just the two that caused the accident: the point of one implementation is that a new generator
// cannot inherit the old default by accident.
const CONTRACT = [
  'scripts/update-doc-counts.mjs',
  'scripts/generate-coverage-debt.mjs',
  'scripts/generate-rule-matrix.mjs',
  'scripts/generate-kernel-index.mjs',
  'scripts/generate-surface-index.mjs',
  'scripts/generate-readiness-figures.mjs',
  'scripts/generate-wiring-index.mjs',
  'scripts/generate-vmu-settings-table.mjs',
  'scripts/generate-planned-settings.mjs',
  'scripts/generate-planned-codes.mjs',
  'scripts/generate-glossary-table.mjs',
  'scripts/generate-zero-mechanism-matrix.mjs',
  'scripts/generate-pack-prompts.mjs',
  'scripts/generate-pack-persona.mjs',
  'scripts/generate-wired-schema.mjs',
]
// The scripts a caller is most likely to run "just to check": they are where a silent write costs the most.
const REFUSAL_PROBES = ['scripts/update-doc-counts.mjs', 'scripts/generate-coverage-debt.mjs', 'scripts/generate-rule-matrix.mjs']

let passed = 0
let failed = 0
const failures = []
const ok = (cond, label, detail) => {
  if (cond) { passed++; console.log('  ok   ' + label); return true }
  failed++
  failures.push(label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  console.error('  FAIL ' + label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  return false
}
const tail = (s, n = 4) => String(s || '').trim().split('\n').slice(-n).join(' | ').slice(0, 400)

function walk(root) {
  const out = new Map()
  const rec = (rel) => {
    const abs = rel === '' ? root : join(root, rel)
    for (const e of readdirSync(abs, { withFileTypes: true })) {
      if (SKIP_DIRS.has(e.name)) continue
      const r = rel === '' ? e.name : rel + '/' + e.name
      if (e.isDirectory()) { rec(r); continue }
      if (!e.isFile()) continue
      const st = statSync(join(root, r))
      out.set(r, String(st.mtimeMs) + ':' + st.size)
    }
  }
  rec('')
  return out
}

function hashWalk(root) {
  const out = new Map()
  for (const rel of walk(root).keys()) {
    out.set(rel, createHash('sha256').update(readFileSync(join(root, rel))).digest('hex'))
  }
  return out
}

function diff(before, after) {
  const added = []
  const removed = []
  const changed = []
  for (const [k, v] of after) {
    if (!before.has(k)) added.push(k)
    else if (before.get(k) !== v) changed.push(k)
  }
  for (const k of before.keys()) if (!after.has(k)) removed.push(k)
  return { added, removed, changed }
}
const leaks = (d) => d.added.length + d.removed.length + d.changed.length
const show = (d) => ({ added: d.added.slice(0, 4), removed: d.removed.slice(0, 4), changed: d.changed.slice(0, 8), n: leaks(d) })

function cloneRepo() {
  const dir = mkdtempSync(join(tmpdir(), 'gencli-'))
  cpSync(REPO, dir, {
    recursive: true,
    preserveTimestamps: true,
    filter: (src) => !SKIP_DIRS.has(basename(src)),
  })
  return dir
}

const run = (cwd, script, argv = []) => spawnSync(process.execPath, [script, ...argv], { cwd, encoding: 'utf8', timeout: 180000 })

const contentEqual = (a, b) => {
  const diffed = []
  for (const [k, v] of b) {
    if (!a.has(k)) diffed.push('+' + k)
    else if (a.get(k) !== v) diffed.push('~' + k)
  }
  for (const k of a.keys()) if (!b.has(k)) diffed.push('-' + k)
  return diffed
}

// ---------------------------------------------------------------------------------------------------------------
console.log('=== 0. THE CONTRACT NAMES THE GENERATOR FAMILY ===')
const missing = CONTRACT.filter((s) => {
  try { return !statSync(join(REPO, s)).isFile() } catch { return true }
})
ok(missing.length === 0, 'every script named by the contract exists', { missing })
ok(CONTRACT.length >= 14, 'the contract covers the document-writing generator family, not one example', { n: CONTRACT.length })

// ---------------------------------------------------------------------------------------------------------------
// The core assertion: with NO FLAG, a generator reports and changes nothing.
let dirA = null
let dirB = null
try {
  dirA = cloneRepo()
  const cloneLabel = basename(dirA)
  console.log('=== 1. NO FLAG => READ ONLY (clone ' + cloneLabel + ') ===')
  ok(statSync(dirA).isDirectory(), 'the work tree was cloned into a throw-away directory', { clone: dirA })
  const hashBefore = hashWalk(dirA)
  let previous = walk(dirA)
  for (const script of CONTRACT) {
    const r = run(dirA, script)
    const after = walk(dirA)
    const d = diff(previous, after)
    const clean = leaks(d) === 0
    ok(clean, script + ' with no flag changes NOTHING (a dry run must be read-only)',
      clean ? undefined : Object.assign(show(d), { exit: r.status, out: tail(r.stdout), err: tail(r.stderr) }))
    ok(r.status === 0, script + ' with no flag exits 0 (a dry run reports; it does not fail)', { exit: r.status, out: tail(r.stdout), err: tail(r.stderr) })
    previous = after
  }
  const hashAfter = hashWalk(dirA)
  const lateChange = contentEqual(hashBefore, hashAfter)
  ok(lateChange.length === 0, 'no file CONTENT changed anywhere in the clone across the whole dry-run sweep (sha256, not just mtime)',
    { changed: lateChange.slice(0, 8), n: lateChange.length })

  // -------------------------------------------------------------------------------------------------------------
  console.log('=== 2. --check READS, AND SAYS WHAT IT SEES ===')
  let prev = walk(dirA)
  for (const script of CONTRACT) {
    const r = run(dirA, script, ['--check'])
    const after = walk(dirA)
    const d = diff(prev, after)
    const clean = leaks(d) === 0
    ok(clean, script + ' --check changes NOTHING', clean ? undefined : Object.assign(show(d), { exit: r.status }))
    ok(r.status === 0 || r.status === 1, script + ' --check exits 0 (in sync) or 1 (stale), never a crash', { exit: r.status, err: tail(r.stderr) })
    if (r.status === 1) {
      const said = String(r.stdout || '') + String(r.stderr || '')
      ok(said.trim().length > 0, script + ' --check names what it wants changed instead of failing silently', { exit: 1 })
    }
    prev = after
  }

  // -------------------------------------------------------------------------------------------------------------
  console.log('=== 3. UNDECLARED FLAGS AND CONTRADICTORY MODES ARE REFUSED, NAMED, exit 2 ===')
  const beforeRefusal = walk(dirA)
  for (const script of REFUSAL_PROBES) {
    const u = run(dirA, script, ['--frobnicate'])
    const text = String(u.stdout || '') + String(u.stderr || '')
    ok(u.status === 2 && text.includes('--frobnicate'),
      script + ' refuses an undeclared flag by NAME and exits 2 (so a typo cannot silently mean "dry run")',
      { exit: u.status, said: tail(text) })
    const c = run(dirA, script, ['--write', '--check'])
    const ctext = String(c.stdout || '') + String(c.stderr || '')
    ok(c.status === 2 && ctext.includes('--write') && ctext.includes('--check'),
      script + ' refuses --write together with --check (the contradiction must not be resolved silently)',
      { exit: c.status, said: tail(ctext) })
  }
  ok(leaks(diff(beforeRefusal, walk(dirA))) === 0, 'a refused invocation did not write anything either', show(diff(beforeRefusal, walk(dirA))))

  // -------------------------------------------------------------------------------------------------------------
  console.log('=== 4. ANTI-LAMP 2: --write IS IDEMPOTENT IN CONTENT ===')
  const writeStatuses = CONTRACT.map((script) => {
    const r = run(dirA, script, ['--write'])
    return { script, exit: r.status, err: tail(r.stderr, 2) }
  })
  const broken = writeStatuses.filter((w) => w.exit === null || w.exit > 1)
  ok(broken.length === 0, 'every --write run completed (exit 0, or 1 only where the generator reports a finding)', { broken })
  const synced = hashWalk(dirA)
  for (const script of CONTRACT) run(dirA, script, ['--write'])
  const second = hashWalk(dirA)
  const rewritten = contentEqual(synced, second)
  ok(rewritten.length === 0, 'a second --write changes no byte (one --write is enough; re-running must not churn the tree)',
    { changed: rewritten.slice(0, 8), n: rewritten.length })

  // -------------------------------------------------------------------------------------------------------------
  console.log('=== 5. ANTI-LAMP 3: --check IS 0 WHEN SYNCED AND 1 AFTER A ONE-LINE CHANGE ===')
  const syncedCheck = CONTRACT.filter((script) => run(dirA, script, ['--check']).status !== 0)
  ok(syncedCheck.length === 0, 'after --write, every generator --check exits 0 (the clone is in sync)', { red: syncedCheck })

  const probeModule = join(dirA, 'vibe-math-vmu', 'kernel', 'zz-gencli-probe.js')
  writeFileSync(probeModule,
    '// Probe module for tests/generator-cli-convention.test.mjs: it exists only to make the kernel index stale.\n' +
    'export const zzGencliProbe = true\n')
  const k = run(dirA, 'scripts/generate-kernel-index.mjs', ['--check'])
  const ktext = String(k.stdout || '') + String(k.stderr || '')
  ok(k.status === 1, 'a new kernel module makes `generate-kernel-index.mjs --check` exit 1 (a stale doc is a RED, not a note)', { exit: k.status, said: tail(ktext) })
  ok(ktext.includes('zz-gencli-probe'), 'and the failure names the module that changed', { said: tail(ktext) })
  const readAfterProbe = run(dirA, 'scripts/generate-kernel-index.mjs')
  ok(readAfterProbe.status === 0, 'the same staleness under NO flag stays a report (exit 0) and not a failure', { exit: readAfterProbe.status })
  rmSync(probeModule, { force: true })

  const probeTest = join(dirA, 'tests', 'zz-gencli-probe.test.mjs')
  writeFileSync(probeTest, '// Probe suite for tests/generator-cli-convention.test.mjs: one added job moves the derived counts.\n')
  const c = run(dirA, 'scripts/update-doc-counts.mjs', ['--check'])
  const ctext = String(c.stdout || '') + String(c.stderr || '')
  ok(c.status === 1, 'one added test job makes `update-doc-counts.mjs --check` exit 1', { exit: c.status, said: tail(ctext) })
  ok(/WOULD CHANGE/.test(ctext), 'and it names the sentences it would rewrite', { said: tail(ctext) })
  rmSync(probeTest, { force: true })

  // -------------------------------------------------------------------------------------------------------------
  console.log('=== 6. ANTI-LAMP 1: REMOVE THE WRITE GUARD AND THE HARNESS MUST CALL THE BARE RUN DIRTY ===')
  dirB = cloneRepo()
  const countsPath = join(dirB, 'scripts', 'update-doc-counts.mjs')
  const countsSrc = readFileSync(countsPath, 'utf8')
  const guard = "const WRITE = MODE === 'write'"
  const armed = countsSrc.replace(guard, 'const WRITE = true')
  ok(armed !== countsSrc, 'the guard line this anti-lamp flips is present and unique', { needle: guard })
  writeFileSync(countsPath, armed)
  // A synced tree writes nothing even with the guard gone, so this anti-lamp has to manufacture the condition it is
  // about. One extra counted job makes the derived counts differ from the documents on disk; the un-guarded bare run
  // must then flush exactly those differences. Without this the lamp only lit on a dirty checkout (it went green on a
  // freshly synced tree, which is the vacuous pass this anti-lamp exists to prevent).
  const lampProbe = join(dirB, 'tests', 'zz-gencli-lamp.test.mjs')
  writeFileSync(lampProbe, '// Probe job for anti-lamp 1: moves the derived counts off the documents on disk.\n')
  const beforeLamp = walk(dirB)
  const lp = run(dirB, 'scripts/update-doc-counts.mjs')
  const afterLamp = walk(dirB)
  const dLamp = diff(beforeLamp, afterLamp)
  rmSync(lampProbe, { force: true })
  ok(lp.status === 0, 'the un-guarded bare run still "succeeds" (that is why exit code alone was never a guard)', { exit: lp.status })
  ok(leaks(dLamp) > 0 && dLamp.changed.some((f) => f.endsWith('.md')),
    'with the guard gone, the bare run is DIRTY and this harness reports the document(s) - the assertion is not vacuous',
    Object.assign(show(dLamp), { exit: lp.status }))
} finally {
  if (dirA) rmSync(dirA, { recursive: true, force: true })
  if (dirB) rmSync(dirB, { recursive: true, force: true })
  ok(!dirA || !existsSync(dirA), 'clone A (the read-only run) was removed', dirA)
  ok(!dirB || !existsSync(dirB), 'clone B (the write/anti-lamp run) was removed', dirB)
}

console.log('=== GENERATOR CLI CONVENTION: ' + passed + ' passed, ' + failed + ' failed ===')
if (failed) {
  console.error('FAILURES:\n' + failures.map((f) => '  - ' + f).join('\n'))
  process.exitCode = 1
}

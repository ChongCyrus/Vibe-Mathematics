#!/usr/bin/env node
// vmu pre-flight (T0): the cheap checks that MUST pass before paying for a long gate.
//
// MOVED INTO THE REPOSITORY (handover D-05, round 1). It used to live at
// `_oneoff/vmu/tools/preflight.mjs`, OUTSIDE version control, so a clean clone could not run the gate it
// guards. The only changes from that copy are the path roots (this file now sits in `scripts/`, so the
// repository root is one level up and the doc linter is its sibling) and the linter's label, which now
// names the checks it actually runs instead of claiming a round number.
//
// Rationale (user, 2026-10-09): do not spend 25 minutes on a non-incremental sweep and only then discover
// a wiring mistake. Every item here is either seconds or a minute, and each one covers a failure CLASS
// that a long sweep has actually caught before:
//   · the shared-surface gates (preset rows, installer policy, package membership, README counts, path
//     discipline, math parity/contract) - the vmu iteration scope runs the same set, so T0 and T1 agree;
//   · the GENERATED patch must not have drifted (`build-preset-rows.mjs --check`);
//   · the documented counts must match the derived ones (no hand-edited numbers);
//   · `files[] <-> installer PRESETS <-> worktree` three-way consistency: the exact gap that a T3 sweep
//     found (three modules shipped but not managed by the installer) is now a PRE-FLIGHT item;
//   · the vmu doc linter must be clean;
//   · `--for-t3` additionally requires a CLEAN worktree, so a long sweep never verifies a tree that is
//     half-wired or carries untracked artifacts.
//
// Usage:  node scripts/preflight.mjs [--for-t3] [--json]
// Exit:   0 = safe to run T1/T2/T3, 1 = fix something first.

import { readFileSync, existsSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, join, resolve } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = resolve(HERE, '..')            // scripts/ -> repository root (was: repo location from _oneoff)
const FOR_T3 = process.argv.includes('--for-t3')
const JSON_OUT = process.argv.includes('--json')
const NODE = process.execPath

const results = []
const record = (name, ok, detail) => results.push({ name, ok, detail: detail === undefined ? '' : String(detail) })

const run = (argv, opts = {}) => spawnSync(NODE, argv, { cwd: REPO, encoding: 'utf8', timeout: opts.timeoutMs || 600000 })
const exists = (rel) => existsSync(join(REPO, rel))

// ---- 1. the shared-surface gates (fast; the same set T1 runs) ----------------------------------
const GATES = [
  'tests/audit-preset-rows.test.mjs',
  'tests/audit-preset-mechanism.test.mjs',
  'tests/audit-preset-declaration-group.test.mjs',
  'tests/audit-installer-policy.test.mjs',
  'tests/audit-installer-compat.test.mjs',
  'tests/audit-installer-assertions.mutants.mjs',
  'tests/audit-package-membership.mjs',
  'tests/audit-package-membership.mutants.mjs',
  'tests/audit-vmu-services.test.mjs',
  'tests/audit-readme-counts.mjs',
  'tests/audit-readme-counts.mutants.mjs',
  'tests/audit-path-discipline.mjs',
  'tests/audit-artifact-docs.mjs',
  'tests/audit-math-computation-parity.mjs',
  'tests/audit-math-computation-contract.mjs',
]
for (const g of GATES) {
  if (!exists(g)) { record('gate ' + g, false, 'missing'); continue }
  const r = run([g])
  record('gate ' + g, r.status === 0, r.status === 0 ? 'ok' : (String(r.stdout || '') + String(r.stderr || '')).trim().split('\n').slice(-3).join(' | ').slice(0, 220))
}

// ---- 2. the generated patch must be up to date -------------------------------------------------
{
  const r = run(['scripts/build-preset-rows.mjs', '--check'])
  record('generated cordis.patch.yml is up to date', r.status === 0, (String(r.stdout || '') + String(r.stderr || '')).trim().split('\n').slice(-2).join(' | '))
}

// ---- 3. the documented counts must match the derived ones --------------------------------------
{
  const r = run(['scripts/update-doc-counts.mjs', '--check'])
  const out = (String(r.stdout || '') + String(r.stderr || '')).trim()
  const filesChanged = /files changed=(\d+)/.exec(out)
  record('documented counts match the derived ones', r.status === 0 && filesChanged && filesChanged[1] === '0', out.split('\n').slice(-2).join(' | '))
}

// ---- 3b. the settings table must be GENERATED, not hand-written (04-§11 discipline ③) ----------
{
  const gen = join(REPO, 'scripts', 'generate-vmu-settings-table.mjs')
  if (!existsSync(gen)) record('settings table is generated from the schema', false, 'generator missing')
  else {
    const r = run([gen, '--check'])
    const out = (String(r.stdout || '') + String(r.stderr || '')).trim().split('\n')
    record('settings table is generated from the schema (not a second hand-written copy)', r.status === 0, out.slice(-2).join(' | ').slice(0, 200))
  }
}

// ---- 3c. the two phase-2 REGISTRIES must be what the docs yield (drift is a T0 failure) ---------
// Both are GENERATED from the design volumes, so a volume edit that adds or renames a key/code makes the
// registry stale. Catching it here is the whole point: the docs stay the single source, the registries follow.
for (const [label, rel] of [
  ['plan registry (settings/planned.js) is in sync with the docs', 'scripts/generate-planned-settings.mjs'],
  ['planned-code registry (03-§8 block) is in sync with the docs', 'scripts/generate-planned-codes.mjs'],
  ['glossary table (01-§7) is in sync with glossary.json', 'scripts/generate-glossary-table.mjs'],
  ['wiring index (00-§3.2) is in sync with the registries', 'scripts/generate-wiring-index.mjs'],
]) {
  const gen = join(REPO, rel)
  if (!existsSync(gen)) record(label, false, 'generator missing: ' + rel)
  else {
    const r = run([gen, '--check'])
    const out = (String(r.stdout || '') + String(r.stderr || '')).trim().split('\n')
    record(label, r.status === 0, out.slice(-2).join(' | ').slice(0, 220))
  }
}

// ---- 4. files[] <-> installer PRESETS <-> worktree (the T3-caught class) ------------------------
// NOTE (handover D-05 / docs/11 discipline 19): this item is about files under a PRESET's `src` directory,
// which must appear in BOTH lists. Repo-level tooling (scripts/release-check.mjs, scripts/clean-temp.mjs,
// scripts/preflight.mjs, ...) is registered in `package.json#files` only - the installer copies presets, not
// the repository's gates - and `tests/audit-installer-policy.test.mjs` scopes its own rule the same way
// (`pkg.files.filter((f) => f.startsWith(p.src + '/'))`).
{
  try {
    const pkg = JSON.parse(readFileSync(join(REPO, 'package.json'), 'utf8'))
    const listed = new Set(pkg.files.filter((f) => f.startsWith('vibe-math-vmu/')))
    const mod = await import(pathToFileURL(join(REPO, 'installer.js')).href)
    const entry = (mod.PRESETS || []).find((p) => p.src === 'vibe-math-vmu')
    const managed = new Set((entry ? entry.files : []).map((f) => 'vibe-math-vmu/' + f.replace(/^\.\//, '')))
    const shipped = [...listed].filter((f) => !managed.has(f) && !f.startsWith('vibe-math-vmu/docs/'))
    const missingDocs = [...listed].filter((f) => f.startsWith('vibe-math-vmu/docs/')).filter((f) => !managed.has(f))
    // Runtime modules and tests must be managed by the installer OR be tests (which are not copied).
    const unmanaged = shipped.filter((f) => !/\/tests\//.test(f) && !f.endsWith('preset.yml') && !f.endsWith('agent.cordis.yml'))
    record('installer manages every shipped vmu runtime file', unmanaged.length === 0 && missingDocs.length === 0,
      unmanaged.concat(missingDocs).join(', ') || (listed.size + ' listed / ' + managed.size + ' managed'))
  } catch (e) {
    record('installer manages every shipped vmu runtime file', false, String(e && e.message))
  }
}

// ---- 5. the vmu doc linter ---------------------------------------------------------------------
{
  const linter = join(HERE, 'check-docs.mjs')     // sibling in scripts/ (was: beside it in _oneoff)
  if (!existsSync(linter)) record('vmu doc linter', false, 'check-docs.mjs missing')
  else {
    const r = spawnSync(NODE, [linter], { cwd: REPO, encoding: 'utf8' })
    const out = (String(r.stdout || '') + String(r.stderr || '')).trim().split('\n')
    // The label names the file and its checks (D1-D16 + notes) rather than a round number: the old
    // "(17 checks)" was a hand-typed count that the linter itself never reported.
    record('vmu doc linter (scripts/check-docs.mjs, D1-D16 + notes)', r.status === 0, out.slice(-4).join(' | ').slice(0, 220))
  }
}

// ---- 6. the runner's own self-check ------------------------------------------------------------
{
  const r = run(['tests/run-tests.mjs', '--self-check'])
  record('run-tests --self-check', r.status === 0, (String(r.stdout || '')).trim().split('\n').slice(-1)[0].slice(0, 160))
}

// ---- 7. --for-t3: the worktree must be clean ---------------------------------------------------
if (FOR_T3) {
  const r = spawnSync('git', ['status', '--porcelain'], { cwd: REPO, encoding: 'utf8' })
  const dirty = String(r.stdout || '').split('\n').filter((l) => l.trim().length > 0)
  record('worktree is clean (no half-wired or untracked artifacts)', dirty.length === 0, dirty.slice(0, 6).join(' | '))
}

// ---- report ------------------------------------------------------------------------------------
const failed = results.filter((x) => !x.ok)
if (JSON_OUT) console.log(JSON.stringify({ repo: REPO, forT3: FOR_T3, results }, null, 2))
else {
  console.log('vmu pre-flight (T0' + (FOR_T3 ? ', for T3' : '') + '): ' + (results.length - failed.length) + '/' + results.length + ' checks passed')
  for (const r of results) console.log((r.ok ? '  ok   ' : '  FAIL ') + r.name + (r.ok || !r.detail ? '' : '  -> ' + r.detail))
  console.log(failed.length === 0
    ? 'PREFLIGHT: PASS - safe to run ' + (FOR_T3 ? 'the non-incremental full sweep (T3)' : 'a gate')
    : 'PREFLIGHT: FAIL - fix the items above BEFORE paying for a long sweep')
}
process.exit(failed.length === 0 ? 0 : 1)

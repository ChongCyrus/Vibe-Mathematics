#!/usr/bin/env node
/**
 * Mutant harness for tests/math-computation-shared.test.mjs §23 / §23b (ENGINE DISCOVERY) and §24 (install
 * suggestions must be runnable). Ships: `tests/*.mutants.mjs`. Replaces the dev-only drafts
 * `_oneoff/auditR2/round9-mutants.mjs` (m3, m4) and `_oneoff/auditR2/roundB-mutants.mjs` (b1/b2).
 *
 * §23: an engine INSTALLED but not on PATH must still be discovered (R's default install dir); §23b: the
 * same walker covers Octave and Julia, and every engine with a well-defined default dir declares per-OS
 * roots. The roots are INJECTED through the host seam, so the fixtures do not depend on this machine's
 * `ProgramFiles`/`LOCALAPPDATA` (the round-B F4 fix).
 *
 * Each case copies `math-engines.js` + a ONE-SITE-mutated `math-computation.js` into a private dir and runs
 * the SHIPPED suite through `MATH_COMPUTATION_MODULE`, requiring the named §23/§23b assertion to redden.
 * Baseline: the same copied setup, UNMUTATED, must stay green (so the mutation is the only red cause).
 *
 * Run: node tests/math-computation-discovery.mutants.mjs
 */
import { mkdtempSync, copyFileSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const HERE = fileURLToPath(new URL('./', import.meta.url))
const REPO = join(HERE, '..')
const SRC = join(REPO, 'vibe-math-v2')
const SUITE = join(HERE, 'math-computation-shared.test.mjs')
let passed = 0, failed = 0
const ok = (c, l, d) => { if (c) { passed++; console.log('  ok   ' + l) } else { failed++; console.log('  FAIL ' + l + (d ? ' — ' + d : '')) } }

function runSuite(dir) {
  const r = spawnSync(process.execPath, [SUITE], { cwd: REPO, encoding: 'utf8', maxBuffer: 1 << 26, env: Object.assign({}, process.env, { MATH_COMPUTATION_MODULE: join(dir, 'math-computation.js') }) })
  const o = String(r.stdout || '') + String(r.stderr || '')
  return { status: r.status, out: o, failLines: o.split('\n').filter((l) => /^\s*FAIL\b/.test(l)), sum: (o.split('\n').filter((l) => /passed, \d+ failed/.test(l)).slice(-1)[0] || '').trim() }
}
const M3_FROM = "  // round-9: then the known per-OS install locations (an engine installed without touching PATH).\n  for (const p of await knownInstallCandidates(H, d.name)) {\n    if (typeof p === 'string' && p) return { exe: p, via: 'known-install' }\n  }\n"
const CASES = [
  { name: 'm3: the known-install-location lookup is dropped (PATH + bundled runtime only)',
    expect: 'a Rscript that exists ONLY in the default install dir is discovered',
    edit: (t) => t.replace(M3_FROM, '') },
  { name: 'b1: the host-injected install roots are ignored (back to ambient env)',
    expect: 'a Rscript that exists ONLY in the default install dir is discovered',
    edit: (t) => t.replace('const roots = injected || mathInstallRoots(engineName, env, win)', 'const roots = mathInstallRoots(engineName, env, win)') },
  { name: 'b2: the octave/julia per-OS root entries are removed',
    expect: 'every engine with a well-defined default install dir declares per-OS roots: octave',
    edit: (t) => t.split('octave: win').join('octaveDisabled: win').split('julia: win').join('juliaDisabled: win') },
  { name: 'm4: a package manager is assumed available (a command that cannot run is offered)',
    expect: 'no runnable-looking command when its package manager is absent',
    edit: (t) => t.replace("    try { available = !!(await H.resolveExecutable(mgr)) } catch (e) { available = false }", '    available = true') },
]

// baseline: the copied setup, unmutated, must stay green
{
  const dir = mkdtempSync(join(tmpdir(), 'mc-discovery-base-'))
  copyFileSync(join(SRC, 'math-engines.js'), join(dir, 'math-engines.js'))
  copyFileSync(join(SRC, 'math-computation.js'), join(dir, 'math-computation.js'))
  const b = runSuite(dir)
  ok(b.status === 0, 'baseline: the shipped suite is green on the copied module pair (so a red below is the mutation)', b.sum.slice(0, 70))
  rmSync(dir, { recursive: true, force: true })
}
const ORIGIN = readFileSync(join(SRC, 'math-computation.js'), 'utf8')
for (const c of CASES) {
  const mutated = c.edit(ORIGIN)
  if (mutated === ORIGIN) { ok(false, c.name + ' — the single-site anchor applies', 'ANCHOR MISS'); continue }
  const dir = mkdtempSync(join(tmpdir(), 'mc-discovery-mut-'))
  copyFileSync(join(SRC, 'math-engines.js'), join(dir, 'math-engines.js'))
  writeFileSync(join(dir, 'math-computation.js'), mutated)
  const r = runSuite(dir)
  const named = r.failLines.some((l) => l.indexOf(c.expect) !== -1)
  ok(r.status !== 0 && named, '★ ' + c.name + ' -> ' + r.sum, named ? '' : 'named red not found (unit: named §23/§23b assertion labels)')
  if (!named) for (const l of r.failLines.slice(0, 3)) console.log('        ' + l.trim().slice(0, 140))
  rmSync(dir, { recursive: true, force: true })
}
console.log('')
console.log('=== MATH DISCOVERY MUTANTS: ' + passed + ' passed, ' + failed + ' failed ===')
process.exit(failed === 0 ? 0 : 1)

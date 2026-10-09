// vmu docs audit — the MUTANT FAMILY (the repository's standard: every guard must be shown to fail).
//
// Each mutant copies the real design set (and, where needed, the real modules) into a scratch directory,
// breaks ONE thing, points the audit's injected roots at the copy, and requires the audit to go RED with
// the NAMED assertion. A guard that cannot fail is not a guard.
//
// Mutants:
//   M1 a design doc is missing            -> "the design set is exactly 15 docs"
//   M2 a design doc is emptied            -> "design doc is non-trivial"
//   M3 a doc uses an unregistered code    -> "every VMU_* code used in the docs is registered"
//   M4 a module throws an unregistered code -> "every framework VMU_* code the CODE can throw is registered"
//   M5 a doc loses its 未核项 section      -> "every doc that must declare its open questions"
//   M6 a module gains an undocumented method -> "the module does not expose methods the contract omits"
//
// Usage: node tests/audit-vmu-docs.mutants.mjs

import { cpSync, mkdtempSync, readFileSync, writeFileSync, rmSync, mkdirSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const HERE = fileURLToPath(new URL('./', import.meta.url))
const REPO = resolve(HERE, '..')
const AUDIT = join(HERE, 'audit-vmu-docs.test.mjs')
const REAL_DOCS = join(REPO, 'vibe-math-vmu', 'docs')
const REAL_VMU = join(REPO, 'vibe-math-vmu')

const scratch = mkdtempSync(join(tmpdir(), 'vmu-docs-mutants-'))
let passed = 0, failed = 0
const failures = []
const ok = (cond, name, detail) => {
  if (cond) passed++
  else { failed++; failures.push(name + (detail === undefined ? '' : ' [' + detail + ']')) }
}

const runAudit = (docsDir, codeDir) => {
  const env = Object.assign({}, process.env, { VMU_DOCS_DIR: docsDir, VMU_CODE_DIR: codeDir })
  const r = spawnSync(process.execPath, [AUDIT], { env, encoding: 'utf8' })
  return { code: r.status, out: String(r.stdout || '') + String(r.stderr || '') }
}

const freshCopy = (tag) => {
  const dir = join(scratch, tag)
  mkdirSync(dir, { recursive: true })
  cpSync(REAL_DOCS, join(dir, 'docs'), { recursive: true })
  cpSync(REAL_VMU, join(dir, 'vmu'), { recursive: true, filter: (src) => !src.includes('docs') })
  // The modules import each other with relative paths, and settings/schema.js imports ../math-computation.js,
  // so the copy keeps the package shape (vmu/kernel/..., vmu/settings/..., vmu/math-computation.js).
  return { docs: join(dir, 'docs'), code: join(dir, 'vmu') }
}

// ---- M1: a missing doc ---------------------------------------------------------------------------
{
  const c = freshCopy('m1')
  // Delete a doc that ACTUALLY exists in the copy (a guessed filename deleted nothing, which is exactly the
  // "the mutants must be proven to bite" rule).
  const victim = readdirSync(c.docs).filter((f) => /^\d\d-.*\.md$/.test(f)).sort().pop()
  rmSync(join(c.docs, victim), { force: true })
  const r = runAudit(c.docs, c.code)
  ok(r.code !== 0 && /the design set is exactly 15 docs/.test(r.out), 'M1 a missing doc is a NAMED red (' + victim + ')', r.out.split('\n')[1])
}

// ---- M2: an emptied doc --------------------------------------------------------------------------
{
  const c = freshCopy('m2')
  writeFileSync(join(c.docs, '11-gates-and-development.md'), '# x\n', 'utf8')
  const r = runAudit(c.docs, c.code)
  ok(r.code !== 0 && /design doc is non-trivial/.test(r.out), 'M2 an emptied doc is a NAMED red', r.out.split('\n')[1])
}

// ---- M3: an unregistered code in the docs --------------------------------------------------------
{
  const c = freshCopy('m3')
  const p = join(c.docs, '05-middleware.md')
  writeFileSync(p, readFileSync(p, 'utf8') + '\n当一个中间件拒绝时，内核抛出 `VMU_MUTANT_UNREGISTERED`。\n', 'utf8')
  const r = runAudit(c.docs, c.code)
  ok(r.code !== 0 && /every VMU_\* code used in the docs is registered/.test(r.out) && /VMU_MUTANT_UNREGISTERED/.test(r.out),
    'M3 an unregistered doc code is a NAMED red', r.out.split('\n')[1])
}

// ---- M4: an unregistered code in the CODE --------------------------------------------------------
{
  const c = freshCopy('m4')
  const p = join(c.code, 'kernel', 'members.js')
  writeFileSync(p, readFileSync(p, 'utf8').replace(
    "throw refuse('VMU_INVALID_ARGUMENT', 'unknown role slot: ' + String(slotId),",
    "throw refuse('VMU_MUTANT_FROM_CODE', 'unknown role slot: ' + String(slotId),"), 'utf8')
  const r = runAudit(c.docs, c.code)
  ok(r.code !== 0 && /every framework VMU_\* code the CODE can throw/.test(r.out) && /VMU_MUTANT_FROM_CODE/.test(r.out),
    'M4 an unregistered code thrown by a module is a NAMED red', r.out.split('\n')[1])
}

// ---- M5: a doc loses its open-questions section --------------------------------------------------
{
  const c = freshCopy('m5')
  const name = '03-interface-contract.md'
  const text = readFileSync(join(c.docs, name), 'utf8')
  writeFileSync(join(c.docs, name), text.replace(/未核项/g, '待议'), 'utf8')
  const r = runAudit(c.docs, c.code)
  ok(r.code !== 0 && /every doc that must declare its open questions/.test(r.out), 'M5 a doc without 未核项 is a NAMED red', r.out.split('\n')[1])
}

// ---- M6: a module gains an undocumented method ---------------------------------------------------
{
  const c = freshCopy('m6')
  const p = join(c.code, 'kernel', 'members.js')
  const text = readFileSync(p, 'utf8')
  writeFileSync(p, text.replace(
    '    /** The declared slots (kernel view: names, capacities, opaque permissions). */',
    '    mutantExtraSurface() { return null },\n\n    /** The declared slots (kernel view: names, capacities, opaque permissions). */'), 'utf8')
  const r = runAudit(c.docs, c.code)
  ok(r.code !== 0 && /does not expose methods the contract omits/.test(r.out) && /mutantExtraSurface/.test(r.out),
    'M6 an undocumented public surface is a NAMED red', r.out.split('\n')[1])
}

// ---- the unmutated copy must stay GREEN (the mutants prove the audit, they must not be its cause) --
{
  const c = freshCopy('control')
  const r = runAudit(c.docs, c.code)
  ok(r.code === 0, 'the unmutated copy is GREEN (the mutants, not the audit, cause the reds)', r.out.split('\n')[0])
}

rmSync(scratch, { recursive: true, force: true })
console.log('=== VMU DOCS AUDIT MUTANTS: ' + passed + ' passed, ' + failed + ' failed ===')
for (const f of failures) console.log('  FAIL ' + f)
process.exit(failed === 0 ? 0 : 1)

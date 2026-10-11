// vmu release-shape audit — the MUTANT FAMILY (every guard must be shown to fail).
//
// Each mutant copies the real inputs into a scratch directory, breaks ONE thing, points the audit's
// injected roots at the copies, and requires the audit to go RED with the NAMED assertion:
//
//   R1 a middleware form's scenario job is not shipped   -> "the scenario job is SHIPPED"
//   R2 a real-machine matrix row has an invalid status   -> "every matrix row states an allowed status"
//   R3 a PASS row cites no evidence                      -> "every PASS cites evidence"
//   R4 the preset no longer declares the plugin row      -> "the preset declares the vmu plugin entry"
//   R5 docs/05 stops naming a middleware form            -> "docs/05 names the M4 form"
//
// Usage: node tests/audit-vmu-release.mutants.mjs

// Explicit filters preserve every fixture while avoiding Node's Windows native directory-copy/ACL path.
import { cpSync, mkdtempSync, readFileSync, writeFileSync, rmSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const HERE = fileURLToPath(new URL('./', import.meta.url))
const REPO = resolve(HERE, '..')
const AUDIT = join(HERE, 'audit-vmu-release.test.mjs')
const REAL_VMU = join(REPO, 'vibe-math-vmu')

const scratch = mkdtempSync(join(tmpdir(), 'vmu-release-mutants-'))
let passed = 0, failed = 0
const failures = []
const ok = (cond, name, detail) => {
  if (cond) passed++
  else { failed++; failures.push(name + (detail === undefined ? '' : ' [' + detail + ']')) }
}

const runAudit = ({ docs, pkg, preset }) => {
  const env = Object.assign({}, process.env)
  if (docs) env.VMU_DOCS_DIR = docs
  if (pkg) env.VMU_PKG = pkg
  if (preset) env.VMU_PRESET = preset
  const r = spawnSync(process.execPath, [AUDIT], { env, encoding: 'utf8' })
  return { code: r.status, out: String(r.stdout || '') + String(r.stderr || '') }
}

const freshCopy = (tag) => {
  const dir = join(scratch, tag)
  mkdirSync(dir, { recursive: true })
  cpSync(join(REAL_VMU, 'docs'), join(dir, 'docs'), { recursive: true, filter: () => true })
  cpSync(join(REAL_VMU, 'agent.cordis.yml'), join(dir, 'agent.cordis.yml'))
  cpSync(join(REPO, 'package.json'), join(dir, 'package.json'))
  return { docs: join(dir, 'docs'), pkg: join(dir, 'package.json'), preset: join(dir, 'agent.cordis.yml') }
}

// ---- R1: a form's scenario job is not shipped ----------------------------------------------------
{
  const c = freshCopy('r1')
  const pkg = JSON.parse(readFileSync(c.pkg, 'utf8'))
  pkg.files = pkg.files.filter((f) => f !== 'tests/vmu-loader.test.mjs')
  writeFileSync(c.pkg, JSON.stringify(pkg, null, 2), 'utf8')
  const r = runAudit(c)
  ok(r.code !== 0 && /M2 code modules: the scenario job is SHIPPED/.test(r.out),
    'R1 an unshipped scenario job is a NAMED red', r.out.split('\n')[1])
}

// ---- R2: an invalid matrix status -----------------------------------------------------------------
{
  const c = freshCopy('r2')
  const file = join(c.docs, '11-gates-and-development.md')
  const text = readFileSync(file, 'utf8')
  writeFileSync(file, text.replace('| **PASS** ✓ |', '| **SOMEWHAT** |'), 'utf8')
  const r = runAudit(c)
  ok(r.code !== 0 && /every matrix row states an allowed status/.test(r.out),
    'R2 an invalid matrix status is a NAMED red', r.out.split('\n')[1])
}

// ---- R3: a PASS row without evidence --------------------------------------------------------------
{
  const c = freshCopy('r3')
  const file = join(c.docs, '11-gates-and-development.md')
  const text = readFileSync(file, 'utf8')
  // Empty the LAST cell of every PASS row (the evidence column).
  const mutated = text.split('\n').map((line) => {
    if (!/^\|/.test(line) || !/PASS/.test(line)) return line
    const cells = line.split('|')
    if (cells.length < 4) return line
    cells[cells.length - 2] = ' '
    return cells.join('|')
  }).join('\n')
  writeFileSync(file, mutated, 'utf8')
  const r = runAudit(c)
  ok(r.code !== 0 && /every PASS cites evidence/.test(r.out),
    'R3 a PASS without evidence is a NAMED red', r.out.split('\n')[1])
}

// ---- R4: the preset stops declaring the plugin row ------------------------------------------------
{
  const c = freshCopy('r4')
  const text = readFileSync(c.preset, 'utf8')
  writeFileSync(c.preset, text.replace(/vibe-math-vmu\.js/g, 'some-other-plugin.js'), 'utf8')
  const r = runAudit(c)
  ok(r.code !== 0 && /the preset declares the vmu plugin entry/.test(r.out),
    'R4 a preset without the plugin row is a NAMED red', r.out.split('\n')[1])
}

// ---- R5: docs/05 stops naming a form --------------------------------------------------------------
{
  const c = freshCopy('r5')
  const file = join(c.docs, '05-middleware.md')
  const text = readFileSync(file, 'utf8')
  writeFileSync(file, text.replace(/\bM4\b/g, 'MX'), 'utf8')
  const r = runAudit(c)
  ok(r.code !== 0 && /docs\/05 names the M4 form/.test(r.out),
    'R5 a document that stops naming a form is a NAMED red', r.out.split('\n')[1])
}

// ---- the unmutated copies must stay GREEN --------------------------------------------------------
{
  const c = freshCopy('control')
  const r = runAudit(c)
  ok(r.code === 0, 'the unmutated copies are GREEN (the mutants, not the audit, cause the reds)', r.out.split('\n')[0])
}

rmSync(scratch, { recursive: true, force: true })
console.log('=== VMU RELEASE MUTANTS: ' + passed + ' passed, ' + failed + ' failed ===')
for (const f of failures) console.log('  FAIL ' + f)
process.exit(failed === 0 ? 0 : 1)

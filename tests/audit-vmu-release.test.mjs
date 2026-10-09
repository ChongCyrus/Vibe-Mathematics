// vmu release-shape audit — the machine-checkable part of the release gate (docs/11 §7, §9.6).
//
// The release gate for vmu has two halves: the repository gate (which this job extends) and the
// real-machine set. A machine cannot run the real-machine set, but it CAN refuse to let the claim drift:
//
//   F. every middleware FORM (M1 rules, M2 modules, M3 scripts, M4 packs) has at least one scenario job,
//      and that job is shipped (listed in package.json#files) - a form without a scenario is unverified;
//   G. the real-machine matrix in docs/11 §9.6 keeps its discipline: every row states a status from the
//      allowed set, and every row claiming PASS cites a non-empty evidence cell (a PASS without a path is
//      exactly the overclaim the playbook forbids);
//   H. the shipped preset really declares this package's plugin row (a preset whose row is missing ships
//      documentation with no mechanism);
//   I. docs/05 names all four forms (the middleware document and the implementation stay in step).
//
// `tests/audit-vmu-release.mutants.mjs` breaks each of these and requires the named red.

import { readFileSync, existsSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = fileURLToPath(new URL('./', import.meta.url))
const REPO = resolve(HERE, '..')
const VMU = join(REPO, 'vibe-math-vmu')
const DOCS = process.env.VMU_DOCS_DIR ? resolve(process.env.VMU_DOCS_DIR) : join(VMU, 'docs')
const PKG = process.env.VMU_PKG ? resolve(process.env.VMU_PKG) : join(REPO, 'package.json')
// The preset file is injectable too, so the mutant family can break the preset declaration without ever
// touching the real one (the same seam discipline as the docs and package paths).
const PRESET = process.env.VMU_PRESET ? resolve(process.env.VMU_PRESET) : join(VMU, 'agent.cordis.yml')

let passed = 0, failed = 0
const failures = []
const ok = (cond, name, detail) => {
  if (cond) passed++
  else { failed++; failures.push(name + (detail === undefined ? '' : ' [' + detail + ']')) }
}

const pkg = JSON.parse(readFileSync(PKG, 'utf8'))
const shipped = new Set(pkg.files || [])

// ---- F. every middleware form has a scenario job, and the job ships ------------------------------
{
  const FORMS = {
    'M1 declarative rules': 'tests/vmu-rules.test.mjs',
    'M2 code modules': 'tests/vmu-loader.test.mjs',
    'M3 scripts/workflows': 'tests/vmu-script-bridge.test.mjs',
    'M4 packs/public face': 'tests/vmu-registry.test.mjs',
  }
  for (const [form, job] of Object.entries(FORMS)) {
    ok(existsSync(join(REPO, job)), form + ' has a scenario job', job)
    ok(shipped.has(job), form + ': the scenario job is SHIPPED (listed in package.json files[])', job)
  }
  ok(shipped.has('tests/vmu-host-hooks.test.mjs'), 'the host bridge (where the forms actually fire) is shipped')
  ok(shipped.has('tests/vmu-pack.test.mjs') && shipped.has('tests/vmu-containment.test.mjs'),
    'the pack loader and the containment proof are shipped')
}

// ---- G. the real-machine matrix keeps its discipline ---------------------------------------------
{
  const text = readFileSync(join(DOCS, '11-gates-and-development.md'), 'utf8')
  const section = (text.split('### 9.6')[1] || '').split('\n### ')[0]
  const rows = section.split('\n').filter((l) => /^\|/.test(l) && !/^\|\s*-+/.test(l) && !/^\|\s*期集/.test(l))
  ok(rows.length >= 8, 'the real-machine matrix has rows', rows.length)
  const ALLOWED = ['PASS', 'NON-RESULT', '未做', '部分']
  let passRows = 0
  const bad = []
  for (const row of rows) {
    const cells = row.split('|').map((c) => c.trim())
    const status = cells.find((c) => ALLOWED.some((a) => c.startsWith(a) || c.includes(a)))
    if (!status) { bad.push('no allowed status: ' + row.slice(0, 60)); continue }
    if (status.includes('PASS')) {
      passRows++
      // the LAST cell must cite evidence (a path), not be empty or a dash
      const evidence = cells[cells.length - 2]
      if (!evidence || evidence === '—' || evidence === '-') bad.push('PASS without evidence: ' + row.slice(0, 60))
    }
  }
  ok(bad.length === 0, 'every matrix row states an allowed status and every PASS cites evidence', bad.slice(0, 3).join(' | '))
  ok(passRows >= 8, 'the matrix records a substantial number of proven rows', passRows)
  ok(/NON-RESULT/.test(section) || /未做/.test(section), 'the matrix also records what is NOT done (no silent omission)')
}

// ---- H. the shipped preset declares this package's plugin row ------------------------------------
{
  const preset = readFileSync(PRESET, 'utf8')
  ok(/vibe-math-vmu\.js/.test(preset), 'the preset declares the vmu plugin entry (preset-local plugin reference)')
  ok(/vibe-math-vmu/.test(preset), 'and the preset names the plugin row id')
  ok(/──\s*Vibe Math Unify/.test(preset), 'the preset keeps its anchor header (the generated-rows guard depends on it)')
}

// ---- I. the middleware document names all four forms --------------------------------------------
{
  const doc = readFileSync(join(DOCS, '05-middleware.md'), 'utf8')
  for (const form of ['M1', 'M2', 'M3', 'M4']) {
    ok(new RegExp('\\b' + form + '\\b').test(doc), 'docs/05 names the ' + form + ' form')
  }
  // The document's own wording is "内核零策略" (the kernel holds no policy) - assert the DOCUMENT's phrase,
  // not a phrase this audit invented.
  ok(/零策略/.test(doc), 'docs/05 states that the kernel holds no policy (内核零策略)')
}

console.log('=== VMU RELEASE SHAPE: ' + passed + ' passed, ' + failed + ' failed ===')
for (const f of failures) console.log('  FAIL ' + f)
process.exit(failed === 0 ? 0 : 1)

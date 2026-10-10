#!/usr/bin/env node
// vmu registry chain — ONE command for every GENERATED artefact in this repo.
//
// WHY: four registries are derived from the design volumes (glossary table, planned keys, planned codes, the
// generated settings table) plus a wiring index and the documented counts. Writing a volume moves all of them,
// and running five scripts by hand in the right order was the actual source of the "stale registry" churn that
// kept blocking commits. The ORDER below is a dependency order, not a preference:
//
//   1. glossary.json  -> docs/01-§7            (independent, but first keeps the rest deterministic)
//   2. docs volumes   -> settings/planned.js    (the plan registry reads every volume)
//   3. docs volumes   -> docs/03-§8 block       (planned codes, plus the implementation-status subsection)
//   4. schema         -> docs/04-§11            (needs planned.js composed into SETTING_DEFS)
//   5. the above      -> docs/00-§3.2           (the wiring index READS planned.js and docs/04-§11; it refuses
//                                                to run while the settings table is stale, on purpose)
//   6. derived counts -> README / checklist      (last: it counts whatever the steps above produced)
//
//   node scripts/regen-all.mjs            # write everything
//   node scripts/regen-all.mjs --check    # verify everything, exit 1 on any drift
import { spawnSync } from 'node:child_process'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const CHECK = process.argv.includes('--check')
const STEPS = [
  ['glossary table (docs/01-§7)', 'scripts/generate-glossary-table.mjs'],
  // ROUND 70: the wired schema MUST come before the plan registry - that registry's `coreKeys()` reads whatever
  // settings/schema.js declares, so writing the schema second would leave the planned list holding keys the
  // schema now owns. Ordering is the whole point of putting this here instead of running it by hand.
  ['wired schema (settings/schema.js)', 'scripts/generate-wired-schema.mjs'],
  ['plan registry (settings/planned.js)', 'scripts/generate-planned-settings.mjs'],
  ['planned-code registry (docs/03-§8)', 'scripts/generate-planned-codes.mjs'],
  ['settings table (docs/04-§11)', 'scripts/generate-vmu-settings-table.mjs'],
  ['wiring index (docs/00-§3.2)', 'scripts/generate-wiring-index.mjs'],
  ['documented counts (README / checklist)', 'scripts/update-doc-counts.mjs'],
  ['zero-mechanism matrix (docs/11-§) ', 'scripts/generate-zero-mechanism-matrix.mjs', '--write'],
]

let failed = 0
for (const [label, script] of STEPS) {
  const args = [join(REPO, script)].concat(CHECK ? ['--check'] : ['--write'])
  const r = spawnSync(process.execPath, args, { cwd: REPO, encoding: 'utf8' })
  const out = String(r.stdout || '') + String(r.stderr || '')
  const last = out.trim().split('\n').filter(Boolean).slice(-1)[0] || ''
  const okStep = r.status === 0
  if (!okStep) failed++
  console.log((okStep ? '  ok   ' : '  FAIL ') + label + (last ? ' :: ' + last.slice(0, 140) : ''))
}
console.log('')
console.log('=== vmu regen-all: ' + (STEPS.length - failed) + '/' + STEPS.length + ' ' + (CHECK ? 'in sync' : 'written') + ' ===')
process.exit(failed === 0 ? 0 : 1)

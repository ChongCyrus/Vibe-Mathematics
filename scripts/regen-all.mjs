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
//
// PERFORMANCE (measured 2026-10-23): `--check` only READS, so its steps are independent of one another and were
// run sequentially for no reason — 16 spawns, ~8 s. They now run in a bounded pool (~1.5 s on this checkout).
// WRITE mode keeps the strict dependency order above: that is the whole point of the list.
import { spawn, spawnSync } from 'node:child_process'
import { availableParallelism } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const CHECK = process.argv.includes('--check')
const STEPS = [
  ['coverage debt (docs/acceptance/audit-coverage-debt.md)', 'scripts/generate-coverage-debt.mjs', '--write'],
  ['glossary table (docs/01-§7)', 'scripts/generate-glossary-table.mjs'],
  // ROUND 136: the pack prompt TEXT is generated from the corpus so the pack cannot become a second, drifting copy.
  // It is in the chain for the same reason every other generated artefact is: a difference between the module and
  // the corpus must be a CHECK FAILURE, not something a reader has to notice.
  ['pack prompts (packs/v5r-prompts.js)', 'scripts/generate-pack-prompts.mjs'],
  ['pack persona (packs/v5r-persona.js)', 'scripts/generate-pack-persona.mjs'],
  // ROUND 70: the wired schema MUST come before the plan registry - that registry's `coreKeys()` reads whatever
  // settings/schema.js declares, so writing the schema second would leave the planned list holding keys the
  // schema now owns. Ordering is the whole point of putting this here instead of running it by hand.
  ['wired schema (settings/schema.js)', 'scripts/generate-wired-schema.mjs'],
  ['plan registry (settings/planned.js)', 'scripts/generate-planned-settings.mjs'],
  ['planned-code registry (docs/03-§8)', 'scripts/generate-planned-codes.mjs'],
  ['settings table (docs/04-§11)', 'scripts/generate-vmu-settings-table.mjs'],
  ['wiring index (docs/00-§3.2)', 'scripts/generate-wiring-index.mjs'],
  ['readiness figures (docs/00-§7.6)', 'scripts/generate-readiness-figures.mjs'],
  ['documented counts (README / checklist)', 'scripts/update-doc-counts.mjs'],
  ['zero-mechanism matrix (docs/11-§) ', 'scripts/generate-zero-mechanism-matrix.mjs', '--write'],
  ['kernel index (docs/02)', 'scripts/generate-kernel-index.mjs', '--write'],
  ['surface indexes (docs/03/04/05/18)', 'scripts/generate-surface-index.mjs', '--write'],
  // these two now check by default, so they are safe to run as part of regen-all's bare passes too
  ['pack prompts (packs/v5r-prompts.js) [check]', 'scripts/generate-pack-prompts.mjs'],
  ['pack persona (packs/v5r-persona.js) [check]', 'scripts/generate-pack-persona.mjs'],
]

const lastLine = (out) => String(out || '').trim().split('\n').filter(Boolean).slice(-1)[0] || ''

if (!CHECK) {
  // WRITE MODE: strictly sequential, because each step may consume what the previous one wrote.
  let failed = 0
  for (const [label, script] of STEPS) {
    const r = spawnSync(process.execPath, [join(REPO, script), '--write'], { cwd: REPO, encoding: 'utf8' })
    const out = String(r.stdout || '') + String(r.stderr || '')
    const okStep = r.status === 0
    if (!okStep) failed++
    console.log((okStep ? '  ok   ' : '  FAIL ') + label + (lastLine(out) ? ' :: ' + lastLine(out).slice(0, 140) : ''))
  }
  console.log('')
  console.log('=== vmu regen-all: ' + (STEPS.length - failed) + '/' + STEPS.length + ' written ===')
  process.exit(failed === 0 ? 0 : 1)
}

// CHECK MODE: read-only and order-independent, so run the (deduplicated) generators concurrently.
// Deduplicated because two steps are the same pack-prompt/persona check listed in both halves of the chain.
const spawnStep = (script) => new Promise((resolve) => {
  const child = spawn(process.execPath, [join(REPO, script), '--check'], { cwd: REPO, stdio: ['ignore', 'pipe', 'pipe'] })
  let out = ''
  child.stdout.setEncoding('utf8').on('data', (d) => { out += d })
  child.stderr.setEncoding('utf8').on('data', (d) => { out += d })
  child.on('close', (status) => resolve({ status, out }))
  child.on('error', (err) => resolve({ status: -1, out: String(err) }))
})
const scripts = [...new Set(STEPS.map(([, script]) => script))]
const results = new Map()
const POOL = Math.max(1, Math.min(8, availableParallelism() - 1))
let cursor = 0
await Promise.all(Array.from({ length: Math.min(POOL, scripts.length) }, async () => {
  while (cursor < scripts.length) {
    const script = scripts[cursor++]
    results.set(script, await spawnStep(script))
  }
}))
let failed = 0
for (const [label, script] of STEPS) {
  const r = results.get(script)
  const okStep = r.status === 0
  if (!okStep) failed++
  console.log((okStep ? '  ok   ' : '  FAIL ') + label + (lastLine(r.out) ? ' :: ' + lastLine(r.out).slice(0, 140) : ''))
}
console.log('')
console.log('=== vmu regen-all: ' + (STEPS.length - failed) + '/' + STEPS.length + ' in sync ===')
process.exit(failed === 0 ? 0 : 1)

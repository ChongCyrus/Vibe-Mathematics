// tests/audit-math-computation-parity.mutants.mjs — Round 3 / handover C: the PERMANENT canonical mutant family.
//
// WHY A WRAPPER. The family itself lives INSIDE the parity gate (`--mutants`), because a mutant and the assertion
// it must trip belong in one file - splitting them is how a mutant silently stops matching its target. But the
// gate RUNNER (`tests/run-tests.mjs`) classifies mutant families by FILE NAME (`*.mutants.mjs`, see
// `isFamilyJob`), and family jobs get the heavy time budget. This wrapper is therefore the registration surface:
// it runs the gate's family and mirrors its exit code, so `node tests/run-tests.mjs` exercises the family and T0/T1
// fail if any mutation stops reddening (or if the pristine control ever does).
//
// WHAT IT PROVES (4 children, each a real subprocess through the documented env seams):
//   ① change one failure code      ⇒ EXIT=1 + "failure codes: same SET as the reference"
//   ② change one default value     ⇒ EXIT=1 + "param defaults: same key set and same values"
//   ③ reorder engine candidates    ⇒ EXIT=1 + "engine descriptors: dispatch order"
//   ④ CONTROL: an unmutated copy   ⇒ EXIT=0 (so "everything is red" cannot pass for a proof)
// Run directly: node tests/audit-math-computation-parity.mutants.mjs
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const gate = fileURLToPath(new URL('./audit-math-computation-parity.mjs', import.meta.url))
const r = spawnSync(process.execPath, [gate, '--mutants'], { stdio: 'inherit' })
process.exit(r.status === 0 ? 0 : 1)

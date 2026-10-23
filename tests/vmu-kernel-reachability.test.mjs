// vibe-math-vmu — REACHABILITY OF THE PLUGIN ASSEMBLY, AS AN INVARIANT.
//
// WHY THIS EXISTS (phase 12): the settings table derives its "wired" column by finding a file that READS a key. That is
// a necessary condition, not a sufficient one: a key can be read by a module the running assembly NEVER IMPORTS, and
// then "wired" is a false claim — the knob changes nothing while the manual says it is live. Measured exactly that way:
//
//   · `vibe-math-vmu/kernel/paper.js` (shipped in `installer.js`, owning six `vmu.paper.*` keys and declaring itself the
//     producer of `paper/office-consult-required`) is imported by NO live file — `createPaper(` appears only in tests
//     and scripts. The v5r paper actually runs through `packs/v5r/paper.js` → `kit/paper.js`, which reads none of those
//     keys ⇒ `vmu.paper.officeConsult='required'` was INERT on the mounted path while the table credited its reader.
//   · `vibe-math-vmu/kernel/grant.js` — `createGrant(` appears only in `tests/audit-enforced-consistency.test.mjs`, yet
//     it owns four `vmu.grant.*` keys and declares itself the producer of `grant/granted`.
// That is the "设了值 ≠ 生效了" failure this project keeps paying for — and it sat on the DOC face, where a reader of the
// manual would believe a refusal existed that never runs.
//
// WHAT THIS TEST DOES: builds the real import graph from the PLUGIN ENTRY files (not from one module), asserts every
// `kernel/*.js` is reachable, and requires every exception to be listed in the shared `KNOWN_UNMOUNTED` map with a
// reason. Shrink-only, so a newly orphaned module reddens HERE instead of silently widening the wiring claim.
//
// WHAT IT DOES NOT PROVE: that a reachable module is constructed, that its service is called, or that its keys change
// behaviour. Reachability is the cheaper half; the zero-mechanism matrix and the behaviour suites cover the rest.
//
// ★ SHARED IMPLEMENTATION: the graph walk lives in `scripts/lib/reachability.mjs`, because
// `scripts/generate-vmu-settings-table.mjs` uses the SAME fact to stop crediting readers the assembly cannot load
// (measured effect: 1173 → 1163 wired, exactly the 6 paper + 4 grant keys). Two copies would drift.

import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  PLUGIN_ENTRY_FILES, KNOWN_UNMOUNTED, walkAssembly, unreachableKernelModules,
} from '../scripts/lib/reachability.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, '..')
const VMU = join(ROOT, 'vibe-math-vmu')

let passed = 0
let failed = 0
const failures = []
const ok = (cond, name, detail) => {
  if (cond) { passed += 1; console.log('  ok   ' + name) } else {
    failed += 1
    failures.push({ name, detail })
    console.log('  FAIL ' + name + (detail === undefined ? '' : ' :: ' + JSON.stringify(detail)))
  }
}

const { entries, reachable } = walkAssembly(VMU)
const unreachable = unreachableKernelModules(VMU)

ok(entries.length >= 6, 'the entry set is the plugin surface, not one module (a graph rooted at index.js alone reports false orphans)',
  { entries: entries.length, of: PLUGIN_ENTRY_FILES.length })
ok(reachable.size > 90, 'the graph resolves a plausible assembly (a broken resolver would report everything unreachable)',
  { reachable: reachable.size })

const undeclared = unreachable.filter((f) => !Object.prototype.hasOwnProperty.call(KNOWN_UNMOUNTED, f))
ok(undeclared.length === 0,
  '★★ EVERY kernel module is reachable from a plugin entry, or is listed in KNOWN_UNMOUNTED with a reason — an orphan must not quietly widen the wiring claim',
  { undeclared, reachable: reachable.size })

// ★ the exception list is SHRINK-ONLY: an entry that has become reachable again must be deleted, or the list would keep
// an exemption alive for a module that is now fine (the same "stale exemption" class as every stale baseline here).
const stale = Object.keys(KNOWN_UNMOUNTED).filter((f) => !unreachable.includes(f))
ok(stale.length === 0, '★★ the exception list holds no entry that is reachable (or gone) again — shrink-only, like every baseline here',
  { stale })

// ★ every exception carries a REASON long enough to be useful, and names the measurement that put it there. A bare
// module name in the allowlist is the silent version of the defect this gate exists to prevent.
const weakReason = Object.entries(KNOWN_UNMOUNTED).filter(([, why]) => typeof why !== 'string' || why.trim().length < 80)
ok(weakReason.length === 0, '★★ each exception states WHY and HOW it was measured (no bare allowlist entries)', { weakReason: weakReason.map(([k]) => k) })

// ★ paper.js is the measured case, so pin the measurement itself: it must still be unreachable AND still own the
// office-consult keys. If someone mounts it, this flips and the settings claim becomes real — deliberately loud.
const paperSrc = readFileSync(join(VMU, 'kernel/paper.js'), 'utf8')
ok(unreachable.includes('kernel/paper.js') && /vmu\.paper\.officeConsult/.test(paperSrc),
  '★★ the measured case is recorded as measured: kernel/paper.js is unreachable AND is the reader the settings table credited',
  { unreachable: unreachable.includes('kernel/paper.js'), readsConsult: /vmu\.paper\.officeConsult/.test(paperSrc) })

// ★★ and the MOUNTED path must be named AND must now CARRY the gate. This line used to assert the opposite (`!/officeConsult/`)
// because the gate existed only in the unmounted `kernel/paper.js`; it was then wired into the live path
// (`packs/v5r/paper.js` → `kit/paper.js`), which is why the assertion flipped. It stays deliberately loud in the new
// direction: if the mounted flow stops reading the consult keys, the rule 「定稿前必须问所办」 silently goes inert again.
const kitPaper = readFileSync(join(VMU, 'kit/paper.js'), 'utf8')
const kitConsultKeys = (kitPaper.match(/vmu\.paper\.officeConsult[A-Za-z]*/g) || [])
ok(new Set(kitConsultKeys).size >= 5,
  '★★ the MOUNTED paper flow (kit/paper.js) reads the office-consult family — the gate lives on the registered path, not only in an unmounted module',
  { kitConsultKeys: [...new Set(kitConsultKeys)] })

// ★★ the grant family: same measurement, second instance. Pinned so neither the module nor its keys can be "forgotten"
// back into the wired column by a future refactor.
const grantSrc = readFileSync(join(VMU, 'kernel/grant.js'), 'utf8')
ok(unreachable.includes('kernel/grant.js') && /vmu\.grant\.enabled/.test(grantSrc),
  '★★ the second measured case: kernel/grant.js is unreachable AND owns the vmu.grant.* keys',
  { unreachable: unreachable.includes('kernel/grant.js'), readsEnabled: /vmu\.grant\.enabled/.test(grantSrc) })

console.log(failed === 0
  ? '=== VMU KERNEL REACHABILITY: ' + passed + ' passed, 0 failed ==='
  : '=== VMU KERNEL REACHABILITY: ' + passed + ' passed, ' + failed + ' failed ===')
process.exit(failed ? 1 : 0)

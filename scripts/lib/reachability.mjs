// vibe-math-vmu — REACHABILITY OF THE PLUGIN ASSEMBLY, as one shared implementation.
//
// WHY A SHARED MODULE: two consumers need this fact and they must not disagree —
//   ① `tests/vmu-kernel-reachability.test.mjs` asserts that no kernel module is orphaned (an orphan makes every
//      "wired" claim about its settings keys false);
//   ② `scripts/generate-vmu-settings-table.mjs` must not count a reader that the running assembly never loads.
// Two copies of the graph walk would drift exactly the way this project keeps catching elsewhere.
//
// WHAT "REACHABLE" MEANS HERE: there exists at least one import path from a PLUGIN ENTRY file to the module. It says
// nothing about whether the module is ever constructed, called, or whether its features are enabled — only that the
// loader can see it. That weaker fact is what makes the settings column honest: a reader in an unloadable file cannot
// read anything.
//
// WHAT IT DOES NOT PROVE: that a reachable module is constructed; that a constructed service has a caller; that a
// key's value changes behaviour. Those are other gates (zero-mechanism matrix, `audit-settings-wired`, the behaviour
// suites). Reachability is deliberately the cheapest half, and it already caught two real orphans.

import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { dirname, join, resolve, relative } from 'node:path'

/** The files a live host actually loads. Kept as a list rather than "everything in the folder" — a folder walk would
 *  make the graph trivially everything-reachable and the invariant would assert nothing. */
export const PLUGIN_ENTRY_FILES = Object.freeze([
  'vibe-math-vmu.js',     // the Cordis plugin entry (host factory, pack loader, repo wiring)
  'host.js',              // the host surface the plugin constructs
  'host-hooks.js',
  'host-deliver.js',
  'host-pack-tools.js',
  'host-children.js',
  'host-spawn.js',
  'host-math.js',
])

/** Modules that are unreachable ON PURPOSE, each with the reason a reader needs. Shrink-only: an entry that becomes
 *  reachable again must be deleted, because a stale exemption silently re-authorises the defect. */
export const KNOWN_UNMOUNTED = Object.freeze({
  'kernel/paper.js':
    'NOT CONSTRUCTED by any live path (`createPaper(` appears only in tests and scripts). The v5r paper runs through ' +
    '`packs/v5r/paper.js` → `kit/paper.js`, which reads none of its `vmu.paper.*` keys ⇒ those keys are INERT on the ' +
    'mounted path. Kept because its tests are the reference implementation of the office-consult gate; deleting it is ' +
    'a separate decision, and must not be replaced by "nobody noticed".',
  'kernel/grant.js':
    'NOT CONSTRUCTED by any live path (`createGrant(` appears only in `tests/audit-enforced-consistency.test.mjs`). ' +
    'It owns four `vmu.grant.*` keys and declares itself the producer of `grant/granted`, so the settings table used ' +
    'to call those keys wired while nothing in the assembly could ever read them. The v5r rule set does not require ' +
    'grants today — so this is a packaged capability with no consumer, kept only because deleting a tested kernel ' +
    'surface needs an explicit decision (recorded in the phase-12 ledger as an open row).',
})

const edgesOf = (file) => {
  let src
  try { src = readFileSync(file, 'utf8') } catch { return [] }
  const out = []
  for (const m of src.matchAll(/(?:from|import)\s*\(?\s*'([^']+)'/g)) {
    const spec = m[1]
    if (!spec.startsWith('.')) continue
    out.push(resolve(dirname(file), spec))
  }
  return out
}

/** Every file reachable from the plugin entries, plus the entry list that produced it. */
export const walkAssembly = (vmuDir) => {
  const entries = PLUGIN_ENTRY_FILES.map((f) => join(vmuDir, f)).filter((p) => existsSync(p))
  const reachable = new Set()
  const queue = [...entries]
  while (queue.length) {
    const cur = queue.pop()
    if (reachable.has(cur)) continue
    reachable.add(cur)
    for (const next of edgesOf(cur)) {
      if (!reachable.has(next) && existsSync(next)) queue.push(next)
    }
  }
  return { entries, reachable }
}

/** Kernel modules (`kernel/*.js`) that no import path reaches, as workspace-relative-ish names (`kernel/x.js`). */
export const unreachableKernelModules = (vmuDir) => {
  const { reachable } = walkAssembly(vmuDir)
  const dir = join(vmuDir, 'kernel')
  return readdirSync(dir)
    .filter((f) => f.endsWith('.js'))
    .map((f) => join(dir, f))
    .filter((p) => !reachable.has(p))
    .map((p) => 'kernel/' + relative(dir, p).replace(/\\/g, '/'))
    .sort()
}

/** Is this source file (path relative to the vmu dir, `/`-separated) reachable? Names not in the source tree at all
 *  are reported unreachable — a "reader" that does not exist cannot read. */
export const isReachableRel = (vmuDir, rel) => {
  const { reachable } = walkAssembly(vmuDir)
  return reachable.has(resolve(vmuDir, rel))
}

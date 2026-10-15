// vibe-math-vmu — ROUND 20b / task-127: THE `vibe_vmu_pack` TOOL'S ACTIONS, AND THE PARAMETER TEXT THAT MUST MATCH
// THEM.
// Run: `node tests/vmu-pack-tool-actions.test.mjs` (last line `=== VMU PACK TOOL ACTIONS: N passed, M failed ===`).
//
// WHY THIS SUITE EXISTS (all three facts were measured on the real adapter before the fix):
//   ① `{action:'unload', id}` was REFUSED for lacking a `manifest` it never uses — the "no manifest ⇒ refuse"
//      guard sat ABOVE the unload branch. `loader.unload(id)` needs no manifest, so the ORDER was the defect.
//      Two-way: an applied pack really unloads (ok + `residueFree:true`) WITHOUT a manifest, and a BAD id still
//      comes back as the loader's own named refusal — while plan/apply KEEP their manifest requirement.
//   ② the `id` parameter's description claimed "plan/apply 时按 ./packs/<id>.js 解析", which the implementation
//      refuses (`{action:'plan', id:'v5r'}` ⇒ VMU_INVALID_ARGUMENT). Documentation and behaviour must agree, so
//      this suite asserts BOTH: the text no longer promises id-resolution, AND the behaviour still refuses it.
//
// NOT COVERED HERE, DELIBERATELY: `validatePack` checks `rules[].on` but not `rules[].when` (kernel/pack.js:117-120
// vs kernel/rules.js:53), so `plan` reports no problems while `apply` refuses — that asymmetry is in
// `kernel/pack.js`, which is NOT in this task's write scope (`vmu-pack2` has it dirty for task-125). The fix and
// the guard that belongs in this file are both written out in `_handoff/vmu/core-round20b-report.md` §3.
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const REPO = 'D:\\wd\\vibemath开发\\Vibe-Mathematics'
const hm = await import(pathToFileURL(join(REPO, 'vibe-math-vmu', 'host.js')).href)
const km = await import(pathToFileURL(join(REPO, 'vibe-math-vmu', 'kernel', 'index.js')).href)
const pm = await import(pathToFileURL(join(REPO, 'vibe-math-vmu', 'kernel', 'pack.js')).href)

let passed = 0
let failed = 0
const failures = []
const ok = (cond, name, detail) => {
  if (cond) { passed += 1; return }
  failed += 1
  failures.push(name + (detail === undefined ? '' : ' [' + JSON.stringify(detail) + ']'))
}
const J = (o) => JSON.stringify(o)

const root = await mkdtemp(join(tmpdir(), 'vmu-r20b-packtool-'))
const kernel = km.createKernel({ clock: () => 1000000, root })
const loader = pm.createPackLoader({ kernel, registry: kernel.registry })
const specs = []
const ctx = { tools: { register: async (spec) => { specs.push(spec); return () => {} } }, effect: (fn) => fn() }
const adapter = hm.createHostAdapter({ ctx, kernel, settings: { 'vmu.tools.faces': ['*'] }, packLoader: () => loader })
await adapter.install()
const spec = specs.find((s) => s.name === 'vibe_vmu_pack')
const call = async (args) => JSON.parse(await spec.execute(args, {}))

// ── P: preconditions (every assertion below depends on these) ───────────────────────────────────────────────
ok(!!spec, 'P1. the pack tool is published by the adapter (the pack face is enabled)', specs.map((s) => s.name))
ok(typeof loader.unload === 'function', 'P2. the loader really exposes `unload` — the branch this tool delegates to', typeof (loader && loader.unload))

// ── ① TWO-WAY: unload needs an id, never a manifest ─────────────────────────────────────────────────────────
const applied = await call({ action: 'apply', manifest: J({ id: 'r20b-applied' }) })
ok(applied.ok === true, 'U0. (precondition) a pack with a well-formed manifest really APPLIES', applied)

const unloaded = await call({ action: 'unload', id: 'r20b-applied' })            // ← NO manifest
ok(unloaded.ok === true && unloaded.residueFree === true,
  'U1. ★ {action:"unload", id} with NO manifest SUCCEEDS and reports `residueFree:true` (the guard no longer sits in front of a branch that does not need it)', unloaded)
ok(unloaded.code === undefined || unloaded.code === null,
  'U2. and it is not a refusal dressed as a success (no `code` on the way out)', unloaded)

const badId = await call({ action: 'unload', id: 'r20b-never-applied' })
ok(badId.ok === false && badId.code === 'VMU_NO_SUCH_OBJECT',
  'U3. a BAD id is still a NAMED refusal from the loader (`VMU_NO_SUCH_OBJECT`), not a silent ok and not the manifest complaint', badId)
ok(badId.code !== 'VMU_INVALID_ARGUMENT',
  'U4. ★ the reverse direction: the old defect\'s signature (`VMU_INVALID_ARGUMENT: plan/apply need an inline manifest`) is GONE for unload — this is the assertion that reddens if the ordering regresses', badId)

const noId = await call({ action: 'unload' })
ok(noId.ok === false && noId.code === 'VMU_INVALID_ARGUMENT' && /unload needs id/.test(String(noId.message)),
  'U5. and unload still insists on its OWN real precondition: an `id`', noId)

// ── ① the guard itself is intact: plan/apply DO need a manifest ─────────────────────────────────────────────
const planNoManifest = await call({ action: 'plan' })
ok(planNoManifest.ok === false && planNoManifest.code === 'VMU_INVALID_ARGUMENT' && /inline manifest/.test(String(planNoManifest.message)),
  'U6. plan WITHOUT a manifest is still refused by name (the reorder moved the branch, it did not drop the guard)', planNoManifest)
const applyNoManifest = await call({ action: 'apply' })
ok(applyNoManifest.ok === false && applyNoManifest.code === 'VMU_INVALID_ARGUMENT',
  'U7. and so is apply', applyNoManifest)

// ── ② THE PARAMETER TEXT AND THE BEHAVIOUR MUST AGREE ───────────────────────────────────────────────────────
// The adapter may hand the host either the internal `{ type, description }` params or a JSON-schema shape, so this
// asserts against the SERIALISED declaration (shape-independent) rather than picking a property path that could
// silently read `undefined` and turn the assertion vacuous.
const declared = JSON.stringify({ description: spec.description || '', parameters: spec.parameters || {} })
ok(declared.length > 0 && /"id"/.test(declared),
  'D0. (precondition) the tool really declares an `id` parameter whose text this suite can read', declared.slice(0, 160))
ok(!/plan\/apply 时按/.test(declared),
  'D1. ★ the declaration no longer promises that plan/apply resolve `./packs/<id>.js` (that claim was false)', declared.slice(0, 240))
ok(/unload/.test(declared) && /manifest/.test(declared),
  'D2. and it now says what is true: `id` is for unload; plan/apply use the inline manifest', declared.slice(0, 240))

const planById = await call({ action: 'plan', id: 'v5r' })
ok(planById.ok === false && planById.code === 'VMU_INVALID_ARGUMENT' && /inline manifest/.test(String(planById.message)),
  'D3. ★ and the BEHAVIOUR matches that text: `{action:"plan", id:"v5r"}` is refused, naming the inline manifest it really needs', planById)

// ── ③ SYMMETRY: the TOOL's plan() names what apply() would refuse (landed by task-128 / vmu-pack2) ──────────
// The registered hook is `tools/result` (PLURAL). A singular `tool/result` would add an "unregistered hook"
// problem and let the assertion below pass FOR THE WRONG REASON — exactly the shape this repo hunts.
const noWhen = { id: 'r20b-plan-sym', rules: [{ id: 'r-p', on: ['tools/result'], then: [{ record: { track: 'progress' } }] }] }
const plannedNoWhen = await call({ action: 'plan', manifest: J(noWhen) })
const plannedProblems = (Array.isArray(plannedNoWhen.problems) ? plannedNoWhen.problems : []).map(String)
// S1 pins BOTH sides: the named problem in `problems` AND the refusal. Pinning only `problems` (what this
// assertion first did) cannot catch a "reports but does not refuse" regression: with `ok:true` + a non-empty
// `problems` the old S1, S2 and S3 all passed (S2 because `problems.length !== 0`; S3 because both sides carried
// the same `code`) — i.e. `plan.ok` was never pinned. `vmu-pack2` found this in review; the weaker form is named
// in `_handoff/vmu/core-round20b-report.md` §3 as "一个只在 problems 上成立的判据，抓不到『报而不拒』".
ok(plannedNoWhen.ok === false && plannedNoWhen.code === 'VMU_PACK_MISSING' && plannedProblems.some((p) => /when is required/.test(p)),
  'S1. ★ the TOOL\'s plan() REFUSES *and* NAMES the missing `when` — asserted on the refusal (ok + code) AND on the named problem, not on either alone', plannedNoWhen)
ok(!(plannedNoWhen.ok === true && plannedProblems.length === 0),
  'S2. and it is not the old hollow shape: `ok:true` with ZERO problems while apply() would refuse', plannedNoWhen)
const appliedNoWhen = await call({ action: 'apply', manifest: J(noWhen) })
ok(appliedNoWhen.ok === false && appliedNoWhen.code === plannedNoWhen.code,
  'S3. plan and apply agree on the CODE — the same judgement, reached before the loader compiles the rule', { plan: plannedNoWhen.code, apply: appliedNoWhen.code })

try { await rm(root, { recursive: true, force: true }) } catch { /* Windows keeps the store handle */ }
console.log('=== VMU PACK TOOL ACTIONS: ' + passed + ' passed, ' + failed + ' failed ===')
for (const f of failures) console.log('  FAIL ' + f)
process.exit(failed === 0 ? 0 : 1)

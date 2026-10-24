// vmu packs: the settings switch is a REAL switch, and the receipt tells the truth about it
// (round 25, task-138).
//
// THE TWO DEFECTS THIS HOLDS
//  1. `settingsMerge.packs` reported the DEPLOYMENT table (`config.packs`) only, so a pack brought in by the
//     settings switch (`vmu.packs.active`) left the receipt saying `packs: []` while its bus entries were live.
//     That is round 23's defect mirrored: there the settings said "installed" while the kernel refused; here it
//     really installed while the receipt said nothing. Fixed: the receipt now carries the EFFECTIVE request table,
//     each entry's SOURCE, what really applied, and why anything did not - four facts in one read.
//  2. `vibe-math-vmu.js` claimed since cfbd2c7 that a pack refusal "lands in packErrors - which the status face
//     now carries (see host.js)", while `host.js` had ZERO references to it: a declaration with no implementation.
//     The two halves now land together, and ARM F below pins that they stay together.
//
// ★ EVERY OBSERVATION HERE RUNS AFTER `await ready()`. `ready()` now waits for the pack install to settle; before
// that, a caller could read `packErrors` as empty merely because loading had not run yet, and a test written on
// that timing measures its own race (the C arm's first run in round 24 saw exactly that).
// ★ `execute()` ON A vmu TOOL RETURNS A JSON STRING, not an object - `JSON.parse` is required. Reading it as an
// object yields `undefined` for every field, which looks exactly like "the receipt is empty".

import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'

const HERE = fileURLToPath(new URL('./', import.meta.url))
const REPO = resolve(HERE, '..')
const ENTRY = resolve(REPO, 'vibe-math-vmu', 'vibe-math-vmu.js')

let passed = 0, failed = 0
const failures = []
const ok = (cond, name, detail) => {
  if (cond) passed++
  else { failed++; failures.push(name + (detail === undefined ? '' : ' [' + JSON.stringify(detail) + ']')) }
}

const entry = await import(pathToFileURL(ENTRY).href)

/** Assemble the real entry; the registered tool specs are captured so the REAL status face can be driven. */
async function assemble({ settings = {}, root = true, packs = null } = {}) {
  const tools = {}
  const ctx = {
    effect: (fn) => fn(),
    on: () => () => {},
    tools: { register: async (spec) => { if (spec && spec.name) tools[spec.name] = spec; return () => {} } },
  }
  const dir = root ? await mkdtemp(join(tmpdir(), 'vmu-packs-switch-')) : null
  const cfg = { clock: () => 1000000, deliver: () => {}, vmu: { 'vmu.tools.faces': ['pack', 'middleware', 'status'], ...settings } }
  if (dir) cfg.root = dir
  if (packs) cfg.packs = packs
  const handle = entry.apply(ctx, cfg)
  await handle.ready()          // ★ the settle precondition is the call itself, asserted in arm A
  const raw = await tools['vibe_vmu_status'].execute({ detail: 'full' })
  const status = typeof raw === 'string' ? JSON.parse(raw) : raw
  return { handle, status, dir, tools }
}
const busIds = (st) => ((st.bus && st.bus.entries) || []).map((e) => e.id)
const cleanup = async (dir) => { if (dir) { try { await rm(dir, { recursive: true, force: true, maxRetries: 20, retryDelay: 50 }) } catch { /* going away */ } } }

// =========================================================================================================
// A. THE SETTLE PRECONDITION ITSELF (without it, every arm below can measure its own race)
// =========================================================================================================
{
  const { handle, status, dir } = await assemble({ settings: { 'vmu.packs.active': ['v5r'] } })
  ok(handle.packsLoading() === false, 'A1. after `ready()` the pack install has SETTLED (packsLoading false) - the precondition every arm below rests on', handle.packsLoading())
  ok(status.packReport && status.packReport.loading === false, 'A2. ...and the receipt says so too (loading:false), so a caller that did not await is not left guessing', status.packReport)
  ok(status.packReport && status.packReport.requested.length > 0,
    'A3. non-vacuous: with `vmu.packs.active` set there IS a request to settle (an empty request would make A1/A2 pass for the wrong reason)', status.packReport && status.packReport.requested)
  await cleanup(dir)
}

// =========================================================================================================
// B. ARM 1: the settings switch really switches (bus entries, not just a settings view)
// =========================================================================================================
{
  const { status, dir } = await assemble({ settings: { 'vmu.packs.active': ['v5r'] } })
  const req = (status.packReport && status.packReport.requested) || []
  ok(req.length > 0 && req.some((p) => p.id === 'v5r' && p.via === 'vmu.packs.active'),
    'B1. the receipt says WHERE the pack came from (via:"vmu.packs.active"), not just that it was wanted', req)
  ok((status.packReport && status.packReport.applied || []).length > 0,
    'B2. and WHAT really applied', status.packReport && status.packReport.applied)
  ok(status.packReport && status.packReport.errors.length === 0 && status.packReport.ok === true,
    'B3. with no refusal recorded', status.packReport)
  // ★ THE POINT OF THE WHOLE TASK: the settings route must be visible on the BUS, not only in a merge view.
  ok(busIds(status).length > 0, 'B4. ★ a pack loaded through the SETTINGS switch really put entries on the BUS (not just a settings view)', busIds(status))
  // ★ core2's finding, pinned: the merge view used to say `packs: []` here.
  ok(status.settingsMerge && status.settingsMerge.packs.includes('v5r'),
    'B5. ★ the merge receipt names the pack that the SETTINGS switch loaded (it used to report the DEPLOYMENT table alone, so this read `[]` while the bus was live)', status.settingsMerge && status.settingsMerge.packs)
  ok(status.settingsMerge && Array.isArray(status.settingsMerge.packSources) && status.settingsMerge.packSources.some((p) => p.id === 'v5r' && p.via === 'vmu.packs.active'),
    'B6. ...and its SOURCE travels with it', status.settingsMerge && status.settingsMerge.packSources)
  // ★ TWO INDEPENDENT VIEWS, CROSS-CHECKED: the entry's list and the kernel's own `status().packs`.
  // ROUND 30 / task-151 (D1): `applied` now carries BOTH ids per entry, because a pack is REQUESTED as `v5r` and
  // APPLIES as `v5r-core` - checking literal ids across the two views was only true by eye. The check below is the
  // explicit-mapping form, and it also asserts that the mapping itself is present (a bare name list would hide which
  // id each side is talking about).
  const applied = (status.packReport && status.packReport.applied) || []
  const mapped = applied.filter((a) => a && typeof a.requestId === 'string' && typeof a.manifestId === 'string')
  ok(applied.length > 0 && mapped.length === applied.length && mapped.every((a) => (status.packs || []).includes(a.manifestId)),
    'B7. ★ the entry receipt and the KERNEL status agree BY EXPLICIT ID MAPPING (requestId != manifestId is expected, not a disagreement)',
    { entry: applied, kernel: status.packs, idMap: status.packReport && status.packReport.idMap })
  await cleanup(dir)
}

// =========================================================================================================
// C. ARM 2 (the adversarial half): nothing declared ⇒ nothing loaded, and it is NOT reported as a failure
// =========================================================================================================
{
  const { status, dir } = await assemble({})
  ok(status.packReport && status.packReport.requested.length === 0 && status.packReport.applied.length === 0,
    'C1. with nothing declared there is nothing requested and nothing applied', status.packReport)
  ok(status.packReport && status.packReport.ok === true && status.packReport.errors.length === 0,
    'C2. and that is NOT a failure (zero mechanism stays silent, it does not manufacture an error)', status.packReport)
  ok((status.settingsMerge && status.settingsMerge.packs || []).length === 0,
    'C3. the merge view is empty too - the two views agree in the empty case as well', status.settingsMerge && status.settingsMerge.packs)
  await cleanup(dir)
}

// =========================================================================================================
// D. ARM 3: no durable root ⇒ NAMED refusal, and the receipt can be seen to say "NOT applied"
// =========================================================================================================
{
  const { status } = await assemble({ settings: { 'vmu.packs.active': ['v5r'] }, root: false })
  const pr = status.packReport || {}
  ok(pr.ok === false && (pr.errors || []).length > 0,
    'D1. a refused install is a NAMED refusal in the receipt (ok:false + errors[])', pr)
  ok((pr.errors || []).some((e) => e.code === 'VMU_ENGINE_UNAVAILABLE' && /library root/.test(String(e.message))),
    'D2. with the code and the reason a caller can act on (no invented code: VMU_ENGINE_UNAVAILABLE is the kernel\'s own)', pr.errors)
  ok(status.settingsMerge && status.settingsMerge.applied === false,
    'D3. ★ the merge view carries applied:false in the SAME object, so it cannot be read as "merged" on its own', status.settingsMerge && status.settingsMerge.applied)
  // ★ non-emptiness in the SAME expression: `[].every(...)` is vacuously true, so a bare `pr.errors && pr.errors.every(...)`
  // would pass on a run where nothing was refused at all (the RULE E "vacuous pass" class).
  ok(pr.errors && pr.errors.length > 0 && pr.errors.every((e) => typeof e.id === 'string' && typeof e.code === 'string'),
    'D4. every error names WHICH pack failed (an unattributed error in a multi-pack deployment is nearly useless)', pr.errors)
}

// =========================================================================================================
// E. ARM 4: the two routes read the SAME (they load the same pack through the same loader)
// =========================================================================================================
{
  const viaSettings = await assemble({ settings: { 'vmu.packs.active': ['v5r'] } })
  const viaConfig = await assemble({ packs: ['v5r'] })
  const s1 = viaSettings.status, s2 = viaConfig.status
  ok(viaSettings.tools && viaConfig.tools, 'E0. both assemblies produced a status face (non-vacuous comparison)')
  ok(JSON.stringify(s1.packReport && s1.packReport.applied) === JSON.stringify(s2.packReport && s2.packReport.applied),
    'E1. ★ both routes APPLY the same pack (identical applied list)', { settings: s1.packReport && s1.packReport.applied, config: s2.packReport && s2.packReport.applied })
  ok(busIds(s1).length === busIds(s2).length && busIds(s1).length > 0,
    'E2. ★ and they agree on the BUS (same number of entries, and non-zero)', { settings: busIds(s1).length, config: busIds(s2).length })
  ok(JSON.stringify(s1.settingsMerge && s1.settingsMerge.packs) === JSON.stringify(s2.settingsMerge && s2.settingsMerge.packs),
    'E3. the merge view agrees across routes as well', { settings: s1.settingsMerge && s1.settingsMerge.packs, config: s2.settingsMerge && s2.settingsMerge.packs })
  // The SOURCE is the one thing that MUST differ - otherwise the receipt could not tell the two apart.
  const src1 = (s1.packReport && s1.packReport.requested || []).map((p) => p.via)
  const src2 = (s2.packReport && s2.packReport.requested || []).map((p) => p.via)
  ok(src1.includes('vmu.packs.active') && src2.includes('config.packs'),
    'E4. ★ ...but the SOURCE differs, which is the whole reason the receipt carries it (a receipt that cannot tell the routes apart is not a receipt)', { settings: src1, config: src2 })
  await cleanup(viaSettings.dir); await cleanup(viaConfig.dir)
}

// =========================================================================================================
// F. THE DECLARATION/IMPLEMENTATION PAIR STAYS PAIRED (the class this task exists for)
// =========================================================================================================
{
  const { status, dir } = await assemble({ settings: { 'vmu.packs.active': ['v5r'] } })
  // `vibe-math-vmu.js` says a refusal "lands in packErrors - which the status face now carries (see host.js)".
  // That sentence is only true while the host half exists; this pins the RECEIPT (not the source text, which
  // would be a proxy: what matters is that a caller can read it).
  ok(status.packReport !== undefined,
    'F1. ★ the STATUS RECEIPT carries the pack report - the half that `vibe-math-vmu.js` claimed via "(see host.js)" while host.js had no reference to it', Object.keys(status).filter((k) => /pack/i.test(k)))
  ok(status.packReport && Array.isArray(status.packReport.errors) && Array.isArray(status.packReport.applied) && Array.isArray(status.packReport.requested),
    'F2. and it carries all three fields the declaration promises (requested / applied / errors)', status.packReport)
  await cleanup(dir)
}

console.log('=== VMU PACKS ACTIVE SWITCH: ' + passed + ' passed, ' + failed + ' failed ===')
for (const f of failures) console.log('  FAIL ' + f)
process.exit(failed === 0 ? 0 : 1)

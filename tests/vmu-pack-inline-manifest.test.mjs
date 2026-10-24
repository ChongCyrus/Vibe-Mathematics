// vmu pack INLINE MANIFEST — the entry point `config.packs` documents but did not deliver (round 20, task-125).
//
// THE DEFECT THIS HOLDS. `vibe-math-vmu.js` has always said `config.packs` "accepts either a shipped pack id
// (resolved from packs/<id>.js) or an inline manifest". The inline half was FALSE: an object entry fell through
// to the data-only probe, which computes `join(dir, 'packs', wanted, rel)` with the OBJECT as a path segment and
// threw `ERR_INVALID_ARG_TYPE The "path" argument must be of type string. Received an instance of Object` BEFORE
// `apply()` was ever reached. A SECOND, independent blocker sat behind it: `validatePack` decides the middleware
// shape with `m.kind === undefined ? 'module' : m.kind` (so `kind` is optional and defaults to `module`), but
// `apply()` handed the raw entry to `kernel/loader` without applying that default - and the loader refuses
// anything that does not SAY `kind: 'module'`. Together they made the whole "deployment-side inline pack" path
// unusable, and with it the only route to an M2 module that can reach `api.services` (kernel/pack.js: an INLINE
// `{on, handler}` entry is added to the bus as-is and gets NO `api` at all).
//
// WHAT THIS FILE PROVES, in both directions:
//   · a WELL-FORMED inline manifest is really applied - the pack is in `appliedPacks()`, its module became a bus
//     entry, its host hook is BRIDGED, and the handler really reached `api.services.get('vmu.metrics')` through
//     the capability-gated seam (a counter written on the DEPLOYMENT side, not in the repository);
//   · a BAD one is refused BY NAME (a VMU_* code plus an actionable hint) - never with the bare
//     `ERR_INVALID_ARG_TYPE` that made the failure unreadable.
// The falsifiability assertion is explicit: the old signature is asserted ABSENT, so restoring the defect turns
// this file red rather than leaving it green.

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

/** A host context with only what this assembly needs: an effect scope, an event surface, a tool registrar. */
const makeCtx = () => {
  const listeners = {}
  return {
    listeners,
    ctx: {
      effect: (fn) => fn(),
      on: (name, l) => { (listeners[name] = listeners[name] || []).push(l); return () => {} },
      tools: { register: async () => () => {} },
    },
  }
}

/** The deployment-side policy: ONE observation per finished tool call, recorded through the service seam. */
const makeCounter = (attempts) => ({
  meta: { id: 'deploy-counter', apiVersion: 1 },
  // THE MODULE declares the capabilities; the manifest ENTRY must declare a superset (kernel/loader.js checks
  // both, and `makeApi` gates `services` on the MODULE's list).
  capabilities: ['trigger-workflow', 'record'],
  hooks: {
    'tools/result': async (flat = {}) => {
      const metrics = flat && flat.api && flat.api.services ? flat.api.services.get('vmu.metrics') : null
      if (!metrics || typeof metrics.observe !== 'function') {
        attempts.push({ ok: false, why: 'vmu.metrics not reachable through api.services' })
        return { ok: false }
      }
      const r = metrics.observe({ name: 'artifacts', value: 1, by: 'deploy-counter', kind: 'change', source: 'pack' })
      attempts.push({ ok: true, recorded: !!(r && r.recorded) })
      return { ok: true }
    },
  },
})

const WELL_FORMED = (attempts) => ({
  id: 'deploy-counter-pack',
  apiVersion: 1,
  middleware: [{
    id: 'deploy-counter',
    // ★ `kind` IS DELIBERATELY OMITTED. The manifest table documents the field as `kind?`, and `validatePack`
    // decides the shape with `m.kind === undefined ? 'module' : m.kind` - so omitting it is the DOCUMENTED,
    // ordinary way to declare a module. The second half of this task's defect was that the documented default
    // was not applied before `kernel/loader` (which refuses anything that does not SAY `kind: 'module'`), so
    // writing `kind` here would hide the very thing this file exists to hold. Do not add it back.
    on: ['tools/result'],
    capabilities: ['trigger-workflow', 'record'],
    module: makeCounter(attempts),
  }],
})

/** Assemble the real entry with `packs` exactly as given; return the handle plus what the host observed. */
async function assemble(packs, { reports = null, root = null } = {}) {
  const dir = root || await mkdtemp(join(tmpdir(), 'vmu-inline-pack-'))
  const { ctx, listeners } = makeCtx()
  const sink = []
  const handle = entry.apply(ctx, {
    clock: () => 1000000,
    root: dir,
    packs,
    deliver: (report) => sink.push({ name: report.name, text: report.text }),
    vmu: {
      // ★ 轮 8：`metrics` 不是工具面（TOOL_FACES 里 0 处）；`vmu.metrics.indicators` 是被 kernel/report.js
      // 读的【设置族】。这条过滤在修前对 metrics 是空转：reports 分支实际只有 `report` 生效，无 reports
      // 分支实际一个面都不加（只剩 always 的 status）。现在把前者写成 ['report']、后者写成 []，效果与旧运行
      // 完全一致；本套件的断言（pack 应用/总线/metrics/report/拒绝）都不依赖工具集。
      'vmu.tools.faces': reports ? ['report'] : [],
      'vmu.metrics.indicators': ['artifacts'],
      ...(reports ? { 'vmu.report.enabled': true, 'vmu.report.minIntervalMs': 0, 'vmu.report.reports': reports } : {}),
    },
  })
  await handle.ready()
  return { handle, listeners, sink, dir }
}

// =========================================================================================================
// A. A WELL-FORMED INLINE MANIFEST IS REALLY APPLIED, AND ITS POLICY CAN ACT
// =========================================================================================================
{
  const attempts = []
  // An ABOVE-line and a BELOW-line threshold: the first must fire at the boundary BY ITSELF, the second must
  // stay silent in the same deployment. One-sided evidence ("it fired") does not distinguish "the boundary
  // decided" from "something always fires".
  const reports = [
    { name: 'artifacts-met', trigger: { kind: 'threshold', metric: 'artifacts', op: 'gte', value: 5 }, channel: 'log', template: 'ABOVE: artifacts={{ metric:artifacts }} gte 5' },
    { name: 'artifacts-unmet', trigger: { kind: 'threshold', metric: 'artifacts', op: 'gte', value: 50 }, channel: 'log', template: 'BELOW: artifacts={{ metric:artifacts }} gte 50' },
  ]
  const { handle, listeners, sink, dir } = await assemble([WELL_FORMED(attempts)], { reports })

  const applied = handle.appliedPacks()
  const packErrors = handle.packErrors()
  ok(packErrors.length === 0, 'A1. the inline manifest produced NO pack error (the packed object is a pack, not a bad path)', packErrors)
  ok(applied.some((a) => a.id === 'deploy-counter-pack'), 'A2. `appliedPacks()` contains the inline manifest id', applied)

  const busEntries = (handle.kernel.bus.status().entries || []).map((e) => ({ id: e.id, on: e.on, enabled: e.enabled }))
  ok(busEntries.some((e) => String(e.id).includes('deploy-counter')),
    'A3. its M2 module became a real bus entry (so the loader attached `api` - the one shape that can reach a service)', busEntries)
  // ★ NON-EMPTINESS IS ASSERTED IN THE SAME EXPRESSION AS THE `every`: `[].every(…)` is vacuously TRUE, so a
  // separate `length > 0` line above would leave this assertion unable to fail (the RULE E "vacuous pass" class).
  ok(busEntries.length > 0 && busEntries.every((e) => !String(e.id).includes('deploy-counter') || e.enabled === true),
    'A3b. ★ the entry is ENABLED, and it got there with `kind` OMITTED from the manifest: the documented default (`kind?` ⇒ module) is what `validatePack` promises and what the loader was refusing',
    busEntries.length + ' entr(ies): ' + JSON.stringify(busEntries))
  ok((listeners['tools/result'] || []).length > 0,
    'A4. and its host hook `tools/result` is BRIDGED, so the entry cannot silently never fire', Object.keys(listeners))

  // THE COUNTING PRODUCER, through the REAL assembly: the host emits tool results, nobody calls report/tick.
  for (let i = 0; i < 5; i += 1) {
    for (const l of (listeners['tools/result'] || [])) await l({})
  }
  ok(attempts.length === 5 && attempts.every((a) => a.ok && a.recorded),
    'A5. ★ the deployment-side policy recorded REAL observations through `api.services.get("vmu.metrics")` (capability-gated seam)', attempts.slice(0, 3))
  ok(handle.kernel.metricValues().artifacts === 5,
    'A6. the framework reads that count back (the boundary metric map)', handle.kernel.metricValues())

  for (const l of (listeners['agent/turn-stopping'] || [])) await l()
  await new Promise((r) => setTimeout(r, 25))
  const names = sink.map((s) => s.name)
  ok(names.includes('artifacts-met'), 'A7. ★ the ABOVE-line threshold fired AUTONOMOUSLY at the turn boundary and was delivered', names)
  ok(!names.includes('artifacts-unmet'), 'A8. ★ the BELOW-line threshold stayed SILENT in the same deployment (the adversarial half)', names)
  try { await rm(dir, { recursive: true, force: true, maxRetries: 20, retryDelay: 50 }) } catch { /* the store handle may still be held on Windows */ }
}

// =========================================================================================================
// B. A BAD ENTRY IS REFUSED BY NAME - NEVER WITH THE RAW TypeError THE DEFECT PRODUCED
// =========================================================================================================
{
  const cases = [
    ['an id that is not kebab-case', [{ id: 'Not Kebab' }], 'VMU_PACK_MISSING'],
    ['a manifest with no id at all', [{}], 'VMU_PACK_MISSING'],
    ['an entry that is neither a pack id nor a manifest (a number)', [7], 'VMU_PACK_INVALID'],
    ['an entry that is neither a pack id nor a manifest (an array)', [['v5r']], 'VMU_PACK_INVALID'],
    ['an entry that is neither a pack id nor a manifest (null)', [null], 'VMU_PACK_INVALID'],
    // A correctly shaped manifest whose MODULE is inconsistent: still named, never a TypeError.
    ['a module whose meta.id contradicts the entry id', [{
      id: 'deploy-mismatch', apiVersion: 1,
      middleware: [{ id: 'deploy-a', on: ['tools/result'], capabilities: ['record'], module: { meta: { id: 'something-else', apiVersion: 1 }, capabilities: ['record'], hooks: { 'tools/result': async () => ({}) } } }],
    }], 'VMU_MIDDLEWARE_FAILED'],
  ]
  const seen = []
  for (const [label, packs, wantCode] of cases) {
    const { handle, dir } = await assemble(packs)
    const errs = handle.packErrors()
    seen.push({ label, wantCode, got: errs.map((e) => e.code) })
    ok(errs.length > 0, 'B0. ' + label + ': the refusal is REPORTED (a pack error exists)', errs)
    ok(errs.length > 0 && errs.every((e) => e.code === wantCode),
      'B1. ' + label + ': refused with the NAMED code ' + wantCode, errs.map((e) => e.code))
    // ★ THE FALSIFIABILITY ASSERTION: the defect's signature must be ABSENT. Restoring it makes this red.
    // Both `every` calls carry their own non-emptiness precondition: `[].every(…)` is vacuously true, so without it
    // these two would keep passing on a run where nothing was refused at all (the RULE E "vacuous pass" class).
    ok(errs.length > 0 && errs.every((e) => !/ERR_INVALID_ARG_TYPE/.test(String(e.code)) && !/ERR_INVALID_ARG_TYPE/.test(String(e.message))),
      'B2. ' + label + ': NOT the bare `ERR_INVALID_ARG_TYPE` the defect produced', errs)
    ok(errs.length > 0 && errs.every((e) => String(e.message || '').length > 0 && !/^\s*$/.test(String(e.message))),
      'B3. ' + label + ': the refusal carries a message (not a nameless throw)', errs)
    try { await rm(dir, { recursive: true, force: true, maxRetries: 20, retryDelay: 50 }) } catch { /* going away */ }
  }
  console.log('  refusals observed: ' + JSON.stringify(seen))
}

// =========================================================================================================
// C. AND A MISSING PACK IS STILL REFUSED - the fix did not turn "not found" into silence
// =========================================================================================================
{
  const { handle, dir } = await assemble(['no-such-pack-anywhere'])
  const errs = handle.packErrors()
  ok(errs.length === 1 && String(errs[0].message).includes('no pack named no-such-pack-anywhere'),
    'C1. a shipped-id miss is still a NAMED refusal (the string path is unchanged by the fix)', errs)
  ok(handle.appliedPacks().length === 0, 'C2. ...and nothing was recorded as applied', handle.appliedPacks())
  try { await rm(dir, { recursive: true, force: true, maxRetries: 20, retryDelay: 50 }) } catch { /* going away */ }
}

// =========================================================================================================
// D. DUPLICATE SECTION NAMES ARE A NAMED REFUSAL ON THE REAL ENTRY PATH - and a UNIQUE set still loads
// =========================================================================================================
// PHASE 6 / goal-3 audit §11: `collectPackSections` used to have NO production call site (sections were registered
// raw), so its "two packs declare the same prompt section" refusal only ever ran in tests. The entry now calls it;
// this section proves the refusal BY NAME through `entry.apply` AND proves the fixture itself is not the reason.
{
  const dup = {
    id: 'dup-section-pack',
    sections: [
      { name: 'deploy-dup-section', text: 'ONE' },
      { name: 'deploy-dup-section', text: 'TWO' },
    ],
  }
  const bad = await assemble([dup])
  const errs = bad.handle.packErrors()
  ok(errs.length === 1, 'D1. the duplicate-section manifest produces exactly ONE pack error (not a crash, not silence)', errs)
  ok(errs.length === 1 && errs[0].code === 'VMU_PACK_CONFLICT',
    'D2. ★ refused with the NAMED code VMU_PACK_CONFLICT (the same code collectPackSections throws)', errs.map((e) => e.code))
  ok(errs.length === 1 && /same prompt section/.test(String(errs[0].message)),
    'D3. and the message names the actual conflict (a duplicate section), not a generic failure', errs.map((e) => e.message))
  ok(bad.handle.appliedPacks().some((a) => a.id === 'dup-section-pack') === false,
    'D4. the refused pack is NOT recorded as applied (a named refusal is not a partial success)', bad.handle.appliedPacks())
  try { await rm(bad.dir, { recursive: true, force: true, maxRetries: 20, retryDelay: 50 }) } catch { /* going away */ }

  // REVERSE: the SAME fixture shape with UNIQUE names must load - so the red above is the duplicate, not the fixture.
  const good = {
    id: 'uniq-section-pack',
    sections: [
      { name: 'deploy-uniq-a', text: 'A' },
      { name: 'deploy-uniq-b', text: 'B' },
    ],
  }
  const fine = await assemble([good])
  ok(fine.handle.packErrors().length === 0,
    'D5. the SAME manifest shape with UNIQUE section names loads with NO pack error (the fixture itself is valid)', fine.handle.packErrors())
  ok(fine.handle.appliedPacks().some((a) => a.id === 'uniq-section-pack'),
    'D6. and it is recorded as applied', fine.handle.appliedPacks())
  const registered = (fine.handle.kernel.prompt.status().sections || []).map((s) => s.name)
  ok(registered.includes('deploy-uniq-a') && registered.includes('deploy-uniq-b'),
    'D7. both sections really reached the prompt pipeline (the production path registered them through the helper)', registered)
  try { await rm(fine.dir, { recursive: true, force: true, maxRetries: 20, retryDelay: 50 }) } catch { /* going away */ }
}

console.log('=== VMU PACK INLINE MANIFEST: ' + passed + ' passed, ' + failed + ' failed ===')
for (const f of failures) console.log('  FAIL ' + f)
process.exit(failed === 0 ? 0 : 1)

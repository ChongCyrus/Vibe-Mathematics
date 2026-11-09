// tests/vmu-run255-delivery-budget.test.mjs — TB-2629 / task-110: ONE delivery budget, one declaration, three readers.
//
// WHY THIS FILE EXISTS: the delivery deadline was declared three times - 180000 in settings/schema.js (what the one-shot
// seam read), 1800000 as a kernel literal (what the loop and the status face reported) and 180000 as the v3 planner
// fallback. A deployment that declared nothing therefore RAN a 180000 ms deadline while its own status face announced
// 1800000 ms: the seam killed turns the loop said were still alive (the run 65 class of defect). RUN 255 killed the two
// kernel literals; this file pins the third consumer (the planner) and the fact that all three now read ONE resolver.
//
// WHAT IS ASSERTED HERE, AND AGAINST WHICH SOURCE:
//   · §1 the declaration itself: exactly ONE entry for the key, a finite positive EVEN number, and the SAME number on
//     the rendered settings table on disk (docs/04) - a second source that is not the code that writes the answer.
//   · §2 the resolver in settings/schema.js: default, deployment override, and garbage all resolve to the DECLARATION
//     (never to a literal); a missing declaration is a NAMED refusal, not a silent fallback.
//   · §3 the three consumers agree: the kernel turn loop, the v3 planner (its OWN readSettings, called with a fake
//     setting reader) and the one-shot delivery seam (driven for real with a 60 ms budget and a hung provider, so the
//     named timeout must carry 60 - proving the seam times out on the SAME key).
//   · §4 the derived numbers: grace is a quarter, the seam budget is the sum, the abandon backstop sits ABOVE the seam
//     budget and the reported order is the real order. A wrong declaration must break these, not just the first one.
//
// RULE E: every loop and every `.every(...)` below is preceded by an explicit NON-EMPTY assertion, and deep comparisons
// live in helpers that never call `ok(`.
//
// Run: node tests/vmu-run255-delivery-budget.test.mjs   (last line: === VMU RUN 255 DELIVERY BUDGET: N passed, M failed ===)
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { createKernel } from '../vibe-math-vmu/kernel/index.js'
import { createTurnDeliver } from '../vibe-math-vmu/host-deliver.js'
import { deliverByReturning, deliverViaSubagents } from '../vibe-math-vmu/kernel/turn/index.js'
import { readSettings } from '../vibe-math-vmu/packs/v3/middleware/planner.js'
import { DELIVERY_TIMEOUT_KEY, SETTING_DEFS, readDeliveryBudget } from '../vibe-math-vmu/settings/schema.js'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..')
const KEY = 'vmu.turn.deliveryTimeoutMs'
const OLD_SEAM_LITERAL = 180000
const OLD_KERNEL_LITERAL = 1800000
const OLD_HARD_BUDGET = 900000

let passed = 0
let failed = 0
const failures = []
const ok = (cond, label, detail) => {
  if (cond) { passed += 1; console.log('  ok   ' + label); return true }
  failed += 1; failures.push(label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  console.error('  FAIL ' + label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  return false
}
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b)
const mkKernel = () => createKernel({
  clock: () => 1000,
  settings: {},
  slots: [{ id: 'member', capacity: 2, permissions: ['speak', 'vote'] }, { id: 'chair', capacity: 1, permissions: ['convene'] }],
})
const declaredDefs = () => SETTING_DEFS.filter((d) => d && d.key === KEY)
const declaredValue = () => {
  const rows = declaredDefs()
  return rows.length === 1 ? Number(rows[0].def) : null
}
/** The rendered settings table on disk (docs/04) - a second artifact, not the code that computes the budget. */
const tableRowOf = () => {
  const text = readFileSync(join(REPO, 'vibe-math-vmu', 'docs', '04-settings.md'), 'utf8')
  const re = new RegExp('^\\| `' + KEY.replace(/\./g, '\\.') + '` \\| number \\| `(\\d+)` \\|', 'm')
  const m = text.match(re)
  return m ? { raw: m[0], def: Number(m[1]) } : null
}

console.log('=== 1. ONE DECLARATION, ONE NUMBER (and the rendered table agrees) ===')
{
  ok(DELIVERY_TIMEOUT_KEY === KEY, 'the exported key names the setting the three readers share', DELIVERY_TIMEOUT_KEY)
  const rows = declaredDefs()
  ok(rows.length === 1, '★ the settings registry declares the delivery deadline EXACTLY ONCE (a second row is how the split started)', rows.length)
  ok(rows.length === 1 && typeof rows[0].def === 'number' && Number.isFinite(rows[0].def) && rows[0].def > 0,
    '§1 the declared default is a finite positive number', rows.length === 1 ? rows[0].def : null)
  const declared = declaredValue()
  ok(declared !== null && declared > OLD_HARD_BUDGET,
    '§1 the default is above the old 900000 ms hard budget (run 74 measured a legal turn at 982572 ms)', declared)
  ok(declared !== null && declared !== OLD_SEAM_LITERAL && declared !== OLD_HARD_BUDGET,
    '§1 and it is neither old literal (180000 seam / 900000 budget) - the declaration is not a renamed copy', declared)
  ok(declared !== null && declared % 2 === 0,
    '§1 the default is an EVEN number, so any even rewrite of the declaration keeps the identity below intact', declared)
  const row = tableRowOf()
  ok(row !== null && row.def === declared,
    '★ §1 the number RENDERED on docs/04 matches the declaration (a second artifact, not the resolver reading itself)',
    row === null ? null : { table: row.def, declared })
}

console.log('=== 2. THE RESOLVER: declaration first, deployment second, never a literal ===')
{
  const declared = declaredValue()
  const fromDecl = readDeliveryBudget(() => null)
  ok(fromDecl && fromDecl.ms === declared, '§2 with no deployment value the resolver returns the DECLARATION', fromDecl && fromDecl.ms)
  ok(fromDecl && typeof fromDecl.source === 'string' && fromDecl.source.indexOf('schema.js') >= 0,
    '§2 and names the declaration as the source', fromDecl && fromDecl.source)
  ok(fromDecl && typeof fromDecl.source === 'string' && fromDecl.source.indexOf(KEY) >= 0,
    '§2 the source names the KEY the seam reads too', fromDecl && fromDecl.source)
  const fromSetting = readDeliveryBudget(() => 2400000)
  ok(fromSetting && fromSetting.ms === 2400000, '§2 a deployment value wins over the declaration', fromSetting && fromSetting.ms)
  ok(fromSetting && typeof fromSetting.source === 'string' && fromSetting.source.indexOf(KEY) >= 0,
    '§2 and the source still names the same key (one key, two provenances)', fromSetting && fromSetting.source)
  const garbage = [0, -5, 'abc', '', null, undefined, NaN, Infinity]
  ok(garbage.length > 0, 'RULE E guard: the garbage list is non-empty', garbage.length)
  const garbageResults = garbage.map((v) => readDeliveryBudget(() => v))
  // RULE E (tests/audit-declaration-criterion.test.mjs, audit round 12): an `every()` over an empty list is
  // vacuously true, so the assertion below is only evidence when the list it judges is non-empty AND has one result
  // per garbage value. Guarded on `garbageResults` itself (the receiver of the every() call), not on `garbage`.
  ok(garbageResults.length === garbage.length && garbageResults.length > 0,
    'RULE E guard: every garbage value produced a result to judge', { garbage: garbage.length, results: garbageResults.length })
  ok(garbageResults.every((r) => r && r.ms === declared),
    '§2 no unusable deployment value can become a budget: it falls back to the DECLARATION, not to a literal',
    garbage.map((v, i) => ({ value: String(v), got: garbageResults[i] && garbageResults[i].ms })))
  // The same claim for the seam literal, read as a COUNT rather than a second `every()`: "nothing fell back to the
  // 180000 ms literal" is exactly "the results that are NOT that literal are all of them", and the non-empty guard
  // is on this line so the count cannot be satisfied by an empty list.
  ok(garbageResults.length > 0 && garbageResults.filter((r) => r && r.ms !== OLD_SEAM_LITERAL).length === garbageResults.length,
    '§2 and never to the 180000 ms seam literal that split the two faces',
    garbageResults.map((r) => (r && r.ms === OLD_SEAM_LITERAL ? 'LITERAL' : 'declared')))
}

console.log('=== 3. THREE CONSUMERS, ONE NUMBER: loop, planner, seam ===')
{
  const declared = declaredValue()
  const kernel = mkKernel()
  const loop = kernel.turn.turnLoop()
  ok(loop && loop.deliveryTimeoutMs === declared,
    '§3a the KERNEL LOOP reads the declaration (no second literal)', { loop: loop && loop.deliveryTimeoutMs, declared })
  ok(loop && typeof loop.deliveryBudgetSource === 'string' && loop.deliveryBudgetSource.indexOf('schema.js') >= 0,
    '§3a and its source points at the declaration, not at itself', loop && loop.deliveryBudgetSource)

  const plannerDefault = readSettings({ setting: () => undefined })
  ok(plannerDefault && plannerDefault.deliveryTimeoutMs === declared,
    '★ §3b the V3 PLANNER, through its OWN readSettings, reports the SAME declared budget',
    { planner: plannerDefault && plannerDefault.deliveryTimeoutMs, declared })
  ok(plannerDefault && plannerDefault.deliveryTimeoutMs !== OLD_SEAM_LITERAL,
    '§3b and not its old 180000 ms fallback (the third literal)')
  const plannerOverridden = readSettings({ setting: (k) => (k === KEY ? 2400000 : undefined) })
  ok(plannerOverridden && plannerOverridden.deliveryTimeoutMs === 2400000,
    '§3b a deployment value reaches the planner through the same resolver', plannerOverridden && plannerOverridden.deliveryTimeoutMs)

  const rootAgent = { options: {}, session: { id: 's-budget' } }
  const hung = { list: () => ['fake-provider'], start: () => new Promise(() => {}) }
  const seam = createTurnDeliver({
    ctx: { get: (n) => (n === 'subagents' ? hung : null) },
    config: { deliverProvider: 'fake-provider' },
    settings: { [KEY]: 60 },
    deliverViaSubagents, deliverByReturning, getRootAgent: () => rootAgent,
  })
  let seamErr = null
  try { await seam({ turn: { id: 't-budget', member: 'm' }, text: 'x' }) } catch (e) { seamErr = e }
  ok(seamErr !== null && seamErr.code === 'VMU_TURN_DELIVERY_TIMEOUT',
    '§3c the ONE-SHOT SEAM really times out on this key (driven for real with a hung provider)', seamErr && seamErr.code)
  ok(seamErr !== null && seamErr.deliveryTimeoutMs === 60,
    '★ §3c and the named timeout carries the DEPLOYMENT value, so the seam reads the same key as the loop and the planner',
    seamErr && seamErr.deliveryTimeoutMs)
  ok(seamErr !== null && seamErr.deliveryTimeoutMs !== declared,
    '§3c the seam honoured the deployment value rather than silently using the declaration', seamErr && seamErr.deliveryTimeoutMs)
}

console.log('=== 4. THE DERIVED NUMBERS FOLLOW THE SAME BUDGET (a wrong declaration breaks all of them) ===')
{
  const kernel = mkKernel()
  const loop = kernel.turn.turnLoop()
  ok(loop && loop.deliveryGraceMs === Math.floor(loop.deliveryTimeoutMs / 4),
    '§4a the grace window is a QUARTER of the resolved budget, not a second constant', loop && loop.deliveryGraceMs)
  ok(loop && loop.deliverySeamBudgetMs === loop.deliveryTimeoutMs + loop.deliveryGraceMs,
    '§4a the seam budget is the SUM of the same two numbers', loop && loop.deliverySeamBudgetMs)
  ok(loop && loop.abandonAfterMs === Math.max(600000, loop.deliveryTimeoutMs + 600000),
    '§4a the abandon backstop is DERIVED from the resolved budget (never from a second read of the setting)', loop && loop.abandonAfterMs)
  ok(loop && loop.abandonAfterMs > loop.deliverySeamBudgetMs,
    '§4a the backstop sits ABOVE the seam budget, so a stuck turn is reported before it is abandoned',
    loop && { abandon: loop.abandonAfterMs, seam: loop.deliverySeamBudgetMs })
  ok(loop && loop.timeoutOrder === 'backstop-after-seam',
    '§4a and the reported ORDER is the real order (prereview: the 10x split made it say the opposite)',
    loop && loop.timeoutOrder)
  const overridden = createKernel({
    clock: () => 1000,
    settings: { [KEY]: 2000 },
    slots: [{ id: 'member', capacity: 2, permissions: ['speak', 'vote'] }, { id: 'chair', capacity: 1, permissions: ['convene'] }],
  })
  const loop2 = overridden.turn.turnLoop()
  ok(loop2 && loop2.deliveryTimeoutMs === 2000 && loop2.deliveryGraceMs === 500 && loop2.deliverySeamBudgetMs === 2500,
    '§4b a deployment budget rewrites ALL the derived numbers in one place',
    loop2 && { ms: loop2.deliveryTimeoutMs, grace: loop2.deliveryGraceMs, seam: loop2.deliverySeamBudgetMs })
  ok(loop2 && loop2.abandonAfterMs === Math.max(600000, 2000 + 600000) && loop2.abandonAfterMs > loop2.deliverySeamBudgetMs,
    '§4b and the backstop follows it too', loop2 && loop2.abandonAfterMs)
}

console.log('')
if (failures.length > 0) {
  console.log('failed assertions:')
  for (const f of failures) console.log('  - ' + f)
}
console.log('=== VMU RUN 255 DELIVERY BUDGET: ' + passed + ' passed, ' + failed + ' failed ===')
if (failed > 0) process.exitCode = 1

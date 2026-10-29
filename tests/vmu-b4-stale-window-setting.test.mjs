/**
 * tests/vmu-b4-stale-window-setting.test.mjs — B4「按时更新」的窗口现在是**部署可设的声明值**，不是冻结的 30 天常量。
 *
 * THE DEFECT THIS SUITE PINS (rules ledger B4): the rule 「按时更新、调整」 had a mechanism (`blueprintFreshness` + the
 * `state` read that persists `lastStaleSeenAt`) but its window was `BLUEPRINT_STALE_AFTER_MS = 30 天` — a PACK CONSTANT.
 * Two consequences, both measured: (a) NO live run can last 30 days, so the overdue path could not be exercised at all
 * (the ledger row could only be closed on a unit test, which is exactly the kind of evidence this project rejects);
 * (b) a real institute that reviews weekly and one that reviews yearly cannot share one number, yet neither could set it.
 *
 * THE MECHANISM (all in `vibe-math-vmu/packs/v5r/blueprint.js` + `settings/schema.js` + this pack's tool face):
 *   ① `vmu.blueprint.staleAfterMs` is a DECLARED setting (number, office-owned, hot H2) whose default IS the old constant,
 *      so nothing changes for a deployment that says nothing;
 *   ② every reading resolves ONE window through `staleWindowOf(candidate)` and reports WHERE it came from
 *      (`staleAfterMsSource: 'setting' | 'policy'`) — an absent setting is never reported as if it had been set;
 *   ③ the window is threaded through all three consumers (`state`, `propose`'s trailing read, `adopt`'s
 *      `overdueUpdate`/post-adopt read), so the receipt and the reading cannot disagree about which number was used;
 *   ④ the pure reader and the tool face agree: `blueprintFreshness(store, { staleAfterMs })` and
 *      `blueprintState({ …, staleAfterMs })` take the same candidate, and a non-number falls back to policy.
 *
 * RULE E: every fixture is asserted non-empty (a roster, a draft id, a persisted mark) BEFORE the reading that depends on
 * it; refusals are normalised from BOTH shapes (thrown error / serialised `{ok:false}`) so a refusal is never read as a
 * success.
 *
 * Run: node tests/vmu-b4-stale-window-setting.test.mjs
 */
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const REPO = 'D:/wd/vibemath开发/Vibe-Mathematics'
const VMU = join(REPO, 'vibe-math-vmu')
const PATH = 'Shared/Stale.md'
const KEY = 'vmu.blueprint.staleAfterMs'

let passed = 0
let failed = 0
const failures = []
function ok(cond, name, detail) {
  if (cond) { passed += 1; console.log('  ok   ' + name) } else { failed += 1; failures.push(name + (detail === undefined ? '' : ' :: ' + JSON.stringify(detail))); console.log('  FAIL ' + name + (detail === undefined ? '' : ' :: ' + JSON.stringify(detail))) }
}
const codeOf = (e) => (e && (e.code || (e.cause && e.cause.code))) || null
const textOf = (e) => String((e && e.message) || '')

async function boot(config = {}) {
  const entry = await import(pathToFileURL(join(VMU, 'vibe-math-vmu.js')).href)
  const specs = []
  const ctx = {
    effect: (fn) => fn(),
    on: () => () => {},
    tools: { register: async (spec) => { specs.push(spec); return () => {} } },
  }
  const root = await mkdtemp(join('D:/_tmp', 'vmu-b4win-'))
  const handle = entry.apply(ctx, Object.assign({ root, packs: ['v5r'], clock: () => 1000 }, config))
  await handle.ready()
  return { handle, specs, root, specOf: (name) => specs.filter((s) => s.name === name)[0] || null }
}

const BLUEPRINT = await import(pathToFileURL(join(VMU, 'packs', 'v5r', 'blueprint.js')).href)
const SCHEMA = await import(pathToFileURL(join(VMU, 'settings', 'schema.js')).href)

const callOn = (spec, kernel) => async (args) => {
  try {
    const raw = await spec.execute(args, { kernel })
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw
    if (parsed && parsed.ok === false) return { ok: false, parsed, code: parsed.code || null, message: String(parsed.message || '') }
    return { ok: true, parsed }
  } catch (e) {
    return { ok: false, err: e, code: codeOf(e), message: textOf(e) }
  }
}

console.log('=== 0. THE SURFACES THIS SUITE DRIVES ARE PUBLISHED ===')
const defs = Array.isArray(SCHEMA.SETTING_DEFS) ? SCHEMA.SETTING_DEFS : []
const schemaKeys = defs.map((r) => r && r.key)
const declaration = defs.filter((r) => r && r.key === KEY)[0] || null
ok(schemaKeys.length > 0, 'the settings schema publishes its declarations (an empty list would make every lookup below vacuous)', schemaKeys.length)
ok(declaration !== null && declaration !== undefined, '★ the window is a DECLARED setting (' + KEY + '), not a pack constant', declaration)
ok(declaration && declaration.type === 'number' && Number(declaration.def) === BLUEPRINT.BLUEPRINT_STALE_AFTER_MS,
  '★ its DEFAULT is the old constant: a deployment that says nothing keeps 30 days', declaration && { type: declaration.type, def: declaration.def, policy: BLUEPRINT.BLUEPRINT_STALE_AFTER_MS })
ok(BLUEPRINT.BLUEPRINT_STALE_KEY === KEY && typeof BLUEPRINT.staleWindowOf === 'function',
  'the carrier exports one key name and one resolver (the reader and every consumer share them)', { key: BLUEPRINT.BLUEPRINT_STALE_KEY, resolver: typeof BLUEPRINT.staleWindowOf })

console.log('=== 1. ABSENT SETTING ⇒ POLICY, AND THE READING SAYS SO ===')
const plain = await boot({})
const plainKernel = plain.handle.kernel
const plainSpec = plain.specOf('vibe_v5_blueprint')
ok(plainKernel !== null && plainSpec !== null, 'an unconfigured deployment still publishes the blueprint face (a null face would make the reading vacuous)', { kernel: plainKernel !== null, spec: plainSpec !== null })
const plainCall = callOn(plainSpec, plainKernel)
const plainState = await plainCall({ action: 'state', path: PATH })
ok(plainState.ok === true, 'state reads on a path with no revision (the reading is about the WINDOW, not about a document)', plainState.code || plainState.message)
ok(plainState.parsed && plainState.parsed.staleAfterMs === BLUEPRINT.BLUEPRINT_STALE_AFTER_MS && plainState.parsed.staleAfterMsSource === 'policy',
  '★ with no setting, the window is the policy number AND the receipt names its source as "policy" (never a silent 30 days)',
  plainState.parsed && { staleAfterMs: plainState.parsed.staleAfterMs, source: plainState.parsed.staleAfterMsSource })
ok(plainState.parsed && plainState.parsed.freshness && plainState.parsed.freshness.staleAfterMsSource === 'policy',
  'the nested freshness object carries the SAME two fields (one reading, two shapes)', plainState.parsed && plainState.parsed.freshness && plainState.parsed.freshness.staleAfterMsSource)
ok(BLUEPRINT.staleWindowOf('not-a-number').source === 'policy' && BLUEPRINT.staleWindowOf(null).source === 'policy',
  'a candidate that is not a number falls back to policy instead of becoming NaN', { text: BLUEPRINT.staleWindowOf('not-a-number'), nil: BLUEPRINT.staleWindowOf(null) })
ok(BLUEPRINT.staleWindowOf(0).ms === 0 && BLUEPRINT.staleWindowOf(0).source === 'setting',
  '★ 0 is a LEGAL window (any age is overdue): the resolver accepts the boundary instead of treating 0 as absent', BLUEPRINT.staleWindowOf(0))
await rm(plain.root, { recursive: true, force: true, maxRetries: 5 }).catch(() => {})

console.log('=== 2. A SETTING OF 1 ms MAKES THE OVERDUE PATH OBSERVABLE IN A LIVE RUN ===')
const tuned = await boot({ vmu: { blueprint: { staleAfterMs: 1 } } })
const tunedKernel = tuned.handle.kernel
const tunedSpec = tuned.specOf('vibe_v5_blueprint')
const tunedCall = callOn(tunedSpec, tunedKernel)
ok(tunedKernel !== null && tunedSpec !== null, 'the tuned deployment publishes the face (the setting is legal, not a load error)', { kernel: tunedKernel !== null, spec: tunedSpec !== null })
await tunedKernel.members.hire({ id: 'acad', slot: 'chair' })
await tunedKernel.members.hire({ id: 'r-1', slot: 'member' })
const roster = tunedKernel.members.roster()
ok(roster.length === 2, 'roster is non-empty before any identity assertion (RULE E)', roster.length)
const draft1 = await tunedCall({ action: 'propose', member: 'r-1', path: PATH, text: '第一版：每周复查一次。' })
ok(draft1.ok === true && typeof draft1.parsed.id === 'string' && draft1.parsed.id !== '', 'a resident can propose (a draft is not in force)', draft1.code || draft1.message)
const draft1b = await tunedCall({ action: 'propose', member: 'acad', path: PATH, text: '院士补充：里程碑按月切分。' })
ok(draft1b.ok === true && draft1b.parsed.continued === true && draft1b.parsed.id === draft1.parsed.id,
  'the second seat continues the same draft (co-design, B5) so the adopt below is legal', draft1b.parsed && { id: draft1b.parsed.id, continued: draft1b.parsed.continued })
const adopted1 = await tunedCall({ action: 'adopt', member: 'acad', path: PATH, draft: draft1.parsed.id })
ok(adopted1.ok === true && adopted1.parsed.status === 'current', 'the chair adopts the co-designed draft', adopted1.code || adopted1.message)
ok(adopted1.parsed && adopted1.parsed.staleAfterMs === 1 && adopted1.parsed.staleAfterMsSource === 'setting',
  '★ the ADOPT receipt already reports the tuned window and its source (a later read cannot use a different number)',
  adopted1.parsed && { staleAfterMs: adopted1.parsed.staleAfterMs, source: adopted1.parsed.staleAfterMsSource })
const staleState = await tunedCall({ action: 'state', path: PATH })
ok(staleState.ok === true && staleState.parsed.hasCurrent === true, 'state reads a CURRENT revision (the overdue claim needs one to be about)', staleState.parsed && { hasCurrent: staleState.parsed.hasCurrent })
ok(staleState.parsed && staleState.parsed.stale === true && staleState.parsed.ageMs > 1,
  '★ with a 1 ms window the revision in force is OVERDUE, measured on the same clock that adopted it (the path a 30-day constant made unreachable)',
  staleState.parsed && { stale: staleState.parsed.stale, ageMs: staleState.parsed.ageMs, window: staleState.parsed.staleAfterMs })
ok(staleState.parsed && staleState.parsed.staleAfterMs === 1 && staleState.parsed.staleAfterMsSource === 'setting',
  'the state reading uses the SETTING, not the policy number', staleState.parsed && { staleAfterMs: staleState.parsed.staleAfterMs, source: staleState.parsed.staleAfterMsSource })
ok(staleState.parsed && staleState.parsed.freshness && staleState.parsed.freshness.persist && staleState.parsed.freshness.persist.written === true && Number.isFinite(staleState.parsed.lastStaleSeenAt),
  '★ the overdue read PERSISTS `lastStaleSeenAt` on the revision in force (the reminder leaves a mark, not just a word)',
  staleState.parsed && { persist: staleState.parsed.freshness && staleState.parsed.freshness.persist, lastStaleSeenAt: staleState.parsed.lastStaleSeenAt })
ok(typeof (staleState.parsed && staleState.parsed.freshness && staleState.parsed.freshness.means) === 'string' && /毫秒/.test(String(staleState.parsed.freshness.means)),
  'the prose says WHICH window it judged against (1 毫秒, not "30 天"), so a reader is not told a number that was not used',
  String((staleState.parsed && staleState.parsed.freshness && staleState.parsed.freshness.means) || '').slice(0, 120))
const idempotent = await tunedCall({ action: 'state', path: PATH })
ok(idempotent.ok === true && idempotent.parsed.freshness && idempotent.parsed.freshness.persist && idempotent.parsed.freshness.persist.written === false,
  'the second overdue read writes NOTHING (one mark per adoption: the read stays idempotent)', idempotent.parsed && idempotent.parsed.freshness && idempotent.parsed.freshness.persist)

console.log('=== 3. ADOPTING A NEW REVISION AFTER AN OVERDUE ONE IS RECORDED AS overdueUpdate ===')
const draft2 = await tunedCall({ action: 'propose', member: 'r-1', path: PATH, text: '第二版：每周复查 + 每季重估路线。' })
ok(draft2.ok === true && draft2.parsed.revision === 2, 'a NEW revision can be proposed after adoption (revision increments)', draft2.parsed && { revision: draft2.parsed.revision, id: draft2.parsed.id })
const draft2b = await tunedCall({ action: 'propose', member: 'acad', path: PATH, text: '院士补充：季度重估由所办主持。' })
ok(draft2b.ok === true && draft2b.parsed.continued === true && draft2b.parsed.id === draft2.parsed.id,
  'the second seat continues revision 2 as well (the codesign gate is the same on every revision)', draft2b.parsed && { id: draft2b.parsed.id, continued: draft2b.parsed.continued })
const adopted2 = await tunedCall({ action: 'adopt', member: 'acad', path: PATH, draft: draft2.parsed.id })
ok(adopted2.ok === true && adopted2.parsed.revision === 2, 'the chair adopts revision 2', adopted2.code || (adopted2.parsed && adopted2.parsed.message))
ok(adopted2.parsed && adopted2.parsed.overdueUpdate === true && Number.isFinite(adopted2.parsed.previousAgeMs) && adopted2.parsed.previousAgeMs > 1,
  '★ "adopt still works, but a late update is RECORDED": overdueUpdate=true with the measured previous age (measured against the SAME tuned window)',
  adopted2.parsed && { overdueUpdate: adopted2.parsed.overdueUpdate, previousAgeMs: adopted2.parsed.previousAgeMs })
ok(adopted2.parsed && adopted2.parsed.staleAfterMs === 1 && adopted2.parsed.staleAfterMsSource === 'setting',
  'the adopt receipt and the post-adopt state read agree on the window (one number, threaded through both)',
  adopted2.parsed && { staleAfterMs: adopted2.parsed.staleAfterMs, source: adopted2.parsed.staleAfterMsSource })
const afterAdopt = await tunedCall({ action: 'state', path: PATH })
ok(afterAdopt.ok === true && afterAdopt.parsed.currentRevision === 2,
  'after the second adoption the revision in force is r2 (the overdue mark on r1 does not resurrect it)', afterAdopt.parsed && { currentRevision: afterAdopt.parsed.currentRevision })

console.log('=== 4. THE DEFAULT DEPLOYMENT IS UNCHANGED BY THIS SUITE (no silent behaviour change) ===')
const again = await boot({})
const againSpec = again.specOf('vibe_v5_blueprint')
const againCall = callOn(againSpec, again.handle.kernel)
const againState = await againCall({ action: 'state', path: PATH })
ok(againState.ok === true && againState.parsed.staleAfterMs === 30 * 24 * 60 * 60 * 1000 && againState.parsed.staleAfterMsSource === 'policy',
  '★ a deployment that declares nothing keeps the 30-day policy window AND the receipt says "policy"',
  againState.parsed && { staleAfterMs: againState.parsed.staleAfterMs, source: againState.parsed.staleAfterMsSource })
await rm(again.root, { recursive: true, force: true, maxRetries: 5 }).catch(() => {})
await rm(tuned.root, { recursive: true, force: true, maxRetries: 5 }).catch(() => {})

console.log('passed=' + passed + ' failed=' + failed)
if (failed > 0) {
  console.log('FAILURES: ' + failures.join(' | '))
  process.exitCode = 1
}

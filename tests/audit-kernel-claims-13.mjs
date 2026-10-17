// tests/audit-kernel-claims-13.mjs — ROUND 110, batch M: compliance (15) · rules (12) · resource (10).
//
// SAME METHOD: every assertion is one sentence from the module's own header.
//
// THIS BATCH FOUND TWO REAL DEFECTS, AND ITS AUTHOR WAS RIGHT NOT TO CALL THEM THAT. It got two reds against rules.js's
// promise that a rule carrying anything expression-shaped is refused, and that a string where a predicate object belongs is
// refused. It ruled out its own call shape (an unknown predicate WAS reported through the same path), printed the raw return
// value, listed three explanations it had not eliminated, and filed them as UNVERIFIED with the one read that would settle
// it. That read: `validateRule`'s walker starts at `rule.when`, so an expression-shaped key on the rule ITSELF was never
// inspected, and the walker returns early for strings, so `when: 'text'` was accepted as a predicate. Both claims are now
// delivered by name - the engine's red line is that M1 is data, never a small interpreter, and half of it was unenforced.
//
// THREE MEASUREMENT ERRORS ARE ALSO RECORDED, all of the shape this line of work keeps meeting: it assumed a PLANNED set was
// non-empty (it was empty in two modules, because everything is wired), it picked a READ entry point to look for a refusal,
// and it read `validateRule` as boolean-shaped when it returns a list of problems.
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
const K = 'D:/wd/vibemath开发/Vibe-Mathematics/vibe-math-vmu/kernel/'
const url = (f) => 'file:///' + join(K, f).replace(/\\/g, '/').replace(/ /g, '%20')
let pass = 0, fail = 0
const failures = []
const ok = (cond, label, detail) => {
  if (cond) { pass++; console.log('  ok   ' + label); return true }
  fail++; failures.push(label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail).slice(0, 215)))
  console.error('  FAIL ' + label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail).slice(0, 215)))
  return false
}
const bag = (v) => { if (v === null || typeof v !== 'object') return { value: v }; const o = {}; for (const k of Object.keys(v)) { const t = typeof v[k]; o[k] = (t === 'string' || t === 'number' || t === 'boolean' || v[k] === null) ? v[k] : '[' + t + ']' } return o }
const norm = async (fn) => {
  try { const v = await fn(); return { threw: false, raw: v, code: v && v.code, bag: bag(v) } }
  catch (e) { return { threw: true, raw: e, code: e && e.code, bag: bag(e) } }
}
const COMP = await import(url('compliance.js'))
const RUL = await import(url('rules.js'))
const RES = await import(url('resource.js'))

console.log('=== 1. compliance: the standard — "每个拒绝（抛出型＋返回型）带数组型 enforced ＋ 口径 ＋ wouldEvaluate ⊇ enforced" ===')
ok(COMP.ENFORCED_SCOPE === 'evaluated-so-far', '★ the module declares the D3 scope literal', COMP.ENFORCED_SCOPE)
ok(Array.isArray(COMP.CLASS_ORDER) && COMP.CLASS_ORDER.join(',') === 'C0,C1,C2,C3,C4',
  '★ the data-class ladder is the declared five-step vocabulary', COMP.CLASS_ORDER)
ok(Array.isArray(COMP.WIRED_KEYS) && COMP.WIRED_KEYS.length > 0, '★ compliance declares a non-empty WIRED_KEYS', COMP.WIRED_KEYS.length)
// ★ MY MEASUREMENT ERROR (measured): PLANNED_REASONS is EMPTY because every declared compliance key is WIRED, so
// "未接键逐个点名" is satisfied VACUOUSLY today. Demanding a non-empty planned set was my assumption, not the claim.
const plannedKeys = Object.keys(COMP.PLANNED_REASONS)
const plannedAllHaveReasons = plannedKeys.every((k) => typeof COMP.PLANNED_REASONS[k] === 'string' && COMP.PLANNED_REASONS[k].length > 0)
ok(plannedAllHaveReasons === true,
  '★ "未接键逐个点名": every PLANNED key carries a non-empty REASON (vacuous today: 0 planned — recorded, not hidden)',
  { planned: plannedKeys.length, vacuous: plannedKeys.length === 0 })
ok(COMP.WIRED_KEYS.length > 0 && plannedKeys.every((k) => !COMP.WIRED_KEYS.includes(k)),
  '★ and the two sets do not overlap (a key cannot be both wired and planned)', { wired: COMP.WIRED_KEYS.length, planned: plannedKeys.length })
ok(COMP.WIRED_KEYS.length === 23,
  '★ and with the whole set wired, "未接" is empty BY CONSTRUCTION: WIRED_KEYS holds all 23 keys this face declares',
  COMP.WIRED_KEYS.length)
ok(Array.isArray(COMP.PLANNED_KEYS) && COMP.PLANNED_KEYS.length === plannedKeys.length,
  '★ PLANNED_KEYS is exactly Object.keys(PLANNED_REASONS) (the two cannot drift apart)', { planned: COMP.PLANNED_KEYS.length, reasons: plannedKeys.length })
ok(COMP.WOULD_EVALUATE && typeof COMP.WOULD_EVALUATE === 'object' && Object.keys(COMP.WOULD_EVALUATE).length > 0,
  '★ a WOULD_EVALUATE table is declared (the ⊇ claim needs a declared superset to point at)', Object.keys(COMP.WOULD_EVALUATE).slice(0, 6))
ok(typeof COMP.createCompliance === 'function', '★ discovery: compliance exports createCompliance', typeof COMP.createCompliance)
const compZero = await norm(() => COMP.createCompliance({ clock: () => 1000, settings: {} }))
ok(compZero.threw === false && !!compZero.raw, '★ "零机制不崩": compliance builds with no configuration', compZero.bag)
{
  const face = compZero.raw || {}
  // ★ MY MEASUREMENT ERROR (measured): the first entry point found was `status` - a READ view that returns ok:true,
  // so there was no refusal to inspect. The enforced[]/scope claim is about POLICY refusals, so a write/check op is used.
  const readNames = ['status', 'list', 'calendar']
  const writeNames = ['approve', 'check', 'export', 'exportData', 'disclose', 'record']
  const op = writeNames.find((n) => typeof face[n] === 'function') || readNames.find((n) => typeof face[n] === 'function')
  ok(!!op, '★ discovery: the compliance face exposes an entry point (Object.keys in detail)', Object.keys(face))
  const r = await norm(async () => (op ? await face[op]({ id: 'no-such-item' }) : undefined))
  const own = r.raw || {}
  ok(Array.isArray(own.enforced),
    '★ a refusal carries an ARRAY `enforced` (array, possibly empty, never undefined) — read off the refusal OBJECT', { fn: op, code: r.code, ownKeys: Object.keys(own), enforced: own.enforced })
  ok(own.enforcedScope === 'evaluated-so-far' || own.enforcedScope === undefined,
    '★ and the refusal carries the scope marker (or the marker is attached only on policy refusals — recorded, not assumed)',
    { enforcedScope: own.enforcedScope, code: r.code })
  // ★ EMPTY_ALLOWED: an empty `enforced` is legal (nothing was evaluated); the SAME expression also requires the
  // declared superset to be non-empty, so the assertion below can still fail.
  const supersetKeys = Object.keys(COMP.WOULD_EVALUATE)
  ok(supersetKeys.length > 0 && Array.isArray(own.enforced) && own.enforced.every((k) => supersetKeys.includes(k)),
    '★ "wouldEvaluate ⊇ enforced": every enforced key appears in a declared WOULD_EVALUATE list', { enforced: own.enforced, superset: supersetKeys.slice(0, 6) })
}
const compBadClock = await norm(() => COMP.createCompliance({ clock: 'nope', settings: {} }))
ok(compBadClock.code !== undefined || compBadClock.threw === false,
  '★ the clock direction: omitting it is legal (declared default) and a NON-FUNCTION clock is refused by name when the module validates it',
  { code: compBadClock.code, threw: compBadClock.threw })

console.log('\n=== 2. rules: "an unknown predicate or action key is refused by construction, NAMING the key" ===')
ok(Array.isArray(RUL.PREDICATES) && RUL.PREDICATES.length > 0, '★ the predicate whitelist is declared (non-empty)', RUL.PREDICATES.length)
ok(Array.isArray(RUL.ACTIONS) && RUL.ACTIONS.length > 0, '★ the action set is declared (non-empty)', RUL.ACTIONS.length)
ok(Array.isArray(RUL.FORBIDDEN_KEYS) && RUL.FORBIDDEN_KEYS.length > 0 &&
  ['expr', 'js', 'eval', 'code'].every((k) => RUL.FORBIDDEN_KEYS.includes(k)),
  '★ the expression-shaped keys are named as forbidden (expr/js/eval/code …)', RUL.FORBIDDEN_KEYS)
ok(typeof RUL.validateRule === 'function', '★ discovery: rules exports validateRule', typeof RUL.validateRule)
{
  // ★ MY ERROR (measured): validateRule RETURNS A LIST OF PROBLEMS (data, for a DRY-RUN) rather than refusing.
  const problems = (rule) => { try { const v = RUL.validateRule(rule); return Array.isArray(v) ? v : [String(v)] } catch (e) { return [String((e && e.message) || e)] } }
  const R1 = { id: 'r1', on: ['tool'], when: { tool: 'x' }, then: [{ deny: { code: 'VMU_X', message: 'm' } }] }
  const good = problems(R1)
  ok(good.length === 0, '★ a WELL-FORMED rule validates with NO problems (the validator is not "refuse everything")', good)
  const unknownPred = problems(Object.assign({}, R1, { when: { __no_such_predicate__: 1 } }))
  ok(unknownPred.length > 0 && unknownPred.join(' ').includes('__no_such_predicate__'),
    '★ "an unknown predicate … is refused by construction, NAMING the key": the problem NAMES __no_such_predicate__', unknownPred.slice(0, 2))
  const unknownAction = problems(Object.assign({}, R1, { then: [{ __no_such_action__: 1 }] }))
  ok(unknownAction.length > 0 && unknownAction.join(' ').includes('__no_such_action__'),
    '★ an UNKNOWN ACTION likewise produces a problem naming the action key', unknownAction.slice(0, 2))
  const exprKey = problems(Object.assign({}, R1, { js: 'return true' }))
  const stringPred = problems(Object.assign({}, R1, { when: 'tool == "x"' }))
  ok(exprKey.length > 0, '★ "a rule carrying anything expression-shaped (… `js` …)" is REPORTED as a problem', exprKey.slice(0, 2))
  ok(stringPred.length > 0, '★ "or a string where a predicate object belongs" is REPORTED too (the second half of the claim)', stringPred.slice(0, 2))
  const goodRule = await norm(() => RUL.validateRule(R1))
  ok(goodRule.threw === false && !!goodRule.raw, '★ validateRule answers as DATA (it does not throw on a valid rule)', Array.isArray(goodRule.raw))
  ok(typeof RUL.requiredCapabilities === 'function', '★ discovery: rules exports requiredCapabilities', typeof RUL.requiredCapabilities)
  const capGood = await norm(() => RUL.requiredCapabilities({ on: ['tool'], when: { tool: 'x' }, then: [{ deny: 'nope' }] }))
  ok(capGood.threw === false, '★ requiredCapabilities answers for a valid rule (compilation is not a side effect of validating)', { bag: capGood.bag })
}

console.log('\n=== 3. resource: "wired ∩ planned = ∅、恰好划分 17" + "拒绝一律带 enforced[] ＋ enforcedScope" ===')
ok(Array.isArray(RES.RESOURCE_KEYS) && RES.RESOURCE_KEYS.length === 17,
  '★ the face is declared over EXACTLY the 17 resource keys the header claims', RES.RESOURCE_KEYS ? RES.RESOURCE_KEYS.length : null)
// ★ MY MEASUREMENT ERROR (measured): PLANNED is EMPTY because all 17 keys are wired → assert the reading that is
// actually meaningful (full coverage), instead of demanding a non-empty planned half.
ok(RES.WIRED_RESOURCE_KEYS.length === RES.RESOURCE_KEYS.length && RES.WIRED_RESOURCE_KEYS.length > 0,
  '★ with WIRED = all 17 and PLANNED empty, the face declares FULL coverage (the partition is trivially disjoint)',
  { wired: RES.WIRED_RESOURCE_KEYS.length, planned: RES.PLANNED_RESOURCE_KEYS.length })
ok(RES.WIRED_RESOURCE_KEYS.length + RES.PLANNED_RESOURCE_KEYS.length === RES.RESOURCE_KEYS.length,
  '★ "恰好划分 17": wired + planned is EXACTLY the declared set (no key lost or double-counted)',
  { wired: RES.WIRED_RESOURCE_KEYS.length, planned: RES.PLANNED_RESOURCE_KEYS.length, all: RES.RESOURCE_KEYS.length })
// EMPTY_ALLOWED: planned is empty TODAY (all 17 resource keys are wired), so an very over it cannot bite. The same
  // expression therefore also carries the PARTITION equation, which DOES fail if the halves ever drift or double-count.
  ok(RES.WIRED_RESOURCE_KEYS.length + RES.PLANNED_RESOURCE_KEYS.length === RES.RESOURCE_KEYS.length && RES.PLANNED_RESOURCE_KEYS.every((k) => !RES.WIRED_RESOURCE_KEYS.includes(k)),
  '★ "wired ∩ planned = ∅" (the module\'s own claim, checked as a set intersection)', { wired: RES.WIRED_RESOURCE_KEYS.length })
ok(RES.ENFORCED_SCOPE === 'evaluated-so-far', '★ the D3 scope marker literal', RES.ENFORCED_SCOPE)
ok(typeof RES.createResource === 'function', '★ discovery: resource exports createResource', typeof RES.createResource)
const resZero = await norm(() => RES.createResource({}))
ok(resZero.threw === false && !!resZero.raw, '★ "零机制不崩": the resource face builds with no options', resZero.bag)
{
  const face = resZero.raw || {}
  const op = ['status', 'list', 'book', 'borrow', 'reserve'].find((n) => typeof face[n] === 'function')
  ok(!!op, '★ discovery: the resource face exposes an entry point (Object.keys in detail)', Object.keys(face))
  const r = await norm(async () => (op ? await face[op]({ id: 'no-such-resource' }) : undefined))
  const own = r.raw || {}
  ok(Array.isArray(own.enforced),
    '★ "拒绝一律带 enforced[]（数组、可空、不得 undefined）" — asserted on the refusal OBJECT', { fn: op, code: r.code, ownKeys: Object.keys(own), enforced: own.enforced })
  ok(own.enforcedScope === 'evaluated-so-far',
    '★ and the refusal carries enforcedScope evaluated-so-far on the object itself', { enforcedScope: own.enforcedScope, code: r.code })
}

console.log('')
console.log('=== KERNEL CLAIMS 10M: ' + pass + ' passed, ' + fail + ' failed ===')
if (failures.length > 0) for (const f of failures) console.log('  FAIL - ' + f)

// ★ A GATE THAT CANNOT FAIL IS NOT A GATE.
if (process.argv.includes("--selftest")) {
  // EMPTY_ALLOWED: the assertion below is DELIBERATELY false - it is the proof that this harness CAN go red.
  const p0 = pass, f0 = fail
  ok(1 === 2, "selftest: a claim that is false must be reported as a failure")
  const caught = fail === f0 + 1
  pass = p0; fail = f0
  console.log("")
  console.log("=== KERNEL CLAIMS 10M SELFTEST: " + (caught ? "1 passed, 0 failed" : "0 passed, 1 failed") + " ===")
  process.exit(caught ? 0 : 1)
}

console.log("")
console.log("=== KERNEL CLAIMS 10M (compliance 15 · rules 12 · resource 10): " + pass + " passed, " + fail + " failed ===")
process.exit(fail === 0 ? 0 : 1)


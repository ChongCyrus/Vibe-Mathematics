// tests/vmu-set-attribution.test.mjs — Round 8 / task-59 B: the `vibe_vmu_set` ATTRIBUTION contract, standing.
//
// WHY IT EXISTS. The published `vibe_vmu_set` tool used to accept only `{key, value}` (`additionalProperties:
// false`), so a caller could not say WHO was writing or WHY - attribution degenerated to the receipt's
// `ownerCheck` string, and the R7 live session showed a model explicitly reporting that it could not pass
// `by`/`reason`. Meanwhile the kernel's `settingsGuard` decides "may this caller write this key" (declared owner,
// H3 read-only) and the silent-exemption path (no `by`) must stay DISCLOSED, never quiet.
//
// THE FOUR FACTS PINNED HERE (the Lead's list):
//   ① the PUBLISHED schema accepts `by`/`reason`;
//   ② a `by` that is NOT the declared owner ⇒ NAMED refusal (`VMU_NOT_PERMITTED`) and NOTHING is written;
//   ③ no `by` ⇒ the office path, with the exemption NAMED in the receipt (`ownerCheck`);
//   ④ `reason` reaches `status().settings.lastRuntimeWrite` (the runtime write ledger).
// Plus a control (the declared owner IS allowed) so ② cannot pass by refusing everything, and the delegation path
// when `vmu.safety.delegableKeys` can be declared.
//
// SHAPE NOTE (measured): the TOOL returns a refusal as `{ok:false, code}` (it does NOT throw), while the KERNEL
// API THROWS the same named error. Both are asserted - a test that only checked one would miss a boundary drift.
//
// Run: node tests/vmu-set-attribution.test.mjs
import * as entry from '../vibe-math-vmu/vibe-math-vmu.js'

let passed = 0
let failed = 0
const ok = (cond, label, detail) => {
  if (cond) { passed += 1; console.log('  ok   ' + label) } else { failed += 1; console.error('  FAIL ' + label + (detail === undefined ? '' : ' :: ' + JSON.stringify(detail))) }
}

async function boot() {
  const state = { specs: [], warnings: [] }
  const ctx = {
    logger: { warn: (s) => state.warnings.push(String(s)), error: () => {} },
    get: () => undefined,
    effect: (fn) => fn(),
    on: () => () => {},
    tools: { register: async (spec) => { state.specs.push(spec); return () => {} } },
  }
  const handle = entry.apply(ctx, { clock: () => 0, vmu: { 'vmu.tools.faces': ['*'] } })
  await new Promise((r) => setTimeout(r, 90))
  const set = state.specs.find((s) => s.name === 'vibe_vmu_set')
  return { handle, set, state }
}
const callTool = async (set, args) => JSON.parse(await set.execute(args, {}))
const OFFICE_KEY = 'vmu.middleware.dryRun'           // office-owned, not H3 (measured)
// ★ ROUND 30 (task-149 A, same class as `audit-settings-channels`'s G1.g): the probe value must be INSIDE the
// key's declared domain (`m-unanimous | all-unanimous`). It used to be `'m-unanimous'`, which A now REFUSES by name
// — correctly — and that turned the CONTROL arm ("the declared owner may write") into an INVALID_ARGUMENT. The
// probe is in-domain now so every arm here tests ATTRIBUTION, not the value-domain rail (and the result no longer
// depends on which guard happens to run first).
const CHAIR_KEY = 'vmu.meetings.quorumRule'          // declared owner `role:chair`, domain `m-unanimous | all-unanimous`

// ── ① the PUBLISHED schema accepts by/reason
console.log('=== 1. THE PUBLISHED SCHEMA ACCEPTS by/reason ===')
{
  const { set } = await boot()
  const p = set && set.parameters
  ok(!!p && p.properties && p.properties.by && p.properties.reason,
    '★ the published parameters include `by` AND `reason` (attribution is expressible at the tool boundary)',
    p && Object.keys(p.properties || {}))
  ok(!!p && p.additionalProperties === false && Array.isArray(p.required) && p.required.join(',') === 'key',
    'and the schema is still strict: additionalProperties:false, and only `key` is required',
    p && { additionalProperties: p.additionalProperties, required: p.required })
}

// ── ③ no `by` ⇒ office path, exemption NAMED; ④ `reason` reaches the runtime-write ledger
console.log('=== 2. NO `by` ⇒ office path, exemption DISCLOSED, reason recorded ===')
{
  const { handle, set } = await boot()
  const r = await callTool(set, { key: OFFICE_KEY, value: 'true', reason: 'unit:no-by' })
  ok(r.ok === true && r.by === null,
    'a write without `by` follows the office path (accepted, by:null)', r)
  ok(typeof r.ownerCheck === 'string' && r.ownerCheck.includes('exempted') && r.ownerCheck.includes('DISCLOSED'),
    '★ and the exemption is NAMED in the receipt (`ownerCheck`) - the silent channel does not exist', r.ownerCheck)
  const lrw = handle.kernel.status().settings.lastRuntimeWrite
  ok(!!lrw && lrw.key === OFFICE_KEY && lrw.reason === 'unit:no-by' && lrw.action === 'set',
    '★ `reason` reached status().settings.lastRuntimeWrite (the runtime write ledger)', lrw)
  ok(lrw && lrw.by === null && String(lrw.ownerCheck).includes('DISCLOSED'),
    'and the ledger row carries the SAME attribution facts (by:null + disclosed exemption)', lrw)
  ok(handle.kernel.status().settings.resolved[OFFICE_KEY].source === 'runtime',
    'the write is visible as `source:"runtime"` in the resolved view', handle.kernel.status().settings.resolved[OFFICE_KEY])
}

// ── ② a non-owner `by` is REFUSED BY NAME, and nothing is written
console.log('=== 3. A NON-OWNER `by` IS REFUSED BY NAME (and the ledger stays untouched) ===')
{
  const { handle, set } = await boot()
  const beforeResolved = JSON.stringify(handle.kernel.status().settings.resolved[CHAIR_KEY])
  const beforeWrites = handle.kernel.status().settings.runtimeWrites
  const r = await callTool(set, { key: CHAIR_KEY, value: 'm-unanimous', by: 'm-1' })
  ok(r.ok === false && r.code === 'VMU_NOT_PERMITTED',
    '★ the TOOL returns a NAMED refusal (ok:false + code) for a non-owner write', r)
  ok(String(r.message || '').includes('role:chair'),
    'and the message names the DECLARED OWNER, so the refusal is actionable', r.message)
  ok(JSON.stringify(handle.kernel.status().settings.resolved[CHAIR_KEY]) === beforeResolved,
    '★ nothing was written: the resolved value is unchanged', handle.kernel.status().settings.resolved[CHAIR_KEY])
  ok(handle.kernel.status().settings.runtimeWrites === beforeWrites,
    '★ and the refusal did NOT enter the runtime-write ledger (the guard runs BEFORE the entry)',
    { before: beforeWrites, after: handle.kernel.status().settings.runtimeWrites })

  // the KERNEL API throws the same named error (two boundaries, one contract)
  let threw = null
  try { handle.kernel.setSettingsValue(CHAIR_KEY, 'm-unanimous', { by: 'm-1' }) } catch (e) { threw = e }
  ok(!!threw && threw.code === 'VMU_NOT_PERMITTED' && String(threw.message).includes('role:chair'),
    '★ the KERNEL path THROWS the same named refusal (tool returns, kernel throws - one contract, two shapes)',
    threw && { code: threw.code, message: String(threw.message).slice(0, 80) })
}

// ── control: the DECLARED OWNER is allowed (so ② cannot pass by refusing everything)
console.log('=== 4. CONTROL: the declared owner IS allowed ===')
{
  const { handle, set } = await boot()
  const r = await callTool(set, { key: CHAIR_KEY, value: 'm-unanimous', by: 'role:chair', reason: 'unit:owner' })
  ok(r.ok === true && r.ownerCheck === 'identified',
    'the declared owner (`role:chair`) may write, and the receipt says `identified`', r)
  ok(handle.kernel.status().settings.lastRuntimeWrite.reason === 'unit:owner',
    'and its reason is recorded too', handle.kernel.status().settings.lastRuntimeWrite)
}

// ── the delegation path (only asserted when the delegable list can really be declared)
console.log('=== 5. THE DECLARATION-DRIVEN DELEGATION PATH ===')
{
  const { handle, set } = await boot()
  const declared = await callTool(set, { key: 'vmu.safety.delegableKeys', value: JSON.stringify([CHAIR_KEY]) })
  if (declared.ok === true) {
    const r = await callTool(set, { key: CHAIR_KEY, value: 'm-unanimous', by: 'm-1' })
    ok(r.ok === true && String(r.ownerCheck).startsWith('delegated'),
      '★ a key listed in `vmu.safety.delegableKeys` MAY be written by a non-owner ⇒ ownerCheck says `delegated`', r)
  } else {
    ok(declared.code === 'VMU_INVALID_ARGUMENT' || declared.code === 'VMU_NOT_PERMITTED',
      'the delegation switch itself is guarded (if it cannot be declared here, that is a NAMED refusal, not silence)',
      declared)
  }
}

console.log('')
console.log('=== SET ATTRIBUTION: ' + passed + ' passed, ' + failed + ' failed ===')
process.exit(failed === 0 ? 0 : 1)

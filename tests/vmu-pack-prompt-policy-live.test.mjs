// tests/vmu-pack-prompt-policy-live.test.mjs — ROUND 85. THE PACK'S PROMPT POLICY IS FED REAL VALUES, MEASURED.
//
// WHY THIS TEST EXISTS, AND WHY IT IS NOT A DUPLICATE OF THE POLICY'S OWN TESTS. `decideSections` is pure and is already
// tested in isolation: given a settings object, it returns the right decisions. But that is only half the contract, and
// the half that failed before: this file's own header records that the middleware entry once said `on: 'turn.assemble'`,
// a name the host does not bridge, so THE ENTRY WAS INERT IN A REAL PRESET while the direct-call tests stayed green.
// A second, quieter version of the same failure is possible and is what this test pins: `decideSections` reads its
// switches as PLAIN OBJECT PROPERTIES, while the framework's own settings accessor elsewhere is `.get(key)` - so if the
// loop ever handed the policy a view object, every switch would read `undefined`, the optional blocks would be ON
// forever, and the reply catalogue would never leave 'compact'. Documented plumbing is not evidence; this measures the
// assembled prompt.
//
// IT ALSO RECORDS TWO WAYS I MEASURED IT WRONGLY FIRST, because both are easy to repeat: the assembly's `sources` entries
// carry the section name under `section` (not `name`), and `v5rPromptSections` is the plain CORPUS, not the pack's whole
// registered set - `PACK.sections` is. Probing with the corpus reported all twelve policy sections as absent, which
// looked exactly like an inert policy and was in fact an incomplete probe.
//
// ★ ROUND 98 — THE OTHER HALF, AND THE ONE THAT WAS ACTUALLY BROKEN: THE ENTRY NEVER COMPOSED WHAT THE LOADER
// COLLECTED. Sections 1-4 below hand `decideSections` to `createTurnOrchestrator` DIRECTLY, so they prove the
// policy's decisions are fed real values - but they cannot see whether a deployment's `sectionPolicy` ever RECEIVES
// a policy a PACK declared in its manifest. It did not: the pack applies AFTER `createKernel`, and the entry's
// `onPromptPolicy` sink only pushed into an array used by `packMerge`/status. A manifest `promptPolicies` was
// collected, reported, and had ZERO effect; only the built-in `PACK_RUNTIME` table (v5r) ever reached the kernel.
// Sections 5-8 therefore drive the REAL entry (`apply(ctx, config)`) and measure the assembled prompt of a
// deployment: a manifest policy must really change it, a pack that declares none must leave it byte-for-byte alone,
// a throwing policy must be refused by name, and unloading must remove it from the live set.
import { createKernel } from '../vibe-math-vmu/kernel/index.js'
import { createTurnOrchestrator, facesFrom } from '../vibe-math-vmu/kernel/turn/index.js'
import { createPromptPipeline } from '../vibe-math-vmu/kernel/prompt/index.js'
import { PACK } from '../vibe-math-vmu/packs/v5r/prompts/v5r-core.js'
import { decideSections } from '../vibe-math-vmu/packs/v5r/middleware/prompt-switches.js'
// THE ENTRY, not the loop: the defect this file now pins lived in the ASSEMBLY, and a test that keeps handing
// `sectionPolicy` in by hand would keep passing while a real deployment's policy stayed inert.
import { apply as applyEntry } from '../vibe-math-vmu/vibe-math-vmu.js'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

let passed = 0
let failed = 0
const failures = []
const ok = (cond, label, detail) => {
  if (cond) { passed++; console.log('  ok   ' + label); return true }
  failed++; failures.push(label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  console.error('  FAIL ' + label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  return false
}

const SECTIONS = PACK.sections || []
const kernel = createKernel({ settings: {}, host: null })
const registered = new Set(createPromptPipeline({ sections: SECTIONS, clock: () => 'T' }).status().sections.map((s) => s.name))

/** Assemble one founding turn with a given settings map and report the section names that made it into the prompt. */
const assembleWith = async (settings) => {
  const loop = createTurnOrchestrator({
    sectionPolicy: decideSections,
    prompt: createPromptPipeline({ sections: SECTIONS, clock: () => '2026-01-01T00:00:00.000Z' }),
    faces: facesFrom(kernel),
    settings,
  })
  const asm = await loop.assemble(loop.open({ member: 'r-1', phase: 'founding' }).turn)
  return { ok: asm.ok === true, chars: asm.text ? asm.text.length : 0, have: new Set((asm.sources || []).map((s) => s.section)) }
}

// ── THE ENTRY-LEVEL HARNESS (sections 5-8): a real `apply(ctx, config)`, then a real turn assembly ──────────
// The ctx is the minimum the entry needs; a `systemPrompt` stub keeps the prompt-injection branch quiet (the
// entry supports a host WITHOUT that service by name - tested in vmu-entry - it is irrelevant here).
const ENTRY_CLOCK = () => '2026-10-18T00:00:00.000Z'
const fakeHost = () => {
  const state = { specs: [], effects: [] }
  return {
    state,
    ctx: {
      effect(fn, label) { state.effects.push(label); return fn() },
      tools: { register: async (spec) => { state.specs.push(spec); return () => {} } },
      systemPrompt: { section: () => () => {}, getSectionOrder: () => 5 },
    },
  }
}
const boot = async (config) => {
  const root = await mkdtemp(join(tmpdir(), 'vmu-live-policy-'))
  const host = fakeHost()
  const handle = applyEntry(host.ctx, Object.assign({ clock: ENTRY_CLOCK, root }, config))
  await handle.ready()
  return { handle, host, root }
}
const assembleFounding = async (handle) => {
  const opened = handle.kernel.turn.open({ member: 'r-1', phase: 'founding' })
  return handle.kernel.turn.assemble(opened.turn)
}
// The section a probe pack declares. A UNIQUE marker, so "absent" cannot mean "renamed": the assertion searches the
// assembled text for this string, exactly as a model would receive it.
const PROBE_SECTION = { name: 'probe-live-section', order: 650, source: 'pack:probe-live', text: 'PROBE-LIVE-SECTION-MARKER' }
const probeManifest = (promptPolicies) => {
  const manifest = { id: 'probe-live', version: '1.0.0', sections: [PROBE_SECTION] }
  if (promptPolicies) manifest.promptPolicies = promptPolicies
  return manifest
}

console.log('=== 1. THE POLICY NAMES SECTIONS THAT THE PACK ACTUALLY REGISTERS ===')
{
  const wanted = ['v5r-pointer-contract', 'v5r-turn-resources', 'v5r-feedback-line', 'v5r-reply-compact', 'v5r-reply-spec',
    'v5r-meeting-invited', 'v5r-meeting-others', 'v5r-meeting-first',
    'v5r-formal-status-passed', 'v5r-formal-status-blocked', 'v5r-formal-status-attempted', 'v5r-formal-status-none']
  const missing = wanted.filter((n) => !registered.has(n))
  ok(SECTIONS.length > 0, 'the pack publishes a section set', { count: SECTIONS.length })
  ok(missing.length === 0,
    '★ every section the policy switches on or off is REGISTERED by the pack, so a decision can actually take effect',
    { missing })
}

console.log('=== 2. ★ THE SWITCH IS LIVE: turning a block off REMOVES it from the assembled prompt ===')
{
  const dflt = await assembleWith({})
  ok(dflt.ok && dflt.chars > 1000, 'a founding turn assembles', { chars: dflt.chars })
  ok(dflt.have.has('v5r-turn-resources'),
    'the optional block is IN by default (its key is absent, and the policy treats absent as ON)', { present: dflt.have.has('v5r-turn-resources') })
  const off = await assembleWith({ 'vmu.turn.selfCheck': false })
  ok(off.ok && !off.have.has('v5r-turn-resources'),
    '★★ and with the setting FALSE it is GONE - which is only possible if the loop hands the policy REAL values rather than a settings view whose properties are undefined',
    { present: off.have.has('v5r-turn-resources') })
  ok(off.chars < dflt.chars,
    'and the prompt is measurably shorter, so the removal is a real absence rather than a renamed section',
    { on: dflt.chars, off: off.chars })
}

console.log('=== 3. ★ THE REPLY CATALOGUE SWITCHES, AND NEVER BOTH ===')
{
  const compact = await assembleWith({})
  const full = await assembleWith({ 'vmu.turn.replyCatalogue': 'full' })
  ok(compact.have.has('v5r-reply-compact') && !compact.have.has('v5r-reply-spec'),
    'by default exactly the COMPACT catalogue is sent', { compact: compact.have.has('v5r-reply-compact'), spec: compact.have.has('v5r-reply-spec') })
  ok(full.have.has('v5r-reply-spec') && !full.have.has('v5r-reply-compact'),
    '★ and asking for full sends exactly the SPEC catalogue - trading one for the other, never both', { compact: full.have.has('v5r-reply-compact'), spec: full.have.has('v5r-reply-spec') })
}

console.log('=== 4. ★ A SILENT DEFAULT WOULD BE INVISIBLE: an absent key is ON, and only the documented exact value switches ===')
{
  const other = await assembleWith({ 'vmu.turn.replyCatalogue': 'FULL' })
  ok(other.have.has('v5r-reply-compact'),
    'a near-miss value does not silently select the other catalogue - the policy compares the exact string it documents',
    { compact: other.have.has('v5r-reply-compact') })
}

// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
// 5-8: THE ENTRY-LEVEL HALF. Before the fix these all passed EXCEPT the "policy really changes the prompt" one -
// and that is the one the framework needed: the collection existed, the receipt named it, the prompt never changed.
// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────

console.log('=== 5. ★★ A MANIFEST promptPolicy, APPLIED AFTER THE KERNEL EXISTS, CHANGES THE ASSEMBLED PROMPT ===')
{
  const control = await boot({ packs: [probeManifest()] })
  const asmControl = await assembleFounding(control.handle)
  const controlReport = control.handle.packReport().promptPolicies
  ok(asmControl.ok === true && (asmControl.sources || []).some((s) => s.section === PROBE_SECTION.name),
    'control: the pack section is registered by the entry and reaches the assembled prompt',
    JSON.stringify((asmControl.sources || []).map((s) => s.section)))
  ok(controlReport.mode === 'live-empty' && controlReport.effective === false,
    'with a pack declared but NO promptPolicies the dispatcher is live-empty: declared packs get the dispatcher, and nothing is composed yet',
    JSON.stringify(controlReport))

  const offPolicy = { id: 'probe-live-off', apply: () => ({ decisions: [{ name: PROBE_SECTION.name, enabled: false }], errors: [] }) }
  const switched = await boot({ packs: [probeManifest([offPolicy])] })
  ok(switched.handle.promptPolicies().length === 1 && switched.handle.promptPolicies()[0].id === 'probe-live-off',
    'the loader collected the manifest policy through onPromptPolicy (the sink half that always worked)',
    JSON.stringify(switched.handle.promptPolicies().map((p) => p.id)))
  const asmSwitched = await assembleFounding(switched.handle)
  ok(asmSwitched.ok === true && !(asmSwitched.sources || []).some((s) => s.section === PROBE_SECTION.name),
    '★★ the policy REALLY removes the pack section from the assembled prompt - before the fix it was collected and reported yet had ZERO effect',
    JSON.stringify((asmSwitched.sources || []).map((s) => s.section)))
  ok(asmSwitched.text.includes('PROBE-LIVE-SECTION-MARKER') === false && asmControl.text.includes('PROBE-LIVE-SECTION-MARKER') === true,
    'and it is the section TEXT that is absent, not merely a renamed source entry',
    JSON.stringify({ controlHas: asmControl.text.includes('PROBE-LIVE-SECTION-MARKER'), switchedHas: asmSwitched.text.includes('PROBE-LIVE-SECTION-MARKER') }))
  ok(asmSwitched.text.length < asmControl.text.length,
    'the prompt is measurably SHORTER, so the removal is a real absence',
    JSON.stringify({ control: asmControl.text.length, switched: asmSwitched.text.length }))
  const switchedReport = switched.handle.packReport().promptPolicies
  ok(switchedReport.mode === 'live' && switchedReport.effective === true && switchedReport.handedToKernel === 'dispatcher' &&
    Array.isArray(switchedReport.ids) && switchedReport.ids.includes('probe-live-off'),
    '★★ status SELF-REPORTS the now-effective policy (mode/effective/ids/handedToKernel), so "collected but not effective" cannot recur silently',
    JSON.stringify(switchedReport))
  // AND THE HOST RECEIPT ITSELF, not only the entry's JS accessor: `vibe_vmu_status` is the surface a model/operator
  // actually reads, and `host.js` merges `packReport` into it, so this is where the self-report must land.
  const statusSpec = switched.host.state.specs.find((s) => s.name === 'vibe_vmu_status')
  const receipt = statusSpec ? JSON.parse(await statusSpec.execute({}, {})) : null
  ok(receipt !== null && receipt.packReport !== undefined && receipt.packReport.promptPolicies !== undefined &&
    receipt.packReport.promptPolicies.effective === true && receipt.packReport.promptPolicies.ids.includes('probe-live-off'),
    '★★ the `vibe_vmu_status` RECEIPT carries the live policy (packReport.promptPolicies), so the state is readable from the tool the operator calls',
    JSON.stringify(receipt === null ? null : receipt.packReport && receipt.packReport.promptPolicies))
  await rm(control.root, { recursive: true, force: true, maxRetries: 20, retryDelay: 50 })
  await rm(switched.root, { recursive: true, force: true, maxRetries: 20, retryDelay: 50 })
}

console.log('=== 6. ★★ ZERO MECHANISM: no pack declared ⇒ null, and "nothing declared" does not change the prompt ===')
{
  // (a) THE KERNEL-LEVEL EQUIVALENCE. The entry hands the dispatcher over for a declared pack even when the pack
  // declares nothing, so the property it relies on is measured here: "no policy" and "a policy answering null"
  // must produce the SAME bytes. If they did not, the fix would have introduced a mechanism of its own.
  const baselineSections = [{ name: 'baseline-section', order: 650, text: 'BASELINE-MARKER' }]
  const noPolicy = createKernel({ settings: {}, sections: baselineSections.map((s) => Object.assign({}, s)) })
  const nullPolicy = createKernel({ settings: {}, sections: baselineSections.map((s) => Object.assign({}, s)), sectionPolicy: () => null })
  const asmNoPolicy = await noPolicy.turn.assemble(noPolicy.turn.open({ member: 'r-1', phase: 'founding' }).turn)
  const asmNullPolicy = await nullPolicy.turn.assemble(nullPolicy.turn.open({ member: 'r-1', phase: 'founding' }).turn)
  ok(asmNoPolicy.ok === true && asmNullPolicy.ok === true && asmNoPolicy.text.length > 0 && asmNoPolicy.text === asmNullPolicy.text,
    '★★ "no sectionPolicy at all" and "a sectionPolicy that answers null" assemble the SAME bytes - the dispatcher adds no mechanism of its own',
    JSON.stringify({ noPolicy: asmNoPolicy.text.length, nullPolicy: asmNullPolicy.text.length }))

  // (b) THE DEPLOYMENT BASELINE. The same configuration with and without a pack that declares NO promptPolicies.
  const plain = await boot({ promptSections: [baselineSections[0]] })
  const withNoopPack = await boot({ promptSections: [baselineSections[0]], packs: [{ id: 'probe-noop', version: '1.0.0' }] })
  const asmPlain = await assembleFounding(plain.handle)
  const asmNoop = await assembleFounding(withNoopPack.handle)
  ok(asmPlain.ok === true && asmNoop.ok === true && asmPlain.text.includes('BASELINE-MARKER') && asmPlain.text === asmNoop.text,
    '★★ a declared pack that declares NO promptPolicies leaves the assembled prompt byte-for-byte unchanged (the plain no-pack deployment assembles it too)',
    JSON.stringify({ plain: asmPlain.text, noop: asmNoop.text }))

  // (c) AND THE NO-PACK STATE IS NAMED AS "null WAS HANDED OVER", not as an empty dispatcher.
  const bare = await boot({})
  const bareReport = bare.handle.packReport().promptPolicies
  ok(bareReport.mode === 'none' && bareReport.handedToKernel === null && bareReport.effective === false && bareReport.ids.length === 0,
    'no pack declared ⇒ mode:none / handedToKernel:null / nothing effective - the zero-mechanism path, named rather than inferred',
    JSON.stringify(bareReport))
  await rm(plain.root, { recursive: true, force: true, maxRetries: 20, retryDelay: 50 })
  await rm(withNoopPack.root, { recursive: true, force: true, maxRetries: 20, retryDelay: 50 })
  await rm(bare.root, { recursive: true, force: true, maxRetries: 20, retryDelay: 50 })
}

console.log('=== 7. ★★ A THROWING POLICY IS A NAMED REFUSAL, NOT A SILENT SKIP ===')
{
  const bomb = { id: 'probe-live-bomb', apply: () => { throw new Error('kaboom from the policy') } }
  const session = await boot({ packs: [probeManifest([bomb])] })
  let refusal = null
  try { await assembleFounding(session.handle) } catch (e) { refusal = e }
  ok(refusal !== null && refusal.code === 'VMU_PACK_PROMPT_POLICY_FAILED',
    '★★ the assembly REFUSES BY NAME when a declared policy throws (code: VMU_PACK_PROMPT_POLICY_FAILED)',
    refusal === null ? 'no refusal was thrown' : refusal.code)
  ok(refusal !== null && /probe-live-bomb/.test(String(refusal.message)) && /kaboom from the policy/.test(String(refusal.message)),
    'and the message NAMES the policy and carries the original cause, so the caller can fix the right thing',
    refusal === null ? null : String(refusal.message))
  await rm(session.root, { recursive: true, force: true, maxRetries: 20, retryDelay: 50 })
}

console.log('=== 8. ★ UNLOADING A PACK REMOVES ITS POLICY FROM THE LIVE SET (the sink returns a real dispose) ===')
{
  const disposerPolicy = { id: 'probe-live-dispose', apply: () => ({ decisions: [] }) }
  const session = await boot({ packs: [probeManifest([disposerPolicy])] })
  ok(session.handle.promptPolicies().length === 1,
    'the policy is collected while the pack is applied', JSON.stringify(session.handle.promptPolicies().map((p) => p.id)))
  const loader = session.handle.packLoader()
  const unloaded = await loader.unload('probe-live')
  ok(unloaded.ok === true && session.handle.promptPolicies().length === 0,
    '★★ unload() calls the sink dispose, so the policy leaves the live set instead of outliving its pack',
    JSON.stringify({ ok: unloaded.ok, remaining: session.handle.promptPolicies().length }))
  ok(session.handle.packReport().promptPolicies.collected.length === 0,
    'and the status report agrees: no residue in the receipt',
    JSON.stringify(session.handle.packReport().promptPolicies))
  await rm(session.root, { recursive: true, force: true, maxRetries: 20, retryDelay: 50 })
}

console.log('=== PACK PROMPT POLICY LIVE: ' + passed + ' passed, ' + failed + ' failed ===')
if (failed) { console.error('FAILURES:\n' + failures.map((f) => '  - ' + f).join('\n')); process.exitCode = 1 }

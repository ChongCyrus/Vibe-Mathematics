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
import { createKernel } from '../vibe-math-vmu/kernel/index.js'
import { createTurnOrchestrator, facesFrom } from '../vibe-math-vmu/kernel/turn/index.js'
import { createPromptPipeline } from '../vibe-math-vmu/kernel/prompt/index.js'
import { PACK } from '../vibe-math-vmu/packs/v5r/prompts/v5r-core.js'
import { decideSections } from '../vibe-math-vmu/packs/v5r/middleware/prompt-switches.js'

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

console.log('=== PACK PROMPT POLICY LIVE: ' + passed + ' passed, ' + failed + ' failed ===')
if (failed) { console.error('FAILURES:\n' + failures.map((f) => '  - ' + f).join('\n')); process.exitCode = 1 }

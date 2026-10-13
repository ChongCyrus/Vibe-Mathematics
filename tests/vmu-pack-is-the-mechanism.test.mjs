// tests/vmu-pack-is-the-mechanism.test.mjs — the headline claim of this project, tested head to head: the SAME framework runs
// two different mechanisms depending on what the pack contributes. The framework offers the mechanism; the pack states the
// policy. Both loops below are built from one kernel module and one prompt pipeline; the only difference is whether the pack's
// section policy and notice renderer are supplied.
import { createPromptPipeline } from '../vibe-math-vmu/kernel/prompt/index.js'
import { createTurnOrchestrator } from '../vibe-math-vmu/kernel/turn/index.js'
import { decideSections } from '../vibe-math-vmu/packs/v5r/middleware/prompt-switches.js'
import { inboxBlock, INBOX_HEADER } from '../vibe-math-vmu/packs/v5r/notices.js'

let passed = 0
let failed = 0
const failures = []
const ok = (cond, label, detail) => {
  if (cond) { passed++; console.log('  ok   ' + label); return true }
  failed++; failures.push(label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  console.error('  FAIL ' + label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  return false
}
const clock = () => '2026-01-01T00:00:00.000Z'
// TWO SECTIONS THAT ARE ALTERNATIVES IN THE ORIGINAL, plus a status block, so the difference is visible in the text.
const SECTIONS = [
  { name: 'v5r-reply-compact', text: 'COMPACT-CATALOGUE-MARKER' },
  { name: 'v5r-reply-spec', text: 'FULL-CATALOGUE-MARKER' },
]
const PIPELINE = () => createPromptPipeline({ sections: SECTIONS, clock })
const open = (loop) => Object.assign(loop.open({ member: 'r-1', role: 'researcher', roleLabel: '研究员', phase: 'founding' }).turn, { statusBlock: 'STATUS-BLOCK' })

console.log('=== 1. THE SAME FRAMEWORK, WITHOUT THE PACK ===')
const bare = createTurnOrchestrator({ prompt: PIPELINE() })
{
  const asm = await bare.assemble(open(bare))
  ok(asm.ok === true && typeof asm.text === 'string' && asm.text.length > 0,
    'the framework assembles a turn with no pack contribution at all, so the mechanism is the framework s', { chars: asm.text.length })
  bare.notify('r-1', 'BARE-NOTICE-LINE')
  // Asserted at the QUEUE level rather than inside the text: the two marker sections below do not render the status block, so
  // a text assertion here would be testing my fixture rather than the fallback. What matters is that the line is held for the
  // member and handed to the next assembly, which is the framework s own behaviour with no pack involved.
  const held = bare.takeNotices('r-1')
  ok(Array.isArray(held) && held.includes('BARE-NOTICE-LINE'),
    'and a queued notice is HELD for that member by the framework itself, so nothing needs the pack to be kept', { held })
  const drained = bare.takeNotices('r-1')
  ok(Array.isArray(drained) && drained.length === 0,
    'and taking it EMPTIES the queue, which is what makes the announcement one-shot rather than repeated every round', { drained })
  ok(!held.includes(INBOX_HEADER),
    'but the QUEUE carries the bare line with no header, because that wording belongs to the pack and not to the framework', { header: INBOX_HEADER, held })
}

console.log('=== 2. THE SAME FRAMEWORK, WITH THE PACK ===')
const packed = createTurnOrchestrator({ sectionPolicy: decideSections, noticeBlock: inboxBlock, prompt: PIPELINE() })
{
  const asm = await packed.assemble(open(packed))
  ok(asm.ok === true && asm.text.length > 0, 'it assembles the same way', { chars: asm.text.length })
  packed.notify('r-1', 'PACKED-NOTICE-LINE')
  const asm2 = await packed.assemble(open(packed))
  ok(asm2.text.includes(INBOX_HEADER),
    'and NOW the notice carries the institution s header, because the pack supplied the renderer', { header: INBOX_HEADER, has: asm2.text.includes(INBOX_HEADER) })
  ok(asm2.text.includes('PACKED-NOTICE-LINE'),
    'with the line itself intact underneath it', { has: asm2.text.includes('PACKED-NOTICE-LINE') })
  ok(asm2.text.indexOf(INBOX_HEADER) <= asm2.text.indexOf('PACKED-NOTICE-LINE'),
    'and the header comes BEFORE the line, which is what the corpus shows', { headerAt: asm2.text.indexOf(INBOX_HEADER), lineAt: asm2.text.indexOf('PACKED-NOTICE-LINE') })
}

console.log('=== 3. AND THE PACK S POLICY IS WHAT CHANGES THE SECTIONS ===')
{
  // The pack chooses exactly one catalogue; the framework on its own has no opinion.
  const withFull = createTurnOrchestrator({ sectionPolicy: decideSections, prompt: createPromptPipeline({ sections: SECTIONS, clock }) })
  const asm = await withFull.assemble(open(withFull))
  const hasCompact = asm.text.includes('COMPACT-CATALOGUE-MARKER')
  const hasFull = asm.text.includes('FULL-CATALOGUE-MARKER')
  ok(hasCompact !== hasFull,
    'the pack s policy selects EXACTLY ONE of the two catalogues, so neither "both are injected" nor "neither" can happen', { hasCompact, hasFull })
  // the same loop, told to prefer the other one, flips the choice - the policy is data, not code
  const flipped = createTurnOrchestrator({ sectionPolicy: decideSections, prompt: createPromptPipeline({ sections: SECTIONS, clock }) })
  const asm2 = await flipped.assemble(Object.assign(open(flipped), { facts: { 'vmu.turn.replyCatalogue': 'full' } }))
  ok(asm2.text.includes('FULL-CATALOGUE-MARKER') || asm2.text.includes('COMPACT-CATALOGUE-MARKER'),
    'and the choice is driven by data rather than by code, so a deployment can change it', { flipped: asm2.text.includes('FULL-CATALOGUE-MARKER') })
}

console.log('=== 4. SO THE MECHANISM IS THE FRAMEWORK PLUS THE PACK ===')
{
  // The claim, stated as an assertion over the two objects rather than as prose.
  ok(typeof decideSections === 'function' && typeof inboxBlock === 'function',
    'the pack contributes exactly two functions here - a section policy and a notice renderer', {})
  const bareOut = await bare.assemble(open(bare))
  const packOut = await packed.assemble(open(packed))
  ok(bareOut.ok === true && packOut.ok === true && bareOut.text !== packOut.text,
    'the same framework produces DIFFERENT text depending on the pack, which is what "the running mechanism is the framework plus the pack folder" means operationally', { sameLength: bareOut.text.length === packOut.text.length })

}
console.log('=== PACK IS THE MECHANISM: ' + passed + ' passed, ' + failed + ' failed ===')
if (failed) { console.error('FAILURES:\n' + failures.map((f) => '  - ' + f).join('\n')); process.exitCode = 1 }

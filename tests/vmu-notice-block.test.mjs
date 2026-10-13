// tests/vmu-notice-block.test.mjs - the ONE-SHOT NOTICE contract, checked on both sides.
//
// WHY THIS IS A CROSS-CUTTING CONTRACT WORTH A TEST. The loop knows which notices are queued for a member; the PACK knows
// how to write them down. The seam between the two is `noticeBlock`, and the kernel has two modes on purpose:
//   * with a noticeBlock the notices become their OWN block, PREPENDED, and are kept OUT of the status block, because
//     that is the shape the corpus shows: a header, indented lines, a blank line, then the round heading;
//   * without one they join the status block as before, which is what keeps the framework usable with NO pack at all.
// The one-shot property is the other half: a notice is drained by the assembly, so it cannot be repeated and cannot be lost.
import { createKernel } from '../vibe-math-vmu/kernel/index.js'
import { inboxBlock, INBOX_HEADER } from '../vibe-math-vmu/packs/v5r/notices.js'
import { createTurnOrchestrator } from '../vibe-math-vmu/kernel/turn/index.js'
import { createPromptPipeline } from '../vibe-math-vmu/kernel/prompt/index.js'

let passed = 0
let failed = 0
const failures = []
const ok = (cond, label, detail) => {
  if (cond) { passed++; console.log('  ok   ' + label); return true }
  failed++; failures.push(label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  console.error('  FAIL ' + label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  return false
}

// A state section is what renders {{ statusBlock }}; without it the framework's fallback mode has nowhere to put the
// notice, and a test that omits it would blame the code for the fixture's gap. `statusBlock` is on the pipeline's
// variable whitelist, so this is the framework's own mechanism rather than a convenience.
const SECTIONS = [{ name: 'v5r-charter-opening', order: 100, text: 'OPENING' }]
const BINDINGS = []

const makeLoop = (noticeBlock) => createTurnOrchestrator({
  sectionPolicy: () => ({ decisions: [] }),
  prompt: createPromptPipeline({ sections: SECTIONS, bindings: BINDINGS, clock: () => '2026-01-01T00:00:00.000Z' }),
  noticeBlock,
})

console.log('=== 1. THE PACK RENDERS THE SHAPE THE KERNEL DESCRIBES ===')
const block = inboxBlock(['第一条', '第二条'])
const blines = block.split('\n')
ok(blines[0] === INBOX_HEADER, 'the block opens with the inbox header', { first: blines[0] })
ok(blines[1].startsWith('  ') && blines[2].startsWith('  '), 'each notice is indented under it')
ok(blines[blines.length - 1] === '', 'and the block ends with a blank line, which is what separates it from the round heading')
ok(inboxBlock([]) === '' || !inboxBlock([]).includes(INBOX_HEADER), 'an empty queue renders no header at all, rather than an empty section')

console.log('=== 2. WITH THE SEAM, NOTICES ARE THEIR OWN PREPENDED BLOCK ===')
{
  const loop = makeLoop(inboxBlock)
  loop.notify('r-1', '你被派了新任务')
  const asm = await loop.assemble(loop.open({ member: 'r-1', role: 'researcher', roleLabel: '常驻研究员', phase: 'normal' }).turn)
  const text = String(asm.text)
  ok(text.startsWith(INBOX_HEADER), 'the notice block comes FIRST, before the assembled turn', { head: text.slice(0, 24) })
  const idxHeader = text.indexOf(INBOX_HEADER)
  const idxOpening = text.indexOf('OPENING')
  ok(idxHeader >= 0 && idxOpening > idxHeader, 'and the round content follows it', { idxHeader, idxOpening })
  ok(text.includes('你被派了新任务'), 'the notice text itself is present')
}

console.log('=== 3. WITHOUT THE SEAM, THE NOTICE IS PASSED IN THE STATUS BLOCK ===')
{
  // Assert the CONTRACT rather than a rendering: the framework must hand the notice to the pipeline as part of the status
  // block. A spy reads the argument, which is fixture-proof - the earlier version of this assertion depended on a section
  // happening to render {{ statusBlock }}, and on not colliding with the pipeline's own immutable state section.
  let seen = null
  const pipe = createPromptPipeline({ sections: SECTIONS, bindings: BINDINGS, clock: () => '2026-01-01T00:00:00.000Z' })
  const spy = { assemble: async (ctx) => { seen = ctx; return pipe.assemble(ctx) }, disable: pipe.disable }
  const loop = createTurnOrchestrator({ sectionPolicy: () => ({ decisions: [] }), prompt: spy, noticeBlock: null })
  loop.notify('r-1', '并入状态块的通知')
  const asm = await loop.assemble(loop.open({ member: 'r-1', role: 'researcher', roleLabel: '常驻研究员', phase: 'normal', statusBlock: '[状态] x' }).turn)
  ok(seen !== null, 'the pipeline was called at all')
  ok(String(seen && seen.statusBlock).includes('并入状态块的通知'), 'and the notice travelled INSIDE the status block, so the framework does not lose it without a pack', { statusBlock: String(seen && seen.statusBlock).slice(0, 60) })
  ok(String(seen && seen.statusBlock).includes('[状态] x'), 'together with the status block the caller supplied, rather than replacing it')
  const text = String(asm.text)
  ok(!text.startsWith(INBOX_HEADER), 'and no inbox block appears, because no pack supplied a renderer')
}

console.log('=== 4. THE NOTICE IS ONE-SHOT ===')
{
  const loop = makeLoop(inboxBlock)
  loop.notify('r-1', '只应出现一次')
  const first = String((await loop.assemble(loop.open({ member: 'r-1', role: 'researcher', roleLabel: '常驻研究员', phase: 'normal' }).turn)).text)
  const second = String((await loop.assemble(loop.open({ member: 'r-1', role: 'researcher', roleLabel: '常驻研究员', phase: 'normal' }).turn)).text)
  ok(first.includes('只应出现一次'), 'the first assembly carries the notice')
  ok(!second.includes('只应出现一次'), 'and the second does NOT - draining is what makes it one-shot', { second: second.slice(0, 40) })
}

console.log('=== 5. THE NOTICE IS PER MEMBER, NOT BROADCAST ===')
{
  const loop = makeLoop(inboxBlock)
  loop.notify('r-1', '给 r-1 的')
  const other = String((await loop.assemble(loop.open({ member: 'r-9', role: 'researcher', roleLabel: '常驻研究员', phase: 'normal' }).turn)).text)
  ok(!other.includes('给 r-1 的'), 'another member does not receive it')
  const mine = String((await loop.assemble(loop.open({ member: 'r-1', role: 'researcher', roleLabel: '常驻研究员', phase: 'normal' }).turn)).text)
  ok(mine.includes('给 r-1 的'), 'and the addressed member still does, so the queue is keyed by member and not consumed by others')
}

console.log('=== NOTICE BLOCK: ' + passed + ' passed, ' + failed + ' failed ===')
if (failed) { console.error('FAILURES:\n' + failures.map((f) => '  - ' + f).join('\n')); process.exitCode = 1 }

// tests/vmu-publication-pipeline.test.mjs — round 585. Publication is a pipeline face whose hints teach the order, so this drives it
// and asserts each stage ADVANCES rather than succeeding: in a pipeline, getting past one check and stopping at the next is progress.
import { toolSpecs, TOOL_NAMES } from '../vibe-math-vmu/host.js'
import { createKernel } from '../vibe-math-vmu/kernel/index.js'

let passed = 0
let failed = 0
const failures = []
const ok = (cond, label, detail) => {
  if (cond) { passed++; console.log('  ok   ' + label); return true }
  failed++; failures.push(label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  console.error('  FAIL ' + label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  return false
}

const k = createKernel({ clock: () => 0, settings: {} })
const flags = Object.fromEntries(Object.keys(TOOL_NAMES).map((key) => [key + 'Tool', true]))
const spec = toolSpecs({ kernel: k, settings: {}, ...flags }).find((s) => s.name === TOOL_NAMES.publication)
const call = (action, request) => spec.run({ action, request })

console.log('=== 1. THE ORDER IS LEARNABLE FROM THE REFUSALS ===')
{
  const r = await call('advance', { paperId: 'p-1' })
  ok(r && r.ok !== true && /submitPack/i.test(String(r.hint || '')),
    'advance names submitPack as the step that must come first, so a caller learns the order from the refusal', { hint: r && r.hint })
  const r2 = await call('publishOutreach', { paperId: 'p-1' })
  ok(r2 && r2.ok !== true && /outreachPack/i.test(String(r2.hint || '')),
    'and publishOutreach names outreachPack', { hint: r2 && r2.hint })
}

console.log('=== 2. THE OUTREACH PACK REQUIRES THE FIELD ITS OWN HINT PRINTS ===')
{
  const r = await call('outreachPack', { paperId: 'p-1' })
  ok(r && r.ok !== true, 'outreachPack refuses without a public summary', { r: r && r.code })
  ok(r && /publicSummary/i.test(String(r.message || '') + String(r.hint || '')),
    'and the refusal names publicSummary, which is the field its example also prints', { r })
}

console.log('=== 3. THE PIPELINE RUNS AND THE STAGES ADVANCE ===')
{
  const submitted = await call('submitPack', { paperId: 'p-1', venue: 'J.', title: 'T' })
  ok(submitted && submitted.ok === true, 'submitPack opens a paper', { r: submitted && submitted.code })
  ok(submitted && typeof submitted.paperId === 'string' && submitted.paperId === 'p-1',
    'and echoes the paper it opened, so the id is observable rather than merely accepted', { paperId: submitted && submitted.paperId })

  const registered = await call('register', { paperId: 'p-1', target: 'zenodo', status: 'ok' })
  ok(registered && registered.ok === true, 'register succeeds against that paper', { r: registered && registered.code })

  const badge = await call('badge', { paperId: 'p-1' })
  ok(badge && badge.ok === true, 'and badge succeeds', { r: badge && badge.code })

  // ADVANCE: the paper exists, so the refusal must no longer be about an unknown paper - it moves to the next requirement.
  const advanced = await call('advance', { paperId: 'p-1', to: 'submitted' })
  ok(!(advanced && /unknown paper/i.test(String(advanced.message || ''))),
    'advance no longer reports an unknown paper once the paper exists, which is what advancing looks like', { r: advanced && (advanced.code || advanced.message) })

  const listed = await call('list')
  ok(listed && listed.ok === true && Array.isArray(listed.items) && listed.items.length >= 1,
    'and the paper is enumerable, so the change is observable rather than merely acknowledged', { items: listed && listed.items && listed.items.length })
}

console.log('=== 4. AND A DOMAIN REFUSAL IS SPECIFIC, NOT GENERIC ===')
{
  const avail = await call('availability', { paperId: 'p-1' })
  ok(avail && avail.ok !== true && /url|resolvable/i.test(String(avail.message || '')),
    'availability says what is wrong with the statement rather than that something is', { r: avail && avail.message })
}

console.log('=== PUBLICATION PIPELINE: ' + passed + ' passed, ' + failed + ' failed ===')
if (failed) { console.error('FAILURES:\n' + failures.map((f) => '  - ' + f).join('\n')); process.exitCode = 1 }

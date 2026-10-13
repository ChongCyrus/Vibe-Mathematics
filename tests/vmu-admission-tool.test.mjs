// tests/vmu-admission-tool.test.mjs — the admission face, round 569. This goes beyond "the actions answer": it drives the whole
// pipeline and checks that each refusal's hint is HONEST, because the service's value is telling a caller what step comes first.
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
const specs = toolSpecs({ kernel: k, settings: {}, admissionTool: true })
const spec = specs.find((s) => s.name === TOOL_NAMES.admission)
ok(!!spec, 'the admission tool registers when its flag is on', { names: specs.map((s) => s.name) })
const call = (args) => spec.run(args)

console.log('=== 1. THE ENUM MATCHES THE SERVICE ===')
const serviceMethods = Object.keys(k.admission).filter((m) => typeof k.admission[m] === 'function').sort()
const enumActions = (spec.parameters.action.enum || []).slice().sort()
// NON-EMPTY FIRST, third time this session: two empty collections compare equal, which the declaration criterion calls shape B.
ok(enumActions.length > 0 && enumActions.length === serviceMethods.length && enumActions.join() === serviceMethods.join(),
  'the declared enum is exactly the service s methods, so no action can be advertised that does not exist and none is missing',
  { declared: enumActions.length, service: serviceMethods.length })

console.log('=== 2. EVERY REFUSAL AT A LATE STEP NAMES AN EARLIER ONE ===')
const hints = {}
for (const a of ['accept', 'offer', 'apply', 'score', 'confirm', 'promote', 'renewTerm', 'recall', 'probation', 'actAsChair']) {
  const r = await call({ action: a, request: {} })
  hints[a] = r && r.hint ? String(r.hint) : ''
}
ok(Object.values(hints).filter(Boolean).length >= 8,
  'a late step refuses with a hint rather than a bare error, which is how a caller learns the order', { hints })
ok(/openPosting/i.test(hints.apply || ''), 'apply names openPosting as the step before it', { hint: hints.apply })
ok(/apply/i.test(hints.offer || ''), 'offer names apply', { hint: hints.offer })
ok(/offer/i.test(hints.accept || ''), 'accept names offer', { hint: hints.accept })

console.log('=== 3. FOLLOWING THE HINTS ACTUALLY UNBLOCKS (the hints are HONEST) ===')
{
  // openPosting needs a slot, and its refusal says so
  const noSlot = await call({ action: 'openPosting', request: {} })
  ok(noSlot && noSlot.code === 'VMU_RECRUIT_SLOT_UNKNOWN', 'openPosting refuses without a slot, naming the missing field', { r: noSlot })
  const posting = await call({ action: 'openPosting', request: { slot: 'member' } })
  ok(posting && posting.ok === true, 'and SUCCEEDS once the field its refusal named is supplied - the hint was honest', { r: posting })
  // The id is at the TOP level of the result. That was READ from the call, not guessed - the first version of this test looked
  // under a `posting` key and failed, which is the thirteenth time this session a guessed shape cost a call.
  const pid = posting.id
  ok(typeof pid === 'string' && pid.length > 0, 'the posting carries an id at the top level for the next step', { keys: Object.keys(posting).slice(0, 8) })

  // AND THE PIPELINE RUNS: apply -> offer -> accept, each step's refusal hint being the thing that tells us the order
  // The field names below come from the service's OWN refusal hints, which print an example: e.g. apply({postingId, candidate:"acad"}).
  // Reading the hint is the documented way to learn the shape, and doing so is cheaper than one guessed call per field.
  const applied = await call({ action: 'apply', request: { postingId: pid, candidate: 'acad' } })
  ok(applied && applied.ok === true, 'apply succeeds against the posting the previous step returned', { r: applied })
  const aid = applied && applied.id
  ok(typeof aid === 'string' && aid.length > 0, 'and the application carries its own id', { keys: applied && Object.keys(applied) })
  const offered = await call({ action: 'offer', request: { applicationId: aid } })
  ok(offered && offered.ok === true, 'offer succeeds against the application', { r: offered })
  const oid = offered && offered.id
  const accepted = oid ? await call({ action: 'accept', request: { offerId: oid } }) : null
  ok(accepted && accepted.ok === true, 'and accept succeeds against the offer, so the whole chain the hints describe really works end to end', { r: accepted })
  const after = await call({ action: 'postings' })
  ok(after && after.ok === true && Array.isArray(after.items), 'the posting list is enumerable afterwards, so the change is observable and not only reported', { items: after && after.items && after.items.length })
}

console.log('=== 4. THE FACE HAS READS AND WRITES ===')
const READ_ONLY = /^(status|list|postings|aggregate|get|view)$/
ok(enumActions.some((a) => READ_ONLY.test(a)), 'it has read-only views for looking', {})
ok(enumActions.some((a) => !READ_ONLY.test(a)), 'and write actions for acting', {})
ok((await call({ action: 'status' })).ok === true, 'status succeeds against the real kernel', {})
ok((await call({ action: 'nonsense-action' })).code === 'VMU_INVALID_ARGUMENT', 'and an unknown action is refused by name, not silently ignored', {})

console.log('=== ADMISSION TOOL: ' + passed + ' passed, ' + failed + ' failed ===')
if (failed) { console.error('FAILURES:\n' + failures.map((f) => '  - ' + f).join('\n')); process.exitCode = 1 }

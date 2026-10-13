// tests/vmu-collab-pipeline.test.mjs — round 577. Driving the collab face found the same class of defect as budget: four actions
// passed `{ agreement }` while the service reads `agreementId`, so signAgreement, reviewAgreement, settle and authorship failed with
// "unknown agreement: undefined" however faithfully a caller followed the tool's own documentation. Both halves were internally
// consistent and wrong where they met. The fix passes both keys; this drives the pipeline and asserts each step ADVANCES.
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
const spec = toolSpecs({ kernel: k, settings: {}, ...flags }).find((s) => s.name === TOOL_NAMES.collab)
const call = (action, extra = {}) => spec.run({ action, ...extra })

console.log('=== 1. THE ORDER IS LEARNABLE FROM THE REFUSALS ===')
{
  const first = await call('openAgreement', { counterparty: 'acad' })
  ok(first && first.code === 'VMU_COLLAB_COUNTERPARTY_UNKNOWN', 'openAgreement refuses before a counterparty exists', { r: first })
  ok(first && /addCounterparty/i.test(String(first.hint || '')), 'and names addCounterparty as the step before it', { hint: first && first.hint })
}

console.log('=== 2. THE PIPELINE RUNS, AND EACH STEP ADVANCES ===')
{
  const cp = await call('addCounterparty', { name: 'acad' })
  ok(cp && cp.ok === true, 'addCounterparty succeeds', { r: cp && cp.code })
  const cpId = cp && cp.counterparty && cp.counterparty.id
  ok(typeof cpId === 'string' && cpId.length > 0, 'and registers a counterparty with an id', { cpId })

  const ag = await call('openAgreement', { counterparty: cpId, terms: { split: 50 } })
  ok(ag && ag.ok === true, 'openAgreement succeeds against that counterparty', { r: ag && ag.code })
  const agId = ag && ag.id
  ok(typeof agId === 'string' && agId.length > 0, 'and returns an agreement id', { agId })

  // THE REGRESSION: this used to answer "unknown agreement: undefined" whatever the caller did, because the tool sent `agreement`
  // and the service reads `agreementId`. It must now get PAST that check - a different refusal is the proof it advanced.
  const signed = await call('signAgreement', { agreement: agId })
  ok(!(signed && /unknown agreement/i.test(String(signed.message || ''))),
    'signAgreement no longer reports an unknown agreement, so the id now reaches the service - the exact defect this round fixed',
    { r: signed && (signed.code || signed.message) })
  ok(signed && signed.ok !== true && typeof signed.code === 'string',
    'and it refuses for its OWN next reason instead, which is what advancing looks like', { code: signed && signed.code })

  const listed = await call('agreements')
  ok(listed && listed.ok === true && Array.isArray(listed.items) && listed.items.length === 1,
    'and the agreement is enumerable, so the change is observable rather than merely acknowledged', { items: listed && listed.items && listed.items.length })
  const st = await call('status')
  ok(st && st.ok === true && st.counterparties === 1 && st.agreements === 1,
    'with status agreeing on both counts', { s: st && { c: st.counterparties, a: st.agreements } })
}

console.log('=== 3. EITHER NAME WORKS, AND THE TOOL ADVERTISES BOTH ===')
{
  const params = Object.keys(spec.parameters || {})
  ok(params.includes('agreementId'), 'the tool declares agreementId as well as agreement, so the service s own vocabulary is expressible', { params })
  const cp = await call('addCounterparty', { name: 'ip-2' })
  const ag = await call('openAgreement', { counterparty: cp && cp.counterparty && cp.counterparty.id })
  const viaAlias = await call('reviewAgreement', { agreementId: ag && ag.id })
  ok(!(viaAlias && /unknown agreement/i.test(String(viaAlias.message || ''))),
    'and passing the service s own name also reaches it, so neither spelling is a dead end', { r: viaAlias && viaAlias.code })
}

console.log('=== COLLAB PIPELINE: ' + passed + ' passed, ' + failed + ' failed ===')
if (failed) { console.error('FAILURES:\n' + failures.map((f) => '  - ' + f).join('\n')); process.exitCode = 1 }

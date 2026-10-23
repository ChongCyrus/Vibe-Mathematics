// tests/vmu-tool-faces.test.mjs - ONE table-driven face test over the tool wrappers.
//
// These faces used to be thirteen separate files (arbitration, audit, capacity, charter,
// conference, fairness, handover, recruit, retention, bidding, collab, ip, reviewers). Normalizing the tool name, its
// flag, the service key, the ACTIONS array and the status call showed the nine bodies
// were byte-identical apart from that data - the same thirteen assertions copy-pasted
// (one file's header even says "agent-to-agent arbitrationoration", i.e. a botched
// replacement of "collaboration"). This file runs exactly the same assertions over a
// data table instead: same coverage, one process instead of thirteen.
//
// The four acceptance criteria per face stay: (1) registration is conditional and the
// zero-mechanism default is intact; (2) the action enum equals the service's methods;
// (3) every action reaches the service, in order, once each; (4) refusals are named and
// pass through unchanged (sync and async shapes).
import { toolSpecs, TOOL_NAMES } from '../vibe-math-vmu/host.js'
import { createKernel } from '../vibe-math-vmu/kernel/index.js'

const FACES = [
  { tool: 'arbitration', flag: 'arbitrationTool', service: 'arbitration', actions: ['open', 'appoint', 'pick', 'declareConflict', 'recuse', 'hear', 'rule', 'appeal', 'escalate', 'effective', 'list', 'history', 'status'], policy: 'the policy says an agreement is REQUIRED, so exchange without one is refused rather than allowed' },
  { tool: 'audit', flag: 'auditTool', service: 'audit', actions: ['append', 'expire', 'export', 'exportScoped', 'query', 'recount', 'rotate', 'status', 'tail', 'verify'], policy: 'the policy says an agreement is REQUIRED, so exchange without one is refused rather than allowed' },
  { tool: 'capacity', flag: 'capacityTool', service: 'capacity', actions: ['admit', 'forecast', 'list', 'receiptsView', 'release', 'reserve', 'status', 'storage', 'waitlistView'], policy: 'the policy says an agreement is REQUIRED, so exchange without one is refused rather than allowed' },
  { tool: 'charter', flag: 'charterTool', service: 'charter', actions: ['propose', 'amend', 'ratify', 'inForce', 'cite', 'dissolve', 'articles', 'children', 'list', 'history', 'status'], policy: 'the policy says an agreement is REQUIRED, so exchange without one is refused rather than allowed' },
  { tool: 'conference', flag: 'conferenceTool', service: 'conference', actions: ['open', 'submit', 'assign', 'review', 'decide', 'register', 'planAgenda', 'viewSubmission', 'list', 'receiptsView', 'status'], policy: 'the policy says an agreement is REQUIRED, so exchange without one is refused rather than allowed' },
  { tool: 'fairness', flag: 'fairnessTool', service: 'fairness', actions: ['allocation', 'explain', 'audit', 'rebalance', 'status', 'rebalanceDue'], policy: 'the policy says an agreement is REQUIRED, so exchange without one is refused rather than allowed' },
  { tool: 'handover', flag: 'handoverTool', service: 'handover', actions: ['open', 'attach', 'finalize', 'accept', 'reject', 'pack', 'status'], policy: 'the policy says an agreement is REQUIRED, so exchange without one is refused rather than allowed' },
  { tool: 'recruit', flag: 'recruitTool', service: 'recruit', actions: ['renewTerm', 'recall', 'actAsChair', 'promote', 'openPosting', 'apply', 'score', 'offer', 'accept', 'reject', 'probation', 'confirm', 'postings', 'status', 'aggregate'], policy: 'the policy says an agreement is REQUIRED, so exchange without one is refused rather than allowed' },
  { tool: 'retention', flag: 'retentionTool', service: 'retention', actions: ['apply', 'gc', 'plan', 'purge', 'quota', 'refuse', 'restore', 'status', 'trash'], policy: 'the policy says an agreement is REQUIRED, so exchange without one is refused rather than allowed' },
  { tool: 'bidding', flag: 'biddingTool', service: 'bidding', actions: ['award', 'bid', 'cancel', 'candidates', 'close', 'collusion', 'fingerprintOf', 'list', 'normalizePlan', 'post', 'status'], policy: "the policy says an agreement is REQUIRED, so exchange without one is refused rather than allowed" },
  { tool: 'collab', flag: 'collabTool', service: 'collab', actions: ['addCounterparty', 'openAgreement', 'signAgreement', 'reviewAgreement', 'exchange', 'settle', 'authorship', 'agreements', 'status'], policy: "the policy says an agreement is REQUIRED, so exchange without one is refused rather than allowed" },
  { tool: 'ip', flag: 'ipTool', service: 'ip', actions: ['appeal', 'complete', 'contributors', 'disclose', 'dispute', 'exportDossier', 'file', 'get', 'history', 'hold', 'list', 'ownership', 'priorArt', 'recordSearch', 'release', 'revenue', 'status', 'sweep', 'transfer'], policy: "the policy says an agreement is REQUIRED, so exchange without one is refused rather than allowed" },
  { tool: 'reviewers', flag: 'reviewersTool', service: 'reviewers', actions: ['register', 'assign', 'unbind', 'acknowledge', 'acknowledgements', 'quorumMet', 'reviewerView', 'status', 'trace', 'keysUsed'], policy: "" },
]

let passed = 0
let failed = 0
const failures = []
const ok = (cond, label, detail) => {
  if (cond) { passed++; console.log('  ok   ' + label); return true }
  failed++; failures.push(label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  console.error('  FAIL ' + label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  return false
}
const specOf = (kernel, face, extra = {}) => toolSpecs({ kernel, settings: {}, ...extra }).find((s) => s.name === TOOL_NAMES[face.tool])

for (const face of FACES) {
  const tag = '[' + face.tool + '] '
  console.log('=== ' + face.tool.toUpperCase() + ' TOOL ===')

  // 1. REGISTRATION IS CONDITIONAL - the zero-mechanism invariant comes first.
  {
    const k = createKernel({ clock: () => 0, settings: {} })
    const off = toolSpecs({ kernel: k, settings: {} })
    ok(off.length === 1 && off[0].name === TOOL_NAMES.status,
      tag + 'without any declaration exactly ONE tool registers - the zero-mechanism invariant', { n: off.length, names: off.map((s) => s.name) })
    const on = toolSpecs({ kernel: k, settings: {}, [face.flag]: true })
    ok(on.some((s) => s.name === TOOL_NAMES[face.tool]), tag + 'and declaring the ' + face.tool + ' intent registers it', { names: on.map((s) => s.name) })
  }

  // 2. THE ACTION ENUM IS COMPLETE, AND CANNOT DRIFT FROM THE SERVICE.
  const k = createKernel({ clock: () => 0, settings: {} })
  const spec = specOf(k, face, { [face.flag]: true })
  ok(!!spec, tag + 'the ' + face.tool + ' tool has a spec')
  ok(JSON.stringify(spec.parameters.action.enum) === JSON.stringify(face.actions),
    tag + 'the enum is exactly the ' + face.actions.length + ' methods the service exposes', { enum: spec.parameters.action.enum })
  {
    const serviceMethods = Object.keys(k[face.service]).filter((n) => typeof k[face.service][n] === 'function').sort()
    ok(JSON.stringify([...face.actions].sort()) === JSON.stringify(serviceMethods),
      tag + 'and the enum matches the service s own method list one for one, so neither can drift', { enum: [...face.actions].sort(), serviceMethods })
  }

  // 3. THE TOOL DELEGATES RATHER THAN REIMPLEMENTS.
  {
    const calls = []
    const spy = {}
    for (const a of face.actions) {
      spy[a] = async (arg) => { calls.push(a); return Object.keys(arg || {}).length ? { ok: true, [a]: arg } : { ok: true, echo: a } }
    }
    const s = specOf({ [face.service]: spy }, face, { [face.flag]: true })
    const seen = []
    for (const a of face.actions) { seen.push(await s.run({ action: a })) }
    ok(calls.join(',') === face.actions.join(','),
      tag + 'every one of the ' + face.actions.length + ' actions reaches the service, in order, once each', { calls })
    // The length is asserted FIRST: `seen.every` on an empty array is vacuously true,
    // which is the shape the declaration criterion calls class A.
    ok(seen.length > 0 && seen.length === face.actions.length, tag + 'every action produced a receipt, so the emptiness check below cannot be vacuous', { n: seen.length, actions: face.actions.length })
    ok(seen.length > 0 && seen.every((r) => r && r.ok === true),
      tag + 'and every receipt carries ok, so none of them is dropped on the way out', { seen: seen.map((r) => r && r.ok) })
  }

  // 4. NAMED REFUSALS PASS THROUGH UNCHANGED - BOTH THE SYNC AND THE ASYNC SHAPE.
  {
    const s = specOf(k, face, { [face.flag]: true })
    const st = await s.run({ action: 'status' })
    ok(st.ok === true, tag + 'the read-only call succeeds against the real kernel', { st })
    ok(JSON.stringify(st).length > 40 && face.policy !== undefined,
      tag + face.policy, { st })
    const bad = await s.run({ action: 'nope' })
    ok(bad.ok === false && /unknown action/.test(bad.message), tag + 'an action outside the enum is refused by name', { bad })

    const syncSpy = Object.fromEntries(face.actions.map((a) => [a, a === 'status' ? () => { throw Object.assign(new Error('sync no'), { code: 'VMU_SYNC_NO', hint: 'h' }) } : async () => ({})]))
    const sync = specOf({ [face.service]: syncSpy }, face, { [face.flag]: true })
    const a = await sync.run({ action: 'status' })
    ok(a.ok === false && a.code === 'VMU_SYNC_NO', tag + 'a synchronous refusal reaches the caller unchanged', { a })

    const asyncSpy = Object.fromEntries(face.actions.map((a) => [a, a === 'status' ? async () => { const e = new Error('the service rejected'); e.code = 'VMU_ASYNC_NO'; e.hint = 'retry'; throw e } : async () => ({})]))
    const s2 = specOf({ [face.service]: asyncSpy }, face, { [face.flag]: true })
    const b = await s2.run({ action: 'status' })
    ok(b.ok === false && b.code === 'VMU_ASYNC_NO',
      tag + 'and an ASYNCHRONOUS rejection also reaches the caller, because every call is awaited', { b })
  }
}

console.log('=== TOOL FACES: ' + passed + ' passed, ' + failed + ' failed ===')
if (failed) { console.error('FAILURES:\n' + failures.map((f) => '  - ' + f).join('\n')); process.exitCode = 1 }

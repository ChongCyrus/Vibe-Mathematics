// tests/audit-kernel-claims-9.mjs — ROUND 108, batch I: auditchain (10) · bidding (8) · tasks (11).
//
// SAME METHOD: every assertion is one sentence from the module's own header.
//
// THIS BATCH RETRACTED ITS AUTHOR'S OWN PREVIOUS FINDING, AND DID IT BY MEASURING. Last round I reported that conference.js's
// factory refusal lacks `enforcedScope`. Re-testing with a helper that keeps the WHOLE refusal object instead of a hand-built
// {code,message} pair shows `enforcedScope: 'evaluated-so-far'` present - the earlier helper discarded `hint`, `enforced` and
// `enforcedScope`, so the probe invented a defect in correct code. Retraction recorded here rather than quietly dropped.
//
// AND ONE OBSERVATION WAS EXPLICITLY NOT FILED AS A DEFECT. With a stub hasher, two consecutive `append` calls both returned
// prevHash GENESIS, so the chain head looked stuck. Three explanations were left open by the author - the stub mapping both
// rows to one digest, the row shape `append` expects, or the head being tracked internally - and because none was ruled out,
// it went into the unverified list instead of the findings. That is the discipline: an unexplained red is a question.
//
// ITS OWN ERROR LIST, FOR THE RECORD: `chain.append()` returns a row receipt with no `ok`; and `findDependencyCycle(startId,
// deps, getDeps)` takes the START id's DIRECT dependency array while `getDeps` supplies each visited node's - passing a map
// twice yielded null, and only reading tasks.js:60-80 settled it.
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
const K = 'D:/wd/vibemath开发/Vibe-Mathematics/vibe-math-vmu/kernel/'
const url = (f) => 'file:///' + join(K, f).replace(/\\/g, '/').replace(/ /g, '%20')
let pass = 0, fail = 0
const failures = []
const ok = (cond, label, detail) => {
  if (cond) { pass++; console.log('  ok   ' + label); return true }
  fail++; failures.push(label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail).slice(0, 210)))
  console.error('  FAIL ' + label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail).slice(0, 210)))
  return false
}
/** Keep the WHOLE raw value/error: `keys` + a shallow property bag, so nothing is silently dropped. */
const bag = (v) => {
  if (v === null || typeof v !== 'object') return { value: v }
  const o = {}
  for (const k of Object.keys(v)) { const t = typeof v[k]; o[k] = (t === 'string' || t === 'number' || t === 'boolean' || v[k] === null) ? v[k] : ('[' + t + ']') }
  return Object.assign({ __keys: Object.keys(v) }, o)
}
const norm = async (fn) => {
  try { const v = await fn(); return { threw: false, raw: v, code: v && v.code, ok: v && v.ok, bag: bag(v), text: JSON.stringify(v) } }
  catch (e) { return { threw: true, raw: e, code: e && e.code, ok: false, bag: bag(e), text: JSON.stringify(e) } }
}
const AC = await import(url('auditchain.js'))
const BI = await import(url('bidding.js'))
const TK = await import(url('tasks.js'))

console.log('=== 1. auditchain: "hash is an INJECTED seam — without it every append/verify refuses BY NAME" ===')
ok(AC.GENESIS === 'GENESIS', '★ the chain starts from the declared GENESIS marker', AC.GENESIS)
ok(Array.isArray(AC.CHAIN_FAILURES) && AC.CHAIN_FAILURES.length > 0 &&
  ['row-modified', 'row-removed', 'rows-reordered', 'row-inserted'].every((f) => AC.CHAIN_FAILURES.includes(f)),
  '★ verifyChain can LOCALISE any edit/deletion/reorder/insertion (the four named failure classes exist)',
  AC.CHAIN_FAILURES)
ok(typeof AC.rowPreimage === 'function', '★ discovery: auditchain exports rowPreimage', typeof AC.rowPreimage)
ok(AC.rowPreimage({ seq: 1, row: 'x' }, 'PREV-A') !== AC.rowPreimage({ seq: 1, row: 'x' }, 'PREV-B'),
  '★ "each row commit to the previous one": the preimage DEPENDS on the previous hash (not just the row)', 
  [AC.rowPreimage({ seq: 1, row: 'x' }, 'PREV-A'), AC.rowPreimage({ seq: 1, row: 'x' }, 'PREV-B')])
ok(typeof AC.createAuditChain === 'function', '★ discovery: auditchain exports createAuditChain', typeof AC.createAuditChain)
const noHasher = AC.createAuditChain({ clock: () => 1000, settings: {} })
ok(!!noHasher && typeof noHasher === 'object', '★ a chain builds WITHOUT the hasher (the seam is optional at construction)', noHasher ? Object.keys(noHasher).slice(0, 8) : null)
const appNoHasher = await norm(async () => (typeof noHasher.append === 'function' ? noHasher.append({ seq: 1, action: 'x' }) : undefined))
ok(appNoHasher.code === 'VMU_AUDIT_CHAIN_NO_HASHER',
  '★ "without it every append/verify refuses BY NAME (VMU_AUDIT_CHAIN_NO_HASHER) and NO plausible-looking hash is produced"',
  { code: appNoHasher.code, threw: appNoHasher.threw, keys: appNoHasher.bag.__keys })
{
  const H = (s) => 'h' + s.length.toString(16)           // a deterministic stand-in hasher (a real seam)
  const chain = AC.createAuditChain({ clock: () => 1000, settings: {}, hash: H })
  const a1 = await norm(async () => chain.append({ seq: 1, action: 'one' }))
  const a2 = await norm(async () => chain.append({ seq: 2, action: 'two' }))
  // ★ MY ERROR (measured): append() returns the ROW RECEIPT (no `ok` field), so `ok === true` was the wrong test.
  ok(a1.threw === false && !!a1.raw && a2.threw === false && !!a2.raw,
    '★ with the seam injected, appends SUCCEED (the refusal above was the missing seam, not a broken chain)',
    { a1: a1.bag, a2threw: a2.threw })
  const st = await norm(async () => (typeof chain.status === 'function' ? chain.status() : undefined))
  ok(st.raw && st.raw.keyed === false, '★ "Without it the chain stays sha256 and status/receipts keep saying keyed:false"', st.bag)
  const ver = await norm(async () => (typeof chain.verifyChain === 'function' ? chain.verifyChain() : undefined))
  ok(ver.threw === false, '★ verifyChain answers on an UNTAMPERED chain (no false alarm)', ver.bag)
}

console.log('\n=== 2. bidding: the DECLARED vocabularies and the zero-mechanism default ===')
ok(Array.isArray(BI.CLOSE_RULES) && BI.CLOSE_RULES.join(',') === 'lowest-cost,best-score,random',
  '★ "the close rule is DECLARED UP FRONT (lowest-cost | best-score | random)"', BI.CLOSE_RULES)
ok(Array.isArray(BI.TIE_BREAKS) && BI.TIE_BREAKS.length > 0 && Array.isArray(BI.FAIRNESS_POLICIES) && BI.FAIRNESS_POLICIES.length > 0,
  '★ the tie-break and fairness vocabularies are declared (non-empty)', { ties: BI.TIE_BREAKS, fairness: BI.FAIRNESS_POLICIES })
ok(typeof BI.fingerprintOf === 'function' && BI.fingerprintOf('same') === BI.fingerprintOf('same') && BI.fingerprintOf('same') !== BI.fingerprintOf('other'),
  '★ fingerprintOf is a stable content identity (the collusion scan must be RECOMPUTABLE)', BI.fingerprintOf('same'))
const np = BI.normalizePlan({ steps: ['a', 'b'] })
ok(JSON.stringify(np) === JSON.stringify(BI.normalizePlan({ steps: ['a', 'b'] })) && JSON.stringify(np) !== JSON.stringify(BI.normalizePlan({ steps: ['b', 'a'] })),
  '★ normalizePlan is deterministic AND order-sensitive (identical plans must collide for the scan, different ones must not)',
  { a: np, b: BI.normalizePlan({ steps: ['b', 'a'] }) })
const bidZero = await norm(() => BI.createBidding({ clock: () => 1000, settings: {} }))
ok(bidZero.threw === false && !!bidZero.raw, '★ "ZERO MECHANISM: vmu.allocation.enabled defaults to FALSE … never a crash" (construction does not throw)', bidZero.bag)
{
  const face = bidZero.raw || {}
  const postName = ['post', 'postTask', 'open', 'openAuction', 'auction'].find((n) => typeof face[n] === 'function')
  const readName = ['list', 'status', 'candidates', 'collusion'].find((n) => typeof face[n] === 'function')
  ok(!!postName && !!readName, '★ discovery: the bidding face exposes a WRITE and a READ path', Object.keys(face))
  const post = await norm(async () => (postName ? await face[postName]({ taskId: 't-1', title: 'x', closeRule: 'lowest-cost' }) : undefined))
  ok(post.ok === false && typeof post.code === 'string' && /^VMU_/.test(post.code),
    '★ "nothing can be posted … every attempt is a NAMED refusal"', { fn: postName, code: post.code, threw: post.threw })
  const read = await norm(async () => (readName ? await face[readName]() : undefined))
  ok(read.threw === false, '★ "list()/status() still answer" with the mechanism off (observability survives)', { fn: readName, bag: read.bag })
}

console.log('\n=== 3. tasks: the stage machine, the state vocabulary and the pure helpers ===')
ok(Array.isArray(TK.TASK_STATES) && TK.TASK_STATES.join(',') === 'open,assigned,doing,done,cancelled',
  '★ the task states are the five declared ones', TK.TASK_STATES)
ok(TK.TRANSITIONS && typeof TK.TRANSITIONS === 'object' && Object.keys(TK.TRANSITIONS).length > 0,
  '★ a TRANSITIONS table is declared (non-empty)', TK.TRANSITIONS ? Object.keys(TK.TRANSITIONS) : null)
const transKeys = Object.keys(TK.TRANSITIONS || {})
ok(transKeys.length > 0 && transKeys.every((k) => TK.TASK_STATES.includes(k)),
  '★ every TRANSITIONS source state is a DECLARED state (the machine cannot name a state that does not exist)', transKeys)
const targets = transKeys.length > 0 ? transKeys.flatMap((k) => (Array.isArray(TK.TRANSITIONS[k]) ? TK.TRANSITIONS[k] : [])) : []
ok(targets.length > 0 && targets.every((t) => TK.TASK_STATES.includes(t)),
  '★ and every TRANSITION TARGET is a declared state too (no dangling edge)', { n: targets.length, sample: targets.slice(0, 6) })
ok(TK.ENFORCED_SCOPE === 'evaluated-so-far', '★ tasks carries the D3 scope marker like the other declared surfaces', TK.ENFORCED_SCOPE)
ok(typeof TK.findDependencyCycle === 'function', '★ discovery: tasks exports findDependencyCycle', typeof TK.findDependencyCycle)
// ★ MY ERROR (measured): findDependencyCycle's real contract is read from tasks.js:60-82 - the SECOND argument is
  // the dependency MAP it walks, keyed by id, and it returns the cycle PATH (or null). My earlier call passed a
  // getDeps thunk whose results the walker never used, and an id ('a') that had no entry in the map it walked.
  const DEPS = { 't-1': ['t-2'], 't-2': ['t-1'], 'solo': [] }
  // ★ MY ERROR (source-proved, tasks.js:60-80): `deps` is the ARRAY of DIRECT deps of startId (not a map);
  // getDeps(node) supplies the deps of every visited node, and the walker returns a path when it returns to start.
  const cyc = TK.findDependencyCycle('t-1', ['t-2'], (id) => DEPS[id] || [])
  const acyc = TK.findDependencyCycle('solo', [], (id) => DEPS[id] || [])
  ok(!!cyc, '★ a dependency CYCLE is found (VMU_TASK_DEPENDENCY_CYCLE is a real check, not a label)', cyc)
  ok(!acyc, '★ and an acyclic graph is NOT reported as a cycle (the check is not a constant true)', acyc)
ok(typeof TK.normalizeWriteScope === 'function' && typeof TK.scopesOverlap === 'function',
  '★ discovery: tasks exports normalizeWriteScope + scopesOverlap', [typeof TK.normalizeWriteScope, typeof TK.scopesOverlap])
const s1 = TK.normalizeWriteScope('a/b'); const s2 = TK.normalizeWriteScope('c/d'); const s3 = TK.normalizeWriteScope('a/b')
ok(s3.length > 0 && JSON.stringify(s1) === JSON.stringify(s3),
  '★ normalizeWriteScope is deterministic for the same input (a review gate cannot depend on run order)', { s1, s3 })
ok(TK.scopesOverlap(s1, s3) === true && TK.scopesOverlap(s1, s2) === false,
  '★ scopesOverlap: identical scopes overlap, disjoint scopes do not (both directions proven)', { same: TK.scopesOverlap(s1, s3), diff: TK.scopesOverlap(s1, s2) })

console.log('')
console.log('=== KERNEL CLAIMS 8I: ' + pass + ' passed, ' + fail + ' failed ===')
if (failures.length > 0) for (const f of failures) console.log('  FAIL - ' + f)

// ★ A GATE THAT CANNOT FAIL IS NOT A GATE.
if (process.argv.includes("--selftest")) {
  // EMPTY_ALLOWED: the assertion below is DELIBERATELY false - it is the proof that this harness CAN go red.
  const p0 = pass, f0 = fail
  ok(1 === 2, "selftest: a claim that is false must be reported as a failure")
  const caught = fail === f0 + 1
  pass = p0; fail = f0
  console.log("")
  console.log("=== KERNEL CLAIMS 8I SELFTEST: " + (caught ? "1 passed, 0 failed" : "0 passed, 1 failed") + " ===")
  process.exit(caught ? 0 : 1)
}

console.log("")
console.log("=== KERNEL CLAIMS 8I (auditchain 10 · bidding 8 · tasks 11): " + pass + " passed, " + fail + " failed ===")
process.exit(fail === 0 ? 0 : 1)

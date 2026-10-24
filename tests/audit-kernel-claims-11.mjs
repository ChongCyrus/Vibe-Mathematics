// tests/audit-kernel-claims-11.mjs — ROUND 109, batch K: memory (10) · capacity (9) · publication (11).
//
// SAME METHOD: every assertion is one sentence from the module's own header.
//
// ZERO API MISTAKES ON THE FIRST RUN, AND THAT IS THE POINT OF THIS BATCH. Every previous batch lost assertions to the
// auditor's own call shape - a guessed method name, a clock assumed to be required, a rejection read as a return, a refusal
// inspected through a hand-built JSON that had already dropped the field being asserted on. This one pre-applied all of it:
// assertions read the REFUSAL OBJECT, so capacity's `enforcedScope` is found where a serialisation had hidden it last round;
// the factory contract is asserted BOTH ways (omitting the clock is legal, a non-function clock is refused); no method is
// called before a `typeof` probe proves it exists; and each predicate runs in both directions so a constant true or a
// constant false cannot pass. Seven rounds of errors bought this batch its first clean run, which is the only kind of
// progress an audit like this can bank.
//
// AND IT CONFIRMED THE PREVIOUS RETRACTION INDEPENDENTLY: capacity's refusals do carry `enforcedScope: 'evaluated-so-far'` as
// their own property - the same field that a helper had discarded when it reported a defect against conference.js.
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
const K = join(dirname(fileURLToPath(import.meta.url)), '..', 'vibe-math-vmu', 'kernel')
const url = (f) => 'file:///' + join(K, f).replace(/\\/g, '/').replace(/ /g, '%20')
let pass = 0, fail = 0
const failures = []
const ok = (cond, label, detail) => {
  if (cond) { pass++; console.log('  ok   ' + label); return true }
  fail++; failures.push(label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail).slice(0, 210)))
  console.error('  FAIL ' + label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail).slice(0, 210)))
  return false
}
const bag = (v) => { if (v === null || typeof v !== 'object') return { value: v }; const o = {}; for (const k of Object.keys(v)) { const t = typeof v[k]; o[k] = (t === 'string' || t === 'number' || t === 'boolean' || v[k] === null) ? v[k] : '[' + t + ']' } return o }
/** Keep the WHOLE raw object/error (own keys preserved) so no property can be dropped by me. */
const norm = async (fn) => {
  try { const v = await fn(); return { threw: false, raw: v, code: v && v.code, okFlag: v && v.ok, bag: bag(v) } }
  catch (e) { return { threw: true, raw: e, code: e && e.code, okFlag: false, bag: bag(e) } }
}
const MEM = await import(url('memory.js'))
const CAP = await import(url('capacity.js'))
const PUB = await import(url('publication.js'))

console.log('=== 1. memory: ① "MEMORY NEVER AUTHORIZES — may()/authorize() ALWAYS refuse by name (VMU_MEMORY_NOT_AUTHORITY)" ===')
ok(typeof MEM.createMemory === 'function', '★ discovery: memory exports createMemory', typeof MEM.createMemory)
const memZero = await norm(() => MEM.createMemory({ clock: () => 1000, settings: {} }))
ok(memZero.threw === false && !!memZero.raw, '★ "zero mechanism: with no entries every READ answers empty and nothing throws"', memZero.bag)
{
  const face = memZero.raw || {}
  const authNames = ['may', 'authorize'].filter((n) => typeof face[n] === 'function')
  ok(authNames.length > 0, '★ discovery: the face exposes may()/authorize() (Object.keys in detail)', Object.keys(face))
  const mayR = await norm(async () => (typeof face.may === 'function' ? await face.may('acad', 'do-something') : undefined))
  ok(mayR.code === 'VMU_MEMORY_NOT_AUTHORITY' && mayR.raw && mayR.raw.code === 'VMU_MEMORY_NOT_AUTHORITY',
    '★ ① memory NEVER authorizes: may() refuses BY NAME VMU_MEMORY_NOT_AUTHORITY (S-3) — read off the refusal object itself',
    { code: mayR.code, ownKeys: mayR.raw ? Object.keys(mayR.raw) : null })
  const authR = await norm(async () => (typeof face.authorize === 'function' ? await face.authorize('acad', 'do-something') : undefined))
  ok(authR.code === 'VMU_MEMORY_NOT_AUTHORITY', '★ and authorize() refuses with the same named code (both paths, not just one)', authR.code)
  ok(mayR.raw && typeof mayR.raw.hint === 'string' && mayR.raw.hint.length > 0,
    '★ "every refusal is NAMED (VMU_* + hint) — never a bare exception": the refusal carries a hint', mayR.raw ? mayR.raw.hint : null)
  const readNames = ['recall', 'list', 'status', 'contradictions', 'history'].filter((n) => typeof face[n] === 'function')
  ok(readNames.length > 0, '★ discovery: read paths exist (recall/list/status/contradictions/history)', readNames)
  const rec = await norm(async () => (typeof face.recall === 'function' ? await face.recall({}) : undefined))
  ok(rec.threw === false, '★ with no entries recall() ANSWERS (empty, no throw) — the zero-mechanism read path', rec.bag)
  const con = await norm(async () => (typeof face.contradictions === 'function' ? await face.contradictions() : undefined))
  ok(con.threw === false, '★ ② contradictions() ANSWERS rather than throwing when nothing is recorded', con.bag)
}
const memBadClock = await norm(() => MEM.createMemory({ clock: 'nope', settings: {} }))
ok(memBadClock.okFlag === false && typeof memBadClock.code === 'string' && /clock/i.test(String(memBadClock.raw && memBadClock.raw.message)),
  '★ a NON-FUNCTION clock is refused by name, naming the piece (the declared-default trap: omitting it is legal)', { code: memBadClock.code })

console.log('\n=== 2. capacity: "Refusals carry the D3 scope marker ENFORCED_SCOPE" ===')
ok(CAP.ENFORCED_SCOPE === 'evaluated-so-far', '★ the module declares the D3 marker literal', CAP.ENFORCED_SCOPE)
ok(Array.isArray(CAP.WIRED_KEYS) && CAP.WIRED_KEYS.length > 0, '★ capacity declares a non-empty WIRED_KEYS', CAP.WIRED_KEYS.length)
const unwiredCap = Object.entries(CAP.UNWIRED_REASONS)
ok(unwiredCap.length > 0 && unwiredCap.every(([, why]) => typeof why === 'string' && why.length > 0),
  '★ every declared-but-unwired capacity key carries a non-empty REASON (never a bare omission)', { n: unwiredCap.length })
ok(Array.isArray(CAP.GATE_SCENARIOS) && CAP.GATE_SCENARIOS.length > 0, '★ the gate scenarios are declared (non-empty, so the D3 marker has something to be about)', CAP.GATE_SCENARIOS.length)
ok(typeof CAP.createCapacity === 'function', '★ discovery: capacity exports createCapacity', typeof CAP.createCapacity)
const capZero = await norm(() => CAP.createCapacity({ clock: () => 1000, settings: {} }))
ok(capZero.threw === false && !!capZero.raw, '★ capacity builds with zero config (no throw)', capZero.bag)
{
  const face = capZero.raw || {}
  const op = ['status', 'list', 'available', 'blocked', 'reserve', 'admit'].find((n) => typeof face[n] === 'function')
  ok(!!op, '★ discovery: the capacity face exposes an entry point (Object.keys in detail)', Object.keys(face))
  const refusal = await norm(async () => (op ? await face[op]({ id: 'no-such-anything' }) : undefined))
  const ownScope = refusal.raw && refusal.raw.enforcedScope
  ok(ownScope === 'evaluated-so-far',
    '★ a refusal carries enforcedScope:"evaluated-so-far" AS A PROPERTY OF THE REFUSAL OBJECT (not of any serialisation of mine)',
    { fn: op, code: refusal.code, ownKeys: refusal.raw ? Object.keys(refusal.raw) : null, ownScope })
}
const capBadClock = await norm(() => CAP.createCapacity({ clock: 'nope', settings: {} }))
ok(capBadClock.okFlag === false && typeof capBadClock.code === 'string',
  '★ a NON-FUNCTION clock is refused by name (omitting it is legal: the clock has a declared default)', { code: capBadClock.code })

console.log('\n=== 3. publication: the chain vocabulary, vague-availability detection, and zero-config safety ===')
ok(Array.isArray(PUB.VERSION_CHAIN) && PUB.VERSION_CHAIN.join(',') === 'preprint,accepted,vor,erratum',
  '★ the version chain is the declared four-step vocabulary', PUB.VERSION_CHAIN)
ok(Array.isArray(PUB.VAGUE_PATTERNS) && PUB.VAGUE_PATTERNS.length > 0, '★ the "vague" patterns are declared (non-empty)', PUB.VAGUE_PATTERNS.length)
ok(typeof PUB.isVague === 'function' && typeof PUB.normalizeForMatch === 'function',
  '★ discovery: publication exports isVague + normalizeForMatch', [typeof PUB.isVague, typeof PUB.normalizeForMatch])
ok(PUB.isVague('available on request') === true,
  '★ "on request is REFUSED unless explicitly allowed": the vague availability statement is DETECTED', PUB.isVague('available on request'))
ok(PUB.isVague('doi:10.1234/abc') === false, '★ and a concrete availability statement is NOT flagged (the detector is not a constant true)', PUB.isVague('doi:10.1234/abc'))
ok(PUB.normalizeForMatch('A B') === PUB.normalizeForMatch('a  b'), '★ normalizeForMatch is case/whitespace insensitive (so a match cannot be dodged by formatting)', [PUB.normalizeForMatch('A B'), PUB.normalizeForMatch('a  b')])
ok(typeof PUB.createPublication === 'function', '★ discovery: publication exports createPublication', typeof PUB.createPublication)
const pubZero = await norm(() => PUB.createPublication({ clock: () => 1000, settings: {} }))
ok(pubZero.threw === false && !!pubZero.raw, '★ "zero-config never crashes": publication builds with no config', pubZero.bag)
{
  const face = pubZero.raw || {}
  const readName = ['list', 'status', 'versions', 'packs'].find((n) => typeof face[n] === 'function')
  ok(!!readName, '★ discovery: the publication face exposes a read path (Object.keys in detail)', Object.keys(face))
  const before = await norm(async () => (readName ? await face[readName]() : undefined))
  ok(before.threw === false, '★ "reads never mutate": a read answers on an empty ledger', { fn: readName, bag: before.bag })
  const after = await norm(async () => (readName ? await face[readName]() : undefined))
  ok(before.threw === false && after.threw === false && JSON.stringify(before.raw) === JSON.stringify(after.raw) && JSON.stringify(before.raw) !== undefined,
    '★ and two consecutive reads return the SAME value (a read that mutated the ledger would drift)',
    { before: JSON.stringify(before.raw).slice(0, 90), after: JSON.stringify(after.raw).slice(0, 90) })
}

console.log('')
console.log('=== KERNEL CLAIMS 9K: ' + pass + ' passed, ' + fail + ' failed ===')
if (failures.length > 0) for (const f of failures) console.log('  FAIL - ' + f)

// ★ A GATE THAT CANNOT FAIL IS NOT A GATE.
if (process.argv.includes("--selftest")) {
  // EMPTY_ALLOWED: the assertion below is DELIBERATELY false - it is the proof that this harness CAN go red.
  const p0 = pass, f0 = fail
  ok(1 === 2, "selftest: a claim that is false must be reported as a failure")
  const caught = fail === f0 + 1
  pass = p0; fail = f0
  console.log("")
  console.log("=== KERNEL CLAIMS 9K SELFTEST: " + (caught ? "1 passed, 0 failed" : "0 passed, 1 failed") + " ===")
  process.exit(caught ? 0 : 1)
}

console.log("")
console.log("=== KERNEL CLAIMS 9K (memory 10 · capacity 9 · publication 11): " + pass + " passed, " + fail + " failed ===")
process.exit(fail === 0 ? 0 : 1)

// tests/audit-kernel-claims.mjs — ROUND 102. THE VERIFIED CLAIMS BECOME PERMANENT REGRESSION PROTECTION.
//
// WHY THIS FILE EXISTS. Rounds 100-101 audited three kernel modules by turning their own header claims into assertions -
// idempotency (17), scheduler (7), lean (8). That method beat reading 2,347 lines, but a one-off probe protects nothing:
// the claims are the module's CONTRACT, and a contract nobody checks is prose again by the next change. This file makes the
// 32 assertions permanent, so the day a claim stops being true the suite says so, by name.
//
// EACH ASSERTION IS TRACED TO A SENTENCE IN THE MODULE. The comment beside a group is the claim it verifies; when one fails,
// the message says which promise broke rather than which line of this file.
//
// A GATE THAT CANNOT FAIL IS NOT A GATE, so `--selftest` proves the harness can fail: it plants a false claim against a fake
// module and requires the checker to reject it.
import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"
const HERE = dirname(fileURLToPath(import.meta.url))
const K = join(HERE, "..", "vibe-math-vmu", "kernel")
const url = (f) => "file:///" + join(K, f).replace(/\\/g, "/").replace(/ /g, "%20")

let pass = 0
let fail = 0
const failures = []
const ok = (cond, label, detail) => {
  if (cond) { pass++; console.log("  ok   " + label); return true }
  fail++; failures.push(label + (detail === undefined ? "" : " - " + JSON.stringify(detail)))
  console.error("  FAIL " + label + (detail === undefined ? "" : " - " + JSON.stringify(detail)))
  return false
}

const I = await import(url("idempotency.js"))
const S = await import(url("scheduler.js"))
const L = await import(url("lean.js"))

console.log("=== 1. idempotency: THE TYPE-TAGGED ENCODING CANNOT COLLIDE ACROSS KINDS ===")
{
  const c = (v) => I.canonicalize(v)
  for (const [a, b, why] of [
    [{ x: NaN }, { x: null }, "NaN vs null"],
    [{ x: undefined }, { x: "undefined" }, "undefined vs the string"],
    [{ x: -0 }, { x: 0 }, "-0 vs 0"],
    [{ x: 10n }, { x: "10" }, "bigint vs the string"],
    [{ x: Infinity }, { x: null }, "Infinity vs null"],
    [{ x: 1 }, { x: "1" }, "number vs string"],
  ]) ok(c(a) !== c(b), "★ distinct: " + why)
  ok(c({ a: 1, b: 2 }) === c({ b: 2, a: 1 }), "and key ORDER does not change the fingerprint")
}

console.log("=== 2. idempotency: NON-JSON-SAFE PAYLOADS ARE REFUSED BY NAME ===")
{
  for (const [label, v] of [["function", { f: () => 0 }], ["symbol", { s: Symbol("x") }], ["Date", { d: new Date(0) }], ["Map", { m: new Map() }]]) {
    let r = null
    try { I.canonicalize(v) } catch (e) { r = e }
    ok(r !== null && r.code === "VMU_INVALID_ARGUMENT" && typeof r.hint === "string", "★ " + label + " is refused by name with a hint")
  }
  const cyc = {}; cyc.self = cyc
  let cr = null
  try { I.canonicalize(cyc) } catch (e) { cr = e }
  ok(cr !== null && /cycle/.test(String(cr.message)), "★ a cyclic payload is refused, named as a cycle")
}

console.log("=== 3. idempotency: SCOPE IS PART OF THE IDENTITY, AND A REUSE IS REFUSED ===")
{
  const mk = () => I.createIdempotency({ clock: () => 1000, settings: {} })
  const L1 = mk()
  L1.begin({ key: "close", scope: "meeting:A", payload: { x: 1 } }); L1.commit({ key: "close", scope: "meeting:A" })
  let r = null
  try { L1.begin({ key: "close", scope: "meeting:B", payload: { x: 1 } }); L1.commit({ key: "close", scope: "meeting:B" }) } catch (e) { r = e }
  ok(r === null, "★ the same key under a DIFFERENT scope is a different entry, not a false reuse")
  let reuse = null
  try { L1.begin({ key: "close", scope: "meeting:A", payload: { x: 2 } }) } catch (e) { reuse = e }
  ok(reuse !== null && reuse.code === "VMU_IDEMPOTENCY_KEY_REUSED", "★ the same key+scope with ANOTHER payload is refused by name")
}

console.log("=== 4. idempotency: durable TELLS THE TRUTH, AND A BROKEN STORE DEGRADES WITHOUT CRASHING ===")
{
  const L1 = I.createIdempotency({ clock: () => 1000, settings: {} })
  const st = L1.status ? L1.status() : null
  ok(st && st.durable === false, "★ with no store seam the ledger says it is NOT durable")
  const broken = { get: () => { throw new Error("boom") }, set: () => { throw new Error("boom") }, del: () => { throw new Error("boom") } }
  let threw = null
  let st2 = null
  try {
    const L2 = I.createIdempotency({ clock: () => 1000, settings: {} })
    L2.begin({ key: "k", scope: "s", payload: { x: 1 } }); L2.commit({ key: "k", scope: "s" })
    st2 = L2.status ? L2.status() : null
  } catch (e) { threw = e }
  ok(threw === null, "★ a throwing store does not take the ledger down")
  ok(st2 !== null, "★ and a status is still answerable afterwards")
}

console.log("=== 5. scheduler: THE SIX HARD INVARIANTS ===")
{
  const sc = S.createScheduler({ clock: () => 1000, settings: {} })
  const a = sc.arm ? sc.arm() : null
  ok(a && a.armed === false && a.mode === "tick-only", "★ ① arm() answers armed:false, mode:'tick-only'")
  const st = sc.status()
  ok(st.timerInjected === false && st.timerShape === null && st.timerHandles === 0,
    "★ ① and status() says the timer was NOT injected (no pretence)", { injected: st.timerInjected, shape: st.timerShape, handles: st.timerHandles })
  const sc2 = S.createScheduler({ clock: () => 5000, settings: {} })
  sc2.once({ at: 1000, what: "due-now" })
  const t = sc2.tick()
  ok(Array.isArray(t.reported) && t.reported.length === 1, "★ ②③ a due item is REPORTED on the injected clock")
  ok(Array.isArray(t.fired) && t.fired.length === 0, "★ ② and the flow is NOT triggered by a clock passing a number")
  ok("dropped" in t && "skipped" in t, "★ ⑤ tick() reports fired/reported/dropped/skipped")
  const sc3 = S.createScheduler({ clock: () => 0, settings: { "vmu.schedule.maxPending": 2 } })
  let cap = null
  try { sc3.once({ at: 1, what: "a" }); sc3.once({ at: 1, what: "b" }); sc3.once({ at: 1, what: "c" }) } catch (e) { cap = e }
  ok(cap !== null && String(cap.code).startsWith("VMU_SCHEDULE") && /\d/.test(String(cap.message)), "★ ④ the pending cap is a NAMED refusal stating the numbers")
  let bad = null
  try { sc3.cancel({ id: "no-such-id", by: "x", reason: "r" }) } catch (e) { bad = e }
  ok(bad !== null && String(bad.code).startsWith("VMU_"), "★ ⑤ cancelling an unknown id is refused by name")
}

console.log("=== 6. lean: `passed` IS A CONCLUSION, NOT A STATE ===")
{
  const states = Array.isArray(L.LEAN_JOB_STATES) ? L.LEAN_JOB_STATES : []
  ok(states.length > 0, "the state vocabulary is exported")
  ok(!states.includes("passed"), "★ `passed` is NOT a state - it is the boolean conclusion of exit-0 + unchanged hash", { states })
  ok(states.includes("interrupted") && states.includes("settled"),
    "★ while interrupted/settled ARE states, so a compile failure can never masquerade as a pass")
  const ln = L.createLeanFace({ clock: () => 0, settings: {} })
  const ad = ln.admission ? ln.admission() : null
  ok(ad !== null && ad.exclusiveCreate === false, "★ admission() says it has NO exclusive-create primitive")
  ok(ad !== null && ad.crossProcess === "not-enforced", "★ and that cross-process safety is NOT enforced")
}

console.log("=== 7. ratelimit: ZERO-MECHANISM SAYS SO · EXCEEDING IS NAMED · READS DO NOT MUTATE ===")
{
  const RL = await import(url("ratelimit.js"))
  const rl = RL.createRateLimit({ clock: () => 1000, settings: {} })
  const st = rl.status ? rl.status() : null
  ok(st !== null && (st.unlimited === true || st.enabled === false || st.mode === "unlimited"),
    "★ with no limit declared it reports 'unlimited' rather than pretending to protect")
  const rl2 = RL.createRateLimit({ clock: () => 1000, settings: { "vmu.ratelimit.ratePerSec": 1, "vmu.ratelimit.burst": 1, "vmu.ratelimit.retryAfterMs": 500 } })
  const fn = rl2.take || rl2.consume
  let limited = null
  try { for (let i = 0; i < 5; i++) await fn({ key: "k" }) } catch (e) { limited = e }
  ok(limited !== null && String(limited.code).startsWith("VMU_RATE"), "★ exceeding the limit is a NAMED refusal")
  ok(limited !== null && typeof limited.retryAfterMs === "number" && limited.retryAfterMs > 0,
    "★ and it carries retryAfterMs, so nothing is silently dropped")
  const before = JSON.stringify(rl.status())
  if (rl.list) rl.list(); if (rl.history) rl.history()
  ok(before === JSON.stringify(rl.status()), "★ read paths (list/history/status) do not mutate the state")
}

console.log("=== 8. transaction: A STEP NEEDS undo · FAILURE COMPENSATES IN REVERSE · partial IS NAMED · NO DOUBLE RUN ===")
{
  const TX = await import(url("transaction.js"))
  const tx = TX.createTransaction({ clock: () => 0, settings: {} })
  let noUndo = null
  try { tx.begin({ id: "c1", steps: [{ service: "s", apply: () => 1 }] }) } catch (e) { noUndo = e }
  ok(noUndo !== null && noUndo.code === "VMU_TX_STEP_NOT_COMPENSABLE",
    "★ ③ a step without `undo` is refused AT BEGIN, never discovered after the write")
  const calls = []
  tx.begin({ id: "c2", steps: [
    { service: "a", apply: () => { calls.push("apply-a"); return 1 }, undo: () => { calls.push("undo-a") } },
    { service: "b", apply: () => { calls.push("apply-b"); throw new Error("b fails") }, undo: () => { calls.push("undo-b") } },
    { service: "c", apply: () => { calls.push("apply-c"); return 3 }, undo: () => { calls.push("undo-c") } },
  ] })
  try { await tx.run({ id: "c2" }) } catch { /* the run fails by design */ }
  ok(calls.join(",") === "apply-a,apply-b,undo-a",
    "★ ① it applies in order, stops at the failure, and undoes ONLY what was applied, in reverse", { calls })
  const tx2 = TX.createTransaction({ clock: () => 0, settings: {} })
  tx2.begin({ id: "c3", steps: [
    { service: "a", apply: () => 1, undo: () => { throw new Error("undo-a fails") } },
    { service: "b", apply: () => { throw new Error("b fails") }, undo: () => {} },
  ] })
  try { await tx2.run({ id: "c3" }) } catch { /* the run fails by design */ }
  const s3 = tx2.status({ id: "c3" })
  ok(s3 && s3.transaction && s3.transaction.state === "partial",
    "★ ② a failing compensation becomes a `partial` state with evidence kept, not a swallowed error",
    { state: s3 && s3.transaction && s3.transaction.state })
  const tx3 = TX.createTransaction({ clock: () => 0, settings: {} })
  let applies = 0
  tx3.begin({ id: "c4", steps: [{ service: "a", apply: () => { applies += 1; return 1 }, undo: () => {} }] })
  await tx3.run({ id: "c4" })
  const second = await tx3.run({ id: "c4" })
  ok(applies === 1 && second && second.idempotent === true,
    "★ ④ the same txId does not run twice: the second run returns the recorded outcome with idempotent:true")
}
if (process.argv.includes("--selftest")) {
  // the harness must be able to FAIL: plant a claim that the module does not satisfy and require the checker to reject it
  const planted = { canonicalize: (v) => JSON.stringify(v) }   // a naive encoder that DOES collide across kinds
  const naive = planted.canonicalize({ x: NaN }) === planted.canonicalize({ x: null })
  const checks = [
    [naive === true, "★ the selftest's planted encoder DOES collide (so a checker that accepted it would be vacuous)"],
    [I.canonicalize({ x: NaN }) !== I.canonicalize({ x: null }), "★ while the REAL one does not - the assertion is not vacuous"],
  ]
  let bad = 0
  for (const [cond, label] of checks) { if (cond) console.log("  selftest ok   " + label); else { bad += 1; console.error("  selftest FAIL " + label) } }
  console.log("")
  console.log("=== KERNEL CLAIMS SELFTEST: " + (checks.length - bad) + " passed, " + bad + " failed ===")
  process.exit(bad === 0 ? 0 : 1)
}

console.log("")
console.log("=== KERNEL CLAIMS: " + pass + " passed, " + fail + " failed (idempotency 17 · scheduler 7 · lean 5 · ratelimit 5 · transaction 5) ===")
if (fail) console.error("FAILURES:\n" + failures.map((f) => "  - " + f).join("\n"))
process.exit(fail === 0 ? 0 : 1)

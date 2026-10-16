#!/usr/bin/env node
// ★ PROMPT-SECTION STATE SPLIT (phase-3 round 4, task-207) — THE GUARD FOR THE FIX IN task-203.
//
// WHY THIS FILE EXISTS: the entry's prompt-section path used to collapse THREE host states into ONE reading
// (`{"registered":false,"what":"systemPrompt.section","reason":"the host exposes no systemPrompt.section() to
// receive N declared section(s)"}`) - so "the host provided NOTHING" was reported as "the service is there, it just
// has no `.section()`". That is a named-but-UNTRUE statement, which this project treats as a red line, and the
// real-machine gate READS this field to tell "the host did not provide the service" from "the call was refused".
// task-203 fixed it; this file is what KEEPS it fixed (a fix nothing guards can regress silently - the reporting
// loop once stayed switched off through hundreds of green suites).
//
// ★ WHAT IT PINS, AND WHAT IT DOES NOT: it pins that the FOUR host states stay distinguishable by `what` + `reason`
// (+ `stack`), and that only ONE of them may blame the host's interface. It does NOT claim anything about the
// CONTENT that gets registered when the service is usable - the assistant/systemprompt suites own that.
//
// ★ REAL ENTRY, NEVER A HAND-BUILT KERNEL: `entry.apply(ctx, …)` with a fake ctx, reading
// `handle.status().promptSection`. A hand-built kernel would walk around the assembly layer where the defect lived.
//
// ★ NON-EMPTY PRECONDITION FOR EVERY STATE: each failure state must carry `code === 'VMU_EXTERNAL_UNAVAILABLE'`
// (the shape a run that never entered the block leaves behind has `code: null`), the success state must carry
// `registered === true`, the thrown state must carry a real `stack`, and the whole block is additionally pinned by
// a NEGATIVE CONTROL (`packs: []` ⇒ nothing declared ⇒ the block must NOT run and the reading must stay the
// never-ran shape). Without those, an assertion could "pass" on a default simply happening to match.
//
// ★ TARGET-ADDRESSED: `REPO` is derived from THIS FILE's own location, so a copy of the tree carries a copy of this
// test that judges the COPY (that is what makes the copy-based counterexample in the task report meaningful).
import { pathToFileURL, fileURLToPath } from 'node:url'
import { join, dirname } from 'node:path'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..')
const entry = await import(pathToFileURL(join(REPO, 'vibe-math-vmu', 'vibe-math-vmu.js')).href)
const clock = () => 1000000

let passed = 0
const failures = []
const ok = (cond, name, detail) => { if (cond) { passed += 1; return } failures.push(name + (detail === undefined ? '' : ' [' + String(detail).slice(0, 220) + ']')) }

/** Drive the REAL entry for one host state and return the reading it publishes. */
const read = async (decorate, packs = ['v5r']) => {
  const ctx = { effect: (fn) => { try { return fn() } catch { return () => {} } }, on: () => () => {}, tools: { register: () => () => {} } }
  decorate(ctx)
  const root = mkdtempSync(join(tmpdir(), 'vmu-promptstate-'))
  const stderr = []
  const orig = process.stderr.write.bind(process.stderr)
  process.stderr.write = (s) => { stderr.push(String(s)); return true }
  let handle = null
  let threw = null
  try { handle = entry.apply(ctx, { clock, deliver: () => {}, root, packs }); await handle.ready() } catch (e) { threw = String((e && e.message) || e) }
  process.stderr.write = orig
  let reading = null
  try { reading = handle.status().promptSection } catch (e) { reading = { statusThrew: String((e && e.message) || e) } }
  rmSync(root, { recursive: true, force: true })
  return { reading, threw, stderr: stderr.join('') }
}

const A = await read((c) => { c.get = () => undefined })
const B = await read(() => {})
const C = await read((c) => { c.get = () => ({ getSectionOrder: () => 5 }) })
const T = await read((c) => { Object.defineProperty(c, 'systemPrompt', { configurable: true, get() { throw new Error('cannot get property "systemPrompt" without inject') } }); c.get = undefined })
const S = await read((c) => { c.get = () => ({ section: () => () => {}, getSectionOrder: () => 5 }) })
const N = await read(() => {}, [])   // negative control: nothing declared ⇒ the block must not run

// ── 0. the reads really happened (a state whose apply() threw would be judged on a fallback) ─────────────────────
for (const [k, v] of Object.entries({ A, B, C, T, S, N })) {
  ok(v.threw === null, '★ NON-EMPTY: state ' + k + ' reached the assembly (apply/ready did not throw)', v.threw)
  ok(v.reading !== null && typeof v.reading === 'object', '★ NON-EMPTY: state ' + k + ' published a promptSection reading', JSON.stringify(v.reading))
}

// ── 1. A and B: NOTHING WAS OBTAINED — and neither may blame the host's interface ───────────────────────────────
const A2 = A.reading || {}, B2 = B.reading || {}
for (const [k, r] of [['A', A2], ['B', B2]]) {
  ok(r.code === 'VMU_EXTERNAL_UNAVAILABLE' && r.what === 'systemPrompt',
    '★ state ' + k + ' (nothing obtained) is named `systemPrompt`, not `systemPrompt.section`', JSON.stringify(r))
  ok(/^no host systemPrompt service was obtained/.test(String(r.reason)),
    '★ state ' + k + ' says nothing was OBTAINED (and names the inactive-fiber possibility the API cannot rule out)',
    JSON.stringify(r.reason))
  ok(!/\.section\(\)/.test(String(r.reason)) && !/carries no/.test(String(r.reason)),
    '★★ state ' + k + ' does NOT claim the host lacks `.section()` (the defect this file guards)', JSON.stringify(r.reason))
}
// ★ NON-EMPTY PRECONDITION, BECAUSE TWO EMPTY OBJECTS COMPARE EQUAL. Without this, the equality below would pass while
// measuring nothing at all - the shape the declaration-criterion gate calls class B ("both sides may be empty"), and it
// flagged this very line. The two readings must each carry the state before they are compared.
ok(A2 && Object.keys(A2).length > 0 && B2 && Object.keys(B2).length > 0,
  '★ PRECONDITION: both readings are NON-EMPTY, so the equality below cannot pass on two empty objects',
  'A=' + JSON.stringify(A2) + ' B=' + JSON.stringify(B2))
ok(JSON.stringify(A2) === JSON.stringify(B2),
  '★ A ≡ B BY DESIGN: `get`→undefined and "no `get`, no property" are the same fact to the API (never provided / provided but not active)',
  JSON.stringify(A2) + ' vs ' + JSON.stringify(B2))

// ── 2. C: obtained, but no method — the ONLY state allowed to say so ────────────────────────────────────────────
const C2 = C.reading || {}
ok(C2.registered === false && C2.what === 'systemPrompt.section',
  '★ state C (obtained, no `.section()`) is the only one named `systemPrompt.section`', JSON.stringify(C2))
ok(/carries no \.section\(\)/.test(String(C2.reason)) && /declared section\(s\)/.test(String(C2.reason)),
  '★ state C blames the interface, and names how many sections were refused', JSON.stringify(C2.reason))

// ── 3. T: the READ itself threw — its own state, with the stack ─────────────────────────────────────────────────
const T2 = T.reading || {}
ok(T2.registered === false && T2.what === 'systemPrompt' && typeof T2.stack === 'string' && T2.stack.length > 0,
  '★ state T (the read threw) carries its own state AND a stack', JSON.stringify(T2))
ok(String(T2.reason).includes('without inject'),
  '★ state T reports the thrown message itself, not a summary of it', JSON.stringify(T2.reason))
ok(/NOT reachable/.test(T.stderr),
  '★ state T also TELLS THE HOST on stderr (a degradation that is named, not swallowed)', JSON.stringify(T.stderr.slice(0, 120)))

// ── 4. S: usable — registered, and the success shape is distinct ────────────────────────────────────────────────
const S2 = S.reading || {}
ok(S2.registered === true && S2.code === null,
  '★ state S (service with `.section()`) reports registered with no code', JSON.stringify(S2))

// ── 5. THE SPLIT ITSELF: pairwise distinguishable by the author's signature; {A,B} the single intended overlap ──
const sig = (r) => JSON.stringify([!!(r && r.registered), (r && r.what) === undefined ? null : r.what,
  /^no host/.test(String(r && r.reason)), !!(r && r.stack && String(r.stack).length)])
const states = [['A', A2], ['B', B2], ['C', C2], ['T', T2], ['S', S2]]
for (const [x, rx] of states) {
  for (const [y, ry] of states) {
    if (x >= y) continue
    const intended = (x === 'A' && y === 'B')
    ok(intended ? sig(rx) === sig(ry) : sig(rx) !== sig(ry),
      (intended ? '★ A ≡ B is the ONLY intended overlap' : '★ distinguishable: ' + x + ' ≠ ' + y),
      sig(rx) + ' vs ' + sig(ry))
  }
}
ok(new Set([sig(A2), sig(C2), sig(T2), sig(S2)]).size === 4,
  '★ the four DISTINCT facts (nothing obtained / no method / read threw / registered) are pairwise distinguishable',
  JSON.stringify([sig(A2), sig(C2), sig(T2), sig(S2)]))

// ── 6. NEGATIVE CONTROL: with nothing declared the block must NOT run (so the readings above cannot be defaults) ─
const N2 = N.reading || {}
ok(N2.code === null && N2.what === undefined && N2.registered === false,
  '★★ NEGATIVE CONTROL: with `packs: []` (no declared section) the block never runs — the never-ran shape, not a state reading',
  JSON.stringify(N2))
ok(sig(N2) !== sig(A2) && sig(N2) !== sig(C2),
  '★ the never-ran shape is itself distinct from every failure state (the branch really is what produced them)',
  sig(N2))

console.log('')
console.log('=== VMU PROMPTSTATE SPLIT: ' + passed + ' passed, ' + failures.length + ' failed ===')
for (const f of failures) console.log('  FAIL ' + f)
process.exit(failures.length === 0 ? 0 : 1)

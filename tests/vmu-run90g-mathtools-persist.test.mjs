#!/usr/bin/env node
// RUN 90g — a math run must never be able to take the host down, and `vmu.math.jobs.persist` must mean the MIRROR.
//
// MEASURED (clean-room run 90g, the first run where `vibe_vmu_mathtools {action:"run"}` got past publication):
//   | dsh: fatal load failure: Error: unknown record kind: math-run
//   |     at fingerprint (kernel/library.js:146)
//   |     at Object.append (kernel/library.js:349)
//   |     at Object.run (kernel/mathtools.js:781)
// The receipt archiver called the CARD library with `kind:'math-run'`; the library's three kinds are
// proposition/method/subproblem, so it refused — and because the (async) append was not awaited, the rejection
// escaped the try/catch as an UNHANDLED REJECTION that killed the whole profile load. Two defects in one line:
// the wrong seam, and a seam call that could escape.
//
// WHAT THIS SUITE PROVES: (1) `persist:false` touches no seam and says so; (2) `persist:true` writes the
// Math/Jobs MIRROR and reports `persisted:true`; (3) an absent mirror is a COUNTED, named outcome, not a lie and
// not a throw; (4) a rejecting seam is caught, counted, and the run still returns ok:true (no escaping rejection);
// (5) the card library is never asked for a `math-run` record.
import { pathToFileURL } from 'node:url'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..')
const { createMathTools } = await import(pathToFileURL(join(REPO, 'vibe-math-vmu', 'kernel', 'mathtools.js')).href)

let passed = 0
let failed = 0
const ok = (cond, label, detail) => {
  if (cond) { passed++; console.log('  ok   ' + label); return true }
  failed++
  console.error('  FAIL ' + label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  return false
}

const seam = () => async () => ({ ok: true, result: { value: 1 } })

// ── §1 persist:false ⇒ no seam is touched and the receipt says the detail was not kept ──────────────
{
  const writes = []
  const jobs = { write: async (rel, body) => { writes.push({ rel, body }); return { ok: true } } }
  const t = createMathTools({ clock: () => 1000, settings: {}, spawn: seam(), jobs })
  const out = await t.run({ op: 'numeric', args: { expr: '1+1' } })
  ok(out && out.ok === true, 'the run itself succeeds', out && out.ok)
  ok(out.receipt.persisted === undefined || out.receipt.persisted === false, 'persist:false is not announced as persisted', out.receipt.persisted)
  ok(writes.length === 0, 'and the mirror seam was never touched', writes.length)
}

// ── §2 persist:true ⇒ the Math/Jobs mirror is written, and the receipt says so ───────────────────────
{
  const writes = []
  const jobs = { write: async (rel, body) => { writes.push({ rel, body }); return { ok: true, rel } } }
  const t = createMathTools({ clock: () => 1000, settings: { 'vmu.math.jobs.persist': true }, spawn: seam(), jobs })
  const out = await t.run({ op: 'numeric', args: { expr: '1+1' } })
  ok(out && out.ok === true, 'the run succeeds', out && out.ok)
  ok(out.receipt.persisted === true, 'the receipt says it WAS persisted', out.receipt && out.receipt.persisted)
  ok(/Math\/Jobs/.test(String(out.receipt.persistedVia)), 'and names the mirror it went to', out.receipt.persistedVia)
  ok(writes.length === 1, 'exactly one mirror write happened', writes.length)
  ok(writes[0] && /^run-/.test(writes[0].rel), 'the mirror row is named `run-<cacheKey>`', writes[0] && writes[0].rel)
  const body = writes[0] ? JSON.parse(writes[0].body) : null
  ok(body && body.op === 'numeric' && body.receipt, 'the mirror row carries the op and the receipt', body && Object.keys(body))
}

// ── §3 no mirror ⇒ counted and NAMED, never a lie and never a throw ──────────────────────────────────
{
  const t = createMathTools({ clock: () => 1000, settings: { 'vmu.math.jobs.persist': true }, spawn: seam() })
  const out = await t.run({ op: 'numeric', args: { expr: '1+1' } })
  ok(out && out.ok === true, 'the run still succeeds without a mirror', out && out.ok)
  ok(out.receipt.persisted === false, 'persisted:false — not "written"', out.receipt && out.receipt.persisted)
  ok(out.receipt.persistCode === 'VMU_MATH_JOBS_MIRROR_UNWIRED', 'the reason is NAMED', out.receipt && out.receipt.persistCode)
  ok(/not a computation failure/.test(String(out.receipt.persistMeans)), 'the reading separates "not durable" from "did not run"', out.receipt && out.receipt.persistMeans)
  const st = t.status ? t.status() : null
  if (st && st.counters) ok(st.counters.persistUnwired >= 1, 'the counter records the unwired mirror', st.counters)
}

// ── §4 a REJECTING mirror seam is caught, counted, and cannot escape ─────────────────────────────────
{
  const jobs = { write: async () => { const e = new Error('disk full'); e.code = 'VMU_STORE_FAILED'; throw e } }
  const t = createMathTools({ clock: () => 1000, settings: { 'vmu.math.jobs.persist': true }, spawn: seam(), jobs })
  let out = null
  let escaped = null
  try { out = await t.run({ op: 'numeric', args: { expr: '1+1' } }) } catch (e) { escaped = e }
  ok(escaped === null, 'the rejection did NOT escape the tool call (this is the defect that killed the host)', escaped && escaped.message)
  ok(out && out.ok === true, 'and the computation is still a success', out && out.ok)
  ok(out && out.receipt.persisted === false, 'the receipt does not claim the mirror was written', out && out.receipt && out.receipt.persisted)
  ok(out && out.receipt.persistCode === 'VMU_STORE_FAILED', 'the seam refusal code is carried through', out && out.receipt && out.receipt.persistCode)
}

// ── §5 the CARD library is never asked for a `math-run` record ───────────────────────────────────────
{
  const appended = []
  const library = { append: async (rec) => { appended.push(rec); return { ok: true } } }
  const t = createMathTools({ clock: () => 1000, settings: { 'vmu.math.jobs.persist': true }, spawn: seam(), library })
  const out = await t.run({ op: 'numeric', args: { expr: '1+1' } })
  ok(out && out.ok === true, 'the run succeeds', out && out.ok)
  ok(appended.length === 0, 'the CARD library was not touched at all (a math run is not a card)', appended)
  ok(!appended.some((r) => r && r.kind === 'math-run'), 'and no `math-run` record was ever proposed to it', appended.map((r) => r && r.kind))
}

console.log('\n=== RUN 90G MAT HTOOLS PERSIST: ' + passed + ' passed, ' + failed + ' failed ===')
process.exit(failed === 0 ? 0 : 1)

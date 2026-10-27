#!/usr/bin/env node
// vmu RUN 51 — A CALLER THIS KERNEL CANNOT IDENTIFY IS NOT THE OFFICE, AND A LEDGER READ BY A KERNEL BOOTED EARLIER
// MUST NOT CALL A LIVE REQUEST UNKNOWN.
//
// THE OBSERVED DEFECTS (live run 51, the member's own report; F-35/F-36):
//   F-35  an approval opened in the office's kernel answered `VMU_INVALID_ARGUMENT "unknown approval: rq-r51"` in a
//         kernel that had booted EARLIER (a member's own session) - the fold held the request, the reader's copy did not,
//         and the read verbs never refreshed. (Reproduced in tests/_probe before the fix: same sentence, same request.)
//   F-36  a member calling `decide` with NO `by` was attributed to `office`: `resolveTurnMember` answers null for both the
//         root session AND a non-root agent whose session this kernel never learned, and the gate read that null as
//         "office". A member could therefore approve in the office's name inside its own kernel.
//
// WHAT THIS SUITE PROVES: (1) a kernel booted before the open still reads the request, and reads the DECISION after it;
// (2) a non-root, unresolvable caller is refused by name (VMU_HUMAN_CALLER_UNKNOWN) and nothing is decided;
// (3) the root caller is still the office; (4) a non-root caller that IS a learned roster member keeps its seat role.
import { mkdtemp, rm } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..')
const ENTRY = join(REPO, 'vibe-math-vmu', 'vibe-math-vmu.js')

let passed = 0
let failed = 0
const failures = []
const ok = (cond, label, detail) => {
  if (cond) { passed++; console.log('  ok   ' + label); return true }
  failed++; failures.push(label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  console.error('  FAIL ' + label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  return false
}
const entry = await import(pathToFileURL(ENTRY).href)
const boot = async (config = {}) => {
  const state = { specs: [] }
  const ctx = { effect(fn) { return fn() }, on() { return () => {} }, tools: { register: async (spec) => { state.specs.push(spec); return () => {} } } }
  const handle = entry.apply(ctx, Object.assign({ asleep: true, packs: ['v5r'] }, config))
  await handle.ready()
  return { handle, specOf: (n) => state.specs.find((s) => s.name === n) }
}
const call = async (b, name, args = {}, exec = {}) => {
  const spec = b.specOf(name)
  if (!spec) return { missing: true }
  let raw
  try { raw = await spec.execute(args, exec) } catch (e) {
    return { thrown: true, code: e && e.code, message: e && e.message, hint: e && e.hint }
  }
  try { return JSON.parse(raw) } catch { return { raw } }
}
// The human ledger's write-through is FIRE-AND-FORGET by declaration (`vmu.resume.writeThrough`): a mutation returns
// before the state write settles, so a reader in another kernel may need one tick. Poll instead of assuming, and let the
// assertion be about the eventual, durable answer.
const waitFor = async (fn, ms = 1500) => {
  const until = Date.now() + ms
  let last = null
  do { last = await fn(); if (last && last.ok === true) return last; await new Promise((r) => setTimeout(r, 25)) } while (Date.now() < until)
  return last
}
const root = await mkdtemp(join('D:/_tmp', 'vmu-run51-human-caller-'))
try {
  // ── 1. F-35: a kernel booted BEFORE the open must read the request, then the decision ───────────────────────────
  const a = await boot({ root })
  const b = await boot({ root })                       // boots before the request exists
  await call(a, 'vibe_v5_start', { problem: '人审读面复验', researcherCount: 2 })
  const opened = await call(a, 'vibe_vmu_human', { action: 'openApproval', by: 'r-acad', requestId: 'rq-f35', subject: '待批' })
  ok(opened && opened.ok === true, 'the office opened rq-f35', opened && opened.code)
  const readB = await waitFor(async () => await call(b, 'vibe_vmu_human', { action: 'approvalState', request_id: 'rq-f35' }))
  ok(readB && readB.ok === true, 'a kernel booted EARLIER reads the request (read refreshed the fold)', readB)
  ok(readB && readB.state === 'pending', 'the earlier kernel sees it pending', readB && readB.state)
  const decided = await call(a, 'vibe_vmu_human', { action: 'decide', request_id: 'rq-f35', allow: true })
  ok(decided && decided.ok === true, 'the root caller decides it', decided && decided.code)
  const readB2 = await waitFor(async () => {
    const r = await call(b, 'vibe_vmu_human', { action: 'approvalState', request_id: 'rq-f35' })
    return r && String(r.state) === 'allowed' ? r : null
  })
  ok(readB2 && readB2.ok === true, 'the earlier kernel reads the decision too', readB2)
  ok(readB2 && String(readB2.state) === 'allowed', 'the earlier kernel sees allowed, not pending', readB2 && readB2.state)
  ok(readB2 && readB2.decidedBy === 'office', 'the decision is attributed to office', readB2 && readB2.decidedBy)

  // ── 5. F-35b (run 52's member report): the ADOPTING kernel must say where the act happened ───────────────────
  ok(readB2 && readB2.decidedByMeans === 'read-from-shared-ledger', 'the adopting kernel says the decision was read from the shared ledger', readB2 && readB2.decidedByMeans)
  ok(readB2 && readB2.decidedInThisKernel === false, 'it does not claim the act happened in this kernel', readB2 && readB2.decidedInThisKernel)
  ok(readB2 && String(readB2.decidedByMeansMeans || '').indexOf('another kernel') !== -1, 'the sentence names the other kernel and the missing audit line', readB2 && readB2.decidedByMeansMeans)
  ok(readB2 && readB2.adoptedFromSharedLedgerAt !== null && readB2.adoptedFromSharedLedgerAt !== undefined, 'it reports when this kernel adopted the row', readB2 && readB2.adoptedFromSharedLedgerAt)
  const readA = await call(a, 'vibe_vmu_human', { action: 'approvalState', request_id: 'rq-f35' })
  ok(readA && readA.decidedByMeans === 'self', 'the DECIDING kernel still reports self (unchanged)', readA && readA.decidedByMeans)
  ok(readA && readA.decidedInThisKernel === true, 'the deciding kernel says the act happened here', readA && readA.decidedInThisKernel)

  // ── 2. F-36: a non-root caller this kernel cannot resolve is NOT the office ───────────────────────────────────
  const opened2 = await call(a, 'vibe_vmu_human', { action: 'openApproval', by: 'r-acad', requestId: 'rq-f36', subject: '待批2' })
  ok(opened2 && opened2.ok === true, 'the office opened rq-f36', opened2 && opened2.code)
  const stranger = { agent: { id: '4f2c9a10-unknown-agent' } }
  const refused = await call(a, 'vibe_vmu_human', { action: 'decide', request_id: 'rq-f36', allow: true }, stranger)
  ok(refused && refused.ok === false, 'an unresolvable non-root caller is refused (does not decide)', refused)
  ok(refused && refused.code === 'VMU_HUMAN_CALLER_UNKNOWN', 'the refusal is named VMU_HUMAN_CALLER_UNKNOWN', refused && refused.code)
  ok(refused && String(refused.message).indexOf('4f2c9a10-unknown-agent') !== -1, 'the message names the caller id', refused && refused.message)
  ok(refused && String(refused.hint).indexOf('office (root)') !== -1, 'the hint says where the decision belongs', refused && refused.hint)
  const stillPending = await call(a, 'vibe_vmu_human', { action: 'approvalState', request_id: 'rq-f36' })
  ok(stillPending && stillPending.state === 'pending', 'the refusal changed nothing (still pending)', stillPending && stillPending.state)

  // ── 3. the ROOT caller is still the office ────────────────────────────────────────────────────────────────────
  const rootDecide = await call(a, 'vibe_vmu_human', { action: 'decide', request_id: 'rq-f36', allow: true }, { agent: { id: 'session-abc' } })
  ok(rootDecide && rootDecide.ok === true, 'a session-shaped (root) caller still decides', rootDecide && rootDecide.code)
  ok(rootDecide && rootDecide.decidedBy === 'office', 'the root decision is attributed to office', rootDecide && rootDecide.decidedBy)

  // ── 4. a non-root caller that IS a learned roster member keeps its seat role ──────────────────────────────────
  const opened3 = await call(a, 'vibe_vmu_human', { action: 'openApproval', by: 'r-acad', requestId: 'rq-chair', subject: '待批3' })
  ok(opened3 && opened3.ok === true, 'the office opened rq-chair', opened3 && opened3.code)
  const chairExec = { agent: { id: 'r-acad' } }
  const chairRefused = await call(a, 'vibe_vmu_human', { action: 'decide', request_id: 'rq-chair', allow: true }, chairExec)
  ok(chairRefused && chairRefused.ok === false, 'the chair (not a declared approver) is refused by the ROLE code', chairRefused)
  ok(chairRefused && chairRefused.code === 'VMU_HUMAN_DECIDER_ROLE', 'the refusal keeps the role code for a seated member', chairRefused && chairRefused.code)
} finally {
  await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
}
console.log('')
if (failed === 0) console.log('=== VMU RUN 51 HUMAN CALLER: ' + passed + ' passed, 0 failed ===')
else { console.log('=== VMU RUN 51 HUMAN CALLER: ' + passed + ' passed, ' + failed + ' failed ==='); for (const f of failures) console.log('  - ' + f); process.exitCode = 1 }

// tests/vmu-a2-report-transport.test.mjs — AUDIT A2, PART 3: the report must actually LEAVE the process.
//
// WHAT WAS MISSING (audit A2, measured in r126): the kernel emits `event:'progress'` (step 1), the v5r manifest
// declares `v5r-progress-notice` (step 2) — and every firing still carried `VMU_REPORT_NO_TRANSPORT`, because a
// shipped deployment never supplied `config.deliver`. "Honest, but only half": the office was never woken.
//
// WHAT THIS SUITE PROVES:
//   · §1 the transport REFUSES by name in the two positions where it cannot work (no getKernel, no mailbox), instead
//     of answering "delivered";
//   · §2 a real boot (real plugin, real v5r pack) turns a progress row into a durable MAIL ROW in the office seat's
//     mailbox — `delivered` in the report receipt means "queued", which is the only thing a durable queue can promise;
//   · §3 the office seat is resolved from the roster and its absence is a named refusal (no invented recipient);
//   · §4 an explicitly named recipient is honoured (and `office` can be combined with it);
//   · §5 the transport is DECLARED (`vmu.report.transport`): undeclared, the receipt keeps `VMU_REPORT_NO_TRANSPORT`,
//     so "no transport" stays distinguishable from "queued".
//
// Run: node tests/vmu-a2-report-transport.test.mjs
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'
import { createMailboxReportTransport } from '../vibe-math-vmu/kernel/reporttransport.js'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const PKG_ROOT = path.resolve(HERE, '..')
const ENTRY = pathToFileURL(path.join(PKG_ROOT, 'vibe-math-vmu', 'vibe-math-vmu.js')).href

let passed = 0
const failures = []
const ok = (cond, msg, detail) => {
  if (cond) { passed++; console.log('  ok   ' + msg); return true }
  failures.push(msg); console.log('  FAIL ' + msg + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  return false
}
const throwsCode = (fn, code) => {
  try { fn(); return { threw: false } } catch (e) { return { threw: true, code: e && e.code, message: e && e.message } }
}

const boot = async ({ root, vmu = {} } = {}) => {
  const entry = await import(ENTRY)
  const ctx = { effect: (fn) => fn(), on: () => () => {}, get: () => undefined, tools: { register: async () => () => {} } }
  let t = 1_000
  const handle = entry.apply(ctx, { clock: () => (t += 1_000), packs: ['v5r'], root, vmu })
  await handle.ready()
  return { kernel: handle.kernel, ticks: () => t }
}
const mails = (kernel, member) => {
  const rows = kernel.mailbox.pending(member)
  return Array.isArray(rows) ? rows : []
}

// ─── §1 the two positions where the transport cannot work are REFUSALS, not silent drops ─────────────────
console.log('=== 1. NO KERNEL / NO MAILBOX => A NAMED REFUSAL, NEVER "DELIVERED" ===')
{
  const missing = throwsCode(() => createMailboxReportTransport({}), 'VMU_INVALID_ARGUMENT')
  ok(missing.threw === true && missing.code === 'VMU_INVALID_ARGUMENT', 'constructing without getKernel is refused by name', missing)

  const t1 = createMailboxReportTransport({ getKernel: () => null })
  const r1 = throwsCode(() => t1({ id: 'rep-1', name: 'n', to: ['office'], text: 'x' }))
  ok(r1.threw === true && r1.code === 'VMU_REPORT_NO_TRANSPORT', 'a kernel that does not exist yet => VMU_REPORT_NO_TRANSPORT', r1)
  ok(r1.threw === true && /nothing was sent/.test(String(r1.message)), 'the refusal says nothing was sent', r1)

  const t2 = createMailboxReportTransport({ getKernel: () => ({ members: { roster: () => [] } }) })
  const r2 = throwsCode(() => t2({ id: 'rep-2', name: 'n', to: ['office'], text: 'x' }))
  ok(r2.threw === true && r2.code === 'VMU_REPORT_NO_TRANSPORT', 'a kernel without a mailbox face => VMU_REPORT_NO_TRANSPORT', r2)
  ok(typeof t2.transportMeans === 'string' && /durably queued/.test(t2.transportMeans), 'the transport discloses what "delivered" means', t2.transportMeans)
}

// ─── §2 a real boot: a progress row becomes a durable mail row in the office inbox ──────────────────────
console.log('=== 2. A PROGRESS ROW BECOMES A MAIL ROW FOR THE OFFICE SEAT (real plugin, real v5r pack) ===')
{
  const root = mkdtempSync(path.join(tmpdir(), 'vmu-a2t-'))
  try {
    const { kernel } = await boot({ root, vmu: { report: { transport: 'mailbox' } } })
    await kernel.members.hire({ id: 'r-acad', slot: 'chair' })
    await kernel.members.hire({ id: 'r-1', slot: 'member' })
    ok(kernel.report.status().transportInjected === true, 'the assembled kernel reports a transport seam', kernel.report.status().transportInjected)
    const before = mails(kernel, 'r-acad').length
    const receipts = []
    const orig = kernel.report.tick.bind(kernel.report)
    kernel.report.tick = (a) => { const r = orig(a); receipts.push(r); return r }
    const put = kernel.records.put({ track: 'progress', kind: 'progress', title: 'r126 transport', body: 'the office must hear this', settled: true })
    ok(put.ok === true, 'the progress row was committed', put && put.id)
    const last = receipts[receipts.length - 1]
    const fired = last && Array.isArray(last.fired) ? last.fired : []
    ok(fired.length >= 1, 'the declared progress listener fired', { fired: fired.map((f) => (f && f.name) || f) })
    ok(JSON.stringify(fired).includes('v5r-progress-notice'), 'the firing is the v5r progress notice', fired)
    const rows = mails(kernel, 'r-acad')
    ok(rows.length === before + 1, 'the office seat received exactly one new mail row', { before, after: rows.length })
    const row = rows[rows.length - 1]
    ok(row && row.from === 'report', 'the mail row names the report as its sender', row && row.from)
    ok(row && row.kind === 'notice', 'it is a notice, not an urgent wake', row && row.kind)
    ok(row && /progress/.test(String(row.text)), 'the body is the rendered report text', row && row.text)
    ok(mails(kernel, 'r-1').length === 0, 'the member seat got nothing: the notice is addressed to the office', mails(kernel, 'r-1').length)
  } finally { rmSync(root, { recursive: true, force: true }) }
}

// ─── §3 the office seat is resolved from the roster; its absence is named ───────────────────────────────
console.log('=== 3. NO OFFICE SEAT => VMU_MAILBOX_NO_SUCH_RECIPIENT (no invented recipient) ===')
{
  const root = mkdtempSync(path.join(tmpdir(), 'vmu-a2u-'))
  try {
    const { kernel } = await boot({ root, vmu: { report: { transport: 'mailbox' } } })
    await kernel.members.hire({ id: 'r-1', slot: 'member' })
    const t = createMailboxReportTransport({ getKernel: () => kernel })
    const r = throwsCode(() => t({ id: 'rep-3', name: 'n', to: ['office'], text: 'x' }))
    ok(r.threw === true && r.code === 'VMU_MAILBOX_NO_SUCH_RECIPIENT', 'a report for the office with no office seat is refused by name', r)
    ok(r.threw === true && /office seat/.test(String(r.message)), 'the refusal names the missing seat', r.message)
    ok(mails(kernel, 'r-1').length === 0, 'nobody else was used as a fallback recipient', mails(kernel, 'r-1').length)
  } finally { rmSync(root, { recursive: true, force: true }) }
}

// ─── §4 a named recipient is honoured, and `office` can ride along ──────────────────────────────────────
console.log('=== 4. NAMED RECIPIENTS ARE HONOURED (and combinable with office) ===')
{
  const root = mkdtempSync(path.join(tmpdir(), 'vmu-a2v-'))
  try {
    const { kernel } = await boot({ root, vmu: { report: { transport: 'mailbox' } } })
    await kernel.members.hire({ id: 'r-acad', slot: 'chair' })
    await kernel.members.hire({ id: 'r-1', slot: 'member' })
    const t = createMailboxReportTransport({ getKernel: () => kernel })
    t({ id: 'rep-4', name: 'to-member', to: ['r-1'], text: 'only the member' })
    ok(mails(kernel, 'r-1').length === 1 && mails(kernel, 'r-acad').length === 0, 'to:["r-1"] reaches only that seat', { m: mails(kernel, 'r-1').length, c: mails(kernel, 'r-acad').length })
    t({ id: 'rep-5', name: 'to-both', to: ['office', 'r-1'], text: 'both' })
    ok(mails(kernel, 'r-1').length === 2 && mails(kernel, 'r-acad').length === 1, 'to:["office","r-1"] reaches both seats', { m: mails(kernel, 'r-1').length, c: mails(kernel, 'r-acad').length })
  } finally { rmSync(root, { recursive: true, force: true }) }
}

// ─── §5 the transport is DECLARED: undeclared keeps the named refusal ───────────────────────────────────
console.log('=== 5. UNDECLARED TRANSPORT KEEPS VMU_REPORT_NO_TRANSPORT (a distinguishable state) ===')
{
  const root = mkdtempSync(path.join(tmpdir(), 'vmu-a2w-'))
  try {
    const { kernel } = await boot({ root, vmu: { report: { transport: '' } } })
    await kernel.members.hire({ id: 'r-acad', slot: 'chair' })
    ok(kernel.report.status().transportInjected === false, 'with the transport undeclared the seam is absent', kernel.report.status().transportInjected)
    const receipts = []
    const orig = kernel.report.tick.bind(kernel.report)
    kernel.report.tick = (a) => { const r = orig(a); receipts.push(r); return r }
    kernel.records.put({ track: 'progress', kind: 'progress', title: 'no transport', body: 'nobody is listening but the report still fired', settled: true })
    const last = receipts[receipts.length - 1]
    const fired = last && Array.isArray(last.fired) ? last.fired : []
    ok(fired.length >= 1, 'the listener still fires (the report is a fact even without a transport)', fired.length)
    ok(JSON.stringify(fired).includes('VMU_REPORT_NO_TRANSPORT'), 'the receipt carries the named refusal', fired)
    ok(mails(kernel, 'r-acad').length === 0, 'and nothing was queued in the office inbox', mails(kernel, 'r-acad').length)
  } finally { rmSync(root, { recursive: true, force: true }) }
}

console.log('\n' + (failures.length === 0 ? 'ALL GREEN — ' + passed + ' assertion(s)' : passed + ' passed / ' + failures.length + ' FAILED'))
if (failures.length) process.exitCode = 1

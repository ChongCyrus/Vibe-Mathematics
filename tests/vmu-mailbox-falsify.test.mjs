// tests/vmu-mailbox-falsify.test.mjs — FAMILY 1 of the falsify routine: `kernel/mailbox.js` (ack only AFTER a
// successful delivery). Run: node tests/vmu-mailbox-falsify.test.mjs
//
// THE RECIPE (30 lines, see `_handoff/vmu/activity-round5-report.md` for the general form):
//   1. import the shared library and the module under test;
//   2. write ONE probe that returns a JSON-able reading of the invariant (here: what is still pending after a
//      FAILING transport, and what is acked after a GOOD one — the good direction keeps the probe non-vacuous);
//   3. list single-point mutations (`find`/`replace` on the real source, each anchor occurring exactly once);
//   4. call `falsifyFamily({...})` and assert `family.ok` + the named red readings.
// The library supplies the control group (the unmutated module must pass the probe), the anchor/applicability guards,
// the temp-dir safety, and the cleanup; the family file only states the invariant and the defect.
import { falsifyFamily, formatFamilyReport } from './_lib/falsify.mjs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))
const MAILBOX = join(HERE, '..', 'vibe-math-vmu', 'kernel', 'mailbox.js')

let passed = 0
let failed = 0
const failures = []
const ok = (cond, label, detail) => {
  if (cond) { passed++; console.log('  ok   ' + label); return true }
  failed++; failures.push(label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  console.error('  FAIL ' + label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  return false
}

/**
 * THE PROBE. `kernel/mailbox.js` promises: "Deliver, then acknowledge — IN THAT ORDER. A transport that fails
 * (returns false or throws) acks NOTHING". The reading has both directions and NEVER lets one direction abort the
 * others (each is wrapped), so a mutant that throws on the success path is still a READING, not a probe crash:
 *   · goodAcked/goodPending/goodError — a GOOD transport really acks (so "pending" below is not vacuous);
 *   · refusedPending/throwPending — a refusing/throwing transport leaves EVERY entry pending;
 *   · anchorCode — the refused mail is still quotable (its body was not dropped).
 */
async function mailboxProbe(mod) {
  const mk = () => mod.createMailbox({ clock: () => 1000, log: () => {}, settings: {}, bus: null, deliver: async () => true })
  const attempt = async (send) => {
    const m = mk()
    m.send('m1', { to: 'm2', text: 'hello' })
    try { return { flush: await m.flush('m2', send ? { send } : undefined), m } } catch (e) { return { error: (e && e.code) || String((e && e.message) || e), m } }
  }
  const good = await attempt(null)
  const refused = await attempt(async () => false)
  const threw = await attempt(async () => { throw new Error('transport down') })
  const pendingOf = (x) => x.m.pending('m2').length
  const live = refused.m.pending('m2')
  let anchorCode = null
  try { refused.m.anchor(live[0].id) } catch (e) { anchorCode = (e && e.code) || String((e && e.message) || e) }
  return {
    goodAcked: good.flush ? good.flush.acked.length : null, goodPending: pendingOf(good), goodError: good.error || null,
    refusedCode: refused.flush ? (refused.flush.code || null) : null, refusedError: refused.error || null, refusedPending: pendingOf(refused),
    throwCode: threw.flush ? (threw.flush.code || null) : null, throwError: threw.error || null, throwPending: pendingOf(threw),
    anchorCode,
  }
}

const family = await falsifyFamily({
  name: 'mailbox — ack only after a successful delivery',
  cases: [{
    name: 'mailbox.js',
    module: MAILBOX,
    probe: mailboxProbe,
    mutations: [
      { label: 'ack BEFORE the delivery attempt', name: 'mailbox-ack-first',
        find: '      let result\n      try {\n        result = await tx(envelope)\n',
        replace: '      let result\n      mailbox.ack(id, entries.map((e) => e.id))   // MUTANT: ack before the transport ran\n      try {\n        result = await tx(envelope)\n' },
      { label: 'ack ON the transport-refused branch', name: 'mailbox-ack-refused',
        find: "      if (result === false || (result && result.ok === false)) {\n        note('VMU_MAILBOX_DELIVERY_FAILED')\n",
        replace: "      if (result === false || (result && result.ok === false)) {\n        mailbox.ack(id, entries.map((e) => e.id))   // MUTANT: ack although nothing was delivered\n        note('VMU_MAILBOX_DELIVERY_FAILED')\n" },
    ],
  }],
})

console.log('=== CONTROL GROUP: the unmutated module satisfies the invariant ===')
ok(family.cases[0].real.goodAcked === 1 && family.cases[0].real.goodPending === 0,
  'a GOOD transport acks the entry (the control direction, so "pending" below is a real reading)', family.cases[0].real)
ok(family.cases[0].real.refusedPending === 1 && family.cases[0].real.throwPending === 1,
  '★ a refusing AND a throwing transport both leave the entry pending', family.cases[0].real)
ok(family.cases[0].real.refusedCode === 'VMU_MAILBOX_DELIVERY_FAILED' && family.cases[0].real.throwCode === 'VMU_MAILBOX_DELIVERY_FAILED',
  'and both are NAMED refusals', { refused: family.cases[0].real.refusedCode, threw: family.cases[0].real.throwCode })
ok(family.cases[0].real.anchorCode === null || family.cases[0].real.anchorCode === 'VMU_NO_SUCH_OBJECT',
  'the refused mail is still live/quotable (its body was NOT dropped)', family.cases[0].real.anchorCode)

console.log('=== FALSIFICATION: remove the ordering and the SAME probe goes red ===')
ok(family.ok, '★ every mutation of the mailbox family is caught (control green + each mutant red)', formatFamilyReport(family))
const byLabel = (needle) => family.results.find((r) => r.label.includes(needle))
ok(!!byLabel('ack BEFORE') && byLabel('ack BEFORE').red.refusedPending === 0 && byLabel('ack BEFORE').red.throwPending === 0,
  '★ "ack before delivery": a FAILED delivery now acks everything (refusedPending/throwPending both 0)', byLabel('ack BEFORE') && byLabel('ack BEFORE').red)
ok(!!byLabel('ack BEFORE') && byLabel('ack BEFORE').red.goodError === 'VMU_MAILBOX_ACK_UNKNOWN',
  '★ and the later LEGITIMATE ack is then refused as a double ack (the defect is named, not silent)', byLabel('ack BEFORE') && byLabel('ack BEFORE').red.goodError)
ok(!!byLabel('ack ON') && byLabel('ack ON').red.refusedPending === 0 && byLabel('ack ON').red.throwPending === 1,
  '★ "ack on the refused branch": only the refusing path consumes the entry it did not deliver (the throwing path is untouched)', byLabel('ack ON') && byLabel('ack ON').red)
ok(family.results.length > 0 && family.results.every((r) => r.applied && r.importable && r.falsified),
  'and every mutation applied to a unique anchor, imported, and produced a DIFFERENT reading (non-vacuous: the family really ran mutations)', family.results.map((r) => ({ label: r.label, applied: r.applied, importable: r.importable })))
ok(family.cases[0].leftovers.length === 0, 'the mutated copies were written to D:\\_tmp and deleted again', family.cases[0].leftovers)

console.log('')
console.log('=== VMU MAILBOX FALSIFY: ' + passed + ' passed, ' + failed + ' failed ===')
if (failed) { console.error('FAILURES:\n' + failures.map((f) => '  - ' + f).join('\n')) }
process.exitCode = failed === 0 ? 0 : 1

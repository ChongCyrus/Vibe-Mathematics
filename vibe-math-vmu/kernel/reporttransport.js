// vibe-math-vmu/kernel/reporttransport.js — THE FIRST REAL REPORT TRANSPORT (audit A2, round 126).
//
// WHAT WAS MISSING. `kernel/report.js` has always had a `deliver` seam, and the v5r rules say "when a member writes
// progress, the office is called to report". The kernel emits the event (A2 step 1: `records.put` -> `onProgress` ->
// `report.tick({event:'progress'})`) and the pack declares the listener (A2 step 2: `v5r-progress-notice`). What was
// still absent on a real machine was the TRANSPORT: the deployment supplied no `config.deliver`, so every fired report
// carried `VMU_REPORT_NO_TRANSPORT` — "honest, but only half of end-to-end automatic reporting" (the comment in
// `vibe-math-vmu.js` said so itself).
//
// THIS MODULE IS THAT TRANSPORT, AND IT USES THE FACE THAT ALREADY EXISTS. A report is a notice for a seat, and the
// durable per-recipient mailbox is exactly "a durable notice for a seat" (`kernel/mailbox.js`: pull-on-read, write
// through the shared store, caps, ack ledger). Inventing a second channel would be the "one action, two doors" defect
// this project keeps finding; so the transport is a thin adapter onto `mailbox.send`.
//
// TWO DELIBERATE BOUNDARIES, both named rather than guessed:
//   · the report addresses `office`; the MAILBOX addresses members. The office is represented by a SEAT (the v5r chair
//     seat owns the office's view of the institute — `vibe_v5_inbox` reads a seat's box). `officeSeats` is therefore
//     an explicit parameter: an assembly whose office is a different seat passes that seat instead of this module
//     guessing one. No chair seat at all => a NAMED refusal, not a silent drop;
//   · no kernel (or no mailbox) at call time => `VMU_REPORT_NO_TRANSPORT`, the same code the report face already uses
//     for "there is no transport in this position". A transport that answered "delivered" without a mailbox would be
//     the exact lie the framework refuses.
//
// The module is import-free on purpose (it is a leaf, like `kernel/report.js`): the kernel object is passed in as a
// getter, resolved AT CALL TIME, because the plugin's `apply()` runs before the kernel exists.

export const REPORT_OFFICE_ADDRESS = 'office'
export const REPORT_TRANSPORT_SENDER = 'report'

/**
 * Build a `deliver(report)` function for `kernel/report.js`.
 *
 * @param {object} opts
 * @param {() => any} opts.getKernel  resolved ON EVERY CALL (the kernel may not exist when apply() runs)
 * @param {string[]} [opts.officeSeats]  slots that own "the office" (default `['chair']`)
 * @param {string} [opts.sender]  the `from` on the mail row (default `report`)
 * @returns {(report: object) => object} the deliver function (THROWS on refusal: `report.js` records the failure)
 */
export function createMailboxReportTransport({ getKernel, officeSeats = ['chair'], sender = REPORT_TRANSPORT_SENDER } = {}) {
  if (typeof getKernel !== 'function') {
    const e = new Error('createMailboxReportTransport needs getKernel (a function returning the kernel at call time)')
    e.code = 'VMU_INVALID_ARGUMENT'
    e.hint = 'pass { getKernel: () => kernelRef.value }'
    throw e
  }
  const seats = (Array.isArray(officeSeats) ? officeSeats : [officeSeats]).map(String)

  const transport = (report) => {
    const kernel = getKernel()
    const mailbox = kernel && kernel.mailbox
    if (!mailbox || typeof mailbox.send !== 'function') {
      const e = new Error('the mailbox report transport has no kernel mailbox in this position: nothing was sent')
      e.code = 'VMU_REPORT_NO_TRANSPORT'
      e.hint = 'install the vmu plugin kernel (its mailbox face) before a report fires, or pass config.deliver instead'
      throw e
    }
    const asked = Array.isArray(report && report.to) ? report.to.map(String) : []
    const named = asked.filter((t) => t !== REPORT_OFFICE_ADDRESS)
    const wantsOffice = asked.length === 0 || asked.includes(REPORT_OFFICE_ADDRESS)
    let targets = named
    if (wantsOffice) {
      const roster = kernel && kernel.members && typeof kernel.members.roster === 'function' ? kernel.members.roster() : []
      const office = (Array.isArray(roster) ? roster : []).filter((m) => m && seats.includes(String(m.slot))).map((m) => String(m.id))
      if (office.length === 0) {
        // A named refusal: "nobody is the office" is a fact about the roster, and inventing a recipient (the first
        // member, the sender, everyone) is how a notice ends up in a box nobody reads.
        const e = new Error('no member sits in the office seat (' + seats.join('/') + '), so a report for the office has no recipient')
        e.code = 'VMU_MAILBOX_NO_SUCH_RECIPIENT'
        e.hint = 'hire the academician/chair seat first, or name the recipient in the report declaration'
        throw e
      }
      targets = [...new Set([...named, ...office])]
    }
    if (targets.length === 0) {
      const e = new Error('the report named no recipient and the office is not addressable')
      e.code = 'VMU_MAILBOX_NO_SUCH_RECIPIENT'
      e.hint = 'declare `to: ["office"]` (or a seat id) on the report'
      throw e
    }
    const subject = String((report && report.name) || 'report')
    const text = String((report && report.text) || '')
    // kind 'notice' -> the mailbox's own urgency rules decide whether it wakes a turn (`vmu.mailbox.urgentKinds`); a
    // report must not be able to pretend to be urgent for a channel that never drives the loop.
    return mailbox.send(sender, { to: targets.length === 1 ? targets[0] : targets, kind: 'notice', subject, text })
  }
  transport.transportMeans = 'a report is a mail row for the office seat (mailbox.send), so "delivered" means "durably queued in the office inbox" - not "the office read it"'
  return transport
}

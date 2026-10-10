// vmu kernel · timevalue — the ONE way an instant becomes a comparable number (milliseconds since the epoch).
//
// WHY THIS MODULE EXISTS (task-231): `compliance.js` and `domaingate.js` each grew their own private `ms()`
// helper. Two implementations of one truth drift, and this stage has repeatedly caught exactly that shape
// ("two sources of truth for one knob"). So the rule now lives in ONE place and both modules import it.
//
// THE BARE-YEAR TRAP (read this before you "simplify" the number branch away):
//   `Date.parse` accepts a bare year string, so `Date.parse('1000')` is NOT NaN — it is
//   **-30610224000000**, i.e. the year 1000 CE. A caller who passes `at: 1000` means "1000 ms after the
//   epoch", but `String(1000)` = `'1000'` ⇒ parsing it as a date silently compares 0 against the year 1000
//   (0 < -3.06e13 is FALSE) and an overdue entry passes unnoticed. The failure is therefore SILENT, never a
//   crash: numbers must be handled AS NUMBERS, before any stringification.
//
// CONTRACT (task-238 — the UNAMBIGUOUS one; three faces used to disagree)
//   SENTINEL: `NaN` is the ONLY "cannot interpret" value in this kernel. `null` is NOT a sentinel here (a
//   caller who used `null` for "unparseable" was one of the three disagreeing faces).
//   ms(v)       ⇒ epoch-ms, or NaN when the value cannot be interpreted. PURE, never throws.
//   msStrict(v) ⇒ epoch-ms, or a NAMED refusal (`VMU_INVALID_ARGUMENT` carrying the ORIGINAL value and the
//                 expected shape). Use it at any call site that cannot continue with an uninterpretable time.
//   Callers that use the loose `ms()` MUST handle the NaN explicitly (`Number.isFinite(...)`) — the RULE F
//   gate in tests/audit-declaration-criterion.test.mjs reddens any import-alias call site without such a guard.
//     · a finite NUMBER is already epoch-ms and is returned untouched (0 included — epoch 0 is a legal instant);
//     · anything else is parsed as an ISO/date string (`ms('1970-01-01T00:00:00.000Z') === 0`);
//     · unparseable input ⇒ NaN / named refusal (the helper never guesses and never silently falls back).
// This module has NO settings, NO clock and NO state: it is pure functions plus their documentation.

/** Public-interface version of this module's surface (docs/03 §7). */
export const apiVersion = 1

/** Convert a time value to epoch milliseconds. A finite number IS epoch-ms; everything else is parsed. */
export function ms(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : NaN
  return Date.parse(String(v))
}

/**
 * Strict twin of `ms()`: an uninterpretable value is a NAMED refusal that carries what was received and what
 * is accepted, so the caller never has to guess which of its inputs was wrong (task-238, the fifteenth case).
 */
export function msStrict(v, label = 'instant') {
  const out = ms(v)
  if (Number.isFinite(out)) return out
  const e = new Error(label + ' cannot be interpreted as a time: ' + JSON.stringify(v && typeof v === 'object' ? String(v) : v) +
    ' — expected an ISO timestamp string (e.g. "2026-01-01T00:00:00.000Z") or a finite epoch-ms number (0 is legal)')
  e.code = 'VMU_INVALID_ARGUMENT'
  e.hint = 'numbers are epoch-ms and are never re-parsed as dates; strings must be ISO timestamps'
  e.received = v === undefined ? 'undefined' : (typeof v === 'object' && v !== null ? String(v) : v)
  e.label = label
  e.enforced = []
  e.enforcedScope = 'evaluated-so-far'
  throw e
}

export default ms

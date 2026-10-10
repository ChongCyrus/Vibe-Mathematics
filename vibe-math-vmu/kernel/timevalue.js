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
// CONTRACT
//   ms(v) ⇒ milliseconds since the epoch, or NaN when the value cannot be interpreted.
//     · a finite NUMBER is already epoch-ms and is returned untouched (0 included — epoch 0 is a legal instant);
//     · anything else is parsed as an ISO/date string (`ms('1970-01-01T00:00:00.000Z') === 0`);
//     · unparseable input ⇒ NaN (the caller decides how to refuse; this helper never throws and never guesses).
// This module has NO settings, NO clock and NO state: it is a pure function plus its documentation.

/** Public-interface version of this module's surface (docs/03 §7). */
export const apiVersion = 1

/** Convert a time value to epoch milliseconds. A finite number IS epoch-ms; everything else is parsed. */
export function ms(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : NaN
  return Date.parse(String(v))
}

export default ms

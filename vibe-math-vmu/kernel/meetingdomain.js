// vmu kernel · meetingdomain — THE ELEVEN STRICT `vmu.meetings.*` DOMAINS (task-149 C③, extracted from meetings.js).
//
// WHY THIS FILE EXISTS. `kernel/meetings.js` was at 1199/1200 lines (docs/02 §L174), and the eleven `oneOf(...)`
// sites inside its `K` object were a family in the sense R11/R12 established for `kernel/meetingmarker.js`: the
// SAME question ("which values does this declared key actually accept?") answered eleven times inline.
//
// THE DEFECT THE EXTRACTION CLOSES (measured, R28/R29/R31): `settings/schema.js` declared these keys
// `type:'string'` — "any string is legal" — while the reader here **silently clamped** anything outside its own set
// to the default (`oneOf = (v, set, def) => set.includes(v) ? v : def`). So the DECLARATION and the ENFORCEMENT
// were opposite, and a typo in a preset was neither refused nor recorded. R31 moved the nine remaining keys into
// `HAND_DECLARED_DOMAINS` (they are now hand-declared `enum` rows with these very domains outside the generated
// block); this module is the OTHER half: the read side now REFUSES BY NAME instead of clamping silently.
//
// THE INVARIANT THIS FILE MAKES CHECKABLE: `MEETING_DOMAINS[key]` is the read-side set, and
// `tests/vmu-meeting-domain.test.mjs` asserts it is ELEMENT-WISE EQUAL to the `domain` in `settings/schema.js`.
// That equality is what made R17's `orderMode` precedent valid; here it is asserted for all eleven keys at once.

/** The eleven read-side domains. `def` is the value the DECLARATION names as its default (schema.js agrees). */
export const MEETING_DOMAINS = Object.freeze({
  'vmu.meetings.tier': Object.freeze({ values: Object.freeze(['formal', 'light']), def: 'formal' }),
  'vmu.meetings.attendanceMode': Object.freeze({ values: Object.freeze(['roster', 'signin', 'quorum-only']), def: 'roster' }),
  'vmu.meetings.quorumLossPolicy': Object.freeze({ values: Object.freeze(['suspend', 'continue', 'recess']), def: 'suspend' }),
  'vmu.meetings.budgetOnExceed': Object.freeze({ values: Object.freeze(['refuse', 'warn', 'extend']), def: 'refuse' }),
  'vmu.meetings.leaveEarlyPolicy': Object.freeze({ values: Object.freeze(['allow', 'note', 'deny']), def: 'allow' }),
  'vmu.meetings.minutesDetail': Object.freeze({ values: Object.freeze(['brief', 'full']), def: 'brief' }),
  'vmu.meetings.appealScope': Object.freeze({ values: Object.freeze(['all', 'procedural', 'none']), def: 'all' }),
  'vmu.meetings.leaveApprover': Object.freeze({ values: Object.freeze(['chair', 'office']), def: 'chair' }),
  'vmu.meetings.confidentialityDefault': Object.freeze({ values: Object.freeze(['public', 'internal', 'restricted']), def: 'internal' }),
  'vmu.meetings.confidentialityQuotePolicy': Object.freeze({ values: Object.freeze(['allow', 'redact', 'deny']), def: 'allow' }),
  'vmu.meetings.wakeFailurePolicy': Object.freeze({ values: Object.freeze(['refuse', 'skip', 'retry']), def: 'refuse' }),
})

/** The eleven keys, in declaration order (a caller can assert the set without re-typing it). */
export const MEETING_DOMAIN_KEYS = Object.freeze(Object.keys(MEETING_DOMAINS))

/** The field name each key feeds inside `K` (the object `kernel/meetings.js` builds), derived from the key. */
export const MEETING_DOMAIN_FIELDS = Object.freeze(Object.fromEntries(
  MEETING_DOMAIN_KEYS.map((k) => [k, k.slice('vmu.meetings.'.length)])))

/**
 * `createMeetingDomains({ sget, refuse })` ⇒ `{ values, read(key) }`.
 *
 * `read(key)` returns the live value when it is inside the declared domain, the DECLARED DEFAULT when the key is
 * unset (`undefined`/`null`/`''` — R30's unset sentinel), and otherwise THROWS A NAMED REFUSAL
 * (`VMU_INVALID_ARGUMENT`, already registered; the same code R17's `strictOrderMode` uses). Nothing is clamped
 * silently: "the value I asked for is not the value in force" is exactly the class this face keeps closing.
 */
export function createMeetingDomains({ sget, refuse, onRead = null } = {}) {
  // ZERO MECHANISM: with no ports injected the TABLE still reads — every key falls back to its declared default
  // (nothing is judged, nothing throws), so a caller that only wants the domain table is never forced to build
  // seams, and a probe that calls the factory with no arguments gets an object rather than an exception.
  if (typeof sget !== 'function') sget = () => undefined
  if (typeof refuse !== 'function') refuse = (code, message, hint) => Object.assign(new Error(message), { code, hint })
  const read = (key) => {
    const dom = MEETING_DOMAINS[key]
    if (!dom) throw refuse('VMU_NO_SUCH_OBJECT', 'no declared domain for ' + key, 'add it to kernel/meetingdomain.js')
    const raw = sget(key)
    const value = (raw === undefined || raw === null || raw === '') ? dom.def : raw
    if (!dom.values.includes(value)) {
      throw refuse('VMU_INVALID_ARGUMENT', key + ': ' + JSON.stringify(value) + ' is outside the declared domain ' + dom.values.join(' | '),
        'declared domain: ' + dom.values.join(' | ') + ' (settings/schema.js and kernel/meetingdomain.js agree element-wise); the value is REFUSED, never clamped to the default')
    }
    if (typeof onRead === 'function') onRead(key, value)
    return value
  }
  const values = {}
  for (const key of MEETING_DOMAIN_KEYS) values[MEETING_DOMAIN_FIELDS[key]] = read(key)
  return { values, read }
}

export default MEETING_DOMAINS

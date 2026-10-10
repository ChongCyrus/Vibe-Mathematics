// vmu kernel · replay — the K5 read-only reconstructor: rebuild state from the APPEND-ONLY audit, and SAY
// WHAT IS MISSING instead of pretending the reconstruction is complete.
//
// Design source:
//   · docs/21-observability-and-operations.md §2 (the audit row fields: `{ ts, seq, what, id, hook, order,
//     failure, keys, dryRun, traceId, policy, consecutive, code, error, reason }` as emitted by kernel/bus.js)
//     and §3/§6 (traceId correlation, replay as a diagnostic: "由 traceId 重演同一决策合并过程").
//   · docs/07-durability-library.md §1/§4 (append-only; the fingerprint discipline is DEFINED THERE — this
//     module REFERENCES it and never redefines the library's content fingerprint ✗).
//   · The library/idempotency precedent: READ paths answer empty under zero mechanism and never mutate
//     (kernel/idempotency.js, kernel/metrics.js).
//
// FIVE HARD INVARIANTS (each one is a state, a count, or a named refusal — never a pretence)
//   ① PURE, READ-ONLY RECONSTRUCTION: the same (plan, initial state) produces a byte-identical state
//      (`verify()` proves it); the module NEVER writes to any service, never touches real time (only the
//      injected `clock`), and never mutates the plan it was given.
//   ② GAPS MUST BE REPORTED: a hole in `seq`, an event that references an object nothing created (a missing
//      antecedent), a malformed row, an inversion in `ts`, a truncated window — all of them are listed by
//      `gaps()`/`plan()` with WHAT is missing. A reconstruction with gaps is NEVER reported as complete ✗.
//   ③ UNKNOWN KINDS ARE COUNTED, NEVER SKIPPED SILENTLY: every event whose `what` (or `type`) has no explicit
//      reducer is counted in `unknownKinds`; with `strict` (`vmu.replay.strict` or the plan option) the plan
//      itself is refused BY NAME.
//   ④ ZERO SIDE EFFECTS: the only injected collaborators are advisory (`log`), read-only (`audit` source,
//      optional `idempotency.fingerprintOf`) or never touched (`bus`, any service map). No write method of
//      any injected object is ever called (asserted by the test with a proxied fake service).
//   ⑤ EMPTY AUDIT IS NOT A RECONSTRUCTION: with no events the result says `empty:true` / `reconstructed:false`
//      and a `no-events` gap — "已重建" would be a lie ✗.
// Plus the kernel's usual rails: every upper bound counts its drops; the injected clock is the only time
// source; read paths (gaps/status) never mutate; determinism is byte-level.
//
// CLONE CONTRACT (round-8 reviewer: `apply({initial})` used to crash twice ✗) — the state base is validated
// and cloned SAFELY, never via `JSON.parse(JSON.stringify())`:
//   · a `initial` whose SHAPE is not a replay state (`{a:1}`, a missing `events`, …) ⇒ `VMU_INVALID_ARGUMENT`
//     naming the offending key (it used to die on `reading 'byKind'`);
//   · a CYCLE or a `function`/`symbol` ⇒ `VMU_INVALID_ARGUMENT` naming the path (it used to die on
//     `Converting circular structure to JSON`);
//   · `NaN/±Infinity/-0/undefined/Date/Map/Set/RegExp/bigint` are preserved by the clone and encoded as
//     deterministic TAGS in the canonical form (`status().clone.lossyTypes` discloses the list) ⇒ two
//     replays stay byte-identical WITHOUT pretending the JS identity was compared.
//
// SETTINGS (read as PLAIN LITERALS — the settings table and the docs audit discover wired keys by scanning
// file text for the literal, see kernel/guard.js):
//   vmu.replay.maxEvents (default 1000) · vmu.replay.strict (default false) ·
//   vmu.replay.requireContiguousSeq (default true) · vmu.replay.maxStateKeys (default 5000) ·
//   vmu.replay.keepUnknown (default true)   [all four are PROPOSED keys, see the delivery report]
//   vmu.audit.ringMax (default 64, DECLARED) is read only to explain WHY a hole is likely (a ring cap) ✓.
//
// CODES (all registered in 03-§8 — this module invents none): VMU_INVALID_ARGUMENT (malformed plan/event in
// strict mode) · VMU_INDEX_STALE (gaps: the reconstruction is incomplete) · VMU_BODY_TRUNCATED (window
// truncation) · VMU_META_VALIDATION_FAILED (an event row that is not an object with ts/what) ·
// VMU_NO_SUCH_OBJECT (unknown kind requested via `kinds`) · VMU_RESOURCE_BUDGET (state/event caps).
import { createHash } from 'node:crypto'

export const apiVersion = 1

export function refuse(code, message, hint) {
  const e = new Error(message)
  e.code = code
  if (hint) e.hint = hint
  return e
}

/** The audit vocabulary the bus emits (kernel/bus.js) — the built-in reducers cover these prefixes. */
export const AUDIT_PREFIXES = Object.freeze(['middleware', 'control', 'metrics', 'alerts', 'bidding', 'idempotency', 'records', 'tasks', 'members', 'pack', 'prompt'])

/** Kinds that REGISTER an object: a reference to an id that no such event introduced is a missing antecedent. */
export const REGISTERING_SUFFIXES = Object.freeze(['registered', 'created', 'posted', 'begun', 'declared', 'opened', 'open', 'appended', 'assigned', 'hired', 'settled', 'committed'])

/** The fingerprint ENCODINGS this module uses for values plain JSON cannot represent (self-disclosed in
 *  `status().clone.lossyTypes`): each one is a deterministic TAG, so byte-equality stays well defined even
 *  though the JS identity (e.g. a Date instance) is not what is compared. */
export const LOSSY_TYPES = Object.freeze([
  'Date→{"$date":ISO}', 'Map→{"$map":sorted}', 'Set→{"$set":sorted}', 'RegExp→{"$regex":"src/flags"}',
  'NaN|Infinity|-Infinity|-0→{"$num":…}', 'undefined→{"$undefined":true}', 'bigint→{"$bigint":"…"}',
])

const isPlainish = (v) => v !== null && typeof v === 'object'

/**
 * Canonical JSON with TAGS: keys sorted at every depth, so two logically equal states fingerprint identically;
 * `NaN/±Infinity/-0/undefined/bigint/Date/Map/Set/RegExp` are encoded as deterministic tags instead of being
 * silently collapsed (the old form turned `NaN` into `"null"` and lost `undefined` — B5's silent drift ✗).
 * A CYCLE or a `function`/`symbol` cannot be finger-printed ⇒ NAMED refusal that says WHERE it is.
 */
export function canonicalize(value) {
  const seen = new Set()
  const walk = (v, path) => {
    if (v === null) return 'null'
    const t = typeof v
    if (t === 'number') {
      if (Number.isNaN(v)) return '{"$num":"NaN"}'
      if (v === Infinity) return '{"$num":"Infinity"}'
      if (v === -Infinity) return '{"$num":"-Infinity"}'
      if (Object.is(v, -0)) return '{"$num":"-0"}'
      return String(v)
    }
    if (t === 'string') return JSON.stringify(v)
    if (t === 'boolean') return v ? 'true' : 'false'
    if (t === 'undefined') return '{"$undefined":true}'
    if (t === 'bigint') return '{"$bigint":' + JSON.stringify(v.toString()) + '}'
    if (t === 'function' || t === 'symbol') {
      throw refuse('VMU_INVALID_ARGUMENT', 'cannot canonicalise a ' + t + ' at ' + path,
        'a replay state must be finger-printable: remove ' + t + ' values (K5); see status().clone for the contract')
    }
    if (v instanceof Date) return '{"$date":' + JSON.stringify(Number.isNaN(v.getTime()) ? 'Invalid' : v.toISOString()) + '}'
    if (v instanceof RegExp) return '{"$regex":' + JSON.stringify(v.source + '/' + v.flags) + '}'
    if (v instanceof Map) {
      const entries = [...v.entries()].map(([k, val]) => '[' + walk(k, path + '.<map-key>') + ',' + walk(val, path + '.<map-value>') + ']')
      entries.sort()
      return '{"$map":[' + entries.join(',') + ']}'
    }
    if (v instanceof Set) {
      const items = [...v.values()].map((x, i) => walk(x, path + '.<set-item:' + i + '>'))
      items.sort()
      return '{"$set":[' + items.join(',') + ']}'
    }
    if (seen.has(v)) {
      throw refuse('VMU_INVALID_ARGUMENT', 'cannot canonicalise a CYCLE at ' + path,
        'a replay state must be a tree: break the cycle at ' + path + ' (K5 refuses instead of crashing)')
    }
    seen.add(v)
    let out
    if (Array.isArray(v)) out = '[' + v.map((x, i) => walk(x, path + '[' + i + ']')).join(',') + ']'
    else out = '{' + Object.keys(v).sort().map((k) => JSON.stringify(k) + ':' + walk(v[k], path + '.' + k)).join(',') + '}'
    seen.delete(v)
    return out
  }
  return walk(value, '$')
}

/** The event kind: `what` (bus audit rows) or `type`/`kind` (module log rows) — one naming rule, documented. */
export function kindOf(event) {
  if (!event || typeof event !== 'object') return null
  const k = event.what !== undefined ? event.what : (event.type !== undefined ? event.type : event.kind)
  return typeof k === 'string' && k ? k : null
}

/** A stable fingerprint of a state (canonical JSON → sha256); used for byte-level determinism proofs. */
export function fingerprintOf(state) {
  return createHash('sha256').update(canonicalize(state), 'utf8').digest('hex')
}

export function emptyState() {
  return {
    version: 1,
    events: 0,
    timeline: { firstAt: null, lastAt: null, firstSeq: null, lastSeq: null, inverted: 0 },
    counts: { byKind: {}, byPrefix: {} },
    unknownKinds: {},
    middleware: { entries: {}, disabled: {}, decisions: {}, failures: {}, dryRun: null },
    control: { paused: 0, resumed: 0, heartbeats: 0, state: 'running', lastReason: null },
    objects: {},
    refusals: {},
    truncated: { droppedEvents: 0, droppedStateKeys: 0 },
  }
}

/** The clone backend actually in use (self-disclosed): `structuredClone` is LOSSLESS for
 *  `NaN/±Infinity/-0/undefined/Date/Map/Set` and preserves cycles; the manual fallback is JSON+tags and
 *  therefore REFUSES the exotic types by name instead of silently downgrading them. */
export const CLONE_BACKEND = (typeof structuredClone === 'function') ? 'structuredClone' : 'manual-json-tags'
export const CLONE_KIND = CLONE_BACKEND === 'structuredClone' ? 'lossless-safe' : 'json-tags-safe'

/** Required top-level shape of a replay state (B4: an arbitrary `initial` used to crash on `.byKind`). */
const STATE_SHAPE = Object.freeze([
  ['events', 'number'], ['timeline', 'object'], ['counts', 'object'], ['unknownKinds', 'object'],
  ['middleware', 'object'], ['control', 'object'], ['objects', 'object'], ['refusals', 'object'], ['truncated', 'object'],
])

/** Validate a candidate initial state. Returns `{ok:true}` or `{ok:false, why, hint}` (always NAMED, never a crash). */
export function assertStateShape(candidate) {
  if (candidate === null || typeof candidate !== 'object' || Array.isArray(candidate)) {
    return { ok: false, why: 'an initial state must be a plain object, got ' + (Array.isArray(candidate) ? 'array' : typeof candidate), hint: 'pass a state shaped like emptyState() (or omit `initial`)' }
  }
  for (const [key, type] of STATE_SHAPE) {
    if (!(key in candidate)) return { ok: false, why: 'initial state is missing the key `' + key + '`', hint: 'required keys: ' + STATE_SHAPE.map(([k]) => k).join(', ') }
    const v = candidate[key]
    if (type === 'number' && (typeof v !== 'number' || !Number.isFinite(v))) return { ok: false, why: 'initial state key `' + key + '` must be a finite number, got ' + JSON.stringify(v), hint: 'use a state from emptyState()/apply() as the base' }
    if (type === 'object' && (v === null || typeof v !== 'object' || Array.isArray(v))) return { ok: false, why: 'initial state key `' + key + '` must be an object, got ' + (Array.isArray(v) ? 'array' : typeof v), hint: 'use a state from emptyState()/apply() as the base' }
  }
  for (const [key, sub] of [['timeline', ['firstAt', 'lastAt', 'firstSeq', 'lastSeq', 'inverted']], ['counts', ['byKind', 'byPrefix']], ['middleware', ['entries', 'disabled', 'decisions', 'failures']], ['control', ['paused', 'resumed', 'heartbeats']]]) {
    for (const s of sub) {
      const v = candidate[key][s]
      if (s === 'inverted' ? (typeof v !== 'number') : (s === 'paused' || s === 'resumed' || s === 'heartbeats') ? (typeof v !== 'number') : false) {
        return { ok: false, why: 'initial state `' + key + '.' + s + '` has the wrong type (' + typeof v + ')', hint: 'use a state from emptyState()/apply() as the base' }
      }
    }
  }
  return { ok: true }
}

/**
 * A SAFE deep clone (B5): `structuredClone` when the runtime has it, else a manual clone.
 * Returns `{ok:true, value}` or `{ok:false, why, hint}` — NEVER a bare `TypeError`, and never a silent
 * downgrade: a `function`/`symbol`, an un-clonable exotic type on the manual backend, or a CYCLE is refused
 * by NAME with the path where it was found.
 */
export function safeClone(value) {
  if (!isPlainish(value)) return { ok: true, value }
  let cloned
  if (CLONE_BACKEND === 'structuredClone') {
    try { cloned = structuredClone(value) } catch (e) { return { ok: false, why: 'structuredClone refused the value: ' + String((e && e.message) || e), hint: 'a replay state must be a tree of JSON/clone-safe values (K5)' } }
  } else {
    try { cloned = JSON.parse(JSON.stringify(value)) } catch (e) { return { ok: false, why: 'the manual clone backend refused the value: ' + String((e && e.message) || e), hint: 'remove cycles/exotic types, or run on a runtime with structuredClone' } }
    const exotic = findExotic(value, '$')
    if (exotic) return { ok: false, why: 'the manual clone backend would LOSE ' + exotic.type + ' at ' + exotic.path, hint: 'run on a runtime with structuredClone, or keep the state JSON-safe' }
  }
  // validate the clone itself: functions/symbols/cycles cannot be finger-printed (canonicalize would refuse anyway)
  try { canonicalize(cloned) } catch (e) { return { ok: false, why: String((e && e.message) || e), hint: String((e && e.hint) || 'a replay state must be a tree of finger-printable values (K5)') } }
  return { ok: true, value: cloned }
}

/** Walk a value to find a type the manual backend cannot preserve (used only on that backend). */
function findExotic(v, path, seen = new Set()) {
  if (v === null || typeof v !== 'object') return null
  if (v instanceof Date || v instanceof Map || v instanceof Set || v instanceof RegExp || typeof v === 'bigint') return { type: v.constructor ? v.constructor.name : typeof v, path }
  if (seen.has(v)) return null
  seen.add(v)
  for (const k of Object.keys(v)) { const hit = findExotic(v[k], path + '.' + k, seen); if (hit) return hit }
  return null
}

const deepFreeze = (v) => { if (v && typeof v === 'object' && !Object.isFrozen(v)) { Object.freeze(v); for (const k of Object.keys(v)) deepFreeze(v[k]) } return v }
const bump = (obj, key, by = 1) => { obj[key] = (obj[key] || 0) + by; return obj }
const sortedObj = (o) => { const out = {}; for (const k of Object.keys(o || {}).sort()) out[k] = o[k]; return out }

/**
 * createReplay — the K5 reconstructor.
 * `audit` may be: an array of rows · an object exposing `rows()|list()|tail(n)` · `{ events: [...] }` ·
 * anything else (then the source is reported as unsupported — never guessed). `bus`/`services` are accepted
 * so a caller can pass the same context, and are NEVER touched (no write path exists in this module).
 */
export function createReplay({ clock = () => 0, log = null, settings = {}, bus = null, audit = null, idempotency = null } = {}) {
  if (typeof clock !== 'function') {
    throw refuse('VMU_INVALID_ARGUMENT', 'createReplay needs a clock function', 'pass { clock: () => ms } — the only time source is the injected clock')
  }
  const sget = (key, def) => {
    if (settings && typeof settings.get === 'function') { const v = settings.get(key); return v === undefined ? def : v }
    if (settings && Object.prototype.hasOwnProperty.call(settings, key)) return settings[key]
    return def
  }
  const say = (event) => { if (log && typeof log.append === 'function') { try { log.append(event) } catch (e) { /* logging never breaks the replay it records */ } } }
  const asInt = (v, def, min = 0) => (Number.isInteger(v) && v >= min ? v : def)

  // PLAIN LITERALS (the docs audit discovers wired keys by scanning the file text).
  const maxEvents = asInt(sget('vmu.replay.maxEvents', 1000), 1000, 1)
  const strictSetting = sget('vmu.replay.strict', false) === true
  const requireContiguousSeq = sget('vmu.replay.requireContiguousSeq', true) === true
  const maxStateKeys = asInt(sget('vmu.replay.maxStateKeys', 5000), 5000, 1)
  const keepUnknown = sget('vmu.replay.keepUnknown', true) === true
  const auditRingMax = asInt(sget('vmu.audit.ringMax', 64), 64, 1)

  const reducers = new Map()          // kind -> pure (state, event, ctx) => void|newState
  const counters = { plans: 0, applies: 0, verifies: 0, gapCalls: 0, refusals: 0, unknownTotal: 0, droppedTotal: 0, plansRefused: 0 }
  const refusals = new Map()
  let lastPlanSummary = null
  let lastApplySummary = null

  const deny = (code, message, hint) => {
    counters.refusals += 1
    bump(refusals, code, 1)
    say({ type: 'replay/refused', at: clock(), code, message })
    return refuse(code, message, hint)
  }

  /** Read the audit source WITHOUT touching anything else. Returns `{rows, source}`. */
  const readSource = () => {
    if (Array.isArray(audit)) return { rows: audit.slice(), source: { kind: 'array', available: audit.length } }
    if (audit && typeof audit === 'object') {
      if (Array.isArray(audit.events)) return { rows: audit.events.slice(), source: { kind: 'events', available: audit.events.length } }
      for (const m of ['rows', 'list', 'tail']) {
        if (typeof audit[m] === 'function') {
          try {
            const out = m === 'tail' ? audit.tail(maxEvents * 4) : audit[m]()
            const rows = Array.isArray(out) ? out.slice() : (out && Array.isArray(out.rows) ? out.rows.slice() : null)
            if (rows) return { rows, source: { kind: m, available: rows.length } }
          } catch (e) { return { rows: [], source: { kind: m, available: 0, error: String((e && e.message) || e) } } }
        }
      }
    }
    if (audit === null || audit === undefined) return { rows: [], source: { kind: 'none', available: 0 } }
    return { rows: [], source: { kind: 'unsupported', available: 0 } }
  }

  /** A reference this event makes to an object that must already exist (missing-antecedent detection). */
  const antecedentOf = (event) => {
    for (const k of ['objectId', 'postId', 'ref', 'targetId', 'memberId', 'taskId']) {
      if (typeof event[k] === 'string' && event[k]) return { field: k, id: event[k] }
    }
    return null
  }
  const isRegistering = (kind) => REGISTERING_SUFFIXES.some((s) => kind === s || kind.endsWith('/' + s) || kind.endsWith('-' + s))

  /** READ-ONLY: the specific gaps in the audit (never a pretence of completeness). */
  const computeGaps = ({ rows, seqSeen, unknownKinds, truncated, empty, malformed, missingAntecedents, inversions, strict = strictSetting }) => {
    const gaps = []
    if (empty) gaps.push({ kind: 'no-events', detail: 'the audit source contains no events: nothing can be reconstructed', severity: 'blocking' })
    if (malformed.length) gaps.push({ kind: 'malformed-rows', detail: malformed.length + ' row(s) are not events (need an object with ts and what/type)', rows: malformed.slice(0, 10), severity: 'blocking' })
    if (requireContiguousSeq && seqSeen.holes.length) {
      gaps.push({ kind: 'seq-holes', detail: 'the audit sequence is not contiguous: ' + seqSeen.holes.length + ' hole(s)', holes: seqSeen.holes.slice(0, 20), severity: 'blocking', why: 'a capped ring (vmu.audit.ringMax=' + auditRingMax + ') drops the OLDEST rows, so holes mean the beginning is gone' })
    }
    if (inversions) gaps.push({ kind: 'ts-inversions', detail: inversions + ' event(s) carry a timestamp older than their predecessor', severity: 'warning' })
    if (Object.keys(unknownKinds).length) {
      gaps.push({ kind: 'unknown-kinds', detail: Object.keys(unknownKinds).length + ' kind(s) have no explicit reducer', kinds: sortedObj(unknownKinds), severity: strict ? 'blocking' : 'warning' })
    }
    if (missingAntecedents.length) gaps.push({ kind: 'missing-antecedent', detail: missingAntecedents.length + ' event(s) reference an object that no registering event introduced', refs: missingAntecedents.slice(0, 20), severity: 'warning' })
    if (truncated.droppedEvents > 0) gaps.push({ kind: 'window-truncated', detail: truncated.droppedEvents + ' event(s) were outside the replay window (kept ' + truncated.kept + ')', byKind: sortedObj(truncated.byKind), severity: 'blocking' })
    return gaps
  }

  const api = {
    apiVersion,
    AUDIT_PREFIXES, REGISTERING_SUFFIXES, canonicalize, fingerprintOf, emptyState,

    /** Register a PURE reducer for one kind. Reducers must not read real time or call services. */
    register({ kind, reduce } = {}) {
      if (typeof kind !== 'string' || !kind) throw deny('VMU_INVALID_ARGUMENT', 'register needs a non-empty kind', 'e.g. { kind: "tasks/transition", reduce(state, event) { … } }')
      if (typeof reduce !== 'function') throw deny('VMU_INVALID_ARGUMENT', 'register needs a reduce function for ' + kind, 'the reducer receives (state, event, ctx) and returns nothing (mutating the working copy) or a new state')
      reducers.set(kind, reduce)
      say({ type: 'replay/reducer-registered', at: clock(), kind })
      return { ok: true, registered: kind, kinds: [...reducers.keys()].sort() }
    },
    unregister({ kind } = {}) {
      if (!reducers.has(String(kind))) throw deny('VMU_NO_SUCH_OBJECT', 'no such reducer: ' + String(kind), 'registered: ' + ([...reducers.keys()].sort().join(', ') || 'none'))
      reducers.delete(String(kind))
      return { ok: true, unregistered: String(kind), kinds: [...reducers.keys()].sort() }
    },
    kinds() { return { ok: true, kinds: [...reducers.keys()].sort(), prefixes: AUDIT_PREFIXES.slice() } },

    /**
     * READ-ONLY: select and validate the events to replay, and report every gap.
     * Options: `until` (ts ≤ until), `kinds` (explicit kind list; an unknown requested kind is a refusal),
     * `strict` (override `vmu.replay.strict` for this plan).
     */
    plan({ until = null, kinds = null, strict = null } = {}) {
      const at = clock()
      if (until !== null && (!Number.isFinite(until) || typeof until !== 'number')) throw deny('VMU_INVALID_ARGUMENT', 'plan `until` must be a finite millisecond timestamp', 'omit it to replay the whole audit')
      const wantKinds = kinds === null ? null : (Array.isArray(kinds) ? kinds.filter((k) => typeof k === 'string' && k) : null)
      if (kinds !== null && wantKinds === null) throw deny('VMU_INVALID_ARGUMENT', 'plan `kinds` must be an array of kind strings', 'e.g. { kinds: ["middleware/decision"] }')
      const strictMode = strict === null ? strictSetting : strict === true
      const { rows, source } = readSource()
      const malformed = []
      const unknownKinds = {}
      const byKindAll = {}
      const seqSeen = { values: [], holes: [] }
      const missingAntecedents = []
      let inversions = 0
      let prevTs = null
      let prevSeq = null
      for (const row of rows) {
        const ev = row && typeof row === 'object' ? row : null
        if (!ev || !kindOf(ev) || (ev.ts !== undefined && !Number.isFinite(ev.ts) && !Number.isFinite(Date.parse(ev.ts)))) { malformed.push(typeof row === 'string' ? row.slice(0, 80) : '[non-event]'); continue }
        const ts = typeof ev.ts === 'number' ? ev.ts : Date.parse(ev.ts)
        if (until !== null && ts > until) continue
        const kind = kindOf(ev)
        if (wantKinds && !wantKinds.includes(kind)) continue
        byKindAll[kind] = (byKindAll[kind] || 0) + 1
        if (!reducers.has(kind)) unknownKinds[kind] = (unknownKinds[kind] || 0) + 1
        // seq contiguity (the bus assigns a monotone `seq`; a hole means rows were dropped)
        if (Number.isInteger(ev.seq)) {
          if (prevSeq !== null && ev.seq !== prevSeq + 1) {
            const from = prevSeq + 1
            const to = ev.seq - 1
            if (to >= from) seqSeen.holes.push({ from, to, count: to - from + 1, at: ts })
          }
          seqSeen.values.push(ev.seq)
          prevSeq = ev.seq
        }
        if (prevTs !== null && ts < prevTs) inversions += 1
        prevTs = ts
      }
      if (wantKinds) {
        for (const k of wantKinds) if (!byKindAll[k]) {
          throw deny('VMU_NO_SUCH_OBJECT', 'no events of the requested kind: ' + k, 'kinds present: ' + (Object.keys(byKindAll).sort().join(', ') || 'none'))
        }
      }
      const selectedAll = rows.length
      const kept = []
      const droppedByKind = {}
      let dropped = 0
      for (const row of rows) {
        const ev = row && typeof row === 'object' ? row : null
        if (!ev || !kindOf(ev)) continue
        const ts = typeof ev.ts === 'number' ? ev.ts : Date.parse(ev.ts)
        if (until !== null && ts > until) continue
        const kind = kindOf(ev)
        if (wantKinds && !wantKinds.includes(kind)) continue
        if (kept.length >= maxEvents) { dropped += 1; droppedByKind[kind] = (droppedByKind[kind] || 0) + 1; continue }
        kept.push({
          what: kind, ts, seq: Number.isInteger(ev.seq) ? ev.seq : null,
          id: ev.id === undefined ? null : ev.id, hook: ev.hook === undefined ? null : ev.hook,
          failure: ev.failure === undefined ? null : ev.failure, keys: Array.isArray(ev.keys) ? ev.keys.slice() : null,
          dryRun: ev.dryRun === true, traceId: ev.traceId === undefined ? null : ev.traceId,
          policy: ev.policy === undefined ? null : ev.policy, consecutive: ev.consecutive === undefined ? null : ev.consecutive,
          code: ev.code === undefined ? null : ev.code, reason: ev.reason === undefined ? null : ev.reason,
          objectId: ev.objectId === undefined ? null : ev.objectId, ref: ev.ref === undefined ? null : ev.ref,
          targetId: ev.targetId === undefined ? null : ev.targetId, raw: undefined,
        })
      }
      // missing antecedents: a reference to an object no registering event introduced (within the window)
      const registered = new Set()
      for (const ev of kept) if (isRegistering(ev.what) && typeof ev.id === 'string' && ev.id) registered.add(ev.id)
      for (const ev of kept) {
        const ant = antecedentOf(ev)
        if (!ant) continue
        if (isRegistering(ev.what) && ant.field === 'objectId' && ant.id === ev.id) continue
        if (!registered.has(ant.id)) missingAntecedents.push({ kind: ev.what, field: ant.field, id: ant.id, ts: ev.ts, seq: ev.seq })
      }
      const empty = kept.length === 0
      const truncated = { kept: kept.length, droppedEvents: dropped, byKind: sortedObj(droppedByKind), windowFrom: until, sourceAvailable: source.available, selected: selectedAll }
      const gaps = computeGaps({ rows, seqSeen, unknownKinds, truncated, empty, malformed, missingAntecedents, inversions, strict: strictMode })
      const unknownTotal = Object.values(unknownKinds).reduce((a, b) => a + b, 0)
      counters.plans += 1
      counters.unknownTotal += unknownTotal
      counters.droppedTotal += dropped
      if (strictMode && unknownTotal > 0) {
        counters.plansRefused += 1
        throw deny('VMU_INVALID_ARGUMENT', 'strict replay: ' + unknownTotal + ' event(s) have no registered reducer',
          'kinds: ' + Object.keys(unknownKinds).sort().join(', ') + ' — register a reducer (pure!) or relax vmu.replay.strict')
      }
      const planObj = deepFreeze({
        id: 'plan-' + (counters.plans),
        at, until, kinds: wantKinds ? wantKinds.slice().sort() : null, strict: strictMode,
        events: kept, count: kept.length,
        seqRange: { from: seqSeen.values.length ? Math.min(...seqSeen.values) : null, to: seqSeen.values.length ? Math.max(...seqSeen.values) : null },
        source, unknownKinds: sortedObj(unknownKinds), gaps,
        truncated: { kept: kept.length, droppedEvents: dropped, byKind: sortedObj(droppedByKind), maxEvents },
        fingerprint: fingerprintOf(kept),
      })
      lastPlanSummary = { id: planObj.id, at, count: kept.length, gaps: gaps.length, unknownTotal, dropped, strict: strictMode, empty }
      say({ type: 'replay/planned', at, plan: planObj.id, count: kept.length, gaps: gaps.length, unknownKinds: Object.keys(unknownKinds).length })
      return {
        ok: true, empty, reconstructed: false, plan: planObj, gaps, unknownKinds: sortedObj(unknownKinds), unknownTotal,
        truncated: planObj.truncated, strict: strictMode,
        note: empty
          ? 'no events: there is nothing to replay (this is NOT a reconstruction)'
          : (gaps.length ? 'the plan has ' + gaps.length + ' gap(s): a reconstruction from it is INCOMPLETE by construction' : 'the plan is complete within the window'),
      }
    },

    /**
     * PURE: reduce a plan into a NEW state object. The plan is never mutated, no service is touched, and the
     * same (plan, initialState) always produces a byte-identical state (proved by verify()).
     */
    apply({ plan, initial = null } = {}) {
      if (!plan || typeof plan !== 'object' || !Array.isArray(plan.events)) throw deny('VMU_INVALID_ARGUMENT', 'apply needs a plan from plan()', 'call plan() first; a hand-made plan is not accepted (its gaps would be unknown)')
      const at = clock()
      let state
      if (initial === null || initial === undefined) state = emptyState()
      else {
        const shape = assertStateShape(initial)
        if (!shape.ok) throw deny('VMU_INVALID_ARGUMENT', 'apply `initial` is not a replay state: ' + shape.why, shape.hint)
        const cloned = safeClone(initial)
        if (!cloned.ok) throw deny('VMU_INVALID_ARGUMENT', 'apply `initial` cannot be cloned safely: ' + cloned.why, cloned.hint)
        state = cloned.value
      }
      let applied = 0
      let skipped = 0
      const unknownKinds = {}
      let stateKeys = 0
      for (const ev of plan.events) {                     // plan.events is deeply frozen: read-only by construction
        const kind = ev.what
        const reduce = reducers.get(kind)
        // universal accounting (the counting discipline: nothing is silently skipped)
        state.events += 1
        bump(state.counts.byKind, kind, 1)
        const prefix = String(kind).split('/')[0]
        bump(state.counts.byPrefix, prefix, 1)
        if (state.timeline.firstAt === null) { state.timeline.firstAt = ev.ts; state.timeline.firstSeq = ev.seq }
        if (state.timeline.lastAt !== null && ev.ts < state.timeline.lastAt) state.timeline.inverted += 1
        state.timeline.lastAt = ev.ts; state.timeline.lastSeq = ev.seq
        if (!reduce) {
          skipped += 1
          bump(unknownKinds, kind, 1)
          if (keepUnknown) bump(state.unknownKinds, kind, 1)
          continue
        }
        const out = reduce(state, ev, { at, fingerprintOf })
        if (out && typeof out === 'object') { Object.assign(state, out) }
        applied += 1
        stateKeys = Object.keys(state.objects || {}).length + Object.keys(state.middleware.entries || {}).length
        if (maxStateKeys > 0 && stateKeys > maxStateKeys) {
          state.truncated.droppedStateKeys += 1
          bump(state.refusals, 'VMU_RESOURCE_BUDGET', 1)
        }
      }
      counters.applies += 1
      state.unknownKinds = sortedObj(Object.assign({}, state.unknownKinds, unknownKinds))
      state.truncated.droppedEvents = (state.truncated.droppedEvents || 0) + (plan.truncated ? plan.truncated.droppedEvents : 0)
      const empty = plan.events.length === 0
      const fp = fingerprintOf(state)
      lastApplySummary = { at, plan: plan.id, applied, skipped, events: plan.events.length, empty, fingerprint: fp }
      say({ type: 'replay/applied', at, plan: plan.id, applied, skipped, fingerprint: fp })
      return {
        ok: true,
        empty,
        reconstructed: !empty,
        state,
        applied, skipped,
        unknownKinds: sortedObj(unknownKinds),
        unknownTotal: Object.values(unknownKinds).reduce((a, b) => a + b, 0),
        gaps: plan.gaps.slice(),
        truncated: Object.assign({}, plan.truncated),
        fingerprint: fp,
        note: empty
          ? 'no events were applied: the state is the (empty) initial state — "已重建" would be a lie'
          : (skipped > 0
            ? 'the state was rebuilt from ' + applied + ' known event(s); ' + skipped + ' event(s) of unknown kind were COUNTED but not reduced (see unknownKinds)'
            : 'the state was rebuilt from ' + applied + ' event(s)'),
      }
    },

    /** READ-ONLY: compare a given state with a fresh reconstruction of the same plan (byte level). */
    verify({ state = null, plan = null } = {}) {
      if (state === null) throw deny('VMU_INVALID_ARGUMENT', 'verify needs the `state` to compare', 'pass the state returned by apply()')
      const shape = assertStateShape(state)
      if (!shape.ok) throw deny('VMU_INVALID_ARGUMENT', 'verify `state` is not a replay state: ' + shape.why, shape.hint)
      const p = plan === null ? api.plan() : { plan }
      const fresh = api.apply({ plan: p.plan })
      counters.verifies += 1
      const a = canonicalize(state)
      const b = canonicalize(fresh.state)
      let firstDiffAt = -1
      for (let i = 0; i < Math.min(a.length, b.length); i++) if (a[i] !== b[i]) { firstDiffAt = i; break }
      if (firstDiffAt === -1 && a.length !== b.length) firstDiffAt = Math.min(a.length, b.length)
      const match = a === b
      say({ type: 'replay/verified', at: clock(), match, plan: p.plan.id })
      return {
        ok: true, match, equal: match, firstDiffAt: match ? -1 : firstDiffAt,
        expectedFingerprint: fingerprintOf(fresh.state), actualFingerprint: fingerprintOf(state),
        canonicalLengths: [a.length, b.length],
        note: match
          ? 'the state is byte-identical to a fresh reconstruction of the same plan'
          : 'the state DIFFERS from a fresh reconstruction: the diff starts at byte ' + firstDiffAt,
      }
    },

    /** READ-ONLY: the gaps, without planning an apply (empty audit says so explicitly). */
    gaps({ until = null, kinds = null } = {}) {
      counters.gapCalls += 1
      const p = api.plan({ until, kinds })
      return {
        ok: true, empty: p.empty, count: p.gaps.length, gaps: p.gaps,
        blocking: p.gaps.filter((g) => g.severity === 'blocking').length,
        unknownKinds: p.unknownKinds, truncated: p.truncated,
        note: p.empty
          ? 'no events: the audit is empty, so the gap report says "no-events" rather than "complete"'
          : (p.gaps.length ? 'the reconstruction is INCOMPLETE: see the listed gaps' : 'no gaps inside the replayed window'),
      }
    },

    /** READ-ONLY self-report. */
    status() {
      return {
        ok: true,
        apiVersion,
        configured: reducers.size > 0,
        settings: { maxEvents, strict: strictSetting, requireContiguousSeq, maxStateKeys, keepUnknown, auditRingMax },
        reducers: [...reducers.keys()].sort(),
        prefixes: AUDIT_PREFIXES.slice(),
        counters: Object.assign({}, counters),
        refusals: sortedObj(Object.fromEntries(refusals)),
        refusalsTotal: [...refusals.values()].reduce((a, b) => a + b, 0),
        lastPlan: lastPlanSummary ? Object.assign({}, lastPlanSummary) : null,
        lastApply: lastApplySummary ? Object.assign({}, lastApplySummary) : null,
        idempotencySeam: !!(idempotency && typeof idempotency.fingerprintOf === 'function'),
        source: readSource().source,
        cloneKind: CLONE_KIND,
        lossyTypes: LOSSY_TYPES.slice(),
        clone: {
          kind: CLONE_KIND, backend: CLONE_BACKEND, lossyTypes: LOSSY_TYPES.slice(),
          refuses: ['function', 'symbol', 'cycle', 'unclonable-exotic (manual backend only)'],
          note: 'byte-equality is promised over the TAGGED canonical form: the tags are listed in lossyTypes; '
            + 'an `initial` that cannot be cloned losslessly is REFUSED BY NAME instead of being silently mangled (K5)',
        },
        at: clock(),
        note: 'K5: a pure read-only reconstruction — gaps are reported, unknown kinds are counted, an empty audit is never called a reconstruction',
      }
    },
  }

  // ── built-in reducers (the audit vocabulary the bus emits; all PURE, no service access) ─────────────
  const reg = (kind, fn) => reducers.set(kind, fn)
  reg('middleware/registered', (s, e) => {
    if (typeof e.id === 'string' && e.id) s.middleware.entries[e.id] = { order: e.order === undefined ? null : e.order, failure: e.failure === undefined ? null : e.failure, keys: Array.isArray(e.keys) ? e.keys.slice() : null }
  })
  reg('middleware/disabled', (s, e) => { if (typeof e.id === 'string' && e.id) { s.middleware.disabled[e.id] = e.reason === undefined ? 'disabled' : e.reason; if (s.middleware.entries[e.id]) s.middleware.entries[e.id].disabled = true } })
  reg('middleware/enabled', (s, e) => { if (typeof e.id === 'string' && e.id) { delete s.middleware.disabled[e.id]; if (s.middleware.entries[e.id]) s.middleware.entries[e.id].disabled = false } })
  reg('middleware/decision', (s, e) => { bump(s.middleware.decisions, e.hook === undefined || e.hook === null ? 'unknown-hook' : String(e.hook), 1) })
  reg('middleware/failed', (s, e) => { if (typeof e.id === 'string' && e.id) bump(s.middleware.failures, e.id, 1); if (e.code) bump(s.refusals, String(e.code), 1) })
  reg('middleware/failure-policy', (s, e) => { bump(s.refusals, 'failure-policy:' + String(e.policy === undefined ? 'unknown' : e.policy), 1) })
  reg('middleware/breaker-tripped', (s, e) => { if (typeof e.id === 'string' && e.id) { bump(s.middleware.failures, e.id, 1); s.middleware.disabled[e.id] = 'breaker: ' + String(e.consecutive === undefined ? '?' : e.consecutive) + ' consecutive failures' } })
  reg('middleware/dry-run', (s, e) => { s.middleware.dryRun = e.dryRun === undefined ? true : e.dryRun === true })
  reg('middleware/skipped', (s, e) => { bump(s.counts.byPrefix, 'middleware/skipped', 1) })
  reg('control/paused', (s, e) => { s.control.paused += 1; s.control.state = 'paused'; s.control.lastReason = e.reason === undefined ? null : e.reason })
  reg('control/resumed', (s, e) => { s.control.resumed += 1; s.control.state = 'running'; s.control.lastReason = e.reason === undefined ? null : e.reason })
  reg('control/heartbeat', (s) => { s.control.heartbeats += 1 })
  reg('control/stopped', (s, e) => { s.control.state = 'stopped'; s.control.lastReason = e.reason === undefined ? null : e.reason })
  const countReducer = (bucket, keyOf) => (s, e) => { bump(s.objects, bucket + ':' + String(keyOf(e)), 1) }
  reg('metrics/observed', countReducer('metrics', (e) => e.indicator === undefined ? 'unknown' : e.indicator))
  reg('metrics/dropped', (s) => { bump(s.refusals, 'metrics/dropped', 1) })
  reg('alerts/fired', (s, e) => { bump(s.objects, 'alert:' + String(e.fingerprint === undefined ? 'unknown' : e.fingerprint), 1); if (e.code) bump(s.refusals, String(e.code), 1) })
  reg('alerts/silenced', (s, e) => { bump(s.objects, 'silenced:' + String(e.silence === undefined ? 'unknown' : e.silence), 1); if (e.code) bump(s.refusals, String(e.code), 1) })
  reg('alerts/suppressed', (s, e) => { bump(s.objects, 'suppressed:' + String(e.by === undefined ? 'unknown' : e.by), 1); if (e.code) bump(s.refusals, String(e.code), 1) })
  reg('bidding/posted', (s, e) => { bump(s.objects, 'post:' + String(e.post === undefined ? 'unknown' : e.post), 1) })
  reg('bidding/bid', (s, e) => { bump(s.objects, 'bid:' + String(e.post === undefined ? 'unknown' : e.post), 1) })
  reg('bidding/closed', (s, e) => { bump(s.objects, 'closed:' + String(e.post === undefined ? 'unknown' : e.post), 1) })
  reg('bidding/awarded', (s, e) => { bump(s.objects, 'awarded:' + String(e.post === undefined ? 'unknown' : e.post), 1) })
  reg('bidding/cancelled', (s, e) => { bump(s.objects, 'cancelled:' + String(e.post === undefined ? 'unknown' : e.post), 1) })
  reg('idempotency/begun', (s, e) => { bump(s.objects, 'idem-begun:' + String(e.key === undefined ? 'unknown' : e.key), 1) })
  reg('idempotency/committed', (s, e) => { bump(s.objects, 'idem-committed:' + String(e.key === undefined ? 'unknown' : e.key), 1) })
  reg('idempotency/aborted', (s, e) => { bump(s.objects, 'idem-aborted:' + String(e.key === undefined ? 'unknown' : e.key), 1) })
  reg('idempotency/deduplicated', (s, e) => { bump(s.objects, 'idem-dedup:' + String(e.key === undefined ? 'unknown' : e.key), 1) })
  reg('records/appended', (s, e) => { bump(s.objects, 'record:' + String(e.id === undefined ? 'unknown' : e.id), 1) })
  reg('records/append-before', (s, e) => { if (typeof e.id === 'string' && e.id) bump(s.objects, 'record-intent:' + e.id, 1) })

  // The empty-source convenience: `audit: []` is a legitimate (zero-mechanism) source and must not throw.
  if (audit === undefined) audit = []

  return api
}

// tests/audit-host-receipt-superset.mjs — TB-2668 §3.2: THE HOST TOOL BRANCH MUST CARRY THE KERNEL'S OWN RECEIPT.
//
// THE DEFECT THIS GATE EXISTS FOR. One receipt has two producers: the kernel computes the whole reading, then the host
// tool branch lists keys back out of it one by one. A reading the kernel adds later therefore VANISHES at the tool face
// and nothing goes red. That has already happened three times (the historical patch points):
//   * `orderUnknown` (TB-2654)            — forwarded at host.js:1139 only after the fact;
//   * `orphan` / `orphanWhy` (TB-2651)    — kernel/turn/index.js receipts;
//   * `appliedPacks[].declarations` (AUDIT-14 P0-1) — vibe-math-vmu.js:743/785 (plugin layer, see scope note below).
// Each fix was "add one line to the host branch". Nothing asserted the GENERAL rule:
//
//     kernelKeys - hostKeys === 0          (TB-2668 §3.2)
//
// SCOPE (the lead's ruling, 2026-11-09). `host.js` has TWO kinds of faces:
//   · 7 IN-SCOPE faces with an explicit branch written in host.js itself — status:516, set:850, middleware:964,
//     records:1023, direction:434 (makeDirectionSpec, pushed at :1758), script:1577, pack:1634. THESE are measured
//     here: kernelKeys - hostKeys must be 0 for every (tool, action) they advertise, plus the status face's `detail`
//     slices (closure / closure-account / provenance), which are composed receipts.
//   · the factory faces (`host.js:206-274` TOOL_FACES rows -> `vibe-math-vmu/tools/*.js` make<Face>Spec). They are
//     enumerated and counted, then listed in the PENDING_SCOPE table: Phase 2 covers them with a recording Proxy
//     (TB-2673). They are NEVER silently skipped — the printed scope line says how many were measured and how many are
//     pending, so the reader can see the number is not the whole registry.
// A NOTE ON COUNTS: the ruling expected `compared=7 / outOfScope=99` (106 faces). The registry this gate READS (never
// hand-copies) publishes 58 faces under a full host ctx: 7 explicit + 51 factory. `grep -c make.*Spec host.js` = 156
// counts call sites/imports, not faces. The gate reports what `host.toolSpecs()` actually publishes; a face added later
// is measured (or listed) the moment it is advertised.
//
// HOW A RECEIPT IS ATTRIBUTED (two-way, same call path). The taskbook allows the kernel receipt to be the one the host
// itself used ("host 内部那条内核调用路径"). The kernel handed to `toolSpecs()` is wrapped in a Proxy that records every
// service method the action calls and tags every value it returns with a token. The tool is then called for real
// (`toHostSpec(...).execute(args, {})`) and the object the host serialised is recovered by intercepting
// `JSON.stringify`. A token in the payload proves the kernel value was forwarded whole; a kernel receipt whose token is
// absent while the host read >= 2 of its keys proves the branch rebuilt it by picking fields — only then is a key
// difference meaningful. Attribution scores the branch's own refusal code first, then how many of the receipt's keys the
// branch actually looked at (reads alone mis-attribute helper calls made inside the branch).
//
// NESTING. One level is followed: a receipt nested as `$.result`, `$.minutes` or `$.records[0]` is located, object keys
// are compared one level deep (`shared.pulls`), and row-list keys element-wise (`records[].owner`). A kernel receipt
// that is forwarded whole inside a namespace is reported as `nestedOnly` (evidence of the WRAPPED shape), not as loss.
//
// TWO MISSING-KEY CLASSES, because the tool face has two receipt shapes:
//   A. receipt-missing       — a SUCCESS receipt (§3.2 proper).
//   B. refusal-fact-missing  — a REFUSAL receipt (the kernel returned/threw a named refusal carrying code,hint,
//                              enforced,enforcedScope,wouldEvaluate,op,...). Same seam, reported separately.
//
// EXCEPTIONS ARE FOUR NAMED TABLES, EACH WITH ITS OWN SHAPE (TB-2668 §6, lead's ruling):
//   REKEYED         {from: {to, verify}}  — the host renames a kernel key (row list `items` -> `records`). The rename
//                   is VERIFIED at runtime by value identity (same row ids); a rename that does not verify is a finding.
//   WRAPPED         {ns, why, decidedBy}  — the kernel receipt is nested whole under one namespace (middleware
//                   disable/enable: the refusal carries its own ok/action, so flattening would collide). Compared
//                   INSIDE the namespace.
//   NOT_FROM_KERNEL {composedOf:['kernel.x',...] | parts:[...] , why} — the receipt is composed by the host from named
//                   kernel views (or has no kernel source at all). Anti-mask rule: every key of every named view must be
//                   visible in the receipt; a kernel reading this table forgot is a class-A finding, so the exception
//                   cannot hide kernel output.
//   PENDING_SCOPE   {points, why}  — faces enumerated but not measured in this phase (Phase 2, TB-2673). Counted.
//   (HOST_HIDDEN_KEYS exists for keys deliberately withheld from a seat; it must be named to the key + reason + owner,
//    and is asserted EMPTY today: every missing key measured so far is a loss, not a hidden one.)
//
// THE GATE CAN FAIL, SO IT IS SHOWN FAILING.
//   --self-test                               synthetic receipts prove judge() goes RED on a 3-key-vs-1-key receipt and
//                                             GREEN when the four declared shapes/licences are applied.
//   --plant-hide=kernel.status:closureVote    hides a key the kernel really returns (same result as deleting a host
//                                             passthrough line): the gate must name it. This is the 反关灯 proof that
//                                             runs on today's tree.
//   --plant-extra=kernel.records.list:__x     adds a kernel fact a PICKING host branch would not know: the gate names it.
//                                             (Today every in-scope branch forwards its receipt whole, so this probe is
//                                             informational — see the note printed with it. The picking case is proven
//                                             by the host-side spread->pick experiment in the task report.)
//   --only=<tool>/<action>                    restrict the live run to one point.
// No flag edits any repo file; the planted defect lives in the measurement seam (write domain: this file only).
//
// SCOPE NOTE (`appliedPacks[].declarations`): that historical point lives in `vibe-math-vmu/vibe-math-vmu.js:743/785`
// (the plugin's status receipt maps applied packs to ids), NOT in a host.js tool branch. This gate measures the host.js
// tool surface; the plugin registration layer needs its own consumer of this criterion (reported to the lead).
//
// THREE HARD RULES (the lead's conditions, 2026-11-09 — they are the reason the tables below can be trusted):
//   R1. AN EXCEPTION IS NEVER A RESIDENCE PERMIT. If the kernel itself produces the reading a table declares, the reading
//       must be REMOVED from the table and the gate must go RED. So every declared shape is verified against the live
//       receipt: a REKEYED kernel key that ALSO survives under its own name (`'items' in receipt === true`), or a WRAPPED
//       namespace whose kernel keys are ALSO forwarded flat at the top level, is named and fails the gate ("REKEYED shape"
//       / "WRAPPED disarm"). --self-test carries one case of each, so a table cannot quietly become permanent.
//   R2. PENDING_SCOPE COUNTS ARE COMPUTED FROM THE REGISTRY, never typed as constants: the scope line prints
//       compared=<measured in-scope> and outOfScope=<registry faces - in-scope>, and an assertion checks the two
//       partitions add up to the registry's own numbers.
//   R3. THE GATE MEASURES, IT DOES NOT REPAIR. No flag and no run edits host.js, kernel/** or any other test; the planted
//       -defect modes only bend the measurement seam inside this file (write domain: this file only).
//
// RULE E: every printed count states what it counts, and no finding is reported as a bare number.
import { mkdtemp, rm } from 'node:fs/promises'
import { readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname, resolve } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = resolve(HERE, '..')
const VMU = join(REPO, 'vibe-math-vmu')
const imp = (p) => import(pathToFileURL(p).href)
// Imported as a library (the Phase 2 self-test does that) the file must not boot a kernel; run directly, it must.
const IS_MAIN = (() => {
  try { return !!process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url } catch { return false }
})()

let passed = 0
let failed = 0
const failures = []
const ok = (cond, label, detail) => {
  if (cond) { passed += 1; console.log('  ok   ' + label); return true }
  failed += 1
  failures.push(label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  console.error('  FAIL ' + label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  return false
}

// ── flags ──────────────────────────────────────────────────────────────────────────────────────────────────────────
const flagValue = (name) => {
  const hit = process.argv.find((a) => a.startsWith('--' + name + '='))
  if (hit) return hit.slice(('--' + name + '=').length) || null
  // also accept the space form the taskbook uses (`--faces spec`), so the flag cannot be silently ignored
  const idx = process.argv.indexOf('--' + name)
  return idx >= 0 ? (process.argv[idx + 1] || null) : null
}
const flagPair = (name) => {
  const value = flagValue(name)
  if (!value) return null
  const [path, key] = value.split(':')
  return path && key ? { path, key } : null
}
const SELF_TEST = process.argv.includes('--self-test')
const PLANT_HIDE = flagPair('plant-hide')
const PLANT_EXTRA = flagPair('plant-extra')
const ONLY = flagValue('only')
// ── Phase 2 attribution: the PRIMARY rule, stated where it is applied (lead ruling 2026-11-09) ─────────────────────
// PRIMARY = ANY recorded kernel receipt whose `value.code` equals the code on the face's receipt — a thrown `Error`
// (`kind:'error'`) **and** a RETURNED refusal object (`kind:'object'`, several services `return {ok:false,code,hint,…}`
// instead of throwing). Matching only `kind==='error'` (the first cut) declared 23 correctly-forwarded returned refusals
// `refused-without-matched-receipt`: 27 points in that bucket before, 4 after (the 4 are helper-reads that never carry a
// code — see the acceptance doc §5.2). This rule is attribution, not permission: the 23 moved into `compared`, where they
// still have to pass class A/B (they do), so the change removed FALSE mismatches and did not fold real gaps into `compared`.
// `--legacy-primary` restores the error-only rule on purpose: those 23 points must reappear as refused-without-matched.
const LEGACY_PRIMARY = process.argv.includes('--legacy-primary')
// TB-2673 Phase 2: `--faces spec` measures EVERY published face through a recording Proxy (union of kernel receipts vs
// the face receipt). The default (`explicit`) is the Phase 1 criterion over the 7 branches written in host.js itself, so
// an existing invocation keeps exactly the Phase 1 meaning.
const FACES = flagValue('faces') || 'explicit'
if (!['explicit', 'spec'].includes(FACES)) {
  console.error('unknown --faces=' + FACES + ' (expected explicit|spec)')
  process.exit(2)
}

// ── the in-scope faces: the 7 branches written in host.js itself ───────────────────────────────────────────────────
const IN_SCOPE = Object.freeze({
  vibe_vmu_status: { line: 516 },
  vibe_vmu_set: { line: 850 },
  vibe_vmu_middleware: { line: 964 },
  vibe_vmu_records: { line: 1023 },
  vibe_vmu_direction: { line: 434 },
  vibe_vmu_script: { line: 1577 },
  vibe_vmu_pack: { line: 1634 },
})
const IN_SCOPE_NAMES = new Set(Object.keys(IN_SCOPE))
// The status face's `detail` slices are composed receipts (different kernel views per slice), not key-subsets of one
// call, so each slice is a measured point of its own.
const VARIANTS = { vibe_vmu_status: [{ detail: 'closure' }, { detail: 'closure-account' }, { detail: 'provenance' }] }

// ── the four exception tables (+ HOST_HIDDEN_KEYS) ────────────────────────────────────────────────────────────────
const REKEYED = {
  // The row list is the ONE rename the taskbook licenses. `absent` is the second half of the promise: a rename replaces
  // the key, it does not copy it — the receipt must NOT still carry `items` (asserted separately below).
  'vibe_vmu_records/list': { items: { to: 'records', verify: 'row-ids', absent: 'items' } },
}
const WRAPPED = {
  'vibe_vmu_middleware/disable': { ns: 'result', why: 'the kernel bus receipt carries its own ok/action, so flattening it into the host receipt would collide with the face\'s ok/action; nesting is disambiguation, not hiding', decidedBy: 'TB-2668 §6 (single-producer ruling)' },
  'vibe_vmu_middleware/enable': { ns: 'result', why: 'same as middleware/disable: the bus receipt is nested whole under `result` (disambiguation of ok/action, not hiding)', decidedBy: 'TB-2668 §6 (single-producer ruling)' },
}
const HOST_HIDDEN_KEYS = {}
const NOT_FROM_KERNEL = {
  // status' `detail` slices: the full status receipt is the INPUT of a much smaller, deliberately different view.
  'vibe_vmu_status/detail:closure': {
    composedOf: ['kernel.closureVoteView'],
    keys: ['closureVote'],
    why: 'detail:closure answers ONLY the closing reading; instance/counts/note are the face\'s own naming of that one reading, and the rest of the status receipt is not this face\'s job',
  },
  'vibe_vmu_status/detail:closure-account': {
    composedOf: ['kernel.closureFreezeView'],
    keys: ['asOfClose'],
    why: 'detail:closure-account answers ONLY the latest as-of-close account: the freeze view is nested whole under asOfClose, nothing of it is dropped',
  },
  'vibe_vmu_status/detail:provenance': {
    composedOf: ['kernel.status({detail:"full"})', 'kernel.store.read'],
    keys: ['settings', 'bridge', 'math', 'projections'],
    why: 'provenance answers only "whose table is this and which seam is which": it reads the full status receipt (settings.resolvedIn, bridge, math, projections) and the store writer stamps, and forwards that smaller view instead (detail:full is the door that forwards the whole receipt)',
  },
  // host-owned parts: no kernel call exists behind these lists.
  'vibe_vmu_script/list': {
    parts: ['host-configured scripts array passed to toolSpecs({ scripts })'],
    why: 'the script face lists what the HOST was given to carry; the kernel executes a script, it does not own the list',
  },
  'vibe_vmu_pack/list': {
    parts: ['host-supplied packLoader().status()'],
    why: 'the pack lists belong to the host loader that was injected; the kernel has no pack registry of its own to answer from',
  },
  // The default status face is the ROUND-22 BOUNDED view of the status receipt: every bulky section is replaced by a
  // small summary that keeps a pointer to the full reading (note / proseOmitted / detail:"full"). The top level is still
  // forwarded whole (token evidence), so a top-level loss stays class A; only the named sections may elide, and every
  // elided key is printed in the `suppressed` list by name. detail:"full" is the door that forwards the receipt whole.
  'vibe_vmu_status/-': {
    composedOf: ['kernel.status'],
    boundedSections: ['settings', 'bus', 'bridge', 'math', 'closureVote', 'loader', 'prompt', 'auditTail', 'packTools', 'faces'],
    why: 'the default (detail:summary) face is deliberately bounded: bulky kernel sections are summarised with a pointer (detail:"full"/"settings"), which is the ROUND-22 readability contract asserted by vmu-host.test.mjs (<8000 B); the full status receipt is one argument away and is asserted elsewhere',
  },
  // Direction cards are composed by the host-side card module over record rows. `kernel.records.list` is that module's
  // storage query, NOT a receipt this face forwards — nothing of the records.list receipt is promised to the caller.
  'vibe_vmu_direction/list': {
    parts: ['host createDirections() over kernel.records rows (vibe-math-vmu/kernel/directions.js:228)'],
    internalReads: ['kernel.records.list'],
    why: 'direction cards are derived data: directions.js queries record rows (records.list) and composes {direction,id,updatedAt,revision,fieldsMissing,fieldsMissingNames} itself; the records.list receipt is the storage read behind the cards, not a forwarded receipt',
  },
}
const PENDING_SCOPE = {} // generated: face -> { points, why } for the factory faces (Phase 2, TB-2673)
// The ONE table set both phases share (TB-2673 §3.2: Phase 2 may not declare a second table).
const TABLES = Object.freeze({ REKEYED, WRAPPED, NOT_FROM_KERNEL, HOST_HIDDEN_KEYS })

// ── measurement machinery ─────────────────────────────────────────────────────────────────────────────────────────
const TOKEN_KEY = '__vmuAuditReceiptToken'
let tokenSeq = 0
const newToken = () => '__VMU_TOKEN_' + (++tokenSeq) + '__'
const FIXED_CLOCK = 1800000000000
let calls = []

const isPlain = (v) => v && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Date) && !(v instanceof Promise) && !(v instanceof Error)
const enumerableKeys = (o) => Object.keys(o)
const dataLike = (o) => !Object.values(o).some((v) => typeof v === 'function')

/** A kernel value that came back as a receipt: plain object, array of rows, or a named refusal (Error). */
function instrument(value, path) {
  if (Array.isArray(value)) {
    const rec = { kind: 'array', path, token: null, keys: [], reads: new Set(), elementKeys: [] }
    const copy = value.map((el) => {
      if (!isPlain(el)) return el
      rec.elementKeys.push(Object.keys(el))
      const t = newToken()
      const c = { ...el }
      if (PLANT_EXTRA && PLANT_EXTRA.path === path) c[PLANT_EXTRA.key] = true
      c[TOKEN_KEY] = t
      calls.push({ kind: 'element', path: path + '[]', token: t, keys: Object.keys(el), reads: new Set(), values: { ...el }, elementKeys: Object.keys(el) })
      return c
    })
    rec.keys = rec.elementKeys.flat()
    calls.push(rec)
    return copy
  }
  if (value instanceof Error) {
    const rec = { kind: 'error', path, token: newToken(), keys: enumerableKeys(value), reads: new Set(), values: Object.assign({}, value) }
    calls.push(rec)
    const hide = PLANT_HIDE && PLANT_HIDE.path === path ? PLANT_HIDE.key : null
    return new Proxy(value, {
      get(tg, k, r) { if (k === TOKEN_KEY) return rec.token; if (hide && k === hide) return undefined; rec.reads.add(String(k)); return Reflect.get(tg, k, r) },
      has(tg, k) { return k === TOKEN_KEY || (k !== hide && k in tg) },
      ownKeys(tg) { return Reflect.ownKeys(tg).concat([TOKEN_KEY]).filter((k) => k !== hide) },
      getOwnPropertyDescriptor(tg, k) {
        if (k === TOKEN_KEY) return { value: rec.token, enumerable: true, configurable: true, writable: true }
        return Reflect.getOwnPropertyDescriptor(tg, k)
      },
    })
  }
  if (!isPlain(value)) {
    // A scalar is a LEGAL kernel receipt (clockguard.now -> number, bidding.fingerprintOf -> string, ...). Record it:
    // otherwise a point whose only kernel answer is a primitive reads as "no kernel call at all".
    if (value !== undefined && value !== null && typeof value !== 'object' && typeof value !== 'function') {
      calls.push({ kind: 'primitive', path, token: null, keys: [], reads: new Set(), values: { value }, primitiveType: typeof value })
    }
    return value
  }
  const rec = { kind: 'object', path, token: newToken(), keys: enumerableKeys(value), reads: new Set(), values: Object.assign({}, value) }
  // Callable kernel keys (kernel.status -> auditVerify/auditCheckpoint/closureVoteInput) travel as LIVE FUNCTIONS on the
  // payload object but cannot survive JSON: they are receipt keys the tool caller never sees. Compare only the DATA keys
  // (functions are not key-subsets); the function keys are reported separately as `unserializable`, never silently lost.
  rec.fnKeys = rec.keys.filter((k) => typeof value[k] === 'function')
  rec.keys = rec.keys.filter((k) => typeof value[k] !== 'function')
  calls.push(rec)
  const copy = { ...value }
  if (PLANT_EXTRA && PLANT_EXTRA.path === path) { copy[PLANT_EXTRA.key] = true; rec.keys.push(PLANT_EXTRA.key); rec.values[PLANT_EXTRA.key] = true }
  if (PLANT_HIDE && PLANT_HIDE.path === path) delete copy[PLANT_HIDE.key]
  copy[TOKEN_KEY] = rec.token
  return new Proxy(copy, { get(tg, k, r) { if (k !== TOKEN_KEY) rec.reads.add(String(k)); return Reflect.get(tg, k, r) } })
}

/** Deep proxy over the kernel: every service method call is recorded with the path that identifies its producer. */
function wrapService(obj, path, seen = new WeakMap()) {
  if (seen.has(obj)) return seen.get(obj)
  const p = new Proxy(obj, {
    get(t, k, r) {
      const v = Reflect.get(t, k, r)
      if (typeof v !== 'function') return v && typeof v === 'object' && !Array.isArray(v) ? wrapService(v, path + '.' + String(k), seen) : v
      return function (...args) {
        let out
        try { out = v.apply(t, args) } catch (e) { throw instrument(e, path + '.' + String(k)) }
        if (out && typeof out.then === 'function') {
          return out.then((val) => instrument(val, path + '.' + String(k)), (err) => { throw instrument(err, path + '.' + String(k)) })
        }
        return instrument(out, path + '.' + String(k))
      }
    },
  })
  seen.set(obj, p)
  return p
}

const origStringify = JSON.stringify
let payloads = []
const captureStringify = (v, ...a) => { payloads.push(v); return origStringify(v, ...a) }

function scanTokens(payload) {
  const found = new Map()
  const seen = new WeakSet()
  const walk = (v, path, depth) => {
    if (!v || typeof v !== 'object' || depth > 4 || seen.has(v)) return
    seen.add(v)
    if (Array.isArray(v)) { for (let i = 0; i < v.length && i < 25; i += 1) walk(v[i], path + '[' + i + ']', depth + 1); return }
    const t = v[TOKEN_KEY]
    if (typeof t === 'string' && !found.has(t)) found.set(t, path)
    for (const k of Object.keys(v)) if (k !== TOKEN_KEY) walk(v[k], path + '.' + k, depth + 1)
  }
  walk(payload, '$', 0)
  return found
}

/** Does the host payload carry the kernel row list under the declared renamed key? Verified, not assumed.
 *  row-ids: the two id lists must be LITERALLY equal (same ids, same order) — not a subset, and NOT skipped when the
 *  kernel list is empty: an empty lane is exactly the case where a broken rename would hide (the kernel would say
 *  "0 rows" and a picker that forwards nothing would look correct). */
function rekeyVerifies(scope, rule, kernelValue) {
  const hostVal = scope[rule.to]
  if (hostVal === undefined) return false
  const ids = (rows) => (Array.isArray(rows) ? rows.map((r) => (r && r.id !== undefined ? String(r.id) : null)).filter((x) => x !== null) : [])
  if (rule.verify === 'row-ids') {
    const hi = ids(hostVal)
    const ki = ids(kernelValue)
    return hi.length === ki.length && ki.every((id, i) => id === hi[i])
  }
  if (rule.verify === 'same') {
    try { return origStringify(hostVal) === origStringify(kernelValue) } catch { return false }
  }
  return false
}

// ── the judge: ONE receipt in, findings out (used by the live run AND by --self-test) ─────────────────────────────
// input: { key, calls, payload, tokens }      tables: optional override (self-test passes its own)
// output: { classA:[{path,kernelSource}], classB:[...], nestedOnly:[{path,kernelSource}], hidden:[key],
//           unmeasured:null|'scalar'|'helper-only'|'no-kernel-call', tableErrors:[text], declared:null|rule }
export function judge({ key, calls: cs, payload, tokens }, tables = TABLES) {
  const out = { classA: [], classB: [], nestedOnly: [], hidden: [], unserializable: [], suppressed: [], renameErrors: [], wrappedConflicts: [], unmeasured: null, tableErrors: [], declared: null }
  const payloadKeys = new Set(payload && typeof payload === 'object' && !Array.isArray(payload) ? Object.keys(payload).filter((k) => k !== TOKEN_KEY) : [])
  const topVisible = (k) => payloadKeys.has(k) && payload[k] !== undefined
  const nestedHits = (k) => {
    const hits = []
    for (const ns of payloadKeys) {
      const v = payload[ns]
      if (v && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Error) && k in v) hits.push(ns + '.' + k)
    }
    return hits
  }
  const visibleSomewhere = (k) => topVisible(k) || nestedHits(k).length > 0
  const tool = String(key).split('/')[0]
  // Framework keys every receipt may carry: they are the seam's own vocabulary (ok/action/code/...), not the reading a
  // table would hide, so the anti-mask and WRAPPED-disarm checks ignore them.
  const FRAMEWORK = new Set(['ok', 'action', 'code', 'hint', 'message', 'instance', 'note'])
  const hidden = Object.assign({}, tables.HOST_HIDDEN_KEYS[key] || {}, tables.HOST_HIDDEN_KEYS[tool] || {})
  const rekey = tables.REKEYED[key] || {}
  const wrapped = tables.WRAPPED[key] || tables.WRAPPED[tool] || null
  const nfk = tables.NOT_FROM_KERNEL[key] || tables.NOT_FROM_KERNEL[tool] || null
  // declared paths may name the call with its args (`kernel.status({detail:"full"})`); the recorded path is the method.
  const findCall = (path) => {
    const name = String(path).replace(/\(.*\)$/, '')
    return cs.find((c) => c.path === name) || cs.find((c) => c.path.startsWith(name))
  }
  const receiptLike = (c) => c.kind === 'object' || c.kind === 'array' || c.kind === 'error'
  const tokenPath = (c) => (c.token ? tokens.get(c.token) : undefined)

  const deepCompare = (hostVal, kernelVal, basePath, producer, boundedView = false) => {
    const note = (path) => (boundedView ? out.suppressed.push({ path, kernelSource: producer }) : out.classA.push({ path, kernelSource: producer }))
    if (hostVal && kernelVal && typeof hostVal === 'object' && typeof kernelVal === 'object' && !Array.isArray(hostVal) && !Array.isArray(kernelVal)) {
      const hk = new Set(Object.keys(hostVal))
      for (const sk of Object.keys(kernelVal)) {
        if (hidden[sk] || hk.has(sk)) continue
        note(basePath + '.' + sk)
      }
      return
    }
    if (Array.isArray(hostVal) && Array.isArray(kernelVal)) {
      const hk = new Set(hostVal.flatMap((el) => (isPlain(el) ? Object.keys(el) : [])))
      const kk = new Set(kernelVal.flatMap((el) => (isPlain(el) ? Object.keys(el) : [])))
      for (const sk of kk) if (!hidden[sk] && !hk.has(sk)) note(basePath + '[]' + '.' + sk)
    }
  }

  // A NOT_FROM_KERNEL face may declare two extra shapes instead of hiding them (both stay exceptions with a reason):
  //   boundedSections — kernel views the face deliberately summarises under a byte budget (each elision keeps a pointer
  //                     to the full view): their losses are reported in `suppressed` BY NAME, never as silent class A.
  //   internalReads   — kernel calls that are the face's STORAGE QUERY, not a forwarded receipt: excluded from the
  //                     primary-receipt race, but the call must exist and must NOT be forwarded (R1, else DISARMED).
  const bounded = new Set(Array.isArray(nfk && nfk.boundedSections) ? nfk.boundedSections.map(String) : [])
  const internalReads = (Array.isArray(nfk && nfk.internalReads) ? nfk.internalReads : []).map((p) => String(p).replace(/\(.*\)$/, ''))
  const isInternal = (path) => internalReads.some((p) => path === p || path.startsWith(p + '.'))

  // compare one kernel receipt's keys against a host scope (the payload itself, or a declared namespace inside it)
  const compare = (scope, kern, producer) => {
    const scopeKeys = new Set(Object.keys(scope))
    for (const k of kern.keys) {
      if (hidden[k]) { out.hidden.push(k); continue }
      const rule = rekey[k]
      if (rule && rekeyVerifies(scope, rule, kern.values[k])) {
        // R1: a rename replaces the key; carrying BOTH shapes means the receipt was not renamed, so the exception no
        // longer describes it and the gate must go red instead of letting the table absorb a duplicated key.
        if (rule.absent && payload && Object.prototype.hasOwnProperty.call(payload, rule.absent)) {
          out.renameErrors.push({ path: rule.absent, kernelSource: producer, why: 'kernel key "' + k + '" is renamed to "' + rule.to + '", but the receipt ALSO carries it under its original name ("' + rule.absent + '" in receipt === true)' })
        }
        continue
      }
      if (scopeKeys.has(k) && scope[k] !== undefined) { deepCompare(scope[k], kern.values[k], k, producer, bounded.has(k)); continue }
      const hits = nestedHits(k)
      if (hits.length) { out.nestedOnly.push({ path: hits[0], kernelSource: producer }); continue }
      out.classA.push({ path: k, kernelSource: producer })
    }
  }

  // NOT_FROM_KERNEL: a face that COMPOSES (or does not come from) a kernel receipt. It declares the kernel views it
  // gathers, or the non-kernel parts it synthesises. Nothing is hidden: every key of a named view that does NOT survive
  // is reported in `suppressed` (declared composition, printed by name), and the anti-mask rule refuses an exception
  // that leaves no trace of the view it names. `keys` names the readings this face PROMISES and are compared hard.
  // This is a PRELUDE, not a shortcut: after it runs the point still goes through the normal attribution (so a face that
  // really forwards a receipt is compared as one, and a face that forwards nothing is reported as declared-composed).
  if (nfk) {
    out.declared = nfk
    for (const path of Array.isArray(nfk.composedOf) ? nfk.composedOf : []) {
      const c = findCall(path)
      if (!c) { out.tableErrors.push('NOT_FROM_KERNEL ' + key + ' names ' + path + ' but that call was not made'); continue }
      const reading = c.keys.filter((k) => !FRAMEWORK.has(k))
      let visible = 0
      for (const k of reading) {
        if (hidden[k]) { out.hidden.push(k); continue }
        if (visibleSomewhere(k)) { visible += 1; continue }
        out.suppressed.push({ path: k, kernelSource: path })
      }
      if (reading.length && visible === 0) {
        out.tableErrors.push('NOT_FROM_KERNEL ' + key + ' names ' + path + ' but the receipt carries none of its ' + reading.length + ' reading key(s) (' + reading.join(',') + '): the exception hides a reading instead of composing one')
      }
    }
    for (const k of Array.isArray(nfk.keys) ? nfk.keys : []) {
      if (visibleSomewhere(k)) continue
      out.classA.push({ path: k, kernelSource: (nfk.composedOf || []).join('+') || 'composed' })
    }
    for (const path of internalReads) {
      const c = findCall(path)
      if (!c) { out.tableErrors.push('NOT_FROM_KERNEL ' + key + ' names ' + path + ' as an internal storage read, but that call was not made'); continue }
      const p = tokenPath(c)
      if (p) out.tableErrors.push('NOT_FROM_KERNEL disarm ' + key + ': ' + path + ' is declared a storage read, but its receipt IS forwarded into this face (token at ' + p + ') — the exception no longer describes the shape and must be removed')
    }
  }
  // A declared NOT_FROM_KERNEL face that forwards NOTHING (no token evidence anywhere) is reporting a composed view,
  // not a subset of a receipt: its declared losses were already printed by name in `suppressed`, and the anti-mask rule
  // above proved it carries a trace of every view it names. Comparing it against one of those views would call the
  // composition itself a loss (which is exactly the false positive this table exists to name honestly).
  // EXCEPT when the entry declares `boundedSections`: those are sections of a receipt whose TOP LEVEL is still forwarded
  // whole. If such a face forwards no top-level receipt any more, the shape it declared is gone (the branch started
  // PICKING keys) — that is R1 disarmed, so the point must fall through to a named comparison and go RED.
  if (bounded.size) {
    if (!cs.some((c) => tokenPath(c) === '$')) {
      out.tableErrors.push('NOT_FROM_KERNEL disarm ' + key + ': it declares bounded sections of a forwarded receipt, but no top-level receipt is forwarded any more (no token at the receipt root) — the branch now picks keys instead of forwarding, which is exactly the loss this gate exists to catch')
    }
  } else if (nfk && !cs.some((c) => tokenPath(c))) { out.unmeasured = 'declared-composed'; return out }
  const pickPrimary = (list) => {
    const overlapOf = (c) => c.keys.filter((k) => payloadKeys.has(k)).length
    const scoreOf = (c) => ((c.kind === 'error' && payload && payload.code && c.values.code === payload.code) ? 1000 : 0) + overlapOf(c)
    return list.slice().sort((a, b) => (scoreOf(b) - scoreOf(a)) || (b.reads.size - a.reads.size) || (b.keys.length - a.keys.length))[0] || null
  }

  // a receipt-shaped return the branch actually read: token-forwarded, or read through (>=2 keys, or >=3 keys with >=1 read).
  // A declared internalReads call is a storage query, not a candidate for "the receipt this face forwards".
  const candidate = (c) => !isInternal(c.path) && receiptLike(c) && (!!c.token || c.reads.size >= 2 || (c.reads.size >= 1 && c.keys.length >= 3))
  const noteFn = (c) => { for (const k of c.fnKeys || []) if (!out.unserializable.some((u) => u.path === k + '@' + c.path)) out.unserializable.push({ path: k, kernelSource: c.path }) }

  if (wrapped) {
    const scope = payload && payload[wrapped.ns]
    if (!scope || typeof scope !== 'object' || Array.isArray(scope)) {
      if (!cs.length) { out.unmeasured = 'no-kernel-call'; return out }
      out.tableErrors.push('WRAPPED ' + key + ' declares namespace "' + wrapped.ns + '" but the receipt has no such object')
      return out
    }
    const primary = pickPrimary(cs.filter(candidate))
    if (!primary) { out.unmeasured = 'helper-only'; return out }
    noteFn(primary)
    // R1 (WRAPPED disarm): if the kernel's own keys are ALSO visible flat at the receipt's top level, the namespace is
    // not wrapping anything any more — the exception has outlived the shape it described and must be removed (RED).
    const flat = primary.keys.filter((k) => !FRAMEWORK.has(k) && !hidden[k] && Object.prototype.hasOwnProperty.call(payload, k) && payload[k] !== undefined)
    if (flat.length) {
      out.wrappedConflicts.push({ path: wrapped.ns, kernelSource: primary.path, flatKeys: flat })
      out.tableErrors.push('WRAPPED disarm: ' + key + ' declares the receipt whole under "' + wrapped.ns + '", but the kernel keys ' + flat.join(',') + ' are ALSO forwarded flat at the top level — the namespace wraps nothing; delete the exception')
    }
    compare(scope, primary, primary.path)
    return out
  }

  const topForwarded = cs.filter((c) => c.token && tokenPath(c) === '$')
  const nestedForwarded = cs.filter((c) => c.token && tokenPath(c) && tokenPath(c) !== '$')
  if (topForwarded.length) {
    for (const c of topForwarded) compare(payload, c, c.path)
    return out
  }
  if (!cs.length) { out.unmeasured = 'no-kernel-call'; return out }
  if (nestedForwarded.length) {
    for (const c of nestedForwarded) out.nestedOnly.push({ path: tokenPath(c), kernelSource: c.path })
    return out
  }

  const primary = pickPrimary(cs.filter(candidate))
  if (!primary) {
    out.unmeasured = cs.some((c) => c.kind === 'primitive') ? 'scalar' : 'helper-only'
    return out
  }
  if (primary.kind === 'error') {
    const keys = [...new Set([...primary.keys, 'code', 'hint'])].filter((k) => k !== 'stack' && k !== 'name' && k !== 'message' && k !== TOKEN_KEY)
    for (const k of keys) {
      if (hidden[k]) { out.hidden.push(k); continue }
      if (visibleSomewhere(k)) continue
      out.classB.push({ path: k, kernelSource: primary.path })
    }
    return out
  }
  noteFn(primary)
  compare(payload, primary, primary.path)
  return out
}

// ── --self-test: prove the judge is not vacuously green ───────────────────────────────────────────────────────────
/** Phase 2 (TB-2673 §3.2): ONE factory-face point, judged from the kernel receipts the recording Proxy saw.
 *  The criterion is the same seam-level rule, only its evidence is the run-time union:
 *      union(recorded kernel receipt keys) - faceReceiptKeys === 0
 *  Same tables as Phase 1 (REKEYED verified by value, WRAPPED compared inside its namespace, NOT_FROM_KERNEL as a
 *  declared composition whose elisions are printed by name). A key visible one level down is reported as `nestedOnly`
 *  (a namespace the table does not declare), never silently absorbed and never called a loss.
 *  No recorded receipt at all is `noRecordedCalls` — NAMED, never counted as a pass. */
export function specJudge({ key, receipts, payload, tables = TABLES }) {
  const out = { classA: [], classB: [], suppressed: [], nestedOnly: [], unmeasured: null, tableErrors: [], wrappedConflicts: [], helperReads: [], attribution: null, declared: null }
  if (!Array.isArray(receipts) || receipts.length === 0) { out.unmeasured = 'noRecordedCalls'; return out }
  const tool = String(key).split('/')[0]
  const nfk = tables.NOT_FROM_KERNEL[key] || tables.NOT_FROM_KERNEL[tool] || null
  const rekey = tables.REKEYED[key] || tables.REKEYED[tool] || {}
  const wrapped = tables.WRAPPED[key] || tables.WRAPPED[tool] || null
  const hidden = Object.assign({}, tables.HOST_HIDDEN_KEYS[key] || {}, tables.HOST_HIDDEN_KEYS[tool] || {})
  const FRAMEWORK = new Set(['ok', 'action', 'code', 'hint', 'message', 'instance', 'note'])
  const payloadObj = payload && typeof payload === 'object' && !Array.isArray(payload) && !(payload instanceof Error) ? payload : null
  const topKeys = new Set(payloadObj ? Object.keys(payloadObj) : [])
  const sameValue = (x, y) => {
    if (x === y) return true
    if (typeof x !== 'object' || typeof y !== 'object' || x === null || y === null) return false
    try { return origStringify(x) === origStringify(y) } catch { return false }
  }
  const nsScope = wrapped && payloadObj && payloadObj[wrapped.ns] && typeof payloadObj[wrapped.ns] === 'object' && !Array.isArray(payloadObj[wrapped.ns]) ? payloadObj[wrapped.ns] : null
  const visible = (k) => Boolean((topKeys.has(k) && payloadObj[k] !== undefined) || (nsScope && Object.prototype.hasOwnProperty.call(nsScope, k) && nsScope[k] !== undefined))
  const nestedHits = (k) => {
    if (!payloadObj) return []
    const hits = []
    for (const ns of Object.keys(payloadObj)) {
      const v = payloadObj[ns]
      if (v && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Error) && k in v) hits.push(ns + '.' + k)
    }
    return hits
  }
  // Phase 2 attribution (the recording Proxy sees EVERY kernel answer, including internal helper reads such as a
  // membership check calling meetings.status). A receipt the face never forwarded is evidence about a helper, not about
  // a dropped key, so the comparison uses (a) the refusal receipt whose `code` matches the face payload, else (b) the
  // receipts sharing at least one top-level key with the payload. Everything else is HELPER-READ: named with its path and
  // counted, never a finding. A success point with no forwarded receipt is `noForwardedReceipt` — named, never a pass.
  const isRefusal = Boolean(payloadObj && (payloadObj.ok === false || typeof payloadObj.code === 'string'))
  const primary = []
  const helperReads = []
  if (isRefusal) {
    for (const r of receipts) {
      // A kernel refusal is NOT always a thrown Error: several services RETURN a refusal-shaped object
      // ({ok:false,code,hint,enforced,...}) and the face then rebuilds it. The attribution question is "did the kernel
      // answer with this code", not "was it thrown", so match on the code for error AND object receipts alike.
      // `--legacy-primary` is the reverse lamp: error-only matching must report these points as unmatched.
      const sameCode = r.value && r.value.code !== undefined && String(r.value.code) === String(payloadObj.code)
      const kinds = LEGACY_PRIMARY ? ['error'] : ['error', 'object']
      if (sameCode && kinds.includes(r.kind)) primary.push(r)
    }
  }
  if (!isRefusal && !primary.length) {
    // A helper read often shares `ok` (or `action`) with the payload by accident, and a key can collide by NAME while
    // carrying a different thing (meeting/list's `registry` is the string "both"; meetings.status's `registry` is an
    // object). So a receipt only counts as forwarded when it shares a NON-framework top-level key whose value is also the
    // same VALUE — or when the very same receipt value shows up nested one level down (minutes/list forwards the whole
    // kernel receipt under `minutes`). Everything else is a helper read: named, counted, never a finding.
    const shapeOf = (v) => (v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v)
    const substantive = [...topKeys].filter((k) => !FRAMEWORK.has(k) && payloadObj[k] !== undefined)
    for (const r of receipts) {
      const topHit = r.value && r.keys.some((k) => substantive.includes(k) && shapeOf(payloadObj[k]) === shapeOf(r.value[k]) && sameValue(payloadObj[k], r.value[k]))
      const nestedHit = !topHit && r.value && [...topKeys].some((k) => {
        const v = payloadObj[k]
        return v && typeof v === 'object' && !Array.isArray(v) && sameValue(v, r.value)
      })
      ;(topHit || nestedHit ? primary : helperReads).push(r)
    }
  }
  for (const r of receipts) if (!primary.includes(r) && !helperReads.includes(r)) helperReads.push(r)
  out.helperReads = helperReads.map((r) => ({ path: r.path, keys: r.keys.length }))
  out.attribution = { primary: primary.map((r) => r.path), helperReads: helperReads.length }
  // kind of every receipt that was used as PRIMARY — specMain counts the refusal points matched through a RETURNED
  // object (the 23 the error-only rule used to report as unmatched); see the PRIMARY RULE comment at the flags.
  out.primaryKinds = primary.map((r) => r.kind)
  const receiptFor = (k) => primary.find((r) => r.keys.includes(k)) || null
  const union = new Map()
  // A recorded key whose value is `undefined` is not a fact: a JSON receipt cannot carry it, and the kernel leaving it
  // undefined means nothing was said. Demanding it would manufacture a red (publication.advance leaves paperId undefined).
  for (const r of primary) for (const k of r.keys) if (r.value && r.value[k] !== undefined && !union.has(k)) union.set(k, r.path)
  // R1 for WRAPPED in Phase 2: once the kernel keys ALSO arrive flat at the top level, the namespace wraps nothing and
  // the exception must die (a table entry outliving its shape would license a forward that no longer exists).
  if (wrapped && nsScope) {
    const flat = [...union.keys()].filter((k) => !FRAMEWORK.has(k) && topKeys.has(k) && Object.prototype.hasOwnProperty.call(nsScope, k))
    if (flat.length) {
      out.wrappedConflicts.push({ ns: wrapped.ns, flatKeys: flat })
      out.tableErrors.push('WRAPPED disarm ' + key + ' — the kernel keys are ALSO forwarded flat (' + flat.join(',') + '): the namespace wraps nothing now, remove the exception')
    }
  }
  const recordLoss = (k, source) => (isRefusal ? out.classB : out.classA).push({ path: k, kernelSource: source })

  if (wrapped && !nsScope) {
    out.tableErrors.push('WRAPPED ' + key + ' declares namespace "' + wrapped.ns + '" but the face receipt has no such object')
  }
  if (nfk) {
    out.declared = nfk
    for (const path of Array.isArray(nfk.composedOf) ? nfk.composedOf : []) {
      const name = String(path).replace(/\(.*\)$/, '')
      const rec = receipts.find((r) => r.path === name || r.path.startsWith(name))
      if (!rec) { out.tableErrors.push('NOT_FROM_KERNEL ' + key + ' names ' + path + ' but no such receipt was recorded'); continue }
      const reading = rec.keys.filter((k) => !FRAMEWORK.has(k))
      let seen = 0
      for (const k of reading) {
        if (hidden[k]) continue
        if (visible(k)) { seen += 1; continue }
        out.suppressed.push({ path: k, kernelSource: path })
      }
      if (reading.length && seen === 0) {
        out.tableErrors.push('NOT_FROM_KERNEL ' + key + ' names ' + path + ' but the receipt carries none of its ' + reading.length + ' reading key(s) (' + reading.join(',') + '): the exception hides a reading instead of composing one')
      }
    }
    for (const k of Array.isArray(nfk.keys) ? nfk.keys : []) {
      if (visible(k)) continue
      out.classA.push({ path: k, kernelSource: (nfk.composedOf || []).join('+') || 'composed' })
    }
    if (!Array.isArray(nfk.composedOf)) {
      // parts-only composition: no kernel receipt to subset; every recorded receipt that survives a bit is reported
      // under `suppressed` only when the entry ALSO names views. A pure host-side list is `declared-composed`.
      if (!receipts.some((r) => r.keys.some((k) => visible(k)))) out.unmeasured = 'declared-composed'
    }
    return out
  }
  for (const [k, source] of union) {
    if (hidden[k]) continue
    const rule = rekey[k]
    if (rule) {
      const rec = receiptFor(k)
      if (rekeyVerifies(payloadObj || {}, rule, rec && rec.value ? rec.value[k] : undefined)) continue
      recordLoss(k, source)
      continue
    }
    if (visible(k)) continue
    const hits = nestedHits(k)
    if (hits.length) { out.nestedOnly.push({ path: hits[0], kernelSource: source }); continue }
    recordLoss(k, source)
  }
  if (!primary.length) {
    out.unmeasured = isRefusal ? 'refusedWithoutKernelReceipt' : 'noForwardedReceipt'
    if (isRefusal) {
      // Triage evidence for this bucket (lead ruling 2026-11-09): a kernel refusal WAS recorded, but none of the recorded
      // refusals carries the code the face receipt reports. Either the face replaced the kernel's code with its own, or the
      // kernel call that refused is not the one whose answer the face reports. Name both sides so the reader can tell the
      // two apart without re-running the call.
      out.refusalDetail = {
        face: { ok: payloadObj.ok, code: payloadObj.code === undefined ? null : payloadObj.code, message: payloadObj.message === undefined ? null : String(payloadObj.message).slice(0, 160) },
        recorded: receipts.map((r) => ({ path: r.path, kind: r.kind, code: r.value && r.value.code !== undefined ? String(r.value.code) : null, keys: r.keys.length })),
      }
    }
  }
  return out
}

/** R1 for the bounded-summary licence (lead ruling 2026-11-09): declaring a section bounded must be EARNED. A face that
 *  declares boundedSections and is still compared as a forwarded receipt MUST have suppressed at least one key by name —
 *  otherwise the declaration describes an elision that never happens, and the table has become a licence to stay quiet.
 *  Returns the point keys that break the rule (empty = honest). Kept pure so the self-test can prove it can fire. */
export function boundedElisionViolations(results) {
  return results.filter((r) => r.verdict && r.verdict.declared && Array.isArray(r.verdict.declared.boundedSections)
    && r.verdict.declared.boundedSections.length && r.verdict.unmeasured === null && r.verdict.suppressed.length === 0).map((r) => r.key)
}

/** One measured point through the recording Proxy: a throw is `unreachable` (named, never a pass); otherwise the
 *  verdict is the ordinary `specJudge`. Kept pure so --self-test can prove the unreachable branch fires without a
 *  live kernel. */
export function judgePoint({ key, thrown, receipts, payload, tables = TABLES }) {
  if (thrown) return { key, unreachable: String((thrown && thrown.message) || thrown) }
  return { key, verdict: specJudge({ key, receipts, payload, tables }) }
}

async function selfTest() {
  console.log('=== HOST RECEIPT SUPERSET --self-test: synthetic receipts (no kernel boot) ===')
  const T0 = { REKEYED: {}, WRAPPED: {}, NOT_FROM_KERNEL: {}, HOST_HIDDEN_KEYS: {} }
  const call = (path, keys, values = {}, reads = keys) => ({ kind: 'object', path, token: null, keys, values, reads: new Set(reads), elementKeys: [] })

  // 1) RED: a 3-key kernel receipt carried as 1 key must be named, key by key.
  const red = judge({ key: 'demo/read', calls: [call('kernel.demo.read', ['ok', 'action', 'total'], { ok: true, action: 'read', total: 3 })], payload: { ok: true, action: 'read' }, tokens: new Map() }, T0)
  ok(red.classA.length === 1 && red.classA[0].path === 'total' && red.classA[0].kernelSource === 'kernel.demo.read',
    'self-test 1: a 3-key kernel receipt carried as 2 keys is RED, and names the missing key', red.classA)

  // 2) GREEN: the same difference is allowed once declared as a VERIFIED rename (kernel `items` -> host `records`).
  const rows = [{ id: 'r1', title: 't' }]
  const listCall = () => call('kernel.demo.list', ['ok', 'action', 'items'], { ok: true, action: 'list', items: rows })
  const green = judge({ key: 'demo/list', calls: [listCall()], payload: { ok: true, action: 'list', records: rows }, tokens: new Map() }, { ...T0, REKEYED: { 'demo/list': { items: { to: 'records', verify: 'row-ids' } } } })
  ok(green.classA.length === 0, 'self-test 2: a DECLARED + VERIFIED rename is GREEN', green.classA)

  // 3) RED again if the same rename is only declared but the host does not carry the rows.
  const lying = judge({ key: 'demo/list', calls: [listCall()], payload: { ok: true, action: 'list', records: [] }, tokens: new Map() }, { ...T0, REKEYED: { 'demo/list': { items: { to: 'records', verify: 'row-ids' } } } })
  ok(lying.classA.length === 1 && lying.classA[0].path === 'items', 'self-test 3: a declared rename that does NOT verify is RED (the table cannot lie)', lying.classA)

  // 4) GREEN for the WRAPPED shape, and RED when the wrapped reading is dropped.
  const wrappedPayload = { ok: true, action: 'disable', result: { ok: true, disabled: 'm1', wasOn: true } }
  const kern = [call('kernel.bus.disable', ['ok', 'disabled', 'wasOn'], { ok: true, disabled: 'm1', wasOn: true })]
  const wrappedOk = judge({ key: 'demo/disable', calls: kern, payload: wrappedPayload, tokens: new Map() }, { ...T0, WRAPPED: { 'demo/disable': { ns: 'result', why: 'own ok/action would collide' } } })
  ok(wrappedOk.classA.length === 0, 'self-test 4a: a WRAPPED receipt compared inside its namespace is GREEN', wrappedOk.classA)
  const wrappedBad = judge({ key: 'demo/disable', calls: kern, payload: { ok: true, action: 'disable', result: { ok: true, disabled: 'm1' } }, tokens: new Map() }, { ...T0, WRAPPED: { 'demo/disable': { ns: 'result', why: 'own ok/action would collide' } } })
  ok(wrappedBad.classA.length === 1 && wrappedBad.classA[0].path === 'wasOn',
    'self-test 4b: a WRAPPED receipt that loses a key is RED', wrappedBad.classA)

  // 5) NOT_FROM_KERNEL composes named views: GREEN when their keys survive, RED when the exception forgets one.
  const composed = [call('kernel.closureVoteView', ['ok', 'closureVote'], { ok: true, closureVote: { cast: 1 } })]
  const nfkOk = judge({ key: 'demo/status', calls: composed, payload: { ok: true, closureVote: { cast: 1 } }, tokens: new Map() }, { ...T0, NOT_FROM_KERNEL: { 'demo/status': { composedOf: ['kernel.closureVoteView'], why: 'composed' } } })
  ok(nfkOk.classA.length === 0, 'self-test 5a: a NOT_FROM_KERNEL receipt whose composed views all survive is GREEN', nfkOk.classA)
  const nfkBad = judge({ key: 'demo/status', calls: composed, payload: { ok: true }, tokens: new Map() }, { ...T0, NOT_FROM_KERNEL: { 'demo/status': { composedOf: ['kernel.closureVoteView'], why: 'composed' } } })
  ok(nfkBad.tableErrors.length === 1 && nfkBad.suppressed.length === 1 && nfkBad.suppressed[0].path === 'closureVote',
    'self-test 5b: NOT_FROM_KERNEL cannot hide a composed kernel reading (anti-mask: named table error + suppressed by name)', { tableErrors: nfkBad.tableErrors, suppressed: nfkBad.suppressed })

  // 6) A namespace-forwarded receipt is reported as nestedOnly (evidence of the WRAPPED shape), not as loss.
  const tokens = new Map([['tok1', '$.result']])
  const nested = judge({ key: 'demo/nested', calls: [{ kind: 'object', path: 'kernel.demo.read', token: 'tok1', keys: ['ok', 'total'], values: { ok: true, total: 1 }, reads: new Set(['ok', 'total']) }], payload: { ok: true, result: { ok: true, total: 1 } }, tokens }, T0)
  ok(nested.classA.length === 0 && nested.nestedOnly.length === 1 && nested.nestedOnly[0].path === '$.result',
    'self-test 6: a receipt forwarded whole INSIDE a namespace is reported as nestedOnly, not as a loss', nested.nestedOnly)

  // 7) A refusal receipt that drops the kernel's refusal facts is class B (reported separately from class A).
  const errCall = { kind: 'error', path: 'kernel.demo.refuse', token: null, keys: ['code', 'hint', 'enforced', 'wouldEvaluate'], values: { code: 'VMU_NO_SUCH_OBJECT', hint: 'x', enforced: true, wouldEvaluate: false }, reads: new Set(['code', 'message', 'hint']) }
  const b = judge({ key: 'demo/refuse', calls: [errCall], payload: { ok: false, code: 'VMU_NO_SUCH_OBJECT', message: 'no', hint: 'x' }, tokens: new Map() }, T0)
  ok(b.classA.length === 0 && b.classB.length === 2 && b.classB.every((f) => ['enforced', 'wouldEvaluate'].includes(f.path)),
    'self-test 7: refusal facts the host drops are class B, keeping class A for success receipts', b.classB)

  // 8) R1 for REKEYED: carrying BOTH the kernel name and the renamed name is not a rename — the table must not absorb it.
  const duplicated = judge({ key: 'demo/list', calls: [listCall()], payload: { ok: true, action: 'list', items: rows, records: rows }, tokens: new Map() }, { ...T0, REKEYED: { 'demo/list': { items: { to: 'records', verify: 'row-ids', absent: 'items' } } } })
  ok(duplicated.classA.length === 0 && duplicated.renameErrors.length === 1 && duplicated.renameErrors[0].path === 'items',
    'self-test 8: a rename that leaves the original key on the receipt is RED (exceptions are not residence permits)', duplicated.renameErrors)

  // 9) R1 for WRAPPED: once the kernel keys are ALSO forwarded flat, the namespace wraps nothing and the exception dies.
  const disarm = judge({ key: 'demo/disable', calls: kern, payload: { ok: true, action: 'disable', disabled: 'm1', result: { ok: true, disabled: 'm1', wasOn: true } }, tokens: new Map() }, { ...T0, WRAPPED: { 'demo/disable': { ns: 'result', why: 'own ok/action would collide' } } })
  ok(disarm.wrappedConflicts.length === 1 && disarm.wrappedConflicts[0].flatKeys.join(',') === 'disabled' && disarm.tableErrors.length === 1,
    'self-test 9: a WRAPPED namespace whose keys are also forwarded flat is DISARMED and RED (the kernel now produces them)', { conflicts: disarm.wrappedConflicts, tableErrors: disarm.tableErrors })

  // 10) R1 for NOT_FROM_KERNEL.internalReads: a call declared a storage query, whose receipt IS forwarded into the face,
  //     means the shape changed under the exception — DISARM it instead of letting the table license a real forward.
  const internal = judge({ key: 'demo/cards', calls: [{ ...call('kernel.demo.rows', ['ok', 'items'], { ok: true, items: rows }), token: 'tok2' }], payload: { ok: true, items: rows }, tokens: new Map([['tok2', '$.items']]) }, { ...T0, NOT_FROM_KERNEL: { 'demo/cards': { parts: ['host card module'], internalReads: ['kernel.demo.rows'], why: 'storage read' } } })
  ok(internal.tableErrors.length === 1 && internal.tableErrors[0].indexOf('NOT_FROM_KERNEL disarm') === 0,
    'self-test 10: an internalReads call whose receipt IS forwarded is DISARMED and RED (exceptions are not residence permits)', internal.tableErrors)

  // 11) R1 for NOT_FROM_KERNEL.boundedSections: a declared-bounded section may elide keys (reported as suppressed BY NAME),
  //     but a TOP-LEVEL loss is still class A — the bounded licence never covers the forwarded top level.
  const statusCall = call('kernel.demo.status', ['ok', 'settings', 'bus', 'total'], { ok: true, settings: { detail: 'full', engineEnabled: true }, bus: { entries: 3, hooks: ['a'] }, total: 4 })
  const boundedRun = judge({ key: 'demo/status', calls: [statusCall], payload: { ok: true, settings: { keys: 2, note: 'x' }, bus: { entries: 3, note: 'y' } }, tokens: new Map() }, { ...T0, NOT_FROM_KERNEL: { 'demo/status': { composedOf: ['kernel.demo.status'], boundedSections: ['settings', 'bus'], why: 'bounded summary with pointers' } } })
  const supPaths = boundedRun.suppressed.map((s) => s.path)
  ok(boundedRun.classA.length === 1 && boundedRun.classA[0].path === 'total' && supPaths.includes('settings.detail') && supPaths.includes('bus.hooks'),
    'self-test 11: a declared-bounded section may elide keys (suppressed by name) but a TOP-LEVEL loss is still class A', { classA: boundedRun.classA, suppressed: boundedRun.suppressed })

  // 12) R1 for NOT_FROM_KERNEL.boundedSections DISARM: a bounded face whose top level is no longer forwarded (the branch
  //     started picking keys instead of spreading the receipt) must go RED and NAME the keys it dropped.
  const pickedRun = judge({ key: 'demo/status', calls: [statusCall], payload: { ok: true, settings: { keys: 2 }, bus: { entries: 3 } }, tokens: new Map() }, { ...T0, NOT_FROM_KERNEL: { 'demo/status': { composedOf: ['kernel.demo.status'], boundedSections: ['settings', 'bus'], why: 'bounded summary with pointers' } } })
  ok(pickedRun.tableErrors.length === 1 && pickedRun.tableErrors[0].indexOf('NOT_FROM_KERNEL disarm') === 0 && pickedRun.classA.some((f) => f.path === 'total'),
    'self-test 12: a bounded face that stopped forwarding its top level is DISARMED and RED, naming the dropped key', { tableErrors: pickedRun.tableErrors, classA: pickedRun.classA })

  // 13) R1 for boundedSections, top-level half (lead ruling 2026-11-09): when the kernel GAINS a top-level key on a
  //     bounded face, that new key must go RED even though the bounded sections may keep eliding keys below it. The
  //     bounded licence covers named sections, never the forwarded top level.
  const grownStatus = call('kernel.demo.status', ['ok', 'settings', 'bus', 'total', 'newKernelFact'], { ok: true, settings: { detail: 'full', engineEnabled: true }, bus: { entries: 3 }, total: 4, newKernelFact: 'added-later' })
  const grownRun = judge({ key: 'demo/status', calls: [grownStatus], payload: { ok: true, settings: { keys: 2, note: 'x' }, bus: { entries: 3 }, total: 4 }, tokens: new Map() }, { ...T0, NOT_FROM_KERNEL: { 'demo/status': { composedOf: ['kernel.demo.status'], boundedSections: ['settings', 'bus'], why: 'bounded summary with pointers' } } })
  ok(grownRun.classA.length === 1 && grownRun.classA[0].path === 'newKernelFact',
    'self-test 13: a NEW kernel top-level key on a bounded face is still class A (bounded sections are not a door for new readings)', { classA: grownRun.classA, suppressed: grownRun.suppressed })

  // 14) R1 for boundedSections, EARNED half (live assertion, pure here): a bounded declaration that suppresses NOTHING
  //     breaks the rule, and the checker must say so; the same point with a named suppression is honest.
  const lied = boundedElisionViolations([{ key: 'demo/status', verdict: { declared: { boundedSections: ['settings'] }, unmeasured: null, suppressed: [] } }])
  const earned = boundedElisionViolations([{ key: 'demo/status', verdict: { declared: { boundedSections: ['settings'] }, unmeasured: null, suppressed: [{ path: 'settings.detail' }] } }])
  ok(lied.length === 1 && lied[0] === 'demo/status' && earned.length === 0,
    'self-test 14: a bounded declaration that elides NOTHING is RED (declaring bounded is earned by a named suppression, not by the table entry)', { lied, earned })

  // ── TB-2673 §3.3 reverse-lamp: the recording Proxy and the Phase 2 criterion can all go red, and none of the five
  //    failure modes below is silent. These run on synthetic kernels: no boot, no product code touched.
  const { recordKernelReceipts, looksLikeReceipt } = await import('./lib/recording-kernel.mjs')

  // 15) An async kernel receipt is recorded under its kernel.* path and passed through by reference: the recorder must
  //     never change what the product sees (it is a read-only Proxy, not a wrapper that rewrites values).
  const rec15 = recordKernelReceipts({ demo: { read: async () => ({ ok: true, action: 'read', total: 7 }) } })
  const seen15 = await rec15.proxy.demo.read()
  ok(rec15.receipts.length === 1 && rec15.receipts[0].path === 'kernel.demo.read' && rec15.receipts[0].keys.includes('total') && seen15.total === 7,
    'self-test 15: the recording Proxy captures an async kernel receipt under kernel.* and returns the SAME value (read-only: product behaviour unchanged)', rec15.receipts)

  // 16) §3.3-1: an artificial face that returns {ok,a:1} while the kernel returned {ok,a,b} must be RED and name b.
  const rec16 = recordKernelReceipts({ demo: { read: () => ({ ok: true, action: 'read', a: 1, b: 2 }) } })
  rec16.proxy.demo.read()
  const pt16 = judgePoint({ key: 'demo/read', receipts: rec16.receipts.slice(), payload: { ok: true, action: 'read', a: 1 } })
  ok(pt16.verdict && pt16.verdict.classA.length === 1 && pt16.verdict.classA[0].path === 'b' && pt16.verdict.classA[0].kernelSource === 'kernel.demo.read',
    'self-test 16: an artificial face that drops key b from a recorded {ok,a,b} receipt is RED and names b [TB-2673 §3.3-1]', pt16.verdict && pt16.verdict.classA)

  // 17) §3.3-2: a WRAPPED exception is GREEN only for the shape it declares; once the kernel keys ALSO arrive flat, the
  //     entry must DISARM and go RED rather than silently license the new shape.
  const busReceipt = { path: 'kernel.bus.disable', kind: 'object', keys: ['ok', 'disabled', 'wasOn'], value: { ok: true, disabled: 'm1', wasOn: true } }
  const wrappedTables = { ...T0, WRAPPED: { 'demo/disable': { ns: 'result', why: 'own ok/action collide with the face ok/action' } } }
  const wGreen = specJudge({ key: 'demo/disable', receipts: [busReceipt], payload: { ok: true, action: 'disable', result: { ok: true, disabled: 'm1', wasOn: true } }, tables: wrappedTables })
  const wDisarm = specJudge({ key: 'demo/disable', receipts: [busReceipt], payload: { ok: true, action: 'disable', disabled: 'm1', wasOn: true, result: { ok: true, disabled: 'm1', wasOn: true } }, tables: wrappedTables })
  ok(wGreen.classA.length === 0 && wGreen.tableErrors.length === 0 && wDisarm.classA.length === 0 && wDisarm.tableErrors.length === 1 && wDisarm.tableErrors[0].indexOf('WRAPPED disarm') === 0,
    'self-test 17: a WRAPPED entry is GREEN for the declared shape and DISARMS+RED when the kernel keys also arrive flat [TB-2673 §3.3-2]', { green: wGreen.tableErrors, disarm: wDisarm.tableErrors })

  // 18) §3.3-3: a face whose execute() throws is `unreachable` with its reason — named, and never dressed up as a verdict
  //     or a pass.
  const u18 = judgePoint({ key: 'demo/boom', thrown: new Error('VMU_BOOM: face exploded'), receipts: [], payload: null })
  ok(u18.unreachable === 'VMU_BOOM: face exploded' && !u18.verdict,
    'self-test 18: a thrown face is reported UNREACHABLE with its reason, not as a pass [TB-2673 §3.3-3]', u18)

  // 19) §3.3-4: one face can record SEVERAL attributed kernel receipts; the criterion is their UNION, so a key only the
  //     second one returned must be demanded too (a face cannot pick the convenient receipt and ignore the rest).
  const rec19 = recordKernelReceipts({ demo: { list: () => ({ ok: true, action: 'list', total: 2 }), page: () => ({ ok: true, action: 'page', total: 2, page: 'p1' }) } })
  rec19.proxy.demo.list()
  rec19.proxy.demo.page()
  const uGreen = judgePoint({ key: 'demo/multi', receipts: rec19.receipts.slice(), payload: { ok: true, action: 'list', total: 2, page: 'p1' } })
  const uRed = judgePoint({ key: 'demo/multi', receipts: rec19.receipts.slice(), payload: { ok: true, action: 'list', total: 2 } })
  ok(rec19.receipts.length === 2 && uGreen.verdict.classA.length === 0 && uRed.verdict.classA.length === 1 && uRed.verdict.classA[0].path === 'page',
    'self-test 19: two attributed recorded receipts are compared as a UNION — a key only the second call returned is demanded by name [TB-2673 §3.3-4]', uRed.verdict.classA)

  // 20) §3.3-5: the named predicate keeps the gate honest. `{foo,bar}` is NOT a receipt under `looksLikeReceipt`, so it is
  //     not recorded at all. A wide `() => true` predicate records it: with no forwarded key the point is named
  //     `noForwardedReceipt` (never a pass), and the moment the face forwards one of those keys the other turns into a
  //     manufactured finding — exactly why the predicate is narrow and named.
  const narrow = recordKernelReceipts({ demo: { raw: () => ({ foo: 1, bar: 2 }) } })
  narrow.proxy.demo.raw()
  const wide = recordKernelReceipts({ demo: { raw: () => ({ foo: 1, bar: 2 }) } }, { receiptPredicate: () => true })
  wide.proxy.demo.raw()
  const wideJudge = judgePoint({ key: 'demo/raw', receipts: wide.receipts.slice(), payload: { ok: true, action: 'raw' } })
  const wideJudgeForwarded = judgePoint({ key: 'demo/raw', receipts: wide.receipts.slice(), payload: { ok: true, action: 'raw', foo: 1 } })
  ok(looksLikeReceipt({ foo: 1, bar: 2 }) === false && looksLikeReceipt({ ok: true, a: 1 }) === true && narrow.receipts.length === 0 && wide.receipts.length === 1
    && wideJudge.verdict.unmeasured === 'noForwardedReceipt'
    && wideJudgeForwarded.verdict.classA.length === 1 && wideJudgeForwarded.verdict.classA[0].path === 'bar',
  'self-test 20: the named receipt predicate filters non-receipts; a wide predicate either names the point noForwardedReceipt or manufactures false missing keys [TB-2673 §3.3-5]', { narrow: narrow.receipts.length, unmeasured: wideJudge.verdict.unmeasured, wide: wideJudgeForwarded.verdict.classA })

  console.log('')
  console.log('=== HOST RECEIPT SUPERSET --self-test: ' + (failed === 0 ? 'the judge can go red, and every declared exception is honoured' : failed + ' of ' + (failed + passed) + ' self-test assertions failed') + ' ===')
  process.exit(failed === 0 ? 0 : 1)
}

// ── live run: boot a full host ctx so all 7 in-scope faces publish ────────────────────────────────────────────────
async function main() {
if (FACES === 'spec') return specMain()
const root = await mkdtemp(join(tmpdir(), 'vmu-receipt-superset-'))
const { createKernel } = await imp(join(VMU, 'kernel/index.js'))
const host = await imp(join(VMU, 'host.js'))
const kernel = createKernel({ clock: () => FIXED_CLOCK, settings: {}, root, host: null, slots: [{ id: 'member', capacity: 0, permissions: ['speak', 'vote'] }] })

// Give the list-shaped receipts real rows: an empty lane cannot prove a rename (both lists empty would "verify" a rename
// that forwards nothing). The tracks/kinds are ENUMERATED at runtime from the kernel's own status caps — never typed here,
// because a hard-coded track name is exactly how the first run of this gate lied ("evidence" is not a track). If seeding
// fails or leaves the lane empty, the run stays RED: there is no "empty so skip" door.
const seed = { error: null, rows: 0, tracks: [], kinds: [] }
try {
  const caps = (kernel.records.status() || {}).caps || {}
  seed.tracks = Array.isArray(caps.tracks) ? caps.tracks.slice() : []
  seed.kinds = Array.isArray(caps.allowedKinds) ? caps.allowedKinds.slice() : []
  if (!seed.tracks.length || !seed.kinds.length) throw new Error('records.status().caps enumerated no tracks/kinds (tracks=' + JSON.stringify(seed.tracks) + ', kinds=' + JSON.stringify(seed.kinds) + ')')
  for (let i = 0; i < Math.min(2, seed.tracks.length); i += 1) {
    kernel.records.put({ track: seed.tracks[i], kind: seed.kinds[i % seed.kinds.length], title: 'audit seed ' + seed.tracks[i], body: 'seed body ' + seed.tracks[i], by: 'audit', settled: true })
  }
  const listed = kernel.records.list({})
  seed.rows = Array.isArray(listed.items) ? listed.items.length : 0
  if (seed.rows === 0) throw new Error('records.list({}).items is still empty after seeding ' + seed.tracks.length + ' runtime track(s) — the row-id rename cannot be verified')
} catch (e) {
  seed.error = String((e && e.message) || e)
}
if (seed.error) console.error('  SEED-ERROR  records/list was NOT verifiable on an empty lane: ' + seed.error + '  (this is a RED, not a skip)')

// Real id for the WRAPPED middleware points: ask the bus first, and install our own entry when the bus is empty. The gate
// seeds the state it measures instead of skipping the two actions whose namespace needs an id.
const busModule = await imp(join(VMU, 'kernel/bus.js'))
const middlewareId = (() => {
  try {
    const entries = (kernel.bus.status() || {}).entries || []
    if (entries.length && entries[0] && entries[0].id !== undefined) return String(entries[0].id)
    kernel.bus.add({ id: 'audit-mw', kind: 'module', on: busModule.VU_HOOKS[0], handler: () => ({}) })
    return 'audit-mw'
  } catch (e) {
    console.error('  SEED-ERROR  could not obtain a middleware id for disable/enable: ' + String((e && e.message) || e))
    return null
  }
})()
const POINT_ARGS = middlewareId
  ? { 'vibe_vmu_middleware/disable': { id: middlewareId }, 'vibe_vmu_middleware/enable': { id: middlewareId } }
  : {}

const packLoaderFn = () => ({
  status: () => ({ ok: true, packs: [], applied: [] }),
  unload: async (id) => ({ ok: true, unloaded: String(id) }),
  plan: async () => ({ ok: true, changes: [] }),
  apply: async () => ({ ok: true, applied: [] }),
})
const specs = host.toolSpecs({
  kernel: wrapService(kernel, 'kernel'),
  settings: { 'vmu.tools.faces': ['*'], 'vmu.tools.allowAll': true },
  instance: 'audit',
  config: { records: true, direction: true, packs: true, scripts: true, middleware: true },
  scripts: [{ name: 'audit-script', body: 'return 1', when: 'always' }],
  packLoader: packLoaderFn,
  assertDeclared: () => true,
})

// ── enumerate from the registry (never a hand-copied list) ────────────────────────────────────────────────────────
const specsWithActions = []
const points = []
for (const spec of specs) {
  const params = spec.parameters || {}
  const enumVals = params.action && Array.isArray(params.action.enum) ? params.action.enum : null
  const actions = enumVals ? enumVals.map(String) : [null]
  specsWithActions.push({ name: spec.name, actions: actions.length })
  if (!IN_SCOPE_NAMES.has(spec.name)) continue
  for (const action of actions) points.push({ spec, tool: spec.name, action })
  for (const variant of VARIANTS[spec.name] || []) points.push({ spec, tool: spec.name, action: null, variant })
}
const keyOf = (p) => p.tool + '/' + (p.action === null ? (p.variant ? 'detail:' + Object.values(p.variant)[0] : '-') : p.action)

const outOfScopeSpecs = specs.filter((s) => !IN_SCOPE_NAMES.has(s.name))
const outOfScopeActions = specsWithActions.filter((s) => !IN_SCOPE_NAMES.has(s.name)).reduce((a, s) => a + s.actions, 0)
for (const s of outOfScopeSpecs) PENDING_SCOPE[s.name] = { points: specsWithActions.find((x) => x.name === s.name).actions, why: 'factory face (vibe-math-vmu/tools/*.js); Phase 2 covers it with a recording Proxy (TB-2673)' }

// ── run every in-scope point through the real tool path ───────────────────────────────────────────────────────────
const results = []
for (const pt of points) {
  const key = keyOf(pt)
  if (ONLY && key !== ONLY) continue
  calls = []
  payloads = []
  let raw
  let thrown = null
  const hs = host.toHostSpec(pt.spec, wrapService(kernel, 'kernel'))
  const args = pt.variant ? { ...pt.variant } : (pt.action === null ? {} : { action: pt.action, ...(POINT_ARGS[key] || {}) })
  JSON.stringify = captureStringify
  try { raw = await hs.execute(args, {}) } catch (e) { thrown = e } finally { JSON.stringify = origStringify }
  let payload = null
  let receipt = null
  if (raw !== undefined) {
    try { receipt = JSON.parse(raw) } catch { receipt = null }
    for (let i = payloads.length - 1; i >= 0; i -= 1) {
      try { if (origStringify(payloads[i]) === raw) { payload = payloads[i]; break } } catch { /* not it */ }
    }
    if (!payload && payloads.length) payload = payloads[0]
  }
  const tokens = payload ? scanTokens(payload) : new Map()
  for (const c of calls) if (c.token) c.forwarded = tokens.has(c.token)
  results.push({ pt, key, receipt, payload, tokens, thrown, calls, verdict: judge({ key, calls, payload, tokens }) })
  if (process.env.DUMP === key) {
    console.log('DUMP ' + key + ' thrown=' + (thrown ? String(thrown.message) : 'no') + ' calls=' + calls.map((c) => c.path + '[' + c.kind + ',' + c.keys.length + ',r' + c.reads.size + (c.token ? ',tok' : '') + ']').join(' '))
    console.log('DUMP payloadKeys=' + (payload ? Object.keys(payload).join(',') : '(no payload)'))
    console.log('DUMP receipt=' + origStringify(receipt).slice(0, 300))
    const v = results[results.length - 1].verdict
    console.log('DUMP classA=' + v.classA.map((x) => x.path).join(',') + ' | unmeasured=' + v.unmeasured + ' | tableErrors=' + v.tableErrors.join(';'))
    console.log('DUMP payloadIsReceipt=' + (payload === receipt) + ' hasRecords=' + (payload && payload.records !== undefined) + ' recordsLen=' + (payload && Array.isArray(payload.records) ? payload.records.length : '-'))
  }
}

// ── aggregate: nameable findings, grouped by tool ────────────────────────────────────────────────────────────────
const isRefusalReceipt = (r) => !!(r.receipt && (r.receipt.ok === false || (r.receipt.code && r.receipt.ok !== true)))
const findingsA = []
const findingsB = []
const nestedOnly = []
const unmeasured = []
const tableErrors = []
const hiddenSeen = []
const suppressedKeys = []
const unserializableKeys = []
const renameErrors = []
const wrappedConflicts = []
for (const r of results) {
  const v = r.verdict
  for (const f of v.classA) findingsA.push({ key: r.key, tool: r.pt.tool, action: r.pt.action, variant: r.pt.variant, path: f.path, kernelSource: f.kernelSource })
  for (const f of v.classB) findingsB.push({ key: r.key, tool: r.pt.tool, action: r.pt.action, variant: r.pt.variant, path: f.path, kernelSource: f.kernelSource })
  for (const f of v.nestedOnly) nestedOnly.push({ key: r.key, path: f.path, kernelSource: f.kernelSource })
  for (const k of v.hidden) hiddenSeen.push({ key: r.key, path: k })
  for (const f of v.suppressed) suppressedKeys.push({ key: r.key, path: f.path, kernelSource: f.kernelSource })
  for (const f of v.unserializable) unserializableKeys.push({ key: r.key, path: f.path, kernelSource: f.kernelSource })
  for (const f of v.renameErrors || []) renameErrors.push({ key: r.key, path: f.path, kernelSource: f.kernelSource, why: f.why })
  for (const f of v.wrappedConflicts || []) wrappedConflicts.push({ key: r.key, path: f.path, kernelSource: f.kernelSource, flatKeys: f.flatKeys })
  for (const e of v.tableErrors) tableErrors.push(e)
  if (v.unmeasured) unmeasured.push({ key: r.key, kind: v.unmeasured, refusal: isRefusalReceipt(r) })
}

// scope accounting: every published face is either measured or named in PENDING_SCOPE with its point count
const measuredFaces = [...IN_SCOPE_NAMES].filter((n) => specs.some((s) => s.name === n))
const missingInScopeFaces = [...IN_SCOPE_NAMES].filter((n) => !specs.some((s) => s.name === n))
const pendingPointCount = Object.values(PENDING_SCOPE).reduce((a, p) => a + p.points, 0)
const scalarCount = unmeasured.filter((u) => u.kind === 'scalar').length
const hostValidated = unmeasured.filter((u) => u.kind === 'no-kernel-call' && u.refusal)
const declaredFor = (u) => NOT_FROM_KERNEL[u.key] || NOT_FROM_KERNEL[String(u.key).split('/')[0]]
const hostOwned = unmeasured.filter((u) => u.kind === 'no-kernel-call' && !u.refusal && !declaredFor(u))
const composedDeclared = unmeasured.filter((u) => declaredFor(u) && !u.refusal)
const helperOnly = unmeasured.filter((u) => u.kind === 'helper-only' && !declaredFor(u))

// R1 for the bounded-summary licence, second half (lead ruling 2026-11-09): declaring a section bounded must be
// EARNED. If a face declares boundedSections and IS compared as a forwarded receipt, its `suppressed` list must be
// non-empty — otherwise the declaration describes an elision that does not happen, and the table would be a licence to
// keep quiet about keys that are actually forwarded. (An empty suppression + a bounded declaration is RED.)
const boundedPoints = results.filter((r) => r.verdict.declared && Array.isArray(r.verdict.declared.boundedSections)
  && r.verdict.declared.boundedSections.length && r.verdict.unmeasured === null)
const boundedWithoutElision = boundedElisionViolations(results)

// The internalReads / composedOf paths are only honest if they name REAL kernel functions (lead ruling 2026-11-09:
// a path that was renamed years ago would be a decoration that can never go red).
const resolveKernelPath = (path) => {
  const parts = String(path).replace(/\(.*\)$/, '').split('.')
  if (parts[0] !== 'kernel') return null
  let cur = kernel
  for (const part of parts.slice(1)) {
    if (cur === null || cur === undefined || (typeof cur !== 'object' && typeof cur !== 'function')) return null
    cur = cur[part]
  }
  return cur
}
const declaredKernelPaths = []
for (const [tableKey, rule] of Object.entries(NOT_FROM_KERNEL)) {
  for (const p of [...(rule.composedOf || []), ...(rule.internalReads || [])]) if (String(p).startsWith('kernel.')) declaredKernelPaths.push({ tableKey, path: String(p) })
}
const deadDeclaredPaths = declaredKernelPaths.filter(({ path }) => typeof resolveKernelPath(path) !== 'function')

// ── report ───────────────────────────────────────────────────────────────────────────────────────────────────────
const labelOf = (f) => (f.variant ? 'detail:' + Object.values(f.variant)[0] : (f.action === null ? '-' : f.action))
const groupByTool = (rows) => {
  const byTool = new Map()
  for (const f of rows) {
    if (!byTool.has(f.tool)) byTool.set(f.tool, [])
    byTool.get(f.tool).push(f)
  }
  return byTool
}
const groupByKey = (rows) => {
  const byKey = new Map()
  for (const f of rows) {
    if (!byKey.has(f.key)) byKey.set(f.key, [])
    byKey.get(f.key).push(f)
  }
  return byKey
}
const printGrouped = (rows, heading) => {
  if (!rows.length) { console.log('  none: ' + heading + ' — every measured receipt carries every kernel key'); return }
  for (const [tool, list] of groupByTool(rows)) {
    const byAction = new Map()
    for (const f of list) {
      const k = labelOf(f) + '|' + f.kernelSource
      if (!byAction.has(k)) byAction.set(k, [])
      byAction.get(k).push(f.path)
    }
    console.log('  ' + tool + '  (host.js:' + IN_SCOPE[tool].line + ')  ' + list.length + ' missing/suppressed key(s)')
    for (const [k, paths] of byAction) {
      const [label, src] = k.split('|')
      console.log('    ' + label + ' -> ' + paths.join(', ') + '   [kernelSource ' + src + ']')
    }
  }
}

console.log('=== HOST RECEIPT SUPERSET (TB-2668 §3.2): kernelKeys - hostKeys === 0 for every in-scope (tool, action) ===')
console.log('scope: compared ' + measuredFaces.length + ' in-scope faces / ' + results.length + ' points (the 7 explicit host.js branches at status:516, set:850, middleware:964, records:1023, direction:434, script:1577, pack:1634)')
console.log('       outOfScope ' + outOfScopeSpecs.length + ' factory faces / ' + outOfScopeActions + ' actions -> PENDING_SCOPE (Phase 2, TB-2673); registry total = ' + specs.length + ' faces / ' + specsWithActions.reduce((a, s) => a + s.actions, 0) + ' actions (source: host.js toolSpecs():481)')
console.log('       NOTE: this is the number the registry publishes, not 106 — 156 make*Spec grep hits are call sites, not faces.')
console.log('measured: ' + results.length + ' points (' + (results.length - unmeasured.length) + ' compared, ' + unmeasured.length + ' named unmeasured; ' + scalarCount + ' carried a primitive kernel receipt) · nestedOnly ' + nestedOnly.length + ' · no-kernel-call ' + hostValidated.length + ' host-validated refusals, ' + hostOwned.length + ' undeclared host-owned')
console.log('')
console.log('REKEYED (declared renames, verified by value identity at runtime):')
for (const [tableKey, rule] of Object.entries(REKEYED)) for (const [from, v] of Object.entries(rule)) console.log('  ' + tableKey + '  kernel "' + from + '" -> host "' + v.to + '" (' + v.verify + ')')
console.log('WRAPPED (kernel receipt nested whole under one namespace, compared inside it):')
for (const [tableKey, rule] of Object.entries(WRAPPED)) console.log('  ' + tableKey + '  payload.' + rule.ns + '  — ' + rule.why)
console.log('HOST_HIDDEN_KEYS: ' + (Object.keys(HOST_HIDDEN_KEYS).length === 0 ? 'none declared — today every missing key measured is a loss, not a hidden one' : JSON.stringify(HOST_HIDDEN_KEYS)) + (hiddenSeen.length ? '  (observed hidden reads: ' + hiddenSeen.map((h) => h.key + ':' + h.path).join(', ') + ')' : ''))
console.log('NOT_FROM_KERNEL (composed receipts; every key of every named view must survive):')
for (const [tableKey, rule] of Object.entries(NOT_FROM_KERNEL)) console.log('  ' + tableKey + '  ' + (rule.composedOf ? 'composedOf=[' + rule.composedOf.join(', ') + ']' : 'parts=[' + (rule.parts || []).join(', ') + ']') + (rule.keys ? '  keys=[' + rule.keys.join(', ') + ']' : '') + ' — ' + rule.why)
console.log('PENDING_SCOPE: ' + Object.keys(PENDING_SCOPE).length + ' faces / ' + pendingPointCount + ' actions not measured in this phase (declared above; nothing is silently skipped)')
console.log('')
console.log('── class A: success receipts missing kernel keys (the TB-2668 criterion) ─────────────────────────────────')
printGrouped(findingsA, 'no missing success-receipt key')
console.log('  = ' + findingsA.length + ' missing key(s) across ' + new Set(findingsA.map((f) => f.key)).size + ' measured point(s)')
console.log('')
console.log('── class B: refusal receipts missing kernel refusal facts (same seam, reported separately) ──────────────')
printGrouped(findingsB, 'no missing refusal fact')
console.log('  = ' + findingsB.length + ' missing refusal fact(s) across ' + new Set(findingsB.map((f) => f.key)).size + ' measured point(s)')
console.log('')
console.log('── REKEYED shape: a renamed kernel key must be GONE from the receipt, not duplicated (R1) ───────────────')
if (!renameErrors.length) console.log('  none: every declared rename replaced its key (the original name is absent from the receipt)')
for (const e of renameErrors) console.log('  SHAPE-VIOLATION  ' + e.key + '  ' + e.path + '  ' + e.why + '   [kernelSource ' + e.kernelSource + ']')
console.log('── WRAPPED disarm: a declared namespace whose keys are also forwarded flat is not wrapping anything (R1) ──')
if (!wrappedConflicts.length) console.log('  none: every declared namespace still wraps the cited reading')
for (const e of wrappedConflicts) console.log('  DISARM  ' + e.key + '  payload.' + e.path + '  flat kernel keys: ' + e.flatKeys.join(',') + '   [kernelSource ' + e.kernelSource + ']')
console.log('')
console.log('── nestedOnly (key visible one level down; evidence of an undeclared WRAPPED shape, not a loss) ────────')
if (!nestedOnly.length) console.log('  none')
for (const n of nestedOnly) console.log('  ' + n.key + '  ' + n.path + '   [kernelSource ' + n.kernelSource + ']')
console.log('')
console.log('── NOT_FROM_KERNEL suppressed (declared composition: keys the named kernel view carries and this face does NOT forward — printed by name, never silent) ──')
if (!suppressedKeys.length) console.log('  none')
for (const [key, list] of groupByKey(suppressedKeys)) console.log('  ' + key + '  ' + list.length + ' key(s) not forwarded: ' + list.map((f) => f.path).join(', ') + '   [kernelSource ' + list[0].kernelSource + ']')
console.log('')
console.log('── not JSON-serializable kernel keys (live callables on the payload object; the JSON tool reply cannot carry them — informational, not a picking loss) ──')
if (!unserializableKeys.length) console.log('  none')
for (const u of unserializableKeys) console.log('  ' + u.key + '  ' + u.path + '   [kernelSource ' + u.kernelSource + ']')
console.log('')
console.log('── unmeasured in-scope points (named, never silently skipped) ──────────────────────────────────────────')
for (const u of hostValidated) console.log('  HOST-VALIDATED  ' + u.key + '  (refused before any kernel call, so there is no kernel receipt to subset)')
for (const u of hostOwned) console.log('  HOST-OWNED-UNDECLARED  ' + u.key + '  (no kernel call and not declared in NOT_FROM_KERNEL)')
for (const u of helperOnly) console.log('  HELPER-ONLY  ' + u.key + '  (kernel called for helpers, no receipt-shaped value the branch read)')
for (const u of composedDeclared) console.log('  DECLARED-COMPOSED  ' + u.key + '  (no forwarded receipt by design; declared in NOT_FROM_KERNEL with its reason — see the suppressed list for what it does not forward)')
console.log('')
for (const e of tableErrors) console.log('  TABLE-ERROR  ' + e)
for (const n of missingInScopeFaces) console.log('  TABLE-ERROR  in-scope face ' + n + ' was not published by toolSpecs() in this boot (its branch line is declared at host.js:' + IN_SCOPE[n].line + ')')

// ── assertions ───────────────────────────────────────────────────────────────────────────────────────────────────
ok(findingsA.length === 0, 'class A: every in-scope success receipt carries every kernel key (TB-2668 §3.2)', findingsA.length ? { missingKeys: findingsA.length, points: [...new Set(findingsA.map((f) => f.key))] } : undefined)
ok(findingsB.length === 0, 'class B: every in-scope refusal receipt carries the kernel refusal facts', findingsB.length ? { missingFacts: findingsB.length, points: [...new Set(findingsB.map((f) => f.key))] } : undefined)
ok(tableErrors.length === 0 && missingInScopeFaces.length === 0, 'the four exception tables match the registry and the measured receipts', tableErrors.length ? tableErrors : undefined)
ok(renameErrors.length === 0, 'REKEYED shape: every declared rename REPLACED its key (the renamed key is absent, not duplicated)', renameErrors.length ? renameErrors.map((e) => e.key + ':' + e.path) : undefined)
ok(seed.error === null && seed.rows > 0, 'seed: records/list was measured on a NON-EMPTY lane (rename verified against ' + seed.rows + ' row(s) on runtime-enumerated track(s) ' + JSON.stringify(seed.tracks) + ')', seed.error ? { seedError: seed.error } : undefined)
ok(middlewareId !== null, 'seed: middleware disable/enable were measured with a REAL bus entry id ("' + String(middlewareId) + '"), not skipped for lack of an id', middlewareId === null ? { middlewareId } : undefined)
ok(measuredFaces.length === 7 && results.length > 0, 'coverage: all 7 in-scope faces published and measured (compared=' + measuredFaces.length + ', points=' + results.length + ')', { measuredFaces, missingInScopeFaces })
ok(outOfScopeSpecs.length === Object.keys(PENDING_SCOPE).length && pendingPointCount === outOfScopeActions, 'coverage: every out-of-scope face is counted in PENDING_SCOPE (outOfScope=' + outOfScopeSpecs.length + ' faces / ' + outOfScopeActions + ' actions, pending=' + Object.keys(PENDING_SCOPE).length + '/' + pendingPointCount + ')')
ok(hostOwned.length === 0, 'every no-kernel-call in-scope receipt is declared in NOT_FROM_KERNEL (coverage cannot shrink silently)', hostOwned.length ? hostOwned.map((u) => u.key) : undefined)
ok(boundedWithoutElision.length === 0, 'bounded sections: every declared-bounded receipt ACTUALLY elides keys it names (a bounded declaration that suppresses nothing is not a licence, it is a lie)', boundedWithoutElision.length ? boundedWithoutElision.map((r) => r.key) : undefined)
ok(deadDeclaredPaths.length === 0, 'NOT_FROM_KERNEL paths: every composedOf/internalReads path names a LIVE function on the booted kernel (a renamed path would be a decoration that can never go red)', deadDeclaredPaths.length ? deadDeclaredPaths : undefined)
// The bounded-summary licence must be DOCUMENTED, not just declared: the status/- summary elides exactly 38 kernel keys
// (docs/acceptance/host-receipt-single-producer.md lists them by section) and the run must show that many named keys.
// If the host ever stops eliding, this assertion goes red on the count; if the kernel adds a key, class A catches it.
const statusSuppressed = suppressedKeys.filter((s) => s.key === 'vibe_vmu_status/-')
const statusSuppressedNames = new Set(statusSuppressed.map((s) => s.path))
const statusNamedHits = ['settings.detail', 'settings.resolvedDetail', 'bus.hooks', 'prompt.bindings', 'loader.stats'].filter((k) => statusSuppressedNames.has(k))
ok(statusSuppressed.length === 38 && statusNamedHits.length >= 3,
  'bounded summary: status/- suppresses exactly the documented 38 kernel keys, with named evidence (count=' + statusSuppressed.length + ', namedHits=' + statusNamedHits.join('/') + ')',
  { count: statusSuppressed.length, sample: [...statusSuppressedNames].slice(0, 12), namedHits: statusNamedHits })
ok(findingsA.length === 0 || findingsA.every((f) => f.tool && f.path && f.kernelSource), 'every class A finding is named tool/action/path/kernelSource (not only counted)')

// planted-defect proof: the gate must NAME the key that was planted, or it cannot catch the real class
if (PLANT_HIDE || PLANT_EXTRA) {
  const plant = PLANT_HIDE || PLANT_EXTRA
  const all = [...findingsA, ...findingsB].filter((f) => f.path === plant.key || f.path.endsWith('.' + plant.key))
  if (PLANT_HIDE) {
    ok(all.length > 0, '★ planted defect is caught and NAMED: ' + plant.key + ' (planted at ' + plant.path + ')', all.length ? all.map((f) => f.key + ':' + f.path) : { plantedKey: plant.key })
  } else if (!all.length) {
    // --plant-extra only fires on a face that does NOT forward its kernel receipt wholesale. Today every in-scope branch
    // spreads the receipt, so a key the kernel adds is automatically carried — nothing is dropped, and that IS the target
    // property this gate exists to protect (the red-capability of the criterion is proven by --plant-hide, by the
    // host-side spread->pick experiment in the report, and by self-tests 1/8/9/10/12).
    console.log('  planted-extra probe: "' + plant.key + '" on ' + plant.path + ' is NOT dropped, because every in-scope branch forwards the receipt whole — the gate stays green on purpose (red-capability proven by --plant-hide and the host-side spread->pick experiment)')
  } else {
    ok(all.length > 0 && all.some((f) => f.key === plant.key),
      '★ a kernel key the receipt gained is reported as MISSING, so --plant-extra is a real red: ' + plant.key + ' (planted at ' + plant.path + ')',
      all.map((f) => f.key + ':' + f.path))
  }
  console.log('  planted: ' + (PLANT_HIDE ? 'hid' : 'added') + ' "' + plant.key + '" on ' + plant.path + ' -> named in ' + all.length + ' finding(s): ' + all.map((f) => f.key + ':' + f.path).join(', '))
}

await rm(root, { recursive: true, force: true })

console.log('')
console.log('=== HOST RECEIPT SUPERSET: ' + (failed === 0 ? 'every in-scope tool receipt carries every kernel key' : failed + ' of ' + (failed + passed) + ' assertions failed') + ' | class A ' + findingsA.length + ' missing keys / ' + new Set(findingsA.map((f) => f.key)).size + ' points, class B ' + findingsB.length + ' missing facts / ' + new Set(findingsB.map((f) => f.key)).size + ' points, pendingScope ' + Object.keys(PENDING_SCOPE).length + ' faces ===')
process.exit(failed === 0 ? 0 : 1)
}

// ── Phase 2 (TB-2673 §3.2): --faces spec — every published face through the recording Proxy ──────────────────────
// The evidence changes, the criterion does not: union(recorded kernel receipt keys) - faceReceiptKeys === 0, judged by
// the SAME four tables (Phase 2 declares no second table). A face that never reaches the kernel is `noRecordedCalls`,
// a face whose execute() throws is `unreachable` with its reason — neither is a pass, and both are printed by name.
async function specMain() {
  const { recordKernelReceipts } = await imp(join(HERE, 'lib/recording-kernel.mjs'))
  const root = await mkdtemp(join(tmpdir(), 'vmu-receipt-spec-'))
  const { createKernel } = await imp(join(VMU, 'kernel/index.js'))
  const host = await imp(join(VMU, 'host.js'))
  const kernel = createKernel({ clock: () => FIXED_CLOCK, settings: {}, root, host: null, slots: [{ id: 'member', capacity: 0, permissions: ['speak', 'vote'] }] })

  // Seed the state factory faces read, using the kernel's OWN runtime enumeration (never a typed track name): two rows
  // so list-shaped faces have something real to hand back.
  try {
    const caps = (kernel.records.status() || {}).caps || {}
    const tracks = Array.isArray(caps.tracks) ? caps.tracks : []
    const kinds = Array.isArray(caps.allowedKinds) ? caps.allowedKinds : []
    for (let i = 0; i < Math.min(2, tracks.length); i += 1) {
      kernel.records.put({ track: tracks[i], kind: kinds[i % kinds.length], title: 'audit spec seed ' + tracks[i], body: 'seed body', by: 'audit', settled: true })
    }
  } catch (e) {
    console.error('  SEED-WARN  factory-face records seed failed (list faces will read an empty lane): ' + String((e && e.message) || e))
  }
  try {
    const busModule = await imp(join(VMU, 'kernel/bus.js'))
    const entries = (kernel.bus.status() || {}).entries || []
    if (!entries.length) kernel.bus.add({ id: 'audit-spec-mw', kind: 'module', on: busModule.VU_HOOKS[0], handler: () => ({}) })
  } catch (e) {
    console.error('  SEED-WARN  could not install a middleware entry (middleware disable/enable will be unreachable): ' + String((e && e.message) || e))
  }

  const rec = recordKernelReceipts(kernel)
  const packLoaderFn = () => ({
    status: () => ({ ok: true, packs: [], applied: [] }),
    unload: async (id) => ({ ok: true, unloaded: String(id) }),
    plan: async () => ({ ok: true, changes: [] }),
    apply: async () => ({ ok: true, applied: [] }),
  })
  const specs = host.toolSpecs({
    kernel: rec.proxy,
    settings: { 'vmu.tools.faces': ['*'], 'vmu.tools.allowAll': true },
    instance: 'audit',
    config: { records: true, direction: true, packs: true, scripts: true, middleware: true },
    scripts: [{ name: 'audit-script', body: 'return 1', when: 'always' }],
    packLoader: packLoaderFn,
    assertDeclared: () => true,
  })
  const points = []
  for (const spec of specs) {
    const params = spec.parameters || {}
    const actions = params.action && Array.isArray(params.action.enum) ? params.action.enum.map(String) : [null]
    for (const action of actions) points.push({ spec, tool: spec.name, action })
  }
  const registryFaces = specs.length
  const registryActions = points.length

  // Report-only evidence: which module implements each emitted face. Derived from the registry source itself (host.js
  // imports + TOOL_FACES `make:` bindings) so a finding points at a real file, not at whichever tool file happens to
  // contain a same-named method — the earlier `methodLine()` guess matched unrelated modules (meeting -> activity.js).
  const hostSrc = readFileSync(join(VMU, 'host.js'), 'utf8')
  const makeToFile = new Map()
  for (const m of hostSrc.matchAll(/import \{ (make\w+Spec) \} from '\.\/tools\/([\w-]+)\.js'/g)) makeToFile.set(m[1], 'vibe-math-vmu/tools/' + m[2] + '.js')
  const toolNameOf = new Map()
  const namesStart = hostSrc.indexOf('export const TOOL_NAMES')
  const namesBlock = hostSrc.slice(namesStart, hostSrc.indexOf('})', namesStart))
  for (const m of namesBlock.matchAll(/(\w+): '([^']+)'/g)) toolNameOf.set(m[1], m[2])
  const toolModuleOf = new Map()
  for (const m of hostSrc.matchAll(/name: TOOL_NAMES\.(\w+)[\s\S]{0,240}?make: (make\w+Spec)/g)) {
    const tool = toolNameOf.get(m[1])
    const file = makeToFile.get(m[2])
    if (tool && file) toolModuleOf.set(tool, file)
  }
  const moduleOf = (tool) => toolModuleOf.get(tool) || 'host.js (explicit branch; no tools/* module)'
  const methodSiteCache = new Map()
  const methodSite = (tool, kernelSource) => {
    const file = toolModuleOf.get(tool)
    const segment = String(kernelSource).split('.').pop()
    if (!file || !segment) return null
    const ck = file + '|' + segment
    if (methodSiteCache.has(ck)) return methodSiteCache.get(ck)
    let hit = null
    try {
      const text = readFileSync(join(REPO, file), 'utf8')
      const m = text.match(new RegExp('\\.' + segment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*\\('))
      if (m) hit = file + ':' + text.slice(0, m.index).split('\n').length
    } catch { /* module unreadable: evidence is optional */ }
    methodSiteCache.set(ck, hit)
    return hit
  }

  const specResults = []
  for (const pt of points) {
    const key = pt.tool + '/' + (pt.action === null ? '-' : pt.action)
    if (ONLY && key !== ONLY) continue
    rec.reset()
    payloads = []
    let raw
    let thrown = null
    const hs = host.toHostSpec(pt.spec, rec.proxy)
    const args = pt.action === null ? {} : { action: pt.action }
    JSON.stringify = captureStringify
    try { raw = await hs.execute(args, {}) } catch (e) { thrown = e } finally { JSON.stringify = origStringify }
    let payload = null
    if (!thrown && raw !== undefined) {
      for (let i = payloads.length - 1; i >= 0; i -= 1) {
        try { if (origStringify(payloads[i]) === raw) { payload = payloads[i]; break } } catch { /* not it */ }
      }
      if (!payload && payloads.length) payload = payloads[0]
    }
    const verdict = judgePoint({ key, thrown, receipts: rec.receipts.slice(), payload })
    if (process.env.DUMP === key) {
      console.log('DUMP ' + key + ' receipts=' + (rec.receipts.map((r) => r.path + '[' + r.keys.length + ']').join(' ') || '(none)'))
      console.log('DUMP payloadKeys=' + (payload ? Object.keys(payload).join(',') : '(no payload)'))
      console.log('DUMP attribution=' + (verdict.verdict ? JSON.stringify(verdict.verdict.attribution) : '(none)') + ' classA=' + (verdict.verdict ? verdict.verdict.classA.map((x) => x.path).join(',') : '') + ' classB=' + (verdict.verdict ? verdict.verdict.classB.map((x) => x.path).join(',') : '') + ' unmeasured=' + (verdict.verdict ? verdict.verdict.unmeasured : ''))
    }
    specResults.push({ key, tool: pt.tool, action: pt.action, payload, ...verdict })
  }

  const a = []
  const b = []
  const nestedSpec = []
  const unreachable = []
  const noRecorded = []
  const refusedNoReceipt = []
  const refusedNoMatch = []
  const noForwarded = []
  const tableErr = []
  let helperReadCount = 0
  for (const r of specResults) {
    if (r.unreachable) { unreachable.push(r); continue }
    const v = r.verdict
    if (v.attribution) helperReadCount += v.attribution.helperReads
    for (const f of v.classA) a.push({ key: r.key, tool: r.tool, action: r.action, path: f.path, kernelSource: f.kernelSource })
    for (const f of v.classB) b.push({ key: r.key, tool: r.tool, action: r.action, path: f.path, kernelSource: f.kernelSource })
    for (const e of v.tableErrors) tableErr.push(e)
    if (v.unmeasured === 'refusedWithoutKernelReceipt') refusedNoMatch.push(r)
    else if (v.unmeasured === 'noForwardedReceipt') noForwarded.push({ ...r, helpers: (v.helperReads || []).map((h) => h.path) })
    else if (v.unmeasured === 'noRecordedCalls') {
      // Name the reason: a face that refused BEFORE calling the kernel has no receipt to subset (host-side gate), while a
      // face whose kernel answer was not receipt-shaped (a bare object/array/scalar with no ok/code/action seam key) is a
      // boundary of the named predicate — both are named, neither is a pass.
      if (r.payload && r.payload.ok === false) refusedNoReceipt.push(r)
      else noRecorded.push(r)
    } else for (const f of v.nestedOnly) nestedSpec.push({ key: r.key, path: f.path, kernelSource: f.kernelSource })
  }
  const compared = specResults.length - unreachable.length - noRecorded.length - refusedNoReceipt.length - refusedNoMatch.length - noForwarded.length
  // Reverse-lamp evidence for the PRIMARY RULE (flags comment): count refusal points whose primary was a RETURNED
  // refusal object rather than a thrown Error. With the current rule these are `compared` (and pass class B); under
  // `--legacy-primary` the same points fall out as refused-without-matched, which the assertion below demands.
  const returnedRefusalPrimary = specResults.filter((r) => r.verdict && Array.isArray(r.verdict.primaryKinds) &&
    r.verdict.primaryKinds.includes('object') && r.payload && (r.payload.ok === false || typeof r.payload.code === 'string')).length

  const byToolOf = (rows) => {
    const m = new Map()
    for (const r of rows) { if (!m.has(r.tool)) m.set(r.tool, []); m.get(r.tool).push(r) }
    return m
  }
  const printSpecFindings = (rows, heading) => {
    if (!rows.length) { console.log('  none: ' + heading); return }
    const byTool = byToolOf(rows)
    for (const [tool, list] of byTool) {
      console.log('  ' + tool + '  ' + list.length + ' missing key(s)  [module ' + (moduleOf(tool) || 'unmapped') + ']')
      const byPair = new Map()
      for (const f of list) {
        const k = (f.action === null ? '-' : f.action) + '|' + f.kernelSource
        if (!byPair.has(k)) byPair.set(k, [])
        byPair.get(k).push(f.path)
      }
      for (const [k, paths] of byPair) {
        const [action, src] = k.split('|')
        const shown = paths.slice(0, 14).join(', ')
        const site = methodSite(tool, src)
        console.log('    ' + action + ' -> ' + shown + (paths.length > 14 ? ', …(+' + (paths.length - 14) + ' more)' : '') + '   [kernelSource ' + src + (site ? ' @ ' + site : '') + ']')
      }
    }
  }
  const printNamedByTool = (rows, label) => {
    const byTool = byToolOf(rows)
    for (const [tool, list] of byTool) {
      const actions = list.map((r) => (r.action === null ? '-' : r.action))
      const shown = actions.slice(0, 12).join(', ')
      console.log('  ' + label + '  ' + tool + '  ' + actions.length + ' point(s): ' + shown + (actions.length > 12 ? ', …(+' + (actions.length - 12) + ' more)' : ''))
    }
  }

  console.log('=== HOST RECEIPT SUPERSET --faces spec (TB-2673 §3.2): union(recorded kernel receipt keys) - face receipt keys ===')
  console.log('registry: ' + registryFaces + ' faces / ' + registryActions + ' actions (source: host.js toolSpecs():481, measured at runtime — not a typed 99)')
  console.log('measured: ' + specResults.length + ' points (' + compared + ' compared, ' + refusedNoReceipt.length + ' refused-before-kernel, ' + refusedNoMatch.length + ' refused-without-matched-receipt, ' + noForwarded.length + ' noForwardedReceipt, ' + noRecorded.length + ' noReceiptShapedAnswer, ' + unreachable.length + ' unreachable)')
  console.log('attribution: primary = the recorded receipt whose CODE equals the face receipt code (thrown Error OR RETURNED refusal object — ' + returnedRefusalPrimary + ' point(s) matched a RETURNED refusal' + (LEGACY_PRIMARY ? ' [legacy error-only rule: ' + refusedNoMatch.length + ' unmatched]' : '') + '); ' + helperReadCount + ' recorded helper read(s) were NOT counted as findings (internal reads the face never forwards — named under their points, never silently dropped)')
  console.log('')
  console.log('── class A: success receipts missing recorded kernel keys ────────────────────────────────────────────────')
  printSpecFindings(a, 'no missing success-receipt key')
  console.log('  = ' + a.length + ' missing key(s) across ' + new Set(a.map((f) => f.key)).size + ' point(s)')
  console.log('')
  console.log('── class B: refusal receipts missing recorded kernel refusal facts ──────────────────────────────────────')
  printSpecFindings(b, 'no missing refusal fact')
  console.log('  = ' + b.length + ' missing fact(s) across ' + new Set(b.map((f) => f.key)).size + ' point(s)')
  console.log('')
  console.log('── nestedOnly (recorded key visible one level down: a namespace the tables do not declare — evidence, not a loss) ──')
  console.log(nestedSpec.length ? '  ' + nestedSpec.length + ' key(s): ' + [...new Set(nestedSpec.map((n) => n.key))].slice(0, 40).join(', ') + (new Set(nestedSpec.map((n) => n.key)).size > 40 ? ', …' : '') : '  none')
  console.log('')
  console.log('── unreachable (execute() threw: named with its reason, never a pass) ──────────────────────────────────')
  if (!unreachable.length) console.log('  none')
  for (const u of unreachable) console.log('  UNREACHABLE  ' + u.key + '  — ' + u.unreachable)
  console.log('')
  console.log('── refused-before-kernel (the face refused before calling the kernel, so there is no receipt to subset — named, never a pass) ──')
  if (!refusedNoReceipt.length) console.log('  none')
  printNamedByTool(refusedNoReceipt, 'REFUSED')
  console.log('')
  console.log('── refused-without-matched-receipt (the kernel refusal was recorded, but no recorded refusal matches the receipt code — named, never a pass) ──')
  if (!refusedNoMatch.length) console.log('  none')
  printNamedByTool(refusedNoMatch, 'REFUSED-NO-MATCH')
  if (process.env.EXPLAIN_UNMEASURED) {
    for (const r of refusedNoMatch) {
      const d = r.verdict.refusalDetail || {}
      const face = d.face ? 'face ok=' + String(d.face.ok) + ' code=' + String(d.face.code) + ' msg=' + JSON.stringify(d.face.message) : 'face detail missing'
      const rec = (d.recorded || []).map((x) => x.path + '[' + x.kind + (x.code === null ? '' : ',code=' + x.code) + ',' + x.keys + 'k]').join(' ')
      console.log('    ' + r.key + '  |  ' + face + '  |  recorded: ' + (rec || 'none'))
    }
  }
  console.log('')
  console.log('── noForwardedReceipt (kernel receipts were recorded, but the payload shares none of their keys: the receipt was read for a side effect / helper, not forwarded — named with the recorded paths) ──')
  if (!noForwarded.length) console.log('  none')
  for (const r of noForwarded) console.log('  NO-FORWARDED  ' + r.key + '  (recorded: ' + (r.helpers.join(', ') || 'none') + ')')
  console.log('')
  console.log('── noReceiptShapedAnswer (the kernel answer was not receipt-shaped: bare object/array/scalar with no ok/code/action seam key — the named predicate\'s boundary, named, never a pass) ──')
  if (!noRecorded.length) console.log('  none')
  printNamedByTool(noRecorded, 'NO-RECEIPT-ANSWER')
  console.log('')
  for (const e of tableErr) console.log('  TABLE-ERROR  ' + e)
  console.log('')
  console.log('PENDING_SCOPE: 0 faces / 0 actions in this mode — --faces spec measures every face the registry publishes (Phase 2)')

  const expectedPoints = ONLY ? points.filter((p) => p.tool + '/' + (p.action === null ? '-' : p.action) === ONLY).length : points.length
  ok(a.length === 0, 'Phase 2 class A: every measured face success receipt carries every recorded kernel key (union(recorded) - faceKeys === 0)', a.length ? { missingKeys: a.length, points: [...new Set(a.map((f) => f.key))].slice(0, 60) } : undefined)
  ok(b.length === 0, 'Phase 2 class B: every measured refusal receipt carries the recorded refusal facts', b.length ? { missingFacts: b.length } : undefined)
  ok(tableErr.length === 0, 'Phase 2: the shared Phase 1 exception tables match the recorded receipts (no second table)', tableErr.length ? tableErr : undefined)
  ok(specResults.length === expectedPoints && specResults.length > 0, 'Phase 2 coverage: every registry point is named as compared / refused-before-kernel / noForwardedReceipt / noRecordedCalls / unreachable (' + specResults.length + '/' + expectedPoints + ')', { measured: specResults.length, expectedPoints })
  ok(a.every((f) => f.tool && f.path && f.kernelSource), 'Phase 2: every finding is named tool/action/path/kernelSource (not only counted)')
  ok(Object.keys(NOT_FROM_KERNEL).length === 7, 'Phase 2 tables: NOT_FROM_KERNEL is still the Phase 1 table (' + Object.keys(NOT_FROM_KERNEL).length + ' entries; no Phase 2 additions)', Object.keys(NOT_FROM_KERNEL))
  // Reverse lamp for the PRIMARY rule (see the flags comment): the two modes must differ on exactly the returned-refusal
  // points. Normal run: 23 compared points matched a RETURNED refusal object (kind:object) — not an Error. Legacy run:
  // error-only matching reports those same 23 (plus the 4 code-less helper-reads) as refused-without-matched-receipt.
  if (LEGACY_PRIMARY) {
    ok(refusedNoMatch.length === 27, '--legacy-primary reverse lamp: error-only matching reports exactly the 27 pre-fix points as refused-without-matched-receipt (measured ' + refusedNoMatch.length + ') — the 23 were false mismatches, the 4 are the code-less helper reads', { refusedNoMatch: refusedNoMatch.map((r) => r.key) })
  } else {
    ok(returnedRefusalPrimary === 23, 'PRIMARY rule self-check: exactly 23 refusal points matched a RETURNED refusal object (kind:object, same code), not a thrown Error — this is the only difference from the error-only rule', { returnedRefusalPrimary })
  }

  await rm(root, { recursive: true, force: true })
  console.log('')
  console.log('=== HOST RECEIPT SUPERSET [--faces spec]: ' + (failed === 0 ? 'every measured face carries every recorded kernel key' : failed + ' of ' + (failed + passed) + ' assertions failed') + ' | class A ' + a.length + ' missing keys / ' + new Set(a.map((f) => f.key)).size + ' points, class B ' + b.length + ' facts, unreachable ' + unreachable.length + ', noRecordedCalls ' + noRecorded.length + ' ===')
  process.exit(failed === 0 ? 0 : 1)
}

if (IS_MAIN) {
  if (SELF_TEST) await selfTest()
  else await main()
}

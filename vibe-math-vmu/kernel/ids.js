// vmu kernel · ids — THE ONE ID MINTER (docs/07 §5; the v5r «names are immortal» rule).
//
// WHY THIS EXISTS. Round 2 measured ~30 modules that mint ids from a module-local `let seq = 0` and never rebuild
// it from anything durable (arbitration, charter, citations, course, custody, delegation, explain, grant, ip,
// memory, notify, paper, publication, records, repropack, resource, scheduler, skills, tasks, trust, work, …).
// A restart therefore handed out `t-1` again — an id that a dismissed member, a closed ballot or an archived
// record may still own. The v5r line treats an id as a name: it is never reused, because archives, tasks and
// references must stay unambiguous forever.
//
// THE GUARANTEE, stated exactly: `mint(kind)` returns a number strictly greater than every number this process
// has seen for that kind AND every number the durable counter holds. Because the counter is written to the
// `ids` key (a declared durable key) and `observe()` feeds existing ids in at hydration time, even a LOST
// counter write cannot cause reuse: the observed maximum is the floor. A store that is absent or unbound does
// NOT silently pretend: `status().durable` is false and says so.
//
// WHAT THIS MODULE IS NOT: it is not a *name policy*. Prefixes stay where they were (`t-`, `b-`, `veto-`…), so
// every existing id format is preserved; the caller passes its own prefix.
//
// FACE CONVENTIONS: literal key reads; named refusals with hints; injected clock; reads never mutate.

export const apiVersion = 1

/** The durable key this face owns. It MUST be in `kernel/store.js` PUBLIC_KEYS (Round 1 lost a key that way). */
export const IDS_KEY = 'ids'

export const CODE = Object.freeze({
  badKind: 'VMU_IDS_BAD_KIND',
  unavailable: 'VMU_IDS_UNAVAILABLE',
  notBound: 'VMU_IDS_NOT_BOUND',
  persistFailed: 'VMU_IDS_PERSIST_FAILED',
})

export function refuse(code, message, hint, extra) {
  const e = new Error(message)
  e.code = code
  if (hint !== undefined) e.hint = hint
  if (extra !== undefined) e.detail = extra
  return e
}

const str = (v) => (typeof v === 'string' ? v.trim() : '')
const natural = (v, d) => { const n = Number(v); return Number.isInteger(n) && n >= 0 ? n : d }
const KIND_RE = /^[a-z][a-z0-9_-]*$/

/** The last `N` of an id (`t-12` ⇒ 12), or null. Exported because recovery reconciles counters with reality. */
export function idNumber(id) {
  const m = /(\d+)\s*$/.exec(String(id === undefined || id === null ? '' : id))
  return m ? Number(m[1]) : null
}

export function createIds({ store = null, clock = () => 0, log = null, bus = null, settings = {} } = {}) {
  const sget = (key, def) => {
    if (settings && typeof settings.get === 'function') { const v = settings.get(key); return v === undefined ? def : v }
    if (settings && Object.prototype.hasOwnProperty.call(settings, key)) return settings[key]
    return def
  }
  const say = (ev) => {
    if (!log) return
    try {
      if (typeof log.append === 'function') log.append(ev)
      else if (typeof log === 'function') log(ev)
    } catch (e) { /* logging never breaks the mint */ }
  }
  // The bus takes a HOOK NAME as its first argument (`kernel/bus.js` refuses a non-string), and it is async — a
  // rejection must be caught on the promise, not by a try/catch around the call.
  const emit = (name, payload) => {
    if (!bus || typeof bus.emit !== 'function') return null
    try {
      const r = bus.emit(name, payload)
      if (r && typeof r.catch === 'function') r.catch(() => {})
      return r
    } catch (e) { return null }
  }

  const counters = new Map()      // kind -> the LAST USED number
  const seen = new Map()          // kind -> how many ids were observed (statistics only)
  let persisted = 0
  let pending = null
  let lastPersistError = null
  let observations = 0
  let mints = 0
  let hydrated = false

  const requireKind = (kind) => {
    const k = str(kind)
    if (!k || !KIND_RE.test(k)) {
      throw refuse(CODE.badKind, 'an id kind must look like a lowercase name: ' + JSON.stringify(kind),
        'e.g. mint("task", "t-") — the kind is what the counter is stored under')
    }
    return k
  }
  const envelope = () => ({ v: 1, counters: Object.fromEntries([...counters.entries()].sort()), wroteAt: clock() })

  /**
   * `persistEvery` = how often the durable counter is written. The DEFAULT is 1 (every mint): a counter that
   * lags is still safe (observe()), but writing every mint makes the durable file self-sufficient for kinds whose
   * ids never appear in a projection. 0 declares "never write" — reported by status(), never faked.
   */
  const persistEvery = natural(sget('vmu.ids.persistEvery'), 1)

  const doPersist = async () => {
    if (!store || typeof store.patch !== 'function') return { ok: false, code: CODE.notBound, durable: false }
    try {
      await store.patch(IDS_KEY, () => envelope())
      persisted += 1
      lastPersistError = null
      return { ok: true, persisted }
    } catch (e) {
      lastPersistError = String((e && e.message) || e)
      say({ type: 'ids/persist-failed', at: clock(), error: lastPersistError })
      emit('ids/persist-failed', { at: clock(), error: lastPersistError })
      return { ok: false, code: (e && e.code) || CODE.persistFailed, error: lastPersistError }
    }
  }
  const schedulePersist = () => {
    if (persistEvery === 0) return null
    if (mints % persistEvery !== 0) return null
    pending = doPersist()
    return pending
  }

  /** Feed existing ids in (idempotent, max-only). This is the floor that makes a lost counter write harmless. */
  function observe(kind, ids) {
    const k = requireKind(kind)
    const list = Array.isArray(ids) ? ids : []
    let max = counters.get(k) || 0
    let raised = false
    for (const id of list) {
      const n = idNumber(id)
      if (n === null) continue
      if (n > max) { max = n; raised = true }
    }
    seen.set(k, (seen.get(k) || 0) + list.length)
    observations += list.length
    if (raised) counters.set(k, max)
    return { ok: true, kind: k, counter: max, observed: list.length, raised }
  }

  /**
   * Mint the next id for a kind. `prefix` is the module's own spelling (`t-`, `b-`, `veto-`), so existing id
   * formats are preserved byte for byte. The number is `max(counter, observed) + 1` and can never go backwards.
   */
  function mint(kind, prefix = null) {
    const k = requireKind(kind)
    const n = Math.max(0, counters.get(k) || 0) + 1
    counters.set(k, n)
    mints += 1
    const p = prefix === null || prefix === undefined ? k + '-' : String(prefix)
    const result = p + n
    if (persistEvery > 0 && mints % persistEvery === 0) schedulePersist()
    emit('ids/minted', { at: clock(), kind: k, id: result })
    return result
  }

  /** Read the durable counter. Called once at kernel start (after `store.open()`), before any face mints. */
  async function hydrate() {
    hydrated = true
    if (!store || typeof store.read !== 'function') return { ok: false, code: CODE.notBound, durable: false, counters: {} }
    let raw
    try { raw = store.read(IDS_KEY) } catch (e) { return { ok: false, code: CODE.unavailable, error: String((e && e.message) || e) } }
    if (raw && typeof raw === 'object' && raw.counters && typeof raw.counters === 'object') {
      for (const [kind, n] of Object.entries(raw.counters)) {
        const k = str(kind)
        if (!k || !Number.isInteger(Number(n))) continue
        counters.set(k, Math.max(counters.get(k) || 0, Number(n)))
      }
    }
    emit('ids/hydrated', { at: clock(), kinds: counters.size })
    return { ok: true, durable: durable(), counters: Object.fromEntries([...counters.entries()].sort()) }
  }

  const durable = () => !!(store && typeof store.patch === 'function' && persistEvery > 0)

  const status = () => ({
    ok: true,
    durable: durable(),
    hydrated,
    persistEvery,
    mints,
    observations,
    persisted,
    pendingWrite: !!pending,
    lastPersistError,
    counters: Object.fromEntries([...counters.entries()].sort()),
    seen: Object.fromEntries([...seen.entries()].sort()),
    note: durable()
      ? 'counters are projected to the ' + IDS_KEY + ' key; observe() reconciles them with ids that actually exist'
      : 'no durable store (or persistEvery=0): ids are unique WITHIN this process only - reported, never faked',
    at: clock(),
  })

  return {
    apiVersion,
    mint,
    observe,
    observeIds: observe,
    counter: (kind) => counters.get(requireKind(kind)) || 0,
    counters: () => Object.fromEntries([...counters.entries()].sort()),
    hydrate,
    flush: async () => { if (pending) { try { await pending } catch (e) { /* reported by status() */ } } return status() },
    status,
  }
}

// ── the module-level default instance ────────────────────────────────────────────────────────────────────────
// The ~30 modules that mint ids should not each thread a service through their constructors. They import
// `mint`/`observeIds` from here; the kernel binds the durable store ONCE at start. Unbound is safe (unique per
// process) and NAMED by `idsStatus().durable === false`, which is the honest half of the guarantee.
let current = createIds({})

/** Bind the process-wide minter to the kernel's durable store. Called once, after `store.open()`. */
export function bindIds(opts = {}) {
  current = createIds(opts)
  return current
}
/** The process-wide minter, or undefined when nothing was ever bound (tests that do not care get the default). */
export function currentIds() { return current }
export function mint(kind, prefix = null) { return current.mint(kind, prefix) }
export function observeIds(kind, ids) { return current.observe(kind, ids) }
export async function hydrateIds() { return await current.hydrate() }
export function idsStatus() { return current.status() }

export default createIds

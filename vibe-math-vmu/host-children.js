// vibe-math-vmu/host-children.js — THE RECOVERY CHILDREN PORT, EXTRACTED FROM THE ENTRY (phase 6, round 4).
//
// WHY IT LIVES HERE. The entry crossed the recorded 1200-line ceiling (`docs/02` §7: "单文件建议 ≤1200 行", enforced by
// `tests/audit-code-size.test.mjs` with a backlog that may SHRINK but never GROW). The rule caught it before the file
// became unmaintainable, which is exactly what it is for - the same thing happened in Round 81 for the turn-delivery
// assembly (`host-deliver.js`), and that extraction is why this block now has an obvious neighbour to copy.
//
// THE BOUNDARY IS THE SAME AS ROUND 81'S. The entry still owns assembly; this module owns ONE concern - "which live child
// sessions belong to this parent, and what is this parent's id" - and it takes `ctx` and the subagents resolver as
// PARAMETERS rather than reaching for them, so it is testable without a plugin entry.
//
// WHY THE TWO METHODS EXIST AT ALL. The durable roster records a `childId` per member; after a restart those ids must be
// checked against reality or recovery is guessing. The host's `listChildren(parentSessionId)` IS that directory (it does
// not load or resume an Agent), so the port is a thin, honest adapter over it - and when the host lacks it, the port
// refuses BY NAME (`VMU_RESUME_CHILDREN_UNAVAILABLE`) instead of reporting an empty roster, because "no children" and
// "cannot tell" are different facts and a silent empty list would corrupt the reconciliation.

/**
 * Build the recovery children port.
 *
 * @param {object} deps
 * @param {object} deps.ctx              the plugin context; only `sessionId` and `get()` are used, both defensively.
 * @param {() => object|null} deps.resolveSubagents  resolves the host `subagents` service AT CALL TIME (a plugin's
 *                                        apply can run before that service mounts, so binding it now would refuse
 *                                        every command forever - the reason every seam in this plugin is late-bound).
 */
export function createChildrenPort({ ctx, resolveSubagents }) {
  return {
    /** The parent session id this roster is reconciled against, or null when the host cannot name one. */
    parentId: () => {
      try {
        if (ctx && typeof ctx.sessionId === 'string' && ctx.sessionId) return ctx.sessionId
        // ★ PHASE 6: the old line read `ctx.get('session')`, a service that exists in NEITHER host version (the key is
        // `sessions`, a SessionStore). The fallback now uses its list() and takes it only when EXACTLY ONE session is
        // live - "the first of several" would invent a parent, and a wrong parent id is worse than a missing one.
        const store = ctx && typeof ctx.get === 'function' ? ctx.get('sessions') : null
        const live = store && typeof store.list === 'function' ? store.list() : null
        if (Array.isArray(live) && live.length === 1 && live[0] && typeof live[0].id === 'string' && live[0].id) return live[0].id
      } catch { /* a ctx that cannot answer is reported as "no parent id" */ }
      return null
    },

    /** The live direct-child ids under `parentId`. Refuses by name when the host has no directory to read. */
    list: async (parentId) => {
      const subs = resolveSubagents()
      if (!subs || typeof subs.listChildren !== 'function') {
        const err = new Error('the host exposes no subagents.listChildren, so live children cannot be reconciled')
        err.code = 'VMU_RESUME_CHILDREN_UNAVAILABLE'
        err.hint = 'the recovery port NAMES the gap instead of guessing the roster (docs/26 §3.22)'
        throw err
      }
      const rows = await subs.listChildren(parentId)
      // DSH types the catalog rows as objects carrying `id`; older hosts answered bare strings. Both are accepted, and
      // anything else is DROPPED rather than reported - an id we cannot read is not an id we may invent.
      return (Array.isArray(rows) ? rows : [])
        .map((r) => (typeof r === 'string' ? r : (r && (r.id || r.sessionId || r.childId)) || null))
        .filter(Boolean)
    },
  }
}

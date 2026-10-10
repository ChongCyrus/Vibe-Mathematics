// vmu kernel retention — pruning PLAN, trash, quota and GC. Default behaviour: REPORT ONLY.
//
// Spec: docs/07-durability-library.md §4.3 (版本/历史/保留/回收站), §4.4 (冷热分层), §4.8 (配额与清理),
//       §4.10 (头部列表/正文上限 ⇒ 截断必须计数) + docs/21-observability-and-operations.md §2.5/§17
//       ("计数不静默": 任何裁剪/丢弃/跳过都留痕并计数).
// Keys (settings/planned.js): vmu.records.retention.* / vmu.records.trash.* / vmu.records.history.* /
//       vmu.quota.* / vmu.gc.*
// Codes (03-§8): VMU_QUOTA_EXCEEDED / VMU_RETENTION_CONFLICT / VMU_GC_REFUSED / VMU_TRASH_EXPIRED /
//       VMU_NO_SUCH_OBJECT + the counted-truncation marker VMU_RETENTION_TRUNCATED (NOT yet registered ✗).
//
// INVARIANTS (hard):
//   1. DEFAULT REPORT ONLY ✗: `apply`/`gc` delete nothing unless the caller passes `dryRun:false`;
//      `plan`/`quota`/`status` never mutate and never touch the library.
//   2. A PERMANENTLY MARKED object is never pruned — it is skipped AND counted (`skippedPermanent`),
//      because §4.3 says permanent retention is an EXPLICIT mark, not the side effect of "cleanup missed it".
//   3. EVERY removal is traceable: `removed[]` carries {id, kind, reason, bytes, atMs}; a plan bigger than
//      the action cap reports `dropped` and the `VMU_RETENTION_TRUNCATED` marker (no silent loss).
//   4. QUOTA boundary dispatches on `vmu.quota.onExceed`: warn (log + count) | refuse (NAMED refusal
//      BEFORE any deletion) | degrade (proceed, marked `degraded`).
//   5. The CLOCK is injected (`clock()`), so two runs on the same state are byte-identical.
//   6. ZERO CONFIG never throws: without an injected `library`, `plan()` is an empty plan.
//
// INJECTED LIBRARY ADAPTER (all methods are awaited, so BOTH a sync adapter and the async
// `createLibrary()` surface work; a missing method is counted, never invented):
//   library.list({ scope })            -> Promise|[{ id, bytes, atMs, permanent?, markers?: string[], refs?,
//                                           trashed?, trashedAtMs?, history?: [{ rev, bytes, atMs, storeMode? }] }]
//   library.remove(id)                 -> void|Promise   irreversible object delete
//   library.removeRevision(id, rev)    -> void|Promise   delete ONE history revision (optional)
//   library.moveToTrash(id)            -> void|Promise   soft delete
//   library.restore(id)                -> void|Promise   undo a soft delete
//
// API SHAPE: the library-facing methods (`plan`/`apply`/`trash`/`restore`/`purge`/`quota`/`gc`) are
// ASYNC — `kernel/library.js` exposes an async surface, and `await` on a plain value is a no-op, so a
// synchronous adapter keeps working unchanged. `status()` is sync (it touches no library method).

export const apiVersion = 1

/** Counted-truncation marker (a WARNING, not a refusal): something was dropped and is being reported. */
export const RETENTION_WARNING = 'VMU_RETENTION_TRUNCATED'
/** Warning emitted when usage crosses the soft limit. */
export const QUOTA_SOFT_WARNING = 'VMU_QUOTA_SOFT_EXCEEDED'
/** Default permanent marker value (§4.3: permanent retention is explicit). */
export const DEFAULT_PERMANENT_MARKER = 'keep-forever'

/** Named refusal carrying a hint and context (same shape as the other kernels). */
export function refuse(code, message, hint, extra) {
  const err = new Error(message)
  err.code = code
  err.hint = hint
  if (extra) Object.assign(err, extra)
  return err
}

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null)
const str = (v) => (typeof v === 'string' && v.length ? v : null)
const bool = (v) => (typeof v === 'boolean' ? v : null)

/**
 * Create the retention service. Everything is injected; nothing is read from the environment and no timer
 * is created here (GC runs when CALLED — `vmu.gc.autoRun` only says whether an explicit run may act
 * without a separate confirmation).
 */
export function createRetention({ clock = () => Date.now(), log = () => {}, settings = {}, bus = null, library = null, maxActions = 200 } = {}) {
  const trash = new Map()          // id -> { id, bytes, atMs, reason }
  let lastPlanAtMs = null
  const stats = {
    planned: 0, applied: 0, trashed: 0, restored: 0, purged: 0,
    skippedPermanent: 0, skippedGrace: 0, skippedExempt: 0, skippedUnsupported: 0,
    dropped: 0, warned: 0, refused: 0, degraded: 0, truncatedPlans: 0, tiered: 0,
  }

  const cfg = () => ({
    keepEvery: num(settings['vmu.records.retention.keepEvery']) ?? 0,               // 0 = keep every revision
    permanentMarker: str(settings['vmu.records.retention.permanentMarker']) || DEFAULT_PERMANENT_MARKER,
    maxBytes: num(settings['vmu.records.retention.maxBytes']) ?? 0,                 // 0 = unlimited
    tierThreshold: num(settings['vmu.records.retention.tierThreshold']) ?? 0,       // 0 = tiering off
    trashRetainDays: num(settings['vmu.records.trash.retainDays']) ?? 30,
    trashAutoPurge: bool(settings['vmu.records.trash.autoPurge']) ?? false,
    trashCountInQuota: bool(settings['vmu.records.trash.countInQuota']) ?? true,
    historyDepth: num(settings['vmu.records.history.depth']) ?? 0,                  // 0 = unlimited
    historyStoreMode: str(settings['vmu.records.history.storeMode']) || 'full',
    softBytes: num(settings['vmu.quota.softBytes']) ?? 0,
    hardBytes: num(settings['vmu.quota.hardBytes']) ?? 0,
    onExceed: str(settings['vmu.quota.onExceed']) || 'warn',
    warnAt: num(settings['vmu.quota.warnAt']) ?? 0.8,
    gcAutoRun: bool(settings['vmu.gc.autoRun']) ?? false,
    gcGraceDays: num(settings['vmu.gc.graceDays']) ?? 7,
    gcExemptMarkers: Array.isArray(settings['vmu.gc.exemptMarkers']) ? settings['vmu.gc.exemptMarkers'].map(String) : [],
    gcScope: str(settings['vmu.gc.scope']) || 'workspace',
  })

  /** Configuration conflicts are NAMED (`VMU_RETENTION_CONFLICT`) instead of silently "fixing" limits. */
  function validate(c) {
    if (!['warn', 'refuse', 'degrade'].includes(c.onExceed)) {
      throw refuse('VMU_RETENTION_CONFLICT', 'unknown vmu.quota.onExceed: ' + String(c.onExceed),
        'use warn | refuse | degrade (07-§4.8: the boundary action must be predictable)', { onExceed: c.onExceed })
    }
    if (c.softBytes > 0 && c.hardBytes > 0 && c.softBytes > c.hardBytes) {
      throw refuse('VMU_RETENTION_CONFLICT', 'vmu.quota.softBytes > vmu.quota.hardBytes (' + c.softBytes + ' > ' + c.hardBytes + ')',
        'the soft limit must be at or below the hard limit', { softBytes: c.softBytes, hardBytes: c.hardBytes })
    }
    for (const [k, v] of [['keepEvery', c.keepEvery], ['trashRetainDays', c.trashRetainDays], ['historyDepth', c.historyDepth], ['gcGraceDays', c.gcGraceDays]]) {
      if (v < 0) throw refuse('VMU_RETENTION_CONFLICT', k + ' must be >= 0 (got ' + v + ')', 'negative retention windows are not meaningful', { key: k, value: v })
    }
    if (c.historyStoreMode !== 'full' && c.historyStoreMode !== 'diff') {
      throw refuse('VMU_RETENTION_CONFLICT', 'unknown vmu.records.history.storeMode: ' + String(c.historyStoreMode),
        'use full | diff; with diff the BASE revision is never pruned (07-§4.3 fallback rule)', { storeMode: c.historyStoreMode })
    }
    return c
  }

  const hasLibrary = () => !!library && typeof library.list === 'function'
  const listObjects = async (scope) => {
    const out = await library.list({ scope })
    return Array.isArray(out) ? out.slice().sort((a, b) => String(a.id).localeCompare(String(b.id))) : []
  }
  const isPermanent = (o, c) => o && (o.permanent === true || (Array.isArray(o.markers) && o.markers.includes(c.permanentMarker)))
  const ageDays = (atMs, nowMs) => Math.floor((nowMs - Number(atMs || 0)) / 86400000)
  const emptyPlan = (scope, why, extra) => Object.assign({
    scope, atMs: clock(), actions: [], candidates: 0, removable: 0, bytes: 0,
    overSoft: false, overHard: false, onExceed: cfg().onExceed, degraded: false,
    counts: { pruneRevision: 0, purgeTrash: 0, tierCold: 0, skippedPermanent: 0, skippedGrace: 0, skippedExempt: 0, skippedUnsupported: 0 },
    dropped: 0, warning: null, why,
  }, extra || {})

  /**
   * PLAN — pure: counts what WOULD be pruned, never calls a mutating library method.
   * Zero-config (no library) => empty plan with a `why`, never a throw.
   */
  async function plan({ scope = null } = {}) {
    const c = validate(cfg())
    if (!hasLibrary()) { lastPlanAtMs = clock(); return emptyPlan(scope, 'no library injected (zero-config): nothing to plan') }
    const nowMs = clock()
    const objects = await listObjects(scope)
    const counts = { pruneRevision: 0, purgeTrash: 0, tierCold: 0, skippedPermanent: 0, skippedGrace: 0, skippedExempt: 0, skippedUnsupported: 0 }
    const all = []
    let bytes = 0
    let trashBytes = 0
    for (const o of objects) {
      const b = num(o.bytes) ?? 0
      const permanent = isPermanent(o, c)
      if (permanent) {
        counts.skippedPermanent++
        continue                                    // §4.3: an explicit permanent mark is never a candidate
      }
      if (o.trashed) trashBytes += b
      bytes += b
      // (a) history pruning: keep every `keepEvery`-th revision; with storeMode=diff the BASE survives.
      if (Array.isArray(o.history) && o.history.length > 1) {
        const revs = o.history.slice().sort((x, y) => (num(x.rev) ?? 0) - (num(y.rev) ?? 0))
        const depth = c.historyDepth > 0 ? c.historyDepth : revs.length
        const prunable = revs.slice(0, Math.max(0, revs.length - depth))
        for (const r of prunable) {
          const isBase = r.rev === revs[0].rev
          if (c.historyStoreMode === 'diff' && isBase) continue       // fallback-to-full rule (07-§4.3)
          if (c.keepEvery > 0 && (num(r.rev) ?? 0) % c.keepEvery === 0) continue
          all.push({ kind: 'prune-revision', id: o.id, rev: r.rev, bytes: num(r.bytes) ?? 0, reason: 'history depth/keepEvery' })
          counts.pruneRevision++
        }
      }
      // (b) trash expiry: explicit, counted, and only ever executed by an explicit apply/purge.
      if (o.trashed && c.trashRetainDays >= 0 && ageDays(o.trashedAtMs ?? o.atMs, nowMs) >= c.trashRetainDays) {
        all.push({ kind: 'purge-trash', id: o.id, bytes: b, reason: 'trash retention ' + c.trashRetainDays + 'd expired' })
        counts.purgeTrash++
      }
      // (c) tiering (07-§4.4): mark cold, NEVER delete, identity untouched.
      if (c.tierThreshold > 0 && b >= c.tierThreshold) {
        all.push({ kind: 'tier-cold', id: o.id, bytes: b, reason: '>= tier threshold ' + c.tierThreshold, mutates: false })
        counts.tierCold++
        stats.tiered++
      }
    }
    const overSoft = c.softBytes > 0 && bytes >= c.softBytes
    const overHard = c.hardBytes > 0 && bytes > c.hardBytes
    const mutating = all.filter((a) => a.mutates !== false).sort((a, b) => (String(a.id) + a.kind + (a.rev ?? '')).localeCompare(String(b.id) + b.kind + (b.rev ?? '')))
    const kept = mutating.slice(0, maxActions)
    const dropped = mutating.length - kept.length
    if (dropped > 0) {
      stats.dropped += dropped
      stats.truncatedPlans++
      log('retention: plan truncated, ' + dropped + ' action(s) dropped (' + RETENTION_WARNING + ')')
      if (bus && typeof bus.emit === 'function') bus.emit('retention/truncated', { dropped, cap: maxActions })
    }
    lastPlanAtMs = nowMs
    stats.planned++
    return {
      scope, atMs: nowMs, actions: all, removable: mutating.length, candidates: kept.length,
      bytes, trashBytes, overSoft, overHard, onExceed: c.onExceed, degraded: false, counts, dropped,
      warning: dropped > 0 ? RETENTION_WARNING : (overSoft ? QUOTA_SOFT_WARNING : null),
      why: 'computed from the injected library; nothing was changed',
    }
  }

  /**
   * APPLY — executes the plan ONLY with an explicit `dryRun:false` (invariant 1). With onExceed=refuse an
   * over-hard workspace is refused BEFORE any deletion (07-§4.8: never "half-written then failed").
   */
  async function apply({ scope = null, dryRun = true } = {}) {
    const c = validate(cfg())
    const p = await plan({ scope })
    if (dryRun !== false) return { applied: false, dryRun: true, plan: p, removed: [], dropped: 0, warning: p.warning }
    if (!hasLibrary()) return { applied: false, dryRun: false, plan: p, removed: [], dropped: 0, warning: p.warning, reason: 'no library injected (zero-config)' }
    if (c.onExceed === 'refuse' && p.overHard) {
      stats.refused++
      throw refuse('VMU_QUOTA_EXCEEDED', 'workspace exceeds the hard quota and onExceed=refuse (bytes=' + p.bytes + ' > hardBytes=' + c.hardBytes + ')',
        'raise vmu.quota.hardBytes, prune with an explicit apply after fixing the quota, or set onExceed=warn|degrade',
        { scope, bytes: p.bytes, hardBytes: c.hardBytes, plan: { removable: p.removable, dropped: p.dropped } })
    }
    if (c.onExceed === 'degrade' && p.overHard) { stats.degraded++; log('retention: degraded (over hard quota, onExceed=degrade)') }
    if (c.onExceed === 'warn' && p.overHard) { stats.warned++; log('retention: over hard quota (onExceed=warn): bytes=' + p.bytes + ' > ' + c.hardBytes) }
    const removed = []
    let dropped = 0
    for (const a of p.actions) {
      if (a.mutates === false) continue                       // tiering never deletes
      if (removed.length >= maxActions) { dropped++; continue }
      try {
        if (a.kind === 'prune-revision') {
          if (typeof library.removeRevision !== 'function') { stats.skippedUnsupported++; continue }
          await library.removeRevision(a.id, a.rev)
        } else if (a.kind === 'purge-trash') {
          await library.remove(a.id)
        } else { stats.skippedUnsupported++; continue }
        removed.push({ id: a.id, kind: a.kind, rev: a.rev, bytes: a.bytes, reason: a.reason, atMs: clock() })
      } catch (e) {
        // A failing library call is reported, never swallowed, and never faked as success.
        removed.push({ id: a.id, kind: a.kind, rev: a.rev, bytes: a.bytes, reason: 'FAILED: ' + String((e && e.message) || e), atMs: clock(), failed: true })
      }
    }
    if (dropped > 0) { stats.dropped += dropped; log('retention: apply dropped ' + dropped + ' action(s) at the cap (' + RETENTION_WARNING + ')') }
    stats.applied += removed.filter((r) => !r.failed).length
    return { applied: true, dryRun: false, plan: p, removed, dropped, warning: dropped > 0 ? RETENTION_WARNING : p.warning, degraded: c.onExceed === 'degrade' && p.overHard }
  }

  /** TRASH — soft delete (07-§4.3): recorded, listed, restorable; the permanent purge is a separate call. */
  async function trashObject({ id, reason = null } = {}) {
    if (!str(id)) throw refuse('VMU_NO_SUCH_OBJECT', 'trash needs an object id', 'e.g. trash({id:"obj-1"})')
    if (trash.has(id)) throw refuse('VMU_TRASH_EXPIRED', 'object is already in the trash: ' + id, 'restore it or purge it first', { id, atMs: trash.get(id).atMs })
    const c = validate(cfg())
    let bytes = 0
    if (hasLibrary()) {
      const found = (await listObjects(null)).find((o) => String(o.id) === String(id))
      if (!found) throw refuse('VMU_NO_SUCH_OBJECT', 'unknown object: ' + id, 'list the library first; a purge cannot be undone', { id })
      bytes = num(found.bytes) ?? 0
      if (isPermanent(found, c)) throw refuse('VMU_RETENTION_CONFLICT', 'object carries the permanent marker: ' + id, 'strip the marker explicitly before trashing (07-§4.3)', { id, marker: c.permanentMarker })
      if (typeof library.moveToTrash === 'function') await library.moveToTrash(id)
    }
    const rec = { id: String(id), bytes, atMs: clock(), reason: reason || 'trashed by explicit call' }
    trash.set(String(id), rec)
    stats.trashed++
    return { ok: true, id: rec.id, atMs: rec.atMs, bytes, countedInQuota: c.trashCountInQuota, reason: rec.reason }
  }

  /** RESTORE — undo a soft delete; an unknown/already-purged id is a NAMED refusal (`VMU_TRASH_EXPIRED`). */
  async function restore({ id } = {}) {
    const key = String(id)
    if (!trash.has(key)) throw refuse('VMU_TRASH_EXPIRED', 'nothing to restore for id: ' + key, 'only trashed (not purged) objects can be restored', { id: key })
    if (hasLibrary() && typeof library.restore === 'function') await library.restore(key)
    const rec = trash.get(key)
    trash.delete(key)
    stats.restored++
    return { ok: true, id: key, atMs: clock(), trashedAtMs: rec.atMs, ageMs: clock() - rec.atMs }
  }

  /**
   * PURGE — the EXPLICIT irreversible action (07-§4.3: "彻底清除是显式动作并留审计条目"). Acts by name;
   * `dryRun:true` previews. Retention defaults to vmu.records.trash.retainDays.
   */
  async function purge({ olderThanMs = null, dryRun = false } = {}) {
    const c = validate(cfg())
    const window = num(olderThanMs) === null ? c.trashRetainDays * 86400000 : Number(olderThanMs)
    const nowMs = clock()
    const expired = [...trash.values()].filter((r) => nowMs - r.atMs >= window).sort((a, b) => a.id.localeCompare(b.id))
    const kept = expired.slice(0, maxActions)
    const dropped = expired.length - kept.length
    if (dropped > 0) stats.dropped += dropped
    if (dryRun === true) return { purged: kept.map((r) => r.id), dryRun: true, dropped, warning: dropped > 0 ? RETENTION_WARNING : null, bytes: kept.reduce((a, r) => a + r.bytes, 0) }
    const purged = []
    for (const r of kept) {
      if (hasLibrary() && typeof library.remove === 'function') {
        try { await library.remove(r.id) } catch (e) { purged.push({ id: r.id, failed: true, reason: String((e && e.message) || e) }); continue }
      }
      trash.delete(r.id)
      purged.push({ id: r.id, bytes: r.bytes, reason: 'explicit purge (older than ' + window + 'ms)', atMs: nowMs })
    }
    stats.purged += purged.filter((p) => !p.failed).length
    return { purged, dryRun: false, dropped, warning: dropped > 0 ? RETENTION_WARNING : null, bytes: purged.reduce((a, p) => a + (p.bytes || 0), 0) }
  }

  /** QUOTA — read-only capacity view (soft/hard thresholds + the configured boundary action). */
  async function quota({ scope = null } = {}) {
    const c = validate(cfg())
    if (!hasLibrary()) return { scope, bytes: 0, objects: 0, trashBytes: 0, softBytes: c.softBytes, hardBytes: c.hardBytes, overSoft: false, overHard: false, action: c.onExceed, reason: 'no library injected (zero-config)', warning: null }
    const objects = await listObjects(scope)
    let bytes = 0
    let trashBytes = 0
    let visible = 0
    for (const o of objects) {
      const b = num(o.bytes) ?? 0
      bytes += b
      if (o.trashed) { trashBytes += b; if (!c.trashCountInQuota) visible += b }
    }
    const counted = c.trashCountInQuota ? bytes : bytes - visible
    const overSoft = c.softBytes > 0 && counted >= c.softBytes
    const overHard = c.hardBytes > 0 && counted > c.hardBytes
    const warning = overHard ? 'VMU_QUOTA_EXCEEDED' : (overSoft ? QUOTA_SOFT_WARNING : null)
    return { scope, bytes: counted, rawBytes: bytes, objects: objects.length, trashBytes, softBytes: c.softBytes, hardBytes: c.hardBytes, overSoft, overHard, action: c.onExceed, warnAt: c.warnAt, warning }
  }

  /**
   * GC — orphan collection (07-§4.8: "默认只报告不执行"). Candidates: referenced-by-nobody (`refs===0`),
   * older than the grace window, not carrying an exempt marker and not permanent. Acting requires
   * `dryRun:false` AND (`vmu.gc.autoRun===true` OR an explicit `confirm:true`) — otherwise `VMU_GC_REFUSED`.
   */
  async function gc({ scope = null, dryRun = true, confirm = false } = {}) {
    const c = validate(cfg())
    const nowMs = clock()
    const base = { scope: scope === null ? c.gcScope : scope, atMs: nowMs, graceDays: c.gcGraceDays, autoRun: c.gcAutoRun, exemptMarkers: c.gcExemptMarkers.slice() }
    if (!hasLibrary()) return Object.assign({ applied: false, dryRun: true, candidates: [], skippedGrace: 0, skippedExempt: 0, skippedPermanent: 0, dropped: 0, warning: null, reason: 'no library injected (zero-config)' }, base)
    const candidates = []
    let skippedGrace = 0
    let skippedExempt = 0
    let skippedPermanent = 0
    for (const o of await listObjects(scope)) {
      if (isPermanent(o, c)) { skippedPermanent++; continue }
      if (Array.isArray(o.markers) && o.markers.some((m) => c.gcExemptMarkers.includes(m))) { skippedExempt++; continue }
      const refs = num(o.refs)
      if (refs !== 0 || o.trashed) continue                       // only true orphans
      if (ageDays(o.atMs, nowMs) < c.gcGraceDays) { skippedGrace++; continue }
      candidates.push({ id: o.id, bytes: num(o.bytes) ?? 0, atMs: o.atMs, reason: 'orphan (refs=0) older than grace' })
    }
    candidates.sort((a, b) => String(a.id).localeCompare(String(b.id)))
    const kept = candidates.slice(0, maxActions)
    const dropped = candidates.length - kept.length
    if (dropped > 0) stats.dropped += dropped
    const out = Object.assign({
      dryRun: dryRun !== false, candidates: kept, total: candidates.length, dropped,
      skippedGrace, skippedExempt, skippedPermanent,
      warning: dropped > 0 ? RETENTION_WARNING : null,
    }, base)
    if (dryRun !== false) { stats.planned++; return Object.assign({ applied: false, removed: [] }, out) }
    if (!c.gcAutoRun && confirm !== true) {
      stats.refused++
      throw refuse('VMU_GC_REFUSED', 'gc would delete ' + kept.length + ' orphan(s) but vmu.gc.autoRun=false and no confirm:true was given',
        'pass {dryRun:false, confirm:true} for an explicit run, or set vmu.gc.autoRun=true (07-§4.8)', { candidates: kept.length, graceDays: c.gcGraceDays })
    }
    const removed = []
    let localDropped = dropped
    for (const cand of kept) {
      if (removed.length >= maxActions) { localDropped++; continue }
      const rec = { id: cand.id, kind: 'gc-orphan', bytes: cand.bytes, reason: cand.reason, atMs: clock() }
      try { if (typeof library.remove === 'function') await library.remove(cand.id); removed.push(rec) }
      catch (e) { removed.push(Object.assign({}, rec, { failed: true, reason: 'FAILED: ' + String((e && e.message) || e) })) }
    }
    stats.applied += removed.filter((r) => !r.failed).length
    if (localDropped > dropped) stats.dropped += localDropped - dropped
    return Object.assign({ applied: true, removed, dropped: localDropped, warning: localDropped > 0 ? RETENTION_WARNING : null }, out, { dryRun: false })
  }

  /** STATUS — read-only overview (never mutates). */
  function status() {
    const c = cfg()
    return {
      apiVersion, config: c, stats: Object.assign({}, stats),
      trashCount: trash.size, trashBytes: [...trash.values()].reduce((a, r) => a + r.bytes, 0),
      lastPlanAtMs, maxActions, libraryInjected: hasLibrary(),
      defaultDryRun: true,
    }
  }

  return { apiVersion, plan, apply, trash: trashObject, restore, purge, quota, gc, status, refuse, RETENTION_WARNING }
}

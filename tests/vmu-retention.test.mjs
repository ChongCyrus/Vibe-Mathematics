// tests/vmu-retention.test.mjs — independent test for kernel/retention.js (batch-1 slice 8).
// Scenarios: zero-config never throws + empty plan; DEFAULT REPORT ONLY (apply/gc touch nothing);
// permanent marker is never pruned but IS counted; quota warn|refuse|degrade (refuse BEFORE any deletion);
// GC grace window + exempt markers + explicit confirmation; counted truncation (cap ⇒ dropped);
// trash/restore/purge with named refusals; determinism with an injected clock; read-only surfaces;
// ASYNC adapter compatibility (the real kernel/library.js surface is async).
import { createRetention, refuse, RETENTION_WARNING, QUOTA_SOFT_WARNING } from '../vibe-math-vmu/kernel/retention.js'

let pass = 0, fail = 0
const ok = (cond, label) => { if (cond) { pass++ } else { fail++; console.log('FAIL ' + label) } }
const throws = async (fn) => { try { await fn(); return { threw: false } } catch (e) { return { threw: true, code: e && e.code, msg: String(e && e.message), hint: e && e.hint } } }
const DAY = 86400000
const NOW = 1700000000000

/** Fake library seam (sync): a plain object store with an action log. */
function mkLib(seed = []) {
  const st = { objects: seed.map((o) => Object.assign({}, o, { markers: (o.markers || []).slice(), history: (o.history || []).map((r) => Object.assign({}, r)) })), log: [] }
  return {
    st,
    dump: () => JSON.stringify(st.objects.map((o) => ({ id: o.id, bytes: o.bytes, trashed: !!o.trashed, markers: o.markers, revs: (o.history || []).map((r) => r.rev) }))),
    list() { return st.objects.map((o) => Object.assign({}, o, { markers: (o.markers || []).slice(), history: (o.history || []).map((r) => Object.assign({}, r)) })) },
    remove(id) { st.log.push('remove:' + id); st.objects = st.objects.filter((o) => o.id !== id) },
    removeRevision(id, rev) { st.log.push('rmrev:' + id + '#' + rev); const o = st.objects.find((x) => x.id === id); if (o) o.history = o.history.filter((r) => r.rev !== rev) },
    moveToTrash(id) { st.log.push('trash:' + id); const o = st.objects.find((x) => x.id === id); if (o) o.trashed = true },
    restore(id) { st.log.push('restore:' + id); const o = st.objects.find((x) => x.id === id); if (o) o.trashed = false },
  }
}
/** Fake library seam (ASYNC): proves the adapter contract matches an async surface (kernel/library.js). */
function mkAsyncLib(seed = []) {
  const sync = mkLib(seed)
  return {
    st: sync.st,
    list: async () => sync.list(),
    remove: async (id) => sync.remove(id),
    removeRevision: async (id, rev) => sync.removeRevision(id, rev),
    moveToTrash: async (id) => sync.moveToTrash(id),
    restore: async (id) => sync.restore(id),
  }
}
const mk = (settings = {}, lib = null, cap = 200) => createRetention({ clock: () => NOW, log: () => {}, settings, library: lib, maxActions: cap })

// 1) zero-config: no library ⇒ empty plan, no throw, honest reason, read-only status
{
  const r = mk()
  const p = await r.plan()
  ok(Array.isArray(p.actions) && p.actions.length === 0 && p.removable === 0, 'zero-config plan is empty')
  ok(/zero-config/.test(String(p.why)), 'zero-config plan states why (no library injected)')
  const a = await r.apply({ dryRun: false })
  ok(a.applied === false && /zero-config/.test(String(a.reason || '')), 'zero-config apply reports instead of pretending')
  const g = await r.gc({ dryRun: false, confirm: true })
  ok(g.applied === false && /zero-config/.test(String(g.reason || '')), 'zero-config gc reports instead of throwing')
  const q = await r.quota()
  ok(q.bytes === 0 && q.reason, 'zero-config quota is 0 with a reason')
  const s = JSON.stringify(r.status())
  await r.plan(); await r.quota(); r.status()
  ok(JSON.stringify(r.status()) === s, 'status is stable across read-only calls')
}

// 2) DEFAULT REPORT ONLY: apply/gc must not touch the library without dryRun:false
{
  const lib = mkLib([
    { id: 'o1', bytes: 100, atMs: NOW - 40 * DAY, trashed: true, trashedAtMs: NOW - 40 * DAY, refs: 3 },
    { id: 'o2', bytes: 200, atMs: NOW - 40 * DAY, refs: 0, history: [{ rev: 1, bytes: 10 }, { rev: 2, bytes: 10 }, { rev: 3, bytes: 10 }] },
  ])
  const r = mk({ 'vmu.records.trash.retainDays': 30, 'vmu.records.history.depth': 1 }, lib)
  const before = lib.dump()
  const a = await r.apply()
  ok(a.applied === false && a.dryRun === true && lib.dump() === before && lib.st.log.length === 0, 'apply defaults to dry-run (library untouched)')
  const g = await r.gc()
  ok(g.applied === false && lib.st.log.length === 0, 'gc defaults to dry-run (library untouched)')
  ok((await r.plan()).removable > 0, 'the dry-run plan still reports the removable actions')
}

// 3) explicit dryRun:false ⇒ ACTS, and every removal is traceable with a reason
{
  const lib = mkLib([
    { id: 'o1', bytes: 100, atMs: NOW - 40 * DAY, trashed: true, trashedAtMs: NOW - 40 * DAY, refs: 3 },
    { id: 'o2', bytes: 200, atMs: NOW - 40 * DAY, refs: 0, history: [{ rev: 1, bytes: 10 }, { rev: 2, bytes: 10 }, { rev: 3, bytes: 10 }] },
  ])
  const r = mk({ 'vmu.records.trash.retainDays': 30, 'vmu.records.history.depth': 1 }, lib)
  const a = await r.apply({ dryRun: false })
  ok(a.applied === true && a.removed.length > 0, 'explicit dryRun:false applies the plan')
  ok(a.removed.every((x) => !!x.reason && typeof x.atMs === 'number'), 'every removal carries a reason and a timestamp')
  ok(lib.st.log.some((l) => l.startsWith('remove:o1')), 'the expired trash entry was permanently removed')
  ok(lib.st.log.some((l) => l.startsWith('rmrev:o2#2')), 'the prunable revision was removed by revision')
}

// 4) PERMANENT MARKER: never pruned, skipped AND counted (also refused for trash)
{
  const lib = mkLib([
    { id: 'keep', bytes: 500, atMs: NOW - 400 * DAY, trashed: true, trashedAtMs: NOW - 400 * DAY, markers: ['keep-forever'] },
    { id: 'plain', bytes: 500, atMs: NOW - 400 * DAY, trashed: true, trashedAtMs: NOW - 400 * DAY },
  ])
  const r = mk({ 'vmu.records.trash.retainDays': 30 }, lib)
  const p = await r.plan()
  ok(p.counts.skippedPermanent === 1, 'permanent object is skipped and counted')
  ok(!p.actions.some((a) => a.id === 'keep'), 'permanent object is not in the plan')
  await r.apply({ dryRun: false })
  ok(lib.st.objects.some((o) => o.id === 'keep'), 'permanent object survives an apply')
  ok(!lib.st.objects.some((o) => o.id === 'plain'), 'the non-permanent peer was pruned (control)')
  const t = await throws(() => r.trash({ id: 'keep' }))
  ok(t.threw && t.code === 'VMU_RETENTION_CONFLICT' && !!t.hint, 'trashing a permanently-marked object is a named refusal')
}

// 5) GC: grace window + exempt markers + explicit confirmation / autoRun
{
  const lib = mkLib([
    { id: 'orphan-fresh', bytes: 10, atMs: NOW - 1 * DAY, refs: 0 },
    { id: 'orphan-old', bytes: 20, atMs: NOW - 30 * DAY, refs: 0 },
    { id: 'orphan-exempt', bytes: 30, atMs: NOW - 30 * DAY, refs: 0, markers: ['legal-hold'] },
    { id: 'referenced', bytes: 40, atMs: NOW - 30 * DAY, refs: 2 },
  ])
  const r = mk({ 'vmu.gc.graceDays': 7, 'vmu.gc.exemptMarkers': ['legal-hold'] }, lib)
  const g1 = await r.gc()
  ok(g1.skippedGrace === 1, 'gc skips an orphan inside the grace window (counted)')
  ok(g1.skippedExempt === 1, 'gc skips an exempt-marked orphan (counted)')
  ok(g1.candidates.length === 1 && g1.candidates[0].id === 'orphan-old', 'only the graced-out orphan is a candidate')
  const refused = await throws(() => r.gc({ dryRun: false }))
  ok(refused.threw && refused.code === 'VMU_GC_REFUSED' && !!refused.hint, 'gc refuses to act without autoRun or confirm (named)')
  const g2 = await r.gc({ dryRun: false, confirm: true })
  ok(g2.applied === true && g2.removed.length === 1 && lib.st.objects.every((o) => o.id !== 'orphan-old'), 'confirmed gc removes exactly the candidate')
  ok(lib.st.objects.some((o) => o.id === 'orphan-exempt') && lib.st.objects.some((o) => o.id === 'referenced'), 'exempt and referenced objects survive gc')
}

// 6) QUOTA three states: warn (counted) | refuse (named, BEFORE any deletion) | degrade
{
  const seed = () => [{ id: 'big', bytes: 1000, atMs: NOW - 400 * DAY, trashed: true, trashedAtMs: NOW - 400 * DAY, refs: 3 }]
  const warnLib = mkLib(seed())
  const warn = mk({ 'vmu.quota.hardBytes': 100, 'vmu.quota.onExceed': 'warn', 'vmu.records.trash.retainDays': 30 }, warnLib)
  const overHardBefore = (await warn.quota()).overHard
  const wa = await warn.apply({ dryRun: false })
  ok(wa.applied === true && overHardBefore === true, 'warn: over-hard still applies (predictable, counted)')
  const refuseLib = mkLib(seed())
  const refuser = mk({ 'vmu.quota.hardBytes': 100, 'vmu.quota.onExceed': 'refuse', 'vmu.records.trash.retainDays': 30 }, refuseLib)
  const rq = await throws(() => refuser.apply({ dryRun: false }))
  ok(rq.threw && rq.code === 'VMU_QUOTA_EXCEEDED' && !!rq.hint, 'refuse: named refusal on the quota boundary')
  ok(refuseLib.st.log.length === 0, 'refuse happens BEFORE any deletion (never half-applied)')
  ok((await refuser.plan()).actions.length > 0, 'the read-only plan still reports what COULD be pruned')
  const degLib = mkLib(seed())
  const degrade = mk({ 'vmu.quota.hardBytes': 100, 'vmu.quota.onExceed': 'degrade', 'vmu.records.trash.retainDays': 30 }, degLib)
  const da = await degrade.apply({ dryRun: false })
  ok(da.applied === true && da.degraded === true, 'degrade: proceeds and is marked degraded')
  const soft = mk({ 'vmu.quota.softBytes': 50 }, mkLib(seed()))
  const sp = await soft.plan()
  ok(sp.overSoft === true && sp.warning === QUOTA_SOFT_WARNING, 'soft limit cross ⇒ counted warning marker')
}

// 7) COUNTED TRUNCATION: a plan bigger than the cap reports `dropped`, never silently loses actions
{
  const many = []
  for (let i = 0; i < 10; i++) many.push({ id: 'x' + i, bytes: 5, atMs: NOW - 400 * DAY, trashed: true, trashedAtMs: NOW - 400 * DAY })
  const lib = mkLib(many)
  const r = mk({ 'vmu.records.trash.retainDays': 30 }, lib, 3)
  const p = await r.plan()
  ok(p.dropped === 7 && p.warning === RETENTION_WARNING, 'plan truncation is reported with the counted marker')
  const a = await r.apply({ dryRun: false })
  ok(a.dropped === 7 && a.warning === RETENTION_WARNING && a.removed.length === 3, 'apply truncation is reported too')
  ok(r.status().stats.dropped >= 7, 'the dropped counter is kept in status (计数不静默)')
}

// 8) TRASH / RESTORE / PURGE with named refusals
{
  const lib = mkLib([{ id: 't1', bytes: 77, atMs: NOW - 10 * DAY, refs: 1 }])
  const r = mk({ 'vmu.records.trash.retainDays': 30 }, lib)
  const t = await r.trash({ id: 't1' })
  ok(t.ok === true && t.countedInQuota === true && lib.st.objects[0].trashed === true, 'trash moves the object and reports quota accounting')
  const dup = await throws(() => r.trash({ id: 't1' }))
  ok(dup.threw && dup.code === 'VMU_TRASH_EXPIRED', 'trashing twice is a named refusal')
  const u = await throws(() => r.restore({ id: 'nope' }))
  ok(u.threw && u.code === 'VMU_TRASH_EXPIRED', 'restoring an unknown id is a named refusal')
  const rs = await r.restore({ id: 't1' })
  ok(rs.ok === true && lib.st.objects[0].trashed === false, 'restore undoes the soft delete')
  const unk = await throws(() => r.trash({ id: 'ghost' }))
  ok(unk.threw && unk.code === 'VMU_NO_SUCH_OBJECT', 'trashing an unknown object is a named refusal')
  await r.trash({ id: 't1' })
  const pv = await r.purge({ olderThanMs: -1, dryRun: true })
  ok(pv.dryRun === true && pv.purged.length === 1 && lib.st.log.filter((l) => l.startsWith('remove:t1')).length === 0, 'purge dry-run previews without deleting')
  const pu = await r.purge({ olderThanMs: -1 })
  ok(pu.purged.length === 1 && pu.purged[0].reason && lib.st.objects.length === 0, 'explicit purge deletes and records the reason')
}

// 9) DETERMINISM with an injected clock (two fresh services ⇒ identical plans)
{
  const seed = () => [
    { id: 'a', bytes: 10, atMs: NOW - 400 * DAY, trashed: true, trashedAtMs: NOW - 400 * DAY },
    { id: 'b', bytes: 20, atMs: NOW - 400 * DAY, refs: 0 },
    { id: 'c', bytes: 30, atMs: NOW - 2 * DAY, refs: 0 },
  ]
  const cfg = { 'vmu.records.trash.retainDays': 30, 'vmu.gc.graceDays': 7 }
  const r1 = mk(cfg, mkLib(seed())); const r2 = mk(cfg, mkLib(seed()))
  ok(JSON.stringify(await r1.plan()) === JSON.stringify(await r2.plan()), 'plan is deterministic for the same state + clock')
  ok(JSON.stringify(await r1.gc()) === JSON.stringify(await r2.gc()), 'gc (dry-run) is deterministic too')
}

// 10) CONFIGURATION CONFLICTS are named (`VMU_RETENTION_CONFLICT`), never silently "fixed"
{
  const bad1 = await throws(() => mk({ 'vmu.quota.onExceed': 'explode' }).plan())
  ok(bad1.threw && bad1.code === 'VMU_RETENTION_CONFLICT', 'unknown onExceed is a named conflict')
  const bad2 = await throws(() => mk({ 'vmu.quota.softBytes': 100, 'vmu.quota.hardBytes': 10 }).plan())
  ok(bad2.threw && bad2.code === 'VMU_RETENTION_CONFLICT', 'soft > hard is a named conflict')
  const bad3 = await throws(() => mk({ 'vmu.gc.graceDays': -1 }).plan())
  ok(bad3.threw && bad3.code === 'VMU_RETENTION_CONFLICT', 'negative grace is a named conflict')
}

// 11) TIERING never deletes and never changes identity (07-§4.4)
{
  const lib = mkLib([{ id: 'cold', bytes: 900, atMs: NOW - 3 * DAY, refs: 5 }])
  const r = mk({ 'vmu.records.retention.tierThreshold': 500 }, lib)
  const p = await r.plan()
  ok(p.counts.tierCold === 1 && p.actions.some((a) => a.kind === 'tier-cold' && a.mutates === false), 'tiering is planned as a non-mutating action')
  await r.apply({ dryRun: false })
  ok(lib.st.objects.length === 1 && lib.st.log.length === 0, 'an apply caused by tiering deletes nothing')
}

// 12) HISTORY: with storeMode=diff the BASE revision is never pruned (07-§4.3 fallback rule)
{
  const lib = mkLib([{ id: 'h', bytes: 10, atMs: NOW - 400 * DAY, refs: 4, history: [{ rev: 1, bytes: 1 }, { rev: 2, bytes: 1 }, { rev: 3, bytes: 1 }] }])
  const r = mk({ 'vmu.records.history.depth': 1, 'vmu.records.history.storeMode': 'diff' }, lib)
  const p = await r.plan()
  ok(!p.actions.some((a) => a.rev === 1), 'the base revision is not prunable in diff mode')
  await r.apply({ dryRun: false })
  const o = lib.st.objects.find((x) => x.id === 'h')
  ok(o.history.some((x) => x.rev === 1), 'the base revision survived the apply')
  const bad = await throws(() => mk({ 'vmu.records.history.storeMode': 'magic' }).plan())
  ok(bad.threw && bad.code === 'VMU_RETENTION_CONFLICT', 'unknown storeMode is a named conflict')
}

// 13) ASYNC adapter compatibility: the real kernel/library.js surface is async ⇒ the same code must work
{
  const lib = mkAsyncLib([{ id: 'z1', bytes: 40, atMs: NOW - 400 * DAY, trashed: true, trashedAtMs: NOW - 400 * DAY, refs: 5 }])
  const r = mk({ 'vmu.records.trash.retainDays': 30 }, lib)
  const p = await r.plan()
  ok(p.removable === 1, 'an async library adapter yields the same plan')
  const a = await r.apply({ dryRun: false })
  ok(a.applied === true && a.removed.length === 1 && lib.st.objects.length === 0, 'apply works across the async seam')
  ok((await r.quota()).objects === 0, 'quota re-reads the async library')
}

// 14) the module exports the named-refusal helper and the counted marker
ok(typeof refuse === 'function' && refuse('X', 'm').code === 'X', 'refuse() builds a named error')
ok(RETENTION_WARNING === 'VMU_RETENTION_TRUNCATED', 'the counted-truncation marker is exported')

console.log('=== VMU RETENTION: ' + pass + ' passed, ' + fail + ' failed ===')
process.exit(fail ? 1 : 0)

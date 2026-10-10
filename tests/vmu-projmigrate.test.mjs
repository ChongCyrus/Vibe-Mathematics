// Independent test for vmu kernel · projmigrate (no dependency on kernel/index.js).
// Run: node tests/vmu-projmigrate.test.mjs     Last line: === VMU PROJMIGRATE: N passed, M failed ===
import { createProjectionMigrator, CODE } from '../vibe-math-vmu/kernel/projmigrate.js'

let passed = 0
let failed = 0
function ok(cond, label, detail) { if (cond) { passed += 1 } else { failed += 1; console.log('FAIL ' + label + (detail === undefined ? '' : ' [' + detail + ']')) } }
function throwsNamed(fn, code, label) {
  try { fn(); failed += 1; console.log('FAIL ' + label + ' (no refusal)'); return null }
  catch (e) { if (e && e.code === code) { passed += 1; return e } failed += 1; console.log('FAIL ' + label + ' (code=' + (e && e.code) + ' want ' + code + ')'); return null }
}
function fakeClock(start = 1000) { let t = start; return { clock: () => t, advance: (ms) => { t += ms } } }

// A realistic kernel-owned projection: the idempotency ledger projection (canonical version is 2 there).
const v1doc = () => ({ version: 1, entries: [{ id: 'k1', payload: { a: 1 } }], ledger: null })
const v2step = (doc) => Object.assign({}, doc, { version: 2, ledger: (doc.entries || []).map((e) => e.id) })

function make(over = {}) {
  const c = fakeClock()
  const t = createProjectionMigrator({ clock: c.clock, settings: over.settings || {} })
  return { t, c }
}

// ── 1. zero mechanism: unknown kind is refused by name, nothing crashes ──────────────────────
{
  const { t } = make()
  const e = throwsNamed(() => t.read({ kind: 'idempotency', doc: v1doc() }), CODE.unknown, 'zero-mechanism: reading an unregistered kind is a NAMED refusal')
  ok(!!e && /registered kinds: \(none\)/.test(String(e.hint)), 'zero-mechanism: the refusal says nothing is registered')
  const s = t.status()
  ok(s.kindCount === 0 && s.unknownVersionRefused === true && s.silentDropForbidden === true, 'zero-mechanism: status discloses the discipline and stays empty')
  throwsNamed(() => t.read({}), 'VMU_INVALID_ARGUMENT', 'zero-mechanism: read without a kind is refused')
}

// ── 2. explicit v1→v2 migration, with a RECOMPUTED checksum and an audit trail ───────────────
{
  const { t, c } = make()
  const logs = []
  const t2 = createProjectionMigrator({ clock: c.clock, log: { append: (e) => logs.push(e) } })
  t2.register({ kind: 'idempotency', version: 2, fingerprint: 'entries+ledger', migrate: [{ from: 1, to: 2, run: v2step, by: 'office', why: 'shape v2 adds the dedup ledger projection' }] })
  const before = v1doc()
  const snapshot = JSON.stringify(before)
  const r = t2.read({ kind: 'idempotency', doc: before })
  ok(r.ok === true && r.migrated === true && r.from === 1 && r.to === 2, 'migration: v1 → v2 succeeds explicitly', JSON.stringify({ from: r.from, to: r.to }))
  ok(r.doc.version === 2 && Array.isArray(r.doc.ledger) && r.doc.ledger.join(',') === 'k1', 'migration: the step ran and produced the v2 shape', JSON.stringify(r.doc))
  ok(r.checksumChanged === true && typeof r.checksum === 'string' && r.checksum !== r.previousChecksum, 'migration: the checksum is RECOMPUTED (and differs from the old one, as expected)')
  ok(r.steps.length === 1 && r.steps[0].from === 1 && r.steps[0].to === 2 && r.steps[0].by === 'office' && /shape v2/.test(r.steps[0].why) && r.steps[0].at === 1000, 'migration: every step records from→to + who/when(clock)/why', JSON.stringify(r.steps))
  ok(JSON.stringify(before) === snapshot, 'migration: the input document is untouched (byte-identical)')
  ok(logs.some((l) => l.type === 'projmigrate/migrated' && l.from === 1 && l.to === 2), 'migration: the migration is logged')
  const e = throwsNamed(() => t2.register({ kind: 'idempotency', version: 2 }), CODE.unknown, 'migration: registering the same kind twice is refused')
  ok(!!e, 'migration: duplicate registration never silently overrides')
}

// ── 3. idempotent noop at the target version ────────────────────────────────────────────────
{
  const { t } = make()
  t.register({ kind: 'audit-ring', version: 2, migrate: [{ from: 1, to: 2, run: (d) => Object.assign({}, d, { version: 2 }), by: 'office', why: 'shape v2' }] })
  const doc = { version: 2, ring: [] }
  const r = t.read({ kind: 'audit-ring', doc })
  ok(r.ok === true && r.noop === true && r.version === 2, 'idempotent: an already-current document is a noop')
  ok(r.doc === doc && /nothing was rewritten/.test(String(r.note)), 'idempotent: noop returns the same object and says nothing was rewritten')
  const again = t.read({ kind: 'audit-ring', doc: r.doc })
  ok(again.noop === true, 'idempotent: repeated reads stay noops (deterministic)')
}

// ── 4. unknown version is refused, never treated as current ─────────────────────────────────
{
  const { t } = make()
  t.register({ kind: 'idempotency', version: 2, migrate: [{ from: 1, to: 2, run: v2step, by: 'office', why: 'v2' }] })
  const e1 = throwsNamed(() => t.read({ kind: 'idempotency', doc: { version: 7, entries: [] } }), CODE.noPath, 'unknown version: v7 has no path and is refused by name')
  ok(!!e1 && /7→2|v7|no migration path/.test(String(e1.message)), 'unknown version: the refusal names the attempted hop', e1 && e1.message)
  const e2 = throwsNamed(() => t.read({ kind: 'idempotency', doc: { entries: [] } }), CODE.unknown, 'unknown version: a document with no version field is refused')
  ok(!!e2 && /never assumed/.test(String(e2.hint)), 'unknown version: the hint says the version is never assumed to be current')
  const e3 = throwsNamed(() => t.read({ kind: 'idempotency', doc: { version: 'two', entries: [] } }), CODE.unknown, 'unknown version: a non-numeric version is refused')
  ok(!!e3, 'unknown version: non-numeric versions never get coerced')
}

// ── 5. no migration path ⇒ named refusal that names the hop (the current failure mode) ───────
{
  const { t } = make()
  t.register({ kind: 'idempotency', version: 3, migrate: [{ from: 2, to: 3, run: (d) => Object.assign({}, d, { version: 3 }), by: 'office', why: 'v3' }] })
  const e = throwsNamed(() => t.read({ kind: 'idempotency', doc: { version: 1, entries: [] } }), CODE.noPath, 'no path: v1 → v3 (v1→v2 was never registered) is refused')
  ok(!!e && /1→3/.test(String(e.message)) && /no path/.test(String(e.message)), 'no path: the refusal NAMES "v1→v3 has no path"', e && e.message)
  ok(!!e && /NOT dropped and NOT treated as 3/.test(String(e.hint)), 'no path: the hint promises the document is not dropped and not treated as current')
  const st = t.status()
  ok(st.silentDropForbidden === true, 'no path: status discloses that silent dropping is forbidden')
}

// ── 6. a failing step leaves the original document byte-identical ───────────────────────────
{
  const { t } = make()
  t.register({ kind: 'idempotency', version: 2, migrate: [{ from: 1, to: 2, run: () => { throw new Error('bad step') }, by: 'office', why: 'v2' }] })
  const doc = v1doc()
  const snapshot = JSON.stringify(doc)
  const e = throwsNamed(() => t.read({ kind: 'idempotency', doc }), CODE.stepFailed, 'failure: a throwing step is refused as VMU_MIGRATE_DRYRUN_FAILED')
  ok(!!e && /1→2/.test(String(e.message)) && /bad step/.test(String(e.message)), 'failure: the refusal names the failing step and the cause', e && e.message)
  ok(JSON.stringify(doc) === snapshot, 'failure: the original document is byte-identical (no half-migrated state)')
  ok(/unchanged|byte-identical/.test(String(e.hint)), 'failure: the hint states the document is unchanged')
}

// ── 7. step cap ⇒ refusal with current/limit; self-cycle ⇒ named cycle refusal ───────────────
{
  const { t } = make({ settings: { 'vmu.projection.maxMigrationSteps': 2 } })
  const steps = [1, 2, 3, 4].map((i) => ({ from: i, to: i + 1, run: (d) => Object.assign({}, d, { version: i + 1 }), by: 'office', why: 'step ' + i }))
  t.register({ kind: 'long', version: 5, migrate: steps })
  const e = throwsNamed(() => t.read({ kind: 'long', doc: { version: 1 } }), CODE.budget, 'cap: exceeding maxMigrationSteps is refused')
  ok(!!e && /2\/2/.test(String(e.message)), 'cap: the refusal reports current/limit (2/2)', e && e.message)
  const cyc = make()
  cyc.t.register({ kind: 'ring', version: 2, migrate: [{ from: 1, to: 1, run: (d) => d, by: 'office', why: 'loop' }, { from: 2, to: 2, run: (d) => d, by: 'office', why: 'loop' }] })
  const e2 = throwsNamed(() => cyc.t.read({ kind: 'ring', doc: { version: 1 } }), CODE.noPath, 'cycle: a self-referencing step is refused (cycle detected)')
  ok(!!e2 && /cycle/.test(String(e2.message)), 'cycle: the refusal names the cycle explicitly', e2 && e2.message)
}

// ── 8. explicit target + downgrade policy ──────────────────────────────────────────────────
{
  const { t } = make()
  t.register({ kind: 'idempotency', version: 3, migrate: [
    { from: 1, to: 2, run: (d) => Object.assign({}, d, { version: 2 }), by: 'office', why: 'v2' },
    { from: 2, to: 3, run: (d) => Object.assign({}, d, { version: 3, extra: true }), by: 'office', why: 'v3' },
  ] })
  const r = t.upgrade({ kind: 'idempotency', doc: { version: 1, entries: [] }, to: 2 })
  ok(r.ok === true && r.to === 2 && r.doc.version === 2 && r.steps.length === 1, 'upgrade: an explicit target stops at v2 (not at the current v3)', JSON.stringify({ to: r.to, steps: r.steps.length }))
  const e = throwsNamed(() => t.upgrade({ kind: 'idempotency', doc: { version: 3 }, to: 1 }), CODE.downgrade, 'upgrade: a downgrade is refused by name')
  ok(!!e && /allowDowngrade/.test(String(e.hint)), 'upgrade: the refusal explains how to force it')
  const forced = t.upgrade({ kind: 'idempotency', doc: { version: 2 }, to: 3 })
  ok(forced.ok === true && forced.doc.version === 3, 'upgrade: forward migration still works after the downgrade attempt')
  throwsNamed(() => t.upgrade({ kind: 'idempotency', doc: { version: 2 }, to: 'nope' }), CODE.unknown, 'upgrade: a non-integer target is refused')
}

// ── 9. registration hygiene: steps need run() and why, one successor per from ───────────────
{
  const { t } = make()
  throwsNamed(() => t.register({ kind: 'a', version: 2, migrate: [{ from: 1, to: 2, why: 'x' }] }), 'VMU_INVALID_ARGUMENT', 'hygiene: a step without run() is refused')
  throwsNamed(() => t.register({ kind: 'b', version: 2, migrate: [{ from: 1, to: 2, run: (d) => d }] }), 'VMU_INVALID_ARGUMENT', 'hygiene: a step without `why` is refused (an unexplained rewrite is indistinguishable from corruption)')
  throwsNamed(() => t.register({ kind: 'c', version: 2, migrate: [{ from: 1, to: 2, run: (d) => d, why: 'x' }, { from: 1, to: 2, run: (d) => d, why: 'y' }] }), CODE.unknown, 'hygiene: two successors from the same version are refused')
  ok(t.status().migrationsAreExplicit === true && t.status().failedMigrationLeavesOriginalUntouched === true, 'hygiene: status discloses the disciplines')
}

// ── 10. read-only surfaces do not mutate ───────────────────────────────────────────────────
{
  const { t } = make()
  t.register({ kind: 'idempotency', version: 2, migrate: [{ from: 1, to: 2, run: v2step, by: 'office', why: 'v2' }] })
  t.status(); t.status()
  t.read({ kind: 'idempotency', doc: v1doc() })   // a migration legitimately grows the history
  const s1 = JSON.stringify(t.status())
  t.status(); t.status()
  ok(JSON.stringify(t.status()) === s1, 'read-only: status() is unchanged by reads and by migrations')
  const doc = v1doc(); t.read({ kind: 'idempotency', doc })
  ok(JSON.stringify(doc) === JSON.stringify(v1doc()), 'read-only: a migration never mutates the caller\'s document')
  ok(t.status().readsArePure === true, 'read-only: status states that reads are pure')
}

// ── 11. determinism (injected clock only) ──────────────────────────────────────────────────
{
  const mk = () => { const c = fakeClock(500); const t = createProjectionMigrator({ clock: c.clock }); t.register({ kind: 'idempotency', version: 2, migrate: [{ from: 1, to: 2, run: v2step, by: 'office', why: 'v2' }] }); return { t, c } }
  const a = mk(); const b = mk()
  const ra = a.t.read({ kind: 'idempotency', doc: v1doc() })
  const rb = b.t.read({ kind: 'idempotency', doc: v1doc() })
  ok(ra.checksum === rb.checksum && JSON.stringify(ra.doc) === JSON.stringify(rb.doc), 'determinism: two instances produce the identical migrated document and checksum')
  ok(JSON.stringify(a.t.status()) === JSON.stringify(b.t.status()), 'determinism: status() agrees across instances')
  ok(ra.steps[0].at === 500 && rb.steps[0].at === 500, 'determinism: step timestamps come from the injected clock')
}

console.log('=== VMU PROJMIGRATE: ' + passed + ' passed, ' + failed + ' failed ===')
if (failed > 0) process.exit(1)

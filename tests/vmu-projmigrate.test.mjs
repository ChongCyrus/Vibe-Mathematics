// Independent test for vmu kernel · projmigrate (no dependency on kernel/index.js).
// Run: node tests/vmu-projmigrate.test.mjs     Last line: === VMU PROJMIGRATE: N passed, M failed ===
import { createProjectionMigrator, CODE } from '../vibe-math-vmu/kernel/projmigrate.js'
import { createIdempotency, CANONICAL_VERSION, checksumOf } from '../vibe-math-vmu/kernel/idempotency.js'
import { createAuditChain } from '../vibe-math-vmu/kernel/auditchain.js'
import { createHash } from 'node:crypto'

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

// ── 12. A3 (task-141): the IDEMPOTENCY LEDGER actually walks the migrator ─────────────────────
// Round 11: the ledger hard-rejected a v1 projection ("version 1 … NOT loaded"), so a version bump cost
// cross-restart idempotency while projmigrate.js sat unused. Now a `migrate` seam is honoured explicitly.
const mkStore = (initial = null) => {
  let doc = initial
  // kernel/store.js contract: patch(key, current => next) — the store EVALUATES the function and stores
  // its return value (returning undefined leaves the value untouched).
  return {
    read: () => doc,
    patch: (key, fn) => { const next = typeof fn === 'function' ? fn(doc) : fn; if (next !== undefined) doc = next; return { ok: true, key, changed: next !== undefined } },
    peek: () => doc,
  }
}
const v1Projection = (entries) => ({ version: 1, entries, checksum: 'v1-checksum-does-not-cover-the-v2-shape', savedAt: 111 })
{
  const migrator = createProjectionMigrator({ clock: () => 5000 })
  const store = mkStore(v1Projection([{ key: 'k1', scope: 's', state: 'committed', payloadFingerprint: 'fp1', attempts: 1, startedAt: 10, committedAt: 20, result: { ok: true } }]))
  const ledger = createIdempotency({ clock: () => 5000, store, migrate: migrator })
  const hit = ledger.lookup({ key: 'k1', scope: 's' })
  ok(hit && hit.found === true && hit.state === 'committed', 'A3[+]: the v1 projection is READ BACK through an explicit migration (cross-restart idempotency survives a version bump)', JSON.stringify(hit))
  const st = ledger.status()
  ok(st.migratedFrom === 1 && st.migrationsApplied === 1, 'A3[+]: status().migratedFrom discloses the migration', JSON.stringify({ from: st.migratedFrom, applied: st.migrationsApplied }))
  ok(st.migrateSeam === true && st.migrateSeamKind === 'projmigrate', 'A3[+]: the migrate seam is disclosed in status()')
  ok(st.lastMigration && st.lastMigration.checksumChanged === true && typeof st.lastMigration.checksum === 'string', 'A3[+]: the checksum was really RECOMPUTED (checksumChanged:true)', JSON.stringify(st.lastMigration))
  ok(st.canonicalVersion === CANONICAL_VERSION && st.lastMigration.to === CANONICAL_VERSION, 'A3[]: the migration targets the canonical version')
  ledger.persist()
  ok(ledger.status().durable === true, 'A3[+]: after the migration + a verified write the ledger is durable again (was permanently degraded)', JSON.stringify({ durable: ledger.status().durable, reason: ledger.status().durableReason }))
  ok(store.peek().version === CANONICAL_VERSION, 'A3[+]: the write-back persists the CURRENT version (store patch(key, fn) contract)')
  let readRefused = false
  try { ledger.lookup({ key: 'k1' }) } catch (e) { readRefused = true }
  ok(readRefused === false, 'A3[]: reading a migrated projection does not refuse')
}
// ── 13. A3: WITHOUT a seam the refusal stays (named, no silent drop) ──────────────────────────
{
  const store = mkStore(v1Projection([{ key: 'k1', scope: 's', state: 'committed', attempts: 1, startedAt: 10 }]))
  const ledger = createIdempotency({ clock: () => 5000, store })
  const r = ledger.lookup({ key: 'k1', scope: 's' })
  const st = ledger.status()
  ok(r.found === false, 'A3[-]: without a migrate seam a v1 projection is NOT loaded (the refusal stays)', JSON.stringify(r))
  ok(st.migratedFrom === null && st.migrationsApplied === 0 && st.migrateSeam === false, 'A3[-]: no migration is claimed (no silent success)')
  ok(/version 1/.test(st.durableReason) && /NOT loaded/.test(st.durableReason) && /migrate/.test(st.durableReason), 'A3[-]: the reason NAMES the version and the missing migrate seam', st.durableReason)
  ok(st.durable === false && st.durableDegraded === true, 'A3[-]: the ledger stays degraded')
  ok(st.migrationError && st.migrationError.noPath === true && st.migrationError.code === 'VMU_NOT_FOUND', 'A3[-]: the no-path case is recorded WITH its code', JSON.stringify(st.migrationError))
  ok(store.peek().version === 1, 'A3[-]: the original document is left untouched')
}
// ── 14. A3: a FAILING migration loads nothing and stays degraded ──────────────────────────────
{
  const failing = { read: () => { const e = new Error('step blew up'); e.code = 'VMU_MIGRATE_DRYRUN_FAILED'; throw e } }
  const store = mkStore(v1Projection([{ key: 'k1', scope: 's', state: 'committed', attempts: 1, startedAt: 10 }]))
  const ledger = createIdempotency({ clock: () => 5000, store, migrate: failing })
  const r = ledger.lookup({ key: 'k1', scope: 's' })
  const st = ledger.status()
  ok(r.found === false, 'A3[-]: a FAILED migration loads nothing (no half-migrated ledger)')
  ok(st.durable === false && st.durableDegraded === true && st.migrationError.noPath !== true, 'A3[-]: degraded after a failure, and not confused with "no path"')
  ok(/FAILED/.test(st.migrationError.reason) && st.migrationError.code === 'VMU_MIGRATE_DRYRUN_FAILED', 'A3[-]: the failure is named with its code', JSON.stringify(st.migrationError))
  ok(store.peek().version === 1, 'A3[-]: a failed migration leaves the stored document untouched')
  const fn = ({ doc }) => ({ ok: true, from: doc.version, doc: Object.assign({}, doc, { version: CANONICAL_VERSION, checksum: checksumOf(doc.entries), migratedFrom: doc.version }), steps: 1, checksumChanged: true })
  const store2 = mkStore(v1Projection([{ key: 'k2', scope: 's', state: 'pending', attempts: 2, startedAt: 10 }]))
  const led2 = createIdempotency({ clock: () => 5000, store: store2, migrate: fn })
  ok(led2.lookup({ key: 'k2', scope: 's' }).found === true && led2.status().migrateSeamKind === 'function', 'A3[+]: a plain FUNCTION migrate seam works too')
  const store3 = mkStore({ version: CANONICAL_VERSION, seq: 0, writerId: null, savedAt: 1, checksum: checksumOf([]), entries: [] })
  const led3 = createIdempotency({ clock: () => 5000, store: store3, migrate: fn })
  led3.lookup({ key: 'zz', scope: 's' })
  ok(led3.status().migrationsApplied === 0 && led3.status().migratedFrom === null, 'A3[+]: an already-current projection is a NOOP (no migration claimed)')
}

// ── 15. audit chain (task-141): macKey ⇒ per-row HMAC, a rewrite is refused ───────────────────
const sha256 = (s) => createHash('sha256').update(s).digest('hex')
{
  const KEY = 'unit-test-secret-material-9f2c'
  const a = createAuditChain({ clock: () => 1000, macKey: KEY })
  const r1 = a.append({ row: { seq: 1, what: 'middleware/registered', at: 1000, payload: { a: 1 } } })
  const r2 = a.append({ row: { seq: 2, what: 'middleware/decision', at: 1001, payload: { b: 2 } }, prevHash: r1.hash })
  ok(String(r1.hash).startsWith('hmac:') && String(r2.hash).startsWith('hmac:'), 'macKey[+]: every row digest is an HMAC, not a bare sha256', JSON.stringify([String(r1.hash).slice(0, 14)]))
  const good = a.verifyChain({ rows: [r1, r2] })
  ok(good.ok === true && good.keyed === true && good.verified === 2, 'macKey[+]: the keyed chain verifies and reports keyed:true', JSON.stringify({ ok: good.ok, keyed: good.keyed }))
  ok(/keyed:true/.test(good.note), 'macKey[+]: the receipt says the chain is keyed')
  const bad = a.verifyChain({ rows: [{ ...r1, payload: { a: 999 } }, { ...r2, payload: { b: 999 } }] })
  ok(bad.ok === false && bad.reason === 'row-modified', 'macKey[+]: a REWRITTEN chain is refused (row-modified)', JSON.stringify({ reason: bad.reason, index: bad.index }))
  ok(bad.keyed === true, 'macKey[]: the FAILURE receipt also discloses keyed:true (a rejection must not hide the strength)')
  const gap = a.verifyChain({ rows: [r1, { ...r2, seq: 9 }] })
  ok(gap.ok === false && gap.keyed === true, 'macKey[]: the seq-gap failure receipt carries keyed as well', JSON.stringify({ reason: gap.reason, keyed: gap.keyed }))
  ok(a.verifyChain({ rows: [{ ...r1, payload: { a: 999 } }, r2] }).ok === false, 'macKey[+]: rewriting only the head is still refused')
  const other = createAuditChain({ clock: () => 1000, macKey: 'a-different-secret' })
  const o1 = other.append({ row: { seq: 1, what: 'middleware/registered', at: 1000, payload: { a: 1 } } })
  ok(String(o1.hash) !== String(r1.hash), 'macKey[+]: a different key yields a different digest (the key is really used)')
  ok(a.verifyChain({ rows: [o1] }).ok === false, 'macKey[+]: a chain built with another key is refused')
  // the checkpoint MAC uses the same key ⇒ a tampered anchor is caught
  let stored = null
  const withAnchor = createAuditChain({ clock: () => 1000, macKey: KEY, anchor: { name: 'file', write: (cp) => { stored = { ...cp }; return true }, read: () => stored } })
  const c1 = withAnchor.append({ row: { seq: 1, what: 'x', at: 1 } })
  const cp = withAnchor.checkpoint({ rows: [c1], persist: true })
  ok(typeof cp.mac === 'string' && cp.mac.length > 0 && cp.keyed === true, 'macKey[+]: the checkpoint carries a MAC and says keyed:true')
  stored = { ...stored, hash: 'tampered-head' }
  let anchorErr = null
  try { withAnchor.verifyChain({ rows: [c1], useAnchor: true }) } catch (e) { anchorErr = e }
  ok(anchorErr && /ANCHOR_TAMPERED|TRUNCATED/.test(String(anchorErr.code)), 'macKey[+]: a tampered anchor is refused by name', anchorErr && anchorErr.code)
}
// ── 16. audit chain: no key ⇒ keyed:false and a plain "anyone can recompute it" ───────────────
{
  const unkeyed = createAuditChain({ clock: () => 1000, hash: sha256 })
  const r = unkeyed.append({ row: { seq: 1, what: 'x', at: 1 } })
  const v = unkeyed.verifyChain({ rows: [r] })
  const st = unkeyed.status()
  ok(v.ok === true && v.keyed === false, 'no-key[-]: the chain still verifies but reports keyed:false')
  ok(/keyed:false/.test(v.note) && /recompute it/.test(v.note), 'no-key[-]: the receipt warns that an attacker can recompute the chain', v.note)
  ok(st.keyed === false && st.mac.configured === false && st.tamperProof === false, 'no-key[-]: status() says unkeyed and tamperProof:false')
  ok(/UNKEYED/.test(st.keyedNote) && /recompute/.test(st.keyedNote), 'no-key[-]: status().keyedNote spells out the limitation')
  ok(String(st.strength).startsWith('plain sha256'), 'no-key[-]: the strength line says plain sha256')
  const none = createAuditChain({ clock: () => 1000 })
  ok(throwsNamed(() => none.append({ row: { seq: 1 } }), 'VMU_AUDIT_CHAIN_NO_HASHER', 'no-key[-]: with no seam at all appends still refuse by name') !== null, 'no-key[-]: no fake hash is ever produced')
  ok(none.status().mac.configured === false && none.status().chainable === false, 'no-key[-]: status() says nothing is wired')
}
// ── 17. the key material never leaks (status / receipts / logs / bus) ─────────────────────────
{
  const KEY = 'leak-canary-3f9a2b7c-should-never-appear'
  const logRows = []
  const chain = createAuditChain({ clock: () => 1000, macKey: KEY, log: (e) => logRows.push(JSON.stringify(e)), bus: { emit: (t, p) => logRows.push(JSON.stringify({ t, p })) } })
  const r1 = chain.append({ row: { seq: 1, what: 'x', at: 1 } })
  const cp = chain.checkpoint({ rows: [r1], persist: false })
  const st = chain.status()
  ok(!JSON.stringify({ st, cp, r1, logRows }).includes(KEY), 'secrecy[+]: the key material appears NOWHERE in status()/receipts/logs')
  ok(st.mac.materialExposed === false && typeof st.mac.fingerprint === 'string' && st.mac.fingerprint.startsWith('sha256:'), 'secrecy[+]: status().mac exposes a FINGERPRINT and materialExposed:false', JSON.stringify(st.mac))
  ok(st.mac.algorithm === 'HMAC-SHA256' && st.mac.bytes === KEY.length, 'secrecy[+]: the algorithm and key LENGTH are disclosed (length is not material)')
  const refChain = createAuditChain({ clock: () => 1000, macKey: { ref: 'vmu.audit.macKey' }, secrets: { get: (k) => (k === 'vmu.audit.macKey' ? KEY : undefined) } })
  const rr = refChain.append({ row: { seq: 1, what: 'x', at: 1 } })
  const rst = refChain.status()
  ok(rr.hash === r1.hash, 'secrecy[+]: a secret REFERENCE resolves to the same key ⇒ the same digest')
  ok(rst.mac.ref === 'vmu.audit.macKey' && rst.mac.kind === 'secret-ref' && !JSON.stringify(rst).includes(KEY), 'secrecy[+]: the reference is disclosed but the material is not')
  const missing = createAuditChain({ clock: () => 1000, macKey: { ref: 'nope' }, secrets: { get: () => undefined }, hash: () => 'sha256-fallback' })
  ok(throwsNamed(() => missing.append({ row: { seq: 1, what: 'x', at: 1 } }), 'VMU_CRYPTO_KEY_UNKNOWN', 'secrecy[-]: an unresolvable macKey REFUSES by name (no silent sha256 fallback)') !== null, 'secrecy[-]: the fallback hash seam is NOT used')
  const mst = missing.status()
  ok(mst.mac.resolved === false && mst.mac.error && mst.mac.error.code === 'VMU_CRYPTO_KEY_UNKNOWN' && mst.keyed === false, 'secrecy[-]: status() reports the unusable key instead of pretending to be keyed')
  ok(throwsNamed(() => createAuditChain({ clock: () => 1000, macKey: { ref: 'x' } }).append({ row: { seq: 1, what: 'x', at: 1 } }), 'VMU_CRYPTO_UNAVAILABLE', 'secrecy[-]: a reference without a secrets seam is refused by name') !== null, 'secrecy[-]: the missing seam is named')
  ok(throwsNamed(() => createAuditChain({ clock: () => 1000, macKey: 42, hash: () => 'h' }).append({ row: { seq: 1, what: 'x', at: 1 } }), 'VMU_CRYPTO_KEY_UNKNOWN', 'secrecy[-]: a malformed macKey refuses by name') !== null, 'secrecy[-]: no fake key')
  let emptyOk = true
  try { createAuditChain({ clock: () => 1000, macKey: '', hash: () => 'h' }).append({ row: { seq: 1, what: 'x', at: 1 } }) } catch (e) { emptyOk = false }
  ok(emptyOk, 'secrecy[]: an EMPTY string macKey counts as "not configured" (falls back to the hash seam)')
}
// ── 18. no regression for the existing (unkeyed) callers ──────────────────────────────────────
{
  const c = createAuditChain({ clock: () => 1000, hash: sha256 })
  const r1 = c.append({ row: { seq: 1, what: 'a', at: 1 } })
  const r2 = c.append({ row: { seq: 2, what: 'b', at: 2 }, prevHash: r1.hash })
  ok(c.verifyChain({ rows: [r1, r2] }).ok === true, 'regression[+]: a plain sha256 chain still verifies')
  ok(c.verifyChain({ rows: [r1, { ...r2, what: 'tampered' }] }).ok === false, 'regression[+]: tampering is still localised in an unkeyed chain')
  ok(c.verifyChain({ rows: [r1, { ...r2, what: 'tampered' }] }).keyed === false,
    'no-key[-]: an unkeyed FAILURE receipt says keyed:false (the limitation is disclosed even when verification fails)')
  ok(c.verifyChain({ rows: [r1, r2], from: 1 }).partial === true, 'regression[+]: partial verification still reports partial:true')
  ok(c.status().hasher === 'hash' && c.status().mac.source === null, 'regression[+]: status() still reports the plain hash seam')
}

console.log('=== VMU PROJMIGRATE: ' + passed + ' passed, ' + failed + ' failed ===')
if (failed > 0) process.exit(1)

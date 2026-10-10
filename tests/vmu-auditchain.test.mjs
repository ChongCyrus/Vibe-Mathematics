// tests/vmu-auditchain.test.mjs — kernel/auditchain.js (N1).
// Scenarios: no hash seam ⇒ named refusal and NO fabricated hash; edit / delete / reorder / insert each
// localised to a concrete row index + reason; empty vs single-row semantics explicit; partial verification
// reports verified vs unverified honestly; determinism; read-only surfaces.
import { createAuditChain, GENESIS, CHAIN_FAILURES } from '../vibe-math-vmu/kernel/auditchain.js'
import { createHash } from 'node:crypto'

let pass = 0, fail = 0
const ok = (cond, label) => { if (cond) { pass++ } else { fail++; console.log('FAIL ' + label) } }
const rejects = (fn) => { try { fn(); return { threw: false } } catch (e) { return { threw: true, code: e && e.code, msg: String(e && e.message), hint: e && e.hint, op: e && e.op, differing: e && e.differing, mirror: e && e.mirror, primary: e && e.primary, reason: e && e.reason } } }

let now = 1000
const hasher = (pre) => createHash('sha256').update(pre).digest('hex')
const mk = (settings = {}, opts = {}) => createAuditChain({ clock: () => now, settings, hash: hasher, ...opts })

/** Build a chain of n rows (append-only, each linking to the previous). */
const build = (n) => {
  const c = mk()
  const rows = []
  let prev = null
  for (let i = 0; i < n; i++) {
    const row = c.append({ row: { seq: i, what: 'update', at: 1000 + i, payload: { i } }, prevHash: prev })
    rows.push(row)
    prev = row.hash
  }
  return { c, rows }
}

// 1) no hash seam ⇒ append/verify refuse by name; nothing that LOOKS like a hash is produced
{
  const c = createAuditChain({ clock: () => now })
  const a = rejects(() => c.append({ row: { seq: 0, what: 'update', at: 1 } }))
  ok(a.threw && a.code === 'VMU_AUDIT_CHAIN_NO_HASHER' && !!a.hint, 'no hash ⇒ append refused with hint')
  const v = rejects(() => c.verifyChain({ rows: [{ seq: 0, what: 'update', at: 1 }] }))
  ok(v.threw && v.code === 'VMU_AUDIT_CHAIN_NO_HASHER', 'no hash ⇒ verify refused (no false verification)')
  ok(c.status().chainable === false && c.status().hasher === 'none' && /refuse by name/.test(String(c.status().note)), 'status says the chain is not buildable')
}

// 2) empty vs single-row semantics are explicit
{
  const c = mk()
  const empty = c.verifyChain({ rows: [] })
  ok(empty.ok === true && empty.empty === true && empty.verified === 0 && /NOT a claim/.test(String(empty.note)), 'empty chain: explicit, not a vacuous success')
  const one = c.append({ row: { seq: 0, what: 'create', at: 1000, payload: { a: 1 } } })
  ok(one.prevHash === GENESIS && typeof one.hash === 'string' && one.hash.length === 64, 'first row uses the explicit GENESIS prevHash')
  const v1 = c.verifyChain({ rows: [one] })
  ok(v1.ok === true && v1.verified === 1 && v1.unverified === 0, 'single-row chain verifies fully')
}

// 3) a healthy chain verifies fully (and says so)
{
  const { c, rows } = build(5)
  const v = c.verifyChain({ rows })
  ok(v.ok === true && v.verified === 5 && v.unverified === 0 && v.partial === false, 'full chain verified, nothing unverified')
  ok(/full chain verified/.test(String(v.note)) && v.truncated === false, 'full verification says full')
  ok(rows[1].prevHash === rows[0].hash, 'rows really link to each other')
}

// 4) MODIFY one row ⇒ localised to that row index
{
  const { c, rows } = build(5)
  const tampered = rows.map((r) => ({ ...r }))
  tampered[2] = { ...tampered[2], what: 'delete' }              // payload changed, hash left behind
  const v = c.verifyChain({ rows: tampered })
  ok(v.ok === false && v.index === 2 && v.reason === 'row-modified', 'edit localised to row 2 (row-modified)')
  ok(typeof v.expected === 'string' && typeof v.actual === 'string' && v.verified === 2 && v.unverified === 3, 'reports expected/actual and how much was verified')
}

// 5) DELETE one row ⇒ localised (seq gap and/or hash break)
{
  const { c, rows } = build(5)
  const removed = rows.filter((_, i) => i !== 2).map((r) => ({ ...r }))
  const v = c.verifyChain({ rows: removed })
  ok(v.ok === false && (v.reason === 'row-removed' || v.reason === 'row-modified') && v.index === 2, 'deletion localised at index 2 (' + v.reason + ')')
}

// 6) REORDER two rows ⇒ localised
{
  const { c, rows } = build(5)
  const swapped = rows.map((r) => ({ ...r }))
  const t = swapped[1]; swapped[1] = swapped[2]; swapped[2] = t
  const v = c.verifyChain({ rows: swapped })
  ok(v.ok === false && v.index >= 1 && ['rows-reordered', 'row-modified'].includes(v.reason), 'reorder localised (' + v.reason + ' at ' + v.index + ')')
}

// 7) INSERT a row (even one with a plausible seq) ⇒ localised
{
  const { c, rows } = build(5)
  const forged = c.append({ row: { seq: 99, what: 'update', at: 9999, payload: { forged: true } }, prevHash: GENESIS })
  const inserted = rows.map((r) => ({ ...r }))
  inserted.splice(2, 0, forged)
  const v = c.verifyChain({ rows: inserted })
  ok(v.ok === false && v.index === 2 && ['row-inserted', 'row-modified', 'seq-gap'].includes(v.reason), 'insertion localised at index 2 (' + v.reason + ')')
}

// 8) a self-consistent forgery is still caught when the previous link is wrong
{
  // The forger rebuilds a fake row AND its hash, but cannot know the previous hash's preimage chain.
  const c = mk()
  const r0 = c.append({ row: { seq: 0, what: 'create', at: 1000 } })
  const fake = c.append({ row: { seq: 1, what: 'update', at: 1001, payload: { forged: true } }, prevHash: 'F'.repeat(64) })
  const v = c.verifyChain({ rows: [r0, fake] })
  ok(v.ok === false && v.index === 1 && v.reason === 'row-modified', 'wrong prevHash is caught even with a self-consistent row hash')
}

// 9) partial verification is reported honestly (never "whole chain verified")
{
  const { c, rows } = build(10)
  const v = c.verifyChain({ rows, limit: 3 })
  ok(v.ok === true && v.verified === 3 && v.unverified === 7 && v.partial === true, 'partial verify counts verified vs unverified')
  ok(/PARTIAL/.test(String(v.note)) && /were NOT verified/.test(String(v.note)), 'partial note says NOT verified')
  ok(v.truncated === true && v.truncatedCode === 'VMU_AUDIT_CHAIN_TRUNCATED', 'partial verification is flagged with its code')
  const full = c.verifyChain({ rows, limit: 0 })
  ok(full.verified === 10 && full.partial === false, 'limit 0 means the whole chain')
}

// 10) link() is a read-only expected-chain projection; reads never mutate
{
  const { c, rows } = build(3)
  const l = c.link({ rows })
  ok(l.length === 3 && l[0].expectedPrev === GENESIS && l.every((x) => x.ok === true), 'link() shows the expected chain with ok=true for a healthy chain')
  const broken = c.link({ rows: [{ ...rows[0] }, { ...rows[1], what: 'tampered' }] })
  ok(broken.some((x) => x.ok === false), 'link() flags the tampered row')
  const before = JSON.stringify({ s: c.status(), l: c.link({ rows }) })
  c.status(); c.link({ rows }); c.verifyChain({ rows })
  ok(JSON.stringify({ s: c.status(), l: c.link({ rows }) }) === before, 'read-only surfaces do not mutate')
}

// 11) no mutation entry points are exported (append-only)
{
  const c = mk()
  const names = Object.keys(c)
  ok(!names.includes('update') && !names.includes('remove') && !names.includes('delete') && !names.includes('rewrite') && !names.includes('splice'), 'no rewrite/delete entry point exists')
  ok(typeof c.append === 'function' && typeof c.verifyChain === 'function' && typeof c.link === 'function' && typeof c.status === 'function', 'public surface is exactly the append-only set')
  ok(CHAIN_FAILURES.includes('row-modified') && CHAIN_FAILURES.includes('rows-reordered'), 'failure reasons are declared')
}

// 12) determinism: same rows ⇒ same hashes and same verdicts
{
  const a = build(4); const b = build(4)
  ok(JSON.stringify(a.rows.map((r) => r.hash)) === JSON.stringify(b.rows.map((r) => r.hash)), 'hashes are deterministic')
  ok(a.c.verifyChain({ rows: a.rows }).ok === true && b.c.verifyChain({ rows: b.rows }).ok === true, 'verdicts are deterministic')
  now = 1000
}

// ===== task-118 fixes: trusted checkpoint, keyed MAC, first-row classification =====

// 13) the criticised case: deleting the TAIL. With a trusted checkpoint it must fail BY NAME.
{
  const { c, rows } = build(5)
  const cp = c.checkpoint({ rows })
  ok(cp.seq === 4 && cp.hash === rows[4].hash && typeof cp.at === 'number', 'checkpoint() returns {seq,hash,at}')
  const cut = rows.slice(0, 4)                                  // the tail row was deleted
  const unanchored = c.verifyChain({ rows: cut })
  ok(unanchored.ok === true && unanchored.anchored === false && unanchored.verified === 4, 'WITHOUT an anchor the truncated chain still verifies (that was the criticism)')
  ok(/accidental corruption only/.test(String(unanchored.note)), 'and the receipt SELF-REPORTS that it is not tamper-proof')
  const anchored = c.verifyChain({ rows: cut, expectHead: cp.hash, expectSeq: cp.seq })
  ok(anchored.ok === false && anchored.code === 'VMU_AUDIT_CHAIN_TRUNCATED' && anchored.reason === 'tail-truncated', 'WITH the checkpoint the deleted tail fails by name')
  ok(anchored.expected === cp.hash && anchored.actual === cut[3].hash, 'the failure shows expected vs actual head')
  const swappedTail = rows.slice(0, 4).concat([{ ...rows[3], seq: 4 }])   // tail REPLACED by a copy of row 3
  const replaced = c.verifyChain({ rows: swappedTail, expectHead: cp.hash, expectSeq: cp.seq })
  ok(replaced.ok === false && replaced.code === 'VMU_AUDIT_CHAIN_TRUNCATED', 'a REPLACED tail is caught by the checkpoint too')
  ok(c.verifyChain({ rows, expectHead: cp.hash, expectSeq: cp.seq }).ok === true, 'the intact chain still passes its own checkpoint')
}

// 14) rebuild attack, no key: the attacker recomputes the whole chain ⇒ caught by the checkpoint
{
  const { c, rows } = build(3)
  const forgedRows = []
  let prev = null
  for (let i = 0; i < 3; i++) { const r = c.append({ row: { seq: i, what: 'update', at: 1000 + i, payload: { forged: i } }, prevHash: prev }); forgedRows.push(r); prev = r.hash }
  const v = c.verifyChain({ rows: forgedRows, expectHead: rows[2].hash })
  ok(v.ok === false && v.code === 'VMU_AUDIT_CHAIN_TRUNCATED', 'a rebuilt chain is caught BY THE CHECKPOINT (head differs)')
  const unanchored = c.verifyChain({ rows: forgedRows })
  ok(unanchored.ok === true && unanchored.keyed === false && /recompute it/.test(String(unanchored.note)), 'without key+anchor a rebuilt sha256 chain passes, and the receipt says why')
  ok(/plain sha256 chain/.test(String(c.status().strength)), 'status() states the actual strength (unkeyed)')
}

// 15) keyed MAC chain: a rebuild without the key cannot pass
{
  const key = 'test-key-1'
  const mac = ({ data }) => createHash('sha256').update(key + '|' + data).digest('hex')
  const c = createAuditChain({ clock: () => now, sign: mac })
  const rows = []
  let prev = null
  for (let i = 0; i < 3; i++) { const r = c.append({ row: { seq: i, what: 'update', at: 1000 + i, payload: { i } }, prevHash: prev }); rows.push(r); prev = r.hash }
  ok(rows[0].hash.startsWith('hmac:') && c.status().keyed === true, 'keyed chain produces MAC digests and self-reports keyed:true')
  const selfCheck = c.verifyChain({ rows })
  ok(selfCheck.ok === true && selfCheck.keyed === true, 'keyed chain verifies and says keyed:true')
  const unkeyed = createAuditChain({ clock: () => now, hash: hasher })
  const forged = []
  let p2 = null
  for (let i = 0; i < 3; i++) { const r = unkeyed.append({ row: { seq: i, what: 'update', at: 1000 + i, payload: { i } }, prevHash: p2 }); forged.push(r); p2 = r.hash }
  const v = c.verifyChain({ rows: forged })
  ok(v.ok === false && v.index === 0 && v.reason === 'row-modified', 'a rebuild without the key is caught at row 0 (row-modified)')
  ok(/keyed MAC chain/.test(String(c.status().strength)), 'status() states the keyed strength')
}

// 16) first-row deletion is classified as a REMOVAL at index 0 (was wrongly row-modified)
{
  const { c, rows } = build(4)
  const withoutFirst = rows.slice(1).map((r) => ({ ...r }))
  const v = c.verifyChain({ rows: withoutFirst })
  ok(v.ok === false && v.index === 0 && v.reason === 'row-removed', 'deleting the genesis row ⇒ row-removed at index 0')
  ok(/GENESIS row is missing/.test(String(v.detail)), 'the detail explains the missing GENESIS row')
}

// 17) checkpoint()/status() are read-only and never mutate
{
  const { c, rows } = build(3)
  const before = JSON.stringify({ s: c.status(), cp: c.checkpoint({ rows }), v: c.verifyChain({ rows }) })
  c.status(); c.checkpoint({ rows }); c.verifyChain({ rows }); c.link({ rows })
  ok(JSON.stringify({ s: c.status(), cp: c.checkpoint({ rows }), v: c.verifyChain({ rows }) }) === before, 'new read-only surfaces do not mutate')
  const empty = c.checkpoint({ rows: [] })
  ok(empty.hash === GENESIS && empty.rows === 0 && /genesis marker/.test(String(empty.note)), 'empty checkpoint uses the explicit genesis marker')
  now = 1000
}

// ===== task-122: the anchor seam (checkpoint externalisation) =====

// 18) checkpoint({persist}) with a fake external anchor ⇒ written, anchored:true, anchoredTo
{
  const store = { name: 'fake-file', cp: null, write(cp) { this.cp = cp }, read() { return this.cp } }
  const c = createAuditChain({ clock: () => now, settings: {}, hash: hasher, anchor: store })
  const { rows } = build(3)
  const cp = c.checkpoint({ rows, persist: true })
  ok(cp.anchored === true && cp.anchoredTo === 'fake-file' && cp.persisted === true, 'persisted checkpoint self-reports anchored:true + seam name')
  ok(store.cp && store.cp.hash === rows[2].hash && store.cp.seq === 2, 'the checkpoint really is stored OUTSIDE the chain')
  ok(/now detectable/.test(String(cp.note)), 'the note says a truncated tail is now detectable')
  ok(c.status().anchor === 'read-write (fake-file)', 'status() reports the anchor seam')
}

// 19) no anchor seam ⇒ anchored:false and the plain warning (never a fake anchor)
{
  const c = createAuditChain({ clock: () => now, settings: {}, hash: hasher })
  const { rows } = build(3)
  const cp = c.checkpoint({ rows, persist: true })
  ok(cp.anchored === false && cp.persisted === false, 'no seam ⇒ anchored:false')
  ok(/NOT persisted externally/.test(String(cp.note)) && /cannot be detected/.test(String(cp.note)), 'the note says the checkpoint was NOT kept and a tail truncation cannot be detected')
  ok(c.status().anchor === 'none' && /no readable anchor/.test(String(c.status().anchorNote)), 'status() says there is no readable anchor')
}

// 20) with the anchor, deleting the TAIL is detected through useAnchor (the criticised case, now closed)
{
  const store = { name: 'fake-file', cp: null, write(cp) { this.cp = cp }, read() { return this.cp } }
  const c = createAuditChain({ clock: () => now, settings: {}, hash: hasher, anchor: store })
  const { rows } = build(5)
  c.checkpoint({ rows, persist: true })
  const cut = rows.slice(0, 4)
  const v = c.verifyChain({ rows: cut, useAnchor: true })
  ok(v.ok === false && v.code === 'VMU_AUDIT_CHAIN_TRUNCATED' && v.reason === 'tail-truncated', 'deleted tail is caught via the anchor')
  ok(v.anchored === true && v.anchoredTo === 'fake-file' && v.expected === store.cp.hash && v.actual === cut[3].hash, 'the verdict names the seam and shows expected vs actual')
  ok(c.verifyChain({ rows, useAnchor: true }).ok === true, 'the intact chain passes via the anchor')
}

// 21) a TAMPERED anchor is reported as an inconsistency (never silently accepted)
{
  const store = { name: 'fake-file', cp: null, write(cp) { this.cp = cp }, read() { return this.cp } }
  const c = createAuditChain({ clock: () => now, settings: {}, hash: hasher, anchor: store })
  const { rows } = build(4)
  c.checkpoint({ rows, persist: true })
  store.cp = { seq: 3, hash: 'F'.repeat(64), at: now }          // the anchor itself was tampered with
  const v = c.verifyChain({ rows, useAnchor: true })
  ok(v.ok === false && v.code === 'VMU_AUDIT_CHAIN_TRUNCATED', 'tampered anchor ⇒ named failure (anchor and chain disagree)')
  ok(v.expected === 'F'.repeat(64) && v.actual === rows[3].hash, 'the verdict shows anchor value vs chain value')
}

// 22) anchor read failure / empty anchor ⇒ named refusal (no silent downgrade to "unanchored")
{
  const broken = { name: 'broken', write() {}, read() { throw new Error('medium offline') } }
  const c = createAuditChain({ clock: () => now, settings: {}, hash: hasher, anchor: broken })
  const { rows } = build(2)
  const r = rejects(() => c.verifyChain({ rows, useAnchor: true }))
  ok(r.threw && r.code === 'VMU_AUDIT_CHAIN_ANCHOR_CORRUPT', 'a throwing reader ⇒ ANCHOR_CORRUPT (task-140: damage is not "never written")')
  const empty = { name: 'empty', write() {}, read() { return null } }
  const c2 = createAuditChain({ clock: () => now, settings: {}, hash: hasher, anchor: empty })
  const r2 = rejects(() => c2.verifyChain({ rows, useAnchor: true }))
  ok(r2.threw && r2.code === 'VMU_AUDIT_CHAIN_ANCHOR_UNREADABLE', 'empty anchor ⇒ named refusal')
  const writeOnly = createAuditChain({ clock: () => now, settings: {}, hash: hasher, anchor: { name: 'w', write() {} } })
  const r3 = rejects(() => writeOnly.verifyChain({ rows, useAnchor: true }))
  ok(r3.threw && r3.code === 'VMU_AUDIT_CHAIN_ANCHOR_UNREADABLE', 'write-only anchor cannot verify ⇒ named refusal')
  const c3 = createAuditChain({ clock: () => now, settings: {}, hash: hasher })
  const r4 = rejects(() => c3.verifyChain({ rows, useAnchor: true }))
  ok(r4.threw && r4.code === 'VMU_AUDIT_CHAIN_ANCHOR_UNREADABLE', 'no anchor at all + useAnchor ⇒ named refusal')
  const failingWrite = createAuditChain({ clock: () => now, settings: {}, hash: hasher, anchor: { name: 'f', write() { return false }, read() { return null } } })
  const w = rejects(() => failingWrite.checkpoint({ rows, persist: true }))
  ok(w.threw && w.code === 'VMU_AUDIT_CHAIN_ANCHOR_FAILED', 'a refusing anchor write fails by name (checkpoint not stored)')
}

// ===== task-129 (A1): anchor hygiene — cp.mac, mirrors, lag, rhythm =====

const mkMac = (key) => ({ data }) => createHash('sha256').update(key + '::' + data).digest('hex')

// 23) cp carries a mac; verifying it distinguishes "anchor tampered" from "chain tampered"
{
  const store = { name: 'primary', cp: null, write(cp) { this.cp = cp }, read() { return this.cp } }
  const c = createAuditChain({ clock: () => now, settings: {}, sign: mkMac('k1'), anchor: store })
  const rows = []
  let prev = null
  for (let i = 0; i < 3; i++) { const r = c.append({ row: { seq: i, what: 'update', at: 1000 + i, payload: { i } }, prevHash: prev }); rows.push(r); prev = r.hash }
  const cp = c.checkpoint({ rows, persist: true })
  ok(typeof cp.mac === 'string' && cp.mac.length > 0, 'checkpoint carries a mac (sign seam)')
  ok(c.verifyChain({ rows, useAnchor: true }).ok === true, 'intact chain + intact anchor verifies')
  store.cp = { ...store.cp, hash: 'A'.repeat(64) }          // ANCHOR tampered, old mac kept
  const tamper = rejects(() => c.verifyChain({ rows, useAnchor: true }))
  ok(tamper.threw && tamper.code === 'VMU_AUDIT_CHAIN_ANCHOR_TAMPERED', 'anchor mac mismatch ⇒ "the ANCHOR was modified" (not a chain failure)')
  store.cp = cp
  const cut = rows.slice(0, 2)                              // CHAIN tampered, anchor untouched
  const chainTamper = c.verifyChain({ rows: cut, useAnchor: true })
  ok(chainTamper.ok === false && chainTamper.code === 'VMU_AUDIT_CHAIN_TRUNCATED', 'chain tampered ⇒ chain code (the two failures are distinguishable)')
  ok(tamper.code !== chainTamper.code, 'the two failures have different codes')
}

// 24) second copies must AGREE; disagreement names the odd copy
{
  const primary = { name: 'primary', cp: null, write(cp) { this.cp = cp }, read() { return this.cp } }
  const offsite = { name: 'offsite', cp: null, write(cp) { this.cp = cp }, read() { return this.cp } }
  const c = createAuditChain({ clock: () => now, settings: {}, sign: mkMac('k1'), anchor: primary, mirrors: [offsite] })
  const rows = []
  let prev = null
  for (let i = 0; i < 3; i++) { const r = c.append({ row: { seq: i, what: 'update', at: 1000 + i, payload: { i } }, prevHash: prev }); rows.push(r); prev = r.hash }
  const cp = c.checkpoint({ rows, persist: true })
  ok(Array.isArray(cp.mirrors) && cp.mirrors.join(',') === 'offsite', 'the checkpoint reports which mirrors were written')
  ok(primary.cp.hash === offsite.cp.hash && c.verifyChain({ rows, useAnchor: true }).ok === true, 'agreeing copies verify')
  offsite.cp = { ...offsite.cp, hash: 'B'.repeat(64) }      // the offsite copy was altered
  const mism = rejects(() => c.verifyChain({ rows, useAnchor: true }))
  ok(mism.threw && mism.code === 'VMU_AUDIT_CHAIN_ANCHOR_MISMATCH', 'disagreeing copies ⇒ named refusal (never pick one)')
  ok(mism.differing === 'offsite' && mism.mirror.hash === 'B'.repeat(64) && mism.primary.hash === cp.hash, 'the refusal NAMES the differing copy and both values')
}

// 25) anchorLagMs uses the injected clock; checkpointSeq/lastCheckpointAt are exposed
{
  const store = { name: 'primary', cp: null, write(cp) { this.cp = cp }, read() { return this.cp } }
  const c = createAuditChain({ clock: () => now, settings: {}, sign: mkMac('k1'), anchor: store })
  now = 10_000
  const { rows } = build(2)
  c.checkpoint({ rows, persist: true })
  ok(c.status().lastCheckpointAt === 10_000 && c.status().checkpointSeq === 1 && c.status().anchorLagMs === 0, 'fresh checkpoint ⇒ lag 0, seq/at exposed')
  now = 13_500
  ok(c.status().anchorLagMs === 3500, 'anchorLagMs follows the injected clock (3500ms)')
  ok(c.status().mirrors === 0 && c.status().checkpointEvery === 0, 'status reports mirrors/rhythm defaults')
  now = 1000
}

// 26) automatic rhythm: checkpointEvery triggers; a failing anchor is COUNTED (never silent)
{
  const store = { name: 'primary', cp: null, write(cp) { this.cp = cp }, read() { return this.cp } }
  const c1 = createAuditChain({ clock: () => now, settings: { 'vmu.audit.chain.checkpointEvery': 2 }, sign: mkMac('k1'), anchor: store })
  const r1 = c1.append({ row: { seq: 0, what: 'update', at: 1 } })
  ok(r1.autoCheckpoint === null, 'before the rhythm boundary nothing is triggered')
  const r2 = c1.append({ row: { seq: 1, what: 'update', at: 2 }, prevHash: r1.hash })
  ok(r2.autoCheckpoint && r2.autoCheckpoint.triggered === true && r2.autoCheckpoint.anchored === true, 'every 2nd row triggers a persisted checkpoint')
  ok(c1.status().checkpointTriggers === 1 && c1.status().checkpointFailures === 0, 'the trigger is counted')
  const failing = { name: 'broken', write() { throw new Error('medium down') }, read() { return null } }
  const c2 = createAuditChain({ clock: () => now, settings: { 'vmu.audit.chain.checkpointEvery': 1 }, sign: mkMac('k1'), anchor: failing })
  const f1 = c2.append({ row: { seq: 0, what: 'update', at: 1 } })
  ok(f1.autoCheckpoint && f1.autoCheckpoint.triggered === true && f1.autoCheckpoint.failed === true, 'a failing automatic checkpoint is REPORTED on the row receipt')
  ok(c2.status().checkpointTriggers === 1 && c2.status().checkpointFailures === 1, 'trigger and failure are both counted')
}

// ===== task-140: callerExpected vs anchorVerified + CORRUPT vs UNREADABLE =====

// 27) default useAnchor:false ⇒ anchorVerified:false, and no claim of a verified anchor
{
  const store = { name: 'primary', cp: null, write(cp) { this.cp = cp }, read() { return this.cp } }
  const c = createAuditChain({ clock: () => now, settings: {}, hash: hasher, anchor: store })
  const { rows } = build(3)
  c.checkpoint({ rows, persist: true })
  const byCaller = c.verifyChain({ rows, expectHead: rows[2].hash, expectSeq: 2 })
  ok(byCaller.ok === true && byCaller.callerExpected === true, 'caller-supplied expectations are labelled callerExpected:true')
  ok(byCaller.anchorVerified === false && byCaller.anchored === false, 'useAnchor:false ⇒ anchorVerified:false and anchored:false (no mixing)')
  ok(/anchorVerified: false/.test(String(byCaller.note)) && /CALLER/.test(String(byCaller.note)), 'the note says the expectations came from the caller')
  ok(/anchor seam IS wired but useAnchor was false/.test(String(byCaller.note)), 'a wired-but-unused anchor is called out in the note')
  const byAnchor = c.verifyChain({ rows, useAnchor: true })
  ok(byAnchor.anchorVerified === true && byAnchor.anchored === true, 'useAnchor:true ⇒ anchorVerified:true and anchored:true')
  ok(/anchorVerified: true/.test(String(byAnchor.note)), 'the note states the anchor was read back and used')
}

// 28) CORRUPT (damaged / reader error / wrong shape) is DISTINCT from UNREADABLE (never written)
{
  const { rows } = build(2)
  const throwing = createAuditChain({ clock: () => now, settings: {}, hash: hasher, anchor: { name: 'dmg', write() {}, read() { throw new Error('EIO: bad sector') } } })
  const r1 = rejects(() => throwing.verifyChain({ rows, useAnchor: true }))
  ok(r1.threw && r1.code === 'VMU_AUDIT_CHAIN_ANCHOR_CORRUPT', 'a reader exception ⇒ ANCHOR_CORRUPT (damaged), not UNREADABLE')
  const envelope = createAuditChain({ clock: () => now, settings: {}, hash: hasher, anchor: { name: 'env', write() {}, read() { return { ok: false, error: 'unparsable JSON at line 1' } } } })
  const r2 = rejects(() => envelope.verifyChain({ rows, useAnchor: true }))
  ok(r2.threw && r2.code === 'VMU_AUDIT_CHAIN_ANCHOR_CORRUPT', 'a {ok:false,error} envelope ⇒ ANCHOR_CORRUPT')
  const wrongShape = createAuditChain({ clock: () => now, settings: {}, hash: hasher, anchor: { name: 'shape', write() {}, read() { return 'not-a-checkpoint' } } })
  const r3 = rejects(() => wrongShape.verifyChain({ rows, useAnchor: true }))
  ok(r3.threw && r3.code === 'VMU_AUDIT_CHAIN_ANCHOR_CORRUPT', 'an unknown shape ⇒ named refusal')
  const neverWritten = createAuditChain({ clock: () => now, settings: {}, hash: hasher, anchor: { name: 'fresh', write() {}, read() { return null } } })
  const r4 = rejects(() => neverWritten.verifyChain({ rows, useAnchor: true }))
  ok(r4.threw && r4.code === 'VMU_AUDIT_CHAIN_ANCHOR_UNREADABLE' && /ever persisted/.test(String(r4.msg)), 'null ⇒ UNREADABLE ("never written") — a DIFFERENT code from CORRUPT')
  ok(r1.code !== r4.code, 'damaged and never-written are distinguishable')
}

// ===== task-149 (D2): a transient key failure must NOT permanently degrade the chain =====

// 29) jitter seam: the first resolve throws, the next one succeeds ⇒ the second append works
{
  let calls = 0
  const secrets = { get(ref) { calls += 1; if (calls === 1) throw new Error('secret store blip'); return 'material-' + ref } }
  const c = createAuditChain({ clock: () => now, settings: {}, macKey: { ref: 'k1' }, secrets })
  const first = rejects(() => c.append({ row: { seq: 0, what: 'update', at: 1 } }))
  ok(first.threw && first.code === 'VMU_CRYPTO_UNAVAILABLE', 'first resolve fails BY NAME (fail-closed, nothing invented)')
  const st = c.status().mac
  ok(st.resolved === false && st.retryable === true && st.attempts === 1 && st.lastAttemptAt === now, 'status exposes retryable/attempts/lastAttemptAt (injected clock)')
  ok(st.lastError && /blip/.test(String(st.lastError.reason)), 'lastError records why it failed')
  ok(/fail-closed/.test(String(st.degradation)) && /NO silent fallback/.test(String(st.degradation)), 'the degradation stance is stated (fail-closed, no silent sha256 fallback)')
  const second = c.append({ row: { seq: 0, what: 'update', at: 2 } })
  ok(typeof second.hash === 'string' && second.hash.startsWith('hmac:'), 'the SECOND append succeeds (the failure was not memoised)')
  ok(calls === 2, 'the seam was consulted again (2 attempts)')
  const st2 = c.status().mac
  ok(st2.resolved === true && st2.keyed === true && st2.retryable === false, 'after recovery status reports keyed:true, resolved:true')
  ok(c.status().keyed === true, 'the chain is keyed again')
}

// 30) refresh() re-resolves; only success is cached
{
  const seen = []
  const secrets = { get(ref) { seen.push(ref); return 'material' } }
  const c = createAuditChain({ clock: () => now, settings: {}, macKey: { ref: 'k2' }, secrets })
  c.append({ row: { seq: 0, what: 'update', at: 1 } })
  c.append({ row: { seq: 1, what: 'update', at: 2 } })
  ok(seen.length === 1, 'a successful resolution is cached (one seam call)')
  const r = c.refresh()
  ok(r.cleared === true, 'refresh() clears the cached key explicitly')
  c.append({ row: { seq: 2, what: 'update', at: 3 } })
  ok(seen.length === 2, 'after refresh() the seam is consulted again')
  ok(c.status().mac.resolved === true, 'a healthy key stays resolved (no spurious degradation)')
  now = 1000
}

console.log('=== VMU AUDITCHAIN: ' + pass + ' passed, ' + fail + ' failed ===')
process.exit(fail ? 1 : 0)

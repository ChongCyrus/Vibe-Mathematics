// tests/vmu-auditchain.test.mjs — kernel/auditchain.js (N1).
// Scenarios: no hash seam ⇒ named refusal and NO fabricated hash; edit / delete / reorder / insert each
// localised to a concrete row index + reason; empty vs single-row semantics explicit; partial verification
// reports verified vs unverified honestly; determinism; read-only surfaces.
import { createAuditChain, GENESIS, CHAIN_FAILURES } from '../vibe-math-vmu/kernel/auditchain.js'
import { createHash } from 'node:crypto'

let pass = 0, fail = 0
const ok = (cond, label) => { if (cond) { pass++ } else { fail++; console.log('FAIL ' + label) } }
const rejects = (fn) => { try { fn(); return { threw: false } } catch (e) { return { threw: true, code: e && e.code, hint: e && e.hint, op: e && e.op } } }

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

console.log('=== VMU AUDITCHAIN: ' + pass + ' passed, ' + fail + ' failed ===')
process.exit(fail ? 1 : 0)

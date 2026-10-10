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

console.log('=== VMU AUDITCHAIN: ' + pass + ' passed, ' + fail + ' failed ===')
process.exit(fail ? 1 : 0)

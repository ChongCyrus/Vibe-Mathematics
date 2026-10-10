// vmu kernel auditchain — a forward hash chain over audit rows (N1).
// Why: docs/21 audit rows were only checked for "seq strictly increasing, no gaps", so a forger could
// fabricate seq AND rows together. This module makes each row commit to the previous one, and
// `verifyChain()` LOCALISES any edit / deletion / reorder / insertion to a concrete row index + reason.
// `hash` is an INJECTED seam: without it every append/verify refuses BY NAME and NO plausible-looking
// hash is ever produced (the same seam discipline as kernel/crypto.js — signature semantics are NOT
// redefined here). Codes: VMU_AUDIT_CHAIN_NO_HASHER / VMU_CRYPTO_VERIFY_FAILED / VMU_AUDIT_CHAIN_TRUNCATED
// (03-§8 family VMU_AUDIT_*).

export const apiVersion = 1

/** The genesis marker: the `prevHash` of the first row is explicit (never an empty string). */
export const GENESIS = 'GENESIS'

/** Verification failure reasons, all localised to a row index. */
export const CHAIN_FAILURES = Object.freeze(['row-modified', 'row-removed', 'rows-reordered', 'row-inserted', 'seq-gap', 'hash-missing', 'truncated'])

export function refuse(code, message, hint, extra) {
  const err = new Error(message)
  err.code = code
  err.hint = hint
  if (extra) Object.assign(err, extra)
  return err
}

const intOr = (v, d) => (Number.isInteger(v) && v >= 0 ? v : d)

/** The canonical serialisation that is hashed: only chain-relevant fields, in a fixed order. */
export function rowPreimage(row, prevHash) {
  const r = row || {}
  return JSON.stringify({ prevHash: prevHash === undefined ? r.prevHash : prevHash, seq: r.seq === undefined ? null : r.seq, what: r.what === undefined ? null : r.what, at: r.at === undefined ? null : r.at, payload: r.payload === undefined ? null : r.payload })
}

export function createAuditChain({ clock = () => Date.now(), log = () => {}, settings = {}, bus = null, hash = null, sign = null, verifyCap = 0 } = {}) {
  const cfg = () => ({
    hasherInjected: typeof hash === 'function',
    keyed: typeof sign === 'function',
    verifyCap: intOr(settings['vmu.audit.chain.verifyCap'], verifyCap),
    algorithm: settings['vmu.audit.chain.algorithm'] || 'sha256',
  })

  /**
   * The ONLY place digests are produced. No seam ⇒ named refusal, never a fabricated hash.
   * With a `sign` seam the row digest is a KEYED MAC: an attacker can no longer recompute a whole chain
   * (a plain sha256 chain only proves ACCIDENTAL corruption — every receipt says which one you got).
   */
  function digestOf(preimage) {
    if (typeof sign === 'function') {
      const mac = sign({ data: preimage })
      if (mac === undefined || mac === null) throw refuse('VMU_AUDIT_CHAIN_NO_HASHER', 'the injected sign seam returned no MAC', 'the seam must return a mac for { data }', { op: 'sign' })
      return 'hmac:' + String(mac)
    }
    if (typeof hash !== 'function') {
      throw refuse('VMU_AUDIT_CHAIN_NO_HASHER', 'no hash seam was injected: the chain cannot be built and no hash will be invented',
        'wire it with createAuditChain({ hash }) (sha256) or createAuditChain({ sign }) (keyed MAC)', { op: 'hash' })
    }
    return String(hash(preimage))
  }

  /** Append one row: it comes back carrying `prevHash` and `hash` (append-only; nothing else is exposed). */
  function append({ row = {}, prevHash = null } = {}) {
    if (!row || typeof row !== 'object') throw refuse('VMU_AUDIT_CHAIN_NO_HASHER', 'append needs a row object', 'pass append({ row })', { op: 'append' })
    const c = cfg()
    const prev = prevHash === null || prevHash === undefined ? GENESIS : String(prevHash)
    const out = { ...row, prevHash: prev }
    out.hash = digestOf(rowPreimage(out, prev))
    if (bus && typeof bus.emit === 'function') bus.emit('auditchain/appended', { seq: out.seq, at: clock() })
    return { ...out }
  }

  /**
   * verifyChain(): recompute every row. ANY mismatch is localised: `index`, `reason`, `expected`,
   * `actual`. Partial verification (verifyCap) reports `verified` vs `unverified` EXACTLY — it never
   * claims the whole chain was checked.
   */
  function verifyChain({ rows = [], from = 0, limit = null, expectHead = undefined, expectSeq = undefined } = {}) {
    const c = cfg()
    const anchored = expectHead !== undefined || expectSeq !== undefined
    if (typeof hash !== 'function' && typeof sign !== 'function') {
      throw refuse('VMU_AUDIT_CHAIN_NO_HASHER', 'no hash seam was injected: verification cannot be performed honestly',
        'wire createAuditChain({ hash }) or createAuditChain({ sign }); a verification claim without a hasher would be a lie', { op: 'verify', verified: 0 })
    }
    const all = Array.isArray(rows) ? rows : []
    const start = intOr(from, 0)
    const cap = limit === null || limit === undefined ? c.verifyCap : intOr(limit, c.verifyCap)
    const end = cap > 0 ? Math.min(all.length, start + cap) : all.length

    // Empty chain: explicit semantics, not a vacuous success.
    if (all.length === 0) return { ok: true, verified: 0, total: 0, unverified: 0, empty: true, genesis: GENESIS, anchored, keyed: c.keyed, note: 'empty chain: nothing to verify (this is NOT a claim about any data)' }

    let prevHash = start === 0 ? GENESIS : (all[start - 1] && all[start - 1].hash !== undefined ? String(all[start - 1].hash) : null)
    let prevSeq = start === 0 ? null : (all[start - 1] && all[start - 1].seq !== undefined ? all[start - 1].seq : null)

    for (let i = start; i < end; i++) {
      const row = all[i] || {}
      // (a) seq must advance by exactly 1 (a removal or reorder shows up here first)
      if (prevSeq !== null && row.seq !== undefined && row.seq !== null) {
        if (row.seq === prevSeq) return { ok: false, index: i, reason: 'rows-reordered', detail: 'two rows share seq ' + String(row.seq), verified: i - start, total: all.length, unverified: all.length - (i - start) }
        if (row.seq < prevSeq) return { ok: false, index: i, reason: 'rows-reordered', detail: 'seq went backwards at row ' + i + ' (' + String(prevSeq) + ' → ' + String(row.seq) + ')', verified: i - start, total: all.length, unverified: all.length - (i - start) }
        if (row.seq > prevSeq + 1) {
          // Classify the gap honestly: an extra row pushed in (its seq exceeds everything after it), a swap
          // (the expected next seq still exists later), or a removal (the expected seq is simply gone).
          const rest = all.slice(i + 1).filter((r) => r && typeof r.seq === 'number')
          const maxRest = rest.length ? Math.max(...rest.map((r) => r.seq)) : -Infinity
          const expectedLater = rest.some((r) => r.seq === prevSeq + 1)
          const reason = row.seq > maxRest ? 'row-inserted' : (expectedLater ? 'rows-reordered' : 'row-removed')
          return { ok: false, index: i, reason, detail: 'seq gap at row ' + i + ' (' + String(prevSeq) + ' → ' + String(row.seq) + '): ' + reason, verified: i - start, total: all.length, unverified: all.length - (i - start) }
        }
      }
      // (b) the row's prevHash must equal the previous row's hash
      const expectedPrev = prevHash === null ? row.prevHash : prevHash
      if (row.prevHash !== undefined && expectedPrev !== null && String(row.prevHash) !== String(expectedPrev)) {
        // At the very start of the chain, a first row that does not point at GENESIS means the GENESIS row
        // itself is GONE (a removal at index 0) — not a modification of a later row.
        const reason = i === start && expectedPrev === GENESIS
          ? 'row-removed'
          : (String(row.prevHash) === GENESIS && i > 0 ? 'row-inserted' : 'row-modified')
        // When a trusted checkpoint is supplied and the break is at the LAST row, this is a tail
        // replacement: report it under the truncated code as well (the lead's requirement, task-118).
        const tailCode = anchored && i === all.length - 1 ? 'VMU_AUDIT_CHAIN_TRUNCATED' : null
        return { ok: false, code: tailCode, index: i, reason, detail: 'prevHash mismatch at row ' + i + ': expected ' + String(expectedPrev) + ' got ' + String(row.prevHash) + (reason === 'row-removed' && i === start ? ' (the GENESIS row is missing)' : ''), expected: String(expectedPrev), actual: String(row.prevHash), verified: i - start, total: all.length, unverified: all.length - (i - start), anchored, keyed: c.keyed }
      }
      // (c) the stored hash must equal the recomputation
      const recomputed = digestOf(rowPreimage(row, row.prevHash === undefined ? expectedPrev : row.prevHash))
      if (row.hash === undefined || row.hash === null) {
        return { ok: false, index: i, reason: 'hash-missing', detail: 'row ' + i + ' has no hash: it was never chained', verified: i - start, total: all.length, unverified: all.length - (i - start) }
      }
      if (String(row.hash) !== String(recomputed)) {
        return { ok: false, index: i, reason: 'row-modified', detail: 'hash mismatch at row ' + i + ': stored ' + String(row.hash) + ' recomputed ' + String(recomputed), expected: String(recomputed), actual: String(row.hash), verified: i - start, total: all.length, unverified: all.length - (i - start) }
      }
      prevHash = String(row.hash)
      prevSeq = row.seq === undefined ? prevSeq : row.seq
    }

    const verified = end - start
    const unverified = all.length - verified
    const partial = unverified > 0
    // ANCHOR CHECK (task-118): without a trusted checkpoint a chain cannot detect a truncated TAIL at all
    // (recompute-and-stop is always self-consistent). With one, a removed/replaced tail fails by name.
    const lastVerified = end > start ? all[end - 1] : null
    const actualHead = lastVerified && lastVerified.hash !== undefined ? String(lastVerified.hash) : null
    const actualSeq = lastVerified && lastVerified.seq !== undefined ? lastVerified.seq : null
    if (anchored && end === all.length) {
      if (expectHead !== undefined && expectHead !== null && String(expectHead) !== String(actualHead)) {
        return { ok: false, code: 'VMU_AUDIT_CHAIN_TRUNCATED', reason: 'tail-truncated', index: end > 0 ? end - 1 : 0,
          detail: 'chain head does not match the trusted checkpoint: expected ' + String(expectHead) + ' got ' + String(actualHead) + ' — the tail was removed or replaced',
          expected: String(expectHead), actual: String(actualHead), verified, total: all.length, unverified: 0, partial: false, anchored, keyed: c.keyed,
          note: 'TAIL MISMATCH: the verified rows are self-consistent, which is exactly why a trusted checkpoint is required' }
      }
      if (expectSeq !== undefined && expectSeq !== null && Number(expectSeq) !== Number(actualSeq)) {
        return { ok: false, code: 'VMU_AUDIT_CHAIN_TRUNCATED', reason: 'tail-truncated', index: end > 0 ? end - 1 : 0,
          detail: 'chain seq does not match the trusted checkpoint: expected ' + String(expectSeq) + ' got ' + String(actualSeq) + ' — rows were removed from the tail',
          expected: Number(expectSeq), actual: Number(actualSeq), verified, total: all.length, unverified: 0, partial: false, anchored, keyed: c.keyed }
      }
    }
    if (partial && bus && typeof bus.emit === 'function') bus.emit('auditchain/partial-verify', { verified, unverified })
    return {
      ok: true,
      verified,
      total: all.length,
      unverified,
      partial,
      from: start,
      to: end - 1,
      head: actualHead,
      seq: actualSeq,
      anchored,
      keyed: c.keyed,
      // (5) honesty: a partial check must never be reported as a full one, and an unanchored check must
      // never be presented as tamper-proof (it only proves accidental corruption).
      note: [
        anchored ? 'anchored: checked against a trusted checkpoint (' + String(expectHead || expectSeq) + ')' : 'anchored:false — no checkpoint was supplied, so a truncated or fully rebuilt TAIL cannot be detected (accidental corruption only)',
        partial ? 'PARTIAL: only rows ' + start + '..' + (end - 1) + ' were verified; ' + unverified + ' row(s) were NOT verified' : 'full chain verified (' + verified + ' row(s))',
        c.keyed ? 'keyed:true (MAC chain)' : 'keyed:false (plain sha256 chain: an attacker who can rewrite the log can recompute it)',
      ].join(' | '),
      truncated: partial,
      truncatedCode: partial ? 'VMU_AUDIT_CHAIN_TRUNCATED' : null,
      genesis: GENESIS,
    }
  }

  /** link(): read-only projection showing the chain that SHOULD hold (what a verifier expects). */
  function link({ rows = [] } = {}) {
    const all = Array.isArray(rows) ? rows : []
    let prev = GENESIS
    return all.map((row, i) => {
      const expectedPrev = prev
      const recomputed = typeof hash === 'function' ? digestOf(rowPreimage(row, row.prevHash === undefined ? expectedPrev : row.prevHash)) : null
      const okRow = recomputed !== null && String(row.hash) === String(recomputed) && (row.prevHash === undefined || String(row.prevHash) === String(expectedPrev))
      prev = row.hash !== undefined && row.hash !== null ? String(row.hash) : prev
      return { index: i, seq: row.seq === undefined ? null : row.seq, expectedPrev, storedPrev: row.prevHash === undefined ? null : String(row.prevHash), storedHash: row.hash === undefined ? null : String(row.hash), recomputed, ok: okRow }
    })
  }

  /**
   * checkpoint(): the TRUSTED anchor. Keep it outside the log (task-118): it is the only way to detect a
   * truncated or wholly rebuilt tail. Returns the head hash + seq + when it was taken.
   */
  function checkpoint({ rows = [] } = {}) {
    const all = Array.isArray(rows) ? rows : []
    const last = all.length ? all[all.length - 1] : null
    if (!last) return { seq: null, hash: GENESIS, at: clock(), rows: 0, keyed: cfg().keyed, note: 'empty chain: the checkpoint is the genesis marker' }
    return { seq: last.seq === undefined ? null : last.seq, hash: last.hash === undefined ? null : String(last.hash), at: clock(), rows: all.length, keyed: cfg().keyed }
  }

  /** Read-only status. Says plainly whether the chain can be built and HOW STRONG it is. */
  const status = () => ({
    hasher: typeof sign === 'function' ? 'sign(hmac)' : (typeof hash === 'function' ? 'hash' : 'none'),
    chainable: typeof hash === 'function' || typeof sign === 'function',
    keyed: cfg().keyed,
    strength: cfg().keyed ? 'keyed MAC chain (resists recomputation by an attacker without the key)' : (typeof hash === 'function' ? 'plain sha256 chain (accidental corruption only: anyone can recompute it)' : 'none'),
    note: (typeof hash === 'function' || typeof sign === 'function') ? null : 'no hash seam: appends and verification will refuse by name (no fake hashes)',
    policy: cfg(),
    genesis: GENESIS,
    failureReasons: CHAIN_FAILURES.slice(),
  })

  return { apiVersion, append, verifyChain, link, checkpoint, status }
}

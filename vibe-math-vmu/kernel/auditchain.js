// vmu kernel auditchain — a forward hash chain over audit rows (N1).
// Why: docs/21 audit rows were only checked for "seq strictly increasing, no gaps", so a forger could
// fabricate seq AND rows together. This module makes each row commit to the previous one, and
// `verifyChain()` LOCALISES any edit / deletion / reorder / insertion to a concrete row index + reason.
// `hash` is an INJECTED seam: without it every append/verify refuses BY NAME and NO plausible-looking
// hash is ever produced (the same seam discipline as kernel/crypto.js — signature semantics are NOT
// redefined here).
// `macKey` (task-141) — the KEYED option that makes the chain resist RECOMPUTATION. Pass it as a SECRET
// REFERENCE: a string literal, a resolver function/{ read() }, `{ ref, material }`, or `{ ref }` with a
// `secrets` seam. When it resolves, every row digest (and the checkpoint MAC) is HMAC-SHA256 and every
// receipt says `keyed:true`; the MATERIAL is never logged and never appears in `status()` — only a
// fingerprint does. Without it the chain stays sha256 and status/receipts keep saying `keyed:false` with the
// plain warning that an attacker can recompute it (an unkeyed chain is never presented as tamper-proof).
// Codes: VMU_AUDIT_CHAIN_NO_HASHER / VMU_CRYPTO_NO_KEY / VMU_CRYPTO_KEY_UNKNOWN / VMU_CRYPTO_UNAVAILABLE /
// VMU_CRYPTO_VERIFY_FAILED / VMU_AUDIT_CHAIN_TRUNCATED (03-§8 families VMU_AUDIT_* and VMU_CRYPTO_*).
import { createHmac, createHash } from 'node:crypto'

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

export function createAuditChain({ clock = () => Date.now(), log = () => {}, settings = {}, bus = null, hash = null, sign = null, macKey = null, secrets = null, anchor = null, mirrors = [], verifyCap = 0 } = {}) {
  // ── task-141: `macKey` — the KEYED option without an injected sign seam ──────────────────────────────
  // A plain sha256 chain only proves ACCIDENTAL corruption: whoever can rewrite the log can recompute the
  // whole chain. `macKey` accepts a SECRET REFERENCE (resolved lazily and memoised) in these shapes:
  //   'literal-secret' (string) · Buffer/Uint8Array · () => material · { read() } · { ref, material }
  //   · { ref } together with a `secrets` seam ({ get(ref) | read(ref) | secrets(ref) })
  // The MATERIAL is never logged, never returned and never put into `status()` — only a fingerprint is.
  let macCache = null
  // ── task-149 (D2): FAILURES ARE NEVER MEMOISED ──────────────────────────────────────────────────────
  // Memoising a resolution failure turned one transient secret-store hiccup into a permanent, SILENT
  // degradation of a tamper-resistance control (the whole process stayed unkeyed). Only SUCCESS is cached
  // (with an optional TTL); failures are recorded as observable attempts and are retried on the next call.
  let macAttempts = 0
  let macLastError = null
  let macLastAttemptAt = null
  let macResolvedAt = null
  const cfgMac = () => ({ ttlMs: intOr(settings['vmu.audit.chain.macKeyTtlMs'], 0) })
  /** Explicit re-resolution hook: clears the (successful) cache so the next call hits the seam again. */
  function refreshMac() {
    const had = !!macCache
    macCache = null
    macResolvedAt = null
    return { cleared: had, attempts: macAttempts }
  }
  const macExpired = () => {
    const ttl = cfgMac().ttlMs
    if (!macCache || !macCache.ok || ttl <= 0 || macResolvedAt === null) return false
    return clock() - macResolvedAt > ttl
  }
  const macConfigured = () => macKey !== null && macKey !== undefined && !(typeof macKey === 'string' && macKey === '')
  const usableMaterial = (v) => (typeof v === 'string' && v.length > 0) || (v && typeof v.length === 'number' && v.length > 0) || (typeof v === 'object' && v !== null && v.material !== undefined)
  const macRef = () => {
    if (typeof macKey === 'string') return 'literal:sha256:' + createHash('sha256').update(macKey).digest('hex').slice(0, 8)
    if (macKey && typeof macKey === 'object' && typeof macKey.ref === 'string' && macKey.ref) return macKey.ref
    return macKey ? 'inline' : null
  }
  /** Record a failed attempt WITHOUT caching it: the next call must try again. */
  const macFail = (code, reason, ref) => {
    macAttempts += 1
    macLastAttemptAt = clock()
    macLastError = { code, reason }
    return { ok: false, code, reason, ref: ref === undefined ? macRef() : ref, retryable: true, attempts: macAttempts, lastAttemptAt: macLastAttemptAt }
  }
  function resolveMac() {
    if (macCache && macCache.ok && !macExpired()) return macCache
    if (macExpired()) { macCache = null; macResolvedAt = null }
    if (!macConfigured()) return macFail('VMU_CRYPTO_NO_KEY', 'no macKey was provided', null)
    const done = (material) => {
      if (typeof material === 'string' || material instanceof Uint8Array || Buffer.isBuffer(material)) {
        if (material.length === 0) return macFail('VMU_CRYPTO_KEY_UNKNOWN', 'the resolved key material is EMPTY', macRef())
        macCache = {
          ok: true, material, ref: macRef(), algorithm: 'HMAC-SHA256',
          fingerprint: 'sha256:' + createHash('sha256').update(material).digest('hex').slice(0, 12),
          bytes: material.length,
        }
        macResolvedAt = clock()
        return macCache
      }
      if (material && typeof material === 'object' && material.material !== undefined) return done(material.material)
      return macFail('VMU_CRYPTO_KEY_UNKNOWN', 'the resolved key material has an unsupported type (' + typeof material + ')', macRef())
    }
    try {
      if (typeof macKey === 'function') return done(macKey())
      if (typeof macKey === 'string' || macKey instanceof Uint8Array || Buffer.isBuffer(macKey)) return done(macKey)
      if (macKey && typeof macKey === 'object') {
        if (macKey.material !== undefined) return done(macKey.material)
        if (typeof macKey.read === 'function') return done(macKey.read())
        const ref = typeof macKey.ref === 'string' ? macKey.ref : null
        if (ref) {
          if (!secrets) return macFail('VMU_CRYPTO_UNAVAILABLE', 'macKey is a reference ("' + ref + '") but no `secrets` seam was injected', ref)
          let got
          if (typeof secrets.get === 'function') got = secrets.get(ref)
          else if (typeof secrets.read === 'function') got = secrets.read(ref)
          else if (typeof secrets === 'function') got = secrets(ref)
          else return macFail('VMU_CRYPTO_UNAVAILABLE', 'the `secrets` seam exposes no get/read', ref)
          if (got === undefined || got === null) return macFail('VMU_CRYPTO_KEY_UNKNOWN', 'the secrets seam has no entry for "' + ref + '"', ref)
          return done(got)
        }
      }
      return macFail('VMU_CRYPTO_KEY_UNKNOWN', 'macKey has an unrecognised shape', macRef())
    } catch (e) {
      // A TRANSIENT failure (e.g. the secret store blipped) must not stick: it is recorded, reported as
      // retryable, and the NEXT call re-resolves.
      return macFail('VMU_CRYPTO_UNAVAILABLE', 'resolving macKey failed: ' + String((e && e.message) || e), macRef())
    }
  }
  /**
   * The PUBLIC, material-free description of the key (this is all that may leave the module).
   * D2 (task-149): a FAILED attempt is reported (retryable/lastError/attempts/lastAttemptAt) and is NOT
   * cached, so the next append/verify tries again. `status()` itself does not hammer the seam: it resolves
   * only on the first touch and otherwise reports the recorded outcome.
   */
  const macInfo = () => {
    if (typeof sign === 'function') return { configured: true, source: 'sign-seam', kind: 'injected-seam', ref: null, algorithm: 'seam-defined', fingerprint: null, materialExposed: false, resolved: true, keyed: true, degradation: 'none' }
    if (!macConfigured()) return { configured: false, source: null, kind: null, ref: null, algorithm: null, fingerprint: null, materialExposed: false, resolved: false, keyed: false, retryable: false, attempts: macAttempts, lastError: macLastError, lastAttemptAt: macLastAttemptAt, degradation: 'unkeyed-by-configuration', note: 'no macKey: the chain is UNKEYED sha256 (accidental corruption only — an attacker who can rewrite the log can recompute it)' }
    const cachedOk = !!(macCache && macCache.ok && !macExpired())
    const m = cachedOk ? macCache : (macAttempts === 0 && macCache === null ? resolveMac() : (macCache && macCache.ok ? macCache : null))
    const common = {
      configured: true, source: 'macKey',
      kind: typeof macKey === 'string' ? 'literal' : (macKey && typeof macKey === 'object' && macKey.ref ? 'secret-ref' : 'inline'),
      materialExposed: false,
      attempts: macAttempts,
      lastError: macLastError,
      lastAttemptAt: macLastAttemptAt,
      resolvedAt: macResolvedAt,
      ttlMs: cfgMac().ttlMs,
      // The degradation stance is FAIL-CLOSED: a configured-but-unresolvable key REFUSES to chain rather
      // than silently falling back to an unkeyed sha256 chain.
      degradation: 'fail-closed (a configured key that cannot be resolved refuses; NO silent fallback to sha256)',
    }
    if (m && m.ok) return { ...common, ref: m.ref, algorithm: m.algorithm, fingerprint: m.fingerprint, bytes: m.bytes, resolved: true, keyed: true, retryable: false }
    const err = macLastError || (m && !m.ok ? { code: m.code, reason: m.reason } : null)
    return {
      ...common,
      ref: (m && m.ref) || macRef(), algorithm: null, fingerprint: null, resolved: false, keyed: false,
      // A failure is always retryable: that is the whole point of task-149 (no sticky degradation).
      retryable: true,
      error: err || { code: 'VMU_CRYPTO_UNAVAILABLE', reason: 'the key has not been resolved yet' },
      note: 'the chain is currently UNKEYED because the key could not be resolved: this is FAIL-CLOSED (appends refuse) and the next attempt will retry — never assume HMAC protection while resolved:false',
    }
  }

  const cfg = () => ({
    hasherInjected: typeof hash === 'function',
    keyed: typeof sign === 'function' || !!(macCache && macCache.ok),
    anchored: !!(anchor && (typeof anchor.write === 'function' || typeof anchor === 'function')),
    // A1: automatic checkpoint rhythm. 0 (default) = manual only. Triggers AND failures are counted.
    checkpointEvery: intOr(settings['vmu.audit.chain.checkpointEvery'], 0),
    verifyCap: intOr(settings['vmu.audit.chain.verifyCap'], verifyCap),
    algorithm: settings['vmu.audit.chain.algorithm'] || 'sha256',
  })

  // Internal append-only chain (needed for the automatic rhythm); never exposed for mutation.
  const chain = []
  let checkpointTriggers = 0
  let checkpointFailures = 0
  let lastCheckpointAt = null
  let lastCheckpointSeq = null

  /**
   * The EXTERNAL ANCHOR seam (task-122) + SECOND COPIES (task-129, A1). Shape:
   *   anchor  = { name?: string, write(cp): boolean|void, read(): cp|null }   — or a bare write function
   *   mirrors = [{ name: string, write?(cp), read(): cp|null }, …]            — independent copies
   * Hygiene: the checkpoint carries a `mac` (from the injected `sign` seam) so a TAMPERED ANCHOR is told
   * apart from a TAMPERED CHAIN; when several copies exist they must AGREE, otherwise it is a named
   * refusal that names the disagreeing copy (never "pick one and trust it").
   * Whether the medium itself is trustworthy is NOT this module's concern — it only calls the seams.
   */
  const anchorName = () => (anchor && typeof anchor.name === 'string' && anchor.name) || (anchor ? 'anchor' : 'none')
  const mirrorList = () => (Array.isArray(mirrors) ? mirrors.filter((m) => m && typeof m.read === 'function') : [])
  const mirrorNames = () => mirrorList().map((m, i) => (m && typeof m.name === 'string' && m.name) || ('mirror-' + i))
  /** The checkpoint MAC uses the SAME key as the chain (a keyed chain with an unkeyed checkpoint would be
   *  forgeable at the anchor). Returns null when no key/seam exists — the caller then says so plainly. */
  const cpMacOf = (cp) => {
    const data = 'checkpoint|' + String(cp.seq) + '|' + String(cp.hash) + '|' + String(cp.rows)
    if (typeof sign === 'function') {
      const mac = sign({ data })
      return mac === undefined || mac === null ? null : String(mac)
    }
    if (macConfigured()) {
      const m = resolveMac()
      if (!m.ok) return null                     // `digestOf` refuses by name; the checkpoint MAC just reports null
      return createHmac('sha256', m.material).update(data).digest('hex')
    }
    return null
  }
  const hasAnchorWrite = () => !!(anchor && (typeof anchor.write === 'function' || typeof anchor === 'function'))
  const hasAnchorRead = () => !!(anchor && typeof anchor.read === 'function')
  function anchorWrite(cp) {
    if (!hasAnchorWrite()) throw refuse('VMU_AUDIT_CHAIN_ANCHOR_MISSING', 'no anchor seam was injected: the checkpoint cannot be persisted externally',
      'wire it with createAuditChain({ anchor: { write(cp){…}, read(){…} } }); without it a truncated tail cannot be detected', { op: 'anchor-write' })
    const w = typeof anchor === 'function' ? anchor : anchor.write
    const out = w.call(typeof anchor === 'function' ? undefined : anchor, cp)
    if (out === false) throw refuse('VMU_AUDIT_CHAIN_ANCHOR_FAILED', 'the anchor seam refused to persist the checkpoint', 'anchor.write() returned false; the checkpoint was NOT stored', { op: 'anchor-write', checkpoint: cp })
    return true
  }
  function anchorRead() {
    if (!hasAnchorRead()) throw refuse('VMU_AUDIT_CHAIN_ANCHOR_UNREADABLE', 'the anchor seam cannot be read (no read())',
      'a checkpoint that cannot be read back cannot anchor verification; this is refused, never silently treated as unanchored', { op: 'anchor-read' })
    return readOne(anchor, 'anchor')
  }
  /**
   * Read one copy (anchor or mirror). C3: "CORRUPT" (the medium is damaged / the reader failed / the shape
   * is wrong) is kept DISTINCT from "UNREADABLE because nothing was ever written" — conflating them would
   * let an incident be written off as "we never checkpointed". Both are named refusals.
   */
  function readOne(seam, label) {
    let cp
    try { cp = seam.read() } catch (e) {
      throw refuse('VMU_AUDIT_CHAIN_ANCHOR_CORRUPT', 'reading the ' + label + ' failed: ' + String((e && e.message) || e),
        'the ' + label + ' medium is DAMAGED (this is NOT "nothing was ever written"): expected a checkpoint object {seq,hash}; got an exception',
        { op: 'anchor-read', copy: label, reason: 'corrupt', error: String((e && e.message) || e) })
    }
    if (cp && typeof cp === 'object' && cp.ok === false) {
      throw refuse('VMU_AUDIT_CHAIN_ANCHOR_CORRUPT', 'the ' + label + ' reported a read failure: ' + String(cp.error || cp.message || '(no detail)'),
        'the ' + label + ' medium is DAMAGED or unparsable (NOT "never written"): expected {seq,hash}; fix or restore the copy',
        { op: 'anchor-read', copy: label, reason: 'corrupt', error: String(cp.error || cp.message || '') })
    }
    if (cp === null || cp === undefined) {
      throw refuse('VMU_AUDIT_CHAIN_ANCHOR_UNREADABLE', 'the ' + label + ' is empty: no checkpoint was ever persisted there',
        'call checkpoint({ persist: true }) first; an empty ' + label + ' means "never written" (a DAMAGED copy reports ANCHOR_CORRUPT instead)',
        { op: 'anchor-read', copy: label, reason: 'never-written' })
    }
    if (typeof cp !== 'object' || (cp.hash === undefined && cp.seq === undefined)) {
      throw refuse('VMU_AUDIT_CHAIN_ANCHOR_CORRUPT', 'the ' + label + ' has an unexpected shape: ' + JSON.stringify(cp),
        'expected a checkpoint object { seq, hash, at, rows }, got ' + (typeof cp),
        { op: 'anchor-read', copy: label, reason: 'corrupt', shape: typeof cp })
    }
    return cp
  }

  /**
   * The ONLY place digests are produced. No seam ⇒ named refusal, never a fabricated hash.
   * With a `sign` seam the row digest is a KEYED MAC: an attacker can no longer recompute a whole chain
   * (a plain sha256 chain only proves ACCIDENTAL corruption — every receipt says which one you got).
   * `macKey` (task-141) gives the SAME guarantee WITHOUT an injected sign seam: this module builds the
   * HMAC-SHA256 itself. A configured-but-UNUSABLE key is REFUSED BY NAME — it never falls back to sha256.
   */
  function digestOf(preimage) {
    if (typeof sign === 'function') {
      const mac = sign({ data: preimage })
      if (mac === undefined || mac === null) throw refuse('VMU_AUDIT_CHAIN_NO_HASHER', 'the injected sign seam returned no MAC', 'the seam must return a mac for { data }', { op: 'sign' })
      return 'hmac:' + String(mac)
    }
    if (macConfigured()) {
      const m = resolveMac()
      if (!m.ok) {
        throw refuse(m.code, 'macKey was configured but cannot be used: ' + m.reason,
          'fix the secret reference (or drop macKey and accept an UNKEYED sha256 chain, which is not tamper-proof)', { op: 'mac', ref: m.ref || null })
      }
      return 'hmac:' + createHmac('sha256', m.material).update(String(preimage)).digest('hex')
    }
    if (typeof hash !== 'function') {
      throw refuse('VMU_AUDIT_CHAIN_NO_HASHER', 'no hash seam was injected: the chain cannot be built and no hash will be invented',
        'wire it with createAuditChain({ hash }) (sha256), createAuditChain({ sign }) (keyed MAC) or createAuditChain({ macKey }) (built-in HMAC-SHA256)', { op: 'hash' })
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
    chain.push(out)
    if (bus && typeof bus.emit === 'function') bus.emit('auditchain/appended', { seq: out.seq, at: clock() })
    // A1 rhythm: every N rows (default 0 = never) try to persist a checkpoint. Triggers and failures are
    // both counted, and a failure is REPORTED on the row receipt — never swallowed.
    let auto = null
    if (c.checkpointEvery > 0 && chain.length % c.checkpointEvery === 0) {
      checkpointTriggers += 1
      try {
        const cp = checkpoint({ rows: chain, persist: true })
        auto = { triggered: true, at: cp.at, seq: cp.seq, anchored: cp.anchored, anchoredTo: cp.anchoredTo, mirrors: cp.mirrors }
      } catch (e) {
        checkpointFailures += 1
        auto = { triggered: true, failed: true, code: e && e.code, message: String((e && e.message) || e) }
        if (bus && typeof bus.emit === 'function') bus.emit('auditchain/checkpoint-failed', { code: e && e.code, at: clock() })
      }
    }
    return { ...out, autoCheckpoint: auto }
  }

  /**
   * verifyChain(): recompute every row. ANY mismatch is localised: `index`, `reason`, `expected`,
   * `actual`. Partial verification (verifyCap) reports `verified` vs `unverified` EXACTLY — it never
   * claims the whole chain was checked.
   */
  function verifyChain({ rows = [], from = 0, limit = null, expectHead = undefined, expectSeq = undefined, useAnchor = false } = {}) {
    const c = cfg()
    let anchorSource = null
    const callerExpected = expectHead !== undefined || expectSeq !== undefined
    let anchorVerified = false
    const anchorWired = hasAnchorRead()
    if (useAnchor) {
      // (3) read the trusted checkpoint back. A failure here is NAMED — it never degrades to "unanchored".
      const cp = anchorRead()
      // (A1) verify the ANCHOR's own mac FIRST: a tampered anchor must not be reported as a tampered chain.
      // task-141: a `macKey`-keyed chain MUST check this too — otherwise the anchor would be forgeable
      // while the chain itself is keyed (a keyed chain with an unkeyed checkpoint is a false sense of safety).
      const macCheckable = typeof sign === 'function' || (macConfigured() && resolveMac().ok)
      if (macCheckable && cp && cp.mac !== undefined) {
        const expectedMac = cpMacOf(cp)
        if (String(cp.mac) !== String(expectedMac)) {
          throw refuse('VMU_AUDIT_CHAIN_ANCHOR_TAMPERED', 'the anchor checkpoint failed its own MAC: the ANCHOR was modified (this is not a chain failure)',
            'expected mac ' + String(expectedMac) + ' got ' + String(cp.mac) + '; the anchor medium was altered, so no chain verdict can be trusted',
            { op: 'anchor-verify', reason: 'anchor-tampered', expected: String(expectedMac), actual: String(cp.mac), anchor: cp })
        }
      }
      // (A1) second copies must AGREE. Disagreement is a named refusal that names the odd copy.
      const copies = mirrorList()
      if (copies.length) {
        for (let i = 0; i < copies.length; i++) {
          const label = mirrorNames()[i]
          const mcp = readOne(copies[i], 'mirror:' + label)
          if (String(mcp.hash) !== String(cp.hash) || String(mcp.seq) !== String(cp.seq)) {
            throw refuse('VMU_AUDIT_CHAIN_ANCHOR_MISMATCH', 'anchor copies disagree: mirror "' + label + '" says seq=' + String(mcp.seq) + ' hash=' + String(mcp.hash) + ' while the primary says seq=' + String(cp.seq) + ' hash=' + String(cp.hash),
              'refusing to pick one copy and trust it; repair the copies (one of them was altered or stale)',
              { op: 'anchor-verify', reason: 'copies-disagree', differing: label, primary: { seq: cp.seq, hash: String(cp.hash) }, mirror: { seq: mcp.seq, hash: String(mcp.hash) } })
          }
        }
      }
      if (expectHead === undefined && cp && cp.hash !== undefined) expectHead = cp.hash
      if (expectSeq === undefined && cp && cp.seq !== undefined) expectSeq = cp.seq
      anchorSource = anchorName()
      // A1/C3 labelling: `anchorVerified` is the ONLY fact that means "a trusted checkpoint was read back
      // and used". Caller-supplied expectations are a different fact (`callerExpected`).
      anchorVerified = true
    }
    const anchored = anchorVerified
    if (typeof hash !== 'function' && typeof sign !== 'function' && !macConfigured()) {
      throw refuse('VMU_AUDIT_CHAIN_NO_HASHER', 'no hash seam was injected: verification cannot be performed honestly',
        'wire createAuditChain({ hash }), createAuditChain({ sign }) or createAuditChain({ macKey }); a verification claim without a hasher would be a lie', { op: 'verify', verified: 0 })
    }
    const all = Array.isArray(rows) ? rows : []
    const start = intOr(from, 0)
    const cap = limit === null || limit === undefined ? c.verifyCap : intOr(limit, c.verifyCap)
    const end = cap > 0 ? Math.min(all.length, start + cap) : all.length

    // Empty chain: explicit semantics, not a vacuous success.
    if (all.length === 0) return { ok: true, verified: 0, total: 0, unverified: 0, empty: true, genesis: GENESIS, anchored, anchoredTo: anchorSource, callerExpected, anchorVerified, anchorWired, keyed: c.keyed, note: 'empty chain: nothing to verify (this is NOT a claim about any data)' }

    let prevHash = start === 0 ? GENESIS : (all[start - 1] && all[start - 1].hash !== undefined ? String(all[start - 1].hash) : null)
    let prevSeq = start === 0 ? null : (all[start - 1] && all[start - 1].seq !== undefined ? all[start - 1].seq : null)

    for (let i = start; i < end; i++) {
      const row = all[i] || {}
      // (a) seq must advance by exactly 1 (a removal or reorder shows up here first)
      if (prevSeq !== null && row.seq !== undefined && row.seq !== null) {
        if (row.seq === prevSeq) return { ok: false, index: i, reason: 'rows-reordered', detail: 'two rows share seq ' + String(row.seq), verified: i - start, total: all.length, unverified: all.length - (i - start), keyed: c.keyed }
        if (row.seq < prevSeq) return { ok: false, index: i, reason: 'rows-reordered', detail: 'seq went backwards at row ' + i + ' (' + String(prevSeq) + ' → ' + String(row.seq) + ')', verified: i - start, total: all.length, unverified: all.length - (i - start), keyed: c.keyed }
        if (row.seq > prevSeq + 1) {
          // Classify the gap honestly: an extra row pushed in (its seq exceeds everything after it), a swap
          // (the expected next seq still exists later), or a removal (the expected seq is simply gone).
          const rest = all.slice(i + 1).filter((r) => r && typeof r.seq === 'number')
          const maxRest = rest.length ? Math.max(...rest.map((r) => r.seq)) : -Infinity
          const expectedLater = rest.some((r) => r.seq === prevSeq + 1)
          const reason = row.seq > maxRest ? 'row-inserted' : (expectedLater ? 'rows-reordered' : 'row-removed')
          return { ok: false, index: i, reason, detail: 'seq gap at row ' + i + ' (' + String(prevSeq) + ' → ' + String(row.seq) + '): ' + reason, verified: i - start, total: all.length, unverified: all.length - (i - start), keyed: c.keyed }
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
        const tailCode = (anchored || callerExpected) && i === all.length - 1 ? 'VMU_AUDIT_CHAIN_TRUNCATED' : null
        return { ok: false, code: tailCode, index: i, reason, detail: 'prevHash mismatch at row ' + i + ': expected ' + String(expectedPrev) + ' got ' + String(row.prevHash) + (reason === 'row-removed' && i === start ? ' (the GENESIS row is missing)' : ''), expected: String(expectedPrev), actual: String(row.prevHash), verified: i - start, total: all.length, unverified: all.length - (i - start), anchored, keyed: c.keyed }
      }
      // (c) the stored hash must equal the recomputation
      const recomputed = digestOf(rowPreimage(row, row.prevHash === undefined ? expectedPrev : row.prevHash))
      if (row.hash === undefined || row.hash === null) {
        return { ok: false, index: i, reason: 'hash-missing', detail: 'row ' + i + ' has no hash: it was never chained', verified: i - start, total: all.length, unverified: all.length - (i - start), keyed: c.keyed }
      }
      if (String(row.hash) !== String(recomputed)) {
        return { ok: false, index: i, reason: 'row-modified', detail: 'hash mismatch at row ' + i + ': stored ' + String(row.hash) + ' recomputed ' + String(recomputed), expected: String(recomputed), actual: String(row.hash), verified: i - start, total: all.length, unverified: all.length - (i - start), keyed: c.keyed }
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
    if ((anchored || callerExpected) && end === all.length) {
      if (expectHead !== undefined && expectHead !== null && String(expectHead) !== String(actualHead)) {
        return { ok: false, code: 'VMU_AUDIT_CHAIN_TRUNCATED', reason: 'tail-truncated', index: end > 0 ? end - 1 : 0,
          detail: 'chain head does not match the trusted checkpoint: expected ' + String(expectHead) + ' got ' + String(actualHead) + ' — the tail was removed or replaced',
          expected: String(expectHead), actual: String(actualHead), verified, total: all.length, unverified: 0, partial: false, anchored, anchoredTo: anchorSource, callerExpected, anchorVerified, anchorWired, keyed: c.keyed,
          note: 'TAIL MISMATCH: the verified rows are self-consistent, which is exactly why a trusted checkpoint is required' }
      }
      if (expectSeq !== undefined && expectSeq !== null && Number(expectSeq) !== Number(actualSeq)) {
        return { ok: false, code: 'VMU_AUDIT_CHAIN_TRUNCATED', reason: 'tail-truncated', index: end > 0 ? end - 1 : 0,
          detail: 'chain seq does not match the trusted checkpoint: expected ' + String(expectSeq) + ' got ' + String(actualSeq) + ' — rows were removed from the tail',
          expected: Number(expectSeq), actual: Number(actualSeq), verified, total: all.length, unverified: 0, partial: false, anchored, anchoredTo: anchorSource, callerExpected, anchorVerified, anchorWired, keyed: c.keyed }
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
      anchoredTo: anchorSource,
      callerExpected,
      anchorVerified,
      anchorWired,
      keyed: c.keyed,
      // (5) honesty: a partial check must never be reported as a full one, and neither a caller-supplied
      // expectation nor a wired-but-unused anchor may be presented as "a trusted checkpoint was verified".
      note: [
        anchorVerified
          ? 'anchorVerified: true — a trusted checkpoint was read back from the anchor seam (' + String(anchorSource) + ') and used for this verdict'
          : (callerExpected
            ? 'anchorVerified: false — the expectations came from the CALLER (callerExpected:true); no anchor was read back, so this is not a tamper-proof anchor check'
            : 'anchorVerified: false — no checkpoint was supplied or read back, so a truncated or fully rebuilt TAIL cannot be detected (accidental corruption only)'),
        (anchorWired && !anchorVerified ? 'NOTE: an anchor seam IS wired but useAnchor was false, so nothing was verified against it (pass useAnchor:true)' : null),
        partial ? 'PARTIAL: only rows ' + start + '..' + (end - 1) + ' were verified; ' + unverified + ' row(s) were NOT verified' : 'full chain verified (' + verified + ' row(s))',
        c.keyed ? 'keyed:true (MAC chain)' : 'keyed:false (plain sha256 chain: an attacker who can rewrite the log can recompute it)',
      ].filter(Boolean).join(' | '),
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
  function checkpoint({ rows = [], persist = false } = {}) {
    const all = Array.isArray(rows) ? rows : []
    const last = all.length ? all[all.length - 1] : null
    const base = !last
      ? { seq: null, hash: GENESIS, at: clock(), rows: 0, keyed: cfg().keyed, note: 'empty chain: the checkpoint is the genesis marker' }
      : { seq: last.seq === undefined ? null : last.seq, hash: last.hash === undefined ? null : String(last.hash), at: clock(), rows: all.length, keyed: cfg().keyed }
    // A1: the checkpoint value itself is MAC'd with the same injected sign seam, so a tampered anchor is
    // distinguishable from a tampered chain.
    const mac = cpMacOf(base)
    if (mac !== null) base.mac = mac
    if (!persist) {
      // NOTE: an unpersisted checkpoint must NOT move the observable "last checkpoint" state (reads that
      // change state are a bug); only a real persistence updates it.
      return { ...base, anchored: false, anchoredTo: null, note: (base.note ? base.note + ' | ' : '') + 'checkpoint NOT persisted externally: a truncated tail cannot be detected (pass persist:true with an anchor seam)' }
    }
    if (!hasAnchorWrite()) {
      // (2) no seam ⇒ say plainly that the checkpoint was NOT kept anywhere: do not pretend it was.
      return { ...base, anchored: false, anchoredTo: null, persisted: false, note: (base.note ? base.note + ' | ' : '') + 'checkpoint NOT persisted externally: a truncated tail cannot be detected (no anchor seam was injected)' }
    }
    anchorWrite(base)
    // Second copies: written, and a refusing mirror is a named failure (never a silent half-write).
    const written = []
    for (let i = 0; i < mirrorList().length; i++) {
      const m = mirrorList()[i]
      const label = mirrorNames()[i]
      if (typeof m.write !== 'function') throw refuse('VMU_AUDIT_CHAIN_ANCHOR_FAILED', 'mirror "' + label + '" has no write(): the checkpoint would exist in only one copy', 'give every mirror a write(cp)', { op: 'anchor-write', copy: label })
      const okWrite = m.write(base)
      if (okWrite === false) throw refuse('VMU_AUDIT_CHAIN_ANCHOR_FAILED', 'mirror "' + label + '" refused to persist the checkpoint', 'the copy was NOT stored; refusing rather than leaving a single copy', { op: 'anchor-write', copy: label })
      written.push(label)
    }
    lastCheckpointAt = base.at
    lastCheckpointSeq = base.seq
    if (bus && typeof bus.emit === 'function') bus.emit('auditchain/anchored', { hash: base.hash, seq: base.seq, at: base.at, mirrors: written })
    return { ...base, anchored: true, anchoredTo: anchorName(), persisted: true, mirrors: written, note: 'checkpoint persisted to the anchor seam' + (written.length ? ' + ' + written.length + ' mirror(s)' : '') + ': a truncated or replaced tail is now detectable' }
  }

  /** Read-only status. Says plainly whether the chain can be built and HOW STRONG it is.
   *  `mac` NEVER contains key material — only a reference, an algorithm and a fingerprint (task-141). */
  const status = () => ({
    hasher: typeof sign === 'function' ? 'sign(hmac)' : (macConfigured() ? ((macCache && macCache.ok) ? 'macKey(HMAC-SHA256)' : 'macKey(UNRESOLVED: fail-closed, retryable)') : (typeof hash === 'function' ? 'hash' : 'none')),
    chainable: typeof hash === 'function' || typeof sign === 'function' || macConfigured(),
    keyed: cfg().keyed,
    mac: macInfo(),
    mirrorNames: mirrorNames(),
    mirrors: mirrorList().length,
    checkpointEvery: cfg().checkpointEvery,
    checkpointTriggers,
    checkpointFailures,
    lastCheckpointAt,
    checkpointSeq: lastCheckpointSeq,
    anchorLagMs: lastCheckpointAt === null ? null : Math.max(0, clock() - lastCheckpointAt),
    rows: chain.length,
    anchor: hasAnchorWrite() ? (hasAnchorRead() ? 'read-write (' + anchorName() + ')' : 'write-only (' + anchorName() + ')') : 'none',
    anchorNote: hasAnchorRead() ? null : 'no readable anchor: a truncated tail cannot be detected (persisting a checkpoint alone is not enough)',
    strength: cfg().keyed ? 'keyed MAC chain (resists recomputation by an attacker without the key)' : (typeof hash === 'function' ? 'plain sha256 chain (accidental corruption only: anyone can recompute it)' : 'none'),
    tamperProof: cfg().keyed,
    keyedNote: cfg().keyed
      ? 'keyed:true — row digests and the checkpoint MAC are HMAC-SHA256; a rewrite needs the key, and key material is never logged or exposed'
      : 'keyed:false — this chain is UNKEYED: it detects ACCIDENTAL corruption only, because anyone who can rewrite the log can recompute the whole chain (wire macKey, or a sign seam, to make it tamper-resistant)',
    note: (typeof hash === 'function' || typeof sign === 'function' || macConfigured()) ? null : 'no hash seam: appends and verification will refuse by name (no fake hashes)',
    policy: cfg(),
    genesis: GENESIS,
    failureReasons: CHAIN_FAILURES.slice(),
  })

  return { apiVersion, append, verifyChain, link, checkpoint, status, refresh: refreshMac }
}

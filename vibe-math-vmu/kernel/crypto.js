// vmu kernel crypto — signing and non-repudiation (docs/20 §6; append-only is referenced, not redefined).
// `signer` is an INJECTED seam: without it every sign/verify refuses BY NAME and NO signature is ever
// fabricated. Verification failures are four DISTINGUISHABLE named reasons (bad signature / payload
// mismatch / unknown key / expired key). Rotation is traceable (who/why/when) and retires old keys
// instead of deleting them, so historical signatures still verify. Private key material is never returned.
// Codes: VMU_CRYPTO_UNAVAILABLE / VMU_CRYPTO_NO_KEY / VMU_CRYPTO_VERIFY_FAILED / VMU_CRYPTO_KEY_UNKNOWN /
//        VMU_CRYPTO_KEY_EXPIRED / VMU_CRYPTO_SIGNATURE_MISMATCH / VMU_CRYPTO_PAYLOAD_MISMATCH (03-§8).

export const apiVersion = 1

/** The four distinguishable verification failure reasons. */
export const VERIFY_FAILURES = Object.freeze(['signature-mismatch', 'payload-mismatch', 'key-unknown', 'key-expired'])

/** Key lifecycle states. Old keys are `retired`, never deleted. */
export const KEY_STATES = Object.freeze(['active', 'retired', 'revoked'])

export function refuse(code, message, hint, extra) {
  const err = new Error(message)
  err.code = code
  err.hint = hint
  if (extra) Object.assign(err, extra)
  return err
}

import { createHash } from 'node:crypto'

const intOr = (v, d) => (Number.isInteger(v) && v >= 0 ? v : d)
const digestOf = (payload) => createHash('sha256').update(typeof payload === 'string' ? payload : JSON.stringify(payload === undefined ? null : payload)).digest('hex')

/** Strip anything that looks like private key material before returning it to a caller. */
export function publicView(key) {
  const out = {}
  for (const [k, v] of Object.entries(key || {})) {
    if (/private|secret|seed|pem|dk|sk/i.test(k)) continue
    out[k] = v
  }
  return out
}

export function createCrypto({ clock = () => Date.now(), log = () => {}, settings = {}, bus = null, signer = null, listCap = 100 } = {}) {
  const keys = new Map()      // keyId -> { keyId, state, createdAt, retiredAt, retiredBy, reason, expiresAt, algorithm }
  const signatures = []       // append-only log of signatures (envelopes, no material)
  let dropped = 0
  let seq = 0

  const cfg = () => ({
    requireSigner: settings['vmu.crypto.requireSigner'] !== false,
    keyTtlMs: intOr(settings['vmu.crypto.keyTtlMs'], 0),                    // 0 = no automatic expiry
    signingKeyId: settings['vmu.crypto.signingKeyId'] || null,
    algorithm: settings['vmu.crypto.algorithm'] || 'ed25519',
    allowUnsignedVerify: settings['vmu.crypto.allowUnsignedVerify'] === true,
  })

  const keyState = (keyId) => {
    const k = keys.get(keyId)
    if (!k) return { known: false, expired: false, key: null }
    const expired = k.expiresAt !== null && k.expiresAt !== undefined && clock() > k.expiresAt
    return { known: true, expired, key: k }
  }

  /** The only place the seam is called. No seam ⇒ named refusal, never a fabricated signature. */
  function callSigner(op, args) {
    if (typeof signer !== 'function') {
      throw refuse('VMU_CRYPTO_UNAVAILABLE', 'no signer was injected: ' + op + ' cannot be performed and no signature will be invented',
        'wire it with createCrypto({ signer }) (the host/plugin owns the key material)', { op })
    }
    return signer({ op, ...args, at: clock() })
  }

  /** sign(): freeze an envelope that references a key id — never key material. */
  function sign({ payload, keyId = null, purpose = null, by = null } = {}) {
    const c = cfg()
    // The seam is checked FIRST: without it nothing can be signed, whatever the key state says.
    if (typeof signer !== 'function') {
      throw refuse('VMU_CRYPTO_UNAVAILABLE', 'no signer was injected: sign cannot be performed and no signature will be invented',
        'wire it with createCrypto({ signer }) (the host/plugin owns the key material)', { op: 'sign' })
    }
    if (payload === undefined) throw refuse('VMU_CRYPTO_NO_KEY', 'sign needs a payload', 'pass payload:<object|string>', { missing: ['payload'] })
    // Key resolution order: explicit keyId → configured signingKeyId → the currently ACTIVE key.
    const activeKey = [...keys.values()].find((k) => k.state === 'active')
    const kid = keyId || c.signingKeyId || (activeKey ? activeKey.keyId : null)
    if (!kid) throw refuse('VMU_CRYPTO_NO_KEY', 'no signing key configured', 'pass keyId, or set vmu.crypto.signingKeyId', { missing: ['keyId'] })
    const st = keyState(kid)
    if (!st.known) {
      // A key that the adapter has not registered cannot be used: register/rotate it first.
      throw refuse('VMU_CRYPTO_KEY_UNKNOWN', 'unknown signing key: ' + String(kid), 'register the key via rotate({keyId}) first', { keyId: kid })
    }
    if (st.key.state === 'revoked') throw refuse('VMU_CRYPTO_KEY_EXPIRED', 'signing key ' + kid + ' is revoked', 'rotate to a new key', { keyId: kid })
    if (st.expired) throw refuse('VMU_CRYPTO_KEY_EXPIRED', 'signing key ' + kid + ' expired at ' + st.key.expiresAt + ' (now=' + clock() + ')', 'rotate to a fresh key', { keyId: kid })
    const payloadDigest = digestOf(payload)
    const out = callSigner('sign', { keyId: kid, payloadDigest, purpose })
    const signature = out && (out.signature || out.sig)
    if (!signature) throw refuse('VMU_CRYPTO_UNAVAILABLE', 'the injected signer returned no signature', 'the seam must return { signature }', { keyId: kid })
    const envelope = { v: 1, keyId: kid, algorithm: (out && out.algorithm) || c.algorithm, payloadDigest, purpose, signature: String(signature), at: clock(), by: by || null, seq: ++seq }
    signatures.push(envelope)
    if (bus && typeof bus.emit === 'function') bus.emit('crypto/signed', { keyId: kid, purpose, seq: envelope.seq })
    return { ...envelope }
  }

  /**
   * verify(): FOUR distinguishable named failures. Without a seam it refuses (never `ok:true`), unless
   * `vmu.crypto.allowUnsignedVerify` is explicitly on — and even then it says `verified:false`.
   */
  function verify({ envelope, payload = undefined } = {}) {
    if (!envelope || typeof envelope !== 'object') throw refuse('VMU_CRYPTO_VERIFY_FAILED', 'verify needs an envelope', 'pass the object returned by sign()', { reason: 'malformed-envelope' })
    if (typeof signer !== 'function') {
      if (cfg().allowUnsignedVerify) return { ok: false, verified: false, reason: 'no-signer', hint: 'vmu.crypto.allowUnsignedVerify=true: the envelope was NOT verified' }
      throw refuse('VMU_CRYPTO_UNAVAILABLE', 'no signer was injected: nothing can be verified (a verification claim would be a lie)',
        'wire createCrypto({ signer }); set vmu.crypto.allowUnsignedVerify=true only if you accept an unverified answer', { reason: 'no-signer' })
    }
    const st = keyState(envelope.keyId)
    if (!st.known) throw refuse('VMU_CRYPTO_KEY_UNKNOWN', 'verification key is unknown: ' + String(envelope.keyId), 'retired keys stay registered, so an unknown key means it was never registered', { reason: 'key-unknown', keyId: envelope.keyId })
    if (st.expired) throw refuse('VMU_CRYPTO_KEY_EXPIRED', 'verification key ' + envelope.keyId + ' expired at ' + st.key.expiresAt + ' (now=' + clock() + ')', 'historical signatures remain verifiable, but expiry is reported as its own failure', { reason: 'key-expired', keyId: envelope.keyId })
    if (payload !== undefined) {
      const d = digestOf(payload)
      if (d !== envelope.payloadDigest) {
        throw refuse('VMU_CRYPTO_PAYLOAD_MISMATCH', 'payload digest does not match the envelope (envelope=' + envelope.payloadDigest + ' actual=' + d + ')',
          'the payload was modified after signing', { reason: 'payload-mismatch', keyId: envelope.keyId, expected: envelope.payloadDigest, actual: d })
      }
    }
    const out = callSigner('verify', { keyId: envelope.keyId, envelope, payloadDigest: envelope.payloadDigest, signature: envelope.signature })
    const good = !!(out && (out.ok === true || out.valid === true))
    if (!good) {
      throw refuse('VMU_CRYPTO_SIGNATURE_MISMATCH', 'signature does not match for key ' + envelope.keyId,
        'the signer rejected the signature', { reason: 'signature-mismatch', keyId: envelope.keyId })
    }
    return { ok: true, verified: true, keyId: envelope.keyId, at: clock(), state: st.key.state }
  }

  /** rotate(): register a new key and RETIRE the previous one (traceable; never deleted). */
  function rotate({ keyId, reason = '', by = null, expiresAt = null } = {}) {
    if (!keyId) throw refuse('VMU_CRYPTO_NO_KEY', 'rotate needs keyId', 'pass keyId:<new-key-id>', { missing: ['keyId'] })
    const c = cfg()
    const prevActive = [...keys.values()].find((k) => k.state === 'active')
    const ttl = c.keyTtlMs > 0 ? clock() + c.keyTtlMs : null
    keys.set(String(keyId), { keyId: String(keyId), state: 'active', createdAt: clock(), retiredAt: null, retiredBy: null, reason: null, expiresAt: expiresAt !== null ? expiresAt : ttl, algorithm: c.algorithm })
    if (prevActive && prevActive.keyId !== String(keyId)) {
      prevActive.state = 'retired'
      prevActive.retiredAt = clock()
      prevActive.retiredBy = by
      prevActive.reason = String(reason || '')
    }
    if (bus && typeof bus.emit === 'function') bus.emit('crypto/rotated', { keyId: String(keyId), retired: prevActive ? prevActive.keyId : null, at: clock() })
    log('crypto: key ' + keyId + ' active' + (prevActive ? '; retired ' + prevActive.keyId + ' (' + (reason || 'no reason') + ')' : ''))
    return { active: String(keyId), retired: prevActive ? prevActive.keyId : null, at: clock(), by: by || null, reason: String(reason || '') }
  }

  /** Read-only views. Never includes private material, and every truncation is counted. */
  const keysView = () => {
    const all = [...keys.values()].map((k) => publicView({ ...k, expired: k.expiresAt !== null && k.expiresAt !== undefined && clock() > k.expiresAt }))
    if (all.length <= listCap) return { items: all, total: all.length, dropped: 0 }
    return { items: all.slice(0, listCap), total: all.length, dropped: all.length - listCap }
  }
  const status = () => {
    const active = [...keys.values()].filter((k) => k.state === 'active').length
    const retired = [...keys.values()].filter((k) => k.state === 'retired').length
    return { signer: typeof signer === 'function' ? 'injected' : 'none', keys: keys.size, active, retired, signatures: signatures.length, dropped, policy: cfg(), failureReasons: VERIFY_FAILURES.slice(), keyStates: KEY_STATES.slice() }
  }

  return { apiVersion, sign, verify, keys: keysView, rotate, status }
}

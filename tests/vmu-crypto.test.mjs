// tests/vmu-crypto.test.mjs — kernel/crypto.js (batch-5 slice 2).
// Scenarios: no signer ⇒ named refusal and NO fabricated signature; four DISTINGUISHABLE verification
// failures; verify never claims ok:true without a seam; rotation is traceable and old signatures still
// verify; no private material is ever returned; zero-mechanism; determinism.
import { createCrypto, VERIFY_FAILURES, KEY_STATES } from '../vibe-math-vmu/kernel/crypto.js'

let pass = 0, fail = 0
const ok = (cond, label) => { if (cond) { pass++ } else { fail++; console.log('FAIL ' + label) } }
const rejects = (fn) => { try { fn(); return { threw: false } } catch (e) { return { threw: true, code: e && e.code, reason: e && e.reason, msg: String(e && e.message), hint: e && e.hint } } }

let now = 1000
// A deterministic fake signer: the signature is a function of (keyId, payloadDigest), so tampering shows up.
const mkSigner = () => {
  const calls = []
  const fn = ({ op, keyId, payloadDigest, signature }) => {
    calls.push(op + ':' + keyId)
    if (op === 'sign') return { signature: 'sig(' + keyId + '|' + payloadDigest + ')', algorithm: 'fake' }
    const expected = 'sig(' + keyId + '|' + payloadDigest + ')'
    return { ok: signature === expected }
  }
  fn.calls = calls
  return fn
}

// 1) no signer: sign refuses by name and NOTHING is fabricated
{
  const c = createCrypto({ clock: () => now })
  const r = rejects(() => c.sign({ payload: { a: 1 }, keyId: 'k1' }))
  ok(r.threw && r.code === 'VMU_CRYPTO_UNAVAILABLE' && !!r.hint, 'no signer ⇒ named refusal + hint')
  ok(c.status().signatures === 0 && c.status().signer === 'none', 'no signer ⇒ nothing produced')
}

// 2) zero-mechanism: no keys configured ⇒ sign refuses by name (not a crash)
{
  const c = createCrypto({ clock: () => now, signer: mkSigner() })
  const r = rejects(() => c.sign({ payload: { a: 1 } }))
  ok(r.threw && r.code === 'VMU_CRYPTO_NO_KEY', 'no key configured ⇒ VMU_CRYPTO_NO_KEY')
  ok(rejects(() => c.sign({ keyId: 'k1' })).code === 'VMU_CRYPTO_NO_KEY', 'no payload ⇒ named refusal')
}

// 3) happy path: rotate registers a key, sign produces an envelope that references the key id only
{
  const signer = mkSigner()
  const c = createCrypto({ clock: () => now, signer })
  const rot = c.rotate({ keyId: 'k1', reason: 'initial', by: 'admin' })
  ok(rot.active === 'k1' && rot.retired === null && rot.at === 1000, 'rotate registers the first key with a trace')
  const env = c.sign({ payload: { a: 1 }, purpose: 'audit', by: 'acad' })
  ok(env.keyId === 'k1' && env.algorithm === 'fake' && typeof env.payloadDigest === 'string' && env.at === 1000, 'envelope carries keyId/digest/at(clock)')
  ok(!('privateKey' in env) && !('secret' in env) && JSON.stringify(env).indexOf('PRIVATE') === -1, 'envelope carries no private material')
  ok(c.verify({ envelope: env, payload: { a: 1 } }).ok === true, 'verify accepts the untouched payload')
}

// 4) the FOUR distinguishable verification failures
{
  const signer = mkSigner()
  const c = createCrypto({ clock: () => now, signer })
  c.rotate({ keyId: 'k1' })
  const env = c.sign({ payload: { a: 1 } })
  // (a) signature mismatch
  const tampered = { ...env, signature: 'sig(k1|deadbeef)' }
  const a = rejects(() => c.verify({ envelope: tampered, payload: { a: 1 } }))
  ok(a.threw && a.code === 'VMU_CRYPTO_SIGNATURE_MISMATCH' && a.reason === 'signature-mismatch', 'failure 1: signature mismatch (distinguishable)')
  // (b) payload mismatch
  const b = rejects(() => c.verify({ envelope: env, payload: { a: 2 } }))
  ok(b.threw && b.code === 'VMU_CRYPTO_PAYLOAD_MISMATCH' && b.reason === 'payload-mismatch', 'failure 2: payload mismatch (distinguishable)')
  // (c) unknown key
  const cUnknown = rejects(() => c.verify({ envelope: { ...env, keyId: 'ghost' }, payload: { a: 1 } }))
  ok(cUnknown.threw && cUnknown.code === 'VMU_CRYPTO_KEY_UNKNOWN' && cUnknown.reason === 'key-unknown', 'failure 3: unknown key (distinguishable)')
  // (d) expired key
  const e = createCrypto({ clock: () => now, signer, settings: { 'vmu.crypto.keyTtlMs': 100 } })
  e.rotate({ keyId: 'short' })
  const env2 = e.sign({ payload: { b: 1 } })
  now = 5000
  const d = rejects(() => e.verify({ envelope: env2, payload: { b: 1 } }))
  ok(d.threw && d.code === 'VMU_CRYPTO_KEY_EXPIRED' && d.reason === 'key-expired', 'failure 4: expired key (distinguishable)')
  now = 1000
  ok(VERIFY_FAILURES.length === 4 && new Set([a.reason, b.reason, cUnknown.reason, d.reason]).size === 4, 'the four reasons are pairwise distinct')
}

// 5) verify() NEVER claims ok:true without a seam
{
  const c = createCrypto({ clock: () => now })
  const r = rejects(() => c.verify({ envelope: { keyId: 'k1', payloadDigest: 'x', signature: 'y' } }))
  ok(r.threw && r.code === 'VMU_CRYPTO_UNAVAILABLE', 'no seam ⇒ verify refuses (never a false ok:true)')
  const permissive = createCrypto({ clock: () => now, settings: { 'vmu.crypto.allowUnsignedVerify': true } })
  const v = permissive.verify({ envelope: { keyId: 'k1', payloadDigest: 'x', signature: 'y' } })
  ok(v.ok === false && v.verified === false && v.reason === 'no-signer', 'explicit opt-in still says verified:false')
}

// 6) rotation: traceable, old key RETIRED (not deleted), historical signatures still verify
{
  const signer = mkSigner()
  const c = createCrypto({ clock: () => now, signer })
  c.rotate({ keyId: 'k1', reason: 'initial' })
  const old = c.sign({ payload: { x: 1 } })
  now = 2000
  const rot = c.rotate({ keyId: 'k2', reason: 'scheduled rotation', by: 'admin' })
  ok(rot.active === 'k2' && rot.retired === 'k1' && rot.at === 2000 && rot.reason === 'scheduled rotation', 'rotation trace has who/why/when')
  const ks = c.keys()
  const k1 = ks.items.find((k) => k.keyId === 'k1')
  ok(k1 && k1.state === 'retired' && k1.retiredBy === 'admin' && k1.retiredAt === 2000, 'old key is retired with a trace (not deleted)')
  ok(c.status().active === 1 && c.status().retired === 1, 'status counts active vs retired')
  ok(c.verify({ envelope: old, payload: { x: 1 } }).ok === true, 'a historical signature still verifies after rotation')
  ok(c.verify({ envelope: old, payload: { x: 1 } }).state === 'retired', 'verification reports the retired state')
  now = 1000
}

// 7) revoked keys cannot sign; expired keys cannot sign
{
  const c = createCrypto({ clock: () => now, signer: mkSigner(), settings: { 'vmu.crypto.keyTtlMs': 50 } })
  c.rotate({ keyId: 'k1' })
  now = 9000
  const r = rejects(() => c.sign({ payload: { a: 1 }, keyId: 'k1' }))
  ok(r.threw && r.code === 'VMU_CRYPTO_KEY_EXPIRED', 'expired key cannot sign')
  now = 1000
  const r2 = rejects(() => c.sign({ payload: { a: 1 }, keyId: 'never-registered' }))
  ok(r2.threw && r2.code === 'VMU_CRYPTO_KEY_UNKNOWN', 'unregistered key cannot sign')
}

// 8) no private material anywhere; counted truncation on keys(); read-only views
{
  const c = createCrypto({ clock: () => now, signer: mkSigner(), listCap: 2 })
  c.rotate({ keyId: 'k1' })
  c.rotate({ keyId: 'k2' })
  c.rotate({ keyId: 'k3' })
  const kv = c.keys()
  ok(kv.items.length === 2 && kv.total === 3 && kv.dropped === 1, 'keys() truncation is counted')
  const blob = JSON.stringify({ keys: c.keys(), status: c.status() })
  ok(!/private|secret|seed|BEGIN [A-Z ]*PRIVATE KEY/i.test(blob), 'no private material in any read-only view')
  const before = JSON.stringify({ k: c.keys(), s: c.status() })
  c.keys(); c.status()
  ok(JSON.stringify({ k: c.keys(), s: c.status() }) === before, 'reads are side-effect free')
  ok(KEY_STATES.join('|') === 'active|retired|revoked', 'key states constant')
}

// 9) determinism: the injected clock drives envelope.at and expiry, and the fake signer is pure
{
  const signer = mkSigner()
  const c = createCrypto({ clock: () => 4242, signer })
  c.rotate({ keyId: 'k1' })
  const e1 = c.sign({ payload: { q: 1 } })
  ok(e1.at === 4242, 'envelope timestamp comes from the injected clock')
  const c2 = createCrypto({ clock: () => 4242, signer: mkSigner() })
  c2.rotate({ keyId: 'k1' })
  const e2 = c2.sign({ payload: { q: 1 } })
  ok(e1.payloadDigest === e2.payloadDigest && e1.signature === e2.signature, 'same input ⇒ same digest and signature (deterministic seam)')
  ok(signer.calls.filter((x) => x === 'verify:k1').length === 0, 'verify was only called when asked')
}

console.log('=== VMU CRYPTO: ' + pass + ' passed, ' + fail + ' failed ===')
process.exit(fail ? 1 : 0)

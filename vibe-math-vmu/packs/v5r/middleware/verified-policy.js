/**
 * packs/v5r/middleware/verified-policy.js — THE V5R VERIFIED-TRACK POLICY AS A PACK-OWNED STATUS SECTION (TB-2794 Step 2).
 *
 * WHY THIS FILE EXISTS: `vmu.verified.requireMachineWarrant` is an INSTITUTION decision (does this institute accept a
 * social/unanimous-debate warrant as a judge, or only machine-checked/literature evidence?). The framework used to read
 * that setting in `kernel/index.js` and project the policy into `status()` — framework mechanism naming a research policy.
 * The reading moves HERE: the pack registers a status section through the EXISTING `vmu.status` seam
 * (`registerSection(name, reader) -> disposer`), so:
 *   · the kernel no longer reads `vmu.verified.*` at all (C#5/C#7);
 *   · a deployment without this pack has NO such section (absent is honest, not an empty object);
 *   · unload removes it through the module's `dispose()` contract (no stale section survives a pack unload).
 *
 * The reader is asked at READ TIME and reads the live setting accessor the loader hands the factory, so a runtime
 * `vibe_v5_set` is reflected immediately. Field names/meanings are the SAME object the kernel used to project — the
 * migration moves the owner, not the contract.
 */
let disposer = null

/** The policy reading; one shape, one place (formerly kernel/index.js's inline status block). */
export function verifiedWarrantPolicyOf(setting) {
  const read = (key) => { try { return typeof setting === 'function' ? setting(key) : undefined } catch { return undefined } }
  const req = read('vmu.verified.requireMachineWarrant') === true
  return {
    requireMachineWarrant: req,
    machineOrLiterature: req,
    machineCheckedOnly: false,
    literaturePolicy: { kind: 'human-reviewed-citation', measured: false,
      means: 'policy declaration, NOT a measurement: a literature warrant is human-reviewed evidence by this institute policy; the product cannot verify a human read the source' },
    acceptedKinds: req ? ['lean-conformance', 'literature'] : ['debate-unanimous', 'lean-conformance', 'literature'],
    setting: 'vmu.verified.requireMachineWarrant',
    source: req
      ? 'vmu.verified.requireMachineWarrant=true: machine-checked (lean-conformance) OR literature citations settle a conclusion — a citation is HUMAN-reviewed evidence, not a machine proof, so this policy is NOT machine-checked-only; a social vote is refused'
      : 'the default (vmu.verified.requireMachineWarrant=false): a SOCIAL warrant (debate-unanimous) is accepted as a judge — agreement is not proof of correctness, so set the setting to true to require machine-checked/literature evidence',
  }
}

/** The load-time factory the loader calls with the capability-gated `services` and the live `setting` accessor. */
export function installVerifiedPolicy({ services, setting } = {}) {
  if (!services || typeof services.get !== 'function') {
    return { ok: false, code: 'VMU_ENGINE_UNAVAILABLE', registered: false, reason: 'the loader passed no capability-gated services accessor' }
  }
  let statusService = null
  try { statusService = services.get('vmu.status') } catch (e) {
    return { ok: false, code: (e && e.code) || 'VMU_NOT_PERMITTED', registered: false, reason: String((e && e.message) || e) }
  }
  if (!statusService || typeof statusService.registerSection !== 'function') {
    return { ok: false, code: 'VMU_ENGINE_UNAVAILABLE', registered: false, reason: 'this assembly publishes no vmu.status registerSection' }
  }
  try {
    disposer = statusService.registerSection('verifiedWarrantPolicy', () => verifiedWarrantPolicyOf(setting))
  } catch (e) {
    disposer = null
    return { ok: false, code: (e && e.code) || 'VMU_ENGINE_UNAVAILABLE', registered: false, reason: String((e && e.message) || e) }
  }
  return { ok: true, registered: true, section: 'verifiedWarrantPolicy', disposable: typeof disposer === 'function' }
}

/** The unload contract: remove the section (safe to call twice). */
export function disposeVerifiedPolicy() {
  if (typeof disposer !== 'function') return { ok: true, cleared: false, note: 'nothing was registered by this module' }
  const d = disposer
  disposer = null
  return { ok: true, cleared: true, result: d() }
}

/** The M2 module object `kernel/pack.js` hands to `kernel/loader.js`. */
export const V5R_VERIFIED_POLICY = Object.freeze({
  meta: Object.freeze({ id: 'v5r.verified-policy', apiVersion: 1 }),
  // `trigger-workflow` is the framework's existing capability gate for reaching services (this module registers a
  // status section; it does not drive turns).
  capabilities: Object.freeze(['trigger-workflow']),
  // The loader requires at least one REGISTERED hook. This module has no bus work of its own: a no-op on a registered
  // topic keeps the module contract valid without inventing a second observation point.
  hooks: Object.freeze({ 'turn/reply-parsed': async () => undefined }),
  default: installVerifiedPolicy,
  dispose: disposeVerifiedPolicy,
})

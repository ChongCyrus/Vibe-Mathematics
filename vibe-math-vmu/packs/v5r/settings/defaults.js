/**
 * THE v5r PACK'S OWN SETTINGS DEFAULTS (goal 2: the integration pack folder).
 *
 * A pack is the place where a particular INSTITUTION lives, and part of an institution is what it
 * wants the knobs to be. Keeping those wants here rather than inside the framework is the whole
 * point: the framework states what CAN be set (settings/schema.js), and the pack states what it
 * PREFERS, while a deployment may override either.
 *
 * Every key named here must exist in settings/schema.js. The gate checks that, because a default
 * for a key nobody declared is a typo that would otherwise fail silently.
 */
export const V5R_SETTING_DEFAULTS = Object.freeze({
  // Which reply catalogue the original really sent: the delivered-prompt corpus carries the compact
  // form, so that is the pack's preference. The full catalogue stays available by setting.
  'vmu.turn.replyCatalogue': 'compact',
  // The three optional blocks the source gates. On is the source's default: a deployment that never
  // configured them gets the full prompt.
  'vmu.pointer.propagation': true,
  'vmu.resources.selfCheck': true,
  'vmu.turn.feedback': true,
  // Where the protocol lives, named by the compact catalogue. A path, not a hard-coded string.
  'vmu.turn.protocolPath': 'Shared/Protocol.md',
})

/** The keys this pack wants set, for a deployment that wants to diff its own overrides. */
export const V5R_SETTING_KEYS = Object.freeze(Object.keys(V5R_SETTING_DEFAULTS))

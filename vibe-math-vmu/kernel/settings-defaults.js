// settings-defaults.js — PHASE 6 / goal 3 (P0): THE ONE reader for "a declared setting, or its declared default".
//
// WHY THIS FILE EXISTS. The kernel does not materialise schema defaults into the settings object (that is deliberate:
// a resolved default is still distinguishable from an operator's value). So every consumer that reads a setting may
// see `undefined`. MEASURED this phase: FOUR doors each invented their own fallback and THREE of them disagreed with
// the declaration:
//   · kernel/library.js        storeMode      raw read => 'full'  while the schema says 'diff'
//   · kernel/retention.js      storeMode      raw read => 'full'  while the schema says 'diff'
//   · kernel/index.js          quote caps     raw read => 0      while the schema says 2 / 3
//   · kernel/rules.js (M1)     setting: pred  raw read => undefined, so a rule written against the declared default
//                              silently never matches, while the M2 api.setting() already fell back.
// Four copies of "what is the default" is how a fifth grows. This module is the single answer: the declared default
// comes from SETTING_DEFS (settings/schema.js), never from a literal written beside a read.
//
// CONTRACT:
//   · readSetting(settings, key) -> the configured value when the object carries it, otherwise the DECLARED default,
//     otherwise `undefined` for a key the schema does not declare (a caller that requires a declaration says so itself).
//   · Read-only: it never writes, never materialises, never mutates the settings object or a live Proxy view.
import { SETTING_DEFS } from '../settings/schema.js'

const BY_KEY = new Map(SETTING_DEFS.map((d) => [d.key, d]))

/** The declaration row for a key, or null (exported so callers can name the missing declaration). */
export function settingDeclaration(key) {
  return BY_KEY.get(String(key)) || null
}

/** The DECLARED default for a key — `undefined` when the schema does not declare it (or declares no `def`). */
export function declaredDefault(key) {
  const d = settingDeclaration(key)
  return d && Object.prototype.hasOwnProperty.call(d, 'def') ? d.def : undefined
}

/**
 * The value a consumer should act on: the configured value first, the declared default second.
 * A live view (kernel.settingsView) is read through its get trap, so this stays correct for runtime writes.
 */
export function readSetting(settings, key) {
  const k = String(key)
  if (settings && typeof settings === 'object') {
    let raw
    try { raw = settings[k] } catch (e) { raw = undefined }
    if (raw !== undefined) return raw
  }
  return declaredDefault(k)
}

/** The declaration rows this reader serves — for a gate/test that wants to prove the table is really loaded. */
export function declaredSettingKeys() {
  return SETTING_DEFS.map((d) => d.key)
}

/**
 * THE v5r PACK FOLDER (goal 2).
 *
 * This folder is the integration pack: the thing that, together with the framework in
 * `vibe-math-vmu/kernel/`, makes an actual running research institution. Its layout is the layout
 * the project's philosophy asks for:
 *
 *   settings/    what this pack wants the knobs to be (the framework declares what CAN be set)
 *   middleware/  the policy this pack adds at the framework's extension points
 *   prompts/     the prompt content (currently the four sibling modules, which move in over time)
 *   index.js     the manifest the framework loads: one object naming everything above
 *
 * The framework never contains institution-specific choices. If something here would be wrong for a
 * different institution, it does not belong in `kernel/` - it belongs in this folder.
 *
 * The four prompt modules still live one level up as `../v5r-*.js` while they are being moved in.
 * Re-exporting them here means the folder is already the single entry point, so a consumer can start
 * using `packs/v5r/index.js` today and the physical move becomes an internal detail.
 */
export * from './prompts/v5r-core.js'
export * from './prompts/v5r-charter.js'
export * from './prompts/v5r-prompts.js'
export * from './prompts/v5r-persona.js'

import { V5R_SETTING_DEFAULTS, V5R_SETTING_KEYS } from './settings/defaults.js'
import { decideSections, v5rPromptSwitchMiddleware, V5R_PROMPT_SWITCH_STATES } from './middleware/prompt-switches.js'

export { V5R_SETTING_DEFAULTS, V5R_SETTING_KEYS, decideSections, v5rPromptSwitchMiddleware, V5R_PROMPT_SWITCH_STATES }

/**
 * THE FOLDER-LEVEL RECORD, deliberately NOT named PACK: the pack manifest the loader consumes is exported by
 * `prompts/v5r-core.js` and carries the slots, tracks and sections. An explicit export beats a star re-export, so
 * naming this one PACK silently replaced the real manifest and the roster disappeared - a lesson kept in the name.
 *
 * The manifest, in the shape `kernel/pack.js` validates and applies: an id, a version, and the
 * lists the framework knows how to consume. `sections` and `bindings` are filled by the caller
 * (they are large arrays the sibling modules own); everything else is stated here.
 */
/**
 * THE PHASES THIS PACK ADDS TO THE FRAMEWORK'S SET.
 * `heartbeat` is institution vocabulary - it is the phase in which a member is told the institute has made no
 * progress - and the framework should not have to know the word. The pack names it and the loop accepts it.
 */
export const V5R_PHASES = Object.freeze(['heartbeat', 'paper-write', 'paper-review', 'paper-final'])

export const V5R_PACK = Object.freeze({
  id: 'v5r',
  version: '1.0.0',
  title: 'vibe-math-v5r institution',
  // The framework consumes these; see kernel/pack.js validatePack for the accepted fields.
  middleware: Object.freeze([v5rPromptSwitchMiddleware]),
  defaults: V5R_SETTING_DEFAULTS,
  // Declarative, for a reader and for a deployment that wants to diff: what this pack contributes.
  contributes: Object.freeze({
    settings: V5R_SETTING_KEYS,
    middleware: Object.freeze([v5rPromptSwitchMiddleware.id]),
    switchStates: V5R_PROMPT_SWITCH_STATES,
  }),
})

/** A short, printable description, so a deployment can log what it loaded without reading source. */

export function describeV5rPack() {
  return {
    id: V5R_PACK.id,
    version: V5R_PACK.version,
    title: V5R_PACK.title,
    settings: V5R_SETTING_KEYS.length,
    middleware: V5R_PACK.middleware.map((m) => m.id),
  }
}

/**
 * THE v5r PACK FOLDER (goal 2).
 *
 * This folder is the integration pack: the thing that, together with the framework in
 * `vibe-math-vmu/kernel/`, makes an actual running research institution. Its layout is the layout
 * the project's philosophy asks for, and it is the layout a second pack is meant to copy:
 *
 *   index.js     the folder's entry point: re-exports the manifest the framework loads, and states
 *                what this folder carries
 *   settings/    what this pack wants the knobs to be (defaults.json is the pure DATA the plugin
 *                reads before the kernel exists; defaults.js is this pack's own code view of it)
 *   middleware/  the policy this pack adds at the framework's extension points
 *   prompts/     the prompt content: four modules, plus the transcriptions of the delivered prompts
 *
 * The framework never contains institution-specific choices. If something here would be wrong for a
 * different institution, it does not belong in `kernel/` - it belongs in this folder.
 *
 * THE FOUR PROMPT MODULES ALREADY LIVE HERE, and this header used to say they were on their way. They
 * are `./prompts/v5r-{core,charter,prompts,persona}.js`, re-exported below so this file is the single
 * entry point for the folder. Two copies of the same two files existed for a while - one loose in
 * `packs/`, one here - and the generators were maintaining the copy nobody read; the header is now
 * written against what is on disk rather than against what was planned.
 */
export * from './prompts/v5r-core.js'
export * from './prompts/v5r-charter.js'
export * from './prompts/v5r-prompts.js'
export * from './prompts/v5r-persona.js'

// A star re-export does NOT put a name in this module's own scope, and `describeV5rPack` needs the LOADED manifest to
// report both ids - so the manifest is imported explicitly even though it is also re-exported two lines up.
import { PACK } from './prompts/v5r-core.js'
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

// THE FOLDER-LEVEL CONTRIBUTION RECORD, and the distinction is load-bearing: the manifest the LOADER consumes is `PACK`
// from `prompts/v5r-core.js` (star-re-exported above), which carries the slots, tracks, rules, codes and prompt text.
// This object is the folder's own statement of what it contributes. An explicit export beats a star re-export, so once
// naming this one `PACK` silently replaced the real manifest and the roster disappeared - a lesson kept in the name.
//
// THESE FIELDS ARE NOT THE LOADERS BUSINESS, so they are surfaced through `describeV5rPack()` instead of being left to
// look consumed. `validatePack` ignores unknown keys by design, which means a field on a loaded manifest that nothing
// reads fails SILENTLY - the exact hazard docs/10 warns about. The four below answer "what does this folder carry and
// where", the question a deployment asks before activating it, and the description is where they are readable.
export const V5R_PACK = Object.freeze({
  sectionModule: "./prompts/v5r-charter.js",
  phases: V5R_PHASES,
  policyModule: "./middleware/prompt-switches.js",
  noticeModule: "./notices.js",
  id: 'v5r',
  version: '1.0.0',
  title: 'vibe-math-v5r institution',
  // The framework consumes these; see kernel/pack.js validatePack for the accepted fields.
  // ROUND 596 — NOT MIDDLEWARE. This is a PROMPT-PIPELINE policy: its `on` is `prompt/assemble`, which is not a registered bus hook,
  // and its consumer is `sectionPolicy`, handed to createKernel. Declared under `middleware` it made pack.js give the entry to the bus,
  // which refuses anything that is not a rules entry without a handler or a file — so the whole pack's apply threw there, and the
  // policy was unreachable as a bus entry while being live as a pipeline policy. Its own field says which category it is.
  promptPolicies: Object.freeze([v5rPromptSwitchMiddleware]),
  defaults: V5R_SETTING_DEFAULTS,
  // Declarative, for a reader and for a deployment that wants to diff: what this pack contributes.
  contributes: Object.freeze({
    settings: V5R_SETTING_KEYS,
    promptPolicies: Object.freeze([v5rPromptSwitchMiddleware.id]),
    switchStates: V5R_PROMPT_SWITCH_STATES,
  }),
})

/**
 * A short, printable description, so a deployment can log what it loaded without reading source.
 *
 * THE KEYS HERE ARE THE KEYS OF `V5R_PACK`, ON PURPOSE. This description is the consumer for every field the LOADED
 * manifest cannot see, and a test asserts that invariant by name: every key of the folder record appears either in the
 * loaded manifest or in this object. Renaming a field on the way in - `sectionModule` arriving as `promptSections` -
 * would satisfy a reader and defeat the check, so the names are carried through unchanged and the grouping says which
 * is which. `defaults` and `contributes` were added when that check first ran and found them unread.
 */
export function describeV5rPack() {
  return {
    // THE CALLER MUST NAME THE MEETING STATE. The four meeting sections are injected only when the turn supplies
    // `meetingState: invited|first|others`; absent means none of them, deliberately, because guessing which speaker
    // situation a round is in would put the wrong instructions in front of a member. Nothing in this repository names
    // it outside the tests, so it is stated here as part of what the pack expects of its driver.
    meetingStateRequired: true,
    id: V5R_PACK.id,
    version: V5R_PACK.version,
    title: V5R_PACK.title,
    promptPolicies: V5R_PACK.promptPolicies.map((m) => m.id),
    // WHAT THIS FOLDER CARRIES AND WHERE, which is the question a deployment asks before activating it. The loaded
    // manifest cannot see these, so this is their consumer rather than a place for them to sit unnoticed.
    loadedManifestId: PACK.id,
    sectionModule: V5R_PACK.sectionModule,
    policyModule: V5R_PACK.policyModule,
    noticeModule: V5R_PACK.noticeModule,
    phases: V5R_PACK.phases,
    defaults: Object.keys(V5R_PACK.defaults || {}).length,
    contributes: V5R_PACK.contributes,
    settings: V5R_SETTING_KEYS.length,
  }
}

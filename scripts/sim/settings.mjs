// scripts/sim/settings.mjs — THE ONE SETTINGS SOURCE the simulator and the budget gate both measure from.
//
// WHY THIS FILE EXISTS (RUN 226 family: "a ruler that measured the wrong thing"). The prompt a seat receives is
// assembled from `{...settings, ...turn.facts}`, so a measurement is only a measurement of the deployed prompt if
// the SETTINGS LAYER IS THE SAME as the one the deployment passes. Two readers had drifted:
//
//   · `scripts/audit-prompt-budget.mjs` re-implemented the defaults by parsing `settings/schema.js` as TEXT with a
//     regular expression (a second opinion about the table, not the table);
//   · `scripts/sim/harness.mjs` imported `defaultsOf` from the schema module, which did not export it; the import
//     rejection was swallowed by `.catch` and the simulator assembled from `{}` - the same seat came out 1 300
//     characters shorter than the gate's number, and the simulator reported headroom that does not exist.
//
// So the defaults have ONE named reader (`defaultsOf` in the schema module, derived from SETTING_DEFS) and ONE
// prompt-geometry helper (here), used by both.
//
// ★ AND THE MODE KEY WAS WRONG TOO - THE SAME DEFECT ONE LINE LOWER. Both readers used to pin the mode as
// `'v5r.fixtureMode': 'tools'`. That key is UNDECLARED (the schema declares `vmu.v5r.fixtureMode`, and
// `packs/v5r/middleware/prompt-switches.js:145` reads exactly that name), so the pin never reached the section
// policy: both rulers measured the schema DEFAULT (`no-tools`) while their comments said "the deployed configuration
// runs tools". Measured on this tree: chair/verify assembles to 33 845 chars with the undeclared key and 35 440 with
// the declared one - the gate and the simulator agreed with each other and were both measuring the wrong prompt,
// which is worse than disagreeing because it looks like evidence. A settings layer is not a bag of labels: a key the
// schema does not declare is not applied, and pretending otherwise is how a ruler gets its own wrong number.
import { defaultsOf } from '../../vibe-math-vmu/settings/schema.js'

/**
 * The DECLARED key of the fixture-mode switch. Spelled once, next to the schema key it mirrors, because a typo here is
 * invisible: the section policy simply keeps its default and every measurement stays plausible.
 */
export const PROMPT_FIXTURE_KEY = 'vmu.v5r.fixtureMode'

/** The fixture mode the deployed v5r institute runs (`run-v5r-tools.ps1` declares `tools`; the schema default is
 * `no-tools`, i.e. "this round must not call tools", which is the opposite of the deployment's configuration). */
export const PROMPT_FIXTURE_MODE = 'tools'

/**
 * The settings layer a prompt is assembled under. `overrides` win (a scenario that declares a policy still measures
 * the prompt it declares), and nothing here invents a key: every value comes from the schema's own declaration.
 */
export function promptSettings(overrides = {}) {
  return Object.assign({}, defaultsOf(), { [PROMPT_FIXTURE_KEY]: PROMPT_FIXTURE_MODE }, overrides)
}

export { defaultsOf }

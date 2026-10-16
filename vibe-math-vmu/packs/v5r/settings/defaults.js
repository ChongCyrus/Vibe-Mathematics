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
 *
 * ★★ ROUND 4 / task-201 (P2-02) — THIS MODULE NO LONGER HOLDS A COPY OF THE VALUES.
 *
 * THE DEFECT THIS CLOSES: the 43 defaults used to be written out HERE as an object literal AND in
 * `./defaults.json` — two hand-written copies of one fact, and BOTH load-bearing: the runtime folds
 * `settings/defaults.json` (the entry joins `here` + `packs/<id>/settings/defaults.json`), while the
 * gate `scripts/audit-pack-value-domain.mjs` reads the JS symbol below. So a drift between the two
 * was invisible to BOTH readers — the runtime never saw the JS copy, the gate never saw the JSON —
 * which contradicts `01-R4` (a single source of settings).
 *
 * The fix DERIVES rather than asserts: an equality assertion would still leave two writers. The JSON
 * is now the ONE hand-written copy, and the symbols below are produced from it, so the gate and
 * `packs/v5r/index.js` keep working against exactly the shapes they already consume.
 */
// ★ READ THROUGH `createRequire`, NOT THROUGH `node:fs`, AND THAT IS NOT A STYLE CHOICE: the repo has a gate
// (`tests/audit-fs-purpose.test.mjs`) that requires EVERY direct `node:fs` importer to declare an `fs-purpose:` marker
// drawn from a CLOSED list of three sanctioned kinds (guard / audit / self-audit). Reading this pack's own defaults file
// is none of those three, and widening a gate's criterion to admit a new kind is a bigger decision than avoiding the
// import - so the JSON is pulled in as a module, which needs no filesystem import at all and keeps the single source.
import { createRequire } from 'node:module'

/** The single hand-written copy lives next door; this module only reads it. */
const require_ = createRequire(import.meta.url)
const parsed = require_('./defaults.json')
const defaults = parsed && typeof parsed.defaults === 'object' && parsed.defaults ? parsed.defaults : {}

/**
 * The pack's preferred values. ★ Frozen, as before, so a consumer cannot mutate the fold's input by
 * accident. ★ The NAME is unchanged on purpose: `scripts/audit-pack-value-domain.mjs:74` matches this
 * symbol BY NAME, and `packs/v5r/index.js:32` imports it — deriving the value must not rename it.
 */
export const V5R_SETTING_DEFAULTS = Object.freeze(Object.assign({}, defaults))

/** The keys this pack wants set, for a deployment that wants to diff its own overrides. */
export const V5R_SETTING_KEYS = Object.freeze(Object.keys(V5R_SETTING_DEFAULTS))

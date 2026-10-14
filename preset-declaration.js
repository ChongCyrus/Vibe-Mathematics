// dsh-vibe-math preset declarations — the row module for DSH >= 0.1.7.
//
// WHY THIS EXISTS (and why it is not `@deepseek-ai/dsh-agent-preset`):
// A DSH agent preset is declared as a composition row whose config is `{id, name, description, order,
// plugins}`. On the current line that row's module is `@deepseek-ai/dsh-agent-preset`, which simply
// calls `agentPresets.register(config)`. This package serves BOTH DSH lines from one bundle:
//
//   * DSH >= 0.1.7 — presets are composition rows. presets/vibe-math-v{2,3,4,5}.patch.yml declare one
//     row per preset whose module is THIS file, and the code below performs exactly the registration
//     `@deepseek-ai/dsh-agent-preset` performs. Naming our own module (instead of the host package)
//     is what makes the same bundle installable on the older line: a row naming a package that does
//     not exist there fails to import and is reported as an activation failure on every boot.
//   * DSH <= 0.1.6 — presets are directories under <DSH_HOME>/.agent-presets, written by installer.js,
//     and the composition those presets mount names packages that only the older line ships
//     (`@deepseek-ai/dsh-workflow-worker-thread`). Treat "this module registers nothing here" as a
//     LATENT RISK this branch guards against, NOT as an observed fact: "there is no `agentPresets`
//     service on that line" is not what the record shows — a real 0.1.6-alpha.2 boot DID expose the
//     service, with a working `list()` over the directory roster (_oneoff/roster-016a2.json) — but
//     that probe never ASKED for `register`, so the absence is INFERRED, not recorded: it follows
//     from the package difference (npm: 0.1.6-alpha.2 ships no `@deepseek-ai/dsh-agent-preset`,
//     0.1.7-rc.2 adds it), which is the one capability `installer.js detectPresetMechanism` probes
//     for. Should such a host ever expose `register`, this module would register the preset as a row
//     and the directory copy would no longer be the only mechanism. Silence, not a warning.
//
// The `agentPresets` service is read through `ctx.inject`, so ordering does not matter and a host
// without the service simply never invokes the callback.
//
// THE GROUP MARKER (why the marker assignment at the end of this file is not optional):
// a row's config is interpolated — every YAML `!!js` node evaluated — unless the row's plugin
// callback carries the loader's "tree carrier" marker, `EntryGroup.key`, which is
// `Symbol.for('cordis.group')` (`cordis-plugin-loader/src/config/group.ts:7`). The loader's
// `internal/config` handler is exactly:
//     const plugin = this.runtime?.callback
//     if (plugin?.[EntryGroup.key]) return config
//     return interpolate(this.ctx, config)          — cordis-plugin-loader/src/index.ts:104-113
// The host's own preset row module (`@deepseek-ai/dsh-agent-preset`) is a class carrying
// `static [EntryGroup.key] = true`, so the nested expressions in a preset composition are preserved
// and evaluated in the PRESET's own mount scope. Without the marker they are evaluated HERE, in the
// declaring row's realm, at boot: silently wrong for anything that depends on the preset's scope,
// and — for an expression that throws there, which is most service lookups — a row that never
// activates, i.e. all four presets missing from the picker with no error the user can see.

export const name = 'vibe-math-preset-declaration'

/**
 * U14 (Round 5) — THE DECLARABLE OVERLAY, SECOND DESIGN (the first one was measured BROKEN).
 *
 * THE MEASURED FACT: a loader PATCH REPLACES a row's `config` — it does not merge into it. Measured with
 * `dsh --profile vmsmoke --dump-config --patch <file>`: patching THIS declaration row with
 * `config: { overlay: {...} }` turned the whole preset config into that payload (dump 1932 → 1562 lines,
 * `plugins:` gone, inner `id: vibe-math-vmu` 0 occurrences) ⇒ the preset lost its identity and
 * `session/create {agentPreset:'vibe-math-vmu'}` answered `agent-preset/not-found`. A patch that lands is NOT a
 * patch that merges. (The first design put the overlay in this row's config; it destroyed the preset.)
 *
 * THE FIX: the overlay travels in a SEPARATE ROW whose config IS the payload, so replacement is exactly right:
 *
 *   - id: vibe-math-vmu-overlay        # shipped with config: {} (zero mechanism); the DEPLOYMENT patches this row
 *     name: dsh-vibe-math/preset-declaration
 *     config:
 *       overlayFor: vibe-math-vmu      # which preset id this overlay belongs to
 *       rows:                          # id-keyed partial configs, merged into that preset's `config.plugins` rows
 *         vibe-math-vmu: { vmu: { tools: { faces: ['*'] }, packs: { active: ['v5r'] } } }
 *
 * The preset row's own config is never touched, so its identity and `plugins` survive. The overlay is read at REGISTER
 * time (inside the `agentPresets` injection callback), by which point every row of the layer has been applied.
 * An overlay key that matches no row is a typo: it is warned about by id and CHANGES NOTHING.
 */
const OVERLAYS = new Map()

function deepMerge(base, add) {
  if (add === null || typeof add !== 'object' || Array.isArray(add)) return add === undefined ? base : add
  const out = Object.assign({}, base && typeof base === 'object' && !Array.isArray(base) ? base : {})
  for (const k of Object.keys(add)) {
    const b = out[k]
    const a = add[k]
    out[k] = (a && typeof a === 'object' && !Array.isArray(a) && b && typeof b === 'object' && !Array.isArray(b))
      ? deepMerge(b, a) : a
  }
  return out
}

/** Merge an id-keyed overlay into the declared rows. Returns the ORIGINAL array when there is nothing to do. */
export function applyOverlay(plugins, overlay, warn = null) {
  if (!Array.isArray(plugins)) return plugins
  if (overlay === null || typeof overlay !== 'object' || Array.isArray(overlay)) return plugins
  const keys = Object.keys(overlay)
  if (keys.length === 0) return plugins
  const used = new Set()
  const merged = plugins.map((row) => {
    if (!row || typeof row !== 'object') return row
    const add = overlay[row.id]
    if (add === undefined) return row
    used.add(row.id)
    return Object.assign({}, row, { config: deepMerge(row.config || {}, add) })
  })
  if (typeof warn === 'function') for (const k of keys) if (!used.has(k)) warn(k)
  return merged
}

/** Read the overlay registered for a preset id (empty object when none was declared). Exported for tests. */
export function overlayForPreset(id) {
  const got = OVERLAYS.get(String(id))
  return got && typeof got === 'object' ? got : {}
}

/** Register one declaration and own its disposer for the lifetime of this fiber. */
function registerDeclaration(ctx, config) {
  const presets = ctx.get('agentPresets')
  if (presets === undefined || typeof presets.register !== 'function') return
  const warn = (key) => {
    ctx.logger?.warn?.('[dsh-vibe-math] preset "' + String(config.id) + '" overlay names a row that does not exist: ' + String(key))
  }
  // ★ THE IDENTITY GUARD (U14, second design): a preset row whose `plugins` is not an array has had its config
  // REPLACED by a patch - which is exactly the failure the first design caused (`agent-preset/not-found`). Name it,
  // and name the fix, instead of registering a preset with no identity.
  if (!Array.isArray(config.plugins) || typeof config.id !== 'string' || config.id === '') {
    ctx.logger?.warn?.('[dsh-vibe-math] this row has no preset identity (id/plugins missing): its `config` was most likely '
      + 'REPLACED by a patch. A loader patch replaces a row\'s config; patch the OVERLAY row (`id: vibe-math-vmu-overlay`) '
      + 'instead of the preset row. Nothing was registered.')
    return
  }
  const base = {
    id: config.id,
    name: config.name,
    description: config.description,
    order: config.order,
  }
  ctx.effect(() => {
    let dispose
    let retired = false
    Promise.resolve()
      // ★ U14 / THE EVALUATION-TIMING FIX (Lead's finding): the overlay must be read HERE, at REGISTER time, not when
      // this declaration is applied. Row order is not a contract the bundle controls (the preset row can be applied
      // before the overlay row), and an `applyOverlay` evaluated at apply time read an EMPTY overlay map - which is why
      // the first version merged nothing, and why an unmatched key produced no warning (an empty overlay has no keys to
      // test). Deferring the read to this microtask means every row of the layer has been applied by the time it runs.
      .then(() => presets.register(Object.assign({}, base, {
        plugins: applyOverlay(config.plugins, overlayForPreset(config.id), warn),
      })))
      .then((unregister) => {
        // Unregistering runs the preset's whole scope disposer, so it can reject. An unhandled
        // rejection terminates the process on Node >= 15: a teardown must never kill the host.
        if (retired) { Promise.resolve().then(() => unregister()).catch(() => {}); return }
        dispose = unregister
      })
      .catch((error) => {
        const message = String((error && error.message) || error)
        // A duplicate id means the host rejected THIS registration: registration is first-wins, and
        // profile layers are applied AFTER every bundle layer (dsh-app-boot/lib/types/profile.d.ts:
        // "then the profile's own patches"), so the winner is an earlier or peer layer — never
        // "theirs wins by being applied later". One line instead of a failed boot.
        // ★ FIX (measured by `tests/audit-preset-rows.test.mjs`): this branch used to read `definition.id`, a variable
        // that no longer exists after the register call moved into this chain ⇒ the CATCH ITSELF threw
        // (`ReferenceError: definition is not defined`) and turned "a named warning" into a crash. The id comes from
        // `base`, which is in scope here, and the whole warn is guarded so a broken logger cannot crash the boot either.
        try { ctx.logger?.warn?.('[dsh-vibe-math] agent preset "' + String(base.id) + '" 未由本包注册：' + message) } catch { /* a failed warning must never fail the boot */ }
      })
    return () => {
      retired = true
      if (dispose !== undefined) Promise.resolve().then(() => dispose()).catch(() => {})
    }
  })
}

/** @param ctx host context @param config the row's declaration config */
export function apply(ctx, config) {
  if (config === undefined || config === null || typeof config !== 'object') return
  // ★ THE OVERLAY ROW (U14, second design): its config IS the overlay payload, so a patch REPLACING this row's config
  // is exactly right (a patch replaces, it does not merge - measured). It registers the payload and declares no preset.
  if (typeof config.overlayFor === 'string' && config.overlayFor !== '') {
    const rows = config.rows && typeof config.rows === 'object' && !Array.isArray(config.rows) ? config.rows : {}
    OVERLAYS.set(config.overlayFor, rows)
    const n = Object.keys(rows).length
    if (n > 0) ctx.logger?.info?.('[dsh-vibe-math] overlay row declared ' + n + ' row override(s) for preset "' + config.overlayFor + '"')
    return
  }
  if (typeof ctx.inject === 'function') ctx.inject(['agentPresets'], (child) => registerDeclaration(child, config))
  else registerDeclaration(ctx, config)
}

// The loader must NOT interpolate this row's config: `config.plugins` holds the preset's own rows,
// whose `!!js` expressions belong to the preset's mount scope, not to the declaring row's. The loader
// reads this marker off the plugin callback (`runtime.callback`), which is the exported `apply`
// function. See the header for the host source this mirrors.
apply[Symbol.for('cordis.group')] = true

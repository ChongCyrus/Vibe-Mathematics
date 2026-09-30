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
//     (`@deepseek-ai/dsh-workflow-worker-thread`). There is no `agentPresets` service here, so this
//     module registers nothing and the directory copy remains the mechanism. Silence, not a warning.
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

/** Register one declaration and own its disposer for the lifetime of this fiber. */
function registerDeclaration(ctx, config) {
  const presets = ctx.get('agentPresets')
  if (presets === undefined || typeof presets.register !== 'function') return
  const definition = {
    id: config.id,
    name: config.name,
    description: config.description,
    order: config.order,
    plugins: config.plugins,
  }
  ctx.effect(() => {
    let dispose
    let retired = false
    Promise.resolve()
      .then(() => presets.register(definition))
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
        ctx.logger?.warn?.('[dsh-vibe-math] agent preset "' + definition.id + '" 未由本包注册：' + message)
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
  if (typeof ctx.inject === 'function') ctx.inject(['agentPresets'], (child) => registerDeclaration(child, config))
  else registerDeclaration(ctx, config)
}

// The loader must NOT interpolate this row's config: `config.plugins` holds the preset's own rows,
// whose `!!js` expressions belong to the preset's mount scope, not to the declaring row's. The loader
// reads this marker off the plugin callback (`runtime.callback`), which is the exported `apply`
// function. See the header for the host source this mirrors.
apply[Symbol.for('cordis.group')] = true

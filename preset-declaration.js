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
        if (retired) { void unregister(); return }
        dispose = unregister
      })
      .catch((error) => {
        const message = String((error && error.message) || error)
        // A duplicate id means the profile declares the same preset itself (a saved edit from the
        // preset editor, or the user's own copy): theirs wins and this registration stays quiet
        // beyond one line, instead of failing the boot.
        ctx.logger?.warn?.('[dsh-vibe-math] agent preset "' + definition.id + '" 未由本包注册：' + message)
      })
    return () => {
      retired = true
      if (dispose !== undefined) void dispose()
    }
  })
}

/** @param ctx host context @param config the row's declaration config */
export function apply(ctx, config) {
  if (config === undefined || config === null || typeof config !== 'object') return
  if (typeof ctx.inject === 'function') ctx.inject(['agentPresets'], (child) => registerDeclaration(child, config))
  else registerDeclaration(ctx, config)
}

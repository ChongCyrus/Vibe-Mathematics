import { apply } from '../../vibe-math-v5/vibe-math-v5.js'

// Registration only: no sessions, filesystem, model calls or business operations.
export function toolRegistry() {
  const registry = new Map()
  apply({ subagents: {}, agents: { roots: () => [], list: () => [] }, fs: {},
    tools: { register(spec) { registry.set(spec.name, spec); return () => {} } },
    commands: { register: () => () => {} }, get() {}, on() {},
    effect(fn) { return fn() }, logger: { warn() {}, error() {}, info() {} } })
  return registry
}

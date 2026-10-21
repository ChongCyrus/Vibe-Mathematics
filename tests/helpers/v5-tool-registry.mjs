// ★ G4: the v5 preset is archived; resolve it through the ONE preset seam.
import { pathToFileURL } from 'node:url'
import { legacyFile } from '../_lib/legacy-presets.mjs'
const { apply } = await import(pathToFileURL(legacyFile('vibe-math-v5', 'vibe-math-v5.js')).href)

// Registration only: no sessions, filesystem, model calls or business operations.
export function toolRegistry() {
  const registry = new Map()
  apply({ subagents: {}, agents: { roots: () => [], list: () => [] }, fs: {},
    tools: { register(spec) { registry.set(spec.name, spec); return () => {} } },
    commands: { register: () => () => {} }, get() {}, on() {},
    effect(fn) { return fn() }, logger: { warn() {}, error() {}, info() {} } })
  return registry
}

import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { apply } from '../../vibe-math-v5/vibe-math-v5.js'

export async function createHost(options = {}) {
  const workspace = options.workspace || fs.mkdtempSync(path.join(os.tmpdir(), 'v5-tool-help-'))
  const root = options.root || { id: 'tool-root', session: { header: { cwd: workspace }, id: 'tool-root' }, options: {} }
  const agents = new Map([[root.id, root]])
  const registry = new Map(), listeners = new Map(), disposers = []
  const h = { root, workspace, registry, compactionResult: { ok: true }, spawns: [] }
  const ctx = {
    agents: { roots: () => [root], get: id => agents.get(id), list: () => [...agents.values()] },
    subagents: {
      list: () => ['spawn'],
      async startContinuable({ label, request }) {
        const id = 'member-' + (h.spawns.length + 1)
        agents.set(id, { id, session: { id, header: { cwd: workspace, parentSession: root.id } }, options: {}, ctx })
        h.spawns.push({ id, label, request })
        return { childId: id, messageId: 'm' + id }
      },
      async sendMessage() { return 'message' }, interrupt() {}, async drainContinuableChildren() {},
    },
    tools: { register(spec) { registry.set(spec.name, spec); return () => {} } },
    commands: { register(spec) { h.command = spec; return () => {} } },
    on(name, fn) { if (!listeners.has(name)) listeners.set(name, []); listeners.get(name).push(fn) },
    effect(fn) { const dispose = fn(); if (typeof dispose === 'function') disposers.push(dispose) },
    logger: { warn() {}, error() {}, info() {} },
    timeout(fn, ms) { const t = setTimeout(fn, ms); t.unref(); const dispose = () => clearTimeout(t); disposers.push(dispose); return dispose },
    get(name) {
      if (name === 'compaction') return { async compactNow() { return h.compactionResult } }
      // No compiler/model substitution: behavior tests deliberately expose no subprocess service.
      return undefined
    },
    fs: {
      async resolve(rel, o) { const p = path.resolve(o?.cwd || workspace, rel); return { targetKey: p, displayPath: p } },
      async stat(t) { if (!fs.existsSync(t.targetKey)) return undefined; const s = fs.statSync(t.targetKey); return { type: s.isDirectory() ? 'directory' : 'file', size: s.size, version: 'v1' } },
      async readText(t) { return fs.readFileSync(t.targetKey, 'utf8') },
      async writeText(t, text) { fs.mkdirSync(path.dirname(t.targetKey), { recursive: true }); fs.writeFileSync(t.targetKey, text) },
      async listDir(t) { if (!fs.existsSync(t.targetKey)) return []; return fs.readdirSync(t.targetKey, { withFileTypes: true }).map(e => ({ name: e.name, type: e.isDirectory() ? 'directory' : 'file' })) },
    },
  }
  root.ctx = ctx
  apply(ctx)
  h.call = async (name, args = {}, agent = root) => JSON.parse(await registry.get(name).execute(args, { agent }))
  h.member = id => agents.get(h.spawns.find(s => s.label.includes('vibe5 ' + id + ' '))?.id)
  h.flush = () => new Promise(r => setTimeout(r, 80))
  h.end = async (agent, reply) => {
    for (const fn of listeners.get('subagent/start') || []) await fn({ id: agent.id, agent })
    for (const fn of listeners.get('subagent/end') || []) await fn({ id: agent.id, provider: 'spawn', local: true, stopReason: 'completed', lastAssistantMessage: [{ type: 'text', text: JSON.stringify(reply) }] })
    await h.flush()
  }
  h.snapshot = () => {
    const out = {}
    function walk(dir) { for (const e of fs.readdirSync(dir, { withFileTypes: true })) { const p = path.join(dir, e.name); if (e.isDirectory()) walk(p); else out[path.relative(workspace, p)] = fs.readFileSync(p, 'utf8') } }
    walk(workspace); return out
  }
  h.close = async () => { for (const d of disposers.reverse()) d(); await h.flush() }
  return h
}

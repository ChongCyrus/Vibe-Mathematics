import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import { randomUUID } from 'node:crypto'

// Protocol fixture, NOT a real DSH/model run. Only the preset and its registered
// tools are production code. The service boundary follows the inspected 0.2.2-rc.1
// activation shape; startContinuable/followup intentionally do not exist.
export const tick = () => new Promise(resolve => setImmediate(resolve))
export async function waitFor(predicate, message, ms = 4000) {
  const deadline = Date.now() + ms
  while (Date.now() < deadline) { if (await predicate()) return; await new Promise(r => setTimeout(r, 10)) }
  assert.ok(await predicate(), message)
}
export function activationHost({ legacy = false, compaction, finishDuringAdmission } = {}) {
  const workspace = mkdtempSync(join(tmpdir(), 'vibe-activation-'))
  const tools = new Map(), listeners = new Map(), effects = [], timers = new Set(), writes = new Map()
  const live = new Map(), records = new Map(), starts = [], messages = [], interrupts = [], drains = [], warnings = [], depthCalls = [], eventTasks = new Set()
  let closing = false, closePromise
  function emit(name, info, parent) {
    for (const listener of listeners.get(name) || []) {
      let task
      try { task = Promise.resolve(listener(info)) } catch (error) { task = Promise.reject(error) }
      eventTasks.add(task); task.finally(() => eventTasks.delete(task)).catch(() => {})
    }
  }
  function open(spec, childId = 'child-' + randomUUID()) {
    let resolveResult
    const result = new Promise(resolve => { resolveResult = resolve })
    const parent = spec.request.parent
    const agent = { id: childId, options: spec.request.agentOptions || {}, session: { id: childId, header: { cwd: parent.session.header.cwd, parentSession: parent.id }, events: [] } }
    live.set(childId, agent)
    const entry = { childId, spec, agent, runId: 'epoch-' + randomUUID(), result, resolveResult, closed: false, disposeCalls: 0 }
    records.set(childId, entry)
    emit('subagent/start', { runId: entry.runId, provider: spec.provider, id: childId, local: true }, parent)
    return entry
  }
  function finish(entry, reply, stopReason = 'completed') {
    if (entry.closed) return
    entry.closed = true; live.delete(entry.childId)
    const output = reply === undefined ? [] : [{ type: 'text', text: typeof reply === 'string' ? reply : JSON.stringify(reply) }]
    emit('subagent/end', { runId: entry.runId, provider: entry.spec.provider, id: entry.childId, local: true, stopReason, ...(output.length ? { lastAssistantMessage: output } : {}) }, entry.spec.request.parent)
    entry.resolveResult({ output, stopReason })
  }
  const raw = {
    list() { return ['spawn'] },
    resolveMaxDepth(value) { depthCalls.push(value); return value === undefined ? 3 : value },
    async startActivation(spec) {
      assert.equal(live.get(spec.request.parent.id), spec.request.parent, 'creation must keep the exact live parent object')
      assert.equal(spec.delivery, 'caller', 'preset progression owns first-epoch delivery')
      assert.equal(spec.request.maxDepth, 3, 'host default depth must reach the nested activation request')
      assert.ok(spec.signal instanceof AbortSignal)
      assert.ok(Array.isArray(spec.request.prompt) && spec.request.prompt.length)
      assert.equal(spec.request.toolFilter, undefined, 'unsupported restrictions must never reach this host')
      assert.equal(spec.request.persona, undefined, 'legacy persona is not a modern activation field')
      spec.signal.throwIfAborted()
      const entry = open(spec); starts.push(entry)
      const earlyReply = finishDuringAdmission?.(entry)
      if (earlyReply !== undefined) { entry.endedDuringAdmission = true; finish(entry, earlyReply) }
      return { childId: entry.childId, messageId: 'inbox-' + randomUUID(), result: entry.result, async dispose() { entry.disposeCalls++; finish(entry, undefined, 'aborted') } }
    },
    async sendMessage(parent, childId, blocks, options) {
      assert.equal(live.get(parent.id), parent, 'message sender must be the exact live parent')
      const old = records.get(childId)
      assert.ok(old && old.spec.request.parent === parent, "send must target this root's own child")
      options.signal.throwIfAborted()
      // Actual public sendMessage cold-resumes with parent delivery, not caller.
      if (old.closed) open({ ...old.spec, delivery: 'parent' }, childId)
      messages.push({ parent, childId, blocks, options })
      return { messageId: 'inbox-' + randomUUID() }
    },
    interrupt(childId, authority) {
      assert.equal(authority.kind, 'ancestor')
      assert.equal(live.get(authority.agent.id), authority.agent)
      const child = records.get(childId)
      assert.ok(child && child.spec.request.parent === authority.agent, 'interrupt cannot cross roots')
      interrupts.push({ childId, authority })
      return { accepted: true } // fire-and-return, not disposal
    },
    async drainChildren(parent, childIds) {
      drains.push({ parent, childIds })
      for (const id of childIds) { const entry = records.get(id); if (entry) { assert.equal(entry.spec.request.parent, parent); finish(entry, undefined, 'aborted') } }
    },
  }
  if (legacy) raw.startContinuable = async function (spec) {
    assert.equal(live.get(spec.request.parent.id), spec.request.parent)
    const entry = open(spec); starts.push(entry)
    return { childId: entry.childId }
  }
  const subprocess = { async spawn({ argv }) {
    const script = String(argv.at(-1) || '')
    if (/New-Item/.test(script)) for (const match of script.matchAll(/'((?:[^']|'')*)'/g)) mkdirSync(match[1].replace(/''/g, "'"), { recursive: true })
    return { done: Promise.resolve({ exitCode: 0 }) }
  } }
  const ctx = {
    get(name) { if (name === 'subprocess') return subprocess; if (name === 'agents') return this.agents; if (name === 'subagents') return raw; if (name === 'compaction') return compaction },
    on(name, fn) { const list = listeners.get(name) || []; list.push(fn); listeners.set(name, list); return () => {} },
    effect(fn) { const disposer = fn(); effects.push(disposer); return disposer },
    timeout(fn, ms) { const timer = setTimeout(() => { timers.delete(timer); if (!closing) fn() }, ms); timers.add(timer); return () => { clearTimeout(timer); timers.delete(timer) } },
    logger: { info() {}, error(...args) { warnings.push(args.join(' ')) }, warn(...args) { warnings.push(args.join(' ')) } },
    tools: { register(spec) { tools.set(spec.name, spec); return () => {} } }, commands: { register() { return () => {} } },
    subagents: raw, agents: { get(id) { return live.get(id) }, roots() { return [...live.values()].filter(a => !a.session.header.parentSession) } },
    fs: {
      async resolve(name, options) { const targetKey = isAbsolute(String(name)) ? String(name) : resolve(options?.cwd || workspace, String(name)); return { targetKey, displayPath: targetKey } },
      async stat(target) { if (!existsSync(target.targetKey)) return; const st = statSync(target.targetKey); return { version: String(st.mtimeMs), type: st.isDirectory() ? 'directory' : 'file', size: st.size } },
      async readText(target) { return readFileSync(target.targetKey, 'utf8') },
      async writeText(target, content) { mkdirSync(dirname(target.targetKey), { recursive: true }); writeFileSync(target.targetKey, content, 'utf8'); writes.set(target.targetKey, content) },
      async listDir(target) { return existsSync(target.targetKey) ? readdirSync(target.targetKey, { withFileTypes: true }).map(e => { const targetKey = join(target.targetKey, e.name); return { name: e.name, type: e.isDirectory() ? 'directory' : 'file', target: { targetKey, displayPath: targetKey } } }) : [] },
    },
  }
  function root(id) {
    const cwd = join(workspace, id); mkdirSync(cwd, { recursive: true })
    const agent = { id, options: { provider: 'fixture', model: 'no-model-calls' }, session: { id, header: { cwd, delegationDepth: 0 }, events: [] }, followup() {}, ctx: undefined }
    live.set(id, agent); return agent
  }
  async function call(name, args, agent) {
    if (closing) throw new Error('activation fixture is closed')
    assert.ok(tools.has(name), 'registered production tool: ' + name)
    return JSON.parse(await tools.get(name).execute(args || {}, { agent }))
  }
  function close() {
    return closePromise ||= cleanup()
  }
  async function cleanup() {
    closing = true
    for (const timer of timers) clearTimeout(timer)
    for (const dispose of effects.reverse()) if (typeof dispose === 'function') await dispose()
    for (const entry of records.values()) if (!entry.closed) finish(entry, undefined, 'aborted')
    await Promise.allSettled([...eventTasks]); await tick()
    for (const timer of timers) clearTimeout(timer)
    rmSync(workspace, { recursive: true, force: true })
  }
  return { ctx, raw, tools, writes, workspace, starts, records, messages, interrupts, drains, warnings, depthCalls, root, call, finish: (id, reply, reason) => finish(records.get(id), reply, reason), close }
}

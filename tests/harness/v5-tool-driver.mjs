// Loaded by the installed Harness CLI in an isolated profile. Real registry,
// parent/child sessions, provider, permission service and v5 business tools.
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { installModelSelection } from '@deepseek-ai/dsh-agent'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
export const inject = ['agents', 'sessions', 'subagents', 'tools', 'fs', 'commands', 'timer']
export const name = 'v5-tool-evaluation'
export function apply(ctx) {
  const config = JSON.parse(fs.readFileSync(process.env.V5_TOOL_RUN_SPEC, 'utf8'))
  const events = [], traceFile = path.join(config.directory, 'trace.json')
  const save = () => fs.writeFileSync(traceFile, JSON.stringify({ config, events }, null, 2))
  const record = event => { events.push({ at: Date.now(), ...event }); save() }
  const ledger = () => JSON.parse(fs.readFileSync(config.ledger, 'utf8'))
  const writeLedger = v => fs.writeFileSync(config.ledger, JSON.stringify(v, null, 2))
  const fetchOriginal = globalThis.fetch
  let requests = 0
  // Observe the real serialized Messages request and stream, never replace a response.
  globalThis.fetch = async (url, init) => {
    if (!String(url).endsWith('/messages')) return fetchOriginal(url, init)
    const body = JSON.parse(init.body)
    if (body.model !== 'deepseek-flash' || body.max_tokens > 2048 || ++requests > 6) throw new Error('EVAL_REQUEST_LIMIT')
    const inputUpperBound = 4 * Buffer.byteLength(init.body, 'utf8') + 16384
    const reserved = (inputUpperBound * config.price.input + 2048 * config.price.output) / 1e6
    const budget = ledger()
    if (budget.spent + budget.reserved + reserved > 20) throw new Error('EVAL_BUDGET_LIMIT')
    budget.reserved += reserved; writeLedger(budget)
    const index = requests, started = Date.now()
    record({ type: 'request', index, body, inputUpperBound, reserved }) // never headers/credentials
    try {
      const response = await fetchOriginal(url, init)
      const reader = response.clone().body.getReader(), decoder = new TextDecoder()
      let raw = ''
      while (true) { const next = await reader.read(); if (next.done) break; raw += decoder.decode(next.value, { stream: true }) }
      fs.writeFileSync(path.join(config.directory, `response-${index}.sse`), raw)
      const chunks = raw.split('\n').filter(l => l.startsWith('data: ')).flatMap(l => { try { return [JSON.parse(l.slice(6))] } catch { return [] } })
      const start = chunks.find(c => c.type === 'message_start')?.message
      const last = chunks.findLast(c => c.type === 'message_delta' && c.usage)
      const usage = { ...start?.usage, ...last?.usage }
      const input = (usage.input_tokens || 0) + (usage.cache_read_input_tokens || 0) + (usage.cache_creation_input_tokens || 0)
      const output = usage.output_tokens
      // Incomplete streams retain the full reservation; they may have been billed.
      if (Number.isInteger(output) && start && input <= inputUpperBound && output <= 2048) {
        const cost = (input * config.price.input + output * config.price.output) / 1e6
        const settled = ledger(); settled.reserved -= reserved; settled.spent += cost
        if (settled.model && settled.model !== start.model) throw new Error('EVAL_MODEL_CHANGED')
        settled.model = start.model; writeLedger(settled)
        record({ type: 'usage', index, usage, model: start.model, input, output, costUpperBound: cost, elapsedMs: Date.now() - started })
      } else record({ type: 'unsettled', index, status: response.status, elapsedMs: Date.now() - started })
      return response
    } catch (error) { record({ type: 'transport-error', index, message: String(error.message), elapsedMs: Date.now() - started }); throw error }
  }
  async function run() {
    await ctx.get('loader')?.await()
    const { apply: applyV5 } = await import(pathToFileURL(path.join(config.repository, 'vibe-math-v5/vibe-math-v5.js')).href)
    const baseline = JSON.parse(fs.readFileSync(path.join(config.repository, 'prompt-corpus-v5/baseline-tools.json')))
    const register = ctx.tools.register.bind(ctx.tools)
    const specs = new Map()
    applyV5(new Proxy(ctx, { get(target, key) {
      if (key !== 'tools') { const v = Reflect.get(target, key); return typeof v === 'function' ? v.bind(target) : v }
      return { register(spec) {
        const full = baseline.tools.find(t => t.name === spec.name)
        const displayed = { ...spec, description: config.group === 'full' && full ? full.description : spec.description }
        const execute = spec.execute
        displayed.execute = async (args, exec) => {
          record({ type: 'tool-call', tool: spec.name, agent: exec.agent.id, parameters: args })
          const result = await execute(args, exec)
          record({ type: 'tool-result', tool: spec.name, agent: exec.agent.id, result: JSON.parse(result) })
          return result
        }
        specs.set(displayed.name, displayed)
        return register(displayed)
      } }
    } }))
    record({ type: 'descriptions', tools: [...specs.values()].map(s => ({ name: s.name, description: s.description, parameters: s.parameters })) })
    const selection = { provider: 'deepseek-official', model: 'deepseek-flash', reasoningEffort: 'off' }
    const identity = config.id + '-' + Date.now()
    const rootId = identity + '-office', childId = identity + '-member'
    const root = (await ctx.agents.create({ sessionId: rootId, meta: { cwd: config.workspace }, agentOptions: selection,
      setup: agentCtx => { installModelSelection(agentCtx, { current: selection, assembled: undefined }) } })).agent
    await root.whenIdle()
    const snapshot = structuredClone(config.seed), state = snapshot.institutes['default::institute']
    state.phase = 'paused'; state.params.finalPaper = false
    state.members = state.members.filter(m => m.id === config.member)
    state.members.forEach(m => { m.childId = childId; m.busy = false })
    const statePath = path.join(config.workspace, 'VibeMath/Projects/default/Institutes/institute/State/institute.v5state.json')
    fs.mkdirSync(path.dirname(statePath), { recursive: true }); fs.writeFileSync(statePath, JSON.stringify(snapshot))
    const proof = path.join(config.workspace, 'VibeMath/Projects/default/Institutes/institute/Formal/test.lean')
    fs.mkdirSync(path.dirname(proof), { recursive: true }); fs.writeFileSync(proof, 'example : 2 + 2 = 4 := by decide\n')
    record({ type: 'initial-state', state })
    // Real read path hydrates persisted parameters before the model starts; no fabricated result.
    const configured = JSON.parse(await specs.get('vibe_v5_status').execute({}, { agent: root }))
    record({ type: 'setup-status', result: configured })
    let agent = root
    const allowed = [...specs.keys()]
    const persona = '这是隔离工具测试。你只完成指定任务，最多六次模型请求；不得自主持续研究、安装软件或伪称证据。复杂工具首次使用前调用 vibe_v5_tool_help({"tool":"工具名称"}) 查阅；若任务指定测试未读拒绝，则先测试一次拒绝，再按返回方法恢复，这不允许未读执行。请只传参数表列出的键，在最后简洁报告实际工具结果及阻塞。'
    if (config.member !== 'office') {
      await ctx.subagents.startContinuable({ provider: 'spawn', childId, label: config.member, signal: AbortSignal.timeout(180000), request: {
        parent: root, persona, toolFilter: { allow: allowed }, agentOptions: selection, prompt: [{ type: 'text', text: config.task }], maxDepth: 3,
      } })
      agent = ctx.agents.get(childId)
    } else {
      root.ctx.tools.restrict({ allow: allowed })
      root.ctx.get('systemPrompt').section({ name: 'eval-persona', order: 0, text: persona })
      // The real registry's agent filter limits the test to v5 tools, not their implementation.
      root.followup(createUserMessage({ content: [{ type: 'text', text: config.task }], source: { kind: 'user' } }))
    }
    await agent.whenIdle()
    await ctx.sessions.flush(agent.session)
    record({ type: 'final', requests, session: agent.session.ownEvents?.() || agent.session.snapshotEvents?.(0), state: JSON.parse(fs.readFileSync(statePath)) })
    ctx.get('appExit')(0)
  }
  run().catch(error => { record({ type: 'driver-error', message: String(error.stack || error) }); ctx.get('appExit')(1) })
}

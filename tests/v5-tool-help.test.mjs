import assert from 'node:assert/strict'
import fs from 'node:fs'
import { toolRegistry } from './helpers/v5-tool-registry.mjs'
import { V5_TOOL_HELP_REQUIRED } from '../vibe-math-v5/vibe-math-v5.js'
import { createHost } from './helpers/v5-tool-host.mjs'
const baseline = JSON.parse(fs.readFileSync(new URL('../prompt-corpus-v5/baseline-tools.json', import.meta.url)))
const registry = toolRegistry()
const agent = { id: 'help-only', session: {} }
const help = async (tool, who = agent) => JSON.parse(await registry.get('vibe_v5_tool_help').execute({ tool }, { agent: who }))
for (const spec of registry.values()) {
  assert(spec.description.length <= 240, spec.name)
  assert(spec.description.includes('vibe_v5_tool_help') || spec.name === 'vibe_v5_tool_help', spec.name)
}
function validate(schema, value) {
  if (schema.enum) assert(schema.enum.includes(value))
  if (schema.type === 'object') {
    assert(value && !Array.isArray(value) && typeof value === 'object')
    for (const k of schema.required || []) assert(k in value, 'required: ' + k)
    for (const [k, v] of Object.entries(value)) {
      if (schema.additionalProperties === false) assert(k in schema.properties, 'unknown: ' + k)
      if (schema.properties?.[k]) validate(schema.properties[k], v)
    }
  } else if (schema.type === 'array') { assert(Array.isArray(value)); for (const v of value) validate(schema.items, v) }
  else if (schema.type === 'integer') assert(Number.isInteger(value))
  else assert.equal(typeof value, schema.type)
}
for (const old of baseline.tools) {
  const spec = registry.get(old.name)
  assert(spec, old.name)
  assert(spec.description.length <= 240)
  assert(spec.description.includes('vibe_v5_tool_help'))
  assert.deepEqual(spec.parameters, old.parameters)
  const method = await help(old.name)
  assert.equal(method.ok, true)
  assert.deepEqual(method.parameters, spec.parameters)
  assert(method.instructions.includes(old.description), 'full description retained: ' + old.name)
  assert(method.version.startsWith('v1-'))
  assert(method.examples.length)
  for (const example of method.examples) validate(method.parameters, JSON.parse(JSON.stringify(example)))
}
const chars = [...registry.values()].reduce((n, t) => n + t.description.length, 0)
const helpMethod = await help('vibe_v5_tool_help')
for (const example of helpMethod.examples) validate(helpMethod.parameters, example)
assert(chars <= baseline.descriptionChars * .4)
assert.equal(V5_TOOL_HELP_REQUIRED.length, 10)
assert(registry.get('vibe_v5_task_update').description.includes('expected_revision'))
for (const tool of ['vibe_v5_lean_run', 'vibe_v5_lean_archive', 'vibe_v5_lean_job']) assert(registry.get(tool).description.includes('尚未通过'))
assert(registry.get('math_computation').description.includes('凭据'))
assert(registry.get('vibe_v5_propose_verify').description.includes('完整证明'))
assert.equal((await help('not_a_tool')).code, 'V5_TOOL_HELP_UNKNOWN')
assert.equal((await registry.get('vibe_v5_tool_help').execute({ tool: 'vibe_v5_set' }, {})).includes('no session'), true)

const h = await createHost()
await h.call('vibe_v5_configure', { problem: '测试；完整证明必须保留', params: { finalPaper: false, mathComputation: 'on' } })
await h.call('vibe_v5_start', { researcherCount: 2, academician: true })
await h.call('vibe_v5_pause')
const acad = h.member('acad'), r1 = h.member('r-1'), r2 = h.member('r-2')
const samples = {
  vibe_v5_set: { compactAfterRounds: 12 },
  vibe_v5_assign: { to: 'r-1', subject: '测试', why: '检查接口', acceptance: '记录结果' },
  vibe_v5_propose_verify: { target: 'test-proof', op: 'formal_proof', status: 'proved', reason: '测试完整证明' },
  vibe_v5_lean_run: { file: 'Formal/missing.lean' },
  vibe_v5_lean_archive: { kind: 'def', name: 'Test', content: 'def testValue : Nat := 2', run: false },
  vibe_v5_lean_lib: { refresh: true }, vibe_v5_lean_job: {},
  vibe_v5_feedback: { op: 'add', category: 'process', route: 'self', phenomenon: '测试', impact: '无', action: '核对' },
  math_computation: { op: 'probe' },
}
const created = await h.call('vibe_v5_task_create', { subject: '任务' })
samples.vibe_v5_task_update = { task_id: created.task.id, expected_revision: created.task.revision, action: 'edit', description: '新说明' }
for (const name of V5_TOOL_HELP_REQUIRED) {
  const who = name === 'vibe_v5_propose_verify' ? acad : h.root
  await h.flush()
  const before = h.snapshot()
  const refused = await h.call(name, samples[name], who)
  assert.equal(refused.code, 'V5_TOOL_HELP_REQUIRED', name)
  await h.flush()
  assert.deepEqual(h.snapshot(), before, 'unread no disk effects: ' + name)
  await h.call('vibe_v5_tool_help', { tool: name }, who)
  const result = await h.call(name, samples[name], who)
  assert.notEqual(result.code, 'V5_TOOL_HELP_REQUIRED', name + ' read then execute')
}
assert.equal((await h.call('vibe_v5_set', {}, r1)).code, 'V5_NOT_OFFICE')
assert.equal((await h.call('vibe_v5_assign', samples.vibe_v5_assign, r1)).code, 'V5_NOT_ACADEMICIAN')
assert.equal((await h.call('vibe_v5_propose_verify', samples.vibe_v5_propose_verify, r1)).code, 'V5_INVALID_ARGUMENT')
// Wrong tool and another member never satisfy this member's read requirement.
await h.call('vibe_v5_tool_help', { tool: 'vibe_v5_lean_job' }, r1)
assert.equal((await h.call('vibe_v5_lean_lib', { refresh: false }, r1)).code, 'V5_TOOL_HELP_REQUIRED')
await h.call('vibe_v5_tool_help', { tool: 'vibe_v5_lean_lib' }, r1)
assert.equal((await h.call('vibe_v5_lean_lib', { refresh: false }, r1)).ok, true)
assert.equal((await h.call('vibe_v5_lean_lib', { refresh: false }, r2)).code, 'V5_TOOL_HELP_REQUIRED')
// Failed computation keeps the method read, but never manufactures evidence or success.
await h.call('vibe_v5_tool_help', { tool: 'math_computation' }, r1)
const noCompute = await h.call('math_computation', { op: 'run', engine: 'python', mode: 'code', code: 'print(2+2)', record: true }, r1)
assert.equal(noCompute.ok, false)
assert.equal(noCompute.code, 'MATH_NO_SUBPROCESS')
assert.equal((await h.call('math_computation', { op: 'probe' }, r1)).code, 'MATH_NO_SUBPROCESS')
// A real session reconstruction invalidates a read even if an id was reused.
const reconstructed = { ...h.root, session: { ...h.root.session } }
assert.equal((await h.call('vibe_v5_set', {}, reconstructed)).code, 'V5_TOOL_HELP_REQUIRED')
await h.call('vibe_v5_tool_help', { tool: 'vibe_v5_set' }, h.root)
const restart = await createHost({ workspace: h.workspace, root: h.root })
assert.equal((await restart.call('vibe_v5_set', {})).code, 'V5_TOOL_HELP_REQUIRED')
// CAS conflict and feedback permissions retain their diagnostics before the read gate.
const task = (await h.call('vibe_v5_task_get', { task_id: created.task.id })).task
assert.equal((await h.call('vibe_v5_task_update', { ...samples.vibe_v5_task_update, expected_revision: 0 }, r2)).code, 'V5_TASK_STALE_REVISION')
assert.equal((await h.call('vibe_v5_task_update', { task_id: task.id, expected_revision: task.revision, action: 'edit', description: 'bad' }, r2)).code, 'V5_TASK_UNAUTHORIZED')
await h.call('vibe_v5_tool_help', { tool: 'vibe_v5_feedback' }, r1)
const fb = await h.call('vibe_v5_feedback', samples.vibe_v5_feedback, r1)
assert.equal((await h.call('vibe_v5_feedback', { op: 'update', id: fb.entry.id, status: 'closed' }, r2)).code, 'V5_FEEDBACK_FORBIDDEN')
// A successful actual compaction clears only the compacted member's records.
await h.call('vibe_v5_set', { compactAfterRounds: 1 })
await h.end(r1, { progress: '目标、定义、假设、结论来源、未完成推导、失败路线、下一步、完整材料位置', compacted: true })
assert.equal((await h.call('vibe_v5_lean_lib', { refresh: false }, r1)).code, 'V5_TOOL_HELP_REQUIRED')
await h.call('vibe_v5_tool_help', { tool: 'vibe_v5_lean_lib' }, r2)
h.compactionResult = { ok: false }
await h.end(r2, { progress: '保留完整摘要', compacted: true })
assert.equal((await h.call('vibe_v5_lean_lib', { refresh: false }, r2)).ok, true)
const oldVersion = (await h.call('vibe_v5_tool_help', { tool: 'vibe_v5_set' })).version
h.registry.get('vibe_v5_set').parameters.properties.test_schema_change = { type: 'boolean' }
assert.equal((await h.call('vibe_v5_set', {})).code, 'V5_TOOL_HELP_REQUIRED')
const changed = await h.call('vibe_v5_tool_help', { tool: 'vibe_v5_set' })
assert.notEqual(changed.version, oldVersion)
assert.equal((await h.call('vibe_v5_set', {})).ok, true)
await h.close(); await restart.close()
console.log(JSON.stringify({ ok: true, tools: registry.size, chars, baseline: baseline.descriptionChars, reduction: 1 - chars / baseline.descriptionChars }))

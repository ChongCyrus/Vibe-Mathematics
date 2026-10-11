import assert from 'node:assert/strict'
import fs from 'node:fs'
import { toolRegistry } from './helpers/v5-tool-registry.mjs'
import { V5_TOOL_HELP_REQUIRED } from '../vibe-math-v5/vibe-math-v5.js'
import { createHost } from './helpers/v5-tool-host.mjs'
const baseline = JSON.parse(fs.readFileSync(new URL('../prompt-corpus-v5/baseline-tools.json', import.meta.url)))
const registry = toolRegistry()
const agent = { id: 'help-only', session: {} }
const help = async (tool, who = agent) => JSON.parse(await registry.get('vibe_v5_tool_help').execute({ tool }, { agent: who }))
assert(registry.size > 0)
for (const spec of registry.values()) {
  assert(spec.description.length <= 240, spec.name)
  assert(spec.description.includes('vibe_v5_tool_help') || spec.name === 'vibe_v5_tool_help', spec.name)
}
function validate(schema, value) {
  if (schema.enum) assert(schema.enum.includes(value))
  if (schema.type === 'object') {
    assert(value && !Array.isArray(value) && typeof value === 'object')
    // EMPTY_ALLOWED: an object schema may have no required properties.
    for (const k of schema.required || []) assert(k in value, 'required: ' + k)
    for (const [k, v] of Object.entries(value)) {
      if (schema.additionalProperties === false) assert(k in schema.properties, 'unknown: ' + k)
      if (schema.properties?.[k]) validate(schema.properties[k], v)
    }
  // EMPTY_ALLOWED: valid array examples may be empty; item validation is conditional on schema type.
  } else if (schema.type === 'array') { assert(Array.isArray(value)); for (const v of value) validate(schema.items, v) }
  else if (schema.type === 'integer') assert(Number.isInteger(value))
  else assert.equal(typeof value, schema.type)
}
assert(baseline.tools.length > 0)
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
// Successful tool replies must follow durable state writes, including concurrent calls.
const durable = await createHost()
await durable.call('vibe_v5_configure', { problem: 'state queue regression', params: { finalPaper: false } })
const originalWrite = durable.root.ctx.fs.writeText
let releaseWrite, writeEntered
const writeHeld = new Promise(resolve => { releaseWrite = resolve })
const entered = new Promise(resolve => { writeEntered = resolve })
let failNext = false, blockedOnce = false
durable.root.ctx.fs.writeText = async (target, text) => {
  if (target.targetKey.endsWith('.v5state.json')) {
    if (!blockedOnce) { blockedOnce = true; writeEntered(); await writeHeld }
    if (failNext) { failNext = false; throw new Error('injected state write failure') }
  }
  return originalWrite(target, text)
}
let returned = false
const pendingCreate = durable.call('vibe_v5_task_create', { subject: 'held write' }).then(value => { returned = true; return value })
await entered
try {
  await new Promise(resolve => setTimeout(resolve, 30))
  assert.equal(returned, false, 'success must wait for the state write')
} finally { releaseWrite() }
assert.equal((await pendingCreate).ok, true)
const stateText = () => Object.entries(durable.snapshot()).find(([p]) => p.endsWith('.v5state.json'))[1]
const beforeFailure = stateText()
failNext = true
const refused = await durable.call('vibe_v5_task_create', { subject: 'must not survive failed write' })
assert.equal(refused.ok, false)
assert.match(JSON.stringify(refused), /state write FAILED/)
assert.equal(stateText(), beforeFailure, 'failed write preserves durable state')
const concurrent = await Promise.all(Array.from({ length: 6 }, (_, i) => durable.call('vibe_v5_task_create', { subject: 'concurrent ' + i })))
assert(concurrent.length === 6)
assert(concurrent.every(result => result.ok), 'failure must not poison the queue')
assert.equal(new Set(concurrent.map(result => result.task.id)).size, 6, 'concurrent allocations stay unique')
const persisted = JSON.parse(stateText())
const tasks = Object.values(persisted.institutes)[0].tasks
assert.equal(tasks.length, 7, 'all successful tasks are persisted before returning')
assert(!tasks.some(task => task.subject === 'must not survive failed write'), 'failed event must not leak into a later commit')
const cold = await createHost({ workspace: durable.workspace })
const originalRead = cold.root.ctx.fs.readText
let stateReads = 0
cold.root.ctx.fs.readText = async target => {
  if (target.targetKey.endsWith('.v5state.json')) {
    stateReads++
    await new Promise(resolve => setTimeout(resolve, 20))
  }
  return originalRead(target)
}
const statuses = await Promise.all(Array.from({ length: 6 }, () => cold.call('vibe_v5_status')))
assert(statuses.length === 6)
assert(statuses.every(result => result.ok !== false))
assert.equal(stateReads, 1, 'concurrent initial reads share one state load')
await cold.close()
await durable.close()
// Research persistence: preserve complete derivations across concurrent appends and read failures.
const research = await createHost()
await research.call('vibe_v5_configure', { problem: '保留完整数学条件与证明', params: { finalPaper: false } })
await research.call('vibe_v5_start', { researcherCount: 1 })
await research.call('vibe_v5_pause')
const researcher = research.member('r-1')
const readResearch = research.root.ctx.fs.readText
const writeResearch = research.root.ctx.fs.writeText
const statResearch = research.root.ctx.fs.stat
const isProgress = target => /Members[\\/]r-1[\\/]Progress[\\/]progress\.md$/.test(target.targetKey)
let refuseRead = false, emptyRead = false, refuseStat = false, refuseWrite = false, progressWrites = 0
research.root.ctx.fs.readText = async target => {
  if (!isProgress(target)) return readResearch(target)
  if (refuseRead) throw new Error('injected research read failure')
  if (emptyRead) return undefined
  const text = await readResearch(target)
  await new Promise(resolve => setTimeout(resolve, 15))
  return text
}
research.root.ctx.fs.stat = async target => {
  if (isProgress(target) && refuseStat) throw new Error('injected research stat failure')
  return statResearch(target)
}
research.root.ctx.fs.writeText = async (target, text) => {
  if (isProgress(target)) {
    progressWrites++
    if (refuseWrite) throw new Error('injected research write failure')
  }
  return writeResearch(target, text)
}
const append = content => research.call('vibe_v5_record_progress', { content }, researcher)
const completeProof = '条件：x > 0；不得删除此条件。\n' + '完整推导，不得用摘要替代。'.repeat(900) + '\n证明结束。'
assert.equal((await append(completeProof)).ok, true)
const branches = Array.from({ length: 6 }, (_, i) => '路线 ' + i + '：' + ('中间推导 ' + i + '；').repeat(800) + '路线终点 ' + i)
const appended = await Promise.all(branches.map(append))
assert(appended.length === 6)
assert(appended.every(result => result.ok))
const progressText = () => Object.entries(research.snapshot()).find(([p]) => /Members[\\/]r-1[\\/]Progress[\\/]progress\.md$/.test(p))[1]
const preserved = progressText()
assert(preserved.includes(completeProof), 'original conditions and full proof survive concurrent appends')
for (const branch of branches) assert.equal(preserved.split(branch).length, 2, 'each complete branch is retained exactly once')
for (const mode of ['read', 'empty', 'stat', 'write']) {
  refuseRead = mode === 'read'; emptyRead = mode === 'empty'; refuseStat = mode === 'stat'; refuseWrite = mode === 'write'
  const beforeWrites = progressWrites
  const result = await append('must not overwrite existing proof: ' + mode)
  assert.equal(result.ok, false, mode)
  assert.equal(result.code, 'V5_WRITE_FAILED', mode)
  if (mode !== 'write') assert.equal(progressWrites, beforeWrites, 'unsafe read must not trigger a write')
  assert.equal(progressText(), preserved, 'failed append leaves the proof unchanged')
}
refuseRead = emptyRead = refuseStat = refuseWrite = false
assert.equal((await append('恢复后继续研究')).ok, true, 'failed append does not poison the per-file queue')
assert(progressText().includes(preserved))
// A cold state read refusal must never be interpreted as an empty institute.
for (const mode of ['read', 'empty', 'stat']) {
  const restartResearch = await createHost({ workspace: research.workspace })
  const originalStateRead = restartResearch.root.ctx.fs.readText
  const originalStateStat = restartResearch.root.ctx.fs.stat
  let writes = 0
  const originalStateWrite = restartResearch.root.ctx.fs.writeText
  restartResearch.root.ctx.fs.readText = async target => {
    if (target.targetKey.endsWith('.v5state.json')) {
      if (mode === 'read') throw new Error('injected state read failure')
      if (mode === 'empty') return undefined
    }
    return originalStateRead(target)
  }
  restartResearch.root.ctx.fs.stat = async target => {
    if (mode === 'stat' && target.targetKey.endsWith('.v5state.json')) throw new Error('injected state stat failure')
    return originalStateStat(target)
  }
  restartResearch.root.ctx.fs.writeText = async (target, text) => {
    if (target.targetKey.endsWith('.v5state.json')) writes++
    return originalStateWrite(target, text)
  }
  const before = research.snapshot()
  const refused = await restartResearch.call('vibe_v5_task_create', { subject: 'unsafe restart' })
  assert.equal(refused.ok, false, mode)
  assert.equal(writes, 0, 'unreadable state is never overwritten')
  assert.deepEqual(research.snapshot(), before)
  await restartResearch.close()
}
await research.close()
const adversary = await createHost()
await adversary.call('vibe_v5_configure', { problem: '并发任务红队测试' })
await adversary.call('vibe_v5_tool_help', { tool: 'vibe_v5_task_update' })
const createTask = async subject => (await adversary.call('vibe_v5_task_create', { subject })).task
const updateTask = (task, action, extra = {}) => adversary.call('vibe_v5_task_update', { task_id: task.id, expected_revision: task.revision, action, ...extra })
const target = await createTask('same revision')
const edits = await Promise.all(['A', 'B'].map(subject => updateTask(target, 'edit', { subject })))
assert.equal(edits.filter(r => r.ok).length, 1, 'exactly one concurrent edit may consume a revision')
assert.equal(edits.find(r => !r.ok).code, 'V5_TASK_STALE_REVISION')
const a = await createTask('A'), b = await createTask('B')
const cycles = await Promise.all([updateTask(a, 'set_dependencies', { blocked_by: [b.id] }), updateTask(b, 'set_dependencies', { blocked_by: [a.id] })])
assert.equal(cycles.filter(r => r.ok).length, 1, 'individually valid concurrent edits must not create a cycle')
assert.equal(cycles.find(r => !r.ok).code, 'V5_TASK_DEPENDENCY_CYCLE')
const dependent = await createTask('dependent'), blocker = await createTask('blocker')
const deletion = await Promise.all([updateTask(dependent, 'set_dependencies', { blocked_by: [blocker.id] }), updateTask(blocker, 'delete')])
assert.equal(deletion.filter(r => r.ok).length, 1, 'dependency insertion and blocker deletion must not both succeed')
assert(['V5_TASK_HAS_DEPENDENTS', 'V5_TASK_NOT_FOUND'].includes(deletion.find(r => !r.ok).code))
const batchTasks = await Promise.all(Array.from({ length: 12 }, (_, i) => createTask('batch ' + i)))
const batchWrite = adversary.root.ctx.fs.writeText
let batchWrites = 0, failBatch = false
const snapshots = []
adversary.root.ctx.fs.writeText = async (target, text) => {
  if (target.targetKey.endsWith('.v5state.json')) {
    batchWrites++
    if (failBatch) throw new Error('injected batch write failure')
    snapshots.push(Object.values(JSON.parse(text).institutes)[0].tasks)
  }
  return batchWrite(target, text)
}
const order = batchTasks.map((t, priority) => ({ task_id: t.id, priority }))
order.push({ task_id: batchTasks[0].id, priority: 99 }, { task_id: 'missing', priority: 1 })
const prioritized = await adversary.call('vibe_v5_prioritize', { order })
assert.equal(prioritized.ok, true)
assert.equal(batchWrites, 1, 'batch priorities require one state write')
assert.equal(prioritized.applied.length, 13, 'duplicate rows keep their original per-row result semantics')
const batchSnapshot = snapshots.at(-1)
assert.equal(batchSnapshot.find(t => t.id === batchTasks[0].id).revision, 3)
assert.equal(batchSnapshot.find(t => t.id === batchTasks[0].id).priority, 99)
const beforeBatchFailure = adversary.snapshot()
failBatch = true
assert.equal((await adversary.call('vibe_v5_prioritize', { order })).ok, false)
assert.deepEqual(adversary.snapshot(), beforeBatchFailure, 'failed batch leaves all priorities unchanged')
failBatch = false
const raceTask = await createTask('priority race')
const race = await Promise.all([
  updateTask(raceTask, 'edit', { subject: 'edited during prioritization' }),
  adversary.call('vibe_v5_prioritize', { order: [{ task_id: raceTask.id, priority: 77 }] }),
])
assert.equal(race[1].ok, true, 'batch queue recovers after failed persistence')
const raced = snapshots.at(-1).find(t => t.id === raceTask.id)
assert.equal(raced.priority, 77)
assert.equal(raced.subject, race[0].ok ? 'edited during prioritization' : 'priority race', 'priority update cannot erase an accepted edit')
assert.equal(raced.revision, race[0].ok ? 3 : 2)
await adversary.call('vibe_v5_start', { researcherCount: 1 })
await adversary.call('vibe_v5_pause')
const reclaim = [await createTask('reclaim A'), await createTask('reclaim B')]
for (const t of reclaim) assert.equal((await updateTask(t, 'reassign', { owner: 'r-1' })).ok, true)
snapshots.length = 0
const removed = await adversary.call('vibe_v5_remove_researcher', { id: 'r-1' })
assert.equal(removed.ok, true)
assert.deepEqual(new Set(removed.reclaimedTasks), new Set(reclaim.map(t => t.id)))
assert(snapshots.length > 0, 'reclaim must persist a state snapshot')
assert(snapshots.every(tasks => [0, 2].includes(tasks.filter(t => reclaim.some(r => r.id === t.id) && t.ownerId === 'r-1').length)),
  'reclaim persists the entire batch, never a partially released set')
await adversary.close()

const counterHost = await createHost()
await counterHost.call('vibe_v5_start', { problem: 'concurrent artifact count', researcherCount: 1, params: { meetingKeepEvery: 0 } })
await counterHost.call('vibe_v5_pause')
const counterMember = counterHost.member('r-1'), counterCalls = []
for (let i = 0; i < 6; i++) {
  counterCalls.push(counterHost.call('vibe_v5_record_method', { id: 'count-' + i, content: 'proof ' + i, value: 1, motive: 'count once', p: 1 }, counterMember))
  counterCalls.push(counterHost.call('vibe_v5_record_progress', { content: 'progress ' + i }, counterMember))
}
const counterResults = await Promise.all(counterCalls)
assert(counterResults.length === 12)
assert(counterResults.every(result => result.ok))
const counterState = JSON.parse(Object.entries(counterHost.snapshot()).find(([p]) => p.endsWith('.v5state.json'))[1])
assert.equal(Object.values(counterState.institutes)[0].artifactCount, 6, 'concurrent cards count once each; progress must not reset the counter')
await counterHost.close()

// Exercise the production graph validator without quadratic task-file setup.
const pluginSource = fs.readFileSync(new URL('../vibe-math-v5/vibe-math-v5.js', import.meta.url), 'utf8')

const waitBody = pluginSource.split('    async function waitForProcess(handle, cap) {')[1].split('    async function mathSpawn')[0]
let timeoutCallback, disposedTimers = 0, terminatedProcesses = 0
const waitProcess = new Function('ctx', 'return async function(handle, cap) {' + waitBody)({ timeout(cb) { timeoutCallback = cb; return () => disposedTimers++ } })
const finishedProcess = await waitProcess({ done: Promise.resolve({ exitCode: 0 }), terminate() { terminatedProcesses++ } }, 1000)
assert.equal(finishedProcess.value.exitCode, 0)
assert.equal(finishedProcess.timedOut, false)
assert.equal(disposedTimers, 1)
assert.equal(terminatedProcesses, 0)
const processFailure = new Error('host failure')
const rejectedProcess = await waitProcess({ done: Promise.reject(processFailure) }, 1000)
assert.equal(rejectedProcess.error, processFailure)
assert.equal(rejectedProcess.settled, false)
assert.equal(disposedTimers, 2)
let rejectAfterTimeout
const pendingProcess = waitProcess({ done: new Promise((_r, reject) => { rejectAfterTimeout = reject }), terminate() { terminatedProcesses++; throw new Error('terminate refused') } }, 1000)
timeoutCallback()
const timedProcess = await pendingProcess
assert.equal(timedProcess.timedOut, true)
assert.equal(timedProcess.value.exitCode, null)
assert.equal(disposedTimers, 3)
assert.equal(terminatedProcesses, 1)
let lateRejections = 0
const onLateRejection = () => lateRejections++
process.on('unhandledRejection', onLateRejection)
try { rejectAfterTimeout(new Error('late rejection')); await new Promise(resolve => setImmediate(resolve)); assert.equal(lateRejections, 0) }
finally { process.off('unhandledRejection', onLateRejection) }

const readinessSource = pluginSource.split('    let indexedTasks, tasksById')[1].split('    function writeScopeWarnings')[0]
let readinessTasks = [], idReads = 0
const ready = new Function('inst', 'let indexedTasks, tasksById;' + readinessSource + '; return taskReady')(() => ({ tasks: readinessTasks }))
readinessTasks = Array.from({ length: 1000 }, (_, i) => ({ get id() { idReads++; return String(i) }, status: 'completed' }))
const waiting = { status: 'pending', blockedBy: ['999'] }
for (let i = 0; i < 1000; i++) assert.equal(ready(waiting), true)
assert.equal(idReads, 1000, 'one task snapshot builds one index instead of scanning it per query')
const completedSnapshot = readinessTasks
readinessTasks = readinessTasks.map(t => ({ id: t.id, status: 'pending' }))
assert.equal(ready(waiting), false, 'new snapshots invalidate readiness indexes')
assert.equal(ready(waiting, completedSnapshot), true, 'explicit commit snapshots use their own current index')
assert.equal(ready(waiting), false)
assert.equal(ready({ status: 'pending', blockedBy: ['missing'] }), false)
assert.equal(ready({ status: 'completed', blockedBy: [] }), false)
const upsertBody = pluginSource.split('function upsertById(items, updates) {')[1].split('\n  function applyV5Event')[0]
const upsert = new Function('return function(items, updates) {' + upsertBody)()
const baseItems = [{ id: 'duplicate', value: 1 }, { id: 'duplicate', value: 2 }, { id: '__proto__', value: 3 }]
const baseCopy = structuredClone(baseItems)
const incoming = [null, {}, { id: '' }, { id: 3 }, { id: 'duplicate', value: 4 }, { id: 'new' }, { id: 'new', value: 5 }, { id: '__proto__', value: 6 }]
const referenceItems = baseItems.slice()
for (const item of incoming) {
  if (!item || typeof item.id !== 'string' || !item.id) continue
  const i = referenceItems.findIndex(x => x.id === item.id)
  if (i < 0) referenceItems.push(item); else referenceItems[i] = item
}
assert.deepEqual(upsert(baseItems, incoming), referenceItems, 'indexed batch update retains first-match and duplicate semantics')
assert.deepEqual(baseItems, baseCopy, 'batch updates never mutate the prior committed array')
assert.equal(upsert(baseItems, [null, {}, { id: '' }]), baseItems, 'invalid batch is a no-op')
const validatorBody = pluginSource.split('function validateDeps(candidateId, blockedBy, current = inst()) {')[1].split('\n    async function taskCreate')[0]
let graphTasks = []
const validateGraph = new Function('inst', 'v5err', 'return function(candidateId, blockedBy, current = inst()) {' + validatorBody)(
  () => ({ tasks: graphTasks }), (code, message) => Object.assign(new Error(message), { code }))
const graphError = (id, deps) => { try { validateGraph(id, deps); return null } catch (e) { return e.code || e.name } }
graphTasks = Array.from({ length: 20000 }, (_, i) => ({ id: String(i), status: 'pending', blockedBy: i ? [String(i - 1)] : [] })).reverse()
assert.equal(graphError('new', ['19999']), null, 'deep acyclic research graph must not overflow the stack')
assert.equal(graphError('0', ['19999']), 'V5_TASK_DEPENDENCY_CYCLE')
assert.equal(graphError('new', ['1', '1']), 'V5_INVALID_ARGUMENT')
assert.equal(graphError('new', ['missing']), 'V5_TASK_NOT_FOUND')
assert.equal(graphError('new', ['new']), 'V5_TASK_DEPENDENCY_CYCLE')
graphTasks.find(t => t.id === '1').status = 'deleted'
assert.equal(graphError('new', ['1']), 'V5_TASK_NOT_FOUND')
let randomSeed = 42
const random = () => ((randomSeed = (Math.imul(randomSeed, 1664525) + 1013904223) >>> 0) / 2 ** 32)
for (let trial = 0; trial < 500; trial++) {
  const size = 2 + Math.floor(random() * 10)
  graphTasks = Array.from({ length: size }, (_, i) => ({ id: String(i), status: 'pending', blockedBy: [] }))
  const reach = Array.from({ length: size }, () => Array(size).fill(false))
  for (let i = 0; i < size; i++) for (let j = 0; j < size; j++) {
    if (random() < .18) { graphTasks[i].blockedBy.push(String(j)); reach[i][j] = true }
  }
  // Independent transitive-closure oracle, including cycles disconnected from the candidate.
  for (let k = 0; k < size; k++) for (let i = 0; i < size; i++) for (let j = 0; j < size; j++) reach[i][j] ||= reach[i][k] && reach[k][j]
  assert.equal(graphError('new', []), reach.some((row, i) => row[i]) ? 'V5_TASK_DEPENDENCY_CYCLE' : null)
}
console.log(JSON.stringify({ ok: true, tools: registry.size, chars, baseline: baseline.descriptionChars, reduction: 1 - chars / baseline.descriptionChars }))

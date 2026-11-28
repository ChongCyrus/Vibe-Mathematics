import test from 'node:test'
import assert from 'node:assert/strict'
import { pathToFileURL } from 'node:url'
import { activationHost, tick, waitFor } from './helpers/activation-host-fixture.mjs'

// Integration of real registered preset tools with a FAKE 0.2.2-rc.1 service.
// No real DSH child Agent, provider execution, model call, or host restart.
// Break caught: calling removed startContinuable or losing the parent/depth/
// native lifecycle contract prevents a registered tool from creating its child.
const versions = [2, 3, 4, 5]
async function setup(version, t, hostOptions) {
  const h = activationHost(hostOptions)
  const custom = process.env['MC_V' + version + '_PLUGIN']
  const url = custom ? pathToFileURL(custom) : new URL('../vibe-math-v' + version + '/vibe-math-v' + version + '.js', import.meta.url)
  const mod = await import(url.href)
  mod.apply(h.ctx)
  const roots = []
  t.after(async () => {
    for (const root of roots) { try { await h.call(version < 4 ? 'vibe_math_abort' : 'vibe_v' + version + '_abort', {}, root) } catch {} }
    await h.close()
  })
  return { h, root(id) { const root = h.root(id); roots.push(root); return root } }
}
async function start(version, h, root, suffix = 'a', options = {}) {
  if (version < 4) {
    assert.equal((await h.call('vibe_math_new_project', { name: 'activation-' + suffix }, root)).ok, true)
    assert.equal((await h.call('vibe_math_add_problem', { id: 'q1', description: 'Prove 2 + 2 = 4' }, root)).ok, true)
    assert.equal((await h.call('vibe_math_set_params', { finalPaper: false, reportIntervalMs: 0, ...options }, root)).ok, true)
    return h.call('vibe_math_start', {}, root)
  }
  if (Object.keys(options).length) await h.call('vibe_v' + version + '_set', options, root)
  return h.call('vibe_v' + version + '_start', { problem: 'Prove 2 + 2 = 4', [version === 4 ? 'residentCount' : 'researcherCount']: 2, finalPaper: false }, root)
}
for (const version of versions) {
  test('V' + version + ' registered start admits a modern activation without a legacy service method', { timeout: 15000 }, async t => {
    const f = await setup(version, t), root = f.root('root-' + version)
    const result = await start(version, f.h, root)
    assert.equal(result.ok, true, JSON.stringify(result))
    await waitFor(() => f.h.starts.length > 0, 'V' + version + ' actual registered start must create a modern child')
    assert.ok(f.h.starts.every(s => s.spec.request.parent === root))
    assert.ok(f.h.depthCalls.length > 0)
    assert.equal('startContinuable' in f.h.raw, false)
    assert.ok(f.h.starts[0].spec.request.prompt[0].text.length > 30, 'framework strategy prompt reaches the host')
  })
}

test('V3 native start/end drives a real planner action and keeps two roots isolated', { timeout: 15000 }, async t => {
  const { h, root } = await setup(3, t)
  const a = root('root-A'), b = root('root-B')
  await start(3, h, a, 'a'); await start(3, h, b, 'b')
  await waitFor(() => h.starts.some(s => s.spec.request.parent === a) && h.starts.some(s => s.spec.request.parent === b), 'both roots get independent planners')
  const pa = h.starts.find(s => s.spec.request.parent === a)
  h.finish(pa.childId, { summary: 'explore q1', plan: [{ action: 'spawn', role: 'explorer', target: 'q1', reason: 'test native lifecycle' }] })
  await waitFor(() => h.starts.some(s => s.spec.label.startsWith('explorer:q1') && s.spec.request.parent === a), 'native planner end must spawn explorer for the owning root')
  assert.equal(h.starts.filter(s => s.spec.request.parent === b).length, 1, 'root A completion must not schedule root B')
  const listed = await h.call('vibe_math_list_agents', {}, a)
  assert.ok(JSON.stringify(listed).includes(h.starts.find(s => s.spec.label.startsWith('explorer:q1')).childId), 'real list tool exposes the activated explorer')
})

test('V2 registered message and interrupt use the exact owning parent and durable child id', { timeout: 15000 }, async t => {
  const { h, root } = await setup(2, t), a = root('root-controls')
  await start(2, h, a)
  await waitFor(() => h.starts.length > 0, 'V2 explorer is created')
  const id = h.starts[0].childId
  await waitFor(async () => JSON.stringify(await h.call('vibe_math_list_agents', {}, a)).includes(id), 'explorer is registered before control calls')
  const message = await h.call('vibe_math_message_agent', { childId: id, message: 'continue with the same claim' }, a)
  assert.equal(message.ok, true, JSON.stringify(message))
  assert.ok(h.messages.some(m => m.childId === id && m.parent === a), 'production message routes through modern sendMessage')
  const interrupted = await h.call('vibe_math_interrupt_agent', { childId: id }, a)
  assert.equal(interrupted.ok, true, JSON.stringify(interrupted))
  assert.ok(h.interrupts.some(i => i.childId === id && i.authority.agent === a), 'production interrupt supplies exact ancestor authority')
})

test('V3 explicit solver toolFilter fails visibly without an unrestricted retry', { timeout: 15000 }, async t => {
  const diagnostics = []
  t.mock.method(console, 'error', (...args) => diagnostics.push(args.map(String).join(' ')))
  const { h, root } = await setup(3, t), a = root('root-restricted')
  await start(3, h, a, 'restricted', { plannerEnabled: false, solverToolDeny: ['write'] })
  await waitFor(() => h.starts.some(s => s.spec.label.startsWith('explorer:q1')), 'unfiltered explorer starts normally')
  const explorer = h.starts.find(s => s.spec.label.startsWith('explorer:q1'))
  await tick()
  h.finish(explorer.childId, { directions: [{ id: 'd1', title: 'addition', method: 'count two pairs', feasibility: 1 }] })
  await waitFor(() => diagnostics.some(line => line.includes('request.toolFilter')), 'real solver failure reports unsupported request.toolFilter')
  assert.equal(h.starts.some(s => s.spec.label.startsWith('solver:')), false, 'configured solver restrictions are never silently discarded')
  assert.match(diagnostics.join('\n'), /admission was stopped/, 'named host-compatibility diagnostic remains visible')
})

test('V3 context cleanup disposes admitted activation receipts', { timeout: 15000 }, async t => {
  const { h, root } = await setup(3, t), a = root('root-dispose')
  await start(3, h, a)
  await waitFor(() => h.starts.length > 0, 'V3 activation is admitted')
  await h.call('vibe_math_abort', {}, a)
  await h.close()
  assert.ok(h.starts.every(s => s.disposeCalls === 1), 'adapter releases every still-pending receipt once')
})

for (const legacy of [false, true]) {
  test('V5 ' + (legacy ? 'legacy' : 'modern') + ' start preserves frozen member identity and distinct staff roles', { timeout: 15000 }, async t => {
    const { h, root } = await setup(5, t, { legacy }), a = root('root-persona-' + legacy)
    const result = await start(5, h, a, 'persona', { staffPersona: 'INSTITUTE_IDENTITY_SENTINEL: independently verify every claim.' })
    assert.equal(result.ok, true, JSON.stringify(result))
    await waitFor(() => h.starts.length === 3, 'academician and two permanent researchers are admitted')
    await waitFor(() => [...h.writes.keys()].some(path => path.endsWith('.v5state.json')), 'real institute state is persisted')
    const snapshot = JSON.parse([...h.writes].find(([path]) => path.endsWith('.v5state.json'))[1])
    const members = Object.values(snapshot.institutes)[0].members
    assert.deepEqual(members.map(m => m.kind).sort(), ['academician', 'researcher', 'researcher'])
    for (const member of members) {
      const activation = h.starts.find(s => s.spec.label.startsWith('vibe5 ' + member.id + ' '))
      assert.ok(activation, 'persisted member has a corresponding child: ' + member.id)
      const request = activation.spec.request
      const identity = legacy ? request.persona : request.prompt[0].text
      assert.equal(identity, member.persona, 'complete hire-time identity reaches the child unchanged')
      assert.match(identity, /^INSTITUTE_IDENTITY_SENTINEL: independently verify every claim\./)
      assert.match(identity, member.kind === 'academician' ? /本所的领头人与组织协调中心/ : /一名常驻研究员，代号 r-/)
      assert.match(identity, /你入职时的在册编制/, 'hire-time roster snapshot remains in the charter')
      if (legacy) assert.equal(request.prompt.length, 1, 'legacy persona stays separate from its initial user prompt')
      else {
        assert.equal(Object.hasOwn(request, 'persona'), false, 'removed modern field is absent')
        assert.equal(request.prompt.length, 2, 'modern prompt carries identity before the original task')
        assert.match(request.prompt[1].text, /入职首轮/)
      }
    }
  })
}



test('V5 registered fire drains a modern resident before reporting successful retirement', { timeout: 15000 }, async t => {
  const { h, root } = await setup(5, t), a = root('root-modern-fire')
  assert.equal((await start(5, h, a)).ok, true)
  await h.call('vibe_v5_pause', {}, a)
  const child = h.starts.find(s => s.spec.label.startsWith('vibe5 r-1 '))
  assert.ok(child, 'permanent researcher r-1 has a resident child')
  const result = await h.call('vibe_v5_fire', { id: 'r-1', reason: 'retirement regression' }, a)
  assert.equal(result.ok, true, JSON.stringify(result))
  assert.deepEqual(h.drains.map(d => ({ parent: d.parent.id, childIds: d.childIds })), [{ parent: a.id, childIds: [child.childId] }])
  assert.equal(h.ctx.agents.get(child.childId), undefined, 'successful fire has released the resident slot')
})

test('V5 registered fire does not report success or forget a resident when selected drain fails', { timeout: 15000 }, async t => {
  const { h, root } = await setup(5, t), a = root('root-modern-fire-failure')
  assert.equal((await start(5, h, a)).ok, true)
  await h.call('vibe_v5_pause', {}, a)
  const child = h.starts.find(s => s.spec.label.startsWith('vibe5 r-1 '))
  assert.ok(child)
  const failure = new Error('selected drain fixture failure')
  const nativeDrain = h.raw.drainChildren
  try {
    h.raw.drainChildren = async (parent, childIds) => { h.drains.push({ parent, childIds }); throw failure }
    const attempt = await h.call('vibe_v5_fire', { id: 'r-1', reason: 'drain failure regression' }, a).then(value => ({ value }), error => ({ error }))
    assert.equal(h.drains.length, 1)
    assert.equal(h.drains[0].parent, a)
    assert.deepEqual(h.drains[0].childIds, [child.childId])
    if (attempt.error) assert.match(String(attempt.error.message || attempt.error), /selected drain fixture failure/)
    else assert.equal(attempt.value.ok, false, JSON.stringify(attempt.value))
    assert.equal(h.ctx.agents.get(child.childId), child.agent, 'failed drain leaves the resident live and tracked')
  } finally {
    h.raw.drainChildren = nativeDrain
  }
})


test('V5 first native start caches the exact Agent for real compaction after registry removal', { timeout: 15000 }, async t => {
  const compactions = []
  const { h, root } = await setup(5, t, { compaction: { async compactNow(agent, signal) { compactions.push({ agent, signal }); return { compacted: true } } } })
  const a = root('root-first-compact')
  assert.equal((await start(5, h, a)).ok, true)
  await h.call('vibe_v5_pause', {}, a)
  const first = h.starts[0]
  assert.equal(h.ctx.agents.get(first.childId), first.agent)
  h.finish(first.childId, { progress: 'FIRST_EPOCH_COMPACTION_REPLY', contextPct: 99 })
  assert.equal(h.ctx.agents.get(first.childId), undefined, 'native end occurs after removal from the host registry')
  await waitFor(() => compactions.length === 1, 'first-epoch reply at 99% must invoke the real compaction dependency')
  assert.equal(compactions[0].agent, first.agent, 'compaction receives the original exact Agent captured at start')
  assert.ok(compactions[0].signal instanceof AbortSignal)
})

for (const version of versions) {
  test('V' + version + ' preserves a native end emitted before admission returns', { timeout: 15000 }, async t => {
    const marker = 'PRE_ADMISSION_END_REPLY_V' + version
    let endedFirst = false
    const { h, root } = await setup(version, t, { finishDuringAdmission() {
      if (endedFirst) return
      endedFirst = true
      return version < 4 ? { directions: [{ id: 'early-direction', title: marker, method: 'direct proof', feasibility: 0.8 }] } : { summary: marker, progress: marker, contextPct: 17 }
    } })
    const a = root('root-early-end-' + version)
    assert.equal((await start(version, h, a, 'early', version === 3 ? { plannerEnabled: false } : {})).ok, true)
    await waitFor(() => h.starts.length > 0, 'first activation reaches the host')
    assert.equal(h.starts[0].endedDuringAdmission, true, 'fixture emits native start then end synchronously inside startActivation')
    await waitFor(() => [...h.writes.values()].some(text => text.includes(marker)), 'pre-admission reply must reach the real persisted framework state')
  })
}

for (const version of [4, 5]) {
  test('V' + version + ' native end preserves resident reply processing while paused', { timeout: 15000 }, async t => {
    const { h, root } = await setup(version, t), a = root('root-resident-' + version)
    assert.equal((await start(version, h, a)).ok, true)
    const pause = await h.call('vibe_v' + version + '_pause', {}, a)
    assert.equal(pause.ok, true, JSON.stringify(pause))
    const initialCount = h.starts.length
    const child = h.starts[0]
    const marker = 'NATIVE_COMPLETION_SENTINEL_' + version
    h.finish(child.childId, { summary: marker, progress: marker, solved: false, contextPct: 17 })
    await waitFor(() => [...h.writes.values()].some(text => text.includes(marker)), 'native lastAssistantMessage must be folded into real framework state')
    const status = await h.call('vibe_v' + version + '_status', {}, a)
    assert.equal(status.running, false, 'reply processing must preserve the paused run')
    assert.equal(h.starts.length, initialCount, 'paused completion does not launch replacement children')
  })
}

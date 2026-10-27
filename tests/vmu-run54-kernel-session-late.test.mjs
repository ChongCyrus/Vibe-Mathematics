#!/usr/bin/env node
// vmu RUN 54 — A KERNEL'S NAME IS ASKED FOR, NOT CAPTURED ONCE.
//
// THE OBSERVED DEFECT (live run 54, root session): every settings receipt said
//   "resolvedIn":{"kernelSession":null}, "resolvedInMeans":"THIS kernel's own resolution; it has no session id to match
//   it by name"
// for the WHOLE run — while the host knew the session id all along (the transcript rows are labelled with it). The cause
// is an assembly-time read: the entry computed `sessionIdOfCtx(ctx)` ONCE inside `apply()`, at which moment the host's
// `sessions` service is not mounted and the guarded context refuses the property, so the answer was `null` and never
// asked again. A name learned at time T and used at time T+n is not a name; it is a snapshot of a question nobody
// re-asked.
//
// WHAT THIS SUITE PROVES (both sides of the same sentence):
//   1. a kernel that learns its session id LATER starts naming it — the receipt flips from "cannot name itself" to the
//      real id without rebuilding the kernel;
//   2. a kernel that never learns one still says so honestly (the `null` is a measurement, not a default);
//   3. the entry feeds the kernel from the TOOL-EXECUTION seam (`exec.agent.session.id`, `exec.sessionId`,
//      `exec.agentId` when it is a session id) — the seam the root Agent is already bound from;
//   4. nothing is invented: an exec whose fields are unreadable leaves the name null;
//   5. the status BOARD line names the same id, so board and receipt agree (they are the two places run 54 compared);
//   6. a string still works: a kernel a deployment names at construction keeps that name.
import { dirname, join } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { createKernel } from '../vibe-math-vmu/kernel/index.js'
import { createTurnOrchestrator } from '../vibe-math-vmu/kernel/turn/index.js'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..')
const ENTRY = join(REPO, 'vibe-math-vmu', 'vibe-math-vmu.js')
const entry = await import(pathToFileURL(ENTRY).href)

let passed = 0
let failed = 0
const failures = []
const ok = (cond, label, detail) => {
  if (cond) { passed++; console.log('  ok   ' + label); return true }
  failed++; failures.push(label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  console.error('  FAIL ' + label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  return false
}

const boot = async (config = {}, ctxExtra = {}) => {
  const state = { specs: [] }
  const ctx = Object.assign({
    effect(fn) { return fn() },
    on() { return () => {} },
    tools: { register: async (spec) => { state.specs.push(spec); return () => {} } },
  }, ctxExtra)
  const handle = entry.apply(ctx, Object.assign({ clock: () => 1000, packs: ['v5r'] }, config))
  await handle.ready()
  return { handle, specOf: (n) => state.specs.find((s) => s.name === n) }
}
const callJSON = async (b, name, args = {}, exec = {}) => {
  const spec = b.specOf(name)
  if (!spec) return { missing: true }
  try { return { parsed: JSON.parse(await spec.execute(args, exec)) } } catch (e) {
    return { thrown: true, code: e && e.code, message: e && e.message }
  }
}
const settingsOf = async (b) => {
  const r = await callJSON(b, 'vibe_vmu_status', { detail: 'settings' })
  const p = r.parsed || {}
  return (p.settings && p.settings.resolvedIn) ? p.settings : null
}
const fakePrompt = () => ({
  assemble: async (ctx) => ({ ok: true, text: 'PROMPT\n' + String(ctx.statusBlock || '') }),
})
const lineOf = (text, label) => (text.split('\n').find((l) => l.startsWith(label)) || '')

// ── 1/2/4/5: the entry learns the name from a tool call, and never invents one ───────────────────────────────
const dir = await mkdtemp(join(tmpdir(), 'vmu-r54-late-'))
try {
  {
    const b = await boot({ root: dir, instance: 'shared' })
    const before = await settingsOf(b)
    ok(before && before.resolvedIn && before.resolvedIn.kernelSession === null,
      '① a kernel whose context cannot answer starts with NO name (measured, not defaulted)', before && before.resolvedIn)
    ok(before && typeof before.resolvedInMeans === 'string' && before.resolvedInMeans.includes('no session id it can name yet'),
      '② and it says why: the answer is "not yet known", not "this kernel has no session"', before && before.resolvedInMeans)

    // A REAL tool call carrying the Agent's session: this is what the host does on every tool execution.
    await callJSON(b, 'vibe_vmu_status', { detail: 'summary' }, { agent: { options: {}, session: { id: 'session-live-r54' } } })
    const after = await settingsOf(b)
    ok(after && after.resolvedIn && after.resolvedIn.kernelSession === 'session-live-r54',
      '③ the SAME kernel now names itself — a name learned after construction is asked for at read time',
      after && after.resolvedIn)
    ok(after && typeof after.resolvedInMeans === 'string' && !after.resolvedInMeans.includes('no session id it can name yet'),
      '④ and the "cannot name yet" sentence is gone once it can name itself', after && after.resolvedInMeans)
  }

  {
    // The other two shapes of the same question, each on its own fresh kernel.
    const b1 = await boot({ root: dir, instance: 'shared-1' })
    await callJSON(b1, 'vibe_vmu_status', { detail: 'summary' }, { sessionId: 'session-from-exec-id' })
    const r1 = await settingsOf(b1)
    ok(r1 && r1.resolvedIn.kernelSession === 'session-from-exec-id',
      '⑤ `exec.sessionId` is read when it is a string', r1 && r1.resolvedIn)

    const b2 = await boot({ root: dir, instance: 'shared-2' })
    await callJSON(b2, 'vibe_vmu_status', { detail: 'summary' }, { agentId: 'session-via-agent-id' })
    const r2 = await settingsOf(b2)
    ok(r2 && r2.resolvedIn.kernelSession === 'session-via-agent-id',
      '⑥ `exec.agentId` is read only when it IS a session id (the same shape rule the host uses)', r2 && r2.resolvedIn)

    // Unreadable: an agent id that is not a session, an empty session id, a hostile exec. None may become a name.
    const b3 = await boot({ root: dir, instance: 'shared-3' })
    await callJSON(b3, 'vibe_vmu_status', { detail: 'summary' }, { agentId: 'agent-7', sessionId: '', agent: { session: { id: 12 } } })
    const r3 = await settingsOf(b3)
    ok(r3 && r3.resolvedIn.kernelSession === null,
      '⑦ a seam whose fields are not ids leaves the name NULL — nothing is invented from a partial answer', r3 && r3.resolvedIn)
  }

  // ── 6: the board line and the receipt name the same kernel (this is the pair run 54 compared) ─────────────
  {
    const holder = { id: null }
    const RUN = '第54轮：默认面保留地图的归属、设置按内核解析的复验'
    const loop = createTurnOrchestrator({
      prompt: fakePrompt(),
      faces: {},
      settings: { 'vmu.turn.objective': RUN },
      kernelSession: () => holder.id,
    })
    const anonymous = await loop.assemble(loop.open({ member: 'r-1', phase: 'normal' }).turn)
    const anonLine = lineOf(anonymous.text, '[总任务]')
    ok(anonLine.includes('本内核的解析值') && !anonLine.includes('session-'),
      '⑧ before the name is known the board still says WHOSE resolution it is, without inventing one', anonLine)

    holder.id = 'session-late-bound'
    const named = await loop.assemble(loop.open({ member: 'r-1', phase: 'normal' }).turn)
    const namedLine = lineOf(named.text, '[总任务]')
    ok(namedLine.includes('本内核 session-late-bound 的解析值'),
      '⑨ the NEXT render names the kernel — the loop asks per render instead of capturing the constructor value', namedLine)
    ok(namedLine.includes('来源：设置键 vmu.turn.objective'),
      '⑩ the declared source is still named next to the kernel id (two different facts, both kept)', namedLine)
  }

  // ── 7: a kernel named at construction keeps that name (the string form must not regress) ──────────────────
  {
    const k = createKernel({ clock: () => 1700000000000, settings: {}, kernelSession: 'session-fixed-r54' })
    ok(k !== null, '⑪ a kernel built with a string kernelSession still assembles')
  }

  // ── 8: TWO SEAMS, TWO NAMES — the receipt pair run 54 compared as a contradiction ─────────────────────────
  {
    // A kernel with the SCRIPT bridge seam wired and NO math host: exactly the live configuration in which a member read
    // `bridge.hasSpawnSeam: true` beside a math refusal that says a register/spawn host is missing.
    const k = createKernel({ clock: () => 1700000000000, settings: {}, spawn: async () => ({ ok: true, result: null }) })
    const st = k.status()
    ok(st && st.bridge && st.bridge.hasSpawnSeam === true,
      '⑫ the script bridge reports its own seam (this is the fact the member read)')
    ok(st && typeof st.bridge.spawnSeamMeans === 'string' && st.bridge.spawnSeamMeans.includes('SCRIPT') &&
      st.bridge.spawnSeamMeans.includes('math'),
      '⑬ and says WHICH seam the boolean is about, pointing at the other one', st && st.bridge.spawnSeamMeans)
    ok(st && st.math && st.math.hostSeam && st.math.hostSeam.register === false && st.math.hostSeam.spawn === false,
      '⑭ the math surface\'s own seam is reported separately and is absent here - so the two readings no longer conflict',
      st && st.math)
    ok(st && st.math && st.math.hostInjected === false && typeof st.math.means === 'string' && st.math.means.includes('SCRIPT'),
      '⑮ "no host injected" and "a host that cannot compute" are distinguishable facts, and the sentence names both seams',
      st && st.math)
    let code = null
    try { k.math() } catch (e) { code = e && e.code }
    ok(code === 'VMU_ENGINE_UNAVAILABLE',
      '⑯ and the math face refuses BY NAME when its own seam is missing (the refusal and the receipt are about the same seam)',
      { code })
  }

  // ── 9: THE DEFAULT FACE (what the member actually read) still names both seams ─────────────────────────────
  {
    const b = await boot({ root: dir, instance: 'face' })
    const r = await callJSON(b, 'vibe_vmu_status', {})
    const p = r.parsed || {}
    ok(p.bridge && typeof p.bridge.hasSpawnSeam === 'boolean' && typeof p.bridge.note === 'string' && p.bridge.note.includes('SCRIPT'),
      '⑰ the DEFAULT face keeps the script seam boolean and says which seam it is', p.bridge)
    ok(p.math && p.math.hostSeam && typeof p.math.hostSeam.register === 'boolean' &&
      typeof p.math.note === 'string' && p.math.note.includes('OWN'),
      '⑱ and reports the math surface\'s own seam beside it, so one boolean can no longer be read as the other',
      p.math)
    ok(!p.bridge.recent && !p.bridge.stats,
      '⑲ the bounded face drops history/stats prose (detail:"full" carries it) - the budget went to provenance', p.bridge)
  }
} finally {
  await rm(dir, { recursive: true, force: true })
}

console.log('\n' + (failed === 0 ? 'RUN54 KERNEL SESSION LATE: OK' : 'RUN54 KERNEL SESSION LATE: FAILED') +
  ' (' + passed + ' passed, ' + failed + ' failed)')
if (failed) { for (const f of failures) console.error('  - ' + f); process.exitCode = 1 }

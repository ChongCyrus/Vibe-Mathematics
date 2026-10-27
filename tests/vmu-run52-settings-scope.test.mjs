#!/usr/bin/env node
// vmu RUN 52 — A SETTINGS VALUE BELONGS TO THE KERNEL THAT RESOLVED IT, AND THE BOARD MUST SAY SO.
//
// THE OBSERVED DEFECT (live run 52, and the run-51 member's claim this row finally decided): the member's prompt carried
//   [总任务] 第52轮：跨内核审批读面与调用者身份复验（整数平方和 n^2+n 恒偶）（来源：设置键 vmu.turn.objective）
// while its own `vibe_vmu_status {detail:"settings"}` reported that same key as the PACK DEFAULT (「前 n 个奇数之和…」,
// source `pack:v5r`, `overridden: []`). Both readings were true: the board was assembled by the kernel that delivered the
// turn (whose settings carried the run objective, `vibe_v5_start` writes it through `applyDeclaredSetting`), and the
// member's own session mounts a SECOND kernel that resolves the pack defaults. The line named the source and not the
// KERNEL, so the only available reading was "the label lies about where the value came from".
//
// WHAT THIS SUITE PROVES:
//   1. a settings-derived board field carries `resolvedBy`, and the rendered line says 「本内核的解析值」 plus the kernel
//      session when one is known;
//   2. a field NOT derived from settings (the task-board fallback) carries no scope clause - the sentence is only there
//      where it is true;
//   3. two kernels over the same workspace resolve the same key differently and EACH board names its own value and its
//      own kernel session (the cross-kernel case is represented honestly instead of collapsed into one claim);
//   4. `vibe_vmu_status {detail:"settings"}` names the resolving kernel (`resolvedIn.kernelSession`) and states what the
//      map is evidence about.
import { dirname, join } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { statusBoardReadings, renderStatusBoard } from '../vibe-math-vmu/kernel/turn/index.js'

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
const callJSON = async (b, name, args = {}) => {
  const spec = b.specOf(name)
  if (!spec) return { missing: true }
  let raw
  try { raw = await spec.execute(args, {}) } catch (e) {
    return { thrown: true, code: e && e.code, message: e && e.message, hint: e && e.hint }
  }
  try { return { parsed: JSON.parse(raw) } } catch { return { raw } }
}

// ── 1/2: the readings carry the scope, and the renderer only prints it where it is true ───────────────────────
const RUN = '第52轮：跨内核审批读面与调用者身份复验（整数平方和 n^2+n 恒偶）'
{
  const readings = statusBoardReadings({ settings: { 'vmu.turn.objective': RUN }, tasks: [], records: null, member: 'r-1', kernel: 'session-c0ffee' })
  const objective = readings.fields.find((f) => f.key === 'objective')
  ok(objective && objective.value === RUN, 'the board takes the objective from the set key', objective)
  ok(objective && objective.resolvedBy === 'session-c0ffee', 'the field records WHICH kernel resolved it', objective && objective.resolvedBy)
  const block = renderStatusBoard(readings)
  const line = block.split('\n').find((l) => l.startsWith('[总任务]')) || ''
  ok(line.includes('本内核 session-c0ffee 的解析值'), 'the rendered line names the resolving kernel', line)
  ok(line.includes('来源：设置键 vmu.turn.objective'), 'the declared source is still named (it did not become a lesser fact)', line)

  // no name known ⇒ still scoped, never a bare claim
  const anon = renderStatusBoard(statusBoardReadings({ settings: { 'vmu.turn.objective': RUN }, tasks: [], records: null }))
  const anonLine = anon.split('\n').find((l) => l.startsWith('[总任务]')) || ''
  ok(anonLine.includes('本内核的解析值') && !anonLine.includes('session-'), 'an unnamed kernel still says whose resolution it is', anonLine)

  // a fallback branch is NOT a settings resolution and must not claim to be one
  const fallback = renderStatusBoard(statusBoardReadings({
    settings: {},
    tasks: { list: () => [{ id: 't-1', title: '根任务', state: 'open', deps: [] }] },
    records: null, member: 'r-1', kernel: 'session-c0ffee',
  }))
  const fbLine = fallback.split('\n').find((l) => l.startsWith('[总任务]')) || ''
  ok(fbLine.includes('来源：任务板') && !fbLine.includes('本内核'), 'the task-board fallback carries no kernel scope', fbLine)
}

// ── 3: two kernels, one workspace, two honest resolutions ─────────────────────────────────────────────────────
{
  const dir = await mkdtemp(join(tmpdir(), 'vmu-r52-scope-'))
  try {
    const a = await boot({ root: dir, instance: 'shared' }, { sessionId: 'session-kernel-a' })
    const b = await boot({ root: dir, instance: 'shared' }, { sessionId: 'session-kernel-b' })
    const started = await callJSON(a, 'vibe_v5_start', { problem: RUN, researcherCount: 2 })
    // An assertion, not a guard: a conditional `ok(false, …)` is the shape that hides a skipped check (RULE E, shape C).
    ok(started.missing !== true, 'vibe_v5_start is registered (the cross-kernel case is testable)', started.missing === true ? 'missing' : 'present')
    ok(started.parsed && started.parsed.ok === true, 'kernel A accepted the run objective through start', started.parsed && started.parsed.code)

    const sa = await callJSON(a, 'vibe_vmu_status', { detail: 'settings' })
    const sb = await callJSON(b, 'vibe_vmu_status', { detail: 'settings' })
    const objA = sa.parsed && sa.parsed.settings && sa.parsed.settings.resolved && sa.parsed.settings.resolved['vmu.turn.objective']
    const objB = sb.parsed && sb.parsed.settings && sb.parsed.settings.resolved && sb.parsed.settings.resolved['vmu.turn.objective']
    ok(objA && objA.value === RUN, 'the delivering kernel resolves the run objective', objA)
    ok(objB && objB.value !== RUN, 'the second kernel keeps its own (pack default) resolution of the same key', objB && objB.value)
    ok(sa.parsed.settings.resolvedIn && sa.parsed.settings.resolvedIn.kernelSession === 'session-kernel-a', 'kernel A names itself as the resolver', sa.parsed.settings && sa.parsed.settings.resolvedIn)
    ok(sb.parsed.settings.resolvedIn && sb.parsed.settings.resolvedIn.kernelSession === 'session-kernel-b', 'kernel B names itself as the resolver', sb.parsed.settings && sb.parsed.settings.resolvedIn)
    ok(typeof sb.parsed.settings.resolvedInMeans === 'string' && sb.parsed.settings.resolvedInMeans.includes('own'), 'the receipt states what the map is evidence about', sb.parsed.settings.resolvedInMeans)

    // each board names its own kernel and its own value
    const boardA = renderStatusBoard(statusBoardReadings({ settings: { 'vmu.turn.objective': objA.value }, tasks: [], records: null, kernel: 'session-kernel-a' }))
    const boardB = renderStatusBoard(statusBoardReadings({ settings: { 'vmu.turn.objective': objB.value }, tasks: [], records: null, kernel: 'session-kernel-b' }))
    const lineA = boardA.split('\n').find((l) => l.startsWith('[总任务]')) || ''
    const lineB = boardB.split('\n').find((l) => l.startsWith('[总任务]')) || ''
    ok(lineA.includes(RUN) && lineA.includes('session-kernel-a'), 'board A quotes A\'s value and names A', lineA)
    ok(lineB.includes('session-kernel-b') && !lineB.includes(RUN), 'board B quotes B\'s value and names B (no collapse into one claim)', lineB)
  } finally { await rm(dir, { recursive: true, force: true }).catch(() => {}) }
}

console.log('\nTOTAL ' + (passed + failed) + ' PASS ' + passed + ' FAIL ' + failed)
if (failed > 0) { console.error('\nFAILURES:'); for (const f of failures) console.error(' - ' + f) }
process.exit(failed === 0 ? 0 : 1)

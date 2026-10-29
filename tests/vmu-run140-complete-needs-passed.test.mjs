#!/usr/bin/env node
/**
 * ★★★ G7 AUDIT #8 (G4) — A FAILED LEAN JOB IS NOT EVIDENCE OF COMPLETENESS.
 *
 * The gate accepted `proof_state:"complete"` when the write named a `lean_job` that the kernel had measured as NOT
 * passed, as long as a `lean_conformance` word travelled with it: the "no job" branch was skipped (a job was named) and
 * the "no evidence" branch was satisfied by the claim word. A card could therefore be locked as complete on evidence the
 * framework itself said had failed, while three descriptions promised "a settled PASSED run".
 *
 * WHAT THIS SUITE PINS
 *   §0 前置：写卡面在（真 pack），且这段机制在没有 Lean 面的部署上不会误伤（无面板 ⇒ 旧的两条分支照旧）。
 *   §1 正：作业被判定没通过 + 带 conformance 词 ⇒ 具名拒，message 点名作业号与状态。
 *   §2 反：同一个作业被判定通过 ⇒ 同一张卡写成功（闸只在“没通过”时存在，不是恒拒）。
 *   §3 边界：写卡面根本没有该作业 ⇒ 仍按“无证据”的那条路拒（不能拿“查不到”冒充“没通过”）。
 */
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const ENTRY = new URL('../vibe-math-vmu/vibe-math-vmu.js', import.meta.url)

let passed = 0
let failed = 0
const failures = []
const ok = (cond, label, detail) => {
  if (cond) { passed++; console.log('  ok   ' + label); return true }
  failed++; failures.push(label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  console.error('  FAIL ' + label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  return false
}
const eq = (actual, expected, label) => ok(actual === expected, label, actual)

const entry = await import(ENTRY.href)
const boot = async (config = {}) => {
  const state = { specs: [] }
  const ctx = {
    effect(fn) { return fn() },
    on() { return () => {} },
    tools: { register: async (spec) => { state.specs.push(spec); return () => {} } },
  }
  const handle = entry.apply(ctx, Object.assign({ clock: () => 1000 }, config))
  await handle.ready()
  return { handle, state, specOf: (n) => state.specs.find((s) => s.name === n) }
}
const receipt = async (b, name, args = {}) => {
  const spec = b.specOf(name)
  if (!spec) return { parsed: undefined, missing: true }
  const raw = await spec.execute(args, {})
  let parsed
  try { parsed = JSON.parse(raw) } catch { parsed = undefined }
  return { raw, parsed, missing: false }
}
const codeOf = (p) => (p && p.code ? p.code : null)
const textOf = (p) => (p ? String(p.message || '') + ' ' + String(p.hint || '') : '')
// `kernel.lean` is published as a GETTER (the assembled face is not meant to be reassigned), so a scenario that needs a
// measured "failed" conclusion installs an own-property getter on the instance instead of assigning to the property.
const instalLean = (kernel, face) => {
  Object.defineProperty(kernel, 'lean', { get: () => face, configurable: true, enumerable: false })
}

const root = await mkdtemp(join(tmpdir(), 'vmu-run140-complete-'))
try {
  console.log('=== 0. 前置：写卡面在，且这个部署没有 Lean 面（旧分支不该被误伤） ===')
  const b = await boot({ root, packs: ['v5r'] })
  ok(!!b.specOf('vibe_v5_record_proposition'), '★★ 正：vibe_v5_record_proposition 在（宿主 register 捕获）')
  const kernel = b.handle.kernel
  await kernel.members.hire({ id: 'r-chair', slot: 'chair' })
  await kernel.members.hire({ id: 'r-1', slot: 'member' })
  ok(!kernel.lean, '前置(RULE E)：这个部署没有 Lean 面（下面 §1 的假面是本套件故意装的）')

  console.log('=== 1. 正：作业没通过 + conformance 词 ⇒ 具名拒，点名作业号与状态 ===')
  // A fake lean face is the honest way to test "the framework measured this job as failed": nothing else can produce
  // that conclusion on a deployment without a compiler.
  instalLean(kernel, {
    status(id) { return { ok: true, job: { id: String(id), passed: false, state: 'timeout', file: 'Formal/x.lean' } } },
    policy() { return { formalVerify: 'off' } },
  })
  const failedJob = await receipt(b, 'vibe_v5_record_proposition', {
    id: 'p-failed', title: '失败作业', statement: '对一切自然数 n，n + n = 2 * n', value: true,
    motive: 'G4 取证', p: 0.5, member: 'r-chair',
    lean_job: 'lean-500', lean_conformance: 'conform', proof_state: 'complete',
  })
  eq(codeOf(failedJob.parsed), 'VMU_INVALID_ARGUMENT', '★★★ 正：失败作业不能撑起 proof_state "complete"（具名拒）')
  ok(/lean-500/.test(textOf(failedJob.parsed)), '★★ 正：拒绝点名那个作业号', textOf(failedJob.parsed).slice(0, 200))
  ok(/timeout/.test(textOf(failedJob.parsed)), '★★ 正：拒绝带上作业的真实状态（readers 不用猜为什么没过）', textOf(failedJob.parsed).slice(0, 200))
  ok(/vibe_v5_lean_job|proof_ref|draft/.test(textOf(failedJob.parsed)), '★ 正：hint 给三条可执行的出路', textOf(failedJob.parsed).slice(0, 240))

  console.log('=== 2. 反：同一个作业改为通过 ⇒ 同一张卡写成功（闸不是恒拒） ===')
  instalLean(kernel, {
    status(id) { return { ok: true, job: { id: String(id), passed: true, state: 'passed', file: 'Formal/x.lean' } } },
    policy() { return { formalVerify: 'off' } },
  })
  const passedJob = await receipt(b, 'vibe_v5_record_proposition', {
    id: 'p-passed', title: '通过作业', statement: '对一切自然数 n，n + n = 2 * n', value: true,
    motive: 'G4 反证', p: 0.5, member: 'r-chair',
    lean_job: 'lean-501', lean_conformance: 'conform', proof_state: 'complete',
  })
  ok(passedJob.parsed && passedJob.parsed.ok === true, '★★ 反：通过的作业让同一张卡写成功', passedJob.parsed && codeOf(passedJob.parsed))

  console.log('=== 3. 边界：作业查不到 ⇒ 走“无证据”那条路，而不是被说成“没通过” ===')
  instalLean(kernel, { status() { return { ok: false, code: 'VMU_NO_SUCH_JOB' } }, policy() { return { formalVerify: 'off' } } })
  const unknownJob = await receipt(b, 'vibe_v5_record_proposition', {
    id: 'p-unknown', title: '未知作业', statement: '对一切自然数 n，n + n = 2 * n', value: true,
    motive: 'G4 边界', p: 0.5, member: 'r-chair', lean_job: 'lean-999', proof_state: 'complete',
  })
  eq(codeOf(unknownJob.parsed), 'VMU_INVALID_ARGUMENT', '★ 边界：查不到的作业同样不能撑起 complete（具名拒）')
  ok(/no Lean registration|no `lean_job`/.test(textOf(unknownJob.parsed)),
    '★★ 边界：措辞是「没有可读的 Lean 证据」，不是撒谎说「这个作业没通过」', textOf(unknownJob.parsed).slice(0, 200))

  console.log('\n=== COMPLETE NEEDS A PASSED RUN (G7 audit #8, G4): ' + passed + ' passed, ' + failed + ' failed ===')
} finally {
  await rm(root, { recursive: true, force: true, maxRetries: 5 }).catch(() => {})
}
if (failed > 0) { console.error(failures.join('\n')); process.exitCode = 1 }

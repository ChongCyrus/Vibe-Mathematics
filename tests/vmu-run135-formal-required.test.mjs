#!/usr/bin/env node
/**
 * ★★★ G7 AUDIT C5 (rule L16) — THE FORMALISATION SWITCH MUST REACH THE RULING.
 *
 * The rule line says: 若 `vmu.math.formalVerify` 设为 require，缺少 Lean 结果或 blocked 记录的命题裁定不生效。
 * The audit found the switch was read ONLY by the Lean face and echoed by `vibe_v5_fidelity_conclude`; the ruling face
 * (`vibe_v5_verdict_final`) had ZERO consumers, so a chair could sign a final probability for a proposition that no
 * Lean run had ever passed — and the receipt looked exactly like a formalised one.
 *
 * WHAT THIS SUITE PINS
 *   §0 零机制：no pack ⇒ the ruling face does not exist at all (the gate cannot be "always on" by accident).
 *   §1 前置：real roster, a real convened meeting, a real proposition card with NO lean_job.
 *   §2 开关真的是开关：`vibe_v5_set{vmu.math.formalVerify:"require"}` lands and the kernel's own policy reads it.
 *   §3 正：require 下裁定被**具名**拒（VMU_PACK_V5R_FORMAL_REQUIRED），message 点名缺的是 lean_job，hint 给两条出路。
 *   §4 反：把开关设回 off ⇒ 同一次裁定成功（闸只在 require 时存在，不是恒拒）。
 *   §5 边界：卡上写了 lean_job 但该作业并不存在/未通过 ⇒ 拒绝必须点名作业号，而不是笼统说"没有 Lean"。
 */
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'


const HERE = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')
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
  return { handle, state, names: state.specs.map((s) => s.name), specOf: (n) => state.specs.find((s) => s.name === n) }
}
const receipt = async (b, name, args = {}) => {
  const spec = b.specOf(name)
  if (!spec) return { raw: undefined, parsed: undefined, missing: true }
  const raw = await spec.execute(args, {})
  let parsed
  try { parsed = JSON.parse(raw) } catch { parsed = undefined }
  return { raw, parsed, missing: false }
}
const codeOf = (parsed) => (parsed && parsed.code ? parsed.code : null)
const textOf = (parsed) => (parsed ? String(parsed.message || '') + ' ' + String(parsed.hint || '') : '')

const root = await mkdtemp(join(tmpdir(), 'vmu-run135-formal-'))
try {
  console.log('=== 0. 零机制：没有 v5r pack 就没有裁定面（闸不可能"默认开着"） ===')
  const bare = await boot({ root })
  ok(!bare.names.includes('vibe_v5_verdict_final'), '★★ 反(零机制)：无 pack ⇒ 无 vibe_v5_verdict_final', bare.names.length)

  console.log('=== 1. 前置：真名册 / 真会议 / 真命题卡（没有 lean_job） ===')
  const b = await boot({ root, packs: ['v5r'] })
  ok(b.names.includes('vibe_v5_verdict_final'), '★ 正：packs:["v5r"] 时裁定面在（宿主 register 捕获）')
  const kernel = b.handle.kernel
  const CHAIR = 'r-chair'
  const M1 = 'r-1'
  const M2 = 'r-2'
  await kernel.members.hire({ id: CHAIR, slot: 'chair' })
  await kernel.members.hire({ id: M1, slot: 'member' })
  await kernel.members.hire({ id: M2, slot: 'member' })
  const roster = kernel.members.roster().map((m) => m.id)
  ok(roster.includes(CHAIR) && roster.includes(M1) && roster.includes(M2), '前置(RULE E)：三个真成员在位', roster)

  const convened = await receipt(b, 'vibe_v5_meeting', { agenda: '形式化闸', kind: 'sync', member: CHAIR })
  ok(convened.parsed && convened.parsed.ok === true && typeof convened.parsed.meeting === 'string',
    '前置(RULE E)：会议真的开起来了（裁定要有一场会）', convened.parsed && codeOf(convened.parsed))
  const meeting = convened.parsed.meeting

  const card = await receipt(b, 'vibe_v5_record_proposition', {
    id: 'c-formal', title: '形式化闸的命题', statement: '对一切自然数 n，n + n = 2 * n',
    value: 1, motive: 'C5 闸的取证', p: 0.5, member: M1,
  })
  ok(card.parsed && card.parsed.ok === true, '前置(RULE E)：命题卡写成功了（下面拒的是"没有 Lean 证据"，不是"卡不存在"）',
    card.parsed && codeOf(card.parsed))
  const unformal = kernel.records.get({ id: 'c-formal' })
  ok(unformal && (unformal.lean_job === undefined || unformal.lean_job === null || unformal.lean_job === ''),
    '前置(RULE E)：这张卡确实没有 lean_job（否则下面的拒绝说的是别的事）', unformal && unformal.lean_job)

  console.log('=== 2. 开关真的是开关：require 落到内核策略上 ===')
  const setOn = await receipt(b, 'vibe_v5_set', { key: 'vmu.math.formalVerify', value: 'require', why: 'G7/C5 取证' })
  ok(setOn.parsed && setOn.parsed.ok === true, '★ 正：vmu.math.formalVerify 是声明键且可写', setOn.parsed && codeOf(setOn.parsed))
  // NO LEAN FACE on this deployment (no spawn seam) — so the readout to pin is the DECLARED value, which is exactly the
  // case C5's fix exists for: the switch must be honoured whether or not a compiler is installed.
  eq(kernel.settingOf('vmu.math.formalVerify'), 'require', '★★ 正：内核自己的设置读回 require（开关不是只写在回执里）')
  ok(!kernel.lean, '前置(RULE E)：这个部署确实没有 Lean 面（下面拒的因此是"声明层"的 require，而不是 Lean 面的 policy）', !!kernel.lean)

  console.log('=== 3. 正：require 下裁定被具名拒，点名缺什么、给两条出路 ===')
  const denied = await receipt(b, 'vibe_v5_verdict_final', {
    meeting, proposition_id: 'c-formal', member: CHAIR,
    verdicts: [{ member: M1, p: 0.9, reason: '九成' }, { member: M2, p: 0.8, reason: '八成' }],
  })
  eq(codeOf(denied.parsed), 'VMU_PACK_V5R_FORMAL_REQUIRED', '★★★ 正：require 下的裁定被具名码拒绝（不是静默通过）')
  const deniedText = textOf(denied.parsed)
  ok(deniedText.includes('c-formal'), '★ 正：拒绝点名这张卡（不是笼统的"某命题"）', deniedText.slice(0, 120))
  ok(/names no lean_job/.test(deniedText), '★★ 正：说清缺的是 lean_job（而不是"缺形式化"这种无法行动的句子）', deniedText.slice(0, 200))
  ok(/vibe_v5_lean_run/.test(deniedText) && /vibe_v5_lean_job/.test(deniedText), '★ 正：hint 给可执行的 lean_run → lean_job 路')
  ok(/blocked/.test(deniedText), '★ 正：hint 也给"确实无法形式化时记 blocked"这条规则自己的出路')

  console.log('=== 4. 反：开关设回 off ⇒ 同一次裁定成功（闸不是恒拒） ===')
  const setOff = await receipt(b, 'vibe_v5_set', { key: 'vmu.math.formalVerify', value: 'off', why: '恢复默认' })
  ok(setOff.parsed && setOff.parsed.ok === true, '前置：设回 off 成功', setOff.parsed && codeOf(setOff.parsed))
  const allowed = await receipt(b, 'vibe_v5_verdict_final', {
    meeting, proposition_id: 'c-formal', member: CHAIR,
    verdicts: [{ member: M1, p: 0.9, reason: '九成' }, { member: M2, p: 0.8, reason: '八成' }],
  })
  ok(allowed.parsed && allowed.parsed.ok === true, '★★★ 反：off 下同一次裁定成功（zero-policy 的默认不能被闸悄悄改掉）',
    allowed.parsed && codeOf(allowed.parsed))
  ok(codeOf(allowed.parsed) !== 'VMU_PACK_V5R_FORMAL_REQUIRED', '★ 反：成功的回执里没有那个拒绝码')

  console.log('=== 5. 边界：卡上写了作业号但作业没通过 ⇒ 拒绝必须点名作业号与状态 ===')
  const setOn2 = await receipt(b, 'vibe_v5_set', { key: 'vmu.math.formalVerify', value: 'require', why: '边界取证' })
  ok(setOn2.parsed && setOn2.parsed.ok === true, '前置：再设回 require')
  const cardWithJob = await receipt(b, 'vibe_v5_record_proposition', {
    id: 'c-formal-job', title: '带作业号的命题', statement: '对一切自然数 n，n * 1 = n',
    value: 1, motive: '边界取证', p: 0.5, member: M1, lean_job: 'lean-900',
  })
  if (cardWithJob.parsed && cardWithJob.parsed.ok === true) {
    const denied2 = await receipt(b, 'vibe_v5_verdict_final', {
      meeting, proposition_id: 'c-formal-job', member: CHAIR,
      verdicts: [{ member: M1, p: 0.9, reason: '九成' }, { member: M2, p: 0.8, reason: '八成' }],
    })
    eq(codeOf(denied2.parsed), 'VMU_PACK_V5R_FORMAL_REQUIRED', '★★ 正：带未通过作业的卡同样被拒')
    // ★ F-135a (found while writing this suite, recorded in phase12 §229): the WRITE face validates `lean_job` against
    // the kernel and then does not persist the pointer on the row, so a later reader (this gate) cannot name it. Until the
    // write path keeps that fact, the ruling must still refuse — and it must be honest about WHICH of the two it cannot
    // see. Both halves are pinned so the assertion cannot go green by covering for the other defect.
    const t2 = textOf(denied2.parsed)
    ok(/lean-900/.test(t2) || /names no lean_job at all/.test(t2),
      '★★ 正：拒绝点名那个作业号，或在证据没落盘时如实说"看不到 lean_job"（F-135a）', t2.slice(0, 200))
    ok(/has not passed|names no lean_job/.test(t2), '★ 正：说清缺的是"Lean 证据"，不是"缺形式化"这种无法行动的句子')
  } else {
    // The write face may itself refuse a lean_job it cannot verify — that is a DIFFERENT gate with its own message, and
    // this suite must not pretend to have exercised the ruling path when the card never existed.
    ok(/lean/i.test(textOf(cardWithJob.parsed)), '★ 边界：写卡面自身就拒了无法核验的作业号（另一道闸，本套件不谎称走过裁定路）',
      textOf(cardWithJob.parsed).slice(0, 160))
    const missing = await receipt(b, 'vibe_v5_verdict_final', { meeting, proposition_id: 'c-formal-job', member: CHAIR, verdicts: [] })
    ok(codeOf(missing.parsed) !== 'VMU_PACK_V5R_FORMAL_REQUIRED' || /c-formal-job/.test(textOf(missing.parsed)),
      '★ 边界：卡不存在时的事实由"卡不存在"那条路径回答（不会假装是形式化闸）', codeOf(missing.parsed))
  }
  console.log('=== 6. F-135a：写入时校验过的 lean_job 必须活过这次写入（后来的读者要能点名它） ===')
  {
    // ★★ G7 AUDIT (F-135a): the write face VALIDATED `lean_job` and then dropped it, so the ruling could only say
    // "names no lean_job at all" about a card whose author HAD named one. A fact that decided the write's legality is
    // not allowed to die at the write. Two halves are pinned: the row keeps it, and the LATER reader names it.
    const withJob = await receipt(b, 'vibe_v5_record_proposition', {
      id: 'c-leanjob', title: '带作业号的卡', statement: '对一切自然数 n，n + n = 2 * n',
      value: 1, motive: 'F-135a 取证', p: 0.5, member: M1,
      lean_job: 'lean-777', proof_ref: 'Formal/nn.lean', proof_state: 'draft',
    })
    ok(withJob.parsed && withJob.parsed.ok === true, '前置：带 lean_job 的草稿卡写成功', withJob.parsed && codeOf(withJob.parsed))
    const row = kernel.records.get({ id: 'c-leanjob' })
    ok(row && String(row.body || '').includes('lean-777'),
      '★★★ F-135a：作业号被写进卡体（写入时校验过的字段不能丢）', row && String(row.body || '').slice(0, 160))
    const setReq = await receipt(b, 'vibe_v5_set', { key: 'vmu.math.formalVerify', value: 'require', why: 'F-135a' })
    ok(setReq.parsed && setReq.parsed.ok === true, '前置：require 落地', setReq.parsed && codeOf(setReq.parsed))
    const denied3 = await receipt(b, 'vibe_v5_verdict_final', {
      meeting, proposition_id: 'c-leanjob', member: CHAIR,
      verdicts: [{ member: M1, p: 0.9, reason: '九成' }, { member: M2, p: 0.8, reason: '八成' }],
    })
    eq(codeOf(denied3.parsed), 'VMU_PACK_V5R_FORMAL_REQUIRED', '★★ 正：require 下这张卡仍被拒')
    const t3 = textOf(denied3.parsed)
    ok(/lean-777/.test(t3), '★★★ F-135a：后来的读者能点名作者写下的作业号（而不是"看不到"）', t3.slice(0, 220))
    ok(!/names no lean_job at all/.test(t3), '★ F-135a：不再谎称"没写作业号"')
    await receipt(b, 'vibe_v5_set', { key: 'vmu.math.formalVerify', value: 'off', why: '还原' })
  }
} finally {
  printfinal()
  await rm(root, { recursive: true, force: true, maxRetries: 5 }).catch(() => {})
}

function printfinal() {
  console.log('')
  console.log(JSON.stringify({ passed, failed, failures }, null, 2))
  if (failed > 0) process.exitCode = 1
}

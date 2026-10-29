#!/usr/bin/env node
// tests/vmu-wave2-seat-honesty.test.mjs — 席位是「谁在按键」的读数，不是参数里的字：A5 / A9 / B6 三处。
//
// 规则原文（docs/acceptance/rules-ledger.json）：
//   A5 「hire 只座临时工位；member/chair 席由创建面建立」——slot:"member" 必须具名拒，并点名建立该席位的面（vibe_v5_start）。
//   A9 「hire 的回执要说明是谁雇的」——没有席位席（root/办公会调用）时 hiredBy 必须是 null 且说明原因；
//      有席位时 hiredBy 必须是那次按键的成员 id。
//   B6 「蓝图采纳要判 CALLER」——常驻研究员在参数里写院士 id 就能采纳，是身份冒充；采纳看 resolveTurnMember(kernel, exec)。
//
// 这份文件测的是「CALLER 与参数对不上时谁说了算」，所以每条断言都同时读回执的形状与写后的真实状态。
// 蓝图的 adopt 先过共同设计（B5），所以 §3 的草案是「院士+常驻研究员」两席先后补完的同一份草案。
// 运行：`node tests/vmu-wave2-seat-honesty.test.mjs`（末行打印 ALL GREEN / 失败时 exitCode=1）。
import { mkdtemp, mkdir, rm } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { tmpdir } from 'node:os'
import { pathToFileURL, fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..')
const ENTRY = join(REPO, 'vibe-math-vmu', 'vibe-math-vmu.js')

let passed = 0
let failed = 0
const failures = []
const ok = (cond, label, detail) => {
  if (cond) { passed++; console.log('  ok   ' + label); return true }
  failed++
  failures.push(label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail).slice(0, 500)))
  console.error('  FAIL ' + label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail).slice(0, 500)))
  return false
}

const entry = await import(pathToFileURL(ENTRY).href)
const ROOT = await mkdtemp(join(tmpdir(), 'vmu-wave2-seat-'))
await mkdir(join(ROOT, 'Formal'), { recursive: true })

/** 宿主注入 `subprocess` 缝（与其它 pack 测试同一种 boot）；本文件不跑 Lean，只是让 pack 正常装载。 */
const boot = async () => {
  const state = { specs: [] }
  const subprocess = {
    resolveExecutable: async (name) => '/fake/bin/' + String(name),
    spawn: () => ({
      done: Promise.resolve({ exitCode: 0, signal: null, stdout: 'Build completed successfully.\n', stderr: '' }),
      terminate() {},
    }),
  }
  const ctx = {
    effect(fn) { return fn() },
    on() { return () => {} },
    get: (what) => (what === 'subprocess' ? subprocess : undefined),
    tools: { register: async (spec) => { state.specs.push(spec); return () => {} } },
  }
  let NOW = 1000
  const handle = entry.apply(ctx, { clock: () => NOW + (NOW += 1000), packs: ['v5r'], root: ROOT })
  await handle.ready()
  return { handle, kernel: handle.kernel, specOf: (name) => state.specs.find((s) => s.name === name) }
}

/**
 * 一次工具调用。`turn` 是「谁在按键」：null = 办公会/root 调用（无 exec）；成员 id = 那次 turn 的 `exec.agent.id`。
 * 注意 `toHostSpec.execute(args, exec)` 的第二参就是这次调用自己的 exec：`callerMember` 由它推出来，
 * 所以席位调用必须把 exec 直接传进去（包起来的 `{kernel, exec}` 会被当成没有 agent 的办公会调用）。
 * 回执是 JSON 文本（boundedToolResult 的唯一序列化），这里解回对象再断言；抛错与 `{ok:false}` 两种形状都认。
 */
const call = async (b, name, args = {}, { turn = null } = {}) => {
  const spec = b.specOf(name)
  if (!spec) return { missing: name }
  const exec = turn === null ? undefined : { agent: { id: turn } }
  let raw
  try { raw = await spec.execute(args, exec) } catch (e) {
    return { thrown: true, ok: false, code: e && e.code, message: String((e && e.message) || ''), hint: e && e.hint }
  }
  if (typeof raw === 'string') { try { return JSON.parse(raw) } catch { return { raw } } }
  return raw || {}
}
/** 具名拒：ok:false + 那个 code（回执或 throw 两种形状都认）。 */
const refusedWith = (r, code) => !!r && r.ok === false && r.code === code

try {
  const b = await boot()
  const kernel = b.kernel
  await kernel.members.hire({ id: 'r-acad', slot: 'chair' })
  await kernel.members.hire({ id: 'r-1', slot: 'member' })

  // ── §1 A5：slot:"member" 具名拒，并点名建立该席位的面 ─────────────────────────────────────────────────
  console.log('=== §1 A5：hire 只座临时工位；slot:"member" 具名拒并点名 vibe_v5_start ===')
  const chairSlot = await call(b, 'vibe_v5_hire', { purpose: 'p', initial_task: 't', to: 'r-x1', slot: 'member' })
  ok(refusedWith(chairSlot, 'VMU_NOT_PERMITTED'), 'slot:"member" 被 VMU_NOT_PERMITTED 具名拒', chairSlot && (chairSlot.code || chairSlot.ok))
  ok(/slot "member"/.test(String(chairSlot.message)) && /TEMP seats only/.test(String(chairSlot.message)),
    '拒绝文案点名被拒的那个 slot，并说明本面只座 temp 席', chairSlot && chairSlot.message)
  ok(/vibe_v5_start/.test(String(chairSlot.hint)),
    '★ hint 点名建立院士/常驻席的那个面（vibe_v5_start），不是让读者猜', chairSlot && chairSlot.hint)
  ok(!kernel.members.roster().some((m) => String(m.id) === 'r-x1'), '拒绝之后没有偷偷建出一个 r-x1（不是"拒了但坐了"）',
    kernel.members.roster().map((m) => m.id))

  // ── §2 A9：hiredBy 说得出「谁雇的」，也说得清「没有席位席」────────────────────────────────────────────
  console.log('\n=== §2 A9：root/办公会调用 ⇒ hiredBy:null + 说明；席位调用 ⇒ hiredBy 是那个成员 id ===')
  const rootHire = await call(b, 'vibe_v5_hire', { purpose: 'p', initial_task: 't', to: 'r-temp-root' })
  ok(rootHire.ok === true, 'setup：没有席位的（root/办公会）调用可以雇临时工', rootHire && (rootHire.code || rootHire.ok))
  ok(rootHire.hiredBy === null, '★ root 调用的回执 hiredBy 是 null（不是空串、不是猜一个 id）', rootHire && rootHire.hiredBy)
  const means = String(rootHire.hiredByMeans || '')
  ok(/root\/office call/.test(means) && /no member seat/.test(means), '★ hiredByMeans 说明「root/办公会调用没有成员席位，所以没有归因」', means)
  const rowRoot = kernel.members.roster().filter((m) => String(m.id) === 'r-temp-root')[0] || {}
  ok(rowRoot.hiredBy === undefined || rowRoot.hiredBy === null, '名册行也没有被写上一个假的 hiredBy', rowRoot.hiredBy)

  const memberHire = await call(b, 'vibe_v5_hire', { purpose: 'p', initial_task: 't', to: 'r-temp-1' }, { turn: 'r-1' })
  ok(memberHire.ok === true, 'setup：席位调用可以雇临时工（r-1 在 member 席）', memberHire && (memberHire.code || memberHire.ok))
  ok(memberHire.hiredBy === 'r-1', '★ 席位调用的回执 hiredBy 就是那个成员 id（r-1）', memberHire && memberHire.hiredBy)
  ok(/turn-tool record/.test(String(memberHire.hiredByMeans || '')), 'hiredByMeans 说明归因来自 turn 记录而不是参数', memberHire && memberHire.hiredByMeans)

  // ── §3 B6：采纳判 CALLER，不判参数里的 member ───────────────────────────────────────────────────────────
  console.log('\n=== §3 B6：常驻研究员命名院士 id 采纳 ⇒ 具名拒；院士自己采纳 ⇒ 收；root 采纳照旧 ===')
  const PATH = 'Shared/Seat.md'
  const draftA = await call(b, 'vibe_v5_blueprint', { action: 'propose', text: '# 蓝图 A\n\n第一版（研究员起草）。', member: 'r-1', path: PATH }, { turn: 'r-1' })
  ok(draftA.ok === true && typeof draftA.id === 'string', 'setup：常驻研究员提案一份草案（提案不限席位）', draftA && (draftA.code || draftA.id))
  const contA = await call(b, 'vibe_v5_blueprint', { action: 'propose', text: '院士补充（共同设计）：每月复查。', member: 'r-acad', path: PATH }, { turn: 'r-acad' })
  ok(contA.ok === true && contA.continued === true && contA.id === draftA.id && contA.authors.length === 2,
    'setup：院士补完同一份草案（B5 共同设计，两席齐了才能采纳）', contA && { id: contA.id, continued: contA.continued, authors: contA.authors && contA.authors.length })

  const impersonate = await call(b, 'vibe_v5_blueprint',
    { action: 'adopt', draft: draftA.id, member: 'r-acad', path: PATH }, { turn: 'r-1' })
  ok(refusedWith(impersonate, 'VMU_NOT_PERMITTED'),
    '★ 常驻研究员在参数里写院士 id ⇒ VMU_NOT_PERMITTED（不是"按下去了"）', impersonate && (impersonate.code || impersonate.ok))
  const impMsg = String(impersonate.message || '')
  ok(/called by member "r-1"/.test(impMsg) && /names "r-acad"/.test(impMsg),
    '★ 拒绝文案同时点名按键的人（r-1）与参数里的名字（r-acad）', impMsg)
  ok(/seat is read from the CALL/i.test(impMsg), '拒绝文案说清「席位从这次调用读，不从请求文本读」', impMsg)

  const noName = await call(b, 'vibe_v5_blueprint', { action: 'adopt', draft: draftA.id, path: PATH }, { turn: 'r-1' })
  ok(refusedWith(noName, 'VMU_NOT_PERMITTED'),
    '★ 常驻研究员不写 member 也采纳不了（CALLER 不是主席席，具名拒而不是"缺参数"）', noName && (noName.code || noName.ok))
  ok(/slot "member"/.test(String(noName.message)), '拒绝文案点名它读到的席位（slot "member"）', noName && noName.message)

  const notAdopted = await call(b, 'vibe_v5_blueprint', { action: 'state', path: PATH }, { turn: 'r-1' })
  ok(notAdopted.ok === true && (notAdopted.current === null || notAdopted.current === undefined || notAdopted.hasCurrent === false),
    '★ 两次被拒之后现行蓝图仍然为空（拒在写入之前）', notAdopted && { current: notAdopted.current, hasCurrent: notAdopted.hasCurrent })

  const chairAdopt = await call(b, 'vibe_v5_blueprint',
    { action: 'adopt', draft: draftA.id, member: 'r-acad', path: PATH }, { turn: 'r-acad' })
  ok(chairAdopt.ok === true, '★ 院士自己按键采纳 ⇒ 收下', chairAdopt && (chairAdopt.code || chairAdopt.ok))
  ok(chairAdopt.member === 'r-acad', '回执的 member 是院士（采纳人）', chairAdopt && chairAdopt.member)

  const draftB = await call(b, 'vibe_v5_blueprint', { action: 'propose', text: '# 蓝图 B\n\n第二版（研究员起草）。', member: 'r-1', path: PATH }, { turn: 'r-1' })
  ok(draftB.ok === true && typeof draftB.id === 'string', 'setup：第二份草案（准备走办公会那条路）', draftB && (draftB.code || draftB.id))
  const contB = await call(b, 'vibe_v5_blueprint', { action: 'propose', text: '院士补充（共同设计）：按周切分里程碑。', member: 'r-acad', path: PATH }, { turn: 'r-acad' })
  ok(contB.ok === true && contB.id === draftB.id, 'setup：第二份草案也由两席补完', contB && (contB.code || contB.id))
  const officeAdopt = await call(b, 'vibe_v5_blueprint',
    { action: 'adopt', draft: draftB.id, member: 'r-acad', path: PATH })
  ok(officeAdopt.ok === true, '★ 没有席位席的（root/办公会）调用仍能按参数里的院士 id 采纳（既有承诺不变）', officeAdopt && (officeAdopt.code || officeAdopt.ok))
} catch (error) {
  failed++
  failures.push('THREW ' + (error && error.stack ? error.stack : String(error)))
  console.error('  FAIL THREW ' + (error && error.stack ? error.stack : String(error)))
} finally {
  try { await rm(ROOT, { recursive: true, force: true, maxRetries: 10 }) } catch { /* 临时目录清不掉不影响断言 */ }
}

console.log('\n=== VMU WAVE2 SEAT HONESTY: ' + passed + ' passed, ' + failed + ' failed ===')
if (failed > 0) {
  console.error('\nfailures:\n' + failures.map((f) => ' - ' + f).join('\n'))
  process.exitCode = 1
} else {
  console.log('ALL GREEN')
}

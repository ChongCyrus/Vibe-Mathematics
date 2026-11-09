// RUN 258 / TB-2649 (P0-1): 声明闸的权威必须是「实际效果」，不是「manifest 里提到过这个键」。
//
// 修复前（audit round14b P0-1 实测，probe1-packgate.mjs 原文）：
//   · kernel/pack.js:175-177 `hit = PACK_DECLARATION_KEYS.filter(k => m[k] !== undefined)` 把每个提到的键都记进
//     declaredKeysByManifest；连落进 else 分支（:202-204）被推 unsupported 的 office / agendaStateMachine 也算；
//   · 于是闸 :675-682 `declared.filter(k => !folded.includes(k))` 永远认为它们已折；
//   · 实测：只申报 office 的 manifest ⇒ appliedPacks=[{id:"zero-effect-inst",applied:0}]（接受但零效果），
//     而同一个 manifest 若不在 config.packManifests 里会正确拒 VMU_PACK_DECLARATION_TOO_LATE；
//   · kernel/pack.js:149 的 hint 恰好教用户走「静默零效果」这条路；unsupported 全树无读者；
//   · validatePack :226-230 只查四个键，office / agendaStateMachine 任意值都收。
//
// 本套件的判据是外部可观测行为：没有消费者的声明必须被具名拒（VMU_PACK_DECLARATION_UNCONSUMED），
// 真能折叠的声明必须真生效（applied>0 且设置快照可见），unsupported 必须有读者（appliedPacks / leader 回执），
// 且负例证明这条判据不是同义反复（只申报 office 的 manifest 在「提到即算折叠」的旧权威下会被接受）。
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

// TB-2681: the checkout is derived, never written down; VMU_REPO lets CI point at another clone.
const REPO = process.env.VMU_REPO || fileURLToPath(new URL('..', import.meta.url)).replace(/[\\/]$/, '')
const ENTRY = join(REPO, 'vibe-math-vmu', 'vibe-math-vmu.js')
const entry = await import(pathToFileURL(ENTRY).href)
const packModule = await import(pathToFileURL(join(REPO, 'vibe-math-vmu', 'kernel', 'pack.js')).href)

let passed = 0
let failed = 0
const ok = (cond, msg, extra) => { if (cond) { passed += 1 } else { failed += 1; console.log('FAIL: ' + msg + (extra !== undefined ? ' -> ' + JSON.stringify(extra) : '')) } }
const isEmptyish = (v) => v === '' || v === null || v === undefined || (Array.isArray(v) && v.length === 0) || (typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length === 0)
const eq = (a, b, msg) => {
  // non-vacuous precondition FIRST: two empty values compare equal without proving anything.
  const bothEmpty = isEmptyish(a) && isEmptyish(b)
  ok(!bothEmpty, msg + ' (precondition: non-vacuous comparison)', { bothEmpty: true })
  ok(JSON.stringify(a) === JSON.stringify(b), msg, { got: a, want: b })
}

const boot = async (config = {}) => {
  const specs = []
  const ctx = {
    effect(fn) { return fn() },
    on() { return () => {} },
    tools: { register: async (spec) => { specs.push(spec); return () => {} } },
    services: { register: async () => () => {} },
  }
  const handle = entry.apply(ctx, Object.assign({ clock: () => 1700000000000 }, config))
  await handle.ready()
  return { handle, kernel: handle.kernel, specOf: (n) => specs.find((x) => x.name === n) }
}

async function receipt(b, name, args) {
  const spec = b.specOf(name)
  ok(!!spec, 'tool ' + name + ' 存在')
  if (!spec) return null
  const out = await spec.execute(args || {}, {})
  return typeof out === 'string' ? JSON.parse(out) : out
}

const bases = []
const newRoot = async (tag) => { const r = await mkdtemp(join(tmpdir(), 'vmu-run258-decl-' + tag + '-')); bases.push(r); return r }

try {
  // ── §0 源码形状：隔离常量、权威来自 folded、闸顺序、入口把 unsupported 交出去 ────────────────
  {
    const PACK_SRC = await readFile(join(REPO, 'vibe-math-vmu/kernel/pack.js'), 'utf8')
    const ENTRY_SRC = await readFile(join(REPO, 'vibe-math-vmu/vibe-math-vmu.js'), 'utf8')
    ok(Array.isArray(packModule.PACK_DECLARATION_NO_CONSUMER_KEYS), '(1) 无消费者键表被导出（PACK_DECLARATION_NO_CONSUMER_KEYS）', packModule.PACK_DECLARATION_NO_CONSUMER_KEYS)
    eq(packModule.PACK_DECLARATION_NO_CONSUMER_KEYS && packModule.PACK_DECLARATION_NO_CONSUMER_KEYS.slice().sort(), ['agendaStateMachine', 'office'], '(2) 无消费者键表恰好是 office / agendaStateMachine')
    const tooLate = packModule.PACK_DECLARATION_TOO_LATE_KEYS || []
    ok(tooLate.includes('phases') && tooLate.includes('noticeBlock') && tooLate.includes('meetingTypeCatalog'), '(3) 太晚闸仍覆盖 phases/noticeBlock/meetingTypeCatalog', tooLate)
    ok(!tooLate.includes('office') && !tooLate.includes('agendaStateMachine'), '(4) 无消费者的两个键不再混在「太晚」里（错码换成具名的 UNCONSUMED）', tooLate)
    ok(PACK_SRC.includes("'VMU_PACK_DECLARATION_UNCONSUMED'"), '(5) 新增具名拒绝码 VMU_PACK_DECLARATION_UNCONSUMED')
    ok(PACK_SRC.includes('declaredKeysByManifest.set(id, foldedKeys)'), '(6) 折叠台账只收成功折叠的键（foldedKeys），不再收「提到过」的键')
    ok(PACK_SRC.includes('unsupportedByManifest'), '(7) unsupported 有按 manifest 的读者出口（unsupportedByManifest）')
    ok(ENTRY_SRC.includes('unsupportedDeclarations'), '(8) 入口把 unsupported 声明交给 loader（unsupportedDeclarations）')
  }

  // ── §1 负例（改前红）：只申报 office 的 manifest 不许「接受但零效果」──────────────────────
  {
    const ONLY_OFFICE = { id: 'office-only', office: ['chair', 'member'] }
    const b = await boot({ root: await newRoot('office-only'), packs: [ONLY_OFFICE], packManifests: [ONLY_OFFICE] })
    const applied = b.handle && typeof b.handle.appliedPacks === 'function' ? b.handle.appliedPacks() : []
    const errors = typeof b.handle.packErrors === 'function' ? b.handle.packErrors() : []
    ok(!applied.some((a) => a && a.id === 'office-only'), '(9) 没有消费者的声明不再被 APPLIED（appliedPacks 不含 office-only）', applied)
    ok(errors.some((e) => e && e.code === 'VMU_PACK_DECLARATION_UNCONSUMED' && String(e.message).includes('office')), '(10) boot 存活且 packErrors 里是具名拒绝 VMU_PACK_DECLARATION_UNCONSUMED 且点名 office', errors)
    const named = errors.find((e) => e && e.code === 'VMU_PACK_DECLARATION_UNCONSUMED') || {}
    ok(/no consumer/i.test(String(named.message)), '(11) 拒绝信息说明「没有消费者」而不是含糊的失败', named.message)
    ok(String(named.message).includes('office'), '(12) 拒绝点名具体键（office）', named.message)
    // 同一形状的 agendaStateMachine 也必须被同一道闸拦住（不是只修 office 的补丁）
    const ONLY_AGENDA = { id: 'agenda-only', agendaStateMachine: { draft: ['review'] } }
    const b2 = await boot({ root: await newRoot('agenda-only'), packs: [ONLY_AGENDA] })
    const err2 = typeof b2.handle.packErrors === 'function' ? b2.handle.packErrors() : []
    const applied2 = typeof b2.handle.appliedPacks === 'function' ? b2.handle.appliedPacks() : []
    ok(!applied2.some((a) => a && a.id === 'agenda-only') && err2.some((e) => e && e.code === 'VMU_PACK_DECLARATION_UNCONSUMED' && String(e.message).includes('agendaStateMachine')), '(13) 未预折的 agendaStateMachine 声明同样具名拒（不是只修 office）', { applied2, err2 })
  }

  // ── §2 正例：真能折的声明必须真生效（正例只证明「能通过」）──────────────────────────────
  {
    const REAL_ONE = { id: 'phase-inst', phases: ['audit-intake'], recordTracks: ['thesis'] }
    const root2 = await newRoot('real-fold')
    const b = await boot({ root: root2, packs: [REAL_ONE], packManifests: [REAL_ONE] })
    const applied = b.handle.appliedPacks()
    const row = applied.find((a) => a && a.id === 'phase-inst')
    ok(!!row, '(14) 真能折的 manifest 正常 APPLIED', applied)
    ok(row && Number(row.applied) > 0, '(15) applied > 0（不是零效果接受）', row && row.applied)
    ok(JSON.stringify(b.kernel.settingsSnapshot()['vmu.tasks.stages']).includes('audit-intake'), '(16) 折叠的阶段真的进了构造期设置', b.kernel.settingsSnapshot()['vmu.tasks.stages'])
    ok(row && row.declarations && Array.isArray(row.declarations.folded) && row.declarations.folded.includes('phases') && row.declarations.folded.includes('recordTracks'), '(17) 回执的 declarations.folded 列出真折的键（读者能区分折了哪些）', row && row.declarations)
    ok(row && row.declarations && Array.isArray(row.declarations.unsupported) && row.declarations.unsupported.length === 0, '(18) 全部折成功时 declarations.unsupported 是空数组（不是 undefined）', row && row.declarations)
    // 直接调用折叠实现：台账只收折成功的键，unsupported 有名字
    const direct = packModule.foldPackDeclarations([{ id: 'p-office', phases: ['ph'], office: ['chair'], agendaStateMachine: {} }], {})
    ok(direct && Array.isArray(direct.unsupported) && direct.unsupported.some((u) => u.key === 'office') && direct.unsupported.some((u) => u.key === 'agendaStateMachine'), '(19) 折叠实现把两个无消费者键记进 unsupported（具名，不是丢掉）', direct && direct.unsupported)
    const mapped = direct && direct.declaredKeysByManifest && direct.declaredKeysByManifest.get('p-office')
    ok(Array.isArray(mapped) && mapped.includes('phases'), '(20) 折叠台账含真折的 phases', mapped)
    ok(!(Array.isArray(mapped) ? mapped : []).includes('office') && !(Array.isArray(mapped) ? mapped : []).includes('agendaStateMachine'), '(21) 折叠台账不含 unsupported 的键（旧的「提到即算折叠」正是缺口）', mapped)
    ok(direct && direct.unsupportedByManifest && (direct.unsupportedByManifest.get('p-office') || []).length === 2, '(22) unsupportedByManifest 按 manifest 记两条（unsupported 不再是只写不读）', direct && direct.unsupportedByManifest)
    // 形状错的声明同样不许进台账（防止「写坏了也算折叠」）
    const badShape = packModule.foldPackDeclarations([{ id: 'p-bad', phases: 'not-an-array' }], {})
    ok(!((badShape.declaredKeysByManifest.get('p-bad')) || []).includes('phases'), '(23) 形状错的 phases 不进折叠台账（写坏了不算折叠）', badShape.declaredKeysByManifest.get('p-bad'))
  }

  // ── §3 太晚 = 仍走原码；无消费者 = 新码（两个码不许混用）────────────────────────────────
  {
    const bV5 = await boot({ root: await newRoot('late'), packs: ['v5r'] })
    const late = await receipt(bV5, 'vibe_vmu_pack', { action: 'apply', manifest: JSON.stringify({ id: 'late-pack', phases: ['late-phase'] }) })
    ok(late && late.ok === false && late.code === 'VMU_PACK_DECLARATION_TOO_LATE', '(24) 后声明的 phases 仍拒 VMU_PACK_DECLARATION_TOO_LATE（原语义未变）', late)
    ok(String(JSON.stringify(late)).includes('config.packManifests'), '(25) 太晚拒绝仍给出可达替代 config.packManifests', late)
    const officeLate = await receipt(bV5, 'vibe_vmu_pack', { action: 'apply', manifest: JSON.stringify({ id: 'office-late', office: ['chair'] }) })
    eq(officeLate && officeLate.code, 'VMU_PACK_DECLARATION_UNCONSUMED', '(26) 后声明的 office 换新码：VMU_PACK_DECLARATION_UNCONSUMED（「没消费者」不是「太晚」）')
    const hint = String((officeLate && officeLate.hint) || '')
    ok(hint.includes('REACHABLE INSTEAD:'), '(27) 新拒绝的 hint 带 ASCII 契约标记 REACHABLE INSTEAD:', hint)
    ok(/drop/i.test(hint) && hint.includes('office'), '(28) hint 指向真可达动作（删掉 office），不再教用户走静默零效果的路', hint)
    const facts = (officeLate && officeLate.facts) || {}
    ok(Array.isArray(facts.key) && facts.key.includes('office'), '(29) 拒绝事实点名键 office', facts)
    ok(facts.consumer === null || facts.consumer === undefined, '(30) 拒绝事实说明 consumer 不存在（具名缺失，不是含糊）', facts)
    ok(/no consumer/i.test(String((officeLate && officeLate.message) || '')), '(31) 拒绝文案明说没有消费者（agent 读到的第一句就是真原因）', officeLate && officeLate.message)
  }

  // ── §4 plan() 先说真话：形状问题进 problems，无消费者键进 warnings ────────────────────────
  {
    const b = await boot({ root: await newRoot('plan'), packs: [] })
    const beforePlan = b.handle.appliedPacks().length
    const p1 = b.handle.packLoader().plan({ id: 'bad-office', office: 'chair' })
    ok(p1 && p1.ok === false, '(32) 形状错的 office（字符串）plan() 就拒，不是等到 apply 才炸', p1)
    ok(p1 && Array.isArray(p1.problems) && p1.problems.some((s) => String(s).includes('office')), '(33) plan 的 problems 点名 office 的形状要求', p1 && p1.problems)
    const p2 = b.handle.packLoader().plan({ id: 'bad-agenda', agendaStateMachine: 3 })
    ok(p2 && p2.ok === false && (p2.problems || []).some((s) => String(s).includes('agendaStateMachine')), '(34) 形状错的 agendaStateMachine plan() 就拒', p2)
    const p3 = b.handle.packLoader().plan({ id: 'good-office', office: ['chair'], agendaStateMachine: { draft: ['review'] } })
    ok(p3 && p3.ok === true, '(35) 形状合法的无消费者声明 plan() 仍 ok（能规划，但 apply 会具名拒）', p3)
    ok((p3.warnings || []).some((w) => String(w).includes('office') && /no consumer/i.test(String(w))), '(36) plan 的 warnings 明说这个声明没有消费者（plan 与 apply 不许各说一套）', p3 && p3.warnings)
    ok(b.handle.appliedPacks().length === beforePlan, '(37) plan() 是纯的：连调三次不同形状的计划后 appliedPacks 一条不增', { before: beforePlan, after: b.handle.appliedPacks().length })
  }

  // ── §5 第一方 packs 启动路径不许被封死（真回归风险）──────────────────────────────────────
  {
    const b = await boot({ root: await newRoot('first-party'), packs: ['v5r'] })
    const applied = b.handle.appliedPacks()
    ok(applied.some((a) => a && String(a.id).includes('v5r')), '(38) 第一方 v5r 仍在构造期 APPLIED（新闸门保持只掐无消费者声明）', applied)
    const errs = b.handle.packErrors()
    ok(!(errs || []).some((e) => e && /VMU_PACK_DECLARATION/.test(String(e.code))), '(39) 第一方启动不产生声明类拒绝', errs)
  }
} finally {
  for (const r of bases) { try { await rm(r, { recursive: true, force: true, maxRetries: 5 }) } catch { /* best effort */ } }
}

console.log(String.fromCharCode(10) + '=== RUN-258 PACK DECLARATION GATE: ' + passed + ' passed, ' + failed + ' failed ===')
process.exit(failed === 0 ? 0 : 1)

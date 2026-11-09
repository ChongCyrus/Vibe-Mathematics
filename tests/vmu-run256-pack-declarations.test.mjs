// RUN 256 / TB-2618 (P0-2): 声明了 ≠ 生效了 —— pack 的声明面必须在 createKernel 之前折叠。
//
// 修复前（audit round15 §2 实测，原文）：
//   · inline manifest 的 phases / recordTracks / meetingTypeCatalog / noticeBlock：validatePack 接受，零效果；
//   · vmu.records.tracks=['thesis'] 时 settingSource 说已应用，records.put({track:'thesis'}) 抛 unknown record track；
//   · vibe_v5_message {to:'all'} 在任何真实入口拒 VMU_ENGINE_UNAVAILABLE（no audience seam is bound）。
//
// 本套件的判据是外部行为：折叠后的声明必须在构造期的消费者身上看见（写 thesis 记录成功、开 audit 类型会议成功、
// 任务阶段进 settings、席位可雇），太晚的声明必须具名拒（VMU_PACK_DECLARATION_TOO_LATE + facts.key/requiredBefore），
// 且 {to:'all'} 真的把邮件投进每个成员的箱子里。
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

// TB-2681: the checkout is derived, never written down; VMU_REPO lets CI point at another clone.
const REPO = process.env.VMU_REPO || fileURLToPath(new URL('..', import.meta.url)).replace(/[\\/]$/, '')
const ENTRY = join(REPO, 'vibe-math-vmu', 'vibe-math-vmu.js')
const entry = await import(pathToFileURL(ENTRY).href)
const FIXTURE_DIR = join(REPO, 'tests', 'fixtures', 'minimal-pack')
const FIXTURE = await import(pathToFileURL(join(FIXTURE_DIR, 'index.js')).href)

let passed = 0
let failed = 0
const ok = (cond, msg, extra) => { if (cond) { passed += 1 } else { failed += 1; console.log('FAIL: ' + msg + (extra !== undefined ? ' -> ' + JSON.stringify(extra) : '')) } }
const isEmptyish = (v) => v === '' || v === null || v === undefined || (Array.isArray(v) && v.length === 0) || (typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length === 0)
const eq = (a, b, msg) => {
  // non-vacuous precondition: two empty values compare equal without proving anything, so this guard runs FIRST.
  const bothEmpty = isEmptyish(a) && isEmptyish(b)
  ok(!bothEmpty, msg + ' (precondition: non-vacuous comparison)', { bothEmpty: true })
  ok(JSON.stringify(a) === JSON.stringify(b), msg, { got: a, want: b })
}

const boot = async (config = {}) => {
  const specs = []
  const registrations = []
  const ctx = {
    effect(fn) { return fn() },
    on() { return () => {} },
    tools: { register: async (spec) => { specs.push(spec); return () => {} } },
    services: { register: async (name, impl) => { registrations.push({ name, impl }); return () => {} } },
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
const newRoot = async (tag) => { const r = await mkdtemp(join(tmpdir(), 'vmu-run256-decl-' + tag + '-')); bases.push(r); return r }

try {
  // ── §0 源码形状：折叠函数只有一处，且 loader 真的会拒太晚的声明 ─────────────────────────────
  {
    const { readFile } = await import('node:fs/promises')
    const PACK_SRC = await readFile(join(REPO, 'vibe-math-vmu/kernel/pack.js'), 'utf8')
    const ENTRY_SRC = await readFile(join(REPO, 'vibe-math-vmu/vibe-math-vmu.js'), 'utf8')
    ok(PACK_SRC.includes('export function foldPackDeclarations('), '(1) kernel/pack.js 导出唯一的 foldPackDeclarations')
    ok((PACK_SRC.match(/PACK_DECLARATION_KEYS/g) || []).length >= 2, '(2) 声明键表是唯一清单（表 + 消费处）')
    ok(PACK_SRC.includes("'VMU_PACK_DECLARATION_TOO_LATE'"), '(3) 太晚声明有具名拒绝码')
    ok(PACK_SRC.includes('requiredBefore') && PACK_SRC.includes('declaredAt'), '(4) 拒绝事实带 requiredBefore/declaredAt')
    ok(ENTRY_SRC.includes("config.packManifests") && ENTRY_SRC.includes('foldPackDeclarations('), '(5) 入口在 createKernel 之前折叠 config.packManifests')
    ok(ENTRY_SRC.indexOf('foldPackDeclarations(') < ENTRY_SRC.indexOf('const kernel = createKernel('), '(6) 折叠发生在 createKernel 之前（顺序即语义）')
  }

  // ── §1 折叠即生效：同一个 manifest 声明的四类东西都必须在构造期消费者身上看见 ────────────────
  const MANIFEST = {
    id: 'audit-inst',
    phases: ['audit-intake', 'audit-verdict'],
    recordTracks: ['thesis'],
    meetingTypeCatalog: ['audit'],
    slots: [{ id: 'auditor', title: '审计员' }, { id: 'clerk', title: '书记' }],
  }
  const root = await newRoot('effective')
  const b = await boot({ root, packs: [], packManifests: [MANIFEST] })
  const k = b.kernel
  ok(JSON.stringify(k.settingsSnapshot()['vmu.records.tracks']).includes('thesis'), '(7) 折叠后的轨道白名单进了解析设置（thesis）', k.settingsSnapshot()['vmu.records.tracks'])
  ok(JSON.stringify(k.settingsSnapshot()['vmu.tasks.stages']).includes('audit-intake'), '(8) 折叠后的阶段进了解析设置', k.settingsSnapshot()['vmu.tasks.stages'])
  ok(JSON.stringify(k.settingsSnapshot()['vmu.meetings.typeCatalog']).includes('audit'), '(9) 折叠后的会议类型目录进了解析设置', k.settingsSnapshot()['vmu.meetings.typeCatalog'])
  let put = null
  try { put = await k.records.put({ track: 'thesis', kind: 'finding', title: 'T1', body: 'claim', settled: true }) } catch (e) { put = { ok: false, code: (e && e.code) || 'THREW', message: String((e && e.message) || e) } }
  ok(put && put.ok !== false, '(10) 声明的新轨道真的可写：records.put({track:"thesis"}) 不抛 unknown record track', put && (put.code || put.message))
  const roles = k.lateBind ? null : (k.members ? k.members.roles() : null)
  ok(roles && roles.some((r) => r && (r.id === 'auditor' || JSON.stringify(r).includes('auditor'))), '(11) 折叠的 slots 真的建了名册（auditor 席位可见）', roles)
  const hire = await k.members.hire({ id: 'a-1', slot: 'auditor' })
  ok(hire && hire.ok !== false, '(12) 折叠的席位真的可雇', hire && hire.code)
  const opened = await k.meetings.open({ type: 'audit', chair: 'a-1', size: 1, agenda: '声明即生效' })
  ok(opened && opened.ok !== false, '(13) 折叠的会议类型真的可开（type:"audit" 不拒 NO_SUCH_OBJECT）', opened && (opened.code || opened.message))
  const bad = await boot({ root: await newRoot('badshape'), packs: [], packManifests: [{ id: 'bad', recordTracks: 'thesis' }] })
  let badList = null
  try { badList = bad.kernel.records.list({ track: 'thesis' }) } catch (e) { badList = { ok: false, code: e && e.code } }
  ok(badList && badList.ok === false && badList.code === 'VMU_INVALID_ARGUMENT', '(14) 畸形声明不静默折叠（recordTracks 非数组 ⇒ 白名单不变，写/读仍在具名拒绝）', badList)
  // ★ 第一方 packs 在构造期应用（Lead m06664 要求：新闸门不许封死内核自己的启动路径）
  const firstParty = await boot({ root: await newRoot('first-party'), packs: ['v5r'] })
  const applied = firstParty.handle && typeof firstParty.handle.appliedPacks === 'function' ? firstParty.handle.appliedPacks() : null
  ok(Array.isArray(applied) && applied.some((x) => JSON.stringify(x).includes('v5r')), '(14b) 第一方 packs 在构造期应用：boot 成功且 appliedPacks 含 v5r', applied)
  // ★ 后声明也必须真生效：kernel.declareTracks 之后 records 白名单立即可写
  const lateTracks = firstParty.kernel.declareTracks(['paper', 'late-track-probe'])
  let latePut = null
  try { latePut = await firstParty.kernel.records.put({ track: 'late-track-probe', kind: 'finding', title: 'L1', body: 'late', settled: true }) } catch (e) { latePut = { ok: false, code: e && e.code, message: String((e && e.message) || e) } }
  ok(lateTracks && lateTracks.ok !== false && latePut && latePut.ok !== false, '(14c) declareTracks 后声明在 records 面生效（写 late-track-probe 成功）', latePut)
  // ★ RUN 256 回炉（task-99 rev4）：回执必须承诺 enforced[] / fired[]（内核回执不变量；audit-receipt-fields 的判据），
  //   且 fired 只报「真被加入的轨」——已存在的轨（v5r 的 paper）不算、重复声明不假报。
  ok(lateTracks && Array.isArray(lateTracks.enforced) && Array.isArray(lateTracks.fired), '(14d) declareTracks 回执带 enforced[] 与 fired[]（读者能判断声明被哪些闸门看见过）', lateTracks && { enforced: lateTracks.enforced, fired: lateTracks.fired })
  ok(lateTracks && lateTracks.enforced.includes('vmu.records.tracks'), '(14e) enforced 点名本次评估的开关（vmu.records.tracks）', lateTracks && lateTracks.enforced)
  ok(lateTracks && lateTracks.fired.includes('late-track-probe') && !lateTracks.fired.includes('paper'), '(14f) fired 只列真被加入的轨：late-track-probe 在，已存在的 paper 不在（重复声明不假报）', lateTracks && lateTracks.fired)
  const againTracks = firstParty.kernel.declareTracks(['late-track-probe'])
  ok(againTracks && Array.isArray(againTracks.fired) && againTracks.fired.length === 0, '(14g) 重复声明同一条轨：fired 为空数组（不假报第二次加入）', againTracks && againTracks.fired)

  // ── §2 太晚的声明：必须具名拒，绝不「接受但零效果」 ───────────────────────────────────────
  {
    const bV5 = await boot({ root: await newRoot('late'), packs: ['v5r'] })
    const late = await receipt(bV5, 'vibe_vmu_pack', { action: 'apply', manifest: JSON.stringify({ id: 'late-pack', phases: ['late-phase'] }) })
    ok(late && late.ok === false, '(15) 太晚的声明不再被接受', late)
    eq(late && late.code, 'VMU_PACK_DECLARATION_TOO_LATE', '(16) 具名拒绝码 VMU_PACK_DECLARATION_TOO_LATE')
    const facts = (late && (late.facts || late)) || {}
    ok(Array.isArray(facts.key) && facts.key.includes('phases') || String(JSON.stringify(late)).includes('phases'), '(17) 拒绝指名是哪条声明（phases）', late)
    ok(String(JSON.stringify(late)).includes('createKernel'), '(18) 拒绝说明必须声明在哪里（createKernel 之前）', late)
    ok(String(JSON.stringify(late)).includes('config.packManifests'), '(19) 拒绝给出可达替代（config.packManifests）', late)
  }

  // ★ 后声明的 recordTracks 走 declareTracks 机制：接受且真生效（不是「接受但零效果」）
  {
    const bLate = await boot({ root: await newRoot('late-tracks'), packs: ['v5r'] })
    const rcLate = await receipt(bLate, 'vibe_vmu_pack', { action: 'apply', manifest: JSON.stringify({ id: 'late-tracks-pack', recordTracks: ['thesis-late'] }) })
    ok(rcLate && rcLate.ok !== false, '(19b) 后声明的 recordTracks 由 declareTracks 机制接受', rcLate)
    let latePut2 = null
    try { latePut2 = await bLate.kernel.records.put({ track: 'thesis-late', kind: 'finding', title: 'LT', body: 'effective', settled: true }) } catch (e) { latePut2 = { ok: false, code: e && e.code, message: String((e && e.message) || e) } }
    ok(latePut2 && latePut2.ok !== false, '(19c) 后声明之后 records 白名单真的延长（写 thesis-late 成功）', latePut2)
  }

  // ── §3 audience seam：{to:'all'} 真的投到每个席位，而不是回执说发全体、实际一条都发不出 ────────
  {
    const root3 = await newRoot('audience')
    const b3 = await boot({ root: root3, packs: ['v5r'] })
    const k3 = b3.kernel
    await k3.members.hire({ id: 'a-1', slot: 'chair' })
    await k3.members.hire({ id: 'c-1', slot: 'member' })
    const sent = await receipt(b3, 'vibe_v5_message', { to: 'all', subject: '全体通知', content: 'hello all' })
    ok(sent && sent.ok !== false, '(20) {to:"all"} 不再拒 VMU_ENGINE_UNAVAILABLE', sent)
    ok(Array.isArray(sent && sent.mailIds) && sent.mailIds.length === 2, '(21) 回执的 mailIds 逐成员各一条（2 条）', sent && sent.mailIds)
    await new Promise((r) => setTimeout(r, 60))
    const box1 = await k3.mailbox.list('a-1')
    const box2 = await k3.mailbox.list('c-1')
    ok(box1 && box1.ok !== false && JSON.stringify(box1).includes('全体通知'), '(22) 第一位成员真的在箱子里读到', box1 && box1.code)
    ok(box2 && box2.ok !== false && JSON.stringify(box2).includes('全体通知'), '(23) 第二位成员真的在箱子里读到', box2 && box2.code)
    const st = k3.mailbox.status()
    ok(st && st.mechanism && st.mechanism.hasAudienceSeam === true, '(24) status().mechanism.hasAudienceSeam === true', st && st.mechanism)
  }

  // ── §4 无声明 = 零机制：不声明 packManifests 的内核行为与今天一致 ───────────────────────────
  {
    const root4 = await newRoot('none')
    const b4 = await boot({ root: root4, packs: [] })
    const tracks4 = b4.kernel.settingsSnapshot()['vmu.records.tracks']
    ok(!JSON.stringify(tracks4 === undefined ? [] : tracks4).includes('thesis'), '(25) 无声明时不凭空长出新轨道（零机制）', tracks4)
  }
  // ── §5 可定义性夹具：tests/fixtures/minimal-pack（≤120 行 manifest + 1 handler，零内核改动）──
  {
    const fixtureSource = await readFile(join(FIXTURE_DIR, 'index.js'), 'utf8')
    const lineCount = fixtureSource.split(String.fromCharCode(10)).length
    ok(lineCount <= 120, '(26) 夹具文件 ≤120 行（可定义性上限：不靠体积，靠声明）', { lineCount })
    ok((fixtureSource.match(/^import /gm) || []).length === 0, '(27) 夹具不 import 任何内核文件（没有第二份实现可抄）')
    ok(FIXTURE.PACK && Array.isArray(FIXTURE.PACK.middleware) && FIXTURE.PACK.middleware.length === 1
      && typeof FIXTURE.PACK.middleware[0].handler === 'function'
      && FIXTURE.PACK.middleware[0].handler === FIXTURE.HANDLER,
      '(28) 夹具的「1 个 handler」就是那一个 middleware handler（不是零，也不是一堆）')
    const fixtureRoot = await newRoot('minimal-fixture')
    const bf = await boot({ root: fixtureRoot, packs: [FIXTURE.PACK], packManifests: [FIXTURE.PACK] })
    const kf = bf.kernel
    const sset = kf.settingsSnapshot()
    ok(JSON.stringify(sset['vmu.records.tracks']).includes('thesis')
      && JSON.stringify(sset['vmu.tasks.stages']).includes('thesis-intake')
      && JSON.stringify(sset['vmu.meetings.typeCatalog']).includes('thesis-defense'),
      '(29) 夹具声明的阶段/轨道/会议类型都在构造期消费面上（设置快照里可见）', sset && { tracks: sset['vmu.records.tracks'], stages: sset['vmu.tasks.stages'], catalog: sset['vmu.meetings.typeCatalog'] })
    const fApplied = bf.handle && typeof bf.handle.appliedPacks === 'function' ? bf.handle.appliedPacks() : null
    ok(Array.isArray(fApplied) && fApplied.some((x) => JSON.stringify(x).includes('minimal-fixture')), '(30) 夹具作为 pack 真的被装载（appliedPacks 含 minimal-fixture）', fApplied)
    let fPut = null
    try { fPut = await kf.records.put({ track: 'thesis', kind: 'finding', title: '夹具论文', body: 'claim', settled: true }) } catch (e) { fPut = { ok: false, code: (e && e.code) || 'THREW', message: String((e && e.message) || e) } }
    ok(fPut && fPut.ok !== false, '(31) 零内核改动也能写自己的轨道记录（thesis）', fPut && (fPut.code || fPut.message))
    let fOpen = null
    try { fOpen = await kf.meetings.open({ type: 'thesis-defense', chair: 'a-1', size: 1, agenda: '夹具会议' }) } catch (e) { fOpen = { ok: false, code: (e && e.code) || 'THREW', message: String((e && e.message) || e) } }
    ok(fOpen && fOpen.ok !== false, '(32) 零内核改动也能开自己的会议类型（thesis-defense）', fOpen && (fOpen.code || fOpen.message))
    const handlerOut = await FIXTURE.HANDLER({ hook: 'turn/before' })
    ok(handlerOut && handlerOut.ok === true && handlerOut.hook === 'turn/before', '(33) 那个 handler 是可调用的真函数（不是声明占位）', handlerOut)
  }
} finally {
  for (const r of bases) { try { await rm(r, { recursive: true, force: true, maxRetries: 5 }) } catch { /* best effort */ } }
}

console.log('\n=== RUN-256 PACK DECLARATIONS: ' + passed + ' passed, ' + failed + ' failed ===')
process.exit(failed === 0 ? 0 : 1)

#!/usr/bin/env node
// tests/vmu-b3-c8-c10.test.mjs — 三处「已标 DONE、按规则原文验收却过不去」的洞（独立审计 2026-10）。
//
// 规则原文（docs/acceptance/rules-ledger.json）：
//   B3 「Verified 文件夹：只有布尔概率为 1 的命题或参考文献中命题才可加入。」
//   C8 「命题库……那些布尔概率为 1 的命题卡需标记为已 verified。」
//   C10「平时的一些命题的证明、对象的定义之类的 lean 代码**及其编译结果**……」
//
// 这个文件只测机制（不读提示词、不改台账），并且每条都测两个方向：
//   ① B3：p=1 的四条路（辩论 / 参考文献 / Lean 通过+conform / 已有 verified 行）各自在回执里给出**不同的**
//      `p1Route` 且 `p1RouteMeans` 非空；有证据却归不到路时**具名拒**（VMU_PACK_V5R_P1_NEEDS_DEBATE，p1Route:null），
//      不是静默接受。
//   ② C8：p=1 的命题卡从 `vibe_v5_read_library` 读出来带 `verifiedRef`（命中时有 id/title/at，未命中时诚实地是 null
//      且 `verifiedRefMeans` 说"没在 Verified 库里找到对得上的行"）；单卡读与列表读两个面都要有。
//   ③ C10：`vibe_v5_lean_archive` 登记的条目带编译结果（outcome/exitCode/diagnosticsTail/jobId/compileAt/at），
//      由**已经跑过**的那次作业填入；没跑过时是 `outcome:"not-measured"` 且 `outcomeMeans` 明说，不冒充 ok。
//
// 判据用的都是既有权威：`p1Intent` / `P1_ROUTES` / `findVerified`（经 tools.js 的读面），没有第二份解析器。
// 运行：`node tests/vmu-b3-c8-c10.test.mjs`（末行打印 passed=N failed=M）。
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'

import { p1Intent, P1_ROUTES, P1_ROUTE_MEANS } from '../vibe-math-vmu/packs/v5r/verification-gates.js'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..')
const ENTRY = join(REPO, 'vibe-math-vmu', 'vibe-math-vmu.js')

let passed = 0
let failed = 0
const failures = []
const ok = (cond, label, detail) => {
  if (cond) { passed++; console.log('  ok   ' + label); return true }
  failed++; failures.push(label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail).slice(0, 400)))
  console.error('  FAIL ' + label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail).slice(0, 400)))
  return false
}

const entry = await import(pathToFileURL(ENTRY).href)
const ROOT = await mkdtemp(join('D:/_tmp', 'vmu-b3c8c10-'))
const STMT = '若 G 是有限群且 H≤G，则 |H| 整除 |G|。'
const VALUE = '拉格朗日定理。'
const MOTIVE = 'B3/C8/C10：回执必须说清凭据是哪条路。'
const CITE = 'Dummit & Foote, Abstract Algebra, 3rd ed., Section 3.2 Theorem 7'

await mkdir(join(ROOT, 'Formal'), { recursive: true })
const LEAN_FILE = 'Formal/b3c8c10-gate.lean'
const LEAN_UNRUN = 'Formal/b3c8c10-never-run.lean'
await writeFile(join(ROOT, LEAN_FILE), 'theorem lagrange_aux : True := trivial\n', 'utf8')
await writeFile(join(ROOT, LEAN_UNRUN), 'theorem never_run : True := trivial\n', 'utf8')

/** 照 tests/vmu-run97-verified-gate.test.mjs 的 boot 写：宿主注入一个 `subprocess` 缝，Lean 面才存在。 */
const boot = async (config = {}) => {
  const state = { specs: [] }
  const subprocess = {
    resolveExecutable: async (name) => '/fake/bin/' + String(name),
    spawn: () => ({ done: Promise.resolve({ exitCode: 0, signal: null, stdout: 'Build completed successfully.\n', stderr: '' }), terminate() {} }),
  }
  const ctx = {
    effect(fn) { return fn() },
    on() { return () => {} },
    get: (what) => (what === 'subprocess' ? subprocess : undefined),
    tools: { register: async (spec) => { state.specs.push(spec); return () => {} } },
  }
  let NOW = 1000
  const handle = entry.apply(ctx, Object.assign({ clock: () => NOW + (NOW += 1000), packs: ['v5r'], root: ROOT }, config))
  await handle.ready()
  return { handle, kernel: handle.kernel, specOf: (name) => state.specs.find((s) => s.name === name) }
}
const call = async (b, name, args = {}) => {
  const spec = b.specOf(name)
  if (!spec) return { missing: name }
  let raw
  try { raw = await spec.execute(args, { kernel: b.kernel }) } catch (e) {
    return { thrown: true, code: e && e.code, message: String(e && e.message), hint: e && e.hint }
  }
  if (typeof raw === 'string') { try { return JSON.parse(raw) } catch { return { raw } } }
  return raw || {}
}
/** 一条回执是不是「具名拒」：ok:false + 指定 code（receipt 或 throw 两种形状都认）。 */
const refusedWith = (receipt, code) => !!receipt && receipt.ok === false && receipt.code === code

try {
  const b = await boot()
  const kernel = b.kernel
  await kernel.members.hire({ id: 'r-acad', slot: 'chair' })
  await kernel.members.hire({ id: 'r-1', slot: 'member' })

  // ── 0. 三条路是先声明的事实，不是回执里临时拼的字符串 ────────────────────────────────────────────────────────
  console.log('=== 0. B3 的路名是声明（P1_ROUTES / P1_ROUTE_MEANS），不是回执里现编的 ===')
  ok(P1_ROUTES.includes('debate') && P1_ROUTES.includes('literature') && P1_ROUTES.includes('lean-conformance'),
    '① 规则原文允许的三条路都在 P1_ROUTES 里', P1_ROUTES)
  ok(P1_ROUTES.includes('verified-row'),
    '② 第四条 verified-row 也具名列出（它不是新来源，是"早就定过了"的重述）', P1_ROUTES)
  ok(P1_ROUTES.length === 4, 'P1_ROUTES 声明正好四条路（非空守卫）')
  ok(P1_ROUTES.every((r) => typeof P1_ROUTE_MEANS[r] === 'string' && P1_ROUTE_MEANS[r].trim() !== ''),
    '③ 每一条路都有一句非空的中文说明（路由名不能是个没有含义的 enum）', P1_ROUTE_MEANS)

  // ── 1. B3：四条路各走一遍，回执必须给出不同的 p1Route + 非空 p1RouteMeans ───────────────────────────────────
  console.log('\n=== 1. B3：p=1 的四条路各自说清凭据，且四种路由名互不相同 ===')
  const routeOf = (receipt) => ({
    route: receipt && receipt.p1Route,
    means: receipt && receipt.p1RouteMeans,
    form: receipt && receipt.p1Evidence,
    ok: !!(receipt && receipt.ok === true),
  })

  // ① 参考文献：B2 的 literature_ref 已经是这条路，现在回执要说出来。
  const litCard = await call(b, 'vibe_v5_record_proposition', {
    statement: STMT, value: VALUE, motive: MOTIVE, p: 1, literature_ref: CITE, member: 'r-1' })
  const litRoute = routeOf(litCard)
  const litCardId = litCard && typeof litCard.recordId === 'string' ? litCard.recordId : null
  ok(litRoute.ok && litRoute.route === 'literature' && typeof litRoute.means === 'string' && litRoute.means.trim() !== '',
    '① 文献路径：p1Route="literature"，means 非空', litRoute)
  ok(litRoute.form === 'literature-reference', '① 旧的 p1Evidence 字段原样保留（只加不改）', litRoute)

  // ② 辩论：全体一致为 1 的裁决。
  // 注意：记录 id 由卡片内容派生（同样的 statement/value/motive 会落成同一行），所以这张卡必须与文献卡
  // 内容不同，否则它不是"另一张没 promote 过的卡"，而就是同一张。
  const debateCard = await call(b, 'vibe_v5_record_proposition', {
    statement: STMT, value: VALUE, motive: MOTIVE + '（辩论路径：全体一致 1）', p: 1, member: 'r-1',
    debate_ruling: { mode: 'unanimous', value: 1, ballotId: 'ballot-b3' } })
  const debateRoute = routeOf(debateCard)
  ok(debateRoute.ok && debateRoute.route === 'debate' && typeof debateRoute.means === 'string' && debateRoute.means.trim() !== '',
    '② 辩论路径：p1Route="debate"，means 非空', debateRoute)

  // ③ Lean 通过 + 符合性裁定 conform：先真跑一次 Lean（接缝注入，退出码 0），再拿这次作业作证据写 p=1。
  const leanRun = await call(b, 'vibe_v5_lean_run', { statement: 'True', file: LEAN_FILE })
  const leanJobId = leanRun && typeof leanRun.id === 'string' ? leanRun.id : null
  ok(!!leanJobId, '③ setup：Lean 作业已入队（作业 id 回执里给）', leanRun && (leanRun.code || leanRun.id))
  const settled = leanJobId ? await kernel.lean.settle(leanJobId) : null
  ok(!!settled && settled.state === 'settled' && settled.passed === true, '③ setup：作业结算为 settled/passed',
    settled && { state: settled.state, passed: settled.passed, exitCode: settled.exitCode })

  const leanCard = await call(b, 'vibe_v5_record_proposition', {
    statement: STMT, value: VALUE, motive: MOTIVE, p: 1, member: 'r-1',
    lean_job: leanJobId, lean_conformance: 'conform' })
  const leanRoute = routeOf(leanCard)
  ok(leanRoute.ok && leanRoute.route === 'lean-conformance' && typeof leanRoute.means === 'string' && leanRoute.means.trim() !== '',
    '③ Lean 路径：p1Route="lean-conformance"，means 非空', leanRoute)

  // ④ 已有 verified 行：先把文献卡 promote 进 Verified，再原样重写一次 p=1 —— 凭据是那一行，不是这次调用新造的证据。
  const promoted = await call(b, 'vibe_v5_verified_promote', {
    card: litCardId, warrant_kind: 'literature', literature_ref: CITE, member: 'r-acad' })
  ok(promoted && promoted.ok === true, '④ setup：文献卡可以被 promote 进 Verified 轨', promoted && (promoted.code || promoted.ok))
  // `toolVerifiedPromote` 把 `promoteVerified` 的返回值**展开**在回执顶层（不是 `promoted.promoted`），
  // 所以 Verified 行 id 就是回执的 `id` —— 测试要指回真行，就不能猜一个永远不会出现的嵌套键。
  const verifiedRowId = promoted && typeof promoted.id === 'string' ? promoted.id : null
  const rewrite = await call(b, 'vibe_v5_record_proposition', {
    id: litCardId, title: '', statement: STMT, value: VALUE, motive: MOTIVE, p: 1, member: 'r-1' })
  const verifiedRoute = routeOf(rewrite)
  ok(verifiedRoute.ok && verifiedRoute.route === 'verified-row' && typeof verifiedRoute.means === 'string' && verifiedRoute.means.trim() !== '',
    '④ verified-row 路径：p1Route="verified-row"，means 非空', verifiedRoute)

  const routes = [litRoute.route, debateRoute.route, leanRoute.route, verifiedRoute.route]
  ok(new Set(routes).size === 4, '⑤ 四条路产生四个**不同**的 p1Route（不是共用一个"有证据"的字符串）', routes)
  ok(routes.length > 0, '⑥ 本轮回执真的报了路（非空守卫）')
  ok(routes.every((r) => P1_ROUTES.includes(r)), '⑥ 每个 p1Route 都在声明的 P1_ROUTES 里', routes)

  // ── 2. B3：有证据却归不到路 ⇒ 具名拒，且拒绝文案写出规则原文允许的那三条路 ─────────────────────────────────
  console.log('\n=== 2. B3：归不到路（多数决、或 lore/conformance 缺失）⇒ 具名拒，不静默接受 ===')
  const majority = await call(b, 'vibe_v5_record_proposition', {
    statement: STMT, value: VALUE, motive: MOTIVE, p: 1, member: 'r-1',
    debate_ruling: { mode: 'majority', value: 1, ballotId: 'ballot-majority' } })
  ok(refusedWith(majority, 'VMU_PACK_V5R_P1_NEEDS_DEBATE'),
    '① 多数决不是"全体一致"，被 VMU_PACK_V5R_P1_NEEDS_DEBATE 具名拒', majority && (majority.code || majority.ok))
  ok(typeof majority.hint === 'string' && majority.hint.includes('辩论') && majority.hint.includes('参考文献') && majority.hint.includes('Lean'),
    '② 拒绝的 hint 写出三条路（辩论 / 参考文献 / Lean），不再只说"没辩论"', majority && majority.hint)

  const leanNoConform = await call(b, 'vibe_v5_record_proposition', {
    statement: STMT, value: VALUE, motive: MOTIVE, p: 1, member: 'r-1', lean_job: leanJobId })
  ok(refusedWith(leanNoConform, 'VMU_PACK_V5R_P1_NEEDS_DEBATE'),
    '③ Lean 通过但没有符合性裁定 conform ⇒ 具名拒（lean 通过本身不等于 p=1）',
    leanNoConform && (leanNoConform.code || leanNoConform.ok))

  // 直接测纯谓词：证据明明给了，但归不到 P1_ROUTES 里的任何一条路 ⇒ p1Route:null 的具名拒。
  const direct = p1Intent({ tool: 'vibe_v5_record_proposition', args: { p: 1 },
    card: { id: 'rec-direct' }, evidence: { verified: { conclusion: false, cardId: 'rec-direct' } } })
  ok(direct.ok === false && direct.code === 'VMU_PACK_V5R_P1_NEEDS_DEBATE' && direct.p1Route === null,
    '④ p1Intent：证据命中却不构成定论 ⇒ 具名拒且 p1Route:null（不是"放行但不说路"）', direct)
  ok(Array.isArray(direct.p1Routes) && direct.p1Routes.length > 0
    && direct.p1Routes.join('|') === P1_ROUTES.join('|'),
    '⑤ 拒绝回执本身带着 p1Routes，读者不必去翻源码才知道有哪三条路', direct.p1Routes)

  // ── 3. C8：p=1 的命题卡读出来要指回 Verified 那一行 ───────────────────────────────────────────────────────
  console.log('\n=== 3. C8：命题卡读面带 verifiedRef（命中 / 未命中两态） ===')
  const oneCard = await call(b, 'vibe_v5_read_library', { id: litCardId })
  const one = oneCard && oneCard.card ? oneCard.card : null
  ok(!!one && one.verifiedRef && typeof one.verifiedRef === 'object',
    '① 已 promote 的卡：单卡读面带 verifiedRef 对象', one && { id: one.id, verifiedRef: one.verifiedRef })
  ok(!!one && one.verifiedRef && typeof one.verifiedRef.id === 'string' && one.verifiedRef.id === verifiedRowId,
    '② verifiedRef.id 就是 Verified 库里那一行（指得回去，不是一个新 id）', one && one.verifiedRef)
  ok(!!one && one.verifiedRef && typeof one.verifiedRef.title === 'string' && one.verifiedRef.title.startsWith('已验证｜'),
    '③ verifiedRef.title 与 Verified 行的标题一致（前缀 已验证｜）', one && one.verifiedRef)
  ok(!!one && typeof one.verifiedRefMeans === 'string' && one.verifiedRefMeans.trim() !== '',
    '④ verifiedRefMeans 非空，说清这个引用指回什么', one && one.verifiedRefMeans)

  const debateCardId = debateCard && typeof debateCard.recordId === 'string' ? debateCard.recordId : null
  const missCard = await call(b, 'vibe_v5_read_library', { id: debateCardId })
  const miss = missCard && missCard.card ? missCard.card : null
  ok(!!miss && miss.verifiedRef === null,
    '⑤ 没 promote 过的 p=1 卡：verifiedRef 诚实地是 null（不是编一个）', miss && { id: miss.id, verifiedRef: miss.verifiedRef })
  ok(!!miss && typeof miss.verifiedRefMeans === 'string' && miss.verifiedRefMeans.includes('没在 Verified 库里找到'),
    '⑥ 未命中时 means 明说"没在 Verified 库里找到与这张卡对应的行"', miss && miss.verifiedRefMeans)

  const listRead = await call(b, 'vibe_v5_read_library', { track: 'propositions', limit: 50 })
  const cards = listRead && Array.isArray(listRead.cards) ? listRead.cards : []
  const listedHit = cards.filter((c) => c && String(c.id) === String(litCardId))[0] || null
  const listedMiss = cards.filter((c) => c && String(c.id) === String(debateCardId))[0] || null
  ok(!!listedHit && listedHit.verifiedRef && listedHit.verifiedRef.id === verifiedRowId,
    '⑦ 列表读（track/limit 过滤）里同一张卡也带 verifiedRef', listedHit && listedHit.verifiedRef)
  ok(!!listedMiss && listedMiss.verifiedRef === null, '⑧ 列表读里未命中的卡是 null', listedMiss && listedMiss.verifiedRef)
  ok(cards.length > 0 && cards.every((c) => Object.prototype.hasOwnProperty.call(c, 'verifiedRef')),
    '⑨ 每一张命题卡都有这个字段（null 也是字段，缺字段会被读成"这个框架不知道有这回事"）', cards.length)

  // 读面还有 member / kind 两个过滤（也是既有参数）：过滤后的条目也要带同一个引用，否则"能读列表"与
  // "读得到标记"就成了两个面。
  const filtered = await call(b, 'vibe_v5_read_library', { kind: 'proposition', member: 'r-1', limit: 5 })
  const filteredCards = filtered && Array.isArray(filtered.cards) ? filtered.cards : []
  const filteredHit = filteredCards.filter((c) => c && String(c.id) === String(litCardId))[0] || null
  ok(!!filteredHit && filteredHit.verifiedRef && filteredHit.verifiedRef.id === verifiedRowId,
    '⑩ kind/member 过滤后的列表条目同样带 verifiedRef（两个面同一判据）', filteredHit && filteredHit.verifiedRef)

  // ── 4. C10：Lean 归档条目带编译结果（已测量 / 未测量两态） ─────────────────────────────────────────────────
  console.log('\n=== 4. C10：Lean 归档条目带编译结果；没测过时如实 not-measured ===')
  const archivedMeasured = await call(b, 'vibe_v5_lean_archive', {
    kind: 'proof', name: 'lagrange_aux', file: LEAN_FILE, statement: 'True' })
  ok(archivedMeasured && archivedMeasured.ok === true, '① setup：同一文件已经跑过 Lean，归档成功',
    archivedMeasured && (archivedMeasured.code || archivedMeasured.ok))
  ok(archivedMeasured && archivedMeasured.outcome === 'ok', '② 归档回执 outcome="ok"（来自那次已结算的作业，不重跑）',
    archivedMeasured && { outcome: archivedMeasured.outcome, means: archivedMeasured.outcomeMeans })
  ok(archivedMeasured && archivedMeasured.exitCode === 0, '③ exitCode 是那次作业的退出码', archivedMeasured && archivedMeasured.exitCode)
  ok(archivedMeasured && typeof archivedMeasured.jobId === 'string' && archivedMeasured.jobId === leanJobId,
    '④ jobId 指回真正跑过的那次作业', archivedMeasured && archivedMeasured.jobId)
  ok(archivedMeasured && typeof archivedMeasured.at === 'number', '⑤ at 是归档时间（数字）', archivedMeasured && archivedMeasured.at)
  ok(archivedMeasured && typeof archivedMeasured.compileAt === 'number' && archivedMeasured.compileAt > 0,
    '⑥ compileAt 是那次作业结束的时间（编译结果不只说"ok"，还说"什么时候测的"）',
    archivedMeasured && { compileAt: archivedMeasured.compileAt })
  ok(archivedMeasured && typeof archivedMeasured.outcomeMeans === 'string' && archivedMeasured.outcomeMeans.trim() !== '',
    '⑦ outcomeMeans 说明这份编译结果从哪来', archivedMeasured && archivedMeasured.outcomeMeans)

  const archivedUnrun = await call(b, 'vibe_v5_lean_archive', {
    kind: 'lemma', name: 'never_run', file: LEAN_UNRUN, statement: 'True' })
  ok(archivedUnrun && archivedUnrun.ok === true && archivedUnrun.outcome === 'not-measured',
    '⑧ 没在这个文件上跑过 Lean ⇒ outcome="not-measured"（不冒充 ok）',
    archivedUnrun && { outcome: archivedUnrun.outcome, means: archivedUnrun.outcomeMeans })
  ok(archivedUnrun && archivedUnrun.exitCode === null, '⑨ 未测量时 exitCode 是 null（不是 0）', archivedUnrun && archivedUnrun.exitCode)
  ok(archivedUnrun && typeof archivedUnrun.outcomeMeans === 'string'
    && (archivedUnrun.outcomeMeans.includes('not-measured') || archivedUnrun.outcomeMeans.includes('没有在该')),
    '⑩ outcomeMeans 明说"没测过"这件事本身（读者不用猜 null 的含义）', archivedUnrun && archivedUnrun.outcomeMeans)

  // 读回面：lib() 与 read() 也要显示这些字段，而不是只有 archive() 那一刻的回执里有。
  const libRead = await call(b, 'vibe_v5_lean_lib', {})
  const libEntries = libRead && Array.isArray(libRead.entries) ? libRead.entries : []
  const measuredEntry = libEntries.filter((e) => e && e.name === 'lagrange_aux')[0] || null
  const unrunEntry = libEntries.filter((e) => e && e.name === 'never_run')[0] || null
  ok(!!measuredEntry && measuredEntry.outcome === 'ok' && measuredEntry.exitCode === 0 && typeof measuredEntry.at === 'number',
    '⑪ lean_lib 的条目带 outcome/exitCode/at（读回面要能显示，不只写入回执）', measuredEntry)
  ok(!!unrunEntry && unrunEntry.outcome === 'not-measured' && typeof unrunEntry.outcomeMeans === 'string',
    '⑫ lean_lib 的未测量条目仍是 not-measured，且带说明', unrunEntry)

  const oneArchive = await call(b, 'vibe_v5_lean_read', { name: 'lagrange_aux' })
  ok(oneArchive && oneArchive.ok === true && oneArchive.outcome === 'ok' && oneArchive.exitCode === 0,
    '⑬ lean_read 单条读回也带编译结果', oneArchive && { outcome: oneArchive.outcome, exitCode: oneArchive.exitCode })
  ok(oneArchive && typeof oneArchive.diagnosticsTail === 'string' || (oneArchive && oneArchive.diagnosticsTail === null),
    '⑭ diagnosticsTail 字段在（字符串或诚实的 null），不会整个字段消失',
    oneArchive && { tail: oneArchive.diagnosticsTail })
} finally {
  try {
    const { rm } = await import('node:fs/promises')
    await rm(ROOT, { recursive: true, force: true })
  } catch { /* a leftover temp dir is not a test failure */ }
}

console.log('\n=== B3 / C8 / C10: passed=' + passed + ' failed=' + failed + ' ===')
if (failed > 0) {
  console.log('failures:\n - ' + failures.join('\n - '))
  process.exitCode = 1
}

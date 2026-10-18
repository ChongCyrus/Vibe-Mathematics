// tests/vmu-v3-methods.test.mjs — PHASE 6 / **P0-4（方法库：卡/应用/改进）＋ P0-5（发明上报闭环）**。
//
// 这张卡要证明的不是"写了一个 middleware"，而是下面这些【都会失败】的事实：
//
//   ① 方法卡的应用记录**只在有 qid/dirId 上下文时追加**（无上下文 ⇒ 正文逐字节不变，且 `skippedApplications`
//      计数）；未知 method id **不丢**（入 `inventions` 轨）。
//   ② 改进历史 **v 号单调**（取既有最大 v + 1，不是数组长度）；`vmu.records.history.storeMode=full` 是
//      **构造期快照**，补进值层后 `records.history()` 的每一版都带 `snapshot`（对照 kernel 用 `diff` ⇒ 无快照）。
//   ③ `可信断言` 只收**已定论**（概率 1/0）的命题 id，未定论/不存在的逐条具名丢弃。
//   ④ **两级**：项目级/全局级（tag）+ 晋升阈值 3；`methodAutoPromote=false` 时只报告不晋升。
//      耐久库冻结修订 `<库记录 id>@<n>.md` 真的落到磁盘（`kernel/library.js` 的 commitRevision）。
//   ⑤ **P0-5**：`new_inventions` 入队；keeper 有产出 ⇒ 清队；keeper 无产出（空回执）⇒ **兜底建草稿卡且清队**；
//      兜底卡的幂等键是 `fallback:<sha256(发明记录 id)[:16]>`（崩溃后重建不会多一张）。
//   ⑥ keeper 派发只从 `v3/tick` 做；`turn/reply-parsed` 只消费/落盘/改写（K10 返回 JSON 对象文本）。
//
// RULE E（本仓的"不可能失败"守卫）：本文件不用 `.every(` 判可能为空的集合、不用 `filter(...).length===0`
// 的随形写法、不把断言塞进条件分支；集合类断言一律先钉住**具体条数**，再逐项 forEach。
import { readFileSync, existsSync, mkdtempSync, rmSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, join } from 'node:path'
import { tmpdir } from 'node:os'

import { createKernel } from '../vibe-math-vmu/kernel/index.js'
import { createPackLoader } from '../vibe-math-vmu/kernel/pack.js'
import { SETTING_DEFS } from '../vibe-math-vmu/settings/schema.js'
import { PACK } from '../vibe-math-vmu/packs/v3/index.js'
import { V3_TICK_TOPIC } from '../vibe-math-vmu/packs/v3/middleware/tick.js'
import { writeCard, parseCard } from '../vibe-math-vmu/packs/v3/middleware/dataplane.js'
import {
  V3_METHODS_MODULE, METHOD_TRACK, METHOD_KIND, INVENTION_TRACK, KEEPER_MEMBER,
  GLOBAL_PROMOTE_MIN_APPLICATIONS, LEVEL_TAGS, TAG_PREFIXES,
  v3MethodsStatus, loadMethodIndex, findMethod, pendingInventions, enqueueInvention,
  trustedAssertions, feedbackFromReply, keeperOutputFromReply, encodeFeedbackTag,
  createMethodCard, appendApplication, recordImprovement, consumeMethodFeedback,
  archiveMethodCard, draftIdemKey, draftCardFor, findDraftByIdemKey, fallbackFromPending,
  applyKeeperOutput, promoteMethodsToGlobal, keepDue, buildMethodDigest,
} from '../vibe-math-vmu/packs/v3/middleware/methods.js'

const HERE = dirname(fileURLToPath(import.meta.url))
const VMU = join(HERE, '..', 'vibe-math-vmu')
const DEFAULTS_FILE = join(VMU, 'packs', 'v3', 'settings', 'defaults.json')
const ENTRY = join(VMU, 'vibe-math-vmu.js')

let passed = 0
let failed = 0
const failures = []
const ok = (cond, label, detail) => {
  if (cond) { passed++; console.log('  ok   ' + label); return true }
  failed++; failures.push(label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  console.error('  FAIL ' + label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  return false
}

const PACK_DEFAULTS = (() => {
  const parsed = JSON.parse(readFileSync(DEFAULTS_FILE, 'utf8'))
  return parsed && typeof parsed.defaults === 'object' && parsed.defaults ? parsed.defaults : {}
})()
const clone = (o) => JSON.parse(JSON.stringify(o))
const sameList = (a, b) => Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.join('\u0000') === b.join('\u0000')
const ACK = JSON.stringify({ prioritize: 'ack' })
const responseOf = (reply) => JSON.stringify({ progress: reply })

/** 一个可推进的时钟 + 用真实值层建内核；`root` 为真时才发布 vmu.library（耐久归档需要它）。 */
function makeKernel({ overrides = {}, root = null } = {}) {
  const clockRef = { at: 1000 }
  const kernel = createKernel({ clock: () => clockRef.at, settings: Object.assign(clone(PACK_DEFAULTS), overrides), root })
  return { kernel, clockRef, records: kernel.records }
}

/** 真实装配（含回合投递接缝）：`replier({turn,text})` 决定成员回合的回答文本。 */
function boot({ replier = null, overrides = {}, root = null } = {}) {
  const delivered = []
  const clockRef = { at: 1000 }
  const kernel = createKernel({
    clock: () => clockRef.at,
    settings: Object.assign(clone(PACK_DEFAULTS), overrides),
    sections: PACK.sections,
    root,
    deliverTurn: async ({ turn, text }) => { delivered.push({ member: turn.member, text, task: turn.task, why: turn.why, statusBlock: turn.statusBlock }); return replier ? replier({ turn, text }) : ACK },
  })
  const loader = createPackLoader({ kernel, registry: kernel.registry })
  return { kernel, loader, delivered, clockRef, records: kernel.records }
}

async function tick(h, at) {
  h.clockRef.at = at
  const receipt = await h.kernel.bus.emit(V3_TICK_TOPIC, { at, runs: 1 }, {})
  await new Promise((resolve) => setImmediate(resolve))
  return receipt
}

const methodCard = (id, extra = {}) => Object.assign({ id, 标题: '方法 ' + id, 核心内容: '核心内容 ' + id + '。', improvements: [{ v: 1, 原因: '初始沉淀', text: '初始正文' }] }, extra)

console.log('=== 1. 值层/清单形状：storeMode=full 在值层；methods 是第四个模块；三把方法键已登记 ===')
{
  ok(PACK_DEFAULTS['vmu.records.history.storeMode'] === 'full',
    '★ 值层有 vmu.records.history.storeMode="full"（构造期快照；不补会静默拿 diff）', PACK_DEFAULTS['vmu.records.history.storeMode'])
  const declared = new Set(SETTING_DEFS.map((d) => d.key))
  const undeclared = Object.keys(PACK_DEFAULTS).filter((k) => !declared.has(k))
  ok(undeclared.length === 0 && Object.keys(PACK_DEFAULTS).length === 11,
    '值层 11 把键全部已在 settings/schema.js 登记（拼错不会静默）', { undeclared, n: Object.keys(PACK_DEFAULTS).length })
  ok(Object.keys(PACK.settings || {}).length === 0, '清单 settings 仍为空（构造期键只在值层；调用期键有 schema 默认）', PACK.settings)
  const entries = Array.isArray(PACK.middleware) ? PACK.middleware : []
  const methodsEntry = entries.find((e) => e && e.id === 'v3-methods')
  const plannerEntry = entries.find((e) => e && e.id === 'v3-planner')
  const planeEntry = entries.find((e) => e && e.id === 'v3-dataplane')
  ok(methodsEntry !== undefined && methodsEntry.module === V3_METHODS_MODULE,
    '清单携带 v3-methods 条目且携带 module 对象', methodsEntry && typeof methodsEntry.module)
  ok(methodsEntry && Array.isArray(methodsEntry.on) && methodsEntry.on.includes(V3_TICK_TOPIC) && methodsEntry.on.includes('turn/reply-parsed'),
    '条目订阅 v3/tick（唯一派发点）与 turn/reply-parsed（K10 消费点）', methodsEntry && methodsEntry.on)
  ok(methodsEntry && Array.isArray(methodsEntry.capabilities) && methodsEntry.capabilities.includes('trigger-workflow') && methodsEntry.capabilities.includes('rewrite-result'),
    '条目声明 trigger-workflow + rewrite-result（K10 的改写能力）', methodsEntry && methodsEntry.capabilities)
  ok(methodsEntry && plannerEntry && methodsEntry.order > plannerEntry.order, 'methods 排在 planner 之后（先规划、后方法整理）', { planner: plannerEntry && plannerEntry.order, methods: methodsEntry && methodsEntry.order })
  ok(methodsEntry && planeEntry && methodsEntry.order < planeEntry.order, 'methods 排在 dataplane 之前（本 tick 新建的卡能被索引看到）', { methods: methodsEntry && methodsEntry.order, plane: planeEntry && planeEntry.order })
  const requires = Array.isArray(PACK.requires) ? PACK.requires.map((r) => r && r.service) : []
  ok(requires.includes('vmu.records') && requires.includes('vmu.turn'),
    '清单 requires 覆盖 vmu.records 与 vmu.turn（vmu.library 是可选的，不 require：无根时降级为具名 skip）', requires)
  ok(V3_METHODS_MODULE.meta && V3_METHODS_MODULE.meta.id === 'v3-methods' && Number.isInteger(V3_METHODS_MODULE.meta.apiVersion),
    '模块带 meta.id/meta.apiVersion（loader 的硬门槛）', V3_METHODS_MODULE.meta)
  ok(typeof V3_METHODS_MODULE.hooks[V3_TICK_TOPIC] === 'function' && typeof V3_METHODS_MODULE.hooks['turn/reply-parsed'] === 'function',
    '模块 hooks 里真的有 tick 与 reply-parsed 两个处理器', Object.keys(V3_METHODS_MODULE.hooks))

  const defs = new Map(SETTING_DEFS.map((d) => [d.key, d]))
  const expected = { 'vmu.v3.methodKeepEvery': 5, 'vmu.v3.methodKeepIntervalMs': 0, 'vmu.v3.methodAutoPromote': false }
  const mismatched = []
  for (const key of Object.keys(expected)) {
    const d = defs.get(key)
    if (!d || d.def !== expected[key]) mismatched.push(key + '=' + JSON.stringify(d && d.def))
  }
  ok(mismatched.length === 0, '三把 vmu.v3.method* 已在 schema 登记且默认值 = 5/0/false', mismatched)
  ok(GLOBAL_PROMOTE_MIN_APPLICATIONS === 3, '晋升阈值是 v3 的常量 3（vibe-math-v3.js:2939）', GLOBAL_PROMOTE_MIN_APPLICATIONS)
}

console.log('=== 2. history.storeMode=full 真的生效（构造期快照 ＋ 版本快照；对照 diff 无快照） ===')
{
  const full = makeKernel()
  const w = writeCard({ records: full.records, kind: 'method', card: methodCard('m-store') })
  const original = full.records.get({ id: w.id }).body
  full.records.supersede({ id: w.id, reason: 'v2 改进', body: original.replace('核心内容 m-store。', '核心内容 m-store（v2）。') })
  full.records.supersede({ id: w.id, reason: 'v3 改进', body: original.replace('核心内容 m-store。', '核心内容 m-store（v3）。') })
  ok(full.records.status().caps.historyStoreMode === 'full',
    '★ 构造期快照读到 full（kernel/records.js:208-209 的读点真的读到了值层）', full.records.status().caps.historyStoreMode)
  const h = full.records.history({ id: w.id })
  ok(h.versions.length === 2 && h.storeMode === 'full', '★★ 两次 supersede ⇒ 恰好 2 个版本且 storeMode=full', { n: h.versions.length, mode: h.storeMode })
  ok(h.versions[0] && h.versions[0].snapshot && typeof h.versions[0].snapshot.body === 'string',
    '★★ full 模式下版本行带 snapshot（可回看正文）', h.versions[0] && Object.keys(h.versions[0].snapshot || {}))
  ok(h.versions[0] && h.versions[0].snapshot.body === original, 'snapshot.body 就是第 1 版正文（不是空对象）', h.versions[0] && String(h.versions[0].snapshot.body).slice(0, 20))
  ok(h.versions[1] && h.versions[1].snapshot && h.versions[1].snapshot.body.includes('（v2）'),
    '第 2 个快照是 v2 的正文（版本按时间顺序，不是同一份）')

  const diff = makeKernel({ overrides: { 'vmu.records.history.storeMode': 'diff' } })
  const wd = writeCard({ records: diff.records, kind: 'method', card: methodCard('m-diff') })
  const bodyD = diff.records.get({ id: wd.id }).body
  diff.records.supersede({ id: wd.id, reason: 'v2', body: bodyD.replace('m-diff。', 'm-diff（v2）。') })
  const hd = diff.records.history({ id: wd.id })
  ok(hd.storeMode === 'diff' && hd.versions.length === 1, '对照：同一操作在 storeMode=diff 下仍是 1 个版本', { mode: hd.storeMode, n: hd.versions.length })
  ok(hd.versions[0] && !hd.versions[0].snapshot, '★ 对照：diff 模式下版本行**没有** snapshot ⇒ 两档行为真的不同（不是只回读了一个字符串）', hd.versions[0] && !!hd.versions[0].snapshot)
}

console.log('=== 3. P0-4 应用记录：只在有上下文时追加；未知 method id 不丢 ===')
{
  const h = makeKernel()
  const w = await createMethodCard({ records: h.records, card: methodCard('m-1') })
  const before = h.records.get({ id: w.id }).body
  const noCtx = await consumeMethodFeedback({
    records: h.records, methods_used: [{ id: 'm-1', 效果: '有效', 建议: '继续' }], ctx: {}, at: 2000, by: 'solver',
  })
  const after = h.records.get({ id: w.id }).body
  ok(noCtx.ok === true && noCtx.applications === 0 && noCtx.skippedApplications === 1,
    '★ 无 qid/dirId 上下文 ⇒ 不追加应用，skippedApplications=1（不是静默跳过）', { apps: noCtx.applications, skipped: noCtx.skippedApplications })
  ok(before === after, '★ 无上下文时正文逐字节不变（"引用"没有被记成"实际应用"）')

  const withCtx = await consumeMethodFeedback({
    records: h.records, methods_used: [{ id: 'm-1', 效果: '有效', 建议: '继续' }], ctx: { qid: 'q-1', dirId: 'd1' }, at: 3000, by: 'solver',
  })
  const body1 = h.records.get({ id: w.id }).body
  ok(withCtx.applications === 1, '有 qid/dirId 上下文 ⇒ 追加 1 条应用', withCtx.applicationDetails)
  ok(/### 应用 1｜[^\n]*｜问题 q-1 方向 d1/.test(body1), '★ 应用条目标题行是 v3 的形状：应用 N｜时间｜问题 X 方向 d', body1.split('\n').filter((l) => l.startsWith('### 应用'))[0])
  ok(body1.includes('核心内容 m-1。') && body1.includes('初始正文'), '追加应用没有抹掉托管段与既有改进（正文只增不减）')

  const second = await consumeMethodFeedback({
    records: h.records, methods_used: [{ id: 'm-1', 效果: '再用' }], ctx: { qid: 'q-2' }, at: 4000, by: 'solver',
  })
  const card = parseCard(h.records.get({ id: w.id }).body)
  ok(second.applications === 1 && card.card.applications.length === 2, '只有 qid（无 dirId）也算上下文 ⇒ 第 2 条应用', card.card.applications.length)
  ok(card.card.applications[1].问题 === 'q-2' && card.card.applications[1].方向 === '', '第 2 条应用记的是 q-2 / 无方向（不借用上一条）', card.card.applications[1])

  const unknown = await consumeMethodFeedback({
    records: h.records, methods_used: [{ id: 'm-unknown', 效果: '某个尚未入卡的技巧' }], ctx: {}, at: 5000, by: 'solver',
  })
  ok(unknown.unknown === 1 && unknown.unknownDetails[0].id === 'm-unknown', '★ 未知 method id 被计为 unknown（不静默丢）', unknown.unknownDetails)
  ok(h.records.list({ track: INVENTION_TRACK }).available === 1, '★ 未知 method id 入 inventions 轨（清单 P0-4 的可写断言）', h.records.list({ track: INVENTION_TRACK }).available)
  const invBody = h.records.get({ id: h.records.list({ track: INVENTION_TRACK }).items[0].id }).body
  ok(invBody.includes('- 标题: m-unknown') && invBody.includes('## 内容描述'), '发明记录带标题与内容描述（Method Keeper 据此建卡）', invBody.split('\n').slice(0, 4))
}

console.log('=== 4. P0-4 改进历史：v 号单调（不是数组长度）＋ 版本可回看 ===')
{
  const h = makeKernel()
  const w = await createMethodCard({ records: h.records, card: methodCard('m-v') })
  const i1 = await recordImprovement({ records: h.records, recordId: w.id, 原因: '更一般', 改进内容: 'v2 正文', at: 2000 })
  const i2 = await recordImprovement({ records: h.records, recordId: w.id, 原因: '再一般', 改进内容: 'v3 正文', at: 3000 })
  const card = parseCard(h.records.get({ id: w.id }).body)
  const vs = card.card.improvements.map((x) => x.v)
  ok(sameList(vs, [1, 2, 3]) && i1.v === 2 && i2.v === 3, '★ v 号单调：初始 v1 → v2 → v3', vs)
  const hist = h.records.history({ id: w.id })
  ok(hist.versions.length === 2 && hist.storeMode === 'full', '★★ 两次改进 ⇒ 2 个版本且带快照（清单的"改进历史版本化"）', { n: hist.versions.length })
  ok(hist.versions[0].snapshot.body.includes('初始正文'), '第 1 个版本快照是首版正文（pushVersion 在改正文之前抓）', String(hist.versions[0].snapshot.body).slice(0, 30))
  ok(hist.versions[1].snapshot.body.includes('v2 正文'), '第 2 个版本快照是 v2 的正文（版本按时间顺序，不是同一份）')

  // 单调的硬形状：一张手里已有 v5 的卡（中间版本被删过）也必须给 v6，不能回到 length+1=2。
  const seeded = methodCard('m-v5', { improvements: [{ v: 5, 原因: '历史被裁剪过', text: '旧正文' }] })
  const w5 = await createMethodCard({ records: h.records, card: seeded })
  const i6 = await recordImprovement({ records: h.records, recordId: w5.id, 原因: '继续', 改进内容: 'v6 正文', at: 4000 })
  ok(i6.v === 6, '★ 既有最大 v=5 ⇒ 下一条是 v6（不是数组长度 2 —— 这条能抓住"用 length+1"的实现）', i6.v)
}

console.log('=== 5. P0-4 可信断言：只收已定论（概率 1/0）的命题 ===')
{
  const h = makeKernel()
  writeCard({ records: h.records, kind: 'proposition', card: { id: 'p-true', 标题: '真命题', 概率: 1, 陈述: 's' } })
  writeCard({ records: h.records, kind: 'proposition', card: { id: 'p-half', 标题: '半命题', 概率: 0.5, 陈述: 's' } })
  writeCard({ records: h.records, kind: 'proposition', card: { id: 'p-false', 标题: '假命题', 概率: 0, 陈述: 's' } })
  const trusted = trustedAssertions(h.records, ['p-true', 'p-half', 'p-false', 'p-missing'])
  ok(sameList(trusted.kept, ['p-true', 'p-false']), '★ 只留概率 1/0 的 id（未定论与不存在都被剔）', trusted.kept)
  ok(trusted.dropped.length === 2, '被剔的两条逐条点名（不是静默过滤）', trusted.dropped)

  const out = await applyKeeperOutput({
    records: h.records,
    reply: { progress: { new_methods: [{ 标题: '可信方法', 核心内容: '内容', 可信断言: ['p-true', 'p-half', 'p-false'] }] } },
    at: 5000, by: KEEPER_MEMBER,
  })
  ok(out.created === 1 && out.createdDetails[0].trusted.length === 2, 'keeper 建卡时可信断言被过滤到 2 条', out.createdDetails[0] && out.createdDetails[0].trusted)
  const card = parseCard(h.records.get({ id: out.createdDetails[0].recordId }).body)
  ok(sameList(card.card.可信断言, ['p-true', 'p-false']), '★ 卡正文里的 - 可信断言 只含已定论 id', card.card.可信断言)
  ok(out.createdDetails[0].trustedDropped.length === 1 && out.createdDetails[0].trustedDropped[0].id === 'p-half',
    '未定论那条在回执里具名（trustedDropped）', out.createdDetails[0].trustedDropped)
}

console.log('=== 6. 两级：项目级/全局级 ＋ 晋升阈值 3 ＋ methodAutoPromote 开关；耐久修订 <id>@<n>.md ===')
{
  const h = makeKernel()
  const w = await createMethodCard({ records: h.records, card: methodCard('m-level') })
  const eight = {}
  let applications = 0
  for (let i = 1; i <= 3; i++) {
    const r = await appendApplication({ records: h.records, recordId: w.id, qid: 'q-' + i, dirId: 'd' + i, text: '应用 ' + i, at: 6000 + i })
    if (r.appended === true) applications += 1
  }
  ok(applications === 3, '3 条应用记录真的写进去了（晋升阈值的输入）', applications)

  const manual = await promoteMethodsToGlobal({ records: h.records, auto: false })
  const afterManual = loadMethodIndex(h.records)
  ok(manual.promoted === 0 && manual.skipped === 1, '★ methodAutoPromote=false ⇒ 只报告不晋升', { promoted: manual.promoted, skipped: manual.skipped })
  ok(manual.skippedDetails[0].reason === 'methodAutoPromote=false', '跳过理由是具名的（不是静默）', manual.skippedDetails[0])
  ok(afterManual.items.length === 1, '默认配置下方法轨仍只有项目级那一张', afterManual.items.length)

  const auto = await promoteMethodsToGlobal({ records: h.records, auto: true })
  const afterAuto = loadMethodIndex(h.records)
  const globalCard = afterAuto.items.find((m) => m.level === 'global')
  ok(auto.promoted === 1 && afterAuto.items.length === 2, '★ auto=true ⇒ 晋升一张全局级卡（两级都还在）', { promoted: auto.promoted, n: afterAuto.items.length })
  ok(globalCard !== undefined && globalCard.id === 'm-level', '全局级卡与项目级卡用同一个逻辑 id（level 由 tag 区分）', globalCard && globalCard.id)
  ok(globalCard && globalCard.tags.includes(LEVEL_TAGS.global), '全局级卡的 tag 是 level:global', globalCard && globalCard.tags)
  ok(globalCard && globalCard.card.applications.length === 3, '全局级卡带着 3 条应用记录（晋升是复制，不是清空）', globalCard && globalCard.card.applications.length)
}
{
  const root = mkdtempSync(join(tmpdir(), 'vmu-v3-methods-lib-'))
  const h = makeKernel({ root })
  ok(h.kernel.library !== null && typeof h.kernel.library.commitRevision === 'function',
    '工作区根在场 ⇒ vmu.library 已发布（耐久归档的前提）', !!h.kernel.library)
  const w = await createMethodCard({ records: h.records, library: h.kernel.library, card: methodCard('m-lib'), at: 1000, by: 'keeper' })
  const rows = await h.kernel.library.list({ kind: 'method' })
  ok(rows.length === 1 && rows[0].id.startsWith('m-lib-r1-'), '方法卡进耐久库：库记录 id 以 <方法id>-r<卡rev>- 开头', rows.map((r) => r.id))
  const revs = await h.kernel.library.revisions({ id: rows[0].id })
  ok(revs.total === 1 && revs.items[0].rev === 1, '★ 库冻结了第 1 个修订', revs.items)
  ok(/@1\.md$/.test(revs.items[0].path), '★ 修订文件名是 `<库记录 id>@1.md`', revs.items[0] && revs.items[0].path.split(/[\\/]/).pop())
  ok(existsSync(revs.items[0].path), '★ 该 `<id>@<n>.md` 文件真的在磁盘上', revs.items[0] && revs.items[0].path)
  const frozen = readFileSync(revs.items[0].path, 'utf8')
  ok(frozen.includes('核心内容 m-lib。'), '冻结的修订里是方法卡正文')

  // 同一内容再冻结一次 ⇒ 库记录去重后 rev 递增到 @2（<n> 单调，由 library 的 high-water mark 保证）。
  const again = await archiveMethodCard({ library: h.kernel.library, methodId: 'm-lib', rev: 1, body: w.body, title: '方法 m-lib', by: 'keeper', reason: '再次冻结' })
  const revs2 = await h.kernel.library.revisions({ id: again.libraryId })
  ok(again.archived === true && again.rev === 2 && revs2.total === 2, '★ 再冻结一次 ⇒ @2（同一库记录的 <n> 单调递增）', { rev: again.rev, total: revs2.total })
  const paths = revs2.items.map((x) => x.path.split(/[\\/]/).pop())
  ok(paths.length === 2 && /@1\.md$/.test(paths[0]) && /@2\.md$/.test(paths[1]), '★ 两个修订文件分别是 @1.md / @2.md', paths)

  // 无根的装配上归档是**具名 skip**，不是静默。
  const bare = makeKernel()
  const skipped = await archiveMethodCard({ library: null, methodId: 'm-bare', rev: 1, body: 'x' })
  ok(skipped.archived === false && skipped.skipped === 'no-library-root', '★ 没有工作区根 ⇒ archived:false + skipped:no-library-root（不假装归档）', skipped)
  ok(bare.records.list({ track: METHOD_TRACK }).available === 0, '（对照）无根装配上并没有因此多出任何方法记录', bare.records.list({ track: METHOD_TRACK }).available)
  try { rmSync(root, { recursive: true, force: true }) } catch (e) { /* tmp cleanup */ }
}

console.log('=== 7. P0-5 发明上报：入队 / keeper 有产出清队 / 无产出兜底 / 幂等 ===')
{
  const h = makeKernel()
  const q = enqueueInvention({ records: h.records, at: 1000, 标题: '新技巧甲', 类型: '技巧', 来源: '问题 q-1 方向 d1', 内容描述: '描述甲' })
  ok(q.ok === true, 'new_inventions ⇒ 入队一条发明', q.id)
  ok(h.records.list({ track: INVENTION_TRACK }).available === 1, '★ 上报入队：inventions 轨 1 条（清单 P0-5 的可写断言）', h.records.list({ track: INVENTION_TRACK }).available)
  ok(pendingInventions(h.records).count === 1, 'pending 计数 = 1', pendingInventions(h.records).count)

  const out = await applyKeeperOutput({
    records: h.records,
    reply: { progress: { new_methods: [{ 标题: '方法乙', 核心内容: '乙内容' }] } },
    at: 2000, by: KEEPER_MEMBER,
  })
  ok(out.hasOutput === true && out.created === 1, 'keeper 有产出（新建 1 张）', { hasOutput: out.hasOutput, created: out.created })
  ok(h.records.list({ track: INVENTION_TRACK }).available === 0, '★ keeper 有产出 ⇒ pending 清零（inventions 轨 0 条）', h.records.list({ track: INVENTION_TRACK }).available)
  ok(out.pendingAfter === 0, '回执自报 pendingAfter=0', out.pendingAfter)
}
{
  const h = makeKernel()
  enqueueInvention({ records: h.records, at: 1000, 标题: '新技巧丙', 内容描述: '描述丙' })
  const out = await applyKeeperOutput({ records: h.records, reply: {}, at: 2000, by: KEEPER_MEMBER })
  const methods = h.records.list({ track: METHOD_TRACK })
  ok(out.hasOutput === false && out.fallback && out.fallback.fallback === true, 'keeper 回执为空对象 ⇒ 走兜底路径（不是静默什么都不做）', { hasOutput: out.hasOutput })
  ok(methods.available === 1, '★ 无产出 ⇒ 兜底建 1 张草稿方法卡（methods 轨 1 条）', methods.available)
  ok(h.records.list({ track: INVENTION_TRACK }).available === 0, '★ 无产出也清队：inventions 轨 0 条（防滞留）', h.records.list({ track: INVENTION_TRACK }).available)
  const draftBody = h.records.get({ id: methods.items[0].id }).body
  ok(draftBody.includes('## 沉淀元数据') && draftBody.includes('- 幂等键: fallback:'), '★ 兜底卡带幂等键行（写在自定义段里，回写不丢）', draftBody.split('\n').filter((l) => l.includes('幂等键')))
  ok(draftBody.includes('- 状态: 经验') && draftBody.includes('- 来源: 草稿沉淀('), '兜底卡是"草稿"形状：状态=经验、来源=草稿沉淀', draftBody.split('\n').slice(0, 8))
}
{
  // ★★ 幂等键的硬证明（Lead 指定的形状）：**第一遍建、第二遍不建、计数可见**。
  // 模拟"卡已写、pending 因崩溃没清"：先跑一遍兜底（建卡 + 清队），再把同一条发明记录 restore 回来（同一个
  // 记录 id、同一批 pending 重新出现），第二遍兜底必须命中幂等键而**不新建**第二张卡。
  const h = makeKernel()
  enqueueInvention({ records: h.records, at: 1000, 标题: '幂等丙', 内容描述: '描述' })
  const first = await fallbackFromPending({ records: h.records, at: 2000 })
  ok(first.created === 1 && first.newCards === 1 && first.deduplicated === 0,
    '★ 第一遍兜底：处理 1 条、**新建 1 张**、无去重', { created: first.created, newCards: first.newCards, deduplicated: first.deduplicated })
  ok(h.records.list({ track: METHOD_TRACK }).available === 1, '第一遍后方法轨 1 张卡', h.records.list({ track: METHOD_TRACK }).available)
  const key = first.details[0].idempotencyKey
  ok(key === 'fallback:' + draftIdemKey(first.details[0].inventionRecordId).replace('fallback:', '') && key.startsWith('fallback:') && key.length === 'fallback:'.length + 16,
    '幂等键的形状：fallback:<16 hex>，且只由发明记录 id 决定', key)
  ok(findDraftByIdemKey(h.records, key) !== null, '兜底卡能按幂等键找到（行在卡的自定义段里）', key)
  h.records.restore({ id: first.details[0].inventionRecordId })
  ok(pendingInventions(h.records).count === 1, '模拟"崩溃窗口"：同一条发明记录被恢复 ⇒ pending 回到 1（同一个记录 id）', pendingInventions(h.records).count)
  const second = await fallbackFromPending({ records: h.records, at: 3000 })
  ok(second.created === 1 && second.newCards === 0 && second.deduplicated === 1,
    '★★ 第二遍兜底：处理 1 条、**新建 0 张**、去重 1（幂等键命中）—— 计数可见', { created: second.created, newCards: second.newCards, deduplicated: second.deduplicated })
  ok(second.details[0].deduplicated === true && second.details[0].idempotencyKey === key, '★★ 第二遍命中的是同一个幂等键', second.details[0])
  ok(h.records.list({ track: METHOD_TRACK }).available === 1, '★★ 方法轨仍然只有 1 张卡（同批 pending 再兜底不重复建卡）', h.records.list({ track: METHOD_TRACK }).available)
  ok(h.records.list({ track: INVENTION_TRACK }).available === 0, '第二遍也清队（pending 不滞留）', h.records.list({ track: INVENTION_TRACK }).available)
}
{
  // "改进-only"也算有产出（v3 的修复点：否则 pending 永不归零、反复整理）。
  const h = makeKernel()
  const w = await createMethodCard({ records: h.records, card: methodCard('m-imp') })
  enqueueInvention({ records: h.records, at: 1000, 标题: '待改进', 内容描述: 'x' })
  const out = await applyKeeperOutput({
    records: h.records,
    reply: { progress: { improvements: [{ id: 'm-imp', 原因: '补充', 改进内容: '补充正文' }] } },
    at: 2000, by: KEEPER_MEMBER,
  })
  ok(out.hasOutput === true && out.improved === 1, '★ 只返回 improvements 也算有产出', { hasOutput: out.hasOutput, improved: out.improved })
  ok(h.records.list({ track: INVENTION_TRACK }).available === 0, '★ improvements-only 也清队（v3 `:2902-2904` 的修复点）', h.records.list({ track: INVENTION_TRACK }).available)
  ok(parseCard(h.records.get({ id: w.id }).body).card.improvements.length === 2, '改进真的写进卡（v1 → v2）', parseCard(h.records.get({ id: w.id }).body).card.improvements.map((x) => x.v))
}
{
  // keeper 未知方法 id 的改进 ⇒ 具名失败，但 pending 仍清（不因一条坏条目滞留）。
  const h = makeKernel()
  enqueueInvention({ records: h.records, at: 1000, 标题: '丁', 内容描述: 'x' })
  const out = await applyKeeperOutput({ records: h.records, reply: { progress: { improvements: [{ id: 'm-no-such', 原因: 'x', 改进内容: 'y' }] } }, at: 2000, by: KEEPER_MEMBER })
  ok(out.failedCount === 1 && out.failed[0].why === 'unknown-method', '未知方法的改进被具名记失败（不静默）', out.failed)
  ok(out.fallback && out.fallback.fallback === true, '唯一"产出"失败 ⇒ 按无产出走兜底（防滞留）', out.fallback && out.fallback.created)
  ok(h.records.list({ track: INVENTION_TRACK }).available === 0, 'pending 仍清零', h.records.list({ track: INVENTION_TRACK }).available)
}

console.log('=== 8. P0-5 派发：keeper 只从 tick 派；空回执兜底；回合失败也兜底（防滞留） ===')
{
  const h = boot({ overrides: { 'vmu.v3.methodKeepEvery': 1 }, replier: () => '{}' })
  const applied = await h.loader.apply(PACK)
  ok(applied && applied.ok === true, 'v3 包装载干净（四个 module 经 loader 成功装载）', applied && applied.applied)
  enqueueInvention({ records: h.records, at: 1000, 标题: '派发甲', 内容描述: 'd' })
  const receipt = await tick(h, 2000)
  ok(receipt && receipt.ok === true, 'tick 本身成功', receipt && receipt.ok)
  ok(h.delivered.length === 1 && h.delivered[0].member === KEEPER_MEMBER, '★ keeper 回合被派发恰好 1 次（methodKeepEvery=1、pending=1）', h.delivered.map((d) => d.member))
  ok(h.delivered[0].task === 'v3-method-keeper' && String(h.delivered[0].statusBlock).includes('待沉淀发明'),
    'keeper 回合的 statusBlock 里带发明摘要（提示词正文属 P1-6，这里证明的是"摘要真的到了回合接缝"）', { task: h.delivered[0].task, statusBlock: String(h.delivered[0].statusBlock).slice(0, 80) })
  ok(String(h.delivered[0].statusBlock).includes('imp:') && String(h.delivered[0].statusBlock).includes('兜底'),
    '摘要里写明回执契约（imp: 改进 tag 与"空产出回 {} 会兜底"）', String(h.delivered[0].statusBlock).includes('imp:'))
  ok(v3MethodsStatus().keeperRuns === 1, '状态自报 keeperRuns=1', v3MethodsStatus().keeperRuns)
  ok(h.records.list({ track: INVENTION_TRACK }).available === 0 && h.records.list({ track: METHOD_TRACK }).available === 1,
    '★ 空回执这条真实路径：pending 清零 ＋ 兜底 1 张草稿卡', { pending: h.records.list({ track: INVENTION_TRACK }).available, methods: h.records.list({ track: METHOD_TRACK }).available })
  ok(v3MethodsStatus().lastReceipt && v3MethodsStatus().lastReceipt.fallback && v3MethodsStatus().lastReceipt.fallback.newCards === 1,
    '回执里点名 fallback 与**新建**张数（newCards）', v3MethodsStatus().lastReceipt && v3MethodsStatus().lastReceipt.fallback)
}
{
  const keeperReply = JSON.stringify({ progress: { new_methods: [{ 标题: '派发乙方法', 核心内容: '乙内容' }] } })
  const h = boot({ overrides: { 'vmu.v3.methodKeepEvery': 1 }, replier: ({ turn }) => (turn.member === KEEPER_MEMBER ? keeperReply : ACK) })
  await h.loader.apply(PACK)
  enqueueInvention({ records: h.records, at: 1000, 标题: '派发乙', 内容描述: 'd' })
  await tick(h, 2000)
  ok(h.records.list({ track: METHOD_TRACK }).available === 1 && h.records.list({ track: INVENTION_TRACK }).available === 0,
    '★ keeper 有产出这条真实路径：建 1 张卡、pending 清零', { methods: h.records.list({ track: METHOD_TRACK }).available })
  const card = parseCard(h.records.get({ id: h.records.list({ track: METHOD_TRACK }).items[0].id }).body)
  ok(card.ok && card.card.标题 === '派发乙方法', '被建出来的是 keeper 回报的那张卡', card.ok && card.card.标题)
}
{
  const boom = () => { throw new Error('keeper delivery exploded') }
  const h = boot({ overrides: { 'vmu.v3.methodKeepEvery': 1 }, replier: boom })
  await h.loader.apply(PACK)
  enqueueInvention({ records: h.records, at: 1000, 标题: '失败也兜底', 内容描述: 'd' })
  await tick(h, 2000)
  ok(h.records.list({ track: INVENTION_TRACK }).available === 0, '★ 回合投递失败也清队（pending 不滞留）', h.records.list({ track: INVENTION_TRACK }).available)
  ok(h.records.list({ track: METHOD_TRACK }).available === 1, '★ 回合投递失败 ⇒ 兜底建 1 张草稿卡', h.records.list({ track: METHOD_TRACK }).available)
  ok(v3MethodsStatus().lastReceipt && v3MethodsStatus().lastReceipt.fallbackReason !== undefined,
    '回执点名兜底原因（keeper-turn-failed / 无解析回执）', v3MethodsStatus().lastReceipt && v3MethodsStatus().lastReceipt.fallbackReason)
}
{
  // 未到期不派发（pending=1 < methodKeepEvery=5 且默认 interval=0）。
  const h = boot({ replier: () => ACK })
  await h.loader.apply(PACK)
  enqueueInvention({ records: h.records, at: 1000, 标题: '不急', 内容描述: 'd' })
  await tick(h, 2000)
  ok(h.delivered.length === 0, '★ 未到期不派发 keeper（pending < 5 且 interval=0）', h.delivered.length)
  ok(v3MethodsStatus().lastSkip && v3MethodsStatus().lastSkip.reason === 'not-due', '跳过理由是具名的 not-due', v3MethodsStatus().lastSkip)
  const due = keepDue({ records: h.records, at: 2000, every: 1, interval: 0, keeperInFlight: false, lastKeepAt: null })
  ok(due.due === true && due.reason === 'count', 'keeper 到期判定在 every 满足时 due=true（reason=count）', due)
  const digest = buildMethodDigest({ records: h.records, at: 2000 })
  ok(digest.includes('待沉淀发明 1 条') && digest.includes('不急'), '摘要带 pending 数与标题', digest.slice(0, 80))
}

console.log('=== 9. 回执载体（progress 载荷）与 K10 改写：消费后返回 JSON 对象文本 ===')
{
  const fbTop = feedbackFromReply({ methods_used: [{ id: 'm-1', 效果: 'e' }], new_inventions: [{ 标题: 't' }], qid: 'q-1', dirId: 'd1' })
  ok(fbTop.methods_used.length === 1 && fbTop.new_inventions.length === 1 && fbTop.ctx.qid === 'q-1' && fbTop.carrier === 'top-level',
    '顶层形状（v3 原样）被识别，carrier=top-level', fbTop.carrier)
  const fbProgress = feedbackFromReply({ progress: { tags: ['mu:m-2｜效果｜建议', 'inv:方法｜标题｜描述', 'ctx:q-7｜d9'] } })
  ok(fbProgress.methods_used.length === 1 && fbProgress.methods_used[0].id === 'm-2' && fbProgress.new_inventions.length === 1,
    'progress.tags 的 mu:/inv: 前缀被解析（真实回合的载体）', fbProgress.methods_used)
  ok(fbProgress.ctx.qid === 'q-7' && fbProgress.ctx.dirId === 'd9', 'ctx: 前缀把 qid/dirId 带回（应用记录的上下文来源）', fbProgress.ctx)
  const keeperOut = keeperOutputFromReply({ progress: { body: '# 方法｜甲\n- ID: m-x', tags: ['imp:m-1｜原因｜内容'] } })
  ok(keeperOut.card_bodies.length === 1 && keeperOut.improvements.length === 1 && keeperOut.improvements[0].id === 'm-1',
    'keeper 回执：progress.body 是方法卡 md、imp: tag 是改进', keeperOut)

  const h = boot({ replier: () => ACK })
  await h.loader.apply(PACK)
  const w = await createMethodCard({ records: h.records, card: methodCard('m-hook') })
  await tick(h, 2000) // 设 lastTickAt（钩子用本 tick 的注入时钟）
  const reply = { progress: { track: 'journal', kind: 'state', body: '原载荷', tags: ['mu:m-hook｜有效｜继续', 'ctx:q-3｜d4', 'inv:方法｜钩子发明｜描述'] } }
  const seen = await h.kernel.bus.emit('turn/reply-parsed', { turn: 't-1', member: 'solver', phase: 'normal', reply }, { member: 'solver' })
  const rewritten = h.kernel.bus.rewriteOf('turn/reply-parsed', seen)
  ok(typeof rewritten === 'string' && rewritten !== null, '★ 消费了反馈 ⇒ 钩子返回 rewriteResult（字符串）', typeof rewritten)
  const parsedRewrite = rewritten === null ? null : JSON.parse(rewritten)
  ok(parsedRewrite !== null && typeof parsedRewrite === 'object' && !Array.isArray(parsedRewrite),
    '★ 改写值是 **JSON 对象文本**（K10 会解码成 reply 对象；非对象 ⇒ VMU_TURN_BAD_JSON）', parsedRewrite && Object.keys(parsedRewrite))
  ok(parsedRewrite && parsedRewrite.progress && parsedRewrite.progress.track === 'journal' && parsedRewrite.progress.kind === 'state',
    '★ 原始载荷被换成一条合法的 journal 记录（不把 v3 的顶层字段塞给派发器）', parsedRewrite && parsedRewrite.progress)
  ok(parseCard(h.records.get({ id: w.id }).body).card.applications.length === 1, '钩子路径也真的追加了应用（经 dataplane.parseCard 读回验证）', {})
  ok(h.records.list({ track: INVENTION_TRACK }).available === 1, '钩子路径也真的把 inv: 入队了', h.records.list({ track: INVENTION_TRACK }).available)

  const quiet = await h.kernel.bus.emit('turn/reply-parsed', { turn: 't-2', member: 'solver', reply: { prioritize: 'ack' } }, { member: 'solver' })
  ok(h.kernel.bus.rewriteOf('turn/reply-parsed', quiet) === null, '没有方法反馈的回执不被改写（不抢别的字段）', {})
}

console.log('=== 10. 分隔符必须扛得住内容：含 `｜` 与换行的标题/描述经 tags 编解码**逐字还原** ===')
{
  // ★ Lead 裁定 ②-2：用 `｜` 分段的扁平字符串最容易在"内容里也有分隔符"时**静默错位** —— 这种错不会炸、只会错。
  const nastyTitle = '标题里有｜竖线｜和\n换行'
  const nastyDesc = '描述第一行｜带竖线\\反斜杠\n第二行：还有\n第三行 ｜ 收尾'
  const invTag = encodeFeedbackTag('invention', ['技巧', nastyTitle, nastyDesc])
  const parsed = feedbackFromReply({ progress: { tags: [invTag] } })
  ok(parsed.new_inventions.length === 1, '编码后的 inv: tag 被解析成 1 条发明', parsed.new_inventions.length)
  ok(parsed.new_inventions[0].标题 === nastyTitle.trim(), '★★ 标题里的 `｜` 与换行**逐字还原**（不是"解析出了 3 段"就算过）', parsed.new_inventions[0].标题)
  ok(parsed.new_inventions[0].内容描述 === nastyDesc, '★★ 描述里的 `｜`、反斜杠与换行**逐字还原**', parsed.new_inventions[0].内容描述)
  ok(parsed.malformedCount === 0, '一个合法 tag 不会被记成 malformed', parsed.malformedCount)

  const usedTag = encodeFeedbackTag('used', ['m-1', '效果里有｜竖线\n和换行', '建议里也有｜'])
  const usedParsed = feedbackFromReply({ progress: { tags: [usedTag] } })
  ok(usedParsed.methods_used.length === 1 && usedParsed.methods_used[0].效果 === '效果里有｜竖线\n和换行',
    '★★ mu: tag 的"效果"字段同样逐字还原', usedParsed.methods_used[0] && usedParsed.methods_used[0].效果)
  const ctxTag = encodeFeedbackTag('context', ['q｜1', 'd\n2'])
  const ctxParsed = feedbackFromReply({ progress: { tags: [ctxTag] } })
  ok(ctxParsed.ctx.qid === 'q｜1' && ctxParsed.ctx.dirId === 'd\n2', '★★ ctx: tag 的 qid/dirId 逐字还原', ctxParsed.ctx)
  ok(TAG_PREFIXES.used === 'mu:' && TAG_PREFIXES.invention === 'inv:' && TAG_PREFIXES.context === 'ctx:' && TAG_PREFIXES.improvement === 'imp:',
    '公开的 tag 前缀表就是契约（提示段与消费端必须同表）', TAG_PREFIXES)
  let refused = null
  try { encodeFeedbackTag('bogus', ['x']) } catch (e) { refused = e && e.code }
  ok(refused === 'VMU_INVALID_ARGUMENT', '未知 tag kind ⇒ 具名拒 VMU_INVALID_ARGUMENT（不造一个无前缀的 tag）', refused)

  // 端到端：带竖线/换行的发明经"标签 → consumeMethodFeedback → inventions 轨"后，描述段逐字保留。
  const h = makeKernel()
  const res = await consumeMethodFeedback({ records: h.records, reply: { progress: { tags: [invTag] } }, at: 7000, by: 'solver' })
  ok(res.inventionsQueued === 1, '端到端：1 条发明入队', res.inventionsQueued)
  const invRec = h.records.get({ id: h.records.list({ track: INVENTION_TRACK }).items[0].id })
  const storedDesc = invRec.body.split('## 内容描述\n')[1]
  ok(storedDesc !== undefined && storedDesc.trimEnd() === nastyDesc, '★★ inventions 记录的"内容描述"段与原文逐字一致（含 `｜` 与换行）', storedDesc && storedDesc.slice(0, 40))
}

console.log('=== 11. 双载体（tags 与同名字段）任一即可；两者同时出现不重复消费；缺字段不静默丢 ===')
{
  // 只有同名字段（没有 tags）⇒ 消费成功。
  const fieldsOnly = feedbackFromReply({ progress: { methods_used: [{ id: 'm-1', 效果: 'e1' }], new_inventions: [{ 标题: '发明甲', 内容描述: 'd' }] } })
  ok(fieldsOnly.methods_used.length === 1 && fieldsOnly.new_inventions.length === 1 && fieldsOnly.carrier === 'progress',
    '★ 只有 progress 同名字段（无 tags）⇒ 也被接受', { used: fieldsOnly.methods_used.length, inv: fieldsOnly.new_inventions.length })
  // 只有 tags（没有同名字段）⇒ 消费成功。
  const tagsOnly = feedbackFromReply({ progress: { tags: [encodeFeedbackTag('used', ['m-2', 'e2']), encodeFeedbackTag('invention', ['方法', '发明乙', 'd2'])] } })
  ok(tagsOnly.methods_used.length === 1 && tagsOnly.new_inventions.length === 1, '★ 只有 tags（无同名字段）⇒ 也被接受', { used: tagsOnly.methods_used.length, inv: tagsOnly.new_inventions.length })
  // 两者同时出现同一项 ⇒ **不重复消费**（这是"任一存在即可"的反面事故：双写双计）。
  const both = feedbackFromReply({
    progress: {
      methods_used: [{ id: 'm-3', 效果: 'e3' }],
      new_inventions: [{ 标题: '发明丙', 类型: '方法', 内容描述: 'd3' }],
      tags: [encodeFeedbackTag('used', ['m-3', 'e3']), encodeFeedbackTag('invention', ['方法', '发明丙', 'd3'])],
    },
  })
  ok(both.methods_used.length === 1 && both.new_inventions.length === 1,
    '★★ 双载体同时出现同一项 ⇒ 按业务键去重，只消费 1 次（不是 2 条应用/2 条发明）', { used: both.methods_used.length, inv: both.new_inventions.length })

  // 缺字段的反馈：记 pending（不静默丢）+ 回执具名。
  const h = makeKernel()
  const res = await consumeMethodFeedback({
    records: h.records,
    reply: { progress: { methods_used: [{ 效果: '没有 id' }], new_inventions: [{ 内容描述: '没有标题' }] } },
    at: 8000, by: 'solver',
  })
  ok(res.malformed === 2 && res.malformedDetails.length === 2, '★ 缺字段的两条被计为 malformed（不静默丢）', res.malformedDetails)
  ok(h.records.list({ track: INVENTION_TRACK }).available === 2, '★ 缺字段的反馈被作为待沉淀发明入队（原始载荷保留，不丢）', h.records.list({ track: INVENTION_TRACK }).available)
  ok(res.malformedDetails[0].inventionRecordId !== undefined, '每条 malformed 都有对应的发明记录 id（可追）', res.malformedDetails[0])

  // keeper 缺字段的条目 ⇒ failed 具名（而不是被 filter 掉）。
  const hk = makeKernel()
  const keeperOut = await applyKeeperOutput({
    records: hk.records,
    reply: { progress: { new_methods: [{ 核心内容: '无标题' }], improvements: [{ 原因: '无 id', 改进内容: 'x' }] } },
    at: 9000, by: KEEPER_MEMBER,
  })
  ok(keeperOut.failedCount === 2, '★ keeper 的缺字段条目逐条进 failed（new_methods 缺标题 / improvements 缺 id）', keeperOut.failed)
  ok(keeperOut.hasOutput === false && keeperOut.fallback && keeperOut.fallback.fallback === true,
    '缺字段不构成产出 ⇒ 仍走兜底（但有 pending 才建卡，这里无 pending ⇒ newCards 0）', { fallback: !!keeperOut.fallback, newCards: keeperOut.fallback && keeperOut.fallback.newCards })
}

console.log('=== 12. 装配路径：真实入口 packs:["v3"] 上 methods 挂上总线且 storeMode 生效 ===')
{
  const entry = await import(pathToFileURL(ENTRY).href)
  const ctx = { effect(fn) { return fn() }, on() { return () => {} }, tools: { register: async () => () => {} } }
  const handle = entry.apply(ctx, { clock: () => 1000, packs: ['v3'] })
  await handle.ready()
  ok(handle.packErrors().length === 0, '真实入口装载 packs=[v3] 无错', handle.packErrors())
  const busIds = handle.kernel.bus.entries().map((e) => String(e.id))
  ok(busIds.some((id) => id.startsWith('v3-methods') && id.includes(V3_TICK_TOPIC)), 'methods 的 tick 钩子挂上了总线', busIds.filter((id) => id.startsWith('v3-methods')))
  ok(busIds.some((id) => id.startsWith('v3-methods') && id.includes('turn/reply-parsed')), 'methods 的 reply-parsed 钩子挂上了总线', busIds.filter((id) => id.startsWith('v3-methods')))
  ok(handle.kernel.records.status().caps.historyStoreMode === 'full', '★ 真实入口的 records 构造期快照读到 storeMode=full（值层在建内核前折入）', handle.kernel.records.status().caps.historyStoreMode)
  for (const cleanup of handle.cleanups || []) { try { cleanup() } catch (e) { /* unwind is the host's job */ } }
}

console.log('')
console.log('=== V3 METHODS (P0-4+P0-5): ' + passed + ' passed, ' + failed + ' failed ===')
if (failures.length > 0) for (const f of failures) console.error('  - ' + f)
process.exit(failed === 0 ? 0 : 1)

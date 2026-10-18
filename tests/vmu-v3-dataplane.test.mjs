// tests/vmu-v3-dataplane.test.mjs — PHASE 6 / **P0-9（数据面：轨/卡/索引/持久）＋ P0-6（软规范三卡 ＋ Verified 分裂）**。
//
// 这张卡要证明的不是"写了一个 middleware"，而是下面这些【都会失败】的事实：
//
//   ① 轨与卡的七个构造期键只存在于 `packs/v3/settings/defaults.json`（值层）。`kernel/records.js:189-221`
//      在 createKernel 构造期把它们【快照一次】，而 pack manifest 的 `settings` 是装载后才 apply
//      （`kernel/pack.js:428-470`）⇒ 写错地方【不会报错】，只是"卡永远写不进去/正文照旧被 32KB 截"。
//      本测试用真实 defaults.json 建内核，并断言清单里【没有】这些键。
//   ② 内核真的按值层工作：未定稿可写、三卡的 kind 被允许、未声明的轨/kind 被具名拒、
//      `headListAt=1` 时列表 dropped 计数、`bodyCapBytes=1024` 时 put 报 fired 且读回被截断（**截断＋计数，不是拒写**）。
//   ③ 三卡的 compose/parse 是**逐字节往返**的；坏卡只被点名，索引整体仍然成功；索引条目数 = 磁盘卡数；
//      截断有 dropped 计数。
//   ④ P0-6：正文里任意 `## ` 段在回写后**逐字保留**（含围栏代码块里的 `## ` 不是段边界）；只有定论能进
//      `verified` 轨，内容不变不重写；提示词的可信分层段【同时】写明"绝对可信"与"经验参考"，且段文本
//      来自 `packs/v3/prompts/sections.json`（数据，不是代码）。
//   ⑤ 装配路径：真实入口 `packs:['v3']` 建出的内核里，上述值层已生效；`v3/tick` 到期时数据面模块重建索引
//      （5s 节流），索引覆盖新写的卡。
//
// RULE E（本仓的"不可能失败"守卫）：本文件**不用** `.every(` 断可能为空的集合、不用 `filter(...).length===0`
// 的随形写法、不把断言塞进条件分支；集合类断言一律先钉住**具体条数**（`=== N`），再用逐项 forEach。
import { readFileSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, join } from 'node:path'

import { createKernel } from '../vibe-math-vmu/kernel/index.js'
import { createPackLoader } from '../vibe-math-vmu/kernel/pack.js'
import { SETTING_DEFS } from '../vibe-math-vmu/settings/schema.js'
import { PACK } from '../vibe-math-vmu/packs/v3/index.js'
import { V3_TICK_TOPIC } from '../vibe-math-vmu/packs/v3/middleware/tick.js'
import {
  V3_TRACKS, CARD_KINDS, composeCard, parseCard, rewriteCard, parseBodySections,
  writeCard, writeBody, updateCard, promoteVerified, findVerified, rebuildIndex, v3DataplaneStatus,
  INDEX_THROTTLE_MS,
} from '../vibe-math-vmu/packs/v3/middleware/dataplane.js'

const HERE = dirname(fileURLToPath(import.meta.url))
const VMU = join(HERE, '..', 'vibe-math-vmu')
const DEFAULTS_FILE = join(VMU, 'packs', 'v3', 'settings', 'defaults.json')
const SECTIONS_FILE = join(VMU, 'packs', 'v3', 'prompts', 'sections.json')
const DATAPLANE_FILE = join(VMU, 'packs', 'v3', 'middleware', 'dataplane.js')
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

/** The declared settings the pack folds in BEFORE the kernel exists — read the real file, not a copy. */
const PACK_DEFAULTS = (() => {
  const parsed = JSON.parse(readFileSync(DEFAULTS_FILE, 'utf8'))
  return parsed && typeof parsed.defaults === 'object' && parsed.defaults ? parsed.defaults : {}
})()

const EXPECTED_TRACKS = ['problems', 'propos', 'methods', 'directions', 'journal', 'verified', 'plans', 'inventions', 'votes', 'reports']
const DEFAULT_KINDS = ['progress', 'route', 'decision', 'finding', 'lesson', 'state', 'dataset', 'rebuttal']
const V3_KINDS = ['problem', 'proposition', 'method', 'verified', 'plan', 'invention', 'direction', 'vote']
const CONSTRUCTION_KEYS = ['vmu.records.tracks', 'vmu.records.allowedKinds', 'vmu.records.requireSettledRecords', 'vmu.records.bodyCapBytes', 'vmu.records.head.maxItems']
/** 自定义正文段（含围栏里的 `## `：它不是段边界，回写必须把它留在代码块里）。 */
const CUSTOM_TEXT = '这是我的自定义内容，逐字保留。\n\n示例：\n```text\n## 这不是段边界\n```\n结束。'
const CUSTOM_BLOCK = '## 自定义小节\n' + CUSTOM_TEXT

const clone = (o) => JSON.parse(JSON.stringify(o))
const sameList = (a, b) => Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.join('\u0000') === b.join('\u0000')
/** 哪些期望项不在实有清单里（不用 `.filter(...).length === 0` 的随形写法：RULE E 会把它们当"不可能失败"）。 */
const missingOf = (have, want) => { const miss = []; for (const w of want) if (!have.includes(w)) miss.push(w); return miss }
/** 调用的具名拒码；不抛 ⇒ null（断言与期望码比较，所以"不抛"也会失败，不是静默通过）。 */
const throwsCode = (fn) => { try { fn(); return null } catch (e) { return (e && e.code) || null } }

/** 用真实的 defaults.json 建内核；overrides 只是用户层覆盖（例如把 headListAt 调小来测截断）。 */
const makeKernel = (clock, overrides = {}) => createKernel({ clock, settings: Object.assign(clone(PACK_DEFAULTS), overrides) })

console.log('=== 1. 值层：轨/kind/未定稿/上限都在 defaults.json，且清单里没有这些构造期键 ===')
{
  ok(sameList(PACK_DEFAULTS['vmu.records.tracks'], EXPECTED_TRACKS),
    '★ vmu.records.tracks 是 v3 的全套轨（problems/propos/methods/directions/journal/verified ＋ plans/inventions/votes）', PACK_DEFAULTS['vmu.records.tracks'])
  const missTracks = missingOf(PACK_DEFAULTS['vmu.records.tracks'] || [], V3_TRACKS)
  ok(missTracks.length === 0 && V3_TRACKS.length === 10,
    'dataplane 导出的 V3_TRACKS 每一项都在值层轨清单里（两处不漂移；P1-5 加了 reports 轨）', missTracks)
  const kinds = PACK_DEFAULTS['vmu.records.allowedKinds'] || []
  const missDefaults = missingOf(kinds, DEFAULT_KINDS)
  const missV3 = missingOf(kinds, V3_KINDS)
  ok(missDefaults.length === 0 && missV3.length === 0 && kinds.length === 16,
    '★ allowedKinds 列全了默认 8 种 + v3 的 8 种（put 只做 includes 检查，漏写默认 kind 会静默不可用 —— 清单 U4）', { missDefaults, missV3, n: kinds.length })
  ok(PACK_DEFAULTS['vmu.records.requireSettledRecords'] === false, 'requireSettledRecords=false：未定稿的卡能落盘', PACK_DEFAULTS['vmu.records.requireSettledRecords'])
  ok(PACK_DEFAULTS['vmu.records.bodyCapBytes'] === 65536, 'bodyCapBytes=65536（v3 大卡片），且它是构造期快照键', PACK_DEFAULTS['vmu.records.bodyCapBytes'])
  ok(PACK_DEFAULTS['vmu.records.head.maxItems'] === 2000, 'head.maxItems=2000（v3 卡多），且它是构造期快照键', PACK_DEFAULTS['vmu.records.head.maxItems'])

  // ★ typo guard: a defaults.json key that is not declared in settings/schema.js would fail silently.
  // ★ 计数不手写（Lead 裁决）：判据是 `undeclared.length === 0`（每把键都必须已登记），加上**具名必需项**逐条点名。
  // 这样下一次加键不会把这一行变成"该改没改"的债，而删掉任何一项具名必需键仍然会红。
  const declared = new Set(SETTING_DEFS.map((d) => d.key))
  const undeclared = Object.keys(PACK_DEFAULTS).filter((k) => !declared.has(k))
  const requiredValueLayerKeys = [
    'vmu.schedule.autoArm', 'vmu.schedule.timeSource', 'vmu.schedule.triggerVia', 'vmu.schedule.triggers',
    'vmu.v3.tickIntervalMs', 'vmu.records.tracks', 'vmu.records.allowedKinds', 'vmu.records.requireSettledRecords',
    'vmu.records.bodyCapBytes', 'vmu.records.head.maxItems', 'vmu.records.history.storeMode',
  ]
  const missingRequired = requiredValueLayerKeys.filter((k) => !Object.prototype.hasOwnProperty.call(PACK_DEFAULTS, k))
  ok(undeclared.length === 0 && missingRequired.length === 0,
    '值层：每把键都已在 settings/schema.js 声明，且 11 项具名必需键都在（判据是两个空清单，不手写计数）',
    { undeclared, missingRequired })

  ok(PACK && PACK.id === 'v3', 'PACK.id 是 v3', PACK && PACK.id)
  ok(Object.keys(PACK.settings || {}).length === 0,
    '★ PACK.settings 为空：构造期键必须只存在于 defaults.json（同键两处会被 O4 判重叠）', PACK.settings)
  const duplicated = CONSTRUCTION_KEYS.filter((k) => Object.prototype.hasOwnProperty.call(PACK.settings || {}, k))
  ok(duplicated.length === 0, '五个构造期键没有一个同时出现在清单 settings 里', duplicated)
  ok(PACK.tracks === undefined,
    '清单【故意不】声明 tracks：pack.js:479-482 走 kernel.declareTracks()，它必须 library root（无工作区即具名拒）且喂的是 library 而不是 vmu.records 的构造期快照', PACK.tracks)

  const entries = Array.isArray(PACK.middleware) ? PACK.middleware : []
  const tickEntry = entries.find((e) => e.id === 'v3-tick')
  const planeEntry = entries.find((e) => e.id === 'v3-dataplane')
  ok(tickEntry !== undefined && planeEntry !== undefined,
    '清单同时携带 tick 与 dataplane 两个模块（这里只钉"两者都在"，不钉总数：P0-2/P0-4/P0-7 还会再添模块）', entries.map((e) => e.id))
  ok(planeEntry && planeEntry.module && planeEntry.module.meta && planeEntry.module.meta.id === 'v3-dataplane',
    'dataplane 条目携带 module 对象（loader 才会附上 api；file: 不可用）', planeEntry && planeEntry.module && planeEntry.module.meta)
  ok(planeEntry && Array.isArray(planeEntry.on) && planeEntry.on.includes(V3_TICK_TOPIC),
    'dataplane 条目订阅 v3/tick（索引重建由声明式周期驱动）', planeEntry && planeEntry.on)
  ok(planeEntry && planeEntry.capabilities.includes('trigger-workflow') && planeEntry.module.capabilities.includes('trigger-workflow'),
    'dataplane 条目与模块都声明 trigger-workflow（解锁 api.services 的能力名）', planeEntry && planeEntry.capabilities)
  ok(planeEntry && tickEntry && planeEntry.order > tickEntry.order,
    'dataplane 排在 tick 之后（先写 journal，再重建索引）', { tick: tickEntry && tickEntry.order, plane: planeEntry && planeEntry.order })
}

console.log('=== 2. 内核构造期真的读到了值层（不是"声明了但没生效"） ===')
{
  const kernel = makeKernel(() => 1000)
  const caps = kernel.records.status().caps
  ok(sameList(caps.tracks, EXPECTED_TRACKS), 'records.status().caps.tracks 与值层逐项相同', caps.tracks)
  ok(caps.requireSettledRecords === false && caps.bodyCapBytes === 65536 && caps.headMaxItems === 2000,
    '三个构造期快照值与值层相同（构造期读点确实读到了）', { requireSettledRecords: caps.requireSettledRecords, bodyCapBytes: caps.bodyCapBytes, headMaxItems: caps.headMaxItems })
  ok(missingOf(caps.allowedKinds, V3_KINDS).length === 0, 'caps.allowedKinds 含全部 v3 kind', caps.allowedKinds)

  const unsettled = kernel.records.put({ track: 'problems', kind: 'problem', title: '未定稿问题', body: '# 问题｜未定稿\n- ID: q-0\n- 状态: 求解中', settled: false })
  ok(unsettled.ok === true && unsettled.fired.length === 0,
    '★ 未定稿可写：settled:false 的卡在 problems 轨上真的写进去了（requireSettledRecords=false）', unsettled.ok && unsettled.fired)
  const list1 = kernel.records.list({ track: 'problems' })
  ok(list1.available === 1 && list1.dropped === 0 && list1.truncated === false,
    '列表计数：available=1 / dropped=0 / 未截断', { available: list1.available, dropped: list1.dropped })
  ok(throwsCode(() => kernel.records.put({ track: 'problems', kind: 'bogus-kind', title: 'x', body: 'x' })) === 'VMU_INVALID_ARGUMENT',
    '未声明的 kind 被具名拒（allowedKinds 真的在拦）')
  ok(throwsCode(() => kernel.records.put({ track: 'notes', kind: 'state', title: 'x', body: 'x' })) === 'VMU_INVALID_ARGUMENT',
    '未声明的轨被具名拒（tracks 真的在拦）')
}
{
  const kernel = makeKernel(() => 2000, { 'vmu.records.headListAt': 1 })
  kernel.records.put({ track: 'problems', kind: 'problem', title: '甲', body: '# 问题｜甲\n- ID: q-a\n- 状态: 求解中' })
  kernel.records.put({ track: 'problems', kind: 'problem', title: '乙', body: '# 问题｜乙\n- ID: q-b\n- 状态: 求解中' })
  const list = kernel.records.list({ track: 'problems' })
  ok(list.items.length === 1 && list.dropped === 1 && list.truncated === true,
    '★ headListAt=1 放 2 条：列表只回 1 条，dropped=1（截断被计数，不静默）', { items: list.items.length, dropped: list.dropped })
  ok(list.available === 2, 'available 仍报 2（被截断的条目没有消失）', list.available)
}
{
  const kernel = makeKernel(() => 3000, { 'vmu.records.bodyCapBytes': 1024 })
  const big = 'a'.repeat(2048)
  const rec = kernel.records.put({ track: 'methods', kind: 'method', title: '超长卡', body: big })
  ok(Array.isArray(rec.fired) && rec.fired.includes('vmu.records.bodyCapBytes'),
    '★ 正文 2048B > cap 1024B：put 的 fired 点名 vmu.records.bodyCapBytes（截断被计数）', rec.fired)
  const got = kernel.records.get({ id: rec.id })
  ok(typeof got.body === 'string' && got.body.length <= 1024 && got.bodyTruncated === true,
    '★ 读回正文不超过 1024（截断＋计数，不是拒写 —— kernel/records.js:346-372）', { len: got.body.length, truncated: got.bodyTruncated })
}

console.log('=== 3. 三卡：形状、落点、逐字节往返；坏卡只点名；索引条目数 = 磁盘卡数 ===')
{
  let t = 4000
  const kernel = makeKernel(() => t)
  const r = kernel.records
  const problemCard = { id: 'q-1', 标题: '研究问题', 状态: '求解中', 优先级: 2, 陈述: '问题的陈述。', 来源与动机: '来自某次观察。', solutions: [{ title: '解法甲', prob: 0.5, status: '未定论', text: '解法甲的正文。' }] }
  const propCard = { id: 'p-1', 标题: '研究命题', 概率: 0.5, 陈述: '命题的陈述。', 来源问题: 'q-1', proofs: [{ title: '证明甲', prob: 1, status: '成立', text: '证明甲的全文。' }], refutes: [{ title: '证伪甲', prob: 0, status: '失败', text: '证伪甲的正文。' }] }
  const methodCard = { id: 'm-1', 标题: '一个方法', 状态: '经验', 核心内容: '方法的核心内容。', applications: [{ at: 't0', 问题: 'q-1', 方向: 'd1', text: '应用正文。' }], improvements: [{ v: 2, 原因: '更一般', text: '改进正文。' }] }

  const wq = writeCard({ records: r, kind: 'problem', card: problemCard })
  const wp = writeCard({ records: r, kind: 'proposition', card: propCard })
  const wm = writeCard({ records: r, kind: 'method', card: methodCard })
  ok(wq.ok === true && wq.track === 'problems' && wq.kind === 'problem', '问题卡落在 problems 轨', wq.track)
  ok(wp.ok === true && wp.track === 'propos' && wp.kind === 'proposition', '命题卡落在 propos 轨', wp.track)
  ok(wm.ok === true && wm.track === 'methods' && wm.kind === 'method', '方法卡落在 methods 轨', wm.track)

  const bodyQ = r.get({ id: wq.id }).body
  const bodyP = r.get({ id: wp.id }).body
  const bodyM = r.get({ id: wm.id }).body
  ok(bodyQ.includes('# 问题｜研究问题') && bodyQ.includes('- 状态: 求解中') && bodyQ.includes('## 陈述') && bodyQ.includes('## 解法候选') && bodyQ.includes('### 解法 1｜解法甲｜概率0.5｜状态未定论'),
    '问题卡的形状：标题行＋托管锚点＋陈述/解法候选段＋条目标题行', bodyQ.split('\n').slice(0, 6))
  ok(bodyP.includes('# 命题｜研究命题') && bodyP.includes('- 概率: 0.5') && bodyP.includes('## 证明尝试') && bodyP.includes('## 证伪尝试'),
    '命题卡的形状：概率锚点＋证明/证伪两段', bodyP.split('\n').slice(0, 8))
  ok(bodyM.includes('# 方法｜一个方法') && bodyM.includes('- 状态: 经验') && bodyM.includes('## 核心内容') && bodyM.includes('## 应用记录') && bodyM.includes('## 改进历史'),
    '方法卡的形状：9 个锚点区＋核心内容/应用记录/改进历史三段', bodyM.split('\n').slice(0, 8))

  const pq = parseCard(bodyQ)
  const pp = parseCard(bodyP)
  const pm = parseCard(bodyM)
  ok(pq.ok === true && pq.kind === 'problem' && pq.card.id === 'q-1' && pq.card.状态 === '求解中' && pq.card.solutions.length === 1,
    'parseCard 读回问题卡（状态/条目都回来了）', pq.ok && pq.card && pq.card.状态)
  ok(pp.ok === true && pp.kind === 'proposition' && pp.card.概率 === 0.5 && pp.card.proofs.length === 1 && pp.card.refutes.length === 1,
    'parseCard 读回命题卡（概率/两类条目都回来了）', pp.ok && pp.card && pp.card.概率)
  ok(pm.ok === true && pm.kind === 'method' && pm.card.id === 'm-1' && pm.card.applications.length === 1 && pm.card.improvements.length === 1,
    'parseCard 读回方法卡（应用/改进都回来了）', pm.ok && pm.card && pm.card.id)
  ok(composeCard(pq.kind, pq.card) === bodyQ, '★ 问题卡 compose→parse→compose 逐字节往返')
  ok(composeCard(pp.kind, pp.card) === bodyP, '★ 命题卡 compose→parse→compose 逐字节往返')
  ok(composeCard(pm.kind, pm.card) === bodyM, '★ 方法卡 compose→parse→compose 逐字节往返')

  const notCard = parseCard('这不是一张卡，只是一段文字。')
  ok(notCard.ok === false && notCard.reason === 'unknown-card-heading', '不是卡的文字被 parseCard 判为坏卡（不抛异常）', notCard.reason)

  // 索引：3 张好卡 + 1 张坏卡（kind 合法但正文不是卡）
  const bad = r.put({ track: 'problems', kind: 'problem', title: '坏卡', body: '这是坏卡：没有标题行也没有锚点。' })
  const idx = rebuildIndex({ records: r, tracks: EXPECTED_TRACKS })
  ok(idx.ok === true, '★ 坏卡不让索引整体失败（rebuildIndex 仍 ok）', idx.ok)
  ok(idx.entries === 3 && idx.diskCards === 4, '★ 索引条目数 = 成功解析的卡数（3），磁盘卡数 = 4', { entries: idx.entries, diskCards: idx.diskCards })
  ok(idx.badCards.length === 1 && idx.badCards[0].id === bad.id && idx.badCards[0].reason === 'unknown-card-heading',
    '坏卡被逐张点名（id ＋ reason），不是静默跳过', idx.badCards)
  ok(idx.dropped === 0 && idx.entries + idx.badCards.length + idx.dropped === idx.diskCards,
    '★ 恒等式：entries + badCards + dropped = diskCards（4 = 3+1+0）', { entries: idx.entries, bad: idx.badCards.length, dropped: idx.dropped, disk: idx.diskCards })
  const idxCap = rebuildIndex({ records: r, tracks: EXPECTED_TRACKS, limit: 1 })
  ok(idxCap.entries === 3 && idxCap.dropped === 1 && idxCap.entries + idxCap.dropped + idxCap.badCards.length === idxCap.diskCards,
    '★ 每轨 limit=1 时截断被计数：problems 轨 2 张只留 1 张 ⇒ entries=3（每轨 1 张）/ dropped=1，恒等式仍成立', { entries: idxCap.entries, dropped: idxCap.dropped, bad: idxCap.badCards.length, disk: idxCap.diskCards })
  ok(idxCap.byTrack.problems.available === 2 && idxCap.byTrack.problems.kept === 1 && idxCap.byTrack.problems.dropped === 1,
    'byTrack 逐轨自报 available / kept / dropped（检查点没有塌成总数）', idxCap.byTrack.problems)
}

console.log('=== 4. P0-6：正文里任意 `## ` 段在回写后逐字保留（自定义正文段契约） ===')
{
  const kernel = makeKernel(() => 5000)
  const r = kernel.records
  const w = writeCard({ records: r, kind: 'problem', card: { id: 'q-2', 标题: '带回写的问题', 状态: '求解中', 陈述: '原陈述。' } })
  const before = r.get({ id: w.id }).body
  // 人（或代理）在卡里加一段自定义正文；同时放进围栏代码块里的 `## ` 来证明它不是段边界。
  r.supersede({ id: w.id, reason: 'human adds a custom section', body: before + '\n' + CUSTOM_BLOCK + '\n' })
  const withCustom = r.get({ id: w.id }).body
  ok(withCustom.includes(CUSTOM_BLOCK), '前置：自定义段已经真的写进卡正文', withCustom.length)

  const upd = updateCard({ records: r, id: w.id, patch: { anchors: { 状态: '求解中·已派发' } } })
  ok(upd.ok === true && upd.updated.includes('状态'), 'updateCard 只改托管的 `- 状态:` 锚点', upd.updated)
  const after = r.get({ id: w.id }).body
  ok(/^- 状态: 求解中·已派发$/m.test(after), '★ 托管锚点真的被改写', after.split('\n').find((l) => l.startsWith('- 状态:')))
  ok(!/^- 状态: 求解中$/m.test(after), '旧的状态行不再留在正文里（同一条锚点只写一次）')
  ok(after.includes(CUSTOM_BLOCK),
    '★ 自定义段在回写后【逐字保留】（含围栏代码块里的 `## `，它没有被当成段边界）', after.slice(-120))
  const sectionNames = parseBodySections(after).map((s) => s.name)
  const leaked = sectionNames.filter((n) => n === '这不是段边界')
  ok(leaked.length === 0, '围栏里的 `## 这不是段边界` 没有被解析成一个段（否则回写会把代码块劈开）', sectionNames)
  const customSection = parseBodySections(after).find((s) => s.name === '自定义小节')
  ok(customSection && customSection.text === CUSTOM_TEXT.trim(), '自定义段的正文文本逐字节相同（trim 边界除外）', customSection && customSection.text.length)
  ok((after.match(/## 自定义小节/g) || []).length === 1, '回写没有把自定义段复制成两份', (after.match(/## 自定义小节/g) || []).length)

  const upd2 = updateCard({ records: r, id: w.id, patch: { anchors: { 状态: '求解中·已派发' } } })
  ok(upd2.ok === true && r.get({ id: w.id }).body === after, '★ 同一 patch 再回写一次：正文逐字节不变（回写是幂等的）', upd2.rev)

  const upd3 = updateCard({ records: r, id: w.id, patch: { sections: { 陈述: '改写后的陈述。' } } })
  const after3 = r.get({ id: w.id }).body
  ok(upd3.ok === true && after3.includes('## 陈述\n改写后的陈述。'), '托管段能按 patch 改写（陈述段）', after3.split('\n').slice(0, 20))
  ok(after3.includes(CUSTOM_BLOCK), '托管段改写时，自定义段依旧逐字保留')

  const upd4 = updateCard({ records: r, id: w.id, patch: { sections: { 经验与教训: '新增的自定义段。' } } })
  ok(upd4.ok === true && upd4.preserved.includes('经验与教训') && r.get({ id: w.id }).body.includes('## 经验与教训\n新增的自定义段。'),
    'patch 里不属于托管清单的段 ⇒ 作为自定义段追加（正文只增不减）', upd4.preserved)

  const raw = { id: 'q-3', 标题: '无自定义段' }
  const rw = rewriteCard(composeCard('problem', raw), { anchors: { 状态: '求解中' } })
  ok(rw.ok === true && rw.preserved.length === 0, '没有自定义段的卡：preserved 为空（不是"假装保留了什么"）', rw.preserved)
  const broken = rewriteCard('这不是卡', { anchors: { 状态: '求解中' } })
  ok(broken.ok === false && broken.reason === 'unknown-card-heading', '坏卡回写返回具名 reason（updateCard 据此具名拒）', broken.reason)
  ok(throwsCode(() => updateCard({ records: r, id: 'r-does-not-exist', patch: {} })) === 'VMU_NO_SUCH_OBJECT', '对不存在的记录 updateCard 透传具名码 VMU_NO_SUCH_OBJECT')
}

console.log('=== 5. P0-6：Verified 分裂 —— 只有定论进 verified 轨，内容不变不重写 ===')
{
  const kernel = makeKernel(() => 6000)
  const r = kernel.records
  const w = writeCard({ records: r, kind: 'proposition', card: { id: 'p-2', 标题: '待定命题', 概率: 0.5, 陈述: '命题陈述。', proofs: [{ title: '证明乙', prob: 1, status: '成立', text: '证明乙全文。' }], refutes: [] } })
  ok(throwsCode(() => promoteVerified({ records: r, sourceId: w.id, at: 6000 })) === 'VMU_STATE',
    '★ 概率 0.5 的命题不能进 verified 轨（具名拒 VMU_STATE，不是静默不写）')
  ok(r.list({ track: 'verified' }).available === 0, '被拒后 verified 轨仍为 0 条（拒绝没有留下半张卡）')

  updateCard({ records: r, id: w.id, patch: { anchors: { 概率: 1, 状态: '已定论' } } })
  const promoted = promoteVerified({ records: r, sourceId: w.id, at: 6000 })
  ok(promoted.ok === true && promoted.written === true && promoted.结论 === true && promoted.概率 === 1,
    '定论后 promoteVerified 写进 verified 轨（结论=真，概率=1）', promoted.written && promoted.结论)
  const vList = r.list({ track: 'verified' })
  ok(vList.available === 1, 'verified 轨恰好 1 条', vList.available)
  const vBody = r.get({ id: vList.items[0].id }).body
  ok(/- 概率: 1/.test(vBody) && /- 结论: 真/.test(vBody), '★ Verified 卡带结论与概率（verified 轨只含 1/0）', vBody.split('\n').slice(0, 6))
  ok(/- 时间: 1970-01-01T00:00:06\.000Z/.test(vBody), 'Verified 卡的时间来自注入时钟（不是 Date.now）', vBody.split('\n').find((l) => l.startsWith('- 时间:')))
  ok(/- 来源: q-1|- 来源: p-2/.test(vBody) && /- 分类: /.test(vBody), 'Verified 卡带来源与分类（随信可追溯）', vBody.split('\n').slice(4, 8))
  ok(vBody.includes('## 可信内容') && vBody.includes('【证明 #1】证明乙全文。'), '★ Verified 卡的"可信内容"收着全部 prob=1 的全文', vBody.split('## 可信内容')[1])
  ok(vBody.includes('## 陈述\n命题陈述。'), 'Verified 卡复制了源卡的陈述（结论/时间/来源/全文四件齐）')

  const again = promoteVerified({ records: r, sourceId: w.id, at: 9999 })
  ok(again.written === false && again.unchanged === true && r.list({ track: 'verified' }).available === 1,
    '★ 内容不变不重写（written:false, unchanged:true —— 同 v3 writeVerifiedCardIfChanged）', { written: again.written, unchanged: again.unchanged })

  const wq = writeCard({ records: r, kind: 'problem', card: { id: 'q-4', 标题: '待解问题', 状态: '求解中', 陈述: '问题陈述。' } })
  ok(throwsCode(() => promoteVerified({ records: r, sourceId: wq.id, at: 6000 })) === 'VMU_STATE', '状态"求解中"的问题不能进 verified 轨')
  updateCard({ records: r, id: wq.id, patch: { anchors: { 状态: '已解决' } } })
  const pv = promoteVerified({ records: r, sourceId: wq.id, at: 7000 })
  ok(pv.ok === true && pv.written === true && pv.结论 === true && pv.概率 === 1, '问题已解决 ⇒ Verified 结论=真、概率=1', pv.结论)

  const wm = writeCard({ records: r, kind: 'method', card: { id: 'm-9', 标题: '一个方法', 核心内容: '内容。' } })
  ok(throwsCode(() => promoteVerified({ records: r, sourceId: wm.id, at: 6000 })) === 'VMU_INVALID_ARGUMENT', '方法卡不能进 verified 轨（具名拒 VMU_INVALID_ARGUMENT）')

  const all = r.list({ track: 'verified' })
  ok(all.available === 2, 'verified 轨现在恰有 2 条（一命题一问题）', all.available)
  // ★ 逐条断言（先钉住具体条数，再 forEach；不用空集恒真的 every）。
  let matched = 0
  all.items.forEach((item) => {
    const body = r.get({ id: item.id }).body
    if (/- 概率: [01]/.test(body) && /- 结论: (真|假)/.test(body)) matched += 1
  })
  ok(matched === 2, 'verified 轨的每一条都是定论卡（概率 1/0 ＋ 结论 真/假）', matched)

  const parsedVerified = parseCard('## 坏\n# 已验证｜x\n- ID: x-1\n- 类型: 命题\n- 结论: 真\n- 概率: 0.5\n- 分类: 未分类\n- 来源: x\n- 时间: t')
  ok(parsedVerified.ok === false && parsedVerified.reason === 'verified-not-settled:概率=0.5',
    '★ 概率不是 1/0 的"Verified 卡"被判坏卡（verified 轨只收定论）', parsedVerified.reason)
  ok(findVerified(r, 'nosuch-source') === null, 'findVerified 对未知源卡返回 null（不猜一张卡）')
}

console.log('=== 6. P0-6：提示词只把 Verified 当事实（段文本来自 prompts/sections.json） ===')
{
  const raw = JSON.parse(readFileSync(SECTIONS_FILE, 'utf8'))
  const sections = Array.isArray(raw.sections) ? raw.sections : []
  const trust = sections.find((s) => s && s.name === 'v3-verified-trust')
  ok(sections.length >= 1 && trust !== undefined, 'sections.json 含 v3-verified-trust 段（不钉"只此一段"：后续卡可再加段）', sections.map((s) => s && s.name))
  ok(trust.name === 'v3-verified-trust' && trust.order >= 600 && trust.order <= 899 && trust.range === 'pack',
    '段的 order 落在 pack 区间 [600,899] 且 range 与 order 一致（kernel/prompt/index.js ORDER_RANGES）', { name: trust.name, order: trust.order, range: trust.range })
  ok(typeof trust.text === 'string' && trust.text.includes('绝对可信') && trust.text.includes('经验参考'),
    '★ 段文本同时写明"绝对可信"与"经验参考"两侧（缺一侧即失败）', trust.text && trust.text.slice(0, 40))
  ok(typeof trust.text === 'string' && trust.text.includes('verified') && trust.text.includes('不得当事实'),
    '★ 段文本点名 verified 轨是唯一事实来源，并明确其余"不得当事实"')
  ok(!readFileSync(DATAPLANE_FILE, 'utf8').includes('绝对可信'),
    '★ 段文本不在 middleware/dataplane.js 里（文本是数据，不是硬编码进代码）')
}

console.log('=== 7. P0-9：tick 驱动的索引重建（模块经总线真的接上，5s 节流） ===')
{
  let t = 7000
  const kernel = makeKernel(() => t)
  const loader = createPackLoader({ kernel, registry: kernel.registry, onPromptPolicy: () => () => {} })
  const applied = await loader.apply(PACK)
  ok(applied && applied.ok === true, 'v3 包装载干净（两个 module 形状条目都经 loader 装载）', applied && { applied: applied.applied, actions: applied.actions && applied.actions.length })
  const busIds = kernel.bus.entries().map((e) => String(e.id))
  ok(busIds.some((id) => id.startsWith('v3-dataplane')), 'dataplane 模块挂到了总线（entries 里有它）', busIds.filter((id) => id.startsWith('v3-')))

  const before = v3DataplaneStatus()
  ok(before.indexRuns === 0 && before.throttleMs === INDEX_THROTTLE_MS,
    '索引还没跑过，节流值是 v3 的 5000ms（常量，状态里自报）', { runs: before.indexRuns, throttle: before.throttleMs })
  ok(INDEX_THROTTLE_MS === 5000, 'INDEX_THROTTLE_MS=5000（v3 `:2039` 的 5s 节流；没有设置键，不自称可配）', INDEX_THROTTLE_MS)

  const r = kernel.records
  writeCard({ records: r, kind: 'problem', card: { id: 'q-7', 标题: '索引甲', 状态: '求解中', 陈述: '甲。' } })
  writeCard({ records: r, kind: 'proposition', card: { id: 'p-7', 标题: '索引乙', 概率: 0.5, 陈述: '乙。' } })
  const e1 = await kernel.bus.emit(V3_TICK_TOPIC, { at: 7000, triggerVia: 'test' }, {})
  const s1 = v3DataplaneStatus()
  ok(s1.indexRuns === 1 && s1.lastIndexAt === 7000, '★ 第一次 tick ⇒ 索引重建 1 次（at=7000）', { runs: s1.indexRuns, at: s1.lastIndexAt })
  ok(s1.index && s1.index.entries === 2 && s1.index.diskCards === 2 && s1.index.dropped === 0,
    '★ 索引条目数 = 磁盘卡数（2 = 2）', s1.index && { entries: s1.index.entries, disk: s1.index.diskCards })
  ok(s1.index && s1.index.badCards.length === 0, '两张卡都是好卡（badCards 为空是因为确实都解析成功，先钉了 entries=2）', s1.index && s1.index.badCards)
  ok(s1.index && sameList(s1.index.tracks, EXPECTED_TRACKS), '索引覆盖值层声明的每一条轨（从 caps.tracks 来，不是硬编码）', s1.index && s1.index.tracks)
  ok(e1 !== undefined, 'tick 事件经总线送达（emit 有回执）')

  const e2 = await kernel.bus.emit(V3_TICK_TOPIC, { at: 8000, triggerVia: 'test' }, {})
  const s2 = v3DataplaneStatus()
  ok(s2.indexRuns === 1 && s2.lastIndexAt === 7000, '★ 距上次 <5s（7000→8000）⇒ 节流，不重建索引', { runs: s2.indexRuns, at: s2.lastIndexAt })
  ok(e2 !== undefined, '被节流的那次 tick 也有回执（不是静默丢弃）')

  writeCard({ records: r, kind: 'method', card: { id: 'm-7', 标题: '索引丙', 核心内容: '丙。' } })
  await kernel.bus.emit(V3_TICK_TOPIC, { at: 12000, triggerVia: 'test' }, {})
  const s3 = v3DataplaneStatus()
  ok(s3.indexRuns === 2 && s3.lastIndexAt === 12000, '★ 距上次 ≥5s（7000→12000）⇒ 重建，累计 2 次', { runs: s3.indexRuns, at: s3.lastIndexAt })
  ok(s3.index && s3.index.entries === 3 && s3.index.diskCards === 3,
    '★ 新写的卡出现在重建后的索引里（索引是读视图，不是缓存）', s3.index && { entries: s3.index.entries, disk: s3.index.diskCards })
  const journalCount = r.list({ track: 'journal' }).available
  ok(journalCount >= 3, 'tick 体每次都写了 journal（数据面不写记录，journal 的条数只来自 tick）', journalCount)
}

console.log('=== 8. 装配路径（真机那一半）：defaults.json 在构造前折入 ＋ 可信分层段真的进提示词 ===')
{
  const entry = await import(pathToFileURL(ENTRY).href)
  const hostState = { specs: [], effects: [] }
  const ctx = {
    effect(fn, label) { hostState.effects.push(label); return fn() },
    on() { return () => {} },
    tools: { register: async (spec) => { hostState.specs.push(spec); return () => {} } },
  }
  let entryClock = 1000
  const handle = entry.apply(ctx, { clock: () => entryClock, packs: ['v3'] })
  await handle.ready()
  ok(handle.packErrors().length === 0, '真实入口装载 packs=[v3] 无错（清单 settings 为空，不产生冲突）', handle.packErrors())
  ok(handle.appliedPacks().some((p) => p.id === 'v3'), 'pack v3 被记为已应用', handle.appliedPacks().map((p) => p.id))

  const caps = handle.kernel.records.status().caps
  ok(sameList(caps.tracks, EXPECTED_TRACKS),
    '★ 真实入口的内核 records.status().caps.tracks 就是值层的全套轨（defaults.json 在建内核之前折入）', caps.tracks)
  ok(caps.requireSettledRecords === false && caps.bodyCapBytes === 65536 && caps.headMaxItems === 2000,
    '★ 三个构造期值在真实入口上也真的生效（不是只在单测的 settings 对象里）', { requireSettledRecords: caps.requireSettledRecords, bodyCapBytes: caps.bodyCapBytes, headMaxItems: caps.headMaxItems })
  const unsettledOnEntry = handle.kernel.records.put({ track: 'problems', kind: 'problem', title: '未定稿', body: '# 问题｜未定稿\n- ID: q-e1\n- 状态: 求解中', settled: false })
  ok(unsettledOnEntry.ok === true, '★ 真实入口上未定稿的卡也写得进去（requireSettledRecords=false 真的落到了内核）', unsettledOnEntry.ok)
  ok(throwsCode(() => handle.kernel.records.put({ track: 'propositions', kind: 'proposition', title: 'x', body: 'x' })) === 'VMU_INVALID_ARGUMENT',
    '真实入口上写错轨名（propositions ≠ propos）被具名拒 —— 轨名以值层为准')

  const asm = await handle.kernel.prompt.assemble({ member: 'planner', role: 'planner', roleLabel: '规划', phase: 'normal', round: 1 })
  ok(asm.ok === true && typeof asm.text === 'string', '真实入口的提示词装配成功', asm.ok)
  ok(/绝对可信/.test(asm.text) && /经验参考/.test(asm.text),
    '★ 真实提示词文本里同时出现"绝对可信"与"经验参考"（可信分层段从 packs/v3/prompts/sections.json 折入）')
  ok(asm.sources.some((s) => s.section === 'v3-verified-trust' && s.source === 'pack:v3'),
    '★ 该段的来源是 pack:v3（装配回执点名来源，不是凭空出现）', asm.sources.filter((s) => s.section === 'v3-verified-trust'))
  ok(caps.tracks.includes('verified') && asm.text.includes('verified'),
    '提示词点的轨名与内核声明的轨名一致（verified 两侧都真的存在）', 'verified')
  for (const cleanup of handle.cleanups || []) { try { cleanup() } catch (e) { /* unwind is the host's job */ } }
}

console.log('')
console.log('=== V3 DATAPLANE (P0-9+P0-6): ' + passed + ' passed, ' + failed + ' failed ===')
if (failures.length > 0) for (const f of failures) console.error('  - ' + f)
process.exit(failed === 0 ? 0 : 1)

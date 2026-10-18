// tests/vmu-v3-prompts.test.mjs — PHASE 6 / **P1-6（v3 提示词复刻）**。
//
// 这张卡要证明的不是"写了几个段文件"，而是下面这些【都会失败】的事实：
//
//   ① 段声明是**可注册的**：name 是 kebab-case、order 落在 pack 区间 [600,899]、
//      range 与 order 一致、`scope` 非空、文本非空、来源是 pack:v3。
//   ② ★★★ **互斥**：v3 的八个角色提示词在 v3 里每次派发只出现一个，而 vmu 的段默认全装配。
//      所以这里逐角色装配一次，断言 `【v3 角色｜` 出现**恰 1 次**、且另外六个角色的 marker
//      **一个都不出现**；同时断言反方向（verifier 的装配文本里没有 solver 的 marker）。
//   ③ **知识上下文按角色组合**：solver 拿写工作流与求解器归属、method-keeper 拿方法整理归属、
//      verifier 拿验证规则但不拿方法库规则、paper-writer 不拿知识上下文——逐项断言出现/不出现，
//      并钉住**出现条数**（不是"至少一个"的随形写法）。
//   ④ **顺序固定**：知识上下文 650→658 在角色段之前，论文材料→骨架→LaTeX→角色；planner 段在简报
//      字段说明之前。断言的是相对 index（`indexOf` 的比较），不是"文本里含有"。
//   ⑤ **未声明 ⇒ 不出现**：role=researcher 的装配里没有任何 v3 段；role=explorer 但没传 task 时
//      explorer/rederive 两段都不出现（fail-safe：宁可没有角色说明，也不要两套人设同时出现）。
//   ⑥ 根 persona（assistant.json）是**数据可读且无占位符**的：4 段、hostPrompt 全为 true、
//      文本里没有 `{{`（该通道不渲染变量），段名 kebab-case。
//
// RULE E（本仓的"不可能失败"守卫）：集合类断言一律先钉住**具体条数**，再用逐项 for 循环；
// 不用 `.every(` 判可能为空的集合；不把断言塞进条件分支。每条断言都在注释里点名"怎样会让它红"。
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

import { createKernel } from '../vibe-math-vmu/kernel/index.js'
import { PACK } from '../vibe-math-vmu/packs/v3/index.js'
import {
  V3_PROMPT_SECTIONS, V3_SECTION_FAMILY, V3_SECTION_MARKERS, V3_ROLE_NAMES, V3_ROLE_PREFIX,
} from '../vibe-math-vmu/packs/v3/prompts/index.js'
import { V3_KNOWLEDGE_SECTIONS } from '../vibe-math-vmu/packs/v3/prompts/knowledge.js'
import { V3_ROLE_SECTIONS } from '../vibe-math-vmu/packs/v3/prompts/roles.js'
import { V3_PAPER_SECTIONS } from '../vibe-math-vmu/packs/v3/prompts/paper.js'
import { V3_BRIEF_SECTIONS } from '../vibe-math-vmu/packs/v3/prompts/briefs.js'

const HERE = dirname(fileURLToPath(import.meta.url))
const VMU = join(HERE, '..', 'vibe-math-vmu')
const ASSISTANT_FILE = join(VMU, 'packs', 'v3', 'prompts', 'assistant.json')
const KEBAB = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/
const ROLE_COUNT = 7
const KNOWLEDGE_COUNT = 9
const BRIEF_COUNT = 2
const PAPER_COUNT = 3
const TOTAL_COUNT = ROLE_COUNT + KNOWLEDGE_COUNT + BRIEF_COUNT + PAPER_COUNT // 21

let passed = 0
let failed = 0
const failures = []
const ok = (cond, label, detail) => {
  if (cond) { passed++; console.log('  ok   ' + label); return true }
  failed++; failures.push(label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  console.error('  FAIL ' + label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  return false
}
const occurrences = (text, needle) => String(text).split(needle).length - 1
const countOf = (list, pred) => { let n = 0; for (const x of list) if (pred(x)) n++; return n }

console.log('=== 1. 段声明的形状：21 段、唯一名、pack 区间、scope 非空、无模板变量 ===')
{
  ok(V3_PROMPT_SECTIONS.length === TOTAL_COUNT,
    '★ 段总数恰为 ' + TOTAL_COUNT + '（知识 ' + KNOWLEDGE_COUNT + ' + 简报 ' + BRIEF_COUNT + ' + 论文 ' + PAPER_COUNT + ' + 角色 ' + ROLE_COUNT + '）',
    V3_PROMPT_SECTIONS.length)
  ok(V3_KNOWLEDGE_SECTIONS.length === KNOWLEDGE_COUNT && V3_ROLE_SECTIONS.length === ROLE_COUNT &&
    V3_BRIEF_SECTIONS.length === BRIEF_COUNT && V3_PAPER_SECTIONS.length === PAPER_COUNT,
    '★ 四个族各自的条数与汇总一致（任何一族少一段都会红）',
    { k: V3_KNOWLEDGE_SECTIONS.length, r: V3_ROLE_SECTIONS.length, b: V3_BRIEF_SECTIONS.length, p: V3_PAPER_SECTIONS.length })

  const names = V3_PROMPT_SECTIONS.map((s) => s.name)
  const uniq = new Set(names)
  ok(uniq.size === names.length && names.length === TOTAL_COUNT,
    '★ 段名唯一（重名 = kernel/pack.js 的 collectPackSections 具名拒，且装配会少一段）', names)
  ok(Object.keys(V3_SECTION_FAMILY).length === TOTAL_COUNT,
    '★ family 表覆盖全部 ' + TOTAL_COUNT + ' 段（漏登记 = 下面"角色恰一个"的分类断言失去依据）',
    Object.keys(V3_SECTION_FAMILY).length)
  ok(countOf(V3_PROMPT_SECTIONS, (s) => V3_SECTION_FAMILY[s.name] === 'role') === ROLE_COUNT &&
    countOf(V3_PROMPT_SECTIONS, (s) => V3_SECTION_FAMILY[s.name] === 'knowledge') === KNOWLEDGE_COUNT &&
    countOf(V3_PROMPT_SECTIONS, (s) => V3_SECTION_FAMILY[s.name] === 'brief') === BRIEF_COUNT &&
    countOf(V3_PROMPT_SECTIONS, (s) => V3_SECTION_FAMILY[s.name] === 'paper') === PAPER_COUNT,
    '★ family 分类的条数就是各族条数（分类贴错会让互斥断言数错东西）')

  const roleNameValues = Object.values(V3_ROLE_NAMES)
  ok(roleNameValues.length === ROLE_COUNT && new Set(roleNameValues).size === ROLE_COUNT,
    '★ 7 个角色标识互不相同（"一次装配只有一个角色"的断言按它分类）', roleNameValues)

  const bad = []
  // ★ RULE E guard: without this, an EMPTY V3_PROMPT_SECTIONS would run zero assertions below and report nothing.
ok(V3_PROMPT_SECTIONS.length > 0, 'the prompt-section list is non-empty (a loop over it must not be vacuous)', V3_PROMPT_SECTIONS.length)
for (const s of V3_PROMPT_SECTIONS) {
    if (!KEBAB.test(String(s.name))) bad.push(s.name + ':name')
    if (!Number.isInteger(s.order) || s.order < 600 || s.order > 899) bad.push(s.name + ':order=' + String(s.order))
    if (s.range !== 'pack') bad.push(s.name + ':range=' + String(s.range))
    if (s.source !== 'pack:v3') bad.push(s.name + ':source=' + String(s.source))
    if (!s.scope || typeof s.scope !== 'object' || Object.keys(s.scope).length === 0) bad.push(s.name + ':scope')
    if (typeof s.text !== 'string' || s.text.length < 200) bad.push(s.name + ':text-length=' + String((s.text || '').length))
    // 该通道不渲染变量；带占位符的段会渲染成空槽（strict 下还会拒装配）。
    if (String(s.text).includes('{{')) bad.push(s.name + ':has-template')
    // 散文里不写点号键：未声明的点号串会被门禁当设置键（本仓已咬过三次）。
    if (/vmu\.[A-Za-z]/.test(String(s.text))) bad.push(s.name + ':dotted-key-in-text')
  }
  ok(bad.length === 0, '★ 每段都满足：kebab 名／order∈[600,899]／range=pack／source=pack:v3／scope 非空／文本≥200 字／无 {{ }}／无点号键', bad)

  const markers = Object.values(V3_SECTION_MARKERS)
  ok(markers.length === TOTAL_COUNT && new Set(markers).size === TOTAL_COUNT,
    '★ 21 个首行 marker 互不相同（相同 = "marker 出现次数"的断言数不出角色）', markers)
  const markerMiss = []
  for (const s of V3_PROMPT_SECTIONS) if (V3_SECTION_MARKERS[s.name] !== String(s.text).split('\n')[0]) markerMiss.push(s.name)
  ok(markerMiss.length === 0, '★ marker 就是从段文本首行派生的（不存在第二份会漂移的 marker 表）', markerMiss)
}

console.log('=== 2. 根 persona（assistant.json）：数据可读、4 段、hostPrompt、无占位符 ===')
{
  let parsed = null
  let readErr = null
  try { parsed = JSON.parse(readFileSync(ASSISTANT_FILE, 'utf8')) } catch (e) { readErr = String((e && e.message) || e) }
  ok(parsed !== null, '★ packs/v3/prompts/assistant.json 是合法 JSON（插件按目录名 readFileSync + JSON.parse）', readErr)
  const sections = parsed && Array.isArray(parsed.sections) ? parsed.sections : []
  ok(sections.length === 4, '★ 根 persona 是 4 段（身份／机构语义／汇报规则／诚实边界）', sections.map((s) => s && s.name))
  const badHost = []
  for (const s of sections) {
    if (!s || s.hostPrompt !== true) badHost.push((s && s.name) || '(unnamed)')
    if (!s || !KEBAB.test(String(s.name))) badHost.push('name:' + String(s && s.name))
    if (!s || typeof s.text !== 'string' || s.text.length < 100) badHost.push('text:' + String(s && s.name))
    if (s && String(s.text).includes('{{')) badHost.push('template:' + s.name)
  }
  ok(badHost.length === 0,
    '★ 每一段都 hostPrompt:true、kebab 名、文本≥100 字、且没有 {{ }}（该通道只 join、不渲染变量）', badHost)
  const totalChars = sections.reduce((n, s) => n + String((s && s.text) || '').length, 0)
  // 下限 1500：v3 原文的根 persona 是 11.5KB，但它含【36 条工具清单】——vmu 那边工具目录由宿主提供，
  // 本复刻只保留机构语义与规则，所以体量更小是设计选择；低于 1500 则说明机构语义被丢了。
  ok(totalChars >= 1500 && totalChars <= 20000,
    '★ 根 persona 体量在 1.5K–20K 字符之间（太小 = 把机构语义丢了；太大 = 快照/重复）', totalChars)
  ok(JSON.stringify(parsed.bindings) === '[]', '★ bindings 为空数组（根 persona 段不按维绑定）', parsed.bindings)
}

console.log('=== 3. 装配：互斥、按角色组合、顺序固定、未声明不出现 ===')
{
  // 与"Lead 统一接线"解耦：清单已声明我方的段就用清单的，没声明就补进来——
  // 并且下面会断言"部分接线"是不允许的（全有或全无）。
  const declared = Array.isArray(PACK.sections) ? PACK.sections : []
  const declaredNames = new Set(declared.map((s) => s.name))
  const allSections = declared.concat(V3_PROMPT_SECTIONS.filter((s) => !declaredNames.has(s.name)))
  const dupNames = allSections.map((s) => s.name)
  ok(new Set(dupNames).size === dupNames.length,
    '★ 合并后的段名不重复（清单与我方模块同名 = 装配期 collectPackSections 具名拒）', dupNames)

  const kernel = createKernel({ settings: {}, sections: allSections })
  const assemble = (ctx) => kernel.prompt.assemble(Object.assign({ member: 'm-1', roleLabel: '成员', round: 1 }, ctx))
  const CONTEXTS = [
    { key: 'explorer', ctx: { role: 'explorer', task: 'explore', phase: 'normal' } },
    { key: 'rederive', ctx: { role: 'explorer', task: 'rederive', phase: 'normal' } },
    { key: 'solver', ctx: { role: 'solver', phase: 'normal' } },
    { key: 'verifier-review', ctx: { role: 'verifier', phase: 'verify' } },
    { key: 'verifier-debate', ctx: { role: 'verifier', phase: 'verify-debate' } },
    { key: 'method-keeper', ctx: { role: 'method-keeper', phase: 'normal' } },
    { key: 'paper-writer', ctx: { role: 'paper-writer', phase: 'normal' } },
    { key: 'planner', ctx: { role: 'planner', phase: 'normal' } },
  ]
  // 上下文 key → 该角色应出现的段名；planner 是 null（它没有"角色"段，它的段在 planner.js）。
  const ROLE_SECTION_OF = {
    explorer: 'v3-role-explorer',
    rederive: 'v3-role-explorer-rederive',
    solver: 'v3-role-solver',
    'verifier-review': 'v3-role-verifier-review',
    'verifier-debate': 'v3-role-verifier-debate',
    'method-keeper': 'v3-role-method-keeper',
    'paper-writer': 'v3-role-paper-writer',
    planner: null,
  }
  const ROLE_MARKER_LIST = V3_ROLE_SECTIONS.map((s) => V3_SECTION_MARKERS[s.name])
  const texts = {}

  // ---- 3a. 每个上下文：装配成功；角色 marker 恰一个；其他角色 marker 一个都不出现 ----
  // ★ RULE E guard: same reason - an empty CONTEXTS would make both loops below assertion-free.
ok(CONTEXTS.length > 0, 'the context fixture list is non-empty (a loop over it must not be vacuous)', CONTEXTS.length)
for (const c of CONTEXTS) {
    const asm = await assemble(c.ctx)
    ok(asm.ok === true && typeof asm.text === 'string', '★ ' + c.key + '：装配成功', asm.ok === false ? asm.refused : undefined)
    const text = asm.ok === true ? asm.text : ''
    texts[c.key] = text
    // 恰一个角色：planner 是 0（它没有角色段），其余是 1。
    const wantRoleCount = ROLE_SECTION_OF[c.key] === null ? 0 : 1
    const roleHits = occurrences(text, V3_ROLE_PREFIX)
    ok(roleHits === wantRoleCount,
      '★★ ' + c.key + '：角色抬头出现恰 ' + wantRoleCount + ' 次（出现 2 次 = 把"互斥"写成了"并列"，本卡的头号风险）', roleHits)
    // 逐角色：该出现的出现，不该出现的不出现。
    const roleIssues = []
    for (const rn of Object.keys(ROLE_SECTION_OF)) {
      const sectionName = ROLE_SECTION_OF[rn]
      const marker = sectionName === null ? null : V3_SECTION_MARKERS[sectionName]
      if (!marker) continue
      const hit = text.includes(marker)
      const want = rn === c.key
      if (hit !== want) roleIssues.push(rn + (want ? ':missing' : ':leaked'))
    }
    ok(roleIssues.length === 0, '★★ ' + c.key + '：该角色段出现、其余 ' + (ROLE_COUNT - 1) + ' 个角色段的 marker 全部不出现', roleIssues)
  }

  // ---- 3b. 反方向断言（点名写出来，不靠上一条的循环替它说话） ----
  ok(texts['solver'].includes(V3_SECTION_MARKERS['v3-role-solver']) &&
    !texts['verifier-review'].includes(V3_SECTION_MARKERS['v3-role-solver']),
    '★★ 反向：solver 的装配有 solver marker，verifier 的装配【没有】solver marker')
  ok(texts['verifier-review'].includes(V3_SECTION_MARKERS['v3-role-verifier-review']) &&
    !texts['solver'].includes(V3_SECTION_MARKERS['v3-role-verifier-review']),
    '★★ 反向：verifier 的装配有 verifier marker，solver 的装配【没有】verifier marker')

  // ---- 3c. 知识上下文按角色组合（逐项出现/不出现，并钉住条数） ----
  const KB_EXPECT = {
    explorer: ['v3-kb-object-models', 'v3-kb-tracks', 'v3-kb-output-quality', 'v3-kb-method-library', 'v3-capabilities'],
    rederive: ['v3-kb-object-models', 'v3-kb-tracks', 'v3-kb-output-quality', 'v3-kb-method-library', 'v3-capabilities'],
    solver: ['v3-kb-object-models', 'v3-kb-tracks', 'v3-kb-output-quality', 'v3-kb-method-library', 'v3-write-workflow', 'v3-role-files-solver', 'v3-capabilities'],
    'verifier-review': ['v3-kb-object-models', 'v3-kb-tracks', 'v3-kb-output-quality', 'v3-capabilities', 'v3-verifier-rules'],
    'verifier-debate': ['v3-kb-object-models', 'v3-kb-tracks', 'v3-kb-output-quality', 'v3-capabilities', 'v3-verifier-rules'],
    'method-keeper': ['v3-kb-object-models', 'v3-kb-tracks', 'v3-kb-output-quality', 'v3-kb-method-library', 'v3-write-workflow', 'v3-role-files-keeper', 'v3-capabilities'],
    'paper-writer': [],
    planner: [],
  }
  // ★ RULE E guard: same reason - an empty CONTEXTS would make both loops below assertion-free.
ok(CONTEXTS.length > 0, 'the context fixture list is non-empty (a loop over it must not be vacuous)', CONTEXTS.length)
for (const c of CONTEXTS) {
    const want = KB_EXPECT[c.key]
    const text = texts[c.key]
    // 出现条数必须等于期望条数：多一段（scope 写漏）或少一段（scope 写多）都会红。
    let hitCount = 0
    const issues = []
    for (const s of V3_KNOWLEDGE_SECTIONS) {
      const hit = text.includes(V3_SECTION_MARKERS[s.name])
      if (hit) hitCount++
      const should = want.includes(s.name)
      if (hit !== should) issues.push(s.name + (should ? ':missing' : ':leaked'))
    }
    ok(hitCount === want.length && issues.length === 0,
      '★ ' + c.key + '：知识上下文恰 ' + want.length + ' 段（按角色组合，不是全给或全不给）', issues)
  }

  // ---- 3d. 简报段与论文段：只给对应角色 ----
  const briefIssues = []
  if (!texts['planner'].includes(V3_SECTION_MARKERS['v3-brief-planner'])) briefIssues.push('planner:missing-brief')
  if (texts['solver'].includes(V3_SECTION_MARKERS['v3-brief-planner'])) briefIssues.push('solver:leaked-planner-brief')
  if (!texts['method-keeper'].includes(V3_SECTION_MARKERS['v3-brief-method-digest'])) briefIssues.push('method-keeper:missing-digest')
  if (texts['solver'].includes(V3_SECTION_MARKERS['v3-brief-method-digest'])) briefIssues.push('solver:leaked-digest')
  ok(briefIssues.length === 0, '★ 简报段各自只给 planner／method-keeper（solver 两条都不能有）', briefIssues)

  const paperIssues = []
  for (const s of V3_PAPER_SECTIONS) if (!texts['paper-writer'].includes(V3_SECTION_MARKERS[s.name])) paperIssues.push(s.name + ':missing')
  for (const c of CONTEXTS) if (c.key !== 'paper-writer') for (const s of V3_PAPER_SECTIONS) if (texts[c.key].includes(V3_SECTION_MARKERS[s.name])) paperIssues.push(c.key + ':' + s.name + ':leaked')
  ok(paperIssues.length === 0, '★ 论文三段只出现在 paper-writer 的装配里（其他 7 个上下文都没有）', paperIssues)

  // ---- 3e. 顺序固定：断言相对 index（不是"含有"） ----
  const idx = (text, name) => text.indexOf(V3_SECTION_MARKERS[name])
  const orderIssues = []
  const solverChain = ['v3-kb-object-models', 'v3-kb-tracks', 'v3-kb-output-quality', 'v3-kb-method-library', 'v3-write-workflow', 'v3-role-files-solver', 'v3-capabilities', 'v3-role-solver']
  for (let i = 1; i < solverChain.length; i++) {
    const a = idx(texts['solver'], solverChain[i - 1])
    const b = idx(texts['solver'], solverChain[i])
    if (a < 0 || b < 0 || a >= b) orderIssues.push(solverChain[i - 1] + ' !< ' + solverChain[i] + ' (' + a + ',' + b + ')')
  }
  const verifierChain = ['v3-kb-object-models', 'v3-kb-tracks', 'v3-kb-output-quality', 'v3-capabilities', 'v3-verifier-rules', 'v3-role-verifier-review']
  for (let i = 1; i < verifierChain.length; i++) {
    const a = idx(texts['verifier-review'], verifierChain[i - 1])
    const b = idx(texts['verifier-review'], verifierChain[i])
    if (a < 0 || b < 0 || a >= b) orderIssues.push(verifierChain[i - 1] + ' !< ' + verifierChain[i])
  }
  // planner 段（order 700，在 PACK.sections 里）必须早于简报字段说明（702）。
  {
    const a = texts['planner'].indexOf('v3 规划器')
    const b = idx(texts['planner'], 'v3-brief-planner')
    if (a < 0 || b < 0 || a >= b) orderIssues.push('planner-section !< v3-brief-planner (' + a + ',' + b + ')')
  }
  const paperChain = ['v3-paper-material', 'v3-paper-skeleton', 'v3-paper-latex', 'v3-role-paper-writer']
  for (let i = 1; i < paperChain.length; i++) {
    const a = idx(texts['paper-writer'], paperChain[i - 1])
    const b = idx(texts['paper-writer'], paperChain[i])
    if (a < 0 || b < 0 || a >= b) orderIssues.push(paperChain[i - 1] + ' !< ' + paperChain[i] + ' (' + a + ',' + b + ')')
  }
  ok(orderIssues.length === 0, '★ 顺序固定：知识 650→658 →（角色 710+）；planner(700)→brief(702)；论文 704→705→706→角色 716', orderIssues)

  // ---- 3f. 未声明 ⇒ 不出现（两条：无角色名；有角色名但没给 task） ----
  {
    const asmUnknown = await assemble({ role: 'researcher', phase: 'normal' })
    ok(asmUnknown.ok === true, '★ role=researcher：装配仍然成功（不是错误，而是"没有 v3 段"）', asmUnknown.ok)
    const t = asmUnknown.ok === true ? asmUnknown.text : ''
    let leaked = 0
    for (const s of V3_PROMPT_SECTIONS) if (t.includes(V3_SECTION_MARKERS[s.name])) leaked++
    ok(leaked === 0 && occurrences(t, V3_ROLE_PREFIX) === 0,
      '★★ 未声明的角色 ⇒ 21 个 v3 段一个都不出现（默认零注入；漏 scope 会让这里变红）', leaked)
    const asmNoTask = await assemble({ role: 'explorer', phase: 'normal' })
    const t2 = asmNoTask.ok === true ? asmNoTask.text : ''
    const explorerHit = t2.includes(V3_SECTION_MARKERS['v3-role-explorer'])
    const rederiveHit = t2.includes(V3_SECTION_MARKERS['v3-role-explorer-rederive'])
    ok(asmNoTask.ok === true && !explorerHit && !rederiveHit && occurrences(t2, V3_ROLE_PREFIX) === 0,
      '★★ role=explorer 但没传 task ⇒ explorer 与 rederive 两段都【不出现】（fail-safe，不是同时出现）',
      { explorer: explorerHit, rederive: rederiveHit, roles: occurrences(t2, V3_ROLE_PREFIX) })
  }

  // ---- 3h. 回执载体契约：方法/发明只走 progress 载荷（推荐同名字段形，兼容 tags 形） ----
  {
    const RESEARCH = ['explorer', 'rederive', 'solver', 'method-keeper']
    const SAME_NAMED = ['"methods_used":[', '"new_inventions":[', '"qid":"', '"dirId":"']
    const TAG_FORMS = ['mu:<方法卡id>｜<效果>｜<建议>', 'inv:<类型>｜<标题>｜<描述>', 'ctx:<qid>｜<dirId>', 'imp:<方法卡id>｜<原因>｜<改进内容>']
    const miss = []
    for (const k of RESEARCH) {
      const text = texts[k]
      if (!text.includes('唯一通道：`progress` 的载荷')) miss.push(k + ':no-channel-note')
      if (!text.includes('推荐形（同名字段形）')) miss.push(k + ':no-recommended-label')
      if (!text.includes('兼容形（tags 形）')) miss.push(k + ':no-compat-label')
      for (const n of SAME_NAMED) if (!text.includes(n)) miss.push(k + ':missing ' + n)
      for (const t of TAG_FORMS) if (!text.includes(t)) miss.push(k + ':missing-tag ' + t)
    }
    ok(miss.length === 0,
      '★★ 四个研究角色的装配里都写着回执载体契约：唯一通道 `progress` ＋ 推荐同名字段形（methods_used/new_inventions/qid/dirId）＋ 兼容 tags 形（mu/inv/ctx/imp 四形逐条）',
      miss)
    ok(texts['solver'].includes('"methods_used":[{"id":"m-abc12345"') &&
      texts['method-keeper'].includes('"new_inventions":[{"类型":"理论体系"'),
      '★★ 最小示例真的出现在对应角色的提示里（solver 的 methods_used 与 method-keeper 的 new_inventions），模型照抄即可',
      { solver: texts['solver'].includes('"methods_used":[{"id":"m-abc12345"'), keeper: texts['method-keeper'].includes('"new_inventions":[{"类型":"理论体系"') })
    // 反方向：不该报方法/发明的上下文，装配文本里不许出现这套契约（串味会让它们写出字段门会拒的回执）。
    const leaked = []
    for (const k of ['verifier-review', 'verifier-debate', 'paper-writer', 'planner']) {
      for (const n of SAME_NAMED) if (texts[k].includes(n)) leaked.push(k + ':' + n)
    }
    ok(leaked.length === 0, '★★ 验证／辩论／论文／规划四个上下文的装配里没有方法/发明契约（scope 漏写会让这里变红）', leaked)
  }

  // ---- 3g. 确定性：同一上下文装配两次，字节相同 ----
  {
    const a = await assemble({ role: 'solver', phase: 'normal' })
    const b = await assemble({ role: 'solver', phase: 'normal' })
    ok(a.ok === true && b.ok === true && a.text === b.text,
      '★ 同一输入 ⇒ 同一装配字节（装配是纯函数，快照/A-B 的前提）')
  }
}

console.log('=== 4. 与清单接线的状态：全有或全无（给 Lead 的接线检查） ===')
{
  const declared = Array.isArray(PACK.sections) ? PACK.sections : []
  const declaredNames = new Set(declared.map((s) => s.name))
  const present = V3_PROMPT_SECTIONS.filter((s) => declaredNames.has(s.name))
  ok(present.length === 0 || present.length === TOTAL_COUNT,
    '★ 清单要么一段都没声明我方段（P1-6 文件已交付、接线待做），要么 ' + TOTAL_COUNT + ' 段全部声明；【部分接线】不允许（缺一段 = 那个角色的提示词少一块，而且没人会发现）',
    { present: present.length, total: TOTAL_COUNT })
  ok(declaredNames.size === 0 || declaredNames.has('v3-planner'),
    '★ 清单非空时必须仍声明 planner 段（v3-planner 归 planner.js 管；本卡的装配测试也用它验证"规划器段→简报说明"的顺序）',
    declared)
  const plannerOwned = V3_PROMPT_SECTIONS.filter((s) => s.name === 'v3-planner')
  ok(plannerOwned.length === 0, '★ 我不声明 v3-planner（避免与 planner.js 在 pack 区间重名 —— 重名是装配期具名拒）', plannerOwned.map((s) => s.name))
}

console.log('=== 5. 自证可失败（--self-probe）：把"并列"和"无 scope"各制造一次，断言会被抓到 ===')
if (process.argv.includes('--self-probe')) {
  const declared = Array.isArray(PACK.sections) ? PACK.sections : []
  const declaredNames = new Set(declared.map((s) => s.name))
  const base = declared.concat(V3_PROMPT_SECTIONS.filter((s) => !declaredNames.has(s.name)))
  // 伪 1：把 solver 段再注册一次（不同的名字、同样的 scope）⇒ 本次装配出现 2 个角色抬头。
  const solverSection = V3_PROMPT_SECTIONS.find((s) => s.name === 'v3-role-solver')
  const shadow = Object.assign({}, solverSection, { name: 'v3-role-solver-shadow', text: '【v3 角色｜solver-shadow】影子段（故意多注册的一段，用来证明"恰一次"能红）' })
  const badKernel = createKernel({ settings: {}, sections: base.concat([shadow]) })
  const badAsm = await badKernel.prompt.assemble({ member: 'm-1', role: 'solver', phase: 'normal', round: 1 })
  const badHits = badAsm.ok === true ? occurrences(badAsm.text, V3_ROLE_PREFIX) : -1
  ok(badAsm.ok === true && badHits === 2,
    '★ SELF-PROBE：多注册一个 solver 段 ⇒ 角色抬头变成 2 次（证明"恰 1 次"不是永远成立的空断言）', badHits)
  // 伪 2：一个没有 scope 的段 ⇒ role=researcher 的装配里也出现，证明"未声明不出现"能红。
  const noScope = Object.assign({}, V3_KNOWLEDGE_SECTIONS[0], { name: 'v3-kb-leaky', scope: null })
  const leakKernel = createKernel({ settings: {}, sections: base.concat([noScope]) })
  const leakAsm = await leakKernel.prompt.assemble({ member: 'm-1', role: 'researcher', phase: 'normal', round: 1 })
  const leaked = leakAsm.ok === true ? Number(leakAsm.text.includes(V3_SECTION_MARKERS['v3-kb-object-models'])) : -1
  ok(leaked === 1,
    '★ SELF-PROBE：漏写 scope ⇒ role=researcher 的装配里也出现该段（证明"零注入"断言能红）', leaked)
} else {
  console.log('  note 不带 --self-probe 时不跑可失败性自证；`node tests/vmu-v3-prompts.test.mjs --self-probe` 会把两条伪缺陷各制造一次。')
}

console.log('')
console.log('=== V3 PROMPTS (P1-6): ' + passed + ' passed, ' + failed + ' failed ===')
if (failures.length > 0) for (const f of failures) console.error('  - ' + f)
process.exit(failed === 0 ? 0 : 1)

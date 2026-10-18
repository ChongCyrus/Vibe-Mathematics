/**
 * packs/v3/prompts/knowledge.js — PHASE 6 / P1-6：**v3 的知识上下文族（可复用段）**。
 *
 * ★ 这一段族对应 v3 的 `kc*` 系列（`vibe-math-v3/vibe-math-v3.js:1680-1768`），也就是
 *   "每个子代理提示词里那段定义契约"。v3 里它们由 `knowledgeContextText(role)` **按角色拼装**：
 *   verifier 只拿核心（可信分层／对象模型／目录／输出质量）；explorer/solver/method-keeper 再加方法库规则；
 *   solver 再加写工作流与求解器归属；method-keeper 再加写工作流与方法整理归属。
 *   对账文档 `docs/acceptance/phase6-v3-prompt-parity.md` §1.4 的 D1–D6 就是这张表。
 *
 * ★★ 为什么用 `scope` 而不是"一个段里写分支"：v3 的"按角色拼装"是一次**选择**（每个提示词只拿其中几段），
 *   不是"所有段都在、按角色读不同的段落"。vmu 的段默认**全装配**（`kernel/prompt/index.js:579-583`
 *   取注册表里每个段，`:413-421` 的 `scope` 才是"是否纳入本次装配"）。所以这里每一段都带
 *   `scope.role`（数组表示"这几个角色都要"），角色不在表里就**整段不出现**——这正是 v3 拼装图的等价物。
 *   对账文档 §4.5 的头号风险（互斥写成并列）就是在这一步落地的。
 *
 * ★ 段文本里**没有任何模板变量**：v3 的知识上下文本来也是静态的（`kc*` 函数不读 `params`，
 *   唯一的动态分支是"用户自定义知识上下文整体覆盖"，那属于 vmu 的 `overrides` 通道，不是段文本）。
 *   零变量 ⇒ 不会被缺值策略拖成空槽（`kernel/prompt/index.js:477-504`），也不会把未声明的设置键
 *   写进提示词（本仓的散文红线）。
 *
 * ★ 只写"vmu 里真实存在的落点"：轨名（problems/propos/methods/directions/journal/verified）与
 *   kind 均取自值层 `packs/v3/settings/defaults.json` 与 `packs/v3/middleware/dataplane.js` 的
 *   `KIND_TRACK`，锚点行格式取自 dataplane 的 `compose*` 函数；**不写 md 目录**（v3 的 Problems/ 等
 *   在本复刻里就是轨），也不写本机构没有的写锁工具（对账文档 §4.1 第 5 条）。
 */

/** 拿到"知识上下文"的四个角色（v3 的 D1 是 verifier 之外的研究角色也共用的核心）。 */
export const V3_KNOWLEDGE_ROLES = Object.freeze(['explorer', 'solver', 'verifier', 'method-keeper'])
/** 研究类角色：核心 ＋ 方法库规则（v3 的 D2）。 */
export const V3_RESEARCH_ROLES = Object.freeze(['explorer', 'solver', 'method-keeper'])
/** 真正写卡的两种角色：核心 ＋ 方法库 ＋ 写工作流 ＋ 归属（v3 的 D4/D5）。 */
export const V3_WRITER_ROLES = Object.freeze(['solver', 'method-keeper'])

/**
 * 对象模型（v3 `kcObjectModels`）。锚点与段名的唯一真源是 dataplane 的 compose 函数：
 * 问题卡 `composeProblem`、命题卡 `composeProposition`、方法卡 `composeMethod`。
 */
export const V3_KB_OBJECT_MODELS = Object.freeze({
  name: 'v3-kb-object-models',
  order: 650,
  range: 'pack',
  source: 'pack:v3',
  scope: Object.freeze({ role: V3_KNOWLEDGE_ROLES }),
  text: [
    '## v3 知识上下文｜对象模型（软规范）',
    '本机构的知识单位是**三张卡**，都落在 vmu 记录面的对应轨上（卡片由调度器/数据面从回执落盘，你不直接改卡片文件）。',
    '',
    '### 问题卡（轨 `problems`，kind `problem`）',
    '- 头部锚点（唯一强制部分）：`- 标题:`／`- ID:`／`- 类型: 问题`／`- 状态: 原始|求解中|等待依赖|已解决|死路`／`- 优先级:`／`- 依赖:`／`- 被依赖:`／`- 来源: 原始|后生`／`- 计划:`。',
    '- 正文段：`## 陈述`（完整问题陈述，每个记号/对象都要完整定义）、`## 来源与动机`（后生问题必写：在哪个流程产生、为了什么、如何回填主线）、`## 解法候选`（条目格式 `### 解法 N｜标题｜概率X｜状态Y`，后接完整叙述）。',
    '',
    '### 命题卡（轨 `propos`，kind `proposition`）',
    '- 锚点：`- 标题:`／`- ID:`／`- 类型: 命题`／`- 状态: 未定论|已验证·真|已验证·假`／`- 概率:`／`- 优先级:`／`- 依赖:`／`- 来源问题:`／`- 来源方向:`。',
    '- 正文段：`## 陈述`、`## 证明尝试`、`## 证伪尝试`；条目格式 `### 证明 N｜标题｜概率X｜状态Y`（证伪同理）。',
    '',
    '### 方法卡（轨 `methods`，kind `method`）',
    '- 锚点：`- 标题:`／`- ID:`／`- 类型: 方法`／`- 状态: 经验|应用验证|含已验证断言`／`- 可信断言:`／`- 上级体系:`／`- 子方法:`／`- 相关:`／`- 适用场景:`。',
    '- 正文段：`## 核心内容`、`## 定义与记号`、`## 应用记录`、`## 改进历史`。',
    '',
    '### 语义（v3 的三条铁律）',
    '- **概率语义**：1 = 绝对正确（可当已知事实）；0 = 绝对错误；0 与 1 之间 = 未定论/待验证。**只有调度器**能写 1/0 并把卡复制进 `verified` 轨；你自己给的新结论必须严格介于 0 与 1。',
    '- **价值/关键性 ∈ [0,1]**：这条命题对项目主线有多关键（成立/被证伪能改变多少后续方向）。显式写；不写按 0.5（不会被自动晋升）。',
    '- **证明尝试 ≠ 证伪尝试**：失败的"找反例未果"是支持性证据，不要写进 `## 证伪尝试`（那会变成待验证的反驳）。未完成的论证要显式标注缺口，不装完成。',
    '',
    '### 收口规则（v3）',
    '- 某条解法/证明/证伪的概率变成 1 ⇒ 问题已解决 / 命题已验证；这个锚点由调度器改写，不是由你声明。',
  ].join('\n'),
})

/** 目录地图 → vmu 的轨地图（v3 `kcFolders`）。 */
export const V3_KB_TRACKS = Object.freeze({
  name: 'v3-kb-tracks',
  order: 651,
  range: 'pack',
  source: 'pack:v3',
  scope: Object.freeze({ role: V3_KNOWLEDGE_ROLES }),
  text: [
    '## v3 知识上下文｜轨地图（v3 的目录 → vmu 的轨）',
    '本机构的知识不再是散落的 md 目录，而是记录面里**按轨**组织、按 kind 区分的卡片。全套轨（值层声明，写未声明的轨会被具名拒）：',
    '- `problems`＝问题清单（kind `problem`）；`propos`＝命题库（kind `proposition`）；`methods`＝理论发明库（kind `method`）；',
    '- `directions`＝方向纪要（kind `direction`）；`journal`＝研究日志（每轮叙述、教训、阻塞、子路线；非卡片，不做索引入口）；',
    '- `verified`＝**绝对可信**（只读；调度器生成的定论副本）；`plans`＝调度计划与逐条执行结果（kind `plan`）；',
    '- `inventions`＝待沉淀发明（kind `invention`）；`votes`＝验证票与理由（kind `vote`）。',
    '',
    '读知识先粗后细：先用头部列表/摘要定位对象，再展开正文；不要把整库一次性读进来。',
    '卡片正文里**你不认识的段会被逐字保留**（数据面只改自己托管的锚点与已知段）；所以正文可以像论文一样自由叙述。',
  ].join('\n'),
})

/** 输出质量规则（v3 `kcOutputQuality`）。 */
export const V3_KB_OUTPUT_QUALITY = Object.freeze({
  name: 'v3-kb-output-quality',
  order: 652,
  range: 'pack',
  source: 'pack:v3',
  scope: Object.freeze({ role: V3_KNOWLEDGE_ROLES }),
  text: [
    '## v3 知识上下文｜输出质量规则',
    '- **完整性、不断章取义**：任何问题/命题/结论都要给完整陈述，并补全所依赖的对象、环境、背景定义。',
    '- **引用必须给出处**：轨名/文件 + 卡片 id + 段名；**事实只引 `verified` 轨**（或状态为已验证·真/假的命题），其余一律标"经验参考"。',
    '- **临时假设**：若结论依赖临时假设 p，必须显式写「若 <p 的完整陈述> 成立，则：…」。',
    '- **机器回复只输出一个 ```json 围栏**，围栏外不要有散文；要落盘的内容放进回执的记录体，不要当作聊天气泡输出。',
  ].join('\n'),
})

/** 方法库规则（v3 `kcMethodLibrary`；只给研究类角色）。 */
export const V3_KB_METHOD_LIBRARY = Object.freeze({
  name: 'v3-kb-method-library',
  order: 653,
  range: 'pack',
  source: 'pack:v3',
  scope: Object.freeze({ role: V3_RESEARCH_ROLES }),
  text: [
    '## v3 知识上下文｜方法库规则',
    '- **开工前先查方法库**：本轮提示里若已给出「可用方法」列表（调度器注入的方法卡索引），有可复用的理论/框架/工具/方法就引用其 id；没有列表就按自己的判断推进，不要凭空编造 id。',
    '- **用后必须上报**：`methods` 只能填**已存在的方法卡 id**（形如 `m-…`），你自己刚想出的新方法不属于"用过的方法"。',
    '- **新发明必须上报**：类型取 理论体系|框架|工具|方法|思想|范式|技巧。与某张已有卡同类时在标题或内容里注明"可并入 <id>"，让方法整理代理合并而不是重复建卡。',
    '- **不要把方法名/标题文字当 id 填进"用过的方法"**：那会让应用记录记到不存在的卡上。',
    '',
    '### 方法/发明类数据怎么进回执（唯一通道：`progress` 的载荷）',
    '内核**对未知顶层字段具名拒**：`methods_used`／`new_inventions`／`qid`／`dirId` **不能**写成顶层字段。把它们放进本轮 `progress` 记录对象里。**两形二选一，不要同时写**（同一份数据两种写法会让消费方收到两遍）：',
    '',
    '**推荐形（同名字段形）——结构最清楚，优先用它**：',
    '```json',
    '{"progress":{"track":"journal","kind":"progress","title":"q-1/d1","body":"本轮叙述…","qid":"q-1","dirId":"d1","methods_used":[{"id":"m-abc12345","效果":"该方向借鉴了它的分解","建议":"可推广到含约束情形"}],"new_inventions":[{"类型":"方法","标题":"带权分解引理","内容描述":"可用于把奇点问题化归"}]}}',
    '```',
    '**兼容形（tags 形）——等价的字符串写法**（每条一个 tag，字段用**全角竖线** `｜` 分段）：',
    '- `mu:<方法卡id>｜<效果>｜<建议>`',
    '- `inv:<类型>｜<标题>｜<描述>`',
    '- `ctx:<qid>｜<dirId>`',
    '- `imp:<方法卡id>｜<原因>｜<改进内容>`',
    '形如：`"tags":["mu:m-abc12345｜该方向借鉴了它的分解｜可推广到含约束情形","inv:方法｜带权分解引理｜可用于把奇点问题化归","ctx:q-1｜d1"]`。',
  ].join('\n'),
})

/**
 * 写入工作流（v3 `kcWriteRules`，**已按 vmu 的通道改写**）。
 * v3 让成员自己用 `vibe_math_claim_write` 写 md；vmu 的写锁面不存在，卡片由回执落盘
 * （对账文档 §4.1 第 5 条：照抄 = 提示词让模型调不存在的工具）。
 */
export const V3_KB_WRITE_WORKFLOW = Object.freeze({
  name: 'v3-write-workflow',
  order: 654,
  range: 'pack',
  source: 'pack:v3',
  scope: Object.freeze({ role: V3_WRITER_ROLES }),
  text: [
    '## v3 知识上下文｜写入工作流（vmu 适配）',
    '- **卡片由数据面写，你只提供内容**：本轮内容放进**一条回执记录**，由调度器/数据面落盘；卡片锚点由其维护，你写正文段。不要假设自己能直接编辑卡片文件。',
    '- **回执通道**：只输出一个 ```json 围栏；顶层只能放内核认识的字段，本机构用 `progress` 写一条记录，字段 `track`／`kind`／`title`／`body`／`tags`。写错字段名或轨道会被**具名拒**，不会静默丢弃。',
    '- **一次回执只写一条记录**：把本轮**最值得沉淀的那一张卡**放进去；其余内容（其他引理、路线、教训）写进这条记录的正文，留给后续轮次。这是 vmu 回执通道的约束，不是可选项。',
    '- **内容要能被下游复核**：给完整证明/完整叙述，不要写"证明见上"；下游验证器只会看到卡片正文。',
    '- 归你管的轨：求解器写 `journal`（方向叙述）；方法整理代理写 `methods`（方法卡）。别的轨不要写。',
  ].join('\n'),
})

/** 求解器归属（v3 `kcSolverFiles` → vmu 的 journal 轨 + 一张命题卡）。 */
export const V3_KB_ROLE_FILES_SOLVER = Object.freeze({
  name: 'v3-role-files-solver',
  order: 655,
  range: 'pack',
  source: 'pack:v3',
  scope: Object.freeze({ role: 'solver' }),
  text: [
    '## v3 知识上下文｜求解器的归属',
    '- **方向叙述**落 `journal` 轨：一条 `progress` 记录，`title` 用 `<问题id>/<方向id>`，正文写本轮进展、试过的子路线、可行性信号、教训、阻塞。',
    '- **新引理**：本轮若产出值得沉淀的引理，把**一张**命题卡的内容写进同一条记录的正文（以 `# 命题｜标题` 起头，含 `- 概率:` 等锚点与 `## 证明尝试` 的完整证明），并在 tags 里给 `lemma:<引理id>|<概率>|<分类>`。一张卡一轮，多张留到后续轮次。',
    '- **完整解法**：把完整解法文本写进记录正文，并在 tags 里给 `solution:<概率>`；**不要自己把任何概率写成 1 或 0**——那是验证器与调度器的事。',
    '- 问题 id、方向 id 都是调度器给的，不要发明新 id。',
  ].join('\n'),
})

/** 方法整理代理归属（v3 `kcKeeperFiles` → methods 轨一张卡）。 */
export const V3_KB_ROLE_FILES_KEEPER = Object.freeze({
  name: 'v3-role-files-keeper',
  order: 656,
  range: 'pack',
  source: 'pack:v3',
  scope: Object.freeze({ role: 'method-keeper' }),
  text: [
    '## v3 知识上下文｜方法整理代理的归属',
    '- 你写 `methods` 轨：一条 `progress` 记录＝**一张**方法卡（`# 方法｜标题` ＋ 锚点 `- 标题:/- ID:/- 类型: 方法/- 状态: 经验/- 可信断言:/- 上级体系:/- 子方法:/- 适用场景:` ＋ `## 核心内容`／`## 定义与记号`／`## 应用记录`／`## 改进历史`）。',
    '- **一次回执只建/改一张卡**：待沉淀发明按价值排序，本轮只处理最关键的一张（其余留在 `inventions` 轨等下一轮；不要跳过更关键的去做容易的）。',
    '- `- 可信断言:` 只能填**已经在 `verified` 轨上**的对象 id；其余内容一律是经验（状态 `经验`），不得写成定理。',
  ].join('\n'),
})

/** 能力与权限（v3 `capabilitiesText` 的静态部分；动态开关不写进段）。 */
export const V3_KB_CAPABILITIES = Object.freeze({
  name: 'v3-capabilities',
  order: 657,
  range: 'pack',
  source: 'pack:v3',
  scope: Object.freeze({ role: V3_KNOWLEDGE_ROLES }),
  text: [
    '## v3 知识上下文｜能力与权限',
    '- **以你实际看到的工具列表为准**：网络检索、脚本/符号计算、每轮外部工具调用上限，都由本部署的配置决定并被执行层强制；不要假设某个工具一定在，也不要在工具不在时假装算过。',
    '- 用最少的调用拿最关键的证据；拿到证据后把**出处（路径/回执 id）**写进记录正文，别只写结论。',
    '- 你可以把 `verified` 轨上的任何卡当作已知可信依赖；其余轨的卡是经验参考，引用时必须说明"这是经验参考"。',
    '- 没有工具可用时：如实说明"本机没有可用的 X"，并给出可执行的下一步建议，不要沉默跳过。',
  ].join('\n'),
})

/**
 * 验证规则（v3 的 Result/Reason 契约，字段名保持 `Result`）。
 * ★ 这条是 v3 的行为关键：字段名写错 ⇒ 那一票被静默丢弃（对账文档 §4.3 第 3 条）。
 * 本机构把票写成 `votes` 轨的一条记录，**记录体里的字段名仍是 Result/Reason**。
 */
export const V3_KB_VERIFIER_RULES = Object.freeze({
  name: 'v3-verifier-rules',
  order: 658,
  range: 'pack',
  source: 'pack:v3',
  scope: Object.freeze({ role: 'verifier' }),
  text: [
    '## v3 知识上下文｜验证规则（Result/Reason）',
    '- 你只做一件事：判断 TARGET 是否正确并给出理由。**不改卡片、不写叙述、不提新方向。**',
    '- **Result ∈ [0,1]** = 你认为 TARGET 正确的概率：1 只在完全确定时给（裸命题 ⇒ Reason 必须是完整证明；证明/反驳/解法 ⇒ 你核过每一步且 Reason 确认整条链）；0 只在确定它错时给（Reason 必须给出严格反驳或精确指出致命缺陷）；其余情况给**严格介于 0 与 1 之间**的数。',
    '- **0.5 不是安全牌**：它的意思是"确实未决——存在真实的未解缺口"；给证据真正支持的数，不要默认折中。',
    '- **Reason 必填且非空**：点名你核过的步骤、或潜在反例/致命缺陷、或（0.5 时）卡住判断的确切缺口。空的 Reason 视为未贡献，会被忽略。',
    '- **引用纪律**：事实只能引 `verified` 轨（或状态为已验证·真/假的命题）；未验证/已被否证的对象不得当事实引用，需要它的子结论就自己重推。',
    '- **回执（vmu 适配）**：只输出一个 ```json 围栏，用 `progress` 写一条 `votes` 轨记录：`title` 写对象 id，`body` 写 `- Result: <0..1>` 与 `- Reason: <…>` 两行（字段名就是 `Result`／`Reason`），tags 里给 `vote:<对象id>|<Result>`。',
    '- **忠实性分支**：若该对象已有**通过的 Lean 形式化证明**，你的审查对象变成**忠实性**——逐条核对定义/对象/条件/假设/结论是否与命题原文完全一致。一致 ⇒ Result = 1。发现偏差**不要投 0**：给严格介于 0 与 1 的弃权值并在 Reason 写清偏差（偏差只说明形式化不合格，不代表命题为假）；只有你**独立于这份 Lean 代码**也能确定命题为假时才投 0。本机构没有强制门禁时，你必须给弃权值，才能让本轮无法得出一致结论。',
  ].join('\n'),
})

/** 知识上下文族：按 order 升序（装配顺序＝650→658，与 v3 的 C1→C5→C4→C6→C7/C8 同序）。 */
export const V3_KNOWLEDGE_SECTIONS = Object.freeze([
  V3_KB_OBJECT_MODELS,
  V3_KB_TRACKS,
  V3_KB_OUTPUT_QUALITY,
  V3_KB_METHOD_LIBRARY,
  V3_KB_WRITE_WORKFLOW,
  V3_KB_ROLE_FILES_SOLVER,
  V3_KB_ROLE_FILES_KEEPER,
  V3_KB_CAPABILITIES,
  V3_KB_VERIFIER_RULES,
])

export default V3_KNOWLEDGE_SECTIONS

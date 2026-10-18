/**
 * packs/v3/prompts/briefs.js — PHASE 6 / P1-6：**v3 的简报骨架与摘要骨架**。
 *
 * ★ 对应的 v3 构件：
 *   - 规划器简报 `buildBrief()`（`vibe-math-v3/vibe-math-v3.js:2288-2315`）——它喂给 `plannerPrompt`
 *     的 `CURRENT STATE BRIEF (JSON)`；
 *   - 方法整理摘要 `buildMethodDigest()`（`:2844-2860`）——它喂给 `methodKeeperPrompt` 的 `RECENT WORK DIGEST`。
 *
 * ★★ 这两块是 v3 里**动态生成**的数据（每个 tick / 每次派发都变），所以本文件**不复制任何一轮的数据**。
 *   段的职责只有两个：
 *     ① 告诉模型"这份 JSON/摘要是谁算的、每个字段什么意思"——这是**静态契约**，可以进段；
 *     ② 数据的**本体**由调度器经状态块（`statusBlock`）或 M2 的 `appendPrompt` 注入，段里只写
 *        "见本轮状态块"。把某一轮渲染出来的 JSON 粘进段里，就是把采集快照当运行时源
 *        （对账文档 §4.4/§4.5 的第二名错误）。
 *
 * ★ 段里没有模板变量：本文件的段不引用任何 `{{ … }}`。planner 段（`planner.js`）自己用
 *   `{{ statusBlock }}` 承载简报 JSON，而 `statusBlock` 是管线白名单变量；这里**不重复声明**它，
 *   避免同一份 JSON 在同一提示里被渲染两次。
 */

/**
 * 规划器简报的字段契约（v3 `buildBrief` 的键全集）。
 * 这是"读简报的说明书"：模型拿到 JSON 后要按这些键的语义做调度判断。
 */
export const V3_BRIEF_PLANNER = Object.freeze({
  name: 'v3-brief-planner',
  order: 702,
  range: 'pack',
  source: 'pack:v3',
  scope: Object.freeze({ role: 'planner' }),
  text: [
    '## v3 简报｜调度状态简报（字段说明书）',
    '你上面收到的 `CURRENT STATE BRIEF (JSON)` 由调度 tick **现算**，不是在段里写死的快照。按键的语义读它：',
    '- `at`／`horizon`：这份简报的时刻与本轮最多允许的动作数（`horizon` 就是硬上限）。',
    '- `free_slots`／`maxParallelThreshold`：当前还能再起几个子会话；**容量以 `free_slots` 为准**，超过容量的合法动作会被截断（截断会计数，不是静默丢弃）。',
    '- `problems[]`：每个未解决、未被标 `优先级: never` 的问题——`id`／`状态`／`优先级`／`依赖`／`依赖就绪`／`方向数`／`活跃方向`／`running_solver_dirs`／`最高存活率`／`解法数`。',
    '- `verify_candidates[]`（最多 10 条）：未被验证的对象——`rId`／`kind`／`target`／`prob`／`priority`。**不派 verifier 它们就永远不会被检查。**',
    '- `active_agents[]`：当前在飞的子会话——`childId`／`role`／`target`／`direction`／`round`。',
    '- `methods[]`（最多 20 条）：已有方法卡 `id`／`标题`／`状态`；`pending_inventions`：待沉淀发明的条数。',
    '- `last_plan`：上一次计划的 `summary` 与**逐条执行结果** `outcomes`（这是学习闭环的输入：上一次哪些动作成功/失败，本次据此调整）。第一次规划时为 `null`。',
    '- `recent_events[]`（最多 8 条）：最近的活动日志条目，用来判断"刚刚发生了什么"。',
    '',
    '★ 两条读法纪律：① **"活跃方向"不等于"正在被求解"**——只有出现在 `running_solver_dirs` 里的方向才有人在推；② 已经验证过的对象**绝不**重新排期。',
  ].join('\n'),
})

/**
 * 方法整理摘要的结构骨架（v3 `buildMethodDigest` 的三块：待沉淀发明 / 最近命题 / 最近方向教训）。
 * 摘要本体由调度器注入；段只说明"这三块各是什么、怎么用"。
 */
export const V3_BRIEF_METHOD_DIGEST = Object.freeze({
  name: 'v3-brief-method-digest',
  order: 703,
  range: 'pack',
  source: 'pack:v3',
  scope: Object.freeze({ role: 'method-keeper' }),
  text: [
    '## v3 简报｜待沉淀摘要（结构说明书）',
    '你上面收到的 `RECENT WORK DIGEST` 由调度器**现算**，只有三块（每块都是摘要，不是全文——需要全文就按 id 去库里取）：',
    '1. **待沉淀发明**（最多 16 条，只列标题/类型/来源 + 一句话）：这是本轮要处理的主对象。它们来自求解器/探索者回执里的新发明；一条也没被处理就会一直留在队列里。',
    '2. **最近命题**（最多 6 条）：最近入库的命题 `id`／标题／概率。用来判断某条发明是否已经能并入/更新一张命题卡。',
    '3. **最近方向教训**（摘要）：最近几个方向的 `lessons`。教训里反复出现的模式，往往就是值得沉淀成方法卡/体系的东西。',
    '',
    '★ 判断口径：**有复用价值的抽象才建卡**（理论体系/框架/工具/方法/思想/范式/技巧）；一次性的计算技巧不要单独立卡，并进适用的已有卡里。**不要把还没验证的断言写成可信断言。**',
  ].join('\n'),
})

export const V3_BRIEF_SECTIONS = Object.freeze([V3_BRIEF_PLANNER, V3_BRIEF_METHOD_DIGEST])

export default V3_BRIEF_SECTIONS

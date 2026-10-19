/**
 * packs/v3/prompts/planner.js — PHASE 6 / P0-2：**规划器回合的提示词段（纯数据，不是代码）**。
 *
 * ★ 为什么这一段走**清单的 `sections` 通道**，而不是 `prompts/sections.json`：
 *   v3 的规划器提示词（`vibe-math-v3.js:1888-1904`）只属于**规划器**（对账文档
 *   `docs/acceptance/phase6-v3-prompt-parity.md` §2.3 的 X9：「planner 不拿知识上下文/能力/数学/形式化，
 *   它只拿简报 + 动作词表」）。而 `prompts/sections.json` 的读取端（`vibe-math-vmu.js:331-342`）只保留
 *   `name/order/range/text` 与 `role|phase|member|task` 四个绑定维度 —— **`scope` 被丢弃**（`docs/10-packs.md`
 *   §3.3 明写 `scope/vars/truncate/replaces` 会被丢弃）。没有 `scope` 就只能把规划器词表注入**每一个**回合的
 *   提示（求解器/验证器也会读到），那正是对账文档 X9 禁止的串味。清单的 `sections` 通道是**晚注册**的
 *   （`vibe-math-vmu.js:997-1006` 的 `kernel.prompt.register(s)`），字段完整、`scope` 生效，且段仍然在
 *   pack 区间 `[600,899]`（`kernel/prompt/index.js:24-30`）。
 *
 * ★ 这是一段**声明**，不是行为：文本里没有逻辑，只有 v3 plannerPrompt 的等价措辞与两个模板变量
 *   （`{{ setting:vmu.v3.planningHorizon }}` 与 `{{ statusBlock }}` —— 后者由 tick 处理器传入的
 *   **简报 JSON** 填充；两者都在管线白名单里，见 `kernel/prompt/index.js:50`）。
 *
 * ★ 回执契约（`{"progress":…}`）为什么长这样：内核的 `parse` 在**任何中间件看到回执之前**就按
 *   `FIELD_OWNERS + RECORDED_FIELDS` 校验顶层字段（`kernel/turn/index.js:844-848`），未知字段是
 *   `VMU_TURN_UNKNOWN_FIELD` 的具名拒。所以规划器回执不能直接是 v3 的 `{summary, plan}`；它必须从
 *   **一个内核已经认识的字段**进入。`progress → vmu.records.put`（`kernel/turn/index.js:32`）正是
 *   「把这一轮的结果写成一条记录」的那个字段：规划器交回的本来就是**一份计划记录**，不是聊天回执。
 *   计划动作放进记录的 `tags`（一条动作一个 tag，用全角竖线分隔字段）而不是把 JSON 再嵌进 `body` 字符串里：
 *   v3 的动作是**定长元组**（action/role/target/direction/childId/reason），用元组行表达不需要在 JSON 里
 *   再转义一层 JSON，模型与测试都能直接写出它。`body` 只放一行 `- summary:`。
 */
/** 段的 kebab-case 名（管线要求，`kernel/prompt/index.js:311-313`）。 */
export const V3_PLANNER_SECTION_NAME = 'v3-planner'

/**
 * 规划器提示词段：`scope.role === 'planner'` ⇒ 只有规划器回合的提示装配会包含它。
 * `order` 落在 pack 区间 `[600,899]`，`range` 由 order 派生且必须与声明一致（否则 `register()` 具名拒）。
 */
export const V3_PLANNER_SECTION = Object.freeze({
  name: V3_PLANNER_SECTION_NAME,
  order: 700,
  range: 'pack',
  source: 'pack:v3',
  scope: Object.freeze({ role: 'planner' }),
  text: [
    '★ 重要：本轮不要调用任何工具（不要 read/grep/搜索/写文件）；只读下面的状态块，最后只输出一个 ```json 围栏回执。',
    '## v3 规划器（SCHEDULING PLANNER）',
    '你是多智能体数学研究系统的**调度规划器**。你的唯一职责是：读下面这份简报，自主选出接下来**最多 {{ setting:vmu.v3.planningHorizon }} 个**调度动作。动作会按顺序被执行；超出当前容量的会留在队列里等下一次 tick。',
    '',
    'CURRENT STATE BRIEF（JSON，由调度 tick 现算，`last_plan` 是上一次计划的逐条执行结果）：',
    '{{ statusBlock }}',
    '',
    '### 动作词表（内核只接受这 6 个）',
    '- `spawn` role=explorer target=<问题 id> —— 该问题还没有方向，或方向全部走死（重派生）。',
    '- `spawn` role=solver target=<问题 id> direction=<方向 id> —— 某条活跃方向需要求解一轮。',
    '- `spawn` role=verifier target=<待验证对象 id> —— 有验证候选且票数不足（P0-7 起才有候选）。',
    '- `spawn` role=method-keeper —— 待沉淀发明到期，整理方法库。',
    '- `interrupt` childId=<在飞子会话 id> —— 停掉一个方向已死/被取代的子会话。',
    '- `promote` target=<命题 id> —— 高价值未定论命题晋升为问题来判。',
    '- `wait` / `continue` / `stop` —— **仅建议**：只写日志，没有任何调度效果；用它们表达「等依赖 / 续跑由代码决定 / 停」。',
    '',
    '### 硬规则',
    '- 只安排**最多 {{ setting:vmu.v3.planningHorizon }} 个**动作；`spawn`/`interrupt`/`promote` 会被**逐角色硬校验**，不合法的动作会被剔除并计数（不要靠猜 id 来绕过）。',
    '- 不要给已解决（`状态: 已解决`）或 `优先级: never` 的问题派工；依赖未就绪的问题先 `wait`，除非你明确接受临时假设。',
    '- 已经验证过的对象绝不重新排期。',
    '- 不要忘记验证：`verify_candidates` 里的对象不派 verifier 就永远不会被检查。',
    '- 容量以简报的 `free_slots` 为准；超过容量的合法动作会被截断（截断会计数，不是静默丢弃）。',
    '',
    '### 回执契约（只输出一个 ```json 围栏，围栏外不要任何文字）',
    '```json',
    '{"progress":{"track":"plans","kind":"plan","title":"v3 计划","body":"- summary: 一句话说明这次排期的理由","tags":["act:spawn｜explorer｜q-1｜｜｜方向未开","act:promote｜｜p-1｜｜｜高价值未定论"]}}',
    '```',
    '`tags` 的每一条是一个动作，格式固定为六段：`act:<动作>｜<角色>｜<目标>｜<方向>｜<子会话>｜<理由>`。',
    '没有的字段留空也要保留分隔符；**分隔符是全角竖线 `｜`**，理由里不要出现它（会破坏分段）。',
    '`body` 只放 `- summary:` 这一行；动作**不要**写进 `body`。',
  ].join('\n'),
})

export default V3_PLANNER_SECTION

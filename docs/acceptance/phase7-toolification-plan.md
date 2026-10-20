# PHASE 7 / 工具化改造规划（字段 → 工具）

本卷只做**设计与清单**，不改代码。依据：内核 `turn/reply-parsed` 的 4 个顶层字段、`tools/*.js` 的现有面、`packs/v3` 与 `packs/v5r` 的提示词回执契约。

## 1. 四个字段的现状

| JSON 字段 | 对应工具（已有的） | 若改走工具调用需要什么 | 代执行：保留还是删 |
|---|---|---|---|
| `say` | `vibe_vmu_meeting` 的 `speak`（会议开着时）；`vibe_vmu_chat` | 参数 `member`/`text`（+ meeting id）；返回值已存在；幂等按 `idempotency` | **保留**（兼容只输出回执的旧提示词） |
| `progress` | `vibe_vmu_records` 的 `append`（仅 proposition/method/subproblem）；通用 track 需扩展 | 参数 track/kind/title/body；返回 recordId/指纹；幂等按 content 指纹 | **保留**，把 records 的通用 track 补齐 |
| `solved` | 无单一工具（由 verification/closure 相关面间接产生） | 需要显式结算 op（target/round），返回结算回执；幂等按对象/轮次 | **保留**，另补显式 op |
| `vote_solved` | **无工具** | 若要工具：参数 target/round/value，返回票箱状态；幂等需按 member+round | **保留 JSON 字段**（见 §3） |

## 2. 关键问题一：代执行路径保留还是删

**建议保留。** 理由不是“历史包袱”，而是**消费者明确存在**：

1. `kernel/turn/index.js` 的 `turn/reply-parsed` 是字段归一化点；4 个字段在**当前**被 K10 通道消费（v3/v5r 的 planner/verifier/paper 都依赖）。
2. 两个 pack 的角色提示词仍教“只输出一个 json 围栏回执”；改工具化而不改提示词会让**所有现有成员回合**失去输出载体。
3. 现有测试大量以回执形状断言（`vmu-turn`、`vmu-v3-*`、`vmu-pack`）；删掉会同时破坏功能与门禁。

**两条路不冗余**，因为它们服务不同场景：
- **回执字段**：成员只输出一个围栏、由内核代执行 —— 适合**一次 Delivery 只拿一个回复**的 one-shot 子代理路径，也是当前 SLV 的路径。
- **显式工具**：成员在回合内主动调用（`speak`/`records append`/`meeting vote`） —— 适合**长会话、可多步操作**的 agentPreset 路径，审计上能记录“谁在第几步调了什么”。

**谁在什么情况用哪条**：
- 默认（one-shot Deliver + 只输出回执）⇒ 回执字段 + 代执行。
- 显式声明“允许成员调用工具”的部署（如 v5r 的工具面）⇒ 显式工具；回执字段保留为**兼容适配器**（同一 service，不另写逻辑）。

**删除条件**（未来）：只有当 4 个字段的消费者清零 —— 即两个 pack 的提示词不再教回执、`turn/reply-parsed` 不再消费字段、且所有测试改为工具路径 —— 才可删；当前**不满足**，故不删。

## 3. 关键问题二：`vote_solved` 要不要造工具

**建议不造 mutating 工具，保留为回执字段**；最多增加一个**只读** `vibe_vmu_status` 投影（closure 票已读得到）。理由：

1. **纯决定、无副作用**：`vote_solved` 不写记录、不改会议状态；它只表达“这一票的判断”。工具化的收益（可发现性）小，而代价是新增一个**需要身份/授权/幂等**的写面。
2. **票必须归属于“一个成员回合”**：闭题的语义是“全体有表决权者的判断”；回执字段天然绑定 `turn.member`，工具调用则要再传 member 并验证它确实是那一次回合的投票者——两个载体表达同一事实。
3. **已有审计**：`closureVoteRecorded` 已按 member 记录并可从 `vibe_vmu_status` 读到；再造成工具不会增加信息，只会增加第二个写者（红线：同一事实一个写者）。
4. 若未来需要“会中显式投票”的工具，应做**会议票箱**的 `vote`（已有 `vibe_vmu_meeting` 的 vote/boxcast），而不是把闭题判断塞进一个无副作用的工具。

## 4. 分阶段实施顺序

**阶段 A（已在本轮完成）**：会议工具面补 `second`/`withdraw`/`secretary`/`rules` 入口（内核能力已经存在）。
验证：`vmu-ten-faces-usable` 的“经工具面 second ⇒ seconded / 自附议 ⇒ VMU_NOT_PERMITTED”；`audit-face-actions`、`audit-tool-table`。

**阶段 B（v5r 工具移植，先不删任何回执字段）**：
1. 先移植 `record_progress/proposition/method/subproblem` 到 `vibe_vmu_records` 的通用 track（保留旧 JSON `progress` 同时可用）。
2. 再移植 `say/message` 到 `vibe_vmu_meeting`/`vibe_vmu_chat`；角色提示词开始**同时**给“工具路径 + 回执样例”。
验证：每移植一个，跑该工具面测试 + v5r 相关套件；**成员仍能只输出回执**。

**阶段 C（提示词切换）**：v5r 的成员段改成“优先调用工具；无法调用时回执”；保留回执字段（灰期）。
验证：v5r 的 `tool_help`/状态块能看到工具；真机跑一次成员调用工具的回合。

**阶段 D（删除判断，而非删除动作）**：统计 4 字段的消费者（提示词、K10 消费、测试）；只有清单为空才删代执行，并在 docs/03 写“删了什么、为什么没有消费者了”。

## 5. 未覆盖/风险

- 本轮没有改任何提示词/回执消费逻辑；本卷是**规划**，不是实现。
- `progress` 的通用 track 需要 records 面扩展（当前 append 只收三种 kind），这是阶段 B 的第一件事。
- `vote_solved` 若最终要做工具，必须先回答“同一成员的重复投票如何幂等”，本卷建议不做。

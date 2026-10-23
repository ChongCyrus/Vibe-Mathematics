# D7 设计：成员可用命令／工具差异（只读设计，未改任何源码）

判据（逐字）：「成员可用命令/工具有差异——普通成员无法呼叫特殊活动，院士/拥有权限成员可以；可用命令在不同类型会议下也有差异。」

结论先行：**句 1 的结构已经落地**（声明在 pack、能力在内核、执行在宿主，且 5 条门禁在跑），缺的是**调用时兜底**与**可发现性**；**句 2（会议类型差异）没有承载，且今天不该做**（会议类型本身还是死字段，先做工具面等于再造一个假声明）。

---

## 1. 现状复核（file:line）

### 1.1 承载链已存在（不是缺口）

- **声明在 pack**：`vibe-math-vmu/packs/v5r/prompts/v5r-core.js:202` `get toolFaces() { return V5R_TOOL_FACES }`；`:756-789` 派生：`roleToolNames()` 只收**行首 `·` 项目符号**里的 `vibe_v5_*` 名（round 31 修过「正文提及也算」的漂移），`V5R_ROLE_TOOL_DENY` = 已声明工具全集 − 角色集，`V5R_TOOL_FACES` = `{chair|member|temp:{deny}}`（round 24 裁定：**只 deny 不 allow**，allow 会推翻框架面自己的发布）。
- **装载期校验**：`vibe-math-vmu/kernel/pack.js:141-156`（role 必须是 manifest 声明过的 slot id；只许 `allow|deny`；非空数组；名字形状 `^[a-z][a-z0-9_]{2,63}$`；同一名字在 allow 与 deny ⇒ problem）；`:755-756` 装载时 `declarePackToolFaces(manifest.toolFaces,{by})`。
- **能力在内核**：`vibe-math-vmu/kernel/index.js:1872` `packToolFaces`；`:2330-2332` 声明（形状不对 ⇒ `VMU_INVALID_ARGUMENT`）；`:2372-2391` `resolveMemberToolDeny(member)`——**读 LIVE 名册**取 `row.slot`，未知成员 ⇒ `VMU_NO_SUCH_OBJECT`（不静默跳过，后落座者也覆盖）；`:2394-2415` `applyPackToolFaces`（逐 live 成员）；`:2417-2422` `retractPackToolFaces`（卸载撤销）；`:2579-2618` `applyMemberToolFace`（未知面名 ⇒ 具名拒并列出已知面；allow∩deny ⇒ 拒；无宿主 applier ⇒ `VMU_ENGINE_UNAVAILABLE`；非 live ⇒ `VMU_NO_SUCH_OBJECT`）。
- **执行在宿主（真实执行点）**：`vibe-math-vmu/host.js:1497` 起的 `system-prompt/assemble` 瀑布——`:1553-1561` 按 `resolveMemberToolDeny` 结果过滤 `out.tools`（**这就是真正到达请求的那一份**）；`:1575-1585` 把同一份名单写成【本轮你实际能调用的工具｜slot】段（wire 与提示词**同一计算**）；`:1565-1570` 记 `narrowFaceByAgent`；`:1634-1637` 再 `ctx.tools.restrict()` 对齐后续步骤（注释明写「best effort」）；`:1479` 注册 applier、`:1447-1470` 真机改 Agent face。
- **门禁（机器可失败）**：`tests/vmu-v5r-tools.test.mjs:1222-1290` ⑦c——A（角色读到的项目符号集 == `declared − deny`，两侧差集都空）、B（每个项目符号都是已声明工具）、C（正文提到的名字都在项目符号里）、deny 只含 `vibe_v5_*`、尺寸 chair 1／member 18／temp 32（共 40 个声明）、无 pack ⇒ `packToolFaces()` 为空。

⇒ **「普通成员呼叫不到特殊活动」今天是机制**：member 的 face 里根本没有 convene/assign/hire 这些工具，且提示词段自报同一份名单。

### 1.2 真缺口

**(a) 没有「调用时按席位拒」的通用闸。** deny 只改 wire；兜底靠各 handler 自己写的 seat 检查（`packs/v5r/tools.js:189` overview、`:475` academician 动作、`:485` 无表决权）。若 DSH 调度允许按名调用 wire 之外的工具，差异就退化成「看不见但能调」。**未判定**：DSH 是否校验调用名 ∈ `out.tools`（缺 DSH 侧证据，asar 不可直接读）⇒ 这正是 (a) 要补闸的理由，而不是断言它已被绕过。

**(b) 句 2 无承载。** 唯一「活动级收窄」能力是 `vmu.turn.step` 的 `tools` 参数（`vibe-math-vmu/tools/turn.js:180-186`：`none` 清空／`{"allow":[...]}` 只挂这些，未知名具名拒；消费者 `host.js:1543-1550` 的 `turnOverride`，优先于 PTC）。但**全仓没有任何生产者传这个参数**（grep `tools:'none'` 只命中注释与测试），会议类型不携带工具面。且有实测缺陷：run 19850 用 `tools:'none'` ⇒ 模型把 DSML 工具调用写进正文 ⇒ `VMU_TURN_NO_FENCE`，票没落（`tests/vmu-v5r-tools.test.mjs:1330-1349`，已用 `v5r-fixture-constraint` 段声明「没有任何工具可用／不要写任何工具调用语法」修复）。

**(c) 可发现性有两处硬的错。** ① `vibe_vmu_tools`（`vibe-math-vmu/tools/member-tools.js:9-33`，host 已发布：`host.js:136/199/998`）是「我此刻真能调什么」的框架面——名来自 live provider、无 live Agent ⇒ 具名拒；但 pack 提示词到处教成员调 **`vibe_v5_tool_help`**（`packs/v5r/prompts/v5r-prompts.js:51-63`、`v5r-core.js:587/634/672`、`v5r-paper-prompts.js:50/80`），而**该工具不存在**（`grep` 只命中 `tools/member-tools.js:5` 的「将来作薄转发器（B-1）」注释）——幻影工具。② `vibe_vmu_tools` 只回名字+用途，**不回答「为什么我没有 X」**（内核 `resolveMemberToolDeny` 手里有 `deny/source`，`toolsView` 不透出）。

### 1.3 不该做的（假机制，先排除）

- **不要在 handler 里给每个特殊活动加 `if (slot==='chair')` 当主机制**：那是 policy 进代码（红线①）；席位检查只能是最后一道可归属兜底。
- **不要按会议类型预生成几套静态工具清单**：必然与 wire 漂移（round 31 实测过 member 提示词 20 名 vs 请求表 22 名）。
- **不要改成 allow 白名单**：会推翻框架面自身的发布（round 24 已裁定 deny）。
- **不要为「会议类型」新建机制**：会议类型本身是死字段（D3/D8/D11 已登记缺口），没有消费者。

---

## 2. 设计

### 2.1 承载表

| 差异 | 承载层 | 消费者 | 今天状态 |
| --- | --- | --- | --- |
| 角色（chair/member/temp） | pack `toolFaces` → 内核 `resolveMemberToolDeny` → 宿主 `assemble` | host 每次 assemble | ✅ 已落地＋5 条门禁 |
| 活动／会议类型 | pack 声明 + `turn.step` 的 `tools` 覆盖 | **无** | ❌ 无生产者，**本项不做**（§2.3） |
| 调用时兜底 | 内核纯读解析 + host 一条 `tools/pre-execute` 规则 | host rules | ❌ 缺（§2.2） |
| 可发现性 | `vibe_vmu_tools` 的 `toolsView` 投影 | pack 提示词／成员回合 | ⚠️ 面在，但提示词指向幻影工具（§2.4） |

### 2.2 闸：`VMU_TOOL_NOT_IN_FACE`（唯一新增机制，消费者＝host 的 rules 装配）

内核新增**只读**解析（不新建表，复用同一计算）：

```
kernel.memberFaceGate({ member, tool }) ->
  { ok: true }
| { ok: false, code: 'VMU_TOOL_NOT_IN_FACE', message, hint,
    enforced: ['<用于判定的 pack toolFaces 来源>'], enforcedScope: 'evaluated-so-far' }
```

- 判定输入＝`resolveMemberToolDeny(member)`（`kernel/index.js:2372-2391`）＋`memberToolOverride(member)`，与 host.js:1553 的 wire 过滤**同源**（单一计算两个消费者，禁止第二张名单）。
- 名册里没有该成员／无 live Agent ⇒ `VMU_TOOL_FACE_UNRESOLVED`（具名，**不放行**）；这与 (a) 的 fail-closed 立场一致，也与 `host.js:1529-1539` 的 sticky 窄面（身份丢失时沿用上一次窄面，永不放宽）互补。
- 安装点：host 已有的 `tools/pre-execute` 规则装配（v5r 已有一条 `v5r-core-no-adhoc-scripts` 在 `packs/v5r/prompts/v5r-core.js:229` 起，可作形状参照）。**内核只提供判据，装不装、装哪条由宿主/pack 声明**（红线①）。
- 反例（必须具名的非法路径）：`member='ghost'` ⇒ `VMU_TOOL_FACE_UNRESOLVED`；`tool` 非字符串 ⇒ `VMU_INVALID_ARGUMENT`；解析过程抛错 ⇒ 原码透传，不吞。

### 2.3 会议类型差异：本项不做，给出将来落点与前置

今天能算「该类型的可用命令」的只有 `vibe_vmu_meeting` 的 action 表（`vibe-math-vmu/tools/meeting.js` 各 action 的 seat 检查，如 `:222` invite 仅 chair），它把差异声明在**工具 schema**里而不是 pack 里——形态不同但**不是缺口**，因为消费者真实存在（每次 meeting 调用）。

若将来要做：承载＝pack 声明 `vmu.meetings.<type>.tools`（settings 键，读者＝一个 pack middleware），执行＝`turn.step({tools:{allow:[...]}})`（能力已在，`tools/turn.js:180-186`）；**前置条件**＝会议类型必须先有真实语义（D3/D8/D11 的会议类型目前无人读）。顺序倒置会造出第二个假声明。

### 2.4 可发现性（c）

1. **修幻影工具**（二选一，先做便宜的）：把提示词里的 `vibe_v5_tool_help` 改成 `vibe_vmu_tools`；或按 `tools/member-tools.js:5` 的计划把它做成薄转发器（转发到同一 `toolsView`，不写第二实现）。
2. **增「为什么没有」**：`toolsView` 返回值加
   `hidden: [{ name, reason: 'seat'|'turn', source: 'pack-face'|'turn-override' }]`
   ——数据源就是 `resolveMemberToolDeny` 的 `deny/source` 与 `memberToolOverride`，**纯读投影，零新机制**。
3. 负面路径一律具名：非 live 成员 ⇒ `VMU_NO_SUCH_OBJECT`；无 provider ⇒ `VMU_ENGINE_UNAVAILABLE`（两者今天已具名，补测试即可）。

---

## 3. 正／反断言计划（每条差异一个能变红的断言）

1. **角色面**（已有，勿动）：`declared − deny` == 角色项目符号集（`tests/vmu-v5r-tools.test.mjs:1222-1290` ⑦c A/B/C）。
2. **兜底闸正**：chair 调 `vibe_v5_overview` ⇒ ok；**反**：member（face 里无该名）⇒ `VMU_TOOL_NOT_IN_FACE` 且 `enforced[]` 非空。
3. **兜底闸 fail-closed 反**：名册删掉该成员后再调 ⇒ `VMU_TOOL_FACE_UNRESOLVED`（不得放行）。
4. **sticky 反**：第一请求窄面后身份丢失 ⇒ 第二请求仍窄（`tests/vmu-host.test.mjs:841-903` 已有 G6 用例，兜底闸不能破坏它）。
5. **deny 名字不存在**：pull 路径只 `filter`（`kernel/index.js:2381-2386`）⇒ 写错名字静默无效 ⇒ 应记一条具名 problem（见 §4 G1），断言「声明一个不存在的名字 ⇒ 有具名告警，而不是无声无息」。
6. **可发现性正/反**：`vibe_vmu_tools` 返回的 `count` == wire 名数；`hidden` 里成员的 convene 项 `reason:'seat'`；**反**：提示词里不得再出现未声明的 `vibe_v5_*`（可加一条扫描：pack 提示词提到的工具名 ∈ 已声明集合，复用 ⑦c B 的判据）。
7. **会议类型**：不做，因此**不加断言**（避免冻结一个不存在的语义）；在 docs/acceptance 里保留具名缺口。

---

## 4. 具名缺口（本轮只登记）

- **G1** pull 路径不校验 deny 里的名字是否存在（`kernel/index.js:2381-2386` 只 `filter`）；push 路径倒是 fail-closed（`applyMemberToolFace` 走 catalogue ⇒ `VMU_INVALID_ARGUMENT`）。修法：`resolveMemberToolDeny` 首次遇到不在 host catalogue 的名字时记一次具名 problem（不抛，避免一个笔误让整个回合起不来）。
- **G2** DSH 是否放行 wire 外调用：**未判定**（缺 DSH 侧证据）——这正是 §2.2 兜底闸的动机。
- **G3** 会议类型语义为死字段（D3/D8/D11）⇒ 句 2 不做。

---

## 5. 实施顺序（本仓 F5：先承载 → 再闸 → 最后改文字）

1. **承载**（已就绪，不动）：`toolFaces` 声明 + ⑤ 条门禁。
2. **闸**：① 内核 `memberFaceGate` + 新码 `VMU_TOOL_NOT_IN_FACE`／`VMU_TOOL_FACE_UNRESOLVED`（两表登记）② host 装一条 `tools/pre-execute` 规则 ③ `toolsView.hidden`（纯读）④ G1 的具名 problem。
3. **提示词文字**（最后）：改掉 `vibe_v5_tool_help` 幻影、把「为什么没有」写成一段；因为在 ①② 之前改文字就是承诺不存在的机制。
4. **会议类型**：等 D3/D8/D11 的真实语义落地后再排，不进本轮。

## 6. 「今天谁调用」一句话

- 角色差异：`host.js` 每次 assemble 调（**活的**，有门禁）。
- 调用时兜底：**0 调用**（待建，入口＝host 的 rules 装配）。
- 会议类型差异：**0 调用**（不做）。
- 可发现性：语义在 `toolsView`（已发布为 `vibe_vmu_tools`），但提示词指错工具 ⇒ 需第 3 步才自洽。

---

## 7. 第 2 步「闸」已落地（实测记录）

**它落在哪**：`vibe-math-vmu/host-pack-tools.js` —— 所有 pack 工具的唯一漏斗。

- `resolveTurnMember(kernel, exec)`（`:87`）：判据与装配器同源（`host.js:1484-1495`，**复制而非 import**，`host.js` 是闭包）：非 root agent id 先问 `kernel.currentTurnMember()`，再按 `kernel.memberSession(row.id) === exec.agent.id` / 精确 id 比对名册。返回 `null` 是**真答案**（root/非成员），不是"不知道"。
- `packToolFaceGate({ kernel, exec, toolName })`（`:143`）：无内核 ⇒ `{ok:true, skipped:'no-kernel'}`（制造厂在单测里独立可用，零机制）；无成员 ⇒ `{ok:true, skipped:'root-or-non-member'}`；成员但解析不出面 ⇒ **fail-closed** `VMU_TOOL_FACE_UNRESOLVED`；面外 ⇒ `VMU_TOOL_NOT_IN_FACE`，`hint` 列出该成员**实际可见**的 pack 工具名。
- 装配点：`makePackToolSpec().run` 在**调用 handler 之前** `:211` 调它，拒时 `throw {code,message,hint,face}` —— 由 `host.js#toHostSpec` 统一转成具名拒回执（与其它面同形）。
- `host.js:1051` 已经把 `kernel` 传进 `appendPackToolSpecs` ⇒ 这条闸在真机路径上是**活的**，不是又一层死声明。
- 决策仍只有一份：闸调 `kernel.memberFaceGate`（＝ `kernel/memberface.js#faceGate` 套在 `resolveMemberToolDeny` 上），与 `toolsView().hidden[]`、wire 过滤同源；`host-pack-tools.js` 因此**不 import 内核**，保持"无依赖"性质。

**成对断言（`tests/vmu-member-face.test.mjs` ⑥，46/0）**：成员调面内工具⇒成功且计数+1；调面外⇒`VMU_TOOL_NOT_IN_FACE` 且**计数不变**（拒了但副作用已发生这种假拒抓得到）；root 会话⇒放行；无 face resolver / 名册里查不到⇒`VMU_TOOL_FACE_UNRESOLVED` 且计数不变；无内核⇒放行 + `skipped`。hint 与 message 都断言了内容（点名成员、点名工具、列出可见工具）。

**仍然没有的东西（如实登记）**：
- G1（deny 里的错名不具名）**未修**——本轮不动，因为修它要改 `resolveMemberToolDeny` 的 problem 记录，属于内核面。
- 会议类型差异（D7 句 2）**不做**。
- 提示词文字（第 3 步）**未动**：`vibe_v5_tool_help` 提示词与"为什么没有这个工具"的说明仍待第 3 步。
- 本闸是**兜底**，不是 wire 的替代：wire 仍然先窄（`host.js:1552-1560`），这里只是把"藏起来"变成"可具名拒"。

# lane-verified-runtime — B6 / B8 / B2：让"可信"这条链在真机上真的有人走

本车道属于 R18（设计依据 `lane-verified-design.md`，**设计是别人的，运行时消费者是我的**）。判定纪律沿用台账：
**提示词里写了 ≠ 机制存在**；**工具声明了参数 ≠ 参数被消费**；**代码里有分支 ≠ 真机会走到那个分支**。

写域：`vibe-math-vmu/packs/v5r/**`（不含 `prompts/**`）、本车道的测试与本文档。未改 `kernel/**`、`tools/**`、`kit/**`、
`settings/schema.js`、`packs/v5r/prompts/**`、`vibe-math-vmu/docs/03`、`docs/08`。

## 0. 读数（逐字，全部实跑）

| 命令 | 读数 |
| --- | --- |
| `node tests/vmu-debate-subject-proof.test.mjs` | `=== VMU DEBATE SUBJECT PROOF: 39 passed, 0 failed ===` |
| `node tests/vmu-fidelity-conclude.test.mjs` | `=== VMU FIDELITY CONCLUDE: 69 passed, 0 failed ===` |
| `node tests/vmu-blueprint.test.mjs` | `=== VMU BLUEPRINT: 54 passed, 0 failed ===` |
| `node tests/vmu-v5r-tools.test.mjs` | `=== VMU V5R TOOLS: 339 passed, 0 failed ===`（工具面 47） |
| `node tests/vmu-verified-gates.test.mjs` | `=== VMU VERIFIED GATES: 98 passed, 0 failed ===` |
| `node tests/vmu-records.test.mjs` | `=== VMU RECORDS: 269 passed, 0 failed ===` |
| `node tests/vmu-library.test.mjs` | `=== VMU LIBRARY: 126 passed, 0 failed ===` |
| `node tests/vmu-pack.test.mjs` | `=== VMU PACK: 79 passed, 0 failed ===` |
| `node tests/vmu-pack-defaults-named.test.mjs` | `=== VMU PACK DEFAULTS NAMED: 36 passed, 0 failed ===` |
| `node tests/vmu-meeting-types.test.mjs` | `=== VMU MEETING TYPES: 126 passed, 0 failed ===` |
| `node tests/vmu-settings.test.mjs` | `=== VMU SETTINGS: 47 passed, 0 failed ===` |
| `node tests/audit-installer-policy.test.mjs` | `=== INSTALLER POLICY: 90 passed, 0 failed ===` / `ALL GREEN` |
| `node scripts/audit-pack-value-domain.mjs` | `=== PACK VALUE-DOMAIN: 5 passed, 0 failed ===` |
| `node scripts/check-docs.mjs` | `DOC LINT: PASS` |

`regen-all --write` 与全量 T1 按要求**未跑**（Lead 合并期统一做）。

## 1. B6 — "含正式证明（写完）的命题卡才能辩论"：三层拆开，声明层不是证据

缺陷：闸原来把**自报**当证明——卡上写 `proofRef` + `proofState: complete` 就放进辩论。自报可以是假的、可以是没写完的，
而"能辩论"这件事的后果是**把概率改成 1**，所以这是把最贵的判断押在最便宜的输入上。

拆法（三层，各归各位）：

| 层 | 是什么 | 落点 |
| --- | --- | --- |
| 声明层 | 卡上 `proofRef`（证明/反证在哪）+ `proofState`（`complete|draft`）——**自报，写明是自报** | `packs/v5r/tools.js:1072-1081`（`proof_ref`/`proof_state` 折进 `payload`，`parseCard(row).fields` 可读）、`:1988/1989`（注册表文案明写 `SELF-REPORT ... NOT a verification`） |
| 证据层 | 机器证据，**任一**才算数：① 该卡有通过的 Lean 作业；② 该卡已在 `verified` 轨有定论行 | `packs/v5r/verification-gates.js:190-236` |
| 追溯层 | 回执写明 `declared`/`declaredState`/`evidence{lean,verified}`/`proofVia` | 同上 |

闸的三个出口，**两个码分开两种缺失**（两种缺失、两条改法）：

- 有证据 ⇒ 放行，`proofVia: 'lean-passed' | 'verified-row'`（`verification-gates.js:212-230`）；
- 声明说"写完了"但**没有机器证据** ⇒ `VMU_PACK_V5R_DEBATE_SUBJECT_UNPROVEN`（`GATE_CODES` `:41`、拒绝点 `:231`）——hint 给两条合法路径 + "没写完就把 `proofState` 改回 draft"；
- 根本没有声明 / 草案 / 卡读不到 ⇒ `VMU_PACK_V5R_DEBATE_SUBJECT_NO_PROOF`（原码，hint 保留"三种合法形态"清单）。

目录仍是"四个闸"：`gateCatalog()` 从一个闸一行改成一行 + `codes` 数组（`verification-gates.js:342`），
所以"闸的条数"没有因为多一个码而变成五。一句话命题（非卡形态）不经过这道闸。

## 2. B8 — Lean 通过之后只查"描述/定义符合性"，符合即 p=1 并进 `verified`

规则原文：lean 已通过但概率仍非 1 的命题，辩论焦点是**代码是否符合原意**。所以收口动作不是"再投一次票"，而是一个
**显式的符合性判定**：

- 新工具 `vibe_v5_fidelity_conclude`（`packs/v5r/tools.js:926`，注册 `:2190`），参数 `card` / `fidelity: conform|defect` / `lean_job` / `member` / `note`。
- 前置具名拒：缺 `lean_job`、未知作业、**作业没通过** ⇒ `VMU_PACK_V5R_FIDELITY_LEAN_NOT_PASSED`；没署名 ⇒ `VMU_INVALID_ARGUMENT`；非主席签 ⇒ `VMU_NOT_PERMITTED`（`requireChairSeat`）；未知卡 ⇒ `VMU_NO_SUCH_OBJECT`。没跑过 Lean 就"宣布符合"这条路被堵死。
- `conform`：卡 p≠1 时走**同一条**卡写入路径写 p=1（证据＝这次 Lean 作业 + `lean_conformance: 'conform'`，即 B6 证据层的第①条），再由 `singleWriter({writer:'promoteVerified'})` 复核并 `promoteVerified({warrant:{id: jobId, kind:'lean-conformance', subject: cardId}})`。**没有第二条写 verified 的路径**；重复调用幂等（`promoted.written: false`，行数仍 1）。
- `defect`：`kernel.fidelity.declareDefect({target, by, note})`（原因必填，内核自己具名拒），撤回标记落地后 `findVerified` 立刻返回 `null`；同原因重复 ⇒ `alreadyWithdrawn: true, appended: false`，新原因 ⇒ 追加标记；撤回后 `.promoteVerified` 拒绝复活（撤回不可撤销）。
- `kernel/fidelity.js` 与 `kernel/lean.js` 此前**没有 pack 侧消费者**，这条链正是它们的第一个消费者。

### 2.1 三条"真机上永不命中"的静默机制（Lead 要求台账引用这一节）

这三条都是**同一个病**：`代码里有分支 ≠ 真机会走到那个分支`。它们的共同特征是——**mock 里方法名/返回形状写什么都"存在"**，
所以单元测试跑绿、真机永远走不到，且**不报错、不告警**（静默），只有按真实面的**方法名与返回形状**逐条核对才能发现。

| # | 位置 | 病 | 后果 | 发现方式 |
| --- | --- | --- | --- | --- |
| 1 | `packs/v5r/verified.js` 的 `findVerified` / `promoteVerified`；`packs/v5r/tools.js` 的 `fidelityWithdrawnFn` | 拿 `fidelity.passedWithdrawnFor(id) === true` 判断撤回，而内核 `kernel/fidelity.js:150-158` 返回的是**标记对象** `{ok, target, withdrawn: true, markerId, note, by, at}` | 撤回标记在真机上**永不命中**：④ `fidelityAsked` 的 `withdrawnFor` 恒 `false`，被撤回的证明仍能当证据 | 按真实面**返回形状**核对（读 `kernel/fidelity.js` 的 `passedWithdrawnFor` 实现），不是跑测试 |
| 2 | `packs/v5r/tools.js` 的 `leanPassedOf` | 探的是 `kernel.lean.job(...)`，而该面挂的方法名是 **`status(id)`**（`vibe-math-vmu/kernel/lean.js:977`） | Lean 证据分支在真机上**静默不存在**（B6 的一条证据链是死的）；`job` 分支只是兼容残留 | 按真实面**方法名**核对（`kernel/lean.js` 的导出表），不是跑测试 |
| 3 | `packs/v5r/verified.js`（同 #1 的一处，独立成行便于引用） | 同 #1 的 `=== true` 比较出现在第二个函数里 | 同一族的第三处 | 同上 |

修法：加 `withdrawnBy(fidelity, id)`（同时认布尔与标记对象两种形状）替换三处比较；`leanPassedOf` 改成优先 `status`、兼容 `job`，
并**如实区分**"Lean 面不存在（没有 spawn 缝，零机制的正常态）"与"作业确实没通过"——两者都是"没有证据"，但拒法要说清是哪一种。

**给台账的一句话**：这三处都不是"写错了逻辑"，而是"**对着一个不存在的形状写对了逻辑**"；
它们的暴露点不是测试红，而是**按真实面核对**。

## 3. B2 — 公共蓝图：从一个"没有写者的路径"变成一个可提案、可落成、可读的轨

缺陷：`vmu.turn.protocolPath`（`settings/schema.js:212`，pack 默认 `Shared/Protocol.md`）只有两处提示词插值
（`packs/v5r/prompts/v5r-blocks-b.js:236`、`:584`），**全仓没有写者** ⇒ 它是"路径约定"，不是"可以改的蓝图"：
没有编辑权、没有版本、没有变动记录，提示词每轮引用一个谁也没法改的文件。

做法（**不新造内核结构**，用已有的 `records` 轨）：

- 新模块 `packs/v5r/blueprint.js`（335 行）：`BLUEPRINT_TRACK='blueprint'`（`:38`）、`composeBlueprintBody`（`:78`）、`parseBlueprint`（`:96`，坏行报出不猜）、`listBlueprints`（`:117`）、`blueprintState`（`:141`，派生"哪版在生效"）、`readBlueprint`（`:187`）、`proposeBlueprint`（`:200`）、`adoptBlueprint`（`:244`）。
- **轨在装配期声明**（不是运行时临时 put）：`packs/v5r/settings/defaults.json` 的 `vmu.records.tracks` 加 `"blueprint"`、`vmu.records.allowedKinds` 加 `"blueprint"`。轨道集合在 `kernel/records.js:189-221` 是构造期快照，未声明的轨写不进去；这是 `verified.js` 的同一做法。
- **编辑权闸**（"只有主持人具有的命令"这条规则的落点）：
  - 任何在册成员可 **propose**（写一行 `draft`，`revision = 现行 revision + 1`，`settled: false`）；
  - 只有 **chair 席**（`BLUEPRINT_ADOPT_SLOT='chair'`，一处声明、`packs/v5r/tools.js` 的工具面读它）可 **adopt**（落成 current）；非主席 ⇒ `VMU_NOT_PERMITTED`，消息点名"这是主席席动作"。
- **"在生效"是派生的，不是存的**：`blueprintState()` 在 live `current` 行里取最高 `revision`。否则一个事实两个写者（状态字段 + 行序），迟早不一致。落成时会 `records.supersede({reason})` 上一版——`supersede` **不改 `state`**（`kernel/records.js:620-645`），所以历史行仍写 `current`，而蓝图的"在生效"仍由 revision 派生 ⇒ 要读"当时生效的是哪版"必须看 revision，不能看 status。
- **草案行永不改状态**（append-only）⇒ "重复落成"无法靠读草案发现，只能问"是否已有 current 行把这份草案记作 `proposalId`"（`blueprint.js:262-267`）；另有"比现行版本旧"的具名拒（`:268-274`）。
- **"按时更新"给可读信号而不是门禁**：`blueprintState()` 回 `updatedAt` / `ageMs` / `staleAfterMs`（`BLUEPRINT_STALE_AFTER_MS` = 30 天）/ `stale` / `staleNote`；**超期是提示不是拒绝**（蓝图过期不阻塞任何人，只让读者看见）。
- 工具面 `vibe_v5_blueprint`（`packs/v5r/tools.js:1417`，注册 `:2196`）：`action: state | propose | adopt | read`，路径缺省取设置值（回执写 `pathSource: setting:…` 或 `argument`）。
- 读面复用既有的 `vibe_v5_read_library`：`track` 默认＝`declaredTracks(kernel)`（`kit/handlers.js:365-413`），所以声明了轨就天然可读，**不需要为此新增读面**（测试 §1 实测 `read_library {track:'blueprint'}` 能读回刚提案的那一行）。

## 4. 没做什么（写清楚，避免"以为做了"）

1. **`packs/v5r/prompts/**` 一个字没动**（R18 明确"本轮不要动"，另开 F5 车道）。B2 原允许在 `v5r-corrections.js` 加一小段"蓝图怎么改"，
   为免与 F5 车道撞车**未加**；建议文本见 §5.3，由 Lead 决定放不放。
2. 未改 `kernel/**`、`tools/**`、`kit/**`、`settings/schema.js`、`docs/03`、`docs/08`（顺带的两条真缺陷修复都在 `packs/v5r/**` 内）。
3. 未跑 `regen-all --write`、未跑全量 T1。
4. 台账（`phase12-v5r-rules-conformance.md`）与 `packs/v5r/docs` 未改——按 Lead 分工由他写。

## 5. 交 Lead

### 5.1 台账建议（D 行）
- **B6**：可标 ✅ 已实现。证据 `verification-gates.js:190-236`（证据层优先 + 两码）、`tools.js:1072-1081`（声明层）、`:1988`（文案写"自报"）、门禁 `vmu-debate-subject-proof` 39/0。
- **B8**：可标 ✅ 已实现。证据 `tools.js:926`（新工具）+ `packs/v5r/verified.js` 的单一写入器路径 + `kernel/fidelity.js`、`kernel/lean.js` 的第一个 pack 消费者 + 门禁 `vmu-fidelity-conclude` 69/0。
- **B2**：可标 ⚠️ 部分（缺提示词那一小节）。证据 `packs/v5r/blueprint.js:38/141/200/244`、`defaults.json` 的 `tracks/allowedKinds`、`tools.js:1417`、门禁 `vmu-blueprint` 54/0。
- **§2.1 的两条**（撤回标记 `=== true`、`lean.job` vs `status`）建议作为独立行记在"静默机制"一族，与 L27 并列引用本文 §2.1。

### 5.2 §8 契约表
新增 pack 侧码一枚需登记：`VMU_PACK_V5R_FIDELITY_LEAN_NOT_PASSED`（`packs/v5r/tools.js:926` 起的拒法）。
`VMU_PACK_V5R_DEBATE_SUBJECT_UNPROVEN` 你已登记。docs 我未动。

### 5.3 提示词小节（未落盘，供你决定）
建议放 `packs/v5r/prompts/v5r-corrections.js` 末尾（约 3 行、≤400 字符，风格与四段更正一致）：
> 【更正·蓝图】`Shared/Protocol.md` 是**可改的蓝图**，不是只读路径：任何成员用 `vibe_v5_blueprint {action:"propose", text:"<整版>"}` 提一版；
> 只有主席 `action:"adopt", draft:"<行 id>"` 才生效；`action:"state"` 回 `revision/updatedAt/stale`（超期只是提示），
> 行内容也可 `vibe_v5_read_library {track:"blueprint"}` 读回。

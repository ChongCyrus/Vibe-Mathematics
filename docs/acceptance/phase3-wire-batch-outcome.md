# Phase 3 · WIRE 批（25 键）逐键结果表（task-228）

> 执行：`vmu-assistant2`｜★ **边做边写盘**｜**未跑 git**｜临时件 `D:\_tmp`｜**未碰 `token.txt`**（mtime 仍 `2026-09-21 14:35:56`）。
> 判据与门：`tests/audit-doc-planned-claims.mjs`（"表说 `✅ 已接线` 而卷还说未实现"＝**活缺陷**；豁免词＝`键已接线`／`由 pack 消费`／`pack 侧消费`／`由 pack 接线`）；`scripts/generate-planned-settings.mjs --check`（`settings/planned.js` 与卷逐字一致）。
> ★ 硬约束遵守：**未碰** `settings/planned.js`／`settings/schema.js`／`packs/v5r/middleware/`／`packs/v5r/prompts/` ⇒ 印证全部**只读**。

## 0. ★★ 结论（一句话）
**本批 25 键里，21 个"模板读取"键的裁定【在树上已经为真】；我实测确认后【未做任何编辑】。剩下 4 键**（`storeBackend`／`selfCheck`／`pointer.propagation`／`turn.feedback`）**按"不许造假"原则报为仍未接线/仍未判定** —— ★ **两条前提与树不符**：**(1)** 这些键**没有**任何"卷宣称未实现"可改（0 命中）；**(2)** 生成表**已**把模板引用计入接线（21 键已标 `✅ 已接线`）⇒ ★ **台账对这批的裁定已过期**（它写在表判据更新之前）。

## 1. 逐键结果表（25 键；★ 全部带证据）
| # | 键 | 台账裁定 | 读者证据（我实测） | 生成表接线列（`04-§11` 实测） | 我的处置 | 判定 |
|---|---|---|---|---|---|---|
| 1 | `vmu.core.storeBackend` | 需真读者 | ★ 内核 **0 处**提及（`kernel/**` 全扫） | `⚠️ 未接线（改了不会有行为变化）`，载体 `—` | ★ **未接线**（接它＝实现第二种耐久后端，属新功能） | **仍未接线（诚实保留）** ✓ |
| 2 | `vmu.turn.objective` | 模板读取 | `packs/v5r/prompts/v5r-blocks-a.js`×3＋`v5r-charter.js`×1＋`v5r-persona.js`×5；消费＝`kernel/prompt/index.js:445` | ✅ 已接线（载体 `v5r-blocks-a.js`） | **无需编辑** | **已为真** ✓ |
| 3 | `vmu.turn.maxParallel` | 模板读取 | `v5r-blocks-b.js`×1；同上消费点 | ✅ 已接线 | **无需编辑** | **已为真** ✓ |
| 4 | `vmu.turn.toolCallsPerTurnCap` | 模板读取 | `v5r-blocks-b.js`×1 | ✅ 已接线 | **无需编辑** | **已为真** ✓ |
| 5 | `vmu.turn.memoryCeilingMb` | 模板读取 | `v5r-blocks-b.js`×1 | ✅ 已接线 | **无需编辑** | **已为真** ✓ |
| 6 | `vmu.turn.selfCheck` | 需真读者 | ★ 内核按名 **0 处**；载体现为 **`packs/v5r/middleware/prompt-switches.js`** | `❓ 未判定（可能走动态读取…）` | ★ **未动**（该载体是**兄弟在飞**文件，任务禁碰） | **仍未判定** ✓ |
| 7 | `vmu.turn.protocolPath` | 模板读取 | `v5r-blocks-b.js`×2 | ✅ 已接线 | **无需编辑** | **已为真** ✓ |
| 8 | `vmu.turn.verifyTarget` | 模板读取 | `v5r-blocks-b.js`×5 | ✅ 已接线 | **无需编辑** | **已为真** ✓ |
| 9 | `vmu.turn.verifyKindLabel` | 模板读取 | `v5r-blocks-b.js`×1 | ✅ 已接线 | **无需编辑** | **已为真** ✓ |
| 10 | `vmu.turn.invitedBy` | 模板读取 | `v5r-blocks-b.js`×1 | ✅ 已接线 | **无需编辑** | **已为真** ✓ |
| 11 | `vmu.turn.invitedWhy` | 模板读取 | `v5r-blocks-b.js`×1 | ✅ 已接线 | **无需编辑** | **已为真** ✓ |
| 12 | `vmu.turn.feedback` | 需真读者（与 `vmu.report.feedback` 重叠） | ★ 内核按名 **0 处**；载体同上（middleware） | `❓ 未判定` | ★ **未动**；★ 语义与**已实测接线**的 `vmu.report.feedback` 重叠 ⇒ **归并口径请 Lead 裁** | **仍未判定** ✓ |
| 13 | `vmu.pointer.propagation` | 需真读者 | ★ 内核按名 **0 处**（★ 但**相邻键** `vmu.records.pointerPropagation` **被读**：`kernel/records.js:57/99/141`）⇒ ★ **疑似重名/改名** | `❓ 未判定`，载体 middleware | ★ **未动**（载体禁碰）；★ 把"相邻键已接线、本键未见"如实记下 | **仍未判定（疑似重名）** ✓ |
| 14 | `vmu.turn.instituteName` | 模板读取 | `v5r-assistant.js`×2＋`v5r-blocks-a.js`×3＋`v5r-charter.js`×1 | ✅ 已接线 | **无需编辑** | **已为真** ✓ |
| 15 | `vmu.turn.leaderId` | 模板读取 | `v5r-blocks-a.js`×3＋`v5r-charter.js`×1 | ✅ 已接线 | **无需编辑** | **已为真** ✓ |
| 16 | `vmu.turn.tempHiredBy` | 模板读取 | `v5r-blocks-a.js`×3 | ✅ 已接线 | **无需编辑** | **已为真** ✓ |
| 17 | `vmu.turn.tempDirection` | 模板读取 | `v5r-blocks-a.js`×1 | ✅ 已接线 | **无需编辑** | **已为真** ✓ |
| 18 | `vmu.turn.tempTerm` | 模板读取 | `v5r-blocks-a.js`×1＋`v5r-charter.js`×1 | ✅ 已接线 | **无需编辑** | **已为真** ✓ |
| 19 | `vmu.turn.meetingId` | 模板读取 | `v5r-blocks-a.js`×1 | ✅ 已接线 | **无需编辑** | **已为真** ✓ |
| 20 | `vmu.turn.formalModeLine` | 模板读取 | `v5r-blocks-a.js`×1 | ✅ 已接线 | **无需编辑** | **已为真** ✓ |
| 21 | `vmu.turn.formalProof` | 模板读取 | `v5r-blocks-b.js`×2 | ✅ 已接线 | **无需编辑** | **已为真** ✓ |
| 22 | `vmu.turn.formalBlockedNote` | 模板读取 | `v5r-blocks-b.js`×2 | ✅ 已接线 | **无需编辑** | **已为真** ✓ |
| 23 | `vmu.paper.reviewedMember` | 模板读取 | `v5r-blocks-b.js`×3 | ✅ 已接线（载体 `v5r-blocks-b.js`） | **无需编辑** | **已为真** ✓ |
| 24 | `vmu.turn.formalRootRel` | 模板读取 | `v5r-blocks-b.js`×2 | ✅ 已接线 | **无需编辑** | **已为真** ✓ |
| 25 | `vmu.turn.formalModeLabel` | 模板读取 | `v5r-blocks-b.js`×1 | ✅ 已接线 | **无需编辑** | **已为真** ✓ |
**汇总**：★ **21/25 ＝ 已为真（读者实证 ＋ 表已标 ✅ ＋ 无可改的卷宣称）**｜**1 ＝ 仍未接线（`storeBackend`）**｜**3 ＝ 仍未判定（载体是兄弟在飞的 middleware）**。

## 2. ★★ 两条实测得出的前提更正（本批真正的发现）
1. ★★ **"卷在宣称这些键未实现"【不成立】**：对 **21＋4 键**逐个在 `vibe-math-vmu/docs/*.md` 里搜"键名 ±70 字符窗口内出现 `未实现|未接线|planned|规划`"⇒ **全部 0 命中**；门自己也报 **`0 key claim(s) checked, 0 contradicted by the generated table`** ⇒ ★ **没有可改的宣称**（★ 若硬改，就是无中生有）。
2. ★★ **"表把 21 键标成未接线"【已过期】**：`04-§11` 生成表里这些键**已经是 `✅ 已接线`**，且**载体列点名了 pack 文件** ⇒ ★ 生成器**已把 `{{ setting:… }}` 模板引用计入接线**（§3 有 21/21 实证）⇒ ★ **台账这一批的裁定写在判据更新之前**。
★ 因此：**"接线一个键"在这一批上不需要动 schema（已禁碰）也不需要动卷 —— 它已经为真**；★ 我**没有**为了"完成任务"而改任何文档（★ 这正是本阶段要防的"改一条代码不支持的说法"的反向情形：**改一条本来就真的说法也同样是假的编辑**）。

## 3. 21 个模板键的"读者"证据链（★ 三层，全部只读实测）
1. **模板引用（21/21 命中）**：`packs/v5r/prompts/` 下 `{{ setting:<键> }}` 逐键计数，例：`vmu.turn.verifyTarget` ×5、`vmu.turn.objective` ×3＋×1＋×5、`vmu.paper.reviewedMember` ×3、`vmu.turn.instituteName` ×2＋×3＋×1。
2. **消费点是真读**：`kernel/prompt/index.js:445` → `if (key.startsWith('setting:')) value = ctx.settings ? ctx.settings[key.slice(8)] : undefined` ⇒ ★ 模板代换**真的从 `ctx.settings` 取值**；★ 且有**白名单**（`:440-443` 未登记变量即 `VMU_INVALID_ARGUMENT`）与**缺值具名拒**（`:448-452` `VMU_PROMPT_VARIABLE_MISSING`）⇒ 不是"可能读"，是**被强制读**。
3. **生成表独立印证**：`04-§11` 的接线列 `✅ 已接线` ＋ 载体列给出 pack 文件（抽样：`vmu.turn.objective`→`v5r-blocks-a.js`；`vmu.paper.reviewedMember`→`v5r-blocks-b.js`）。

## 4. 门的读数台账（★ 每道门实测）
| 门 | 读数 | exit |
|---|---|---|
| `generate-planned-settings.mjs --check` | `planned settings: up to date (111 planned keys)` | **0** ✓ |
| `tests/audit-doc-planned-claims.mjs` | `0 key claim(s) checked, 0 contradicted by the generated table` | **0** ✓ |
| `regen-all --check` | **`=== vmu regen-all: 15/15 in sync ===`** | **0** ✓ |
| 受影响套件 · `vmu-planned-settings.test.mjs` | `ALL GREEN (planned=111, docs=28, passed=39, failed=0)` | 0 ✓ |
| 受影响套件 · `vmu-settings-domain.test.mjs` | `48 passed, 0 failed` | 0 ✓ |
| 受影响套件 · `vmu-prompt.test.mjs` | `70 passed, 0 failed` | 0 ✓ |
| 受影响套件 · `vmu-turn.test.mjs` | `144 passed, **1 failed**` | 1 ⚠️ |
★ `vmu-turn` 那 1 条＝**`T124`（会议发言状态）既存红**，★ **与本批无关**（本批**未改任何代码/文档**；该红我在 round 6 的报告里已具名报过）。

## 5. 没核 / 未处置（★ 与"已处置"分开）
1. ★ **`storeBackend` 的接线**：**未做**（需要第二种耐久后端＝新功能，不是"让宣称变真"）。
2. ★ **`selfCheck`／`pointer.propagation`／`turn.feedback` 的接线**：**未做** —— 三键在表里是 `❓ 未判定`，**载体列指向 `packs/v5r/middleware/prompt-switches.js`**，而任务**明令禁碰** `packs/v5r/middleware/` ⇒ ★ **属兄弟的在飞范围**，我**只报不碰**。
3. ★ **`vmu.pointer.propagation` 与 `vmu.records.pointerPropagation` 的关系**：我实测到**相邻键被读**（`kernel/records.js:57/99/141`）而本键内核内 **0 处** ⇒ **疑似重名/改名**，但**未做进一步判定**（需要谁读本键的语义裁定）。
4. ★ **`vmu.turn.feedback` 与 `vmu.report.feedback` 的归并口径**：**未定**（后者已实测接线；归并属 Lead 裁）。
5. ★ **DELETE 13 键与 UNDECIDED 80 键**：**不在本任务范围**（兄弟任务负责）。
6. ★ **未跑 T1／全量**；**未跑 git**。

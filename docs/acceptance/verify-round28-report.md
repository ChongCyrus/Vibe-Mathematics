# Round 28 · `vmu-verify2`（`task-148`）交付报告 —— 复核 `task-146`／`task-147` ＋ 矩阵 v20

> 纪律：只读复核（**本轮仓内一行未写**；探针只在 `D:\_tmp\v28`）；未跑全量／`regen-all`／git。
> **读的版本**：**HEAD `2d39d59`**（工作树 clean）；`entry` blob sha256[0:16] **`B78B3E05FE2033F4`**（81873 bytes，**由 `git cat-file blob HEAD:` 逐字节算出、无文本往返**）。
> 交付：**`§9.34 v20`（矩阵 1558 → 1619 行，sha256[0:16] `E5C047D169350B24`）**。

## 0. 结论速览

| 项 | 判定 | 关键读数 |
|---|---|---|
| **A `task-146`** | ⏳ **未运行（我独立确认）** | 全盘扫 `session.v4.jsonl.zstd` ⇒ **最新＝arm E `session-6ca9fefd…`（17:43，`09D1D43DBEFF28C6`）**，其后**零**新会话 ⇒ "R24–R26 零新真机会话"**由文件系统证实**；payload 哈希仪器已备（blob `B78B3E05FE2033F4`） |
| **B `task-147` 清点** | ✅ **两人独立一致** | **11 处**，全在 `kernel/meetings.js`（`:136/138/147/154/171/173/178/184/185/186/188`）；`orderMode` 不在其中；**全包无别名/包装** |
| **B 判别点** | ★ **两处判 (i)，不是 (iii)** | `config.vmu` 通道投入域外值：`tier`／`leaveApprover` **LOADED（无拒绝）**；对照 `orderMode` **REFUSED**`VMU_INVALID_ARGUMENT` |
| **B ★★ 新发现** | ★ **`schema` 的 `type`/`domain` 运行时无执行点** | `validateValue` 唯一调用者＝`resolveSettings`（`schema.js:1558/1566`），而它**包内无调用者**；实测**3 个非 meetings 的 enum 键**域外值同样 LOADED |
| **C `systemPrompt`** | ✅ **有宿主侧证据 → 判"宿主能力边界"** | `dsh-ops/lib/index.js`：`if (config.promptPolicy) root.inject(['systemPrompt'], …)`；`ptc/index.js`：`ctx.get('systemPrompt').assemble(…)`；asar 内 350 次出现 |
| **D 矩阵 v20** | ✅ | 五件／四次空过／署名约定**指回**（§9.31.1／§9.32.7／§9.33.7）；新增两条纪律 |

## 1. 原样命令与退出码（全部 exit=0）

```
node D:\_tmp\v28\oneof-inventory.mjs        # helper／别名／枚举 schema 行号      exit=0
node D:\_tmp\v28\domain-and-host.mjs        # validateValue 位置 + 宿主侧证据    exit=0
node D:\_tmp\v28\channel-discriminator.mjs  # ★ config 通道是否拒域外值          exit=0
node D:\_tmp\v28\generalize-domain.mjs      # ★ 泛化到非 meetings 的 enum 键      exit=0
node -e "…git cat-file blob HEAD:…"         # payload 字节级哈希                exit=0
```

## 2. B：清点与判定（逐条）

- **清点**：11 处命中；`oneOf` 定义仅 `meetings.js:128`（`const oneOf = (v, set, def) => (set.includes(v) ? v : def)`，**静默回落无拒绝**）；**无别名/包装**。
- **schema（我独立读）**：`tier`（`1011`）与 `leaveApprover`（`1021`）＝`enum`+`domain`；其余 **9 个**＝`type:'string'` **无 `domain`**（`appealScope:1210`／`attendanceMode:1211`／`budgetOnExceed:1212`／`confidentialityDefault:1220`／`confidentialityQuotePolicy:1221`／`leaveEarlyPolicy:1231`／`minutesDetail:1235`／`quorumLossPolicy:1238`／`wakeFailurePolicy:1253`）—— **与其清单逐行相同** ✓。
- **★ 判别点（唯一能改计数的一行）**：`config.vmu` 通道**不拒**（`tier`／`leaveApprover` 皆 **LOADED**，`source="config"`），而**对照组 `orderMode` REFUSED**（因为它的**读取侧**是 `strictOrderMode`）⇒ **执法点在读取侧，schema 的 `domain` 不构成运行时保护** ⇒ 两处判 **(i)**，修法＝读取侧具名拒。
- **未观察（具名）**：域外值被 `oneOf` 静默替换的**用户可见后果**未端到端观察（`status().settings[key]` 取回 `undefined` 是**我的观测点没取到**，不是"值不存在"）；结论由 `oneOf` 代码语义 ＋ "通道不拒"实测共同支撑。
- **★★ 泛化新发现**：`validateValue` 唯一调用者 `resolveSettings`（`schema.js:1558`，调用点 `:1566`）**包内无调用者** ⇒ 声明**无执行点**；实测 `vmu.budget.onExceed`／`vmu.compat.unknownCombo`／`vmu.quota.onExceed` 的域外值经 `config.vmu` 同样 **LOADED（无拒绝）** ⇒ **不是 meetings 的问题**。⇒ 纪律：**"schema 写了 `domain`" ≠ "运行时受保护"**；对 `task-147` 而言，补 `domain` **只完成声明**，**真修在读取侧**。

## 3. C：`systemPrompt` 定性（证据 → 结论）

**证据**：`dsh-ops/lib/index.js` 的 `if (config.promptPolicy) root.inject(['systemPrompt'], ctx => { … })`（服务存在、**必须 inject**、**受 `config.promptPolicy` 条件约束**）；`dsh-ops/lib/ptc/index.js` 的 `ctx.get('systemPrompt').assemble({ scope, signal })`（**惯用取法是 `ctx.get(name)`**）；harness `app.asar`（121,348,951 B）内 `systemPrompt` 出现 **350** 次。
**结论**：(a) 不可达的原因＝**inject-only ＋ 条件性**，而 `vibe-math-vmu.js:51 export const inject = ['tools']` **未注入** ⇒ 直接读 `ctx.systemPrompt` 撞 cordis 代理抛错 ⇒ **具名降级是正确行为**；(b) 归类＝**宿主能力边界**（不是我们的缺陷，也不是"宿主没能力"）；**把 `systemPrompt` 加进 `inject` 会让插件硬依赖一个可能不存在的服务 ⇒ 不加是对的**；(c) 改判条件＝宿主**无条件**提供，或我们改用**可选依赖**写法（`ctx.get('systemPrompt')` in try/catch，`dsh-ops` 已如此用）／DSH 支持 optional-inject。

## 4. A：`task-146` 现状与仪器

- **无新真机会话**：`D:\_tmp` 全盘按 mtime 排序，最新一条会话日志＝**arm E**（17:43，`09D1D43DBEFF28C6`）⇒ 升档**尚未发生**（其前提"R24–R26 零新真机会话"**由我独立证实**，非采信自述）。
- **payload 哈希仪器**：`git cat-file blob HEAD:vibe-math-vmu/vibe-math-vmu.js` → Buffer → sha256[0:16] **`B78B3E05FE2033F4`**（与工作树文件一致、81873 B ⇒ 无文本往返）。
- **待交付后对表**：四项读数（`packReport`／两方向 gap／`published−registered`＋`evaluations`／被拒臂同帧四件）与我 R27 的进程内读数**逐项**比；**一致 ⇒ 升档；有差异 ⇒ 以真机为准并具名**（**两者不许混**，§9.33.7）。

## 5. 纪律（本轮入册）
1. ★ **"变异打错行 ＝ 量具错，不是断言没牙"**（Lead 指定）：R27 的 `A2` 实例（`String.replace` 只替换第一处 ⇒ 打在 `:323`）；判"没牙"前先证"变异落在被测那一行"。
2. ★ **"schema 写了 `domain`" ≠ "运行时受保护"**（本轮实测）：唯一执法点是**读取侧**（R17 的 `strictOrderMode` 是模板）；`resolveSettings` 无执行点。

## 6. 具名未闭合
1. `task-146` **未跑**（无新会话）⇒ 四项读数对表待交付。
2. `task-147` 修点与硬约束冲突（`meetings.js` 1199/1200 vs 修点在 `:128`＋11 调用点）⇒ 待 Lead 裁。
3. ★ `schema` 声明**无运行时执行点**（比 `task-147` 更大）⇒ 建议单独派单。
4. 端到端未观察：`oneOf` 静默替换的用户可见后果。
5. `systemPrompt`＝边界（改判条件见 §3(c)），**单独记，不并档**（不影响 pack 装载与阈值开火）。

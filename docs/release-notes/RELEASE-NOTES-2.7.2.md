# dsh-vibe-math 2.7.2 — 发布说明

> 上一版本：2.7.1。本版是**补丁版：只包含修复与附加（新增）响应字段**——把真实引擎环境下的**发现、证据与诊断**补齐：装了但不在 PATH 的引擎能被发现、安装建议不再给出本机跑不了的命令、失败证据（超时/缺包/未校验约束）不再缺失或静默、归档身份与名册口径可直接核对。**既有契约的冻结面未变**：失败码集合（11 个）、参数名与默认值、数据格式与目录结构均未改（由 `tests/audit-math-computation-contract.mjs` 与 `tests/audit-math-computation-parity.mjs` 断言）；新增字段都是**附加**的，旧读者不受影响。DSH 支撑窗口不变，**无需迁移**。

## 概述

- **真实引擎发现更可靠**：引擎发现顺序为 PATH → 宿主自带运行时 → **各操作系统的已知安装目录**，因此在默认目录安装、但没有加进 PATH 的引擎（例如 R）也能被发现。当前纳入已知目录的引擎为 **R / Octave / Julia / MATLAB**（以及 Windows 上的 Python）；Maple / Wolfram 的安装目录布局不固定，未纳入。宿主也可以用可选的 `installRoots` 接口自行提供候选根，发现逻辑不再依赖插件进程的环境变量。
- **不再给出跑不了的安装命令**：`MATH_ENGINE_NOT_FOUND` 只在本机的包管理器**确实存在**时才给出可执行命令，否则给出建议命令与官方地址，并说明原因。
- **`probe` 不再"报喜不报忧"**：除了可用引擎，还会列出**已配置但本机未发现**的引擎及原因。
- **失败证据完整**：`MATH_TIMEOUT` 与 `MATH_NONZERO_EXIT` 携带同样的证据字段，超时的部分输出在**响应与回执**里都能拿到。
- **约束口径明说**：版本约束**只按存在性检查、从不校验**，未校验的约束会被逐条列出，不再静默忽略。
- **归档身份可核对**：运行响应直接给出归档 id 与 attempt；"编辑归档脚本后重跑"的语义有显式字段与警告解释。
- **名册口径统一（v4/v5）**：一次验证/会议冻结一份名册快照并记录版本号，所有视图读同一份数据；成员变化时版本号递增，读到的集合是否过期一目了然。
- **诊断更具体**：成员级调用失败时给出错误码、当前状态与下一步建议（而不是一句"不存在"）。

## 新增

- `math_computation` 的 `run` 响应新增 **`runId`** 与 **`attempt`**（此前归档 id 只存在于回执里，调用方无法直接核对"是不是同一个归档"）。
- `probe` 响应新增 **`configured`**（配置启用的引擎全集）与 **`absent[]`**：每个未发现的引擎带 **`why`**（`not-found-on-this-machine` 或 `needs-a-caller-supplied-command`）。
- 新增约束口径字段：成功响应与"缺包"失败都带 **`versionPolicy`** 与 **`constraintsNotEnforced`**（本次**未校验**的约束逐条列出；没有约束时为空数组）。
- `MATH_TIMEOUT` 响应新增 **`stdout`**/**`stderr`**（按上限截断）；回执 JSON 新增 **`partialStdout`**/**`partialStderr`**。
- `MATH_ENGINE_NOT_FOUND` 的 `next` 新增 **`suggestedCommand`**、**`packageManager`**、**`packageManagerAvailable`**、**`note`**（`vendorUrl` 视引擎而定）。
- `run` 响应新增 **`fileIsArchivedScript`**：当 `mode:'file'` 指向的是**归档副本**时，同时给出 **`ARCHIVED_SCRIPT_RERUN`** 警告，明确说明按设计那是一次**新归档**（新 id、attempt 1、没有历史回执）——要拿到"同一归档的新 attempt + 变更检测"，请编辑**原来的源文件**并用 `mode:'file'` 指向**同一源路径**重跑。
- v4：`status()` 新增 **`rosterVersion`** 与 **`frozenParticipants`**；`consensus` / `meeting` / `verify` 视图带各自的 `rosterVersion`。
- v4：`paper` 视图新增 **`dirProjected`** / **`dirSource`** / **`readSideEffect`**，明确该路径是投影还是真实状态。
- v2/v3：决策与子代理中断诊断新增 **`code`** 与 **`next`**（例如 `VIBE_MATH_DECISION_NOT_FOUND`，并说明队列现状）；v4 的成员级调用新增 **`V4_NO_SUCH_RESIDENT`**（带当前编制与下一步建议）。

## 变更

- **引擎发现顺序**：PATH → 宿主自带运行时 → 已知的每操作系统安装目录（Windows 的 `%ProgramFiles%` / `%ProgramFiles(x86)%` / `%LOCALAPPDATA%\Programs`，macOS 的 framework 路径，Linux 的 `/usr/lib/R`、`/opt/R` 等）。**存在性一律靠列目录证明**，从不假设路径存在。
- **安装建议**：只有在本机能解析出对应包管理器时，`next.command` 才是可执行命令；否则为空，并给出 `note` 与官方地址。安装流程仍是"计划 → `planToken` 确认 → 执行"，作用域默认用户级。
- **归档 id 的键**：`mode:'file'` 以**源路径**为键，`mode:'code'`/`'expr'` 以脚本内容为键。因此编辑**同一个源文件**再跑会落到**同一个归档**（`attempt ≥ 2`、`scriptChanged:true`、`previousReceipt` 指向上一次，且旧 attempt 绝不被覆盖）；而指向**另一个路径**（例如上一份归档的副本）会写入**新归档**，此时 `attempt:1`、`scriptChanged:false`、`previousReceipt:null` 都是**预期**。归档 id 不含随机数。
- **v4 名册冻结与修剪**：验证/会议开始时冻结参与集合并记录 `rosterVersion`；**移除成员会同时从冻结集合中剔除**（否则在飞投票永远凑不齐），**新增成员不进入已冻结集合**，集合真正变化时 `rosterVersion` 递增。没有进行中的验证/会议时，`status().frozenParticipants` 为显式 `null`。
- **v2/v3 票数与法定人数单一来源**：每轮票数只由一个函数（`voteCount`，读**验证任务创建时**记录的期望人数快照 + 轮次）给出，"是否够票、是否都报、共识、最终判定"四个读取点不再各自重算，因此调高/调低验证人数不会让各视图分叉。**刻意保持不变**：`MIN_REVIEWERS` 下限与"全体一致"判据——正是这两条（而不是把判据简化成只看本轮）决定了什么时候能收束；把它们一起"简化"掉会让单审阅者的结论被过早采纳。
- **文档口径更新**：计算工具的验证边界、已知差异与响应字段都写进了随包文档（含真机验证过的引擎版本与边界码）。

## 修复

- **装了却"看不见"的引擎**：只扫描宿主进程 PATH 时，安装在默认目录但未加入 PATH 的引擎（实测：R 4.6.1）会被报成缺失；现在能从已知安装目录发现，并且版本探测与其他候选一致。
- **跑不了的安装命令**：此前会给出本机并不存在的包管理器命令（例如 `winget`）；现在只在管理器确实存在时给出命令，否则给出官方地址与说明。
- **超时证据不完整**：`MATH_TIMEOUT` 之前缺少 `exit` 与 `stderr`，部分输出只存在于磁盘上的 `stdout.txt`；现在响应与回执都带截断后的部分输出，字段与 `MATH_NONZERO_EXIT` 对齐。
- **`probe` 只报可用项**：可用性一行此前可能只列出少数引擎而不解释其余配置项；现在点名"已配置但本机未发现"的引擎与原因。
- **版本约束被静默忽略**：现在明确说明"只按 base name 检查是否存在"，并把本次未校验的约束逐条列出。
- **归档脚本"编辑后重跑"易被误读**：新增显式字段与警告说明"指向归档副本 ⇒ 新归档、无历史"与"指向原源文件 ⇒ 同一归档 + 新的 attempt"，并明确旧回执不能作为修改后代码的证据。
- **v4 `paper` 字段可能被误读**：没有论文状态时该字段是**投影路径**；现在标注 `dirProjected`/`dirSource` 并声明读 `status` 无文件系统副作用。
- **成员可见材料的路径口径**：四个预设的成员材料补齐说明——文件工具按**会话 cwd** 解析路径，列出的相对路径需拼**项目根的绝对前缀**；计算产物请用回执的绝对字段 `receipt.scriptAbs`，或把 `receipt.cwd` 与 `receipt.scriptPath` 拼起来。
- **成员级调用只回一句"不存在"**：v4 现在返回错误码、当前编制与下一步建议；v2/v3 的决策与中断诊断同样给出 `code` 与 `next`。

## 兼容性与迁移

- **破坏性变更：无。** 四套预设的参数默认值、数据格式、目录结构均未改变。
- **纯新增**：本版新增的响应字段都是**附加**的；遇到不认识的字段请忽略，不要据此报错。
- **迁移：无需迁移。**
- DSH 支撑窗口与 2.7.1 相同（见 `package.json` 的 `engines.dsh`）。

## 已知限制

- **Octave / Julia 未随包提供**，在本次的验证机器上也未安装；相关模板与安装计划是静态校验过的，未经真机执行。
- **商业引擎（MATLAB / Maple / Wolfram）模板**仍需在持证机器上确认，默认标记为 `VERIFY`。
- **版本约束只按存在性检查**：具体版本求解仍由包管理器负责，本工具不解析约束。
- **插件无法强制禁网或限制写权限**：`subprocess` 通道没有策略槽位，需要宿主侧沙箱。
- **2.7.0 之前的发布说明仅提供中文**（英文历史索引见 `README.en.md`）。

## 验证方式

- `node tests/run-tests.mjs` —— 全部通过（65 项：44 个套件 + 21 个灵敏度探针）。
- 三个数学契约守卫：`tests/audit-math-computation-parity.mjs`、`-contract.mjs`、`-sensitivity.mjs`。
- 真机验证（python 3.12.10 与 R 4.6.1）：同一算式两边给出相同数值；原生路径与 `cli` 逃生口数字一致且 `scriptHash` 相同；超时 → `MATH_TIMEOUT`，语法错误 → `MATH_NONZERO_EXIT`（带 stderr 与回执），缺包 → `MATH_MISSING_PACKAGES`（不写回执目录），引擎警告 → 正常退出并保留 stderr。

## 依赖

- **无新增运行时依赖**；DSH 支撑窗口不变。

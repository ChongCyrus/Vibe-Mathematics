# Lead 侧目标 3 独立核查（Round 3 · 与 verify 的 `05-framework-strength-evidence.md` 互补）

> 用途：Lead 亲自读代码得出的判定，作为 v2 判定（`04-vmu-framework-strength.md`）的**独立第二来源**。verify 的长尾证据回来后，两者不一致处**以证据更硬的一方为准并写明分歧**。

| # | 原语 | Lead 实测判定 | 证据 |
|---|---|---|---|
| **F22** | **回执契约必须是"行为断言"而不是措辞**（v5r 的教训：177 条断言守着一条死通道） | **具备** ✅ | `kernel/turn/index.js:30-58` 声明 `FIELD_OWNERS` **24 个字段**，每个都绑定**真实面+真实 op**（注释明确"每一对都对着运行期服务核过，发到没实现的面会**可见地**报 face-not-wired，绝不静默"）；`:348-361` 把解析出的字段按 owner 分派到面。⇒ 这正是 F22 要求的形状：提示词承诺的字段**真的被解析入库**，且失败**可见**。 |
| **F23** | 结构化回执解析的容错（围栏/整段/最外层 `{}` 三级回落） | **部分具备** ⚠️ | `kernel/turn/index.js:103-114` `extractFence` 已与 v5r 的 `parseReply` 对齐两处**易错语义**：`json` 标签**可选**、且**最后一个**可解析围栏胜出（注释点名"曾经要求标签并取第一个，是读源码发现的真分歧"）。三级回落的**完整**判定（整段 JSON / 最外层 `{}`）待 verify 在 `05-…-evidence.md` 补齐；**在补齐前按"部分"记**。 |
| **F52** | 一次性 **future-only** 活动等待器（v5r `vibe_v5_wait`，`vibe-math-v5r.js:3424-3466`） | **缺失** ❌ | **全树 grep `waitFor｜vibe_vmu_wait｜future-only｜activityWaiter｜notifyActivity` 零命中**。⇒ 成员只能轮询（烧 token）或永远等。**已开 task-24（新队友 `vmu-activity`）实现**：future-only＋一次性＋超时区间 `[10000,3600000]`＋disposer 全分支清理＋薄工具 `vibe_vmu_wait`。 |
| **F41** | 路径守卫（词法归一 + root 包含；`startsWith` 不够） | **具备** ✅ | `kernel/guard.js:7` 用 `normalize/relative/isAbsolute`；`:89-92` 的 `inside()` 判据是 `rel === '' \|\| (!rel.startsWith('..') && !isAbsolute(rel))`（**跨盘符**会让 `relative` 返回绝对路径 ⇒ 被 `isAbsolute` 抓住）；`:104,277` 写入/读取前都过闸；`:288` **符号链接**按名拒（`VMU_SAFETY_SYMLINK_DENIED`，`vmu.safety.followSymlinks=false` 时）。⇒ 与 v5r F41 的硬要求同形。 |
| **F38** | 内容指纹：**一处计算 + 随记录持久 + 回读而非重算** | **具备（初判）** ✅ | `kernel/library.js:4`（"内容身份只在一处计算"）、`:12`（指纹**随记录持久化**）、`:26` `HEAD_FIELDS` 含 `fingerprint`、`:55,60-62`（`fingerprintPolicy`/`fingerprint.algo`/`truncate` 可调）。"回读而非重算"的**完整**判定待 verify 补齐（我要的是：读面**读卡片里的指纹行**，而不是拿正文重算）。 |

## 方法论备注（本轮新增的一条）
- **"零命中"本身要能被区分**：`F52` 的判定来自"**全树** grep 零命中 + 该原语在 v5r 里有明确落点（`3424-3466`）"，而不是"我没在某个文件里看到"。⇒ 写"缺失"时必须给**搜索范围与模式**，否则读者无法复核（这是本仓 `audit-verbatim-claims` 的同一条纪律）。
- **"具备"必须指出失败可见性**：F22 之所以判"具备"而不是"部分"，关键是它有 **face-not-wired 可见降级**——"声明了但没实现"在本仓反复出现，所以**"失败可见"是判具备的必要条件之一**。

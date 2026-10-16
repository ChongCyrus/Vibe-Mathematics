# vmu 源码级普查 · 工具面／宿主／脚本分片（Round 83 · 目标3）

> **只读普查**：未改任何代码；未跑 git；未跑 T1／全量（未跑任何套件）；临时件在 `D:\_tmp\sweep83`。
> **方法**：★ 全部 83 个文件**机械扫描**（enum↔分支对照、声明↔使用、硬编码候选、空 catch、发货核对）＋ ★ **凡机械命中都回读源码核实**（下列"确认/疑似/非问题"三分即由此而来）。
> ★ 口径：**"机械命中"不是"缺陷"** —— 本次 3 处机械命中经回读后**判为非问题**（见 §4）✓

## ① 普查范围（我实际读过的文件 ＋ 行数）

**本分区文件总数 83（13,494 行）**：`tools/*.js` **48**、`host*.js` ＋ 入口 **6**、`settings/*.js` **2**、`scripts/*.mjs` **27**。

**★ 我【逐行读过】的（本分区）**：
| 文件 | 行数 | 读法 |
|---|---|---|
| `vibe-math-vmu/tools/control.js` | 87 | 全文（Round 46 已读） |
| `vibe-math-vmu/tools/activity.js` | 60 | 全文（本轮） |
| `vibe-math-vmu/tools/capacity.js` | 1–45 | 定点（本轮 enum／分支区） |
| `vibe-math-vmu/host-spawn.js` | 243 | 全文（Round 30 已读，含 `:92-118` 崩溃点） |
| `vibe-math-vmu/vibe-math-vmu.js` | 1–150、626–637 | 定点（配置三形状 + 数学面回执） |
| `vibe-math-vmu/host.js:84-90,127,218` | — | 定点（面→工具映射） |

**★ 其余文件**：**只做了机械扫描**（未见可疑命中 ⇒ 未逐行读）⇒ 见 §6 覆盖率说明 ✓。

## ② 确认缺陷

| 编号 | file:line | 类型 | 证据引文（我实际读到的行） | 影响 | 建议修法 |
|---|---|---|---|---|---|
| **S1** | `tools/capacity.js:8` vs `:29` | **③ enum 与实现不一致**（本仓红线族） | `L8: enum: ['admit','forecast','list','receiptsView','release','reserve','status','storage','waitlistView']`；`L29: if (action === 'retire') {` | ★ **`retire` 分支不可达**：工具的 `parameters.action.enum` 是**调用方能选的全部动作** ⇒ `retire` 永不会被走到（★ 我在 Round 33 曾把 `retire` 加进 enum；**当前树里它不在了** ⇒ 请确认是**被还原**还是**被后来重写覆盖**） | enum 补 `'retire'`（以**实现**为准），或删掉该分支 |
| **S2** | `scripts/generate-kernel-index.mjs`(67)／`generate-seam-table.mjs`(163)／`generate-surface-index.mjs`(227)／`generate-zero-mechanism-matrix.mjs`(458)／`insert-verified.mjs`(48) | **⑦ 落盘点缺失** | 五个文件**都不在** `package.json#files`，且**不在** `tests/audit-package-membership.mjs` 的 `EXCLUDED`（该门只强制 `tests/*.mutants.mjs` ＋ 清单引用文件 ⇒ **它们从门缝里过去**） | ★ 不是"运行时炸"（见下"引用面"），而是**发货边界不可见**：装出来的包里**没有**这些脚本，且**没有任何门说这是有意的** | 二选一并写清：① 若应随包 → 加入 `files[]`；② 若纯仓库工具 → 加入该门的**具名豁免**（像 `EXCLUDED` 那样点名），★ 不要让"没登记"与"有意不登记"长得一样 |
| **S3** | `scripts/insert-verified.mjs`(48) | **① 半成品／悬空** | 该文件**在本仓 0 处被引用**（检索 `vibe-math-vmu/**`、`tests/**`、`scripts/**`、`package.json`，排除自身） | ★ 一个无人调用、也不随包发布的脚本 ⇒ 要么接线、要么删；**留着会让人以为它在链上** | 接线（谁在何时跑它）或删除 |

**★ S2 的"引用面"读数（决定影响大小，逐条检索所得）**：
```
generate-kernel-index   ← tests/audit-kernel-index.test.mjs:4,48 ／ scripts/regen-all.mjs:43
generate-surface-index  ← tests/audit-surface-index.test.mjs:29,63 ／ scripts/regen-all.mjs:44
generate-seam-table     ← tests/audit-gate-snapshot.test.mjs:22 ／ tests/audit-seam-reachability.test.mjs:18
generate-zero-mechanism-matrix ← tests/audit-declaration-criterion.test.mjs:4,667 ／ tests/audit-policy-defaults.test.mjs:67
insert-verified         ← ★ 0（见 S3）
```
⇒ ★ 结论：**没有任何 shipped 运行时文件引用它们** ⇒ 装机后不会 `MODULE_NOT_FOUND` ✓，但**门的覆盖面**与**发货意图**之间没有具名连接 ✓

## ③ 疑似清单（附"定论所需的最小观测"）

| 编号 | file:line | 疑点 | 最小观测 |
|---|---|---|---|
| T1 | `tools/capacity.js:36-42` | 该区**重复**出现 `reserve／release／list／status` 并新增 `calibrate／available／blocked`（enum 里也没有这三个）⇒ 疑似**被前一条 `return` 遮住的第二段分支（死代码）** | **读 `tools/capacity.js:24-45`**：看第二段是否在某个 `return` 之后、或位于别的函数里 ⇒ 一次读即可定论 |
| T2 | `tools/chat.js:71,74,79,84,85,100`；`tools/meeting.js` 若干 | `source: 'member'` 为**字面量来源标注** ⇒ 若所办（office）路径也会走到这里 ⇒ 标错来源 | 读 `kernel/chat.js` 的 `source` 语义 + 检索是否有 `source:'office'` 的对称写法 ⇒ 两条读数即可 |
| T3 | `tools/turn.js` | **没有 `run: async (...)` 签名**（本分区唯一）⇒ 与其余 47 个工具面**形状不同** | 读 `tools/turn.js` 全文（它可能与 `kernel/turn` 用别的装配）⇒ 判断是"另一种合法形状"还是"漏了 action 契约" |
| T4 | `settings/*.js`（2 个文件） | 只做了机械扫描；★ 本阶段多处"生成物 vs 手写物"混淆都出在 settings 侧 | 读这两个文件 + 与 `04-settings.md` 表对照（★ **本次未读**，见 §6） |

## ④ 已核实**非问题**（★ 每条给出理由，避免后人重复追）

| 机械命中 | 为什么**不是**缺陷 |
|---|---|
| `tools/activity.js`：enum 有 `wait` 而 `action === 'wait'` 分支"不存在" | ★ **假阳性**。回读全文：`L24 enum: ['wait','status']`；`L36 if (action === 'status') …`；`L37 if (action !== 'wait') return refused('VMU_INVALID_ARGUMENT', 'unknown action: …', 'the two actions are wait and status')` ⇒ ★ `wait` 是**缺省动作**（`run: async ({ action = 'wait', … })`），`status` 显式，**其余一律具名拒** ⇒ 契约与实现一致 ✓ |
| `tools/*.js` 47 处 `return refused(e.code \|\| 'VMU_STATE', …)` 被我的启发式标成"无码拒绝" | ★ **假阳性**：`e.code \|\| 'VMU_STATE'` **就是**具名码（兜底码也具名）⇒ 这正是本仓"拒绝要具名"的写法 ✓ |
| `need(member, 'member')`／`need(by, 'by')` 等 54 处"硬编码候选" | ★ **假阳性**：第二个实参是**参数名字符串**（给 `need()` 生成 `"<名> is required"`），**不是**被写死的成员 id ✓ |
| `vibe-math-vmu.js:631-633` 数学面失败回执（被标"无码"） | ★ 回读：`L631 const detail = { code: (e && e.code) \|\| 'VMU_ENGINE_UNAVAILABLE', message: … }` ⇒ **有具名码**，且 `L632` 写 stderr ⇒ 不是静默、不是无码 ✓ |
| 空 `catch {}` | ★ 本分区 **裸 `catch {}` = 0**；**注释型 catch = 23**，逐条都有理由（如 `/* stderr may be gone */`、`/* a failed warning must never fail the boot */`）⇒ 与本仓"具名降级"口径一致 ✓ |
| `tools/recruit.js` vs `tools/admission.js` 动作集相同 | ★ **已知已裁定**（Round 33：二者是**同一内核服务**，`kernel/index.js:789/:1635`）⇒ 不是新缺陷，两面描述已互相点名 ✓ |

## ⑤ 发货核对表（本分区 83 个文件）

| 分区 | 文件数 | 在 `package.json#files` | 具名豁免 | ★ 两者都不是 |
|---|---|---|---|---|
| `tools/*.js` | 48 | **48** | 0 | **0** ✓ |
| `host*.js` ＋ 入口 `vibe-math-vmu.js` | 6 | **6** | 0 | **0** ✓ |
| `settings/*.js` | 2 | **2** | 0 | **0** ✓ |
| `scripts/*.mjs` | 27 | **22** | 0 | ★ **5**（＝ S2） |

★ 核对方法与豁免清单：`package.json#files`（711 条）＋ `tests/audit-package-membership.mjs` 的 `EXCLUDED = ["tests/audit-market-metadata.test.mjs","tests/audit-diagram-assets.test.mjs"]`（**只豁免测试**，不涉脚本）✓

## ⑥ 覆盖率说明（★ 诚实优先）

1. ★ **我逐行读过的本分区文件 = 6 个**（§1 表；合计约 450 行 ＋ 若干定点区），**其余 77 个只做了机械扫描** ⇒ ★ **凡是"没读到"的地方，本报告一律不宣称"已确认干净"** ✓
2. ★ **机械扫描覆盖**：全部 83 个文件的 (a) enum↔`action ===` 分支对照、(b) `run:` 签名参数↔函数体使用、(c) 硬编码候选（8 个模式）、(d) 空 catch（去注释/字符串后按大括号配对）、(e) 发货成员关系 ✓
3. ★ **本轮未做**：① `settings/*.js` 全文（**2 个文件，未读** ⇒ §3 T4）；② `tools/turn.js` 全文（未读 ⇒ T3）；③ `tools/capacity.js:24-45` 的通读（⇒ T1）；④ `scripts/*.mjs` **正文**（27 个只做了引用关系与发货核对，**未读逻辑**）；⑤ ★ **任何运行验证**（未跑套件，故所有结论是**静态**的；例如 S1 的"不可达"是**由 enum 的语义**推出，未实跑 `{action:'retire'}` 观察拒绝——★ 若要"行为级"铁证，最小观测＝跑一次该工具的 `run({action:'retire'})` 看它是否被 `enum` 拦下）✓
4. ★ **已知老问题未重复报**：如 `VMU_NO_OPEN_MEETING` 类前置条件、Round 33 的两面重复、Round 30 的 `args` 校验、Round 44 的 control 账本问题 —— **均不在本表** ✓

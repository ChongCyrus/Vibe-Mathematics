# Phase 6 · 逐轮完成记录（★ 用户要求：每轮完成情况持续记录到 md）

> ★ **本文件是【阶段 6】的逐轮账**。★ 规矩：★ 每轮**追加一节**，★ 记 **本轮做了什么 / 证据 / 未做完的 / 下一轮计划**。
> ★ **不写"打算"当"已做"** —— ★ 没做的写"未做"，★ 没核到的写"未核到" ✓

---

## 阶段 6 的四个总目标（★ 用户 2026-10-18 下达）

| ★ # | ★ 目标 | ★ 状态 |
|---|---|---|
| ★ **1** | ★ **适配新版 DSH**（★ 全面检查 ＋ 需要则改；★ 并看新版有无可采纳的新东西） | ★ **进行中** |
| ★ **2** | ★ **完成 v3 pack** —— 使 `vmu+v3pack` **完全一致甚至更优**地复刻原 `vibe-math-v3` 的运行机制/逻辑/提示词 | ★ **进行中（先盘点）** |
| ★ **3** | ★ **全面审查**（代码/docs/逻辑，★ 至 0 问题） | ★ 未开始 |
| ★ **4** | ★ **暂停 goal 并询问用户**是否进行 SLV；★ 放行后跑 v3 与 v5r 真机至结题（★ **告知代理这是模拟、以测试功能为主**） | ★ 未开始 |

★ **纪律**（★ 用户明确）：★ 不发布；★ 只跑**必要**门禁，★ **长门禁（>5 分钟）每 3–7 轮才跑一次**；★ commit ＋ push；★ 临时件放 `D:\_tmp`；★ 队友最多 8 并行。

---

## 轮 1（2026-10-18）

### ★★★★★ 本轮最重要的发现：**DSH 实际是 `0.2.1-rc.2`，而 vmu 只测到 `0.2.0-rc.2`**

★ **证据**（★ 逐字读出来的）：`C:\Users\admin\AppData\Local\Programs\DeepSeek Harness\resources\app.asar\dsh\package.json`
- ★ `"name": "@deepseek-ai/dsh-desktop-runtime"`／★ `"version": "0.2.1-rc.2"`
- ★ `"@deepseek-ai/dsh": "0.2.1-rc.2"`，★ **且该文件里 300+ 个 `@deepseek-ai/dsh-*` 依赖全部是 `0.2.1-rc.2`** ✓
- ★ 桌面端 `app.asar` 时间戳 **2026-10-17 17:20**；★ `app-update.yml` 的 channel ＝ **`nightly`** ⇒ ★ **确实是新构建** ✓
- ★ 佐证：★ 本会话 GUI 端口从 **19387 变成 52193**（★ 应用重启过）✓

★ **而 vmu 的 `package.json`**：
| ★ 字段 | ★ 值 |
|---|---|
| ★ `dsh.testedVersion` | ★ **`0.2.0-rc.2`** |
| ★ `compatibility.dshReleases` | ★ **最高只列到 `0.2.0-rc.2`** |
| ★ `engines.dsh` | ★ 末段 **`>=0.2.0-alpha.1 <0.3.0-0`** ⇒ ★ **0.2.1-rc.2 在范围内** ✓ |

★ **另要分清**：★ **PATH 上的 `dsh` CLI 仍报 `0.2.0-rc.2`**（★ 比桌面端旧）⇒ ★ **"DSH 版本"有两个**：★ **桌面运行时（0.2.1-rc.2，★ 本会话跑的就是它）** vs ★ **CLI（0.2.0-rc.2）** ✓

### ★★★★ 已完成的动作

1. ★★ **提高了队友上限以开"第三批"**（★ 用户要求）
   ★ `~\.dsh\profiles\desktop\cordis.patch.yml` 里 `agent-team.config.maxMembers`：★ **16 → 24** ✓
   ★ **理由写进了文件注释**：★ 该文件**原本就有同因注释**（★ 逐字）：★ *"a member's provider/model are **IMMUTABLE identity fields** and roster rows **can never be removed**, so 'repoint the backend' is impossible for them and the only clean route is a **NEW member name** (which inherits the Lead's current route)"* ⇒ ★ **我补了"第三批（2026-10-18）：opencode-go 与 commandcode 都无额度，★ Lead 已转到 deepseek 路由"** ✓
   ★ **实测生效**：★ **spawn 成功**（★ 无需重载 profile），★ 新队友 `model` ＝ **`deepseek-flash`**（★ 新 provider）✓

2. ★★ **第三批第一位：`dsh-compat`**（★ 目标 1 的执行者）
   ★ 任务：★ 找出 0.2.0-rc.2 → 0.2.1-rc.2 的变更；★ **用 `cordis_inspect` 拉取运行时服务/事件/工具目录**（★ 这是"新版提供什么"的一手证据）；★ 对照 vmu 的**实际依赖面**（`inject`／`ctx.get(...)`／`host*.js`／`kind:'host'` 钩子）★ 逐条判断**仍在／变了／消失**；★ 产出**适配清单**（★ 必须改／建议改／可采纳）✓

3. ★★ **第三批第二位：`v3-inventory`**（★ 目标 2 的地基）
   ★ 任务：★ 把原 v3 的**全部机制**盘清（★ 规划-调度闭环／方法库／软规范数据模型／验证分层／Lean／断点续跑／参数表／提示词段／并发写锁／35 工具全表），★ 然后**逐条判断 vmu 能否表达**（★ 六态：★ 纯数据 pack／M2／M3／M4／装配层注入／**框架能力不足需加内核能力**），★ 产出**复刻施工图骨架**（P0/P1/P2）✓
   ★ **为什么先盘点**：★ **v3-core 只有 134 非空行**，★ 而原 v3 是 **6285 行** ⇒ ★ **行数不能证明什么，★ 但"缺了哪些机制"必须先数清** ✓

### ★★ 本轮建立的基线

| ★ 项 | ★ 值 |
|---|---|
| ★ 仓库 HEAD | ★ `602f194b`，★ dirty=0 |
| ★ 仓库版本 | ★ `2.8.5` |
| ★ 桌面 DSH | ★ **`0.2.1-rc.2`** |
| ★ CLI dsh | ★ `0.2.0-rc.2` |
| ★ profile | ★ `desktop`（★ 其中 `vibe-math-*` 全部 `disabled: true`） |
| ★ agent-team 上限 | ★ **24**（★ 本轮由 16 提高） |
| ★ profile 的 Lead 路由 | ★ `agent-default-model`：★ `provider: deepseek-account`／★ `model: deepseek-flash` |

### ★★ 本轮未做 / 待办

- ★ **未改 vmu 任何代码或 docs** —— ★ 因为**适配结论还没出来**（★ `dsh-compat` 在跑）；★ **先核实再改**，★ 不猜 ✓
- ★ **v3 pack 未动一行** —— ★ 等 `v3-inventory` 的施工图 ✓
- ★ **未跑长门禁**（★ T1 > 5 分钟）—— ★ 按纪律每 3–7 轮才跑；★ 本轮只做了**只读侦察** ✓
- ★ **门禁状态未知**（★ 上阶段末为 T1 374/374 绿；★ 但**换 DSH 大版本后必须重跑**）⇒ ★ **列入轮 2–3**

### ★★ 轮 2 计划（★ 按需，不凑数）

1. ★★ **收 `dsh-compat` 的适配清单** ⇒ ★ 若"必须改"非空 ⇒ **立即改并验证**
2. ★★ **收 `v3-inventory` 的机制清单 ＋ 施工图骨架** ⇒ ★ 定 **P0 清单**，★ 再派实现
3. ★★ **跑一次必要门禁**：★ `node scripts/preflight.mjs` ＋ ★ `scripts/check-docs.mjs`（★ 都很快）⇒ ★ **确认换 DSH 后没坏**
4. ★ ★ 视情况跑 **T1**（★ 长，★ 但换大版本后**值一次**）

# Round 14 · vmu-pack（`task-109`）交付报告 —— **双登记口径三方对齐（pack 侧）**

> 任务：`task-109`（A pack 文件类型→清单表；B 豁免表形状；C `PRESETS` 是否参与；D 是否扩门禁／扩在哪一层）
> 纪律：**未改任何门禁**、未跑全量 T0/T1、未 `regen-all`、**未 git**；临时文件 `D:\_tmp\vmu-pack14\`；本卷只写 `docs/27`／`docs/10` ＋ 本报告。
> **★ 本次引用的事实，读的是哪一版**：工作树 `D:\wd\vibemath开发\Vibe-Mathematics`，`git rev-parse HEAD` = **`4e5be5aef28180514685a364baba405f94036bee`**，`git status --short` **为空**（工作树 == HEAD）。所有行号均由 **Node / 读文件工具**取得，**不引用 PowerShell `Get-Content` 的行数**（见 §5 反例）。

---

## 0. 结论速览

| 项 | 状态 | 一句话 |
|---|---|---|
| **A 文件类型→清单表** | ✅ | **两条边、两份清单**：`package.json#files` 管"进不进 tarball"，`installer.js PRESETS[].files` 管"装不装进 `.agent-presets/<id>/`"；**`tests/**`／`scripts/**` 进前者、永不进后者** |
| **B 豁免表形状** | ✅ 建议 | **一份共享具名表**（`{path, reason, approvedBy, approveRound, reviewRound}`）＋ **6 条反漂移自探针**（其中 3 条是新增的"把豁免变成红"的开关） |
| **C `PRESETS` 是否参与** | ✅ **参与，且不可替代** | `packs/**` 与 `extensions/**` **都在 `PRESETS[vmu].files` 里**；`tests/**`／`scripts/**` 在 **6 个预设里合计 0 条**，且**必须继续为 0** |
| **D 扩门禁的意见** | ✅ 支持，**但扩的内容要换** | 扩在 **`audit-package-membership` 这一层**；**不要**扩 verify 原提的"被 import 的路径"（**它今天已经实现了，我当场证明它会红**），应扩成 **"预设源根磁盘闭包"**（磁盘 → `files[]`） |
| **★ 本轮抓出的真缺陷** | 🔴 **3 条** | ① `PRESETS` 正在参与，但 `package.json#files` 有 **7 个仓内文件在磁盘上而两份清单都没有**；② `audit-package-membership.mjs:67` 的注释**声明了它不做的检查**（"in the installer's preset asset list"，函数里 `PRESETS` 出现 **0** 次）；③ `docs/11 §6.1 ①:218` 的"该门不扫 `vibe-math-vmu/kernel/*.js` ⇒ 新内核模块漏登记它不会红"**与今天的文件相反**（我是用真门禁跑出来的红） |

---

## A · pack 文件类型 → 必须进哪个清单（**实测**）

### A.1 两份清单是**两条不同的边**，不是同一件事的两个副本

| 清单 | 位置（本次实测） | 它管的那条边 | 谁读它 | 漏了会怎样 |
|---|---|---|---|---|
| **shipped 名册** | `package.json` 的 `files[]`（**678 条 / 677 distinct**） | **磁盘上要交付的文件 → 进 npm tarball** | npm 打包；`tests/audit-package-membership.mjs` | 干净 clone 里 `MODULE_NOT_FOUND`；读者无法复现证明 |
| **托管名册** | `installer.js` 的 `PRESETS[].files`（vmu 预设 **208 条**，路径**不带** `vibe-math-vmu/` 前缀） | **tarball 里的预设文件 → 复制进 `<presetRoot>/vibe-math-vmu/`** | `installer.js` 的复制循环（`installer.js:619`）＋ `tests/audit-installer-policy.test.mjs §8` | 文件在 tarball 里，但**永远不进预设目录** ⇒ `<=0.1.6` 目录式预设**挂不起来**（`installer.js:57-59` 的注释原文就是这个理由） |

### A.2 实测依据（`task-109` 点名的三条，逐条落读数）

| # | 声明 | 本次读数 | 命令／读法 |
|---|---|---|---|
| 1 | `installer.js` 里 `tests/` 条目 **= 0**，全文唯一一处在**注释** | ✅ **0**。含 `tests/` 的行 = **`[59]`**，且 `:59` 是 `    // preset JS imports them relatively). guard: tests/audit-math-computation-parity.mjs` —— **注释**。6 个预设的 `files` 里 `tests/` 与 `scripts/` 条目 **合计均为 0** | `D:\_tmp\vmu-pack14\census.mjs` |
| 2 | `files:` 全文 **7** 处，第 7 处 `:749` 是**状态写入键** | ✅ 7 处，行号 = **`[60,65,70,77,85,93,749]`**。`:749` = `writeState(stateFile, { version: …, files: nextFiles, updatedAt: … }, state, logger)` —— **另一种构造（写状态文件）里的同名键，不是清单条目** | 同上；`:749` 原文经 `probe5.mjs` 逐字打印 |
| 3 | 两份清单在 vmu 预设上的现状 | `vibe-math-vmu/` 前缀在 `files[]` 里 **208 条**；`PRESETS[vmu].files` **208 条**；**双向差集都为空**（`package.json 有而 PRESETS 无`＝∅，`PRESETS 有而 package.json 无`＝∅，`PRESETS 指向不存在的文件`＝∅，`files[] 指向不存在的文件`＝∅） | 同上 |
| 4 | `installer.js` 的行数（**三个计数器不一致**） | **810 行**（LF-only，`\n`=810，文件以换行结尾 ⇒ `split('\n').length`=811 是含尾空元素）。**PowerShell `Get-Content` 在本次会话里数出 800** ⇒ 行数一律用 Node 计数 | `probe5.mjs` |

### A.3 ★ 表：**文件类型 → 必须进哪个清单**

> 读法：**"必进"= 漏了有具名后果**；"—"= 该类型不在这个清单的范围内。**本表按类型写，不写易漂移的逐目录计数**（计数只在上面 A.2 以"本次读数"出现）。

| 文件类型（预设源根 `vibe-math-vmu/` 下） | `package.json#files` | `PRESETS[].files` | 依据 / 为什么 |
|---|---|---|---|
| 预设入口 `vibe-math-vmu.js` | **必进** | **必进**（写 `vibe-math-vmu.js`） | `installer.js:255` 的 runtime 三元组（`agent.cordis.yml`／`preset.yml`／`<src>.js`），§8 逐条断言 |
| 预设声明 `agent.cordis.yml`、`preset.yml` | **必进** | **必进** | 同上；DSH 在 `.agent-presets/<id>/` 里要读到它们 |
| 内核模块 `kernel/**/*.js`（含 `kernel/<面>/index.js`） | **必进** | **必进** | ①相对 import 的目标（否则装完 `MODULE_NOT_FOUND`）；②复制进预设目录 |
| 工具面 `tools/**/*.js` | **必进** | **必进** | 同内核（同一条 import 闭包） |
| **pack 代码** `packs/<id>/**/*.js` | **必进** | **必进** | ★ **静态 import 闭包看不见它**：装载器用**算出来的路径**动态 import（`vibe-math-vmu.js:734` `await import('./packs/' + wanted + '/index.js')`、`:747` `await import('./packs/' + wanted + '.js')`）⇒ **只能靠清单** |
| **pack 纯数据** `packs/<id>/**/*.json`（`prompts/sections.json`、`settings/defaults.json`、`prompts/assistant.json`） | **必进** | **必进** | 插件在**建内核之前按目录名 `readFileSync`** ⇒ 它不是 import 目标，**闭包同样看不见** |
| **pack 文档** `packs/<id>/**/*.md` | **必进** | **必进** | 同上（本次实测：这一格**今天是漏的**，见 §4.1） |
| 扩展 `extensions/**/*.js` | **必进** | **必进** | 预设运行面的一部分（本次：`extensions/domain-compliance/{index,gate}.js` 两份清单都在） |
| 宿主接缝 `host*.js` | **必进** | **必进** | 同内核 |
| `settings/**`、`glossary.json`、`math-computation.js`、`math-engines.js` | **必进** | **必进** | 构造期按名读 / 被入口 import |
| 设计卷 `docs/NN-*.md` | **必进** | **必进** | 预设自带设计文档（"每条机制可追到一条已交付的设计决定"） |
| 仓内工作稿 `docs/audit/**` | **不进（逐条具名豁免）** | **不进（逐条具名豁免）** | 仓内审计稿，不是产品；**不进就是正确状态**，但**必须具名**，否则没人分得清"故意不交付"与"忘了登记" |
| `tests/**` | **按两条规则进**（见下） | ★★ **永不进** | 本卷口径（`docs/27:199` 原文那句"托管名册只列随预设出货的运行时文件"） |
| `scripts/**` | **按需进** | ★★ **永不进** | 同上 |
| `docs/**`（仓**根**，如 `docs/release-notes/**`） | **必进** | **不进**（不在任何 `PRESETS[].src` 之下） | 不属于预设；没有前缀 ⇒ 托管名册不适用 |

**`tests/**` 进 `files[]` 的规则（实测口径，不是"全部必进"）**：
| 子规则 | 本次读数 | 依据 |
|---|---|---|
| 每个 `tests/*.mutants.mjs` 必进 | 磁盘 **35** / 已登记 **35** | `audit-package-membership.mjs:29-32` |
| 每个被守卫索引引用的 `tests/*.mjs` 必进（**除具名 `EXCLUDED` 2 条**） | 引用 **50** / 未登记 **2** ＝ 恰为 `EXCLUDED` 的两条 | `:22`、`:34-38` |
| 其余 `tests/*.mjs` | **92 条故意不交付**（开发期套件） | 上述两条规则的补集 |
| `scripts/*.mjs` | 磁盘 **27** / 已登记 **22** | 按需 |

---

## B · 豁免表形状建议

### B.1 放哪

**一份共享的纯数据模块**，被两个门禁 import：**`tests/_lib/` 下的一个 `.mjs`**（`tests/_lib/` 已在 `files[]` 里 —— 既有 `strip-comments.mjs`／`falsify.mjs` 就是这个先例）。

**为什么不是各门一张内联表**：今天同一种东西有**四处各写一份**（仓根已有：`audit-package-membership.mjs:22` 的 `EXCLUDED`；`audit-installer-policy.test.mjs:258` 的 `EXEMPT`；`tests/vmu-tools-await-rejections.test.mjs:49` 的 `EXEMPT_WITH_REASON`；`tests/vmu-tools-action-arity.test.mjs:32` 的 `EXEMPT`）。共享一份的理由不是"好看"，而是**"豁免了谁"必须能在一个地方被数清**——否则"豁免越多、门越假绿"（`docs/11 §4.2` 第九条）。

### B.2 字段（每条）

| 字段 | 形状 | 为什么必须有 |
|---|---|---|
| `path` | **精确仓内路径**，**禁止通配／禁止目录前缀** | 通配是豁免变成漂移源的**唯一**入口：一条 `docs/audit/*` 会静默吞掉此后所有审计稿 |
| `reason` | 一句话，**说"为什么它不该交付"**（不是"暂时漏了"） | 与既有先例同形（路径→理由） |
| `approvedBy` | 具名的人（Lead 或该面 owner） | "谁批的"要能追 |
| `approveRound` | 轮号（整数） | 本仓以轮计数，不用日期（日期在不同成员的本机时钟上不可比） |
| `reviewRound` | 轮号；**到期后该条由门禁在摘要里逐条报"复审到期"** | 豁免不会永久继承 |

### B.3 ★ 如何防止它变成漂移源（**6 条自探针，其中 5 条是"把豁免自己变红"的开关**）

> 这一组的形状来自 `docs/11 §4.2` 第九条：**每个"跳过／豁免"分支都必须有相反的开关或自探针能把它变红**。

| # | 探针 | 期望 |
|---|---|---|
| 1 | **去掉某条豁免**（或把该路径从磁盘上临时去掉） | **红**，且**点名那条 path** |
| 2 | 豁免一条**磁盘上已不存在**的路径 | **红**："exemption for a path that is gone" ⇒ 豁免不许比事实活得久 |
| 3 | 豁免一条**同时已在 `files[]` 里**的路径 | **红**："granted but unnecessary" ⇒ **不许用豁免盖住登记**（这条是"豁免＝漂移"的主开关） |
| 4 | 同一条 `path` 出现两次 | **红** |
| 5 | 任一条的 `reason` 为空 / `approvedBy` 为空 | **红** |
| 6 | `reviewRound` 已过 | **摘要里逐条报到期的条数**（非零即可见；是否升级为红由 Lead 裁） |

---

## C · `PRESETS` 是否参与（含 `packs/**` 与 `extensions/**` 的归属）—— **明确回答**

**参与。而且它是**唯一**会读它的清单：一个文件只进 `package.json#files` 而不进 `PRESETS[].files`，会正常进 tarball、却**永远不进 `<presetRoot>/vibe-math-vmu/`**——这是"装完能跑、预设却挂不起来"的那一类。**

| 归属 | 结论 | 本次实测读数 |
|---|---|---|
| **`packs/**`** | ★ **进 `PRESETS`**。理由不只是"它在预设目录里"，而是**结构性的**：装载器在运行期用**算出来的路径**动态 import（`vibe-math-vmu.js:734/747`），而 pack 的纯数据是**按目录名 `readFileSync`** ⇒ **没有任何静态分析能替它保证"装运"**，只有清单能 | `packs/**/*.js` **15** 条、`packs/**/*.json` **3** 条、`packs/**/*.md` **1** 条（**这一条今天在两份清单之外**）——`packs/**/*.js` 与 `*.json` 两份清单都在 |
| **`extensions/**`** | ★ **进 `PRESETS`**。扩展模块是预设运行面的一部分（本次两份清单各 **2** 条：`extensions/domain-compliance/index.js`、`gate.js`） | 双向差集均为 ∅ |
| **`tests/**`、`scripts/**`** | ★★ **不进 `PRESETS`，且必须继续为 0**。它们不是预设资产；把它们拖进托管名册会同时破坏三条已成立的不变量：①"预设目录 == 已安装包"（§8 与备份策略的判据）；②删除策略（"本包不再出货的预设要删掉"）；③原子的"同版本 no-op"承诺 | **6 个预设合计 `tests/` = 0、`scripts/` = 0** |

---

## D · 我的意见：**支持扩门禁，扩在 `audit-package-membership` 这一层；但扩的内容要换**

### D.1 先说一条**否证**：verify 原提的那条"被 shipped 模块 import 的路径必须在 `files[]`"**今天已经实现了，而且有牙**

我**没有改任何文件**，只把 `package.json` 的副本放进 `D:\_tmp` 并用该门自己支持的 `PACKAGE_JSON` 环境变量指过去（**这正是 `tests/audit-package-membership.mutants.mjs` 的既有手法**）：

| 运行 | 命令 | 读数 |
|---|---|---|
| 基线 | `node tests/audit-package-membership.mjs` | `=== PACKAGE MEMBERSHIP: 13 passed, 0 failed ===` **EXIT=0** |
| 种违规 | 从副本里**只删** `vibe-math-vmu/kernel/meetingmarker.js`，`PACKAGE_JSON=<副本>` 再跑 | `=== PACKAGE MEMBERSHIP: 12 passed, 1 failed ===` **EXIT=1**，**具名**：`every relative import inside the vmu package is shipped (no MODULE_NOT_FOUND class) — vibe-math-vmu\kernel\meetings.js -> ./meetingmarker.js` |
| 删 | 回到基线 | 绿（上一行即同一次运行） |

⇒ **该门 `:63-132` 的 import 闭包已经覆盖了 verify 描述的形态**，而且**具名到"谁 import 了它"**。所以**再加一条同样内容的规则是复制，不是补洞**。

### D.2 真正的洞在哪：**"磁盘上有、但没有任何 import 指向它"的出货文件**

| 类型 | 静态 import 闭包看得见吗 | 今天有门禁吗 |
|---|---|---|
| `kernel/**/*.js`（被 statement-position import） | ✅ 看得见 | ✅ 有（实测会红） |
| `packs/**/*.js` | ❌ **看不见**（装载器算路径动态 import，`:734/747`） | ❌ 无 |
| `packs/**/*.json`、`packs/**/*.md` | ❌ 看不见（按目录名 readFileSync） | ❌ 无 |
| `docs/**/*.md`（非 `^\d\d-…\.md$` 形态） | ❌ 看不见 | ❌ 无 |

**本次实测的存量（7 条）**：`vibe-math-vmu/docs/audit/` 下 6 份审计稿 ＋ `vibe-math-vmu/packs/example-data/README.md` —— **磁盘上有、`files[]` 没有、`PRESETS` 没有、没有任何门禁会报**。前 6 条**大概是"故意不交付"**（这正是它们该进豁免表的原因）；**第 7 条不是**：它 844 字节、内容正是"这个文件夹是什么、要照抄哪两个例子"，而它所在的 `packs/example-data/` 是会出货的（`prompts/sections.json` 两份清单都在）⇒ **打包后读者打开这个 pack，看不到那句解释**。

### D.3 建议的形状（**扩的是这一条**）

> 给 `audit-package-membership.mjs` 加一条：**对每个 `PRESETS[].src` 源根，磁盘上每个文件都必须在 `package.json#files`（写作 `<src>/<相对路径>`）里，或在**具名豁免表**里。**

- **为什么是这一层**：`package.json#files` 是**所有下游派生的来源**（`audit-installer-policy §8` 的输入集就是从它过滤出来的，见 D.4）；而"预设源根下有哪些文件"**本来就是这个门的事**——它**今天已经在 `readdirSync` 同一个目录树的 `docs/`**（`:56-59` 的设计卷规则）。
- **为什么不是新门**：这**不是一个新的不变量的所有者**，它是同一份清单（`files[]`）的**另一条边**（现在是"被 import 的"与"设计卷"，要补的是"被出货的"）。新门会让同一条边出现两个判据点（`docs/11 §4.2` 第十四条：**登记与判据必须同改**，同一不变量的判据副本越少越好）。
- **成本**：**≤ 25 行**（复用一次目录 walk ＋ 集合差 ＋ 一次豁免表查表），比 verify 估的 20–30 行同量级。
- **★ 不要**把 `PRESETS` 的检查塞进这个门。那条边（`files[] → PRESETS`）**已经由 `audit-installer-policy §8` 拥有且已经绿**；一个事实一个门（Lead 轮 13 的"`measure` 与 `source` 要一致"）。

### D.4 ★ "两个门禁各只抓一半" —— **本轮机械复现**

| 种下的违规 | `audit-package-membership` | `audit-installer-policy §8` |
|---|---|---|
| 从 `package.json#files` 删 `vibe-math-vmu/kernel/meetingmarker.js` | 🔴 **红并具名**（**真门禁跑的**，见 D.1） | 🟢 **绿**（我按 `:251-261` 逐行复制判据复算：它拿 `pkg.files` 过滤出 `vibe-math-vmu/` 前缀集 ⇒ **`files[]` 里没有的东西永远进不了它的输入集**） |
| 从 `PRESETS[vmu].files` 删 `kernel/meetingmarker.js`（`files[]` 不动） | 🟢 **绿**（该门全文 **`PRESETS` 出现 0 次**，`readFileSync` 目标里**没有 `installer.js`**） | 🔴 **红并具名**（判据逐行复制复算）。★ **真套件会同一条断言上打印**：label ＝ `` vibe-math-vmu: every shipped file is managed or explicitly exempt ``（`:260`），detail ＝ `kernel/meetingmarker.js`（`:259` 的 `unmanaged`） |

⇒ **一次修复永远不能让两个门同时变绿**：修完一处，另一处才红。**这就是 R10／R11"同型遗漏、各只抓一半"的机制**，不是两次偶然。
（诚实标注：第 1 行是真门禁实跑；第 2 行的 §8 一格是**逐行复制判据的复算**，不是跑那个套件——跑它需要改 `installer.js` 的 `PRESETS`，而 `installer.js` **不在我本轮的写范围**，且本轮明令不改门禁。）

### D.5 判据（扩后必须同时满足；★ 为我新增的）

| # | 判据 |
|---|---|
| (a) | 种一个"**被 import 但未登记**"的临时文件 ⇒ **红**（**今天已成立**，D.1 实测） |
| (b) | 删 ⇒ **绿**（**今天已成立**，D.1 基线） |
| (c) | 豁免表**逐条带理由**，且 §B.3 的 6 条自探针全绿 |
| (d) | **不把 `tests/`／`scripts/` 拖进 `PRESETS`**（今天 6 预设合计 0；扩后的检查**只扫 `PRESETS[].src` 根**，这些根本身不含 `tests/`／`scripts/`） |
| (e) ★ | 种一个 **`packs/<id>/` 下的纯数据文件**（`.json`／`.md`，**没有任何 import 指向它**）而未登记 ⇒ **必须红**（这是今天两门都看不见的形态，也是 D.2 的结构性盲点） |
| (f) ★ | 豁免表里一条**指向不存在的文件** ⇒ **红** |
| (g) ★ | 豁免表里一条**同时也已登记** ⇒ **红** |
| (h) ★（低优先，可选） | `files[]` 里**重复条目** ⇒ 红／或至少报数。**今天真有 1 条**：`tests/_lib/strip-comments.mjs` 出现 2 次（678 → 677 distinct） |

### D.6 ★ 同轮抓到的两条"声明了没生效／声明与事实相反"（本仓反复抓的那一类）

| # | 声明在哪 | 声明是什么 | 事实（本次读数） |
|---|---|---|---|
| ① | `tests/audit-package-membership.mjs:67`（同一门 **import 闭包** 的注释） | "…require the target file to be listed in `package.json#files` **(and, for runtime modules, in the installer's preset asset list)**" | **假的半句**：该文件全文 **`PRESETS` 出现 0 次**，`readFileSync` 目标只有 PKG／`docs/AUDIT-CHECKLIST.md`／被 walk 的源码；`:127` 只比较 `listed`。⇒ 若照注释信它，就会以为 `installer.js` 的清单被守住了 |
| ② | `vibe-math-vmu/docs/11-gates-and-development.md:218`（§6.1 ①） | "★ 该门**只抓** `tests/*.mutants.mjs` 与'守卫索引引用的测试文件'，**不扫 `vibe-math-vmu/kernel/*.js`** ⇒ 新内核模块漏登记**它不会红**（R10／R11 正是这样过去的）" | **与今天的文件相反**：`:75-84` 的 `walk(VMU, 0)` 就是扫 `vibe-math-vmu/**`；我**用真门禁**证明删一个 kernel 模块的登记会**红并具名**（D.1）。⇒ **"R10／R11 是这样过去的"这个归因，按当前文件不成立**（**读的是 `4e5be5a` 工作树**；不排除历史上某一版确实如此，但 §6.1 是 2026-10-15 写的，而闭包的注释点名了轮 3/4/7） |

> ★ **这两条的处置人不该是我**：① 在 `tests/audit-package-membership.mjs`（门的文件，owner＝`vmu-verify2`）；② 在 `docs/11`（**不在我的写范围**）。按 `docs/11 §4.2` 第十三条（**更正一条声明，就要改掉那条声明**），扩门禁那一轮必须**同轮改掉 `:67` 的注释**，并把 `§6.1 ①` 的证据列改成今天的实测。

---

## 5. 我自己踩到并纠正的两次测量假象（按 `docs/11 §4.2` 第八条记录）

1. **PowerShell `ConvertFrom-Json` 把 `package.json` 读成 `tests/*.mjs listed = 0`**（UTF-8 无 BOM ＋ 非 ASCII 文档，PS 5.1 按 ANSI 读 ⇒ 解析失败只是 stderr，`$pkg` 却是 `$null` ⇒ 所有 `Contains()` 返回 false）。**差点据此写"`tests/**` 根本不进 `files[]`"**——那是**相反**的结论。改用 **Node 重测**得真值：`tests/*.mjs` 磁盘 368／已登记 276。
2. **`installer.js` 行数四值不一致 —— 已定案**：PowerShell `Get-Content`（与 `-Raw` ＋ `[regex]::Matches`）数出 **800**、读文件工具 **810**、Node `split('\n').length` **811**。**真值＝810 行**：Node `readFileSync` 与 PowerShell `[System.IO.File]::ReadAllBytes` **字节级一致** —— 都是 `55001` 字节、LF＝`810`、MD5＝`f453ae3a4228da66968e2b67504c51e2`；`[System.IO.File]::ReadAllText` 也是 `splitLF=811`。⇒ ★ **是 `Get-Content` 这个 cmdlet 少了 10 行**（同一个文件、同一个进程里，`.NET File` API 与它不一致）⇒ **行数一律用 Node 或 `[System.IO.File]`，不用 `Get-Content`**。本报告的**行号**（`installer.js:59/60/93/749`、`audit-package-membership.mjs:22/63/67/127`、`audit-installer-policy.test.mjs:251/254/255/258/260`、`vibe-math-vmu.js:734/747`、`docs/11:218`）**由 Node 逐条复核过**（`D:\_tmp\vmu-pack14\citations.mjs`）。
   ★ 本次因此**改掉了我自己的一处误引**：D.4 第二行原先写成 `vibe-math-vmu: shipped-but-unmanaged -> …` —— **那是我复算脚本自己合成的字串，不是门的措辞**（门的 label 见 `:260`）。已按真措辞更正。

---

## 6. 本轮改了什么／没改什么

| 动作 | 文件 | 说明 |
|---|---|---|
| ✍️ 写 | `_handoff/vmu/pack-round14-report.md` | 本报告 |
| ✍️ 写 | `Vibe-Mathematics/vibe-math-vmu/docs/27-pack-folder.md` §6 | 把"两处名册"扩成**权威表**（文件类型→清单）＋豁免表形状＋`PRESETS` 归属＋门禁应扩在哪一层 |
| ✍️ 写 | `Vibe-Mathematics/vibe-math-vmu/docs/10-packs.md` §2 | 一句指针：文件的**交付面**归 `docs/27 §6`（本卷只讲 pack 接口形状） |
| ❌ **没改** | `tests/**`、`scripts/**`、`installer.js`、`package.json`、`docs/11` | 本轮"**只出结论与表，不改门禁**"；门禁 owner＝`vmu-verify2` |
| ❌ **没跑** | 全量 T0/T1、`regen-all`、`git` | 纪律 |
| ▶️ **只跑了 1 个门** | `node tests/audit-package-membership.mjs`（基线 13/0 ＋ 一次 `D:\_tmp` 副本上的种违规 12/1） | **单个门**，不是 T0/T1；读的是 `4e5be5a` 工作树 |

---

## 7. 交回 Lead／`vmu-verify2`

1. **给 `vmu-verify2`（门 owner）**：**建议扩在 `audit-package-membership` 这一层**，但把规则从"被 import 的路径"换成 **"预设源根磁盘闭包"**（D.2／D.3）——**原提案的那条今天已经实现且有牙（D.1 实测红）**；并**同轮改掉 `:67` 的假注释**（D.6 ①）。
2. **给 Lead**：`docs/11 §6.1 ①:218` 的"只抓一半"证据列**需要按今天的实测改**（它的归因与当前文件相反，D.6 ②）——`docs/11` **不在我写范围**，请派给它的 owner。
3. **未决项（具名，不静默）**：`vibe-math-vmu/docs/audit/` 下 6 份审计稿与 `vibe-math-vmu/packs/example-data/README.md` 共 **7 个**仓内文件在两份清单之外。前 6 份**建议豁免（具名、带理由）**；**第 7 份建议登记出货**（它解释的那句"这个文件夹是什么"应在打包后仍可读）。**处置人未定**——这需要 Lead 裁，我本轮不改清单。
4. **边界**：`§8` 那一格的"红"是**逐行复制判据的复算**，不是跑套件（跑它要改 `installer.js` 的 `PRESETS`，超出本轮范围）；`docs/27`／`docs/10` 的正文改动**不影响 `update-doc-counts.mjs` 的目标行**（该脚本只重写 `docs/11` 的 shipped 计数行、`docs/test-timing.md`、`docs/AUDIT-CHECKLIST.md`——见其 `:81-87`），但**轮末仍请按既有次序走一次生成器**。

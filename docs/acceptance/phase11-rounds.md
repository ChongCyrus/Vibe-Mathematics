# Phase 11 —— 长期目标（四项）＋ 近期目标（六项）的执行台账

> ★ **本文档是【历史记录】，不改写。** ★ 其中出现的计数都标着「**写此台账时**」——★ **它们不是永久宣称**，★ 读当前值请跑 §0 的命令。
> ★ 判定口径：★ **"绿"必须能指向命令输出**；★ **"没测"一律写成"没测"**，★ **不写成"没问题"**。

## §0 怎么复核

```bash
node scripts/preflight.mjs                  # T0 预检
GATE_SCOPE=vmu node tests/run-tests.mjs     # T1 全量门禁（套件＋探针）
node tests/run-tests.mjs --counts           # ★ 作业计数的权威来源
node scripts/regen-all.mjs --check          # 派生面是否同步
node scripts/check-docs.mjs                 # 文档 lint
node tests/audit-doc-line-refs.test.mjs     # ★ 文档里的 file:line 引用是否仍指向存在的行（本阶段把 docs-landed 纳入）
node scripts/slv-inspect.mjs --selftest     # ★ 真机判据工具自身的正反自检
node scripts/slv-inspect.mjs <session>      # 真机：块与 wire、unknown calls、计数一致性
```

★ **本阶段末（写此台账时）的读数**：★ **T1 = 397 PASS / 0 FAIL（333 套件 ＋ 64 探针）**；★ `regen` **16/16 in sync**；★ `check-docs` **PASS**；★ `preflight` **PASS**；★ `slv-inspect --selftest` **0 failed**。

---

## §1 目标 5 —— 真机复验：**完成（判据达成）**

★★ **为什么它排第一**：★ 上一次真机跑发生在 `c064947c` 之前，★ 其后代码改了约 8 处 ⇒ ★ **目标 6/7 的结论当时挂在旧代码上**。

### §1.1 两次真机跑

| ★ | ★ 打包时 HEAD | ★ 结果 |
|---|---|---|
| 第一次 | `a38303d1` | ★ **7/8 通过**；★ 唯一 RED 是模型调了**不存在的** `vibe_vmu_motion` ⇒ ★ 查到它在 docs 六处都标着「未实现/规划」⇒ ★ **是幻觉，不是缺陷** |
| 第二次（干净剧本） | `377bc3e7` | ★★ **主 run 内拿到 `cast:true`**；★ **成员自己调 `vibe_v5_paper`**；★ **零幻觉调用**；★ `UNKNOWN_FIELD`／`NO_OPEN_MEETING`／`INVALID_ARGUMENT` **全 0** |

★ **判据逐条**（★ 第二次跑）：★ `cast:true` ✓（★ `for:["member"]`、`eligible:["member"]`、`missing:[]`）；★ `slv-inspect` **0 RED** ✓（★ 修掉工具自身假红后，见 §3）；★ 四类错误 0 ✓。

### §1.2 ★★★ 而它证明了一件事：**"真机绿"与"没被走到的路径"是两回事**

★ 本阶段真机跑**从未 uninstall** ⇒ ★ **`host.js` 里两个 disposer 缺陷在真机上永远看不见**（★ 见 §4.2）。★ 所以本阶段的结论是：
- ★ **判据（cast/0RED/四类错误）已达成** —— ★ 这是可验证的
- ★ **不宣称"真机全部路径都验过"** —— ★ 有几条路径**真机没走到**，见 §5

---

## §2 目标 6 —— `bus.emit` 重入守卫 ＋ 修正安全论证：**完成**

★ **修前实测**：★ 挂在某钩子上的条目在自己 handler 里 `emit` **同一钩子** ⇒ **总线重入**，★ 探针跑到**嵌套 31 层仍在继续**（★ 只因探针自设上限才停），★ 而 `emit` 回执仍是 `ok:true, decisions:0`。

★★ **我自己的第一版是错的**：用**模块级 Set** 标记整个 `emit` 期间 ⇒ ★ **把两次【并发】的 emit 当成递归**（★ `vmu-metrics-counter` 精确地做了这件事并变红）。★ 修法：**`AsyncLocalStorage`**，标记只在 **handler 执行期间**、**只在该异步链**。

★ **三条行为全有断言**（`vmu-bus` 54/0）：★ **同钩子重入 ⇒ `VMU_MIDDLEWARE_REENTRANT`，handler 只跑 1 次**；★ **嵌套不同钩子仍允许**（`v5r.stall-meeting` 的路径）；★ **同钩子两次并发都执行**。

★★ 并修正了 `kernel/index.js` 里那句**论证比授权窄**的安全说明（★ 原文只论证 `rewriteOf`，而授权的是整套 bus）。

---

## §3 目标 7 —— `docs-landed` 与现实不符 ＋ 无门禁：**完成**

1. ★★ **纳入门禁**：`docs-landed` 在 `package.json#files` 里（发货给使用者），★ **而 `check-docs`／`audit-doc-line-refs` 都不扫它** ⇒ 漂移永远抓不到。★ **先量后加**：★ **134 条 `file:line`、`0 not-found`、1 条 basename 歧义** ⇒ ★ 加进 `DOC_ROOTS` **零修复通过**，覆盖从 3042 → **3176** 条引用。
2. ★★ **两处"绝对覆盖宣称"加上时点**：★ `00-README §4.1` 的「103/103 **全部**」与 `05-known-debt` 的「103/103（100%）」—— ★ 当前派生是 **104 个模块**，★ 那张表没有第 104 个的位置 ⇒ ★ 现在都写「**定稿时**」并明说"**它不说明今天 104 个都有人看过**"。
3. ★★ **快照声明补上机制清单的归属**：★ **本目录不承担"当前有哪些机制/用法/能力"** —— 那是 `vibe-math-vmu/docs/`（03/05/18/26）的职责。

---

## §4 目标 2/3 —— 本阶段缴获并修复的缺陷

### §4.1 真机带出：`vibe_vmu_turn members:["member"]` 回答"没有成员"

★ **对一所有成员的机构说没有成员**。★ 根因：显式 `members` 会赢，而内核读 `m.id`，字符串读不到 ⇒ `ids=[]`。
★ **修**：★ 非空字符串规范化成 `{id}`；★ 合格 `{id,role}` 原样通过；★ **其它形状具名 `VMU_INVALID_ARGUMENT`**；★ 缺省仍从名册推断。
★★ **而我的第一版断言是假绿**：★ 用了 `op:'run'`（不是合法 op）⇒ ★ 那条"拒绝"是因为未知 op 才通过的。★ 改成 `op:'step'` 后两条"正"的断言**真的红了** —— 这才是有效断言。★ **反转验证**：★ 去掉规范化 ⇒ 1 failed。

### §4.2 `host.js` 的两个 disposer 缺陷（★ 由"补缺失覆盖"抓出）

★★ **前提**：★ 全仓**没有任何测试**提到 `onDisposed` / `onDisposeMode` / `keepOn`。

| ★ | ★ 缺陷 | ★ 后果 |
|---|---|---|
| ① | `onDisposed` 在 `disposers` 上算，**而那里也装着每个工具的 `dispose`** | ★ host 不给句柄时仍报 `onDisposed:1, 'disposed-here'` ⇒ ★ **`host-managed` 分支不可达** |
| ② | **监听在构造期挂一次，而 `uninstall()` 把它们 dispose 了** | ★ `install → uninstall → install` **工具全回来、钩子一个不回来** ⇒ ★ **同源块与信箱通知静默消失**，★ 而回执说 `installed:true` |

★★★ **我自己的两次修法也是错的**（★ 探针抓的）：★ 用 `listenerDisposers.length === 0` 判重挂 ⇒ ★ **host 不给句柄时该数组永远为空** ⇒ **监听翻倍（2→4）**；★ 只修一条卸载路径 ⇒ 重装仍不挂。★ **最终用独立布尔 `listenersAttached`**。

### §4.3 primitive 会议 `close()` 后仍留在名叫 "live" 的表里

★ **探针三个后果**：★ `liveMeeting(id)` 仍返回它；★ `liveList().meetings` 仍列它；★ **同一 id 永远无法重用**（★ 且拒的理由说 "a live meeting already uses id" —— **它已不是 live**）。
★ **兄弟登记处早就这么做**（`kernel/meetings.js` 的 `live.delete(m.id)`）⇒ ★ **两个登记处对 "live" 的定义不一致才是缺陷**。
★ **修**：★ 内核在注册处给 `close` 加装饰，成功关闭即移出。★ **信息不丢**：★ append-only 审计里仍有 `record('closed', …)`。

### §4.4 `slv-inspect` 对每个 root 会话报假红

★★ **根因**：★ **root 没有同源块是设计如此** —— `host.js` 里 `if (!member && !Array.isArray(stickyAllow)) return out`，★ 而 root 的 agent id 以 `session-` 开头 ⇒ ★ 两样都不满足 ⇒ **提前返回**。★ 块回答的是"**这一回合你这个【席】能调什么**"，★ **root 没有席**。
★★ **而工具把"没有块"当证据**：★ 无块时退回 pack 静态清单做差集 ⇒ **root 的 84 个工具全被报"未在提示词里命名"**。
★★★ **而且工具自身不一致**：★ `sameSourceMismatch` **已带 `member` 条件**，★ `red` **没带** ⇒ 判定与打印打架。★ 现在一个布尔 `blockIsAuthority` **同时驱动两者**。
★ **这是收紧不是放水**：★ 真有块且不一致 ⇒ **仍 RED**；★ `--selftest` 正反都过；★ 对真机那次 session 重跑 ⇒ **`0 with RED checks`**。

---

## §5 未覆盖 / 未做（★ 如实留白，不写成"没问题"）

| ★ | ★ 项 | ★ 状态 |
|---|---|---|
| ★★ | **`motion-box`／`stall-meeting` 的真机触发路径** | ★ **有专门套件**（单元层覆盖），★ 但**真机两次跑都没有 `control/idle` 路径** ⇒ ★ **真机未验** |
| ★★ | **`close.enforced`** | ★ 第二次跑只走 v5 poll，★ 没有 primitive close ⇒ **真机未验** |
| ★★★ | **目标 8：脚本桥是否暴露给中间件** | ★ **需用户裁定**（两条路各有代价，见目标原文）★ **本阶段未动手** |
| ★★ | **目标 9：四个覆盖边界** | ★ A2/A3 未重扫、F2 只覆盖显式调用样例、C4 只判字符串出现、C3 抽 20 键 —— ★ **"没看那么细"，不是"看了有问题"** |
| ★★★ | **v3 pack ↔ v5r pack 能力对齐** | ★ **用户已裁定不开展**，★ 记为**已知未覆盖** |

---

## §6 本阶段结论与边界

### §6.1 结论

1. ★★★ **真机判据达成**：★ `cast:true`（主 run）、★ `slv-inspect` 0 RED、★ 四类错误 0、★ 票权强制未误伤 v5r、★ 成员自己用工具
2. ★★★ **六条真缺陷被修**（★ §4.1–§4.4 中的六项），★ **每条都有反证或断言**，★ 且**四条是"我自己的修正本身有问题"**（★ 重入守卫的 Set、members 断言的 `op:'run'`、disposer 的数组判据、`slv-inspect` 的假红）
3. ★★★ **文档与门禁的两处结构性缺口补上**：★ `docs-landed` 进 `audit-doc-line-refs`；★ `docs/05` 写清"三种关系"与"总线可被程序调控"
4. ★★ **总纪律的实证**：★ 本阶段每一条"已修"都能指到 `文件:行` 或命令输出；★ 每一条"未验"都写成了"未验"

### §6.2 边界（★ 不宣称的部分）

★ **不宣称"vmu 没有缺陷了"** —— ★ 本阶段证明的是：★ **被扫到的九类里代码类新缺陷在收敛**，★ **而"补覆盖"本身还能挖出新缺陷**（★ §4.2 就是补覆盖挖出来的）。★ 所以正确说法是：**已知类别的已知成员都已修并有守门**；★ **未知类别仍然未知**。
★ **不宣称"真机所有路径都验过"** —— ★ §5 列了三项真机未走到的路径。
★ **不宣称目标 8 有结论** —— ★ 它是**设计决定**，★ 需要裁定。

---

## §7 第 2–4 轮补记：真机两次收尾、两条真缺陷、以及 A3 从"未知"到"具名债务"

### §7.1 真机复验的收尾（★ 判据全部达成）

★ **第二次干净跑**（★ 打包 `HEAD` = `377bc3e7`）：★ **主 run 内拿到 `cast:true`**（★ 不是补跑）、★ **成员自己调 `vibe_v5_paper`**、★ **零幻觉调用**、★ `UNKNOWN_FIELD`／`NO_OPEN_MEETING`／`INVALID_ARGUMENT` **全 0**。

★★ **第三次跑只验一条路径**（★ 打包 `HEAD` = `197d5245`）：★ **`control/idle` ⇒ `v5r.stall-meeting` 开会**，★ **正反都成立**：
- ★ 正面：★ beat #2 `idle.emitted: true`、★ `elapsedMs: 16764` / `afterMs: 3000` ⇒ ★ 会议列表从空变 `[{id:"m1", state:"open"}]`、★ `summary` 的 `kind: "stall"`
- ★ 反面：★ 把 `vmu.control.idleAfterMs` 设 **0** ⇒ ★ 同样等待报 `idleness is not defined`、★ **没有新会议** ⇒ ★ **触发确实来自这条策略**

★★★ **这一跑补上了"目标 5 达成"里唯一空着的一块** —— ★ 此前两次真机**从未走过 `control/idle`**，★ 而两个中间件（`stall-meeting`、`motion-box`）**只有单元覆盖、没有真机覆盖**。

### §7.2 真机带出的两条真缺陷（★ 都已修）

| ★ | ★ 缺陷 | ★ 修法 |
|---|---|---|
| ★★ | **`beat()` 对 `control/idle` 上跑过的中间件完全失明** —— ★ 真机里 `emitted: true` 且 `m1` 开了，★ 回执却说 `middleware: 0` | ★ `bus.emit` 返回 **`ran`**、★ `trace` 增 `observed` 行、★ `beat()` 增 **`idle.middlewareRan`／`idle.middleware`** |
| ★★ | **策略召集的会议无法说明"为什么"** —— ★ `stall-meeting` 算了 `reason` 并返回，★ 而 `meetings.open()` **没有这个参数** ⇒ ★ 原因在调用方与记录之间丢掉 | ★ `open({reason})` ＋ 记录在会议 ＋ `summary`／`meetingView` 露出 |

### §7.3 ★★★ 而第 7.2 的第一条，★ 我最初的因果判断是【错】的 —— 已更正

★ 我当时写：★ **"因为副作用型策略返回 `undefined`"**。★ **实测推翻**：★ `v5r.stall-meeting` **返回的是决策对象**（`{ok:true, convened:true, stallAfterMs, meetingId, reason}`）⇒ ★ **它本来就会被数到**。
★★ **真凶只有两条**：★ **回执数的是 `control/heartbeat`（策略挂在 `control/idle`）** ＋ ★ **`idleState` 丢了 emit 结果**。
★★★ **`docs/05` 里已把这条更正连同"推翻它的测量"一起写上** —— ★ **没有被悄悄抹掉**。

### §7.4 A3（★ 从"67 个未知"到"67 条具名债务 ＋ 永不增长的守门"）

★ 量的结果：★ **扫描式门禁 121 个**，★ **54 个有自证**（`--selftest` 39 ＋ `.mutants.mjs` 15），★ **67 个两个都没有**。
★★ 新增 `tests/audit-scanner-selfproof.test.mjs`：★ **不假装 67 条已修**，★ 而是
- ★ **新出现的无自证 `audit-*` ⇒ 红**（债务不许变大）
- ★ **已自证却仍在名单 ⇒ 红**（陈旧豁免是谎言）
- ★ 三类计数**全部从文件系统派生**，★ 没有手抄
★★★ 而它**第一次跑就在自己身上抓到三个缺陷**：★ 找 mutant 的拼写漏了 5 个、★ 注释里提到 `--selftest` 就算自证、★ 修完仍被检测器自己的正则字面量匹配 —— ★ **三个都是"跑一下才发现"**。

### §7.5 元教训

★ 本阶段累计修的 **8 条真缺陷里 5 条是"我的判断或修正本身错"**，★ 加上新门禁自己的 3 个，★ **共 8 次**。★ 完整表与操作规则见 `review-classes.md §7`。
★★★ **一句话**：★ **判据不该是"我读懂了"，★ 而该是"我让它跑过，并且它红过一次"。**
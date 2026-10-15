# Round 5 · `task-36` 交账（F43–F47 复核 · 无句柄 sleep 落地 · captureStdoutBytes · 文档）

**负责人**：`v5r-reader-b`。**判据**：`05-framework-strength-evidence.md` F43–F47 组 ＋ task-36。
**纪律**：不跑全量 sweep、不 `regen-all`、不 git；临时文件只在 `D:\_tmp`（已删）；内容型批量改写只用 Node。

---

## A. F43–F47 复核（**代码里再证一次**；结论已发 vmu-verify）

| 条目 | 本轮判定 | 关键 `file:line`（本轮实测复读） |
|---|---|---|
| **F43** settle 判据三元组 | **具备** | `kernel/lean.js:424` `hashUnchanged = before!==undefined && after!==undefined && before===after`（`before` 读于 `:345`、`after` 读于 `:422`）；`:428` `passed = exitCode===0 && hashUnchanged===true`；`:429` `state = passed?'settled':'failed'`；第三元 `contextHash`：镜像 `:319`（由 `contextHashOf :300-302` 从 `[command, args(去文件名), cwd]` 派生）、恢复 `:602` 算 `ctxSame`、`:651` 采纳要求"exit 0 ＋ hashUnchanged ＋ 回执 ＋ ctxSame ＋ contentMatches"全真 |
| **F44** 一次性公告＋长期查询 | **具备（本面）** | 一次性：`pushNotice :215`（上限 `LEAN_NOTICE_MAX=20` `:72`、溢出 `droppedNotices++ :217`）、**`takeNoticesFor(member) :219` 取出即移除**、`noticesView :227` 只读；push 点三处：去重 `:369`／超时 `:417`／结算通过或失败 `:443`。长期查询：`status(jobId) :500`、`mirrors() :762`、磁盘 `Formal/Jobs/<jobId>.json`（`writeMirror`／`LEAN_JOB_SCHEMA :78`）。**残余 closed-by**：公告**注入下一次提示词**＝core 转回合管线（它调 `takeNoticesFor(member)`）；本面不实现提示词注入 |
| **F45** 去重与 settle 同源 | **具备（形式化面）** | **同一个函数**：`dedupeKeyOf :307` ＝ `sha256(contentHash + '|' + contextHashOf(file))`，而 `contextHashOf :300` **就是** settle/恢复复核的那一个；settle 的另一事实 `hashUnchanged` 来自 `:424` ⇒ 去重键＝settle 要复核的两个事实，**结构上不可能漂移**。落点：镜像 `:322` 带 `dedupeKey`；`runOne :349-370` 先查内存 `:353`、再查镜像 `:358`，命中即 `deduped:true`／`dedupedOf` 落定（`:364/:369`）且**不 spawn**。**具名差异**：计算面（`kernel/mathjobs.js`）**故意**不做内容去重（每次运行必须有自己的回执），只有同 id 才拒 `VMU_MATH_JOB_ID_TAKEN` |
| **F46** 外部工具解析顺序可观测 | **具备（未改）** | `kernel/mathadapters.js:139` `PY_CANDIDATES=['python3','python','py']` 顺序显式；`:396` 顺序解析、显式配置优先且失败即具名拒（绝不回退）；解析全经注入 `resolveExecutable`（`:398` 缺它即拒）——"装了但不在 PATH"由宿主报告 |
| **F47** 能力探测＋两步安装＋审计 | **具备（未改）** | `probe() :471` 逐库报 installed/version，缺库给 `next.kind:'agent-install'` ＋ 命令（`:59/65/71/77`）；执行面＝共享模块 `op:'probe'`→`op:'run'`；安装＝`op:'install'` 的 plan→planToken→confirm 两步；审计＝`shapeContract() :718` 回显 `installCommand` 等 ＋ 键面可被设置审计发现 |

---

## B. `math-computation.js:616/727` 无句柄 sleep —— **落到 `docs/11` 的具名豁免**（Lead 已授权 ✓）

**选的是"豁免"而不是"接缝"，理由是实测级的**（已获 Lead 授权）：① 该文件是**四份逐字节相同副本**之一（D-10），本仓只有一份在写范围内 ⇒ 单改会**让协议分叉**；② 对照门禁现在含一条**冻结的字节哈希断言**（canonical 快照），单改一份会**直接打红**它；③ "宿主契约加 timer 槽位"本身是**跨预设接口变更**（须 4 份同改 ＋ 快照刷新）⇒ 属下一轮协调项。

**已写入**：`docs/11-gates-and-development.md` **新增一节**（Lead 授权"只加那一节"）——
`### 11.ap 门禁豁免：**（共享模块）两处退避 sleep**（★ 轮 R5 登记 ✓）`，内容＝你批准的那张表 ＋ 三条"为什么不加接缝" ＋ 重测命令。表内给的上界：

- 站点：`:616` 版本探测退避 / `:727` 包预检退避（`await new Promise(r => setTimeout(r, 250 + i*400))`）；
- **有界**：循环 ≤3 次 ⇒ **单站点 ≤650 ms、整段 ≈1.8 s/引擎**；
- **不持锁、不持进程、不跨调用**（无可泄漏资源），且**只在 spawn 已失败后**才走到；
- **可证伪面**：`node tests/vmu-activity-timers.test.mjs`（§1 的分类行与 §5 探针**故意保持红**，它就是这条边界的证据；哪天四份副本一起加接缝，**该分类行与本节必须同时删除**）。

> **一处需要 Lead/verify 知悉的偏差（我按"只加一节"的最小侵入处理）**：授权的标题是 `### 11.ad …`，但 `docs/11` **已有** `### 11.ad 巡检：守卫"声称 vs 实做"`（★ 轮 537）⇒ 直接使用会**重复字母**。我把本节顺延为 **`11.ap`**（该族当前最大字母是 `11.ao`），标题内注明"`11.ad` 已被占用，本节顺延为 `11.ap`"；**内容与表格与授权件逐字一致**，**没有改 §11 的其它行、没有改任何分类表**。（过程中一次误操作删掉了 `11.ac` 的标题行，已在同一轮脚本里**原位恢复**并复核标题顺序：`11.ab → 11.ac → 11.ad → … → 11.ao → 11.ap`。）

---

## C. `vmu.math.captureStdoutBytes` 的第二个读者/默认（**写实 ＋ 顺手修一处真实不一致**）

- **两个读者**：`kernel/mathjobs.js:363`（作业面：`tail()` 截断 stdout/stderr，`:505/:506`）与 `kernel/lean.js:166`（F17 的 per-stream 上限）。
- **一处真实不一致（本轮已修）**：mathjobs 的**本地缺席值曾是 20000**，而 schema 的 `def` 是 **65536**、Lean 面用 `LEAN_OUTPUT_MAX_BYTES = 64*1024` ⇒ **一个键两个默认**。已把 mathjobs 对齐为 **65536**（`kernel/mathjobs.js:363` 一带，含注释说明"同键、同缺席值"）。
- **落盘**：`docs/15 §14.4` 新增"输出上限：一个键、两个读者、一个默认（Round 5 写实）"；`docs/09 §4.3` 的 `maxBytes` 条目改写为同一事实（含两面缺席值都是 65536）。

---

## D. 文档同步
- `docs/09-math-formalization.md`：§4.3 的 `maxBytes` 条目改为"两个读者、一个默认"；§4.3 的 F15 条目标注**权威登记＝`docs/11 §11.ap`**（含上界与重测命令）。
- `docs/15-math-computation-toolbox.md`：§14.4 新增输出上限写实条。
- `docs/11-gates-and-development.md`：**只新增 `### 11.ap`**（见 §B）。

---

## E. 原样命令 ＋ 退出码

```
node tests/vmu-activity-timers.test.mjs       → === VMU TIMERS F15/F16: 36 passed, 0 failed ===   EXIT=0
node tests/vmu-mathjobs.test.mjs              → === VMU MATHJOBS: 10 passed, 0 failed ===         EXIT=0
node tests/vmu-mathjobs-persist.test.mjs      → === VMU MATHJOBS PERSIST: 17 passed, 0 failed === EXIT=0
node tests/vmu-lean.test.mjs                  → ALL GREEN  (passed=13, failed=0)                  EXIT=0
node tests/vmu-lean-killable.test.mjs         → === VMU LEAN KILLABLE: 7 passed, 0 failed ===    EXIT=0
node tests/vmu-mathtools.test.mjs             → === VMU MATHTOOLS: 208 passed, 0 failed ===      EXIT=0
node scripts/check-docs.mjs                   → vmu doc-lint: docs=29 issues=0 / DOC LINT: PASS  EXIT=0
node tests/vmu-planned-settings.test.mjs      → RED 32/7                                          EXIT=1
```

- `vmu-activity-timers` 的 §5 现在自报"**two CLOSED by their owners …, one still open**"，那个 open 就是本节登记的共享模块 sleep ✓（**故意保持红＝边界可重测**）。
- `vmu-planned-settings` 的 7 条红**不在我的卷**：生成物 `settings/planned.js` STALE ＋ 未登记名来自 **`docs/10`（`vmu.v3.*`，vmu-pack 的卷）**与 **`docs/22`（`vmu.config.plugins`）**；我的 `docs/11 §11.ap` 经机械核对**含 0 个 `vmu.*` 字面量**（`docs/09`/`docs/15` 本轮也无新增未登记名）。

---

## F. 未做项 / 具名残余
| # | 项 | closed-by |
|---|---|---|
| 1 | F44 的"公告注入下一次提示词" | core 转回合管线消费 `takeNoticesFor(member)` |
| 2 | 共享模块两处 sleep 的**可取消接缝** | 本轮为具名豁免（`docs/11 §11.ap`）；真加需 4 份副本同改 ＋ canonical 快照刷新（下一轮协调项） |
| 3 | 计算面内容去重 | **有意不做**（每次运行需要自己的回执），已在 `docs/09 §4.3` 记为与 Lean 面的具名差异 |
| 4 | `vmu-planned-settings` 的余红 | 非我卷：`docs/10`（pack）／`docs/22` ＋ `settings/planned.js` 需 Lead `regen-all` |

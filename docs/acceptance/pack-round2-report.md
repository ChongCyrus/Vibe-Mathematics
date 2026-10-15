# vmu 交接 · Round 2 · task-15 报告（D-12 钩子真源收口 · D-13 提示词活读 · v5r pack 声明层）

- 任务：`task-15`（vmu-pack）；裁决：`_handoff/vmu/00-decisions.md` D-08 / D-12 / D-13；组织：`_handoff/vmu/round2-plan.md`
- 纪律：未跑全量 sweep、未跑 `regen-all`、未动 git；临时文件在 `D:\_tmp`；定向单跑命令与退出码见下。
- 写范围外未动：`kernel/index.js`、`host*.js`、`vibe-math-vmu.js`、`settings/**`、`tools/**`、`tests/**`、`package.json`/`installer.js`、`packs/v5r/prompts/**`。

---

## A. D-12 钩子单一真源收口（**完成，两侧同轮**）

**我这边（`kernel/bus.js`）**
- `VU_HOOKS`、`DEFAULT_FAILURE` **改为从 `HOOK_REGISTRY` 派生**（不再有第二份字面量）：
  - `VU_HOOKS = HOOK_REGISTRY.filter(kind==='vmu').map(name)`（登记序）
  - `DEFAULT_FAILURE = Object.fromEntries(vmu 钩子 → failure)`
  - `DSH_HOOKS` / `BRIDGED_HOOKS` / `HOOK_PREFIXES` 维持派生（轮 1 已落）
- `hookRegistryProblems()` 重写为**非空过**的数据校验（派生后"表==字面量"的比较会恒真）：名字形状 `domain/name`、唯一性、vmu 必有 `failure`∈{open,closed,abort}/`scope`/`producer`、host 必有 `bridged` 且 `bridged ⇒ bridgeSite`、未桥接不得声称 `bridgeSite`、派生表覆盖数一致。**当前 `[]`**。
- **轮 2 新原语钩子全部登记**（33 个，`VU_HOOKS` 22 → **55**）：
  - `resume/*`（3）、`ids/*`（3）、`human/*`（5）、`control/scope-*`+`control/param-*`（4）——reader-a（`kernel/resume.js`/`ids.js`/`human.js`/`control.js`）
  - `chat/*`（3）、`mailbox/*`（2）、`panel/*`（3）——reader-c（`kernel/chat.js`/`mailbox.js`/`panel.js`）
  - `math/*`（8）——reader-b（`kernel/mathjobs.js`/`mathadapters.js`）
  - `lifecycle/prereg`、`lifecycle/advance`（2）——reader-a 修好 `lifecycle.js:39` 的静默失效后补登记
- **`VU_NAMESPACE` 同步扩展**为 `member|turn|meeting|ballot|record|task|prompt|budget|pack|settle|control|resume|ids|human|chat|mailbox|panel|math|lifecycle` ⇒ 这些命名空间里**未登记的名字具名拒**（`VMU_INVALID_ARGUMENT`），不再"看起来正常、其实没人能挂"。
- **门禁两侧同轮**：vmu-verify 已把 4 处按源码文本解析的表改为**读运行时导出**（`tests/audit-hook-coverage.test.mjs`、`tests/audit-doc-vs-code-tables.test.mjs`、`tests/audit-vmu-docs.test.mjs`、`scripts/generate-surface-index.mjs`）。**证据（我复跑）**：4 条门禁全 exit 0（4/0、17/0、80/0、20/0），`node scripts/generate-surface-index.mjs --check` exit 0（当时生成块 current；新增钩子后 hook-index 会 stale，见"预期红"）。
- **emit 形态硬要求**（新发现并已同步三个实现面）：`bus.emit('<名>', payload, opts)`。`emit({type:'x'})` 单对象调用被总线以 `VMU_INVALID_ARGUMENT` 拒绝，而 `kernel/lifecycle.js:39` 的 `try/catch` 把它**静默吞掉** ⇒ 两条广播从未到达总线（**活 bug**）。reader-a 已修 lifecycle；reader-b 自报并修了 `math.*` 同类问题；`kernel/ids.js` 也已改为字符串名 + `.catch()`。

## B. D-13 提示词管线活读（**完成**）

**`kernel/prompt/index.js`**：构造期值快照 → **每次调用经 `settings.get()` 现读**（`settings` 可为 kernel 的活视图或普通对象）：
- 七项：`vmu.prompts.locale.default`、`locale.fallbackChain`、`locale.onMissing`、`overridesByLang`、`glossary.mode`、`glossary.ontology`、**`overrides`**（后者原先在构造期并进调用方的 `overrides` 映射 = 值快照）。
- **构造期只保留结构性派生**：`vmu.prompts.sections` 的**注册**（注册不是值）。
- `overrideFor()` 优先级不变：**byLang > 调用方 `overrides`（API `override()`）> settings 声明的 `overrides`（现读，`sources[]` 记 `plain:settings`）**；`status().sections[].overridden` 现在也认 settings 声明的覆盖；`overrideMerge` 仍是构造期计数（既有断言依赖）。
- **验收（原样命令 + 退出码）**：`node D:\_tmp\vmu-d13-live-probe.mjs` → **exit 0，7 passed, 0 failed**（**最终树**上运行；内容：真 kernel + **同一个 pipeline 实例** + `setSettingsValue` 后**不重建**，下一次 `assemble()` 即生效；含"实例未变"负控）。同一场景已请 vmu-verify 落成永久断言。

## C. v5r pack 声明层（**完成：只声明策略，零内核实现复制**）

- **`packs/v5r/settings/defaults.json` + `settings/defaults.js`（两份同值，25 键）**：新增 19 个 v5r 机构偏好，键全部已在 `settings/schema.js` 声明，且**由内核原语真读**（reader-a/b/c 各自确认）：
  - 群聊：`vmu.chat.admins=["acad"]`（**成员 id**；v5r 的院士）、`speakQuota=0`（v5r 无配额）、`muteDefaultMs=0`（v5r 只有表决期冻结）、`freezeExemptAdmins=true`（R4 chair-first）
  - 信箱：`vmu.mailbox.urgentKinds=[dm,office,assign,nudge,notice,meeting,verify]`、`wakeBudget=1`（v5r 每 flush 唤醒一人）
  - 面板：`vmu.panel.deviationPolicy="record"`（v5r 保留院士原值 + 记 deviation）
  - 恢复：`vmu.resume.projections=[members,tasks,meetings,ballots,budget,phase,work]`（reader-a 的 7 面键）、`autoRecover=true`、`readBack=true`
  - 人类在环：`onTimeout="hold"`、`vetoLiftRoles=["office"]`、**`gatedActions=[]`（零机制，故意为空）**
  - 数学作业：`vmu.math.jobs.persist=true`、`jobs.recover="on-load"`
  - 会议：`quoteDepthMax=3`、`quotesPerMessageMax=2`、`unansweredInDenominator=false`（v5r D3：未答不计分母）
- **报告策略不在此层**：`vmu.report.*` 由**被装载清单**（`packs/v5r/prompts/v5r-core.js`，助手面）声明并由 `apply()` 施加。**同一键两处都写会被判重叠冲突（O4）** —— 我在初版 defaults 里曾同时写 `vmu.report.enabled/whoMayChange`，实测会与清单冲突，已移除并在文件注释里写明原因。
- **中间件**：轮 2 没有新增 pack 中间件条目 —— 新原语的策略**全部由内核读取 settings 执行**，pack 再写一条同类中间件就是"复制内核实现"（违反 D-08 铁律）。唯一的策略函数（段开关）仍是轮 1 的 `packs/v5r/middleware/prompt-switches.js`。
- **依赖方向**：`kernel/**` 仍**零 import `packs/**`**（grep 无命中）；pack 只声明。
- **登记的 33 个新钩子**给了 pack（与任何中间件）真实可挂点；`audit-hook-coverage` 4/0 证明**每个登记名都有真实 emit 点**（我另用 `D:\_tmp\vmu-hook-emit-scan.mjs` 逐名扫描：**missing=0 of 31**，另 lifecycle 2 个已单独确认）。

## D. 文档（**完成**）

| 卷 | 改了什么 |
|---|---|
| `docs/05-middleware.md` | §0/§5 计数（53）；**新增 §5.3 轮 2 新原语钩子表**（分组/默认失败/可否阻断/语义 + 命名空间扩展 + emit 形态硬要求）；§6.1.1 改为"**完全派生**（D-12）+ 门禁读运行时导出"；§14 新增第 14/15 条（D-12 收口；`emit({type})` 活 bug） |
| `docs/06-prompt-pipeline.md` | **新增 §11.1 活读（D-13）**：七项现读、`overrides` 不再构造期合并、调用方仍胜出、`status().overridden` 语义、验收口径 |
| `docs/10-packs.md` | **新增 §4.1 v5r pack 声明层**：声明在哪（defaults vs 清单 vs prompts vs middleware）、为什么在这一层、边界（gatedActions 空 / report.params 在助手面 / chat.admins 是成员 id） |
| `docs/27-pack-folder.md` | **新增 §4.2**：声明层 + D-12 + D-13 三条收口 + "内核仍零 import pack" |

---

## 验证（原样命令 + 退出码；单跑，非全量）

工作目录 `Vibe-Mathematics`。以下为**最终树**上的复跑结果（两个跨队崩溃修复后）。

| 命令 | 退出码 | 结果 |
|---|---|---|
| `node tests/vmu-bus.test.mjs` | 0 | 44 passed, 0 failed |
| `node tests/vmu-loader.test.mjs` | 0 | 28 passed, 0 failed |
| `node tests/vmu-prompt.test.mjs` | 0 | 70 passed, 0 failed |
| `node tests/vmu-turn.test.mjs` | 0 | 145 passed, 0 failed |
| `node tests/vmu-prompt-v5r-bridge.test.mjs` | 0 | 12 passed, 0 failed |
| `node tests/vmu-pack-data-sections.test.mjs` | 0 | 14 passed, 0 failed |
| `node tests/vmu-pack-fields-match-category.test.mjs` | 0 | 14 passed；packs=3 refusals=0 misplaced=0 |
| `node tests/vmu-middleware-hooks-declared.test.mjs` | 0 | 8 passed, 0 failed |
| `node tests/vmu-pack-manifest-pointers.test.mjs` | 0 | 8 passed, 0 failed |
| `node tests/audit-hook-coverage.test.mjs` | 0 | **4 passed, 0 failed**（55 个登记钩子 ⇄ emit 点双向一致） |
| `node tests/vmu-kernel.test.mjs` | 0 | 174 passed, 0 failed |
| `node tests/vmu-host.test.mjs` | 0 | 103 passed, 0 failed |
| `node tests/vmu-pack.test.mjs` | 0 | 53 passed, 0 failed |
| `node tests/vmu-host-hooks.test.mjs` | 0 | 22 passed, 0 failed |
| `node tests/vmu-round1-seams.test.mjs` | 0 | 38 passed, 0 failed |
| `node tests/vmu-entry.test.mjs` | 0 | 141 passed, 0 failed（真入口；v5r pack 施加无冲突） |
| `node tests/vmu-lifecycle.test.mjs` | 0 | 13 passed, 0 failed（含 reader-a 修好的 lifecycle 广播） |
| `node D:\_tmp\vmu-hook-emit-scan.mjs` | 0 | **missing=0 of 31**（每个新钩子都有字面量 `emit('<名>'` 落点） |
| `node D:\_tmp\vmu-d13-live-probe.mjs` | 0 | **7 passed, 0 failed**（真 kernel + 同一 pipeline 实例 + `setSettingsValue` 后不重建，下一次 `assemble()` 即生效；含"实例未变"负控） |
| `node D:\_tmp\vmu-pack-round1-probe.mjs` | 0 | 29 passed, 0 failed（轮 1 行为回归） |
| `node tests/audit-hook-coverage.test.mjs`（D-12 四门禁之一） | 0 | 见上；另三条 `audit-doc-vs-code-tables` / `audit-vmu-docs` / `audit-surface-index` 与 `scripts/generate-surface-index.mjs --check` 在 D-12 落地时全部 exit 0（其后因轮 2 新增服务/钩子/设置键使生成块 stale，见下） |
| `node tests/audit-pack-face.test.mjs` | 0 | 5 passed, 0 failed（**我把轮 2 的 `packs/v5r/prompts/assistant.json` 与 `packs/v5r/prompts/v5r-assistant.js` 补进了 `docs/27` 的布局与 §7 表** —— 该门禁要求包内每个文件都在卷里被点名） |
| `node tests/audit-vmu-release.test.mjs` | 0 | 22 passed, 0 failed |
| `node tests/audit-claim-traceability.test.mjs` | 0 | 5 passed, 0 failed |

**预期红 / 非我红（等对应 owner 或 Lead 收尾，不是我这侧的缺陷）**：
- `audit-surface-index`、`audit-vmu-docs`：docs/03 服务块、docs/05 hook-index、docs/04 设置表 **stale**（轮 2 新增服务 77 个、钩子 55 个、设置键若干）⇒ 由 Lead 在全员停写后 `regen-all`/`--write` 收口（D-07/D-11）。
- `audit-doc-vs-code-tables` §4：docs/03 表里写的服务数与 `registry.register` 实数不一致（**77**）—— vmu-core 的 docs/03。
- `audit-verbatim-claims`：`11:230 -> tool-schema.json` 悬空引用 —— vmu-verify 的 docs/11（D-10 canonical 进仓）。
- `tests/vmu-kernel.test.mjs:436-437`：断言 Lean 面 `keysUsed()` **恰好 8**，而它现在读 **12**（8 Lean + reader-b 的 4 个 `vmu.math.jobs.*`）⇒ 建议改成**派生断言**（"包含那 8 个" + 新增 4 个具名），已报 vmu-verify。与本轮 task-15 无关（收尾复跑时撞到）。

**曾出现的两个工作区级崩溃（均已由 owner 修复，最终树上全部复跑为绿）**：`kernel/index.js:730` 构造期 TDZ（vmu-core 已把 attach 块移到声明之后）、`kernel/report.js:121` 构造期读时钟（vmu-core 先换 raw `clock` 止血；vmu-assistant 随后采纳"**构造期零时钟读取**"的修法，见下第 2 条）。

---

## 跨队阻塞 / 需裁决（均已具名通知对应 owner；①②③ 已修复并复跑为绿）

1. ~~**`kernel/index.js:730` 构造期 TDZ**~~ ⇒ **已修**（vmu-core 把 attach 块移到 `ballotbox` 声明之后，并用 `gateMethods()` 过滤真实方法、`missing` 报进 `status().approvalGate`）。
2. ~~**`kernel/report.js:121` 构造期读时钟**~~ ⇒ **已修（两层）**：vmu-core 先把 `createReport` 收到的 `guardedClock` 换成 raw `clock`（止血，任何时钟形态都不再崩）；vmu-assistant 随后采纳"**构造期零时钟读取**"：删掉 `const armedAt = clock()`，改懒读 `readClock()`（`:132`），不可用读数走**具名条件**（`status().clock.ok:false` + `status().problems` 一条 `(clock)` + `tick().clock.note`），周期基线**首次评估时武装**（`status().periodBaseArmed`）；回归 `tests/vmu-assistant-report.test.mjs §10` 覆盖"字符串时钟 + 抛异常时钟"，断言"构造不抛、显式 `at` 仍可用"。
3. ~~**`tests/vmu-round1-seams.test.mjs` 硬编码 45 个工具**~~ ⇒ **已修**（vmu-verify 改为派生；现 38/0，真入口 50 面）。
4. **新内核文件的双登记**（vmu-verify，D-05 口径）：`kernel/ids.js`、`kernel/resume.js`、`kernel/chat.js`、`kernel/mailbox.js`、`kernel/panel.js`、`kernel/report.js`、`kernel/mathadapters.js`、`tools/{chat,mailbox,panel,report,human}.js` 需进 `package.json files[]`（预设内文件还要 `installer.js PRESETS.*.files`），否则装包后 `MODULE_NOT_FOUND`。已提醒（我未越界改）。
5. **`vmu.math.maxParallel` 与 `vmu.math.jobs.maxParallel` 语义重复**（reader-b 自报）：分层消费（mathjobs 读前者、mathtools 读后者）⇒ pack 若只声明一个，另一层读者看不到。本轮我**未声明**这两个键（避免只写一半）；建议 core/verify 决定是否收敛为一个键。已记。
6. **`vmu.report.params` 的 v5r 白名单**由助手面（`v5r-core.js`）给出；我**未**在 defaults 里重复（会冲突）。
7. **`vmu.chat.admins` 取成员 id**（`["acad"]`）：若部署用别的成员 id，需覆盖或由宿主注入 `isAdmin` 接缝（reader-c 已支持该接缝）；slot 语义不在名单里。

## 未做（如实）

- 未跑全量 sweep / `regen-all` / `update-doc-counts --write`（D-07，归 Lead）。
- 未新增 pack 中间件条目（理由见 C：会把内核策略复制一遍）。
- 未把 `docs/05 §5` 的手写 22 行表扩成 55 行——**生成索引才是权威**（§5.3 给语义面），避免再维护一份会过期的表。

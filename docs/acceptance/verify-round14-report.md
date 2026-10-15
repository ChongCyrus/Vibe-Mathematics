# Round 14 · vmu-verify2（`task-107`）交付报告

> 纪律：**未跑全量 sweep（T0/T1 归 Lead）／未 `regen-all`／未做任何 git 写操作**；临时文件只在 `D:\_tmp\v14`；**未改他人文件**。
> **读的是哪一次运行**（本报告全部读数同此基准，逐条另注时刻）：工作树 `D:\wd\vibemath开发\Vibe-Mathematics`，`git rev-parse HEAD` = **`4e5be5aef28180514685a364baba405f94036bee`**（R13）＋ **并发同事的本轮未提交改动**（凡受影响处逐条写明文件名与读数）。
> 日期：2026-10-15

## 0. 结论速览

| 项 | 状态 | 读数（我的运行） |
|---|---|---|
| **A 前提更正** | ★ **任务书写的是"代码未落"，实测＝已在 HEAD 落地** | `node tests/audit-vmu-docs.test.mjs` ⇒ **89 passed / 0 failed**（HEAD 原样；豁免＋四条自探针都在 `4e5be5a` 里） |
| **A 我实际落的** | ✅ | 单源白名单（审计 import 生成器）＋ 自探针**改为跑真判据**＋新增 ⑤（白名单自审）＋ **G2 新门**（幽灵 planned 键） ⇒ 同门 **95 passed / 0 failed**；**RULE E 指纹集 67＝67 未动** |
| **A 减负** | ★ **做了、被自己的量具否证**（按第八条记） | 退掉 R108/R270 的 10 名 ⇒ 生成器 `--check` **STALE 123 vs 114**（新铸 9 个）⇒ **调用形豁免不能缩表**；根因＝生成器收集无调用形规则（`docs/28:1361` 早有登记） |
| **B 桶① 25 键三列** | ✅ | **25 键/13 面**：**5 有落点计划**（面自带受控声明＋复活条件）／**19 无承载者**（其中 1 个应**移出 planned**、2 个落点最近）／0 已读／0 具名"不接"；`vmu-seam-params-consumed` **8/0**（诚实标注：它量的是 `createKernel` 接缝，不是键） |
| **C 矩阵 v12** | ✅ | `_handoff/vmu/04-parity-matrix.md` **866 → 949 行**，新增 **§9.26 v12 并入块**（闭合项 9 条＋桶① 25 键三列＋门禁实测＋两条量具假象＋具名未做） |
| **D 通知** | ✅ | 已发 `vmu-assistant2`（含"生成器也要带 `(?!\s*\()`"的耦合与两个现场实例） |
| **Lead 追加① B5b** | ✅ | `tests/vmu-motion-box.test.mjs` 加"回执⇔事实分离"独立回读 ⇒ **23 passed / 0 failed**（改前 22/0） |
| **Lead 追加② `docs/11 §6.1 ①`** | ✅ | 归因按实测更正（门**扫** `vibe-math-vmu/**`、会红并具名）＋写进真正剩下的洞 |
| **Lead 追加③ 7 文件＋闭包门** | ✗ **具名未做** | 见 §7.2（`files[]` 与 `PRESETS` 必须同改，否则 §8 会红；一次做完再验证） |
| **Lead 追加④ 去重** | ✅ | `package.json#files` **678→677，distinct 677** |
| **Lead 追加⑤ 注释对齐** | ✅ | `tests/audit-package-membership.mjs:67` 删掉它**并不做**的 `PRESETS` 声明（该文件全文 `PRESETS` **0 次**） |

## 1. A · 前提更正：调用形豁免**已在 HEAD 落地**（我核了三处＋四条探针）

**我先落一行核验再下结论**（本仓"引用前先核验"）：`git status` = 工作树 clean（当次），`git show HEAD:tests/audit-vmu-docs.test.mjs` 里 `:348`／`:374`／`:399` **三处都带负向前瞻 `(?!\s*\()`**，并带"三处必须逐字相同"的 `literalCount === 3` 漂移断言＋四条自探针（**① 家族形 ② 命名空间 ③ 调用形 ④ 裸键**，排序＝先旧后新）。`node tests/audit-vmu-docs.test.mjs` ⇒ **89 passed / 0 failed**。
⇒ **`task-107` A 的"代码未落"是陈旧前提**（轮 13 的 `task-101 ②③` 已落盘）；本轮**不是"再落一次"**，而是**复核＋补真相＋补牙**。

### 1.1 我落的四件事（全部零成本换绿）

1. **手写白名单改为单源**：`tests/audit-vmu-docs.test.mjs` 不再自带 `NON_SETTING`，改为 `import { NON_SETTING, MIRROR_PREFIXES } from '../scripts/generate-planned-settings.mjs'`。
   **★ 理由是一条实测的真缺陷：两份拷贝已经漂移** ——
   - 审计那份写 `vmu.dissemination.impact`／`vmu.dissemination.mediaRequest` ⇒ 而**这两个名字现在都是真键**（`SETTING_DEFS` 命中）⇒ 是**过期豁免**；
   - 生成器那份写 `vmu.outreach.impact`／`vmu.outreach.mediaRequest` ⇒ **R218 已把族名改成 `dissemination`** ⇒ 它们**什么都匹配不到**（我逐卷扫：0 命中）。
   `docs/11 §9.8 ⑭` 早已写过"同一不变量的判据往往有多个副本" —— 这次是它的第二个实例。
2. **四条自探针改为跑真判据**：原 `reported()` 是**一阶段副本**（只查 `keys`/`NON_SETTING`/`namespaces`），而门**还有第二阶段**（"有下位名即命名空间"）。⇒ 自探针 **②** 用 `vmu.meetings.open` 当"命名空间"样本，**而它恰好是真键** ⇒ 它**从来没有碰到自己名字所指的那条规则**（这正是第九条"豁免之间互相掩护"的现场）。现在 `bogusOf()` 跑**两阶段**，② 用**非键**父子样本 `vmu.probe.ns` / `vmu.probe.ns.child`（父被豁免、**子仍被报**）；③／④ 换成**合成名** `vmu.probe.call`（`vmu.tasks.status` 会真的变成 planned 键 ⇒ 会把探针悄悄变成"第二条第①类豁免"）。
3. **新增自探针 ⑤（白名单自己必须能变红）**：(a) **任何 `NON_SETTING` 条目是真键 ⇒ 红** —— 它正是抓住上面那两个过期条目的方式；(b) **`namespaces` 恒为两段 ⇒ 断言**（见 §2.1）。
4. **新增门 G2**："**planned 键不得只靠调用形提及而立**"（见 §3）。

**读数**：`node tests/audit-vmu-docs.test.mjs` ⇒ **95 passed / 0 failed，EXIT=0**（改前 89/0 ⇒ ＋6 条）。
**RULE E**：`node tests/audit-declaration-criterion.test.mjs` 打印 `RULE E fingerprints: current=67 baseline=67` —— **指纹集未动**（该文件当次唯一红＝`regen-all --check`，根因见 §2.2，**与本轮断言形状无关**）。

## 2. ★ 键判据的**真来源**：两写＋两机械＋一条两阶段 —— **不是"三源"**

| # | 来源 | 形态 | 实测 |
|---|---|---|---|
| ① | `SETTING_DEFS`（`settings/schema.js` ＝ core ＋ `PLANNED_DEFS`） | 手写＋生成物 | **1229 键**（1108 已接线／121 未接线；我这次运行打印） |
| ② | `NON_SETTING` | **手写**，**35 名**（轮 13 报告写"33"是**数错**） | 现**唯一一份**（生成器导出，审计 import） |
| ③ | 家族形 `vmu.x.y.*` | **机械** | 看 match 后一字符 |
| ④ | **调用形** `vmu.x.y(` | **机械**（负向前瞻） | 设置项**永远不会被调用** ⇒ 无需白名单 |
| ⑤ | 两阶段"有下位名即命名空间" | 机械（第二阶段 `:384-391`） | 这才是第 3 位**真正生效**的规则 |

### 2.1 `namespaces` 是**死豁免**（实测），不是第三个来源

`namespaces = keys 的前两段` ⇒ **值恒为 2 段**（`vmu.<面>`）；而键正则 `\bvmu\.[a-z]…(?:\.[a-zA-Z0-9]+)+\b` **要求 ≥3 段** ⇒ `namespaces.has(k)` **永不成立**。
它仍留在 filter 里，但**现在被自探针 ⑤b 断言**（`[...namespaces].every(n => n.split('.').length === 2)` 的反向写法），而**不再被当作"三源"之一**——这正是第六条要防的"语义级空过"（RULE E 只问集合会不会空，看不见"这个 filter 永不成立"）。

### 2.2 ★ 调用形豁免**不能**让表缩小（我做了减负，**被自己的量具否证**）

**做法**：把 R108／R270 追加的 **10 个**名字从生成器表里退掉，跑 `node scripts/generate-planned-settings.mjs --check`。
**读数**：**STALE，123 键 vs 114**；`missing from planned.js (9)`；`excluded … whitelist=0`。
**证据（逐条读到行）**：会**新铸 9 个** planned 键 —— `vmu.ip.hold`／`vmu.ip.ownership`／`vmu.ip.contributors`／`vmu.ip.recordSearch`／`vmu.ip.transfer`／`vmu.collab.authorship`／`vmu.members.may`／`vmu.tasks.create`（＋`vmu.records.body` 被命名空间根规则挡掉）。来源行例如 `docs/22` §接口形状：``服务 `vmu.ip.ownership(id)`／`vmu.ip.contributors(id)` ``、`docs/08` R6：`` `vmu.members.may()` ``。
**根因**：**生成器的收集没有调用形规则**（`BROAD_RE` 无前瞻）—— 这条规则**R269 就设计过而没落**（`docs/28:1361`「「后随 `(` 即调用」这条更通用的规则仍未加」；其 `excluded.serviceCall` 桶也没落）。
⇒ **结论**：调用形豁免**只能止住白名单继续长大**，**不能**让它退休；**原子下一步**＝生成器加同一条规则**并重新生成 `settings/planned.js`／`docs/04`**（会同时消掉 §3 的 3 个幽灵键）。**这属于"可以重新生成的人"，不在验证侧写范围。**
**★ 同一耦合当场又造出两个实例**（并发同事的文档改动）：`vmu.tasks.status()`（`docs/29` 把"为绕门拆写"的调用**复原**为调用形）＋ `vmu.meetings.bindBox()`（`docs/22`）⇒ `--check` **STALE 116 vs 114**、`vmu-planned-settings` **RED（passed=32, failed=7）**。**这不是谁写错文档，而是"两处判据必须同改"**（`docs/11 §9.8 ⑭` 的原话）。
**我把我先前写进生成器注释的那句"byte-identical"当场改掉了**（`vmu-assistant2` 提醒得对：以**落地后的一次运行**为准）。

## 3. ★ 新门 G2：**"planned 键只靠调用形提及而立"＝ 真缺陷**（实测 3 个）

**判据**：一个 planned 键在**来源卷**（排除生成镜像 `04` 与账本 `14`／`28`）里**每一次**提及都紧跟 `(` ⇒ 该名字是**服务面**，却被登记成**设置**；行上是 `planned:true, def:null`，即**设置表承诺一个不存在的旋钮**。
**实测恰好 3 个**（这是上面两份白名单漂移的同一件事的另一半）：

| 键 | 证据（调用形） |
|---|---|
| `vmu.dissemination.impact` | `docs/22`：`` `vmu.dissemination.impact(...)` `` |
| `vmu.dissemination.mediaRequest` | `docs/22`：`` `vmu.dissemination.mediaRequest()` `` |
| `vmu.meetings.open` | `docs/10`／`docs/27`：`vmu.meetings.open(...)` |

**门形**：**具名台账**（第四个别名 ⇒ **红**；修好一个 ⇒ **必须删掉它那一行**，否则红 ⇒ 台账不会陈旧，同 M13/M14 形状）＋**合成自探针**（只调用形 ⇒ 抓到；键形 ⇒ 静默）。
**读数**：G2 在 **95/0** 里；★ 中间版本 `08:54:13–08:55:35` 我一度把合成集写成一个（调用＋裸提及同名）⇒ **G2 自探针红 80 秒**（`vmu-pack2` 抓到、`vmu-assistant2` 通知）；那是我**自己在飞轮的中间态**，**已修**（两组合成集分开）。**若 Lead 的 T0/T1 落在该 80 秒窗口内，读数作废**（按"扫描期间不得改动作业集合"）。

## 4. B · 桶① **25 键/13 面**逐键三列

完整 25 行表见 **矩阵 `§9.26.2`**（`_handoff/vmu/04-parity-matrix.md`）。汇总：
- **有落点计划 5**：`vmu.ballot.freezeMeetingLinked`／`freezeMode`／`reopenInitiatorScope`／`reopenSameMeetingOnly`（面＝`kernel/ballotbox.js` 的**受控声明＋复活条件**）＋ `vmu.paper.retentionMs`（`kernel/paper.js`） ⇒ **下轮**（按面已给的复活条件）。
- **无承载者 19**（内核 83 文件未读、亦无面声明 ⇒ 真实待办）：`ballotbox.minVotes`／`collab.exportPolicy`／`collab.federationPeers`／`explain.fairnessDetail`／`handover.autoOpenOnEnd`／`handover.includeMemoryScopes`／`identity.localFormat`／`math.formal.coqArgs`／`math.formal.coqCommand`／`math.network`／`math.proof`／`prompt.compatMode`／`prompt.order`／`prompt.sections`／`report.bilingual`／`report.language`／`skills.catalogTtlMs`／`work.pauseRule`／`work.start`。
  - **落点最近 2 个**：`vmu.math.network`／`vmu.math.proof`（`docs/04` 的模块列已指到 `kernel/mathtools.js`） ⇒ **本轮优先候选**。
  - ★ **1 个不是"缺读者"而是"不该是键"**：`vmu.meetings.open`（G2 幽灵键 ⇒ **移出 planned**）。
  - 其中 `collab` 两条 R13 已量"**契约薄**"（默认值/类型判不了消费者）⇒ 先补契约再补读者。
- **已有读者（实测矛盾）0** ／ **具名"不接" 0**（"永不接"的是桶② 89 键/29 面，已按"面无载体"规则闭合，**不需要逐个碰**）。

**方法诚实标注**：`node tests/vmu-seam-params-consumed.test.mjs` ⇒ **8 passed / 0 failed**，它量的是 **`createKernel` 的接缝参数**，**不是设置键**；逐键"谁读它"的判据来自生成器的 `verdictOf()`（**读内核源码**得到，`docs/04` 的"承载者"列就是它的产物），我用独立脚本复算了同一谓词（`settings[...]`／`.get('…')`／`raw|readKey|strOf|boolOf|numOf|intOr(...)`＋`['key',` 声明位），**25/13 的分层与轮 12 完全一致**。

## 5. C · 矩阵 v12

`_handoff/vmu/04-parity-matrix.md`：**866 → 949 行**，末尾新增 **`## §9.26 ★ R14 · v12 并入块`**，含
`9.26.1` 闭合项 9 条（两进程真对话／motion→box 政策分工／长尾规则闭合／U15 否证／键集真来源（**更正**）／`metrics/trigger`／对象形态 emit 家族／门禁窗口换函数体边界／`docs/11 §4.2` 第九条）；
`9.26.2` 桶① 25 键三列；
`9.26.3` 门禁侧实测 9 条（含 G2、⑤、探针② 空过、§6.1 ① 更正、去重、注释对齐、B5b）；
`9.26.4` **两条"量具坏了"**（`vmu-pack2` 自陈：PowerShell `ConvertFrom-Json` 解析 `package.json` 失败 → 差点得出相反结论；`Get-Content` 把 `installer.js` 数成 **800** 而真值 **810**）；
`9.26.5` 具名未做 5 条。
★ 标题仍写 v11（**只有 Lead 能改标题**）⇒ 本块一经并入，正文即 v12。

## 6. Lead 追加派单（本轮顺手）

| # | 项 | 状态 | 证据 |
|---|---|---|---|
| 1 | **B5b 回执⇔事实** | ✅ | `tests/vmu-motion-box.test.mjs`：B5/B6 只读**回执**（`mirrored:true` 是**声称**）⇒ 新增**独立回读箱子自己的裁定**（`ballotbox.close({boxId})` ⇒ `detail` 含 `{by:'m2',choice:'1'}` 且 `tally.cast===1`）；`node tests/vmu-motion-box.test.mjs` ⇒ **23 passed / 0 failed**（改前 22/0） |
| 2 | **`docs/11 §6.1 ①` 归因** | ✅ | 原文"不扫 `vibe-math-vmu/kernel/*.js`"**已被真实门禁否证**（pack2：`PACKAGE_JSON` 指向副本、只删 `kernel/meetingmarker.js` ⇒ **12 passed/1 failed, EXIT=1**，具名 `vibe-math-vmu\kernel\meetings.js -> ./meetingmarker.js`；`:75-84` `walk(VMU,0)` 就是扫 `vibe-math-vmu/**` 并含 `tests/`）；已改为实测结论＋写明**真正剩下的洞**（磁盘有、无 import 指向） |
| 3 | 7 文件豁免＋闭包门 | ✗ 具名 | 见 §7.2 |
| 4 | `package.json#files` 去重 | ✅ | `tests/_lib/strip-comments.mjs` 曾两次（`:398`／`:500`）⇒ **678 → 677，distinct 677**；`node tests/audit-package-membership.mjs` ⇒ **13 passed / 0 failed** |
| 5 | `audit-package-membership.mjs:67` 注释 | ✅ | 删掉"也查 installer preset 清单"这句**假声明**（该文件全文 `PRESETS` **0 次**；`:127` 只比 `listed`）；改为写明那条边归 `audit-installer-policy §8`（**一个事实一个门**） |

## 7. 具名未做（**不写成已做**）

1. **生成器加调用形规则＋重新生成 `settings/planned.js`／`docs/04`**（§2.2 的原子修复）：不在我写范围（`settings/**` 非我领地），且会让 **3 个幽灵键消失** ⇒ **Lead 裁决**。★ 它与 `docs/29`／`docs/22` 的调用形写法是**同一件事**：不加，`vmu-planned-settings` 会一直是 RED。
2. **7 个"两份清单之外"的文件**（`docs/audit/` 6 份 ⇒ 具名豁免；`packs/example-data/README.md` ⇒ 登记出货）＋**闭包门（判据 6 条，★ 纯数据文件未登记 ⇒ 必须红）**：**未落**。理由（不是时间）：`package.json#files` 与 `installer.js PRESETS` **必须同一次改完**，否则 `audit-installer-policy §8`（输入集＝`pkg.files` 里的 `vibe-math-vmu/` 前缀）会**变红**；且 `PRESETS` 那一行是**单行巨串**，改它要连 `--check` 新鲜度一起处理 ⇒ 一次做完再验证，比半改安全。
3. **桶① 三列没写进 `docs/04`**：该卷 §11 是**生成区**，手写 `| \`vmu.…\` |` 行会被 `audit-vmu-docs:429` 的"一行一键"断言（`rows.length - SETTING_DEFS.length === 0`）**误计** ⇒ 三列落在矩阵 §9.26.2 与本报告（**刻意，不是遗漏**）。
4. **`scripts/generate-seam-table.mjs:26` 的 `SEAMS` 白名单不含 `ballot`／`boxFor`** ⇒ `audit-seam-reachability` **结构上**看不到这一族（`vmu-core2` 实测）：与上一轮 `metrics/trigger` 同型（**白名单就是门的可见范围**）。改它要连 `--check` 新鲜度 ⇒ **具名留下一轮**。
5. `vmu-core2` 的 `vote({motion:null})` 回执 `tally` 与它自己写的 minutes 矛盾：**内核语义**，不是门禁问题，**未动**。

## 8. 新文件登记

**本轮未在仓库内新建任何文件**（无新模块／无新脚本）：改的是 `tests/audit-vmu-docs.test.mjs`、`tests/vmu-motion-box.test.mjs`、`tests/audit-package-membership.mjs`、`scripts/generate-planned-settings.mjs`、`package.json`、`docs/11`、`_handoff/vmu/04-parity-matrix.md` ＋ 本报告。
⇒ **不需要双登记**（`_handoff/**` 与 `D:\_tmp\v14\**` 都在仓库外；仓库内没有新增路径）。★ 顺带按 pack2 的口径记一条：`tests/`／`scripts/` 在 6 个预设里 **0/0**，**必须继续为 0**（我未把任何脚本拖进 `PRESETS`）。

## 9. 收尾读数 ＋ **两处自我更正**（★ 本轮最贵的两条教训，都发生在我自己的文件里）

**收尾读数（我最后一次运行，工作树＝当时版本）**：

| 门 | 读数 |
|---|---|
| `node tests/audit-vmu-docs.test.mjs` | **95 passed / 0 failed，EXIT=0** |
| `node tests/audit-vmu-docs.mutants.mjs` | **15 passed / 0 failed，EXIT=0**（含"未变异副本必须绿"的 control） |
| `node tests/vmu-motion-box.test.mjs` | **23 passed / 0 failed**（B5b 前 22/0） |
| `node tests/audit-package-membership.mjs` | **13 passed / 0 failed** |
| `node tests/audit-installer-policy.test.mjs` | **ALL GREEN**（去重后） |
| `node tests/audit-declaration-criterion.test.mjs` | `RULE E fingerprints: current=67 baseline=67` ⇒ **指纹集未动**；当次唯一红＝`regen-all --check`，根因＝§2.2 的生成器缺规则（**非本轮断言形状**） |
| `node scripts/generate-planned-settings.mjs --check` | **STALE 116 vs 114**（`vmu.tasks.status`／`vmu.meetings.bindBox`）——**根因见 §2.2，不是本轮可闭合项** |

### 9.1 ★ 自我更正一：**自探针的样本被写进了判据自己要扫的卷**（group G 当场红）

我把 §4.2 的说明写成"② 改用非键的父子样本 ⇒ `vmu.probe.ns`／`vmu.probe.ns.child`…；③／④ 换成 `vmu.probe.call`" —— 而**这两个名字正是门的合成样本**，写在 `docs/11`（**本门扫的卷之一**）⇒ `group G` 立刻报 **`vmu.probe.ns.child`／`vmu.probe.call` 未登记**，门变 **94 passed / 1 failed**。
**教训**：**合成样本一旦与被扫的真实数据放在同一命名空间，自探针就会把自己的样本当成真实违规**（"自探针污染被扫集合"）。修法：**样本只留在测试文件里，说明正文里不出现样本名**（已改）。这与 `vmu-pack2` 抓到的我那次**瞬时红**（`08:54:13–08:55:35` 窗口，G2 合成自探针因我中间版本写错合成集而红 80 秒；**该窗口内的任何 T0/T1 读数作废**）是**同一类的两个侧面**：判据的探针输入必须与被扫数据**物理隔离**。

### 9.2 ★ 自我更正二：**门在文档里记录自己的发现，会把发现本身擦掉**

我把 3 个幽灵键以**裸形**写进 §4.2（`实测恰好 3 个：vmu.dissemination.impact、…`）⇒ 这三个名字在来源卷里**各多出一次 bare 计数** ⇒ **G2 立刻静默**（`callOnly found = 0`，而真值 3）。**门读的那份文本，包含写结论的那份文本**（第五条＋第七条）。
**修法**：结论里凡"服务方法"一律写**调用形**（`vmu.dissemination.impact(…)`）⇒ G2 恢复显形 **3**；并在 §4.2 把这条当场写成实例（"**本门自己的文档也算来源卷**"）。
⇒ 这两条合起来＝**第九条的新实例**：豁免/判据会**互相掩护**，而"判据自己的文档"也是一种掩护源。修完后 `audit-vmu-docs` **95/0**、mutants **15/0**。

### 9.3 反驳一条已经不存在的东西（按"引用前先核验"）

`vmu-assistant2`／`vmu-pack2` 在 `09:03–09:04` 观察到的 **`93/2` 与 `94/1` 都是中间版本**；`vmu-pack2` 用**哈希复绑**（`docs/11` sha256 `0841d799095bac9c`、mtime **09:05:31**；门 md5 `9614392feae5e6fe1c9f72e032a9e4e4`）复跑得 **95/0，EXIT=0** ⇒ **以 09:05:31 那版为基线**，本轮**不存在**遗留的 docs 红。

### 9.4 我把自己文件里"铸键"的噪声清掉了（生成器 missing 3 → 1）

同一坑的**第三个实例**（`vmu-assistant2` 09:08:36 自抓：他在 `docs/22` 里把三名裸写 ⇒ G2 立刻红；09:09:10 改回调用形后 95/0）—— 说明这条坑**极易被"写文档"这个动作本身触发**。
我在 `docs/11` 里同样的两处（`vmu.x.y(` 的调用形示例、`vmu.tasks.status()`／`vmu.meetings.bindBox()` 的实例名）改成**服务限定短写**（`服务 vmu.tasks 的 status()`／`服务 vmu.meetings 的 bindBox()`）与**占位形**（`vmu.<面>.<键>(`）—— 这是 `vmu-assistant2` 为 `docs/03` 定的同一写法。
**读数**：`node scripts/generate-planned-settings.mjs --check` ⇒ `missing from planned.js` 由 **3 → 1**，只剩 **`vmu.tasks.status`**，而它现在**只**来自 `docs/29` 那条**逐字引文**（`task-105 A` 要求保留，`vmu-assistant2` 明确不改）⇒ **这条红是"生成器缺调用形规则"的单点证据，正好用来给原子修复收口**：生成器加规则＋重新生成后，它会与 3 个幽灵键一起消失。
**纪律（进矩阵 §9.26.3）**：**结论里凡"服务方法"一律写调用形或服务限定短写；合成样本只留在测试文件里、不写进任何卷**。
**§4.2 收尾读数**：`audit-vmu-docs` **95/0**、`audit-vmu-docs.mutants` **15/0**、G2 台账仍显形 **3**（docs/22 的调用形仍在）。



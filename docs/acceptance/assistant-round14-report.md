# Round 14 · `vmu-assistant2`：调用形统一（A，门已落地）＋ `docs/29` 残余（B）＋ core2/Lead 转办的 docs 缺陷

> 负责人：`vmu-assistant2`（文档/走查面）｜交付：`docs/22`／`docs/29`＋（转办）`docs/03`／`docs/10` ＋ 本报告。
> 写范围：`vibe-math-vmu/docs/**`（本轮实改 **22／29／03／10** 四卷）＋ `_handoff/vmu/assistant-round14-report.md`。
> 硬约束遵守：**未跑全量 sweep／未 `regen-all`／未做任何 git 写操作**（只读 `git status`／`git show`／`git diff`）／临时文件在 `D:\_tmp\vmu-r14-a`／**本轮无需凭据，未复制任何凭据**／未起实例。
> ★ **本报告所有门禁读数都写明"是哪一次运行"**（R12 的教训）。

---

## 0. 结论（五句话）

1. **A 的门真的落地了**：`tests/audit-vmu-docs.test.mjs` 的**三个**收集点（`:348`／`:374`／`:399`）都带负向前瞻 `(?!\s*\()`，并自带 `literalCount === 3` 漂移守卫 ＋ 4 条自探针 ⇒ 我据此执行了调用形统一。**读的是 HEAD `4e5be5a` 的工作树，运行时刻见 §2。**
2. **A 的实质成果是"复核"而不是"改写"**：`docs/22` 的服务方法**本来就全部**在调用形（19 处，0 处裸点号形）⇒ **未做逐行改写**（避免为形式而churn）；真正要改的是 `docs/29` 那处**为绕门而拆写**的回执，**已复原为调用形** `vmu.tasks.status()`。并用**两向探针**证明"恰好是键"的 13 行现在**靠调用形机械豁免**，不再靠"名字碰巧进键集/白名单"。
3. **B 有一条真债已还、一条已收窄**：`docs/29` §2 M4 第 3 条原写"**本卷未实测**"且给了一条**从没测过**的替代路径（`inject` 服务名且会话在场）—— 已按 R12 的**否证**结论改写；`§6/§7` 的仓内读数**整批刷新**为同一次运行（三个数变了）。
4. **两卷"转办"缺陷已修**：`docs/10` 的**同节自相矛盾**（④ 行说 `no-seam`、同节 :300 说 `no-binding`）＋ `docs/03:523` 的误导性"经 `createMeetings({ boxFor })` 声明"。
5. **★ 最终净状态（09:09:10，绑定到字节）**：我改的 **4 卷 docs 全绿**（`audit-vmu-docs` **95/0**、`check-docs` **PASS**、`audit-doc-index` 5/0、`audit-verbatim-claims` 3/0、`vmu-pack` 53/0、`vmu-motion-box` 23/0 …）；**唯一未转绿的是 `vmu-planned-settings`（RED 32/7）**，其根因**不在我的卷**：`scripts/generate-planned-settings.mjs` 缺"调用形跳过"（R269 设计过而未落）＋ `docs/11` 里 3 个名字（`vmu.meetings.bindBox`／`vmu.tasks.status`／`vmu.x.y`）—— **属 `vmu-verify2`／`settings/**`**。另：`audit-vmu-docs` **红过两段窗口**（我 08:54–09:04 报过一次稳红，**09:05:31 已被 verify2 修掉**，故我的"稳红"结论**已在 §5.2 标注作废**）。

---

## 1. A · 调用形统一（门落地后）

### 1.1 门落地确认（我自核的行）
| 读的是什么 | 读数 |
|---|---|
| `tests/audit-vmu-docs.test.mjs:348`／`:374`／`:399` | 三处正则**均**为 `…(?:\.[a-zA-Z0-9]+)+\b(?!\s*\()` ⇒ 紧跟 `(` 的点分记号＝**调用**，不是设置键 |
| 漂移守卫 | `literalCount === 3`（两收集点 ＋ 自探针必须同形） |
| 自探针 | ① 家族形仍不报 ② 命名空间仍不报 ③ **调用形不报（哪怕不是键）** ④ **裸键仍报** —— 排序＝先旧后新（`docs/11 §4.2` 第九条） |

### 1.2 `docs/29`：拆写复原为调用形
- §8 第 1 条实测读数里，原为**避门**而写成的 `call: { method: <服务 \`vmu.tasks\> 的方法 \`status()\` 调用> }` ⇒ **复原为** `call: { method: "vmu.tasks.status()", … }`（与 R12 原始回执一致）。
- 注脚改写为："门带负向前瞻 ⇒ **调用形可直接写**，且**不再依赖**这个名字碰巧是键"；原"拆写说明"删除（它引的 `assistant-round13-report.md` 已过期）。

### 1.3 `docs/22`：**复核**——19 处调用形的真实处境（两向探针）
| 项 | 数 | 明细 |
|---|---|---|
| `docs/22` 点分记号总出现 | **308** | 19 处在**调用形**，289 处在**裸形**（全部是真键／命名空间） |
| **非键**的点分名 | **6** | 全在 `NON_SETTING` 白名单：`vmu.ip.hold`／`vmu.ip.transfer`／`vmu.ip.ownership`／`vmu.ip.contributors`／`vmu.ip.recordSearch`／`vmu.collab.authorship` |
| 调用形里**恰好是真键**的 | **13** | `vmu.resource.reserve`／`scheduleMaintenance`／`attachCapture`、`vmu.funding.request`／`split`／`auditPack`、`vmu.conference.assign`／`register`／`schedule`、`vmu.compliance.require`／`prepare`、`vmu.dissemination.impact`／`mediaRequest`（均 `desc:""`，确实是 `settings/schema.js` 的键） |
| **裸点号形的服务方法** | **0** | ⇒ **本卷不需要逐行改写**（它们本来就在调用形） |

**★ 两向探针（用门的同一条正则 ＋ 机械抽取的 `NON_SETTING` ＋ `namespaces`；`D:\_tmp\vmu-r14-a\twoway.mjs`）**：
```
把 13 个键从键集里删掉（1229 → 1216）＋ 把白名单清空（最坏情况）：
(a) 旧规则（无前瞻）⇒ RED 19   ← 这正是"键一删同一行就会红"那类
(b) 新规则（有前瞻）⇒ RED  0   ← 靠的是调用形，不是键集、也不是白名单
(齿) 同名键形（不跟 '('）⇒ 仍 RED 1  ← 判据没被放宽成"存在即通过"
```
**⇒ 结论**：那 13 行以前只是"**碰巧**靠键集活着"，现在是**机械豁免**；那 6 个白名单名字同理。**这也说明"调用形豁免"确实能给 `NON_SETTING` 减负**（本卷 6 个名字在 `docs/22` 里 100% 只以调用形出现）——但白名单是 `vmu-verify2` 的文件，**我未动它**，把该事实转给了它。

### 1.4 写进 `docs/22` 的规则（L14 记账纪律 ④，节选）
> ④ **服务方法一律写调用形** —— `` `vmu.<服务>.<方法>(…)` `` 或同行短写 `` `方法(…)` ``。依据＝门 `:348` 的 `(?!\s*\()`。本卷 **19 处**与真键同名／同白名单 ⇒ R14 两向探针（**旧规则 19 红／新规则 0 红**，键形仍 1 红）证明是**靠调用形机械豁免**。**禁止**裸点号形。

---

## 2. 门禁读数（★ 写明是哪一次运行）

**我这一轮的三次运行**（每次都是"一批命令同一次跑"）：
| 运行时刻 | 用途 | 读数 |
|---|---|---|
| **2026-10-15 08:42:16** | 动手前的基线 | `audit-vmu-docs` **89/0**；`check-docs` **PASS（issues=0）** |
| **2026-10-15 08:45:53–08:47** | `docs/29` §6/§7 引用命令**整批重跑** | 见 §3.1 |
| **2026-10-15 08:49:20**（改 `docs/22`／`29` 后）＋ **08:53:34**（改 `docs/03`／`10` 后） | 回归 | `audit-vmu-docs` **89/0**；`check-docs` **PASS**；`audit-doc-index` **5/0**；`audit-verbatim-claims` **3/0**；`vmu-motion-box` **23/0** |

**我改完全部四卷后的回归（08:53:34 同一次）**：`check-docs` PASS／`audit-vmu-docs` **89 passed, 0 failed**（exit=0）／`audit-doc-index` 5/0／`audit-verbatim-claims` 3/0／`vmu-motion-box` 23/0。

**★ 第四次运行（2026-10-15 08:55:39）——门被 verify2 又改了，我的文档仍然绿**：`tests/audit-vmu-docs.test.mjs` 此时**已在树上被修改**（断言数上升），负向前瞻**仍**在（现在位于 `:355`／`:381`／`:406`，仍是**恰 3 处**）⇒ `audit-vmu-docs` = **95 passed, 0 failed**（**不再是 89** —— 89 是 08:42／08:49／08:53 那个版本上的读数）。其余同一批：`check-docs` PASS／`audit-doc-index` 5/0／`audit-verbatim-claims` 3/0／`own-pack/probe.mjs` exit=0。**⇒ 我改的 `docs/22`／`docs/29`／`docs/03`／`docs/10` 在"更新后的门"上同样全绿**（这也说明 89 与 95 的差别是**门自己的断言增加**，不是文档回归）。

### 2.2 ★★ 两个"读数与字节的时间关系"更正（由 `vmu-pack2` 指出，我接受）

**(a) 我的 08:53:34 那组读数不能证明覆盖 `docs/10` 的当前字节**：`docs/10-packs.md` 的 mtime ＝ **08:53:59**，**比我那组读数晚 25 秒**（我在 08:53:34 跑完门之后又改了该文件的**第 4 处**：`vmu-motion-box` 22 → 23）。⇒ 我已请 `vmu-pack2` 重跑，并**采用它绑定了哈希的读数**（**它的读数、它的版本**）：
| 门 | 读数 | 绑定的字节版本 |
|---|---|---|
| `check-docs` | **PASS，EXIT=0** | `docs/10` sha256 `09575cc64ec691b4`（88220 B，mtime 08:53:59）＋ `docs/27` sha256 `0cffc2853c0b1ced`；**运行前后两次取哈希相同** |
| `audit-doc-index` | **5 passed, 0 failed** EXIT=0 | 同上（运行后哈希未变） |
| `audit-verbatim-claims` | **3 passed, 0 failed** EXIT=0 | 同上 |
| `audit-vmu-docs` | **95 passed, 0 failed** EXIT=0 | 门自身 md5 `9614392feae5e6fe1c9f72e032a9e4e4`，46180 B，mtime **08:55:35** |

**(b) ★★ `audit-vmu-docs` 在磁盘上红过约 80 秒（08:54:13 → 08:55:35），窗口内的 T0/T1 读数作废**：`vmu-pack2` 在 **08:55:16** 读到 **`94 passed, 1 failed`，EXIT=1**（门版本 mtime **08:54:13**，46063 B），失败断言＝ **`★ SELF-PROBE (G2): a key mentioned ONLY in call form IS caught by this predicate`**（现文件 `:500-503`）。**该自探针是合成输入、不读任何文档** ⇒ 它红＝**判据自身在那半秒的版本里不对**，与 `docs/**` 的字节无关、也与我任何编辑无关。⇒ 按 `docs/11` ⑪（**扫描期间不得改变作业集合**），**落在这段窗口里的任何 T0/T1 读数都作废**（我已把这条同步给 Lead 与 verify2）。

### 2.3 `vmu-motion-box` 22 → 23 的**根因已查明**（不是漂移，是两个断言集）

`tests/vmu-motion-box.test.mjs:74-82` 由 **R14 `task-107`** 新增 **B5b**（「**不只读回执、直接读箱子自己的裁定**」：`k.ballotbox.close({boxId})` ⇒ `tally.cast === 1`）—— `vmu-core2` 独立复核一致（它报告里的 **22** 是 **B5b 之前／HEAD 原样**的读数，**我的 23** 是当前树的读数；**两个数都对，差的是断言集**）。我据此在 `docs/10` 把 22→23 处补上**该根因**，并声明引用须带时刻＋断言集。**我没有改过任何测试**（`tests/vmu-motion-box.test.mjs` 的 M 状态是 `task-107` 的）。

### ★★ 最终归属：`audit-vmu-docs` 的 **2 条红**与生成器 `missing from planned.js (5)` **全部落在 `docs/11`**（verify2 的文件，mtime 08:57:21）（★ 本节请与本报告 §2.1 对读：§2.1 的"不是我造成"**只对具名项**成立，**计数增量**以本节为准）

**我做的（先落一行核验）**：复刻生成器的收集（`BROAD_RE`，**无前瞻**）＋ 它自己的 `NON_SETTING`，逐一列出"文档点名但未登记"的名字与**卷来源**（`D:\_tmp\vmu-r14-a\gen-diag.mjs`）。**读的树：2026-10-15 09:03:14**：

| 未登记名 | 出现的卷（复刻结果） | 形态 | 归属 |
|---|---|---|---|
| `vmu.meetings.bindBox` | **11**（＋ 我曾误加在 `03`，**已改回服务限定短写**） | call=1 bare=0 | verify2 的 `docs/11`（我的部分已清） |
| `vmu.probe.call` | **11** | bare=1 | **verify2 的合成自探针样本**（`docs/11:147/157`） |
| `vmu.probe.ns.child` | **11** | bare=1 | 同上（`docs/11:148/157`） |
| `vmu.x.y` | **11** | call=2 bare=1 | 同上（`docs/11:149/153`） |
| `vmu.tasks.status` | **11**（bare=1）＋ 29（call=1，**我的逐字引文**） | call=4 bare=1 | **bare 那条在 `docs/11:153/157`**；我的 `docs/29` 是引文故保留 |

⇒ **`generate-planned-settings.mjs --check`（09:03:14）**：`missing from planned.js (5): vmu.meetings.bindBox, vmu.probe.call, vmu.probe.ns.child, vmu.tasks.status, vmu.x.y`。
⇒ **`tests/audit-vmu-docs.test.mjs`（09:03:14）**：**93 passed / 2 failed**，两条红**都点名 `(11-gates-and-development)`**：
1. `every vmu.* key named in the docs exists in settings/schema.js [vmu.probe.ns.child (11-…) | vmu.tasks.status (11-…) | vmu.probe.call (11-…)]` —— **判据的合成样本被写进了判据自己要扫的卷**；
2. `★ no planned key rests ONLY on a CALL-shaped mention … []` —— `docs/11:155` 把三个目标名（`vmu.dissemination.impact`／`vmu.dissemination.mediaRequest`／`vmu.meetings.open`）**以裸形**写出来（声称"实测恰好 3 个"），于是它们**不再是 call-only** ⇒ **该断言自己把自己判红**（复刻：`callOnly found = 0`；三个名字的 bare 计数分别为 3／2／3，`bareIn` 含 `11-gates-and-development`）。

**★ 一条必须自我更正的声明**：我在 08:49 给 `vmu-verify2`／`vmu-core2` 写过"**我未新增任何未登记的 `vmu.*` 名**"—— **这句是错的**。我事实上新增了两个三段点号名：`docs/29` 的 `vmu.tasks.status()`（**逐字引文，按 A 的要求保留**）与 `docs/03` 的 `vmu.meetings.bindBox(fn)`（**我的散文，已改为服务限定短写** `服务 vmu.meetings 的 bindBox(fn)`）。我当时的判断只对"**那 8 个具名失败项**"（它们在 HEAD 文档里已存在）成立，对**计数增量**不成立。**已改文档并已向 verify2／lead 发更正**（`docs/22` §④ 规则里也写进了这条"第二个消费者还没有前瞻 ⇒ 纯方法优先写服务限定短写"的判据，并且**当场的第三个实例是我自己在规则文本里又写了那个点号形**，已被我自己的复刻诊断抓出并改掉）。

**结论**：**`docs/22`／`docs/03`／`docs/10`（我改的卷）此刻贡献 0 条**未登记名（唯一保留的是 `docs/29` 的**引文**，它落在红名单里是因为 `docs/11` 另有一处**裸形**提及）。⇒ 这两条红与生成器的 5 条 missing **全部要在 `docs/11`（＋生成器加前瞻）里修**，属 `vmu-verify2`。**我未改 `docs/11`**（不在我本轮写范围）。

### 2.1 ★ 一条**不是我造成**的 RED（已具名转 `vmu-verify2`）
`node tests/vmu-planned-settings.test.mjs`：**08:45:53 还是 ALL GREEN（planned=114, docs=28, 39/0）**，**08:49:20 起 RED（passed=32, failed=7）**。
- **根因（工作树里未提交的他人改动）**：`git diff --stat scripts/generate-planned-settings.mjs` = **15 insertions / 8 deletions**，把 `NON_SETTING` 里 `ROUND 108`／`ROUND 270` 追加的 **10 个"服务面"名字退掉了**；该门**自己的输出**写着 `excluded (distinct names): … whitelist=0 namespace=0`、`STALE — settings/planned.js is not what the docs yield (123 planned keys)`、`key count 123/114`。
- **不是我引入的（可复核）**：失败点名 8 个名字 —— `vmu.members.may`／`vmu.tasks.create`（**docs/08**，我**没碰过**）＋ 6 个 `vmu.ip.*`／`vmu.collab.authorship`（docs/22）。我用 `git show HEAD:<卷>` 逐个核过：**这些名字在 HEAD 的文档里就已存在**（docs22 命中 5/4/1/1/3/1；docs08 命中 2/1）。
  - ★ **但要更正我下面这句原话**：我当时还写了"**未新增任何未登记的 `vmu.*` 名**" —— **对计数增量不成立**（详见上面的"最终归属"节与 §2.4 的自我更正）：我新增了 `docs/29` 的 `vmu.tasks.status()`（引文，保留）与 `docs/03` 的 `vmu.meetings.bindBox(fn)`（**已改回服务限定短写**）。**8 个具名项＝既有；增量里有过我的 1–2 条**，两条结论并存。
- **给 verify2 的提醒**：那 10 个名字要与"调用形豁免"配套退休，**生成器的收集正则也得同时带 `(?!\s*\()`**（`scripts/generate-planned-settings.mjs` 的 `BROAD_RE` 目前**无**前瞻），否则"只以调用形出现在文档里"的服务面会从白名单豁免**掉进**"未登记"红区 —— **现在正是这个状态**。它注释里"`--check` byte-identical／docs audit 同样绿"这句**与 08:49–08:51 的工作树不符**。

---

## 3. B · `docs/29` 残余复核

### 3.1 §6／§7 的仓内读数**整批重跑**（2026-10-15 08:45:53–08:47）
| 命令 | 文档原值 | **我这一次运行** | 处理 |
|---|---|---|---|
| `tests/audit-pack-face.test.mjs` | 5/0 | **5/0** exit=0 | 不变 |
| `D:\_tmp\own-pack\probe.mjs` | count=8／APPLY ok／delta=1 | **count=8 problems=[]／APPLY ok=true applied=8／busEntries=[module,rules]／M1 具名／M2 delta=1** | 不变（探针本轮**真重跑过**） |
| `tests/vmu-middleware-hooks-declared.test.mjs` | 8/0 | **8/0** | 不变 |
| `tests/vmu-script-bridge.test.mjs`／`vmu-script.test.mjs` | 34/0；18/0 | **34/0；18/0** | 不变 |
| `D:\_tmp\own-pack\probe-kinds.mjs` | 三层具名拒 | **`VMU_MIDDLEWARE_KIND_UNSUPPORTED`（script／plugin 各一次）**；`SUPPORTED_KINDS=["rules","module"]` | 不变 |
| `D:\_tmp\own-pack\probe-api.mjs` | 13 已发布服务 ＋ 三条具名拒 | **PUBLISHED = 13 个**；`VMU_NO_SUCH_OBJECT`／`VMU_INVALID_ARGUMENT`／`VMU_NOT_PERMITTED`；正向 `get('vmu.activity')` ok | 不变 |
| `tests/vmu-pack.test.mjs` | 53/0 | **53/0** | 不变 |
| `tests/vmu-settings.test.mjs` | 47/0 | **47/0** | 不变 |
| `scripts/generate-wired-schema.mjs --check` | `1554 -> 1554` | **exit=0；`1566 -> 1566`** | **已改**（docs/29 坑 2 行） |
| `tests/vmu-planned-settings.test.mjs` | `planned=113, docs=27, 39/0` | **08:45 时 `planned=114, docs=28, 39/0`**（08:49 起被 §2.1 的他人改动打红） | **已改**为 114／28（并标时刻） |
| `scripts/audit-hook-emit-classification.mjs` | 7/0 | **7/0** | 不变 |
| `check-docs`；`audit-doc-index`；`audit-vmu-docs` | PASS；5/0；**83/0**（§6）／**84/0**（§7） | **PASS；5/0；89/0** | **已改**两处为 89/0 |
| §2 M4 三步（真宿主）／§3 `--dump-config` | 【实测】 | **本轮未重跑**（需真宿主＋模型会话／需隔离 profile） | **未改**，加"读数时刻"说明 |

### 3.2 还掉的一条债：§2 M4 第 3 条
- **原文**：`⇒ 要在 M4 里消费 vmu 服务，要在会话作用域里拿（或 inject 对应 vmu 服务名且会话在场）——这一条本卷未实测（见 §8）。`
- **问题（两处）**：① 与紧邻的第 7 条**自相矛盾**（第 7 条写"**实测**：M4 行看不到会话级服务"）；② 给的替代路径（`inject` 服务名且会话在场）**从未测过** —— 属于"把没测的写成路径"。
- **已改为**：`⇒ "在 M4 插件行里消费 vmu 服务"这条路不成立（Round 12 实测否证：会话正跑着、工具真被调用，同一 boot 的 marker 里 tools.present=true 而五个 vmu 服务 present:false ⇒ 差的是作用域，不是配置或时序）…… 要消费 vmu 服务请走会话作用域的 M2 模块＋capabilities:['trigger-workflow'] 的 api.services.get（R11 实测）。`

### 3.3 残余"未实测"复查（改后 grep）
**只剩 1 处**：L6 的**约定说明**（"标【未实测】的须写清为什么"）——**不是债**。（§8 第 1 条的"（原'未实测'关闭）"是口径声明，本身不是标记。）⇒ **B 的债清零**：能测的都测了（§3.1 整批重跑），不能测的（M4 三步／dump）**明确标注为历史实测＋原因**，**未写成已验证**。

### 3.4 顺手核实的一条**不是**缺陷（避免误报）
§5 坑 3 引 `--expect-settings`／`--expect-delivery`。全仓 grep：这两个旗标**确实存在**，但属 **`tests/vmu-assistant-host-slice.test.mjs`**（头注释 :25–26 有用法行），**不是** `scripts/dsh-drive.mjs` 的。⇒ 原文**不算错**，但读者定位不到文件 ⇒ 我把文件名补进该行（并附 R8 的 `--session … --expect-delivery` **16/0 exit=0** 读数）。

---

## 4. 转办缺陷（Lead 直接指派 ＋ `vmu-core2` 具名转办）

### 4.1 `docs/10-packs.md` §4.11（Lead 指派；文件同时是 `vmu-pack2` 的写范围）
**同节自相矛盾**（Lead 原话："不修则下一轮还会从同一行读出同一个假缺口"）：

| 行 | 改前 | 改后 |
|---|---|---|
| ④ 行 | `❌ 待 core`；`:1118` `createMeetings({…, 无 ballot})` ⇒ `no-seam` | ✅ **已落**（轮 12 `248fb1e`；轮 14 复测裁决）：`:1130` **传 `ballot: meetingBallot`**；真装配未绑 ⇒ **`{mirrored:false,reason:'no-binding',code:'VMU_MEETING_BOX_UNWIRED'}`**；**`no-seam` 在真装配已不可达**（唯一入口＝不传 `ballot` 的**负对照**）；`boxFor` 按裁决 (i) **故意不传**。读数**具名归 core2**（HEAD `4e5be5a`，真机探针 18/0 exit=0） |
| ① 行 | `meetings.js:730` `boxFor: boxBinding` | **`:710`** `boxFor: boxBinding.resolve()` |
| ② 行 | 懒绑写在 `motion/propose` 处理器 | 实为 **`meeting/motion`**（`packs/v5r/middleware/motion-box.js:66-75`）—— `motion/propose` 是**全所**动议，与镜像问的**会议内**动议 id 对不上 |
| :300 | `kernel/index.js:1118` | **`:1130`** |
| 末行 | `vmu-motion-box` **22** passed | **23** passed（**我的运行 08:53:34，exit=0**） |

**我自己核过的**（不是转述）：`kernel/index.js:1130` 原文含 `ballot: meetingBallot`；`kernel/meetings.js:710` 是 `mirrorVote` 的调用点且传 `boxFor: boxBinding.resolve()`；`motion-box.js:66` 的 hooks 键是 `'meeting/motion'`；全仓 `boxFor` **不在** `createKernel` 的形参表里（故多传实参确被静默忽略）。
**未动**：`scripts/generate-seam-table.mjs:26` 的 `SEAMS` 不含 `ballot`/`boxFor`（属 `scripts/`，要连带 `--write/--check` 新鲜度）⇒ **只记录，转 verify2/Lead**。

### 4.2 `docs/03-interface-contract.md:523`（`VMU_MEETING_BOX_UNWIRED` 行）
- **原文**：`…（开箱是政策，R1；出处 kernel/meetingmarker.js 的 mirrorVote()，经 createMeetings({ boxFor }) 声明）`
- **问题**：把**内核内部工厂**的形参写成了装配侧"声明"路径；`createKernel` **没有** `boxFor` 形参 ⇒ 按字面照做的读者会得到一个**静默忽略**。
- **已改为**：装配侧**只有一条路**：服务 `vmu.meetings` 的 `bindBox(fn)`（注册／换绑／解绑）／`boxBinding()`（指向同表 `vmu.meetings` 行）；`createMeetings({ boxFor })` 是**内部工厂**形参（`kernel/meetings.js:100`）；并附 R14 复核实装配读数（未绑 ⇒ `no-binding`；`no-seam` 已不可达）。★ 这里**刻意用"服务限定短写"**（点号只到 `vmu.meetings`）而不是三段调用形 —— 理由见 §2.4 与 `docs/22` §④：生成器（判据的第二个消费者）**还没有**前瞻，三段调用形会被它当成"未登记的键"（我原先正是这样写的，**已被我自己的复刻诊断抓出并改掉**）。

**打扰声明**：`docs/10` 在树上是 `pack2` 修改中的文件 ⇒ 我已把**四处改动逐条**通知 `vmu-pack2`，请它以当前内容为基线继续，别用旧副本覆盖。

---

## 5. 收尾

### 5.1 收尾读数（★ 绑定到字节：2026-10-15 09:04:39，运行前后哈希相同）
| 卷 | sha256(前 16) | bytes | mtime |
|---|---|---|---|
| `22-academic-operations.md` | `64DDA084FFDA5F18` | 168154 | 09:03:04 |
| `29-build-your-own-preset.md` | `DFBD2462EF60FA93` | 41947 | 08:49:02 |
| `03-interface-contract.md` | `8DE34A09DAC68C36` | 260594 | 09:01:32 |
| `10-packs.md` | `98A3345FC8A4E08E` | 88453 | 08:57:14 |

| 门 | 读数（09:04:39 同一次） |
|---|---|
| `scripts/check-docs.mjs` | **DOC LINT: PASS** exit=0 |
| `tests/audit-doc-index.test.mjs` | **5/0** |
| `tests/audit-verbatim-claims.test.mjs` | **3/0** |
| `tests/vmu-motion-box.test.mjs` | **23/0** |
| `tests/vmu-pack.test.mjs` | **53/0** |
| `tests/vmu-middleware-hooks-declared.test.mjs` | **8/0** |
| `scripts/audit-hook-emit-classification.mjs` | **7/0** |
| `scripts/generate-wired-schema.mjs --check` | exit=0（333 emitted／782 pre-existing／5 service surfaces／6 honest null） |
| `tests/audit-vmu-docs.test.mjs` | **93/2** —— 两条红**全部在 `docs/11`**（见 §2.4） |
| `tests/vmu-planned-settings.test.mjs` | **RED（32/7）** —— 生成器缺前瞻 ＋ `docs/11` 的裸形样本（见 §2.4） |

### 5.2 ★★ 终局更正（2026-10-15 09:06:52，绑定到字节、运行前后哈希相同）—— **`audit-vmu-docs` 已转绿**
`vmu-verify2` 在 **09:05:31** 又改了一次 `docs/11`（sha256 **`0841D799095BAC9C`**、229692 B）⇒ 清掉了它自己写进卷里的合成样本，并把那三个名字改成**调用形**：

| 门 | 09:04:39（我上表） | **09:06:52（终局）** | 说明 |
|---|---|---|---|
| `tests/audit-vmu-docs.test.mjs` | 93/2（红全在 docs/11） | **95 passed / 0 failed，exit=0** | **§2.4 的"稳定红"结论到此作废**（我在 09:03–09:04 对 Lead／verify2 报的"93/2 稳定红"**已过期，以本行为准**） |
| `scripts/check-docs.mjs` | PASS | **PASS** | 不变 |
| `scripts/generate-planned-settings.mjs --check` | `missing (5)` | **`STALE — 117 planned keys`；`missing from planned.js (3): vmu.meetings.bindBox, vmu.tasks.status, vmu.x.y`** | `vmu.probe.*` 已清；余下 3 个**都在 `docs/11`**，且都是"生成器缺 `(?!\s*\()` 前瞻"这一类 |
| `tests/vmu-planned-settings.test.mjs` | RED(32/7) | **RED(32/7)** | **唯一仍未转绿的门**；原子修法＝生成器加前瞻 ＋ 重新生成 `settings/planned.js`（verify2 自己的 `docs/11:152` 已判定） |

⇒ **本轮的最终净结果**：`docs/22`／`29`／`03`／`10` 四卷在 **`audit-vmu-docs` 95/0、`check-docs` PASS、`audit-doc-index` 5/0、`audit-verbatim-claims` 3/0** 下全绿；**唯一遗留**是 `vmu-planned-settings`（其根因在 `scripts/` 与 `docs/11`，均非我写范围）。

### 5.3 ★ 最终读数（2026-10-15 09:09:10，绑定到字节、运行前后哈希相同）—— 我最后一处编辑已回归绿
`docs/22` 因追加两段规则而改变字节（`64DDA084FFDA5F18` → **`C4BC5C200C990E84`**，169563 B），**最终读数**：`check-docs` **PASS**／`audit-vmu-docs` **95 passed / 0 failed（exit=0）**／`audit-doc-index` **5/0**／`audit-verbatim-claims` **3/0**／`vmu-pack` **53/0**。

★★ **本报告必须记下的一次"当场自打脸"（同一条坑的第三个实例，作者是我）**：我按 `vmu-verify2` 的要求把"门读的卷就是门自己的输入"写进 `docs/22` §④ 时，**在同一句话里把三个"只靠调用形成立"的名字写成了裸形** ⇒ `audit-vmu-docs` 的 G2 断言**当场转红**（`FAIL ★ no planned key rests ONLY on a CALL-shaped mention … [vmu.dissemination.mediaRequest]`，09:08:36）—— 也就是**我在解释这条坑的同时又踩了它**。修法：把这 3 个名字改写成**调用形**（`vmu.dissemination.impact(…)` 等）⇒ 09:09:10 回归 95/0。**结论**：这条判据**极其容易被"写文档"这个动作本身触发**，所以它必须与"引用前先落一行核验"配套使用 —— 每次改完正文卷，**立刻重跑该门**（我这次是 3 分钟内自己抓到的，靠的就是这条纪律）。

### 5.4 纪律与遗留

- **未跑全量 sweep／未 `regen-all`／未做任何 git 写操作**（`git status`／`git show`／`git diff` 只读）✓；**未起实例**；**未复制凭据**（本轮无需）✓；临时文件全部在 `D:\_tmp\vmu-r14-a`（`inventory.mjs`／`classify.mjs`／`callform.mjs`／`twoway.mjs`／`gen-diag.mjs`／`g2-diag.mjs`，可复跑，只读）。
- **本轮的写操作仅四卷 docs**：`22`／`29`／`03`／`10`（`10` 是 Lead 指派，已逐个通知其 owner `vmu-pack2`：以当前内容为基线，别用旧副本覆盖）。
- **未还的债（具名）**：① `vmu-planned-settings` 的**工作树 RED**（根因＝他人未提交的生成器改动，见 §2.1）；② `scripts/generate-seam-table.mjs` 的 `SEAMS` 不含 `ballot`/`boxFor`（`scripts/` 不属我）；③ §2 M4 三步与 §3 `--dump-config` 本轮**未重跑**（已在卷内标注为历史实测＋原因，**未写成已验证**）。
- **给下一轮的判据**：引用门禁读数**必须写明运行时刻**；服务方法**一律调用形**（`docs/22` L14 已有规则）；"恰好是键"不再是风险（门有负向前瞻 + 本报告 §1.3 的两向探针）。

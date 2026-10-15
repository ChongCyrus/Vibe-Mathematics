# Round 15 组织草案（Lead · Round 14 收尾后）

> **Round 14 结果（已 commit `e40207b` 并 push）**：T0 **25/25**、T1 `GATE_SCOPE=vmu` **308/308**；25 文件、+937/−169。
> **★ B③/B④ 落地**（59 条断言）：`overrideOrder`（仅 chair／必须 why／**未声明即拒**／四重留痕／回执点名键）＋ **`random` 确定性可审计**（djb2 种子＋按成员定键排序，**无 `Math.random`**，种子与 order 同进回执）；`flow` **四模式各有实测可观察差异**（`open` 无队列／`hands` 到达序／`round_robin` 发言计数序／`call_on` 主席指派）；合并名 **具名拒并点名替换者**（`single`→`hands`、`directed`→`call_on`，**不是静默别名、也不新增第 5/6 模式**）。
> **★ 三处"幽灵设置键"修好**：生成器缺"调用形"规则 ⇒ `vmu.dissemination.impact()`／`mediaRequest()`／`vmu.meetings.open()` 被登记为 `planned:true, def:null` ⇒ **设置表承诺了不存在的旋钮**。加规则（**在调用点、不进 `BROAD_RE`**；**顺序有讲究**：放在 existing/whitelist/namespace **之后**，否则与测试的独立复算不一致）＋新 `serviceCall` 桶＋**两个消费者同步**＋G2 台账清空（"修好就删行"）＋成熟度行 12→10 ⇒ **planned 114→111**。
> **★ "取得↔释放"门自我证伪**：它对 `storepolicy.js` 的裁定（"调用内不取锁"）**是假的**——那是全内核唯一取锁面；根因＝取得词表**刻意跳过"定义"**，"这个文件就是锁"**没有词可用** ⇒ 加**第五个闭集词**＋`不涉及` 收紧 ⇒ **23/0、selftest 14/0、RULE E 67=67**。
> **★ 两处前提是陈旧的，队友拒绝照做**：task-106 的"装配缺口"**R12 已修**（core2 三条真装配探针 18/0，含**独立回读箱子**，**0 kernel 编辑**）；task-107 的"调用形豁免未落"**已在 HEAD**。两人都**指出陈旧文档行**（`docs/10` 同节自相矛盾）——那就是假前提的来源。
> 队友 provider 已由 Lead 改到 **commandcode**：**旧 8 人不可换后端**（身份字段不可变＋roster 不可删）⇒ 提升 `maxMembers: 8→16`（**热生效**）＋**新名重招** 6 人（`vmu-core2`／`verify2`／`comms2`／`pack2`／`activity2`／`assistant2`），全部跑通。

## ★ Round 15 首项：**把"能做到"变成"被守住"**

| # | 项 | 归谁 | 说明 |
|---|---|---|---|
| 1 | **`task-111`：open ballot 回执伪造 `tally`**（`meetings.js:693/708`：`vote({motion:null})` 回 **`tally:{0,0,0}`** 而同一调用 `counters.votes+=1`＋minutes 真写入）⇒ **第一步＝诚实**（不许声称计数：`tally:null`＋具名说明＋断言"**回执不许多报**"）；**第二步**＝先查 **v5r 原始代码有没有 open ballot 机制**，有就按 v5r 实现、没有就**具名"不接"**（不许为对称造机制）；＋ `docs/03:523` 措辞 ＋ `SEAMS` 白名单可见性 | 新队友 | 这是"回执说成功、事没按回报的那样做"那一类 |
| 2 | **comms2 的 59 条断言进仓**（现在只在 `D:\_tmp\vmu-r14\order14.mjs`）⇒ 常驻化，建议接进 `tests/vmu-meetings.test.mjs`（`mk/opened` 缝同形）；**先搬 C8 那组**（"回执说成功 ≠ 事真的做了"：审计行真的进 minutes／环真的落／**`restore()` 后仍按覆盖**） | 新队友 | **"能跑" ≠ "被守住"** |
| 3 | **7 个清单外文件**：`docs/audit/` 6 份 ⇒ **具名豁免**；`packs/example-data/README.md` ⇒ **登记出货**（豁免表形状：精确路径/理由/谁批/何时复审 ＋ **"豁免一条已登记的路径 ⇒ 红"** 反漂移开关） | 新队友 | `files[]` 与 `PRESETS` 必须同改，否则 `audit-installer-policy §8` 红 |
| 4 | **"预设源根磁盘闭包"门**（pack2 提案，6 条判据，★ 种一个 `packs/<id>/` 下**无 import 指向的纯数据文件**未登记 ⇒ 必须红）＋ `files→PRESETS` 那条边**留在 `audit-installer-policy`**（**一个事实一个门**） | 新队友 | 今天两门都看不见这一格 |

## 其余待办

| # | 项 | 归谁 | 说明 |
|---|---|---|---|
| 5 | **`docs/04` 的 `vmu.meetings.orderMode` 行**（值域仍 `—`、默认 `fifo`）＝ 应为 `fifo｜round-robin｜chair｜random` | 新队友 | comms2 的具名未做（`docs/04` 当时归 verify2） |
| 6 | **`docs/08 §19.1` 的"计划值域"漂移**（写 `hands｜round-robin｜seat｜weighted｜unspoken-first`，实际 `fifo｜round-robin｜chair｜random`）＝ **既有漂移**，改它要动计划表计数与生成链 | 新队友 | 具名登记，别静默改 |
| 7 | **`SEAMS` 白名单**（`scripts/generate-seam-table.mjs:26` 不含 `ballot`/`boxFor`）⇒ 扩白名单（连 `--check` 新鲜度）或在矩阵具名"此族不在该门视野内" | 新队友 | core2 具名 |
| 8 | **矩阵 v13**＋证据：并入 R14 全部闭合项（B③/B④／三幽灵键／取得↔释放门自我证伪／成员门有牙且文档说没牙／两处陈旧前提／`docs/29` 债清零／两条量具假象） | 新队友 | `ConvertFrom-Json` 失败×1、`Get-Content` 800 vs 810×1 |
| 9 | **`docs/11 §4.2`**：第九条的新实例（**探针样本必须与被扫集合物理隔离**；**门把自己的发现写进被扫卷会擦掉发现**） | 新队友 | 两条都已由 verify2/assistant2 实测 |

## 已下的裁决（本轮，供后续遵循）

1. **`vmu.agenda.reorderAudit` 不进 `enforced[]`**（comms2 的具名偏离）：该键的真实读者在 `kernel/governance.js`，而**本次调用没读它**；写进去会让"读了/生效了"不可分（`audit-enforced-consistency` 正是抓这个）。**保留事件路径**（本面已发 `meetings/order-override`／`meetings/floor-flow` ⇒ **pack/中间件**可在钩子上调治理面）——比让内核 import 治理面更合 R1。
2. **B③/B④ 的归属面是 `kernel/meetings.js` 的 policy/guard 属主**，不是逐对象原语面 `kernel/meeting.js`（后者未动，正确）。
3. **`flow` 与 `overrideOrder` 同槽同闸**（`by`/`why`/声明三闸）：否则 `flow` 就是绕过 B③ 三道闸的洞。
4. **`kernel/meetings.js` 已 1196/1200** ⇒ 本面任何扩展**必须搬族**进 `kernel/meetingmarker.js`（492/1200）或新模块；**禁止**把它写进 `KNOWN`（backlog 只许缩）。
5. **队友容量**：旧 8 人不可换后端、不可删；`maxMembers` 已提到 16 ⇒ 需要人手时**用新名字 spawn**（新成员**继承 Lead 当前路由**）。

## 纪律（沿用；本轮新增两条实测教训）

- **★ 新：结论里的服务方法一律写"调用形"**（`` `vmu.dissemination.impact()` ``）——**裸写会把它铸成 phantom planned 键**（**我自己踩了一次**，被两个门当场抓到）。
- **★ 新：合成探针样本必须与被扫集合物理隔离**；**门不得把自己的发现（具体名字）裸写进被扫的卷**（会把发现擦掉）。
- 既有：门禁必须证明有牙／判据与环境一致／观测量两档真的不同／"我没找到"≠"它不存在"／**回执说成功必须与事真的做了分开断言**／门禁必须读事实所在的那种文本／重构必须原子＋每步跑加载内核的套件／清理只删本次显式创建的精确路径／**引用前先落一行核验并写明"读的是哪一次运行"**。
- 轮末由 Lead 统一 `update-doc-counts → regen-all → generate-wiring-index → T0 → T1 → commit → push`；**不发布**。

# Round 14 · task-108 · B③ `overrideOrder` ＋ B④ `flow` 四模式（★ **已落** ✓）

- **状态**：**A–E 全落**（B③ 规则＋状态＋留痕／B④ 四模式／断言／工具面／文档）。**两处具名未做**见 §G。
- **纪律**：未跑全量门禁（T0/T1 归 Lead）、未 `regen-all`、**未 git**；临时文件全在 `D:\_tmp\vmu-r14`；**结构性编辑全部是定点 `edit`**（无整文件重写、无 `write` 覆盖他人文件）；**每步跑"加载内核"套件**（改 `meetingmarker.js` 后 → 206/0＋161/0；改 `meetings.js` 后 → 161/0＋206/0＋175/0；改工具面后 → 150/0）。
- **核验口径（引用前先落一行）**：本报告所有读数取自 **2026-10-15 09:09:34–09:10:11 +08:00** 的**同一次运行**，文件指纹见 §F。此后若他人再改这两个文件，读数需重取。
- **写点**：`kernel/meetingmarker.js`（规则族，247→**492** 行）、`kernel/meetings.js`（状态/调用点，HEAD **1182**→**1196**/1200，**+14 行**；与门禁同口径的 `split('\n')`）、`tools/meeting.js`（+2 action）、`vibe-math-vmu/docs/08`（§25.16 新增＋§25.14 两处状态更正）。**未动** `kernel/meeting.js`（B③/B④ 不属该面，见 §G-5）、**未动** `docs/17`（该卷无相关声明，见 §G-6）、**未动** `tests/**`（本轮归 vmu-verify2）。

---

## A · B③ `overrideOrder({meeting, by, why, mode})` —— **已落** ✓

| 维度 | 落地形状（file:line） |
|---|---|
| 值域＋`random` | `kernel/meetings.js:168` `orderMode: oneOf(sget('vmu.meetings.orderMode'), ['fifo','round-robin','chair','random'], 'fifo')`；单源常量 `kernel/meetingmarker.js:285` `ORDER_MODES` |
| 仅 chair | `kernel/meetingmarker.js:391` `rails()`：`by` 空 ⇒ `VMU_INVALID_ARGUMENT`；**会议未声明主席** ⇒ `VMU_ENGINE_UNAVAILABLE`（不发明权威）；非主席 ⇒ `VMU_NOT_PERMITTED`＋hint 点出已声明主席 |
| 必须 `why` | `kernel/meetingmarker.js:410` `reasonOf()`（空/纯空白 ⇒ `VMU_REASON_REQUIRED`） |
| **未声明即拒** | `kernel/meetings.js:111` `isDeclared()`（**代码默认值不是声明**）＋ `kernel/meetingmarker.js:401` `!declared(ORDER_KEY)` ⇒ `VMU_ENGINE_UNAVAILABLE`（默认＝不可覆盖，零机制） |
| 生效＝覆盖优先 | `kernel/meetingmarker.js:337` `effective()`：有覆盖 ⇒ `source:'override'`／`modeSource` 上报；`kernel/meetings.js:614-628` `queue()` 只在 `source==='setting'` 时把 `vmu.meetings.orderMode` 计入 `enforced[]`（**覆盖在force时该键不再被读 ⇒ `enforced:[]`**） |
| 留痕四件 | `kernel/meetingmarker.js:419` `commit()`：① `m.orderOverride`（随记录进 `snapshot()/restore()`）② append-only `minutes.entries` 行 `kind:'order-override'` ③ `audit(...)`→面里 `say({type:'meetings/order-override'})` ④ `pushReceipt`（经 `withScope` 带 `enforced:['vmu.meetings.orderMode']`＋`enforcedScope`） |
| 回执点名键 | `kernel/meetings.js:393-395` `api.flow`／`overrideOrder`／`orderView` 全走既有 `withScope()` ⇒ 回执/返回都带 `enforced:['vmu.meetings.orderMode']` |
| `random` 确定性可审计 | `kernel/meetingmarker.js:297` `orderSeedOf`（djb2，**无 `Math.random`**）＋ `:309` `randomOrderOf`（**按成员定键排序**，不是洗牌位置）＋ `:464` `overrideOrder` 把 **`seed` 与结果 `order` 同写进回执**；`kernel/meetings.js:624` 的 `queue()` 回执也带 `seed` |

**★ 覆盖「真的变了」的硬证据（C4a–C4d，实测）**：声明 `orderMode:'fifo'`、`r-1` 已发言 2 次 → `queue()` 序 `r-1,r-2`；`overrideOrder({mode:'round-robin'})` 之后同一个 `queue()` 序变 **`r-2,r-1`**。

---

## B · B④ `flow({meeting, mode, by, why})` —— **已落** ✓（四模式，各有一处**可观察差异**）

`kernel/meetingmarker.js:432` `flow()`；单源常量 `:288` `FLOW_MODES`、`:294` `FLOW_ORDER`。

| mode | 可观察差异（**实测**，C5a–C5g） |
|---|---|
| `open` | **无队列**：`queue()` 回 `queued:false`／`order:[]` 且**不存位**（唯一队列恒空的模式）；`speak()` 对**从未排队**的成员照常成功，回执 `floor:{mode:'open',queueOpen:false}` |
| `hands` | 一次一人、**举手（到达）序**；**任何成员自助取位**（`queued:true`，order＝到达序） |
| `round_robin` | 一次一人、**按已发言次数升序**（已发言者排后：`r-2,r-1`） |
| `call_on` | 一次一人、**位次由主席给**：非主席自助取位 ⇒ `VMU_NOT_PERMITTED`；主席 `by:'acad'` 取位 ⇒ `order` 保留主席次序；**未声明主席** ⇒ `VMU_ENGINE_UNAVAILABLE`（C5j） |

- **合并（R8 裁决）**：`FLOW_MERGED`（`:291`）＝ `single→hands`、`directed→call_on`；传旧名 ⇒ **具名拒** `VMU_INVALID_ARGUMENT`，**hint 点名替换者**（C6c/C6d）——不是静默别名，也不是第 5/6 个模式。
- **未知 mode** ⇒ `VMU_INVALID_ARGUMENT`（C6a/C6b）。
- **与 B③ 同一槽同一闸（决策，见 §I-2）**：`flow` 与 `overrideOrder` 都写 `m.orderOverride` ⇒ 同为**仅主席＋必须 `why`＋未声明即拒**；否则 `flow` 就是绕过 B③ 三道闸的洞。

---

## C · 断言（要求 ≥6；**实为 59**，九组 ＋ 5 条变异）

探针 `D:\_tmp\vmu-r14\order14.mjs`（**59 passed / 0 failed，exit=0**），映射到任务点名的六条：

| 任务要求 | 探针条目 |
|---|---|
| 非 chair 拒 | C1a（overrideOrder）／C1b（flow）／C1c hint 点名主席／C1d 拒因带 `enforced[]`／C1e 主席可做（非一刀切） |
| 无 `why` 拒 | C2a（overrideOrder）／C2b（flow）／C2c 空白 `why` 不算理由 |
| 未声明即拒 | C3a 前置（代码默认值在force）／C3b／C3c（flow 同一闸）／C3d 拒因点名键／C3e 声明后同一调用成功 |
| 覆盖后顺序**真的变** | C4a 前置（fifo 插入序）／C4b 设置下点键／C4c 覆盖上报 `previous`／**C4d 序由 `r-1,r-2`→`r-2,r-1`**／C4e `modeSource`／C4f 覆盖后 `enforced` 空／C4g `orderView` 可读／C4h 点 `vmu.meetings.orderMode` |
| 四模式可观察差异 | C5a/C5b（open 无队列）／C5c（hands 到达序＋自助）／C5d（round_robin 计数序）／C5e–C5g（call_on 仅主席）／C5h 非空前置／C5i 四者互相可区分／C5j 无主席具名拒 |
| 未知 mode 拒 | C6a／C6b；**合并名具名拒** C6c（`single`→hint 含 `hands`）／C6d（`directed`→hint 含 `call_on`） |
| 额外：`random` 可审计 | C7a 种子形（8 hex）／C7b 非空前置／C7c 两次同序／C7d 是严格置换／C7e 种子＋结果 order 同进回执／C7f 新成员不重排他人 |
| 额外：**回执说成功 ≠ 事真的做了** | C8a 审计行真的落进 minutes／C8b 回执环真的落／C8c 两者同一时刻同一 mode／C8d flow 同样留痕／C8e 效果真的发生／C8f 覆盖随记录进 `snapshot()`／C8g **`restore()` 后仍按覆盖** |
| 额外：工具面真到达 | C9a action 枚举公开／C9b flow 穿工具到服务／C9c overrideorder 同／C9d 未知**服务** id 具名拒／C9e 无服务具名拒／C9f 缺 by/reason 具名拒 |
| 额外：**变异**（门禁必须能失败） | C10a 变异锚存在／C10b 真体未声明⇒拒／**C10c 拆掉能力闸的变异体⇒同一调用通过**／C10d 真体非主席⇒拒／**C10e 拆掉权威闸的变异体⇒通过** |

**RULE E（集合断言非空前置）**：C5h/C7b/C1d/C8b 等都在**同一表达式**内钉非空（`seen` 四模式计数、队列长度、`enforced` 长度、回执环计数并打印）⇒ `node tests/audit-declaration-criterion.test.mjs` 的 **`RULE E fingerprints: current=67 = baseline=67`**（**未推高基线**，我的文件不在新增指纹里）。

---

## D · 工具面（D）—— **已落** ✓

- `tools/meeting.js:21` action 枚举＋`:20` 说明新增 **`flow`**／**`overrideorder`**；`:40` 新增 `mode` 参数（闭集枚举）；`:151-160` 两个 action 的 `run` 分支 → `kernel.meetings.flow/overrideOrder`。
- **★ id 空间（明写在 action 说明里，不靠猜）**：这两个 action 寻址 **`vmu.meetings` 服务记录**（`kernel/meetings.js` 的 `live` 表），**不是** action `open` 造的逐对象会议 id（那走 `kernel.liveMeeting`）。未知 id 由**服务**具名拒（`VMU_NO_SUCH_OBJECT`，hint 列出在活记录）；`kernel.meetings` 未装配 ⇒ `VMU_ENGINE_UNAVAILABLE`（不静默）。
- **没有 kernel 方法前不落**：两个 action 在 §A/§B 的方法落地并跑绿之后才写（本次会话顺序即证据）。

---

## E · 文档（`docs/08`；`docs/17` 无需改）

- **新增 §25.16**（`docs/08` 第 1548 行后）：B③/B④ 的**已落**形状表、四模式可观察差异表、合并说明、`random` 的种子/回执形状、**该模块导出面逐字**（供 `audit-module-coverage` 认领整个面）、工具面 id 空间、具名未做。
- **更正 §25.14 的两处状态**（第 1522 行表头、1525 行 B-3、1526 行 B-4）：由"★ 未落"改为"★ **R14 已落**（§25.16）"，**裁决原文逐字保留**。
- **更正 §25.13 GAP-MTG-06a 行**（第 1500 行）：「本轮」列由"**未落**（design-only）"改为"**R14 已落 ✓**（收敛为四模式…见 §25.16）"。
- `docs/17` **未改**：全卷对 `flow`／`发言序` 的命中都是 `vmu.workflow.*`（升级/认领），**没有任何关于发言序/flow 的声明**可更正（§G-6）。

---

## F · 实测（原样命令 ＋ 退出码；同一次运行 2026-10-15 09:09:34）

**文件指纹（写后核验行）**
```
vibe-math-vmu/kernel/meetings.js        lines=1196  sha256[0:16]=A46147BDC77E21FD
vibe-math-vmu/kernel/meetingmarker.js   lines=492   sha256[0:16]=0DA68FAE177DA191
vibe-math-vmu/tools/meeting.js          lines=168   sha256[0:16]=961124AB13AA13CA
vibe-math-vmu/docs/08-…-workflow.md     lines=1642
```

```
node D:\_tmp\vmu-r14\order14.mjs                        → ORDER14 PROBE: 59 passed, 0 failed        exit=0
node tests/vmu-meetings.test.mjs                        → VMU MEETINGS: 161 passed, 0 failed        exit=0
node tests/vmu-meeting-parity.test.mjs                  → vmu-meeting-parity: 206 passed, 0 failed  exit=0
node tests/vmu-kernel.test.mjs                          → VMU KERNEL: 175 passed, 0 failed          exit=0
node tests/vmu-entry.test.mjs                           → VMU ENTRY: 150 passed, 0 failed           exit=0
node tests/audit-code-size.test.mjs                     → CODE SIZE: 9 passed, 0 failed             exit=0
node tests/audit-enforced-consistency.test.mjs          → VMU ENFORCED CONSISTENCY: 358 passed, 0 failed  exit=0
node tests/audit-module-coverage.test.mjs               → MODULE COVERAGE: 6 passed, 0 failed       exit=0
node tests/audit-vmu-docs.test.mjs                      → VMU DOCS AUDIT: 95 passed, 0 failed       exit=0
node tests/audit-doc-vs-code-tables.test.mjs            → DOC VS CODE TABLES: 17 passed, 0 failed   exit=0
node tests/audit-claim-traceability.test.mjs            → CLAIM TRACEABILITY: 5 passed, 0 failed    exit=0
node tests/audit-table-integrity.test.mjs               → TABLE INTEGRITY: 7 passed, 0 failed       exit=0
node tests/audit-package-membership.mjs                 → PACKAGE MEMBERSHIP: 13 passed, 0 failed   exit=0
node tests/vmu-ab-v5r-meetings.test.mjs                 → VMU AB v5r meetings: 122 passed, 0 failed exit=0
node tests/vmu-resume-e2e.test.mjs                      → VMU GOAL1 E2E: 108 passed, 0 failed       exit=0
node scripts/check-docs.mjs                             → DOC LINT: PASS                            exit=0
node scripts/generate-zero-mechanism-matrix.mjs --check → 96 modules, 0 mismatches, 0 unregistered, 0 EXPECT_UNDECIDED, 9 probe-errors, 4 n/a  exit=0
node tests/audit-declaration-criterion.test.mjs         → RULE E fingerprints: current=67 = baseline=67；唯一 FAIL＝`regen-all --check`（Lead 的轮末 regen，非我）
```

**★ 中途被我自己撞红、又修好的两道门（不得隐藏）**
1. `audit-enforced-consistency` 由 **357/1 → 358/0**：我第一版让 `meetingmarker.js` 的**代码里出现 `enforced`** ⇒ 该门按"代码提到 enforced 的模块必须被覆盖"判 `UNCOVERED-MODULE@meetingmarker.js`。**修法不是加豁免行（`tests/**` 不在我写范围）**，而是回到本仓既有的**词汇缝**：规则模块只报 `keys`，`kernel/meetings.js:386/393-395` 用**既有 `withScope()`** 映射成 `enforced[]`＋`enforcedScope`（`kernel/meetingleave.js` 同一条缝）。实测：`meetingmarker.js` 的**代码级** `enforced` 命中 **0**（同门同口径的 strip-comments 扫描）。
2. `audit-module-coverage` 由 **5/1 → 6/0**：新增 7 个导出必须被**某一卷**逐字点名 ⇒ §25.16 C 段列出全模块 12 个导出（含既有 5 个）；`docs/08` 由"缺 12"变成 **missing=0**，成为最佳覆盖卷。
3. `audit-claim-traceability` 曾 **5/1**：我在 §25.16 写的"（C1–C9 九组）"被该门的 claim-id 正则（`\b[CDFG]\d{1,2}\b`）当成引用 `C9` ⇒ 改为"九组"。修后 5/0。

**★ 两条非我红（具名、含归属，我未代改）**
- `tests/vmu-planned-settings.test.mjs` ⇒ **RED(32/7)**：未注册名 `vmu.x.y`／`vmu.tasks.status`／`vmu.meetings.bindBox` **全部出自 `11-gates-and-development.md`**（vmu-verify2 本轮的"调用形豁免/自探针"文本），且 `planned: STALE — 117 planned keys`（`settings/planned.js` 与文档不同步）。**owner＝vmu-verify2（task-107：`tests/**`＋`docs/04/11`＋`settings` 生成链）**，与本任务的 `docs/08`／kernel 改动无关。
- `tests/audit-declaration-criterion.test.mjs` 的唯一 FAIL＝`regen-all --check really runs green` ⇒ **归 Lead 的轮末 regen**（自 R4 起即如此）。

---

## G · 具名未做／边界（做不完就说，不留半成品）

1. **`docs/04` 的 `vmu.meetings.orderMode` 行未改**（值域仍 `—`、默认 `fifo`）。该卷本轮归 **vmu-verify2**（task-107 写范围含 `docs/04`），**不在我写范围**；键本身**已在 schema**（`settings/schema.js:1229`，`type:'string'` ⇒ 值域不构成 schema 冲突），故**不阻塞**。
2. **`docs/08 §19.1` 第 882 行的"计划值域"仍未改**：`hands｜round-robin｜seat｜weighted｜unspoken-first` 与代码实际值域（`fifo｜round-robin｜chair｜random`）**不符**——这是 §19 计划表的**既有漂移**（早于本轮），改它要动计划表计数与生成链，**我只登记不改**（§25.16 E）。
3. **`vmu.agenda.reorderAudit` 没有进 `enforced[]`（对裁决原文的具名偏离）**：该键的真实读者是 **`kernel/governance.js`**（议程重排留痕），**本次调用没有读它**；写进去会让"读了/生效了"不可分（`audit-enforced-consistency` 正是抓这个）。替代路径更合 R1：本面**已发事件** `meetings/order-override`／`meetings/floor-flow` ⇒ **pack/中间件**可在钩子上调治理面，**不必**让内核 import 治理面。若 Lead 要内核直连 ⇒ 需一条跨面调用（**本轮范围外**，请裁决）。
4. **`speak_order_set`／`speak_next` 的"命令名"未落**（GAP-MTG-06b 的命名）：本轮落的是 `flow`／`overrideOrder`／`call_on` 三件能力，**命令名不同**；已在 §25.16 E 具名。
5. **`kernel/meeting.js` 未改**：B③/B④ 的归属面是 `kernel/meetings.js`（`pushReceipt`／`enforced['vmu.meetings.orderMode']`／`orderMode`／`queue()` 的 `round-robin`·`chair` 分支），`kernel/meeting.js` 是**逐对象原语**面（`hands`/`agendaClose`），不需要改；它的 `hands` 管理面**未动**。
6. **`docs/17` 未改**：该卷无相关声明（命中全是 `vmu.workflow.*`）。
7. **`tests/**` 未写**（本轮写范围归 vmu-verify2）：我的 **59 条断言在 `D:\_tmp\vmu-r14\order14.mjs`**，**未进仓**。若 Lead/verify 要把它们**常驻化**，建议接进 `tests/vmu-meetings.test.mjs`（该文件的 `mk/opened` 缝与我探针同形）；我**未擅自**改他人文件。
8. **一条行为收紧（具名，不静默）**：`orderMode:'chair'`（**设置**形态的 call_on）下，`queue()` 现在**只允许主席**放进队列（此前任何成员都能放、只是顺序按插入）。这正是 §25.14 对该分支的**文档语义**（"位置由主席指定"）；非主席 ⇒ `VMU_NOT_PERMITTED`（具名），**不静默改变**。既有测试未使用该值域分支（`vmu-meetings`／`vmu-ab-v5r-meetings` 全绿可证）。
9. **`audit-code-size` 余量**：`meetings.js` 1196/1200（**只剩 4 行**）。任何人再加行都会红，且**不能**靠把 `meetings.js` 写进该门的 `KNOWN` 解决（那是让 backlog 变长）。⇒ 后续若要扩展本面，**必须搬去 `kernel/meetingmarker.js`（492/1200）或新模块**（新模块要按 `docs/11 §6.1` 五步双登记）。

---

## H · 协作/并发（同文件写者）

- 我开工时即向 **vmu-core2（task-106，唯一同轮共享 `meetings.js`/`meetingmarker.js` 的写者）** 发了 4 个精确锚点＋"只在 `meetingmarker.js` 末尾追加"的边界。其回信：**对这两个文件 0 编辑**（它实测 task-106 的前提已过期：`kernel/index.js:1130` 早已传 `ballot: meetingBallot`），并给出真机探针读数（`D:\_tmp\vmu-r14-real-machine-probe.mjs` **18/0**、`vmu-kernel 175/0`、`vmu-meetings 161/0`、`vmu-resume-e2e 108/0`，均在**我的改动之后**复跑）⇒ **它的 `ballot`/`boxFor` 接缝未被我的改动破坏**。
- 它同时提醒了 `audit-code-size` 的"只许缩"约束：我因此把添加压到 **+14 行**（`git show HEAD:` 口径 1182 → 现 1196，与门禁同用 `split('\n')`），中间一版曾到 1198（仍 ≤1200），我又删掉 2 行注释留出余量，并放弃"再加新 API"的想法。
- 我**未**改 `kernel/meeting.js`、`settings/**`、`packs/**`、`tests/**`、`scripts/**`、`package.json`、`installer.js`。

---

## I · 决策与偏离（逐条给理由，供 Lead/verify 复核）

1. **新族放 `kernel/meetingmarker.js`**（Lead 指定）：该模块已是本面的 helper 家（`mirrorVote`/`budgetVerdictOf`/`createBoxBinding`/`meetingKeysSnapshot`），且它**没有 import** ⇒ 复制/变异探针成本极低（C10 就是靠这一点做的）。**唯一新写的字段**是 `m.orderOverride`，标记槽 `m.domainState` 仍只由 `createMeetingMarker` 写（无第二份标记实现）。
2. **`flow` 与 `overrideOrder` 同槽同闸**（不是"`flow` 不需要 `why`"）：两者都写 `m.orderOverride` ⇒ 若 `flow` 不要 `why`／不受主席约束／不查声明，它就是**绕过 B③ 三道闸的洞**。裁决原文只把三道闸写在 B-3，但 B-4 的形状同样带 `by`/`why`。
3. **合并名"具名拒"而不是静默别名**：R8 裁决说"不可区分 ⇒ 合并"；给旧名一个**点名替换者的拒因**，既不新增第 5/6 个模式，也不让老调用者以为模式还在（"未声明即拒/缺环必须具名"的同一条纪律）。
4. **`open` 的可观察差异＝"队列不存在"**，而**不是**给 `speak()` 加"轮次闸"：`speak()` 从来不以"未轮到"拒（任何模式）；给队列模式新加闸门会**破坏既有语义与测试**（`vmu-meetings` 里大量未排队发言）。改法：`queue()` 在 `open` 下 `queued:false`＋不存位；`speak()` 用 `floor` 字段**自曝**当前地面（说成功与真做分开可断言）。
5. **`random` 用"按成员定键排序"而非"洗牌位置"**：种子冻结后，成员位次不因他人加入/移除而变化（C7f 实测），且**同输入同序**（C7c）；种子与结果 order 都进回执（C7e）。**不读 `Math.random`**（本仓铁律）。
6. **未声明即拒的口径**：`settings` 缝回 `undefined`（含"只有 get() 的缝"）⇒ 视为**未声明**；`DEFAULTS` 里的值**不是声明**（`isDeclared()` 只看 settings 缝）。⇒ 在**出货装配**里该键已由 `settings/schema.js` 声明（`docs/04` 标"✅ 已接线"），故生产路径可覆盖；而"裸 `createMeetings({clock})`"这类**零声明**部署**一律拒**（零机制）。
7. **`queue()` 的 `enforced[]` 在覆盖在force时为空**：这是 D3 语义（"读了"≠"生效了"）的直接体现，也是"覆盖优先于设置"的**可断言证据**（C4f）。

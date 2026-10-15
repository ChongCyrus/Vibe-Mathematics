# task-37 交付报告 · Round 5（F26/F31/F32/F34 四条"部分"项 ＋ GAP-MTG 收口）

- 负责人：v5r-reader-c；判据：`_handoff/vmu/05-framework-strength-evidence.md` §4、`docs/08 §25.4`。
- 写入范围：`kernel/ballot.js`、`docs/08`、`docs/17`、`tests/vmu-meeting-parity.test.mjs`、本文件。**未改** `05-framework-strength-evidence.md`（vmu-verify 名下）／`settings/schema.js`／`kernel/index.js`／`docs/10`（vmu-pack）。
- **无新增设置键**（已回 vmu-pack）：F26 是内核固定枚举，F31 是面内机制，F32/F34 用**构造参数**声明（默认 0／null ＝零机制）。

## A. 四条逐条（全部落地，无"具名登记为缺"）

### F26 五种票型分离：**部分 → 具备**（差在哪：票型由设置而非固定词汇定义）
| 落点 | file:line | 语义 |
|---|---|---|
| 固定枚举 | `kernel/ballot.js:38` `VOTE_KINDS` | `['for','against','abstain','unable','estimate']`，冻结 |
| 唯一分类点 | `:41` `classifyVote(value, kind)`（纯） | 1/0⇒for/against；`{kind:'abstain'}`⇒abstain；`{kind:'unable'}`⇒unable；`{kind:'estimate'}`＋严格 0<x<1⇒estimate；`kind:'process'`⇒**不是第六种票**（I-1/F27 单独通道）；其余⇒`null` |
| 计票口径 | `:57` `DECISIVE_KINDS` ＋ `defaultTally` | 只有 for/against 能定论（旧 `decisive` 标签为兼容已存快照仍认） |
| 可观测 | `status().byKind`（五类分开计数）＋ `status().voteKinds` | 一个 `unable` 不再静静变成一个 `against` |

**严格性保持**：未声明为 estimate 的 `0.4` 当 decisive 用，仍按 m-vote 规则具名拒（不悄悄改判）。

### F31 原子队列：**部分 → 具备（显式机制 ＋ 断言）**
- **原判差在哪**：`votes.set` 同步内存写，"原子"由单线程**结构性**保证，**无显式队列/串行化**。
- **真实隐患（本轮实测）**：`cast` 会 `await bus.emit('ballot/cast', …)` ⇒ **两票并发可在"查重"与落盘之间交错**（两票都过 `votes.has`，后者覆盖前者）。
- **落点**：`:189` `castNow`（唯一临界区）＋ `:335` `cast`（把每张票挂到**同一条 FIFO 链**）＋ `:432` `status().gate={serialized,pending,commits}`。
- **断言**：同成员两票并发 ⇒ **恰好一票被接受**、`voteCount===1`、`gate.commits===2`；**不同成员并发 ⇒ 两票都落**（串行化≠丢票）。
- **具名残余**：闸门是**进程内**的；跨进程/跨写者的耐久原子不在本面——快照把在飞队列列入 `skipped: commit-gate`，**不假装持久**。

### F32 "刚刚定论"去重窗口：**部分 → 具备**
- **落点**：构造参数 `dedupWindowMs`（0＝零机制）＋ `:349 close()` 的窗口分支（`lastClose` 维护于 `:376/:403`）＋ `:434 status().dedup`；快照携带 `lastClose/dedupedVerdicts`（**重启后窗口仍生效**，实测 `restored_items` 含 `dedup`）。
- **三条诚信边界**：① **只有同结论折叠**（窗口内的**不同结论**永远照常宣布）；② 折叠**仍必须收束**（见"自查"第 1 条）；③ 有中间件 tally（`bus`）时**不猜**、直接跳过折叠（公告权归中间件）。
- **断言**：窗口内同结论 ⇒ `deduped:true`＋`foldedVerdicts=1`；窗口外/不同结论/未声明窗口 ⇒ 均不折叠。

### F34 开启辩论的资格判据：**部分 → 具备**
- **落点**：`:259 open({by})` 三个**已声明**条件 —— `openers`（null＝任何人）⇒ 非开启人 `VMU_NOT_PERMITTED`；`minEligible`（>0）⇒ 选民团不足 `VMU_STATE`（带 现值/下限）；`requiresTarget` ⇒ 无标的 `VMU_INVALID_ARGUMENT`；`:436 status().openCriterion`（含 `satisfied`）**撞上之前可见**；默认宽松＝零机制。

## 本轮自查抓到并修掉的两处（都由探针逼出）

1. **F32 折叠后没有收束**（初版）：折叠分支提前 return，票面停在 `state='open'` ⇒ **还能继续收票**，与"定论"自相矛盾。现折叠路径**照常置 `tallied`＋写 `outcome`**，只折叠"公告"。
2. **`close()` 后 `open()` 会带旧票重开**：下一票被判"已投票"、旧结论静静留着。现在 `open()` 对 `state==='tallied'` **具名拒**并指向 `reopen()`（清票重辩）——一个判定点，写在开辩资格同一处。
3. 另修我自己 parity §15 的两处**旧词汇断言**（`kind==='decisive'`、`byKind.decisive`）⇒ `'for'`／`byKind.for`。

## B. GAP-MTG 余项（收口）

`docs/08 §25.4` 的 12 行**全部具名 closed-by、无"待做"**（实测 `待做` 计数=0）：4 行**已落**（02/03/05 的 extend 半/10），其余 8 行逐条写着"由哪一层补＋哪个文件"（01/12 需 `host.js`＋pack；04/06/07/08/09/11 需新的子对象/原语，属后续切片）。本轮可落的两条（F26/F34 相关的开辩与票型）已并入 A。

## D. 文档同步

- `docs/08`：新增 **§25.11**（F26/F31/F32/F34 四项对照表＋顺带修掉的语义暗礁＋快照口径）。
- `docs/17`：新增 **§32**（为什么这四条属于协作层、与 §3 的关系）。

## C. 结论发 vmu-verify（已发，它改证据文件）

F26 **部分→具备**、F31 **部分→具备**、F32 **部分→具备**、F34 **部分→具备**，均附 file:line＋实测；并提示：F26 把存储 `kind` 从 `'decisive'` 改为 `'for'/'against'`（`vmu-ballot` 41/0 与 `vmu-ballotbox` 13/0 实测**未受影响**），若别处有读旧标签的断言请同步。

## 验证（原样命令 + 退出码）

```
node tests/vmu-meeting-parity.test.mjs        → 150 passed, 0 failed   exit=0   （新增 §17 共 20 条）
node tests/vmu-ballot.test.mjs                →  41 passed, 0 failed   exit=0
node tests/vmu-ballotbox.test.mjs             →  13 passed, 0 failed   exit=0
node tests/vmu-meetings.test.mjs              → 161 passed, 0 failed   exit=0
node tests/vmu-meeting.test.mjs               →  50 passed, 0 failed   exit=0
node tests/vmu-minutes.test.mjs               →  20 passed, 0 failed   exit=0
node tests/vmu-minutes-tool.test.mjs          →  15 passed, 0 failed   exit=0
node tests/vmu-chat.test.mjs                  →  67 passed, 0 failed   exit=0
node tests/vmu-mailbox.test.mjs               →  44 passed, 0 failed   exit=0
node tests/vmu-panel.test.mjs                 →  39 passed, 0 failed   exit=0
node tests/vmu-resume-recovery.test.mjs       →  73 passed, 0 failed   exit=0
node tests/audit-code-size.test.mjs           →   9 passed, 0 failed   exit=0   （ballot.js 511 行）
node tests/audit-enum-branches.mjs            → 0 finding              exit=0
node tests/audit-enforced-consistency.test.mjs→ findings=0             exit=0
node --check kernel/ballot.js                 → exit=0
```

## 未做 / 具名

1. **跨进程/跨写者的耐久原子**（F31 残余）：本面闸门是进程内的；若要求跨进程，需要新的 queue 型 store 接缝（新原语）。
2. **F32 在中间件 tally 下的折叠**：刻意不猜（跳过折叠）；若要求折叠，需要中间件先给出"下一个结论"的只读探针。
3. GAP-MTG-01/12（需 `host.js`＋pack）、04/06/07/08/09/11（需新子对象/原语）仍按 §25.4 的 closed-by 留给后续切片。

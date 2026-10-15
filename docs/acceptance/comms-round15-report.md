# Round 15 · task-112 · ① open ballot 回执诚实化 ＋ ② 断言进仓 ＋ ③ 两条 docs 漂移

- **状态**：**① 已落 ✓**（含"能红"证据与"第二步"的裁决）／**② 已落 ✓**（`tests/vmu-meeting-order.test.mjs`，60 条，双登记）／**③ 一落一具名**（`docs/08 §19.1` 落；`docs/04 §11` **具名不落**＋给出根因与正确修法）。
- **纪律**：未跑全量（T0/T1 归 Lead）、未 `regen-all`、**未 git**；临时文件全在 `D:\_tmp\vmu-r15`（变异钩子/脚本）；结构性编辑全部**定点 `edit`**；**每步跑"加载内核"套件**（改 `vote()` 后 → `vmu-meetings 161/0`＋`vmu-meeting-parity 206/0`＋`vmu-resume-e2e 108/0`；新增套件自跑 60/0）。
- **核验口径（引用前先落一行）**：本报告读数取自 **2026-10-15 13:40:49–13:41:27 +08:00** 的**同一次运行**；指纹见 §④。此后若他人再改这些文件，读数需重取。

---

## ① open ballot 的"回执伪造 tally" —— **诚实化已落** ✓

**缺陷（先复现，原文）**：`kernel/meetings.js` 的 `vote({meeting, member, motion: null})` 在**没有动议/箱子**的情况下：
- 回执里回了一个**看着像真的**计数 `tally:{for:0,against:0,abstain:0}`；
- 而**同一调用**真的 `counters.votes += 1`、真的往 minutes 写了 `{kind:'vote',motion:null,member,value}`。

⇒ 回执与它自己记录的事实**互相矛盾**（"回执说成功、事没按回报的那样做"那一类）。

**改法（file:line，`kernel/meetings.js`）**
| 位置 | 之前 | 现在 |
|---|---|---|
| `:722` | — | `const tallyNote = target ? null : '…it IS recorded (minutes + counters) but NOT counted, so no tally is claimed (tally:null)'` |
| `:723` | `… : { for: 0, against: 0, abstain: 0 }` | `… : null` |
| `:727` 回执 / `:729` 返回 | `{ok,tally,quorum,receipt,…}` | `{ok,tally,counted,tallyNote,quorum,receipt,…}`（`counted = target !== null`） |

**行数**：`meetings.js` 1196 → **1197**/1200（诚实化净 +4 行；我把 R14 自己写的两段注释各压 1–2 行腾出空间 ⇒ **只剩 3 行余量**，见 §⑥-1）。

**★ 第二步（先查再定）：v5r **有**该机制，且 vmu **已有等价容器** ⇒ **不在本面造第二份**（不许为对称造机制）
- v5r 的 "open ballot" 是**容器**（"当前 `phase==='open'` 的那块板"，`vibe-math-v5r.js:1764`），工具 **`vibe_v5_poll_open`／`vibe_v5_poll_vote`／`vibe_v5_poll_close`**（注册 `:11164-11166`；实现 `:1823`／`:1899`／`:1962`），**关闭时真的计票**并受 `min_votes` 门（`:1803`、`:10496-10509`、状态视图 `:11269-11273`）。
- vmu 侧的同一容器＝ **`kernel/ballotbox.js`（选项板：options／min_votes／保密／弃权／reopen）＋ `kernel/ballot.js`**，经工具面 `vibe_vmu_meeting` 的 `action=boxopen→boxcast→boxclose`／`ballot→vote→tally` 可达（`docs/08 §25.14 A` 与 GAP-MTG-10；A/B 对照 `tests/vmu-ab-v5r-meetings.test.mjs` **122/0**，其中 `close('tally')` 的计数**真跑**）。
- ⇒ 本轮缺口是**回执的诚实性**，**不是**缺机制。再开一个容器会变成同一机制的**第二份实现**（且 `meetings.js` 只剩 3 行）。**裁决＝不接**，改为在 `tallyNote` 与代码注释里**点名**真正的容器（`kernel/ballot.js`）。

**★ "能红"（这是本轮最强的一条证据）**
```
# 干净树：GREEN
node tests/vmu-meeting-order.test.mjs
  → === VMU MEETING ORDER: 60 passed, 0 failed ===                                    exit=0
# 变异：用 loader 钩子把旧的伪造 tally 还原（只改内存、不写仓库：D:\_tmp\vmu-r15\tally-mutant-hook.mjs）
node --import "file:///D:/_tmp/vmu-r15/register-hook.mjs" tests/vmu-meeting-order.test.mjs
  → === VMU MEETING ORDER: 59 passed, 1 failed ===                                    exit=1
  → FAILURES: ★ the receipt claims NO tally for a motion-less vote (tally:null — never {for:0,against:0,abstain:0})
              [{"tally":{"for":0,"against":0,"abstain":0},"receiptTally":{…}}]
```
⇒ 断言**真的钉住了**回归；"不许多报"这一条不是装饰。

---

## ② 59 条断言进仓 —— **已落** ✓（`tests/vmu-meeting-order.test.mjs`，**60 条**）

- **内容**（节号＝文件内的 `console.log` 分组行）：§1 诚实性 7 条（`:54`）／§2 三道闸 14 条（`:76`）／§3 覆盖真变＋`enforced` 空 9 条（`:104`）／§4 四模式＋合并名＋未知 mode 16 条（`:129`）／§5 回执 vs 真做＋`restore()` 7 条（`:184`）／§6 `random` 确定性 6 条（`:214`）／§7 变异 4 条（`:238`）。**任务要求优先搬的 C8/C4d/C5/C6c/C6d 全部在其中**。
- **自足（不依赖 `D:\_tmp`）**：变异体用 **`data:` URL 导入**变异后的 `kernel/meetingmarker.js`（该模块**没有 import** ⇒ data-URL 可加载）⇒ 测试**不写仓库、不读临时目录**。
- **双登记**：`package.json` 的 `files[]` 已加 `tests/vmu-meeting-order.test.mjs`（**实测** `require('./package.json').files.includes(...) === true`）；**`installer.js` 的 `PRESETS[].files` 对任何测试文件都没有条目**（实测 **0** 条）⇒ 测试文件的第二登记就是 `files[]` 本身（不是遗漏）。作用域：`run-tests.mjs` 的 vmu 作用域是**按名字派生**（"every vmu-NAMED job"）⇒ 新套件自动在域内（`audit-scope-classification` **38/0**）。
- **RULE E 未推高**：`RULE E fingerprints: shape=file:shape:receiver current=67 baseline=67`（**扫描实测**：`RULE E scanned files=368 candidate lines=475 hits=67`）⇒ 集合断言都带**同一表达式内**的非空前置。

---

## ③ 两条 docs 漂移

- **落 ✓ `docs/08 §19.1`（`:882`）**：`vmu.meetings.orderMode` 行的值域由计划值 `hands｜round-robin｜seat｜weighted｜unspoken-first` 改为**实测值域** `fifo｜round-robin｜chair｜random`（默认 `fifo`），原计划值域**保留在同一行的说明里**（历史不抹）。安全性＝**行数不变**（计划表计数不动）＋ 全树**无任何生成器解析该"值域"单元格**（实测 `grep` 无消费者）。
- **具名不落 ✗ `docs/04 §11`（`:1200`）**：该行值域仍是 `—`。**根因在生成链**：`scripts/generate-vmu-settings-table.mjs:119` 规定「`def.type !== 'enum'` ⇒ 值域列显示 `—`」，而 `settings/schema.js:1229` 把该键声明为 `type:'string'`（无 `values`）⇒ **手改该单元格会被生成器覆盖，并让 `--check` 变"陈旧红"**。
  - **正确修法（一行，＋ Lead 的 regen）**：`settings/schema.js` 该键 `type:'string'` → `type:'enum'` 并补 `values:['fifo','round-robin','chair','random']`（默认仍 `'fifo'`），随后 `regen-all` 重生成 `docs/04 §11`；改完须复跑 `tests/vmu-planned-settings.test.mjs` 与 `audit-doc-vs-code-tables`。
  - **为什么我不落**：`settings/**` **不在 task-112 写范围**；且本任务**禁 `regen-all`** ⇒ 我一改就会留下一棵**"schema 与 docs/04 不一致"的红树**（正是"红树不得提交"要防的）。⇒ **交 Lead／settings 面 owner 定夺**。
- **顺带修正 ✓ `docs/03 §3`（`:82`）**：`vmu.meetings` 的契约行此前**没有** R14 新增的三个方法，且 `vote(...)` 的返回形已变 ⇒ 该行补上 `flow({meeting,mode,by,why})`／`overrideOrder({meeting,by,why,mode})`／`orderView({meeting})` 与**同一条闸**（仅主席／必须 `why`／须声明键），并把 `vote` 的返回形改为 `{ok,tally,counted,tallyNote,quorum,receipt,enforced,enforcedScope}`＋诚实化说明（**方法一律写成调用形** `name(...)`，不铸 phantom 键）。

---

## ④ 实测（原样命令 ＋ 退出码；同一次运行 2026-10-15 13:40:49）

**指纹（写后核验行）**
```
vibe-math-vmu/kernel/meetings.js        sha256[0:16]=DF0371C13DC1A6E6   （1197 行 / 上限 1200）
vibe-math-vmu/kernel/meetingmarker.js   sha256[0:16]=0DA68FAE177DA191   （492 行，本轮未改）
vibe-math-vmu/tools/meeting.js          sha256[0:16]=961124AB13AA13CA   （本轮未改）
tests/vmu-meeting-order.test.mjs        sha256[0:16]=7F18368C08CC634F   （新，60 条）
```
```
node tests/vmu-meeting-order.test.mjs          → VMU MEETING ORDER: 60 passed, 0 failed      exit=0
node tests/vmu-meetings.test.mjs               → VMU MEETINGS: 161 passed, 0 failed          exit=0
node tests/vmu-meeting-parity.test.mjs         → vmu-meeting-parity: 206 passed, 0 failed    exit=0
node tests/vmu-kernel.test.mjs                 → VMU KERNEL: 175 passed, 0 failed            exit=0
node tests/vmu-entry.test.mjs                  → VMU ENTRY: 150 passed, 0 failed             exit=0
node tests/vmu-resume-e2e.test.mjs             → VMU GOAL1 E2E: 108 passed, 0 failed         exit=0
node tests/vmu-ab-v5r-meetings.test.mjs        → VMU AB v5r meetings: 122 passed, 0 failed   exit=0
node tests/vmu-motion-box.test.mjs             → VMU MOTION BOX: 23 passed, 0 failed         exit=0
node tests/audit-code-size.test.mjs            → CODE SIZE: 9 passed, 0 failed               exit=0
node tests/audit-enforced-consistency.test.mjs → VMU ENFORCED CONSISTENCY: 358 passed, 0 failed  exit=0
node tests/audit-module-coverage.test.mjs      → MODULE COVERAGE: 6 passed, 0 failed         exit=0
node tests/audit-doc-vs-code-tables.test.mjs   → DOC VS CODE TABLES: 17 passed, 0 failed     exit=0
node tests/audit-table-integrity.test.mjs      → TABLE INTEGRITY: 7 passed, 0 failed         exit=0
node tests/audit-package-membership.mjs        → PACKAGE MEMBERSHIP: 28 passed, 0 failed     exit=0
node tests/audit-stale-markers.test.mjs        → STALE MARKERS (REPORT): 4 passed, 0 failed; report=4  exit=0
node tests/audit-scope-classification.test.mjs → SCOPE CLASSIFICATION: 38 passed, 0 failed   exit=0
node scripts/check-docs.mjs                    → DOC LINT: PASS                              exit=0
node scripts/generate-zero-mechanism-matrix.mjs --check → 96 modules, 0 mismatches, 0 unregistered, 0 EXPECT_UNDECIDED, 9 probe-errors, 4 n/a  exit=0
node tests/audit-declaration-criterion.test.mjs → RULE E fingerprints: current=67 = baseline=67（唯一 FAIL 仍是 Lead 的 regen-all --check）
# 变异运行（证明断言能红）
node --import file:///D:/_tmp/vmu-r15/register-hook.mjs tests/vmu-meeting-order.test.mjs → 59/1  exit=1
```

**★ 两条非我红（具名＋归属＋一行修法，我未代改）**
- `tests/audit-vmu-docs.test.mjs` **exit=1**：未注册名 `vmu.dissemination.impact`／`vmu.dissemination.mediaRequest`／`vmu.meetings.open` —— **门自己把文件标注为 `(11-gates-and-development)`**，即全部出自 **`docs/11`**（vmu-verify2 本轮在写的"调用形/自探针"文本）。我的两卷实测干净（见下）。
- `tests/audit-claim-traceability.test.mjs` **exit=1**：`{"unresolved":["11:C9"]}` —— **卷号 11**（`docs/11`），与我 R14 在 `docs/08` 犯过的"`C9` 被当 claim id"是同一类；**修法一行**：把 `docs/11` 里的 `C9` 写成"第 9 组"之类不带 `C\d` 的措辞，或加入该门的 external 列表。
- **我的两卷自证**：用与该门同形的扫描（临时脚本 `D:\_tmp\vmu-r15\my-docs-keys.mjs`）实测 ⇒ `08-primitives-…md => unresolved: (none)`；`03-interface-contract.md` 只剩**既有**的 `vmu.math.adapters`／`vmu.math.jobs`（非我本轮所写，且在该门的真实规则下被解析，门报的 3 个名字里没有它们）。

---

## ⑤ 决策与边界

1. **`meetings.js` 只剩 3 行余量**（1197/1200，`audit-code-size` 实测 9/0）。本面**任何**后续扩展都必须**搬族**进 `kernel/meetingmarker.js`（492/1200）或新模块（按 `docs/11 §6.1` 五步双登记）；**禁止**把 `meetings.js` 写进该门的 `KNOWN`（backlog 只许缩）。
2. **不造第二个 open-ballot 容器**（见 §①）：v5r 有机制、vmu 有等价容器 ⇒ 缺口是诚实性。若 Lead 认为 `meetings.vote({motion:null})` 该**直接拒**（而不是"记但不计数"），那会改语义并撞到既有用例（`vmu-meetings` 的 quorum 场景、`vmu-resume-e2e` 的无动议镜像票）⇒ 我**未擅自**做，列为待裁项。
3. **`docs/04` 的修法在 `settings/schema.js`**（＋regen），不在我的写范围（§③）。
4. **`vmu.agenda.reorderAudit` 仍未进 `enforced[]`**（R14 的具名偏离，理由见 `docs/08 §25.16 B`）——本轮不变。
5. **`tests/**` 我只新增/改了 `tests/vmu-meeting-order.test.mjs` 与 `package.json files[]` 一行**（R15 写范围含 `tests/vmu-meeting*.test.mjs`）；`docs/11`／`docs/04`／`settings/**`／`installer.js` **未动**。

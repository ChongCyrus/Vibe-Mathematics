# RUN 79 真机核对记录（任务书模板的三处更正）

> **这是记录，不是证据。** 证据在第 79 次那批会话 journal 与回执里；本页把 2026-11-11 那次 run 79 的
> 读数、验点判定与三处更正留档，方便后来人对照。机械核对器 `scripts/audit/verify-run.mjs` 可在同一批
> journal 上重跑；本页没有重跑它，所以下面每行都标明「回执原文」或「自报」。
>
> 这一轮的结论与 RUN 75/76/77 不同：**缺陷不在产品，在任务书模板**。模板教了一个会被产品具名拒绝的
> 调用（`slot:"member"`），一个从未被真挑战的输入形态（数组议程），以及一条会让论文停在 `reviewing`
> 的收口规则（60 分钟）。所以本轮的修法是改模板 + 加判据，不是改机制。

- 运行：build `6c689c86`（`gitHead 6c689c8608637dd251f038690cf591d6a66de552`，tarball 7.94 MB）
- 会话：`session-1b59cb29-c175-4077-b0b3-0599b9183ceb`；`durationSec 3741`（≈62.4 min）
- 用量：`tokenTotal 31 999 236` / cap `80 000 000`（`tokenCapHit:false`）、`transcriptEvents 416`、`toolCalls 68`
- 工作区：`D:/_tmp/slv-phase5/slvp259-ws`（库根 `roots.libraryRoot = D:/_tmp/slv-phase5/slvp259-ws/VibeMath`）；席位 `r-acad` + `r-1`/`r-2`/`r-3` + `r-temp`
- 结果：**PASS 9 / FAIL 3 / NO-EVIDENCE 2**（V8、V13 均 `RUN-DID-NOT-REACH`）

## 验点表（V1–V14）

| 验点 | 期望 | 实测（回执原文/字段） | 判定 |
|---|---|---|---|
| V1 投递路径与归因同源 | `activation/continuation` ⇒ `writtenFrom:"own-turn"`；`caller` ⇒ `relayed` | t-1 `rec-1`、t-2 `rec-4` 为 `own-turn`；但 t-7 `activation` 写的 `rec-18`、t-10 `rec-23`、t-11 `rec-25` 都是 `relayed`；t-13 `caller` + `rec-29` `relayed` | **FAIL** |
| V2 通知块四键 | `notices` 四键，`namedEmpty === (lines===0)` | t-1 `{lines:0,rendered:true,blockChars:15,namedEmpty:true}`；t-2 `{2,true,229,false}`；t-3/t-4 `{2,true,591,false}` | PASS |
| V3 `[蓝图]` 具名缺席 | 状态板出现 `[蓝图] 无现行版（rev 0，md 未落盘）` | board 面 `liveReadings.blueprint {value:null, why:"no-current-blueprint"}`；`op:"prompt"` t-13 全文 26 641 字符**既无 `[蓝图]` 也无 `[状态板]` 块** | **FAIL** |
| V4 `notEligible` 行 | `{member,solved,why}` 具名行 | board 面 `closureVote.notEligible:[{member:"r-temp",solved:false,why:"no-closure-vote-permission"}]` | PASS |
| V5 board 面有界 | board 明显小、不截断 | board `originalBytes:9009`、`truncated:false`；full `originalBytes:39984`、`truncated:true` | PASS |
| V6 会议 provenance 三处相等 | 回执 / `state.json` / `receiptsView` 六值相等 | ①②相等（m2 `typeInput:"结题"`、`typeMatchedBy:"alias"`、`type:"closure"`）；③ `receiptsView` 回 `{"receipts":[],"count":0,"available":0,"ringDropped":0}` | **FAIL** |
| V7 议程切分只认三种分隔符 | 元组不被逗号切成两项 | m1 `agendaItems` 5 条，第 2 条整段保留 `(2k−1,2k)` 与 `gcd(m,m+1)`；但本轮走的是**数组入参** `agendaItemsSource:"argument-array"` | PASS（路径未覆盖） |
| V8 render 回执给 recordIds | `recordIds{md,tex,meta}` 三个真 rec id | 无 render 回执：论文 round 2 仍 `reviewing`（`rec-39 deliverable:false`）、`pdfCompiled.produced:false` | NO-EVIDENCE / `RUN-DID-NOT-REACH` |
| V9 结题票挂载门 | 只有 `keptWhy:"tool-not-mounted"` 才计票 | t-13 `fieldsIgnored:[{field:"vote_solved",keptWhy:"tool-visibility-unprovable"}]`、`votesCast` 4→4 | PASS |
| V10 成员回合归属 | `memberShare = memberActs/(memberActs+officeRelayedActs)`、`provenActs===acts` | board `{memberActs:13,officeRelayedActs:1,unknownActs:0,acts:14,provenActs:14,memberShare:0.9286}`；手算 13/14 ✓ | PASS |
| V11 两把尺子同源 | draft 默认不落盘；真写 md 带 `writtenBy:"member-file"` | `filed:false`、`draftMdMissing:true`、`draftMdPath:"Shared/Drafts/Protocol-r1.md"`、`writtenBy:null` | PASS |
| V12 回执不承诺不可达操作 | hint 含 `REACHABLE INSTEAD:` 且点名 `op:"status"`，照抄能成功 | `code:"VMU_NOT_PERMITTED"` + hint 点名 `op:"status"`；照抄后 `ok:true`、`memberOps:["status"]` | PASS |
| V13 结题链 | 票→final→render→归档行 `pdfSha256` 与磁盘 PDF 相等 | 无 final/compile/render；`pdfCompiled:{"produced":false,"pdfSha256":null}`；`toolchainAbsent:[]`（=未测，不是「没有」） | NO-EVIDENCE / `RUN-DID-NOT-REACH` |
| V14 提示词批评 | 逐条原句 + 为什么；四席提示词可读 | 10 条均有原句；`op:"prompt"{member:"r-temp"}` 静默忽略 `member`，返回 t-13（r-2 的） | PASS（带证据缺口） |

## 三处更正（B7 / B9 / V8-V13 编排缺口）

1. **B7 `slot` 冲突**：RUN 79 任务书要 `vibe_v5_hire {to:"r-temp", slot:"member"}`，而 `hirer` 面只认
   `slot:"temp"`，其它 slot 具名拒并指路 founding face；会话按 `slot:"temp"` 才成功（`hired.slot:"temp"`）。
   模板改为：一律 `slot:"temp"`，并写明「要增研究员用 `vibe_v5_start{researcherCount:N}`，不要用 hire」。
2. **B9 议程只走了数组路径**：两次 convene 均为 `agendaItemsSource:"argument-array"`，所以「`,`/`、` 不是
   分隔符」这条规则在**字符串**入参上从未被真挑战。模板改为：强制样本写成字符串
   `agenda:"A; B（含 (2k−1,2k)）; C"`，报告贴 `agendaInputShape`（`"string"`/`"array"`）。
3. **V8/V13 未达成是编排缺口**：旧模板「到 60 分钟必须收口」⇒ 两轮互审各一票 `deliverable:false` 时论文停在
   `reviewing`，没有 final/compile/render（本会话无 PDF）。模板改为：结题前必须让论文链走到 `finalized` +
   `render`，被反对票挡住就退回改写再走一轮（最多三轮），时间预算 **100 分钟**；并写明「结题票与论文链是
   两个门槛，票满不等于本轮成功」。

## 两条纪律（本轮实测教训，保留/新增）

- **报告必须能对回执**：本轮 `FEEDBACK79.md` 九条全部「待定位」（称本机源码副本与装载版本不一致）⇒ 缺陷数
  记 0。模板改为：**回执证据优先于 `file:line`**——先写工具名 + op/参数 + `code`/`message`/`fieldsIgnored`，
  能定位源码再补 `file:line`，拿不到就写「回执证据」，**不许整份降级**；只有连回执都没有的条目才进「待定位」。
- **不可达必须带三类原因之一**（`RUN-DID-NOT-REACH` / `RULE-UNREACHABLE` / `ENV-LIMIT`），并写清哪一步没走到：
  本轮 V8/V13 的写法正确（`RUN-DID-NOT-REACH`），保留。

## 判据与留档

- `tests/run79-brief-corrections.test.mjs`：模板五个新事实必须存在（`slot:"temp"`、字符串 agenda 样本、
  `finalized`+`render`、`100 分钟`、回执证据优先），旧串（`slot:"member"`、「60 分钟必须收口」）必须不存在；
  三盏反关灯（把 slot 改回 member / 把 100 改回 60 / 删掉回执证据优先句）各自变红并点名缺的是哪条事实，
  副本落在 `D:/_tmp/tb2742/`，还原后 sha256 与被修模板一致。
- 修后模板：163 行（上界 180；本次 +11/−0），sha256 `7c8583b996b5f18ef24c6994c3c8bad905d39e5e022dfee81cf953a94004bd08`；
  判据 23 passed / 0 failed。

## 自报与机械的差

- 自报缺陷数 0 与机械侧一致：九条都是「待定位」，没有可核 `file:line`——这是报告纪律问题，不是产品问题。
- 自报 PASS 9 与验点表一致；三条 FAIL 都指向产品行为与期望相反（V1 归属、V3 缺块、V6 空 ring），
  两条 NO-EVIDENCE 都指向编排缺口（论文未到 final/render），已在三处更正里处理任务书那一侧。

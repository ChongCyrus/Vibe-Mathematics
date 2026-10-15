# Round 12 报告 · task-92（`motion→box` 绑定接缝 ＋ 联动四态）

> **一句话**：R1 对齐的 **`motion→box` 绑定接缝已落地**（消费者声明、内核只调用、三码具名、重复绑定**幂等**），钻取新增 §⑭ 5 条 ⇒ **108/0**；
> **唯一未证的是"真箱联动"（会议票真的进箱并 `close()` 出裁定）**，根因本轮末**已定位**（见 §3）：`ballotbox.cast` 要的是 **`choice`**（`by` 必填），
> 而我的接缝转发的是会议侧词汇 **`value`** ⇒ 箱得到 `choice: undefined` ⇒ 具名 `VMU_CONFLICT`。修法是**两行**，连 `text/kind/emergency` 透传一起放 **Round 13 首项**。
> 规矩：**没跑的不写成已验证**；清理只删**显式创建**的精确路径。

## 1. 交付物与改动

| 文件 | 改动 | 结果 |
| --- | --- | --- |
| `kernel/meetingmarker.js`（145 行） | `mirrorVote({ballot, boxFor, counters, …})`：新增 **`boxFor` 绑定**；三种新失败**具名**（`no-binding`/`unmapped`/`binding-threw`），`boxId` 回填进回执 | ✅ |
| `kernel/meetings.js`（1198 行） | 工厂增 **`boxFor = null`**；`vote()` 把它传给 `mirrorVote` | ✅ |
| `docs/03-interface-contract.md` | §8 增 3 行：`VMU_MEETING_BOX_UNWIRED`／`_UNMAPPED`／`_BINDING_FAILED`（＋`generate-planned-codes --write`，planned codes 276） | ✅ |
| `tests/vmu-resume-e2e.test.mjs` | **§⑭**（`16a`–`16e`）＋ §⑬ 夹具补 `boxFor` | ✅ |
| `_handoff/vmu/resume-round12-report.md` | 本文件 | ✅ |

## 2. 证据（原样命令＋退出码）

```
node --check kernel/meetings.js / kernel/meetingmarker.js / tests/vmu-resume-e2e.test.mjs  → 0 / 0 / 0
node tests/vmu-resume-e2e.test.mjs   → === VMU GOAL1 E2E: 108 passed, 0 failed ===   exit 0
node tests/vmu-meetings.test.mjs     → === VMU MEETINGS: 161 passed, 0 failed ===     exit 0
node tests/vmu-kernel.test.mjs       → === VMU KERNEL: 175 passed, 0 failed ===       exit 0
node tests/audit-code-size.test.mjs  → === CODE SIZE: 9 passed, 0 failed ===          exit 0   （meetings.js 1198／marker 145）
node tests/audit-vmu-docs.test.mjs   → === VMU DOCS AUDIT: 84 passed, 0 failed ===    exit 0   （3 个新码登记后）
node scripts/generate-planned-codes.mjs --write → exit 0（planned codes=276）
```

## 3. 已证 / 未证（逐条对着任务 A／B／C）

**A ✅ 接缝**：`createMeetings({ boxFor })` 由**消费者/pack 声明**；`mirrorVote` 只**调用**它——**不开箱、不发明映射、不缓存**。
形状：`boxFor({meeting, motion, member, value})` → `boxId` | `{boxId, value, by}`；内核把返回的 `value` 原样转发给 `ballot.cast`（**这就是"词表映射归消费者"的那一半**）。

**B（四态）**
- **② 未绑定 ⇒ 具名 ✅**（`16c`）：`{mirrored:false, reason:'no-binding', code:'VMU_MEETING_BOX_UNWIRED'}`——**不是静默**。
- **③ 回调抛错 ⇒ 具名 ✅**（`16d`）：`{reason:'binding-threw', code:'VMU_MEETING_BOX_BINDING_FAILED', message}`。
- **④ 同一 motion 重复绑定 ⇒ 「幂等」（写明是哪种）✅**（`16b`）：内核**不缓存**绑定，每次问回调 ⇒ 同一 `motion` 得**同一 `boxId`**，不拒、不开第二个箱。
- **① 真箱联动 ⇒ 未证**（`16a` 走**自适应 gap 形态**）：真 `createBallotBox.cast` 逐票拒 `VMU_CONFLICT`（`tally.votes=0`）。

**C ✅ 口径一致**：回执仍是 `ballot:{mirrored, reason, code?, boxId?, message?}`；`reason ∈ no-seam/no-binding/unmapped/binding-threw/refused/threw/cast`。
**行为变化（已同步 verify）**：有 `ballot` 但无 `boxFor` ⇒ `no-binding`（具名），故 R11 的 `15a/15b/15d` 夹具补绑定后才绿；`15c`（无 ballot）仍 `no-seam`。

## 4. ★ Round 13 首项（精确规格，含本轮末定位到的根因）

**根因（vmu-pack 用真服务实测给出，可核）**：`kernel/ballotbox.js` 的 `cast` 读的是 **`choice`** 且 **`by` 必填**（`open` 还要 `options.length ≥ 2`）——
```
k.ballotbox.open({ question:'Q?', options:['a','b'] }) → { ok:true, boxId:'bx-1', … }
k.ballotbox.cast({ boxId, by:'r-1', choice:'a' })      → { ok:true, … }   // ← 参数名是 choice，不是 value；by 必填
```
而我的 `mirrorVote` 转发的是 `{…, value: wire.value, by: wire.by, boxId}` ⇒ 箱收到 `choice: undefined` ⇒ **`VMU_CONFLICT`**（这正是我 `16a` 的红）。

**两处修法（都在我写域，共约 4 行）**
1. **`choice` 转发**：让绑定返回 `{boxId, choice?, value?, by?}`，`mirrorVote` 以 **`choice` 优先、`value` 兜底** 调 `ballot.cast`（同时继续带 `member`/`value`/`motion`/`meeting` 以兼容其它接缝）。
2. **`text/kind/emergency` 透传**（已与 pack 约定，向后兼容）：`meetings.js` 的 `vote()` 调 `mirrorVote` 时带上 `target.text/target.kind/target.emergency`（会议面**本来就持有**，是**数据透传不是政策**）；`mirrorVote` 形参加这三个并在 `boxFor({…})` 载荷里带上 ⇒ pack 的 `boxForMotion()` 可用 `text` 作 `question`（**在他们落地前，载荷里 `text` 为 `undefined`**，pack 已按"用 motion id"写好兜底）。
3. 之后把 `16a` 从 **gap 形态翻成正断言**（箱形状用 pack 给的 5 行：`options:['a','b']`＋两次 `cast({by, choice})`；想一次出裁定就投第三票或声明 `vmu.ballot.tieRule`，否则 `close()` 会具名 `VMU_BALLOT_TIE_UNRESOLVED`——**那是规则自曝，不是缺陷**）。

## 5. 归属他方（本轮实测，已同步）

1. **装配两处未接线（core）**：`kernel/index.js:1118` 的 `createMeetings({ settings, bus, clock, log, durable })` **既没传 `ballot` 也没传 `boxFor`** ⇒ 真装配里 `mirrorVote` 在 **`no-seam`** 就返回（`boxFor` 根本不会被问）。⇒ 出货内核里"动议⇒开箱"到不了我的接缝。
2. **动议不可观测（core 改名 ＋ pack 登记）**：`meetings.js` 的 `motion()` **不发总线事件**（全文件总线 emit 数 0），而 `governance.motion.propose` 是对象形态＋点号名（未登记）；两处动议 id 也不同（会议 `mo1` vs 治理 `mo-1`）。
3. **B③ `overrideOrder`／B④ `flow`（task-91，reader-c 交来规格）**：本轮**未做**（预算在 task-92）⇒ **Round 13 我接手**。

## 6. 本轮自我更正（都靠"改完跑套件"抓到）

- `node --check` 抓到 `unboundFace` **与 §⑫ 重名**（`Identifier 'unboundFace' has already been declared`）⇒ 改名 `noBindFace`。
- 新契约引入后，R11 的 `15a/15b/15d` 因夹具缺 `boxFor` 变成 `no-binding`（**语义正确**）⇒ 给夹具补绑定。
- 最后一次编辑（`text` 透传）被会话**读守卫**挡下：**我没有强推**，改为把规格写进本报告并交付 pack（不留未验证改动）。

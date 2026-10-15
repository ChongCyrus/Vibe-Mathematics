# Round 11 报告 · 目标 1（断点续跑 ＋ 人工干预）· task-87 ＋ task-89（F51）

> **一句话**：三件都落**实**了 —— ① **多实例跨实例恢复**在**最新树**上复核成立（`12f` 已走 **CLOSED** 分支，票箱两条都回来）；
> ② **投影种子普查**：`PROJECTION_KEYS` 全 **10** 个键在**全新 store** 上逐个 `ok=true`（空容器不再被当缺口），并留了**非空反例**；
> ③ **F51 `meetingOpen` 域标记**从 reader-c 接手并**落地**：唯一 `markState` ＋ **7 处状态迁移**＋声明式域接缝＋`openMeetings()` 读面＋自曝，钻取 4 条断言全绿。
> 顺带：verify 抓的 **RULE E 空过形状已修**（`current=67=baseline` 复位），我新码的**拒因已登记** `docs/03 §8`（`audit-vmu-docs` **84/0**）。
> 钻取 **94 → 99/0 exit 0**。规矩：变异验证**真跑＋sha256 前后比对**；结构性编辑**原子**；清理**只删显式创建的精确路径**。

## 1. 交付物与改动

| 文件 | 改动 | 任务 |
| --- | --- | --- |
| `kernel/meetings.js` | **F51**：`createMeetings` 增 `durable` 域接缝；新增**唯一** `markState(m,state)`（写 `m.state` ＋ 派生域标记 `domainState ∈ open\|lapsed\|closed` ＋ 写接缝）／`stateRows()`（live ＋ archive）／`openMeetings()`（读面，未绑定即自曝）；7 处迁移点改走 `markState`（`open`／`suspend`／`recess`×2／`resume`→open／`close`）；`status().durableMarker` 自曝；`api` 暴露 `openMeetings` | task-89 |
| `kernel/meetinglapse.js` | `createMeetingControls` 增 **`markState` 注入**（与 F28 注入同形），`lapse`／`revokeLapse` 两处改走注入的 `setState`（未注入则仅写标签、**不产生域标记**，由读面自曝） | task-89 |
| `tests/vmu-resume-e2e.test.mjs` | **§⑪ 种子普查**（`13a`–`13c`）＋ **§⑫ F51**（`14a`–`14e`）＋ `12j`（票箱在第二内核恢复）＋ `boot()` 增 `extraProjections`；RULE E：`13a` 同一表达式内钉 `seedRows.length > 0 && === seedKeys.length` | task-87/89 |
| `docs/03-interface-contract.md` | §8 增行 **`VMU_MEETINGS_MARKER_UNREADABLE`**（"耐久域读不到 ⇒ 不猜哪个会还开着"）；§8.1 由 `generate-planned-codes.mjs --write` 重算（276 planned codes） | Lead 指派 |
| `_handoff/vmu/12-goal1-e2e.md` | 更新：99/0、§⑪/§⑫ 说明、"证明了什么/没证明什么" | task-87/89 |
| `_handoff/vmu/resume-round11-report.md` | 本文件 | — |

## 2. B · 多实例跨实例恢复复核（最新树）✅

- **`12f` 现在走 CLOSED 分支**：`ballotbox` 已被挂（pack 声明与 `RESUME_PROJECTION_KEYS` 都已是 `ballotbox`）⇒ 断言"**信封里有两个票箱**"通过；`12j` 追加：**第二个内核实例里两个票箱都回来了**。
- 一并复核：`12e` 下一位读者（raw store）看到 `meetings` 的 state 信封（2 会）；`12h/12i` K2 两个会都在、`meetings:state:true`、`unhydrated=[]`。
- ⇒ **Round 6 的多实例缺口保持关闭**（集合面即注册表；不再需要注册表机制），且与 verify 的全 pack 声明普查（`scripts/audit-projection-census.mjs` 10/0，静默不挂＝0）互相印证。

## 3. C · 投影种子普查（`PROJECTION_KEYS` 全 10 键）✅

- `13a`：**10 个键**在**全新 store** 上逐个断言 `recover().ok === true`、`hydrated === false`、`seeded ∈ {null, empty-array, empty-object}`、无 gap。
  清单写进**断言名**（便于对账）：`members,tasks,meetings,ballotbox,budget,phase,work,chat,panel,human`。
  ⇒ 与 `store.js defaultKeys()` 的三种种子一一对应：**null**（`phase/human/chat/panel/ballotbox`）／**`[]`**（`members/tasks/meetings/work`）／**`{}`**（`budget`，R10 修的）。
- `13b`/`13c`（**反例，防"存在即通过"**）：同一批键下写**非空**值 ⇒ 仍然**具名** `VMU_RESUME_PROJECTION_GAP`（`tasks` 报 `array[1]`；`budget` 报非空对象）。
- RULE E：verify 指出 `13a` 的 `.every()` 在空列表时空过 ⇒ 已在**同一表达式**内钉 `seedRows.length > 0 && seedRows.length === seedKeys.length`（**未动基线**）。

## 4. A / F51 · `meetingOpen` 域标记（task-89，从 reader-c 接手）✅

**实现（唯一写入者，7 处迁移）**
- `markState(m, state)`（`kernel/meetings.js`）：写 `m.state`（面自身的细分态 `open|suspended|recess|lapsed|closed`）＋派生**域标记** `m.domainState`（`open|lapsed|closed`：recess/suspend **仍是未收束的会** ⇒ `open`）＋写域接缝。
- 注入：`createMeetingControls({ …, markState })`（**与 F28 同形**），`lapse ⇒ lapsed`、`revokeLapse ⇒ open` 都走它 ⇒ **不是 7 份分裂实现**。
- 迁移点：`open()`（建会后）／`leave()` 的 quorum 策略 `suspend`／`recess`（两处）／`resume()` 回 `open`／`close()`（在 `live.delete` 之前写，故 `stateRows()` 把 closed 记下）。
- 读面：`openMeetings()` → `{ok, durableMarker, meetings:[{id,state}], source, note}`；`stateRows()` 覆盖 `live + archive`（已闭幕的会仍可读为 `closed`）。
- **自曝**：`status().durableMarker = { bound, writes, failures, lastError }`（对齐 G7 的 `durableLog.bound`）；未绑定 ⇒ `durableMarker:false` 且 **不发明**"开着"；读失败 ⇒ 具名 `VMU_MEETINGS_MARKER_UNREADABLE`（已登记 `docs/03 §8`）。

**钻取 4 条断言（§⑫，真文件接缝，`14a`–`14e`）**
- `14a` 两个会 + 真 lapse（`hardLimitMs:1000`、`at=BIG`）⇒ `settlement: 'lapsed-by-declared-bound'`。
- `14b` **`lapsed` 与 `open` 可区分**：`openMeetings()` 里一个 `lapsed`、一个 `open`。
- `14c` **`revokeLapse` 回 `open`**（可具名撤销）。
- `14d` **跨重启可读**：**第二个 face 实例**（无任何活会）从同一接缝读回两条（`source:'durable-seam'`）。
- `14e` **空读＝空机构**（`note` 明说 "no meeting at all"，不发明）；**未绑定** ⇒ `durableMarker:false`（`status().durableMarker.bound === false`）。

**变异验证（真跑＋sha256）**：把 `markState` 的接缝写入关掉（`if (false && …)`）⇒ 钻取 **96/3 exit 1**（`14b/14c/14d` 红，`status().durableMarker.writes === 0` 佐证"从未写过"）；还原后 sha256 `4B6003E5090633FC7A32C89E449C8EADFD92E9E07AB9074978F8435382E89069` 前后一致 ⇒ **99/0**。`vmu-meetings` 在变异下仍 161/0（该套件不覆盖新标记 ⇒ 正是本钻取的价值）。

## 5. 证据（本轮命令与退出码）

```
node --check kernel/meetings.js / kernel/meetinglapse.js / tests/vmu-resume-e2e.test.mjs   → exit 0 / 0 / 0
node tests/vmu-resume-e2e.test.mjs        → === VMU GOAL1 E2E: 99 passed, 0 failed ===    exit 0
node tests/vmu-meetings.test.mjs          → === VMU MEETINGS: 161 passed, 0 failed ===    exit 0
node tests/vmu-meeting.test.mjs           → === VMU MEETING: 50 passed, 0 failed ===      exit 0
node tests/vmu-meeting-parity.test.mjs    → exit 0
node tests/vmu-kernel.test.mjs            → === VMU KERNEL: 175 passed, 0 failed ===      exit 0
node tests/audit-vmu-docs.test.mjs        → === VMU DOCS AUDIT: 84 passed, 0 failed ===   exit 0（登记后）
node scripts/generate-planned-codes.mjs --write → exit 0（planned codes=276）
node tests/audit-declaration-criterion.test.mjs → 74 passed / 3 failed, exit 1
    RULE E fingerprints current=67=baseline ✓（verify 那条**已消**）；剩 3 条**非我**：Leader 的 `regen-all --check` ＋ RULE A 自证链（`audit-pack-middleware-shape.mjs --selftest` 未被任何门禁真跑）
```

## 6. 本轮**没做／不许放大**的

1. **`kernel/index.js` 未接域接缝**：F51 的接缝**未绑定**（该文件不在我写域）⇒ 出货内核里 `durableMarker:false`（**自曝**，不是假装）。钻取用**真文件接缝**证明契约本身；**"真机上重启后哪个会还开着"仍属未证**，需要 core 一行接线（`createMeetings({…, durable})`）。
2. **`meetings.js` 现在 1244 行**（越过 1200；R10 已红，本轮 +55）：需拆分或记 backlog —— 我按纪律**没有**替它拆（本轮它同时是我的 task-89 写域，但拆分属独立一步，且需与 reader-c 的 task-82 协调）。
3. **`suspended` 不在域值域**：域标记只有 `open|lapsed|closed`（按裁决），面自身的 `suspended`/`recess` 细分态仍只在 `m.state` 与投影里；**"挂起中的会算不算还开着"**按裁决算 `open`。
4. **`openMeetings()` 未进工具面**（`tools/meeting.js` 未加动作）——本轮未做，如需真机可读请指派。
5. **`verify` 的 `seedKeys` 缺 `human` 之说**：实测**不成立**（`:668` 的清单是 10 项含 `human`；`13a` 断言名已把 10 项打印出来供对账）。

## 7. 下一步

1. **core**：`kernel/index.js` 给 `createMeetings({…, durable})` 接一行（域标记落 `meetings` 域、**不新增键**的那条裁决要落成"写哪个载体"的决定；若复用 `meetings` 投影则 `openMeetings()` 可退化为读投影）。
2. **Lead**：`kernel/meetings.js` 1244 行 → 拆或记 backlog；`docs/15:385` 的全名恢复（C，R10 已复核）。
3. **verify**：基准刷新 **99/0**（§⑧12＋§⑨6＋§⑩9＋§⑪3＋§⑫5）；复验本轮变异锚点（`markState` 的接缝写入一行）。

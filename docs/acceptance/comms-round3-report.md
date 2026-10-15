# task-17 交付报告 · 目标 2 收尾（Round 3）

- 负责人：v5r-reader-c；基线：`_handoff/vmu/00-decisions.md` D-08 ＋ `round3-plan.md` 遗留 1–3 ＋ Lead 的三条追加（`reopenFloor` 真接线、`mailbox.restore(snap)`、C-45 忠实性弃权）。
- 写入范围（只改这些）：`kernel/{chat,panel,meeting,meetings,ballot,ballotbox,minutes}.js`、`tools/{meeting,minutes}.js`、`docs/{08,17}-*.md`、`tests/{vmu-chat,vmu-panel,vmu-meeting-parity,vmu-minutes-tool}.test.mjs`、本文件。**未改** `host.js`／`settings/schema.js`／`kernel/index.js`／`kernel/resume.js`／`kernel/fidelity.js`／`docs/04`（他人名下）。

## A. GAP-MTG-02：`vmu.meetings.tier` 分级闸门（**已落**）

| 项 | 落点 |
|---|---|
| 键 | `vmu.meetings.tier`（`formal\|light`，默认 formal）＋ **`vmu.meetings.allowLight`**（boolean，默认 true）—— 后者是 Lead 口径里"pack 声明**是否允许 light**"的落点；键由 vmu-core 写进 `settings/schema.js:971` 与增补 |
| 配置读取 | `kernel/meetings.js` 的 `K.tier`／`K.allowLight`（hot：下一次调用即生效） |
| **派生谓词（唯一判定点）** | `kernel/meetings.js` 的 `tier()`／`isLight()`／**`truthWriteRefusal(what, enforced)`**：`light` ⇒ 具名拒 `VMU_MEETING_LIGHT_NO_TRUTH`（next 说明如何升级为 formal）；`light`＋`allowLight=false` ⇒ **`VMU_MEETING_TIER_CONFLICT`**（`enforced=['vmu.meetings.tier','vmu.meetings.allowLight']`） |
| 消费点（同一谓词，不重复实现） | ① `open()`：矛盾声明**在建任何状态之前**拒；② `close()` 收束路径：带 `report`（实体结论）拒；③ `motion(kind:'resolution')` 拒；④ `minutes.resolve()` 经注入接缝复用 |
| 可观测 | `status()` 增 `tier/allowLight/isLight/tierConflict`；`WIRED_KEYS` 51→**53**，`keysSnapshot()` 同增；`api` 导出 `tier/isLight/truthWriteRefusal` |

行为证据（探针）：`formal` 下带 report 收束 OK；`light` 下带 report ⇒ `VMU_MEETING_LIGHT_NO_TRUTH`（`enforced=['vmu.meetings.tier']`）、不带 report **仍可**收束（议程/轮次/行动项＝light 的正当用途）；`light` 下 resolution 动议被拒、ordinary 动议通过；`light`＋`allowLight=false` ⇒ `open()` 即 `VMU_MEETING_TIER_CONFLICT`；`formal`＋`allowLight=false` ⇒ 无行为变化。

## B. chat/panel 投影缝（**已落**，read　er-a 契约 v1）

| 面 | 方法（file:line） | 快照内容 | 不入快照 | 拒绝语义 |
|---|---|---|---|---|
| `kernel/chat.js` | `snapshot()`／`restore(snap)`（`history()` 之后） | `messages`／`mutes`／`speaks`／`policyGen`；`counters:{chat:lastSeq}`；`skipped:[]` | **全部 policy**（admins/speakQuota/window/muteDefault/freezeExempt/historyCap 由 settings 重解析） | 版本/face/缺集合 ⇒ `VMU_RESUME_SNAPSHOT_VERSION`／`…_INCOMPLETE`；活账本不同 ⇒ `…_RESTORE_CONFLICT`（幂等重放同一快照 OK） |
| `kernel/panel.js` | `snapshot()`／`restore(snap)`（`audit()` 之后） | `rows`／`history`／`viewAudit`／`dropped`；`counters:{panel:0}`；`skipped:[]` | **全部 policy**（auditCap/subtasksMax/deviationPolicy/historyCap） | 同上；行不同 ⇒ 具名冲突 |
| `kernel/mailbox.js` | **`restore(snap)` 增补**（Lead 追加项）：有参 ⇒ 走投影引擎 `hydrate(snap)`；无参 ⇒ 走 `store.read('mailbox')`（缺 store／缺键各自具名） | — | — | 两条路径都返回本面自己的回执 |

id 计数：chat 取 `max(seq, counters.chat, 现存 msg 最大后缀)`（恢复后下一张票为 `msg-3`，探针实测）；mailbox 早已 max+1；panel 无自有 id（`counters:{panel:0}`）。**注入接缝不计入 `skipped`**（按 reader-a 的 docs/07 §14）。

## C. GAP-MTG-03（决议实体）与 GAP-MTG-10（投票板 reopen）

**GAP-MTG-03（已落，`kernel/minutes.js`）**：`resolve()`／`resolutions()`／`supersede()` ——
- 稳定 id **框架分配**（`res-<n>`，全所单调，恢复后 `res-3`）；
- **公告即生效**（`effectiveAt === at`）；`retroactive` 只记 `declaredAt`，**不移动生效时点**；
- **取代链单向只增**（`supersededBy`，旧文本保留；重复取代幂等、二次改指向具名拒）；
- 只读检索（id/`res-<n>`/纯数字/`target`/`meetingId`/`kind`/`limit` 1–50）；**任何 `…At/…Ms` 过滤具名拒**；调用方自带时间戳具名拒；
- **light 会议经同一 tier 判定点具名拒**；缺 `meetings` 接缝 ⇒ `VMU_ENGINE_UNAVAILABLE`（不猜 tier）；
- 同 (meeting,target,text) 幂等；行动项要求 `who`、期限只用相对 `due_in`；
- 随 minutes 快照跨重启（`counters.resolution` max+1）。

**GAP-MTG-10（已落，`kernel/ballotbox.js`）**：显式生命周期（`open｜closed`）＋ **自有 `reopen()`**——
- **裁定的板不再收票/记缺席**（`VMU_STATE` 具名拒，带"要重开请调 reopen"）；
- `reopen({boxId, reason})` **必须给理由**（`VMU_REASON_REQUIRED`）；旧结论先入 `reopenHistory` 再清票（只增不改）；
- **`vmu.ballot.reopenFloor` 真读并决定**（Lead 追加项）：不达门槛 ⇒ `VMU_BALLOT_MIN_VOTES_NOT_MET`，回执带当前票数与门槛，**`enforced=['vmu.ballot.reopenFloor']`**；
- 该键**由 `PLANNED_BALLOT_KEYS` 移入 `WIRED_BALLOT_KEYS`**（分区仍 exact：27 ＝ 23 ＋ 4，`disjoint/exact` 均 true）；
- 工具面：`vibe_vmu_meeting` 新增 **`boxopen/boxcast/boxclose/boxreopen`**（4 个 action），使该层**可达**而非 service-only。

**C-45（已落，Lead 追加项）**：唯一强制点在 `kernel/ballot.js` 的 `cast()`（`castValid` 之后、落票之前）调用 `fidelity.applyAbstention({target,by,declared})`：布尔票被改写为 **0.5 且以 `kind:'abstain'` 落账**（不计入 decisive/m），保留 `declared`／`byFidelity:true`／`markerId`；回执带 `byFidelity/declared/markerId/note`，`status()` 回显 `fidelitySeam`＋`byFidelity[]`；无接缝 ⇒ `fidelitySeam:false` 且**不改写任何票**。closed-by 已写进 `docs/08 §25.8` 与 `docs/17 §30`（指向 `kernel/fidelity.js`）。

**其余 9 条 GAP**：`docs/08 §25.4` 每行的 closed-by 已写实（GAP-MTG-01/04/05/06/07/08/09/11/12 逐条给出"由哪一层补"与现状证据），未落地者不再停留在"待做"字样。

## D. 顺手修掉的一个**真缺陷**

`tools/minutes.js` 的 `need()` 帮助函数**缺 `return v`**（`draft`/`append`/`confirm` 长期把 `undefined` 传给服务，而表面看着正确）。由本轮的 GAP-MTG-03 断言抓到，已修（`tools/minutes.js` 的 `need` 现在与 `tools/meeting.js` 同形）。**这是"断言比实现更严"抓到的一例，不是本轮新引入。**

## 验证（原样命令 + 退出码）

```
node tests/vmu-ballotbox.test.mjs          → 13 passed, 0 failed      exit=0
node tests/vmu-meeting-parity.test.mjs     → 113 passed, 0 failed     exit=0
node tests/vmu-ballot.test.mjs             → 41 passed, 0 failed      exit=0
node tests/vmu-minutes.test.mjs            → 20 passed, 0 failed      exit=0
node tests/vmu-minutes-tool.test.mjs       → 15 passed, 0 failed      exit=0
node tests/vmu-chat.test.mjs               → 67 passed, 0 failed      exit=0
node tests/vmu-mailbox.test.mjs            → 44 passed, 0 failed      exit=0
node tests/vmu-panel.test.mjs              → 39 passed, 0 failed      exit=0
node tests/vmu-meeting.test.mjs            → 50 passed, 0 failed      exit=0
node tests/vmu-meetings.test.mjs           → 161 passed, 0 failed     exit=0   （verify 已同步 53/58 计数）
node tests/vmu-resume-recovery.test.mjs    → 73 passed, 0 failed      exit=0
node tests/audit-enum-branches.mjs         → 0 finding               exit=0
node --check kernel/{chat,panel,meetings,ballot,ballotbox,minutes}.js + tools/{meeting,minutes}.js → exit=0（8/8）
```

**两条静态门当期红，经查均非本任务代码所致（附证据）**
1. `audit-enforced-consistency.test.mjs` → exit=1，`findings=2`：`UNCOVERED-MODULE@ballot.js`、`UNCOVERED-MODULE@paper.js`。
   - `ballot.js`：我的 C-45 唯一调用点读取了 `gate.enforced === true`（正确用法），使该文件进入"提到 enforced"清单 ⇒ 该门要求在其**手写场景表**里加一条 ballot 场景。**场景表在 `tests/audit-enforced-consistency.test.mjs`（vmu-verify 名下）**，我不改。
   - `paper.js`：非我名下（本轮 C-30/论文面）。
2. `audit-declaration-criterion.test.mjs` → exit=1（68/6）：**RULE F 已绿**（我的 `chat.js`/`mailbox.js` 时间守卫通过了）；6 条失败全在 **RULE A**（`generate-wired-schema.mjs --selftest` 只被"提及"未被门真跑、`regen-all --check` 聚合链、self-proof 模式是否真跑）与 **RULE E**（`vmu-activity-kernel.test.mjs:351` 的双空集合比较）——**均在 `scripts/**`／`tests/**`（vmu-verify 名下）**。

## 未做 / 待他人（具名）

1. **vmu-core 装配**：`kernel/index.js` 的 `createMinutes({ …, meetings })`（C-03 的 tier 接缝，缺则具名拒）与 `createBallot({ …, fidelity })`（C-45 唯一强制点，缺则 `fidelitySeam:false` 自曝）；`store.PUBLIC_KEYS` 的 `'chat'`/`'panel'`；`attachProjection` 两行（reader-a 侧）。
2. **vmu-verify**：`tests/audit-enforced-consistency.test.mjs` 的场景表补 `ballot.js`（与 `paper.js`）一条；`audit-declaration-criterion` 的 RULE A/E 是门/脚本自身的事。
3. 其余 9 条 GAP 的落地属后续切片（`docs/08 §25.4` 已逐条给出 closed-by，不停在"待做"）。

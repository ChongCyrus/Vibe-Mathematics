# Round 9 报告 · 目标 1（断点续跑 ＋ 人工干预）· task-70

> **一句话**：本轮把两处最后的具名缺口各自推到了**可判定**：① **退出 flush 契约**——引擎侧实现 `settle()/flushAll()/exit()`（core 的 `shutdown()` 已接线），钻取新增 §⑧ 断言"**一次 await 就耐久 ＋ 下一位读者看得到**"；② **多实例**——**真因不是"缺注册表"，而是装配的 `methodsOf` 让写穿永不触发**（集合面 `meetings`/`ballotbox` 本身就是注册表），钻取 §⑨ 用**同一个面**先测出缺陷、再测出修法。③ `meetingOpen` 未落地 ⇒ **维持具名**。
> 规矩：**没跑的没写成"已验证"**；每条结论给命令＋退出码；变异验证**真跑＋sha256 前后比对**。

## 1. 交付物与改动

| 文件 | 改动 | 性质 |
| --- | --- | --- |
| `vibe-math-vmu/kernel/resume.js` | **新增** `settle()`（排空在飞写穿）／`flushAll()`（刷 journal，state 键具名 skip）／`exit()`（两半边，`ok` 取 AND，**不 throw**）；`attachProjectionTo` 的写穿**同步注册** promise；`status().pendingWrites`；RULE F：`settle()` 的时钟读取改用 **`msStrict`**（具名拒）＋非抛错的 `readClock()`。**随后按 Lead 的 code-size 项拆出两个模块**（1267 → **1179** 行） | 引擎原语（按 core 的接口契约） |
| `vibe-math-vmu/kernel/resumeflush.js` | **新增**（150 行）：`createExitContract({clock,stamp,snapshot,keyList,keyExists,modeOf,pendingWrites,counters,storeReady,requireRead,codes})` ⇒ `settle/flushAll/exit/status`。**边界单向**：resume.js 拥有投影，本模块只拥有"干净退出"的语义；拿到的是**活视图**（同一个 `pendingWrites` Set、计数器、读门、码表）。头部写明两条不可协商的规矩（失败不 throw／时钟经 `msStrict` 绝不漏 `NaN`） | 拆分（code-size） |
| `vibe-math-vmu/kernel/contentvalue.js` | **新增**（50 行）：值标识原语 `stableStringify`/`contentDigest`/`clone`/`idSuffix`（零依赖、纯函数）；`resume.js` **再导出** `contentDigest`/`idSuffix`，公开面不变 | 拆分（code-size） |
| `tests/vmu-resume-e2e.test.mjs` | 新增 **§⑧ 退出契约**（`10a`–`10l`）与 **§⑨ 多实例**（`11a`–`11f`）；本地 `settle()` 助手改走引擎原语（不再轮询） | 钻取扩展 |
| `vibe-math-vmu/docs/07-durability-library.md` | 新增 **§17**（退出契约 ＋ 集合面方法列表） | 文档 |
| `vibe-math-vmu/docs/26-turn-orchestration.md` | §7 追加 Round 9 增补 | 文档 |
| `_handoff/vmu/12-goal1-e2e.md` | 更新：81/0、§⑧/§⑨ 读数、"证明了什么/没证明什么" | 交付物 |
| `_handoff/vmu/resume-round9-report.md` | 本文件 | 交付物 |

**没有动**：`kernel/index.js`、`host.js`（core 的接线）、`kernel/meetings.js`/`ballotbox.js`（reader-c 的面）——本轮只**读**它们并在钻取里**当作消费者**使用。

## 2. A · 退出 flush 契约

**引擎侧（我的写域，按 core 的接口名实现，无别名）**
- `await recovery.settle()` → `{ ok, settled:true, rounds, pending, waitedMs, clockNote, writesThrough, writeThroughFailures, note }`
  `ok ⇔ writeThroughFailures === 0`；写穿 promise 在 `attachProjectionTo` 里**同步注册**，所以 `status().pendingWrites` 在同一 tick 就是真相。
- `await recovery.flushAll()` → `{ ok, flushed[], failed[], skipped[], at, note }`：只刷 `mode==='journal'` 的键；state 键进 `skipped[]` 并具名理由；**没有 store 端口 ⇒ `ok:true` ＋ 具名 skip**（照 `createDurableCommitLog` 的先例）；未 read ⇒ `ok:false` ＋ `failed:[{key:null, code:'VMU_RESUME_WRITE_BEFORE_READ'}]`（**不 throw**）。
- `await recovery.exit({ reason })` → `{ ok, at, reason, writeThrough:{settled,waitedMs,pending,failures}, journal:{flushed,failed,skipped}, note }`，`ok === (writeThrough.ok && journal.ok)`。

**装配侧（core，已落地）**：`kernel/index.js:1807 async shutdown({ reason })` → 调 `recovery.exit()`，幂等（`exitFlushInFlight`）、失败进回执＋`status().shutdown`＋具名警告、无 `resume.exit` 时 `VMU_EXIT_FLUSH_UNAVAILABLE`。⇒ 我钻取里那个**自适应探针 `10l`** 已自动从"具名缺口"翻成**正断言**。

**钻取读数（§⑧，本轮真跑）**：`10a` 干净恢复 → `10b` 变更**同一 tick** `pendingWrites >= 1`（没睡、没轮询）→ `10c` 此刻 fold **还没有**它（所以下一条断言才说明问题）→ `10d` 门照旧拒（并记一条 journal）→ `10e` **一次 `await settle()`** 后 `pending === 0`、`failures === 0` → `10f` 两个 state 信封已落盘 → `10g` **`settle()` 不是 flush**（journal 仍是空种子）→ `10h` `flushAll()` 刷 journal 并具名 state 键 → `10i` **另一个 store 实例（下一位读者）在文件里看到已 flush 的 journal** → `10j` 只有写穿的那封邮件也在 → `10k` `exit()` 两半边＋AND → `10l` **shipped 装配确实调了它**。

**变异验证（真跑＋sha256）**：删掉写穿的同步注册（`pendingWrites.add(p)`）⇒ 钻取 **69 passed / 5 failed, exit 1**，红的正是 `10b`（`{"pendingWrites":0}`）**并连带 `2f/2g/9f/10f`**（§② §⑦ 的等待现在也走 `settle()`，不再是"睡够时间"）；还原后 sha256 `4F18F95C2A91692632EE101C976EAB112A0A3508D7EFDB1A16775D6895B51A60`（前后一致）⇒ **81/0**。

**边界（未证明）**：`10l` 是**源码探针**（"装配调用了"），**不是**"shipped 装配的 `shutdown()` 端到端真的刷了"——后者需要构造真 kernel/宿主（属 entry/宿主层与 verify 的行为断言）；钻取已把这条边界打印在 §⑧ 末尾。

## 3. B · 多实例：真因是**方法列表**，不是"缺注册表"

**读到的装配事实**：`kernel/index.js:941` `methodsOf = { tasks: [...], work: [] }`；`:953` `methods: methodsOf[face] || []`；
`attachProjectionTo` 的写穿 `after` **只在被包裹的方法里被调用**（`record()` → `runAfter`），而 `flushAll()` 按契约只刷 journal。
⇒ 对 `members / meetings / ballotbox / budget / chat / panel / minutes`：**`methods` 为空 ⇒ 一个方法都没被包裹 ⇒ 写穿永不触发 ⇒ 这些"已声明为投影"的键从未被写过**（`packs/v5r/settings/defaults.js:61` 声明了 `vmu.resume.projections: ['members','tasks','meetings','ballots','budget','phase','work','chat','panel','human']`）。

**钻取实测（§⑨，用真的 `kernel/meetings.js`）**
- `11a` 按装配原样接上（`methods: []`）仍干净恢复；
- `11b` **同时开两个会**（`open()` 各返回 `m1`/`m2`）⇒ 多实例确实由**集合面**承载；
- `11c` **缺陷实测**：`settle()` 之后耐久 `meetings` 键**仍是 store 的 `[]` 种子**；
- `11d` **`exit()` 也救不了它**：state 键按契约进 `skipped[]` ⇒ "core 落地了退出 flush" ≠ "这个面是耐久的"；
- `11e` **修法实测**：同一面、同一套接缝，**只把方法列表填上** ⇒ 写穿落地（信包里两个会）；
- `11f` **重启后两个会一起回来** ⇒ **多实例不需要任何新的注册表机制，集合面就是注册表**。
- `11c/11d` 是**自适应探针**：core 把 `methodsOf` 填好之后，同一次 boot 会自动翻成 "CLOSED: …now DOES write through"，**不会留下误导的红**。

**改判条件（给 core）**：把各族面的"会改状态的方法"填进 `methodsOf`（`meetings`: `open/close/attend/motion/…`；`ballotbox`、`members`、`budget`、`chat`、`panel` 同理），装订方式与 `tasks` 一致。**Round 6 的"多实例注册表未做"到此可以改判为**：机制**不需要**，缺的是装配的**方法列表**；修好后 `11c/11d` 自动转正。

## 4. C · `meetingOpen` 等价物

- 本轮复核（只读）：`grep -rn "meetingOpen|openMeeting|unclosed" vibe-math-vmu --include=*.js` ⇒ **0 命中** ⇒ **尚未落地**，按 Lead 要求**维持具名**（不写成"已具备"）。
- 已确认落地位置与判定面（供 reader-c 接手）：`kernel/meetings.js`（`live` Map 是活会集合、`snapshot()` 用 Map/Set 感知序列化、`restore()` 冲突时具名拒 `RESUME_CODE.restoreConflict`）。
- **待 reader-c 落地后**我要做的事（已写进 `12-goal1-e2e.md` 的下一步）：在钻取里加一条"重启后**哪个会还开着**可读"的断言（期望形状：`status()`/快照里每个会带 open/closed 标记，且 `recovery` 的 `inflight` 或会议面视图能一眼读出"仍有 N 个未收束"）。

## 5. 证据（本轮命令与退出码）

```
node --check vibe-math-vmu/kernel/resume.js            → exit 0
node --check tests/vmu-resume-e2e.test.mjs             → exit 0
node tests/vmu-resume-e2e.test.mjs                     → === VMU GOAL1 E2E: 81 passed, 0 failed ===   exit 0
node tests/vmu-resume-recovery.test.mjs                → === VMU RESUME: 73 passed, 0 failed ===      exit 0
node tests/vmu-resume-lock-and-marks.test.mjs          → === VMU RESUME LOCK+MARKS: 67 passed, 0 failed ===  exit 0
node tests/audit-declaration-criterion.test.mjs        → === DECLARATION CRITERION: 75 passed, 1 failed ===   exit 1
   （RULE F 已消 ✓；剩余 1 条＝Lead 的 `regen-all --check`，不是本文件）
```
**变异验证（真跑＋sha256 前后比对，保持 Round 8 做法）**：删 `pendingWrites.add(p)` ⇒ 钻取 69/5 exit 1（红 `10b` ＋ `2f/2g/9f/10f`）；还原后 sha256 一致 ⇒ 81/0。

## 6. 本轮**没做**的（具名，不写成"已完成"）

1. **shipped 装配 `shutdown()` 的端到端行为断言**：需要真 kernel/宿主装配（entry/宿主层或 verify 的行为门禁）；钻取只到"源码探针 ＋ 引擎原语正确"。
2. **`methodsOf` 的填充**（core 的 `index.js`）：这是 §3 缺陷的修法，不在我写域；本轮给出改判条件与可复现证据。
3. **`meetingOpen`**（reader-c）：未落地，见 §4。
4. **`ballotbox`/`members`/`budget`/`chat`/`panel` 的同类缺陷**：本轮**只实测了 `meetings`**；按同一 `methodsOf` 逻辑它们同形，但**没有逐面实测**（不写成"已确认全族"）。
5. **多实例的"活会 vs 已收束"语义**：`11f` 只断言"两个会回来了"，**没有**断言"哪个还开着"（那正是 `meetingOpen` 的职责，见 §4）。
6. §⑦ 的宿主 store 仍是内存假实现（跨进程 ticket 未验）——沿用 Round 8 的边界。

## 7. 下一步

1. **core**：填 `methodsOf`（各族面的状态变更方法），装订方式与 `tasks` 一致 ⇒ 我复跑 §⑨，`11c/11d` 自动转正，并把读数回报 verify。
2. **reader-c**：`meetingOpen` 落地后告我，我加"重启后哪个会还开着"一条断言。
3. **verify**：把钻取基准刷新为 **81/0**（Round 8 的 63 条 ＋ §⑧ 12 条 ＋ §⑨ 6 条），并按 Round 8 的护栏复验本轮变异锚点（`pendingWrites.add(p)` 一行）。
4. **Lead**：`audit-declaration-criterion` 剩余那条 `regen-all --check` 是你的（我这边 RULE F 已消）。

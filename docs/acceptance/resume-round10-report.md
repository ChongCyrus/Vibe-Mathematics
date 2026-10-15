# Round 10 报告 · 目标 1（断点续跑 ＋ 人工干预）· task-78

> **一句话**：本轮把钻取推进到**真装配**——用**真入口** `apply(ctx, config)` 起**两个内核实例**读**同一个真 store**，
> 复核了多实例跨实例恢复（**成立**，Round 6 缺口按此关闭）并把退出缝从"源码探针"升级为**行为断言**；
> 过程中**又抓到两个真缺陷**：① `budget` 的 **空对象种子**让真装配每次启动都报 `unhydrated:['budget']`（已修，在本轮写域）；
> ② pack 声明 **`ballots`** 而适配表键是 **`ballotbox`** ⇒ 票箱**从未被投影**（未修，出写域，已具名并给出修法）。
> `meetingOpen`（A）**未落地** ⇒ 维持具名并留了断言位。
> 规矩：**没跑的没写成"已验证"**；变异验证**真跑＋sha256 前后比对**；结构性编辑**原子**.

## 1. 交付物与改动

| 文件 | 改动 | 性质 |
| --- | --- | --- |
| `tests/vmu-resume-e2e.test.mjs` | 新增 **§⑩**（`12a`–`12i`，9 条）：真入口 ＋ 最小假宿主 ctx ＋ **两个内核实例**＋真 store；含"就绪轮询"助手与两个自适应探针 | 钻取扩展（81 → **90** 条） |
| `vibe-math-vmu/kernel/resume.js` | `hydrate()` 的**空种子**判据扩为**空对象**（`seeded:'empty-object'`）；**有键的对象仍走具名缺口** | 真缺陷修复（1189 行，仍 < 1200） |
| `_handoff/vmu/12-goal1-e2e.md` | 更新：**90/0**、§1 加 ⑩ 行、**§2.5** 真装配读数、§3 第 13 条、**§6.6** 空对象缺陷、§4 三条新边界、§8 关联 | 交付物 |
| `_handoff/vmu/resume-round10-report.md` | 本文件 | 交付物 |

**没有动**：`kernel/index.js`、`kernel/store.js`、`packs/**`（core/pack 的文件）、`kernel/meetings.js`/`ballotbox.js`（reader-c 的文件）——本轮只**读**它们、在钻取里当消费者，并把发现报给所有人。

## 2. B · 真装配 × 两个内核 × 一个 store（主项）

**方法**（`12a`–`12i`）：`import` 出货入口 `vibe-math-vmu.js` → `apply(host.ctx, { clock, root, packs: ['v5r'] })`（宿主 ctx 是 `vmu-entry.test.mjs` 同形的**最小假 ctx**：`effect`/`on`/`tools.register`）→ K1 开 **2 会 + 2 票箱** → `await kernel.shutdown({reason})` → **另开一个 raw `createStore` 读同一 root** → K2 再起一个内核实例。

**读数（本轮真跑）**
- `12a` 就绪后 `generation = 1`、`unhydrated = []`。★ **先踩的坑**：`apply()` 同步返回，而它启动的链是 `store.open()` → `hydrateIds()` → `recover()`（`vibe-math-vmu.js:562-595`）⇒ **一个 `setTimeout(0)` 不够**：闩未上锁时每次写穿被 `VMU_RESUME_WRITE_BEFORE_READ` 拒，探针里还直接 `store is not open`。本 drill 已改为对 `store.stats().open === true && restart.generation >= 1` 的**有界轮询**（这是**我的 drill 错**，不是产品缺陷）。
- `12b` `status().projections.wrappedMethods` 里 `meetings`（`mode:'state'`）的**包裹方法非空**（`open/attend/leave/speak/interrupt/motion/…`）⇒ Round 9 抓的 `methodsOf[face] || []` 缺陷在真装配上**确实已修**（core 的 `projectionMethods` 反转默认）。
- `12c`/`12d` 真面开 **2 会 + 2 票箱**；`shutdown()` ⇒ `status().shutdown.ok === true`、`pendingWrites === 0` ⇒ **退出缝＝行为断言**（取代 Round 9 §⑧ `10l` 的源码探针）。
- `12e` **另一个 raw store 实例**读到 `meetings = {mode:'state', __map: 2}` ⇒ 真装配＋真 store **真的写下去了**。
- `12g`/`12h`/`12i` K2（第二个内核实例）`generation = 2`、`meetings` **两个会都在**、报告里 `meetings:state:true`、`unhydrated = []`。

**结论（B）**：**"集合面就是注册表"在真装配上复核成立** —— 多实例跨实例恢复**不需要新的注册表机制**（集合面的 `snapshot()/restore()` ＋ 装配给它的**方法列表**即可）。⇒ **Round 6 的"多实例注册表未做"缺口：关闭**（按 Round 9 的改判口径）。
**但同一节实测出两个新缺陷**，见 §3。

## 3. 本轮抓到的两个真缺陷

### 3.1 【已修·我的写域】空**对象**种子 = 真装配每次启动都 `unhydrated:['budget']`

- **现象**：真内核 `recover()` 返回 `ok:false`，`unhydrated = [{key:'budget', code:'VMU_RESUME_PROJECTION_GAP', value:''}]`。
- **根因**：`kernel/store.js defaultKeys()` 把 `budget`（与 `settings.resolved`）种子为 `{}`；`adopt({})` 必然拒（信封一定有 `v/mode/key`）。这是 Round 8「空数组＝首跑」的**姊妹形**，区别是它出现在**出货装配的每一次启动**：`recover().ok` 恒 `false`，"budget 已声明为耐久"与"真缺口"无法区分。
- **修法**：`kernel/resume.js` `hydrate()` 的 `emptySeed` 判据加入**空对象**（具名 `seeded:'empty-object'`）；**有任何键的对象仍走具名缺口**。
- **变异验证（真跑＋sha256）**：把空对象那一段改回 `false` ⇒ 钻取 **89 passed / 1 failed, exit 1**（`12i` 红，详情即 `unhydrated:[{key:'budget'}]`）；还原后 sha256 `5A8ACD51C2705165B75AB41CB3D4FCDAE66A4880D4281DD0F41034D9D2B292B4` 前后一致 ⇒ **90/0**。

### 3.2 【未修·出写域】pack 声明 `ballots`，适配表键 `ballotbox` ⇒ 票箱从未被投影

- **证据**（真装配 `status().projections`）：
  `declared: ['members','tasks','meetings','ballots','budget','phase','work','chat','panel','human']`；
  `attached: ['human','tasks','meetings','budget','chat','panel']`；
  `notAttached: [{face:'ballots', reason:'no adapter in this assembly (the service does not expose a journal/snapshot seam yet)'}, …]`
  —— 而适配表里**有** `ballotbox`（`kernel/index.js` 的 `RESUME_PROJECTION_ADAPTERS`）。于是 K1 那两个活票箱**从未被投影**（`12f` 实测：耐久 `ballotbox` 键仍是 store 的种子）。
- **修法（二选一，都在我的写域外）**：① `packs/v5r/settings/defaults.js` 把 `'ballots'` 改成 `'ballotbox'`（**推荐**：与适配表键一致，一处改）；② 或 `kernel/index.js` 的适配表加 `ballots` 别名（要防两个键双挂同一面 ⇒ 双写）。**改完 `12f` 会自适应翻成 "CLOSED"**（它就是为此写的）。
- **`12f` 的形态**：自适应探针 —— `ballotbox` 被挂 ⇒ 断言"信封里有两个票箱（CLOSED）"；未被挂 ⇒ 断言"声明里有 `ballots`、`notAttached` 具名它、且耐久键仍是种子（DEFECT MEASURED）"。

## 4. A · `meetingOpen`（维持具名）

- **复核（只读）**：全包 `grep -rn "meetingOpen|domainState|durableDomain|openMeetings|meetingStates"` ⇒ 仅 1 处命中，且在
  `packs/v5r/middleware/prompt-switches.js:52`（一个会议状态**常量列表**，不是耐久域标记）⇒ **`task-73 D` 尚未落地**（该任务本轮 in_progress）。
- 因此**钻取里没有加**"重启后哪个会还开着"的断言——**不写成已验证**。reader-c 落地后我加一条（期望形状：会议集合的每个实例带 `open|lapsed|closed` 域标记，重启后可从 `meetings.status()`/快照一眼读出"仍有 N 个未收束"），届时断言数 90 → 91。

## 5. C · `resumeFrom` env 缝复核（`docs/15` 那句可恢复全名）

- **核实**：`docs/03 §8.2`（"env 缝（部署接口；手写登记 ✓）"）**已登记** `VMU_RESUME_FROM`：值＝`submit({resumeFrom})` 的引擎自有不透明令牌，
  不设 ⇒ 子进程从头计算、回执 `resumedFrom` 为 `null`、**不假装续算**；并给了 `file:line` 指针。
- **实现侧核对**：`kernel/mathjobs.js` 里 env 的确写在该键上（`VMU_RESUME_FROM`），回执 `resumedFrom`、令牌进 `inputHash` 指纹 ✓。
- **结论**：`docs/15:385` 现在写的是"该 env 键名见 `kernel/mathjobs.js`；它是 env 缝，不是错误码，故此处不复写全名" ⇒ **可以改回带全名**（`VMU_RESUME_FROM`），因为它的**登记处是 `docs/03 §8.2`**（命名/登记分离不再是理由）。
- **我为什么没直接改**：`docs/15` **不在 `task-78` 的写域**（我的写域只有 `docs/07`、`docs/26`）。⇒ **请 Lead 指派给 docs/15 的 owner**（或扩我写域，我一行改完）。
- **顺带一处行号漂移**（供 owner 顺手修）：`docs/03 §8.2` 的指针写 `kernel/mathjobs.js:602`（写）／`:649`（回执）／`:738`（令牌形状），
  而当前实际是 **`:611`（env 写）／`:658`（`resumedFrom` 回执）／`:747`（令牌形状）**。

## 6. 证据（本轮命令与退出码）

```
node --check vibe-math-vmu/kernel/resume.js / tests/vmu-resume-e2e.test.mjs   → exit 0 / 0
node tests/vmu-resume-e2e.test.mjs            → === VMU GOAL1 E2E: 90 passed, 0 failed ===   exit 0
node tests/vmu-resume-recovery.test.mjs       → === VMU RESUME: 73 passed, 0 failed ===      exit 0
node tests/vmu-resume-lock-and-marks.test.mjs → === VMU RESUME LOCK+MARKS: 67 passed, 0 failed ===  exit 0
node tests/vmu-kernel.test.mjs                → === VMU KERNEL: 175 passed, 0 failed ===      exit 0
node tests/vmu-entry.test.mjs                 → exit 1（**不是我的**：core 在飞的 task-74 新读者在 prompt/index.js:121
                                                 要求 vmu.prompt.compactThreshold，而该测试的配置没给 ⇒ 真崩溃，已报 core）
node tests/audit-code-size.test.mjs           → === CODE SIZE: 7 passed, 2 failed ===        exit 1
                                                 （超限文件是 **kernel/meetings.js**（reader-c 的 task-73 增长）；resume.js 1189 < 1200 ✓）
```
**变异验证（真跑＋sha256 前后比对）**：见 §3.1（空对象判据 ⇒ `89/1`，还原后哈希一致 ⇒ `90/0`）。

## 7. 本轮**没做**的（具名，不写成"已完成"）

1. **`meetingOpen` 断言**（A）：依赖 `task-73 D` 未落地 ⇒ 维持具名，断言位留好。
2. **票箱的活体跨实例往返**：被 §3.2 的键名不一致挡住 ⇒ 未证；`budget`/`chat`/`panel` 只证到"被包裹"（`12b`），**未做活体往返**。
3. **两个真操作系统进程**：§⑩ 是"两套完整装配 + 同一真 store root"（同进程）。真双进程/真崩溃（写一半断电）不在本轮。
4. **真宿主服务**：§⑩ 用的是最小假 ctx（无 DSH 服务、无子代理、无真定时器）⇒ "应用真的部署到宿主"仍属 verify 的真机项。
5. **`docs/15` 的全名恢复**：出写域，见 §5。

## 8. 下一步

1. **core**：`vmu-entry` 的真崩溃（`vmu.prompt.compactThreshold` 读者 vs 测试配置缺省）请先收口（它现在是加载后立刻崩）。
2. **pack/core 任一方**：把 `ballots` 改成 `ballotbox`（§3.2）⇒ 我复跑 §⑩，`12f` 自动翻正，并把票箱活体往返补进 90→91 条。
3. **reader-c**：`task-73 D` 落地后告我 ⇒ 我加"重启后哪个会还开着"一条（A）。
4. **Lead**：`kernel/meetings.js` 越过 1200 行（code-size 7/2）需要拆或记 backlog；`docs/15` 的全名恢复请指派（C）。
5. **verify**：把钻取基准刷新为 **90/0**（Round 8 的 63 ＋ §⑧ 12 ＋ §⑨ 6 ＋ §⑩ 9），并按 Round 8 护栏复验本轮变异锚点（空对象判据一段）。

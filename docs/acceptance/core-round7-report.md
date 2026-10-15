# Round 7 · task-54 · 目标 3 终判收尾（F8–F53 逐条结清）

- 状态：**主交付 `_handoff/vmu/10-goal3-final.md` 已完成**；本轮**补了一处**（F44 的消费点）；**两条非我名下的门禁红**需转出（见 §4）。
- 纪律：未跑全量 sweep、未 `regen-all`、未 git；临时文件 `D:\_tmp\vmu-r7`；内容型改写只用 Node／`edit`。

## 1. 结论（发 vmu-verify 的同一段）

**够强——vmu 框架足以实现 v5r 的全部功能。** 原语面 42 条结清为 **具备 41 ／ 部分 1 ／ 缺失 0**：
- 唯一的"**部分**"＝**F13**（`tools.restrict` 的未知名处理）：本仓是**刻意 fail-closed**（具名拒且什么都不注册），与 v5r 的"容错跳过"**语义相反但更安全**；改判条件＝若真机要求同名语义，加 `vmu.tools.onUnknown ∈ {refuse,skip}`（默认 `refuse`），**不得**隐式默认跳过。
- **两处旧判被本轮推翻（都因搜索范围，不是实现变化）**：**F52**（旧"缺失"按 `control.js` 行号搜；真实现是 Round 3 落地的 `kernel/activity.js` ＋注册 `index.js:1170` ＋工具面 `host.js:137/236`）⇒ **具备**；**F53**（旧"部分"缺"显式声明"；R6 已在 `docs/03:100` 声明边界，直连 `node:fs` 的模块由 8 降到 **5**）⇒ **具备**。
- **三个真缺口已闭合**：M-A04（`vmu.paper.maxRounds` ＋ 真读者 `revise()`；探针 11/0）、孤儿键 `vmu.meetings.reconsiderFloor`（删除；四道前置全清）、Lean 镜像 ＋ killable handle（生产路径贯通）。
- **5 处具名残余**（不阻塞"能否实现 v5r 功能"）：F15 最后一处无句柄 sleep（`math-computation.js:617,728`，reader-b）、F31 跨进程需**宿主分配型 store**、F44 公告注入（**R7 已接消费点**，正路断言待补）、F51 `meetingOpen` 域标记（会议面）、F53 的**自动门禁**缺失（规则已文档化）。
- **1 处性质等价保留**：F33（"门禁只在唯一收口点"是**性质**等价，不是同名原语；旧注保留）。

## 2. 本轮实际改动（B 项"能补就补"）

**F44 残余的消费点（我的写范围）**：
- `kernel/turn/index.js`：新增 `noticeSource` 缝 —— `assemble()` 里与 loop 自己的 `drainNotices(turn.member)` **合流**，源抛错 ⇒ **具名拒**（`VMU_ENGINE_UNAVAILABLE`，消息含 `notice source failed`），**不静默丢公告**。
- `kernel/index.js:1027`：`noticeSource: (member) => (lean && typeof lean.takeNoticesFor === 'function' ? lean.takeNoticesFor(member) : [])` —— 把 **Lean 面的耐久公告队列**（`pushNotice`/`takeNoticesFor`，`LEAN_NOTICE_MAX=20`，"取出即移除"）接进回合的**一次性**通知通道；无 Lean 面 ⇒ `[]`，**装配与从前逐字节相同**。
- 实测：`vmu-turn 145/0`、`vmu-kernel 175/0`、`vmu-entry 150/0`、`vmu-lean` ALL GREEN、`vmu-lean-jobs 13/0`、`vmu-lean-killable 7/0`、`vmu-seam-params-consumed 8/0`（**缝有真读者**）✓。
- ★ **诚实边界**：探针 `D:/_tmp/vmu-r7/notice-source.mjs` **3/6** —— 证到"**缝被消费**（源抛错 ⇒ 具名拒）"与"Lean 面**暴露** `takeNoticesFor`"，但**正路（公告出现在投递文本里）未证实**：探针里 `k.turn.assemble(...)` 的 `statusBlock` 没按我给的参数进入装配上下文（stub 收到空串），需按 `run()` 的完整 turn 形状重写才能证正路。**没有把它写成"已验证"**。

## 3. 验证（原样命令 + 退出码）

```
node tests/vmu-turn.test.mjs              → 145 passed, 0 failed   exit=0
node tests/vmu-kernel.test.mjs            → 175 passed, 0 failed   exit=0
node tests/vmu-entry.test.mjs             → 150 passed, 0 failed   exit=0
node tests/vmu-lean.test.mjs              → ALL GREEN (13/0)       exit=0
node tests/vmu-lean-jobs.test.mjs         → 13 passed, 0 failed    exit=0
node tests/vmu-lean-killable.test.mjs     → 7 passed, 0 failed     exit=0
node tests/vmu-mathjobs.test.mjs          → 10 passed, 0 failed    exit=0
node tests/vmu-paper.test.mjs             → 37 passed, 0 failed    exit=0
node tests/vmu-seam-params-consumed.test.mjs → 8 passed, 0 failed  exit=0
node tests/vmu-settings.test.mjs          → 47 passed, 0 failed    exit=0
node tests/vmu-planned-settings.test.mjs  → ALL GREEN (planned=113, docs=27, 39/0)  exit=0
node D:/_tmp/vmu-r6/paper-rounds.mjs      → 11 passed, 0 failed    exit=0
node --check kernel/turn/index.js / kernel/index.js → exit=0
```

## 4. 两条**非我名下**的门禁红（请转出，别计入本轮我名下）

```
node tests/audit-vmu-docs.test.mjs → 82 passed, **1 failed**  exit=1
  FAIL every VMU_* code used in the docs is registered in 03-§8 [… VMU_MAILBOX_SELF_MESSAGE (08-primitives-meeting-ballot-workflow)]
node scripts/check-docs.mjs → **DOC LINT: FAIL**  exit=1（同族：docs/08 里用了一个未登记的码）
```
- **出处**：`docs/08-primitives-meeting-ballot-workflow.md`（**v5r-reader-c 的卷**）＋ `VMU_MAILBOX_SELF_MESSAGE` 属**信箱面**（reader-a/reader-c 的实现）。
- **两条出路**：① 该码在代码里真存在 ⇒ 登记进 `docs/03 §8`（**我的文件**，但需要它的确切语义与出处 file:line —— 我没有读者给它，不敢臆造）；② 该码不存在 ⇒ 从 `docs/08` 删除或标注为"计划码"。
- **我没有动它**：既不能臆造语义登记（违反"不许把未核写成具备"），也不能改他人卷。

## 5. 未做项 / 具名边界

1. **F44 正路断言**（公告真的进入投递文本）：需按 `run()` 的完整 turn 形状写探针或仓内测试（`tests/**` 属 verify）；本轮只证到"缝被消费＋失败具名"。
2. **`tests/**` 的常驻断言**（F52 的 activity 语义、F53 的边界、notice 正路）：归 vmu-verify；我已把判定与 file:line 全部写在 `10-goal3-final.md`。
3. **F13 的容错开关**（若真机要求 v5r 同名语义）：本轮**未实现**——它是**刻意差异**，加键属于"改判"而非"补缺"。
4. **`meetingOpen` 域标记 / F15 最后一处 sleep / F31 宿主 store / F53 自动门禁**：各有 owner（会议面／reader-b／宿主／verify），见 `10-goal3-final.md §3` 表。
5. **真机面**：本轮不做真机（沿用 `05-framework-strength-evidence.md §8.2` 的 R6 终态；两次回合触 `--max-tokens` 上限被取消 ⇒ 按 playbook **不是 PASS**）。

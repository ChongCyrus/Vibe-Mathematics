# Round 8 报告 · 目标 1（断点续跑 ＋ 人工干预）· task-62

> **一句话**：本轮的交付是**一份跑绿的目标 1 端到端钻取**（`tests/vmu-resume-e2e.test.mjs`，**63/0，exit 0**），
> 并把钻取**抓出来的 3 个真 bug**（＋同轮 human 面 1 个）修在引擎侧；同时把"journal 必须在优雅退出时 flush"
> 这条**装配侧具名缺口**变成可测、有断言的契约；末尾按 `v5r-reader-c` 的点名请求补了一条
> **G7 正对照**（绑定耐用提交日志后，两条投影契约各自照旧）。
> **没跑的都没写成"已验证"**：本文每条结论后面都给命令与退出码，读源码得来的结论另行标注。
> **版本说明（诚实边界）**：`vmu-verify` 的独立验收与变异复验是在 **§⑦ 加入之前**的 **52/0** 版本上做的；
> 加入 §⑦ 后当前版本为 **63/0**，本报告与钻取文档的数字已全部回填为**当前版本**，变异读数按下表两版并列标注。

## 1. 写域与改动文件（本轮实际动过的）

| 文件 | 改动 | 性质 |
| --- | --- | --- |
| `vibe-math-vmu/kernel/resume.js` | ① `record()` 记录 `failed` 标记；重放**跳过失败命令**并报 `skippedFailed`（早前本轮已做）② **序列续接**：`seq = Math.max(seq, natural(this.seq,0)) + 1`（`:181`）③ `hydrate()` **先 state 后 journal** 的顺序（`modeOf()` 分组）④ `hydrate()` **空种子数组＝首跑**（`seeded:'empty-array'`）⑤ `:842` 两语句挤一行的排版修好 | 引擎真 bug 修复 |
| `vibe-math-vmu/kernel/human.js` | `gate()` 改为走**公开属性** `api.approvalDecision(req)`（`:389`），使投影包装能看见内部路径 | 引擎真 bug 修复 |
| `tests/vmu-resume-e2e.test.mjs` | **新增**：目标 1 端到端钻取（**63 条断言**，三次 boot 一个 store 文件 ＋ §⑦ 的 G7 正对照） | 新交付物 |
| `vibe-math-vmu/docs/07-durability-library.md` | 新增 **§16**「记录之后重启：三条 Round 8 实测规则」 | 文档（含实测读数） |
| `vibe-math-vmu/docs/26-turn-orchestration.md` | §7 追加「Round 8 增补」：编排面照搬的三组读数 ＋ 两条装配动作 | 文档 |
| `_handoff/vmu/12-goal1-e2e.md` | **新增**：钻取脚本、逐步读数、证明/未证明边界 | 交付物 |
| `_handoff/vmu/resume-round8-report.md` | 本文件 | 交付物 |

**没有动**：`kernel/index.js`（装配侧 flush 一行也不在本轮写域，具名交给 core/pack）、`kernel/store.js`（空种子问题修在引擎侧，
因为 `members`/`meetings`/`ballots` 同形）、`kernel/mailbox.js`（reader-c 的 G7 写域；本轮只**报**了它的 `o.durableQueue` 崩溃，未改）。

## 2. 交付物

1. `tests/vmu-resume-e2e.test.mjs` — 端到端钻取本体。`cd Vibe-Mathematics && node tests/vmu-resume-e2e.test.mjs`
   ⇒ `=== VMU GOAL1 E2E: 63 passed, 0 failed ===`，**exit 0**。
2. `_handoff/vmu/12-goal1-e2e.md` — 逐步读数 ＋ "证明了什么 / 没证明什么"（边界逐条点名）。
3. `vibe-math-vmu/docs/07 §16`、`docs/26 §7 Round 8 增补` — 规则与装配动作落到文档。
4. §⑦ **G7 正对照**（`9a`–`9k`，11 条断言）—— 应 `v5r-reader-c` 收尾时的点名请求而做：
   用**真的** `createDurableCommitLog`（`kernel/ballot.js` 协议）＋假宿主 `append/readAll`，绑给 `createMailbox({durableQueue})`，
   在同一套投影装配下复跑"发送＋被门拦下＋重启"。结论：**绑定耐用提交日志不改变任何一条投影契约**
   （state 面仍自动写穿、journal 面仍必须显式 flush），且"日志 settled"与"仍有 1 封未读"可同时为真
   ⇒ **提交耐久 ≠ 投递/正文状态耐久**。**我未改动 `kernel/mailbox.js` 一个字节**（G7 是他们的写域）。

## 3. 本轮修的真 bug（4 个，全部有"改前真的红"的读数）

| # | 位置 | 症状（改前） | 根因 | 修后证据 |
| --- | --- | --- | --- | --- |
| 1 | `resume.js` `record()` | boot 3 报 `VMU_RESUME_PROJECTION_GAP {kind:'hole',at:1,expected:3}`：**journal 整本不可重放** | `adopt()` 只写 `this.seq`，闭包 `seq` 仍 0 ⇒ 重启后第一条命令又从 1 号开始、撞号 | 钻取 `7a/7e` 由红转绿；**变异实验（两版都真跑）**：当前版本（含 §⑦）⇒ `61/2` exit 1；§⑦ 之前的版本 ⇒ `50/2` exit 1（**由 `vmu-verify` 独立复验**）；改回 ⇒ `63/0` |
| 2 | `resume.js` `hydrate()` | boot 3：门开出**新**请求 → 写穿把耐久 `human` 台账 **3 条改成 1 条** → `restore()` 与"被自己改过的"快照一致 ⇒ 报 `idempotent`（`restored:[]`）**看起来像成功**，journal 具名未水合 | 按 attach 顺序重放，journal 先于 state ⇒ 对着**空机构**执行历史，副作用写穿**覆盖未恢复的快照** | 修后 `human` 恢复 3 请求＋1 否决、`tasks` 重放 1 条／跳过 3 条、`unhydrated=[]` |
| 3 | `resume.js` `hydrate()` | **全新 store 的第一次** `recover()` 就 `ok:false`，`unhydrated:["tasks"]` | `store.js defaultKeys()` 给数组型键默认 `[]`，`adopt([])` 必拒 | 钻取 `1a` 转绿；`Array.isArray&&length===0` 视作首跑（行里具名 `seeded:'empty-array'`），非空裸数组仍是具名缺口 |
| 4 | `human.js` `gate()` | "卡住等批"的请求**重启后整条消失** | `gate()` 调闭包里的 `approvalDecision`，而 `attachProjection` 包的是**公开属性** ⇒ 内部路径没被记录 | 钻取 `2c`→`5a`：**同一个 `requestId`** 重启后仍在 pending |

## 4. 证据（本轮逐条命令与退出码；未列出的套件本轮**没跑**）

**核心**
```
node tests/vmu-resume-e2e.test.mjs                     ⇒ === VMU GOAL1 E2E: 63 passed, 0 failed ===   exit 0
node tests/vmu-resume-e2e.test.mjs --self-probe        ⇒ === … SELF-PROBE: GUARD CANNOT FAIL ===      exit 1（全绿树上的约定行为，非验收证据）
node --check kernel/resume.js / human.js / tests/vmu-resume-e2e.test.mjs                               exit 0 / 0 / 0
```

**回归 A（13 套，全部 exit 0）**

| 套件 | 结果 | 套件 | 结果 |
| --- | --- | --- | --- |
| `vmu-resume-e2e` | 63/0 | `vmu-kernel` | 175/0 |
| `vmu-resume-recovery` | 73/0 | `vmu-entry` | 150/0 |
| `vmu-resume-lock-and-marks` | 67/0 | `vmu-work` | 19/0 |
| `vmu-resume-falsify` | 9/0 | `vmu-scheduler` | 111/0 |
| `vmu-human-gate` | 75/0 | `vmu-tasks` | 42/0 |
| `vmu-human-falsify` | 12/0 | `vmu-tasks-dag-and-scopes` | 41/0 |
| `vmu-tasks-falsify` | 9/0 | | |

**回归 B（20 套，19 绿、1 红见 §5）**：`vmu-replay` 66/0｜`vmu-round1-seams` 40/0｜`vmu-round2-seams` 12/0｜
`vmu-store` 27/0｜`vmu-stateversion` 16/0｜`vmu-storepolicy` 11/0｜`vmu-storepolicy-falsify` 9/0｜
`vmu-mailbox` **48/0**（reader-c 修好 `send()` 后复跑）｜`vmu-mailbox-falsify` 10/0｜`vmu-members` 39/0｜
`vmu-panel`/`vmu-chat`/`vmu-meeting-parity` exit 0｜`vmu-ballotbox` 13/0｜`vmu-budget` 15/0｜`vmu-projmigrate` 107/0｜
`vmu-activity-kernel` 141/0｜`vmu-turn-contracts` 12/0｜`vmu-tools-await-rejections` 114/0 —— **全部 exit 0**。

**文档审计（4 套，全部 exit 0）**：`audit-vmu-docs` 83/0｜`audit-vmu-glossary` 12/0（56 terms）｜
`audit-vmu-wired-union` 92 modules / 0 violations｜`audit-vmu-services` 48/0（78 registered）。

**生成器（只读 `--check`，未 `--write`）**：`generate-vmu-settings-table.mjs --check` ⇒ **clean**
（`up to date (1220 keys (1099 wired, 121 declared-but-not-wired))`，exit 0）；
`generate-wiring-index.mjs --check` ⇒ **STALE**，见 §5。

**变异实验（证明钻取会咬人，两版都真跑）**：把 `record()` 的序列续接（`resume.js:181`）改回 `seq += 1` ⇒
① **当前版本（含 §⑦）**：`node tests/vmu-resume-e2e.test.mjs` = `61 passed, 2 failed`，exit 1，红的是 `7a`
（`VMU_RESUME_PROJECTION_GAP {kind:'hole',at:1,expected:3}`）与 `7e`（`{"tasks":0,"queue":3}`）；§⑦ 的 11 条**照旧全绿**；
② **§⑦ 之前的版本**：`50 passed, 2 failed`，exit 1 —— **由 `vmu-verify` 独立复验**（锚点唯一性断言 ＋ `finally` 还原 ＋
还原后 sha256 比对 `230412f8a423ea62…`）。两版之差（61−50）正好是 §⑦ 的 11 条。
②′ **第二条锚点（bug #2 水合顺序，`resume.js:596` 两组对调）**：`61 passed, 2 failed`、exit 1，
红的是 `7a`（`unhydrated: tasks`，`code: VMU_HUMAN_APPROVAL_PENDING`）与 `7e`（`{"tasks":0,"queue":1}` —— **凭空多出一个请求**，
正是"看起来恢复了"的指纹）⇒ bug #2 也**可被同一条锚点咬住**，不只是文字叙述。
③ 还原后：`63/0`、`vmu-resume-recovery` 73/0、`lock-and-marks` 67/0、`human-gate` 75/0，均 exit 0；
`resume.js` 变异前/还原后 sha256 一致（`230412f8a423ea62…`，`node --check` exit 0）。
> **自我纠正**：加 §⑦ 之后，"变异读数＝61/2"我第一版是**推断**（63−2）写进文档的，随后**真跑**确认一致；
> 规矩是"先跑再写"，文档与报告现已全部为实测值。这一条也写进了 `12-goal1-e2e.md` §7。

## 5. 本轮**非我方责任**的红（具名、已归因，别记在目标 1 头上）

- **`tests/vmu-wiring-index.test.mjs` ⇒ exit 1（28 passed, 3 failed）**：`generate-wiring-index.mjs --check` 报
  `docs/00-README.md` 的生成块 **STALE**，且总数行 `1219` vs 实算 `1220`（手写核心 `1106` vs `1107`）。
  **归因**：用 `git show HEAD:vibe-math-vmu/settings/schema.js` 与工作区版本做**逐键**差集，
  本轮新增的键**只有一个**：**`vmu.meetings.leaveApprover`**（（core 的 B②／round8-plan 里声明的那一个）。
  ⇒ 这是**生成器产物待刷**（`node scripts/generate-wiring-index.mjs --write`），按本仓纪律属 **Lead／生成器**动作，
  我不跑 `--write`。**与目标 1 本轮改动无关**（本轮未新增任何 settings 键／码／钩子；`settings-table --check` 已 clean）。
- **已知非我方的其它红**（Round 7 记录，本轮未复跑）：`audit-hook-coverage.test.mjs`（`lean/job-cancelled` 未登记）——
  已在 Round 7 报给 Lead 与 `vmu-pack`。

## 6. 本轮**没做**的（具名缺口，不写成"已完成"）

1. **【装配侧·一行】优雅退出时 flush journal**：`mode:'journal'` 无写穿（钻取 `2i` 实测：重启前 `tasks` 键仍是 store 的 `[]` 种子）；
   必须在退出路径逐个 `resume.snapshot({ key })`（钻取 `2j` 证明 flush 之后键才成立）。
   `grep -n "resume.snapshot" kernel/index.js` **零命中** ⇒ `kernel/index.js` 尚未接这一步（**不在本轮写域**，交给 core/pack）。
2. **【装配侧·同一件事的两半】**写穿是**异步文件 I/O**，同 tick"退出"会读到旧文件；钻取的 `settle()` 把"等写穿落地"显式做出来。
   真实宿主也需要等价的一步（退出前 await 到已发起的写穿）。
3. **v5r `meetingOpen` 等价物**（"已开未收束"标记）仍缺：需在会议投影里加标记（跨面，未做）。
4. **`meeting`/`ballot` 的多实例注册表**：单例投影不适用，未做。
5. **`watchdogs` 端口**：本仓 N/A（vmu 无持久在飞时钟；`grep lastInputAt|lastVoteAt|watchdogAt|inflightSince` 在 `kernel/*.js` 零命中，
   Round 7 复核仍成立）；钻取的状态面把这一点报为 N/A，**没有**接端口。
6. **真实 host／子代理重派**：钻取的 `reassign.apply` 是**记录用的回调**；真 spawn 走 `host-spawn.js`/`members.wake`，未覆盖。
7. **审批门顺序（gate 先于 pause）**：实测并断言，但**没有**改产品语义（若"暂停优先"要成立需单独一轮改 `human.js`＋`control`）。
8. **`inject` 的聊天路径**：钻取里 `chat.send` 故意拒，只覆盖了 mailbox 路径。
9. **`ballotbox`/`mailbox` 的"是否绑定耐用日志"自曝字段**：这是 `v5r-reader-c` 的面（他们已承诺 Round 9 补，
   形态对齐 `ballot.status().gate.durable`）；钻取只提供判据（"未绑定 ⇒ 悄悄退回进程内"必须能从 `status()` 读出）
   与正对照（`9a`–`9k`），**断言该字段本身未做**，不写成"已验证"。
10. **真实宿主的分配型提交日志 store**：第 ⑦ 节用的是内存假 store（`append/readAll`）；跨进程 ticket 分配未验证。

## 7. 与上轮结论的关系（目标 1 现在到哪了）

- `_handoff/vmu/06-goal1-verdict.md`（Round 6 终判）结论**不变**：恢复面**具备**（当时 2 个具名小缺口）、人工干预面**具备**（1 个具名缺口）。
- 本轮把它从"**分面证据**"推进到"**端到端可复现证据**"：同一 store 文件、三次 boot、恢复＋人工干预在**一条时间线**上跑通，
  **63 条断言**全绿（§2），并附一条 G7 跨面正对照（`9a`–`9k`）。缺口清单以 `_handoff/vmu/12-goal1-e2e.md` §5 为准；其中**新出现的一条**是
  「journal 必须在装配退出路径 flush」——它此前被"分面测试里手动调了 `snapshot({key})`"掩盖了（分面测试自己 flush，
  所以从没暴露"装配不 flush"这件事）——**这正是端到端钻取的价值**。
- **独立验收已回执**：`vmu-verify` 复跑（§⑦ 之前的版本）52/0，独立完成同一条变异复验（`50/2`，
  带锚点唯一性断言 ＋ `finally` 还原 ＋ 哈希比对），并把"退出路径不 flush journal"记入其矩阵 §9.7.10 / 证据 §10.11；
  其复核亦确认 `vmu-wiring-index` 的红由 core 新键 `vmu.meetings.leaveApprover` 引起、不记在目标 1 头上。
  ⚠️ **需刷新一处**：其证据 §10.11 记录的断言数是 **52/0**（§⑦ 之前的版本）；当前版本为 **63/0**，请按本文的回填值更新。
- 目标 1 剩余的**唯一致命级**装配动作就是 §6.1／§6.2 那一行（退出 flush ＋ 等写穿落地）。

## 8. 建议的下一步（给 Lead / core / verify）

1. **core**：在 `kernel/index.js` 的装配退出路径上接 `flushProjections()`（对已 attach 的 journal 键逐个 `snapshot({key})`），
   并把"退出前 await 写穿"做成同样的可读步骤；接好后 `vmu-wiring-index` 之外应无新红。
2. **verify**：把 `tests/vmu-resume-e2e.test.mjs` 纳入真机门禁（**当前 63/0**），并按 `--self-probe` 约定做**变异验证**
   （本报告 §4 的变异实验可作模板：改 `seq` 续接一行 ⇒ 应红；**期望值：当前版本 `61/2`，§⑦ 之前的版本 `50/2`**），
   并请把其证据 §10.11 里的 **52/0 刷新为 63/0**（§⑦ 是 reader-c 点名要的正对照，11 条）。
3. **`v5r-reader-c`（Round 9，他们已声明）**：给 `ballotbox`/`mailbox` 补"是否绑定耐用日志"的 `status()` 自曝并加断言；
   第 ⑦ 节可直接作为其 §21 的跨面正对照引用（`9a`–`9k`、`9f`/`9g` = CONTRACT 1、`9h`/`9i` = CONTRACT 2、`9j`/`9k` = 两种耐久不同）。
4. **Lead**：跑一次 `node scripts/generate-wiring-index.mjs --write` 清掉 §5 的 stale（生成器动作）。
5. **下一个真缺口**（若继续投人）：`meetingOpen` 等价物／多实例注册表（§6.3／§6.4）。

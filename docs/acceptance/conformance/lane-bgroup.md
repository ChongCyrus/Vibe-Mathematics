# 车道：B 组（记录面 / 脚本面 / 自反馈库）— 逐行复核

> 填写人：`vmu-verify`（验证/门禁车道）　轮次：R16　状态：**首版复核完成，B11 给出设计建议**
> 复核对象：`docs/acceptance/phase12-v5r-rules-conformance.md` B1–B11 行（v5r 规则清单 §B）
> 交付口径：每条给「命中/部分/缺失/非目标」+ `file:line`；不重写既有车道已判的条目，只标注引用。

---

## 0. 方法与三级链（本车道自证口径）

「实现了」不是一个二元判断，本车道统一按**三级链**分别取证，缺一级就降一档：

| 级 | 问句 | 取证方式 | 降档含义 |
|---|---|---|---|
| ① **可达**（reachable） | 有没有读到/写到它的服务或面？ | 代码引用点 `file:line` | 只有「可达」⇒ **一条声明，不是一件已发生的事** |
| ② **被构造**（constructed） | 运行时对象里真的存在吗？ | 内核/包构造处（`create*`、`slots[]`、`packTools()`）或真机 `request/header.tools` | 只有前两级 ⇒ 「装了但没人按它说话」 |
| ③ **被调用**（called） | 真实轨迹里出现过它产出的那个事实吗？ | 会话日志 / 测试断言 / 收到的回执 | 三级全中才是「生效」 |

> ★ 三级链的纪律来自本轮（见 `docs/11-gates-and-development.md` §4.2 第五条）：**可达 ≠ 被构造 ≠ 被调用**。
> 一个设置在 `schema.js` 里声明、在 `defaults.json` 里给了默认值、在注释里被描述——仍然可能是**零消费者**的死声明（B2 就是）。

判定词：**具备**（三级全中）/ **部分**（写侧中、读侧或呈现侧缺）/ **缺失**（没有机制）/ **非目标**（规则本身不要求面）。

---

## 1. 复核结论总表

| 行 | 规则要点 | 载体 `file:line` | 读/呈现侧 `file:line` | 判定 |
|---|---|---|---|---|
| B1 | Verified 文件夹：概率=1 才能入；**只有辩论能把概率改成 1** | `packs/v5r/verified.js:58-67`（`VERIFIED_TRACK`/必需字段）、`verified.js:350`（`promoteVerified`）、面 `packs/v5r/tools.js:1504`（`vibe_v5_verified_promote`） | 闸：`packs/v5r/verification-gates.js:74-86`（`p1Intent`，拒码 `VMU_PACK_V5R_P1_NEEDS_DEBATE` :84） | **具备** |
| B2 | 公共蓝图（技术路线设计）：按时更新；院士+常驻研究员共同设计；最终编辑权归院士 | 仅声明：`settings/schema.js:212`（`vmu.turn.protocolPath`，def `Shared/Protocol.md`）+ `packs/v5r/settings/defaults.json:12` | **消费者 = 0**（全库 grep `protocolPath` 只命中这两处声明） | **缺失** |
| B3 | 各自 progress：track `progress` + 记录面 | `packs/v5r/tools.js:1324-1327`（`vibe_v5_record_progress`）+ `kit/handlers.js:96-132`（track 校验 :102-107，`settled:true` :118，`by/bySource` :124-125）；轨声明 `defaults.json:19` | 读：`kit/handlers.js:264` 的 read_library 轨清单含 `progress` | **具备** |
| B4 | 已尝试路线/方法及进度 | 路线=同一面 `track:'routes'`（`kit/handlers.js:103` + `defaults.json:19`）；方法=`tools.js:1336-1339` + `kit/tools.js:22`（`KIT_CARD_CONFIG.methods`） | 读：方法在 read_library 清单（`kit/handlers.js:264`）；**`routes` 不在**（同一行清单只有 propositions/methods/problems/progress） | **部分** |
| B5 | 遇障路线/方法/障碍及原因归档 | 同一面 `track:'obstacles' | 'rejected'`（`kit/handlers.js:103`，轨在 `defaults.json:19`） | 读：**两轨都不在** read_library 清单（`kit/handlers.js:264`）；只能由写者自己 `records.list` 侧读 | **部分** |
| B6 | 命题库：定义+布尔概率∈[0,1]+进度；正式证明/证伪写完才能入辩论；概率=1 标 verified | 卡面 `tools.js:1330-1333`（`vibe_v5_record_proposition`，必需 `value/p`，`kit/tools.js:21`）；辩论闸 `verification-gates.js:143`（`debateSubjectGate`）；验证轨 `verified.js:58-67` + `:350` | 面 `tools.js:1504`（promote）+ 闸双侧（`p1Intent`/`debateSubjectGate`） | **具备** |
| B7 | 方法库（一般化/推广/抽象成工具、理论框架） | `tools.js:1336-1339` + `kit/tools.js:22`（track `methods`, kind `method`, 必需 `content/value/motive/p`） | 读：`kit/handlers.js:264` 含 `methods` | **具备** |
| B8 | Lean 代码+编译结果归档；lean 过 ⇒ 只查忠实性 ⇒ 符合即 p=1 并入 verified | 五面 `tools.js:1546/1552/1558/1564/1570`（run/job/lib/read/archive） | 忠实性审查提示块 `packs/v5r/prompts/v5r-blocks-b.js:115-126`（`v5r-formal-review`） | **具备** |
| B9 | 分派后各自负责部分的论文 | 面 `tools.js:1576`（`vibe_v5_paper`）+ `packs/v5r/paper.js:52-69`（`editorDefault:'academician'` :67、`finalizerSlot:'chair'` :68） | 论文流程 `kit/paper.js`（由 `paper.js:53` 组合） | **具备**（编辑权归 chair 是**结构化**声明，执行在 kit） |
| B10 | 脚本文件 | **无专门面**（v5r 43 面里没有任何 script/shell/write 面） | 真机发布面：成员轮 78 面 = 52 `vibe_vmu_*` + **26 基座面，含 `write`/`edit`/`pwsh`/`read`**（`session-55ab3f49…` 的 `request/header.tools`，见 `D:\_tmp\b10-tools.mjs` 输出） | **具备**（与规则自述「成员用 shell/工具写文件」一致）；**缺口**：无脚本归档/复核面 |
| B11 | 自反馈库：问题/冗余/障碍/可优化点；**院士另含对各阶段（平时/会议/辩论）流程与组织协作的自反馈优化** | 成员侧 `tools.js:404-438`（`toolFeedback`，`FEEDBACK_ADD_REQUIRED` :399，interpersonal 必填 assessment :422-425）+ 轨 `defaults.json:19`（`feedback`）+ 提示行 `v5r-blocks-b.js:89-108` | **院士侧无形状**：`复盘|阶段自|流程优化|组织协作` 在 `packs/v5r` 全目录 **0 命中**；且 `v5r-blocks-b.js:105`「未闭环条目会出现在汇报与总览的计数里」**是假承诺**——`tools.js:174-189`（report）与 `:195-210`（overview）都没有 feedback/tracks 计数 | **成员侧具备 / 院士侧缺失** |

**合计**：具备 7（B1/B3/B6/B7/B8/B9/B10）、部分 2（B4/B5）、缺失 2（B2/B11-院士侧）。

---

## 2. B3/B4/B5/B7：一个面承载四条轨，写侧齐全、读侧有洞

- 写侧只有一个面：`vibe_v5_record_progress`（`packs/v5r/tools.js:1324-1327`），`track` 参数在 `kit/handlers.js:96-132` 里校验：
  - `:102` `declaredTracks(kernel)` 从**活设置快照**读 `vmu.records.tracks`（`kit/handlers.js:31-34`），缺省回退五轨；
  - `:104-107` 不在声明里 ⇒ **具名拒** `VMU_INVALID_ARGUMENT` 并回显声明清单——不是静默改轨；
  - 因此 `progress/routes/obstacles/rejected/state` 五轨在 v5r 上都能写（`defaults.json:19` 声明 11 轨）。
- 方法卡走卡面工厂：`tools.js:1336-1339` + `kit/tools.js:20-24`（`track:'methods'`, `kind:'method'`），必需字段 `content/value/motive/p` 由 `records` 面外校验。
- **读侧的洞在 `kit/handlers.js:256-286`**：list 形式的轨清单写死为 `['propositions','methods','problems','progress']`（`:264`），
  - `methods`/`progress` 可读 ⇒ B3/B7 三级全中；
  - **`routes` 读不到**（B4 只有写侧）⇒ 部分；
  - **`obstacles`/`rejected` 读不到**（B5 只有写侧）⇒ 部分。
  - 这条不是猜测：`:269-273` 对未声明轨的 `VMU_INVALID_ARGUMENT` 是「跳过并记录」，而缺失的轨是**根本没进循环**，两者要分开说。
- 附注（不构成判定）：`kit/handlers.js:115-117` 注释称 v5r 包声明 `requireSettledRecords: true`，但 `packs/v5r/settings/defaults.json:22` 实测是 **false** —— 注释与声明漂移；写侧 `settled:true` 是无条件常量（`:118`），所以行为不受影响，现场记录留档。

## 3. B10 脚本面：规则说「无专门面」，运行时确实靠基座面

实测证据（不是读注释）：隔离会话 `session-55ab3f49-8a9c-4a7b-a942-8bb4a4eb07a8` 的 `request/header.tools` 共 **78** 面，非 `vibe_*` 的 **26** 面为：
`ask_user_question, create_goal, edit, exit_plan_mode, get_goal, glob, grep, interrupt_agent, job_kill, job_list, job_output, list_agents, present, pwsh, ralph, read, read_image, send_message, skill, subagent, subagent_fork, todo_write, update_goal, web_search, workflow, write`。
- `write` / `edit` / `pwsh` 在列 ⇒ 成员**确实**能用工具与 shell 写脚本文件，规则自述成立。
- 但 v5r 包**没有**脚本归档/复核面：写出的脚本不进 records、不进论文证据链。若 B10 的原意只是「成员能写脚本」⇒ 具备；若含「脚本归档可复核」⇒ 部分。**本条按规则原文判具备，缺口单列**。

## 4. B11 自反馈库：成员侧有、院士侧缺，且一处「可见性」承诺为假

### 4.1 成员侧（具备）
- 写：`tools.js:404-438`。`op=add` 必需 `category/route/phenomenon/impact/action`（`:399/:417-421`）；`route=interpersonal` 强制 `assessment`（`:422-425`）；落 `track:'feedback'`（`:429`）；`op=update` 回填 `status/outcome/note` 并置 `settled`（`:433-437`）；`op=list` 返回未闭环（`:410-415`）。
- 提示：`v5r-blocks-b.js:89-108`（`v5r-feedback-line`，三条路由 self/team/interpersonal 的仪式差异写得很清楚）。
- 轨：`defaults.json:19` 声明 `feedback` 轨；kind `feedback` 在 `allowedKinds`（`defaults.json:20`）。

### 4.2 院士侧（缺失）
- 规则要求院士**另含**：对「平时/会议/辩论」三阶段流程 + 组织协作的自反馈优化。
- 实测：`packs/v5r` 下 `复盘|阶段自|流程优化|组织协作` **0 命中**；`toolFeedback` 没有角色分支（院士与普通成员同形）；没有任何按阶段（stage）区分的字段或视图。
- 因此现在是：一条**不分阶段、不分角色**的单一 feedback 轨，成员与院士共用同一个面。院士的「阶段自反馈」既没有**词表**（stage 从哪来）、也没有**闸**（什么时候该写）、也没有**呈现**（谁看得到缺口）。

### 4.3 附带缺陷：`v5r-blocks-b.js:105` 的承诺不成立
提示行说「未闭环条目会出现在汇报与总览的计数里」，但：
- `vibe_v5_report`（`tools.js:174-189`）的 `counts` 只有 `roster/live/tasks/openTasks/openMeetings`；
- `vibe_v5_overview`（`tools.js:195-210`，**chair 专用**，`:198-201` 具名拒非 chair）只有 roster/board/meetings。
两处都**没有** feedback 计数 ⇒ 提示语在教成员依赖一个不存在的可见性。**这是「提示与代码不一致」，不是文档问题**：要么补计数，要么改提示语，二者必须选一个。

### 4.4 设计建议（闸 / 载体 / 谁能读）

**载体**：复用已声明的 records `feedback` 轨（`defaults.json:19`），**不新建库**。理由：机制（records 面）已经具备且被测试覆盖，规则缺的是**阶段维度**与**角色可见性**，不是存储。

1. **写侧（闸 ①，硬）**：
   - 新增 pack 声明键 `vmu.feedback.stages`，pack 默认 `["normal","meeting","debate"]`（词表属机构政策 ⇒ pack/settings，不进内核，红线 1）。
   - `vibe_v5_feedback add` 增可选 `stage`；给了就必须在声明词表内，否则**具名拒** `VMU_INVALID_ARGUMENT` + 回显词表——完全照搬 `toolRecordProgress` 的轨校验范式（`kit/handlers.js:102-107`），不发明第二套。
   - 落库时把 `stage` 写进卡片 `title`（`流程/<stage>/<category>/<route>`）或 tags，`op=list` 增 `stage` 过滤（读侧同词表）。
2. **职责侧（闸 ②，软）**：院士 charter 段（`v5r-blocks-a.js:254` 起「四、你的组织职责与边界（院士）」）加一条：**每阶段收尾**（会议关闭后 / 辩论出定论后 / 一段平时工作后）写一条阶段自反馈，记「流程哪里卡、组织怎么改、下次怎么试」。软闸 ⇒ 不硬拦回合；缺口靠 ③ 暴露。
3. **可见性侧（闸 ③，实）**：`vibe_v5_overview`（chair 专用，`tools.js:195-210`）增 `feedback: { open, closed, byStage: { normal:{…}, meeting:{…}, debate:{…} } }`；`vibe_v5_report`（`:174-189`）增一行未闭环计数。**这一步同时修掉 4.3 的假承诺**，且不新增面、不改发布表。
4. **谁能读**：
   - 全员：`vibe_v5_feedback op=list`（可带 `stage`）；
   - 院士：`overview` 的阶段汇总（唯一能看「哪一阶段没写」的视角）；
   - 按成员读：`read_library` 的轨清单（`kit/handlers.js:264`）应补 `feedback`，否则「按作者/kind 读别人的反馈」只能靠 feedback list 的全所视图。
5. **不做什么**（边界）：不在内核加「阶段反馈表」；不硬拦「院士没写反馈就不能开下一次会」（会把组织纪律变成技术死锁）；不做跨成员库聚合的第二个读面（当前成员库就是**一个所级 records**，`by/owner` 区分作者，`kit/handlers.js:277` 已按 `owner||by` 过滤）。

### 4.5 三级链挂账（B11 设计落地后应逐级验收）
| 级 | 落地前 | 落地后要验的 |
|---|---|---|
| 可达 | `defaults.json:19` 有 feedback 轨；`tools.js:404-438` 有面 | — |
| 被构造 | 面已注册、跑通 | 新 `vmu.feedback.stages` 是否真的进入 live settings 视图（`settingsView()`），而不是只在 defaults 里 |
| 被调用 | 成员 feedback ✓；院士阶段 feedback ✗ | 真机一轮：会议关闭后院士写出带 `stage:"meeting"` 的卡；`overview` 计数 +1；越界 stage 具名拒 |

---

## 5. 建议台账行（可直接粘贴到 `phase12` B 组）

| 行 | 判定 | 证据列 |
|---|---|---|
| B1 | ✅ 已实现 | `packs/v5r/verified.js:58-67,350`；闸 `verification-gates.js:74-86`（`VMU_PACK_V5R_P1_NEEDS_DEBATE` :84）；面 `tools.js:1504` |
| B2 | ⛔ 缺口 | 只有声明（`settings/schema.js:212`、`packs/v5r/settings/defaults.json:12`），**零消费者**；无面、无闸、无更新路径 |
| B3 | ✅ 已实现 | 面 `tools.js:1324-1327` + `kit/handlers.js:96-132`；读 `kit/handlers.js:264` |
| B4 | 🟡 部分 | 写齐全（`kit/handlers.js:103` routes；`tools.js:1336-1339` methods）；`routes` 读不到（`kit/handlers.js:264` 清单缺） |
| B5 | 🟡 部分 | 写齐全（`obstacles`/`rejected` 轨 `defaults.json:19`）；两轨读不到（同一清单缺） |
| B6 | ✅ 已实现 | 卡 `tools.js:1330-1333`；辩论闸 `verification-gates.js:143`；验证 `verified.js:350` + 面 `tools.js:1504` |
| B7 | ✅ 已实现 | `tools.js:1336-1339` + `kit/tools.js:22`；读 `kit/handlers.js:264` |
| B8 | ✅ 已实现 | 五面 `tools.js:1546-1570`；忠实性块 `v5r-blocks-b.js:115-126` |
| B9 | ✅ 已实现 | 面 `tools.js:1576`；`paper.js:67-68`（editor=academician / finalizer=chair） |
| B10 | ✅ 已实现（无专门面） | 包内无脚本面；真机 78 面含 26 基座面（`write/edit/pwsh/read`，`session-55ab3f49…` `request/header.tools`）——与规则自述一致；缺口：无脚本归档面 |
| B11 | 🟡 部分（成员侧 ✅ / 院士侧 ⛔） | 成员侧 `tools.js:404-438` + `v5r-blocks-b.js:89-108`；院士阶段自反馈 0 形状（`复盘|阶段自|流程优化|组织协作` 零命中）；假承诺 `v5r-blocks-b.js:105` vs `tools.js:174-189,195-210`；设计见本文件 §4.4 |

---

## 6. 本车道过程纪律（本轮新增，Lead 已批准）

**「活文件不原地拔牙」。** 有牙自证（plant 违例 ⇒ 红、删除 ⇒ 绿）必须做，但**不能在别人正在编辑的文件上做**：
- 拔牙/种牙只能作用在**自己能独占写权**的临时探针文件或副本上；对 `vibe-math-vmu/**` 做变异自证时，先确认无人并发编辑（`git diff` 快照 + 最近修改时间），做完立刻还原并复核哈希与全绿。
- 本轮实测教训：`packs/v5r/tools.js` 曾在一个时间窗内被并行改了三版（41→43 面），任何「先记行号、后回改」的动作都会踩空。⇒ **定位用函数名/导出名，行号只作快照**；改动前重读现场。
- 报告里区分三种「红」：**我的改动造成的红** / **别人的现场红（只报不改）** / **陈旧红**（重跑即绿，要写清是陈旧）。

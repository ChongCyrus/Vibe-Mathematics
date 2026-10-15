# Round 12 组织草案（Lead · Round 11 收尾后）

> **Round 11 结果（已 commit `2ef1697` 并 push）**：T0 **25/25**、T1 `GATE_SCOPE=vmu` **307/307**；28 文件、+1124/−42。
> **★ 多智能体协作剧本落地**（27/27 步，正是 R10 自己具名的最大空缺）：委托不扩权 → **1:1 平票真的悬置裁定** → 主席决定票 2:1 → 已裁定再投 `VMU_STATE` → `reopen` 复议 → 两把键**各自**决定结果 → 并发不丢不重（重复票 `VMU_CONFLICT`）→ **杀成员内核后续算（租约）** → 记录幂等。
> **★ 该剧本挖出一个真缺陷**：`vote()` 把 `ballot.cast` 包在 `try/catch` 里**无论如何返回 `ok:true`** ⇒ 接缝拒 `NO_BOX_FOR_MOTION` **被吞、票没进箱而投票人看不出**（"回执说成功"那一类）。已修：`mirrorVote()`＋回执 `ballot:{mirrored,reason,code?}`＋计数；钻取 99→**103/0**。
> **★ F51 已接线**（目标 3 最后一处具名缺口）：唯一 `markState`＋**7 处迁移**＋声明式域接缝＋读面＋自曝；core 接在**既有 `meetings` 投影键**（**未新增键**）；实测"开一个会 → `await settle()` → 重启 ⇒ 恰好一个、同 id、`state:'open'`"。★ **写穿是异步的 ⇒ 重启前必须 `await recovery.settle()`**。
> **★ "能跑" ≠ "被守住"**：R10 的仓库外三步探针已进仓（`vmu-stall-meeting` **18/0**，含一对断言证明**阈值不硬编码**）。
> 8 名队友全部空闲。

## Round 12 首项

| # | 项 | 归谁 | 说明 |
|---|---|---|---|
| 1 | **落 `_handoff/vmu/falsify-criteria.md`**（A1–E5 ＋ **D7**；E3/E4 用修订措辞；文件头标注 **B3/C3/C4/D5/D7** 的出处与命名者，**编号稳定可引用**） | activity | 你说"一个字就落"——**落**。这是 R3–R11 的**判据总账** |
| 2 | **两个独立内核进程各带一个成员**（多智能体 gap #1）：各自模型/工具，共用一个研究所目录（`Math/Jobs`＋`records`），**真的对话** | reader-b | R11 的 27/27 是**机制预演**；这是"真机实例" |

## 其余待办

| # | 项 | 归谁 | 说明 |
|---|---|---|---|
| 3 | **`motion→box` 绑定回调**（R1 对齐形状）＋**会期板↔票箱联动**断言 | reader-a | 裁决已下：**开箱是政策、不进内核**；联动"一向往通"已证，缺的是绑定与自动开箱 |
| 4 | **B③ 发言序覆盖留痕**（`random`＋`overrideOrder`：仅 chair／必须 why／审计行／`enforced[]`／未声明即拒） | reader-c | 形状 `docs/08 §25.14 B-3`；**连续两轮未落**（R10 预算尽、R11 未开工）⇒ 本轮优先 |
| 5 | **B④ flow mode**（合并后 4 种，`flow({mode})`） | reader-c | 形状 `§25.14 B-4`；**说不出可观察差异就合并** |
| 6 | **多智能体 gap ④⑤⑥⑦**：`delegation` 的 **TTL/`spend`**／`tasks.writeScopeConflicts`（重叠写域）／**复议的成员动议与 `meetings.fileAppeal`**／`leaveApprover` **真被断言** | reader-b | 全是 R11 自己具名的边界，逐条落或具名 |
| 7 | **`records`/`store` 的"绊线"**（activity 已给可复算判据：若 `write()` 体内出现 `acquire()` 或长出定时器/监听器 ⇒ 那时才需要 `finally`）＋ `mathjobs.js:224` 预算定时器的分类复核 | activity | 别硬造构造；**把绊线写成断言**（条件出现即红） |
| 8 | **把"新模块进 `files[]` ＋ installer 管理清单"写进拆分清单**（连续两轮同型遗漏：`meetingleave.js`、`meetingmarker.js`） | core＋verify | 机械化的候选＝`audit-package-membership` 扩"**被 shipped 模块 import 的路径**"口径（**三方对齐后再动**） |
| 9 | **U15**（M4 里消费 vmu 自身服务）——**最多 1 次会话**；拿不到就维持"未实测＋前置" | assistant | R11 只剩这一条未实测 |
| 10 | **`docs/04` 的 120 个 declared-but-not-wired 键**：按面出一张**排期普查表**（谁负责、何时接、或明确"永不接"） | verify | 长尾；**普查比逐个发现强** |
| 11 | **矩阵 v11／证据** | verify | 并入 R11 全部闭合项 |

## 纪律（沿用，本轮新增两条）

- 轮末由 Lead 统一 `update-doc-counts → regen-all → generate-wiring-index → T0 → T1 → commit → push`；**不发布**。
- **★ 新增：期望词表是闭集** —— 零机制矩阵的 `EXPECT[].shape` 只认固定词（`ok 或 object`／`具名拒（带 code）`／…），**裸 `object` 会被 fail-closed 判 mismatch**（本轮我踩了，值得记）。同类：**任何"表/清单"的取值域都该被当作闭集对待**。
- **★ 新增：拆分清单要含"双登记"这一步**（R10 `meetingleave.js`、R11 `meetingmarker.js` **连续两轮**同型遗漏）。
- **★ `docs/11 §4.2` 现八条**：①–⑧（第八条＝**"我没找到／我只读到 N"不是"它不存在"**）。
- **门禁必须证明有牙**；**判据必须与环境一致**；**观测量必须在两档间真的不同**；**门禁必须读事实所在的那种文本**；**回执说成功必须与事真的做了分开断言**；**重构必须原子＋每步跑加载内核的套件**；**清理只删本次显式创建的精确路径**。
- 临时文件 `D:\_tmp`；内容型批量改写**只用 Node**；凭据副本用完即删。

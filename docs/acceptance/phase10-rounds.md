# Phase 10 —— 八个总目标的执行台账

> ★ **本文件是【历史记录】，不改写。** 数字一律由命令派生（§0）。
> ★ 判定口径：★ **"绿"必须能指向命令输出**；★ **"没测"一律写成"没测"**，★ 不写成"没问题"。

## §0 怎么复核

```bash
node scripts/preflight.mjs                     # T0
GATE_SCOPE=vmu node tests/run-tests.mjs        # T1 全量
node tests/run-tests.mjs --counts              # ★ 作业计数的权威来源
node scripts/regen-all.mjs --check             # 派生面同步
node scripts/check-docs.mjs                    # 文档 lint
node scripts/slv-inspect.mjs <session-dir>     # 真机：块与 wire、0 RED 判据
```

★ 本阶段末的读数：★ **T1 = 396 PASS / 0 FAIL（332 套件 ＋ 64 探针）**；★ **派生作业 465**（★ 357 套件 ＋ 108 探针）。

## §1 目标 1 —— ptc 下的同源块漂移：**完成**

★ **问题**：块由 `out.tools`（逻辑收窄集）算出，而 ptc 在同一 hook 里把 wire 换成单个 `run_code` ⇒ 块说 N 个、wire 只 1 个。

★ **修**：★ 块**如实描述呈现方式**（`【本轮工具呈现｜<slot>】本回合以 run_code 呈现：下列 N 个工具可通过代码调用`）；★ native 文本**逐字节未变**；★ ptc 未生效时回落 native。

★ **断言**：★ `const effectiveNames` 在源码里**恰好出现一次**；★ 双向断言「块与 wire 不得互相矛盾」。

## §2 目标 2 —— 一期完整研究所端到端：**完成**

★ **判据与结果**：

| 段 | 证据 |
|---|---|
| 落座 | 三席 `seated:true` |
| 研究 | `env probe lean` ⇒ `Lean 4.34.0`；`lean_job` ⇒ `passed:true, exitCode:0, hashUnchanged:true`；`record_progress` ok |
| 会议 | `motion` / `second` / `ballot` ⇒ `outcome:true`；`close` ⇒ 服务归档 |
| 论文 | 8 步到 `awaiting-editor`；`render` ⇒ `wrote:[md,tex,meta], missing:[pdf], complete:false`（**pdf 具名缺**）；**member 定稿 ⇒ `VMU_NOT_PERMITTED`**，**chair ⇒ `finalized:true`** |
| 信箱 | 非紧急**提示无正文**（正文标记 0 命中）；紧急带正文；`list`→`open`→`mark` |
| wait | `timedOut:true, waitedMs:10004` |
| closure | **`cast:true, for:["r-1"], missing:[], eligible:["r-1"]`** |
| 收尾 | **`slv-inspect` 0 RED**；`NO_FENCE`/`UNKNOWN_FIELD`/`FIELD_NOT_APPLICABLE`/`BAD_JSON` **全 0** |

## §3 目标 3 —— 审计收尾（含正名）：**完成**

★ `scripts/audit-no-consumer.mjs` ⇒ **`scripts/audit-readers.mjs`**；★ 四类措辞改为**读点语言**（A 无读点＝缺陷／B 对外 API 无仓内读点是常态／C 仅测试读点／D 死代码）。

★ **B 类 15 条已裁定**（`PUBLIC_API` 标注**真正改变分类** —— 此前只写 `why` 从不改 `cls`，**标注是装饰品**，这是"设了值但没生效"第三次出现，且出现在抓它的工具里）。

★ **盲区已补**：`--deep` 枚举对象字面量内的方法。

★ 判据：★ **A/C/D = 0**；★ `--strict` exit 0；★ `docs/01 §1.4` 与工具互指。

## §4 目标 4 —— 弃用旧 preset：**部分完成（★ 物理移动未做，已如实留白）**

★ **已完成**：
- `docs/DEPRECATED-LEGACY-PRESETS.md`：五个 preset 各是什么、为何弃用、**各对应哪个 pack**（v3→`packs/v3`；v4/v5/v5r→`packs/v5r`；**v2 无直接对接包**）；★ 明写**历史 acceptance 不改写**。
- 根 `README.md` 弃用声明（用代码路径而非 markdown 链接，以过 packaging 门禁）。
- `tests/_lib/legacy-presets.mjs`：**一个路径开关**（`LEGACY_BASE`），**106 个调用点**已走它。
- 两处 scripts 已修：`dsh-drive.mjs` 默认 preset → `vibe-math-vmu`；`capture-persona-corpus.mjs` 硬 import → helper。
- `audit-installer-policy` §14 夹具**已查明为何会红**并**在本轮重写为单 preset 后 90/0**（★ 该重写随回退一并撤回）。

★ **未完成，且原因已查明**：
1. **物理移动**（`archive/legacy-presets/`）。★ **三次尝试，三次干净回退**（★ 没有一次把红态提交上去）。
   ★★ **第三次的关键更正**：★ 先前说的"482 处静态 import"**是误计** —— 该模式把 `vibe-math-vmu/` 当成 `vibe-math-v*` 匹配了；★ **真实是 12 处**。
   ⇒ ★ **30 套失败另有来源**：`audit-registration` 的 v2–v5 探针、`audit-path-discipline`、`audit-persona/prompt`、`audit-shared-module-parity` 等**审计脚本与 `installer.js` 期望硬编码了 preset 所在位置**。
   ⇒ ★ **结论：这不是"改引用"的活，★ 是"重构审计脚本"的活。**
2. **发货面移除**（`package.json` exports 5 ＋ files 58；`installer.js` 5 个 src）。★ 试过，★ 会连带 21 套；★ 其中 `audit-installer-policy` 的 6 条**已查明是夹具假设了两个不同 preset**（★ 不是 installer 的安全缺陷 —— 真实 6 preset 下该套 **100/0**）。

★ **下次继续的入口**：★ 先改那 4 个审计脚本的路径来源，★ 再 `git mv` ＋ 翻 `LEGACY_BASE` ＋ 删发货条目 ＋ 重写 §14，★ 一个 commit。

## §5 目标 5 —— 全面深度检查：**完成（产出清单在此）**

★ **真缺陷（★ 每条都有修前/修后证据）**：
1. **非成员能投票**（`ghost` 计票 `for:3`）—— 装配没把 `members` 缝传给会议服务 ⇒ `isMember` 恒真。★ 修：传**稳定代理**（非捕获值，因 `declareSlots()` 会替换对象）。
2. **两套会议存储之间的桥从未对齐** —— 服务自己生成 id、从不接收 id；★ 修：服务接受显式 id ＋ 重复 ⇒ `VMU_CONFLICT`。
3. **票箱对所有人开放** —— `eligible` 空即全员；★ 修：一个声明（`eligibleSeats`）两个消费者；**框架默认空（零策略）＋ v5r 声明 chair/member**。
4. **服务无 `summary`** —— 从开会的面读不到 motions/tallies；★ 已补。
5. **`vibe_v5_resume` 调错 API** —— 调的是审批面 scope 级 resume，**返回 ok 而内核仍 paused** ⇒ pause 后会议/票箱全不可用。
6. **`detail:'closure'` 被静默忽略** ⇒ 现在真收窄（1875 → 240 字节）＋ 未知值具名拒。
7. **成员调 `vibe_vmu_turn` ⇒ 自等 175.7s ⇒ 交付超时 ⇒ 身份丢失 ⇒ wire 回落到 87 个宿主工具**。★ 修：非 root 只许 `status`（绕队列）＋ **面只许收窄不许变宽（sticky fail-closed）**。
8. **`-Faces` 未知名被静默忽略**（★ 面名其实是 `activity` 不是 `wait`，一次 run 静默少一个面）⇒ 具名拒 ＋ 列出已知名。
9. **`records.list` 与 `v5_read_library` 静默截断** ⇒ `total/returned/truncated/hint` ＋ `limit:0`。
10. **root 继承最后一个 member 的同源块** —— `pullMemberToolFace` 原地改 section 对象，管线把同一对象交给 root。★ 修：copy-on-write。
11. **`[circular]`** —— 序列化器把共享数组的第二次出现当成环。★ 修：祖先栈判真环。
12. **`[object Object]`** —— paper 的引擎记录数组被 `.join`。
13. **`quorum` 陈旧** —— `present` 只由 `attend()` 增长、投票从不并进去 ⇒ 两人都投仍说"还有一人未表态"。★ 修：**投票即参与** ＋ `unansweredPolicy`。
14. **`close.enforced` 空** —— advisory rails 只在开关为真时标记 ⇒ 误读为"没评估"。★ 修：咨询即标记。
15. **`toolCalls[].ok` 恒 null** —— hook 读了不存在的 `exec.result`；★ 真实契约是 `(exec, result)` 且成败在 `result.isError`（**读安装的 DSH 源码核出**）。
16. **`triedEngines[].code` null** 而 message 有码 ⇒ 已回填。

★ **假绿（★ 比红更危险）**：
1. `vmu-motion-box` **一直靠 `isMember` 无牙才绿**（从没给成员落座）。
2. `b1prime-staleness-report` **断言硬编码行号**（加一个设置键就移位）。
3. `audit-prompt-invariants` 的**一条 mutation 从未真正生效过**（读取路径绕过了 mutation 缝）。

★ **两处 fixture 配置了不存在的面名 `metrics`**（`vmu.metrics.*` 是设置族，★ 没有 `metrics` 面）—— 由"未知名 ⇒ 具名拒"当场抓出。

★ **68 条"已实现但测试 0 引用"的拒绝码已归桶**（30 桶）；★ **优先桶（latex/lean/env）已做样板**。

## §6 目标 6 —— SLV 实测 vmu 自身：**完成**

★ **层 1（无 LLM 全工具面探针）**：★ **97 个面可调**（56 vmu ＋ 41 v5r；`vibe_vmu_script` 未注册，条件 `scripts.length > 0`）；★ **U（未捕获异常）= 0**；★ **E（空成功）= 0**；★ 30 个具名拒全部可解释。

★ **层 2（真机）**：★ `control` 的 `pause`/`resume` **真的改变 `controlState`**（`resumes:0→1`）；★ `meeting` 先 `VMU_MEETING_TOO_SMALL` 补参数后成功；★ `task` 三步闭链；★ **`mailbox` 与 `v5_inbox` 是同一套存储**（双向实证）—— **没有重蹈会议那个坑**；★ `vote` 的 `cast:false` 正确；★ `wait`（面名 `activity`）`timedOut:true`。

★ **未测到的面**：★ 见 §5 的 56 个未覆盖面清单；★ **原因分三类如实记录**：缺夹具（需要预先落座/开会/有票据）、缺环境（LaTeX 执行器）、需授权（安装类）。

## §7 目标 7 —— 完整流程跑到结题：**完成**

★ 明确告知主代理与全体成员：★ **"这是一次模拟运行，以测试功能为主，请如实报告异常、不要为了收敛而粉饰"**。

★ **判据**：★ **`cast:true`**；★ **`slv-inspect` 5 sessions / 0 RED**；★ 四类错误 **全 0**；★ **每成员 wire 恰 1 个工具（无 87 泄漏）**；★ root 提示词**无 member 块**。

★ **最有价值的产出是成员报的异常** —— 共 **16 条**，★ 逐条落地为 §5 的修复。★ 其中一条**是我们自己的提示词义务**：★ 成员在正文里贴回执 JSON，★ 大括号被判为回执边界 ⇒ `BAD_JSON`；★ 修的是**提示词**（"不要粘贴 JSON 对象或工具回执原文"），★ 不是解析器。

## §8 目标 8 —— docs：**完成（三轮）**

★ **第一轮：覆盖审计（15 条缺口）** ⇒ 查出 **5 处 docs 与实际不符**。★ 最刺眼：★ **`vibe_v5_paper` 在全部 docs 里 0 次出现** —— ★ 论文的唯一运行入口没有文档。

★ **第二轮**：★ `docs-landed` **11 卷 ＋ 仓根 `docs/` 19 卷逐页给结论**（★ 需要改的改了、★ 历史材料明确不改写）。

★ **第三轮**：★ `docs-landed/03/09/10` 的**会漂移计数改成指向生成式索引**（工具数、设置键数、服务登记点、行数、字节数）；★ **"清单即内容"的地方保留清单**。

★ **词表统一**：★ **权威在 `docs/01 §1.4`**（§1.4.1 消费者＝使用者可能的需求；§1.4.2 设计/准入层＝消费者、接线/门禁层＝读点/读取者）；★ `04` 只引用不另定义；★ `audit-readers` 指回同一节。

## §9 已知未覆盖（★ 明确留白，不假装）

1. ★ **v3 pack 与 v5r pack 的能力对齐** —— ★ 用户裁定**不开展**。
2. ★ **目标 4 的物理移动与发货面移除** —— ★ 见 §4（★ 是审计脚本重构，★ 不是引用改写）。
3. ★ **`docs-landed/05`／`06` 的其它历史读数** —— ★ 已声明为弃用前快照，★ 未逐条改。
4. ★ **`passentAs` 的作用域语义** ★ 依赖本会话早期对 DSH 的实测，★ **未从源码复读**（`app.asar` 不作为目录可检索）—— ★ 已在 docs 里**永久标注**。
5. ★ **`presentAs`／`deferLoading` 的行为差异只在 v5r 的上下文里测过**；★ 其它 pack 的呈现组合未逐个实测。

## §10 这一阶段的五条教训

1. ★★★ **"设了值" ≠ "生效了"** —— ★ 本阶段**七次**遇到同一形态：`tools` 参数进了 `properties`、`urgent` 缺键被静默剥掉、`PUBLIC_API` 标注不改 `cls`、`detail` 收了不用、`poll() isError` 读了不存在的字段、`mutation` 从未生效、`enforced` 被静默清空。
2. ★★★ **假绿比红更危险** —— ★ 三个套件靠"守卫无牙"才绿；★ **一处 mutation 从未命中目标**；★ **两处 fixture 配置了不存在的面**。
3. ★★★ **诊断面本身是被测系统的一部分** —— ★ `slv-inspect` 自己错过一次（只读 user 消息、块在另一条 `system-prompt` 消息里）。
4. ★★★ **不许静默** —— ★ 本阶段修掉 **4 处静默**（截断 ×2、未知名面、`detail`）。
5. ★★★ **留在红的中间态比慢更贵** —— ★ 三次归档尝试失败，★ **三次干净回退**；★ 两次并发写窗口靠"等收工再刷新"化解。

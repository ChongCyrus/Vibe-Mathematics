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

---

## §11 收尾（目标 4 与目标 8 完成后的追加记录）

### 目标 4 的物理移动：**第四次成了**，而前三次的失败是它成功的原因

★ **前三次**：★ 先移目录 → 1058 处引用全断；★ 先删发货条目 → 21 套红；★ 先改 482 处 import → 发现**那个数字是误计**（`vibe-math-v*` 的模式把 `vibe-math-vmu` 也匹配了，★ 真实 12 处）。★ **三次都干净回退**。

★ **第四次**：★ **先把"路径来源"收敛到一个开关**（`tests/_lib/legacy-presets.mjs` 的 `LEGACY_BASE` ＋ `legacyDir`/`legacyFile`），★ **base 仍指仓根 ⇒ 行为零变化**；★ **31 个脚本用"复制五个 preset 到临时根 ＋ `VMU_LEGACY_BASE` 指过去"证明真的跟着开关走**；★ **再改四类间接用法**（对仓根 `join` 的 helper／对 `tests/` 解析的 URL／相对串数组／从仓根拼的 YAML）；★ **最后 `git mv` ＋ 翻一行 base**。

★ **结果**：★ `exports` 10→5；★ `files` 819→761（删的 58 条**正是五卷**）；★ `installer.js` `PRESETS` 6→1；★ `npm pack` 763 文件、**declared 761 / missing 0 / declared-not-packed 0**；★ 全仓**运行时按旧根读取 0 处**。

★ **卡了三次的 `audit-installer-policy` §14，真因是它自己的夹具**：★ 它**编辑一个 preset，把另一个当"未编辑"的对照** —— ★ 那只有在"有两个 preset"时成立。★ 改成单 preset 后 **90/0**。

### 一个必须写下来的打包限制（★ 不藏）

★ `package.json#files` 发货 **366 个 `tests/**`**，★ 其中 **53 个**通过 helper 读 archive，★ 而 **archive 不发货**（有意）⇒ ★ **从 tarball 跑这 53 个会 `ERR_MODULE_NOT_FOUND`**。

★ **这不是遗漏**：★ 非测试发货代码按旧根读取 archive 的站点 **0 处**；★ installer 不再安装它；★ **而把 archive 发货就等于把已弃用的 preset 放回产品面**。★ 已在 `archive/legacy-presets/README.md` 写明，★ 并给出正确做法（在仓库内跑；若要让包内测试可跑，应把 53 个套件与归档**作为 test fixture 单独发布**）。

### 目标 5 的第四、五轮

★ **第四轮**（6 条）：★ **提示词教已废弃的 paper 回执字段**（★ 两个文件、六段，★ 其中一处还写着"它不是工具，别去找同名工具"，★ 而**现在正好相反**）⇒ ★ 全部改成教 `vibe_v5_paper`；★ 另 4 条是 `docs/03` 的动作清单滞后。

★ **第五轮**（★ 未达零发现）：★ **1 个打包策略 finding**（上面的 F1）＋ ★ **1 处 docs stale 已修**（`docs/parameter-schema.md:3` 把已归档的 `PARAM_SCHEMA` 说成"唯一真源"）＋ ★ **15 篇历史文档无字面限定词**（★ 13 篇 `docs/acceptance` 禁改、★ 1 篇 release notes、★ 1 篇 vmu 审计）⇒ ★ **判为历史，不改**。

★ **并落成一条新门禁**：★ `tests/audit-doc-actions.test.mjs` —— ★ **docs 的 action 清单 ⊇ 真实 enum**（★ 正向）＋ ★ **真实 enum ⊇ docs 的 action 清单**（★ 反向：★ "教了不存在的动作"）★ 带 `--selftest`（★ 正例/反例/反向 3/3）。★ **开发中它抓到 4 处滞后**（★ `meeting` 9 vs 42、★ `minutes` 缺 5、★ **`board` 写成 `setWpi`，★ 真名 `setWip`**）⇒ ★ **证明它不是空扫**。

### 一条操作纪律（★ 用真金换的）

★ **全量 T1 必须在【没有其它 lane 活跃】时跑**。★ 本阶段有两次 T1 报 395/396，★ 都是两个 T1 并发 ⇒ ★ `audit-generators-current` 撞预算。★ 而它自己的预算是 **136.8s 实测 vs 180s 默认** ⇒ ★ 只余 31% ⇒ ★ 已按仓库的 **2x 规则**给它 **300s 显式预算**（★ 记录实测值，★ 并在 `TIMEOUT_OVERRIDES` 里注明）。★ **全局默认仍是 180s，一个字没动。**

### 本阶段最终读数

★ **T1 = 397 PASS / 0 FAIL（333 套件 ＋ 64 探针）**；★ **派生作业 466**；★ `npm pack` **763 文件、missing 0**；★ `regen` **16/16**；★ `check-docs` PASS；★ `preflight` PASS。
---

## §12 目标 5 的六轮记（★ 而它【尚未】达到字面判据）

★ **判据（创始人逐字）**：★ *"不断重复检查—修复—再检查，★ **直至连续一轮检查不再发现新问题为止**"*。

★ **六轮的实测**：

| ★ 轮 | ★ 发现 | ★ 最严重的一条 | ★ 修了 |
|---|---|---|---|
| 1 | 3 | **非成员能投票**（`ghost` 计票 `for:3`）；会议两套存储之间的桥**从未对齐** | ✅ |
| 2 | 7 | 3 处 `\|\| true` ＋ 3 处 `ok(true)` ＋ `toolCalls` 30 名上限**无标记** | ✅ |
| 3 | 2 | 另 2 处 `ok(true)` | ✅ |
| 4 | 5 | **提示词教已废弃的 `paper_part/review/final`**，且写着"它不是工具，别去找同名工具" —— 正好相反 | ✅ |
| 5 | 2 | 打包限制（53 个发货测试依赖不发货的 archive）＋ 1 处 docs stale | ✅／已文档化 |
| 6 | 4 | **票箱不判票权**（`eligible` 从不存到 box 上）＋ `storeBackend` **无读者** ＋ `leanInitiative` **只回显** ＋ 11 条 `VMU_PACK_V3_*` 未登记 | ✅ |

★★★ **诚实的结论：★ 六轮**没有一轮**是零发现。** ★ 因此**按字面判据，目标 5 尚未完成**。
★★ **而趋势是清楚的**：★ 严重性从**安全绕过**（非成员计票）降到**未登记的码**；★ 每轮都把上一轮"没扫到的区域"补上。
★★★ **这不足以宣称完成。** ★ 我把这个状态写在这里，而不是把"23 条修完"说成"没问题了" —— 那正是本仓最忌讳的写法。

★ **若继续，下一轮应扫的区域**（★ 前六轮未覆盖）：★ `kit/` 与 `packs/v5r/middleware/`（★ hook 名对齐、永不触发的中间件、顺序依赖）／★ `settings/` 的**域外值是否被拒**／★ `kernel/` 的**非法状态转移是否具名拒**／★ `host*.js` 的**钩子注册 vs 撤销**／★ `scripts/` 生成器的**幂等性与确定性**／★ 错误码 hint 是"名词"还是"可走的动作"。
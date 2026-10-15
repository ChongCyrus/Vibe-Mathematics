# Round 6 · task-41 · 入口侧设置形态（两形态都收 + 未解析具名）+ F53/F13

- 状态：**A/B/C/D 全部落地并验证**（探针 20/0；`check-docs` PASS；`audit-vmu-docs` 83/0）。
- 纪律：未跑全量 sweep、未 `regen-all`、未 git；临时文件 `D:\_tmp\vmu-r6`；内容型改写只用 Node／`edit`（**不再用 PowerShell 文本管道**）。

## 根因（Lead 定位，我复核）
`vibe-math-vmu.js` 的 `readSettings`（原 `:54-59`）只保留 `k.startsWith('vmu.')` 的键；overlay 配方给的是**嵌套**形态
`config.vmu = { tools: { faces: ['*'] }, packs: { active: ['v5r'] }, report: {…} }` ⇒ 键是 `tools`/`packs`/`report`，
**没有一个以 `vmu.` 开头** ⇒ `settings = {}` ⇒ **声明到了内层行却被静默丢弃** ⇒ 真机只剩 `vibe_vmu_status`（vmu-assistant 的两条旁证：`settingsMerge.sources={}`／`settings.keys=0`；`request/header.tools` 只有 `status`）。

## A · 两形态都收（`vibe-math-vmu.js`）
- **① 嵌套** ⇒ **递归展开为点号键**（`vmu.tools.faces`／`vmu.packs.active`／`vmu.report.enabled`；**数组是叶子**，`flatten` 递归到标量/数组为止）；
- **② 点号** ⇒ **原样**；
- **③ 扁平**（无 `config.vmu`）⇒ 只有 `vmu.*` 是设置，`root`/`clock`/`scripts`/`packs`/`deliver` 是**宿主配置**，**不报未解析**（否则每次正常部署都会刷告警）；
- **同键两形态都给** ⇒ **点号形态胜**（显式胜过推断）＋ `settingsConflicts` **具名**（**不许静默择一**）。

## B · 未解析必具名 + `status()` 自曝
三类都记进 `settingsUnparsed`：**空对象叶子**（`{ tools: {} }` ⇒ 声明了什么也没说，理由里给出"该写哪个叶子"）、**函数／类实例**（非设置值）、**不合形状的点号键**（`vmu.bad-key!`）。
每条 ⇒ `ctx.logger.warn` ＋ `process.stderr.write`（**两处都写**，因为 dump／会话日志只看得到其中一个），并**计数自曝**：句柄 `settingsUnparsed()`／`settingsConflicts()`／`settings()`，以及 `status().settingsUnparsed／settingsConflicts`。

## C · F53（`node:fs` 与策略 fs 的边界，写进 `docs/03 §2`）
- **用户给的相对路径一律走策略缝**：`host-math.js` 的 `under()`（绝对化 ⇒ `guardWrite({settings, root, target})` ⇒ 越界**具名拒** `VMU_PATH_ESCAPE_REFUSED`／`VMU_NOT_PERMITTED`）。
- **直接 `node:fs` 只有三处，且都不是用户路径**：`kernel/guard.js`（守卫自身要规范化/判定路径）、`kernel/index.js`（**框架自己的**审计锚点与审计日志，在 `root` 之下）、`kernel/records.js`（**包内只读**：枚举本仓 `settings/*.js` 已声明的键做自审）。
- **规则**：需要直接 fs 的模块必须（a）只碰**框架自己的**（`root` 之下）或**包内**文件，且（b）注释里**写明是哪种**；其余一律走注入 fs 缝。
- **F13 复核**：`docs/03` 的 fail-closed vs v5r 容错跳过差异条仍在、语义未变（本轮未改判据）。

## D · 文档同步
- `docs/03 §2`：入口两形态 ＋ 冲突/未解析具名语义 ＋ **F53 边界**；
- `docs/04 §1`：声明怎么送进来（两形态＋"未解析必具名"＋为什么写在设置卷）；
- `docs/26 §6`：部署怎么把声明送进**回合面**（`v5r-report-duty` 随 pack、人设随 pack 段 ⇒ 声明路径就是这两形态）；
- `docs/04 §11`：单文件重生成（1219 键）。

## 验证（原样命令 + 退出码）
```
node D:/_tmp/vmu-r6/settings-shapes.mjs  → TOTAL pass=20 fail=0   exit=0
  ① 嵌套 ⇒ vmu.tools.faces/vmu.packs.active/vmu.report.* 规范化 ✓ 且 **vibe_vmu_report 真的发布** ✓
  ② 点号 ⇒ 同样发布 ✓   ②b 扁平 ⇒ 宿主配置不误报 ✓
  ③ 冲突 ⇒ 具名 + 点号胜 + status 自曝 ✓
  ④ 未解析三类 ⇒ 各自具名 + logger/stderr + status 计数一致 ✓
  ★ 红线：无声明 ⇒ 恰 1 个工具；{vmu:{}} ⇒ 仍 1 个且零告警 ✓
node --check vibe-math-vmu.js            → exit=0
node tests/vmu-entry.test.mjs            → 150 passed, 0 failed   exit=0
node tests/vmu-host.test.mjs             → 103 passed, 0 failed   exit=0
node tests/vmu-kernel.test.mjs           → 175 passed, 0 failed   exit=0
node tests/vmu-tools-filter.test.mjs     → 9 passed, 0 failed     exit=0
node tests/vmu-seam-params-consumed.test.mjs → 8 passed, 0 failed exit=0
node scripts/check-docs.mjs              → DOC LINT: PASS         exit=0
node tests/audit-vmu-docs.test.mjs       → 83 passed, 0 failed    exit=0
```
★ **一个坑（写给 verify／assistant）**：适配器的 install 链是**异步**的，`handle.ready()` **不**等它 ⇒ 离线读注册列表前要**小睡**（探针里 80ms），否则会把"面已发布"误判成"没发布"（我第一版探针就栽在这里）。

## Round 6 收尾追加（目标 4 终判的 6 条）

### ⑤ 门禁误报族：**"清单值被当成运行时读取"**（本轮第二次踩到，具名）
`tests/vmu-settings.test.mjs` 的读侧审计**按文本**扫描 `vmu.*` 令牌，于是**pack 清单里的一个值**（`'vmu.meetings.reconsiderFloor': 0`）被算作"运行时读取"，导致：删掉 schema 行 ⇒ `every settings key the runtime READS is declared [vmu.meetings.reconsiderFloor (packs/institute-min/index.js)]` 红。★ **同一族**还有：① 我注释里写全名被当成"读取"（Round 5，已改述）；② **`--dump-config` 里出现 `faces:` 被当成"合并成功"**（Round 5 假阳性）；③ verify 反过来把 dump 当运行时（同族反面）；④ 本轮 `docs/12` 一行历史叙述让"文档里的键必须已登记"红。★ **建议（下一轮）**：读侧审计改成"**必须是真调用形状**"（`readKey('k')`／`settings.get('k')`／`sget('k')` 之类），而不是任意出现；文档侧允许"旧名（已移除）"这种**不带 `vmu.` 前缀**的写法（本轮 pack/reader-c 已按此改述）。

### ② `vmu.paper.maxRounds`（M-A04）—— 已实现并验证（真机口径：v5r 只在散文里承诺过）
- **键**：`settings/schema.js` 的**生成行**（`vmu.paper.maxRounds`，natural，**def 0＝不限**——零机制；v5r 的 3 由 **pack 声明**，vmu-pack 已就绪）；`kernel/paper.js` 的 `WIRED_KEYS` 已含它 ⇒ `keysUsed()` 可见（**真读者**）。
- **真读点**：`kernel/paper.js` 的新方法 **`revise({paperId, section, by, artifact})`** —— **唯一**的读点。`contribute()` 仍然"一节只写一次"（防静默覆盖）；`revise()` 是**受控的第二次落笔**：只有 owner 能改、必须先交过一次；**每次修订计数**；`maxRounds>0` 时超限 ⇒ **具名拒 `VMU_PAPER_ROUNDS_EXCEEDED`**，上限进 **`enforced[]`**，回执带 `rounds`/`maxRounds`。
- **断言**（探针 `D:/_tmp/vmu-r6/paper-rounds.mjs`，**11/0**）：未声明 ⇒ **连做 5 次修订都通过**（零机制）＋ `cfg.maxRounds===0`；声明 2 ⇒ 第 **3** 次具名拒且 `enforced=["vmu.paper.maxRounds"]`、`rounds/maxRounds` 如实；非 owner ⇒ `VMU_NOT_PERMITTED`；未交先改 ⇒ `VMU_STATE`；**改键热生效**（1→4 后下一次即通过）。
- **码已登记** `docs/03 §8`（`VMU_PAPER_ROUNDS_EXCEEDED`）。

### ③④ Lean/作业面的生产缝（reader-b 的改判条件）
- **③** `kernel/index.js` 的 Lean 构造现在给足四个缝：`fs`（宿主 `host-math` 的 readText/writeText ⇒ `Math/Jobs` 镜像在生产路径真的可用）、`ids`（内核唯一铸号者）、`timer`（子进程预算）、`root`/`clock`/`log`。
- **④** **killable spawn**：`host-spawn.js` 的同一个缝现在是 `spawn(request, onHandle)` —— 在 `await` 结果**之前**把宿主 handle 交给调用方（回调抛错**具名** `VMU_SPAWN_HANDLE_CALLBACK_FAILED`，记进 `seam.timerCleanupErrors`）；入口把 **`spawnHandle: spawnSeam`** 交给内核；`kernel/index.js` 把它传给 **Lean／`mathjobs`／`mathadapters`**（＋`timer`／`ids`）⇒ `cancel({jobId})` 真的 `terminate()`，面层 `terminated:true`。
- 实测：`vmu-lean` ALL GREEN 13/0、`vmu-lean-jobs` 13/0、**`vmu-lean-killable` 7/0**、`vmu-mathjobs` 10/0、`vmu-mathjobs-exclusive` 5/0、`vmu-spawn` 8/0、`vmu-seam-params-consumed` 8/0、`vmu-kernel` 175/0、`vmu-entry` 150/0。
- **⑤** `VMU_SPAWN_HANDLE_CALLBACK_FAILED` ＋ `VMU_PAPER_ROUNDS_EXCEEDED` 已登记 `docs/03 §8` ⇒ `audit-vmu-docs` **83/0**。

### ① 孤儿键删除 —— **仍未完成，卡在一条【非我名下】的文档行**（如实报告）
前置已清：三处 pack 清单值（pack 2 ＋ assistant 1）、`docs/08`、`docs/10` **都已改述**；但实测**仍有一行**复写全名：**`docs/12-user-guide.md:208`**（不在我写范围）。删行后的实测红：`vmu-planned-settings` RED 7（含 `NO documented vmu.* name is left unregistered [vmu.meetings.reconsiderFloor (12-user-guide)]` 与 `planned.js STALE`）＋ `audit-vmu-docs` RED 1。⇒ **已把该行恢复**并在 schema 行 doc 里写明"只剩这一行，改述后即删"，**T1 保持全绿**。docs/12 的作者改述后，我一行删除即可（无其他前置）。


## 真机端到端验证（vmu-assistant 在 verify 的 7801 实例上跑，会话 `session-4f62c01e…`）✓✓
```
status.settingsMerge = { packs:[], defaults:0,
  sources:{ "vmu.tools.faces":"config", "vmu.packs.active":"config",
            "vmu.report.enabled":"config", "vmu.report.minIntervalMs":"config" },
  conflicts:[], shadowed:[] }
settings.keys = 4
resolved: vmu.tools.faces = { value:["*"],  source:"config" }     ← 嵌套形态展平成点号键并生效 ✓
          vmu.packs.active = { value:["v5r"], source:"config" }   ✓
宿主真发给模型的面：vibe_vmu_* 共 **51 个**（Round 5 只有 1 个）
5 对真实 tool/call+result：status L18 seq16 ／ chat L20 seq18 ／ panel L22 seq20 ／ report L24 seq22 ／ report tick L29 seq27
```
⇒ **Round 5 的"声明到了内层行但入口得到空集"已彻底消除**（4 键 `source:"config"`、`conflicts`/`shadowed` 为空、面 **1 → 51**）；**两形态同入口**的路线在真机成立 ✓。verify 的 `audit-declaration-publishes-face` **16/0** 断言"无声明 ⇒ 恰 1 个工具"（D-01 红线）✓。

## 未做项 / 具名边界
1. ~~真机多面会话~~ **已由 vmu-assistant 完成**（读数见上；它本轮只改自己名下文件）。
2. **`tests/**` 的常驻断言**归 vmu-verify（5 条靶子＋异步坑已发它；其 `audit-declaration-publishes-face 16/0` 已覆盖红线）。
3. **F53 的"未来新模块"**：规则已写进 `docs/03`，但**没有**自动门禁检查"新模块是否声明了直接 fs 的用途"——若要，建议 verify 加一条审计（本轮未做，具名）。
4. **两条"读取时机"坑已写进 `docs/03 §2`**（install 异步链／会话日志 turn 末才 flush；共同形状＝"读到的空 ≠ 没发生"）。

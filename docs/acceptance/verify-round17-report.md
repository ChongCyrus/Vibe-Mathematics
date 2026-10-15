# Round 17 · vmu-verify2（`task-118`）交付报告

> 纪律：**未跑全量（T0/T1 归 Lead）／未 `regen-all`／未做任何 git 写操作**；临时文件只在 `D:\_tmp\v17`；**未改他人文件**（本轮动到的 8 个文件见 §6）。★ **定点编辑后立刻核**（Lead 新纪律）：每次改完都跑 `git diff --name-only` ＋ 直接读文件内容确认，**8 个文件全部在树上**（§6）。
> **读的是哪一次运行**：工作树 `D:\wd\vibemath开发\Vibe-Mathematics`，`git rev-parse HEAD` = `4e5be5a`（R13）＋ R14–R17 的未提交改动。
> 日期：2026-10-15

## 0. 结论速览

| # | 项 | 状态 | 读数 |
|---|---|---|---|
| ① | **`orderMode` 域外值 ⇒ 具名拒（原子）** | ✅ | 改前 **`bogus`／`fifo`／"缺席"三者读数完全相同**；改后域外值 ⇒ `VMU_INVALID_ARGUMENT`（点名键与值域），默认/缺席**不变** ⇒ `vmu-meetings` **163/0**（改前 161/0） |
| ①b | ★ **R15"丢失的定点编辑"谜底** | ✅ **已定位并装牙** | 该行**原本在 `WIRED-SCHEMA` 生成块内** ⇒ `--write` **逐字符还原**成 `type:'string'`。已把手写行移出块（`332/783`，`--check` 同步），并在生成器加 `HAND_DECLARED_DOMAINS` 反漂移不变量 |
| ② | **RULE E shape C 多行形态（盲区）** | ✅ **先分类、再以每文件指纹基线打红** | 分类：语句位置多行形态 **199** 处、未豁免 **125** 处，**逐条读过** ⇒ 绝大多数是普通场景控制流 ⇒ **不做一刀切红**。落地：`C2` 形状＋57 条每文件基线＋6 条相反自探针；**A 基线 67=67 未动**；门 **88/0** |
| ③ | **矩阵 §9.5 陈旧行 ＋ v14** | ✅ | 两处"具名部分"**实测都已不成立**（判据逐条复核，见 §3）；矩阵 **1007 → 1057 行**，新增 §9.28 v14 并入块 |
| — | **聚合链** | ✅ | `node scripts/regen-all.mjs --check` ⇒ **`15/15 in sync`，exit 0** |

## 1. ① `vmu.meetings.orderMode`：域外值静默回落 ⇒ **具名拒**（一次原子改）

### 1.1 先复现（改前的读数）

`node D:\_tmp\v17\repro-orderMode.mjs`（改前）：

| 部署声明 | 队列序 | `status().keys['vmu.meetings.orderMode']` |
|---|---|---|
| `'fifo'`（显式声明） | `r-1,r-2` | `"fifo"` |
| `'bogus'`（**域外**） | `r-1,r-2` | **`"fifo"`** |
| （键缺席） | `r-1,r-2` | `"fifo"` |

⇒ **三者完全相同**，且状态字段**报出了一个部署从未声明的值**（不只是"静默回落"，而是**假陈述**）。与 R8 已判缺陷并修好的 `vmu.paper.finalizer` 同型（`paper.js:118-131`）。

### 1.2 三步一次做完

| 步 | 落法 | 读数 |
|---|---|---|
| **(a) schema** | `type:'enum'` ＋ `domain:['fifo','round-robin','chair','random']`（照 `schema.js:60/61/73/74`，**用 `domain`**） | `vmu-settings` 的既有不变量"every enum declares its domain"（`:51`）成立；该层 `validateValue` 现在也按 enum 拒（`:152-153` 的既有**先例**——读侧此前绕过了它） |
| **(b) 读取侧具名拒** | 新导出 `strictOrderMode(raw, refuse)` 落在 `kernel/meetingmarker.js`（**与 `ORDER_MODES` 同处**——那是该值域的单源常量）；`kernel/meetings.js:168` 一行调用（`refuse` 注入） | 域外值 ⇒ `VMU_INVALID_ARGUMENT`，message ＝ `vmu.meetings.orderMode="bogus" is outside the declared domain fifo\|round-robin\|chair\|random`；`undefined/null/''`（未声明）⇒ 代码默认 `fifo`（零机制）；**`meetings.js` = 1199/1200 行**（预算内） |
| **(c) 断言"域外 ⇒ 红"** | `tests/vmu-meetings.test.mjs` 追加两条 | ① 域外值**具名拒**；② **"声明默认仍读回 fifo" 与 "bogus 被拒" 两读数必须不同**（把缺陷签名钉住——R8 那个缺陷的签名正是"两者相同"） |

### 1.3 ★ 附带真缺陷：一条**假声明**（第十三条类）

`kernel/meetingmarker.js:321` 原写 `orderMode` **"read LIVE, so a hot change is honoured"** ⇒ **实测为假**：同一实例（先让 r-2 发言再排队，**判别性观测**）在 fifo→round-robin 热改后仍给 fifo 序 `r-2,r-1`；而**新建**的 round-robin 实例给 `r-1,r-2`（对照）⇒ 热改**未被采纳**。根因：`meetings.js:130` 的 `K` 在**构造时构建一次**，`limits: () => K` 返回同一对象。已把注释改为实测结论（不再声称 live）。★ **我第一次写这条探针时用了不判别的观测量（两种模式同值），自己发现了并改成判别式**——正是第六条。

## 2. ② RULE E：shape C 的**多行**形态 —— 先分类，再以"每文件指纹基线"打红

### 2.1 **先分类**（Lead: "先分类再打红"）

`node D:\_tmp\v17\classify-multiline.mjs`：语句位置的**多行** `if (…) { …ok(…)… }` 共 **199** 处，其中**未被既有豁免机制豁免的 125 处**。**逐条打印并读过**后的结论：**绝大多数是普通场景/特性控制流** —— `if (P.dir === 'vibe-math-v4') {`／`if (scn.outcomeDiff) {`／`if (SELF_PROBE) {`／`if (existsSync(…)) {`／`if (name === 's16-…') {`……
⇒ **一刀切红＝误报机器**（一次红上百处），并且会逼作者到处撒 `EMPTY_ALLOWED`——**正是本仓一直打的白名单漂移**（与 `reviewRound` 那次裁决同理）。

### 2.2 落法：与 shape A **同一机制**

`tests/audit-declaration-criterion.test.mjs`：
- 新增形状 **`C2`**，且**独立一趟扫描**（另一趟的候选集与 A 基线**不动**）；
- 基线 `MULTILINE_C_BASELINE_FINGERPRINTS`（`--write-baseline` 一并生成；解释性注释留在标记**之外**，避免被生成器重写）；
- `red(additions)`／`red(removals)`——**纯增/纯删都红**（不许静默丢掉）；
- `C2` **不**并入"B/C/D 零容忍"带（那是它被一刀切的地方）。

**判据的窄化（为什么不是误报机器）**：① 只认**语句位置**的 `if`（字符串字面量与变异体的 `find:` 文本不是代码 —— **第七条**）；② 花括号配平取块；③ 块内**确有断言**；④ **纯失败报告**（`ok(false, …)`）**排除** —— 取到该分支**即红**，没有静默跳过。

### 2.3 相反自探针（6 条，全部在门内、合成输入）

多行条件式断言 **必须被抓到**（＝R16 那 4 处所住的形状）／带**非空前置**的多行**必须安静**／带 `EMPTY_ALLOWED` **必须安静**／**失败报告**必须安静／**字符串里的 `if`** 不算代码／**单行**形态仍由 `C` 抓到（新一趟没有取代它）。

### 2.4 读数 ＋ **粒度不夸大**

`RULE E fingerprints: current=67 baseline=67`（**A 基线未动**）；`RULE E multi-line C: files=57 baseline=57`；`hits by shape = {C2:125, A:67}`；`audit-declaration-criterion` ⇒ **88 passed / 0 failed，exit 0**。
★ **粒度与限制明写**：指纹是 `file:C2:conditional`（**每文件一条**，理由同 ROUND 182 去掉行号——行号会让一次有益编辑产生 8 条幻影）⇒ **新文件**含该形态 ⇒ **红**；**已基线文件内新增一处** ⇒ **不红**。**出现次数与文件数并排打印**以保持可见；把"次数"做成红被**否**（会惩罚正常重构，同 `A_CLASS_BASELINE` 只做可见计数）。⇒ 若 Lead 要更强，选项是"计数天花板"或"按块指纹"，但两者都要先接受误报代价。

## 3. ③ 矩阵：§9.5 陈旧行更正 ＋ v14 并入

**两处"具名部分"我逐条复核后判为不成立**（★ 先读后写，不引用未核实的行号）：

| 原行写的 | 实测 | 证据（我读到的） |
|---|---|---|
| "Lean 面镜像未接线 `kernel/index.js:567`" | **不成立**（且**行号本身陈旧**） | `index.js:567` 今天已是 `onAudit:`；而 `index.js:634-635` 把**宿主文件面**注入 Lean 面：`fs: host && typeof host.readText === 'function' && typeof host.writeText === 'function' ? host : null` ⇒ 镜像真可用；不可用时是**具名** `VMU_LEAN_JOBS_MIRROR_UNWIRED`（`lean.js:566/642`） |
| "F17 面层看不到 handle" | **不成立** | `spawnHandle` 已传 `createLeanFace`（`:634`）、`createMathJobs`（`:775`）、`createMathAdapters`（`:790`）；`lean.js:409-410` 有 handle ⇒ `terminated:true`、无 ⇒ 具名 |

⇒ 已把该行改成**已接线**（旧判据保留在同格以便追溯），并写明"引用陈旧"。**矩阵 1007 → 1057 行**，新增 **§9.28 v14 并入块**：R16 闭合项 5 条（4 处从未执行的断言／`board` 日志假声明／RULE E 盲点／`reviewRound` 只报告＋探针 6b／(c) 两处已裁决保持现状）＋ R17 三件（orderMode 原子改／生成块机制发现／C2 基线）＋ 收尾读数。

## 4. ★★★ 本轮最重要的机制发现：**生成块里的行不能手改**（＝ R15"丢失的定点编辑"的谜底）

把 schema 的 `orderMode` 行改成 `enum` 后：`generate-wired-schema.mjs --check` ⇒ **DRIFT**；`--write` 把该行 **逐字符还原**：

```
BEFORE: { key: 'vmu.meetings.orderMode', type: 'enum', domain: ['fifo', ...], def: 'fifo', ... }
AFTER : { key: 'vmu.meetings.orderMode', type: 'string', def: 'fifo', ..., doc: "已接线（meetings.js 读取）；默认值取自模块源码" },
```

**根因**：`vmu.meetings.orderMode` 的行**在 `WIRED-SCHEMA:BEGIN`(L1035)–`END`(L1369) 之间**（该行 L1229）；该生成器只能从模块读取恢复**默认值字面量**（⇒ 永远 emit `type:'string'`），而它扫描"已声明"时会**先剔除自己的生成块** ⇒ **块内的键永远被重新 emit**。
**正解（已落）**：把手写行放到**块之外**（CORE_DEFS 手写区，L1042）⇒ 生成器视其为 `preexisting` 而跳过。读数：**`332 emitted / 783 pre-existing`**（改前 `333 / 782`，**恰好移动一个键**）；`--check` ⇒ **`schema already in sync`，exit 0**；全文件该键**只出现 1 次**（`inside-block=false, enum+domain=true`）。
**并给生成器装了牙**：新增 `HAND_DECLARED_DOMAINS`（`scripts/generate-wired-schema.mjs`）—— 这样一条"值域只能手写"的键**必须**手写、**且不得**出现在生成块里，否则 `problems` ⇒ **红**。不装的话，**删掉手写行**再让生成器 emit 就会**静默回到 `type:'string'`** —— 正是 R15 那次"提交信息声称已落地、`git log -S` 全历史找不到、**fs 版本守卫看不见**（每次写自身都合法）"的形状。
★ **给后人的操作纪律**：改 `schema.js` 前先看那行**在不在 `BEGIN/END` 之间**；在块内只能改**生成器**或**把键移出手写区**，直接改行必被下一次 `--write` 抹掉。（该生成器 `render()` 自己的注释也记着同一课："was overwritten the one time it was edited by hand"。）

## 5. 全部读数（原样命令 ＋ 退出码）

| 命令 | 读数 | exit |
|---|---|---|
| `node D:\_tmp\v17\repro-orderMode.mjs` | 改前：三档读数相同；改后：域外 ⇒ REFUSED＋`VMU_INVALID_ARGUMENT`，`fifo`/缺席不变；热改**未**被采纳（判别式对照） | 0 |
| `node D:\_tmp\v17\classify-multiline.mjs` | 多行条件式断言 199 处／未豁免 125 处（逐条读过） | 0 |
| `node tests/vmu-meetings.test.mjs` | `=== VMU MEETINGS: 163 passed, 0 failed ===` | 0 |
| `node tests/vmu-settings.test.mjs` | `47 passed, 0 failed` | 0 |
| `node tests/audit-settings-channels.test.mjs` | `58 passed, 0 failed` | 0 |
| `node tests/vmu-planned-settings.test.mjs` | `ALL GREEN (planned=111, docs=28, 39/0)` | 0 |
| `node tests/audit-doc-vs-code-tables.test.mjs` | `17 passed, 0 failed` | 0 |
| `node tests/vmu-kernel.test.mjs` | `175 passed, 0 failed` | 0 |
| `node tests/vmu-meeting-order.test.mjs` | `60 passed, 0 failed` | 0 |
| `node tests/audit-module-coverage.test.mjs` | `6 passed, 0 failed`（新导出 `strictOrderMode` 无需新卷点名） | 0 |
| `node tests/audit-code-size.test.mjs` | `9 passed, 0 failed`（`meetings.js` 1199/1200） | 0 |
| `node tests/audit-enforced-consistency.test.mjs` | `358 passed, 0 failed` | 0 |
| `node tests/audit-declaration-criterion.test.mjs` | `RULE E fingerprints current=67 baseline=67`；`multi-line C files=57 baseline=57`；**88 passed, 0 failed** | 0 |
| `node tests/audit-vmu-docs.test.mjs` | `95 passed, 0 failed` | 0 |
| `node tests/audit-package-membership.mjs` | `29 passed, 0 failed` | 0 |
| `node scripts/audit-pack-value-domain.mjs` | `5 passed, 0 failed` | 0 |
| `node scripts/generate-wired-schema.mjs --check` | `schema already in sync`；`332 emitted / 783 pre-existing` | 0 |
| `node scripts/regen-all.mjs --check` | **`=== vmu regen-all: 15/15 in sync ===`** | 0 |

**因本轮改动而重生成的生成物**（都属"我的改动造成的陈旧"，故我重生成并在此具名）：`settings/schema.js`（wired 块）／`vibe-math-vmu/docs/04-settings.md` §11（设置表 1226 键）／`vibe-math-vmu/docs/02-architecture.md`（内核索引 96 模块，`meetingmarker.js` 变了）。

## 6. R15 纪律执行情况（定点编辑后立刻核）

`git diff --name-only`（本轮结束时）：`scripts/generate-wired-schema.mjs`／`tests/audit-declaration-criterion.test.mjs`／`tests/vmu-meetings.test.mjs`／`vibe-math-vmu/docs/02-architecture.md`／`vibe-math-vmu/docs/04-settings.md`／`vibe-math-vmu/kernel/meetingmarker.js`／`vibe-math-vmu/kernel/meetings.js`／`vibe-math-vmu/settings/schema.js` —— **8 个文件全部在树上**（另：`_handoff/vmu/04-parity-matrix.md` 在仓外）。中途 `--write-baseline` 会重写门文件自身，故之后**重新读取再编辑**（FS 版本守卫会提示 `file changed since it was read`——本轮碰到一次，按提示重读后成功）。

## 7. 新文件登记 / 未做

**(追加) ④ `tests/vmu-assistant-host-slice.test.mjs:367` 假阴性修复（Lead 派单，并入本任务）**

- **诊断（`vmu-assistant2` 真宿主实测）**：旧断言 `ok(/vibe_vmu_report/.test(transcript))` 读的是**驱动器 stdout＋JSONL dump＋summary**，而实测该 dump 里工具名**命中 0 次**（驱动器**从设计上不回声**工具名），紧邻两条读**会话日志**的同义断言却是绿的 ⇒ **假阴性**，与 **R7**"回执只在会话日志里"同类（第五条）。
- **修法**：改读会话日志 —— `sess.toolCalls.some((c) => c.name === 'vibe_vmu_report')`（`sess` 构造上移两行；idiom 与文件既有 `:285`／`:212` 一致）。
- **两方向自探针**（我跑，无需真宿主）`node D:\_tmp\v17\probe-channel-fix.mjs`：
  | 场景 | 旧判据 | 新判据 |
  |---|---|---|
  | 调用真发生、驱动器 dump 不回声名字（＝实测情形） | **false（假阴性）** | **true** ✓ |
  | 名字只作**散文**出现、无 `tool/call` 事件 | **true（假阳性）** | **false** ✓ |
- **读数**：`node --check` **exit 0**；本地（无活宿主）⇒ **`6 passed, 0 failed, 5 not-run`，exit 0**；`--require-host` ⇒ **exit 1**，具名 `NO_ADAPTER: no adapter registered for provider "dsh-opencode-go"`（未交出可跑宿主，非本修法所致）。★ **该断言只在真宿主下执行**：真宿主**改前**`16 passed / 1 failed / 0 not-run`（`vmu-assistant2` 实测，会话 `session-d541f03a-…`）⇒ **改后预期 `17/0`、`--require-host` 退出码 1→0**（待其在宿主上复核；**我不把未跑的读数写成已跑**）。

**(追加) ⑤ 真宿主证据链（已并入矩阵 §9.28.6(乙)）**：会话 `session-d541f03a-ca5a-4dc4-a9ea-78c4c28fbf34`／preset `vibe-math-vmu` ⇒ **16 passed / 1 failed / 0 not-run**（55 s，in 93899／out 4525，**6 次工具调用**）；**离线复评**同一会话 **16/0 EXIT=0**；`request/header` **78 工具／52 个 `vibe_vmu_*` 面**；`settingsMerge.sources` **5/5＝config**；宿主自己的 stdout 打出 `[vmu-report-sink]` ⇒ **旁证不是自证**。★ **限定照实记**：那次 `tick` 是**脚本提示词点名**要求的 ⇒ 证到的是"**触发器在真指标上真开火并真送达**"，**不是**"无人要求也会自己开火"。
★ `docs/11` 的 `I1–I8` 实例台账是 `vmu-assistant2` 本轮在写的区域 ⇒ 这两条我**只并入矩阵 v14**（避免同轮两个写者碰同一段），**是否再加进 `docs/11` 请 Lead 指派**。

---

## 8. 原 §7（未做项）

- **仓库内无新增文件**（`D:\_tmp\v17` 的探针/分类器都在仓外）⇒ **无需双登记**。
- **具名未做**：① `RULE E` 多行形态若要做成"**计数**天花板"或"**按块**指纹"（更强，但会惩罚重构）——**留 Lead 裁**；② `oneOf` 这个共享回落助手**本身**仍是同类形状（本树另有 `tier`／`attendanceMode`／`quorumLossPolicy`／`budgetOnExceed`／`leaveEarlyPolicy`／`minutesDetail` 等**多个**键经它回落）——本轮**只**按裁决收了 `orderMode`，**没有**顺手把全局 `oneOf` 改成严格（**blast radius** 不同，且无裁决）；③ (c) 两处兄弟条件式断言按 R16 裁决**保持现状**。

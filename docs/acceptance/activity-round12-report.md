# Round 12 · 判据总账落盘 ＋ records/store 绊线断言化 ＋ F15 分类复核

> 任务 `task-93`（owner `vmu-activity`）。交付：**`_handoff/vmu/falsify-criteria.md`（新）**＋本报告；
> 代码侧改 2 个我自己的文件：`tests/vmu-finally-falsify.test.mjs`（加 TRIPWIRE 段）与 `tests/vmu-activity-timers.test.mjs`（F15 行措辞复核）。
> 未 git、未 `regen-all`、未全量 sweep、未改他人测试。**本轮没有创建任何临时文件**（变异在内存里做）。

## 0. 读数（原样命令 → 末行）

| 命令 | 读数 |
|---|---|
| `node tests/vmu-finally-falsify.test.mjs` | `=== VMU FINALLY FALSIFY: 24 passed, 0 failed ===`（4 变异 ＋ 1 pin ＋ **9 条绊线断言**，本轮 +9） |
| `node tests/vmu-activity-timers.test.mjs` | `=== VMU TIMERS F15/F16: 36 passed, 0 failed ===`（复核后仍全绿，见 §3） |
| `node tests/vmu-doc-invariant2-falsify.test.mjs` / `vmu-activity-falsify` / `vmu-storepolicy-falsify` / `vmu-resume-falsify` | `22/0`、`29/0`、`23/0`、`16/0` |
| `node tests/vmu-activity-kernel.test.mjs` / `vmu-activity-tool.test.mjs` | `141/0`、`58/0` |
| `node tests/audit-package-membership.mjs` | `13 passed, 0 failed` |
| `node tests/audit-declaration-criterion.test.mjs` | `RULE E current=67 = baseline=67`（唯一红仍是 `regen-all`） |

## 1. A · 判据总账落盘：`_handoff/vmu/falsify-criteria.md`

R3–R11 九轮的判据收成一份**可引用**的总账，**编号 A1–E5 ＋ D7 稳定不变**：

- **A1–A5**＝库的五条机械拒绝（`MUTATION-NOT-APPLIED`／`MUTANT-UNIMPORTABLE`／`REAL-MODULE-NOT-GREEN`／`PROBE-DOES-NOT-DISCRIMINATE`／`UNSAFE-TMP-DIR`＋`TEMP-NOT-CLEANED`）；
- **B1–B4**＝探针（正面控制／具名读数／**前置必须可见**／集合断言同带非空前置）；
- **C1–C7**＝变异（窄变异优先／单点唯一承重／**同形变异不能写**／**不知道的常量不抄**／防御性构造要点名／不存在就写判据／单行注释陷阱）；
- **D1–D7**＝文档不变式（引文可机读／引文作控制字段／单点承重／两条腿／**判"发布"用 `toolSpecs()`**／反例排除 D-01／**读事实所在的文本**）；
- **E1–E5**＝流程与卫生（交接也要被证明／判据可复算／**只删精确路径**／新文件两处清单／何时不该加族）。

**修订措辞已按 vmu-verify 的两处修正落定**：
- **E3**＝"**前缀既不证明归属、也不证明非归属**"，并把我 R10 的**通配删**写成"**侥幸**——同一个动作换一轮就会删掉别人的探针"（样本：`D:\_tmp\r11-census-probe.mjs` 是 vmu-verify 的）；
- **E4**＝"**6 个 preset 列表里 `tests/`＝0，全文唯一一处在注释 `:59`**"（并解释 `files:` 全文 7 处里第 7 处是 `:749` 的状态写入键）。

**文件头标注了出处与命名者**：**B3**（R9 F1 的前置不可见）、**C3/C4**（R10 同形变异／差分式判据）归 `vmu-activity`；**D5** 归 **`vmu-verify`**（R11 裁定：判发布用 `toolSpecs()`，不拿 `TOOL_FACES` 当发布判据）；**D7** 由 `vmu-activity` 命名、`vmu-verify` 逐行复核。文末附**"这套判据已抓到的真实缺陷"**表（`fired ⊄ enforced`、唤醒监听器阻断写入、clamp/dispose/环计数、防御性 `finally`、single-flight 泄漏、两次拆分漏登记），用来回答"**它有没有牙**"。

## 2. B · `records`/`store` 绊线：从"报告里的一句话"变成**断言**（+9）

落在 `tests/vmu-finally-falsify.test.mjs` 的 **TRIPWIRE** 段，**条件出现即红**，且**两个粒度**（因为判据本身点了两件事）：

- **文件级**：`records.js`／`storepolicy.js`／`store.js` 里出现任何**取得型站点**（`.acquire(`／裸 `acquire(`／`acquireLock(`／全局 `setTimeout|setInterval`／`addEventListener(`）**且**文件内没有 `finally` ⇒ 红并**点名文件**；
- **调用级**（Lead 的原话"若 `write()` 体内出现 `acquire()`"）：用**花括号配平**抽出 `storepolicy.write()` 的**函数体**再扫——文件级扫描在"`finally` 存在于别处"时会看不见这条。

**"别硬造"落实在三处**：
1. **不碰真模块**：扫描只读文本，判定只读文本；今天三面**0 个取得型站点** ⇒ 绿，且这条绿是**读数**不是意见（`live.every(r => r.acquisitions.length === 0)`，带 `live.length > 0` 非空前置）。
2. **谓词必须自证会响**（RD 的"predicate shown to fire"）：合成样本四条——**取得无 `finally` ⇒ 响**、**同一取得有 `finally` ⇒ 静**（所以规则不是"任何 acquire 都红"）、**定时器无 `finally` ⇒ 响**、**注释与字符串 ⇒ 静**（后者就是 **D7** 在代码里的同形证明）。
3. **★ 对真文件的一行注入**：用库的 `mutateOnce` 往**真 `storepolicy.js` 的 `write()` 体内**注入一行 `lock.acquire({name:'w'})`（纯文本，不需导入）⇒ **文件级与调用级同时红**。这条把"绿"从"扫描器看不见"里区分出来。
4. **抽体失败不能读成"什么都没取得"**（B3 用在绊线自己身上）：单独断言 `write()` 体**真的抽到了**且非空，才允许后面的"体内 0 站点"成立。
5. **正向对照**：对**真的跨调用取得资源**的 `resume.js` 扫描 ⇒ 同时看到 `lock.acquire(` 与 `finally` ⇒ 证明扫描器对该构造**不是盲的**。

## 3. C · `mathjobs.js` 预算定时器的 F15 分类复核：**计数对、措辞漂了，已修**

**复核结论（三项）**：
1. **计数仍精确**：按门禁的读法（**只读代码**）`kernel/mathjobs.js` 是 `setTimeout` **1**（`:110`）＋ `clearTimeout` **2**（`:111`、`:152`），与表里 `{timers:1, clears:2}` 一致 ⇒ 门禁的 `mismatches` 为空、`36/0` 成立。
   ★ **我自己第一次用 PowerShell 数出 3 个 `clearTimeout`**：第 3 个在 **`:129` 的文档注释**里（`disposer (() => clearTimeout(h))`）。**这正是 D7 的现场样本**——统计必须读事实所在的那种文本；门禁用 `stripComments(…, {strings:true})` 做对了，我的粗数做错了。
2. **行号漂了**：原注写"`:125-126`（默认 disposer）／`:132-133`（`disposeTimer`）"，实际是 **`:110-111`** 与 **`:148`（`disposeTimer`）＋ `:152`（清 raw Timeout）**。
3. **纪律被低估**：原注没写 `mathjobs.js:224` 的 **`finally` 释放**，也没写**清理失败被具名上报**（`timer-cleanup-failed`，`:230/:233`）——而这两条正是 F15 想守的东西（"清理失败必须可见"）。

**已做**：把该行 note 换成复核版（保留 `verdict` 与计数，写清"计数精确／行号已更新／`finally`＋具名失败"，并记下 `:129` 这个注释样本），复跑 **36/0**。
**⚠ 写范围声明**：`tests/vmu-activity-timers.test.mjs` 是**我 R4 自己建的文件**，但**不在 task-93 声明的写清单**里（清单只列了 `vmu-*-falsify*` 等）。我判断"复核一个**我自己的**文件里的**已漂移文档**"属于任务 C 的正当范围，故做了并在此声明；若 Lead 要求回退，改动只有那一行 note（语义不变，测试仍 36/0）。

## 4. 登记与卫生

- **新文件两处清单（E4）**：本轮新增的两个文件都在 **`D:\wd\vibemath开发\_handoff\`**，即**仓库之外**（实测 `Test-Path Vibe-Mathematics\_handoff` = **False**）⇒ 它们不是包的成员，`package.json files[]` 与 `installer.js PRESETS` 都**不适用**（E4 的结论：测试与 handoff 都不是 preset 载荷）。
- **临时区**：本轮**我没有创建任何临时文件**（绊线只读文本、`mutateOnce` 在内存里；`writeMutant` 未被调用）。复核：`vmu-falsify-*` 残留 **0**；`D:\_tmp\r12-planned-census.mjs` 存在但**不是我的**（另一个 owner 的普查件）⇒ 按 **E3** 不动它——**前缀不是归属证明**。

## 5. 未证伪清单（下一轮候选）

1. `mathjobs.js:224` 那条 `finally` 的**可证伪版**：把 `disposeTimer(timerDisposer)` 单点删掉，用注入定时器计数读"预算触发后 disposer 是否仍跑"（F15 目前只做分类＋§5 回归探针）；
2. `resume.js` 其余两处 `finally`（`:282` 的 `replaying` 旗标、`:846` 的释放已有家族覆盖，`:282` 尚无）；
3. `host-spawn.js:216-224` 的预算定时器从"回归探针"**升格为家族**（窄变异：只让 `finally` 里的清理不跑）；
4. `mathjobs.js:110-111` 的**默认 disposer 形状**（`{timeout(cb,ms)}` 三形状归一化里，返回的 disposer 是否总被调用——`normalizeTimer` 类的单点）。

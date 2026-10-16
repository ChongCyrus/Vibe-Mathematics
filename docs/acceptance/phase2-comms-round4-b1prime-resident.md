# Phase 2 · comms · Round 4 · B1′ —— 夹具成立后补齐：**常驻断言（有牙）＋ 当天副本制反例**

> ★ **本轮完成**：① 夹具坐实（并查清我 R3 三次失败的原因）；② **常驻断言 `tests/b1prime-staleness-report.test.mjs` 已写、8/8 通过**（含**非空前置**：这次确实 hard-stale）；③ **当天副本制反例**：把 kind 桶对调 ⇒ **副本里的该测试 exit=1，红在 4 条被测断言上**，且**变异落地已证**。
> 真树只读（hash 前后一致 ✓）；副本制；未跑全量／`regen-all`／git；**无半截状态**。

## 1. ★ R3"夹具构造不出"的根因：**我的变异没落地**（不是缝的问题）

- 你查清了**缝是真的**（指向不存在路径 ⇒ 生成器当场炸；且 `DOC` 在 `readFileSync(DOC)` 真被用）。
- ★ 我 R3 三次失败的共同点：**我"改坏 doc"的那一步没有真正改到 §11 表体** —— 我用 `^\| \`vmu\.` 的**宽松正则**去找行，而 `docs/04` 里**表体之外**也有形如 `| \`vmu.…` 的行（图例/示例/其他小节）；于是**改的是别处的行**，§11 表体一字未动 ⇒ 子进程如实报 `up to date` ⇒ 我看到的"缝没生效"其实是**变异没落在目标上**（★ 与 R36"锚点打在散文行"**同一族**）。
- ★ 本轮我改成**坐标**：表头 `headerIdx`（**实测 0-based 258** ✓ 与你的读数一致）；★ 并且**发现一个 off-by-one**：`headerIdx+1` 是 `|---|…|` **分隔行**，**真正的第一条表体行是 `headerIdx+2`** —— 我第一版把分隔行删了（仍然 STALE，但**stale 的原因错了**）⇒ 已修正为删 `headerIdx+2`（并在断言里**先证明那一行是键行**）。
- ⇒ ★ **结论**：**缝好用、夹具可造**；我 R3 的"待解"**已解除**，根因是**我的锚点/一行偏差**。

## 2. 常驻断言：`tests/b1prime-staleness-report.test.mjs`（★ **8 passed / 0 failed**）

夹具（测试**自建**，临时目录，跑完删）：拷 `docs/04-settings.md` → **删表体第一条键行**（`headerIdx+2`，坐标断言先行）→ 用 **`VMU_SETTINGS_DOC=<副本绝对路径>`** 跑 `generate-wiring-index.mjs --check`。
| # | 断言 | 意图 |
|---|---|---|
| 0 | **对照臂**：**未修改**的 doc 走**同一条缝** ⇒ `exit=0`（up to date） | ★ 证明**缝是活的**（否则"STALE"可能来自别处） |
| 1 | ★ **非空前置**：夹具确实 **hard-stale**（`exit=2` ＋ 至少一行 `诊断:`） | ★ 没有这条，其余断言只是在测**干净路径** |
| 2 | ★ **hard 的 `detail` ≡ settings-table 子进程的最后一行**（逐字） | 第 6 轮"误导消息"修复的**回归守卫** |
| 3 | **hard 桶恰好一条**（无重复、无跨 kind 串味） | 组装顺序/分桶 |
| 4 | **hard 的消息是设置表那条**（soft 的措辞不得漏进 hard 路径） | 两段消息互不串味 |
| 5 | **soft 子检查独立**（自己的进程、自己的结果） | 并发后仍各自成立 |
★ 这一轮**没有**写"没有牙"的断言：**前置夹具真的成立**（#0＋#1 双证），且**变异能把它打红**（§3）。

## 3. 当天副本制反例（target-addressed）

`D:\_tmp\v47\counter.mjs`：拷 tree 到 `_tmp\v47\copy` ⇒ **只变异副本**：把组装处的 `out[r.c.kind]` 改成 `out[r.c.kind === 'hard' ? 'soft' : 'hard']`（**kind 桶对调**）；★ **落地证明**＝原锚点字符串已消失（否则抛错）。
```
MUTATION LANDED ✓ (kind buckets swapped; original anchor gone)
COPIED TEST (mutant) exit=1 (red ✓)
   FAIL ★ precondition: the fixture goes HARD STALE (exit 2 + a 诊断: line) [exit=0 diag=0]
   FAIL ★ hard `detail` ≡ the settings-table child's LAST stderr line, verbatim …
   FAIL the hard bucket reports exactly ONE entry (no cross-kind mixing, no duplicates) [0]
   FAIL the hard message is the settings-table one (the soft wording does not leak into the hard path)
★ 红在被测断言上: YES ✓
REAL TREE UNTOUCHED: … OK (read-only ✓)
```
⇒ ★ **判据有牙**：桶一对调，**4 条被测断言**立刻红，且**红在该红的那几条**（前置／`detail` 等价／每 kind 一条／hard 消息不串味）。

## 4. 旧 vs 新：hard 路径的"逐字等价"我用了**更强**的形式

- ★ 你要求的"旧 vs 新（纯 `--check`）`detail` 逐字相同"**我没有**用反向补丁的旧实现再跑一次（R2 那次反向补丁因**多行字面量转义**失败，R4 未重试）；
- ★ 我改为**直接断言**：**父进程的 `detail` ≡ 子进程自己输出的最后一行**（§2 #2，**已通过**）—— ★ 这**强于**"新旧相等"：它钉住的是**消息的内容来源**，而不是"两个实现碰巧一致"；★ **等价推理**：新实现与旧实现的**提取代码逐字相同**（`String(stderr||stdout).trim().split('\n').filter(Boolean).slice(-1)[0].slice(0,200)`），差别只在**并发与排空机制**；★ **退出码**由 #1 钉住（`exit=2`）。
- ⇒ ★ **口径如实**：**"新旧 hard 路径逐字对比"未做**（替代＝上述直接断言）；**我不把替代说成"做了新旧对比"**。

## 5. 状态 / 没核

- **跑了/核了**：常驻断言 **8/0**；副本反例（红在 4 条断言、落地证明、真树只读）；表头坐标（258）与"分隔行"事实。
- ★ **没核/未做**：**`tests/b1prime-staleness-report.test.mjs` 尚未登记进 `package.json files[]`**（预算；★ **这是本轮唯一的登记欠账**）；"旧实现 hard 路径"的实测对比（替代见 §4）；性能未复测（沿用 R2：真树 6.07–6.32s）。
- ★ **新纪律收到**："**输入集来自 git 的门禁看不见未提交的文件 ⇒ 先 `git add` 再跑门禁**" —— ★ 我本轮**不跑门禁、不 git**，故只作记录；★ 若我下一轮跑门禁，**会先提醒你 `git add`**（我不自行 git）。
- **仓内改动**：`tests/b1prime-staleness-report.test.mjs`（新）＋本报告；**无半截状态**。

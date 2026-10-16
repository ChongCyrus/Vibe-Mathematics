# Phase 2 · `vmu-accept` · Round 5：并入 R4/R5 四件 ＋ **Lead 第三处引用错的更正**

> **交付物**：① 总账 `docs/acceptance/17-objective-status.md`（原地维护）；② 本报告。
> **纪律**：**只读**（侦察）＋ **只写**总账与本报告；**未跑全量（T0/T1 归 Lead）／未 `regen-all`／未做任何 git 写**（只读 `git log/status/ls-files`）。
> ★ **本报告未跟踪** ⇒ 以 `git ls-files` 为输入集的门禁**此刻看不见它**（§5.9-24 的自指现场）。

## 0. 哪一次运行、哪一版文件

| 项 | 值 |
|---|---|
| HEAD | **`4172659`**（*test(wiring-index): pin the staleness fixture that could not be built, and narrow a boundary that turned out to be reachable*）；此前 `514540f`(R3)／`1960c8d`(R2 迁徙) |
| 我的窗口 | 2026-10-16 **08:2x – 08:4x** |
| 工作树 | **12 条**（4 `A`：`phase2-assistant-round4-d1-fixture.md`／`phase2-comms-round4-c3-guard.md`／`phase2-comms-round5-c3-resident.md`／`phase2-pack-round4-a1-step1.md`；总账 `MM`；`README.md`／`README.en.md`／`docs/AUDIT-CHECKLIST.md`／`docs/test-timing.md`／`scripts/generate-vmu-settings-table.mjs`／`tests/b1prime-staleness-report.test.mjs` 为 `M`；`tests/b1prime-c3-computed-guard.test.mjs` 为 `A`）⇒ ★ **读数绑"那一刻的工作树"** |
| 我算的 sha256[0:16] | `phase2-assistant-round4-d1-fixture.md` **`F53EA20C9D965308`**／`phase2-comms-round4-c3-guard.md` **`DADEF6F9E91CCAE3`**／`phase2-pack-round4-a1-step1.md` **`F638F5E445C88FD3`**／`phase2-comms-round5-c3-resident.md` **`0FE934AD6FBE2EC0`**／`tests/b1prime-c3-computed-guard.test.mjs` **`DF29854ED3CF6706`**／`tests/b1prime-staleness-report.test.mjs` **`BCA9515BEA179A9C`** |

## 1. ★★ B2：8 键 `elided[]` 的真机读数 —— **我第一手读并独立复算**（本报告最重的一条）

**探针** `D:\_tmp\r5-accept\probe-b2-spill.mjs`（只读）。**来源**：`C:\Users\admin\AppData\Local\Temp\1\dsh-spill-XYOIoU\session-9da67109d9c2\924d5c4b28b0-vibe_vmu_status.txt`，**149,951 B／sha256[0:16] `073F9A11FB34CA24`**，★ **文本中不含宿主省略标记**（`\n\n[...]\n\n` 不存在）⇒ **未被宿主省略**；`JSON.parse` 成功，**37 个顶层键**。

| 我复算的 | 读数 |
|---|---|
| `elided[0]` 键数 | **8**：`path,from,to,bytes,keptBytes,keptHash,origHash,hash`（★ **旧状态"只有代码读数"作废**） |
| ★ `origHash` ↔ **规则** | `sha256('ABCDEFGHIJ'.repeat(1400))[0:16]` ＝ **`9AB9D27F942BD37F`** ＝ `origHash[0:16]` ✓ |
| ★ `keptHash` ↔ **实际留存串** | `sha256(kept)[0:16]` ＝ **`AE340E51B73AB36B`** ＝ `keptHash[0:16]` ✓ |
| 长度/范围 | `kept.length ＝ 2009 ＝ keptBytes`（＝2000＋标记 9）✓；`bytes ＝ to−from ＝ 12000` ✓；`to ＝ 14000 ＝ rule.length` ✓ |
| 前缀性 | `kept ＝ rule.slice(0,from) + '…[elided]'` ✓（逐字符） |
| `receiptMeta` 五键 | `truncated:true`／`hostElision:'possible'`／`originalBytes:160989`／`elided`／`note` ✓ |
| ★ `note` 措辞 | 现在是 **TOWARD** ＋ **"this does NOT claim the budget was reached"** ⇒ **R34 的措辞缺口在当前树上已修** ✓ |

⇒ ★★ **第一条【在 8 键形态上哈希 ↔ 留存规则互相可复算】的真机读数** —— ★ **两半都是我算的**（规则→`origHash`、实际→`keptHash`）。★ **口径**：**会话不是我跑的**（是她跑的：`session-ada8bbd3-…`，13 s／34,304 tokens／driver exit 0），**复核是我做的**。

## 2. ★ 引用更正：Lead 第三处引用错（我已就地改）

- ★ **错引**："报告面 `to: []`／`channel: log`" ⇒ 引到了 **`vibe-math-vmu/tools/report.js`**。★ **我实读**：该文件 **8,145 B／106 行，没有 `channel`／`recipients`／`noRecipients` 任何字段**。
- ★ **正确位置＝`vibe-math-vmu/kernel/report.js`（32,997 B／570 行）**：`:**110**` `channels` 默认 `['inbox','digest','log']`；`:**111**` `recipients` 默认空；`:**211**` `const channel = str(raw.channel) || 'log'`；`:**217-219**` `noRecipients` **只在 `channel !== 'log'` 时**报，文案 **`'use channel "log" for a report that is only recorded'`**。
- ⇒ ★ **实质成立、机制更准**：**默认通道就是"只记录、不投递"** ⇒ **这就是行为层"自动汇报＝0"的结构性原因**（不是"模型不想报"）。
- ★ **总账里没有留下旧错引用**（我在总账搜 `tools/report.js`／`to: []`／`channel: log` ＝ **0 命中**）；★ 按更正后的坐标写进 **(H2)**，并把本条并入 **§5.9-28**（现记 **3 处现场，全部是 Lead 自己的**）。

## 3. 我实跑的读数（★ 与"转述"分开）

| 门/命令 | 读数 | exit | 归属 |
|---|---|---|---|
| `node D:\_tmp\r5-accept\probe-b2-spill.mjs` | 8 键 ✓＋上述全部复算 ✓ | 0 | ★ **我** |
| `node tests/audit-package-membership.mjs`（新测试在场） | `29 passed, 0 failed` ⇒ **G0-k＝非欠账** | 0 | ★ **我**（★ 写手自陈"**未独立复跑**"⇒ 这条第一手读数由我提供） |
| `node tests/b1prime-c3-computed-guard.test.mjs` | `5 passed, 0 failed` | 0 | ★ **我** |
| `node tests/b1prime-staleness-report.test.mjs`（R5 版） | `8 passed, 0 failed` | 0 | ★ **我** |
| `node scripts/generate-vmu-settings-table.mjs --check` | `up to date (1226 keys (1108 wired, 5 undetermined, 113 declared-but-not-wired))` ⇒ **C3 守卫真树 0 处、不响** | 0 | ★ **我** |
| `node tests/audit-table-integrity.test.mjs` | `EXIT=0`（★ 我的总账在跟踪集内、未被判红） | 0 | ★ **我** |
| T0／T1／`regen-all --check` | — | — | ★ **Lead 的读数（转述）：我没跑** |

## 4. 并入的四件（每条都带"核了/没核"）

1. **D1 ✅ 已闭合**：`phase2-assistant-round4-d1-fixture.md`（`F53EA20C9D965308`）—— `preflight→sync→decode→extract→postflight→hygiene` 端到端跑过；payload **四文件跑前/跑后逐字节 equal**（HEAD `4172659`）；**10 帧 24 events**；M/P/S 三档（只打 C1 原始计数＋"任务点名过的调用不算 S"）；**C2 永不自动判**；**优先 HOST SPILL**；★ **`hygiene` 抓到它自己没删的凭据副本**。★ ★ **它自曝两个 bug**（**字面量搜 ⇒ 点分路径**；**点分路径不回溯 ⇒ 回溯式**）⇒ 我照记，★ **未复跑**。
2. **C3 ✅ 已落地**：生成器 `:260-278` 扫 **`<nsBinding>[`** ⇒ 具名 `file:line`＋绑定名＋`exitCode=1`；**真树 0 处不响**（我实跑 `--check` up to date）；**副本制证明会响**（CONTROL 静默／FIXTURE 具名 `kernel/zzcomputed.js:3`）＋ **R5 常驻断言**（**我实跑 5/0**）。★ **残留（具名）**：**`NS[K]` 常量键不解析、不猜** ⇒ **落进"响"的桶**（生成器原话：never in "nobody reads it"）。
3. **B2 ✅ 已闭合（真机）**：见 §1。
4. **A1 ⏳ 契约已定、实现未落、可行性待核**：`phase2-pack-round4-a1-step1.md`（`F638F5E445C88FD3`）—— 开关 `vmu.report.feedback`（boolean 默认 `false`）／`vmu.report.audience`（string 默认 `''`）；回执 `reportFeedback:{enabled,source,audience,delivered,code,what,reason}`（**7 键恒存在、状态用值**）；★ **机制＝宿主动态 context 通道**（★ **理由：写进提示词 section 会重新污染 R42/R43 刚分开的 P**）；★ **可行性未决＝宿主 context 注册 API ＋ 能否新增槽**。★ **我未核其可行性**（那是 R5 的读码任务）。

★ **另并入 R4 的两条**（本轮补做的）：**(H) 交叉印证**（`tests/vmu-assistant-systemprompt.test.mjs:88`／`:90-91` **逐字节** `byte-present, not claimed`；`:92-93` "它不是什么"；`:94-95` "来源必须写 `pack`、不许写 `inline`"）⇒ 与 R42 的注入层读数**两个方向互相印证**；**(H2) 行为层的结构性原因**（见 §2）。

## 5. 纪律族编号（★ 本轮报给 Lead）

**当前 1–29**（按 §5.9 顺序）：1 取不到先证路径对｜2 不确定时必须出声｜3 改类型/形状必跑消费它的断言｜4 反例器与被测树物理隔离｜5 声明 `domain` ≠ 运行期受保护｜6 执行点上线前覆盖每种已声明类型｜7 有条件的键就是形状变化｜8 注释提到键＝文档不是读取／看不见≠没有｜9 门红了 ≠ 红在被测那一行｜10 生成器当子检查⇒性能放大｜11 不许抬超时消红｜12 子串探测撞同名/自证文本⇒按路径验｜13 数字变了先给机制｜14 "红了"vs"红在被测行"／"没核"vs"核了"／转述注明来源｜15 落地自检必须 target-addressed 且被强制｜16 两方同向读数共享缺陷⇒一致不构成事实｜17 任务前提必须先核｜18 能红的反例需要会分叉的输入｜19 机制要在依赖闭包里找｜20 先打印结构再写解析｜21 可重推先写清"要推出什么"｜22 搬进仓会改变"在外面"的断言｜23 批量替换排除记录历史的文本｜**24 输入集来自 git 的门禁看不见未提交文件**｜**25 判据自称的害处不适用时改规则不改证据文件**｜**26 仪器故障要当仪器故障报**｜**27 合并两阶段产物⇒文件名撞车**｜**28 引用位置也要核（三处现场，全是 Lead 的）**｜**29 被记下的欠账也要用测量确认它真的是欠账**。

## 6. 诚实边界

1. **未跑 T0/T1／`regen-all`**（归 Lead）；**未做 git 写**（我的两次写入**未提交**）。
2. **B2 的会话不是我跑的** —— 我做的是**读那份未被省略的 spill ＋ 复算**；★ 我**没有**独立重跑真机臂、**没有**碰凭据。
3. **D1 的端到端跑、C3 的副本反例、A1 的可行性** —— **只读转述**（我**实跑**的是 C3 的常驻断言 5/0 与生成器 `--check`）。
4. ★ **本报告未跟踪** ⇒ 提交前跑门禁请 **先 `git add`**（§5.9-24）。

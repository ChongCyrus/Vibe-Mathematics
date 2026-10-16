# 第二阶段 · assistant `round4`：**D1 真机夹具固化** ＋ **B2 抓 `elided[]` 8 键形态**

> 负责人：`vmu-assistant2`（**真机结论只由我声称**）。
> 读数绑：**HEAD `4172659`**（`test(wiring-index): pin the staleness fixture that could not be built, and narrow a boundary that turned out to be reachable`）；**跑前/跑后逐字节核**（见 §1）；运行窗口 **2026-10-16 08:24:12 – 08:24:25**。
> 夹具位置（★ **仓外**，按"要动仓先报我"的规矩）：`_handoff/vmu/r4-fixture.mjs`。本报告是**唯一**仓内改动。

---

## 0. 结论
- **D1 ✅ 夹具已固化并【端到端跑过一次】**（不是纸面脚本）：`preflight → sync → decode → extract → postflight → hygiene` 六步全部实跑；★ **跑的过程中抓到并修好夹具自身的两个 bug**（见 §2.6，这正说明"跑过"与"只写了"的差别）。
- **B2 ✅ 8 键 `elided[]` 形态已在真机抓到**（原样见 §3），**且 `keptHash`／`origHash` 能用我 R34/R37 公布的确定性规则独立复算** ⇒ ★ **"8 键在真机上成立"从【代码读数】升级为【真机读数】**（这一条 R37 报告里明确留作缺口）。
- ★ **诚实**：本报告区分**真机读数**与**代码读数**（§2.6 的两处 bug 是**我读代码/跑夹具**发现的，不是真机行为）；C2 **不由脚本判定**（§4 限制）。

## 1. D1-1｜payload **逐字节核** ＋"这次跑的是哪一版"
**命令**：`node _handoff/vmu/r4-fixture.mjs preflight`（跑后同一命令 `postflight`）
**跑前（原样）**：
```
version this run uses: 4172659 test(wiring-index): pin the staleness fixture that could not be built, and narrow a boundary that turned out to be reachable   | git status lines = 2
vibe-math-vmu.js   HEAD=71E288B9AD711E2E (85130 B)  scratch=71E288B9AD711E2E (85130 B)  equal=true
host.js            HEAD=461D7FD499F016EA (80556 B)  scratch=461D7FD499F016EA (80556 B)  equal=true
receiptbounds.js   HEAD=E4873BFBC9AAC0AB (14219 B)  scratch=E4873BFBC9AAC0AB (14219 B)  equal=true
index.js           HEAD=81D7CDD40962C773 (179415 B)  scratch=81D7CDD40962C773 (179415 B)  equal=true
⇒ ALL EQUAL — readings may be labelled "current tree"
```
**跑后**：四个文件**仍全部 equal** ⇒ **本次读数可标"当前树"** ✓（跑前 `git status` = 2 行、跑后 3 行 —— 均为**他人**的在飞文件，见 §5；我的 payload 文件与 HEAD 逐字节相等）。
**口径**：`sha256` 取 **`git cat-file blob HEAD:` 的二进制**（★ 无文本往返），并与 scratch 载荷逐文件比对；**字节数与哈希都比**。

## 2. D1-2～D1-5｜夹具的四步（含使用命令）
**2.1 多帧解码（D1-2）**：`node _handoff/vmu/r4-fixture.mjs decode <sessionId> [--boot <host stdout log>]`
本次输出（原样节选）：
```
frames = 10 (one-shot zstdDecompressSync would yield 2 lines that LOOK like evidence) | events = 24 | turn/end = {"kind":"completed"}
tools called = 1 → vibe_vmu_status
```
★ **按帧切**（zstd magic `28 b5 2f fd`，与 `scripts/dsh-drive.mjs:206-215`、`tests/vmu-assistant-host-slice.test.mjs:101-111` 同法）；★ 夹具把**"一次性解压只得 2 行且看着像证据"**这句**打印在输出里**，提醒读者别踩。

**2.2 M/P/S 三档判读（D1-3）**：
- **M＝机制报的**：读**宿主 stdout** 的 `[vmu-report-sink] …` 行 —— 夹具用 `--boot <log>` 打印 sink 行数与全文。本次：**M = 1 条**（`turn-end-duty`，`drives:false`）。
- **P＝提示词要求的**：**注入层**；★ 真机回执**不给段文本** ⇒ 用 **`prompt.sections` 段数 ＋ 具名段在不在**（如 `v5r-report-duty`）。本次：`prompt.sections = []`（**0 段**）。
- **S＝模型自发的**：**C1**＝非任务要求的 vmu 报告工具调用；**C2**＝超出任务要求的面向人汇总。
  ★ 夹具打印 **`S·C1: vmu tool calls = N`**（**原始计数**）＋ **`--task <文件>` 提示"任务点名过的调用不算 S"**；本次 C1 原始计数 = **1**，而任务**明确要求**调用一次 `vibe_vmu_status` ⇒ ★ **该 1 次是"任务要求的"，不是 S**（这正是"不许把 M/P/任务要求的当成 S"的落地）。
- ★ **脚本永不判 C2**（见 §4）：它只打印**最终文本前 400 字符＋词频**（`汇报/报告/进度/Progress/vibe_vmu_report`），把判断留给操作者。

**2.3 命名 spill／结果面（D1-4）**：夹具在 `extract` 里**先列出本会话自己日志里点名的 spill 路径并逐条核存在性**，然后**优先选 HOST SPILL**，否则退到**转录副本**并**明确标注它是"可能被宿主省略/省略过"的那一份**：
```
named receipt copies in this session's own log: 1
  C:/Users/admin/AppData/Local/Temp/1/dsh-spill-XYOIoU/session-9da67109d9c2/924d5c4b28b0-vibe_vmu_status.txt  (149951 B)
CARRIER = HOST SPILL (full receipt): …924d5c4b28b0-vibe_vmu_status.txt
```
★ 依据＝R33 的方法学发现：**转录里那份是宿主省略版（含 `\n\n[...]\n\n`），不能用它下"有/没有"的结论**。

**2.4 卫生清单（D1-5）**：`node _handoff/vmu/r4-fixture.mjs hygiene`
```
.credentials* under D:\_tmp: D:\_tmp\r18-home\.credentials.yaml  (operator profile untouched = true)
7700–7900 listeners: none
```
★ **它当场抓到了我还没删的凭据副本**（夹具价值的一次实证）⇒ 已删；**复跑后**：`.credentials* under D:\_tmp: none` ✓；端口 `7700–7900` **none** ✓；宿主已停。

**2.5 使用一览（可直接抄）**
```bash
node _handoff/vmu/r4-fixture.mjs preflight
node _handoff/vmu/r4-fixture.mjs decode <sessionId> --boot <host stdout log>
node _handoff/vmu/r4-fixture.mjs extract <sessionId> --keys receiptMeta,elided,prompt.sections,faces.published --task <task file>
node _handoff/vmu/r4-fixture.mjs postflight
node _handoff/vmu/r4-fixture.mjs hygiene
```

**2.6 ★ 夹具在实跑中被抓到的两个 bug（都是我自己的）—— 附证据与修法**
| # | 现象 | 根因 | 修法 |
|---|---|---|---|
| 1 | `extract --keys prompt.sections,faces.published` 报 **ABSENT**，但同一份 spill 里明明有 `"published":[…]`／`"sections":[…]`（我用 grep 直接核到：`"published"` 在 `@147714`、`"sections"` 在 `@137190`） | 我用**字面量** `"prompt.sections"` 搜（JSON 里是**嵌套** `"prompt":{…"sections":…}`） | 改为**点分路径**解析 |
| 2 | 改成点分路径后**仍** ABSENT | `"prompt"` 的**首次出现**是设置键 `vmu.prompt`、`"faces"` 的首次出现是 **guards** 块 ⇒ 我的解析器**不回溯** | 改为**回溯式**：逐段收集**所有**候选作用域，取**首个能解析完整路径**的候选 ✓（复验：`prompt.sections=[]`、`faces.published=[…]`、`faces.disabled=[]`） |
★ **这两条属"夹具 bug"，不是真机行为** —— 但它们**只在实跑中才暴露**，所以 §0 特意写"端到端跑过"。

## 3. B2｜**8 键 `elided[]` ＋ `receiptMeta` 五键（真机，原样）**
**会话**：`session-ada8bbd3-8e82-47cd-ac20-582b19e5ae1c`（08:24:12，13 s，34,304 tokens，`tokenCapHit:false`，driver exit 0）
**读数来源（★ 命名）**：`HOST SPILL` → `C:/Users/admin/AppData/Local/Temp/1/dsh-spill-XYOIoU/session-9da67109d9c2/924d5c4b28b0-vibe_vmu_status.txt`（**149,951 B**，即**未被宿主省略**的完整回执）
```
[[receiptMeta]]
{"truncated":true,
 "elided":[{"path":"settings.resolved.vmu.turn.instituteName.value",
            "from":2000,"to":14000,"bytes":12000,
            "keptBytes":2009,
            "keptHash":"ae340e51b73ab36b28f68024330ea88e85179d552aaa7b9b9c6e7538a5d44ca5",
            "origHash":"9ab9d27f942bd37f7d48b367c4f32628514ad6de664578fea7159259613157f0",
            "hash":"sha256"}],
 "hostElision":"possible",
 "originalBytes":160989,
 "note":"the string leaves over 2000 were elided BY US TOWARD MAX_TOOL_RESULT_BYTES (12000): `elided` gives the exact path and half-open range of each. ONLY cap-able leaves can be shortened, so this does NOT claim the budget was reached - `originalBytes` is the size before, and every other field is unchanged. A host-inserted `[...]` marker may ALSO appear (hostElision) - that one is outside this receipt."}
```
**★ 8 键 ＝ `path`／`from`／`to`／`bytes`／`keptBytes`／`keptHash`／`origHash`／`hash`（`hash:"sha256"`）** ⇒ ★ **R34 那份回执是 4 键形态、R37 报告的缺口（"8 键只有代码读数"）在本轮闭合** ✓
**★ 独立复算（把"哈希能证什么"落到实处）**：
- `origHash` 前 16 位 = **`9AB9D27F942BD37F`** ＝ 我 R34/R37 **公布的确定性规则** `sha256('ABCDEFGHIJ'.repeat(1400))` 的前 16 位 ✓✓
- `keptHash` 前 16 位 = **`AE340E51B73AB36B`** ＝ 我 R37 复算得到的 `sha256(kept)` 前 16 位 ✓
- `keptBytes = 2009 = 2000 + 9`（`2000` 为 `MAX_STRING_LEAF`，9 为标记 `…[elided]` 长度）；`bytes = to − from = 12000` ✓
⇒ ★ **该回执的哈希与我方的留存规则【互相可复算】**（这正是 R37 建立的"可复算"在 8 键形态上的第一次真机实例）。
**★ 另一处顺带更正（真机读数）**：`note` 现在是 **"elided BY US _TOWARD_ MAX_TOOL_RESULT_BYTES"** 且明确写 *"this does NOT claim the budget was reached"* ⇒ ★ **R34 我报的措辞缺口（"to reach" 与实测不符）在当前树上已修** ✓（并保留了"只截可截叶子、不声称达标"的限定）。

## 4. 夹具的**已知限制**（写明，免得被当能力）
1. **C2 永不自动判定** —— 需要任务文本＋判读；脚本只给最终文本与词频。
2. **点分路径取"首个能解析完整路径"的候选** —— 对**同名歧义键**（如 `prompt` 既可能是设置键又可能是回执字段）它取首个可解析者；★ 本轮我用 **grep 直核**（`"prompt":{` / `"published":[`）交叉确认过；**要更强需打印命中偏移**（留作下一步）。
3. **spill 依赖会话自己日志点名** —— 若那次运行没让模型读 spill（例如任务没要求贴回执），夹具会退到**转录副本**并明确标注"可能被省略"。
4. **M 依赖宿主 stdout 日志路径**（`--boot`）；不给就读不到 M（会打印提示）。

## 5. 隔离与在飞写者（照实记）
- 我本轮**只新增** `docs/acceptance/phase2-assistant-round4-d1-fixture.md`（本报告）＋**仓外**夹具；**未改任何代码/测试/其它文档**。
- 跑前后 `git status` 显示的**在飞文件均非我**：`M docs/acceptance/17-objective-status.md`、`M scripts/generate-vmu-settings-table.mjs`（`vmu-comms2` 范围）、`M tests/b1prime-staleness-report.test.mjs`、未跟踪 `?? docs/acceptance/phase2-pack-round4-a1-step1.md`（`vmu-pack2` 范围）。
- ★ **我的 payload 四个文件与 HEAD 逐字节相等**（§1），故本次读数不受这些在飞文件影响 ✓。

## 6. 成本
- **预估**：1 次会话（短任务：1 次 status 调用）≈ **30–80k tokens** ⇒ **未超预算**（无需事前上报）。
- **实际**：**1 次会话／34,304 tokens**（13 s），低于估算 ✓；夹具与解码脚本本身 **0 token**。

## 7. 一句话交接
**A1（汇报受众＋反馈回路）第二步要跑真机时，直接照 §2.5 的四条命令跑即可**；★ 唯一仍需人判的是 **C2**（§4 限制 1），以及"任务点名过的调用不算 S"（夹具会提示，但要人来比对任务文本）。

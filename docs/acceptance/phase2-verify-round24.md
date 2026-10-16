# Phase 2 · verify2 · Round 24 —— 独立复核 Lead 的"决定性变异"主张（绑定 `6d64a74`）

> 纪律：**只读复核**（真树只新增本报告）；全部实验在 `D:\_tmp\p2r24`（**副本制**，用 `git archive -o` 解出）；**每个读数绑 blob／绑修订**；**"没核"与"核了"分开写**；未跑全量／`regen-all` 写／git 写／未跑真机。
> **待核主张的绑定**：`56bcf37`（HEAD，其父＝**`6d64a74`**，即你跑的修订）；入口 `vibe-math-vmu.js` **`CDCBA5C9875C86BA`**（★ 在 `6d64a74`／`56bcf37`／HEAD **三处完全相同** ⇒ 你的变异打的是一个**没变过**的文件）；测试 `tests/b1prime-pack-fold.test.mjs`。

## 0. 结论速览（★ 逐条复现：**全部成立**，另加一条精确化）
| 主张 | 我的独立读数 | 判定 |
|---|---|---|
| **① 真产地＝入口** `vibe-math-vmu.js:393` | 逐字：`for (const k of Object.keys(packDefaults)) if (!Object.prototype.hasOwnProperty.call(settings, k)) settingsSources[k] = 'pack:' + packDefaultSource[k]` | ✅ 与你说的一致 |
| **② 变异入口 ⇒ 5/2 ＋ 两条具名 FAIL** | 我**从 `git archive -o` 解出的 `6d64a74`** 上跑：CONTROL **7/0 exit=0**；**M-entry**（`:393` 的 `'pack:' + packDefaultSource[k]` → `'config'`，**anchor=true／landed=true**）⇒ **exit=1，5 passed / 2 failed**：<br>`FAIL ★★ NON-EMPTY PRECONDITION: a pack really was applied — the kernel sources at least one key from 'pack:' [pack-sourced keys=0 sample=]`<br>`FAIL ★★ SOURCE HONESTY: 'resolved[key].source === 'pack:v5r'' (…) [source=config]` | ★★ **逐字复现**（含两条 detail 的 `[pack-sourced keys=0]`／`[source=config]`） |
| **③ 变异内核 ⇒ **不改判** | **M-kernel**（`kernel/index.js:2154` 的 `packSource[k] = 'pack:' + n.id` → `'config'`，**anchor=true／landed=true**）⇒ **exit=0，7 passed / 0 failed**（**毫无变化**） | ★★ **成立**：内核那一行**不是**本夹具/本断言的产地 |
| **④ 红在"来源"上、不是泛红** | 7 条里**恰好 2 条红**，都是**来源类**（PRE-CONDITION 的"pack-sourced keys=0" ＋ **SOURCE HONESTY** 的 `source=config`）；★ **FOLD 类断言不在 FAIL 里**（5 passed 含它们） | ✅ 且这正是"**值折叠了、只是标签丢了**"的判别 |
| **⑤ 方法学提醒** | ★ **管道形态实测失败**：`git archive --format=tar HEAD \| tar -x -C …` ⇒ **`tar.exe: Error opening archive: Failed to open '\\.\tape0'`** ＋ PowerShell"管道正在被关闭"，**解出 0 个文件**；★ `-o` 形态 ⇒ **1111 文件** | ★★ **属实**（连错误文本都一致：它去开**磁带设备**） |
| **⑥ 误导消息是否已改掉** | `6d64a74 → 56bcf37` 的 diff：旧 `'… (the kernel names the pack, per \`packSource[k] = 'pack:' + id\`)'` ⇒ **新** `'… labelled by the ENTRY, which is the only layer that knows a pre-construct…'`；★ 并新增 7 行注释**记录这次误导**（"that misdirection cost a round…"）＋**记录红-ability 证据** | ✅ **消息不再指向内核 `packSource`** |
| **★ 我加的一条精确化** | **内核那行不是死代码**：`index.js:2153 const packSource = {}` → `:2154` 填充 → **`:2161 const source = packSource[def.key] \|\| settingWriter(settings, def.key)`** → `:2163` 用于 `overridden` | ★ 准确说法：**它在跑，只是喂的是【另一条 resolved 构建路】**；对本夹具"不改判"是**范围陈述**，不是"它是死代码" |

## 1. 两条候选行（逐字）与绑定
```
入口  vibe-math-vmu.js:393   for (const k of Object.keys(packDefaults)) if (!…hasOwnProperty.call(settings, k)) settingsSources[k] = 'pack:' + packDefaultSource[k]
内核  kernel/index.js:2154   for (const n of packApplied) for (const k of n.keys || []) packSource[k] = 'pack:' + n.id
```
★ 你说入口那行的注释是 *"the entry is the only layer that knows this; the kernel sees one flat object"* —— ★ 我读到的是**同一句在测试的新注释里被引用**（见 §5）；**入口源码那行的紧邻注释我没有逐字取**（见 §7 未核）。
★ 入口 blob 在 `6d64a74`／`56bcf37`／HEAD **三处相同**（`CDCBA5C9875C86BA`）⇒ ★ 你的变异打的确实是一个"冻结"的输入 ✓。

## 2. ⑤ 方法学提醒：**实测属实（含原样错误文本）**
```
git archive --format=tar HEAD | tar -x -C <dir>
   ⇒ tar.exe: Error opening archive: Failed to open '\\.\tape0'
   ⇒ ResourceUnavailable: Program 'git.exe' failed to run: 管道正在被关闭。
   ⇒ ★ 解出文件数 = 0
git archive --format=tar -o <tar> HEAD  然后  tar -xf <tar> -C <dir>
   ⇒ ★ 解出文件数 = 1111（HEAD）／1109（6d64a74）
```
⇒ ★★ **你的警告成立**：管道形态在本机会让 `tar` 去读**磁带设备**，**静默解出空目录** ⇒ 后续"跑一个不存在的测试"会给出**假结论**（这正是"先确认你量的是哪个对象"的又一现场）。★ 我本轮**全部实验都用 `-o`** ✓。

## 3. ①②③④ 复现（副本制；我自己的运行）
```
CONTROL（6d64a74 原样）                                exit=0  7 passed / 0 failed
M-entry（入口 :393 'pack:'+packDefaultSource[k] → 'config'）  exit=1  5 passed / 2 failed
   FAIL ★★ NON-EMPTY PRECONDITION: a pack really was applied — the kernel sources at least one key from `pack:` [pack-sourced keys=0 sample=]
   FAIL ★★ SOURCE HONESTY: `resolved[key].source === 'pack:v5r'` (…) [source=config]
M-kernel（内核 :2154 'pack:'+n.id → 'config'）           exit=0  7 passed / 0 failed   ← ★ 毫无变化
```
★ **为什么内核那条路不决定本夹具的 `resolved[key].source`（机制，我读码核过）**：本夹具的 pack 默认是在**内核构造之前**被折叠的（入口把 `pack:v5r` 写进 `settingsSources`）⇒ 那个键**不在**内核 `packApplied[].keys` 里 ⇒ 内核的 `packSource` 对它**没有取值** ⇒ 于是 `resolved[key].source` 只可能来自**入口**那一层 ✓。★ 而内核那条路**仍然在跑**（`:2161`），只是覆盖面不同（它管的是**内核自己**归因给某个已应用 pack 的键）⇒ ★ **所以"变异内核不改判"是【本夹具的范围】内的真话，而不是"那行是死代码"**（这一点请写进后续口径，免得后人反推成"删掉它也安全"）。

## 4. ④ 两条区分的独立确认
- **(a) FOLD 断言在变异下仍绿** ✓：M-entry 的 7 条里**只红 2 条**，**FOLD 类的没有进 FAIL**（5 passed 含它们）⇒ ★ **"值被折叠"与"标签正确"确实是两件事** ✓（你的 (a)）。
- **(b) 红的就是那条** ✓：`SOURCE HONESTY` 在 FAIL 列表里、detail 为 **`[source=config]`** ⇒ **红在"来源"上** ✓；★ 附一条**设计内的连带**：`NON-EMPTY PRECONDITION`（`[pack-sourced keys=0]`）**同时红**是**预期的**（变异把所有 `pack:` 标签都抹掉了 ⇒ 非空前置自然不成立）⇒ ★ 这不是"泛红"，而是**前置断言按设计工作** ✓。

## 5. ⑥ 误导消息：**已改掉**（我逐行核了 diff）
```
-  '★★ SOURCE HONESTY: `resolved[key].source === 'pack:v5r'` (the kernel names the pack, per `packSource[k] = 'pack:' + id`)'
+  '★★ SOURCE HONESTY: the kernel reports the pack as the layer (`resolved[key].source`), labelled by the ENTRY, which is the only layer that knows a pre-construct…'
+ // ★ WHERE THIS LABEL REALLY COMES FROM, AND WHY IT MATTERS THAT THE MESSAGE SAYS SO. …
+ //   that misdirection cost a round: a mutation of THAT line landed cleanly and changed nothing, because the
+ //   kernel's `packSource` feeds a different path. … (引用了入口那行与内核自己那句 "the entry is the only layer that knows this; the kernel sees one flat object")
+ // ★ AND ITS RED-ABILITY IS PROVEN, NOT ASSUMED. Mutating that entry line in a throwaway archive turns it red here:
+ //   control 7/0 green, mutant 5/2, with THIS assertion failing as `source=config` - while the FOLD assertion above
+ //   stays green, which is the discrimination that matters (the value still folded; only the label was lost).
```
⇒ ★ **消息不再指向内核 `packSource`** ✓，且测试**自己带上了证据**（control/mutant 的读数与"FOLD 仍绿"的判别）✓ ⇒ ★ 后人不必再花一轮重走这条错路。

## 6. 我的量具注意（本轮）
1. ★ **两次解出的文件数不同（HEAD 1111／`6d64a74` 1109）** ⇒ 因为两者相差 2 个文件（`56bcf37` 之后的提交）⇒ ★ **不是**解包不全的证据（我按"测试文件存在 + 跑得出摘要"确认过 ✓）。
2. ★ 管道形态的对照实验我是**经 `pwsh -Command`** 跑的（复现其原始形态）；★ 我**没有**在其它 shell（cmd／bash）上重复 ⇒ 该结论**限本机本 shell**（与其警告一致，见 §7）。
3. ★ 本轮我**没有再犯 `node -e` 引号错**（变异全部落脚本文件 `D:\_tmp\p2r24\verify.mjs`）✓ —— 这是对我前几轮那条清单项的落实。

## 7. 没核 / 未做（与"核了"分开写）
1. **未核**：**入口源码 `:393` 邻近那句注释**（"the entry is the only layer that knows this; the kernel sees one flat object"）的**逐字原文** —— 我只在**测试的新注释里**看到它被引用（若给我行号，我可逐字核）。★ 这是你 ① 里的**引文**，**不是我核过的读数**。
2. **未核**：**内核 `packSource` 那条路的"牙"** —— 我证明了**变异它不改判本夹具**，但**没有**构造一个"由内核路径产出 `source`"的夹具去证明它**在别处可红**（★ 我只读码指出它经 `:2161` 在跑）⇒ 该行是否**另有常驻断言**覆盖，**未核**。
3. **未核**：**全量 sweep**（T0/T1 归你）；本轮全部读数来自**副本内的单元套件**。
4. **未做**：任何仓内代码/测试改动（本轮真树只新增本报告）。

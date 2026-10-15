# Round 33 · `task-160`：真机升档（六项原样读数）—— **一致 9 项 ⇒ 升档；差异 2 条（具名）**

> 负责人：`vmu-assistant2`（**真机读数由我声称**）｜交付：本报告（唯一写范围）｜硬约束：未跑全量／未 `regen-all`／未 git 写／未改代码·测试；临时文件全在 `D:\_tmp`。
> ★ **判档口径**：与 R30／R31／R32 的**进程内**读数逐项对表；**一致 ⇒ 升档为真机证据**；**差异 ⇒ 以真机为准并具名**（两者**不混**）。
> ★★ **读数绑"提交哈希＋时刻"**：**HEAD `c7950ce`**（`feat(vmu): round 32 - the receipt can be elided without losing its shape, and the capped file came down`）；跑前/跑后 **`git status` 均 0 行**（树稳定，R31 的"在飞写者污染"本轮**不成立**）；**payload 逐字节核**（`git cat-file blob HEAD:` **二进制**＋sha256）：**入口 `71E288B9AD711E2E`（85130 B）；另核 4 个关键文件 scratch ＝ 仓库** —— `host.js` `2DF56A4492FA047B`／`kernel/receiptbounds.js` `B8FEF79B61F178F6`／`kernel/index.js` `81D7CDD40962C773`／`settings/schema.js` `90D9D1D492D88C53`（★ 加载实例里 `MAX_TOOL_RESULT_BYTES = 12000`、`host.js` 的包装在场）。**运行窗口 2026-10-15 21:58:55 – 22:01:56**。

---

## 0. 结论（一句话 + 判档）
**真机与进程内：一致 9 项（①①②③④⑤ 全覆盖）⇒ 这些项已升档为真机证据；差异 2 条，均具名。**
| # | 差异 | 以真机为准的读数 |
|---|---|---|
| **D1** | ★ **回执的自省略／截断自述在真机【未出现】** | 完整回执 **179,826／182,090 字符（≫ 12,000）**，`…[elided]`／`"elided"`／`hostElision` **全都不出现**（`truncated` 唯一出现处是**报告面自己的计数器** `"truncated":0`）⇒ **"超预算 ⇒ 自省略并自述"这条在真机这条路上未被观察到** |
| **D2** | 字段名跨层不同 | **工具回执**用 `appliesFrom:"next turn"`；**内核回执**（我 R31 进程内探针）用 `appliesAt:"next turn"` ⇒ 同一语义两个名字 |

---

## 1. ★★ 方法学发现（本轮最关键的可复用教训）：**宿主会把大回执 spill 到文件、转录里留省略版**
三臂的 `vibe_vmu_status` 在**转录**里都是 **49,930 字符**且带 `\n\n[...]\n\n`（position **24846**，与 R29 同位置）⇒ 于是**任何"转录里没看见 X"都不能当"X 不存在"**（我一开始就被它坑了一次：`settingsRejected` 在转录里**不出现**）。
★ **可靠读法**：宿主的省略文本里**自带 spill 路径**（模型正是靠它 grep 的）：
```
C:\Users\admin\AppData\Local\Temp\1\dsh-spill-ibIK47\session-1f0fd42c9643\85b47c0514d5-vibe_vmu_status.txt   (179,826 B, 第一条)
C:\Users\admin\AppData\Local\Temp\1\dsh-spill-ibIK47\session-1f0fd42c9643\7b6e9e92d225-vibe_vmu_status.txt   (182,090 B, 第二条)
```
⇒ **完整回执就在那里**，且**不含**宿主的 `[...]`（spill 是省略前的文本）—— 本报告 §3 的 `settings.*` 读数即取自这两份 spill ＋ 模型对它们的 grep 输出（转录内，small result，未被省略）。
★ **纪律**：以后引用 `vibe_vmu_status` 的字段，**要么读 spill 文件，要么用小结果面**；**不要**用转录里那份 49,930 的省略版去下"没有/有"的结论。

## 2. 运行（三臂，两臂对照 ＋ 一个域实测臂）
| 臂 | 时刻 | overlay | 会话 id | 退出码 | durationSec | tokens | 备注 |
|---|---|---|---|---|---|---|---|
| **E** 正常（带 `root:`） | 21:58:55 | `r131-E-overlay.yml` | `session-5d817471-39ab-4186-a1c0-74afc62e1ec3` | **0** | 25 | 73,193 | stdout：`turn-end-duty` ＋ **`tool-results-met`（`tool-results=3`）** ⇒ 阈值自主开火 ✓ |
| **A** 被拒（**无** `root:`） | 21:59:30 | `r131-A-overlay.yml` | `session-36382a41-e152-4106-9c08-ff571e510b32` | **0** | 37 | 129,631 | stderr 含 `vmu: pack v5r was not applied: VMU_ENGINE_UNAVAILABLE this kernel has no library root` ✓ |
| **C** 域实测（带 `root:` ＋ `config` 面域外值 ＋ `null` 值） | 22:00:17 | `r160-C-overlay.yml`（＝E ＋2 行） | `session-4be7879d-f349-47dd-9386-6c6db9109fee` | **0** | 91 | 436,713 | ★ **`tokenCapHit:true`**（触 400k cap ⇒ 末段可能被裁；下面读数均取自 cap 前已完成的调用） |
★ 三臂共同：`turn/end` ＝ `{"kind":"completed"}`；**`report/tick` 调用数 ＝ 0**（多帧解码：E 13 帧/29 events、A 17/35、C 32/60）✓。

## 3. ★ 六项读数（原样；★ 括号里标来源）
### ① A 的三个执行点
- **①① 交互写面（经注册工具）域外值 ⇒ 具名拒，理由给出【值与域】** ✓（来自 C 的 `tool/result #4`，原文）：
  `{"ok":false,"code":"VMU_INVALID_ARGUMENT","message":"vmu.budget.onExceed: expected one of refuse | warn | pause","hint":"declared as enum"}`
- **①① 合法值 ⇒ 生效** ✓（#5）：
  `{"ok":true,"key":"vmu.budget.onExceed","value":"warn","hot":"H1","who":"office","ownerCheck":"exempted (no \`by\` given: office path, DISCLOSED)","by":null,"reason":null,"requiresRestart":false,"appliesFrom":"next turn","source":"runtime",…}`
- **①② 配置面域外值 ⇒ 记账＋默认留下** ✓（取自**第一条完整回执** spill，原文）：
  `"settingsRejected":[{"key":"vmu.budget.onExceed","value":"nonsense","code":"VMU_INVALID_ARGUMENT","reason":"outside the declared domain refuse | warn | pause","domain":["refuse","warn","pause"],"type":"enum","source":"config","default":"refuse"}]`
  ＋ **活值**：`"vmu.budget.onExceed":{"value":"refuse","source":"config","hot":"H1","who":"office","overridden":[]}` ⇒ ★ **活值 ＝ 声明默认 `refuse`** ✓
- **①③ pack 层同样记账** ✓（取自**第二条完整回执** spill；★ 注意：**只看 pack 工具自己的回执会误判**，它写 `applied:1`）：
  `"settingsRejected":[…,{"key":"vmu.quota.onExceed","value":"sometimes","code":"VMU_INVALID_ARGUMENT","reason":"outside the declared domain warn | refuse | degrade","domain":["warn","refuse","degrade"],"type":"enum","layer":0,"default":"warn","source":"pack:probe-domain"}]`，**`settingsRejectedCount":2`**；＋ **活值** `"vmu.quota.onExceed":{"value":"warn","source":"default",…}` ⇒ ★ **不收该值、声明默认留下** ✓
  ★ 但 **`vibe_vmu_pack` 自己的回执**是 `{"ok":true,"action":"apply","id":"probe-domain","applied":1,"actions":[{"kind":"setting","key":"vmu.quota.onExceed","value":"sometimes"}],…}` ⇒ **它只讲"包被应用"，不讲该键的值被拒**（记账在 status 回执里）—— 这是"两处读、别只看一处"的又一实例。

### ② `status().settings.*`（子对象；★ 我用的是 **spill 的完整回执**，因为转录里那三个字段被省略了）
`"settingsRejectedCount":1`（第一条）／**`2`**（第二条）✓；`settingsRejected` 记录形状见上 ✓；**`settingsUnenforced`**：
`{"types":[{"type":"planned","count":111,"reason":"no validator implemented for this declaration type yet"}],"declarations":[],"note":"NEITHER silently accepted NOR wrongly refused: these are the declarations the value guard does not judge (task-149 ①)"}` ⇒ ★ **含 `planned` 111 且带 reason** ✓，且 **`declarations` 为空**（与 R31/R32 进程内实测的 **0** 一致）✓。

### ③ `promptSection` 在回执里可读 —— ★ 且**与 pack 是否装载无关**（E 与 A **逐字相同**）
E（pack 装载成功）与 A（pack 被拒）里都是：
`"promptSection":{"registered":false,"code":"VMU_EXTERNAL_UNAVAILABLE","what":"systemPrompt","reason":"cannot get property \"systemPrompt\" without inject","stack":"Error: cannot get property \"systemPrompt\" without inject\n    at new apply (…/vibe-math-vmu.js:800:33)…"}` ✓ ⇒ **两臂同值 ⇒ 与 pack 装载无关** ✓（这正是任务要的那句）。

### ④ `null` 不是域外值 ✓（真机）
`"vmu.compat.unknownCombo":{"value":null,"source":"config","hot":"H1","who":"office","overridden":[]}` ⇒ 活值就是 `null`，**且 `settingsRejected` 里没有它**（count 只由那一个域外键计）✓。

### ⑤ D1 的 id 映射（按映射可机检）
- **E（正常）**：`"applied":[{"requestId":"v5r","manifestId":"v5r-core"}],"appliedPacks":["v5r-core"],"idMap":{"v5r":"v5r-core"},"errors":[],"loading":false,"ok":true,…` ✓ ⇒ `manifestId ⊆ status().packs`（`v5r-core` 是 manifest id、`packs:["v5r"]` 是请求 id）**按 `idMap` 可机检** ✓
- **A（被拒）**：`"applied":[],"appliedPacks":[],"idMap":{},"errors":[{"id":"v5r","code":"VMU_ENGINE_UNAVAILABLE","message":"this kernel has no library root"}],"ok":false` ＋ 同帧 `settingsMerge{applied:false,packs:["v5r"],appliedPacks:[]}` ⇒ ★ **被拒臂映射为空、且同帧仍列 `packs:["v5r"]`** ✓

### ⑥ 截断形态 —— ★ **差异（D1，见 §0/§4）**；但"既有字段仍可读"这半**成立**
- 完整回执 **179,826／182,090 字符**；`…[elided]`／`"elided"`／`hostElision` **均不出现**；`truncated` 的唯一出现是**报告面的计数器** `"truncated":0` ⇒ **我们的 receipt-bounds 省略未在真机这条路上生效**。
- ★ 反向（进程内、**同一加载载荷** `receiptbounds.js B8FEF79B61F178F6`）：对 121,588 字符的**对象**输入，`boundedToolResult` **会**加 `truncated:true`／`elided`／`hostElision`，但**只压到 101,990**（**仍超 12,000 的 8.5 倍**）⇒ ★ **该函数是"限量工作"的收缩器，不是"必达预算"的保证** —— 这一条**进程内就已成立**，真机只是把它推到极端。
- **既有字段仍可读** ✓：完整回执里 `settingsMerge`（含 `packs`）／`packReport`／`idMap`／`promptSection`／`settings.*` **全都在**（`st.packs` 对应的那条要求满足）。

## 4. 判档表（真机 vs 进程内）
| 项 | 进程内（R30–R32） | 真机（本轮） | 判档 |
|---|---|---|---|
| ①① 交互面域外 ⇒ 具名拒（值＋域） | `VMU_INVALID_ARGUMENT`＋`expected one of refuse｜warn｜pause` | **逐字相同** | **一致 ⇒ 升档** |
| ①① 合法值 ⇒ 生效 | `{ok:true,appliesAt:"next turn",source:"runtime"}` | `{ok:true,…,"appliesFrom":"next turn","source":"runtime"}` | **一致**（★ 字段名差异 **D2**） |
| ①② 配置面 ⇒ 记账＋默认留下 | `count=1`＋`source:"config"`＋`default`＋活值＝默认 | **逐字相同**（`refuse`／`config`） | **一致 ⇒ 升档** |
| ①③ pack 面 ⇒ 同样记账 | `source:'pack:probe-pack'`／`layer:0`／`default` | `source:"pack:probe-domain"`／`layer:0`／`default:"warn"`／活值＝`warn`／`default` | **一致 ⇒ 升档** |
| ② `settingsRejected/Count/Unenforced` 可读 | 子对象可读；planned 111；declarations 0 | **同**（★ 只在 spill 里可读全） | **一致 ⇒ 升档** |
| ③ `promptSection` 可读且与 pack 无关 | 有 | **E ＝ A 逐字相同** | **一致 ⇒ 升档** |
| ④ `null` 非域外 | 不加记账、活值 `null` | **同** | **一致 ⇒ 升档** |
| ⑤ D1 映射可机检／被拒臂空 | `applied:[{requestId,manifestId}]`＋`idMap`；拒臂空 | **同** | **一致 ⇒ 升档** |
| ⑥ 超预算 ⇒ 自省略＋自述 | 进程内**加标记但未必达标**（121,588→101,990） | **标记全无、179k/182k 原样** | **差异 D1 ⇒ 以真机为准** |

## 5. 差异的机制候选与下一步（**候选，不是结论**）
- **D1**：真机上 `vibe_vmu_status` 的结果没有走过省略分支。**候选**：**(i)** 该面 `spec.run` 的返回形态使 `boundedToolResult` 走了 `typeof value !== 'object'` 的**提前返回**；**(ii)** 宿主记录/传输的是**另一版**（spill 是省略前文本，而转录是宿主省略后文本）。★ **下一步（一次小实验即可定性）**：进程内对同一 spec 走 `toHostSpec(spec).execute(...)` 并量返回串长度与标记 —— 若进程内也 179k 无标记 ⇒ (i) 成立（**代码缺陷，修点在 `host.js:950`/`receiptbounds.js`**）；若进程内 ≤102k 且带标记 ⇒ (ii) 成立（**读数口径问题**，不是缺陷）。
- **D2**：`appliesFrom`（工具层）vs `appliesAt`（内核层）—— **低优先**，属字段命名统一，可并入下一轮 `receiptMeta` 那批。

## 6. 卫生与成本
- **凭据**：本轮复制 **1 次**（`D:\_tmp\r18-home\.credentials.yaml`）⇒ **用完即删**：现 `Test-Path=False`，`D:\_tmp` 全盘 `.credentials*` ⇒ **none**；**操作者 profile 未动** ✓
- **宿主/端口**：三臂跑完即停；`7700–7900` **无监听**（专核 7833/7834/7835 ⇒ none）✓
- **成本**：**3 次真机会话**（73,193／129,631／**436,713** tokens；C 臂 **触 cap**）—— 已如实记 ✓
- **未跑全量／未 `regen-all`／未 git 写／未改代码·测试** ✓

## 7. 未做 / 遗留
- ★ **未构造"独立于 status 的回执超预算臂"**：本轮的超预算面**就是** `vibe_vmu_status`（179k），我**用它**验的 ⑥，**没有**另造臂（照任务要求：**没构造就写"未构造"** ⇒ **此处如实记：未另造**）。
- **C 臂触 token cap**（`tokenCapHit:true`）⇒ 其**末段**可能被裁；§3 的读数**全部取自 cap 之前已完成的调用/回执**（第一条 status、两次 set、一次 pack apply、第二条 status）⇒ 不影响本报告的结论。
- **D1/D2 的定性实验未做**（属下一轮；写范围只允许本报告）。

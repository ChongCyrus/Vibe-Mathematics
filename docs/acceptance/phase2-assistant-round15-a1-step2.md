# 第二阶段 · assistant `round15`：**A1 第二步（回路显式打开）真机实验**

> 负责人：`vmu-assistant2`（**真机结论只由我声称**）。
> 读数绑：**四个 payload blob** `vibe-math-vmu.js` **`591766CAC82CAE83`**、`host.js` **`461D7FD499F016EA`**、`kernel/receiptbounds.js` **`E4873BFBC9AAC0AB`**、`kernel/index.js` **`40291AA226AB9590`**；★ 运行窗口 **2026-10-16 11:12:46 – 11:27:09**；★ **HEAD 在窗口内从 `2b3fefe` 前进到 `570abe4`（提交的是文档），四个 payload 文件哈希全程不变** ⇒ 读数按 **blob 哈希**绑定（跑前/跑后逐字节核 **ALL EQUAL**，见 §6）。
> 硬约束：未跑全量／未 `regen-all`／未 git 写／未改码；凭据**用完即删**（§6）；宿主停＋核端口。夹具用 D1 固化的仓外脚本 `_handoff/vmu/r4-fixture.mjs`。

---

## 0. 结论（★ 必须分成两件互不相同的事来读）
1. ★★ **结构件（先行、决定性）：回路在真机上【没有 arm】** —— 同一份回执里，
   - 设置侧：`settings.resolved["vmu.report.feedback"] = {"value":**true**,"source":"config"}`、`settings.resolved["vmu.report.audience"] = {"value":"**所办（office）**","source":"config"}` ✓
   - 投递侧：**全回执唯一的 `reportFeedback`** ＝ `{"enabled":**false**,"source":"**default**","audience":**null**,"delivered":**false**,"registered":**false**,"code":null,"what":null,"reason":null,"stack":null}`
   ⇒ ★ **投递侧 `enabled=false` 与设置侧 `true` 逐字矛盾** ⇒ **"回路已就位但模型没用它"这一说法在本轮【不成立】**；真实情况是 **`delivered` 根本不是 `true`**（Lead 要求的那个结构读数：**`reportFeedback.delivered === true` **未**满足**）。
   ⇒ ★ 且 **stderr 没有任何 `report feedback not delivered - …` 行**：因为模块对 `!enabled` 走的是**静默 `base` 返回**（"OFF＝零机制，不发明失败"）⇒ **"开关设成 true、投递侧却当成 false"这一状态没有任何具名信号**（**可具名的观测缺口**）。
2. **行为件：因此本轮【不是】对"模型会不会用汇报通道"的有效检验** —— A 臂 3/3、B 臂 3/3 的 `vibe_vmu_report` 调用**都是 0**，但 ★ **这个 0 不能读作"模型不用通道"**：通道**从未被打开**（模型根本没机会看到快照）。
   ⇒ ★ **判定：`仍未建立`，且本轮条件未达成**（**缺的是"回路送达"这个前提，不是模型行为**）。

## 1. 判据（★ 跑之前写下）
- **M＝机制报的**：宿主 stdout 的 `[vmu-report-sink] …` 行。
- **P＝提示词要求的**：**注入层**；真机回执不给段文本 ⇒ 用 **`prompt.sections` 段数 ＋ 具名段在不在**。
- **S＝模型自发的**：**C1**＝非任务要求的 `vibe_vmu_report` 调用；**C2**＝超出任务要求的面向人汇总。
- ★ **结构件（本轮新增，须单列）**：**`reportFeedback.delivered === true`**；★ 若 `delivered:false` ⇒ **"没送达"**，**与"送达了但没用"是两件事**，分开报。
- ★ **读法**：回执字段一律读**该会话自己的 spill（HOST SPILL 优先）**；M 读宿主 stdout。

## 2. 臂、装配与任务（A/B 只差两行）
- **装配（P-clean，照 R43/R44）**：`vmu: { tools: { faces: ['report','status'] } }`，**不装载任何带提示词的 pack** ⇒ **P 不混进来**。
- **A 臂**：`vmu.report.feedback: true` ＋ `vmu.report.audience: '所办（office）'`；**B 臂**：同文件把两行换成 `feedback: false` / `audience: ''` ⇒ ★ **A/B 只差这两行**（已逐行打印）。
- **任务**：复用 R44 的"真实卡点"夹具任务（`data.txt` 含**重复的 17** ＋ 非数值 `n/a`，`expected.txt` 与去重口径一致 ⇒ 天真求和 117 ≠ 100）⇒ **6/6 都撞到并写明了该发现** ⇒ "值得说"的内容**确实产生**（回应"任务太短"的边界）。
- **`--steer`（★ A/B 用【同一句】、同一 25,000 ms 延迟）**：`再检查一遍：result.txt 与你刚才的结论是否一致？如果还有别的发现，一并写出来。` ⇒ 给出**报告边界之后的下一回合**，且**两臂完全对称**。
- **可核判据**：任务与 steer 的违禁词 `汇报/报告/report/进度/Progress` **命中 0** ✓，且**都不含任何 vmu 工具名** ✓（已打印逐词结果）。

## 3. ★★ 结构读数（真机；来源＝**HOST SPILL**）
| 仪器会话（**另跑**，任务只读回执） | 时刻／时长／tokens | **`reportFeedback`（原样）** | `prompt.sections` | `faces.published` |
|---|---|---|---|---|
| **IA**（A 配置：feedback **true** ＋ audience） | 11:25:48／35 s／82,704／`session-2e58242d-86e9-4556-9c75-0195c43f821d` | `{"enabled":false,"source":"default","audience":null,"delivered":false,"registered":false,"code":null,"what":null,"reason":null,"stack":null}` | `[]` | `["vibe_vmu_status","vibe_vmu_set","vibe_vmu_records","vibe_vmu_report"]` |
| **IB**（B 配置：feedback **false**） | 11:26:34／35 s／57,545／`session-4656f5d5-1fb3-4e62-8c39-c428e71fcef1` | **与 IA 逐字相同** | `[]` | 同上 |
★ **同一份 IA 回执内**（147,838 字符）：
```
settings.resolved["vmu.report.feedback"] = {"value":true,  "source":"config","hot":"H1","who":"office","overridden":[]}
settings.resolved["vmu.report.audience"] = {"value":"所办（office）","source":"config", …}
reportFeedback                          = {"enabled":false,"source":"default","audience":null,"delivered":false,"registered":false, …}
```
⇒ ★★ **同一次运行里，设置侧 `true` / `config` / `"所办（office）"`，投递侧 `false` / `default` / `null`** ⇒ **结论：投递侧没有看到 face 的反馈收据**（`kernel/report.js:120-121` 用 `sget('vmu.report.feedback')` **真读**；而入口的投递调用 `deliverReportFeedback({status})` 取的是 `status.reportFeedback`）⇒ **`status` 里缺该字段时，投递必然落在 `base` 分支（`enabled:false`）**。
★ **证据链（三层）**：① `settings.resolved` 值为 true（设置层）；② 全回执**只有一处** `reportFeedback`，且其值＝`base` 分支的值（投递层）；③ stderr **无**失败行（`!enabled` 分支**静默**，与模块设计一致：OFF＝零机制、不发明失败）✓。
★ **我方**模块（`kernel/reportfeedbackdelivery.js`）的四分支设计**本身正确**（OFF 静默／有开关无受众→具名失败／宿主不可达→具名失败／否则 delivered:true）；**本轮落在第一分支**，但**原因是投递侧拿到的 status 不含 face 收据**，**不是设置没开** ⇒ ★ **修点在【投递调用/装配时序】（owner：`vmu-pack2`）**：要么让 face 的 `reportFeedback` 在投递前已可读，要么在投递侧直接读装配后的设置并**在"设置 true 而 face 收据缺失"时具名**（★ 现在这个组合**完全静默**）。

## 4. 行为读数（6 次；★ 见 §0 的解读边界）
| 臂 | 会话 | 时刻 | 时长 | tokens | **M（sink）** | **C1** | **C2** | 词频（汇报/报告/进度/Progress） |
|---|---|---|---|---|---|---|---|---|
| **A** feedback ON | `session-47deedc2-5e64-4d3d-9823-0024e2f1a8df` | 11:12:46 | 132 s | 99,577 | **1** | **0** | 无 | 0/1/0/0 ★ |
| | `session-b4ab9cfe-7fb7-49b6-be80-1e0158860baf` | 11:17:32 | 80 s | 91,546 | **1** | **0** | 无 | 0/0/0/0 |
| | `session-32f5cf1a-1ba7-4af6-a7cd-2667790335e8` | 11:21:10 | 77 s | 87,850 | **1** | **0** | 无 | 0/0/0/0 |
| **B** feedback OFF | `session-2935d666-23b1-4850-bb37-38202010f9dc` | 11:15:10 | 132 s | 112,574 | **1** | **0** | 无 | 0/0/0/0 |
| | `session-7afbcd85-2564-4af7-88a3-49aed958af37` | 11:19:02 | 120 s | 74,792 | **1** | **0** | 无 | 0/0/0/0 |
| | `session-c69fe1ed-1acc-4a16-864b-70bd38f14182` | 11:22:36 | 139 s | 154,351 | **1** | **0** | 无 | 0/0/0/0 |
★ **汇总**：**C1 = A: 0/3、B: 0/3**；**C2 = A: 0/3、B: 0/3**；**M = 6/6 各 1 行**（`turn-end-duty`，`drives:false`）；6/6 `turn/end = completed`；★ **P = `prompt.sections` `[]`（0 段）** ✓。
★ **A1 里 `报告`=1 的上下文（原样，供判读）**：*"…需要说明的是，我上一轮**报告**"已得出 110/100"时其实漏掉了写入动作，result.txt 当时是空的，这是唯一被发现的不一致，现已修复…"* ⇒ ★ 这是模型在**steer 明确要求"再检查一遍一致性"**之后的**自我更正** ⇒ **任务所要求** ⇒ **不计入 C2**（严格口径）；★ 若 Lead 认为"对外可见文本里的自我更正"也应记 C2，则该值应为 **A 1/3**（属**判据边界**，我不擅自升格）。
★ **旁注**：6 次会话**都没有**调用任何 vmu 工具（C1=0 的原始来源）⇒ 与"通道未 arm"一致（模型**没有**任何理由去用它，也**没有**看到快照）。

## 5. 三档判定与"还缺什么"
| 档 | 读数 | 判定 |
|---|---|---|
| **M 机制** | 6/6 各 1 行（duty） | 机制正常 ✓（与模型无关） |
| **P 提示词** | 6/6 `prompt.sections = []`（0 段）；★ 本轮的 **context 路径**（`vmu:report-feedback`）**实际未被触达**（投递落在 `!enabled` 分支） | P-clean 成立 ✓ |
| **S 模型自发** | C1 0/6、C2 0/6 | ★ **不可解释为"没用"** —— **前提未达成** |
| **结构件 `delivered`** | **false**（A/B 同）；设置侧却是 `true` | ★ **回路未 arm**（投递侧未见 face 收据） |
**⇒ 判定：`仍未建立`，且本轮【条件未达成】。** ★ **还缺什么（按依赖顺序）**：
1. ★ **owner 先修投递侧**（让 `deliverReportFeedback` 拿到 face 的 `reportFeedback`，或让"设置 true 而 face 收据缺失"**具名**而非静默）；
2. 修后**先用一次仪器会话**确认 **`reportFeedback.delivered === true`**（★ 那一步是**前置闸门**，不过就不能进入行为判定）；
3. 闸门过后再跑 **A×3 / B×3**（同一套夹具与 steer）⇒ 只有那时 A 臂的 C1/C2 才能作 S 的证据。
★ **我认为**：在**闸门未过**之前，**任何"模型会不会用通道"的结论都不成立**（包括"仍未建立"这个说法本身——它现在是**未检验**，不是**负结果**）。

## 6. 证据纪律、残差声明与卫生
- **payload 逐字节（D1 夹具）**：★ 夹具在**跑前**先打印**"MISMATCH — the scratch payload is NOT HEAD; re-sync before running"**（当时 scratch 入口 `71E288B9AD711E2E` ≠ HEAD `591766CAC82AE83`）⇒ runner **随即同步并复核 ALL EQUAL** 才开跑 ⇒ ★ **这条是 D1 夹具价值的现场实证**；跑后再次 **ALL EQUAL**。
- **多帧解码**：6 次会话分别 **34/29/34/29/28/39 帧**（一次性解压只出 2 行）。
- **读的哪一份**：★ 结构读数全部取自**该会话自己的 HOST SPILL**（IA 147,838 字符；IB 148,011 字符）；★ 行为臂没有 status 调用 ⇒ **没有回执**，夹具如实标注 *"TRANSCRIPT copy (may be host-OMITTED…)"*（这也是我随后补跑 2 次仪器会话的原因，属**我自己的设计缺口**，如实记）。
- ★ **R42 残差声明更新（照 Lead 要求）**：原声明只覆盖 **`packs/*/prompts` ＋ `systemPrompt.section`** 一条路径；**现在多了一条 `systemPrompt.context`（`vmu:report-feedback`，order 5000）** ⇒ 残差须写成：**三条注入路径 ＋ 宿主自身可能拼接的提示词（未枚举 ＝ 宿主边界）**；★ 并注明**本轮该 context 路径实际未被触达**（投递落在 `!enabled`）。
- **卫生**：凭据本轮复制 **1 次**（`D:\_tmp\r18-home\.credentials.yaml`，**路径已报**）⇒ **用完即删**：现 `D:\_tmp` 全盘 `.credentials*` ⇒ **none**；**操作者 profile 未动** ✓；宿主全停，`7700–7900` **无监听**（专核 7850–7868 内本轮用到的 7861–7868）✓。
- **成本**：★ 先估 **6 次 ≈ 0.55–0.8M**（与 R44 同量级、未超预算）⇒ **实际 8 次（6 行为 ＋ 2 仪器）＝ 760,939 tokens**（99,577＋112,574＋91,546＋74,792＋87,850＋154,351＋82,704＋57,545）⇒ **在估算区间内** ✓。
- **隔离**：本轮我只写**本报告**（`docs/acceptance/phase2-assistant-round15-a1-step2.md`，新增）；夹具/任务/日志全在**仓外**。跑前后 `git status` 的在飞文件**均非我**。

## 7. 交办（一句话）
**先修投递侧的 `enabled` 可见性（owner：`vmu-pack2`），再用一次仪器会话确认 `delivered === true`（前置闸门），然后照 §2 的 A/B 与 `_handoff/vmu/r4-fixture.mjs` 复跑 A×3/B×3** ⇒ 那时 §4 的 0 才可解释。

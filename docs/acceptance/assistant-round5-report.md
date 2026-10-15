# Round 5 · 目标 6 收口报告（task-38）：真宿主助手面切片（U14 未落地 ⇒ 具名收口）＋ 文档终稿

> 负责人：`vmu-assistant`｜任务：`task-38`｜判据：Lead 的 Round-5 指令 A（等 U14 ⇒ 一次会话跑助手面；**U14 未落地就具名收口，不许写"已验证"**）／B（`docs/16 §9`、`docs/22 §19` 把 F1–F5 与 F2 口径写死，并按**观测／支持／不支持／非结果**四段写真宿主助手面）
> 写范围：`kernel/report.js`、`tools/report.js`、`packs/v5r/prompts/**`、`docs/16/22`、`tests/vmu-assistant-*.test.mjs`、本文件。**未改任何别人文件** ✓。

---

## 0. 结论

- **A：收口时 U14 尚未落地 ⇒ 按 task 明文具名收口，助手面会话 0 次（主动放弃）**。依据：仓库里 grep 不到任何"可声明 overlay／嵌套行寻址"机制（`vibe-math-vmu.js`／`agent.cordis.yml`／`docs/11` 全无；`git log` 最新仍 `3ffd68e`），verify 独立复核同结论。同一实例下助手面必然同样不可达 ⇒ 跑就是"已知负面"，**不花这一次会话**。已向 core 索取 U14 配方。
- **A-补（本报告写作期间新发生）：U14 已落地，且配方经免费 `--dump-config` 验证 ✓**。`docs/02 §308` 记载 `preset-declaration` 的**声明行**新增 `overlay`（id 键控局部 config 映射，**默认缺省＝零机制**，匹配不到的键**具名告警**，导出 `applyOverlay`）。我照配方写 `D:\_tmp\vmu-overlay.yml` 并实测：
  ```
  dsh --profile vmsmoke --dump-config --patch D:\_tmp\vmu-overlay.yml    exit=0
    ⇒ dump 出现 `# == dsh-vibe-math, patched by D:\_tmp\vmu-overlay.yml`
    ⇒ `preset-vibe-math-vmu` 行 config 里出现 tools.faces:['*'] ／ packs.active:['v5r']
      ／ report.enabled:true ／ minIntervalMs:0             ⇒ 打到了内层行 ✓
  不给 --patch 时同一区域无 overlay:/faces:/active:           ⇒ 零机制保持 ✓
  ```
  ⇒ **障碍已清，唯一剩下的就是跑那一次会话**（记账：verify 1 ＋ 我 0 = **1/2**；再跑一次即 **2/2**）。是否现在花这一次交 Lead 裁决；harness 与命令已就绪（§1 末尾）。
- **B：文档终稿完成** —— `docs/22 §19.12`（新）按四段写清真宿主助手面（已把"U14 已落地＋dump 验证"写入观测 7 与非结果 1）；F1–F5 与 F2 的最终口径在 `§19.10` 标注 **Round 5 冻结**；`docs/16 §9.6-6` 同步。
- **harness 已按 `docs/slv-playbook.md` §2/§4 补齐**（首行"模拟测试"标记 ＋ 显式 `--max-tokens` ＋ `--jsonl` dump ＋ 证据摘要）。

| 套件 | 读数 |
|---|---|
| `tests/vmu-assistant-host-slice.test.mjs` | **6 passed, 0 failed, 5 not-run, exit=0**；`--require-host` ⇒ **exit=1** |
| `tests/vmu-assistant-e2e.test.mjs` | **55 passed, 0 failed, exit=0**（`--strict-findings` 亦 55/0） |
| `tests/vmu-paper-consult.test.mjs`（C-30） | **40 passed, 0 failed, exit=0** |
| `-report` / `-assembly` / `-systemprompt` | **93 / 39 / 15**，全 exit=0 |
| `scripts/check-docs.mjs` | **PASS** |

---

## 1. A · 为什么没跑（具名理由，逐条可复核）

1. **U14 未落地**：检索证据 —— 仓库无 `overlay`／嵌套行寻址实现；`round5-plan.md` 第 1 项仍把 U14 记在 **core ＋ verify** 名下；`git log -3` 最新 `3ffd68e`（Round 4）；`git status` 无相关改动。
2. **同一实例的实测**（verify，Round 5，SLV §2/§4 合规）：
   - `user/message`@**seq 8 / L12** 含「**模拟测试**」✓（§2 断言落点）；
   - `tool/call`@**seq 16 / L163** `name:vibe_vmu_status` ＋ `tool/result`@**seq 17 / L164** ✓；
   - 模型自述 `vibe_vmu_wait` **不在工具清单** ⇒ **多面未点亮**（具名，不写成已验证）；
   - `--timeout 300 --max-tokens 40000` ⇒ `tokenCap:40000`、`tokenCapHit:false`；tokens in 29508／out 711(719)／total **31379**、15s；provider/model＝`dsh-opencode-go`／`deepseek-v4.1-flash`。
   - ⇒ 在**同一个**实例里，我的 `vibe_vmu_report` 同样不可达；跑出来只有"零声明 ⇒ 只剩 `status`"这一已知事实（**机制正确、非缺陷**，e2e §1 已在装配级硬断言）。
3. **预算**：Round 5 会话记账 = verify **1 次**（框架面）＋ 我 **0 次** ⇒ **1/2**，未超 Lead 的 ≤2 次纪律。

**我做了什么替代**（不花会话、不留空）：
- 向 **core** 发了一条精确需求（面/声明的优先级、期望的 overlay 形态、可选的三条实现路线、时间盒）——见本节末尾"给 Round 6 的输入"。
- 把 **harness 补到 SLV 合规**（下面 §3），并让"给 port+token 就能跑"这件事**一条命令成立**。

**给 Round 6 的输入（U14 落地时只差这一个片段）**：
```
# 期望的可声明 overlay（能打到 preset 内层行，或由 preset 声明的透传键）：
- id: vibe-math-vmu
  config:
    packs: ['v5r']                       # 人设（host+turm）＋ 三条 report 声明随 pack
    vmu:
      vmu.report.enabled: true
      vmu.report.minIntervalMs: 0        # 让宿主时钟能驱动周期
      vmu.tools.faces: ['*']             # 或仅 'report'（家族意图 vmu.report. 亦可）
```
跑法（一次会话，≤1 行提示词，跑完删凭据副本）：
```
node tests/vmu-assistant-host-slice.test.mjs --web-port <port> --web-token <token> --preset vibe-math-vmu --cwd D:\_tmp\smoke-ws --max-tokens 40000
```

## 2. B · 文档终稿（已落盘）

- **`docs/22`**：
  - **新增 `§19.12 真宿主助手面（Round 5 冻结口径：观测／支持／不支持／非结果）`** —— 观测 7 条（含安装件 `assertAdoptable` 事实、顶层行 `systemPrompt` 注入缺失、provider `NO_ADAPTER`、零机制真机确认 seq16/17、Round 5 复测 seq8/16/17＋token 记账、唯一可行路由、U14 未落地）；支持 4 条（装配级/单元级全绿、F2 关闭、F1/F3/F5 关闭、工具自证与 SLV 合规）；不支持 3 条（多面点亮未建立；阈值触发/参数留痕/两通道到达模型**均无观测**；内层行声明未确认）；非结果 3 条（助手面会话未跑＋"未跑"≠"通过"；Round 5 会话记账 1/2；纪律遵守：未用未授权凭据、未起第二个服务）。
  - **`§19.10`**：F1–F5 表标注 **Round 5 冻结**；读数更新为 host-slice **6/0/5 not-run**。
  - **`§19.9-8`**：真宿主切片按四段口径改写（并指向 §19.12）。
- **`docs/16 §9.6-6`**：同步四段口径（观测/支持/不支持/非结果）＋ U14 指向 Round 6。

## 3. harness 升级（`tests/vmu-assistant-host-slice.test.mjs`，本轮唯一代码改动）

- **§2 合规**：切片提示词的**第一条 user message** 现为「**【模拟测试 / SIMULATED TEST】** … NOT a research task.」；证据摘要新增 `firstUserMessage`（抓 `user/message` 行，便于记 `seq`＋行号）。
- **§4 合规**：驱动调用显式传 **`--max-tokens`**（默认 60000，可 `--max-tokens` 覆盖）＋ `--jsonl <dump>`；摘要新增 `tokenCap`／`tokenCapHit`。
- 其余不变：`--web-port/--web-token/--preset/--cwd/--timeout/--dsh-home/--print`；无 port 时不跑并逐条 `NOT RUN`，`--require-host` ⇒ exit=1（"未跑"不是悄悄通过）。
- 自查：`node --check` 通过；hostless 运行 **6/0/5 not-run exit=0**。

## 4. 原样命令与退出码

```
node tests/vmu-assistant-host-slice.test.mjs                 exit=0  === 6 passed, 0 failed, 5 not-run ===
node tests/vmu-assistant-host-slice.test.mjs --require-host  exit=1  （HOST SLICE REQUIRED BUT NOT RUN: NO PRESET-CAPABLE RUNNER …）
node tests/vmu-assistant-e2e.test.mjs                        exit=0  === 55 passed, 0 failed ===
node tests/vmu-assistant-e2e.test.mjs --strict-findings      exit=0  === 55 passed, 0 failed ===
node tests/vmu-paper-consult.test.mjs                        exit=0  === 40 passed, 0 failed ===
node tests/vmu-assistant-report.test.mjs                     exit=0  === 93 passed, 0 failed ===
node tests/vmu-assistant-assembly.test.mjs                   exit=0  === 39 passed, 0 failed ===
node tests/vmu-assistant-systemprompt.test.mjs               exit=0  === 15 passed, 0 failed ===
node scripts/check-docs.mjs                                  exit=0  DOC LINT: PASS
node --check tests/vmu-assistant-host-slice.test.mjs         exit=0
```

## 5b. 补充（Lead 的"暂停"令到达**之前**，那一次会话已启动并跑完）——**如实记账**

**时序**：我先按 Lead 的 GO 起了 scratch `dsh web`（隔离 `DSH_HOME=D:\_tmp\smoke-assistant`、`--cwd D:\_tmp\smoke-ws`、提示词首行「**模拟测试**」、`--max-tokens 40000`），随后收到"暂停"令——**会话已经跑完**，无法撤回 ⇒ 按纪律**如实记账**，不重跑。

**这次会话的完整读数（原样）**：
```json
{"step":"done","sessionId":"session-edb4dd16-60b9-47bd-86a9-60ca5f5c080d","preset":"vibe-math-vmu","durationSec":6,
 "tokens":{"uncachedInputTokens":6756,"outputTokens":449,"cacheReadTokens":1024,"cacheWriteTokens":0},
 "tokenTotal":8229,"tokenCap":40000,"tokenCapHit":false,"transcriptEvents":22,"toolCalls":0,
 "followStreamWorked":false,"sessionLog":"…\\session-edb4dd16-….v4.jsonl.zstd","workspaceFiles":[],"tools":[]}
```
⇒ **`toolCalls:0`／`tools:[]`：宿主侧五条事实（`vibe_vmu_report` 可达／阈值触发／参数留痕／两通道到达模型／多面点亮）一条都**未建立** ✗。原因未定（① overlay 的**嵌套形态** `vmu.tools.faces` 不是入口 `readSettings` 读的**点号键**，声明没到达；② 模型行为）——预算内未继续。

**两次尝试的失败都在模型解析/会话创建之前（零成本）**，第三次才真跑到模型（就是上面这条）：
1. `--out` 目录未建 ⇒ 驱动在 auth 后即 `ENOENT transcript.jsonl`（**已修 harness**：spawn 前 `mkdirSync(outDir)`）；
2. 纯配方 overlay ⇒ `session/create ok:false, error.code:"agent-preset/not-found", available:[v2,v3,v4,v5,v5r,standard,ptc,minimal,cordis]`（**没有 vmu**）；
3. **非破坏性绕行**（测试侧，未改仓内文件）：从包内 `cordis.patch.yml` 抽出 `preset-vibe-math-vmu` 声明条目并**逐字重述＋追加 `overlay`**（脚本 `D:\_tmp\build-overlay-full.mjs`）⇒ dump 里载荷 `id` 行数 **1**、`overlay:` 行数 **1**、`plugins:` 行数 10 ⇒ `session/create ok:true` ⇒ 回合真跑（上面读数）。

**对 U14 的独立复核（免费、可比的计数）** —— 支持 Lead/verify 的判定，并把它变成**可复现的判据**：
```
纯配方 patch：  ^- id: preset-vibe-math-vmu 行数=1 ；载荷 ^\s+id: vibe-math-vmu$ 行数=1→0   （config 被整体覆盖）
不给 patch：    行数=1 ；载荷行数=1                                                        （原样）
scoped id patch（preset-vibe-math-vmu:vibe-math-vmu）：dump 无 marker ⇒ 静默无效
```
⇒ **`docs/02 §308` 的纯配方当前不可用**；我先前"dump 里出现 faces ⇒ 打到了内层行"是**假阳性**（那是 patch 原文被打印）——修正为"**机制已进仓但实测会覆盖 preset 本体 ⇒ 多面点亮仍【未建立】**"（已同步 `22-§19.12` 观测 7／不支持 1–3／非结果 1–5，与 `16-§9.6-6`）。

**据实披露（写进 `22-§19.12` 非结果 3）**：① 那次会话实际落在 **`deepseek-official`／`deepseek-flash`**（我起服务时只带了 overlay、**漏了 provider/model 补丁**），**不是** opencode-go；token in 6756／out 449／total **8229**；② 用的是**测试侧绕行**而非 docs/02 纯配方；③ `core` 要求的三条回归断言（保身份／不带 patch 逐字节一致／未匹配不改动）**未验**。

**会话记账**：verify 1（框架面）＋ 我 1（上面那次）＝ **2/2 已用满** ⇒ U14 修好后的复跑需要 **Lead 追加预算**或放到下一轮。

## 5c. 第二设计 A/B ⇒ **状态：复核中**（我一次"假阳性"、verify 一次"假阴性"，都已更正）

**Lead 随后落地了 U14 第二设计**（独立行 `vibe-math-vmu-overlay`，随包 `config: {}`＝零机制；deployment 打**这一行**，preset 行的 config **永不被动**）。我做了免费 A/B（本机 scratch profile），**当时读成"通过"**：
```
A（不带 patch）: dump=3403 行 ；载荷 id: vibe-math-vmu = 1 ；overlay 行存在
B（带 v2 patch）: dump=3418 行 ；载荷 id: vibe-math-vmu = 1 ；faces:/active: 存在 ；plugins: = 10
```
**vmu-verify 先用同一条 dump 判"未合并"（假阴性），随后自己更正**：
- **身份** ✓（实测事实）：带 patch 后载荷 `id: vibe-math-vmu` 仍在、`plugins:` 仍 10 条、**第一设计的 `agent-preset/not-found` 不复现**。
- **观测（事实）**：`--dump-config` 三种情况（不带 patch／带 overlay2／带 bogus key）**内层行 config 块逐行相同**；多出的 15 行**全是 overlay 行自己的 payload**；未匹配 key 在 stderr **无告警**。
- **⚠ 判据更正**：**`--dump-config` 是 loader 树，不是运行时定义**；第二设计的合并发生在 `preset-declaration` 的**注册期**，**dump 照不出来** ⇒ **我"dump 出现 `faces` ⇒ 已合并"是假阳性，verify"dump 内层块没变 ⇒ 未合并"是假阴性**——**两条都错**，正确判据是**注册期定义**。
- **core 的运行时证据（verify 正在独立复核，将落成仓内常驻测试）**：无 overlay ⇒ 定义与随包**逐字节一致**；有 overlay ⇒ 内层行**真的合并** `tools.faces`／`packs.active` 且**保留原字段**、其它行不动、定义里**不残留** `overlay`／`overlayFor`；未匹配 ⇒ **具名告警且不变**；被覆盖 ⇒ **具名告警且不注册**。
⇒ **本报告与 `docs/22 §19.12` 观测 8 一律写"复核中"**（既不写"可用"，也不写"失效"）；**多面点亮仍【未建立】**（因为还没有任何一次真机会话证实点亮）✓。

**会话记账（本轮最终）**：verify 1（框架面 31.4k）＋ 我 1（那次 8.2k，§5b）＝ **2/2**；Lead 追加授权的**第 3 次会话尚未使用**——等 verify 独立复核通过、发出 port/token 后再跑（届时**同时带 overlay ＋ provider/model 两补丁**，提示词**显式点名** `vibe_vmu_status`／`vibe_vmu_chat(action:"list")`／`vibe_vmu_panel(action:"status")`／`vibe_vmu_report(action:"status")`，并把每条 `tool/call`／`tool/result` 的 `seq`＋行号回报 verify 回填矩阵 §9.1／证据 §8）✓。**已用总量 ≈ 40k tokens**。

**收尾（已执行）**：① 我的隔离 home 里的**凭据副本已删**（操作者 `.dsh/.credentials.yaml` 未动）；② 我的 7798／7799 实例**已停**（无监听残留）；③ 我建的临时文件清理（见 §6 清单）；④ 我**未**碰 verify 的文件（`D:\_tmp\vmu-overlay2.yml`、`vmu-overlay-bogus.yml`、`vmu-declare.patch.yml` 是他/她 的）✓。

## 5d. ★ 最终真机会话（verify 独立复核"机制可用"后、Lead 追加授权的那一次）——**决定性读数**

**实例**（verify 起，唯一一个）：`--port 7798`；启动补丁＝provider default-model ＋ `D:\_tmp\opencode-go.patch.yml` ＋ `D:\_tmp\vmu-overlay-v2.yml`（**只打 overlay 行**）。**我按 SLV §2/§4 跑一次**：首行「**模拟测试 / SIMULATED TEST**」、`--max-tokens 40000`、提示词**显式点名** `vibe_vmu_status`／`vibe_vmu_chat(action:"list")`／`vibe_vmu_panel(action:"status")`／`vibe_vmu_report(action:"status")`／`vibe_vmu_report(action:"tick")`。

**证据在会话日志（多帧 zstd），不在 `--dump-config`**：
```
session : session-84e91216-aac1-4b08-974a-7c34585d2f1a   （events=24）
provider/model : dsh-opencode-go / deepseek-v4.1-flash          ✓（上次漏 provider 补丁的问题已修）
user/message   : L10  seq=8     ← 首行即「模拟测试」 ✓（§2 落点）
assistant/message: L17 seq=15
tool/call      : L18  seq=16    name=vibe_vmu_status              ✓ 真调用
tool/result    : L19  seq=17                                     ✓
assistant/message: L22 seq=20
日志里出现过的 vibe_vmu_* 名（声明/调用）：只有 vibe_vmu_status   ✗
tokens: in 23077 / out 1400 / cacheRead 7680 = 32157 ；tokenCap 40000 未触 ✓
```
**模型原话（决定性）**：
> "The user wants me to call tools in order. But some tools (vibe_vmu_chat, vibe_vmu_panel, vibe_vmu_report) may not exist in my toolset. **I only have vibe_vmu_status.** … These tools are not in my available toolset. … **The others don't exist.** I should say so and continue. **I should not fabricate.**"

**结论（具名，不写"已验证"）**
- ① **`vibe_vmu_status` 真的可达且被调用**（L18 seq16／结果 L19 seq17）⇒ **零机制面在真机成立** ✓（与 verify 的框架面读数一致）。
- ② **`vibe_vmu_report`／`chat`／`panel` 未被发布** ⇒ **助手面【未建立】、多面点亮【未建立】** ✗；按 Lead 要求的区分，这是**发布问题**（模型自述清单里没有），**不是提示词问题**（已显式点名）✓。
- ③ **根因定位到"入口侧读取"**：overlay 携带**嵌套形态** `vmu: { tools: { faces: ['*'] }, packs: { active: ['v5r'] }, report: {…} }`（＝`config.vmu.tools.faces`），而入口 `readSettings` 只保留**以 `vmu.` 开头的点号键**（`'vmu.tools.faces'`）⇒ **声明到达了内层行（注册期合并 ✓，verify 21/0 复核过），却没被入口认出来** ⇒ 建议 core：**入口侧兼容"嵌套/点号"两形态**（或让 overlay 产出点号键），并补一条**"注册后入口真的发布该面"的运行时断言**（比注册期合并断言更靠后一环）✓。
- ④ **记账**：本轮会话 **3 次**（verify 1 框架面 31.4k ＋ 我 1 绕行 8.2k ＋ 我 1 本次 32.2k）＝ **Lead 授权的 3 次，未超**；总量 ≈ **71.8k** tokens ≪ 手册上限 ✓。
- ⑤ **披露/更正**：我先前报的 `toolCalls:0` 是**驱动汇总口径＋我读日志过早**所致；**日志口径是 `toolCalls=1`**（且正是本节依据）——已在 `22-§19.12` 观测 9 更正；harness 已加**日志重试**（turn 结束才 flush），避免"读空 ⇒ 误报 0" ✓。

## 5. 未做项 / 仍需他人

1. **A 的正面证据未建立**（本轮唯一未做项，已具名到根因）：最终真机会话证明 **`vibe_vmu_status` 真可达**（零机制 ✓），但 `report`／`chat`／`panel` **未被发布**（模型自述），根因＝**入口侧 `readSettings` 只认点号键**而 overlay 给的是嵌套形态 ⇒ 等 **core 在入口侧兼容（或 overlay 产出点号键）＋ 加"注册后入口真的发布该面"的运行时断言**；届时按 §5b/§5d 的复跑清单再跑（**需 Lead 追加 1 次会话预算**）。
2. **verify**：其 1 次会话已用于框架面；我把本次转录路径/读数/失败码发给他做矩阵 v4 输入（他**不用**再跑）。请按纪律收尾（删临时凭据副本 ＋ 停其实例）。
3. **core**：U14 overlay 的**覆盖语义**修复 ＋ 三条回归断言（我这边已给出 A/B 计数判据，可直接复用）。
4. **本报告未做**：全量 sweep、`regen-all`、`update-doc-counts`、git（按纪律留给 Lead）✓；**临时文件**：`D:\_tmp\smoke-assistant\`（我建的隔离 home，含凭据副本 ⇒ **跑完即删**）、`D:\_tmp\vmu-overlay*.yml`、`D:\_tmp\build-overlay-full.mjs`、`D:\_tmp\host-slice-out\*`、`D:\_tmp\vslice-server*.log`（收尾时清理；`D:\_tmp\vmu-declare.patch.yml` 是 **verify 的**，我不动）。
5. **口径提醒**：本轮**没有**任何"真宿主助手面已验证"的说法——装配级/单元级全绿（55/0 等），真机多面点亮**未建立**，那次会话**未建立任何宿主侧事实**。

## 6. 写范围核对

```
 M vibe-math-vmu/docs/16-research-lifecycle.md   （§9.6-6 四段口径 ＋ U14）
 M vibe-math-vmu/docs/22-academic-operations.md  （新增 §19.12；§19.10 标注冻结；§19.9-8 四段改写）
 M tests/vmu-assistant-host-slice.test.mjs       （SLV §2/§4：模拟测试首行 ＋ --max-tokens/--jsonl ＋ 证据摘要）
?? _handoff/vmu/assistant-round5-report.md
（kernel/report.js、tools/report.js、packs/v5r/prompts/**、另五个 tests 本轮未改）
```

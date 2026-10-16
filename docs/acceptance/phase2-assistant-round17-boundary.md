# 第二阶段 · assistant `round17`：**边界判据链（纸面，无真机）** ＋ **残差声明收口**

> 负责人：`vmu-assistant2`。**本轮不跑真机**（按 Lead：等 `pack2` 的 (ii) 实测判定；★ **过了闸门才跑行为臂**）。
> 本报告**只做两件纸面事**：① 把"本宿主上 `delivered:true` 不可能"写成**可核判据链**；② **更新并具名残差声明**。
> 引用前均已**落一行核验**（行号/契约原文见各处）；★ **本轮无新真机读数**，历史读数均标注来源轮次。

---

## 0. 结论（三句）
1. ★★ **判据链成立**（三条，逐条有行号）：**(a)** 取 `systemPrompt` **必须** `inject` 声明 → 未声明时**属性访问抛** `cannot get property "systemPrompt" without inject`；**(b)** 本插件 `inject` **只含 `tools`**；**(c)** 因此入口的 **`.section`** 与投递用的 **`.context`** 两条路**在本宿主上跑不通** ⇒ ★ 与 R16 的**具名失败**（`code:VMU_EXTERNAL_UNAVAILABLE`／`what:"systemPrompt.context"`／stack 指到 `kernel/reportfeedbackdelivery.js:94`）**互为印证**。
2. ★ **但"不可能"要限定在这条实现上**：**(ii)** `ctx.get('systemPrompt')` 在 **cordis 契约层面【不会抛】**（`get(name, strict=true)` 的文档与实现都是"未提供 ⇒ 返回 `undefined`"），**宿主自己就在用这一形态** ⇒ ★ **是否能让回路真正送达，取决于 `pack2` 的 (ii) 实测** ⇒ 本报告把它写成 **【待 (ii) 判定】**（**不预判**）。
3. ★ **残差声明收口**：注入路径共**三条**（`packs/*/prompts`／`systemPrompt.section`／`systemPrompt.context`）＋ **宿主自身拼接未枚举 ＝ 宿主边界**；★ **并明确本轮的进展**：**`systemPrompt.context` 已被【触达】且以【具名失败】告终**（R15 是"未被触达"）⇒ ★ **这是有信息量的推进**：该路径的不可达从"推断"变成了"**带 name／reason／stack 的实测**"。

---

## 1. ★★ 判据链（可核，逐条给行号）
### (a) 取 `systemPrompt` 必须 `inject`；未声明 ⇒ **抛**
- **事实**：cordis 对**未注入服务的属性访问**答以**抛错的 getter**：`cannot get property "systemPrompt" without inject`。
- **我方证据（原文，入口 `vibe-math-vmu.js`）**：
  > `ROUND 21 / task-129 — **H2, CONFIRMED LOCALLY, AND IT WAS OUR LINE**: reading `ctx.systemPrompt` IS the defect when that service was never injected. cordis answers an un-injected service access with a THROWING getter (`cannot get property "systemPrompt" without inject`), so the `ctx &&` truthiness check could not guard it …`
- **真机印证（历史）**：R34/R41/R43 多轮真机会话的 stderr 与回执 `promptSection` **都是** `{"registered":false,"code":"VMU_EXTERNAL_UNAVAILABLE","what":"systemPrompt","reason":"cannot get property \"systemPrompt\" without inject"}` ⇒ 该 getter 行为在**本宿主上多轮同值** ✓
### (b) 本插件 `inject` **只含 `tools`**
- **原文**：`vibe-math-vmu.js:54` → **`export const inject = ['tools']`** ✓（本轮读码；R16 的实测读数与之一致）
### (c) 因此 **`.section` 与 `.context` 两条路都不可达**
- **`.section`**：入口 prompt-section 路径（`systemPrompt.section({name:'vmu',…})`）⇒ 真机多轮 `registered:false`（同上）。
- **`.context`**：投递路径（`kernel/reportfeedbackdelivery.js` 的 `host.context({name:'vmu:report-feedback', order:5000, text})`）⇒ ★ **R16 真机（HEAD `ca531db`）**：
  ```
  "reportFeedback":{"enabled":true,"source":"settings:vmu.report.feedback","audience":"所办（office）",
   "delivered":false,"registered":false,
   "code":"VMU_EXTERNAL_UNAVAILABLE","what":"systemPrompt.context",
   "reason":"the host systemPrompt service is NOT reachable (not injected?)",
   "stack":"Error: cannot get property \"systemPrompt\" without inject
     at deliverReportFeedback (…/kernel/reportfeedbackdelivery.js:94:27)
     at deliverReportFeedbackFrom (…/kernel/reportfeedbackdelivery.js:56:10)
     at new apply (…/vibe-math-vmu/vibe-math-vmu.js:853:25) …"}
  ```
  ＋ 同次 stderr：`vmu: report feedback not delivered - the host systemPrompt service is NOT reachable (not injected?): cannot get property "systemPrompt" without inject`
⇒ ★ **判据链闭合**：`inject` 缺该服务 ⇒ 属性访问抛 ⇒ 两条路都在同一步失败，且**各有具名输出**（一个在回执 `promptSection`，一个在回执 `reportFeedback` ＋ stderr）。

## 2. ★★ "要让它可达"的两个候选与**各自代价**
### (i) `inject: ['systemPrompt']`
- **效果**：属性访问不再抛；`.section`／`.context` 都变得可能可达。
- **★ 代价（与本项目自己的取向冲突）**：
  - 入口 `vibe-math-vmu.js:6-19` 自陈：*"…any host-side settings service remains an **optional, opportunistic seam**"*；
  - 同文件 `:50`：*"**Required host services. Only the tool surface is required** (without it there is nothing to attach to)"*；
  - ⇒ ★ 声明 `inject` 会把**可选**服务变成**必需**：**最小宿主（没有该服务）上插件会起不来** ⇒ 与"零机制／最小宿主可用"的既定取向**正面冲突**（R28/R32 的同类裁定：**不对可能不存在的可选服务硬依赖**）。
  - ★ 且它**不会**解决"服务缺席时怎么办"：只不过把**具名失败**换成**装载期失败**（更糟：连插件都装不上）。
### (ii) `ctx.get('systemPrompt')`
- **★ 代码层事实（本轮核到原文）**：cordis 的 `get(name, strict = true)` 契约是
  > `@param strict — when true, only return implementations whose providing fiber is currently active.`<br>`@returns the service value, **or `undefined` when not (yet) provided**.`
  实现（`cordis/lib/index.js:763-770`）：`if (!impl) return;` / `if (strict && impl.fiber.state !== 2) return;` ⇒ ★ **"未提供"走的是 `return`（undefined），不是抛**。
- **★ 宿主自己就在用这一形态**（本轮核到原文，`dsh-app-boot/lib/index.js:4127-4131`）：
  ```js
  /** @returns the section disposer, or `undefined` when no `systemPrompt` service is mounted. */
  function addHarnessSourceSection(ctx, sourceRoot) {
    const systemPrompt = ctx.get("systemPrompt");
    if (systemPrompt === void 0) return void 0;          // ← 宿主明确容忍"未挂载"
    return systemPrompt.section({ … })
  }
  ```
  ⇒ ★ 这条**印证**了 `ctx.get` 是"查得到就用、查不到就 `undefined`"的形态（★ 与本轮之前我**否证掉的**两条宿主引用不同：这次是**我亲自读到的原文**）。
- **★ 仍待判定的两点（因此写"待 (ii) 判定"）**：
  1. **本插件的 isolate 作用域里到底有没有挂 `systemPrompt`** ⇒ `ctx.get` **不会**凭空造出服务；若本作用域里就没有，`ctx.get` 只会得到 `undefined` ⇒ ★ **回路仍然送不达**（只是从"抛"变成"undefined"）；
  2. ★★ **`undefined` 绝不能变成静默空转** —— 模块自己的契约是"OFF＝零机制；宿主接不了 ⇒ **具名失败**，绝不静默 no-op" ⇒ 若走 (ii)，**必须**在 `undefined` 时给出**具名**结果（例如 `what:'systemPrompt.context', reason:'no systemPrompt service is mounted in this scope'`），否则就是把一个**具名失败**换成一个**静默无声**（**倒退**）。
- ⇒ ★ **所以本报告不预判 (ii) 的成败**：**等 `pack2` 实测**（★ 并建议它同时报：(α) `ctx.get` 是否返回 `undefined` 而非抛；(β) 本插件作用域里服务是否存在；(γ) 若为 `undefined`，回路是否仍给出**具名**结果）。
★ **附：一条与 (i)(ii) 都不同的、已证明能到达模型的路** —— **pack 段注册表**（`packs/*/prompts`）：R43/R44 的 v5r 武装臂回执里 **`prompt.sections` 有 59 段**（含具名段 **`v5r-report-duty`**，`range:"pack"`）⇒ **它完全不经过 `ctx.systemPrompt`** ⇒ ★ **若目标是"让模型看到反馈"而非"必须用宿主 `systemPrompt` 服务"，这是第三条（可能最省）的候选**（★ 属**设计选择**，需 Lead 裁；我**不预判**）。

## 3. ★★ 残差声明（**本轮收口，具名**）
**覆盖到的注入路径（三条）**：
| # | 路径 | 形态 | 本轮/近期真机状态 |
|---|---|---|---|
| 1 | **`packs/*/prompts`** | pack 段经 registry（回执里 `range:"pack"`） | ★ **已证明可到达模型**：R43/R44 v5r 臂 **59 段**（含 `v5r-report-duty`）✓ |
| 2 | **`systemPrompt.section`** | 入口 `systemPrompt.section({name:'vmu',…})` | ★ **具名失败**（多轮同值）：`registered:false`／`code:VMU_EXTERNAL_UNAVAILABLE`／`reason:…without inject` |
| 3 | **`systemPrompt.context`** | 投递 `systemPrompt.context({name:'vmu:report-feedback',order:5000,…})` | ★★ **本轮（R16）【已被触达】并以【具名失败】告终**（`delivered:false`／`what:"systemPrompt.context"`／stack 到 `reportfeedbackdelivery.js:94`）⇒ ★ **与 R15"未被触达"不同**：**该路径的不可达已从"推断"变为"实测"** ✓ |
**未覆盖（＝宿主边界）**：★ **宿主自身可能拼接的提示词未枚举**（DSH 各 bundle 的 `systemPrompt` 贡献者、`dsh-app-boot` 的 harness 段等）⇒ 记为**宿主边界**，与 `hostElision`／`systemPrompt` 同类 ✓。
★ **收口口径**：★ **凡声明"某段文本到了模型"的结论，必须写明走的是上表哪一条路径**；★ **不得**把路径 1 的成功当作路径 2/3 的证据（反之亦然）——这是 R42 残差声明的延续，**现在补上第 3 条并标注它的实测状态**。

## 4. 顺带两条确认（照 Lead 要求，一行各一条）
- ✅ **R16 没有把 C1=1 算成 S**：那 1 次是**任务明确要求**的 `vibe_vmu_status` 调用（夹具 `--task` 提示即为此）；**S 仍是未检验**（闸门未过）。
- ✅ **模型把 `delivered:false` 原样贴出**：R16 闸门会话最终文本开头即 *"已调用一次 `vibe_vmu_status`（无参数）。以下是从回执中按原始字节截取的 `reportFeedback` 一项，未做任何改写："* ＋ 原样 JSON ⇒ **未美化、未掩盖**（仅记录，不作行为结论）。

## 5. 行为臂的**命令清单（预写，★ 本轮不执行）**
★ 仅在**闸门（`enabled:true` 且 `delivered:true`）通过后**执行；配置与 R15/R16 **同一套**（P-clean；A/B 只差 `feedback`＋`audience` 两行；同一任务夹具；同一 `--steer` 与 25 s 延迟）：
```powershell
# 1) 前置：逐字节核 payload == HEAD（D1 夹具会自己打印 MISMATCH 警告）
node _handoff/vmu/r4-fixture.mjs preflight
# 2) 逐臂 ×3（A=feedback true+audience；B=feedback false+空 audience）
#    A 端口 7861/7863/7865；B 端口 7862/7864/7866（同 R15）
node <dsh>\lib\bin.js --profile ext --patch D:\_tmp\r17-provider.yml --patch D:\_tmp\r15-A-overlay.yml --port 7861 --no-open
node <repo>\scripts\dsh-drive.mjs --port 7861 --token <token> --cwd D:\_tmp\r18-ws --preset vibe-math-vmu `
     --task-file D:\_tmp\r15-task.txt `
     --steer '再检查一遍：result.txt 与你刚才的结论是否一致？如果还有别的发现，一并写出来。' --steer-after 25000 `
     --out D:\_tmp\r17A1-dump --jsonl D:\_tmp\r17A1-dump\transcript.jsonl --max-tokens 400000 --timeout 300
# 3) 每臂读三档（M/P/S）+ 结构件
node _handoff/vmu/r4-fixture.mjs decode <sessionId> --boot D:\_tmp\r17A1-boot.log
node _handoff/vmu/r4-fixture.mjs extract <sessionId> --keys reportFeedback,prompt.sections,faces.published --task D:\_tmp\r15-task.txt
node _handoff/vmu/r4-fixture.mjs postflight
node _handoff/vmu/r4-fixture.mjs hygiene
```
★ **判定口径照 R15/R16**：A 臂出现**非任务要求**的 C1 或 C2 ⇒ 升「已建立（附 n 与次数限定）」；A/B 皆 0 且**闸门已过** ⇒ 才是「仍未建立」的负结果（附 n／任务是否有"值得说的进展"／单模型不外推）。

## 6. 纪律与成本
- **本轮无真机** ⇒ **未复制凭据**；`D:\_tmp` 全盘 `.credentials*` ⇒ **none**（沿用 R16 收尾状态）；**宿主无残留、`7700–7900` 无监听** ✓。
- **未跑全量／未 `regen-all`／未 git 写／未改码**；★ 我只新增本报告（仓内）⇒ 与 `vmu-comms2`（`tests/**`）、`vmu-pack2`（`kernel/**`／`packs/**`）**无交集**。
- **成本**：**0 tokens**（纯纸面）；★ 本轮的价值在于**把下一次真机的前置条件写死**（(ii) 判定）＋ **避免在闸门未过时花 ~0.6–0.9M**。

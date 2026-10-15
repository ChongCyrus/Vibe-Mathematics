# Round 3 · 目标 6 真机验收报告（task-22）：三类触发端到端 · 参数面生效/留痕 · 两闸可关 · 双通道 · C-30

> 负责人：`vmu-assistant`｜任务：`task-22`（含追加项 C-30）｜判据：Lead 的 Round-3 指令 A–E ＋ 裁决 **F4**｜口径：`_handoff/vmu/00-decisions.md` **D-09**
> 写范围：`kernel/report.js`、`tools/report.js`、`kernel/paper.js`（Round 3 划入）、`packs/v5r/prompts/**`、`docs/16`、`docs/22`、`tests/vmu-assistant-*.test.mjs`、`tests/vmu-paper-consult.test.mjs`、本文件。**未改任何别人文件** ✓。

---

## 0. 结论

A/B/C/D 四项**全部端到端成立**（真机入口 ＋ 宿主注册的工具面，**没有一处**用"直接调 `tick()`"当证据）；C-30 判定点**已落地**（5 个键有了真读者）。Round 3 一共量出 **5 条发现（F1–F5）**：**F1／F3／F4／F5 已修并已升级为硬断言**，**F2（宿主 transport）** 待 core 接线、由 `--strict-findings` 具名（不写成通过）。

| 套件 | 读数 |
|---|---|
| `tests/vmu-assistant-report.test.mjs` | **93 passed, 0 failed, exit=0** |
| `tests/vmu-assistant-assembly.test.mjs` | **39 passed, 0 failed, exit=0** |
| `tests/vmu-assistant-systemprompt.test.mjs` | **15 passed, 0 failed, exit=0** |
| `tests/vmu-assistant-e2e.test.mjs`（**本轮主证**） | **48 passed, 0 failed, exit=0**；`--strict-findings` ⇒ **48 passed, 1 failed**（唯一红＝F2 待接线） |
| `tests/vmu-paper-consult.test.mjs`（C-30） | **40 passed, 0 failed, exit=0** |

---

## 1. A · 三类触发被**真实事件**驱动（不直接调 `tick()`）

全部经真机入口 `entry.apply(ctx, { packs:['v5r'], vmu:{…} })`，宿主侧只"录制宿主会做的事"（`ctx.on` 的监听器、`tools.register` 的工具、`systemPrompt.section`）。

| 触发 | 真机驱动者 | 实测 |
|---|---|---|
| **事件** | 宿主 `agent/turn-stopping`（**入口自己注册的监听器**，`ctx.on`） | `e2e-event` **fired ×1**；`trace` 行；审计 `what:'create'`、`subject:'report:e2e-event'`、`drove:false` ✓ |
| **周期（路径 1）** | 同一宿主钩子（两次回合边界之间**真实过了 40ms**，声明 `everyMs:5`／`minIntervalMs:0`） | 第 1 次**武装不触发**、第 2 次触发（`trace` 里 `trigger:'period'`）✓ |
| **周期（路径 2 兜底）** | 工具面 `vibe_vmu_report {action:'tick'}` | 同一条声明被触发 ✓ |
| **阈值** | 工具面 ＋ **真度量** | 跨线 ⇒ 正文逐字 `【阈值汇报】9 件成果`；线下（2）⇒ **0 触发** ✓ |

复现：`node tests/vmu-assistant-e2e.test.mjs`（§2/§3/§4）。**证据片段**（§3）：
```
ok  the first turn end ARMS the period without firing it (construction and arming need no clock at all)
ok  the NEXT turn end fires the period report (the host turn boundary is the clock)
ok  `action:"tick"` (the reachable fallback, no host hook needed) fires the period report
ok  a threshold report fires from a metric crossing its line, with the metric IN the text
```

## 2. B · 参数面端到端（**真生效** → 留痕 → 具名拒）

- **查看**：工具 `params` ⇒ 域 `declared=8`、owner `['office']`、每键带 **真实 hot/who**（来自只读描述接缝）✓。
- **改**：工具 `set vmu.turn.instituteName=E2E-Institute` ⇒ 走**内核 `setSettingsValue`** ✓。
- **真生效（本轮关键）**：**下一轮真实回合**（`kernel.turn.open` ＋ `assemble`，其 `{{ setting:… }}` 由**内核活设置**填充）逐字读到 `本所「E2E-Institute」` ✓ —— 这条断言在 Round 3 第一版**失败了**，因为最初用"手工 `assemble({settings: 旧副本})`"根本测不到活读；改成**真回合路径**后才成立（这也顺手钉住了"装配上下文从哪来"）。
- **留痕**：审计 `what:'update'`、`subject:'setting:vmu.turn.instituteName'`、`by:'office'`、`reason` ✓。
- **具名拒**：越域 ⇒ `VMU_REPORT_PARAM_NOT_DECLARED`；越权（`by:'r-1'`）⇒ `VMU_REPORT_PARAM_NOT_ALLOWED`；**两次拒绝零写入**（审计 update 总数仍为 1）✓。

## 3. C · 两道闸可关（零注入 ＋ 逐字节复原 ＋ 关得可见）

- **汇报开关**（`vmu.report.enabled`，**在域内**，所以助手能自己关）：工具关掉 ⇒ 真实回合边界**零触发零留痕** ✓；`problems` **具名** `VMU_REPORT_NOT_ENABLED`（"已声明但停用"≠"从未声明"）✓；`emit` 同码拒 ✓；开回后**下一回合立刻恢复**（不重建）✓。
- **人设段开关**（管线 `disable/enable`）：文本＋标题**整段消失**（零注入）✓；`enable` 后 **13056 字符逐字节复原** ✓（经真回合路径比对，比 Round 2 的手工装配更强）。

## 4. D · 双通道逐字证据（`--print`）

```
node tests/vmu-assistant-e2e.test.mjs --print
----- CHANNEL 1 · ctx.systemPrompt.section text (first 420 chars) -----
【你的位置：所办（对外接口）】
你是本所的**所办**——人类与所内之间的助手与对外接口。这条界线是硬的：
  · 你**不参与研究**…   · 你**不投票、无座**…   · 你**不越权**…
【汇报：你的第一职责】 …
----- CHANNEL 2 · the v5r-report-duty section as assembled -----
【汇报纪律：本所「institute」】
· **主动汇报是成员义务**…  · **对外汇报的出口是所办**…  · **参数配置入口属于所办**…  · **汇报不等于结论**…
----- end excerpts · system prompt 1453 chars · round prompt 13056 chars -----
```
＋ `turn.sources` 里出现 `section:'v5r-report-duty'`（可审计来源）✓。

---

## 5. C-30 · 所办定稿咨询门（`kernel/paper.js`，本轮划入）

- **读者**：`finalize` 按序 ①finalizer ②完整性 ③**咨询门** ④`register`；`WIRED_KEYS` **3→8**（5 个 `vmu.paper.officeConsult*`，`cfg()` 无条件全读 ⇒ "keysUsed 非空头承诺"仍成立）✓。
- **台账记动作**：`consult({paperId,kind,by,ref})`（`kind` 自由词表）／`requestConsult()`（幂等）／`consultState()`（**只读**，`auto:false`，不改变稿件）✓ —— 对齐 v5r「**意图不算**」✓。
- **拒法**：`VMU_OFFICE_CONSULT_*`（`REQUIRED`）＋ `enforced[]`（5 键）＋ `enforcedScope='evaluated-so-far'` ＋ 算术细节（`reason/timeoutMs/elapsedMs/remainingMs/heldOnTimeout/timedOut/requestCleared`）；`hint` 给三条出路 ✓。
- **留痕**：审计 `what:'auth'`（`subject:'paper:<id>'`，带 `enforced`＋scope）＋ 总线事件 `paper/office-consult-required`（`bus.declareTopic` 扩展点）＋ trail；**接缝缺失 ⇒ 具名上报**（`trace.audit.code`／`trace.bus.note`），不假装写过 ✓。
- **超时**：`hold` 保持请求且**仍拒**／`refuse` 清请求且**仍拒**／`0`＝无限等；**无法识别的值按 hold** ⇒ **`default-allow` 连拼写都进不来** ✓。
- **F4 裁决已实现**：默认**不豁免**（`[]`）⇒ `office` 自己定稿也要先咨询（v5r 原场景）✓；声明 `['office']` 时才豁免 ✓。
- 复现：`node tests/vmu-paper-consult.test.mjs`（40 项）。
- **另修**：`generate-wired-schema` 误读 `WIRED_KEYS` 注释里的撇号/反引号 ⇒ 已改写注释；`node scripts/generate-wired-schema.mjs --check` ⇒ **exit=0**（`schema already in sync`），`docs/04` 五行已是 `✅ 已接线 / kernel/paper.js` ✓。

---

## 6. Round 3 的 5 条发现（逐条状态）

| 编号 | 事实（实测） | 状态 |
|---|---|---|
| **F1** | 只装载 pack 时 `vibe_vmu_report` **不发布**（面解析在构造期，清单 settings 在装载时才施加），而汇报**已被武装** | **已修**（core 根因修：面解析移到 pack settings 之后）⇒ 本报告 **硬断言** ✓。**最终口径：面解析在 pack settings 之后**（不是"pack 要往 defaults.json 塞家族键"）✓ |
| **F2** | 入口**不注入**内核级 `deliver` ⇒ 报送触发＋留痕，但每条具名拒 `VMU_REPORT_NO_TRANSPORT` | **待 core 接线**；本报告**钉住诚实边界**（具名拒＋仍留痕，硬断言 ✓）＋ 另证"注入 transport 时真的发出"（真内核工厂，`delivered:true`）✓；`--strict-findings` 下**具名红** ✓ |
| **F3** | 活读键回执**低报**（`requiresRestart:true` 而同会话已生效） | **已修**（core 落 `liveReadBy` ＋ `appliesAt` 双披露 ＋ `requiresRestart:false`/`applied:'immediate'`）⇒ 硬断言 ✓（含"不得低报也不得高报"） |
| **F4** | v5r 的 C-30 卡 **office 自己定稿**，而 `officeConsultExemptRoles` 默认 `['office']` 恰好豁免原场景 | **Lead 裁决**：默认 `[]`；本报告按此断言（空/未声明 ⇒ office 也被卡）✓ |
| **F5** | 与 F1 同型更深一层：宿主周期时钟的挂载判据是**构造期** `settings` ⇒ pack-only 时**时钟不挂** | **已修**（core 把判据改成"面**已发布**"，且在 install 之后挂）⇒ 本报告 **硬断言**（pack-only ⇒ 恰 1 个监听器）✓ |

**F2 的"诚实边界"三条断言**（本报告硬钉住）✓：① `transportInjected===false` ⇒ 每条 `fired` 带 `refused.code='VMU_REPORT_NO_TRANSPORT'`；② **仍留痕**（`trace` 有行）；③ 内核 `seams.deliver===false` 与之一致（一个事实一个家）。

---

## 7. 原样命令与退出码（本轮最终读数）

```
D:\wd\vibemath开发\Vibe-Mathematics> node tests/vmu-assistant-e2e.test.mjs
=== VMU ASSISTANT E2E: 48 passed, 0 failed ===                       exit=0
D:\wd\vibemath开发\Vibe-Mathematics> node tests/vmu-assistant-e2e.test.mjs --strict-findings
=== VMU ASSISTANT E2E: 48 passed, 1 failed ===                       exit=1   ← 唯一红＝FINDING F2（宿主 transport 待接）
D:\wd\vibemath开发\Vibe-Mathematics> node tests/vmu-paper-consult.test.mjs
=== VMU PAPER CONSULT (C-30): 40 passed, 0 failed ===                exit=0
D:\wd\vibemath开发\Vibe-Mathematics> node tests/vmu-assistant-report.test.mjs
=== VMU ASSISTANT REPORT: 93 passed, 0 failed ===                    exit=0
D:\wd\vibemath开发\Vibe-Mathematics> node tests/vmu-assistant-assembly.test.mjs
=== VMU ASSISTANT ASSEMBLY: 39 passed, 0 failed ===                  exit=0
D:\wd\vibemath开发\Vibe-Mathematics> node tests/vmu-assistant-systemprompt.test.mjs
=== VMU ASSISTANT SYSTEM PROMPT: 15 passed, 0 failed ===             exit=0
D:\wd\vibemath开发\Vibe-Mathematics> node tests/vmu-paper.test.mjs
=== VMU PAPER: 37 passed, 0 failed ===                               exit=0   ← verify 已按一行补丁修好
D:\wd\vibemath开发\Vibe-Mathematics> node tests/vmu-host.test.mjs
=== VMU HOST: 103 passed, 0 failed ===                               exit=0
D:\wd\vibemath开发\Vibe-Mathematics> node tests/vmu-turn.test.mjs
=== VMU TURN: 145 passed, 0 failed ===                               exit=0
D:\wd\vibemath开发\Vibe-Mathematics> node scripts/check-docs.mjs
vmu doc-lint: docs=29  issues=0  notes=24 / DOC LINT: PASS           exit=0
D:\wd\vibemath开发\Vibe-Mathematics> node scripts/generate-wired-schema.mjs --check
  schema already in sync (1529 -> 1529 lines) / INVARIANTS ok: 333 emitted …   exit=0
D:\wd\vibemath开发\Vibe-Mathematics> node tests/audit-declaration-criterion.test.mjs
RULE E fingerprints: shape=file:shape:receiver current=72 baseline=67    ← 新增 5 条全是 vmu-activity-*（reader-a），我的文件**不在**其中
```

**一处别人的红（已具名给 verify，含修法）**：`tests/vmu-entry.test.mjs` 在 `:811` 崩（`handlers[0] is not a function`）。原因：core 的 F5 修法把时钟挂载移到 **install 之后**，而该套件在 `entry.apply()` 之后**同步**读 `state.listeners['agent/turn-stopping']` ⇒ 读到 `[]`（长度断言先红，随后调 `undefined` 崩）。实测（同一 fakeCtx 形状）：**apply 之后立即 = 0 个监听器；等 50ms = 1 个，`typeof === 'function'`**。修法：该块在读取前 `await declaredHandle.ready()`（或 `await new Promise(r=>setTimeout(r,0))`）。

## 8. 未做项与跨人待办

1. **F2 宿主 transport 未接**（core 已派）⇒ `14-§2` T15；接线后我把 `--strict-findings` 的红转绿。
2. **verify**：`tests/vmu-entry.test.mjs:804-811` 需 await（见上）；`tests/audit-enforced-consistency.test.mjs` 的 `paper` 需一个 **REFUSAL_SCENARIO**（`finalize` ⇒ `thrown:enforced[]`，code `VMU_OFFICE_CONSULT_*`；不能走信封豁免，因为是真拒法）。
3. **core**：`VMU_OFFICE_CONSULT_REQUIRED` 登记 `docs/03 §8`；`officeConsultExemptRoles` 的 schema 默认改 `[]`（F4）；`vmu.paper.*` 5 键的 pack 默认由 **vmu-pack** 补（已 `send_message` 通知它，含建议值与 F4 的 `[]`）。
4. **vmu-pack**：`packs/v5r/settings/defaults.json` 补 5 行（只放 defaults.json，**不要**再进 `PACK.settings`，否则 `VMU_PACK_CONFLICT`）。
5. **本报告未做**：全量 sweep、`regen-all`、`update-doc-counts`、git（按 D-07 留给 Lead）✓；临时文件在 `D:\_tmp`（`vmu-e2e-probe*.mjs`，可删）。
6. **仍未做（诚实登记）**：咨询门只覆盖 **finalize** 那一半（`finalize-or-submit` 的 submit 归出版面）；v5r 的**双计数**（消息＋会议）未恢复（现为"任一动作即可"，恢复需再声明白名单）；`vmu.report` 的 ack／扇出上限未做（`14-§2`）。

## 9. 写范围核对

```
?? vibe-math-vmu/kernel/report.js          ?? tests/vmu-assistant-e2e.test.mjs      （本轮新增）
?? vibe-math-vmu/tools/report.js           ?? tests/vmu-paper-consult.test.mjs     （本轮新增）
?? vibe-math-vmu/packs/v5r/prompts/v5r-assistant.js
?? vibe-math-vmu/packs/v5r/prompts/assistant.json
?? tests/vmu-assistant-report.test.mjs / -assembly / -systemprompt
 M vibe-math-vmu/kernel/report.js          （Round 3：懒读时钟／drives:false 补齐／status.clock）
 M vibe-math-vmu/tools/report.js           （Round 3：内核回执整份转发 ⇒ liveReadBy/applied 不再被丢）
 M vibe-math-vmu/kernel/paper.js           （C-30：5 键读者 ＋ consult/requestConsult/consultState ＋ 拒绝＋留痕）
 M vibe-math-vmu/packs/v5r/prompts/v5r-core.js / docs/16 / docs/22
?? _handoff/vmu/assistant-round3-report.md
```

# Round 7 · task-49：钉上"阈值真开火／参数面留痕／人设两通道"（1 次会话）——**三条全部建立 ✅**

> 负责人：`vmu-assistant`｜任务：`task-49`｜前置：R6 已证 52 面发布 ＋ `settingsMerge.sources` 5 键 ＋ `declared=1`（core task-41）
> 写范围：`kernel/report.js`、`tools/report.js`、`packs/v5r/prompts/**`、`docs/16/22`、`tests/vmu-assistant-*.test.mjs`、本文件。**未动别人文件** ✓。
> 纪律：不跑全量 sweep／不 `regen-all`／不 git；临时文件 `D:\_tmp`；凭据副本由 vmu-verify 收尾删除。

---

## 0. 结论：**三条全部【实测具备】✅**（上两轮的"未建立"是被预算切断，不是机制）

| 上轮未建立项 | 本轮结果 | 证据（会话日志原文） |
|---|---|---|
| **阈值真开火** | ✅ **具备** | `vibe_vmu_report{action:'tick',metrics:'{"artifacts":9}'}` 回执：`"declared":1, "fired":[{"name":"artifacts-threshold","trigger":"threshold","text":"【成果阈值】artifacts=9 已达阈值 5","drives":false,"refused":{"code":"VMU_REPORT_NO_TRANSPORT",…}}], "skipped":[], "audit":{"appended":true}, "drives":false` |
| **参数面留痕** | ✅ **具备** | `vibe_vmu_set{key:'vmu.turn.instituteName',value:'Slice-Institute'}` 回执：`{"ok":true,"key":"…","value":"Slice-Institute","hot":"H2","who":"office","ownerCheck":"exempted (no `by` given: office path, DISCLOSED)","requiresRestart":false,"source":"runtime"}` |
| **人设两通道** | ✅ **具备**（system prompt 面到达模型） | 模型原话末段：**"I am the institute office (assistant/external interface), not a member, and I do not vote."** |
| （回归）多面点亮 | ✅ 仍成立 | 发布 **78 工具／`vibe_vmu_*` 52 个**（`request/header.tools`） |
| （回归）声明到达入口 | ✅ 仍成立 | `settingsMerge.sources`＝5 键（含 `vmu.report.reports:"config"`）、`settings.keys=6`、`report.declared=1` |
| **`tokenCapHit`** | ✅ **false**（这一轮终于没被切断） | in 48690／out 6138／cacheRead 204800／cap 400000 |

## 1. 原样命令与读数

```
# 实例由 verify 起：--port 7803；补丁＝provider default-model ＋ D:\_tmp\opencode-go.patch.yml ＋ D:\_tmp\vmu-overlay-v3.yml
# 免费预检（verify 侧）：POST /api/session/create {agentPreset:'vibe-math-vmu'} ⇒ http=200 ok=true
set DSH_HOME=D:\_tmp\smoke-home ; set TEMP=D:\_tmp\host-slice-out
node tests/vmu-assistant-host-slice.test.mjs --web-port 7803 --web-token <token> \
  --preset vibe-math-vmu --cwd D:\_tmp\smoke-ws --max-tokens 400000 --timeout 420 \
  --expect-settings vmu.tools.faces,vmu.packs.active,vmu.report.enabled,vmu.report.minIntervalMs,vmu.report.reports --print
  ⇒ === VMU ASSISTANT HOST SLICE: 13 passed, 3 failed, 0 not-run ===  exit=1
     （3 failed 是**断言读错了来源**：见 §4 —— 回执在会话日志里，驱动 stdout 不回声工具结果）

# ★ 修好断言后，用"离线复评"重跑同一条已录会话（不花新会话）：
node tests/vmu-assistant-host-slice.test.mjs --session 55ab3f49-8a9c-4a7b-a942-8bb4a4eb07a8 \
  --dsh-home D:\_tmp\smoke-home --expect-settings <同上>
  ⇒ === VMU ASSISTANT HOST SLICE: 15 passed, 0 failed, 0 not-run ===  exit=0   ← 全部绿
node tests/vmu-assistant-host-slice.test.mjs                    ⇒ 6 passed, 0 failed, 5 not-run  exit=0
node tests/vmu-assistant-host-slice.test.mjs --require-host     ⇒ exit=1（"未跑"不是悄悄通过）
```

## 2. 记账（Lead/verify 要的每一项）

**会话**：`session-55ab3f49-8a9c-4a7b-a942-8bb4a4eb07a8`（50 events；`sessions/--D-_tmp-smoke-ws--/…/session.v4.jsonl.zstd`）
**首条 user message**：**L10 seq=8**（首行「模拟测试」✓ SLV §2）
**每对 `tool/call`→`tool/result`（seq＋行号）**：
```
vibe_vmu_report (status)  call L19 seq17 → result L20 seq18（966 字符）   declared:1 armed:1
vibe_vmu_report (tick)    call L24 seq22 → result L25 seq23（996 字符）   fired[1] ✓
vibe_vmu_set              call L29 seq27 → result L30 seq28（348 字符）   ok/hot H2/source runtime ✓
vibe_vmu_status           call L34 seq32 → result L35 seq33（49,929 字符）settingsMerge 5 键 ✓
pwsh                      call L39 seq37 → result L40 seq38（模型自己量字符长度）
pwsh                      call L44 seq42 → result L45 seq43
```
**发布清单**：78 工具／`vibe_vmu_*` **52 个**（含 `report`／`set`／`status`／`chat`／`panel`…）
**`declared`**：`1`（`report` status 回执 `"declared":1,"armed":1`）｜**`fired[]`**：见 §0 原文
**`turn/end`**：**L50 seq48 ＝ `completed`** ✓（vmu-verify 独立抽取确认；与 `tokenCapHit:false` 一致 —— 这一轮是**跑完**，不是被切断）
**两处发现（据实，非缺陷）**：
1. **`vibe_vmu_set` 的已发布 schema 不接受 `by`/`reason`**（模型原话："this tool's schema accepts only `{key, value}` (`additionalProperties: false`), so the requested `by`/`reason` could not be passed"）⇒ 回执改为**具名披露** `ownerCheck:"exempted (no \`by\` given: office path, DISCLOSED)"`。**给 core/verify 的输入**：要么让该工具的 schema 收 `by`/`reason`，要么把"参数面留痕=谁改的"改由 `whoMayChange`／审计行承载（现在 `who:"office"` ＋ `source:"runtime"` 已可追）。
2. **投递被具名拒**：`refused.code="VMU_REPORT_NO_TRANSPORT"`、`delivered:false`、`drives:false` —— 这是 **F2 的诚实边界**（scratch 部署没注入 transport）；**"阈值真开火"证的是 `fired[]`**（已建立），投递另说 ✓。

## 3. 为什么这次成了（根因修法，非运气）
- **提示词重排**：把 **`vibe_vmu_status`（49,929 字符）从第 1 步挪到第 4 步**，要证的三件事（`report status` → `tick` → `set`）放最前 ⇒ 每一步的上下文都轻；`chat`/`panel` 已证过，本轮不调。
- **`--max-tokens 400000`** ⇒ `tokenCapHit:false`（前两轮 40k/120k 都被切断）。
- 结果：**6 次调用全部发生**，三条一次钉上。

## 4. harness 的两处修正（本轮真正的工程收获）
1. **断言来源错了（假阴性根因）**：三条实质断言原先跑在 `transcript`（驱动 stdout＋dump）上，而**工具回执只在会话日志里**（驱动不回声结果）⇒ R7 明明全部发生却判 3 红。现在统一从 **`sess.rawResults`（回执原文）＋ `sess.assistant`（模型原话）** 断言：
   - 阈值：`"fired":[{` ＋ `"drives":false`；
   - 参数面：`"ok":true` ＋ `"hot":"H\d"`（并打印 `ownerCheck`）；
   - 人设：`(office|所办)` ＋ `(do not vote|not vote|不投票|不参与研究)`。
2. **新增离线复评 `--session <id>`**：用**同一套断言**复评**已录会话**（不花会话）。这正是"断言改了要重验"的正确姿势——本轮就是靠它把 13/3 重评为 **15/0**；并把共享断言抽成 `gradeSession()`，live 与 offline 两条路**共用一份**，杜绝再次分叉。

## 5. 会话记账
```
R5: verify 1（31.4k）＋ 我 2（8.2k／32.2k）
R6: 我 1（42.7k in／1.1k out／110.9k cache）＋ 追加 1（48.7k in／0.4k out／111k cache）
R7: 我 1（48.7k in／6.1k out／204.8k cache；cap 400k 未触）
累计 ≈ 690k tokens（仍 ≪ 手册上限）｜本轮 1 次会话（Lead 批准的"第 6 次"）✓
```

## 6. 写范围核对
```
 M vibe-math-vmu/docs/16-research-lifecycle.md   （§9.6-6 三条转为"具备"＋终态）
 M vibe-math-vmu/docs/22-academic-operations.md  （§19.12 观测 12 ＋ "已建立"更新）
 M tests/vmu-assistant-host-slice.test.mjs       （断言读回执 ＋ --session 离线复评 ＋ gradeSession 抽取）
?? _handoff/vmu/assistant-round7-report.md
（kernel/report.js、tools/report.js、packs/v5r/prompts/** 本轮未改）
```

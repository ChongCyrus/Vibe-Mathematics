# Round 8 · task-64：目标 6 最后一格 —— **投递真的送达**（F2 正面半场）**真机已证 ✅ ＋ 可复制配方**

> 负责人：`vmu-assistant`｜任务：`task-64`｜写范围：`kernel/report.js`、`tools/report.js`、`packs/v5r/prompts/**`、`docs/16/22`、`tests/vmu-assistant-*.test.mjs`、本文件。**未动别人文件** ✓。
> 纪律：不跑全量 sweep／不 `regen-all`／不 git；临时文件 `D:\_tmp`；凭据副本由 vmu-verify 收尾删除；**会话 1 次**（Lead 批准的上限）。

---

## 0. 结论：**投递＝真机已证 ✅**（不是具名收口），配方在 §2

`report tick` 回执（真机会话 `session-8c105c47-ed8d-4569-882d-91af40191653`，50 events）：
```json
{"ok":true,"action":"tick","enabled":true,"clock":{"ok":true},"declared":1,
 "fired":[{"name":"artifacts-threshold","trigger":"threshold","text":"【成果阈值】artifacts=9 已达阈值 5",
           "delivered":true, "drives":false, "error":null, "refused":null}],
 "skipped":[],"ignored":[],"delivered":1,"failures":0,"truncated":0,
 "audit":{"appended":true,"code":null,"note":null},"drives":false}
```
⇒ **`delivered:true`、`refused:null`、`delivered:1`、`failures:0`** —— 与 R7 的 `refused:{code:"VMU_REPORT_NO_TRANSPORT"}` 形成**同一判据的两态对照** ✓。**F2 的两半现在都是"真机已证"**（装配级 ⇒ 真机）。

## 1. 为什么不是具名收口：先否掉了"声明式 transport 名"，再找到"配置可携带函数"

| 检查 | 结果 |
|---|---|
| 有没有"声明式 transport 名"的**读者**（Lead ① 的字面形态）？ | **没有** ✗：全仓唯一来源是 `config.deliver`（`vibe-math-vmu.js:475`），且入口**故意不从宿主猜**（`vibe-math-vmu.js:470-474` 原文：*"We do NOT invent one from `ctx.get('subagents')` here, because the report/member envelopes differ from a turn's `{turn,text}` … guessing a shape would be exactly the 'pretend it was delivered' failure"*） |
| overlay 能不能携带**函数**？ | **能** ✓：core 的 `preset-declaration.js:70-78` `deepMerge` 对**非对象叶子原样返回**；profile patch **支持 `!!js`**（vmsmoke `cordis.patch.yml` 头注释明载） |
| 免费探测（不起服务） | `dsh --profile vmsmoke --dump-config --patch <v4>` ⇒ overlay 行 config 出现 `deliver: !!js >- (report) => console.log("[vmu-report-sink] …")`，**preset 行整块不变**（第二设计仍在）✓ |

## 2. ★ 可复制配方（**部署侧**，一份 patch 搞定）

```yaml
# <临时目录>/vmu-overlay-v5-transport.yml —— 普通 --patch 文件（仓库外，实测用）
- id: vibe-math-vmu-overlay          # ★ 只打 overlay 行；preset 行永远不要打
  config:
    overlayFor: vibe-math-vmu
    rows:
      vibe-math-vmu:
        # ① 投递接缝：deepMerge 原样透传非对象叶子 ⇒ 函数可以坐 overlay；!!js 由 loader 求值
        deliver: !!js '(report) => console.log("[vmu-report-sink] " + JSON.stringify({ name: report.name, to: report.to, channel: report.channel, text: report.text, drives: report.drives }))'
        vmu:
          # ② 声明一份报告（否则 tick 无物可开火）
          tools: { faces: ['*'] }
          packs: { active: ['v5r'] }
          report:
            enabled: true
            minIntervalMs: 0
            reports:
              - name: 'artifacts-threshold'
                trigger: { kind: 'threshold', metric: 'artifacts', op: 'gte', value: 5 }
                channel: 'log'
                template: '【成果阈值】artifacts={{ metric:artifacts }} 已达阈值 5'
```
起机：`dsh --profile <p> --patch <provider 补丁> --patch <本文件> web`（或 `--port … --no-open`）。

**边界（必须照抄的注意事项）**：
1. **报告声明与 transport 必须写在同一份 patch 里** —— loader patch 是**替换** config（R5 实测），分两份会互相覆盖。
2. **`!!js` 表达式的求值作用域是 overlay 行自己的 realm**（不是 preset 行的 realm；core 在 `preset-declaration.js:30-44` 明确警告过"嵌套表达式在错误 realm 求值会静默出错"）⇒ **只能用不依赖宿主服务的 sink**（`console`／`fetch`／纯计算），**本次实测的正是 `console`（log 通道语义相配）**。
3. **需要宿主服务/收件人的 transport**（写 inbox/`subagents.sendMessage`/需要 `ctx` 的 webhook）**不要在 overlay 里试** —— 那条路仍属"**宿主代码注入**"：在配置 vmu 那一行的**宿主代码**（或 JS 形式的 profile 行）里给 `deliver:` 一个函数，例如
   ```js
   // 宿主侧（配置 vmu 行的那个文件；不是 YAML）
   deliver: (report) => ctx.get('subagents').sendMessage({ to: report.to, text: report.text, payload: report.payload })
   ```
   ⇒ **"声明式名解析"（Lead ① 字面）＝不存在**；**"overlay 携带 scope-free 函数"＝已验证**；**"overlay 携带服务型 transport"＝未验证，不建议**（三条分开写，不混）。

## 3. 记账（Lead 要的每一项）

- **会话**：`session-8c105c47-ed8d-4569-882d-91af40191653`（50 events）；**首条 user message L10 seq8**（「模拟测试」✓ SL2 §2）。
- **每对 `tool/call`→`tool/result`（seq＋行号）**：`report`(status) L19 seq17→L20 seq18｜**`report`(tick) L24 seq22→L25 seq23**｜**`vibe_vmu_set` L29 seq27→L30 seq28**｜`status` L34 seq32→L35 seq33（`settingsMerge.sources` 5 键含 `vmu.report.reports`）｜`pwsh`×2（模型自己量字符）。
- **`declared`**：`1`（status 回执 `declared:1, armed:1`）｜**投递**：`fired[0].delivered:true`、`delivered:1`、`failures:0`、`refused:null` ✓
- **`vibe_vmu_set`**：`{"ok":true,…, "hot":"H2","who":"office","ownerCheck":"identified","by":"office","reason":"scripted slice","source":"runtime"}` ⇒ **R7 的"schema 只收 {key,value}"已被 core 修掉**（现在 `by`/`reason` 进得去、`ownerCheck:"identified"`）✓
- **tokens**：in 43900／out 2799／cacheRead 203264；**`tokenCapHit:false`**（cap 400000）｜发布 **78 工具／`vibe_vmu_*` 52 个** ✓
- **人设原话**（本轮措辞变了，命题相同）：**"I am the institute office (assistant/external interface), not a voting member; I don't vote."** ⇒ 断言正则原先只认 `not vote`（不认缩写 `don't vote`）⇒ 已修正为 `(do not|don'?t|does not|doesn'?t|not)\s+vote` ✓
- **独立旁证（已到，第三方角度）**：vmu-verify 从其 **7804 服务 stdout**（他自己的后台作业，**不在我的 harness 里**）读到**恰好一条**：
  ```
  [vmu-report-sink] {"name":"artifacts-threshold","to":[],"channel":"log","text":"【成果阈值】artifacts=9 已达阈值 5","drives":false}
  ```
  ⇒ 与我的回执 **`name`/`channel`/`text`/`drives` 逐字一致**，且**只一条**（无重复投递）⇒ **真 sink 真被调用** ✓✓（verify 已记入其矩阵 §9.7.7）。

## 4. 原样命令与退出码

```
# 实跑（1 次，SLV §2/§4；两补丁：provider ＋ v5）
node tests/vmu-assistant-host-slice.test.mjs --web-port 7804 --web-token <token> --preset vibe-math-vmu \
  --cwd D:\_tmp\smoke-ws --max-tokens 400000 --timeout 420 \
  --expect-settings vmu.tools.faces,vmu.packs.active,vmu.report.enabled,vmu.report.minIntervalMs,vmu.report.reports \
  --expect-delivery
  ⇒ === VMU ASSISTANT HOST SLICE: 16 passed, 1 failed, 0 not-run ===  exit=1
     （唯一红＝人设正则不认缩写 `don't vote`；**命题本身已成立**）

# ★ 修好正则后，离线复评同一条已录会话（不花会话）
node tests/vmu-assistant-host-slice.test.mjs --session 8c105c47-ed8d-4569-882d-91af40191653 \
  --dsh-home D:\_tmp\smoke-home --expect-settings <同上> --expect-delivery
  ⇒ === VMU ASSISTANT HOST SLICE: 16 passed, 0 failed, 0 not-run ===  exit=0   ← 全绿（含投递断言）
node tests/vmu-assistant-host-slice.test.mjs                     ⇒ 6 passed, 0 failed, 5 not-run  exit=0
node tests/vmu-assistant-host-slice.test.mjs --require-host      ⇒ exit=1
```

## 5. 目标 6 终态（全四条 ＋ 投递，**均为真机**）
| # | 维度 | 状态 | 真机证据 |
|---|---|---|---|
| 1 | 多面点亮 | ✅ | 发布 78／**52** 面 |
| 2 | 阈值真开火 | ✅ | `fired[]` 非空（【成果阈值】…） |
| 3 | 参数面留痕 | ✅ | `set` 回执 `hot:H2`／`source:"runtime"`／`ownerCheck:"identified"` |
| 4 | 人设两通道 | ✅ | 模型自述 office ＋ don't vote |
| 5 | **投递真的送达** | ✅ | `delivered:true`／`refused:null`／`delivered:1`／`failures:0`（**本轮闭合**） |
| 6 | 零机制红线 | ✅ | 无声明 ⇒ 恰 1 个工具（verify 16/0 ＋ 本卷对照断言） |

## 6. harness 增量
- `--expect-delivery`（部署声明了 transport 时，断言 `delivered:true` 且无 `VMU_REPORT_NO_TRANSPORT`）；RECEIPT FACTS 增 `tickDelivered`／`tickRefusedCode`／`tickDeliveredCount`／`tickFailures`。
- 人设正则收缩写（`don't vote`）。
- 沿用 `--session <id>` 离线复评（本轮再次用它把 16/1 复评为 16/0）。

## 7. 会话记账
```
R5–R7: ≈690k tokens（见各轮报告）
R8   : 1 次会话（in 43900／out 2799／cacheRead 203264；cap 400k 未触）⇒ 累计 ≈940k（仍 ≪ 手册上限）
```

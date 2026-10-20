# Phase 6 / SLV 收尾验收卷

本卷记录 Phase 6 的 SLV（模拟接缝）验收结果。模拟约束：成员回合**不调用工具**、只输出 JSON 回执；不做真数学、不改仓。

## 1. 两个包的结题票

### v3（真 one-shot 子代理）

- run：`v3-19527-1019-221232`
- `closureVote` 原文：

```json
{"window":"round","cast":true,"for":["verifier-a","verifier-b"],"against":[],"missing":[],"eligible":["verifier-a","verifier-b"],"permission":"vote","reason":"every enfranchised member judged the question solved"}
```

### v5r（真 one-shot 子代理，当前源码复现）

- run：`v3-19611-1020-001456`
- `closureVote` 原文：

```json
{"window":"round","cast":true,"for":["member-a"],"against":[],"missing":[],"eligible":["member-a"],"permission":"vote","reason":"every enfranchised member judged the question solved"}
```

该 run 的提示词来自当前 tree：`v5r-fixture-constraint` 段（`source: 'v5r-fixture:slv'`、无 `{{ }}`、首行 marker 唯一）出现在 `PACK.sections` 与装配 `sources` 中。

## 2. v3 的 paper 四件

19527 收尾原文：

```json
paper {"target":"odd-sum","present":["md","tex","pdf","meta"],"missing":[],"complete":true}
```

## 3. 偏差（必须与“达成”分开读）

1. **成员在回合内使用工具的路径未覆盖**：两个包的成员段都被夹具约束为“本轮不调用工具、只输出 JSON 回执”。★ **PHASE 7 更正（创始人质询后核实）**：这条的真实原因比"夹具为避超时而禁止"严重得多 —— ★ **`packs/v5r` 根本没有声明任何工具**（无 `tools.js`），而原始 `vibe-math-v5r.js`（**11275 行**）有 **57 个 `vibe_v5_*` 工具**；★ 而 v5r 的**提示词里仍在教成员调用 `vibe_v5_record_progress` 等不存在的工具**。⇒ ★ **不是"我们选择不测工具路径"，★ 是"成员当时没有工具可调"**。覆盖矩阵见 `docs/acceptance/phase7-coverage-matrix.md`。
2. **v5r 的 caller 交付偏差**：19607 的 `cast:true` 经 caller 交付（root 扮演 member）；19611 已用真 one-shot 子代理复现，故 v5r 的 subagent 交付路径现已被覆盖。
3. ~~**v5r 无 paper 面**：v5r 没有 paper-close 中间件，因此 v5r 不产生论文四件。这是正确的 pack 差异。~~
   ★★ **本条【错误】，PHASE 7 更正**：★ 原始 `vibe-math-v5r.js` **有完整的论文子系统** —— `paperWritePrompt`／`paperReviewPrompt`／`paperAdvance`／`paperPass`／`paperStep`／`paperRecordPart`／`paperRecordReview`／`paperRecordFinal`／`paperCompilePdf`／`paperLatexCommand`／`PaperMd`／`PaperTex`／`PaperArtifacts`／`PaperEnum`／`paperSections`，含 **xelatex 中文优先的引擎探测**、**"指纹与磁盘正文不一致 ⇒ 具名阻塞并上报，绝不静默用旧文"**。
   ⇒ ★ **我们的 `packs/v5r/` 整块【未移植】** —— ★ **这不是 pack 差异，★ 是移植遗漏**；★ 列入 PHASE 7 目标 2 补齐。

## 4. meeting/send 正反例（v5r，19612）

- 空 sender：`{"ok":false,"code":"VMU_INVALID_ARGUMENT","message":"member is required",...}`
- 真 sender：`{"ok":true,"action":"speak","id":"sim-meeting","member":"member-a","round":1,"answered":1,"of":2,...}`
- 取证：`snapshot` 的 `inputs` 含 `{"member-a":"真实 sender 正例"}`，`history` 有 `input-accepted`。

## 5. 未覆盖清单

- ~~v5r 的 paper 面（**不存在**，见偏差 3；不是覆盖不足）。~~
  ★★ **PHASE 7 更正**：★ **paper 面【存在】于原文、★ 只是未移植** ⇒ ★ 这**是覆盖不足**，★ 不是"不存在"。★ 已列入 PHASE 7 目标 2。
- v5r 的 `vibe_vmu_status` 没有 `dispatch` 字段；成员回合完成度以 `turn.status` 的 `turns/delivered/parsed` 为等价证据。
- v5r 全链的 token 预算未单独标定（本次 19611 为 45s / 171469 tokens）。

## 6. 结论

**目标 4 的验收判据为 `closureVote.cast === true`；v3（19527）与 v5r（19611）均达成；v3 另有 paper 4/4。**

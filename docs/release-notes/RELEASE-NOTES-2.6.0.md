# dsh-vibe-math 2.6.0 — 发布说明（中文）

> 上一版：2.5.0。本版新增**最终论文（final paper）**功能：四个预设默认在收口时自动撰写一篇只整理
> 已有证据的完整论文，且论文阶段发生在"标记完成"**之前**。既有参数默认值、数据格式与目录结构未变，
> DSH 支撑窗口不变，无需迁移。

---

## 概览

- 新增**最终论文**：默认开启（`finalPaper=true`）。收口信号命中后、**run 被标记完成之前**进入 paper 阶段。
- 产物固定在 `Paper/<id>/`：`paper.md`、`paper.tex`、`paper.pdf`（仅在宿主检测到 LaTeX 引擎并编译成功时）、
  `paper.meta.json`、`paper.log.md`。
- v4/v5 为**团队合写**：各自写自己的部分 → 合并 → 交叉互审 → 定稿代表定稿 → 全体明确"可交付"才定稿；
  v5 的定稿代表默认院士，所办仅在手动路径下可用，且必须先与全所交流并开会。
- 编译失败**先修复、后降级**：没有引擎或编译不通过时仍交付 tex+md，只记日志告警，不阻塞定稿，
  也绝不覆盖已有的 `paper.pdf`。
- 随功能修掉若干问题：v5 自动触发的心跳停摆、v2/v3 写手卡死可能永久阻塞、v3 随包语料的时间戳非确定性、
  以及一处会被空过的论文判定检查。
- 契约文档 `docs/final-paper.md` 随包发布；双语 README 补齐参数与用法。

## 变更

### 1. 新功能：最终论文（四套一致，默认开启）

- **触发**：各预设用自己的收口信号（v2 严格终止、v3 完整收口、v4 一致性会议的一致停止票、
  v5 每次解题票上的"已解决"判定）。命中后进入 paper 阶段，**论文完成或降级结束之后才把这次 run
  标记为完成**——否则会议/唤醒机制已被禁用，团队合写无法进行。
- **手动**：`/vibe paper [lang=zh|en] [format=both|md|tex] [force]`（v2/v3）、
  `/v4 paper [… editor=office|resident:<id>] [force]`、`/v5 paper [… editor=office|academician] [force]`。
  命令行覆盖只作用于本次（不写回持久参数）；`force` 重写已定稿的论文；参数非法返回 `kind:'error'`；
  `finalPaper=false` 只关闭自动触发，手动命令仍可用并在返回里说明"自动已关闭"。
- **幂等**：同一 run 只写一次（`finalizedAt` + 逐产物存在性检查），重复触发只补写缺失的产物。
- **内容骨架（9 节，四套一致）**：① 标题、作者、日期与摘要 ② 引言与问题背景 ③ 原问题的完整解法
  ④ 已检验通过的命题（含判定为真的估计值与证据来源）⑤ 已解决的子问题 / 中间成果
  ⑥ 创造或发现的有价值之物（方法、理论、思想、经验、数学理解）⑦ 规律总结 ⑧ 讨论、局限与展望
  ⑨ 附录：证据与文件索引。论文只整理已有证据、**不得编造**；未决与被否证的条目必须显式标注。

### 2. 参数

- `finalPaper`（默认 `true`，四套）：收口时自动撰写最终论文；`false` 只关闭自动触发。
- `paperFormat`（默认 `both`，四套）：`both`（md+tex）/ `md`（只写 md，跳过编译且不报"缺 tex"）/ `tex`。
- `paperLanguage`（默认 `zh`，四套）：`zh`（LaTeX 用 `ctexart`，引擎优先 `xelatex`）/
  `en`（`article`，引擎优先 `pdflatex`）。
- `paperCompilePdf`（默认 `true`，四套）：检测到 LaTeX 时是否编译 `paper.pdf`。
- `paperLatexCommand`（默认空，四套）：优先尝试指定的引擎可执行文件；解析不到时按"未检测到"降级。
- `paperEditor`（仅 v4/v5）：v4 默认 `office`（会话根 / 人类侧），可选 `resident:<id>`
  （指定成员已离职则降级回 office 并在 meta/log 记明）；v5 默认 `academician`，`office` 仅手动路径可用。

### 3. 产物、LaTeX 检测与降级

- **目录与文件**：`Paper/<id>/`，id 经各预设既有的归一化函数处理（含路径穿越防护）；内容为
  `paper.md`、`paper.tex`、`paper.pdf`、`paper.meta.json`（参数、触发原因、编译状态与引擎、`finalizedAt`、
  v5 的咨询计数等）、`paper.log.md`（谁写了什么、谁提了什么意见、如何采纳）。
- **检测顺序**：`xelatex` → `latexmk` → `pdflatex` → `lualatex` → `tectonic`（中文优先 xelatex，
  英文 pdflatex 优先）；`paperLatexCommand` 非空时优先尝试它，之后回到标准顺序。
- **编译**：在论文目录内执行、`-interaction=nonstopmode`、跑两遍；失败**先修复**（重跑 → 换引擎 →
  最小模板），到上限后**降级**：保留 tex+md，`paper.meta.json` 记 `not-detected` / `failed`，
  记日志并上报，不阻塞定稿、不抛错。
- **不覆盖既有 PDF**：宿主 fs 只支持文本写，`paper.pdf` 只能由编译器子进程产生，插件只做存在性校验；
  无引擎、编译持续失败、`format=md force` 三种形态都逐字节保留已有 `paper.pdf` 并在 meta 里记明原因。
- `paperFormat=md` 时不产出 tex，因此跳过编译，且不得产生"缺 tex 无法编译"的警告。

### 4. 团队合写与定稿代表（v4 / v5）

- **流程**：各成员写自己负责的部分 → 合并（去重、统一术语与记号）→ 至少一轮**交叉互审** →
  定稿代表梳理成最终稿 → 全体明确"可交付"才定稿；有异议则继续迭代（有轮次上限，超限记警告并把
  分歧写进附录）。全过程写入 `paper.log.md`。
- **v4**：`paperEditor` 默认 `office`，可选 `resident:<id>`。
- **v5**：自动流程**固定用 `academician`**（所办是根会话，没有唤醒路径）；`office` 只能通过手动
  `/v5 paper editor=office` 选择，此时所办**必须**先与全所交流（至少 1 条所办消息）并至少召开一次会议，
  把结论写进定稿说明，然后调用 `vibe_v5_finalize_paper`；缺一即被拒（`V5_PAPER_CONSULT_REQUIRED`）。

### 5. 本轮修复

- **v5 自动触发的心跳停摆**：paper 分支在重新武装心跳之前返回，被节流的提问会永久卡住（新增的
  自动触发守卫当场抓出）。现在 paper 的每个等待步骤都会重新武装心跳。
- **v2/v3 写手卡死**：新增写手判决与回收——心跳会回收"已停滞或已不在注册表"的写手并自动重派
  （有上限），随后给出明确的 `/vibe paper force` 提示；`force` 在 10 分钟窗口内返回可操作的错误
  （含子代理 id），超过窗口则回收并重新派发；被回收的写手若稍后返回会被记录，而不是静默丢弃。
- **既有 PDF 不被覆盖**（见 §3）：无引擎、编译持续失败、`format=md force` 三种形态都验证了
  `paper.pdf` 逐字节保留。
- **"不得编造"契约**：论文唤醒提示词明确要求只整理已有证据、不得编造、未决与被否证的条目必须
  显式标注；把措辞改成"可以编造"会立刻被守卫挡住。
- **v3 语料确定性**：paper 摘要嵌入的证据索引含毫秒时间戳文件名，两个语料 scrubber 增加时间戳归一化，
  连续两次运行的随包语料逐字节一致。
- **守卫**：自动触发（论文写完之前不得标记完成）、既有 pdf 保留与"不得编造"契约都有可证伪的检查
  （把对应逻辑改坏会立刻变红）；原先可被空过的论文判定检查一并修正。

### 6. 文档与契约

- 新增并随包发布 `docs/final-paper.md`：合并用户确认的规格与设计审计修订，写明各预设真实的收口信号、
  触发时序、产物、9 节骨架、LaTeX 检测与降级、团队流程与 v5 咨询门。
- 双语 README：四套各补 5 个参数行（v4/v5 另有第 6 个 `paperEditor`）与"最终论文 / Final paper"小节。
- `docs/test-timing.md` 与 `docs/AUDIT-CHECKLIST.md` 的套件/探针计数更正为 **57 = 39 套件 + 18 探针**，
  人设灵敏度探针更正为 13 条；npm 描述加入最终论文说明。

## 兼容性

- **DSH 支撑窗口不变**：`0.1.2-alpha.4 … 0.2.0-rc.2`；组合行（≥0.1.7）与目录（≤0.1.6）两条线都保留。
- **既有参数默认值未变**；新增的最终论文参数默认开启（`finalPaper=true`），要关掉自动触发设
  `finalPaper=false`（手动命令仍可用）。
- **数据与目录结构不变**：状态文件、项目布局与既有镜像位置照旧；`Paper/<id>/` 只是新增的产物目录，
  无需迁移。
- **提示词**：新增最终论文参数与 `/vN paper` 的说明，并写明"论文完成后才算完成"；随包语料已按当前
  四套重新生成。

## 升级

```sh
npm i dsh-vibe-math@latest
```

桌面版在「设置 → 插件」里更新；命令行 profile 用 `dsh plugin --profile <你的 profile> add dsh-vibe-math@latest`，随后重启 DSH。

---

# dsh-vibe-math 2.6.0 — Release Notes (English)

> Previous: 2.5.0. This release adds the **final paper**: each of the four presets writes a complete paper
> at closure that only organises evidence it already has, and the paper phase runs **before** the run is
> marked complete. Existing parameter defaults, data formats and the directory layout are unchanged, the
> supported DSH window is unchanged, and no migration is needed.

---

## Overview

- **Final paper** is new and **on by default** (`finalPaper=true`). Once the closure signal fires and
  **before the run is marked complete**, the run enters the paper phase.
- The artifacts live in `Paper/<id>/`: `paper.md`, `paper.tex`, `paper.pdf` (only when the host has a
  LaTeX engine and the compile succeeds), `paper.meta.json` and `paper.log.md`.
- v4/v5 co-author the paper **as a team**: each member writes its own part → merge → cross-review →
  the editor finalises → the paper is finalised only when everyone agrees it is deliverable. In v5 the
  default editor is the academician; the institute office is available only on the manual path and must
  first consult the whole institute and convene a meeting.
- A failed compile is **repaired first, degraded second**: with no engine or a failing compile the tex+md
  are still delivered with a logged warning, the finalisation is never blocked, and an existing
  `paper.pdf` is never overwritten.
- The release also fixes: a v5 automatic-trigger heartbeat stall, v2/v3 writers that could hang and block
  forever, non-determinism in the v3 shipped corpus, and a paper verdict check that could pass vacuously.
- The contract document `docs/final-paper.md` ships with the package, and both READMEs now document the
  parameters and usage.

## Changes

### 1. New feature: the final paper (all four presets, on by default)

- **Trigger**: each preset uses its own closure signal (v2 strict termination, v3 full closure, v4 the
  closing meeting's unanimous stop vote, v5 the "solved" decision on each solve vote). The run then enters
  the paper phase, and **the run is marked complete only after the paper is finalised or has degraded** —
  otherwise the meeting/wake mechanisms are already disabled and team co-authoring cannot run.
- **Manual**: `/vibe paper [lang=zh|en] [format=both|md|tex] [force]` (v2/v3),
  `/v4 paper [… editor=office|resident:<id>] [force]`, `/v5 paper [… editor=office|academician] [force]`.
  Command-line overrides apply to that invocation only (they are not written back to the persisted
  parameters); `force` rewrites an already-finalised paper; an invalid argument returns `kind:'error'`;
  `finalPaper=false` disables only the automatic trigger, and the manual command still works and says so.
- **Idempotent**: one paper per run (`finalizedAt` plus a per-artifact existence check); a repeated
  trigger only fills in missing artifacts.
- **The nine-section skeleton (identical in all four presets)**: ① title, authors, date and abstract
  ② introduction and problem background ③ the complete solution of the original problem ④ the verified
  propositions (with the estimated truth values and their evidence) ⑤ solved sub-problems / intermediate
  results ⑥ methods, theories, ideas, useful experience and mathematical understanding created or
  discovered ⑦ patterns distilled from the above ⑧ discussion, limitations and outlook ⑨ appendix:
  evidence and file index. The paper only organises existing evidence and **must not fabricate**;
  unresolved and refuted items must be marked explicitly.

### 2. Parameters

- `finalPaper` (default `true`, all four): write the final paper automatically at closure; `false` disables
  only the automatic trigger.
- `paperFormat` (default `both`, all four): `both` (md+tex) / `md` (markdown only; skips compilation and
  does not warn about a missing tex) / `tex`.
- `paperLanguage` (default `zh`, all four): `zh` (`ctexart`, engine prefers `xelatex`) /
  `en` (`article`, engine prefers `pdflatex`).
- `paperCompilePdf` (default `true`, all four): compile `paper.pdf` when a LaTeX engine is detected.
- `paperLatexCommand` (default empty, all four): try this engine executable first; if it cannot be
  resolved, degrade as "not detected".
- `paperEditor` (v4/v5 only): v4 defaults to `office` (the session root / human side) and also accepts
  `resident:<id>` (if that member has left, it degrades back to office and the meta/log say so);
  v5 defaults to `academician`, and `office` is available only on the manual path.

### 3. Artifacts, LaTeX detection and degradation

- **Layout**: `Paper/<id>/`, with the id normalised by each preset's existing helper (including path
  traversal protection). It contains `paper.md`, `paper.tex`, `paper.pdf`, `paper.meta.json` (parameters,
  trigger, compile status and engine, `finalizedAt`, the v5 consultation counts) and `paper.log.md`
  (who wrote what, who raised which review point, and how it was adopted).
- **Detection order**: `xelatex` → `latexmk` → `pdflatex` → `lualatex` → `tectonic` (`xelatex` first for
  Chinese, `pdflatex` first for English). A non-empty `paperLatexCommand` is tried first, then the standard
  order.
- **Compilation**: run inside the paper directory with `-interaction=nonstopmode`, twice; on failure it is
  **repaired first** (rerun → switch engine → minimal template) and only then **degraded**: tex+md are
  kept, `paper.meta.json` records `not-detected` / `failed`, a warning is logged and reported, the
  finalisation is not blocked and nothing is thrown.
- **An existing PDF is never overwritten**: the host fs only supports text writes, so `paper.pdf` can only
  be produced by the compiler subprocess and the plugin merely checks that it exists. With no engine, with
  a persistently failing compile, and with `format=md force`, an existing `paper.pdf` is kept byte for byte
  and the meta records why.
- With `paperFormat=md` no tex is produced, so compilation is skipped and no "cannot compile without tex"
  warning may appear.

### 4. Team co-authoring and the editor (v4 / v5)

- **Flow**: each member writes its own part → merge (deduplicate, unify terms and notation) → at least one
  **cross-review** round → the editor turns it into the final draft → the paper is finalised only when
  everyone agrees it is deliverable; objections keep iterating (bounded, after which a warning is recorded
  and the disagreement goes into the appendix). The whole process is written to `paper.log.md`.
- **v4**: `paperEditor` defaults to `office`, and also accepts `resident:<id>`.
- **v5**: the automatic flow **always uses `academician`** (the office is the root session and has no wake
  path). `office` is available only through the manual `/v5 paper editor=office`, and that path requires
  the office to consult the whole institute first (at least one office message) and to convene at least one
  meeting, to state the conclusion in the finalisation note, and then to call `vibe_v5_finalize_paper`;
  without both counts it is refused (`V5_PAPER_CONSULT_REQUIRED`).

### 5. Fixes in this release

- **v5 automatic-trigger heartbeat stall**: the paper branch returned before re-arming the heartbeat, so a
  throttled ask could hang forever (the new automatic-trigger guard caught it). Every waiting step of the
  paper flow now re-arms the heartbeat.
- **v2/v3 hung writers**: a new writer verdict and reaper — the heartbeat reaps writers that have stalled
  or left the registry and re-dispatches them (bounded), after which it points at `/vibe paper force`;
  `force` returns an actionable error inside the 10-minute window (including the subagent id) and reaps and
  re-dispatches past it; a reaped writer that returns later is recorded instead of being dropped silently.
- **An existing PDF is never overwritten** (see §3): with no engine, with a persistently failing compile
  and with `format=md force`, the file is verified to be kept byte for byte.
- **The "must not fabricate" contract**: the paper wake-up prompts now require that only existing evidence
  is organised, that nothing may be fabricated, and that unresolved or refuted items are marked explicitly;
  rewording that to "may fabricate" is caught by the guards immediately.
- **v3 corpus determinism**: the paper summary embedded an evidence index with a millisecond-timestamped
  log name; both corpus scrubbers now normalise the timestamp, so two consecutive runs produce
  byte-identical shipped corpora.
- **Guards**: the automatic trigger (the run must not be marked complete before the paper is written), the
  preservation of an existing pdf and the "must not fabricate" contract all have falsifiable checks (break
  the corresponding logic and they go red); a paper verdict check that used to pass vacuously was corrected
  as well.

### 6. Documentation and the contract

- `docs/final-paper.md` is new and ships with the package: it merges the user-approved specification with
  the design-audit amendments and states each preset's real closure signal, the ordering, the artifacts,
  the nine-section skeleton, detection and degradation, the team flow and the v5 consultation gate.
- Both READMEs gain the five parameter rows per preset (plus the sixth, `paperEditor`, on v4/v5) and a
  "final paper" section.
- The suite/probe counts in `docs/test-timing.md` and `docs/AUDIT-CHECKLIST.md` are corrected to
  **57 = 39 suites + 18 probes**, and the persona sensitivity probes to 13; the npm description mentions
  the final paper.

## Compatibility

- **Supported DSH window unchanged**: `0.1.2-alpha.4 … 0.2.0-rc.2`; both the composition-row (≥ 0.1.7) and
  directory (≤ 0.1.6) lines are kept.
- **Existing parameter defaults are unchanged**; the new final-paper parameters default to on
  (`finalPaper=true`) — set `finalPaper=false` to disable the automatic trigger (the manual command still
  works).
- **No data or layout change**: the state file, the project layout and the existing mirror locations are
  unchanged; `Paper/<id>/` is only a new artifact directory, and no migration is needed.
- **Prompts**: the final-paper parameters and `/vN paper` are documented, and the prompts state that the
  run is complete only after the paper. The shipped corpora were regenerated for the current four presets.

## Upgrade

```sh
npm i dsh-vibe-math@latest
```

Desktop updates through Settings → Plugins; a CLI profile uses
`dsh plugin --profile <your profile> add dsh-vibe-math@latest`, then restart DSH.

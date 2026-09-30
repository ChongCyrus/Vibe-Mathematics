# dsh-vibe-math 2.5.0 — 发布说明（中文）

> 上一版：2.4.1。本版是**深度审计后的修复版本**：四套预设的提示词、工具面、组合声明与数据格式未做破坏性变更，
> 但修复了多处"看起来能跑、实际目标功能不成立"的缺陷（含三处会丢数据或让运行停摆的问题），并新增多项守卫。

---

## 概览

- 本轮对 v2/v3/v4/v5 四套预设 + 安装器 + 全部守卫做了多轮独立审计与交叉证伪（审计结论：**所有宿主接口/工具/命令调用在 DSH 0.2.0-rc.2 上均存在且调用形状正确**；问题集中在目标功能与内部逻辑）。
- 修复了 **3 处会造成实际损害的问题**：v5 的状态文件会被空研究所覆盖、v2 的验证日志文件名可越出项目目录、v4 的邮箱投递失败会让调度器永久停摆。
- 还修掉 **v4 的"真实 /compact"从未生效**、**v3 空闲时每 tick 空转派生 planner**、**v3 单票即可写入 `Verified/`**、**v5 同 tick 并发提议会丢提案**等。
- 在本机 DSH 0.2.0-rc.2 上做了**真实宿主端到端验证**：四个预设正常注册（order 20–23）、零激活警告、组合行线上不再写旧的 `.agent-presets` 目录。
- 测试与守卫大幅加强：全仓 **38 套件 + 18 探针**全部纳入自动门禁（此前有若干探针未被收集），并修正了一处测试抖动与一处语料非确定性。

## 变更

### 1. 数据安全与"运行不卡死"

- **v5 状态文件不再被覆盖**：状态后端改为**按路径锁存**，读取未成功即**拒绝写入**；对已存在的研究所改为**采纳**而非重置。此前会话里第一次工具调用会锁存默认路径，随后指定研究所的配置会把它覆盖成空研究所。
- **v2 路径逃逸**：验证日志文件名改用 `safeId` 归一化，`q.id="x/../../../../pwn"` 这类输入不再能把文件写出项目目录。
- **v4 调度器停摆**：邮箱投递失败的两条路径（立即投递失败、brainstorm 阶段无处重投）都会重排队并在后续 pass 重试，不再出现"心跳已清、永不重试"的静止状态。
- **v5 队列竞态**：验证队列的追加与取头改为在事件折叠内完成，同一 tick 内两个成员同时提议不再丢提案。

### 2. 目标功能真正可达

- **v4 的 `/compact`**：按 `subagent/start` 载荷认领活动 Agent，真实压缩调用（`compactNow`）首次真正生效。
- **v2 的"判断命题"链**：为判断问题补种可验证的解法入口，使"问题 → 判断问题 → 验证 → 收口"主线真正跑通。
- **v3 的空转**：空闲时不再每个 tick 派生 planner（实测由 41 次降到 13 次，并首次出现正常终止）。
- **v3 的项目锁**：改为**定时器续租**（此前的续租写在 tick 内，单次慢 tick 就会让别的会话无 override 夺锁）。
- **v3 的最小票数**：要求达到承诺的验证者数量、且**至少 2 票**才裁决，单票不再能把命题写成"已验证·真"。

### 3. 语义与表述对齐（含提示词面）

- **v4 验证契约**：人设与工具描述明确"**只有精确的 1 / 0 是绝对真/绝对假**；介于 0 与 1 之间是模型认为的概率，只有全 1 或全 0 才算全体一致，否则取**平均概率**更新布尔估计"（代码分支未改，此前示例与说明不足）。
- **v5 的 m-vote 表述**：文档/人设/README 改为与计票代码一致——"**至少 m 张布尔票且没有任何一张反对票**，默认名册下退化为全体一致"，并删除"比全体一致更易收敛"这一**不实**说法。
- **四套同级**：v2/v3 改称"经典"、v4/v5 为"实验性"，npm 描述、选择器描述、人设文本、v3 设计文档、安装段顺序全部对齐（此前只有 README 改了）。
- **v2 的侧信道**：推送汇报的消息来源由未声明的 `kind:'plugin'` 改为已声明的 `kind:'user'`；`solver/verifierMaxToolCalls` 改为如实标注为"仅提示、不强制"。
- **v5 的调用者授权**：`isOffice` 不再把空身份当所办；无法识别身份的成员调用一律拒绝（此前一个幽灵身份可以改优先级、甚至删掉真实任务）。
- **v5 的工具描述**：补齐会议 `kind` 枚举与 `target`、说明 `hire.term`。

### 4. 安装器、声明与守卫

- **形态判定改能力差**：旧线上"组合行 registry 包"根本不存在（已用 npm 元数据与包内容证实：0.1.6-alpha.2 无 `@deepseek-ai/dsh-agent-preset`，0.1.7-rc.2 才有），判定改用 `register` 能力，并新增可证伪守卫（把该行改回 `list` 只有新守卫会红）。
- **声明行补宿主 group 标记**：8 处嵌套 `!!js` 现在以表达式形式保留给 preset 作用域，而不是在声明域被就地求值。
- **安装器更安全**：preset 文件改**原子写**；删除 preset 前**先备份**用户改动过的文件；**读不出来**的文件不再被无备份删除；状态文件内容不变则跳过写、写失败会告警、`listBundles` 有超时兜底。
- **守卫扩面**：`run-tests` 现在收集**全部**测试与探针（此前有 2 套红探针被静默漏收），修正了一处测试抖动（v4 会议用例）与一处语料非确定性（v3），并新增安装器/声明/命令失败路径/宿主失败路径等守卫。

## 兼容性

- **DSH 支撑窗口不变**：`0.1.2-alpha.4 … 0.2.0-rc.2`；组合行（≥0.1.7）与目录（≤0.1.6）两条线都保留，且新增能力差判定后旧线不会再被误判。
- **数据与目录结构不变**：`State/<研究所>.v5state.json`、项目布局、镜像文件位置均照旧；无需迁移。
- **提示词**：除"v4 验证契约/闭包规则说明、v5 m-vote 表述、v2/v3/v4 人设补一行一致的闭包规则、v5 工具描述补字段"之外未改动；语料已按当前四套重新生成。
- **参数默认值**：未变（v2 每个待验证对象最多 `max(2, min(verifierCount, maxParallelThreshold-2))` 个验证者，默认配置下为 2；工具调用上限仍为提示性）。

## 升级

```sh
npm i dsh-vibe-math@latest
```

桌面版在「设置 → 插件」里更新；命令行 profile 用 `dsh plugin --profile <你的 profile> add dsh-vibe-math@latest`，随后重启 DSH。

---

# dsh-vibe-math 2.5.0 — Release Notes (English)

> Previous: 2.4.1. This release is the outcome of a deep, independently cross-checked audit: the four
> presets' prompts, tool surface, composition declarations and data formats have no breaking change, but
> several defects that "looked like they worked while the intended function did not" are fixed — three
> of them could lose data or stall a run — and the guard suite is substantially stronger.

---

## Overview

- Multiple audit rounds with independent falsification covered the four presets, the installer and every
  guard. Verdict: **every host interface, tool, command and service call exists on DSH 0.2.0-rc.2 with
  the correct call shape**; the defects were in goals and internal logic.
- Three fixes prevent real damage: v5's state file being overwritten by an empty institute, v2's
  verification-log filename escaping the project directory, and v4's scheduler stalling forever after a
  failed mailbox delivery.
- Also fixed: v4's "real /compact" never firing, v3 spawning a planner on every idle tick, v3 finalising
  a proposition on a single vote, and v5 losing a proposal when two members proposed in the same tick.
- Verified on a **real DSH 0.2.0-rc.2 host**: the four presets register (orders 20–23) with zero
  activation warnings, and the row line no longer writes the legacy `.agent-presets` directory.
- Guards grew from 30 to **38 suites + 18 probes**, all collected by the gate (several probes used to be
  silently skipped); one flaky test and one non-deterministic corpus were fixed.

## Changes

### 1. Data safety and "no run can stall"

- **v5 state file can no longer be overwritten**: the backend latches **per path** and **refuses to
  write** when the read never succeeded; an existing institute is **adopted** instead of reset. The
  first tool call of a session used to latch the default path, after which configuring a named institute
  overwrote it with an empty one.
- **v2 path escape**: the verification-log filename is normalised with `safeId`, so an id such as
  `x/../../../../pwn` can no longer write outside the project directory.
- **v4 scheduler stall**: both failed-mailbox paths (immediate delivery rejection, and the brainstorm
  phase where nothing retried) now re-queue and retry on a later pass.
- **v5 queue race**: queue append and head-take now happen inside the event fold, so two members
  proposing in the same tick can no longer lose a proposal.

### 2. The intended function actually happens

- **v4 `/compact`**: the live Agent is claimed from the `subagent/start` payload, so the real
  `compactNow` finally fires.
- **v2's judge-problem chain**: the judge problem now carries a verifiable solution entry, so
  problem → judge problem → verification → closure really runs.
- **v3 idle spawning**: no planner is spawned on every idle tick any more (measured 41 → 13) and a
  normal termination was observed for the first time.
- **v3 project lock**: renewal moved to a timer (it used to live inside `tick()`, so one slow tick let
  another session steal the lock without an override).
- **v3 minimum votes**: the promised verifier count and at least two votes are now required before a
  verdict; a single vote can no longer write `Verified/`.

### 3. Semantics and wording aligned (including prompt-facing text)

- **v4 verdict contract**: the persona and tool description now state that **only an exact 1 / 0 is
  absolutely true/false**; anything strictly between is the model's probability of truth, only an all-1
  or all-0 set is unanimity, and otherwise the **mean** updates the boolean estimate (the code path is
  unchanged; the example and explanation were insufficient).
- **v5 m-vote**: docs, persona and README now match the tally — "**at least m boolean votes with no
  opposing vote**, which degenerates to unanimity on the default roster" — and the false claim that it
  "converges more easily than unanimity" is gone.
- **Four peers**: v2/v3 are "classic", v4/v5 "experimental" — the npm description, picker descriptions,
  persona text, v3's design doc and the install-section order were all brought in line (previously only
  the READMEs).
- **v2 side channels**: the push report's message source is the declared `kind:'user'`; the
  `solver/verifierMaxToolCalls` settings are now honestly described as advisory.
- **v5 caller authorisation**: `isOffice` no longer treats an empty identity as the office, and tool
  calls from an unidentifiable caller are refused (a ghost identity could previously change priorities
  and even delete a real task).
- **v5 tool descriptions**: the meeting `kind` enum plus `target`, and `hire.term`, are now documented.

### 4. Installer, declarations and guards

- **Mechanism detection by capability**: the row registry package does not exist on the old line
  (proven from npm metadata and package contents: 0.1.6-alpha.2 has no
  `@deepseek-ai/dsh-agent-preset`, 0.1.7-rc.2 adds it), so the decision now tests the `register`
  capability, with a falsifiable guard (reverting that one line turns only the new guard red).
- **Declaration rows carry the host group marker**: the eight nested `!!js` expressions are preserved
  for the preset scope instead of being evaluated in the declaring realm.
- **Safer installer**: preset files are written atomically; a user-edited file is backed up before its
  preset is dropped; an unreadable file is no longer deleted without a backup; the state file is
  skipped when unchanged, write failures warn, and `listBundles` has a timeout fallback.
- **Wider guards**: `run-tests` now collects **every** test and probe (two red probes used to be
  silently skipped), one flaky test (v4 meetings) and one non-deterministic corpus (v3) were fixed, and
  new guards cover the installer, the declaration row, command failure paths and host failure paths.

## Compatibility

- **Supported DSH window unchanged**: `0.1.2-alpha.4 … 0.2.0-rc.2`; both the composition-row (≥ 0.1.7)
  and directory (≤ 0.1.6) lines are kept, and the capability-based verdict means the old line can no
  longer be misclassified.
- **No data or layout change**: `State/<institute>.v5state.json`, the project layout and the mirror file
  locations are unchanged; no migration needed.
- **Prompts**: unchanged except the v4 verdict-contract/clojure-rule wording, the v5 m-vote wording, one
  consistent closure-rule line added to the v2/v3/v4 personas, and the added v5 tool-description fields;
  corpora were regenerated for the current four presets.
- **Defaults**: unchanged (v2 caps reviewers per target at
  `max(2, min(verifierCount, maxParallelThreshold-2))`, i.e. 2 on the default configuration; the tool-call
  limits remain advisory).

## Upgrade

```sh
npm i dsh-vibe-math@latest
```

Desktop updates through Settings → Plugins; a CLI profile uses
`dsh plugin --profile <your profile> add dsh-vibe-math@latest`, then restart DSH.

# dsh-vibe-math 2.4.0 — 发布说明（中文）

> 上一版：2.3.16。本版**适配 DSH 0.2.0**：修复"在新版 DSH 上四个预设装了却看不见"（预设交付机制换代），
> 并修掉三处会在新宿主上真实发作的缺陷（v5 状态写坏宿主会话、工具过滤导致派生失败、常驻数量上限）。
> 其中第 2 条是**数据安全级**修复，请优先阅读。

---

## 概览

- **新版 DSH 上预设终于可见**：DSH 0.1.7 起 agent preset 改由"组合行"声明，而旧版写入的 `~/.dsh/.agent-presets/`
  目录**已无人读取**——2.3.x 在新宿主上会"安装成功，但预设选择器里什么都没有"。本版用同一份 bundle 同时适配两条线。
- **v5 不再写坏你的会话**：v5 过去把研究所事件追加进宿主会话日志，而 DSH 的会话持久化遇到不认识的事件类型会
  **拒绝加载整个会话**——症状是"某次重启后这个会话打不开"。现在研究所状态只落在 `State/<研究所>.v5state.json`。
- **三处新宿主行为已适配**：工具过滤里的未注册工具名（会让派生直接失败）、宿主对常驻子代理的数量上限、
  以及"真正执行压缩"的调用。

## 变更

### 1. 适配 DSH 0.2.0：一条 bundle 覆盖两条版本线

- **DSH ≥ 0.1.7（含 0.2.0）**：四个预设作为**组合行**随 `cordis.patch.yml` 声明，安装后立即出现在预设选择器里；
  不再往 `~/.dsh/.agent-presets/` 写文件（该目录在新版里已废弃，安装器会跳过并在日志里说明可安全删除）。
- **DSH ≤ 0.1.6**：仍走目录形式，安装器照旧写入四个 preset 目录；同一份声明行在旧版上**静默无副作用**、不会报错。
- 兼容窗口随之更新为 **0.1.2-alpha.4 … 0.2.0-rc.2**（此前 0.2.0 被标为超出范围）。同时声明 `peerDependencies`：
  新版 DSH 会用它比对宿主版本，不满足时**跳过整个 bundle 并给出可读提示**，而不是挂上一个跑不通的预设。
- 安装与升级方式不变：桌面版在「设置 → 插件」里安装或更新；命令行 profile 用
  `dsh plugin --profile <你的 profile> add dsh-vibe-math@latest`。

### 2. 修复：v5 的研究所状态会写坏宿主会话（数据安全级）

- **症状**：v5 把 `vibe5/*` 事件追加进**你自己的**会话日志；DSH 的会话持久化在加载时要求"不认识的事件类型必须带
  `ignorable: true`"，而 `Session.append` 无法设置该字段 → **该会话从此无法恢复**，且写入当时毫无提示。
- **现在**：研究所状态只写加固 JSON（`State/<研究所>.v5state.json`：同一份事件折叠、串行写、读前必 load），
  **不再向任何宿主会话日志追加事件**，v5 也因此少一个宿主服务依赖。
- **如果你有旧会话**：修复之前写下的 v5 事件仍可能让那个会话加载失败——在会话列表里新建会话重开研究所即可；
  镜像 Markdown 与 `Verified/` 下的文件都不受影响。

### 3. 修复：派生不再因工具名或数量上限而整体失败

- **工具过滤**：DSH 对 `tools.restrict()` 里未注册的工具名**直接抛错**，而该调用发生在建立子代理时——v4/v5 此前会把
  整次派生搞失败。现在按宿主提示剔除未注册名后重试一次，并且**绝不回退到"不过滤"**（那等于放开你明确禁止的工具）。
- **数量上限**：新版 DSH 对每个根代理的**存活 continuable 子代理**设了上限（`subagent` 行的 `maxActiveSubagents`，
  默认 8）。撞到上限时现在会**明确提示**上限值并把该次派生推迟到下一轮，而不是让启动循环崩在半途。

### 4. 修复：真实压缩与状态描述

- v4/v5 的真实 `/compact` 改为优先调用**真正执行压缩**的 `compactNow`（`compactIfNeeded` 是策略调用，可能什么都不做
  且不报错）；v5 同时改为使用 preset 自己隔离域里的 compaction 实例。
- v5 写入你项目里的镜像文件（`Institutes.md`、`Shared/TaskBoard.md`、`State/README.md`）以及**给模型看的工具说明**
  曾写着"权威状态在会话日志投影里"——现已改为真实位置（状态 JSON 文件）。

## 兼容性

- 四套预设的**提示词、语料与工具面**除上述修复外未变；`~/.dsh/.agent-presets/` 目录形式（DSH ≤ 0.1.6）继续受支持。
- 不改变任何参数默认值与数据格式；`State/<研究所>.v5state.json` 沿用原有实现（此前是回退路径），老文件可直接复用。
- 若你为同一个 preset id 自己保存过声明，本包会放弃注册并打印一行说明，以你的声明为准。
- 新增守卫：`cordis.patch.yml` 与其生成器必须逐字节一致、`dsh.bundle.patch` 必须是字符串、声明行不得命名宿主包、
  不得使用会调用服务的 `!!js` 门——这四条都是本次实测踩出来的。

## 升级

```sh
npm i dsh-vibe-math@latest
```

桌面版在「设置 → 插件」里更新；命令行 profile 若把版本钉死了，先升级那个依赖再重启 DSH：

```sh
dsh plugin --profile <你的 profile> add dsh-vibe-math@latest
```

升级后**重启 DSH**，然后在预设选择器里确认出现 Vibe Math V2 / V3 / V4 / V5。

---

# dsh-vibe-math 2.4.0 — Release Notes (English)

> Previous: 2.3.16. This release **adapts the package to DSH 0.2.0**: it fixes "the four presets install
> but never appear on the new DSH line" (the preset delivery mechanism changed), and it fixes three
> defects that really fire on the new host (v5 corrupting the user's own session, tool filters breaking
> delegation, and the host's cap on live child agents). Item 2 is a **data-safety** fix — read it first.

---

## Overview

- **The presets are visible again on the current DSH line.** Since 0.1.7 an agent preset is declared as
  a composition row, and nothing reads the `~/.dsh/.agent-presets/` directory any more — so 2.3.x
  installed "successfully" on the new host and then showed **no presets at all**. One bundle now serves
  both lines.
- **v5 no longer damages your session.** v5 used to append institute events to the host session log, and
  DSH's session persistence **refuses to load a session** that carries an unknown event type — the
  symptom is "that session will not open any more after a restart". Institute state now lives only in
  `State/<institute>.v5state.json`.
- **Three new host behaviours are handled**: unregistered tool names in a tool filter (which made
  delegation fail outright), the host's cap on live resident children, and the call that actually
  performs a compaction.

## Changes

### 1. DSH 0.2.0 adaptation: one bundle, two version lines

- **DSH ≥ 0.1.7 (including 0.2.0)**: the four presets are declared as **composition rows** in
  `cordis.patch.yml` and appear in the preset picker right after installation. Nothing is written to
  `~/.dsh/.agent-presets/` any more (the installer skips it and says in the log that the directory can be
  deleted safely).
- **DSH ≤ 0.1.6**: the directory form is unchanged — the installer still writes the four preset
  directories, and the same declaration rows are **silently inert** on that line (no boot errors).
- The supported window is now **0.1.2-alpha.4 … 0.2.0-rc.2** (0.2.0 used to be declared out of range).
  The package also declares `peerDependencies`, which the new DSH uses to **skip an incompatible bundle
  with a readable message** instead of mounting a preset that cannot work.
- Installing and upgrading are unchanged: Desktop installs or updates through Settings → Plugins; a CLI
  profile uses `dsh plugin --profile <your profile> add dsh-vibe-math@latest`.

### 2. Fix: v5 institute state could make your session unresumable (data safety)

- **Symptom**: v5 appended `vibe5/*` events to **your own** session log. On load, DSH's session
  persistence requires an unknown event type to carry `ignorable: true`, and `Session.append` cannot set
  that field — so **that session could never be resumed**, silently at write time.
- **Now**: institute state is written only to the hardened JSON file (`State/<institute>.v5state.json`:
  the same event fold, serial writes, a mandatory load before read). **Nothing is appended to any host
  session log**, and v5 no longer needs that host service.
- **If you have older sessions**: events written before this fix can still prevent that particular
  session from loading — open a new institute in a new session. The mirror Markdown and everything under
  `Verified/` are unaffected.

### 3. Fix: delegation no longer fails as a whole because of a tool name or the host cap

- **Tool filters**: DSH **throws** for a tool name outside its registered set, and that call happens while
  a child agent is being created — which used to fail the whole delegation in v4/v5. The framework now
  drops the unregistered names (taken from the host's own rejection message) and retries once, and it
  **never falls back to "no filter"** — that would grant exactly what you denied.
- **The host cap**: the current DSH caps **live continuable children** per root agent
  (`maxActiveSubagents` on the `subagent` row, default 8). Hitting the cap now reports the limit and
  defers that spawn to the next round instead of crashing the startup loop halfway through.

### 4. Fix: real compaction and stale state descriptions

- v4/v5's real `/compact` now prefers `compactNow`, the call that actually compacts (`compactIfNeeded` is
  a policy call that may quietly do nothing); v5 also uses the compaction instance from its own preset
  isolate realm.
- The mirror files v5 writes into your project (`Institutes.md`, `Shared/TaskBoard.md`,
  `State/README.md`) and the **model-facing tool description** used to say the authoritative state was a
  session-log projection. They now state the real location (the state JSON file).

## Compatibility

- Aside from the fixes above, the four presets' **prompts, corpora and tool surface are unchanged**, and
  the `~/.dsh/.agent-presets/` directory form (DSH ≤ 0.1.6) remains supported.
- No parameter default or data format changes; `State/<institute>.v5state.json` uses the implementation
  that already existed as the fallback path, so existing files keep working.
- If you saved your own declaration for the same preset id, this package gives up its registration and
  logs one line — your declaration wins.
- New guards: `cordis.patch.yml` must be byte-identical to what its generator emits, `dsh.bundle.patch`
  must be a string, a declaration row must not name a host package, and it must not use a `!!js` gate that
  calls a service — all four were measured the hard way during this adaptation.

## Upgrade

```sh
npm i dsh-vibe-math@latest
```

Desktop updates through Settings → Plugins. If a CLI profile pinned the version, update that dependency
and restart DSH:

```sh
dsh plugin --profile <your profile> add dsh-vibe-math@latest
```

After upgrading, **restart DSH** and confirm that Vibe Math V2 / V3 / V4 / V5 appear in the preset picker.

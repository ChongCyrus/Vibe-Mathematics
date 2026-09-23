# dsh-vibe-math 2.3.16 — 发布说明（中文）

> 上一版：2.3.15。本版把**英文文档与英文配图补齐**：英文 README 全篇英文化，并为它单独提供
> **四张英文版架构图**；同时修正两份 README 里一处与实现不符的 v2 数据层描述，并把 v1 时期的旧架构文档标注清楚。
> 四套预设的代码、提示词与语料**字节未变**，运行时行为不变。

---

## 概览

- **英文 README 全篇英文**：示例对话、参数表、目录树占位符与链接文案都改成英文；只有**必须与实现一致**的真实字面量
  保留中文（真实目录 / 文件名、真实 JSON 键、真实 Markdown 格式锚点），并在首次出现处加了英文括注。
- **四张英文版架构图**：`示例图/框架图-v2-en.svg` … `-v5-en.svg`，只被英文 README 引用；四张中文图完全未改动。
- **修正一处事实错误**：两份 README 此前称 v2 会把 `qs.csv` 回写为 `solved`、并生成 `q1-的解法_<标识>.csv`——
  v2 **从不写任何 CSV**，已按实现改正。
- **旧架构文档标注范围**：`docs/架构图.md` 描述的是 v1 时期的布局，现在文件开头与 README 的引用处都明确标注为历史文档。

## 变更

### 1. 英文 README 全篇英文化

- 示例提示词、参数表、目录树里的占位符（`<项目>` → `<project>` 等）、链接文案全部改为英文。
- 保留中文的只有**真实字面量**：真实目录与文件名（`示例图/…`、`Verified/命题/`、`Logs/报告.md` 等）、
  真实 JSON 键（`已解决`、`正确概率`）、真实 Markdown 格式锚点（`- ID/类型/状态/概率/…`、
  `### 解法/证明/证伪 N｜标题｜概率X｜状态Y`），以及会话重建标记 `【会话重建 —— <角色> <id>】`。
  这些在英文版里首次出现处都加了英文括注，读者不会误以为是漏译。
- 守卫加强：英文版除上述字面量外不得残留中文正文；中英两版的章节层级、表格行数、代码块数、图片与本地链接
  必须一一对应，只改一边会被直接检出。

### 2. 四张英文版架构图

- 新增 `示例图/框架图-v2-en.svg`、`-v3-en.svg`、`-v4-en.svg`、`-v5-en.svg`，英文 README 单独引用；
  **中文版四张图未做任何改动**（中文 README 只同步了下面第 3、4 两节的修正）。
- 生成方式：v4/v5 用仓库里现有的零依赖生成脚本加 `--lang=en`；v2/v3 新增零依赖 Node 生成脚本
  `docs/generate_framework_diagram_v{2,3}_en.mjs`（中文 v2/v3 海报仍由原来的 matplotlib 脚本产出，未动）。
- 英文图内同样只保留真实字面量的中文（例如 v3 的 md 锚点、v4/v5 的 `Verified/命题/<id>.md` 路径），其余全英文；
  生成脚本自带「文字溢出即告警并以非零码退出」的自检，守卫会校验每张图完整、可解析且正文为英文。

### 3. 修正 v2 数据层描述（两份 README）

- 旧文写的是 v1 时代的行为：调度器读 `qs.csv`、把问题回写为 `solved`、解法另存 `q1-的解法_<标识>.csv`。
- v2 的真实行为：问题与解法都在 `qs/qs.json`（`已解决` 布尔、解法列表带 `正确概率`），
  定论事实进入 `Verified/<分类>_Verified.json`；**v2 不产生任何 CSV**。
- 英文版同时补上了这些真实键名的英文含义，读者不必对着陌生键名猜。

### 4. 旧架构文档标注适用范围

- `docs/架构图.md` 中的 `qs.csv`、`Pending_Verification/`、`Under_Verification/`、`Temp_Validated/` 等名称
  在 v2 起已不存在，这些目录在任何一套预设的代码里都找不到。
- 现在该文件开头写明它描述的是 **v1 历史布局**，并指向当前各版本的实现方案与架构图；
  两份 README 对它的引用也从「（v2 详解）」改为「（v1 历史架构图）」，不再把旧布局当成当前实现。

## 兼容性

- 四套预设（v2 / v3 / v4 / v5）的代码、提示词、语料、参数与工具面**均未变化**，运行时行为完全不变。
- 中文 README 仍是默认的 `README.md`，npm 页面与 GitHub 首页的默认内容不变；`screenshots.json` 的市场配图也未改动。
- 包内新增 4 张英文 SVG、2 个英文版生成脚本与本版发布说明；除此之外随包内容的变化只有 README 与文档说明。
- 本版只涉及文档、配图与测试守卫，不涉及任何运行时行为。

## 升级

```sh
npm i dsh-vibe-math@latest
```

若你在 profile 里把版本钉死了，先升级那个依赖再重启 DSH：

```sh
dsh plugin --profile <你的 profile> add dsh-vibe-math@latest
```

本次未改动预设文件，已安装的预设无需重新同步。无需迁移。

---

# dsh-vibe-math 2.3.16 — Release Notes (English)

> Previous: 2.3.15. This release finishes the **English documentation and its artwork**: the English
> README is now fully English and ships with its **own four architecture diagrams**, one statement
> about v2's data layer that did not match the implementation is corrected in both READMEs, and the
> v1-era architecture document is labelled as such. The four presets' code, prompts and corpora are
> **byte-identical**; runtime behaviour is unchanged.

---

## Overview

- **The English README is fully English**: example conversations, the parameter table, directory-tree
  placeholders and link labels are all English. Only literals that must stay verbatim for the reader
  to match the implementation stay Chinese (real file and directory names, real JSON keys, real
  Markdown anchors), each glossed in English where it first appears.
- **Four English architecture diagrams**: `示例图/框架图-v2-en.svg` … `-v5-en.svg`, referenced by the
  English README only; all four Chinese diagram files are untouched.
- **One factual error fixed**: both READMEs claimed v2 writes `qs.csv` back as `solved` and stores
  `q1-的解法_<标识>.csv`. v2 writes **no CSV at all**; the text now matches the implementation.
- **The old architecture document states its scope**: `docs/架构图.md` describes the v1-era layout, and
  both the file and the README links to it now say so.

## Changes

### 1. The English README is fully English

- Example prompts, the parameter table, directory-tree placeholders (`<项目>` → `<project>`, …) and
  link labels are all English.
- What stays Chinese is only the **real literals**: real file and directory names (`示例图/…`,
  `Verified/命题/`, `Logs/报告.md`, …), real JSON keys (`已解决`, `正确概率`), real Markdown anchors
  (`- ID/类型/状态/概率/…`, `### 解法/证明/证伪 N｜标题｜概率X｜状态Y`) and the session-rebuild marker
  `【会话重建 —— <角色> <id>】`. Each is glossed in English where it first appears, so nothing reads as
  an untranslated leftover.
- Stronger guard: outside those literals the English file may not contain Chinese prose, and the two
  READMEs must agree on heading levels, table rows, code fences, images and local links — editing only
  one side now fails the suite.

### 2. Four English architecture diagrams

- Added `示例图/框架图-v2-en.svg`, `-v3-en.svg`, `-v4-en.svg` and `-v5-en.svg`, referenced by the English
  README. **The four Chinese diagram files are unchanged** (the Chinese README only receives the two
  corrections described in sections 3 and 4 below).
- How they are produced: v4/v5 use the existing zero-dependency generator with `--lang=en`; v2/v3 have
  new zero-dependency Node generators, `docs/generate_framework_diagram_v{2,3}_en.mjs` (the Chinese
  v2/v3 posters still come from the original matplotlib scripts, which were not touched).
- The English diagrams also keep Chinese only for real literals (v3's md anchors, v4/v5's
  `Verified/命题/<id>.md` paths); everything else is English. Each generator warns and exits non-zero
  when a line overflows its container, and a guard verifies that every diagram is complete, parseable
  and English.

### 3. v2's data layer corrected in both READMEs

- The old text described v1 behaviour: a scheduler reading `qs.csv`, writing the problem back as
  `solved`, and storing the solution as `q1-的解法_<标识>.csv`.
- v2's real behaviour: problems and solutions both live in `qs/qs.json` (`已解决` boolean, solution list
  with `正确概率`), and settled facts go to `Verified/<category>_Verified.json`. **v2 produces no CSV.**
- The English version spells out what those key names mean, so no reader has to guess.

### 4. The old architecture document states its scope

- The names in `docs/架构图.md` — `qs.csv`, `Pending_Verification/`, `Under_Verification/`,
  `Temp_Validated/` — have not existed since v2 and appear in none of the shipped presets.
- The file now opens by saying it documents the **v1 historical layout** and points at the current
  specifications and diagrams; both READMEs now link to it as "(v1-era architecture notes)" instead of
  presenting the old layout as the current implementation.

## Compatibility

- The four presets (v2 / v3 / v4 / v5) are **unchanged** in code, prompts, corpora, parameters and tool
  surface; runtime behaviour is identical.
- The Chinese README is still the default `README.md`, so the npm page and the GitHub landing page keep
  their current content; the marketplace images in `screenshots.json` are unchanged.
- The package adds four English SVGs, two English generator scripts and this release's notes; apart
  from that, only the READMEs and documentation text changed.
- Documentation, artwork and test guards only — no runtime behaviour.

## Upgrade

```sh
npm i dsh-vibe-math@latest
```

If you pinned the version in a profile, update that dependency first and restart DSH:

```sh
dsh plugin --profile <your profile> add dsh-vibe-math@latest
```

No preset files changed, so installed presets need no re-sync. No migration needed.

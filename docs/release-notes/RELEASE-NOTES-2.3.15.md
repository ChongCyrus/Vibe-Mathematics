# dsh-vibe-math 2.3.15 — 发布说明（中文）

> 上一版：2.3.14。本版新增**英文 README 与中英切换**，把两张架构图重新导出为**完整的高清 PNG**，
> 并把发布说明固定为**中英双语**。四套预设的代码、提示词与语料**字节未变**，运行时行为不变。

---

## 概览

- **英文 README**：仓库现在同时提供中英文文档，页面顶部一行即可切换；中文版仍是默认的 `README.md`，
  所以 npm 页面与 GitHub 首页显示的内容**没有变化**。
- **架构图重新导出**：`示例图/框架图-v4.png` 与 `-v5.png` 此前**底部被裁掉一条**（图例整行不见了），
  现在重新导出为 **2× 高清、完整无裁切**的图（3440×2520 / 3440×2408）。
- **发布说明双语**：从现在起每一版都提供中文 + 英文两份，先中文后英文，节名固定。

## 变更

### 1. 英文 README 与中英切换

- 新增 `README.en.md`，与中文版**逐节对应**；两份 README 顶部各有切换链接
  （`English | 中文`）。
- 中文版仍是 `README.md`，因此 npm 页面与 GitHub 首页的默认内容不变。
- 新增守卫：两份 README 的**章节结构、图片、本地链接、表格行数、内部锚点**必须一一对应，
  且英文版不得残留未翻译正文——以后只改一边会被测试直接检出。

### 2. 架构图重新导出（底部不再被裁）

- **现象**：`框架图-v4.png` / `-v5.png` 最下面一条（图例行）不见了；而 PNG 的尺寸又恰好等于画布尺寸，
  所以从尺寸上完全看不出来。
- **原因**：导出用的是 `--window-size=<画布宽>,<画布高>` + `--headless=new`，而它截的是**窗口**，
  页面**视口**比窗口矮约 96px（浏览器 UI 占位），画布底部那一截根本没被绘制。
- **现在**：新增 [`docs/render_framework_diagram_png.mjs`](../../docs/render_framework_diagram_png.mjs)，
  按 SVG 自身尺寸渲染、裁掉多余高度，并**校验墨迹到达内容底边**——被裁就报错退出，不会再悄悄发布。
- **新增守卫**：四张架构图 PNG 必须真的装得下它自己的画面（解 PNG 与 SVG 比对墨迹范围），
  v2/v3 的 matplotlib 图同样纳入检查。

### 3. 发布说明改为中英双语

- GitHub Release 正文固定为「中文 → English」两段，节名统一：
  概览 / 变更 / 兼容性 / 升级 ↔ Overview / Changes / Compatibility / Upgrade。
- 只写使用者需要知道的信息；工程过程与证据留在仓库的审计台账与提交信息里。
- 发布门禁新增检查：当版发布说明必须同时包含中文与英文，缺一半直接判红。

## 兼容性

- 四套预设的代码、提示词与语料**字节未变**；参数、工具面与 `off` / `encourage` / `require` 行为不变。
- 安装器行为与 2.3.14 相同：版本一变即整体替换受管文件（手改原文先备份），同一版本不重写任何文件。
- 本版只改文档、图片与测试守卫，不涉及任何运行时行为。

## 升级

```sh
npm i dsh-vibe-math@latest
```

若你在 profile 里把版本钉死了，先升级那个依赖再重启 DSH：

```sh
dsh plugin --profile <你的 profile> add dsh-vibe-math@latest
```

无需迁移。

---

# dsh-vibe-math 2.3.15 — Release Notes (English)

> Previous: 2.3.14. This release adds an **English README with a language switcher**, re-exports two
> architecture diagrams as **complete high-resolution PNGs**, and fixes the release notes to a
> **bilingual** format. The four presets' code, prompts and corpora are byte-identical; runtime
> behaviour is unchanged.

---

## Overview

- **English README**: the repository now documents the project in both languages, switchable from one
  line at the top of either file. The Chinese README is still the default `README.md`, so what the npm
  page and the GitHub landing page show is unchanged.
- **Diagrams re-exported**: `示例图/框架图-v4.png` and `-v5.png` were **missing their bottom strip**
  (an entire legend row). They are now re-exported **complete at 2× resolution** (3440×2520 / 3440×2408).
- **Bilingual release notes**: from now on every release ships Chinese and English, Chinese first,
  with fixed section names.

## Changes

### 1. English README and language switching

- Added `README.en.md`, section-for-section parallel to the Chinese one; each file carries a switcher
  link at the top (`English | 中文`).
- The Chinese README remains `README.md`, so npm and the GitHub landing page keep their current content.
- New guard: the two READMEs must agree on **heading structure, images, local links, table rows and
  internal anchors**, and the English file must not contain untranslated prose — editing only one side
  now fails the suite.

### 2. Diagrams re-exported (nothing is cut off any more)

- **Symptom**: the bottom strip of `框架图-v4.png` / `-v5.png` (the legend row) was missing, while the
  PNG still measured exactly the canvas size — so no size-based check could ever see it.
- **Cause**: the export used `--window-size=<canvas width>,<canvas height>` together with
  `--headless=new`, which screenshots the **window** while the page **viewport** is ~96px shorter
  (browser UI), so the bottom of the canvas was never painted.
- **Now**: [`docs/render_framework_diagram_png.mjs`](../../docs/render_framework_diagram_png.mjs) renders
  at the SVG's own size, crops the extra height, and **verifies that the ink reaches the artwork's
  bottom edge** — a short raster exits non-zero instead of shipping.
- **New guard**: each committed diagram PNG must actually contain its own artwork (pixel-extent
  comparison against the SVG); the v2/v3 matplotlib diagrams are covered as well.

### 3. Bilingual release notes

- The GitHub Release body is now fixed to a Chinese section followed by an English one, with stable
  headings: 概览 / 变更 / 兼容性 / 升级 ↔ Overview / Changes / Compatibility / Upgrade.
- Only what a user needs to know; engineering evidence stays in the repository's audit ledger and
  commit messages.
- The release gate now fails when the current version's notes lack either half.

## Compatibility

- The four presets' code, prompts and corpora are **byte-identical**; parameters, tool surface and the
  `off` / `encourage` / `require` behaviour are unchanged.
- Installer behaviour is the same as 2.3.14: a version change replaces the managed files (backing up
  user edits first), and the same version rewrites nothing.
- This release changes documentation, images and test guards only — no runtime behaviour.

## Upgrade

```sh
npm i dsh-vibe-math@latest
```

If you pinned the version in a profile, update that dependency first and restart DSH:

```sh
dsh plugin --profile <your profile> add dsh-vibe-math@latest
```

No migration needed.

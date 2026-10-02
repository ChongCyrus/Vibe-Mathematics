# Release-notes template / 发布说明模板

This file defines the **single template** every `RELEASE-NOTES-<version>.md` (Chinese) and
`RELEASE-NOTES-<version>.en.md` (English) must follow. 本文件定义所有发布说明必须遵循的**唯一模板**。

- **File naming / 文件命名**：`RELEASE-NOTES-<version>.md`（中文）与 `RELEASE-NOTES-<version>.en.md`（English）。
  Both files are required for every new release and both must be listed in `package.json#files`
  (`tests/audit-market-metadata.test.mjs` enforces exactly that). 每个新版本**必须同时**有两份文件，且都列入
  `package.json#files`（守卫 `tests/audit-market-metadata.test.mjs` 会检查）。
- **Heading order / 标题顺序**：the two languages use the **same order and the same section set**.
  中英两份必须**顺序一致、章节一致**（见下）。
- **Audience / 读者**：someone reading a changelog. 面向读变更日志的用户。
  **Never** write internal project vocabulary (audit rounds, task/agent names, session IDs, "we found during
  our testing") — state what changed for the user and how it is verified. 不得出现内部工作词汇（审计轮次、
  任务/成员名、会话编号、"我们在测试中发现"之类），只写对用户的变化与验证方式。

## Required sections (in this order) / 必需章节（按此顺序）

| # | 中文标题 | English heading | Content / 内容要求 |
|---|---|---|---|
| 1 | `# dsh-vibe-math <version> — 发布说明` | `# dsh-vibe-math <version> — Release Notes` | Title with the exact version. 标题带准确版本号。 |
| 2 | `> 上一版本：<prev>。…` | `> Previous release: <prev>. …` | One paragraph: **what kind of release this is** (patch/minor), the headline changes, and an explicit compatibility sentence (defaults/formats/directory layout unchanged? migration needed?). 一段话：版本类型、要点、以及明确的兼容性结论（默认值/数据格式/目录结构是否变化、是否需要迁移）。 |
| 3 | `## 概述` | `## Overview` | 3–8 bullets, user-visible outcomes only; each bullet = one change. 3–8 条要点，只写用户可见的结果，一条一个变化。 |
| 4 | `## 新增` | `## Added` | New capabilities/fields/parameters. State the **exact** field or parameter names in backticks. 新能力/字段/参数，字段名一律用反引号写准确。 |
| 5 | `## 变更` | `## Changed` | Behaviour or wording changes (including documentation that now states something new). 行为或文案变化（含文档口径变化）。 |
| 6 | `## 修复` | `## Fixed` | Each fix: the user-visible symptom → the corrected behaviour. Include how it was reproduced/verified. 每条：用户可见症状 → 修正后的行为，并说明如何复现/验证。 |
| 7 | `## 兼容性与迁移` | `## Compatibility & Migration` | Explicit: breaking changes (usually "无 / None"), additive-only additions, migration steps, DSH support window. 明确列出破坏性变更（通常"无"）、纯新增项、迁移步骤、DSH 支撑窗口。 |
| 8 | `## 已知限制` | `## Known Limitations` | Honest limits, including "unverified" and "not shipped". 如实写限制，包括"未验证"和"未随包提供"。 |
| 9 | `## 验证方式` | `## Verification` | The commands a reader can run (`node tests/run-tests.mjs …`) and what was verified on real engines, with versions. 读者可自行运行的命令，以及真机验证过的内容与版本号。 |
| 10 | `## 依赖` | `## Dependencies` | New/changed runtime dependencies (usually "无新增" / "None added") and the host (DSH) requirement. 新增/变化的运行时依赖（通常"无新增"）与宿主（DSH）要求。 |

Sections with nothing to report keep their heading and say `无。` / `None.` — never delete a section, so
readers can rely on the structure. 无内容的章节**保留标题**并写"无。"，不要删除章节，保证结构稳定。

## Skeleton / 骨架

Chinese (`RELEASE-NOTES-<version>.md`):

```markdown
# dsh-vibe-math <version> — 发布说明

> 上一版本：<prev>。本版是**补丁版 / 功能版**，<一句话要点>。四套预设的参数默认值、数据格式与目录结构**未变**，DSH 支撑窗口不变，**无需迁移**。

## 概述
- …

## 新增
- …

## 变更
- …

## 修复
- …

## 兼容性与迁移
- 破坏性变更：无。
- 纯新增：…
- 迁移：无需迁移。

## 已知限制
- …

## 验证方式
- `node tests/run-tests.mjs` —— 全部通过（<N> 项）。
- …

## 依赖
- 无新增运行时依赖；DSH 支撑窗口不变。
```

English (`RELEASE-NOTES-<version>.en.md`):

```markdown
# dsh-vibe-math <version> — Release Notes

> Previous release: <prev>. This is a **PATCH / FEATURE** release that <one-line headline>. Parameter defaults, data formats and the directory layout are **unchanged**, the DSH support window is unchanged, and **no migration is needed**.

## Overview
- …

## Added
- …

## Changed
- …

## Fixed
- …

## Compatibility & Migration
- Breaking changes: none.
- Additive only: …
- Migration: none needed.

## Known Limitations
- …

## Verification
- `node tests/run-tests.mjs` — all green (<N> items).
- …

## Dependencies
- No new runtime dependencies; the DSH support window is unchanged.
```

## Rules / 写作规则

1. **Verify every claim against the code or docs before writing it.** If a behaviour is not in the shipped
   bytes, it does not go in the notes. 每条声称在写之前都要对照代码/文档核实；没进包的行为不写。
2. **Patch vs minor must be stated and justified** in the summary line; the version number itself is chosen
   by the maintainer. 概述里写明是补丁版还是功能版并给出理由；版本号由维护者决定。
3. **Name the exact API surface** (`field`, `next.reason`, parameter names) so users can grep for it.
   接口一律写准确名字，便于用户检索。
4. **Do not machine-translate** the two versions: both are written by hand and kept structurally identical.
   两份都必须手写并保持结构一致，不用机翻。
5. **English index**: every release also updates `README.en.md` (see below) so English readers can navigate
   a history whose earlier entries are Chinese-only. 每个版本同时更新 `README.en.md`（英文历史索引）。
6. **Historical files are frozen**: older notes are not reformatted retroactively; the template applies from
   the next release onward. 历史文件不改写；模板自下一版本起生效。


## 可追溯性要求（写新发布说明时必须遵守）

- 每条"修复/变更"条目**必须点名钉住它的守卫**（具体 `tests/*.mjs` 路径或套件名）；没有守卫的条目要写明"未加守卫，原因：…"。
- 这样未来的发布说明不会重演历史缺口：守卫索引是权威的可追溯性来源，发布说明只是入口。

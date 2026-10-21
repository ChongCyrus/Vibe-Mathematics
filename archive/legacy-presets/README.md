# archive/legacy-presets — 五个已归档的历史 preset

> **状态：已归档／不再发货。** 这五个目录曾作为「数学研究多智能体」的早期整包预设随 npm 包发布；
> 从 G4 起它们**不再进入 `package.json` 的 `exports`／`files`**，也不再出现在 `installer.js` 的
> managed `PRESETS` 里。当前的框架形态是 `vibe-math-vmu/` ＋ 一个 pack 文件夹（`packs/v5r/`）。

## 五个 preset 是什么

| 目录 | 代际／角色 | 归档理由 | 对应的 pack |
|---|---|---|---|
| `vibe-math-v2/` | 第二代：概率驱动的架构；"start/resume/pause/abort" 工具面 | 被 vmu ＋ `packs/v3` 的声明式机制取代 | `packs/v3`（规划器/数据面） |
| `vibe-math-v3/` | 第三代：纸面式 Markdown 知识库 ＋ 项目路径约定（Problems/Progress/Propos/Methods/Notes） | 同上；其路径纪律由 vmu 的 `records`/`library` 面承接 | `packs/v3`（prompts/middleware） |
| `vibe-math-v4/` | 第四代：持久化、自组织的常驻机构；Lean 形式化的第一版 | 被 vmu 的 `members`/`tasks`/`lean` 服务面取代 | `packs/v3` ＋ vmu 内核 |
| `vibe-math-v5/` | 第五代：研究院式机构；会议/票箱/论文流程的雏形 | 被 `packs/v5r` 的会议/票箱/论文 pack 取代 | `packs/v5r`（整合包前身） |
| `vibe-math-v5r/` | v5 的重构预览（与 v5 并存的 A/B 对照）；MEETING-PLATFORM-* 设计依据 | 直接演进为 `vibe-math-vmu/` ＋ `packs/v5r/`（逐面镜像） | `packs/v5r`（当前整合包） |

> "对应哪个 pack" 是**演进关系**，不是运行装载关系：这些目录已不能作为 DSH preset 装载；当前装载的是
> `vibe-math-vmu/`（其 `packs/v5r/` 提供机构策略与提示词）。

## 归档后测试怎么定位它们

**唯一入口**：`tests/_lib/legacy-presets.mjs`（`LEGACY_BASE` 默认 `'archive/legacy-presets'`；`legacyDir()`／
`legacyFile()`／`legacyEntry()`）。所有历史套件、审计脚本、mutants 都经它取路径，**不得再写
`join(REPO, 'vibe-math-vX', …)` 或静态 `import '../vibe-math-vX/…'`**；搬动归档根只需改 `LEGACY_BASE` 一个字符串。

## 历史 acceptance 不改写

`docs/acceptance/` 里的历史验收记录**保持原样**：它们记录的是当时（preset 位于仓库根、仍在发货）的事实，
包括当时的路径与计数。**不要为了让旧记录"看起来仍然最新"而回写它们** —— 那会毁掉审计链的可信度；
当前状态以 `docs/`、`docs/landed` 与生成式索引为准。

## 相关

- `docs/DEPRECATED-LEGACY-PRESETS.md` —— 弃用声明与迁移说明。
- `docs-landed/00-README.md` —— 快照声明（"旧 preset 已弃用"）。

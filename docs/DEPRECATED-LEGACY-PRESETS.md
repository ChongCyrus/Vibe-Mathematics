# 旧 preset 弃用说明（v2 / v3 / v4 / v5 / v5r）

> 状态：**已弃用（deprecated）且已从发货面移除**（2026-11-17 真值批核对）：`installer.js#PRESETS` 只含 `vibe-math-vmu`、`package.json#files` 里没有旧 preset 目录、仓库 HEAD 的目录树里也没有 `vibe-math-v2/`…`vibe-math-v5/`。本文档只作历史参考；发货面与自定义 preset 的现状见 `README.md`「发货面：唯一发货 preset 与如何加更多」。

## 1. 五个旧 preset 各是什么

| 旧 preset | 一句话 |
|---|---|
| `vibe-math-v2` | 概率驱动 + JSON 数据层的经典实现：`qs.json` 问题清单 + `Propos/` 命题库 + 概率调度 + 代码启发式。 |
| `vibe-math-v3` | 论文式 Markdown + 规划代理 + 方法库：`Problems/`、`Progress/`、`Propos/`、`Methods/`、`Verified/`。 |
| `vibe-math-v4` | 常驻自组织合作研究：常驻子代理互相留言/开会、自主分派，无中央调度。 |
| `vibe-math-v5` | 研究所体系：院士（chair）+ 常驻研究员（member）+ 临时工（temp），有会议/票箱/任务板/规章。 |
| `vibe-math-v5r` | v5 的重构预览，与 v5 并存做过 A/B 对照；本轮之后它成为 v5r pack 的历史来源。 |

## 2. 为什么弃用

- 框架已收敛为 **`vibe-math-vmu`（能力）＋ `vibe-math-vmu/packs/<id>`（机构/政策）**；
- 旧五个 preset 是“一个目录自带全部实现”的历史形态，继续随包发布会造成“装哪一个 / 读哪份文档”的歧义；
- 新机构应通过 **换 pack** 表达，而不是复制整个 preset 目录。

## 3. 现在分别对应哪个 pack

| 旧 preset | 对应的 vmu pack | 说明 |
|---|---|---|
| `vibe-math-v3` | **`vibe-math-vmu/packs/v3`** | 机制复刻包（周期调度→规划→数据面→方法库→验证→人工门）。 |
| `vibe-math-v4` | **`vibe-math-vmu/packs/v5r`**（最近的对应物） | 没有逐字节的 v4 复刻包；v4 的“常驻自组织”语义由 v5r 研究所包覆盖。 |
| `vibe-math-v5` | **`vibe-math-vmu/packs/v5r`** | v5r 是 v5 的重构预览，机制/机构语义一致。 |
| `vibe-math-v5r` | **`vibe-math-vmu/packs/v5r`** | 同一 pack 的直接来源。 |
| `vibe-math-v2` | **无直接对应 pack** | 概率驱动 + JSON 数据层没有在 vmu 中复刻；只保留历史源码供追溯。 |

## 4. 历史 acceptance 文档不改写

`docs/acceptance/` 里的旧验收记录描述的是**当时的仓库状态**，本次弃用**不改写**它们；需要理解旧行为时，以本说明与历史记录为准。

## 5. 发货面现状（2026-11-17 真值批核对）

- `installer.js#PRESETS` 只有 **1** 项：`{ src: 'vibe-math-vmu', dst: 'vibe-math-vmu' }`。
- `package.json#files` 里没有任何 `vibe-math-v2/`…`vibe-math-v5/` 条目（只有 `vibe-math-vmu/**`）。
- 仓库 HEAD 的目录树里没有旧 preset 目录（`git ls-tree HEAD --name-only | grep '^vibe-math-v[0-9]'` 为空）。
- ⇒ **旧 preset 不再随包发货、不再被安装器安装**；它们只保留在 git 历史里（需要旧行为时按历史 tag 检出）。
- 本文件早期版本写着「仍在仓内 / 尚未从发货面移除 / 仍出现在 package/installer 声明中」——那描述的是移除之前的状态，现已更正。

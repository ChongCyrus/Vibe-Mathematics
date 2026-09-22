# dsh-vibe-math 2.3.12 — 安装器按 `engines.dsh` 判定宿主 + npm 页不再有裂图 + README 清理

> 上一版：2.3.11。三件收尾：① 安装器自检与市场读**同一个**声明；② npm 上 README 的图不再裂；
> ③ 目录条目文案按实际内容更新（第三方 PR）。另按你的要求删掉了上一版塞进 README 的"插件市场展示"一节。
> 无预设行为变更，四套预设字节未变。

---

## 1. 安装器自检改为读 `engines.dsh`（单一事实源）

原来安装器按 `dsh.compatibility.dshReleases` 这张**本包自用的表**判断宿主版本，而市场卡片按
`engines.dsh` 判定——**两个来源可以互相矛盾**（卡片说兼容、日志却告警，或反之）。现在：

- `installer.js` 导出两个纯函数：`satisfiesDshRange(version, range, {includePrerelease})` 与
  `dshVersionVerdict(version, manifest)`；
- 判定顺序：**`engines.dsh`**（顶层优先）→ **`dsh.engines.dsh`** → 都没有才回退到 `dshReleases` 表；
  无法解析的范围返回 `unknown`（只提示、绝不判成 incompatible）；
- 匹配器支持生态里真实出现的写法：`*`/`x`、精确、`^`、`~`、`>=`/`>`/`<=`/`<`、空格分隔的组合、`||` 分支，
  并实现 npm 的**集合级预发布规则**（一个 `||` 分支为一个集合：只有集合里存在与宿主同
  `major.minor.patch` 且自带预发布标签的比较符时，才放行预发布版本）；
- **实测对齐**：用 npm 自带的 **semver 7.8.5** 逐项比对 **320** 组（范围 × 版本 × 两种预发布语义），
  **0 处不一致**；`not-a-range`、`>=1.2`、`1.2.x` 等不支持写法一律返回 `null`（unknown，绝不误判）。
- 顺手修掉安装器头部注释的陈旧描述（"copies ALL THREE agent presets … ships v2/v3/v4 only" →
  四套，v5 自 2.1.0 起就在）。

新增随包套件 [`audit-installer-compat.test.mjs`](../../tests/audit-installer-compat.test.mjs)（**54 条断言**，进并行回归）：
匹配器的期望值表（由 semver 7.8.5 生成）、不支持写法必须为 unknown、`dshVersionVerdict` 的优先级与回退、
以及**两个来源不许矛盾**——`dsh.compatibility` 里每个标 `compatible` 的版本都不得被 `engines.dsh` 判成 incompatible。

## 2. npm 页的 README 图不再裂

README 展示 5 张本地图，此前只有 v4/v5 的 SVG 随包发布，v2/v3 的 PNG 与实际使用示例长截图**不在 `files` 里**，
所以 npm 页一直是裂图。现在把 README 引用的**每一张**本地图都纳入 `files`：

| 新增随包 | 大小 |
|---|---|
| `示例图/框架图-v2.png` | ≈403 KB |
| `示例图/框架图-v3.png` | ≈559 KB |
| `示例图/实际使用示例-长截图.png` | ≈2.7 MB |

守卫也加了这条不变式：**README 里出现的每个本地图片路径都必须列在 `package.json` `files` 里**
（历史遗留条目"指向已删除的 v1 图"就是同一类腐烂），以后谁再引用未随包的图会直接判红。
（实测包体积 1.0 MB → **4.36 MB**（解包 8.89 MB，79 个文件）——若你不想背这张 2.7 MB 的长截图，
删掉 README 里那一行即可，守卫会要求同步从 `files` 移除。）

## 3. README 清理

按你的要求，删除了上一版新增的「🏪 插件市场（dsh-market / awesome-dsh-plugin）里的展示」整节
（那是维护者视角、与用户了解项目无关）。README 里现在没有任何市场/元数据相关内容；
这些声明仍由 `audit-market-metadata.test.mjs`（仓库级守卫，19 条断言）与发布说明守着。

## 4. 目录条目文案（第三方 PR）

条目 `data/plugins/ChongCyrus__Vibe-Mathematics.yml` 的描述仍是 v2 时代措辞（只描述一条流水线，
且把 preset 说成"附带品"）。已按实际内容更新并发起 PR：

- **PR #5673**：https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/pull/5673
- 只改我们这一条（1 file, +2/−2），en/zh 同步，无营销词；
- 分支基于**上游当前 `main`**（你的 fork 停在 2026-08-18、与上游有分叉且无法 fast-forward，
  所以没有动 fork 的 main，只推了一个新分支）。

## 5. 验收

| 项 | 结果 |
|---|---|
| `audit-installer-compat.test.mjs` | **54/0** |
| `audit-market-metadata.test.mjs` | **19/0**（含"README 图片必须随包"） |
| 匹配器 vs semver 7.8.5 | 320 组，**0 处不一致** |
| 其余静态守卫 | invariants 157/0（self-probe 5/5）、traceability 94/0、v5-integrity clean、persona-surface 197/0 |
| 全量并行回归 | **25/25** |
| closing verification | 18/18 |
| 发布产物自证 | registry tarball sha1 与本地一致 + 包内跑全部随包套件 |

## 6. 升级

```
npm i dsh-vibe-math@latest
```

无迁移；`off` 档行为与四套预设字节均未变。

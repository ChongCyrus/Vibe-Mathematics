# dsh-vibe-math 2.3.10 — 插件市场展示图 + DSH 版本依赖声明（并加防退化守卫）

> 上一版：2.3.9。本版只做两件事：让 [dsh-market](https://github.com/dsh-market/dsh-market) /
> [awesome-dsh-plugin](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin) 目录里的本插件条目
> **有展示图**、**有 DSH 版本依赖声明**，并把这两处声明用测试钉住。无预设/行为变更。

---

## 1. 这两处元数据分别从哪里读（先把机制说清楚）

市场目录的条目文件是 `data/plugins/ChongCyrus__Vibe-Mathematics.yml`（改条目文字/分类**才**需要 PR），
但**展示图与版本依赖都不在那个 YAML 里**：

| 读什么 | 来源 | 生效方式 |
|---|---|---|
| 展示图（卡片图 + 详情页 AppStore 式轮播，1–8 张） | **本仓库根目录的 `screenshots.json`**（`package.json` 旁边），路径相对该文件、不得越出仓库、不得以 `/` 开头；也接受 GitHub 托管的 https 绝对地址 | 目录的**夜间构建**抓取——推自己的仓库即可，**无需 PR** |
| DSH 版本依赖（卡片上的兼容性） | **已发布的 npm manifest**：`engines.dsh`（顶层优先）或 `dsh.engines.dsh`，外加 `@deepseek-ai/dsh*` 的 `peerDependencies`（若有，全部**求交**）；用 semver + `includePrerelease:true` 与宿主版本比较 | 发一个新版本；市场缓存 **TTL 24h** |

本版之前的状态：`screenshots.json` **不存在** → 市场吃到目录里 `data/screenshots.json` 的历史遗留条目，
而它指向的 `示例图/框架图-v1.png` **早已删除**（首图 404，被静默丢弃）；`engines.dsh` / `dsh.engines.dsh`
**都没有**（本包只有自用的 `dsh.minVersion` / `testedVersion` / `compatibility`，市场不读）→ 卡片长期显示
"未声明"。

## 2. 展示图：新增 `screenshots.json`

```json
[
  "示例图/框架图-v5.png",
  "示例图/框架图-v4.png",
  "示例图/框架图-v3.png",
  "示例图/框架图-v2.png"
]
```

- 顺序即轮播顺序，第一张是卡片图；**全是仓库里真实存在的 PNG**（旧条目就是死在"路径指向已删除文件"上）。
- `框架图-v5.png` / `框架图-v4.png` 是本版新增的 **1:1 光栅图**（1720×1204 / 1720×1260，由对应 SVG 用无头 Chrome
  渲染：`_oneoff/render-market-pngs.mjs`）——README 继续用可缩放的 SVG，市场用光栅图最稳。
- 市场是"AppStore 式"展示，因此**不用** `实际使用示例-长截图.png`（实测 **1072×22094**，比例完全不适合轮播）。
- 旧遗留键（指向 v1/v2 的 `data/screenshots.json`）会在目录构建时被清理脚本自动移除——**不要去那边加键**。

## 3. 版本依赖：声明 `engines.dsh` + `dsh.engines.dsh`

```
>=0.1.2-alpha.4 <0.1.3-0 || >=0.1.3-alpha.2 <0.1.5-0 || >=0.1.5-alpha.1 <0.2.0-0
```

为什么不是一句 `>=0.1.2-rc.1 <0.2.0`？目录的 contributing 指南专门警告过这个坑：node-semver 只有当范围里
**某个比较符与宿主版本的 `major.minor.patch` 完全相同、且自身带预发布标签**时，才放行该预发布版本——
`>=0.1.2-rc.1 <0.2.0` **匹配不到** `0.1.5-rc.2`（本包实测支持且一直在用的宿主版本），卡片上会显示成不兼容。
上面的显式分支给每个 tuple 都配了预发布比较符，并保留 `<0.2.0-0` 上限。

**实测核对**（semver **7.8.5**，npm 自带的那份，默认语义与 `includePrerelease:true` 两种都跑）：

| 版本 | 本包声明 | `>=0.1.2-alpha.4`（仅下限） | `>=0.1.2-alpha.4 <0.2.0-0` |
|---|---|---|---|
| 0.1.2-alpha.4 / alpha.5 / rc.1 | ✅ / ✅ | ✅ / ✅ | ✅ / ✅ |
| 0.1.3-alpha.2 | ✅ / ✅ | ❌ / ✅ | ❌ / ✅ |
| 0.1.5-alpha.1 / alpha.2 / rc.1 / **rc.2** | ✅ / ✅ | ❌ / ✅ | ❌ / ✅ |
| 0.1.1-rc.1、0.2.0-rc.1、0.2.0、1.0.0 | ❌ / ❌ | 部分 ✅ | 部分 ✅ |

（左=默认语义，右=includePrerelease。只有本包的写法在**两种语义下判定一致**，且与
`dsh.compatibility.dshReleases` 宣称的兼容面完全吻合。）

同时声明**两处**：顶层 `engines.dsh`（市场优先读它）与 `dsh.engines.dsh`（生态里更常见的写法，也是
`@linxin666/dsh-web-all`、`zhengjy01/dsh-updater` 等的写法；市场在顶层缺失时才读它）。两处取值相同，
求交后结论一致。本包**没有** `@deepseek-ai/*` 的 peerDependencies——四套预设依赖的是宿主**服务**而不是 npm 包，
这一点由守卫断言钉住（将来若加，必须同样写成预发布感知的范围）。

`dsh.minVersion` / `testedVersion` / `compatibility.dshReleases` **保留**：它们是本包安装器自检与文档用的，
市场不读它们。

## 4. 新增守卫：`audit-market-metadata.test.mjs`（随包发布，进并行回归）

16 条断言：`dsh.bundle.patch` 存在（目录 CI 的第一道门槛）；两处 DSH 声明存在、相等、≤256 字符（市场的范围长度
上限）、等于**经实测验证**的那条链；链覆盖 `dsh.compatibility` 里所有标记 `compatible` 的版本；链带显式上限；
无 `@deepseek-ai` peer；`screenshots.json` 是 1–8 张、路径合规且**文件真实存在**、全是 PNG；README 里每张图都存在。

**灵敏度实测**（`_oneoff/probe-market-guard.mjs`）：删掉 `engines.dsh` / 把截图指回已删除的 `框架图-v1.png` /
放 9 张 / 用 `../` 越出仓库 / 漂移范围链——**五种缺陷形状全部被判红**，且未变异的对照跑仍为绿。

## 5. 验收

| 项 | 结果 |
|---|---|
| `audit-market-metadata.test.mjs` | **16/0**（+5 个灵敏度探针） |
| 静态守卫 | invariants 157/0（self-probe 5/5）、traceability 94/0、v5-integrity clean、persona-surface 197/0 |
| 全量并行回归 | 24/24（新增本套件） |
| closing verification | 18/18 |
| 发布产物自证 | registry tarball sha1 与本地 `npm pack`/`dist.shasum` 一致 + 包内跑全部随包套件 |

## 6. 生效时间（重要）

- **展示图**：推送到本仓库后，等 awesome-dsh-plugin 的**夜间构建**重新抓取（它读 `raw.githubusercontent.com`
  上本仓库 HEAD 的 `screenshots.json`），随后 dsh-market / 两个站点都会更新。
- **版本依赖**：本版发布后，市场从 npm 读 manifest 并缓存 —— 最长 **24h** 后卡片显示新声明；期间重启 DSH 或
  等缓存过期即可看到。
- **无需**为这两件事去目录仓库提 PR；但**条目文字**（描述/分类）仍在那边的 YAML 里，改它才需要 PR。

## 7. 升级

```
npm i dsh-vibe-math@latest
```

无迁移；四套预设与上一版逐字节相同。

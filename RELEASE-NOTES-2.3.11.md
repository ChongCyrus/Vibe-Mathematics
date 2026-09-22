# dsh-vibe-math 2.3.11 — 修正 2.3.10 的打包错误：市场守卫是**仓库级**的，不该随包发布

> 上一版：2.3.10。本版只修一处**打包/验证契约**错误，不改任何声明内容。四套预设字节未变。

---

## 1. 事故

2.3.10 新增的 `audit-market-metadata.test.mjs` 被列进了 `package.json` 的 `files`，于是它随包发布。
但它是**仓库级**守卫：它校验的是"`screenshots.json` 里的截图、README 里的图片**在仓库里真实存在**"——
而这些 PNG 是目录从 GitHub 抓取的**仓库产物**，**不在 npm tarball 里**。结果在解包出来的包里跑它必然失败：

```
FAIL every declared image is a usable, existing path
     — 示例图/框架图-v5.png (declared but missing from the repository) | …
FAIL every image the README shows exists in the repository (8 images)
     — 示例图/框架图-v2.png, 示例图/框架图-v3.png, 示例图/实际使用示例-长截图.png
```

发布产物自证因此判红（这正是它的职责：**不是"publish 退出 0 就算完成"**）。

## 2. 修法：纠正打包契约，而不是放宽断言

- 该套件**从 `files` 里移除**——它由检出目录里的 `run-tests.mjs` / `final-verify.mjs`（24 套件）执行，
  那里断言全开；
- 套件自己新增两条断言把这条契约钉住：
  1. **它不得出现在 `package.json` `files` 里**（有人再放进去，检出目录里的测试会**先**红，
     而不是等到发布自证才发现）；
  2. `screenshots.json` **必须**随包发布（它向安装者说明市场合约，值得让用户看到）。
- 发布验证器也补上一条"不许出现"的检查（正向标记无法表达"文件不存在"）：
  `MUST_NOT_SHIP = ["audit-market-metadata.test.mjs"]`，并打印确认它确实不在 tarball 里。

守卫现为 **18 条断言**（原 16 + 上述 2 条），检出目录里全绿；五种缺陷形状的灵敏度探针不受影响。

## 3. 2.3.10 的市场改动仍然有效（内容未变）

- 展示图：[`screenshots.json`](screenshots.json) → v5 / v4 / v3 / v2 四张真实存在的 PNG（目录夜间构建抓取，无需 PR）；
- DSH 版本依赖：`engines.dsh` 与 `dsh.engines.dsh` 都是
  `>=0.1.2-alpha.4 <0.1.3-0 || >=0.1.3-alpha.2 <0.1.5-0 || >=0.1.5-alpha.1 <0.2.0-0`（市场从已发布 manifest 读，TTL 24h）；
- README 的「插件市场里的展示」一节不变。

## 4. 验收

| 项 | 2.3.10 | 2.3.11 |
|---|---|---|
| `audit-market-metadata.test.mjs`（检出目录） | 16/0 | **18/0** |
| 发布产物自证 | **失败**（包内跑该守卫） | **通过**（7 个随包套件全绿 + 确认该守卫不在 tarball 里） |
| 全量并行回归 | 24/24 | 24/24 |
| closing verification | 18/18 | 18/18 |

## 5. 升级

```
npm i dsh-vibe-math@latest
```

无迁移；`off` 档行为与预设字节均未变。

# 发布手册：从版本一致性到 npm 与 GitHub Release

> 本文件记录**实际执行过**的发布流程（以 2.7.3 为例），供下一次发布照做。
> 面向读者：维护者。命令都可直接复制；标注"需核对"的地方不要跳。
> 权威守卫：`tests/audit-market-metadata.test.mjs`（市场元数据与随包清单）。

## 0. 发布前的一次性判断

先确定**版本类型**（补丁 / 功能）与**版本号**，再动任何文件。定了就不再改——版本一致性检查遍布多处，中途改号会到处漏。

## 1. 版本一致性：三处必须同时改

| 位置 | 字段 | 检查者 |
|---|---|---|
| `package.json` | `version` | 全部守卫的基准 |
| `package-lock.json` | **顶层 `version`** 与 **`packages[""].version`** | `tests/audit-market-metadata.test.mjs` 断言顶层与 `package.json` 一致（历史上曾漂移） |
| 发布说明 | `docs/release-notes/RELEASE-NOTES-<版本>.md` 与 `.en.md` | 市场守卫断言"覆盖当前版本（两种语言）" |

```bash
node -e "const p=require('./package.json'),l=require('./package-lock.json');console.log(p.version,l.version,l.packages[''].version)"
```

- **两份发布说明都必须写**，且**都要登记**在 `package.json#files`（守卫会检查"当前版本的两份都在清单里"）。
- 发布说明结构由 `docs/release-notes/TEMPLATE.md` 规定：**10 个章节、中英同序**，无内容的章节保留标题写 `无。` / `None.`；每条修复/变更要点名**钉住它的守卫**。

## 2. 清单与市场字段

- `package.json#files`：新增的随包文件（**包括**两份发布说明与新文档）都要登记；发布后要用 tarball 复核"声明了但缺失 = 0"。
- `dsh.compatNote`：**用户可见的清单文本**，必须提到**当前版本号**（历史上曾在改版本后仍描述上一版）。
- 以下字段**只应保持"已验证范围"**，发布时不要顺手改：
  - `engines.dsh`（顶层，市场读它）与 `dsh.engines.dsh`（生态形状）——两者必须**逐字一致**；
  - 每个 `@deepseek-ai/*` 的 `peerDependencies`：与 `engines.dsh` **同范围**，且 `peerDependenciesMeta` 里标记为 **optional**；
  - `dsh.compatibility` 里标为 `compatible` 的每个版本都必须被 `engines.dsh` 的链**覆盖**；
  - `screenshots.json` 与 README 里的图片引用（市场读取仓库里的 `screenshots.json`，**不从 npm 读**；README 不得指向已不存在的图）。
- 若某次发布确实要动兼容范围，先改**单一来源**再让两条声明一致，并同步更新市场数据。

## 3. 提交前：门禁与派生计数

```bash
node tests/run-tests.mjs                       # 必须全绿：TOTAL <n> PASS <n> FAIL 0
node scripts/update-doc-counts.mjs             # 让文档里的派生计数收敛
node scripts/update-doc-counts.mjs --check     # 退出 0 = 已收敛
```

- 任何**新增作业**（新套件/新变异族/新 `--self-probe` 变体）都会改变派生计数：先跑 updater，再跑门禁，否则文档计数守卫会按设计变红。
- **派生工件随源改动一起提交**：改了预设源/规范后，`cordis.patch.yml` 与随包语料等派生文件必须在**同一个提交**里重新生成（生成器脚本以仓库为准），不要拆成两个提交。
- 改动了文档/计数后**再跑一次** `--check`，确保最后一次改动也收敛。

## 4. 提交、打标签、推送

```bash
git add <path-exact 文件...>        # 逐路径精确暂存，避免带入无关改动
git commit -m "<版本号>：<一句话要点>"
git tag -a v<版本> -m "<版本> <要点>"   # 注解标签
git push origin <branch> --follow-tags
```

- 提交信息写**用户可见的变化**，不要写内部工作词汇。
- 打标签前确认工作区干净、门禁刚跑过且全绿。

## 5. 发布到 npm

```bash
npm publish            # 按 package.json 的 version 发布
```

- **`gh release create` 是独立的一步**，不是 `npm publish` 的一部分：

```bash
gh release create v<版本> --title "v<版本>" --latest --verify-tag \
  --notes-file <双语说明或生成的双语文档>
```

- `--verify-tag`：标签不存在就拒绝，避免对着错误的提交发版。
- `--latest`：标记为最新发布。

## 6. 发布后核对（必做）

```bash
npm view dsh-vibe-math version dist-tags.latest dist.shasum
npm pack --dry-run                      # 或 npm pack 后解开，核对清单
```

逐项确认：

1. **registry** 上的 `version` 与 `dist-tags.latest` 都是本次版本，`dist.shasum` 与本地 tarball 一致；
2. **tarball 内容 vs `package.json#files`**：声明了但缺失的文件数为 **0**；
3. 两份发布说明（中/英）**都在 tarball 里**；
4. 只应在仓库里存在的守卫/开发文件**不在** tarball 里；
5. 全新安装冒烟：在一个空目录里装该 tarball／从 registry 装，确认插件可被宿主加载；
6. **npm 传播延迟**：刚发布后 registry 可能短暂读到旧元数据，等一会儿重查，不要据此判定失败。

## 7. 已知陷阱（都真实遇到）

- **`gh` 的 JSON 输出没有 `isLatest` 字段**（本机 `gh` 版本）：判断"是否为最新发布"要看 **`--latest` 是否被接受**或直接看 Release 页面，别去解析不存在的字段。
- **`core.autocrlf=true`**：会让某个随包文件在 tarball 里以 **CRLF** 出现（内容等价、字节不同）。若要求 tarball **逐字节可复现**，在下次发布前加 `.gitattributes` 固定行尾（例如 `* text=auto eol=lf` 并对二进制显式 `-text`），并在发布后按第 6 节重新核对 shasum。
- **发布说明里的历史数字不要改**：冻结的历史发布说明是记录，**不得**为了"看起来一致"去改写（live 文档的计数扫描会**按名豁免**它们）。
- **别在发布提交里顺手改版本范围**：`engines.dsh` / peer / `screenshots.json` 的变动会改变市场兼容判定，应作为独立、可复核的改动。

## 8. 回滚与补救

- 已发布版本**不要**覆盖重发同名版本；发现问题就发**下一个补丁版**，并在发布说明里写清影响与修复。
- 若标签/Release 打错：删 Release 与标签后重打（`gh release delete` / `git push --delete origin <tag>`），**不要**移动已发布的语义。

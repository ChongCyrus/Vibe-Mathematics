# dsh-vibe-math 2.3.13 — 仓库归档 + 安装器改为「版本一变就整体替换」（手改原文先备份）

> 上一版：2.3.12。本版**不改四套预设的任何代码/提示词字节**（预设行为与上一版逐字相同），
> 改的是仓库布局、安装器的更新策略、以及两处守卫。

---

## 1. 仓库根目录归档：68 个条目 → 18 个

只留下"包必须暴露在顶层"的东西：

| 留在根目录 | 为什么不能动 |
|---|---|
| `package.json` / `README.md` / `LICENSE` | npm 与 GitHub 的固定位置 |
| `cordis.patch.yml` | `package.json` 的 `dsh.bundle.patch` 指向它；DSH 靠它把安装器挂进 profile |
| `screenshots.json` | 插件市场规定它必须与 `package.json` 同级 |
| `installer.js` | bundle 的唯一插件行（`dsh-vibe-math/installer`），也是 `main` / `exports` |
| `.gitignore` | — |

其余 **59 个文件**按角色归档：

```
tests/                 25 个 *.test.mjs + 7 个审计守卫 + 3 个人工探针 + 3 个自驱动记录器 + run-tests.mjs
docs/                  AUDIT-CHECKLIST.md、COMPAT-AUDIT-ROUND2.md、架构图.md、formal-verification.md、
                       test-timing.md、4 个架构图生成器
docs/release-notes/    18 份历史发布说明
```

搬动过程中顺带修掉的问题（都是"搬完才看得见"或一直没人看的那一类）：

1. **5 个硬编码绝对路径**（`D:/wd/vibemath开发/...`、`C:/Users/admin/...`）：
   `audit-corrupt-file-guard`、`audit-f1-compact-fix`、`audit-f2-filter-fix`、`audit-fuzz-helpers`、
   `e2e-f1-agent-detach`。其中 **`audit-fuzz-helpers.mjs` 是随包发布的**——写死了作者机器的路径，
   等于对任何用户都跑不了；`e2e-f1-agent-detach` 现在按 `npm root -g` 定位真实宿主包（并在找不到时
   报出所有试过的路径）。
2. **5 条发布说明里的链接失效**：搬进 `docs/release-notes/` 后，原来按仓库根写的相对链接要上一层。
3. `README` 里 `` `../COMPAT-AUDIT-ROUND2.md` `` 指的是仓库**外面**——这个引用从来就没对过。
4. README 链接的 v2/v3 架构图生成器（`.py`）**从未随包发布** → npm 页上点开是 404；现已纳入 `files`。
5. `docs/test-timing.md`、`docs/AUDIT-CHECKLIST.md` 与各脚本头部的 `Run:` 命令行按新路径更新
   （否则照抄命令就是"找不到文件"）。

**"纯搬动"有测量为证**：25 个套件在**改动前的检出**与**改动后的检出**里各跑一遍，把检出路径、
`tests/` 这一段、临时目录、缓存串与耗时归一化之后，**输出逐行相同**（`_oneoff/layout-invariance.mjs`：
25/25 SAME）；断言条数与归档前逐项一致；29 条 README 本地链接 0 失效。

## 2. 安装器：版本一变就整体替换（含手改文件），并先备份原文

**旧策略**：版本升级时只替换"哈希与上次安装一致"的文件，你改过的文件被**永久保留**。

**新策略**：

- 记录里的版本与包版本**不一致**（或根本没有记录的老安装）→ **受管文件全部替换成随包字节，
  不看它是否被改过**；
- **被替换的手改原文不会丢**：若磁盘上的字节不是"本安装器上次写入的字节"，会先备份到
  `<presetRoot>/.vibe-math-backup/<旧版本>/<preset>/<文件>`，并在日志里逐个列出；
- **同一个版本内不重写任何文件**（重启 DSH 不会改写 preset、也不会扰动它按 mtime 记的生成代际）；
- **缺失文件随时补回**（任何版本）；
- 本包不再发布的 preset 目录照旧清理（记录为"用户持有"的文件保留）。

**为什么改**：旧策略最危险之处是"静默的版本混合"。你改一个文件、包升级一次，得到的是
**一半旧版、一半新版**的 preset——它可能挂不上（`agent.cordis.yml` 与 `vibe-math-vN.js` 不同代），
也可能挂上了但行为与文档不符，而**从外面完全看不出来**，只能靠人去 diff 一个 5000 行的文件。
而且一旦被标记为"用户持有"，那个文件就**永远不会**再更新，连你后来把它改回原样都不会恢复。

**如何正确自定义**：不要改受管文件。复制一份——预设选择器里的复制动作（DSH 的 `agentPresets/copy`），
或自行把目录复制成新的 id——那份副本属于你，随包更新不会碰它。

## 3. 新增与加固的守卫

| 守卫 | 变化 |
|---|---|
| `tests/audit-installer-policy.test.mjs` | **新增**（42 条断言，随包发布）：在临时 DSH_HOME 里驱动真实 `apply()`，用"两个版本的临时包副本"证明基线安装 / 同版本不重写 / 版本一变即替换（且备份原文） / 缺失补回 / 旧 preset 清理，并证明受管清单覆盖四套预设运行时需要的每个文件 |
| `tests/audit-market-metadata.test.mjs` | 19 → **21** 条：README 的**每一条本地链接**（不再只是图片）都必须真实存在**且**列在 `files` 里 |
| `final-verify.mjs` 打包阶段 | 把**每一个随包发布的守卫在解包出来的包里各跑一遍**（安装器策略套件还会在包内重新复制四个 preset，因此"`files` 漏了某个 preset 文件"会在打包阶段就红，而不是等到用户装上挂载失败） |

两个新增断言的灵敏度都实测过：`_oneoff/probe-installer-policy.mjs`（对着 2.3.12 的安装器 → 7 条断言变红，
其中就有"版本一变，被改过的文件必须被替换"）、`_oneoff/probe-market-link-guard.mjs`（README 里塞一条
死链接 / 塞一条"存在但不随包"的链接 → 分别命中对应断言，改回后逐字节还原）。

## 4. 附：为什么不用 DSH 自带的预设根目录（`agent-presets.roots`）

勘察结论（DSH 0.1.5-rc.2）：**DSH 没有任何"插件包自带 preset 并自动安装"的机制**。

- `dsh plugin add` 只做两件事：在 profile 目录里跑 pnpm、把带 `dsh.bundle` 的依赖并进
  `dsh.profile.bundles`（即 `cordis.patch.yml` 成为一个 patch 层）。它不读、也不安装 preset。
- `dsh.configTrees`（`@deepseek-ai/dsh-package-manifest` 里唯一像"包自带配置树"的字段）明确写着
  "服务于实验性的镜像打包器……**声明它不会注册任何外部插件行为**"。
- 原生机制只有**根目录发现**：随包 `system` 根 + 部署配置的 `roots[]` + `$DSH_HOME/.agent-presets`（`user` 根，
  也是唯一可写的）。也就是说，**第三方包面向用户的唯一手段就是写进那个可写根**——正是本安装器在做的事。

理论上可以用 patch 层给 `agent-presets` 行塞一个 `roots` 项指向包内目录，但代价与风险都不划算：
① 按 id 命中的 patch **整体替换**该行的 `config`，于是必须重述 `default` 等字段，等于覆盖部署的默认预设选择；
② `roots[].path` 在 `scanRoot` 里是 `resolve(expandHomePath(path))`，即**相对 cwd**，只能靠 `!!js` 表达式算出
绝对路径，脆弱；③ 本包声明的兼容范围是 0.1.2 → 0.1.5，早期版本的 schema 是否接受 `roots` 无从验证，
而一旦宿主拒绝这个 config，结果是**一个 preset 都装不上**。相比之下，`installer.js` 是一段自包含的复制逻辑，
只依赖 node 内置模块，任何声明兼容的宿主上都能工作。

## 5. 验收

| 项 | 2.3.12 | 2.3.13 |
|---|---|---|
| 仓库根目录条目 | 68（含 59 个散落文件） | **18**（7 文件 + 11 目录） |
| 全套件并行回归 | 25/25 | 25/25（断言条数逐项一致） |
| 布局不变性（改前 vs 改后逐行比对） | — | **25/25 输出相同** |
| 安装器策略套件 | — | **42/0**（+ 对旧策略 7 条变红的灵敏度探针） |
| 市场元数据守卫 | 19/0 | **21/0**（+ 2 条链接探针） |
| README 本地链接 | 29（其中 2 条点开 404） | 29（全部存在且随包） |
| 发布产物自证 | 通过 | 通过（并在包内跑 6 个随包守卫） |

## 6. 升级

```
npm i dsh-vibe-math@latest
```

升级后**重启 DSH**：安装器会把四个 preset 目录的受管文件整体换成 2.3.13 的字节——**包括你手改过的**，
被替换的手改原文在 `~/.dsh/.agent-presets/.vibe-math-backup/2.3.12/<preset>/`。
无迁移；参数、工具、提示词与预设行为均未变。

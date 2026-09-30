# dsh-vibe-math 2.4.1 — 发布说明（中文）

> 上一版：2.4.0。本版是**修复与合规版本**：四套预设的提示词、工具面、组合声明与参数默认值均未改变（仅 v2 人设里一句措辞由「新架构」改为「经典」），DSH 支撑窗口不变。

---

## 概览

- 本包现已被两个插件目录收录：**[dsh-market（awesome-dsh-plugin）](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin)** 与
  **[awesome-ai-plugins](https://github.com/hashgraph-online/awesome-ai-plugins)**（条目分别位于前者的 `### Workflow & Automation`
  与后者的 `### DeepSeek Harness Plugins` 小节，均按字母序排列）。
- 为通过 `awesome-ai-plugins` 的**源仓库安全扫描**（要求评分 ≥80 且无 critical/high），移除了测试工具里的**动态代码执行**：
  仓库里不再出现 `eval` / `new Function` / `node:vm`。该项此前是把收录 PR 拦下的唯一硬性原因。
- 随后做的一轮独立复查修掉 13 处不一致，其中两处是**文档里的不实声明**（安全策略与发布门禁的描述），
  一处是中文 README 比英文版**承诺得更宽**。本次修订也一并落进本版。

## 变更

### 1. 移除测试中的动态代码执行（收录扫描的硬性要求）

- 两个审计套件过去把预设**源码文本**用 `new Function` 编译后执行；现在改为 `import()` 真实模块。
- 四个预设把纯函数**原样**上移到模块作用域（`apply()` 继续闭包同一批函数对象），并新增一个仅供测试使用的导出 `__testHelpers`。
- 结果：**行为不变**（独立复查做了逐 token 比对与数千次差分对照，结论完全一致；四个预设也已在真实 DSH 0.2.0-rc.2 上实测注册成功且零激活警告），
  而安全扫描的该项由「不通过」变为「通过」。

### 2. 架构表述统一：四者同级，v2/v3 为「经典」

把此前只改到 README 的说法补齐到所有用户可见处：npm 包描述、v3 设计文档、**v2 的预设选择器描述与人设文本**
（"NEW architecture" → "经典 / classic"）、安装段的预设列举顺序（与选择器一致为 v2、v3、v4、v5）。
因涉及人设措辞，`prompt-corpus-persona` 语料随之更新；其余提示词与语料未变。

### 3. 文档与安全策略如实化

- `SECURITY.md`：明确安装器在旧目录线上使用 Node 自身 `fs` 写 `<DSH_HOME>/.agent-presets/`（含状态文件与备份副本），
  不再声称"所有写入都经宿主 `fs` 服务"；并修正支持版本表的自相矛盾——2.3.x 的真正限制是**不能用于 DSH 0.2.x**，
  而不是"只支持 ≤0.1.6"（2.4.x 同样支持 ≤0.1.6）。
- `docs/AUDIT-CHECKLIST.md`：把 §9 的表格与同文件 §9.1/§9.2 对齐（本仓库**不配置** dependabot、**不引入**工作流），
  并写明将来若确实需要 CI 时的前置条件（第三方 Action 必须钉 commit SHA 并保留版本注释）。
- 修掉 v3 设计文档里"本包仅含 v2/v3/v4"的事实错误（v5 自 2.1.0 起即在包内），以及中文 README 升级段缺失的
  「仅 DSH ≤ 0.1.6 目录形式」这一限定（英文版原本已有）。

## 兼容性

- 四套预设的**提示词（除 v2 人设那一句）、工具面、组合声明、参数默认值与数据格式**均未变；
  DSH 支撑窗口不变：**0.1.2-alpha.4 … 0.2.0-rc.2**。
- 无需迁移：`State/<研究所>.v5state.json`、项目目录结构、以及 DSH ≤ 0.1.6 的旧目录形式都照旧。
- `SECURITY.md` 现在随包发布（`package.json` 的 `files` 已包含它）。

## 升级

```sh
npm i dsh-vibe-math@latest
```

桌面版在「设置 → 插件」里更新；命令行 profile 用 `dsh plugin --profile <你的 profile> add dsh-vibe-math@latest`，
随后重启 DSH 即可。

---

# dsh-vibe-math 2.4.1 — Release Notes (English)

> Previous: 2.4.0. This is a **fix and compliance release**: the four presets' prompts, tool surface,
> composition declarations and parameter defaults are unchanged (only one wording in v2's persona moved
> from "new architecture" to "classic"), and the supported DSH window is unchanged.

---

## Overview

- The package is now listed in two plugin catalogs: **[dsh-market (awesome-dsh-plugin)](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin)**
  and **[awesome-ai-plugins](https://github.com/hashgraph-online/awesome-ai-plugins)** — in the former's
  `### Workflow & Automation` and the latter's `### DeepSeek Harness Plugins` section, both in alphabetical order.
- To pass `awesome-ai-plugins`'s **source-repository security scan** (score ≥ 80 with no critical/high
  finding), **dynamic code execution was removed from the test tooling**: the repository no longer
  contains `eval` / `new Function` / `node:vm`. That rule was the one hard blocker on the listing PR.
- A follow-up independent review fixed 13 inconsistencies, two of which were **false statements in the
  documentation** (the security policy and the release-gate description) and one of which was the
  Chinese README **promising more than the English one**. Those fixes are part of this release.

## Changes

### 1. Dynamic code execution removed from the tests (a hard requirement of the catalog scan)

- Two audit harnesses used to compile extracted preset **source text** with `new Function`; they now
  `import()` the real modules.
- All four presets moved their pure helpers **verbatim** to module scope (`apply()` still closes over the
  same function objects) and gained one test-only export, `__testHelpers`.
- The behaviour is unchanged — an independent review compared the declarations token by token and ran
  thousands of differential comparisons with identical results, and the four presets were verified to
  register on a real DSH 0.2.0-rc.2 host with zero activation warnings — while the security rule that
  used to fail now passes.

### 2. One consistent framing: four peers, v2/v3 classic

The wording that had only reached the READMEs was completed everywhere a user can see it: the npm
package description, v3's design document, **v2's preset-picker description and persona text**
("NEW architecture" → "classic"), and the order in which the presets are listed in the install section
(now v2, v3, v4, v5, matching the picker). Because the persona wording changed, the
`prompt-corpus-persona` corpus was regenerated; no other prompt or corpus changed.

### 3. Documentation and security policy made truthful

- `SECURITY.md`: the installer is described accurately — on the legacy directory line it writes
  `<DSH_HOME>/.agent-presets/` (including its state file and backup copies) with Node's own `fs`, so it
  no longer claims that "every write goes through the host's `fs` service". The supported-version table
  was corrected too: 2.3.x's real limitation is that it **cannot run on DSH 0.2.x**, not that it only
  serves ≤ 0.1.6 (2.4.x also covers ≤ 0.1.6).
- `docs/AUDIT-CHECKLIST.md`: §9's table now agrees with §9.1/§9.2 in the same file (this repository
  configures **no** Dependabot and **no** workflow), and it records the preconditions for ever adding CI
  (third-party Actions must be pinned to a commit SHA with the version kept in the comment).
- v3's design document no longer claims "this package contains only v2/v3/v4" (v5 has shipped since
  2.1.0), and the Chinese README's upgrade note gained the "DSH ≤ 0.1.6 directory form only" qualifier
  the English version already had.

## Compatibility

- The four presets' **prompts (apart from that one persona wording), tool surface, composition
  declarations, parameter defaults and data formats** are unchanged, and the supported DSH window is the
  same: **0.1.2-alpha.4 … 0.2.0-rc.2**.
- No migration is needed: `State/<institute>.v5state.json`, the project directory layout, and the legacy
  directory form on DSH ≤ 0.1.6 all behave as before.
- `SECURITY.md` now ships with the package (`files` in `package.json` includes it).

## Upgrade

```sh
npm i dsh-vibe-math@latest
```

Desktop updates through Settings → Plugins; a CLI profile uses
`dsh plugin --profile <your profile> add dsh-vibe-math@latest`, then restart DSH.

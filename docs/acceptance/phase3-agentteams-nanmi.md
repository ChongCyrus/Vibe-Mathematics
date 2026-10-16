# Phase 0b · 第三方 `NanmiCoder/dsh-agent-teams` —— vmu 可复用之处

> ★ **本文件边查边写**（Lead 本轮硬要求）：骨架先落盘，之后逐条补。★ 现状：**已完成"读到的部分"**；**README 正文未读到**（见 §5 没核）。
> 来源：`https://github.com/NanmiCoder/dsh-agent-teams`；★ 每条给 **URL ＋ 仓库内文件路径**；★ **"读过" 与 "推测" 分开**；★ **不编 API 名**。
> 纪律：**不改仓内代码**／**不跑 T1 或全量门禁**／scratch 在 `D:\_tmp`／不碰 `token.txt`。写者范围：仅本文件。

## 0. 进度

| 阶段 | 状态 |
|---|---|
| 建骨架存盘 | ★ **已做** |
| 仓库根目录清单（`api.github.com/.../contents/`） | ★ **已读**（§1 的依据） |
| 仓库 README 正文 | ★ **未读**（`web_fetch` 只取到 GitHub 外壳、正文被截断；`raw.githubusercontent.com` **抓取失败**）⇒ **没核** |
| 逐条提炼 | ★ **已写**（§2–§4，**只写我能引证的**） |
| "没核" | ★ **已写**（§5） |

## 1. 该项目是什么 / 架构与公开面（★ 依据＝读过的东西）

**读了什么**：① 仓库首页 HTML 的 **title/description**；② **根目录清单**（`https://api.github.com/repos/NanmiCoder/dsh-agent-teams/contents/`，HTTP 200）。

1. ★ **定位（读：仓库 description）**：`https://github.com/NanmiCoder/dsh-agent-teams` —— 逐字为 *"DeepSeek Harness 的 Agent Teams 多智能体协作插件，支持多个 AI Agent 组成团队，协同完成复杂任务，实现任务分配、并行执行、成员通信与团队协作。AgentTeams plugin for DeepSeek Harness"* ⇒ ★ **它是 DSH 的一个【插件】**（与 vmu 同类：preset/plugin 形态），不是独立框架。
2. ★ **根目录（读：上面的 contents 清单）**：
   - 目录：`src/`、`lib/`、`docs/`、`skills/`、`scripts/`、`assets/`、`release-notes/`、`.agents/`、`.dsh/`、`.github/`
   - 文件：`README.md`(19,280 B)、`README_ZH.md`(17,347 B)、`AGENTS.md`(889 B)、`CONTRIBUTING.md`(4,800 B)、`package.json`(12,603 B)、`compatibility.json`(666 B)、`cordis.patch.yml`(1,108 B)、`tsconfig.json`／`tsconfig.client.json`、`tsdown.config.ts`、`pnpm-workspace.yaml`／`pnpm-lock.yaml`、`LICENSE`
   ⇒ ★ **读到的结构性事实**：① 它是 **TypeScript 插件工程**（`tsdown.config.ts` 构建、`tsconfig*.json` 含 **client** 一份）；② 它**显式带一个 DSH 侧的 patch 清单 `cordis.patch.yml`**；③ 它**把"兼容性"做成数据文件 `compatibility.json`**；④ 它有 **`skills/`** 与 **`.agents/`** 两个"以目录承载定义"的面；⑤ 它有 **`release-notes/`** 作为一等目录。
   ★ **未读** ⇒ 这些目录里的**内容**与**公开 API 名**我一概**不写**（§5）。

## 2. ★ (a) vmu 缺、而它有的

★ **（暂缺可写的条目 —— 因为 README 正文未读到，我不愿在没有引证的情况下断言"vmu 缺什么"）**。★ 可写的**候选**（明确标**推测**，依据仅根目录清单）：
- **(a-候选 1) `compatibility.json` 这类【机器可读兼容清单】**：★ 读到的证据＝该文件存在且 666 B（根目录清单）。★ 推测＝它声明"本插件兼容哪些 DSH/宿主版本"。★ **vmu 侧**：我这条**没有**读过 vmu 的对应物（不写结论）⇒ ★ 标 **没核**。
  - **归属**：★ 若要做，**属于 pack/中间件层（打包与声明的元数据）**，**不进内核** —— 内核零策略：宿主兼容性是**部署事实**，不是框架能力。
- **(a-候选 2) `.agents/` 目录承载"agent 定义"**：★ 读到的证据＝该目录存在。★ **vmu 侧对照（我在本会话早前读到的 vmu 事实）**：vmu 的 preset 里已有 `agent.cordis.yml`／`preset.yml`（见 `Vibe-Mathematics/installer.js` 的 `PRESETS[].files` 清单，本会话读过）⇒ ★ **vmu 已有同类"以文件承载 agent 定义"**的形态 ⇒ 因此这条**更像是 (b) 或 (c)**（见 §3/§4），★ **不是我敢断言的 (a)**。

## 3. ★ (b) vmu 有但做得更差的

| # | 它（第三方） | vmu（对照） | 归属 |
|---|---|---|---|
| b-1 | ★ **`release-notes/` 一等目录**（根目录清单读到） | vmu 的证据散在 `docs/acceptance/*.md` 与 `_handoff/vmu/*-report.md`（本会话大量读写过）；★ **我没读过 vmu 是否有 release-notes 类目录** ⇒ ★ **"vmu 更差"这句我保留为推测，记没核** | ★ **pack/docs 层**（发布沟通是机制/流程），**不进内核** |
| b-2 | ★ **`tsconfig.client.json`＋`tsdown.config.ts`（客户端产物有独立构建面）** | vmu 的模板/客户端面走 `preset.yml`／`agent.cordis.yml`（`installer.js` 读过）＋ `docs/acceptance` 的交付约定；★ **两者能力是否等价，我没读** ⇒ **推测** | ★ **pack/打包层** |

★ 说明：**(b) 类我只写到"可对照的差异"，不敢写"更差"的结论** —— 那需要我把两侧都读到（§5）。

## 4. ★ (c) 值得借鉴的

1. ★ **`cordis.patch.yml`：把"对宿主的补丁/接线"显式成一份清单**（读：根目录清单；1,108 B）。
   - **vmu 侧对照（本会话读过的 vmu 事实）**：vmu 的 `installer.js` 里 `PRESETS[].files` 已列出 `agent.cordis.yml`／`preset.yml` ⇒ ★ **同类机制存在**。
   - ★ **可借鉴点**：**"补丁清单"与"文件清单"分开**（今天是同一份 files 列表承担两件事）。
   - **归属**：★ **pack/中间件（打包机制）**；★ **不进内核**（内核不承载打包策略）。
2. ★ **`skills/` 目录：把"技能"当**可分发资产**而不是代码概念**（读：根目录清单）。
   - **vmu 侧对照（本会话读过的 vmu 事实）**：vmu **有** `kernel/skills.js`（见 `Vibe-Mathematics/installer.js` 的文件清单）⇒ ★ **能力在内核**，而"技能作为**可分发目录**"是**打包面**。
   - ★ **可借鉴点**：**内核提供技能机制、pack 提供技能资产** —— 这正好是 vmu 的红线划分（能力在内核／机制决定在 pack）。
   - **归属**：★ **能力（skill 的装载/调用）→ 内核**；★ **资产（`skills/**` 的内容）→ pack/中间件**。
3. ★ **`compatibility.json`：兼容性做成**数据**，而不是散在 README**（读：根目录清单）。
   - **归属**：★ **pack/打包层**（元数据），**不进内核**。
4. ★ **`AGENTS.md`（889 B，根级短文件）**：★ 与 `README`／`CONTRIBUTING` 并列的**给 agent 读的短契约**。
   - **vmu 侧对照**：vmu 有 `packs/v5r/prompts/**`（本会话改过 `v5r-core.js`／`prompt-switches.js`）与 `docs/**`。
   - ★ **可借鉴点**：**根级短文件**做"**本仓规矩的最短入口**"（vmu 目前的规矩散在 `docs/`＋`_handoff/` 的多份报告里）。
   - **归属**：★ **pack/docs 层**，**不进内核**。

## 5. ★ "没核"（不敢写结论的）

1. ★ **README 正文（19,280 B）未读到**：`web_fetch https://github.com/NanmiCoder/dsh-agent-teams` 只返回 GitHub 外壳、**正文被截断**；★ `https://raw.githubusercontent.com/NanmiCoder/dsh-agent-teams/main/README.md` **抓取失败**（`TypeError: fetch failed`）⇒ ★ **该项目的功能清单、公开 API 名、配置键名，我一律没核**（**因此本文件一个 API 名都没写**）。
2. ★ **`src/**`／`lib/**` 内容未读**（连子目录清单都没取）⇒ 架构细节（模块划分、事件、工具名）**全部没核**。
3. ★ **`docs/**`／`skills/**`／`.agents/**`／`release-notes/**`／`.dsh/**` 的子清单与内容未读**。
4. ★ **`compatibility.json`／`cordis.patch.yml`／`package.json`（12,603 B）／`AGENTS.md` 的内容未读** ⇒ §2–§4 里凡涉及它们**具体字段/键名**的推断，**都没有核**。
5. ★ **vmu 侧的对照多数未经本轮复核**：我引用的 vmu 事实（`installer.js` 的 `PRESETS[].files` 含 `agent.cordis.yml`／`preset.yml`／`kernel/skills.js`；`packs/v5r/**` 的存在）是**我在本会话早前读到的**，★ **本轮未重新读**；vmu 是否有 `release-notes/` 类目录 ⇒ **没核**。
6. ★ **旧扫描**：`D:\wd\vibemath开发\_teams-scan.txt` **已读**＝**14 行、只有模块名**（`dsh-agent`／`dsh-agent-loop`／`dsh-agent-presets`／`dsh-agent-instructions`／`dsh-agent-default-model`／`dsh-agent-tool-presentation`／`dsh-client-ui-agent-preset`／`dsh-client-ui-subagent`／`dsh-subagent`／`dsh-subagent-fork-in-process`／`dsh-subagent-in-process-driver`／`dsh-subagent-spawn-in-process`／`dsh-tool-subagent`／`dsh-tool-subagent-control`），★ **无分析**；★ `_teamscan2.txt` **本轮未读**。
   - ★ **由那 14 个名字能得到的唯一"未核线索"**（**推测**，非结论）：该项目可能覆盖 **agent loop／presets／instructions／default-model／tool-presentation** 与 **subagent 的三种驱动（fork-in-process／in-process-driver／spawn-in-process）**、以及 **`dsh-tool-subagent`＋`dsh-tool-subagent-control`** 两个工具面 ⇒ ★ **这些与 vmu 的 `kernel/skills.js`／`kernel/index.js`／host 工具面可对照**，**但需要读 `src/**` 才能写实**。

## 5.5 ★★ 补记（**读到内容**，把 §2/§4 里那条"推测"升级为"实证"）

★ 我随后用 **GitHub contents API** 取到了 `compatibility.json` 的**内容**（base64）：
`https://api.github.com/repos/NanmiCoder/dsh-agent-teams/contents/compatibility.json`（HTTP 200，`encoding: base64`）⇒ ★ **读到**的结构（**逐字段**）：
```json
{ "schemaVersion": 1,
  "recommendedHost": "0.2.0-rc.2",
  "previewTag": "next",
  "supportedHosts": [ { "version": "0.2.0-rc.2", "track": "recommended" },
                      { "version": "0.1.7-rc.2", "track": "legacy" },
                      { "version": "0.1.5-rc.3", "track": "legacy" }, … ] }
```
（★ `supportedHosts` 共 8 条，`track` 取值读到 **`recommended`／`legacy`／`preview`** 三种。）

### ⇒ 由"读到的内容"得出的两条（★ 不再是推测）
1. ★★ **(a) vmu 缺、而它有的**：**机器可读的"宿主兼容清单"**，且**自带 `schemaVersion`**、把宿主版本分成 **`recommended`／`legacy`／`preview` 三类轨道**、并另给 `previewTag`。
   - **证据（读）**：`compatibility.json`（路径来自根清单；内容来自上面的 contents API）。
   - **vmu 侧对照（★ 本会话早前读过）**：vmu 的兼容/版本事实散在 `docs/**` 与门禁（`scripts/*.mjs`）里；★ **我没读过 vmu 有等价的"兼容清单数据文件"** ⇒ ★ **"vmu 缺"这句仍是推断**，但**"它有这么一份数据文件、字段如此"**是**实读**。
   - **归属**：★ **pack/打包层（元数据 + 打包策略）**；★ **不进内核** —— 内核零策略：**"支持哪些宿主版本"是部署事实**，内核只该提供**读取/校验的接缝**（若将来要自动化），而**轨道划分（recommended/legacy/preview）是机制决定，留在 pack**。
2. ★ **(c) 值得借鉴**：★ **`track` 这种"三轨"标注**（recommended／legacy／preview）比"一个最低版本号"更能表达**降级路径**；★ 与 vmu 的"每次门禁读数必须**版本绑定**（时间戳＋文件哈希）"是同族思想：**都拒绝"一个数字代表全部"**。
   - **归属**：★ **pack/中间件**（怎么对待旧宿主＝机制决定）；★ 内核只提供**只读的版本事实**。

## 6. 来源清单
- 仓库首页（**只用于 title/description**）：`https://github.com/NanmiCoder/dsh-agent-teams`
- ★ **根目录清单（本文件 §1 的结构事实全部来自它）**：`https://api.github.com/repos/NanmiCoder/dsh-agent-teams/contents/`（HTTP 200；含每个条目的 `path`／`size`／`type`）
- ★ **抓取失败**：`https://raw.githubusercontent.com/NanmiCoder/dsh-agent-teams/main/README.md`（`TypeError: fetch failed`）⇒ ★ 这一条**没有**成为依据。
- 仓库内被**引用到的路径**（全部来自上面的清单，**内容未读**）：`compatibility.json`、`cordis.patch.yml`、`AGENTS.md`、`README.md`、`README_ZH.md`、`CONTRIBUTING.md`、`package.json`、`tsconfig.json`、`tsconfig.client.json`、`tsdown.config.ts`、`pnpm-workspace.yaml`；目录 `src/`、`lib/`、`docs/`、`skills/`、`scripts/`、`assets/`、`release-notes/`、`.agents/`、`.dsh/`、`.github/`
- 旧扫描（**旧、薄、只当起点**）：`D:\wd\vibemath开发\_teams-scan.txt`（已读，14 行模块名）；`D:\wd\vibemath开发\_teamscan2.txt`（**未读**）

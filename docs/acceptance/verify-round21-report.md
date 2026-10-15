# Round 21 · vmu-verify2（`task-132`）交付报告 —— 矩阵 v15 ＋ 最后一轮独立复核

> 纪律：**只读复核**（未改任何仓内文件）；未跑全量（T0/T1 归 Lead）／未 `regen-all`／未 git；临时文件只在 `D:\_tmp\v21`。
> **读的是哪一次运行／哪一版文件**（逐条注明）：提交 **`d2e45107df3fd8ed65229d259d1cc613dbff9202`**（"round 20 …"，Lead 报 **T1 315/315**，29 文件 +1209/−33）＋ **复核期间工作树上有 `vmu-pack2` 在飞的 `task-130` 编辑** ⇒ 凡受其影响处**一律以 `git show HEAD:<file>` 的内容重算并两版并列**。
> 交付：`_handoff/vmu/04-parity-matrix.md` **§9.29 v15**（**1076 → 1135 行**）。

## 0. 结论速览

| 项 | 状态 | 读数 |
|---|---|---|
| **矩阵 v15（8 项）** | ✅ | §9.29.1 八项逐条＋我的独立复核结论；§9.29.2 纪律（6 条，全部有现场代价）；§9.29.6 **第 8 项＝`packs` 保留键假设，记"待判定"**（不写成结论） |
| **提交版门禁复核** | ✅ 绿 | `audit-declaration-criterion 88/0`（`RULE E 67=67`、`C2 57=57`）、`membership 29/0`、`settings 47/0`、`meetings 163/0`、`kernel 175/0`、`entry 150/0`、`metrics-counter 26/0`、`pack-inline-manifest 35/0`、`pack-plan-rule-validate 21/0`、`pack-tool-actions 17/0`、`resume-token-contract 14/0`、`enforced-consistency 358/0`、`installer-policy ALL GREEN`、`pack-face`／`tool-table` exit=0、**`regen-all --check 15/15`**、`files[] 687/687` |
| **结构性断言** | ✅ | 一律对 `HEAD` 内容重算：`pack.js` 调 `rules.validate` ✓／**只遍历 `m.rules`** ✓／`validatePack` 内无它 ✓；`host.js` unload 先于守卫 ✓／`:677` 旧句已消失 ✓；`schema.js` `orderMode` **enum+domain 且在生成块之外** ✓；`bus.js` 豁免行＋`middleware/skipped` 俱在 ✓ |
| **★ 新发现（甲）** | ⚠ 未派单 | `audit-vmu-docs` 的**代码侧读注释** ⇒ 在飞注释里的探针码把门打红（第七条现场）；建议**去注释＋双向自探针** |
| **★ 新发现（乙）** | ⚠ | 第四次"读数随树漂移"——**发生在我自己的最终复核里**（撞上 task-130 在飞编辑）⇒ 已按 HEAD 内容重算＋两版并列 |
| **待判定** | ⏳ | 第 8 项 `packs` 保留键（H1）vs **仓内候选（H2：`vibe-math-vmu.js:706` 读未注入的 `ctx.systemPrompt`）** ⇒ 我提出**先排除 H2**再跑 `task-131` 的改名实验 |

## 1. 提交版复核：一条红是**在飞编辑**、不是提交

我第一轮门禁扫到 `audit-vmu-docs` **94/1**：
```
FAIL every framework VMU_* code the CODE can throw is registered in 03-§8 (pack codes are namespaced)
     [VMU_ALWAYS (kernel\pack.js) | VMU_TOOL (kernel\pack.js)]
```
**归因（我算的，不是猜的）**：这两个码出现在**工作树 `kernel/pack.js:506` 的注释**里（`// … in \`rules[]\` denies (\`VMU_ALWAYS\` / \`VMU_TOOL\`), the same rule here stays silent…`）；`git show HEAD:vibe-math-vmu/kernel/pack.js` **无这两个码**、`git log -S'VMU_ALWAYS' -- pack.js` **无命中**；我按该门判据 `CODE_LITERAL_RE` 复算：**HEAD 版被引号码 9 个全部已登记**，**工作树新增的恰好是 `["VMU_ALWAYS","VMU_TOOL"]`** ⇒ **提交版绿／工作树因在飞编辑红**（已即时通知 `vmu-pack2`，他们 1 行即可止血）。
★ **门禁侧的问题（我的领域，需派单）**：该门代码侧对**整文件原文**跑（不去注释）⇒ **注释里的反引号码被当成"代码能抛的码"** ＝ 第七条现场（门禁把散文当代码）；仓库已有 `tests/_lib/strip-comments.mjs`（依赖环门禁在用）。**正解＝去注释＋双向自探针**（**注释里**的码不计入／**字符串里**的码必须仍计入）；**不要**用"让作者改写注释"当修法（R10 记过的"门禁指挥措辞"反模式）。

## 2. 第 8 项：`packs` 保留键假设（**待判定**）＋ 我复核出的一条仓内事实

- **假设（`vmu-core2`，未验证）**：R21b 的 `agent-preset/invalid … cannot get property "systemPrompt" without inject` 抛在 **cordis `lib/index.js:676`**（服务代理）；对照＝R18/R21 同层**无 `packs`** 时正常 ⇒ 猜 `packs` 是 **DSH 预设行保留键**。判定＝`task-131`（改名实验）。
- ★ **我复核出的仓内事实（与"抛错不在我们仓"相冲突，必须并列）**：`vibe-math-vmu.js:706` 的 `if (effectivePrompts.length > 0 && ctx && **ctx.systemPrompt** && typeof ctx.systemPrompt.section === 'function')`（`:708`/`:711` 各再读一次），而 `export const inject = ['tools']`（`:51`）⇒ **`systemPrompt` 未注入**；cordis 代理**对属性访问本身**抛错 ⇒ **真值判断挡不住会抛的 getter** ⇒ **仓内存在与错误文案相容的候选抛点**。
- ⇒ **两条竞争假设**：**H1**（DSH 保留键／装配残缺）／**H2**（我们自己在 `:706` 访问未注入的代理；R21b 只是改变了 DSH 是否装配 `systemPrompt`）。**均未排除**。
- ⇒ **建议先排除 H2**（成本＝一行＋一次复现：把该访问包 `try/catch` 打 `err.stack`），**再做 `task-131` 的改名实验**——否则该实验的两种结果都可能被 H2 解释掉。`D:\_tmp\r21b-session.log` 我读过：**只有错误文案、无 stack 帧** ⇒ 从它判定不了。

## 3. 纪律入册（§9.29.2，全部有现场代价）

1. **两向断言必须让"被判定的那一行"真的走红**（`vmu-pack2`：第一版把 `kind:'module'` 写进 manifest ⇒ 缺陷2 的复原也是绿的 ⇒ 观测点绕过被测行）。
2. **读数必须绑定版本，且在最后一次编辑之后重跑**（我用算术抓出 `23+2=25 ≠ 26`；`vmu-comms2` 自陈读数早于其补 `U0` ⇒ 改 24/2＋哈希绑定并升级纪律）。
3. **放弃／转出要汇聚成"悬空清单"**（R19 `task-122`、R20 `pack.js` ⇒ 两次"每个人都以为别人有"）。
4. **`JSON.stringify(<Promise>)` ＝ `"{}"`**：我漏 `await` 时同一个 `{}` 同时给出"B 不触发"（对）与"A 也不触发"（错）⇒ **半对的坏读数最危险**；**签名**＝本该有字段的对象序列化成 `{}`（或 `if (typeof x?.then === 'function') throw`）；与既有两条量具假象同族。
5. **"读会话日志"本身是有版本的读法**（one-shot zstd 只出 2 行、看起来像证据；须按 magic 切帧）。
6. **"我没找到"≠"它不存在"**：`R21b` **只有单方读数**，我**没有**把它升级成双人复算（Lead 照此记账）。

## 4. 本轮我自己的两次更正（都当场具名）

1. 对 `vmu-core2` §0"事实2"的更正：**我们的入口确实读 `ctx.systemPrompt`**（`inject=['tools']`）⇒ "从不读"不准确，且这是**仓内候选抛点**（见 §2）。
2. 对"提交版有红"的更正：我第一轮读数是在**在飞编辑**上取的 ⇒ 改按 `HEAD` 内容重算，两版并列（见 §1）。

## 5. 悬空/需派单（具名）

| 项 | 状态 |
|---|---|
| `task-131` `packs` 保留键对照实验 | 已派 `vmu-assistant2`（**待判定**）；建议**先排除 H2** |
| `task-130` 形状 B 死条目（改走 `toBusEntries`）＋ `docs/18:145`／`docs/10:512-514` 收窄 | **unowned**（行为变更已裁决接受、须具名；零出货包受影响） |
| **(甲) `audit-vmu-docs` 代码侧去注释＋双向自探针** | **未派单**（我的领域，本轮只报不改） |
| 共享 `oneOf` 回落（`tier`／`attendanceMode`／… 四处以上） | **未派单**（R17 只按裁决收了 `orderMode`） |
| `task-129` 出货 pack 装载 | **`vmu-core2` 具名"未做"并 release**；**本轮不记任何装载成功** |

★ **新文件登记**：本轮**仓内无新增文件**（我只写 `_handoff/**`，在仓外）⇒ 无需双登记。

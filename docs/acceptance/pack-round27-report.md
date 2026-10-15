# Round 27 · vmu-pack（`task-143`）交付报告 —— ① `enabled` vs `published` 双向具名 ＋ ② `A2` 的牙（**做红，不撤回**）

> 任务：`task-143`（① 具名第四条"回执两字段讲不同的事"；② `A2` 变异做红或撤回）
> 纪律：原子编辑；`host.js` 一动即重跑 `vmu-host`／`vmu-host-hooks`／`vmu-entry`／`audit-status-report-fields`／`audit-enforced-consistency` ✓（**全绿**）；`kernel/meetings.js` **未碰**（`git diff` 无输出）；**未自造公开码**；未跑全量／`regen-all`／git；变异只在 `D:\_tmp` 脚本里、**逐字节复原并核 md5**。
> **★ 读的是哪一版**：起点 HEAD = **`e5e5c99a3119ed05bbdeaf616d77b47aafe93509`**，工作树干净；改动面＝**仅** `vibe-math-vmu/host.js` ＋ `tests/vmu-pack-defaults-named.test.mjs`。

---

## 0. 结论速览

| 项 | 结论 |
|---|---|
| **① `enabled` vs `published`** | ✅ **选 (a) 具名**（**不动面订阅语义**）：新增 **`faces.enabledGap`（published−enabled）** ＋ **`faces.enabledNotPublished`（enabled−published）** ⇒ ★ **两个方向、逐条、带可复核来源** |
| **① 可复核来源** | ★ 按 `verify2` 的定位改用 **`publishedDetail[].reason`**（`"surface:bus-entries"`／`"setting:vmu.report.*"`／`"setting:vmu.meetings.*"`），而不是 `faces.sources[face]`（那几个面**恰为 `undefined`**）；★ 并同时给出 **`faceRowSource`**（＝null 本身即证据：它是**绕过面行判决**发布的） |
| **① 断言** | ✅ 扩展 `tests/vmu-pack-defaults-named.test.mjs` 的 **E 块**（两路线各测一次；差集必须被逐条解释；失败打印差集＋未解释者）⇒ **27/0**；★ **当天种了反例**：把两个 gap 过滤器清空 ⇒ **22/5 红**（E1/E2 两路线） |
| **② `A2` 的牙** | ✅ **选 (i) 做红**（**不撤回**）：★ 根因＝**两处写着同一行的折入点**（`:323` prompts／**`:349` settings/defaults**），我第一版变异用 `String.replace`（**只替换第一处**）⇒ **打在了 `:323`**，而它**动不了 `defaults`**；★ 定向到 **`:349`** 后 ⇒ **20 passed / 7 failed**，**`A2` 红在被测那一行 `[43]`** |
| **门禁** | ✅ **全绿**（含 `audit-declaration-criterion` **88/0**） |

---

## 1. ① 两个方向都具名（比裁定原文更大）

**实测（真状态工具，两路线）** —— ★ 不是"只有 `report`"，也不是只有一个方向：

| 路线 | `enabled` | `published` | **published − enabled** | **enabled − published** |
|---|---|---|---|---|
| **`config.packs`** | 14 | **15** | ★ **`["middleware","report"]`** | ★ **`["set"]`** |
| **设置键** `vmu.packs.active` | 4 | **7** | ★ **`["middleware","meeting","report"]`** | `[]` |

**新增两个字段（`host.js` 状态面，`out.faces` 内）**：

| 字段 | 方向 | 每条携带 |
|---|---|---|
| `enabledGap:[{face,tool,source,faceRowSource,inThisEvaluation,evaluations,reason}]` | **published − enabled** | ★ **`source` ＝ `publishedDetail[].reason`**（**真正把它发布出去的那条判决**）；★ **`faceRowSource` ＝ `faces.sources[face]`（这几个面恰为 `null` ⇒ 这本身就是"它绕过了面行判决"的证据** ✓） |
| `enabledNotPublished:[{face,source,evaluations,reason}]` | **enabled − published** | 同上形状的 `source`（`false`/`null` 均可复核） |

★ **实测取值（就是"可复核"的意思）**：`config.packs` 路线
`enabledGap = [ {face:'middleware', source:'surface:bus-entries', faceRowSource:null}, {face:'report', source:'setting:vmu.report.*', faceRowSource:null} ]`、
`enabledNotPublished = [ {face:'set'} ]`。

**★ 代码级成因（`verify2` 定位、我复核）**：`host.js:232` 是面行声明，而 **`:834` 的 `if (on('report')) specs.push(makeReportSpec(…))` 是【直接 push】** ⇒ ★ **`report` 的发布绕过了面行判决** ⇒ 它出现在 `publishedDetail` 里、却不在 `faces.sources` 里 ⇒ 这正是"两个字段讲不同的事"的机制。★ **我选 (a)（具名）而非 (b)（把 `report` 纳入 `enabled`）** —— (b) 会**动面订阅语义**（把一个"直接 push 的工具"改判成"面被订阅"），并波及既有面断言/套件；按 Lead 裁定"**不动面订阅语义**"⇒ **(a)**，与既有 `notPublished` 同族（一个报"该有而没有"、一个报"有而字段未列"）。

**★ 断言（E 块，`tests/vmu-pack-defaults-named.test.mjs`）**：两路线各测一次 ⇒ 计算 `published` 与 `enabled` 的**双向差集** ⇒ **必须逐条出现在对应字段里**（失败打印 `gap`/`explained`/`unexplained`）；`E3/E4` 钉住本轮的原例（`report` 具名 ＋ **`14 / 15`** 两个计数仍然成立 ⇒ 解释是挂在**真实**的不对称上，而不是空过）。

---

## 2. ② `A2` 的牙：**做红**，并写清"第一次为什么没红"

**★ 根因（我与此轮 `verify2` **各自独立**得到同一结论）**：**两处声明写着同一行**
`const wantedPacks = Array.isArray(config.packs) ? config.packs.filter((p) => typeof p === 'string') : []`
—— **偏移 `20787`（`:323`，读 `prompts/sections.json`）** 与 **`22399`（`:349`，读 `settings/defaults.json`）**。
★ 我第一版变异用 **`orig.replace(FROM, TO)`**，而 **`String.replace` 只替换第一处** ⇒ **打在了 `:323`（prompts）**，那一处**根本不动 `defaults`** ⇒ `A2` 保持绿。★ **我先前的假设（"`settings` 在该作用域形态不同"）是错的** ⇒ **不是断言没盯住那一行，是变异没打在那一行。**

**定向复原（把变异只打在第二处 `:349`）**：

| 步 | 读数 |
|---|---|
| CONTROL（未变异） | `27 passed, 0 failed` **EXIT=0** |
| **MUT@`:349`**（折入输入集 += `vmu.packs.active`） | ★ **`20 passed, 7 failed`** **EXIT=1**，**`A2` 红在被测那一行**：`[43]`（`defaults` 从 0 变 43 ⇒ "偷偷强补折入"确实发生了）；连带 `A3`（`registered:16, lost:[]`）、`A4`、`C1`、`C5` 红 |
| 复原后 | `host.js`／`vibe-math-vmu.js` **md5 逐字节相同**，测试回 **27/0** |

⇒ ★★ **结论：`A2` 有牙，覆盖该变异** —— **不撤回**（撤回会写成"本断言不覆盖该变异"，而事实相反）。★ 上一轮我把它记为"未证"，**本轮更正为已证**（报告与矩阵口径应据此改：**"A2 覆盖'偷偷强补折入'，反例在 `:349`"**）。

---

## 3. ★ 我自己的两条量具/工具错误（都已自陈）

| # | 事实 | 处置 |
|---|---|---|
| **4** | ★ **变异工具打错折入点**：`String.replace`（首处）落在 `:323` prompts，而"能红"的是 `:349` settings/defaults ⇒ **一条有效的断言被我误记成"没牙"**。★ 教训：**变异针对"重复出现的同一行"时，必须按偏移/行号定向，或用 `split/join` 全替换**；否则"变异没报错"会伪装成"断言无效"。 | 已定向到 `:349` 并做红 ✓ |
| **5** | ★ **我第一次给 E 块种反例时，变异产生了 `SyntaxError`**（把赋值头换成 `[] // SUPPRESSED` 后残留 `.map` 链）⇒ 那是**假红**。★ 我**没有**把它当证据上报，改成**保持语法有效**的清空过滤器版本 ⇒ `22 passed / 5 failed`（E1/E2 两路线）、**无 SyntaxError**、复原 md5 相同。 | 已在报告与脚本里显式区分"真红 / 语法假红" ✓ |

★ 这两条与前面的三条（字面前缀 grep／`execute()` 返回字符串／`calls≠distinct` 对不相交批次失明）同族：**都是量具，不是被测物**。★ 也正因如此，本轮 `A2` 的判定我**没有**停在"设计上应该能红"。

---

## 4. 原样命令 ＋ 退出码（同一次最终扫，**全绿**）

| 命令 | 读数 | 退出码 |
|---|---|---|
| `node tests/vmu-pack-defaults-named.test.mjs` | **`27 passed, 0 failed`** | **0** |
| `node tests/vmu-host.test.mjs` | `107 passed, 0 failed` | **0** |
| `node tests/vmu-host-hooks.test.mjs` | `22 passed, 0 failed` | **0** |
| `node tests/vmu-entry.test.mjs` | `150 passed, 0 failed` | **0** |
| `node tests/audit-status-report-fields.mjs` | `19 passed, 0 failed` | **0** |
| `node tests/audit-enforced-consistency.test.mjs` | `358 passed, 0 failed` | **0** |
| `node tests/vmu-packs-active-switch.test.mjs` | `24 passed, 0 failed` | **0** |
| `node tests/audit-package-membership.mjs` | `29 passed, 0 failed` | **0** |
| `node tests/audit-declaration-criterion.test.mjs` | ★ **`88 passed, 0 failed`**（此前那条 `regen-all --check` 已由 Lead 重生成解决） | **0** |
| `node tests/audit-vmu-docs.test.mjs` | `99 passed, 0 failed` | **0** |
| `node scripts/check-docs.mjs` | `DOC LINT: PASS` | **0** |
| `node D:\_tmp\vmu-pack14\r27-m2-targeted.mjs` | CONTROL 27/0 ⇒ MUT@`:349` **20/7（A2 `[43]`）** ⇒ 复原 md5 相同 27/0 | 0 |
| `node D:\_tmp\vmu-pack14\r27-e-counterexample.mjs` | CONTROL 27/0 ⇒ 清空 gap 过滤器 **22/5（E1/E2）无 SyntaxError** ⇒ 复原 md5 相同 27/0 | 0 |

★ **改动面＝仅 `host.js` ＋ 该测试文件**（`git status` 只有这两条 M）；`package.json` **本轮未改**（未新增文件）。

---

## 5. 交回 Lead／`vmu-verify2`

1. **① 已落**：**双向**、**逐条**、**带可复核来源**（`publishedDetail[].reason`）＋ `faceRowSource:null` 作证据；**选 (a)** ⇒ **未动面订阅语义**（故不涉及既有套件影响面）。★ 与裁定原文的差别已在报告具名：**不止 `report`**（`middleware` 两路线都有、设置路线另有 `meeting`），且**反方向也有差**（`set`）。
2. **② 已做红**：**不撤回**；根因＝**两处同一行的折入点 + `String.replace` 只替换第一处**；定向 `:349` ⇒ **`A2` 红 `[43]`**。★ 请把矩阵里我上一轮的"未证"改成 **"已证（反例在 `:349`）"**。
3. **★ 新断言当天种了反例**：E 块（①）⇒ 清空 gap 过滤器 ⇒ **22/5 红**（**无 SyntaxError**，即真红）；`A2` ⇒ **20/7 红**。两条**都在同一次交付里给出反例读数**（符合刚立的纪律）。
4. **未做／边界**：**E 的 (b) 方案（把 `report` 纳入 `enabled`）未采纳**（按裁定"不动面订阅语义"，且它会改面语义）；`docs/10`／`docs/29` 本轮**无需改**（该差异是**宿主回执**的事实，已落在字段与注释里）；`kernel/meetings.js` 未碰；**未自造公开码**。

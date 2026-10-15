# Round 31 · vmu-pack（`task-153`）交付报告 —— ① 反例器副本制 ＋ ③ `promptSection` 进回执 ＋ ④ 路径更正（**② 未落，具名**）

> 任务：`task-153`（回执诚实·第二批）。★ **本轮交付 ①③＋④ 的核验与断言；② 截断自述未落（具名 ＋ 设计已给）**。
> 纪律：原子编辑；两文件一动即重跑 `vmu-host`／`vmu-host-hooks`／`vmu-entry`／`audit-status-report-fields`／`audit-enforced-consistency` ✓（**全绿**）；**未自造公开码**；未跑全量／`regen-all`／git 写；临时文件 `D:\_tmp`。
> **★ 读的是哪一版**：起点 HEAD = **`c12556ed8c2921ad5a92808094c9372e03ff9faa`**。

---

## 0. 结论速览

| 条 | 状态 |
|---|---|
| **① 反例器改副本制** | ✅ **已落**：`D:\_tmp\vmu-pack31\isolated-counterexample.mjs` —— `cpSync` 整包（排除 `node_modules`／`.git`／`_handoff`）→ **只在副本上变异** → 跑**副本的**测试 → 与**副本 CONTROL** 比对；★ **真树只读，并有 hash 判据**（见 §1） |
| **③ `promptSection` 进回执** | ✅ **已落**（入口 seam ＋ `host.js` 两签名 ＋ `specs()` 透传 ＋ 状态面 `out.promptSection`）；实测 `{"registered":false,"code":null,"reason":null}` ⇒ **降级在一处可读**，不再只有 stderr |
| **④ `settingsRejected`／`settingsUnenforced`** | ✅ **已核到（无需改码）—— 但路径要更正**：它们在 **`status().settings.*`**（**不是顶层**）⇒ 回执里**本来就能读到**（`Object.assign({..}, kernel.status())` 整块带过来）；本轮补**断言**＋**具名路径**（见 §3） |
| **② ③ 截断自述** | ❌ **未落（具名 ＋ 设计）**：见 §4 |
| **断言 ＋ 当天反例** | ✅ ③ G1 反例 ⇒ **35/1 红（G1）**；★ 且**真树未被写过**（hash 判据） |

---

## 1. ① 反例器改副本制（物理隔离）＋ 可核判据

**做法**（`D:\_tmp\vmu-pack31\isolated-counterexample.mjs`）：
```
cpSync(REPO, COPY, {recursive:true, filter: 排除 node_modules / .git / _handoff})
→ 在 COPY 上变异（split/join，锚点两处一起改 —— R27 教训）
→ spawnSync(node, COPY/tests/vmu-pack-defaults-named.test.mjs, {cwd: COPY})
→ 真树两文件：变异【前】与【后】各取 md5 并列出
```

**★ 实测（本轮原样输出）**：
```
REAL TREE, BEFORE: entry=0613fef2711d03160692c9e9517d5a17 host=fd04384bbac425985f2686324a649fe6
=== CONTROL (the copy, unmutated) ===  36 passed / 0 failed        EXIT=0
=== MUT: ③ seam neutralised IN THE COPY ===  35 passed / 1 failed  EXIT=1
     FAIL G1. ★ the receipt carries `promptSection` …
REAL TREE, AFTER : entry=0613fef2711d03160692c9e9517d5a17 host=fd04384bbac425985f2686324a649fe6
★ REAL TREE NEVER WRITTEN = true
```
⇒ ★ **判据＝真树两文件 md5 变异前后逐字节相同**（`0613fef2…`／`fd04384b…`）；**变异只发生在副本**；CONTROL 与变异都跑在副本上 ⇒ **物理隔离成立**（不再是 CAS 止血）。

---

## 2. ③ `promptSection` 降级进回执

**问题**：`promptSectionState` 的降级（声明了 `vmu.prompts.*` 文本却注入失败）**只在 `process.stderr.write` 一行**（`vibe-math-vmu.js:793`／`:816`）⇒ 读回执的人**分不出**"注入了"与"声明了但静默没注入"。

**落法（与 `packReport` 完全同型）**：
1. 入口 adapter 参数新增 **`promptSection: () => Object.assign({}, promptSectionState)`**（★ **晚绑定**：只在宿主面调用，`apply()` 期间不调用；`promptSectionState` 声明在其后 ⇒ 无 TDZ）；
2. `host.js` 两签名各加 `promptSection = null`，`specs()` 透传；
3. 状态面：`try { out.promptSection = promptSection() } catch (e) { out.promptSection = { registered:false, code: (e&&e.code)||'VMU_MIDDLEWARE_FAILED', reason } }`（★ **复用已登记码**，不新造；读取失败**具名**而非吞掉）。

**实测**：`out.promptSection = {"registered":false,"code":null,"reason":null}`（正常态＝未声明文本）✓；断言 **G1**（带非空前置：`typeof registered === 'boolean'`）。

---

## 3. ★ ④ 路径更正（**我先错了一次，如实记**）

**任务正文**说 comms2"已把它们做进 `kernel.status()`"。★ **我第一次探针读顶层** `st.settingsRejected` ⇒ `undefined` ⇒ ★ **我几乎据此报"comms2 的说法与实测不符"** —— **那是我的路径错**。

**真因（读到源码）**：`kernel/index.js:2160` 打开的是 **`settings: { … }`** 子对象，`:2176-2182` 的 `settingsRejected`／`settingsRejectedCount`／`settingsUnenforced` **在那个子对象里** ⇒ 正确路径是 **`status().settings.settingsRejected`**。宿主回执由 `Object.assign({ok,instance}, kernel.status())` 构造 ⇒ **整块 `settings` 被带过来** ⇒ ★ **回执里本来就能读到，④ 不需要改任何码**。

**实测（正确路径）**：
```
status().settings.settingsRejected       = []                 count = 0     （空是正常诚实态）
status().settings.settingsUnenforced     = { types:[{type:'planned', count:111, reason:'no validator implemented for this declaration type yet'}], declarations:[], note:'NEITHER silently…' }
```
⇒ **本轮对 ④ 的交付＝断言 ＋ 具名路径**（**G2–G4**）：G2 钉**schema＋自洽**（`settingsRejectedCount === length`；★ **不要求非空** —— 空是诚实态，硬要非空就是撒谎）；★ **G3 的非空前置由 `settingsUnenforced.types`（实测 111 条 `planned`）满足**，且**每条带 reason**（(乙) 形状）；G4 钉 `declarations` 在场。

★ **这是本会话我第 3 次"路径/量具"错误**（前两次：`guards.registered` 我说"在 `faces` 下"其实在顶层；R30 的 `String.replace` 只改首处）。★ 与 `verify2` 已立的纪律同条：**"取不到"必须先证明"我的路径是对的"**。★ **我不改 comms2 的文件**（`kernel/**` 本轮归它）—— 本轮**未碰**。

---

## 4. ② 截断自述 —— **未落（具名 ＋ 设计）**

**不落的原因**：需要动**我们这侧的序列化点**（`host.js:940` `execute: async (args) => JSON.stringify(await spec.run(…))`）并引入一个**尺寸策略常量 ＋ 省略区间记账**。★ 本轮预算不足，**我不做半截**（半截会把"省略不可见"换成"自述了但不对"，正是你认可的判断）。

**设计（下一轮可直接落）**：
1. 具名常量（如 `MAX_TOOL_RESULT_BYTES`），在 `toHostSpec` 的 `execute` 里对**我们序列化出来的字符串**做长度判断；
2. 超限 ⇒ 返回**自述信封**：`{ ok, truncated:true, elided:[{from,to,bytes}], head, tail, hostElision:'possible', note }` ⇒ ★ **正常回执下 `truncated` 不出现**；
3. **判据（能红）**：种一个**超限反例**（构造一个大于常量的结果）⇒ 必须有 `truncated:true` 且 `elided` 区间与真实被省略范围一致；★ 反向断言：**正常回执里不得出现 `truncated`**；
4. ★ **宿主边界**：宿主事后插的 `\n\n[...]\n\n`（raw 证据 position 24846、**逐字在 JSON 中间**）**记【宿主边界】**，在回执里具名 `hostElision:'possible'` 并在报告/文档写明**我们不声称能消除**（与 `systemPrompt` 同条口径）——★ **本期不做整体上限、不做分片**（你已裁）。

---

## 5. 原样命令 ＋ 退出码

| 命令 | 读数 | 退出码 |
|---|---|---|
| `node tests/vmu-pack-defaults-named.test.mjs` | **`36 passed, 0 failed`**（新增 G1–G4） | **0** |
| `node tests/vmu-host.test.mjs` | `107 passed, 0 failed` | **0** |
| `node tests/vmu-host-hooks.test.mjs` | `22 passed, 0 failed` | **0** |
| `node tests/vmu-entry.test.mjs` | `150 passed, 0 failed` | **0** |
| `node tests/audit-status-report-fields.mjs` | `19 passed, 0 failed` | **0** |
| `node tests/audit-enforced-consistency.test.mjs` | `358 passed, 0 failed` | **0** |
| `node tests/vmu-packs-active-switch.test.mjs` | `24 passed, 0 failed` | **0** |
| `node D:\_tmp\vmu-pack31\isolated-counterexample.mjs` | CONTROL（副本）**36/0** ⇒ 副本变异 **35/1（G1）** ⇒ ★ **真树 hash 前后相同** | 0 |

★ **改动面＝`vibe-math-vmu.js` ＋ `host.js` ＋ 既有测试文件 `tests/vmu-pack-defaults-named.test.mjs`**（**未新增文件 ⇒ 计数不增**；`package.json` 未改）。★ **未碰** `settings/schema.js`／`kernel/**`（comms2 本轮范围）／`docs/**`（assistant2 范围）。

---

## 6. 交回 Lead／`vmu-verify2`

1. **① 已落**：反例器**副本制**，真树只读，**hash 判据**给出（§1）；**CAS 止血已不需要**（保留在旧脚本里仅作历史）。
2. **③ 已落**：`out.promptSection` 进回执（同型 seam），断言 G1 ＋ **当天反例 35/1 红**。
3. **④ 已核到（无需改码）＋ 路径更正**：正确路径 **`status().settings.*`**；★ **我自陈第 3 次路径错误**（顶层 vs `settings` 子对象），并**未**改 comms2 的文件。断言 G2–G4（G3 用真实非空数据作前置）。
4. **② 未落，具名 ＋ 设计已给**（§4）：序列化点 `host.js:940`、具名常量、`truncated:true`／`elided:[{from,to,bytes}]`／`hostElision:'possible'`，超限反例必红；**宿主事后省略记宿主边界、不声称能消除**。
5. **边界**：`meetings.js` 未碰；`package.json` 未改；未自造公开码；报告路径按任务＝`_handoff/vmu/pack-round31-report.md`。

# Round 25 · vmu-pack（`task-138`）交付报告 —— 回执可见性 ＋ 状态一致性 ＋ `ready()` 等装载落定

> 任务：`task-138`（**转派自我**：原 owner `vmu-core2` 预算用尽、**一个字未写**，但把插入点落到行并新发现一处洞）。★ 本报告是**我的**记录；**core2 的 `_handoff/vmu/core-round25-report.md` 原样保留**（它记的是"未落 ＋ 新发现的洞 ＋ 逐行落法"）—— 按 Lead 采纳的措辞：本仓惯例是**报告由作者保留**。
> 纪律：**原子编辑**＋每步跑**加载内核**的套件；`loader.js`／`pack.js` **本轮我未动**（仍跑了 `audit-enforced-consistency`）；`kernel/meetings.js` **未碰**（`git diff --numstat` 无输出 ✓）；**未自造公开码**（复用 `VMU_MIDDLEWARE_FAILED`／`VMU_ENGINE_UNAVAILABLE`）；未跑全量／`regen-all`／git 写；临时文件 `D:\_tmp`；新文件当场双登记 ✓。
> **读的是哪一版**：起点 HEAD = **`cfbd2c7c7108eb4b0902890a7a12c0a2c87eb49f`**，工作树干净。★ **core2 给的行号已漂**：`host.js:839` 实为 **`:845`**（`createHostAdapter` 签名）；`vibe-math-vmu.js:775-780` 是**注释块**、真正的落点在 **`:796-808`**（`packsWanted`／`packRequested`／`appliedPacks`／`packErrors`／`const run = (async () => {`）。**我按实际读到的行改，未照抄。**

---

## 0. 结论速览

| 项 | 结论 |
|---|---|
| **★ core2 §1 的洞** | ✅ 已修：`mergeReport.packs` 从**部署表**改为**有效请求表**（＋`packSources` 记来源）⇒ 设置面装载成功时回执**不再**显示 `packs: []` |
| **① 回执可见性** | ✅ **三处同一次落**（入口 seam ＋ `host.js` 两个签名＋透传 ＋ 消费点）⇒ `vibe-math-vmu.js` 那句 "**see host.js**" **从假变真**（`host.js` 命中数 **0 → 8**） |
| **② 状态一致性** | ✅ 同一个回执块给出 **`applied:false` ＋ `errors[{id,code,message}]`**（被拒时）⇒ 不必把两份视图对起来猜；**kernel 之前那条 DATA 折入有意未动** ✓ |
| **③ 常驻断言** | ✅ 新文件 `tests/vmu-packs-active-switch.test.mjs` **24/0**，四臂齐 ＋ ★ **含"先等装载落定"这条前提本身** |
| **④ 文档** | ✅ `docs/10:436` 重写 ＋ `docs/29` 的 **R21"设置键不装载"过期块已更正**（保留原文对照） |
| **⑤ `ready()` 等落定** | ✅ `packsInstall` 并入 `Promise.all` ＋ 状态披露 **`packsLoading`**；★ 时序变化逐条具名（§5） |
| **★ 一处对指令的**具名偏离** | `host.js` 的落点用 **`out.packReport`**，**不是** `out.packs` —— 见 §3（`kernel.status()` **已经拥有** `packs` 且它是**有文档的**字段） |
| **★ 我自己的一条红（门禁抓到）** | D4 里 `pr.errors && pr.errors.every(…)` 是**空过形状**（`[].every` 恒真）⇒ 已按"同一表达式内非空前置"修 ⇒ `RULE E` 回 `67=67` |
| **门禁** | ✅ 除 **`regen-all --check`**（见 §9，**Lead 轮末重生成**）外**全绿** |

---

## 1. ★ core2 §1 的洞 ＋ ② 状态一致性（**同一处可读**）

**洞**：`mergeReport`（状态面 `settingsMerge`）报的是 `wantedPackIds`（**只来自 `config.packs`**）⇒ 由**设置键** `vmu.packs.active` 装载的包，**总线 7 条真在**，而回执仍可能 `packs: []` —— ★ 与 R23 **方向相反**（那次"设置说装了、其实被拒"；这次"真的装了、回执说没装"），**同一类：两份视图可以互相矛盾**。

**修法**（`vibe-math-vmu.js` 的 `mergeReport`）：报**有效表 ＋ 来源 ＋ 成败 ＋ 原因**四件事同地：

| 字段 | 含义 |
|---|---|
| `packs` | **有效请求表**（`config.packs` ∪ `vmu.packs.active`，去重）——不是部署表 |
| `packSources` | `[{id, via}]`，`via ∈ {config.packs, vmu.packs.active}` ⇒ **来源可辨** |
| `applied` | 布尔：**是否全部装上**（被拒 ⇒ `false`） |
| `appliedPacks` | 真正应用的 id 列表（★ 与 `packs` 的 id **可能不同名**：请求 `v5r` ⇒ 应用 `v5r-core`） |
| `errors` | `[{id, code, message}]`（被拒的**具名**原因） |
| `loading` | 装载是否仍在飞 |

★ **DATA 折入有意未动**（`packs/<id>/settings/defaults.json` 在建内核前折入、与 `apply()` 成败无关）—— 正因如此，**回执必须同时给出 `applied:false`**，否则那一半仍会被读成"已合并" ✓。

**实测（`D:\_tmp\vmu-pack14\r25-receipt.mjs`，走**真**状态工具）**：

| 臂 | 读数 |
|---|---|
| 设置键 `vmu.packs.active:['v5r']` | `packReport = {requested:[{id:v5r, via:'vmu.packs.active'}], applied:['v5r-core'], errors:[], loading:false, ok:true}`；`settingsMerge.packs = ["v5r"]`（**修前是 `[]`**）；`packSources=[{id:v5r, via:'vmu.packs.active'}]`；★ **`bus.entries = 7`** ✓ |
| **无 `root`** | `ok:false, applied:[], errors:[{id:v5r, code:'VMU_ENGINE_UNAVAILABLE', message:'this kernel has no library root'}]`；`settingsMerge.applied === false` ✓ |
| 什么都不声明 | `{requested:[],applied:[],errors:[],loading:false,ok:true}` ⇒ **零机制保持安静**（不制造错误）✓ |
| `config.packs:['v5r']` 路线 | `requested via:'config.packs'`、`applied:['v5r-core']`、**`bus.entries = 7`** ⇒ ★ **与设置路线读数一致（7＝7）** ✓ |

★ **两条独立视图互相印证**（比"合成一个"更强）：`packReport.applied`（入口侧）**⊆** `kernel.status().packs`（内核侧，ROUND 240 有文档）⇒ 断言 B7 直接交叉核对。

---

## 2. ① 回执可见性 —— **三处同一次落**（这才是那句话从假变真的原因）

| 落点 | 改动 |
|---|---|
| `vibe-math-vmu.js`（adapter 参数，`:530` 一带） | 新增 `packReport: () => ({requested, applied, errors, loading, ok})`（★ **函数晚绑定**，与既有 `packLoader: () => packLoaderRef` 同型） |
| `host.js:388`（`toolSpecs` 签名）／`:845`（`createHostAdapter` 签名） | 各加 `packReport = null` |
| `host.js:869`（`createHostAdapter` → `toolSpecs` 透传） | 加 `packReport` |
| `host.js:441` 之后（状态工具的 `out`） | `if (typeof packReport === 'function') { try { out.packReport = packReport() } catch { …, code: 'VMU_MIDDLEWARE_FAILED' } }` |

★ **`host.js` 的命中数 0 → 8** ⇒ `vibe-math-vmu.js:790` 那句注释（"…which the status face now carries (**see host.js**)"）**现在是事实** ✓（★ 在它落地之前，任何"回执携带 `packErrors`"的说法都不能引用 —— 与 core2 §4 的交接口径一致）。
★ **`packReport` 晚绑定是安全的**（我核过：`mergeReport`／`packReport` 只在 **工具调用** 时被调用，`host.js:441`；不在 `apply()` 期间）；★ 且我把 `packsInstall`／`packsLoading` **声明在 adapter 之前** ⇒ 连"今天的调用时序恰好晚"这个隐含前提都不再需要（否则晚绑定的箭头一旦提前调用就是 TDZ `ReferenceError`）。

---

## 3. ★★ 一处**对指令的具名偏离**：落点是 `out.packReport`，**不是** `out.packs`

**指令原文**（Lead／core2 一致）："`host.js:431` 之后 `if (typeof packReport === 'function') out.packs = packReport()`"。

**为什么不能照做**：`out` 来自 `Object.assign({ ok: true, instance }, kernel.status())`，而 **`kernel.status()` 已经返回 `packs`**（`kernel/index.js:2157`），并且它**是有文档、有历史的字段**：

> `kernel/index.js:2153` 的注释：**"`packs` must reflect what is ACTUALLY applied - including packs applied through the pack loader, which records itself in the notes; a status that only tracks usePack() would under-report."** ＋ **ROUND 240**：卸载过的包不得继续列出。

⇒ ★ **`out.packs = packReport()` 会把"内核侧的已应用包列表"替换成一个 `{requested, applied, errors}` 对象** ⇒ **静默改写一个有文档的内核字段**，正是本任务要消灭的那一类（"声明与实现不一致／语义被静默换掉"）。
**我的落法**：内核的 `packs` **原样保留**，入口侧报告放在 **`out.packReport`**（新名，全仓无冲突 ✓）。★ 而且这样**更强**：`out.packs`（内核）与 `out.packReport.applied`（入口）是**两条独立视图**，断言 B7 **交叉核对**它们，而不是把两个来源合成一个后无法互相证伪。
★ **`out.packs` 未被我改动**：`git diff` 里 `host.js` 只有我这几处（+19/−3）。

---

## 4. ★ 顺手收掉**第三个视图**（core2 只点了 `mergeReport`）

`handle.packMerge()`（`vibe-math-vmu.js`，出口的入口侧合并视图）**同样**报 `wantedPackIds` ⇒ ★ **只修 `mergeReport` 会造出一对新的、互相矛盾的视图**（正是本缺陷本身）。已一并对齐（同样给出 `packs`／`packSources`／`appliedPacks`／`errors`／`loading`）。
**实测**：设置键路线下 `handle.packMerge().packs = ["v5r"]` ✓（修前会是 `[]`）。

---

## 5. ⑤ `ready()` 等装载落定 ＋ `packsLoading` —— ★ 时序变化**逐条具名**

**改法**：`:808` 的 `const run = (async () => {…})()` 被**捕获**为 `packsInstall`，并**并入** `ready()` 的 `Promise.all`（作为**第 6 个元素**，故原有解构 `([, , st])` 不受影响）；状态面披露 **`packsLoading: true/false`**（＋ `packReport.loading`，不 await 的调用者也看得见）。
★ **`packsInstall` 被刻意做成不 reject**：`.catch(e => packErrors.push({id:'(packs)', …已登记码…}))` ＋ `.finally(() => packsLoading = false)` ⇒ **`ready()` 不会因为某个 pack 被拒而 reject**（拒绝属于**回执**，不属于"就绪"），且 `packsLoading` **不可能卡在 true**。

**时序变化逐条**：

| # | 变化 | 影响与证据 |
|---|---|---|
| 1 | **`ready()` 现在会把装载任务一并 await**（此前只 await `[started, opened, adapter.status(), idsHydrated, resumed]`） | ★ 语义变化：调用者在 `await ready()` 之后读到的是**已落定**的 `packErrors`／`appliedPacks`；**此前是竞态**（core2 的 C 臂首跑就撞到"`packErrors` 为空"）。⇒ **不是"更慢"，是"更真"** |
| 2 | 装载**被拒**不再可能让 `ready()` reject | 由 `.catch` 保证；拒绝仍**具名**出现在 `packErrors`／回执里 |
| 3 | 新增状态字段 `packsLoading`（**加字段**，不是改字段） | 不 await 的调用者可区分"空是因为没人拒绝"与"空是因为还没跑" |
| 4 | 逐套件复跑（**全部与改动前同读数**） | `vmu-entry` **150/0**、`vmu-host` **107/0**、`vmu-host-hooks` **22/0**、`vmu-pack` **53/0**、`vmu-kernel` **175/0**、`audit-enforced-consistency` **358/0** ⇒ ★ **没有任何既有套件依赖"ready 不等装载"**（我逐条跑过，未发现依赖者） |

---

## 6. ③ 断言（`tests/vmu-packs-active-switch.test.mjs`，**24/0**）与可证伪

| 组 | 断言 |
|---|---|
| **A 落定前提** | A1 `ready()` 后 `packsLoading === false`；A2 回执 `loading:false`；★ A3 **非空前提**（真的有一个请求要落定，否则 A1/A2 会因"什么都没发生"而通过） |
| **B 臂①（设置键）** | B1 来源 `via:'vmu.packs.active'`；B2 真应用；B3 无拒绝；★ **B4 `bus` 真有条目**（不是只看 `settingsMerge`）；★ **B5 `settingsMerge.packs` 含 `v5r`**（core2 的洞）；B6 来源随行；★ **B7 与 `kernel.status().packs` 交叉核对** |
| **C 臂②（反向）** | C1/C2 什么都没声明 ⇒ 空且**不报错**；C3 合并视图同样空 |
| **D 臂③（无 `root`）** | D1 `ok:false` ＋ `errors[]`；D2 码 `VMU_ENGINE_UNAVAILABLE` ＋ 原因可执行；★ **D3 `settingsMerge.applied === false`**（同一对象里，不能单独读成"已合并"）；D4 每条错误**点名哪个包** |
| **E 臂④（两条路线一致）** | E1 应用列表相同；★ **E2 `bus` 条目数相同且非零**；E3 合并视图相同；★ **E4 但来源必须不同**（否则回执分不清两条路） |
| **F 声明/实现配对** | ★ **F1 状态回执确实携带 `packReport`**（把那句 "(see host.js)" 钉住）；F2 三个字段都在 |

★ **可证伪（`D:\_tmp\vmu-pack14\falsify-r25.mjs`，逐字节复原）**：

| 复原 | 读数 |
|---|---|
| **M1** `mergeReport.packs` 退回 `wantedPackIds` | **22/2 红**：★ **B5**（设置路线下行回执 `[]`）＋ **E3**（两路线合并视图不一致 `{"settings":[],"config":["v5r"]}`） |
| **M2** `host.js` 不再并回执（假声明复原） | **10/14 红**：全部回执臂（A2/A3/B1/B2…）⇒ `packReport` 缺失 |
| **M3** `ready()` 不再等装载 | **21/3 红**：★ **D1/D2/D3** 失败，详情正是**竞态**（`{"applied":[],"errors":[],"loading":…}` ＝还没落定）⇒ **落定前提本身被测到了** |
| 三次复原后 | `vibe-math-vmu.js`／`host.js` **md5 与基线逐字节相同**；测试回 **24/0** |

---

## 7. ④ 文档（含一处**过期块**的更正）

- **`docs/10:436`** 重写为：**① `config.packs`＝部署期声明**／**② `vmu.packs.active`＝真开关（推荐日常调控）**；**同一包两处声明 ⇒ 只装一次、来源记 `config.packs`**；**设置只能加不能减**；★ **`config.root` 必需性**（缺 ⇒ 具名拒、一条 middleware/rule 都进不了总线）；★★ **判据**："真的装上了"**不能只看 `settingsMerge`**（它含 DATA 折入那一半，**有意保留**），要看 `bus.entries`／`hooks` ＋ 回执的 `packReport`／`packSources`／`applied`。
- **`docs/29`**：★ 该卷的 **R21 更正块写着"① 设置键 `vmu.packs.active` ＝ 不装载"** —— 这条**已被轮 24 的改动作废**（轮 24 把它做成**同一条装载路上的真开关**），我今天**实测它真的装**（`bus.entries = 7`、`applied:['v5r-core']`）。⇒ 已**就地更正**（保留"~~不装载~~"＋"该读数在轮 24 已过时"的对照），并新增 **R25 更正**两条：**(一)** 路线①作废／**(二)** "回执可与事实相反"已被两处修好（但**DATA 折入仍在、判据不变**）。

---

## 8. ★ 我自己在本轮踩到的两条（都记下来）

| # | 事实 | 处置 |
|---|---|---|
| 1 | ★ **探针通道错**：vmu 工具的 **`execute()` 返回的是 JSON 字符串**，不是对象 —— `Object.keys()` 于是返回**字符下标**（我一度打出一大串数字），`st.packReport` 读成 `undefined` ⇒ **看起来完全像"回执是空的"**。 | 改为 `JSON.parse`；并在新测试文件顶部写明这条（`★ execute() 返回 JSON 字符串`）⇒ 下一个人不必再踩 |
| 2 | ★ **空过断言**（门禁抓到）：D4 写成 `pr.errors && pr.errors.every(…)` —— `[].every` **恒真** ⇒ 该断言**无法失败**。 | 改为**同一表达式内**非空前置 `pr.errors.length > 0 && …` ⇒ `RULE E` 回 `current=67 baseline=67` ✓。★ 与我在 R20／R21 那两条是同一族：**"看起来守住了、其实可以空转"** |

---

## 9. 原样命令 ＋ 退出码（同一次最终扫）

| 命令 | 读数 | 退出码 |
|---|---|---|
| `node tests/vmu-packs-active-switch.test.mjs` | **`24 passed, 0 failed`** | **0** |
| `node D:\_tmp\vmu-pack14\r25-receipt.mjs` | 四臂读数（§1 表） | 0 |
| `node D:\_tmp\vmu-pack14\falsify-r25.mjs` | M1 ⇒ 22/2、M2 ⇒ 10/14、M3 ⇒ 21/3；复原 md5 相同 | 0 |
| `node tests/audit-enforced-consistency.test.mjs` | `358 passed, 0 failed` | **0** |
| `node tests/vmu-pack.test.mjs` | `53 passed, 0 failed` | **0** |
| `node tests/vmu-kernel.test.mjs` | `175 passed, 0 failed` | **0** |
| `node tests/vmu-entry.test.mjs` | `150 passed, 0 failed`（★ 时序变化后仍同读数） | **0** |
| `node tests/vmu-host.test.mjs` | `107 passed, 0 failed` | **0** |
| `node tests/vmu-host-hooks.test.mjs` | `22 passed, 0 failed` | **0** |
| `node tests/vmu-pack-plan-rule-validate.test.mjs` | `35 passed, 0 failed` | **0** |
| `node tests/vmu-pack-inline-manifest.test.mjs` | `35 passed, 0 failed` | **0** |
| `node tests/vmu-pack-tool-actions.test.mjs` | `17 passed, 0 failed`（core2 的） | **0** |
| `node tests/audit-package-membership.mjs` | `29 passed, 0 failed`（新测试已双登记） | **0** |
| `node tests/audit-vmu-docs.test.mjs` | `99 passed, 0 failed` | **0** |
| `node tests/audit-doc-index.test.mjs` | `5 passed, 0 failed` | **0** |
| `node tests/audit-verbatim-claims.test.mjs` | `3 passed, 0 failed` | **0** |
| `node scripts/check-docs.mjs` | `DOC LINT: PASS` | **0** |
| `node tests/audit-declaration-criterion.test.mjs` | ★ **`87 passed, 1 failed`** —— 失败是 **`regen-all --check`**（**见下**）；`RULE E fingerprints: current=67 baseline=67` ✓ | 1 |

★ **那唯一一条红的来历（记在我账上、归 Lead 处置）**：我把新测试**登记进 `package.json#files`** ⇒ `tests/*.mjs` 的 shipped 计数 **+1** ⇒ `update-doc-counts`／`regen-all --check` 所依赖的生成行**过期**。⇒ **需 Lead 在轮末重生成**（与 R20 同一情形）。**不是代码缺陷**，且**不能靠不登记来回避**（新文件必须当场双登记）。

---

## 10. 交回 Lead／`vmu-verify2`

1. **五件全部落地**（① 三处同一次落 ⇒ 那句 "see host.js" 从假变真；② 同一处可读；③ 24/0 可证伪；④ 两卷文档；⑤ `ready()` 等落定 ＋ `packsLoading`），**core2 §1 的洞一并收**。
2. **★ 一处具名偏离（请确认）**：`out.packReport` **不是** `out.packs` —— `kernel.status()` **已拥有** `packs` 且其含义**有文档、有 ROUND 240 的修复史**；改写它等于**静默换掉内核字段的语义**。★ 保留两条独立视图并**交叉核对**（B7）比合成一个更强。
3. **★ 顺手收掉第三视图**：`handle.packMerge()` 同报部署表 —— **只修 `mergeReport` 会造出一对新的矛盾视图**；已一并对齐。
4. **★ 轮末请重生成**：`regen-all --check` 因我新登记一个测试文件而红（`tests/*.mjs` 计数 +1）—— `update-doc-counts` 的重写处（实测 `:81-87`）＝`vibe-math-vmu/docs/11`（`v11Shipped`／`v11Scoped`）、`README.md`、`README.en.md`、`docs/test-timing.md`、`docs/AUDIT-CHECKLIST.md`，按既有管道即可。
5. **★ 文档更正提示**：`docs/29` 的 **R21"设置键不装载"** 是**过期块**（轮 24 已作废，今天实测真装载）⇒ 我已就地更正并保留对照；★ 若 `vmu-verify2`／`vmu-assistant2` 的复核以该块为依据，请以**更正后**的口径为准。
6. **边界／未做**：未跑真 DSH 会话（本任务全部在真实装配层验证，未声称真机结论）；`docs/05`／`docs/21` 的改动是 **comms2（task-139）** 的，我**未碰**；`loader.js`／`pack.js` **本轮未改**（仍跑了 `audit-enforced-consistency` 作为装载块回归）。

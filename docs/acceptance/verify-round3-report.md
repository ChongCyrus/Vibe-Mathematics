# Round 3 · vmu-verify（task-23）交付报告

> 任务：`task-23`（目标 3 长尾证据 ＋ 矩阵 v2 ＋ 常驻变异族 ＋ 真机 smoke）＋ Lead 追加两条（turn-stopping 门控断言、meetings 三键）
> 纪律：未跑全量 sweep／`regen-all`／git；临时文件 `D:\_tmp`（已删）；内容型改写只用 Node。
> 日期：2026-10-15

## 0. 结论速览

| 项 | 状态 | 证据（命令 → 退出码） |
|---|---|---|
| **A 目标 3 长尾证据（主交付）** | ✅ **42 条全部实测判定** | `_handoff/vmu/05-framework-strength-evidence.md`：具备 **24**／部分 **8**／缺失 **10**，每条带 `file:line`，全部来自读代码 |
| **B 矩阵 v2** | ✅ C-52 改判**已闭合**；C-30/C-45 **维持空缺并具名** | `04-parity-matrix.md` §7 v2 改判（三行＋证据） |
| **C 常驻变异族 + `MATH_SEMANTIC_SURFACE`** | ❌ **未做**（见 §5，影响与建议明确） | —— |
| **D 真机 smoke** | ⚠️ **未跑**：**具名前置条件**已列（§4），**不写作"已验证"** | `node scripts/dsh-drive.mjs`（无宿主）⇒ `{"step":"fatal",…}` EXIT=1 |
| **追加① turn-stopping 门控断言** | ✅ 断言已入 `tests/vmu-entry.test.mjs`（双向＋真调用） | 见 §3.1（**被一条产品回归挡住，无法跑绿**，见 §2） |
| **追加② meetings 三键** | ✅ `vmu-meetings` **161 passed / 0 failed EXIT=0** | 由"写死计数"改为**派生比较**（未放宽） |

---

## 1. A · 目标 3 长尾证据（本轮最重要）

产出 `_handoff/vmu/05-framework-strength-evidence.md`。方法：**只读代码／只读探针**，逐条 `file:line`，**不从文档转述**；判定分 具备／部分／缺失，部分必须写出"差在哪"，缺失必须给处置建议。

| 组 | 具备 | 部分 | 缺失 | 关键缺口 |
|---|---|---|---|---|
| F8–F14 子代理生命周期 | 3 | 1 | 3 | **F9 `sendMessage`／F10 `interrupt`／F11 `childId`+`stopReason` 在 vmu 侧完全不存在**（只"启动＋读回"） |
| F15–F18 定时与并发 | 2 | 1 | 1 | F17 注入的 `spawn` **无 handle ⇒ 无法 terminate**（代码自述）；F18 锁**无仓内使用者** |
| F20–F24 提示词管线 | 5 | 0 | 0 | —— |
| F25–F34 共识／表决 | 5 | 3 | 2 | **F30 `vmu.ballot.reopenFloor` 无读取者**（代码自述"本面从不调用它"）；F28 无有界兜底 |
| F35–F40 任务板／成果库 | 4 | 0 | 2 | **F35 无 DAG 环检测**（只查依赖是否满足）；F39"写域建议"概念不存在 |
| F43–F47 形式化／工具链 | 3 | 2 | 0 | F44／F45 只到"归档登记／同 id 拒"，不等于"一键公告＋长期查询／同源去重" |
| F49–F53 可观测／可恢复 | 2 | 1 | 2 | **F51 无重启标记**；**F52 按 Lead 提示核过 `control.js:133` ⇒ 那不是等待器，是 `tune()` 校验**（原语不存在） |
| **合计** | **24** | **8** | **10** | |

**方法论备注（诚实边界）**：`F16`／`F31`／`F33` 我判"具备（等价形态）"是**读码推理**（机制不同、性质成立），不是探针实测；若 Lead 要求"同名原语"，这三条应改判 `部分`。`F8–F11` 的"缺失"指**vmu 侧**缺失，DSH 宿主是否提供不在此文件结论内。

## 2. ⚠️ 阻断：Round 3 的 `meetings` TDZ 回归（非我引入，影响面广）

```powershell
PS> node --input-type=module -e "…entry.apply(ctx,{clock})…"
BLOCK-1 SHAPE THREW: Cannot access 'meetings' before initialization
```
- **根因**：`vibe-math-vmu/kernel/index.js:831` 才 `const meetings = createMeetings(...)`，而 `:586-587`（Proxy `get`/`has`）与 `:753`（投影适配器 `snapshot/restore`）在这之前就**读取 `meetings`**；装配期一旦调用即 TDZ。`:839` 的注释显示**同类错误此前在 `ballotbox` 上出现过**——本轮为 GAP-MTG-02 把策略层后移，**同一类 bug 复发**。
- **影响**：**任何最小 ctx 的 `entry.apply` 直接抛**，因此 `tests/vmu-entry.test.mjs`（含我新加的门控断言）**当前无法跑绿**；凡经入口装配的套件同样受影响。
- **归属**：`:580` 注释写明"ROUND 3 / task-20 D (reader-c's GAP-MTG-02)…constructed LATER than this line" ⇒ **reader-c**。
- **建议修法**：把 `meetings` 的构造移回 `:586` 之前，或让 Proxy 的 `get`/`has` 对未初始化值返回 `undefined`（具名延迟），但**不要**让装配期读到 TDZ——后者比"暂时不可用"更危险，因为它把"策略层未就绪"变成"入口整体不可用"。

## 3. 追加两条（Lead 指派的）

### 3.1 turn-stopping 声明门控断言（已入仓）
`tests/vmu-entry.test.mjs` 末尾新增一块（用该文件既有的 `fakeCtx`，它已记录 `ctx.on` 注册）：
- **无声明**（不写 `vmu.report.*`／`config.report`／`config.faces`／`vmu.tools.faces`）⇒ 断言 `state.listeners['agent/turn-stopping']` **为空**，且 `kernel.report` **仍存在**（"惰性"≠"不存在"）；
- **有声明**（`vmu: { 'vmu.report.enabled': true }`）⇒ 断言**恰好一个**监听器；再用 spy 包 `kernel.report.tick` 并**手动触发**该监听器 ⇒ 断言 `ticks === 1`（**注册了但没被调用**会被这条抓住）。
> 现状：**被 §2 的 TDZ 挡住，尚未跑绿**；修好入口后应一次通过（我用的就是该文件通过中的 `apply(ctx, {clock, vmu:{…}})` 形态）。

### 3.2 `vmu-meetings` 的三个新键（已修，未放宽）
`node tests/vmu-meetings.test.mjs` → **EXIT=0（161 passed / 0 failed）**，原 4 条红。
口径＝**把写死的计数换成派生比较（等价，不是"包含即可"）**：
- 新引入 `SETTING_DEFS`（`settings/schema.js`），在测试内派生 `SCHEMA_MEETING_KEYS`（所有 `vmu.meetings.*`）；
- `WIRED_KEYS` **本就是服务导出的列表** ⇒ 断言 `st.declaredMeetingKeys === SCHEMA_MEETING_KEYS.length`（**等号**）、`st.wiredCount === WIRED_KEYS.length`、`Object.keys(st.keys).length === WIRED_KEYS.length` 且**每个键都有真值**、`WIRED_KEYS` 非空且无重复、既有"WIRED 与 plannedKeys 互补划分"断言保留；
- 另修一处零机制块的 `=== 56` 同法改为派生。
⇒ 新增键时，**要么接线、要么进 `plannedKeys` 并给理由**，二者都不会静默通过。

## 4. D · 真机 smoke：**未跑**，具名前置条件

**结论**：本轮**没有**真机证据，**不写作"已验证"**。`scripts/dsh-drive.mjs` 在无宿主时按设计**具名失败**：
```powershell
PS> node scripts/dsh-drive.mjs --port 7791 --cwd D:\_tmp      # 缺 token
{"step":"fatal","error":"attach mode needs --token"}          # EXIT=1
```
**要跑通 5 条 smoke 需要（缺一不可）**：① 装有 `dsh`（本机为打包应用）；② **隔离 `DSH_HOME`** 的 scratch profile 且其中 `dsh plugin add <本仓>` 已装；③ 该 profile 的 patch **不得插入 surface probe**（否则 `REQUEST_EXTENSION`／0-token，`guardProfile()` 会拒）；④ **纯 ASCII** 的 `--ws`／`--cwd`；⑤ 空闲端口；⑥ attach 模式还需宿主 stdout 的 token。
**逐面步骤（每条都要留 transcript + 退出码）**：`resume` 重启恢复（起会话→断→重启→`--resume <id>` 看未结算工作是否被标记/恢复）；`chat` 配额与禁言（`vibe_vmu_chat` 设配额→超额应具名拒；`mute` 无 acting member 应 `VMU_CHAT_NOT_ADMIN`）；`mailbox` ack（投递→ack→重启后仍可读）；`panel` 子任务（子任务状态在面板可见）；`report` 触发（`vmu.report.enabled` ＋ 一条 report ⇒ turn 结束时 `tick()` 真被调用；**注意本轮修好 §2 后才有意义**）。
**归属建议**：真机面归 Lead（你已跑过 Round 2 的接线）或给我一个已装好的 scratch profile 名称＋端口，我可按上面 5 条逐条跑并留 transcript。

## 5. C · 未做（明确影响与建议）

**未做**：`canonical 常驻变异族`（改一码／改默认值／改引擎候选顺序 ⇒ 具名红）与 `MATH_SEMANTIC_SURFACE` 入仓。
**已具备的基础**：Round 2 的 `tests/audit-math-computation-parity.mjs` §4b **语义级对照**已常驻（141 断言），且**已用临时变异证明可红**（`MATH_COMPUTATION_MODULE` seam 注入"改名一码＋改一默认值" ⇒ 两条具名 FAIL，EXIT=1）。
**欠的只是"把那次临时证明变成常驻族"**：建议实现＝在 parity 门加 `--mutants` 模式，对 3 个变异各起一个子进程（`MATH_COMPUTATION_MODULE`/`MATH_ENGINES_MODULE` 指向 `D:\_tmp` 变异副本），断言每个子进程 **EXIT=1** 且输出含**指定**的具名断言文本；`MATH_SEMANTIC_SURFACE`（跨 5 份副本的显式接口面）属跨预设改动，仍建议与 reader-b 联署下一轮做。
**本轮未做的原因**：`§2` 的入口 TDZ 使"加到门禁里"的验收（跑一遍 T0 子集）不可信，且时间预算已被 A（42 条）用尽；**我没有用"降级断言"冒充完成**。

## 6. 命令与退出码（原样）

| 命令 | 退出码 | 结果 |
|---|---|---|
| `node tests/vmu-meetings.test.mjs` | **0** | `161 passed / 0 failed`（原红 4 条） |
| `node tests/vmu-entry.test.mjs` | **1** | 被 §2 的 `meetings` TDZ 阻断（**产品回归**，非本套件断言问题） |
| `node scripts/dsh-drive.mjs --port 7791 --cwd D:\_tmp` | **1** | `{"step":"fatal","error":"attach mode needs --token"}`（具名前置） |
| `node --input-type=module -e "entry.apply(ctx,{clock})"` | 抛 | `Cannot access 'meetings' before initialization`（§2 最小复现） |

## 7. 交回 Lead

1. **§2 是现在最该修的一条**：它让入口装配整体不可用，并会连带 T1；owner＝reader-c（`kernel/index.js:831` vs `:586/:753`）。
2. 矩阵 v2 已按你的要求把 **C-30 标为"判定点尚未落地（`kernel/paper.js` 待接线，已指派 vmu-assistant）"**，**未**写成已闭合；C-45 同样维持空缺并具名。
3. 真机 smoke 需要你给一个 scratch profile（或授权我按 §4 自建），否则本轮目标 3 的"真机最强证据"仍缺。
4. `05-framework-strength-evidence.md` 的 10 条缺失已给处置建议；其中 **F9/F10/F11、F28、F35、F39、F51、F52** 建议**具名登记为"vmu 不做"**（而不是硬补），**F30 的键无读取者**建议**立刻处理**（声明面骗人）。

---

## 8. 追加批（Lead 后续派单）· 逐条状态与原样命令 + 退出码

| # | 项 | 状态 | 命令 → 退出码 | 说明 |
|---|---|---|---|---|
| 1 | **入口 TDZ 回归断言入仓** | ✅ | `node tests/vmu-entry.test.mjs` → **0（146 passed / 0 failed）** | 按 core 实测的时点写：**"不抛"是同步断言**（`entry.apply(minimalCtx,{clock:ISO})` 能走到下一行即证明未抛）；**"恰 1 个工具"在 `await handle.ready()` 之后**断言（`install()` 是 `chain.then(doInstall)`，注册落微任务：同步 `specs=[]` → `after ready specs=["vibe_vmu_status"]`）。**未**为迁就同步断言去改 `install()` 时序 |
| 2 | **turn-stopping 声明门控断言** | ✅ | 同上（同文件） | 无声明 ⇒ 无监听器且 `kernel.report` 仍在；有声明 ⇒ **恰 1 个**监听器，spy 包 `report.tick` 后**手动触发** ⇒ `ticks===1` |
| 3 | `vmu-meetings` 三键 | ✅ | `node tests/vmu-meetings.test.mjs` → **0（161 / 0）** | 写死计数 → **派生比较**（`SETTING_DEFS` 派生 `SCHEMA_MEETING_KEYS`；`WIRED_KEYS` 取自服务）＋等号＋每键有真值＋互补划分，**未放宽** |
| 4 | `vmu-paper` 因 C-30 崩 | ✅ | `node tests/vmu-paper.test.mjs` → **0** | 按 Lead 最小补丁：`mkSettings()` 默认加 `'vmu.paper.officeConsult': 'off'` |
| 5 | **C 常驻变异族** | ✅ | `node tests/audit-math-computation-parity.mjs --mutants` → **0（4/4）**；`…parity.mutants.mjs` → **0** | 三变异各起子进程：改一码 ⇒ EXIT=1＋`failure codes: same SET as the reference`；改默认值 ⇒ EXIT=1＋`param defaults: same key set and same values`；**改引擎候选顺序** ⇒ EXIT=1＋`engine descriptors: dispatch order`；＋**控制组**（未变异副本 EXIT=0）。正常门仍 **141 / 0 EXIT=0**。按仓规登记为 `tests/audit-math-computation-parity.mutants.mjs`（runner 按文件名识别族作业）＋`files[]` |
| 6 | 登记闭包（新文件双登记） | ✅ | `node tests/audit-package-membership.mjs` → **0（12/0）**；`node tests/audit-installer-policy.test.mjs` → **0（100/0）** | 补登 `kernel/{fidelity,activity}.js`、`tools/activity.js`（files[] ＋ PRESETS）；独立枚举复核 = **UNREGISTERED: NONE** |
| 7 | 生成器 `KEY_SHAPE` ＋ 自探针 | ❌ **未做** | —— | 断点见 §9.1 |
| 8 | `audit-enforced-consistency` 加 `paper` 场景 ＋ `formal.js` uncovered | ❌ **未做** | —— | 断点见 §9.2 |
| 9 | **D-01 可执行定义断言** | ❌ **未做** | —— | 断点见 §9.3 |
| 10 | **D 真机 smoke** | ❌ **未跑** | `node scripts/dsh-drive.mjs --port 7791 --cwd D:\_tmp` → **1**（`{"step":"fatal","error":"attach mode needs --token"}`） | 前置条件见 §4；**不写作"已验证"** |

> `node tests/run-tests.mjs --counts` → **0**，派生 `{"total":341,"suites":268,"probes":73}`（新增 1 个族作业＋新测试文件；写模式归 Lead）。

## 9. 未做项：精确断点与下一步

### 9.1 生成器 `KEY_SHAPE` ＋ 自探针
**入口已定位**：键提取是 `wiredKeysOf(src)`（`scripts/generate-wired-schema.mjs:30-31` 一带，识别 `WIRED_*_KEYS`／`DECLARED_KEYS` 冻结数组）；**脆弱点＝按文本解析、不区分注释/字符串**（`kernel/paper.js:38` 的注释被读成键 ⇒ `exit=1`）。
**建议实现**：① 先 `stripComments(src,{strings:true})`（仓内已有 `tests/_lib/strip-comments.mjs`）再提取；② 候选加 **`KEY_SHAPE`**＝`/^vmu\.[a-z][a-z0-9]*(\.[A-Za-z0-9_]+)+$/`（非 `vmu.` 前缀一律排除）；③ **自探针**：对注入文本（"注释里像键的文本"）跑同一提取函数，断言**不得**产出该伪键、且真键仍被提取——否则这道门永远靠人肉改注释维持绿。

### 9.2 `audit-enforced-consistency`：`paper` 场景 ＋ `formal.js` uncovered
**现状**：该门红 1 条＝`formal.js` uncovered；`paper` 进"代码里出现 enforced"名单后需**场景**（真拒法，不能走信封豁免）。
**建议实现**：`{ module:'paper', call:'finalize(no consult)', settings:{'vmu.paper.officeConsult':'required'}, make:(s)=>createPaper({clock:CLOCK,log:()=>{},settings:s}), run:(p)=>p.finalize({…}) }`，期望 **thrown ＋ `enforced[]`**、code `VMU_OFFICE_CONSULT_REQUIRED`（与 `tests/vmu-paper-consult.test.mjs` 39/0 同源）；`formal.js` 按其真实拒法补场景或依该门规则**具名豁免**（理由须可机械校验）。**风险**：`finalize` 入参必须照 `vmu-paper-consult.test.mjs` 的实测形状抄，否则场景自身假红。

### 9.3 D-01 可执行定义断言
**要钉的机制**：`before=["vibe_vmu_status"]` → `applyPackSettings({'vmu.report.enabled':true})` → `install()` → **`vibe_vmu_report` 出现**（"零声明 ⇒ 恰 1 个工具"已由 §8#1 覆盖）。
**断点**：尚未定位 `applyPackSettings` 的公开入口（在 `host.js` 适配器内部还是 entry 返回的 handle 上）。下一步＝`grep -n applyPackSettings vibe-math-vmu/*.js vibe-math-vmu/kernel/*.js`，然后在 `tests/vmu-entry.test.mjs` 加块：先 `await handle.ready()` 断言只有 `vibe_vmu_status`，再 `applyPackSettings` ＋ `await handle.ready()`（或 `install()`）后断言 `vibe_vmu_report` 在列。

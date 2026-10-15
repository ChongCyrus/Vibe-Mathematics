# Round 12 · task-95 · 新模块双登记清单（`docs/11 §6.1`）＋ 无写者键结论

- 状态：**A/B 完成**（清单落盘＋两个无写者键给出结论并执行其一）；**C 已发 vmu-verify**（含一条我在生成器里定位到的**真洞**）。
- 纪律：未跑全量、未 `regen-all`、未 git；临时文件 `D:\_tmp\vmu-r12`；结构性编辑原子完成。

## A · `docs/11 §6.1`「拆出一个新模块的清单」（★ 连续两轮同型遗漏后立）

五步表，**每步都写"怎么算做完"＋"门禁抓到什么/抓不到什么"**：
① **`package.json files[]`**（判据＝`audit-package-membership.mjs` 绿 **＋ 正面自查** `require('./package.json').files.includes(…)`）；
② **`installer.js` 的 `PRESETS[].files`**（现清单在 `installer.js:93` 一行内）；
③ **zero-mechanism 矩阵裁定行**（`scripts/generate-zero-mechanism-matrix.mjs`）；③′ **闭集词表**；④ **文件头边界**（三行内：拥有／不拥有／零机制形状）；⑤ **每步跑"加载内核"的套件**（`vmu-kernel` ＋ 本模块套件；拆完再跑 `vmu-entry`）。

**★ 我在生成器里定位到的"只抓一半"洞（这是本轮最有价值的一条）**：
`scripts/generate-zero-mechanism-matrix.mjs` 的 `judge()` **先**判"探针抛出"（`:265` `if (/抛出|import 失败|create 抛出/.test(r.shape)) { probeErrors += 1; continue }`），**后**才判"出现了却没有裁定行 ⇒ 红"（`:270-274`）⇒ **无码抛出**的模块被算成 probe-error **并且不记名**。实测（生成矩阵原文）：
```
| `meetinglapse` · `lapseDue()` | op 抛出 | — | — | （**设计未定** ✗：本模块未登记期望） |
| `meetingleave` · `requestLeave()` | op 抛出 | — | — | （**设计未定** ✗：本模块未登记期望） |
```
而 `node scripts/generate-zero-mechanism-matrix.mjs --check` 仍报 **`0 mismatches, 0 unregistered, 0 EXPECT_UNDECIDED`** ⇒ **R10 拆出的 `meetingleave`（及同样形态的 `meetinglapse`）今天仍是"未裁定"却不红**。另一个门 `tests/audit-package-membership.mjs` 只抓 `tests/*.mutants.mjs` 与"守卫索引引用的测试"，**不扫 `vibe-math-vmu/kernel/*.js`** ⇒ 新内核模块漏登记它也不会红。**两个门禁各抓一半，合起来仍漏** —— 正是清单要写下来的理由。

**③′ 闭集词表（写错＝红）**：`具名拒（带 code）`／`具名拒或 ok`／`ok 或 object`／`ok 或 null`／`array 或 object`／`array`／`ok（显式 absent）`／`按声明默认开成`，或 `PROBE_NEEDS_ARGS`／`EXPECT_UNDECIDED`（显式待办，只计数）／`EXPECT_NA`（非服务模块）。★ 裸 `object` **不在词表** ⇒ `okShape=false` ⇒ mismatch（轮 12 踩过）。

**转出（`scripts/**` 不归我）**：让 `judge()` 把"无裁定行 ⇒ 红"提到抛出跳过**之前**，或先给 `meetingleave`／`meetinglapse` 补 `EXPECT_*` 行（"先登记、再修门"的稳妥路径）。

## B · 两个"有键无写者"的结论（按 §7 走）

| 键 | 结论 | 理由（实测） | 动作 |
|---|---|---|---|
| **`ballots`** | ★ **删除** | `kernel/**` 内**零** `patch('ballots'…)`／`read('ballots'…)`；概念已由 **`ballotbox`**（适配表键＋白名单键）承载 ⇒ 旧名只能让部署依赖**没有写者能产出**的名字 | `kernel/store.js` 的 `PUBLIC_KEYS` 移除该键（附注释：同名字串在别的命名空间——`vmu.control.pauseScope` 作用域名、纪要 `ballots` 字段、v5r fold 台账——**不受影响**）＋ **`docs/03 §7.1` 破坏性变更登记**（日期/理由/迁移三条）＋ `§6.1 族④` 改写 |
| **`records`** | **保留但不接线**（带**撤销条件**） | `kernel/records.js` 是**内存投影**（文件头 `:16`：persistence stays with the library face），全树无写者；但它命名的是**一个真实存在的面**，删除是**第二次破坏性变更**且无收益 | `docs/03 §7.1` 登记"保留＋撤销条件"：**下一次架构复核若仍无写者 ⇒ 按同一流程删除**；`§6.1 族④` 明写"部署仍不要依赖它" |

**迁移验证**：`node D:\_tmp\vmu-r12\dead-key.mjs` ⇒ **TOTAL pass=10 fail=0，exit=0**：
- 白名单：`ballots` 已不在、`ballotbox` 在、`records` 在；
- `read('ballots')`／`patch('ballots',…)` 都**具名拒** `VMU_INVALID_ARGUMENT`（且它们**本来就没有写者**）；`ballotbox`／`records` 可读不受影响；
- ★ **老部署无需改动**：声明旧拼写 `vmu.resume.projections:['ballots']` **仍 attaches `ballotbox`**（`PROJECTION_ALIASES` 具名容忍）并在 `status().projections.viaAlias` 里可见。

## C · 内核侧残余（R11 留的，逐条）

1. `audit-enforced-consistency` 的两行场景 → **verify 已闭**（我复跑 **358/0**）。
2. 矩阵两行"未裁定却不红" → **本轮定位到根因**（A 的洞）并**转出**（`scripts/**`）。
3. `task/assign-objected` 的**受众由中间件决定**、`vmu.prompt.compact*` **无"关"档**：已在前两轮报告具名，性质为设计差异，非缺口。
4. `docs/04` 的 **120 个 declared-but-not-wired** 键：属各面 owner 的排期（`docs/04` 已如实标注），非我这几轮的键。
5. **本轮无新的内核侧未做项**。

## D · 验证（原样命令 ＋ 退出码）

```
node D:\_tmp\vmu-r12\dead-key.mjs                 → TOTAL pass=10 fail=0          exit=0
node tests/vmu-store.test.mjs                     → 27 passed, 0 failed            exit=0
node tests/vmu-kernel.test.mjs                    → 175 passed, 0 failed           exit=0
node tests/vmu-entry.test.mjs                     → 150 passed, 0 failed           exit=0
node tests/audit-vmu-docs.test.mjs                → 84 passed, 0 failed            exit=0
node scripts/check-docs.mjs                       → DOC LINT: PASS                 exit=0
node tests/audit-package-membership.mjs           → 13 passed, 0 failed            exit=0
node scripts/generate-zero-mechanism-matrix.mjs --check → 96 modules, 0 mismatches, 0 unregistered   exit=0
```

## E · 未做／边界
- **未改** `scripts/**`（矩阵门与 membership 门）与 `tests/**`：A 的洞与两行裁定**只能由它们的 owner 落**，我把根因、行号与两种修法都写在 A 里。
- 本轮**未新建文件**（无新双登记项）；`docs/11` 的生成块（zero-mechanism 矩阵标记区）**未触碰**。

## 8. 追加：vmu-pack 报的 task-97 两项（Lead 裁决后由我落）

### 8.1 ③ 动议事件改名（**已落**，且我连登记一起做了）
**缺陷（pack 实测）**：`kernel/governance.js` 用**对象形态 ＋ 点号名**发事件（`emit({type:'motion.propose'})`）⇒ ① 无法登记（loader 拒声明它的模块）、② 连 `declareTopic` 都走不了（形态校验要 `domain/name`）、③ `audit-hook-coverage` 的字面量扫描**看不见**它。
**改动**：
- `kernel/governance.js`：helper 改为 **`emit(name, payload)`**（body 仍带 `type` 供读者用），8 个调用点全改成**首参数字符串字面量 ＋ 斜杠名**：`motion/propose|second|withdraw|table|amend`、`agenda/add|reorder|split`（内容型批量改写用 Node 脚本，逐锚点断言"恰好命中一次"，并断言不再有 `emit({ type:`）。
- `kernel/bus.js`：8 个钩子**登记进 `HOOK_REGISTRY`**（`failure:'open'`、**不可阻断**——治理是"已发生"的记录，坏监听者不能拦住动议），并把 **`motion|agenda` 加入 `VU_NAMESPACE`**（拼错 ⇒ **具名拒**，不是静默）。
- ★ **我替 pack 把登记也做了**：否则"emit 已落、登记未落"的窗口会让分类门红（红树不得提交）；已通知 pack **无需再登记**，只差 M2 政策模块。
- **实测**：`node D:\_tmp\vmu-r12\bindbox.mjs` §③ ⇒ **一个真的被 loader 装载的中间件模块收到了 `motion/propose` 恰一次**；`isRegisteredHook('motion/propose') === true`；未登记的点号名仍发不出去 ⇒ `audit-hook-emit-classification **7/0**`、`audit-hook-coverage **4/0**`、`vmu-governance 9/0`、`vmu-bus 44/0`。

### 8.2 ① `bindBox`（Lead 裁决 (i)）：**已落**
- `kernel/meetings.js`：`const api = { openMeetings, **bindBox**, **boxBinding**, … }`；内部 `boxBinding`（构造期 `boxFor` 注入 ⇒ `source:'injected'`），投票点 `mirrorVote({ ballot, **boxFor: boxBinding**, … })`；`status()` 新增 **`boxBinding:{bound,source,at,changes}`**。
- **语义**：`bindBox(fn)` 绑定／换绑；**`bindBox(null)` 解绑**并把状态回到未绑；**非函数非 null ⇒ 具名拒 `VMU_INVALID_ARGUMENT`**（不能作答的绑定＝要防的静默）；未绑／解绑后投票仍是**具名** `VMU_MEETING_BOX_UNWIRED`（`receipt.receipt.ballot`）。**策略仍在外部**：本面只 CALL 回调，从不自己开箱/造映射。
- **实测** `node D:\_tmp\vmu-r12\bindbox.mjs` ⇒ **TOTAL pass=16 fail=0**：未绑具名 → `bindBox('x')` 具名拒 → 绑 `()=>'box-7'` ⇒ 票**真进 box-7**（ballot 接缝收到 cast）→ 抛错回调 ⇒ 投票回执**带它自己的码**（`POLICY_BOOM`，不吞）→ `bindBox(null)` ⇒ 状态回未绑且投票重新 `VMU_MEETING_BOX_UNWIRED`；构造期注入的 `boxFor` 仍工作且标 `injected`。

### 8.3 ★ 一个 pack 会撞上的装配事实（**loader 加载期拿不到 api**）
`kernel/loader.js` 的模块工厂调用是 `module.default({ hooks, log, kernel, setting })` —— **没有 `api`** ⇒ pack 的 M2 模块**无法在装载期**调 `api.services.get('vmu.meetings').bindBox(fn)`。两条可行路径：
- **(推荐，零改动)** **懒绑**：在 `motion/propose` 处理器里先 `const m = flat.api.services.get('vmu.meetings'); if (!m.boxBinding().bound) m.bindBox(mapFn)` 再行事（`bindBox` 幂等、可自曝，装载次数无关）。
- **(若确实要装载期绑定)** loader 给工厂多传一个 `api`（一行，`kernel/loader.js` 属 pack 的卷）—— 我没有替它决定，因为这会把"装载期能做什么"扩成新契约。

### 8.4 本轮唯一剩余红（**不在我写范围**）
`audit-vmu-docs` **83/1**：`FAIL every vmu.* key named in the docs exists in settings/schema.js [vmu.meetings.bindBox (10-packs)]` —— `docs/10` 把**方法**写成了点号键形态；该门的规则是"文档里出现的 `vmu.*` 名必须在 schema 里"。**修法（一行，pack 的卷）**：写成 `` `vmu.meetings` 的 `bindBox()` ``（`vmu.meetings` 在该门的 `NON_SETTING` 白名单里，单说服务名不报）。我的 `docs/03 §2.1` 行本来就是这种写法，故不报。

### 8.5 ★★ 顺着 Lead 的 C③ 更正做的一次普查：**同类假阴性不止 governance**（29 处 / 28 未登记 / 16 个点号名）

Lead 更正说"不可挂的成因不是名字形态，更可能是本地包装让字面量扫描看不见"。**我把这个问题普查了一遍**（`D:\_tmp\vmu-r12\object-emits.mjs`，只读；输出存 `D:\_tmp\vmu-r12\object-emits.txt`）：**两者都真，而且 family 比 governance 大得多**。

| 形状 | 站点 | 未登记 |
|---|---|---|
| `emit({ type: '<名>' })`（对象形态） | **29** | **28** |
| 其中**点号名**（**连登记都做不到**，与 governance 同病） | **16**：`ballot.open`／`ballot.recuse`／`ballot.runoff`×2／`ballot.reopen`／`ballot.lapse`／`ballot.lapse-revoked`／`course.open`／`course.publish`／`repro.build`／`resource.use`／`resource.preempt`／`resource.reserve`／`stateversion.migrate`／`store.write`／`chat.js:156` 一个可疑名 | 全部 |
| 其中**斜杠名但未登记**（登记即可挂） | 12：`alerts/fired`、`alerts/summary`、`alerts/escalated`、`bidding/collusion-suspected`、`capacity/preempted`、`conference/submitted`、`conference/agenda-planned`、`funding/account-opened`、`grant/granted`、`mathtools/ran`、`metrics/dropped`、`migration/applied` | 全部 |

**两个门为什么都看不见**：`scripts/audit-hook-emit-classification.mjs` 的正则只认 `emit('名字')`（**对象形态不匹配**）；`tests/audit-vmu-docs.test.mjs` §I 的 helper 规则只认 `emit('名')`／`emit({ name: '名' })`／`say({ type: '名' })` ⇒ **`emit({ type: … })` 三种都不匹配**。

**⇒ 建议**：① **扫描侧（verify，`scripts/**`＋`tests/**`）**：helper 规则补 `emit({ type: '名' })`；并把 §I 的"声明后 700 字符内出现 `bus.emit(`"改成**按函数体边界**判定（我已踩过一次，见 §8.1；短注释只是权宜）。② **内核侧（按 owner 分派）**：16 个点号名必须改斜杠名（否则永远登记不了），12 个斜杠名只需登记。governance 的 8 个我已改＋登记；`storepolicy`／`metrics` 曾在我的写范围（R9／R10），需要我可以接手，其余（ballotbox／course／resource／repropack／stateversion／alerts／bidding／capacity／conference／funding／grant／mathtools／migration）请派单。③ 这不是"文档问题"：它直接决定 **pack 能不能挂上这些事件**。

## 9. 再加：vmu-pack 的 ④⑤（**动议⇒开箱** 的最后两块，已落）

> 说明：这两项是在 Lead"本轮不改"裁决**之后**由 pack 报告的**另一件事**（不是被推迟的 29 处扫描/转换），且**直接挡住 pack 的政策模块进仓**，故本轮落掉并如实记在此处。

### 9.1 ④ 会议面的 `ballot` 缝（`kernel/index.js`）
**缺陷**：`createMeetings({…})` 没有 `ballot` ⇒ `mirrorVote()` 在问 `boxFor` **之前**就返回 `reason:'no-seam'` ⇒ `bindBox` 绑了也测不出效果。
**修法**：在 `createMeetings` 调用点前建**迟到绑定**适配器（`ballotbox` 在几行**之后**才构造，`cast` 只在投票时调用，故箭头引用后面的 `const` 安全）：
```js
const meetingBallot = { cast: (a) => ballotbox.cast({ boxId: String(a.boxId), by: String(a.by || a.member || ''), choice: a.value }) }
```
**策略不外移**：`boxFor` 决定**哪个箱**与选项词表，适配器只执行它拿到的 cast（R1）。

### 9.2 ⑤ 会议动议可观测（`kernel/meetings.js` ＋ `kernel/bus.js`）
- `meetings.js` 的 `emit` helper 现在**同时接受** `emit('名', payload)`（首选：调用点字面量，两个门都能看见）与旧的 `emit({type:…})`；在动议落账处新增 **`emit('meeting/motion', { at, meeting, motion, kind, emergency })`**（旧调用点**不动**，留给 R13 的 29 处统一转换）。
- `bus.js` 登记 **`meeting/motion`**（`failure:'open'`、**不可阻断**；`meeting/` 本就在 `VU_NAMESPACE`）⇒ pack **不要再登记**（避免重复；R12 已发生过 8 条 `duplicate hook` 的事故）。
- **id 空间澄清（不必统一）**：会议动议 `mo1` 与治理动议 `mo-1` 是**两个不同的对象**（会议内 vs 全所）；镜像问的是**会议内**那个。所以政策模块应挂 **`meeting/motion`** 并用它带的 `{meeting, motion}` 建绑定 —— 这正是 pack 自己得出的结论；**无需**改任一面的 id 生成。

### 9.3 实测（`node D:\_tmp\vmu-r12\motion-box-e2e.mjs` ⇒ **TOTAL pass=11 fail=0**，exit=0）
真装配、真 loader（`k.loader`，才带真服务目录）、真中间件模块（声明 `['trigger-workflow','record']`，挂 `meeting/motion`）：
1. **④**：只开票不绑 ⇒ 回执是 **`no-binding`（不再是 `no-seam`）** 且码为 `VMU_MEETING_BOX_UNWIRED`；
2. **⑤**：中间件**收到 `meeting/motion`** 且带着 `{meeting, motion}` 两个**会议内** id ⇒ 它开了一个真票箱并**懒绑** `bindBox`（`status().boxBinding` 变 `{bound:true, source:'method'}`，`ballotbox.status().boxes === 1`）；
3. **端到端**：随后的 `vote()` ⇒ `receipt.receipt.ballot = {mirrored:true, reason:'cast', boxId:<政策选的那个>}`；
4. **反向**：`bindBox(null)` ⇒ 又回 `VMU_MEETING_BOX_UNWIRED`（不开箱、不假装）。

### 9.4 门禁（全 exit=0）
`vmu-meetings 161/0` · `vmu-kernel 175/0` · `vmu-entry 150/0` · `vmu-bus 44/0` · `audit-hook-coverage 4/0` · `emit-classification 7/0` · **`audit-vmu-docs 84/0`**（pack 已把 `docs/10` 的写法改好 ⇒ §8.4 那条红**已清**）· `check-docs PASS` · `motion-box-e2e 11/0`。

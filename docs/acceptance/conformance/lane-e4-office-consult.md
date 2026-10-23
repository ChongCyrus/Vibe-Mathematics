# lane E4 — `vmu.paper.officeConsult` 闸长到**在册路径**（原 C-30 的"未咨询所内即定稿"）

日期：2026-10-23（phase 12 / E4）
判据（Lead 原话）：**"`vmu.paper.officeConsult` 的闸要长到在册路径上；不是复活 `kernel/paper.js`。"**
本文件的每条结论都指到 `文件:行` 或命令输出；没有指到的，写在 §7「未做/未核」。

---

## 1. 改之前的事实（为什么要动它）

| # | 事实 | 证据 |
|---|---|---|
| 1 | v5r 的论文**实际走** `packs/v5r/paper.js` → `kit/paper.js` | `packs/v5r/tools.js` 的 `toolPaper` 用 `createPaperSubsystem({ kernel })`；`kit/paper.js` 的 `createPaperFlow` |
| 2 | `kit/paper.js` **一个 consult 键都不读** | 改前 `grep -c officeConsult vibe-math-vmu/kit/paper.js` ⇒ `0` |
| 3 | 那套闸只存在于 `kernel/paper.js`，而它**在装配里没有构造者** | `kernel/index.js` 自述 "paper has NO instance in this assembly"；`tests/vmu-kernel-reachability.test.mjs` 把它列进 `KNOWN_UNMOUNTED` |
| 4 | 所以照 docs 设 `vmu.paper.officeConsult='required'` **什么都不会发生** | 上两条合并；`docs/04-settings.md:183` 自己记了这次实测 |

⇒ 这不是"文档没写清"，是**声明在、执行点不在**。E4 的动作是把执行点搬到在册路径上。

---

## 2. 改了什么

### 2.1 `vibe-math-vmu/kit/paper.js`（唯一执行点）

| 行 | 内容 |
|---|---|
| `:53-57` | `createPaperFlow({ …, consultRoles = [], clock })`：**谁答复**是机构政策 ⇒ 由 pack 传，kit 不猜 |
| `:124-130` | 注释写明为什么闸在这里（`kernel/paper.js` 无构造者 ⇒ 那条路径从不执行），以及"政策留在 pack"的边界 |
| `:131-137` | `WIRED_KEYS` = 5 个键：`vmu.paper.officeConsult`／`officeConsultOn`／`officeConsultTimeoutMs`／`officeConsultOnTimeout`／`officeConsultExemptRoles` |
| `:147-172` | `consultPolicy()`：**调用时**读（D-13 活读，绝不用启动快照）。两条规矩：① 读不懂的 `officeConsult` **不是**静默放行 —— 记为 `invalid` 并**拒**；② 认不出的 `officeConsultOnTimeout` **降级到 `hold`**（保守侧） |
| `:183-201` | `consultOf(state)`：咨询台账**放在论文状态记录里**（一稿一记录 ⇒ 重放能找到"问过没有"） |
| `:203-292` | `consultGate({ state, member })`：`required` 且没有 `answered` 的请求 ⇒ 具名拒 `VMU_OFFICE_CONSULT_REQUIRED`；超时（`timeoutMs > 0` 且更久）⇒ `VMU_OFFICE_CONSULT_TIMEOUT`，两种分岔（`hold` 保留提问／`refuse` 作废提问）**都不放行**；豁免角色只对 `member` 的 `id`／`slot` 生效 |
| `:295-320` | `recordConsult({ target, by, note, answer })`：所办答复（`by` 必填，缺 ⇒ `VMU_INVALID_ARGUMENT` 具名） |
| `:461-490` | `recordFinal()`：`decision === 'deliverable'` 时**先过 `consultGate`**（`:474-477`），非 deliverable 不闸（拒稿不是"定稿"） |
| `:698` | 导出面加了 `recordConsult`／`consultState` |

- 具名拒都带**三条出路**（先咨询／改时机键／显式关掉这道闸），并带 `.enforced[]`（真正求值的键）与 `.settingValues`（当前生效值）。

### 2.2 `vibe-math-vmu/packs/v5r/paper.js`（政策侧）

| 行 | 内容 |
|---|---|
| `:58` | `const PAPER_CONSULT_ROLES = Object.freeze(['office'])` —— 答复角色是**机构政策**，声明在 pack |
| `:70-71` | `consultRoles: PAPER_CONSULT_ROLES` 交给 kit（kit 只执行，不猜谁答复） |

> 披露：E4 的写域原本写的是 `kit/paper.js` +（若需要）`packs/v5r/paper.js`。**动了 `packs/v5r/paper.js` 这两行**，因为"谁答复"必须由政策侧给出，否则闸一开就永远答不了（kit 猜 `'office'` 就等于把政策写进机制）。其余 `packs/v5r/**` 未动。

### 2.3 语义锁死（三个键，逐条）

| 键 | 语义 | 取值 | 谁读 | 失败怎么走 |
|---|---|---|---|---|
| `vmu.paper.officeConsult` | 定稿前是否必须问所办 | `required`（缺省）／`off` | `kit/paper.js:149` | **读不懂 ⇒ 拒**（不静默放行） |
| `vmu.paper.officeConsultOn` | 何时必须问 | `finalize`（缺省）／`finalize-or-submit` | `kit/paper.js:154` | 认不出 ⇒ 按 `finalize` |
| `vmu.paper.officeConsultTimeoutMs` | 等答复的时限 | `0`＝无限等 | `kit/paper.js:156` | — |
| `vmu.paper.officeConsultOnTimeout` | 超时处置 | `hold`（缺省）／`refuse` | `kit/paper.js:158` | 认不出 ⇒ `hold`；**没有 default-allow 这一档** |
| `vmu.paper.officeConsultExemptRoles` | 谁豁免 | `[]`（缺省＝不豁免任何人） | `kit/paper.js:160` | 豁免只匹配 `member` 的 `id`／`slot` |

### 2.4 注册（docs/03 §8）

- `:447` **改写** `VMU_OFFICE_CONSULT_REQUIRED` 的"执行点"列：从"定稿路径（`kernel/paper.js`／human 面）"改成"**在册的定稿路径**：`packs/v5r/paper.js` → `kit/paper.js` 的 `recordFinal({decision:'deliverable'})`（`kernel/paper.js` 的同名门在装配里没有构造者，因此不是执行点）"，并写明回执带 `.enforced[]`／`.settingValues`。
- `:448` **新增** `VMU_OFFICE_CONSULT_TIMEOUT`（超时分岔两种都不放行；未知取值按 `hold` 执行并在 `.settingValues` 里显形）。
- `package.json`／`installer.js` **无需改**：没有新文件（`vibe-math-vmu/kit/paper.js` 已在 `package.json:785` 与 `installer.js` 的 managed `files[]` 里）。

### 2.5 新测试

`tests/vmu-paper-office-consult.test.mjs`（315 行，**65 passed / 0 failed**，`node tests/vmu-paper-office-consult.test.mjs`，exit 0），十二段：
① 缺省 `required` 时未咨询即定稿被具名拒（论文**没**进入 finalized）；② 同一提问被答复后放行，且回执 `consult.requestId` 指回**那一条**提问 id（证明闸真在读这条提问）；③ `off`／未设 ⇒ 零机制（不闸）；④ 只有声明的答复角色能答，别人答 ⇒ 具名 `VMU_NOT_PERMITTED` 且不算数；⑤ 豁免角色按名单放行、回执 `satisfiedBy:'exempt'` 并点回那个键，名单没点到照样拒；⑥ 超时 `hold`（`heldOnTimeout:true`、提问保留、仍拒）与 `refuse`（作废后重开一条新提问、仍拒）两条分岔，两条都不放行；⑦ `officeConsult` 读成不认识的值 ⇒ `VMU_INVALID_ARGUMENT`（列出合法取值，**不**当 off 放行）；⑧ 闸只挡定稿：`decision:'revise'` 不闸、也不留提问；非定稿者先被席位挡（`VMU_NOT_PERMITTED`）；⑨ pack 没声明 `consultRoles` ⇒ 定稿时就是配置错（`VMU_INVALID_ARGUMENT`），**一条幽灵提问都不开**；⑩ 提问真写进 `paper-state` 记录（`body.consult.requests[]`），**换一个新的 flow 对象读同一 records 面**能看到同一条在等提问并完成答复（跨重启闭环）；⑪ 五个键各有不同可观测（`consultState().policy` 逐键可见）；⑫ 闸所在模块真的从插件入口可达（这次缺陷的根因）。
**并且**把"闸挡在前面"这件事在既有测试里也钉住了：`tests/vmu-v5r-tools.test.mjs` 的 ③h 段新增 `finBlocked`（定稿回执被 `VMU_OFFICE_CONSULT_REQUIRED` 拦下且 dispatcher **不吞**）＋ `recordConsult` 后 `fin` 才 `finalized:true`（**339 passed / 0 failed**，exit 0）。

---

## 3. 门禁实数（本轮实际跑的，命令＋退出码）

| 命令 | 结果 |
|---|---|
| `node tests/vmu-paper-office-consult.test.mjs` | **65 passed, 0 failed**，exit 0 |
| `node tests/vmu-v5r-tools.test.mjs` | **339 passed, 0 failed**，exit 0 |
| `node tests/vmu-paper.test.mjs` | **37 passed, 0 failed**，exit 0 |
| `node tests/vmu-kernel.test.mjs` | **260 passed, 0 failed**，exit 0 |
| `node tests/vmu-resume-e2e.test.mjs` | **108 passed, 0 failed**，exit 0 |
| `node tests/audit-hook-coverage.test.mjs` | **10 passed, 0 failed**，exit 0 |
| `node tests/audit-kit-boundaries.test.mjs` | exit 0 |
| `node tests/vmu-kernel-reachability.test.mjs` | **8 passed, 0 failed**，exit 0（含"MOUNTED 的 paper 流程读 consult 家族"那条，现在真的成立） |
| `node tests/audit-vmu-docs.test.mjs` | **103 passed, 0 failed**，exit 0 |
| `node scripts/check-docs.mjs` | **DOC LINT: PASS**，exit 0 |
| `node scripts/generate-wired-schema.mjs --check` | exit 0（`INVARIANTS ok: 330 emitted, 824 pre-existing`；本 lane **0 新键**） |
| `node scripts/regen-all.mjs --check` | **16/16 in sync**，exit **0** |

---

## 4. 一条必须说清的"假绿"教训

`tests/vmu-v5r-tools.test.mjs` 的 ③h 段原先直接 `paper.advance()` 后就发定稿回执——闸一落地它立刻红。**正确修法不是把闸挪开**，而是让测试先证明"被拦下（具名）"再 `recordConsult` 放行：这样"闸真的在前面"这件事被**同一个测试**同时证明了两次（拦得住 + 放得开）。若当时选择"给测试传 `officeConsult:'off'`"，闸会看起来绿而**永远没被执行过**——这正是 `docs/04-settings.md:183` 记的那类假绿。

---

## 5. `kernel/grant.js` 的裁定建议（Lead E4 第 2 件）

### 5.1 事实（实测）

- `vibe-math-vmu/kernel/grant.js`（267 行），导出 `createGrant({ clock, log, settings, bus, members })`（`:43`），读 4 个键 `vmu.grant.enabled|commands|defaultScope|maxOpenGrants`（`:27-29`，`enabled` 默认 `false`）。
- **零生产消费者**：`grep -rn "createGrant" --include=*.js vibe-math-vmu/` ⇒ 只有 `kernel/grant.js` 自己；`kernel/index.js` 里没有任何 `createGrant` 调用（只有散文提到 "grant"）。
- 已登记为"无消费者"：`tests/vmu-kernel-reachability.test.mjs` 的 `KNOWN_UNMOUNTED`（含测量方式）；`docs/04-settings.md:1188-1191` 这 4 键标 `⚠️ 未接线（读取者不可达：该模块装配时不加载）`。
- **v5r 的规则集不要求 grants**：pack 提示词语料里 `grep -c 临时授权` 只有 `v5r-core.js:610-611` 那两条，讲的是"装环境要用户授权"，与 `vmu.grant.*`（临时／范围／单次**命令**授权）无关。
- 缺的那一半是接口：`docs/08-primitives-meeting-ballot-workflow.md:1367` 的 **GAP-MTG-12** 写着"工具面未实现（`TOOL_FACES` 里没有 grant 面）"。

### 5.2 两条路的代价

| 方案 | 要做的事 | 代价/风险 |
|---|---|---|
| **A. 删掉**（推荐，符合红线④"没有消费者就不给机制"） | 删 `kernel/grant.js`；删 `settings/schema.js` 里 4 行；删 `installer.js` managed `files[]` 与 `package.json files[]` 各 1 行；`tests/vmu-kernel-reachability.test.mjs` 的 `KNOWN_UNMOUNTED` 减 1 条（**只减不增**，正合该门禁纪律）；docs/04／docs/03／docs/08／docs/11／docs/acceptance/* 里提到 `vmu.grant.*` 的表与行要改口径（多数是派生产物，改生成器输入即可） | 一处需要人判：`docs/11-gates-and-development.md:798` 记着 `grant.check()` 的具名拒行为（`VMU_NOT_PERMITTED`）——删掉后那条"零机制"示范要换一个模块举例；`docs/acceptance/*` 多张矩阵把 M-A30 映射到 `vmu.grant.*`，删了要改判成"框架无此能力" |
| **B. 挂上** | `kernel/index.js` 构造 + `vmu.grant` 进能力目录 + `tools/grant.js` 工具面 + `host.js` 的 `TOOL_FACES` 一行 + `installer/package.json` 2 行 + 一套测试（授予/过期/撤回/超 `maxOpenGrants`） | 更大：**谁在生产里调用 `grant.check()`** 也得回答（否则只是把"没人用的模块"换成"没人用的服务"）；且 v5r 规则集不要求它 ⇒ 属于"给未来留机制"，与红线④的默认相反 |

**建议**：走 A（删）。理由不是"代码不好"，而是**判据在仓库自己手里**：`docs/04` 已诚实标 `⚠️ 未接线`、reachability 门禁已把它列进豁免表、v5r 规则集不要求它 ⇒ 留着的唯一效果是让读者以为"临时授权"这道门存在。若 Lead 想保 M-A30 的映射，代价最小的是**把 4 行 schema 与模块一起删掉，并在 `04-parity-matrix.md`／`09-goal4-verdict.md` 把 M-A30 改判为"框架不提供（v5r 规则集不要求）"**——这比留一个假门安全。

---

## 6. 反证（我特意验过"不是看起来对"）

1. **闸不是恒过也不是恒拒**：测试 ① 与 ② 是一对——**同一条提问**在未答复时 `ok:false`／`VMU_OFFICE_CONSULT_REQUIRED`，答复后 `ok:true`／`finalized:true`，且 ② 断言回执的 `consult.requestId === ① 的 error.requestId`（证明放行来自**那条**答案，不是别的路径）。
2. **"读不懂不静默"**：`officeConsult` 设成 `'sometimes'` ⇒ `VMU_INVALID_ARGUMENT`，`declared:['required','off']`，论文状态仍是 `awaiting-editor`（测试 ⑦）。
3. **超时两种分岔都不放行**：`hold` 下 `heldOnTimeout:true`／`requestCleared:false`／等待的还是同一条提问；`refuse` 下 `requestCleared:true` 且再试会开**新**提问（测试 ⑥）。
4. **确认"在册路径"就是这条**：`packs/v5r/tools.js` 的 `toolPaper` 的 `final` 分支调的正是 `kit/paper.js` 的 `recordFinal`，不是 `kernel/paper.js`。
5. **确认没有第二道闸被顺手打开**：`kernel/paper.js` 未改（仍是不可达模块），`git diff --stat` 里没有它。
6. **未做的反证（诚实标注）**：想跑"把 `recordConsult` 那行注释掉看 ② 变红"的突变测试，但测试文件是按自身位置推导仓根的，复制到 `D:\_tmp` 后解析不到 `scripts/lib/reachability.mjs`，而**在 `tests/` 里临时放突变文件会瞬时改变作业集合**（本仓已因此误红过别的 lane 的门禁）⇒ 放弃，改用上面 1–5 的实测替代。**所以"突变必红"这一句我没有实测，只实测了"未答→拒／答→放行"这一对。**

---

## 7. 未做 / 未核（**不许当成"没问题"**）

1. ★ **所办答复没有工具面入口**：`recordConsult` 只在 `kit/paper.js` 的流程对象上，`vibe_v5_paper` 的 action 表（`start/part/review/advance/final/render/status/compile/sections`）里**没有 consult 动作** ⇒ 真实会话里"所办答复"目前只能由 pack/宿主代码调用。要给入口需改 `packs/v5r/tools.js`（E4 写域之外，请 Lead 或多派一条 lane）。
2. **schema 行文档仍写旧读点**：`settings/schema.js` 里 `vmu.paper.officeConsult` 的 `docs` 串写着"读者：定稿路径（`kernel/paper.js`／human 面）"，现在真正的读者是 `kit/paper.js`（schema 是 Lead 的写域，未动）。
3. **docs/04 的一句散文已过时**：`:183` 仍写"`kit/paper.js` 后者一个 consult 键都不读"（我修好之后这句不再成立；该处是生成器之外的正文，归派生面负责人）。
4. **没跑全量 T1**：只跑了 E4 相关的 12 条命令（见 §3）。全量 `GATE_SCOPE=vmu node tests/run-tests.mjs` 归 Lead 汇总。
5. **没跑任何 `--write`**（按指令）：`generate-wired-schema`／`regen-all` 只跑 `--check`，当前分别 exit 0／16-16，因此**不需要**写入。
6. **未核**：`human` 面是否也该有 consult 动作（`officeConsultOn='finalize-or-submit'` 的"投稿前问"目前只实现了一半：`submit` 路径未查）；`kernel/paper.js` 的同名闸与 kit 的语义**是否逐字一致**（只核了"两条分叉都不放行"这一条，没有逐字段比对）。

---

## 8. 复核用的锚（一行一条，grep 就能重放）

```
grep -n "consultRoles" vibe-math-vmu/kit/paper.js Vibe-Mathematics/vibe-math-vmu/packs/v5r/paper.js
grep -n "OFFICE_CONSULT" vibe-math-vmu/kit/paper.js
grep -n "officeConsult" vibe-math-vmu/docs/03-interface-contract.md vibe-math-vmu/docs/04-settings.md
node tests/vmu-paper-office-consult.test.mjs
node tests/vmu-v5r-tools.test.mjs
node scripts/regen-all.mjs --check
```

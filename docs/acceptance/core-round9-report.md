# Round 9 · task-66 · A（G7 共享日志）／B（退出冲刷）／★methodsOf 写穿真缺陷／F1 storepolicy

- 状态：**A、B 落地并实测**；★**methodsOf 真缺陷已修**（reader-a 的 11c/11d 形状已翻正，见 §3）；**F1 已修**（`vmu-storepolicy 11/0`）；**C（B1–B4 八键＋读者）与 D（`control/idle`）本轮未开工，具名转 Round 10**（§6）——**没有半成品**。
- 剩余**唯一我名下红**：`audit-vmu-services` **46/2** ⇒ 需要 `tests/audit-vmu-services.test.mjs` 的 `SURFACES` 表加**一行**（该文件归 vmu-verify），见 §2 末。
- 纪律：未跑全量 sweep、未 `regen-all`、未 git；临时文件 `D:\_tmp\vmu-r9`；内容型改写只用 Node／`edit`。

## 1. A · G7：一份日志，两个面（核侧绑定）

**问题**（Round 8 遗留）：`kernel/index.js` 的 `createBallotBox({settings,bus,clock,log})` **没传** `durableQueue` ⇒ 恒走非耐用分支；而"ballotbox ＋ mailbox 同一份日志"必须由核侧建**一个**实例**同时**交两面（各自发号无法合流）。

**做法**（全部在 `kernel/index.js`）：
- 新导出 `createSharedCommitQueue({resolveStore, clock, name})`（`:224-273`）：**迟到绑定门面** —— 每次调用解析宿主 store（`append()`＋`readAll()` 才合格），**首次可用时才建**真日志（`kernel/ballot.js` 的 `createDurableCommitLog`，其构造本身会 `recover()` 读回票号），同一个 store ⇒ **同一个**日志对象；store **换对象** ⇒ 重建并从其行恢复号（**不回退**）。store 缺失 ⇒ `durable:false`、`reserve()` 返回 `null`（**具名降级**）；解析器**抛错** ⇒ `resolveState().failure = {code:'VMU_COMMIT_STORE_FAILED'}`（与"没给 store"**区分**）。
- `const sharedCommitLog = createSharedCommitQueue({ resolveStore: commitStore, clock, name: 'g7-shared' })`（`:724` 一带）⇒ **同时**传给 `createMailbox({…, durableQueue: sharedCommitLog})`（`:725`）与 `createBallotBox({…, durableQueue: sharedCommitLog})`（`:1009`）。
- `status().seams.sharedCommitLog = { consumedBy:[…], durable, bound, failure, status }`（`:1948` 一带）。
- **服务登记**：`registry.register('vmu.commitlog', …)` ＋ 内核面 `get commitlog()`（`vmu.sharedCommitLog` 这个 camelCase 名**不被** `audit-vmu-services` 的 registry 扫描正则识别 ⇒ 改成两段小写的 `vmu.commitlog`，并补 getter，使该服务**四项检查全都适用**，而不是悄悄逃过检查）；`docs/03 §2.1` 加方法契约行，服务索引由 `scripts/generate-surface-index.mjs --write` 重生成。

**实测**：`node D:\_tmp\vmu-r9\g7-shared.mjs` ⇒ **TOTAL pass=17 fail=0**，`exit=0`。断言要点：两内核共享一份 store ⇒ 交错序列 `ballotbox-cast, mailbox-send, ballotbox-cast, mailbox-send` 拿到 ticket **1,2,3,4**（**一条**共享计数器，互不撞）；每条意图都有**同号**结果行；无 store ⇒ 两面都具名降级且仍工作；后挂载的 store ⇒ 下一次提交即耐用；解析器抛错 ⇒ 具名 `VMU_COMMIT_STORE_FAILED` 且面不崩。

**剩余红（一行，归 vmu-verify）**：`tests/audit-vmu-services.test.mjs` 的 `SURFACES` 表加
```js
  'vmu.commitlog': 'sharedCommitLog', // round 9 / task-66 A (G7): the ONE commit log shared by the board + mailbox
```
后应为 `49/0`（现 46/2：`every registered service is mapped to a constructor in this audit :: vmu.commitlog` ＋ `no constructed service is missing from the registry :: sharedCommitLog`）。**这是该门的既有做法**（每个新服务都要在这里被承认），不是新门禁。

## 2. B · 退出冲刷：两件事，不是一个

- **引擎半**（reader-a 的 `kernel/resume.js`）：`settle()`（等在途**写穿**）、`flushAll()`（显式刷 **journal**）、`exit()`（两半＋`ok` 是**与**）。
- **装配半**（我）：
  - `kernel.shutdown({reason})`（`kernel/index.js`，**:1807 一带**）：调 `resume.exit()`，把两半**分别**留在回执（`writeThrough`／`journal`），`status().shutdown` 常驻可读（**未退出过 ⇒ `null`，不等于成功**）；**不抛**（宿主 dispose 路径抛出去可能被吞、反而更不显眼），失败**具名**进回执＋内核日志（`vmu/exit-flush`）；**并发共用一次**冲刷、**再次调用会重跑**（宿主可能 uninstall→install 产生新 journal 尾巴，永久"已刷"标记会静默丢尾巴）。
  - `host.js` 适配器 **`uninstall()` 先冲刷再注销**，回执带 `exitFlush`，失败走适配器 log；`ownedByHost` 分支同样如此。
  - 入口 `vibe-math-vmu.js` 的 effect cleanup **返回该 Promise**（宿主若 await disposer 就会等），失败再补 `ctx.logger.warn` ＋ stderr。
- ★ **实测发现的真交互**（verify 也复现了）：**写前必读闸管辖退出** —— 从未成功读过 fold 的进程，`flushAll()` **具名拒** `VMU_RESUME_WRITE_BEFORE_READ`（`failed:[{key:null,…}]`）⇒ `shutdown().ok===false`，**不会**谎报"已刷"。正常装配的开机链已 `recover()`，故退出必成功。**两种形状都有断言**（探针 §①／§②）。
- **契约同步**：`docs/03 §2` 新增 G7＋退出冲刷两块（含"state 自动写穿 vs journal 必须显式 flush"、"写前必读同样管辖退出"）；§8 登记 `VMU_EXIT_FLUSH_UNAVAILABLE／FAILED／INCOMPLETE`；**§8.2 新增 env 缝登记表**，登记 reader-b 的 `VMU_RESUME_FROM`（谁设／何时设／缺席行为＋`kernel/mathjobs.js:602/649/738` 出处）。
- **实测**：`node D:\_tmp\vmu-r9\exit-flush.mjs` ⇒ **pass=27 fail=0**，`exit=0`。

## 3. ★ methodsOf 真缺陷（Lead 的 11c/11d；reader-a 钻取）

**缺陷**：`kernel/index.js` 的 `methodsOf` 只列 `tasks`，attach 循环给其余面 `methods: []` ⇒ **没有任何方法被包裹 ⇒ 没有 after 钩子 ⇒ state 投影永不写穿**。旧行为下 `vmu.resume.projections:['meetings']` 会报 `attached:true` 却**从未进过 store**（reader-a 实测：开两个会＋`settle()`，`meetings` 键仍是 `[]` 种子）——"**attached**"≠"**durable**"。

**修法**（`:937` 一带）：
- 明确规则：`tasks` 是 **journal** ⇒ 显式命令表（读者不得入表，否则 hydrate 会重放读调用）；其余是 **state** ⇒ **反转为"包所有方法，除只读集"**：新增 `PROJECTION_READ_ONLY`（`status/snapshot/restore/list/view/get/...` 及 `quotaState/speakCount/queue/minutes/verbatim` 等），一个读被误包只多一次快照，一个**改状态的方法漏掉就丢改动**——后者才是被实测到的失败。
- `status().projections` 新增 **`wrappedMethods`**（逐面：`{face, mode, methods, wrapped}`）与 **`readOnly`** ⇒ "哪些方法真的被包"不再是推断。

**实测**：`node D:\_tmp\vmu-r9\projection-writethrough.mjs` ⇒ **pass=14 fail=0**，`exit=0`。要点：`meetings` 的包裹表非空且**不含** `status/snapshot`；开两个会 → `settle()` → **`meetings` 键里真的有两个会**（state 信封 `value.data.live`）；**新内核（同一 root）恢复后两个会同 id 回来**；下一次 `open()` **不重用**已恢复的 id；退出冲刷两半仍干净。

## 4. 顺带修的两个真缺陷

1. **F1（Lead 派单，vmu-activity 的 pin）**：`kernel/storepolicy.js` 的 `write()` 把 `vmu.store.tmpDir` 推进 `fired`，但它**不在** `enforcement` 里 ⇒ 违反本面"`fired ⊆ enforced`"的头条不变量。已把该键加进 `enforcement`（同一行下面的 `checkPath(c.tmpDir, ['vmu.store.tmpDir','vmu.store.root'], …)` 本来就已经把它当执行集）⇒ `node tests/vmu-storepolicy.test.mjs` **11/0，exit=0**（verify 又补了一条真声明 tmpDir 的回执，把原先空过的断言填实）。
2. **★ 声明式投影会崩 `recover()`**（B 的验证途中实测）：`kernel/store.js` 的 `PUBLIC_KEYS` 缺 `ballotbox`／`minutes`，而 `RESUME_PROJECTION_ADAPTERS` **声明**了它们（都带 `snapshot()/restore()`）⇒ 部署一旦把这两个面写进 `vmu.resume.projections`，`hydrate()` 调 `store.read('ballotbox')` 就被白名单**具名拒**，整条 `recover()` **崩**（`VMU_INVALID_ARGUMENT: undeclared durable key: ballotbox`）。两者都是 state 投影 ⇒ 加进 `PUBLIC_KEYS` ＋ `NULL_SEEDED`（`[]` 会被判 `VMU_RESUME_PROJECTION_GAP`，必须 `null` 种子）。**与 K2 的 `idempotency` 同一类**：有写者、白名单不知道。实测：`vmu-store 27/0`、`vmu-resume-e2e 81/0`（修前该场景直接抛）。
   - **未做**：`docs/03 §6` 的公开键**散文清单**没有逐一列出（门禁不管它；键已在 §2.1／§8 有位置）——留给下一轮补。

## 5. 验证（原样命令 ＋ 退出码）

```
node D:\_tmp\vmu-r9\g7-shared.mjs                → === TOTAL pass=17 fail=0 ===   exit=0
node D:\_tmp\vmu-r9\exit-flush.mjs               → === TOTAL pass=27 fail=0 ===   exit=0
node D:\_tmp\vmu-r9\projection-writethrough.mjs  → === TOTAL pass=14 fail=0 ===   exit=0
node tests/vmu-kernel.test.mjs                   → 175 passed, 0 failed           exit=0
node tests/vmu-entry.test.mjs                    → 150 passed, 0 failed           exit=0
node tests/vmu-host.test.mjs                     → 107 passed, 0 failed           exit=0
node tests/vmu-store.test.mjs                    → 27 passed, 0 failed            exit=0
node tests/vmu-storepolicy.test.mjs              → 11 passed, 0 failed            exit=0
node tests/vmu-resume-e2e.test.mjs               → 81 passed, 0 failed            exit=0
node tests/audit-vmu-docs.test.mjs               → 84 passed, 0 failed            exit=0
node tests/audit-vmu-services.test.mjs           → 46 passed, 2 failed            exit=1（唯一我名下红：SURFACES 一行，见 §1 末）
node scripts/check-docs.mjs                      → DOC LINT: PASS                 exit=0
node scripts/generate-surface-index.mjs --write  → exit=0（服务索引＋docs/04/18/05 重生成）
```

## 6. 未做项（具名转 Round 10，**没有半成品**）

1. **C · B1–B4 八键＋真读者**：`vmu.prompt.compactThreshold:66`／`compactAfterRounds:8`、`vmu.paper.finalPaper:true`／`format:'both'`／`language:'zh'`／`compilePdf:true`、`vmu.members.maxTempPerMember:3`、`vmu.tasks.memberMayRejectAssign:true`（值／出处见 Lead 的 task-66 描述）。**读者落点已勘定**：`kernel/metrics.js|prompt/**`（压缩阈值/轮次）、`kernel/publication.js`（论文成品形态）、`kernel/members.js|recruit.js`（临时成员上限）、`kernel/tasks.js`（成员可拒派）。**每键必须有真读者**才落键，否则是孤儿（Round 8 的教训）。**未开工**。
2. **D · `control/idle` 钩子**：`kernel/control.js` 的 `idleState()` 在 idle 时 emit 已登记钩子 ＋ `kernel/bus.js` HOOK_REGISTRY 登记 ＋ 跑 `audit-hook-coverage`／`scripts/audit-hook-emit-classification.mjs`。**未开工**（`bus.js` 与 vmu-pack 的 task-68 同轮同文件，需先与其约定谁先写）；`control/idle` 目前**不在** HOOK_REGISTRY（`control/paused|resumed|heartbeat|scope-paused|scope-resumed|param-set|param-refused` 在）。★ 参考事实：`idleState()` 现**全树零调用者**（`kernel/control.js` 内定义＋导出，无生产路径调用）⇒ 只加 emit 会得到一个**没有生产者的钩子**；要"真的有生产者"必须同时给它一个轮询点（候选：`kernel/index.js` 的 `beat()`／`control()` 视图），这一步需要与 pack 的 M2 中间件形状一起定。
3. **B1–B4 的 pack 值声明**（vmu-pack 的 task-68 A）：**等 C 落键＋读者**后才写默认值。
4. **F2／F3 已由 Lead 更正归属**：`kernel/lean.js` 的 `setTimeout` 轮询归 **reader-b**；`kernel/resume.js` >1200 行需拆分归 **reader-a**（我未动这两个文件）。
5. **E-17（`vmu-entry`）**：本轮开始时红（`allowKernelOverride:true` 下重叠语义），现 **150/0**——**不是我修的**（本轮我未改 pack 侧）；记录以免误记功。我测到的相关事实（供后续）：`kernel/pack.js:400` 的 `force = overrideAllowed()` 读 `kernel.settingsSnapshot()['vmu.packs.allowKernelOverride']`，而 `settingSource('vmu.packs.allowKernelOverride')` 返回 `'unknown'`；入口 `vibe-math-vmu.js:360` 的 `settingsWithPackDefaults = Object.assign({}, packDefaults, settings)` **会**保留该点号键（我实测 `settingsSnapshot()` 原样回 `true`）。

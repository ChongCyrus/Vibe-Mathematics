# Round 8 · task-58 · G6 分配型 store 接缝（A/B/C）＋ ★ finalizer 静默回落收口

- 状态：**A（接缝）／B（契约）／C（e2e 探针）全落并实测**；**★ 收口完成**；我名下的两条门禁红（`audit-vmu-docs` §8 缺码、尾账键 `vmu.meetings.leaveApprover`）**已清**；**4 组残余具名转出**（§6），**1 处写范围外文件如实登记**（§8，vmu-verify 已复核接管）。
- 与 vmu-verify 的对齐（他们 R8 回执）：我改的那条断言**接受、无异议**；常驻断言里 **set 归因 15/0、F44 正路 13/0、F53 边界 10/0 均已落**，**只剩 F52 语义**与 **commitStore e2e**（后者同意搬进 `tests/`，列下轮首项；断言清单见我 **§6.5**）。
- 纪律：未跑全量 sweep、未 `regen-all`、未 git（只只读 `git diff/status` 核对归属）；临时文件 `D:\_tmp\vmu-r8`；内容型改写只用 Node／`edit`。

## 1. A · 接缝：调用时解析 ＋ 具名降级（`kernel/ballot.js`，reader-c 的文件，只改这一处）

- `createBallot` 新选项 **`commitStore = null`**：`record()` 之后**调用时**解析（函数就调用它；**抛错 ⇒ `record('commit-store-failed', {code:'VMU_COMMIT_STORE_FAILED', message})` 且解析成 `null`**，不静默吞）；随后 `createDurableCommitLog({ store: resolvedCommitStore, clock, name: 'ballot' })`。此后全部使用点改名为局部 `queue`（`D:\_tmp\vmu-r8\rename-queue.mjs`，只作用 `ballot.js`，不做仓内文本管线）。
- **协议语义（已并入 docs/03 §2）**：ticket **由 store 分配**；`reserve` 落**意图**（`{ticket:null,at,name,op}`）**先于**生效；`complete` 把结果落在**意图的那个 ticket** 上；`recover()` 按 ticket 序幂等重放、**只重放未完成**。
  - ★ **实测事故（写进契约）**：store 若不保留**显式 ticket**（拿 `undefined` 就自己去分配新号），`complete` 的结果就落到另一个号上 ⇒ `recover()` **永远重放**。这是探针 v1 抓到的，不是推断。
- **缺席口径**（与既有 `durable:false` 一致，不假装）：无 store ⇒ `status().gate.durable === false`、`reserve() === null`、`recover()` 明说无可恢复；`status().seams.commitStore ∈ {false, 'object', 'call-time resolver'}` ＋ `commitStoreNote` 具名写出"怎么注入"。
- `kernel/index.js`：新选项 `commitStore`（:264），透传进 ballot 工厂（:1405）；`status().seams` 两项（:1881-1884）。
- `vibe-math-vmu.js`：`commitStore: () => …` —— 先 `config.commitStore`，再 `ctx.get('store')`，要求 `append()`＋`readAll()` 齐备；**因此开机后才挂载的 store，下一次 ballot 也能取到**（这正是"调用时解析"而非构造时快照的理由）。

## 2. B · 契约（`docs/03-interface-contract.md`）

- §2 新增 G6 块：谁注入／协议三步／缺席口径／上面那条"store 必须保留显式 ticket"的实测事故。
- §8 登记 **`VMU_COMMIT_STORE_FAILED`**（表述：注入的 `commitStore` 在调用时解析抛出 ⇒ 具名降级，记 `commit-store-failed` 并转非耐用，不静默吞）；§8.1 由 `scripts/generate-planned-codes.mjs --write` 重算（**275 码**），`--check` 复绿。

## 3. C · e2e 探针（`D:\_tmp\vmu-r8\commit-store.mjs`）

```
node D:\_tmp\vmu-r8\commit-store.mjs → === TOTAL pass=14 fail=0 ===   exit=0
```
覆盖：两个内核**共用一份** store ⇒ 两个 ballot 的票号 1、2 **不撞**；`reserve` 意图先落、`complete` 认领原号；**崩后 `recover()` 只重放未完成**那条；无 store ⇒ 上述缺席口径逐条成立。

## 4. ★ 收口：`vmu.paper.finalizer` 的静默回落（vmu-pack 审计、Lead 确认的缺陷）

- **症状（改动前实测）**：越域值（v5r 机构角色名）被 `indexOf(...) === -1 ? 'editor' : raw` **静默降级** ⇒ `finalize` 报 `VMU_NOT_PERMITTED "only the editor …"`，**没有任何"你的值非法"**。
- **改法**：`settings/schema.js` 的手写 row 由 `type:'string'` 换成**封闭枚举** `enum ['editor','contributor','any']`（def `editor`）；`kernel/paper.js` 的 `cfg()` 越域即
  `refuse('VMU_INVALID_ARGUMENT', 'vmu.paper.finalizer must be one of editor|contributor|any: <raw>', hint, {enforced:['vmu.paper.finalizer'], declared:FINALIZERS.slice(), value:raw})`。
  实测回执：`code=VMU_INVALID_ARGUMENT`、`declared=['editor','contributor','any']`、`enforced=['vmu.paper.finalizer']`、`value='nonsense'`。**`status()` 走同一 `cfg()` 判定 ⇒ 该面整体 fail-closed**（与 F13 的刻意 fail-closed 同调）。
- **副作用（已修，请 verify 复核）**：`tests/vmu-paper.test.mjs` §5 原来把"**未知值回落为 editor**"写成断言 —— 那正是被删掉的缺陷本身。已改为断言**按名拒**（`expectRejects(..., 'VMU_INVALID_ARGUMENT', …)`）。另外我第一版 hint 里写了 v5r 的机构角色名，被该套件的"**模块不得携带 v5r 角色名**"断言当场抓到（`forbidden` 含该词）⇒ hint 改为"pack 提供的头衔，从不是内核概念"。现 **37 passed / 0 failed**。

## 5. 尾账键：`vmu.meetings.leaveApprover`（跨面请求，由我落键）

- **起因**：`docs/08` §25.14 B② 写明"批准人读 `vmu.meetings.leaveApprover`（默认 `chair`，值域 `chair|office`）……**该键尚未在 schema（需 core 声明）**"，而 `audit-vmu-docs` G 段要求"文档里出现的每个 `vmu.*` 名**必须真在 `settings/schema.js`**"（`settings/planned.js` 顶替不了）⇒ 两门同时红（`audit-vmu-docs` 82/1、`vmu-planned-settings` 32/7）。
- **我的处理**：`settings/schema.js` 落 `enum ['chair','office']`、def `chair`、`who:'office'`；**只声明键，读者不落**（B② 本身标"未落"，读者在 08 面）⇒ `docs/04` 如实显示 **declared-but-not-wired（120 → 121）**；注释里写明"读取方落地前必须按名具名降级，不臆造"。
- **结果**：`vmu-planned-settings` **ALL GREEN（planned 114 → 113，与提交值一致）**、`audit-vmu-docs` **83/0**、`check-docs` **PASS**、`vmu-settings` **47/0**、settings 表 **1220 键（1099 wired / 121 declared-not-wired）**。

## 6. 转出项（**不在我写范围**，逐条带出处与代价）

1. **G7 只差核侧一行绑定** —— `kernel/ballotbox.js:242-247` 已有 `o.durableQueue` 包裹（intent → body → outcome；缺席则原样跑、不假装耐用），但 `kernel/index.js:950` 的 `createBallotBox({settings,bus,clock,log})` **没有传** `durableQueue` ⇒ 今天**恒走非耐用分支**（属具名降级，不是缺陷）。真要 `docs/08` §25.14 C 说的"ballotbox＋mailbox **同一份**耐用日志"，须在核侧建**一个** queue 实例并同时交给两面（mailbox 同形），否则两份日志各自发号、无法合流。≈6 行×2。**我没有代落**：要同时改 `kernel/mailbox.js`（非我范围），且"是否同源"是跨面决定。
2. **F51 `meetingOpen` 域标记** —— 全树 `kernel/**`＋`docs/**` **无 `meetingOpen` 符号**；会议自身的 `state:'open'` 只在内存记录（`kernel/meeting.js:148`），**没有投影/域标记** ⇒ 重启后"哪个会还开着"无耐久判定。owner＝会议面。
3. **B1–B4（8 键）** —— `vmu.prompt.compactThreshold|compactAfterRounds`、`vmu.paper.finalPaper|format|language|compilePdf`、`vmu.members.maxTempPerMember`、`vmu.tasks.memberMayRejectAssign`：**8/8 零 schema row**，因为读者分别在 `kernel/metrics.js|prompt`、`publication.js`、`members.js|recruit.js`、`tasks.js`（**都不是我的文件**）。只落键＝造 8 个 declared-but-unwired 孤儿 —— 与 §5 那条不同（那条是**文档已经点名**、不落键两门就红）。**要落就得同时落读者**：请指派这四个模块的 owner，或授权我连读者一起改。
4. **B5 `control/idle` 钩子** —— `kernel/bus.js` 的 HOOK_REGISTRY 有 `control/paused|resumed|heartbeat|scope-paused|scope-resumed|param-set|param-refused`，**没有 `control/idle`**；需 `kernel/control.js` 的 `idleState()` 产出 ＋ 登记。两个文件都非我范围。
5. **常驻断言**（→ vmu-verify；**本轮对齐后的实况，勿把已做的当未做**）：
   - ✅ **set `by`/`reason` 归因** —— 已落：`tests/vmu-set-attribution.test.mjs` **15/0**（含"非所有者具名拒**且不入台账**"、无 `by` ⇒ office 路径**明文披露**、`reason` 落 `lastRuntimeWrite`、委派路径）。
   - ✅ **F44 公告正路** —— **本轮已闭合**：`tests/vmu-turn-notice-source.test.mjs` **13/0**；关键是**真实形状**（`open()` 构造 turn ⇒ `assemble(turn)` 才出投递文本）—— R7 只到 3/6 正因只到"缝被消费"。
   - ✅ **F53 边界** —— R7 已落：`tests/audit-fs-purpose.test.mjs` **10/0**（含自探针与"种违规 ⇒ 红"的牙）。
   - ⏳ **F52 activity 语义**（one-shot／future-only／disposer 全分支）—— 唯一仍未落的一条；若 vmu-activity 的套件未覆盖，verify 下轮补。
   - ⏳ **commitStore e2e** —— verify **已同意搬进 `tests/`**，列为**下一轮首项**（本轮预算用于 A/B/C/D）；断言清单见 **§6.5**。落盘时建议加一条"控制字段非空"的 RULE E 前置。

### 6.5 commitStore e2e 交付清单（探针 → `tests/` 的 14 条）

- **探针（唯一来源）**：`D:\_tmp\vmu-r8\commit-store.mjs` —— `node D:\_tmp\vmu-r8\commit-store.mjs → TOTAL pass=14 fail=0`，`exit=0`。
- **桩**：`mkStore()`＝`rows` ＋ `append(rec)`（**给了显式 `ticket` 就保留，否则 `seq+=1` 分配**，并让 `seq` 追上更大的号）＋ `readAll()`（返回浅拷贝）。★ 契约：**`append` 分配缺失的号、保留显式的号**（docs/03 §2 已写）。
- **① 两个内核共用一份 store（4 条）**：k1 `gate.durable===true`；k2 同为 `true`；`rows` 里两进程的**未完成意图**都落进同一份日志（`≥2`）；票号**恰好 1 然后 2**（互异且单调）。
- **② 意图与生效之间崩（6 条）**：`reserve()` 先落**意图**且 `ticket===1`；崩后日志里是**一条未完成意图**；新进程 `recover()` 见到**恰好一条** `pending`；**再问一次仍是一条**（幂等，不重复）；补 `complete()` 后新进程 `pending===0`（**不二次施加**）；**结果行与意图行同号**（`doneRows[0].ticket===1`）。
- **③ 无 store（2 条）**：`gate.durable===false`（具名，不假装）；`status().seams.commitStore===false` 且 `commitStoreNote` 命中 `/no allocating store/`。
- **④ 开机后才挂载的 store（2 条）**：挂载前 `durable===false`；挂载后**下一个** ballot `durable===true`（证明是**调用时**解析，不是构造时快照）。
- **落盘时建议补**：RULE E 前置（控制字段非空 —— 免 vacuous pass）＋ 一条负向（`commitStore` 解析抛错 ⇒ `record('commit-store-failed')` 且 `VMU_COMMIT_STORE_FAILED`，面转非耐用）。

## 7. 验证（原样命令 ＋ 退出码）

```
node tests/vmu-kernel.test.mjs              → === VMU KERNEL: 175 passed, 0 failed ===        exit=0
node tests/vmu-entry.test.mjs               → === VMU ENTRY: 150 passed, 0 failed ===         exit=0
node tests/vmu-host.test.mjs                → === VMU HOST: 107 passed, 0 failed ===          exit=0
node tests/vmu-ballotbox.test.mjs           → === VMU BALLOTBOX: 13 passed, 0 failed ===      exit=0
node tests/vmu-turn.test.mjs                → === VMU TURN: 145 passed, 0 failed ===          exit=0
node tests/vmu-paper.test.mjs               → === VMU PAPER: 37 passed, 0 failed ===          exit=0
node tests/vmu-paper-consult.test.mjs       → === VMU PAPER CONSULT (C-30): 40 passed, 0 failed ===  exit=0
node tests/vmu-settings.test.mjs            → === VMU SETTINGS: 47 passed, 0 failed ===       exit=0
node tests/vmu-planned-settings.test.mjs    → ALL GREEN (planned=113, docs=27, 39/0)          exit=0
node tests/vmu-seam-params-consumed.test.mjs→ === SEAM PARAMS CONSUMED: 8 passed, 0 failed ===exit=0
node tests/vmu-meeting-parity.test.mjs      → 178 passed, 0 failed                            exit=0
node tests/vmu-metrics.test.mjs             → === VMU METRICS: 85 passed, 0 failed ===        exit=0
node tests/audit-vmu-docs.test.mjs          → === VMU DOCS AUDIT: 83 passed, 0 failed ===     exit=0
node scripts/check-docs.mjs                 → DOC LINT: PASS                                   exit=0
node scripts/generate-planned-codes.mjs --check → up to date (275 planned codes)              exit=0
node scripts/generate-vmu-settings-table.mjs --check → up to date (1220 keys)                 exit=0
node D:\_tmp\vmu-r8\commit-store.mjs        → === TOTAL pass=14 fail=0 ===                    exit=0
```

## 8. 过程记录 ＋ 我修改的**写范围外**文件（如实登记）

- **23:34–23:48 全树 ImportError 的归属**：`kernel/ballotbox.js` 当时处于**改到一半**的状态（内层 `cast` 已改名 `castBody`，而返回面 :544 仍写 `cast`）⇒ `createBallotBox()` 抛 `ReferenceError`，`vmu-kernel/entry/host/ballotbox/meeting-parity` 与 G6 探针**全部**当场红。我**没有越界改它**（先只读 `git diff` 确认那一行与我的改动无关 —— 我的改名脚本只作用于 `kernel/ballot.js`），并做了一次**不改盘**的内存 shim 验证（`D:\_tmp\vmu-r8\fix-loader.mjs`）确认"只有这一个标识符"；**23:48:34 owner 自己补齐 `const cast` 包裹后自愈**，我随后无 shim 复跑全绿（上表）。
- **写范围外唯一的文件改动**：`tests/vmu-paper.test.mjs`（+6/−4）—— §4 的断言翻转。原因是那条断言**锚定的正是被删的缺陷**，不改则 `vmu-paper` 恒红。**vmu-verify 已复核并接管（接受、无异议）**，理由与我一致："缺陷消失后锚点必须跟着走"（不是放宽）；`settings/schema.js` 的封闭枚举与 `kernel/paper.js` 的 `refuse(...)` 两半都被 verify 核过 ⇒ 两条注入路径（pack data 层／`vibe_vmu_set`）都拦得住；verify 复跑 `vmu-paper 37/0`、`vmu-paper-consult 40/0`，矩阵 §9.7.3 已由"真缺陷入册"改为"R8 内已修"。**负向词表（`forbidden` 含 v5r 角色名）按 verify 意见保留，不放宽**。除此之外我没有碰任何测试文件。
- 其余改动全在我名下范围：`kernel/ballot.js`（仅那一处 seam）、`kernel/index.js`、`vibe-math-vmu.js`、`kernel/paper.js`、`settings/schema.js`、`docs/03`、`docs/04`（生成器写出）。

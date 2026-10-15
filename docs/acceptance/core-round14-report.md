# Round 14 · task-106 · 真装配接上 `ballot`/`boxFor` ＋ 真机正/反向探针

**结论（一句话）**：**task-106 的装配缺口在 HEAD 上不存在** —— `kernel/index.js:1130` 从**轮 12（`248fb1e`）**起就已在传 `ballot: meetingBallot`；三条**真装配**（真 entry ＋ 真 loader）实测走通"提动议 ⇒ 中间件开箱＋懒绑 ⇒ 投票 ⇒ 回执 `{mirrored:true,reason:'cast',boxId:'bx-1'}`"，反向得**具名** `VMU_MEETING_BOX_UNWIRED`；`reason:'no-seam'` **在任何真装配里都到不了**（唯一入口是直接 `createMeetings({clock})` 不传 `ballot`）。**本轮我改动了 0 处 kernel 代码**——不是因为没做，而是因为**复测判定该改的东西已经在**；把"假前提"当成"缺口"去改，才会真的造出一个缺口。前提来源已定位到 `docs/10-packs.md:295` 一行**与同节 :299 自相矛盾**的陈旧 ❌ 行（docs 不在我名下，已具名交 Lead）。

- 状态：**A（复核后判定：已落，无编辑）／B（真机探针，已跑绿）／C（与 pack 对齐，已核）／D（本报告＋已发 `vmu-verify2`）**
- 纪律：未跑全量 sweep、未 `regen-all`、未 git；临时文件 `D:\_tmp`；内容型写入只用 Node/文件工具；未把 RULE E 基线推高（**我未新增任何常驻断言 ⇒ 基线仍 67**，本报告只**建议**一条供 Lead/verify 决定）。

---

## 0. 核验行：我读的是哪一版文件 / 哪一次运行

| 项 | 值 |
|---|---|
| 仓库 | `D:\wd\vibemath开发\Vibe-Mathematics`，分支 `main` |
| HEAD | `4e5be5aef28180514685a364baba405f94036bee`（`4e5be5a`），`git rev-parse HEAD` |
| 我名下 5 个文件的版本 | **= HEAD 原样**（`git status --porcelain` 里**不出现**它们；同刻脏文件只有 `scripts/audit-acquire-release.mjs`、`scripts/generate-planned-settings.mjs`、`tests/vmu-finally-falsify.test.mjs`、`vibe-math-vmu/docs/29-build-your-own-preset.md`） |
| SHA256 前 16 位（我实测的那一版） | `kernel/index.js` `63283918E6F0BD8D`／`kernel/meetings.js` `66A27455719B34FD`／`kernel/meetingmarker.js` `FE2F4310E8A79105`／`kernel/ballotbox.js` `6729194A109BBB0C`／`kernel/bus.js` `3A6F8F1AD1FEF57D`／`packs/v5r/middleware/motion-box.js` `718A8CEF32E73882` |
| 行数（同一次测量） | `index.js` 2206／`meetings.js` **1180**／`meetingmarker.js` 246／`ballotbox.js` 553／`bus.js` 750 |
| 真机探针运行 | `node D:\_tmp\vmu-r14-real-machine-probe.mjs` ⇒ **18 passed / 0 failed，exit=0**（本节下方 §2 有原样输出） |
| 辅助勘测运行（只打印事实、不断言） | `node D:\_tmp\vmu-r14-truth.mjs`（exit=0）、`node D:\_tmp\vmu-r14-holes.mjs`（exit=0） |

**"真机"的口径（实测，不是假设）**：本机 `DSH_HOME=C:\Users\admin\.dsh`、`DSH_PROFILE=desktop`，其中**没有**任何 `vibe-math-vmu` 目录（`Get-ChildItem $env:USERPROFILE\.dsh -Recurse -Directory -Filter vibe-math-vmu` ⇒ 空）⇒ 本机**不存在**已装机副本，`agent.cordis.yml` 的 `- id: vibe-math-vmu / name: './vibe-math-vmu.js'` 装的就是**仓库树本身**。因此"真装配"＝`vibe-math-vmu/vibe-math-vmu.js` 的 `apply()` ＋ 真 pack 装载器（`kernel/pack.js` → `kernel/loader.js`）＋ 真临时 root，即 `tests/vmu-motion-box.test.mjs:27-31` 用的同一条路径。

---

## 1. A 项裁决：装配缺口不存在于 HEAD（证据链三层）

### 1.1 版本层：`ballot` 是**轮 12**落的，不是"上一轮自称落了但复测没有"

```
$ git log --oneline -S "ballot: meetingBallot" -- vibe-math-vmu/kernel/index.js
248fb1e feat(vmu): round 12 - two kernel processes really talking, the motion-to-box policy split landed, the long tail closed by rule
$ git log --oneline -S "createBoxBinding" -- vibe-math-vmu/kernel/meetingmarker.js
248fb1e feat(vmu): round 12 - two kernel processes really talking, the motion-to-box policy split landed, the long tail closed by rule
```
两条 `-S` 都只命中 `248fb1e`（轮 12），**没有任何后续提交删除或改动过它** ⇒ 从轮 12 到 HEAD，`ballot` 一直在。

### 1.2 代码层：三处接线点（file:line，同一次 read）

| 位置 | 内容 |
|---|---|
| `kernel/index.js:1123-1129` | `const meetingBallot = { cast: (a) => … }` —— **内核自己的、零策略的适配器**：只做 `ballotbox.cast({boxId,by,choice})`，**不认识任何箱号/词表**；`!args.boxId` ⇒ 具名 `VMU_MEETING_BOX_UNMAPPED`（`:1126`） |
| `kernel/index.js:1130` | `meetingsRef.current = createMeetings({ settings: settingsView, bus, clock: guardedClock, log, durable: meetingsDomainSeam, ballot: meetingBallot })` —— **就是这一行**。探针 §0 直接从磁盘文本里取出该调用点（防止"我读的是注释/我以为在"）：<br>`createMeetings({ settings: settingsView, bus, clock: guardedClock, log, durable: meetingsDomainSeam, ballot: meetingBallot })` |
| `kernel/meetings.js:100 / 379 / 383-384 / 710 / 712 / 1068` | 面侧：签名收 `ballot`/`boxFor`（`:100`）⇒ `createBoxBinding({clock, initial: boxFor, refuse})`（`:379`）⇒ 面曝 `bindBox`（`:383`）＋ `boxBinding`（`:384`）⇒ 投票点 `mirrorVote({ ballot, boxFor: boxBinding.resolve(), … })`（`:710`）⇒ 回执 `receipt.ballot`（`:712`）⇒ `status().boxBinding` 自曝（`:1068`） |

**`boxFor` 不传是【有意】的，不是遗漏**：`kernel/meetingmarker.js:177-182` 记着 Lead 裁决 (i) ——"绑定是**方法**，不是清单字段；清单字段会变成**第二条并行通道**"，并且方法还能被换绑/解绑/自曝。策略侧（`packs/v5r/middleware/motion-box.js:74-75`）正是在 `meeting/motion` 上 `if (!meetings.boxBinding().bound) meetings.bindBox(boxForMeetingMotion)` 完成懒绑（实测 `source:'method'`，见 §2 P3）。

### 1.3 运行层：三条真装配的分离实测（原样回执）

| 装配 | 动议后 boxes | `boxBinding` | 投票回执 `receipt.ballot` |
|---|---|---|---|
| 真 entry ＋ 真 loader，`packs:['v5r']`（政策在） | **1** | `{bound:true,source:'method',at:1000,changes:1}` | **`{mirrored:true,reason:'cast',boxId:'bx-1',code:null}`** |
| 真 entry ＋ 真 loader，`packs:[]`（政策不在） | 0 | `{bound:false,source:null,at:null,changes:0}` | `{mirrored:false,reason:'no-binding',code:'VMU_MEETING_BOX_UNWIRED'}` |
| `createKernel({clock})` 裸装（无 entry、无政策） | 0 | `{bound:false,…}` | `{mirrored:false,reason:'no-binding',code:'VMU_MEETING_BOX_UNWIRED'}` |
| 负对照：`createMeetings({clock})`（**根本不传 `ballot`**） | — | — | `{mirrored:false,reason:'no-seam'}` ← **只有这一条路能到 `no-seam`** |

⇒ 任务描述里的"复测仍是 `no-seam`"**与 HEAD 的可执行事实不符**：`no-seam` 是 `kernel/meetingmarker.js:104-107` 的一个**真实分支**（所以这个说法可被证伪、不是空话），但它**不是任何真装配的输出**。`tests/vmu-resume-e2e.test.mjs:768/784-788` 正是用**直接 `createMeetings(...)`** 构造这个形状的（"15c with NO seam …），也就是说：**常驻门禁里 `no-seam` 只能被"绕过 entry 的手工装配"造出来**——这本身就是"真机上到不了"的反证。

### 1.4 "内核只 CALL，不自己开箱"（R1）已实测成立

裸装 `createKernel()`（无 entry、无政策）提出动议后 `ballotbox.status().boxes === 0`、投票同一具名 UNWIRED（§2 §3 R1a/R1b）⇒ **内核确实不自己开箱**；真机上那个箱子是 `packs/v5r/middleware/motion-box.js:69` 的 `ballotbox.open(...)` 开的（政策）。

---

## 2. B 项：真机探针（真装配＋真 loader，正/反两向）— 原样输出

脚本：`D:\_tmp\vmu-r14-real-machine-probe.mjs`（自带断言与退出码；仿本仓套件风格，末行 `=== VMU R14 REAL-MACHINE PROBE: N passed, M failed ===`）

```
$ cd D:\wd\vibemath开发\Vibe-Mathematics
$ node D:\_tmp\vmu-r14-real-machine-probe.mjs
§0 createMeetings call site on disk (kernel/index.js):
   createMeetings({ settings: settingsView, bus, clock: guardedClock, log, durable: meetingsDomainSeam, ballot: meetingBallot })

§1 FORWARD — real entry apply() + real loader, packs:["v5r"], vmu.packs.active:["v5r"]
   (1) after motion : boxes=1  boxBinding={"bound":true,"source":"method","at":1000,"changes":1}
   (2) vote receipt : {"mirrored":true,"reason":"cast","boxId":"bx-1","code":null}
   (3) BOX read-back (close, independent of the vote receipt):
        detail=[{"by":"m2","choice":"1"}] tally={"cast":1,"votes":1,"ranked":[{"option":"1","n":1}]}

§2 REVERSE — real entry apply() + real loader, packs:[] (no policy module declared)
   (1) after motion : boxes=0  boxBinding={"bound":false,"source":null,"at":null,"changes":0}
   (2) vote receipt : {"mirrored":false,"reason":"no-binding","code":"VMU_MEETING_BOX_UNWIRED"}
   (3) meetings.status().counters = {"votes":1,"ballotMirrorFailed":1}

§3 KERNEL-ONLY — createKernel() alone, no entry, no policy
   after motion : boxes=0
   vote receipt : {"mirrored":false,"reason":"no-binding","code":"VMU_MEETING_BOX_UNWIRED"}

§4 NEGATIVE CONTROL — the ONLY assembly that reaches `reason:"no-seam"`
   createMeetings({clock}) — i.e. NO `ballot` argument at all — vote.ballot = {"mirrored":false,"reason":"no-seam"}
   ⇒ every assembly that goes through the shipped entry (both §1 and §2) reported no-binding/cast, never no-seam.

§5 NAMED RESIDUALS — facts found while probing
   (5a) vote({motion:null}) tally = {"for":0,"against":0,"abstain":0}  counters.votes = 1  minutes entries = [{"at":1000,"kind":"vote","motion":null,"member":"m1","value":1}]
   (5b) createKernel({ballot, boxFor}) → vote.ballot = {"mirrored":false,"reason":"no-binding","code":"VMU_MEETING_BOX_UNWIRED"}  boxBinding = {"bound":false,"source":null,"at":null,"changes":0}

=== VMU R14 REAL-MACHINE PROBE: 18 passed, 0 failed ===
exit=0
```

### 2.1 18 条断言逐条（含**非空前置**，纪律 #5）

| # | 断言（非空前置 → 结论） | 结果 |
|---|---|---|
| P0 | **先落一行核验**：从磁盘读 `kernel/index.js` 文本，`createMeetings({…})` 调用点**真的**含 `ballot: meetingBallot` | ✅ |
| P1 | 装配出的 `vmu.meetings` **真的**发布了 `bindBox`/`boxBinding`（否则 P3 无从谈起） | ✅ |
| P2 | STEP 1 政策**真的开了一个箱**（`boxes===1`） | ✅ |
| P3 | 且**是模块自己**把接缝绑上的（`source==='method'`，不是内核） | ✅ |
| P4 | STEP 2 投票**真的镜像**：`{mirrored:true,reason:'cast',boxId}` | ✅ |
| P5 | ★ **回执 ⇔ 事真的做了，分开断言**：不看回执，改看**箱子自己的裁定** `ballotbox.close()` ⇒ `detail=[{by:'m2',choice:'1'}]`、`tally.cast===1` | ✅ |
| P6 | 且落进的是**政策选的那个箱**（boxId 一致） | ✅ |
| Q1 | 反向：没政策 ⇒ **不开箱**（`boxes===0`） | ✅ |
| Q2 | 且"没绑"在投票**之前**就可读（`boxBinding.bound===false`） | ✅ |
| Q3 | 反向回执**具名**：`{mirrored:false,reason:'no-binding',code:'VMU_MEETING_BOX_UNWIRED'}` | ✅ |
| Q4 | 会议**自己仍记录**该票（`ok:true`）——与"镜像被拒"是两件事 | ✅ |
| Q5 | 投票后**仍无箱**（内核没有为了让镜像成功而开后门开箱） | ✅ |
| Q6 | 缺环也被**计数**且可读：`status().counters.ballotMirrorFailed===1`（不只存在回执里） | ✅ |
| R1a | 裸装动议**不开箱**（R1：开箱是政策） | ✅ |
| R1b | 裸装投票同一具名 UNWIRED | ✅ |
| S1 | 负对照证明 `no-seam` 分支**存在**（结论可证伪，不是空话） | ✅ |
| T1 | 遗留 5a：open-ballot 回执 `tally` 与自记动作矛盾（**报告，不静默断言掉**） | ✅ |
| T2 | 遗留 5b：`createKernel` 无 `ballot`/`boxFor` 参数，多余实参被静默忽略（**报告**） | ✅ |

> **纪律 #2 的落实**：P4/P5 是**两个不同来源**的断言（回执 vs 箱子自身裁定）；Q3/Q6 让"缺环"**具名且可计数**；T1/T2 把实测到的两处不完美**留在报告里**而不是靠"这个用例不测它"来静默。

---

## 3. C 项：与 pack 对齐（`packs/v5r/middleware/motion-box.js`，pack 行不在我名下）

| 对齐点 | 核验（file:line） | 结果 |
|---|---|---|
| 挂的是**会议内**动议 `meeting/motion`，不是全所 `motion/propose` | `packs/v5r/middleware/motion-box.js:66` 的 hooks 键；`kernel/meetings.js:663` 的 `emit('meeting/motion', {at,meeting,motion,kind,emergency})`；`kernel/bus.js:89` 的注册行（`failure:'open', blockable:false`） | ✅ 一致 |
| 绑定路径＝**方法** `bindBox()`，懒绑 | `motion-box.js:74-75`；面侧 `meetingmarker.js:189-213` | ✅ |
| 选项词表是本 pack 政策（`['1','0']`＝会议侧 value 词表） | `motion-box.js:36` 与 `:19-23` 的 provenance 说明 | ✅ |
| 词表/`value` 传法不出错（`choice` 优先、`value` 兜底） | `meetingmarker.js:137-140`；`ballotbox.js:222/232` | ✅ |
| 模块真进了装载清单 | `packs/v5r/prompts/v5r-core.js:31/229-235`（`{id:'v5r.motion-box', module: V5R_MOTION_BOX}`） | ✅ |
| 常驻守卫在 | `tests/vmu-motion-box.test.mjs`（`:60-115`），实跑 **22 passed / 0 failed**，exit=0 | ✅ |
| **需要 pack 侧改动吗？** | **不需要**。`boxFor` 由政策经 `bindBox` 注入、箱由政策开 —— 全在 pack 侧，内核只 CALL | ✅ |

---

## 4. 双登记 / 零机制矩阵核验（纪律 #3）

本轮**未新建文件 ⇒ 不产生新的登记义务**。同时核验了本族**既有**文件确实双登记：

```
$ node -e "const f=require('./package.json').files; for (const x of ['vibe-math-vmu/kernel/meetingmarker.js','vibe-math-vmu/kernel/meetings.js','vibe-math-vmu/kernel/index.js','vibe-math-vmu/kernel/ballotbox.js','vibe-math-vmu/kernel/bus.js','vibe-math-vmu/packs/v5r/middleware/motion-box.js']) console.log((f.includes(x)?'IN  ':'MISS')+'  '+x); console.log('files[] count='+f.length)"
IN    vibe-math-vmu/kernel/meetingmarker.js
IN    vibe-math-vmu/kernel/meetings.js
IN    vibe-math-vmu/kernel/index.js
IN    vibe-math-vmu/kernel/ballotbox.js
IN    vibe-math-vmu/kernel/bus.js
IN    vibe-math-vmu/packs/v5r/middleware/motion-box.js
files[] count=678
exit=0
```
`installer.js:93` 的 preset 管理长数组同刻也含 `kernel/meetingmarker.js`、`kernel/ballotbox.js`、`packs/v5r/middleware/motion-box.js` ⇒ **`package.json files[]` ＋ `installer.js` 两侧都在**（docs/11 §6.1 的 ①②）。零机制矩阵的 `meetingmarker` 裁定行（`scripts/generate-zero-mechanism-matrix.mjs:160`，`EXPECT[].shape = 'ok 或 object'`）**未被触碰** ⇒ 无需改裁定行（该词表是闭集，裸 `object` 会 mismatch）。

---

## 5. 实测到的具名遗留（4 条，全部带测量，交 Lead 定夺）

1. **★ 陈旧文档行＝本轮假前提的来源（docs 不在我名下，我未改）**：`vibe-math-vmu/docs/10-packs.md:295` 的表格行 ④ 仍写
   > `④ ★ 镜像的 ballot 缝没装配 | ❌ 待 core | kernel/index.js:1118 createMeetings({ settings, bus, clock, log, durable }) 没传 ballot ⇒ mirrorVote 在 no-seam 就返回了（实测 receipt.ballot = {"mirrored":false,"reason":"no-seam"}）`

   而**同节 `:299`** 已写"**④ 已落**：`kernel/index.js:1118` 一带 `createMeetings({ …, ballot: meetingBallot })` ⇒ 真装配里未绑时回执是 **`no-binding`**（不再是 `no-seam`）"。**同一节自相矛盾**；`:292` 的 ① 行还引用着旧行号 `meetings.js:730`（现为 `:710`）。⇒ 建议属主把 ④ 行改成（我未落笔，只给文本）：
   > `| ④ | ★ 镜像的 ballot 缝（真装配） | ✅ 已落（轮 12 `248fb1e`，轮 14 复测） | `kernel/index.js:1130` `createMeetings({ …, ballot: meetingBallot })`（迟到绑定适配器，`cast` 只在投票时调用）⇒ 真装配未绑时回执 **`no-binding`/`VMU_MEETING_BOX_UNWIRED`**，**`no-seam` 不再可达**（负对照：直接 `createMeetings({clock})`）；正/反向真机实测见 `_handoff/vmu/core-round14-report.md` §2 |`
   并顺手把 `:292` 的 `meetings.js:730` 更新为 `meetings.js:710`。
2. **open-ballot 回执的 `tally` 否定了它自己记录的动作**（`kernel/meetings.js:693/708`）：`vote({motion:null})` 走 `target=null` ⇒ `tally` 硬编码 `{for:0,against:0,abstain:0}`（`:708`），**而同一调用** `counters.votes += 1`（`:707`）且 `minutes` 真写入 `{kind:'vote',motion:null,member:'m1',value:1}`（`:709`）。实测输出见 §2 §5a。机器消费者（数学研究里的自动化投票者）读 `tally.for===0` 会得到"无人赞成"，与回执自己的 `action:'vote'` 矛盾。**修它＝给会议加 open-ballot 容器并让 `close()` 计数（新功能，牵动 `close()`/快照/docs），不是一行** ⇒ 我**没有**半改（R10 教训：不落半接线模块），具名交 Lead 决定是否单开一条。
3. **`createKernel` 没有 `ballot`/`boxFor` 参数，多余实参被静默忽略**（实测 `createKernel({ballot, boxFor})` ⇒ 回执仍 UNWIRED，见 §2 §5b）。今天**唯一**注入路径是政策调 `bindBox()`。这是**有意**的（裁决 (i) 禁第二条并行通道），但**没有任何地方把"装配侧不能声明这两个缝"写成具名事实**：`docs/03-interface-contract.md:523` 仍写"（`VMU_MEETING_BOX_UNWIRED`）…经 `createMeetings({ boxFor })` 声明"——那句话描述的是**内核内部工厂**，容易读成"装配可传"。建议 docs 属主点明"装配侧只有 `bindBox()` 一条路"。
4. **`boxFor`/`ballot` 这一族不在 seam-table 门禁的视野里**：`scripts/generate-seam-table.mjs:26` 的 `SEAMS = ['clock','log','settings','bus','store','members','tasks','metrics','signer','deliver','fetchFn','timer','random','now','policy']` **不含 `ballot`/`boxFor`** ⇒ `audit-seam-reachability`（`:114-125` 的 `ABSENT_REASON_MISSING`／`SEAM_INCONSISTENT`）**结构上看不到这一族**。这解释了"为什么一个缝没接上能在文档里躺一轮而不被门禁抓"。（`scripts/` 不在我名下；且把它加进 `SEAMS` 会改 seam-table 的新鲜度检查 `:39 --write/--check`，属独立任务。）

**另有一条"被守住的程度"观察（不在我名下，未改）**：常驻守卫 `tests/vmu-motion-box.test.mjs:68-73` 断言的是**回执**（`vote.receipt.receipt.ballot.mirrored===true`），**没有独立回读箱子**。真正把"回执⇔事实"分开的那条读法在 §2 P5（`ballotbox.close({boxId}).detail/tally`）。若要把它变成常驻断言，建议把下面两行加进该文件（**我没有落笔**，因为 `tests/` 不在我写范围、且会改 RULE E 基线）：
```js
const sealed = k.ballotbox.close({ boxId: mirror.boxId })
ok(Array.isArray(sealed.detail) && sealed.detail.some((d) => d.by === 'm2' && d.choice === '1') && sealed.tally.cast === 1,
  'B5b. and the BOX ITSELF holds the vote (independent of the receipt that claimed it)', sealed)
```

---

## 6. 我改了什么：**0 处 kernel 编辑**（以及为什么"不改"是正确的）

| 候选改动 | 为什么**不做** |
|---|---|
| 给 `createKernel` 加 `ballot`/`boxFor` 参数并转发 `createMeetings` | (a) 违反 Lead 裁决 (i)（方法 vs 第二条并行通道）；(b) 会撞 `scripts/generate-seam-table.mjs:26` 的 `SEAMS` 白名单 ＋ `audit-seam-reachability` 的 `--check` 新鲜度（属 `scripts/`，不在我名下）；(c) **需求不存在**：真装配今天已走通（§1.3） |
| 在 `meetings.js` / `meetingmarker.js` 里加 `ballotSeam` 自曝／新族 | (a) `ballot` 由内核自己的适配器供给，**恒为 bound**（"缺环"只可能发生在 `boxFor` 侧，而 `boxBinding.bound` **已经**可读，`:1068`）；(b) `meetings.js` 只剩 **20 行**余量（1180/1200，`tests/audit-code-size.test.mjs:18 LIMIT=1200`，且 `:52/:56` 的 KNOWN backlog **只许缩不许长**）；(c) 与 `vmu-comms2`（task-108）**同轮共享这两个文件**，我一行不动即为零冲突（已互相通知，见 §8） |
| 顺手修 §5.2 的 open-ballot `tally` | 那不是一行：要给会议加 open-ballot 容器 ＋ 让 `close()` 计数 ＋ 改 docs ⇒ **会落成半成品**，正是 R10 禁止的形状。具名交 Lead |

⇒ **没有半成品**：本轮产出＝真机探针脚本 ＋ 本报告；kernel 树与 HEAD 一致（我名下文件 SHA256 均未变）。

---

## 7. 原样命令 ＋ 退出码（可复现）

```
node D:\_tmp\vmu-r14-real-machine-probe.mjs   → === VMU R14 REAL-MACHINE PROBE: 18 passed, 0 failed ===  exit=0
node D:\_tmp\vmu-r14-truth.mjs                → （无断言，打印 4 条真装配事实 + §0 调用点）            exit=0
node D:\_tmp\vmu-r14-holes.mjs                → （无断言，打印 竞态/参数/回读/unmapped 四组事实）      exit=0
node tests/vmu-kernel.test.mjs                → === VMU KERNEL: 175 passed, 0 failed ===                exit=0
node tests/vmu-meetings.test.mjs              → === VMU MEETINGS: 161 passed, 0 failed ===              exit=0
node tests/vmu-motion-box.test.mjs            → === VMU MOTION BOX: 22 passed, 0 failed ===             exit=0
node tests/vmu-resume-e2e.test.mjs            → === VMU GOAL1 E2E: 108 passed, 0 failed ===             exit=0

# 勘测（读，非门禁）
git log --oneline -S "ballot: meetingBallot" -- vibe-math-vmu/kernel/index.js   → 248fb1e
git log --oneline -S "createBoxBinding"      -- vibe-math-vmu/kernel/meetingmarker.js → 248fb1e
git rev-parse HEAD                                                             → 4e5be5aef28180514685a364baba405f94036bee
node -e "…require('./package.json').files…"                                    → 5 个文件全 IN，count=678   exit=0
Get-ChildItem $env:USERPROFILE\.dsh -Recurse -Directory -Filter vibe-math-vmu  → 空（无装机副本）          exit=0
```
（**未跑**）：`tests/run-tests.mjs` 全量 sweep、`scripts/regen-all.mjs`、任何 `git commit/push`。

---

## 8. 未做项（**具名**，不含半成品）

1. **`docs/10-packs.md:295` 的陈旧 ④ 行**（＋`:292` 的旧行号）：**未改**——`vibe-math-vmu/docs/**` 不在我的写范围（`task-106.writeScopes` 只有 5 个 kernel 文件 ＋ 本报告）。替换文本已在 §5.1 给出，请 Lead 派属主落笔。
2. **open-ballot `tally` 缺陷**（`kernel/meetings.js:693/708`）：**未修**（理由见 §6）。这是一条**真缺陷**，不是"未测到"。
3. **常驻守卫缺"回读箱子"那一条**（`tests/vmu-motion-box.test.mjs` 只断言回执）：**未加**——`tests/` 不在写范围且会推高 RULE E 基线；建议的两行断言在 §5 末尾。**因此"回执⇔事实分离"目前只有我的 `D:\_tmp` 探针在跑，尚未被常驻守住**（按本仓"能跑 ≠ 被守住"的纪律，这是一条**未闭合**项，必须写明）。
4. **seam-table 的 `SEAMS` 白名单不含 `ballot`/`boxFor`**（`scripts/generate-seam-table.mjs:26`）：**未改**（`scripts/` 不在写范围，且会牵动 seam-table 新鲜度门禁）。
5. **`createKernel` 无 `ballot`/`boxFor` 参数**是否要改（§5.3）：**判定不改**，但**交 Lead 确认**——若 Lead 的口径是"装配侧也要能声明"，那就是一次**跨文件**改动（`kernel/index.js` ＋ `scripts/generate-seam-table.mjs` ＋ seam-table 重生成），需要一个明确的写范围，不能在 task-106 里悄悄做。
6. **`docs/03-interface-contract.md:523`** 那句"经 `createMeetings({ boxFor })` 声明"是否要改成"装配侧只有 `bindBox()`"：**未改**（docs 不在写范围）。

---

## 9. 跨人协调（同轮共享 `meetings.js`/`meetingmarker.js`）

- 已回 `vmu-comms2`（task-108）：**我对 `kernel/meetings.js` 与 `kernel/meetingmarker.js` 本轮 0 编辑**，其 4 个锚点（`:105-109` 后 `isDeclared`、`:165 orderMode` 值域、`:379` 后 `orderControls`、`:596-613`/`:569`/`:382`）我一处不占，`tools/meeting.js` 我不碰。
- 同时提醒了他一条**硬约束**：`meetings.js` 现 **1180/1200**，其计划新增必然越限，而 `tests/audit-code-size.test.mjs:52/:56` 的 KNOWN backlog **只许缩不许长** ⇒ 新族应落**新文件**，别落进 `meetings.js`。
- 未与任何人产生 stale-write：本轮我名下文件**零写入**。

## 10. 请 Lead 裁决的两点

1. **接受"task-106 的 A 项判定为已在 HEAD 落成、无需编辑"**吗？（证据：§1 三层 ＋ §2 探针 18/0）若接受，请把 §5.1 那份 docs 替换文本派给 docs 属主——否则下一轮还会从同一行读出同一个假缺口。
2. **§6 表格里"是否给 `createKernel` 加 `ballot`/`boxFor` 参数"**：我判定**不加**（裁决 (i) ＋ seam-table 门禁 ＋ 需求不存在）。若 Lead 口径不同，请给出明确写范围（含 `scripts/generate-seam-table.mjs` 与 seam-table 重生成），我另开一轮做，不在本轮偷偷改。

★ **Lead 裁决（已收到）**：① **接受** A 项"已在 HEAD 落成、无需编辑"（"前提过期"而非缺口）；② **同意不加** `createKernel` 的 `ballot`/`boxFor` 参数，**不开 `scripts` 写范围**；③ 三条后续已派单：陈旧文档行→`vmu-assistant2`、"回执⇔事实"常驻断言→`vmu-verify2`、open-ballot 伪造 `tally`→**下一轮新任务**（含 `docs/03:523` 措辞与 `SEAMS` 白名单一并记入）。⇒ **本轮我到此为止，0 kernel 编辑。**

---

## 11. 追加核验（**2026-10-15 08:55:44 +08:00**，树已被同轮队友改动之后）

**为什么加这一节**：本报告 §0 的"我名下文件 = HEAD 原样"是**测量时刻**的事实；此后同轮队友落了笔，树变了。为避免 §0 变成一条**过期引用**，这里记下**同一套探针在改动后的树上**的复测结果（纪律 #6：写明是哪一次运行／哪一版）。

### 11.1 树在两次测量之间的变化（同 HEAD `4e5be5a`，脏文件不同）

| 文件 | §0 测量时 SHA256 前 16 | 08:55 测量时 SHA256 前 16 | 行数 | 谁改的 |
|---|---|---|---|---|
| `kernel/index.js` | `63283918E6F0BD8D` | **`63283918E6F0BD8D`（未变）** | 2206 | — |
| `kernel/meetings.js` | `66A27455719B34FD` | `DB3AF9F213DA5C3D` | 1180 → **1194** | `vmu-comms2`（task-108：`isDeclared`／`orderMode` 值域 ＋`'random'`／`orderControls`／`flow`·`overrideOrder`） |
| `kernel/meetingmarker.js` | `FE2F4310E8A79105` | `90EE2F851278BF05` | 246 → **487** | 同上（在文件末尾追加 order/flow 规则族） |
| `kernel/ballotbox.js` | `6729194A109BBB0C` | **未变** | 553 | — |
| `kernel/bus.js` | `3A6F8F1AD1FEF57D` | **未变** | 750 | — |

`git status --porcelain`（08:55）＝ `M scripts/audit-acquire-release.mjs`／`M tests/audit-vmu-docs.test.mjs`／`M tests/vmu-finally-falsify.test.mjs`／`M tests/vmu-motion-box.test.mjs`／`M vibe-math-vmu/docs/{03,10,22,27,29}`／`M vibe-math-vmu/kernel/meetingmarker.js`／`M vibe-math-vmu/kernel/meetings.js`／`M vibe-math-vmu/tools/meeting.js`。**其中 `kernel/**` 的两处全是 `vmu-comms2` 的，不是我**（我至今 0 kernel 编辑）。

### 11.2 我认证的那条缝在改动后的树上**仍然绿**（变更回归核验）

```
node D:\_tmp\vmu-r14-real-machine-probe.mjs  → === VMU R14 REAL-MACHINE PROBE: 18 passed, 0 failed ===  exit=0
node tests/vmu-kernel.test.mjs               → 175 passed, 0 failed   exit=0
node tests/vmu-meetings.test.mjs             → 161 passed, 0 failed   exit=0
node tests/vmu-resume-e2e.test.mjs           → 108 passed, 0 failed   exit=0
```
⇒ `vmu-comms2` 对 `meetings.js`/`meetingmarker.js` 的改动**没有**破坏 `ballot`/`boxFor` 接缝族：正向仍 `{mirrored:true,reason:'cast',boxId:'bx-1'}` ＋ 箱子独立回读 `cast===1`，反向仍 `VMU_MEETING_BOX_UNWIRED`、`boxes===0`，`no-seam` 仍只在负对照出现。

### 11.3 本报告 §5／§8 两条**已闭合**（由他人落笔）

- **§5 遗留 1（陈旧文档行）→ 已闭合**：`vmu-assistant2` 在 Lead 指派下落笔 —— `docs/10-packs.md` ④ 行改为终态（并注明读数具名归 core2：HEAD `4e5be5a` 探针 18/0）、① 行 `:730`→`:710` 且 `boxFor` 形改为 `boxBinding.resolve()`、② 行 `motion/propose`→`meeting/motion`；`docs/03-interface-contract.md:523` 删掉"经 `createMeetings({ boxFor })` 声明"的误导措辞，改明"装配侧只有 `bindBox()` 一条路，`createKernel` 无 `boxFor` 形参 ⇒ 多传实参被静默忽略"。**他自己 grep 复核的行与我的读数一致**；他另测 `vmu-motion-box`＝23/0（原因见本节下一条：B5b；与我 §1 的 22/0 差 1 条）。他的批次时刻：**2026-10-15 09:04:39**，`check-docs` PASS。
- **§8 未做项 3（"回执⇔事实"缺常驻断言）→ 已闭合**：`tests/vmu-motion-box.test.mjs:74-82` 新增 **B5b**（round 14 / task-107），用的正是本报告 §5 末尾我建议的那两行读法 —— `const sealed = k.ballotbox.close({ boxId })` ／ `ok(seats === 1 && sealed.tally.cast === 1, 'B5b. the BOX ITSELF holds that vote - read from the box ruling, independently of the receipt that claimed it')`。⇒ 我实测 `node tests/vmu-motion-box.test.mjs` ＝ **23 passed / 0 failed, exit=0**（该文件现为树上有修改状态）。**这条"未闭合项"至此闭合**，我那套读法不再只活在 `D:\_tmp`。**归因已核**（`tests/vmu-motion-box.test.mjs:74-76` 原文）：该断言上方的注释逐字点名了这条读法的出处——"the reading `vmu-core2` measured on the real machine (its probe, 18/0)" —— 与本人实测的 18/0 一致（引文准确，无夸大）。另注：`vmu-assistant2` 明确说明 `tests/**` 本轮**不是他改的**，与我查明的 task-107 归属一致。

### 11.4 一条**新的**硬预警（已传 `vmu-comms2`／Lead）

`kernel/meetings.js` 已 **1194/1200**（两次测量之间 +14 行）。`tests/audit-code-size.test.mjs:18 LIMIT=1200`、`:52/:56` 的 `KNOWN` backlog **只许缩不许长** ⇒ **只剩 6 行余量**，再往 `meetings.js` 加任何一处都会越过 1200 并使该门禁变红（且不能用"加进 KNOWN"解决，那是"长"）。后续若还有 `meetings.js` 侧改动，应先把某族搬出到新文件（`meetingmarker.js` 已在 487 行，尚有余量，但它同样受 1200 约束）。

### 11.5 本节的口径限定

§0 与 §11 是**两次**测量：§0 对应 HEAD 原样（`meetings.js 66A27455719B34FD`，22/0），§11 对应 08:55:44 的脏树（`DB3AF9F213DA5C3D`，23/0）。引用本报告时请**连版本一起引**（"HEAD `4e5be5a` ＋ 08:55 脏树"）。**HEAD 未推进**，我仍未 commit／push。

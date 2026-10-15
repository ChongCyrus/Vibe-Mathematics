# vmu Round 14 · `task-110` 收口"取得↔释放"门 — 报告

- 负责人：`vmu-activity2`（证伪 / 门禁守护人）
- 仓库 / HEAD：`D:\wd\vibemath开发\Vibe-Mathematics`，分支 `main`，`4e5be5a`（R13）
- 报告时间：**2026-10-15 08:53 +08:00**
- git 纪律：**未 commit / 未 push / 未做任何写操作**；只用 `git show` / `git grep` / `git diff --stat`（读）来固定"改前是什么样"。
- 结论一句话：**前任自称的"门有真执行点"是真的（RULE A `reallyRan:true, exit:0`），但它的"更宽的验证"当时确实没跑；我跑完之后抓到了三处空过——其中一处是本门自己发出去的【错误裁定词】**（`storepolicy.js` 被写成"不含取得"的 `不涉及`，而它恰是全内核**唯一**的取锁面）。三处都已按"具名 + 可复算判据"修掉，门现 **23/0 EXIT=0**。

---

## 0. 结论摘要

| # | 事实 | 判据 | 读数 |
|---|---|---|---|
| 1 | 门的四条谓词自证**真的会响/真的会静** | §0 现身读数 | 4 案例 8 个原始读数见 §2 |
| 2 | 真文件一行注入 ⇒ **文件级与调用级同时红** | §1 | `fileLevelNeedsFinally=true` + `callLevelSites=[".acquire("]` |
| 3 | 正向对照（`resume.js`）⇒ 扫描器不盲 | §1 | `sites=[".acquire("], hasFinally=true, needsFinally=false` |
| 4 | ★ **假绿 #1**：`storepolicy.js` 被裁 `不涉及`（"no lock taken inside a call"），而它**就是**取锁面 | 实测 + HEAD 证据 | `status().locks=1` / 二次取 `VMU_CONFLICT` / `release ⇒ 0`；HEAD 上 `locks.set/delete` 已在 |
| 5 | ★ **空过 #2**：裁定行**只在"该文件有取得位点"时被校验** ⇒ 0 位点的行的 `why` 从来没被机器读过 | 代码顺序 | R13 版本 `judged = files.filter(sites>0)`，`storepolicy` 位点 0 ⇒ 永不进 `verifyRuling` |
| 6 | ★ **空过 #3**：`他门已守` 的**正向方向被 `slice(0,3)` 切掉**（真门指针返回 `null` 没人断言） | 自证断言 | 已改为 `probes[4][1][3] === null` |
| 7 | 两级粒度齐备 | §2 / §3 | 文件级 172 走 / 6 有取得位点；调用级花括号配平抽 `write()` 体 |
| 8 | `records`/`store` 绊线进了新门（不是只写报告） | §5 / §5b | tripwire=2 文件 0 位点；authorities=1 == 声明表 |
| 9 | 登记四处 | §6 | `files[]` ✓；installer **不欠**（有据）；矩阵**不欠**（有据）；RULE A `reallyRan:true` |
| 10 | 与 `audit-enforced-consistency` **不合并** | §7 | 双向 0 提及；两门各自计数 |

---

## 1. 运行台账（★ 引用前先落一行核验：每条读数都写明读的是哪一次运行）

| 运行 | 原样命令 | 退出码 | 关键读数 | 证据 |
|---|---|---|---|---|
| **R1** 改前基线 | `node tests/audit-declaration-criterion.test.mjs` | **0** | `79 passed, 0 failed`；`RULE E fingerprints current=67 baseline=67`；`RULE A coverage[…audit-acquire-release…reallyRan:true, exit:0, mentionedOnly:false]` | `D:\_tmp\vmu-a2-declcriterion-r1.txt` |
| **R2** 改后 | `node tests/audit-declaration-criterion.test.mjs` | **1** | `78 passed, 1 failed`；唯一红＝`regen-all --check really runs green`；`RULE E fingerprints current=67 baseline=67`（**未涨**）；RULE A 同上 `reallyRan:true, exit:0` | `D:\_tmp\vmu-a2-declcriterion-r2.txt` |
| **R3** R2 那条红的归因 | `node scripts/regen-all.mjs --check` | **1** | `12/15 in sync`；FAIL `plan registry (settings/planned.js)`、`planned-code registry (docs/03-§8)`、`kernel index (docs/02)` | 见 §6.5 |
| **R4** 改后门（正常） | `node scripts/audit-acquire-release.mjs` | **0** | `23 passed, 0 failed`；`judged=6, rulings=9, tripwire=2, call-contracts=1, authorities=1, ruling-words=5` | `D:\_tmp\vmu-a2-acqrel-final.txt` |
| **R5** 改后门（自证，＝RULE A 真正跑的那条） | `node scripts/audit-acquire-release.mjs --selftest` | **0** | `14 passed, 0 failed` | `D:\_tmp\vmu-a2-acqrel-selftest-final.txt` |
| **R6** 相反开关 | `node scripts/audit-acquire-release.mjs --selftest --require-tree` | **0** | `23 passed, 0 failed`（`--require-tree` 压过 `--selftest`，活树照走） | 终端读数 |
| **R7** 我的 falsify 族 | `node tests/vmu-finally-falsify.test.mjs` | **0** | `26 passed, 0 failed`（改前 23 → 加 3 条新的"读型"断言） | 终端读数 |
| **R8** 矩阵 | `node scripts/generate-zero-mechanism-matrix.mjs --check` | **0** | `96 modules, 0 mismatches, 0 unregistered, 0 EXPECT_UNDECIDED, 9 probe-errors, 4 n/a` | 终端读数 |
| **R9** 矩阵闭集自证 | `node scripts/generate-zero-mechanism-matrix.mjs --selftest` | **0** | `ZERO-MECHANISM SELFTEST: GREEN (0 failed)`（含"期望写错 ⇒ 必红"） | 终端读数 |
| **R10** 取锁面活体读数 | `node -e "import('./vibe-math-vmu/kernel/storepolicy.js')…"` | **0** | `{a1:{ok:true,locked:true}, locksHeldAfterAcquire:1, a2:{ok:false,code:"VMU_CONFLICT"}, released:true, locksHeldAfterRelease:0}` | 见 §5.1 |

> R2 的 1 条红**不是本次改动造成的**（归因见 §6.5）；R2 与 R1 对照可证：**RULE E 指纹集合 67→67 一个没动**，RULE A 对 `audit-acquire-release.mjs` 的 `reallyRan:true, exit:0` 两次一致。

---

## 2. A · 更宽的验证与读数

### 2.1 谓词自证四条（§0，读的是 R4/R5 的这次运行）

```
reading (1) lock, no `finally`       : {"sites":1,"kinds":["lock"],"hasFinally":false,"needsFinally":true}
reading (2) same lock, with `finally`: {"sites":1,"kinds":["lock"],"hasFinally":true,"needsFinally":false}
reading (3a) timer, no `finally`     : {"sites":1,"kinds":["timer"],"hasFinally":false,"needsFinally":true}
reading (3b) listener, no `finally`  : {"sites":1,"kinds":["listener"],"hasFinally":false,"needsFinally":true}
reading (4a) comment only            : {"sites":0,"kinds":[],"hasFinally":false,"needsFinally":false}
reading (4b) string only             : {"sites":0,"kinds":[],"hasFinally":false,"needsFinally":false}
reading (4c) definition + real call  : {"sites":1,"kinds":["bare-lock"],"hasFinally":false,"needsFinally":true}
```

四条对号：
- **取得无 `finally` ⇒ 响**：(1) ✓；(3a)(3b) 定时器/监听器 ⇒ 响 ✓
- **同一取得有 `finally` ⇒ 静**：(2) `needsFinally:false` 且**位点仍被看见**（`sites:1`）⇒ 规则不是"任何 acquire 都红" ✓
- **注释与字符串 ⇒ 静**：(4a)(4b) `sites:0`（去噪走 `stripComments(…, { strings: true })`，D7）✓
- **定义不是调用**：(4c) 定义被跳过、真调用仍被计入（`kinds:["bare-lock"]`）✓ —— ★ 这条不是装饰：**假绿 #1 正是从这条逃生口漏过去的**（见 §5.1）
- 每条读数都带**四种状态**（sites / kinds / hasFinally / needsFinally），不是只印 `ok`。
- ★ 本轮**自己踩到并补掉**的空过：`他门已守` 那一行有 4 个子探针，原断言只查前 3 个（`probes.slice(0,5)` 里再 `r.slice(0,3)`），于是"真门指针 ⇒ `null`"这个**正向方向没被断言**。已改为 `probes[4][1][3] === null`，并加了中文标签说明。

### 2.2 对真文件一行注入（§1）⇒ 两级同时红

- 注入目标＝**真**文件 `vibe-math-vmu/kernel/storepolicy.js` 的 `write()` 体，方法＝纯文本 `mutateOnce`（`tests/_lib/falsify.mjs`）。
- 读数：`{"fileLevelNeedsFinally":true,"callLevelSites":[".acquire("]}`
- ⇒ **文件级**（`auditSource(...).needsFinally`）与**调用级**（花括号配平抽出的 `write()` 体内 `sitesOf(...)`）**同时红**。所以下面那些绿是"瞄着的绿"，不是"瞎了的绿"。
- 注入的字符串里同时放了 `locks.set(...)` —— 本轮新增的取锁面探测器和它一起被驱动，**不是**只测旧词表。

### 2.3 正向对照（§1）⇒ 扫描器不盲

- `kernel/resume.js` 读数：`{"sites":[".acquire("],"hasFinally":true,"needsFinally":false}`
- ⇒ 真有取得（F18 恢复锁）＋真有 `finally`，**两半都看见了**。若扫描器瞎，"这些文件很干净"就成了不知道的常量。

---

## 3. B · 两级粒度

| 粒度 | 实现 | 本次读数（R4） |
|---|---|---|
| **①文件级** | 走 `vibe-math-vmu/**/*.js`；`sites > 0` 且无 `finally` ⇒ 红并点名（除非豁免词**通过校验**） | `172` 走 / `6` 有取得位点（`host-spawn.js`、`kernel/activity.js`、`kernel/bus.js`、`kernel/mathjobs.js`、`kernel/resume.js`、`math-computation.js`）；fileLevel 问题 0 |
| **②调用级** | **花括号配平**抽函数体再扫（`bodyOf(code, marker)`），不是"文件里某处" | `storepolicy.js` 的 `const write = (a) => {` 体内 0 位点 ⇒ 绿；同一行注入后体内 `[".acquire("]` ⇒ 红 |

★ 两级都用**同一个纯函数** `judgeTree()`（见 §4），所以 §0d 的种违规证明证的是**活的规则**，不是规则的副本。

---

## 4. ★ §4.2 第九条：本门全部"跳过 / 豁免 / not-run / EXPECT_*"分支逐条

先修一处**结构性**问题：R13 的 §2/§3/§5 **只有在非 `--selftest` 时才跑**，而 RULE A 的执行点恰好只跑 `--selftest` ⇒ **"规则能红"这件事当时没有任何证人在场**。本轮把 §2/§3/§5 抽成纯函数 `judgeTree({files, rulings, contracts, tripwires})`，并加 **§0d**：用**同一个** `judgeTree` 跑 **9 组种违规**，每组必须红in它点名的那张表；再用**诚实夹具**证明 5 张表**全空**（防止"永远红"冒充"有牙"）。

`§0d` 读数（R4/R5）：

```
reading §0d honest fixture : {"judged":["kernel/guarded.js"],"unregistered":[],"rulingProblems":[],"fileLevel":[],"callLevel":[],"tripwire":[],"authorities":["kernel/storepolicy.js"]}
planted unregistered   : ["kernel/newface.js"]
planted rulingProblems : ["kernel/lying.js: declared `成对-finally` but the code has no `finally`"]
planted rulingProblems : ["kernel/records.js: TRIPWIRE: declared `不涉及` but now carries 1 acquisition site(s): timer@setTimeout("]
planted fileLevel      : ["kernel/records.js"]
planted tripwire       : ["kernel/records.js"]
planted callLevel      : ["kernel/writer.js `const write = (a) => {`: .acquire("]
planted rulingProblems : ["kernel/storepolicy.js: OWES-FINALLY: the lock authority GREW 1 timer/listener site(s) listener@addEventListener( …"]
planted rulingProblems : ["kernel/storepolicy.js: FALSE-不涉及: the file HANDS OUT locks (locks.set(, locks.delete() …"]
planted rulingProblems : ["kernel/ghost.js: STALE-ROW — the ruling names a file that is not in the scanned set …"]
```

逐条：

| # | 跳过/豁免/not-run 分支 | 它变红要什么条件 | 现状 |
|---|---|---|---|
| 1 | `ACQUISITIONS` 的 `skip`（定义不是调用） | 真调用仍须被计入 | §0(4c)：定义跳过 ∧ 真调用计入，**双向**已证 |
| 2 | `isSleepSite`（`睡式-无柄` 豁免） | 非 sleep 的定时器不得用它 | §0b：非 sleep 位点被拒；真 sleep 通过 |
| 3 | `if (!walkTree)`（`--selftest` 不走活树） | **相反开关 + 同规则种违规** | §0d（同一 `judgeTree` 9 组种植）＋ `--require-tree` 开关 ＋ `--selftest` 时**大声打印**"活树未走"（不再静默） |
| 4 | 裁定词 `成对-finally` | 无 `finally` 即拒 | §0b 拒；§0d `lying.js` 种违规 |
| 5 | 裁定词 `不涉及` | 出现位点 ⇒ 拒 | §0b 拒；§0d `records.js` 种违规（**一行同时点红 §4 裁定 ＋ 文件级 ＋ §5 绊线**） |
| 6 | 裁定词 `他门已守` | 无门 / 死指针 / 不守护该模块 ⇒ 拒 | §0b 四个子探针，**四个方向现在都被断言**（本轮补掉 `slice(0,3)` 空过） |
| 7 | 裁定词 `自持-取释面`（★ 本轮新增） | 无锁库 / 长出定时器监听器 / 另有取得 / 无门指针 ⇒ 拒 | §0c 五向 + §0d 两组种违规 |
| 8 | `TRIPWIRE_FILES` | 出现任一取得 ⇒ 红 | §5 活读数；§0d 种违规 |
| 9 | `DECLARED_AUTHORITIES`（★ 本轮新增） | **新取锁面出现 ⇒ 红；声明的面消失 ⇒ 也红** | §5b：`found==declared` 与反向 `stale` 双向断言 |
| 10 | ★ 裁定行的"从不被校验"（不是 continue，是**没进循环**） | 每一行都必须是 claim 并被校验；指向不存在文件的**陈旧行** ⇒ 红 | `judgeTree` 改为**校验每一行**并新增 `STALE-ROW`；§0d 种 `kernel/ghost.js` |
| 11 | `probes.slice(0,5)` 里的正向后三元素 | 正向方向须为 `null` | 本轮补：`probes[4][1][3] === null` |

---

## 5. ★ 证伪发现（三个；两个是"门在自己的绿里藏了假话"，一个是"门自己的断言空过"）

### 5.1 发现 #1（真缺陷，已修）：`storepolicy.js` 被裁 `不涉及`，而它是全内核唯一的取锁面

**它错在哪（逐条可复算）**

1. **HEAD（R13 提交 `4e5be5a`）上的原文**（`git show HEAD:scripts/audit-acquire-release.mjs`）：
   ```
   const TRIPWIRE_FILES = Object.freeze(['kernel/records.js', 'kernel/storepolicy.js', 'kernel/store.js'])
   for (const f of TRIPWIRE_FILES) RULINGS[f] = { word: '不涉及', why: 'holds only in-memory state: no lock taken inside a call, no timer, no listener (the round-11 five-column measurement)' }
   ```
2. **同一 HEAD 上的 `kernel/storepolicy.js`**（`git show HEAD:vibe-math-vmu/kernel/storepolicy.js`）：
   ```
   const holder = locks.get(name)
   locks.set(name, { by: String(args.by || 'anon'), at: clock() })
   const had = locks.delete(name)
   ```
   ⇒ "no lock taken inside a call" **是假的**：`acquire()` 这个**调用**里就 `locks.set` 了一把锁，并跨调用保持。
3. **活体读数（R10）**：`acquire({name:'a',by:'m1'}) ⇒ {ok:true, locked:true}`、`status().locks === 1`；二次 `acquire({name:'a',by:'m2'}) ⇒ 具名拒 VMU_CONFLICT`；`release({name:'a'}) ⇒ released:true`、`locks === 0`。
4. **门为什么看不见**：门的取得词表把 `acquire` 的**定义**（`const acquire = (a) => {`）跳过（这条跳过本身是对的，且被 §0(4c) 双向证明），于是该文件"取得位点 0" ⇒ `不涉及` 通过校验。**⇒ 跳过本身没错，错在词表里没有"这个文件就是取锁面"这个形状。**
5. **它确实不需要 `finally` —— 但理由完全不同**：释放是**另一次 API 调用**（`finally` 跨不了两次调用），而有限重试是**虚拟时钟算术**（`waitedMs = backoffMs × attempts`，实测 25×3=75，见 `tests/vmu-storepolicy-falsify.test.mjs:189-190`），**没有定时器句柄**。⇒ 诚实的词是"**自持-取释面**"，不是"什么都不涉及"。

**怎么修的（都在我的写范围内，未动 `kernel/`）**

- 新增**第五个裁定词** `自持-取释面`（**闭集仍在**：`RULING_WORDS` 5 个，词表外的词一律拒），由 `verifyRuling` **机器校验四件事**：① 真有锁库（`locks.set`/`locks.delete`）；② 自己不另有取得位点；③ **没有**定时器/监听器；④ 点名 ≥1 个**存在且真提到该模块**的门。
- `TRIPWIRE_FILES` 收成 `['kernel/records.js', 'kernel/store.js']`（**与任务书的"records/store 绊线"一致**），`storepolicy.js` 移到它自己的诚实行 + 门指针 `tests/vmu-storepolicy-falsify.test.mjs`。
- `不涉及` 的含义**收紧成两段**："没有取得位点" **且**"没有可发出去的锁库"；一个发锁的文件再写 `不涉及` ⇒ 红，报文 `FALSE-不涉及: … the honest word is '自持-取释面'`。
- **"条件出现即红"（任务 C 的原话）真的接上了**：该取锁面一旦**长出定时器或监听器**，`verifyRuling` 返回 `OWES-FINALLY: … a lock held across a timer/listener can leak on the throwing exit, so a 'finally' is owed NOW`。§0c(2) 与 §0d 各有一组种植证明它会红。
- 新增 **§5b 取锁面绊线**：`tree.authorities`（走真树实测）必须**等于**声明表 —— 新的取锁面出现 ⇒ 红，声明的面消失 ⇒ 也红。
- `tests/vmu-finally-falsify.test.mjs` 里 R11 的**同一句错误措辞**也一并改了：现在**逐面读数** —— `records.js`/`store.js` 才是不取不放（`lockStore` 0 个），`storepolicy.js` 是**放锁面**（`locks.set` + `locks.delete`，0 取得位点，无 `finally`），并写明"为什么不欠 `finally`"。★ 这三条新断言全部用**标量**比较，未引入新的 `.every` 接收者 ⇒ **RULE E 指纹 67→67 未动**（R1 vs R2 实测）。

### 5.2 发现 #2（空过，已修）：裁定行**只在"该文件有取得位点"时**才被校验

- R13 版本：`const judged = files.map(...).filter(r => r.sites.length > 0)`，随后**只**对 `judged` 里的行调 `verifyRuling`。
- ⇒ `storepolicy.js` 位点 0 ⇒ **它的裁定行的 `why` 从来没被机器读过一次**。`不涉及` 这个错误词之所以能挂两轮，一半原因在这里（另一半在 §5.1 的词表缺形状）。
- 已修：`judgeTree` **校验每一行**（行本身就是 claim），并新增 `STALE-ROW`（行指向的文件不在扫描集合里 ⇒ 红）—— 这条也把"豁免表悄悄留一条给已删文件"堵上了。
- 证明：§0d 的 `kernel/ghost.js` 种违规；同时诚实夹具 5 张表全空（说明"校验每一行"没有把干净树弄红）。

### 5.3 发现 #3（本门自己的断言空过，已修）

见 §2.1 末尾：`他门已守` 的正向方向被 `slice(0,3)` 切掉，`verifyRuling(guarded, …)` 返回问题字符串也不会有人吭声。已改为必须 `=== null`。

---

## 6. D · 登记（四处，逐条给"欠/不欠"的依据，不靠断言）

### 6.1 `package.json files[]` —— ✓ 已在

```
node -e "const p=require('./package.json');…"  ⇒  {"inFiles":true,"total":678,"index":589}
```

### 6.2 installer 管理清单 —— **不欠**（有据，不是"我觉得"）

- `git grep -n "scripts/" -- installer.js` ⇒ **exit 1（0 命中）**：`installer.js` 的 `PRESETS[].files` 只列**预设载荷**（`agent.cordis.yml`、`kernel/*.js`、`docs/*`、`tools/*`、`packs/*`），**没有 `scripts/`**。
- `tests/audit-installer-policy.test.mjs:254` 的判定式：
  ```js
  const shippedFiles = (pkg.files || []).filter((f) => f.startsWith(p.src + '/')).map(...)
  ```
  vmu 的 `p.src = 'vibe-math-vmu'`（`installer.js:88`）。`scripts/audit-acquire-release.mjs` **不以 `vibe-math-vmu/` 开头** ⇒ 不在 `shippedFiles` 里 ⇒ 该门不会要求它进管理清单。
- ⇒ **结论：仓库级开发门禁脚本随预设出货的命题为假，故不欠 installer 行。**（若将来有人把 `scripts/` 也纳入 `pkg.files` 的 `vibe-math-vmu/` 前缀下，上面那条判定式会自动开始要求它 —— 那是自动的，不需要人记。）

### 6.3 零机制矩阵裁定行 —— **不欠**（★ 期望词表是闭集，我没往闭集里加任何词）

- 矩阵的行**来源就是内核模块**：`generate-zero-mechanism-matrix.mjs:310` `readdirSync(KERNEL).filter(f => f.endsWith('.js'))`，`KERNEL = vibe-math-vmu/kernel`。它是**内核模块**的行为普查，不是门禁脚本的注册表。
- 它的规则是"**模块出现了却没有裁定行 ⇒ 必红**"（`:288`）。本轮我**没有新增内核模块**，也**没有改任何内核模块**（§6.5 的 diff 证据：我改的 2 个文件是 `scripts/` 与 `tests/`）。
- 读数：R8 `--check` ⇒ `96 modules, 0 mismatches, 0 unregistered, 0 EXPECT_UNDECIDED`，**EXIT=0**；R9 `--selftest` ⇒ GREEN（其中"期望写错 ⇒ 必红"证明**闭集是机器强制的**）。
- ⇒ **不欠新行。** ★ 需要 Lead / verify 裁定的一点（我**不能**在写范围内做）：若本轮口径是"每个新门禁都要在矩阵里有一行"，那需要给生成器加一个**非内核的注册表**（今天不存在，`walk` 只走 `kernel/`）—— 那是**改生成器**，不是登记，且会牵动 `docs/11` 的生成区（须 `--write` + 文档再生成），本轮任务明令不跑 `regen-all`，故留作显式待决，**不硬造一行**。

### 6.4 RULE A 执行点 —— ✓ **真的是"跑过"，不是"提到过"**

- 接线在 `tests/audit-declaration-criterion.test.mjs:598`：`runSelfProof('audit-acquire-release.mjs', '--selftest')`，紧随其后断言 exit 0。
- 运行证据（R1 **与** R2 两次一致）：
  ```
  EXECUTED: node scripts/audit-acquire-release.mjs --selftest ⇒ exit=0 | === ACQUIRE↔RELEASE: 14 passed, 0 failed ===
  RULE A coverage: [… {"script":"audit-acquire-release.mjs","flag":"--selftest","reallyRan":true,"exit":0,"mentionedOnly":false} …]
  ```
- ★ 本轮把该执行点的**覆盖面**也扩大了：`--selftest` 现在跑 **14** 条（原 6 条），新增的 §0c/§0d 让 RULE A 那次 `--selftest` **也**覆盖了"真树规则能红"这件事（此前 §2/§3/§5 在 `--selftest` 下完全不走）。**"别只写不跑"在 R12 被抓过一次，这条现在是"跑了而且跑得更宽了"。**
- ⚠ **留给 `vmu-verify2` 的 1 行注释漂移**（不在我的写范围，未改）：`tests/audit-declaration-criterion.test.mjs:592-597` 的说明文字仍写"five refused directions of the closed ruling vocabulary"，而词表已由 4 词变 5 词、拒绝方向变 6 向。**只是说明文字**，判定逻辑与执行不受影响。

### 6.5 附：R2 那条红是什么（归因，不是辩解）

R2 的 `FAIL regen-all --check really runs green` **不是本次改动**：

- `git diff --stat`（同一时刻）：
  ```
   scripts/audit-acquire-release.mjs              | 315 ++++-----   ← 我
   tests/vmu-finally-falsify.test.mjs             |  35 ++-          ← 我
   vibe-math-vmu/kernel/meetingmarker.js          | 242 +++++++++++++  ← 并发同事
   vibe-math-vmu/kernel/meetings.js               |   8 +-           ← 并发同事
   vibe-math-vmu/docs/10-packs.md                 |   1 +
   vibe-math-vmu/docs/22-academic-operations.md   |   2 +-
   vibe-math-vmu/docs/27-pack-folder.md           |  70 +++++-
   vibe-math-vmu/docs/29-build-your-own-preset.md |  21 +-
  ```
- R3 `node scripts/regen-all.mjs --check` ⇒ `12/15 in sync`，三条 FAIL 分别指向 `settings/planned.js`、`docs/03-§8`、`docs/02` —— 读的都是**内核模块与设计卷**，正是上表那两栏**并发未提交改动**；我的两个文件既不在内核也不在文档/设置里。
- 写完本报告后再看一次工作树，**并发同事又写进了三个文件**：`tests/audit-vmu-docs.test.mjs`、`tests/vmu-motion-box.test.mjs`、**`vibe-math-vmu/docs/03-interface-contract.md`**、`vibe-math-vmu/tools/meeting.js` —— 其中 **`docs/03` 正是第二条 FAIL（`planned-code registry (docs/03-§8)`）所读的那一卷**，归因**闭环**。
- 我的两处改动**不可能**影响它们（一个是 `scripts/` 下的门禁脚本，一个是 `tests/` 下的测试）。⇒ 结论：**那 1 条红是共享工作树上的并发写入，不是本次任务的红**；RULE E 指纹与 RULE A `reallyRan` 在两次运行里**完全一致**，可交叉验证。
- 复核命令（给验证者）：`git diff --name-only` ⇒ 我的范围恒为 `scripts/audit-acquire-release.mjs` + `tests/vmu-finally-falsify.test.mjs` 两行；其余全部来自并发同事。

---

## 7. E · 与 `audit-enforced-consistency` 分工不合并（不进同一计数器）

- **双向 0 提及**：
  - `git grep -c "audit-acquire-release" -- tests/audit-enforced-consistency.test.mjs` ⇒ **exit 1（0 命中）**；
  - 本门代码里对它的**唯一**提及是一段注释（`SEPARATION OF INSTRUMENTS`），无任何共享变量/共享计数。
- 两门的判据不同：`audit-enforced-consistency` 判**声明↔实现**（`enforced`/`fired` 元规则，5 条造错自证）；本门判**取得↔释放**（位点 / `finally` / 裁定词）。
- 本门**自己**的计数只有 `passed` / `failed`（R4：`23 passed, 0 failed`；R5：`14 passed, 0 failed`），不并入任何别的门的数字。★ 两者若合一个计数器，就会"互相掩护成 0"—— 这条从 R13 立项时就写进了本门头部，本轮复核依旧成立。

---

## 8. 与前任自述的核对

前任（被中断）自称：**"门有真执行点：RULE A `reallyRan:true, exit:0`，正在跑更宽的验证"**。

- 前半句 **核实为真**（R1 实测：`reallyRan:true, exit:0, mentionedOnly:false`）。
- 后半句 **当时尚未完成**：§2/§3/§5 的活树读数与三个空过都是在我这次跑完之后才出现的。他没留下错误的结论 —— 只是没收口。

---

## 9. 未做 / 交给谁

| 事项 | 为什么没做 | 交给谁 |
|---|---|---|
| `tests/audit-declaration-criterion.test.mjs:592-597` 的说明文字（"five refused directions"） | **不在我的写范围**；且只是注释，不影响判定 | `vmu-verify2`（该门归他） |
| 零机制矩阵是否需要"门禁脚本"行 | 需要**改生成器**引入非内核注册表 + 文档再生成，越出任务硬约束（不准 `regen-all`） | **Lead 裁定**（见 §6.3） |
| `regen-all --check` 的三条红 | 并发同事未提交改动所致（§6.5），修它等于改别人的文件 | 对应 owner（`meetingmarker.js` / docs 的改动者） |
| `tests/audit-acquire-release.mutants.mjs` | 任务 A–F 未要求；门的牙已由**内联** §0/§0c/§0d 种违规自证（跑在 RULE A 的执行点上） | 如需"独立变异族"再立项 |
| T0 / T1 全量门禁 | 任务明令归 Lead | Lead |

---

## 10. 清理（★ 只认本次显式创建的精确路径；**未删除任何文件**）

本次在 `D:\_tmp` 显式创建 **4 个**文件（精确路径，全部是**我**的运行日志，留作证据）：

1. `D:\_tmp\vmu-a2-declcriterion-r1.txt`
2. `D:\_tmp\vmu-a2-declcriterion-r2.txt`
3. `D:\_tmp\vmu-a2-acqrel-final.txt`
4. `D:\_tmp\vmu-a2-acqrel-selftest-final.txt`

- **未执行任何删除**（因此不存在"用前缀/通配误删他人探针"的风险）；`D:\_tmp` 目录本身**不是**本次创建，未动。
- falsify 族的变异副本由库自己写进 `D:\_tmp` 并删回（`vmu-finally-falsify` 断言 `leftovers.length === 0`；R7 通过）。
- **未新建任何 `tests/*.mjs`** ⇒ 作业集合未变（`docs/11` 第 11 条：扫描期间不得改变作业集合）。

---

## 11. 本次变更文件（仅 2 个，均在我的写范围内）

1. `Vibe-Mathematics/scripts/audit-acquire-release.mjs`
   - 新增第五个闭集裁定词 `自持-取释面` + 机器校验四件事 + `OWES-FINALLY`/`FALSE-不涉及` 两条具名拒绝；
   - `TRIPWIRE_FILES` ⊂ {records, store}；取锁面转入独立诚实行（带门指针）；
   - §2/§3/§5 抽为纯函数 `judgeTree`，**校验每一行** + `STALE-ROW`；新增 §0c/§0d 种违规自证；
   - §0 每案例打原始读数；§5b 取锁面闭集绊线；`--require-tree` 相反开关；`--selftest` 的跳过不再静默。
2. `Vibe-Mathematics/tests/vmu-finally-falsify.test.mjs`
   - 头部加了 R14 更正说明；
   - `tripwireScan` 增加 `lockStore`（`locks.set`/`locks.delete`）读数；
   - 把"三个面都不涉及"改成**逐面读数**：`records.js`/`store.js` 不取不放、`storepolicy.js` 是放锁面（3 条新断言，全标量，RULE E 指纹未动）。

---

## 12. 一句话给验证者

**门有牙，而且这次咬到了自己**：`storepolicy.js` 是全内核唯一的取锁面（`locks.set`/`locks.delete`，`status().locks` 会数、二次取锁 `VMU_CONFLICT`），却被本门在 R13 里裁成"什么都不涉及"——因为词表里没有"这个文件就是锁本身"这个形状，且**0 位点的裁定行从来不进校验循环**。现在它有了自己的词（`自持-取释面`）、自己的门指针、自己的绊线；**"再长一个定时器/监听器 ⇒ `finally` 立刻欠上"** 是机器可复算的红（`OWES-FINALLY`），不是注释。

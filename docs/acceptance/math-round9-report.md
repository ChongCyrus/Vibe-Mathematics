# Round 9 · `task-71` 交账（Lean 杀内核演练 ＋ 中间检查点裁决 ＋ 同号覆写）

**负责人**：`v5r-reader-b`。**判据**：`task-71`（A/B/C/D）；上一轮边界清单见 `13-goal5-e2e.md` §3。
**红线**：`math-computation.js`／`math-engines.js` **一字未动**。未跑全量 sweep、未 `regen-all`、未 git；临时文件只在 `D:\_tmp`（脚本已删）；内容型批量改写只用 Node。

---

## 0. 一句话
Lean 面的"杀内核"演练**跑通**并**再抓出第三个真缺陷**（`running` 镜像没带内容哈希 ⇒ Lean 的崩溃续算实际上是坏的，恒走分支 ③）；同号覆写被**写实并把双跑挡住**（恢复租约，实测 3 pids → 2 pids）；中间检查点给出裁决：**落"携带层"（`resumeFrom` 不透明令牌），不落"解释层"（检查点语义属引擎）**，并写清代价与改判条件。

---

## A. Lean 面杀内核（真实 Lean 4.34.0）
```
node D:\_tmp\r9-lean-e2e.mjs → === R9 LEAN E2E :: ALL ASSERTIONS PASSED (spawns=3, mirrors=4) === EXIT=0
```
- **六态**：`queued|running|settled|failed|timeout|interrupted`（n=6）；镜像普查 `{interrupted:1, settled:3}` ⊆ 六态。
- **分支 ②**（4000 条 theorem，真机编译 ~12.6 s；worker 进程被 SIGKILL）：镜像 `running(attempts=1)` ⇒ 新实例 `interrupted-then-requeued` ⇒ **真重编译到 `settled`**（`passed=true`、`exitCode=0`、`hashUnchanged=true`、`attempts=2`）。
- **分支 ①**（并发 1 时排队的作业镜像停在 `queued`）⇒ `requeued` ⇒ 真跑完（`settled`）。
- **分支 ③**（崩溃后改文件）⇒ `interrupted-no-rerun`／`hash-mismatch`、**0 spawn**。
- **分支 ④**：`adopted`（`passed` 恢复、0 spawn）；**改构建上下文** ⇒ `kept`／`build-context-changed`（拒绝继承 `passed`）。

**★ 真缺陷 ③（本轮修）**：`runOne` **先写 `running` 镜像、后读哈希** ⇒ 磁盘记录 `hashBefore:null` ⇒ 崩溃后内容比对恒不匹配 ⇒ **恒走分支 ③**。修法：**先读哈希再写镜像**（`kernel/lean.js`）。四库演练看不出它，因为计算面恢复依据的是**请求指纹**（argv/stdin/seed 一直在镜像里）。
**附带**：`lean.submit` 现在也接受**调用方指定的 `jobId`**（与计算面一致；被指定的号会 `observe`，计数器不会重发它）——跨进程演练需要可寻址的作业号。

## B. 中间检查点裁决（落"携带"，不落"解释"）
- **已落（最小形状）**：`submit({resumeFrom})` 的不透明令牌 → 子进程 **env `VMU_RESUME_FROM`** → 镜像 `request.resumeFrom` → **恢复原样重发**；回执新增 `resumedFrom`；令牌进**请求指纹**（换令牌 ⇒ 分支 ③，**不静默续算**）；`admission().checkpointing` 具名"未实现"。
- **未落**：分段提交、运行中读流抓检查点、`checkpoint:{token,at}` 镜像字段、按检查点裁剪重跑范围。
- **理由**：语义属**引擎**（内核无法验证令牌真的意味着可续）；成本 **60–100 行内核 ＋ 每引擎 demo ＋ 一组"续算 ≡ 一次算完"对照测试**；携带层已把策略钩子放好。
- **改判条件**：出现真实可续引擎且**单作业时长 ≥ 作业预算量级**时按四件套一次做完。
- 测试：`tests/vmu-mathjobs-persist.test.mjs` 新增 1 条（令牌在镜像＋env＋恢复重发＋换令牌 ⇒ ③）。

## C. "占号之后的覆写"（写实 ＋ 最小修复）
- **行为写实**：独占创建**只用于每个 jobId 的第一次写**；之后（同/跨进程）都是**普通覆写** ⇒ **last-writer-wins**。实测：伪造 `running` 镜像后两个实例同时 `recover()` ⇒ **同一作业跑了 2 次**（`distinct pids: 3`）。
- **最小修复：恢复租约**（`createJobMirror.takeLease/releaseLease`，mathjobs ＋ lean 两个面都接）：重排前取 `<jobId>.lease`；未过期 ⇒ 让位（具名 `lease-held`）；陈旧 ⇒ 可抢；恢复完即释放；TTL ＝ `max(120 s, 作业预算 + 30 s)`（正在跑的恢复不会被抢）。
- **实测**：修前 `distinct pids 3` → 修后 **`distinct pids 2`**（1 原始 ＋ 恰好 1 次恢复），另一个实例 `lease-held`（`enforced:true`）。
- **诚实边界**：非共识锁（TTL 是时钟猜测；无独占原语 ⇒ 具名 `unenforced`）；恢复者自身崩溃仍"至少一次"。
- 测试：`tests/vmu-mathjobs-persist.test.mjs` 新增 3 条（并发恢复只许一个跑、恰好 1 个子进程；陈旧租约被抢；无独占原语 ⇒ `unenforced` ＋ admission 具名）。

## D. 文档/结论
`13-goal5-e2e.md` 已更新（§3 边界逐条改判 ＋ 新增 §5「Round 9 增补」：A/B/C 全节）；`docs/09 §4.3` 与 `docs/15 §14.4` 同步（真缺陷 ③、恢复租约、`resumeFrom` 携带层与 `checkpointing` 边界）。结论发 vmu-verify。

---

## 原样命令 ＋ 退出码（全绿）
```
node D:\_tmp\r9-lean-e2e.mjs                   → === R9 LEAN E2E :: ALL ASSERTIONS PASSED (spawns=3, mirrors=4) === EXIT=0
node D:\_tmp\r9-overwrite.mjs                  → 修复前后对比读数（3 pids → 2 pids）                          EXIT=0
node tests/vmu-mathjobs-persist.test.mjs       → === VMU MATHJOBS PERSIST: 21 passed, 0 failed ===             EXIT=0
node tests/vmu-mathjobs.test.mjs               → === VMU MATHJOBS: 10 passed, 0 failed ===                    EXIT=0
node tests/vmu-mathjobs-exclusive.test.mjs     → === VMU MATHJOBS EXCLUSIVE: 5 passed, 0 failed ===            EXIT=0
node tests/vmu-lean.test.mjs                   → ALL GREEN (passed=13, failed=0)                              EXIT=0
node tests/vmu-lean-jobs.test.mjs              → === VMU LEAN JOBS: 13 passed, 0 failed ===                   EXIT=0
node tests/vmu-job-cancel.test.mjs             → === VMU JOB CANCEL: 9 passed, 0 failed ===                   EXIT=0
node tests/vmu-subprocess-admission.test.mjs   → === VMU SUBPROCESS ADMISSION: 5 passed, 0 failed ===          EXIT=0
node tests/audit-enforced-consistency.test.mjs → === VMU ENFORCED CONSISTENCY: 355 passed, 0 failed ===       EXIT=0
node tests/audit-vmu-orphan-methods.test.mjs   → === VMU ORPHAN-METHOD AUDIT: 4 passed, 0 failed ===           EXIT=0
node scripts/check-docs.mjs                    → DOC LINT: PASS                                              EXIT=0
```

## 未做项（具名）
| # | 项 | 说明 / 改判条件 |
|---|---|---|
| 1 | **检查点语义**（分段/运行中抓检查点/按检查点裁剪） | 只落了携带层；见 §B 的代价与改判条件 |
| 2 | **恢复租约的"真锁"化** | 当前 TTL 猜测式；要严格排他需宿主提供带 TTL 的锁或 fencing token（跨机尤其） |
| 3 | **跨机崩溃** | 未验（同机同 fs）；跨机还依赖 `wx` 原子性与时钟一致性（后者影响租约的陈旧判定） |
| 4 | **孤儿进程** | 宿主边界（`subprocess` 服务 dispose 会终止托管进程；服务被 SIGKILL 时 OS 不保证） |

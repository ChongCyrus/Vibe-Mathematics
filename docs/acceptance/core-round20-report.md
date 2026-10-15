# Round 20 · task-122 · ② 中间检查点：**按 Lead 裁决【停在第 1 步门槛】——只做 ④＋给 R9 装牙＋具名未做**

**一句话**：我按 Lead 裁决**没有**把 `resumeFrom` 从"搬运"改成"解释"（那是 `docs/15 §14.4` Round 9 裁决留给"升级"的一步，**改判条件无实测满足**）；本轮交付＝**④ 补上 Lean 面的 resume 具名（此前通篇没有）** ＋ **给 R9 的"只携带"契约装上能红的牙**（新套件 14/0）＋ **把 60–100 行的升级清单与改判条件写成具名项**。**能力一行未改**（`admission().checkpointing` 原样、`tests/vmu-mathjobs-persist.test.mjs:448` 未动）。

- 状态：**④ 已落并已常驻守卫 ／ (b) R9 契约已装牙 ／ (c) 具名未做已写 ／ 第 1 步（解释令牌）按裁决不做**
- 纪律：定点编辑＋编辑后立刻核内容；每步跑加载内核的套件；`kernel/meetings.js` 一个字未碰；未跑全量（T0/T1 归 Lead）／**未 `regen-all`**／未 git；临时文件仅 `D:\_tmp`；新文件已双登记（§8）。

---

## 0. 核验行：我读的是哪一版 / 哪一次运行

| 项 | 值 |
|---|---|
| HEAD | `df207bd`（分支 `main`，**我未 commit／push**） |
| 我改动的文件 | `vibe-math-vmu/kernel/lean.js`（`36CC98101D4C1296`，+15 行／共 892 行）、`vibe-math-vmu/kernel/mathjobs.js`（`65622D4A90AC5935`，+13 行／共 1032 行）、`package.json`（+1 行）、**新增** `tests/vmu-resume-token-contract.test.mjs`（`BFFAC3C7F203C994`，123 行） |
| ★ **我【没有】碰的** | `kernel/report.js`（与 R19 同）、`kernel/index.js`、`tests/vmu-mathjobs-persist.test.mjs`（`:448` 的护栏**原样**）、`docs/**`（见 §7 归属）、`packs/**`、`scripts/**` |
| 同轮他人在动（不是我） | `kernel/pack.js`、`vibe-math-vmu.js`、**新** `tests/vmu-pack-inline-manifest.test.mjs`（`vmu-pack2`／task-125）；`docs/05-middleware.md`、`docs/21-observability-and-operations.md`（+7／+73 行，另有人） |

---

## 1. 裁决冲突（我开写前的第一动作）与收窄

**我发现的冲突**（`vibe-math-vmu/docs/15-math-computation-toolbox.md:385`，逐字）：
> **中间检查点：只携带、不解释（Round 9 裁决）**：`submit({resumeFrom})` 的**不透明令牌**被携带 —— request → **子进程环境变量**（`VMU_RESUME_FROM`，已在 `docs/03 §8.2` 的 env 缝表登记：不设 ⇒ 从头算、`resumedFrom:null`、**不假装续算**）→ 镜像 → **恢复原样重发**；回执 `resumedFrom`；令牌进**请求指纹**（换令牌 ⇒ 分支 ③，**绝不静默按新令牌续算**）。**内核不解释令牌**。**升级为真检查点**需要"子进程输出协议 ＋ 运行中读流 ＋ 镜像 `checkpoint` 字段 ＋ **分段重发** ＋ 每引擎的'**续算 ≡ 一次算完**'对照"，粗估 **60–100 行内核 ＋ 每引擎一个 demo**；**改判条件：出现真实可续引擎且单作业时长 ≥ 作业预算量级**。

⇒ **该条件无任何实测满足**；`admission().checkpointing: 'not-implemented…'` 是**裁决要求的诚实具名**，不是遗漏。我 task-122 自己写的"把搬运改成解释"**正是裁决留给升级的那一步** ⇒ 先报 Lead。

**Lead 裁决（已收到）**：**不推翻 R9**，收窄为三件事 —— (a) 做 ④；(b) 给 R9 的"只携带"契约装断言牙；(c) 具名未做＋改判条件；**第 1 步（`VMU_RESUME_SEGMENT`／`resumedFromResolved`／`segmentsSkipped`／内核解释自己持有的检查点）本轮不做**；`tests/vmu-mathjobs-persist.test.mjs:448` **别改**。本报告按此交。

---

## 2. (a) ④：Lean 面**此前通篇没有** resume 声明 —— 已补（**披露**，不是解释）

**核验**：改前 `kernel/lean.js` 的 `admission()`（`574-615`）只有 `fileMirror`／`subprocess`／`retention`／`recoverMode`，**没有任何 resume/checkpointing 字段**；仅 `:580` 在"未注入 fs 接缝"时顺带提到"镜像/断点续算具名不可用"。⇒ 调用者**无法**知道 Lean 作业能否从中间续。

**改法**（`kernel/lean.js:616-631`，+15 行，紧接 `recoverMode`）：新增
```js
resume: {
  supported: false,
  reason: 'Lean cannot resume mid-run: this face invokes the engine as ONE whole-file build (no in-run protocol/stream), so there is no partial state a checkpoint could hold; a crashed Lean job is re-issued from the start, never continued',
  engine: 'lean',
  whatWouldHaveToExist: 'an engine-side output protocol + an in-run stream this face could read + a `checkpoint` field in the job mirror + segmented re-issue',
  changeCondition: 'docs/15 §14.4: a real resumable engine exists AND a single job lasts >= the job budget. Only then is the upgrade "one demo per engine proving resume == one uninterrupted run" (~60-100 kernel lines) worth landing',
}
```
**为什么是披露而不是解释**：它只**回答一个问题**（能不能续／为什么不能），**不改变 `submit()` 的任何行为**，也没有让内核去读令牌。

**所有引擎面审阅**（Lead 的"顺手核"）：`grep 'const admission = ()'` ⇒ 三处：`kernel/lean.js:574`、`kernel/mathjobs.js:962`、`kernel/index.js:1579`（后者是内核总览面，不是引擎面）。`mathjobs.js` 已有 `checkpointing` 具名（✓），故只在它旁边补一个**机器可读的同一边界**（下节）。

---

## 3. 同一边界的机器可读孪生（`mathjobs.js`，**`checkpointing` 原样不动**）

`kernel/mathjobs.js:999` 新增 `resume:` 对象（`checkpointing` 字符串**一字未改**，故 `vmu-mathjobs-persist:448` 的 `indexOf('not-implemented') === 0` 护栏**原样通过**）：
```js
resume: {
  supported: false,
  segmentSemantics: "the ENGINE's",
  carriedNotInterpreted: ['VMU_RESUME_FROM (request → child env → mirror → re-issue)', "the receipt's `resumedFrom`", 'the token is part of the request fingerprint'],
  whatTheKernelDoesNotDo: 'it never reads, validates or advances the token: a changed token is a DIFFERENT request (fingerprint branch ③ ⇒ "interrupted, not auto-rerun"), never a silent continuation',
  changeCondition: 'docs/15 §14.4: … (~60-100 kernel lines + one demo per engine)',
}
```
⇒ "每个引擎面都用同一种形状回答同一个问题"从此**可被测试读**，而不是只能匹配散文。

---

## 4. (b) 给 R9 的契约装牙：`tests/vmu-resume-token-contract.test.mjs`（新，14/0）

`node tests/vmu-resume-token-contract.test.mjs` ⇒ **`=== VMU RESUME TOKEN CONTRACT: 14 passed, 0 failed ===`，exit=0**

| # | 断言（每条都有非空前置） | 守的是什么 |
|---|---|---|
| RK1 | 令牌**真的进子进程 env** `VMU_RESUME_FROM`（从真 spawn spec 读，不是从回执猜） | docs/03 §8.2 的 env 缝契约 |
| **RK2** | ★ **内核【没有】解释令牌**：env 里**没有** `VMU_RESUME_SEGMENT`（也没有任何别的解释键） | **这是裁决的牙**：谁把"解释"落地而没改判，这条立刻红 |
| RK3 | 回执 `resumedFrom` 与请求**一致** | 回执不得改写请求 |
| RK4 | **不传令牌 ⇒ env 里根本没有 `VMU_RESUME_FROM` 且 `resumedFrom:null`** | "不设 ⇒ 从头算、**不假装续算**" |
| RK5 | 令牌**进请求指纹**：同 engine/argv、不同令牌 ⇒ **`inputHash` 不同**（从盘上两个镜像读） | "换令牌＝不同请求" |
| **RK6** | ★ 把盘上镜像的 `request.resumeFrom` 改掉、指纹留着不动 ⇒ `recover()` 得 **`action:'interrupted-no-rerun'`＋`why:'fingerprint-mismatch'`**，且**恢复期间 0 次引擎调用** | **"绝不静默按新令牌续算"**（分支 ③，`mathjobs.js:922-930`）——"静默重跑"被**实测为不存在** |
| RK7 | 两个引擎面都**具名**：`mathjobs.admission().resume.supported===false`（且 `checkpointing` 仍以 not-implemented 开头）＋ `lean.admission().resume.supported===false` 且有 `reason`＋`changeCondition` | ④ 的可读化，且**将来缺一个面就会红** |

**这一条不是"又跑了一遍单测"**：RK6 用**真 fs 缝（内存）+ 真 `recover()` 分支**证明"换令牌不会被静默续算"，RK2/RK7 是**将来越线/漏披露就红**的护栏。

---

## 5. (c) 具名未做 ＋ 改判条件 ＋ **从哪里开始改**

**未做（按裁决）**：内核侧**真检查点**——`checkpoint()` 落盘与 `sha256` 校验回读、`resumeFrom` 的**解释**、`VMU_RESUME_SEGMENT`、回执 `resumedFromResolved`／`segmentsSkipped`。**一行未写**（避免"半接线模块"）。

**改判条件（`docs/15:385` 原文）**：**出现真实可续引擎 且 单作业时长 ≥ 作业预算量级**。⇒ **截至 R20 无实测满足**：仓库里没有任何引擎声明可续（`mathjobs` 的 `resume.supported:false`、`lean` 的 `supported:false` 都是本轮刚具名的），也没有任何"单作业时长 ≥ 作业预算"的测量。

**从哪里开始改（若将来满足）**，按裁决给的清单落到具体行：
1. `mathjobs.js:610-613` 的 `spec.env` —— 现在只加 `VMU_RESUME_FROM`（R9 形状）；升级后在此加 `VMU_RESUME_SEGMENT`，并把 `job.resumeFrom` 从"不透明串"改成"已校验的检查点引用"。
2. `mathjobs.js:745-747` —— 现在是"原样 `String(args.resumeFrom)`"；升级后在此**解析＋校验 sha256**，并新增具名拒（校验失败／引擎不可续）。
3. `mathjobs.js:560-583` 的镜像路径（`mirrorRel`）旁 —— 新增检查点落盘（复用同一 `fsSeam` 的耐久路径），即裁决清单里的"镜像 `checkpoint` 字段"。
4. `mathjobs.js:652-662` 的回执 —— 新增 `resumedFromResolved`／`segmentsSkipped`，并**把"分段重发"写成真事实**（否则 ③ 的"真的续 vs 从头跑"无法在内核侧被观测）。
5. `mathjobs.js:859-955` 的 `recover()` 四分支 —— 让检查点参与恢复（"从最近检查点续"）。
6. **每引擎一个 demo**：证明 `续算 ≡ 一次算完`（这一步**永远不属于内核**）。
粗估仍与裁决一致：**60–100 行内核 ＋ 每引擎一个 demo**。

---

## 6. 回归读数（原样命令＋退出码）

```
node tests/vmu-resume-token-contract.test.mjs   → === VMU RESUME TOKEN CONTRACT: 14 passed, 0 failed ===  exit=0   （新）
node tests/vmu-lean.test.mjs                    → ALL GREEN (passed=13, failed=0)                             exit=0
node tests/vmu-mathjobs.test.mjs                → === VMU MATHJOBS: 10 passed, 0 failed ===                   exit=0
node tests/vmu-mathjobs-persist.test.mjs        → === VMU MATHJOBS PERSIST: 21 passed, 0 failed ===            exit=0  ← :448 护栏原样通过
node tests/vmu-mathtools.test.mjs               → === VMU MATHTOOLS: 208 passed, 0 failed ===                  exit=0
node tests/vmu-kernel.test.mjs                  → === VMU KERNEL: 175 passed, 0 failed ===                     exit=0
node tests/audit-package-membership.mjs         → === PACKAGE MEMBERSHIP: 29 passed, 0 failed ===              exit=0
node tests/audit-module-coverage.test.mjs       → === MODULE COVERAGE: 6 passed, 0 failed ===                  exit=0
node tests/audit-vmu-services.test.mjs          → === VMU SERVICE SURFACE: 49 passed, 0 failed (80 reg.) ===   exit=0
node tests/audit-surface-index.test.mjs         → === SURFACE INDEX: 20 passed, 0 failed ===                   exit=0
node tests/audit-declaration-criterion.test.mjs → === DECLARATION CRITERION: 87 passed, 1 failed ===           exit=1  ← 见 §7，**不是我的**
```
（**未跑**）：全量 `tests/run-tests.mjs`、`scripts/regen-all.mjs`、任何 `git commit/push`。

---

## 7. ★ `audit-declaration-criterion` 变红的**归因**（受控实验，不是猜）

该门禁最后一条是"`regen-all --check really runs green`"。我的读数：**`regen-all --check` ⇒ 13/15 in sync，exit=1**，两条 FAIL：
1. `planned-code registry (docs/03-§8)`：`planned codes registry: STALE — the contract block is not what the docs yield (276 planned codes)`
2. `documented counts (README / checklist)`：`update-doc-counts: the scoped line for docs/11 was NOT rewritten (no scoped count)`

**归因实验 1（排除文档）**：`node D:\_tmp\r20-head-drift.mjs` —— 把 **`vibe-math-vmu/docs/` 全部 30 个 .md 还原到 HEAD 内容**后重跑生成器 `--check` ⇒ **仍然 exit=1、仍然 STALE**。⇒ **不是任何文档的工作树改动造成的**（包括 `docs/05`／`docs/21`）。
**归因实验 2（找到真凶）**：契约块里有"**每个码出现在哪些运行期文件**"的行（`scripts/generate-planned-codes.mjs:153-167`，§8.1 per-code locations），所以**任何运行期文件新引用一个已登记码**都会改块。`node D:\_tmp\r20-runtime-cause.mjs` ⇒ 当前 4 个脏运行期文件里**只有一个新引用了带引号的码**：
```
QUOTED code tokens added by those files: VMU_PACK_INVALID
  → vibe-math-vmu.js:  +  throw packModule.refuse('VMU_PACK_INVALID',
```
⇒ **是 `vmu-pack2`（task-125）在 `vibe-math-vmu.js` 新引用了 `VMU_PACK_INVALID`**，让契约块里该码的文件列从 `kernel/pack.js` 变成两个文件 ⇒ 块过期 ⇒ `--check` 红。**我的两个文件（`lean.js`／`mathjobs.js`）新增行里没有任何带引号的新码**（同一次实验输出：我只加了 `VMU_RESUME_FROM` 的**散文**提及，而该码本就在块里且早已由 `mathjobs.js:611` 引用）。
**修法与归属**：块必须重新生成（`node scripts/generate-planned-codes.mjs --write`）＋ 文档计数（`update-doc-counts`）——**两者都属 `regen-all` 领地（Lead/T0-T1）**，且我**被明令不跑 `regen-all`**、`docs/**` 也不在我写范围 ⇒ **我只是具名，没有动手**。FAIL #2 同理来自 `docs/05`(+7)／`docs/21`(+73/-1) 的行数变化（他人在改）。

---

## 8. 双登记（新文件）

```
node D:\_tmp\r20-register-test.mjs → inserted; JSON valid; files[] count=682; IN=true; distinct=682   exit=0
git diff --numstat package.json    → 1  0  package.json     # 只加一行（同轮 vmu-pack2 也各加了自己那一行，合计 2 行）
node tests/audit-package-membership.mjs → 29 passed, 0 failed   exit=0
# installer.js 的 preset 清单只托管 preset 文件（kernel/packs/docs/tools）；tests/** 从不进它（R19 已核 0 条）
```

---

## 9. 未做项（**具名**，无半成品）

1. **内核侧真检查点（解释令牌）** —— 按 Lead 裁决**不做**；改判条件未满足（§5）。**这是本轮最大的"未做"，且是裁决要求的未做。**
2. **`docs/15 §14.4` 的"改判条件未满足（截至 R20 无实测）"状态句未写入** —— `docs/**` **不在我 task-122 的写范围**（范围：`mathjobs.js`／`lean.js`／`index.js`／`tests`／`package.json`／`_handoff`），且本轮 docs 有他人在改 ⇒ 我把建议句放在报告里（"**R20 复核：改判条件仍未满足——无任何引擎声明可续（两面具名 `resume.supported:false`）、无'单作业时长 ≥ 作业预算'的测量；升级清单与起始行见 `_handoff/vmu/core-round20-report.md` §5**"），请 Lead 派 docs 属主。
3. **`regen-all --check` 的两条 FAIL** —— **不是我的**（§7 受控实验证明），修复属 `regen-all` 领地，我未动。
4. **`kernel/index.js` 未改** —— 本轮无需改（`engineResume` 之类的新缝正是"解释令牌"的配套，随第 1 步一起不做）；故"每步跑加载内核的套件"里 `vmu-kernel 175/0` 是回归读数而非新功能读数。

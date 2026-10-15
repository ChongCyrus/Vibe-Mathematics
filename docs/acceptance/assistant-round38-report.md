# Round 38 · docs 精度修正：§20.9 的"8 键"**具名到版本与读数类型**

> 负责人：`vmu-assistant2`｜交付：`docs/21-observability-and-operations.md`（**只改这一处**）＋ 本报告。
> 硬约束：**未跑真机**（★ 按 Lead 裁定：**不专门为它开销一次会话**）；**未跑全量／未 `regen-all`／未 git 写／未改代码·测试**；**未复制凭据**；宿主无残留、`7700–7900` 无监听。

---

## 0. 结论
**需要改**（原措辞只写"`elided[]` 每条 **8 键**"，**没有写它是哪一版、也没写这是代码读数** ⇒ 读者会默认成真机读到的）⇒ **已按裁定补上具名归属**，并保留 R37 已写的 spill 复核 6/6 与闭式 ✓。**六门全绿。**

## 1. 引用前先落一行核验（两个键集，都取了原样）
| 对象 | 读数 |
|---|---|
| **R34 真机回执的 `elided[0]`** | **原样**：`"elided":[{"path":"settings.resolved.vmu.turn.instituteName.value","from":2000,"to":14000,"bytes":12000}]` ⇒ **键 = `path, from, to, bytes`（4 键）**（来源：留存回执 `…\dsh-spill-anvuBo\session-18bb6bd1fc87\d76be52b7209-vibe_vmu_status.txt`，182,374 B） |
| **当前代码的 `elided.push({…})`** | `kernel/receiptbounds.js:139-148` ⇒ **8 键**：`path`／`from`／`to`／`bytes`／`keptBytes`／`keptHash`／`origHash`／`hash`（`hash:'sha256'`，`HASH_ALGO` 在 `:87-88`） |
⇒ **结论**：**8 键是 R36 才引入的**；**R34 那次是 4 键** ⇒ ★ **"8 键在真机上成立"目前只是【代码读数】、真机确认尚未做** —— 正是 Lead 指出的那点 ✓。

## 2. 改了什么（**一处**，`docs/21 §20.9 §④` 之后新增一句）
新增（`L564`）：
> ★★ **8 键的出处与"哪一版"（必须连读，否则会被默认成真机读到的）**：**8 键形态的依据＝`kernel/receiptbounds.js:139-148`（【代码读数】）**；★ **真机回执（R34，`session-ce7f04ec-a205-43ef-9d2c-9b02fe97aa29`）是【4 键】形态**（原样：`{"path":"…","from":2000,"to":14000,"bytes":12000}` ＝ `path`／`from`／`to`／`bytes`，那时 8 键尚未引入，8 键是 **R36** 才有的）⇒ ★ **"8 键在真机上成立"的真机确认【尚未做】**（按裁定**不专门为它开销一次会话**；将来若因别的原因跑真机，**顺带抓该形态**即可）✓。
★ **保留不动**：§20.9 §② 里 R37 已写的 **spill 复核 6/6 PASS** 与**闭式** `kept.slice(0,2000) === 'ABCDEFGHIJ'.repeat(200)` ✓；§④ 原有的 `WHAT IT DOES NOT OWN`／`receiptMeta` 五键两态同形 ✓。
★ **书写口径**：`elided[0]` 的 `path` 在回执里是**点分**的，本卷按**括号形式**写（`settings.resolved['…'].value`）—— 与 R34 同一处理：**避免文档审计把它连读成一个不存在的设置键** ✓。

## 3. 门禁（★ 2026-10-16 **00:57:39** 同一次运行）
| 门 | 读数 |
|---|---|
| `scripts/check-docs.mjs` | **PASS** |
| `tests/audit-doc-index.test.mjs` | **5 / 0** |
| `tests/audit-vmu-docs.test.mjs` | **102 / 0** ✓ |
| `tests/audit-doc-vs-code-tables.test.mjs` | **17 / 0** |
| `tests/audit-claim-traceability.test.mjs` | **5 / 0** |
| `tests/vmu-planned-settings.test.mjs` | **ALL GREEN（planned=111, docs=28, 39/0）** |
★ **动前核在飞写者**：改动前 `git status` **空**、HEAD **`a71370e`**（`round 37 - declining to build something that proves nothing, and making an old reading re-computable`）；改动后 `git status` 为 2 行：`scripts/generate-vmu-settings-table.mjs`（**`vmu-comms2` 范围，非我**）＋ 我的 `docs/21` —— ★ 本轮**该门没有因它变红**（`audit-vmu-docs` 102/0）✓。

## 4. 哈希
| 卷 | BEFORE（HEAD `a71370e` 的字节，`git cat-file blob` 二进制取） | AFTER |
|---|---|---|
| `docs/21-observability-and-operations.md` | **`DEC878920BBF3BAF`**（62392 B） | **`BD74157D9315A17A`**（63076 B） |

## 5. 卫生与成本
- **未跑真机** ⇒ 未复制凭据（`D:\_tmp` 全盘 `.credentials*` ⇒ **none**）；宿主无残留、`7700–7900` **无监听** ✓
- **未跑全量／未 `regen-all`／未 git 写／未改代码·测试**；★ 本轮**只改了一卷的一处** ✓
- 成本：0 次真机会话；只跑了 6 个门 ＋ 1 次键集核验。

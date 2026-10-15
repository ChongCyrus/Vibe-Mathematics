# Round 35 · vmu-pack（`task-167`）交付报告 —— `appliesAt`／`appliesFrom` 的**常驻断言 ＋ 当天反例**

> 任务：`task-167`（补上 R34 §6 自陈"未落"的那两件）。★ **两件都已落，全绿。**
> 纪律：**只动我自己的新测试文件 ＋ `package.json`（定点 `edit`）** ✓；变异器**副本制**（真树只读＋hash 判据）；未跑全量／`regen-all`／git；未自造公开码。

---

## 0. 这条补的是什么（用你的话）

R34 之后，挡住两个名字不一致的是"**同一个局部量**"这个**代码事实**，**不是断言** ⇒ **任何一次重构都可能悄悄拆散它而门禁不响**。本文件就是那道缺的门。

| 项 | 结果 |
|---|---|
| **真入口断言（工具层 × 内核层）** | ✅ `vibe_vmu_set` 真调用；`appliesAt === appliesFrom`（同帧同名同值）＋ **另一条独立读取** `kernel.appliesTable()` 对齐 |
| **两键恒存在** | ✅ 普通／planned／refined-H2 **三种例子里都断言**了 `'appliesAt' in r && 'appliesFrom' in r` |
| **非空前置** | ✅ 每处判据都带（`typeof … === 'string' && length > 0`）⇒ **"两边都 undefined"不能过** |
| **planned 例（更强的披露）** | ✅ `appliesAt === 'never yet (planned key: no runtime consumer)'` ＋ `noConsumer === true` ⇒ ★ **钉住 R34 那个优先级错误的位置** |
| **当天反例（副本制）** | ✅ **M1 12/1 红（D2）**、**M2 11/2 红（C3／C4）**；★ **M2 正是 planned 那一例**；真树 md5 未变 |
| **新文件双登记** | ✅ `package.json files[]`（★ `installer.js` **不适用**，见 §5） |
| **`host.js`** | ✅ **本轮未动**（仍 **1167/1200**，余量 33）⇒ 无需抽模块 |

文件：**`tests/vmu-applies-name-unified.test.mjs`**，**13 passed / 0 failed**。

---

## 1. 断言的四组（全部走真入口）

| 组 | 内容 | 关键断言 |
|---|---|---|
| **A 前提** | 真入口注册了 `vibe_vmu_set`（否则后面全空过）；★ **内核确实暴露 `appliesTable()`**（第二条独立读取的来源） | A0／A1 |
| **B 普通键（H1 `vmu.packs.allowOverride`）** | 两键都在；都不空；`appliesAt === appliesFrom`；★ **B4＝工具层回执 vs 内核 `appliesTable()` 两条路径对齐**（`hot === 'H1'` 且 `appliesAt === table.H1`） | B1–B4 |
| **C planned 键（`vmu.a11y.checkScope`）** | 两键都在；同名同值；★ **C3 ＝ 强披露必须胜出**（`never yet (planned key: no runtime consumer)`）；★ **C4 ＝ 它显然【不是】该热类的表值**（那正是当初的 bug） | C1–C4 |
| **D refined-H2 键（`vmu.turn.instituteName`）** | 两键都在；同名同值；★ **D3 ＝ 值是内核【细化后的】披露，而不是粗表值 `APPLIES.H2`** | D1–D3 |

## 2. ★ 一个让反例"真的能红"的设计点（我差点漏掉）

★ **普通键 catch 不住"改回表值"这个回归**：对 H1 而言，"从表里重算"与"取内核值"**结果相同**（都 `'next turn'`）⇒ 只有**内核会细化**的那种键才能暴露它。
⇒ 所以必须有 **D 组（H2＋实测活读者的 `vmu.turn.instituteName`）**：它的内核值是 **"this session for the measured live readers …"**，**不等于** `APPLIES.H2`。★ 实测正是 **D2 抓住了 M1**。
★ 这条值得进矩阵：**"能红的反例需要一个【两条路径会分叉】的输入"** —— 否则变异看起来无效，其实只是**输入选错了**（与 R27"变异打错行"同族，但这次是**输入**而非**位置**）。

## 3. 当天反例（副本制，真树只读）

`D:\_tmp\vmu-pack35\applies-counterexamples.mjs`：`cpSync` 整包 → **只在副本变异** → 跑**副本的**测试。

| 变异 | 读数 | 红在哪一行 |
|---|---|---|
| CONTROL（副本未变异） | **13/0** EXIT=0 | — |
| **M1** 别名**改回从表里重算**（＝修复前的粗值） | **12 passed / 1 failed** | ★ **D2**（refined H2 值与别名分叉） |
| **M2** **R34 的优先级错误回归**（内核值在前 ⇒ planned 披露被吃） | **11 passed / 2 failed** | ★ **C3／C4**（★ **planned 那一例**，按你的要求包含） |
| CONTROL（副本复原后） | **13/0** | — |
| ★ 真树判据 | `host.js` md5 **`cc58a51e3deb2fdd52509c46669cfacb`** 变异前后逐字节相同 ⇒ **NEVER WRITTEN = true** | — |

★ 两个变异都是**具名断言红**（不是崩溃、不是语法假红）。

## 4. 门禁（本轮读数）

| 命令 | 读数 | 退出码 |
|---|---|---|
| `node tests/vmu-applies-name-unified.test.mjs` | ★ **`13 passed, 0 failed`**（新） | **0** |
| `node tests/vmu-host.test.mjs` | `107 passed, 0 failed`（`appliesFrom` 的 6 条既有断言仍在） | **0** |
| `node tests/vmu-kernel.test.mjs` | `175 passed, 0 failed`（`appliesAt`） | **0** |
| `node tests/audit-code-size.test.mjs` | `9 passed, 0 failed`（`host.js` 1167/1200） | **0** |
| `node D:\_tmp\vmu-pack35\applies-counterexamples.mjs` | CONTROL 13/0 ⇒ M1 12/1、M2 11/2 ⇒ 真树 md5 不变 | 0 |

## 5. 登记与边界

- **`package.json`**：新增 **`"tests/vmu-applies-name-unified.test.mjs"`**（★ **定点 `edit`**，未整文件写）⇒ **计数 +1**，轮末由你重生成。
- ★ **`installer.js PRESETS[].files` 不适用**：测试文件**不在**预设受管清单里（R14 已核：`tests/` 在 `PRESETS[].files` 中出现 **0** 次）⇒ 按任务书"**若适用**"的措辞，**本项不适用**；且本轮写范围只给了"我的测试文件 ＋ `package.json`" ⇒ **我未碰 `installer.js`** ✓。
- **改动面**：**仅**新测试文件 ＋ `package.json`（★ **`host.js`／`vibe-math-vmu.js`／`kernel/**`／`scripts/**`／`docs/**` 全部未碰**）。
- **已知脆弱点（具名）**：D 组依赖"`vmu.turn.instituteName` 是 H2 **且有实测活读者**"这一事实；★ 若将来该键的活读者集合变了，D3 需要随之更新（★ 那是**事实变了**，不是断言错）。

---

## 6. 交回 Lead

1. **两件都落**：常驻断言（13 条，真入口、两键恒存在、非空前置、普通／planned／refined-H2 三例）＋ **当天反例**（M1 12/1、M2 11/2；★ M2 覆盖 planned）。
2. ★ **R34 §6 那句自陈可以关闭**：现在挡住"两名字被重构拆散"的**不只是代码事实，还有断言** —— 且断言**当天就被证明有牙**。
3. ★ **一条可复用结论**（建议进矩阵）：**"能红的反例需要一个两条路径会分叉的输入"** —— 普通键在两种实现下同值，只有 refined 输入才分叉；否则变异"看起来无效"其实是**输入选错**。
4. **门禁**：新测试 **13/0**，`vmu-host` 107/0、`vmu-kernel` 175/0、`audit-code-size` 9/0 均绿；`host.js` 未动。

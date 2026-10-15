# Round 30 · `task-152`（docs）：两条校验的不对称 ＋ 两路两种处置 —— 已落 `docs/04 §6.1` ＋ `docs/02` 一句交叉引用

> 负责人：`vmu-assistant2`｜交付：`docs/04-settings.md`（§6.1，**替换**原那条不准的"诚实边界"）、`docs/02-architecture.md`（模块树一行，**一句交叉引用**）、本报告。
> 硬约束：**未跑全量／未 `regen-all`／未 git 写／未改代码·测试**（`schema.js` 的假注释属 `task-149` 写范围，**我只在 docs 里登记，未动它**）；**未跑真机**（Lead 指示）；临时文件 `D:\_tmp`。

---

## 0. 结论（三句）
1. **两条校验确实不对称，我逐行核过**：**键校验已接线**（`vibe-math-vmu.js:36` 导入 → `:614` → **`host.js:535/553` 在 `set` 面真调用**）／**值·域校验未接线**（`validateValue` 唯一调用者 `resolveSettings` **全仓零调用者**）。
2. **★ A 项【未落地】，所以我全程写"待接线"，没有写成"已生效"**（两个独立依据见 §1）。
3. **两路两种处置 ＋ "执法点在读取侧/接线处、不在 schema 声明"这条原则已写进两卷**，并**把 `schema.js:1521` 那句假注释逐字登记**（它正是"把'声明了就该在跑'的误读写进注释"的现场）。

## 1. ★ 动笔前先核 A 是否已落（两个独立依据，缺一不可）
| 依据 | 我读到的 |
|---|---|
| **① 板上** | `team_task_get task-149` ⇒ **`revision: 3`／`status: **in_progress**`／`ownerName: vmu-comms2`**（本轮正在落）；其写范围含 `settings/schema.js`／`kernel/**`／`tests/**` |
| **② 读码** | 全仓（除 `node_modules`／`docs`）grep `resolveSettings` ⇒ **只有它自己的定义**（`settings/schema.js:1558`），**零调用者**；`validateValue`（`:1459`）唯一调用者就是它（`:1566`）⇒ **`type`／`domain` 没有运行期执行点** |
⇒ **两个依据一致指向"未落地"** ⇒ 文档里凡未生效处一律写"**设计（未生效）**"／"**待接线**"。

## 2. 我核过的其他事实（引用前先落一行，逐条 file:line）
| # | 事实 | 原文/读数 |
|---|---|---|
| 1 | `assertDeclared` 定义 | `settings/schema.js:1436` `export function assertDeclared(key) {`（未声明键 ⇒ `VMU_INVALID_ARGUMENT`，hint 指向本卷） |
| 2 | 它的接线链 | `vibe-math-vmu.js:36` `import { assertDeclared } from './settings/schema.js'` → `:614`（`declared ? { assertDeclared } : {}`）→ **`host.js:415-417`**（`if (typeof assertDeclared === 'function') explicit.set = true`）→ **`host.js:535`**（`if (on('set') && typeof assertDeclared === 'function')`）→ **`host.js:553` `assertDeclared(key)`** |
| 3 | `validateValue` 定义 | `settings/schema.js:1459` `export function validateValue(key, value) {`（内部先 `assertDeclared(key)`，再按 `d.type` 逐类判，失败 `VMU_INVALID_ARGUMENT`） |
| 4 | ★ **那句假注释** | `settings/schema.js:1520-1521` 逐字：*"EXACTLY the shape `natural` uses …; only the step differs. The 0..1 bound is enforced by `validateValue`, **the path every runtime write takes**."* ⇒ **假**（没有任何运行期写入走它） |
| 5 | **对照**（不是同一回事） | `vmu.meetings.orderMode` **REFUSED** 是因为 R17 给它加了**读取侧**严格检查 ⇒ **执法点在读取侧**，schema 的 `domain` **本身不构成运行时保护** |

## 3. 落笔（两卷、同一次）
### 3.1 `docs/04-settings.md` §6.1 —— **替换**原来那条（它把值域检查错记在 `assertDeclared` 一层）
新块写清四件：
- **不对称**：键校验【已接线】／值·域校验【未接线】＋ 各自 file:line（含 `host.js:535/553`）；
- **那句假注释逐字纠正**，并点明它是"**把'声明了 `type`／`domain` ⇒ 就该在跑'的误读写进了注释**"，**本卷此后以本条为准**；
- **两路两种处置**：**交互写面 ⇒ 具名拒**（复用**已登记** `VMU_INVALID_ARGUMENT`，与 `assertDeclared` **同码**）／**配置·合并面 ⇒ 不收该值 ＋ 具名记账（`settingsRejected`）＋ 用声明默认值**；★ **理由写全**：在该面硬拒会把"**一个键写错**"升级成"**整个会话起不来**"，而**那条记账本身就是迁移提示**；
- ★ **执法点原则**：**在读取侧／接线处，不在 schema 声明本身**（`domain` 是单一来源的**声明**，执法由接线处履行）；
- ★★ **落地状态**：截至 **2026-10-15**，`task-149` A 项 **in_progress、未落地** ⇒ 上述处置**是设计（未生效）**；**当前实际行为＝键检查生效、值／域检查不生效**；并保留实测后果（域外值经 `config.vmu` **被 LOADED**：`vmu.budget.onExceed`／`vmu.compat.unknownCombo`／`vmu.quota.onExceed`）与对照（`orderMode` REFUSED）。

### 3.2 `docs/02-architecture.md` —— 模块树里 `settings/schema.js` 那一行加**一句**交叉引用
`…（合计 717 键 ✓；含 hot／who／doc ✓）—— ★ **键校验已接线／值（域）校验【未接线】**，且**执法点在读取侧、不在本声明**：见 `04-§6.1` ✓`
⇒ **不在 02 里另写一遍**（避免两卷各说一半），只指路 ✓。

### 3.3 ★ 动前先核在飞写者（用**内容**判，不用 mtime）
- `git status --porcelain` 对**两卷**输出为空 ⇒ 改前两卷**＝ HEAD 的字节**（见 §4 的 BEFORE 哈希）；
- 两卷 mtime 都是 **19:07:26**（晚于我 R25 的落笔），**但内容与 HEAD 逐字节一致** ⇒ **没有别的写者留下内容差异**（mtime 不可作为"内容被改"的判据 —— 与 R25 同一条教训）；
- 我正在改的两卷**不在** `task-149`／`task-151` 的写范围内 ✓。

## 4. 改前/改后哈希（★ BEFORE 用 `git cat-file blob HEAD:` **二进制**取，无文本往返）
| 卷 | BEFORE（= HEAD） | AFTER（工作树） |
|---|---|---|
| `docs/04-settings.md` | sha256 **`f296a6949bf7c695`**（284250 B） | sha256 **`B71463FD2603E277`**（286690 B） |
| `docs/02-architecture.md` | sha256 **`9fd1884975c764e2`**（177632 B） | sha256 **`1531E6CE2218074A`**（177771 B） |

## 5. 门禁读数（★ 2026-10-15 19:35:33 同一次运行，绑定上面的 AFTER 哈希）
| 门 | 读数 |
|---|---|
| `scripts/check-docs.mjs` | **PASS** |
| `tests/audit-doc-index.test.mjs` | **5 / 0** |
| `tests/audit-vmu-docs.test.mjs` | **99 / 0** |
| `tests/audit-doc-vs-code-tables.test.mjs` | **17 / 0** |
| `tests/audit-claim-traceability.test.mjs` | **5 / 0** |
| `tests/vmu-planned-settings.test.mjs` | **ALL GREEN（planned=111, docs=28, 39/0）** |
★ **调用形纪律**：新增文字里服务方法一律写调用形（`vibe_vmu_set`／`assertDeclared(key)`／`validateValue(key, value)`／`resolveSettings(layers)`／`host.js` 的调用点），**未裸写三段点号名**；`vmu.*` 只作为**真键名**出现。

## 6. 没做的事（具名）
- **没有**改 `settings/schema.js`（**那句假注释我没有动** —— 它属 `task-149` 写范围；本任务只要求**在 docs 里写明它是错的**）；
- **没有**把任何未落地的执行点写成"已生效"（A 未落 ⇒ 全文写"待接线／设计（未生效）"）；
- **没有**在 `docs/02` 里复写一遍处置（只一句交叉引用，避免两卷各说一半）；
- **没有**跑真机（Lead 指示，真机复核那半在 `task-151` 落地后另派）；**未跑全量／未 `regen-all`／未 git 写**。
- ★ **留给下一轮的对齐点**：`task-149` A 落地后，`docs/04 §6.1` 里那句"**当前实际行为＝键检查生效、值／域检查不生效**"与"**设计（未生效）**"**必须回改**（改成"已接线"并附**当天**的实证读数）；否则本卷会转成一处新的"声明↔实现不一致"。

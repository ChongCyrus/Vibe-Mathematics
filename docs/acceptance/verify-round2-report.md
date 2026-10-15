# Round 2 · vmu-verify（task-16）交付报告

> 任务：`task-16`（目标 4 一致性矩阵 ＋ canonical 进仓 ＋ 驱动入库 ＋ linter 收口 ＋ 新测试复核）
> 裁决依据：`_handoff/vmu/00-decisions.md` 的 **D-05（含修订）/ D-10 / D-11 / D-12 / D-13** ＋ `round2-plan.md`
> 日期：2026-10-14 · 纪律：未跑全量 sweep、未跑 `regen-all`、未 git；临时文件在 `D:\_tmp`；每条留命令 + 退出码

---

## 0. 结论速览

| 项 | 状态 | 关键证据（命令 → 退出码） |
|---|---|---|
| **A 覆盖矩阵 v1** | ✅ `_handoff/vmu/04-parity-matrix.md` | 124 条机制（A 47 ＋ B 20 ＋ C 57）＋ §4 需求清单（A 31 ＋ C 20）；判定 114 等价／5 具名拒绝／5 空缺；**并发现"唯一输入"的编码缺陷**（见 §1.1） |
| **B canonical 进仓 ＋ 语义化** | ✅ | `node tests/audit-math-computation-parity.mjs` → **EXIT=0，141 passed / 0 failed**；非空过性：seam 注入变异 ⇒ **2 条具名红** |
| **C 驱动入库** | ✅ | `node --check scripts/dsh-drive.mjs` → **0**；无前置时 **EXIT=1 且具名**（`{"step":"fatal","error":"attach mode needs --token"}`）；正文与仓外版**逐行相同** |
| **D linter 收口（T0 唯一红）** | ✅ | `node scripts/check-docs.mjs` → **EXIT=0，issues=0**（原 23）；D0/D2/D9 三个方向均**证明仍会红** |
| **D-12（pack 请求，追加）** | ✅ | 4 处门禁改读运行时导出；派生树上 `audit-hook-coverage` 4/0、`audit-doc-vs-code-tables` 17/0、`audit-surface-index` 20/0、生成器 `--check` current |
| **D-13 永久断言（pack 请求，追加）** | ✅ | `node tests/vmu-round2-seams.test.mjs` → **EXIT=0，12 passed / 0 failed** |
| **E 新测试复核** | ✅（有 3 条**非我范围**的待办，见 §6.2） | 12 个新 `tests/vmu-*.test.mjs` **全部在 vmu 作用域内**（vmu 271 作业）；RULE E 扫描：**我自己的 2 条空洞已修**，剩 3 条在他人文件 |

---

## 1. A · 目标 4 一致性矩阵 v1（主交付）

产出：`_handoff/vmu/04-parity-matrix.md`（三列 `v5r 机制 → vmu 内核原语 → v5r pack 声明` ＋ 判定 ＋ v1 状态）。

- **A 分片**：`M-A01..M-A47` ＋ `X-1..X-9` 跨边界点（47 ＋ 1 行）
- **B 分片**：原文**无 id**（按 `§1.1..1.20` 分节）⇒ 矩阵派生 `M-B01..M-B20` 并在 §0.3 写明映射
- **C 分片**：`C-01..C-57` 原样（＝任务书里的 `M-C*` 家族）
- **§4 需求清单**：A §六 31 条 ＋ C §⑥ 20 条 → vmu 落点归并表
- **§5 空缺/具名拒绝汇总**（可直接派工）：空缺 3（**C-30** office 定稿咨询门 → core/pack；**C-45** 忠实性强制弃权 → reader-b/c；**C-52** 自动汇报 → vmu-assistant）；具名拒绝 5（M-A07 宿主上限、M-A13/C-09 伪 id、C-53 特权包装、C-57 产品后门）
- **§6 v1→v2**：把 `映射` 全改 `核`（附 file:line + 该行能红的判据）

### 1.1 ⚠️ 发现：任务书指定的"唯一输入"是**损坏文本**

`_handoff/vmu/03-v5r-full-inventory.md` **自第 37 行（"分片 A"）起是 UTF-8 二次编码损坏**：`read` 与 ripgrep 都显示 `v5r 娣卞害鐩樼偣 路 鍒嗙墖 A…`（合并器把 UTF-8 字节按 GBK 解码后又存成 UTF-8）。第 1–35 行（结论速览/分片索引/已知更正）完好。
⇒ 我改用**三份未损坏的分片原文**（`v5r-inventory-{a,b,c}.md`，mojibake 标记命中数均为 **0**；合并本自己也写着"分片原文同样保留"）。**建议 Lead 用显式 UTF-8 重生成合并本**，否则该文件对下游读者不可用（这不是 v5r 原文的问题）。

---

## 2. B · canonical vendored 进仓 ＋ parity 重定义为**语义级**（D-10(1)）

**落点**：`tests/fixtures/mc-P1-ready/{math-computation.js, math-engines.js, tool-schema.json}`，登记 `package.json#files`（D-05 修订口径：仓库级/夹具只登记 `files[]`，不进 `installer.js PRESETS`）。

**⚠️ 一处必须记明的事实（不能写成"已核"能盖掉）**：vendored 的 canonical **是按当前随包副本刷新的** —— 旧快照 `6c9c9f13…`（2026-10-03）**早于**随包副本 `def90af7…`（2026-10-05），原样 vendored 会把一条已知陈旧引用固化成门禁红。故：
- `math-computation.js` 刷新为当前副本（`def90af7…`，与**六份副本全部逐字节一致**）
- `math-engines.js` 原样（本就一致 `a4891a03…`）；`tool-schema.json` 原样（`0552e61f…`）

**重定义**（`tests/audit-math-computation-parity.mjs` 新第 4b 节，按 reader-b 的对齐口径）：比较**语义面** ——
① 导出名 + `typeof`（MC 32 名 ＋ ME 6 名，列表本身被断言，不能悄悄缩水）；② 失败码/参数名**集合**（不重、不多、不少）＋ **可达性**（源码 `fail('MATH_*'` 发射点）；③ `MATH_PARAM_DEFAULTS` 键集与值（`mathEngines` 按**有序**数组）；④ `MATH_TOOL_SCHEMA` 的 `required`/属性键集/每键 `type`/`enum`；⑤ 引擎描述符（`MATH_ENGINE_ORDER` ＋ 每引擎键集 ＋ **`candidates` 顺序** ＋ `ext`/`license`）；⑥ **唯一逐字项**＝注入模型的合同文本行（`MATH_RULE_LINES[0]`、`ARCHIVE_WORKFLOW_LINE`、`SUBSTITUTION_RULE_LINE`，zh/en 都在 `mathAvailabilityLine(...)` 输出里逐字存在且与参考逐字节相等）。**字节对照降为一条具名断言**（冻结标记，不再是判据）。

**证据**
```powershell
PS> node tests/audit-math-computation-parity.mjs
=== MATH COMPUTATION PARITY: 141 passed, 0 failed ===        # EXIT=0（原 122 passed / 3 SKIPPED）
# 非空过性：把"改名一个失败码 + 改一个默认值"的副本经 MATH_COMPUTATION_MODULE seam 注入
PS> $env:MATH_COMPUTATION_MODULE=<mutant>; node tests/audit-math-computation-parity.mjs
FAIL ★ failure codes: same SET as the reference …            # 计数不变也被抓到（集合而非计数）
FAIL ★ param defaults: same key set and same values … ["mathTimeoutMs"]
=== MATH COMPUTATION PARITY: 139 passed, 2 failed ===        # EXIT=1
```
**登记更新**：`docs/14 §2 U13` 与 `docs/11 §8` 已改为"**已 vendored ＋ 判据语义化 ＋ 断言可真红**"，并写明刷新事实与"不声称共享模块语义上绝对正确"。

---

## 3. C · 真机驱动入库（D-05）

- `scripts/dsh-drive.mjs`（自带 296 行，**只用 node 内建**，无同级依赖）——正文与仓外原版**逐行相同**（anchored diff：首行 import 起 254 行完全一致），只重写了头部。
- 头部现在写明 **6 条前置条件**（DSH 宿主 / 装了本包的 scratch profile / ASCII workspace / 空闲端口 / attach 模式的 token / `--out` 写到仓外）、"历史证据在 `_oneoff/vmu/live/**` 是**外部副本**"、以及 playbook 已改为仓内 `docs/slv-playbook.md`。
- 登记 `package.json#files` ✓。

**证据（不能跑真机 ⇒ 具名前置）**
```powershell
PS> node --check scripts/dsh-drive.mjs        # EXIT=0
PS> node scripts/dsh-drive.mjs --port 7791 --cwd D:\_tmp    # 缺 --token
{"step":"fatal","error":"attach mode needs --token"}        # EXIT=1：具名失败，不是静默
```
要跑真机：先 `dsh --profile <scratch> --port <p> --no-open`（从 stdout 取 token），再
`node scripts/dsh-drive.mjs --port <p> --token <TOKEN> --cwd <ascii ws> --preset vibe-math-vmu --task-file <f> --jsonl <out> --timeout 600`。

---

## 4. D · 文档 linter 收口（T0 唯一红 → 0）

`scripts/check-docs.mjs` 现在**显式声明两类卷并断言集合**（新检查项 **D0**）：
- `DESIGN_VOLUMES = 00–13,15–22`；`APPENDIX_VOLUMES = 14,23–28`；
- D0：每个 `NN-*.md` **恰好**归一类（未归类 ⇒ 红）、两类不相交、两类都非空、分类表不得点名不存在的卷；
- **D2/D3/D8/D15 只对设计卷生效**；**D1/D4/D5/D9… 仍对全部卷生效**（没有放宽）。

**真悬空引用与标注**（含 Lead 特批的 `docs/14`/`docs/28` 8 处）：`docs/11` 的 `14-decision-history.md`→`28-decision-history.md`；`docs/14` 同；`docs/28` 的 `05-middleware-and-hooks.md`→`05-middleware.md`；`docs/28` 的三处对照实验引文改写为**不被解析**的形式（保留说明力）；`docs/14:53`/`docs/28:358` 加 **本机**标注；`docs/14:595` 把被引正则写成 `on: \s*…`（**没有**放宽 D9 的盘符判据）。

**证据（含三个方向的反向证明 —— 这是 Lead 要的"不许静默增长"）**
```powershell
PS> node scripts/check-docs.mjs
vmu doc-lint: docs=29  issues=0  notes=24                   # EXIT=0（原 issues=23）
# ② 加一个未分类卷 ⇒ FAIL [D0] 这些卷没有归类…: 29
# ③ 删掉设计卷 15 的 "> 上位" ⇒ FAIL [D2] 15 缺少 "> 上位" 行
# ④ 往附录卷注入未标注的 C:\… 路径 ⇒ FAIL [D9] 23:181 含盘符绝对路径且未标注…
```
**预期内的过期（由 Lead 轮末收敛，不是缺陷）**：`docs/14` 改了行数 ⇒ `docs/00 §7.6` readiness figures 现为 STALE（`generate-readiness-figures.mjs --check` EXIT=1）；同类还有 `docs/04` 设置表（并发 schema 改动）与 `docs/03/05` 的服务/钩子索引块（轮 2 新增面）——都在 Lead 的 `regen-all`/`--write` 覆盖范围内。

### 4.1 ⚠️ 收尾复核时的**新红**（不是我的改动，属 owner）

在**最终复核那一分钟**，`scripts/check-docs.mjs` 报 **EXIT=1，issues=1**（我这边的 D0/D2/D3/D8/D15/D4/D5/D9 全部为 0）：
```
FAIL [D14] 未在 03-§8 登记的错误码: VMU_RESUME_RESTORE_CONFLICT, VMU_RESUME_SNAPSHOT_INCOMPLETE, VMU_RESUME_SNAPSHOT_VERSION
```
**归因**：这三个码出现在 `kernel/resume.js`(3)、`kernel/meeting.js`(3) 以及 `ballot/ballotbox/members/minutes/tasks` 各 1 处，并在 `docs/07`/`docs/08` 有 1 处提及 —— 即**轮 2 断点续跑工作**已接线＋已写文档，但**尚未登记进 `docs/03-§8` 的错误码表**（`docs/03` 属 vmu-core 写范围）。**我没有把这条静默掉**（那样正是 Lead 禁止的"放宽成存在即通过"），已点名 owner 修。
同类检查 `tests/audit-vmu-docs.test.mjs` 也因同一原因 + `docs/04` 设置表 STALE 而为红（EXIT=1），其中设置表属 Lead 的 `--write` 覆盖范围。

---

## 5. 追加项（队友请求，属我写范围）

### 5.1 D-12 · 4 处门禁改读**运行时导出**（vmu-pack，两侧同轮）
`tests/audit-hook-coverage.test.mjs`、`tests/audit-doc-vs-code-tables.test.mjs`、`tests/audit-vmu-docs.test.mjs`、`scripts/generate-surface-index.mjs` ⇒ 全部改为 `import { VU_HOOKS, DEFAULT_FAILURE } from bus.js`（删除源码正则/切片；`generate-surface-index` 头部加 TLA import）。**在 pack 落 bus.js 派生之后复跑**：
`audit-hook-coverage` **4/0 EXIT=0**｜`audit-doc-vs-code-tables` **17/0 EXIT=0**｜`audit-surface-index` **20/0 EXIT=0**｜`generate-surface-index --check` **EXIT=0（块文本未变）**｜`audit-vmu-docs` **79/1**（唯一 FAIL ＝ `vmu settings table: STALE`，来自并发的 schema 改动，与钩子路径无关）。
独立核对派生值：`VU_HOOKS` 22 名唯一、`DEFAULT_FAILURE` 22 键同集合、`DSH_HOOKS` 19、`BRIDGED_HOOKS` 14、`HOOK_REGISTRY` 41、`hookRegistryProblems()=[]`。

### 5.2 D-13 · 活读的**永久断言**（vmu-pack 请求）
新 `tests/vmu-round2-seams.test.mjs`：**一个** kernel 实例、只 `setSettingsValue`、断言**下一次** `assemble()` 生效（overrides / locale.default＋fallbackChain / glossary.mode / glossary.ontology / overridesByLang），并用**负控**证明"实例从未重建"（`kernel.prompt === instanceAtStart`）＋"新 kernel 同设置同值"。
**实测语义（写进测试，避免后来人误判）**：`overridesByLang` 的形状是 **`{ '<section>': { <lang>: 'text' } }`**；语言命中走 `langOrder(asked)` ⇒ 默认链含 `en`，所以 `lang:'zh'` **也会**命中 `en` 覆盖（**是文档化的回退行为**），而链外语言（`fr`）不命中并回退到 plain override。
```powershell
PS> node tests/vmu-round2-seams.test.mjs
=== VMU ROUND2 SEAMS (D-13): 12 passed, 0 failed ===          # EXIT=0
```
（写这条时我自己的第 5c 条断言先红了 —— 我把"不泄漏"写成了"回退到 section 原文"，忽略了 §1 已写入的 plain override；**这次红正好证明该套件不是空过**，已按真实语义改正。）

### 5.3 顺手修：`tests/vmu-round1-seams.test.mjs` 的**硬编码 45**
vmu-pack 实测该套件因轮 2 新增 5 个面（chat/human/mailbox/panel/report）而红。已把 4 处 + 2 处注释的 `45` 改为**从 `FACE_KEYS`/`TOOL_FACES` 派生**，并补两条非空/唯一性断言。
```powershell
PS> node tests/vmu-round1-seams.test.mjs
=== VMU ROUND1 SEAMS: 38 passed, 0 failed ===                 # EXIT=0
```

---

## 6. E · 本轮新测试复核

### 6.1 作用域分类 ✅
`node tests/run-tests.mjs --scope-report` ⇒ **12 个新 `tests/vmu-*.test.mjs` 全部 `IN` vmu 作用域**（无静默排除）；vmu 作用域现 **271 作业（238 套件 ＋ 33 探针）**；quick 仍 **36**。

### 6.2 非空过性：3 条**不在我写范围**的 RULE E 新增指纹（需 owner 处理）
用仓库自己的扫描器 `tests/audit-declaration-criterion.test.mjs --dump-rule-e` 复核（`non-A` 硬失败现已为 **[]**），**当前指纹 70 vs 基线 65 ⇒ 该套件 RED**，新增 3 条全在**任务书排除清单**内的他人文件：

| 文件（owner） | 指纹 | 建议修法（不改语义） |
|---|---|---|
| `tests/vmu-assistant-report.test.mjs`（vmu-assistant） | `A:d.items` | 在该 `.every/for…of` 前加非空断言（`d.items.length > 0`）或 `EMPTY_ALLOWED` 注释说明"空集即合规" |
| `tests/vmu-math-adapters.test.mjs`（v5r-reader-b） | `A:for:WIRED_KEYS` | 同上（`WIRED_KEYS` 是字面量表时可用 `literalNonEmpty` 认可的写法） |
| `tests/vmu-mathjobs-persist.test.mjs`（v5r-reader-b） | `A:for:bus.calls` | 同上（"零调用即合规"则加 `EMPTY_ALLOWED`） |

⇒ 这三条不修，**T1 会在 `audit-declaration-criterion` 上红**。我**未改**这些文件（写范围排除），已在简报里点名到 owner；Lead 也可以选择显式 `--write-baseline`（本仓规矩：要么修、要么显式登记，不静默）。

### 6.3 我自己引入的 2 条已修
`tests/vmu-round1-seams.test.mjs` 的 `names ~ TOOL_FACES`（shape B）与 `want`（shape A）在 §5.3 的改动中引入，已加非空守卫 ⇒ 现在 `non-A=[]` 且我的指纹归零。

---

## 7. 未做 / 交回 Lead

1. **T0 / T1 / `regen-all` / `update-doc-counts --write`**：按 D-11 归 Lead（本轮**未跑**）。预期过期项见 §4 末。
2. **计数会变**：本轮新增 3 个测试/夹具文件（`tests/vmu-round2-seams.test.mjs`、`tests/fixtures/mc-P1-ready/*`）＋ `scripts/dsh-drive.mjs` ⇒ 派生计数与 shipped 计数需 `update-doc-counts` 收敛。
3. **linter 的永久变异族**：D0/D2/D9 的"会红"目前用**临时夹具**证明（命令与结论见 §4），尚未固化成常驻 `*.mutants.mjs` ⇒ 建议下一轮补（这也是本仓"每个守卫都要能被证明变红"的惯例）。
4. **`MATH_SEMANTIC_SURFACE`**：与 reader-b 商定**本轮不做**（要同改 5 份副本 + v5r，属跨预设接口变更）⇒ 下一轮由其出工单再一起改。
5. **矩阵 §5.1 三条空缺**（C-30 / C-45 / C-52）需对应 owner 在轮末给出具名拒或扩展点登记；矩阵 v2 待实现落地后出。
6. **合并本 `03-v5r-full-inventory.md` 的编码缺陷**（§1.1）建议 Lead 重生成。

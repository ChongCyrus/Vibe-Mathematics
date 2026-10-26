# vmu 交接 · Round 13 · task-104 报告（**双登记口径三方对齐 · pack 侧**）

> 本轮**只出结论与表，不改门禁**。所有数字都是本轮**实测**（脚本 `<临时目录>/roster-census.mjs`，仓库外一次性·实测，exit 0）。
> 权威来源＝**门自己的代码**：`tests/audit-installer-policy.test.mjs:253-260`（不是注释、不是 docs）。

---

## 0. 先把两册的**真实语义**钉死（本轮实测 + 门代码）

| 名册 | 位置 | 门怎么算它 | 语义（一句话） |
|---|---|---|---|
| **shipped 名册** | `package.json` 的 `files[]` | 无独立门（由安装器门**间接**用：`shippedFiles = files[].filter(f => f.startsWith(p.src + '/'))`） | **装进 npm 包的文件** ⇒ 相对 `import` 在安装后才能解析（缺了＝`MODULE_NOT_FOUND`） |
| **托管名册** | `installer.js` 的 `PRESETS[].files` | `tests/audit-installer-policy.test.mjs:259`：`unmanaged = shippedFiles.filter(f => !p.files.includes(f) && !EXEMPT.includes(f))` ⇒ **必须为空** | **安装器复制进 `.agent-presets/<id>/` 的文件** ⇒ 预设 JS 的相对 import 在运行时才解析得到（缺了＝运行时 `ENOENT`） |

**两条硬事实（本轮实测）**：
1. **`tests/**` 与 `scripts/**` 永远不参与托管名册**：`installer.js` 里 `tests|scripts` 的命中 —— **代码 0 处**，**注释 1 处**（`:59` 的 `tests/audit-math-computation-parity.mjs`，是"谁守这条"的说明，不是条目）。
2. **托管门只看见"该预设 `src/` 下的 shipped 文件"**：`tests/**`（`files[]` 里 **290** 条）与 `scripts/**`（**21** 条）**不在任何 `src/` 下** ⇒ 既不进托管名册、也**不需要豁免**（它们今天就让 `audit-installer-policy` **ALL GREEN**）。

**`files[]` 实测构成（677 条）**：`tests/**` 290 · `vibe-math-vmu/docs/**` 102 · `vibe-math-vmu/kernel/**` 98 · `vibe-math-vmu/tools/**` 48 · `scripts/**` 21 · **`vibe-math-vmu/packs/**` 18** · `vibe-math-vmu/extensions/**` 2 · `settings/**` 2 · 其余＝其它预设与根文件。

---

## A. **pack 文件类型 → 必须进哪个清单**

| pack 文件类型 | 例子 | `files[]` | `PRESETS[].files` | 为什么 |
|---|---|---|---|---|
| **运行时模块**（被 shipped 入口/清单相对 import） | `packs/v5r/index.js`、`packs/v5r/prompts/v5r-core.js`、`packs/v5r/middleware/*.js`、`packs/v3-core/index.js` | **必须** | **必须** | 两册各挡一种失败：缺 `files[]` ⇒ 安装后 `MODULE_NOT_FOUND`；缺 `PRESETS` ⇒ 安装器没复制 ⇒ 运行时 `ENOENT` |
| **运行时数据**（被 shipped 代码读/解析） | `packs/v5r/settings/defaults.js`（模块）／`defaults.json`（数据）、`packs/v5r/prompts/*.json`、`packs/v5r/prompts/v5r-prompts.js`（生成物、哈希锁定） | **必须** | **必须** | 同上；JSON 也是"被读的路径" |
| **非运行时 pack 文件**（文档/README） | `packs/example-data/README.md` | **视是否随包出货** | **不需要** | 不被任何 shipped 模块 import/读；实测它**今天两册都不在**（19 个 pack 文件里唯一一个） |
| **pack 携带的测试/脚本** | （本仓现状：无） | **不需要** | **★ 不得** | 与 `tests/**`／`scripts/**` 同族：不在 `src/` 下 ⇒ 永不参与托管名册（也**不许**被拖进去） |

**实测对照（pack 目录 19 个文件）**：`files[] ∧ PRESETS` ＝ **18**；`files[] only` ＝ **0**；`PRESETS only` ＝ **0**；**两册皆无 ＝ 1**（`packs/example-data/README.md`）。
⇒ **"在 pack 目录里" ≠ "必须双登记"**；判据是**"是否运行时可达（被 shipped 模块 import/读）"**。

### A 的三次实测依据（R10／R11／R12-13）
| 轮 | 文件 | 实测结果 | 结论 |
|---|---|---|---|
| **R10** | `packs/v5r/middleware/stall-meeting.js` | 进 `files[]` **＋** 进 `installer.js`；缺托管时 `audit-installer-policy` 会红 | **运行时模块 ⇒ 双登记** |
| **R11** | `tests/vmu-stall-meeting.test.mjs`、`scripts/audit-pack-middleware-shape.mjs` | **只进 `files[]`**；`installer.js` 代码命中 **0**；`audit-installer-policy`／`audit-installer-compat` 仍 **ALL GREEN** | **`tests/`／`scripts/` ⇒ 只进 shipped 名册，不进托管名册** |
| **R12-13** | `packs/v5r/middleware/motion-box.js` | 只进 `files[]` 时门报 **`vibe-math-vmu: every shipped file is managed or explicitly exempt — packs/v5r/middleware/motion-box.js`（99 passed / 1 failed）**；补进 `installer.js` 后 **ALL GREEN** | **托管名册对 pack 运行时文件是承重的**（不是形式） |

---

## B. 豁免表形状建议（放哪／字段／防漂移）

**今天的样子（问题所在）**：`tests/audit-installer-policy.test.mjs:258` 里**内联**一行
```js
const EXEMPT = ['v2的额外要求.txt'] // an author note, deliberately not installed next to the preset
```
⇒ ① 只有**路径**，没有理由/批准人/复审期；② 只被**这一个**门看得见（新门若也要豁免，会各自再写一份 ⇒ **第二张表**）；③ 无过期机制。

**建议形状**：**一张仓级表**（`roster-exemptions.json`，放仓库根或 `scripts/` 旁），由**两个门共同读**：

| 字段 | 必填 | 作用 |
|---|---|---|
| `path` | ★ | **精确仓库相对路径**（**不许 glob／通配**：改名即失效，而不是悄悄覆盖新文件） |
| `scope` | ★ | `files[]` ｜ `presets` ｜ `both` —— 明确它豁免的是**哪条规则** |
| `reason` | ★ | ≥1 句，必须**说出为什么登记是错的/不可能的**（不是"暂时没空"） |
| `approvedBy` | ★ | 批准者（人／成员 id） |
| `approvedAt` | ★ | ISO 日期 |
| `reviewBy` | ★ | ISO 日期；**过期即红**（强制重新论证） |
| `condition`（可选） | | 让这行**变得多余**的事件（例："X 落地后删除本行"）⇒ 门可据此在事件达成时**主动提醒/判红** |

**防漂移（六条，建议直接写进门）**：
1. **精确路径、禁止通配** —— 漂移的最大来源就是"glob 悄悄罩住了新文件"；
2. **`reviewBy` 过期 ⇒ 红** —— 豁免有保质期；
3. **陈旧行 ⇒ 红** —— 豁免的路径若**已不再 shipped／不再被 import**，表里留着就是漂移（要求删除）；
4. **条数上限**（建议 ≤5）—— 表在长大＝口径在漏，本身就是信号；
5. **`reason` 必须点出"替代方案为何不行"** —— 与 docs/11 的"未接键必须给原因"同一条纪律；
6. **表必须被门在运行时读取**（**不许**内联进某个测试文件）—— 否则第二张表必然出现（今天的 `EXEMPT` 就是）。

---

## C. `PRESETS` **是否参与**：**分类型回答**

| 类别 | 参与托管名册？ | 实测 |
|---|---|---|
| **`packs/**` 的运行时文件** | **★ 参与（必须）** | vmu 预设的 `packs/**` 条目 **18** 条，与 `files[]` 的 18 条**完全重合**（18/18；`files[] only`＝0、`PRESETS only`＝0） |
| **`packs/**` 的非运行时文件** | **不参与** | `packs/example-data/README.md` 两册皆无（实测） |
| **`extensions/**`** | **★ 参与** | vmu 预设含 **2** 条：`extensions/domain-compliance/index.js`、`extensions/domain-compliance/gate.js`（被 shipped 入口/host 运行时可达） |
| **`tests/**`、`scripts/**`** | **★ 不参与，且不得被拖进去** | `installer.js` 代码命中 **0**（唯一 1 处在注释 `:59`）；`files[]` 里它们共 **311** 条却全部不进任何预设 |
| `vibe-math-vmu/kernel/**`、`tools/**`、`settings/**`、`docs/**`、`host*.js` | 参与（同"运行时可达"口径） | 预设计数：kernel 98 · tools 48 · docs 30 · settings 2 · host*.js 4 |

⇒ **一句话**：**托管名册的判据是"运行时可达"，不是"在某个目录下"**；`packs/**` 与 `extensions/**` 的**运行时**文件都必须参与。

---

## D. 我的意见：**支持扩门禁**，扩在 **`audit-package-membership`**（不新开一个门）

1. **支持扩**，因为最会咬人的失败是 **`files[]` 缺失 ⇒ 安装后 `MODULE_NOT_FOUND`**（R10/R12 都是**先**被这个咬到）。
2. **扩在哪一层**：**扩 `audit-package-membership`**（它**已有 import 闭包逻辑** ⇒ 增量最小、不复制闭包算法、单一 owner）。**不**新开门：新门＝第二套闭包逻辑＋第二张豁免表（与 B 的防漂移第 6 条直接冲突）。
3. **两条规则分居两层，共用一张豁免表**：
   - `audit-package-membership`：**被 shipped 模块 import/读的路径 ∈ `files[]` ∪ 豁免表**；
   - `audit-installer-policy`（现有，**不新增语义**）：**`src/` 下的 shipped 文件 ∈ `PRESETS[].files` ∪ 豁免表**（把内联 `EXEMPT` 换成读同一张表）。
4. **必须带"精度护栏"**（否则会红成噪声）：闭包只看**静态、运行时**的 `import`／`require`／`readFile` 路径；**非运行时**（dev-only、动态/条件 import、docs 引用、测试夹具）一律走**具名豁免**——这正是 verify 的结论，我同意。
5. **★ 建议同时加一条反向断言**（本轮实测支撑）：**`packs/**` 里进了 `files[]` 的文件必须也在 vmu 预设里**（今天 18/18 成立）⇒ 把"漏了托管名册"从"人肉记得"变成"门会说"。这条与 3 的第二条同源，实现上可共用一次遍历。
6. **判据四条我全部同意**（种"被 import 未登记"⇒红／删⇒绿／豁免逐条带理由／**不把 `tests/`、`scripts/` 拖进 `PRESETS`**），并建议把第 4 条**写成门的断言本身**（不是文档口号）：门应断言 `PRESETS[].files ∩ (tests/** ∪ scripts/**) === ∅`。

---

## E. 附：一条与本议题直接相关的**环境事故**（R13 实测）——★ 后经 vmu-verify 审计更正归因

**我的原始观察（如实保留）**：`packs/v5r/middleware/motion-box.js` 在 R13 收尾时两次从工作树消失（第一次：写完并通过 `node --check`／`vmu-pack` 之后；第二次：`installer.js` 登记之后），两次都用备份 `<临时目录>/motion-box-backup.js` 复原（哈希一致）；本轮 `pack-round13-report.md` 也出现过"写完后再读不到"。

**★ 更正（vmu-verify 的删除路径审计，2026-10-23）**：这两次都**不是被清理掉的**——
1. `_handoff/` **整体搬进了 `docs/acceptance/`**：本报告现在就在 `docs/acceptance/pack-round13-report.md`（旧路径只作为历史引用留在 `docs/acceptance/04-parity-matrix.md:22,437,459` 与 `tests/audit-claim-traceability.test.mjs:60` 的注释里；`tests/audit-doc-index.test.mjs:73` 专门 `continue` 跳过 `_handoff`，说明它早被当作已迁走）。⇒ 报告的"消失"＝搬迁。
2. `motion-box.js` **现在存在且两册齐**（`package.json:428` ＋ `installer.js:60` 的 PRESETS files 数组）。⇒ 当时那次"消失"的原因**至今未能归因**，但可以排除"仓库内自动删除"：`scripts/clean-temp.mjs` 只扫**临时根目录顶层**且要求"已知套件前缀 ＋ 超过 ageHours"，root 默认是 `tmpdir()`／`D:\_tmp`，**不指向仓库**；`scripts/audit-projection-census.mjs:83` 的 ROOT 也在临时目录；`tests/**`＋`scripts/**` 里所有 `rmSync/unlinkSync/rm -rf` 删的都是各自 `mkdtempSync` 的 scratch，**没有一处以仓库根为根**，也没有按时间窗扫仓库的脚本。
3. 唯一真实的窄口子：`scripts/clean-temp.mjs --root=<dir>` 是**人工**参数（`:23`），若被手工指向仓库就会按"前缀＋年龄"扫。**vmu-verify 将加守卫**：`--root` 解析后落在仓库根之内 ⇒ 具名拒绝（`CLEAN_TEMP_ROOT_INSIDE_REPO`），并保留 `--dry-run` 先看计划。

**教训（保留）**：登记是承重的（未登记/未跟踪的文件在搬迁与清理中都没有名单可依）；但**"文件不见了"要先查搬迁与名单，再谈清理** —— 我当初把"未归因"写成了"可能与清理有关"，这是推断冒充观测，本次更正。

---

## 验证（原样命令 + 退出码）

| 命令 | 退出码 | 读数 |
|---|---|---|
| `node <临时目录>/roster-census.mjs` | 0 | `files[]` 677；pack 19 个文件：双册 18／仅 files 0／仅预设 0／皆无 1；`installer.js` 的 `tests|scripts`：**代码 0／注释 1（:59）**；`PRESETS` 6 个（vmu 208 条：packs 18、extensions 2、tests|scripts 0） |
| `node tests/audit-installer-policy.test.mjs` | 0 | **ALL GREEN**（豁免表今天内联 1 条） |
| `node tests/audit-installer-compat.test.mjs` | 0 | **ALL GREEN** |
| `node tests/audit-pack-face.test.mjs` | 0 | 5/0（pack 文件必须被 `docs/27` 点名） |
| `node tests/vmu-motion-box.test.mjs` | 0 | 22/0（R13 新政策常驻断言） |
| `node tests/vmu-pack.test.mjs` | 0 | 53/0 |

## 未做项 / 待他人

1. **门禁扩口径**（`audit-package-membership` ＋ 共用豁免表）⇒ **vmu-verify**（门 owner）；本轮我**只出结论与表**，未改门。
2. **`docs/11 §6.1` 的流程一步**（core 已落）＋ 本报告 A 表可并入该处或 `docs/27 §6`（我已把压缩版写进 `docs/27 §6`）。
3. `installer.js` 的内联 `EXEMPT` 换成共用表 ⇒ 归 verify（该文件不是我的写范围）。

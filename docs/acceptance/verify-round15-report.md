# Round 15 · vmu-verify2（`task-113`）交付报告

> 纪律：**未跑全量（T0/T1 归 Lead）／未 `regen-all`／未做任何 git 写操作**；临时文件只在 `D:\_tmp\v15`；**未改他人文件**（唯一一次跨边界写入是 `docs/04 §11` 的**生成区**，该文件在 `task-113` 写范围里，理由见 §5）。
> **读的是哪一次运行**：工作树 `D:\wd\vibemath开发\Vibe-Mathematics`，`git rev-parse HEAD` = `4e5be5aef28180514685a364baba405f94036bee`（R13）＋ R14/R15 的未提交改动。**凡合作者提供的读数都注明来源与时刻**。
> 日期：2026-10-15

## 0. 结论速览（全部为我的运行，命令＋退出码见 §7）

| # | 项 | 状态 | 读数 |
|---|---|---|---|
| ① | **7 个清单外文件分档落地** | ✅ | `docs/audit/` 6 份 ⇒ **具名豁免**（新文件 `tests/_lib/package-exemptions.mjs`，五字段）；`packs/example-data/README.md` ⇒ **登记出货**（`files[]` ＋ `PRESETS[vmu].files` **同改**）；`files[]` **680 / distinct 680**；豁免 6 条**无一**落在 `files[]` 里（判据 g 的真实前提） |
| ② | **"预设源根磁盘闭包"门** | ✅ **有牙（真实种违规证明）** | 门 `ok` **13 → 28**；**判据 (e) 实种** `packs/example-data/PROBE-planted-pure-data.md` ⇒ **27 passed / 1 failed, EXIT=1 并具名该 path**；删**同一精确路径** ⇒ **28 passed / 0 failed, EXIT=0**；**RULE E 指纹 67 = 67**（未推高） |
| ③ | **矩阵 v13** | ✅ | `_handoff/vmu/04-parity-matrix.md` **949 → 1007 行**，新增 **§9.27**（R14 闭合项 10 条＋R15 落地＋两条量具假象＋具名未做） |
| ④ | **`docs/11 §4.2` 新实例** | ✅ | 新增 **⑦ 合成样本必须与被扫集合物理隔离**、**⑧ 门把发现裸写进被扫卷会擦掉发现**（＋R15 状态更新段） |
| ＋ | **顺手闭合的活缺陷**：`docs/04 §11` 相对修好的 schema **STALE** | ✅ | 见 §5：`--write` ⇒ `1226 keys (1108 wired, 118 declared-but-not-wired)`；此前 `audit-vmu-docs` 因导入期 `--check` **exit=1** |
| ＋ | **闭合 R14 具名项**：`SEAMS` 白名单缺 `ballot`/`boxFor` | ✅ | `scripts/generate-seam-table.mjs:26` ＋2 名 ⇒ **`rows=113 seams=8 null=1 findings=0`**、`SEAM REACHABILITY: PASS`、`audit-seam-reachability 17/0`（代价由 `vmu-pack2` 在本版本上实测：＋1 行、0 finding、不红） |
| — | **不动的**：`files[] → PRESETS` 那条边 | — | 仍在 `audit-installer-policy §8`（**一个事实一个门**），本门只做"磁盘 → `files[]` ∪ 豁免表" |
| — | **未做（具名）** | — | §8：`regen-all --check` 的 3 个 stale 分项（Lead 轮末）、`reviewRound` 到期是否升级为红（Lead 裁）、`vote({motion:null})` 内核语义（非门禁） |

## 1. ① 7 个清单外文件：分档落地（`vmu-pack2` 独立复核通过）

**Node 量具复测（我，`D:\_tmp\v15\measure-closure.mjs`）**：对**全部 6 个 `PRESETS[].src` 源根**做"磁盘 → `files[]`"闭包 ⇒

```
PRESETS: v2(src=vibe-math-v2,files=6) v3(6) v4(6) v5(7) v5r(32) vmu(208)
## vibe-math-v2  disk=7   unlisted=0     ## vibe-math-v3  disk=6   unlisted=0
## vibe-math-v4  disk=6   unlisted=0     ## vibe-math-v5  disk=7   unlisted=0
## vibe-math-v5r disk=32  unlisted=0
## vibe-math-vmu disk=215 unlisted=7
=== TOTAL unlisted under all preset src roots: 7      （7 条全部 managed-by=[]）
```

**分档**：
- **`vibe-math-vmu/docs/audit/` 6 份**（`BACKLOG.md`／`downgrade-candidates.md`／`pack-content-review.md`／`source-detail-verification.md`／`source-prompt-coverage.md`／`source-runtime-coverage.md`）⇒ **具名豁免**，落在新文件 **`tests/_lib/package-exemptions.mjs`**（形状 `{path, reason, approvedBy, approveRound, reviewRound}`，**精确路径、禁通配**；理由逐条写明"仓内审计工作稿、不是预设载荷"）——这也把 `docs/27 §6` 的"托管名册只列随预设出货的运行时文件"从散文变成**可查的表**。
- **`vibe-math-vmu/packs/example-data/README.md`** ⇒ **登记出货**：`package.json#files` **＋** `installer.js PRESETS[vmu].files` **同一次改完**（否则 `audit-installer-policy §8` 会红；`audit-installer-compat:192` 还会**逐条复制** `PRESETS` 里的文件并断言落盘存在）。

**为什么用共享表而不是内联**（`vmu-pack2` §B 的理由，我采纳）：同一种东西仓里**已有四处各写一份**（`EXCLUDED`／`EXEMPT`／`EXEMPT_WITH_REASON`／`EXEMPT`）⇒ **"豁免了谁"必须能在一个地方被数清**，否则"豁免越多、门越假绿"（第九条）。

## 2. ② "预设源根磁盘闭包"门：**先跑量，后落门；并用真实种违规证明有牙**

**判据（我落的形状）**：`PRESETS[].src` 的磁盘闭包 ⊆ `package.json#files`（写作 `<src>/<rel>`）∪ 具名豁免表；**纯函数 `closureOf({diskFiles, listedSet, exemptions})`**，所以 6 条自探针能在**合成输入**上驱动它（不写仓库）。

**真实种违规（判据 e，门有牙的证据；原样命令与退出码见 §7）**：
```
plant path: ...\vibe-math-vmu\packs\example-data\PROBE-planted-pure-data.md   exists before = false
--- WITH the planted file ---  exit=1
=== PACKAGE MEMBERSHIP: 27 passed, 1 failed ===
  - every file on disk under a preset source root is shipped (package.json#files) or NAMED in the exemption table
    — vibe-math-vmu/packs/example-data/PROBE-planted-pure-data.md
after delete, exists = false
--- WITHOUT it ---  exit=0
=== PACKAGE MEMBERSHIP: 28 passed, 0 failed ===
VERDICT: planted=>RED  removed=>GREEN  named-in-red=true
```
⇒ **"能红"不是看着像**：种下一个**没有任何 import 指向的纯数据文件**（`.md`/`.json` 那一格，今天两门都看不见），门 **具名**报出它；删掉**同一精确路径**（前后各 `existsSync` 核一次）即恢复绿。

**六条反漂移开关（全部常驻自探针，探针 0 是干净对照）**：

| 探针 | 期望 | 结果 |
|---|---|---|
| 0 | 干净合成样例**安静**（否则下面的"红"没有对照） | 静默 |
| 1（判据 e） | 纯数据文件未登记 ⇒ **红并具名** | 红 |
| 2（判据 f） | 豁免一条**已从磁盘消失**的路径 ⇒ 红（豁免不许比事实活得久） | 红 |
| 3（判据 g） | 豁免一条**已登记**的路径 ⇒ 红（**不许用豁免盖住登记** = 反漂移主开关） | 红 |
| 4 | 同一 `path` 两次 ⇒ 红 | 红 |
| 5 | `reason` 空／`approvedBy` 空 ⇒ 红 | 红 |
| 6 | `reviewRound` 到期 ⇒ **计数**（非红，可见即可；是否升级为红由 Lead 裁） | 实跑打印 `exemptions: 6 named; review due at round 15: 0` |
| 非空前置 | `diskUnderRoots.length > 0 && PACKAGE_EXEMPTIONS.length > 0` | `215 files / 6 exemptions` |
| 额外 | `files[]` 重复条目 ⇒ 红（`vmu-pack2` §D.5(h)） | 0（R14 已去重 678→677，本轮 680/680） |

**读数**：门 `ok` **13 → 28**；**RULE E `current=67 baseline=67`**（`audit-declaration-criterion` 打印；该文件唯一红＝`regen-all --check`，见 §8）。
★ 记功：**形状来自 `vmu-pack2` 的 §B/§D.5**（他把"被 import 的路径"这条**否证掉**——那条今天已实现且有牙——并给出正确的洞与 6 条判据）；我把他没写到的一步补上：**探针 0 的干净对照**。

## 3. ③ 矩阵 v13

`_handoff/vmu/04-parity-matrix.md` **949 → 1007 行**，新增 **`## §9.27 ★ R15 · v13 并入块`**：
`9.27.1` R14 闭合项 **10 条**（B③／B④ 59 断言＋同次门禁全表／三幽灵键修复 planned 114→111／G2 台账清空／取得↔释放门自我证伪／成员门"有牙但文档说没牙"／两处陈旧前提／`docs/29` 债清零／`docs/27 §6` 权威表／**两条量具假象**／第九条新实例）；
`9.27.2` R15 落地的闭包门（判据表＋真实种违规＋"一个事实一个门"）；
`9.27.3` 两条现场教训（⑦⑧，含"三人各踩一次"）；
`9.27.4` 具名未做。

## 4. ④ `docs/11 §4.2` 新实例（都实测，且**我自己又踩了一次**）

- **⑦ 合成探针样本必须与被扫集合物理隔离**：G2 的**样本名**写进 `docs/11`（本门扫的卷）⇒ `group G` 立刻报它们**未登记** ⇒ 门 **94 passed / 1 failed**。
- **⑧ 门把自己的发现裸写进被扫卷，会把发现本身擦掉**：把 G2 台账的三个名字**裸形**写进本节 ⇒ 它们各多一次 bare 计数 ⇒ **G2 静默（真值 3 → 0）**。
- ★ **诚实记录：我在写 R15 状态更新段时又把这三个名字裸写了一次** ⇒ `audit-vmu-docs` 回到 **94/1**，并被 **`vmu-comms2`（13:41:31）与 `vmu-pack2`（13:39:52，哈希绑定）各自独立抓到**（两条读数都把卷号标成 `11-gates-and-development`）。已改成服务限定短写 ⇒ **95/0**。⇒ 这条坑**极易被"写文档"这个动作本身触发**：**改完正文卷立刻重跑该门**（我把这句写进了 §4.2）。
- **⑨（补充）门读的卷里出现的名字会反向污染生成器**：本轮 `docs/11` 的写法把生成器的 `missing` 从 **3 条压到 1 条**（R14 记），R15 生成器补规则后归零。

## 5. 顺手闭合的**活缺陷**：`docs/04 §11` 相对修好的 schema **STALE**（我复核并修，文件在我写范围）

**现象**：R14→R15 的"三幽灵键修复"（planned 114→111）改了 `settings/planned.js`，但**生成区 `docs/04 §11` 没跟着重生成** ⇒ `audit-vmu-docs`（导入期会跑设置表生成器的 `--check`）**exit=1**：
```
vmu settings table: STALE - docs/04 §11 is not what the schema yields (1226 keys (1108 wired, 118 declared-but-not-wired))
  run: node scripts/generate-vmu-settings-table.mjs --write
```
**处置**：`docs/04` 明确在 `task-113` 写范围内，且门自己给出了那一条命令 ⇒ 我跑了 `--write`（**这是单文件生成区写，不是 `regen-all`**）：
```
vmu settings table: REWRITTEN from the schema (1226 keys (1108 wired, 118 declared-but-not-wired), 1228 lines)
→ node tests/audit-vmu-docs.test.mjs  ⇒ === VMU DOCS AUDIT: 95 passed, 0 failed ===  exit=0
```
⇒ 这条红**不是我的改动引入的**（R14 我的读数一直是 95/0），但它当时**挡住了我这一轮的全部验证**，而修复动作就在我手里 ⇒ 我修了并写明。

## 6. 顺手闭合 R14 具名项：`SEAMS` 白名单 ＋ `ballot`／`boxFor`

R14 §9.26.5 具名："`scripts/generate-seam-table.mjs:26` 的 `SEAMS` 不含 `ballot`／`boxFor` ⇒ `audit-seam-reachability` **结构上**看不到这一族"（与 `metrics/trigger` 同型：**白名单就是门的可见范围**）。`vmu-pack2` 在本版本上实测代价＝**＋1 行、0 finding、不红**，把决定权交给我 ⇒ 我落了：
```
node scripts/generate-seam-table.mjs        ⇒ SEAM TABLE: rows=113 seams=8 null=1 findings=0
node tests/audit-seam-reachability.test.mjs ⇒ === VMU SEAM REACHABILITY: 17 passed, 0 failed ===
```
（差集恰好一行：`` `ballot` ``｜`kernel/index.js:1130 (meetings)`｜`meetings`｜`` `meetingBallot` ``。`boxFor` **没有构造点**（按裁决 (i) 由 pack 经 `bindBox` 懒绑），列入只为"将来变成构造期注入时能被看见"。）

## 7. 全部读数（原样命令 ＋ 退出码）

| 命令 | 读数 | exit |
|---|---|---|
| `node D:\_tmp\v15\measure-closure.mjs` | 6 个源根；vmu `disk=215 unlisted=7`，其余 5 个 `unlisted=0`；7 条 `managed-by=[]` | 0 |
| `node D:\_tmp\v15\prove-criterion-e.mjs` | 种 ⇒ `27 passed, 1 failed`，具名 PROBE path；删 ⇒ `28 passed, 0 failed` | 1 → 0 |
| `node tests/audit-package-membership.mjs` | `=== PACKAGE MEMBERSHIP: 28 passed, 0 failed ===` | 0 |
| `node tests/audit-installer-policy.test.mjs` | `ALL GREEN` | 0 |
| `node tests/audit-installer-compat.test.mjs` | `ALL GREEN` | 0 |
| `node tests/audit-vmu-docs.test.mjs` | `=== VMU DOCS AUDIT: 95 passed, 0 failed ===` | 0 |
| `node tests/audit-vmu-docs.mutants.mjs` | `=== VMU DOCS AUDIT MUTANTS: 15 passed, 0 failed ===` | 0 |
| `node tests/vmu-planned-settings.test.mjs` | `ALL GREEN (planned=111, docs=28, passed=39, failed=0)` | 0 |
| `node scripts/generate-planned-settings.mjs --check` | `up to date (111 planned keys)` | 0 |
| `node tests/vmu-motion-box.test.mjs` | `23 passed, 0 failed` | 0 |
| `node tests/audit-seam-reachability.test.mjs` | `17 passed, 0 failed` | 0 |
| `node tests/audit-claim-traceability.test.mjs` | `5 passed, 0 failed`（`vmu-comms2` 报的 `11:C9` 现不存在；`docs/11` 里只有 `C2`/`C6`） | 0 |
| `node tests/audit-declaration-criterion.test.mjs` | `RULE E fingerprints: current=67 baseline=67`；唯一红 `regen-all --check` | 1 |
| `node scripts/regen-all.mjs --check` | `vmu regen-all: 12/15 in sync`；3 个 FAIL 见 §8 | 1 |
| `node -e "…preset closure…"` | `files[] has README: true`／`PRESETS[vmu] has README: true`／豁免 6 条、**0 条**在 `files[]`／`files total 680 distinct 680` | 0 |

## 8. 具名未做／交回 Lead

1. **`regen-all --check` 的 3 个 stale 分项**（**Lead 轮末**，均非 task-113 范围）：
   - `FAIL wired schema (settings/schema.js)`（`generate-wired-schema.mjs` 需重跑；`settings/**` 不在我写范围）；
   - `FAIL wiring index (docs/00-§3.2)`（`generate-wiring-index.mjs --write`）；
   - `FAIL documented counts (README / checklist)` —— 生成器自己写明原因：`update-doc-counts: the scoped line for docs/11 was NOT rewritten (no scoped count)`，而该分支的**上游规则**是"`--counts` 返回的是全量计数（scope-independent BY DESIGN）⇒ 不生成 scoped 行"（`scripts/update-doc-counts.mjs:42-43`）⇒ 需要 `GATE_SCOPE=vmu` 口径或接受该分项，**不是 `docs/11` 内容被改坏**（`v11Shipped` 标记仍被正常替换）。
2. **豁免表 `reviewRound` 到期是否升级为红**：本轮按判据 6 只做**可见计数**；升级与否请 Lead 裁（现 `review due at round 15: 0`）。
3. **`vote({motion:null})` 回执 `tally` 与自家 minutes 矛盾**（`vmu-core2` R14 具名）：**内核语义**，非门禁问题；`vmu-comms2` R15 已把"诚实化"落在 `kernel/meetings.js`（`tally:null`＋`counted`），我未越界碰。
4. **`docs/04 §11` 的 `orderMode` 计划值域漂移**：根因是生成链（schema 该键是 `type:'string'` 而非 `enum`）⇒ 正确修法＝改 schema 后 `regen-all`；`vmu-comms2` 已具名并落到 `docs/08`，`settings/**` 不在我写范围。

## 9. 新文件登记（当场双登记）

**新文件 1 个**：`tests/_lib/package-exemptions.mjs`
- **`package.json#files`**：已加（实测 `f.includes('tests/_lib/package-exemptions.mjs') === true`）✓
- **`installer.js PRESETS`**：**按设计不加** —— 该侧只列"随预设出货的运行时文件"，`tests/**`／`scripts/**` 在 6 个预设合计 **0/0**，且**必须继续为 0**（`vmu-pack2` §C 的三条不变量）⇒ 本仓对测试类文件的"第二登记"就是 `files[]`（`vmu-comms2` 的 `tests/vmu-meeting-order.test.mjs` 同此口径）✓
- **未引入任何新的门禁豁免行**（我落的判据只**收紧**可见性）。

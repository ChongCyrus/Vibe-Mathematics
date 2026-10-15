# Round 26 · `vmu-verify2`（`task-142`）交付报告 —— 断言交付 ＋ `task-141` 复核基线 ＋ 矩阵 v18

> 纪律：只读复核为主（本轮**仓内只写**：两个**新**测试文件 ＋ `package.json` 定点登记两行）；未跑全量／`regen-all`／git；临时文件 `D:\_tmp\v26`。
> **读的版本**：HEAD `a43742f`；`entry 158295C05917AFC0`（1106L）／`host.js` 在我复核中两次变动（`C9F597A24CB8C933` → `5DD826C163F80838` → **`B95AE9B3511AA48E`**，1074L）／`docs/29 D162623092769718`／`package.json` 由 `C9E3E2F311A68C56` 变为登记两行后。
> 交付：**`§9.32 v18`（矩阵 1346 → 1416 行，sha256[0:16] `3670F59665D671A1`）** ＋ 两个新文件。

## A. 交付：「设置只能加、不能减」常驻断言（**新文件**，两向能红）

| 文件 | sha256[0:16] | 读数 |
|---|---|---|
| `tests/vmu-packs-add-not-remove.test.mjs` | `3A52C209921D487E` | **12 passed / 0 failed，exit 0** |
| `tests/vmu-packs-add-not-remove.mutants.mjs` | — | 变异器（`exit 0`；其内部三次变异各自 `exit=1`） |
| `package.json#files[]` | 定点 `edit` | 两行登记 ⇒ `audit-package-membership` **29/0**、`audit-scope-classification` **38/0** |

**四组断言（每组非空前提）**：① **加**：设置键 id ⇒ **v5r 条目真的上总线** ＋ `packSources[].via === "vmu.packs.active"`；② **试图减**：`config.packs:['v5r']` ＋ 设置空表 ⇒ **仍装** ＋ **原因可读**（`via === "config.packs"`）＋ 条目集合与"加"臂**完全相同**；③ **两处同声明** ⇒ **恰一条请求、来源仍 `config.packs`**；④ **哪儿都没声明** ⇒ 静默（不制造装载）。
**两向能红（只变异 `D:\_tmp` 副本）**：
```
CONTROL exit=0  12/0（副本 sha ≡ 真树）
M-A 设置不能加 ⇒ exit=1  8/4   FAIL 前提｜★到达总线｜★via 具名｜集合相等
M-R 设置真能减 ⇒ exit=1  5/7   FAIL 前提｜★仍在装｜★via=config.packs｜集合相等
M-B 去掉去重   ⇒ exit=1 10/2   FAIL ★恰一条｜★来源仍 config.packs（stderr 另现 VMU_PACK_CONFLICT … already applied）
```
★ **"被具名"照实说**：代码里**没有**显式"删除被忽略"字段；现在可读的具名是 **`packSources[].via`**。若要显式忽略告警，那是**尚未实现**的增强 —— 本断言不假装它存在。

## B. `task-141` 复核：**先核状态** ＋ 两条对前提的更正

**状态（纪律①现场）**：`task-141`＝**`in_progress`，owner `vmu-pack2`**，工作树 `host.js` 正在改，`defaultsFolded`／`defaultsUnfolded`／`notPublished` **此刻尚未出现** ⇒ 判定 **"在飞、未落"**，不是"未完成/被遗忘"。
**我的基线读数**（走真状态工具；`node D:\_tmp\v26\baseline-141.mjs`、`…-defaultfaces.mjs`，均 exit=0）：

| 面集配置 | 路线 | 注册工具 | `faces.enabled` | `faces.published` | `defaults` | registered−published |
|---|---|---|---|---|---|---|
| `faces:['*']` | 设置键 | **53** | 53 | 53 | **0** | **[]** |
| `faces:['*']` | `config.packs` | **53** | 53 | 53 | **43** | **[]** |
| 默认 | 设置键 | **7** | **4** | **7** | **0** | **[]** |
| 默认 | `config.packs` | **15** | **14** | **15** | **43** | **[]** |

1. ★ **更正一**：**`task-141` 的 "(v) 回执少报已注册面（15 注册 vs 13 发布）" 我在四种配置下都测不到** —— 两向差集**全部为空**（`4/7`、`14/15` 两格里 `published` **就等于**注册面）⇒ **该前提在我这一版不可复现**（不据此判错，只报"读数不支持"；请其 owner 在同一次运行里重测）。
2. ★ **更正二**：**不对称是配置条件性的** —— `faces:['*']` 时两路线**都是 53/53/53**（只差 `defaults: 0 vs 43`）；只有**默认面集**才出现 `4/7` vs `14/15` ⇒ 两格验收 **(i)** 必须在**默认面集**下跑（否则等号恒真）；**(ii)** 的基准应是 **`published`** 而非 `enabled` —— 实测 `config.packs` 路线 **`enabled=14` 而注册/发布=15**（**`report` 面未列 `enabled`，但 `vibe_vmu_report` 已注册并发布**；`faces.sources['report']` 两路线皆 `undefined`）⇒ 拿 `enabled` 比等号**即使修好也永远差 1**。
3. ★ **`faces.sources` 形状（对"(乙) 不是静态桶"的实测答复）**：**per-face reason 映射，且 reason 同源于真实声明键** —— `config.packs` 路线 `sources['turn']＝"setting:vmu.turn.*"`、`sources['status']＝"always (the inert default must be observable)"`；**设置键**路线 `sources['turn']＝undefined`（该面没启用）⇒ **机制已是 (乙) 形状** ✓；但**"缺失的面"在 `sources` 里没有条目** ⇒ 那正是 `notPublished:[{face,reason}]` 要补的格子（否则"缺席"与"未被解释"同形）。

## C. `docs/29` 两行：**在已提交树上仍为假**（附哈希与逐字）

`docs/29-build-your-own-preset.md` sha256[0:16] **`D162623092769718`**（442 行），`不装载` 命中 **5** 处；逐字：
- `:263` `packs: { active: ['v5r'] }        # ⚠ 这一行【不装载 pack】—— 见下方「★ 装载路线」`
- `:306` `vmu: { tools: { faces: ['*'] }, packs: { active: ['v5r'] }, report: {…} }   # ⚠ \`packs.active\` 只是设置键：**不装载 pack**（见上）`
而同文件 `:280` 已改成"★ **R25 起：真装载** ✓（**推荐日常调控**）"＋`~~不装载~~` ⇒ **同文件自相矛盾，且被抄的是内联注释那两行** ⇒ **再报 Lead**（pack2 称已更正，但已提交树上未变）。

## D. 矩阵 v18（§9.32）＋ 纪律三则

`§9.32.1` 五件「测量环境的同一性」（M-1 payload 哈希／M-2 解码帧完整性／M-3 `await` 指纹／M-4 装载 settle／M-5 同刻同源）＋伴随件 M-6 因式分解；`§9.32.2` A 交付；`§9.32.3` B 基线＋两条更正；`§9.32.4` C；**`§9.32.5` 纪律三则**：★ **"列在队列里" ≠ "尚未完成"**（报归属前先核状态）／★ **"没 grep 到" ≠ "不存在"**（要问"谁声明它"就读 `faces.sources`，别自己拼前缀）／★ **量具而非被测物**（本轮三条错全是量具：字面前缀 grep／`execute()` 返回**字符串**／`calls≠distinct` 只在名字重叠时有效），并与既有族合并为**「观测通道的自造假象」**；`§9.32.6` 具名未闭合。

## E. 门禁（我这一轮同一次运行）

| 命令 | 读数 |
|---|---|
| `node tests/vmu-packs-add-not-remove.test.mjs` | **12/0，exit 0** |
| `node tests/vmu-packs-add-not-remove.mutants.mjs` | exit 0（三次变异内部 exit=1） |
| `node tests/audit-package-membership.mjs` | **29/0，exit 0** |
| `node tests/audit-scope-classification.test.mjs` | **38/0，exit 0** |
| `node tests/vmu-packs-active-switch.test.mjs`（pack2 的） | **24/0，exit 0** |
| `node tests/audit-declaration-criterion.test.mjs` | **86/2，exit=1**：① `regen-all --check`（`documented counts`，**Lead 轮末**；我登记两行使其 +2）② ★ **`RULE E` shape B：`vmu-pack-defaults-named.test.mjs:77`（**pack2 的新文件**，`lost` vs `LOST_TOOLS` 两侧可能皆空的等号断言）** ⇒ **不是我引入的**（我的文件 `RULE E 67=67`、`multi-line C 57=57` 未动） |
| `node scripts/regen-all.mjs --check` | 唯一 stale＝`documented counts`（by-design 分支） |

## F. 具名未闭合（交 Lead）

1. **`task-141` 未落**（`in_progress`）：三字段缺席；其 "(v) 回执少报" 前提**我四种配置下不可复现**；两格验收须在**默认面集**下、且 **(ii) 以 `published` 为基准**。
2. ★ **`vmu-pack-defaults-named.test.mjs:77` 的 RULE E shape B**（**会挡 T1**）⇒ 归 pack2（其写范围）。
3. **`docs/29:263`／`:306`** 仍为假（§C）。
4. **"设置试图删除"无显式告警字段**（§A 末）—— 未实现的增强。
5. **`systemPrompt` 仍不可达**（具名降级，不影响装载与阈值开火，单独记）。

---

## G. ★ 收轮更新（`vmu-pack2` 交付后我复核；本节**取代** §E 的两条红与 §C 的 docs 判定）

**读的版本**：`host.js` **`D4C3BCE3D973CB84`**／`docs/29` sha **`FBEB5AAB7D6FCA23`**。

1. **`RULE E` 第四次的红：已修并已核** —— `vmu-pack-defaults-named.test.mjs:77` 改为**同一表达式内非空前置**；我复跑 **`audit-declaration-criterion` 88 passed / 0 failed**（shape B 已修，**`regen-all --check` 也回绿**）⇒ §E 表里的 **86/2 作废**；`RULE E 67=67`／`C2 57=57` 未动 ✓。
2. **`docs/29` 两行：已修** —— sha `FBEB5AAB7D6FCA23`，`不装载` **5 → 3**（余 3 处全在 `:280`／`:291` 更正块内、故意保留）；`:263`／`:306` 现在写"★ R25 起**真装载**，但**只装 middleware/rules、不折入 `settings/defaults.json`**" ⇒ **§C 的"仍为假"作废**（"连哈希与逐字一起报"使这次更正**可判定**）。
3. ★★ **"(v) 回执少报"：现象真实，我构造前态复现了它** —— 只在 `D:\_tmp` 副本上把 `host.js:440` 的 `publishedSurface` 接缝去掉（其 `:441` 回落正是"本次评估的名字"）：
   - 对照（未变异）：`config.packs` **15/15**（`evaluations=2`）、设置键 **7/7** ⇒ 差集全空；
   - **前态**：`config.packs` **15 注册 / 13 发布**、差集 **`["vibe_vmu_middleware","vibe_vmu_report"]`**（与其所报**逐字相同**）；设置键 **7/4**、差集多一个 `vibe_vmu_meeting`。
   ⇒ ★ **更正我 §B 的"更正一"**：我当时写"四配置都测不到 ⇒ 读数不支持该前提" **框架过强** —— **我读的是已修好的树，差集全空恰是 (v) 生效的证据**。我虽注明"`host.js` 正在改、在飞读数"，但仍把空差集当成反驳 ⇒ 并入量具族：**"测不到"必须与"测的是哪一版"同时声明**（本会话**第六次读数随树漂移，且这次在我的结论上**）。★ 我**没有**写成"不存在"（第八条守住），但**框架强度**没守住。
4. **仍开着两条（具名转 Lead）**：① owner 自陈**未证**：把折入输入集改成有效请求表 ⇒ 按设计 `①` 应红，**实测仍 21/0 绿** ⇒ **`A2`（`defaults===0`）不能声称能抓"偷偷强补折入"**（假设：`settings` 在该作用域形态不同）；② **`report` 面 `published` 却未进 `enabled`**（`enabled=14` vs 注册/发布 **15**）⇒ owner 具名为**第四条"回执两个字段讲不同的事"**（与 `notPublished` 互补：一报"缺席"、一报"在册未列名"），**本轮未动**（改它会动面订阅语义）⇒ 待裁。
5. **§A 的照实口径保持**（"删除被忽略"无显式字段；现有具名＝`packSources[].via`；显式告警＝未实现增强）—— 本轮**未**因任何交付而改变这一判断。

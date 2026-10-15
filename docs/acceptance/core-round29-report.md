# Round 29 · task-149 · **A/B 的判据与设计（含一处"我不采信、自己复核过"的结论）** ／ A–E 代码**未落**（具名）

**一句话**：我**自己复核**了那条框架级发现（不是转述）⇒ **成立**；并顺着它找到一处**比原发现更有用的不对称**：★ **同一个文件里，`assertDeclared`（键守卫）【有】运行期执行点，而 `validateValue`（值/域守卫）【没有】** —— 于是"给声明一个执行点"不是新发明，而是**照本仓已有的那条已证通路把值守卫接上去**。本轮**未改任何文件**（预算用尽）：交付＝**复核过的调用图 ＋ A 的执行点定位 ＋ B(i)/(ii)(iii) 的判断与理由 ＋ 行为变更清单 ＋ 具名未做项**。

## 0. 核验行（我自己 grep＋读，不是转述）

| 项 | 我读到的 |
|---|---|
| `validateValue` 定义/导出 | `settings/schema.js:1459`（`:1460` 自身调 `assertDeclared`） |
| **它的全部引用** | 我按 `validateValue\|resolveSettings\|assertDeclared` 扫 `vibe-math-vmu/*.js`／`kernel/*.js`／`settings/*.js`／`packs/*/*.js`，命中**只有四处**：`:1459` 定义、`:1460` 自用、`:1521` **注释**、`:1566` **在 `resolveSettings` 内** ⇒ ★ **包内零外部调用者**（与 Lead／verify2 的 grep 结论**独立同向**） |
| `resolveSettings` | `:1558` 定义、`:1566` 调 `validateValue`；**包内零调用者** |
| ★ **假注释（逐字）** | `:1521`（`ratio` 分支内）："The 0..1 bound is enforced by validateValue, **the path every runtime write takes**." ⇒ **没有任何运行期写入走它** ⇒ 这句话是**假的**，且写在**保证路径**上 |
| ★★ **对照：键守卫【是】接上的** | `assertDeclared`：`vibe-math-vmu.js:36` 导入 → `:614` 交给适配器 → `host.js:553` 在 `set` 工具面**真的调用**；`index.js:407` 另有措辞对齐记录（task-166） |
| 泛化实测（verify2，我未复测） | `vmu.budget.onExceed`／`vmu.compat.unknownCombo`／`vmu.quota.onExceed` 域外值经 `config.vmu` **全 LOADED**；对照 `vmu.meetings.orderMode` **REFUSED**（R17 的读取侧严格检查） |

## 1. ★★ 我找到的不对称（本轮的正面产出）

**同一个 `settings/schema.js` 里，两类守卫的命运不同**：
- **键守卫**（`assertDeclared`，:1436）：**有**执行点（`host.js:553`，`set` 通道）⇒ 未声明键会具名拒 ✓；
- **值/域守卫**（`validateValue`，:1459）：**无**执行点（唯一调用者 `resolveSettings` 自己也没人调）⇒ **声明只是文档** ✗。

⇒ **A 的正确形状＝照已证通路补上缺的那一半**，而不是发明新机制：把 `validateValue`（或 `resolveSettings`）接到**真实的写入/合并路径**上。

**★ 但必须同时覆盖【两条】路径，否则修不到实测到的那条**：
1. **交互写面**（`vibe_vmu_set` → `host.js:553` 一带，以及 `kernel.setSettingsValue`／`unsetSettingsValue`）—— 已有 `assertDeclared` 的位置**再加值检查**，最省；
2. **配置/合并面**（**preset/overlay 的 `config.vmu`**）—— ★ **verify2 实测到的域外值正是从这条进来的**（`source="config"`）⇒ **只接工具面＝没修**。这条的执行点就是**把 `resolveSettings` 变成有人调**（它现在就是那段死代码）。

## 2. B：行为变更**完整设计**（我的判断与理由；★ 供 Lead 裁，落地前不改代码）

**(i) 域外值怎么处置 —— 我判"两条路径用两种处置"，理由如下**：
- **交互写面（`set` 工具／pack 清单 settings）⇒ 具名拒**：写是**部署者的显式声明**，静默夹取正是本缺陷；★ 复用**已登记**码 **`VMU_INVALID_ARGUMENT`**（R17 的 `orderMode` 用的就是它，措辞形如 `…outside the declared domain fifo|round-robin|chair|random`）⇒ **与既有修法一致、不自造码**。
- **配置/合并面（`config.vmu`）⇒ 不收该值 ＋ 具名记账 ＋ 用声明默认值**：这条如果**硬拒**，后果是**整个会话起不来**（我们已经在 preset 组装上见过一次同类打断）⇒ 那是把"一个键写错"升级成"整个部署不可用"。⇒ 我的判断：**值不被采纳**，facts 具名进回执（建议 `settingsRejected: [{key, value, domain, code}]`），并**回落到声明的默认值**。★ 关键区别：**现在的行为是"静默变成默认值"；改后是"具名记账 ＋ 默认值"** —— **静默被消灭，会话不被打断**。

**(ii) 既有部署里已存在域外值怎么办**：按上面 (i)，**升级后不会突然拒载**（合并面是"不收＋记账"，不是拒载）⇒ ★ **一次性具名迁移提示＝那条 `settingsRejected` 记录本身**（它点名 key／value／domain）。★ 反过来说：**若选"合并面也硬拒"，就必须另设迁移路径与宽限期**——这是我**不选硬拒**的第二条理由（第一条是会打断会话）。

**(iii) 零机制/未声明 与 "声明了域外" 的区分（必须可读，不许混）**：
- **未给值（unset）** ⇒ 声明的**默认值**生效，**静默且正确**（这就是零机制，R1）⇒ `settingsRejected` **空**；
- **给了域外值** ⇒ **`settingsRejected` 非空**（带 code/domain）；
- **未声明键** ⇒ `assertDeclared` 具名拒（既有行为，不动）。
⇒ 三态在回执里**互不重叠**，断言应逐态各一。

**行为变更清单（我改了哪些既有行为／可能影响哪些套件）**：① `set` 面新增具名拒（**拒绝**此前被静默夹取的写入）；② 合并面新增 `settingsRejected` 记录（**回执新增字段**）；③ 域外值不再出现在 `status().settings[key]`（此前会被夹成默认值，语义上"值不存在"与"被夹"现在可区分）。★ **可能受影响的套件我未枚举**（需实跑）：候选是任何喂域外值并断言"回落成默认"的 settings 套件 —— 下一轮第一件事就是**用一次全量 grep/试跑把它们点名**，而不是猜。

## 3. C/D/E 未落（具名）

- **C（11 处 `oneOf` 抽取＋具名拒＋9 键 `domain`）**：未落（抽取已获授权，方案与行数证明要求已明确：helper `meetings.js:128` ＋ 11 调用点 → 新模块，**前后 `split('\n')` 行数入报告并证明净减**；`tier`/`leaveApprover` 已判 (i) 一并修；9 键 `domain` 放**生成块外**＋进 `HAND_DECLARED_DOMAINS`）。
- **D（逐键"域外值 ⇒ 红"＋反例能红＋集合断言非空前置＋当天种一次反例）**：未落。
- **E（双登记＋`generate-wired-schema --check`／`vmu-settings`／`audit-settings-channels`／`audit-pack-value-domain`／`vmu-planned-settings`／`audit-doc-vs-code-tables`／`audit-enforced-consistency`／`vmu-kernel`／`vmu-meetings`／`vmu-entry`）**：未落。
- **本轮未改任何仓库文件**（只写了本报告，`_handoff` 在仓库外）。

## 4bis. ★★ Lead 已裁（两条；★ 其中一条**推翻我 §2 的偏好**，我照记并采纳理由）

**裁定 ①：`domain` **要补**，但必须与**读取侧具名拒【同批】**落，并用一条断言钉住「**两集合逐元素相等**」。**
- ★ **推翻的是我**：我 §2 里倾向"干脆不落补 `domain`"（怕造出"schema 说有域、实际没人执行"的新表象）。Lead 给的三条实证理由我**复核后接受**：(a) **R17 的先例正是"两件一起"**（`orderMode` 块外 `enum`+`domain` **＋** 读取侧 `strictOrderMode`，且**两者域逐字相同**——★ **"域相同"正是先例成立的条件**）；(b) **不补反而造出【反方向】的不一致**：`type:'string'` 等于**声明"任意字符串合法"**，而读取侧要**具名拒域外值** ⇒ **声明与执行相反**（比"声明没人执行"更糟）；(c) 机制已存在：`scripts/generate-wired-schema.mjs` 的 **`HAND_DECLARED_DOMAINS`** ＋「手写域键不得进生成块」的不变量（R17 为这件事加的）⇒ 9 个键加进那个集合即可，**不需新发明**。
- ★ **必须同时写清一句（否则就是新表象）**：**运行期执法点在【读取侧】，不在 schema**（`validateValue`／`resolveSettings` 今天无调用者，你我双人实测）⇒ schema 的 `domain` 承担的是「**设置表／文档／值域门禁的单一来源 ＋ 与读取侧同源的声明**」，**它的"执法"由读取侧履行**。★ 这句要进报告与相应 docs。
- **断言（本批核心不变量）**：逐键「域外值 ⇒ 红」＋ ★「**`schema.domain` 与读取侧集合逐元素相等**」＋ 反例能红。

**裁定 ②：框架级那条单开** ⇒ **A 项＝给 `resolveSettings` 接真实调用点，排在 C 之前**。★ 理由（我接受并记）：一旦 config 通道**真的开始拒域外值**，读取侧的 `oneOf` 就回到「**纵深防御**」的位置（与 R17 形状一致：声明＋执法**同源**）；且它修的是**面之外的一般情形**（`budget.onExceed`／`compat.unknownCombo`／`quota.onExceed` 同样 LOADED）。⇒ **A→C 是显式顺序**。

**动手前照旧先读码**：`strictOrderMode` 模板 `kernel/meetingmarker.js:296`／`ORDER_MODES:285`。

## 5. 状态（**未落**，具名）

- **A／C／D／E 全部未落**（本轮预算用尽）；**未改任何仓库文件**（只写本报告，`_handoff` 在仓库外）。
- 已就位、可直接执行的：§1 的**执行点定位（两条路径：交互写面 ＋ 配置/合并面，后者才是实测到的那条）**、§2 的 **B(i)(ii)(iii) 判断与理由**、§4bis 的两条裁定与**核心不变量**、§3 的 C 方案（抽取净减 ＋ 行数证明）。
- ★ 下一轮第一件事：**读 `strictOrderMode`／`ORDER_MODES`** ⇒ 落 **A 的最小可用形状**（合并面接 `resolveSettings`／`validateValue` ＋ `set` 面已有 `assertDeclared` 处加值检查 ＋ B 的回执字段）⇒ 再 **C**（抽取＋11 处＋`domain`＋同源相等断言）⇒ **D 当日种反例** ⇒ **E 门禁**。

## 6. Lead 追加的两项要求 ＋ 一条跨任务协调（照办／具名）

**③ §1 那条观察的"原样"表述（Lead 要求放进设计与报告）** —— ★ **不是"这个包不做校验"，而是"两条校验各走各的、其中一条没接上"**：
- **键校验**（`assertDeclared`，`schema.js:1436`）：**接上了** —— `vibe-math-vmu.js:36` 导入 → `:614` 交给适配器 → `host.js:553` 在 `set` 面**真的调用**；
- **值/域校验**（`validateValue`，`schema.js:1459`）：**没接上** —— 唯一调用者 `resolveSettings`（`:1558/:1566`）**自己也没有调用者**；
⇒ ★ **这解释了"为什么有人会以为已经校验了"**：**同一个文件里一半校验确实在跑**（键），于是"声明了 `type`/`domain` ⇒ 应该也在跑"成了**很自然的误读**，而 `:1521` 那句 *"the path every runtime write takes"* 正是把这个误读**写成了注释**。★ 设计与报告都按此措辞。

**② B 的两路处置要写进 docs（★ 不在本任务写范围 ⇒ 具名转出）**：**交互写面＝具名拒**（复用已登记 `VMU_INVALID_ARGUMENT`，与 R17 同码）／**配置+合并面＝"不收该值 ＋ 具名记账 ＋ 用声明默认值"**，**并写明为什么不同**（硬拒会把"一个键写错"升级成"整个会话起不来"；`settingsRejected` 本身就是迁移提示）。★ 本任务写范围只有 `settings/schema.js`／`kernel/**`／`tests/**`／`package.json`／本报告 ⇒ **docs 那半请派 docs 属主**（我不越范围写）。

**★ 跨任务协调（Lead 明确要求）**：`vmu-assistant2` 名下 **`task-151`** 覆盖 **`vibe-math-vmu.js`／`host.js`／测试**，且正在把一条"回执↔事实"修实：**`packReport.applied ⊆ status().packs` 按字面 id 不成立**（`applied` 是 manifest id `v5r-core`，`packs` 是请求 id `v5r`）⇒ 它要把**映射显式化**。★ ⇒ **我的 A 若必须碰 `status().packs` 那一带（`host.js` 回执），先与它对齐／先具名报 Lead**。★ 按我的设计，**A 不碰那一带**（执行点在 `settings/schema.js` 的 `resolveSettings`／`validateValue` 接线 ＋ `set` 面的值检查 ＋ kernel 的 `setSettingsValue` 一带）⇒ **当前判断：范围不重叠**；**若落地时发现要动 `host.js` 回执**（例如报 `settingsRejected`），我会**先具名报 Lead** 再动 —— 那正是 task-151 的面。

★ 真机未跑、结论未声称；未跑全量／`regen-all`／git。

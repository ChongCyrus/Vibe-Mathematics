# Round 20 · vmu-pack（`task-125`）交付报告 —— `config.packs` 内联 manifest：注释与运行时相反，已修

> 任务：`task-125`（A 定位并修好 `path` 收到 Object；B 两条断言＋正负两向能红；C 内联 pack 的 M2 计数生产者走真装配；D 逐条核 11 处声明）
> 纪律：**未跑全量／`regen-all`／git 写**；临时文件 `D:\_tmp`；结构性编辑**原子**＋每步跑加载内核的套件；**定点编辑后立刻核文件内容**。
> **读的是哪一版**：HEAD = **`df207bd3fe683ec6baf167414e4a1ec601419bb7`**，起始 `git status` **干净**。
> **写范围**：`vibe-math-vmu/vibe-math-vmu.js`、`vibe-math-vmu/kernel/pack.js`、`tests/vmu-pack-inline-manifest.test.mjs`、`package.json`（**只加我这一行**，定点 `edit`）、`docs/02`、`docs/18`。**未碰 `host.js`**（不属本任务范围）。

---

## 0. 结论速览

| 项 | 结论 |
|---|---|
| **A 定位** | ★ **`vibe-math-vmu.js:789` 的 `join(here2, 'packs', wanted, rel)` 把 manifest 对象当路径段** —— 这是 `ERR_INVALID_ARG_TYPE` 的抛点。**并且它后面还藏着第二个独立缺陷**：`kernel/pack.js` 把裸条目交给 loader，而**文档化的 `kind` 默认值没被施加** |
| **A 修法** | ★ **修好**（不是撤声明）：内联分支直达 `apply()` ＋ `kind` 默认在 `pack.js` 施加 ⇒ 内联 manifest **真可用** |
| **B 断言** | ✅ `tests/vmu-pack-inline-manifest.test.mjs` **35/0**；★ **正负两向皆能红**（两个缺陷各自复原 ⇒ **13 红／7 红**，见 §3） |
| **C 联调** | ✅ 计数生产者（M2 经 `api.services.get('vmu.metrics')`）**走真装配**：bus 条目非空、hook 已桥接、**真记录 5 次并回读**、边界阈值**自主触发**、反向阈值**保持静默** |
| **D 逐条核 11 处** | ✅ 逐条判真／假（§5）。★ **又抓到 2 处**（都在 `host.js`，**不属本任务写范围**）：**`unload` 必须带一个多余的 `manifest`**；**`id` 对 plan/apply 无效** |
| **门禁** | ✅ `enforced-consistency` **358/0**、`vmu-kernel` **175/0**、`vmu-pack` **53/0**、`vmu-entry` **150/0**、`membership` **29/0**、`pack-face` **5/0**、`pack-middleware-shape` **6/0**、`check-docs` **PASS**、`audit-vmu-docs` **95/0** |

---

## 1. A · 定位：**一个报错掩盖了第二个缺陷**

### 1.1 先复现（基线，未改任何文件）

原样跑 Round 19 的探针 `D:\_tmp\vmu-r19-policy-path.mjs`（它就在 `_tmp` 里，不是我写的）：

```
vmu: pack r19-counter-pack was not applied: ERR_INVALID_ARG_TYPE The "path" argument must be of type string. Received an instance of Object
=== VMU R19 FULL CHAIN: 2 passed, 5 failed ===   EXIT=1
```
★ 与任务书给的读数**逐字一致** ⇒ 基线确认。

### 1.2 第一层：对象被当路径段（**这就是抛点**）

`vibe-math-vmu.js` 的装载循环里，`packsWanted = [<manifest 对象>]` 时：
- `typeof wanted === 'string'` ⇒ **false** ⇒ `loaded` 保持 `null`；
- 于是进入"**纯数据 pack**"探测分支，而它算的是 `join(here2, 'packs', wanted, rel)` —— ★ **`wanted` 是对象** ⇒ `node:path` 抛 `ERR_INVALID_ARG_TYPE`；
- ⇒ **`:799` 那个 `typeof wanted === 'string' ? loaded.PACK : wanted` 的 inline 分支永远到不了**（这正是任务书推测的"故障在到达它之前"，已证实）。

**修法**（`vibe-math-vmu.js`）：新增显式分支——
```js
} else if (wanted && typeof wanted === 'object' && !Array.isArray(wanted)) {
  inlineManifest = wanted           // 无文件夹可探、无文件可 import：manifest 就是 pack
} else {
  throw packModule.refuse('VMU_PACK_INVALID', 'config.packs entries must be a pack id (string) or an inline manifest (object): got …', '…')
}
```
并把数据探测分支收紧为 `if (loaded === null && inlineManifest === null)`、把 `manifest` 改为 `inlineManifest !== null ? inlineManifest : loaded.PACK`。
★ **第三种输入（数字／数组／`null`）现在得到具名拒 `VMU_PACK_INVALID`**，而不是掉进 `join()` 崩。

### 1.3 第二层：**文档化的 `kind` 默认值没有生效**（修完第一层才露出来）

修完第一层，报错变成**具名**的：`VMU_MIDDLEWARE_FAILED the loader only loads kind: module entries`。原因：
- `kernel/pack.js` 的 `validatePack` **明写** `const kind = m.kind === undefined ? 'module' : m.kind`（`:126`）⇒ ★ **`kind` 是可选的、缺省即 `module`**；
- 但 `apply()` 把**裸条目**交给 `kernel/loader.js`，而 loader `:157` 要求 `entry.kind === 'module'`；
- ⇒ ★ **默认值只写在判据里、没施加到交付物上** ⇒ 凡省略 `kind` 的 module 形状条目**一律被拒**。
- ★ 同一文件的 `config.modules` 路径**早就这么归一化**（`Object.assign({ kind: 'module' }, m)`，`:888`／`:890`）⇒ **pack 路径漏了这一步**，属本仓"声明了没生效"那一类。

**修法**（`kernel/pack.js`）：`const spec = m.kind === undefined ? Object.assign({ kind: 'module' }, m) : m`，再交给 loader。

### 1.4 修后：**内联 pack 真的可用**

用**形状正确**的内联 manifest 跑同一条链（`D:\_tmp\vmu-r20-inline-chain2.mjs`）：
```
bus entries    = [{"id":"r19-counter::tools/result","on":["tools/result"],"enabled":true}]
host listeners = ["agent/turn-stopping","tools/result"]
attempts       = [{"ok":true,"recorded":true} …] (total 5)      ← M2 真拿到 api.services
metricValues() = {"artifacts":5}
delivered      = ["artifacts-met","turn-end-duty"]              ← 边界自主触发
=== VMU R19 FULL CHAIN: 7 passed, 0 failed ===   EXIT=0
```

### 1.5 ★ 诚实标注：原探针的 manifest 本身有 **3 处形状错误**（框架是**具名拒**的，不是它坏）

| # | 探针写的 | 框架的具名拒 | 依据 |
|---|---|---|---|
| 1 | `meta.id: 'r19.counter'` vs 条目 id `r19-counter` | `VMU_MIDDLEWARE_FAILED invalid M2 module r19-counter: meta.id (r19.counter) does not match the entry id` | `loader.js:72-74` |
| 2 | 模块对象**完全没有 `capabilities`** | `the module must declare capabilities (a non-empty list)` | `loader.js:80-81` |
| 3 | 条目的 `capabilities: ['record']` **缺 `trigger-workflow`** | 运行期 `VMU_NOT_PERMITTED this module may not reach services` | `loader.js:131-134` |

⇒ ★ **三个都是"具名拒"，这正是设计要的效果**；因此**修前"链全红"里，只有 2 条是框架缺陷，另 3 条是探针 manifest 的形状错误**。★ 建议 `vmu-verify2`/`vmu-core2` 把 `D:\_tmp\vmu-r19-policy-path.mjs` 的 manifest 按 §1.5 三处改对（改正版已在本报告的 `_tmp\vmu-r20-inline-chain2.mjs`），否则那条"7/0"永远拿不到。

---

## 2. B · 断言（`tests/vmu-pack-inline-manifest.test.mjs`，**35 passed / 0 failed**）

| 组 | 断言 |
|---|---|
| **A（正）** | A1 无 pack 错误／A2 `appliedPacks()` 含其 id／A3 M2 变成**真 bus 条目**／A3b 条目 **enabled** 且**刻意省略 `kind`**／A4 host hook **已桥接**／A5 ★ **真经 `api.services.get('vmu.metrics')` 记录 5 次**／A6 框架**回读**该计数／A7 ★ **ABOVE 线阈值在边界自主触发**／A8 ★ **BELOW 线阈值在同一部署里保持静默** |
| **B（负）** | 6 个坏输入 ⇒ 各自**具名码**：非 kebab `id`／无 `id` ⇒ `VMU_PACK_MISSING`；数字／数组／`null` ⇒ `VMU_PACK_INVALID`；`meta.id` 矛盾 ⇒ `VMU_MIDDLEWARE_FAILED`。★ **每条都断言 `ERR_INVALID_ARG_TYPE` 缺席**（这使"恢复缺陷"必然变红，不是靠自觉） |
| **C（未塌成静默）** | 不存在的随包 id ⇒ 仍**具名拒** `no pack named …`，且 `appliedPacks()` 为空 |

★ **`kind` 是刻意省略的**（文件里写了"不要加回来"的注释）：若写 `kind: 'module'`，第二个缺陷就**测不到**——这正是我第一版测试**漏掉它**的原因（见 §3 的自陈）。

---

## 3. ★ 正负两向都能红（**falsifiability proof**，逐字节复原）

脚本 `D:\_tmp\vmu-pack14\falsify.mjs`：把每个缺陷**用一行复原**，跑测试，再**按原字节写回并核哈希**。

| 复原 | 读数 | 判据 |
|---|---|---|
| 基线 md5 | entry `1e3e6f54b55782fe2abe6cc0e97b7db9`／pack `99f97e830b3739ef094c09d978d2d91e` | — |
| **复原缺陷 1**（`if (loaded === null && inlineManifest === null)` ⇒ `if (loaded === null)`，对象重新掉进 `join`） | **`22 passed, 13 failed`，EXIT=1**，且报错**正是** `ERR_INVALID_ARG_TYPE` | ★ **红** ✓ |
| **复原缺陷 2**（`const spec = m.kind === undefined ? … : m` ⇒ `const spec = m`） | **`28 passed, 7 failed`，EXIT=1**，报错 `VMU_MIDDLEWARE_FAILED the loader only loads kind:` | ★ **红** ✓ |
| 两次复原后 | entry／pack **md5 与原值逐一相同**；测试回绿 **35/0** | ★ **无残留** ✓ |

> ★★ **我自己的一次失败与修正（按 `docs/11 §4.2` 第八条记录）**：第一版测试里我把 `kind: 'module'` **写进了 manifest**，于是**缺陷 2 的复原是绿的**（`34 passed, 0 failed`）—— 即"断言所选观测量必须在被测的两档之间真的不同"的反面：**我的观测点恰好绕过了要测的那一行**。改成**省略 `kind`**（也就是**文档化的普通写法**）后，缺陷 2 才被测到。**若不做这一步复原实验，我会交出一个"看起来两向都覆盖、其实只覆盖一半"的套件。**

---

## 4. C · 联调：部署侧"政策去计数"

★ 见 §1.4 的 7/0：**内联 pack 里的 M2 模块经 `api.services.get('vmu.metrics')` 真观测，框架真回读，边界真自主触发**，且**反向阈值静默** ⇒ **"部署侧内联 pack（含 M2 生产者）"整条路现在可用** ✓。

---

## 5. D · 逐条核那 11 处声明（**逐处判真／假，不是一句"全是假的"**）

★ 关键：这 11 处**混着两个不同机制**，必须分开判——
**(甲) `config.packs: [<manifest 对象>]`**（entry 侧，本次修的）／**(乙) `vibe_vmu_pack` 工具的 `manifest` 参数（一个 JSON 字符串）**（`host.js` 直接 `JSON.parse` → `loader.plan/apply/unload`，**从不经过** `config.packs` 循环 ⇒ **本来就与那个崩溃无关**）。

| # | 处 | 声明 | 判 |
|---|---|---|---|
| 1 | `vibe-math-vmu.js:716-718` | "`config.packs` accepts either a shipped pack id … **or an inline manifest**" | ★ **曾假 → 今真**（已修＋已加轮 20 说明） |
| 2 | `docs/00:183` | `packs: ['institute-min'] # 整合包（随包 id 或内联 manifest）` | **真**（甲；原文未限定机制，今天成立） |
| 3 | `docs/10:436` | "在 profile 行的 `config.packs: ['<id>']`（或内联 manifest）里声明" | **真**（甲） |
| 4 | `docs/10:514` | "随包整合包 ⇒ `config.packs` 里给 `<id>`（或内联 manifest ✓）" | **真**（甲） |
| 5 | `docs/12:42` | `packs: ['institute-min'] # 或内联 manifest` | **真**（甲） |
| 6 | `docs/02:180` | "运行期可对内联 manifest 做 **`plan/apply/unload`** ✓（工具）" | ★ **半假 → 已就地更正**：`plan/apply` 真；**`unload` 今天必须带一个多余的 `manifest`**（见 #10）；并补"工具载不动 M2 模块" |
| 7 | `docs/03:151` | 工具表：`manifest`(内联 …) | **真**（乙）；★ 但**未提** `unload` 也需要它 ⇒ 见 #10 |
| 8 | `docs/18:142` | "`id`（unload 必填；**也可给随包 id**）｜`manifest`（内联 …）" | ★ **半假 → 已就地更正**：`id` **只对 unload 生效**（`{action:'plan', id:'v5r'}` 实测被拒）；`unload` 还需要 `manifest` |
| 9 | `docs/27:257` | "★ 若将来出现'**内联 manifest 想带默认值**'的真实需求（即 pack 不是文件夹），再评估" | **仍有效**（★ 我的修复**不**给内联 manifest 增加 `settings/defaults.json` 能力 ⇒ 该条的前提不变） |
| 10 | `host.js:678` | `manifest: param('string', 'plan/apply：内联 manifest 的 JSON 文本')` | **真**（乙），★ 但**漏了 unload 也要它** ⇒ 具名 |
| 11 | `host.js:694-695` | 拒因文案 "plan/apply need an inline manifest" ＋ 提示 | ★ **对 unload 会误报**（unload 也被同一句拒） ⇒ **具名** |

### 5.1 ★ 顺带抓到的 **2 处新缺陷**（都在 `host.js`，**不属 task-125 写范围** ⇒ 具名转 `vmu-verify2`）

| # | 缺陷 | 实测 |
|---|---|---|
| **新 1** | ★ **`vibe_vmu_pack {action:'unload', id}` 无法使用 —— 它要求一个多余的 `manifest`**：`host.js` 里"缺 manifest 即 `VMU_INVALID_ARGUMENT`"的判断（`:693-696`）**排在** unload 分支（`:699-702`）**之前** | `{action:'unload',id:'probe-x'}` ⇒ `VMU_INVALID_ARGUMENT plan/apply need an inline manifest` ✗；`{action:'unload',id,'manifest':<任意合法 JSON>}` ⇒ **`ok:true, reversed:2, residueFree:true`** ✓；★ 而**直接** `loader.unload('probe-x')` **本来就正常**（`ok:true, residueFree:true`）⇒ **纯属工具侧的判断顺序问题** |
| **新 2** | ★ **`id` 不能用于 plan/apply 解析随包 id**，但 `host.js:677` 的参数说明写着"也可给随包整合包 id（plan/apply 时按 `./packs/<id>.js` 解析）" | `{action:'plan', id:'v5r'}` ⇒ `VMU_INVALID_ARGUMENT`（原文 "plan/apply need an inline manifest"）⇒ **说明与实现相反** |
| **新 3（小，同族）** | ★ **工具载不动 M2 模块**（`manifest` 是 JSON 文本，`hooks` 是函数） | 一个 module 形状的 manifest 走工具 ⇒ `VMU_MIDDLEWARE_FAILED: invalid M2 module probe-mod: hook tools/result must be a function` ✓ **具名拒**；★ 推论：**部署侧 M2 生产者只能走 `config.packs`** ⇒ 这就是本次修复的价值 |
| **新 4（小）** | ★ `plan` 与 `apply` 的判据**不对称**：`validatePack` 检查 `rules` 的 `on` 但**不检查 `when`**，而 `rules.compile` 要求 `when` ⇒ **`plan` 报无问题、`apply` 才拒** | 一个缺 `when` 的规则包：`plan.ok=true, problems=[]`，`apply` ⇒ `VMU_MIDDLEWARE_FAILED invalid M1 rule r1: when is required` |

★ 关于新 1／新 2：**未改 `host.js`**（不在写范围）；★ 只把事实就地写进 `docs/02:180`／`docs/18:142`（**一起注明归 `vmu-verify2`**），以免读者继续按错的方式调用。

---

## 6. 改了什么／没改什么

| 动作 | 文件 |
|---|---|
| ✍️ 修 | `vibe-math-vmu/vibe-math-vmu.js`（inline 分支 ＋ 具名拒 ＋ 轮 20 说明） |
| ✍️ 修 | `vibe-math-vmu/kernel/pack.js`（`kind` 默认归一化） |
| ✍️ 新 | `tests/vmu-pack-inline-manifest.test.mjs`（35/0） |
| ✍️ 登记 | `package.json#files` **加 1 行**（定点 `edit`；`files` 683 条，JSON 仍合法） |
| ✍️ 更正 | `docs/02:180`、`docs/18:142`（各自就地注明，并具名归属） |
| ❌ 未改 | `host.js`（新 1／新 2／新 3 具名转 `vmu-verify2`）、`kernel/loader.js`、`kernel/meetings.js`（1199/1200 未碰） |

---

## 7. 原样命令 ＋ 退出码（同一次最终扫）

| 命令 | 读数 | 退出码 |
|---|---|---|
| `node tests/vmu-pack-inline-manifest.test.mjs` | `35 passed, 0 failed` | **0** |
| `node D:\_tmp\vmu-r20-inline-chain2.mjs` | `7 passed, 0 failed`（修正 manifest 后的完整链） | **0** |
| `node tests/audit-enforced-consistency.test.mjs` | `358 passed, 0 failed`（★ `pack.js` 动过 ⇒ 必跑） | **0** |
| `node tests/vmu-kernel.test.mjs` | `175 passed, 0 failed` | **0** |
| `node tests/vmu-pack.test.mjs` | `53 passed, 0 failed` | **0** |
| `node tests/vmu-entry.test.mjs` | `150 passed, 0 failed` | **0** |
| `node tests/audit-package-membership.mjs` | `29 passed, 0 failed`（新测试已双登记） | **0** |
| `node tests/audit-pack-face.test.mjs` | `5 passed, 0 failed` | **0** |
| `node scripts/audit-pack-middleware-shape.mjs --selftest` | `6 passed, 0 failed` | **0** |
| `node scripts/check-docs.mjs` | `DOC LINT: PASS` | **0** |
| `node tests/audit-vmu-docs.test.mjs` | `95 passed, 0 failed` | **0** |
| `node tests/audit-doc-index.test.mjs` | `5 passed, 0 failed` | **0** |
| `node tests/audit-verbatim-claims.test.mjs` | `3 passed, 0 failed` | **0** |
| `node D:\_tmp\vmu-r19-policy-path.mjs`（**原始**探针，manifest 未修） | `2 passed, 5 failed`（★ 其中 3 条是探针 manifest 的形状错误，见 §1.5） | 1 |

---

## 8. 交回 Lead／`vmu-verify2`

1. **A/B/C 完成**：内联 manifest **真可用**（`+2` 处框架缺陷已修），断言 **35/0**，**正负两向皆能红**（13 红／7 红，逐字节复原）。**未撤任何声明**。
2. **★ 请 `vmu-verify2` 处置 `host.js` 的两条**（§5.1 新 1／新 2）：**`unload` 需要一个多余的 `manifest`**（判断顺序问题，一行可修）＋ **`id` 对 plan/apply 无效而说明声称有效**。★ 这两条让 `docs/02:180` 的 `unload ✓` 与 `docs/18:142` 的说明**今天都只对一半**；我已在两卷**就地注明**。
3. **★ 请 `vmu-verify2`/`vmu-core2` 修正 `D:\_tmp\vmu-r19-policy-path.mjs` 的 manifest**（3 处，§1.5）；否则那条链永远报 5 条假红。
4. **小项**：`validatePack` 不查 `rules[].when` ⇒ `plan` 与 `apply` 判据不对称（§5.1 新 4）。**我未改**（改 `validatePack` 会影响所有包的 plan 报告面，超出本轮范围）。
5. **边界**：`tests/vmu-pack-inline-manifest.test.mjs` **依赖真入口装配**（与 `vmu-entry.test.mjs` 同族），不需要 host；`_tmp` 探针**不进仓**。

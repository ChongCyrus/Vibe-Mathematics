# Round 26 · vmu-pack（`task-141`）交付报告 —— 具名"设置路线丢 10 面/9 工具" ＋ 修回执少报 ＋ 文档差异句

> 任务：`task-141`（A 具名／B (v) 修回执／C 能红断言／D 文档／E 判断不落）
> 纪律：原子编辑；`host.js` 一动即重跑 `vmu-host`／`vmu-host-hooks`／`vmu-entry`／`audit-enforced-consistency` ✓；`kernel/meetings.js` **未碰**；**未自造公开码**（复用 `VMU_ENGINE_UNAVAILABLE`／`VMU_MIDDLEWARE_FAILED`）；`package.json` 定点 `edit`；未跑全量／`regen-all`／git；临时文件 `D:\_tmp`；新文件当场双登记 ✓。
> **★ 读的是哪一版**：起点 HEAD = **`a43742fadc0e90c5e940d42310eb46062a0331ea`**，工作树干净。★ 下面凡"修前"读数都注明**其时的字节**；`verify2` 的复核读的是**我改到一半的树**（它自己注明了 `host.js` 在飞）。

---

## 0. 结论速览

| 项 | 结论 |
|---|---|
| **A 具名** | ✅ 回执新增 **`defaultsFolded`／`defaultsUnfolded:[{id,keys,reason}]`／`faces.notPublished:[{face,tool,reason}]`**（**不改既有字段**；`defaults` 仍是"折入的键数"） |
| **B (v) 修回执** | ✅ `faces.published` 现在报**注册面**（适配器的累积 `registered`，first-wins）＋ **`publishedDetail:[{name,face,reason}]`** ＋ **`evaluations`**（自证并了几次） |
| **C 断言** | ✅ 新文件 `tests/vmu-pack-defaults-named.test.mjs` **21/0**；★ **两条可证伪**（M1 18/3 红、M3 17/4 红）；★ **M2 未红，我具名保留**（见 §6） |
| **D 文档** | ✅ `docs/10 §7-6` 差异句 ＋ **`docs/29` 的三处**（含**被抄的内联注释 `:263`／`:306`**） |
| **E 挪键候选** | ✅ 只出判断（不落）：**注册半可行／构造期半不可行**；验收两格按 `verify2` 的口径修正（见 §7） |
| **门禁** | ✅ 除 **`regen-all --check`**（计数，Lead 轮末）外全绿 |

---

## 1. A · 具名："运行期新增的 pack 折不了默认值" 现在**看得见**

**三处新增**（都在回执里，**既有字段一律不动**）：

| 字段 | 位置 | 含义 |
|---|---|---|
| `settingsMerge.defaultsFolded:[ids]` | 入口 `mergeReport` | **其 `defaults.json` 真的被折入**的包 id |
| `settingsMerge.defaultsUnfolded:[{id,keys,reason}]` | 同上 | **运行期新增、因而折不了**的包：id ＋ **键表** ＋ 一句 reason |
| `faces.notPublished:[{face,tool,reason}]` | 宿主状态面（`host.js`） | ★ **因那些键没折入而【不发布】的面与其工具**，逐条带 reason |

★ **`defaults: 0` 不再与"这个部署本来就没有默认值"同形** —— 这是 A 的验收点。
★ **`notPublished` 与面解析同源**：它复用**同一个家族前缀规则**（`row.families` × 未折入的键）＋ **同一个"未 enabled"判定** ⇒ 不会与 `resolveFaces` 漂开；且**只在真的有未折入键时**才产出（`0` 不是常量）。

**实测（两路线，同一次运行，走真状态工具）**：

| 路线 | `defaults` | `defaultsFolded` | `defaultsUnfolded` | `faces.notPublished` | `faces.enabled` | 注册工具 |
|---|---|---|---|---|---|---|
| **设置键** `vmu.packs.active:['v5r']` | **0** | `[]` | **`[{id:'v5r', keys:43}]`** | ★ **10 面**：`control/turn/meeting/task/mathtools/human/chat/mailbox/panel/mathjobs`（**逐条带 tool 与 reason**） | 4 | 7 |
| **`config.packs:['v5r']`** | **43** | `['v5r']` | `[]` | **`[]`**（不误报） | 14 | 15 |

★ `notPublished` 逐条给出工具名（例：`{face:'task', tool:'vibe_vmu_task', reason:"its family keys live only in the pack's settings/defaults.json, which a runtime-added pack cannot fold…"}`）⇒ 运维能直接看到**自己少了哪个工具**。

---

## 2. B · (v)：回执现在覆盖**注册面**，且每个工具都有理由

**三处改动（`host.js`）**：
1. **`toolSpecs`**：在**唯一**一处同时握有"工具名 ＋ 面判决"的地方给每条 spec 贴 **`face` ＋ `reason`**（`reason` 直接取 `faceResolution.sources[face]` —— ★ **不新造、不复制**，所以不可能与面解析漂开）。
2. **`createHostAdapter`**：新增 **`evaluations`**（在 **`doInstall` 每次产出工具的评估处** +1 —— ★ **不是 push 次数**，否则一次评估 push 多条会把"并了几次"说成假话）＋ **`reasonFor`**（**first-wins**：与 `:925` 的 `if (registered.includes(...)) continue` **同一语义**，只在**首次**注册时记 reason ⇒ 后来的评估**不可能**把生效者的 reason 覆盖成错的）。两者**随 `registered` 一起在 uninstall 清空**（`registered.length = 0` 的两条路径）⇒ **回执不可能报出已卸载的面**（(v) 的反方向过报）。
3. **状态工具**：`published` 改为报 **`registered`（累积面）**；新增 **`publishedDetail:[{name,face,reason}]`** ＋ **`evaluations`**。
   ★ **`published` 的形态仍是 `string[]`**（只把**内容**从"回答者那次评估"改成"注册面并集"）⇒ ★ **没有破坏既有字段形态**（我 grep 过：**仓内零消费者**，故形态改变也安全，但不必改）。

**实测（同一次运行）**：

| 臂 | 注册（去重） | `faces.published` | `published == registered` | `evaluations` | **未被解释的（无 reason）** |
|---|---|---|---|---|---|
| 内联清单（`vmu.tasks.*`） | 4 | **4**（修前 3） | ✅ true | **2** | **`[]`** |
| 仓内 v5r／`config.packs` | **15** | **15**（修前 13） | ✅ true | **2** | **`[]`** |

⇒ ★ **(乙) 的形状**：**每个已发布名字都被【具名解释】**（失败即打印未解释集合）—— **不是静态桶/白名单**（`verify2` 也独立确认 `faces.sources` **本来就是 per-face reason 形状**，且**缺失面在 `sources` 里没有条目** ⇒ 那正是 `notPublished` 要补的一格）。
⇒ ★ **(甲) 的等号断言现在可作收口**：`published == registered` 今天三臂全绿（修前是 4≠3／15≠13）。

---

## 3. C · 断言（`tests/vmu-pack-defaults-named.test.mjs`，**21/0**）

| 组 | 断言 |
|---|---|
| **A 设置路线** | A1 **非空前提**（`appliedPacks` 非空 ⇒ 不是"什么都没装"）；A2 `defaults === 0`；★ **A3 那 9 个工具确实未注册**（`LOST_TOOLS.length > 0 &&` 同表达式前置）；A4 `enabled` 恰 4 面 |
| **B 部署路线** | B1 `defaults > 0`；★ **B2 `enabled === 14`**；★ **B3 那 9 个工具都注册了**（两档真的不同） |
| **C 具名** | C1 `defaultsFolded` 在场且为空；★ **C2 `defaultsUnfolded` 含 `v5r`**；C3 每条 reason 非空；C4 每条带键表；★ **C5 `notPublished` 恰 10 面**；**C6 每条带 face/tool/reason**；C7 点名到 `vibe_vmu_task`；★ **C8 部署路线 `notPublished` 为空**（不误报） |
| **D (v)** | ★ **D1 `published == registered`**（两路线）；★ **D2 未被解释集合为空**；D3 `evaluations === 2` |

★ **可证伪（`D:\_tmp\vmu-pack14\falsify-r26.mjs`，逐字节复原）**：

| 复原 | 读数 |
|---|---|
| **M1** 去掉 `defaultsUnfolded` 的具名 | **18/3 红**（C5／C6／C7） |
| **M3** 去掉 (v) 的 `publishedSurface` 接缝 | **17/4 红**：★ **D1 打印出修前的原始不对称** `{"published":13,"registered":15}`（部署路线）与 `{"published":4,"registered":7}`（设置路线），D3 打印 `null` |
| 两次复原后 | `vibe-math-vmu.js`／`host.js` **md5 与基线逐字节相同**；测试回 **21/0** |

---

## 4. ★ 回 `verify2` ②：它复现不出的原因 —— **它读的是已修好的树**（我不撤回，给出可复现配置）

| | 注册 | `published` | 差集 |
|---|---|---|---|
| **修前**（我当时的字节） | 15 | **13** | `['vibe_vmu_middleware','vibe_vmu_report']` |
| **修后**（`verify2` 与我现在读的） | 15 | **15** | `[]` |

★ **它自己注明"`host.js` 正在改、在飞读数"** ⇒ 它量的是 **(v) 已落之后**的树，所以差集必然为空 —— **不是"该现象不存在"**。
★ **可复现配置（它要的那个）**：**默认面集**（**不要** `vmu.tools.faces:['*']`）+ **把 (v) 的接缝去掉**（＝我 M3 的那一次改动）⇒ 立刻看到 `published 13 / registered 15`（部署路线）与 `4 / 7`（设置路线）。⇒ **M3 的失败详情就是那份"确切的配置与读数"**（已在 §3 给出原文）。
★ **要撤回的只有一句**：我早前说过"**`calls > distinct` ⇒ 重装过**"那条判别器 —— 它**是瞎的**（名字集不相交的两批与单批同形）⇒ 那**不是**本现象的判据；本现象由"**注册 15 / 发布 13**"独立撑住，并由 M3 复原证明**是这条接缝**造成的。

---

## 5. ★ 回 `Lead` ③：两格验收的口径已按 `verify2` 修正（记进 E）

- **(i) 必须在默认面集下跑** —— `faces:['*']` 时两路线都是 **53/53/53**，等号**恒真**、测不出东西 ✓ 采纳（我的测试正是默认面集）。
- **(ii) 基准用 `published`，不是 `enabled`** —— 实测 config 路线 **`enabled = 14` 而 注册/发布 = 15**（`report` 面**未列入 `enabled`** 但 `vibe_vmu_report` **已注册并发布**；`faces.sources['report']` 两路线皆 `undefined`）⇒ ★ **拿 `enabled` 比等号会永远差 1** ✓ 采纳。
  ★ 因此本报告内两处**刻意区分**：**`enabled` 用于"面数对比"**（4 vs 14，`verify2` 的读数与我一致），**`published == registered` 用于"覆盖面"**（D1）—— 两者不是同一个量，**不混用**。
  ★ 并且这**顺带解释了 `enabled` 的边界**：`report` 面**已发布却没进 `enabled`** ⇒ ★ 这是**第四条**"回执的两个字段讲不同的事"（与 `notPublished` 互补：一个报"缺席"，一个报"在册却未列名"）—— **我本轮未动 `enabled` 的判定**（改它会动面订阅语义），**具名留给下一轮裁**。

---

## 6. ★ 未完成／未证（**具名**）

1. ★ **C 的 M2 未能变红**：Lead 要求"把折入输入集改成有效请求表 ⇒ ① 必红（钉住'没有偷偷强补折入'）"。我按此做了复原（`wantedPacks` 追加 `settings['vmu.packs.active']`）⇒ **测试仍 21/0 绿** ⇒ ★ **该判据未被证明有牙**。**我的假设（未核）**：该处 `settings` 在作用域里的形态与我假设的不同、或折入的键未走到 `status.settingsMerge.defaults`。**我没有继续查**（预算），**故如实记为未证**：A2（`defaults === 0`）**不能**声称"能抓偷偷强补折入"。
2. ★ **`enabled` 与 `published` 的口径差**（`report` 面）**未修**，只具名（§5）。
3. ★ **E 的"挪键"候选未落**（按任务只出判断）：**注册半可行**（合成内联清单的 `vmu.tasks.*` **真注册了** `vibe_vmu_task`）／**构造期半不可行**；采纳前必须按 **(i) 注册工具数/面 == config 路线**（用 **`published`**，非 `enabled`）＋ **(ii) 回执与注册面一致** 两格度量 —— ★ **只看 `defaults` 计数变大不算**。

---

## 7. D · 文档差异句（已升级）

- **`docs/10 §7-6`**：装载两条路 → "**① `config.packs`＝部署期声明**／**② `vmu.packs.active`＝真开关（推荐日常调控）**；同包两处声明 ⇒ 只装一次、来源记 `config.packs`；设置只能加不能减；★ **`config.root` 必需**"＋★★ **判据**："真的装上了"**不能只看 `settingsMerge`**（含 DATA 折入），要看 `bus.entries`／`hooks` ＋ 回执的 `packReport`／`packSources`／`applied`。
- **`docs/29`**：★ `verify2` 指出的**被抄的两行内联注释**（`:263`／`:306`）**已改** —— 现在都写"**R25 起真装载，但只装 middleware/rules、不折入 `settings/defaults.json` ⇒ 靠那些键声明的面/工具不会发布**"并指向新字段；★ **`:280`／`:291` 的"~~不装载~~"对照与 R25 更正块保留**（Lead 认可的"删除线＋对照"口径）。★ 全文 `不装载` 命中从 **5 → 3**，**剩 3 处全在更正块内**（历史对照，**故意留**）。

---

## 8. 原样命令 ＋ 退出码（同一次最终扫）

| 命令 | 读数 | 退出码 |
|---|---|---|
| `node tests/vmu-pack-defaults-named.test.mjs` | **`21 passed, 0 failed`** | **0** |
| `node tests/vmu-packs-active-switch.test.mjs` | `24 passed, 0 failed` | **0** |
| `node tests/vmu-host.test.mjs` | `107 passed, 0 failed` | **0** |
| `node tests/vmu-host-hooks.test.mjs` | `22 passed, 0 failed` | **0** |
| `node tests/vmu-entry.test.mjs` | `150 passed, 0 failed` | **0** |
| `node tests/audit-enforced-consistency.test.mjs` | `358 passed, 0 failed` | **0** |
| `node tests/vmu-pack.test.mjs` | `53 passed, 0 failed` | **0** |
| `node tests/vmu-kernel.test.mjs` | `175 passed, 0 failed` | **0** |
| `node tests/audit-package-membership.mjs` | `29 passed, 0 failed`（新测试已双登记） | **0** |
| `node tests/audit-vmu-docs.test.mjs` | `99 passed, 0 failed` | **0** |
| `node tests/audit-status-report-fields.mjs` | `19 passed, 0 failed`（★ 它只读 v2–v5，**不涉及本轮的宿主回执字段**） | **0** |
| `node scripts/check-docs.mjs` | `DOC LINT: PASS` | **0** |
| `node tests/audit-declaration-criterion.test.mjs` | ★ **`87 passed, 1 failed`** —— 唯一红是 **`regen-all --check`**（计数：本轮新登记文件 **+2**，含 `verify2` 的两个）；`RULE E 67=67`、`multi-line C 57=57` ✓ | 1 |
| `node D:\_tmp\vmu-pack14\falsify-r26.mjs` | M1 ⇒ 18/3；M3 ⇒ 17/4（含原始 13 vs 15）；复原 md5 相同 | 0 |

★ **`package.json` 只加 1 行**（新测试）；**轮末计数 +2 归 Lead 重生成**。

---

## 9. 交回 Lead／`vmu-verify2`

1. **A／B（含 (v)）／C／D 已落并各有读数**；**两条可证伪**（M1／M3）；**M2 未证**（§6.1，**如实**）。
2. **回 `verify2` ②**：现象**不是不存在**，而是**它读的是已修的树**；**可复现配置**＝**默认面集 ＋ 去掉 (v) 接缝**（我 M3 的原样读数就是证据）。★ **撤销**我早前"`calls > distinct` 判重装"那条**瞎的判别器**（现象本身由 15/13 独立撑住）。
3. **回 Lead ③**：两格验收口径**已采纳**（默认面集 ＋ 基准用 `published`）；★ 并**新具名**一处：`report` 面**已发布却未列入 `enabled`** ⇒ **第四条"两个字段讲不同的事"**，本轮**未动**（改它会动面订阅语义），**请裁**。
4. **回 Lead ①**：`RULE E` shape B（`vmu-pack-defaults-named.test.mjs:77`）**已修**（同表达式非空前置）⇒ `RULE E` 回 **67=67**；★ 这是本项目**第四次**同形状（`[].every` ×2、条件式断言 ×1、**等号两侧可空 ×1**），建议进矩阵时**并列**。
5. **回 Lead ④**：`docs/29` **被抄的两行内联注释已改**（`:263`／`:306`），`不装载` 命中 **5→3**，剩 3 处**全在更正块内**（历史对照，故意保留）。
6. **边界**：`kernel/meetings.js` 未碰；未跑全量／`regen-all`／git（除只读 `git status`／`diff --numstat` 取证）；**未自造公开码**；探针全在 `_tmp`。

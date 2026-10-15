# Round 31 · task-149 C（steps ①②③）· 报告（★ 进行中：①② 已落，等 Lead `--write` 后落 ③）

> 起点＝`_handoff/vmu/core-round29-report.md`（core2 的 R29 计划）与 `_handoff/vmu/comms-round30-report.md`（A／STOP-THE-LINE／b1b2b3）。本文件记 R31 的 C。
> 纪律：未跑全量（T0/T1 归 Lead）／未 `regen-all`／**未 git**；临时文件 `D:\_tmp\v31`；**未碰** `vibe-math-vmu.js`／`host.js`（R31 归 `vmu-pack2` task-153）；生成块内**绝不手写**。

## 0. 状态

| 步 | 内容 | 状态 |
|---|---|---|
| ① | `scripts/generate-wired-schema.mjs` 的 `HAND_DECLARED_DOMAINS`：1 → **9 键** | **已落 ✓** |
| ② | `schema.js` **块外**手写 9 行 `type:'enum'` ＋ `domain`（域从读取侧**逐字抽出**） | **已落 ✓** |
| ③ | Lead 跑 `--write`（生成块里那 9 行消失） | **等 Lead** |
| ④ | 11 处抽取（净减）＋11 处读取侧具名拒＋「`schema.domain` ≡ 读取侧集合」逐元素相等断言＋逐键反例 | **待 ③ 之后** |
| 附 | 生成器 `d.type === null ⇒ 'object'` 兜底 → 具名清单＋报告点名（Lead 本轮新增） | **待 C 之后（只动生成器，可与 C 并行）** |

## 1. ① 的落地（file:line）

- `scripts/generate-wired-schema.mjs:307-323`：`HAND_DECLARED_DOMAINS` 从 `['vmu.meetings.orderMode']` 扩到 **10 个成员**（1 旧 ＋ 9 新），每条带**为什么**的注释（生成器按模块读取的**字面量**发 `type:'string'`＝"任意字符串合法"，而读取侧 `oneOf(...)` 拒绝域外值 ⇒ **声明与执法相反**，比"声明没人执行"更糟）。

## 2. ② 的落地（file:line ＋ 域来源）

- `vibe-math-vmu/settings/schema.js:1049-1066`（★ 在 `WIRED-SCHEMA:BEGIN` **之前**，即**块外**）：9 行手写 `enum` 行，行号与域如下（**域＝从 `kernel/meetings.js` 的 `oneOf(sget(<key>), [ … ])` 调用点逐字抽取**，用脚本生成以免手抄漂移）：

| 键 | 域（逐字） | 默认 | 读取侧行 |
|---|---|---|---|
| `vmu.meetings.attendanceMode` | `roster｜signin｜quorum-only` | `roster` | `meetings.js:138` |
| `vmu.meetings.quorumLossPolicy` | `suspend｜continue｜recess` | `suspend` | `:147` |
| `vmu.meetings.budgetOnExceed` | `refuse｜warn｜extend` | `refuse` | `:154` |
| `vmu.meetings.leaveEarlyPolicy` | `allow｜note｜deny` | `allow` | `:171` |
| `vmu.meetings.minutesDetail` | `brief｜full` | `brief` | `:173` |
| `vmu.meetings.appealScope` | `all｜procedural｜none` | `all` | `:178` |
| `vmu.meetings.confidentialityDefault` | `public｜internal｜restricted` | `internal` | `:185` |
| `vmu.meetings.confidentialityQuotePolicy` | `allow｜redact｜deny` | `allow` | `:186` |
| `vmu.meetings.wakeFailurePolicy` | `refuse｜skip｜retry` | `refuse` | `:188` |

★ 对照（既有先例，无需改）：`tier`(`:136`) 与 `leaveApprover`(`:184`) **本来就是 `enum`**，且它们的 `domain` 与读取侧集合**逐字相同** ⇒ R17 的先例成立条件在本批里被复用。

## 3. `--write` 前的可验证信号（我实跑 `node scripts/generate-wired-schema.mjs --check`，exit=1 属预期）

```
INVARIANTS ok: 323 emitted, 792 pre-existing, 5 service surfaces, 6 with an honest null default
schema DRIFT (1756 -> 1747 lines)
```
- ★ **`emitted` 332 → 323（−9）／`pre-existing` 783 → 792（+9）**：**恰好那 9 个键从"生成块"移到"手写域键"**；
- **渲染后 1756 → 1747（−9 行）**＝生成块里那 9 行会被删掉，**我手写的 9 行不动**；
- **INVARIANTS 未报** `appears in the generated block`（生成器现在 **skip** 这 9 键 ⇒ 不会再把 `type:'string'` 写回去）；该不变量留给"`--write` 之后又被塞回块里"兜底。
⇒ **此刻 9 键各有 2 行是构造性重复**（我的手写行 ＋ 生成块里尚未删除的行），**`--write` 就是消掉它的动作**；在此之前 `BY_KEY` 取到的是生成块那条（`type:'string'`），故**域尚未在运行期生效**——这是迁移中间态，不是缺陷。

## 4. 待办（③ 之后一次性落，判据照 Lead）

1. **11 处抽取**：`meetings.js:128` 的 `oneOf` helper ＋ 11 调用点（`:136/138/147/154/171/173/178/184/185/186/188`）→ 新模块（先例 R11/R12 的 `meetingmarker.js`）⇒ **抽取前后 `split('\n')` 行数入报告，证明净减**（`meetings.js` 现 **1199/1200**）。
2. **11 处读取侧具名拒**（模板：`kernel/meetingmarker.js:296` 的 `strictOrderMode`／`:285` 的 `ORDER_MODES`）。
3. ★ **核心不变量**：**「`schema.domain` ≡ 读取侧集合」逐元素相等**（断言；R17 先例成立正因为两者逐字相同）＋ **逐键"域外值 ⇒ 红"** ＋ **当天种一次反例**。
4. **登记**：新模块**当场双登记**（`package.json files[]` ＋ `installer.js` 的 `PRESETS[].files`）＋ 零机制矩阵裁定行（若矩阵按模块枚举）。
5. 门禁：`generate-wired-schema --check`（`--write` 后须回到 in-sync）／`vmu-settings`／`vmu-meetings`／`audit-enforced-consistency`／`audit-package-membership`／`audit-doc-vs-code-tables`／`check-docs`／**RULE E 67=67**。

## 5. 附（Lead 本轮新增，排 C 之后或并行）
生成器 `d.type === null ⇒ 'object'` 的**兜底仍在**（R30 §9 残留 (b)）⇒ 改成**具名清单＋报告点名**：**判据＝给一个推断不出的 `def` ⇒ 必须有名字**，不许悄悄 `object`。与"`planned` 不执法但具名"同一条纪律：**不确定时必须出声**。★ 该改动只动 `scripts/generate-wired-schema.mjs`，与 C 的 `schema.js`／`meetings.js` 不冲突，故**可并行**。**状态：本轮未落（具名）** —— 我在 C 的抽取上把预算用尽，这条**只动生成器**、与 C 无耦合，下一轮第一件事即可（判据与范围已在上文写死）。

---

## 6. ③ 的落地（Lead `--write` 之后）

**抽取（原子，一次 Node 改写；锚点逐条断言"恰好一次"）**：`kernel/meetings.js` 的 `oneOf` helper ＋ **11 个调用点** → 新模块 **`kernel/meetingdomain.js`**；`meetings.js` **1199 → 1196（−3）**（删除：helper 1 行 ＋ 9 个"整行只放一个域键"的条目；新增：import 1 行 ＋ `const D = createMeetingDomains({ sget, refuse })` 1 行 ＋ `...D.values` 1 行 ＋ 注释 2 行 ⇒ 净 −3）；`budgetOnExceed`／`leaveEarlyPolicy` 两处与别的键同行 ⇒ 保留为 `D.values.<field>`。★ **"净减"的口径**：`meetings.js` 自身**下降**且**没有一个字节被搬到别处冒充减少**（9 个整行条目确实消失、其知识进了新模块的**表**）；★ **总行数的诚实算术**：新模块 ~60 行 ⇒ **两文件合计上升** —— 这与 **R11/R12 抽 `meetingmarker.js` 的形态完全一致**（当时 `meetings.js` 1244→1188 而总行数上升），也正是 1200 行规则要的补救；若 Lead 要的是**总行数也下降**，需要把 `K` 重建成表驱动（另一条设计，本轮未做，具名）。

**11 处读取侧具名拒**：新模块的 `read(key)` 对**域外值一律 `VMU_INVALID_ARGUMENT`**（已登记码，与 R17 的 `strictOrderMode` 同码），信息里**同时给出值与域**、hint 写明"REFUSED, never clamped"；`unset`（`undefined`／`null`／`''`）⇒ **声明默认值**（R30 的未设哨兵）；**零机制**：不注入任何接缝也能读（表是纯的）。
**★ 核心不变量（`tests/vmu-meeting-domain.test.mjs`，新，10 条）**：**逐键**断言 `schema.domain` 与读取侧 `values` **逐元素相等**（**同长度、同顺序、同成员**，不是比集合）＋ 默认值一致 ⇒ **11/11 通过**；并把"域为空"挡在门外（`D2` 非空前置）。**逐键"域外 ⇒ 红"**：构造期即具名拒（`R1`/`R2`）＋ **面级纵深防御**（`F1`：直接 `createMeetings` 喂域外值 ⇒ 构造期具名拒；`F2`：域内值照常开会）。
**当天反例（★ 红在被测那一行）**：`CTRL_MUTANT=clamp`（把新模块的具名拒**改回静默夹取** ＝ 本缺陷的形状）⇒ **7 passed / 3 failed，exit=1**，且红的正是 **R1／R2／F1** 三条（各自就是"该具名拒"的那一行）⇒ **变异打在预期行、红落在预期断言**（R27 那次的教训已核对）。
**登记**：`kernel/meetingdomain.js` 双登记 ✓（`package.json files[]` ＋ `installer.js` 的 `PRESETS[].files`）；新测试的 `package.json` 行**见 §7 待补**。
**同轮门禁（收尾）**：`vmu-meeting-domain 10/0`／`vmu-meetings 163/0`／`vmu-kernel 175/0`／`vmu-entry 150/0`（★ 每次结构性编辑后都跑，抽取未破坏加载）。

## 7. 具名未做（本轮预算用尽，逐条给判据与范围）

1. **生成器兜底 → 具名清单**（§5）：未落；范围＝`scripts/generate-wired-schema.mjs` 一处；判据＝"推断不出的 def 必须有名字"。
2. **`tests/vmu-meeting-domain.test.mjs` 的 `package.json files[]` 登记行**：★ **已补 ✓**（一条 `edit`，锚点＝`tests/vmu-settings-domain.test.mjs`）。
3. **零机制矩阵**：★ **已落（R31 内清掉，按 Lead 裁定"不猜词、先读闭集"）** —— 证据链＝① **生成器自己的实测行**（不带 `--check` 跑生成器）：`| meetingdomain · read() | refusal | VMU_NO_SUCH_OBJECT | — |`；② **闭集里与之逐字对应的词** ＝ **`具名拒（带 code）`**（该词已被 `grant` 使用；且 `judge()` 明写"**无名拒 ⇒ 红**"—— 本模块的拒**带 code**）；③ 加行后 **运行生成器 ⇒ exit=0**、该行显示 `具名拒（带 code）`、**不再有 `FINDING …未登记期望`**。★ **零机制逐字口径**：`createMeetingDomains({clock})`（**不注入任何接缝**）仍能建（表是纯的、11 键回落声明默认值）；探针调 `read()`（**无参 ⇒ 问一个未声明键**）⇒ **具名拒 `VMU_NO_SUCH_OBJECT`**（"no declared domain for undefined"）⇒ 零机制＝"**问我没声明过的东西就具名拒**"，不静默 `null`、不臆造默认值。**剩下的只是 `docs/11` 生成块陈旧**（`--check` 报 `matrix drifted`）⇒ **归 Lead 的 `--write`**（不是缺陷、不是猜词）。
4. **`docs/04`／`docs/08` 的值域表**若要跟着改（9 键 `type:'string'` → `enum`），属 docs 属主。

---

## 8. ★★ 「本次改动影响了哪些既有断言／套件」——C 的 ①② 让**我自己 R30 的断言过期**（T1 抓到，第三次同族）

**失败原样（Lead 实跑）**：`tests/vmu-settings-domain.test.mjs` **44/3**：`W3`（"a WRONG type is still refused, with an ACCURATE reason"）、`W4`（"a token of a `string` key is NOT screened out on the config face"）、`W5`（"and it is really in effect"）。
**根因**：这三条**把 `vmu.meetings.attendanceMode` 当作"代表性 `string` 键"**（写在断言里的**键名**）；而 **C 的 ①② 恰好把它从 `string` 提升为 `enum` + `domain`（`roster|signin|quorum-only`）** ⇒ 它的行为**正确地**变了（现在**该**被域检查拦，`bogus` **应**被筛）⇒ **过期的是断言，不是代码**（`W4` 的 detail 里 `type:"enum"`、`reason:"outside the declared domain …"` 就是证据）。
**修法（保留意图，不削弱）**：
1. **代表性键不再写死** —— ★ **从 `SETTING_DEFS` 按 `type` 程序化挑**（排除 C 提升的 9 键与 H3 只读键），且**先断言候选非空**（`W0`）：`const stringKeys = SETTING_DEFS.filter(d => d.type === 'string' && !promoted.has(d.key) && d.hot !== 'H3')`。
2. **W1/W2**（合法 `string` 值在交互面被接受）、**W3**（非字符串 ⇒ `expected a string`，**不是** `unknown declaration type`）、**W4/W5**（config 面一个 token **不被筛**且**真的生效**）全部改走 `strKey`/`strKey2` ⇒ **意图逐条不变**，只是"代表谁"由**声明**决定。
3. ⇒ **C 以后若再动类型，这些断言不会再过期**（这正是我 R30 §5 "逐 type 见证"的**更硬版本**：当时是按 type 取**值**，现在按 type 取**键**）。
**修复后**：`vmu-settings-domain` **48/0 exit=0**（+`W0`）＋ 全电池绿（见下）。
**★ 并入纪律（Lead 要求、第三次同族，两次都由门禁抓出）**：**改一个声明的类型/形状 ⇒ 必须跑【消费它】的断言**。三次实例：① R30 `audit-settings-channels` 的**合成探针值**（值域开始被执行 ⇒ 探针被正确拒）；② R30 `vmu-set-attribution` 的**域外探针值**；③ **R31 这次**：**代表键被提升类型** ⇒ `W3/W4/W5` 过期。⇒ **凡是"断言里写死了某个键名/形状"的地方，都要问一句：这个声明改了我这里会不会过期？**

**修复后同一次电池（全绿）**：`vmu-settings-domain 48/0`／`vmu-meeting-domain 10/0`／`vmu-meetings 163/0`／`vmu-kernel 175/0`／`vmu-entry 150/0`／`vmu-pack 53/0`／`audit-settings-channels 59/0`／`vmu-set-attribution 15/0`／`vmu-settings 47/0`／`vmu-planned-settings ALL GREEN`／`audit-enforced-consistency 358/0`／`audit-package-membership 29/0`／`audit-doc-vs-code-tables 17/0`／`generate-wired-schema --check` **in sync（INVARIANTS ok: 323 emitted/792 pre-existing）**／`check-docs PASS`／**RULE E 67=67**。


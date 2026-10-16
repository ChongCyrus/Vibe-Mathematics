# 裁定与清单 · **118 个"已声明但无人读"的设置键**（"最小必要"的真正工作面）

> 轮次：Round 5/256。★ 作者＝Lead（第一手机械读数 ＋ 判据裁定）。★ 本文件**只做清单与裁定**，不改代码。
> ★ 数据来源：**权威键集** ＝ `settings/schema.js:1413` 的 `SETTING_DEFS`（**1228 键**，与生成器自报一致）；★ 判据 ＝ `scripts/generate-vmu-settings-table.mjs` 导出的 `hasConsumer` / `carrierOf` / `verdictOf`。

---

## 1. 读数（可复算）

| 项 | 读数 |
|---|---|
| **权威键数** | **1228** ✓（＝生成器自报） |
| ★★ **已声明但【无消费者】** | **118 键 ／ 41 个域** |
| ★ 其中生成器分桶 | **113 "未接线" ＋ 5 "未判定"** ⇒ ★ **118 = 113 + 5 逐字吻合** ✓（两桶都不是"有消费者"） |
| ★ 生成器自己的词表（**已含本仓原则**） | `NOT_WIRED = '⚠️ 未接线（改了不会有行为变化）'`／`UNDETERMINED = '❓ 未判定（可能走动态读取，静态看不见 ⇒ 看不见 ≠ 没有）'` |
| ★ 抽样 | `carrierOf(<unwired[0]>) = null`，`verdictOf = ⚠️ 未接线` |

### 按域分布（前 20；完整 41 域）

| 域 | 未读键数 | 例 |
|---|---|---|
| `vmu.turn` | **22** | `turn.objective`／`turn.maxParallel` |
| `vmu.a11y` | 7 | `a11y.checkScope`／`a11y.checklist` |
| `vmu.ethics` | 5 | `ethics.approvalRef`／`ethics.dpiaRequired` |
| `vmu.ballot` | 4 | `ballot.freezeMeetingLinked`／`ballot.freezeMode` |
| `vmu.math` | 4 | `math.formal.coqArgs`／`math.formal.coqCommand` |
| `vmu.mentor` | 4 | `mentor.graduationNeedsHuman`／`mentor.maxMenteesPerMentor` |
| `vmu.attendance`／`committees`／`consensus`／`consent`／`deprecation`／`incident`／`names`／`prompt`／`script`／`sovereignty`／`stats`／`supplychain` | 各 **3** | `incident.disclosureDays`／`sovereignty.exportControl`／`supplychain.requireLock` |
| `vmu.paper`／`authorship`／`collab`／`collusion`／`handover`／`import`／`institute`／`preserve`／`pub`／`report`／`teaching`／`templates`／`work` | 各 **2** | `institute.name`／`import.onConflict`／`teaching.maxUnits` |

★ 其余单键域：`core.storeBackend`／`pointer.propagation`／`ballotbox.minVotes`／`data.retention`／`explain.fairnessDetail`／`identity.localFormat`／`notes.linkKinds`／`packs.searchPaths`／`setting.defaults`／`skills.catalogTtlMs`。

---

## 2. ★★ 为什么这是"最小必要"的真正工作面（裁定）

★ 根哲学的准入判据逐字包含两条：
> ★ **"找不到可能消费者的功能不进内核"**；★ 覆盖面之内的是"**对数学研究有利、有价值、且【存在可能消费者】**"的。

⇒ ★ 这 **118 键**（41 域）**目前没有消费者** ⇒ ★ **每一个都必须二选一**：
- ★ **(a) 待接线** ⇒ ★ 那就是**半成品**：★ 声明了、改它**没有任何行为变化**（★ 生成器的词表自己就这么说）⇒ ★ **必须给出"谁来接线、什么时候"**，否则它只是**占着"已声明"的名分**；
- ★ **(b) 该删** ⇒ ★ 按准入判据，**找不到可能消费者 ⇒ 不进内核** ✓

★ **本裁定不允许第三种答案**（"先留着"）：★ 因为**留着**正是本仓一路在拆的东西 —— ★ **"声明了却不生效"**与"**具名但不真**"是同一族 ✓

---

## 3. ★★ 对 `vmu-pack2` 两条先决风险的答复（它提出得对，我做了读数）

**★ 它的问题 #2（"把默认值搬到 pack，只有当该键【真的被读】时才叫迁移；否则那是给死键搬家"）—— 我已读数作答**：
- ★ 取 `phase3-policy-census.md` 全文引用的 `vmu.*` 串，逐个对**权威键集**核 ⇒ ★ **凡在权威键集里解析到的，全部都【有消费者】（38 wired／0 dead）** ⇒ ★★ **所以批 1 要搬的那些键【不是死键】，是真正的迁移** ✓
- ★★ **我的仪器边界（如实）**：★ 我抽到 **150 个串，其中 112 个【不是完整键】**（★ 它们是**域前缀**，如 `vmu.hooks`／`vmu.packs`）⇒ ★ 那是**我的正则过度捕获**，★ **不是普查错** ⇒ ★ 有效样本是**解析成功的那 38 个**，★ **"0 dead"这句只对这 38 个成立** ✓

**★ 它的问题 #1（普查正则只抓到 1117/1228，§2 的键可能有不在真集里的）—— 裁定**：
- ★ **动 schema 之前，必须用【权威键集】核一遍**（★ 我上面用的就是 `SETTING_DEFS`）⇒ ★ **凡不在权威键集里的，一律不动** ✓
- ★ 并且 ★ **批 1 的键清单以权威键集为准，不以普查的正则为据** ✓

---

## 4. ★ 因此对 `task-210`（政策迁移）的裁定（写给下一轮）

1. ★★ **先做"是否被读"的过滤**：★ 只搬**有消费者**的键；★ **无消费者的键【不搬】**（★ 搬它＝给死键搬家）⇒ ★ 它们的去处是 §2 的 (a)/(b) ✓
2. ★★ **再核"一所有者"**：★ 逐键查 `packs/v5r/prompts/v5r-core.js`（manifest 12 键）**是否也声明** ⇒ 两边都声明＝具名 `VMU_PACK_CONFLICT` ✓
3. ★★ **改形后必须跑那条决定性验证**：★ 真装配 `settings.resolved` **前后逐键比 1228 个值** ⇒ ★ **值全同、只有 `source` 由 `default` 变 `pack:v5r`** ⇒ ★ **任何值变了就是回归** ✓（★ `vmu-pack2` 已存 **BEFORE 基线** `D:\_tmp\p3-parity\p201-before.json`，★ 但**它在 `D:\_tmp`，6 小时后按你的临时件规则会被清** ⇒ ★ **下一轮开工时须重存一次 BEFORE**，★ 别依赖旧文件）
4. ★ **批的大小按"能跑完验证"来定**（★ 它上轮拒做的理由正是"改完没预算验证"）⇒ ★ **宁可每批 5–8 个键 **而**每批都带前后对比**，★ 不要一次 31 个却验证不了 ✓

---

## 6. ★★ 裁定：新的 R1 门取"可缩台账"，不取"收窄分类器"

★ 背景：`vmu-core2` 建了 `tests/audit-policy-defaults.test.mjs` —— 判据＝**非中性的 `def:` 字面量必须带受许标记 `capability-default: <理由>`**（封闭集，风格照 `fs-purpose:`），★ 并**双向演过**（今天是红的／中性化后绿／**再种一个新键 `vmu.planted.meritLine: 67` 也能按名抓到**）✓
★ 它把量级判断交给我，并给出两个选项 ⇒ **我的裁定**：

**★★ 取 (甲)：冻结台账 `KNOWN_UNMARKED_COUNT = 635`，"可缩不可涨"**，理由四条：
1. ★ 若写成"未标记 ⇒ 红"，**第一天就红 635 个键** ⇒ ★ **那不是门，是墙** —— ★ 正是本仓一路在防的形态（★ 与本仓 `KNOWN` 超额名单同型且同源）✓
2. ★ 台账**不能挡住【新增】**：★ 新来一个未标记的非中性默认 ⇒ **636 ⇒ 红**，★ 而且失败消息**逐字告诉作者该写什么** ✓ —— ★ **这才是门该干的活**（**管增量**，★ 不是把存量一次判死）。
3. ★ 它**每次跑都打印完整未标记清单** ⇒ ★ **清单本身就是"最小必要"的工作面**（★ 与 §1 的 118 键清单互补：★ 一个说"没人读"，一个说"是政策形态"）✓
4. ★★ **我要求把台账当【进度计】，而不是当【豁免】**：★ 每完成一批 P2-01 的迁移／每删一个惰性键，★ **必须同步下调 `KNOWN_UNMARKED_COUNT`** ⇒ ★ **数字下降即进度可见**；★ 若长期不动，★ 它就是**负债的收据** ✓

**★★ 不取 (乙)（把分类器收窄到"非中性字符串/枚举"）**：★ 它确实能精确覆盖 `license.codeDefault:'MIT'`／`privacy.classification:'C1'`／`reviewers.coiPolicy:'deny'`，★ **但它【看不见 `compliance.saeLimitMs: 86400000`（24h 监管时限）】** —— ★★ **而 24 小时上报时限恰恰是全部默认值里【最像政策】的那一类** ⇒ ★ 为了少一个台账而**漏掉最政策的东西**，★ **取舍反了** ✓

★ 附：★ 该门**自带的诚实条款**（自己写明不覆盖：★ 取零值却仍是政策的默认（点名 `teaching.passMark: 0`）／★ 编码政策的布尔（`teaching.allowAuditors: false`）／★ 域本身机构化而默认中性的键／★ 键是否真被模块读取）⇒ ★ **这正是"说清它近似了什么"**，★ 与我给它的要求一致 ✓
★ 另一件它具名上交的遗留：**新测试文件的双登记** —— ★ **我已核：不需要** ✓（★ 新门在盘上时 `audit-package-membership` 仍 **29/0**，★ 与 `task-207` 的结论一致：★ 只有 `*.mutants.mjs` 被强制登记）✓

---

## 7. 没核（★ 与"核了"分开）

1. ★ **没有逐键读模块** ⇒ ★ `hasConsumer` 是**静态**判据，★ 与生成器 `UNDETERMINED` 那条自陈一致："**可能走动态读取，静态看不见 ⇒ 看不见 ≠ 没有**" ⇒ ★ **这 5 个"未判定"键尤其不能当死键处理** ✓
2. ★ **没有核这 41 个域各自的 `doc` 是否已自陈"待接线"**（★ 若已自陈，★ 处置口径可能不同）。
3. ★ **没有核这些域里哪些原本属于 v3/v4/v5 的历史遗留**（★ 与"v3-core 只有 1 个文件"那条缺口相关）。
4. ★ **没有核删除一个键的代价**（★ 是否有人在 config 里设过它 ⇒ ★ 需要读配置/迁移面）。
5. ★ **本文件未改任何代码**；★ 未跑 git；★ 临时脚本在 `D:\_tmp\triage.mjs`（只读）。

# vmu 交接 · Round 5 · task-39 报告（v3-core 包私有键处置 · 新键声明 · 心跳声明点 · docs）

- 任务：`task-39`（vmu-pack）；纪律：未跑全量 sweep、未跑 `regen-all`、未动 git；临时文件在 `D:\_tmp`；只改我名下文件（`packs/**` 除 `packs/v5r/prompts/**`、`docs/05/06/10/27`）。
- 本轮**未改任何 kernel 文件**（无钩子/管线/加载器改动）；`audit-hook-emit-classification` 仍 **7/0** 佐证"每个 emit 名仍已分类"。

---

## A. `packs/v3-core` 的 5 个包私有键 · **已闭合**（有读者者进 schema；无读者者具名退役）

**实测（本轮第一步）**：5 个 `vmu.v3.*` 键**都不在 schema**；其中**只有 2 个有读者**（`packs/v3-core/index.js:80` 读 `verifierCount`、`:105` 读 `mode`），另 **3 个全仓零读者**（唯一出现处就是自己的声明：`solverMaxRounds`／`planningHorizon`／`promoteValueThreshold`）。

**① 有读者的 2 个 → 进 schema（core 已落）**
- 我给出精确键定义（type/def/hot/who/doc + 读者 file:line）→ vmu-core 落 `settings/schema.js:85-86`：`vmu.v3.verifierCount`（natural/3/H1/office）、`vmu.v3.mode`（enum[auto,manual]/auto/H1/office）。
- ⇒ 运行期 `vibe_vmu_set` 不再以"未声明键"拒它；先例一致（v5r 包的 `vmu.records.requireSettledRecords` 也是包私有但进 schema）。
- `packs/v3-core/index.js:46-51` 的注释同步改成"**已进 schema**、可运行期调"，并写明为什么这样比"能读但永远不能 set"更对称。

**② 无读者的 3 个 → 移除声明 + 具名登记为扩展点**
- `packs/v3-core/index.js` 删掉这 3 行；注释里写明"v3 的 solver 轮次 / planner 地平线 / 晋升阈值机制本框架尚未具备 ⇒ 登记为扩展点，不再假装可配置"。
- `docs/10 §4.2` 具名登记（**故意不写 `vmu.` 前缀**：它们不再是键；写全名会让"文档里有、schema 里没有"的门禁再红）并保留 v3 的设计值（3 / 3 / 0.7）作为**设计意图**。

**判据（可复核）**：`grep -rn "vmu.v3." vibe-math-vmu` 只命中 `packs/v3-core/index.js`（2 键声明 + 2 处读取）与 `settings/schema.js:85-86`；**没有第三处**。`docs/10` 里 `vmu.v3.<名>` 全名形态计数＝**0**（我单独核对过）。

## B. Round 5 新键 · **无可声明项**

- **实测**：`git diff HEAD -- vibe-math-vmu/settings/schema.js` 的 `+key:` 行**只有** core 为我落的那 2 个 `vmu.v3.*` ⇒ **Round 5 无面级新键落进 schema**。
- **各面回复（全部到齐）**：reader-a（F35/F39）**无新键**（环检测与写域 advisory 都是无条件机制，无开关）；reader-b（sleep 处置）**无新键**（走"具名豁免 + 有界退避"，不加接缝/键）；reader-c（F26/F31/F32/F34）**无新键**（票型是内核固定枚举、折叠窗口与开辩资格是构造参数）；**core：U14／F16 都没有新键**——U14（overlay）是 `preset-declaration.js` 声明行的 **`config.overlay` 字段**（id 键控的局部 config 深合并，缺省＝零机制，部署用一份 `--patch` 打声明行），F16 见 C。⇒ **本轮无可声明项**（纪律：读者未落地不写）。
- 顺带确认（reader-a）：v5r 提示词里早已出现的 **`write_scopes`** 字段本轮起被内核**消费**（advisory、不阻断、重叠可见）⇒ 已写进 `docs/10 §4.1 边界⑪`，不再标"未接"。

## C. 心跳 / 周期的**声明点**（pack 侧）· **core 判定：不需新键；v5r 不声明心跳**

- **实测**：`vmu.schedule.triggers` 被 `kernel/scheduler.js:594-607` 真读（构造时逐条转 `api.every`／`api.once`；坏种子**计数 + 报 `schedule/seed-rejected`**，不静默）；策略键 `vmu.schedule.triggerVia`（默认 `none`＝只报告）／`timeSource`（`tick-only`）／`coalesceMissed`／`overdueGraceMs`／`maxPending` 见 `settings/schema.js:508-515`。
- ★ **core 的关键判定：声明 ≠ 会跑**——内核**不自动 `arm()`**（自启会让"完全没声明的部署"也跑定时器 ⇒ 违反零机制）；pack 要周期推进必须**自己 `arm()` ＋ 按自己的时钟 `tick()`**（或 `timeSource:'host-timer'` ＋ 注入 timer 接缝）。core 已把这条边界写进 `docs/03`，并给**改判条件**：若真机验收要求"声明即心跳"，入口加一行 `arm()` 且必须自曝 `status().scheduler.armed`。
- **片段**（已写进 `docs/10 §4.3`，给**需要**心跳的 pack）：
  ```js
  'vmu.schedule.triggers': [{ kind: 'every', intervalMs: <周期>, what: 'heartbeat', payload: { phase: 'heartbeat' }, by: 'settings' }],
  'vmu.schedule.triggerVia': 'none', 'vmu.schedule.coalesceMissed': true,
  ```
  配套：pack 侧 `arm()` ＋ 自己的 `tick()`。
- **v5r 的结论（最终口径）：不声明心跳**，两条理由——① v5r 侧**没有可核的心跳周期**（`activityTimeoutMs`／`recoverStallMs` 是**论文阶段的静止阈值**，不是周期；写 900000 就是臆造常量，本仓禁止）；② v5r 的静止提示在原文里是**框架侧推荐**（R1："only RECOMMENDS"），而 vmu 把"是否周期推进"交给**部署**（声明种子 + 自行 arm/tick）⇒ 保持零机制：**无声明 ⇒ 一个定时器都不跑**。⇒ `packs/v5r/settings/defaults.json` **不新增任何 `vmu.schedule.*` 键**。

## D. 文档 · **已落**

| 卷 | 改了什么 |
|---|---|
| `docs/10-packs.md` | **新增 §4.2**（v3-core 包私有键处置：进 schema 的 2 个 + 退役登记的 3 个，含"为什么进 schema 更对称"与可复核 grep）；**新增 §4.3**（心跳声明点 + 可复制片段 + "不预置周期的具名理由"）；§4.1 边界新增 **⑪**（`write_scopes` 已被内核消费，advisory） |
| `docs/05` / `docs/06` / `docs/27` | **未改**（本轮零钩子/中间件/管线改动；`audit-pack-face` 5/0 说明 pack 文件清单无新增；`docs/10 §4.2` 的 grep 判据覆盖了 pack 侧变化） |

---

## 验证（原样命令 + 退出码）

工作目录 `Vibe-Mathematics`。

| 命令 | 退出码 | 结果 |
|---|---|---|
| `node tests/vmu-planned-settings.test.mjs` | 0 | **ALL GREEN（planned=113, docs=27, passed=39, failed=0）**——core 落了两键并重生成 docs/04 §11 后转绿（我这边 group G 无任何未登记名） |
| `node tests/vmu-pack.test.mjs` | 0 | 53 passed, 0 failed |
| `node D:\_tmp\vmu-pack-defaults-vs-schema.mjs`（仓库外一次性探针·实测） | 0 | `packs-with-defaults checked; undeclared=0` / `total undeclared=0`（**v3-core 清单 5 键 → 0**） |
| `node scripts/check-docs.mjs` | 0 | `vmu doc-lint: docs=29 issues=0` / **DOC LINT: PASS**（新增 §4.2/§4.3 后仍过） |
| `node tests/vmu-pack-fields-match-category.test.mjs` | 0 | 14 passed；packs=3 refusals=0 misplaced=0 |
| `node tests/vmu-pack-manifest-pointers.test.mjs` | 0 | 8 passed, 0 failed |
| `node tests/vmu-pack-data-sections.test.mjs` | 0 | 14 passed, 0 failed |
| `node tests/audit-pack-face.test.mjs` | 0 | 5 passed, 0 failed |
| `node tests/audit-hook-coverage.test.mjs` | 0 | 4 passed, 0 failed（85 个登记钩子 ⇄ emit 点） |
| `node scripts/audit-hook-emit-classification.mjs` | 0 | **7 passed, 0 failed**（分类完备 / 无纸面能力 / declareTopic 对称） |
| `node tests/audit-vmu-release.test.mjs` | 0 | 22 passed, 0 failed |
| `node tests/audit-doc-vs-code-tables.test.mjs` | 0 | 17 passed, 0 failed |
| `node tests/audit-doc-api-coverage.test.mjs` | 0 | 2 passed, 0 failed |

**非我红（已定位，未改他人文件）**：
- 轮 5 首跑时 `vmu-planned-settings` 有 1 条 `docs/04 is classified as a mirror …`（core 的卷）——**core 已单文件重生成 docs/04 §11（1219 键）后消失**；本条**现已全绿**，不再是非我红。
- 轮 4 遗留的三条按 Lead 分工（`vmu-round1-seams` 的 F9 断言、`audit-package-membership` 的 `meetinglapse.js`、生成块 stale）由对应 owner / Lead 收尾。

## 未做 / 待他人

1. ~~core 的 U14/F16 键~~ ⇒ **core 已答复：U14（`config.overlay` 字段）与 F16 都不新增 settings 键** ⇒ 我这边**无可声明项**，本轮 B 项闭合。
2. ~~心跳的判定~~ ⇒ **core 已判定：不需新键；内核不自动 arm**；`docs/10 §4.3` 已按最终口径改写（声明点 + arm/tick 配套 + **v5r 不声明心跳**）。
3. ~~docs/04 mirror 失败 / planned 116-113~~ ⇒ **core 重生成 docs/04 §11 后 `vmu-planned-settings` ALL GREEN（planned=113, 39/0）**。
4. 轮 4 遗留、按 Lead 分工由他人收尾：`vmu-round1-seams`（core 的 F9 返回对象 vs 旧断言）、`audit-package-membership`（`kernel/meetinglapse.js` 未登记 `files[]`，vmu-verify）、`audit-surface-index`/`audit-vmu-docs` 的生成块 stale（Lead 的 regen）。
5. **本任务无遗留项**。

# Phase 2 · 覆盖面矩阵与"过度建造"审查（Lead 亲自做）

> 轮次：Round 2/256（新目标第 1 个实质轮）。★ 作者＝Lead。★ 本文件**只写矩阵与判定**，**不改代码**（修由成批安排）。
> ★ 方法：**先量表面，再问归属**。★ 量的是"内核模块数／代理可执行命令数／可调控参数键数与域数／pack 数"；★ 问的是"**这是【能力】还是【机制决定】？**" —— ★ 因为根哲学（`01-§1.1`）规定：**能力与挂点可以进内核，机制决定必须留在 pack/中间件**。

---

## 0. 量到的四个表面（★ 事实，可复算）

| 表面 | 数量 | 出处／复算法 |
|---|---|---|
| **内核模块** | **100** 个 `.js` | `vibe-math-vmu/kernel/*.js`（另有 `kernel/prompt/`、`kernel/turn/` 两个子目录） |
| **工具面文件** | **47** 个 | `vibe-math-vmu/tools/*.js` |
| **设置键** | **1228** 个 | `node scripts/generate-vmu-settings-table.mjs --check` 报 `1228 keys (1110 wired, 5 undetermined, 113 declared-but-not-wired)` |
| **设置【域】**（`vmu.<域>.` 前缀） | **≈120** 个 | `grep -o "key: 'vmu\.[a-z0-9]*\." settings/schema.js` 去重计数 |
| **pack** | **4** 个 | `packs/`：`v5r`(16 文件)、`institute-min`、`v3-core`、`example-data` |
| **扩展** | 1 个 | `extensions/domain-compliance/`（`index.js`＋`gate.js`） |

★ 键数最多的域（前 20）：`math` 105｜`meetings` 58｜`records` 32｜`external` 31｜`workflow` 27｜`notify` 24｜`turn` 24｜**`teaching` 24**｜`ballot` 23｜**`compliance` 20**｜**`allocation` 20**｜`charter` 18｜`conference` 18｜`resource` 17｜`audit` 17｜`memory` 16｜**`trust` 16**｜**`funding` 16**｜`store` 15｜**`ip` 15**。
★ 另有 `paper` 14｜`fairness` 13｜`capacity` 12｜`topology` 12｜`delegation` 12｜`admission` 12｜`funds` 11｜`human` 11｜`handover` 11｜`tenure` 11｜`roles` 11｜`dissemination` 10｜`skills` 10｜`crypto` 10｜`budget` 9｜`identity` 9｜`conflict` 8｜`arbitration` 8｜`agreements` 7｜`collab` 7｜`privacy` 6｜`custody` 5｜`grant` 4｜`reviewers` 4｜`collusion` 4｜`license` 4｜`quota` 4…

---

## 1. ★★ 头号发现：**"最小必要"这条现在【站不住】**（待裁定，不是已证缺陷）

★ 用户对 vmu 的定位里有一句硬要求：★ **"充分符合哲学理念的**最小必要/最小可用的**但又足够强大"**。
★ 而实测表面是 **1228 键／≈120 域／100 内核模块**。
★★ **问题不在数量本身**，而在**其中相当一部分域的名字听起来像【机构政策】而非【能力】**，例如：
`teaching`(24)｜`funding`(16)｜`funds`(11)｜`grant`(4)｜`allocation`(20)｜`budget`(9)｜`quota`(4)｜`ip`(15)｜`paper`(14)｜`dissemination`(10)｜`license`(4)｜`tenure`(11)｜`fairness`(13)｜`trust`(16)｜`compliance`(20)｜`privacy`(6)｜`anonymity`(2)｜`collusion`(4)｜`partnership`(6)｜`handover`(11)｜`reviewers`(4)｜`course`(?)｜`conference`(18)

**判据（来自根哲学）**：★ **"一个数值"不等于"一条政策"** —— ★ 同一件事可以有**两种身份**：
- ★ **能力身份**（可进内核）：例如"**支持**按阈值触发一次评审"；
- ★ **机制身份**（必须留 pack）：例如"**阈值＝5**、**评审人是谁**、**谁有资格**"。
⇒ ★★ 所以这 120 个域**必须逐个判定它属于哪一种**，判定前**不能**说它越界；但**也不能**因为"它被实现了"就说它合规 —— ★ **本项目的标准是"能说出它服务于哪个追求"**（`01-§1.2`）。

★ **本文件【不声称】这些域越界**（★ 我**没有逐个读它们的语义**，只量了键数与域名）。★ 记为 **最优先待裁定项 P2-01**：★ **逐域判定"能力 vs 政策"，把属于政策的降进 pack/中间件，或明确写成"可声明能力＋pack 默认值"。**

---

## 2. ★★ 第二发现：**同一事实两个写者**（★ 已证，非待判）

**P2-02**｜`packs/v5r/settings/defaults.json`（**43 键**）与 `packs/v5r/settings/defaults.js` 的 `V5R_SETTING_DEFAULTS`（**43 键**）★ **是两份【手写的同义字面量**：
- ★ `defaults.js` **没有任何 import／require／读 JSON**（我实测：`^import|require\(|readFileSync|JSON.parse|defaults\.json` **零命中**）⇒ ★ **自足字面量**，与 JSON **43/43 同键**；
- ★ 两者**都在承重**：★ **运行时折叠读 JSON**（入口 `join(here, 'packs', id, 'settings', 'defaults.json')`）；★ **门禁 `scripts/audit-pack-value-domain.mjs` 读 JS 符号**；
- ⇒ ★★ **结论：同一事实两个手工维护的写者 ⇒ 漂移时【运行时不知、门禁也不知**（各读自己那份）**】** ⇒ ★ **真缺陷**（与 `01-R4 设置单一源` 直接冲突）。

★ **修法（下一轮成批判）**：★ **让 `defaults.js` 从 JSON 派生**（读 `./defaults.json` 后 `Object.freeze`）⇒ ★ **单一真源**，★ 且**门禁读的那个符号仍然存在**（不必改门禁）；★ 或至少加一条断言二者一致的测试（★ 但**派生优于断言** —— 断言仍是两个写者）。

---

## 3. (a)–(j) 覆盖矩阵（★ 只填"我实测到的表面"；★ 未逐模块读语义的地方一律标"未判"）

| # | 领域 | 基础设施（内核模块，抽样） | 代理可执行命令 | 可调控参数（域） | 判定 |
|---|---|---|---|---|---|
| **a** | 数学研究 | `math.js` `mathtools.js` `mathjobs.js` `mathadapters.js` `library.js` `formal.js` `lean.js` `citations.js` `paper.js` `publication.js` | `mathtools` `mathadapters` `mathjobs` `publication` `citations` | `math`(105) `formal`(5) `paper`(14) `citations`(6) | ★ 表面齐；**未判**语义 |
| **b** | 形式化 | `formal.js` `lean.js` `repropack.js` `citations.js` | `formal` `publication` | `formal`(5) `repro`(7) | ★ 表面**偏薄**（两模块＋5 键）⇒ ★ **列为缺口候选 P2-03** |
| **c** | 计算与工具 | `mathadapters.js` `mathtools.js` `mathjobs.js`＋入口 `math-computation.js` `math-engines.js` `host-math.js` | `mathtools` `mathadapters` `mathjobs` | `math`(105) | ★ 表面厚 |
| **d** | 代理通信与会议 | `meetings.js` `meeting.js` `meetingdomain.js` `meetinglapse.js` `meetingleave.js` `meetingmarker.js` `chat.js` `mailbox.js` `panel.js` `notify.js` | `meeting` `minutes` `chat` `mailbox` `panel` `notify` | `meetings`(58) `chat`(6) `mailbox`(6) `panel`(4) `notify`(24) `agenda`(6) `motions`(9) | ★ **最厚的一块** |
| **e** | 代理间协作 | `collab.js` `delegation.js` `partnership.js` `handover.js` `recruit.js` `members.js` | `collab` `recruit` `handover` `governance` | `collab`(7) `delegation`(12) `partnership`(6) `handover`(11) | ★ 表面齐 |
| **f** | 工作流 | `workflow.js` `work.js` `tasks.js` `board.js` `scheduler.js` | `task` `board` `turn` | `workflow`(27) `work`(2) `tasks`(4) `board`(6) `schedule`(14) | ★ 表面齐 |
| **g** | 控制流 | `control.js` `lifecycle.js` `guard.js` `limits?` `ratelimit.js` `idempotency.js` `replay.js` `transaction.js` | `control` `ratelimit` `idempotency` `transaction` `turn` | `control`(9) `limits`(5) `ratelimit`(8) `idempotency`(9) `lifecycle`(11) | ★ 表面齐 |
| **h** | 文件归档 | `library.js` `records.js` `store.js` `storepolicy.js` `memory.js` `retention.js` `custody.js` `migration.js` `projmigrate.js` `stateversion.js` | `retention` `custody` `projmigrate` `audit` | `records`(32) `store`(15) `memory`(16) `retention`(?) `custody`(5) `archive`(5) `migration`(11) | ★ 表面厚 |
| **i** | 评审与出版 | `reviewers.js` `publication.js` `paper.js` `citations.js` `ip.js` `dissemination?` | `reviewers` `publication` | `review`(4) `reviewers`(4) `publish`(3) `ip`(15) `dissemination`(10) | ★ 表面齐（★ 未判语义） |
| **j** | 代理自组织 | `identity.js` `roles?` `charter.js` `tenure.js` `capacity.js` `topology.js` `admission.js` `recruit.js` `members.js` | `admission` `recruit` `topology` `charter` `human` | `roles`(11) `charter`(18) `tenure`(11) `capacity`(12) `topology`(12) `admission`(12) `identity`(9) | ★ 表面**极厚** ⇒ ★ **优先做 P2-01（能力 vs 政策）判定** |

★★ **矩阵的诚实边界**：★ **上表"表面齐/厚"只表示【有模块与有键】** —— ★ **不等于**逻辑完整、语义正确、与 v5r parity 成立。★ 后者由 Phase 1 的四份 parity 报告负责（★ 其中 prompt 两份、runtime 两份、settings 一份**已派在做**）。
★ 另：★★ **`v3-core` 与 `institute-min` 两个 pack 只有 1 个文件** ⇒ ★ 表里"一批可直接用的整合包"（`00-§1`）**目前只有 v5r 是真正成套的** ⇒ ★ **列为缺口候选 P2-04**（★ 与 `01-R15 可迁移` 有关：v3 复现是否只是占位）。

---

## 4. 缺口候选汇总（★ 待 Phase 1/3 报告回来后一起裁定，避免重复劳动）

| 编号 | 缺口 | 依据 | 备注 |
|---|---|---|---|
| **P2-01** | **120 个域未做"能力 vs 政策"判定** ⇒ "最小必要"无法成立 | §1；根哲学 `01-§1.2` | ★ **最高优先**，工作量按域计 |
| **P2-02** | ★ **`defaults.json` ↔ `defaults.js` 双写者**（已证） | §2 | ★ 修法明确：**派生** |
| **P2-03** | **形式化 (b)** 表面偏薄（`formal`/`lean` 两模块＋`formal` 5 键） | §3 | ★ 待 Phase 1/3 确认不是我看漏 |
| **P2-04** | **"一批可直接用的整合包"目前只有 v5r 成套**（`v3-core`/`institute-min` 各 1 文件） | §3 | ★ 与 `01-R15` 有关 |
| **P2-05** | **113 个"declared-but-not-wired"设置键** | 生成器自报 | ★ **需逐条判定：是待接线，还是该删** |

---

## 5. 没核（★ 与"核了"分开）

1. ★ **没有逐个读 100 个内核模块 / 47 个工具面 / 1228 个键的语义** ⇒ 本文一切"判定"**只基于命名与数量**。
2. ★ **没有核 `tools/*.js` 真正注册给代理的命令名**（我第一次的正则零命中，**未重试**）⇒ §3"代理可执行命令"一列用的是**文件名**，★ **不是**已验证的工具 id。
3. ★ **没有核 `v3-core`/`institute-min` 的内容**（只数了文件数）。
4. ★ **没有核** `extensions/domain-compliance` 的作用与它是否算 (a)–(j) 之一。
5. ★ **没有核** 113 个未接线键里哪些是"有意留待扩展"、哪些是"半成品"。

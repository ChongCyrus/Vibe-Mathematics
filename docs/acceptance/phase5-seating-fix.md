# Phase 5 · **座位修复（已落地）＋ 真机新发现**（Round 32）

> ★ 作者＝Lead。★ 依据：`kernel/recruit.js` 的改动 ＋ `vmu-recruit` 套件 ＋ 真机运行 `…233053`。

## 1. ★★★★★ 已落地并验证：**`confirm` 现在把成员【放进】内核名册**

★ **改动**：★ `kernel/recruit.js` 的 `confirm` 改为 `async`，★ 并在**缓刑检查之后**调用**已发布服务** `members.assignRole(s.memberId, s.slot)` ✓
★ **成因（★ 已定到行）**：★ 在此之前，**没有任何已发布路径**往 `kernel.members`（★ `turn` 读的那份名册）里放人 ⇒ ★ **每次 `turn` 都合法地回 `no-members`** ⇒ ★ **没人被唤醒 ⇒ 没人投票 ⇒ 论文阶段与 `finalize` 不可达** ✓

**★★ 两处**必须区分**的失败（★ 这是本阶段一直在消的那一族）**
1. ★ **重放**：★ 幂等早返回**在事件与入座【之前】** ⇒ ★★ **唤醒事件每个成员恰好发一次** ✓（★ `task/assign` 就是**唤醒动作** ✓）
2. ★★ **没有声明任何角色槽位** ⇒ ★ **独立的具名拒**（★ `VMU_ENGINE_UNAVAILABLE`，★ 文案说"角色没接上"），★ **故意【不】与"槽位已满"共用一句话**（★ 后者已由 `VMU_RESOURCE_BUDGET` 单独拒 ✓）✓

**★★ 两条探针（★ 由 `vmu-core2` 指定，★ 已写进套件）**
- ★★ **P1（幂等）**：★ `confirm` **连调两次** ⇒ ★ 断言**唤醒事件恰好一次**、★ 名册里该成员恰好一次 ⇒ ★★ **"计数是『唤醒不得重复』的唯一证据形式"** ✓ —— ★ **而它当场抓到了我**：★ 我的重放路径漏了 `seated:true` ✓
- ★★ **P2（无角色）**：★ 用 `members: null` 建流水线 ⇒ ★ 断言**独立的具名拒**且文案指向"角色没接上" ✓

**★★ 验证（★ 三件都做了）**：★ **导入两个模块** ✓；★ **源码结构探针**（★ 断言入座在 `confirm` 内、且在幂等早返回【之后】✓）；★ **反例/探针** ✓
★ **套件**：★ `vmu-recruit` **50/0**（★ 从 41/3 → 49/1 → 50/0）／★ `vmu-members` **39/0**／★ `vmu-turn` **148/0**／★ `vmu-pack` **53/0**／★ `vmu-meeting` **50/0** ✓

## 2. ★★ 真机（`…233053`）：★ 干净完成，★ 但仍未收敛

★ **读数**：★ `exit=0 dur=344s tokens=1,345,529 capHit=False timeoutOrFatal=False` ✓；★ `packs:["v5r"]`、★ **`appliedPacks:["v5r-core"]`**、★ `store:true`、★ `library:true`、★ **`phase:"round-robin"`** ✓
★★ **但**：★ **无 `vote_solved`／`allSolved`／`paper`** ⇒ ★ **停止条件未触发** ✓ —— ★ **诚实记：本轮【仍未观测到收敛】** ✓

## 3. ★★★ 本次真机【新发现】的两个缺陷

1. ★★★ **`vibe_vmu_admission` 与 `vibe_vmu_recruit` 是【重复面】** —— ★ 代理逐字：★ *"the prompt has both `vibe_vmu_admission` and `vibe_vmu_recruit` (**same 15 actions — duplicate face**)"* ✓✓ ⇒ ★ **同一动作集被发布了两次** ⇒ ★ 应**合并或明确分工** ✓
2. ★★ **`vibe_vmu_capacity` 的 schema 枚举与描述不符** —— ★ schema 列 `admit/forecast/list/receiptsView/release/reserve/status/storage/waitlistView`，★ 而描述写 `register/retire/…` ⇒ ★★ **接口契约与实现漂移** ✓

★ 另：★ **四类"必须贴原文"的回执本次仍【无法获得】**：★ ① 会议结论行（★ `complete:false` ＋ pending）；★ ② 验证齐票/`outcome`（★ 无 `tally`）；★ ③ **根本没有论文 `finalize` 面**；★ ④ **状态面的 `phase`/`quorum`/`paper` 四段"不存在（计数为 0）"** ✓
★★ **而它确认：★ 提示词里列出了约 56 个 `vibe_vmu_*` 名字** ⇒ ★ **能力面确实全部发布了** ✓

## 4. ★ 我自己的一个量具错误（★ 第 N 次同族）

★★ **我的读取脚本里【硬编码了上一次运行的转录路径】** ⇒ ★ **于是我把【上一轮】的 `members:0` 当成了本轮读数** ✓（★ 幸好我在写记录前发现并改成了"取最新" ✓）
⇒ ★★ **教训：★ 凡是"读产物"的脚本，★ 路径必须【按时间取最新】，★ 不能写死** —— ★ 与"未标注口径的数字"、"转录里 grep 工具名"同族 ✓

---

## 6. ★★★ Round 33：真机证据、两个已修缺陷、裁定与下一步

### 6.1 ★★★ 座位修复的**铁证**（★ 代理要求我做的面名 diff，★ 已完成）
★ 真机转录 `…233053` 里：★ **`vibe_vmu_admission` 裸现 20 次／作为工具名 1 次**；★ **`vibe_vmu_recruit` 裸现 25 次／作为工具名 1 次** ✓
⇒ ★★ **两条名字都被用过** ⇒ ★ **与"同一个服务、两个名字"完全一致**，★ **也再次证明【不存在"只覆盖一半路径"】** ✓
★ 旁证（★ 代理所查）：★ `kernel/index.js:1635` **`get recruit() { return admission }`** —— ★★ **`kernel.recruit` 是返回同一个 `admission` 对象的 getter** ⇒ ★ **字面同一函数** ✓；
★ 且 ★ `host.js:218` **`{ face: "recruit", …, families: ["vmu.admission.", "vmu.recruit."] }`** ⇒ ★★ **一个面已经声明同时覆盖两族** ✓；★ `tests/vmu-admission.test.mjs` **不存在**（★ 同一服务，覆盖在 `vmu-recruit` 里 ✓）

### 6.2 ★★ 已修的两个缺陷（★ 都是真机发现的）
1. ★★★ **`capacity` 有一个【永远到不了的】动作**：★ `tools/capacity.js:8` 的 enum **缺 `retire`**，★ 而 `:24` 有 `if (action === "retire")` 分支 ⇒ ★ **该分支从面上永远不可达** ✓ ⇒ 已修（enum 补 `retire`；描述改为"10 个动作…登记（admit）／退场（retire）"）⇒ ★ **`vmu-capacity` 67/0** ✓
   ★ **这一类值得写下**：★ **当"面的枚举"与"处理器的分支"不一致时，★ 较窄的那一方会【静默藏起行为】，★ 而它看上去毫无异常** ✓
2. ★ **两个等价面已互相点名**：★ `tools/admission.js` 与 `tools/recruit.js` 的描述各自写明"与另一个动作集相同（同一内核服务）、两面等价、选一个即可" ⇒ ★ **使用者现在能有意选择** ✓ ⇒ **`vmu-recruit` 50/0** ✓

### 6.3 ★★★ 我的裁定：**正门取 `recruit`**
★ 理由：★ **(a)** 面注册的匹配执行体就是 `recruit`（★ `host.js:218` ✓）；★ **(b)** 内核模块名是 `recruit.js` ✓；★ **(c)** 两面描述**已互相点名** ⇒ ★ **没有任何东西被隐藏** ✓
★★ **而"下线 `admission`"【暂缓】**：★ 它是**对外可见的变化** ⇒ ★ **等收敛跑通之后再动**，★ 这样 `docs-landed` 描述的就是**真正被测过的那个状态** ✓

### 6.4 ★★★★ 下一步的**第一件**：D4（`status` 摘要视图）—— ★ 它现在直接挡收敛观测
★ **现状**：★ 真机里 `phase`／`quorum`／`formal`／`paper` **四段确实存在**（★ 代理读到 `quorum => 0`、`paper => 0`、`formal => 1` ✓），★ 但**只能靠解析 spill 文件**才读到 —— ★★ **因为 `status` 回执超出宿主上限且拒绝裁剪** ✓
★ **落点**：★ 状态面注册在 ★ `host.js:168` **`{ face: "status", name: TOOL_NAMES.status, always: true, … }`**，★ **其执行体内联在 `host.js`**（★ **没有 `tools/status.js`** ✓）
★ **要做的**：★ **(1)** 加参数 `detail: "summary" | "phase" | "quorum" | "formal" | "paper"`，★ **默认 `summary`**；★ **(2)** summary **恒定包含四段**且**尺寸远低于上限**；★ **(3)** 完整视图**仍可按段请求**（★ **不丢信息** ✓）；★ **(4)** **反例断言**：★ 把某段从 summary 去掉 ⇒ **必须红** ✓
★★ **为什么它排第一**：★ **在四段可读之前，★ "为什么没有收敛"这个问题【无法被回答**】** —— ★ 而现在阻塞点已经前移到"有成员但未达成共识"（★ 归零的 `quorum`／`paper` 就是证据 ✓）✓

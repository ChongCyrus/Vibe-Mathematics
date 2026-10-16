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

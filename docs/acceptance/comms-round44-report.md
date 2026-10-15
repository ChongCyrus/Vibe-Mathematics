# Round 44 · task-186 ② · `spawnSync` 不收集输出？—— ★ **读数先把"未定位"定位了：那 ≈1.75s 是【第二个子进程】，不是管道** ⇒ **不改代码（理由有读数支撑）**

> 本轮结论优先：**该改动【不做】**，因为 (i) 它不是时间所在（读数），(ii) 它**必须**保留那个捕获（否则毁掉 R6 的"误导消息"修复）。★ 并给出**实测**的替代杠杆：**7.40s → 5.64s**。
> 纪律：真树只读（hash 前后一致 ✓）；副本制；未跑全量；未 git；`D:\_tmp\v44`。**仓内改动：无；无半截状态。**

## 1. 先量（同机同会话；`process.hrtime.bigint()` 包住整条子命令；真树只读）

```
wiring-index --check  run1 = 7.84s
wiring-index --check  run2 = 7.40s
(a1) settings-table   --check = 4.97s
(a2) planned-settings --check = 1.67s   ← ★ checks[] 里的第二条（soft）
```

## 2. ★ 定位：≈1.75s ＝ **第二个子检查**（`planned-settings`），不是管道

- **代码事实**：`generate-wiring-index.mjs:123-128` 的 `checks[]` **有两条**：`hard` = settings-table、**`soft` = planned-settings**；`:130-131` 对**每一条**都 `spawnSync` ⇒ ★ **每次 `--check` 起两个子进程**（★ R41 我只盯了 `:124-125` 的 hard 那条，所以把它记成了"未定位 ≈1.75s"）。
- **副本实验（真树只读）**：拷 `scripts/`＋`vibe-math-vmu/` 到 `_tmp`，**只在副本里删掉 soft 那条** ⇒
```
MUTATION LANDED ✓ (soft sub-check removed in the copy)
copy WITHOUT the soft child = 5.64s      ← 7.40 − 5.64 = 1.76s ＝ 第二个子进程的份额
```
- **对账**：`(a1) 4.97 + (a2) 1.67 ＝ 6.64s`（两个子进程）＋ **父进程自身 0.71s**（R41 profile）＝ **7.35s ≈ 实测 7.40s** ✓ ⇒ ★ **不再有"管道"这笔未定位的账**；R41 的 ≈1.75s **就是被漏看的第二个子进程**。

## 3. 为什么**不做**"不收集输出"（两条理由，均有依据）

1. **它不是时间所在**：时间＝两个子进程各自的运行时（4.97 ＋ 1.67）＋ 父进程 0.71；**管道收集不是主要项** ⇒ 改成 `stdio:'ignore'` **拿不到 1.75s**（那 1.75s 是 second child 的**工作**，不是它的**输出**）。
2. ★ **它会毁掉一个已修复的缺陷**：`:133-136` 捕获子进程输出**只为取最后一行诊断**——注释逐字写着这是**第 6 轮评审的"误导消息"修复**（"without it the reader only saw *stale* even when the real cause was something else"）。⇒ `stdio:'ignore'`（或只取 `--json` 一行）**会丢掉 `detail`** ⇒ **语义会变**（本轮硬要求"语义不许变"）⇒ **不能这样做**。

## 4. ★ 实测的替代杠杆（**7.40s → 5.64s**），供你裁

- **把 `soft` 那条子检查改成【同进程】**（import `generate-planned-settings.mjs` 的导出、复刻它的 stale 比较与那条 `detail` 文案），或**仅在必要时才 spawn**。
- **实测依据**＝上面副本：**去掉该子进程后 5.64s**（−1.76s）⇒ ★ **这是把 `wiring-index` 拉回 ≈6.65s 以内的、可复现的路径**（5.64s 还留了余量）。
- **代价**：wiring-index 会依赖 `generate-planned-settings.mjs` 的内部 API，且**必须逐字复刻**它的失败文案（"等价性举证责任在我们"）。**硬路线就一条**：`hard` 那条仍可保留 spawn（它的 4.97s 就是 settings-table 自身的工作，已回到 R37 基线）。
- ★ **本轮不做**（预算＋该改动需要"先量后改＋当天副本制 target-addressed 反例"的完整配套）；**判据与实测数已备好**。

## 5. 没核 / 状态

- **没核**：`soft` 改同进程后的**真实**秒数（只测了"删掉该子进程"的副本＝**上界** 5.64s，未测"同进程复刻"的实现）；`--json` 单行方案**未试**（理由见 §3.2：丢 `detail`）。
- **跑了/核了**：wiring-index ×2、两个子生成器各 ×1、删 soft 的副本 ×1、真树 hash 前后一致 ✓、`checks[]` 两条的**代码指认**。
- **仓内改动：无**；`run-tests.mjs`／`GATE_SUITE_TIMEOUT_MS` 未动；**无半截状态**。
- ★ **R41 报告的更正**：其"仍 ≈1.75s 未定位"**本轮收窄为**"＝第二个（soft）子检查 `planned-settings`，1.67s＋启动开销"。

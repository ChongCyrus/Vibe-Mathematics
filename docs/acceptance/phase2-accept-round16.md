# Phase 2 · `vmu-accept` · Round 16：并入 R15/R16（★ 本阶段最严重回归 ＋ 口径更正 ＋ 纪律 41／42）

> **交付物**：① 总账 `docs/acceptance/17-objective-status.md`；② 本报告（未跟踪 ⇒ `git ls-files` 门禁此刻看不见它，§5.9-24 的自指现场）。
> **纪律**：**只读**（侦察＋一次单门实跑）＋ **只写**总账与本报告；未跑全量／`regen-all`／git。

## 0. 哪一次运行、哪一版文件

| 项 | 值 |
|---|---|
| HEAD | **`ca531db`**（*fix(vmu): break the cycle that pinned the reporting feedback switch shut, found by two independent instruments*） |
| 提交面（我实读） | **`570abe4..ca531db` ＝ 5 files, +220/−20**（`kernel/reportfeedbackdelivery.js` 58／`vibe-math-vmu.js` 13／`docs/02` 2／复核报告 84） |
| 工作树 | 只有我自己的两处写入（未提交）＋ ★ **`?? tests/b1prime-feedback-gate.test.mjs`**（**那条缺席的断言已在落地**） |
| 我的窗口 | 2026-10-16 **12:1x – 12:4x** |

## 1. ★ 我实跑的那一个门（派生面 ＋ 机制）

★ `node scripts/generate-vmu-settings-table.mjs --check` ⇒ **`up to date (1228 keys (1110 wired, 5 undetermined, 113 declared-but-not-wired))`，EXIT=0**。
★ **机制我核到了**：`vibe-math-vmu/docs/04-settings.md` **`:1006 vmu.report.feedback`** ／ **`:1007 vmu.report.audience`**，两行都 **`✅ 已接线`**、载体 **`kernel/report.js`** ⇒ ★ **1226+2 ＝ 1228、1108+2 ＝ 1110** ✓ ⇒ ★ **"变化先给机制再采纳"**（★ 这条与 Lead 的"表体 1108→1110"**逐字一致**，且我补齐了**是哪两行**）。

## 2. ★★★ 回归（§0.3g）：A1 第一步在实际装配里**完全不发生**

★ **机制＝闭环**：Part B 把**投递状态访问器**塞进 `createKernel` 的 **`reportFeedback` 形参**（＝**回执要问的 provider**）⇒ **回执 ≡ 投递状态**，而投递状态**又从回执算出** ⇒ **投递读到 `{}` ⇒ 判"关" ⇒ 把"关"写回 ⇒ 开关永远打不开、`context()` 0 次**。
★★ **为什么没被抓到**：**329 个套件全绿** —— ★ **没有任何断言把"配置开着"接到"投递发生了"** ⇒ ★★ **这是 §5.9-37（"套件全绿 ≠ 功能可用"）的【最强现场】**；★ 并注明：**该纪律正是 Lead 两轮前从自己的错里立出来的，而他又栽在它上面**。
★★ **两个【独立】仪器（分别署名）**：**`vmu-verify2`（进程内）**＝局部化到**一行**（副本删掉入口那行 ⇒ 开关恢复 `true`）＋最小复现＋两版对照（`7cbf4d9` `enabled:true`／有调用 vs `2b3fefe` `enabled:false`／**0 次**）；**`vmu-assistant2`（真机）**＝**同一回执自相矛盾**（HOST SPILL 逐字：`settings.resolved['vmu.report.feedback']={value:true, source:'config'}` ＋ `audience={value:'所办（office）', source:'config'}` **对上** `reportFeedback={enabled:false, source:'default', audience:null, delivered:false}`）。
★★ **最锋利的观测缺口（已成 §5.9-42）**：★ 那个组合**完全静默**（模块设计：**OFF ＝ 零机制、不发明失败**）⇒ ★★ **"配置开着而投递以为关着"与"真的关着"在读数上不可区分** ⇒ ★ **"零机制"必须只覆盖【真的关着】那一种情形**。
★ **修法两条**：**(1)** **开关不再从回执读**（调用方从**内核 resolved settings** 读、以**参数**传入 ＝ **打破闭环**）；**(2)** **读取抽进模块**（`deliverReportFeedbackFrom({kernel,ctx,effect})`）—— 因为**入口行数预算按 `split('\n')` 计**。

## 3. ★★ ④ 口径更正（★ 也更正了我 R15 的说法）

★ **门的行数口径就是 `readFileSync(...).split('\n').length`** ⇒ ★ **我 R15 报的 `1196／95` 是【门相关】的那一套**，Lead 报的 `1153／89` **不是**。
★ 我 R15 写成"**两套口径都真、结论一致**" —— ★ **只对了一半：结论一致，但只有一套是【被规则测量的那套】。**
⇒ ★ **新纪律 §5.9-41**：**当规则用某个口径测量时，只有【那个口径】的数能回答"过没过"**（★ 别的口径只能当背景，且必须标明）。

## 4. ★⑤ 真机行为结果＝**【未检验】，不是负结果**（照录）

★ A×3／B×3 的 `vibe_vmu_report` 调用**都是 0**，★ **但通道从未 arm**（投递落在 `!enabled`）⇒ **模型没机会看到快照** ⇒ ★ **那个 0 不能读作"模型不用通道"**；★★ **"仍未建立"这句现在也不成立**（★ 正确档位＝**【未检验】**）⇒ ★ **前置闸门**：**(1) 修投递 →(2) 一次仪器会话确认 `delivered:true` →(3) 再跑行为臂**（★ Lead 采纳为**硬性顺序**；★ 价值＝**避免再花 76 万 tokens 跑一次不合法的实验**）。

## 5. ⑥⑦⑧ 夹具价值、门禁、下一轮

★ **夹具的现场价值**：那次真机跑**拒绝开跑**，先打印 **`MISMATCH — the scratch payload is NOT HEAD`**（scratch `71E288B9…` ≠ HEAD `591766CAC82AE83`），**同步复核 ALL EQUAL 后**才跑；跑后仍 ALL EQUAL ⇒ ★ **读数绑字节，而不是绑希望**。
★ **门禁（归属分开）**：**Lead 实跑** T0 **25/25**／`regen-all --check` **15/15**／**T1 329/329**／★ **真入口探针**（**配置开 ⇒ `context()` 恰好 1 次**、`name='vmu:report-feedback'`、`order=5000`、回执 `enabled:true`／`delivered:true`）；★ **我实跑**：§1 的单门 ＋ `audit-table-integrity` **0**（★ **T0／T1／`regen-all`／真机我没跑**）。
★ **下一轮**：**`comms2` 补那条缺席的断言**（配置开 ⇒ `enabled:true` ⇒ `delivered:true` ＋ `context()` **恰好一次** ＋ **反向臂** ＋ ★ **当天副本反例：把入口改回"从回执读开关" ⇒ 必须红** —— ★ **若这条反例不能红，那条断言就挡不住这次回归**）；`verify2` 独立复核修复；`assistant2` 走闸门。

## 6. 诚实边界

1. ★ **未做 git 写**；★ **未跑 T0/T1/`regen-all`／未跑真机**（那些是 Lead／`verify2`／`assistant2` 的读数）。
2. ★ **我实跑的只有两处**：生成器 `--check`（＋机制定位到 `:1006/1007`）与 `audit-table-integrity`。
3. ★ **我 R15 的那句"两套口径都真、结论一致"已在总账里就地更正**（★ 保留旧文、加更正——按 §5.9-23 的原则，**不改历史**）。
4. ★ **本报告未跟踪** ⇒ 提交前请 **先 `git add`**；★ 并按 **§5.9-32**：**先收口提交、再派下一轮**。

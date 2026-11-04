# sim 审计｜架构风险与文件可编辑性

> 范围：`vibe-math-vmu/`（产品代码）+ 工作区产物；基线 HEAD `166d9ee2`。
> 方法：只读。因探测期间工作树里有并发未提交改动（`vibe-math-vmu/host-pack-tools.js` 当时处于语法错误的中途状态），所有"实测"均在 `git archive HEAD` 导出的干净副本 `D:/_tmp/g7a10/head` 上做（`scripts/sim/` 为未跟踪新文件，已复制进去）。
> 实测手段：`node scripts/sim/run.mjs --scenario mainline`（语料 `D:/_tmp/sim/corpus-head`，工作区 `D:/_tmp/sim/ws-head`）+ 自写探针 `D:/_tmp/g7a10/probe-md-edit.mjs`、`probe-single.mjs`、`probe-dump.mjs`、`scan-dead2.mjs`。
> 本文件只给"最小结构修法"（搬运/抽函数/加读者），不提议重写。

## 0. 先给结论

- **可编辑性只覆盖了 1/12 个 track**：`mdWrite` 全仓唯一调用方是 `packs/v5r/blueprint.js:384`，`mdReindex` 唯一调用方是 `host.js:1434`；`packs/v5r/settings/defaults.json:21` 声明了 12 个 track，其余 11 个没有任何 md 写入者。
- **手改 md 后不重启即生效，但重启后不生效**：必须显式 `vibe_vmu_records {action:"reindex"}`（启动路径不调 reindex）。实测：手改正文 → reindex → 行正文被替换成 md 快照（`changed:[{id:"rec-2", rowChoice:"status+revision", ...}]`），`read` 的 `text` 能看到手写行；不 reindex 时 `read` 只报 `mdChangedSinceIndex:true` 而不采纳。
- **论文不是文件**：paper 的 md/tex/meta/part/review 全是 `state.json` 里的记录行（`kit/paper.js:1746-1748`、`:846`、`:1058`），`kit/paper.js:6-10` 自述边界 "no filesystem"。
- **回执 ok 早于落盘**：同一进程里 `adopt` 返回 ok 之后立刻读 `vmu/state.json` 仍是 935B 种子（0 行），约 500ms 后才是 2 行；`scripts/sim/run.mjs:113` 用 `process.exit()` 收尾时留下 **0 字节孤儿 tmp** 文件，说明写入没有可等待的 flush 契约。

## 1. 屎山风险（按"最小改动能消掉多少风险"排序）

| # | 风险 | 证据（file:line） | 最小结构修法 |
| --- | --- | --- | --- |
| F1 | 截断逻辑 5 份、同名异约 | `kernel/library.js:188 truncate(text,cap,what)`、`kernel/report.js:327 truncate(text,cap)`、`kernel/mathadapters.js:393 truncateElements`、`packs/v3/middleware/dataplane.js:468 truncateToBytes`（返回 string）、`packs/v5r/verified.js:361 truncateToBytes`（返回 `{kept,dropped,truncated}`）；`packs/v5r/verified.js:355` 注释自认 "Semantics copied from v3's `promoteVerified`" | 新建 `kernel/text.js` 一个 `truncateBytes(text,{cap,mode:'head'|'head-tail'|'elements'})` 返回 `{text,truncated,kept,dropped}`；5 处改成薄适配（各自保留自己的返回形状）。不改语义、不改回执字段。 |
| F2 | 席位解析 5 份 + 无统一路径 helper | 席位：`packs/v5r/tools.js:1086 voterSeatsOf`、`:1092 seatOf`、`:3063 seatOfMemberId`；`kernel/meetings.js:1016` 闭包内 `seatOf` Map；`tools/human.js:96 seatOf`。路径：全仓 grep `function pathOf|resolvePath|withinRoot|relPath|toPosix|normalizePath` 零命中 | 抽 `kernel/seat.js seatOf(members,id)`、`kernel/paths.js{joinRel,within(root,rel),toPosix}`；5 处原地替换。meetings.js 的闭包 Map 改成 `seatOf(members.list(), id)` 缓存一次。 |
| F3 | 超大文件 + 单函数巨闭包 | `packs/v5r/tools.js` 6450 行 / 90 个顶层 function；`kit/paper.js` 1912 行但只有 2 个导出（`createPaperFlow` 一个 ~1900 行闭包）；`kernel/index.js` 5085 行 / 8 导出；`kernel/turn/index.js` 4582 行 | 只搬运不重写：`tools.js` 按工具家族拆 `tools/<family>.js`，`tools/index.js` 汇总后原样导出（对外 spec 名不变）；`paper.js` 拆 `flow/verify/render` 三个内部文件，`createPaperFlow` 保持同名同签名转调。 |
| F4 | 死导出 / 只写不读字段 | 全仓 1075 个 .js/.mjs 扫描：**157** 个产品导出的名字在任何其它文件里零引用、**451** 个只有测试引用（含 `WIRED_*`/`*_KEYS` 目录常量、`host-spawn.js:57-61` 默认值、`kernel/guard.js:180-199 read*`）；`kernel/meetings.js:1676` 写 `motion.quorumRequired`，全仓只有 `:1680/:1689` 两处回执读它、**没有任何判定读它**（同 G2 审计的 `floor.satisfiedBy`） | ①目录常量类改成"内部 const + 由审计脚本消费"或删；②`quorumRequired` 二选一：要么让 `vote()` 真读它，要么从回执删掉（保留就是自描述）。 |
| F5 | 层次越界（入口静态吃 pack 内部） | `vibe-math-vmu.js:20-22` 直接 `import { decideSections } from './packs/v5r/middleware/prompt-switches.js'`、`{ inboxBlock } from './packs/v5r/notices.js'`、`{ V5R_PHASES } from './packs/v5r/index.js'`，绕过 `PACK.bindings` | 三处改成从已装载 pack 的 `bindings` 取（或在 manifest 里加 hook 名，入口按名字查）。反向是干净的：`grep "from '../kernel/" packs/` 零命中。 |
| F6 | "为掩盖旧 bug 而存在的回执字段" | `kernel/idempotency.js:332` 回执逐字 `' - the verdict is not durable yet (await whenDurable() for the settled answer)'`；`kernel/index.js:4555` 注释 "THIS kernel's in-memory settings … nothing said the value is not durable"；`kernel/store.js` 把失败藏进 `stats.writeRetryGiveUps / writeRootGone / lockSkips`（不回执） | 让写路径返回可等待句柄（`store.patch` 已是 Promise，问题在调用方不 await），回执改成"已落盘"或"未落盘+可等待入口"二值，而不是散文。 |
| F7 | md 指纹存在文件里（文件即索引） | 蓝图 md 的头部自带 `- mdFingerprint：sha256:…`（`kernel/records.js` `MD_REBUILT_KEY`，实测文件里可见），人改正文后此值过期，reindex 靠它判 `changed` | 把指纹移出正文（放 `## 正文` 之后的注释段或行内 HTML 注释），或让 reindex 无条件重算并只把它当缓存。 |

## 2. 文件可编辑性（核心诉求）

判定口径：**手改后重启是否生效** = 改完文件、重启进程、不做别的工具调用，行为是否跟着变。

| truth | 在哪 | 有 md 文件吗 | 手改后重启是否生效 | 缺口 |
| --- | --- | --- | --- | --- |
| 蓝图（blueprint track） | `<root>/VibeMath/<path>.md`（`blueprint.js:384` → `records.mdWrite`），行是它的索引 | ✅ `- vmuMd：vmu-md/1` 标记 + `## 正文` | ❌ 重启不生效；必须调 `vibe_vmu_records {action:"reindex"}`（`host.js:1434` 唯一入口）。实测：reindex 后行正文换成 md 快照、`read.text` 含手写行、revision 不变、字段区改 `revision：7` 不生效（`rowChoice:"status+revision"` 只报告不采纳） | 启动不自动 reindex；`read` 的 `md` 字段在一次实测里未含手改行（时序待确认）；revision 由索引说话 |
| records 其余 11 个 track（progress/routes/obstacles/rejected/state/propositions/methods/problems/feedback/paper/verified/scripts） | 只在 `vmu/state.json` 的 `keys.records[]` 行里（`defaults.json:21` 声明，无 md writer） | ❌ | ❌（没有文件可改；reindex 对 track 未声明的行只能 `skipped`） | 声明了 track 却没有 md 生产/消费闭环 |
| 论文（paper-md/tex/meta/part/review） | `state.json` 记录行（`kit/paper.js:1746 'paper-md'`、`:1747 'paper-tex'`、`:1748 'paper-meta'`、`:846 'paper-part'`、`:1058 'paper-review'`） | ❌（`kit/paper.js:6-10` 自述 no filesystem） | ❌ | 成品不是文件：人无法直接改论文正文；本次 sim 的 compile 还因缺执行器被拒（`VMU_PACK_V5R_CORE_PAPER_EXECUTOR_MISSING`，环境性） |
| 成员库卡（命题/引理等） | `<root>/Members/<member>/<Kind>/<id>.md` + 同目录 highwater 版本文件（`kernel/library.js:757 KINDS`、`:795 highWaterPath`、`:703 trashDir`） | ✅ | 未实测（结构上是 md 主真相 + 版本高水位第二真相） | 一个文件 + 一个 highwater 文件双真相；手改卡的 revision 与 highwater 不一致时的语义未在本次验证 |
| 会议 / 投票 / 裁决 / 结题一致票 / 票箱 / 任务 / 成员 / 预算 / 邮件 / 回合 | 全部只在 `vmu/state.json`（键：`meetings,closure_votes,ballotbox,minutes,tasks,members,budget,mailbox,turns,…`） | ❌ | 只能手改整个 JSON；无 schema 校验、无 per-object diff，重启是否生效取决于 store 加载时的迁移/校验（本次未做手改 state.json 的写入测试） | 这是"机构运行史"的主体，却是单文件 JSON |
| 设置（v5r 行为参数） | 来源是 `apply(ctx, config)` 的部署配置 + `packs/v5r/settings/defaults.json`（`vibe-math-vmu.js:160`、`:322-330`）；`state.json` 的 `settings.resolved` 只是快照 | ❌ 工作区内无 settings 文件 | ❌ 改 `state.json` 的 `settings.resolved` 不改变行为 | 学院级参数必须在部署 profile 里改，不能由研究所在自己的工作区改 |
| 审计日志 | `<root>/vmu/audit/<date>.jsonl`（`kernel/index.js:988` 写锚点） | 文件（追加） | 不适用（append-only 证据，不是真相源） | 无 read-back 校验文档；human 改它等于伪造证据，但代码不校验 |
| Lean 作业 / LaTeX 编译 / spawn 子进程 | `Formal/Jobs`（`kernel/lean.js:91 LEAN_JOBS_DIR_DEFAULT`）、latex 临时目录、子进程 stdout | 文件/临时 | 临时产物，重启即失 | 产物与真相的边界没写在文档里 |

## 3. 建议的最小修复顺序

1. **P0｜可编辑性闭环**：`host.js` 启动时（boot 之后、首个 turn 之前）自动跑一次 `mdReindex({dryRun:false})`，并把结果放进启动回执；同时 `mdWrite` 的调用方从 blueprint 抽成 `records.mdPublish({track,path,text})`，让其余 11 个 track 至少能"发布一次"。→ 让"改文件 + 重启"真的生效。
2. **P1｜论文落文件**：`kit/paper.js` 的 `paper-md` 行改为"行 + `<root>/VibeMath/Paper/<target>.md` 双写"（kit 仍不碰 fs，由 pack 侧调用 `records.mdPublish`），使论文正文可被人类编辑。
3. **P2｜去重**：F1/F2 两个抽函数（`kernel/text.js`、`kernel/seat.js`+`kernel/paths.js`），一次机械替换 10 处调用点。
4. **P3｜拆大文件**：F3 先拆 `kit/paper.js`（收益/风险比最高：2 个导出、行为边界清晰），再拆 `packs/v5r/tools.js`。
5. **P4｜回执诚实**：F4/F6 —— 删或给 `quorumRequired` 加读者；`idempotency.js:332` 的"not durable yet"改成可等待契约；`store` 的统计错误提升到回执字段。

## 4. 未证实 / 边界

- "157 个零引用导出"是**文本近似**（不认动态 `import()`、不认命名空间解构后 `.X` 的间接用法），用于排序，不作为删除依据。
- `read.md` 与磁盘 md 的一次不一致未复现干净（两个 kernel 实例共用同一 root 的探针里出现过），标为待确认。
- 未测试：手改 `state.json` 后重启的加载行为；成员库卡 md 手改 + highwater 的交互；`vibe_vmu_records {action:"reindex", track:"…"}` 对未声明 track 的完整语义。
- 本审计未运行全量 T1 测试；未改动任何产品代码/测试。

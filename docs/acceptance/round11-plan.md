# Round 11 组织草案（Lead · Round 10 收尾后）

> **Round 10 结果（已 commit `8e770d4` 并 push）**：T0 **25/25**、T1 `GATE_SCOPE=vmu` **305/305**；43 文件、+1395/−89。
> **★ 本轮闭合的框架缺口＝整个项目的主题**：**pack 能声明中间件，但中间件无法行动**（M2 只够得到 `api:[dryRun,hook,kernel,log,setting,traceId]`／`kernel:[read]`，**够不到任何服务**）⇒ 裁 **(a) 能力门控服务访问缝 `api.services.get(name)`**（`trigger-workflow` 解锁；未解锁⇒`VMU_NOT_PERMITTED`；未发布⇒`VMU_NO_SUCH_OBJECT` 含已发布清单；空名⇒`VMU_INVALID_ARGUMENT`）＋发布半（**惰性目录**，因面 const 跨该点会踩 TDZ）。**(b)/(c) 被否**（会把机构策略塞进控制面/内核，与 R1 相冲）。
> **★ "静止⇒开会"在 pack 里复现了 v5r**：`stall-meeting.js`（阈值 `3 × idleAfterMs`＝360000，**不硬编码**）＋**三步探针 11/0**（真边沿 → `control/idle` 上**恰一条**带 `trigger-workflow` 的条目 → **`vmu.meetings.open()` 真被调用**）⇒ **内核从不决定开会**。
> **★ 首个真实数学研究剧本**（18/18 步）：任务链→四库作业→Lean→形式化**具名拒**→记录→论文→**SIGKILL 中途重启续算**。**最大空缺具名：多智能体协作未走**。
> **★ `docs/29` 的"未实测"还清（零模型会话）**：M4 外部插件**已实测**（3 文件配方＋两次 boot 时间戳＋`inject` 是硬要求）。
> 8 名队友全部空闲。

## ★ Round 11 首项：**多智能体协作的端到端剧本**（用户用途的正中靶心）

| # | 项 | 归谁 | 说明 |
|---|---|---|---|
| 1 | **两成员协作做同一道题**：**反例者 vs 证明者**，用 `ballotbox`＋`meetings`＋`delegation`＋**并发写者**走完；含"异议/否决/复议"至少一次、**会期板与议程**、**任务依赖与重派**、**中途杀一个成员的内核进程** | reader-b | 复用 R10 已证的 `tasks` 依赖链＋`mathjobs` 租约；**产出 `15-multiagent-e2e.md`**；verify 已备好"观测/支持/不支持/非结果"四段判据 |
| 2 | **F51 `meetingOpen` 耐久域标记**（`open\|lapsed\|closed`，**会议域、不新增键**） | reader-c | **裁决已下**；reader-a 的 `task-78 A` 正等它（落地后补"重启后哪个会还开着"断言） |
| 3 | **B③ 发言序覆盖留痕**（`random`＋`overrideOrder`：仅 chair／必须 why／审计行／`enforced[]`／未声明即拒） | reader-c | 形状 `docs/08 §25.14 B-3` |
| 4 | **B④ flow mode**（合并后 4 种，`flow({mode})`） | reader-c | 形状 `§25.14 B-4`；**说不出可观察差异就不是模式** |

## 其余待办

| # | 项 | 归谁 | 说明 |
|---|---|---|---|
| 5 | **`docs/29 §1/§2` 的 M2 措辞更新**（现在**两种形状**：inline handler 直上总线**够不到 `api`**；`module:`/`file:` 经 loader **才拿得到能力门控的 `api.services.get`**） | assistant | 你已确认与实现一致，只是**措辞待改** |
| 6 | **module hook 的 `api` 传参位置未钉准**（你实测 `(payload, api)` 第二参是 `undefined`）⇒ 用**正确签名**再证 `api.services.get` 的两条具名拒 | assistant | `makeApi` 的 facade 构造在 `kernel/loader.js:120` |
| 7 | **`docs/03:1412` 后半句可达性**（"`activityTool` 为真" ↔ `host.js` 的 `TOOL_FACES` 出现条件） | activity | R10 具名未做（需装配级探针＋重写 `host.js` 大量相对 import，成本高）；**先与 verify 对齐口径** |
| 8 | **`records`/`store` 的真 `finally` 解锁** | activity | R10 已查明"本面不存在该构造"；**真 `finally` 用户**＝`index.js:894`、`mathjobs.js:587`（`resume` 已做） |
| 9 | **`docs/03 §6` 公开键散文清单** | core | R10 具名未做（**门禁不管**，属文档完整性） |
| 10 | **矩阵 v10**＋证据；★ **`loader.js` 的块有保质期**（该文件再动就重跑 `audit-enforced-consistency`） | verify | R10 已把"保质期"消费一次（重跑三门全绿） |
| 11 | **v5r 剩余的具名项**：`ballots` 之外是否还有"声明了没生效"（**建议做一次全 pack 声明的 `notAttached` 普查**） | pack | R10 发现 `ballots`（静默）与 `members`（具名）⇒ **普查一遍更彻底** |
| 12 | **目标 3 的 5 处具名残余**：F15 无句柄 sleep（具名豁免）／F51（本表 #2）／F44（**已闭合 6/6**）／F31 跨进程（**G6 已落**）／F53（门禁已落） | 按面 | 逐条收口 |

## 纪律（沿用，本轮新增两条）

- 轮末由 Lead 统一 `update-doc-counts → regen-all → T0 → T1 → commit → push`；**不发布**。
- **★ 新增：`regen-all` 之后要复跑 `generate-wiring-index`**（本轮它依赖 surface index，**顺序**导致 stale；轮末我手动补跑才过）。
- **★ 新增：新文件要"双登记"＋矩阵裁定行**（本轮又漏了 `meetingleave.js`／`stall-meeting.js` 的 installer 管理清单，且成熟度表 `vmu.tasks 3/3→4/4` 漂移）。
- **★ 新增：`搜不到` 必须与 `不存在` 分开说**（verify 自陈：用文件名前缀搜 `resume*` ⇒ 漏看 `contentvalue.js`，与 R7 的 F52 教训同族）。
- **★ 新增：清理临时区只删"本次显式创建过的精确路径"**（reader-a 用 `r10-*` 通配误删 3 个他人探针；**前缀不是归属证明**）。
- **门禁必须证明有牙**（`docs/11 §4.2` **七条**）；**判据必须与环境一致**；**观测量必须在两档间真的不同**；**门禁必须读事实所在的那种文本**；**计数断言写成集合/性质**；**生成物不许手改**；**重构必须原子＋每步跑加载内核的套件**。
- 临时文件 `D:\_tmp`；内容型批量改写**只用 Node**；凭据副本用完即删。

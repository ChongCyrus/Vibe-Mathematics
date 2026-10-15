# Round 2 组织草案（Lead · Round 1 收尾后定稿）

> **Round 1 结果（已 commit `f86d578` 并 push）**：T1 `GATE_SCOPE=vmu` = **259/259 绿**；49 文件、+2397/−312；目标 0 的 6 条断线全部修掉并留证；目标 3 的第一阶段（v5r 全量盘点合并本）已完成。
> **Round 1 遗留 → Round 2 必办**（都已裁决、有编号，直接进任务）：
> 1. **D-12** 钩子单一真源收口：`bus.js` 的 `VU_HOOKS`/`DEFAULT_FAILURE` 改为从 `HOOK_REGISTRY` 派生，**同轮**改 4 处按文本解析的门禁（`audit-hook-coverage.mjs:31`、`audit-doc-vs-code-tables.mjs:59`、`audit-vmu-docs.test.mjs:416`、`generate-surface-index.mjs:39-41`）。→ pack + verify
> 2. **D-13** 提示词管线活读：`kernel/prompt/index.js` 六项构造期值快照改为 `settings.get()` 活读。→ pack
> 3. **D-10(1)** canonical 快照 vendored 进仓 + parity 重定义为语义级对照（目标 5 会重构 `math-computation.js`）。→ verify（与 math 面同轮协调）
> 4. **T0 唯一红**：`scripts/check-docs.mjs` 23 issues 全在附录/登记卷 23–28（已在 docs/14 登记为**不绿**）⇒ 显式声明"设计卷 / 附录·登记卷"两类 + 断言集合，修真悬空引用。→ verify
> 5. **D-05 驱动**：`_oneoff/vm-drive/dsh-drive.mjs`（真机驱动）入库。→ verify
> 6. **D-08/D-09** 目标 2/6 的验收口径已定（三层基线；主代理两层 + 框架原语）⇒ 直接作为 task 的验收判据。

> 原则：**复用已读完 v5r 原文的队友**（他们脑内已有 11.6k 行上下文），不重新雇人；写范围按**新模块 + 文件级**切分，保证互不重叠。
> 上限 8 名队友；当前 6 名（vmu-core / vmu-pack / vmu-verify / v5r-reader-a / -b / -c）。

## 角色映射（Round 2）

| 队友 | Round 2 角色 | 主要写范围（互不重叠） |
|---|---|---|
| `v5r-reader-a` | **目标 1 负责人**：断点续跑 + 人工干预 | `kernel/human.js`、`kernel/control.js`、`kernel/lifecycle.js`、`kernel/turn/**`、新 `kernel/resume.js`；`docs/07`、`docs/26` |
| `v5r-reader-c` | **目标 2 负责人**：通信/协作/会议 | 新 `kernel/chat.js`、`kernel/mailbox.js`、`kernel/panel.js`；`kernel/meeting*.js`、`kernel/ballot*.js`、`kernel/minutes.js`；`docs/17`、`docs/08` |
| `v5r-reader-b` | **目标 5 负责人**：数学引擎深度 | `kernel/math*.js`、`kernel/lean.js`、`kernel/formal.js`、`math-computation.js`、`math-engines.js`；`docs/15`、`docs/09` |
| `vmu-assistant`（**新雇，第 7 人**） | **目标 6 负责人**：主代理＝助手（自动汇报 + 参数配置 + 人设装配） | `packs/v5r/prompts/**`、新 `kernel/report.js`；`docs/16`、`docs/22` |
| `vmu-core` | 内核管线：把新原语接进真实装配（工具面/宿主/入口/设置） | `kernel/index.js`、`store.js`、`idempotency.js`、`host*.js`、`vibe-math-vmu.js`、`settings/**`、`tools/**`；`docs/02/03/04/18` |
| `vmu-pack` | v5r pack 声明（策略层）：把新原语用 settings/中间件/提示词包声明出来 | `packs/**`（除 `packs/v5r/prompts/**`）、`extensions/**`、`kernel/pack.js`、`loader.js`、`bus.js`、`prompt/**`；`docs/05/06/10/27` |
| `vmu-verify` | **目标 4 负责人**（pack 一致性核对）+ 门禁与验收 | `tests/**`、`scripts/**`、`package.json`、`installer.js`、`docs/11`、`docs/audit/**` |
| **Lead** | **目标 3 负责人**（框架强度判定）+ 仲裁 + 收尾门禁 | `_handoff/**`、`docs/00/01/12/13/14/20/21/23/24/25/28`、`glossary.json` |

## 依赖顺序

```
Round1 收尾(T1+commit)
   └─ task-10..13（四个实现面，可并行）
        ├─ 依赖 task-14（内核管线：工具面可达性 K1 是所有新工具的前置）
        └─ 依赖 task-15（pack 声明：策略层）
   └─ task-16（目标4 一致性核对）—— 输入＝03-v5r-full-inventory.md；不依赖实现完成即可先出"覆盖矩阵 v1"
   └─ Lead 目标3 判定 —— 输入＝分片 §六「框架能力需求」（A31 + B53 + C 专章）对照 vmu 现有服务/钩子/耐久键
```

## Round 2 每面的验收判据（摘要）

| 目标 | 判据 |
|---|---|
| 1 断点续跑 | 真机：杀掉会话后重建 → 名册/在途工作/耐久台账/未 ack 消息全部正确恢复；**写前必读**闸有具名拒；`resume` 相位语义可测 |
| 1 人工干预 | `vibe_vmu_human` 工具可达；审批未批 ⇒ 动作**只能排队**（真门禁，非标签）；否决立即生效并广播；超时默认 `hold` |
| 2 通信 | 群聊消息含 id/发言人/时间/回复目标；管理员/发言次数(有限|不限)/禁言可声明且真生效；私信耐久 + ack 语义；状态面板含总目标/计划/正在执行的子任务 |
| 2 会议 | 覆盖 `v5r-inventory-c.md §⑦-A` 基线 A 全部（≈14 命令 + 7 变形 + 全部参数），基线 B/C 具名落地或具名登记 |
| 4 一致性 | 逐条给出"v5r 机制 → vmu 内核原语 → v5r pack 声明"三列覆盖矩阵，空缺项具名 |
| 5 数学 | numpy/scipy/pandas/sympy 专用适配（结果形状契约 + 会话级环境绑定）+ 作业持久化/断点续算（对照 Lean 的 `Formal/Jobs/*.json` 四态 + `recoverLeanJobs` 四分支） |
| 6 助手 | 真机证据：提示词段确实装配 + 自动汇报可声明可关 + 参数入口可改并留痕 |

## 纪律（沿用 D-07）

- 每个实现面**自带测试**（新文件，名字带面前缀），由 vmu-verify 复核；
- 轮末由 Lead 统一跑 T1 + commit + push；**不发布**；
- 生成器/计数/`regen-all` 只在全员停写后由 Lead 跑；
- 临时文件 `D:\_tmp`，不复用即删（>6h 清理）。

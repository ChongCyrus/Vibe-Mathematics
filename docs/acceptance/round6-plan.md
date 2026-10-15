# Round 6 组织草案（Lead · Round 5 收尾后）

> **Round 5 结果（已 commit `f77f331` 并 push）**：T0 **25/25**、T1 `GATE_SCOPE=vmu` **291/291**；38 文件、+1713/−140。
> **U14 落地**（可声明 overlay 打到 preset 内层行，注册期惰性合并、与行序无关、未匹配具名告警、被覆盖行不注册）；**真机 3 次会话 ≈71.8k tokens**（框架面 `vibe_vmu_status` 实测具备；第一设计的 `agent-preset/not-found` 留作实证；第三次带 provider 补丁）。
> 目标 3 又闭合 6 条"部分"（F26/F31/F32/F34/F35/F39）＋ F43–F47 复核 ＋ F15 具名豁免。
> 8 名队友全部空闲。

## ★ Round 6 首项（Round 5 唯一未建立的东西，根因已具名）

**入口侧设置形态**：注册期合并**已证**（`tests/audit-preset-overlay-merge.test.mjs` 21/0），但**入口 `readSettings()`（`vibe-math-vmu.js:54-59`）只保留 `vmu.` 前缀的点号键** ⇒ overlay 的**嵌套**形态（`vmu:{tools:{faces:[…]}}`）到了内层行却被**静默丢弃** ⇒ `chat`/`panel`/`report` **未发布**（模型原话："I only have vibe_vmu_status … The others don't exist. I should not fabricate."）。

| # | 项 | 归谁 | 说明 |
|---|---|---|---|
| 1 | **入口兼容"嵌套/点号"两形态**；**无法解析的设置键必须具名告警**（不许静默丢） | core | 这是"声明了没生效"的又一例；按哲学"声明必须真生效" |
| 2 | **补运行时断言："注册后入口真的发布该面"** | verify | 本轮两次误判（假阳性/假阴性）都因为**判据不在运行时**；这条断言才是能拦住"合并成功但没点亮"的判据 |
| 3 | **多面真机会话（1 次）**：修好后由 assistant 跑（overlay ＋ provider 两补丁、提示词显式点名、SLV §2/§4） | assistant | 目标 2/6 的决定性证据；总记账 3→4 次，仍远低于手册上限 |
| 4 | **矩阵 v5／证据回填**：多面点亮改"实测具备（附 seq/行号）"或维持"未建立（新根因）" | verify | 只看真的 |

## 其余待办

| # | 项 | 归谁 | 说明 |
|---|---|---|---|
| 5 | **F13／F53 的具名差异与边界**写进 `docs/03`（fail-closed vs v5r 容错；直接 fs 与策略 fs 的边界） | core | 本轮已写 F13；F53 仍"事实上存在、缺显式声明" |
| 6 | **falsify 第 4 族**：`resume` 的"写前必读"闸（配方 ~30 行） | activity | 第 3 族已满上限；每族目前只证**一条**不变式，其余未证伪项已登记 |
| 7 | **GAP-MTG 余项**（需新原语/子对象的那几条） | reader-c | 按 `docs/08 §25.4` 的 closed-by |
| 8 | **跨进程耐久原子**（投票/队列） | reader-c | Round 5 具名残余：需 queue 型接缝 |
| 9 | **`packs/v5r` 心跳**：若真要周期推进，按 `docs/10 §4.3` 声明 `vmu.schedule.*` 并自行 arm/tick | pack | 现在**不声明**（无可核出厂值）——若用户要，再落 |

## 纪律（沿用，本轮新增两条）

- 轮末由 Lead 统一 `update-doc-counts → regen-all → T0 → T1 → commit → push`；**不发布**。
- **★ `--dump-config` 是 loader 树，不是运行时定义**（`docs/11 §4.2`）：禁止用"dump 里出现/没出现某字符串"判定声明是否生效；**合并/覆盖类语义必须在运行时断言**。本轮**两个方向都误判过**。
- **★ 生成物不许手改**：`cordis.patch.yml` 由 `scripts/build-preset-rows.mjs` 生成（本轮 core 手改后被 drift 门禁抓住，已改回生成器）。
- **★ 改动跨出写范围时要具名**（本轮 `preset-declaration.js`／`tools/task.js`／`build-preset-rows.mjs` 均由 Lead 指派，已在提交信息注明）。
- **★ 计数型断言要写成集合相等**，不是 `=== N`（本轮 preset-rows 的"恰好 6"被 overlay 行打红；改成**期望集合相等**后"多一条来路不明的行照样红"）。

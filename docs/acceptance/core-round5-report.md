# Round 5 · task-33 · U14（可声明的 overlay）+ F16/F13 收口

- 状态：**U14 落地（宿主寻址实测 + **第二版** overlay 实现 + 可复制配方 + 运行时探针 16/0）；F16／F13 已具名登记；task-35 四条已落。**
- ★ **重要**：本报告前面的"第一版设计"（把 `overlay` 放进 preset 行 config）**已被实测推翻并由 vmu-verify 抓到**，最终落地的是**第二版（独立 overlay 行 + 注册时惰性求值）**，见文末"第二版（最终）"。第一版内容保留作为**判据教训**（dump 假阳性）。
- 纪律：未跑全量 sweep、未 `regen-all`、未 git（**仅用只读 `git show HEAD:` 做了一次文件恢复**，见"事故与恢复"）；临时文件 `D:\_tmp\vmu-r5`；内容型改写只用 Node／edit 工具。


## U14-A · 宿主**行寻址能力**（实测，不是推断）
工具：`dsh --profile <p> --dump-config --patch <file>`（只 dump，不挂载），profile `hubtest-dshvibemathlatest`（真装了 `dsh-vibe-math` bundle）。
| 实验 | patch 目标 | 结果 |
|---|---|---|
| **A** | **内层行** `- id: vibe-math-v5`（在 `preset-vibe-math-v5.config.plugins` 里） | `probeMarker` 出现 **0 次** ⇒ **静默无效**（连报错都没有） |
| **B** | **声明行** `- id: preset-vibe-math-v5`（真的 loader 条目） | `probeMarker` 出现 **1 次**，落在该行 `config:` 里 ⇒ **打得到** |

⇒ ★ **寻址语义（实证）**：`--patch` 的目标是 **loader 条目**，键＝该条目的**本地 `id`**；活体目录里条目 `id` 形如 `<父>:<本地>` 而 `patchId` 是**本地 id**（`Config.listConfigs` 实测片段：`{"id":"include:tool-plugin-manager","patchId":"tool-plugin-manager"}`）⇒ ★ **嵌套 config 数组里的行不可寻址**（Lead 的推断**被证实**，非推翻）。

## U14-B · 实现：**`overlay`（声明面）** —— 不写死任何测试值
`preset-declaration.js`（**该文件不在 task-33 的写范围清单里，但 Lead 明确指派**，见"越界说明"）：
- 新增导出 **`applyOverlay(plugins, overlay, warn?)`**：`overlay` 是 **id 键控**的局部 config 映射，**深合并**进 `config.plugins` 里 `id` 匹配的行；**不原地修改** `plugins` ✓。
- `registerDeclaration` 用 `applyOverlay(config.plugins, config.overlay, warn)` 组 `definition.plugins`；**匹配不到任何行**的键 ⇒ `ctx.logger.warn('[dsh-vibe-math] preset "<id>" overlay names a row that does not exist: <key>')`（**打字错误不许静默**）。
- **默认缺省 ⇒ 返回原数组 ⇒ 零机制**（实测 `applyOverlay(plugins, undefined) === plugins` ✓）；随包默认里**没有任何测试值** ✓。

实测（unit probe，`node -e` 直接 import 该模块）：
```
inner config={"vmu":{"tools":{"enabled":true,"faces":["*"]},"packs":{"active":["v5r"]}}}   ← 深合并，原有 enabled 保留
persona untouched={"prefix":"x"}          ← 其它行不动
original array untouched={"vmu":{"tools":{"enabled":true}}}   ← 不原地改
typo warned=["no-such-row"]               ← 具名告警
no overlay => same array=true             ← 零机制
```

## U14-C · 可复制配方（已写进 `docs/02` 卷末"部署 / 测试"节）
```yaml
# <你的临时目录>/vmu-overlay.yml   —— 普通 --patch 文件（仓库外，实测用）
- id: preset-vibe-math-vmu        # ★ 打声明行（真 loader 条目），不是内层框架行
  config:
    overlay:
      vibe-math-vmu:              # ★ 键＝config.plugins 里那一行的本地 id
        vmu:
          tools: { faces: ['*'] }
          packs: { active: ['v5r'] }
          report: { enabled: true, minIntervalMs: 0 }
```
```bash
dsh --profile <你的 profile> --dump-config --patch <你的临时目录>/vmu-overlay.yml   # ① 先复核（不挂载）
dsh --profile <你的 profile> --patch <你的临时目录>/vmu-overlay.yml web              # ② 再起真机
# ③ 断言：vibe_vmu_status 的 faces／settingsMerge 显示点亮面与装载 pack；不给 overlay ⇒ 恰 1 个工具
```
★ **真机双向复核**：vmu-assistant 已用 `--dump-config` 验证（带 patch ⇒ 内层行出现 `tools.faces:['*']`；不带 ⇒ 零机制保持）✓✓。

## U14-D · `applyOverlay` 的具名告警语义（已登记 `docs/03 §2` 的部署入口注）
匹配不到的 overlay 键 ⇒ `ctx.logger.warn`，**返回值仍是原数组**（一个错键不会让整条声明失败）；导出 `applyOverlay` 供测试断言。

## F16 · 调度器（补 pack 侧声明点）
`docs/03` 的"调度的边界"注补一行：**pack 不需要为心跳声明任何新键** —— 要定时推进就**声明自己的 `vmu.schedule.*` 触发器**（`triggerVia` 定触发线）并由 pack／中间件**自己 `arm()` ＋ 按自己的时钟 `tick()`**；内核只提供原语与 `status()` 自曝；**改判条件**（若真机要求"声明即心跳"⇒ 入口一行 `arm()` 且自曝 `status().scheduler.armed`）保持。

## F13 · fail-closed vs v5r 容错跳过（**具名差异，不是缺陷**）
`docs/03` 新增差异条：本框架在"声明缺失／接缝缺失／校验失败"处**一律 fail-closed（具名拒）**，v5r 多处是**容错跳过 + 继续**。**为什么**：R1／零机制要求"没被声明的东西不许悄悄生效"，而"跳过"会让未声明的策略**看起来生效了**（D-01 那类静默不可达的镜像）。**可观察差异**：同一条提示词在 v5r 下"跳过"的地方，本框架给出**带 code 的拒绝**（回执带 `enforced[]`／`enforcedScope`，拒因回到制造它的人下一轮提示）。**改判条件**：若某条跳过被证明是正确语义，就把它**显式声明成一个键**（如 `vmu.<face>.onMissing ∈ {refuse,skip}`，默认仍 `refuse`），**不许隐式默认跳过**。

## task-35 四条（reader-a 的 F35/F39）
1. **`docs/03 §8` 登记 `VMU_TASK_DEPENDENCY_CYCLE`**（含义：依赖边成环；`detail.cycle` 给环路径；出处 `kernel/tasks.js:59-63` 的 `cycleRefusal`，抛出点 `:214` create／`:240` setDependencies）✓
2. **`docs/03 §2.1` 补 `vmu.tasks` 契约**：`create({…,writeScopes?})→{…,deps,writeScopes,skippedScopes}`／**`setDependencies(id, deps, {expectedRevision?})`**／**`writeScopeConflicts()`**（只读）✓
3. **`setDependencies` 的读者**：`tools/task.js` 新增 **`action:'set_dependencies'`**（enum ＋ 参数 `blocked_by`／`expected_revision`）—— ★ 注意：本框架**没有** `vibe_vmu_task_update` 这个工具，任务动词都在 **`vibe_vmu_task`** 上，所以我把它做成该工具的 action，**动词名与 v5r 提示词一致**（`set_dependencies`）✓
4. **`write_scopes` 透传**：`tools/task.js` 的 `create` 现在把 `write_scopes` 传给 `tasks.create({…,writeScopes})`（advisory，非法范围由内核具名进 `skippedScopes`）✓

## 事故与恢复（如实记录）
写 `docs/02` 时我用了 **PowerShell 文本管道**（`Get-Content -Raw` → `-replace` → `Set-Content`），**把中文写成了乱码**，导致 `check-docs` 报 D2/D3/D8（`> 上位`／`> 状态`／验收／未核项"消失"——其实是文本被破坏）。**恢复**：只读 `cmd /c "git show HEAD:vibe-math-vmu/docs/02-architecture.md > D:\_tmp\...\docs02-head.md"` ＋ `copy /y` 回位（**未做任何 git 写操作**），再用 **`edit` 工具**重新追加 U14 小节（并把示例路径改成 `<你的临时目录>/…`＋"仓库外，实测用"，同时**保留可复制示例**）。**教训**：中文文档的批量改写只用 Node／`edit`，**不再用 PowerShell 文本管道**（本仓已记录过同类事故两次）。

## 验证（原样命令 + 退出码）
```
node scripts/check-docs.mjs              → DOC LINT: PASS        exit=0   （D2/D3/D8/D9/D14 全清）
node tests/audit-vmu-docs.test.mjs       → 83 passed, 0 failed   exit=0
node tests/vmu-planned-settings.test.mjs → ALL GREEN (planned=113, docs=27, passed=39, failed=0)  exit=0
node tests/vmu-tasks-dag-and-scopes.test.mjs → 41 passed, 0 failed  exit=0
node tests/vmu-tasks.test.mjs            → 42 passed, 0 failed   exit=0
node --check preset-declaration.js / tools/task.js / settings/schema.js → 全 0
node -e "<applyOverlay unit probe>"      → 深合并 ✓／其它行不动 ✓／不原地改 ✓／错键告警 ✓／缺省零机制 ✓
node scripts/generate-vmu-settings-table.mjs --write → 1219 keys（v3 两键已登记后单文件重生成）  exit=0
SETTING_DEFS 自检：defs=1219 dup=[]（vmu.v3.verifierCount／vmu.v3.mode 已加）
```

## 第二版（最终，已落地并验证）

★★★ **第一版为什么错（两条实测）**：
1. **loader 的 patch 是【替换】config，不是【合并】**：打 preset 行 ⇒ 该行 `config` 被 payload 整个覆盖（实测 dump 1932 → 1562 行、`plugins:` 消失、内层 `id: vibe-math-v5` 归零）⇒ preset 失去身份 ⇒ `agent-preset/not-found`（vmu-verify 用 A/B dump 抓到，vmu-assistant 的转录逐字如此）。
2. **求值时机**（Lead 定位）：第一版在**声明时**算 `plugins`，而 overlay 行可能**尚未 apply** ⇒ `OVERLAYS` 为空 ⇒ 合并什么都没做（也解释了"未匹配 key 无告警"——空 overlay 没有 key 可测）。★ 教训：**`--dump-config` 是 loader 树，不是运行时定义** ⇒ "dump 里出现 `faces:`"是**假阳性**（那只是 patch 原文）。

★★★ **第二版实现（`preset-declaration.js` ＋ `cordis.patch.yml`）**：
- **独立 overlay 行**（随包，`config: {}` ⇒ 零机制）：`- id: vibe-math-vmu-overlay` / `name: dsh-vibe-math/preset-declaration`，排在 preset 行**之前**（`cordis.patch.yml:1666` vs `:1669`）。部署**只打这一行**（payload 就是整个 config ⇒ 替换即正确）。
- `apply` 见 `overlayFor` ⇒ 把 `rows` 记进模块级注册表（**不注册 preset**）；`registerDeclaration` **把 `applyOverlay(...)` 移进 `presets.register` 的微任务链**（**注册时**求值）⇒ **与行序无关**。
- **身份守卫**：`config.plugins` 非数组／`id` 空 ⇒ 具名 warn（"REPLACED by a patch … patch the OVERLAY row"）且**什么都不注册**。

★★★ **验证（免费命令 + 探针）**：
```
A: dsh --profile vmsmoke --dump-config                            → 3407 行   exit=0
B: dsh --profile vmsmoke --dump-config --patch <overlay-row.yml>  → 3422 行   exit=0
★ preset 行整块（`- id: preset-vibe-math-vmu` → 下一个顶层行）**203 行，A vs B 逐字节相同** ✓✓
★ 差异只在 overlay 行：基线 3 行（`config: {}`）→ 带 patch 16 行（payload）
★ 不带 patch ⇒ overlay 行 `config: {}` ⇒ 零机制（不点亮任何东西）
运行时探针（**故意用不利行序**：先 preset 行、后 overlay 行）→ **16/0**：
  无 overlay ⇒ 注册定义与随包**逐字节一致**；有 overlay ⇒ 内层行 `tools.faces`/`packs.active` 合并
  且**原有字段保留**、其它行不动、定义里**不残留** `overlay`/`overlayFor`、`plugins` 未被原地改；
  未匹配 key ⇒ **具名告警（`ctx.logger.warn`，探针捕获文本）且定义不变**；
  被替换的 config ⇒ **具名告警且不注册**。
```
★ 探针全文已交 **vmu-verify**（它要落成 `tests/**` 常驻测试）；A/B 读数已交 Lead。★ 配方与"dump 局限"已写入 `docs/02` 同节，具名语义写入 `docs/03 §2`。

## 越界说明（请写进提交信息）
- **`preset-declaration.js`**：不在 task-33 的写范围清单里，但 **Lead 明确指派**"给 preset 加 overlay 入口"，且 U14 的落地只能在该文件（内层行的 config 由它构造）。最终改动：新增 `applyOverlay`／`overlayForPreset` ＋ overlay 行处理 ＋ 注册期惰性求值 ＋ 身份守卫；**默认行为不变**（无 overlay ⇒ 定义与随包逐字节一致）。
- **`cordis.patch.yml`**：新增一行 `vibe-math-vmu-overlay`（`config: {}`）——**这是可打靶点本身**；它不点亮任何东西（零机制）。
- **`tools/task.js`**：不在 task-33 清单里，但 **Lead 的 task-35 第 3/4 条明确指派**。

## 未做项 / 具名边界
1. **`dsh --dump-config-schema`** 未成功（要求 `--profile`，且 shipped 模板在 asar 内、无法凭空建 profile）⇒ 我用**活体 `--dump-config --patch` 对比**替代（更强：直接看 patch 有没有生效），`Config.listConfigs` 的 `patchId` 语义由 Lead 提供、我复核了格式。
2. **真机"多面点亮 + pack 装载"的端到端断言**归 vmu-assistant／verify（配方已给；assistant 已做 `--dump-config` 双向复核 ✓）。
3. `vmu.v3.*` 两键已进 schema（vmu-pack 的 A 项）；`docs/04 §11` 我已单文件重生成（1219 键）。

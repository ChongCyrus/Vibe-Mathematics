# dsh-vibe-math 2.3.2 — 四套深度审计：三处高危门禁缺陷 + 撤回语义统一 + 语料确定性

> 上一版：2.3.1。本版是**审计驱动**的修复版：对 v2/v3/v4/v5 各做了一轮逐架构深度审计
> （插件 + 套件 + 实现方案 + persona + 语料），并做了四个架构之间的**横向对照**。
> 无破坏性变更，默认仍为 `formalVerify: 'off'`。

---

## 0. 三处高危缺陷（都会让"严格验证"失效或不可用）

| # | 架构 | 缺陷 | 后果 |
|---|---|---|---|
| 1 | **v3** | 四个 Lean 参数**根本没写进 `vibe_math_set_params` 的参数 schema**（该 schema 是 `additionalProperties:false`） | 遵守 schema 的 provider **拒绝这个调用** → 用户**永远无法开启**这个功能；而套件全绿，因为它直接调 handler、**绕过 schema** |
| 2 | **v2** | `require` 门禁**只读自己那一侧的 id**（`formalOf(rId)`），而代理用**对象 id** 归档、别名同步只更新**已存在**的键 | "归档了 passed、验证侧还没有记录"时门禁**永远搁置**；搁置本身又写下 `rId='none'`，于是**每轮重开一次辩论、对象永远无法定论**、其它对象被饿死 |
| 3 | **v4** | `formalSetRun` 硬编码 `status:'attempted'`，**把已验证对象的 `passed` 抹掉**（与自己的注释、规格、v2/v5 都矛盾） | 一次随手 `lean_run` 就让对象丢掉"已形式化"：投票提示词**丢掉忠实性分支**，`require` 档对**已有绿色归档证明**的对象重新关门 |

另有一处**门禁旁路**（v2）：`settleVerdict` 的「判断命题」转移在 v=0 时直接写
`布尔估计=0`/`已验证`/`优先级 never` 并压入 `正确概率:1` 条目，**完全不看门禁**——一个未形式化的
命题被侧面判为**假**且永久退出调度。已改为先过门禁。

---

## 1. 撤回语义统一：**删除 → 复核 → 覆盖撤回说明**

2.3.1 只在 v5 做对了。本轮把同一语义推广到四套：撤回归档证明时

1. 先删（`subprocess` 可用时）；
2. **用 fs 复核文件真的没了**；
3. 仍在（宿主没有 `subprocess`、shell 静默失败、权限问题）→ **就地覆盖为撤回说明**
   （`-- 已撤回（<时间>）：该形式化被认定与命题原文不一致。` + 指向保留的工作文件）；
4. 公告**如实说明**发生了哪一种（删除 / 覆盖 / ⚠ 两者都失败，请不要把它当作该对象的证明）。

此外修掉了两处静默漏洞：v2 只从两个 id 收集 `proof`（别名归档的证明留在盘上）；v2/v3/v4 用
`removeFile` 尽力删除且吞掉结果。

**同一类问题还有一处**：`lean_archive kind='proof'` 在**这次跑红**时曾保留 `prev.proof`
（而工作文件已被新代码覆盖）→ `Formal/Index.md` 会同时显示"attempted/fail"与一条**不再成立的**
`Verified/Lean/…`，忠实性提示词还会打印这个路径。四套统一为"`proof` 只属于 `passed`"，并在跑红时
撤回旧的归档证明（v4 另外把"随手 `lean_run` 不许降级 passed"补回）。

---

## 2. 提示词/交互修复（逐条都有断言与探针）

| 修复 | 说明 |
|---|---|
| **按档位承诺**（四套） | 忠实性分支曾**无条件**宣称"本次裁定**不定论**"，而只有 `require` 有门禁。现在 require 保留该承诺，encourage 明确写"**本档没有门禁**：请务必给弃权值，以保证本轮无法得出一致结论"；defect 公告、TODO/Index 措辞同样按档位分叉 |
| **无工具链出路点名两个错误码**（四套） | 只写 `LEAN_NOT_FOUND` 时，遇到 `NO_SUBPROCESS`（宿主没有 subprocess 服务）的代理会当成未知失败而重试；现在两个都点出 |
| **失败提示要可执行**（v3） | `LEAN_NOT_FOUND`/`NO_SUBPROCESS`/`LEAN_SPAWN_FAILED` 没有编译器输出，却提示"按上面的编译器输出修复" → 改为按失败码给不同的出路 |
| **活动日志里的工具名**（v4） | 代理可读的日志里写着缩写 `lean_run` → 改为注册名 `vibe_v4_lean_run`；注入文本扫描现在也覆盖 `State/session.json` 的 `activityLog` |
| **路径指向真实位置**（v2） | 工作轮把可复用引理指向项目内的 `Formal/Proved/`——那是**不存在**的路径（全局库在项目树之外）→ 改为 `<VibeMath 根>/Formal/Proved/` |
| **红灯不许声称可复用**（v2） | `kind='def'/'lemma'` 跑红时工具返回值仍写"已并入全局可复用库，可直接 import 复用" |
| **`vibe_math_setup` 重复参数**（v3） | `plannerPersona` 出现两行 |
| **规格里的幽灵工具**（v4，由我的新审计发现） | `实现方案.md` 把 `vibe_v4_propose_verify(targetId)` 写成工具，而 v4 **没有**这个工具（真机制是回执字段 `propose_verify`） |

---

## 3. 语料确定性（契约 §10 要求"逐字节可 diff"）

- **v5**：语料每跑一次都变。根因有三层：心跳/会议唤醒依赖**真实时钟**与异步顺序；捕捉心跳时
  "最闲成员"随时间抖动；写入端**只按 kind 排序**，同 kind 内仍随 drain 顺序变化。
  修法：套件加**虚拟时钟**（`ctx.timeout` 接虚拟队列、`sleep(n)` 推进虚拟时间）＋心跳在
  **单成员研究所**内捕捉＋写入端**全序排序**（kind → owner → prompt）。
  结果：**连跑 6 次哈希全同**，且套件 **7–9 s → 1.7 s**。
- **v3**：20 条 `planner:*` 条目带随机 plan id 与 epoch 时间戳 → scrub 归一化 + 断言。
- **v2/v4**：本已稳定；v4 的语料在套件运行中重生成并验证两次哈希一致。
- 五份语料（四个预设 + persona）现在都通过我的确定性检查（无绝对路径、无时间戳、可重复）。

---

## 4. 新增的常驻守卫（随包发布，可一键复核）

| 脚本 | 作用 |
|---|---|
| `audit-prompt-invariants.mjs` | 把历次**真实发生过的提示词/工具面缺陷类别**编码成四套 × 31 条静态不变式（缩写工具名 / "偏离→0" / `defect` 规则缺失或未实现 / 回执契约缺 `defect` / 无 note 放行 / 字段名错 / `off` 档回执未被门禁 / 语料不确定或缺档位 / 探针缺失 / 按档位承诺 / **封闭的 schema 收不下自己文档里的参数** / **schema 声明了、参数层却静默丢弃的键**）。**当前 145/0**，并带 `--self-probe`：在内存里注入这些缺陷形状，要求对应不变式**变红**、未变异的对照跑**仍为绿**（5/5） |
| `audit-spec-traceability.mjs` | 规格/README 承诺的工具必须真的注册（**能识别"文档里说它不存在"的否定语境**）；四个 Lean 参数必须同时被文档与代码接受；契约 §7 的 `terminate()`；契约 §8 的**门禁收口点无旁路**（调用图检查）。**当前 91/0** |
| `run-tests.mjs` | 并行跑全部套件，打印每项耗时/加速比/最慢几项（本轮又修了 `--only x` 空格形式被静默忽略、`--json` 混入人类输出两个 bug） |
| `docs/test-timing.md` | 耗时基线 + 并行安全规则 + 虚拟时钟的适用条件（若套件用 `Date.now()` 做超时判据又用 `setInterval` 轮询，冻结时钟会让判据永不超时，必须连轮询定时器一起虚拟化） |

### 4.1 新增「工具参数 schema」守卫：文档写了 ≠ 工具收得下

本轮最贵的一处缺陷（v3 开不了档）暴露出一整类**既有测试全都盲**的漏洞：四个预设的工具 schema 都由
`objParams` 以 `additionalProperties:false` **关闭**，因此 schema 没列出的键会被任何遵守 schema 的
provider **直接拒绝**——可提示词/规格/状态行可以全都在说这个参数，套件也可以全绿（套件直接调 handler、
绕过 schema）。现在这层有了三重守卫：

1. 四套各自的 `formal-verify-vN.test.mjs` 直接检查**真实注册的** schema 对象：schema 必须仍是封闭的、
   必须声明 `formalVerify`/`leanCommand`/`leanArgs`/`leanTimeoutMs`、`formalVerify` 的 enum 必须恰好是
   三档（**已用探针证明**：把 v3 真实注册那一份里的 `leanArgs` 去掉，套件立刻变红）；
2. `audit-prompt-invariants.mjs` 的 I13：**每一处** set 工具定义（v2/v3 有"会话 handler 表"与
   "真实注册"两份）都必须声明这四个参数，且每一份 `objParams` 都必须关闭 schema；
3. 同脚本的 I14：schema **声明的每个键**都必须被参数层真正接收（v2/v3 的闸门是 `DEFAULT_PARAMS` 键集、
   v4 是 `k in params`、v5 是 `normalizeParams` 的类型列表）——声明而不接收 = 调用返回 `{ok:true}`
   而什么都不发生，是最容易被读成"设置成功"的静默失效。

`AUDIT-CHECKLIST.md` 新增 **§1.8「四套同构：任何语义修正必须四套同步」**——本轮三处高危里有两处正是
"改了一套、另三套没改"或"四套共用同一写法而没人横向对照"造成的。

---

## 5. 测试与探针（实测）

| 套件 | 2.3.1 | 2.3.2 |
|---|---|---|
| `formal-verify-v2.test.mjs` | 261 | **319** |
| `formal-verify-v3.test.mjs` | 247 | **283** |
| `formal-verify-v4.test.mjs` | 226 | **269** |
| `formal-verify-v5.test.mjs` | 120 | **145** |
| `prompt-v5-integrity.test.mjs` | 588 | **506**（语料去重：心跳只记 1 条）+ 虚拟时钟 |
| `e2e-v4-fixes.test.mjs` | 120 | 120（**修掉并行下的抖动**：T21 的会议看门狗 80 ms 在 CPU 争用下提前放弃会议） |

- 全量回归：**连续 3 次并行跑，23/23 全绿**（wall ≈111 s，最新一次实测 wall 111.5 s / sum 221.5 s / x1.99，
  关键路径 `e2e-v4-fixes` 98.1 s）；
- `audit-formal-sensitivity.mjs`：**49 条探针全部按预期变红，0 问题**；
- `audit-prompt-invariants.mjs`：**145/0**，`--self-probe` **5/5**；`audit-spec-traceability.mjs` **91/0**；
- `audit-persona-sensitivity.mjs`：11/11 变红；`audit-persona-surface.test.mjs` 197/0；
- `audit-v5-integrity.mjs` clean；四套 `audit-registration.mjs` 无重复/无缺失；
- 新增两条 **schema 级探针**：把 v3 真实注册的 schema 里 `leanArgs` 去掉 → v3 套件变红（已实测）；
  在 v4/v5 里造一个"声明但不接收"的参数 → `audit-prompt-invariants.mjs` 变红（已实测）。

---

## 6. 仍然存疑、需要人决定的政策问题（不是 bug，故未擅自改）

1. **跑红的 `kind='proof'` 是否应撤销旧证明**：本轮按"`proof` 只属于 `passed`"（契约 §4）统一四套；
   若你认为"随手一次失败不该抹掉已证结论"，应改**契约**而不是改代码。
2. **`off` 档"主动调用工具"算不算无操作**：契约 §2 明确工具仍可用，但那会写 `Formal/Index.md`/状态/公告；
   四个审计都把它记为 policy call，现已在规格里澄清"off 约束的是**框架自身**，主动调用是显式行为"。
3. **`used` 回执的语义**：契约状态表字面写"→ attempted"，而四套实现都**保留** `passed`/`blocked`
   （否则每条"我用了它"的回执都会把 passed 打回 attempted 并重新关门）。建议改契约字面。
4. **v2 的 id 解析歧义（真实可达）**：`formalObjectIdOf` 把"对象 id 本身以 `-sN/-pfN/-rfN` 结尾"的
   rId 解析错（`r-p-s1 → p`）：这类命题的提示词/卡片会引用**另一个对象**的证明、门禁会被那个对象的
   `passed` 放行。正确修法是**在记录里落权威 `objectId`**，但这要先把契约定下来。
5. **只剩"被门禁搁置"的对象时**：调度器会空转（不会卡死、不会误判终止）——契约没写这种局面该终止还是空转。

---

## 7. 升级

```
npm i dsh-vibe-math@latest
```

无迁移：新参数默认 `off`，四套既有行为与 `off` 一致。升级后重启 DSH；未被手动改过的 preset 文件
会自动更新。

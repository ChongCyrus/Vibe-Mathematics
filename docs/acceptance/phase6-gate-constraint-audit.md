# PHASE 6 · 门禁约束清理审计（只读清点 ＋ 分组建议）

> 性质：**只读审计**。本轮不改任何代码、不跑 git；只回答"哪些门禁在阻碍更贴合哲学理念的改动，怎么处置"。
> 触发：创始人的全局指示——**"一切明明可以更贴合哲学理念但是却因门禁导致阻碍更贴合哲学理念的不必要门禁约束都请去掉"**。
> 判据（本轮的核心，照抄并细化）：**(甲) 正确性/诚实类一律保留**（具名拒绝、文档与实现一致、空过检测、打包完整性）；
> **(乙) 形状/计数/记账/启发式**：凡"要求人类记账、凑数字、迁就手写常量"的一律**删或改成只报告**；
> (乙) 里若属**"从源码派生的一致性"**，**保留但必须可自动修复（`--write`）**——派生不一致是真缺陷（文档说谎），
> 但修复不许变成手工劳动。
> 范围：`tests/` 下全部 `audit-*.mjs`（`.test.mjs` 与其它 `.mjs` 都在内，含 `.mutants.mjs`）。`scripts/` 下另有 5 个
> `audit-*.mjs`（见 §3.3 的边界说明，未计入 131，但按同一判据单独标注）。

## §0 派生数字与统计口径

```
node -e "const fs=require('fs');const a=fs.readdirSync('tests').filter(f=>/^audit-.*\.mjs$/.test(f));console.log(a.length)"
→ 131
（构成：.mutants.mjs 17 · .test.mjs 57 · 其它 .mjs 57；scripts/ 侧 audit-*.mjs 另有 5 个）
```

**分类与处置的计数**（由 `D:\_tmp\gate-classify.mjs` 对 131 条逐条登记后汇总，不是手加）：

| 维度 | 计数 |
|---|---|
| 总门禁（tests/） | **131** |
| (甲) 正确性/诚实 | **114** |
| (乙) 形状/计数/记账/启发式 | **17** |
| 建议 **保留** | **122**（其中 6 条是"派生面，保留但必须 `--write`"；4 条是"已只报告"） |
| 建议 **放松** | **6** |
| 建议 **改成只报告** | **2** |
| 建议 **删** | **1** |
| 阻碍史 **①实测阻碍过** | **8** |
| 阻碍史 **②未观测到** | **115** |
| 阻碍史 **③可能阻碍（场景已写）** | **8** |

★ **②的口径必须说清**：它不是"证明从未阻碍"，而是"在本轮与我能核到的前几轮记录里**没有阻碍证据**"
（门禁头注释、acceptance 报告、我自己的施工日志）。凡我**亲眼见过它变红且那次红是合法改动的**，才记 ①。

## §1 实测阻碍过的 8 条（①）——逐条给证据

| 门禁 | 它当时怎么红 | 证据（文件:行/命令） | 结论 |
|---|---|---|---|
| `tests/audit-pack-face.test.mjs` | 纯记账 × 2：新 pack 文件必须先改文档才能落地；且按**子串**匹配 ⇒ 本轮因 `mathtools.js` 含 `tools.js` 而**巧合变绿**，真未命名；另有两条**其实已命名**的文件照红 | `tests/audit-pack-face.test.mjs:44`（头注释记录这两次；`:50` 现为只报告） | 已由 Lead 改为只报告；反方向（卷里引用的 pack 文件必须存在）**保留** |
| `tests/audit-policy-defaults.test.mjs` | 冻结"非中性默认值计数只许缩不许涨"：声明 10 把 v3 包键 ⇒ 630→638 变红；唯一出路是中性化真实默认值或写 8 条 doc 注记 | `tests/audit-policy-defaults.test.mjs:119`、`:121`（现在只打印 630 与 delta） | 已由 Lead 改为只报告 |
| `tests/audit-code-size.test.mjs` | 文件行数阈值/advisory：任何大文件都"欠账"；本轮 host.js 为 P0-10 长到 1200+ 时被标记 | `tests/audit-code-size.test.mjs:1`、`:72`、`:74`（现只测量，并断言**禁止**阈值回来） | 已由 Lead 删掉阈值/advisory，保留测量 |
| `tests/audit-readme-counts.mjs` | 每加一个测试就要重写 README/4 个文档的数字：P0-1 作业数 447→448、P0-10 448→455 都红过；`update-doc-counts --check` 会列 5 个 WOULD CHANGE | `tests/audit-readme-counts.mjs:54`（4 个文档的 canonical bullet）、`:64`（每个 `TOTAL <n>` 必须等于派生值） | **保留（派生面），但必须一条命令 `--write` 自动修**（§6） |
| `tests/audit-code-status.test.mjs` | P0-10 新增文件里出现已登记码字面量 ⇒ docs/03 §8.1 的实现状态行过期（`planned-code registry` STALE） | `tests/audit-code-status.test.mjs:107`（LOCATION-DOES-NOT-CONTAIN-THE-CODE）、`scripts/generate-planned-codes.mjs:158`（扫描实现状态） | **保留（派生面），`--write` 自动修** |
| `tests/audit-generators-current.test.mjs` | 任何生成物过期即红（P0-1 的 docs/04 一格、P0-10 的 docs/03 行都是由它连锁暴露） | `tests/audit-generators-current.test.mjs:68`（`stale.length === 0`） | **保留（派生面），`--write` 自动修** |
| `tests/audit-declaration-criterion.test.mjs` | **①A-class baseline**：本轮新测试里对**非空字面量数组** `.every()` 被判"可能空集"⇒ 新指纹，必须改 baseline 才绿；**②C2 多行条件断言 baseline**：本轮红在 `formal-verify-v3.test.mjs` 等**别人新增的**普通控制流 | `tests/audit-declaration-criterion.test.mjs:326`（A baseline）、`:791`（B/C/D 必红）、`:815`（C2 新增即红）、`:841`（`--write-baseline`）；本轮实测红：`vmu-v3-tools.test.mjs:A:STARTED_SCHEDULER_FIELDS` | **放松**（A/B/D 与单行 C 保留；C2 改只报告；A 的"删除也红"去掉、字面量常量精确化） |
| `tests/audit-silent-keys.mjs` | 声明未读的键必须进**手写惰性台账**：P0-1..P0-7 期间 8 把 v3 键必须先写台账（后来才各有读者） | `tests/audit-silent-keys.mjs:53`（判定）、`:60`（台账豁免）、`:93`（台账文件路径） | **放松**（核心保留；豁免来源放宽到任何**声明性记录**，别只认手写台账） |

## §2 全表（131 条，逐条判）

> 列义：**类**＝甲/乙；**阻碍**＝①实测阻碍过／②未观测到（不是"从未"的证明）／③可能阻碍（场景写在 §4 与各条备注里）；
> **建议**＝保留／放松／改报告／删。表中 `--write` 一律指该门禁自己的自动修复路径（§6）。

| 门禁 | 它拦什么 | 类 | 阻碍 | 建议 |
|---|---|---|---|---|
| `audit-artifact-docs.mjs` | README/契约不得点名不存在的产物（打包真实性） | 甲 | ② | 保留 |
| `audit-artifact-docs.mutants.mjs` | 变体自证：删掉产物必须红 | 甲 | ② | 保留 |
| `audit-bus-emit-shape.test.mjs` | emit 首参必须是字符串（真实 bug 类） | 甲 | ② | 保留 |
| `audit-claim-traceability.test.mjs` | 每条宣称都有卷/证据可追溯 | 甲 | ② | 保留 |
| `audit-corrupt-file-guard.test.mjs` | 损坏状态文件的具名降级（回归） | 甲 | ② | 保留 |
| `audit-cross-volume-refs.mjs` | 卷间章节指针必须解析 | 甲 | ② | 保留 |
| `audit-declaration-publishes-face.mutants.mjs` | 变体自证：声明不发布面必须红 | 甲 | ② | 保留 |
| `audit-declaration-publishes-face.test.mjs` | 声明必须真的发布面（零机制的反面） | 甲 | ② | 保留 |
| `audit-dependency-cycles.test.mjs` | import 图不得成环 | 甲 | ② | 保留 |
| `audit-diagram-assets.test.mjs` | 提交的位图必须含自己的图（防占位/损坏） | 甲 | ② | 保留 |
| `audit-doc-index.test.mjs` | 索引完整性 | 甲 | ② | 保留 |
| `audit-doc-line-refs.test.mjs` | file:行 必须存在（引用真实性）；行号漂移属已知限制，已 SKIP 歧义 | 甲 | ③ | 保留 |
| `audit-doc-planned-claims.mjs` | 文档说"未实现"必须与代码一致 | 甲 | ② | 保留 |
| `audit-doc-vs-code-tables.test.mjs` | 声称逐字镜像的表必须与代码一致 | 甲 | ② | 保留 |
| `audit-enforced-consistency.test.mjs` | 一个名词一个含义（语义一致性） | 甲 | ② | 保留 |
| `audit-engine-faces.mjs` | 引擎面存在才跑，缺则 loud SKIP | 甲 | ② | 保留 |
| `audit-enum-branches.mjs` | 枚举/分支一致性（真实缺陷类） | 甲 | ② | 保留 |
| `audit-f1-compact-fix.test.mjs` | F-1 回归 | 甲 | ② | 保留 |
| `audit-f2-filter-fix.test.mjs` | F-2 回归 | 甲 | ② | 保留 |
| `audit-face-actions.mjs` | 面提供的 action 必须真实存在 | 甲 | ② | 保留 |
| `audit-formal-sensitivity.mjs` | 敏感性探针（防套件恒绿） | 甲 | ② | 保留 |
| `audit-fs-purpose.test.mjs` | fs 直连需声明用途（白名单） | 甲 | ② | 保留 |
| `audit-fuzz-helpers.mjs` | 纯函数 fuzz | 甲 | ② | 保留 |
| `audit-hook-coverage.test.mjs` | 冻结钩子必须有 emit 点 | 甲 | ② | 保留 |
| `audit-installer-assertions.mutants.mjs` | 安装器断言质量变异自证 | 甲 | ② | 保留 |
| `audit-installer-compat.test.mjs` | 宿主兼容性契约 | 甲 | ② | 保留 |
| `audit-installer-policy.test.mjs` | 升级后预设目录策略 | 甲 | ② | 保留 |
| `audit-kernel-claims-10.mjs` | 把模块头宣称抄成断言（AGENTS §7.3） | 甲 | ② | 保留 |
| `audit-kernel-claims-11.mjs` | 把模块头宣称抄成断言（AGENTS §7.3） | 甲 | ② | 保留 |
| `audit-kernel-claims-12.mjs` | 把模块头宣称抄成断言（AGENTS §7.3） | 甲 | ② | 保留 |
| `audit-kernel-claims-13.mjs` | 把模块头宣称抄成断言（AGENTS §7.3） | 甲 | ② | 保留 |
| `audit-kernel-claims-14.mjs` | 把模块头宣称抄成断言（AGENTS §7.3） | 甲 | ② | 保留 |
| `audit-kernel-claims-15.mjs` | 把模块头宣称抄成断言（AGENTS §7.3） | 甲 | ② | 保留 |
| `audit-kernel-claims-16.mjs` | 把模块头宣称抄成断言（AGENTS §7.3） | 甲 | ② | 保留 |
| `audit-kernel-claims-17.mjs` | 把模块头宣称抄成断言（AGENTS §7.3） | 甲 | ② | 保留 |
| `audit-kernel-claims-18.mjs` | 把模块头宣称抄成断言（AGENTS §7.3） | 甲 | ② | 保留 |
| `audit-kernel-claims-19.mjs` | 把模块头宣称抄成断言（AGENTS §7.3） | 甲 | ② | 保留 |
| `audit-kernel-claims-2.mjs` | 把模块头宣称抄成断言（AGENTS §7.3） | 甲 | ② | 保留 |
| `audit-kernel-claims-20.mjs` | 把模块头宣称抄成断言（AGENTS §7.3） | 甲 | ② | 保留 |
| `audit-kernel-claims-21.mjs` | 把模块头宣称抄成断言（AGENTS §7.3） | 甲 | ② | 保留 |
| `audit-kernel-claims-22.mjs` | 把模块头宣称抄成断言（AGENTS §7.3） | 甲 | ② | 保留 |
| `audit-kernel-claims-23.mjs` | 把模块头宣称抄成断言（AGENTS §7.3） | 甲 | ② | 保留 |
| `audit-kernel-claims-24.mjs` | 把模块头宣称抄成断言（AGENTS §7.3） | 甲 | ② | 保留 |
| `audit-kernel-claims-3.mjs` | 把模块头宣称抄成断言（AGENTS §7.3） | 甲 | ② | 保留 |
| `audit-kernel-claims-4.mjs` | 把模块头宣称抄成断言（AGENTS §7.3） | 甲 | ② | 保留 |
| `audit-kernel-claims-5.mjs` | 把模块头宣称抄成断言（AGENTS §7.3） | 甲 | ② | 保留 |
| `audit-kernel-claims-6.mjs` | 把模块头宣称抄成断言（AGENTS §7.3） | 甲 | ② | 保留 |
| `audit-kernel-claims-7.mjs` | 把模块头宣称抄成断言（AGENTS §7.3） | 甲 | ② | 保留 |
| `audit-kernel-claims-8.mjs` | 把模块头宣称抄成断言（AGENTS §7.3） | 甲 | ② | 保留 |
| `audit-kernel-claims-9.mjs` | 把模块头宣称抄成断言（AGENTS §7.3） | 甲 | ② | 保留 |
| `audit-kernel-claims.mjs` | 把模块头宣称抄成断言（AGENTS §7.3） | 甲 | ② | 保留 |
| `audit-market-metadata.test.mjs` | storefront 元数据（含自排除断言） | 甲 | ② | 保留 |
| `audit-math-computation-contract.mjs` | math_computation 跨预设契约 | 甲 | ② | 保留 |
| `audit-math-computation-contract.mutants.mjs` | 契约变异自证 | 甲 | ② | 保留 |
| `audit-math-computation-parity.mjs` | 共享模块逐字节一致 | 甲 | ② | 保留 |
| `audit-math-computation-parity.mutants.mjs` | parity 变异自证 | 甲 | ② | 保留 |
| `audit-math-computation-sensitivity.mjs` | math 套件敏感性 | 甲 | ② | 保留 |
| `audit-pack-json.test.mjs` | pack 数据文件可解析、无重复键 | 甲 | ② | 保留 |
| `audit-package-membership.mjs` | 要出货的护栏/测试必须在 package.json#files | 甲 | ② | 保留 |
| `audit-package-membership.mutants.mjs` | 打包名册变异自证 | 甲 | ② | 保留 |
| `audit-participant-set-parity.mjs` | 跨预设参与者集语义 | 甲 | ② | 保留 |
| `audit-path-consistency.test.mjs` | 路径构造一致性（F2 回归） | 甲 | ② | 保留 |
| `audit-path-discipline.mjs` | 跨预设路径纪律 | 甲 | ② | 保留 |
| `audit-path-discipline.mutants.mjs` | 路径纪律变异自证 | 甲 | ② | 保留 |
| `audit-persona-sensitivity.mjs` | persona 套件敏感性 | 甲 | ② | 保留 |
| `audit-persona-surface.mutants.mjs` | persona 面变异自证 | 甲 | ② | 保留 |
| `audit-persona-surface.test.mjs` | persona/prompt 分配一致性 | 甲 | ② | 保留 |
| `audit-planned-names.test.mjs` | 计划名称不得掩盖已存在能力 | 甲 | ② | 保留 |
| `audit-preset-declaration-group.test.mjs` | 预设声明不得被加载器插值 | 甲 | ② | 保留 |
| `audit-preset-mechanism.test.mjs` | 宿主交付路径判定（HIGH finding） | 甲 | ② | 保留 |
| `audit-preset-overlay-merge.test.mjs` | 可声明 overlay 必须真合并 | 甲 | ② | 保留 |
| `audit-preset-rows.test.mjs` | bundle patch 行 vs 当前 DSH 线 | 甲 | ② | 保留 |
| `audit-prompt-behaviour.mutants.mjs` | prompt 行为变异自证 | 甲 | ② | 保留 |
| `audit-prompt-duplication.mjs` | 跨预设 prompt 重复不变量 | 甲 | ② | 保留 |
| `audit-prompt-duplication.mutants.mjs` | prompt 重复变异自证 | 甲 | ② | 保留 |
| `audit-prompt-invariants.mjs` | 已出货缺陷类的 prompt 不变量 | 甲 | ② | 保留 |
| `audit-readme-counts.mutants.mjs` | 计数门禁变异自证 | 甲 | ② | 保留 |
| `audit-receipt-fields.mjs` | 回执字段契约 | 甲 | ② | 保留 |
| `audit-registration.mjs` | 工具注册面 vs 真实宿主契约 | 甲 | ② | 保留 |
| `audit-round1-regressions.test.mjs` | 轮 1 回归 | 甲 | ② | 保留 |
| `audit-round6-persistence.test.mjs` | 收敛标志跨重载持久（回归） | 甲 | ② | 保留 |
| `audit-roundtrip-idempotence.mjs` | 三卡往返幂等 | 甲 | ② | 保留 |
| `audit-scope-classification.test.mjs` | 防止 scope 静默漏测试（门禁的门禁） | 甲 | ② | 保留 |
| `audit-seam-reachability.test.mjs` | D1：seam 可达 | 甲 | ② | 保留 |
| `audit-service-calls.mjs` | 无悬空服务调用 / 未声明键读取 | 甲 | ② | 保留 |
| `audit-service-coverage.test.mjs` | 可 require 的服务名可查（防猜名） | 甲 | ② | 保留 |
| `audit-settings-channels.test.mjs` | 两条读设置通道 + 零机制矩阵 | 甲 | ② | 保留 |
| `audit-settings-roundtrip.test.mjs` | 写出的设置文件必须是合法 JSON | 甲 | ② | 保留 |
| `audit-shared-module-parity.test.mjs` | 共享 math 模块全副本逐字节一致 | 甲 | ② | 保留 |
| `audit-spec-traceability.mjs` | 预设表/Lean 参数表与代码可追溯 | 甲 | ② | 保留 |
| `audit-status-report-fields.mjs` | 状态/报告字段表与源码一致 | 甲 | ② | 保留 |
| `audit-status-report-fields.mutants.mjs` | 字段表变异自证 | 甲 | ② | 保留 |
| `audit-table-integrity.test.mjs` | 空行截断表格（文档损坏） | 甲 | ② | 保留 |
| `audit-tool-exec.mjs` | 注册的工具真能执行（NEEDS_ARGS） | 甲 | ② | 保留 |
| `audit-v3-registration-parity.mjs` | v3 两层注册逐字一致 | 甲 | ② | 保留 |
| `audit-v5-integrity.mjs` | v5 静态自检 | 甲 | ② | 保留 |
| `audit-v5-lean-abstention.mjs` | v5 Lean 弃权审计 | 甲 | ② | 保留 |
| `audit-v5-lean-abstention.mutants.mjs` | 弃权审计变异自证 | 甲 | ② | 保留 |
| `audit-v5-prompt-duplication.mjs` | v5 prompt 重复不变量 | 甲 | ② | 保留 |
| `audit-v5-prompt-duplication.mutants.mjs` | v5 prompt 变异自证 | 甲 | ② | 保留 |
| `audit-v5-sensitivity.mjs` | v5 套件敏感性 | 甲 | ② | 保留 |
| `audit-verbatim-claims.test.mjs` | verbatim 宣称必须说明"对什么"逐字 | 甲 | ② | 保留 |
| `audit-vmu-docs.mutants.mjs` | vmu 文档审计变异族 | 甲 | ② | 保留 |
| `audit-vmu-docs.test.mjs` | vmu 设计集/公开面登记一致 | 甲 | ② | 保留 |
| `audit-vmu-glossary.test.mjs` | 词表唯一且真实 | 甲 | ② | 保留 |
| `audit-vmu-orphan-methods.test.mjs` | 孤儿方法（核心纪律机械化） | 甲 | ② | 保留 |
| `audit-vmu-release.mutants.mjs` | 发布形态变异自证 | 甲 | ② | 保留 |
| `audit-vmu-release.test.mjs` | 发布形态可机器检查部分 | 甲 | ② | 保留 |
| `audit-vmu-services.mutants.mjs` | 服务面变异自证 | 甲 | ② | 保留 |
| `audit-vmu-services.test.mjs` | 注册的服务必须真被构造、构造面必须登记 | 甲 | ② | 保留 |
| `audit-vmu-wired-union.test.mjs` | wired schema 两来源必须是并集 | 甲 | ② | 保留 |
| `audit-zpolicy.test.mjs` | R1 zero-policy（kernel 不得认识机构词） | 甲 | ② | 保留 |
| `audit-code-size.test.mjs` | 已改为"只测量+只报告"，并断言禁止重新引入阈值（本轮 Lead 已落） | 乙 | ① | 保留 |
| `audit-code-status.test.mjs` | docs/03 §8.1 生成表必须与代码一致；修复必须 `--write` | 乙 | ① | 保留 |
| `audit-generators-current.test.mjs` | 生成物必须 current；修复必须 `--write` | 乙 | ① | 保留 |
| `audit-kernel-index.test.mjs` | docs/02 kernel index 由模块头生成；修复必须 `--write` | 乙 | ③ | 保留 |
| `audit-pack-face.test.mjs` | 命名断言已改为只报告；保留"卷引用的 pack 文件必须存在"（文档不说谎） | 乙 | ① | 保留 |
| `audit-policy-defaults.test.mjs` | L1 已改为只报告（本轮 Lead 已落）：非中性默认值 630，delta 只打印 | 乙 | ① | 保留 |
| `audit-readme-counts.mjs` | 文档里的派生数字必须等于派生值；修复必须 `update-doc-counts --write` | 乙 | ① | 保留 |
| `audit-stale-markers.test.mjs` | 已是只报告型（计数命名过时对象的 marker） | 乙 | ② | 保留 |
| `audit-surface-index.test.mjs` | 四个 surface index 由生成器产出；修复必须 `--write` | 乙 | ③ | 保留 |
| `audit-vmu-maturity-table.mjs` | 成熟度表 vs 设置表（生成面）；修复必须 `--write` | 乙 | ③ | 保留 |
| `audit-declaration-criterion.test.mjs` | A/B/D 保留；C 单行保留；C2 多行改报告；A-class baseline 删除不再红、字面量常量精确化 | 甲 | ① | 放松 |
| `audit-silent-keys.mjs` | 核心保留（声明无消费者=红线）；豁免来源放宽到任何声明性记录，减少手写台账 | 甲 | ① | 放松 |
| `audit-doc-api-coverage.test.mjs` | 每卷必须点名其公开 API：改为只报告命名缺口，保留"导出确实存在" | 乙 | ③ | 放松 |
| `audit-module-coverage.test.mjs` | 逐导出命名是记账：改为只报告 gaps；保留"模块有 purpose 头" | 乙 | ③ | 放松 |
| `audit-readme-bilingual.test.mjs` | 翻译结构对等：保留链接/H1/图片引用，计数全等改报告 | 乙 | ③ | 放松 |
| `audit-tool-table.test.mjs` | 工具名不得虚构（保留）；"标题数=行数=发布数"改报告 | 乙 | ② | 放松 |
| `audit-docs-entry-template.mjs` | 每条能力条目要带成熟度标记：纯记账，改为报告缺失条目 | 乙 | ② | 改报告 |
| `audit-planned-tools-inventory.test.mjs` | 路标表×卷内 ⛔ 双向同步：文档-文档记账，改为报告 | 乙 | ② | 改报告 |
| `audit-gate-snapshot.test.mjs` | 给结论行加 git HEAD/dirty 指纹：纯记账、依赖 git 工作区，不保护任何行为；无人需要可用报告替代 | 乙 | ③ | 删 |

## §3 五个特别裁定

### 3.1 `audit-silent-keys` —— 记账还是必要？

**裁定：必要（保留），但豁免来源要放松。**

理由：它问的是一个**可判定且有后果**的问题——"schema 声明的键有没有消费者"。这正是本仓红线 4（"没有消费者就不给机制"）
的机械化；如果没有它，10 把 v3 键可以**永远没有读者**而没人知道。它抓的不是数字，而是"声明了但不生效"的真缺陷。
需要放松的是**裁定方式**：现在唯一出路是往 `docs/acceptance/phase3-inert-keys-ledger.md` 手写一行（`tests/audit-silent-keys.mjs:60`、`:93`）。
建议：豁免来源放宽为**任何声明性记录**（schema 的 planned/inert 标记、设置文档的"未接线"标注、台账），
并且**只对"新增声明且从未有读者"红**（存量已裁定键只报告）——这样它继续抓真缺陷，又不再要人抄台账。

### 3.2 `vmu-middleware-hooks-declared` 的 `KNOWN_UNBRIDGED` —— 必要吗？

**裁定：不必要，应放松判据（不是删门禁）。**

它问"pack 的 middleware 是否订阅了宿主永不触发的钩子"，这个问题是真的（防 inert 声明）。但它现在的判据是
`VU_HOOKS ∪ BRIDGED_HOOKS`（`tests/vmu-middleware-hooks-declared.test.mjs:22` 起），**漏掉了运行时的
`declareTopic` 主题**——而 `v3/tick` 是**合法协议扩展主题**，由 pack 声明、由调度器发射（`tests/vmu-middleware-hooks-declared.test.mjs:25`-`:32`
现在被迫写一行理由才能绿）。正确做法：判据并入**运行时已声明主题集**（总线自己就知道），
只有当主题**既未桥接、也未声明、也未发射**时才红；`KNOWN_UNBRIDGED` 表可保留为"确实未接线的偏好"的逃生口，
但**不再是合法扩展主题的出门条**。

### 3.3 `audit-declaration-criterion` 的 A 类（空集恒真）—— 保留吗？

**裁定：同意保留，但要做两处精确化。** 你问"还是觉得过度"——**A 类本身不过度**：`every()`/`filter` 在空集上恒真
是**真缺陷**，它能放过"门禁什么都没检查却绿"。但本轮它对我的**合法代码**报红：`vmu-v3-tools.test.mjs` 里
`STARTED_SCHEDULER_FIELDS` 是**5 项字面量数组**，`.every()` 永不空，却被要求 `--write-baseline`（`:326`、`:841`）。
建议：①**精确化**：同一文件内定义的非空字面量数组（元素 ≥1）视为已有非空守卫；②**baseline 只增红**：
新指纹仍红（真缺陷），但**删除/消失不再红**（修好一条不该还要改 baseline）；③C2 见 3.4。

### 3.4 RULE E 的 C2（多行条件断言）baseline —— 必要还是记账？

**裁定：是记账，建议改成只报告。**

门禁自己的注释就承认：这条形状在本树 **199 次、125 次未被豁免、绝大多数是普通控制流**
（`tests/audit-declaration-criterion.test.mjs:302`-`:308`）；它按**文件**冻结指纹，任何新文件里的普通
`if (x) { ok(...) }` 都要求 `--write-baseline`（本轮红在 `formal-verify-v3.test.mjs` 等**别人新增**的文件上，
与我无关，却会挡所有人提交）。建议：C/B/D 与**单行** C 保留（可判定），**C2 多行走报告**（打印清单即可）。
它不是"文档说谎"类，而是"形状猜测"类；留红只会逼作者撒 `EMPTY_ALLOWED` 注释——那正是门禁注释里自己反对的 whitelist drift。

### 3.5 `audit-readme-counts` / `update-doc-counts` —— 文档不说谎，还是凑数字？

**裁定：保留（文档不说谎），但必须真正做到"一条命令自动修"，并修掉一个残留缺陷。**

理由：数字是**从源码派生**的（作业数、发货文件数），不是手写常量；文档写错数字是**真说谎**（说"455 项作业"而实际 455 是
另一回事，就是失真）。所以它属于"派生一致性"，按判据应**保留**。但两条前提必须满足：
1. **修复必须自动**：`update-doc-counts --write` 与 `regen-all --write` 要能一次覆盖；当前 `regen-all --check` 实测 **16/16 in sync**、
   `update-doc-counts --check` 实测 **files changed=0**（数字层面不欠账）；
2. **但有一个未被自动维护的量**：docs/11 的 **vmu 子集作用域行**。它想用
   `GATE_SCOPE=vmu node tests/run-tests.mjs --counts` 派生，而 `--counts` **按设计**是作用域无关的（`scripts/update-doc-counts.mjs:31`-`:43`），
   于是派生恒失败、该行**从不被重写**（`:83`）。修法有两条，任选：
   ① 改用 `tests/run-tests.mjs --scope-report` 的 `scopes.vmu.total`（它本来就是为作用域计数设计的）；
   ② 若某行天然无法自动派生，就**从文档里删掉它**，而不是留一个"永远不被写"的数字。
   **这一条不修，就违反了"(乙) 派生面必须可自动修复"的前提**——一个既不能自动修、又不在检查里红的数字，是最坏的状态。

## §4 绝不能动（防止清理变成破坏）

| 门禁 | 为什么绝不能删 |
|---|---|
| `tests/audit-declaration-criterion.test.mjs` 的 **A/B/D**（及单行 C） | 空集恒真/条件式断言/吞异常是**真缺陷**；这与"记账"不同，删了等于允许门禁恒绿 |
| `tests/audit-service-calls.mjs` | 悬空服务调用与未声明键读取是**运行期崩溃/静默失效**的直接来源 |
| `tests/audit-vmu-docs.test.mjs`（+ mutants） | 公开面没登记 = 读者无法发现能力；它是 甲 类"文档与实现一致"的核心 |
| `tests/audit-scope-classification.test.mjs` | **门禁的门禁**：它防"测试被 scope 静默漏跑"（假绿），删了会让整套 T1 的覆盖率报告失真 |
| `tests/audit-pack-json.test.mjs` | pack 数据文件损坏（非法 JSON/重复键）会静默改语义 |
| `tests/audit-package-membership.mjs` | 打包完整性：缺一个文件 ⇒ 装完 MODULE_NOT_FOUND（已两次救回） |
| `tests/audit-table-integrity.test.mjs` | 空行截断 markdown 表格会让文档**静默丢行**（内容消失） |
| `tests/audit-shared-module-parity.mjs` / `audit-math-computation-parity.mjs` | 共享模块必须逐字节一致（parity 是第一纪律） |
| `tests/audit-vmu-services.test.mjs` | 注册≠构造，构造≠登记；服务面谎报会让工具调空 |
| `tests/audit-hook-coverage.test.mjs` | 冻结钩子无 emit 点 = 纸面钩子（本仓反复出现的类） |
| `tests/audit-zpolicy.test.mjs` | R1：kernel 不得认识机构词；这是全部第一原则的底座 |
| `tests/audit-dependency-cycles.test.mjs` | 环 = 加载顺序决定行为，ESM 下致命 |
| `tests/audit-fs-purpose.test.mjs` | fs 用途白名单是安全策略（不是记账） |
| `tests/audit-silent-keys.mjs` 的**核心读取判定** | "声明无消费者"是红线 4；只该放松豁免方式，不该删判定 |
| 所有 `*.mutants.mjs` | 它们证明门禁**会红**；没有它们，其余门禁可能全是恒绿装饰 |

## §5 (乙) 的处置策略（17 条的分布）

| 处置 | 条数 | 具体 |
|---|---|---|
| 已只报告（无需再动） | 4 | code-size、policy-defaults、pack-face、stale-markers（前三条本轮 Lead 已落） |
| 派生面：保留但必须 `--write` | 6 | code-status、generators-current、kernel-index、surface-index、vmu-maturity-table、readme-counts |
| **放松** | 4 | doc-api-coverage、module-coverage、readme-bilingual、tool-table |
| **改报告** | 2 | docs-entry-template、planned-tools-inventory |
| **删** | 1 | gate-snapshot |

外加 (甲) 里也需放松的 2 条：`audit-declaration-criterion`（C2/A 记账部分）、`audit-silent-keys`（豁免方式）。

## §6 自动化前置（派生面的硬要求）

- **派生面只有一种合法状态**：不一致 ⇒ 一条命令修好。当前链：`node scripts/regen-all.mjs --check`（实测 **16/16 in sync**）＋
  `node scripts/update-doc-counts.mjs --check`（实测 **files changed=0**）。修复命令：`node scripts/regen-all.mjs --write`（已含 `update-doc-counts` 步骤）。
- **`update-doc-counts` 的作用域行缺陷必须先修**（见 3.5）：否则 docs/11 的 vmu 子集数字永远不会被自动维护，
  "派生一致"只覆盖了仓库计数那一半。
- **不许把"记账"塞进 `--check`**（AGENTS §7.4）：任何需要执行测试才能得到的数字，写在文档里，不放进 `--check`。
- `scripts/` 侧同类门禁（`audit-pack-middleware-shape.mjs`、`audit-pack-value-domain.mjs`、`audit-hook-emit-classification.mjs`、
  `audit-projection-census.mjs`、`audit-acquire-release.mjs`）**未计入 131**，但本次判据同样适用；其中前两个的失败都是
  具名缺陷（能力/值域），应保留；后三个若纯盘点也应只报告——本轮**没有逐个读它们**（见 §7）。

## §7 我没核到的

1. **②的 115 条不是"从未阻碍"的证明**：只代表"我没有找到它阻碍合法改动的记录"。更完整的阻碍史需要逐轮读
   `docs/acceptance/**` 与各门禁头注释（本轮只抽读了关键几条）。
2. **没有实跑全部 131 条**：本轮为只读审计，只实跑了与五个裁定、派生面和本轮 P0-10 相关的一批
   （declaration-criterion、readme-counts、policy-defaults、code-size、gate-snapshot、scope-classification、
   audit-vmu-docs、audit-code-status…）。未跑的条目按文件名、头注释与前两轮经验判定。
3. **`scripts/` 侧 5 个 audit 未逐个读**（只在 §6 标注边界）。
4. **本文件是建议，不是施工**：Lead 要按它改门禁时，建议一次只改一类（先 (乙) 的删/报告，再放松，再修派生自动化），
   每改一类跑一次 `GATE_SCOPE=vmu node tests/run-tests.mjs`，避免"清理本身"制造新的假绿。

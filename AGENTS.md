# AGENTS.md — **本仓规矩的最短入口（给任何进入此仓的 agent）**

> ★ 这份文件的唯一目的：**让一个 agent 在动手之前拿到它必须知道的事**，而不必先读 335 份 `docs/acceptance/`。
> ★ **它不重复文档**：每条都指向权威位置。★ **数字一律不写死** —— 计数由命令派生，见 §3。

## 1. 这是什么

**vmu ＝ 数学研究／多智能体协作数学研究的【底层框架】**。运行机制 ＝ **框架 ＋ 一个整合包文件夹**：

```
vibe-math-vmu/            ← 框架（能力在内核）
  kernel/                 ← 能力：turn 循环、prompt 管线、名册、会议、票箱、工具面服务……
  tools/                  ← 工具面（模型能调用的那些 face）
  settings/schema.js      ← 【声明】：可设什么、类型/域/默认/归属/热级
  host*.js, vibe-math-vmu.js ← 与宿主 DSH 的适配（装配在这里）
  packs/v5r/              ← ★ 整合包：settings ＋ middleware ＋ prompts ＋ notices
    settings/             ← 本机构想要的旋钮值（数据，不是代码）
    middleware/           ← 本机构的策略（纯函数／模块）
    prompts/              ← 提示词内容（章、块、人设、语料）
docs/                     ← 设计文档（00–14 卷）＋ acceptance/（验收与审计记录）
tests/                    ← 套件与探针（门禁都在这里）
```

★ **换一个机构 ＝ 换一个 pack 文件夹**，不改内核。★ **这是本仓的第一原则。**

## 2. ★★★ 四条红线（违反即等于改错了方向）

1. ★★ **能力在内核，规范/策略/装配在 pack 或宿主。** 不要**把 policy 写进代码**（例：不要把"什么算活跃同伴"写成工具里的常量）。
2. ★★ **不硬编码本该由声明/推导得来的值。** 该由 `settings`、pack 或参数决定的，不许写死；该派生的（枚举、清单、计数）不许手抄。
3. ★★ **拒绝要具名，不许静默假装成功。** 失败要**用调用者的词汇**说清，并带 `code`/`message`/`hint`；**不许**吞异常、不许拿引擎消息当拒绝。
4. ★★ **没有消费者，就不给机制。** 默认必须是"零注入/零机制"；一切动起来都必须来自**声明**。

★ 另有两条**操作纪律**：★ **`math-computation.js` 是共享 verbatim 模块（多份必须逐字节相同）** —— 改之前先跑 parity 门禁；★ **提交只由 Lead 做**（agent 不自行 `git commit`）。

## 3. 怎样验证（★ 数字不要写死，用派生命令）

```bash
node scripts/preflight.mjs                  # T0 预检
node tests/run-tests.mjs                    # T1 默认门禁 = GATE_SCOPE=full（当前产品 live 面，442 作业，本机 ~65 s）
GATE_SCOPE=vmu node tests/run-tests.mjs     # 产品内迭代子集（421 作业，本机 ~40 s）
GATE_SCOPE=all node tests/run-tests.mjs     # 仓库全量（499 作业，含冻结归档 legacy 家族）——打 tag/发布前必须
GATE_SCOPE=archive node tests/run-tests.mjs # 只跑冻结归档的 legacy preset 家族（57 作业）
node tests/run-tests.mjs --counts           # ★ 作业计数的【权威来源】（README/文档里的数字由它派生；固定按 all 口径）
node scripts/regen-all.mjs --check          # 派生面是否同步（改完 schema/提示词务必跑）
node scripts/check-docs.mjs                 # 文档 lint
```

★ **改了 `settings/schema.js`** ⇒ 必须 `generate-vmu-settings-table.mjs --write` ＋ `update-doc-counts.mjs` ＋ `regen-all.mjs --write`，再跑 `--check`。
★ **新增文件** ⇒ 必须进 `package.json#files` **且** 进 `installer.js` 的 managed 清单（**否则装完就 MODULE_NOT_FOUND**，本地永远发现不了）。
★ **单个套件**：`node tests/<name>.test.mjs`。

## 4. 真机实测（SLV）

★ 脚本：`D:\_tmp\slv-phase5\slv5n-run.ps1`（★ **不要**用用户的 profile／端口）。
★ **模型提供商（现行为 opencode go）**：★ **`dsh-opencode-go` / `deepseek-v4.1-flash`**（★ 官方 `deepseek-official` / `deepseek-flash` 仍可作为对照，★ **两把 key 不混用**）。★ **SLV 必须消耗【专门给它的一把 key】**，★ **不许用团队自己的额度**：
　① ★ **key 只放仓外**（★ 现为 opencode go 的 `D:\_tmp\slv-opencode-key.txt`、官方的 `D:\_tmp\slv-key.txt`），★ **绝不进仓／不进文档／不写进脚本默认值**；
　② ★ **团队自己的模型源不变** —— ★ 换 key 只作用于 SLV 这一次真机跑，★ **不要改成全局环境变量**（★ 那会让团队的会话也吃这把 key）；
　③ ★ **跑前先做接缝探针**（★ 真实 fs 的 `Defects/` 落盘与重载、★ 一次真实工具 `deny`、★ 一次真实 md 导出）—— ★ 本阶段所有"已接线"只在本地夹具上成立，★ **接缝的形状差异会把"测试里绿"变成"真机里静"**；
　④ ★★★ **换 provider／换环境／换 key 一律【第一步】做，★ 然后【立刻】跑接缝探针，★ 不排在其它工作之后** —— ★ 切换是零成本、非破坏的，★ **探针本来就是为它存在的**（★ 实测教训：把"修接线"排在切换之前，★ 拖了一小时，★ 且把"接线坏"与"回执形状变了"混在一起）。
★ 交付模式 `caller` 时，★ **成员回合由调用会话扮演**：`step` 返回 `awaiting` ＋ `memberPrompt` ⇒ 按该提示词作答 ⇒ 下次调用带 `reply`。
★ 结题判据：`vibe_vmu_status` 的 **`closureVote.cast` 为 `true`**（全体有表决权者一致），★ **不是**"看起来收敛"。

## 5. 先读哪些

1. ★ **本文件**
2. ★★ `vibe-math-vmu/docs/03-interface-contract.md`（错误码与接口）／`04-settings.md`（设置表，**生成**）
3. ★★ `vibe-math-vmu/docs/26-turn-orchestration.md`（回合循环与编排）
4. ★ `docs/AUDIT-CHECKLIST.md`（门禁清单）
5. ★ 需要**交付/审计历史**时：`docs/acceptance/`（★ **按需检索，不要通读**）

## 6. ★ 不许做的事

★ **不要发布**（`npm publish`）；★ **不要动** `D:\wd\vibemath开发\token.txt`；★ **不要把临时文件写进 C 盘**（用 `D:\_tmp`）；★ **不要把"没读到"写成"没问题"** —— 覆盖率不足就**如实标注**，这是本仓最强的一条文化。

## 7. ★★★ 四条审计纪律（★ 都是花了真金买来的，不要再交一次学费）

1. ★★★ **红线要套在【正确的层】上。** 本仓有自建门禁（★ `tests/audit-service-calls.mjs` 调用侧／`audit-face-actions.mjs` 面侧／`audit-silent-keys.mjs` 设置键／`audit-kernel-claims.mjs` 行为宣称）。★ **但同一条红线换个层会变成噪声**：★ 曾把"没有消费者就不给机制"套到 **`export`** 上 ⇒ ★ 报出约 300 条，★ **而全部不是缺陷** —— ★ **因为本包的 `export` 就是【对外 API】（`package.json#exports`），★ "仓内无消费者"正是它们的常态**。★ **套错层得到的不是严谨，是噪声**。
2. ★★★ **扫描器自己会"空过"。** ★ 一次扫描报 **0** 时，★ **先证明它的判据【真的匹配到了东西】**：
   ★ 曾因过滤器写 `includes("/vibe-math-vmu/")` 而 **Windows 路径是反斜杠** ⇒ ★ **一个都没匹配、★ 于是"一个都没发现"**（★ 假阴性）；
   ★ 曾因**要求键名带引号** ⇒ ★ 漏掉所有 `{{ setting:… }}` 形式的读取（★ 11 个活键被误报为死键）；
   ★ 曾因**只收 `.js`** ⇒ ★ 跳过仓库里**每一个测试**（★ 测试是 `.test.mjs`）。
   ⇒ ★ **判据要先在【已知正例】上自证能命中**（★ 每个探针都该带 `--selftest`）。
3. ★★★ **验证【宣称】优于通读。** ★ kernel 模块头部写得很具体（"某类冲突不可能""某类拒绝必具名""某状态自报真假"），★ **而这些宣称【都能测量】** ⇒ ★ **把它们抄成断言**（★ 见 `tests/audit-kernel-claims.mjs`：**906 行的 `idempotency.js` → 17 条断言**）。★ **通读只能得到"我看着对"，★ 断言会【证伪】，★ 且留下就是回归测试。**
   ★★ 配套的一条：★ **你的探针报错时，先假设是【你自己】用错了 API** —— ★ 实测连续三轮都是猜错键名/字段名/方法名，★ **而纠正的依据都在模块自己身上**（★ 拒绝消息、返回注记、`status()` 的真实字段）。★ **含糊的系统会让审计者以为自己没错；★ 如实报告的系统让审计者能自我纠正。**
   ★★ 再配套一条（★ 已咬过两次）：★ **把一个探针从 `D:\_tmp` 装运进 `tests/` 时，★ 前导（prelude）也是它的一部分** —— ★ 若脚本"从第一个 `import` 开始复制"，★ **就砍掉了 `import` 上方定义的常量**（★ 实测两次 `ReferenceError: SELFTEST is not defined`）。★ **要么整份复制，要么补回那些常量。**
4. ★★★ **`--check` 必须【确定性且无副作用】。** ★ 一个校验命令**不许执行测试文件、不许写盘、不许有随机**。
   ★ 实测教训：★ 曾让 `generate-coverage-debt.mjs` **在派生计数时真跑十二个探针** ⇒ ★ **`regen-all --check` 于是执行测试文件** ⇒ ★ **一次 T1 报它失败，而直接连跑两次都 exit=0** —— ★ **一次由自己引入的抖动，发生在一个"以可靠为唯一职责"的门禁里**。★ 回退后同一步从 **1.8s 降到 0.15s**。
   ⇒ ★★ **要派生的东西只能来自【读源码/读文件】，不能来自【执行】**；★ 需要执行才能得到的数字，★ **就写在文档里，别塞进 `--check`**。

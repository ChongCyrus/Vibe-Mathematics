# vmu 10 · 整合包手册（Packs）

> ★ **轮 209 实测（仓内可执行对照已落地 ✓）**：`tests/accept-v5r-contrast-behaviour.test.mjs` 按 §5.1 的方法，**把 v5r 一侧读它的源码**（`v5r/DEFAULT_PARAMS` ＋ 键旁契约 ✓ —— **内容锚点、不用行号** ✓）、**把 vmu 一侧【驱动】起来问** ✓，逐对分类 ⇒ **当前 4 等价 / 1 未覆盖** ✓✓：`quorumCap` ✓／`verdictMaxRounds` ✓／`meetingWakeRetries` ✓／`meetingHardLimitMs` ✓ 为**等价**（★ `wakeRetries` 与 `hardLimitMs` 两键，**v5r 键旁的契约与我方实现逐字一致** ✓✓）；`reconsiderFloor` 为**未覆盖** ✗（vmu 的会议面无该模型 ✓，schema 的 `doc` 已如实写明 ✓）。★ **真机复跑仍待做** ✗，且它的两项前置已具名：**A 侧需"未装 vmu 插件且 CLI 同代"的 profile** ✗（`design/05-p3-ab-report.md` 已记：本环境不可得 ✓）、**B 侧必须【声明 pack】** ✗（2026-10-10 那次真机 A/B 的 B 侧 `packs: []` ⇒ **零机制得到验证** ✓）。
> 状态：**草案 v0.1**（"v5r 机制清单"待 B′ 侦察 §2/§5 合并后补全并逐条映射）
> 上位：`01-philosophy.md`（R15 可迁移 / D4 v5r 降为整合包 / D8 行为包含对照）、`02-architecture.md`（L4）
> 定义：**pack ＝ 一份完整「运行机制」的声明组合**（settings 默认 ＋ 中间件 ＋ 提示词包 ＋ 可选脚本 ＋ 迁移），**装在一个文件夹 `packs/<id>/` 里** ✓ —— ★★ **它不是代码分支** ✗，**但【目录形态确实是约定**]✓：**插件按目录名读两个纯数据文件**（`settings/defaults.json` ✓、`prompts/sections.json` ✓）—— ★ 因为清单里那些东西**必须在建内核【之前**]就位** ✓，**而插件顶层不能 await 动态 import** ✓ ⇒ **目录约定是【机制的载体**]，不是风格选择** ✓。★★★ **轮 1（D-03）**：**pack 是 L4（自成一档），不是中间件四形态里的 M4** —— M4 是**消费 vmu 已发布服务的 DSH 外部插件**，`kind:'plugin'` **不是总线 kind**（`bus.add` 具名拒 `VMU_MIDDLEWARE_KIND_UNSUPPORTED`）。pack 能携带的是 M1 规则（`rules`）、M2 模块（`middleware`）、L4 自己的槽位/轨道/别名/设置，以及**提示词管线策略**（`promptPolicies`）。

---

> ★★ **本章要教的 API（★ 轮 501 补 ✓，轮 1 增补）**：★ **`createPackLoader({ kernel, registry, allowOverride, clock, settingSource?, onPromptPolicy? })`** ✓ —— ★ **装载器工厂**（★ `plan()` 纯函数、`apply()` 冲突即具名拒、`unload()` 逐个回滚 ✓；`settingSource` ⇒ D-02 分层与逐键来源回显，`onPromptPolicy` ⇒ `promptPolicies` 的真消费者）；★ **`validatePack(manifest)`** ✓ —— ★ **清单形状校验**；★ **`collectPackSections(manifests)`** ✓ —— ★ **从若干清单里收集段**（★ 多个包共存时用 ✓）；★ **`composePromptPolicies(policies)`** ✓ —— ★ **把若干策略合成一个 `sectionPolicy`**（★ 接受 `{id,apply}` 条目或裸策略函数；空列表 ⇒ `null`，保持零机制 ✓）。★★ **另有 `compressText`／`decompressText`** ✓ —— ★ **文本压缩对**（★ 归档与传输用 ✓）。

## 1. pack 是什么 / 不是什么

> ★★★ **分界的总原则（内核零策略，D5）** ✓✓：**框架【只提供机制与判据】，领域常量【由 pack 定义】** ✓ —— **实例：角色槽位在内核、实例与权限在 pack（§5.2 ✓）；阶段机在内核、阶段列表在 pack（§5.2 ✓）；票数上限在内核（`vmu.meetings.quorumCap` ✓，契约 `min(cap, 参与人数)` ✓）、而**复议门槛的另两项常量在 pack**（见下 ✓）**）** ✓。**判据** ✓：**凡是【随领域／辖区／机构而变】的常量，本仓【不臆造】** ✓ —— **它要么由 pack 给，要么作为一个【已记录的缺口】留着** ✓。

| 是 | 不是 |
|---|---|
| 一套机制的**声明式装配**（可读、可审、可 diff） | ❌ 不是 fork 一份内核代码 |
| 可**同时并存/切换**（受冲突策略约束） | ❌ 不是"只能有一个预设" |
| 可**复用**（pack 可 require 另一个 pack） | ❌ 不是把机制写进 settings 的"大对象" |
| 有**版本与迁移** | ❌ 不是一堆散装中间件文件 |

---

## 2. 目录与清单规范（**按实际实现重写，2026-10-09 ✓**）

**一个 pack ＝ 一个文件夹** `packs/<id>/` ✓（★ **加载器优先 `<id>/index.js`** ✓，**仅在该 import 失败时回退 `<id>.js`** ✓ ⇒ **散装形态走的是兼容路径** ✗）。★★★ **而一个文件夹可以【没有清单**]✓：★ **只贡献文字的 pack 就是如此** ✓ —— ★ 插件按目录名读它的 `prompts/sections.json` ✓，**它没有机械可应用，所以没有 `PACK`** ✓，**而 `config.packs` 点名它时【它被记为已应用（`dataOnly: true` ＋ 它承载什么）**]✓、**不报错** ✓（★ 轮 442 之前它会报 `ERR_MODULE_NOT_FOUND` ✗ —— ★★ **"文本早已进了流水线，而报告说这个 pack 失败了"** ✓）。**文件夹里各有其位** ✓：
```
vibe-math-vmu/packs/<id>/index.js     # 有行为的 pack：清单在这里（`export const PACK = { … }`）或 star 再导出它 ✓
vibe-math-vmu/packs/<id>/settings/      # 该 pack 想让旋钮取什么值（纯数据 defaults.json ＋ 可选代码视图 defaults.js ✓）
> ★★★ **本卷的目录图是【通用形态**]，★ 而【具体某个 pack 的实际文件】在 `docs/27`** ✓（★ 轮 518 实测 ✓ —— 本项在台账上结转 12 轮 ✗）：
> - ★★ **本卷给的是【形态**]：`packs/<id>/prompts/`、`packs/<id>/middleware/` 等**泛化路径** ✓ ⇒ ★ **它的职责是"一个 pack 文件夹可以长成什么样"** ✓，★ **不是"v5r 现在有哪几个文件"** ✓；
> - ★★ **`docs/27` 才【枚举 v5r 的实际文件**]✓（★ `index.js`／`notices.js`／`middleware/`／`prompts/`／`settings/` ✓，★ 且由 `tests/audit-pack-face.test.mjs` **双向**守着：★ **目录里每个文件必须被点名、被点名的必须存在** ✓）。
> - ★★★ **实测四包顶层**（★ 轮 518 ✓）：★ **`example-data` 只有 `prompts`** ✓、**`institute-min` 与 `v3-core` 只有 `index.js`** ✓、**`v5r` 有五项** ✓ ⇒ ★★ **所以【包可以只有一个目录或一个文件**]✓ —— ★ 这正是"目录形态是约定、不是要求"的落点 ✓。
> ★★ **结论**：★ **两卷职责不同、不构成缺口** ✓ ⇒ ★ **把 `notices.js` 塞进本卷的【通用模板**]反而是错的** ✗（★ 它是 v5r 的实现细节，不是形态本身 ✓）。

vibe-math-vmu/packs/<id>/prompts/       # 提示词正文与段（纯数据 sections.json ✓ 或代码模块 ✓）
vibe-math-vmu/packs/<id>/middleware/    # 该 pack 在框架扩展点上加的策略 ✓
```

| 字段 | 形状 | 校验／行为 |
|---|---|---|
| `id` | kebab-case ✓ | **必填**；非法 ⇒ `id must be a kebab-case identifier` ✓ |
| `version` | semver 样 ✓ | 可选（`1.0.0…` ✓） |
| `packContractVersion` | 整数 ✓ | 可选；交给 `registry.checkPack` 比对公开契约版本 ✓ |
| `requires` | **`[{service, minVersion}]`**（**不是** map ✗） | 与**已发布服务**比对（`vmu.library`／`vmu.members`／`vmu.tasks`／`vmu.prompt`／`vmu.middleware`／`vmu.store`／`vmu.work`／`math_computation` ✓）；缺失/过旧 ⇒ 计划里**具名列出** ✓ |
| `codes` | `string[]` | 每个必须形如 **`VMU_PACK_<ID>_<REASON>`** ✓（R-d ✓） |
| `slots` | `[{id, capacity?}]` ✓ | kebab id＋整数容量 ✓ |
| `tracks` | `string[]` ✓ | 归档分轨名 ✓ |
| `rules` | `[{id, on, when, then, …}]` ✓ | **M1 规则体内联** ✓（`on` 必填 ✓） |
| `middleware` | `[{id, kind?, handler, …}]` ✓ | **追加到总线的条目** ✓。**轮 1（D-03）**：`kind` 只能是 `rules`／`module`，且非 `rules` **必须带 `handler` 函数**（总线不装载文件）；`script`／`plugin` ⇒ 计划期即报 `kind must be rules\|module`，`apply` 期由总线具名拒 `VMU_MIDDLEWARE_KIND_UNSUPPORTED` ✓（注意：`kind:'rules'` 的条目**不会**被编译 ⇒ 规则要放 `rules:` ✗✓） |
| `aliases` | `[{from, to}]` ✓ | 旧名 → 新名映射 ✓（D6 ✓） |
| `settings` | **键→值映射** ✓（如 `{'vmu.meetings.quorumCap': 3}` ✓） | 作为**最低的一层**在装载期施加 ✓（**D-02 唯一优先级**：`pack 默认 < 预设 Config < 会话 settings < 运行时 set`）。**轮 1 落地**：loader 收 `settingSource(key)` 后——更高层已拥有该键 ⇒ **该键被"遮蔽"（shadowed）**：高层的值胜出、**不覆盖**、不报错，并在 `status().settings` 里逐键给出 `{value, source, rank}`；**另一个 pack 拥有该键** ⇒ **具名拒** `VMU_PACK_CONFLICT`（O4：不静默覆盖）。未提供 `settingSource` 时保持旧的保守行为（任何重叠都具名拒，除非声明 `vmu.packs.allowKernelOverride`）✓ |
| `prompts` ✓（**轮 136 新增：正文轴**） | **`{ module, source, count, chars?, sourceSha256? }`** ✓ | **包里承载该 line 的【提示词正文】** ✓。`module` 指向**生成物**（`scripts/generate-pack-prompts.mjs` 从 `prompt-corpus-v5/prompt-corpus-v5.json` 生成 ✓，并在生成物内记下**语料的 sha256** ✓）；★ **它的消费者是 `plan()`** ✓ —— 装载计划里会出现一条 **`kind:'prompts'`** 的动作 ✓（**因此它不是"静默字段"** ✗，docs/10 下面那句警告对它不成立 ✓）；字段非法 ⇒ **`problems` 逐条点名** ✓（`prompts.module`／`prompts.source`／`prompts.count` ✓）。**"内容完全一致"由 `tests/vmu-pack-prompts.test.mjs` 逐条逐字证明** ✓✓（不是同义改写 ✗） |
| `promptPolicies` ✓（**轮 1：真消费**） | **`[{ id, apply({settings,turn}) -> {decisions,errors} }]`** ✓ | **提示词管线策略**（**不是总线条目**：它的钩子名 `prompt/assemble` 不在冻结集内 ✓）。**轮 1（D-03/P1）**：`apply()` 现在**真的消费**它——每个策略交给 loader 的 `onPromptPolicy` sink；**没有 sink ⇒ 具名拒 `VMU_PACK_PROMPT_POLICY_UNCONSUMED`**（`plan()` 的 `warnings` 会提前说明）；卸载时调用 sink 返回的 `dispose`（无残留）。入口侧用 `kernel/pack.js` 的 `composePromptPolicies()` 把收集到的策略合成**一个** `sectionPolicy` 交给回合循环 ✓。缺 `apply` ⇒ `problems` 点名 ✓ |

> **未知字段会被静默忽略** ✗✓（`validatePack` 不校验额外键 ✓）⇒ 写错字段名**不会报错**，只会"什么都没发生" ✗ —— 因此**以本表为准**，并在计划里核对 `actions` 是否出现你期望的条目 ✓。
> ★★★ **一个 pack 文件夹里可能有【两份清单**]，而且它们是【不同的对象**]✓（★ 实测 ✓）：**加载器消费的是 `loaded.PACK`** ✓（★ 插件装载点自己写着 ✓）—— 对 v5r 而言它是 `prompts/v5r-core.js` 导出的 `PACK`，`id = 'v5r-core'` ✓，**带 `slots`／`rules`／`codes`／`tracks`／`aliases`／`prompts`** ✓；**而文件夹自己那份记录叫 `V5R_PACK`** ✓，`id = 'v5r'` ✓，**带 `sectionModule`／`policyModule`／`noticeModule`／`phases`** ✓。
> ★★ **为什么改名而不合并** ✓：★ `export *` 星号再导出**不会**把名字带进本模块作用域 ✓，**而同一个模块里再写一个显式 `export const PACK` 会【静默替换**]星号带来的真清单** ✗ ⇒ **名册消失** ✓ ⇒ ★★ **教训留在了名字里** ✓（★ `packs/v5r/index.js` 的注释原文 ✓）。
> ★★★ **而 `validatePack` 按设计【忽略未知键**]✓ ⇒ **放在被装载清单上的、没人读的字段会【静默失效**]✗ ⇒ ★★ **那四个「本文件夹贡献了什么」的字段因此被 `describeV5rPack()` 读出来** ✓（★ `loadedManifestId` ＋ `carried` ✓）—— ★ **有一个读者，比看上去被消费而其实什么都不做要好** ✓。本轮之前它们正是后者 ✓。

---

## 3. 清单规范（**真实 JS 形态；照抄 `packs/institute-min/index.js` ✓**）

```js
// vibe-math-vmu/packs/my-institute/index.js
export const PACK = {
  id: 'my-institute',
  version: '1.0.0',
  packContractVersion: 1,
  requires: [{ service: 'vmu.tasks', minVersion: 1 }],      // ← 必须是数组，不是 map ✗
  codes: ['VMU_PACK_<ID>_<REASON>'],                          // ← 必须是 VMU_PACK_<ID>_<REASON> ✓（此处为占位形态）
  settings: { 'vmu.meetings.quorumCap': 3 },                // ← 键→值映射（一层）✓
  slots: [{ id: 'chair', capacity: 1 }, { id: 'member', capacity: 8 }],
  tracks: ['progress', 'rejected'],
  rules: [{                                                 // ← M1 规则（内联 when/then ✓）
    id: 'my-institute-no-vote-without-proof',
    kind: 'rules',
    on: ['tools/pre-execute'],
    when: { all: [{ tool: ['vibe_vmu_records'] }] },
    then: [{ deny: { code: 'VMU_PACK_<ID>_<REASON>', message: '示例规则' } }],
  }],
  middleware: [],                                           // ← 追加条目（不含 rules 体 ✗）
  aliases: [{ from: 'my_old_tool', to: 'vibe_vmu_records' }],
}
```

**装载规则（真实现 ✓）**
- **`requires` 不满足** ⇒ 计划里具名列出（`missing`／`tooOld`／契约版本 ✓）并**拒绝 apply** ✓；
- **冲突** ⇒ 三类：**已应用**、**设置重叠**（需 `vmu.packs.allowKernelOverride` ✓）、**总线 id 重复** ⇒ 一律**具名拒** `VMU_PACK_CONFLICT` ✓（O4：**不静默覆盖** ✓）；文档草案里的 `conflicts:` 字段**不被读取** ✗；
> ★ **接线现状（轮 1 更新）** ✓：`vmu.packs.allowKernelOverride`／`vmu.packs.allowOverride`／`vmu.packs.priority`／`vmu.pack.compression` 都是**每次调用从设置层真读** ✓（`settingsNow()`／`overrideAllowed()`／`priorityOf()`）。**轮 1 新增两个工厂接缝**：`settingSource(key)`（逐键来源层 ⇒ D-02 分层与 `status().settings.resolved`）与 `onPromptPolicy(policy)`（`promptPolicies` 的真消费者）。**未传接缝时行为与旧版一致**（保守拒重叠）✓。
- **`plan` 是纯报告** ✓（报告"会改什么"，连续两次不改变任何状态 ✓）⇒ 工具面 `vibe_vmu_pack {action:'plan'}` ✓；
- **`apply` 原子** ✓：中途失败 ⇒ 回滚已施加的动作 ✓（`unload` 用**禁用**而非删除总线条目 ⇒ "加过再禁用"在审计里可见 ✓）；
- **`unload`** ⇒ 逐项回滚设置/条目/别名，并报告**残留**（`residueFree` ✓）；**迁移**（`migrations`）**未被读取** ✗ ⇒ 不承诺回退迁移 ✓。

---

## 4. 优先级与冲突（与 04-§4 一致；**轮 1 = D-02 唯一优先级**）

```
pack 默认  <  预设 Config  <  会话 settings  <  运行时 set
```
- **中间件顺序**：`order` 升序 → 同 `order` 按 `id`；**pack 之间不隐式覆盖** ✗；
- **提示词**：作用域优先级（角色<阶段<成员<任务）＋ 后装载者可覆盖前者，但**必须声明**（不声明即冲突报错）；
- **设置（轮 1 落地）**：三处旧行为已收敛到**一条实现**（`createPackLoader.apply` + `settingSource`）——**更高层已拥有该键 ⇒ 遮蔽（高层胜、不覆盖、不报错）**；**同一层（另一个 pack／pack 默认层）⇒ `VMU_PACK_CONFLICT`**；显式 `vmu.packs.allowKernelOverride`／`vmu.packs.activeOverrides` 放行。`status().settings.resolved` 逐键回显 `{value, source, rank}`，`status().layers` 回显这条优先级。**禁止静默覆盖**（O4）；
- **冲突策略（自裁 O4）**：**默认"检测即报错，不静默覆盖"**；若确需覆盖 ⇒ pack 显式声明 `overrides: [<pack>:<id>]`（可审计、可 diff）。

### 4.1 v5r pack 的**声明层**（轮 2 立，轮 3 扩：只用 settings＋提示词包声明，不复制内核实现）

> 原则（D-08）：**能力进内核，策略进 pack**。轮 2/3 的新实现面（恢复/人类在环、通信/会议、数学作业、助手汇报、分级会议）把**机制**放进 `kernel/`；v5r 的**偏好**由本 pack 声明。**pack 里没有一行复制内核逻辑**，也没有让内核 import pack。

| 声明在哪 | 内容 | 为什么在这一层 |
|---|---|---|
| `packs/v5r/settings/defaults.json`（＋ `defaults.js` 同值的代码视图） | **轮 2**：`vmu.chat.admins/speakQuota/muteDefaultMs/freezeExemptAdmins`；`vmu.mailbox.urgentKinds/wakeBudget`；`vmu.panel.deviationPolicy`；`vmu.resume.projections/autoRecover/readBack`；`vmu.human.onTimeout/vetoLiftRoles/gatedActions`；`vmu.math.jobs.persist/recover`；`vmu.meetings.quoteDepthMax/quotesPerMessageMax/unansweredInDenominator` | 这些键**由内核原语真读**（chat/mailbox/panel/resume/human/mathjobs/meeting），值就是 v5r 这家所的偏好；插件在建内核**之前**把 `defaults.json` 折在**用户设置之下**（用户永远赢） |
| 同上（**轮 3**） | `vmu.meetings.tier='formal'` ＋ **`vmu.meetings.allowLight=false`**（GAP-MTG-02：v5r 只有完整协议 ⇒ **light 被具名拒** `VMU_MEETING_TIER_CONFLICT`，不是静默）；`vmu.resume.writeThrough=true`；`vmu.resume.projections` 扩到 **10 面**（＋`chat`/`panel`/`human`）；`vmu.ballot.reopenFloor=0`（GAP-MTG-10：v5r 的"门槛只升不降"⇒ 不额外加门槛）；**C-30 五键**：`vmu.paper.officeConsult='required'`／`On='finalize'`／`TimeoutMs=0`／`OnTimeout='hold'`／**`ExemptRoles=[]`**；**并发上限（轮 4 裁决：两个策略各归其名，不镜像）**：`vmu.math.maxParallel=1`（＝**数学作业/编译并发**；v5r 的 `leanJobsMaxParallel: 1`＝后台编译串行，`vibe-math-v5r.js:1118-1119`；两个读者 `kernel/mathjobs.js:41,249` 与 `kernel/mathtools.js:56,200,571-572` 都是**数学运行**的并发）＋ `vmu.limits.maxLiveMembers=3`（＝**成员唤醒并发**；v5r 的 `maxParallel: 3` 原义"每轮最多同时唤醒 3 名成员"，`:1081`/`:2073-2076`；读者 `kernel/index.js:221` 的 `liveMemberCapOf` ⇒ `declareSlots`）。**旧名（`math.jobs.maxParallel`）已从 schema 移除、不由 pack 声明**（曾由规范名派生 ⇒ 写了也是"无效果的声明"；`kernel/mathtools.js` 仍读它 ⇒ 该读点归 reader-b 退役，退役前它是"已接线但未声明"的读点，docs/04 可见）。 | 读者：`kernel/meetings.js` 的 `K.tier`/`K.allowLight`＋唯一判定点（`open()`/`truthWriteRefusal()`/`status()`）、`kernel/resume.js` 的 `cfg()`/`attachProjection`、`kernel/ballotbox.js` 的 `reopen()`、**`kernel/paper.js:45-49,111-114`（WIRED_KEY 3→8，`cfg()` 无条件读全五键）**、`kernel/mathjobs.js:41,249`、`kernel/mathtools.js:56,200,571-572`、`kernel/index.js:221`；分级会议／定稿咨询门／并发上限都是**机构策略**，内核只提供 tier＋谓词／判定点／读取点。 |
| `packs/v5r/prompts/v5r-core.js` 的清单 `settings`（**助手面**） | `vmu.report.enabled/reports/params/whoMayChange/requireReason` ＋ 会议机制默认 | **报告策略**在**被装载清单**上声明、由 `apply()` 施加。**不得**与 `defaults.json` 重复同一键：defaults 已折进内核设置 ⇒ 清单再声明同键会被 `applyPackSettings` 判为**重叠冲突**（O4） |
| `packs/v5r/prompts/**`（助手面） | 人设/汇报/会议等**文本** | 内容归 pack；管线只负责装配（docs/06） |
| `packs/v5r/middleware/prompt-switches.js` | 段开关**纯函数**（经 `sectionPolicy`） | 轮 1 已落；策略可读可测可替换 |

### 4.1.1 **面解析在 pack settings 之后**（最终口径，轮 4 定稿）

> ★★★ **一条通用规则，写给每一个想让自己的工具面被发布的 pack**：
> 1. **面解析发生在 pack settings 之后**。宿主适配器解析"哪些面被声明"用的是**内核的活设置视图**（`vibe-math-vmu.js:365-371`：`settings: kernel.settingsView()`），而清单的 `settings` 由 `applyPackSettings()` 在装载期写进**内核自己的设置** ⇒ 写入的内容对**下一次 install** 可见；入口在 packs 之后**会重新 install**（`vibe-math-vmu.js:636`，模块之后同理 `:682`）。
> 2. **清单声明即发布**。因此一个 pack 只要在**被装载清单**（`packs/<id>/index.js` 的 `PACK.settings`）里声明**该家族至少一个键**（如 `vmu.report.*` ⇒ `report` 面；`vmu.chat.*` ⇒ `chat` 面），它的工具面就会被发布——**不需要**把键放到 `defaults.json` 里去"提前点亮"。
> 3. **`defaults.json` 只在"需要构造前可见"时用**。它由插件在建内核**之前**折进设置层，因此它存在的理由是那些**在 `createKernel` 构造期就被读取**的值（构造期快照的键、宿主接缝参数等），以及"用户设置缺失时的兜底偏好"。**判断口径**：读点发生在构造期 ⇒ 值必须在构造前可见（`defaults.json`／用户 config）；读点发生在调用期（H0/H1 热改） ⇒ 清单声明就够了。
> 4. ★ **一条已被根因修掉的 workaround，不是规则**：轮 3 曾出现"想发布自己的面就得在 `defaults.json` 放一个该家族键"的现象——那是 F1 的**缺陷**（适配器拿到的是**部署的** settings，而清单 settings 在装载期写进**内核的** settings，两者不同源），轮 3 已由 core 从根因修掉（活视图 + 装载后重装，见 `vibe-math-vmu.js:360-367` 的注释："**No defaults.json workaround**"）。**任何文档/代码都不得再把它写成建议**。

**边界（诚实 ✗）**：① `vmu.human.gatedActions` 在本 pack 里**故意为空**（零机制：不声明就不闸任何动作；v5r 侧 office 审批的等价物是 `withOffice`，闸门清单待 v5r-reader-a 冻结动作名后由部署声明）；② `vmu.report.params` 的 v5r 白名单由助手面给出（见上表），不在本 pack 的 defaults 里重复；③ `vmu.chat.admins` 取**成员 id**（v5r 的院士 `acad`），若部署改用别的成员 id 需覆盖，或由宿主注入 `isAdmin` 接缝（slot 语义不在名单里）；④ **C-30（office 定稿咨询门）已闭合**：五个键由本 pack 声明 v5r 语义（`required`／`finalize`／`0`／`hold`／**`ExemptRoles=[]`**，**没有 default-allow 这一档**），判定点在 `kernel/paper.js`（WIRED_KEYS 3→8，未咨询即定稿 ⇒ 具名拒 `VMU_OFFICE_CONSULT_REQUIRED` ＋ 审计行 `what:'auth'` ＋ 总线事件 `paper/office-consult-required`，后者经 `declareTopic` 扩展点）。★ **豁免名单默认为空**（Lead F4 裁决）：本门存在的场景正是"office 自己定稿"，默认豁免 `office` 恰好把该场景豁免掉；"默认不豁免"与超时 `hold` 是同一条保守纪律；⑤ **C-45（忠实性缺陷强制弃权）不是可配置策略**：reader-b 把它落成内核谓词（`declareDefect`/`applyAbstention`，不忠实者的 0/1 被改写为 0.5 弃权并留耐久 marker）⇒ **pack 不提供、也不应提供关闭它的开关**（v5r 的 L2 option A 语义）；⑥ **并发上限：两个策略各归其名（轮 4 裁决，推翻"镜像成一个值"）**：`vmu.math.maxParallel=1`（数学作业/编译并发＝v5r 的 `leanJobsMaxParallel: 1`）＋ `vmu.limits.maxLiveMembers=3`（成员唤醒并发＝v5r 的 `maxParallel: 3` 原义）；旧名（`math.jobs.maxParallel`）**已从 schema 移除、不由 pack 声明**（`kernel/mathtools.js` 仍读它 ⇒ 读点归 reader-b 退役）。**镜像把两个不同策略变成一个数是错的**——见 `_handoff/vmu/pack-round4-report.md §G`（已裁决闭合）。
⑦ **`vmu.math.captureStdoutBytes` 故意不声明**：它是**机制旋钮**（stdout 捕获上限），schema 默认 `65536` 且 `kernel/mathjobs.js` 与 `kernel/lean.js:67,166` **共用同一个含义/常量**；写进 pack 只会多一份会漂移的副本 ⇒ 由 schema 默认 + 部署覆盖承担。
⑧ **`vmu.store.lock` 故意不声明**：schema 默认 `true` 且 `kernel/storepolicy.js:95` 真读 ⇒ v5r 想要的"恢复即独占"（reader-a 的 F18）**默认就成立**；声明它等于把"默认已成立的事"再写一遍。
⑨ **`vmu.meetings.speechExtendMs` 故意不声明**：v5r 的会议**没有"延长"机制**（D4："只有有界、没有可延长"）⇒ schema 默认 `0`（零机制）下，`extend` 请求被**具名拒**，**这正是 v5r 的忠实语义**；把它调成非 0 反而是新增制度。
⑩ **表决板的"箱界"不设设置键**：它由**构造参数**声明（`kernel/ballotbox.js:82` 的 `openMaxMs`，默认 0＝零机制）——界属于一个箱子的一生，做成设置键要么只在构造时读、要么会热改正在投票的箱子的界，两者都比"构造处显式声明"更差（reader-c 的实测理由，见 `docs/08 §25.9`）⇒ **本 pack 不声明任何 `vmu.ballot.open*` 键**（此前文档里出现的建议键名已撤回，避免留下"文档里有、schema 里没有"的悬空名）。
⑪ **v5r 提示词里的 `write_scopes` 字段：轮 5 起已被内核消费（advisory）**——`packs/v5r/prompts/v5r-blocks-a.js` 的 `task_create` 示例早就发 `write_scopes`，此前 vmu 侧**丢弃**它；现在 `tasks.create()` 收下并作为**只报告不阻断**的 advisory 落库（`status().writeScopeConflicts`／`list()` 行可见，重叠即报）。⇒ 该字段**不再是"未接"**，docs 与 pack 注释不必再标缺口。

### 4.2 v3-core 的**包私有键处置**（轮 5 裁决：**有读者者进 schema** ＋ 无读者者具名退役）

> 症状（轮 5 实测）：`packs/v3-core/index.js` 曾声明 5 个**包私有键（前缀 `vmu.v3.`）**，它们**都不在 `settings/schema.js`** ⇒ 包内模块能经 `setting()` 读到，但 `vibe_vmu_set` 会以"未声明键"**具名拒**；更糟的是其中 **3 个全仓零读者**（唯一出现处就是自己的声明）。**"能读但设置面拒绝"与"声明了没人读"两种状态都不许留。**

**① 选定的分支：两个有读者的键＝进 schema（`settings/schema.js:85-86`，与 v5r 的 `vmu.records.requireSettledRecords` 同待遇）**

| 键 | 读者 | 为什么进 schema |
|---|---|---|
| `vmu.v3.verifierCount`（natural，def 3，H1，office） | `packs/v3-core/index.js:80` 的 quorum 中间件 | 它**是真被读的键**，而"能读、却永远不能在运行期 `set`"是本系统里最坏的半边不对称：`vibe_vmu_set` 会**具名拒**它，部署只能改 config/清单（装载期那一层）。声明进 schema 后两条路都通，且与"包私有键也进 schema"的既有先例一致。 |
| `vmu.v3.mode`（enum `auto｜manual`，def `auto`，H1，office） | `packs/v3-core/index.js:105` 的 manual-gate 中间件 | 同上。 |

**② 三个**无读者**的键：移除声明 + 具名登记为扩展点**（**故意不写 `vmu.` 前缀**：它们不再是键，只是 v3 的参数名；写全名会让"文档里有、schema 里没有"的门禁再红一次）

| v3 参数名 | 处置 | 理由 |
|---|---|---|
| `solverMaxRounds`（v3 值 3） | **移除声明 + 具名登记为扩展点** | **全仓零读者**；v3 的 solver 轮次机制本框架尚不具备 ⇒ 保留 v3 值作为**设计意图**记录在此，不再假装可配置 |
| `planningHorizon`（v3 值 3） | **移除声明 + 具名登记为扩展点** | 同上（v3 的 planner/scheduler 未实现） |
| `promoteValueThreshold`（v3 值 0.7） | **移除声明 + 具名登记为扩展点** | 同上（v3 的晋升阈值机制未实现） |

### 4.3 心跳 / 周期的**声明点**（pack 侧，轮 5：core 判定后的最终口径）

> **结论（core 判定）**：**不需要新键**，但 pack 侧有**一个既有声明点**；而**内核不自动启用心跳**。
> 1. **声明点存在且被真读**：`vmu.schedule.triggers`（声明式触发器种子）由 `kernel/scheduler.js:594-607` 在构造时逐条转成 `api.every`／`api.once`；坏种子**计数 + 报 `schedule/seed-rejected`**（不静默）。策略面：`vmu.schedule.triggerVia`（`none｜middleware｜script`，默认 `none`＝只报告）、`timeSource`（默认 `tick-only`）、`coalesceMissed`、`overdueGraceMs`、`maxPending`（`settings/schema.js:508-515`）。
> 2. ★ **声明 ≠ 会跑**：内核**不会**替 pack 自动 `arm()`（自启会让"完全没声明的部署"也跑定时器 ⇒ 违反零机制）。要周期推进，pack／中间件必须**自己 `arm()` 并按自己的时钟 `tick()`**（或 `timeSource:'host-timer'` ＋ 注入 timer 接缝）；否则种子只是被登记，`status()` 自曝其状态。core 已把这条"调度的边界"写进 `docs/03`，并给出**改判条件**：若真机验收要求"声明即心跳"，入口加一行 `arm()` 且必须自曝 `status().scheduler.armed`。

**可复制片段**（给**需要**周期推进的 pack；放进 `PACK.settings` 或 `settings/defaults.json`）：
```js
'vmu.schedule.triggers': [
  { kind: 'every', intervalMs: /* 周期 */, what: 'heartbeat', payload: { phase: 'heartbeat' }, by: 'settings' },
],
'vmu.schedule.triggerVia': 'none',      // 与 schema 默认一致：报告不驱动（R1：框架只推荐）
'vmu.schedule.coalesceMissed': true,    // 漏跑合并，但仍报 missed（不静默）
```
配套（pack 侧）：`scheduler.arm()` ＋ 自己的 `tick()`（例如在回合边界或宿主定时器上推进）。

★ **v5r 的结论：不声明心跳**（最终口径）。理由两条：
1. **v5r 没有可核的"心跳周期"出厂值**——`activityTimeoutMs`／`recoverStallMs` 是**论文阶段的静止阈值**（判定"没进展"），不是周期；写一个 900000 就是**臆造常量**（本仓明令禁止）。
2. v5r 的静止提示在原文里是**框架侧推荐**（R1："only RECOMMENDS"），而 vmu 把"是否周期推进"交给了**部署**（声明种子 + 自己 arm/tick）⇒ 保持零机制：无声明 ⇒ 一个定时器都不跑。
⇒ `packs/v5r/settings/defaults.json` **不新增任何 `vmu.schedule.*` 键**；需要心跳的部署照上面的片段声明（并在自己的入口 arm/tick）。

**③ 判据（可复核）**：`grep -rn "vmu.v3." vibe-math-vmu` 只命中 **`packs/v3-core/index.js`**（两个键的声明 + 两处读取）与 **`settings/schema.js:85-86`**（两个键的声明）；**没有第三个地方**。文档里不再出现"点了名却不在 schema/planned"的全名形态（三个退役参数名不带前缀）。

### 4.4 目标 4 终判的 **pack 侧结论**（轮 6，主交付 `_handoff/vmu/09-goal4-verdict.md`）

> **总判定**：**v5r pack 与梳理清单在机制面一致**——125 行里**没有一行是"框架与 pack 都缺"**（C-30／C-45／C-52 已在 R3/R4 闭合）。准确形状是：**① pack 真声明 47 个 `vmu.*` 键**（＋1 条 M1 规则、1 个 prompt 策略、4 个 prompt 模块、3 slots／5 tracks）**直接承载约 35 行**；**② 其余约 89 行是"框架具备、pack 未声明"**（＝取框架默认值或默认不启用，**不是缺口**）；**③ 真缺口 1 条子项 ＋ 1 个孤儿键**。

| 项 | 事实 | 归属 / 判据 |
|---|---|---|
| **孤儿键（`vmu.meetings.` ＋ `reconsiderFloor`）** | 同时出现在 `settings/schema.js` 与 v5r 清单 `packs/v5r/prompts/v5r-core.js:78`，**全仓无任何读者**；真正生效的是 **`vmu.ballot.reopenFloor`**（读者 `kernel/ballotbox.js:22,41,137`） | **vmu-core（schema）＋ vmu-assistant（清单）＋ reader-c（docs/08 的叙述）**：清单与 docs 先改述为 `vmu.ballot.reopenFloor`，core 再删 schema 行（**顺序**：清单/docs 先清，否则门禁把"点名"当"读取"而红） |
| **M-A04 子项：论文轮次上限** → **已闭合（轮 6 收尾）** | core 已落 `vmu.paper.maxRounds`（schema）＋ 读点（`kernel/paper.js:41,135` 的 `revise()`，超限**具名拒** `VMU_PAPER_ROUNDS_EXCEEDED`）；本 pack 随即声明 **`vmu.paper.maxRounds=3`**（＝v5r 的 `PAPER_MAX_ROUNDS`，defaults.json/js 同值） | ✅ 判据：defaults 探针 `undeclared=0`（35 键）；`vmu-paper` 37/0、`vmu-pack` 53/0 |
| **4 处矩阵键名是 v1 转述** | `GRANTABLE_COMMANDS/GRANT_SCOPES`→`vmu.grant.*`；`vmu.lean.*`→`vmu.math.*`；`chatDigestMax/Ms`→`vmu.mailbox.digestMax/digestWindowMs`（**默认 12／45000 ＝ v5r 值**）；`SECRETARY_ENTRY_MAX`/`min_votes`/`motionSecondsRequired`→`vmu.minutes.verbatimCapBytes`/`vmu.ballot.minVotes`/`vmu.motions.secondThreshold` | **vmu-verify**：矩阵 pack 列按真名改判（**不是缺口**） |

★ **pack 侧状态**：**48 个键**全部有真读者（41 个内核读者 ＋ 5 个由本 pack 的 `middleware/prompt-switches.js` 读 ＋ 1 个孤儿在别人名下 ＋ **新增的 `vmu.paper.maxRounds`**），`vmu-pack-defaults-vs-schema.mjs` 的 `undeclared=0`。

### 4.5 **保真度**：哪些声明是"改行为"，哪些只是"复述默认"（轮 7，主交付 `_handoff/vmu/11-pack-fidelity.md`）

> 口径（`docs/01 R1`：**一代人的行为由它的 PACK 承载**）：**"框架能表达" ≠ "这个 preset 会那样跑"**。所以逐个核 **v5r 当年到底怎么跑**（权威源＝`vibe-math-v5r/vibe-math-v5r.js` 的 `DEFAULT_PARAMS` `:1062-1183`），再看 pack 的声明**是否真的改变了行为**。

**本轮修掉的 3 处不保真**（都有 v5r 出处）：

| 键 | 改动 | v5r 出处 | 为什么 |
|---|---|---|---|
| `vmu.turn.selfCheck` | **true → false** | `:1122` `resourceSelfCheck: false`（"false ⇒ 提示词一字不改"） | 原先声明 `true` ⇒ v5r preset 会注入一段 **v5r 从不发**的【资源】段（门控在 `middleware/prompt-switches.js:27`） |
| `vmu.control.idleAfterMs` | **新增 120000** | `:1082` `activityTimeoutMs: 120000` | 框架默认 `0`＝不定义空闲 ⇒ 不声明则 v5r 的静止检测**根本不会发生** |
| `vmu.limits.maxLiveMembers` | **删除**（原 3） | `:1130` `maxLiveChildren: 0`＝**不设上限** | v5r 的 `maxParallel: 3`（`:1081`）是**并发**维度，框架已在 `vmu.limits.maxParallel`/`vmu.turn.maxParallel` 默认为 3 ⇒ 把 3 当成"在活上限"会让本所拒掉 v5r 允许的第 4 名成员 |

**一个有用的区分**：pack 的 48 个键里，**真正改变行为的约 8–10 个**（上表 3 个 ＋ `vmu.paper.maxRounds`／`allowLight`／`math.jobs.persist`／`chat.admins`／`resume.projections`／`report.reports` 等）；其余是**"复述框架默认"**——它们不是错误（作为机构立场可读），但**不能拿来当"v5r 行为已复现"的证据**。

**③ 具名（v5r 有、vmu 无键，或有意分歧）**：`compactThreshold/compactAfterRounds`（`:1078/1079`）、`finalPaper/paperFormat/paperLanguage/paperCompilePdf`（`:1163-1166`）、`paperEditor:'academician'`（`:1167`，而 `vmu.paper.finalizer` 的值域只有 `['editor','contributor','any']`）、`maxTempPerMember`（`:1075`）、`memberMayRejectAssign`（`:1066`）；**有意分歧**：`stallAutoMeetingMs`（`:1083`，v5r 静止即自动开会；vmu 的 `idleAction` 默认 `'notice'`＝只提示，R1）。

### 4.6 **`paperEditor` 的静默回落**：一个"声明了没生效"的真缺陷（轮 8，优先项）

**缺陷（已实测复现）**：`settings/schema.js` 把 `vmu.paper.finalizer` 声明成 `type:'string'`，而 `kernel/paper.js:104-107` 对域外值**静默回落**成 `'editor'`。探针 `D:\_tmp\vmu-finalizer-fallback-probe.mjs`（仓库外一次性·实测）：
```
vmu.paper.finalizer = 'academician'（v5r :1167 的值）
→ finalize 被拒：VMU_NOT_PERMITTED "only the editor (acad) may finalise, not someone-else"
（若域外值被具名拒，应看到 VMU_INVALID_ARGUMENT 并列出 ['editor','contributor','any']）
```
⇒ **声明 `'academician'` 既没生效、也没报错**——正是"声明了没生效"这一类。

**为什么不用"把 `academician` 加进值域"**：v5r 的 `paperEditor` 命名的是**机构角色**（院士），而本键是**权限规则**（editor／contributor／any）。让内核认识 "academician" 会**违反 D5**（内核永不学习机构角色名——角色是不透明 slot）。

**修法（vmu-core 已落，轮 9 复核）**：
1. `settings/schema.js`：`vmu.paper.finalizer` 已改成闭集 `type:'enum', domain:['editor','contributor','any']` ⇒ 运行期 `vibe_vmu_set` 域外值**具名拒**；
2. `kernel/paper.js:114-115`：回落已改成**具名拒**——`refuse('VMU_INVALID_ARGUMENT', 'vmu.paper.finalizer must be one of editor|contributor|any: …', …, { declared: FINALIZERS.slice(), value })` ⇒ 连 **pack data 层**注入的域外值也拦得住。
   实测（`node scripts/audit-pack-value-domain.mjs` §2）：域外值 ⇒ **`VMU_INVALID_ARGUMENT` 且回执里列出 `declared:['editor','contributor','any']`**，**静默回落已消除**。

**v5r 的等价表达（pack 侧结论）**：`finalizer='editor'`（**框架默认**，无需声明）＋ **创建时把 paper 的 `editor` 设为主持人**（v5r 的"院士终稿"＝院士就是 editor）。⇒ **本 pack 不声明任何 `finalizer`**；值域门禁（见 §4.7）证：pack 声明的 130 处值**全在各自域内**，且未声明 `finalizer`。

### 4.7 **值域门禁**（轮 9：常驻，`scripts/audit-pack-value-domain.mjs`）

> 这是 §4.6 那类"**声明了没生效**"的**通用守卫**（D-05：门禁工具在仓内，干净 clone 可复现）。一条命令：
> ```bash
> node scripts/audit-pack-value-domain.mjs            # 常驻门禁
> node scripts/audit-pack-value-domain.mjs --selftest # 只跑"门禁非空洞"自探针
> ```
> **三段**：**§1 静态**——从**真模块**（各 pack 的 `index.js` 导出 ＋ `settings/defaults.json`）读全部声明，逐个对照 `settings/schema.js` 的 `enum` 域；**§2 实测**——对"schema 是自由 `string`、但读者有闭集"的键（当前＝`vmu.paper.finalizer` → `kernel/paper.js` 的 `FINALIZERS`）**注入一个域外值**，要求它**具名拒**而不是静默降级；**§3 自探针**——把种下的域外值喂给检查器，**必须报红**（否则门禁本身空洞，本次判失败），并验证**域内值不会误报**。
> 当前读数：**5 passed / 0 failed**（`enum` 键 108 个；闭集读者键 1 个）。

★ **门禁上岗第一天就抓到第二个真实例**（并已修）：`packs/v3-core/index.js` 曾声明
`'vmu.meetings.quorumRule': 'majority'`，而 schema 的域是 `['m-unanimous','all-unanimous']` ⇒ **域外**。后果与 `finalizer` 同类：`vibe_vmu_set` 会具名拒它，但**pack 值绕过设置边界**；而 `ballot.js` 的默认 tally 把 `quorumRule` 当**上下文标签**记录（默认一致性口径），**并不按 "majority" 聚合** ⇒ 这条声明做不到它写的事。**已改为 `'m-unanimous'`**。

**"真多数聚合"的裁定（Lead，轮 9）：不是缺口，是【能力】＋改判条件。** 框架**已经提供可插拔接缝**（R1：`createBallot` 的 `tally` 谓词），缺的只是**某个具体聚合实现**——而"某机构用什么聚合"按哲学**本就该由 pack／中间件提供，不进内核**。⇒ `m-unanimous` 下的计票**自洽**，v3 的"独立判定再聚合"以 `m-unanimous` 近似即可；真要 `majority`，由 pack 注入 `tally`（≈60 行＋断言）单独排期。★ **不要把 `quorumRule` 做成"聚合算法注册表"**——那是另一个设计问题。

★ **一条通用教训（Lead 已转 verify 写进 `docs/11`）**：**断言所选观测量必须在被测的两档之间真的不同**——否则它是**语义级的空过**，而语法级门禁（如"集合是否可能为空"）**看不见**。轮 9 的 E-17(乙) 正是实例：它用 `vmu.meetings.quorumRule` 观测"顺序决定重叠值"，而两个机构**都声明 `'m-unanimous'`** ⇒ `!==` 永不成立（它以前能过，只因 v3-core 当时写了**域外值** `'majority'`）。修法＝改用两包**确实分歧**的 `vmu.meetings.verdictMaxRounds`（v3-core 5／institute-min 3）。

### 4.8 轮 10：**8 键已声明（B1–B4）／ `control/idle` 仍具名保留**

> **纪律**：**读者未落地不写默认值**（写了就是"声明了没人读"）。本轮 core（task-74）落了 8 个键＋真读者后，我**逐键核对"键在 schema ∧ 有真读者 ∧ 值在域内"**（探针 `pack-readiness`）再声明 ⇒ **8/8 已落**；`control/idle` 钩子**仍未登记**（`grep -rn "control/idle" kernel/` → 0）⇒ **具名保留**。

| 已声明（v5r 值，出处） | 键 | **真读者** | 类别 |
|---|---|---|---|
| 上下文压缩 **66**／**8**（`:1078/1079`） | `vmu.prompt.compactThreshold`／`compactAfterRounds` | `kernel/prompt/index.js:118,121`／`:125,128` | **复述默认**（schema def 也是 66／8，取自 v5r） |
| 终稿交付 **true**／**'both'**／**'zh'**／**true**（`:1163-1166`） | `vmu.paper.finalPaper`／`format`／`language`／`compilePdf` | `kernel/paper.js:58-61`（WIRED_KEYS）＋`:164-177` | **复述默认**（def 同 v5r） |
| 临时工编制 **3**（`:1075`） | `vmu.members.maxTempPerMember` | `kernel/recruit.js:52,173`（`accept()`） | **复述默认**（def 3） |
| 拒派权 **true**（`:1066`） | `vmu.tasks.memberMayRejectAssign` | `kernel/tasks.js:111`（`objectAssign()`）＋`kernel/index.js:667` | **复述默认**（def true） |

★ **诚实口径（与 `vmu.math.maxParallel` 同一条纪律）**：这 8 个键的**框架默认值都是从 v5r 抄的**（schema doc 里逐条引了 v5r 的 `file:line`）⇒ 它们是**"复述默认"**，**可读、可调**，但**不得**当作"v5r 行为已复现"的证据。★ 其中 `vmu.tasks.memberMayRejectAssign` 有一处**刻意的更严**：`false` 时 vmu **具名拒**，而 v5r 是**静默忽略该字段**（schema doc 明写）——分歧方向是安全侧，已登记。

★ **`control/idle` 仍具名保留**：`kernel/loader.js` 按登记表校验 `on`，**未登记钩子⇒具名拒**，整个 pack 的 apply 都会失败 ⇒ 先写＝把 pack 弄坏。模块内容已**暂存**（**仓库外临时目录，实测暂存用**：`<临时目录>/staged-stall-meeting.js`，含纯函数 `stallDecision()`：**阈值不硬编码**，用 `3 × vmu.control.idleAfterMs`＝v5r 的 360000），钩子一落即可复制进仓并配"钩子 emit ⇒ handler 被调 ⇒ 会议真被开"的探针。

### 4.9 轮 10 追加：**投影面名不一致**（`ballots` → `ballotbox`）——"声明了一个不存在的面"

> **缺陷（reader-a 在真装配上实测）**：pack 的 `vmu.resume.projections` 写 **`'ballots'`**，而**投影适配表与耐久 store 键都是 `ballotbox`**（`kernel/index.js:883`、`kernel/store.js:75`）⇒ 结果是 `notAttached:[{face:'ballots', reason:'no adapter in this assembly'}]`：**开两个真票箱、`shutdown()` 之后耐久键仍是种子**——票箱**从未被投影**。这正是"声明了没生效"那一类。
> **修法（Lead 裁决，pack 侧一行）**：声明改成适配表自己的名字 **`ballotbox`**（"一个键一个语义"）；core 同时保留**具名容忍**（`kernel/index.js:965` 的 `PROJECTION_ALIASES = { ballots: 'ballotbox' }`，经 `status().projections.viaAlias` **具名回显**）⇒ 老部署写旧拼写会**被告知**，而不是悄悄不挂。
> **实测（`<临时目录>/projection-packlist-probe.mjs`，仓库外一次性·实测）**：改后 pack 的 10 面里 `attached` 含 **`ballotbox`**、**`viaAlias: []`**（**直接**声明，不再走别名）；reader-a 的自适应探针 **12f 已翻正为 `CLOSED`**："`ballotbox` is attached and its envelope carries BOTH boxes across the shutdown"。
> ★ **同一类里另有两处具名项（非 pack，已报 core）**：① `notAttached:[{face:'members', reason:'attachProjection needs a target object'}]`——pack 声明 `members` 但**未挂上**（**具名**报告，非静默）；② `PROJECTION_KEYS`（`kernel/resume.js:59`）仍写 **`ballots`**，与适配表/store 键的 `ballotbox` 不一致 ⇒ `status().projections.known`/`unwiredKnown` 会报一个**没人能挂的名字**。

### 4.10 轮 10 追加：**`control/idle` 的消费侧缺口**——M2 能"判定"但**无法"行动"**

> `control/idle` 已由 core 登记并可接线（边沿触发：越过 `vmu.control.idleAfterMs` 的那一次发一次；`beat()` 是轮询点；**零机制**＝未声明 `idleAfterMs` 则什么都不发）。但"静止 ⇒ 开会"要**调会议面**，而 **M2 中间件够不到任何服务**：
> - 实测（`<临时目录>/stall-m2-feasibility.mjs`，仓库外一次性·实测）：一个声明 `on:['control/idle']` 的 M2 模块**确实被调用**（STEP 1 ✓），但它收到的 `api` 只有 **`{dryRun, hook, kernel:{read}, log, setting, traceId}`**，`ctx` 只有 `{member, role, phase}`，**没有服务、也没有总线句柄** ⇒ **STEP 3（会议真被开）做不到**。
> - ⇒ **不落半接线的模块**（否则正是"声明了没生效"）。模块与纯函数 `stallDecision()`（阈值 `3 × idleAfterMs`＝v5r 的 360000，**不硬编码**）已就绪，**只差一条具名的服务访问缝**。候选（推荐 a）：
>   a. **给 M2 加能力门控的服务访问缝**（如 `api.services.get('vmu.meetings')`，由声明 `trigger-workflow` 能力解锁；服务未发布 ⇒ **具名拒**）；
>   b. 让 `control/idle` 变成**可决策**（handler 返回 `{convene:{topic}}`，内核代为转交）——但这会把机构策略塞进控制面，与 R1 相冲；
>   c. 在 M1 规则的动作集里加 `convene`——同 b 的顾虑。
>
> ★ **同轮另一件（v5r 的"异议广播给 voters"）· 已闭合**：v5r 的 `memberMayRejectAssign` 不只记录异议，还**广播给投票人**（原文"任务仍会执行"）；vmu 曾只记录并如实报 `broadcast:{attempted:false, hook:'task/assign-objected'}`（**没有那个钩子**）。按 Lead 指示**先登记**（`kernel/bus.js` 的 `HOOK_REGISTRY`：`task/assign-objected`，`failure:'open'`、不可阻断，producer `kernel/tasks.js`），core 随即在 `kernel/tasks.js:321` **接上 emit** ⇒ **实测闭合**（`<临时目录>/assign-objected-probe.mjs`，仓库外一次性·实测）：`objectAssign()` 回执 `broadcast:{attempted:true, emitted:true, audience:'the middleware decides the audience (v5r broadcast to voters; this face has no roster, so it invents no recipient list)'}`，探针监听器**观测到 1 次 emit**（载荷 `{at,id,by,why,state,owner}`）⇒ **听众由中间件决定**（R1）。两条钩子门禁（`audit-hook-coverage`、`scripts/audit-hook-emit-classification.mjs`）随之**回绿**（4/0、7/0）。
> ★ **消费侧缝已落（core 的 `api.services`）＋ pack 侧已接线 · 已闭合**：
> - **缝（core 落）**：`kernel/loader.js` 的 `API_KEYS` 加 `services`；`api.services.get(name)`／`names()` **能力门控**（声明 `trigger-workflow` 才可；未声明 ⇒ `VMU_NOT_PERMITTED`；未发布 ⇒ `VMU_NO_SUCH_OBJECT` 并列出已发布清单）——**没有静默 null**。
> - **接线（本 pack 落）**：新增 `packs/v5r/middleware/stall-meeting.js`（纯函数 `stallDecision()`：阈值＝**`3 × vmu.control.idleAfterMs`**＝v5r 的 **360000**（`:1082/:1083`），**不硬编码**；M2 模块 `V5R_STALL_MEETING`：`capabilities:['trigger-workflow','record']`、`hooks:{'control/idle': …}` ⇒ `api.services.get('vmu.meetings').open({kind:'stall'})`）；清单 `prompts/v5r-core.js` 新增 **module 形状**的条目 `{id:'v5r.stall-meeting', kind:'module', on:['control/idle'], failure:'open', capabilities:[…], module: V5R_STALL_MEETING}`；`docs/27` 已点名该文件。
> - ★ **框架侧一处必要修正（`kernel/pack.js`，本 pack 的卷）**：清单中间件过去**一律直接 `bus.add`**（只认 inline `handler`，且 handler 看不到 `api`）⇒ module 形状的条目既过不了校验也拿不到服务缝。现改为：**inline `handler` 走原路；module 形状（`module:`／`file:`）经 `kernel/loader.js` 的 `toBusEntries()`**（校验 apiVersion/capabilities/hooks ＋ 附加 `api`）；无 loader 时**具名拒** `VMU_ENGINE_UNAVAILABLE`；`validatePack` 同步接受两种形状。
> - **三步探针（`<临时目录>/stall-three-step.mjs`，仓库外一次性·实测，11/0 exit 0）**：**STEP 1** 真控制面报出**空闲边沿**（`emitted:true`，同一 episode **不重发**）；**STEP 2** 模块成为 `control/idle` 上**恰一条**总线条目且带 `trigger-workflow`；**STEP 3** `vmu.meetings.open()` **真被调用**（调用形状 `kind:'stall'`）；**反向**：130000ms < 360000ms **什么也不开**。
>
> ★ **同轮另一件（v5r 的"异议广播给 voters"）· 已闭合**：v5r 的 `memberMayRejectAssign` 不只记录异议，还**广播给投票人**（原文"任务仍会执行"）；vmu 曾只记录并如实报 `broadcast:{attempted:false, hook:'task/assign-objected'}`（**没有那个钩子**）。按 Lead 指示**先登记**（`kernel/bus.js` 的 `HOOK_REGISTRY`：`task/assign-objected`，`failure:'open'`、不可阻断，producer `kernel/tasks.js`），core 随即在 `kernel/tasks.js:321` **接上 emit** ⇒ **实测闭合**（`<临时目录>/assign-objected-probe.mjs`，仓库外一次性·实测）：`objectAssign()` 回执 `broadcast:{attempted:true, emitted:true, audience:'the middleware decides the audience (v5r broadcast to voters; this face has no roster, so it invents no recipient list)'}`，探针监听器**观测到 1 次 emit**（载荷 `{at,id,by,why,state,owner}`）⇒ **听众由中间件决定**（R1）。两条钩子门禁（`audit-hook-coverage`、`scripts/audit-hook-emit-classification.mjs`）随之**回绿**（4/0、7/0）。

---

## 5. v5r-pack：行为包含对照方案（D8）

> **行为级 A/B 已实跑一轮（2026-10-10 ✓✓）**：**同一任务、同一模型、同一主机、同一 token 上限**，仅换 `--preset`（`vibe-math-v5r` ↔ `vibe-math-vmu`），两侧各自全新工作区 ✓；报告与逐字转写见**仓库外** `_oneoff/vmu/design/05-p3-ab-report.md` ＋ `_oneoff/vmu/live/2026-10-10/p3-ab/` ✓。**要点**：① 两侧**都"不能做就具名拒绝、绝不编造"** ✓（v5r `V5_MEMBER_NOT_FOUND`／`V5_INVALID_ARGUMENT` 三条 ✓；vmu `VMU_INVALID_ARGUMENT` 两条 ✓）；② **vmu 出货默认在真机上只有 5 个工具**（无 pack／control ⇒ **零机制得证** ✓✓）、`packs: []`、总线可观测 ✓；③ **有意改进**：vmu 的拒绝带**可执行提示**（"declare it in settings/schema.js first" ✓）＋ 工具面小 ≈3.4×（前测 ✓）＋ 中间件/主体可观测 ✓；④ **诚实缺陷/未覆盖 ✗**：核心**无表决面**（需 pack／模块 ✓，即"逐域工具面"待办 ✓）、键的**发现性**弱（模型合理猜了一个**并不存在**的设置键 —— 形如 `vmu.ballot.*` —— 拿到了**正确的具名拒**，但这说明"有哪些键"要靠 docs/04 或 `status().settings` 来确认 ✓，carrier 列已缓解 ✓）、**v5r 整套研究所流程在出货默认下不复现**（这正是包存在的理由 ✓）、**M3 真机仍为 NON-RESULT** ✗；⑤ **混杂因素已声明** ✗：A 侧 profile 同时装了 vmu 插件 ⇒ ①② 的对照受限 ⚠️，**干净复跑（无插件 profile）登记为待办** ✓。**干净复跑已尝试、受阻并据实记录** ✗✓：本机有 vmu 之前版本的包装载（`hubtest-fresh`＝`2.8.1`／`hubtest2`＝`2.8.4` ✓，当前开发线 `2.8.5` ✓），但它们的 **DSH CLI 与隔离装置不兼容**（实测 `error: unknown option '--port'` ✗），而隔离 home 里的两个 profile 都带当前包 ✗ ⇒ **"vmu-free 的 A 侧"在本会话环境内不可得** ✗（属环境准备 ✓）；因此 A/B 的 ①② 结论**受限** ⚠️，③ 与"工具面/拒绝文案"比较**不受影响** ✓。**本报告不声称行为等价** ✗（样本 1 轮/侧 ✓，结论限于"形状与可观测差异" ✓）。

> **现状（2026-10-09 ✓✗）**：**`packs/v5r/prompts/v5r-core.js` 已存在并可装载** ✓✓ —— 它携带 v5r 的机构语义：席位（`chair`／`member`／`temp` ✓）、`m-unanimous` 等机制默认（作为**设置层** ✓，冲突即拒 O4 ✓）、`Progress` 五轨 ✓、**一条打在真实工具上的 M1 规则** ✓（`vibe_vmu_script` ⇒ 拒绝临时脚本 ✓）、**一个随包携带的 M2 代码模块** ✓（`vibe_vmu_records append` ⇒ 要求已定稿 ✓）、以及旧工具名到**已发布服务**的别名 ✓。
> **它不是什么（诚实 ✗）**：**不是**行为等价证明 ✓ —— ★★ **而"行为级 A/B 未做"这句话【已经过期**]✓（轮 438／444／446 三次改正同一处措辞 ✓）。★ **装配级对照【已做且双向**]✓：**正向**我们复现原版固定行 **706/823（86%）**、**只看散文 632/642（98%）** ✓；**反向**我方 **398/1478** 行出现在原版真实投递的提示里 **（27%）** ✓ ⇒ **`docs/11` 的 P3 已是 `PASS`** ✓；★ **仍缺的是【实跑的双 preset 对照**]✗（★ 那需要场景夹具 ✓ ＋ 两条具名前置，见本节下方两段 ✓）⇒ ★★ **把"已做的对照"与"未做的实跑"分开说，才不会让做过的事看起来还在待办** ✓。`institute-min` 仍保留为**形状示例**（它的规则指向 v5 时代工具名 ⇒ **不会触发** ✗）。
> **给 pack 作者的两条硬知识**（本轮用真包换来的 ✓✗）：① **`vmu.members` 只在你声明席位后才发布** ⇒ 带来席位的包**不得**把它列进 `requires`（鸡生蛋 ✓）；② **别名目标必须是"已发布服务"**（`vmu.tasks` ✓），**不能是工具名**（`vibe_vmu_records` ✗ ⇒ `VMU_NO_SUCH_OBJECT`）。

> **现状补充（2026-10-10 ✓）：`packs/v3-core/index.js` 也已落地并可装载** ✓✓ —— 它表达 **v3 的机构**：三槽位 `planner:1／solver:8／verifier:3` ✓、v3 的机制默认（`vmu.limits.maxLiveMembers:4` ↔ v3 `maxParallelThreshold` ✓；`verdictMaxRounds:5` ↔ `debateMaxRounds` ✓）＋**包自有键** `vmu.v3.*`（`verifierCount`／`solverMaxRounds`／`planningHorizon`／`promoteValueThreshold`／`mode` ✓）、v3 的五条产物轨 ✓，以及**两个随包 M2 模块** ✓✓：`ballot/tally` 上强制 **verifier 法定数**（不足即具名拒 ✓）、`mode=manual` 时**拒绝派发**（具名拒 ✓；auto 下保持沉默 ✓）。场景见 `tests/vmu-entry.test.mjs` 第 14 组 ✓。
> **为什么 v3-core 不带 M1 规则（诚实 ✗✓）**：v3 的两条定规矩是**量化/有状态**的（"至少 N 名验证者表态"、"manual 下未经放行不得跑"）——M1 的谓词 DSL **数不了票** ✓；为凑形态而写一条装饰性规则，正是本仓拒绝的那种撒谎 ✗。**这本身也是结论** ✓：**pack 是 JS ⇒ 它可以携带行为**，而 M1 的形态已由 v5r-core 演示 ✓。

**目标**：用 vmu 的 settings＋中间件＋提示词包**复现 v5r 的可观测行为**；**差异逐条报用户裁定**（不自行抹平）。

### 5.1 对照方法（可执行）
1. **同一套场景**：复用本仓 `tests/selfdrive-v5.mjs` 的场景集（v5r 为权威）；
2. **两边各跑一次**：`v5r 本体`（现 `vibe-math-v5r.js`）vs `vmu + v5r-pack`；
3. **比对"可观测行为"**（不看内部实现）：
   - 工具回执（`ok/code/message` 关键字段）；
   - `status()` 的关键字段（阶段/成员/会议/表决/预算/待续）；
   - 归档产物（文件路径 + 关键行 + 指纹）；
   - 提示词**关键段**存在性与顺序（逐字快照可 diff）；
4. **产出差异报告**：`{场景, 观测项, v5r 值, vmu 值, 分类: 等价|有意改进|缺陷|未覆盖}`；
5. **处置**：`等价` ⇒ 通过；`有意改进`/`缺陷` ⇒ **逐条报用户裁定**（D8）；`未覆盖` ⇒ 记录为已知缺口。

### 5.1.1 真机复跑的【可执行清单】（轮 213 ✓）

★ **仓内对照已覆盖 `§5.2` 全部 12 行机制** ✓✓（`tests/accept-v5r-contrast-behaviour.test.mjs`，**20 对 62 断言全绿** ✓）；**真机复跑是另一件事** ✓，其前置如下（★ **顺序即执行顺序** ✓）：

1. **A 侧（v5r）**：★ **必须是 "未装 vmu 插件、且 CLI 同代" 的 profile** ✗ —— 具体动作：**在同版本 CLI 下新建 profile 并只装 v5r 预设** ✓。（`design/05-p3-ab-report.md` 已记：**本环境当时不可得** ✗ —— 2026-10-10 那次 A 侧 profile 里同时装着 vmu 插件，模型两边工具都看得见 ⇒ ①② 两项对照**不干净** ✓。）
2. **B 侧（vmu）**：★★ **必须在 preset 参数里【声明 pack】** ✓ —— 否则 `packs: []` ⇒ ★ **零机制被验证** ✗（2026-10-10 那次的实测结论正是如此 ✓）。
3. **两侧一致**：**同一任务文本／同一模型／同一主机／同一 token 上限／各自全新工作区** ✓，**仅 `--preset` 不同** ✓。
4. **观测项按 `§5.1` 的四类** ✓：工具回执（`ok/code/message` 关键字段 ✓）／`status()` 关键字段 ✓／归档产物（路径 ＋ 关键行 ＋ 指纹 ✓）／提示词**关键段**的存在性与顺序 ✓。
5. ★★ **本轮新增要求（否则复跑仍会得出"零机制"）** ✓：**已接线的 5 项 v5r 行为参数必须在 B 侧被驱动时【真的改变行为】** ✓ —— `wakeRetries` ✓（耗尽记 `unreached` ✓）／`verdictMaxRounds` ✓（越限具名拒 ✓）／`hardLimitMs` ✓（墙钟硬界，钳制 `[300000,7200000]` ✓）／`quorumCap` ✓（`m = min(cap, 参与人数)` ✓）；`reconsiderFloor` ★ **已裁定无内核载体** ✓（其家在 pack／中间件层 ✓）。
6. **产出**：按 `§5.1` 第 4/5 步 ⇒ **`{场景, 观测项, v5r 值, vmu 值, 分类}` ＋ 逐条处置** ✓（`等价` 通过 ✓／`有意改进`·`缺陷` **报用户裁定** ✓／`未覆盖` 记为已知缺口 ✓）。

### 5.2 v5r 机制 → vmu 能力/中间件 映射（★ **轮 213：本表 12 行【全部已有对照】** ✓）

| v5r 机制 | vmu 承载方式 | 备注 |
|---|---|---|
| 学术院编制与角色（院士/研究员/临时工） | **角色槽位**（内核）＋ v5r-pack 定义实例与权限 | D5：内核零策略 |
| 会议（议程/轮次/举手/纪要/收束） | 会议原语（08）＋ `meeting.*` 判定点中间件 | 完成判据必须外置 |
| 求真表决（票型/法定数/未定论/复议） | 表决原语（08）＋ `ballot.*` 判定点 | 含"过程票不构成裁定" |
| 表决期禁言（R3/K12/B9） | `ballot.frozen` 判定点 ＋ `meeting.round-complete` 判定点 | **v5r 的真回归点**：冻结期不得推进轮次 |
| 正式证明准入（issue #13 #1） | `ballot.can-open` ＋ `ballot.who-may-open` 中间件（M1） | ✅ **轮 212 实测：该具名状态谓词【已提供】** ✓（`kernel/index.js` 的 `has_locked_formal_proof: (ev) => !!(ev.locked === true \|\| ev.subject.settled === true)` ✓），**且已有 pack 在闸门上用它** ✓（`packs/institute-min/index.js` 的 `when: { all: [ … { not: { subject: 'has_locked_formal_proof' } } ] }` ✓）⇒ ★ 原先写"**需 vmu 提供**"已陈旧 ✗，**已更正** ✓ |
| 记录分轨＋截断计数（#2） | 归档原语（07-§4）＋ `track` 参数 | 直接复用 |
| 待续标记（#5） | 在途工作台账（07-§3） | 直接复用 |
| 资源预算（#4） | `vmu.limits.*` ＋ `budget/exceeded` 中间件 | 机器强制部分进内核能力 |
| 论文阶段与收束 | 阶段机（08-§4.2）＋ `settle/*` 中间件 | pack 定义阶段列表 |
| 归档头部列表＋内容指纹（PR#16/S21） | 归档原语（07-§4.2/4.3）＋ `vmu.prompts` 绑定 | 直接复用 |
| Lean 面与内容身份 | 形式化面（09） | 复用既有 `sha256` |
| 静态门/变异族/语料门禁 | 与仓库现有测试体系对接（见 11） | 复用 runner 与 mock 宿主 |

### 5.3 v5r-pack 的"代价与取舍"（README 必写）
- 复现 v5r 需要**多少**中间件条目、各自负责什么；
- **哪些 v5r 行为被有意放弃**（例如历史包袱、性能取舍）——**必须逐条列出并报裁**；
- 该 pack 对**资源**的影响（唤醒并发、预算默认值）。

---

### 5.3 v5r 文档资产的**承接清单**（方法继承，内容重写）

B′ 判决：v5r 的文档层是**本仓质量最高、与数学无关度最高**的资产；**可迁移的是方法而非内容** ✓：

| 承接物 | 内容 | 在 vmu 的落点 |
|---|---|---|
| **五层文档流水线** | 底稿 → 定稿 → 手册 → 守卫 → **可追溯**（`11-appendix-drafts` 定义分层、`00-README §3` 定义权威顺序、`12-traceability` 做**机器可核映射**） | 本套 00–14 ＋ 本文件 §… ；**"权威顺序"与"编号与引用约定"直接借用** |
| **"必须逐条记账"纪律** | 覆盖边界/已知并发脆弱/未核项**如实登记，不掩盖** | 11-§6 纪律 ＋ 每篇的"未核项"节 ＋ 14-§1/§2 |
| **机器可核的映射表形式** | `12-traceability` 60 行却 17 KB ⇒ **一行一表**便于正则守卫 | 11-§2 的 R↔门禁映射表（同样按"一行一条"写，便于 linter/正则守卫） |
| **R10 跨域不变量** | **过程判定 vs 结束裁定必须分离** | 08 号（表决原语）＋ 11 号（门禁）作为一等约束 |
| **"使能而非驱动"** | 类型/字段**只使能，不驱动**流程 | 04（设置）＋ 08（原语）：任何字段不得隐式改变流程 |
| **"两类时间不得混用"** | 框架级时间 vs 业务时间严格分离 | 01-R12（可复现）＋ 04（设置不接受用户传时间） |

**文档裁决**（B′ §4.2）：11 份 `MEETING-PLATFORM-*.md`（≈290 KB）= **底稿层**（承接"底稿↔定稿分层"做法，**内容丢弃**）／`LEGACY-v5-实现方案（仅供参考）.md`（166 KB）= **丢弃**（v5 已被 v5r 取代）／`架构图.md`（46 KB）与 `设计总览.md` = **改造**（未核内容）／`preset.yml`＋`agent.cordis.yml` = **必须重写**（含 5 处 `!!js` 组合与完整插件行清单）。

### 5.4 v5r 产品侧复用判据（决定性事实）

- **单闭包单体** ✗：11.6k 行**全部在 `export function apply(ctx)` 一个函数体内**（`:413` 起）；除少量纯函数（`resolveKnownTool :93` 等）**没有第二个模块边界**；"子系统"只是同一闭包内的**注释分区**，靠共享闭包变量耦合 ⇒ **"原样复用"只可能发生在已抽出的少数纯件上**（`math-computation.js`/`math-engines.js`、纯算法 `applyV5Event :589`／`judgeVerdict :6593`／`aggregateOpinion :6557`、提示词 builder 群）；
- **对外接线极窄** ✓：`export const inject = ['subagents','agents','fs','tools','commands','timer']`（` :181`）＋ 懒解析 `ctx.get('sandboxPolicy'|'subprocess'|'compaction')`（`:432-434`）＋ **56 个 `registerTool`** ＋ 命令注册 ＋ `subagent/start|end` 监听 ⇒ **vmu 的"能力面"可以照这个接线宽度设计**（依赖面窄＝可替换性强）✓。

---

### 5.5 v5r 复用判决（B′ 终版：**9 原样复用 / 13 抽出重构 / 3 重写 / 0 丢弃**）与**三条硬约束**

**判决分布**（子系统层，共 25 个 S1–S25 ✓）：
- **原样复用（9）**：S2 状态折叠/事件溯源（`applyV5Event :589`）／S6 章程＋提示词 builder 群／**S9 共识验证（`aggregateOpinion :6557`／`judgeVerdict :6593` —— 全仓库最可移植的算法核心）**／**S10 任务板 CAS DAG（自述 ported from DSH agent-teams ⇒ 优先取上游）**／S13／**S14 `math-computation.js`(1481 行)＋`math-engines.js`(197 行) —— 本仓唯一已完成的抽取范例**／S16 三索引／S20 反馈库／S24 测试接缝；
- **抽出重构（13）**：S1/S3/S4/S5/S7/S8/S11/S12/S15/S17/S18/S19/S23 ⇒ **独立模块第一优先＝S12 Lean 通道，第二＝S19 最终论文**（对宿主只依赖 `subprocess`＋`fs`）；
- **重写（3）**：**S21 宿主容量反推**（数 `subagents.list()` 的 live children ＋ 解析 `ACTIVATION_LIMIT_REACHED`）／**S22 沙箱与路径契约**（`sandboxPolicy` 语义）／**S25 工具名过滤回退（从宿主报错文本正则反解已注册工具名 —— 极脆）**；
- **成本集中三处（均"大"）**：S4 会话/子代理绑定、S8 会议平台、S11 治理工具族；其余 22 项合计不超过这三项之一 ✓。

**三条硬约束（会改变做法）** ✗✓：
1. **"原样复用"的最大障碍不是代码而是守卫的匹配方式**：`tests/audit-v5-integrity.mjs:1452` 用 `readRaw()`＋**正则断言源码文本** ⇒ 凡"原样复用"者**必须保留函数名与关键代码形态**，否则门禁全红、复用退化为重写 ✗；
2. **优先依赖上游而非搬第三份副本**：S10（任务板 CAS DAG）／S17（调度）／TeamActivity 片段都**自述 ported from DSH agent-teams / v4 §25** ⇒ 若上游 DSH 仍提供这些能力，vmu 应**直接依赖上游**（**是否仍提供未核** ⇒ 14-§2）✓；
3. **起手式**：**不要先切 11.6k 行的 `apply()`** ✗ —— 先把 **9 个"原样复用"项按现状搬走当基线**，再逐块替换 **S4/S21/S22/S25 四个宿主适配层** ✓（这是 P1 的推荐顺序）。

---

## 6. vmu 自身的"预设接线手册"（把 vmu 装进本仓，逐步骤）

> 依据 B′ 侦察 §1（逐条带行号）；**顺序很重要**。

1. **目录**：新建 `vibe-math-vmu/`（含 `package.json`/`cordis.patch.yml`/`preset-declaration.js`/`index.js`/`kernel/`/`settings/`/`middleware/`/`packs/`/`prompts/`/`docs/`/`tests/`）＋ **`vibe-math-vmu/preset.yml`**（`name`/`description`，生成器取此处）；
2. **预设组合**：写 `vibe-math-vmu/agent.cordis.yml`（**整份作为 `config.plugins`**）⇒ 由 `scripts/build-preset-rows.mjs` 生成 patch 行；
3. **生成器**：在 `build-preset-rows.mjs` 的 `VERSIONS` 与 `ORDER` 各加一项 ⇒ 运行 `node scripts/build-preset-rows.mjs` **重生成** `cordis.patch.yml`（**该文件是生成物，禁止手改**）；
4. **包清单**：`package.json` 增 `exports."./vibe-math-vmu/vibe-math-vmu.js"` ＋ `files[]` 逐项（含 `docs/*`）＋ `dsh.compatNote/testedVersion` ＋ 与 `engines.dsh`/`peerDependencies` 的**三处区间同步**；
5. **版本**：**递增 `package.json#version`**（否则老用户永远拿不到新预设——installer 的强制替换判据）；
6. **安装器**：`installer.js` 的 `PRESETS` 增一条（`src`/`dst`/`files[]`），与第 4 步的 `files[]` **保持一致**；
7. **测试接线**（不修即门禁红）：`tests/audit-preset-rows.test.mjs`（`VERSIONS`/`IDS`）、`tests/audit-math-computation-parity.mjs`（若含数学模块，**副本须字节一致**）、`tests/audit-math-computation-contract.mjs`、`tests/audit-persona-sensitivity.mjs`、`tests/audit-fuzz-helpers.mjs`（预设 JS 表）；
8. **文档与计数**：`README.md`/`README.en.md`（**当前连 v5r 都没写进去** ✗ ⇒ vmu 必须写：预设数量、安装、选 pack）＋ 跑 `node scripts/update-doc-counts.mjs`（它整行重写 4 处计数行）＋ `tests/audit-readme-counts.mjs` 守卫；
9. **语料**：若 vmu 需要**自己的提示词语料** ⇒ 新增 `prompt-corpus-vmu/` 并进 `package.json#files`；若复用语料 ⇒ 在测试里显式声明（照 v5r 复用 `V5_CORPUS_DIR` 的做法）；
10. **验收**：`node tests/run-tests.mjs --counts`（作业/套件/探针计数）＋ `GATE_RELEASE=1 node tests/run-tests.mjs`（全量）＋ `node scripts/update-doc-counts.mjs --check`（文档一致）。

**易漏项清单**（来自实测缺口）：README 未同步 ✗／`docs/test-timing.md` 与 `docs/AUDIT-CHECKLIST.md` 的计数行 ✗／installer 与 package.json 的 `files[]` 不一致 ✗／忘记 bump `version` ⇒ 老用户无新预设 ✗。

---

## 7. pack 作者指南（最短路径）

> ★★★ **轮 449 重写了本节** ✗：★ **原文让作者写 `pack.yml` 与 `settings.yml`** ✗ —— ★★ **而运行时不读任何 YAML** ✓（★ 见 §2 ✓，**同卷两节互相矛盾** ✗），**并称 `vibe_vmu_pack` 未实现** ✗ —— ★ **而 `host.js` 注册了它** ✓（`vmu-entry.test.mjs` 第 7 组 ✓）、**§3 也把它当作真字段校验** ✓。★ **指南与规格矛盾比指南过期更糟** ✓，**因为作者跟着指南走** ✓。

1. ★★ **挑一个【真实起点**]✓（★ `packs/_template/` **不存在** ✓ —— ★ **不设它是有意的** ✓：**四个真包覆盖了两种形态** ✓，**再加一个空壳只会多一份要同步的东西** ✗）：★ **只贡献文字 ⇒ 抄 `packs/example-data/`** ✓（★ **只有 `prompts/sections.json`** ✓，**没有 `index.js`、没有代码** ✓）；★ **要行为 ⇒ 抄 `packs/institute-min/index.js`** ✓（★ 席位／M1 规则／别名 ✓，86 行 ✓）；★ **要一个完整机构 ⇒ 抄 `packs/v5r/`** ✓（★ 四子目录齐全 ✓）；★ **要另一套制度 ⇒ 抄 `packs/v3-core/index.js`** ✓（★ 量化规则走 M2 模块 ✓）；
2. ★★ **清单是【代码**]，不是 YAML** ✓：**`packs/<id>/index.js` 导出 `PACK`** ✓（★ 字段全集见 §2 表 ✓；★ **`conflicts` 【不被读取**]✗、**`apiVersion` 用 `packContractVersion`** ✓）；
3. ★ **设置默认值**：**`packs/<id>/settings/defaults.json`** ✓（★ **插件在建内核前按纯数据读** ✓，**用户设置永远赢** ✓）；★ **"只放量"的原则不变** ✓ —— **流程进中间件** ✓；
4. 写中间件（**优先 M1**；复杂逻辑才 M2；长流程才 M3）；
5. 写提示词包（段模板 ＋ 绑定 ✓ —— ★ **可以纯数据** ✓：`packs/<id>/prompts/sections.json` ✓；**不要改状态块**）；
6. **装载**：在 profile 行的 `config.packs: ['<id>']`（或内联 manifest）里声明 ⇒ 插件装载期 `plan → apply` ✓；★★ **`vibe_vmu_pack` 【已实现**]✓（`host.js` 注册 ✓，`action: list｜plan｜apply｜unload` ✓；★ **`plan` 是纯报告** ✓，★ **`apply` 冲突即具名拒** ✓）—— ★ **原文的"⛔ 未实现"是错的** ✗；库面是 `createPackLoader().plan/apply/unload` ✓）；
7. 跑对照（若有历史参照）⇒ 写 README（机制、代价、取舍、已知差异）。

---

## 8. 门禁（本篇验收判据）

1. **pack 可装载/卸载/回退**，且卸载后行为回到基线；
2. **能力缺失/冲突 ⇒ 具名拒**（两场景）；
3. **dry-run 无副作用**（前后状态哈希一致）；
4. **优先级可证**：四层覆盖各有一条断言；
5. ★★ **v5r-pack 对照【已达**]✓：★ **差异报告已生成** ✓（`design/04-v5r-contrast-live.md` ✓）＋ ★★ **行为级 A/B 双向量化** ✓（★ 正向按条目 **706/823（86%）**／只看散文 **632/642（98%）** ✓；★ 反向 **398/1478（27%）** ✓）⇒ **D8 的「逐条报裁」落到 `docs/24` 与 11-§9.6 ✓**；
6. ★★ **接线手册可复跑 —— 【真待做**]✗：★ **「按 §6 在【干净检出**]上装出 vmu 预设并通过 `--counts` 与文档计数门禁」从未实跑** ✓（★ 本仓是**长期演进的工作区** ✓，**不是干净检出** ✓）⇒ ★ **它需要一个新的克隆** ✓；★★ **在实跑之前这一条【不算完成**]✓（★ 与 11-§9.6／`docs/14` 的「未通过门禁的东西一律不算完成」一致 ✓）；
7. **无静默覆盖**：pack 间覆盖未声明 ⇒ 报错（§4）。

---

## 9. pack 骨架（**真实形态；`packs/_template/` 有意不存在** ✗）

> ★★★ **轮 450 重写本节** ✗：★ **原文给出 5 个 YAML 文件**（`pack.yml`／`settings.yml`／`middleware/rules/*.yml`／`prompts/bindings.yml`）✗ —— ★★ **而运行时不读其中任何一个** ✗ ⇒ ★ **那是一个我们【有意不建**]的形态的模板** ✓（★ §2 已写「没有 YAML 清单」✓）。★★ **给一个「运行时不读的形态」写模板，与 §7 曾犯的是同一个错** ✓（★ 那里的形式是散文，这里是骨架 ✓）。

★★ **`packs/_template/` 不存在，而且这是【有意**]的** ✓（§7 ✓）：**四个真包覆盖了两种形态** ✓，**再加一个空壳只会多一份要同步的东西** ✗。★ **要骨架，就抄一个真包** ✓ —— ★ **本节给的是「抄哪个、改哪几行」** ✓，**不是一份平行于实现的模板** ✗。

### 9.1 有行为的 pack（抄 `packs/institute-min/index.js` ✓，86 行）

```js
// packs/<id>/index.js  —— 清单是【代码**]，导出 `PACK`（字段全集见 §2 表 ✓）
export const PACK = {
  id: 'my-institute',
  version: '1.0.0',
  packContractVersion: 1,                                   // ← 不是 `apiVersion` ✗
  requires: [{ service: 'vmu.tasks', minVersion: 1 }],       // ← 数组，不是 map ✗
  codes: ['VMU_PACK_MY_INSTITUTE_<REASON>'],                 // ← 必须这个前缀（R-d）
  settings: { 'vmu.meetings.quorumCap': 3 },                 // ← 一层键→值（用户设置仍会赢）
  slots: [{ id: 'chair', capacity: 1 }, { id: 'member', capacity: 8 }],
  tracks: ['progress', 'rejected'],
  rules: [{                                                  // ← M1 规则是【JS 对象**]，不是 YAML ✗
    id: 'my-institute-no-vote-without-proof',
    kind: 'rules',
    on: ['tools/pre-execute'],
    when: { all: [{ tool: ['vibe_vmu_meeting'] }, { not: { subject: 'has_locked_formal_proof' } }] },
    then: [{ deny: { code: 'VMU_INVALID_ARGUMENT', message: '只有已定稿且已证伪或证明的对象才能进入表决' } }],
  }],
  middleware: [],                                            // ← 追加条目（`kind:rules` 的条目不编译 ✗）
  aliases: [{ from: 'my_old_tool', to: 'vibe_vmu_records' }],
}
```

### 9.2 设置默认值与提示词（**可以纯数据** ✓）

```
packs/<id>/settings/defaults.json     # 插件在建内核前按纯数据读 ✓（"只放量"，流程进中间件 ✓）
packs/<id>/prompts/sections.json      # { sections: [{name,order,text}], bindings: [{section, role|phase|member|task, text}] } ✓
```

★ **只贡献文字、不要行为的 pack【没有 `index.js`**]✓（`packs/example-data/` 就是这样 ✓，**且它被 `config.packs` 点名时【不报错**]✓）。

### 9.3 M2 模块（**必须**声明 `meta.apiVersion` 与 `capabilities`，且**每个分支都要 return**）

```js
export const meta = { id: 'example.module', apiVersion: 1 }
export const capabilities = ['read-state', 'deny', 'appendPrompt']
export default ({ log }) => ({
  hooks: {
    'meeting/round-start': async (ev) => {
      if (ev.roster.length >= 2) return                        // ← 必须 return（放行）
      return { deny: { code: 'VMU_MEETING_TOO_SMALL', message: '本轮参与人数不足' } }
    },
  },
})
```

### 9.4 `README.md` 必须回答

① 这套机制在做什么；② **依赖哪些内核能力**；③ **代价**（并发／预算／提示词长度）；④ **已知差异与有意放弃**（D8：逐条列出，禁静默 ✗）。

### 9.5 装载（两条路，均已可用 ✓）

① **随包整合包** ⇒ profile 行的 `config.packs` 里给 `<id>`（或内联 manifest ✓）⇒ 装载期 `plan → apply`（★ 冲突即具名拒 ✓；★★ **`config.packs` 是【序列**]不是集合** ✓ —— ★ **后者对同一设置的主张会覆盖前者** ✓）；② **运行期检查/装载** ⇒ `vibe_vmu_pack`（★ **已实现** ✓：`list｜plan｜apply｜unload` ✓）。

---


## 10. 未核项

- ~~**v5r-pack 的差异清单未生成**（待 P3 对照跑）~~ ⇒ ★★★ **已做** ✓：**行为级 A/B 双向量化**（★ 正向 `V66` ＝ 原版固定行 **706/823（86%）**、**只看散文 632/642（98%）** ✓；★ 反向 `V68` ＝ 我方 **398/1478（27%）** ✓）⇒ **`docs/11` 的 P3 已是 `PASS`** ✓（★ 记法与口径纪律见 11-§9.6 ✓）；
- ~~**OL4 冲突策略…未实测多 pack 同时装载的最坏情形**~~ ⇒ ★★★ **已实测（轮 444 ✓）** ✓，**而且结论比预期有信息**：★ **`config.packs: ['institute-min','v3-core']`【确实被拒**]✓ —— `VMU_PACK_CONFLICT`：**"pack v3-core overlaps existing settings: `vmu.meetings.verdictMaxRounds`, `vmu.meetings.quorumRule`"** ✓ ⇒ ★★ **两个不同机构【默认不能共存**]✓，**因为它们对同一批会议设置各持主张** ✓ —— ★★★ **这正是"pack 表达偏好、部署决定"的正确行为** ✓（★ 要共存需 `vmu.packs.allowKernelOverride` ✓）；★ **且拒绝【点名了重叠的键**]，而不只是说 "conflict"** ✓；★ **第一个 pack 保持生效** ✓（★ 拒绝不会拖垮已在运行的东西 ✓）；★ **同一 pack 两次** ⇒ "already applied" ✓；★★ **真实机构 pack ＋ 纯数据 pack【零错共存**]✓。★ 断言：`tests/vmu-entry.test.mjs` **E-16 系列** ✓；
- ★★★ **逃生口已实测，并且【它过去只开了一半**]（轮 445 ✓）—— ★★ **两条通道读【两个不同的键名**]✗：**`kernel/pack.js` 读 `vmu.packs.allowKernelOverride`** ✓（★ **本手册用的就是它** ✓），**`kernel/index.js` 读 `vmu.packs.allowOverride`** ✓（★ **04／12 号文档用的是它** ✓）⇒ ★★★ **于是"按手册声明"的部署会让加载器开门、而内核的门【仍然关着**]✗，**回执还提示它去设那个它刚设过的键** ✗ ⇒ ★ **现在两层【都认两个名字**]✓（★ 两键都保留 ✓，不做破坏性合并 ✓，需要按单键细放时用 `vmu.packs.activeOverrides` ✓）。★★ **实测**：★ 声明后 **`['institute-min','v3-core']` ⇒ 0 错、两个都应用** ✓；★ **而反序也一样** ✓ ⇒ ★★★ **由此得到一个【任何文档都没说过**]的事实：★ **后应用者赢得重叠的设置** ✓ ⇒ ★★ **`config.packs` 不是集合而是【序列**]，**顺序决定这个所怎么开会** ✓；★ 断言：**E-17 系列** ✓；
- **上游是否仍提供 S10/S17 能力未核**（若提供 ⇒ 直接依赖，不搬第三份副本）⇒ 见 14-§2（U9）；
- **`cordis.patch.yml` 生成器的 TRANSFORM 机制**（"恰好命中 1 次"的断言）在 vmu 新增预设定稿前的适配方式未定；
- **pack 的版本升级与回退**（`version` + `migrations`）语义未定 —— ★ **现状**：**`migrations` 字段【不被读取**]✗（§3 已写明 ✓）⇒ ★ **因此不承诺回退迁移** ✓；★ **升级路径对"研究机构"确有消费者** ✓（★ 一个机构会演化 ✓）⇒ **保留为真待做** ✓。
- **上游是否仍提供 S10/S17 能力未核**（若提供 ⇒ 直接依赖，不搬第三份副本）⇒ 见 14-§2（U9）；
- **`cordis.patch.yml` 生成器的 TRANSFORM 机制**（"恰好命中 1 次"的断言）在 vmu 新增预设定稿前的适配方式未定；
- **pack 的版本升级与回退**（`version` + `migrations`）语义未定 —— ★ **现状**：**`migrations` 字段【不被读取**]✗（§3 已写明 ✓）⇒ ★ **因此不承诺回退迁移** ✓；★ **升级路径对"研究机构"确有消费者** ✓（★ 一个机构会演化 ✓）⇒ **保留为真待做** ✓。

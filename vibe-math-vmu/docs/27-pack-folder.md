# vmu 27 · 整合包文件夹：**实际运行机制＝框架＋整合包文件夹**（目标②）

> 上位：`01-philosophy.md`（自由度／可调控性／可定义性／扩展性）、`10-packs.md`（pack 机制的接口）、`05-middleware.md`（中间件）、`04-settings.md`（设置）。

---

> ★★★ **`v5r-blocks-a.js` 与 `v5r-blocks-b.js` 为什么是两个文件（★ 轮 503 补 ✓）**：★ **它们原先是【一个**]**`v5r-blocks-a.js`＋`v5r-blocks-b.js`**（★ 曾是一个 `v5r-blocks.js` ✓，★ 轮 503 更正 ✓）** ✗ —— ★★ **是【R14 的尺寸门禁**]把一个超限文件拆成两半的结果 ✓ ⇒ ★ **拆分之后，本卷名单【没有跟着改**]✗，★ 而包本身照常工作 ✓ ⇒ ★★★ **"一个已经拆开、却仍被文档当成一个的模块"** ✓。★ **这次由 `tests/audit-pack-face.test.mjs` 守着**：★ **`packs/<id>/` 下的每个文件都必须在 `docs/27` 里被点名** ✓。

## 1. 一句话

★★ **vmu 的实际运行机制 ＝ `kernel/`（框架）＋ `packs/<名字>/`（整合包文件夹）** ✓。
★★★ **框架只提供【机制】，整合包提供【机构】** ✓ —— ★ **凡是"换一家研究所就不对"的东西，都不许待在 `kernel/`** ✗，**必须待在整合包里** ✓。
★★★ **轮 1（D-03/D-06）**：**pack 是 L4，自成一档；它不是中间件四形态里的 M4** —— M4 是**消费 vmu 已发布服务的 DSH 外部插件**；总线只跑 M1（`rules`）与 M2（`module`），`kind:'script'|'plugin'` 由 `bus.add` **具名拒** `VMU_MIDDLEWARE_KIND_UNSUPPORTED`。pack 的机构策略（段开关、通知措辞、相位）**由 `config.packs` 声明驱动注入**（见 §4.1），不再由入口无条件带上。

---

## 2. 文件夹布局

```
vibe-math-vmu/
  kernel/                     ← 框架本体（90+ 模块）：服务与扩展点，零机构知识 ✓
    turn/index.js             ← 一回合的编排：open → assemble → deliver → parse → plan → apply
    prompt/index.js           ← 提示词管线：段声明 + 变量白名单 + 绑定/覆盖/禁用
    pack.js                   ← pack 机制：validatePack / createPackLoader（原子应用 + 回滚）
  settings/                   ← 框架声明【能被设什么】：schema.js（键宇宙）＋ planned.js（未接线登记）
  packs/
    v5r/                      ← ★★★ 整合包文件夹（一个机构一个文件夹）
      index.js                ← 清单：id / version / middleware / defaults / contributes
      settings/defaults.js    ← ★ 这个包【想要的】默认值（用户设置优先）
      settings/defaults.json  ← 同一份默认值的【纯数据视图】（插件在建内核前按目录名读）
      notices.js              ← 这个包的通知措辞（四种形态）
      middleware/             ← ★ 这个包贡献的策略（纯函数，可读可测可替换）
        prompt-switches.js    ← 哪些可选段开关、发哪份回复目录、会议三态、形式化四分支
        stall-meeting.js      ← ★ 轮 10：v5r 的"静止⇒开会"（`control/idle` 的 M2 模块；阈值＝3 × `vmu.control.idleAfterMs`＝v5r 的 360000；经 `api.services.get('vmu.meetings')` 真开会）
        motion-box.js         ← ★ 轮 13：v5r 的"动议⇒开箱"政策（挂 `meeting/motion`；开真箱 ＋ 懒绑 `vmu.meetings` 的 `bindBox`；选项词表＝会议侧 1/0，**本 pack 政策**）
        artifact-counter.js   ← ★ 轮 20（task-126）：**指标计数者**（挂**回合内**的 `tools/result` ＋ 两个 `…/job-settled`；经 `api.services.get('vmu.metrics')` 的 `observe(...)` 写观测，指标名须由部署在 `vmu.metrics.indicators` 声明；未声明 ⇒ **具名跳过并被计数**）。★ 它是"`threshold` 报告能否自主开火"的**唯一收口条件**，且**故意不挂** `agent/turn-stopping`（报告边界就在那个钩子上，同刻写入要到下一轮才可见）
      prompts/                ← 提示词内容：语料转写模块 + 章程 + 人设 + 助手面（轮 2）
        v5r-core.js           ← 被装载清单 PACK（席位/轨道/规则/段 getter/别名/提示词正文轴）
        v5r-charter.js        ← 章程转写（按 role/phase 分支的段与绑定）
        v5r-prompts.js        ← 语料转写（生成物，哈希锁定）
        v5r-blocks-a.js / v5r-blocks-b.js ← 章程块（R14 尺寸门禁拆分的两半）
        v5r-persona.js        ← 捕获的人设块
        v5r-assistant.js      ← ★ 轮 2：助手面【逐轮】段（被装载清单再导出，注册进管线）
        assistant.json        ← ★ 轮 2：助手面【宿主 system prompt】数据（hostPrompt:true 段）
      README.md               ← 这个文件夹是什么
      …（提示词内容模块将陆续移入 prompts/）
    v5r-core.js 等            ← 迁移期的旧位置；文件夹已是唯一入口，物理搬入是内部细节
```

---

## 3. 三类物件各归其位

| 物件 | 归谁 | 例子 |
|---|---|---|
| **机制**（"能做什么"） | ★ **框架** `kernel/` | 段可被启用/禁用 ✓、设置可被读取 ✓、pack 可原子应用并可回滚 ✓ |
| **声明**（"能被设什么"） | ★ **框架** `settings/schema.js` | `vmu.turn.replyCatalogue` 的**存在**与取值域 ✓ |
| **偏好与策略**（"我们这家要什么"） | ★★★ **整合包** | ★ **默认发紧凑版目录** ✓、**关掉某段就是零注入** ✓、**未知名具名拒** ✓ |
| **内容**（提示词正文、章程、人章） | ★★ **整合包** | `packs/v5r/prompts/v5r-charter.js` 等 ✓ |
| **特殊脚本／协议／插件** | ★ **整合包**（必要时） | 宿主接缝 `host*.js` ✓ |

★ **判据**（写代码时随时自问）：**"这一行换成另一家研究所还对不对？"** ✗ ⇒ **不对就搬进整合包** ✓。

---

## 4. ★★★ 轮 406–407 的搬迁：一个真实例子

★ **症状**：内核的 `turn/index.js` 里**硬编码**了四段机构策略 —— **三个可选块**／**两份回复目录选一**／**会议三态**／**形式化四分支** ✓。
★★ **判定**：**"哪些段开、发哪份目录"换个机构必然不同** ✗ ⇒ **它是机构偏好，不是框架知识** ✓。

★ **做法**：
1. 策略变成 `packs/v5r/middleware/prompt-switches.js` 里的**纯函数** ✓（只吃 `settings` 与 `turn`，返回 `{decisions, errors}` ✓，**不碰管线、不碰内核、无 I/O** ✓）；
2. 框架新增 **`sectionPolicy`** 注入点 ✓（`createKernel` 与 `createTurnOrchestrator` 都收 ✓）；
3. ★★ **未注入策略时，框架【一个段都不动**】✓ —— ★ **这正是 `preset.yml` 自己写的"默认零机制，机制以 pack 形式提供"** ✓；
4. 插件把 pack 的策略注入内核 ✓。

★★ **两条纪律随策略一起搬走**（不是留在内核里 ✓）：
- **关掉＝零注入** ✓（**连段标题都不出现** ✓，不是"已禁用"提示 ✓）；
- **未知名＝具名拒** ✓（**绝不替调用方猜** ✗）。

★★★ **一个值得记住的静默失败**：★ 第一版把 `sectionPolicy` 加到了 **`open()`** 的参数表、而不是**工厂**的参数表 ✓ ⇒ ★ **`typeof` 对"未声明标识符"不抛错、只返回 `"undefined"`** ✓ ⇒ **策略静默不执行、外观完全正常** ✗。★ 抓出它的是**探针里那句 `policy calls: 0`** ✓ —— ★ **"看着对"与"被调用"是两件事** ✓。

### 4.1 机构策略由 **pack 声明驱动注入**（★ 轮 1，D-03/D-06）

★★★ **症状（轮 1 侦察实测）**：入口 `vibe-math-vmu.js` 顶层**静态 import** v5r 的 `prompt-switches.js`／`notices.js`／`index.js`，并在 `createKernel` 处**无条件**注入 `sectionPolicy`／`noticeBlock`／`extraPhases` ⇒ ★ **`config.packs` 为空时，v5r 的机构策略照样生效** ✗ —— R1/D5「框架不认识机构」只在 `kernel/**` 成立。

★★★ **本轮落地的形状**（入口侧由 vmu-core 落，机制侧由 `kernel/pack.js` 提供）：
1. **声明驱动**：入口按 `config.packs` 的 id 从**本地数据映射**（`PACK_RUNTIME`）取该包的 `sectionPolicy`／`noticeBlock`／`phases`；**一个包都没声明 ⇒ 三者皆为 `null`** ⇒ 回到「框架一个段都不动」的零机制 ✓。
2. **提示词策略经 loader 真消费**：`promptPolicies` 由 `createPackLoader({ onPromptPolicy })` 收集，入口用 `composePromptPolicies()` 合成**一个** `sectionPolicy`；**声明了策略却没有 sink ⇒ 具名拒** `VMU_PACK_PROMPT_POLICY_UNCONSUMED` ✓。
3. **包默认值的层级与来源**：`settings/defaults.json` 在建内核前折在用户设置之下（**用户永远赢** ✓）；`createPackLoader({ settingSource })` 让 `apply()` 知道每个键属于哪一层 ⇒ **更高层遮蔽、同层冲突具名拒**（D-02，见 docs/10 §4）。

★★ **残余边界（如实标注）**：★ `extraPhases` 仍是**构造期取值**（回合循环在建内核时捕获）⇒ **第三方 pack 若要走"声明驱动"，其相位必须由它自己的插件在构造前传入**（本轮的 `PACK_RUNTIME` 是同步映射，正是为此）；★ 若将来把"装配前"也做成可挂载点，这条边界才消失。

### 4.2 轮 2 的声明层与两处收口（D-08 / D-12 / D-13）

- **声明层**（D-08：能力进内核、策略进 pack）：v5r 用 `settings/defaults.json`（19 个新键：chat/mailbox/panel/resume/human/math-jobs/meeting 参数）声明这家所的偏好；**报告策略**在被装载清单（`packs/v5r/prompts/v5r-core.js`）上声明。**同一键不得两处都写**——defaults 先折进内核设置，清单再声明同键会被 `applyPackSettings` 判为重叠冲突（O4）。详见 `docs/10 §4.1`。
- **D-12 钩子单一真源收口**：`kernel/bus.js` 的 `HOOK_REGISTRY` 是唯一写钩子的地方；`VU_HOOKS`/`DEFAULT_FAILURE`/`DSH_HOOKS`/`BRIDGED_HOOKS` **全部派生**（不再有字面量第二份），4 处按源码文本解析的门禁同轮改为**读运行时导出**。轮 2 新增 33 个原语钩子（`resume/`、`ids/`、`human/`、`control/`、`chat/`、`mailbox/`、`panel/`、`math/`、`lifecycle/`），命名空间规则同步扩展 ⇒ 未登记名**具名拒**。详见 `docs/05 §5.3/§6.1.1`。
- **D-13 提示词活读**：`kernel/prompt/index.js` 的七个设置值（locale 三项、`overridesByLang`、glossary 两项、`overrides`）改为**每次调用经 `settings.get()` 现读**，构造期只缓存**结构性**派生（段的注册）⇒ 运行期改键后**同回合装配即生效**，不需重建管线。详见 `docs/06 §11.1`。
- **pack 与内核的依赖方向**：`kernel/**` 仍然**零 import `packs/**`**（轮 2 未变）；pack 只声明、内核只读取。

### 4.3 轮 3：分级会议与耐久投影的声明（GAP-MTG-02 / GAP-MTG-10 / D-15）

- **分级会议（GAP-MTG-02）**：`vmu.meetings.tier`（`formal|light`）与 `vmu.meetings.allowLight` 由 pack 声明；v5r 取 `formal` ＋ **`allowLight:false`**（v5r 只有完整协议 ⇒ light 会议被**具名拒** `VMU_MEETING_TIER_CONFLICT`，不是静默产出）。内核只提供 tier＋派生谓词（`light` 不得产出实体定论），唯一判定点在 `kernel/meetings.js` 的收束路径。
- **投票板重开（GAP-MTG-10）**：`vmu.ballot.reopenFloor=0`（v5r 的"门槛只升不降"⇒ 不额外加门槛），读者 `kernel/ballotbox.js` 的 `reopen()`。
- **耐久投影（D-15）**：`vmu.resume.projections` 由 **7 面扩到 10 面**（＋`chat`/`panel`/`human`），`vmu.resume.writeThrough=true`（状态型投影每次变更后写穿 ⇒ "未批动作重启后仍在排队"）。**审批队列、群聊、自述面板的跨重启**由 `kernel/human.js`/`chat.js`/`panel.js` 的 `snapshot()/restore()` ＋ `attachProjection` 承担，**不引入 settings 键**（`store.js` 白名单＋投影接线而已）。
- **office 定稿咨询门（C-30，已闭合）**：`vmu.paper.officeConsult='required'`／`On='finalize'`／`TimeoutMs=0`／`OnTimeout='hold'`／**`ExemptRoles=[]`** 由 pack 声明；判定点在 `kernel/paper.js:45-49,111-114`（WIRED_KEYS 3→8，`cfg()` 无条件读全五键）——未咨询即定稿 ⇒ 具名拒 `VMU_OFFICE_CONSULT_REQUIRED`＋审计 `what:'auth'`＋总线事件 `paper/office-consult-required`（经 `declareTopic` 扩展点）。★ **豁免默认空**（Lead F4）：本门存在的场景正是"office 自己定稿"，默认豁免 `office` 会恰好豁免掉它。
- **不归 pack 的一条**：**C-45（忠实性缺陷强制弃权）**＝内核谓词、**强制且不可配置**（reader-b：不忠实者的 0/1 被改写为 0.5 弃权并留耐久 marker）⇒ pack **不提供**关闭开关。

### 4.4 轮 4：**面解析与两个声明层的最终口径**（写一次，别再当 workaround 用）

> ★★★ **结论**：**面解析在 pack settings 之后**；**清单声明即发布**；**`defaults.json` 只在"需要构造前可见"时用**。
- 机制：适配器解析"哪些面被声明"读的是**内核的活设置视图**（`vibe-math-vmu.js:365-371`），而清单 `settings` 由 `applyPackSettings()` 写进内核设置；入口在 packs 之后**重新 install**（`:636`，模块后 `:682`）⇒ 清单声明的家族键**一定会**点亮对应面（`host.js:166-250` 的 `TOOL_FACES`：`families` × `config`）。
- 因此：**要发布自己的工具面，就在被装载清单里声明该家族至少一个键**（如 `vmu.report.*` ⇒ `report` 面）；`defaults.json` 的用途只剩"**构造期就被读取**的值"与"用户设置缺失时的兜底偏好"（判断口径：读点在构造期 ⇒ 必须构造前可见；读点在调用期 ⇒ 清单够用）。
- ★ **轮 3 的"必须在 `defaults.json` 放一个家族键才能发布自己的面"是缺陷（F1）的**workaround**，已从根因修掉**（`vibe-math-vmu.js:360-367` 的注释原文：**"No defaults.json workaround"**）。**不要**把它写进任何指南。
- **并发上限（轮 4 裁决：两个策略各归其名）**：`vmu.math.maxParallel=1`（数学作业/编译并发＝v5r 的 `leanJobsMaxParallel: 1`，读者 `kernel/mathjobs.js`＋`kernel/mathtools.js`）＋ `vmu.limits.maxLiveMembers=3`（成员唤醒并发＝v5r 的 `maxParallel: 3` 原义，读者 `kernel/index.js:221` 的 `liveMemberCapOf` ⇒ `declareSlots`）。★ **"镜像成一个值"已被 Lead 推翻**（两个不同策略不得强行相等）；旧名（`math.jobs.maxParallel`）**已从 schema 移除**，pack 不声明它；`kernel/mathtools.js` 仍读旧名 ⇒ **读点退役归 reader-b**（退役前 docs/04 报"已接线但未声明"）。详见 `_handoff/vmu/pack-round4-report.md §G`。

---

## 5. 加载：文件夹优先

★ 插件**先试文件夹**（`./packs/<名>/index.js` ✓），★ **只在 `ERR_MODULE_NOT_FOUND` 时**回退到旧的扁平模块 ✓。
★★ **为什么只吞那一个码**：★ **若吞掉一切，pack 内部的真错误（语法错、导入错）就会被当成"没有文件夹"** ✓ ⇒ **静默加载旧包** ✗ —— ★ **那正是最坏的失败形态** ✓。

---

## 6. 两处名册（**两条边**，新增/删除整合包文件时**必须同时**改）

★★ **实测结论**：加一个 pack 文件会**同时**触红两个审计 ✓ —— ★ **它们都在干正事** ✓，★ **而且它们不是同一件事的两个副本** ✗：**一份清单管"进不进 tarball" ✓，另一份管"装不装进 `.agent-presets/<id>/`" ✓** —— ★ **只改一处，两条边里必有一条不成立** ✓。

| 名册 | 位置 | 管的那条边 | 谁读它 | 漏了会怎样 |
|---|---|---|---|---|
| **shipped 名册** | `package.json` 的 `files` | ★ **磁盘上的文件 → 进 npm tarball** ✓ | npm 打包；`tests/audit-package-membership.mjs` | ★ **相对导入的目标必须在包里** ✓（否则装完 **MODULE_NOT_FOUND** ✓）；读者**无法复现证明** ✗ |
| **托管名册** | `installer.js` 的 `PRESETS[].files` | ★ **tarball 里的预设文件 → 复制进 `<presetRoot>/vibe-math-vmu/`** ✓（路径**不带** `vibe-math-vmu/` 前缀 ✓） | `installer.js` 的复制循环；`tests/audit-installer-policy.test.mjs` §8 | ★ **文件在包里、却永远不进预设目录** ✗ ⇒ ★ **`<=0.1.6` 的目录式预设挂不起来** ✗（理由见 `installer.js` 里 v2 条目上方的注释 ✓） |

### 6.1 ★★ 文件类型 → 必须进哪个清单（**权威表**）

> ★ **判据**：**"必进"＝漏了有具名后果** ✓；★ **本表按类型写，不写会漂移的逐目录计数** ✓（计数是**某一次读数**，不是规则 ✓）。
> ★★ **预设源根＝`vibe-math-vmu/`**（＝`PRESETS` 里 `src` 指向的那个目录 ✓）。

| 文件类型（预设源根下） | `package.json#files` | `PRESETS[].files` | 为什么 |
|---|---|---|---|
| 预设入口 `vibe-math-vmu.js` | **必进** | **必进** | installer 的 runtime 三元组之一（`agent.cordis.yml`／`preset.yml`／`<src>.js`） |
| 预设声明 `agent.cordis.yml`、`preset.yml` | **必进** | **必进** | 同上；DSH 在 `.agent-presets/<id>/` 里要读到它们 |
| 内核模块 `kernel/**/*.js`（含 `kernel/<面>/index.js`） | **必进** | **必进** | 相对 import 的目标 ＋ 复制进预设目录 |
| 工具面 `tools/**/*.js` | **必进** | **必进** | 同内核（同一条 import 闭包） |
| **pack 代码** `packs/<id>/**/*.js` | **必进** | **必进** | ★ **静态 import 闭包看不见它** ✗：装载器用**算出来的路径**动态 import（`vibe-math-vmu.js` 的 `await import('./packs/' + wanted + '/index.js')` 与 `… + '.js'` 两处）⇒ **只有清单能保证装运** ✓ |
| **pack 纯数据** `packs/<id>/**/*.json`（`prompts/sections.json`、`settings/defaults.json`、`prompts/assistant.json`） | **必进** | **必进** | ★ 插件在**建内核之前按目录名读** ✓ ⇒ **它不是 import 目标，闭包同样看不见** ✗ |
| **pack 文档** `packs/<id>/**/*.md` | **必进** | **必进** | 同上 |
| 扩展 `extensions/**/*.js` | **必进** | **必进** | 预设运行面的一部分 |
| 宿主接缝 `host*.js` | **必进** | **必进** | 同内核 |
| `settings/**`、`glossary.json`、`math-computation.js`、`math-engines.js` | **必进** | **必进** | 构造期按名读／被入口 import |
| 设计卷 `docs/NN-*.md` | **必进** | **必进** | ★ 预设自带设计文档 ✓（每条机制可追到一条已交付的设计决定 ✓） |
| 仓内工作稿 `docs/audit/**` | **不进（须逐条具名豁免）** | **不进（须逐条具名豁免）** | ★ 仓内审计稿不是产品 ✓ ⇒ **不进就是正确状态** ✓ —— ★ 但**必须具名** ✗，否则没人分得清"故意不交付"与"忘了登记" ✓；★ **具名处＝`tests/_lib/package-exemptions.mjs`** ✓（轮 15 已落 ✓，见 §6.2） |
| **pack 文档** `packs/<id>/README.md`（**出货的一份** ✓） | **必进** | **必进** | ★ 轮 15 实测：`packs/example-data/README.md` 一度**只进了 shipped 名册、没进托管名册** ✗ ⇒ tarball 里有、`.agent-presets/` 里没有 ⇒ ★ **这正是本卷 §6.3 那一格的现场实例** ✓（已补齐 ✓） |
| `tests/**` | ★ **按下面两条规则进**（不是"全部必进" ✗） | ★★ **永不进** | 本卷口径：托管名册**只列随预设出货的运行时文件** ✓ |
| `scripts/**` | ★ **按需进** | ★★ **永不进** | 同上 |
| 仓**根** `docs/**`（如 `docs/release-notes/**`） | **必进** | **不进** | ★ 没有 `vibe-math-vmu/` 前缀 ⇒ **不属任何 `PRESETS[].src`** ✓，本表这一列不适用 |

★★ **`tests/**` 进 shipped 名册的两条规则**（**实测口径** ✓）：① **每个 `tests/*.mutants.mjs` 必进** ✓；② **每个被守卫索引引用的 `tests/*.mjs` 必进**，**除具名 `EXCLUDED`** ✓ —— ★ **其余开发期套件故意不交付** ✓（★ 这条区别很重要：**"`tests/**` 全都不交付"与"全都交付"都错** ✗）。

### 6.2 ★★ 豁免表：形状与"不许变成漂移源"

★ **放哪** ✓：**一份共享的纯数据表**（被两个门禁 import ✓），**不**各门各写一份内联表 ✗ —— ★ 理由不是好看：**"豁免了谁"必须能在一个地方数清** ✓，否则**豁免越多、门越假绿** ✗（`docs/11 §4.2` 第九条 ✓）。

| 字段 | 形状 | 为什么必须有 |
|---|---|---|
| `path` | **精确仓内路径**；★ **禁止通配、禁止目录前缀** ✗ | ★ **通配是豁免变成漂移源的唯一入口** ✗：一条 `docs/audit/*` 会静默吞掉此后所有审计稿 |
| `reason` | 一句话，说**"为什么它不该交付"**（★ 不是"暂时漏了" ✗） | 与既有先例同形（路径→理由） |
| `approvedBy` | 具名人（Lead 或该面 owner） | "谁批的"要能追 ✓ |
| `approveRound` | 轮号（整数） | ★ 本仓以**轮**计数 ✓，不用日期（日期在不同成员本机时钟上不可比 ✗） |
| `reviewRound` | 轮号 | ★ 到期后由门禁**逐条报"复审到期"** ✓ ⇒ **豁免不会永久继承** ✓ |

★★ **反漂移的六个开关**（★ 依据 `docs/11 §4.2` 第九条：**每个"豁免"分支都要有相反的东西能把它变红** ✓）：① **去掉一条豁免 ⇒ 红并点名** ✓；② 豁免**磁盘上已不存在**的路径 ⇒ **红**（豁免不许比事实活得久 ✓）；③ 豁免一条**同时已在 `files` 里**的路径 ⇒ **红**（★ **不许用豁免盖住登记** ✓）；④ 同一 `path` 出现两次 ⇒ **红**；⑤ `reason` 或 `approvedBy` 为空 ⇒ **红**；⑥ `reviewRound` 已过 ⇒ **摘要里报出条数** ✓（★ 非零即可见 ✓）。

★ **本节已落地（轮 15 ✓）**：表＝**`tests/_lib/package-exemptions.mjs`**（导出 `PACKAGE_EXEMPTIONS` ＋ `GATE_ROUND` ✓），消费方＝**`tests/audit-package-membership.mjs` 的"预设源根磁盘闭包"**（★ 该块的注释自己写着 **"round 15, vmu-pack2 §B"** ✓）—— ★ 本节五个字段与六个开关**逐条对应实现** ✓，且六个开关**全部在该门自己的合成自探针上被证明** ✓（★ 含一条**探针 0 干净对照** ✓：干净输入必须安静，否则下面六条的"红"分不清是"规则咬了"还是"规则恒红" ✓）。★ 首轮内容＝`vibe-math-vmu/docs/audit/` 的**6 份**仓内工作稿（`approvedBy:'Lead'`／`approveRound:15`／`reviewRound:25` ⇒ 轮 15 尚未到期 ✓）。★★ **本门只判"磁盘 → `files`"这条边** ✓：`files → PRESETS` 仍归 `tests/audit-installer-policy.test.mjs` §8（★ **一个事实一个门** ✓，§6.4）。

### 6.3 ★★ `PRESETS` 是否参与（**明确回答：参与** ✓）

| 归属 | 结论 | 为什么 |
|---|---|---|
| **`packs/**`** | ★ **进 `PRESETS`** ✓ | ★ 不只是"它在预设目录里"：装载器**用算出来的路径**在运行期动态 import，pack 纯数据又**按目录名读** ⇒ **没有任何静态分析能替它保证装运** ✗ ⇒ ★ **只有清单能** ✓ |
| **`extensions/**`** | ★ **进 `PRESETS`** ✓ | 扩展模块是预设运行面的一部分 ✓ |
| **`tests/**`、`scripts/**`** | ★★ **不进，且必须继续为 0** ✓ | ★ 它们**不是预设资产** ✗；拖进托管名册会同时破坏三条已成立的不变量：**(i)** ★ "预设目录 == 已安装包" ✓（§8 与备份策略的判据 ✓）；**(ii)** ★ "本包不再出货的预设要删掉" ✓；**(iii)** ★ 同版本 **no-op** 的原子承诺 ✓ |

★ **改 `package.json` 的方式**：★★ **按锚点插行** ✓ —— **不要**用 `JSON.stringify` 整体重写 ✗（★ 会打乱格式、并触红安装器策略审计 ✓）。

### 6.4 ★★ 扩展交付面时应扩在哪一层（**轮 14 结论／轮 15 已落地** ✓✓）

★★ **症状**：R10 `meetingleave.js`、R11 `meetingmarker.js` —— **连续两轮**同型遗漏，而**两个门禁各只抓一半** ✗✓。★ **轮 14 机械复现** ✓：**从 `files` 删一个被 import 的模块 ⇒ `audit-package-membership` 红并具名**（`who -> ./module.js` ✓）、而 §8 **绿**（它拿 `files` 过滤出输入集 ⇒ **`files` 里没有的东西永远进不了它的输入集** ✗）；★ **反向**：**只从 `PRESETS[vmu].files` 删同一个名字 ⇒ §8 红并具名**（`shipped-but-unmanaged` ✓）、而 membership **绿**（★ 它**从不读 `installer.js`** ✗）⇒ ★★ **一次修复永远不能让两个门同时变绿** ✓。

★★ **结论（pack 侧）**：**建议扩，扩在 `audit-package-membership` 这一层** ✓ —— ★ 扩的**不是**"被 import 的路径"（★ **它今天已经实现了、而且有牙** ✓，见上一段），而是：

> ★★★ **对每个 `PRESETS[].src` 源根，磁盘上每个文件都必须在 `package.json#files`（写作 `<src>/<相对路径>`）里，或在具名豁免表里** ✓。

★ **理由**：**这条边今天完全没有守卫** ✗ —— ★ **`packs/**` 的代码与数据、`packs/**` 的文档、非 `NN-` 形态的文档，全都不在任何 import 闭包能看见的位置** ✓（这正是 §6.1 第五、六、七行写"闭包看不见"的那三格 ✓）。★ **扩在同一个门**而不是新门：**它是同一份清单的另一条边**（今天已管"被 import 的"与"设计卷"两格 ✓），★ 新门会让同一条边出现两个判据点（`docs/11 §4.2` 第十四条：**登记与判据必须同改** ✓）。
★ **不要**把 `files → PRESETS` 这条边也塞进这个门 ✗：**那条边已由 `tests/audit-installer-policy.test.mjs` §8 拥有且已绿** ✓ —— ★ **一个事实一个门** ✓。

★★ **判据（扩后必须同时满足）** ✓：**(a)** 种"被 import 未登记" ⇒ **红**（★ 今天已成立 ✓）；**(b)** 删 ⇒ **绿**（★ 今天已成立 ✓）；**(c)** 豁免表**逐条带理由** ＋ §6.2 的六个开关全绿 ✓；**(d)** ★ **不把 `tests/`／`scripts/` 拖进 `PRESETS`** ✓（扩后的检查**只扫 `PRESETS[].src` 根**，这些根本身不含它们 ✓）；**(e)** ★ **种一个 `packs/<id>/` 下的纯数据文件（`.json`／`.md`，没有任何 import 指向它）而未登记 ⇒ 必须红** ✓（★ 这是今天两门都看不见的那一格 ✓）。

★★★ **落地与读数（★ 轮 15 实测，写明读的是哪一版** ✓）：上面这条**已进仓** ✓ —— ★ 门＝`tests/audit-package-membership.mjs`（md5 `4a2634bac4dd32c6afbffb0893aba6a7`、17035 B、mtime 13:35:52 ✓），★ 它现在**从 `installer.js` 读 `PRESETS`**（不在此处重述 ✓）、从 `tests/_lib/package-exemptions.mjs` 读豁免表 ✓、判据是一个**纯函数** `closureOf` ✓ ⇒ ★ **六条判据（含 (e)）全部由该门自己的合成自探针证明** ✓。★ **读数**：`node tests/audit-package-membership.mjs` ⇒ **`28 passed, 0 failed`，EXIT=0** ✓（★ 轮 14 同一门是 **13/0** ⇒ **+15 条**就是这条边与它的探针 ✓）；★ 同轮读数 ✓：`audit-installer-policy` **100/0 ALL GREEN** ✓／`audit-pack-face` **5/0** ✓／`vmu-pack` **53/0** ✓。★★ **收口结果**：`vibe-math-vmu/` 下 **215** 个文件 ⇒ `files[]`(vmu 前缀) **209** ／ `PRESETS` **209**，★ **双向差集皆空** ✓（`files` 有而 `PRESETS` 无 ＝ ∅ ✓；`PRESETS` 有而 `files` 无 ＝ ∅ ✓；`PRESETS` 指向不存在的文件 ＝ ∅ ✓；`tests/`／`scripts/` 进 `PRESETS` ＝ 0 ✓；`files[]` 重复条目 ＝ ∅ ✓）。

### 6.5 ★★ 一处**已知的视野外**：seam 表不覆盖 `ballot` 族（**具名，不静默** ✗✓）

★★ **症状（结构性，不是漏了一次）**：`scripts/generate-seam-table.mjs:26` 的 `SEAMS` 是一张**白名单** ✓，而提取器写的是 `for (const seam of SEAMS)`（`:92` ✓）⇒ ★ **名单外的注入永远不会被提取、渲染或检查** ✗ —— ★ **不是"这次没查到"，是"这类查不到"** ✓。

| 项 | 实测（★ 写明版本：`scripts/generate-seam-table.mjs` md5 `14647243395a33cbcbe0a17b0ecef3af`、9663 B、mtime 19:28:18 ✓） |
|---|---|
| `SEAMS` 是否含 `ballot`／`boxFor` | ★ **否** —— 该文件里这两个名字**出现 0 次** ✓（`SEAMS` 仍是 15 个名字 ✓） |
| 但它确实是一处**真构造注入** | `vibe-math-vmu/kernel/index.js:1130` 的 `createMeetings({ …, ballot: meetingBallot })` ✓ |
| **扩白名单的实测代价** | ★ **+1 行、0 finding、PASS** ✓ —— 基线 `rows=112 seams=7 null=1 findings=0`（PASS ✓）⇒ 加 `'ballot','boxFor'` 后 `rows=113 seams=8 null=1 findings=0`（PASS ✓）；★ 差集**恰好一行**，其四个单元依次是 `` `ballot` ``／`` `kernel/index.js:1130` (meetings) ``／`meetings`／`` `meetingBallot` `` ✓ |
| `boxFor` 为什么加不加都一样 | ★ 它**没有构造点** ✓ —— 按裁决 (i)，`boxFor` 由 **pack 经 `bindBox` 懒绑**（不是构造期注入 ✓）⇒ 今天加它不产生行 ✓ |
| 扩还要不要动别的 | ★ **不用** ✓ —— 该门**没有硬编码行数**（判据是 `rows.length >= 5` ✓），且**仓里没有需要 `--check` 的已提交 seam 表**（新鲜度在临时目录里自证 ✓）⇒ **扩＝`SEAMS` 一个 token** ✓ |
| **谁在守着这一族** | ★ `tests/vmu-motion-box.test.mjs` ⇒ **`23 passed, 0 failed`，EXIT=0** ✓（md5 `9a60f319ebf74b9d11a00ee74b32315d` ✓）—— ★ 它**不靠投票回执**：B2／B3 断言"箱子真的开了（`boxes===1`）＋ `boxFor` 缝真的绑上（`source:'method'`）" ✓，**B5b（轮 14／task-107）独立回读箱子裁定**（★ **"把回执与事实分开"** ✓），R1／R2 断绑／解绑 ✓，负例断言 `VMU_MEETING_BOX_UNWIRED` ＋ `reason:'no-binding'` ✓ |
| 现状与归属 | ★ **本轮按 Lead 指示走"具名"，不越界改 `scripts/**`** ✓（那是 `vmu-verify2` 的领地 ✓）；★ 已把"**一个 token ＋ +1 行 ＋ 0 finding**"的代价实测**具名转它** ✓ |

★ 同步读数（同一轮内 ✓）：`tests/audit-seam-reachability.test.mjs` **17/0 EXIT=0** ✓；`tests/audit-gate-snapshot.test.mjs` **12/0 EXIT=0** ✓。

★★ **与本卷相关的新门禁/常驻断言（轮 11）**：
- **`scripts/audit-pack-middleware-shape.mjs`** —— **清单中间件"形状与能力匹配"门禁**：inline `handler` **不得**伸手要 `api`（总线上没有 `api`），也不得声明只有 loader 路径才能兑现的 `trigger-workflow`；**module 形状**（`module:`／`file:`）**必须**声明它真需要的 `capabilities`（用 `api.services` ⇒ 必须 `trigger-workflow`）；**裸路径 ⇒ 红**；带 `--selftest`（种四类坏条目必红、两条干净条目不误报）。
- **`tests/vmu-stall-meeting.test.mjs`** —— R10 那条"静止 ⇒ 开会"三步探针的**仓内常驻版**（真控制面报出空闲**边沿** ⇒ `control/idle` 上**恰一条**带 `trigger-workflow` 的条目 ⇒ **`vmu.meetings.open()` 真被调用**；＋ 反向与"阈值不硬编码"）。
- 两者都已进 `package.json` 的 `files`（**shipped 名册**）；`tests/**` 与 `scripts/**` 按本卷口径**不进托管名册**（`installer.js` 的 `PRESETS[].files` 只列随预设出货的运行时文件 —— 实测两份安装器门禁 `ALL GREEN`）。

---

## 7. 状态：**已完成 ✓ 与 未做 ✗**（轮 405 复核）

### 已完成 ✓

| 事项 | 落点 | 判据 |
|---|---|---|
| ★★ **整合包文件夹成形** | `packs/v5r/`（`index.js` ＋ `settings/` ＋ `middleware/` ＋ `prompts/` ＋ **`notices.js`** ✓） | 两处名册齐 ✓、两个归档审计绿 ✓ |
| ★★★ **机构策略搬出内核** | `middleware/prompt-switches.js`（**纯函数** ✓）＋ 内核新增 **`sectionPolicy` 注入点** ✓ | ★ **未注入 ⇒ 框架一个段都不动** ✓（= `preset.yml` 的"默认零机制" ✓） |
| ★★ **pack 的 `settings/` 真正生效** | `settings/defaults.json`（**纯数据** ✓）⇒ 插件在**建内核之前**折在**用户设置之下** ✓ | ★ **用户永远赢** ✓；★ `declared` **仍只数用户键** ✓（**"未配置＝零机制"不被包偏好污染** ✓） |
| ★★ **提示词内容物理入包** | `packs/v5r/prompts/`（4 个模块 ✓ ＋ 73 处引用同步 ✓） | 导入闭包审计绿 ✓ |
| ★★ **通知措辞入包** | `packs/v5r/notices.js`（**四种形态** ✓） | ★★ **对语料里 6 条真实通知【逐字复现**】✓（`tests/vmu-notice-shapes.test.mjs` ✓，10/10 ✓） |
| ★★★ **无损改名通道** | `was:` ＋ `SETTING_ALIASES` ＋ `resolveKey` ＋ `renameNotice` ✓ | ★ **11 个家族已改名 ＋ 1 次拆分**（`custody` ⇒ `custody`＋`anonymity` ✓）、**68 个旧名可解析** ✓、**0 自别名** ✓ |
| ★★★ **相位集可由 pack 扩展** | 循环校验 **`PHASES ∪ extraPhases`** ✓；pack 导出 **`V5R_PHASES`** ✓ | ★★ **`heartbeat`／`paper-write`／`paper-review`／`paper-final` 由【pack 声明**】✓，**框架不认识这些词** ✗✓（★ 架构词归机构 ✓）；★★ 断言**双向**：**pack 声明的被接受** ✓ ＋ **谁都没声明的【具名拒**]✓ 并把**框架列表与 pack 列表一起打印** ✓（★ **"一个什么都接受的校验不是校验"** ✓）；★ **边界如实标注**：★ **第三方 pack 目前须由其【自己的插件**]把相位传进来 ✓ |
| ★★ **论文撰写／互审／定稿入包** | `prompts/v5r-charter.js`（★ 以 **`paper-*` 相位**出现 ✓） | ★ **(i) 评审与出版** ✓；★ 承载 **"全体参与成员都投 true 才能定稿"** ✓ 与 ★ **`decision="revise"` 退回继续修订** ✓ |
| ★★★ **会议协议已真正接通** | `v5r-meeting-{invited,others,first,ask}`（**四个互斥发言者状态** ✓）＋ `v5r-turn-meeting-agenda`（★ **不属于状态命名空间** ✓） | ★★ **机制是"该轮点名状态才注入"** ✓ ⇒ ★ **两套件原先【都没点名**]✗ ⇒ **四个段贡献为零** ✓（★ 这就是"转写 40 行、复现率 +0"的真因 ✓）；★ 现在**逐条断言全部规则** ✓（邀请一次而不强制／举手／可再举手／无人举手才收束／沉默不触发截止／纪要具名记录谁选择未发言／**缺 `vote_solved` 阻止结题** ✓） |
| ★★ **复原（`resume`）提示入包** | `v5r-resume-core` ✓（★ `resume` 相位 ✓） | ★★ **语料里最好的一句** ✓：**"先读取完整研究日志与自己的成果卡；不要以恢复导航替代完整证明"** ✓；★ **prose 97%（29/30）** ✓ |
| ★★★ **按提示类型逐一度量（可看见总比率看不见的东西）** | `tests/vmu-prompt-type-coverage.test.mjs` ✓ | ★★ **九个类型各自出分，其中【七个 100% prose**]✓（★ `resume`／`heartbeat` 96%、`meeting` 97%、`founding` 98%、`normal` 99% ✓）；★★★ **并断言【全语料只剩 1 条不同的未复现行**]✓ —— ★ **它是紧凑目录的【另一版本**]✓（★ 语料跨原版一次改版 ⇒ 印两版就印了原版那一轮没印的行，印一版就匹配不上另一版 ✓）⇒ **设计上不可闭合** ✓；★★ **并含视图守卫**：**流水线视图 81% ≥ 编写形态 38%** ✓（★ 挡住的正是"把承重视图当有损派生去简化"这个【我自己写反过的结论**]✓）。★★★ **口径说明（重要）**：★ 度量按**【调用者应当变化的输入取并集**]✓（★ 成员 ✓、审阅者 ✓）—— **因为"一次调用产出了什么"是关于 harness 的陈述，不是关于 pack 的** ✓；★ 而 **fidelity 数字（`V68`）必须用【单变体**]装配** ✓，**否则并集会让分母虚增而不增加任何新行** ✓ |
| ★★★ **pack 可用【纯数据**]贡献提示词段与相位** | `packs/<id>/prompts/sections.json` ✓ ＋ 插件在建内核前**按纯数据读它** ✓（★ 与 `settings/defaults.json` 同一循环、同一种方式 ✓）；示例包 `packs/example-data/` ✓ | ★★ **数据形态＝流水线自己的形状**：`{ sections: [{name,order,text}], bindings: [{section, role\|phase\|member\|task, text}] }` ✓ ⇒ **只需要文字的 pack，就只需要数据** ✓；★★ **插件里【没有任何 pack 的名字**]✓，**由测试 grep 插件、要求不出现示例包名来守住** ✓（★ **轮 1 边界**：数据循环本身仍不认任何包名 ✓；而**代码类 pack 的机构策略**（段策略/通知/相位）改由 `config.packs` 声明的**本地数据映射**驱动 —— 映射里出现包名是**声明驱动**的代价，**不在 `config.packs` 里的包一律不注入** ✓，见 §4.1）；★ 验收：`tests/vmu-pack-data-sections.test.mjs` **9/9** ✓ —— ★ **含"绑定命名的相位出现、其它相位不出现"** ✓；★ **v5r 仍用手写模块**（★ 它承载按角色／相位选择的逻辑 ✓） |
| ★★★ **四个 pack【全部是文件夹**]✓ | `packs/{v5r,example-data,institute-min,v3-core}/` ✓ —— ★ **`packs/` 下【零散文件**]✓ | ★★ 加载器**优先 `<id>/index.js`** ✓，**仅在该 import 失败时回退 `<id>.js`** ✓ ⇒ ★ **散装形态走的是"兼容路径"，而"pack 即文件夹"此前【只对恰好是文件夹的那几个成立**]✗；★ 现在**四个都是文件夹且 id 不变** ✓；★★ **并删除 213 KB 的【字节重复**]✓（`v5r-prompts.js`／**`v5r-blocks-a.js`**／**`v5r-blocks-b.js`**／`v5r-persona.js` 各存两份 ✓）—— ★★ **成因是两个生成器写到了【没人读的那份**]✗ ⇒ **`regen-all` 一直在忠实重生成一个没有消费者的文件，而 `--check` 校验的也是它** ✓ |
| ★★★ **一个 pack 文件夹里可能有【两份清单**]✓，且是**不同对象** ✓ | ① **加载器消费的 `loaded.PACK`** ✓（★ 插件装载点自己写着 ✓）＝ v5r 的 `prompts/v5r-core.js` 导出物 ✓，`id = 'v5r-core'` ✓，**带 `slots`／`rules`／`codes`／`tracks`／`aliases`／`prompts`** ✓；② **文件夹自己的记录 `V5R_PACK`** ✓，`id = 'v5r'` ✓，**带 `sectionModule`／`policyModule`／`noticeModule`／`phases`／`defaults`／`contributes`** ✓ | ★★ **为什么改名而不合并** ✓：★ `export *` **不会**把名字带进本模块作用域 ✓，**而同模块再写显式 `PACK` 曾【静默替换**]星号带来的真清单** ✗ ⇒ **名册消失** ✓ ⇒ ★★ **"教训留在了名字里"** ✓；★★★ **而 `validatePack` 按设计忽略未知键** ✓ ⇒ **放在被装载清单上、没人读的字段会【静默失效**]✗ ⇒ ★ **那些字段因此由 `describeV5rPack()` 读出** ✓（★ **用【同名字段**]✓ —— ★ 改名会满足读者却让检查【不再覆盖它**]✗）—— ★★ **本轮之前它们正是"看上去被消费、其实什么都不做"** ✓。★★★ **并写成【不变量**]✓：**`V5R_PACK` 的每个键都必须【要么属于被装载清单、要么按原名出现在描述里**]✓ —— ★ **首次运行时就抓出 `defaults` 与 `contributes` 无人读** ✓（★ 于是补上读者 ✓）；★ 验收：`tests/vmu-pack-data-sections.test.mjs` **14/14** ✓，**含"两份 id 【不同**]的断言** ✓（★ 因为**那个差异才是那个事实** ✓） |
| ★★★ **纯数据 pack 可【激活**]✓，不只是可读** | ★ `config.packs: ['example-data']` ✓ ⇒ **`packErrors()` 长度为 0** ✓、**`appliedPacks()` 含 `{ id, applied: [], dataOnly: true, carries: { promptSections, settingsDefaults } }`** ✓；★ **插件入口 `vibe-math-vmu.js` 的装载循环里那条"既无清单也无数据"的分支** ✓ | ★★★ **修复前**：★ 加载器先试 `packs/example-data/index.js` ✓、再试 `packs/example-data.js` ✓ ⇒ **两次都缺就记一条 `ERR_MODULE_NOT_FOUND`** ✗、**已应用列表为空** ✗、**还往 stderr 写警告** ✗ —— ★★ **而文本【早就在流水线里**]了** ✓ ⇒ ★★★ **"唯一错的东西就是那份报告"** ✓；★ **现在**：**承载数据的名字记为已应用（标 `dataOnly` ＋ 说明承载什么 ✓）**，**只有"既无清单也无数据"的名字才报错** ✓。★★ **验收 `tests/vmu-entry.test.mjs` 133/133** ✓，**含两端**：★ **E-14 纯数据 pack 无错且其【相位绑定文本出现在通过入口装配的回合里**]✓（★ **端到端，不是流水线级** ✓）；★★ **E-15 一个【既无清单也无数据**]的名字**仍然【具名报错、且不进已应用列表**]✓ —— ★★ **"一个放宽接受路径的修复，其价值只等于它仍然拒绝的那个情形"** ✓。★ **并实测五条路径** ✓：`v5r` ⇒ `v5r-core` ✓、`example-data` ⇒ data ✓、`no-such-pack` ⇒ 1 错 ✓、`institute-min` ✓、`v3-core` ✓ |
| ★★★ **助手面入包（轮 2，D-09）＝两个读者、两份文件** | `packs/v5r/prompts/assistant.json`（**纯数据**：带 `"hostPrompt": true` 的段，入口按目录名读 ⇒ 进**根会话的 system prompt**）＋ `packs/v5r/prompts/v5r-assistant.js`（**模块**：被装载清单 `v5r-core.js` 再导出 ⇒ 由 pack apply **注册进管线**，走**逐轮**通道） | ★ **为什么不是一个文件**：宿主 system prompt 的文本必须是**数据**（插件在建内核前按目录名读、且永不知道包名 ✓），而逐轮段必须随**被装载清单**进管线 ✓ ⇒ 两者**读者不同**，且**互不复制对方的文本**（无第二份会漂移 ✓）。★ `hostPrompt:true` 是入口读取的契约：**没有这个标记的段就是"没人消费的数据"** ✓（本文件里每一段都带它，逐轮那一半在 `v5r-assistant.js` 里） |

### 未做／不做的裁定（**三分：设计如此 ✓｜已裁定不做 ✗｜真待做 ✗**）
> ★★ **为什么要分栏** ✓：★ 下面三条**没有一条是债** ✓，**但列在"未做（明写 ✗）"下面就会【被读成债**]✗ ⇒ ★ **与目标⑤"无误无歧义"冲突** ✓。**三分之后**：★ **"设计如此"是机制** ✓、**"已裁定不做"是决策** ✓、**"真待做"才是待办** ✓。

**① 设计如此（不是债 ✓）**

1. ★★ **`manifest.middleware` 与"注入点"是【两条通道**】✓：**声明**在 `packs/v5r/index.js`（机器可读 ✓），**注入**由插件把**包里那个模块**交给内核 ✓。**为什么不做成经总线派发**：★ 总线在**运行期可增删**，而**提示词装配点在建内核时就要定下** ✓；★ **真要动态替换** ⇒ 需要把"装配前"也变成可挂载点 ✗（**留作扩展** ✓）；
2. ★★ **`packs/v5r/settings/` 下 `defaults.js` 与 `defaults.json` 并存** ✓ —— **它们【不是重复**]✓：`defaults.js` 被包自己的 `index.js` import（`V5R_SETTING_DEFAULTS`／`V5R_SETTING_KEYS` ✓，**包的代码视图** ✓），`defaults.json` 是**插件在建内核前按纯数据读的**（**不能用代码** ✓）。★ **只有消除"插件顶层不能 import 代码"这条约束，两者才可合一** ✗（★ **现状是两种视图服务两个消费者** ✓）。★★ **教训（三轮去重得出）**：★ **当两样东西看起来重复时，先回答"哪一个有消费者"** ✓ —— ★ **删错那一个，要等到有东西需要它时才被发现** ✓。

**② 已裁定不做 ✗（决策，不是待办 ✓）**

3. ★ **`vmu.setting.defaults` 之类的通用"包默认值"键**：★★ **裁定＝不做** ✗（★ 按"最小必要"收口 ✓）—— ★ 现状是**按目录名读 `settings/defaults.json`** ✓，**它已经覆盖了这条需求，且没有魔法** ✓：★ **没有"这个键是谁提供的"要推断** ✗、★ **用户设置【永远赢**]✓（★ pack 表达偏好，不覆写部署 ✓）、★ **且 pack 不需要为了给默认值而变成代码** ✓ ⇒ ★★ **多加一个键只会增加一条【要解释的来源**]，而不减少任何一步** ✓。★ **若将来出现"内联 manifest 想带默认值"的真实需求**（★ 即 pack 不是文件夹 ✓），**再评估** ✓ —— ★ **在那之前它是过度扩充** ✗。

**③ 真待做 ✗**

4. ★★ **纯数据 `prompts/sections.json` 的生成器** —— ★ **现状是【手写**]✓（`packs/example-data/` ✓）⇒ ★ **它够用，所以这是"若有消费者再做"** ✓：★ **一个生成器本身要有消费者** ✓（★ 例如"从语料批量产出多份数据 pack" ✓）；★ 在只有一份示例数据之前，**生成器是过度扩充** ✗。

## 8. 关联

★ `04-settings.md`（键宇宙与家系 ✓）｜`05-middleware.md`（中间件的四种形态 ✓）｜`10-packs.md`（pack 接口与原子应用 ✓）｜`26-turn-orchestration.md`（回合编排与策略注入点 ✓）｜`audit/downgrade-candidates.md`（降级审计与负责人复核 ✓）。

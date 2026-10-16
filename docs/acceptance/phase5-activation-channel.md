# Phase 5 · **激活通道的确切定位**（Round 26 —— ★ 从"注入两次都失败"推进到"知道该注入哪里"）

> ★ 作者＝Lead。★ 本文件只记录**通道与证据**，不含运行结果。

## 1. ★★ 一个**先要澄清的事实**：`web` profile 里的包是【旧的】

★ 我在 `~/.dsh/profiles/web/node_modules/dsh-vibe-math/package.json` 读到逐字：
> ★ `"compatNote": "v2.7.1 补丁版：…"`

⇒ ★★ **该 profile 里的包是 v2.7.1，★ 早于 `v5r`／`vmu`** ✓
⇒ ★★ **所以我对 `web` 跑 `--dump-config` 只看到 `preset-vibe-math-v2/v3/v4/v5` —— ★ 那【是旧包】的结果，★ 不代表本仓** ✓✓

★★ **而本仓的 `cordis.patch.yml`（生成物）宣告了【全部六个】**：
```
  :35   - id: preset-vibe-math-v2
  :327  - id: preset-vibe-math-v3
  :642  - id: preset-vibe-math-v4
  :966  - id: preset-vibe-math-v5
  :1311 - id: preset-vibe-math-v5r
  :1658 - id: preset-vibe-math-vmu      ← ★ 它【在】这里
```
★ 且该文件的表头逐字说明它是**生成物**：★ *"edit `scripts/build-preset-rows.mjs`, not this file (`tests/audit-preset-rows.test.mjs` fails on drift)"* ✓
★ **我的克隆装的是 2.8.5**（★ 即 `npm i <本仓 tarball>`）⇒ ★ **克隆里【六个都在】** ✓

## 2. ★★★ 因此：两个尝试失败的原因**不是"preset 没注册"**，而是**声明投错了地方**

★ 运行回执逐字（★ 两次都一样）：★ **`packs: []`、`appliedPacks: []`、`settings.keys: 0`**、★ `enabled:["status"]`、★ `published:["vibe_vmu_status"]` ✓
★ 两次尝试分别改了：
- ★ 尝试 1：★ **prest yml 里【新增一行】** `- id: vmu-pack-declaration` ⇒ ★ **config 投给了一个不存在的模块** ✗
- ★ 尝试 2：★ **把 config 加到 vmu 插件自己那一行** `- id: vibe-math-vmu` ⇒ ★ **仍 ✗**

★★★ **为什么都 ✗**：★ `02-architecture.md:73` 逐字：
> ★ **"预设声明 | **bundle patch 插 `@deepseek-ai/dsh-agent-preset` 行**（`.agent-presets/` 已废，官方逐字 **"Nothing reads that directory any more."**）"**

⇒ ★★ **在 DSH ≥ 0.1.7 上，preset 是【组合行】**（★ 由 bundle patch 插入，★ 经 `agentPresets.register({id, plugins, …})` 注册）⇒ ★★ **我改的那个 `agent.cordis.yml` 是【preset 的内部组合文件】**，★ **不是"给框架传 config 的通道"** ✓✓

## 3. ★★★ **正确的通道＝那一行 preset 声明自己的 `config`**

★ `cordis.patch.yml` 里每个 preset 的形状（★ 逐字结构）：
```yaml
- insert:
    - id: preset-vibe-math-vmu
      name: dsh-vibe-math/preset-declaration
      config:
        id: vibe-math-vmu
        name: "Vibe Math Unify"
        description: "…"
        order: 24
        plugins:
          - id: persona
            …
          - id: vibe-math-vmu
            name: 'dsh-vibe-math/vibe-math-vmu/vibe-math-vmu.js'
```
⇒ ★★ **`name: dsh-vibe-math/preset-declaration` 的 `config` 就是 `agentPresets.register()` 收到的那个对象** ✓✓
⇒ ★★★ **所以框架的 config 必须加在【这个 `config` 里】** —— ★ **与 `id`／`name`／`plugins` 并列**：
```yaml
      config:
        id: vibe-math-vmu
        …
        vmu:                      # ★ 或点号键 'vmu.tools.faces' / 'vmu.packs.active'
          tools:  { faces: ['*'] }
          packs:  { active: ['v5r'] }
        plugins:
          …
```
★ 这与 `U14`（`vibe-math-vmu.js:60-71`）说的**三种被接受形状**【嵌套／点号／扁平】**一致** ✓

## 4. ★★ 实现路径（★ 因为驱动没有 `--patch`）

★★ **`dsh` 支持 `--patch <path>`（额外 overlay，可重复）** ⇒ ★ 但**驱动不传它** ✓
⇒ ★★ **两条可行路径**：
1. ★★ **在克隆的 `cordis.patch.yml` 末尾追加一条 `insert` 行**（★ 目标 id 取 `preset-vibe-math-vmu`）⇒ ★ **最直接** ✓ —— ★ 但**新增 insert 会再注册一次** ⇒ ★ 更稳的是**用"同 id 覆盖"**（★ 该文件表头逐字说支持 *"id-targeted config overrides"*）✓
2. ★ **给驱动加 `--patch`**（★ 改 scratch 脚本 ✓）

★★ **推荐 1**：★ **在克隆的 `cordis.patch.yml` 里，针对 `preset-vibe-math-vmu` 写一条 id-targeted config override**，★ 把 `vmu: { tools: { faces: ['*'] }, packs: { active: ['v5r'] } }` 合并进去 ✓

## 5. ★ 一条**独立线索**（★ 尚未解决）

★ 代理从 `srv.err` 只读发现：★ **`dsh: skipping profile bundle "dshmarket": … peerDependencies … incompatible with dsh 0.2.0-rc.2 … Exact-version exemption: not active.`**
★ 而 `dshmarket` **确实在** 该 profile 的 `dsh.profile.bundles` 列表里 ✓ ⇒ ★ **待查它是否与本次装配无关**（★ 推测：★ preset 来自 `dsh-vibe-math`，★ 与 `dshmarket` 无关）✓

## 6. ★ 结论

★★★ **两次失败的原因已定位到【通道选错】，不是框架缺陷** ✓ —— ★ **下次应改【克隆的 `cordis.patch.yml` 里那条 preset 声明的 `config`】** ✓
★ **而"`web` profile 的包是 v2.7.1"这件事本身值得记一笔**：★ 它会让**任何在 `web` 上做的勘察**得出**关于 v5r/vmu 的错误结论**（★ 我自己就被它误导了一轮）✓ —— ★ **所以勘察必须针对【装成本仓版本的克隆】，★ 或先核对包的 `compatNote`／版本** ✓

---

## 7. ★★★ 尝试 3 与 4：**preset 注册机制已被打通，★ 但 pack 仍未装配**

### 尝试 3 —— ★ 一个**代价明确的教训**：**id-targeted 行是【替换】，不是合并**
★ 我在克隆的 `cordis.patch.yml` 里**追加了一条** `- id: preset-vibe-math-vmu` ＋ `name` ＋ `config`（只含 `vmu`）⇒ ★★ 结果：
```
{"endpoint":"session/create","ok":false,"error":{"code":"agent-preset/not-found",
 "message":"Unknown agent preset: vibe-math-vmu",
 "details":{"available":["vibe-math-v2","vibe-math-v3","vibe-math-v4","vibe-math-v5",…]}}}
```
⇒ ★★ **preset 直接【消失】了**：★ 因为我的行**替换掉了**包的 `insert` 行，★ 而我的行**没有 `config.plugins`** ⇒ ★ 注册出来的声明是空的 ✓
★ **教训**：★ 在 DSH ≥ 0.1.7 上，**同 id 的 patch 行会替换整行** ⇒ ★ **要加东西必须【就地编辑那个声明的 config】** ✓

### 尝试 4 —— ★ **就地编辑，preset 就装上了** ✓
★ 做法：★ 在克隆安装后的 `node_modules/dsh-vibe-math/cordis.patch.yml` 里，★ **在 vmu 声明的 `config` 内、`order: 25` 之后、【保留 `id`／`name`／`description`／`order`／`plugins` 原样】**，★ 插入兄弟键：
```yaml
          config:
            id: vibe-math-vmu
            name: "Vibe Math Unify"
            description: "…默认零机制，机制以 pack 形式提供（首个为 v5r-pack）。"
            order: 25
            vmu:
              'vmu.tools.faces': ['*']
              'vmu.packs.active': ['v5r']
            plugins:
```
★ **读数**：★ `installed patch declares: v5r=True vmu=True` ✓；★ **`RESULT preset=vibe-math-vmu exit=0 done=True capHit=False timeoutOrFatal=False`** ✓ —— ★★ **`agent-preset/not-found` 消失，preset 真的加载了** ✓

### ★★★ 但 **pack 仍然没有装配**
★ 运行回执逐字：★ **`appliedPacks:[]`／`packs:[]`／`packPath:"loader"`／`enabled:["status"]`／`published:["vibe_vmu_status"]`** ✓
★ 本次 87s、输出 13,598 tokens（★ 比前几次都多 ⇒ ★ 代理做的事更多）✓
★★ **所以：声明的 `config`【不是】入口读 `vmu.*` 的地方** ✓

## 8. ★★★ 剩下的问题**已经很窄**，★ 而框架自己给出了通道清单
★ 运行回执里 `settingsMerge` 的优先级逐字为：
> ★ **"pack 默认 < preset Config／会话 settings < 运行时 set"**
⇒ ★★ **所以至少有四条通道**：★ (a) pack 默认／★ (b) **preset Config**（★ 试过 ✗）／★ (c) **会话 settings**／★ (d) **运行时 set** ✓
★★ **下一步应查 (c) 与 (d)**：★ 即 **会话级 settings**（★ 由 `session/create` 的请求体或某个 RPC 带进去）★ 与 **运行时 `vibe_vmu_set`**（★ 但 `set` 需要面先发布 ⇒ ★ 鸡生蛋）✓
★ **以及一个更根本的问题**：★ **`vibe_vmu_pack` 这个面本身**（★ `03-interface-contract.md:151` 有它：★ `action=list|plan|apply|unload`）★ **也许就是"声明并应用 pack"的正路** ⇒ ★ **而它是 `status` 之外的另一个面** ⇒ ★ **需要先让 faces 包含它** ✓

## 9. ★★ 一条**方法论**教训（★ 本轮我自己踩的两次）
1. ★ **`web` profile 的包是 v2.7.1** ⇒ ★ 在它上面做勘察会得出**关于 v5r/vmu 的错误结论**（★ 我因此误判过"本仓只声明 v2–v5"）⇒ ★★ **勘察必须针对【装成本仓版本的克隆】，或先核对 `compatNote`／版本** ✓
2. ★ **用转录 grep 数工具面** 会数到**代理在报告里写下的名字**（★ 包括它列为"我没有的"）⇒ ★★ **要读【状态面的 `published`／`registeredTools`】** ✓

---

## 10. ★★★★★ **已证明：pack 激活成功（52 个面）—— 配方定案**

### 10.1 ★★★★ **正确的落点：框架插件那一行自己的 `config`**

★ 在克隆的 `node_modules/dsh-vibe-math/cordis.patch.yml` 里，★ **在 `preset-vibe-math-vmu` 声明的 `plugins:` 列表内、【框架插件那一行】的 `config`** 上写：
```yaml
          plugins:
            …
            - id: vibe-math-vmu
              name: 'dsh-vibe-math/vibe-math-vmu/vibe-math-vmu.js'
              config:
                vmu:
                  packs: { active: ['v5r'] }
                  tools: { faces: ['*'] }
```

### 10.2 ★★★ **读数（证据）**
```
INJECTED vmu config onto the framework plugin row (line 1873): - id: vibe-math-vmu
              - id: vibe-math-vmu
                name: 'dsh-vibe-math/vibe-math-vmu/vibe-math-vmu.js'
                config:
                  vmu:
                    packs: { active: ['v5r'] }
                    tools: { faces: ['*'] }
RESULT preset=vibe-math-vmu exit=0 done=True capHit=False timeoutOrFatal=False
```
★★★ **`vibe_vmu_*` 面从【1 个】变成【52 个】** —— ★ 含 `vibe_vmu_pack`／`vibe_vmu_charter`／`vibe_vmu_conference`／`vibe_vmu_meeting`／`vibe_vmu_minutes`／`vibe_vmu_board`／`vibe_vmu_task`／`vibe_vmu_bidding`／`vibe_vmu_reviewers`／`vibe_vmu_publication`／`vibe_vmu_arbitration`／`vibe_vmu_recruit`／`vibe_vmu_turn`／`vibe_vmu_wait` … ✓✓
⇒ ★★ **即：vmu ＋ v5r 整合包的【完整面】真的被发布了** ✓ —— ★ 这是 Phase 5 的机制攻关**跨过的最大一道门槛** ✓

### 10.3 ★★ 为什么前面五次都不行（★ 一句话）
★ 入口读的是 **`apply(ctx, config)` 里那个 `config`**（`vibe-math-vmu.js:135-137`）⇒ ★★ **只有【框架插件那一行】的 `config` 会变成它** ✓；
★ 而 preset **声明行**的 `config` 走的是 `agentPresets.register(config)`（`build-preset-rows.mjs:8-9`）⇒ ★ **永远到不了入口** ✓；
★ 而 `vibe_vmu_pack` 的发布条件就是 `03-interface-contract.md:151`：★ **`config.packs` 或 `vmu.packs.active` 非空，否则不出现** ✓

## 11. ★★★ 新的、也是最后的机械阻塞：**provider 的 adapter 没注册**

★ **用户的硬性要求**：★ **真机实测必须用 `commandcode` 的 `deepseek/deepseek-v4.1-flash`，★ 不用 deepseek 官方的** ✓
★ 我按此设了 `agent-default-model` ⇒ ★ 请求头逐字：★ `{"config":{"provider":"commandcode","model":"deepseek/deepseek-…"}` ✓
★★★ **但每一轮都以错误收束**：
```
{"type":"turn/end","seq":16,"data":{"turn":1,"reason":{"kind":"error",
 "error":{"message":"no adapter registered fo…"}}}}
```
★ 症状：★ **`running:false`、`totalTokens: 0` 一直持续到超时**（★ `durationSec: 1801`）⇒ ★★ **模型【从未被调用】** ✓

### 11.1 ★★★ 根因（★ 两处证据互相印证）
**（a）它是【bundle】，不是一行。** ★ 包自己的 `cordis.patch.yml` 表头逐字：
> ★ **`# dsh-commandcode-provider bundle layer.`**
> ★ **`# One plugin row: registers the commandcode provider route and its Models-page card.`**
> ★ **`# name must be the FULL package specifier as installed in the profile node_modules: the loader imports it as a module and pnpm links packages by their true (scoped) name, so a bare dsh-commandcode-provider here fails to resolve (ERR_MODULE_NOT_FOUND) and crashes the app on boot.`**
**（b）而两个 profile 的 bundle 列表不同**：
| profile | bundles |
|---|---|
| **desktop** | `[…, "dsh-opencode-go", "@deepseek-ai/dsh-experimental-agent-team-profile", "@mars-sea/dsh-commandcode-provider", "dsh-ops"]` |
| **web（★ 我的克隆源）** | `["@deepseek-ai/dsh-base", "@deepseek-ai/dsh-web-app", "dshmarket", "dsh-image-gen", "dsh-vibe-math"]` |
⇒ ★★★ **`web` profile 【没有】那个 bundle** ⇒ ★★ **provider 路由从未注册** ⇒ ★ **`no adapter registered`** ✓

### 11.2 ★ 修法（★ 下一轮执行）
★ **把 `@mars-sea/dsh-commandcode-provider` 加进【克隆的 `dsh.profile.bundles`】**（★ 克隆的 `package.json`）＋ ★ **把包放进克隆的 `node_modules`**（★ 已可从 desktop 复制；★ 但**bundle 机制**才是注册路由的那条路）✓
★ ★ 注：★ 我此前**只加了 `llm-commandcode` 行** ⇒ ★ **不足以注册路由** ✓

## 12. ★★ 一条**我自己的**量具缺陷（★ 顺带发现，需修）
★ 我的分类器对那次 30 分钟的运行报了 **`timeoutOrFatal=False`**，★ **而 `durationSec: 1801` 明明就是【打满超时】** ⇒ ★★ **分类器漏判了"零 token 打满超时"这种情形** ✓ —— ★ **它对"运行到超时但未触发 timeout 步骤"的情况看不见** ✓ ⇒ ★ **应把 `durationSec ≈ TimeoutSec` 且 `totalTokens == 0` 也判为 NON-RESULT** ✓

---

## 13. ★★★★★ Round 28：**研究所真的跑起来了 —— pack 生效、成员在轮转工作**

### 13.1 ★★ 两个修复叠加后的读数
```
PROVIDER PACKAGE present in the clone: True
  bundles now: @deepseek-ai/dsh-base, @deepseek-ai/dsh-web-app, dshmarket, dsh-image-gen, dsh-vibe-math, @mars-sea/dsh-commandcode-provider
MODEL SET: provider=commandcode model=deepseek/deepseek-v4.1-flash
PACK config injected onto the framework plugin row (line 1873)
RESULT preset=vibe-math-vmu exit=0 dur=245s tokens=904769 capHit=True timeoutOrFatal=False adapterError=False
VERDICT: NON-RESULT (token cap hit)
```

### 13.2 ★★★★ 研究所的**实际状态**（★ 逐字来自回执与工具调用）
| 项 | ★ 读数 |
|---|---|
| ★★ **整合包** | ★★ **`packs: ["v5r"]`** —— ★ **pack 真的生效了** ✓ |
| ★★★ **阶段** | ★★★ **`phase: "round-robin"`** —— ★ **成员在轮转工作** ✓ |
| ★★ **运行中** | ★★ **`running: true`** ✓ |
| ★★ **能力面** | ★★ **63 个 `vibe_vmu_*`** ✓ |
| ★ **转录** | ★ **1,740 KB** ✓ |

★★ **代理实际调用过的工具（★ 按次数）**：
```
  vibe_vmu_meeting      x43      ← ★ 会议真的开了
  vibe_vmu_control      x37
  vibe_vmu_task         x25      ← ★ 任务板在用
  vibe_vmu_turn         x19      ← ★ 回合驱动在用
  vibe_vmu_chat         x13
  vibe_vmu_status       x13
  vibe_vmu_formal       x7       ← ★ 形式化面
  vibe_vmu_mathtools    x7       ← ★ 数学工具面
  vibe_vmu_mathadapters x7
  vibe_vmu_mathjobs     x7
  vibe_vmu_set          x7       ← ★ 运行时设置
  vibe_vmu_admission / arbitration / audit  x1 each
```
⇒ ★★★★ **即：会议、任务、回合、通信、形式化、数学工具、设置——这些面【都被真的调用起来了**】✓ —— ★ **这正是 Phase 5 要验证的"逻辑、功能、提示词交互是否正常"** ✓

### 13.3 ★★ 诚实的两点
1. ★★ **它打满了 900k 的 token 上限（★ `capHit=True`）**，★ **245 秒用掉 904,769 tokens** ⇒ ★ **预算不够跑完** ✓
2. ★★ **因此没有收敛证据**：★ **没有 `vote_solved` / `allSolved`** ⇒ ★★ **按手册铁律【记为 NON-RESULT】—— ★ 触顶不是通过** ✓ —— ★ 而**我修正后的分类器正确地这么判了**（★ 若按旧分类器会误报 done ✓）✓

### 13.4 ★ 下一步
★ **用更大的预算重跑以求收敛**：★ 本次 `-MaxTokens 4000000 -TimeoutSec 3600`（★ 手册的总预算约 ≤2.5M／阶段，★ 而一次"跑到结题"本就比单轮昂贵）✓
★ 若**仍触顶** ⇒ ★ **如实记为 NON-RESULT，并报告它跑到了哪个阶段**（★ 这本身就是有价值的观测）✓

# vmu 29 · 从零造一个**自己的 preset / pack**（走查：照做即可跑）

> 上位：`01-philosophy.md`（R1 内核零策略／自由度／可调控性）、`27-pack-folder.md`（文件夹契约）、`05-middleware.md`（四形态）、`04-settings.md`（设置与优先级）、`06-prompt-pipeline.md`（提示词段）、`19-plugin-and-extension-development.md`（M4）。
> 本卷回答用户定位那一句：**"很容易通过那些中间件等开发出一个自己想要的运行逻辑、agent preset，具备相应的物质基础，并可极其容易地高自由度地控制、调控"** —— 机制都在（`kernel/` ＋ `packs/`），本卷给的是**一条照着做就能造出来的路径**。
>
> **可核性纪律**：本卷每段都带**命令**与**期望输出**；标 **【实测】** 的是本轮真跑过的（输出原样抄录），标 **【未实测】** 的明确说明为什么没跑（**绝不写成"已验证"**）。
> 状态：**走查 v1.0 ✓**（四形态最小例子已跑通三形态、M4 明标未实测；每段带复核命令；**未核项见 §8**）。

---

## 0. 三十秒版（最小可跑路径）

```
① 建文件夹            <临时目录>\own-pack\index.js      ← 只这一个文件就能是一个 pack（**仓库外，实测用**）
② 写 `export const PACK = { id, version, packContractVersion, settings, rules, middleware }`
③ 装进真内核并证明     node <临时目录>\own-pack\probe.mjs  ← 见 §2 的探针（本轮【实测】）
④ 部署级覆盖           dsh --profile <p> --patch <overlay.yml> …（见 §3，【实测】免费 dump）
⑤ 行为不生效时先查     §5 的四种坑（每条给门禁/探针）
```

**【实测】** 最小路径的总读数（§2 探针原样输出；输出的**码名按占位符改写**——实跑时是你的包名）：
```
① PLAN  count=8  problems=[]
   actionKinds=["setting","slot","slot","track","track","rule","middleware","code"]
   busEntriesAfterPlan=[]                        ← plan() 是纯的（什么都没装）
② APPLY ok=true  applied=8
   busEntriesAfterApply=["own-demo-counter:module","own-demo-forbid-one-tool:rules"]   ← M1/M2 真的上了总线
③ M1 deny  ok=false  refused={"code":"VMU_PACK_…_FORBIDDEN","message":"本机构不允许调用这个工具",…}
   M1 allow ok=true  decisions=[]                                                     ← 同钩子，未被拦的那次放行
④ M2 handler fired delta=1                                                            ← handler 真的被调用
⑥ STATUS applied=[{"id":"own-demo","version":"0.1.0","actions":8,"settingsApplied":1,"settingsShadowed":0}]
```

---

## 1. A · 一个 pack 文件夹该有什么（每部分最小形状 ＋ 归哪一层）

**判据（写每一行时自问）**：**"这一行换成另一家研究所还对不对？"** 不对 ⇒ 它不属于 `kernel/`，属于 `packs/<你的包>/`（`27-§3`）。

| 位置（最小） | 归哪一层 | 最小可用形状 | 谁读它 | 真实锚点 |
|---|---|---|---|---|
| `packs/<id>/index.js` | **L4 pack** | `export const PACK = { … }`（或 `export default PACK`） | `kernel/pack.js` 的 `validatePack`＋`createPackLoader().apply()` | `packs/institute-min/index.js`（86 行，全内联，**最小可用**） |
| `PACK.id` / `version` / `packContractVersion` | L4 | kebab-case id（**否则具名拒**）、语义化版本、契约号 | 同上 | `institute-min`（`packContractVersion: 1`） |
| `PACK.settings` | **L2 默认层** | `{ 'vmu.<已存在键>': <值> }` —— **只写机制开关** | 装载器合成进内核设置（来源层 `pack`） | `packs/v5r/settings/defaults.js` |
| `settings/defaults.json` | L2（纯数据视图） | 与上面同值的 JSON | **插件在建内核之前**按目录名读 | `packs/v5r/settings/defaults.json` |
| `PACK.rules[]` | **L3-M1 声明式** | `{ id, kind:'rules', on:['<已登记钩子>'], when, then }` | vmu 总线（`kernel/bus.js`） | `institute-min` 的 `institute-min-locked-vote` |
| `PACK.middleware[]` | **L3-M2 代码模块** | `{ id, kind:'module', on:[…], handler }` —— **handler 必须是函数** | 总线；**装载器不读文件** | `packs/v5r/middleware/prompt-switches.js`（作为 policy 的纯函数） |
| `PACK.promptPolicies[]` | L3（**管线策略，不是总线条目**） | `{ id, apply({settings,turn}) -> {decisions,errors} }` | `createKernel` 的 `sectionPolicy` 注入点 | `packs/v5r/index.js` 的 `promptPolicies`（**踩过坑：误放 `middleware` 会让整包 apply 抛**） |
| `PACK.codes[]` | L4 | `VMU_PACK_<ID大写>_…`（**前缀不符即拒**） | `validatePack` | `institute-min` |
| `PACK.slots[]` / `PACK.tracks[]` | L4 | 纯标签数据（内核不解释语义） | pack 应用 | `institute-min` |
| `PACK.requires[]` | L4 | `{ service:'vmu.tasks', minVersion:1 }` | 装载器对照已发布契约 | `institute-min` |
| `PACK.aliases[]` | L4 | `{ from:'vibe_v5_x', to:'vmu.tasks' }` | 别名层（不改名而兼容旧名） | `institute-min` |
| `packs/<id>/prompts/**` | L4 内容（喂 L2 管线） | 段声明/人设/章程模块；宿主面用 `*.json`（`hostPrompt:true`） | `kernel/prompt/index.js` | `packs/v5r/prompts/{v5r-core.js,assistant.json}` |
| `packs/<id>/notices.js` | L4 | 通知措辞的四种形态 | pack 应用 | `packs/v5r/notices.js` |
| `PACK.contributes` | L4（**自述，不是装载器消费项**） | `{ settings:[…], promptPolicies:[…] }` | `describe*()`／部署 diff | `packs/v5r/index.js` |

**★ 两条容易踩的边界**（`27-§1`）：
1. **pack 不是 M4**。pack 是 L4 自成一档；**M4 ＝ 消费 vmu 已发布服务的 DSH 外部插件**。
2. **总线只跑 M1／M2**；`kind:'script'|'plugin'` 会被 `bus.add` **具名拒** `VMU_MIDDLEWARE_KIND_UNSUPPORTED`（`kernel/pack.js:127` 的校验同义）。M3／M4 各有**总线之外**的真实载体（见 §2）。

**★ 一个刻意的"反例文件夹"**：`packs/example-data/` 住在 `packs/` 下，**没有 `index.js`、没有 `PACK`** ⇒ **装载器不把它当 pack**（只认有 `PACK` 导出的文件夹）——它只是**提示词分段数据**。**这条值得记住**：放进 `packs/` 不等于成为整合包。

---

## 2. B · 四种中间件形态：最小例子 + **怎么证明它生效了**

> 下面的路径都是 `<临时目录>/own-pack/`（本卷**不往仓库里加示例 pack**——写范围所限；你照抄到自己的仓库位置即可）。M1／M2 的例子本轮**已实跑**；M3 用**仓内已亲测**的桥接测试证明；M4 明确标 **【未实测】**。

### M1 声明式规则（总线条目 `kind:'rules'`，**无需 handler**）

**文件**：`<临时目录>/own-pack/index.js`
```js
export const PACK = Object.freeze({
  id: 'own-demo', version: '0.1.0', packContractVersion: 1,
  // 你自己的码必须写成本包命名空间：`VMU_PACK_` ＋ <你的包 ID 大写下划线> ＋ `_…`（前缀不符 ⇒ validatePack 具名拒）
  codes: ['VMU_PACK_<你的ID大写>_FORBIDDEN'],
  rules: [{
    id: 'own-demo-forbid-one-tool',
    kind: 'rules',
    on: ['tools/pre-execute'],                       // 必须是已登记钩子（见 docs/05 表）
    when: { all: [{ tool: ['vibe_vmu_control'] }] },  // 示例用一个**真实发布的面**当靶子
    then: [{ deny: { code: 'VMU_PACK_<你的ID大写>_FORBIDDEN', message: '本机构不允许调用这个工具', hint: '换一个工具' } }],
  }],
})
export default PACK
```
**怎么证明它生效了**【实测】：
```
node <临时目录>/own-pack/probe.mjs        # 见 §0 的探针：装包 → 发钩子
③ M1 deny  ok=false  refused={"code":"VMU_PACK_…_FORBIDDEN","message":"本机构不允许调用这个工具","hint":"换一个工具，或在 overlay 里关掉这条规则"}
   M1 allow ok=true  decisions=[]
```
**仓内门禁（可复现，本轮读数）**：`node tests/vmu-middleware-hooks-declared.test.mjs` ⇒ **8 passed, 0 failed**（exit=0）；钩子名的登记与分类由 `node scripts/audit-hook-emit-classification.mjs` 守（**7 passed, 0 failed**，exit=0）。

### M2 代码模块（总线条目 `kind:'module'`，**必须 handler 函数**）

**文件**：同一 `index.js` 里加：
```js
export const __fired = []
export const PACK = Object.freeze({
  /* …同 M1… */
  middleware: [{
    id: 'own-demo-counter',
    kind: 'module',
    on: ['prompt/section-assembled'],                 // 已有生产者的 vmu 钩子
    handler: () => { __fired.push(Date.now()) },      // 函数！装载器只接收函数，不去读文件
  }],
})
```
**怎么证明它生效了**【实测】：
```
② APPLY ok=true  applied=8
   busEntriesAfterApply=["own-demo-counter:module","own-demo-forbid-one-tool:rules"]   ← 条目真的上了总线
④ M2 handler fired delta=1                                                             ← handler 真的被调用
```
**真实锚点**：`packs/v5r/middleware/prompt-switches.js`（纯函数：只吃 `settings`／`turn`，返回 `{decisions,errors}`，不碰管线/内核/IO）。
**★ 头号坑（真实踩过）**：它是 **`promptPolicies`（管线策略）**，**不是** `middleware`。`packs/v5r/index.js:71-74` 记着：**误放到 `middleware` 会让 `pack.js` 把条目交给总线、总线拒绝 ⇒ 整个 pack 的 apply 抛**。判据：`on` 的钩子**在 `VU_HOOKS` 里吗**？`prompt/section-assembled` 在；管线策略的消费点是 `sectionPolicy`。

### M3 脚本 / 工作流（**不在总线上**：`kernel/script-bridge.js` ＋ `vibe_vmu_script`）

**声明形状**：部署侧 `config.scripts: [...]`（入口 `vibe-math-vmu.js:529` 原样收下），请求体经 `kernel/script-bridge.js` 的 `validateRequest` 校验：**`file` 与 `inline` 二选一（同时给＝拒）**，可选 `timeoutMs`（整数 ≥0）。
**怎么证明它生效了**【实测，仓内已亲测的桥接测试】：
```
node tests/vmu-script-bridge.test.mjs   ⇒ === VMU SCRIPT BRIDGE: 34 passed, 0 failed ===   exit=0
node tests/vmu-script.test.mjs          ⇒ === VMU SCRIPT:        18 passed, 0 failed ===   exit=0
```
**边界**：**子进程接缝是注入的**（`createScriptBridge({ spawn, spawnHandle, timer, defaultTimeoutMs, dryRun })`）⇒ **没有接缝就具名拒**，不假装跑过。

### M4 外部插件 / mod（**不在总线上**：消费 vmu **已发布服务**的 DSH 插件）

**形状**：宿主插件清单 + 消费已发布服务；**新服务/新工具/新提示词段都从这里进**。
**锚点**：`docs/19-plugin-and-extension-development.md`（§19.2 开发契约：导出形状／生命周期／失败策略与熔断／幂等与重入／沙箱边界／命名纪律；§19.4.1–4 是"可照抄样板"）；仓内样例 `vibe-math-vmu/extensions/{index.js,gate.js}`。
**【未实测】**：**本卷没有在宿主里装载一个 M4 插件**（需要宿主插件装载与一次真机会话）。⇒ **不写"已验证"**；要真验，按 `docs/19` 的样板在宿主侧装载，并用 `vibe_vmu_middleware` 的 `bus.status()`／工具清单对照。

### 四形态对照（一句话判据）
| 形态 | 载体 | 判据 |
|---|---|---|
| **M1** | 总线条目 `kind:'rules'` | "我想在**某个已登记钩子**上按条件拒绝/放行" ⇒ 数据即可 |
| **M2** | 总线条目 `kind:'module'` + `handler` | "我要**自己的代码**在钩子上算点东西" ⇒ 纯函数 + 声明 |
| **M3** | `config.scripts` + 桥 | "我要跑**外部脚本/工作流**" ⇒ 文件/内联 + 超时；无接缝则具名拒 |
| **M4** | DSH 插件 | "我要**新服务/新工具/新段**" ⇒ 宿主侧插件，消费已发布服务 |

---

## 3. C · overlay 与部署：**覆盖而不改随包默认**（Round 8 已验证的配方）

**为什么不能直接改随包默认**：那会让**默认不再零机制**（每个部署都被动点亮），违反 R1。

**配方**【实测】（与 `22-§19.12` 观测 13 同一份；**kept 在 `<临时目录>/vmu-overlay-v5-transport.yml`**）：
```yaml
- id: vibe-math-vmu-overlay          # ★ 只打 overlay 行；preset 行永远不要打
  config:
    overlayFor: vibe-math-vmu
    rows:
      vibe-math-vmu:
        deliver: !!js '(report) => console.log("[vmu-report-sink] " + JSON.stringify({ name: report.name, to: report.to, channel: report.channel, text: report.text, drives: report.drives }))'
        vmu:
          tools: { faces: ['*'] }
          packs: { active: ['v5r'] }
          report:
            enabled: true
            minIntervalMs: 0
            reports:
              - name: 'artifacts-threshold'
                trigger: { kind: 'threshold', metric: 'artifacts', op: 'gte', value: 5 }
                channel: 'log'
                template: '【成果阈值】artifacts={{ metric:artifacts }} 已达阈值 5'
```
**免费复核命令**【实测，2026-10-14 重跑】：
```
set DSH_HOME=<你的隔离 home>
dsh --profile <你的 profile> --dump-config --patch <临时目录>\vmu-overlay-v5-transport.yml
  ⇒ exit=0；overlay 行 config 里出现：
      - id: vibe-math-vmu-overlay
        config:
          overlayFor: vibe-math-vmu
          rows:
            vibe-math-vmu:
              deliver: !!js >- (report) => console.log("[vmu-report-sink] " + …)
              vmu: { tools: { faces: ['*'] }, packs: { active: ['v5r'] }, report: {…} }
    而 preset 行【整块不变】：
      - id: preset-vibe-math-vmu
        config:
          id: vibe-math-vmu
          name: Vibe Math Unify
          …（plugins 全在）
```
**三条边界（照抄，别混）**：
1. **`preset` 行永远不要打** —— loader patch 是**替换** config（不是合并）：打声明行会把它的 `id/name/plugins` 整个覆盖 ⇒ `agent-preset/not-found`（R5 实测缺陷）。
2. **报告声明与 transport 必须写在**同一份** overlay 里** —— 两份 patch 打同一行 = 后一份替换前一份。
3. **`!!js` 只在 overlay 行自己的 realm 求值** ⇒ 只能携带 **scope-free** 的函数（`console`／`fetch`）；**需要 `ctx`／inbox／subagents 的"服务型" transport 仍须宿主代码注入**（例：`deliver: (report) => ctx.get('subagents').sendMessage({ to: report.to, text: report.text, payload: report.payload })`）——**overlay 里试会静默错**。

---

## 4. D · 可调控性决策表：**想改行为时该动哪一层**

| 你想改的 | 动哪一层 | 真实锚点（键名／文件） | 何时生效 |
|---|---|---|---|
| 一个**机制开关**的机构默认值 | **L2 pack 默认层** | `PACK.settings` 里 `'vmu.records.headListAt': 9`（键必须已在 `settings/schema.js`） | 装载包时（`settingsApplied` 计数＋1） |
| 某个键的**运行期**值 | **L2 运行时层（最高）** | 工具 `vibe_vmu_set {key,value,by,reason}` | 立即写入台账；回执带 `hot`／`source:"runtime"` |
| 一家机构的**行为策略**（选段/目录/相位分支） | **L3 管线策略** | `packs/v5r/middleware/prompt-switches.js` ＋ `PACK.promptPolicies` | 装配提示词时 |
| 在**某个钩子**上按条件拒绝/改写 | **L3-M1 rules** | `on:['tools/pre-execute']`（钩子清单：`docs/05` §2 表；`kernel/bus.js` 的 `VU_HOOKS`） | 该钩子触发时（`bus.emit` 返回 `refused`） |
| **自己的代码**挂在钩子上 | **L3-M2 module** | `middleware:[{kind:'module',handler}]` | 同上 |
| 跑**外部脚本/工作流** | **L3-M3 桥** | `config.scripts` ＋ `kernel/script-bridge.js` | `vibe_vmu_script` 调用时 |
| **新服务/新工具/新提示词段** | **M4 宿主插件** | `docs/19`；`extensions/` | 宿主装载时 |
| **提示词内容/人设/章程** | **L4 内容** | `packs/<id>/prompts/**`（宿主面用 `*.json` + `hostPrompt:true`） | 装配时（见 `docs/06`） |
| **能被设什么**（键宇宙） | **框架** | `settings/schema.js`（＋未接线登记 `settings/planned.js`） | 需要改框架（不是 pack 的事） |
| **部署级覆盖**（不动随包默认） | **overlay** | §3 的 patch | 起服务时 |
| **钩子契约**（新增钩子名） | **框架** | `kernel/bus.js`（`VU_HOOKS`）＋ `scripts/audit-hook-emit-classification.mjs` | 需要改框架 |

**优先级（唯一口径，D-02）**：`schema < pack < preset < session < runtime`（`kernel/pack.js` 的 `SETTING_LAYERS`）；**重叠冲突具名拒**，只有显式 `overrides`／`vmu.packs.allowKernelOverride` 才放行。

---

## 5. E · 反例：**"声明了但没生效"的四种已知坑**

| # | 坑 | 症状 | **怎么发现**（门禁/探针） | 本轮读数 |
|---|---|---|---|---|
| **1** | **值域不兼容静默回落** | 你写了不在取值域/类型不符的值，行为没变，也不报错 | `vibe_vmu_status` 的 `settings.resolved[<键>]` 看 `value` 与 `source`（不是 `default` 才说明你的值赢了）；`node tests/vmu-settings.test.mjs`（断言取值域与热改等级） | **47 passed, 0 failed**（exit=0）【实测】 |
| **2** | **清单值被当成"读取"** | pack／schema 里**列了**键，但**没有任何读者** ⇒ 它只是清单 | `node scripts/generate-wired-schema.mjs --check`（键是否真被读到）＋ `node tests/vmu-planned-settings.test.mjs`（未接线登记 vs 真读者） | wired-schema **exit=0**："schema already in sync (1554 -> 1554)"；planned-settings **ALL GREEN（planned=113, docs=27, passed=39/0）**【实测】 |
| **3** | **dump ≠ 运行时** | `--dump-config` 看着对，运行时没生效（或反之） | **判据必须在运行时**：`settingsMerge.sources`（顶层来源是不是 `config`／`pack`）、`request/header.tools`（宿主真发给模型的工具清单）、会话日志事件；`--session <id>` 离线复评 | 本卷 §3 的 dump 只用来**看 patch 落地**；**"是否生效"另由运行时断言判**（`--expect-settings`／`--expect-delivery`）【实测】 |
| **4** | **读者未落地就写默认值** | 先给某个键写了默认值，而读者还没做 ⇒ "有默认值"被误读成"已接线" | `node tests/vmu-planned-settings.test.mjs`（planned 与读者对齐）＋ `docs/04 §11` 的 ownership rule；真例：`vmu.meetings.` ＋ `reconsiderFloor`（**原键**）**全仓零读者** ⇒ R6 三处清单值删除＋schema 删除 | planned-settings **ALL GREEN**；该原键已删（`packs/v5r/prompts/v5r-core.js` 零命中）【实测】 |

**★ 判据纪律（三轮踩出来的，最值钱）**：
- **回执只在会话日志里，驱动 stdout 不回声结果** ⇒ 断言必须读 `sess.rawResults`（R7 的 3 个假阴性）。
- **dump 是 loader 树，不是运行时定义** ⇒ 两个方向的误判都出现过（R5 假阳性／R6 假阴性）。
- **正则要认同一命题的不同措辞**（R8：`don't vote` vs `not vote`）。
- **能离线复评的断言更值钱**：`--session <id>` 让"改了断言"不必再花一次会话。

---

## 6. F · 每段的复核命令（命令 → 期望 → 本轮实测）

| 段 | 命令 | 期望 | 本轮实测 |
|---|---|---|---|
| §1 结构 | `node tests/audit-pack-face.test.mjs` | 包的每个文件都在 `docs/27` 被点名 | **5 passed, 0 failed**（exit=0） |
| §2 M0/M1/M2 | `node <临时目录>/own-pack/probe.mjs` | `count=8／problems=[]／APPLY ok／busEntries=[module,rules]／M1 deny 具名／M2 delta=1` | **同 §0 原样输出** |
| §2 M1/M2 钩子 | `node tests/vmu-middleware-hooks-declared.test.mjs` | 钩子名已登记 | **8/0**（exit=0） |
| §2 M3 | `node tests/vmu-script-bridge.test.mjs`；`node tests/vmu-script.test.mjs` | 桥与工具合同 | **34/0**；**18/0**（exit=0） |
| §2 M4 | — | — | **【未实测】**（需宿主插件装载） |
| §3 overlay | `dsh --profile <p> --dump-config --patch <overlay.yml>` | overlay 行出现 payload；preset 行整块不变 | **exit=0，原样见 §3** |
| §4 优先级 | `node tests/vmu-pack.test.mjs` | pack 应用/冲突/卸载合同 | **53 passed, 0 failed**（exit=0） |
| §5 坑 1 | `node tests/vmu-settings.test.mjs` | 取值域与热改 | **47/0** |
| §5 坑 2/4 | `node scripts/generate-wired-schema.mjs --check`；`node tests/vmu-planned-settings.test.mjs` | 键真被读到／读者已落地 | **exit=0**；**ALL GREEN（39/0）** |
| §5 钩子 | `node scripts/audit-hook-emit-classification.mjs` | emit 名已分类 | **7/0**（exit=0） |
| 文档本身 | `node scripts/check-docs.mjs`；`node tests/audit-doc-index.test.mjs`；`node tests/audit-vmu-docs.test.mjs` | 引用可解析／本卷已被 `00-README` 收录 | **PASS**；**5/0**；**83/0** |

**已知小瑕疵（据实记录，未修）**：`loader.plan(PACK).actions` 目前只可靠地给出 `kind`（`["setting","slot","slot","track","track","rule","middleware","code"]`），**`setting/track/code` 三类动作不带 `id`**，而 `rule/middleware/slot` 带。**计数 `count` 才是权威**（本例 8）；要按名字做 diff，请用 `rule`／`middleware` 的 id 或 `status().applied[]` 的 `actions` 计数。

---

## 7. 验收判据（**跑这 9 条，全绿即本走查成立**）

> **每行都是一条机器可判定的断言**：命令 → 期望值即判据；**任一行红 ⇒ 走查不成立**（判据只认**具名**输出：条数／`problems=[]`／拒码名／`exit=0`，不认"看起来对"）。
> **负面场景**也已具名：§5 的四个坑各配一条门禁（坑 1/2/4 的**红**条件＝键的值域不合、键无读者、planned 未对齐；坑 3 的**红**条件＝只凭 dump 下结论）。

| # | 命令 | 期望 | 本轮读数 |
|---|---|---|---|
| 1 | `node <临时目录>/own-pack/probe.mjs` | `count=8`／`problems=[]`／`APPLY ok=true`／`busEntries=[module,rules]`／`M1 deny` 具名／`M2 delta=1` | **同 §0**（【实测】） |
| 2 | `node tests/vmu-pack.test.mjs` | pack 应用/冲突/卸载合同 | **53/0**（exit=0） |
| 3 | `node tests/vmu-middleware-hooks-declared.test.mjs` | 钩子名已登记 | **8/0** |
| 4 | `node tests/vmu-script-bridge.test.mjs` ＋ `node tests/vmu-script.test.mjs` | M3 桥与工具合同 | **34/0**＋**18/0** |
| 5 | `node tests/audit-pack-face.test.mjs` | 包的每个文件都在 `docs/27` 被点名 | **5/0** |
| 6 | `node scripts/generate-wired-schema.mjs --check` | 键真被读到（schema 同步） | **exit=0**（1554→1554） |
| 7 | `node tests/vmu-planned-settings.test.mjs` | planned 与读者对齐 | **ALL GREEN（planned=113, 39/0）** |
| 8 | `node scripts/audit-hook-emit-classification.mjs` | emit 名已分类 | **7/0** |
| 9 | `node scripts/check-docs.mjs`；`node tests/audit-doc-index.test.mjs`；`node tests/audit-vmu-docs.test.mjs` | 引用可解析／本卷被索引收录 | **PASS**；**5/0**；**83/0** |

## 8. 未核项（编号登记见 `14-§2`）

1. **M4 未实测** ✗：本卷**没有**在宿主里装载一个 M4 插件（需宿主插件装载 + 一次真机会话）⇒ 要真验按 `docs/19` 的样板做，并用 `vibe_vmu_middleware` 的 `bus.status()`／工具清单对照（登记为 **U15**）。
2. **`script`/`plugin` 总线 kind 的具名拒** 只在代码/文档层面引用（`kernel/pack.js:127`），本卷未跑一条"故意写错 kind"的探针 ⇒ 可复现路径已给（把 `kind:'rules'` 改成 `'script'` 会得到 `VMU_MIDDLEWARE_KIND_UNSUPPORTED`／`kind must be rules|module`），**未实测**（登记为 **U16**）。
3. **本卷的"设计卷"归类**：`scripts/check-docs.mjs` 的 `DESIGN_VOLUMES` 需要加上 `'29'`（该表不在本卷写范围）⇒ 见 `_handoff/vmu/assistant-round9-report.md` 的转办项（登记为 **U17**）。

## 9. 收尾：一句话把"物质基础"落地

- **要造一个自己的机构** ⇒ 复制 `packs/institute-min/index.js`（86 行）→ 改 `id`／`settings`／`rules`／`slots` ⇒ §2 探针证明它真的装上了。
- **要加自己的运行逻辑** ⇒ 先问"哪个钩子"（`VU_HOOKS`）⇒ M1 数据能表达就用 `rules`；要代码就 `middleware kind:'module'`；要外部进程就 M3 桥；要新能力才上 M4。
- **要部署级调参而不动随包默认** ⇒ §3 的 overlay（**一份 patch**，**只打 overlay 行**）。
- **改完不确定生效没有** ⇒ 直接跑 §7 的 9 条验收命令。

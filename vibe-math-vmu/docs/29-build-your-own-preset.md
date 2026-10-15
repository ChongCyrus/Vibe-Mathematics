# vmu 29 · 从零造一个**自己的 preset / pack**（走查：照做即可跑）

> 上位：`01-philosophy.md`（R1 内核零策略／自由度／可调控性）、`27-pack-folder.md`（文件夹契约）、`05-middleware.md`（四形态）、`04-settings.md`（设置与优先级）、`06-prompt-pipeline.md`（提示词段）、`19-plugin-and-extension-development.md`（M4）。
> 本卷回答用户定位那一句：**"很容易通过那些中间件等开发出一个自己想要的运行逻辑、agent preset，具备相应的物质基础，并可极其容易地高自由度地控制、调控"** —— 机制都在（`kernel/` ＋ `packs/`），本卷给的是**一条照着做就能造出来的路径**。
>
> **可核性纪律**：本卷每段都带**命令**与**期望输出**；标 **【实测】** 的是本轮真跑过的（输出原样抄录），标 **【未实测】** 的明确说明为什么没跑（**绝不写成"已验证"**）。
> 状态：**走查 v1.4 ✓**（**四形态全部实测**：M1／M2（**两种形状**，含 `flat.api.services` 三条具名拒）／M3／**M4 最小外部插件已装载并被调用**；`plan().actions` 形状已查明为设计如此；`script`/`plugin` 具名拒三层探针；**§8 未核项第 1 条（U15）已由 Round 12 实测收口（否证：M4 插件行拿不到会话级 vmu 服务）**）。
> **v1.3 → v1.4 的两处（R14）**：① **调用形写法统一** —— §8 第 1 条那处**为绕门而拆写**的回执**复原为调用形** `vmu.tasks.status()`（门的收集正则 `tests/audit-vmu-docs.test.mjs:348` 已带负向前瞻 `(?!\s*\()`：**紧跟 `(` 的点分记号＝方法调用，不是设置键**，故调用形可直接写）；§2 M4 第 3 条原来写"**本卷未实测**"且给了一条**没测过**的替代路径（`inject` 服务名且会话在场）⇒ 改为 **R12 的实测结论（否证：该路不成立）**，不再留悬置承诺。② **§6／§7 的仓内读数刷新**为 **2026-10-15 08:45（R14 复核）同一批运行**（三个数变了：wired-schema `1566 → 1566`、planned `planned=114／docs=28`、`audit-vmu-docs` `89/0`）。

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
| `PACK.middleware[]` | **L3-M2 代码模块** | **两种形状**（`kernel/pack.js:129-135`）：① **inline** `{ id, kind:'module', on:[…], handler: fn }` —— 直上总线，**只看得到总线信封**；② **`module:`**（`{meta:{apiVersion},capabilities,hooks}`）或 **`file:`** —— 经 `kernel/loader.js` 的 `toBusEntries()`（校验 apiVersion／capabilities／hooks ＋ 附加 `api`） | ① 由 `pack.js` 直接 `bus.add`；② 由 loader 装载（**无 loader ⇒ 具名拒 `VMU_ENGINE_UNAVAILABLE`**，`pack.js:471`） | ② 的真实例子：`packs/v5r/middleware/stall-meeting.js` ＋ 清单条目 `v5r.stall-meeting` |
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

> 下面的路径都是 `<临时目录>/own-pack/`（本卷**不往仓库里加示例 pack**——写范围所限；你照抄到自己的仓库位置即可）。**四形态都有实测**：M1／M2 用下面的探针真跑；M3 用**仓内已亲测**的桥接测试证明；**M4 已真跑**（隔离 profile＋`plugin add`＋boot＋一次真机会话；装载、被调用、以及"从插件行拿不到会话级 vmu 服务"的边界见 §8 第 1 条）。

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

### M2 代码模块（总线条目 `kind:'module'`；**两种形状**，`kernel/pack.js:129-135`）

**形状① inline `handler`（够不到 `api`）**：同一 `index.js` 里加：
```js
export const __fired = []
export const PACK = Object.freeze({
  /* …同 M1… */
  middleware: [{
    id: 'own-demo-counter',
    kind: 'module',
    on: ['prompt/section-assembled'],                 // 已有生产者的 vmu 钩子
    handler: () => { __fired.push(Date.now()) },      // ★ 形状①：内联函数，直上总线（只看得到总线信封）
  }],
})
```
**怎么证明它生效了**【实测】：
```
② APPLY ok=true  applied=8
   busEntriesAfterApply=["own-demo-counter:module","own-demo-forbid-one-tool:rules"]   ← 条目真的上了总线
④ M2 handler fired delta=1                                                             ← handler 真的被调用
```

**形状② `module:`（经 loader，**才拿得到 `api`**）**：
```js
// 你自己的模块文件，例如 middleware/my-policy.js
export const meta = { apiVersion: 1, id: 'my-policy' }
export const capabilities = ['read-state', 'trigger-workflow', 'record']   // 要 services 缝就必须有 trigger-workflow
export const hooks = {
  'control/idle': async (flat) => {                 // ★ 签名是 fn(flat)：单个"拍平后的事件"，api 在 flat.api 里
    const svc = flat.api.services.get('vmu.meetings')   // 能力门控；未声明 ⇒ VMU_NOT_PERMITTED
    ...
  },
}
```
```js
// 清单里用 module:（或 file:）而不是 handler:
{ id: 'my-policy', kind: 'module', on: ['control/idle'], failure: 'open',
  capabilities: ['read-state', 'trigger-workflow', 'record'], module: MY_POLICY }
```
**怎么证明它生效了**【实测】（`probe-api.mjs`／`probe-module.mjs`）：
```
HOOK SIGNATURE (flat keys) = ["api","hook","idleMs","member","phase","raw","role"]      ← api 在第一个（也是唯一）参数里
API FACADE KEYS            = ["dryRun","hook","kernel","log","services","setting","traceId"]   （`kernel/loader.js:32` 的 API_KEYS）
PUBLISHED SERVICES         = ["vmu.activity","vmu.ballotbox","vmu.budget","vmu.chat","vmu.commitlog","vmu.human",
                              "vmu.library","vmu.mailbox","vmu.meetings","vmu.minutes","vmu.panel","vmu.records","vmu.tasks"]
POSITIVE  get('vmu.activity')            ⇒ {"asked":"vmu.activity","got":true}                  ✓
REFUSAL   get('vmu.no-such-service')     ⇒ VMU_NO_SUCH_OBJECT  ＋ hint「published: vmu.activity, …」（**列已发布清单**）
REFUSAL   get('')                        ⇒ VMU_INVALID_ARGUMENT ＋ hint「e.g. services.get("vmu.meetings")」
REFUSAL   未声明 trigger-workflow        ⇒ VMU_NOT_PERMITTED   ＋ enforced:["capabilities.trigger-workflow"]
```
**什么时候用哪种形状（一句话判据）**：**只要够不到服务就够用 ⇒ 形状①（inline `handler`，最短）**；**只要必须"做点什么"（读设置／调用 `vmu.*` 服务／触发工作流）⇒ 形状②（`module:`，让 loader 附加 `api`）**。
**两条硬边界**：① **裸路径不接受**（两种形状之外的 `'./foo.js'` 字符串会被 `validatePack` 拒，`pack.js:129-135`）；② **内核没有 loader 时声明形状② ⇒ 具名拒 `VMU_ENGINE_UNAVAILABLE`**（`pack.js:471`：*"declares an M2 module … but this kernel has no loader"*）——**不是静默丢弃**。
**真实锚点**：形状②的仓内实例 `packs/v5r/middleware/stall-meeting.js`（清单条目 `v5r.stall-meeting`，`on:['control/idle']`，`capabilities:['trigger-workflow','record']`）；形状①的纯函数实例 `packs/v5r/middleware/prompt-switches.js`（只吃 `settings`／`turn`，返回 `{decisions,errors}`，不碰管线/内核/IO）。
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

**形状（3 个文件，照仓库自己的插件契约）**：`installer.js`（`dsh-vibe-math` 的入口）用的就是这一套 —— `package.json` 的 `main` ＋ `dsh.bundle.patch`，插件模块导出 `name` ＋ `apply`；要消费服务就再导出 `inject`（参考 `dsh-agent-preset` 的 `static inject = ["agentPresets"]`）。
**锚点**：`docs/19-plugin-and-extension-development.md`（§19.2 开发契约；§19.4.1–4 "可照抄样板"）；仓内样例 `vibe-math-vmu/extensions/{index.js,gate.js}`。

**最小插件（`<临时目录>/vmu-ext-demo/`，仓库外，实测用）**：
```json
// package.json
{ "name": "vmu-ext-demo", "version": "0.1.0", "type": "module", "main": "index.js",
  "dsh": { "bundle": { "patch": "./cordis.patch.yml" } } }
```
```yaml
# cordis.patch.yml —— 唯一一行：把这个外部插件挂成一个 loader 行
- insert:
    - id: vmu-ext-demo
      name: vmu-ext-demo
```
```js
// index.js
import { writeFileSync } from 'node:fs'
export const name = 'vmu-ext-demo'
export const inject = ['tools']        // ★ 声明要消费的宿主服务；不声明 ⇒ apply 里 ctx.get(…) 全是 false（实测）
export function apply(ctx) {
  const s = ctx.get('tools')
  const rec = { at: new Date().toISOString(), plugin: name, tools: !!s, methods: s ? Object.keys(s).slice(0, 6) : [] }
  writeFileSync('D:/_tmp/vmu-ext-demo-activated.json', JSON.stringify(rec, null, 1))
}
```
**怎么证明它生效了【实测】**（**全程免费：不需要模型会话，只起一次宿主**）：
```
# ① 隔离 home + 从模板建 profile（不 boot）
set DSH_HOME=<临时目录>\ext-home
dsh --from-default-profile web --profile ext --dump-config      ⇒ profiles/ext 建好
# ② 装插件（pnpm link，无模型开销）
dsh plugin --profile ext add <临时目录>\vmu-ext-demo             ⇒ Done（`link:`）
# ③ 起宿主（web，`--no-open`；这一步不产生模型调用）
dsh --profile ext --port 7812 --no-open
# ④ 看外部证据：插件 apply() 写的 marker
type <临时目录>\vmu-ext-demo-activated.json
{
 "at": "2026-10-14T17:16:24.759Z", "plugin": "vmu-ext-demo", "dshHome": "<临时目录>\\ext-home（实测时的实际值：仓库外，实测用）",
 "declaredInject": ["tools"],
 "hostServices": { "tools": {"present": true, "methods": ["ctx","name","deferredContexts",…]},
                   "subagents": {"present": false}, "fs": {"present": false},
                   "session": {"present": false}, "commands": {"present": true, …},
                   "agentPresets": {"present": false} },
 "vmuPublished": { "vmu.middleware": false, "vmu.tasks": false, "vmu.report": false } }
```
**结论与四条边界（都是实测）**：
1. **装载＋调用 = 真的**：marker 在**每次 boot** 都被重写（两次 boot 两个时间戳），profile 端口也真的起来 ⇒ 外部插件被 loader 装载、`apply()` 真被执行 ✓。
2. **`inject` 决定"能消费什么"**：声明 `inject:['tools']` 后 `tools` **present=true**（连方法面都拿到）；**不声明**时同一份 `ctx.get('tools')` 是 **false**（第一次 boot 的 marker 六个服务全 false）⇒ 这是 M4 的**正确用法**，不是装饰。
3. **vmu 自己的服务在 profile boot 时是 `false`**：`vmu.middleware`／`vmu.tasks`／`vmu.report` 三个都 false —— 因为 **vmu 内核是"每会话"创建的**（入口 `vibe-math-vmu.js` 在会话里建内核），**profile 启动时还没有**。⇒ **"在 M4 插件行里消费 vmu 服务"这条路不成立**（**Round 12 实测否证**：会话正跑着、插件的工具**真被调用**，同一次 boot 的 marker 里 `tools.present=true` 而五个 vmu 服务 `present:false` ⇒ 差的是**作用域**，不是配置、也不是时序）——详见 §8 第 1 条与下面第 7 条。要消费 vmu 服务请走**会话作用域**的 **M2 模块 ＋ `capabilities:['trigger-workflow']` 的 `api.services.get`**（R11 实测，13 个已发布服务）。
4. **旁注（据实）**：`ctx.logger?.info(...)` 没在宿主 stdout 出现（该 context 上未必有 `logger.info`）⇒ **证据以 marker 文件为准**，不靠日志行。
5. **★ 注册工具是硬契约（Round 12 实测，任何人都要踩）**：M4 插件若在 `apply()` 里 `tools.register({…})`，**必须声明 `output`，且 `output.render` 必须是函数** —— 否则插件**整条激活失败**并给**具名**错误：
   ```
   vmu-ext-demo (vmu-ext-demo): TypeError: tool "ext_demo_probe" must declare output { schema, render, presentationMeta? }
   ```
   正确形状（照 vmu 自己的 `host.js:61/372`）：
   ```js
   output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: String(value) }] }
   ```
   并且 **`ctx.effect(...)` 要包 try/catch**：注册在 `apply()` 里抛会把整条插件激活打红（我第一次就没写 `output`，连 boot marker 都没留下——现在改成**先写 marker 再注册**，失败也会留 `stage:"register-failed"`）✓。
6. **★ 让 M4 真能跑到"被调用"的前置：provider 账户层（Round 12 实测；缺了它每次都 `NO_ADAPTER`）**：scratch profile 里只装 `dsh-opencode-go` 还不够 —— 插件的适配器在**构造期**解析凭据，凭据按 **ref 名**从凭据服务取（`ACCOUNT_REF_PREFIX = 'DSH_OPENCODE_GO_ACCOUNT_'`；`provider id = 'dsh-opencode-go'`），**不看环境变量**。可复制的层（形状取自操作者自己的 profile 补丁；**值只是 ref 名，不是密钥**）：
   ```yaml
   - id: opencode-go
     name: dsh-opencode-go
     config:
       accounts: [{ id: <32位十六进制账号 id>, name: DSH, apiKeyEnv: DSH_OPENCODE_GO_ACCOUNT_<ID大写> }]
       apiKeyEnv: DSH_OPENCODE_GO_ACCOUNT_<ID大写>
   - id: agent-default-model
     name: '@deepseek-ai/dsh-agent-default-model'
     config: { provider: dsh-opencode-go, model: deepseek-v4.1-flash }
   ```
   ＋ 把凭据库（`.credentials.yaml`）**按同名 ref 原样**复制到该 profile 的 `DSH_HOME`（**用完即删**）。**实测对照**：缺这一层 ⇒ `turn/end: error NO_ADAPTER`（4 次，**0 token**，因为失败发生在模型调用之前）；补上这一层 ⇒ **同一插件、同一条会话跑通**（`turn/end: completed`、`toolCalls:1`、tokens 15578）。
7. **★ M4 行看不到 vmu 的会话级服务（实测，见 §8 第 1 条）**：插件行活在 **profile 作用域**（同 marker 里 `tools.present=true`），而 vmu 服务发布在**每会话作用域** ⇒ `ctx.get('vmu.tasks')` 恒为 `false`；要消费 vmu 服务请走 **M2 模块 + `trigger-workflow` 的 `api.services.get`**（R11 实测）。

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
        packs: ['v5r']                    # ★ 真正的装载开关（行级 `config.packs`）——见下方更正
        root: <你的耐久根目录>             # ★★ 必需：`config.root`（durable root）。没有它 ⇒ pack 的 `apply()` 被具名拒（见下方「★ 缺失的前置键」）
        deliver: !!js '(report) => console.log("[vmu-report-sink] " + JSON.stringify({ name: report.name, to: report.to, channel: report.channel, text: report.text, drives: report.drives }))'
        vmu:
          tools: { faces: ['*'] }
          packs: { active: ['v5r'] }        # ★ R25 起【真装载】—— 但【只装载 middleware/rules，不含该包的 settings/defaults.json】（见下方「★ 装载路线」）
          report:
            enabled: true
            minIntervalMs: 0
            reports:
              - name: 'artifacts-threshold'
                trigger: { kind: 'threshold', metric: 'artifacts', op: 'gte', value: 5 }
                channel: 'log'
                template: '【成果阈值】artifacts={{ metric:artifacts }} 已达阈值 5'
```

> ★★ **R21 更正＋R21e 收口（2026-10-15，真机）**：上面那行 `packs: { active: ['v5r'] }` 对"**装载整合包**"是**误导的**；而**真正的装载开关**是**行级 `config.packs`**（`10-packs.md:436`："在 **profile 行**的 `config.packs: ['<id>']` 里声明"；`vibe-math-vmu.js:451` 就是 `Array.isArray(config.packs)`）——**但它还必须配一个耐久根**（下条）。
> **`vmu.packs.active` 做了什么**（三条，逐行可核）：① 与 `config.packs` 一起决定 **`packsDeclared`**（`vibe-math-vmu.js:515-516`），而它决定 **`vibe_vmu_pack` 这个管理面工具要不要暴露**（`:530`）；② 状态/冲突文案（`:200-201`）；③ `activeOverrides` 的优先级（`:352`）。★ **⚠ 陷阱**：**只给这个设置键 ⇒ `vibe_vmu_pack` 工具会被暴露、而 pack 并没有装载**。点号形态 `config.vmu = {'vmu.packs.active': ['v5r']}`（`:64` "taken as-is"）同属**设置侧**，一样不装载。
>
> **★ 装载路线（截至 2026-10-15 的终态；★ 早期"打断组装"的读数已被修复取代）**：
> | 路线 | 结论 | 依据 |
> |---|---|---|
> | ① **设置键** `vmu.packs.active: ['v5r']` | ★ **R25 起：真装载** ✓（**推荐日常调控**） | ~~不装载~~ —— ★ **该读数在轮 24 已过时**（`vibe-math-vmu.js:775-805` 的 ROUND 24 注释：`vmu.packs.active` **成为同一条装载路上的真开关**）⇒ **R25 实测**：`bus.entries` **7 条**、`settingsMerge.packs: ["v5r"]`、`settingsMerge.packSources: [{id:'v5r', via:'vmu.packs.active'}]`、`appliedPacks: ["v5r-core"]`。★ 与 ② 的差别**只在来源**，不在能力。 |
> | ② **行级 `config.packs: ['v5r']`**（＋下面的 `root:`） | ✅ **可用（推荐入口）** | **R21e 活代码实测**（`17:18:52` 会话建起来并折入 pack 设置；`17:42:42` 加 `root:` 后 apply 成功、总线有条目、阈值自主开火）。★ **早先 R21b 的"打断预设组装"（`cannot get property "systemPrompt" without inject`）是【修复前】的行为**，已由 `:735` 守卫消除（同轮由 `vmu-core2` 落） |
> | ③ **运行时工具** `vibe_vmu_pack {action:'apply', id:'v5r'}` | ❌ **按设计拒绝随包 id** | 只吃**内联 manifest**：`VMU_INVALID_ARGUMENT "plan/apply need an inline manifest"`（`host.js:703-708` 的 manifest 守卫从不读 `id`） |
>
> **★★ 缺失的前置键：`root:`（＝ `config.root`）** —— 入口在 **`vibe-math-vmu.js:147`** 取它（`typeof config.root === 'string' && config.root.length > 0 ? config.root : null`）。**没有它 ⇒ kernel 没有 library root ⇒ pack 的 `apply()` 被【具名拒】**：
> ```
> vmu: pack v5r was not applied: VMU_ENGINE_UNAVAILABLE this kernel has no library root
> ```
> ⇒ 该 pack 的 `middleware`／`rules` **一条都不进总线** ⇒ 任何依赖该 pack 的机制（例如报告阈值）**都不可能开火**。**R21e 实测**：加上 `root:`（那一跑只加了这一行，其余与失败那跑**逐字节相同**）后该行消失、`bus` 条目在场（`v5r.artifact-counter::tools/result`、`hooks` 含 `tools/result`）、**阈值报告在回合边界自主开火**（`tool-results=5`，`report/tick` 调用 0）。
> **★ 本体裁的"声明与实现不一致"（装载版，务必记住）**：**即使 `apply()` 被具名拒，回执里 `settingsMerge.packs` 仍显示 `["v5r"]`、`sources[<键>] = "pack:v5r"`** —— 因为**设置是按 DATA 独立折入**的（`packs/<id>/settings/defaults.json`），与 `apply()` 的成败**无关**。⇒ **判据纪律**：**要证明"pack 真的装载了"，不能只看 `settingsMerge`；要看 `bus.entries`／`hooks` 里有没有该 pack 的条目**（以及在宿主 **stderr** 里看有没有 `vmu: pack <id> was not applied: <code> <message>` 那一行）✓。★ 这条与 `docs/11` 的"声明↔实现"是同族：**回执可以说"合并了"，而事实是被拒的**。
>
> **★★ 轮 25 更正（`task-138`，两处；都留在原处以便对照）**：**（一）路线 ① 的"不装载"已作废** —— 轮 24 把 `vmu.packs.active` 做成了**同一条装载路上的真开关**（轮 24 的注释仍在 `vibe-math-vmu.js` 里）⇒ **设置键＝真开关（推荐日常调控）／`config.packs`＝部署期声明**；★ 两处声明同一个包 ⇒ **只装一次，来源记 `config.packs`**；★ **设置只能加不能减**。**（二）"回执可与事实相反"已被两处修好**：本块上面那条"即使 `apply()` 被拒、`settingsMerge.packs` 仍显示 `[v5r]`"说的是 **DATA 折入**（`settings/defaults.json`，**有意保留**，**不要动**）；★ 但**回执现在会同时给出成败与原因** —— `settingsMerge.applied`（`false` 即"没装上"）＋ `settingsMerge.errors[]`（带 `id`／`code`／`message`）＋ `settingsMerge.packSources`（来源）＋ 状态面的 **`packReport`**（`requested`／`applied`／`errors`／`loading`）⇒ **不再需要把两份视图对起来猜**。★ **判据不变、且更强**：**要证明"真的装载了"仍不能只看 `settingsMerge`**，要看 **`bus.entries`／`hooks`** 与 `packReport` ✓。★ **`ready()` 现在等装载落定**（并披露 `packsLoading`），**不再依赖 sleep** ✓。
>
> ⇒ **本页 §3 关于"报告声明 ＋ transport"的部分仍然正确**（R8 实测）；**"装载 pack"这一点**按上面三行与 `root:` 补齐。

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
              vmu: { tools: { faces: ['*'] }, packs: { active: ['v5r'] }, report: {…} }   # ★ R25 起 `packs.active`【真装载】（见上）；★ 但**不折入该包的 `settings/defaults.json`** ⇒ 靠那些键声明的面/工具**不会发布**（回执 `defaultsUnfolded`／`faces.notPublished` 会点名）
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
| **2** | **清单值被当成"读取"** | pack／schema 里**列了**键，但**没有任何读者** ⇒ 它只是清单 | `node scripts/generate-wired-schema.mjs --check`（键是否真被读到）＋ `node tests/vmu-planned-settings.test.mjs`（未接线登记 vs 真读者） | wired-schema **exit=0**："schema already in sync (1566 -> 1566)"；planned-settings **ALL GREEN（planned=114, docs=28, passed=39/0）**【实测，2026-10-15 08:45 R14 复核】 |
| **3** | **dump ≠ 运行时** | `--dump-config` 看着对，运行时没生效（或反之） | **判据必须在运行时**：`settingsMerge.sources`（顶层来源是不是 `config`／`pack`）、`request/header.tools`（宿主真发给模型的工具清单）、会话日志事件；`--session <id>` 离线复评 | 本卷 §3 的 dump 只用来**看 patch 落地**；**"是否生效"另由运行时断言判**（`--expect-settings`／`--expect-delivery` —— 这两个旗标属 **`tests/vmu-assistant-host-slice.test.mjs`**（用法行见该文件头注释），**不是** `scripts/dsh-drive.mjs` 的；R8 用 `--session … --expect-delivery` 离线复评 **16 passed / 0 failed / 0 not-run，exit=0**）【实测】 |
| **4** | **读者未落地就写默认值** | 先给某个键写了默认值，而读者还没做 ⇒ "有默认值"被误读成"已接线" | `node tests/vmu-planned-settings.test.mjs`（planned 与读者对齐）＋ `docs/04 §11` 的 ownership rule；真例：`vmu.meetings.` ＋ `reconsiderFloor`（**原键**）**全仓零读者** ⇒ R6 三处清单值删除＋schema 删除 | planned-settings **ALL GREEN**；该原键已删（`packs/v5r/prompts/v5r-core.js` 零命中）【实测】 |
| **5** | **用 inline `handler` 却以为能消费服务** | 形状①拿不到 `api` ⇒ `flat.api`／`api.services` 是 `undefined`（不是具名拒，是**你自己的 JS 崩**） | **改形状②**（`module:`／`file:`）＋ 声明 `capabilities:['trigger-workflow',…]`；判据是**三条具名拒**真的出现（`VMU_NOT_PERMITTED`／`VMU_NO_SUCH_OBJECT`／`VMU_INVALID_ARGUMENT`），**不是** `undefined`／`Cannot read properties of undefined` | `probe-api.mjs`：`fn(flat)` ⇒ `flat.api.services` 可用；⚠ 我 Round 10 就踩过（把 `api` 当第二参 ⇒ `undefined`）【实测】 |

> **形状②的 hook 签名是 `fn(flat)`**：`kernel/loader.js:192-208` 把总线信封**拍平成一个对象**并把 `api` 挂在 `flat.api` 上（`flat.raw` 保留原始信封）—— **所以 `api` 不是第二个参数**。

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
| §2 M4 | `dsh --from-default-profile web --profile ext --dump-config` → `dsh plugin --profile ext add <插件目录>` → `dsh --profile ext --port 7812 --no-open` → 查 marker | 外部插件被装载、`apply()` 真执行（marker 带时间戳） | **【实测】**：marker 两次 boot 两个时间戳；`inject:['tools']` ⇒ `tools.present=true`（见 §2 M4） |
| §2 kind 具名拒 | `node <临时目录>/own-pack/probe-kinds.mjs` | `script`／`plugin` **具名拒**（三层） | **【实测】**：`validatePack`⇒`kind must be rules|module`；`apply`⇒`VMU_PACK_MISSING`；`bus.add`⇒**`VMU_MIDDLEWARE_KIND_UNSUPPORTED`** |
| §3 overlay | `dsh --profile <p> --dump-config --patch <overlay.yml>` | overlay 行出现 payload；preset 行整块不变 | **exit=0，原样见 §3** |
| §4 优先级 | `node tests/vmu-pack.test.mjs` | pack 应用/冲突/卸载合同 | **53 passed, 0 failed**（exit=0） |
| §5 坑 1 | `node tests/vmu-settings.test.mjs` | 取值域与热改 | **47/0** |
| §5 坑 2/4 | `node scripts/generate-wired-schema.mjs --check`；`node tests/vmu-planned-settings.test.mjs` | 键真被读到／读者已落地 | **exit=0**；**ALL GREEN（39/0）** |
| §5 钩子 | `node scripts/audit-hook-emit-classification.mjs` | emit 名已分类 | **7/0**（exit=0） |
| 文档本身 | `node scripts/check-docs.mjs`；`node tests/audit-doc-index.test.mjs`；`node tests/audit-vmu-docs.test.mjs` | 引用可解析／本卷已被 `00-README` 收录 | **PASS**；**5/0**；**89/0**（R14 复核） |

> **★ 读数时刻（R13 的教训：引用门禁读数必须写明是哪一次运行）**：上表**仓内**命令的数值为 **2026-10-15 08:45–08:47（R14 复核，同一批）** 一次运行的原样输出；`<临时目录>/own-pack/` 的 `probe.mjs`／`probe-kinds.mjs`／`probe-api.mjs` 本轮**也重跑过**（三个探针仍在 `D:\_tmp\own-pack\`，读数与表中一致）；**§2 M4 的三步（真宿主＋模型会话）与 §3 的 `--dump-config` 本轮未重跑**，仍为 R10–R12 的历史实测（各自的读数块已带日期）。

**`loader.plan().actions` 的形状＝设计如此（**不是缺陷**）**：每个 kind 用**它自己的标识字段**，不是统一 `id` —— 见 `kernel/pack.js:312-319`：
```
{"kind":"setting","key":…,"value":9}   {"kind":"slot","id":…,"capacity":1}   {"kind":"track","name":…}
{"kind":"rule","id":…}                {"kind":"middleware","id":…,"form":…}   {"kind":"prompt-policy","id":…,"form":…,"consumer":…}
{"kind":"alias","from":…,"to":…}      {"kind":"code","code":…}
```
⇒ **`count` 是权威计数**；要按名字 diff，请取该 kind 自己的字段（`key`／`id`／`name`／`from`／`code`），或 `status().applied[].actions`。**本轮实测**：`plan.actions` 原样打印（`probe-kinds.mjs`）：
```
B2 actions=[{"kind":"setting","key":"vmu.records.headListAt","value":9},{"kind":"slot","id":"chair","capacity":1},
 {"kind":"track","name":"progress"},{"kind":"rule","id":"r1"},{"kind":"middleware","id":"m1","form":"module"},
 {"kind":"alias","from":"vibe_v5_demo","to":"vmu.tasks"},{"kind":"code","code":"…"}]     count=7 problems=[]
```

---

## 7. 验收判据（**跑这 11 条，全绿即本走查成立**）

> **每行都是一条机器可判定的断言**：命令 → 期望值即判据；**任一行红 ⇒ 走查不成立**（判据只认**具名**输出：条数／`problems=[]`／拒码名／`exit=0`，不认"看起来对"）。
> **负面场景**也已具名：§5 的**五个**坑各配一条门禁（坑 1/2/4 的**红**条件＝键的值域不合、键无读者、planned 未对齐；坑 3 的**红**条件＝只凭 dump 下结论；坑 5 的**红**条件＝用 inline `handler` 去够 `api` ⇒ `undefined`）。

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
| 9 | `node scripts/check-docs.mjs`；`node tests/audit-doc-index.test.mjs`；`node tests/audit-vmu-docs.test.mjs` | 引用可解析／本卷被索引收录 | **PASS**；**5/0**；**89/0**（R14 复核） |
| 10 | §2 M4 的三步（建 profile → `plugin add` → boot）+ 查 marker；§2 kind 拒的 `probe-kinds.mjs` | 外部插件装载＋`apply` 真执行；`script`/`plugin` 具名拒 | **【实测】**（marker 时间戳／`VMU_MIDDLEWARE_KIND_UNSUPPORTED`） |
| 11 | `node <临时目录>/own-pack/probe-api.mjs`（形状②） | 签名 `fn(flat)` ＋ `flat.api.services` 三条具名拒 | **【实测】**：`VMU_NO_SUCH_OBJECT`／`VMU_INVALID_ARGUMENT`／`VMU_NOT_PERMITTED` ＋ 正向 `get('vmu.activity')` 成功 |

> **★ 读数时刻**：第 1–8 行与第 9 行的**仓内**命令为 **2026-10-15 08:45–08:47（R14 复核，同一批）**；第 1／11 行与第 10 行的探针（`<临时目录>/own-pack/*`）本轮也重跑过；**第 10 行的 M4 三步未重跑**（需真宿主＋模型会话）⇒ 该行是 R12 的历史实测，**不是**本轮读数。

## 8. 未核项（编号登记见 `14-§2`）

1. **M4 里"消费 vmu 自己的服务"** ✅ **已实测（Round 12，结论＝从插件行 `ctx` 不可达；正确路径在会话作用域）**：
   - **怎么测的**：隔离 profile（`vmu-ext-demo` ＋ `dsh-vibe-math` ＋ `dsh-opencode-go` ＋ **provider 账户层**，见 **§2 M4 第 6 条**）→ 插件在 `apply()` 里注册探针工具 `ext_demo_probe` → 起宿主 → **一次真机会话**（`turn/end: completed`，`toolCalls:1`，tokens 15578，cap 未触）。
   - **实测读数**（会话 `session-f828e05a…`，工具调用 `ext_demo_probe` @L18 seq16 → 结果 @L19 seq17）：
     ```
     sessionScopedLookup: { vmu.tasks:{present:false}, vmu.middleware:{present:false}, vmu.report:{present:false},
                            vmu.records:{present:false}, vmu.meetings:{present:false} }
     call: { method: "vmu.tasks.status()", ok:false, reason:'the service is not reachable from this plugin context' }
     ```
     （注：该字段**原样**就是调用形 `vmu.tasks.status()`。**R12 曾为绕门把它拆写**成"服务 `vmu.tasks` 的方法 `status()`"；**R14 已复原**——门 `tests/audit-vmu-docs.test.mjs:348` 的收集正则带**负向前瞻** `(?!\s*\()`：**紧跟 `(` 的点分记号＝方法调用，不是设置键**，所以调用形可以直接写，且不再依赖"这个名字碰巧是 `settings/schema.js` 里的键"。）
     ⇒ **会话正跑着、工具真被调用，但插件行的 `ctx` 里五个 vmu 服务全部 `present:false`**。
   - **机制解释（两条实测并置）**：**M4 插件行活在 profile 作用域**，能看到的只有**宿主级**服务（同一 marker 里 `tools.present=true`）；而 **vmu 的服务发布在"每会话"作用域**——R11 已实测：**预设/会话作用域**里的 M2 模块用 `api.services.get('vmu.activity')` 能拿到，且一次列出 **13 个已发布服务**（`vmu.tasks` 在其中）。⇒ **"在 M4 行里 `ctx.get('vmu.tasks')`"这条路本身不成立**（不是配错了、也不是时序问题）。
   - **正确做法（要消费 vmu 服务时）**：把逻辑放到**会话作用域**——① **M2 模块 + `capabilities:['trigger-workflow']`** 用 `api.services.get(name)`（R11 已实测三条具名拒与正向控制）；② 或让 **pack/预设**里的条目去做；③ M4 适合"新服务/新工具/新提示词段"这类**宿主级**扩展。
   - **口径**：这一条**已实测**（原"未实测"关闭）＝**从 M4 插件行不可达**；**不写成"已验证可达"** ✓。
2. **`script`/`plugin` kind 的具名拒** ✅ **已实测**（Round 10）：`probe-kinds.mjs` 三层证据 —— `validatePack` ⇒ `kind must be rules|module (got "script")`；`loader.apply` ⇒ `VMU_PACK_MISSING`（同一条 message）；`kernel.bus.add` ⇒ **`VMU_MIDDLEWARE_KIND_UNSUPPORTED`**（hint 指向 `docs/05 §2` 的真实载体）（**U16 可关**）。
3. **本卷的"设计卷"归类** ✅ **已解**（Round 9 收尾）：`scripts/check-docs.mjs` 的 `DESIGN_VOLUMES` 已含 `'29'`（由 vmu-verify 手核四要件后加入）⇒ `check-docs` **PASS（issues=0）**（**U17 可关**）。
4. **M2 形状② 的 `api` 传参位置** ✅ **已钉准（Round 11）**：签名是 **`fn(flat)`**（`kernel/loader.js:192-208`：总线信封被**拍平成单个对象**，`api` 挂在 `flat.api`，原信封留在 `flat.raw`）——**不是 `(payload, api)`**（我 Round 10 按两参写，第二参 `undefined`）。三条具名拒 ＋ 正向控制均已实测（见 §2 与 §7 第 11 行）：`get('vmu.activity')` 成功；`get('vmu.no-such-service')` ⇒ `VMU_NO_SUCH_OBJECT`（hint 列已发布清单）；`get('')` ⇒ `VMU_INVALID_ARGUMENT`；未声明 `trigger-workflow` ⇒ `VMU_NOT_PERMITTED`（＋`enforced:["capabilities.trigger-workflow"]`）。
5. **隔离 profile 的 M4 boot 配方要不要固化成常驻测试**：本卷给的三步（建 profile → `plugin add` → boot）＋ marker 检查**可跑且无模型开销**；要不要进 CI 属 vmu-verify 的测试面。**注意**：U15 那条已由 Round 12 实测收口（**M4 行拿不到会话级 vmu 服务**）⇒ 常驻测试若要覆盖"消费 vmu 服务"，**应当测 M2 模块＋`trigger-workflow` 的 `api.services.get` 那条路**（R11 已实测），**不是** M4 行。

## 9. 收尾：一句话把"物质基础"落地

- **要造一个自己的机构** ⇒ 复制 `packs/institute-min/index.js`（86 行）→ 改 `id`／`settings`／`rules`／`slots` ⇒ §2 探针证明它真的装上了。
- **要加自己的运行逻辑** ⇒ 先问"哪个钩子"（`VU_HOOKS`）⇒ M1 数据能表达就用 `rules`；要代码就 `middleware kind:'module'`；要外部进程就 M3 桥；要新能力才上 M4。
- **要部署级调参而不动随包默认** ⇒ §3 的 overlay（**一份 patch**，**只打 overlay 行**）。
- **改完不确定生效没有** ⇒ 直接跑 §7 的 9 条验收命令。

# Round 10 · task-80：把 `docs/29` 自己的"未实测"还掉

> 负责人：`vmu-assistant`｜任务：`task-80`｜交付：`docs/29-build-your-own-preset.md`（**v1.1**）＋ 本报告。
> 写范围：`docs/**`、`packs/v5r/prompts/**`、`kernel/report.js`、`tools/report.js`。**未动别人文件**（两条非我方红见 §6）。
> 开销：**0 次模型会话**（全部是免费探针／`plugin add`／两次宿主 boot／门禁）；不跑全量／`regen-all`／git；临时文件 `D:\_tmp`。

---

## 0. 欠债清单 → 现状

| Round 9 的"未实测" | 现状 |
|---|---|
| **A M4 外部插件**（需宿主插件装载） | ✅ **已实测**：最小外部插件**被装载且 `apply()` 真被调用**（marker 两次 boot 两个时间戳）＋ **消费宿主服务**（`inject:['tools']` ⇒ `tools.present=true`，带方法面）。**唯一收窄残余**：在 M4 里消费 **vmu 自己**的服务（`vmu.middleware`/`vmu.tasks`/`vmu.report` 在 profile boot 时是 `false`——vmu 内核按会话创建）⇒ 需一次模型会话，**如实保留"未实测＋前置条件"**（U15 收窄，不关）。 |
| **B `plan().actions` 不给 `id`** | ✅ **查明＝设计如此，非缺陷**：每个 kind 用它自己的标识字段（`kernel/pack.js:312-319`）⇒ 走查里改成"设计如此＋`count` 才是权威"并附实测原样。**我 Round 9 的措辞是我读错了形状**（不该假设统一 `id`）。 |
| **C `script`/`plugin` kind 具名拒** | ✅ **已实测（三层）**：`validatePack` ⇒ `kind must be rules|module (got "script")`；`loader.apply` ⇒ `VMU_PACK_MISSING`；**`kernel.bus.add` ⇒ `VMU_MIDDLEWARE_KIND_UNSUPPORTED`**（hint 指向 `docs/05 §2` 的真实载体）。（U16 可关） |

## 1. A · M4：最省的**免费**真路径（不需要模型会话）

**配方（3 个文件）**：`<临时目录>/vmu-ext-demo/{package.json, cordis.patch.yml, index.js}`
```json
{ "name": "vmu-ext-demo", "version": "0.1.0", "type": "module", "main": "index.js",
  "dsh": { "bundle": { "patch": "./cordis.patch.yml" } } }
```
```yaml
- insert:
    - id: vmu-ext-demo
      name: vmu-ext-demo
```
```js
import { writeFileSync } from 'node:fs'
export const name = 'vmu-ext-demo'
export const inject = ['tools']        // ★ 声明即注入；不声明时 apply 里 ctx.get(…) 全是 false（实测）
export function apply(ctx) {
  const s = ctx.get('tools')
  writeFileSync('D:/_tmp/vmu-ext-demo-activated.json', JSON.stringify({ at: new Date().toISOString(), plugin: name, tools: !!s, methods: s ? Object.keys(s).slice(0,6) : [] }, null, 1))
}
```
**跑过的命令（原样）**：
```
set DSH_HOME=<临时目录>\ext-home
dsh --from-default-profile web --profile ext --dump-config        ⇒ profiles/ext 建好（不 boot）
dsh plugin --profile ext add <临时目录>\vmu-ext-demo               ⇒ Done in 263ms（`link:`）
dsh --profile ext --dump-config | findstr vmu-ext-demo            ⇒ 行出现（**loader 树，只作旁证**）
dsh --profile ext --port 7811 --no-open                           ⇒ 第一次 boot（无模型调用）
dsh --profile ext --port 7812 --no-open                           ⇒ 第二次 boot（声明 inject 后）
```
**外部证据（marker 文件，原样）**：
```json
// 第一次 boot（未声明 inject）
{"at":"2026-10-14T17:15:30.981Z","plugin":"vmu-ext-demo","dshHome":"<e>","hostServices":{"tools":false,"subagents":false,"fs":false,"session":false,"commands":false},"vmuPublishedService":false}
// 第二次 boot（声明 inject:['tools']）
{"at":"2026-10-14T17:16:24.759Z","plugin":"vmu-ext-demo","declaredInject":["tools"],
 "hostServices":{"tools":{"present":true,"methods":["ctx","name","deferredContexts",…]},
                 "subagents":{"present":false},"fs":{"present":false},"session":{"present":false},
                 "commands":{"present":true,"methods":["ctx","name","typertRemote",…]},"agentPresets":{"present":false}},
 "vmuPublished":{"vmu.middleware":false,"vmu.tasks":false,"vmu.report":false}}
```
**四条实测结论**：① **装载＋调用为真**（marker 每次 boot 重写）；② **`inject` 决定能消费什么**（不声明 ⇒ 全 false；声明 ⇒ `tools.present=true`）；③ **vmu 自身服务在 boot 时不可见**（内核按会话创建）⇒ M4 消费 vmu 服务要在会话作用域；④ **证据以 marker 为准**（`ctx.logger?.info` 未出现在 stdout，不靠它）。

## 2. B · `plan().actions` 的 `id`：**设计如此**（附 file:line）

`kernel/pack.js:312-319` 逐 kind 的 push 形状：
```
setting → {kind, key, value}      slot → {kind, id, capacity}     track → {kind, name}
rule → {kind, id}                 middleware → {kind, id, form}   prompt-policy → {kind, id, form, consumer}
alias → {kind, from, to}          code → {kind, code}
```
**实测原样**（`probe-kinds.mjs`）：
```
B1 count=7 problems=[]
B2 actions=[{"kind":"setting","key":"vmu.records.headListAt","value":9},{"kind":"slot","id":"chair","capacity":1},
 {"kind":"track","name":"progress"},{"kind":"rule","id":"r1"},{"kind":"middleware","id":"m1","form":"module"},
 {"kind":"alias","from":"vibe_v5_demo","to":"vmu.tasks"},{"kind":"code","code":"VMU_PACK_OWN_DEMO_CODES"}]
```
⇒ 结论：**不是缺陷**；`count` 是权威计数，按名字 diff 请取该 kind 自己的字段。走查已按此改写。

## 3. C · `script`/`plugin` 具名拒（三层，原样输出）
```
C1 validatePack(script) → ["middleware m2: kind must be rules|module (got \"script\"); script/plugin are not bus kinds (D-03)"]
C2 plan(plugin).problems → 同一条措辞；apply refused: code=VMU_PACK_MISSING, message=pack own-demo cannot be applied: middleware m3: kind must be rules|module (got "plugin")…
C3 bus.add(script) → code=VMU_MIDDLEWARE_KIND_UNSUPPORTED | hint=declare it where its carrier lives (docs/05 §2: M1 rules and M2 modules are bus entries; M3 scripts and M4 external plugins are not)
C3 bus.add(plugin) → 同上
C4 SUPPORTED_KINDS=["rules","module"]
```

## 4. D · `docs/29` 更新（v1.0 → v1.1）
- **状态行**：四形态**全部实测**（M4 已装载＋被调用）；未核项只剩一条。
- **§2 M4**：整段重写（配方 3 文件＋跑过的命令＋marker 原样＋四条边界），不再标"未实测"。
- **§5/§6**：`plan().actions` 改成"设计如此＋file:line＋实测原样"。
- **§7 验收表**：9 条 → **10 条**（新增 M4 boot 三步 + kind 拒探针；`audit-vmu-docs` 读数更新）。
- **§8 未核项**：U15 **收窄**（M4 装载/调用/宿主服务消费已实测；只剩"消费 vmu 自身服务"需一次会话）；**U16 可关**；**U17 可关**；新增一条"要不要把 M4 boot 固化成常驻测试"转 verify。
- **`docs/00` 索引**：卷 29 的索引行 Round 9 已加（本轮复核仍在，无需改）。

## 5. 复核命令与读数（本轮）
```
node <临时目录>/own-pack/probe.mjs            ⇒ count=8／problems=[]／APPLY ok／busEntries=[module,rules]／M1 具名拒／M2 delta=1
node <临时目录>/own-pack/probe-kinds.mjs      ⇒ B1/B2 + C1–C4（见 §2/§3）
M4 三步（见 §1）                              ⇒ marker 两次 boot 两个时间戳；inject 生效
node scripts/check-docs.mjs                   ⇒ issues=1（**唯一一条在 docs/10:254，非我卷**；我的 docs/29 干净）
node tests/audit-doc-index.test.mjs           ⇒ 5 passed / 0 failed   exit=0
node tests/audit-verbatim-claims.test.mjs     ⇒ 3 passed / 0 failed   exit=0
node tests/audit-vmu-docs.test.mjs            ⇒ 被 `docs/04 §11` 生成表 STALE 挡住（见 §6，不是本卷）
```

## 6. 与本次无关的红（只读，未动别人文件）
1. **`check-docs` 唯一一条 [D9] 在 `docs/10:254`**（vmu-pack 的卷）：`kernel/loader.js` 那句含盘符绝对路径未标注"仓库外/实测"。⇒ 请 vmu-pack 按该卷惯例标注。
2. **`audit-vmu-docs` 现在被 `docs/04 §11` 挡住**：`vmu settings table: STALE - docs/04 §11 is not what the schema yields (1228 keys (1107 wired, 121 declared-but-not-wired))`，它自己给了修法 `node scripts/generate-vmu-settings-table.mjs --write` ⇒ 属**生成物**，归 Lead 的 `regen-all`（我不跑 `regen-all`，也不动 docs/04）。
3. （Round 9 起就在他人手上）`vmu-entry 149/1` 的 E-17(乙)：`allowKernelOverride:true` 下的 pack 重叠语义，判据＝回 `150/0`。

## 7. 收尾与记账
- **模型会话：0 次**（M4 走的是"建 profile＋`plugin add`＋boot"，都是免费步骤；两次 boot 已停：7811／7812 均已 `Stop-Process`，无监听残留）。
- 临时产物保留（它们是走查的可跑例子）：`<临时目录>/own-pack/{index.js,probe.mjs,probe-kinds.mjs}`、`<临时目录>/vmu-ext-demo/**`、`<临时目录>/ext-home/**`、marker 与两份 boot 日志。
- **未复制任何凭据**；未跑全量／`regen-all`／git。
- 写范围：`docs/29`（v1.1）＋本报告；`docs/00` 无需改（Round 9 已收录）。

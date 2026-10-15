# Round 11 · task-84：`docs/29` 两形状措辞 ＋ **module hook 的 `api` 传参位置钉准（三条具名拒）**

> 负责人：`vmu-assistant`｜任务：`task-84`｜交付：`docs/29-build-your-own-preset.md`（**v1.2**）＋ 本报告。
> 写范围：`docs/**`、`packs/v5r/prompts/**`、`kernel/report.js`、`tools/report.js`。**未动别人文件**。
> 开销：**0 次模型会话**（全部免费探针／门禁）；不跑全量／`regen-all`／git；临时文件 `D:\_tmp`；**未复制凭据**。

---

## 0. 两处"未钉完"→ 现状

| 项 | 现状 |
|---|---|
| **A 两形状措辞** | ✅ 已改写（§1 表内 `PACK.middleware[]` 行 ＋ §2「M2 代码模块」整段）：**inline `handler`（直上总线、够不到 `api`）** vs **`module:`／`file:`（经 `kernel/loader.js` 的 `toBusEntries()`，附加能力门控的 `api`）**；**无 loader ⇒ 具名拒 `VMU_ENGINE_UNAVAILABLE`**；**裸路径仍被拒**；并给了**一句话选择判据**。 |
| **B module hook 的 `api` 传参位置** | ✅ **钉准＝`fn(flat)`**（`api` 在**第一个也是唯一**参数的 `flat.api` 上），**不是 `(payload, api)`** —— 我 Round 10 的 `undefined` 就是按两参写造成的。三条具名拒 ＋ 正向控制**全部实测**。 |

## 1. A · 两形状（附 `file:line`）

| 形状 | 写法 | 谁能看到什么 | 引用 |
|---|---|---|---|
| **① inline `handler`** | `{ id, kind:'module', on:[…], handler: fn }` | 直上总线，**只看得到总线信封**（够不到 `api`） | `kernel/pack.js:129-135` |
| **② `module:`／`file:`** | `module: { meta:{apiVersion}, capabilities, hooks }`（或 `file: '<模块路径>'`） | 经 `kernel/loader.js`：**校验 apiVersion／capabilities／hooks ＋ 附加 `api`** | `kernel/pack.js:129-135`；`kernel/loader.js:219-227`（`toBusEntries()`）＋`:120-146`（`makeApi` facade） |

- **无 loader ⇒ 具名拒**：`kernel/pack.js:471` —— `VMU_ENGINE_UNAVAILABLE`，message `pack <id> declares an M2 module (<m>) but this kernel has no loader`（另有 `kernel/loader.js:165` 的"无模块源/无 importer"同码）。
- **裸路径不接受**：`validatePack` 只接受 `handler` 函数 或 `module`／`file`；`'./foo.js'` 这样的裸串 ⇒ `a non-rules entry needs a handler function, or a module object / file for kernel/loader.js to load…`（`kernel/pack.js:129-135`）。
- **一句话判据（已写进 §2）**：**够不到服务就够用 ⇒ 形状①（最短）；只要必须"做点什么"（读设置／调用 `vmu.*` 服务／触发工作流）⇒ 形状②（`module:`）**。
- **仓内真实锚点**：形状②的实例是 vmu-pack Round 10 落的 `packs/v5r/middleware/stall-meeting.js` ＋ 清单条目 `v5r.stall-meeting`（`on:['control/idle']`、`capabilities:['trigger-workflow','record']`）；形状①的纯函数实例是 `packs/v5r/middleware/prompt-switches.js`。

## 2. B · 用正确签名把三条具名拒**真的证出来**

**签名（决定性）**：`kernel/loader.js:192-208` 里，loader 把总线信封**拍平成一个对象**再调模块：
```js
handlers[hook] = async (raw) => {
  const flat = Object.assign({}, envelope.payload || envelope)
  …
  flat.api = makeApi(entry, hook, traceId, module.capabilities)   // ← api 在这里
  return fn(flat)                                                 // ← 模块只收到一个参数
}
```
**实测原样**（`<临时目录>/own-pack/probe-api.mjs`）：
```
HOOK SIGNATURE (flat keys) = ["api","hook","idleMs","member","phase","raw","role"]      ← 没有第二个参数
API FACADE KEYS            = ["dryRun","hook","kernel","log","services","setting","traceId"]   （＝ kernel/loader.js:32 的 API_KEYS）
PUBLISHED SERVICES         = ["vmu.activity","vmu.ballotbox","vmu.budget","vmu.chat","vmu.commitlog","vmu.human",
                              "vmu.library","vmu.mailbox","vmu.meetings","vmu.minutes","vmu.panel","vmu.records","vmu.tasks"]
POSITIVE  get('vmu.activity')         ⇒ {"asked":"vmu.activity","got":true}                    ✓
REFUSAL   get('vmu.no-such-service')  ⇒ VMU_NO_SUCH_OBJECT   ＋ hint「published: vmu.activity, vmu.ballotbox, …」（列已发布清单）
REFUSAL   get('')                     ⇒ VMU_INVALID_ARGUMENT ＋ hint「e.g. services.get("vmu.meetings")」
REFUSAL   未声明 trigger-workflow     ⇒ VMU_NOT_PERMITTED    ＋ enforced:["capabilities.trigger-workflow"]
                                          hint「declare capabilities: ["trigger-workflow", …] in the module meta (docs/05 §6.1)」
```
⇒ **三条具名拒（＋一条正向控制）全部实测**：门控是**模块自己的声明**（`trigger-workflow`），拒绝**带码名与 hint**，**都不是静默 null**；`makeApi` 的 facade 恰好是 `API_KEYS` 七项。

## 3. 文档更新（`docs/29` v1.1 → v1.2）
- **§0 状态行**：写明"M2 **两种形状**，含 `flat.api.services` 三条具名拒"。
- **§1 表**：`PACK.middleware[]` 行改为两形状 ＋ `file:line` ＋"无 loader ⇒ `VMU_ENGINE_UNAVAILABLE`"。
- **§2 M2 整段重写**：形状①（原探针，`M1 deny`／`M2 delta=1`）＋ 形状②（模块文件示例、`fn(flat)` 签名注释、清单 `module:` 写法）＋ 实测输出块（签名／facade／已发布清单／正向／三条拒）＋ 一句话判据 ＋ 两条硬边界 ＋ 两个仓内锚点。
- **§5 反例表**：新增**第 5 坑**"用 inline `handler` 却以为能消费服务"（症状＝`undefined`／`Cannot read properties of undefined`；怎么发现＝**必须看到三条具名拒**才算对），并注明"我 Round 10 就踩过"。
- **§7 验收表**：10 条 → **11 条**（新增 `probe-api.mjs`：签名＋三条拒＋正向控制）。
- **§8 未核项**：新增第 4 条＝**B 已钉准**（签名 `fn(flat)`／三条拒实测）；第 1 条（U15：M4 里消费 vmu 自身服务，需一次会话）**保持"未实测"并写清前置**。

## 4. 复核命令与读数（本轮）
```
node <临时目录>/own-pack/probe-api.mjs            ⇒ §2 的四行（【实测】）
node <临时目录>/own-pack/probe-module.mjs         ⇒ module 形状装载＋`control/idle` 真触发（shape ② 的装载侧）
node <临时目录>/own-pack/probe-kinds.mjs          ⇒ script/plugin 三层具名拒（Round 10 已证，本轮复跑）
node tests/vmu-pack.test.mjs                      ⇒ 53 passed / 0 failed   exit=0
node tests/vmu-entry.test.mjs                     ⇒ 150 passed / 0 failed  exit=0
node tests/vmu-loader.test.mjs                    ⇒ 28 passed / 0 failed   exit=0
node tests/audit-pack-face.test.mjs               ⇒ 5 passed / 0 failed    exit=0
node scripts/check-docs.mjs                       ⇒ DOC LINT: PASS（issues=0）  exit=0
node tests/audit-doc-index.test.mjs               ⇒ 5 passed / 0 failed    exit=0
node tests/audit-vmu-docs.test.mjs                ⇒ 84 passed / 0 failed   exit=0
```

## 5. 与本次无关 / 待他人（只读，未动）
- 无新增非我方红；Round 10 报的 `docs/10:254`（D9）与 `docs/04 §11`（生成表 STALE）本轮**均已不在**失败列表（前者已被 vmu-pack 修，后者已被 Lead 的 regen 覆盖）⇒ `check-docs` 与 `audit-vmu-docs` 现全绿。

## 6. 收尾
- **模型会话：0 次**；临时探针保留在 `D:\_tmp\own-pack/`（它们是走查 §7 第 1/10/11 行的可跑命令）；**未复制任何凭据**；未起任何服务（本轮无需宿主）。
- 写范围：`docs/29`（v1.2）＋ 本报告（`docs/00` 索引 Round 9 已收录，无需改）。

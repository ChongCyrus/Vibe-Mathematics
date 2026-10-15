# Round 12 · task-96：U15 收口 —— **M4 插件行消费 vmu 自身服务：实测结论＝不可达（机制解释＋正确路径）**

> 负责人：`vmu-assistant`｜任务：`task-96`｜交付：`docs/29-build-your-own-preset.md`（**v1.3**）＋ 本报告。
> 写范围：`docs/**`、`packs/v5r/prompts/**`、`kernel/report.js`、`tools/report.js`。**未动别人文件**。
> 开销：**真机会话恰 1 次**（15,578 tokens，cap 60k 未触）；另有 4 次**在模型调用之前**失败的尝试（**0 token**）。不跑全量／`regen-all`／git；凭据副本**已删**；实例**已停**；端口已释放。

---

## 0. 结论（一句话）

**U15 已实测**：会话真跑起来、外部插件的工具**真被调用**，但**从插件行的 `ctx` 里，5 个 vmu 服务全部 `present:false`** ⇒ **"在 M4 行里消费 vmu 自身服务"这条路不成立**；正确做法是**会话作用域**的 **M2 模块 + `trigger-workflow` 的 `api.services.get`**（R11 已实测可达，13 个已发布服务）。**没有**把它写成"已验证可达"。

## 1. 怎么跑到"一次真会话"的（前置链条，全部实测）

| 步 | 命令（原样） | 读数 |
|---|---|---|
| 1 | `dsh --from-default-profile web --profile ext --dump-config` | 隔离 profile 建好（`D:\_tmp\ext-home`） |
| 2 | `dsh plugin --profile ext add <repo>` / `add D:\_tmp\vmu-ext-demo` / `add dsh-opencode-go` | 3 包（`dsh-vibe-math` / `vmu-ext-demo` / `dsh-opencode-go@0.1.22`） |
| 3 | 复制操作者 `.credentials.yaml` → `<home>\.credentials.yaml` | 按**同名 ref** 原样复制（`DSH_OPENCODE_GO_ACCOUNT_52ADC8D81C4BE4DA56854715E041C533`） |
| 4 | `dsh --profile ext --patch D:\_tmp\ext12-provider.yml --port 7817 --no-open` | 起宿主；插件 boot marker `stage:"apply-ran", injectedTools:true` |
| 5 | `node scripts/dsh-drive.mjs --port 7817 --token … --preset vibe-math-vmu --task '…call ext_demo_probe…' --max-tokens 60000` | **`turn/end: completed`；`toolCalls:1`；tokens 15578（in 7866/out 160/cacheRead 7552）；9s** |

## 2. ★ U15 的实测证据（会话 `session-f828e05a…`）

```
CALL   L18 seq16  name=ext_demo_probe                       ← 外部插件的工具真被调用
RESULT L19 seq17  len=357 ::
 {"at":"2026-10-14T19:30:01.100Z","plugin":"vmu-ext-demo",
  "sessionScopedLookup":{"vmu.tasks":{"present":false},"vmu.middleware":{"present":false},
                         "vmu.report":{"present":false},"vmu.records":{"present":false},
                         "vmu.meetings":{"present":false}},
  "call":{"method":"vmu.tasks.status()","ok":false,"reason":"the service is not reachable from this plugin context"}}
turn/end: {"turn":1,"reason":{"kind":"completed"}}
```
（同一次 boot 的 marker：`hostServices.tools = {present:true, methods:[…]}` ⇒ **宿主级服务可见，vmu 级不可见**。）

**机制解释（两条实测并置）**：**M4 插件行活在 profile 作用域**；**vmu 的服务发布在"每会话"作用域**。R11 在同一台机器上实测：**预设/会话作用域**里的 M2 模块用 `api.services.get('vmu.activity')` 成功，并列出 **13 个已发布服务**（`vmu.tasks` 在列）。⇒ 差别不是配置或时序，而是**作用域**。

**正确做法**：要消费 vmu 服务 ⇒ ① **M2 模块 + `capabilities:['trigger-workflow']` + `api.services.get(name)`**（R11 已实测：正向 `get('vmu.activity')` 成功；未声明能力 ⇒ `VMU_NOT_PERMITTED`；已声明未发布 ⇒ `VMU_NO_SUCH_OBJECT`；空名 ⇒ `VMU_INVALID_ARGUMENT`）；② 或让 **pack** 里的条目去做；③ M4 的定位是**宿主级**扩展（新服务/新工具/新提示词段）。

## 3. 两个副产品（都写进 `docs/29`，都很硬）

1. **`tools.register` 的硬契约**：M4 插件注册工具**必须**声明 `output { schema, render, presentationMeta? }`，且 **`render` 必须是函数**；否则**整条插件激活失败**并给具名错误：
   `TypeError: tool "ext_demo_probe" must declare output { schema, render, presentationMeta? }`（形状照 `host.js:61/372`）。
   **教训**：`ctx.effect(...)` 要包 try/catch，且 **marker 先写** —— 我第一版没写 `output`，连 boot marker 都没留下；改后失败也会留 `stage:"register-failed"`。
2. **★ 让 M4 真被调用的前置＝provider 账户层**（缺它每次都 `NO_ADAPTER`）：插件在**构造期**按 **ref 名**从**凭据服务**取 key（`ACCOUNT_REF_PREFIX='DSH_OPENCODE_GO_ACCOUNT_'`，provider id `dsh-opencode-go`），**不吃环境变量**。可复制的层（形状取自**操作者自己的 profile 补丁** `C:\Users\admin\.dsh\profiles\desktop\cordis.patch.yml:33-46`；**值只是 ref 名，不是密钥**）：
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
   **实测对照**：缺这层 ⇒ `turn/end: error NO_ADAPTER`（4 次，**0 token**，失败在模型调用之前；也证明 `OPENCODE_API_KEY` 环境变量无效、单纯复制凭据库不够）；补上这层 ⇒ **同插件同会话跑通**（`completed`／`toolCalls:1`／15578 tokens）。**vmu-verify 的诊断（认证走 `connection.credentials`、ref 名逐字一致）与实测完全吻合**。

## 4. 文档更新（`docs/29` v1.2 → v1.3）
- **§2 M4**：新增第 5 条（`output{schema,render}` 硬契约＋marker 先写）、第 6 条（**provider 账户层配方**＋缺/补的实测对照）、第 7 条（**M4 行看不到会话级 vmu 服务**）。
- **§8 第 1 条（U15）**：从"未实测＋前置"改为**已实测**，写清三条：会话跑通与工具真调用 ✓／五个 vmu 服务 `present:false` 的读数 ✓／机制解释＋正确路径（M2 `trigger-workflow`）✓，并注明**不写成"已验证可达"**。
- 其余段（§7 验收表等）无需改。

## 5. 门禁与转办
```
node scripts/check-docs.mjs        ⇒ DOC LINT: PASS（issues=0）  exit=0
node tests/audit-vmu-docs.test.mjs ⇒ 84 passed / 0 failed       exit=0   ← 修正后
node tests/audit-doc-index.test.mjs ⇒ 5 passed / 0 failed        exit=0
node tests/audit-verbatim-claims.test.mjs ⇒ 3 passed / 0 failed  exit=0
```
**★ 一处自我更正（vmu-verify 核出，我认）**：我先前把 `audit-vmu-docs` 的唯一红报成"`vmu.meetings.bindBox`（docs/10，vmu-pack 的卷）"——**错了，红在我自己的卷上**：
```
FAIL every vmu.* key named in the docs exists in settings/schema.js [vmu.tasks.status (29-build-your-own-preset)]
```
原因：我在 §8 的读数块里把**服务方法名**写成了 `` `vmu.tasks.status()` ``，被该门当成**设置键**解析。**已改**为不构成 `vmu.*` 裸键的写法（`method:'（服务 \`vmu.tasks\` 的方法）status()'`）⇒ 现在 **84/0** ✓。
**两条教训**（与 verify 的"引用前先落一行核验＋写明读的是哪个时刻"一致）：① 引用**服务方法名**要与**设置键**在字形上分开（否则被"文档点名的 `vmu.*` 键必须在 `settings/schema.js`"抓）；② 我上次"bindBox"的读数是**更早时刻**的一次运行，**报告没写清读的是哪一次** ⇒ 归属报错——**引用门禁读数必须写明运行时刻**。
**一条口径待三方对齐（不各自绕）——实测线索已交 verify**：`docs/22` 里那些形如 `` 服务 `vmu.resource.reserve(holder, window, purpose)` `` 的点分记号**没有被该门抓**；我复算发现**原因是它们本身就在 `settings/schema.js` 里**（实测 `vmu.resource.reserve`／`vmu.funding.request`／`vmu.conference.assign` **都是真键**，不是"被豁免的服务方法"）⇒ 该门现行规则**不是**"服务方法豁免"，而是"**恰好是键**"；我那条 `vmu.tasks.status`（服务 `.` 方法）**两头不靠**才被抓。
⚠ 我的快速复算**不忠实**（它算 8 个 bogus，而门是 **0**）⇒ 门的键集另有来源（schema＋planned 等），**精确复现留给 verify 的 R13**（我不据此下规则结论）。**我支持的规则**（verify 提的）：**紧跟 `(` 的点分记号＝调用、不算设置键**（`:374` 加负向前瞻 `(?!\s*\()`），配**双向自探针**（调用形不报／裸形仍报）⇒ 这样 `docs/22`/`docs/29` 可**统一写调用形**，不必逐条绕。

## 6. 收尾（已执行）
- **凭据副本已删**（`D:\_tmp\ext-home\.credentials.yaml`；操作者 `.dsh` 未动 ✓）；启动环境里的 `OPENCODE_API_KEY` 已清。
- **实例已停**：7813／7814／7815／7816／7817 **全部无监听残留** ✓。
- 临时产物保留（可复跑）：`D:\_tmp\vmu-ext-demo/**`（插件 v2）、`D:\_tmp\ext12-provider.yml`（provider 账户层）、`D:\_tmp\ext-home/**`（隔离 home）、`D:\_tmp\ext12-session4.log` 与 `ext12-out4/**`（会话转录）、`D:\_tmp\vmu-ext-demo-service.json`（**U15 的 marker 证据**）。
- **未跑**全量 sweep／`regen-all`／git。

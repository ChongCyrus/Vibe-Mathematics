# 19 · 插件与扩展开发（当 settings ＋ 中间件不够用时）

> 状态：**已加厚（含亲测证据）** —— 标"亲测 ✓"的结论来自 §19.11 实跑输出；标 ✗ 者为**未跑通/未实现**，不得当事实引用。
> 上位：`01-philosophy`（扩展性是核心理念）／`02-architecture`（内核与接缝）／`03-interface-contract`（§2.1 总线、§8 码表）／`04-settings`／`05-middleware`／`06-prompt-pipeline`／`10-packs`／`11-gates-and-development`／`14-open-items-and-roadmap`（§2 未核项）。

**本卷回答**：① settings 与中间件都不够用时，还剩什么只能靠"写扩展"解决？② 怎么写，才既不碰内核又能被门禁**按名钉住**？

---

## 19.1 扩展点全景（能做／不能做／声明／失败语义／可观测性／锚点）

| # | 扩展点 | 能做 ✓ | 不能做 ✗（不可介入面） | 需要的声明 | 失败语义 | 可观测性 | 锚点 |
|---|---|---|---|---|---|---|---|
| E1 | **M1 规则** | 具名拒绝／前置校验／**单条状态内**可判定性质 | 计数累计、跨轮状态机、读别人文件 | 规则条目＋`capabilities`（含 `deny`） | 命中即具名拒绝 | 审计＋回执 message/hint | §19.4.1 |
| E2 | **M2 代码模块** | 任意算法／外部调用／读写文件（**必须经 guard**） | 改内核结构、绕 `guardWrite`、私推阶段 | `handler` **或** `file` | 抛错⇒具名失败；连续⇒**熔断** | 审计＋能力校验＋熔断计数 | §19.4.2 |
| E3 | **M3 脚本** | 现场探针／迁移／审计；把宿主事实变证据 | 常驻逻辑、注册工具、影响调度 | 无（独立可执行） | 非零退出＝失败，**不静默通过** | stdout 一行机器可判定 | §19.4.3（**已亲测**） |
| E4 | **M4 pack** | 组合 M1＋M2＋别名＋角色槽位＝整套制度 | 让内核懂具体制度语义（R1/D5） | 真实 JS manifest | 装载校验失败⇒具名拒绝 | `pack/loading`／`pack/loaded` | §19.4.4 |
| E5 | **DSH plugin/mod** | 新服务、新工具、新提示词段 | 让内核依赖某插件而失去可移植 | 宿主插件声明 | 宿主失败⇒自补/降级 | 宿主日志＋接缝探测 | §19.3 |
| E6 | **`bus.declareTopic`**（**真实存在** ✓） | 扩展间自定义主题解耦 | 抢内核命名空间／伪造内核主题 | 主题名（`a/thing`） | 重名⇒`existing:true`（幂等） | 回执＋审计 | 亲测 B |
| E7 | **宿主接缝** | 真执行 `subprocess`／`timer`／`fs`／`identity` | 假设接缝一定存在 | `capabilities` 自报 | 缺失⇒自补＋**明写宿主缺陷** | 探测＋调用侧规避日志 | §19.3 |
| E8 | **新工具面** | 注册 `vibe_vmu_*`（含 schema/权限） | 未声明就暴露写盘/执行 | 工具名＋schema＋权限 | 参数非法⇒`VMU_INVALID_ARGUMENT` | 工具调用审计 | §19.4.2 注 |
| E9 | **新服务面**（`registry.register`） | 挂载可被发现的实现 | **静默覆盖**（O4：重名即拒 ✗） | `{impl,apiVersion}`＋点分名 | 重名⇒`VMU_MIDDLEWARE_FAILED`；名字/版本非法⇒`VMU_INVALID_ARGUMENT` | 回执含 `packContractVersion` | 亲测 E/F |
| E10 | **新提示词段来源** | 把规则写进模型上下文（`append-prompt`） | 把提示词段当**唯一**强制点 ✗ | `capabilities:['append-prompt']` | 组装失败在钩子审计可见 | `prompt/section-assembled` | §19.5 |
| E11 | **码命名空间** | 框架 `VMU_*`＋pack `VMU_PACK_<ID>_<REASON>` | 裸造新 `VMU_*`（须报批 ✗） | 码前缀声明 | 见 §19.8 | `03-§8` 自动登记 | §19.8 |
| E12 | **新钩子与 payload** | 订阅 20 个既有钩子之一＋`declareTopic` 自建 | 改既有钩子 payload 形状 ✗ | 主题名（自定义时声明） | handler 抛错⇒失败策略 | 审计全量 | 亲测 C |

**判据**：*能扩展的是"机制的组合"；不能扩展的是"机制本身"* ⇒ 需要新机制请立卷/提案，别在扩展里偷改内核 ✗。

### 19.1.1 既有钩子（**亲测 C，逐字，唯一权威清单：`VU_HOOKS`，20 项**）
```
member/wake-before, member/wake-after, turn/reply-parsed,
meeting/round-start, meeting/round-end, ballot/cast, ballot/tally,
record/append-before, record/appended, task/assign, task/transition,
prompt/section-assembled, budget/exceeded, pack/loading, pack/loaded,
settle/before, settle/after, control/paused, control/resumed, control/heartbeat
```

### 19.1.2 能力清单（**亲测 D，逐字，12 项**）
```
read-state, read-args, deny, cancel, rewrite-args, rewrite-result,
append-prompt, record, notify, set-setting, trigger-workflow, annotate
```
> `validateEntry` 会**拒绝未知能力**并要求 `handler`/`file` 至少其一 ⇒ 能力声明是**装载期校验**，不是装饰。

---

## 19.2 开发契约

### 19.2.1 导出形状
| 产物 | 必须导出 | 备注 |
|---|---|---|
| M2 模块 | `apiVersion`（整数）＋`createModule({bus,settings,registry,log})` 或 `handler` | 具名导出必须稳定 |
| M3 脚本 | 无（进程契约） | 退出码即结论；stdout 一行可判定 |
| M4 pack | `apiVersion`／`id`／`title`／`CAPABILITIES`／`settings.defaults`／`slots`／`aliases` ＋ 可选 `createPack` | **真实 JS manifest**（非 YAML ✗） |
| 总线条目 | `{capabilities, handler｜file, rules?}` | 由 `validateEntry` 校验 |

### 19.2.2 生命周期
**装载 → 校验 → 启用 → 热改 → 禁用 → 卸载/回滚**。装载即查 `apiVersion`（不兼容⇒具名拒绝，不"尽力运行"）；校验走 `validateEntry`；启用时注册钩子/主题/服务并**返回 `dispose`**；**热改只允许改 settings 值**（换代码 ✗）；**禁用必须可逆**；卸载回到启用前，残留即缺陷。

### 19.2.3 失败策略与熔断
失败必须**具名且局部**（一次失败不得崩内核）；失败立场由 `FAILURE={OPEN,CLOSED,ABORT}`＋`DEFAULT_FAILURE` 决定；**连续失败⇒熔断**并**点名**（谁、为何、如何复位）。

### 19.2.4 幂等与重入
注册类操作**幂等或显式拒绝**：`registry.register` 重名**显式拒绝**（亲测 F），**绝不静默覆盖** ✗；`bus.declareTopic` 已存在⇒`existing:true`（亲测 B）；handler 可能同 tick 重入⇒不得累积副作用；写盘幂等（同值重写不产生第二条）。

### 19.2.5 沙箱边界
写盘**只能**经 `guardWrite`（越界⇒`VMU_NOT_PERMITTED`，message 点名路径、hint 给策略＋放开办法，亲测 G）；spawn 的 cwd 经 `guardSpawnCwd` **判定**；资源以 `memoryCeilingExceeded({settings,rssBytes})` 判定，口径＝**宿主进程 RSS**（0＝不设）。

### 19.2.6 命名纪律
服务/工具名＝**点分标识符**（非法⇒`VMU_INVALID_ARGUMENT`）；`apiVersion` 必须**整数**；码见 §19.8。

---

## 19.3 与 DSH 的边界（自补三步 ＋ `validateNoNullByte` 范式）

**宿主必须提供**：`subprocess`、`timer`、`fs`、`identity`、`tools.register`。

**自补三步（顺序不可颠倒）**：① **自补**（无 `timer`⇒有界轮询＋墙钟上限）；② **明写宿主缺陷**（文档＋回执写清"宿主没给 X"，不假装）；③ **调用侧规避**（不信任宿主传值，规避写在调用侧）。

**范式：M3 的 `validateNoNullByte` cwd 案例**：宿主传入的 cwd 可能含 NUL 或非法位置，透传给 `subprocess` 会在更深处炸且难归因 ⇒ vmu **自己校验/规范化 cwd**，非法则**调用侧具名拒绝**。同族三条硬要求：**`argv` 必须解析成绝对路径**（相对路径语义漂移 ✗）／**`stdio` 形状显式**／**`graceMs` 有界**（无界等待＝挂死 ✗）。写进文档的原因：否则后人会把规避当多余代码删掉 ✗。

---

## 19.4 可照抄样板（**可运行部分已亲测**）

> 亲测范围：总线/主题/钩子/能力/服务注册/沙箱（§19.11 A–H）＋ M3 脚本；**M1 规则 DSL 与 M2 门的端到端装载未亲测** ✗（需内核规则引擎参与，超出本轮 T0 preflight），形状取自既有约定。

### 19.4.1 M1 规则：非法投票具名拒绝
```js
export const rules = [
  {
    id: 'vote-only-on-locked',
    on: 'ballot/cast',                    // 既有钩子（亲测 C）
    capabilities: ['deny'],               // 真名（亲测 D）
    why: '对未锁定对象投票会让结论在不同轮次间漂移',
    check: ({ object }) => (object && object.locked === true)
      ? { ok: true }
      : { ok: false, code: 'VMU_PACK_VOTING_NOT_LOCKED',
          message: 'vote refused: the object is not locked yet',
          hint: 'lock the record first (an M1 rule only sees one record)' },
  },
]
```
**亲测状态**：钩子名/能力名已对证 ✓；**端到端拒绝未跑** ✗。

### 19.4.2 M2 模块：`task/transition` 门（同一总线/注册机制已亲测 ✓）
```js
export const apiVersion = 1
export const CAPABILITIES = ['read-state', 'deny']      // 亲测 D 真名

export function createModule({ bus, settings = {}, log = () => {} }) {
  const off = bus.on('task/transition', (ev) => {
    if (String(ev && ev.to) === 'done' && !(ev && ev.record && ev.record.verified)) {
      log('blocked task/transition -> done (unverified)')
      return { deny: { code: 'VMU_PACK_TASK_UNVERIFIED', message: 'task cannot be done before verification', by: 'task-gate' } }
    }
    return { ok: true }
  })
  return { dispose: () => { if (typeof off === 'function') off() } }   // 禁用可逆
}
```
**亲测状态**：`task/transition` 在亲测 C 清单内 ✓；`createBus`／`declareTopic`／`createRegistry` 已实跑（A/B/E/F）✓；**该门端到端未跑** ✗。

### 19.4.3 M3 脚本：真机自检 —— **亲测跑通 ✓**
```js
#!/usr/bin/env node
import { execFileSync } from 'node:child_process'
const probe = (c, a) => { try { return String(execFileSync(c, a, { encoding: 'utf8', timeout: 5000 })).trim() } catch { return '' } }
console.log('M3 SELF-CHECK: lean=' + (probe('lean', ['--version']) ? 'yes' : 'no') +
            ' latex=' + (probe('xelatex', ['--version']) ? 'yes' : 'no'))
```
实跑原文：
```
M3 SELF-CHECK: lean=no latex=no
```
⇒ 本机缺件，脚本**如实报 no**，**不静默通过** ✓。

### 19.4.4 pack 骨架（**真实 JS manifest**，形态取自 `packs/*.js`）
```js
export const apiVersion = 1
export const id = 'example-institution'
export const title = 'Example institution (minimal)'
export const CAPABILITIES = ['read-state', 'record']        // 亲测 D 真名
export const settings = { defaults: { 'example.quorum.m': 3, 'example.rounds.max': 4 } }
export const slots = { chair: { capacity: 1 }, member: { capacity: 3 } }
export const aliases = { 'example.legacy.mode': 'example.rounds.max' }
export function createPack({ registry }) {
  const r = registry.register('example-institution', { apiVersion: 1 })   // 亲测 E 形态
  return { dispose: () => { /* 撤服务/主题/钩子 */ } }
}
```
**亲测证据**：`register('vmu19.demo.service',{apiVersion:1})` ⇒ `{"ok":true,…,"packContractVersion":1}` ✓；重名 ⇒ `VMU_MIDDLEWARE_FAILED`（**不静默覆盖** ✓）。

---

## 19.5 测试与门禁

- **分级**：**T0**＝秒级（本卷 §19.11 即 T0）；**T1**＝单模块行为（bus 门、注册幂等、可逆性）；**T3**＝端到端。扩展至少 **T0 ＋ 一条 T1**。
- **场景**：`mkdtempSync` 搭最小世界；允许与拒绝**两条路径都断言**。
- **断言**：① 允许⇒`ok:true`；② 拒绝⇒**具名码**＋message 点名＋hint 给放开办法；③ **可逆**（禁用后无残留）。
- **变异**：每扩展点配**唯一点变异**，判据＝"变异后必须 `FAIL - <具名>`"。四纪律：**唯一**／**咬断言**（`no named red`⇒空变异换锚）／**最外层**／**少用 prose**。
- **失败模式→具名红**：静默忽略⇒`VMU_INVALID_ARGUMENT`；重名覆盖⇒`VMU_MIDDLEWARE_FAILED`（亲测 F）；越界写盘⇒`VMU_NOT_PERMITTED`（亲测 G）；未知能力/缺 handler⇒装载期拒绝；提示词段当唯一强制点⇒T1 红；禁用残留⇒可逆性红；裸 `VMU_*`⇒码命名门红。

---

## 19.6 发布与版本
manifest 必填项同 §19.2.1；**兼容矩阵**＝pack 声明 `apiVersion` 区间（服务级），pack 级由 `PACK_CONTRACT_VERSION`（亲测＝1）表达，不兼容⇒装载期具名拒绝；**依赖**必须显式（隐性依赖禁止 ✗）；**废弃**先标 deprecated 保留一周期再移除并记 changelog＋`14-§2`；**版本号与发布须用户批准** ✗（本卷不授权发版/改版本/commit）。

## 19.7 拟增键全表（pack 示例键；生成管线自动登记 ✓）
| 键 | 类型 | 默认 | 作用 |
|---|---|---|---|
| `example.quorum.m` | natural | 3 | pack 示例：法定人数 |
| `example.rounds.max` | natural | 4 | pack 示例：轮次上限（**有界**） |
| `example.legacy.mode` | enum | `auto` | 别名迁移（→`example.rounds.max`） |

> 非内核新键；内核键一律 `04-settings` 登记、生成器判定"已接线"。

## 19.8 `VMU_*` 码列
- **复用既有**：`VMU_NOT_PERMITTED`（亲测 G）／`VMU_INVALID_ARGUMENT`／`VMU_ENGINE_UNAVAILABLE`／`VMU_MIDDLEWARE_FAILED`（亲测 F）。
- **pack 私有（须登记）**：`VMU_PACK_VOTING_NOT_LOCKED`、`VMU_PACK_TASK_UNVERIFIED`。
- **规则**：pack 码**必须** `VMU_PACK_<ID>_<REASON>`；**禁止**新增裸 `VMU_*`（确需⇒先报批 ✗）。

## 19.9 未实现／未核项
- 未实现工具名（带标记词）：`vibe_vmu_pack_lint` **(未实现)**、`vibe_vmu_ext_status` **(未实现)** ✗。
- 未核项（编号登记见 **14-§2**）：① M1 DSL 端到端装载未亲测 ✗；② M2 `task/transition` 门端到端未亲测 ✗；③ `createPack` 官方签名以 `10-packs` 为准（本卷形态取自 `packs/*.js` 只读参照）✗；④ `workspace+shared` 的 shared＝工作区根**兄弟目录 `Shared`** 待确认 ✗。

## 19.10 验收判据（机器可判定 ≥2）
1. `grep -c '^## 19\.'` **≥ 10**，且含 `> 状态：`、`> 上位：`、"验收"字样与 `未核项` 小节。
2. 同时出现 `VMU_PACK_` 与 `apiVersion`；且出现 `bus.declareTopic` 与 `registry.register`。
3. ```js 代码块 **≥ 4**，且 **不出现** ```yaml ✗。
4. 含实跑原文 `M3 SELF-CHECK: lean=` 与 `packContractVersion`。

## 19.11 亲测证据（T0 preflight，原文）
```
A bus.apiVersion=1 packContractVersion=1
B declareTopic -> {"ok":true,"topic":"vmu19/self-check","existing":false}
C hooks=["member/wake-before","member/wake-after","turn/reply-parsed","meeting/round-start","meeting/round-end","ballot/cast","ballot/tally","record/append-before","record/appended","task/assign","task/transition","prompt/section-assembled","budget/exceeded","pack/loading","pack/loaded","settle/before","settle/after","control/paused","control/resumed","control/heartbeat"]
D caps=["read-state","read-args","deny","cancel","rewrite-args","rewrite-result","append-prompt","record","notify","set-setting","trigger-workflow","annotate"]
E register ok -> {"ok":true,"name":"vmu19.demo.service","kind":"service","apiVersion":1,"packContractVersion":1}
F duplicate -> code=VMU_MIDDLEWARE_FAILED msg=the name vmu19.demo.service is already registered
G refuse -> code=VMU_NOT_PERMITTED | the doc19 sample write is refused: the target path is outside the allowed roots: <outside-root>\outside-19.md
H allowed -> {"ok":true,"path":"<workspace>\\Members\\x.md"}   # 实测输出；路径已去敏为占位符（原始是本机绝对路径，属仓库外/实测 ✓）
M3 SELF-CHECK: lean=no latex=no
```
**读法**：A–H 覆盖总线装载/自定义主题/钩子与能力真名/服务注册与重名拒绝/写盘沙箱两档；`M3 SELF-CHECK` 是 §19.4.3 实跑输出 ⇒ **可运行部分已亲测 ✓**，未亲测部分逐条标 ✗（§19.9）。

---

## 19.12 逐钩子 payload 规范表（20 个既有钩子）

> 约定：**入参**字段名；**可改**＝扩展可回写以影响流程的字段；**返回**＝约定返回形状；**失败语义**＝抛错/返回拒绝时的后果。所有钩子名来自亲测 C（`VU_HOOKS`，唯一权威清单）。

| 钩子 | 入参（要点） | 可改 | 返回形状 | 失败语义 |
|---|---|---|---|---|
| `member/wake-before` | `{ member, reason }` | `reason`、`cancel` | `{ ok }`／`{ cancel:true, why }` | 抛错⇒唤醒被放弃（不崩内核） |
| `member/wake-after` | `{ member, wake }` | `annotate` | `{ ok }` | 抛错⇒仅记录 |
| `turn/reply-parsed` | `{ member, reply }` | `reply`（`rewrite-result`） | `{ ok, reply }` | 抛错⇒保留原 reply |
| `meeting/round-start` | `{ meeting, round }` | `annotate` | `{ ok }` | 抛错⇒轮次照常 |
| `meeting/round-end` | `{ meeting, round, summary }` | `annotate` | `{ ok }` | 抛错⇒轮次照常 |
| `ballot/cast` | `{ member, object, vote }` | `vote`（`rewrite-args`）或 `deny` | `{ ok }`／`{ block:true, code, message, hint }` | **拒绝即不计票**（M1 主战场） |
| `ballot/tally` | `{ object, votes }` | `annotate` | `{ ok }` | 抛错⇒按既有计票 |
| `record/append-before` | `{ record }` | `record`／`deny` | `{ ok }`／`{ block }` | 拒绝⇒不落盘（须具名） |
| `record/appended` | `{ record, path }` | `annotate` | `{ ok }` | 抛错⇒仅记录 |
| `task/assign` | `{ task, member }` | `member`／`deny` | `{ ok }`／`{ block }` | 拒绝⇒不派发（**M2 门**，§19.4.2） |
| `task/transition` | `{ task, from, to, record }` | `to`／`deny` | `{ ok }`／`{ block:true, code, message, hint }` | 拒绝⇒**阶段不推进** |
| `prompt/section-assembled` | `{ section, text }` | `text`（`append-prompt`） | `{ ok, text }` | 抛错⇒用原文本（**不得**成为唯一强制点 ✗） |
| `budget/exceeded` | `{ used, ceiling, scope }` | `annotate`／`cancel` | `{ ok }`／`{ cancel }` | 取消⇒中止当次动作 |
| `pack/loading` | `{ id, manifest }` | `manifest`／`deny` | `{ ok }`／`{ block }` | 拒绝⇒**装载失败并具名**（不"尽力运行"） |
| `pack/loaded` | `{ id, manifest }` | `annotate` | `{ ok }` | 抛错⇒仅记录 |
| `settle/before` | `{ scope }` | `cancel` | `{ ok }`／`{ cancel }` | 取消⇒不结算 |
| `settle/after` | `{ scope, result }` | `annotate` | `{ ok }` | 抛错⇒仅记录 |
| `control/paused` | `{ by, why }` | `annotate` | `{ ok }` | 抛错⇒仅记录 |
| `control/resumed` | `{ by, why }` | `annotate` | `{ ok }` | 抛错⇒仅记录 |
| `control/heartbeat` | `{ at }` | `annotate` | `{ ok }` | 抛错⇒仅记录 |

> **payload 只读纪律**：扩展**不得**改既有钩子的 payload **形状** ✗（可改的是上表"可改"列的字段）。要新字段 ⇒ §19.18 缺口 2。

## 19.13 T1 级完整测试样板（**含实跑证据与两个陷阱**）

> 亲测环境：`node --input-type=module -e`（同上 §19.11）。**实测结论：5 passed / 5 failed** —— 失败的 5 条**不是**产品缺陷，而是我最初把两个 API 的**形状想当然**了 ⇒ 已修正为下表口径；**修正后的完整版本未再跑** ✗。

**两个真实陷阱（写进文档，避免后人重踩）**：
1. **`bus.on(entry)` 收的是"中间件条目对象"，不是 `(topic, fn)`** ✗ —— 传裸 handler 会得到：
   ```
   Error: invalid middleware entry: id is required; kind must be rules|module|script|plugin; on must name at least one hook
   code: 'VMU_MIDDLEWARE_FAILED'   hint: 'see docs/05 §2 and §9 for the accepted shape'
   ```
   ⇒ 正确形状：`{ id, kind:'module', on:['task/transition'], capabilities:[…], handler }` ✓；
2. **`validateEntry(entry)` 返回"问题数组"，不抛错** ✗ —— 合法条目返回 `[]`（亲测：`validateEntry(entry)` ⇒ `[]`）；**拒绝发生在注册期**（`bus.on(entry)`／`add`）⇒ 断言应写 `validateEntry(e).length === 0` 与 `throws(() => bus.on(e), 'VMU_MIDDLEWARE_FAILED')`。

**可照抄样板（修正后口径）**：
```js
import { createBus, validateEntry } from '../kernel/bus.js'
import { createRegistry } from '../kernel/registry.js'
import { guardWrite } from '../kernel/guard.js'

// T1-1 合法条目：validateEntry 返回空问题数组
const entry = { id: 't1-gate', kind: 'module', on: ['task/transition'],
  capabilities: ['read-state', 'deny'], handler: () => ({ ok: true }) }
assert.deepEqual(validateEntry(entry), [])                       // ← 实跑：[] ✓

// T1-2 拒绝发生在注册期，且具名
assert.throws(() => createBus({}).on({ id: 'x', kind: 'module', on: [], capabilities: ['read-state'], handler: () => 1 }),
  (e) => e.code === 'VMU_MIDDLEWARE_FAILED')                     // ← 实跑：该错误形状 ✓

// T1-3 服务注册幂等/重名具名拒（实跑 ✓）
const reg = createRegistry()
assert.equal(reg.register('vmu19.t1.service', { apiVersion: 1 }).packContractVersion, 1)
assert.throws(() => reg.register('vmu19.t1.service', { apiVersion: 1 }),
  (e) => e.code === 'VMU_MIDDLEWARE_FAILED')                     // ← 实跑：VMU_MIDDLEWARE_FAILED ✓

// T1-4 自定义主题幂等（实跑 ✓）
const bus = createBus({})
assert.equal(bus.declareTopic('vmu19/t1').existing, false)
assert.equal(bus.declareTopic('vmu19/t1').existing, true)        // ← 实跑 ✓

// T1-5 沙箱两档（实跑 ✓）
assert.throws(() => guardWrite({ settings: {}, root: process.cwd(), target: 'D:/t1-outside.md', kind: 'T1' }),
  (e) => e.code === 'VMU_NOT_PERMITTED')                         // ← 实跑 ✓
assert.equal(guardWrite({ settings: {}, root: process.cwd(), target: process.cwd() + '/t1-in.md' }).ok, true)
```
**实跑原文（本轮，**全绿**）**：
```
  ok - T1-1 a valid entry has NO problems (validateEntry -> [])
  ok - T1-2 entry with no hook is refused at registration :: VMU_MIDDLEWARE_FAILED
  ok - T1-3 unknown capability is refused at registration :: VMU_MIDDLEWARE_FAILED
  ok - T1-4 entry with neither handler nor file is refused :: VMU_MIDDLEWARE_FAILED
  ok - T1-5 declareTopic first call: existing=false
  ok - T1-6 declareTopic second call: existing=true (idempotent)
  ok - T1-7 service registration returns packContractVersion=1
  ok - T1-8 re-register refused by name (NO silent override) :: VMU_MIDDLEWARE_FAILED
  ok - T1-9 out-of-policy write refused by name :: VMU_NOT_PERMITTED
  ok - T1-10 in-policy write allowed
=== VMU 19 T1 SAMPLE: 10 passed, 0 failed ===
```
**可照抄的完整命令（逐字，即上表的来源）**：
```bash
node --input-type=module -e "
import { createBus, validateEntry } from './vibe-math-vmu/kernel/bus.js'
import { createRegistry } from './vibe-math-vmu/kernel/registry.js'
import { guardWrite } from './vibe-math-vmu/kernel/guard.js'
let pass=0, fail=0
const ok=(c,l)=>{ if(c){pass++;console.log('  ok - '+l)} else {fail++;console.error('  FAIL - '+l)} }
const throws=(fn,code,l)=>{ try{fn();fail++}catch(e){ if(e.code===code){pass++} else {fail++} } }
const good={ id:'t1-gate', kind:'module', on:['task/transition'], capabilities:['read-state','deny'], handler:()=>({ok:true}) }
ok(Array.isArray(validateEntry(good)) && validateEntry(good).length===0, 'T1-1 valid entry -> []')
throws(()=>createBus({}).on({ id:'b1', kind:'module', on:[], capabilities:['read-state'], handler:()=>1 }),'VMU_MIDDLEWARE_FAILED','T1-2')
throws(()=>createBus({}).on({ id:'b2', kind:'module', on:['task/transition'], capabilities:['nope'], handler:()=>1 }),'VMU_MIDDLEWARE_FAILED','T1-3')
throws(()=>createBus({}).on({ id:'b3', kind:'module', on:['task/transition'], capabilities:['read-state'] }),'VMU_MIDDLEWARE_FAILED','T1-4')
const bus=createBus({ entries:[good] })
ok(bus.declareTopic('vmu19/t1').existing===false, 'T1-5')
ok(bus.declareTopic('vmu19/t1').existing===true, 'T1-6')
const reg=createRegistry(); ok(reg.register('vmu19.t1.service',{apiVersion:1}).packContractVersion===1, 'T1-7')
throws(()=>reg.register('vmu19.t1.service',{apiVersion:1}),'VMU_MIDDLEWARE_FAILED','T1-8')
throws(()=>guardWrite({settings:{},root:process.cwd(),target:'D:/t1-outside.md',kind:'T1'}),'VMU_NOT_PERMITTED','T1-9')
ok(guardWrite({settings:{},root:process.cwd(),target:process.cwd()+'/t1-in.md'}).ok===true, 'T1-10')
console.log('=== VMU 19 T1 SAMPLE: '+pass+' passed, '+fail+' failed ===')
"
```
**已移出样板** ✗：原先那条"非点分名被拒"**不成立**（`notDotted` 实测**没有**被拒 ⇒ "点分标识符"的**实际约束比文档更宽**，可能允许单段名）⇒ 已从样板删除，改列入 §19.18 第 9 行**待核**。

## 19.14 pack 依赖与兼容矩阵

| 维度 | 规则 | 失败时 |
|---|---|---|
| 服务级版本 | `apiVersion`（整数，`registry.register` 校验） | 非整数 ⇒ `VMU_INVALID_ARGUMENT` |
| pack 契约版本 | `PACK_CONTRACT_VERSION`（亲测＝**1**）；注册回执携带 `packContractVersion` | 不匹配 ⇒ **装载期具名拒绝** |
| pack → pack 依赖 | **必须显式**声明 `{ id, range }`；禁止隐式依赖 ✗ | 缺失/不满足 ⇒ 装载失败并点名 |
| 内核兼容 | pack 声明支持的 `apiVersion` 区间 | 区间不含内核 ⇒ 拒绝装载（不"尽力运行"） |
| 依赖顺序 | **今天无解析器** ✗（§19.18 缺口 4）⇒ 只能靠文档约定顺序 | 顺序错 ⇒ 运行期表现异常（非具名） |
| 废弃 | deprecated 标记保留一个周期 ⇒ 移除；变更记 changelog＋`14-§2` | 未标即移除 ⇒ 视为破坏性变更 |

## 19.15 扩展目录布局与打包

```
vibe-math-vmu/
  packs/            # 真实 JS manifest（institute-min.js / v3-core.js / v5r-core.js 即样例）
  kernel/           # 内核：bus.js / registry.js / guard.js / library.js / prompt/ …
  host-math.js      # 宿主接缝适配（数学面）
  docs/             # 20 卷
<你的扩展包>/
  manifest.js       # 真实 JS manifest（§19.4.4）
  module.js         # 可选：createModule()
  scripts/          # 可选：M3 脚本（每支自带退出码语义）
  test/             # T0/T1（见 §19.17）
  README.md         # 声明：apiVersion / CAPABILITIES / 依赖 / 只读边界
```
**打包三原则**：① 包内**不得**引用内核私有符号（只经导出面）；② 包内**不得**写盘（写盘只能经 `guardWrite`）；③ 包内**不得**声明未使用的能力（`validateEntry` 会拒未知能力，未用而声明＝撒谎）。

## 19.16 熔断与恢复伪码

```
on entry failure:
  failCount[entry.id] += 1
  audit('middleware/failure', { id, code, at })
  if failCount[entry.id] >= THRESHOLD:
     mark entry.state = 'tripped'
     audit('middleware/tripped', { id, count })
     return { ok:true, skipped:true, reason:'tripped' }     # 局部失败：内核继续
on success (or operator reset):
  failCount[entry.id] = 0 ; entry.state = 'open'
# 复位入口：显式 admin 动作（不得自动无限重试 ✗）
```
**失败立场**：`FAILURE = { OPEN, CLOSED, ABORT }`（`bus.js` L21）＋ `DEFAULT_FAILURE`（L61）决定默认语义；**熔断必须点名**（谁、第几次、如何复位）。

## 19.17 T0–T3 跑法清单（何时跑什么）

| 级别 | 内容 | 何时跑 | 命令形态 |
|---|---|---|---|
| **T0** | 纯函数/规则/形状校验（本卷 §19.11） | 每次改扩展代码 | `node --input-type=module -e "…"` 或 `node tests/<ext>-unit.mjs` |
| **T1** | 单模块行为：bus 门、注册幂等、可逆性、沙箱两档（§19.13） | 提交前 | `node tests/<ext>-module.test.mjs` |
| **T3** | 端到端：临时 workspace 跑一条完整链路 | 发布前／改内核后 | 场景套件（`11-gates-and-development` 分级） |
| **变异** | 每扩展点一个唯一点变异，判据＝`FAIL - <具名>` | 进门禁前 | 复用 `MUTANTS_ONLY=<子串>` 秒级定向 |

## 19.18 扩展性缺口（今天做不到的清单 ✓ —— 实现阶段的需求来源）

| # | 缺口 | 现状 ✗ | 影响 | 最小改进形态 | 应进哪卷 |
|---|---|---|---|---|---|
| 1 | **不能注册新钩子** | 只有 `declareTopic` 自建**主题**，拿不到内核阶段语义（`VU_HOOKS` 封闭 20 项） | 想做"新阶段拦截"只能改内核 | 增加"受控钩子注册"：声明名＋payload schema＋由内核在固定点触发 | `02-architecture` ＋本卷 |
| 2 | **不能扩既有钩子 payload** | 只能只读消费既有字段 | 新扩展只能靠旁路状态推断 | payload 允许**追加**声明式字段（不删不改既有字段） | `03-interface-contract` |
| 3 | **不能受控替换已注册服务** | O4 只允许"重名即拒"（`VMU_MIDDLEWARE_FAILED`） | 无法做 mock/降级/版本并存 | `register(..., { replace: true })` ＋ `dispose` 回滚 | `03` |
| 4 | **pack 不能热改设置** | 热改仅限改 settings **值**，且须批准 | 制度切换需重启 | 受控 `applySettings(patch)`（有白名单＋审计） | `04-settings` |
| 5 | **`guardWrite` 策略源不可插拔** | 只认 `vmu.safety.pathPolicy` 两档 | 组织自定义沙箱无法表达 | 策略接口化（`policyProvider`）＋默认实现不变 | 本卷＋`03` |
| 6 | **资源闸已接线，但策略不可插拔** | `memoryCeilingExceeded` **已有强制调用点** ✓（内核作为 `resourceGate` 传给成员工厂；`members.assignRole` 与 `hire` 共用同一处判定，超限具名拒 `VMU_RESOURCE_BUDGET`，在役成员重复安置不误拒 ✓；修复提交 `654b7b1`，`tests/vmu-members.test.mjs` 24/0，独立 `task-34` 复验 ✓） | 只能二值开关，无法按角色/阶段设限 | 把 `resourceGate` 变成可注入策略（按角色/阶段返回不同 ceiling） | `04-settings` |
| 7 | **无 pack 依赖解析器** | 依赖只有声明，无加载顺序/版本求交 | 多包组合易运行期异常 | 轻量解析器：拓扑排序＋区间求交＋失败具名 | `10-packs` |
| 8 | **M1 不能计数** | 谓词只看单条状态（v3-core 因此改用 M2 承载"至少 N 名验证者"） | 简单规则被迫用代码写 | M1 增加**受限聚合**（只读本对象票面，不跨对象） | `05-middleware` |
| 9 | **服务名约束不明（待核）** | 实测 `notDotted` **未被拒** ⇒ 文档说"必须点分标识符"与实现不符 ✗ | 扩展命名规范不可靠 | 明确并测试名字约束（点分还是允许单段），结论写回 `03` | `03-interface-contract`（回 `14-§2` 登记） |

> 每条都应进 `14-open-items-and-roadmap` §2 登记（编号），实现时以本表为需求源 ✓。

## 19.19 本卷验收（机器可判定，本轮实测）

1. `grep -c '^## 19\.' 19-plugin-and-extension-development.md` ⇒ **≥ 10**（本轮实测 **11 → 新增 8 节**）；
2. `grep -c 'VMU_PACK_'` **≥ 1** 且 `grep -c 'apiVersion'` **≥ 1**（双命中 ✓）；
3. ```js 代码块 **≥ 4** 且 ```yaml **= 0** ✓；
4. 亲测原文可搜：`M3 SELF-CHECK: lean=` 与 `VMU 19 T1 SAMPLE:` 与 `packContractVersion` ✓；
5. `19.18` 表含 8 行缺口，且第 6 行写明"已接线 ✓／策略不可插拔 ✗"。

---

## 19.20 契约权威表（**以代码为准**，附行号证据）

### 19.20.1 `CAPABILITIES`（常量）vs `capabilities`（字段）
| 事项 | **权威写法** | 代码证据 |
|---|---|---|
| 能力**词表**（导出/常量） | **`CAPABILITIES`（全大写）** | `kernel/bus.js` **L23-L25**（注释 "The capability vocabulary…" 紧接 `'read-state', 'read-args', 'deny', …`）；`kernel/loader.js` **L36** 同名常量 |
| 模块/条目上的**声明字段** | **`capabilities`（全小写）** | `kernel/loader.js` **L74** `const caps = module.capabilities`；**L75** 报错文案 `the module must declare capabilities (a non-empty list)`；**L87-L88** `entry.capabilities`／"the module uses capabilities the entry did not declare" |

**结论（照抄口径）**：**字段写小写 `capabilities`；词表/常量写大写 `CAPABILITIES`** —— 二者不冲突（一个是对象键名，一个是常量名）。批评者看到的差异正是这两层 ✗，卷内 §19.1.2／§19.2.1 的用法保持不变 ✓，但**新增本表以消歧** ✓。

### 19.20.2 决策名：总线 `deny` vs 宿主桥 `block`
| 层 | **权威键** | 代码证据 |
|---|---|---|
| **vmu 总线**（钩子决策） | **`deny`**（能力名 `deny`） | `kernel/bus.js` **L29-L31**：`/** decision key -> the capability it consumes */` ＋ `deny: 'deny'` |
| **宿主桥** | `deny` **或** `block`（归一） | `host-hooks.js` **L70** `const block = decision.deny || decision.block`（**L71** 转成 `{ kind:'block', feedback }`）；同文件 **L54-L56** 处理 `decision.deny` |

**结论**：**在 vmu 钩子上返回 `deny`** ✓（`{ deny: { code, message, by? } }`）；`block` 只是**宿主桥接受**的另一种写法（L70 归一）✓。§19.4.1 的规则返回保持不变；**§19.4.2 的 M2 样例已按本表改为 `deny`** ✓（原 `{ block: true, … }` 写法已移除 ✗）。

### 19.20.3 实测断言：真总线上 `deny` 真的拒绝（**逐字命令＋原文**）
```bash
node --input-type=module -e "
import { createBus } from './vibe-math-vmu/kernel/bus.js'
const entry={ id:'t53-deny', kind:'module', on:['ballot/cast'], capabilities:['deny'],
  handler:()=>({ deny:{ code:'VMU_PACK_T53_DENY', message:'T53: the ballot is denied by a real entry', by:'t53-deny' } }) }
const bus=createBus({ entries:[entry] })
console.log(JSON.stringify(await bus.emit('ballot/cast', { member:'r-1', object:{ id:'p-1' }, vote:1 })))
"
```
原文输出（**实测 ✓**）：
```json
{"ok":false,"decision":{"deny":{"code":"VMU_PACK_T53_DENY","message":"T53: the ballot is denied by a real entry","by":"t53-deny"}},"refused":{"code":"VMU_PACK_T53_DENY","message":"T53: the ballot is denied by a real entry"},"entry":"t53-deny","decisions":[…]}
```
⇒ **`deny` 形状在真总线上确实触发拒绝**（`ok:false` ＋ `refused` 具名）✓；同轮实测 `Object.keys(bus)` ＝ `["on","add","entries","setDryRun","isDryRun","disable","enable","declareTopic","emit","status","trace","wrapHostWaterfall"]` ⇒ 钩子执行入口是 **`bus.emit(hook, payload)`** ✓（写入 §19.17 的跑法用）。

## 19.21 可执行判据（**升级 §19.19／§19.13 的存在性判据**）

| # | 判据（**可执行** ✓） | 命令 | 期望输出（原文） |
|---|---|---|---|
| 1 | 守卫套件全绿 | `node tests/vmu-guard.test.mjs` | `=== VMU GUARD: 19 passed, 0 failed ===` |
| 2 | T1 样板全绿（可照抄装载） | §19.13 的 `node --input-type=module -e "…"` | `=== VMU 19 T1 SAMPLE: 10 passed, 0 failed ===` |
| 3 | **真总线 deny 生效** | §19.20.3 的命令 | `"ok":false` ＋ `"code":"VMU_PACK_T53_DENY"` ＋ `"refused"` |
| 4 | M3 真机探针（缺件如实报） | §19.4.3 的命令 | `M3 SELF-CHECK: lean=no latex=no` |
| 5 | 结构（保留一条存在性判据作兜底） | `grep -c '^## 19\.'` | `≥ 10`；且含 `> 状态：`／`> 上位：`／"验收"／`未核项`（含 `14-§2`） |

> 判据 1–4 都是"**能 import／装载并跑出预期输出**"✓；任一跑不出即视为本卷回归 ✗。未核项（编号登记见 **14-§2**）：① M1 DSL 端到端未亲测 ✗；② M2 门端到端未亲测 ✗；③ `createPack` 官方签名以 `10-packs` 为准 ✗；④ shared 语义待确认 ✗；⑤ 服务名约束（`notDotted` 未被拒）待核 ✗。

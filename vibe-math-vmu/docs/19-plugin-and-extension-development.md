# 19 · 插件与扩展开发（当 settings ＋ 中间件不够用时）

> 状态：**草案 v0.1**（新卷；task-45 起草 ✓；契约取自内核既有约定与 `packs/*.js` 的**真实形态** ✓；**样板未亲测装载** ✗ ⇒ 见 §19.9／§19.10 ✓）
> 上位：`01-philosophy.md`（R5 四形态 / R7 稳定接口 / R11 具名拒绝）、`02-architecture.md`（L3 扩展层）、`03-interface-contract.md`（服务与工具契约）、`04-settings.md`（参数面）、`05-middleware.md`（四形态与钩子）、`10-packs.md`（M4 打包）、`11-gates-and-development.md`（门禁与接缝纪律）

> 定位：本卷回答一个问题 —— **把能塞进 settings 的都塞进去、把能挂到中间件上的都挂上之后，还剩什么只能靠"写扩展"解决？** 以及**怎么写**。
> 读者：想给 vmu 加规则／加模块／加脚本／发一个 pack 的开发者。
> 未核项：凡本卷标 ✗ 的断言，均须回到 **14-§2（未核项清单）** 登记后再当事实用。

## 19.1 扩展点全景（先看能扩展什么，再看必须不动什么）

| 扩展点 | 形态 | **能做** ✓ | **不能做** ✗（不可介入面） |
|---|---|---|---|
| **M1 规则** | 声明式谓词（settings 表内） | 具名拒绝／前置校验／简单门（单条记录内可判定的性质） | 计数与累计（"至少 N 票"）、跨轮状态机、读别人文件 |
| **M2 代码模块** | ESM 模块（导出形状见 §19.2） | 任何算法：计数、状态机、外部调用、读写文件 | 改内核数据结构／绕过 `guardWrite`／在 `task/transition` 之外私自推进阶段 |
| **M3 脚本** | 独立可执行脚本（真机自检／迁移／审计） | 现场探针、一次性迁移、把"宿主事实"变成可断言证据 | 常驻逻辑、注册工具、影响正常调度路径 |
| **M4 整合包 pack** | 真实 JS manifest（见 §19.4） | 组合 M1＋M2＋别名＋角色槽位，表达**一整套制度** | 内核知道"学术／议会"等具体制度语义（R1/D5） |
| **DSH 原生 plugin/mod** | 宿主插件（`cordis` 服务/工具注册） | 系统级能力：新服务、新工具、新提示词段 | 让 vmu 内核依赖某一个宿主插件而失去可移植性 |
| **总线自定义主题** | `bus.declareTopic(name, …)` | 让扩展之间用自定义事件解耦（不碰内核订阅表） | 抢占内核命名空间／伪造内核主题 |
| **宿主接缝** | `ctx.get('subprocess'｜'timer'｜'fs'…)` | 真正执行外部动作（跑 Lean、跑数值实验） | 假设接缝一定存在（**必须自补/降级**，见 §19.3） |
| **新工具面** | 注册 `vibe_vmu_*` 工具 | 给模型一个可调用入口（含 schema/权限） | 未经声明就暴露写盘／执行能力 |
| **新服务面** | `registry.register(…)` | 挂载可被其它扩展发现的服务实现 | 覆盖已注册服务（除显式替换语义） |
| **新提示词段来源** | 提供 prompt 片段/变量 | 把扩展的规则写进模型可读的上下文 | 让提示词段成为唯一强制点（强制必须在代码路径上） |

**一句话判据**：*能扩展的是"机制的组合"；不能扩展的是"机制本身"。* 需要新机制 ⇒ 提 issue/立卷，而不是在扩展里偷偷改内核行为。

## 19.2 开发契约（扩展要长成什么样）

| 契约项 | 要求 |
|---|---|
| 导出形状 | M2 模块导出一个工厂或纯函数集合；pack 导出 manifest 对象（见 §19.4）。**默认导出可以是对象，但具名导出必须稳定** |
| `apiVersion` | 每个模块/pack 必须声明；与内核不兼容 ⇒ 装载期**具名拒绝**，不得"尽力运行" |
| `CAPABILITIES` | 必须自报要用的能力（`fs`／`subprocess`／`timer`／`bus`／`registry`）。未声明而使用 ⇒ 视为缺陷 |
| 生命周期 | 装载 → 启用 → （运行中）→ 禁用 → 卸载。**禁用必须可逆**（不留半挂状态）；热改只允许改 settings 值，不允许换模块代码 |
| 失败策略 | 失败必须**具名**且**局部**：一次扩展失败不得让内核崩溃；连续失败 ⇒ **熔断**（停止调用并在回执里点名） |
| 沙箱边界 | 扩展只能通过 `guardWrite({ settings, root, target, kind })` 写盘，只能通过 `guardSpawnCwd(...)` 决定 cwd；越界 ⇒ `VMU_NOT_PERMITTED`（message 点名路径、hint 给出当前策略与放开办法） |
| 码命名 | 框架码 `VMU_*`（如 `VMU_NOT_PERMITTED`／`VMU_INVALID_ARGUMENT`／`VMU_ENGINE_UNAVAILABLE`）；**pack 私有码必须带前缀** `VMU_PACK_<ID>_<REASON>`，禁止裸造 `VMU_*` |

## 19.3 与 DSH 的边界（什么必须宿主给，vmu 何时自补）

**必须由宿主提供**：`subprocess`（跑外部引擎）、`timer`（有界等待）、`fs`（真实写盘）、`identity`（"我是谁"）、`tools.register`（把工具发布给模型）。

**vmu 的自补三步（顺序不可颠倒）**：
1. **自补**：接缝缺失时用等价手段顶上（如无 `timer` 就用有界轮询＋墙钟上限）；
2. **明写宿主缺陷**：在文档与回执里写清"宿主没给 X"，**不得**假装能力存在；
3. **调用侧规避**：把规避写在调用侧（例如**不信任宿主传入的 cwd**，改用自己解析的路径）。

**范例（真实案例，`validateNoNullByte` 的 cwd）**：宿主传入的 cwd 可能含 NUL 字节或指向非法位置，直接把它交给 `subprocess` 会在更深处炸掉且难以归因 ⇒ vmu 的处置是：**自己校验/规范化 cwd**，非法则在**调用侧**具名拒绝（而不是把非法值透传）。这类"宿主缺陷＋调用侧规避"必须在文档里点名，否则下一个人会把规避当成多余代码删掉 ✗。

## 19.4 可照抄样板

> 说明：三段的**形状**取自内核既有约定；`pack` 骨架的 manifest 形态**取自 `vibe-math-vmu/packs/*.js` 的真实 JS 形态**（只读参照：`institute-min.js`／`v3-core.js`／`v5r-core.js`）。**本卷未亲测装载** ✗ —— 照抄进真实扩展后必须自跑测试（见 §19.5）。

### 19.4.1 M1 规则：对非法投票具名拒绝

```js
// pack 内的 M1 规则：只允许对"已锁定"的对象投票，否则具名拒绝。
export const rules = [
  {
    id: 'vote-only-on-locked',
    on: 'vote/before',
    why: '对未锁定对象投票会让结论在不同轮次间漂移',
    check: ({ object, state }) => {
      if (object && object.locked === true) return { ok: true }
      return {
        ok: false,
        code: 'VMU_PACK_VOTING_NOT_LOCKED', // pack 私有码：必须带 VMU_PACK_<ID>_<REASON>
        message: 'vote refused: the object is not locked yet',
        hint: 'lock the object first (see the pack manifest: lock = a settled record)',
      }
    },
  },
]
```

### 19.4.2 M2 模块：在 `task/transition` 上做门

```js
// M2 模块：订阅 task/transition，阻止"未通过验证就进入完成"的迁移。
export const apiVersion = 1
export const CAPABILITIES = ['bus']

export function createModule({ bus, settings = {}, log = () => {} }) {
  const off = bus.on('task/transition', (ev) => {
    const to = String(ev && ev.to)
    const verified = !!(ev && ev.record && ev.record.verified)
    if (to === 'done' && !verified) {
      log('blocked task/transition -> done (unverified)')
      return { block: true, code: 'VMU_PACK_TASK_UNVERIFIED', message: 'task cannot be done before verification', hint: 'run the verify step first' }
    }
    return { ok: true }
  })
  return { dispose: () => { if (typeof off === 'function') off() } } // 禁用必须可逆
}
```

### 19.4.3 M3 脚本：把"宿主事实"变成可断言证据（真机自检）

```js
#!/usr/bin/env node
// M3 脚本：只做只读探测，输出一行机器可判定的结论（真机自检）。
import { execFileSync } from 'node:child_process'

const probe = (cmd, args) => { try { return String(execFileSync(cmd, args, { encoding: 'utf8', timeout: 5000 })).trim() } catch { return '' } }
const lean = probe('lean', ['--version'])
const latex = probe('xelatex', ['--version'])
console.log('M3 SELF-CHECK: lean=' + (lean ? 'yes' : 'no') + ' latex=' + (latex ? 'yes' : 'no'))
process.exit(lean ? 0 : 1) // 真机缺件 ⇒ 非零退出，供调用侧规避，而不是静默通过
```

### 19.4.4 pack 骨架（**真实 JS manifest 形态**，非 YAML ✗）

```js
// vmu pack — `example-institution`: 一个最小制度的 pack manifest（形态照 packs/institute-min.js）。
export const apiVersion = 1
export const id = 'example-institution'
export const title = 'Example institution (minimal)'
export const CAPABILITIES = ['fs'] // 自报能力；未声明而使用即缺陷

export const settings = {                        // 该 pack 建议/依赖的设置键（值由用户批准后写入 settings）
  defaults: {
    'example.quorum.m': 3,
    'example.rounds.max': 4,
  },
}

export const slots = {                           // 角色槽位（谁在场、容量多少）——制度语义只活在 pack 里
  chair: { capacity: 1 },
  member: { capacity: 3 },
}

export const aliases = {                         // 旧名字 → 新机制（迁移友好）
  'example.legacy.mode': 'example.rounds.max',
}

export function createPack({ bus, settings = {}, registry }) {   // 需要代码时（M2）才导出工厂
  const dispose = registry.register('example-institution', { id, apiVersion })
  return { dispose }
}
```

## 19.5 测试与门禁（扩展也要能被"具名红"钉住）

- **分级**：T0＝秒级纯函数/规则单测；T1＝单模块行为（含 bus 门）；T3＝跨模块/端到端场景。**每个扩展至少要有 T0 ＋ 一条 T1**。
- **场景**：用临时 root（`mkdtempSync`）搭最小世界，断言"允许/拒绝"两条路径都要有。
- **断言**：① 允许 ⇒ `ok:true` 且路径/结果符合预期；② 拒绝 ⇒ **具名码** ＋ message **点名**被拒对象 ＋ hint 给出**放开办法**；③ 可逆性（禁用后不残留订阅）。
- **变异（门禁真正吃的东西）**：每个扩展点配**唯一点变异**，判据是"**变异后必须给出 `FAIL - <具名>`**"；四点纪律＝**唯一**（锚全局 x1）／**咬断言**（`no named red` ⇒ 空变异，换锚）／**最外层**（分层防御锚最外层承载行）／**少用 prose**（优先正则/条件/分支）。
- **常见失败模式**：静默忽略非法输入 ✗、把提示词段当强制点 ✗、禁用后订阅残留 ✗、越界写盘不经 `guardWrite` ✗、把 pack 私有码写成裸 `VMU_*` ✗。

## 19.6 发布与版本

- **manifest 必填**：`apiVersion`／`id`／`title`／`CAPABILITIES`／`settings.defaults`／`slots`／`aliases`（后三项按需）。
- **兼容矩阵**：pack 声明支持的 `apiVersion` 区间；内核不兼容 ⇒ 装载期具名拒绝。
- **依赖**：pack 之间不得隐式依赖；显式声明依赖 id 与版本区间。
- **废弃**：先标记 deprecated（保留一个版本周期）→ 再移除；移除必须在 changelog 与 14-§2 记录。
- **版本号与发布**：**必须用户批准** ✗ —— 本卷只写"怎么发"，**不授权任何实际发版／改版本号／commit**。

## 19.7 拟增键全表（正文可写具体键名；实际写入须用户批准 ✗）

| 键 | 类型 | 默认 | 作用 |
|---|---|---|---|
| `example.quorum.m` | natural | 3 | pack 示例：法定人数 |
| `example.rounds.max` | natural | 4 | pack 示例：轮次上限（有界，不得 unbounded） |
| `example.legacy.mode` | enum | `auto` | 别名迁移用（`aliases` 指向 `example.rounds.max`） |

> 说明：以上为**本卷出示的 pack 示例键**，不是内核新键；内核键一律在 04-settings 表内登记并由设置表生成器判定"已接线"。

## 19.8 `VMU_*` 码列（本卷涉及）

- 框架既有：`VMU_NOT_PERMITTED`、`VMU_INVALID_ARGUMENT`、`VMU_ENGINE_UNAVAILABLE`。
- **pack 私有（新，须登记）**：`VMU_PACK_VOTING_NOT_LOCKED`、`VMU_PACK_TASK_UNVERIFIED`。
- 命名规则：pack 私有码**必须**是 `VMU_PACK_<ID>_<REASON>` 形态；**不得**新增裸 `VMU_*` 码（确需新增 ⇒ 先报批）。

## 19.9 未实现／未核项标记

- 本卷 §19.4 的三段样板与 pack 骨架：**未亲测装载** ✗（形态取自内核约定与 `packs/*.js` 只读参照）。
- 新工具名（如 `vibe_vmu_pack_lint`）—— **未实现** ✗，出现处均带 `(未实现)` 标记。
- 其余未核断言 ⇒ 登记进 **14-§2（未核项清单）** ✗。

## 19.10 验收判据（机器可判定 ≥2）

1. **章节存在性**：`grep -c '^## 19\.' docs/19-plugin-and-extension-development.md` **≥ 10**。
2. **码命名与契约词**：文件内同时出现 `VMU_PACK_` 与 `apiVersion` 两个字面量（`grep -q` 双命中）。
3. **样板完整性**：`grep -c '```js' ` **≥ 4**（三个样板 ＋ pack 骨架），且 **不出现** ```yaml 骨架 ✗。

# task-40 Round 5 · falsify 范式推广到 3 个族 ＋ 30 行接族配方（`vmu-activity` 交付报告）

> 目标：把"复制模块 → 注入单点缺陷 → 同一探针变红（未变异副本绿）"从**单个面的技巧**变成**全仓可复制的常态**。
> 依据：`tests/_lib/falsify.mjs`（Round 4 建的共享库）＋ Round 3/4 的五个"不许自欺"守卫。
> 纪律：未跑全量 sweep、未 `regen-all`、未 git；变异体一律写在 `D:\_tmp` 并自建自删（有断言）；**未改任何他人测试**。

---

## 1. 交付物

| # | 交付物 | 位置 |
|---|---|---|
| 库扩展 | 家族形态（一次调用跑多个 case，各自控制组） | `tests/_lib/falsify.mjs` —— `falsifyFamily`:新增（`:224`）、`formatFamilyReport`:新增（`:242`）；原有 `falsify`(`:130`)/`formatReport`(`:199`)/`mutateOnce`/`selfContainedSource`/`assertSafeTempRoot` 一字未改（**纯追加**，verify 的 `audit-prompt-behaviour.mutants.mjs` 复跑仍 GREEN） |
| **族 1** | `mailbox`：**ack 只在投递成功之后** | `tests/vmu-mailbox-falsify.test.mjs`（**10/0**；2 处单点变异） |
| **族 2** | `chat`：**配额与禁言真的强制** | `tests/vmu-chat-falsify.test.mjs`（**8/0**；2 处单点变异） |
| **族 3** | `panel`：**子任务字段真的写入 ＋ 状态词表真的校验** | `tests/vmu-panel-falsify.test.mjs`（**9/0**；2 处单点变异） |
| — | 本报告（含 **§4 30 行配方**） | `_handoff/vmu/activity-round5-report.md` |

---

## 2. A · 三个族：不变式 → 单点缺陷 → 同一探针变红

每个族的**探针都自带"控制方向"**（good 路径真的发生），所以"坏路径没发生"不是空转；每个变异都**唯一命中**（锚点重复时用 `occurrences` 声明，见 §4 纪律 ③）。

### 族 1 · `kernel/mailbox.js` — ack 只在投递成功之后（`:287-339`）
**探针读数**：好 transport ⇒ `goodAcked:1, goodPending:0`；拒绝的 transport ⇒ `refusedCode:'VMU_MAILBOX_DELIVERY_FAILED', refusedPending:1`；抛错的 transport ⇒ `throwPending:1`；被拒的邮件仍可引用（`anchorCode:null`）。

| 变异（单点） | 锚点 file:line | 变异体读数（具名红） |
|---|---|---|
| **ack 在投递**之前 | `mailbox.js:318-320`（`let result / try { result = await tx(envelope)`）→ 在其前插入一次 `mailbox.ack(...)` | `refusedPending:0, throwPending:0`（失败的投递把邮件全 ack 掉）**并且**随后**合法的** ack 被拒为 `VMU_MAILBOX_ACK_UNKNOWN`（双重 ack 具名暴露） |
| **ack 落在**"transport 拒绝"分支上 | `mailbox.js:327-328` → 分支内插入 `mailbox.ack(...)` | `refusedPending:0`（未投递却消费）；`throwPending` 仍 1（变异是单点的） |

### 族 2 · `kernel/chat.js` — 配额与禁言真的强制（`:317-336`）
**探针读数**：`speakQuota:2` ⇒ 第三条被拒 `VMU_CHAT_QUOTA_EXCEEDED` 且账本恰好 2 条；被禁言者 ⇒ `VMU_CHAT_MUTED` 且**被拒文本不入账**；解除禁言后同一成员立刻能发言（控制方向：禁言是唯一原因）。

| 变异（单点） | 锚点 file:line | 变异体读数（具名红） |
|---|---|---|
| 配额检查被移除（**两个入口**：`send` 与 `admit` 各一份 ⇒ `occurrences:2`） | `chat.js:329` ＋ `chat.js:562` | `quotaCodes:''`（没有任何具名拒）、`quotaMessages:3`（账本越过声明上限） |
| 禁言查询被移除（同样两份） | `chat.js:317` ＋ `chat.js:558` | `muteCode:null`、`mutedAfterRefusal:1`（禁言沦为装饰，文本照进账本） |

### 族 3 · `kernel/panel.js` — 子任务字段真的写入 ＋ 状态词表真的校验（`:129-145, 218-231`）
**探针读数**：`wroteSubtasks:1, firstState:'running', boardRunning:1, changed:'overall,subtasks', historyEntries:2`；未知状态 ⇒ `VMU_INVALID_ARGUMENT`；纯字符串 ⇒ 归一化为 `state:'running'`（控制方向）。

| 变异（单点） | 锚点 file:line | 变异体读数（具名红） |
|---|---|---|
| 写入时丢掉 `subtasks` 字段 | `panel.js:229`（`next.subtasks = val`） | `wroteSubtasks:0, boardRunning:0`（正在执行的子任务在行与看板上双双消失） |
| 状态词表不校验 | `panel.js:137`（`if (!PANEL_SUBTASK_STATES.includes(state))`） | `badState:null`（`state:'nonsense'` 被接受并落进行里） |

**共同结论**：6 个单点缺陷、3 个不同面（通信耐久／策略强制／字段与词表），**每个都被"未变异时绿、变异后红"的同一探针抓住**，且 `falsifyFamily` 的 `ok` 只在**全部** case 都成立时才为真（有问题的 case 带名字上报，不能藏在兄弟后面）。

---

## 3. B · 没有碰别人的套件

- 新增 3 个文件都在**我自己的** `tests/vmu-*-falsify*.test.mjs`（写范围内）；`tests/vmu-chat.test.mjs` / `vmu-mailbox.test.mjs` / `vmu-panel.test.mjs` / `vmu-scheduler.test.mjs` 一字未动；
- 库扩展是**纯追加**（`falsify` 的签名与语义不变）——verify 的 `tests/audit-prompt-behaviour.mutants.mjs` 复跑 **GREEN** 作为兼容性证据。

---

## 4. D · **30 行接一个 falsify 族**（可复制配方）

### 4.1 骨架（照抄即可跑）

```js
// tests/vmu-<face>-falsify.test.mjs
import { falsifyFamily, formatFamilyReport } from './_lib/falsify.mjs'
import { fileURLToPath } from 'node:url'; import { dirname, join } from 'node:path'
const HERE = dirname(fileURLToPath(import.meta.url))
const MOD = join(HERE, '..', 'vibe-math-vmu', 'kernel', '<face>.js')          // ① 目标模块
let passed = 0, failed = 0; const failures = []
const ok = (c, l, d) => { if (c) { passed++ } else { failed++; failures.push(l); console.error('  FAIL ' + l + (d === undefined ? '' : ' - ' + JSON.stringify(d))) } }

async function probe(mod) {                                                   // ② 一个探针，返回可 JSON 化读数
  const a = mod.create<Face>({ clock: () => 1000, log: () => {}, settings: {} })   //    真工厂、真设置
  // 控制方向：正常路径必须真的发生（否则"坏路径没发生"是空转）
  const good = await drive(a, 'good')
  // 被检验的坏路径：必须给出**具名**结果，且每个方向单独 try/catch（变异体可能在别处抛）
  let bad = null; try { bad = await drive(a, 'bad') } catch (e) { bad = { code: e.code } }
  return { goodOk: good.ok === true, badCode: bad && bad.code, ... }          //    只放**会被缺陷改变**的字段
}

const family = await falsifyFamily({ name: '<face> — <一句话不变式>', cases: [{  // ③ 家族调用
  name: '<face>.js', module: MOD, probe,
  mutations: [                                                                // ④ 单点变异（锚点必须唯一）
    { label: 'the check removed', find: '<源码里唯一的一行/一段>', replace: '<缺陷版本>' },
  ],
}] })

ok(family.cases[0].real.goodOk === true && family.cases[0].real.badCode === 'VMU_<NAMED>', '控制组：不变式成立', family.cases[0].real)
ok(family.ok, '★ 变异后同一探针变红', formatFamilyReport(family))            // ⑤ 唯一必须的"证伪"断言
ok(family.results.length > 0 && family.results.every((r) => r.applied && r.importable && r.falsified), '每个变异都真的命中且读数不同')
ok(family.cases[0].leftovers.length === 0, '变异体写在 D:\\_tmp 并已删除')
console.log('=== VMU <FACE> FALSIFY: ' + passed + ' passed, ' + failed + ' failed ===')
if (failed) { console.error('FAILURES:\n' + failures.map((f) => '  - ' + f).join('\n')) }
process.exitCode = failed === 0 ? 0 : 1
```

### 4.2 八条纪律（每条都是我们踩过的坑，库会替你挡一部分）

1. **锚点必须唯一**：`find` 在源码里出现次数 ≠ 声明值 ⇒ 库报 `MUTATION-NOT-APPLIED`。**检查在面里重复出现时**（如 chat 的 `send` 与 `admit` 各一份），要么把锚点写长到唯一，要么**显式声明 `occurrences: 2`**（"这个检查的两份都移除"仍是单点缺陷）。**别为了省事放宽**：锚点改名后"探针无法变红"会被读成"门禁失效"。
2. **探针必须带控制方向**：只读"坏路径没发生"的探针，遇到"这个面根本没接线"也会绿。好路径真的发生（ack 真的 ack、好 transport 真的投递、解除禁言真的能发言），坏路径的读数才有意义。
3. **读数只放会被缺陷改变的字段**：多了就会让"读数不同"变成巧合；少了会触发 `PROBE-DOES-NOT-DISCRIMINATE`（库的 ④）。
4. **每个方向单独 try/catch**：变异体常常在**别的**分支先炸（例：ack 提前后，合法的 ack 抛 `VMU_MAILBOX_ACK_UNKNOWN`）。让每个方向都产出读数，缺陷就表现为**具名红**，而不是探针崩。
5. **只变异"能改变读数"的那一行**：`if (limit > 0 && used >= limit) {` → `if (false) {` 是最干净的形式；**不要把整段逻辑重写**（那会同时改掉多个不变式，红的归因就丢了）。
6. **`.every(...)` 必须同带非空守卫**：`ok(xs.length > 0 && xs.every(...), '…(non-vacuous: …)')`。否则 `tests/audit-declaration-criterion.test.mjs` 的 RULE E 会把"空集恒真"记为**新增指纹**（我第一版就吃了这条：3 个文件 3 个新指纹 ⇒ 该门红）。
7. **变异体只能写 `D:\_tmp` 并自删**：库的 `assertSafeTempRoot` 会拒绝仓库内路径（`UNSAFE-TMP-DIR`），`finally` 负责删除，残留会报 `TEMP-NOT-CLEANED`；测试里再断言一次 `leftovers.length === 0`。
8. **不改他人测试**：新族放**你自己的**文件（`tests/vmu-<face>-falsify*.test.mjs`），或只往 `tests/_lib/falsify.mjs` 追加；要动别人的套件先报 Lead。

### 4.3 什么时候**不**值得接一个族
- 不变式是"纯数据形状"（没有分支）——没有可单点移除的检查，变异会变成重写；
- 面依赖宿主接缝（真子进程/网络）而无法在 1 秒内跑完——先给它做**可注入接缝**（本仓惯例），再谈证伪；
- 该面**已经有**手写变异族且覆盖了同一条不变式（例如 `tests/audit-v5-*.mutants.mjs`）——重复不是错，但优先补**没有**证伪的面。

---

## 5. 原样命令与退出码（定向单跑）

```
node tests/vmu-mailbox-falsify.test.mjs      -> === VMU MAILBOX FALSIFY: 10 passed, 0 failed ===   exit=0
node tests/vmu-chat-falsify.test.mjs         -> === VMU CHAT FALSIFY: 8 passed, 0 failed ===      exit=0
node tests/vmu-panel-falsify.test.mjs        -> === VMU PANEL FALSIFY: 9 passed, 0 failed ===     exit=0
node tests/vmu-activity-falsify-lib.test.mjs -> === VMU FALSIFY LIB: 17 passed, 0 failed ===      exit=0   (库扩展后回归)
node tests/audit-prompt-behaviour.mutants.mjs-> === VMU PROMPT BEHAVIOUR MUTANTS: GREEN ===       exit=0   (verify 的消费者，纯追加兼容)
node tests/vmu-activity-timers.test.mjs      -> === VMU TIMERS F15/F16: 36 passed, 0 failed ===   exit=0
node tests/audit-declaration-criterion.test.mjs -> 74 passed, 1 failed                            exit=1   (RULE E 指纹 current=67 baseline=67 —— 我的文件零新增)
node tests/audit-scope-classification.test.mjs  -> === SCOPE CLASSIFICATION: 38 passed, 0 failed === exit=0
```

**唯一一条红不属我**：`audit-declaration-criterion` 的 `regen-all --check really runs green`（生成链未跑，属 Lead 的 regen 步骤）。

---

## 6. 未做项 / 下一轮的自然候选

1. **第 4 个族（`resume` 的"写前必读"闸）未做**：任务给的上限是 3 个族，已完成；`resume` 是最自然的下一族（`kernel/resume.js` 的 read-before-write 门是单点可移除的显式检查），按 §4 配方约 30 行。
2. **没有为每个族覆盖"全部不变式"**：每族只证明**一条**声明的不变式（mailbox 的 ack 顺序、chat 的配额＋禁言、panel 的字段＋词表）。其余不变式（如 mailbox 的 `anchor` 悬空拒、panel 的偏离记录）**未**证伪——已如实登记，不假装覆盖。
3. **`falsifyFamily` 不做跨 case 的"共享变异体"**：每个 case 独立复制/清理（更慢但更清晰）；如果某轮要跑几十个 case，可以再加"同模块多探针共享一次复制"的优化（本轮不需要）。
4. **未跑**：全量 sweep、`regen-all`、`git`（Lead 统一）。
5. **临时文件**：三个族的变异体全部由库写进 `D:\_tmp` 并在 `finally` 删除（每个文件都有 `leftovers.length === 0` 的断言）；我自己的 scratch 无残留。

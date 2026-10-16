# Phase 2 · comms · Round 21 · pack 默认折叠 ＋ 来源可见：★ **这条路由【今天打不通】，机制已查到**

> ★ **结论**：我按你给的配方用**临时 pack**（`config.root` 指向临时目录 + `config.packs` 启动时声明）跑 ⇒ ★ **折叠没有发生**（`resolved[<key>].source` 不是 `pack:<id>`、`enabled:false`、`source:'default'`）。
> ★ **根因（代码指认，不是猜）**：★ **折叠读的是 `here`（入口自身目录），不是 `root`** —— `vibe-math-vmu.js:355` `JSON.parse(readFileSync(join(here, 'packs', name, 'settings', 'defaults.json'), …))`；而 `root` 用在别处（`:231` 根人格 prompts、`:298` 运行期新增 pack 的**报备**分支）。⇒ ★ **`config.root` 不能重定向 pack 默认的折叠**。
> ★ 因此：**你的事实 3（"`hereU` 可被 `config.root` 覆盖 ⇒ 测试里可以指向临时目录"）在【折叠路径】上不成立**（它在 prompts 路径上成立）。★ 我**未改任何仓内代码/默认**；★ **也没有留下红测试**（探针已从 `*.test.mjs` 改名，见 §4）。

## 1. 我做了什么（探针）

文件：`tests/b1prime-pack-fold.probe.mjs`（★ **由 `*.test.mjs` 改名而来**，所以套件里**不会**出现一条恒红的测试）。
夹具：临时目录 `packs/tmp-fold-pack/{index.js, settings/defaults.json}`，`defaults.json` 形状`{ _comment, defaults: { 'vmu.report.feedback': true, 'vmu.report.audience': 'm1' } }`（★ 与 v5r 同形 —— 探针第 1 条断言**通过**了，说明形状对）；`index.js` 复用 `packs/institute-min/index.js`（只读拷贝）。
调用：`entry.apply(ctx, { clock, root: <临时目录>, packs: ['tmp-fold-pack'] })`（★ **启动时声明**，符合"运行期加的 pack 折不了"的约束）。

## 2. 读数（探针 4 passed / 5 failed，失败的正是关键那几条）

| 断言 | 读数 |
|---|---|
| ★ 夹具形状（`defaults` 形状与 v5r 同形） | **PASS** ✓ |
| ★★ 非空前置：**内核自述**该键来自 pack（`resolved[<key>].source === pack:<id>`） | ★ **FAIL** ⇒ `resolved.source` **不是** `pack:tmp-fold-pack` |
| ★★ 折叠：`enabled:true`（无 config 设置它） | ★ **FAIL** ⇒ `false` |
| ★ `audience` 取自 pack 默认 | ★ **FAIL** ⇒ `null` |
| ★★ 来源可见：`source === 'pack:<id>'` | ★ **FAIL** ⇒ `'default'`（★ 注意：**不是**旧的写死字面量 —— 说明 e04584f 的"读真实来源层"**本身是生效的**，只是**这一格的值是 default**） |
| ★ 与内核自述一致 | ★ **FAIL**（同上：两边都是 `default`，**一致但都没到 pack**） |
| ★ 前置：`context()` ≥1 | 未能达成（因为开关没被打开） |
| ★ 对照臂：不声明 pack ⇒ `default` | **PASS** ✓（★ 说明 ARM 1 没有测到 pack，而不是测到了一个常量） |

## 3. ★ 根因与两条出路（请你裁）

**代码指认**：折叠处 `vibe-math-vmu.js:355` 用 **`here`**；`const root = …config.root…`（`:150`）**没有**参与该拼接。⇒ 只要 pack 不在**入口目录**下，`settings/defaults.json` 就**永远读不到**，⇒**"pack 默认在运行时真的被折叠"这条路由不能用临时目录行使**。
**出路**（都需你裁，因为都越出我的写范围）：
1. ★ **给折叠加一条基目录接缝**（例如 `config.packsRoot`，一行拼接入参）⇒ 之后本探针即可变成**常驻断言**（且不影响任何随包默认）★ **改的是 `vibe-math-vmu.js`（pack2 的面）** ⇒ **我不动**；
2. ★ **或在 `vibe-math-vmu/packs/` 下临时建/删一个 pack**（运行期自建自删）⇒ 但那是**写 `packs/**`**（本轮明令不碰）⇒ 需你授权，且要处理"失败时残留"，我不推荐；
3. ★ **或用一棵临时【入口副本】**（把 `vibe-math-vmu.js` 及 `packs/` 拷进临时目录，pack 放在**副本的入口目录旁**）⇒ 这样 `here` 就落在临时目录里 ⇒ **不碰真树、不加接缝**即可行使该路由 ★ **我倾向这条**，但需要一次"拷贝整棵 vmu 目录 + 在副本里跑"的构造（成本中等）。

## 4. 状态 / 纪律 / 没核

- ★ **没有留下红测试**：探针已改名为 `*.probe.mjs`（不进套件）；★ **未改任何仓内代码/默认**（`packs/v5r/**`、`vibe-math-vmu.js`、`kernel/**` 均未动）；**无半截状态**。
- ★ **纪律 33**：本探针**不是**测试文件 ⇒ 不触发派生计数；★ 一旦按 §3 出路 1 或 3 变成常驻断言，**新测试文件会改派生计数** ⇒ 届时**请你 `--write`**（我不自行 `regen-all`／不 git）。
- ★ **没核**：我**没有**验证"pack 放在入口目录下就一定能折"（那需要 §3 的授权或副本方案）⇒ **这条路由今日仍未被行使过**；`audit-package-membership` 未独立复跑（R5 已按你的实测解除）。
- ★ **口径（已写进探针文件头）**：钉的是"**折叠**＋**来源如实**"，★ **不是**"这个默认该不该开"。

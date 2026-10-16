# Phase 5 · **突破与下一个阻塞点**（Round 30 —— ★ 反证测试通过，★ 阻塞点精确定位）

> ★ 作者＝Lead。★ 依据：`slv5q` 运行的 `run.log` / `jsonl` / `srv.err`（★ 仓外 `_oneoff/vm-slv/`）。

## 1. ★★★★★ **反证测试通过：pack 真的装上了**

★★★ **把配置从【设置键】换成【宿主键】并补上 `root` 之后**：
```
packs:        ["v5r"]
appliedPacks: ["v5r-core"]     ← ★★★ pack 应用了
store:        true             ← ★★★ 非 null
library:      true             ← ★★★ 非 null
```
⇒ ★★★★ **`config.root` ＋ 宿主键 `packs` ⇒ pack 应用、`store`／`library` 同时非 null** ✓✓
⇒ ★★ **因此 `vmu-core2` 的假设【成立**】：★ **`store`／`library` 为 null 不是独立接缝缺失，★ 而是同一根因的下游** ✓ —— ★ **而它提出的反证正是这一格** ✓✓

★★ **本轮读数**：★ **`exit=0 dur=373s tokens=1,314,987 capHit=False timeoutOrFatal=False`** ⇒ ★★ **首次【完全干净】的完成**（★ 无触顶、无超时、无崩溃；★ `srv.err` 只有无害的 `dshmarket` 跳过）✓

## 2. ★★★ 下一个阻塞点：**双账本 ⇒ 成员永远为零**

★ **代理的因果链（★ 逐条实测，★ 逐字）**：
1. ★ **`control.hire`** → 写入**身份名册**（★ `control.roster` 能看到 3 人，★ **但 `turn` 看不到**）✓
2. ★ **`vibe_vmu_turn(op=step)`**（缺省推断）→ `{"stopped":"no-members"}` ⇒ ★ **合法的空转，不报错** ✓
3. ★★★ **`vibe_vmu_turn(op=step, members=[{id,role}])`（显式注入，★ 形状与提示词描述一致）→ 【未具名崩溃】**：★ `{"ok":false,"message":"Cannot read properties of undefined (reading 'id')"}` ⇒ ★★ **又一个"裸崩"，★ 又是一个未被拦住的 `TypeError`** ✓✓
4. ★ **准入面 `openPosting→…→confirm`** 成功建 staff，★ **`turn` 依旧 `no-members`** ⇒ ★★ **"两套名册互不相认"** ✓
5. ★ **会议面 `hasDeliverSeam:false`** ⇒ ★ **即便名册对了，也没有投递通道** ✓

★★★ **后果链**：★ **无人被唤醒 → 无人表态 → 齐票 0/0 → `undecided` → 不进论文阶段 → 无 `finalize`** ✓
★★ **代理裁定**：★ *"任务给的三种可能卡点里，★ 命中的是第一种：「名册未建立」—— ★ 准确说：**名册建立得起来，★ 但建的不是 `turn` 读的那一份**"* ✓✓

## 3. ★★★★ **代理给出的第一优先修法（★ 我认同）**

> ★ **"把成员名册收敛成【唯一一份】、并且有【对外面能建】"** —— ★ 即让 `control.hire` 与 `admission.confirm` **真正写进 `turn` 读的那个内核槽位名册**（★ 或反过来让 `turn` 读身份名册），★ **并【删掉】那份只能由 `declareSlots()` 创建、却【没有任何已发布面能调用】的名册** ✓
> ★ **理由**：★ *"这一处**双账本**（identity 名册 vs 内核槽位名册）**单独**卡死了 ⑤会议、⑥共识、⑧论文**三整条停点链路**；★ 连带把 `hasDeliverSeam:false` 与 turn 显式 `members` 的 `TypeError` 变成"具名拒"而非静默空转/裸崩，★ 也能立刻让人知道是配置没接上，而不是怀疑成员不肯投票"* ✓✓

## 4. ★★ 一并记录（★ 代理所报，★ 未修）

- ★ `apply` 的 **`posting` vs `postingId`** 字段名不一致 ✓
- ★ **`ballot.opened.target` 为 null** ✓
- ★ **`vibe_vmu_script` 以 `VMU_ENGINE_UNAVAILABLE` 缺席**，★ 而 `vibe_vmu_bridge` 却在场，★ 且被 `v5r-core-no-adhoc-scripts` 中间件 deny（★ 规则已编译：`evaluations:1` ✓）
- ★ **`vibe_vmu_mathadapters` probe** 具名拒：★ `VMU_EXTERNAL_UNAVAILABLE 适配面需要注入 resolveExecutable（本机未接真解释器）`，★ **hint 逐字："由宿主注入 resolveExecutable；本面绝不假装探测过本机 ✗"** ✓ —— ★★ **代理评价："它没有假装成功 —— 这是本次走查里我最满意的一处"** ✓

## 5. ★★ 本轮我自己的错误（★ 记下）

★★ **我在【跑完套件之后、提交之前】没有重新验证** ⇒ ★★ **队友在我测试与提交之间改坏了 `host-spawn.js`，★ 而我的提交信息仍声称"套件通过"** ✓
★ **修复过程**：★ 恢复该文件 ⇒ ★ **但我的第一次修复又删掉了函数体内的守卫**（★ 因为损坏有两处 ✓）⇒ ★★ **而【所有套件仍然通过】** ✓✓ —— ★ **因为没有任何套件覆盖"调用方传非数组"这个反例** ✓
⇒ ★★★ **教训（★ 已写进提交信息）**：★ **（a）测试结果只对【被测的那几个字节】有效 ⇒ 提交前必须重测**；★ **（b）`node --check` 不够（★ 坏文件仍是合法语法）**；★ **（c）套件也不够（★ 守卫缺失时它们全绿）⇒ 必须【导入模块 ＋ 源码结构探针 ＋ 反例**）** ✓✓

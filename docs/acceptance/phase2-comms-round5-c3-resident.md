# Phase 2 · comms · Round 5 · C3 常驻断言 ＋ 撤销一条**幻影欠账**

> ★ 两项：**① 那条"登记欠账"按你的实测【撤销】**（并记入新纪律）；**② C3 的 FIXTURE 臂已成为常驻断言 `tests/b1prime-c3-computed-guard.test.mjs`（5 passed / 0 failed）**，并且**当天副本制反例**证明它**有牙**（把扫描改成 no-op ⇒ 副本里的测试 exit=1，红在 3 条 FIXTURE 断言上；CONTROL 臂保持绿）。
> 真树只读（hash 前后一致 ✓）；副本制；未跑全量／`regen-all`／git；**无半截状态**。

## 1. ★ 撤销"登记欠账"（非欠账，实测解除）

- 我连续两轮把 **`tests/b1prime-staleness-report.test.mjs` 未登记进 `package.json files[]`** 记为欠账。
- ★ **你的实测**：该文件在场时 `node tests/audit-package-membership.mjs` ＝ **29 passed / 0 failed，exit=0** ⇒ **普通的 `tests/*.test.mjs` 没有登记义务**（该规则的模式针对 `tests/audit-*` 与 **`tests/*.mutants.mjs`**）。
- ⇒ ★ **标注为「非欠账（实测解除）」**；★ **来源注明**：这条实测**是你提供的**，我**没有独立复跑** `audit-package-membership`（**没核**）；我能独立确认的是"我先前的记录**未经测量**"。
- ★ **并入纪律（我照记）**：**被记下的"欠账"也要用测量确认它真的是欠账** —— 否则总账会带**幻影欠账**（★ 我这条正是**连续两轮的幻影**：把"我以为的规范"当成了"实测的规范"）。

## 2. ② C3 常驻断言：`tests/b1prime-c3-computed-guard.test.mjs`（**5 passed / 0 failed**）

**为什么必须用副本**：守卫扫的是**运行期源码**，而夹具探针**必须落在被扫的树里** ⇒ 测试把 `scripts/`＋`vibe-math-vmu/` 拷进**临时目录**，探针只写进副本 ⇒ ★ **真树零污染**（每臂 `mkdtemp`，跑完删）。
| # | 断言 | 意图 |
|---|---|---|
| 1 | ★ **CONTROL 臂**（副本不加探针）：守卫**静默**、生成器 **exit=0** | ★ **非空对照** ⇒ 证明它**不是恒响**的危险守卫 |
| 2 | ★ **FIXTURE 臂**（副本加探针文件，探针第 3 行是 `NS[key]`）：守卫**响**（具名 ＋ `exitCode=1`） | 核心：**出现即被告知** |
| 3 | ★ **target-addressed**：守卫打印的**行号 ＝ 探针里那一行的真实行号**（本例 3） | 落点在目标上，不是"随便响了" |
| 4 | 报告里**点名绑定**（`NS`）⇒ 读的人知道去看什么 | 可操作性 |
| 5 | CONTROL 仍输出正常 `--json`（`"wired": …`） | 守卫是**加法**，不是替换判据 |
★ **口径照旧**：这**不是接线断言** —— 文案明写"**这不是'没人读'：下标名静态不可解析 ⇒ 必须人工看**"；★ **`const K='x'; NS[K]` 字面量常量键**：**不做常量表解析（不猜）**，但**落进同一个"响"的桶**（不会被静默吞掉）。★ 这一格我上轮就是这么做的，本轮保持；★ **"是否可以解析常量键"仍记「没核」**。

## 3. 当天副本制反例（target-addressed）

`D:\_tmp\v49\counter.mjs`：拷 tree ⇒ **只变异副本**：把计算属性扫描的正则改成**永不匹配**（＝**把这一遍扫描改成 no-op**）；★ **落地证明**＝**原锚点已不存在**（★ 我第一版落地检查**写得太松**（前缀匹配到了**另一条** `new RegExp`）⇒ 误报"没落地"⇒ **已改为检查原锚点本身**）。
```
MUTATION LANDED ✓ (computed-access scan is now a no-op; original anchor gone)
COPIED TEST (mutant) exit=1 (red ✓)
   FAIL ★ FIXTURE: the guard FIRES (named line + non-zero exit) when a computed access exists [exit=0 named=0]
   FAIL ★ target-addressed: the reported line number equals the probe's real `NS[key]` line [expected :3 got ""]
   FAIL and the report names the BINDING, so a reader knows what to inspect []
★ 红在被测断言上（FIXTURE/守卫会响/行号）: YES ✓
CONTROL 臂仍应绿（它不是夹具）: OK ✓
REAL TREE UNTOUCHED: 403479a1efc6b426 -> 403479a1efc6b426 OK (read-only ✓)
```
⇒ ★ **判据有牙**：扫描一 no-op，**FIXTURE 的 3 条断言**立刻红；★ **CONTROL 不受影响**（说明这 3 条**确实钉在夹具上**，不是泛红）。

## 4. 状态 / 没核

- **跑了/核了**：C3 常驻断言 5/0；CONTROL／FIXTURE 两臂读数；反例（落地证明＋红在目标断言＋CONTROL 仍绿）；真树 hash 前后一致。
- ★ **没核**：`audit-package-membership` 我**未独立复跑**（撤销欠账依据＝**你的实测**，已注明来源）；`NS[K]` 常量表解析（**不猜**）；★ `process.cwd()` 改动的"**改前从别处失败**"形态保持记为**没核**（按你上轮要求，**不补不猜**）。
- **`--check` 状态**：真树守卫**静默**、生成器 `--json` 为 `{1108 wired, 5 undetermined, 113 notWired, stale:false}` ⇒ ★ **不需要 `--write`**。
- **纪律**：★ **先 `git add` 再跑门禁** —— 我本轮**不跑门禁、不 git**（若下一轮要跑，会先提醒你 `git add`）。
- **仓内改动**：`tests/b1prime-c3-computed-guard.test.mjs`（新）＋本报告；**无半截状态**。

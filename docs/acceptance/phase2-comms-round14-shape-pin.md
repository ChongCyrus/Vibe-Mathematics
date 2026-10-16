# Phase 2 · comms · Round 14 · 形状钉住：`reportFeedback` 的 9 键两处构造必须一致

> ★ 交付：`tests/b1prime-reportfeedback-shape-pin.test.mjs` ⇒ **6 passed / 0 failed**；★ **反例 M1**（副本里改回退的一个键名）⇒ **LANDED ✓、exit=1、红在"9 字段相等"那条上并逐字点名 `differing: [what]`**。
> ★ **我自曝一处构造错误（已修）**：第一版**拿两份【输入不同】的对象比** ⇒ 报 `differing: [code, what, reason]` ⇒ ★ **正是复核者警告过的陷阱（"拿输入不同的两者比 ⇒ 零信息"）** —— 我**没有**把它当成"发现漂移"，而是当**测试自己的错**修掉了（见 §3）。
> 真树只读（hash 前后一致 ✓）；副本制；**无半截状态**；**未改** `run-tests.mjs`／`GATE_SUITE_TIMEOUT_MS`。

## 1. 钉的是什么（口径，已写进测试注释）

★ **它钉"两处必须一致"，不钉"两处都正确"** —— 正确性由各自其它断言管（`reportfeedback.js` 自己的测试／`report.js` 的其它断言）。原文已写入文件头注释，免得后人误以为它覆盖更多。

## 2. 两条路径与**非空前置**（都由真入口构造，不手搓对象）

| 路径 | 构造 | 非空前置（断言） |
|---|---|---|
| **(1) 真源** `kernel/reportfeedback.js` `reportFeedbackReceipt()` | 经 `kernel/index.js` 注入；测试里用 `createReport({ …, feedback: spy })`，`spy` 记录它收到的 `c` 并转发真源 | ★ **provider 真的被调用**（`captured !== null`）＋ 产出的对象含 9 键 |
| **(2) 内联回退** `kernel/report.js` `feedbackReceipt()` | ★ **不传 provider** 建面（`createReport({ clock, settings:{} })`）⇒ 必然走回退 | ★ 该面**仍返回 9 键**（回退被执行） |

## 3. ★ 钉本身，以及我上一版的错

- **钉**：给**两条路径同一份显式输入**（`SHARED`：`enabled/source/audience/delivered/registered/code/what/reason/stack`），断言 **① 键集合与顺序相同**、**② 9 字段逐字相等**、**③** 回退里那两条具名降级字面量（`code:'VMU_EXTERNAL_UNAVAILABLE'`／`what:'systemPrompt.context'`）与真源对同输入的回显一致。
- ★ **我上一版的错**：我拿 **spy 收到的内部 `c`**（只有 `feedback/audience/…`，**没有** `code/what/reason`）去喂真源，却拿**回退硬编码的那三个字段**比 ⇒ **两边输入不同** ⇒ FAIL 报 `differing: [code, what, reason]`。
  ★ **处理**：**不把它当发现**（那会是"零信息"的结论），而是**修测试**：两边都喂 `SHARED`（`reason` 取自回退自身的输出以保持同文），⇒ **6/0**。
  ★ 这条留在报告里，因为它正是**复核者 R12 踩过的同一个坑**，值得作为"比之前先确认比的是哪两份东西"的第二个实例。

## 4. 当天副本制反例（target-addressed）

`D:\_tmp\v52\counter.mjs`：拷 tree ⇒ **只变异副本的 `kernel/report.js`**（回退处把 `what:` 改名 `whatContext:`）；★ **落地证明**＝原锚点已不存在。
```
M1 (fallback key renamed) LANDED=✓  exit=1 (red ✓) === B1PRIME REPORTFEEDBACK SHAPE PIN: 2 passed, 4 failed ===
  FAIL ★ path (2): a face built with NO provider still returns the 9 keys (the inline fallback ran) […]
  FAIL ★ the two paths emit the SAME KEY SET IN THE SAME ORDER … […]
  FAIL ★★ SHAPE PIN: with the SAME input, the real source and the inline fallback agree on ALL 9 FIELDS [differing: [what]]
```
⇒ ★ **红在"9 字段相等"那条上，且逐字点名被改的那个键 `what`**（落点在目标上）。★ 另两条同时红是**同一变异的连带**（回退键名一改，9 键集合也不再齐）——**不是泛红**，因为 `differing` 精确指向 `what`。
★ **M2（在回退里插 `throw` 以证明"不传 provider 确实走回退"）本轮【未取得】**：我的 `_tmp` 反例脚本在 M2 那段**自身语法错误**（脚本把源码行回显、未执行）⇒ ★ **如实记「未取得」**（我**不**把 §2 的"该面仍返回 9 键"当作回退被执行的**直接**证明；它是**间接**证明）。

## 5. 派生检查 / 登记 / 纪律

- ★ **新测试文件会改派生计数**（纪律 33）⇒ ★ **提醒你**：需要时跑一次 `--write`（我不自行 `regen-all`／不 git）；本轮我**未跑门禁**（若下一轮跑，会先提醒你 `git add`）。
- ★ 新增文件＝`tests/b1prime-reportfeedback-shape-pin.test.mjs`（★ 按你的**独立文件名**要求，未碰 `pack2` 的任何文件；**未改** `report.js`／`reportfeedback.js`／`index.js`）。
- **没核**：M2 那条"回退被执行"的**直接**证明（脚本错误，未取得）；`audit-package-membership` 未独立复跑（R5 已按你的实测解除该项）。
- **仓内改动**：新测试 ＋ 本报告；**无半截状态**。

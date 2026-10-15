# Round 13 组织草案（Lead · Round 12 收尾后）

> **Round 12 结果（已 commit `248fb1e` 并 push）**：T0 **25/25**、T1 `GATE_SCOPE=vmu` **308/308**；29 文件、+799/−161。
> **★ 两个独立内核进程真的对话**（三 pid）：A 发命题 DM＋persist → **B（另一进程）restore 后读到正文** → B **锚定原信**回复＋ack → **第三进程读到回复**；两成员各跑真作业、成果落同一 library root。**两条真实语义具名**：耐久要显式 `await mailbox.persist()`；**`replyTo` 只能锚未 ack 的信**（先 ack 再 reply ⇒ `VMU_MAILBOX_ANCHOR_DANGLING`）⇒ 正确次序 **reply→ack**。
> **★ motion→box 政策分工落地**：内核只提供**已注册、可撤销、可自曝的方法** `bindBox(fn|null)`（裁决 (i)，**不是清单字段**）；pack 落 `motion-box.js`＋**常驻 22 条断言**（动议 ⇒ 箱子真存在 ⇒ 绑定真设上 ⇒ 投票**真镜像进政策选的箱**；反向：未绑 ⇒ 具名、无政策 ⇒ 不开箱不假装）。
> **★ 长尾按规则闭合**：`planned.js` 114 键/42 面 ⇒ **25 键/13 面有模块（唯一需逐键判断）**／**89 键/29 面无模块（具名"永不接"）** ⇒ **78% 不是欠债**。
> **★ U15 用否证回答**：M4 插件行＝**profile 作用域**、vmu 服务＝**每会话作用域** ⇒ 正确路径＝**M2 ＋ `api.services.get`**。
> **★ 门禁判序盲点修复**当场抓出**第三个实例** `resumeflush.js`（拆出两轮无人看见）⇒ **"全量规则优于逐个发现"第三次**。
> 8 名队友全部空闲。

## ★ Round 13 首项：**`emit({type:…})` 家族（27–29 处）＋ 两个门的扫描**（同轮原子）

| # | 项 | 归谁 | 说明 |
|---|---|---|---|
| 1 | **扫描侧**：分类门补 `emit({ type: '名' })` 识别；`audit-vmu-docs §I` 的 **700 字符窗口换成"按函数体边界"**；**各配自探针**（对象形态**必须被看见**、真发射**必须不漏**） | verify | 现状：两门**都看不见**对象形态 ⇒ 绿着假阴性 |
| 2 | **转换侧**：**16 个点号名** ⇒ 斜杠名＋登记；**12 个斜杠名** ⇒ 登记；`chat.js:156` 先查清 | core＋按面派 | 清单已钉（`D:\_tmp\vmu-r12\object-emits.txt`，29 处分类）⇒ **接手无需调研**；**先登记/改名再落门**，否则一次红 27 处归因糊成一片 |
| 3 | **owner 划分**：`storepolicy`／`metrics` → core；`ballotbox`（7 处）→ reader-a；其余 12 文件按面 | Lead 派单 | **每文件一行**，我按清单切 |

## 其余待办

| # | 项 | 归谁 | 说明 |
|---|---|---|---|
| 4 | **`choice` 优先／`value` 兜底（2 行）＋ `text/kind/emergency` 透传（3 行）** ⇒ 把钻取 ① **翻成正断言** | reader-a | 根因已定位（`ballotbox.cast` 读 `choice`，`mirrorVote` 转发 `value` ⇒ `VMU_CONFLICT`）；pack 的箱形状 5 行已给 |
| 5 | **B③ `overrideOrder`／B④ `flow`**（规格已在手：`:156` 值域加 `random`、`:568-585` 模式分支、`overrideOrder` 仅 chair／必须 why／审计／`enforced[]`／未声明即拒；`flow` 4 模式） | reader-a | reader-c 连续两轮因落在 `meetings.js` 未落；**reader-a 本轮已接手**（同轮单写者） |
| 6 | **docs 键规则**：**先精确复现门的键集来源**（`:328` `SETTING_DEFS` 构造 ＋ `:374` 收集 ＋ `:389-390` 豁免）⇒ 落**调用形豁免**（`(?!\s*\()`）＋**四条自探针**（调用形不报／裸键仍报／**家族形仍不报**／**命名空间仍不报**，**先证旧豁免未误伤**）；此后 assistant 统一 `docs/22`／`docs/29` | verify → assistant | 现状：`vmu.resource.reserve(...)` 过关**只因名字恰好是键**（键一删同线即红） |
| 7 | **`docs/04` 桶① 25 键逐键三列**（归属面／是否已有落点／本轮或下轮） | verify | 只需跑 `vmu-seam-params-consumed`；**89 键长尾已闭合** |
| 8 | **双登记门禁扩口径**（`audit-package-membership` 加"被 shipped 模块 import 的路径必须在 `files[]` 或**具名豁免表**"） | verify＋activity＋pack **三方对齐** | 流程一步（拆分清单）已由 core 落 `docs/11 §6.1`；门禁侧待对齐（**判据四条**已在 §9.18） |
| 9 | **"取得↔释放"门**（按 **C6/D7** 两级粒度：`stripComments` 去噪 → 花括号配平抽函数体 → 对真文件一行注入）＋**谓词自证四条**（**"同一取得＋有 `finally` 保持安静"** 等，先排除假阳性） | activity＋verify | 与 `audit-enforced-consistency` **分工不合并**（声明↔实现 vs 取得↔释放，**不进同一计数器**） |
| 10 | **矩阵 v12 正文并入**：core 五步／`ballots` 删除（迁移 10/0）／reader-b task-90／§9.23 U15 否证／§9.24 键规则 | verify | 逐条已具名 |

## 纪律（沿用，本轮新增两条）

- 轮末由 Lead 统一 `update-doc-counts → regen-all → generate-wiring-index → T0 → T1 → commit → push`；**不发布**。
- **★ 新增（第九条，`docs/11 §4.2`）**：**每个"跳过／豁免／not-run"分支都必须有相反的开关或自探针能把它变红** —— 否则**豁免越多、门越假绿**。本轮**五个实测实例**（判序跳过／`EXPECT_*` 记账／`--require-host`／普查的 `notAttached` 类／`fired ⊆ enforced` 空过）。
- **★ 新增：`measure` 与 `source` 要一致** —— `kernel/meetings.js` 的行数 **PowerShell `Measure-Object -Line` 量出 1200，Node `split('\n').length` 量出 1245**；**以门禁/Node 为准**（同类：注释里的 `setTimeout`、截断的 `Select-String`、`files:` 的同名键）。
- **★ 新增：作者说"已撤出"不等于它不在仓** —— 我（Lead）据 pack 早先的"已撤出"说法**两次删掉它已合法落地的 `motion-box.js`**，它从备份复原。**删除他人文件前必须当场核对当前状态**，不引用早先声明。
- 既有八条：门禁必须有牙／判据与环境一致／观测量两档真的不同／回执说成功≠事真的做了／门禁读事实所在的那种文本／"没找到"≠"不存在"／重构必须原子＋每步跑加载内核的套件／清理只删本次显式创建的精确路径。
- 临时文件 `D:\_tmp`；内容型批量改写**只用 Node**；凭据副本用完即删。

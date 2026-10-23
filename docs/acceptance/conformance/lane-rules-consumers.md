# lane·规则 → 消费者（D13 / D14 / D15 / D3）：四条纯谓词终于有了调用方，辩论终于有了「最终裁决」这个面

> 台账 `docs/acceptance/phase12-v5r-rules-conformance.md` 的 D13 行（`:67`）、D14 行（`:68`）、D15 行（`:69`）在本轮之前分别是
> ❌ 缺口／⚠️ 部分／⚠️ 部分（pack 触发面未落）。本文件是这三条的 **pack 侧实现与实测**。
>
> 判定纪律（沿用台账）：
> (a) **提示词里写了 ≠ 机制存在**；(b) **模块里有了 ≠ 有人调用它**（本轮的主要缺陷就是这一条：四条谓词今天调用方是 0）；
> (c) **门禁能红才算门禁**。三条在本文件里逐条指 `file:line`。

## 0. 写域与快照

| 文件 | 我动了什么 |
| --- | --- |
| `vibe-math-vmu/packs/v5r/tools.js`（1341 → 1625 行） | 四条谓词的**接线层**（`:505-760`）、`toolMeeting` 的 D14 广播闸与 D3 `title`（`:805-880`）、两个新面 `vibe_v5_verdict_final`／`vibe_v5_verified_promote`（`:682-760`、注册 `:1498-1510`）、三处卡工具换成 `gatedCardHandler`（`:1333/:1339/:1345`） |
| `vibe-math-vmu/packs/v5r/meeting-procedures.js` | `DEBATE_PROCEDURE` 第 4 步 `status:'pending'` → `'supported'` 并填工具（`:74-84`），`notes` 增第 4 条（`:87`），`MEETING_PROCEDURE_GAPS` 删掉已闭合的 `verdict-aggregation`（`:95-105`） |
| `tests/vmu-v5r-tools.test.mjs` | 41 → 43 工具的计数与 `EXPECTED`（机械，7 处）、文案、以及 `:131` 那个 p=1 fixture 补上定论来源 |
| `tests/vmu-v5r-verdict-final.test.mjs`（新） | **63 断言**，9 节（§0–§8）；本文件的每条结论都能在其中找到正/反对 |
| `package.json#files` | 新测试登记一行（`:768` 后），实测 `files` 768 → **775**、JSON 可解析 |

命令与读数（全部本轮实跑，`D:\wd\vibemath开发\Vibe-Mathematics`）：

| 命令 | 读数 |
| --- | --- |
| `node tests/vmu-v5r-verdict-final.test.mjs` | **63 passed, 0 failed** |
| `node tests/vmu-v5r-tools.test.mjs` | **334 passed, 0 failed**（43 工具） |
| `node tests/vmu-verified-track.test.mjs` | 72 / 0 |
| `node tests/vmu-meeting-verdict.test.mjs` | 37 / 0 |
| `node tests/vmu-verified-gates.test.mjs` | 93 / 0（本轮早先的 `GATE_CODES is not iterable` 崩溃已被别的 lane 修掉，现为绿） |
| `node tests/vmu-meeting-invite.test.mjs` | 67 / 0（D9 lane 无回归） |
| `node tests/audit-vmu-services.test.mjs` | 49 / 0（83 registered） |
| `node tests/audit-installer-policy.test.mjs` | 90 / 0 ALL GREEN |
| `node scripts/check-docs.mjs` | **DOC LINT: PASS**（仅 note） |
| `node tests/vmu-meeting-types.test.mjs` | **117 / 5** —— 5 条红**全部**由本轮「第 4 步已实现」造成，**该文件不在我的写域**，精确补丁见 §7.1 |
| `node scripts/regen-all.mjs --check` | 未跑（Lead 明令：他在所有 lane 落地后统一 `--write`） |

## 1. 判定汇总

| 规则 | 之前 | 现在 | 证据 |
| --- | --- | --- | --- |
| D13 lean 已通过但 p≠1 ⇒ 辩论前必须问「描述符合性」 | ❌ 无闸（谓词在、调用方 0） | ✅ **具名拒 + 带两个合法答案**，答了才允许宣布 | `tools.js:682-760`（`toolVerdictFinal` 里 `fidelityAsked` 调用 `:728`）；`tests/vmu-v5r-verdict-final.test.mjs` §7 三条 |
| D14 辩论推荐流程 ④「收裁决 → 聚合 → 通知」 | ⚠️ 骨架第 4 步 `pending` | ✅ 第 4 步 `supported`，工具真实存在 | `meeting-procedures.js:74-84`；`tools.js:1498` |
| D15 最终裁决：全一致取该值／否则均值 + 通知持有者 | ⚠️ 内核聚合已有、**pack 触发面 0** | ✅ `vibe_v5_verdict_final`：主席签名 → 内核聚合 → **mailbox 真投递**（从收件箱读回） | `tools.js:682-760`；§6 六条正/反 |
| D3 会议标题字段（`agenda` 之外） | ❌ 只有 `agenda` | ✅ 可选 `title`：只在传了时透传、空白归一 `null`、非字符串具名拒、`meetingView` 读回 | `tools.js:844-852`、`:868`、参数声明 `:1458` |
| 红线④「没有消费者就不给机制」 | 四条谓词调用方 **0** | ✅ 四条各有真实调用点 | `gatedCardHandler:616-642`（`singleWriter` `:624`、`p1Intent` `:636`）／`toolMeeting:814-828`（`debateSubjectGate` `:816`）／`toolVerdictFinal:728`（`fidelityAsked`）；`verification-gates.js` 头部注释 `:28-30` 自承的那句「接线紧随其后，否则本文件应被删掉」已兑现 |

## 2. 接线点（每条谓词 → 谁调它 → 失败长什么样）

1. **`singleWriter`（③ 定论轨只有一个写入器）** —— `gatedCardHandler` 对**三个卡工具**的第一道闸
   （`tools.js:616-642`，注册在 `:1333/:1339/:1345`）。
   · 反：`vibe_v5_record_proposition {track:'verified'}` ⇒ 具名 `VMU_PACK_V5R_VERIFIED_SINGLE_WRITER`，消息点名唯一写入器
     `promoteVerified`（新测试 §2 两条）；· 正：`vibe_v5_verified_promote`（`tools.js:652-680`）自己声明 `writer:'promoteVerified'` ⇒ 收。
2. **`p1Intent`（① p=1 是定论，不是偏好）** —— 同一 wrapper 的第二道闸，只对命题卡（`tools.js:619-636`，调用 `:636`）。
   · 反：p=1 无定论来源 ⇒ `VMU_PACK_V5R_P1_NEEDS_DEBATE`，hint 写明三种合法来源；被拒后 **records 里没有半张卡**
     （§1 三条）；· 正：`debate_ruling:{mode:'unanimous',value:1,subject:<本卡>}` ⇒ 收；已 promote 的卡再写 p=1 **不再需要自报**
     （证据从 records 读，§3）。
3. **`debateSubjectGate`（② 辩论对象必须先被判定）** —— `toolMeeting` 在 `kernel.meetings.open` **之前**
   （`tools.js:814-828`，调用 `:816`）；证据三面：`card` 读自 records、`verified` 读自 records、`file`/`lean` 由调用方 args 提供
   （`subject_evidence`/`lean_job`）。
   · 反：以没有正式证明的 `r-` 卡为对象 ⇒ `VMU_PACK_V5R_DEBATE_SUBJECT_NO_PROOF` 且 **会议没被创建**
     （`status().liveMeetings` 前后相等，§4 三条）；· 正：一句话命题放行但如实 `provenance:'none'`；文件引用给
     `{readable:true,bytes>0}` 放行但 `proofChecked:false`。
4. **`fidelityAsked`（④ 宣布数字之前先问符合性）** —— `toolVerdictFinal`（`tools.js:724-734`，调用 `:728`）。
   · 反：`lean_passed:true` + 待裁 p≠1 + 没回答 ⇒ `VMU_PACK_V5R_FIDELITY_ASK_REQUIRED`，**消息里带着问题原文与两个
     合法答案**（`[conform | defect]`，为此 `gateRefuse` 会把 `reason`/`question`/`options` 折进 message，
     `tools.js:510-525`）；· 正：`fidelity:'conform'` ⇒ 允许宣布。

## 3. 证据从哪来（这条决定「断言是不是空的」）

`p1Intent` 接受三种定论来源；**它们的可信度不一样，必须分开记**：

| 来源 | 谁提供 | 能不能被调用方"自报" |
| --- | --- | --- |
| `verified` 定论行 | **从 records 面读**（`verifiedRowOf` → `findVerified`，`tools.js:561`） | **不能**。卡上写着 p=1 但轨上没行 ⇒ 不成立 |
| `debate` 全体一致裁决 | 调用方 args（`debate_ruling`，`tools.js:580`） | 能（设计即如此：`lane-verified-design.md` §10.6 明示闸**不核证据真伪**，只保证"没证据就拒"） |
| `lean` 通过 + `conform` | 调用方 args（`lean_job`/`lean_conformance`）或内核 `kernel.lean.job(id)` | 作业结论由内核给，`conformance` 由调用方给 |

为此卡工具**声明了** `lean_job`／`lean_conformance`／`debate_ruling` 三个参数（`tools.js:1332`）：不声明就是
「谓词分支永不可达」——那正是本轮要修的病（死代码），把参数藏起来只是把死代码挪个位置。`debate`/`lean` 这两条
由调用方自报是**设计的已知边界**，不是遗漏；真伪核对属于辩论纪要（`meeting/minutes`）与 kernel 侧的事。

`enforced[]` 由接线层写（`enforcedOf`，`:527`），谓词模块自己一个字不提 `enforced`；四条谓词的 `keys` 恒为 `[]`，
所以回执里的 `enforced: []` 是诚实的「这次判定没有读过任何声明键」，而不是"漏填"。

## 4. `title`（D3）：一个可选字段，三点克制

`agenda` 仍然兼作议题（不要动它，改名的成本落到所有既有调用方与提示词）。`title` 的三条纪律：
① 只在**传了**时透传（没传就不给会议编一个）；② 空白只当没传（`trim()===''` ⇒ `null`）；③ 非字符串**具名拒**并带
`typeof`（`tools.js:844-852`）。内核侧 `open({title})` 早已支持（`kernel/meetings.js:1648` 形参、`:1714-1718` 校验、
`:1778` 存储、回执 `:1786/:1791`、`summary`/`meetingView` 披露 `:1460/:1485`），本轮只补 pack 的声明/透传/读回。

## 5. 通知是真的（不是回执上的自称）

`toolVerdictFinal` 调 `kernel.meetingverdict.rulePropositionProbability`，内核在装配处把 `send` 绑到 mailbox
（`kernel/index.js:1321-1341`），所以 `delivery.ok===true` 时持有者的收件箱里**真的有一封信**。新测试从
`vibe_v5_inbox {action:'list'}` 读回 `rows` 里 `subject` 含「命题最终裁决」的那封（§6 两条）。失败时回执
`notified: []` + note 明说「★ 裁决在案，但没人被告知」——**不把"算出来了"说成"通知到了"**。

## 6. 「最终裁决」是一次显式签名，不是一次静默推断

- `from` = 会议主席（`meetingView({meeting}).chair`）；**点不出主席就具名拒**（`VMU_STATE`，"不匿名签发"）；
  `member` 给了且 ≠ 主席 ⇒ `VMU_NOT_PERMITTED`，消息里同时点名"主席是谁／你是谁"（§6 两条）。
- `owner`（要通知的人）取命题卡的 `owner`（= 写卡的人），空 ⇒ `VMU_STATE`「没有可通知的人，不产生没人会看的裁定」。
- **没有**在 `meetings.close` 上挂自动聚合钩子：新测试 §8 对比关会前后 `kernel.meetingverdict.status().rulings`
  **没有变化**，并从源码面断言 `tools.js` 里没有 `meetings/close` 钩子注册。规则说的「辩论结束机制」是**收裁决**，
  收是主席的动作；"关会就把数算出来"会把一次显式裁定变成一次静默推断。
- 聚合的拒法**原样透出**（多命题混桶、重复成员、非有限数、空集、目标不一致）——新测试 §6 覆盖了空集、重复成员、
  不存在的卡三条，其余由 `tests/vmu-meeting-verdict.test.mjs` 37 条兜住。

## 7. 交 Lead（都不在我的写域）

### 7.1 `tests/vmu-meeting-types.test.mjs` 现在 5 红（全部是「第 4 步实现了」的直接后果）

| 行 | 现在断言什么 | 应改成 |
| --- | --- | --- |
| `:94-95` | `steps[3].status==='pending'` 且 `pendingReason.length>40` | `steps[3].status==='supported'`，文案改成「第 4 步已有面」 |
| `:96-97` | `d.pendingSteps.length===1 && [0].n===4` | `d.pendingSteps.length===0` |
| `:99-101` | `known = ['vibe_vmu_meeting','vibe_v5_verdict','vibe_v5_say','vibe_v5_message']` | 白名单加 `'vibe_v5_verdict_final'` |
| `:110-113` | `gaps.length===2` | `gaps.length===1`（`verdict-aggregation` 已闭合） |
| `:184-185` | 工具回执 `pendingSteps.length===1` | `pendingSteps.length===0` |

⚠️ 并发提示：本轮 `tests/vmu-meeting-types.test.mjs` 正被另一条 lane 改（工作树里有 +250 行，是 title 面新断言），
上述 5 处可能与那边的改动交叉 —— 合的时候一起看。

✅ **已闭合（Lead 2026-10-23）**：Lead 按上表修完，但**没有把数字改小**，而是把断言改强——第 4 步现在要求
`status==='supported'` **且文本同时含「平均」与「通知」**（防实现回退被当成无事发生）；`pendingSteps` 要求
「是数组且长度为 0，**且字段仍在**」（空列表 ≠ 字段消失）；gaps 要求「恰好 1 条且 id 是 `min-voters`」（聚合缺口是
**关闭**，不是藏起来）。实测 `node tests/vmu-meeting-types.test.mjs` ⇒ **122 passed, 0 failed**。
这三条改法值得抄：**把「功能已实现」写成可失败的正向断言**（关键词 + 计数 + 字段仍在），而不是把旧数字抹掉。

### 7.2 台账要改的行（`docs/acceptance/phase12-v5r-rules-conformance.md`，不让碰）

✅ **已闭合（Lead 2026-10-23）**：D13/D14/D15 三行已改成 ✅ 已实现，证据按本节 `file:line` ＋门禁写进去；
§7 合计变 `42 = 12 已实现 / 6 部分 / 4 缺口 / 20 待核`；lane 表加了本文件一行。剩余 `7.3` 的「未实现」说法归各自
lane owner（`lane-verified-design.md` 是 `v5r-reader-b` 的，由 Lead 让它标 `closed-by`）。

- `:67` D13：❌ → ✅ 已实现。证据列写：`packs/v5r/tools.js:724-734`（`fidelityAsked` 在宣布裁决前）；`tests/vmu-v5r-verdict-final.test.mjs` §7；门禁 `vmu-v5r-verdict-final` 63/0、`vmu-verified-gates` 93/0。
- `:68` D14：⚠️ 部分 → ✅ 已实现（④ 闭合）。证据：`packs/v5r/meeting-procedures.js:74-84`；`tests/vmu-v5r-tools.test.mjs` 334/0。
- `:69` D15：⚠️ 部分 → ✅ 已实现。证据：`packs/v5r/tools.js:682-760`（`vibe_v5_verdict_final`）+ `kernel/index.js:1321-1341`（send 绑 mailbox）；测试 §6；门禁 `vmu-meeting-verdict` 37/0 + 本 lane 63/0。
- D3 行：✅（`packs/v5r/tools.js:844-852/:1458` + 内核 `kernel/meetings.js:1648`）。
- `:130` 表里 lane 行需要新增本文件一行。

### 7.3 仍在别处把缺口写成「未实现」的文档（都不是我的文件）

`docs/acceptance/conformance/lane-meeting.md:271`、`docs/acceptance/conformance/lane-verified-design.md:39`、
`:163`（它其实**预告**了本轮的做法：把 ④ 从 `pendingReason` 改成 `supported` 并把 gap 标 closed-by）、`:193`。

### 7.4 `regen-all --check` 未跑

按指令不在本轮跑（新测试与新工具会改变派生计数：`JOBS total`、`documented counts`、`settings table` 等）。我确知的
派生面变化：工具总数 41 → 43、新测试 1 份。`package.json#files` 已登记，`installer.js` 无需改（其 managed 清单没有
`tests/` 条目，实测代码命中 0／注释 1）。

## 8. 已知取舍与自证（不假装完整）

1. **四条谓词的 `keys` 恒空** ⇒ 回执 `enforced: []`。这是「这次判定没读过声明键」的诚实表达；不要为了让 `enforced`
   好看去编键名。
2. **`debate`/`lean` 证据由调用方自报**（设计边界，见 §3 表）。`verified` 那条不可自报。
3. **`p1Intent` 只看"要写成 1"**：p=0.5/0 不拦（那是估计值/证伪），p=0 的定稿是靠 `settled` 语义而不是这道闸。
4. **`vibe_v5_verified_promote` 需要法官**（`warrant.id + warrant_kind`）：没有法官的定论等于没有签名，具名拒（hint 指向
   `debate-unanimous` / `lean-conformance`）。p=0.5 的卡进不了定论轨（`VMU_STATE`）。
5. 本轮早先观察到 `tests/vmu-verified-gates.test.mjs` 因 `for (const id of GATE_CODES)` 迭代 `Object.freeze` 对象而
   崩溃；现在该文件 93/0（别的 lane 已修），因此不作为问题登记，只留作「门禁文件本身也会红」的旁证。

## 9. 测试写法陷阱：「看起来测了，其实没测」

本 lane 第一版新测试 **54 passed / 8 failed**，而失败的 8 条里有 5 条不是产品缺陷，是**测试自己站不住**。这一类
值得单独记，因为它每次都伪装成"绿"。

### 9.1 `members.hire()` 是 async，漏 `await` ⇒ 断言"绿得没有对手"（本轮踩到）

`kernel/members.js:174` 的 `async hire({id, slot})` 返回 Promise。漏 `await` 时得到一个 `{}`，随后 `roster()` 是
**空数组**——于是"拒绝非成员""名册里查不到"这类断言**全部通过**，因为它们要检验的对象根本不存在。
不是"通过"，是"没有可失败的东西"。修法两条并用：
① 所有装配调用 `await`；② **在断言之前先钉名册非空**（`ok(roster().length === 2, ...)`），让"对象不存在"变成一条红，
而不是让下游断言集体变绿。

同一类病在本项目里**已经出现过两次**：早前 `Object.assign` 展开一个 primitive（`Object.assign({}, 'abc')` 得到
`{0:'a',1:'b',...}`）——断言"展开了"能过，但展开的东西不是人以为的那个。判据都一样：**先证明被判对象真的存在且
形状对**，再判它的行为。

### 9.2 判定对象藏在别处：`records.get()` 的行上没有 `p`

`kernel.records.get({id})` 返回的是**行 + 正文**，命题卡的 `p` 在正文里（`- p：0.5`），行顶上**没有** `p`。读法必须是
`parseCard(row).card.p`（`packs/v5r/verified.js:250-260`）。直接读 `row.p` 得到 `undefined`，而 `undefined !== 1`
会让"p=1 应该被拒"的断言**恰好通过**——测试绿了，因为它比的是两个不存在的值。

### 9.3 分类器只认一种形状：`debateSubjectGate` 的卡形态要 `r-` 前缀

`classifySubject`（`verification-gates.js:132-140`）把 `^r-[A-Za-z0-9][A-Za-z0-9_-]*$` 认成卡、其余当"一句话声明"。
拿 `c-mid` 当辩论对象 ⇒ 走 statement 分支**合法放行** ⇒ 断言"有证明/没证明应该不同"看不出任何差别。
**测之前先确认被测分支真的被走到了**（本轮的修法：造一张 `r-noproof` 真卡，并断言 `form==='card'`）。

### 9.4 硬编码"一个都没有"：`liveMeetings` 前后对比

"会议没被创建"若写成 `status().liveMeetings.length === 1`，它会随测试顺序/其它用例漂移。写成
**before/after 相等**才是这条断言真正的意思（本 lane §4 就是这么改的）。

### 9.5 集合与列表的字段名要实测

`vibe_v5_inbox` 的行在 `rows`（`{ok,action,member,status,count,rows}`），不在 `items`/`messages`。猜错的读法拿到
`undefined`，`Array.isArray(undefined)` ⇒ 断言失败；但若写成 `parsed.rows || []`，就变成"永远空的列表也通过"。
规则：**先打印一次真实回执形状**，再写断言；列表断言同时钉 `length > 0`（RULE E）。

> 一句话：**断言失败不可怕，可怕的是它绿了因为对手不存在。** 每条"应该被拒/应该为空"的断言，都要先有一条
> "对象确实在那里"的断言站在它前面。

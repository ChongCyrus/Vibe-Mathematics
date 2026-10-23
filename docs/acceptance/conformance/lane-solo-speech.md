# lane：单次发言版群聊（D14 第①步「各成员同时独立发表」）的真机形态

只读车道。改的文件：**无**（本车道不碰 `kernel/**`，也不改提示词）。所有结论都配 `file:line` 与实跑读数。

判定纪律（沿用台账）：
1. **提示词里写了 ≠ 机制存在**；
2. **机制存在 ≠ 该场景可达**（可读面/交付接缝/权限轨都能把它挡在门外）；
3. 每条判定要有一个**机器能判的读数**；没有读数的一律写「待核」，不写「没问题」。

---

## 0. 探针与读数快照

| 探针 | 目的 | 关键读数 |
| --- | --- | --- |
| `<临时目录>/probe-solo-speech.mjs` | 群聊/会议发言/提示词三条可见性通道 | `LEAK chat room -> later member: true`；`summary/status/snapshot` 与 `meetingView` 都不含会议发言文本；`turn.assemble` 19357 字符不含任何标记串 |
| `<临时目录>/probe-solo-speech2.mjs` | 提示词装配是否自动注入群聊/分钟 | 19357 字符，`leaksA42=false`、`leaksB77=false` |
| `<临时目录>/probe-solo-speech3.mjs` | `deliverMode:'caller'` 下的交付（一次调用交回几个成员） | 一次调用只交回**一个**成员提示词（`awaiting:true, memberPrompt.member:'r-1', promptChars:11127`）；带 `reply` 再调仍只交回 r-1 |

装配：`packs:['v5r']` 真机 boot，`members.hire` 三个席位（`chair`/`member`/`member`），`vibe_v5_meeting {type:'ordinary'}` 开 `m1`。

---

## 1. 判定汇总

| # | 命题 | 判定 | 读数 |
| --- | --- | --- | --- |
| ① | 框架存在「同轮多人并发发表」 | ❌ 不存在 | 轮次是**顺序**的，一个成员一次 |
| ② | 提示词会自动带上别人刚说的话 | ✅ 不会 | `kernel/prompt/**` 与 `turn.assemble` 都没有对话读者 |
| ③ | 「单次发言版群聊」用群聊通道就能做到 | ⚠️ 能发，但**独立为假** | 房间（`vibe_vmu_chat {action:'list'}`）对任何成员公开可读 |
| ④ | 用会议发言替代群聊可保住独立 | ✅ 隔离成立，但靠的是**没有读者** | `minutes()`/`verbatim()` 无工具面，`summary/status/snapshot` 不含发言文本 |
| ⑤ | pack 可以挡住成员去读房间 | ❌ 挡不住 | `HOOK_REGISTRY` 无 `tool/*` 钩子，框架没有"工具执行前"接缝 |
| ⑥ | caller 模式下一次调用能连跑多个成员的独立回合 | ❌ 不能 | `awaiting:true` 直接结束这一批，一格一回合 |

---

## 2. 逐条证据

### 2.1 ① 没有真并发：轮次是顺序的
- `kernel/turn/index.js:1374-1382` 的自述原文：`drive: run SEVERAL turns, **one after another**, choosing each member by the policy`。
- 主体 `kernel/turn/index.js:1387` 起：`for (let i = 1; i <= n; i += 1) { const spec = nextTurn(...); const r = await run({ ...spec, round: i }) }` —— 一个成员跑完才轮到下一个。
- caller 交付接缝 `deliverByReturning()`（`kernel/turn/index.js:567-585`）的注释原文：`One tool call advances one member turn - acceptable because member turns are discrete by construction.`
- `drive()` 在 `kernel/turn/index.js:1403`：`if (r && r.awaiting) return { ok:true, awaiting:true, memberPrompt:r.memberPrompt, deliveryPath, ... }` ⇒ 交回一格就结束这一批（实测见 §0 探针 3）。

**结论**：所谓「同时独立发表」在 vmu 里只能是**顺序 + 不注入前文**；"同时"是政策的说法，不是执行模型。

### 2.2 ② 提示词不会自动注入别人的话
- `kernel/prompt/index.js` 全文 grep：`chat` / `room` / `minutes` **零命中** ⇒ 提示词管线没有"最近群聊/会议记录"读者。
- 装配参数 `kernel/turn/index.js:776`：`prompt.assemble({ member, role, roleLabel, phase, task, roster, quorum, statusBlock, round, settings })` —— 没有对话内容。
- 实测：`turn.assemble` 得 19357 字符，不含 `MARK-A42`（房间广播）与 `MARK-B77`（会议发言）。

### 2.3 ③ 群聊通道：能发，但房间对谁都可读（独立为假）
- 发送：`vibe_v5_say`（`vibe-math-vmu/kit/handlers.js:192-221` 的 `toolSay`）在三面里选择——有 `meeting` ⇒ `meetings.speak`（进分钟）；有 `to` ⇒ `mailbox.send`（私信）；都没有 ⇒ `kernel.chat.send(member, text, { kind:'chat' })`（**房间广播**）。
- 读取：`vibe_vmu_chat {action:'list'}`（`vibe-math-vmu/tools/chat.js:57-60`）⇒ `kernel.chat.list({ limit, member })`；`kernel/chat.js:486-500` 的 `list()` **不按调用者过滤**（`member` 只是"只看某人发的"筛选，`since` 是时间筛选）。
- 实测：r-1 用 `vibe_v5_say` 发 `MARK-A42` 之后，**另一个成员**调用 `vibe_vmu_chat {action:'list'}` 直接读回原文（`total:1, messages:[{from:'r-1', text:'MARK-A42 …'}]`）。
- `vibe_vmu_chat` 是 host face（`vibe-math-vmu/host.js:246`，families `['vmu.chat.']`），v5r 声明了 `vmu.chat.*` ⇒ 真机 enabled（实测工具名清单里就有它）。

**可判定的失败态**：在同一轮里，A 用 `vibe_v5_say` 发一条带唯一标记串的话，B 的回合开始后若 `vibe_vmu_chat {action:'list'}` 能读回该标记串，则「独立」为假。上面的读数就是这个失败态**已经发生**。

### 2.4 ④ 会议发言：隔离成立，但靠"没有读者"
- 写：`vibe_v5_say { meeting }` ⇒ `kernel.meetings.speak`，进 `m.minutes.entries`（`vibe-math-vmu/kernel/meetings.js:755` 附近的 push）。
- 读：`kernel/meetings.js:1174-1175` 的 `minutes()` 视图在默认 `minutesDetail` 下会 `entries.filter(e => e.kind !== 'speech' || e.ms > 0)` —— **`ms:0` 的发言条目被滤掉**；`verbatim()` 同样只在内核面。
- 工具面**没有任何** `minutes`/`verbatim` 动作（`vibe_vmu_meeting` 的 action enum 无此项）；`vibe_vmu_minutes` 这类工具在 boot 的工具清单里不存在（`tools/minutes.js` 是机构分钟文档 store，与会议内 `m.minutes` 不是同一物）。
- 实测：`vibe_vmu_meeting {action:'summary'}` 只给 motions/votes/sequence/chair，`{action:'status'}`/`{action:'snapshot'}` 也不含发言文本；`meetingView`（`kernel/meetings.js:1517`）披露 `chair`/`secretary`/`motions`，**不含 present/roster/queue**，也不含 minutes 条目。

**结论**：会议通道今天不会把 A 的话递给 B —— 但这是因为**框架没给读者**，不是因为有一条策略在挡。谁一旦加上 minutes 读面（这是合理的下一步），"单次发言独立"就必须同时加可见性闸，否则同一缺陷换到会议通道重现。

### 2.5 ⑤ 钩子挡不住工具调用
- `kernel/bus.js` 的 `HOOK_REGISTRY` 里**没有任何 `tool/*` 钩子**（grep `'tool/` 零命中）；`HOOK_REGISTRY` 是钩子的单一真源。
- 与本问题相关的既有可 block 钩子只有三个，且都不在"工具执行前"：
  - `chat/send-before` —— 只挡**写**（`kernel/chat.js` 的生产者）；
  - `turn/reply-parsed`（emit 于 `kernel/turn/index.js:1194-1196`，字段 `{ turn, member, phase, fields, reply }`）—— 看的是**解析后的回复字段**，看不到 agent 的工具调用；
  - `prompt/section-assembled` —— 只能改提示词段。
- `plan(reply)`（`kernel/turn/index.js:971-984`）只把"有 owner 的字段"映射成 dispatch 步骤，与工具面无关。

**结论**：pack 无法阻止成员调用 `vibe_vmu_chat {action:'list'}`。要挡只有两条路，都在内核：**(a)** chat 读面按轮次/成员可见性过滤；**(b)** 新增"工具执行前"钩子（`tool/before-execute` 之类）。二者都不在本车道的写域。

---

## 3. 骨架该怎么写（交给 pack 提示词的措辞建议）

`vibe-math-vmu/packs/v5r/meeting-procedures.js:82-86` 的 `notes` 已经写着「单次发言版群聊＝每人各说一次（`vibe_v5_say`）」。基于今天的读数，它需要补一句**可判定的边界**，而不是"同时独立"：

> 独立发言是**尽力而为**：框架按顺序给每人一次发言机会，且提示词不会带上别人的发言；但群聊房间对成员是可读的，框架**不保证**成员之间看不到彼此已发的内容。要真正的隔离，用会议发言（`vibe_v5_say { meeting }`，分钟无读面），不要用房间广播。

理由：只写"同时独立"会让读者以为存在隔离机制（今天没有），而只写"顺序"又删掉了一条真实存在的能力（不注入 + 会议分钟无读面）。两者都写、并把保证等级说清楚，才和实测一致。

---

## 4. 待核（未测，不算没问题）

- 真机 SLV（真 provider）下，成员**是否真的**会去调用 `vibe_vmu_chat`——本车道只证明了"够得到"，没有测"会不会去读"。这属于真实行为，不属于机制。
- `vibe_v5_say` 走 `mailbox`（`to`）的私信路径与本议题无冲突（私信是点对点），未纳入本次探针。
- 并行工具调用（同一回合里连发多条 `vibe_v5_say`）没有测；它不影响"B 能否读到 A"，只影响 A 自己写的顺序。

---

## 5. 谁动了什么

- 本车道：**只读**。未改 `kernel/**`、未改 `packs/v5r/prompts/**`、未改任何工具面；报告为本车道唯一产物（新建）。
- 相关既有机制的所有者：`kernel/turn/**`（轮次/交付）、`kernel/chat.js`（房间）、`kernel/meetings.js`（分钟）、`kernel/bus.js`（钩子单一真源）。若要补可见性/钩子，属于内核改动，请开独立条目。

---

## 6. 交 Lead 的三件事

1. **台账改判**：D14 第①步「各成员同时独立发表（并发语义）」应改判为 ⚠️ 部分——"不注入前文"成立、"同时"只是顺序、"独立"在房间通道不成立（可判定失败态见 §2.3）。证据就是上面三条探针。
   **已有的记录先接上再改，别重复登记**：`docs/acceptance/conformance/lane-meeting.md:380`（该文件的条目 12）已经写过「『同时』无机制，机器只有顺序发言，建议**只改措辞**、不要加内核屏障」——那一半与我 §2.1/§2.2 的读数一致。本车道新增的是**另一半**：即使按顺序、提示词不注入，房间通道（§2.3）仍让后来者读得到前人的话，所以措辞不能只写"顺序"，还得写"隔离是尽力而为"。两条合起来才是一次完整改判。
2. **骨架措辞**（§3）需要写进 `packs/v5r/meeting-procedures.js` 的 `notes`（我的写域，等你点头我再落；这一条会改 `vmu-meeting-types` 里 notes 的可见文本，需确认那个门禁是否断言了 notes 的原文）。
3. **两条内核能力缺口**（都不在我写域，若要做请开条目）：chat 读面的可见性过滤；工具执行前钩子。没有它们，"单次发言版群聊"的独立性只能写在提示词里当**尽力而为**的约定。

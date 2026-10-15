# Round 11 · task-86 · `docs/03 §6` 公开键逐键清单（A）＋ 零机制对照（B）＋ 内核侧残余（C）

- 状态：**A/B/C 全部完成**；`docs/03 §6` 由一句话散文改写成**逐键表**（20 个耐久键，四族，每键写者→读者 file:line）＋**零机制对照表**；C 的三条残余**两条已落、一条已由他人闭合**。
- 纪律：未跑全量、未 `regen-all`、未 git；临时文件 `D:\_tmp\vmu-r11`；结构性编辑原子完成。

## A · `docs/03 §6.1`：公开键**逐键**（不再"见 schema"）

**为什么改**：原文是一句散文（`phase`、`members[]`、`tasks[]`…），既没写**谁是写者**，也没写**声明后谁读**，还把**没有写者**的键与真键并列 ⇒ 部署无法判断"能不能依赖"。现在**只列公开面**，并按 store 白名单口径（`kernel/store.js` 的 `PUBLIC_KEYS`，20 个）**逐族逐键**给出**写者 → 读者**的 file:line：

- **族 ① 投影键（耐久；`vmu.resume.projections` 声明后才写穿/重放）12 键**：`tasks`（**journal**，命令表 `kernel/index.js:965` 一带，适配行 `:870`）／`members`（`:881`，面为 null 时报 `VMU_RESUME_NO_TARGET`）／`meetings`（`:882`）／`ballotbox`（`:883`，旧拼写 `ballots` 是**具名容忍＋告警**的别名）／`minutes`（`:884`）／`chat`（`:885`）／`panel`（`:886`）／`budget`（`:889`）／`human`（**无条件**挂，`:998` 一带）／`phase`（`kernel/index.js:928` `writePhase()`，调用点 `:1614/:1625/:1862/:1874`）／`resume`（`kernel/resume.js:439/:451`）／`ids`（`kernel/ids.js:104`）。读者一栏统一指向 `kernel/resume.js` 的 `hydrate()`（journal 用**同一批公开方法**重放）。
- **族 ② 自持久面（面自己写自己的键）3 键**：`mailbox`（`kernel/mailbox.js:497` → `restore()` `:513`；缺席 ⇒ `durable:false` 具名）／`idempotency`（`kernel/idempotency.js:323`）／`work`（`kernel/work.js:64`）。
- **族 ③ 白名单内但【未落盘】**（**只在 `status()` 视图**，不要依赖文件）：`settings.resolved`／`packs`／`middleware`。
- **族 ④ 保留/未定（白名单里有、**没有写者**）** —— ★ 明写"**任何部署不要依赖**"：
  - `ballots`（`kernel/store.js:39`）：R10 起适配表与 store 键都叫 `ballotbox` ⇒ **无写者、无读者**；**未定**（删除属破坏性变更 ⇒ §7），**具名保留**。实测：全树对该键只剩白名单行与 `kernel/index.js:982` 的旧注释（脚本 `D:\_tmp\vmu-r11\public-keys.mjs` 逐键取证）。
  - `records`（`kernel/store.js:40`）：`kernel/records.js` 是**内存投影**（文件头 `:16`：persistence stays with…）⇒ **本键无写者**；**未定**（是否要内核侧写者取决于 library 面是否接管）。实测：`kernel/**` 内**零** `patch('records'…)`／`write('records'…)`。

**口径与纪律**（写进 §6.1 开头）：白名单是唯一门槛（`assertKey`，`kernel/store.js:119`），越界 ⇒ `VMU_INVALID_ARGUMENT`；不确定的**具名标"未定"**；键的增删走 §7。

## B · `docs/03 §6.2`：零机制 ⇒ 声明后由谁读（7 个维度一张表）

| 维度 | **无声明时** | **声明后（谁读）** |
|---|---|---|
| 工具面 | **恰好 1 个** `vibe_vmu_status`（D-01 红线） | `host.js` `TOOL_FACES`／`resolveFaces` |
| 投影耐久 | **不写穿**，键停在 store 种子（state→`null`／journal→`[]`） | `kernel/index.js` attach 循环（`:975` 一带）＋ `resume.hydrate()` |
| 空闲策略 | `idleAfterMs=0` ⇒ **空闲未定义，什么都不做** | `kernel/control.js idleState()`；轮询点 `index.js` `beat()` |
| 上下文压缩 | 无 usage 信号 ⇒ **不注入** `[CONTEXT COMPACT]` | `kernel/prompt/index.js assemble()` |
| 自动论文 | `finalPaper=false` ⇒ 自动路径**具名拒**（手动仍可用） | `kernel/paper.js finalize({auto})` |
| 中间件权限 | 未声明 `trigger-workflow` ⇒ `api.services.get` **具名拒** | `kernel/loader.js makeApi().services.get` |
| 权威 | **不发明权威**（`idleAction` 默认 `notice`；无主席 ⇒ 具名拒） | 各面按声明判定；**政策在 pack/中间件**（R1） |

## C · 内核侧残余（逐条落或逐条具名）

1. ✅ **`vmu.meetings.leaveApprover` 的读者已被他人闭合**（R8 我留的具名未做项）：reader-c 本轮新增 `kernel/meetingleave.js`，实测该键在 **`:24` `approverOf()`／`:30`／`:54`／`:89`** 被真读；`docs/04:998` 已标 **✅ 已接线**。⇒ **我的 R8 残余清零**。
2. ✅ **`recruit.accept()` 回执补顶层 `enforced[]`**（R11 落）：此前只有 `tempCap.enforced` 子对象；现顶层也点名 `vmu.members.maxTempPerMember`（面级约定：回执带 `enforced`）。`vmu-recruit 44/0`。
3. ✅ **R10 八键在 `docs/04` 全部 `✅ 已接线`**（逐行核过：`:998` 起 4 行、`:1004/:1005/:1006`…），无"声明了没人读"。
4. ✅ **`audit-enforced-consistency` 已闭**（vmu-verify 按我给的两行场景落了三条 `REFUSAL_SCENARIOS`：`recruit.accept` 顶层字段／`tasks.objectAssign` 的 `detail`／`loader` 未声明 `trigger-workflow`）⇒ 我复跑实测 **358 passed, 0 failed, exit=0**（`findings=0`）。同时 `audit-vmu-services` 我复跑 **49 passed, 0 failed, exit=0**（`SURFACES['vmu.commitlog']` R9 已落）。**⇒ 本轮我名下无红。**
6. ★ **`docs/03 §6.1` 新增一句交叉引用**：本表（文档侧"**每键有写者→读者**"）与 **`scripts/audit-projection-census.mjs`**（vmu-verify 的常驻门禁，读**真装配**、"每条声明真的生效或**具名**不生效"，我复跑 **10/0**）**互补**——只信一张就会漏掉另一半（文档可能滞后于装配；装配普查说不出"哪一批是语义稳定的公开面"）。
5. **已具名登记（不需本轮动作）**：`ballots`／`records` 两个**无写者**的耐久键（§6.1 族④）；`task/assign-objected` 的**受众由中间件决定**（面无人名册，不臆造收件人）；`vmu.prompt.compact*` **没有"关"档**（域 `(0,100]`，v5r 亦然）。

## D · 验证（原样命令 ＋ 退出码）

```
node tests/audit-vmu-docs.test.mjs        → 84 passed, 0 failed          exit=0
node scripts/check-docs.mjs               → DOC LINT: PASS               exit=0
node tests/vmu-settings.test.mjs          → 47 passed, 0 failed          exit=0
node tests/vmu-planned-settings.test.mjs  → ALL GREEN (planned=114)      exit=0
node tests/vmu-kernel.test.mjs            → 175 passed, 0 failed         exit=0
node tests/vmu-entry.test.mjs             → 150 passed, 0 failed         exit=0
node tests/vmu-recruit.test.mjs           → 44 passed, 0 failed          exit=0
node D:\_tmp\vmu-r10\b1b4.mjs             → TOTAL pass=44 fail=0          exit=0（R10 八键探针随 objectAssign 改 async 已同步）
node D:\_tmp\vmu-r11\public-keys.mjs      → 逐键写者/读者取证（只读）      exit=0
```

## E · 未做／边界

1. ~~`audit-enforced-consistency` 两行场景归 vmu-verify~~ → **已闭**（见 C4，我复跑 358/0）。
2. `docs/04` 的 **120 个 declared-but-not-wired** 键：本轮只逐键核了**我这几轮新增的**（全部 wired）；其余属各面 owner 的接线排期，未逐条点名（`docs/04` 已如实标 `⛔`／`declared`）。

## 7. 追加：F51 耐久会议域标记接线（Lead 当场派）＋ 并发红转出

### 7.1 接在**既有** `meetings` 投影键上（**未新增键**，按裁决）
- `kernel/index.js`（`:1072` 一带）：新增 `domainRowsOf(env)` ＋ `meetingsDomainSeam = store ? { read, write } : null`，交给 `createMeetings({ …, durable })`（面侧契约 `durable:{read(),write(rows)}`、`rows=[{id,state}]`、`state∈open|lapsed|closed`，见 `kernel/meetings.js:345-395`）。
- ★ **形状（实测定案，写进代码注释）**：耐久载体是 **`domainState`**——`markState()` 在**投影包裹快照之前**把它写在会议对象上 ⇒ 信封 `value.data.live` 自带标记；`write()` 额外盖的 `value.domainRows` **只是便利字段**，会被包裹层下一次 `patch` 覆盖（实测信封 `value` keys = `apiVersion/face/v/at/data/counters/session/skipped`）⇒ `read()` **回退**到从 `value.data.live` 派生（含 `ser()` 的 Map 字串 `{__map:[[k,obj]…]}`）。两条路径都精确，**所以不需要第二个键**。
- **无 store** ⇒ `durable:null` ⇒ 面自曝 `status().durableMarker.bound === false`，`openMeetings()` **不声称任何事**（具名）。
- **实测**：`node D:\_tmp\vmu-r11\f51-marker.mjs` ⇒ **TOTAL pass=13 fail=0，exit=0**：绑定自曝 → 开一个会 → **`await settle()` 后重启** ⇒ `openMeetings()` 报**恰好一个**、**同 id**、`state:'open'`、`failures=0`；信封内可**解析**出 `domainState:'open'`；无 store ⇒ 具名不声称。
- **Lead 的三条判据**（我跑到时）：`vmu-resume-e2e **99/0**`、`vmu-meetings **161/0**`、`vmu-kernel **175/0**`，均 `exit=0`。
- ★ **读取时机（重要）**：状态投影的写穿是**异步**的 ⇒ **重启前必须 `await recovery.settle()`**，否则下一位读者看到的是包裹层还没写的信封（探针第一版正是如此，补了 settle 后正断言通过）。

### 7.2 并发红（**不在我写范围**，已转出）
- **(a) 瞬时**：`kernel/meetings.js:694` 一度 `ReferenceError: Cannot access 'motionId' before initialization`（该文件 mtime 与我命令**同秒**，reader-c 正在改）⇒ 片刻后自查 **`vmu-meetings` 已回 161/0**。
- **(b) 仍红**：`vmu-resume-e2e` **exit=1**，断言属 reader-a 的 §13「the ballot mirror must be VISIBLE — a refusing seam is not swallowed」：`refusingVote.receipt.ballot.mirrored === false && reason === 'refused'` 不成立 ⇒ 落在 reader-c 的 `mirrorVote`（`meetings.js`）＋ reader-a 的钻取，**本轮 in-flight**，与我的域接缝**无关**（我的接线只给 `createMeetings` 多传了一个 `durable` 选项）。
- **(c) 已由我闭合**：`VMU_MEETINGS_MARKER_UNREADABLE`（`kernel/meetings.js:388`）此前未登记 ⇒ 我读了实现后**登记进 `docs/03 §8`**（语义明确：耐久域读不到 ⇒ **拒绝猜**哪个会还开着；回执 `{ok:false,durableMarker:true,source:'seam-error',code,message}`）＋ `generate-planned-codes --write` 重算 §8.1 ⇒ `audit-vmu-docs **84/0**`、`check-docs PASS`。
3. `planned=114`（较 R10 的 113 多一）**不是我的改动**（他人本轮新增了 planned 键），仅记录以免误记。

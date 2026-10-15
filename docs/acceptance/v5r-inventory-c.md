# v5r 深度盘点 · 分片 C —— 会议系统 · 群聊与状态面板 · 主代理 · 控制面

- 仓库：`Vibe-Mathematics`（git，`main`，HEAD `6d0164e`）；**本分片全程只读**（未改任何文件、未 git、未跑门禁）。
- 主文件：`vibe-math-v5r/vibe-math-v5r.js`。`read` 工具口径 **11597 行**（任务书写的 11166 是 `Get-Content | Measure-Object -Line` 口径的行数差；任务书段落标记与实际一致，测试 seam 在 11476）。
- 本分片实际通读：**7290–11597 全量逐段读**（覆盖任务书 7359–11166 的每一段，含 11166–11597 的注册面与 test seam）；另**按需回读**分片 A/B 范围内、但本分片专章必需的**定义点**，全部标注 `file:line`。
- 配套：`vibe-math-v5r/agent.cordis.yml`（**实际 460 行**，非 390）、`preset.yml`（762B）、全部 `MEETING-PLATFORM-*.md`（11 份）、`架构图.md`、`docs/02-rulings.md`、`docs/06-expansion-mechanisms.md`、`docs/08-landing-plan.md`（见 §⑦–§⑩）。
- 行号引用一律为 `vibe-math-v5r.js:<line>`，其它文件写文件名。

---

## §0 速览：本分片最关键的事实（供 lead 先看）

1. **会议要求"开会"这件事本身没有任何计时器**：收束判据只看「机会位」（`asked`/`silent`/`unreached`）＋「是否还在举手/在飞」；**沉默不触发任何截止**，唯一兜底是**参数化墙钟硬界** `meetingHardLimitMs`（默认 1800000ms，钳制 [300000, 7200000]，`:7441-7444`、`:7624-7635`）。
2. **"票"与"发言"在数据结构上完全分离**：`meeting.inputs/speeches` 只记发言；结题票只由 `recordSolveVote`→`putSolve` 写进**耐久** `inst().solve`（`:7878-7890`、`:9571-9649`）。**沉默绝不等于同意**，未表态者**阻止结题**（`:7853-7876`）。
3. **会议等级（formal/light）是 D7 的硬闸**：`light` 会期内**任何"实体定论"写入统一具名拒**（`truthWriteRefusal`，`:2233-2238`），牵涉 `vibe_v5_result_record`（`:2128`）、`minutes` 的 `entry_kind:'decision'`（`:2454`）、`motion kind:'resolution'`（`:2362`）。
4. **表决期禁言（S8/R3/K12/B9）由"是否存在 open 投票板"派生**（`speechFrozen()`，`:2878-2896`）：成员发言入口被拦（`vibe_v5_say` 与会议唤醒的发言交付），**举手保留**、票照记、院士/所办豁免、程序异议不受限；被拒的发言交付会记 `silent-after-refusal` 以免被推成 `unreached` 提前收束（`:9597-9609`）。
5. **群聊没有"管理员 / 发言次数上限 / 禁言（除表决期冻结外）"这类字段**：全代码 grep `禁言|发言次数|管理员|admin|mute` 只命中 `:9596` 一处注释。消息字段只有 `{id, from, to, kind, text, at, quote?, quotes?, supplementOf?}`（`:3557-3561`）；"谁算管理员"在 v5r 里不存在，只有**权限表**（office / academician / secretary 等，`:1621-1642`）。
6. **状态面板不是"板"，是"成员自述 JSON + 审计台账"**：`Members/<id>/SelfReport.json`（`overall/subgoal/plan/status` ＋ 各自 `…At` ＋ `history` ＋ `deviation`）与 `Shared/SelfReportViewAudit.json`（查看留痕，cap 200）（`:7069-7223`）。框架**不生成**"总目标/正在执行的子任务"面板，只有**院士可替他人设定 `overall`**（`:7204-7211`）。
7. **主代理（academician）不是"助手"而是"所内领头人"**：人设是**入职时冻结的 charter**（`charterFor`，`:3131-3361`）＋ `staffPersona` 前缀（`:3676-3679`）；提示词按轮装配（状态块＋在途邮件＋本轮 ask），**charter 不逐轮重注入**（`:3973-3977`）。**自动汇报**在人设层（【二·7】主动向院士汇报 / 无院士时主动群聊汇报，`:3219-3225`）＋ 各自的 `Progress/progress.md`；"自动汇报"没有独立的机器机制（无定时汇报任务）。
8. **office（所办）＝会话 root，是外部接口**：`agent.cordis.yml:74-86` 明确写「YOUR ROLE — HANDS-OFF … you do NOT research, do NOT vote」。**office 不能是任何成员**，`vibe_v5_message` 只能由**可证明的 root** 调用（`:11077-11088`）。

---

## ① 机制逐条清单（分片 C：chat / meeting / paper / hire-fire / sched / reply / toolFilter / control / register）

> 标签：`[MEETING]` `[VOTE]` `[CHAT]` `[STATUS-PANEL]` `[PAPER]` `[HIRE-FIRE]` `[SCHED]` `[CONTROL]` `[REPLY]` `[TOOLFILTER]` `[REGISTER]` `[OTHER]`

### A. 群聊 / 信箱 / 引用

**C-01 `[CHAT]` 群聊落盘镜像 `saveChatLine(text)`** `:7365-7376`
- 入口：内部函数；会议召开/收束、雇佣/解雇、决议、授撤、动议、自述、结题、论文、硬界放弃、静止提示等**所有事件**都写一行。
- 逻辑：日期取 `fmtTime().slice(0,10)`；路径 `Shared/Chat/<YYYY-MM-DD>.md`；追加 `- HH:MM:SS｜<text>\n`；**串行化**：`chatChain = chatChain.then(run, run)`（修复"同一 tick 两次读-改-写丢行"）。**权威记录是 `inst().messages`（事件 fold），此文件只是人读镜像**。
- 字段/路径：`Shared/Chat/<day>.md`；首行为 `# 研究所群聊记录｜<institute>｜<day>`。
- 参数：无。持久化：文件 + 事件流。宿主接触面：`readTextRel`/`writeTextRel`（injected `fs`）。

**C-02 `[CHAT]` 消息投递 `say(from, opts)`** `:3531-3574`
- 入口：`vibe_v5_say`（成员）/`vibe_v5_message`（仅 office）/`notice()`（框架）/reply 的 `say` 字段。
- 逻辑：`to` 解析四态 —— `all`→除自己外全部 active；`voters`→除自己外表决者；`OFFICE_INBOX`→仅 `[{id:OFFICE_INBOX}]`；其它→须存在且 active 且非自己（否则 `V5_MEMBER_NOT_FOUND`/`V5_SELF_MESSAGE`）。**id 在 fold 内一次 commit 分配**（`alloc.next('message')`→`msg-N`），多收件人一次提交（修复同 tick 撞 id 后被 dedupe 丢消息）。`from==='office'` ⇒ `notePaperConsult('message')`。发送后 `notifyActivity()` + `scheduleNext()`。
- 字段：`{id:'msg-N', from, to, kind, text, at, quote?, quotes?, supplementOf?}`；`kind ∈ {chat,dm,voters,office,meeting,verify,assign,nudge,notice}`（`:3599-3613` 的 frameLine 逐 kind 前缀）。
- 参数：无。持久化：`EV.message` fold（`inst().messages`）+ 封顶账本 `delivered`（`DELIVERED_CAP=500`，`:484`）。

**C-03 `[CHAT]` 框架通知 `notice(memberId, text)`** `:3580-3585`
- `say('framework', {to:memberId, kind:'notice'})`；目标必须 active。用于"票未被记录""claim 失败""formal 条目缺 target"等**具名回执**（不再用自聊，`say` 会拒 `V5_SELF_MESSAGE`）。

**C-04 `[CHAT]` 待投递队列 `pendingFor` / 帧 `frameLine`** `:3588-3613`
- pending = `inst().messages` 中 `to===memberId` 且**未被 ack** 的；按 `at` 升序；每项 `{id,kind,from,at,line}`。
- 帧前缀逐 kind 固定：群聊/私信/致表决者/所办通知/会议/表决/分派（**office 分派必须显示「所办分派」而非「院士分派」**）/督办/提示。

**C-05 `[CHAT][SCHED]` 摘要节流 `deliveryDecision`＋`armDigest`** `:3617-3627`、`:4270-4276`
- 逻辑：有非 `chat` 类 pending ⇒ `{deliver:true,urgent:true}` 立即投；纯 chat ⇒ 仅当 `pending.length >= chatDigestMax` 或 `now-oldest >= chatDigestMs` 才投（`urgent:false`）。
- 参数：`chatDigestMax` 默认 **12**（下限 1，`:9870`）；`chatDigestMs` 默认 **45000**（必须 >0 否则被丢弃，`:9846-9848`）。
- 调度：`armDigest()` 用 `ctx.timeout` 在 digest 窗口后再开一轮 `scheduleNext()`。

**C-06 `[CHAT][REPLY]` 收件箱感知唤醒 `promptFor` / `wakeWithInbox`** `:9078-9110`
- 逻辑：**先取 pending（baseFn 作为 thunk 延迟构建）**→ 只把**新** pending（`inboxInjected` 已注入集合之外的）前置成 `[新到的消息…]` 块 → 期间 `inboxSuppressed` 让 `briefBlock` **不再嵌同一批邮件**（修复"一条消息读两遍"）→ `wakeMember` → **发送成功后**才 `ackPending` → 无论成败清 `inboxInjected`（失败的下次重投）。不变量："未 ack ⇒ 仍可重投"。
- 参数：无（受 `chatDigestMs/Max` 间接控制）。持久化：ack 写 `EV.delivered`。

**C-07 `[CHAT]` 私聊补记（G5/D6）`supplement_of`** `:2629-2638`、`:2683-2691`
- 入口：`vibe_v5_say {supplement_of, why}`。逻辑：仅**该私聊的发送者本人**可补记（否则拒），`why` 必填；写入 `inst().chatSupplements[] = {of, by, at, publicRef, why}`；公开面出现的是**补记本**，**原私聊正文永不进公开面**。被引时 `viaSupplement` 指回补记本。

**C-08 `[CHAT]` 引用边界与锚解析 `resolveQuoteAnchor` / `sayQuote`（S10/D6）** `:2476-2693`
- 入口：`vibe_v5_say {quote_ref|quote_refs, quote_excerpt}`。
- 锚三类：① 会议内发言 `mt-<id>#speech-<who>-<n>`（**读 `Shared/Meetings/<id>.md` 的 `### <who>` 小节，耐久 ⇒ 悬空可判**）；② 会议外群聊 `msg-<N>`（**写入时快照**；已投递 ⇒ 正文不再保留 ⇒ 悬空具名拒；`dm` 必须先补记）；③ 聚合 `ballot:<id>`（逐人锚 `ballot:<id>#vote-<who>` 在 `secret` 板**具名拒**）；④ 决议锚 `res:<n>`/`res:latest`（跨会议唯一放行；`res:latest` 全部被取代 ⇒ 悬空拒，**绝不回落**；带 `supersededBy` 仍可引但须标"已被复议"）。
- 参数：`quotesPerMessageMax` 默认 **2**（下限 1，`:9862`）；`quoteDepthMax` 默认 **3**（下限 1，`:9863`）；摘句 `QUOTE_EXCERPT_MAX=200`（确定性截断 + `truncated`）；条数超限 ⇒ **具名拒**；深度超限 ⇒ **折叠为锚**（`collapsed:true`，不拒）；成环 ⇒ **只标注**（`cycle:true`）；引用域必须与当前会议一致（跨会议/跨域拒）。
- 持久化：`quote/quotes` 随消息进 fold；折叠/成环写群聊行。

**C-09 `[CHAT][CONTROL]` 所办信箱 `OFFICE_INBOX`** `:3539-3542`、`:10422-10428`、`:570`
- 逻辑：`to:OFFICE_INBOX` 的消息**不唤醒任何人**（office 无 member id），作为耐久待办由 `status().officeRequests`/`report()` 呈现；`OFFICE_REQUEST_CAP=10`，超出丢最旧并累计 `officeRequestsDropped`，`officeRequestsTruncated` 明示截断。
- 消费点：不能直接开会/增聘的成员发起"提议"时同时投 voters 与 OFFICE_INBOX（`:7410-7416`、`:10845-10850`）。

### B. 会议系统（核心，全部见 §③）

**C-10 `[MEETING]` 召开入口 `vibe_v5_meeting` → `startMeeting(callerId, opts)`** `:7396-7429`、`:11089-11095`
- 参数（工具面）：`agenda`（**必填**，空 ⇒ `V5_INVALID_ARGUMENT`）、`kind ∈ {sync(默认), division, verify-request, solve-vote}`、`target`、`formal_agenda:boolean`。**不给任何 `…At/…Ms`**（时间由框架写）。
- 权限：`canDo(callerId,'convene')` = office 全权；academician 且 `academicianLeads=true`；或持 `convene` 授权（`:1640`）。**非召集人 ⇒ 只提议**：`say(callerId,{to:'voters',kind:'voters'})` + `say(callerId,{to:OFFICE_INBOX,kind:'office-request'})`，返回 `{ok:true,proposed:true}`（`:7404-7416`）。
- 通过后：`consumeGrant`（一次性授权**此刻**消费）→ 拒 autoDone(`V5_INSTITUTE_STATE`)/`!running`(`V5_INSTITUTE_STATE`) → **创始期守卫**（有 `!direction` 的非临时成员 `rounds===0`）→ 若 `meeting || hasVerifyInFlight() || inFounding` 则 **parked**（首胜，后者不覆盖，`:7422-7427`）。
- 会议**已开**且只给 `formal_agenda` ⇒ 走 `setMeetingLevel`（改等级，`:11093`）。

**C-11 `[MEETING]` 会议实体与开场 `beginMeeting(opts)`** `:7453-7535`
- 名单：`order=voters()`（只征询**常驻表决者**；临时工须 `meeting_invite`），**Fisher-Yates 洗牌**决定首位发言者（`:7458`）。
- id：`commit(EV.meeting,{make:alloc=>alloc.next('meeting')})` → `mt-N`；文件 `Shared/Meetings/mt-N.md`；`lastMeetingId=id`（会后迟到发言据此补记）。
- `meeting` 字段全表：`id, agenda, kind, target, formalAgenda, by, order[], roster[], phase('round-robin'|'open-floor'), inputs{}, speeches{}, extras{}, asked{}, silent{}, unreached{}, hands{}, spokeCount{}, invited{}, retries{}, history[], hardLimitMs, lastInputAt, startedAt, secretary, secretaryAt, secretaryBy, recordEntries[]`（`:7472-7481`）。
- 耐久 OPEN 标记 `patchInstitute({meetingOpen:{id,at,agenda}})`；`putSolve({clear:true})`（**新问题清空耐久结题票**）；群聊行 `【会议 mt-N】召开…`。
- **开场提示**（S15-K4/S16-G3，**只可见不驱动**）：① 程序性点名（未完成行动项 `origin:'meeting:*'`，含 owner/「待接手」/逾期 `due_in==='next-meeting' && createdAt<startedAt`）② 上次纪要确认（未确认则提示 `vibe_v5_minutes{op:'confirm'}`）（`:7493-7513`）。
- office 亲自召开且 `auto!==true` ⇒ `notePaperConsult('meeting')`（论文 office 定稿的两条件之一）。
- 纪要文件头写入：议程/类型/目标/召集人/开始时间/发言顺序/硬界分钟数。
- 最后 `askMeetingRound()`；返回 `{ok:true, meeting, agenda, order}`。

**C-12 `[MEETING]` 轮次征询 `askMeetingRound()`** `:7536-7615`
- **活名册对账**：以 `voters()` 覆盖 `roster`；`order` 过滤已离场者并补齐新入场者；被删者清全部位（asked/silent/unreached/hands/inputs/extras/spokeCount/retries）。
- 并发预算 `budget = max(1, floor(params.maxParallel||3))`；`maxTries = meetingWakeRetries()`。
- **N+1 语义**：`meetingWakeRetries=N` ⇒ 先试 1 次、失败再重试 N 次 = 共 N+1 次；N=0 ⇒ 恰好 1 次。`tries > maxTries && !hands[id]` ⇒ 记 `unreached` 并 `history.push({what:'unreached'})`。
- 阶段一（`round-robin`）逐 `order`：跳 `silent`/`unreached`；已 asked 且已交付 ⇒ 跳；busy ⇒ 等；未 asked 且已非阶段一 ⇒ 不再补发；`attemptOne` 成功才写 `asked[id]=now()`（**受邀临时工永不进机会位**）。
- 阶段二（`open-floor`）：① 举手者（含已发言者，可多轮）→ `history what:'hand-asked'`；② `meeting.invited` 中 `askedOnce=false` 者各问一次 → `what:'invited-asked'`。
- **阶段切换**：`roster.every(id => asked|silent|unreached 有值)` ⇒ `phase='open-floor'` + 群聊广播（**无计时器**）。
- `asked===0` ⇒ `armHeartbeat()`。

**C-13 `[MEETING]` 收束推进 `continueMeetingRound()`** `:7616-7667`
- 重入锁 `finalizeLock`（防两个 end 事件双收束；bail 时**重新 arm**）。
- **唯一兜底**：`elapsed >= meeting.hardLimitMs` ⇒ 放弃：`appendMeetingTail(...,{abandoned:true})`（写全明细）＋群聊「超过硬界被放弃」＋`scheduleNext()`，**不判定**任何结论。
- 表决冻结期（`speechFrozen().frozen`）⇒ 只 arm，不推进轮次（否则被拒成员会被重试到 `unreached` 提前收束）。
- 收束判据（四类全空才算）：(a) `notYetAsked`（还没轮到）(b) `inFlight`（已 asked、未落定、busy）(c) `unanswered`（已 asked、未落定、空闲、重试未耗尽）(d) `handsUp`。任一非空 ⇒ 再 `askMeetingRound()`。
- 收束前**诚实化**：已 asked、未交付、非 silent/unreached ⇒ 记 `unreached`（reason `no answer after retries`）。然后 `finalizeLock='meeting'` → `finalizeMeeting`。

**C-14 `[MEETING]` 举手 / 发言 / 沉默 / 邀请（reply 侧）** `:9575-9634`
- 三个位置互不继承：**发言位** `inputs`/`speeches`/`spokeCount`；**机会位** `asked`/`silent`/`unreached`；**票位** `solve`。
- 举手：`meeting_hand:true` ⇒ `hands[id]=now()` + `history what:'hand'`；`false` 且在手 ⇒ 删除 + `what:'hand-withdrawn'`。`pendingHand`＝本轮之前就举着手；"交付发言"只在**在还上一次举手**时清手（否则"发言后再举手"被自己清掉）。
- 发言正文优先级：`input` > `say`(字符串) > `summary`。
- 冻结期：非院士/非所办且 `text` 非空 ⇒ **拒**：`history what:'speech-refused-frozen'` + 幂等记 `silent[id]` + `what:'silent-after-refusal'` + 群聊行；**举手保留**；票照记。
- 交付：`speeches[id].push(text)`；`spokeCount+1`；`inputs[id]=text`；`extras[id]=回复对象`；`lastInputAt=now()`；**追加**写 `### <id>（第 n 次发言）`（绝不覆盖）。
- 未发言但已获机会、未 silent/unreached、未举手 ⇒ 记 `silent[id]`（**与阶段无关**）。
- 邀请：`meeting_invite:{member,why}`（见 C-15）。
- 会后迟到发言：无 live meeting 但有 `lastMeetingId` 且 reply 带 `input` ⇒ 作为 `### <id>（会后补记…）` 追加，**按文本去重**，不再静默丢弃（`:9635-9649`）。

**C-15 `[MEETING]` 邀请临时工 `meetingInvite(callerId, inv)`** `:7676-7696`
- 权限：表决者（院士/常驻研究员）或所办。拒绝码：`V5_NO_OPEN_MEETING`、`V5_NOT_VOTER`、`V5_INVITE_NOT_TEMP`（未在册 / 非临时工两种文案）、`V5_INVALID_ARGUMENT`（无 why）、`V5_ALREADY_INVITED`。
- `invited[id]={by,why,at,askedOnce:false}`；`history what:'invited'`；难度：受邀发言**只进纪要＋广播**，不计票、不进机会位、**永不延后收束**。

**C-16 `[MEETING]` 纪要收束 `finalizeMeeting(mn)`** `:7747-7852`
- 先 `meeting=null`；把该会议 `grantScope='meeting'` 的授权在台账标 `expiredAt`（失败不影响收束）；`patchInstitute({meetingOpen:null})`。
- 结构：`## 发言区`（逐人 `### <id>`，受邀者标注；多次发言按「第 n 次发言」）＋ 结构化 `speechZone[{by,speeches[],count,invited}]`；`## 投票区`（本场每张板：问题/选项/规则/`minVotes`/`m`/已投/有效/弃权/计票/**未投票名单**/是否不记名）＋ `voteZone[]`；`## 记录人补充`（**本场等级**、纪要责任人（未指定 ⇒ `NO_SECRETARY_NOTE`）、逐条 `decision/note`）+ `meetingMinutesTail`（发言机会/举手记录/受邀/表决块）。
- 结构化写回 `commit(EV.meeting,{index:{id}, minutes:{at,speechZone,voteZone,secretary,entries,level}})`（失败不影响纪要）。
- 收尾：群聊「结束。已解决票 x/y」→ `markProgress()` → `checkSolved()` → 若有 parked 会议且无验证在飞则立即 `beginMeeting`（**parked 首胜**）→ 否则 `scheduleNext()`。

**C-17 `[MEETING][VOTE]` 纪要尾三块 `meetingMinutesTail` / 表决块 `meetingVoteBlock`** `:7700-7746`
- 发言机会块：常驻名单、已获机会 x/y 具名、**选择不发言**具名、**未能送达/未落定**具名（**与"选择不发言"严格区分**）、"沉默不等于投票"声明。
- 举手记录：`history` 中 `what` 以 `hand` 开头者。
- 受邀临时工块：邀请人/理由/是否已发言/「未发言（不阻塞收束）」。
- 表决块：逐人三态（投 true / 投 false / **未表态**）＋ 临时工无表决权（值仅显示 true/false）＋ 结论（全体一致才写「全体有表决权者一致认为原问题已解决」）。票只来自 `extras[*].voteSolved`。
- 硬界放弃路径共用同一函数（`opts.abandoned` 加警示行）。

**C-18 `[MEETING]` 会议等级（S12/D7）`meetingLevelOf` / `setMeetingLevel` / `truthWriteRefusal`** `:2217-2265`
- 派生：`formalAgenda===true` ⇒ `formal`；否则 `kind ∈ {verify-request(→formal), solve-vote(→formal), sync(→light), division(→light)}`。
- 改等级：仅院士（`canDo(...,'meeting_level')`，**不可授**）；必须已有 open meeting（`V5_NO_OPEN_MEETING`）；同值 ⇒ `deduped:true` **不写事件**；真改 ⇒ 写 `formalAgenda/levelAt/levelBy` + 群聊广播；**设置等级本身不驱动会议**（不自动升降级、不自动拒开会、无定时器）。
- 硬闸：`truthWriteRefusal(what)` 返回 `V5_INVALID_ARGUMENT` + 引导语（"请设为正式或另开决议类会议"）。
- 参数：无独立参数（由 `kind`/`formal_agenda` 决定）。

**C-19 `[MEETING]` 记录人/秘书（S11/GAPS 29）`secretaryTool`** `:2267-2327`
- 入口：`vibe_v5_meeting{formal_agenda:true}` 之外独立工具 `vibe_v5_secretary{who|member,why?,revoke?,op:'revoke'}`。
- 规则：仅院士；**院士/所办不得自任**（"主持人不得兼任唯一记录者"）；必须 active 且在册（**临时工 `V5_NOT_VOTER`**）；必须已有 open meeting；`role` **当次会议绑定**，收束即失效；台账 `inst().secretaries[]` append-only（同值 `deduped`，换人记 `revokedAt`）；**只拿记录权**（不获票权、不改阶段/分母）。
- 字段：`meeting.secretary/secretaryAt/secretaryBy`；台账 `{who,by,at,meetingId,revokedAt}`。
- 参数：`SECRETARY_ENTRY_MAX=1000`（条目长度上限，`:2274`）。

**C-20 `[MEETING]` 纪要条目 / 确认上次纪要 `minutesTool`** `:2404-2467`
- 权限：`canDo(...,'minutes')` = 院士 ∪ **当次会议记录人**（`:1639`）。
- `op:'confirm'`：`of` 缺省=时间上最近一场**已收束**会议（无历史 ⇒ `V5_INVALID_ARGUMENT`；非已收束 ⇒ 拒）；`fact_fix` ≤1000；台账 `inst().minutesConfirmations[]={of,by,at,factFix}`；**事实更正只追加到当次会议纪要的 `## 上次纪要确认` 小节，旧纪要一字不改**；同值 `deduped`。
- 无 `entry` ⇒ **只报缺口**：记录人补充/议程/发言区/投票区四类，`note:'只报缺口，不自动补全（R7）'`。
- 有 `entry` ⇒ 追加 `{by,at,text,agenda_item,entry_kind}`；`entry_kind==='decision'` 在 light 会期 ⇒ `truthWriteRefusal`；同文本 `deduped`；**只经 `appendMeetingTail`**（绝不重写 `### <who>` 与两区、不删异议）。

**C-21 `[MEETING]` 程序异议（#46/D2）`proceduralObjectionTool`** `:7290-7305`
- 入档 `meeting.objections[] = {by,at,why,chairReply:null,chairReplyPending:true}` + 纪要尾 + 群聊行；**同 (by,why) 幂等**（`deduped:true`，不追加历史、`chairReply` 仍 null）；**只记录不驱动**（不改票面/阶段、不延后收束）；`chairReplyPending` **必须可见**（不得假装已回填）。

**C-22 `[VOTE]` 投票板六项（S7/D3/D4/R9/K13）`pollOpenTool` / `pollVoteTool` / `pollCloseTool`** `:1755-1997`
- `vibe_v5_poll_open`（**仅院士/所办**，`canDo('poll_open')`，**不可授**）：必须挂在 open meeting（`V5_NO_OPEN_MEETING`）；`question` 必填；`options` ≥2 且非空不重复；`mode ∈ {single(默认),multi}`；`min_votes` **必填正整数、无默认值**、`>voterCount()` ⇒ 拒（"该板永远无法成立"）；single 不接受 `max/min`；multi 需 `1 ≤ min ≤ max ≤ 选项数`；`secret` 默认 false；`allow_abstain/allow_revote` 默认 true；**同时只允许一张 open 板**（同值 ⇒ `deduped`，不同值 ⇒ 拒）；任何 `…At/…Ms`（含小写 `expires_at`）**拒**（`rejectStampKeys`，`:1818-1822`）。
- 板字段：`{id:'b-N', by, question, options:[{id:'o-i',text}], rules:{mode,max,min,minVotes,secret,allowAbstain,allowRevote}, at, meetingId, phase:'open'|'closed', votes:[{by,choices[],abstain,note,at,revotedAt}], closedAt, closedBy, result}`（`:1881-1886`）。
- `vibe_v5_poll_vote`（有票者）：非表决者 ⇒ `V5_NOT_VOTER`（临时工会把 `note/reason` 作为**参考意见**转达 voters）；板已截止 ⇒ 拒（"只能走复议"）；`allowRevote=false` 且已投 ⇒ 拒；`abstain:true` 需 `allowAbstain`；选项须命中 id 或原文、不得重复、数量须在 `[min,max]`；同值 ⇒ `deduped`；改票写 `revotedAt`。
- `vibe_v5_poll_close`（仅院士/所办，不可授）：`settled = cast >= minVotes`（**只读两者**）；`result={cast,valid,abstained,invalid:0,minVotes,satisfied,settled,outcome:'recorded'|'unsettled',m,quorum_reached,pending,secret,tally}`；**两个门槛并列**（min_votes vs 法定人数 m）；重复关闭 ⇒ `deduped`；**不存在"到点自动结算"**。
- 冻结派生：`openBallot()` 有值 ⇒ `speechFrozen()`（见 C-23）。`speechFrozenView()` 供 status。

**C-23 `[MEETING][VOTE]` 表态期禁言 `speechFrozen` / `speechGate`** `:2870-2896`
- 判据：存在一张 `phase==='open'` 的板即冻结；返回 `{frozen,ballotId,since,question}`。
- 门：仅**成员发言入口**（`vibe_v5_say` + 会议唤醒的发言交付）；院士/所办豁免；程序异议走另一入口不受限；系统消息不过此门。拒码 `V5_INVALID_ARGUMENT` + 引导（先 `poll_close` 或结束会议；举手保留）。
- **不改阶段、不自动解除、无定时器、不折算**（发言不产票、票不产发言）。

**C-24 `[MEETING]` 会议分级与"实体定论"写入闸** 见 C-18；相关写入点：`:2128`（决议）、`:2454`（纪要 decision）、`:2362`（resolution 动议）。**唯一判定点** = `truthWriteRefusal`。

**C-25 `[MEETING][OTHER]` 会后/放弃纪要尾巴 `appendMeetingTail`** `:7668-7672`
- `readTextRel('Shared/Meetings/<id>.md')` 不存在则用 `# 会议纪要｜<id>` 兜底，追加 `\n<text>\n`。被硬界放弃、记录人条目、fact_fix、程序异议共用。

### C. 结题判定 / 论文阶段（与本分片交接面）

**C-26 `[CONTROL]` 结题唯一判据 `checkSolved()`** `:7855-7877`
- 条件：`voters()` 非空 **且** `inst().solve` 对**每个**表决者都是 `true` ⇒ 才结题（**没有强制/平票/近似一致收束**）。
- **先跑论文阶段**：`params.finalPaper !== false` 时，无 paper ⇒ `startPaper('run-complete',{})` 并 return true；paper 未 finalized ⇒ 标 `completesRun=true` 并 return true；finalized 才 `finishRun(...)`。⇒ **论文阶段在结题标志之前**，因为 `phase='solved'` 后 `wakeIfIdle`/`startMeeting`/调度全部拒绝。

**C-27 `[VOTE]` 结题票写入 `recordSolveVote(memberId,val)`** `:7878-7890`
- 临时工 ⇒ 直接 return（无票）。**耐久** `putSolve({member,value:val===true})`；**每一票都重新判结题**（迟到票/普通轮带 `vote_solved` 也读）。

**C-28 `[CONTROL]` 结题落盘 `finishRun(reason)`** `:7891-7912`
- `clearHeartbeat()`、`autoDone=true`、`running=false`、`phase='solved'`、`patchInstitute({phase:'solved',lastProgressAt})`；写 `Problems/conclusion.md`（时间/依据/表决者/已确立 Verified/未定论留库附概率）；群聊 `【结题】`；`notifyActivity()`。

**C-29 `[PAPER]` 论文状态机（常量与字段）** `:222-248`、`:7914-8888`、`:11056`、`:11121-11130`
- 常量：`PAPER_MAX_ROUNDS=3`（`:229`）；`PAPER_ENGINE_ORDER.zh=[xelatex,latexmk,pdflatex,lualatex,tectonic]`、`.en=[pdflatex,latexmk,lualatex,tectonic,xelatex]`（`:231-234`）；`PAPER_REPAIR_CORE=[amsmath,amssymb,amsthm,geometry,ctex]`（`:237`）；`PAPER_SECTIONS`＝9 节标题（`:238-248`）。
- `paper` 字段：`id,status('writing'|'reviewing'|'awaiting-editor'|'finalized'),stage,round,trigger,createdAt,updatedAt,participants[],parts{},reviews{},reviewOf{},final,editor,editorNote,completesRun,lang,format,pdf,consult{messages,meetings},lastAskAt{},warnings[],disagreement[],skipped[],artifacts[],forced,forceReason,compile,engine,finalizedAt,forcedAfterCap`（`:8253-8262`、`:8734-8762`）。
- 阶段推进 `paperStep/paperAdvance/paperAwaitEditor/paperPass`（`:8093-8227`）：写作（按 `maxParallel` 预算唤醒、`lastAskAt` 限速 `paperAskEvery()=posMs(activityTimeoutMs,120000)`）→ 互审（环形 `reviewOf[active[i]]=active[(i+1)%n]`，全 `deliverable===true` 才进定稿）→ 未达成：`round<PAPER_MAX_ROUNDS` 则 `round+1` 并记 `disagreement`；到顶 ⇒ `forcedAfterCap` + `warnings` + 转交定稿代表 → `awaiting-editor`（academician 由 `paperAwaitEditor` 唤醒；不在册 ⇒ `editor='office'` + `editorFallback` + warning）→ 定稿代表 `deliverable` ⇒ `finalizePaper`；`revise` ⇒ 若轮次未到顶回到 writing，否则记警告后仍 `finalizePaper('academician-revise-at-cap')`。
- 看门狗：`now - (updatedAt||createdAt) >= recoverStallMs()`（=2×activityTimeoutMs）⇒ 把未交稿者写 `skipped` + `warnings` + `paperLog('看门狗',…)`（按"未参与"处理）。
- 工具：`vibe_v5_paper`（**仅 office**；`lang/format/editor` 仅本次论文一次性覆盖，**不写回参数**；`force` 重写已定稿；自动（run-complete）触发**强制 academician**，因为所办是根会话、无唤醒路径 —— `:8246-8250`、`:11122-11129`）；`vibe_v5_finalize_paper`（仅 office；见 C-30）。
- 免疫/幂等：`refillPaperArtifacts`（只补缺失产物，`:8764-8795`）；`finalizePaper` 可重入、要求产物失败**具名进 warnings**（F6，`:8807-8881`）；编译失败/无引擎时在交付 md/tex 里**幂等**插入说明句（`:8830-8850`）。

**C-30 `[PAPER][CONTROL]` office 定稿咨询门 `finalizePaperByOffice` / `notePaperConsult`** `:8349-8429`
- 前置：paper 存在、`status==='awaiting-editor'`、`editor==='office'`、`decision ∈ {deliverable,revise}`；`deliverable` 时 **`note` 必填**。
- **双计数门**：`consult.messages>0 && consult.meetings>0` 否则 `V5_PAPER_CONSULT_REQUIRED`（消息由 `say` 中 `from==='office'` 计；会议由 `beginMeeting` 中 `by==='office' && auto!==true` 计；**意图不算**）；`force` 重启会把 consult 重置为 `{0,0}`，拒答文案必须点明重置（`:8373-8388`）。
- `revise`：`round<PAPER_MAX_ROUNDS` ⇒ 回 writing 并记 `disagreement`；到顶 ⇒ 记警告后仍定稿（`office-revise-at-cap`）。

**C-31 `[PAPER]` 交付物与编译 `latexEngines/runLatexAttempt/compilePaperTex/finalizePaper`** `:8637-8895`
- 引擎探测：`paperLatexCommand` 显式值**单独使用**（不回落、不拼接 known root，`:8637-8643`、`:8657-8661`）；无 subprocess 服务 ⇒ `not-detected` + 明确 reason；known-root 探测有界（`TEX_CANDIDATE_CAP=40`、`TEX_YEAR_LOOKBACK=4`，`:65-69`）。
- 编译计划 4 步：`full` → `nonstopmode-rerun` → `engine-swap+stripped` → `minimal-template`；每步**两次** subprocess 调用（第二遍解引用/TOC）；`graceMs/超时 = 120000`，超时真 `terminate()`；**已存在 paper.pdf 则不覆盖**（`kept-existing`）。
- 产物：`paper.md` / `paper.tex` / `paper.pdf` / `paper.meta.json`（含 `params` 快照、`consultation`、`parts/reviews/disagreement/warnings/skipped`）/ `paper.log.md`；**交付的 tex 永远是最终生成版**（修复尝试不回写交付）。
- 论文证据源 `paperEvidence/paperSources`：只有**已存在的证据**（verdicts/tasks/formal/members 库/进度）；摘要/引言/结局节由成员原文与耐久状态派生，未决/被否证必显式标注。

### D. 雇佣 / 解雇 / 编制

**C-32 `[HIRE-FIRE]` 雇佣 `hire(callerId,o)`** `:8907-8943`
- 权限：office 全权；在册 active 成员（院士/常驻研究员）；**临时工不能雇人**（`V5_NOT_VOTER`）。`!running||autoDone` ⇒ `V5_INSTITUTE_STATE`。
- 必填 `purpose`（或 `direction`）与 `initial_task`（各缺 ⇒ `V5_INVALID_ARGUMENT`）。
- 上限：`maxTempPerMember` 默认 **3**（下限 1）按 `hiredBy` 计；`maxTempTotal` 默认 **12**（下限 1）按在册临时工计；超 ⇒ `V5_MEMBER_LIMIT`（`scope:'per-member'|'institute'`）。
- 创建：`newMember('temp',{direction:purpose,hiredBy,term,provider:pickProvider()})` → `spawnMember`；失败记 `phase:'failed'` + `failReason:'activation-limit'|'other'`；容量类 ⇒ `ACTIVATION_LIMIT_REACHED` + "已登记为待补建"；其它 ⇒ `V5_PROVISIONING_CONFLICT`。

**C-33 `[HIRE-FIRE]` 解雇 `fire(callerId,o)`** `:8960-9048`
- 权限矩阵：`office || (academician && academicianLeads && target.kind==='temp') || (target.kind==='temp' && target.hiredBy===callerId)`；否则 `V5_MEMBER_NOT_FOUND`（文案给出真实矩阵）。**常驻研究员只能所办解聘**（成员只能提议，`:8985-8987`）。
- 已 dismissed ⇒ 幂等返回（office 会**补做级联**）。
- 真实动作：`releaseTasksOf(id,'dismissed: '+reason)` 收回任务 → **先级联**解雇其临时工（`dismissTempsOf`，一层深，因临时工不能雇人）→ `subagents.interrupt(childId)` + `drainContinuableChildren` → 清 childOwner/inflight/liveAgents/busy → **撤回耐久结题票** `putSolve({member:id,value:null})` → 清 rounds/contextPct/seeds → **从所有 OPEN verdict 的票面删票**（已关闭不动）→ 从 live meeting 全字段删该 id（含撤销 `invited`）→ **丢弃其排队邮件**（ackDelivered）→ `phase:'dismissed', dismissedAt, dismissReason, childId:''` → 写名册镜像 → 群聊 → `markProgress/notifyActivity/scheduleNext`。
- **id 永不复用**；`dismissTempsOf` 对历史状态幂等补做（`:8951-8959`）。

**C-34 `[HIRE-FIRE]` 编制变更 `addResearcher` / `removeResearcher`** `:10844-10872`、`:11107-11120`
- 非 office ⇒ 只提议（同时投 voters 与 OFFICE_INBOX）。office ⇒ `newMember('researcher')` + spawn；容量类/其它错误同 C-32。`vibe_v5_remove_researcher` 工具面**强制** office（此前只写在描述里，任何成员都能解聘常驻 ⇒ 已修，`:11112-11120`）。

**C-35 `[HIRE-FIRE]` 督办 `nudge(callerId,o)`** `:9049-9069`
- 权限：`gateDo(callerId,'nudge')`（office / `academicianLeads` 下的院士 / `nudge` 授权）。目标须 active。`why` 可空（文案 `(未说明)`），`next_step` 可选。
- **署名必须真实**：office ⇒ 「所办督办」，院士 ⇒ 「院士督办」（修复"所办督办被标成院士"）；随后 `wakeIfIdle(target)`。

### E. 调度 / 唤醒 / 延迟补建

**C-36 `[SCHED]` 调度 trampoline `scheduleNext` / `schedulePass`** `:9136-9158`、`:9221-9344`
- `scheduleNext`：`!running||autoDone` 直接返回；已在跑 ⇒ `reschedule=true`（最外层 while 排空，**保证单飞**，使 busy 预算有意义）。
- `schedulePass` 顺序（**注释即契约**，`:9113-9116`）：`loadSettled` 未定 ⇒ `ready()` → `retryPendingSpawns()`（**先花掉释放的容量**）→ `clearHeartbeat()` → `syncParamsFromState()` → ①进行中验证 `continueVerifyRound` ②进行中会议 `continueMeetingRound` ③`armNextVerify`（若在飞则返回）④`pendingMeeting` 立即开 ⑤`paperActive()` ⇒ `paperPass()`（除非在等 office 定稿）⑥(a) 有 in_progress 任务的 owner（**按 idleMs 限速**，`:9272-9281`）(b) 紧急邮件（非 chat）(c) 到期 chat digest（受 budget）(d) **静止提示**（每片段一次，**不 return**，`:9305-9319`）(e) heartbeat：最久空闲成员 —— 有在办任务 ⇒ normalPrompt，否则 checkpointPrompt；**总是 re-arm**。
- 参数：`maxParallel` 默认 **3**；`activityTimeoutMs` 默认 **120000**（>0 否则丢）；`stallAutoMeetingMs` 默认 **360000**（**负值＝关闭静止提示**；唯一允许负值的时长，`:9849-9852`）。
- 宿主接触面：`ctx.timeout`（timer 注入）、`subagents.sendMessage`。

**C-37 `[SCHED]` 心跳/摘要计时器 `armHeartbeat` / `armDigest` / `clearHeartbeat`** `:4250-4276`
- heartbeat 延迟 `posMs(ms, activityTimeoutMs)`；触发时**先 `runLeanQueue()`** 再 `scheduleNext()`；**每次唤醒后必 re-arm**（含失败），否则研究所永久冻结。
- digest 窗口 `posMs(chatDigestMs,45000)`。

**C-38 `[SCHED]` 静止提示（S5/R1/D10）`stallNoticeMs` / `stallWaitingList` / `emitStallNotice`** `:1538-1587`
- 阈值语义 = `stallAutoMeetingMs`（默认 360000，**负值关闭**）；**幂等键 = `sinceAt`(=lastProgressAt)** ⇒ 每片段最多一次且**耐久**（重启不重发）。
- 「谁在等谁」最多 3 条，三类可达：被挡任务、无人认领任务、最久无动作的在册非临时成员（含闲置秒数）。
- **只提示不驱动**：不召集会议、不散会/收束、不推进阶段、不代成员表态；且发送后**必须继续走到 tail**（否则无定时器 ⇒ 冻结，实测教训）。

**C-39 `[SCHED]` G-6 延迟补建 `pendingSpawnMembers` / `retryPendingSpawns` / `isCapRefusedMember`** `:9160-9220`
- 队列**由耐久状态派生**（`phase:'failed'` + `failReason:'activation-limit'`，或 text 兜底 `/active child limit|maxActiveSubagents/`），不是第二份真相；只有尝试计数是会话内存。
- **停止规则**：仅容量类失败自动重试（`spawnMember` 用已记录的 ceiling 直接回答 ⇒ 免费）；**非容量类失败立即停试**并 `notice('office', …)`。
- Test seam（非产品面）：`V5_SPAWN_RETRY=manual` 关闭自动重试；`V5_SPAWN_RETRY_STRICT=1` 只认耐久 `failReason`（`:9182-9187`、`:9193-9196`）。

**C-40 `[SCHED][CONTROL]` 参数同步 `syncParamsFromState`** `:9117-9135`
- 每次 sync 都用 `DEFAULT_PARAMS + normalizeParams(持久化值)` 重建（外来形状不得直通），丢弃键记 diagnostics；同步 `project/institute/phase`，并由持久化 `phase` 反推 `autoDone = (phase==='solved')`（S1：任何视图不得把已结题显示为进行中）。

### F. 回复解析与派发（全部控制通道的唯一入口）

**C-41 `[REPLY]` 回复解析 `parseReply(text)`** `:11556-11578`
- 三级兜底：所有 ```json 围栏（**取最后一个合法对象**）→ 整段 trim 后 JSON → 最外层 `{…}` 跨度。返回 `{}` 表示无。

**C-42 `[REPLY]` 概率归一 `normVerdictNumber`** `:9347-9359`
- 字符串 `'TRUE'/'FALSE'`（大小写无关）⇒ 1/0；否则 `Number` 并 clamp [0,1]；非有限 ⇒ `undefined`（由调用方置 `V5_INVALID_ARGUMENT` notice）。

**C-43 `[REPLY]` 一轮结束唯一驱动 `onMemberEnd(childId, info)`** `:9661-9706`
- 幂等：`inflight.get(childId)` 不存在 ⇒ 直接 return（重放/迟到 end 不重复副作用）；任务类型取**本轮开始时登记**的 `rec.kind`（`wakeKind` 会被后续唤醒覆盖，仅兜底）。
- 流程：`inflight.delete` → `ready()` → `byChild` → `busy.delete` → `blocksToText(lastAssistantMessage)` → `stopReason!=='completed'` ⇒ 群聊 `【异常】` → `parseReply` → `handleReply(member,parsed,turnKind)`（异常只记 console，不打断）→ 完成则清 `pendingWork`，异常则保留并标 `reason:'host-ended',interruptedAt`（S25-B）→ `maybeRealCompact`（尽力）→ 清 wakeKind / `activeMeetingId` → **`paperPass()`（先于调度，因为 paper 由成员回合驱动）**→ `scheduleNext()`。

**C-44 `[REPLY]` 派发 `handleReply(member, parsed, kind)`** `:9364-9660`（**全部通道**，顺序即执行顺序）
1. `say`：字符串 ⇒ 群聊；对象 ⇒ `{to,text}`（`to==='all'` ⇒ chat；`'voters'` ⇒ voters；其它 ⇒ dm）（`:9371-9380`）。
2. `progress` ⇒ `publishProgress`。
3. `record[]` ⇒ `recordCard`（只接受 `proposition|method|subproblem`）。
4. `task_create` / `task_claim`（失败**notice 回执**，任务不存在也 notice）/ `task_update`（失败 notice）/ `task_done`。
5. **Lean 形式化信号**（`formalOn() && p.formal`，支持**数组**逐条）：缺 target / 非对象 ⇒ notice 并跳过；`decision==='blocked'` 需 note（否则 notice）；`'defect'` ⇒ `recordFidelityDefect` + **本回复内该对象布尔票改记弃权**（见 C-45）；`'used'` ⇒ `putFormal(status 保留 passed/blocked 否则 attempted, file 默认 `Formal/<target>.lean`, decision/decisionSource:'member-reply')` + `writeFormalIndex`；其它 decision ⇒ notice 枚举（`:9435-9485`）。
6. `propose_verify` ⇒ `maybeQueueVerify`（失败 notice）。
7. `verdict`：支持 `abstain/弃权/unable/无法判断` 词；数值 clamp；非法 ⇒ notice「本轮的票未被记录」；**L2 option A**：同回复记了该对象 defect 且该成员是**实际表决者** ⇒ `n=0.5`，并写 `formal.fidelity.voteAbstainedByFramework[]`（数组，含 `abstainedCount`）＋ note（`:9493-9535`）。
8. `propose_meeting` ⇒ `startMeeting`（失败 notice）；`convene_meeting` ⇒ **仅院士且 academicianLeads** 时 `startMeeting`（`:9537-9546`）。
9. `assign` / `prioritize` / `nudge` ⇒ 组织工具。
10. `hire` / `fire`。
11. `reject_assign`（需 `memberMayRejectAssign`）⇒ **广播**给 voters（含"任务仍会执行"）（`:9554-9562`）。
12. `vote_solved` ⇒ `recordSolveVote`。
13. `paper_part` / `paper_review` / `paper_final` ⇒ 各自 record（只在对的阶段生效，别的阶段具名拒）。
14. **会议输入**（`kind==='meeting' && meeting`）：见 C-14；`meeting_invite` ⇒ C-15。
15. 会后迟到 `input` ⇒ 补记（C-14 末）。
16. `solved` ⇒ 写 `Shared/State-of-institute.md` 快照（时间/记录者/该成员判断/有表决权的解决票）（`:9650-9659`）。

**C-45 `[REPLY][VOTE]` 忠实性缺陷强制弃权（L2 option A / Adv-verify F1）** `:9456-9531`
- 一条回复内**记录 defect** ⇒ **同一回复内该对象布尔票按弃权(0.5)计**；只影响**声明者本人 + 本轮**（无跨轮状态、不动别的票、不改门）；耐久标记 `formal.<target>.fidelity.voteAbstainedByFramework[]` + `abstainedCount`（旧对象形状折叠兼容）；非表决者（临时工）**不加弃权标记**（其意见本就不计票）。

### G. 工具过滤 / 注册面 / 控制面

**C-46 `[TOOLFILTER]` 工具过滤降级 `startWithToolFilter` / `sanitizeToolFilter` / `registeredToolsFromError`** `:9707-9726`、`:11580-11597`
- `subagents.startContinuable` 抛"未注册工具名"（宿主 `tools.restrict` 会抛）⇒ 从宿主错误文本提取已注册集合（`/known global tools:\s*([^]*)$/`）∩ 原过滤 ⇒ **用全新 spec 重试一次**；若过滤被清空到 `undefined` ⇒ **拒绝在无过滤下启动**并抛原错。防"某成员因 stale 配置永久生不出来"。

**C-47 `[TOOLFILTER]` 成员工具过滤与 persona 冻结 `memberToolFilter` / `memberPersona` / `newMember` / `memberAgentOptions` / `pickProvider`** `:3680-3706`、`:3646-3679`
- 过滤源：临时工用 `tempToolAllow/tempToolDeny`，常驻/院士用 `toolAllow/toolDeny`；**空 allow 不发射**（防 deny-all 陷阱）；`allow`/`deny` 只有至少一侧非空才生成。
- `memberPersona = (staffPersona + '\n\n')? + charterFor(member)`；**charter 在 fold 内 id 分配后立刻冻结**（快照口径，`resume` 重建时不会漂移）。
- `memberAgentOptions`：`provider/model` 非空则透传（空 = 继承 office 路由）。`pickProvider()`：宿主 subagents.list 含 `spawn` → spawn，否则 `fork`，再否则 `spawn`。

**C-48 `[CONTROL]` 参数白名单与归一 `normalizeParams`** `:9762-9880`
- int 键（逐个 `Math.floor(Number)`，有限才收）：`leanJobsMaxParallel, mathTimeoutMs, researcherCount, quorumCap, reconsiderFloor, quotesPerMessageMax, quoteDepthMax, verdictMaxRounds, maxTempPerMember, maxTempTotal, compactThreshold, compactAfterRounds, maxParallel, activityTimeoutMs, stallAutoMeetingMs, meetingHardLimitMs, meetingWakeRetries, chatDigestMs, chatDigestMax, meetingKeepEvery, leanTimeoutMs, motionSecondsRequired, toolCallsPerTurnCap, memoryCeilingMb, maxLiveChildren`。
- bool 键（`coerceBool`，无法识别的拼写 ⇒ **拒绝并取默认**）：`academician, academicianLeads, memberMayRejectAssign, finalPaper, paperCompilePdf, leanAsync, resourceSelfCheck, pointerPropagation`。
- str 键：`feedback, quorumMode, provider, model, staffPersona, formalVerify, leanCommand, paperFormat, paperLanguage, paperEditor, paperLatexCommand, leanInitiative, mathComputation, mathMode, mathInstallScope`。
- arr 键（数组或逗号串）：`toolAllow, toolDeny, tempToolAllow, tempToolDeny, leanArgs, leanSearchPaths, mathEngines, mathPackages`。
- 钳制/降级（**逐条上界**）：`quorumMode` 非法 ⇒ `m-unanimous`；`formalVerify` 非法 ⇒ `off`；`leanCommand` 空 ⇒ `lean`；`leanInitiative` 非法 ⇒ `normal`；`feedback` 非法 ⇒ `on`；`leanJobsMaxParallel<1`⇒1；`activityTimeoutMs/chatDigestMs/leanTimeoutMs ≤0` ⇒ **丢弃**；`stallAutoMeetingMs` 非有限 ⇒ 丢弃（负值保留）；**`meetingHardLimitMs` clamp [300000, 7200000]**；**`meetingWakeRetries` clamp [0,10]**；`leanTimeoutMs ≥1000`；`researcherCount ≥0`；`quorumCap ≥1`；`reconsiderFloor ≥0`；`quotesPerMessageMax ≥1`；`quoteDepthMax ≥1`；`compactThreshold ≤0` ⇒ 丢弃；`chatDigestMax ≥1`；`verdictMaxRounds ≥1`；paper 三个 enum 用 `coercePaperEnum`（别名见 `:11542-11552`）；math 六键交给共享模块 `normalizeMathParams`（`:9826-9837`）。
- **未知键不静默丢失**：补集交 `dropped` 收集器 ⇒ `reportDroppedStateKeys` 写 `diagnostics`（`slice(-50)` 保留）＋ `console.warn`（`:9872-9907`）。
- 注意（注释契约）：新增 int 键必须插在 `leanTimeoutMs` **之前**（`:9764-9767`，prompt-invariants 自检会改动数组尾部）。

**C-49 `[CONTROL]` 参数写入 `setParams` / `visibleParams`** `:9908-10003`
- **域校验（越界具名拒，不靠夹取）**：`toolCallsPerTurnCap/memoryCeilingMb/maxLiveChildren` 必须 **≥0 整数**；`motionSecondsRequired` 必须 **≥1 整数**；否则 `V5_INVALID_ARGUMENT`。
- `adjusted`（逐键 `{from,to}` 报告真实生效变化）＋ `dropped`（未知键）**加性返回**（task-26：否则无法区分"改了"与"被忽略"）；`patchInstitute({params:merged})` 持久化；`params = DEFAULT_PARAMS + merged`。
- 立即生效：数学参数 ⇒ `refreshMathLine()`；运行中 ⇒ `scheduleNext()`（已 arm 的心跳不会自动采用新值）。
- `visibleParams()` 是**显式白名单**（新键不加进去，`/v5 status` 就看不到，`:9989-9991`），含 `m`/`voterCount`/`started` 派生位与 `meetingHardLimitMs/meetingWakeRetries`。

**C-50 `[CONTROL]` 配置 `configure` / `doStart` / `resume` / `setPause` / `initStop`** `:10004-10343`
- `configure`：先 `ready()`（**先读本会话已指向的状态文件**，防整快照 commit 摧毁既有研究所）；运行中拒（`V5_INSTITUTE_STATE`）；`project/institute/problem/params` 可增量；**无参 configure 是真 no-op**（不 commit、不改 phase）；切名到已有成员的另一个所 ⇒ 采纳该文件；已持有研究所且要换名 ⇒ 拒；`phase='idle'` **只在真正 (重)建所时**写（防把已结题写成 idle）；写 `Problems/<id>.md` 与 `State/README.md`。
- `doStart`：`!running&&!autoDone`；已结题（内存或**持久化** `phase==='solved'`）⇒ 具名拒并给两条出路；`phase='founding'`、`runId='run-'+shortId()`；院士**先建**（使其出现在后续每个成员的入职 brief 里）；研究员按 `seedDirections` 或 5 条 `DEFAULT_DIRS`（`:10152-10158`）循环；成员创建前先进 active 名册；**一个都没建成** ⇒ 回到 idle 并给 `ACTIVATION_LIMIT_REACHED`（容量）或 `V5_PROVISIONING_CONFLICT`；成功 ⇒ `running/phase='active'` + 群聊「建所」+ `scheduleNext()`。
- `resume`：`reconcileProvisioning()`（`provisioning` 无 live child ⇒ failed；active 但 child 不在 ⇒ 清 childId）→ 重建缺失成员（seed = `Members/<id>/Progress/progress.md` 末 4000 字符，**计截断**，`mode='resume'` 使其语义为"恢复说明"而非任务）→ 刷新会议/验证看门狗时钟 → `writeRosterMirror/writeTaskboardMirror` → `scheduleNext()` → `paperPass()`（中断的论文续跑）→ `recoverLeanJobs()`。
- `setPause`：清计时器、`running=false`；给每个在役成员写耐久 `pendingWork={childId,objective,interruptedAt,reason:'institute-paused'}`（S25-B 段二：重启后主代理知道"谁还有活没干完"，不退回单干）。
- `initStop`：中断所有成员、清 childId、`meeting=null`/`pendingMeeting=null`、`putSolve({clear:true})`、清 busy/wakeKind/finalizeLock、**所有未关闭 verdict 判 `undecided`（reason `stopped by the office`）**、`phase='idle'`。

**C-51 `[CONTROL]` 状态视图 `status()`** `:10344-10545`
- 返回：`institute/project/key/phase/running/autoDone/runId`、`leanNotices(+Scope 会话内存)`、**`fieldScopes{session[],durable[]}`**（把哪些字段是会话态、哪些耐久**明写**）、`backend`、`diagnostics`、`debug{scheduling,reschedule,rssMb,memoryCeilingMb,toolCallsPerTurnCap}+dbg`、`quorum`、`members[]`（含 `failReason`、`pendingWork`）、`tasks`、`failedMembers(+Note)`、`pendingSpawns(+Note,attempts)`、`chat{pending,delivered,quotes_per_message_max,quote_depth_max}(+chatScope)`、`resolutions{count,latest_id,latest_effective_at,kinds}`、`officeRequests(+Shown/Cap/Dropped/Truncated)`、`persistence{writeFailures,prematureReads,loadSettled,loadProblem,scope,sandboxPolicyMismatch}`、`meeting{…}`（**见 §④**）、`parkedMeeting`、`verify{…minority_count,reconsiderable,last_reconsideration_at,threshold_m}`、`poll{open,question,options,cast,quorum_reached,rules,min_votes_reached,settled,pending,ballot_id,secret}`、`verifyQueue`、`verified/verifiedTrue/concludedFalse/undecided(+Note)`、`solveVotes`、`formal{mode,objects[],passed,blocked,todo}`、`paper`、`lastProgressAt`、`params`。

**C-52 `[CONTROL]` 人类报告 `report()`** `:10546-10840`
- 节：研究所汇报头（项目/阶段/研究对象/求真门槛 m + `rosterVersion`）→ 编制 → 任务板 → 共识（含少数意见/复议记录/不记名只给聚合）→ 群聊/会议（待办所办裁定/进行中会议/暂存会议/决议/上次纪要/行动项/动议）→ 历史会议 + 未收束会议警示 + 待补建成员 → 解决票 → **静止提示节** → **临时授权台账**（可授四命令；不可授清单）→ **投票板节**（六项规则快照 + 两门槛并列 + 未投票者点名 + secret 只给聚合）→ 状态诊断（被跳过事件/状态文件问题/忽略的键）→ Lean → **最终论文** → 文件位置（含沙箱根不一致警示）→ **反馈库**（条目/未闭环/类别/路由；off 时明写）。

**C-53 `[CONTROL]` 工具注册面 `registerTool` / `withOffice` / `withCaller`** `:10928-10976`、`:11036-11046`
- 所有注册包在 `ctx.effect(() => tools.register(...))` 内（preset 卸载即释放；v4 曾漏 disposer ⇒ 二次挂载撞名）。
- 每次执行：`getSession(exec.agent)` → 无 ⇒ `{"ok":false,error:'no session'}` → `await s.ready()` → **S25-D 机器强制单回合工具预算**：`cap>0` 且调用者是成员 ⇒ 计数 `+1`，`used>cap` ⇒ 直接返回 `V5_RESOURCE_BUDGET` 拒绝（**不执行**）；office/root 不受限；异常 ⇒ `{"ok":false,error":…}`（不抛）。
- `withOffice`：只允许**可证明的 session root**（`officeCaller(x)==='office'`），否则 `V5_NOT_OFFICE`（防成员/僵尸子代理以 office 身份 stop/改参）。
- `withCaller`：解析不到调用者 ⇒ `V5_MEMBER_NOT_FOUND` + `next` 提示（不得默认当 office）。

**C-54 `[REGISTER]` 全部工具与命令名（本分片区间）** 见 §③-B 完整清单（含每个工具的参数与拒绝码）。

**C-55 `[OTHER]` 每轮状态块/提示词装配（本分片专章 §⑤ 详述）** `briefBlock` `:3376-3421`、`stateBlock` `:4051-4053`、`initialPrompt` `:4054-4083`、`normalPrompt` `:4084-4106`、`checkpointPrompt` `:4108-4126`、`meetingPrompt` `:4128-4176`、`replySpec` `:3978-4046`、`resourceBlock` `:2069-2085`、`proofStatusBlock` `:2087-2097`、`pointerContractBlock` `:2065-2068`、charter `:3131-3361`。

**C-56 `[OTHER]` 等待原语 `vibe_v5_wait` / `waitForActivity` / `notifyActivity`** `:3424-3466`、`:11142-11151`
- `timeout_ms` 必须整数 [10000, 3600000]（否则 `V5_INVALID_TIMEOUT`）；**一次性、只看未来**的 waiter，由**第一次 committed 状态变化**唤醒（`notifyActivity` 唤醒并清空全部 waiter）；无活跃同伴 ⇒ 立即 `noProgress:{reason:'no-active-peer'}`；abort signal ⇒ `V5_WAIT_ABORTED`。

**C-57 `[OTHER]` 测试 seam `__testHelpers` 与宿主事件接线** `:11443-11597`
- `ctx.on('subagent/start')` 捕获 live child Agent（`WeakRef` 存 `liveAgents`；因为 `subagent/end` 触发时 child 已从 registry 移除，end 时再 get 永远拿不到 ⇒ v4 的真实 compact 曾死代码）。
- `ctx.on('subagent/end')` → `s.onMemberEnd(...)`，catch 时 `s.kick()`（最后防线），finally `forgetAgent`。
- 导出 `__testHelpers = {clamp01, clPct, posMs, blocksToText, fmtTime, idSafe, slugify, tryJson, parseReply, sanitizeToolFilter, registeredToolsFromError, sha256Hex, leanHashText, leanHasSearchFlag, contentFingerprint, headerListContractBlock}`（`:11489-11506`），契约：纯/无状态、不得触 `ctx`/session 状态。
- 宿主注入声明：`export const inject = ['subagents','agents','fs','tools','commands','timer']`（`:181`）。
- 状态载体纪律（`:11437-11441` + `:448-459` 注释）：**权威状态只在 `State/<institute>.v5state.json`**；宿主会话日志**一字不写**（写了会让会话因未知事件类型无法 resume）。

---

## ③ 专章：会议系统全清单（目标 2 的直接判据）

### ③-A 生命周期与状态机（逐阶段）

| 阶段 | 触发/入口 | 具体逻辑 | file:line |
|---|---|---|---|
| 提议 | `vibe_v5_meeting`（非召集人） | `say(caller,{to:'voters',kind:'voters',text:'提议开会：「agenda」（kind）'})` + `say(caller,{to:OFFICE_INBOX,kind:'office-request',…})`；返回 `{ok:true,proposed:true}` | `:7402-7416` |
| 暂存（parked） | `startMeeting` | 条件 `meeting || hasVerifyInFlight() || inFounding`（创始期＝有非临时成员 `rounds===0` 且无 direction）；`pendingMeeting={agenda,kind,target,by,at}` **首胜不覆盖**；返回 `{ok:true,parked:true}`；消费点：`schedulePass` ④ 与 `finalizeMeeting` 尾（`!autoDone && pendingMeeting && !hasVerifyInFlight()`） | `:7421-7427`、`:9245-9250`、`:7844-7850` |
| 召开 | `beginMeeting` | 洗牌发言顺序 → fold 内分配 `mt-N` → 建 `meeting` 对象（18 个状态位）→ 耐久 `meetingOpen` → `putSolve({clear:true})` → 群聊行 → 开场提示（程序性点名→上次纪要确认）→ office 召开计 `notePaperConsult('meeting')` → `mkdirs` → 写纪要头 → `askMeetingRound()` | `:7453-7535` |
| 阶段一 round-robin | `askMeetingRound` | 每位常驻表决者获得**一次**"要不要发言"的机会；`retries` 记尝试数；`asked/silent/unreached` 三态填机会位 | `:7553-7589` |
| 阶段切换 | `askMeetingRound` | `roster` 全员都有机会（发言/沉默/未送达任一）⇒ `phase='open-floor'` + 广播；**无计时器** | `:7604-7612` |
| 阶段二 open-floor | `askMeetingRound` | ① 举手者（含已发言者，多轮）② 受邀临时工（各一次，`askedOnce`） | `:7590-7603` |
| 冻结（表决期） | `speechFrozen()` | 存在 open 投票板 ⇒ 不推进发言轮、成员发言入口被拦（举手保留、票照记、chair 豁免） | `:2878-2896`、`:7636-7638` |
| 收束 | `continueMeetingRound` | 四类判据（未轮到 / 在飞 / 空闲未答且重试未尽 / 有人举手）全空 ⇒ 诚实化 `unreached` ⇒ `finalizeMeeting` | `:7639-7666` |
| 硬界放弃 | `continueMeetingRound` | `elapsed >= hardLimitMs` ⇒ 写全明细 + 群聊 + `scheduleNext`；**不判结论** | `:7624-7635` |
| 汇编纪要 | `finalizeMeeting` | 发言区（+`speechZone`）→ 投票区（+`voteZone`）→ 记录人补充（等级/责任人/条目）→ `meetingMinutesTail`（机会/举手/受邀/表决块）→ 结构化 `commit(EV.meeting,{minutes})` → 清 `meetingOpen` → 失效 `grantScope='meeting'` 的授权 | `:7747-7838` |
| 收束后 | `finalizeMeeting` | 群聊「结束。已解决票 x/y」→ `markProgress` → `checkSolved` → parked 会议续开 → `scheduleNext` | `:7839-7851` |
| 会后补记 | `handleReply` | 无 live meeting 但有 `lastMeetingId` 且 reply 带 `input` ⇒ `### <id>（会后补记…）`，按文本去重 | `:9635-9649` |
| 复议（对象/板） | `vibe_v5_reconsider` | 已收束结论的救济；门槛**只升不降** | `:2742-2868` |

### ③-B 全部命令与工具名（工具面逐条：参数 · 权限 · 关键拒绝码 · file:line）

`σ` = `vibe_v5_` 前缀。**注册面**（`:10928-11179`、`:11280-11327`）；**斜杠命令**（`:11330-11435`）。

**生命周期/参数（office=可证明 session root）**
1. `σconfigure {project?,institute?,problem?,params?}` office；`:11049`
2. `σstart {problem?,researcherCount?,academician?,params?,seedDirections?}` office；`:11050`
3. `σresume {}` office；`:11051`
4. `σpause {}` office；`:11052`
5. `σstop {}` office；`:11053`
6. `σstatus {}` 任何；`:11054`
7. `σreport {}` 任何；`:11055`
8. `σset {…白名单键}` office；`:11056`+`:11057-11076`（描述里含完整参数语义；enum 显式列出）
9. `σmessage {to,content}`（两者必填）**仅 office**；`:11077-11088`
10. `σmembers {}`；`:11096`

**会议（§③-C/D 为逐项规则）**
11. `σmeeting {agenda(必填),kind∈{sync,division,verify-request,solve-vote},target?,formal_agenda?}`；office/院士可直接开，其它成员只提议；已开会期只给 `formal_agenda` ⇒ 改等级；`:11089-11095`
12. `σsay {text(必填),to?,quote_ref?,quote_refs?,quote_excerpt?,supplement_of?,why?}` 成员；表决期过 `speechGate`；`:11133-11141`
13. `σverdict {target?,verdict(必填),reason?}` 成员；接受 `[0,1]`／`abstain|弃权`／`unable|无法判断`；`:11174`
14. `σpropose_verify {target(必填),kind?,reason?}`（**S25-C：仅院士可发起**，`withCaller`）；`:11158`
15. `σend_verify {target?,reason?,op?,status?}` 仅院士；`op='formal_proof'`+`status∈{proved,disproved}` ⇒ 登记并 `locked`；`:11175`
16. `σpoll_open {question(必填),options(必填,≥2),mode∈{single,multi},max?,min?,min_votes(必填),minVotes?,secret?,allow_abstain?,allow_revote?}` 仅院士/所办，不可授；`:11164`
17. `σpoll_vote {ballot_id?,ballotId?,choices?,abstain?,note?,reason?}` 有票者；`:11165`
18. `σpoll_close {ballot_id?,ballotId?,reason?}` 仅院士/所办，不可授；`:11166`
19. `σminutes {op?,of?,fact_fix?,entry?,text?,detail?,agenda_item?}` 院士/当次记录人；`:11171`
20. `σresult_record {text(必填),actions?[{who,due_in?}],target?,kind∈{resolution,solve,org,procedure},retroactive?,op?,of?,by?,why?}` 院士/当次记录人；**仅正式会议**；`:11172`
21. `σresolutions {id?,target?,meetingId?,kind?,limit?}` 任何（只读，limit 1-50 默认 10）；`:11173`
22. `σmotion {op?,motion_id?,kind∈{topic,procedural,resolution},text?,reason?}` 成员（会议内）；`:11169`
23. `σsecond {motion_id(必填)}` 成员（非提出者）；`:11170`
24. `σreconsider {target?,target_id?,why(必填),evidence?}` 参与者；`:11167`
25. `σsecretary {who(必填),member?,why?,revoke?,op?}` 仅院士；`:11168`
26. `σprocedural_objection {why(必填)}` 成员（会议内）；`:11161`
27. `σchair_proxy {member,scope('close'),why}` 仅院士；`:11160`
28. `σgrant {to,command∈{assign,prioritize,nudge,convene},grant_scope|grantScope∈{meeting,verify,once},why}` 仅院士；`:11162`
29. `σrevoke {grant_id?,to?,command?,why(必填)}` 仅院士；`:11163`
30. `σself_report {overall?,subgoal?,plan?,status?,reason?,source?}` 在册成员（只读调用 = 查看并留痕）；`:11159`+`:7196-7223`
31. `σwait {timeout_ms?,reason?}` 成员；`:11142-11151`
32. `σoverview {}`（描述写 academician；注册面无权限门，成员调用只会得到全所视图文本）；`:11182-11279`
33. `σassign {to(必填),why(必填),acceptance(必填),task_id?,subject?,description?,priority?,write_scopes?,due_in?,origin?}`（office / `academicianLeads` 下院士 / `assign` 授权）；`:11280`
34. `σprioritize {order[],why?}`（同上权限）；`:11281`
35. `σnudge {to(必填),why(必填),next_step?}`；`:11282`
36. `σhire {purpose(必填),initial_task(必填),direction?,term?,to?}`；`:11097-11101`
37. `σfire {id(必填),reason?}`；`:11102-11106`
38. `σadd_researcher {direction?}` office；`:11107-11111`
39. `σremove_researcher {id(必填)}` **仅 office（机器强制）**；`:11116-11120`
40. `σpaper {lang?,format?,editor?,force?,reason?}` **仅 office**；`:11122-11129`
41. `σfinalize_paper {decision(必填),note?,conclusion?,force?}` **仅 office**；`:11130`
42. `σtask_create / σtask_list / σtask_get / σtask_update`（CAS：`task_id+expected_revision+action∈{claim,release,edit,set_dependencies,complete,reopen,reassign,delete}`）；`:11176-11179`
43. `σrecord_progress {content(必填),track?}`（track ∈ narrative(默认)/route/obstacle/rejected/state）；`:11152`
44. `σrecord_proposition {statement,value,motive,p 全必填,id?,title?}`；`:11153`
45. `σrecord_method {content,value,motive,p 必填,id?,title?,type?,notation?}`；`:11155`
46. `σrecord_subproblem {statement,value,motive,p 必填}`；`:11156`
47. `σread_library {member?,kind?,id?,list?,limit?}`（`list:true` 只给头部行＋指纹；`id` 不存在**具名拒**）；`:11157`
48. `σfeedback {op(必填),id?,category?,route?,context?,phenomenon?,impact?,action?,assessment?,outcome?,status?,note?,all?}`；`:11154`
49. `σlean_run {file(必填),target?,timeout_ms?}`；`:11289`
50. `σlean_archive {kind∈{def,lemma,proof,blocked}(必填),name?,target?,content?,from?,note?,run?}`；`:11290`
51. `σlean_lib {refresh?}`；`:11291-11319`
52. `σlean_read {name(必填),kind∈{auto,lib,proved}}`；`:11323`
53. `σlean_job {jobId?,waitMs?}`；`:11327`
54. `math_computation {…}`（共享模块面：`op∈{probe,run,receipt,install}`、`engine`、`mode∈{code,file,expr}`…）；`:11021-11024`、`:10978-11020`

**斜杠命令 `/v5`** `:11330-11435`（**仅可证明 office**，否则 `V5_NOT_OFFICE`；业务失败返回 `kind:'error'`）
- 子命令：`configure <研究所名> <问题…>` / `start` / `resume` / `pause` / `stop` / `status` / `report` / `members` / `message <收件人|all> <正文…>` / `meeting <议程…>`（**固定 `kind:'sync'`，`:11363`**）/ `hire <用途> <初始任务…>`（**两者必填**，缺 ⇒ `V5_INVALID_ARGUMENT`，`:11367-11376`）/ `fire <id> [理由…]` / `add [方向…]` / `remove <id>` / `set <键>=<值> …`（无 `=` 的 token ⇒ 具名拒；空 ⇒ 具名拒；`:11402-11427`）/ `paper [lang=zh|en] [format=both|md|tex] [editor=office|academician] [force]`（未知选项/非法值 ⇒ `V5_INVALID_ARGUMENT`；`:11381-11401`）。

### ③-C 逐项规则与**可调参数＋上下界**（会议系统）

**（1）召集（convoke）**
- 直接召开：office（`isOffice`，即 session root）或 `academician && academicianLeads`，或持 `convene` 授权（`:1640`、`:7402`）。
- 提议：其余成员 → voters + OFFICE_INBOX 双投（`:7410-7416`）。
- 拒绝码：`V5_INVALID_ARGUMENT`(无 agenda)、`V5_INSTITUTE_STATE`(已结题/未运行)、`V5_MEMBER_NOT_FOUND`/`V5_NOT_OFFICE`（工具面解析不到调用者）。
- 参数：`academicianLeads`（bool，默认 **true**，`:1065`）；`GRANTABLE_COMMANDS=['assign','prioritize','nudge','convene']`，`GRANT_SCOPES=['meeting','verify','once']`（`:1595-1596`）。

**（2）议程（agenda）**
- 自由文本，**必填非空**；写入纪要头 `- 议程:` 与 `meeting.agenda`。
- `kind` 决定等级（见（8））；`target` 用于 verify-request/solve-vote。

**（3）轮次（round）**
- 阶段一每位常驻表决者一次机会；阶段二举手可多轮（`spokeCount` 计次，纪要「第 n 次发言」）。
- 并发预算 `budget = max(1, floor(params.maxParallel || 3))`（`:7553`）——`maxParallel` 默认 **3**（下限 1，`:9819-9820` 仅对 lean 有显式下限；`maxParallel` 无下限保护但用 `max(1,…)`）。
- **`meetingWakeRetries` 默认 5，钳制 [0,10]（整数）**；语义 N ⇒ 共 N+1 次尝试；耗尽 ⇒ `unreached`（`:7445-7448`、`:7554-7583`、`:9855`）。

**（4）举手（raise hand）**
- `meeting_hand:true` 登记 `hands[id]`（可含已发言者，撤回用 `false`）；举手不被"交付发言"清除当且仅当本轮**之前**已举手（`pendingHand` 语义）。
- **举手是收束判据之一**（`handsUp.length` 非空 ⇒ 继续问），`:7647-7648`。

**（5）发言情境（三种位 + 两种拒绝）**
- 发言位：`inputs`(最近一次)/`speeches[]`(全部)/`spokeCount`；机会位：`asked`/`silent`/`unreached`；票位：`solve`（**互不继承**）。
- 邀请临时工：只记纪要＋广播、不计票、不进机会位、不阻塞收束（`:7673-7696`）。
- 表决期冻结：见 §③-D。
- 会后补记：见（11）。

**（6）纪要（minutes）**
- 结构（渲染）：`# 会议纪要｜mt-N｜<所名>` + 头部 6 行 + `## 发言区`（逐人 `### <id>`）＋`## 投票区`（逐板一行）＋`## 记录人补充`（等级/责任人/条目）＋`## 发言机会（征询）`＋`## 举手记录`＋`## 受邀临时工（只记纪要，不计票）`＋`## 表决`（真/假/未表态三态 + 结论）＋（放弃时）⚠ 行；
- 结构化双份：`commit(EV.meeting,{index:{id},minutes:{at,speechZone,voteZone,secretary,entries,level}})`。
- 参数：`SECRETARY_ENTRY_MAX=1000`（条目/事实更正上限）；`RESOLUTION_TEXT_MAX=1000`（决议文本上限）；motion `text ≤2000`；`RESOLUTION_KINDS=['resolution','solve','org','procedure']`。
- 只增不改的硬约束：绝不重写 `### <who>`/两区/异议；不自动补全缺口（R7）。

**（7）收束（closing）与法定数、门槛**
- 会议收束条件**与票无关**：只看机会位＋举手/在飞（`:7639-7652`）。
- **会议没有法定人数门槛**；法定数 m 只用于**验证/结题**：`m = max(1, min(quorumCap, voterCount()))`（`quorumMFrom`，`:2903-2907`）；`quorumCap` 默认 **3**（下限 1，`:9858`）；`quorumMode ∈ {m-unanimous(默认), all-unanimous}`（非法 ⇒ `m-unanimous`，`:9794`）。
- 投票板有**两个并列门槛**（K13）：`minVotes`（本板是否成立）与 `m`（结题门）；`minVotes` **必填、无默认**，且 `minVotes ≤ voterCount()`（`:1845-1852`）。

**（8）会议分级（S12/D7）**
- 派生 `formal`：`verify-request`/`solve-vote`；`light`：`sync`/`division`；院士 `formal_agenda:true` 显式覆盖（建会或会期内）。
- `light` 硬闸：`truthWriteRefusal` 具名拒（决议 / 纪要 `decision` 条目 / resolution 动议 / 任何"实体定论"）。**等级当次会议绑定**。**无自动升降级、无定时器**。

**（9）复议（reconsideration，S9/D5/D5a/U3）**
- 对象：已 `closed` 的 verdict（否则 `V5_INVALID_ARGUMENT`）或已 `closed` 的投票板（`ballot:<id>`/`ballot_id`；未截止 ⇒ 拒）。
- 资格**由记录派生**：有胜方 ⇒ 仅**当初胜方之一**（prob 必须 === 目标布尔值）；无胜方 ⇒ **任一参与者**，不得以"无胜方"拒收；板复议 ⇒ 仅该板参与者。非参与者 ⇒ `V5_NOT_VOTER`。
- 门槛**只升不降**：`after = max(before, reconsiderFloor, quorumCap)`；`reconsiderFloor` 默认 **0**（下限 0，`:9860`）。
- 频次：**每轮只受理一次**（同轮再提 ⇒ 拒）；`round >= verdictMaxRounds`（默认 **3**，下限 1，`:9871`）⇒ 拒"不得无限复算"；板**每板只受理一次**。
- 效果：旧结论/旧票面/旧少数意见**全部 append 留档**（`previousRounds[]`、板 `priorResult`），旧结论标 `supersededBy`；新轮 `votes={}`、`sealed:false`、`closed:false`、`threshold={m:after,floor}`；板重新 `phase:'open'`。**不产生新票权、不改分母、不改阶段、无定时器**。

**（10）硬界钳制（clamp）与超时（timeout）**
- `meetingHardLimitMs`：默认 **1800000ms（30min）**，**钳制 [300000, 7200000]（5min–2h）**，`Math.floor`；`normalizeParams`（`:9854`）与读取点（`:7441-7444`）**双处钳制**；会议开始时快照进 `meeting.hardLimitMs`；**不提供无界**（0/∞ 无特殊语义）。
- `meetingWakeRetries`：默认 **5**，**钳制 [0,10]**（`:7445-7448`、`:9855`）。
- `verdictMaxRounds`：默认 **3**，下限 **1**（`:9871`）。
- 看门狗（会议以外）：`recoverStallMs()=2×activityTimeoutMs`（论文阶段用）；`activityTimeoutMs` 默认 **120000**，必须 >0（否则被丢弃）。
- 静止提示 `stallAutoMeetingMs`：默认 **360000**，**负值＝关闭**（0 会落回默认，故不能用 0 关闭）。
- 摘要窗口 `chatDigestMs` 默认 **45000**（>0）；`chatDigestMax` 默认 **12**（≥1）。
- **会议内所有"时间"字段均由框架写**：任何 `…At/…Ms`（大小写不敏感，含 `expires_at`/`subgoal_at`/`due_at`）在 `poll_open/poll_vote/poll_close/result_record/minutes/secretary/motion/second/reconsider/grant/revoke/say/self_report` 中**一律具名拒**；期限只用**相对** `due_in`（如 `next-meeting`）。

### ③-D 表决期禁言（时序分离，S8/R3/K12/B9）
- 派生：`openBallot()` 存在 ⇒ `{frozen:true,ballotId,since,question}`（`:2878-2883`）。
- 门在**成员发言入口**（`vibe_v5_say` → `speechGate`；会议唤醒的 `input/say/summary` 交付）⇒ 非院士/非所办且 `text` 非空 ⇒ 拒（`:9597-9609`、`:11136-11140`）。
- 被拒发言处理：`history what:'speech-refused-frozen'` + 幂等 `silent[id]` + `what:'silent-after-refusal'` + 群聊行；**不写 inputs/speeches/spokeCount**；**举手保留**（解冻后按原顺序放行）；**票照记**。
- 解除**只能**院士显式 `σpoll_close` 或结束会议；无定时器、不自动解除、不折算。

### ③-E 会议相关的持久化与恢复
- 耐久：`Shared/Meetings/<id>.md`（纪要，追加式）；`inst().meetings[]`（索引 + `minutes{}` 结构化）；`inst().meetingOpen`（未收束标记，`beginMeeting` 置、`finalizeMeeting` 清 —— 崩溃/重启后 `report()` 明示"有 1 场会议未收束…纪要可能缺失"，`:10676-10681`）；`inst().solve`（结题票）；`inst().ballots[]`；`inst().resolutions[]`；`inst().motions[]`；`inst().minutesConfirmations[]`；`inst().secretaries[]`；`inst().grants[]`；`inst().chatSupplements[]`。
- 进程内（重启即失）：`meeting` 对象本体、`pendingMeeting`、`finalizeLock`、`hands/asked/...` 都在对象里随 `meeting` 存亡；`resume()` 只把 `meeting.lastInputAt` 刷新（`:10273-10275`）——**不重建已失的会议发言态**（`report()` 会明示纪要可能缺失）。
- `initStop()`：`meeting=null; pendingMeeting=null; putSolve({clear:true})`；所有未关闭 verdict 判 `undecided`（`:10313-10343`）。

---

## ④ 专章：群聊与状态面板（目标 2 的直接判据）

### ④-A 群聊消息字段（**代码权威口径**）
- **消息对象**（`say` 写入，`:3557-3561`）：`{ id:'msg-N', from, to, kind, text, at, quote?, quotes?, supplementOf? }`。
  - `id`：fold 内分配、全局单调 `msg-N`（`:3551-3563`）。
  - `from`：成员 id、`'office'`、或框架 `'framework'`（notice）。
  - `to`：成员 id / `'all'`（落库时展开为**每收件人一条**，故 `inst().messages` 里看不到 `'all'`）/ `'voters'` / `OFFICE_INBOX`。
  - `kind ∈ {chat,dm,voters,office,meeting,verify,assign,nudge,notice}`（`:3599-3613`）。
  - `at`：框架时间戳（毫秒）；**没有回复目标/回复链字段** —— 回复关系只用引用（`quote.ref`）表达；**没有"发言次数限制"字段**。
  - `quote/quotes`：`{ref,from,at,kind,domain,excerpt,truncated,depth,collapsed,cycle,rootRef,secretAggregateOnly,viaSupplement,supersededBy}`（`:2662-2671`）。
- **"管理员 / 禁言 / 发言次数限制"在 v5r 代码中不存在**：全文件 grep `禁言|发言次数|管理员|admin|mute` 仅命中 `:9596` 注释；唯一的"禁言"是**表决期冻结**（§③-D），唯一的"发言计数"是会议内 `spokeCount`（纪要展示用，**不设上限**）。职务权限由**权限表**（office / academician / secretary / `canDo`）承担，不是"群管理员"角色。
- **封顶账本**：`inst().delivered` 只保留最近 `DELIVERED_CAP=500` 条 ack；`pending = messages`（未 ack），`delivered = 封顶账本`（`:484`、`:1152-1155`、`:10404-10410`）。**已投递消息正文不再保留** ⇒ `msg-<N>` 引用悬空（具名拒）。
- **群聊镜像**：`Shared/Chat/<YYYY-MM-DD>.md`（人读；`- HH:MM:SS｜text`；`saveChatLine` 串行写）。

### ④-B 消息的读写路径
| 动作 | 路径/函数 | file:line |
|---|---|---|
| 生产 | `say()` → `putMessageMake(alloc)` → `EV.message` fold | `:3531-3574` |
| 待投递读取 | `pendingFor(memberId)`（`inst().messages` 中 `to===id`） | `:3588-3598` |
| 何时投 | `deliveryDecision`（非 chat 立即；纯 chat 按 `chatDigestMax`/`chatDigestMs`） | `:3617-3627` |
| 注入提示 | `promptFor` 前置 `[新到的消息…]` + 期间 `inboxSuppressed` 抑制 `briefBlock` 重复 | `:3415-3419`、`:9078-9110` |
| ack | `wakeWithInbox` 在**发送成功后** `ackPending` → `ackDelivered`（清 `messages`、进 `delivered`） | `:9099-9110`、`:3628-3631` |
| 所办读取 | `status().officeRequests`（cap 10 + Dropped/Truncated）、`report()` 节 | `:10419-10428`、`:10607-10615` |

### ④-C 状态面板（成员总目标 / 计划 / 正在执行的子任务）
**面板实体 = `SelfReport.json`（每成员一个文件，非集中式"板"）** `:7069-7223`
- 读写路径：`Members/<id>/SelfReport.json`（**原子写**：写 `<file>.<pid>.tmp` 后 `renameSync`，`:7086-7092`）；查看审计 `Shared/SelfReportViewAudit.json`（**cap 200**，`SELF_VIEW_AUDIT_CAP=200`）。
- 数据形状（`selfReportRow`，`:7104-7116`）：
  `{ member, kind, voting, overall, overallAt, subgoal, subgoalAt, plan[], planAt, status, updatedAt, updatedBy, deviation, deviationLabel }`
  文件内另有 `history[]`（逐字段 `{at,by,field,old,next,reason,source}`）、`overallBy`、`deviation{keptValue/keptAt/keptBy}`。
- 字段语义：`overall`＝**总目标**（只有院士可替他人设定）；`subgoal`＝当前子目标；`plan`（**字符串数组**）＝计划；`status`＝状态文本 —— **"正在执行的子任务"没有独立字段**，由 `plan[]`＋`status`＋任务板（`σtask_list` 中 `in_progress` 且 `ownerId` 命中）共同表达。
- 写入规则（`selfReportTool`，`:7196-7223`）：**在册成员**（院士/常驻研究员）只能改自己；**列席/受邀/临时工不可写**（`V5_NOT_VOTER`），但**可读**（工作状态全所可读）；**他人自述仅院士可设 `overall` 一项**（否则 `V5_INVALID_ARGUMENT`）；**任何 `…At/…Ms`（大小写不敏感）具名拒**（时间由框架写）；同值 ⇒ `deduped:true` 且**不追加历史**；改 `overall` 时若原作者≠调用者 ⇒ 记 `deviation`（**保留院士原值与旧时间，可取回**）+ 群聊警示。
- 查看面（`selfReportView`，`:7118-7130`）：`roster[]`（在册全列）+ `nonVoting[]`（列席/受邀/临时工**单列并标注**）+ `viewAuditTail`（最近 20）；**私聊内容永不进入**。
- `status()` 里**没有** self-report 节；`report()` 也**没有**；只有 `σself_report`（无参＝读取）与 `σoverview`（不含自述）暴露它。⇒ **若目标 2 要"状态面板"，v5r 的等价物是这两条路径 + `Members/<id>/Progress/progress.md`**。

### ④-D `status()` 的 `meeting` 子对象（只读面，逐字段）`:10437-10488`
`{ id, agenda, kind, phase, hardLimitMs, elapsedMs, roster[], order[], asked[], silent[], unreached[], hands[], attempts{}(=retries), invited[], spoke[], spokeCount{}, secretary, record_entry_count, level, speech_frozen, frozen_by, minutes_confirmation{of,confirmed,at,by,fact_fix}, action_items{total,open,handover,overdue}, motions{count,latest_id,pending,carried,needed} }`
- 另有顶层 `parkedMeeting{agenda,kind}`、`poll{…}`、`verify{…}`、`verifyQueue[]`、`solveVotes[]`。
- 口诀（代码注释即口径）：**机会位/举手决定能否收束；发言位只描述谁说了话；票位在 `solve`（互不继承）**（`:10435-10436`）。

---

## ⑤ 专章：主代理（academician）角色（目标 6 的直接判据）

### ⑤-A 人设（charter，入职冻结）
- **装配式**：`memberPersona(member) = (params.staffPersona ? staffPersona+'\n\n' : '') + charterFor(member)`（`:3676-3679`），并在 `newMember` 的 fold 内（id 分配后**立刻**）写入 `member.persona`（`:3669-3673`）——**冻结快照**，`staffPersona` 事后修改不影响老成员；`resume` 重建会话时用的还是这份 persona。
- **charter 结构**（`charterFor`，`:3131-3361`）：开头（身份：院士/常驻研究员/临时工；写入原问题陈述；临时工写任务期）→ 分工声明 → `【一、所内编制与你的同事】`（含**入职时名册快照** `rosterLine`）→ `【二、通用规章（全员必读）】`（1–10 条，含 **7. 主动向院士汇报**；**8/9/10 三条 S25-C 硬规章**：辩论对象由院士定、只有"已正式证明/证伪且 locked"的命题才可入辩、"正式证明或证伪"只可在确信时登记且登记即定稿）→ `【三、资料库/progress/卡片格式】`（`LIB_SPEC`）→ `【四、组织与协调】`（**院士＝`ACAD_ORG`**，`：3106-3129`；其它成员＝`orgCommon()`）→ `【重要】分派不改变求真规则` → `【五、表决与定论（求真门槛）】`（m 票布尔一致；两段式：独立初评→公开辩论；诚实条款"永远不要为了让流程往前走而投出你不相信的 1 或 0"）→ `【六、每轮做什么】`→ `【七、雇佣与解雇】`→ `【八、任务板】`→ `【九、上下文与纪律】`→ `【十、停止】`（当且仅当全体表决者一致认为原问题已解决才停止）。
- **`ACAD_ORG`（院士专章）七项职责**：① 全所视图（`σoverview`）② 拆解+分派（`σassign`，含理由与验收标准）③ 优先级（`σprioritize`）④ 主持会议 ⑤ 督导（`σnudge`，要给具体下一步/配对建议）⑥ 资源调配（临时工、向所办建议增删常驻）⑦ 对外代表。**四条边界**：一票等重（无加权/无否决）、分派的是工作不是结论、成员有权据理反对（理据优先于职位）、不能自我扩张编制。
- **主代理不是"助手"的机器证据**：office 在 `agent.cordis.yml:74-86` 被定义为**外部接口（HANDS-OFF）**：不研究、不投票、无库；`vibe_v5_message` 强制 `caller==='office'`（`:11083-11085`）；自动汇报/统筹职责全部落在院士人设与 `σoverview/σassign/σprioritize/σnudge` 工具上。

### ⑤-B 提示词装配（逐轮）
- **每轮只带 volatile 内容，charter 不重注入**（`:3973-3977`）。
- `briefBlock(member, roundNo)`（＝`stateBlock`，`:3376-3421`）：`[状态]`（身份/轮次/`m`/表决者数）→ `[在册]`（active id 列表）→ `[未就位]`（非 active 非 dismissed，**让 provisioning 失败可见**）→ `[形式化]`（运行时读取，非冻结）→ 已结算 Lean 公告（**恰好一次**，`takeLeanNoticesFor`）→ `[任务板]`（进行中/可认领/我负责）→ `▸ 我的任务`（含验收/分派人/描述首行）→ `[新到的消息/通知]`（若 `inboxSuppressed` 则省略，避免重复）。
- 各提示词：`initialPrompt(入职/重建, mode='resume')`、`normalPrompt`（普通研究轮；院士额外段"统筹全所"）、`checkpointPrompt`（心跳：继续推进、别停在原地）、`meetingPrompt`（议程/受邀说明/他人已发意见/发言模型说明/举手与投票规则/`proofStatusBlock`）、`verifyPrompt`。
- 注入片段（按开关）：`pointerContractBlock()`（S21，`pointerPropagation` 默认 true；false ⇒ **零注入**）、`resourceBlock()`（S25-A，`resourceSelfCheck` 默认 false；含 `maxParallel`/`toolCallsPerTurnCap`/`memoryCeilingMb`）、`proofStatusBlock()`、`mathPushLine/paperPushLine/feedbackPushLine`。
- 回复契约 `replySpec(kind)`（`:3978-4046`）：逐 kind 差异（`kind==='temp'` 不给 `verdict`/`hire`/`fire`；`kind==='academician'` 给 `convene_meeting/assign/prioritize/nudge`）；`formalOn()` 时才出现 `formal` 字段；末尾给**最小合法 JSON 样例**（修复"只许输出 JSON"与"字段目录不是 JSON"的矛盾）。
- **压缩指令**：`compactThreshold`（默认 **66**，≤0 丢弃）或 `compactAfterRounds`（默认 **8**）触发软压缩提示 `[CONTEXT COMPACT …]`；真实压缩走 `maybeRealCompact`（优先 `compactNow`，否则 `compactIfNeeded(agent,'pressure')`）（`:3896-3931`、`:9728-9749`）。

### ⑤-C 自动汇报
- **人设层**：`【二·7】主动向院士汇报` / 无院士时 `主动在群聊里汇报`；`【六·③④】`每轮决定是否发言；`agent.cordis.yml` 的 office persona 要求"用户问进度就 `vibe_v5_report` 并平实总结"（`agent.cordis.yml:294-295`）。
- **机器层（等价物）**：`σrecord_progress` → `Members/<id>/Progress/{progress,routes,obstacles,rejected,state}.md`；`σoverview` 给院士**全所 Progress 尾 1200 字符/人 + 任务板 + 行动项 + 停滞提示**；`σself_report` 给结构化"总目标/子目标/计划/状态"；`status()/report()` 给计数与视图。
- **没有**独立的"定时自动汇报"任务/心跳汇报消息（汇报依赖成员回合里的 `progress/say` 与院士主动 `σoverview`）。

### ⑤-D 参数配置入口（谁能改、改什么、落到哪）
- 人：**office（session root）** —— `σconfigure`（`project/institute/problem/params`）、`σset`、`/v5 set <k>=<v>`、`/v5 configure`；成员**不能**改参数（`withOffice` 拒 `V5_NOT_OFFICE`）。
- 落盘：`State/<institute>.v5state.json` 的 `params`（`patchInstitute({params:merged})`），重启后 `syncParamsFromState` 重建。
- 运行时立即生效：`setParams` 末尾 `scheduleNext()`（数学参数额外 `refreshMathLine()`）。
- 可见性：`/v5 status` 的 `params` = `visibleParams()` **显式白名单**；`σset` 返回 `adjusted`（真实变化）与 `dropped`（被忽略的未知键）。
- 院士**可调**的只有工具面内的组织动作与会议分级/记录人/授权等；**不能**改参数、不能改票权。

---

## ⑥ 专章：框架能力需求清单（若要在一个通用框架里实现同样的所，需要什么原语）

| # | v5r 用到的能力 | 需要框架提供的原语 |
|---|---|---|
| 1 | 成员=**常驻子代理**（可被反复唤醒、可被中断、可被释放） | `subagents.startContinuable(spec)` / `sendMessage(root, childId, blocks, {signal})` / `interrupt(childId,{kind,agent})` / `drainContinuableChildren(root,[childId])` / 子代理注册表 `agents.get(childId)` + `subagent/start|end` 事件（end 需带 `lastAssistantMessage`+`stopReason`） |
| 2 | 成员↔成员不能直连，一切经框架代转 | 以 root 为 transport 的邮箱 + **按收件人一条** 的耐久消息队列 + ack（未 ack 可重投） |
| 3 | 每收件人的投递节流 | 定时器（`ctx.timeout`）＋ 可调窗口/条数 |
| 4 | 只读/写入类工具注册 + 卸载 | `tools.register()` 返回 disposer，且必须在 `ctx.effect()` 内注册；`tools.restrict` 抛错时能从错误文本取已注册名单 |
| 5 | 斜杠命令 | `commands.register({name,input.hint,handler})`，handler 返回 `{kind:'success'|'error',text}` |
| 6 | 参数与状态持久化 | 插件自管的**加固 JSON 状态文件**（不写宿主会话日志：DSH 拒载未知事件类型）＋ 原子写 + 事件 fold + id 分配器 |
| 7 | 定时/看门狗 | `ctx.timeout`（一次性）＋ 每轮 re-arm；**不能依赖"到点自动结算"** |
| 8 | 文件系统 | injected `fs`（read/write/stat/mkdir）+ 工作目录语义 + 路径基准（成员文件工具按 **session cwd** 解析，故成员面路径要给完整/绝对路径） |
| 9 | 子进程 | `subprocess.spawn({argv,cwd,stdio,graceMs})` + `handle.done` + `handle.terminate` + `resolveExecutable`（Lean / LaTeX / math 引擎） |
| 10 | 上下文管理 | 上下文占用回读（成员自报 `contextPct`）+ `compaction.compactNow/compactIfNeeded(agent,signal)` + 工具结果裁剪 |
| 11 | 模型路由 | 每个子代理可单独指定 `provider/model`（空 = 继承 root 路由） |
| 12 | 并发上限感知 | 宿主 live-child 上限（`maxActiveSubagents`）的**可命名错误**（不能只给不透明字符串），以便区分"宿主顶满"与"provider 坏了" |
| 13 | **票与权限** | 框架必须能表达"票权不可代授"：权限表 + 事件型授权（meeting/verify/once）+ 撤回写事件并广播；阶段门与冻结（由"存在 open 板"派生） |
| 14 | **只增不改的审计** | append-only 台账（决议/动议/纪要确认/记录人/授权/自述历史）＋ "旧结论标记被取代"而非删除 |
| 15 | **人机接口** | 人类只通过 root 会话（office）读写；人类消息必须签名 `office`，成员消息不能冒充 |
| 16 | 非阻塞等待 | 一次性 future-only 的 activity waiter（`vibe_v5_wait`）＋ 首个状态变化唤醒全部 waiter |
| 17 | 时间戳纪律 | 框架写所有 `…At/…Ms`，并**具名拒绝**客户端自带时间（防伪造/漂移） |
| 18 | 机器级资源闸 | 单回合工具调用计数（超限**不执行**）+ 自设 live-child 上限（调宿主前先拒，可预判） |
| 19 | 恢复 | 重启后：成员对账（找不到 live child ⇒ failed/清 childId）、从成员自己的 Progress 末 4000 字符重建会话、看门狗时钟刷新、论文阶段续跑、Lean 队列重驱 |
| 20 | 交付物 | PDF/TeX 编译（有界探测 + 4 步修复 + 超时终止）＋ 幂等补写产物 ＋ 失败具名进 warnings |

---

## ⑦ 专章：设计文档 ↔ 实现落差（目标 2 的**判据核心**）

> 文档层共 4 套口径：`MEETING-PLATFORM-SPEC.md`（merged，**42 条命令**＋K1–K14 裁决＋P1–P15 待拍板）、`A-model.md`（30 院士 + 12 成员）、`B-protocol.md`（六种发言机制＋权限矩阵＋10 参数）、`RULINGS.md`/`docs/02-rulings.md`（R1–R10/D1–D10/D5a/G1–G5/U3–U5）。**实现层只有 `vibe-math-v5r.js` 的工具面**（§③-B）。
> 结论一句话：**v5r 实现的是设计的一个"子集 + 变形"**：以 `asked/silent/unreached` 机会位、`hands` 举手、`spending冻结`、`投票板/决议/记录人/动议/授权` 为核心；**设计里的会期状态机（recess/extend/stop/adjourn）、命令目录（42 条）、群管参数（配额/禁言/并行）、发言机制切换、点名/顺序、材料、质询、补票窗口等均未实现**。

### ⑦-A 42 条设计命令 → v5r 实现对照（逐条判定）

图例：`✅已实现`（同名或同语义工具）／`≈变形`（存在等价但语义/粒度不同）／`✗未实现`（无对应入口，须由框架隐式行为或缺失）。

| # | 设计命令（SPEC §2.2） | v5r 对应 | 判定 | 证据 |
|---|---|---|---|---|
| 1 | `meeting_open` 召集 | `vibe_v5_meeting{agenda,kind,target}` + `beginMeeting` | ✅ | `:11089`、`:7453` |
| 2 | `meeting_start` 开场 | 无独立命令（`beginMeeting` 自动开场＋开场提示写群聊） | ≈ | `:7490-7514` |
| 3 | `meeting_type_set` 设定类型 | 只有 `kind` 四值＋`formal_agenda` 覆盖（改类型字段后**不换机制**，只改等级闸） | ≈（**落差：无类型注册表/机制切换**） | `:2225-2231`、`:11089` |
| 4 | `meeting_agenda_set` 议程增删改 | **无**（agenda 开会时固定，纪要只追加） | ✗ | `:7473`（`agenda` 单串） |
| 5 | `meeting_flow_set` 流程采用/重排 | **无**（无流程概念） | ✗ | — |
| 6 | `meeting_roll_call` 点名/出席 | **无 attendance 模型**（只有开场"程序性点名"行动项，非出席） | ✗/≈ | `:7499-7507` |
| 7 | `meeting_time_set` 设定时长 | **无**（只有全局 `meetingHardLimitMs` 硬界，会议开始时快照） | ✗/≈ | `:7441-7444`、`:7478` |
| 8 | `meeting_stop` 停当前步 | **无** | ✗ | — |
| 9 | `meeting_recess` 休会 | **无** | ✗ | — |
| 10 | `meeting_resume` 复会 | **无** | ✗ | — |
| 11 | `meeting_extend` 延长 | **无**（硬界参数可全局调，但会内不能延长；`status.meeting.hardLimitMs` 只读） | ✗ | `:10440` |
| 12 | `meeting_adjourn` 散会 | `finalizeMeeting`（**由收束判据自动触发**，无显式散会工具） | ≈（**落差：无显式散会命令，院士不能"手动散会"**） | `:7747`、`:7648-7663` |
| 13 | `meeting_grant` 临时授权 | `vibe_v5_grant`（**只 4 命令、只事件型 scope、不收时间**） | ✅（口径收紧） | `:1664-1728`、`:11162` |
| 14 | `meeting_revoke` | `vibe_v5_revoke` | ✅ | `:1730-1753`、`:11163` |
| 15 | `meeting_invite` 邀请发言（**带正文**） | reply 字段 `meeting_invite:{member,why}`（**只有理由，没有"邀请正文"字段**） | ≈（**落差：正文/expect/timebox 缺失**） | `:7676-7696`、`:9633-9634` |
| 16 | `meeting_speak_order_set` 设顺序 | **无**（`beginMeeting` 用 **Fisher-Yates 随机序**固定） | ✗ | `:7456-7458` |
| 17 | `meeting_speak_next` 点名发言 | **无**（框架按顺序自动问） | ✗ | `:7573-7589` |
| 18 | `meeting_chat_mode_set` 发言机制＋**群管参数** | **无**（无 mode、无配额、无禁言、无并行开关） | ✗（**目标 2 关键缺口**） | grep 无命中 |
| 19 | `meeting_hands_set` 举手管理 | **无**（只能成员自己 `meeting_hand`） | ✗ | `:9583-9592` |
| 20 | `meeting_mute` 静默 | **无**（唯一"禁言"＝表决期冻结，非按人） | ✗ | `:2878-2896` |
| 21 | `meeting_unmute` | **无** | ✗ | — |
| 22 | `meeting_settle` 沉淀等待 | **无显式命令**；语义上等价于"在飞成员未落定 ⇒ 等"（收束判据 b/c） | ≈ | `:7641-7648` |
| 23 | `meeting_motion` 动议 | `vibe_v5_motion`（＋`vibe_v5_second`） | ✅ | `:2330-2402`、`:11169-11170` |
| 24 | `meeting_poll_open` | `vibe_v5_poll_open`（六项齐；**无 boolean 模式**） | ✅/≈ | `:1823-1897`、`:11164` |
| 25 | `meeting_poll_close` | `vibe_v5_poll_close` | ✅ | `:1962-1996`、`:11166` |
| 26 | `meeting_result_record` | `vibe_v5_result_record` | ✅ | `:2119-2193`、`:11172` |
| 27 | `meeting_minutes` | `vibe_v5_minutes`（confirm/gaps/entry） | ✅ | `:2404-2467`、`:11171` |
| 28 | `meeting_secretary_appoint` | `vibe_v5_secretary` | ✅ | `:2279-2327`、`:11168` |
| 29 | `meeting_taskboard_open` | **无**（用全局任务板 `vibe_v5_task_create`；`origin:'meeting:<id>'` 由**调用方**自填） | ✗/≈ | `:11280`（`origin` 参数）、`:7497` |
| 30 | `meeting_task_assign` | `vibe_v5_assign` | ✅ | `:11280` |
| 31 | `meeting_raise_hand` | reply 字段 `meeting_hand` | ✅/≈ | `:9583-9592` |
| 32 | `meeting_say`（含引用） | `vibe_v5_say`（`quote_ref/quote_refs`） | ✅ | `:11133`、`:2621-2693` |
| 33 | `meeting_challenge` 定向质询 | **无** | ✗ | — |
| 34 | `meeting_answer` 回答质询 | **无** | ✗ | — |
| 35 | `meeting_poll_vote` | `vibe_v5_poll_vote` | ✅ | `:1899-1961`、`:11165` |
| 36 | `meeting_boolean_vote` 布尔概率＋理由 | `vibe_v5_verdict`（verify 面）＋ `vote_solved`（结题面） | ✅/≈ | `:11174`、`:9564` |
| 37 | `meeting_abstain` | `verdict:'abstain'/'弃权'`；板上 `abstain:true` | ✅ | `:9493-9498`、`:1919-1922` |
| 38 | `meeting_second` | `vibe_v5_second` | ✅ | `:2380-2402`、`:11170` |
| 39 | `meeting_material_submit` | **无** | ✗ | — |
| 40 | `meeting_task_claim`（请求→批准） | `vibe_v5_task_update{action:'claim'}`（**直接认领，无批准点**） | ≈（**落差：无 claim_pending/批准**） | `:11179` |
| 41 | `meeting_request`（休会/延长请求） | **无**（程序异议 #46 是另一件事） | ✗ | `:7290-7305` |
| 42 | `meeting_leave` 请假/离席 | **无** | ✗ | — |

**统计（本表 42 行）**：`✅已实现/近似等价` **14**（#1,13,14,23,24,25,26,27,28,30,31,32,35,36,37,38 中的同名者，按"✅"计 14）；`≈变形` **7**（#2,3,12,15,22,29,40）；`✗未实现` **21**。⇒ **目标 2 的直接答案：v5r 不覆盖设计命令目录；设计层"全部命令与功能"明显大于实现层。**

### ⑦-B 设计参数 ↔ 实现参数（10 条设计参数，K10）
| 设计参数（SPEC K10 / B §5） | 建议默认 | v5r 是否有 | 说明 |
|---|---|---|---|
| `step_duration` 单步时长 | 无（仅提示） | **✗** | 无单步概念 |
| `mechanism_duration` 单机制时长 | 无 | **✗** | — |
| `speak_time_per_member` 每人单次 | 无 | **✗** | — |
| `settle_timeout` 沉淀上限 | 有（兜底） | **≈** `recoverStallMs()=2×activityTimeoutMs`（**仅用于论文阶段**；会议用 `meetingHardLimitMs`，**已不再用 recoverStallMs**，见 `:1090-1091` 注释） | `:4249` |
| `vote_window` 表决窗口 | 无（院士关闭） | **✗**（无窗口；`poll_open` 后只能显式 `poll_close`） | `:1962` |
| `quote_depth_max` | 3 | **✅** `quoteDepthMax`（默认 3，下限 1） | `:1072`、`:2480` |
| `quotes_per_message_max` | 2 | **✅** `quotesPerMessageMax`（默认 2，下限 1） | `:1071`、`:2479` |
| `open_chat_quota` 群聊每人次数 | 不限 | **✗** | — |
| `mute_list` 禁言名单 | 空 | **✗** | — |
| `allow_revote` 允许改票 | 是 | **✅ 但按板**（`rules.allowRevote`，默认 true，**不是全局参数**） | `:1866`、`:1918` |
| （设计未列）`meetingHardLimitMs` | 30min | **✅** 1800000，钳 [300000,7200000] | `:1094` |
| （设计未列）`meetingWakeRetries` | — | **✅** 5，钳 [0,10] | `:1095` |

### ⑦-C 设计裁定 ↔ 实现证据（R1–R10 / D1–D10 / G1–G5）
| 裁定 | 实现证据（v5r） | 覆盖度 |
|---|---|---|
| **R1 框架只推荐不驱动** | 静止提示 `emitStallNotice` 只写群聊、**不召集/不收束/不推进阶段**；`schedulePass` 注释明写"framework only RECOMMENDS"；无自动散会 | ✅ |
| **R2 沉默≠同意** | 票只由 `recordSolveVote` 写；`silent` 与 `voteSolved` 分属两个位；`meetingVoteBlock` 三态、"沉默不等于投票"；`checkSolved` 只读 `solve` | ✅ |
| **R3 票与发言分离** | `inputs/speeches` vs `solve` vs `extras[*].voteSolved` 三处；冻结期"票照记、发言拒" | ✅ |
| **R4 chair-first** | 只有 `canDo('convene')` 能开；收束由判据（无院士指令）；**注意：无显式"结束会议"命令** ⇒ "收束权在院士"只能是**完成征询后自动收束**，与 D2/R4 有张力（见 §⑩ 未决 U-C1） | ≈ |
| **R5 主持不额外加权** | `voters()` 只按 kind；`judgeVerdict` 不读 chair；`chair_proxy` 明写"NEVER adds a vote" | ✅ |
| **R6 真值不越界** | 决议 `result_record` 不写 `verdicts/solve`；论文/辩论只引用已有证据 | ✅ |
| **R7 可审计** | 决议 `res-<n>` 稳定 id、`effectiveAt`、动议/台账 append-only、`minutesConfirmations`、`secretaries[]`、`grants[]` | ✅ |
| **R9 程序性表决未达门槛=未决** | 投票板 `settled=false ⇒ outcome:'unsettled'`；`min_votes_reached` 与 `quorum_reached` **两门槛并列** | ✅ |
| **R10 过程判定≠结束裁定** | 文档要求"过程票数不得驱动流程"；实现里 `checkSolved` 会在**每一张 solve 票**后判结题（这是"结题门"而非"辩论过程"），投票板也不过过程计票，**未发现过程票数驱动阶段** | ✅ |
| **D1 仅院士主持/代行须显式** | `chair_proxy`（scope 只能 `close`、`why` 必填、不设票权） | ✅ |
| **D2 不设"推翻主持"，程序异议留痕** | `procedural_objection`（`chairReplyPending:true` 保持可见） | ✅ |
| **D3 到场/分母：未答不计分母、不算反对、名单必列** | `judgeVerdict` 只读实际票；`unable` 出分母；投票板 `pending[]` 公开点名；`meetingVoteBlock` 未表态单列 | ✅ |
| **D4 门槛未达=未决、延长有界** | 未达 ⇒ `unsettled`；**延长机制不存在**（硬界固定）⇒ 只有"有界"没有"可延长" | ≈ |
| **D5/D5a 少数意见入档＋复议** | `minorityOf`＋`sealRecord` 强制盖章；`reconsiderTool` 资格记录派生、无胜方任一参与者、门槛只升不降、每轮一次 | ✅ |
| **D6 引用边界** | `resolveQuoteAnchor`：同会议、悬空拒、私聊须补记、决议跨会议、不记名只聚合、条数上限、深度折叠、成环标注 | ✅ |
| **D7 简流程不得产出实体定论** | `truthWriteRefusal` 单一判定点（决议/纪要 decision/resolution 动议） | ✅ |
| **D8 列席/受邀/临时工永不表决** | 临时工票被 `recordSolveVote` 丢弃、板投票 `V5_NOT_VOTER`、自述不可写、授权不可给 | ✅ |
| **D9 辩论只收敛意见＋广播三要素** | `vote_solved`（结题意见）与 verify 分离；**广播模板（"根据研究所规则，由于…"）在 v5r 里没有对应措辞**（群聊只写"结束。已解决票 x/y"） | ≈（**缺口**） |
| **D10 静止最多提示一次＋谁在等谁** | `stallNotice` 幂等键 `sinceAt`、`stallWaitingList` 三类来源、耐久 | ✅ |
| **G2 决议公告即生效/稳定标识** | `result_record`：`effectiveAt=at`、`retroactive` 只加 `declaredAt`、`res-<n>` 框架分配 | ✅ |
| **G3 行动项"待接手"永不静默消失** | `origin:'meeting:<id>'` 任务＋`state:'handover'` 视为"待接手"、逾期按 `createdAt<meeting.startedAt` 判定；`actionItemsView`（**但"转待接手"没有自动机制，靠派任务时传 state/origin**） | ≈ |
| **G4 同一议题两场会议互斥** | **无实现**（无议题级互斥；只有"同一时刻一场会议"） | ✗ |
| **G5 成员最小必要知情/私聊不转发** | 投递按收件人；未 ack 可重投；私聊不进公开面（补记才可引） | ✅/≈ |

### ⑦-D 设计文档中**目标 2 明确点名**的字段/机制在实现中的状态
| 用户词 | 文档出处 | v5r 实现 |
|---|---|---|
| 群聊**管理员** | B §2：「院士是**管理员**：可设"每人可发信息次数""禁言名单""是否允许引用"」；A §1.1 `speech_policy`；PHILOSOPHY §3.8 | **✗ 无此角色/字段**（只有权限表 `canDo`） |
| **发言次数限制** | B §5 `open_chat_quota`；SPEC K10；PHILOSOPHY §3.8"发言次数上限" | **✗**（会议内 `spokeCount` 只计数展示，不设上限） |
| **禁言** | SPEC #20/#21 `meeting_mute/unmute`；B §2 `mute[]`；K10 `mute_list` | **✗**（唯一"禁言"＝表决期全局冻结，`:2878`；且只拦成员发言入口） |
| 消息 **id/发言人/时间/回复目标** | SPEC §7.2「纪要结构」「广播对象」；B §3 引用语义 | **✅** `{id,from,to,kind,text,at,quote/quotes}`；**"回复目标"只用 `quote.ref`**，无独立 reply-to 字段 |
| 状态面板（**总目标/计划/正在执行的子任务**） | OVERSIGHT-TIME §2「院士查看各代理情况」8 项 + §2.3 7 条机制（`roster_overview`/`member_profile`/`inflight_queue`/`context_cost`/`task_topic_link`/`resolution_status`/`handover_pending`） | **部分**：`vibe_v5_overview`（≈roster_overview）＋`vibe_v5_status/report`（≈resolution_status/在飞）＋`vibe_v5_self_report`（**总目标/子目标/计划/状态**，**唯一可写面板**）＋`Progress/*.md`（≈member_profile）＋`task_list`（≈task_topic_link）。**`context_cost` 无独立入口**（`debug.rssMb/memoryCeilingMb/toolCallsPerTurnCap` 在 status.debug）；**`handover_pending` 只在 report/overview 的"行动项"行**；**查看留痕只对 self-report 有**（`Shared/SelfReportViewAudit.json`），overview/status **无审计** |
| **当前时间查询**（OVERSIGHT-TIME §3.1 P1） | 人人可查当前时间 | **✗ 无工具**；成员只能从消息/纪要的时间戳间接看到时间；`fmtTime` 只在框架侧使用 |
| **墙钟 vs 单调时长分离**（§3.3 P3） | 两者都要 | **≈ 全用墙钟**：`now()=Date.now()`；`elapsedMs`、`ms` 都是墙钟差值；唯一的"时长"来自 `ctx.timeout`；**没有单调时钟读数** |
| 类型字段"只使能不驱动" | OVERSIGHT-TIME §1.3（判据句） | **✅ 行为上成立**：`kind` 只决定等级与提示文本，**不自动进阶段**；但**没有"类型注册表/可执行命令集/权限集"三件事的机制层**（`:2225-2231`） |

---

## ⑧ 专章：裁定与待拍板编号索引（跨文档，供目标 2 引用）

- **红线 R1–R10**（`RULINGS.md:74-87`、`docs/02-rulings.md:78-91`）：R1 只推荐不驱动；R2 沉默≠同意；R3 票/发言分离；R4 chair-first；R5 主持不加权；R6 真值不越界；R7 可审计；R8 贴合现实优先；R9 程序性表决未达门槛一律未决；R10 过程判定与结束裁定分离（`RULINGS.md:162-178` 七条正文）。
- **裁定 D1–D10 ＋ D5a**（`RULINGS.md:13-25`）：D1 仅院士主持/代行显式；D2 不设推翻主持＋程序异议留痕；D3 到场与分母；D4 未达=未决＋延长有界；D5 少数意见入档＋复议限胜方；D5a 无胜方可由任一参与者复议；D6 引用边界；D7 分级＋简流程不得产定论；D8 列席/受邀/临时工永不表决；D9 辩论只收敛意见；D10 框架只建议。
- **残余漏洞 G1–G5**（`RULINGS.md:104-111`）：G1 到场退化；G2 决议生效时点（**公告即生效**）；G3 行动项待接手（**永不静默消失**）；G4 同议题会议互斥（**决议类互斥、讨论类可并行**）；G5 代理知情权（**最小必要推送、全文可索取、私聊永不默认转发**）。
- **U3/U4/U5**（`RULINGS.md:113-117`）：U3 不记名后复议门槛**只升不降**；U4 降级出口由院士动议、无人动议默认"取平均并标未定论"；U5 **统一用"同一会议"**（废止"会期"）。
- **GAPS 关键 5 条 K1–K5**（`RULINGS.md:33-41`）：K1 法定人数/缺席语义；K2 少数意见＋复议；K3 动议附议＋议程通过；K4 上次纪要确认＋行动项；K5 程序性动议。
- **矛盾 C1–C7**（`RULINGS.md:93-102`）：C1 沉默语义（**禁止任何折算**）；C2 到场定义；C3 取平均分层；C4 延长有界；C5 主持不额外加权；C6 重复条目 11 处合并；C7 查漏稿元层面三点。
- **SPEC 冲突裁决 K1–K14**（`SPEC.md:117-132`）：K1 命名前缀 `meeting_*`；K2 开会两步（允许 `auto_start` 折叠）；K3 `settling` 阶段＋`meeting_settle` 命令并存；K4 表决入口合并为 3 条；K5 引用是 `meeting_say` 字段；K6 布尔概率轮**由院士发起**（框架只能建议）；K7 `settle` 默认院士；K8 `meeting_stop{scope}` 保留、`scope:'meeting'` 收敛到散会；K9 类型取 B 的 7 类＋可选 `standup/ad_hoc`；K10 采纳 B 的 10 参数（毫秒）；K11 举手＝B 名＋A 语义（队列可见、院士点人、可再次举手）；**K12 表决期间禁止发言**；**K13 两个门槛分层不得混用**；K14 一张任务板＋`origin:meeting:<id>`。
- **SPEC 待拍板 P1–P15**（`SPEC.md:198-257`，前 5 条一次拍板）：P1 命名与别名；P2 类型目录；P3 主持代行（**推荐不允许自动代行**）；P4 会议任务板边界（同板＋origin）；P5 会议决议 vs 真值裁定（平台只收集/计票/广播）；P6 授权默认范围/过期（默认本次会议结束失效＋撤回必广播）；P7 v4 `all-unanimous` legacy（保持 v4 不动）；P8 时长默认（单次 5min/整场 60min/投票 10min/settle 10min；整场沿用 `meetingHardLimitMs`=30min）；P9 兜底边界（只建议＋必须广播）；P10 硬界对院士生效（可显式延长、写事件）；P11 矛盾处置＋纯算术平均；**P12 未投票者公开点名**；P13 引用上限 2/深度 3；P14 兼容与发布口径（只落 v5、旧 state 可选字段、纪要新分区进发布说明）；P15 广播模板固定＋规则 id 可引用。
- **其它文档的待拍板**：A-model 13 条（`A-model.md:316-330`：主持唯一性、默认记名、弃权是否计入、动议附议人数、任务板是否同板、辩论/表决是否两次会、真值边界确认、引用能否跨会议、时长默认、未达门槛处理、静默成员是否计入在册/法定、散会后追加材料、兜底上限）；B-protocol 12 条（`B-protocol.md:291-303`）；C-landing 10 条 ＋ docs/08 同名 10 条（`C-landing.md:154-165`）；VOTING 8 条（`VOTING.md:187-196`）；OVERSIGHT-TIME 8 条（`OVERSIGHT-TIME.md:170-179`）；EXPANSION 8 条（`EXPANSION.md:226-235`）；PHILOSOPHY 11 条（`PHILOSOPHY.md:288-300`）；docs/06 8 条（`docs/06-expansion-mechanisms.md:232-241`）。

---

## ⑨ 专章：可调参数总表（实现层权威：代码默认值＋上下界；文档层建议并列）

**会议专用**
| 键 | 默认 | 界 | 语义/读取点 | 文档对应 |
|---|---|---|---|---|
| `meetingHardLimitMs` | 1800000（30min） | **[300000, 7200000]**（双处钳制） | 会议墙钟硬界、唯一兜底；会议开始时快照 | P8/P10；C-landing 记为 `L980` |
| `meetingWakeRetries` | 5 | **[0, 10]**（整数） | N ⇒ 共 N+1 次尝试；耗尽记 `unreached` | 新机制（K11 相关） |
| `maxParallel` | 3 | `max(1, floor(v))` | 每轮同时唤醒上限（会议/论文/调度共用） | B §6 并发 |
| `activityTimeoutMs` | 120000 | **>0**（≤0 丢弃） | 心跳/idle 窗口；论文看门狗＝2×此值 | `settle_timeout` 近似 |
| `stallAutoMeetingMs` | 360000 | **负值＝关闭**；0 落默认；非有限丢弃 | 静止提示阈值（**旧名，语义已改为"提示"**） | D10 |
| `chatDigestMs` / `chatDigestMax` | 45000 / 12 | >0 / ≥1 | 纯 chat 的批量投递窗口与条数 | — |
| `meetingKeepEvery` | 5 | — | 周期性落盘（当前实现里**没有读取点**，仅参数面保留） | C-landing 记为 `L977` |
| `quorumCap` | 3 | ≥1 | `m = max(1, min(quorumCap, voterCount()))` | K13/门槛单点 |
| `quorumMode` | `m-unanimous` | 枚举 {m-unanimous, all-unanimous}，非法⇒m-unanimous | 结题口径 | P7 |
| `verdictMaxRounds` | 3 | ≥1 | 辩论/复议总轮数上限 | R10/D4 |
| `reconsiderFloor` | 0 | ≥0 | 复议门槛下限（只升不降） | U3 |
| `motionSecondsRequired` | 1 | **≥1 整数（域校验拒）** | 动议附议门槛（读取口径 `motionSecondsRequired()`） | A-model 待拍板 4 |
| `quotesPerMessageMax` / `quoteDepthMax` | 2 / 3 | ≥1 / ≥1 | 引用条数（超限**拒**）/ 深度（超深**折叠**） | P13 |
| `researcherCount` | 3 | ≥0 | 建所研究员数 | — |
| `maxTempPerMember` / `maxTempTotal` | 3 / 12 | ≥1 / ≥1 | 临时工配额 | — |
| `compactThreshold` / `compactAfterRounds` | 66 / 8 | >0 / — | 压缩触发 | — |
| `toolCallsPerTurnCap` / `memoryCeilingMb` / `maxLiveChildren` | 0 / 0 / 0 | **≥0 整数（域校验拒）** | 单回合工具预算（**机器强制**）/ 提示词阈值 / 本所活成员上限（0＝不设） | S25-A/E |
| `resourceSelfCheck` | false | bool | 仅控制是否注入【资源】段 | S25-A |
| `pointerPropagation` | true | bool | 是否注入 S21 头部列表契约段 | S21 |
| `feedback` | `on` | 枚举 {on,off} | 反馈库开关（off ⇒ 注入关闭＋写入具名拒） | — |
| `academician` / `academicianLeads` / `memberMayRejectAssign` | true/true/true | bool | 见 §③、§⑤ | — |
| `staffPersona` | '' | 字符串 | 追加到每个成员 charter 之前的全局人设前缀 | — |
| `provider` / `model` | '' | 字符串 | 空＝继承 office 路由 | — |
| `toolAllow/toolDeny/tempToolAllow/tempToolDeny` | [] | 数组或逗号串 | 成员工具过滤（空 allow 不发射，防 deny-all） | C-46/C-47 |
| `formalVerify` | `off` | 枚举 {off,encourage,require}，非法⇒off | Lean 门禁 | — |
| `lean*`（command/args/timeoutMs/async/initiative/searchPaths/jobsMaxParallel） | lean / [] / 120000 / true / normal / [] / 1 | `leanTimeoutMs ≥1000`；`jobsMaxParallel ≥1`；`initiative ∈ {off,normal,eager}` | 形式化工具链 | — |
| `finalPaper` / `paperFormat` / `paperLanguage` / `paperCompilePdf` / `paperEditor` / `paperLatexCommand` | true / both / zh / true / academician / '' | {both,md,tex} / {zh,en} / {office,academician}（**非法⇒默认**，别名见 `:11542-11552`） | 论文 | — |
| `mathComputation/mathMode/mathEngines/mathTimeoutMs/mathPackages/mathInstallScope` | 来自共享模块 `MATH_PARAM_DEFAULTS`（`mathComputation:'auto'`、`mathMode:'typed+shell'`、超时 ≥1000） | 由 `normalizeMathParams` 归一 | `:1147-1152`、`:9826-9837` | — |

**文档层"建议但实现没有"的参数**：`step_duration`、`mechanism_duration`、`speak_time_per_member`、`vote_window`、`open_chat_quota`、`mute_list`、`settle_timeout`（只被 `recoverStallMs` 近似且**不用于会议**）。

---

## ⑩ 未决问题 / GAPS / 与实现的偏差（逐条）

**A. 目标 2 相关的硬缺口（实现缺，文档有）**
1. `[GAP]` 群管理面全缺：无 `meeting_chat_mode_set`（mode/quota/parallel）、无 `mute/unmute`、无 `hands_set`、无 `speak_order_set/speak_next`、无 `material_submit`、无 `challenge/answer`、无 `taskboard_open`（无 claim_pending 批准点）、无 `request`（休会/延长请求）、无 `leave_of_absence`。
2. `[GAP]` 会期状态机全缺：无 `recess/resume/extend/stop/adjourn`、无 `attendance/roll_call`、无 `agenda_set`、无显式散会命令；会议只有 `round-robin → open-floor → 收束/硬界放弃`。
3. `[GAP]` 类型机制层缺：`kind` 仅 4 值（sync/division/verify-request/solve-vote），文档 7 类（sync/discuss/plan/org/debate/conclusion/paper_design）＋`standup/ad_hoc`；**无类型→机制/命令/权限注册表，无 `recommendFlow`**。
4. `[GAP]` 广播模板缺：D9/`RULINGS §7.2(6)` 要求"根据研究所规则，由于…，故…"＋规则 id 可引用；v5r 的会议收束只写「结束。已解决票 x/y」，投票板收束写细节但**无规则引用格式**。
5. `[GAP]` G4 同议题会议互斥未实现（只有"同一时刻一场会议"）。
6. `[GAP]` 时间标准字段未实现：无"当前时间"查询工具；全用墙钟（无单调时长）；与时区无关（`fmtTime` 用 ISO 去 Z，**未带时区**；文档要求"记录必须带时区"）。
7. `[GAP]` 管理查看面部分缺：`context_cost`、`handover_pending` 无独立入口；overview/status **无查看留痕**（只有 self-report 有）；`member_profile` 只有 `Progress` 末 1200 字符。
8. `[GAP]` 邀请发言语义弱：`meeting_invite` 只有 `why`（理由），文档要求"邀请内容＋邀请是一个整体"（`content/expect/timebox`）。
9. `[GAP]` 行为差异：`meeting_speak_order` 是**随机洗牌固定**（文档允许院士自设/默认自然序）；`meeting_adjourn` 是**框架按判据收束**（文档要求院士显式散会）⇒ 与 R4/D2 存在张力（见 A.10）。
10. `[未决 U-C1]` **"院士显式结束会议"在 v5r 缺失**：`endVerify` 有（R10-2a），但会议**没有**对应的 `end_meeting`；院士只能等"全员获机会＋无人举手/在飞"后由 `continueMeetingRound` 自动收束，或靠硬界放弃。文档 D2/R4/K8 假定存在显式散会/结束辩论动作 ⇒ **需要向 lead 汇报是实现缺口还是"v5r 的有意简化"**（代码注释 `:7604-7612`、`:7639-7666` 表明是有意的两阶段模型；`:7391-7393` v4 §26/§27 沿革）。
11. `[未决 U-C2]` **表决期冻结的解除**只有 `poll_close`/结束会议；成员无法"请求休会/讨论步"（文档 B §5/§6.3 要求"先休会/进入讨论步再开放表决"）⇒ 冻结可能长时间卡住举手队列（举手**保留**但不放行）。
12. `[未决 U-C3]` `meetingKeepEvery` 参数**无读取点**（参数面保留但实现未用）——需与 reader-a（参数/持久化分片）交叉确认是否在别处消费。
13. `[未决 U-C4]` `MATH_PARAM_DEFAULTS` 具体值在 `math-computation.js`（不在本分片范围），`mathTimeoutMs/mathEngines/mathPackages` 的确切默认值需 reader-b/lead 从共享模块补齐。

**B. 文档自身写明的未决/GAPS（供目标 2 引用，按文档）**
- `SPEC.md:373-375`：① #11 发言机会/举手状态机并入期二是否认可；② K9 类型目录是否接受"7 类＋2 可选"；③ 15 条待拍板额度已满。
- `RULINGS.md:27-29`：D2 补齐"程序异议须由主持给出理由"属**新增要求**需确认；D5 收紧"复议限胜方之一"已确认。
- `docs/02-rulings.md:131-134`：留给日后 3 条**已清账**——档案检索（S13 `vibe_v5_resolutions` 部分覆盖）、复议流程细化（S9 主干落地，"窗口/频次"**故意不做**以守 R1/D10）、术语与纪要模板统一（**留待后续切片**）。
- `C-landing.md:40/46/67` 与 `docs/08-landing-plan.md:46/73`：核对 v5（**非 v5r**）源码时 `hands/spokeCount/phase/open-floor` **未找到**（`asked` 计数器是心跳用途，勿误引）⇒ 这些标识符是设计名；**在 v5r 中它们已全部实现**（`:7477`、`:7449`、`:7608`）⇒ 说明 v5r 是这些设计的落地版（时间戳：本分片读到的 v5r 已含 S8–S25 全部切片注释）。
- `OVERSIGHT-TIME.md:6`：该稿写时 `EXPANSION.md` **不存在**（后补）；`架构图.md:3-7` 声明自身是**设计期文档**，与最新功能（math/leanAsync/paperEditor/paper.lock.json）**已不同步**，参数以 `docs/` 为准。
- `GAPS.md` §2 第 2 条提出的"沉默即视为无异议"**被 RULINGS C1 明确禁止**（`RULINGS.md:140`）——这是文档内部已被裁决的冲突，实现侧**正确**（无任何沉默折算路径）。

**C. 与目标 6（主代理是否真是助手）相关的偏差**
- **v5r 的主代理有两层含义**，必须区分：
  1. **office（会话 root）＝助手/外部接口**：`agent.cordis.yml:74-86` 明写不研究、不投票、无库；**但它不是"自动汇报者"**——人格层要求"用户问进度就 `vibe_v5_report` 并平实总结"（`agent.cordis.yml:294-295`），**没有**定时/自动上报机制。
  2. **academician＝所内主代理（领头人）**：人设＝charter（`vibe-math-v5r.js:3131-3361`）＋`staffPersona` 前缀；**有**组织权（overview/assign/prioritize/nudge）与会议主持权，但**一票等重**、**不能自我扩张编制**、**不能改参数**（参数仅 office）。
- **参数配置入口**：只有 office 的 `vibe_v5_configure/set`＋`/v5 set`；academician **无**任何改参入口（`withOffice` 拒 `V5_NOT_OFFICE`，`:11036-11046`）。文档 `OVERSIGHT-TIME §2` 想要的"院士管理模式"在实现里**只读**（overview/status/self_report 读；self_report 可写自己的四项，院士可替他人设 `overall`）。
- **自动汇报的实现现状**：只有 ① 人设层的"主动汇报"文字＋② `progress` 字段落 `Progress/*.md`＋③ 院士 `overview` 主动查看（**由院士自己发起**）＋④ office 的 `report()`。**没有任何定时器/心跳驱动的"自动汇报"消息**（`schedulePass` 的 heartbeat 是"推一把让成员推进"，不是汇报）。

**D. 架构图.md（设计期，需与实现区分）**
- §1 三层（所办/研究所/框架）＋§7 唯一权威状态（加固 JSON，不写宿主会话日志）＋§8 提示词三层（persona 冻结 / 状态块 / 本轮回执契约）＋§10 职权矩阵＋§11 目录树 —— 与 v5r 实现一致（本分片已在 §③–§⑤ 给出逐条行号）。
- **架构图有 3 处与 v5r 不一致**（阅读时勿当现状）：① §5 会议流程写"看门狗：2×activityTimeoutMs 无新发言 → 放弃"，但 v5r **已改为 `meetingHardLimitMs`**（`:1090-1091` 注释明写"旧的 recoverStallMs **不再用于会议**"）；② §6 调度写"停滞 → **自动召集一次同步会议**"，v5r 已改为**只发一次静止提示、绝不自动开会**（`:9305-9319`、`:1576-1587`）；③ §4 共识状态机写"轮次用尽或票不足 m 或 1/0 分歧 ⇒ undecided"，v5r 还多了**形式化门（formalVerify=require ⇒ deferForFormal）**与**sesh 冻结/复议轮**（`:7347`、`:2742-2868`）。架构图 §13 的 README 原文同此。

---

## ⑪ 方法与自检（本分片的可复核性）

- JS 通读区间与读法：`read` 每次 300–510 行，**7290→11597 连续无跳读**（含 11166–11597 的注册面与 test seam）；对分片 A/B 范围内但本专章必需的定义点（`DEFAULT_PARAMS`、权限表、投票板、charter、提示词、selfReport、say/pendingFor、常量）做了**定点回读**，全部给出 `file:line`。
- `agent.cordis.yml` 460 行**全文读完**（1–460）；`preset.yml`（762B）已读。
- 11 份 `MEETING-PLATFORM-*.md` **全部逐行读完**：PHILOSOPHY(304)、A-model(330)、B-protocol(304)、C-landing(165)、DECISIONS(164)、EXPANSION(252)、GAPS(230)、OVERSIGHT-TIME(205)、RULINGS(178)、SPEC(375)、VOTING(220)（括号内为 `read` 口径总行数）。
- `架构图.md` **693 行全文读完**；`docs/02-rulings.md`(201)、`docs/06-expansion-mechanisms.md`(272)、`docs/08-landing-plan.md`(183) 全文读完（注：任务书给的路径是 `docs/02-rulings.md` 等，实际文件在 `vibe-math-v5r/docs/` 下）。
- 工具口径警告：`Get-Content | Measure-Object -Line` 在 CJK 文件上会给出**不同行数**（任务书的 11166 vs `read` 的 11597；`RULINGS.md:147` 与 `docs/02-rulings.md:153` 都专门记录过这个假警报）。本文件一律用 **`read` 工具的行号**。
- 未做/不可做：未运行任何脚本/门禁/`scripts/regen-all.mjs`；未在 `Vibe-Mathematics` 下写入任何文件；临时文件未产生（无需清理）。

<!-- END-C-JS -->


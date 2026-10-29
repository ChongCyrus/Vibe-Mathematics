/**
 * v5r SEAT FACES — 三席（chair / member / temp）的工具面，**显式声明**在这一处。
 *
 * WHY THIS FILE EXISTS (live run 31, task-15). Until this file, the seat's tool face was REVERSE-DERIVED from the prose
 * of the role prompt sections: `prompts/v5r-core.js` collected the `· vibe_v5_…` bullet names out of each section's
 * `text`, and the manifest declared `deny = declared − bullets`. The consequence was mechanical and measured on run 31:
 * the PROMPT became the ACL, and every capability nobody had written a bullet for was silently forbidden — the chair
 * seat could not tally a ruling (`vibe_v5_verdict_final`), ask for rulings (`verdict_ask`), advance a meeting round
 * (`meeting_round`), adopt a blueprint (`blueprint`), promote into Verified/ (`verified_promote`) or close fidelity
 * (`fidelity_conclude`); the temp seat could not run Lean at all even though rule 10.3 says all three seats may; the
 * permanent researcher was denied `task_get` and `second`.
 *
 * THE RULE (rule 11.2: 越权/规则不靠提示词): a prompt is written for a HUMAN to read; the mechanism is what a machine
 * executes. So the direction is now DECLARATION → BOTH:
 *   ① `SEAT_TOOL_FACES` below is the ACL: one row per pack tool, one decision per seat, each with the v5r rule it rests
 *      on and the reason — including the reason for every DENIAL.
 *   ② `deny = declared(v5r) − allow(seat)` is computed from those decisions (`seatFaces`), so a newly declared tool is
 *      denied to every seat until somebody adds a row (fail-closed, and the missing row is reported BY NAME by
 *      `seatTeachingCatalogue`, not swallowed).
 *   ③ the prompt bullets are rendered from `SEAT_TEACHING` (`seatBulletLines`), and the two halves are compared
 *      BIDIRECTIONALLY in `tests/vmu-run31-seat-faces.test.mjs`: a name a seat may call but the prompt never teaches is
 *      a drift, and a taught name the seat may not call is the same drift in the other direction.
 *
 * ★ A7/A8 (two audit gaps fixed, still one row each): (A7) the member may now call `vibe_v5_fire` — the rule hires temp
 * workers from BOTH the academician and the permanent researcher, and a seat that can hire but cannot dismiss makes hiring
 * irreversible; (A8) the temp seat no longer writes the institute's research-conclusion libraries (`record_proposition` /
 * `record_progress` / the five `lean_*` / `paper`) — a temp worker only does the assigned temporary task and reports on its
 * task receipt, while its READ faces (`read_library` / `inbox` / `task_get`) stay untouched.
 *
 * WHY THE TABLE IS EXPLICIT AND NOT DERIVED FROM THE TOOL BODIES: a reader must be able to answer "may a member call
 * this, and why not?" by reading ONE line. The handler-level guards (`requireChairSeat`, `requireVoter`) are NOT a
 * substitute: they check the `member` ARGUMENT inside the call (which the model supplies), while the face gate checks the
 * REAL caller resolved from the turn (`host-pack-tools.js#resolveTurnMember`). Measured on live run 29 and reasoned in
 * `member-scope.js`: a tool body that reads `args.member` cannot tell a member impersonating the chair from the chair.
 * The seat face is therefore the only non-forgeable check, which is why it has to be declared here and nowhere else.
 *
 * DEPENDENCY-FREE ON PURPOSE (the same reason as `member-scope.js`): `tools.js` must not be imported here, or the ESM
 * cycle would evaluate the derived arrays before the tool catalogue exists. Every function below takes the declared
 * name list as an ARGUMENT, and `prompts/v5r-core.js` hands in its own.
 */

/** The three seat vocabularies the KERNEL uses (not display names): `tools/turn.js` sets `role: m.slot`. */
export const SEAT_IDS = Object.freeze(['chair', 'member', 'temp'])

/**
 * THE SEATS WHOSE WIRE `applyMemberScope` MAY NARROW — and the one it may NOT.
 *
 * `member-scope.js` was written before this table existed, and it narrowed EVERY hired seat with
 * `allow: MEMBER_SAFE_TOOLS`. `kernel/memberface.js#faceGate` treats an `allow` array as the whole truth (it stops reading
 * `deny`), so that override did two things at once on live run 31: it cut the CHAIR seat down to the member line (no
 * `verdict_final` / `verdict_ask` / `verified_promote` / `report`) and it WIDENED the same seat with `vibe_v5_message`.
 * That is the measured reason the office appeared to "do the ruling for the academician".
 *
 * So the chair is NOT governed: its capability is exactly `SEAT_TOOL_FACES.chair` below, declared here and executed by the
 * kernel's face gate. The other two seats are governed, and the override now pushes a DENY list derived from this table
 * (never an `allow` list) — a deny list can only ever NARROW, so the member line cannot grow a face by accident.
 */
export const SEAT_GOVERNED_SLOTS = Object.freeze(['member', 'temp'])

/** What each seat IS, so a reader of a row does not have to look it up (rule 1: 成员分层). */
export const SEAT_VOCAB = Object.freeze({
  chair: '院士席位（主席席）：召集与推进会议、汇总裁决、采纳蓝图、升 Verified、保真收口',
  member: '常驻研究员席位：主张、记录、通信、辩论与表决、形式化、论文',
  temp: '临时成员席位：被指派做工，可发言、就地更新任务、读别人的成果库与收信；无表决权、不召集会议、不招人，也不往所里的研究结论库写卡（命题／进展／Lean／论文）',
})

/**
 * THE RULE INDEX — every `rule:` below must be a key of this table (the test refuses a row that cites nothing).
 *
 * The titles are the v5r rules as indexed by the run-31 conformance review (`D:/_tmp/r31/prompt-conformance.md`), so a
 * row's citation can be checked against the rule it claims. Sub-numbers are kept where the reviewed text named them.
 */
export const RULE_INDEX = Object.freeze({
  '1': '成员分层：院士／研究员／临时工权责分级',
  '2': 'Verified/ 可信：定论与可复现的信任轨',
  '3': '蓝图：总目标／规划／技术路线／当前小任务',
  '4': '研究员私有成果库（每人自己的命题/方法/子问题/进展/反馈）',
  '5': '交流渠道：群聊／私信／邮箱／状态板／人工干预',
  '6': '会议：类型／召集／关闭·延长／连排（谁推进轮次）',
  '7.1': '开会的发起人：开会与选对象必须院士本人',
  '8.1': '独立初评：三席都要交自己的裁决（临时工无表决权）',
  '8.2': '按会议 TYPE 推进轮次并收窄工具面',
  '8.3': '裁决汇总：主席席发裁决请求、并落成最终裁决',
  '9': '论文：start→part→advance→review→render 由工具推进',
  '10': '基础设施：python／Lean／LaTeX／并发／断点续跑／请示',
  '10.3': 'Lean 五工具三席可用',
  '11': '反脆弱：失败回滚、越权不靠提示词、禁言、自反馈',
  '11.2': '越权与规则由机制执行，不靠提示词自觉',
})

/**
 * ONE ROW PER PACK TOOL — the ACL.
 *
 *   rule   —— the v5r rule this row rests on (keys of RULE_INDEX; several may be cited)
 *   why    —— WHY the seats are split the way they are, including why each denied seat is denied
 *   allow  —— one boolean per seat. `false` is a decision with a reason, never an omission.
 */
export const SEAT_TOOL_FACES = Object.freeze({
  // ── 自己的成果库（每条都以调用者自己的名册 id 落到 owner）────────────────────────────────────────────
  vibe_v5_record_progress: Object.freeze({
    rule: '4',
    why: '规则 4 私有成果库：院士与常驻研究员各自写自己的进展轨（「院士、常驻研究员各自的文件」）；'
      + 'A8——临时工只做被指派的临时任务，不往所里的库写研究结论，它的本轮结果用 task_update 落在分给它的那张任务上，故 temp 不给',
    allow: Object.freeze({ chair: true, member: true, temp: false }),
  }),
  vibe_v5_record_proposition: Object.freeze({
    rule: '4, 10.3',
    why: '规则 4 ＋ 10.3：命题卡是研究与裁决的对象，「谁主张了什么、p 是多少」要留在院士与常驻研究员各自的库里；'
      + 'A8——临时工只做被指派的临时任务，不往所里的库写研究结论（它在任务里得到的观察走 task_update 汇报，不自己立卡），'
      + '故 temp 不给；方法卡与子问题卡同样不给临时工',
    allow: Object.freeze({ chair: true, member: true, temp: false }),
  }),
  vibe_v5_record_method: Object.freeze({
    rule: '4',
    why: '方法卡是常设席的成果库（规则 4）；临时工是列席做工，不建方法库——与临时工提示词的现有措辞一致',
    allow: Object.freeze({ chair: true, member: true, temp: false }),
  }),
  vibe_v5_record_subproblem: Object.freeze({
    rule: '3',
    why: '子问题卡是「当前小任务」的规划物（规则 3）；临时工不承担规划，它只是被指派的一方',
    allow: Object.freeze({ chair: true, member: true, temp: false }),
  }),
  // ── 交流 ──────────────────────────────────────────────────────────────────────────────────────────────
  vibe_v5_say: Object.freeze({
    rule: '5',
    why: '规则 5：群聊（省略 to）与私信（to＝成员 id，kind 由工具体定为 dm）是同一件 say 的两种形状，发言者取调用者本人⇒三席都有说话与私信权',
    allow: Object.freeze({ chair: true, member: true, temp: true }),
  }),
  vibe_v5_message: Object.freeze({
    rule: '5, 11.2',
    why: '规则 5 的「转达/邮箱」面，但它以所办口吻替别人发信：sender 取 `args.member || "office"` 且【不校验调用者】'
      + '（kit/handlers.js:352），给任何席位就等于让它以任何人的名义发信。规则 11.2 要求越权由机制挡 ⇒ 只给院士席'
      + '（它本来就承担转达所办口吻的职责）；席位之间的私信走 say{to}，不经过这一面',
    allow: Object.freeze({ chair: true, member: false, temp: false }),
  }),
  vibe_v5_inbox: Object.freeze({
    rule: '5',
    why: '规则 5：收信三席都要能收（列表／打开／标记），没有它席位就收不到裁决请求与督办',
    allow: Object.freeze({ chair: true, member: true, temp: true }),
  }),
  vibe_v5_wait: Object.freeze({
    rule: '5',
    why: '规则 5：等回信是收信方的正常动作；提示词明写「不要用反复轮询」，靠的就是这一面',
    allow: Object.freeze({ chair: true, member: true, temp: true }),
  }),
  // ── 状态板 ────────────────────────────────────────────────────────────────────────────────────────────
  vibe_v5_task_create: Object.freeze({
    rule: '5',
    why: '规则 5 的状态板：新开工作项是院士与常驻研究员的职责；临时工只就地更新分给它的那一张（见 task_update 行），不新开工作项',
    allow: Object.freeze({ chair: true, member: true, temp: false }),
  }),
  vibe_v5_task_list: Object.freeze({
    rule: '5',
    why: '规则 5：看板是每个席位都知道「现在有什么在办」的唯一入口',
    allow: Object.freeze({ chair: true, member: true, temp: true }),
  }),
  vibe_v5_task_get: Object.freeze({
    rule: '5',
    why: '规则 5：读一张任务卡（只读）是「分给我的是哪张、接受标准是什么」的答案。run31 实测三席里只有它被 deny 掉，'
      + '于是一个席位只能看列表、看不到自己那张的接受标准——这是提示词漏写 bullet 造成的面，不是任何规则的意思',
    allow: Object.freeze({ chair: true, member: true, temp: true }),
  }),
  vibe_v5_task_update: Object.freeze({
    rule: '5',
    why: '规则 5：认领/完成/重开就是「就地更新分给我的那张」，三席都要能（临时工的全部任务职责就是这一面）',
    allow: Object.freeze({ chair: true, member: true, temp: true }),
  }),
  // ── 名册（用人权）──────────────────────────────────────────────────────────────────────────────────────
  vibe_v5_hire: Object.freeze({
    rule: '1',
    why: '规则 1 的分层：用人权在院士与常驻研究员（工具体 toolHire 只开 temp 席，其余席位具名拒）；临时工不能给自己再招人',
    allow: Object.freeze({ chair: true, member: true, temp: false }),
  }),
  vibe_v5_fire: Object.freeze({
    rule: '1',
    why: '规则 1 的用人分层（A7）：院士与常驻研究员都能解雇临时工（临时工只由这两类席位雇佣）——'
      + '院士统筹全所用人，常驻研究员解雇自己雇的那名临时工（雇了却辞不掉，等于把「雇」变成不可撤销）。'
      + '工具体只要求调用者是常设席（临时工不能辞退任何人）；回执负责把未完成任务转 cancelled 并说明',
    allow: Object.freeze({ chair: true, member: true, temp: false }),
  }),
  // ── 脚本轨 ────────────────────────────────────────────────────────────────────────────────────────────
  vibe_v5_script: Object.freeze({
    rule: '10, 11.2',
    why: '脚本面（archive/read/list）是机构的运行记录，不是任何席位在本回合的职责；v5r 的临时脚本执行本来就被'
      + 'VMU_PACK_V5R_CORE_NO_ADHOC_SCRIPTS 具名拒，且现行三席提示词一次也没教过它。规则 10 的「断点续跑」由控制面'
      + '与耐久投影承担，不靠席位自己翻脚本 ⇒ 三席全 deny；若院士需要归档续跑脚本，这是 SEAT_PENDING_RULINGS 里的一条单独裁决',
    allow: Object.freeze({ chair: false, member: false, temp: false }),
  }),
  // ── 机构读数与运行控制（所办口吻/机构级）──────────────────────────────────────────────────────────────
  vibe_v5_report: Object.freeze({
    rule: '1',
    why: '规则 1：人类可读的所内汇报是机构级读数，属于院士席（member-scope 也把它判为 office-only：那是「机构」而非「席位」的授权主体）',
    allow: Object.freeze({ chair: true, member: false, temp: false }),
  }),
  vibe_v5_overview: Object.freeze({
    rule: '1',
    why: '规则 1：全局视图（名册/任务板/会议/成果）是机构级读数；工具体自己的描述就写明「只有院士席位可以调用」，声明必须与工具体一致',
    allow: Object.freeze({ chair: true, member: false, temp: false }),
  }),
  vibe_v5_tool_help: Object.freeze({
    rule: '11.2',
    why: '规则 11.2：让席位能自查「我现在能用什么」——清单取自内核自己的 packTools 声明，是机制可见性，不是权限',
    allow: Object.freeze({ chair: true, member: true, temp: true }),
  }),
  vibe_v5_feedback: Object.freeze({
    rule: '11',
    why: '规则 11 的自反馈面：工作经验/流程反馈库是机构记忆，由院士与常驻研究员写；临时工是临时的，不写机构记忆',
    allow: Object.freeze({ chair: true, member: true, temp: false }),
  }),
  // ── 督办与分派（院士席职责）────────────────────────────────────────────────────────────────────────────
  vibe_v5_assign: Object.freeze({
    rule: '1',
    why: '规则 1：分派（任务＋接受标准）是院士席的督办职责；常驻研究员自己领任务，不替别人分派',
    allow: Object.freeze({ chair: true, member: false, temp: false }),
  }),
  vibe_v5_nudge: Object.freeze({
    rule: '1',
    why: '规则 1：督办（唤醒某人并给出理由与建议的下一步）是主席席的推进手段',
    allow: Object.freeze({ chair: true, member: false, temp: false }),
  }),
  vibe_v5_prioritize: Object.freeze({
    rule: '1',
    why: '规则 1：全所优先级是机构级决定，只有院士席能定',
    allow: Object.freeze({ chair: true, member: false, temp: false }),
  }),
  // ── 读别人的成果库 ─────────────────────────────────────────────────────────────────────────────────────
  vibe_v5_read_library: Object.freeze({
    rule: '4',
    why: '规则 4 明确要求「可查看他人」：只读面，三席都要能读别人的卡（辩论与互审的前提）',
    allow: Object.freeze({ chair: true, member: true, temp: true }),
  }),
  // ── 会议与辩论 ─────────────────────────────────────────────────────────────────────────────────────────
  vibe_v5_meeting: Object.freeze({
    rule: '7.1, 6',
    why: '规则 7.1：开会与选对象必须是院士本人（工具体 requireChairSeat）；非院士席没有 propose 路径，回执会具名说明这一点',
    allow: Object.freeze({ chair: true, member: false, temp: false }),
  }),
  vibe_v5_meeting_round: Object.freeze({
    rule: '6, 8.2',
    why: 'run31 的核心缺陷：推进轮次（按会议 TYPE 收窄各席工具面再请在场席位发言）是主席席的动作，'
      + '而工具体【没有】席位闸——它只收窄别人的面。所以「谁能推进」只可能由声明回答，此前被 deny 掉等于会议永远停在第一轮，'
      + '任何席位也没法代劳（8.2 的收窄只对发言席位生效）',
    allow: Object.freeze({ chair: true, member: false, temp: false }),
  }),
  vibe_v5_motion: Object.freeze({
    rule: '8.1',
    why: '规则 8.1：动议是表决者的动作（工具体 requireVoter，临时工具名拒）；撤回自己的动议同样在这一面',
    allow: Object.freeze({ chair: true, member: true, temp: false }),
  }),
  vibe_v5_second: Object.freeze({
    rule: '8.1',
    why: 'run31 缺陷：附议是常设席的动作（requireVoter 允许常驻研究员，只有提案人不能附议自己）；'
      + '提示词一直在散文里教「附议」，bullet 里却只有 motion——于是「提了动议没人能附议」，动议永远停在 proposed',
    allow: Object.freeze({ chair: true, member: true, temp: false }),
  }),
  vibe_v5_poll_open: Object.freeze({
    rule: '6',
    why: '规则 6：开票是召集方的动作（工具体 requireChairSeat）；常设席投票、主席席关票',
    allow: Object.freeze({ chair: true, member: false, temp: false }),
  }),
  vibe_v5_poll_vote: Object.freeze({
    rule: '8.1',
    why: '规则 8.1：只有常设席有票权，列席/受邀/临时工无票权（requireVoter 具名拒 temp）',
    allow: Object.freeze({ chair: true, member: true, temp: false }),
  }),
  vibe_v5_poll_close: Object.freeze({
    rule: '6',
    why: '规则 6：关票计票是主席席的动作（requireChairSeat）；min_votes 未达时回执要说明「不成立」而不是静默通过',
    allow: Object.freeze({ chair: true, member: false, temp: false }),
  }),
  vibe_v5_verdict: Object.freeze({
    rule: '8.1',
    why: '规则 8.1：独立初评＝每一名有票权的席位都交自己的 [0,1] 裁决；临时工无表决权（规则 1），这是规则允许的差别',
    allow: Object.freeze({ chair: true, member: true, temp: false }),
  }),
  vibe_v5_verdict_final: Object.freeze({
    rule: '8.3',
    why: 'run31 缺陷：汇总裁决的签名者是会议主席（工具体比对 view.chair，非主席一律 VMU_NOT_PERMITTED）；'
      + '声明此前把它 deny 掉，于是「各席位交完裁决、由谁落成」这个链条在最后一步断掉。给主席席＝把工具体自己的规则搬到声明里',
    allow: Object.freeze({ chair: true, member: false, temp: false }),
  }),
  vibe_v5_verdict_ask: Object.freeze({
    rule: '8.3, 11.2',
    why: 'run31 缺陷：请各辩论席位交「布尔概率＋理由」是主席席的动作。这一面以主席名义发信、工具体只校验参数里的 member，'
      + '【不校验调用者】——member-scope.js 因此把它判为 office-only。现在调用者的校验由本声明承担（只有 chair 席能过 faceGate），'
      + '机制上比 member-scope 的「藏起来」更强：非主席调用得到 VMU_TOOL_NOT_IN_FACE 的具名拒，而不是一个看不见的名字',
    allow: Object.freeze({ chair: true, member: false, temp: false }),
  }),
  // ── 可信轨（单写者）────────────────────────────────────────────────────────────────────────────────────
  // ★ Lead 裁决（round 31，第 5 条「pending」的裁决）：只给院士席。成员/临时工的正当入口是
  // `vibe_v5_record_proposition`（写自己的卡）+ 辩论裁决；`verified_promote` 是**收口**动作。
  vibe_v5_verified_promote: Object.freeze({
    rule: '2',
    why: '规则 2：升 Verified/ 是机构的信任动作。规则把「Lean 通过后由辩论核描述是否符合原意、符合即概率=1 并允许入 verified」'
      + '整条工序交给辩论与院士 ⇒ 收口权在主席席。verified 轨只有一个写入口（verified.js:426 的 promoteVerified，'
      + '由 verification-gates.singleWriter 只放行 writer:"promoteVerified"），机制没破；但「谁说了算」不能滑到自查自升：'
      + 'member 的正当入口是 record_proposition 写卡 + 辩论裁决（temp 按 A8 连卡都不写，只交任务回执），verified_promote 是收口动作，故 member/temp 皆 deny。'
      + '[Lead ruling, round 31: chair allow, member deny, temp deny]',
    allow: Object.freeze({ chair: true, member: false, temp: false }),
  }),
  vibe_v5_fidelity_conclude: Object.freeze({
    rule: '10',
    why: '规则 10：保真收口（Lean 通过 ≠ 命题为真，要写清「代码里的命题/定义是否与所需一致」）是收口判决，'
      + '工具体 requireChairSeat；此前被 deny 掉等于「形式化做完了却没人能收口」',
    allow: Object.freeze({ chair: true, member: false, temp: false }),
  }),
  // ── 蓝图 ──────────────────────────────────────────────────────────────────────────────────────────────
  vibe_v5_blueprint: Object.freeze({
    rule: '3',
    why: '规则 3：蓝图是「总目标/规划/技术路线/当前小任务」的机构级规划面。工具体把 propose 开放给任何 live 席位、'
      + 'adopt 只给主席席（BLUEPRINT_ADOPT_SLOT）⇒ 声明照抄这条分工：院士席可读/提案/落成，常驻研究员可读/提案；'
      + '临时工不参与规划',
    allow: Object.freeze({ chair: true, member: true, temp: false }),
  }),
  // ── 机构运行控制面 ────────────────────────────────────────────────────────────────────────────────────
  vibe_v5_start: Object.freeze({
    rule: '10',
    why: '规则 10：建所/启动走内核自己的控制状态，是机构级控制面（只在院士席；member-scope 也判 office-only——见'
      + 'seatFaceReconciliation 里记录的两轴冲突）',
    allow: Object.freeze({ chair: true, member: false, temp: false }),
  }),
  vibe_v5_stop: Object.freeze({
    rule: '10',
    why: '规则 10：停机把整所从运行态推到停止态，会终结所有席位正在跑的轮次——这是机构级后果，不是任何席位的本回合诉求；'
      + '因此只在院士席（member-scope 亦判 office-only）。临时工/常驻研究员若需要停，走规则 10 的「请示」而不是自己按开关',
    allow: Object.freeze({ chair: true, member: false, temp: false }),
  }),
  vibe_v5_pause: Object.freeze({
    rule: '10',
    why: '规则 10：暂停冻结全会话的推进（连排/会议进行中尤其如此），属于所长的调度权；席位自己暂停等于给自己发明一个'
      + '「不受轮次约束」的状态，所以只在院士席，其余两席靠 turn 边界自然停',
    allow: Object.freeze({ chair: true, member: false, temp: false }),
  }),
  vibe_v5_resume: Object.freeze({
    rule: '10',
    why: '规则 10：继续（走控制面而不是耐久投影）与暂停对称——谁能停谁才能开，所以只在院士席；'
      + '其它席位恢复工作的方式是等 turn 推进，而不是改机构控制状态',
    allow: Object.freeze({ chair: true, member: false, temp: false }),
  }),
  vibe_v5_configure: Object.freeze({
    rule: '10',
    why: '规则 10：改已声明设置键是机构级参数面（院士席）；成员的参数诉求走请示而不是自己改',
    allow: Object.freeze({ chair: true, member: false, temp: false }),
  }),
  vibe_v5_set: Object.freeze({
    rule: '10',
    why: '规则 10：同 configure——参数面写的是机构，不是席位',
    allow: Object.freeze({ chair: true, member: false, temp: false }),
  }),
  // ── 形式化（Lean）─────────────────────────────────────────────────────────────────────────────────────
  vibe_v5_lean_run: Object.freeze({
    rule: '10.3',
    why: 'A8：Lean 面是形式化产出落到所里 Lean 库的写入口（编译产物、归档、库登记），不是临时工的临时任务面——'
      + '临时工只做被指派的临时任务，不往所里的库写研究结论，故 temp 不给；院士与常驻研究员仍全开。'
      + '（规则 10.3 的三席可用是「形式化可以跨席分工」，本条只回答 temp 能否自己往 Lean 库落东西）',
    allow: Object.freeze({ chair: true, member: true, temp: false }),
  }),
  vibe_v5_lean_job: Object.freeze({
    rule: '10.3',
    why: '规则 10.3：查作业状态，跑形式化的席位都要能查——A8 起跑形式化的只有院士与常驻研究员；'
      + '临时工只做被指派的临时任务，不往所里的库写研究结论，它没有形式化作业要查，故 temp 不给',
    allow: Object.freeze({ chair: true, member: true, temp: false }),
  }),
  vibe_v5_lean_lib: Object.freeze({
    rule: '10.3',
    why: '规则 10.3：看本所 Lean 库是形式化的公共读数面，A8 起随 Lean 面只给院士与常驻研究员；'
      + '临时工只做被指派的临时任务，不往所里的库写研究结论，它的读面是 read_library／inbox／task_get，不需要 Lean 库这一面',
    allow: Object.freeze({ chair: true, member: true, temp: false }),
  }),
  vibe_v5_lean_read: Object.freeze({
    rule: '10.3',
    why: '规则 10.3：读既有 .lean 文件——A8 起随 Lean 面一起只给院士与常驻研究员；'
      + '临时工只做被指派的临时任务，不往所里的库写研究结论（三席共同的读面是 read_library，不是 Lean 源码库）',
    allow: Object.freeze({ chair: true, member: true, temp: false }),
  }),
  vibe_v5_lean_archive: Object.freeze({
    rule: '10.3',
    why: '规则 10.3：归档（def/lemma/proof/blocked）是形式化产出落到所里 Lean 库的落地动作；'
      + 'A8——临时工只做被指派的临时任务，不往所里的库写研究结论，故 temp 不给',
    allow: Object.freeze({ chair: true, member: true, temp: false }),
  }),
  // ── 论文 ──────────────────────────────────────────────────────────────────────────────────────────────
  vibe_v5_paper: Object.freeze({
    rule: '9',
    why: '规则 9：论文流程由工具推进，而阶段合法性与席位权限由内核判（final 只接受 chair 席，其余阶段面向作者）'
      + '；A8——论文是研究结论的对外产出，临时工只做被指派的临时任务，不往所里的库写研究结论，故 temp 不给，作者面只给院士与常驻研究员',
    allow: Object.freeze({ chair: true, member: true, temp: false }),
  }),
})

/**
 * THE TEACHING LINES — what each seat's prompt bullet list says.
 *
 * One entry per line, `names` plus the wording; the line is rendered as `· a / b / c —— text` (the wording is written
 * for a human and is NOT parsed back into the ACL — the ACL is `SEAT_TOOL_FACES` above). `framework: true` marks a line
 * that teaches a FRAMEWORK face (`vibe_vmu_*`): those are not narrowed by this pack, so they carry no ACL decision.
 *
 * The wording of the lines that already existed is copied from `prompts/v5r-core.js` verbatim, so this refactor does not
 * rewrite the institution's voice; the new lines are the ones the declared grants need.
 */
export const SEAT_TEACHING = Object.freeze({
  chair: Object.freeze([
    { names: ['vibe_v5_record_progress'], text: '写你自己的研究日志（track 可选 progress/routes/obstacles/rejected/state；证伪的路走 rejected，阻塞走 obstacles）。★ 传 member:"<你的 id>"——不传的话这条日志的作者是 unknown，状态板认不出是谁的。' },
    { names: ['vibe_v5_record_proposition'], text: '写命题卡（statement、value、motive、p 四项必填；p 是你对它为真的概率，未定稿可以先写，草稿不会被当成已验证）。' },
    { names: ['vibe_v5_record_method'], text: '写方法卡（content、value、motive、p 四项必填）。' },
    { names: ['vibe_v5_record_subproblem'], text: '写子问题卡（statement、value、motive、p 四项必填）。' },
    { names: ['vibe_v5_say'], text: '在群里说一句（省略 to）；to 填成员 id 即私信；填 meeting 则记进那场会议的发言。发言者必须是你自己的真名册 id。' },
    { names: ['vibe_v5_message'], text: '以「所办/人类」的口吻给所内转达消息（to 可为成员 id、all 或 voters）。' },
    { names: ['vibe_v5_task_create', 'vibe_v5_task_list', 'vibe_v5_task_update'], text: '建任务、看任务板、按修订号更新任务（认领/改派/完成/重开/改依赖）。' },
    { names: ['vibe_v5_task_get'], text: '按 id 读一张任务卡（状态、接受标准、指派人、修订号）——看板只给列表，接受标准在这一面。' },
    { names: ['vibe_v5_hire'], text: '招一名临时成员（需要 purpose 与 initial_task；会把人放进 temp 席并按需建一张任务）。' },
    { names: ['vibe_v5_report'], text: '生成一份人类可读的所内报告（编制、任务板、会议、成果计数）。' },
    { names: ['vibe_v5_overview'], text: '所内全局视图（名册、任务板、会议、成果与在办状态）；只有院士席位可以调用。' },
    { names: ['vibe_v5_assign'], text: '分派：把一张任务（task_id）或新建的一张（subject）交给某成员，必须写明 why 与 acceptance。' },
    { names: ['vibe_v5_fire'], text: '辞退一名成员（成员面 end ＋ 其未完成任务转 cancelled；邮件不会被清理，回执会说明）。' },
    { names: ['vibe_v5_nudge'], text: '督办：唤醒某成员并给出理由与一个具体建议的下一步。' },
    { names: ['vibe_v5_prioritize'], text: '设定全所优先级（有序的 {task_id, priority} 列表 ＋ why）：带 priority 的条目会真改任务板的优先级（比较并交换），回执逐条报 from→to；不带 priority 的条目只归档顺序、不改任务。' },
    { names: ['vibe_v5_feedback'], text: '工作经验／流程反馈库（不是研究结论）：op=add/update/list。' },
    { names: ['vibe_v5_read_library'], text: '读任何人的成果库（只读）。' },
    { names: ['vibe_v5_tool_help'], text: '回答"我现在能用什么"：清单取自内核自己的声明（packTools），并报告宿主可见计数。' },
    { names: ['vibe_v5_meeting'], text: '召集会议（规则 6·会议；院士席；agenda 必填，type=ordinary/academic/debate/closure/paper/planning 之一，辩论用 debate 且 subject 必须是命题卡（须含已写完的正式证明/证伪，或已通过的 Lean 作业 / verified 定论行）、或可读的证明文件引用；一句话命题**不是**合法对象（召集时具名拒 `VMU_PACK_V5R_DEBATE_SUBJECT_NO_PROOF`）；legacy 的 kind 词表仍被接受）。原版还能由非院士席"提议开会"，本面没有 propose 路径，回执会具名说明。`at` 可预约：填 epoch 毫秒或 ISO-8601 时间（如 "2026-10-24T10:00:00+08:00"），未来的时间把会议放进 scheduled 状态——status/summary/meetingView 立刻可读，但开始时间之前任何动作都被内核**具名拒绝**；到点后按法定人数转 open，人不够就进等待阶段（迟到者 attend 凑满的那一次触碰让会议开始），到点判定由内核在每次 `beat()` 的 sweep 里结算（框架没有定时器，没人 beat 的进程不会自己醒）。连排多场：`sequence` 数组一次召集多场（逐项校验，每场可给各自的 at/title/type，回执读 sequence.index/total/next）；也可以给每场各自 `at` 逐场召集。' },
    { names: ['vibe_v5_meeting_round'], text: '推进会议轮次：按这场会议的 TYPE 收窄各发言席位的工具面，然后请在场席位发言（你作为主席席不会被放进发言名单）；轮次的推进只由主席席发起。' },
    { names: ['vibe_vmu_meeting'], framework: true, text: '会议的读与收束（规则 6·会议；与召集是同一场会议对象的另一面）：action="status"／"summary"／"minutes" 读状态、纪要与逐字发言。action="close" 收束——`vmu.meetings.closeRequiresChair` 为真，**必须**给出 `actor`（或 `by`／`member`）且必须等于本场主席：缺了或填错，内核具名拒 `VMU_NOT_PERMITTED` 并提示可以传 actor；给对了回执带 closureVote／closureVoteNote，并说明收束落档的去向。action="extend" 按 `speechExtendMs` 延长**发言**、action="extendlimit" 按 `extendCeilingMs` 延长**会议墙钟上界**（两个上界两个面，ms 为 0 时具名拒）。★ 注意 `extend`／`silent`／`end`／`hands` 是 **primitive** 会面的原语：在 `vibe_v5_meeting` 开的 SERVICE 会议上它们会被具名拒 `VMU_REGISTRY_BOUNDARY`（R104 实测），此时成员的发言界读 `vibe_v5_say` 回执里的 `speechBound`，不要拿 `extend` 去排查 id。超过 `vmu.meetings.hardLimitMs` 之后才允许 action="lapse" 有界收束（未到上限具名拒，回执带可撤销标记），revokelapse 恢复必须给理由。★ 本面是内核原语的会议面：用它 action="open" 开的会议落在 PRIMITIVE 注册表，`vibe_v5_say`／`vibe_v5_verdict_final` 寻址不到它（会具名拒并给可执行 hint），close 也不进 service archive；读它的 status 会带 registry:"primitive"。★ 规则会议（两条裁决书里的规则 6）只用 `vibe_v5_meeting` 召集——那是 SERVICE 注册表，也是 say／verdict_final／close 寻址的那张表。' },
    { names: ['vibe_vmu_human'], framework: true, text: '人工在环的**读**（规则 11·反脆弱）：action="queue" 看待批队列、action="approvalState" 查某张审批（requestId）的状态、action="dashboard" 看观察者视图。若所办在 `vmu.human.gatedActions` 里声明了闸门，被闸动作在获批前**不执行、只排队**（回执具名 `VMU_HUMAN_APPROVAL_PENDING` 带 requestId），超时按 `vmu.human.onTimeout`（默认 hold，绝不放行）。这是**人类**的决定权（经所办转达）：你不要自批；需要权限就把事由写清楚交给所办向用户请示。' },
    { names: ['vibe_vmu_chat'], framework: true, text: '群聊治理（规则 5·交流渠道；只有 `vmu.chat.admins` 里的管理员能做，本所默认只给院士席位（`chair`），其他席位调用即具名拒 `VMU_CHAT_NOT_ADMIN`）：action="mute"／"unmute" 禁言与解禁（`durationMs` 是相对毫秒，填 0 或省略则取 `vmu.chat.muteDefaultMs`，默认 0＝不过期）；action="quota" 设每窗发言上限（0＝不限）、action="setpolicy" 改 admins／speakQuota／speakQuotaWindowMs／muteDefaultMs 等**已声明**的键，未声明的键具名拒；所有管理动作必须带 `by`（匿名会被拒，谁做的要可审计）。被禁言或超配额时的发言具名拒 `VMU_CHAT_MUTED`／`VMU_CHAT_QUOTA_EXCEEDED`，不会静默吞掉。' },
    { names: ['vibe_v5_motion', 'vibe_v5_second'], text: '在会中提动议（kind=topic/procedural/resolution；需给 meeting）／附议（需 meeting+motion_id；提案人不能附议自己）；op:"withdraw" 可撤回自己的动议。' },
    { names: ['vibe_v5_poll_open'], text: '开选项投票（院士席）：question ＋ ≥2 个 options；§7.1 的逐票规则本内核只能在构造期设，所以回执会把"要了但没生效"的规则列在 unapplied。' },
    { names: ['vibe_v5_poll_vote'], text: '在已开的选项投票上投票（只有常设席有票权；列席、受邀、临时工无票权 → 具名拒）。' },
    { names: ['vibe_v5_poll_close'], text: '关票计票（院士席）；min_votes 未达时本次投票【不成立】，且具名说明它不是法定人数。' },
    { names: ['vibe_v5_verdict'], text: '对验证对象投 [0,1] 的裁决（1=真、0=假、中间=不确定估计），target 是进行中票箱的 id。' },
    { names: ['vibe_v5_verdict_final'], text: '汇总裁决：读各席位用 vibe_v5_verdict 提交的裁决行，由会议主席席落成最终结论；没交裁决的席位会被具名列出，只有显式 partial 才允许部分汇总。★ 收裁决之前可以先「看谁交了」：`vibe_v5_meeting {action:"rulings", id:"<会议>", proposition_id:"<命题>"}` 读已经落盘的裁决卡（rows 每位成员一条最新、cards 扫描数、duplicates 同一成员两次不同值），不汇总、不落账、不改卡——别等到 verdict_final 才第一次看见提交情况。' },
    { names: ['vibe_v5_verdict_ask'], text: '以会议主席席的名义请各辩论席位交「布尔概率＋理由」；主持人不问自己（回执的 excluded 会写明原因），发不出去会具名说没有信箱面。' },
    { names: ['vibe_v5_verified_promote'], text: '把一条已验证的命题升进 Verified/ 轨（需要 warrant 与 warrant_kind，写之前要先过保真收口）；这是定论的唯一写入口，重复升同一条是幂等的。' },
    { names: ['vibe_v5_fidelity_conclude'], text: '保真收口：Lean 通过不等于命题为真，收口要给出「代码里的命题、各种定义是否描述符合所需」的判定（院士席）。' },
    { names: ['vibe_v5_blueprint'], text: '技术路线蓝图：state 读现行版/在等草案/超期、propose 提一份、read 按 id 读一版、adopt 落成（落成只有院士席）；总目标、规划与技术路线都在这一面。' },
    { names: ['vibe_v5_start', 'vibe_v5_stop', 'vibe_v5_pause', 'vibe_v5_resume'], text: '建所并启动／停机／暂停／继续（全部走内核自己的控制状态；resume 走控制面，不是耐久投影）。' },
    { names: ['vibe_v5_configure', 'vibe_v5_set'], text: '改【已声明】的设置键；回执会带该键的热级：H1 立即生效，H2 重启后生效；未声明的键与 H3 只读键都会被具名拒。' },
    { names: ['vibe_v5_lean_run', 'vibe_v5_lean_job', 'vibe_v5_lean_lib', 'vibe_v5_lean_read', 'vibe_v5_lean_archive'], text: '真的用内核 Lean 面编译既有 .lean 文件／查作业／看库／读归档／归档（kind: def/lemma/proof/blocked）；本包不自己起子进程。' },
    { names: ['vibe_v5_inbox'], text: '信箱（列表 / 打开 / 标记）：看列表不读正文；打开一封会自动标已读；需要跟进标待办。' },
    { names: ['vibe_v5_wait'], text: '等别人回你（等到或超时即返回）；不要用反复轮询。' },
    { names: ['vibe_vmu_env'], framework: true, text: "探测本机的外部环境（action:'probe' 传 need，如 python／lean／xelatex；action:'list' 看全部需求；action:'report' 把缺失记成一条 finding 供主代理读）。它只探测与上报，【绝不安装、绝不联网、绝不改系统】。" },
    { names: ['vibe_v5_paper'], text: '论文流程（start→part→advance→review→render）：用工具推进论文阶段，不要用回执字段假装已写；action=start（开题，需 target 与 participants）／part（写你那一份）／review（互审，deliverable 必填）／advance（推进阶段）／final（定稿，只有 chair 席会被内核接受）／render（产出 md／tex／meta 并如实报 missing）／status／compile／sections；阶段合法性与席位权限由内核判。' },
  ]),
  member: Object.freeze([
    { names: ['vibe_v5_record_progress'], text: '写你自己的研究日志（track 可选 progress/routes/obstacles/rejected/state）。★ 传 member:"<你的 id>"——不传的话作者是 unknown。' },
    { names: ['vibe_v5_record_proposition'], text: '写命题卡（statement、value、motive、p 必填；草稿可先写，不会被当成已验证）。' },
    { names: ['vibe_v5_record_method'], text: '写方法卡（content、value、motive、p 必填）。' },
    { names: ['vibe_v5_record_subproblem'], text: '写子问题卡（statement、value、motive、p 必填）。' },
    { names: ['vibe_v5_say'], text: '群里发言（省略 to）或私信（to 填成员 id）；发言者必须是你自己的真名册 id。' },
    { names: ['vibe_v5_task_create', 'vibe_v5_task_list', 'vibe_v5_task_update'], text: '建任务、看任务板、按修订号更新任务。' },
    { names: ['vibe_v5_task_get'], text: '按 id 读一张任务卡（状态、接受标准、指派人、修订号）——看板只给列表。' },
    { names: ['vibe_v5_hire'], text: '你作为常驻研究员可以给自己招一名临时成员（需要 purpose 与 initial_task）。' },
    { names: ['vibe_v5_fire'], text: '辞退临时工（A7）：临时工只由院士与常驻研究员雇佣，所以这两类席位都能解雇——你解雇自己雇的那名；成员面 end ＋ 其未完成任务转 cancelled，回执会说明（档案留在所史里，代号永不复用）。' },
    { names: ['vibe_v5_feedback'], text: '工作经验／流程反馈库：op=add/update/list（不是研究结论）。' },
    { names: ['vibe_v5_read_library'], text: '读任何人的成果库（只读）。' },
    { names: ['vibe_v5_tool_help'], text: '回答"我现在能用什么"：清单取自内核自己的声明（packTools）。' },
    { names: ['vibe_v5_motion', 'vibe_v5_second'], text: '在会中提动议（kind=topic/procedural/resolution；需给 meeting）；附议同一条要 meeting+motion_id（提案人不能附议自己）；op:"withdraw" 撤回自己的动议。' },
    { names: ['vibe_v5_poll_vote'], text: '在已开的选项投票上投票（只有常设席有票权）。' },
    { names: ['vibe_vmu_human'], framework: true, text: '人工在环的**读**（规则 11·反脆弱）：action="approvalState"／"queue" 查你那条动作是不是在等批（带 requestId）；若所办在 `vmu.human.gatedActions` 里声明了闸门，被闸动作在获批前不执行（具名 `VMU_HUMAN_APPROVAL_PENDING`），超时默认 hold 不放行。批准由人类经所办做——需要权限就在群聊与 Progress/ 里写清事由，由所办向用户请示，不要自批。' },
    { names: ['vibe_vmu_chat'], framework: true, text: '群聊治理（规则 5·交流渠道）只有管理员能做（`vmu.chat.admins`，本所默认 acad）：mute／quota／setpolicy／admin 被非管理员调用即具名拒 `VMU_CHAT_NOT_ADMIN`；你若被禁言或超配额，发言会被具名拒 `VMU_CHAT_MUTED`／`VMU_CHAT_QUOTA_EXCEEDED`，等管理员解禁或调配额。' },
    { names: ['vibe_v5_verdict'], text: '对验证对象投 [0,1] 的裁决。' },
    { names: ['vibe_v5_blueprint'], text: '技术路线蓝图：state 读现行版/在等草案、propose 提一份、read 按 id 读一版；落成（adopt）只有院士席。' },
    { names: ['vibe_v5_lean_run', 'vibe_v5_lean_job', 'vibe_v5_lean_lib', 'vibe_v5_lean_read', 'vibe_v5_lean_archive'], text: '用内核 Lean 面编译既有 .lean 文件／查作业／看库／读归档／归档（本包不自己起子进程；无宿主 spawn 接缝时具名拒）。' },
    { names: ['vibe_v5_inbox'], text: '信箱（列表 / 打开 / 标记）：看列表不读正文；打开一封会自动标已读；需要跟进标待办。' },
    { names: ['vibe_v5_wait'], text: '等别人回你（等到或超时即返回）；不要用反复轮询。' },
    { names: ['vibe_vmu_env'], framework: true, text: "探测本机的外部环境（action:'probe' 传 need，如 python／lean／xelatex；action:'list' 看全部需求；action:'report' 把缺失记成一条 finding 供主代理读）。它只探测与上报，【绝不安装、绝不联网、绝不改系统】。" },
    { names: ['vibe_v5_paper'], text: '论文流程（start→part→advance→review→render）：用工具推进论文阶段，不要用回执字段假装已写；action=start（开题，需 target 与 participants）／part（写你那一份）／review（互审，deliverable 必填）／advance（推进阶段）／final（定稿，只有 chair 席会被内核接受）／render（产出 md／tex／meta 并如实报 missing）／status／compile／sections；阶段合法性与席位权限由内核判。' },
  ]),
  temp: Object.freeze([
    { names: ['vibe_vmu_human'], framework: true, text: '人工在环的**读**（规则 11·反脆弱）：action="approvalState" 查审批状态（带 requestId）；若所办在 `vmu.human.gatedActions` 里声明了闸门，被闸动作在获批前不执行（具名 `VMU_HUMAN_APPROVAL_PENDING`），超时默认 hold。你没有表决权、也不批任何事：需要权限就在群聊说明，由所办向用户请示。' },
    { names: ['vibe_v5_say'], text: '在群里发言（省略 to）或私信（to 填成员 id）；发言者必须是你自己的真名册 id。' },
    { names: ['vibe_v5_task_list', 'vibe_v5_task_update'], text: '看任务板、就地更新分给你的那张任务（认领/完成/重开）——你的本轮结果就落在这张任务的回执上，不另立研究卡。' },
    { names: ['vibe_v5_task_get'], text: '按 id 读一张任务卡（状态、接受标准、指派人、修订号）——先看清接受标准再动手。' },
    { names: ['vibe_v5_read_library'], text: '读任何人的成果库（只读）。' },
    { names: ['vibe_v5_tool_help'], text: '回答"我现在能用什么"：清单取自内核自己的声明（packTools）。' },
    { names: ['vibe_v5_inbox'], text: '信箱（列表 / 打开 / 标记）：看列表不读正文；打开一封会自动标已读；需要跟进标待办。' },
    { names: ['vibe_v5_wait'], text: '等别人回你（等到或超时即返回）；不要用反复轮询。' },
    { names: ['vibe_vmu_env'], framework: true, text: "探测本机的外部环境（action:'probe' 传 need，如 python／lean／xelatex；action:'list' 看全部需求；action:'report' 把缺失记成一条 finding 供主代理读）。它只探测与上报，【绝不安装、绝不联网、绝不改系统】。" },
  ]),
})

/**
 * RULED AND STILL-OPEN DECISIONS — named here instead of silently applied.
 *
 * A row here is NOT a grant: the ACL above is what runs. `status:'decided'` records the Lead's ruling TOGETHER with the
 * reason, so the mechanism and the argument sit on the same line; `status:'pending'` is a candidate change with the
 * evidence for and against, so the Lead can rule and the change is one cell edit (the test prints these so they cannot
 * rot). A decided row that the table contradicts is a drift the suite catches (it asserts each decided row's current
 * value equals `seatDecision`).
 */
export const SEAT_PENDING_RULINGS = Object.freeze([
  Object.freeze({
    seat: 'member',
    tool: 'vibe_v5_message',
    current: 'deny',
    status: 'decided',
    ruling: 'keep deny — Lead, round 31 (裁决 1): this face does not check WHO calls it, so granting it to a member grants "send mail as anyone"; DMs go through say{to}, which the member already has.',
    suggestion: 'keep deny',
    evidence: 'task-15 的验收写的是「member 能私信（vibe_v5_message）」，但 message 是所办口吻面：sender 取 args.member||"office" 且不校验调用者'
      + '（kit/handlers.js:352），放宽它等于允许成员以所办或任何人的名义发信（规则 11.2）。私信本身走 say{to}（kind:"dm"，同一文件 :305），'
      + 'member 已有；member-scope.js 的 TOOL_SCOPES 把 message 记为 "member"，与本行不一致——这是两轴不一致，不是本表漏写。'
      + '若 Lead 裁决要给，把本表 member 改为 true 并加一条 bullet 即可，测试会同时要求 bullet 与 allow 一起改。',
  }),
  Object.freeze({
    seat: 'chair',
    tool: 'vibe_v5_script',
    current: 'deny',
    status: 'decided',
    ruling: 'keep deny — Lead, round 31 (裁决 2): the script face archives/reads/ lists run scripts; no seat may call it, and if the academician ever needs archived scripts for 断点续跑 that is a separate one-cell decision, not a reason to open it now.',
    suggestion: 'maybe allow',
    evidence: '规则 10 提到断点续跑；script 面是 archive/read/list 的脚本轨（不新增 kind，临时执行被 VMU_PACK_V5R_CORE_NO_ADHOC_SCRIPTS 具名拒）。'
      + 'run31 的院士缺陷清单里没有它，现行提示词也从未教过它 ⇒ 保持 deny；若院士要能归档运行脚本以支持续跑，这是一次单独裁决。',
  }),
  Object.freeze({
    seat: 'member',
    tool: 'vibe_v5_verified_promote',
    current: 'deny',
    status: 'decided',
    ruling: 'keep deny for member AND temp, allow for chair — Lead, round 31 (裁决 5): verified 轨是「正式证明或证伪已写完」的机构记录；'
      + 'v5r 规则把「lean 通过后由辩论核描述是否符合原意、符合即概率=1 并允许入 verified」整条工序交给辩论与院士。'
      + 'member/temp 的正当入口是 record_proposition（写卡）+ 辩论裁决，verified_promote 是收口动作。',
    suggestion: 'keep deny',
    evidence: '工具体只要求「任意 live 席」（requireSeat），但规则 2 把 Verified/ 定为机构的信任轨，且 promoteVerified 是唯一写入口。'
      + '若允许成员自己升格，单写者仍在（机制没破），但「谁说了算」从主席滑到自查自升；故只给 chair，成员走裁决/收口流程。',
  }),
  Object.freeze({
    seat: 'member',
    tool: 'vibe_v5_blueprint',
    current: 'allow',
    status: 'decided',
    ruling: 'keep allow — Lead, round 31 (裁决 3): 规则 3 是「院士＋常驻研究员共同设计、编辑权归院士」，所以成员能 propose/read，adopt 由工具体按槽（BLUEPRINT_ADOPT_SLOT）拒绝。',
    suggestion: 'keep allow',
    evidence: 'blueprint 的四个动作 at one face: state/propose/adopt/read。adopt 走 requireChairSeat 且比对 BLUEPRINT_ADOPT_SLOT，'
      + '所以把整张面孔给成员并不会把决策权给成员；不给它才会让「共同设计」只停在嘴上。',
  }),
  Object.freeze({
    seat: 'chair',
    tool: 'vibe_v5_start / stop / pause / resume / configure / set / verdict_final / verdict_ask / verified_promote / report / overview',
    current: 'allow（本表）—— member-scope 的 office-only 只是读侧命名，不再收窄院士席',
    status: 'decided',
    ruling: 'FIXED in round 31 by this lane: `member-scope.js#applyMemberScope` no longer overrides the chair seat at all; for the governed seats it pushes a DENY list derived from THIS table (never an allow list). The 11 office-only names the chair may call are therefore a READ-side naming difference only — recorded by `seatFaceReconciliation` as `readOnlyConflicts` and pinned by the suite.',
    suggestion: 'done: applyMemberScope now derives from seat-faces.js',
    evidence: 'member-scope.js 曾把 report/overview/start/stop/pause/resume/configure/set/verified_promote/verdict_final/verdict_ask 判为 office-only，'
      + '而 applyMemberScope 在 hire/start 时给【含院士席在内】的被雇席位写 allow:MEMBER_SAFE_TOOLS；faceGate 见到 allow 数组就不再读 deny，'
      + '所以真机上院士席的 verdict_final/verdict_ask/verified_promote/start… 会被那一层收窄。现由 seat-faces 派生 deny、院士席不覆盖，'
      + '探针 `D:/_tmp/r31/seat-faces/probe-start-sequence.mjs` 实测 start 之后院士仍能调 6 个职责工具。',
  }),
])

const str = (v) => (v === null || v === undefined ? '' : String(v))
const vibeV5 = (n) => /^vibe_v5_[a-z0-9_]+$/.test(str(n))

/** The decision for one seat/tool pair: `{allowed, rule, why}`. An UNKNOWN tool is denied and says so. */
export function seatDecision(seat, tool) {
  const s = str(seat)
  const t = str(tool)
  const row = Object.prototype.hasOwnProperty.call(SEAT_TOOL_FACES, t) ? SEAT_TOOL_FACES[t] : null
  if (!row) {
    return {
      allowed: false,
      declared: false,
      rule: null,
      why: 'no row for "' + t + '" in seat-faces.js: a tool with no declared decision is DENIED to every seat (fail-closed), and seatTeachingCatalogue reports it by name',
    }
  }
  const allowed = !!(row.allow && row.allow[s] === true)
  return { allowed, declared: true, rule: row.rule, why: row.why }
}

/** The tools a seat may call, in the catalogue's own order. Unknown/undeclared ⇒ not allowed. */
export function seatAllowNames(seat, declared = []) {
  return (Array.isArray(declared) ? declared : []).map(str).filter((n) => n !== '' && seatDecision(seat, n).allowed)
}

/** `deny = declared − allow` — COMPUTED, never hand-written. */
export function seatDenyNames(seat, declared = []) {
  const allow = new Set(seatAllowNames(seat, declared))
  return (Array.isArray(declared) ? declared : []).map(str).filter((n) => n !== '' && !allow.has(n))
}

/** The manifest shape this pack declares as `toolFaces`: `{chair:{deny:[…]}, member:{…}, temp:{…}}`. */
export function seatFaces(declared = []) {
  const out = {}
  for (const seat of SEAT_IDS) out[seat] = Object.freeze({ deny: Object.freeze(seatDenyNames(seat, declared)) })
  return Object.freeze(out)
}

/** The bullet lines a seat reads, rendered from the declaration: `· a / b / c —— text`. */
export function seatBulletLines(seat) {
  const rows = SEAT_TEACHING[str(seat)]
  if (!Array.isArray(rows)) {
    // Named, not silent: an unknown seat would otherwise render an EMPTY tool table that reads like "you have nothing".
    throw Object.assign(new Error('seat-faces.js has no teaching list for seat "' + str(seat) + '"'),
      { code: 'VMU_SEAT_FACE_UNKNOWN', hint: 'declared seats: ' + SEAT_IDS.join(', ') })
  }
  return rows.map((row) => '· ' + row.names.join(' / ') + ' —— ' + row.text)
}

/** The bullet NAMES a seat's prompt teaches (framework names such as `vibe_vmu_env` are reported separately). */
export function seatTaughtNames(seat) {
  const rows = SEAT_TEACHING[str(seat)] || []
  const v5 = []
  const framework = []
  for (const row of rows) {
    for (const n of row.names) (row.framework || !vibeV5(n) ? framework : v5).push(n)
  }
  return { v5: Object.freeze([...new Set(v5)]), framework: Object.freeze([...new Set(framework)]) }
}

/**
 * THE DRIFT CHECK between the two halves — bidirectional, and it also reports rows the catalogue does not declare.
 *
 * A caller (a test, or the wiring path) hands in the pack's own declared names:
 *   `missing`        — declared tools with no row here (they are denied by fail-closed; the ROW is what is missing)
 *   `extra`          — rows naming a tool the pack no longer declares (a stale decision)
 *   `taughtNotAllowed` — the prompt teaches a name the seat may not call  ⇒ "prose promises what the wire refuses"
 *   `allowedNotTaught` — the seat may call a name no bullet teaches        ⇒ the run-31 defect class, opposite direction
 */
export function seatTeachingCatalogue(declared = []) {
  const declaredNames = (Array.isArray(declared) ? declared : []).map(str).filter((n) => n !== '')
  const declaredSet = new Set(declaredNames)
  const rowNames = Object.keys(SEAT_TOOL_FACES)
  const missing = declaredNames.filter((n) => !Object.prototype.hasOwnProperty.call(SEAT_TOOL_FACES, n)).sort()
  const extra = rowNames.filter((n) => !declaredSet.has(n)).sort()
  const seats = {}
  for (const seat of SEAT_IDS) {
    const allow = seatAllowNames(seat, declaredNames)
    const taught = seatTaughtNames(seat).v5.filter((n) => declaredSet.has(n))
    const allowSet = new Set(allow)
    const taughtSet = new Set(taught)
    seats[seat] = {
      allowCount: allow.length,
      denyCount: declaredNames.length - allow.length,
      taughtCount: taught.length,
      taughtNotAllowed: taught.filter((n) => !allowSet.has(n)),
      allowedNotTaught: allow.filter((n) => !taughtSet.has(n)),
      frameworkTaught: seatTaughtNames(seat).framework.slice(),
    }
  }
  const badRows = rowNames.filter((n) => {
    const row = SEAT_TOOL_FACES[n]
    const ruleOk = str(row.rule).split(',').map((x) => x.trim()).filter((x) => x !== '')
      .every((k) => Object.prototype.hasOwnProperty.call(RULE_INDEX, k))
    const seatsOk = SEAT_IDS.every((s) => row.allow && typeof row.allow[s] === 'boolean')
    return !ruleOk || !seatsOk || str(row.why).length < 20
  })
  const ok = missing.length === 0 && extra.length === 0 && badRows.length === 0
    && SEAT_IDS.every((s) => seats[s].taughtNotAllowed.length === 0 && seats[s].allowedNotTaught.length === 0)
  return { ok, declaredCount: declaredNames.length, rowCount: rowNames.length, missing, extra, badRows, seats }
}

/**
 * THE DECLARED NAME LIST OF THIS TABLE ITSELF — `Object.keys(SEAT_TOOL_FACES)`, in declaration order.
 *
 * Exported so consumers that must NOT import `tools.js` (an ESM cycle would evaluate the derived arrays before the
 * catalogue exists) still get a declared list: `member-scope.js#applyMemberScope` derives its deny list from THIS list and
 * this table, so it never keeps a second copy of the catalogue.
 */
export function seatDeclaredNames() {
  return Object.freeze(Object.keys(SEAT_TOOL_FACES))
}

/**
 * THE TWO AXES, SAID ONCE. `member-scope.js` and this file both talk about "member", and conflating them is exactly how
 * run 31 lost the chair's ruling faces, so the division is stated here and pinned by tests.
 */
export const SEAT_SCOPE_AXES = Object.freeze({
  scope: 'member-scope.js#TOOL_SCOPES 回答「谁看得见」：这件面孔属于席位线还是所办专用，决定成员子会话的线束（preset 的 packToolAllow / 可见列表）里会不会出现它。它不判断是哪一个席。',
  seat: 'seat-faces.js#SEAT_TOOL_FACES 回答「谁调得动」：这个席能不能调这件工具，决定 memberFaceGate 的放行/拒绝与提示词 bullet。它不判断这是不是所办的面孔。',
  join: '两轴各自由自己的声明表派生，谁也不抄第二张表；applyMemberScope 下发的是【本表派生的 deny】，不是一份便利的 allow —— deny 只能收窄，所以「看得见」永远不会悄悄升级成「调得动」。',
  diffIsDeclared: '两轴不一致的清单是【算出来并列出来】的（seatFaceReconciliation → readOnlyConflicts / hardConflicts），不是漏掉的：读侧差异必须被测试钉住，运行侧差异必须为零。',
})

/**
 * COMPARE THE TWO AXES — computed, and split into the two meanings a reader actually needs.
 *
 *   `readOnlyConflicts`  — a seat may call it, `member-scope.js` calls it office-only, and the seat is NOT governed by
 *                          `applyMemberScope` (the chair). Nothing is narrowed at runtime: the seat face is the only
 *                          authority. This is a NAMING difference, and it must be pinned by name, not assumed gone.
 *   `hardConflicts`      — same disagreement for a GOVERNED seat (`SEAT_GOVERNED_SLOTS`). There `applyMemberScope` does
 *                          push this table's deny list, so the grant WOULD be silently narrowed at hire/start time. This
 *                          list must be EMPTY; `ok` says so.
 *
 * ★ HOW THE SPLIT IS MADE — and why the receipt says so out loud: a conflict is "read-only" **iff the seat is not governed**
 * (`SEAT_GOVERNED_SLOTS.includes(seat)`), i.e. iff `applyMemberScope` never pushes a deny for it. That is OUR definition,
 * not a sentence from the rules — so the returned receipt carries `splitBy: 'governed'` and every conflict carries its own
 * `governed` flag. If `temp` ever becomes a governed slot (e.g. temp gets a stricter derived deny), those rows would move
 * from `readOnlyConflicts` into `hardConflicts` automatically and `ok` would turn FALSE: a silent guarantee that the
 * classification cannot drift while nobody is looking. The tests pin the current 0 / N split, so a reclassification is a
 * visible test failure, never an inferred surprise.
 */
export function seatFaceReconciliation({ declared = [], memberScope = null } = {}) {
  const scopes = memberScope && typeof memberScope === 'object' ? memberScope : {}
  const conflicts = []
  for (const seat of SEAT_IDS) {
    const governed = SEAT_GOVERNED_SLOTS.includes(seat)
    for (const tool of seatAllowNames(seat, declared)) {
      const scope = str(scopes[tool])
      if (scope !== 'office') continue
      conflicts.push({
        seat,
        tool,
        scope,
        governed,
        means: governed
          ? 'this pack grants it to the ' + seat + ' seat and member-scope.js calls it office-only, and `' + seat
            + '` IS a governed slot: applyMemberScope() pushes this table\'s deny list at hire/start time, so the grant would be narrowed away'
          : 'this pack grants it to the ' + seat + ' seat and member-scope.js calls it office-only, but `' + seat
            + '` is NOT governed by applyMemberScope (its face IS this declaration), so nothing narrows it at runtime — a naming difference, pinned here',
      })
    }
  }
  const readOnlyConflicts = conflicts.filter((c) => !c.governed)
  const hardConflicts = conflicts.filter((c) => c.governed)
  return {
    ok: hardConflicts.length === 0,
    // ★ the CLASSIFIER is part of the receipt, not a reader's inference (see the docblock above).
    splitBy: 'governed',
    splitMeans: 'a conflict is read-only iff its seat is NOT in SEAT_GOVERNED_SLOTS (applyMemberScope never pushes a deny'
      + ' for it); a governed seat\'s disagreement would be narrowed at hire/start time and is therefore hard',
    checked: Array.isArray(declared) ? declared.length : 0,
    conflicts,
    readOnlyConflicts,
    hardConflicts,
    seats: SEAT_IDS.map((s) => ({ seat: s, governed: SEAT_GOVERNED_SLOTS.includes(s), allowCount: seatAllowNames(s, declared).length })),
  }
}

/**
 * THE STRANDED-NAME CHECK on the READ axis: every tool `member-scope.js` calls seat-line ("member") must be callable by AT
 * LEAST ONE seat. A name declared seat-line that no seat may call is a name the member wire shows and the gate always
 * refuses — a dead entry nobody would notice until a live run. Returns the stranded names by name.
 */
export function seatScopeDivergence({ declared = [], memberScope = null } = {}) {
  const scopes = memberScope && typeof memberScope === 'object' ? memberScope : {}
  const names = (Array.isArray(declared) ? declared : []).map(str).filter((n) => n !== '')
  const stranded = names.filter((n) => str(scopes[n]) === 'member' && SEAT_IDS.every((s) => !seatDecision(s, n).allowed))
  const rowless = names.filter((n) => str(scopes[n]) === 'member' && !seatDecision('chair', n).declared)
  return {
    ok: stranded.length === 0 && rowless.length === 0,
    declaredCount: names.length,
    stranded,
    rowless,
    axes: SEAT_SCOPE_AXES,
  }
}

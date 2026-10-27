/**
 * v5r REPLY CHANNEL — the DECLARATION behind the daily reply catalogue, and the renderer that turns it into prompt text.
 *
 * THE DEFECT THIS FILE EXISTS FOR (run 35, measured on a real machine). Both reply catalogues taught the member to hand
 * its answer back with `vibe_vmu_turn { op: "reply", report: { … } }` and then told it NOT to write a JSON fence. On the
 * delivery this institute actually runs (`activation` / subagents), a member turn SETTLES INSIDE the step — no prompt
 * is ever left awaiting, so that channel is unreachable and the kernel refuses it by name
 * (`VMU_TURN_NO_PENDING_MEMBER`, kernel/turn/index.js:1842-1843, with the "REACHABLE INSTEAD" hint). The only channel
 * that works is the member's reply TEXT: the fenced (or bare) JSON object, which `parse()` has always accepted
 * (kernel/turn/index.js:1958-2004, tiers: last fenced block -> bare object -> named refusal). Run 35's readout was
 * BAD_JSON=14: members answered in prose because the prompt had taught them a channel they could not use and forbade
 * the one they could. The kernel already appends the missing half per delivery (`SUBAGENT_DELIVERY_NOTE`,
 * kernel/turn/index.js:445-450); this file makes the PACK say the same thing, so the two no longer contradict.
 *
 * THE ARCHITECTURE (same shape as `seat-faces.js`, for the same reason). Before this file the field list was prose
 * typed into two sections, and it had already drifted from the mechanism: it never named `proposal`, `motion`,
 * `lean_archive`, `lean_run` (all four really are reply fields), and it taught `meeting_hand`/`meeting_invite` as
 * usable reply fields although the kernel refuses them by name (`VMU_TURN_FIELD_NOT_APPLICABLE` — a reply carries no
 * meeting id, so the shape cannot be dispatched). So:
 *   · `REPLY_FIELD_ROWS` is THE declaration — one row per reply field, each with the face that owns it;
 *   · the section text is RENDERED from those rows (`replyCatalogueLines`), never hand-listed again;
 *   · `tests/vmu-run35-reply-channel.test.mjs` compares this table against the kernel's own `FIELD_OWNERS` /
 *     `RECORDED_FIELDS` in BOTH directions, so a field added or re-homed in the kernel turns the pack red instead of
 *     silently going untaught.
 *
 * TWO CATALOGUES, ONE SOURCE. `vmu.turn.replyCatalogue` is `compact` by default and `full` on request
 * (middleware/prompt-switches.js:49/146); the two sections are mutually exclusive, so each renders the SAME channel
 * paragraph plus the rows it needs (`common: true` for the compact one). Teaching the channel once, in one place.
 */

/** The channel facts, verbatim where the kernel names them. Rendered into every catalogue, so the two cannot disagree. */
export const REPLY_CHANNEL_FACTS = Object.freeze({
  /** The channel that works on every delivery path; the member's reply TEXT. */
  reachable: 'reply-text',
  /** The channel that does NOT work here, and the kernel's own refusal for it. */
  unreachable: Object.freeze({
    tool: 'vibe_vmu_turn',
    op: 'reply',
    code: 'VMU_TURN_NO_PENDING_MEMBER',
  }),
  /** The parser's tiers, in order (kernel/turn/index.js:1958-2004). */
  parseTiers: Object.freeze(['fenced-json', 'bare-json', 'named-refusal']),
  /** Named refusals a member can actually meet. */
  refusals: Object.freeze({
    noFence: 'VMU_TURN_NO_FENCE',
    badJson: 'VMU_TURN_BAD_JSON',
    fieldNotApplicable: 'VMU_TURN_FIELD_NOT_APPLICABLE',
    replyConflict: 'VMU_TURN_REPLY_CONFLICT',
  }),
})

/**
 * ONE ROW PER REPLY FIELD. `face`/`op` are the kernel's owner for the field (FIELD_OWNERS); a null `face` means the
 * kernel BOOKKEEPS it on the turn state instead of dispatching it (RECORDED_FIELDS). `common: true` means it belongs in
 * the compact catalogue (`vmu.turn.replyCatalogue = 'compact'`, the default); every row belongs in the full one.
 * `notApplicable` is set exactly where the kernel marks the field `noReplyShape`.
 */
export const REPLY_FIELD_ROWS = Object.freeze([
  // ── dispatch fields: the kernel sends the payload to ONE face ────────────────────────────────────────────────────
  Object.freeze({ field: 'say', face: 'vmu.meetings', op: 'speak', common: true,
    note: '对全所说话（群聊）；也可 {"to":"r-2","text":"…"} 私信或 {"to":"voters","text":"…"} 只对表决者' }),
  Object.freeze({ field: 'progress', face: 'vmu.records', op: 'put', common: true,
    note: '本轮进展、阻塞与下一步（追加到 Progress/）；形状由 vmu.records.put 判，写错会整轮写失败并具名说明' }),
  Object.freeze({ field: 'record', face: 'vmu.library', op: 'record', common: true,
    note: '成果卡数组：kind,id,title,statement 或 content,value,motive,p' }),
  Object.freeze({ field: 'propose_verify', face: 'vmu.meetings', op: 'motion',
    note: '提议验证 {target,kind,reason}：你可以提议，是否入队由院士席决定' }),
  Object.freeze({ field: 'verdict', face: 'vmu.ballotbox', op: 'cast',
    note: '{target,verdict ∈ [0,1],reason}：只有 1 或 0 算表决，中间值是弃权/存疑；无表决权的席位填了也不计票' }),
  Object.freeze({ field: 'task_create', face: 'vmu.tasks', op: 'create', common: true,
    note: '{subject,description,blocked_by?,write_scopes?}' }),
  Object.freeze({ field: 'task_update', face: 'vmu.tasks', op: 'transition', common: true,
    note: '{task_id,expected_revision,action}；action 只有 claim|reassign|assign|transition|complete|reopen|set_dependencies 七个（edit/delete/release 在这个内核里没有对应操作，会被具名拒）；合法流转只有 open→assigned|doing、assigned→doing|open、doing→done|assigned；修订号过期会被拒' }),
  Object.freeze({ field: 'proposal', face: 'vmu.meetings', op: 'motion',
    note: '动议；与 propose_verify 同一个属主面，对象里说明要做什么' }),
  Object.freeze({ field: 'motion', face: 'vmu.meetings', op: 'motion',
    note: '动议；与 propose_verify 同一个属主面' }),
  Object.freeze({ field: 'formal', face: 'vmu.formal', op: 'check',
    note: '形式化结论 {decision,file,note}，形状见下面的 formal 段（仅当形式化开启时出现）' }),
  Object.freeze({ field: 'lean_archive', face: 'vmu.mathjobs', op: 'submit',
    note: '把一段 Lean 代码归档为证据（提交给 vmu.mathjobs）' }),
  Object.freeze({ field: 'lean_run', face: 'vmu.mathjobs', op: 'submit',
    note: '提交一次 Lean 运行（提交给 vmu.mathjobs）' }),
  // ★ these two are refused BEFORE dispatch: a reply carries no meeting id (kernel FIELD_OWNERS.meeting_hand.noReplyShape)
  Object.freeze({ field: 'meeting_hand', face: 'vmu.meetings', op: 'queue', notApplicable: true,
    note: '不要把它写进回执（写成 "meeting_hand": true 会被具名拒：回执不带会议 id，框架不会替你猜）；举手请用工具面 vibe_vmu_meeting { action: "hand", id: "<会议 id>" }' }),
  Object.freeze({ field: 'meeting_invite', face: 'vmu.meetings', op: 'attend', notApplicable: true,
    note: '不要把它写进回执（写成 "meeting_invite": {"member": "t-1", "why": "…"} 会被具名拒：回执不带会议 id；旧映射甚至会把这个字段当成自己签到）；邀请请用工具面 vibe_vmu_meeting { action: "invite", id: "<会议 id>", member: "t-1" }' }),
  Object.freeze({ field: 'input', face: 'vmu.meetings', op: 'speak',
    note: '会议/辩论的发言正文（会议轮用；也可直接用 say）' }),
  Object.freeze({ field: 'propose_meeting', face: 'vmu.meetings', op: 'motion',
    note: '提议开会 {agenda,kind?,target?}；非院士席只能提议，不能直接召集' }),
  Object.freeze({ field: 'convene_meeting', face: 'vmu.meetings', op: 'open',
    note: '直接召集 {agenda,…}：只有院士席能召集（conveneRequiresChair），别的席位调用会被具名拒' }),
  Object.freeze({ field: 'task_claim', face: 'vmu.tasks', op: 'transition', common: true,
    note: '要认领的任务 id 字符串（依赖未完成会被拒）' }),
  Object.freeze({ field: 'task_done', face: 'vmu.tasks', op: 'transition', common: true,
    note: '要标记完成的任务 id 字符串' }),
  Object.freeze({ field: 'assign', face: 'vmu.tasks', op: 'assign',
    note: '{subject,description,to,why,acceptance,priority}：分派是院士席的职责，权限由 vmu.tasks 判' }),
  Object.freeze({ field: 'nudge', face: 'vmu.meetings', op: 'warn',
    note: '{to,why,next_step}：督办（权限由属主面判）' }),
  Object.freeze({ field: 'reject_assign', face: 'vmu.meetings', op: 'speak', common: true,
    note: '{task_id,why}：对分派的异议理由；任务仍会执行，但理由会被广播给全体表决者' }),
  // ── bookkeeping fields: recognised, recorded on the turn state, dispatched to NO face ────────────────────────────
  Object.freeze({ field: 'contextPct', face: null, op: null, common: true,
    note: '你当前上下文占用百分比（0-100），有依据时才填' }),
  Object.freeze({ field: 'compacted', face: null, op: null, common: true,
    note: 'true 只表示你已把摘要写进 progress，不表示宿主已经压缩过' }),
  Object.freeze({ field: 'solved', face: null, op: null, common: true,
    note: '你这一轮的个人判断（框架据此了解全所收敛度）' }),
  Object.freeze({ field: 'vote_solved', face: null, op: null,
    note: '取值 `"vote_solved": true|false`：结题表决的诚实布尔值。**只要有一位有表决权者没有填 true（漏填或填 false）就不会结题**，本所继续推进；只有全体都 true 才停止' }),
  Object.freeze({ field: 'prioritize', face: null, op: null,
    note: '{order:[{task_id,priority}],why}：优先级（院士席牵头，记在轮次状态里）' }),
  Object.freeze({ field: 'hire', face: null, op: null,
    note: '{purpose,initial_task,direction}：只记录、不派发；要真雇人用 vibe_v5_hire（权限由该面判）' }),
  Object.freeze({ field: 'fire', face: null, op: null,
    note: '{id,reason}：只记录、不派发；要真解雇用 vibe_v5_fire（权限由该面判，**常驻研究员只能由所办解聘**）' }),
])

/** The field names the declaration carries, in declaration order (the catalogue renders exactly these). */
export const REPLY_FIELD_NAMES = Object.freeze(REPLY_FIELD_ROWS.map((r) => r.field))

/**
 * PER-SEAT PERMISSION NOTES. The field catalogue is seat-independent (every field is judged by its OWNER face, not by the
 * matrix), but a seat still deserves to know which of these fields it will be refused on. Each note names the owner that
 * refuses, so the sentence stays a statement about the mechanism instead of an invented rule.
 */
export const REPLY_SEAT_NOTES = Object.freeze({
  chair: '你是院士席：可以 `convene_meeting` 直接召集、`assign`／`prioritize`／`nudge` 分派与督办（分派的是工作，不是结论）；`verdict` 与其他人一票等重。',
  member: '你是常驻研究员：`convene_meeting` 只有院士席能召集（conveneRequiresChair），`assign`／`prioritize`／`nudge` 的权限由属主面判——被拒会具名说明，不要反复试。',
  temp: '你是临时成员：`verdict`／`vote_solved` 填了也不计票（没有表决权），`convene_meeting`／`assign`／`prioritize`／`nudge` 会被属主面具名拒；`propose_verify`／`propose_meeting` 你可以提议，是否采纳由院士席定。',
})

/** The smallest legal reply: the two fields every seat may always write, and nothing shape-sensitive. */
export const REPLY_MINIMAL = Object.freeze(['say', 'solved'])

const escape = (s) => String(s)

/**
 * The channel paragraph. One copy, rendered into whichever catalogue the policy selected, because a second copy is a
 * second thing to drift (and the previous split is exactly how the two catalogues came to disagree).
 * Avoids the literal fence token so the obsolete-wording budget stays inside the corrections
 * (`tests/audit-prompt-retired-mechanisms.test.mjs` compares the assembly's count with the corrections' count).
 */
export function replyChannelLines() {
  const f = REPLY_CHANNEL_FACTS
  // T99 caps a charter assembly at 20 000 chars, so the paragraph states the four facts once and spends nothing on
  // restating them: fence-in-body is the channel, one parseable fence wins, the tool call is unreachable, and the
  // failures are named. (The previous wording was ~130 chars longer and pushed the assembly over that cap.)
  return [
    '【本轮怎么交回】① 回复正文末尾一段代码围栏（三个反引号，标记可省）包一个 JSON 对象，这是唯一可靠通道；裸对象也能解析，但围栏最稳。' +
    '② 围栏前可写说明，解析器取**最后一个**可解析围栏。③ **不要调用** `' + f.unreachable.tool +
    ' { op: "' + f.unreachable.op + '", … }`：成员回合由宿主派发（activation），没有待回的回合，该通道不可达，只会得到 ' +
    '`' + f.unreachable.code + '`。④ 具名失败：`' + f.refusals.noFence +
    '`／`' + f.refusals.badJson + '`／`' + f.refusals.replyConflict + '`。',
  ]
}

/**
 * Render the field catalogue from `REPLY_FIELD_ROWS`. `mode: 'compact'` (the default catalogue) renders only the rows
 * marked `common`; `mode: 'full'` renders every row. Nothing here is typed by hand — adding a field is ONE ROW above.
 */
export function replyCatalogueLines({ mode = 'compact', seat = null } = {}) {
  // THE REFUSED FIELDS ARE ALWAYS RENDERED, in both modes: they are not "usable fields", they are boundaries, and a member
  // that only ever reads the compact catalogue is exactly the member that used to write `"meeting_hand": true`.
  const usable = mode === 'full' ? REPLY_FIELD_ROWS : REPLY_FIELD_ROWS.filter((r) => r.common || r.notApplicable)
  const rows = usable
  const refused = rows.filter((r) => r.notApplicable).length
  const head = mode === 'full'
    ? '【回执字段目录｜全部 ' + String(REPLY_FIELD_NAMES.length) + ' 个顶层字段，由内核字段表派生】字段名、属主与「哪些可用」都来自同一张声明表。'
    : '【回执字段目录｜常用 ' + String(rows.length - refused) + ' 个，由内核字段表派生】全部 ' + String(REPLY_FIELD_NAMES.length) + ' 个见 `vmu.turn.replyCatalogue=full`；另有 ' + String(refused) + ' 个没有可用形状，一并列出边界。'
  const lines = [head]
  for (const r of rows) {
    const where = r.face === null
      ? '只记进轮次状态，不派发'
      : r.face + (r.op ? '.' + r.op : '')
    const refused = r.notApplicable ? '　★ 这个字段没有可用形状，写了会被具名拒 `' + REPLY_CHANNEL_FACTS.refusals.fieldNotApplicable + '`。' : ''
    lines.push('· `' + r.field + '` —— ' + where + '：' + escape(r.note) + refused)
  }
  lines.push('· 键只能是上表名字（自造键按 `vmu.turn.unknownReplyFieldMode`：默认忽略，strict 则 `VMU_TURN_UNKNOWN_FIELD`）；被要求的字段以本轮指令为准。')
  lines.push('· 权限由属主面各自判（不是目录决定）：缺权限会被具名拒（临时工 verdict／vote_solved 不計票；convene 只有院士席能召集）。一次回复至少一个字段。')
  if (seat && REPLY_SEAT_NOTES[seat]) lines.push('· ' + REPLY_SEAT_NOTES[seat])
  // ★ The minimal shape NAMES `solved`, so the same line carries what it means — a catalogue that prints a field
  // without its semantics is what let "solved" be read as the counted closure vote (the closure recipe's whole point).
  const SOLVED_ROW = REPLY_FIELD_ROWS.find((r) => r.field === 'solved')
  lines.push('· 最小合法形状（可直接照抄）：{"say": "…", "solved": false} —— `solved` ' +
    escape(SOLVED_ROW.note) + '；计票的是 `vote_solved`')
  if (mode === 'full') {
    // THE OLD SHAPE, NAMED AS WRONG. Two wordings shipped for years and both are now wrong in different ways: the tool call
    // is unreachable (above), and a nested `report:` key no longer exists because the fenced object IS the report. Naming
    // them is not decoration — members arrive with these two forms memorised from earlier rounds and from the corrections.
    lines.push('· 这一段是**字段目录**：`←` 后是说明，`|`/`或` 是取值提示，因此这一段并非合法对象字面量；**你真正要交回的 `report` 必须严格合法**，最小形态见目录末尾的样例。')
    lines.push('· **旧写法不要再照抄**：一律「调用一次 `vibe_vmu_turn { op: "reply", report: { … } }`」在 activation 投递下不可达；`report: {"say":"…","progress":"…","solved":false,"contextPct":40}` 多套了一层 report 键。最小合法 report 样例（可直接照抄）：`{"say":"…","progress":"…","solved":false,"contextPct":40}`，放在回复末尾的代码围栏里。')
  }
  return lines
}

export default REPLY_FIELD_ROWS

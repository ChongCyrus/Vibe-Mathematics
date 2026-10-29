/**
 * 会议**类型 ⇒ 成员可用工具面**的收窄策略（D7 第二句：「成员可用的命令按会议类型不同」）。
 *
 * 为什么这个文件存在：`kernel/turn.step` 早就支持 `{tools: 'none' | {allow:[…]}}`（`vibe-math-vmu/tools/turn.js` 把它
 * 翻译成 `kernel.setMemberToolOverride({member, all, allow})`），但 **pack 侧没有任何生产者** —— 于是「会议类型
 * 决定这一轮能做什么」这条规则今天只存在于提示词里，而提示词不是门禁（红线①：越权不得靠"提示词要求"）。
 *
 * 三条必须守住的边界（每一条都有对应的门禁）：
 *   ① **只能收窄，不能扩大**。`allow` 在 host 侧会**盖掉**身份面（`resolveMemberToolDeny` 只在 allow 存在时按 allow
 *      过滤），所以这里绝不直接下发一张手写名单；先把身份可见表（`kernel.toolsView({member})`）读出来求交，
 *      交集才是 allow。读不到身份面就**具名拒**（`VMU_ENGINE_UNAVAILABLE`），因为"看不见身份面"时算出的任何
 *      allow 都可能是扩权。
 *   ② **没声明收窄的类型 ⇒ 原样身份面 + 具名说明**（`narrowing:{applied:false, reason:"type-declares-no-narrowing"}`）。
 *      「按类型收窄」是一个**决议**：本类型决议为"不收窄"，于是这一轮的工具面就是该成员的身份面，一个都不动；
 *      回执必须写明是这条决议，而不是让人从"没有 override"里猜。表里没有的未知类型同理（`declared:false`），
 *      但理由文字不同 —— 两者都不设 override。★ 这是 RUN 120 的 E12 修复点：此前这里直接返回 `rows: []`，
 *      回执没有任何一句"为什么没生效"，读起来和"收窄了但没人看"完全相同。
 *   ③ **声明了收窄、求交后却为空 ⇒ 跳过收窄并披露**（`narrowing:{applied:false, reason:"empty-intersect", …}`）。
 *      空工具面不是"严格"，是坏配置——但坏配置不该把整场会杀掉：收窄只服务这一轮，失效时如实说、不装 override
 *      （因此不扩权）。注意这是**唯一**一种"收窄没生效"的空集：②根本不求交，所以不会产生空集。
 *
 * 这张表是机构政策（pack），内核不认识任何会议类型 id（第一原则：换机构＝换 pack）。
 */

/** 每一类：`narrowed:true` 时必须给 `allow`（**期望**的允许集，实际下发前会与身份面求交）。 */
export const MEETING_TYPE_TOOL_FACES = Object.freeze({
  ordinary: Object.freeze({
    narrowed: false,
    reason: '正常会议不按类型收窄工具面：例行同步需要什么就用什么（没有"正常会议专用工具"这回事）。',
  }),
  academic: Object.freeze({
    narrowed: false,
    reason: '学术交流不按类型收窄工具面：报告与提问都可能临时需要记录、检索、任务面。',
  }),
  debate: Object.freeze({
    narrowed: true,
    // 辩论只需要：说话/记录/查库/投票/裁决/收件箱/会议面。写论文、跑 lean 作业、招人/裁员、配置改动都不在辩论的
    // 议题范围内 —— 它们不是"错误"，而是**另一个会议/另一段时间**的事。
    allow: Object.freeze([
      'vibe_v5_say', 'vibe_v5_message', 'vibe_v5_inbox', 'vibe_v5_wait',
      'vibe_v5_record_progress', 'vibe_v5_record_proposition', 'vibe_v5_read_library',
      'vibe_v5_meeting', 'vibe_v5_motion', 'vibe_v5_second',
      'vibe_v5_verdict', 'vibe_v5_verdict_final',
      'vibe_v5_tool_help',
      'vibe_vmu_meeting', 'vibe_vmu_chat', 'vibe_vmu_turn', 'vibe_vmu_mailbox',
      'vibe_vmu_records', 'vibe_vmu_status', 'vibe_vmu_tools',
    ]),
    reason: '辩论会议期间收窄到"发言/记录/查库/投票/裁决/会议"这几类：辩论是议题内的对抗，不是修改机构状态的场合。',
  }),
  closure: Object.freeze({
    narrowed: false,
    reason: '结题会议不按类型收窄工具面：清点产物、点名缺口都可能需要读全库与任务面。',
  }),
  paper: Object.freeze({
    narrowed: false,
    reason: '论文交流不按类型收窄工具面：互审与修订本来就要在论文子系统里动。',
  }),
  planning: Object.freeze({
    narrowed: false,
    reason: '规划会议不按类型收窄工具面：备选路线要读库、要落方法卡，收窄反而逼人凭记忆规划。',
  }),
})

/** 纯查询：某类型的收窄决议（未知类型 ⇒ declared:false + 具名理由，绝不返回一个静默的空 allow）。 */
export function meetingTypeFace(type) {
  const id = String(type === null || type === undefined ? '' : type).trim()
  const row = Object.prototype.hasOwnProperty.call(MEETING_TYPE_TOOL_FACES, id) ? MEETING_TYPE_TOOL_FACES[id] : null
  if (!row) {
    return {
      type: id || null,
      declared: false,
      narrowed: false,
      allow: null,
      reason: '会议类型「' + (id || '(空)') + '」没有声明工具面收窄 —— 按默认（身份面）执行。这是具名决定，不是遗漏。',
    }
  }
  return {
    type: id,
    declared: true,
    narrowed: row.narrowed === true,
    allow: row.narrowed === true ? row.allow.slice() : null,
    reason: row.reason,
  }
}

/**
 * 纯函数：把"期望允许集"和"身份可见表"求交。返回 `{allow, dropped, unavailable}`；`allow` 为空时由调用方具名拒。
 *
 * 两个方向的差集要分开说，因为它们不是同一件事：
 *   · `dropped`   ＝ 身份面里**本来能看见**、被这次收窄**拿掉**的名字（这才是"这一轮他少了什么"，读者要看的差异）；
 *   · `unavailable`＝ 策略表**期望**、但该席位**从来就看不见**的名字（策略配方与身份面对不上，不构成本轮损失）。
 * 把两者混在一个字段里会让"收窄"看起来像"扩权失败"，回执也就说不清了。
 * 这是一个**只能变小**的操作：输入是身份面，输出是它的子集。
 */
export function intersectFace(visibleNames, face) {
  const visible = Array.isArray(visibleNames) ? visibleNames.slice() : []
  const want = face && Array.isArray(face.allow) ? face.allow : []
  const wantSet = new Set(want)
  const visibleSet = new Set(visible)
  const allow = visible.filter((n) => wantSet.has(n))
  const dropped = visible.filter((n) => !wantSet.has(n))
  const unavailable = want.filter((n) => !visibleSet.has(n))
  return { allow, dropped, unavailable }
}

/**
 * 把收窄装到这一轮的成员上。返回 `{face, rows, clear}`；`clear()` 必须被调用（`finally`），否则 override 会留到
 * 下一个回合（host 的 `vibe_vmu_turn` 会清掉它自己设的那些，清不掉我们设的）。
 *
 * 读不到身份面 ⇒ `VMU_ENGINE_UNAVAILABLE`（具名：谁、为什么、怎么改）—— **只对声明了收窄的类型**：那种情况下
 * 算不出的 allow 可能扩权。声明"不收窄"的类型一个 override 都不设，读不到身份面只影响回执里那句说明，不影响
 * 这一轮能否开（`visible:null` + `identityFaceUnreadable` 如实说，而不是把整轮变成 `VMU_STATE`）。
 * 收窄后为空 ⇒ **不拒这一轮**，跳过收窄并披露（`narrowing.applied:false`，见 ③）。
 */
export function applyMeetingTypeFace({ kernel, type, members, refuse }) {
  const face = meetingTypeFace(type)
  const ids = Array.isArray(members) ? members.map((m) => String(m && typeof m === 'object' ? m.id : m)).filter((id) => id !== '') : []
  // ★★ ROUND 120 (E12 — 「收窄」只对声明了收窄的类型才有意义): A TYPE THAT DECLARES NO NARROWING IS NOT A ROUND
  // THAT CANNOT RUN. This used to return `rows: []` and say nothing, so a debate round (and every other non-narrowing
  // type) went out with an empty narrowing disclosure: the caller could not tell "this type decided not to narrow"
  // from "the narrowing silently did nothing". The face here IS the member's own identity face — unchanged, no
  // override installed, nothing widened. We read the identity face BEST-EFFORT only to be able to SAY what was left
  // untouched: an unreadable visibility provider must not kill a round that narrows nothing (there is no allow to get
  // wrong), so it is reported as `visible:null` + `identityFaceUnreadable` instead of `VMU_ENGINE_UNAVAILABLE`.
  if (face.narrowed !== true) {
    const rows = ids.map((id) => {
      let visible = null
      let unreadable = null
      try {
        const view = kernel.toolsView({ member: id })
        visible = (view && Array.isArray(view.tools) ? view.tools : []).map((t) => t && t.name).filter((n) => typeof n === 'string')
      } catch (err) {
        unreadable = (err && err.message ? err.message : String(err))
      }
      return {
        member: id,
        // `null` (not 0) when the identity face could not be read: a count of 0 would claim "he sees nothing".
        visible: visible === null ? null : visible.length,
        // `allow:null` (not `[]`) is the whole point: NOTHING was computed, so no receipt can read as "allowed nothing".
        allow: null,
        dropped: [],
        unavailable: [],
        narrowing: {
          applied: false,
          reason: 'type-declares-no-narrowing',
          declared: face.declared === true,
          typeReason: face.reason,
          identityFaceVisible: visible === null ? null : visible.length,
          identityFaceUnreadable: unreadable,
        },
      }
    })
    return { face, rows, clear: () => {} }
  }
  // ★ 两阶段：先把每个人的 allow 都算出来（任何一个人算不出来就整体拒），**再**设置 override。
  // 一边算一边设会让"第二个成员读不到身份面"这种情况把第一个成员的 override 留在那里 —— 拒绝之后还留着收窄，
  // 是比不收窄更糟的状态（没人知道它为什么在）。
  const planned = []
  for (const id of ids) {
    let view
    try {
      view = kernel.toolsView({ member: id })
    } catch (err) {
      throw refuse('VMU_ENGINE_UNAVAILABLE',
        '按会议类型收窄工具面需要先读身份可见表，但这一部署读不到（kernel.toolsView(' + id + ')：' + (err && err.message ? err.message : String(err)) + '）',
        '不读身份面就下发 allow 等于扩权（host 只在 allow 存在时按 allow 过滤，会盖掉身份 deny）；请在装了 host 工具可见性提供者的部署里使用，或先修好 toolsView')
    }
    const names = (view && Array.isArray(view.tools) ? view.tools : []).map((t) => t && t.name).filter((n) => typeof n === 'string')
    const { allow, dropped, unavailable } = intersectFace(names, face)
    if (allow.length === 0) {
      // ★★ ROUND 103 / F-103b: AN EMPTY INTERSECTION IS A DISCLOSURE, NOT A REFUSAL OF THE ROUND. Run 103's
      // `vibe_v5_meeting_round {type:"debate"}` died here (`VMU_STATE`) and the round never ran, because this
      // deployment's identity face was empty (no toolsView provider ⇒ 0 visible) — "strict" had turned into "this
      // deployment cannot hold a meeting". The narrowing is one round's convenience, not the meeting: skip it for
      // this member, install NO override (so the member keeps exactly its identity face — nothing is widened), and
      // carry `narrowing.applied:false` plus both counts into the receipt so nobody believes a narrowing happened.
      planned.push({ member: id, visible: names.length, allow: [], dropped, unavailable,
        narrowing: { applied: false, reason: 'empty-intersect', expectedAllowed: face.allow.length, identityFaceVisible: names.length } })
      continue
    }
    planned.push({ member: id, visible: names.length, allow, dropped, unavailable })
  }
  const rows = []
  // ★ Only the overrides THIS call installed are cleared. A row whose narrowing was disclosed as NOT applied keeps its
  // identity face and must never be un-set here: clearing a member we never touched would drop an override the host
  // itself installed, and the receipt would claim we cleaned up something that was never ours.
  const installed = []
  for (const row of planned) {
    // A row whose narrowing was NOT applied keeps its identity face: installing an empty allow would hide every tool.
    if (!(row.narrowing && row.narrowing.applied === false)) {
      kernel.setMemberToolOverride({ member: row.member, all: false, allow: row.allow.slice() })
      installed.push(row.member)
    }
    rows.push(row)
  }
  return {
    face,
    rows,
    clear: () => { for (const member of installed) kernel.clearMemberToolOverride(member) },
  }
}

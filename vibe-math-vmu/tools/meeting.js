// vibe-math-vmu/tools/meeting.js — the meeting tool spec, split out of host.js (round 538) so the host file stays
// inside the DECIDED 1200-line limit (docs/02). The spec is a factory: host.js supplies the shared helpers, and the guard
// condition stays in host.js, because which intent declares a tool is policy and policy belongs with the host.
//
// TASK-11 (D-08 baseline A) added the actions the v5r meeting surface had and this face could not reach:
// `hand` (举手), `refuse` (被拒输入不推进轮次), `invite`/`invitedspeak` (受邀临时工：只记、不计票、不阻塞收束),
// `end` (R10-2a 显式结束辩论), `aggregation` (聚合闸), `complete`/`phase` (两阶段派生), `status`/`summary`/`snapshot`,
// and ballot `freeze`/`unfreeze` (表决期冻结). Every one of them calls an existing kernel method: this face adds no policy.
//
// ★ PHASE 12 / D9 (lane-invite): the rule names 举手发言／邀请发言／批量指定成员按一定顺序发言／单次发言版群聊. Those
// faces live on the `vmu.meetings` SERVICE (the one `vibe_v5_meeting` convenes), but this tool addressed the PRIMITIVE
// registry only, so a pack-convened meeting answered `VMU_NO_SUCH_OBJECT` for hand/invite/invitedspeak (`docs/
// acceptance/conformance/lane-invite.md` §2: measured on a real boot — hand, invite, invitedspeak and hands were all
// refused, and the promise printed in the pack's own receipt note was false). `hand`/`invite`/`invitedspeak` now cross
// that boundary exactly like `speak`/`status`/`summary`/`close` already did. Two actions were added where the route was
// MISSING, not merely unused: `order` (the floor is READABLE — `meetingView` deliberately discloses no queue, so a chair
// that queued speakers could not verify what it did) and `attend` (`meetings.speak` refuses an absent speaker, and
// nothing in the tool layer could make anyone present, so every non-chair speech on a service meeting was a dead end).
// Both call existing kernel methods. The one thing this face DOES add is the AUTHORITY GATE the service cannot hold
// itself: the chair is visible here (`meetingView().chair`) while the service's `queue()` has no chair rail except
// under call_on, so "only the chair invites" is enforced at this gate and nowhere else. An invitation never marks the
// invitee PRESENT — attendance is what the quorum counts, so forging it would silently change the denominator.
/**
 * ★ RUN 84: which primitive actions also reach the SERVICE registry, derived from the branches of `run()` below —
 * kept at module scope because the refusal has to say it out loud, and a test has to be able to read it without
 * assembling a kernel.
 */
export const SERVICE_CROSSING_ACTIONS = Object.freeze(['speak', 'hand', 'hands', 'invite', 'invitedspeak', 'order', 'attend', 'status', 'summary', 'close', 'extendlimit', 'proceed', 'second', 'withdraw', 'flow', 'overrideorder'])

/**
 * ★ RUN 84: a primitive action asked for a meeting that lives in the SERVICE registry used to read
 * "no live meeting with id m2" — a sentence a reader takes as "that meeting does not exist", while the hint in the
 * SAME receipt said it lives in the service. Both facts have to be true at once: the id exists (somewhere else), and
 * the asked action does or does NOT cross registries. Exported so a test can read the sentence without a kernel.
 */
export function primitiveMissError({ id, inService, action, crossing = SERVICE_CROSSING_ACTIONS }) {
  const asked = String(action || 'this action')
  const set = Array.isArray(crossing) ? crossing : []
  const crosses = set.includes(asked)
  // ★ ROUND 94: a verb that NEVER crosses registries opened with "no PRIMITIVE meeting with id m2 (the id
  // exists in the SERVICE registry)" — a reader takes the first clause as "the meeting is missing", while the
  // real answer is "this verb cannot address that kind of meeting". Name the boundary FIRST when it applies.
  const boundaryOnly = inService && !crosses
  return Object.assign(new Error(boundaryOnly
    ? 'action "' + asked + '" addresses the PRIMITIVE registry only and never crosses, while meeting ' + String(id) + ' lives in the SERVICE registry'
    : (inService
      ? 'no PRIMITIVE meeting with id ' + String(id) + ' (the id exists in the SERVICE registry)'
      : 'no live meeting with id ' + String(id))), {
    code: boundaryOnly ? 'VMU_REGISTRY_BOUNDARY' : 'VMU_NO_SUCH_OBJECT',
    hint: inService
      ? 'meeting ' + String(id) + ' lives in the meetings SERVICE registry; ' + asked + (crosses
        ? ' DOES cross registries, but only when the service exposes that method'
        : ' addresses the PRIMITIVE registry only and does NOT cross') + '. Actions that cross: ' + set.join('/') + '. For this id use action=status (read) first, then one of the crossing actions.'
      : 'use action=list (it reports both registries: meetings, serviceMeetings, unionMeetings)',
    registry: inService ? 'service' : null,
    askedAction: asked,
    boundaryOnly,
    actionCrosses: crosses,
  })
}

// ★ ROUND 96 (real machine): the boundary refusal carried `boundaryOnly`/`askedAction`/`registry`/`actionCrosses`
// on the ERROR object, but the receipt was rebuilt from code/message/hint alone — so docs/03 promised fields a
// program never received, and the message named the verb "this action" because `live()` was called without one.
export function refusalDetails(e) {
  if (!e || typeof e !== 'object') return null
  const out = {}
  for (const k of ['registry', 'askedAction', 'actionCrosses', 'boundaryOnly']) {
    if (e[k] !== undefined) out[k] = e[k]
  }
  return Object.keys(out).length ? out : null
}

/**
 * ★ RUN 125 / F-125a — THE PRIMITIVE DOOR MUST HONOUR THE SAME SEAT GATE AS THE SERVICE DOOR.
 *
 * WHAT WAS MEASURED (run 125): the pack declares `vmu.meetings.conveneRequiresChair` /
 * `vmu.meetings.closeRequiresChair` = true and the teaching says so (`packs/v5r/prompts/v5r-blocks-b.js:798`), the
 * SERVICE face refused a member's convene by name — and the same member opened, muted and CLOSED a PRIMITIVE meeting
 * through this face with `ok:true` receipts (`mtg-r2-attempt-1`). A rule about "only the chair convenes/closes" was
 * enforced on one of two doors; the other door was open.
 *
 * WHY THE GATE LIVES HERE AND NOT IN `kernel/meeting.js`: the primitive object is intentionally pack-agnostic (a
 * factory, no seats). The POLICY is a declared setting that a pack turns on, so the face that speaks to seats reads
 * the setting and the roster through two kernel accessors (`settingOf`, `seatOfMember`) — no policy constant is
 * copied into this file, and a deployment with the settings off keeps the old behaviour exactly.
 *
 * WHAT IT DOES NOT DECIDE: a caller that names NO member (the office/root path, and every fixture that has no seats)
 * is not refused — this face cannot tell a chair from a member without a name, and inventing one would refuse work
 * that was never in question. That case is DISCLOSED in the receipt (`chairGate.enforced:false` + why) rather than
 * passing silently, so "the gate did not run" is never mistaken for "the gate passed".
 */
function chairGateOf({ kernel, setting, caller }) {
  let on = false
  try { on = typeof kernel.settingOf === 'function' ? kernel.settingOf(setting) === true : false } catch { on = false }
  if (!on) return null
  const who = caller === undefined || caller === null || String(caller) === '' ? null : String(caller)
  if (!who) return { setting, on: true, caller: null, seat: null, enforced: false, why: 'no caller was named (member/by/actor): this face cannot read a seat, so the chair gate did not run — pass the acting member id to have it enforced' }
  // ★ RUN 125 (second pass, caught by the pack-agnostic fixtures): an EMPTY roster is not evidence that this caller
  // is a non-chair — it is evidence that this deployment has no seats at all (a kernel boot without the v5r pack, and
  // every fixture that never hires). Refusing there would enforce a policy against objects that do not exist. The
  // gate reports that it did not run, by name, for the same reason the no-caller case does.
  const rosterSize = (() => { try { const r = kernel.members && typeof kernel.members.roster === 'function' ? kernel.members.roster() : null; return Array.isArray(r) ? r.length : -1 } catch { return -1 } })()
  if (rosterSize === 0) return { setting, on: true, caller: who, seat: null, enforced: false, why: 'the roster is empty: this deployment has no seats, so this face cannot tell the chair from anyone else — the chair gate did not run' }
  const seat = (() => { try { return typeof kernel.seatOfMember === 'function' ? kernel.seatOfMember(who) : null } catch { return null } })()
  if (seat === 'chair') return { setting, on: true, caller: who, seat, enforced: true }
  return { setting, on: true, caller: who, seat, enforced: true, refuse: true, why: seat === null ? 'the roster holds no seat row for this id, so it is not the chair' : 'slot "' + seat + '" is not the chair seat' }
}

export function makeMeetingSpec({ param, refused, TOOL_NAMES, kernel }) {
  // ★ G7 (real machine): a ballot opened from this face is bound to (service meeting, motion) so that cast votes can
  // be mirrored into the ONE authoritative tally. Keyed by ballot id, per spec instance.
  const ballotRefs = new Map()
  return {
      name: TOOL_NAMES.meeting,
      description: 'vmu 会议/表决面：action=list|types|open|speak|silent|hand|refuse|invite|invitedspeak|end|aggregation|complete|phase|status|summary|snapshot|close|extend|lapse|revokelapse|ballot|vote|tally|reopen|freeze|unfreeze|boxopen|boxcast|boxclose|boxreopen|boxlapse|boxrevokelapse|flow|overrideorder。' +
        '会议与表决是**逐对象原语**（内核给工厂、pack 给政策）；本工具只用**内核已登记的实例 id** 寻址（未知 id 具名拒）。' +
        '★ **A2（轮 1）：一个会议对象，两个面都能寻址。** `list` 返回两套注册表：`meetings`（原语）、`serviceMeetings`（`vmu.meetings` 服务，即 `vibe_v5_meeting` 建的那些）、`unionMeetings`（并集）；`status`/`speak`/`close` **先找原语、找不到再找服务**（服务侧的 `status` 带 `registry:"service"` 与动议视图，`speak` 走服务的发言面，`close` 走服务的收束并**进归档**，回执带 `registry` 与 `closeSemantics`）。两处都没有 ⇒ 具名 `VMU_NO_SUCH_OBJECT`，hint **逐条列出两个 id 空间**。' +
        '★ **D9（轮 12）：邀请/举手/发言序在 SERVICE 会议上真的可达。** `hand`（成员**自荐**入发言队列）、`invite`（**只有主席**：`member` 单个或 `members` 数组**按给定顺序批量**入队，回执 `order` 读回真实队列）、`invitedspeak`（走服务的发言面，回执带 `wasQueued` 说明他是否真在队列里）、`order`（**只读**发言序 `{mode,source,order,queueOpen}`）、`attend`（**发言的前提**：服务的 `speak` 要求在场，而 `open` 只让主席在席）。这五个 action **先找原语、找不到再找服务**，服务侧回执带 `registry:"service"`；**邀请≠签到**（邀请不改 quorum，被邀者须自己 `attend` 后才 `speak`）。`hands` 的**队列管理**（grant/revoke/clear）在服务面上**不存在**，因此**具名拒**并说明缺哪块，绝不假装成功。' +
        '要点：**被拒输入不推进轮次**（refuse）；**受邀发言只记、不计票、不阻塞收束**（invite/invitedspeak）；' +
        '**聚合必须先显式结束辩论**（end ⇒ aggregation.allowed=true，R10-2a）；**表决期冻结**由逐场票箱原语承载（freeze/unfreeze）。' +
        '**F28 有界兜底**：超过声明的墙钟上限（`vmu.meetings.hardLimitMs`）后可用 **lapse** 具名收束（回执带 `{name,why,at,revocable}`），**未到上限会具名拒**，收束后可用 **revokelapse（必须给理由）**恢复；`extend` 是**声明步长**的延长命令（读 `speechExtendMs/Max`）。' +
        '**选项式投票板**是另一层（`kernel/ballotbox.js`：选项/门槛/记名/弃权，**已裁定的板不再收票**）：boxopen/boxcast/boxclose/boxreopen，' +
        '其中 **boxreopen 需理由**且受 `vmu.ballot.reopenFloor` 约束（门槛只升不降）；若构造时声明了 `openMaxMs`，则 **boxlapse/boxrevokelapse** 对它提供同一套有界兜底。' +
        '**发言序/地面（B③/B④，Round 14）**：`flow` 设**四种地面模式**（open 无队列｜hands 按举手序｜round_robin 按已发言次数｜call_on 主席指定），`overrideorder` **覆盖发言序**（fifo｜round-robin｜chair｜random，random 为**确定性**洗牌：种子与结果 order 都写进回执）。**两者都只由主席做、都必须给 reason**，且**未声明 `vmu.meetings.orderMode` 的部署一律具名拒**（默认不可覆盖）。★ 这两个 action 寻址的是 **`vmu.meetings` 服务记录**（`kernel/meetings.js`），**不是**上面 `open` 造的逐对象会议 id —— 未知 id 由服务**具名拒**（hint 列出在活记录）。',
      parameters: {
        action: param('string', 'list｜open｜speak｜silent｜hand｜hands｜order｜refuse｜invite｜invitedspeak｜attend｜end｜aggregation｜complete｜phase｜status｜summary｜snapshot｜close｜extend｜extendlimit｜proceed｜lapse｜revokelapse｜ballot｜vote｜tally｜reopen｜freeze｜unfreeze｜boxopen｜boxcast｜boxclose｜boxreopen｜boxlapse｜boxrevokelapse｜second｜withdraw｜flow｜overrideorder', { required: true,
          enum: ['list', 'open', 'speak', 'silent', 'hand', 'hands', 'order', 'refuse', 'invite', 'invitedspeak', 'attend', 'end', 'agendaclose', 'agendaitems', 'leaverequest', 'leaveapprove', 'leaverequests', 'aggregation', 'complete', 'phase', 'status', 'summary', 'snapshot', 'close', 'extend', 'lapse', 'revokelapse', 'ballot', 'vote', 'tally', 'reopen', 'freeze', 'unfreeze', 'boxopen', 'boxcast', 'boxclose', 'boxreopen', 'boxlapse', 'boxrevokelapse', 'second', 'withdraw', 'flow', 'overrideorder', 'extendlimit', 'proceed', 'types'] }),
        id: param('string', '会议 id（speak/silent/hand/refuse/invite/invitedspeak/end/aggregation/complete/phase/status/summary/snapshot/close/extend/lapse/revokelapse 必填；open 可指定）'),
        meeting: param('string', '会议 id 的【别名】：与 id 同义（两者都接受；同时给且不一致 ⇒ 具名拒）。ballot 用它把票绑定到服务会议，见 summary/close 与 ballot 的读数'),
        ballotId: param('string', '表决/票箱 id（vote/tally/reopen/freeze/unfreeze/boxcast/boxclose/boxreopen/boxlapse/boxrevokelapse 必填）'),
        member: param('string', '成员 id（speak/silent/hand/refuse/attend/invitedspeak/extend/vote/boxcast 必填；invite 用它邀一个人——批量用 members）'),
        members: param('array', 'invite 的**批量形**：按数组顺序把一串成员放进发言队列（「批量指定成员按一定顺序发言」）。与 member 互斥（同时给 ⇒ 具名拒）；顺序就是队列顺序，回执 order 读回真实队列'),
        text: param('string', '发言内容（speak/refuse/invitedspeak 必填）'),
        reason: param('string', 'silent/close/reopen/refuse/end/freeze/unfreeze/boxreopen/**revokelapse/boxrevokelapse** 的原因（end 与两个撤销必填：无理由的结束/撤销正是这条规则要防的静默动作）'),
        // ★ RUN 125: `force` was not declared on this face at all, so the ONE thing the primitive close needs to end a
        // round early (`force:true`, offered by its own hint) could not be passed here — the hint named a door with no key.
        force: param('boolean', 'close 的**强制提前收会**：回合没跑完时内核默认拒（仲裁者/主席可能要等全员），`force:true` 才允许提前收（这是有意的两段式，不是绕过门）'),
        ms: param('number', 'extend 的延长毫秒数（缺省读 vmu.meetings.speechExtendMs，仍为 0 ⇒ 具名拒）'),
        agenda: param('string', 'open 的议程文本'),
        roster: param('array', 'open 的成员清单（默认取该会议的既定语料）'),
        // ★★★ RUN 45: `subject` was not even declared — the live run passed `subject:"…"` to `open`, the argument never
        // reached any record, and the receipt still said `ok:true`. It is a parameter of the OPEN act on the SERVICE
        // face (`openSeq({subject})`), so it is documented here and DISCLOSED as dropped by the primitive open.
        subject: param('string', 'open：本会议"在议什么"的引用（v5r 的 debate 必须有它）。★ 原语会议记录**没有** subject 字段：本面**不假装设置**它——回执把它列进 `dropped` 并指向真正承载它的面（v5 服务的 `open` / pack 的 convene）'),
        secretary: param('string', 'open：声明本会议的记录人（记录权；不带来表决权）'),
        motion: param('string', 'second/withdraw：动议 id'),
        rules: param('object', 'boxopen：逐票箱规则 { minVotes, allowRevote, maxChoices, minChoices, mode }'),
        options: param('array', 'boxopen 的选项清单（≥2；也可用 roster 传）'),
        target: param('string', 'ballot 的标的（必填）'),
        value: param('string', 'vote 的票值（必填）'),
        kind: param('string', 'vote 的票型（默认 decisive）。★ **不是会议 kind**：`open` 上收到 `kind` 会**具名拒**（同一参数名两个含义，见 open 的 hint）', { enum: ['decisive', 'advisory'] }),
        // Round 8 (A): the hand-queue management face (chair-only, audited; clear/revoke need a reason).
        op: param('string', 'hands：grant｜revoke｜clear｜list', { enum: ['grant', 'revoke', 'clear', 'list'] }),
        scope: param('string', 'hands clear/revoke 的作用域（all｜round）', { enum: ['all', 'round'] }),
        why: param('string', 'invite 的理由（必填：邀请必须可审计，v5r meeting_invite 的口径）；flow/overrideorder 也读 reason 作理由（必填）'),
        by: param('string', 'invite/invitedspeak/end 的执行人（审计事实）；**服务会议的 invite 必填且必须等于该会议的主席**（权限只在看得见席位的那一层执行）；flow/overrideorder 必填且必须是该会议的主席'),
        actor: param('string', '谁在动作（审计事实）：true 的政策下 close/extendlimit 必须给，且必须等于该会议的主席（vmu.meetings.closeRequiresChair/extendRequiresChair）；省略时 close 退回到 by，再退回到 member（同一个人的三种写法，不是猜测）'),
        // ★ 会议级延长（规则「院士可延长会议时长上界」）。★ 与 `extend` 区分：`extend` 是【发言】延长，
        // 读 speechExtendMs/Max；`extendlimit` 是【会议墙钟上界】延长，读 extendCeilingMs。两个上界两个面。
        mode: param('string', 'flow/overrideorder 的模式（flow：open｜hands｜round_robin｜call_on；overrideorder：fifo｜round-robin｜chair｜random）', { enum: ['open', 'hands', 'round_robin', 'call_on', 'fifo', 'round-robin', 'chair', 'random'] }),
      },
      run: async ({ action, id, meeting: meetingArg, ballotId, member, members, text, reason, agenda, roster, subject, target, value, kind, why, by, options, ms, op, scope, mode, secretary, motion, rules, actor, force } = {}) => {
        // ★ RUN 84: the crossing set lives at module scope (SERVICE_CROSSING_ACTIONS) so the refusal, this loop and the
        // test that reads the sentence all agree on it.
        const need = (v, what) => { if (v === undefined || v === null || v === '') throw Object.assign(new Error(what + ' is required'), { code: 'VMU_INVALID_ARGUMENT' }); return v }
        // ★ G7 (real machine): `meeting` and `id` name the same object but only `id` was read, so a caller that used
        // the documented-in-the-task `meeting:"m1"` got `no live meeting with id undefined`. BOTH are accepted now; a
        // DISAGREEMENT is refused by name (silently preferring one would act on the wrong meeting).
        const idText = (v) => (v === undefined || v === null || String(v) === '' ? '' : String(v))
        if (idText(id) && idText(meetingArg) && idText(id) !== idText(meetingArg)) {
          return refused('VMU_INVALID_ARGUMENT', 'id and meeting name different meetings: ' + idText(id) + ' vs ' + idText(meetingArg),
            'pass ONE meeting id; `meeting` is an alias of `id` (both are accepted for the same object)')
        }
        if (action !== 'open' && !idText(id) && idText(meetingArg)) id = idText(meetingArg)
        const live = (what = action) => {
          const meeting = kernel.liveMeeting(need(id, 'id'))
          // ★ THE REFUSAL MUST NOT MISLEAD. A meeting opened through the SERVICE registry really exists, but most
          // actions still address the primitive registry only, so a bare "no live meeting with id" reads as "that
          // meeting does not exist". Name the actual situation and the actions that DO cross registries.
          if (!meeting) {
            const svcIds = (() => {
              try {
                const s = kernel.meetings && kernel.meetings.status ? kernel.meetings.status() : null
                return s && Array.isArray(s.liveMeetings) ? s.liveMeetings : []
              } catch { return [] }
            })()
            const inService = svcIds.includes(String(id))
            throw primitiveMissError({ id, inService, action: what })
          }
          return meeting
        }
        const liveBallot = () => {
          const ballot = kernel.liveBallot(need(ballotId, 'ballotId'))
          if (!ballot) throw Object.assign(new Error('no live ballot with id ' + String(ballotId)), { code: 'VMU_NO_SUCH_OBJECT', hint: 'use action=list' })
          return ballot
        }
        // ── A2 (round 1): THE SECOND REGISTRY ───────────────────────────────────────────────────────────────
        // The v5 pack's `vibe_v5_meeting` opens a `vmu.meetings` SERVICE record; this face's `open` builds a
        // per-object PRIMITIVE. A2 makes the four addressed actions cross that boundary: primitive FIRST (its
        // behaviour is unchanged), service as the fallback, and a refusal that NAMES both spaces when neither has
        // the id. Reads are freely cross-face; writes say WHICH registry they wrote to in the receipt.
        const svcOf = () => (kernel && kernel.meetings) || null
        const serviceIds = () => {
          const svc = svcOf()
          if (!svc || typeof svc.status !== 'function') return []
          try { return (svc.status().liveMeetings || []).slice() } catch (e) { return [] }
        }
        /** Does the SERVICE registry hold this id? A read (`meetingView`), so the answer is a fact, not a guess. */
        const serviceHas = (idv) => {
          const svc = svcOf()
          if (!svc || typeof svc.meetingView !== 'function' || idv === undefined || idv === null || String(idv) === '') return false
          try { svc.meetingView({ meeting: String(idv) }); return true } catch (e) { return false }
        }
        const noSuchMeeting = (idv) => Object.assign(
          new Error('no meeting with id ' + String(idv) + ' in either meeting registry (primitive or service)'), {
            code: 'VMU_NO_SUCH_OBJECT',
            hint: 'primitive registry: ' + ((kernel.liveList().meetings || []).join(', ') || '(none)')
              + ' ; service registry: ' + (serviceIds().join(', ') || '(none)')
              + ' ; action=list reports both (id and meeting are aliases of the same field)',
          })
        const sid = (idv) => String(idv === undefined || idv === null ? '' : idv)
        // ★ G7: "错传只报 id undefined" — the refusal must say WHICH field the action reads. Both names are accepted.
        const meetingFieldRefusal = (a) => refused('VMU_INVALID_ARGUMENT', 'action ' + a + ' needs a meeting id (got neither id nor meeting)',
          'pass id:"<meeting id>" — `meeting:"<id>"` is an accepted alias; action=list shows the primitive and service ids')
        try {
          // ★★ ROUND 102 / F-100e: A MEMBER'S SEAT HAS THIS FACE, NOT THE PACK'S. Run 100's member tried to convene with
          // `kind:"academic"` and got "this face's kind is the BALLOT kind" while the six MEETING types (declared by the
          // institution in vmu.meetings.typeCatalog) existed only on `vibe_v5_meeting`, which the member's seat does not
          // hold. The vocabulary a member must obey was unreadable from the seat that must obey it. `types` reads the
          // DECLARED catalog (settings) and says which registry owns it — it does not invent a vocabulary of its own.
          if (action === 'types') {
            const declared = (() => {
              try {
                const view = kernel.settingsView && kernel.settingsView()
                const v = view && typeof view.get === 'function' ? view.get('vmu.meetings.typeCatalog') : null
                return Array.isArray(v) ? v.map(String) : []
              } catch { return [] }
            })()
            return {
              ok: true, action: 'types',
              declaredMeetingTypes: declared,
              declaredSource: 'vmu.meetings.typeCatalog',
              ballotKinds: ['decisive', 'advisory'],
              ballotKindMeans: 'this face\u2019s `kind` is the BALLOT kind (what a vote decides), not the meeting type: `open`/`ballot` take decisive|advisory',
              meetingTypeOwner: 'vibe_v5_meeting',
              meetingTypeOwnerMeans: 'meeting TYPES (ordinary/academic/debate/closure/paper/planning by default) are a field of the meetings SERVICE record, so they are declared and validated by `vibe_v5_meeting`; this primitive face refuses a meeting type by name rather than guessing',
              means: 'the declared meeting types are the vocabulary the SERVICE face validates - read them here, then convene with vibe_v5_meeting { type }; an empty list means the institution declared none, and then the service face uses its own default set',
            }
          }
          if (action === 'list') {
            const prim = kernel.liveList()
            const services = serviceIds()
            const unionMeetings = [...new Set([...(prim.meetings || []), ...services])].sort()
            // ★ ROUND 37: live ids only used to be reported, so an archived meeting looked like it never existed.
            const svcL = svcOf()
            let archivedMeetings = []
            if (svcL && typeof svcL.archivedIds === 'function') {
              try { archivedMeetings = svcL.archivedIds().slice() } catch (e) { archivedMeetings = [] }
            }
            // ★★★ RUN 45 (the institute's own report): `unionMeetings` ALREADY listed the primitive meeting, but the
            // receipt never said so — the run had opened `m-r45` through this same tool and still read
            // `unionMeetings` as if it were the service list, then hit `VMU_NO_OPEN_MEETING` from the pack face with no
            // way to tell "not open" from "open in the other table". The UNION is the answer, and it must say what it
            // is: which registry each list comes from, and (the question a reader actually had) whether ARCHIVED ids
            // are in it. They are NOT: an archived record is closed, `archivedMeetings` reports those separately.
            const primitiveMeetings = (prim.meetings || []).slice()
            return Object.assign({ ok: true, action }, prim, {
              registry: 'both',
              primitiveMeetings,
              serviceMeetings: services,
              archivedMeetings,
              unionMeetings,
              unionMeetingsIncludesArchived: false,
              registriesMeans: '`meetings`/`primitiveMeetings` = the PRIMITIVE registry (`vibe_vmu_meeting {action:"open"}`, per-object kernel/meeting.js); `serviceMeetings` = the vmu.meetings SERVICE (`vibe_v5_meeting {action:"open"}`, the one the pack face addresses); `unionMeetings` = their LIVE union, so it contains NO archived id — `archivedMeetings` lists closed service records separately (they stay readable through summary)',
            })
          }
          if (action === 'open') {
            // ★★★ LIVE RUN 45 (the institute's own report): `open` ACCEPTED ARGUMENTS IT COULD NOT HONOUR AND SAID
            // `ok:true` ABOUT THE RESULT. The run called `open { id:"m-r45", kind:"debate", subject:"…" }` and got
            // `{ok:true, state:"in_session"}` with the receipt's `kind` silently reverted to the primitive default
            // `"general"` and `subject` nowhere at all; the follow-up `status` then reported `kind:"general"` as if that
            // were what had been asked for. Silent argument loss on a SUCCESS receipt is the same defect family as a
            // false green, so the two arguments get two different answers (both were silence before):
            //   · `kind` is AMBIGUOUS ON THIS FACE: it is the BALLOT's kind (`vote`: decisive|advisory), while a
            //     MEETING kind (debate/academic/…) is a field of the meetings SERVICE record. Guessing which one the
            //     caller meant is exactly how "debate" became "general" with ok:true, so an explicit `kind` on `open`
            //     is REFUSED BY NAME, with the face that does carry it — never dropped, never guessed.
            //   · `subject` is a pointer, not a kind: this primitive record has no subject field at all, and failing
            //     the whole open over it would throw away a meeting that is perfectly usable. So the open proceeds and
            //     the receipt names it in `dropped` (with where it belongs). `dropped:[]` on every open receipt is the
            //     invariant: an empty list means "nothing was thrown away", not "we did not look".
            const kindText = (kind === undefined || kind === null) ? '' : String(kind).trim()
            if (kindText !== '') {
              return refused('VMU_INVALID_ARGUMENT',
                'action open does not take `kind`: on this face `kind` is the BALLOT kind (vote: decisive|advisory), while a MEETING kind (debate/academic/…) is a field of the meetings SERVICE record — and this action builds a per-object PRIMITIVE meeting whose kind is fixed at "general"',
                'refusing rather than guessing which meaning you meant (live run 45: kind:"debate" came back as a "general" meeting on an ok:true receipt). For a meeting KIND use the SERVICE face — vibe_v5_meeting {type:"debate", agenda:"<what is discussed>", member:"<chair id>"} — or omit kind here and open the primitive meeting as it is (this face has no action/kind/subject on the service path: a live run 46 caller tried exactly that shape and it does not exist). On the service face a debate ALSO needs subject ("a debate meeting needs a subject") and the chair must have a recorded turn first (VMU_CHAIR_ACT_NOT_DELEGATED) — run 47 measured three calls to get through all three checks')
            }
            // ★ RUN 125 / F-125a: the PRIMITIVE door honours the same seat gate the service door does.
            const openGate = chairGateOf({ kernel, setting: 'vmu.meetings.conveneRequiresChair', caller: member !== undefined && member !== null && String(member) !== '' ? member : by })
            if (openGate && openGate.refuse) {
              return refused('VMU_NOT_PERMITTED',
                openGate.setting + '=true: convening is an academician (chair seat) action; "' + openGate.caller + '" is ' + (openGate.seat === null ? 'not on the roster' : 'in slot "' + openGate.seat + '"'),
                'call it from a member seated in the chair slot (the chair gate is declared by the pack and enforced on BOTH doors: the service face `vibe_v5_meeting` and this primitive face); the office (root) may convene without a member seat')
            }
            const meeting = kernel.meeting({ id: id || undefined, roster: Array.isArray(roster) ? roster : undefined })
            if (typeof secretary === 'string' && secretary !== '') meeting.secretary = secretary
            // ★★★ LIVE RUN 31 (the institute's own report): a REFUSED convene must leave no record. `kernel.meeting()`
            // has already put the id in the live table, so a named refusal here (VMU_MEETING_TOO_SMALL, VMU_STATE, …)
            // used to strand a half-built meeting that then refused the corrected retry with VMU_CONFLICT. The face
            // that created it is the face that forgets it — on the throw path only, and only when the meeting never
            // reached a live state (state "idle" is not a meeting anyone can address).
            try {
              await meeting.convene(agenda === undefined ? null : agenda)
              await meeting.openRound({ members: Array.isArray(roster) ? roster : null })
            } catch (e) {
              try { if (typeof kernel.forgetMeeting === 'function') kernel.forgetMeeting(meeting.id) } catch (ignored) { /* the refusal is the answer */ }
              throw e
            }
            // ★ PHASE 7: the SERVICE record (which owns motions/resolutions) must learn the SAME id, or a tool-declared
            // secretary could never be honoured by the service's resolution check. Only declared ⇒ this call happens
            // (zero mechanism: no secretary ⇒ no service record created here).
            let serviceMeeting = null
            let serviceError = null
            if (typeof secretary === 'string' && secretary !== '') {
              const svc = kernel && kernel.meetings ? kernel.meetings : null
              if (svc && typeof svc.open === 'function') {
                try { serviceMeeting = svc.open({ id: meeting.id, roster: Array.isArray(roster) ? roster : undefined, secretary, adoptForeign: true }).meeting }
                catch (e) { serviceError = { code: (e && e.code) || 'VMU_ENGINE_UNAVAILABLE', message: String((e && e.message) || e) } }
              } else serviceError = { code: 'VMU_ENGINE_UNAVAILABLE', message: 'kernel.meetings service is not mounted' }
            }
            // ★ RUN 45: the arguments this act CANNOT store are NAMED in the receipt instead of vanishing. Same
            // discipline as the `dropped` list in the resume/restore reports: an empty list is an assertion that
            // nothing was thrown away, and a non-empty one is a pointer to the face that does carry it.
            const dropped = []
            const droppedWhere = {}
            const subjectText = (subject === undefined || subject === null) ? '' : String(subject).trim()
            if (subjectText !== '') {
              dropped.push('subject')
              droppedWhere.subject = 'the PRIMITIVE meeting record has NO subject field (kernel/meeting.js keeps id/kind/state/agenda/roster, and `subject` is read back only from the SERVICE record). It was NOT stored: pass it to the service face instead — vibe_v5_meeting {action:"open", subject:"…"} (or the pack convene face, which requires it for a debate). This open still created the primitive meeting, so the pointer is disclosed as dropped rather than failing the call'
            }
            return { ok: true, action, id: meeting.id, state: meeting.state, phase: meeting.phase, secretary: meeting.secretary || null,
              registry: 'primitive', serviceMeeting, dropped,
              ...(openGate ? { chairGate: openGate } : {}),
              ...(dropped.length ? { droppedNote: droppedWhere } : {}),
              ...(serviceError ? { serviceError } : {}) }
          }
          if (action === 'speak') {
            const pid = sid(id)
            const primitive = kernel.liveMeeting(pid)
            if (primitive) return Object.assign({ ok: true, action, id }, await primitive.speak(need(member, 'member'), need(text, 'text')))
            // A2: a SERVICE meeting has its own speech face (`meetings.speak`, which enforces presence/quota/budget).
            // Supporting it here means no new policy — the service decides, this face only routes and names the registry.
            const svc = svcOf()
            if (svc && typeof svc.speak === 'function' && serviceHas(pid)) {
              return Object.assign({ ok: true, action, id: pid, registry: 'service' },
                svc.speak({ meeting: pid, member: need(member, 'member'), text: need(text, 'text') }))
            }
            throw noSuchMeeting(pid)
          }
          if (action === 'silent') {
            // ★ RUN 125 / F-125a (second half, measured the same run): r-2 marked the CHAIR silent (`silent {member:"r-acad", by:"r-2"}`)
            // with an ok:true receipt. Withdrawing someone ELSE's speech is an attribution act, not a floor act: a
            // member may withdraw its own, only the chair may withdraw another's. This guard is seat-independent (it is
            // about who may speak FOR whom, like blueprint adopt naming another member), so it does not read a setting.
            const who = member === undefined || member === null ? '' : String(member)
            const actorId = by === undefined || by === null || String(by) === '' ? (actor !== undefined && actor !== null && String(actor) !== '' ? String(actor) : '') : String(by)
            if (who !== '' && actorId !== '' && actorId !== who) {
              const actorSeat = (() => { try { return typeof kernel.seatOfMember === 'function' ? kernel.seatOfMember(actorId) : null } catch { return null } })()
              if (actorSeat !== 'chair') {
                return refused('VMU_NOT_PERMITTED',
                  "silent names member \"" + who + "\" but the caller is \"" + actorId + "\" (" + (actorSeat === null ? "not on the roster" : "slot \"" + actorSeat + "\"") + "): a member may withdraw only its OWN speech; withdrawing another member's speech is the chair seat's act",
                  'call silent with your own member id (or omit `by` and pass only your own id), or let the chair withdraw that speech')
              }
            }
            return Object.assign({ ok: true, action, id }, await live().markSilent(need(member, 'member'), reason || 'no input'))
          }
          // ── D9: 举手 ────────────────────────────────────────────────────────────────────────────────────────────
          // A primitive meeting raises a hand (`handUp`, which respects the round's ask list). A SERVICE meeting has
          // no hand-up at all — its floor is a QUEUE, so "raising a hand" IS "put myself in the queue" (`queue`).
          // No second book of who wants the floor is created here.
          if (action === 'hand') {
            const pid = sid(id)
            if (!pid) return meetingFieldRefusal('hand')
            const primitive = kernel.liveMeeting(pid)
            if (primitive) return Object.assign({ ok: true, action, id }, primitive.handUp(need(member, 'member')))
            const svc = svcOf()
            if (svc && typeof svc.queue === 'function' && serviceHas(pid)) {
              const who = String(need(member, 'member'))
              const out = svc.queue({ meeting: pid, member: who, by: who })
              return Object.assign({ ok: true, action, id: pid, registry: 'service', source: 'self' }, out)
            }
            throw noSuchMeeting(pid)
          }
          if (action === 'refuse') return Object.assign({ ok: true, action, id }, live().refuseInput(need(member, 'member'), text || '', reason || 'refused'))
          // ── D9: 邀请发言（单个或批量按序）────────────────────────────────────────────────────────────────────────
          // The primitive face keeps an INVITE LEDGER (invited/invitedOrder, audited, never counted). A service meeting
          // has no ledger and this face will not invent one: an invitation on the SERVICE is "the chair puts this
          // person on the floor queue". The CHAIR RAIL lives here because this is the only place that can see the
          // seat (`meetingView().chair`) — the service's `queue()` accepts anyone under fifo, so without this gate a
          // member could invite on the chair's behalf.
          if (action === 'invite') {
            const pid = sid(id)
            if (!pid) return meetingFieldRefusal('invite')
            const primitive = kernel.liveMeeting(pid)
            if (primitive) return Object.assign({ ok: true, action, id }, primitive.invite(need(member, 'member'), { by: by || null, why: need(why, 'why') }))
            const svc = svcOf()
            if (svc && typeof svc.queue === 'function' && serviceHas(pid)) {
              const reason = need(why, 'why')
              const actor = by === undefined || by === null || by === '' ? null : String(by)
              if (actor === null) {
                return refused('VMU_INVALID_ARGUMENT', 'action invite on service meeting ' + pid + ' needs by:"<the chair id>"',
                  'an invitation must be auditable: name WHO invites (the chair). A member who wants the floor invites THEMSELVES with action=hand { id, member:"<own id>" }')
              }
              let chair = null
              if (typeof svc.meetingView === 'function') {
                try { const view = svc.meetingView({ meeting: pid }); chair = view && view.chair ? String(view.chair) : null } catch (e) { chair = null }
              }
              if (!chair) {
                return refused('VMU_ENGINE_UNAVAILABLE', 'meeting ' + pid + ' declares no chair, so nobody holds the authority to invite',
                  'the invitation face consults the chair seat (kernel meetings.open({ chair })); with no chair it must refuse rather than pick an authority')
              }
              if (actor !== chair) {
                return refused('VMU_NOT_PERMITTED', 'invite is a CHAIR action on meeting ' + pid + '; "' + actor + '" is not the chair (' + chair + ')',
                  'only the chair invites or orders speakers; a member puts THEMSELVES on the floor with action=hand { id, member:"<own id>" }')
              }
              const batch = Array.isArray(members) ? members : null
              const single = member === undefined || member === null || String(member) === '' ? null : String(member)
              if (batch && single !== null) {
                return refused('VMU_INVALID_ARGUMENT', 'action invite takes EITHER member (one guest) OR members (an ordered list), not both',
                  'pass members:["r-1","r-2"] to invite a batch in that order, or member:"r-1" for a single invitation')
              }
              let list = []
              if (batch) {
                if (batch.length === 0) return refused('VMU_INVALID_ARGUMENT', 'invite needs at least one member: `members` is empty', 'pass members:["r-1", …]')
                list = batch.map((x) => String(x === undefined || x === null ? '' : x).trim())
                const blank = list.filter((x) => x === '')
                if (blank.length > 0) return refused('VMU_INVALID_ARGUMENT', '`members` holds an empty entry', 'every entry must be a member id, in the order they should speak')
              } else list = [String(need(member, 'member'))]
              const receipts = list.map((who) => {
                const row = svc.queue({ meeting: pid, member: who, by: actor })
                return row && row.receipt ? row.receipt : row
              })
              const floor = typeof svc.orderView === 'function' ? svc.orderView({ meeting: pid }) : null
              return { ok: true, action, id: pid, registry: 'service', invited: list, why: reason,
                order: floor ? floor.order : null, mode: floor ? floor.mode : null, modeSource: floor ? floor.source : null,
                queueOpen: floor ? floor.queueOpen : null, receipts,
                note: 'the invitation puts the listed members ON THE FLOOR QUEUE in exactly this order; it does NOT mark them present — attendance stays their own act (action=attend), so an invitation never changes the quorum' }
            }
            throw noSuchMeeting(pid)
          }
          // ── D9: 被邀者发言 ──────────────────────────────────────────────────────────────────────────────────────
          // On a SERVICE meeting the invited voice speaks through the service's OWN speech face (minutes, budget,
          // quota, discipline-mute all stay where they live). `wasQueued` is READ BACK before speaking so the receipt
          // says whether this person had actually been invited — the queue IS the invitation, and no ledger is faked.
          if (action === 'invitedspeak') {
            const pid = sid(id)
            if (!pid) return meetingFieldRefusal('invitedspeak')
            const primitive = kernel.liveMeeting(pid)
            if (primitive) return Object.assign({ ok: true, action, id }, primitive.speakInvited(need(member, 'member'), need(text, 'text'), { by: by || null }))
            const svc = svcOf()
            if (svc && typeof svc.speak === 'function' && serviceHas(pid)) {
              const who = String(need(member, 'member'))
              const body = need(text, 'text')
              let wasQueued = null
              if (typeof svc.orderView === 'function') {
                try { const floor = svc.orderView({ meeting: pid }); if (floor && Array.isArray(floor.order)) wasQueued = floor.order.indexOf(who) !== -1 } catch (e) { wasQueued = null }
              }
              let out
              try { out = svc.speak({ meeting: pid, member: who, text: body }) } catch (e) {
                if (e && e.code === 'VMU_NOT_MEMBER') {
                  throw Object.assign(e, { hint: 'the speaker must be PRESENT before speaking: call action=attend { id, member:"' + who + '" } first — an invitation only puts a member on the floor queue, it does not forge attendance (attendance is what the quorum counts)' })
                }
                throw e
              }
              return Object.assign({ ok: true, action, id: pid, registry: 'service', wasQueued }, out)
            }
            throw noSuchMeeting(pid)
          }
          if (action === 'end') return Object.assign({ ok: true, action, id }, live().endDebate({ by: by || null, reason: need(reason, 'reason') }))
          // Round 8 (B①): the agenda is closed, never deleted (target names the item; reason is mandatory).
          if (action === 'agendaclose') {
            return Object.assign({ ok: true, action, id }, live().agendaClose({ id: need(target, 'target'), by: by || null, why: reason || '' }))
          }
          if (action === 'agendaitems') return Object.assign({ ok: true, action, id }, { agendaItems: live().agendaItems() })
          if (action === 'aggregation') return Object.assign({ ok: true, action, id }, live().aggregationAllowed())
          if (action === 'complete') return Object.assign({ ok: true, action, id }, live().roundComplete())
          if (action === 'phase') return { ok: true, action, id: need(id, 'id'), phase: live().phase }
          if (action === 'status') {
            const pid = sid(id)
            if (!pid) return meetingFieldRefusal('status')
            const primitive = kernel.liveMeeting(pid)
            if (primitive) {
              // ★★★ RUN 45 (the institute's own report): the receipt did not say WHICH TABLE answered, so the same id
              // read `state:"in_session"` here while the pack face (`vibe_v5_say` / `vibe_v5_verdict_final`) refused it
              // as "no meeting is open" — two true statements about two different registries, with nothing in either
              // receipt naming the split. `registry` is that name (the service branch already carries
              // `registry:"service"`); `registryMeans` says what it implies for the caller's next act, the way the
              // README-level docs would. Still two tables: this field only makes the receipt say which one it read.
              return Object.assign({
                ok: true, action, registry: 'primitive',
                registryMeans: 'this record lives in the PRIMITIVE meeting registry (`vibe_vmu_meeting {action:"open"}`, per-object kernel/meeting.js): read/act on it through THIS face (status/summary/speak/hand/invite/close). The pack face — vibe_v5_say / vibe_v5_verdict_final / vibe_v5_meeting — addresses the meetings SERVICE (`vibe_v5_meeting {action:"open"}`), and it refuses a primitive id by name rather than acting on the wrong table',
              }, primitive.status())
            }
            // A2: the SERVICE view. `meetingView` is the service's own observable read (state/chair/secretary/motions);
            // the quorum view is added when available. `registry:'service'` tells the caller WHICH object answered —
            // the primitive status shape is deliberately left exactly as it was.
            const svc = svcOf()
            if (svc && typeof svc.meetingView === 'function' && serviceHas(pid)) {
              const view = svc.meetingView({ meeting: pid })
              let quorum = null
              if (typeof svc.quorum === 'function') { try { quorum = svc.quorum({ meeting: pid }) } catch (e) { quorum = null } }
              // ★ LIVE RUN 10, finding F: the due-clock pass used to be invisible. The service remembers its LAST pass
              // (`status().sweep`) and this read relays it, so "the deadline was observed" is a fact a caller can see
              // instead of an article of faith. `ran:false` means no pass has happened in this process yet.
              let sweep = null
              if (typeof svc.status === 'function') { try { sweep = svc.status().sweep || null } catch (e) { sweep = null } }
              return Object.assign({ ok: true, action, registry: 'service', quorum, sweep }, view)
          }
          // ★★ ROUND 37 (live run 37): a CLOSED meeting is not a MISSING one. `close` archives the service record, so
          // `meetingView` stops answering and this branch used to say `VMU_NO_SUCH_OBJECT` — while `summary` and the
          // archive answered fine. Three read faces, three answers to "is it closed?". The archive is consulted before
          // the refusal, and the answer says WHERE the record lives now instead of pretending it never existed.
          if (svc && typeof svc.summary === 'function') {
            let archived = null
            try { archived = svc.summary({ meeting: pid }) } catch (e) { archived = null }
            if (archived && archived.ok !== false && archived.state !== undefined && archived.state !== null) {
              return {
                ok: true, action, id: pid, meeting: pid, registry: 'service', archived: true,
                state: String(archived.state),
                stateMeans: archived.stateMeans || null,
                archivedMeans: 'the meeting is closed and lives in the service archive: `summary` carries its motions and votes; `list` reports live and archived ids separately',
                summaryAvailable: true,
                hint: 'read the record with { action: "summary", id: "' + pid + '" }',
              }
            }
          }
          throw noSuchMeeting(pid)
          }
          if (action === 'summary') {
            // A1 round 10 — TWO ID SPACES, TWO READ FACES. A primitive meeting is summarized by the primitive; a
            // meeting created by the v5 pack lives in the meetings SERVICE and is summarized there. This action
            // used to answer ONLY from the primitive registry, so a service meeting got "no live meeting" even
            // though it existed (measured on a real run: open ok, status/list/summary all "no such meeting").
            const pid = sid(id)
            if (!pid) return meetingFieldRefusal('summary')
            const primitive = kernel.liveMeeting(pid)
            // ★ RUN 45: the same registry disclosure as `status` — this is one of the two read faces the refusal hint
            // names, so a reader that follows the hint sees which table answered here too.
            if (primitive) return Object.assign({ ok: true, action, registry: 'primitive' }, primitive.summary())
            const svc = kernel && kernel.meetings ? kernel.meetings : null
            if (svc && typeof svc.summary === 'function') {
              return Object.assign({ ok: true, action }, svc.summary({ meeting: pid }))
            }
            throw noSuchMeeting(pid)
          }
          if (action === 'snapshot') return Object.assign({ ok: true, action }, live().snapshot())
          if (action === 'close') {
            const pid = sid(id)
            if (!pid) return meetingFieldRefusal('close')
            const primitive = kernel.liveMeeting(pid)
            if (primitive) {
              const closeGate = chairGateOf({ kernel, setting: 'vmu.meetings.closeRequiresChair', caller: actor !== undefined && actor !== null && String(actor) !== '' ? actor : (by !== undefined && by !== null && String(by) !== '' ? by : member) })
              if (closeGate && closeGate.refuse) {
                return refused('VMU_NOT_PERMITTED',
                  closeGate.setting + '=true: closing is an academician (chair seat) action; "' + closeGate.caller + '" is ' + (closeGate.seat === null ? 'not on the roster' : 'in slot "' + closeGate.seat + '"'),
                  'let the chair close it (pass actor:"<chair id>"), or finish the primitive meeting through the service face; the office (root) may close without a member seat')
              }
              const out = await primitive.close(reason || 'closed', { force: force === true, by: actor !== undefined && actor !== null && String(actor) !== '' ? String(actor) : (by !== undefined && by !== null && String(by) !== '' ? String(by) : null) })
              return Object.assign({ ok: true, action, id }, out, closeGate ? { chairGate: closeGate } : {})
            }
            // A2: closing a SERVICE meeting uses the service's own close (its rails apply). The two close semantics
            // DIFFER and the receipt says so: the service moves the meeting to its ARCHIVE (it leaves the service
            // live table; `summary` stays the archive read face), while a primitive close keeps it in the live map.
            const svc = svcOf()
            if (svc && typeof svc.close === 'function' && serviceHas(pid)) {
              const out = svc.close({ meeting: pid, actor: actor === undefined ? (by || member || null) : actor })
              // ★★ LIVE RUN 30 (the institute's own report, item ⑥): THE RECEIPT SHOWED TWO TRUTHS AND SAID NOTHING
              // ABOUT THEIR RELATION. The close came back `ok:true` while `vibe_vmu_status` reported
              // `closureVote{cast:false, confirmed:false, votesCast:2, missing:["acad-01"]}` — a reader concluded either
              // "the close was illegal" or "the closure vote was lost". Both wrong: closing moves the meeting to the
              // ARCHIVE under the close RAILS (the `enforced` list), while the closure VOTE is the separate, unanimous
              // "did every enfranchised member judge this question solved" mechanism. The receipt now carries the
              // second reading next to the first, with the sentence that says it neither gated nor was gated by the close.
              const closeClosureVote = (() => {
                try {
                  if (typeof kernel.closureVoteView === 'function') return kernel.closureVoteView()
                  const st = typeof kernel.status === 'function' ? kernel.status() : null
                  return st && st.closureVote ? st.closureVote : null
                } catch (e) { return { readable: false, why: (e && e.message) || String(e) } }
              })()
              const closeEnforced = Array.isArray(out && out.enforced) ? out.enforced : []
              // ★ LIVE RUN 50 (the chair's own report): the close receipt carried `closeSemantics: "service-archives"`
              // and NOTHING else a reader could check it against — no `state`, no `subjectGate`. The chair had to make
              // a second call (`summary`) to learn what the meeting had become, and the run's whole question was
              // whether a decision can be read back. The close KNOWS both facts (it just archived the row), so it
              // states them: the read right after the close is the receipt's own evidence, not a second guess.
              const afterClose = (() => {
                try { return svc && typeof svc.summary === 'function' ? svc.summary({ meeting: pid }) : null } catch (e) { return null }
              })()
              return Object.assign({ ok: true, action, id: pid, registry: 'service', closeSemantics: 'service-archives' }, out, {
                note: 'closed in the meetings SERVICE: the meeting moved to the service ARCHIVE (not the primitive live table); its MOTIONS and the minutes vote events remain readable via action=summary (a BALLOT-BOX decision is a different record: read the box face for its tally)',
                state: afterClose && afterClose.state ? afterClose.state : 'closed',
                stateMeans: 'the meeting AFTER this close, as its own record reads it (the value is read from the archived row, not assumed): a closed meeting has a frozen tally and hidden vote detail',
                archived: true,
                archivedMeans: 'the record left the service live table and is held by the service ARCHIVE; `summary`/`status` read it back by id',
                subjectGate: afterClose && afterClose.subjectGate !== undefined ? afterClose.subjectGate : null,
                subjectGateMeans: afterClose && afterClose.subjectGate === undefined
                  ? 'this close cannot read the archived gate verdict (the archive read failed); the open receipt is still the record of it'
                  : 'the debate-subject verdict stored with the meeting when it was CONVENED — the close receipt repeats it so a closer does not have to make a second call; reading cannot change it',
                // the CLOSURE VOTE is a different mechanism from the close, and this receipt is where a reader meets both
                closureVote: closeClosureVote,
                closureVoteNote: closeClosureVote === null || closeClosureVote === undefined
                  ? 'this kernel publishes no closure-vote reading, so this receipt cannot say whether every enfranchised member judged the question solved — the close below is a fact, the closure vote is UNREAD here'
                  : 'closureVote (cast/confirmed/votesCast/missing) is the SEPARATE unanimity reading over the same INSTANCE, not a requirement of this close and not changed by it: this close passed the rails named in `enforced` (' + (closeEnforced.length ? closeEnforced.join(', ') : 'none listed') + ') while the closure vote reads cast=' + String(closeClosureVote.cast === true) + ', confirmed=' + String(closeClosureVote.confirmed === true) + ', missing=' + JSON.stringify(closeClosureVote.missing || []) + ' — so "closed" does not mean "unanimously judged solved", and a member named in `missing` is who to ask before claiming closure',
              })
            }
            throw noSuchMeeting(pid)
          }
          // F28: the bounded fallback (named + revocable) and the declared extension step (GAP-MTG-05).
          // ★ D9: hands(grant/revoke/clear/list) is the PRIMITIVE floor face. A service meeting's floor is a QUEUE with
          // no dequeue/revoke/scope at all, so this action cannot be honoured there by delegating — it is refused by
          // NAME with the two actions that DO exist on that face (hand = self-queue, invite = chair order).
          if (action === 'hands') {
            const pid = sid(id)
            if (!pid) return meetingFieldRefusal('hands')
            const primitive = kernel.liveMeeting(pid)
            if (primitive) {
              return Object.assign({ ok: true, action, id: pid }, primitive.hands({ op: need(op, 'op'), member: member || null,
                by: by || null, why: reason || '', scope: scope || 'all' }))
            }
            if (svcOf() && serviceHas(pid)) {
              return refused('VMU_ENGINE_UNAVAILABLE', 'the meeting ' + pid + ' is a SERVICE meeting: its floor is a QUEUE and it has no grant/revoke/clear/list of hands',
                'on a service meeting a member raises a hand with action=hand { id, member:"<own id>" } (self-queue) and the chair orders speakers with action=invite { id, by:"<chair>", why:"…", members:[…] }; action=hands is the primitive meeting face')
            }
            throw noSuchMeeting(pid)
          }
          // ★ D9: the READ side of the floor. `queue`/`invite` write the order; without this action the order could be
          // written and never read back, and the batched-invitation ordering claim would be unfalsifiable.
          if (action === 'order') {
            const pid = sid(id)
            if (!pid) return meetingFieldRefusal('order')
            const svc = svcOf()
            if (svc && typeof svc.orderView === 'function' && serviceHas(pid)) {
              return Object.assign({ ok: true, action, id: pid, registry: 'service' }, svc.orderView({ meeting: pid }))
            }
            if (kernel.liveMeeting(pid)) {
              return refused('VMU_INVALID_ARGUMENT', 'order reads the floor ORDER, which only a service meeting has; ' + pid + ' is a primitive meeting',
                'a primitive meeting has a per-round ask list instead of a floor order: read it with action=status (it reports who the round asks)')
            }
            throw noSuchMeeting(pid)
          }
          // ★ D9: ATTENDANCE. A pack-convened service meeting starts with only the chair present (meetings.open puts
          // the chair in `present`), and no other face routed `attend` — so every non-chair member was silently unable
          // to speak at all ("attend() first"). This is PURE DELEGATION: no policy, no default, no role check and no
          // re-worded refusal of our own — the kernel owns who may be marked present and what that does to the quorum.
          // It is deliberately a SEPARATE act from `invite`: inviting puts someone on the floor queue, it never forges
          // attendance (attendance is what the quorum counts).
          if (action === 'attend') {
            const pid = sid(id)
            if (!pid) return meetingFieldRefusal('attend')
            const svc = svcOf()
            if (svc && typeof svc.attend === 'function' && serviceHas(pid)) {
              return Object.assign({ ok: true, action, id: pid, registry: 'service' },
                svc.attend({ meeting: pid, member: need(member, 'member') }))
            }
            if (kernel.liveMeeting(pid)) {
              return refused('VMU_INVALID_ARGUMENT', 'attend marks a member PRESENT in a service meeting; ' + pid + ' is a primitive meeting',
                'a primitive meeting has no present/roster/quorum — it tracks the round ask list instead, readable with action=status')
            }
            throw noSuchMeeting(pid)
          }
          // B② (Round 10): leave requests — asking and deciding are separate acts (the approver is DECLARED).
          if (action === 'leaverequest') {
            return Object.assign({ ok: true, action, id }, live().requestLeave({ meeting: need(id, 'id'), member: need(member, 'member'), why: need(reason, 'reason') }))
          }
          if (action === 'leaveapprove') {
            return Object.assign({ ok: true, action, id }, live().approveLeave({ meeting: need(id, 'id'), member: need(member, 'member'), by: need(by, 'by'), why: need(reason, 'reason') }))
          }
          if (action === 'leaverequests') return Object.assign({ ok: true, action, id }, live().leaveRequests({ meeting: need(id, 'id') }))
          if (action === 'extend') {
            return Object.assign({ ok: true, action, id }, live().extend({ meeting: need(id, 'id'), member: need(member, 'member'), ms: ms === undefined ? null : ms, by: by || null }))
          }
          // ★ PHASE 12 · 会议级延长（规则「院士…延长会议时长上界」）。它只打在 SERVICE 上：
          // 原语注册表的 `extend` 是【发言】延长，两者不是同一个上界。名字分开写，避免"同一个词两种语义"。
          if (action === 'extendlimit') {
            const pid = sid(id)
            if (!pid) return meetingFieldRefusal('extendlimit')
            const svc = svcOf()
            if (svc && typeof svc.extendWall === 'function' && serviceHas(pid)) {
              const out = svc.extendWall({ meeting: pid, ms: ms === undefined ? null : ms, actor: actor === undefined ? (by || null) : actor, why: reason || null })
              return Object.assign({ ok: true, action, id: pid, registry: 'service' }, out)
            }
            if (kernel.liveMeeting(pid)) {
              return refused('VMU_INVALID_ARGUMENT', 'extendlimit extends the MEETING wall bound, which lives on the meetings SERVICE; ' + pid + ' is a primitive meeting',
                'use action=extend for a SPEECH extension on a primitive meeting (speechExtendMs/Max), or convene the meeting through the pack so it exists in the service (extendWall)')
            }
            throw noSuchMeeting(pid)
          }
          // ★ PHASE 12 D1 · 「未到齐超时，院士自行决定怎么做」的唯一出口。同样只打在 SERVICE 上：
          // 预约/等待状态机住在 `kernel/meetings.js`（服务注册表），原语注册表没有这两个状态。
          if (action === 'proceed') {
            const pid = sid(id)
            if (!pid) return meetingFieldRefusal('proceed')
            const svc = svcOf()
            if (svc && typeof svc.proceed === 'function' && serviceHas(pid)) {
              // ★★★ ROUND 14 (live run 14, finding 6.1): the kernel accepts `member` as a synonym for the chair
              // (`who = actor ?? by ?? member`) and every VMU_NOT_PERMITTED hint SAYS SO — but this face dropped
              // `member` on the floor, so a caller who followed the hint was refused with "needs the chair to name
              // itself" while the hint in the SAME receipt promised the opposite. A face may not advertise an alias
              // it does not forward.
              const out = svc.proceed({ meeting: pid, member: member === undefined ? null : member,
                actor: actor === undefined ? (by || null) : actor, by: by || null, why: reason || why || null })
              return Object.assign({ ok: true, action, id: pid, registry: 'service' }, out)
            }
            if (kernel.liveMeeting(pid)) {
              return refused('VMU_INVALID_ARGUMENT', 'proceed applies to a SCHEDULED/WAITING meeting, which lives on the meetings SERVICE; ' + pid + ' is a primitive meeting',
                'primitive meetings start immediately (they have no scheduled state); use action=open to convene one')
            }
            throw noSuchMeeting(pid)
          }
          if (action === 'lapse') return Object.assign({ ok: true, action, id }, live().lapse({ meeting: need(id, 'id'), by: by || null }))
          if (action === 'revokelapse') {
            return Object.assign({ ok: true, action, id }, live().revokeLapse({ meeting: need(id, 'id'), by: by || null, reason: need(reason, 'reason') }))
          }
          if (action === 'ballot') {
            const bid = ballotId || ('b-' + (kernel.liveList().ballots.length + 1) + '-' + Date.now().toString(36))
            // A1 round 10 — THE ELIGIBLE LIST COMES FROM THE DECLARED VOTER SEATS, not from "everyone" (an empty
            // `eligible` on the primitive means exactly that). The meetings service owns the ONE criterion; this
            // face only asks it. A declared-seat list with nobody seated is a NAMED state, never a silent
            // unrestricted ballot.
            const rule = kernel && kernel.meetings && typeof kernel.meetings.eligibleVoterIds === 'function'
              ? kernel.meetings.eligibleVoterIds() : null
            if (rule && rule.restricted === true && rule.ids.length === 0) {
              return refused('VMU_STATE', 'the declared voter seats have nobody seated, so this ballot would have no eligible voter',
                'seat a member in one of: ' + ((rule.seats || []).join(' / ') || '(none declared)'))
            }
            // ★ G7 ①/③: the ballot constructor takes the TARGET, so `opened.target` is no longer null while the
            // top-level says "mo1"; and the ballot is BOUND to (service meeting, motion) so its casts can be mirrored
            // into the ONE authoritative tally below.
            const motionTarget = need(target, 'target')
            const meetingForBallot = sid(id) && !kernel.liveMeeting(sid(id)) ? sid(id) : null
            const ballot = kernel.ballot(Object.assign({ id: bid, target: String(motionTarget) },
              rule && rule.restricted === true ? { eligible: rule.ids } : {}))
            const opened = await ballot.open()
            if (meetingForBallot) ballotRefs.set(String(bid), { meeting: meetingForBallot, motion: String(motionTarget) })
            return { ok: true, action, ballotId: bid, opened, target: motionTarget,
              meeting: meetingForBallot,
              mergedInto: meetingForBallot ? { meeting: meetingForBallot, motion: String(motionTarget) } : null,
              eligible: rule && rule.restricted === true ? rule.ids : null }
          }
          if (action === 'vote') {
            const hasBallot = !!sid(ballotId)
            const hasServiceMotion = !!sid(id) && !!motion
            // ★ G7 ②: the same action has TWO legal addresses — a ballot id, or (meeting + motion) for a service
            // motion vote — and the refusal names BOTH shapes instead of a bare "ballotId is required".
            if (!hasBallot && !hasServiceMotion) {
              return refused('VMU_INVALID_ARGUMENT', 'action vote needs ballotId, or (meeting + motion) for a service meeting vote',
                'pass ballotId:"<ballot id>", or meeting:"<meeting id>" + motion:"<motion id>"; id/meeting are aliases of the same field')
            }
            // The ballot primitive speaks 1/0 for decisive votes (it says so in its own refusal), but a model
            // reasons in words: normalise the obvious spellings HERE, at the face, and pass anything else
            // through untouched so the primitive still gives the authoritative refusal.
            const raw = need(value, 'value')
            const key = String(raw).trim().toLowerCase()
            const castValue = raw === 1 || raw === 0 ? raw
              : (['1', 'true', 'for', 'yes', '赞成', '同意'].includes(key) ? 1
                : (['0', 'false', 'against', 'no', '反对'].includes(key) ? 0 : raw))
            if (!hasBallot) {
              const svc = svcOf()
              if (!svc || typeof svc.vote !== 'function') {
                return refused('VMU_ENGINE_UNAVAILABLE', 'this kernel has no meetings service to vote in',
                  'assemble a kernel with the meetings service (vibe-math-vmu.js); a ballot vote needs ballotId instead')
              }
              return Object.assign({ ok: true, action, registry: 'service' },
                svc.vote({ meeting: sid(id), member: need(member, 'member'), motion: need(motion, 'motion'), value: castValue === 0 ? 0 : 1 }))
            }
            const cast = await liveBallot().cast(need(member, 'member'), castValue, { kind: kind || 'decisive' })
            // ★ G7 ① — ONE AUTHORITY. A ballot bound to a service motion ALSO writes the service tally (the read path
            // was unified in A2; the WRITE path was still split, so ballot outcome:true and service tally:0 coexisted).
            // A service refusal is carried BY NAME on `serviceVote` rather than being swallowed or pretending success.
            const ref = ballotRefs.get(String(ballotId)) || null
            let serviceVote = null
            if (ref) {
              const svc = svcOf()
              if (svc && typeof svc.vote === 'function') {
                try { serviceVote = Object.assign({ ok: true }, svc.vote({ meeting: ref.meeting, member: need(member, 'member'), motion: ref.motion, value: castValue === 0 ? 0 : 1 })) }
                catch (e) { serviceVote = { ok: false, code: (e && e.code) || 'VMU_STATE', message: String((e && e.message) || e), hint: (e && e.hint) || null } }
              }
            }
            return Object.assign({ ok: true, action, ballotId }, cast, ref ? { serviceVote } : {})
          }
          if (action === 'tally') return Object.assign({ ok: true, action, ballotId }, await liveBallot().close('tally'))
          if (action === 'reopen') {
            const ballot = liveBallot()
            return Object.assign({ ok: true, action, ballotId }, ballot.reopen ? await ballot.reopen(reason || 'reopened') : { reopened: false })
          }
          if (action === 'freeze') return Object.assign({ ok: true, action, ballotId }, await liveBallot().freeze(reason || 'frozen'))
          if (action === 'unfreeze') return Object.assign({ ok: true, action, ballotId }, await liveBallot().unfreeze(reason || 'unfrozen'))
          // GAP-MTG-10: the OPTION-BOARD layer (`kernel/ballotbox.js`) is a different, richer object than the
          // per-ballot primitive above (options, min_votes, secrecy, abstention, and now a life cycle with
          // reopen). These four actions make it REACHABLE from a face instead of service-only.
          if (action === 'boxopen' || action === 'boxcast' || action === 'boxclose' || action === 'boxreopen' || action === 'boxlapse' || action === 'boxrevokelapse') {
            const bb = kernel.ballotbox
            if (!bb) return refused('VMU_ENGINE_UNAVAILABLE', 'the option-board layer (kernel/ballotbox.js) is not mounted in this kernel',
              'declare vmu.ballot.* (or config.meeting) so the face is wired')
            if (action === 'boxopen') {
              return Object.assign({ ok: true, action }, bb.open({ question: need(target, 'target'), options: Array.isArray(options) ? options : need(roster, 'options'), rules: rules && typeof rules === 'object' ? rules : undefined }))
            }
            if (action === 'boxcast') {
              const raw = value === undefined ? undefined : value
              return Object.assign({ ok: true, action }, bb.cast({ boxId: need(ballotId, 'ballotId'), by: need(member, 'member'), choice: raw, abstain: raw === 'abstain' }))
            }
            if (action === 'boxclose') return Object.assign({ ok: true, action }, bb.close({ boxId: need(ballotId, 'ballotId') }))
            // F28 (board half): same bounded fallback, same named/revocable shape (bound declared at construction).
            if (action === 'boxlapse') return Object.assign({ ok: true, action }, bb.lapse({ boxId: need(ballotId, 'ballotId'), by: by || null }))
            if (action === 'boxrevokelapse') {
              return Object.assign({ ok: true, action }, bb.revokeLapse({ boxId: need(ballotId, 'ballotId'), by: by || null, reason: need(reason, 'reason') }))
            }
            return Object.assign({ ok: true, action }, bb.reopen({ boxId: need(ballotId, 'ballotId'), by: by || null, reason: need(reason, 'reason') }))
          }
          // ROUND 14 (task-108) B③/B④: the ORDER/FLOOR face of the `vmu.meetings` SERVICE (kernel/meetings.js). Note
          // the id space: `id` names a SERVICE record (the service's own `live` map), NOT the per-object primitive id
          // handed out by `action:'open'` above; the service refuses an unknown id BY NAME and lists the live ones.
          if (action === 'second' || action === 'withdraw') {
            const svc = kernel && kernel.meetings ? kernel.meetings : null
            if (!svc) return refused('VMU_ENGINE_UNAVAILABLE', 'this kernel has no vmu.meetings service face mounted', 'declare a meeting intent so the service is assembled')
            const args = { meeting: need(id, 'id'), motion: need(motion, 'motion'), member: need(member, 'member') }
            const out = action === 'second' ? svc.second(args) : svc.withdraw(args)
            return Object.assign({ ok: true, action }, out)
          }
          if (action === 'flow' || action === 'overrideorder') {
            const svc = kernel && kernel.meetings ? kernel.meetings : null
            if (!svc) {
              return refused('VMU_ENGINE_UNAVAILABLE', 'this kernel has no `vmu.meetings` service face (kernel/meetings.js) mounted',
                'declare a meeting intent (config.meeting / vmu.meetings.*) so the service is assembled — no service means no order override')
            }
            const args = { meeting: need(id, 'id'), mode: need(mode, 'mode'), by: need(by, 'by'), why: need(reason, 'reason') }
            const out = action === 'flow' ? svc.flow(args) : svc.overrideOrder(args)
            return Object.assign({ ok: true, action }, out)
          }
          // ★ LIVE RUN 12 (the institute's own report, item 2): with `at` in the PAST the office got
          // `VMU_INVALID_ARGUMENT「unknown action: undefined」` from a face it had called WITHOUT an `action`
          // parameter. 'unknown action: undefined' names nothing: it does not say that the CALL omitted the
          // parameter the face dispatches on, and its hint points at a parameter the caller never wrote.
          // A missing action is its own named refusal, and the legal list travels with it.
          if (action === undefined || action === null || String(action).trim() === '') {
            return refused('VMU_INVALID_ARGUMENT', 'this face needs an action; none was given',
              'pass action:"<one of the actions above>" — the legal actions are listed in this tool\'s description and in docs/03; a parameter set without `action` cannot be dispatched')
          }
          // ★ LIVE RUN 118 (F-118b): `action:"motion"` was refused as an unknown action THREE times with a hint that
          // only pointed at the docs. The act exists — on the PACK face `vibe_v5_motion` — so a refusal that does not
          // name the face that owns the act costs the caller a round trip per guess. The nearest face is DERIVED from
          // the registered pack tools (`vibe_v5_<action>`), never from a second hand-kept table.
          {
            const wanted = 'vibe_v5_' + String(action).trim()
            let packHas = false
            try {
              const tools = kernel && typeof kernel.packTools === 'function' ? kernel.packTools() : []
              packHas = (Array.isArray(tools) ? tools : []).some((t) => t && (t.name === wanted || (t.spec && t.spec.name === wanted)))
            } catch { packHas = false }
            if (packHas) {
              return refused('VMU_INVALID_ARGUMENT', 'this face has no action: ' + String(action) + ' — that act has its own PACK face',
                'call `' + wanted + '` (a pack tool) — this face dispatches only on the actions its description lists; the act is not missing, it lives on another face')
            }
            return refused('VMU_INVALID_ARGUMENT', 'unknown action: ' + String(action))
          }
        } catch (e) {
          return refused(e.code || 'VMU_STATE', String(e.message), e.hint, refusalDetails(e))
        }
      },
  }
}

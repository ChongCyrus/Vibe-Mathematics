// vibe-math-vmu/tools/meeting.js — the meeting tool spec, split out of host.js (round 538) so the host file stays
// inside the DECIDED 1200-line limit (docs/02). The spec is a factory: host.js supplies the shared helpers, and the guard
// condition stays in host.js, because which intent declares a tool is policy and policy belongs with the host.
//
// TASK-11 (D-08 baseline A) added the actions the v5r meeting surface had and this face could not reach:
// `hand` (举手), `refuse` (被拒输入不推进轮次), `invite`/`invitedspeak` (受邀临时工：只记、不计票、不阻塞收束),
// `end` (R10-2a 显式结束辩论), `aggregation` (聚合闸), `complete`/`phase` (两阶段派生), `status`/`summary`/`snapshot`,
// and ballot `freeze`/`unfreeze` (表决期冻结). Every one of them calls an existing kernel method: this face adds no policy.
export function makeMeetingSpec({ param, refused, TOOL_NAMES, kernel }) {
  return {
      name: TOOL_NAMES.meeting,
      description: 'vmu 会议/表决面：action=list|open|speak|silent|hand|refuse|invite|invitedspeak|end|aggregation|complete|phase|status|summary|snapshot|close|extend|lapse|revokelapse|ballot|vote|tally|reopen|freeze|unfreeze|boxopen|boxcast|boxclose|boxreopen|boxlapse|boxrevokelapse。' +
        '会议与表决是**逐对象原语**（内核给工厂、pack 给政策）；本工具只用**内核已登记的实例 id** 寻址（未知 id 具名拒）。' +
        '要点：**被拒输入不推进轮次**（refuse）；**受邀发言只记、不计票、不阻塞收束**（invite/invitedspeak）；' +
        '**聚合必须先显式结束辩论**（end ⇒ aggregation.allowed=true，R10-2a）；**表决期冻结**由逐场票箱原语承载（freeze/unfreeze）。' +
        '**F28 有界兜底**：超过声明的墙钟上限（`vmu.meetings.hardLimitMs`）后可用 **lapse** 具名收束（回执带 `{name,why,at,revocable}`），**未到上限会具名拒**，收束后可用 **revokelapse（必须给理由）**恢复；`extend` 是**声明步长**的延长命令（读 `speechExtendMs/Max`）。' +
        '**选项式投票板**是另一层（`kernel/ballotbox.js`：选项/门槛/记名/弃权，**已裁定的板不再收票**）：boxopen/boxcast/boxclose/boxreopen，' +
        '其中 **boxreopen 需理由**且受 `vmu.ballot.reopenFloor` 约束（门槛只升不降）；若构造时声明了 `openMaxMs`，则 **boxlapse/boxrevokelapse** 对它提供同一套有界兜底。',
      parameters: {
        action: param('string', 'list｜open｜speak｜silent｜hand｜hands｜refuse｜invite｜invitedspeak｜end｜aggregation｜complete｜phase｜status｜summary｜snapshot｜close｜extend｜lapse｜revokelapse｜ballot｜vote｜tally｜reopen｜freeze｜unfreeze｜boxopen｜boxcast｜boxclose｜boxreopen｜boxlapse｜boxrevokelapse', { required: true,
          enum: ['list', 'open', 'speak', 'silent', 'hand', 'hands', 'refuse', 'invite', 'invitedspeak', 'end', 'agendaclose', 'agendaitems', 'leaverequest', 'leaveapprove', 'leaverequests', 'aggregation', 'complete', 'phase', 'status', 'summary', 'snapshot', 'close', 'extend', 'lapse', 'revokelapse', 'ballot', 'vote', 'tally', 'reopen', 'freeze', 'unfreeze', 'boxopen', 'boxcast', 'boxclose', 'boxreopen', 'boxlapse', 'boxrevokelapse'] }),
        id: param('string', '会议 id（speak/silent/hand/refuse/invite/invitedspeak/end/aggregation/complete/phase/status/summary/snapshot/close/extend/lapse/revokelapse 必填；open 可指定）'),
        ballotId: param('string', '表决/票箱 id（vote/tally/reopen/freeze/unfreeze/boxcast/boxclose/boxreopen/boxlapse/boxrevokelapse 必填）'),
        member: param('string', '成员 id（speak/silent/hand/refuse/invitedspeak/extend/vote/boxcast 必填）'),
        text: param('string', '发言内容（speak/refuse/invitedspeak 必填）'),
        reason: param('string', 'silent/close/reopen/refuse/end/freeze/unfreeze/boxreopen/**revokelapse/boxrevokelapse** 的原因（end 与两个撤销必填：无理由的结束/撤销正是这条规则要防的静默动作）'),
        ms: param('number', 'extend 的延长毫秒数（缺省读 vmu.meetings.speechExtendMs，仍为 0 ⇒ 具名拒）'),
        agenda: param('string', 'open 的议程文本'),
        roster: param('array', 'open 的成员清单（默认取该会议的既定语料）'),
        options: param('array', 'boxopen 的选项清单（≥2；也可用 roster 传）'),
        target: param('string', 'ballot 的标的（必填）'),
        value: param('string', 'vote 的票值（必填）'),
        kind: param('string', 'vote 的票型（默认 decisive）', { enum: ['decisive', 'advisory'] }),
        // Round 8 (A): the hand-queue management face (chair-only, audited; clear/revoke need a reason).
        op: param('string', 'hands：grant｜revoke｜clear｜list', { enum: ['grant', 'revoke', 'clear', 'list'] }),
        scope: param('string', 'hands clear/revoke 的作用域（all｜round）', { enum: ['all', 'round'] }),
        why: param('string', 'invite 的理由（必填：邀请必须可审计，v5r meeting_invite 的口径）'),
        by: param('string', 'invite/invitedspeak/end 的执行人（审计事实）'),
      },
      run: async ({ action, id, ballotId, member, text, reason, agenda, roster, target, value, kind, why, by, options, ms, op, scope } = {}) => {
        const need = (v, what) => { if (v === undefined || v === null || v === '') throw Object.assign(new Error(what + ' is required'), { code: 'VMU_INVALID_ARGUMENT' }); return v }
        const live = (what) => {
          const meeting = kernel.liveMeeting(need(id, 'id'))
          if (!meeting) throw Object.assign(new Error('no live meeting with id ' + String(id)), { code: 'VMU_NO_SUCH_OBJECT', hint: 'use action=list' })
          return meeting
        }
        const liveBallot = () => {
          const ballot = kernel.liveBallot(need(ballotId, 'ballotId'))
          if (!ballot) throw Object.assign(new Error('no live ballot with id ' + String(ballotId)), { code: 'VMU_NO_SUCH_OBJECT', hint: 'use action=list' })
          return ballot
        }
        try {
          if (action === 'list') return Object.assign({ ok: true, action }, kernel.liveList())
          if (action === 'open') {
            const meeting = kernel.meeting({ id: id || undefined, roster: Array.isArray(roster) ? roster : undefined })
            await meeting.convene(agenda === undefined ? null : agenda)
            await meeting.openRound({ members: Array.isArray(roster) ? roster : null })
            return { ok: true, action, id: meeting.id, state: meeting.state, phase: meeting.phase }
          }
          if (action === 'speak') return Object.assign({ ok: true, action, id }, await live().speak(need(member, 'member'), need(text, 'text')))
          if (action === 'silent') return Object.assign({ ok: true, action, id }, await live().markSilent(need(member, 'member'), reason || 'no input'))
          if (action === 'hand') return Object.assign({ ok: true, action, id }, live().handUp(need(member, 'member')))
          if (action === 'refuse') return Object.assign({ ok: true, action, id }, live().refuseInput(need(member, 'member'), text || '', reason || 'refused'))
          if (action === 'invite') return Object.assign({ ok: true, action, id }, live().invite(need(member, 'member'), { by: by || null, why: need(why, 'why') }))
          if (action === 'invitedspeak') return Object.assign({ ok: true, action, id }, live().speakInvited(need(member, 'member'), need(text, 'text'), { by: by || null }))
          if (action === 'end') return Object.assign({ ok: true, action, id }, live().endDebate({ by: by || null, reason: need(reason, 'reason') }))
          // Round 8 (B①): the agenda is closed, never deleted (target names the item; reason is mandatory).
          if (action === 'agendaclose') {
            return Object.assign({ ok: true, action, id }, live().agendaClose({ id: need(target, 'target'), by: by || null, why: reason || '' }))
          }
          if (action === 'agendaitems') return Object.assign({ ok: true, action, id }, { agendaItems: live().agendaItems() })
          if (action === 'aggregation') return Object.assign({ ok: true, action, id }, live().aggregationAllowed())
          if (action === 'complete') return Object.assign({ ok: true, action, id }, live().roundComplete())
          if (action === 'phase') return { ok: true, action, id: need(id, 'id'), phase: live().phase }
          if (action === 'status') return Object.assign({ ok: true, action }, live().status())
          if (action === 'summary') return Object.assign({ ok: true, action }, live().summary())
          if (action === 'snapshot') return Object.assign({ ok: true, action }, live().snapshot())
          if (action === 'close') return Object.assign({ ok: true, action, id }, await live().close(reason || 'closed'))
          // F28: the bounded fallback (named + revocable) and the declared extension step (GAP-MTG-05).
          if (action === 'hands') {
            return Object.assign({ ok: true, action, id }, live().hands({ op: need(op, 'op'), member: member || null,
              by: by || null, why: reason || '', scope: scope || 'all' }))
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
          if (action === 'lapse') return Object.assign({ ok: true, action, id }, live().lapse({ meeting: need(id, 'id'), by: by || null }))
          if (action === 'revokelapse') {
            return Object.assign({ ok: true, action, id }, live().revokeLapse({ meeting: need(id, 'id'), by: by || null, reason: need(reason, 'reason') }))
          }
          if (action === 'ballot') {
            const bid = ballotId || ('b-' + (kernel.liveList().ballots.length + 1) + '-' + Date.now().toString(36))
            const ballot = kernel.ballot({ id: bid })
            const opened = await ballot.open()
            return { ok: true, action, ballotId: bid, opened, target: need(target, 'target') }
          }
          if (action === 'vote') {
            // The ballot primitive speaks 1/0 for decisive votes (it says so in its own refusal), but a model
            // reasons in words: normalise the obvious spellings HERE, at the face, and pass anything else
            // through untouched so the primitive still gives the authoritative refusal.
            const raw = need(value, 'value')
            const key = String(raw).trim().toLowerCase()
            const castValue = raw === 1 || raw === 0 ? raw
              : (['1', 'true', 'for', 'yes', '赞成', '同意'].includes(key) ? 1
                : (['0', 'false', 'against', 'no', '反对'].includes(key) ? 0 : raw))
            return Object.assign({ ok: true, action, ballotId },
              await liveBallot().cast(need(member, 'member'), castValue, { kind: kind || 'decisive' }))
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
              return Object.assign({ ok: true, action }, bb.open({ question: need(target, 'target'), options: Array.isArray(options) ? options : need(roster, 'options') }))
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
          return refused('VMU_INVALID_ARGUMENT', 'unknown action: ' + String(action))
        } catch (e) {
          return refused(e.code || 'VMU_STATE', String(e.message), e.hint)
        }
      },
  }
}

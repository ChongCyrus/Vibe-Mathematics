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
      description: 'vmu 会议/表决面：action=list|open|speak|silent|hand|refuse|invite|invitedspeak|end|aggregation|complete|phase|status|summary|snapshot|close|extend|lapse|revokelapse|ballot|vote|tally|reopen|freeze|unfreeze|boxopen|boxcast|boxclose|boxreopen|boxlapse|boxrevokelapse|flow|overrideorder。' +
        '会议与表决是**逐对象原语**（内核给工厂、pack 给政策）；本工具只用**内核已登记的实例 id** 寻址（未知 id 具名拒）。' +
        '★ **A2（轮 1）：一个会议对象，两个面都能寻址。** `list` 返回两套注册表：`meetings`（原语）、`serviceMeetings`（`vmu.meetings` 服务，即 `vibe_v5_meeting` 建的那些）、`unionMeetings`（并集）；`status`/`speak`/`close` **先找原语、找不到再找服务**（服务侧的 `status` 带 `registry:"service"` 与动议视图，`speak` 走服务的发言面，`close` 走服务的收束并**进归档**，回执带 `registry` 与 `closeSemantics`）。两处都没有 ⇒ 具名 `VMU_NO_SUCH_OBJECT`，hint **逐条列出两个 id 空间**。' +
        '要点：**被拒输入不推进轮次**（refuse）；**受邀发言只记、不计票、不阻塞收束**（invite/invitedspeak）；' +
        '**聚合必须先显式结束辩论**（end ⇒ aggregation.allowed=true，R10-2a）；**表决期冻结**由逐场票箱原语承载（freeze/unfreeze）。' +
        '**F28 有界兜底**：超过声明的墙钟上限（`vmu.meetings.hardLimitMs`）后可用 **lapse** 具名收束（回执带 `{name,why,at,revocable}`），**未到上限会具名拒**，收束后可用 **revokelapse（必须给理由）**恢复；`extend` 是**声明步长**的延长命令（读 `speechExtendMs/Max`）。' +
        '**选项式投票板**是另一层（`kernel/ballotbox.js`：选项/门槛/记名/弃权，**已裁定的板不再收票**）：boxopen/boxcast/boxclose/boxreopen，' +
        '其中 **boxreopen 需理由**且受 `vmu.ballot.reopenFloor` 约束（门槛只升不降）；若构造时声明了 `openMaxMs`，则 **boxlapse/boxrevokelapse** 对它提供同一套有界兜底。' +
        '**发言序/地面（B③/B④，Round 14）**：`flow` 设**四种地面模式**（open 无队列｜hands 按举手序｜round_robin 按已发言次数｜call_on 主席指定），`overrideorder` **覆盖发言序**（fifo｜round-robin｜chair｜random，random 为**确定性**洗牌：种子与结果 order 都写进回执）。**两者都只由主席做、都必须给 reason**，且**未声明 `vmu.meetings.orderMode` 的部署一律具名拒**（默认不可覆盖）。★ 这两个 action 寻址的是 **`vmu.meetings` 服务记录**（`kernel/meetings.js`），**不是**上面 `open` 造的逐对象会议 id —— 未知 id 由服务**具名拒**（hint 列出在活记录）。',
      parameters: {
        action: param('string', 'list｜open｜speak｜silent｜hand｜hands｜refuse｜invite｜invitedspeak｜end｜aggregation｜complete｜phase｜status｜summary｜snapshot｜close｜extend｜lapse｜revokelapse｜ballot｜vote｜tally｜reopen｜freeze｜unfreeze｜boxopen｜boxcast｜boxclose｜boxreopen｜boxlapse｜boxrevokelapse｜second｜withdraw｜flow｜overrideorder', { required: true,
          enum: ['list', 'open', 'speak', 'silent', 'hand', 'hands', 'refuse', 'invite', 'invitedspeak', 'end', 'agendaclose', 'agendaitems', 'leaverequest', 'leaveapprove', 'leaverequests', 'aggregation', 'complete', 'phase', 'status', 'summary', 'snapshot', 'close', 'extend', 'lapse', 'revokelapse', 'ballot', 'vote', 'tally', 'reopen', 'freeze', 'unfreeze', 'boxopen', 'boxcast', 'boxclose', 'boxreopen', 'boxlapse', 'boxrevokelapse', 'second', 'withdraw', 'flow', 'overrideorder'] }),
        id: param('string', '会议 id（speak/silent/hand/refuse/invite/invitedspeak/end/aggregation/complete/phase/status/summary/snapshot/close/extend/lapse/revokelapse 必填；open 可指定）'),
        ballotId: param('string', '表决/票箱 id（vote/tally/reopen/freeze/unfreeze/boxcast/boxclose/boxreopen/boxlapse/boxrevokelapse 必填）'),
        member: param('string', '成员 id（speak/silent/hand/refuse/invitedspeak/extend/vote/boxcast 必填）'),
        text: param('string', '发言内容（speak/refuse/invitedspeak 必填）'),
        reason: param('string', 'silent/close/reopen/refuse/end/freeze/unfreeze/boxreopen/**revokelapse/boxrevokelapse** 的原因（end 与两个撤销必填：无理由的结束/撤销正是这条规则要防的静默动作）'),
        ms: param('number', 'extend 的延长毫秒数（缺省读 vmu.meetings.speechExtendMs，仍为 0 ⇒ 具名拒）'),
        agenda: param('string', 'open 的议程文本'),
        roster: param('array', 'open 的成员清单（默认取该会议的既定语料）'),
        secretary: param('string', 'open：声明本会议的记录人（记录权；不带来表决权）'),
        motion: param('string', 'second/withdraw：动议 id'),
        rules: param('object', 'boxopen：逐票箱规则 { minVotes, allowRevote, maxChoices, minChoices, mode }'),
        options: param('array', 'boxopen 的选项清单（≥2；也可用 roster 传）'),
        target: param('string', 'ballot 的标的（必填）'),
        value: param('string', 'vote 的票值（必填）'),
        kind: param('string', 'vote 的票型（默认 decisive）', { enum: ['decisive', 'advisory'] }),
        // Round 8 (A): the hand-queue management face (chair-only, audited; clear/revoke need a reason).
        op: param('string', 'hands：grant｜revoke｜clear｜list', { enum: ['grant', 'revoke', 'clear', 'list'] }),
        scope: param('string', 'hands clear/revoke 的作用域（all｜round）', { enum: ['all', 'round'] }),
        why: param('string', 'invite 的理由（必填：邀请必须可审计，v5r meeting_invite 的口径）；flow/overrideorder 也读 reason 作理由（必填）'),
        by: param('string', 'invite/invitedspeak/end 的执行人（审计事实）；flow/overrideorder 必填且必须是该会议的主席'),
        mode: param('string', 'flow/overrideorder 的模式（flow：open｜hands｜round_robin｜call_on；overrideorder：fifo｜round-robin｜chair｜random）', { enum: ['open', 'hands', 'round_robin', 'call_on', 'fifo', 'round-robin', 'chair', 'random'] }),
      },
      run: async ({ action, id, ballotId, member, text, reason, agenda, roster, target, value, kind, why, by, options, ms, op, scope, mode, secretary, motion, rules } = {}) => {
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
              + ' ; action=list reports both',
          })
        const sid = (idv) => String(idv === undefined || idv === null ? '' : idv)
        try {
          if (action === 'list') {
            const prim = kernel.liveList()
            const services = serviceIds()
            const unionMeetings = [...new Set([...(prim.meetings || []), ...services])].sort()
            return Object.assign({ ok: true, action }, prim, { serviceMeetings: services, unionMeetings })
          }
          if (action === 'open') {
            const meeting = kernel.meeting({ id: id || undefined, roster: Array.isArray(roster) ? roster : undefined })
            if (typeof secretary === 'string' && secretary !== '') meeting.secretary = secretary
            await meeting.convene(agenda === undefined ? null : agenda)
            await meeting.openRound({ members: Array.isArray(roster) ? roster : null })
            // ★ PHASE 7: the SERVICE record (which owns motions/resolutions) must learn the SAME id, or a tool-declared
            // secretary could never be honoured by the service's resolution check. Only declared ⇒ this call happens
            // (zero mechanism: no secretary ⇒ no service record created here).
            let serviceMeeting = null
            let serviceError = null
            if (typeof secretary === 'string' && secretary !== '') {
              const svc = kernel && kernel.meetings ? kernel.meetings : null
              if (svc && typeof svc.open === 'function') {
                try { serviceMeeting = svc.open({ id: meeting.id, roster: Array.isArray(roster) ? roster : undefined, secretary }).meeting }
                catch (e) { serviceError = { code: (e && e.code) || 'VMU_ENGINE_UNAVAILABLE', message: String((e && e.message) || e) } }
              } else serviceError = { code: 'VMU_ENGINE_UNAVAILABLE', message: 'kernel.meetings service is not mounted' }
            }
            return { ok: true, action, id: meeting.id, state: meeting.state, phase: meeting.phase, secretary: meeting.secretary || null,
              serviceMeeting, ...(serviceError ? { serviceError } : {}) }
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
          if (action === 'status') {
            const pid = sid(id)
            const primitive = kernel.liveMeeting(pid)
            if (primitive) return Object.assign({ ok: true, action }, primitive.status())
            // A2: the SERVICE view. `meetingView` is the service's own observable read (state/chair/secretary/motions);
            // the quorum view is added when available. `registry:'service'` tells the caller WHICH object answered —
            // the primitive status shape is deliberately left exactly as it was.
            const svc = svcOf()
            if (svc && typeof svc.meetingView === 'function' && serviceHas(pid)) {
              const view = svc.meetingView({ meeting: pid })
              let quorum = null
              if (typeof svc.quorum === 'function') { try { quorum = svc.quorum({ meeting: pid }) } catch (e) { quorum = null } }
              return Object.assign({ ok: true, action, registry: 'service', quorum }, view)
            }
            throw noSuchMeeting(pid)
          }
          if (action === 'summary') {
            // A1 round 10 — TWO ID SPACES, TWO READ FACES. A primitive meeting is summarized by the primitive; a
            // meeting created by the v5 pack lives in the meetings SERVICE and is summarized there. This action
            // used to answer ONLY from the primitive registry, so a service meeting got "no live meeting" even
            // though it existed (measured on a real run: open ok, status/list/summary all "no such meeting").
            const primitive = kernel.liveMeeting(String(id === undefined || id === null ? '' : id))
            if (primitive) return Object.assign({ ok: true, action }, primitive.summary())
            const svc = kernel && kernel.meetings ? kernel.meetings : null
            if (svc && typeof svc.summary === 'function' && id !== undefined && id !== null && String(id) !== '') {
              return Object.assign({ ok: true, action }, svc.summary({ meeting: String(id) }))
            }
            throw Object.assign(new Error('no live meeting with id ' + String(id)), { code: 'VMU_NO_SUCH_OBJECT',
              hint: 'this action reads the meetings SERVICE for a service id (vibe_v5_meeting opens those); action=list lists the primitive registry this face opens' })
          }
          if (action === 'snapshot') return Object.assign({ ok: true, action }, live().snapshot())
          if (action === 'close') {
            const pid = sid(id)
            const primitive = kernel.liveMeeting(pid)
            if (primitive) return Object.assign({ ok: true, action, id }, await primitive.close(reason || 'closed'))
            // A2: closing a SERVICE meeting uses the service's own close (its rails apply). The two close semantics
            // DIFFER and the receipt says so: the service moves the meeting to its ARCHIVE (it leaves the service
            // live table; `summary` stays the archive read face), while a primitive close keeps it in the live map.
            const svc = svcOf()
            if (svc && typeof svc.close === 'function' && serviceHas(pid)) {
              const out = svc.close({ meeting: pid })
              return Object.assign({ ok: true, action, id: pid, registry: 'service', closeSemantics: 'service-archives' }, out, {
                note: 'closed in the meetings SERVICE: the meeting moved to the service ARCHIVE (not the primitive live table); its motions/votes remain readable via action=summary',
              })
            }
            throw noSuchMeeting(pid)
          }
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
            const ballot = kernel.ballot(Object.assign({ id: bid }, rule && rule.restricted === true ? { eligible: rule.ids } : {}))
            const opened = await ballot.open()
            return { ok: true, action, ballotId: bid, opened, target: need(target, 'target'),
              eligible: rule && rule.restricted === true ? rule.ids : null }
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
          return refused('VMU_INVALID_ARGUMENT', 'unknown action: ' + String(action))
        } catch (e) {
          return refused(e.code || 'VMU_STATE', String(e.message), e.hint)
        }
      },
  }
}

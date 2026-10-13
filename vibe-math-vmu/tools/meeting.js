// vibe-math-vmu/tools/meeting.js — the meeting tool spec, split out of host.js (round 538) so the host file stays
// inside the DECIDED 1200-line limit (docs/02). The spec is a factory: host.js supplies the shared helpers, and the guard
// condition stays in host.js, because which intent declares a tool is policy and policy belongs with the host.
export function makeMeetingSpec({ param, refused, TOOL_NAMES, kernel }) {
  return {
      name: TOOL_NAMES.meeting,
      description: 'vmu 会议/表决面：action=list|open|speak|silent|close|ballot|vote|tally|reopen。' +
        '会议与表决是**逐对象原语**（内核给工厂、pack 给政策）；本工具只用**内核已登记的实例 id** 寻址（未知 id 具名拒）。',
      parameters: {
        action: param('string', 'list｜open｜speak｜silent｜close｜ballot｜vote｜tally｜reopen', { required: true,
          enum: ['list', 'open', 'speak', 'silent', 'close', 'ballot', 'vote', 'tally', 'reopen'] }),
        id: param('string', '会议 id（speak/silent/close 必填；open 可指定）'),
        ballotId: param('string', '表决 id（vote/tally/reopen 必填）'),
        member: param('string', '成员 id（speak/silent/vote 必填）'),
        text: param('string', '发言内容（speak 必填）'),
        reason: param('string', 'silent/close/reopen 的原因'),
        agenda: param('string', 'open 的议程文本'),
        roster: param('array', 'open 的成员清单（默认取该会议的既定语料）'),
        target: param('string', 'ballot 的标的（必填）'),
        value: param('string', 'vote 的票值（必填）'),
        kind: param('string', 'vote 的票型（默认 decisive）', { enum: ['decisive', 'advisory'] }),
      },
      run: async ({ action, id, ballotId, member, text, reason, agenda, roster, target, value, kind } = {}) => {
        const need = (v, what) => { if (v === undefined || v === null || v === '') throw Object.assign(new Error(what + ' is required'), { code: 'VMU_INVALID_ARGUMENT' }); return v }
        try {
          if (action === 'list') return Object.assign({ ok: true, action }, kernel.liveList())
          if (action === 'open') {
            const meeting = kernel.meeting({ id: id || undefined, roster: Array.isArray(roster) ? roster : undefined })
            await meeting.convene(agenda === undefined ? null : agenda)
            await meeting.openRound({ members: Array.isArray(roster) ? roster : null })
            return { ok: true, action, id: meeting.id, state: meeting.state }
          }
          if (action === 'speak') {
            const meeting = kernel.liveMeeting(need(id, 'id'))
            if (!meeting) return refused('VMU_NO_SUCH_OBJECT', 'no live meeting with id ' + String(id), 'use action=list')
            return Object.assign({ ok: true, action, id }, await meeting.speak(need(member, 'member'), need(text, 'text')))
          }
          if (action === 'silent') {
            const meeting = kernel.liveMeeting(need(id, 'id'))
            if (!meeting) return refused('VMU_NO_SUCH_OBJECT', 'no live meeting with id ' + String(id), 'use action=list')
            return Object.assign({ ok: true, action, id }, await meeting.markSilent(need(member, 'member'), reason || 'no input'))
          }
          if (action === 'close') {
            const meeting = kernel.liveMeeting(need(id, 'id'))
            if (!meeting) return refused('VMU_NO_SUCH_OBJECT', 'no live meeting with id ' + String(id), 'use action=list')
            return Object.assign({ ok: true, action, id }, await meeting.close(reason || 'closed'))
          }
          if (action === 'ballot') {
            const bid = ballotId || ('b-' + (kernel.liveList().ballots.length + 1) + '-' + Date.now().toString(36))
            const ballot = kernel.ballot({ id: bid })
            const opened = await ballot.open()
            return { ok: true, action, ballotId: bid, opened, target: need(target, 'target') }
          }
          if (action === 'vote') {
            const ballot = kernel.liveBallot(need(ballotId, 'ballotId'))
            if (!ballot) return refused('VMU_NO_SUCH_OBJECT', 'no live ballot with id ' + String(ballotId), 'use action=list')
            // The ballot primitive speaks 1/0 for decisive votes (it says so in its own refusal), but a model
            // reasons in words: normalise the obvious spellings HERE, at the face, and pass anything else
            // through untouched so the primitive still gives the authoritative refusal.
            const raw = need(value, 'value')
            const key = String(raw).trim().toLowerCase()
            const castValue = raw === 1 || raw === 0 ? raw
              : (['1', 'true', 'for', 'yes', '赞成', '同意'].includes(key) ? 1
                : (['0', 'false', 'against', 'no', '反对'].includes(key) ? 0 : raw))
            return Object.assign({ ok: true, action, ballotId },
              await ballot.cast(need(member, 'member'), castValue, { kind: kind || 'decisive' }))
          }
          if (action === 'tally') {
            const ballot = kernel.liveBallot(need(ballotId, 'ballotId'))
            if (!ballot) return refused('VMU_NO_SUCH_OBJECT', 'no live ballot with id ' + String(ballotId), 'use action=list')
            return Object.assign({ ok: true, action, ballotId }, await ballot.close('tally'))
          }
          if (action === 'reopen') {
            const ballot = kernel.liveBallot(need(ballotId, 'ballotId'))
            if (!ballot) return refused('VMU_NO_SUCH_OBJECT', 'no live ballot with id ' + String(ballotId), 'use action=list')
            return Object.assign({ ok: true, action, ballotId }, ballot.reopen ? await ballot.reopen(reason || 'reopened') : { reopened: false })
          }
          return refused('VMU_INVALID_ARGUMENT', 'unknown action: ' + String(action))
        } catch (e) {
          return refused(e.code || 'VMU_STATE', String(e.message), e.hint)
        }
      },
  }
}

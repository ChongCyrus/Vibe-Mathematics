// vibe-math-vmu/tools/chat.js — the group-chat tool spec (task-11 / D-08 baseline B).
//
// The spec is a factory, exactly like tools/meeting.js: host.js supplies the shared helpers and the guard
// condition (which intent declares this face) stays in host.js, because that is policy.
//
// THE FACE ADDS NO POLICY OF ITS OWN. Quota, mute, admins and the freeze gate are all enforced by
// kernel/chat.js and declared in settings; this file only maps arguments onto those calls and turns a named
// kernel refusal into a named tool refusal (never a crash, never a silent success).
export function makeChatSpec({ param, refused, TOOL_NAMES, kernel }) {
  return {
    name: TOOL_NAMES.chat,
    description: 'vmu 群聊面：action=send|list|policy|setpolicy|mute|unmute|quota|admin|status。' +
      '消息含 id／发言人／时间／回复目标（replyTo）；**管理员、发言次数上限（0＝不限）、禁言（可带到期）**' +
      '全部由内核按声明强制、可热改、可审计（改动人 `by` 必填，不记名改动被具名拒）。' +
      '会议表决期禁言由"存在 open 投票板"**派生**（非定时器）；回复目标必须指向仍在账内的消息（悬空具名拒）。',
    parameters: {
      action: param('string', 'send｜list｜policy｜setpolicy｜mute｜unmute｜quota｜admin｜status｜supplement｜supplements｜supplementof', { required: true,
        enum: ['send', 'list', 'policy', 'setpolicy', 'mute', 'unmute', 'quota', 'admin', 'status', 'supplement', 'supplements', 'supplementof'] }),
      member: param('string', '目标成员（mute/unmute/admin 必填；list 可作发言人过滤）'),
      by: param('string', '执行人（mute/unmute/admin/setpolicy/quota/supplement 必填：谁做的必须可审计）'),
      text: param('string', 'send 的正文（必填）'),
      replyTo: param('string', 'send：回复目标消息 id（必须是账内消息，否则 VMU_CHAT_ANCHOR_DANGLING）'),
      quotes: param('array', 'send：引用列表（消息 id 字符串或 {ref,depth}），超上限具名拒'),
      kind: param('string', 'send：消息类别', { enum: ['chat', 'announce'] }),
      reason: param('string', 'mute/unmute/setpolicy/quota 的原因（建议填写，会入审计）'),
      durationMs: param('number', 'mute 的相对时长（毫秒；0＝用 vmu.chat.muteDefaultMs，仍为 0＝无到期）'),
      op: param('string', 'admin：grant｜revoke', { enum: ['grant', 'revoke'] }),
      limit: param('number', 'list 返回条数（默认 50）'),
      quota: param('number', 'quota/setpolicy：发言次数上限（0＝不限）'),
      windowMs: param('number', 'quota：配额窗口毫秒（0＝整场不重置）'),
      admins: param('array', 'setpolicy：管理员名单（整体替换）'),
      speakQuota: param('number', 'setpolicy：同 quota'),
      speakQuotaWindowMs: param('number', 'setpolicy：同 windowMs'),
      muteDefaultMs: param('number', 'setpolicy：默认禁言时长（0＝无到期）'),
      freezeExemptAdmins: param('boolean', 'setpolicy：表决冻结期管理员可否发言（v5r chair-first）'),
      historyCap: param('number', 'setpolicy：审计/消息环形上限（触界计数丢弃）'),
      // G1 (Round 7): the private→public supplement path (v5r's supplement_of + why; body never copied).
      of: param('string', 'supplement/supplementof：被补记的私信 id'),
      why: param('string', 'supplement：补记理由（必填：无理由的补记正是这条规则要防的泄露）'),
      publicRef: param('string', 'supplement：公开面引用锚（可选）'),
    },
    run: async ({ action, member, by, text, replyTo, quotes, kind, reason, durationMs, op, limit,
      quota, windowMs, admins, speakQuota, speakQuotaWindowMs, muteDefaultMs, freezeExemptAdmins, historyCap,
      of, why, publicRef } = {}) => {
      const need = (v, what) => { if (v === undefined || v === null || v === '') throw Object.assign(new Error(what + ' is required'), { code: 'VMU_INVALID_ARGUMENT' }); return v }
      try {
        const chat = kernel.chat
        if (!chat) return refused('VMU_ENGINE_UNAVAILABLE', 'the chat primitive is not mounted in this kernel',
          'declare vmu.chat.* (or config.chat) so the face is wired')
        if (action === 'send') {
          return Object.assign({ ok: true, action }, chat.send(need(by, 'by'), need(text, 'text'),
            { replyTo: replyTo === undefined ? null : replyTo, quotes: Array.isArray(quotes) ? quotes : [], kind: kind || 'chat' }))
        }
        if (action === 'list') {
          return Object.assign({ ok: true, action }, chat.list({ limit: limit === undefined ? 50 : limit,
            member: member === undefined ? null : member }))
        }
        if (action === 'policy') return Object.assign({ ok: true, action }, chat.policy())
        if (action === 'status') return Object.assign({ ok: true, action }, chat.status())
        // G1 (Round 7): the private→public supplement path — reachable from the face, not kernel-only.
        if (action === 'supplement') {
          return Object.assign({ ok: true, action }, chat.supplement({ of: need(of, 'of'), by: need(by, 'by'), why: need(why, 'why'), publicRef: publicRef === undefined ? null : publicRef }))
        }
        if (action === 'supplements') return Object.assign({ ok: true, action }, { supplements: chat.supplements() })
        if (action === 'supplementof') return Object.assign({ ok: true, action }, chat.supplementOf(need(of, 'of')))
        if (action === 'mute') {
          return Object.assign({ ok: true, action }, chat.mute(need(member, 'member'),
            { durationMs: durationMs === undefined ? null : durationMs, reason: reason || '', by: need(by, 'by'), source: 'member' }))
        }
        if (action === 'unmute') {
          return Object.assign({ ok: true, action }, chat.unmute(need(member, 'member'), { reason: reason || '', by: need(by, 'by'), source: 'member' }))
        }
        if (action === 'quota') {
          const q = quota === undefined ? speakQuota : quota
          return Object.assign({ ok: true, action }, chat.setQuota(need(q, 'quota'),
            { windowMs: windowMs === undefined ? null : windowMs, by: need(by, 'by'), reason: reason || '', source: 'member' }))
        }
        if (action === 'admin') {
          const who = need(member, 'member')
          const actor = need(by, 'by')
          if (op === 'revoke') return Object.assign({ ok: true, action }, chat.revokeAdmin(who, { by: actor, source: 'member' }))
          return Object.assign({ ok: true, action }, chat.grantAdmin(who, { by: actor, source: 'member' }))
        }
        if (action === 'setpolicy') {
          const patch = {}
          if (admins !== undefined) patch.admins = admins
          if (speakQuota !== undefined) patch.speakQuota = speakQuota
          if (quota !== undefined) patch.speakQuota = quota
          if (speakQuotaWindowMs !== undefined) patch.speakQuotaWindowMs = speakQuotaWindowMs
          if (windowMs !== undefined) patch.speakQuotaWindowMs = windowMs
          if (muteDefaultMs !== undefined) patch.muteDefaultMs = muteDefaultMs
          if (freezeExemptAdmins !== undefined) patch.freezeExemptAdmins = freezeExemptAdmins
          if (historyCap !== undefined) patch.historyCap = historyCap
          if (!Object.keys(patch).length) return refused('VMU_INVALID_ARGUMENT', 'setpolicy needs at least one policy key',
            'one of admins/speakQuota/speakQuotaWindowMs/muteDefaultMs/freezeExemptAdmins/historyCap')
          return Object.assign({ ok: true, action }, chat.setPolicy(patch,
            { by: need(by, 'by'), reason: reason || '', source: 'member' }))
        }
        return refused('VMU_INVALID_ARGUMENT', 'unknown action: ' + String(action))
      } catch (e) {
        // D3: a refusal keeps its evaluated scope across the face boundary too — dropping `enforced[]` here is
        // exactly what made the kernel's refusals look like "read nothing" to the consistency audit.
        return refused(e.code || 'VMU_STATE', String(e.message), e.hint,
          { enforced: Array.isArray(e.enforced) ? e.enforced.slice() : [], enforcedScope: e.enforcedScope || 'evaluated-so-far' })
      }
    },
  }
}

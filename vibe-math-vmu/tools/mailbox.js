// vibe-math-vmu/tools/mailbox.js — the durable-mail tool spec (task-11 / D-08 baseline B).
//
// Four behaviours this face must never get wrong (they are the v5r invariants, ported):
//   · `send` queues ONE entry per recipient (a group message is N entries with N ids);
//   · `flush` delivers and ONLY THEN acknowledges — a refused/failed transport acks nothing and the receipt
//     says how much is still pending;
//   · `anchor` refuses a delivered/unknown id BY NAME (the body is dropped at ack, so quoting it would
//     fabricate evidence);
//   · `plan` wakes urgent mail first within a declared budget, and NAMES the deferred members with a reason.
export function makeMailboxSpec({ param, refused, TOOL_NAMES, kernel }) {
  return {
    name: TOOL_NAMES.mailbox,
    description: 'vmu 私发/信箱面：action=send|pending|flush|ack|list|open|setState|plan|anchor|unread|status。' +
      '每封有 id/subject；**非紧急投递只给提示（count/发件人/标题，≤300 字），正文不进提示词**，成员用 list 看行、open 打开正文；' +
      '**ack 是投递层结算，不等于读过**（read 由 open/setState 改）；紧急只有发送方显式 urgent:true 才带正文；' +
      'ack 后正文不再保留；注入去重；唤醒受 `vmu.mailbox.wakeBudget` 约束且未唤醒者具名列出。',
    parameters: {
      action: param('string', 'send｜pending｜flush｜ack｜list｜open｜setState｜plan｜anchor｜unread｜status', { required: true,
        enum: ['send', 'pending', 'flush', 'ack', 'list', 'open', 'setState', 'plan', 'anchor', 'unread', 'status'] }),
      from: param('string', 'send：发件人（必填）'),
      to: param('string', 'send：收件人 id／"all"／"voters"（all/voters 需要注入的名单接缝）'),
      text: param('string', 'send：正文（必填）'),
      subject: param('string', 'send：标题（可选；缺省取正文首行，超长截断并标记）'),
      urgent: param('boolean', 'send：发送方显式声明“希望对方尽快回复”（默认 false；只有 true 才带正文投递）'),
      kind: param('string', 'send：类别；只有 vmu.mailbox.urgentKinds 声明过的 kind 才自动紧急（默认空）'),
      replyTo: param('string', 'send：回复目标（必须是仍在待投递中的消息 id，否则悬空具名拒）'),
      member: param('string', 'pending/flush/ack/list/open/setState/plan/unread 的收件人 id'),
      ids: param('array', 'ack：要确认的条目 id 列表'),
      id: param('string', 'open/setState/anchor：条目 id'),
      read: param('boolean', 'setState：已读状态'),
      todo: param('boolean', 'setState：待办状态'),
      status: param('string', 'list：unread｜todo｜all', { enum: ['unread', 'todo', 'all'] }),
      members: param('array', 'plan：要考虑的成员名单（默认取信箱里出现过的成员）'),
      budget: param('number', 'plan：本轮最多唤醒几人（默认 vmu.mailbox.wakeBudget）'),
      freshOnly: param('boolean', 'pending：只返回本次提示尚未注入过的条目'),
    },
    run: async ({ action, from, to, text, kind, replyTo, member, ids, members, budget, freshOnly, id, subject, urgent, read, todo, status } = {}) => {
      const need = (v, what) => { if (v === undefined || v === null || v === '') throw Object.assign(new Error(what + ' is required'), { code: 'VMU_INVALID_ARGUMENT' }); return v }
      try {
        const mb = kernel.mailbox
        if (!mb) return refused('VMU_ENGINE_UNAVAILABLE', 'the mailbox primitive is not mounted in this kernel',
          'declare vmu.mailbox.* (or config.mailbox) so the face is wired')
        if (action === 'send') {
          return Object.assign({ ok: true, action }, mb.send(need(from, 'from'),
            { to: to === undefined ? null : to, text: need(text, 'text'), kind: kind || 'dm', replyTo: replyTo === undefined ? null : replyTo,
              subject: subject === undefined ? null : subject, urgent: urgent === true }))
        }
        if (action === 'pending') {
          return Object.assign({ ok: true, action }, { member: member === undefined ? null : member,
            entries: mb.pending(need(member, 'member'), { freshOnly: freshOnly === true }) })
        }
        if (action === 'flush') return Object.assign({ ok: true, action }, await mb.flush(need(member, 'member')))
        if (action === 'ack') return Object.assign({ ok: true, action }, mb.ack(need(member, 'member'), need(ids, 'ids')))
        if (action === 'list') return Object.assign({ ok: true, action }, mb.list(need(member, 'member'), { status: status || 'all' }))
        if (action === 'open') return Object.assign({ ok: true, action }, mb.open(need(member, 'member'), need(id, 'id')))
        if (action === 'setState') return Object.assign({ ok: true, action }, mb.setState(need(member, 'member'), { id: need(id, 'id'), read, todo }))
        if (action === 'plan') return Object.assign({ ok: true, action }, mb.plan({ members: Array.isArray(members) ? members : null, budget: budget === undefined ? null : budget }))
        if (action === 'anchor') return Object.assign({ ok: true, action }, { entry: mb.anchor(need(id, 'id')) })
        if (action === 'unread') return Object.assign({ ok: true, action }, mb.unread(member === undefined ? null : member))
        if (action === 'status') return Object.assign({ ok: true, action }, mb.status())
        return refused('VMU_INVALID_ARGUMENT', 'unknown action: ' + String(action))
      } catch (e) {
        // D3: the evaluated scope survives the face boundary (see tools/chat.js for the same discipline).
        const actionHint = e.hint || (action === 'list'
          ? 'list needs member:"<id>" (optional status: unread|todo|all); it returns rows WITHOUT bodies'
          : action === 'open'
            ? 'open needs member:"<id>" and id:"<ml-N>"; it returns the body and sets read:true'
            : action === 'setState'
              ? 'setState needs member:"<id>", id:"<ml-N>" and read:boolean and/or todo:boolean; it never removes the body'
              : null)
        return refused(e.code || 'VMU_STATE', String(e.message), actionHint,
          { enforced: Array.isArray(e.enforced) ? e.enforced.slice() : [], enforcedScope: e.enforcedScope || 'evaluated-so-far' })
      }
    },
  }
}

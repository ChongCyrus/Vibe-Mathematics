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
    description: 'vmu 私发/信箱面：action=send|pending|flush|ack|plan|anchor|unread|status。' +
      '每条消息**逐收件人一份**（各有 id）；**ack 只发生在投递成功之后**（失败则全部保持待投递、可重投）；' +
      '**ack 后正文不再保留**，指向它的引用锚**具名拒**；注入去重（每提示一次）；urgent（dm/office/assign/nudge/notice/meeting/verify）' +
      '立即投递，其余按 digest 窗口/条数合批；唤醒受 `vmu.mailbox.wakeBudget` 约束且未唤醒者**具名列出**。',
    parameters: {
      action: param('string', 'send｜pending｜flush｜ack｜plan｜anchor｜unread｜status', { required: true,
        enum: ['send', 'pending', 'flush', 'ack', 'plan', 'anchor', 'unread', 'status'] }),
      from: param('string', 'send：发件人（必填）'),
      to: param('string', 'send：收件人 id／"all"／"voters"（all/voters 需要注入的名单接缝）'),
      text: param('string', 'send：正文（必填）'),
      kind: param('string', 'send：类别（决定 urgent 与否），如 dm/office/assign/nudge/notice/meeting/verify/chat'),
      replyTo: param('string', 'send：回复目标（必须是**仍在待投递**中的消息 id，否则悬空具名拒）'),
      member: param('string', 'pending/flush/ack/plan/unread 的收件人 id'),
      ids: param('array', 'ack：要确认的条目 id 列表'),
      members: param('array', 'plan：要考虑的成员名单（默认取信箱里出现过的成员）'),
      budget: param('number', 'plan：本轮最多唤醒几人（默认 vmu.mailbox.wakeBudget）'),
      freshOnly: param('boolean', 'pending：只返回本次提示尚未注入过的条目'),
      id: param('string', 'anchor：要解析的消息 id'),
    },
    run: async ({ action, from, to, text, kind, replyTo, member, ids, members, budget, freshOnly, id } = {}) => {
      const need = (v, what) => { if (v === undefined || v === null || v === '') throw Object.assign(new Error(what + ' is required'), { code: 'VMU_INVALID_ARGUMENT' }); return v }
      try {
        const mb = kernel.mailbox
        if (!mb) return refused('VMU_ENGINE_UNAVAILABLE', 'the mailbox primitive is not mounted in this kernel',
          'declare vmu.mailbox.* (or config.mailbox) so the face is wired')
        if (action === 'send') {
          return Object.assign({ ok: true, action }, mb.send(need(from, 'from'),
            { to: to === undefined ? null : to, text: need(text, 'text'), kind: kind || 'dm', replyTo: replyTo === undefined ? null : replyTo }))
        }
        if (action === 'pending') {
          return Object.assign({ ok: true, action }, { member: member === undefined ? null : member,
            entries: mb.pending(need(member, 'member'), { freshOnly: freshOnly === true }) })
        }
        if (action === 'flush') return Object.assign({ ok: true, action }, await mb.flush(need(member, 'member')))
        if (action === 'ack') return Object.assign({ ok: true, action }, mb.ack(need(member, 'member'), need(ids, 'ids')))
        if (action === 'plan') return Object.assign({ ok: true, action }, mb.plan({ members: Array.isArray(members) ? members : null, budget: budget === undefined ? null : budget }))
        if (action === 'anchor') return Object.assign({ ok: true, action }, { entry: mb.anchor(need(id, 'id')) })
        if (action === 'unread') return Object.assign({ ok: true, action }, mb.unread(member === undefined ? null : member))
        if (action === 'status') return Object.assign({ ok: true, action }, mb.status())
        return refused('VMU_INVALID_ARGUMENT', 'unknown action: ' + String(action))
      } catch (e) {
        // D3: the evaluated scope survives the face boundary (see tools/chat.js for the same discipline).
        return refused(e.code || 'VMU_STATE', String(e.message), e.hint,
          { enforced: Array.isArray(e.enforced) ? e.enforced.slice() : [], enforcedScope: e.enforcedScope || 'evaluated-so-far' })
      }
    },
  }
}
